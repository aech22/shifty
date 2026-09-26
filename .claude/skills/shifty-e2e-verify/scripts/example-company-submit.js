// 完成シフトの企業への提出と提出期限（2026-09-27 企業連携の拡張）の実ブラウザ回帰テスト。
// Firebase へは1バイトも出ない。
//
// A. シフト作成タブ単体:
//   - 企業に連携した店舗（companyLink あり）では「提出」ボタンと「提出期限 9/25(金)」が出る。期限切れの未提出は赤
//   - 提出で savePeriods に period.submission={at,byUid} が入り、差分書き込みは "p1/submission" の1本だけ
//   - 取り消しで submission が消え、差分は {"p1/submission": null} の1本だけ（periods を丸ごと set しない）
//   - companyLink が無い店舗では提出ボタンも期限も出ない
// B. アプリ全体（stub-firebase.js）:
//   - 企業連携タブの「シフトの提出状況」に「2026年10月前半」の選択肢、店舗ごとの状況、件数行が出る
//   - 既定の期間は、どれか1店舗でも作っている最新の期間（2026-09-27 ユーザー指示）
//   - 提出期限は全店舗共通の1つだけで、表に店舗別の期限の列・入力欄は無い
//   - 期間の無い店舗は「該当期間なし」で件数に数えない
//   - 提出期限を変えて保存すると saveCompanyConfig が deadlines 付きで1回呼ばれ、
//     各店舗の写し（shops/{sid}/company/deadlines）に反映される
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-company-submit.js → allPass=true / EXIT=0
"use strict";
const path = require("node:path");
const { openHarness, REPO_ROOT } = require(path.join(__dirname, "mount-component.js"));
const { makeStub } = require(path.join(__dirname, "stub-firebase.js"));
const ROOT = process.env.SHIFTY_ROOT || REPO_ROOT;
const THEME = `<style>:root{--c-bg:#F0F2F5;--c-card:#FFFFFF;--c-input:#F3F4F6;--c-input2:#F0F2F5;` +
  `--c-border:#E5E7EB;--c-border2:#D1D5DB;--c-text:#1A1A2E;--c-text2:#374151;--c-text3:#6B7280;` +
  `--c-text4:#9CA3AF;--c-shadow:rgba(0,0,0,.06);--c-accent:#f87036;--c-danger:#DC2626;}</style>`;
const RK = "2026-10-01_2026-10-15";

async function partA(withLink) {
  const link = withLink ? `{id:"C1",name:"テスト企業",settings:{},deadlines:{"${RK}":"2026-09-25"},shops:{}}` : "null";
  const h = await openHarness({
    root: ROOT, extraHead: THEME, waitFor: "select",
    jsx: `
window.confirm=()=>true;
const P={id:"p1",urlToken:"t1",shopId:"S1",label:"10月前半",startDate:"2026-10-01",endDate:"2026-10-15",deadlineDate:"",createdAt:"2026-09-01T00:00:00.000Z"};
const SETTINGS={shopId:"S1",candidates:[{start:"09:00",end:"23:00"}],weekdayCandidates:{},dateCandidates:{},
  breakTimes:{weekday:[],sat:[],sun:[],holSat:[],holSun:[]},staffAttributes:{},staffTypeLimits:{},
  staffColors:{},staffAliases:{},positions:{kitchen:[],hall:[]},requiredPositions:{},staffPositions:{}};
window.__writes=[];
function Harness(){
  const [periods,setPeriods]=React.useState([P]);
  const savePeriods=v=>{window.__writes.push(diffPeriodsForFlatWrite(periods,v));setPeriods(v);};
  return <ShiftEditTab subs={[]} periods={periods} staffList={["田中"]} onSave={()=>{}} tt={m=>{window.__toast=m;}}
    settings={SETTINGS} plan="premium" shopId="S1" shopName="A店" onUpgrade={()=>{}}
    savePeriods={savePeriods} ownerReadOnly={false} pastSubsLoaded={true} companyLink={${link}}/>;
}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);`,
  });
  const R = {};
  const btn = label => `[...document.querySelectorAll("button")].some(b=>b.innerText.trim()===${JSON.stringify(label)})`;
  R.hasSubmit = await h.evaluate(btn("提出"));
  R.deadline = await h.evaluate(`(()=>{const e=document.querySelector("[data-co-deadline]");return e?{text:e.innerText.trim(),color:getComputedStyle(e).color}:null;})()`);
  if (withLink) {
    await h.clickExact("提出");
    await h.page.waitForTimeout(300);
    R.afterSubmit = { cancelBtn: await h.evaluate(btn("提出を取り消す")), label: await h.evaluate(`(document.querySelector("[data-co-submitted]")||{}).innerText||null`), toast: await h.evaluate(() => window.__toast) };
    await h.clickExact("提出を取り消す");
    await h.page.waitForTimeout(300);
    R.afterCancel = { submitBtn: await h.evaluate(btn("提出")) };
    // 1本目以降には期間を開いたときの既存の写し書き込み（snapshot・laborTotals）が入りうるので、最後の2本を見る
    R.writes = await h.evaluate(() => window.__writes.slice(-2));
  }
  R.errors = h.errors.slice();
  await h.close();
  return R;
}

async function partB() {
  const UID = "U1", CID = "C1";
  const per = (id, sid, extra) => ({ id, urlToken: "t" + id, shopId: sid, label: "10月前半", startDate: "2026-10-01", endDate: "2026-10-15", deadlineDate: "", createdAt: "2026-09-01T00:00:00.000Z", ...(extra || {}) });
  const shop = (sid, periods) => ({ owners: { [UID]: "K" + sid, [`company_${CID}`]: "K" + sid }, private: { adminKey: "K" + sid }, staff: { 0: "田中" }, periods });
  const seed = {
    global: { shops: { S1: { id: "S1", name: "A店" }, S2: { id: "S2", name: "B店" }, S3: { id: "S3", name: "C店" }, S4: { id: "S4", name: "D店" } } },
    shops: {
      S1: shop("S1", { p1: per("p1", "S1", { submission: { at: "2026-09-24T05:03:00.000Z", byUid: "x" } }) }),
      S2: shop("S2", { p2: per("p2", "S2") }),
      S3: shop("S3", { p3: per("p3", "S3", { submission: { at: "2026-09-25T01:00:00.000Z", byUid: "y" } }) }),
      S4: shop("S4", { p4: { ...per("p4", "S4"), startDate: "2026-10-16", endDate: "2026-10-31", label: "10月後半" } }),
    },
    accounts: { S1: { plan: "premium" }, [UID]: { shops: { S1: true, S2: true, S3: true, S4: true }, company: { companyId: CID, code: "ABCD1234", name: "テスト企業" } } },
    companies: { [CID]: { pub: { name: "テスト企業", ownerUid: UID, code: "ABCD1234", shops: { S1: true, S2: true, S3: true, S4: true },
      config: { deadlines: { [RK]: { all: "2026-09-25" } } } } } },
  };
  const h = await openHarness({
    root: ROOT, jsx: "window.__harnessReady=true;", waitFor: "#root > *", viewport: { width: 1400, height: 950 },
    extraHead: THEME + makeStub({ seed, uid: UID, view: "admin", tab: "company", cfHandlers: { saveCompanyConfig: "companyConfig" } }),
    scripts: ["app-utils.js", "app-core.js", "app-staff.js", "app-admin.js", "app-main.js"].map(src => ({ src, babel: !/utils|core/.test(src) })),
  });
  const R = {};
  try {
    await h.page.waitForFunction(() => !!document.querySelector("[data-co-summary]"), { timeout: 15000 });
    R.options = await h.evaluate(() => { const c = document.querySelector("[data-co-summary]").closest("div").parentElement; return [...c.querySelectorAll("select option")].map(o => o.text); });
    // 既定は最新の期間＝D店1店舗だけが作っている「10月後半」。そのあと10月前半を選んで測る
    R.defaultSelected = await h.evaluate(() => { const c = document.querySelector("[data-co-summary]").closest("div").parentElement; const sel = c.querySelector("select"); return sel.options[sel.selectedIndex].text; });
    await h.evaluate(rk => { const c = document.querySelector("[data-co-summary]").closest("div").parentElement; const sel = c.querySelector("select");
      const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set; set.call(sel, rk); sel.dispatchEvent(new Event("change", { bubbles: true })); }, RK);
    await h.page.waitForTimeout(300);
    R.summary = await h.evaluate(() => document.querySelector("[data-co-summary]").innerText.trim());
    R.headers = await h.evaluate(() => [...document.querySelector("[data-co-row]").closest("table").querySelectorAll("th")].map(t => t.innerText.trim()));
    R.rowDateInputs = await h.evaluate(() => [...document.querySelectorAll("[data-co-row] input")].length);
    R.rows = await h.evaluate(() => Object.fromEntries([...document.querySelectorAll("[data-co-row]")].map(tr => {
      const st = tr.querySelector("[data-co-status]");
      return [tr.getAttribute("data-co-row"), { status: st.getAttribute("data-co-status"), text: st.innerText.trim(), color: getComputedStyle(st).color }];
    })));
    R.setDate = await h.evaluate(() => {
      const lab = [...document.querySelectorAll("span")].find(s => s.innerText.trim() === "提出期限");
      const inp = lab.parentElement.querySelector("input[type=date]");
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      set.call(inp, "2026-10-05"); inp.dispatchEvent(new Event("input", { bubbles: true })); inp.dispatchEvent(new Event("change", { bubbles: true }));
      return "ok";
    });
    await h.page.waitForTimeout(200);
    R.clickSave = await h.clickByText("提出期限を保存");
    await h.page.waitForTimeout(900);
    R.cf = await h.evaluate(() => window.__cf.map(c => ({ name: c.name, deadlines: c.payload.deadlines })));
    R.mirrorS2 = await h.evaluate(rk => (window.__db("shops/S2/company/deadlines") || {})[rk] || null, RK);
    R.pendingColorAfter = await h.evaluate(() => getComputedStyle(document.querySelector('[data-co-row="S2"] [data-co-status]')).color);
  } catch (e) { R.exception = e.message; }
  R.errors = h.errors.slice();
  await h.close();
  return R;
}

(async () => {
  const A = await partA(true);
  const A0 = await partA(false);
  const B = await partB();
  const RED = "rgb(255, 71, 87)";
  const v = {
    A_submitShown: A.hasSubmit === true,
    A_deadlineText: !!(A.deadline && A.deadline.text === "提出期限 9/25(金)"),
    A_deadlineOverRed: !!(A.deadline && A.deadline.color === RED),
    A_submitWritesOneKey: !!(A.writes && A.writes[0] && Object.keys(A.writes[0]).join() === "p1/submission" && A.writes[0]["p1/submission"].at),
    A_submittedLabel: !!(A.afterSubmit && A.afterSubmit.cancelBtn && /^提出済み \d+\/\d+ \d\d:\d\d$/.test(A.afterSubmit.label || "")),
    A_cancelWritesNull: !!(A.writes && A.writes[1] && Object.keys(A.writes[1]).join() === "p1/submission" && A.writes[1]["p1/submission"] === null),
    A_backToSubmit: !!(A.afterCancel && A.afterCancel.submitBtn),
    A0_hiddenWithoutCompany: A0.hasSubmit === false && A0.deadline === null,
    B_options: !!(B.options && B.options.join("|") === "2026年10月後半|2026年10月前半"),
    B_defaultIsNewest: B.defaultSelected === "2026年10月後半",
    B_noPerShopDeadline: !!(B.headers && B.headers.join("|") === "店舗|期間|状況" && B.rowDateInputs === 0),
    B_summary: B.summary === "提出済み 2 ／ 未提出 1",
    B_rows: !!(B.rows && B.rows.S1.status === "submitted" && B.rows.S2.status === "pending" && B.rows.S3.status === "submitted" && B.rows.S4.status === "none"),
    B_overdueRed: !!(B.rows && B.rows.S2.color === RED),
    B_cfDeadlines: !!(B.cf && B.cf.length === 1 && B.cf[0].name === "saveCompanyConfig" && JSON.stringify(B.cf[0].deadlines) === JSON.stringify({ [RK]: { all: "2026-10-05" } })),
    B_mirrorUpdated: B.mirrorS2 === "2026-10-05",
    noErrors: A.errors.length === 0 && A0.errors.length === 0 && B.errors.length === 0 && !B.exception,
  };
  v.allPass = Object.values(v).every(Boolean);
  console.log(JSON.stringify({ A, A0, B, verdict: v }, null, 2));
  process.exit(v.allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
