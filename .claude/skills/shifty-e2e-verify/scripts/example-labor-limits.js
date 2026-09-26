// 勤務時間の下限（2026-09-26 追加要件）の実ブラウザ回帰テスト。上限と対で設定でき、
// 集計表と提出一覧に「不足」として出ることを測る。Firebase へは1バイトも出ない。
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-labor-limits.js → allPass=true / EXIT=0
// 反証: SHIFTY_ROOT=<下限より前の配信物> node ... → EXIT=1
"use strict";
const path=require("node:path");
const {openHarness}=require(path.join(__dirname,"mount-component.js"));
const ROOT=process.env.SHIFTY_ROOT||undefined;
const EXTRA_HEAD=`<style>:root{--c-bg:#F0F2F5;--c-card:#FFFFFF;--c-input:#F3F4F6;--c-input2:#F0F2F5;`+
  `--c-border:#E5E7EB;--c-border2:#D1D5DB;--c-text:#1A1A2E;--c-text2:#374151;--c-text3:#6B7280;`+
  `--c-text4:#9CA3AF;--c-shadow:rgba(0,0,0,.06);--c-accent:#f87036;--c-danger:#DC2626;}</style>`;
const LIMITS=`{employee:{name:"社員",weekly:40,weeklyMin:30,monthly:200,monthlyMin:150}}`;

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
  // 下限行の「週」欄に 30 を入れる。属性ブロックは 社員 → パート・アルバイト を固定して
  // 残りを50音順（2026-09-26 のユーザー指示）なので、**先頭は「社員」(employee)**。
  const set=await h.evaluate(()=>{
    const blocks=[...document.querySelectorAll("div")].filter(d=>/^上限/.test((d.innerText||"").trim()));
    const minRow=[...document.querySelectorAll("div")].filter(d=>/^下限/.test((d.innerText||"").trim()))[0];
    if(!minRow)return "no-min-row";
    const ins=[...minRow.querySelectorAll("input[type=number]")];
    if(ins.length<2)return "no-inputs";
    const st=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value").set;
    st.call(ins[1],"30");ins[1].dispatchEvent(new Event("input",{bubbles:true}));
    return "ok:"+blocks.length+"/"+ins.length;
  });
  await h.page.waitForTimeout(400);
  const saved=await h.evaluate(()=>((window.__settings.staffTypeLimits||{}).employee||null));
  const fs=await h.evaluate(()=>[...document.querySelectorAll("input[type=number]")].map(i=>parseFloat(getComputedStyle(i).fontSize)));
  const errors=h.errors.slice();
  await h.close();
  return{card,set,saved,fontsizes:fs,errors};
}

async function shiftTab(){
  // 田中(社員): 10/5〜10/7 だけ 09:00-14:00（5h×3＝15h）→ 週下限30h・月下限150h を割る
  const sh=[5,6,7].map(d=>`"2026-10-0${d}":{status:"work",start:"09:00",end:"14:00"}`).join(",");
  const h=await openHarness({root:ROOT,extraHead:EXTRA_HEAD,waitFor:"select",jsx:`
const P={id:"p1",urlToken:"t1",shopId:"S1",label:"10月",startDate:"2026-10-01",endDate:"2026-10-31",deadlineDate:"",createdAt:"2026-09-01T00:00:00.000Z"};
const SUBS=[{id:"s1",periodId:"p1",staffName:"田中",shopId:"S1",comment:"",submittedAt:"2026-09-02T00:00:00.000Z",shifts:{${sh}}}];
const SETTINGS={shopId:"S1",candidates:[{start:"09:00",end:"23:00"}],weekdayCandidates:{},dateCandidates:{},
  breakTimes:{weekday:[],sat:[],sun:[],holSat:[],holSun:[]},
  staffAttributes:{田中:"employee"},staffTypeLimits:${LIMITS},
  staffColors:{},staffAliases:{},positions:{kitchen:[],hall:[]},requiredPositions:{},staffPositions:{}};
function Harness(){
  const [subs,setSubs]=React.useState(SUBS);
  return <ShiftEditTab subs={subs} periods={[P]} staffList={["田中"]}
    onSave={v=>setSubs(p=>typeof v==="function"?v(p):v)} tt={()=>{}}
    settings={SETTINGS} plan="premium" shopId="S1" shopName="テスト店" onUpgrade={()=>{}}
    savePeriods={()=>{}} ownerReadOnly={false} pastSubsLoaded={true}/>;
}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);`});
  await h.page.waitForTimeout(700);
  const m=await h.evaluate(()=>{
    const tbl=t=>{const w=[...document.querySelectorAll("div")].find(d=>(d.innerText||"").startsWith(t));
      if(!w)return null;const r={};[...w.querySelectorAll("tbody tr")].forEach(tr=>{
        const td=[...tr.querySelectorAll("td")];
        r[td[0].innerText.trim()]={v:td[1]?td[1].innerText.trim():"",bg:td[1]?getComputedStyle(td[1]).backgroundColor:""};});
      return r;};
    return{week:tbl("週間勤務時間"),period:tbl("期間別勤務時間")};
  });
  m.errors=h.errors.slice();
  await h.close();
  return m;
}

async function subsTab(){
  const sh=[5,6,7].map(d=>`"2026-10-0${d}":{status:"work",start:"09:00",end:"14:00"}`).join(",");
  const h=await openHarness({root:ROOT,extraHead:EXTRA_HEAD,waitFor:"table",jsx:`
const P={id:"p1",urlToken:"t1",shopId:"S1",label:"10月",startDate:"2026-10-01",endDate:"2026-10-31",deadlineDate:"",createdAt:"2026-09-01T00:00:00.000Z"};
const SUBS=[{id:"s1",periodId:"p1",staffName:"田中",shopId:"S1",comment:"",submittedAt:"2026-09-02T00:00:00.000Z",shifts:{${sh}}}];
const SETTINGS={shopId:"S1",candidates:[],weekdayCandidates:{},dateCandidates:{},
  breakTimes:{weekday:[],sat:[],sun:[],holSat:[],holSun:[]},
  staffAttributes:{田中:"employee"},staffTypeLimits:${LIMITS},
  staffColors:{},staffAliases:{},positions:{kitchen:[],hall:[]},requiredPositions:{},staffPositions:{}};
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
  const st=await setTab(), sh=await shiftTab(), sb=await subsTab();
  const bgU=s=>/rgba?\(\s*59,\s*130,\s*246/.test(s||"");
  const pass={
    set_two_rows:/上限/.test(st.card||"")&&/下限/.test(st.card||""),
    set_min_saved:!!st.saved&&st.saved.weeklyMin===30,
    set_fontsize16:st.fontsizes.every(f=>f>=16),
    // 集計表: 週15h は週下限30hを割る → 青。週下限・月下限の行が出る
    // データのある週（5〜11日＝15h）が週下限30hを割って青くなる
    week_row_under:!!sh.week&&bgU((Object.entries(sh.week).find(([k,v])=>/^\d+〜/.test(k)&&v.v)||[,{}])[1].bg),
    week_min_row:!!sh.week&&!!sh.week["週下限"]&&sh.week["週下限"].v==="30",
    month_min_row:!!sh.period&&!!sh.period["月下限"]&&sh.period["月下限"].v==="150",
    month_total_under:!!sh.period&&bgU((sh.period["月計"]||{}).bg),
    // 提出一覧: 「週不足 / 月不足」バッジと青い左線
    subs_badge:!!sb.row&&/週不足/.test(sb.row.txt)&&/月不足/.test(sb.row.txt),
    subs_line:!!sb.row&&/37,\s*99,\s*235|rgb\(37, 99, 235\)/.test(sb.row.shadow||""),
    no_console_errors:st.errors.length===0&&sh.errors.length===0&&sb.errors.length===0,
  };
  const allPass=Object.values(pass).every(Boolean);
  console.log(JSON.stringify({setTab:st,shiftTab:sh,subsTab:sb,pass,allPass},null,1));
  process.exit(allPass?0:1);
})().catch(e=>{console.error(e);process.exit(1);});
