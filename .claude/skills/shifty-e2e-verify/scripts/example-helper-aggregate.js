// P3.6（ヘルプ先勤務の所属店舗への合算）の実ブラウザ回帰テスト。
// ShiftEditTab だけをマウントし、他店舗のデータはスタブ Firebase（stub-firebase.js）から返す。
// 実ネットワーク・dev の Firebase へは1バイトも出ない（SKILL.md 1.6節）。
// セッションは店長（uid は企業コードのログインではない・allLinkedShops は空）で、同一人物は写し（companyLink.people）から引く。
//
// 測るもの（所属店舗 A・1か月の期間 ／ 行き先 B（三ビル）・半月の期間2つ）:
//  (a) 所属店舗のグリッドに他店の勤務日が読み取り専用セル「→三17」「23」で出る（data-helper・readOnly）
//  (b) 月実働・週の休み・期間別勤務時間の月計・laborTotals（savePeriods に渡る凍結値）が合算後の値
//      （休憩は行き先の店の設定＝19:00〜19:30 を引いた実働。期間の切り方が違っても日付で拾う）
//  (c) 同じ名前でも人物（personId）が別の佐藤は合算されない
//  (d) PDF のシフト表にも同じ読み取り専用セルが出る
//  (e) 行き先の店 B では田中の総括が「所属店舗で判定」で、B の laborTotals に田中が入らない
//  (f) 他店舗を読み終える前に合算前の laborTotals を書かない（savePeriods に渡った値をすべて見る）
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-helper-aggregate.js → allPass=true / EXIT=0
// 反証: SHIFTY_ROOT=<P3.6 より前の配信物> node ... → EXIT=1
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
const w = (s, e) => ({ status: "work", start: s, end: e });
const BRK0 = { weekday: [], sat: [], sun: [], holSat: [], holSun: [] };
const base = (sid, extra) => Object.assign({ shopId: sid, candidates: [{ start: "09:00", end: "23:00" }], weekdayCandidates: {}, dateCandidates: {},
  breakTimes: BRK0, staffAttributes: { "田中": "parttime", "佐藤": "parttime", "山田": "parttime" }, staffTypeLimits: {}, staffColors: {}, staffAliases: {},
  positions: { kitchen: [], hall: [] }, requiredPositions: {}, staffPositions: {} }, extra || {});

// 行き先 B（三ビル）: 田中（所属 A）が 10/5 17-23・10/20 17-21。佐藤は B の別人（人物が別）で 10/6 17-22
const B_SETTINGS = base("B", { staffHomeShop: { "田中": "A" }, shopAbbrs: ["三"],
  breakTimes: { weekday: [{ start: "19:00", end: "19:30" }], sat: [], sun: [], holSat: [], holSun: [] } });
const B_PERIODS = { b1: { id: "b1", startDate: "2026-10-01", endDate: "2026-10-15", label: "10月前半" }, b2: { id: "b2", startDate: "2026-10-16", endDate: "2026-10-31", label: "10月後半" } };
const B_SUBS = {
  x1: { id: "x1", periodId: "b1", staffName: "田中", shopId: "B", shifts: { "2026-10-05": w("17:00", "23:00") } },
  x2: { id: "x2", periodId: "b2", staffName: "田中", shopId: "B", shifts: { "2026-10-20": w("17:00", "21:00") } },
  x3: { id: "x3", periodId: "b1", staffName: "佐藤", shopId: "B", shifts: { "2026-10-06": w("17:00", "22:00") } },
};
// 所属 A: 1か月の期間。田中・佐藤とも 10/1 10-15
const A_SETTINGS = base("A");
const A_PERIOD = { id: "pa", urlToken: "ta", shopId: "A", label: "10月", startDate: "2026-10-01", endDate: "2026-10-31", deadlineDate: "", createdAt: "2026-09-01T00:00:00.000Z" };
const A_SUBS = {
  a1: { id: "a1", periodId: "pa", staffName: "田中", shopId: "A", comment: "", submittedAt: "2026-09-02T00:00:00.000Z", shifts: { "2026-10-01": w("10:00", "15:00") } },
  a2: { id: "a2", periodId: "pa", staffName: "佐藤", shopId: "A", comment: "", submittedAt: "2026-09-02T00:00:00.000Z", shifts: { "2026-10-01": w("10:00", "15:00") } },
};
const SEED = { shops: {
  A: { staff: ["田中", "佐藤", "山田"], settings: A_SETTINGS, subs: A_SUBS, periods: { pa: A_PERIOD } },
  B: { staff: ["田中", "佐藤"], settings: B_SETTINGS, subs: B_SUBS, periods: B_PERIODS },
}, global: { shops: { A: { name: "A店" }, B: { name: "三ビル" } } } };
// 写しは CF と同じ buildShopMirror（functions/company-config.js）で作る。佐藤は店舗ごとに別の人物
const cfc = require(path.join(__dirname, "..", "..", "..", "..", "functions", "company-config.js"));
const PUB = { name: "テスト企業", shops: { A: true, B: true },
  people: { "1042": { links: { A: "田中", B: "田中" } }, "p_AAAAAAAA": { links: { A: "佐藤" } }, "p_BBBBBBBB": { links: { B: "佐藤" } } } };
const LINK = (sid) => cfc.buildShopMirror("C1", PUB, sid, { A: "A店", B: "三ビル" }, "t");

async function mount(sid, pdf) {
  const own = sid === "A" ? { P: A_PERIOD, subs: Object.values(A_SUBS), settings: A_SETTINGS, staff: ["田中", "佐藤", "山田"], periods: [A_PERIOD] }
    : { P: B_PERIODS.b1, subs: Object.values(B_SUBS), settings: B_SETTINGS, staff: ["田中", "佐藤"], periods: [B_PERIODS.b2, B_PERIODS.b1] };
  const h = await openHarness({
    root: ROOT, extraHead: THEME + (pdf ? PDF_LIBS : "") + makeStub({ seed: SEED, uid: "u_manager" }), waitFor: "[data-scn]",
    jsx: `
firebaseDB = firebase.database();
window.__saved=[];
const PERIODS=${JSON.stringify(own.periods)};const SUBS=${JSON.stringify(own.subs)};const SETTINGS=${JSON.stringify(own.settings)};
function Harness(){
  const [subs,setSubs]=React.useState(SUBS);
  return <ShiftEditTab subs={subs} periods={PERIODS} staffList={${JSON.stringify(own.staff)}}
    onSave={v=>setSubs(p=>typeof v==="function"?v(p):v)} tt={()=>{}} initialPeriodId=${JSON.stringify(own.P.id)}
    settings={SETTINGS} plan="premium" shopId=${JSON.stringify(sid)} shopName=${JSON.stringify(sid === "A" ? "A店" : "三ビル")} onUpgrade={()=>{}}
    allLinkedShops={[]} companyLink={${JSON.stringify(LINK(sid))}}
    savePeriods={ps=>window.__saved.push(JSON.parse(JSON.stringify(ps)))} ownerReadOnly={false} pastSubsLoaded={true}/>;
}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);`,
  });
  await sleep(1500);
  return h;
}
const readScreen = (h, pid) => h.evaluate((pid) => {
  const cell = (n, d, f) => { const el = document.querySelector(`[data-sc="${d}|${f}"][data-scn="${n}"]`); return el ? { v: el.value, ro: el.readOnly, helper: el.getAttribute("data-helper"), title: el.title } : null; };
  const table = head => {
    const wrap = [...document.querySelectorAll("div")].find(d => (d.innerText || "").startsWith(head));
    if (!wrap) return null;
    const rows = {};
    [...wrap.querySelectorAll("tbody tr")].forEach(tr => { const tds = [...tr.querySelectorAll("td")].map(td => td.innerText.trim()); rows[tds[0]] = tds.slice(1); });
    return rows;
  };
  const allRows = {};
  document.querySelectorAll("tr").forEach(tr => { const tds = [...tr.querySelectorAll("td")].map(td => td.innerText.trim()); if (tds.length > 1 && tds[0] === "月計") allRows["月計"] = tds.slice(1); });
  const last = (window.__saved || []).slice(-1)[0] || null;
  const p = last ? last.find(x => x && x.id === pid) : null;
  return {
    t5s: cell("田中", "2026-10-05", "start"), t5e: cell("田中", "2026-10-05", "end"), s6s: cell("佐藤", "2026-10-06", "start"),
    labor: table("労務判定（2026年10月）"), weekRest: table("週の休み"), monthTotal: allRows["月計"] || null,
    laborTotals: p ? (p.laborTotals || {}) : null, saves: (window.__saved || []).length,
    // 書かれた凍結値すべての田中の値（他店舗を読み終える前の値＝合算前で書かないこと）
    allTanaka: (window.__saved || []).map(ps => { const q = ps.find(x => x && x.id === pid); return q && q.laborTotals ? (q.laborTotals["田中"] ? q.laborTotals["田中"].workMin || 0 : "none") : "noTotals"; }),
  };
}, pid);

(async () => {
  // 所属店舗 A
  const hA = await mount("A", true);
  const a = await readScreen(hA, "pa");
  const pdf = await hA.capturePdf();
  await hA.clickExact("PDF出力");
  await hA.clickExact("シフト");
  await sleep(6000);
  a.pdf = await hA.evaluate(() => {
    const html = (window.__pdf ? window.__pdf.blocks : []).join("");
    const d = document.createElement("div"); d.innerHTML = html;
    return [...d.querySelectorAll("[data-helper]")].map(td => td.innerText.trim());
  });
  void pdf;
  a.errors = hA.errors.slice();
  await hA.close();
  // 行き先 B
  const hB = await mount("B", false);
  const b = await readScreen(hB, "b1");
  b.errors = hB.errors.slice();
  await hB.close();

  const col = (rows, key, i) => rows && rows[key] ? rows[key][i] : undefined;
  const wrKey = a.weekRest ? Object.keys(a.weekRest).find(k => k.startsWith("5〜")) : null;
  const v = {
    a_helperStart: !!a.t5s && a.t5s.v === "→三17" && a.t5s.ro === true && a.t5s.helper === "1" && /三ビルで勤務 17:00〜23:00（実働 5:30）/.test(a.t5s.title),
    a_helperEnd: !!a.t5e && a.t5e.v === "23" && a.t5e.ro === true,
    a_sameNameNotMerged: !!a.s6s && a.s6s.v === "" && a.s6s.helper === null,
    // 田中: 10/1 5:00 + 10/5（17-23・休憩30分）5:30 + 10/20（17-21・休憩30分）3:30 = 14:00
    a_monthWork: col(a.labor, "月実働", 0) === "14:00",
    a_monthWorkSato: col(a.labor, "月実働", 1) === "5:00",
    a_weekRest: !!wrKey && col(a.weekRest, wrKey, 0) === "休6" && col(a.weekRest, wrKey, 1) === "休7",
    a_monthTotal: !!a.monthTotal && a.monthTotal[0] === "14" && a.monthTotal[1] === "5",
    a_laborTotals: !!a.laborTotals && a.laborTotals["田中"] && a.laborTotals["田中"].workMin === 840 && a.laborTotals["佐藤"].workMin === 300,
    a_noEarlyTotals: a.allTanaka.every(x => x === 840 || x === "noTotals"),
    b_noEarlyTotals: b.allTanaka.every(x => x === "none" || x === "noTotals"),
    a_pdfHelperCells: a.pdf.includes("→三17") && a.pdf.includes("23"),
    b_verdictDest: col(b.labor, "総括", 0) === "所属店舗で判定",
    b_laborTotalsExcludesTanaka: !!b.laborTotals && !("田中" in b.laborTotals) && !!b.laborTotals["佐藤"],
    b_noHelperCells: !!b.t5s && b.t5s.helper === null && b.t5s.v === "17",
    noErrors: a.errors.length === 0 && b.errors.length === 0,
  };
  v.allPass = Object.values(v).every(Boolean);
  console.log(JSON.stringify({ a, b, verdict: v }, null, 2));
  process.exit(v.allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
