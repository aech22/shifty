// シフト作成タブの「削り（回）」（2026-10-05 ユーザー指示）の回帰テスト。
// app-main.js を読み込まないので Firebase へは1バイトも出ない（SKILL.md 1.6節）。
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-shift-cut-count.js → allPass=true / EXIT=0
// 反証: SHIFTY_ROOT=<変更前の配信物> node ... → 削りの行が無く EXIT=1
//
// 仕込み（期間 2026-11-01〜07）:
//   田中（毎日 11〜23 の通しを提出）
//     1日 そのまま → 0 ／ 2日 出勤セルを空欄 → 削り ／ 3日 退勤15 → 削り ／ 4日 両方空欄 → 削り（1日1回）
//     5日 17〜23 に → 削り ／ 6日 出勤セルに / → 数えない ／ 7日 11三（ヘルプ） → 数えない     … 4回
//   佐藤（毎日 11〜15 のランチを提出）
//     1日 17〜23 へ移し替え → 数えない ／ 2日 両方空欄 → 削り                                   … 1回
//   鈴木 手入力だけ（source:"grid"）で出勤セルを空欄 → 0
//   高橋 休みの提出に管理者が時刻を入れて消した日 → 0
// そのあと画面で 田中1日の退勤に 15 を入れる（→5回）、佐藤3日の出勤セルに / を入れる（→1回のまま）。
"use strict";
const path=require("node:path");
const {openHarness}=require(path.join(__dirname,"mount-component.js"));
const ROOT=process.env.SHIFTY_ROOT||undefined;
const EXTRA_HEAD=`<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js" integrity="sha384-ZZ1pncU3bQe8y31yfZdMFdSpttDoPmOZg2wguVK9almUodir1PghgT0eY7Mrty8H" crossorigin="anonymous"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js" integrity="sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk" crossorigin="anonymous"></script>`;

const JSX=`
const P={id:"p1",urlToken:"t1",shopId:"S1",label:"11月第1週",startDate:"2026-11-01",endDate:"2026-11-07",deadlineDate:"",createdAt:"2026-10-01T00:00:00.000Z"};
const D=d=>"2026-11-0"+d;
const T=(s,e,x)=>Object.assign({status:"work",start:s,end:e},x||{});
const SUBS=[
 {id:"s1",periodId:"p1",staffName:"田中",shopId:"S1",comment:"",submittedAt:"2026-10-20T00:00:00.000Z",shifts:{
   [D(1)]:T("11:00","23:00"),
   [D(2)]:T("11:00","23:00",{adjustedStart:"",adjustedStartNote:""}),
   [D(3)]:T("11:00","23:00",{adjustedEnd:"15:00",adjustedEndNote:""}),
   [D(4)]:T("11:00","23:00",{adjustedStart:"",adjustedStartNote:"",adjustedEnd:"",adjustedEndNote:""}),
   [D(5)]:T("11:00","23:00",{adjustedStart:"17:00",adjustedStartNote:""}),
   [D(6)]:T("11:00","23:00",{adminRest:{start:true}}),
   [D(7)]:T("11:00","23:00",{adjustedStart:"11:00",adjustedStartNote:"三"}),
 }},
 {id:"s2",periodId:"p1",staffName:"佐藤",shopId:"S1",comment:"",submittedAt:"2026-10-20T00:00:00.000Z",shifts:{
   [D(1)]:T("11:00","15:00",{adjustedStart:"17:00",adjustedStartNote:"",adjustedEnd:"23:00",adjustedEndNote:""}),
   [D(2)]:T("11:00","15:00",{adjustedStart:"",adjustedStartNote:"",adjustedEnd:"",adjustedEndNote:""}),
   [D(3)]:T("11:00","15:00"),
 }},
 {id:"s3",periodId:"p1",staffName:"鈴木",shopId:"S1",comment:"",submittedAt:"2026-10-20T00:00:00.000Z",source:"grid",shifts:{
   [D(1)]:{status:"work",adjustedStart:"",adjustedStartNote:"",adjustedEnd:"23:00",adjustedEndNote:""},
 }},
 {id:"s4",periodId:"p1",staffName:"高橋",shopId:"S1",comment:"",submittedAt:"2026-10-20T00:00:00.000Z",shifts:{
   [D(1)]:{status:"work",origStatus:"holiday",adjustedStart:"",adjustedStartNote:"",adjustedEnd:"23:00",adjustedEndNote:""},
 }},
];
const SETTINGS={shopId:"S1",candidates:[{start:"11:00",end:"23:00"}],weekdayCandidates:{},dateCandidates:{},
  staffColors:{},staffAliases:{},positions:{kitchen:[],hall:[]},requiredPositions:{},staffPositions:{}};
window.__toasts=[];
function Harness(){
  const [subs,setSubs]=React.useState(SUBS);
  window.__subs=subs;
  return <ShiftEditTab subs={subs} periods={[P]} staffList={["田中","佐藤","鈴木","高橋"]}
    onSave={v=>setSubs(p=>typeof v==="function"?v(p):v)} tt={m=>window.__toasts.push(m)}
    settings={SETTINGS} plan="premium" shopId="S1" shopName="テスト店" onUpgrade={()=>{}} allLinkedShops={[]}
    savePeriods={()=>{}} ownerReadOnly={false} onLoadPastSubs={()=>Promise.resolve()} pastSubsLoaded={true}/>;
}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);`;

(async()=>{
  const h=await openHarness({root:ROOT,extraHead:EXTRA_HEAD,waitFor:"select",jsx:JSX});
  const row=label=>h.evaluate(l=>{const td=[...document.querySelectorAll("td[title]")].find(t=>t.getAttribute("title")===l);
    if(!td)return null;return [...td.parentElement.children].slice(1).map(c=>c.textContent.trim()).filter(x=>x!=="");},label);
  const out={};
  try{
    await h.page.waitForTimeout(1000);
    out.initial=await row("削り（回）");
    out.initialRest=await row("休み合計");
    out.initialConsecRowIndex=await h.evaluate(()=>{const tds=[...document.querySelectorAll("td[title]")].map(t=>t.getAttribute("title"));
      return {consec:tds.indexOf("最大連勤数"),cut:tds.indexOf("削り（回）")};});
    // 画面で削る: 田中 1日の退勤を 15 に → 5回
    await h.fill(h.cell("田中","2026-11-01","end"),"15");
    await h.page.waitForTimeout(1200);
    out.afterCut=await row("削り（回）");
    // 休みコマンド: 佐藤 3日の出勤セルに / → 1回のまま
    await h.fill(h.cell("佐藤","2026-11-03","start"),"/");
    await h.page.waitForTimeout(1200);
    out.afterRest=await row("削り（回）");
    out.satoDay3=await h.evaluate(()=>window.__subs.find(s=>s.id==="s2").shifts["2026-11-03"]);
    // 全データPDFの「休み・連勤カウント」表
    await h.evaluate(()=>{const Orig=window.jspdf.jsPDF;window.jspdf.jsPDF=function(...a){const d=new Orig(...a);d.save=()=>{window.__pdfSaved=true;};return d;};});
    const pdf=await h.capturePdf();
    await h.clickExact("PDF出力");
    await h.clickExact("全データ");
    await h.page.waitForFunction(()=>window.__pdfSaved===true,null,{timeout:30000}).catch(()=>{});
    const blocks=await h.evaluate(()=>window.__pdf.blocks);
    const plain=b=>b.replace(/<[^>]*>/g,"").replace(/\s+/g,"");
    const cb=blocks.find(b=>plain(b).startsWith("休み・連勤カウント"));
    out.pdfCountsText=cb?plain(cb):null;
    out.pdfSaved=await h.evaluate(()=>!!window.__pdfSaved);
    out.errors=h.errors.slice();
  }finally{await h.close();}
  const v={
    rowExists:Array.isArray(out.initial),
    rowBelowConsec:out.initialConsecRowIndex&&out.initialConsecRowIndex.cut===out.initialConsecRowIndex.consec+1,
    initialCounts:JSON.stringify(out.initial)===JSON.stringify(["4","1","0","0"]),
    liveEditCounts:JSON.stringify(out.afterCut)===JSON.stringify(["5","1","0","0"]),
    restCommandNotCounted:JSON.stringify(out.afterRest)===JSON.stringify(["5","1","0","0"])&&!!(out.satoDay3&&out.satoDay3.adminRest&&out.satoDay3.adminRest.start),
    pdfSaved:out.pdfSaved===true,
    pdfHasCutRow:!!out.pdfCountsText&&out.pdfCountsText.includes("最大連勤数")&&/削り（回）5100$/.test(out.pdfCountsText),
    noConsoleErrors:out.errors.length===0,
  };
  v.allPass=Object.values(v).every(Boolean);
  console.log(JSON.stringify({out,verdict:v},null,2));
  process.exit(v.allPass?0:1);
})().catch(e=>{console.error("FATAL",e);process.exit(1);});
