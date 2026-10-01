// 上限と「所定未満」を所定基準にする（2026-10-01・シフトひな型2026-10版_取り込みと差分_実装計画.html 第3部 F4・D10）の
// 実ブラウザ回帰テスト。app-main.js を読み込まないので Firebase へは1バイトも出ない（SKILL.md 1.6節）。
//
// 仕込み: 2026年10月の1か月期間・A制（社員）の田中が 9h×22日＋8.5h×1日＝206:30。休憩 12:00〜13:00。
//   年間所定 2,080h（所定上限 176:39）: 上限 = ROUNDDOWN(176:39 + 30h) = 206:00 → 目安の列は「みなし超 0.5h」
//   年間所定なし（総枠 177:08）       : 上限 = 177:08 + 30h = 207:08         → 「OK 上限まで0.63h」（従来どおり）
//   所定未満の境界: 177:00 は 所定176:39 以上なので年間所定ありでは「目安未満 あと22h」、なしでは「所定未満 あと0.14h」。
// 全データPDFの労務判定の表にも同じ文言が載ることを確かめる（画面と PDF は laborRows を共有している）。
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-labor-sched-cap.js → allPass=true / EXIT=0
// 反証: SHIFTY_ROOT=<F4 より前の配信物> node ... → EXIT=1（年間所定ありでも「OK 上限まで0.63h」になる）
"use strict";
const path=require("node:path");
const {openHarness}=require(path.join(__dirname,"mount-component.js"));
const ROOT=process.env.SHIFTY_ROOT||undefined;
const EXTRA_HEAD=`<style>:root{--c-bg:#F0F2F5;--c-card:#FFFFFF;--c-input:#F3F4F6;--c-input2:#F0F2F5;`+
  `--c-border:#E5E7EB;--c-border2:#D1D5DB;--c-text:#1A1A2E;--c-text2:#374151;--c-text3:#6B7280;`+
  `--c-text4:#9CA3AF;--c-shadow:rgba(0,0,0,.06);--c-accent:#f87036;--c-danger:#DC2626;}</style>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js" integrity="sha384-ZZ1pncU3bQe8y31yfZdMFdSpttDoPmOZg2wguVK9almUodir1PghgT0eY7Mrty8H" crossorigin="anonymous"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js" integrity="sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk" crossorigin="anonymous"></script>`;

const p2=d=>String(d).padStart(2,"0");
// 1〜31日のうち 23日を出勤（休みは 4,11,18,25,28,29,30,31 の8日）
const REST=new Set([4,11,18,25,28,29,30,31]);
const WORK=Array.from({length:31},(_,i)=>i+1).filter(d=>!REST.has(d));
// n日を出勤（先頭から）。最終日だけ退勤を lastEnd にする
const shiftsOf=(lastEnd,n=WORK.length)=>WORK.slice(0,n).map((d,i)=>`"2026-10-${p2(d)}":{status:"work",start:"09:00",end:"${i===n-1?lastEnd:"19:00"}"}`).join(",");

async function run({annual,lastEnd,n,pdf}){
  const h=await openHarness({root:ROOT,extraHead:EXTRA_HEAD,waitFor:"select",jsx:`
const PA={id:"pa",urlToken:"ta",shopId:"S1",label:"10月",startDate:"2026-10-01",endDate:"2026-10-31",deadlineDate:"",createdAt:"2026-09-01T00:00:00.000Z"};
const SUBS=[{id:"s1",periodId:"pa",staffName:"田中",shopId:"S1",comment:"",submittedAt:"2026-09-02T00:00:00.000Z",shifts:{${shiftsOf(lastEnd,n)}}}];
const B=[{start:"12:00",end:"13:00"}];
const SETTINGS={shopId:"S1",candidates:[{start:"09:00",end:"23:00"}],weekdayCandidates:{},dateCandidates:{},
  breakTimes:{weekday:B,sat:B,sun:B,holSat:B,holSun:B},
  staffAttributes:{田中:"employee"},staffTypeLimits:{employee:{name:"社員"}},periodUnit:"1month",
  ${annual?`laborSettings:{annualScheduledMin:${annual}},`:""}
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
    const w=[...document.querySelectorAll("div")].find(d=>(d.innerText||"").startsWith("労務判定（2026年10月）"));
    if(!w)return{labor:null};
    const r={};[...w.querySelectorAll("tbody tr")].forEach(tr=>{const td=[...tr.querySelectorAll("td")];
      r[td[0].innerText.trim()]=td[1]?td[1].innerText.trim():"";});
    return{labor:r};
  });
  if(pdf){
    await h.evaluate(()=>{const Orig=window.jspdf.jsPDF;window.jspdf.jsPDF=function(...a){const d=new Orig(...a);d.save=()=>{window.__pdfSaved=true;};return d;};});
    await h.capturePdf();
    await h.clickExact("PDF出力");
    await h.clickExact("全データ");
    await h.page.waitForFunction(()=>window.__pdfSaved===true,null,{timeout:30000}).catch(()=>{});
    const blocks=await h.evaluate(()=>(window.__pdf&&window.__pdf.blocks)||[]);
    const plain=b=>b.replace(/<[^>]*>/g,"").replace(/\s+/g,"");
    const lb=blocks.find(b=>plain(b).startsWith("労務判定"));
    m.pdfLabor=lb?plain(lb):null;
  }
  m.errors=h.errors.slice();
  await h.close();
  return m;
}

(async()=>{
  const A=await run({annual:124800,lastEnd:"18:30",pdf:true});     // 206:30・年間所定あり
  const N=await run({annual:0,lastEnd:"18:30",pdf:false});         // 206:30・年間所定なし
  // 177:00 ちょうど（9h×19日＋6h×1日。09:00〜16:00 は休憩1hを含むので6h）
  const A2=await run({annual:124800,lastEnd:"16:00",n:20,pdf:false});
  const N2=await run({annual:0,lastEnd:"16:00",n:20,pdf:false});
  const g=x=>(x.labor||{})["目安"]||"";
  const w=x=>(x.labor||{})["月実働"]||"";
  const v={
    table_found:!!A.labor&&!!N.labor,
    work_20630:w(A)==="206:30"&&w(N)==="206:30",
    // 年間所定あり: 上限 206:00 を 0.5h 超えるので「みなし超 0.5h」
    annual_over:g(A)==="みなし超 0.5h",
    // 年間所定なし: 上限 207:08（従来どおり）まで 0.63h
    noannual_ok:g(N)==="OK 上限まで0.63h",
    // PDF の労務判定にも同じ文言が載る
    pdf_same:typeof A.pdfLabor==="string"&&A.pdfLabor.includes("みなし超0.5h"),
    work_177:w(A2)==="177:00"&&w(N2)==="177:00",
    // 177:00 は所定 176:39 以上・総枠 177:08 未満。年間所定ありは「目安未満 あと22h」、なしは「所定未満 あと0.14h」
    annual_under_guide:g(A2)==="目安未満 あと22h",
    noannual_under_base:g(N2)==="所定未満 あと0.14h",
    no_console_errors:[A,N,A2,N2].every(x=>x.errors.length===0),
  };
  v.allPass=Object.values(v).every(Boolean);
  console.log(JSON.stringify({A:{labor:A.labor,pdfLabor:A.pdfLabor},N:{labor:N.labor},A2:{labor:A2.labor},N2:{labor:N2.labor},errors:[A.errors,N.errors,A2.errors,N2.errors],verdict:v},null,1));
  process.exit(v.allPass?0:1);
})().catch(e=>{console.error(e);process.exit(1);});
