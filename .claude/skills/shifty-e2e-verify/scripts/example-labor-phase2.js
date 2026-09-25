// 労務判定 第2弾（按分・36協定・目安4段階・総括判定）の実ブラウザ回帰テスト。
// app-main.js を読み込まないので Firebase へは1バイトも出ない（SKILL.md 1.6節）。
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-labor-phase2.js → allPass=true / EXIT=0
// 反証: SHIFTY_ROOT=<第2弾より前の配信物> node ... → EXIT=1
"use strict";
const path=require("node:path");
const {openHarness}=require(path.join(__dirname,"mount-component.js"));
const ROOT=process.env.SHIFTY_ROOT||undefined;
const EXTRA_HEAD=`<style>:root{--c-bg:#F0F2F5;--c-card:#FFFFFF;--c-input:#F3F4F6;--c-input2:#F0F2F5;`+
  `--c-border:#E5E7EB;--c-border2:#D1D5DB;--c-text:#1A1A2E;--c-text2:#374151;--c-text3:#6B7280;`+
  `--c-text4:#9CA3AF;--c-shadow:rgba(0,0,0,.06);--c-accent:#f87036;--c-danger:#DC2626;}</style>`;

async function setTab(){
  const h=await openHarness({root:ROOT,extraHead:EXTRA_HEAD,waitFor:"#root > *",jsx:`
    function Harness(){
      const [settings,setSettings]=React.useState({shopId:"s1",candidates:[],staffAttributes:{},
        staffTypeLimits:{employee:{name:"社員"},parttime:{name:"バイト"}}});
      window.__settings=settings;
      return <SetTab settings={settings} onSave={s=>setSettings(s)} subs={[]} saveSubs={()=>{}}
        tt={()=>{}} syncStatus="online" plan="premium" shopId="s1" staffList={["田中"]}/>;
    }
    ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);`});
  const m=await h.evaluate(()=>{
    const card=[...document.querySelectorAll("div")].find(d=>(d.innerText||"").startsWith("労務判定（1か月単位の変形労働時間制）"));
    const t=card?card.innerText:"";
    const nums=card?[...card.querySelectorAll("input[type=number]")].map(i=>({v:i.value,fs:getComputedStyle(i).fontSize})):[];
    return{has36:/36協定/.test(t),daily:/1日の延長上限/.test(t),monthly:/1か月の延長上限/.test(t),
      judged:(t.match(/判定(?!し)/g)||[]).length,unjudged:(t.match(/未判定/g)||[]).length,
      notJudgedNote:/本機能では判定しません/.test(t),
      holiday:/休日労働を足していません/.test(t),
      nums,noNextPhaseNote:!/次の弾で追加します/.test(t)};
  });
  // 1日の延長上限を0にすると目安＝総枠（31日 177:08）になる
  await h.evaluate(()=>{
    const card=[...document.querySelectorAll("div")].find(d=>(d.innerText||"").startsWith("労務判定（1か月単位の変形労働時間制）"));
    const ins=[...card.querySelectorAll("input[type=number]")];
    const st=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value").set;
    const el=ins[4]; if(!el)return; // 第2弾より前の配信物には36協定の入力欄が無い＝例外で止めず assert を落とす
    el.focus(); st.call(el,"0"); el.dispatchEvent(new Event("input",{bubbles:true}));
  });
  await h.page.waitForTimeout(500);
  m.row31After0=await h.evaluate(()=>{
    const card=[...document.querySelectorAll("div")].find(d=>(d.innerText||"").startsWith("労務判定（1か月単位の変形労働時間制）"));
    return [...card.querySelectorAll("tbody tr")][0].innerText.replace(/\s+/g,"/");
  });
  m.errors=h.errors.slice();
  await h.close();
  return m;
}

async function shiftTab(){
  // 10月まるごと1期間＝月が埋まっている。田中=社員(A制)・鈴木=バイト(B制)。
  // 田中は 24日出勤（7.5h×15・6h×5・10h×4 ＝ 182.5h）＝ S-2 の系列そのもの。
  const days=[];
  for(let i=1;i<=15;i++)days.push([i,"09:00","16:30"]);   // 7.5h
  for(let i=16;i<=20;i++)days.push([i,"09:00","15:00"]);  // 6h
  for(let i=21;i<=24;i++)days.push([i,"09:00","19:00"]);  // 10h
  const sh=days.map(([d,a,b])=>`"2026-10-${String(d).padStart(2,"0")}":{status:"work",start:"${a}",end:"${b}"}`).join(",");
  const h=await openHarness({root:ROOT,extraHead:EXTRA_HEAD,waitFor:"select",jsx:`
const P={id:"p1",urlToken:"t1",shopId:"S1",label:"10月",startDate:"2026-10-01",endDate:"2026-10-31",deadlineDate:"",createdAt:"2026-09-01T00:00:00.000Z"};
const SUBS=[
 {id:"s1",periodId:"p1",staffName:"田中",shopId:"S1",comment:"",submittedAt:"2026-09-02T00:00:00.000Z",shifts:{${sh}}},
 {id:"s2",periodId:"p1",staffName:"鈴木",shopId:"S1",comment:"",submittedAt:"2026-09-02T00:00:00.000Z",
  shifts:{"2026-10-01":{status:"work",start:"09:00",end:"19:00"}}},
];
const SETTINGS={shopId:"S1",candidates:[{start:"09:00",end:"23:00"}],weekdayCandidates:{},dateCandidates:{},
  breakTimes:{weekday:[],sat:[],sun:[],holSat:[],holSun:[]},
  staffAttributes:{田中:"employee",鈴木:"parttime"},
  staffTypeLimits:{employee:{name:"社員"},parttime:{name:"バイト"}},
  staffColors:{},staffAliases:{},positions:{kitchen:[],hall:[]},requiredPositions:{},staffPositions:{}};
function Harness(){
  const [subs,setSubs]=React.useState(SUBS);
  return <ShiftEditTab subs={subs} periods={[P]} staffList={["田中","鈴木"]}
    onSave={v=>setSubs(p=>typeof v==="function"?v(p):v)} tt={()=>{}}
    settings={SETTINGS} plan="premium" shopId="S1" shopName="テスト店" onUpgrade={()=>{}}
    savePeriods={()=>{}} ownerReadOnly={false} pastSubsLoaded={true}/>;
}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);`});
  await h.page.waitForTimeout(700);
  const m=await h.evaluate(()=>{
    const wrap=[...document.querySelectorAll("div")].find(d=>(d.innerText||"").startsWith("労務判定（2026年10月）"));
    if(!wrap)return{found:false};
    const rows={};
    [...wrap.querySelectorAll("tbody tr")].forEach(tr=>{
      const tds=[...tr.querySelectorAll("td")].map(td=>td.innerText.trim());
      rows[tds[0]]=tds.slice(1);
    });
    return{found:true,rows,title:wrap.innerText.split("\n")[0]};
  });
  m.errors=h.errors.slice();
  await h.close();
  return m;
}

(async()=>{
  const st=await setTab(), sh=await shiftTab();
  const pass={
    set_has_36:st.has36&&st.daily&&st.monthly,
    set_checklist:st.judged>=3&&st.unjudged===4&&st.notJudgedNote,
    set_holiday_note:st.holiday,
    set_no_next_phase_note:st.noNextPhaseNote,
    set_fontsize16:st.nums.every(n=>parseFloat(n.fs)>=16),
    set_daily0_guide_equals_base:st.row31After0==="31日/177:08/177:08/207:08",
    shift_table:sh.found&&sh.title==="労務判定（2026年10月）",
    // 田中: 月実働182:30・目安200hに対し不足17.5h・総括は目安未満
    shift_month:sh.found&&sh.rows["月実働"]&&sh.rows["月実働"][0]==="182:30",
    shift_guide:sh.found&&sh.rows["目安"]&&sh.rows["目安"][0]==="目安未満 あと17.5h",
    shift_verdict:sh.found&&sh.rows["総括"]&&sh.rows["総括"][0]==="目安未満",
    // 鈴木(B制): 10h の日が1日＝8h超 → 残業あり。目安は空欄（A制のみ）
    shift_b_guide_blank:sh.found&&sh.rows["目安"]&&sh.rows["目安"][1]==="",
    shift_b_verdict:sh.found&&sh.rows["総括"]&&sh.rows["総括"][1]==="残業あり",
    no_console_errors:st.errors.length===0&&sh.errors.length===0,
  };
  const allPass=Object.values(pass).every(Boolean);
  console.log(JSON.stringify({setTab:st,shiftTab:sh,pass,allPass},null,1));
  process.exit(allPass?0:1);
})().catch(e=>{console.error(e);process.exit(1);});
