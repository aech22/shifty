// 実績レイヤー（2026-09-30・労務給与_複数法人_実装計画.md §3.6・§4.1・§6 P4）の実ブラウザ回帰テスト。
// シフト作成タブ（ShiftEditTab）だけをマウントし、actuals の保存はスパイ（メモリ上で差分を当てる）。Firebase へは1バイトも出ない。
//
// A. 確定済みの期間でだけ「実績」切替が出る（未確定の期間・オーナーでない端末には出ない）
// B. 実績グリッドは確定シフトを初期値に出す（10:00-18:00・休憩60分＝実働7:00）。確定ロック中でも実績のセルは書ける
// C. 退勤を 19 に直すと {end:"19:00"} だけが保存され（差分のある日だけ）、その日に色が付き、実働計が 15:00 → 16:00 になる
//    （田中は 11/2 の 7:00 と 11/4 の 8:00 で予定 15:00）。18:00 に戻すと記録が消え（null）色も消える
// D. 詳細欄: 欠勤（{absent:true}）、遅刻・早退＋法定休日＋メモ、「予定に戻す」（null）
// E. CSV取込: 別名・期間の外・知らない名前を仕分け、取り込める行だけを同じノードへ書く。列の位置を変えたら店舗設定に保存する
// F. 375px（スタッフ6名）: 実績グリッドは枠の中で横スクロールし、ページ全体の横幅を広げない。入力はすべて 16px
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-actuals.js → allPass=true / EXIT=0
"use strict";
const path = require("node:path");
const { openHarness, REPO_ROOT } = require(path.join(__dirname, "mount-component.js"));
const ROOT = process.env.SHIFTY_ROOT || REPO_ROOT;
const THEME = `<style>:root{--c-bg:#F0F2F5;--c-card:#FFFFFF;--c-input:#F3F4F6;--c-input2:#F0F2F5;` +
  `--c-border:#E5E7EB;--c-border2:#D1D5DB;--c-text:#1A1A2E;--c-text2:#374151;--c-text3:#6B7280;` +
  `--c-text4:#9CA3AF;--c-shadow:rgba(0,0,0,.06);--c-accent:#f87036;--c-danger:#DC2626;}</style>`;

const HARNESS = (ownerReadOnly, staff = ["田中", "佐藤"]) => `
window.confirm=()=>true;
const P1={id:"p1",urlToken:"t1",shopId:"S1",label:"11月前半",startDate:"2026-11-01",endDate:"2026-11-15",deadlineDate:"",createdAt:"2026-09-01T00:00:00.000Z",
  confirmation:{at:"2026-10-31T00:00:00.000Z",byUid:"U1"}};
const P2={id:"p2",urlToken:"t2",shopId:"S1",label:"11月後半",startDate:"2026-11-16",endDate:"2026-11-30",deadlineDate:"",createdAt:"2026-09-01T00:00:00.000Z"};
const SUBS=[{id:"s1",periodId:"p1",staffName:"田中",shopId:"S1",comment:"",submittedAt:"2026-10-20T00:00:00.000Z",
  shifts:{"2026-11-02":{status:"work",start:"10:00",end:"18:00"},"2026-11-04":{status:"work",start:"09:00",end:"18:00"}}},
  {id:"s2",periodId:"p1",staffName:"佐藤",shopId:"S1",comment:"",submittedAt:"2026-10-20T00:00:00.000Z",
  shifts:{"2026-11-05":{status:"work",start:"10:00",end:"15:00"}}}];
const SETTINGS={shopId:"S1",candidates:[{start:"09:00",end:"23:00"}],weekdayCandidates:{},dateCandidates:{},
  breakTimes:{weekday:[{start:"12:00",end:"13:00"}],sat:[],sun:[],holSat:[],holSun:[]},staffAttributes:{"田中":"employee","佐藤":"parttime"},staffTypeLimits:{},
  staffColors:{},staffAliases:{"田中":["たなか"]},positions:{kitchen:[],hall:[]},requiredPositions:{},staffPositions:{}};
const applyFlat=(obj,patch)=>{const o=JSON.parse(JSON.stringify(obj||{}));Object.keys(patch||{}).forEach(k=>{const ks=k.split("/");let n=o;
  for(let i=0;i<ks.length-1;i++){if(!n[ks[i]]||typeof n[ks[i]]!=="object")n[ks[i]]={};n=n[ks[i]];}
  if(patch[k]===null)delete n[ks[ks.length-1]];else n[ks[ks.length-1]]=JSON.parse(JSON.stringify(patch[k]));});return o;};
window.__acPatches=[];window.__maps=[];window.__toasts=[];
function Harness(){
  const [ac,setAc]=React.useState({});
  const [mp,setMp]=React.useState(null);
  window.__ac=ac;
  const act={enabled:true,loaded:true,map:ac,rename(){},drop(){},csvMapping:mp||DEFAULT_ACTUALS_CSV_MAPPING,
    saveCsvMapping:m=>{window.__maps.push(m);setMp(m);},
    save:p=>{window.__acPatches.push(p);setAc(m=>applyFlat(m,p));return Promise.resolve();}};
  return <ShiftEditTab subs={SUBS} periods={[P1,P2]} staffList={${JSON.stringify(staff)}} onSave={()=>{}} tt={m=>{window.__toasts.push(m);}}
    settings={SETTINGS} plan="premium" shopId="S1" shopName="A店" onUpgrade={()=>{}} allLinkedShops={[]}
    savePeriods={()=>{}} ownerReadOnly={${ownerReadOnly}} pastSubsLoaded={true} companyLink={null} companyInfo={null} actuals={act}/>;
}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);`;

const C = (n, d, f) => `[data-actual-cell="${n}|${d}|${f}"]`;
const TD = (n, d, f) => `[data-actual-td="${n}|${d}|${f}"]`;
const last = () => window.__acPatches[window.__acPatches.length - 1];

async function partMain() {
  const h = await openHarness({ root: ROOT, extraHead: THEME, waitFor: "select", jsx: HARNESS("false") });
  const R = {};
  try {
    await h.page.waitForTimeout(400);
    R.toggleOnConfirmed = await h.evaluate(`!!document.querySelector("[data-actual-toggle]")`);
    R.mainCellReadOnly = await h.evaluate(s => { const e = document.querySelector(s); return e ? e.readOnly : null; }, h.cell("田中", "2026-11-02", "start"));
    await h.page.click("[data-actual-toggle]");
    await h.page.waitForTimeout(300);
    R.grid = await h.evaluate(`!!document.querySelector("[data-actuals]")`);
    R.init = await h.evaluate(([a, b, c]) => ({ start: document.querySelector(a).value, end: document.querySelector(b).value, readOnly: document.querySelector(a).readOnly,
      sum: document.querySelector('[data-actual-sum="田中"]').innerText.replace(/\s+/g, " ").trim(), rest: document.querySelector(c).value }),
      [C("田中", "2026-11-02", "start"), C("田中", "2026-11-02", "end"), C("田中", "2026-11-03", "start")]);
    // C. 退勤を直す → 差分だけ保存・色・実働計
    await h.fill(C("田中", "2026-11-02", "end"), "19");
    await h.page.waitForTimeout(200);
    R.editPatch = await h.evaluate(last);
    R.editDiff = await h.evaluate(s => document.querySelector(s).getAttribute("data-actual-diff"), TD("田中", "2026-11-02", "end"));
    R.editBg = await h.evaluate(s => getComputedStyle(document.querySelector(s)).backgroundColor, TD("田中", "2026-11-02", "end"));
    R.editSum = await h.evaluate(() => document.querySelector('[data-actual-sum="田中"]').innerText.replace(/\s+/g, " ").trim());
    R.count = await h.evaluate(`document.querySelector("[data-actuals-count]").getAttribute("data-actuals-count")`);
    await h.fill(C("田中", "2026-11-02", "end"), "18:00");
    await h.page.waitForTimeout(200);
    R.backPatch = await h.evaluate(last);
    R.backDiff = await h.evaluate(s => document.querySelector(s).getAttribute("data-actual-diff"), TD("田中", "2026-11-02", "end"));
    R.backStore = await h.evaluate(() => JSON.stringify(window.__ac));
    // D. 詳細欄: 欠勤
    await h.page.focus(C("田中", "2026-11-04", "start"));
    await h.page.waitForTimeout(150);
    R.detail = await h.evaluate(`(document.querySelector("[data-actuals-detail]")||{}).getAttribute?document.querySelector("[data-actuals-detail]").getAttribute("data-actuals-detail"):null`);
    R.detailSched = await h.evaluate(`(document.querySelector("[data-actuals-sched]")||{}).innerText||null`);
    await h.page.click("[data-actuals-f-absent]");
    R.absentPreview = await h.evaluate(`document.querySelector("[data-actuals-preview]").innerText`);
    await h.page.click("[data-actuals-save]");
    await h.page.waitForTimeout(200);
    R.absentPatch = await h.evaluate(last);
    R.absentPlaceholder = await h.evaluate(s => document.querySelector(s).getAttribute("placeholder"), C("田中", "2026-11-04", "start"));
    // 遅刻・早退＋法定休日＋メモ（佐藤 11/5）
    await h.page.focus(C("佐藤", "2026-11-05", "end"));
    await h.page.waitForTimeout(150);
    await h.setInput("[data-actuals-f-absentmin]", "30");
    await h.page.click("[data-actuals-f-legal]");
    await h.setInput("[data-actuals-f-note]", "応援");
    await h.page.click("[data-actuals-save]");
    await h.page.waitForTimeout(200);
    R.flagsPatch = await h.evaluate(last);
    R.legalMark = await h.evaluate(s => document.querySelector(s).innerText.trim(), TD("佐藤", "2026-11-05", "end"));
    // 予定に戻す
    await h.page.focus(C("田中", "2026-11-04", "end"));
    await h.page.waitForTimeout(150);
    await h.page.click("[data-actuals-reset]");
    await h.page.waitForTimeout(200);
    R.resetPatch = await h.evaluate(last);
    // エラーの入力は保存しない
    const n0 = await h.evaluate(() => window.__acPatches.length);
    await h.fill(C("田中", "2026-11-02", "start"), "20");
    await h.page.waitForTimeout(200);
    R.badSaved = await h.evaluate(n => window.__acPatches.length > n, n0);
    R.badToast = await h.evaluate(() => window.__toasts[window.__toasts.length - 1]);
    // E. CSV取込
    await h.page.click("[data-actuals-csv-open]");
    await h.page.waitForTimeout(200);
    await h.setInput("[data-actuals-csv-text]", "日付,名前,出勤,退勤,休憩\n2026-11-02,たなか,9:58,18:05,60\n2026-11-20,田中,10:00,18:00,\n11/6,鈴木,10:00,15:00,\n11/6,佐藤,17:00,22:00,");
    await h.page.waitForTimeout(200);
    R.csvSummary = await h.evaluate(`document.querySelector("[data-actuals-csv-summary]").getAttribute("data-actuals-csv-summary")`);
    const n1 = await h.evaluate(() => window.__acPatches.length);
    await h.page.click("[data-actuals-csv-import]");
    await h.page.waitForTimeout(300);
    R.csvPatch = await h.evaluate(n => window.__acPatches[n] || null, n1);
    R.csvMapsSavedUnchanged = await h.evaluate(() => window.__maps.length);
    // 列の位置を変えて取り込むと店舗設定に保存する
    await h.page.click("[data-actuals-csv-open]");
    await h.page.waitForTimeout(200);
    await h.setInput('[data-actuals-csv-col="breakMin"]', "0");
    await h.page.click("[data-actuals-csv-header]");
    await h.setInput("[data-actuals-csv-text]", "2026-11-09,田中,10:00,14:00");
    await h.page.waitForTimeout(200);
    await h.page.click("[data-actuals-csv-import]");
    await h.page.waitForTimeout(300);
    R.csvPatch2 = await h.evaluate(last);
    R.csvMap = await h.evaluate(() => window.__maps[window.__maps.length - 1] || null);
    // 未確定の期間では切替が出ない
    await h.page.click("[data-actual-toggle]");
    await h.page.waitForTimeout(200);
    await h.page.selectOption("select", "p2");
    await h.page.waitForTimeout(300);
    R.toggleOnUnconfirmed = await h.evaluate(`!!document.querySelector("[data-actual-toggle]")`);
    R.gridOnUnconfirmed = await h.evaluate(`!!document.querySelector("[data-actuals]")`);
  } catch (e) { R.exception = e.message; }
  R.errors = h.errors.slice();
  await h.close();
  return R;
}

async function partReadOnly() {
  const h = await openHarness({ root: ROOT, extraHead: THEME, waitFor: "select", jsx: HARNESS("true") });
  await h.page.waitForTimeout(300);
  const R = { toggle: await h.evaluate(`!!document.querySelector("[data-actual-toggle]")`), errors: h.errors.slice() };
  await h.close();
  return R;
}

async function partMobile() {
  const h = await openHarness({ root: ROOT, extraHead: THEME, waitFor: "select", jsx: HARNESS("false", ["田中", "佐藤", "鈴木", "高橋", "伊藤", "渡辺"]), viewport: { width: 375, height: 812 } });
  const R = {};
  try {
    await h.page.waitForTimeout(400);
    R.pageWBefore = await h.evaluate(() => document.documentElement.scrollWidth);
    await h.page.click("[data-actual-toggle]");
    await h.page.waitForTimeout(300);
    R.pageWAfter = await h.evaluate(() => document.documentElement.scrollWidth);
    R.gridScrolls = await h.evaluate(() => { const t = document.querySelector("[data-actuals] table").parentElement; return t.scrollWidth > t.clientWidth; });
    R.cellFont = await h.evaluate(s => getComputedStyle(document.querySelector(s)).fontSize, C("田中", "2026-11-02", "start"));
    await h.page.focus(C("田中", "2026-11-02", "start"));
    await h.page.waitForTimeout(150);
    R.detailFonts = await h.evaluate(() => [...document.querySelectorAll("[data-actuals-detail] input:not([type=checkbox])")].map(e => getComputedStyle(e).fontSize));
  } catch (e) { R.exception = e.message; }
  R.errors = h.errors.slice();
  await h.close();
  return R;
}

(async () => {
  const A = await partMain();
  const O = await partReadOnly();
  const M = await partMobile();
  const K = "p1/田中/2026-11-02";
  const v = {
    A_toggleOnConfirmed: A.toggleOnConfirmed === true,
    A_mainGridLocked: A.mainCellReadOnly === true,
    B_gridShows: A.grid === true,
    B_initFromSchedule: !!(A.init && A.init.start === "10:00" && A.init.end === "18:00" && A.init.readOnly === false && A.init.sum === "15:00 予定 15:00" && A.init.rest === ""),
    C_diffOnly: JSON.stringify(A.editPatch) === JSON.stringify({ [K]: { end: "19:00" } }),
    C_colored: A.editDiff === "1" && A.editBg !== "rgba(0, 0, 0, 0)" && A.count === "1",
    C_sum: A.editSum === "16:00 予定 15:00",
    C_backToSchedule: JSON.stringify(A.backPatch) === JSON.stringify({ [K]: null }) && A.backDiff === "0" && A.backStore === '{"p1":{"田中":{}}}',
    D_detail: A.detail === "田中|2026-11-04" && /予定: 09:00〜18:00・休憩60分/.test(A.detailSched || "") && /実働8:00/.test(A.detailSched || ""),
    D_absent: JSON.stringify(A.absentPatch) === JSON.stringify({ "p1/田中/2026-11-04": { absent: true } }) && /欠勤（不就労 8:00）/.test(A.absentPreview || "") && A.absentPlaceholder === "欠勤",
    D_flags: JSON.stringify(A.flagsPatch) === JSON.stringify({ "p1/佐藤/2026-11-05": { absentMin: 30, legalHoliday: true, note: "応援" } }) && A.legalMark === "法",
    D_reset: JSON.stringify(A.resetPatch) === JSON.stringify({ "p1/田中/2026-11-04": null }),
    D_badInputNotSaved: A.badSaved === false && /退勤は出勤より後/.test(A.badToast || ""),
    E_csvSummary: A.csvSummary === "2/2",
    E_csvPatch: JSON.stringify(A.csvPatch) === JSON.stringify({ [K]: { start: "09:58", end: "18:05" }, "p1/佐藤/2026-11-06": { start: "17:00", end: "22:00" } }) && A.csvMapsSavedUnchanged === 0,
    E_csvMapping: JSON.stringify(A.csvPatch2) === JSON.stringify({ "p1/田中/2026-11-09": { start: "10:00", end: "14:00" } })
      && !!(A.csvMap && A.csvMap.hasHeader === false && A.csvMap.breakMin === 0),
    A_noToggleOnUnconfirmed: A.toggleOnUnconfirmed === false && A.gridOnUnconfirmed === false,
    A_noToggleReadOnly: O.toggle === false,
    F_mobileNoPageOverflow: !!(M.pageWAfter <= Math.max(375, M.pageWBefore) && M.gridScrolls === true),
    F_mobileFont16: M.cellFont === "16px" && Array.isArray(M.detailFonts) && M.detailFonts.length >= 5 && M.detailFonts.every(f => f === "16px"),
    noErrors: [A, O, M].every(x => x.errors.length === 0 && !x.exception),
  };
  v.allPass = Object.values(v).every(Boolean);
  console.log(JSON.stringify({ A, O, M, verdict: v }, null, 2));
  process.exit(v.allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
