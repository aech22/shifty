// 人×月の所定・確定ロック・交付（2026-09-30・労務給与_複数法人_実装計画.md §3.4・§3.5・§6 P3）の実ブラウザ回帰テスト。
// Firebase へは1バイトも出ない（A・C・D は app-main.js を読まない。B は stub-firebase.js のメモリ上の DB）。
//
// A. シフト作成タブ単体（企業に連携した店舗・企業セッション）
//   - 「確定」で period に confirmation・history（記録1件ずつのパス）が書かれ、写しを持ち、lockedAt は無い。
//     所定は laborMonths に {days:2,min:840,auto} で凍結（1か月の期間なので確定と同時に月が凍結される）
//   - 確定後はセルが readOnly で、入力しても提出データが変わらない。「保存」「提出」ボタンが消え、バッジが出る
//   - 確定後にスタッフ一覧が変わっても写し（snapshot）を書き直さない
//   - 労務判定表に「月所定/上限」「年平均所定/分母」の2行（2,080h の11月＝所定上限 170:57、分母 173:18）
//   - 「交付を記録」で delivery と履歴、「確定を解除」（理由つき）で確定・交付が外れ、所定の凍結が解けてセルがまた編集できる
//   - 人×月の所定の欄で手修正（20日・160:00）すると laborMonths に書かれ、表の「月所定/上限」が 160:00 −10:57 になる
//   - 全データPDFに2行が載る
//   - 企業に連携した店舗で企業セッションでない（店舗のオーナー）なら確定ボタンが出ない。単独店舗はオーナーに出る
// B. 企業連携タブの提出状況表（stub-firebase.js）: 確定・交付・履歴・解除が店舗の periods と laborMonths に書かれる
// C. 本部店舗（kind:"hq"）の固定勤務パターン: 土日祝（11/3・11/23 を含む）を除き、空いている日だけに 9:00-18:00・休憩60分
// D. スタッフ画面: 確定済みの期間は案内が出て、提出が送られない
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-labor-confirm.js → allPass=true / EXIT=0
"use strict";
const path = require("node:path");
const { openHarness, REPO_ROOT } = require(path.join(__dirname, "mount-component.js"));
const { makeStub } = require(path.join(__dirname, "stub-firebase.js"));
const ROOT = process.env.SHIFTY_ROOT || REPO_ROOT;
const THEME = `<style>:root{--c-bg:#F0F2F5;--c-card:#FFFFFF;--c-input:#F3F4F6;--c-input2:#F0F2F5;` +
  `--c-border:#E5E7EB;--c-border2:#D1D5DB;--c-text:#1A1A2E;--c-text2:#374151;--c-text3:#6B7280;` +
  `--c-text4:#9CA3AF;--c-shadow:rgba(0,0,0,.06);--c-accent:#f87036;--c-danger:#DC2626;}</style>`;
const PDF_LIBS = `<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js" integrity="sha384-ZZ1pncU3bQe8y31yfZdMFdSpttDoPmOZg2wguVK9almUodir1PghgT0eY7Mrty8H" crossorigin="anonymous"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js" integrity="sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk" crossorigin="anonymous"></script>`;

const COMMON = `
window.confirm=()=>true;window.prompt=()=>"所定の直し";
const P1={id:"p1",urlToken:"t1",shopId:"S1",label:"11月",startDate:"2026-11-01",endDate:"2026-11-30",deadlineDate:"",createdAt:"2026-09-01T00:00:00.000Z"};
const SUBS=[{id:"s1",periodId:"p1",staffName:"田中",shopId:"S1",comment:"",submittedAt:"2026-10-20T00:00:00.000Z",
  shifts:{"2026-11-02":{status:"work",start:"10:00",end:"15:00"},"2026-11-04":{status:"work",start:"09:00",end:"18:00"}}}];
const SETTINGS={shopId:"S1",candidates:[{start:"09:00",end:"23:00"}],weekdayCandidates:{},dateCandidates:{},
  breakTimes:{weekday:[],sat:[],sun:[],holSat:[],holSun:[]},staffAttributes:{"田中":"employee","佐藤":"employee"},staffTypeLimits:{},
  staffColors:{},staffAliases:{},positions:{kitchen:[],hall:[]},requiredPositions:{},staffPositions:{},
  laborSettings:{annualScheduledMin:124800}};
const applyFlat=(obj,patch)=>{const o=JSON.parse(JSON.stringify(obj||{}));Object.keys(patch||{}).forEach(k=>{const ks=k.split("/");let n=o;
  for(let i=0;i<ks.length-1;i++){if(!n[ks[i]]||typeof n[ks[i]]!=="object")n[ks[i]]={};n=n[ks[i]];}
  if(patch[k]===null)delete n[ks[ks.length-1]];else n[ks[ks.length-1]]=JSON.parse(JSON.stringify(patch[k]));});return o;};
window.__writes=[];window.__lmPatches=[];window.__toasts=[];
`;
const HARNESS = (link, info) => `
${COMMON}
function Harness(){
  const [periods,setPeriods]=React.useState([P1]);
  const [subs,setSubs]=React.useState(SUBS);
  const [staff,setStaff]=React.useState(["田中","佐藤"]);
  const [lm,setLm]=React.useState({});
  const [info,setInfo]=React.useState(${info});
  window.__setStaff=setStaff;window.__setInfo=setInfo;window.__subs=subs;window.__periods=periods;window.__lm=lm;
  const savePeriods=v=>{window.__writes.push(diffPeriodsForFlatWrite(periods,v));setPeriods(v);};
  const onSave=v=>setSubs(prev=>{const n=typeof v==="function"?v(prev):v;window.__subs=n;return n;});
  const lmObj={enabled:true,loaded:true,map:lm,rename(){},drop(){},
    save:p=>{window.__lmPatches.push(p);setLm(m=>applyFlat(m,p));return Promise.resolve();}};
  return <ShiftEditTab subs={subs} periods={periods} staffList={staff} onSave={onSave} tt={m=>{window.__toast=m;window.__toasts.push(m);}}
    settings={SETTINGS} plan="premium" shopId="S1" shopName="A店" onUpgrade={()=>{}} allLinkedShops={[]}
    savePeriods={savePeriods} ownerReadOnly={false} pastSubsLoaded={true} companyLink={${link}} companyInfo={info} laborMonths={lmObj}/>;
}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);`;
const LINK = `{id:"C1",name:"テスト企業",settings:{},deadlines:{},shops:{}}`;

// 労務判定表の行（先頭セルのラベル）→ 田中の列（1列目）のテキストと title
const ROW = label => `(()=>{const tr=[...document.querySelectorAll("tr")].find(r=>r.cells[0]&&r.cells[0].innerText.trim()===${JSON.stringify(label)});
  if(!tr)return null;const c=tr.cells[1];return{text:c.innerText.trim(),title:c.getAttribute("title")||""};})()`;

async function partA() {
  const h = await openHarness({ root: ROOT, extraHead: THEME + PDF_LIBS, waitFor: "select", jsx: HARNESS(LINK, `{companyId:"C1"}`) });
  const R = {};
  const cellSel = h.cell("田中", "2026-11-02", "start");
  try {
    await h.page.waitForTimeout(500);
    R.before = { confirmBtn: await h.evaluate(`!!document.querySelector("[data-period-confirm]")`), sched: await h.evaluate(ROW("月所定/上限")), avg: await h.evaluate(ROW("年平均所定/分母")) };
    const nW = await h.evaluate(() => window.__writes.length);
    await h.page.click("[data-period-confirm]");
    await h.page.waitForTimeout(500);
    R.confirmWrite = await h.evaluate(n => window.__writes.slice(n).find(w => Object.keys(w).some(k => k === "p1/confirmation")) || null, nW);
    R.lmPatch = await h.evaluate(() => window.__lmPatches[0] || null);
    // 写しは開いた時点で書かれているので確定の差分には出ないことがある（同じ内容なら書かない）。期間そのものを見る
    R.periodAfterConfirm = await h.evaluate(() => { const p = window.__periods[0]; return { snapStaff: p.snapshot && p.snapshot.staffList, lockedAt: p.lockedAt === undefined }; });
    R.afterConfirm = {
      readOnly: await h.evaluate(s => document.querySelector(s).readOnly, cellSel),
      badge: await h.evaluate(`(document.querySelector("[data-period-state]")||{}).innerText||null`),
      saveBtn: await h.evaluate(`[...document.querySelectorAll("button")].some(b=>b.innerText.trim()==="保存")`),
      submitBtn: await h.evaluate(`!!document.querySelector("[data-co-submit-btn]")`),
      sched: await h.evaluate(ROW("月所定/上限")),
    };
    await h.fill(cellSel, "12");
    R.afterConfirm.cellUnchanged = await h.evaluate(() => window.__subs[0].shifts["2026-11-02"].adjustedStart === undefined);
    // 確定後にスタッフが増えても写しを書き直さない
    const nW2 = await h.evaluate(() => window.__writes.length);
    await h.evaluate(() => window.__setStaff(["田中", "佐藤", "鈴木"]));
    await h.page.waitForTimeout(400);
    R.snapshotRewritten = await h.evaluate(n => window.__writes.slice(n).some(w => Object.keys(w).some(k => k.startsWith("p1/snapshot"))), nW2);
    // 交付
    const nW3 = await h.evaluate(() => window.__writes.length);
    await h.page.click("[data-period-deliver]");
    await h.page.waitForTimeout(300);
    R.deliverWrite = await h.evaluate(n => window.__writes.slice(n).map(w => Object.keys(w).sort()), nW3);
    R.badgeDelivered = await h.evaluate(`(document.querySelector("[data-period-state]")||{}).getAttribute("data-period-state")`);
    // 解除（理由つき）
    const nW4 = await h.evaluate(() => window.__writes.length);
    await h.page.click("[data-period-unconfirm]");
    await h.page.waitForTimeout(300);
    R.unconfirmWrite = await h.evaluate(n => window.__writes.slice(n)[0] || null, nW4);
    R.unfreezePatch = await h.evaluate(() => window.__lmPatches[window.__lmPatches.length - 1]);
    R.afterUnconfirm = { readOnly: await h.evaluate(s => document.querySelector(s).readOnly, cellSel), badge: await h.evaluate(`!!document.querySelector("[data-period-state]")`) };
    await h.fill(cellSel, "12");
    R.afterUnconfirm.cellEdited = await h.evaluate(() => window.__subs[0].shifts["2026-11-02"].adjustedStart);
    // 手修正
    await h.page.click("[data-lm-toggle]");
    await h.page.waitForTimeout(200);
    await h.setInput('[data-lm-days="田中"]', "20");
    await h.setInput('[data-lm-time="田中"]', "160:00");
    await h.page.click('[data-lm-save="田中"]');
    await h.page.waitForTimeout(300);
    R.manualPatch = await h.evaluate(() => window.__lmPatches[window.__lmPatches.length - 1]);
    R.manualState = await h.evaluate(`document.querySelector('[data-lm-row="田中"] [data-lm-state]').getAttribute("data-lm-state")`);
    R.schedAfterManual = await h.evaluate(ROW("月所定/上限"));
    // PDF（全データ）に2行が載る
    await h.evaluate(() => { window.__pdfSaved = false; const Orig = window.jspdf.jsPDF; window.jspdf.jsPDF = function (...a) { const d = new Orig(...a); d.save = () => { window.__pdfSaved = true; }; return d; }; });
    const pdf = await h.capturePdf();
    await h.clickExact("PDF出力");
    await h.clickExact("全データ");
    await h.page.waitForFunction(() => window.__pdfSaved === true, null, { timeout: 30000 }).catch(() => {});
    R.pdfText = await pdf.text();
    // 企業セッションでなければ確定ボタンが出ない
    await h.evaluate(() => window.__setInfo(null));
    await h.page.waitForTimeout(200);
    R.noSessionConfirmBtn = await h.evaluate(`!!document.querySelector("[data-period-confirm]")`);
  } catch (e) { R.exception = e.message; }
  R.errors = h.errors.slice();
  await h.close();
  return R;
}

async function partStandalone() {
  const h = await openHarness({ root: ROOT, extraHead: THEME, waitFor: "select", jsx: HARNESS("null", "null") });
  await h.page.waitForTimeout(300);
  const R = { confirmBtn: await h.evaluate(`!!document.querySelector("[data-period-confirm]")`), errors: h.errors.slice() };
  await h.close();
  return R;
}

async function partHq() {
  const h = await openHarness({ root: ROOT, extraHead: THEME, waitFor: "select", jsx: HARNESS(`{id:"C1",name:"テスト企業",settings:{},deadlines:{},shops:{},kind:"hq"}`, `{companyId:"C1"}`) });
  const R = {};
  try {
    await h.page.waitForTimeout(300);
    R.panel = await h.evaluate(`!!document.querySelector("[data-hq-fill]")`);
    await h.page.click("[data-hq-fill-btn]");
    await h.page.waitForTimeout(300);
    R.toast = await h.evaluate(() => window.__toast);
    R.tanaka = await h.evaluate(() => { const s = window.__subs.find(x => x.staffName === "田中"); return { n: Object.keys(s.shifts).length, d1102: s.shifts["2026-11-02"], d1103: s.shifts["2026-11-03"], d1105: s.shifts["2026-11-05"] }; });
    R.sato = await h.evaluate(() => { const s = window.__subs.find(x => x.staffName === "佐藤"); return s ? { n: Object.keys(s.shifts).length, source: s.source, hol23: !!s.shifts["2026-11-23"], sat07: !!s.shifts["2026-11-07"] } : null; });
  } catch (e) { R.exception = e.message; }
  R.errors = h.errors.slice();
  await h.close();
  return R;
}

async function partCompany() {
  const UID = "U1", CID = "C1";
  const shop = (sid, periods, subs) => ({ owners: { [UID]: "K" + sid, [`company_${CID}`]: "K" + sid }, private: { adminKey: "K" + sid }, staff: { 0: "田中" }, periods, subs,
    settings: { shopId: sid, candidates: [], weekdayCandidates: {}, dateCandidates: {}, breakTimes: {}, staffAttributes: { "田中": "employee" } } });
  const P = { id: "p1", urlToken: "t1", shopId: "S1", label: "11月", startDate: "2026-11-01", endDate: "2026-11-30", deadlineDate: "", createdAt: "2026-09-01T00:00:00.000Z", submission: { at: "2026-10-25T00:00:00.000Z", byUid: "x" } };
  const seed = {
    global: { shops: { S1: { id: "S1", name: "A店" } } },
    shops: { S1: shop("S1", { p1: P }, { s1: { id: "s1", periodId: "p1", staffName: "田中", shopId: "S1", comment: "", submittedAt: "2026-10-20T00:00:00.000Z",
      shifts: { "2026-11-02": { status: "work", start: "10:00", end: "15:00" }, "2026-11-04": { status: "work", start: "09:00", end: "18:00" } } } }) },
    accounts: { S1: { plan: "premium" }, [UID]: { shops: { S1: true }, company: { companyId: CID, code: "ABCD1234", name: "テスト企業" } } },
    companies: { [CID]: { pub: { name: "テスト企業", ownerUid: UID, code: "ABCD1234", shops: { S1: true } } } },
  };
  const h = await openHarness({
    root: ROOT, jsx: "window.__harnessReady=true;window.prompt=()=>'所定の直し';", waitFor: "#root > *", viewport: { width: 1400, height: 950 },
    extraHead: THEME + makeStub({ seed, uid: UID, view: "admin", tab: "company", cfHandlers: { saveCompanyConfig: "companyConfig", ensureCompanyEntities: "entity" } }),
    scripts: ["app-utils.js", "app-core.js", "app-staff.js", "app-admin.js", "app-shift.js", "app-company.js", "app-main.js"].map(src => ({ src, babel: !/utils|core/.test(src) })),
  });
  const R = {};
  try {
    await h.page.waitForFunction(() => !!document.querySelector("[data-co-summary]"), { timeout: 15000 });
    R.headers = await h.evaluate(() => [...document.querySelector("[data-co-row]").closest("table").querySelectorAll("th")].map(t => t.innerText.trim()));
    await h.page.click('[data-co-confirm-btn="S1"]');
    await h.page.waitForFunction(() => !!document.querySelector('[data-co-unconfirm-btn="S1"]'), { timeout: 8000 }).catch(() => {});
    R.confirmation = await h.evaluate(() => window.__db("shops/S1/periods/p1/confirmation"));
    R.snapshot = await h.evaluate(() => !!window.__db("shops/S1/periods/p1/snapshot"));
    R.lm = await h.evaluate(() => window.__db("shops/S1/laborMonths/2026-11/田中"));
    R.summary = await h.evaluate(() => document.querySelector("[data-co-confirm-summary]").innerText.trim());
    await h.page.click('[data-co-deliver-btn="S1"]');
    await h.page.waitForFunction(() => document.querySelector('[data-co-deliver="1"]'), { timeout: 8000 }).catch(() => {});
    R.delivery = await h.evaluate(() => window.__db("shops/S1/periods/p1/delivery"));
    await h.page.click('[data-co-hist-btn="S1"]');
    await h.page.waitForTimeout(200);
    R.history = await h.evaluate(() => (document.querySelector('[data-co-hist="S1"]') || {}).innerText || null);
    await h.page.click('[data-co-unconfirm-btn="S1"]');
    await h.page.waitForFunction(() => !!document.querySelector('[data-co-confirm-btn="S1"]'), { timeout: 8000 }).catch(() => {});
    R.afterUnconfirm = { confirmation: await h.evaluate(() => window.__db("shops/S1/periods/p1/confirmation")), delivery: await h.evaluate(() => window.__db("shops/S1/periods/p1/delivery")),
      lm: await h.evaluate(() => window.__db("shops/S1/laborMonths/2026-11/田中")), histCount: await h.evaluate(() => Object.keys(window.__db("shops/S1/periods/p1/history") || {}).length) };
  } catch (e) { R.exception = e.message; }
  R.errors = h.errors.slice();
  await h.close();
  return R;
}

async function partStaff() {
  const h = await openHarness({ root: ROOT, extraHead: THEME, waitFor: "#root > *", jsx: `
const AP={id:"p1",urlToken:"t1",shopId:"S1",label:"11月",startDate:"2026-11-01",endDate:"2026-11-07",deadlineDate:"",createdAt:"2026-09-01T00:00:00.000Z",confirmation:{at:"2026-10-31T00:00:00.000Z",byUid:"company_C1"}};
window.__subCalls=0;window.__toasts=[];
ReactDOM.createRoot(document.getElementById("root")).render(<StaffView periods={[AP]} ap={AP} apid="p1" setApid={()=>{}} shopId="S1"
  settings={{candidates:[{start:"09:00",end:"18:00"}],weekdayCandidates:{},dateCandidates:{}}} subs={[]} staffList={["田中"]}
  onSub={()=>{window.__subCalls++;return Promise.resolve();}} onDeleteSub={()=>{}} shopName="A店" urlLocked={true} plan="premium"/>);` });
  const R = {};
  try {
    await h.page.waitForTimeout(300);
    R.banner = await h.evaluate(`(document.querySelector("[data-staff-confirmed]")||{}).innerText||null`);
    await h.clickExact("シフトを提出する");
    await h.page.waitForTimeout(300);
    R.confirmModal = await h.evaluate(`[...document.querySelectorAll("button")].some(b=>b.innerText.trim()==="提出する")`);
    R.subCalls = await h.evaluate(() => window.__subCalls);
    R.toastShown = await h.evaluate(() => document.body.innerText.includes("確定済みのため、提出・修正できません"));
  } catch (e) { R.exception = e.message; }
  R.errors = h.errors.slice();
  await h.close();
  return R;
}

(async () => {
  const A = await partA();
  const S = await partStandalone();
  const Q = await partHq();
  const B = await partCompany();
  const D = await partStaff();
  const cw = A.confirmWrite || {};
  const histKeys = Object.keys(cw).filter(k => k.startsWith("p1/history/"));
  const v = {
    A_confirmBtn: !!(A.before && A.before.confirmBtn),
    A_schedRow: !!(A.before && A.before.sched && A.before.sched.text === "14:00 −156:57" && /所定上限 170:57/.test(A.before.sched.title)),
    A_avgRow: !!(A.before && A.before.avg && A.before.avg.text === "14:00 −159:18" && /分母 173:18/.test(A.before.avg.title)),
    A_confirmWrites: !!(cw["p1/confirmation"] && cw["p1/confirmation"].at && A.periodAfterConfirm && JSON.stringify(A.periodAfterConfirm.snapStaff) === '["田中","佐藤"]' && A.periodAfterConfirm.lockedAt && histKeys.length === 1 && cw[histKeys[0]].kind === "confirm" && !("p1/lockedAt" in cw && cw["p1/lockedAt"] !== null)),
    A_lmFrozen: !!(A.lmPatch && A.lmPatch["2026-11/田中"] && A.lmPatch["2026-11/田中"].days === 2 && A.lmPatch["2026-11/田中"].min === 840 && A.lmPatch["2026-11/田中"].frozenAt
      && JSON.stringify(A.lmPatch["2026-11/田中"].auto) === JSON.stringify({ days: 2, min: 840 })),
    A_cellsLocked: !!(A.afterConfirm && A.afterConfirm.readOnly === true && A.afterConfirm.cellUnchanged === true && A.afterConfirm.saveBtn === false && A.afterConfirm.submitBtn === false),
    A_badge: !!(A.afterConfirm && A.afterConfirm.badge === "確定済み（編集不可）"),
    A_schedFrozenTitle: !!(A.afterConfirm && A.afterConfirm.sched && /（確定済み）/.test(A.afterConfirm.sched.title)),
    A_snapshotNotRewritten: A.snapshotRewritten === false,
    A_deliver: !!(A.deliverWrite && A.deliverWrite.some(ks => ks.includes("p1/delivery") && ks.some(k => k.startsWith("p1/history/"))) && A.badgeDelivered === "delivered"),
    A_unconfirm: !!(A.unconfirmWrite && A.unconfirmWrite["p1/confirmation"] === null && A.unconfirmWrite["p1/delivery"] === null
      && Object.keys(A.unconfirmWrite).some(k => k.startsWith("p1/history/") && A.unconfirmWrite[k].kind === "unconfirm" && A.unconfirmWrite[k].note === "所定の直し")),
    A_unfreeze: !!(A.unfreezePatch && A.unfreezePatch["2026-11/田中/frozenAt"] === null),
    A_editableAgain: !!(A.afterUnconfirm && A.afterUnconfirm.readOnly === false && A.afterUnconfirm.badge === false && A.afterUnconfirm.cellEdited === "12:00"),
    A_manual: !!(A.manualPatch && A.manualPatch["2026-11/田中"] && A.manualPatch["2026-11/田中"].days === 20 && A.manualPatch["2026-11/田中"].min === 9600 && A.manualState === "saved"),
    A_manualRow: !!(A.schedAfterManual && A.schedAfterManual.text === "160:00 −10:57"),
    A_pdfRows: typeof A.pdfText === "string" && A.pdfText.includes("月所定/上限") && A.pdfText.includes("年平均所定/分母"),
    A_noConfirmWithoutSession: A.noSessionConfirmBtn === false,
    S_standaloneConfirm: S.confirmBtn === true,
    Q_hqPanel: Q.panel === true,
    Q_hqFill: !!(Q.toast === "✓ 36件に固定勤務パターンを入れました" && Q.tanaka && Q.tanaka.n === 19 && Q.tanaka.d1102.start === "10:00" && !Q.tanaka.d1103
      && Q.tanaka.d1105 && Q.tanaka.d1105.adjustedStart === "09:00" && Q.tanaka.d1105.adjustedEnd === "18:00" && Q.tanaka.d1105.adjustedBreak === 60
      && Q.sato && Q.sato.n === 19 && Q.sato.source === "grid" && !Q.sato.hol23 && !Q.sato.sat07),
    B_headers: !!(B.headers && B.headers.join("|") === "店舗|期間|状況|確定|交付|"),
    B_confirm: !!(B.confirmation && B.confirmation.byUid === "U1" && B.snapshot && B.lm && B.lm.days === 2 && B.lm.min === 840 && B.lm.frozenAt && B.summary === "確定 1 ／ 交付 0"),
    B_deliver: !!(B.delivery && B.delivery.at),
    B_history: typeof B.history === "string" && /確定/.test(B.history) && /交付/.test(B.history),
    B_unconfirm: !!(B.afterUnconfirm && B.afterUnconfirm.confirmation == null && B.afterUnconfirm.delivery == null && B.afterUnconfirm.lm && !B.afterUnconfirm.lm.frozenAt && B.afterUnconfirm.histCount === 3),
    D_staffBanner: D.banner === "この期間のシフトは確定済みです（提出・修正はできません）",
    D_staffBlocked: D.subCalls === 0 && D.confirmModal === false && D.toastShown === true,
    noErrors: [A, S, Q, B, D].every(x => x.errors.length === 0 && !x.exception),
  };
  v.allPass = Object.values(v).every(Boolean);
  console.log(JSON.stringify({ A, S, Q, B, D, verdict: v }, null, 2));
  process.exit(v.allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
