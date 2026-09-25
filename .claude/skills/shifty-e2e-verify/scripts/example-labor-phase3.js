// 労務判定 第3弾（週1休・休憩方式と日別上書きと休憩不足・休暇種別・有給残・年度累計）の
// 実ブラウザ回帰テスト。app-main.js を読み込まないので Firebase へは1バイトも出ない（SKILL.md 1.6節）。
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-labor-phase3.js → allPass=true / EXIT=0
// 反証: SHIFTY_ROOT=<第3弾より前の配信物> node ... → EXIT=1
"use strict";
const path=require("node:path");
const {openHarness}=require(path.join(__dirname,"mount-component.js"));
const ROOT=process.env.SHIFTY_ROOT||undefined;
const EXTRA_HEAD=`<style>:root{--c-bg:#F0F2F5;--c-card:#FFFFFF;--c-input:#F3F4F6;--c-input2:#F0F2F5;`+
  `--c-border:#E5E7EB;--c-border2:#D1D5DB;--c-text:#1A1A2E;--c-text2:#374151;--c-text3:#6B7280;`+
  `--c-text4:#9CA3AF;--c-shadow:rgba(0,0,0,.06);--c-accent:#f87036;--c-danger:#DC2626;}</style>`;

// ---- 1. SetTab: 休憩の決め方・有給の付与日数・年の区切り ----------------------
async function setTab(){
  const h=await openHarness({root:ROOT,extraHead:EXTRA_HEAD,waitFor:"#root > *",jsx:`
    function Harness(){
      const [settings,setSettings]=React.useState({shopId:"s1",candidates:[],staffAttributes:{},
        staffTypeLimits:{employee:{name:"社員"},parttime:{name:"バイト"}}});
      window.__settings=settings;
      return <SetTab settings={settings} onSave={s=>setSettings(s)} subs={[]} saveSubs={()=>{}}
        tt={()=>{}} syncStatus="online" plan="premium" shopId="s1" staffList={["田中","佐藤"]}/>;
    }
    ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);`});
  const cardOf=t=>h.evaluate(x=>{const d=[...document.querySelectorAll("div")].find(y=>(y.innerText||"").startsWith(x));return d?d.innerText:null;},t);
  const m={breakCard:await cardOf("休憩の決め方"),paidCard:await cardOf("有給の付与日数")};
  m.hasFiscal=/年の区切り/.test(await cardOf("労務判定（1か月単位の変形労働時間制）")||"");
  m.thresholdsHiddenByDefault=!/実働8時間超/.test(m.breakCard||"");
  // 長さ方式に切り替える → しきい値が出て settings に入る
  await h.evaluate(()=>{const r=[...document.querySelectorAll("input[type=radio]")];if(r[1])r[1].click();});
  await h.page.waitForTimeout(400);
  m.breakMode=await h.evaluate(()=>window.__settings.breakMode);
  m.thresholdsShown=/実働8時間超/.test(await cardOf("休憩の決め方")||"");
  // 有給の付与日数を入れる
  await h.evaluate(()=>{
    const card=[...document.querySelectorAll("div")].find(d=>(d.innerText||"").startsWith("有給の付与日数"));
    const i=card&&card.querySelector("input[type=number]");if(!i)return;
    const st=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value").set;
    i.focus();st.call(i,"10");i.dispatchEvent(new Event("input",{bubbles:true}));
  });
  await h.page.waitForTimeout(400);
  m.granted=await h.evaluate(()=>window.__settings.paidLeaveGranted||null);
  m.fontsizes=await h.evaluate(()=>[...document.querySelectorAll("input[type=number],select")].map(e=>parseFloat(getComputedStyle(e).fontSize)));
  m.errors=h.errors.slice();
  await h.close();
  return m;
}

// ---- 2. ShiftEditTab: 休暇種別・週の休み・休憩不足・有給残 ----------------------
async function shiftTab(){
  // 10月まるごと1期間。田中=社員(A制)。10/1〜10/3 は 09:00-19:00（休憩帯なし＝休憩不足）。
  // 10/5〜10/11 の週は全日出勤にして ×休なし を出す。
  const work=[1,2,3,5,6,7,8,9,10,11];
  const sh=work.map(d=>`"2026-10-${String(d).padStart(2,"0")}":{status:"work",start:"09:00",end:"19:00"}`).join(",");
  const h=await openHarness({root:ROOT,extraHead:EXTRA_HEAD,waitFor:"select",jsx:`
const P={id:"p1",urlToken:"t1",shopId:"S1",label:"10月",startDate:"2026-10-01",endDate:"2026-10-31",deadlineDate:"",createdAt:"2026-09-01T00:00:00.000Z"};
const SUBS=[{id:"s1",periodId:"p1",staffName:"田中",shopId:"S1",comment:"",submittedAt:"2026-09-02T00:00:00.000Z",shifts:{${sh}}}];
const SETTINGS={shopId:"S1",candidates:[{start:"09:00",end:"23:00"}],weekdayCandidates:{},dateCandidates:{},
  breakTimes:{weekday:[],sat:[],sun:[],holSat:[],holSun:[]},
  staffAttributes:{田中:"employee"},staffTypeLimits:{employee:{name:"社員"}},
  paidLeaveGranted:{田中:10},
  staffColors:{},staffAliases:{},positions:{kitchen:[],hall:[]},requiredPositions:{},staffPositions:{}};
function Harness(){
  const [subs,setSubs]=React.useState(SUBS);
  window.__subs=subs;
  return <ShiftEditTab subs={subs} periods={[P]} staffList={["田中"]}
    onSave={v=>setSubs(p=>{const n=typeof v==="function"?v(p):v;window.__subs=n;return n;})} tt={()=>{}}
    settings={SETTINGS} plan="premium" shopId="S1" shopName="テスト店" onUpgrade={()=>{}}
    savePeriods={()=>{}} ownerReadOnly={false} pastSubsLoaded={true}/>;
}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);`});
  await h.page.waitForTimeout(700);
  const read=()=>h.evaluate(()=>{
    const tbl=t=>{const w=[...document.querySelectorAll("div")].find(d=>(d.innerText||"").startsWith(t));
      if(!w)return null;const r={};[...w.querySelectorAll("tbody tr")].forEach(tr=>{const td=[...tr.querySelectorAll("td")].map(x=>x.innerText.trim());r[td[0]]=td.slice(1);});return r;};
    const panel=[...document.querySelectorAll("div")].find(d=>(d.innerText||"").startsWith("⚠ 労務の確認が必要です"));
    const cell=(d,f)=>{const i=document.querySelector(`input[data-sc="${d}|${f}"][data-scn="田中"]`);
      return i?{v:i.value,img:(getComputedStyle(i).backgroundImage||"").replace(/\s/g,"")}:null;};
    return{labor:tbl("労務判定（2026年10月）"),weekRest:tbl("週の休み"),
      panel:panel?panel.innerText.replace(/\s+/g," "):null,
      c14s:cell("2026-10-14","start"),c14e:cell("2026-10-14","end")};
  });
  const before=await read();
  // 10/14 に ya（終日の有給）を入れる
  await h.evaluate(()=>{
    const i=document.querySelector('input[data-sc="2026-10-14|start"][data-scn="田中"]');
    const st=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value").set;
    i.focus();st.call(i,"ya");i.dispatchEvent(new Event("input",{bubbles:true}));
    i.blur();i.dispatchEvent(new Event("focusout",{bubbles:true}));
  });
  await h.page.waitForTimeout(800);
  const after=await read();
  after.saved=await h.evaluate(()=>((window.__subs[0].shifts||{})["2026-10-14"]||null));
  after.errors=h.errors.slice();
  await h.close();
  return{before,after};
}

// ---- 3. SubsTab 詳細モーダル: 休憩の日別上書きと休暇種別 ------------------------
async function subsTab(){
  const h=await openHarness({root:ROOT,extraHead:EXTRA_HEAD,waitFor:"table",jsx:`
const P={id:"p1",urlToken:"t1",shopId:"S1",label:"10月",startDate:"2026-10-01",endDate:"2026-10-31",deadlineDate:"",createdAt:"2026-09-01T00:00:00.000Z"};
const SUBS=[{id:"s1",periodId:"p1",staffName:"田中",shopId:"S1",comment:"",submittedAt:"2026-09-02T00:00:00.000Z",
  shifts:{"2026-10-01":{status:"work",start:"09:00",end:"18:00"}}}];
const SETTINGS={shopId:"S1",candidates:[],weekdayCandidates:{},dateCandidates:{},
  breakTimes:{weekday:[],sat:[],sun:[],holSat:[],holSun:[]},
  staffAttributes:{田中:"employee"},staffTypeLimits:{employee:{name:"社員"}},
  staffColors:{},staffAliases:{},positions:{kitchen:[],hall:[]},requiredPositions:{},staffPositions:{}};
function Harness(){
  const [subs,setSubs]=React.useState(SUBS);
  window.__subs=subs;
  return <SubsTab subs={subs} periods={[P]} staffList={["田中"]} tt={()=>{}} plan="premium"
    settings={SETTINGS} onSaveSettings={()=>{}} pastSubsLoaded={true}
    onSave={v=>setSubs(p=>{const n=typeof v==="function"?v(p):v;window.__subs=n;return n;})}/>;
}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);`});
  await h.page.waitForTimeout(500);
  // 行をクリックして詳細モーダルを開く
  const opened=await h.clickExact("詳細",{rowSelector:"tbody tr",rowText:null})||await h.clickByText("詳細");
  await h.page.waitForTimeout(500);
  const head=await h.evaluate(()=>[...document.querySelectorAll("th")].map(t=>t.innerText.trim()));
  const before=await h.evaluate(()=>{const tds=[...document.querySelectorAll("tbody tr")].pop();return tds?tds.innerText.replace(/\s+/g," "):null;});
  // 休憩を60分に上書きする（モーダル内の number 入力は休憩欄だけ）
  await h.evaluate(()=>{
    const i=[...document.querySelectorAll("input[type=number]")].pop();if(!i)return;
    const st=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value").set;
    i.focus();st.call(i,"60");i.dispatchEvent(new Event("input",{bubbles:true}));
  });
  await h.page.waitForTimeout(500);
  const saved=await h.evaluate(()=>((window.__subs[0].shifts||{})["2026-10-01"]||null));
  const after=await h.evaluate(()=>{const tds=[...document.querySelectorAll("tbody tr")].pop();return tds?tds.innerText.replace(/\s+/g," "):null;});
  const errors=h.errors.slice();
  await h.close();
  return{head,before,after,saved,errors};
}

// 行が無い配信物（反証）で例外にならないよう、行の取得は必ずこれを通す。
const cellOf=(t,row,i=0)=>((t&&t[row])||[])[i];

(async()=>{
  const st=await setTab(), s=await shiftTab(), sb=await subsTab();
  const pass={
    set_break_card:!!st.breakCard&&/時間帯方式/.test(st.breakCard)&&/長さ方式/.test(st.breakCard),
    set_thresholds_toggle:st.thresholdsHiddenByDefault&&st.thresholdsShown,
    set_break_mode_saved:st.breakMode==="length",
    set_paid_card:!!st.paidCard,
    set_paid_saved:!!st.granted&&st.granted["田中"]===10,
    set_fiscal:st.hasFiscal,
    set_fontsize16:st.fontsizes.every(f=>f>=16),
    // 休憩不足（休憩帯なしで実働10h の日が10日）
    shift_break_short:!!s.before.panel&&/休憩不足10日/.test(s.before.panel),
    // 週の休み: 10/5〜10/11 は全日出勤 → ×休なし。期間の外に掛かる週は要確認
    week_no_rest:Object.values(s.before.weekRest||{}).some(v=>v[0]==="×休なし"),
    week_unknown:Object.values(s.before.weekRest||{}).some(v=>v[0]==="要確認"),
    week_count:Object.values(s.after.weekRest||{}).some(v=>/^休\d+$/.test(v[0])),
    verdict_fix:cellOf(s.before.labor,"総括")==="要修正",
    // ya を入れると leaveType が保存され、両セルが有給色になる
    ya_saved:!!s.after.saved&&s.after.saved.leaveType==="paid"&&!!s.after.saved.adminRest
      &&s.after.saved.adminRest.start===true&&s.after.saved.adminRest.end===true,
    ya_color:!!s.after.c14s&&s.after.c14s.img.includes("rgb(220,235,251)")&&!!s.after.c14e&&s.after.c14e.img.includes("rgb(220,235,251)"),
    ya_counted:/有1\//.test(cellOf(s.after.labor,"休暇")||""),
    paid_remaining:cellOf(s.after.labor,"有給残")==="9日",
    year_total:cellOf(s.before.labor,"2026年度計")==="100:00",
    // 提出一覧の詳細モーダル: 休憩・休暇の列があり、上書きがその日の実働に反映される
    modal_columns:sb.head.includes("休憩")&&sb.head.includes("休暇"),
    modal_break_saved:!!sb.saved&&sb.saved.adjustedBreak===60,
    modal_break_applied:/9:00/.test(sb.before||"")&&/8:00/.test(sb.after||""),
    no_console_errors:st.errors.length===0&&s.after.errors.length===0&&sb.errors.length===0,
  };
  const allPass=Object.values(pass).every(Boolean);
  console.log(JSON.stringify({setTab:st,shiftTab:s,subsTab:sb,pass,allPass},null,1));
  process.exit(allPass?0:1);
})().catch(e=>{console.error(e);process.exit(1);});
