// 提出一覧タブの「行の1日超過バッジ」と「同じ行の週判定・詳細モーダルの週間勤務時間」が、
// 同じ人・同じ日について同じシフトを読んでいるかを実ブラウザで測る（SKILL.md 1.6節）。
// app-main.js を読まないので Firebase へは1バイトも出ない。
//
// 仕掛け: 別名は1件も使わず、**期間の重なり**だけで「同じ名前|日付のシフトが2つある」状態を作る。
// 期間の重なりは PEF が警告のみで通す（2026-08-25 決定・案B）ので、別名を使わない店舗でも到達する。
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-subs-daily-vs-week.js   → allPass=true / EXIT=0
// 反証: SHIFTY_ROOT=<修正前の写し> node ...                                            → EXIT=1
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
        // 9/24 が両方に含まれる2期間（重なりは PEF が警告のみで通す）
        const periods=[
          {id:"p1",label:"9月前半",startDate:"2026-09-10",endDate:"2026-09-24",deadlineDate:"2026-09-24"},
          {id:"p2",label:"9月後半",startDate:"2026-09-24",endDate:"2026-10-08",deadlineDate:"2026-10-08"}];
        const settings={shopId:"s1",candidates:[],staffColors:{},
          staffAliases:{},                                  // ★ 別名は1件も無い
          staffAttributes:{"田中":"parttime"},
          staffTypeLimits:{parttime:{name:"バイト",daily:7}}, // 1日7時間まで
          breakTimes:{}};
        // 同じ「田中」名義。shiftByStaffDate は同じキーの最初の1件（sub1 の 4:00）を採る
        const subs=[
          {id:"sub1",periodId:"p1",staffName:"田中",shopId:"s1",comment:"",
            submittedAt:"2026-09-01T10:00:00.000Z",
            shifts:{"2026-09-24":{status:"work",start:"09:00",end:"13:00"}}},   // 4:00
          {id:"sub2",periodId:"p2",staffName:"田中",shopId:"s1",comment:"",
            submittedAt:"2026-09-02T10:00:00.000Z",
            shifts:{"2026-09-24":{status:"work",start:"09:00",end:"18:00"}}}];  // 9:00
        return <SubsTab subs={subs} periods={periods} staffList={["田中"]}
          onSave={()=>{}} tt={()=>{}} settings={settings} onSaveSettings={()=>{}} plan="premium"/>;
      }
      ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);
    `,
  });

  // 期間フィルタの既定は「最新の期間」（app-admin.js:3778）＝ p2 の行だけが出る。
  // これが起票時に「1日超過」を出していた当の行。
  const R = {};
  R.rowCount = await h.evaluate(() => document.querySelectorAll("tbody tr").length);
  // 行の判定に使われるシフトは 4:00（同じキーの最初の1件）なので、1日上限 7:00 を超える行は無いはず。
  // 修正前は この行だけが自分の 9:00 を読んで「1日超過」を出していた。
  R.dailyOverBadges = await h.evaluate(
    () => (document.body.innerText.match(/1日超過/g) || []).length);

  // 同じ行の詳細モーダルを開き、週間勤務時間が同じ 4:00 を数えていることを確かめる
  await h.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(x => x.textContent.trim() === "詳細");
    if (!b) throw new Error("no detail button");
    b.click();
  });
  await new Promise(r => setTimeout(r, 400));

  R.modalWeek = await h.evaluate(() => {
    const m = document.body.innerText.match(/9\/21〜9\/27\s*\n?\s*([0-9]+:[0-9]{2})/);
    return m ? m[1] : null;
  });

  R.consoleErrors = h.errors || [];
  await h.close();

  const pass = {
    "latest_period_row_rendered": R.rowCount === 1,
    "no_daily_over_badge": R.dailyOverBadges === 0,   // ← 修正前はここが 1
    "modal_weekly_is_4h": R.modalWeek === "4:00",
    "no_console_errors": R.consoleErrors.length === 0,
  };
  console.log(JSON.stringify({ measured: R, pass }, null, 2));
  const allPass = Object.values(pass).every(Boolean);
  console.log("allPass =", allPass);
  process.exit(allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
