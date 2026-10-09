// P5（割増の計算）の実ブラウザ回帰テスト。ShiftEditTab だけをマウントする（SKILL.md 1.6節）。
// 他店の実績の場面だけスタブ Firebase（stub-firebase.js）を使う。実ネットワーク・dev の Firebase へは1バイトも出ない。
//
// 測るもの（期待値は手計算。コメントに式を書いた）:
//  (1) オーナーの端末（実績あり）・2026年11月の1か月期間
//      田中（社員＝A制）: 11/2 予定 9-18（実働8h）→ 実績の退勤 22:00 で実働12h ／ 11/4 13-17＋締23-25 ／ 11/9〜15 毎日 9-18
//        ① 11/2 = 720 − max(480,480) = 240。週(11/2〜8) Σ(実働−①) = 480+360 = 840 ≦ 2400 → ②0
//        法定休日: 11/9〜15 に休日が無い → 最後の勤務日 11/15（480分）を法定休日労働にし、①②③から外す
//        ③: 月の実働 720+360+3360 = 4440 − 法定休日480 − ①240 = 3720 ≦ 総枠 10285 → 0
//        → 時間外 4:00・深夜 2:00（締 23:00〜25:00）・法定休日 8:00・60h超なし
//      鈴木（バイト＝B制）: 11/2〜7 毎日 9-19（休憩1h・実働9h）
//        ① 60×6 = 360、② Σ(実働−①) = 480×6 = 2880 − 2400 = 480 → 14:00。残業予定 14h（トグルはオフ）
//        36協定の月の上限を 10h にしてある → 「月の残業が上限超」（B制にも出る）＝総括 要修正
//      凍結値（savePeriods に渡る laborTotals）: 鈴木 monthOtH 14・monthAgH 14、田中 monthAgH (240+480)/60 = 12
//      労務確認パネル・全データPDF にも同じ内容（日付つき）が出る
//  (2) 実績を読めない端末（actuals 無し）: 田中の 11/2 は予定の 8h なので時間外は出ない。title に「確定シフトで計算」
//  (3) 他店の実績（P3.6 の申し送り）: 所属店舗 A の田中が行き先 B（確定済みの期間）で 10/5 17-23 に勤務
//      (3a) B の actuals を読めない（店長のセッション）→ 深夜は予定の 22-23 = 1:00 に「＋」と「他店の実績を読み込めていません」
//      (3b) 読める（行き先のオーナー）＋B の実績の退勤 24:00 → 深夜 22-24 = 2:00（「＋」なし）
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-labor-premium.js → allPass=true / EXIT=0
// 反証: SHIFTY_ROOT=<P5 より前の配信物> node ... → EXIT=1
"use strict";
const path = require("node:path");
const { openHarness } = require(path.join(__dirname, "mount-component.js"));
const { makeStub } = require(path.join(__dirname, "stub-firebase.js"));
const ROOT = process.env.SHIFTY_ROOT || undefined;
const THEME = `<style>:root{--c-bg:#F0F2F5;--c-card:#FFFFFF;--c-input:#F3F4F6;--c-input2:#F0F2F5;` +
  `--c-border:#E5E7EB;--c-border2:#D1D5DB;--c-text:#1A1A2E;--c-text2:#374151;--c-text3:#6B7280;` +
  `--c-text4:#9CA3AF;--c-shadow:rgba(0,0,0,.06);--c-accent:#f87036;--c-danger:#DC2626;}</style>`;
const PDF_LIBS = `<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js" integrity="sha384-ZZ1pncU3bQe8y31yfZdMFdSpttDoPmOZg2wguVK9almUodir1PghgT0eY7Mrty8H" crossorigin="anonymous"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js" integrity="sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk" crossorigin="anonymous"></script>`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const w = (s, e, x) => Object.assign({ status: "work", start: s, end: e }, x || {});
const B12 = [{ start: "12:00", end: "13:00" }];

// ---- (1)(2) 自店だけ ----
const P = { id: "p", urlToken: "t", shopId: "S1", label: "11月", startDate: "2026-11-01", endDate: "2026-11-30", deadlineDate: "", createdAt: "2026-09-01T00:00:00.000Z" };
const tanaka = { "2026-11-02": w("09:00", "18:00"), "2026-11-04": w("13:00", "17:00", { extraStart: "23:00", extraEnd: "25:00" }) };
["09", "10", "11", "12", "13", "14", "15"].forEach(d => { tanaka[`2026-11-${d}`] = w("09:00", "18:00"); });
const suzuki = {};
["02", "03", "04", "05", "06", "07"].forEach(d => { suzuki[`2026-11-${d}`] = w("09:00", "19:00"); });
const SUBS = [
  { id: "s1", periodId: "p", staffName: "田中", shopId: "S1", comment: "", submittedAt: "2026-09-02T00:00:00.000Z", shifts: tanaka },
  { id: "s2", periodId: "p", staffName: "鈴木", shopId: "S1", comment: "", submittedAt: "2026-09-02T00:00:00.000Z", shifts: suzuki },
];
const SETTINGS = { shopId: "S1", candidates: [{ start: "09:00", end: "23:00" }], weekdayCandidates: {}, dateCandidates: {},
  breakTimes: { weekday: B12, sat: B12, sun: B12, holSat: B12, holSun: B12 },
  laborSettings: { agreementMonthlyOtMin: 600 },
  staffAttributes: { 田中: "employee", 鈴木: "parttime" }, staffTypeLimits: { employee: { name: "社員" }, parttime: { name: "バイト" } },
  staffColors: {}, staffAliases: {}, positions: { kitchen: [], hall: [] }, requiredPositions: {}, staffPositions: {} };
const ACT_MAP = { p: { 田中: { "2026-11-02": { end: "22:00" } } } };

async function mountOwn(withActuals) {
  const h = await openHarness({ root: ROOT, extraHead: THEME + PDF_LIBS, waitFor: "select", jsx: `
window.__saved=[];
const ACT=${withActuals ? `{enabled:true,loaded:true,map:${JSON.stringify(ACT_MAP)},save:()=>Promise.resolve(),rename:()=>{},drop:()=>{},csvMapping:null,saveCsvMapping:null}` : "undefined"};
function Harness(){
  const [subs,setSubs]=React.useState(${JSON.stringify(SUBS)});
  return <ShiftEditTab subs={subs} periods={[${JSON.stringify(P)}]} staffList={["田中","鈴木"]}
    onSave={v=>setSubs(p=>typeof v==="function"?v(p):v)} tt={()=>{}}
    settings={${JSON.stringify(SETTINGS)}} plan="premium" shopId="S1" shopName="テスト店" onUpgrade={()=>{}}
    savePeriods={ps=>window.__saved.push(JSON.parse(JSON.stringify(ps)))} ownerReadOnly={false} pastSubsLoaded={true}
    {...(ACT?{actuals:ACT}:{})}/>;
}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);` });
  await sleep(1000);
  return h;
}
// 労務判定の表を {行ラベル: {名前: {v,t}}} で読む
const readLabor = h => h.evaluate(() => {
  const wrap = [...document.querySelectorAll("div")].find(d => /^労務判定（\d{4}年\d{1,2}月）/.test(d.innerText || ""));
  if (!wrap) return null;
  const head = [...wrap.querySelectorAll("thead th")].map(x => x.innerText.replace(/\s/g, ""));
  const out = {};
  [...wrap.querySelectorAll("tbody tr")].forEach(tr => {
    const td = [...tr.querySelectorAll("td")];
    const r = {};
    td.slice(1).forEach((c, i) => { r[head[i + 1]] = { v: c.innerText.trim(), t: c.getAttribute("title") || "" }; });
    out[td[0].innerText.trim()] = r;
  });
  return out;
});
const readPanel = h => h.evaluate(() => {
  // 見出しの div の親がパネル全体（見出し＋人ごとの行）
  const el = [...document.querySelectorAll("div")].filter(d => (d.innerText || "").trim() === "⚠ 労務の確認が必要です").pop();
  return el && el.parentElement ? el.parentElement.innerText.replace(/\s+/g, " ") : "";
});

// ---- (3) 他店の実績 ----
const BRK_B = { weekday: [{ start: "19:00", end: "19:30" }], sat: [{ start: "19:00", end: "19:30" }], sun: [{ start: "19:00", end: "19:30" }], holSat: [], holSun: [] };
const base = (sid, extra) => Object.assign({ shopId: sid, candidates: [{ start: "09:00", end: "23:00" }], weekdayCandidates: {}, dateCandidates: {},
  breakTimes: { weekday: [], sat: [], sun: [], holSat: [], holSun: [] }, staffAttributes: { 田中: "parttime" }, staffTypeLimits: {}, staffColors: {}, staffAliases: {},
  positions: { kitchen: [], hall: [] }, requiredPositions: {}, staffPositions: {} }, extra || {});
const B_SETTINGS = base("B", { staffHomeShop: { 田中: "A" }, shopAbbrs: ["三"], breakTimes: BRK_B });
const B_PERIODS = { b1: { id: "b1", startDate: "2026-10-01", endDate: "2026-10-15", label: "10月前半", confirmation: { at: "2026-10-16T00:00:00.000Z", byUid: "u" } },
  b2: { id: "b2", startDate: "2026-10-16", endDate: "2026-10-31", label: "10月後半" } };
const B_SUBS = { x1: { id: "x1", periodId: "b1", staffName: "田中", shopId: "B", shifts: { "2026-10-05": w("17:00", "23:00") } } };
const A_SETTINGS = base("A");
const A_PERIOD = { id: "pa", urlToken: "ta", shopId: "A", label: "10月", startDate: "2026-10-01", endDate: "2026-10-31", deadlineDate: "", createdAt: "2026-09-01T00:00:00.000Z" };
const A_SUBS = { a1: { id: "a1", periodId: "pa", staffName: "田中", shopId: "A", comment: "", submittedAt: "2026-09-02T00:00:00.000Z", shifts: { "2026-10-01": w("10:00", "15:00") } } };
const cfc = require(path.join(__dirname, "..", "..", "..", "..", "functions", "company-config.js"));
const PUB = { name: "テスト企業", shops: { A: true, B: true }, people: { "1042": { links: { A: "田中", B: "田中" } } } };
const LINK = cfc.buildShopMirror("C1", PUB, "A", { A: "A店", B: "三ビル" }, "t");

async function mountHelper(readable) {
  const seed = { shops: {
    A: { staff: ["田中"], settings: A_SETTINGS, subs: A_SUBS, periods: { pa: A_PERIOD } },
    B: { staff: ["田中"], settings: B_SETTINGS, subs: B_SUBS, periods: B_PERIODS,
      ...(readable ? { actuals: { b1: { 田中: { "2026-10-05": { end: "24:00" } } } } } : {}) },
  }, global: { shops: { A: { name: "A店" }, B: { name: "三ビル" } } } };
  const h = await openHarness({ root: ROOT, extraHead: THEME + makeStub({ seed, uid: "u_manager", denyRead: readable ? [] : ["shops/B/actuals"] }), waitFor: "select", jsx: `
firebaseDB = firebase.database();
window.__saved=[];
function Harness(){
  const [subs,setSubs]=React.useState(${JSON.stringify(Object.values(A_SUBS))});
  return <ShiftEditTab subs={subs} periods={[${JSON.stringify(A_PERIOD)}]} staffList={["田中"]}
    onSave={v=>setSubs(p=>typeof v==="function"?v(p):v)} tt={()=>{}} initialPeriodId="pa"
    settings={${JSON.stringify(A_SETTINGS)}} plan="premium" shopId="A" shopName="A店" onUpgrade={()=>{}}
    allLinkedShops={[]} companyLink={${JSON.stringify(LINK)}}
    savePeriods={ps=>window.__saved.push(JSON.parse(JSON.stringify(ps)))} ownerReadOnly={false} pastSubsLoaded={true}/>;
}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);` });
  await sleep(1500);
  return h;
}

(async () => {
  // (1) 実績あり
  const h1 = await mountOwn(true);
  const L1 = await readLabor(h1);
  const panel1 = await readPanel(h1);
  const saved1 = await h1.evaluate(() => { const s = (window.__saved || []).slice(-1)[0]; return s ? (s.find(x => x.id === "p") || {}).laborTotals || null : null; });
  await h1.evaluate(() => {
    const Orig = window.jspdf.jsPDF;
    window.jspdf.jsPDF = function (...a) { const d = new Orig(...a); d.save = () => { window.__pdfSaved = true; }; return d; };
  });
  await h1.capturePdf();
  await h1.clickExact("PDF出力");
  await h1.clickExact("全データ");
  await h1.page.waitForFunction(() => window.__pdfSaved === true, null, { timeout: 30000 }).catch(() => {});
  const blocks = await h1.evaluate(() => (window.__pdf ? window.__pdf.blocks : []));
  const plain = b => b.replace(/<[^>]*>/g, "").replace(/\s+/g, "");
  const pdfLabor = plain(blocks.find(b => plain(b).startsWith("労務判定")) || "");
  const pdfFind = plain(blocks.find(b => plain(b).startsWith("労務の確認が必要です")) || "");
  const e1 = h1.errors.slice();
  await h1.close();
  // (2) 実績を読めない端末
  const h2 = await mountOwn(false);
  const L2 = await readLabor(h2);
  const e2 = h2.errors.slice();
  await h2.close();
  // (3a)(3b) 他店の実績
  const h3a = await mountHelper(false);
  const L3a = await readLabor(h3a);
  const e3a = h3a.errors.slice();
  const reads3a = await h3a.evaluate(() => window.__reads || []);
  await h3a.close();
  const h3b = await mountHelper(true);
  const L3b = await readLabor(h3b);
  const e3b = h3b.errors.slice();
  await h3b.close();

  const g = (L, row, name) => (L && L[row] && L[row][name]) || { v: null, t: "" };
  const v = {
    table: !!L1,
    a_ot: g(L1, "時間外①②③", "田中").v === "4:00" && /①日 4:00／②週 0:00／③月 0:00/.test(g(L1, "時間外①②③", "田中").t),
    a_night: g(L1, "深夜", "田中").v === "2:00" && /4日/.test(g(L1, "深夜", "田中").t),
    a_legal: g(L1, "法定休日", "田中").v === "8:00" && /15日/.test(g(L1, "法定休日", "田中").t) && /休日が1日も無い週の最後の勤務日/.test(g(L1, "法定休日", "田中").t),
    a_over60Blank: g(L1, "60h超", "田中").v === "",
    a_basisActual: /実績（入力の無い日は確定シフト）で計算/.test(g(L1, "時間外①②③", "田中").t),
    b_ot: g(L1, "時間外①②③", "鈴木").v === "14:00" && /①日8時間超 6:00／②週40時間超 8:00/.test(g(L1, "時間外①②③", "鈴木").t),
    b_planRow: g(L1, "残業予定", "鈴木").v === "14h" && /1日8時間超 6:00・週40時間超 8:00/.test(g(L1, "残業予定", "鈴木").t),
    // 2026-10-10: 月の残業が上限超は画面の欄に出さず、総括の要修正にも数えない（B制で8h超があるので「残業あり」）
    b_agreementMonth: !/月の残業が上限超/.test(panel1) && g(L1, "総括", "鈴木").v === "残業あり",
    // 2026-10-10: 日の時間外は画面の欄に出さない（PDF には出る）
    panelDates: !/日の時間外/.test(panel1) && !/深夜/.test(panel1) && /法定休日労働1日（15）/.test(panel1)
      && !/週の時間外/.test(panel1),
    frozen: !!saved1 && saved1["鈴木"] && saved1["鈴木"].monthOtH === 14 && saved1["鈴木"].monthAgH === 14
      && saved1["田中"] && saved1["田中"].monthAgH === 12 && saved1["田中"].monthOtH === undefined,
    pdfRows: /時間外①②③4:0014:00/.test(pdfLabor) && /深夜2:00/.test(pdfLabor) && /法定休日8:00/.test(pdfLabor),
    pdfFindings: /法定休日労働1日（15）/.test(pdfFind) && !/深夜\d+日/.test(pdfFind),
    noActual_noOt: g(L2, "時間外①②③", "田中").v === "" && g(L2, "法定休日", "田中").v === "8:00"
      && /この端末は実績を読めないため確定シフトで計算/.test(g(L2, "時間外①②③", "鈴木").t),
    helperUnread: g(L3a, "深夜", "田中").v === "＋1:00" && /他店の実績を読み込めていません/.test(g(L3a, "深夜", "田中").t)
      && g(L3a, "時間外①②③", "田中").v === "＋0:00",
    helperReadTried: reads3a.includes("shops/B/actuals"),
    helperRead: g(L3b, "深夜", "田中").v === "2:00" && !/他店の実績を読み込めていません/.test(g(L3b, "深夜", "田中").t),
    noErrors: [...e1, ...e2, ...e3a, ...e3b].length === 0,
  };
  v.allPass = Object.values(v).every(Boolean);
  console.log(JSON.stringify({ L1, panel1, saved1, pdfLabor: pdfLabor.slice(0, 600), pdfFind, L2: L2 && { t: L2["時間外①②③"], l: L2["法定休日"] },
    L3a: L3a && { n: L3a["深夜"], o: L3a["時間外①②③"] }, L3b: L3b && { n: L3b["深夜"] }, errors: [...e1, ...e2, ...e3a, ...e3b], verdict: v }, null, 2));
  process.exit(v.allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
