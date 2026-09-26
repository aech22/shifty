// 月が埋まっていないときの労務判定表・週の休み表（2026-09-26 ユーザー指示）の実ブラウザ回帰テスト。
// 「要確認」で止めず、**データのある日だけで数えた実数の先頭に `＋` を付けて出す**。ただし月に帰属する
// 判定（目安）は総括に入れない——暦月の枠に途中までの実働を当てると全員が所定未満＝要修正になる。
// app-main.js を読み込まないので Firebase へは1バイトも出ない（SKILL.md 1.6節）。
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-labor-partial-month.js → allPass=true / EXIT=0
// 反証: SHIFTY_ROOT=<この変更より前の配信物> node ... → EXIT=1（旧版は「要確認」を出す）
"use strict";
const path=require("node:path");
const {openHarness}=require(path.join(__dirname,"mount-component.js"));
const ROOT=process.env.SHIFTY_ROOT||undefined;
const EXTRA_HEAD=`<style>:root{--c-bg:#F0F2F5;--c-card:#FFFFFF;--c-input:#F3F4F6;--c-input2:#F0F2F5;`+
  `--c-border:#E5E7EB;--c-border2:#D1D5DB;--c-text:#1A1A2E;--c-text2:#374151;--c-text3:#6B7280;`+
  `--c-text4:#9CA3AF;--c-shadow:rgba(0,0,0,.06);--c-accent:#f87036;--c-danger:#DC2626;}</style>`;

// 10月**前半だけ**の期間を置く（後半の期間を作っていない＝その月の16〜31日はどの期間にも入らない）。
// 前半は 9:00〜19:00（休憩1h）＝実働9h を平日に入れる。月の総枠は177:08 なので必ず所定未満になり、
// 旧版はここで 目安・総括・残業予定 の3つを「要確認」に倒していた。
async function partialMonth(){
  const wd=[1,2,5,6,7,8,9,12,13,14,15];
  const sh=wd.map(d=>`"2026-10-${String(d).padStart(2,"0")}":{status:"work",start:"09:00",end:"19:00"}`).join(",");
  const h=await openHarness({root:ROOT,extraHead:EXTRA_HEAD,waitFor:"select",jsx:`
const PA={id:"pa",urlToken:"ta",shopId:"S1",label:"10月前半",startDate:"2026-10-01",endDate:"2026-10-15",deadlineDate:"",createdAt:"2026-09-01T00:00:00.000Z"};
const SUBS=[{id:"s1",periodId:"pa",staffName:"田中",shopId:"S1",comment:"",submittedAt:"2026-09-02T00:00:00.000Z",shifts:{${sh}}}];
const SETTINGS={shopId:"S1",candidates:[{start:"09:00",end:"23:00"}],weekdayCandidates:{},dateCandidates:{},
  breakTimes:{weekday:[{start:"12:00",end:"13:00"}],sat:[{start:"12:00",end:"13:00"}],sun:[{start:"12:00",end:"13:00"}],holSat:[{start:"12:00",end:"13:00"}],holSun:[{start:"12:00",end:"13:00"}]},
  staffAttributes:{田中:"employee"},staffTypeLimits:{employee:{name:"社員"}},periodUnit:"2week",
  staffColors:{},staffAliases:{},positions:{kitchen:[],hall:[]},requiredPositions:{},staffPositions:{}};
function Harness(){
  const [subs,setSubs]=React.useState(SUBS);
  return <ShiftEditTab subs={subs} periods={[PA]} staffList={["田中"]}
    onSave={v=>setSubs(p=>typeof v==="function"?v(p):v)} tt={()=>{}}
    settings={SETTINGS} plan="premium" shopId="S1" shopName="テスト店" onUpgrade={()=>{}}
    savePeriods={()=>{}} ownerReadOnly={false} pastSubsLoaded={true}/>;
}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);`});
  await h.page.waitForTimeout(900);
  const m=await h.evaluate(()=>{
    const tbl=t=>{const w=[...document.querySelectorAll("div")].find(d=>(d.innerText||"").startsWith(t));
      if(!w)return null;const r={};[...w.querySelectorAll("tbody tr")].forEach(tr=>{
        const td=[...tr.querySelectorAll("td")];
        r[td[0].innerText.trim()]={v:td[1]?td[1].innerText.trim():"",t:td[1]?td[1].getAttribute("title")||"":""};});
      return r;};
    const panel=[...document.querySelectorAll("div")].find(d=>(d.innerText||"").startsWith("⚠ 労務の確認が必要です"));
    const wr=[...document.querySelectorAll("div")].find(d=>(d.innerText||"").startsWith("週の休み"));
    return{labor:tbl("労務判定（2026年10月）"),
      weekRest:wr?[...wr.querySelectorAll("tbody tr")].map(tr=>{
        const td=[...tr.querySelectorAll("td")];
        return{w:td[0].innerText.trim(),v:td[1]?td[1].innerText.trim():"",t:td[1]?td[1].getAttribute("title")||"":""};}):null,
      panel:panel?panel.innerText.replace(/\s+/g," "):null};
  });
  m.errors=h.errors.slice();
  await h.close();
  return m;
}

(async()=>{
  const p=await partialMonth();
  const L=p.labor||{};
  const row=k=>L[k]||{v:"",t:""};
  const weeks=p.weekRest||[];
  const pass={
    table_found:!!p.labor,
    // 月実働は現状の実数（データのある日だけの合計）の先頭に「＋」。旧版は印なしで半月ぶんを出していた
    month_partial:/^＋\d+:\d\d$/.test(row("月実働").v),
    month_title:/データのある日だけの合計/.test(row("月実働").t),
    // 目安は暦月の総枠（177:08）に対する途中の値。実数を出し「＋」で途中を示す
    guide_partial:/^＋所定未満 あと[\d.]+h$/.test(row("目安").v),
    guide_title:/途中の値/.test(row("目安").t)&&/データで埋まっていません/.test(row("目安").t),
    // 残業予定は ＋0h（暦月の枠に半月ぶんを当てるので0。空欄にすると「判定して問題なし」と読める）
    ot_zero_marked:row("残業予定").v==="＋0h",
    ot_title:/途中の値/.test(row("残業予定").t),
    // **総括は ＋OK**。目安（月に帰属）を総括に入れないので要修正にならない＝この変更の要点
    verdict_ok_partial:row("総括").v==="＋OK",
    verdict_title:/日・週の判定では問題ありません/.test(row("総括").t),
    verdict_not_fix:row("総括").v!=="要修正",
    // 労務判定表のどこにも「要確認」を残さない
    no_pending_label:Object.values(L).every(x=>x.v!=="要確認"),
    // 要修正が無いので確認パネルは出ない（目安が総括へ漏れると田中が並ぶ）
    no_panel:p.panel===null,
    // 週の休み: 期間の外に掛かる週は ＋休n（9/28〜9/30 と 10/16〜10/18 はどの期間にも無い）
    week_has_partial:weeks.some(x=>/^＋休\d+$/.test(x.v)),
    week_partial_title:weeks.some(x=>/データのある日だけで数えた休み\d+日/.test(x.t)),
    week_no_pending_label:weeks.every(x=>x.v!=="要確認"),
    // 揃わない週を ×休なし にしない（総括が週1休の違反として要修正に直結させるため）
    week_no_false_norest:weeks.filter(x=>/^＋/.test(x.v)).every(x=>x.v!=="×休なし"),
    no_console_errors:p.errors.length===0,
  };
  const allPass=Object.values(pass).every(Boolean);
  console.log(JSON.stringify({partialMonth:p,pass,allPass},null,1));
  process.exit(allPass?0:1);
})().catch(e=>{console.error(e);process.exit(1);});
