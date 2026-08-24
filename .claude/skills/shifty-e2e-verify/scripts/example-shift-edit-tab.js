// mount-component.js の動作サンプル兼リグレッションテスト。
// バグチェック#93「選択中の期間が他端末で削除されたあと保存を押すと、消えた期間の日付が
// 別の期間のsubへ書き込まれる」（app-admin.js:443・修正 f3669d1）をそのまま再現する。
//
//   node .claude/skills/shifty-e2e-verify/scripts/example-shift-edit-tab.js
//
// 期待する出力: verdict.allPass === true。
// 修正前は step3_leak が "2026-07-02 が期間Bのsubに入った" になり false になる。
// Firebase へは1バイトも書かない（app-main.js を読み込まないので firebaseDB は null）。
"use strict";

const path = require("node:path");
const { openHarness } = require(path.join(__dirname, "mount-component.js"));

const JSX = `
const PA={id:"pA",urlToken:"tA",shopId:"S1",label:"7月前半",startDate:"2026-07-01",endDate:"2026-07-15",deadlineDate:"",createdAt:"2026-06-01T00:00:00.000Z"};
const PB={id:"pB",urlToken:"tB",shopId:"S1",label:"8月前半",startDate:"2026-08-01",endDate:"2026-08-15",deadlineDate:"",createdAt:"2026-07-01T00:00:00.000Z"};
const SUB_A={id:"subA",periodId:"pA",staffName:"田中",shopId:"S1",comment:"",submittedAt:"2026-06-20T00:00:00.000Z",
  shifts:{"2026-07-02":{status:"work",start:"09:00",end:"17:00"}}};
const SUB_B={id:"subB",periodId:"pB",staffName:"田中",shopId:"S1",comment:"",submittedAt:"2026-07-20T00:00:00.000Z",
  shifts:{"2026-08-03":{status:"work",start:"10:00",end:"18:00"}}};

// 親が periods / subs を持つことで、他端末の変更（期間削除・購読echo）を window.__setPeriods で注入できる。
// onSave はここで受け止めるだけ＝Firebaseへは出ない。
function Harness(){
  const [periods,setPeriods]=React.useState([PB,PA]);
  const [subs,setSubs]=React.useState([SUB_A,SUB_B]);
  window.__setPeriods=setPeriods;
  const onSave=v=>setSubs(prev=>{const next=(typeof v==="function")?v(prev):v;window.__subs=next;return next;});
  return <ShiftEditTab
    subs={subs} periods={periods} staffList={["田中","佐藤"]}
    onSave={onSave} tt={m=>{window.__toast=m;}}
    settings={{candidates:[],weekdayCandidates:{},dateCandidates:{},templates:[]}}
    plan="premium" shopId="S1" shopName="テスト店" onUpgrade={()=>{}} allLinkedShops={[]}
    onLoadPastSubs={()=>{}} pastSubsLoaded={true}
    savePeriods={()=>{}} ownerReadOnly={false}/>;
}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);
`;

(async () => {
  const h = await openHarness({ jsx: JSX, waitFor: "select" });
  const out = {};
  const shiftsOf = id => h.evaluate(i => {
    const s = (window.__subs || []).find(x => x.id === i);
    return s ? Object.keys(s.shifts || {}).sort() : null;
  }, id);
  const toast = () => h.evaluate(() => window.__toast);

  try {
    // 1) 期間Aへ切替（ドロップダウンはバッファをクリアする＝ここは既存の正しい経路）
    await (await h.page.$("select")).selectOption("pA");
    await h.page.waitForTimeout(300);

    // 2) 期間Aの 7/2 出勤セルを 9→11 に確定。期間Aのsubへ正しく入るはず
    await h.fill(h.cell("田中", "2026-07-02", "start"), "11");
    out.step2_periodA_applied = await h.evaluate(() =>
      window.__subs.find(s => s.id === "subA").shifts["2026-07-02"].adjustedStart);

    // 3) 他端末が期間Aを削除した想定。selPid が pB へ自動補正される
    await h.evaluate(() => window.__setPeriods([{
      id: "pB", urlToken: "tB", shopId: "S1", label: "8月前半",
      startDate: "2026-08-01", endDate: "2026-08-15", deadlineDate: "", createdAt: "2026-07-01T00:00:00.000Z" }]));
    await h.page.waitForTimeout(400);
    out.step3_selPid = await h.page.$eval("select", el => el.value);

    // 4) ここで保存。期間Aの日付が期間Bのsubへ漏れてはいけない
    await h.clickByText("保存");
    out.step4_toast = await toast();
    out.step4_subB_dates = await shiftsOf("subB");

    // 5) 非回帰: 同一期間での編集→保存が従来どおり効くこと（未提出スタッフへの新規sub作成も含む）
    await h.fill(h.cell("田中", "2026-08-03", "start"), "12");
    await h.fill(h.cell("佐藤", "2026-08-04", "end"), "21");
    await h.clickByText("保存");
    out.step5_toast = await toast();
    out.step5_subB = await h.evaluate(() => window.__subs.find(s => s.id === "subB").shifts["2026-08-03"]);
    out.step5_sato = await h.evaluate(() => {
      const s = window.__subs.find(x => x.staffName === "佐藤");
      return s ? { periodId: s.periodId, source: s.source, dates: Object.keys(s.shifts || {}) } : null;
    });

    out.errors = h.errors;
    out.verdict = {
      step2_editApplied: out.step2_periodA_applied === "11:00",
      step3_selPidMovedToB: out.step3_selPid === "pB",
      step4_noLeak: JSON.stringify(out.step4_subB_dates) === JSON.stringify(["2026-08-03"]),
      step4_nothingToSave: out.step4_toast === "変更はありません",
      step5_savedBoth: /2件/.test(out.step5_toast || ""),
      step5_satoInRange: !!out.step5_sato && out.step5_sato.source === "grid"
        && JSON.stringify(out.step5_sato.dates) === JSON.stringify(["2026-08-04"]),
      noConsoleErrors: h.errors.length === 0,
    };
    out.verdict.allPass = Object.entries(out.verdict).every(([k, v]) => k === "allPass" || v === true);
    console.log(JSON.stringify(out, null, 2));
    process.exitCode = out.verdict.allPass ? 0 : 1;
  } finally {
    await h.close();
  }
})().catch(e => { console.error("FATAL", e); process.exit(1); });
