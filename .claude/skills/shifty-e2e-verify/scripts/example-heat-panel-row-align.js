// シフト作成タブの左右のヒートマップ（キッチン／ホールのパネル）の行が、グリッドの日付の行と横に揃っているかの回帰テスト。
// 2026-10-09 本番で「ヒートマップとセルの日付が横並びに揃っていない」と報告（10月後半・ヘルプ勤務のある店舗）。
//
// 再現の条件: ヘルプ勤務の自動表示の切り替え（名前の見出しの下の「ヘ」）は、他店舗のデータを読み終えてから出る。
// その分グリッドの見出しが高くなるのに、ヒートマップの見出しの高さ（measuredTheadH）を測り直さないと、
// 全行が見出しの差だけずれる。
//
// 測るもの（1400x900・ShiftEditTab を幅800pxの枠に入れて左右にパネルを出す）:
//  - 各日付について、グリッドの日付セルとヒートマップの日付セルの上端と下端の差（1px 以内）
//  - スクロールの前と、グリッドを縦に300px スクロールした後
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-heat-panel-row-align.js → allPass=true / EXIT=0
// 実ネットワーク・dev の Firebase へは1バイトも出ない（他店舗はスタブ）。
"use strict";
const path = require("node:path");
const { openHarness } = require(path.join(__dirname, "mount-component.js"));
const { makeStub } = require(path.join(__dirname, "stub-firebase.js"));
const ROOT = process.env.SHIFTY_ROOT || undefined;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const w = (s, e) => ({ status: "work", start: s, end: e });
const BRK0 = { weekday: [], sat: [], sun: [], holSat: [], holSun: [] };
const base = (sid, extra) => Object.assign({ shopId: sid, candidates: [{ start: "09:00", end: "23:00" }], weekdayCandidates: {}, dateCandidates: {},
  breakTimes: BRK0, staffAttributes: {}, staffTypeLimits: {}, staffColors: {}, staffAliases: {},
  positions: { kitchen: [], hall: [] }, requiredPositions: {}, staffPositions: {} }, extra || {});
const STAFF = ["田中", "佐藤", "__spacer__1", "山田", "鈴木"];
const B_SETTINGS = base("B", { staffHomeShop: { "田中": "A" }, shopAbbrs: ["鶏三"], shopAbbr2: { top: "鶏", bottom: "三" } });
const B_PERIODS = { b2: { id: "b2", startDate: "2026-10-16", endDate: "2026-10-31", label: "10月後半" } };
const B_SUBS = { x1: { id: "x1", periodId: "b2", staffName: "田中", shopId: "B", shifts: { "2026-10-20": w("17:00", "23:00") } } };
const A_SETTINGS = base("A");
const A_PERIOD = { id: "pa", urlToken: "ta", shopId: "A", label: "10月後半", startDate: "2026-10-16", endDate: "2026-10-31", deadlineDate: "", createdAt: "2026-09-01T00:00:00.000Z" };
const A_SUBS = {
  a1: { id: "a1", periodId: "pa", staffName: "田中", shopId: "A", comment: "", submittedAt: "2026-09-02T00:00:00.000Z", shifts: { "2026-10-17": w("10:00", "15:00") } },
  a2: { id: "a2", periodId: "pa", staffName: "山田", shopId: "A", comment: "", submittedAt: "2026-09-02T00:00:00.000Z", shifts: { "2026-10-18": w("17:00", "23:00") } },
};
const SEED = { shops: {
  A: { staff: STAFF, settings: A_SETTINGS, subs: A_SUBS, periods: { pa: A_PERIOD } },
  B: { staff: ["田中"], settings: B_SETTINGS, subs: B_SUBS, periods: B_PERIODS },
}, global: { shops: { A: { name: "A店" }, B: { name: "鷄えん3ビル" } } } };
const cfc = require(path.join(__dirname, "..", "..", "..", "..", "functions", "company-config.js"));
const PUB = { name: "テスト企業", shops: { A: true, B: true }, people: { "1042": { links: { A: "田中", B: "田中" } } } };
const LINK = cfc.buildShopMirror("C1", PUB, "A", { A: "A店", B: "鷄えん3ビル" }, "t");

const MEASURE = () => {
  const main = [...document.querySelectorAll("table")].find(t => t.querySelector("input[data-sc]"));
  const gridRows = {};
  main.querySelectorAll("tbody td[rowspan='2']").forEach(td => {
    const r1 = td.getBoundingClientRect();
    gridRows[td.textContent.trim()] = { top: r1.top, bottom: r1.bottom };
  });
  const heats = [...document.querySelectorAll("table")].filter(t => t !== main && /キッチン|ホール/.test((t.querySelector("thead th") || {}).textContent || "") && t.closest("[style*='max-height']"));
  const res = heats.map(t => {
    const diffs = [];
    t.querySelectorAll("tbody tr").forEach(tr => {
      const td = tr.querySelector("td"); const k = td.textContent.trim(); const g = gridRows[k]; if (!g) return;
      const r = td.getBoundingClientRect();
      // 見えている行だけ比べる（スクロール領域の外は意味がない）
      const box = t.closest("[style*='max-height']").getBoundingClientRect();
      if (r.bottom < box.top + 60 || r.top > box.bottom) return;
      diffs.push({ k, dTop: Math.round((r.top - g.top) * 10) / 10, dBottom: Math.round((r.bottom - g.bottom) * 10) / 10 });
    });
    return { head: t.querySelector("thead th").textContent.trim(), maxAbs: Math.max(0, ...diffs.map(d => Math.max(Math.abs(d.dTop), Math.abs(d.dBottom)))), n: diffs.length, sample: diffs.slice(0, 3) };
  });
  return { toggles: document.querySelectorAll("[data-helper-toggle]").length, panels: res,
    gridThead: Math.round(main.querySelector("thead").getBoundingClientRect().height) };
};

(async () => {
  const h = await openHarness({
    root: ROOT, viewport: { width: 1400, height: 900 }, extraHead: makeStub({ seed: SEED, uid: "u_manager" }), waitFor: "[data-scn]",
    jsx: `
firebaseDB = firebase.database();
const SUBS=${JSON.stringify(Object.values(A_SUBS))};const SETTINGS=${JSON.stringify(A_SETTINGS)};
function Harness(){
  const [periods,setPeriods]=React.useState(${JSON.stringify([A_PERIOD])});
  return <div style={{maxWidth:800,margin:"0 auto"}}><ShiftEditTab subs={SUBS} periods={periods} staffList={${JSON.stringify(STAFF)}}
    onSave={()=>{}} tt={()=>{}} initialPeriodId="pa"
    settings={SETTINGS} plan="premium" shopId="A" shopName="A店" onUpgrade={()=>{}}
    allLinkedShops={[]} companyLink={${JSON.stringify(LINK)}}
    savePeriods={ps=>setPeriods(ps)} ownerReadOnly={false} pastSubsLoaded={true}/></div>;
}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);`,
  });
  const out = {};
  try {
    await sleep(2000);
    out.atTop = await h.evaluate(MEASURE);
    await h.evaluate(() => {
      const main = [...document.querySelectorAll("table")].find(t => t.querySelector("input[data-sc]")).parentElement;
      main.scrollTop = 300; main.dispatchEvent(new Event("scroll"));
    });
    await sleep(500);
    out.scrolled = await h.evaluate(MEASURE);
    const ok = m => m.panels.length === 2 && m.panels.every(p => p.n > 3 && p.maxAbs <= 1);
    out.verdict = { helperToggleShown: out.atTop.toggles > 0, alignedAtTop: ok(out.atTop), alignedScrolled: ok(out.scrolled) };
    out.verdict.allPass = Object.values(out.verdict).every(Boolean);
    out.errors = h.errors;
  } finally { await h.close(); }
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.verdict && out.verdict.allPass && !(out.errors || []).length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
