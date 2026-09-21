// 提出一覧タブの「行の超過判定」と「詳細モーダルの勤務時間」が、keepAttrs を持つ期間で
// 同じ属性を見ているかを実ブラウザで測る（SKILL.md 1.6節・app-main.js を読まないので Firebase へは出ない）。
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-subs-keepattrs.js            → allPass=true / EXIT=0
// 反証: SHIFTY_ROOT=<修正前の写し> node ...      → EXIT=1
"use strict";
const path = require("node:path");
const { openHarness } = require(path.join(__dirname, "mount-component.js"));

const ROOT = process.env.SHIFTY_ROOT || undefined;

(async () => {
  const h = await openHarness({
    root: ROOT,
    waitFor: "table",
    jsx: `
      function Harness(){
        // 9月後半（進行中）。管理者は田中を夏季属性 "summer" から現在の "parttime" に戻したが、
        // この期間だけは旧属性のままにする指定（keepAttrs）を残している。
        const periods=[{id:"p1",label:"9月後半",startDate:"2026-09-16",endDate:"2026-09-30",
          deadlineDate:"2026-09-30",keepAttrs:{"田中":"summer"}}];
        const settings={shopId:"s1",candidates:[],staffColors:{},staffAliases:{},
          staffAttributes:{"田中":"parttime"},
          // summer も parttime も1日7時間まで。純勤務が7時間を超えると行に「1日超過」が出る
          staffTypeLimits:{summer:{name:"夏休み",daily:7},parttime:{name:"バイト",daily:7}},
          // 休憩は属性タグで絞る。summer は60分・parttime は120分
          breakTimes:{weekday:[
            {start:"12:00",end:"13:00",tags:["summer"]},
            {start:"12:00",end:"14:00",tags:["parttime"]}]}};
        const subs=[{id:"sub1",periodId:"p1",staffName:"田中",shopId:"s1",
          submittedAt:"2026-09-17T10:00:00.000Z",comment:"",
          shifts:{"2026-09-24":{status:"work",start:"09:00",end:"18:00"}}}];
        return <SubsTab subs={subs} periods={periods} staffList={["田中"]}
          onSave={()=>{}} tt={()=>{}} settings={settings} onSaveSettings={()=>{}} plan="premium"/>;
      }
      ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);
    `,
  });

  const R = {};
  R.rowOverBadge = await h.evaluate(() => document.body.innerText.includes("1日超過"));

  await h.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(x => x.textContent.trim() === "詳細");
    if (!b) throw new Error("no detail button");
    b.click();
  });
  await new Promise(r => setTimeout(r, 400));

  R.modal = await h.evaluate(() => {
    const t = document.body.innerText;
    const pick = re => { const m = t.match(re); return m ? m[1] : null; };
    return {
      worked: pick(/勤務計\s*\n?\s*([0-9]+:[0-9]{2})/),
      total: pick(/合計：([0-9]+:[0-9]{2})/),
      week: pick(/9\/21〜9\/27\s*\n?\s*([0-9]+:[0-9]{2})/),
    };
  });

  R.consoleErrors = h.errors || [];
  await h.close();

  const pass = {
    "row_shows_daily_over": R.rowOverBadge === true,
    "modal_worked_total_is_8h": R.modal.worked === "8:00",
    "modal_grand_total_is_8h": R.modal.total === "8:00",
    "modal_weekly_is_8h": R.modal.week === "8:00",
    "no_console_errors": R.consoleErrors.length === 0,
  };
  console.log(JSON.stringify({ measured: R, pass }, null, 2));
  const allPass = Object.values(pass).every(Boolean);
  console.log("allPass =", allPass);
  process.exit(allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
