// P3.5d（PDF の日付ヘッダに昼・夜の人数）の実ブラウザ回帰テスト。
// app-main.js を読み込まないので Firebase へは1バイトも出ない（SKILL.md 1.6節）。
//   PDF: 曜日の下に「昼n 夜n」。x（応援・カウント外）の帯を除外・0人の側は出さない・店休日は曜日だけ
//   画面（シフト作成タブ）と Excel には出ない
//   設定オフ（既定）の店舗は PDF にも出ない
//   キッチンとホールを分けている店舗（スタッフ一覧に区切りがある）は、左の曜日列にキッチン「K昼n 夜n」、右の曜日列に
//   ホール「H昼n 夜n」（2026-10-02 ユーザー指示）。分けていない店舗は従来どおり左右とも合計
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-pdf-headcount.js → allPass=true / EXIT=0
// 反証: SHIFTY_ROOT=<P3.5d より前の配信物> node ... → EXIT≠0
"use strict";
const path = require("node:path");
const { openHarness } = require(path.join(__dirname, "mount-component.js"));
const ROOT = process.env.SHIFTY_ROOT || undefined;
const EXTRA_HEAD = `<style>:root{--c-bg:#F0F2F5;--c-card:#FFFFFF;--c-input:#F3F4F6;--c-input2:#F0F2F5;` +
  `--c-border:#E5E7EB;--c-border2:#D1D5DB;--c-text:#1A1A2E;--c-text2:#374151;--c-text3:#6B7280;` +
  `--c-text4:#9CA3AF;--c-shadow:rgba(0,0,0,.06);--c-accent:#f87036;--c-danger:#DC2626;}</style>
<script src="https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js" integrity="sha384-Pqp51FUN2/qzfxZxBCtF0stpc9ONI6MYZpVqmo8m20SoaQCzf+arZvACkLkirlPz" crossorigin="anonymous"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js" integrity="sha384-ZZ1pncU3bQe8y31yfZdMFdSpttDoPmOZg2wguVK9almUodir1PghgT0eY7Mrty8H" crossorigin="anonymous"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js" integrity="sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk" crossorigin="anonymous"></script>`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const P = { id: "p1", urlToken: "t1", shopId: "S1", label: "10月前半", startDate: "2026-10-01", endDate: "2026-10-03", deadlineDate: "", createdAt: "2026-09-01T00:00:00.000Z" };
const w = (s, e, x = {}) => ({ status: "work", start: s, end: e, ...x });
// 10/1（木）: 田中 10-15・佐藤 11-22・高橋 11x-22（昼は x で除外）・鈴木 18-23 → 12:00 は2人・19:00 は3人
// 10/2（金）: 田中 12-15（出勤＝確認時刻は数える）・渡辺 10-12（退勤＝確認時刻は数えない）・鈴木 18-23 → 昼1 夜1
// 10/3（土）: 店休日（日付別候補 closed）に鈴木 18-23 → 曜日だけ
const SUBS = [
  { id: "a", periodId: "p1", staffName: "田中", shopId: "S1", comment: "", submittedAt: "2026-09-02T00:00:00.000Z", shifts: { "2026-10-01": w("10:00", "15:00"), "2026-10-02": w("12:00", "15:00") } },
  { id: "b", periodId: "p1", staffName: "佐藤", shopId: "S1", comment: "", submittedAt: "2026-09-02T00:00:00.000Z", shifts: { "2026-10-01": w("11:00", "22:00") } },
  { id: "c", periodId: "p1", staffName: "高橋", shopId: "S1", comment: "", submittedAt: "2026-09-02T00:00:00.000Z", shifts: { "2026-10-01": w("11:00", "22:00", { startNote: "x" }) } },
  { id: "d", periodId: "p1", staffName: "鈴木", shopId: "S1", comment: "", submittedAt: "2026-09-02T00:00:00.000Z", shifts: { "2026-10-01": w("18:00", "23:00"), "2026-10-02": w("18:00", "23:00"), "2026-10-03": w("18:00", "23:00") } },
  { id: "e", periodId: "p1", staffName: "渡辺", shopId: "S1", comment: "", submittedAt: "2026-09-02T00:00:00.000Z", shifts: { "2026-10-02": w("10:00", "12:00") } },
];
const STAFF = ["田中", "佐藤", "高橋", "鈴木", "渡辺"];

async function run(enabled, staff) {
  const SETTINGS = { shopId: "S1", candidates: [{ start: "10:00", end: "23:00" }], weekdayCandidates: {},
    dateCandidates: { "2026-10-03": [{ closed: true }] }, breakTimes: { weekday: [], sat: [], sun: [], holSat: [], holSun: [] },
    headcountAt: enabled ? { enabled: true, lunch: "12:00", dinner: "19:00" } : {},
    staffAttributes: {}, staffTypeLimits: {}, staffColors: {}, staffAliases: {}, positions: { kitchen: [], hall: [] }, requiredPositions: {}, staffPositions: {} };
  const h = await openHarness({ root: ROOT, extraHead: EXTRA_HEAD, waitFor: "[data-scn]", jsx: `
const P=${JSON.stringify(P)};const SUBS=${JSON.stringify(SUBS)};const SETTINGS=${JSON.stringify(SETTINGS)};
function Harness(){const [subs,setSubs]=React.useState(SUBS);
  return <ShiftEditTab subs={subs} periods={[P]} staffList={${JSON.stringify(staff || STAFF)}} onSave={v=>setSubs(p=>typeof v==="function"?v(p):v)} tt={()=>{}}
    settings={SETTINGS} plan="premium" shopId="S1" shopName="テスト店" onUpgrade={()=>{}} allLinkedShops={[]}
    onLoadPastSubs={()=>{}} pastSubsLoaded={true} savePeriods={()=>{}} ownerReadOnly={false}/>;}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);` });
  await sleep(600);
  const m = {};
  // 「深夜3日」（割増の計算・P5 の労務確認パネル）は人数ではないので外す
  m.screenHas = await h.evaluate(() => /昼\d|(?<!深)夜\d/.test(document.body.innerText) || !!document.querySelector("[data-headcount]"));
  // Excel（シフト作成タブの Excel出力）
  const dl = await h.captureDownloads();
  await h.clickExact("Excel出力");
  m.excel = await h.evaluate(async () => {
    await new Promise(r => setTimeout(r, 1500));
    if (!window.__dl.blobs.length) return { error: "blob not captured" };
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await window.__dl.blobs[window.__dl.blobs.length - 1].arrayBuffer());
    const vals = [];
    wb.worksheets.forEach(ws => ws.eachRow({ includeEmpty: false }, r => r.eachCell(c => vals.push(String(c.value == null ? "" : (c.value.richText ? c.value.richText.map(t => t.text).join("") : c.value))))));
    return { cells: vals.length, hasHeadcount: vals.some(v => /昼\d|夜\d/.test(v)) };
  });
  await dl.restore();
  // PDF（シフトのみ）
  const pdf = await h.capturePdf();
  await h.clickExact("PDF出力");
  await h.clickExact("シフト");
  await sleep(6000);
  m.pdf = await h.evaluate(() => {
    const html = (window.__pdf ? window.__pdf.blocks : []).join("");
    const d = document.createElement("div"); d.innerHTML = html;
    return { blocks: (window.__pdf || { blocks: [] }).blocks.length, hc: [...d.querySelectorAll("[data-headcount]")].map(td => td.getAttribute("data-headcount")),
      // 行ごとの曜日セル（左・右）。人数の無い側は data-headcount が付かないので、曜日の列の位置で読む
      rows: [...d.querySelectorAll("tbody tr")].map(tr => [...tr.children].filter((td, i, a) => i === 1 || i === a.length - 2).map(td => td.getAttribute("data-headcount") || "")) };
  });
  m.errors = h.errors.slice();
  await h.close();
  return m;
}

async function setTab() {
  const h = await openHarness({ root: ROOT, extraHead: EXTRA_HEAD.split("<script")[0], waitFor: "#root > *", jsx: `
    function Harness(){
      const [settings,setSettings]=React.useState({shopId:"s1",candidates:[],staffAttributes:{},staffTypeLimits:{employee:{name:"社員"},parttime:{name:"バイト"}}});
      window.__settings=settings;
      return <SetTab settings={settings} onSave={s=>setSettings(s)} onSaveOwn={s=>setSettings(s)} subs={[]} saveSubs={()=>{}}
        tt={()=>{}} syncStatus="online" plan="premium" shopId="s1"/>;
    }
    ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);` });
  const m = {};
  m.offByDefault = await h.evaluate(() => { const c = document.querySelector("[data-headcount-card] input[type=checkbox]"); return c ? !c.checked : null; });
  await h.evaluate(() => document.querySelector("[data-headcount-card] input[type=checkbox]").click()); await sleep(300);
  const setSel = (k, v) => h.evaluate(([k, v]) => { const s = document.querySelector(`[data-headcount-at="${k}"]`);
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(s, v); s.dispatchEvent(new Event("change", { bubbles: true })); }, [k, v]);
  await setSel("lunch", "12:00"); await sleep(200);
  await setSel("dinner", "19:00"); await sleep(200);
  m.saved = await h.evaluate(() => window.__settings.headcountAt);
  m.fontsizes = await h.evaluate(() => [...document.querySelectorAll("[data-headcount-at]")].map(e => parseFloat(getComputedStyle(e).fontSize)));
  m.errors = h.errors.slice();
  await h.close();
  return m;
}

(async () => {
  const on = await run(true);
  const off = await run(false);
  // 田中・佐藤＝キッチン｜高橋・鈴木・渡辺＝ホール。10/1 12:00 キッチン2（田中・佐藤）ホール0（高橋は x）／19:00 キッチン1（佐藤）ホール2（高橋・鈴木）
  // 10/2 12:00 キッチン1（田中）／19:00 ホール1（鈴木）。10/3 は店休日
  const split = await run(true, ["田中", "佐藤", "__spacer__1", "高橋", "鈴木", "渡辺"]);
  const splitDays = [...new Set(split.pdf.rows.filter(r => r.some(Boolean)).map(r => r.join("/")))];
  const st = await setTab();
  // PDF の曜日セルは左右2列 × 上下2段なので、1日につき4セルに同じ data-headcount が付く
  const uniq = [...new Set(on.pdf.hc)];
  const v = {
    pdfHasCounts: uniq.join("|") === ["昼2 夜3", "昼1 夜1"].join("|"),
    pdfCellsPerDay: on.pdf.hc.filter(x => x === "昼2 夜3").length === 4 && on.pdf.hc.filter(x => x === "昼1 夜1").length === 4,
    closedDayWeekdayOnly: !on.pdf.hc.some(x => /夜1$/.test(x) && x !== "昼1 夜1"),
    screenHasNone: on.screenHas === false,
    excelHasNone: !!on.excel && on.excel.cells > 0 && on.excel.hasHeadcount === false,
    offPdfHasNone: off.pdf.blocks > 0 && off.pdf.hc.length === 0,
    setOffByDefault: st.offByDefault === true,
    setSaved: !!(st.saved && st.saved.enabled === true && st.saved.lunch === "12:00" && st.saved.dinner === "19:00"),
    font16: st.fontsizes.length === 2 && st.fontsizes.every(f => f >= 16),
    splitLeftKitchenRightHall: JSON.stringify(splitDays) === JSON.stringify(["K昼2 夜1/H夜2", "K昼1/H夜1"]),
    splitCellsPerDay: split.pdf.hc.filter(x => x === "K昼2 夜1").length === 2 && split.pdf.hc.filter(x => x === "H夜2").length === 2,
    noErrors: on.errors.length === 0 && off.errors.length === 0 && st.errors.length === 0 && split.errors.length === 0,
  };
  v.allPass = Object.values(v).every(Boolean);
  console.log(JSON.stringify({ on, off, split: { hc: split.pdf.hc, days: splitDays, errors: split.errors }, setTab: st, verdict: v }, null, 2));
  process.exit(v.allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
