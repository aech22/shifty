// 提出一覧の詳細モーダルの「休暇」プルダウンが、シフト作成タブの ko と同じ形で書くかを実ブラウザで測る
// （SKILL.md 1.6節・app-main.js を読まないので Firebase へは出ない。バグチェック#148）。
//
// 修正前: 出勤 10:00-18:00 の日に「有給」を選ぶと leaveTypes だけが書かれ、実働 8:00 が残ったまま
//         有給1日も数えられた（二重計上）。ko で公休にした日は「—」を選んでも adminRest が残り、
//         プルダウンが「公休」に戻って外せなかった。
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-subs-leave-select.js   → allPass=true / EXIT=0
// 反証: SHIFTY_ROOT=<修正前の写し> node ...                                          → EXIT=1
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
        const periods=[{id:"p1",label:"10月前半",startDate:"2026-10-01",endDate:"2026-10-15",deadlineDate:"2026-10-15"}];
        const settings={shopId:"s1",candidates:[],staffColors:{},staffAliases:{},staffAttributes:{}};
        const [subs,setSubs]=React.useState([{id:"sub1",periodId:"p1",staffName:"田中",shopId:"s1",
          submittedAt:"2026-09-20T10:00:00.000Z",comment:"",
          shifts:{
            "2026-10-05":{status:"work",start:"10:00",end:"18:00"},
            "2026-10-06":{status:"work",adminRest:{start:true,end:true},leaveTypes:{start:"public",end:"public"}}}}]);
        window.__subs=()=>subs;
        return <SubsTab subs={subs} periods={periods} staffList={["田中"]}
          onSave={setSubs} tt={()=>{}} settings={settings} onSaveSettings={()=>{}} plan="premium"/>;
      }
      ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);
    `,
  });

  await h.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(x => x.textContent.trim() === "詳細");
    if (!b) throw new Error("no detail button");
    b.click();
  });
  await new Promise(r => setTimeout(r, 400));

  // 休暇プルダウン = 選択肢に「有給」を持つ select。行の並び順（10/5 → 10/6）で拾う
  const pick = async (idx, value) => {
    await h.evaluate(([i, v]) => {
      const sels = [...document.querySelectorAll("select")].filter(s => [...s.options].some(o => o.textContent === "有給"));
      const s = sels[i];
      if (!s) throw new Error("no leave select " + i + " / " + sels.length);
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
      setter.call(s, v);
      s.dispatchEvent(new Event("change", { bubbles: true }));
    }, [idx, value]);
    await new Promise(r => setTimeout(r, 300));
  };
  const day = d => h.evaluate(x => (window.__subs()[0].shifts || {})[x] || null, d);
  const total = () => h.evaluate(() => { const m = document.body.innerText.match(/合計：([0-9]+:[0-9]{2})/); return m ? m[1] : null; });

  const R = {};
  R.totalBefore = await total();
  await pick(0, "paid");
  R.d05 = await day("2026-10-05");
  R.totalAfterPaid = await total();
  await pick(1, "");
  R.d06 = await day("2026-10-06");
  R.select06 = await h.evaluate(() => {
    const sels = [...document.querySelectorAll("select")].filter(s => [...s.options].some(o => o.textContent === "有給"));
    return sels[1] ? sels[1].value : null;
  });
  R.consoleErrors = h.errors || [];

  const v = {
    paidSuppressesWork: !!(R.d05 && R.d05.adminRest && R.d05.adminRest.start && R.d05.adminRest.end),
    paidWritten: !!(R.d05 && R.d05.leaveTypes && R.d05.leaveTypes.start === "paid" && R.d05.leaveTypes.end === "paid"),
    totalDropped: R.totalBefore === "8:00" && R.totalAfterPaid === null,
    clearRemovesRest: !!(R.d06 && !R.d06.adminRest && !R.d06.leaveTypes),
    clearSticks: R.select06 === "",
    noErrors: R.consoleErrors.length === 0,
  };
  v.allPass = Object.values(v).every(Boolean);
  console.log(JSON.stringify({ R, verdict: v }, null, 2));
  await h.close();
  process.exit(v.allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
