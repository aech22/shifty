// ヘルプ先だけの日（他店でのヘルプ勤務の自動表示・読み取り専用）のセルで、変更マークをトリプルクリック／トリプルタップで
// 付け外しできることの実ブラウザ回帰テスト（2026-10-10 本番で「ヘルプ表示のセルの変更マークが3タップしても外れない」と報告）。
// ShiftEditTab だけをマウントし、他店舗のデータはスタブ Firebase から返す（example-helper-toggle.js と同じ店舗・同じ田中）。
// 実ネットワーク・dev の Firebase へは1バイトも出ない（SKILL.md 1.6節）。
//
// 測るもの:
//  (a) 10/9（自店は休みの提出に changed:true・ヘルプ先 11〜15）は合成表示（data-helper）・読み取り専用・変更マークの緑
//  (b) トリプルクリックで緑が消え、subs の changed が消える。もう一度で戻る
//  (c) トリプルタップ（touchend 3回）でも同じく外れる・戻る。タッチの直後に届く合成 click で打ち消さない
//  (d) その間もセルは読み取り専用のまま・表示は合成表示のまま（編集はできない）
//  (e) 通常のセル（10/1）のトリプルクリックは従来どおり
//
// 実行: SHIFTY_ROOT=<リポジトリ> [SHIFTY_CDN_DIR=<CDN の npm 版を置いたディレクトリ>] node .claude/skills/shifty-e2e-verify/scripts/example-helper-triple-tap.js → allPass=true / EXIT=0
// 反証: 修正前の配信物（646502a）では b・c が落ちて EXIT=1
"use strict";
const path = require("node:path");
const { openHarness } = require(path.join(__dirname, "mount-component.js"));
const { makeStub } = require(path.join(__dirname, "stub-firebase.js"));
const ROOT = process.env.SHIFTY_ROOT || undefined;
const THEME = `<style>:root{--c-bg:#F0F2F5;--c-card:#FFFFFF;--c-input:#F3F4F6;--c-input2:#F0F2F5;` +
  `--c-border:#E5E7EB;--c-border2:#D1D5DB;--c-text:#1A1A2E;--c-text2:#374151;--c-text3:#6B7280;` +
  `--c-text4:#9CA3AF;--c-shadow:rgba(0,0,0,.06);--c-accent:#f87036;--c-danger:#DC2626;}</style>`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const w = (s, e) => ({ status: "work", start: s, end: e });
const BRK0 = { weekday: [], sat: [], sun: [], holSat: [], holSun: [] };
const base = (sid, extra) => Object.assign({ shopId: sid, candidates: [{ start: "09:00", end: "23:00" }], weekdayCandidates: {}, dateCandidates: {},
  breakTimes: BRK0, staffAttributes: { "田中": "parttime", "佐藤": "parttime" }, staffTypeLimits: {}, staffColors: {}, staffAliases: {},
  positions: { kitchen: [], hall: [] }, requiredPositions: {}, staffPositions: {} }, extra || {});
const B_SETTINGS = base("B", { staffHomeShop: { "田中": "A" }, shopAbbrs: ["鶏三"], shopAbbr2: { top: "鶏", bottom: "三" } });
const B_PERIODS = { b1: { id: "b1", startDate: "2026-10-01", endDate: "2026-10-15", label: "10月前半" } };
const B_SUBS = { x1: { id: "x1", periodId: "b1", staffName: "田中", shopId: "B", shifts: { "2026-10-09": w("11:00", "15:00") } } };
const A_SETTINGS = base("A");
const A_PERIOD = { id: "pa", urlToken: "ta", shopId: "A", label: "10月", startDate: "2026-10-01", endDate: "2026-10-31", deadlineDate: "", createdAt: "2026-09-01T00:00:00.000Z" };
const A_SUBS = {
  a1: { id: "a1", periodId: "pa", staffName: "田中", shopId: "A", comment: "", submittedAt: "2026-09-02T00:00:00.000Z", shifts: {
    "2026-10-01": w("10:00", "15:00"),
    // 自店は休みの提出で、変更マークが付いたまま。ヘルプ先に勤務がある＝ヘルプ先だけの日
    "2026-10-09": { status: "holiday", changed: true } } },
};
const SEED = { shops: {
  A: { staff: ["田中", "佐藤"], settings: A_SETTINGS, subs: A_SUBS, periods: { pa: A_PERIOD } },
  B: { staff: ["田中"], settings: B_SETTINGS, subs: B_SUBS, periods: B_PERIODS },
}, global: { shops: { A: { name: "A店" }, B: { name: "鷄えん3ビル" } } } };
const cfc = require(path.join(__dirname, "..", "..", "..", "..", "functions", "company-config.js"));
const PUB = { name: "テスト企業", shops: { A: true, B: true }, people: { "1042": { links: { A: "田中", B: "田中" } } } };
const LINK = cfc.buildShopMirror("C1", PUB, "A", { A: "A店", B: "鷄えん3ビル" }, "t");

const cellOf = (h, d, f) => h.evaluate(([d, f]) => {
  const el = document.querySelector(`[data-sc="${d}|${f}"][data-scn="田中"]`);
  if (!el) return null;
  const sub = (window.__subs || []).find(s => s.id === "a1");
  return { v: el.value, ro: el.readOnly, helper: el.getAttribute("data-helper"),
    green: /52, 199, 89/.test(getComputedStyle(el).backgroundImage), changed: !!(sub && sub.shifts[d] && sub.shifts[d].changed === true) };
}, [d, f]);
const sel = (d, f) => `[data-sc="${d}|${f}"][data-scn="田中"]`;
// 選んだセル（フォーカス中）は色を付けないので、測る前にフォーカスを外す
const blur = async h => { await h.evaluate(() => document.activeElement && document.activeElement.blur()); await sleep(300); };
const tripleClick = async (h, d, f) => { await h.page.click(sel(d, f), { clickCount: 3 }); await sleep(400); await blur(h); };
// touchend を3回（React の onTouchEnd）。続けて合成 click（detail 3）を送り、二重に効かないことも確かめる
const tripleTouch = async (h, d, f) => {
  await h.evaluate(s => {
    const el = document.querySelector(s);
    for (let i = 0; i < 3; i++) el.dispatchEvent(new Event("touchend", { bubbles: true }));
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 3 }));
  }, sel(d, f));
  await sleep(400);
};

(async () => {
  const v = {}, out = {};
  const h = await openHarness({
    root: ROOT, viewport: { width: 1400, height: 900 }, extraHead: THEME + makeStub({ seed: SEED, uid: "u_manager" }), waitFor: "[data-scn]",
    jsx: `
firebaseDB = firebase.database();
window.__toasts=[];
const SUBS=${JSON.stringify(Object.values(A_SUBS))};window.__subs=SUBS;
function Harness(){
  const [subs,setSubs]=React.useState(SUBS);
  window.__subs=subs;
  const [periods,setPeriods]=React.useState(${JSON.stringify([A_PERIOD])});
  return <ShiftEditTab subs={subs} periods={periods} staffList={["田中","佐藤"]}
    onSave={v=>setSubs(p=>typeof v==="function"?v(p):v)} tt={m=>window.__toasts.push(m)} initialPeriodId="pa"
    settings={${JSON.stringify(A_SETTINGS)}} plan="premium" shopId="A" shopName="A店" onUpgrade={()=>{}}
    allLinkedShops={[]} companyLink={${JSON.stringify(LINK)}}
    savePeriods={setPeriods} ownerReadOnly={false} pastSubsLoaded={true}/>;
}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);`,
  });
  await sleep(1500);
  out.before = await cellOf(h, "2026-10-09", "start");
  v.a_helperGreenReadOnly = !!out.before && out.before.helper === "1" && out.before.ro === true && out.before.green && out.before.changed && out.before.v === "11鶏";

  await tripleClick(h, "2026-10-09", "start");
  out.clickOff = await cellOf(h, "2026-10-09", "start");
  await tripleClick(h, "2026-10-09", "start");
  out.clickOn = await cellOf(h, "2026-10-09", "start");
  v.b_tripleClickToggles = !!out.clickOff && !out.clickOff.green && !out.clickOff.changed && !!out.clickOn && out.clickOn.green && out.clickOn.changed;

  await tripleTouch(h, "2026-10-09", "end");
  out.tapOff = await cellOf(h, "2026-10-09", "end");
  await tripleTouch(h, "2026-10-09", "end");
  out.tapOn = await cellOf(h, "2026-10-09", "end");
  v.c_tripleTapToggles = !!out.tapOff && !out.tapOff.green && !out.tapOff.changed && !!out.tapOn && out.tapOn.green && out.tapOn.changed;

  v.d_stillReadOnlyHelper = [out.clickOff, out.clickOn, out.tapOff, out.tapOn].every(c => c && c.ro === true && c.helper === "1")
    && out.clickOff.v === "11鶏" && out.tapOff.v === "15三";

  out.normal0 = await cellOf(h, "2026-10-01", "start");
  await tripleClick(h, "2026-10-01", "start");
  out.normal1 = await cellOf(h, "2026-10-01", "start");
  v.e_normalCellStillToggles = !!out.normal0 && !out.normal0.changed && !!out.normal1 && out.normal1.changed;

  out.errors = h.errors.slice();
  await h.close();
  v.noErrors = out.errors.length === 0;
  v.allPass = Object.values(v).every(Boolean);
  console.log(JSON.stringify({ out, verdict: v }, null, 2));
  process.exit(v.allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
