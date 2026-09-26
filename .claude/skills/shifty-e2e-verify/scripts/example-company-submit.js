// 完成シフトの企業への提出と提出期限（2026-09-27 企業連携の拡張）の実ブラウザ回帰テスト。
// Firebase へは1バイトも出ない。
//
// A. シフト作成タブ単体:
//   - 企業に連携した店舗（companyLink あり）では「提出」ボタンと、ボタン行の下に「提出期限 9/25(金) 日付指定」が出る。
//     未提出の間は赤地（#C62828）に白文字の帯、提出済みになったら赤地をやめる
//   - 日付指定が無い期間は毎月の固定締切（[10,25]）から 9/25 が出て、出どころが「毎月の提出締切」になる
//   - 提出で savePeriods に period.submission={at,byUid} が入り、差分書き込みは "p1/submission" の1本だけ
//   - 提出後のボタンは「再提出」（取り消しは無い）。再提出で submission が新しい {at,byUid} に丸ごと置き換わり、
//     差分は "p1/submission" の1本だけ（periods を丸ごと set しない）
//   - companyLink が無い店舗では提出ボタンも期限も出ない
// B. アプリ全体（stub-firebase.js）:
//   - 企業連携タブの「シフトの提出状況」に「2026年10月前半」の選択肢、店舗ごとの状況、件数行が出る
//   - 既定の期間は、どれか1店舗でも作っている最新の期間（2026-09-27 ユーザー指示）
//   - 提出期限は全店舗共通の1つだけで、表に店舗別の期限の列・入力欄は無い
//   - 期間の無い店舗は「該当期間なし」で件数に数えない
//   - 提出期限を変えて保存すると saveCompanyConfig が deadlines 付きで1回呼ばれ、
//     各店舗の写し（shops/{sid}/company/deadlines）に反映される
//   - 保存ボタンは「提出期限を保存」1つだけ。毎月の提出締切を追加して保存すると saveCompanyConfig が
//     monthlyDeadlineDays だけを付けて呼ばれ（変えていない deadlines は送らない）、写しに入る
//   - 日付指定の無い期間（10月後半）の日付欄は、毎月の締切から出した日付が初期値になる
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

async function partA(withLink, monthlyOnly) {
  const link = !withLink ? "null" : monthlyOnly
    ? `{id:"C1",name:"テスト企業",settings:{},deadlines:{},monthlyDeadlineDays:[10,25],shops:{}}`
    : `{id:"C1",name:"テスト企業",settings:{},deadlines:{"${RK}":"2026-09-25"},monthlyDeadlineDays:[10],shops:{}}`;
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
  R.deadline = await h.evaluate(`(()=>{const e=document.querySelector("[data-co-deadline]");if(!e)return null;const d=e.querySelector("[data-co-deadline-date]");
    const hdr=[...document.querySelectorAll("button")].find(b=>b.innerText.trim()==="提出");
    return{text:e.innerText.replace(/\\s+/g," ").trim(),source:e.getAttribute("data-co-deadline-source"),color:getComputedStyle(d).color,bg:getComputedStyle(e).backgroundColor,
      belowButtons:!!(hdr&&e.getBoundingClientRect().top>=hdr.getBoundingClientRect().bottom)};})()`);
  if (withLink && !monthlyOnly) {
    await h.clickExact("提出");
    await h.page.waitForTimeout(300);
    R.afterSubmit = { resubmitBtn: await h.evaluate(btn("再提出")), cancelBtnGone: !(await h.evaluate(btn("提出を取り消す"))), label: await h.evaluate(`(document.querySelector("[data-co-submitted]")||{}).innerText||null`), toast: await h.evaluate(() => window.__toast),
      bannerBg: await h.evaluate(`getComputedStyle(document.querySelector("[data-co-deadline]")).backgroundColor`),
      bannerState: await h.evaluate(`document.querySelector("[data-co-deadline-state]").innerText.trim()`) };
    await h.page.waitForTimeout(20);
    await h.clickExact("再提出");
    await h.page.waitForTimeout(300);
    R.afterResubmit = { resubmitBtn: await h.evaluate(btn("再提出")), toast: await h.evaluate(() => window.__toast) };
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
    R.options = await h.evaluate(() => { const c = document.querySelector("[data-co-summary]").closest("div").parentElement; return [...c.querySelectorAll("select:not([data-co-monthly-day]) option")].map(o => o.text); });
    // 既定は最新の期間＝D店1店舗だけが作っている「10月後半」。そのあと10月前半を選んで測る
    R.defaultSelected = await h.evaluate(() => { const c = document.querySelector("[data-co-summary]").closest("div").parentElement; const sel = c.querySelector("select:not([data-co-monthly-day])"); return sel.options[sel.selectedIndex].text; });
    await h.evaluate(rk => { const c = document.querySelector("[data-co-summary]").closest("div").parentElement; const sel = c.querySelector("select:not([data-co-monthly-day])");
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
      const lab = [...document.querySelectorAll("span")].find(s => s.innerText.trim() === "この期間の提出期限（日付指定）");
      const inp = lab.parentElement.querySelector("input[type=date]");
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      set.call(inp, "2026-10-05"); inp.dispatchEvent(new Event("input", { bubbles: true })); inp.dispatchEvent(new Event("change", { bubbles: true }));
      return "ok";
    });
    await h.page.waitForTimeout(200);
    R.clickSave = await h.clickByText("提出期限を保存");
    await h.page.waitForTimeout(900);
    R.cf = await h.evaluate(() => window.__cf.map(c => ({ name: c.name, deadlines: c.payload.deadlines, hasMonthly: c.payload.monthlyDeadlineDays !== undefined })));
    R.saveButtons = await h.evaluate(() => { const c = document.querySelector("[data-co-summary]").closest("div").parentElement;
      return [...c.querySelectorAll("button")].map(b => b.innerText.trim()).filter(t => /保存/.test(t)); });
    R.mirrorS2 = await h.evaluate(rk => (window.__db("shops/S2/company/deadlines") || {})[rk] || null, RK);
    R.pendingColorAfter = await h.evaluate(() => getComputedStyle(document.querySelector('[data-co-row="S2"] [data-co-status]')).color);
    // 毎月の提出締切: 「＋ 追加」で2件（25日・10日）にして保存
    await h.clickByText("＋ 追加");
    await h.page.waitForTimeout(150);
    await h.clickByText("＋ 追加");
    await h.page.waitForTimeout(150);
    // 追加直後は日が未選択（初期値は人が決める・2026-09-27 ユーザー指示）。未選択のままでは保存できない
    R.monthlyUnchosen = await h.evaluate(() => [...document.querySelectorAll("[data-co-monthly-day]")].map(x => x.value));
    R.monthlySaveDisabledWhileUnchosen = await h.evaluate(() => [...document.querySelectorAll("button")].find(b => b.innerText.trim() === "提出期限を保存").disabled);
    const pick = async (i, v) => { await h.evaluate(([i, v]) => { const s = document.querySelector(`[data-co-monthly-day="${i}"]`); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
      set.call(s, v); s.dispatchEvent(new Event("change", { bubbles: true })); }, [i, v]); await h.page.waitForTimeout(150); };
    await pick(0, "25");
    await pick(1, "10");
    R.clickMonthly = await h.clickByText("提出期限を保存");
    await h.page.waitForTimeout(900);
    R.cfMonthly = await h.evaluate(() => window.__cf.filter(c => c.payload.monthlyDeadlineDays !== undefined).map(c => ({ days: c.payload.monthlyDeadlineDays, hasDeadlines: c.payload.deadlines !== undefined })));
    R.mirrorMonthlyS4 = await h.evaluate(() => window.__db("shops/S4/company/monthlyDeadlineDays"));
    // 日付指定の無い10月後半へ切り替え、日付欄の初期値と「適用される期限」を見る
    await h.evaluate(() => { const c = document.querySelector("[data-co-summary]").closest("div").parentElement; const sel = c.querySelector("select:not([data-co-monthly-day])");
      const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set; set.call(sel, "2026-10-16_2026-10-31"); sel.dispatchEvent(new Event("change", { bubbles: true })); });
    await h.page.waitForTimeout(300);
    R.laterInput = await h.evaluate(() => document.querySelector("[data-co-effective]").parentElement.querySelector("input[type=date]").value);
    R.laterEffective = await h.evaluate(() => document.querySelector("[data-co-effective]").innerText.trim());
  } catch (e) { R.exception = e.message; }
  R.errors = h.errors.slice();
  await h.close();
  return R;
}

(async () => {
  const A = await partA(true);
  const A0 = await partA(false);
  const AM = await partA(true, true);
  const B = await partB();
  const RED = "rgb(255, 71, 87)";
  const v = {
    A_submitShown: A.hasSubmit === true,
    A_deadlineText: !!(A.deadline && A.deadline.text === "提出期限 9/25(金) 日付指定 期限を過ぎています" && A.deadline.source === "date"),
    A_deadlineBelowButtons: !!(A.deadline && A.deadline.belowButtons),
    AM_monthlyFallback: !!(AM.deadline && AM.deadline.source === "monthly" && /^提出期限 9\/25\(金\) 毎月の提出締切 /.test(AM.deadline.text)),
    A_deadlineRedBanner: !!(A.deadline && A.deadline.bg === "rgb(198, 40, 40)" && A.deadline.color === "rgb(255, 255, 255)"),
    A_bannerCalmAfterSubmit: !!(A.afterSubmit && A.afterSubmit.bannerBg !== "rgb(198, 40, 40)" && A.afterSubmit.bannerState === "提出済み"),
    A_submitWritesOneKey: !!(A.writes && A.writes[0] && Object.keys(A.writes[0]).join() === "p1/submission" && A.writes[0]["p1/submission"].at),
    A_submittedLabel: !!(A.afterSubmit && A.afterSubmit.resubmitBtn && A.afterSubmit.cancelBtnGone && /^提出済み \d+\/\d+ \d\d:\d\d$/.test(A.afterSubmit.label || "")),
    A_resubmitReplaces: !!(A.writes && A.writes[1] && Object.keys(A.writes[1]).join() === "p1/submission"
      && A.writes[1]["p1/submission"] && Object.keys(A.writes[1]["p1/submission"]).sort().join() === "at,byUid"
      && A.writes[1]["p1/submission"].at > A.writes[0]["p1/submission"].at),
    A_resubmitStays: !!(A.afterResubmit && A.afterResubmit.resubmitBtn && A.afterResubmit.toast === "✓ 企業にシフトを再提出しました"),
    A0_hiddenWithoutCompany: A0.hasSubmit === false && A0.deadline === null,
    B_options: !!(B.options && B.options.join("|") === "2026年10月後半|2026年10月前半"),
    B_defaultIsNewest: B.defaultSelected === "2026年10月後半",
    B_noPerShopDeadline: !!(B.headers && B.headers.join("|") === "店舗|期間|状況" && B.rowDateInputs === 0),
    B_summary: B.summary === "提出済み 2 ／ 未提出 1",
    B_rows: !!(B.rows && B.rows.S1.status === "submitted" && B.rows.S2.status === "pending" && B.rows.S3.status === "submitted" && B.rows.S4.status === "none"),
    B_overdueRed: !!(B.rows && B.rows.S2.color === RED),
    B_cfDeadlines: !!(B.cf && B.cf.length === 1 && B.cf[0].name === "saveCompanyConfig" && JSON.stringify(B.cf[0].deadlines) === JSON.stringify({ [RK]: { all: "2026-10-05" } }) && B.cf[0].hasMonthly === false),
    B_oneSaveButton: !!(B.saveButtons && B.saveButtons.join("|") === "提出期限を保存"),
    B_mirrorUpdated: B.mirrorS2 === "2026-10-05",
    B_monthlyAddIsUnchosen: !!(B.monthlyUnchosen && B.monthlyUnchosen.join() === "," && B.monthlySaveDisabledWhileUnchosen === true),
    B_cfMonthly: !!(B.cfMonthly && B.cfMonthly.length === 1 && JSON.stringify(B.cfMonthly[0].days) === "[10,25]" && B.cfMonthly[0].hasDeadlines === false),
    B_mirrorMonthly: JSON.stringify(B.mirrorMonthlyS4) === "[10,25]",
    B_laterInitialFromMonthly: B.laterInput === "2026-10-10" && B.laterEffective === "適用される期限: 10/10(土)（毎月の提出締切）",
    noErrors: A.errors.length === 0 && A0.errors.length === 0 && AM.errors.length === 0 && B.errors.length === 0 && !B.exception,
  };
  v.allPass = Object.values(v).every(Boolean);
  console.log(JSON.stringify({ A, A0, AM, B, verdict: v }, null, 2));
  process.exit(v.allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
