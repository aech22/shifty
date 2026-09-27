// 属性別の勤務時間の上限・目安（2026-09-28 改訂）の実ブラウザ回帰テスト。Firebase へは1バイトも出ない。
//  - 「下限」は「目安」に改め、**何も判定しない**（集計表・提出一覧・PDF に青い判定色も「不足」バッジも出ない）
//  - 1ヶ月の上限・目安は31日の月の値として、労務設定と同じ式で月の暦日数に日割りし、「残業」を足す
//    （社員の月上限 177h: 4月=171:25・3月=177:08。172h 働いた人は4月だけ月超過）
//  - 設定タブに「目安」行と1ヶ月の「＋残業」欄がある（input の fontSize は 16px 以上）
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-labor-limits.js → allPass=true / EXIT=0
// 反証: SHIFTY_ROOT=<目安化より前の配信物> node ... → EXIT=1
"use strict";
const path=require("node:path");
const {openHarness}=require(path.join(__dirname,"mount-component.js"));
const ROOT=process.env.SHIFTY_ROOT||undefined;
const EXTRA_HEAD=`<style>:root{--c-bg:#F0F2F5;--c-card:#FFFFFF;--c-input:#F3F4F6;--c-input2:#F0F2F5;`+
  `--c-border:#E5E7EB;--c-border2:#D1D5DB;--c-text:#1A1A2E;--c-text2:#374151;--c-text3:#6B7280;`+
  `--c-text4:#9CA3AF;--c-shadow:rgba(0,0,0,.06);--c-accent:#f87036;--c-danger:#DC2626;}</style>`;
const limits=ot=>`{employee:{name:"社員",weekly:0,weeklyMin:30,monthly:177,monthlyMin:150,monthlyOt:${ot}}}`;
// その月に 172:00 働く（8h×21日＋4h）。1日の上限・週上限は未設定なので月の上限だけが効く
const shiftsOf=ym=>{const a=[];for(let d=1;d<=21;d++)a.push(`"${ym}-${String(d).padStart(2,"0")}":{status:"work",start:"09:00",end:"17:00"}`);
  a.push(`"${ym}-22":{status:"work",start:"09:00",end:"13:00"}`);return a.join(",");};
const periodOf=ym=>{const [y,m]=ym.split("-").map(Number);const last=new Date(y,m,0).getDate();
  return `{id:"p1",urlToken:"t1",shopId:"S1",label:"${m}月",startDate:"${ym}-01",endDate:"${ym}-${last}",deadlineDate:"",createdAt:"2026-01-01T00:00:00.000Z"}`;};
const settingsOf=ot=>`{shopId:"S1",candidates:[{start:"09:00",end:"23:00"}],weekdayCandidates:{},dateCandidates:{},
  breakTimes:{weekday:[],sat:[],sun:[],holSat:[],holSun:[]},
  staffAttributes:{田中:"employee"},staffTypeLimits:${limits(ot)},
  staffColors:{},staffAliases:{},positions:{kitchen:[],hall:[]},requiredPositions:{},staffPositions:{}}`;

async function setTab(){
  const h=await openHarness({root:ROOT,extraHead:EXTRA_HEAD,waitFor:"#root > *",jsx:`
    function Harness(){
      const [settings,setSettings]=React.useState({shopId:"s1",candidates:[],staffAttributes:{},
        staffTypeLimits:{employee:{name:"社員"}}});
      window.__settings=settings;
      return <SetTab settings={settings} onSave={s=>setSettings(s)} subs={[]} saveSubs={()=>{}}
        tt={()=>{}} syncStatus="online" plan="premium" shopId="s1" staffList={["田中"]}/>;
    }
    ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);`});
  const card=await h.evaluate(()=>{const d=[...document.querySelectorAll("div")].find(x=>(x.innerText||"").startsWith("スタッフ属性別 勤務時間制限"));return d?d.innerText.replace(/\s+/g," "):null;});
  // 属性ブロックの先頭は「社員」(employee)。上限行の「＋残業」欄に 20 を入れる
  const set=await h.evaluate(()=>{
    const upRow=[...document.querySelectorAll("div")].filter(d=>/^上限/.test((d.innerText||"").trim())&&(d.innerText||"").includes("＋残業"))[0];
    if(!upRow)return "no-ot";
    const lab=[...upRow.querySelectorAll("span")].find(s=>s.innerText.trim()==="＋残業");
    const inp=lab&&lab.nextElementSibling;
    if(!inp||inp.tagName!=="INPUT")return "no-input";
    const st=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value").set;
    st.call(inp,"20");inp.dispatchEvent(new Event("input",{bubbles:true}));
    return "ok";
  });
  await h.page.waitForTimeout(400);
  const saved=await h.evaluate(()=>((window.__settings.staffTypeLimits||{}).employee||null));
  const fs=await h.evaluate(()=>[...document.querySelectorAll("input[type=number]")].map(i=>parseFloat(getComputedStyle(i).fontSize)));
  const errors=h.errors.slice();
  await h.close();
  return{card,set,saved,fontsizes:fs,errors};
}

async function shiftTab(ym,ot){
  const h=await openHarness({root:ROOT,extraHead:EXTRA_HEAD,waitFor:"select",jsx:`
const P=${periodOf(ym)};
const SUBS=[{id:"s1",periodId:"p1",staffName:"田中",shopId:"S1",comment:"",submittedAt:"2026-01-02T00:00:00.000Z",shifts:{${shiftsOf(ym)}}}];
const SETTINGS=${settingsOf(ot)};
function Harness(){
  const [subs,setSubs]=React.useState(SUBS);
  return <ShiftEditTab subs={subs} periods={[P]} staffList={["田中"]}
    onSave={v=>setSubs(p=>typeof v==="function"?v(p):v)} tt={()=>{}}
    settings={SETTINGS} plan="premium" shopId="S1" shopName="テスト店" onUpgrade={()=>{}}
    savePeriods={()=>{}} ownerReadOnly={true} pastSubsLoaded={true}/>;
}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);`});
  await h.page.waitForTimeout(700);
  const m=await h.evaluate(()=>{
    const tbl=t=>{const w=[...document.querySelectorAll("div")].find(d=>(d.innerText||"").startsWith(t));
      if(!w)return null;const r={};[...w.querySelectorAll("tbody tr")].forEach(tr=>{
        const td=[...tr.querySelectorAll("td")];
        r[td[0].innerText.trim()]={v:td[1]?td[1].innerText.trim():"",bg:td[1]?getComputedStyle(td[1]).backgroundColor:""};});
      return r;};
    // 判定色の青（旧・下限割れ＝rgba(59,130,246,.15)）がどこかのセルに残っていないか
    const blueJudged=[...document.querySelectorAll("td")].some(td=>/rgba\(59,\s*130,\s*246,\s*0\.15\)/.test(getComputedStyle(td).backgroundColor));
    return{week:tbl("週間勤務時間"),period:tbl("期間別勤務時間"),blueJudged};
  });
  m.errors=h.errors.slice();
  await h.close();
  return m;
}

async function subsTab(ym){
  const h=await openHarness({root:ROOT,extraHead:EXTRA_HEAD,waitFor:"table",jsx:`
const P=${periodOf(ym)};
const SUBS=[{id:"s1",periodId:"p1",staffName:"田中",shopId:"S1",comment:"",submittedAt:"2026-01-02T00:00:00.000Z",shifts:{${shiftsOf(ym)}}}];
const SETTINGS=${settingsOf(0)};
function Harness(){
  const [subs,setSubs]=React.useState(SUBS);
  return <SubsTab subs={subs} periods={[P]} staffList={["田中"]} tt={()=>{}} plan="premium"
    settings={SETTINGS} onSaveSettings={()=>{}} pastSubsLoaded={true}
    onSave={v=>setSubs(p=>typeof v==="function"?v(p):v)}/>;
}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);`});
  await h.page.waitForTimeout(600);
  const row=await h.evaluate(()=>{const tr=[...document.querySelectorAll("tbody tr")].find(x=>(x.innerText||"").includes("田中"));
    return tr?{txt:tr.innerText.replace(/\s+/g," "),shadow:getComputedStyle(tr.querySelector("td")).boxShadow}:null;});
  const errors=h.errors.slice();
  await h.close();
  return{row,errors};
}

(async()=>{
  const st=await setTab();
  const apr=await shiftTab("2026-04",0), mar=await shiftTab("2026-03",0), aprOt=await shiftTab("2026-04",20);
  const sbApr=await subsTab("2026-04"), sbMar=await subsTab("2026-03");
  const red=s=>/rgba?\(\s*255,\s*71,\s*87/.test(s||"");
  const pass={
    set_rows_upper_and_guide:/上限/.test(st.card||"")&&/目安/.test(st.card||"")&&!/下限/.test(st.card||""),
    set_ot_saved:st.set==="ok"&&!!st.saved&&st.saved.monthlyOt===20,
    set_fontsize16:st.fontsizes.every(f=>f>=16),
    // 4月（30日）: 月上限は 171:25（表示は時間のみ「171」）、172h の月計が赤い
    apr_cap_row:!!apr.period&&(apr.period["月上限"]||{}).v==="171",
    apr_total_over:!!apr.period&&red((apr.period["月計"]||{}).bg),
    // 3月（31日）: 月上限 177:08 なので 172h は赤くない
    mar_cap_row:!!mar.period&&(mar.period["月上限"]||{}).v==="177",
    mar_total_not_over:!!mar.period&&!red((mar.period["月計"]||{}).bg),
    // 残業 20h を足すと4月の上限は 191:25 で、172h は赤くない
    apr_ot_cap_row:!!aprOt.period&&(aprOt.period["月上限"]||{}).v==="191",
    apr_ot_not_over:!!aprOt.period&&!red((aprOt.period["月計"]||{}).bg),
    // 目安の行（数字だけ・判定しない）。月目安 150h の4月は 145:42＝「145」
    guide_rows:!!apr.period&&(apr.period["月目安"]||{}).v==="145"&&!!apr.week&&(apr.week["週目安"]||{}).v==="30",
    no_under_color:!apr.blueJudged&&!mar.blueJudged,
    // 提出一覧: 4月は「月超過」、3月は出ない。「不足」はどちらにも出ない
    subs_apr_over:!!sbApr.row&&/月超過/.test(sbApr.row.txt),
    subs_mar_no_over:!!sbMar.row&&!/超過/.test(sbMar.row.txt),
    subs_no_shortage:!!sbApr.row&&!/不足/.test(sbApr.row.txt)&&!/不足/.test(sbMar.row.txt),
    no_console_errors:[st,apr,mar,aprOt,sbApr,sbMar].every(x=>x.errors.length===0),
  };
  const allPass=Object.values(pass).every(Boolean);
  console.log(JSON.stringify({setTab:st,apr:apr.period,mar:mar.period,aprOt:aprOt.period,subsApr:sbApr.row,subsMar:sbMar.row,pass,allPass},null,1));
  process.exit(allPass?0:1);
})().catch(e=>{console.error(e);process.exit(1);});
