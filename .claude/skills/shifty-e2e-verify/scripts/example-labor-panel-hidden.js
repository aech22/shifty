// シフト作成タブの「⚠ 労務の確認が必要です」（画面）から 8h超(残業)・休憩不足・日の時間外・1日の残業が上限超（B制）を
// 出さない（2026-10-10 ユーザー指示）の回帰テスト。PDF の同じ欄と、それ以外の判定は従来どおり出ることも測る。
// app-main.js を読み込まないので Firebase へは1バイトも出ない（SKILL.md 1.6節）。
//
// 仕込み（10月後半・休憩の設定なし）:
//   田中（パート・B制） … 09:00〜20:00 を2日＝8h超・休憩不足・日の時間外・1日の残業が上限超（協定1h）だけに当たる
//   鈴木（社員・A制）   … 09:00〜23:00 を1日＝12h超（画面に残る）と、8h超ではない A制の指摘
// 期待: 画面の欄に田中の行は無く、鈴木の行は12h超を含み、4項目の文言はどこにも出ない。PDF には田中の4項目が残る。
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-labor-panel-hidden.js → allPass=true / EXIT=0
// 反証: SHIFTY_ROOT=<変更前の配信物> node ... → EXIT=1
"use strict";
const path=require("node:path");
const {openHarness}=require(path.join(__dirname,"mount-component.js"));
const ROOT=process.env.SHIFTY_ROOT||undefined;
const EXTRA_HEAD=`<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js" integrity="sha384-ZZ1pncU3bQe8y31yfZdMFdSpttDoPmOZg2wguVK9almUodir1PghgT0eY7Mrty8H" crossorigin="anonymous"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js" integrity="sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk" crossorigin="anonymous"></script>`;
const w=(s,e)=>({status:"work",start:s,end:e});
const JSX=`
const P={id:"p1",urlToken:"t1",shopId:"S1",label:"10月後半",startDate:"2026-10-16",endDate:"2026-10-31",deadlineDate:"",createdAt:"2026-09-01T00:00:00.000Z"};
const SUBS=[
 {id:"a",periodId:"p1",staffName:"田中",shopId:"S1",comment:"",submittedAt:"2026-09-02T00:00:00.000Z",shifts:${JSON.stringify({"2026-10-19":w("09:00","20:00"),"2026-10-20":w("09:00","20:00")})}},
 {id:"b",periodId:"p1",staffName:"鈴木",shopId:"S1",comment:"",submittedAt:"2026-09-02T00:00:00.000Z",shifts:${JSON.stringify({"2026-10-21":w("09:00","23:00")})}},
];
const BRK={weekday:[],sat:[],sun:[],holSat:[],holSun:[]};
const SETTINGS={shopId:"S1",candidates:[{start:"09:00",end:"23:00"}],weekdayCandidates:{},dateCandidates:{},breakTimes:BRK,
  staffAttributes:{田中:"parttime",鈴木:"employee"},staffTypeLimits:{},staffNumbers:{田中:"1",鈴木:"2"},
  laborSettings:{agreementDailyOtMin:60},
  staffColors:{},staffAliases:{},positions:{kitchen:[],hall:[]},requiredPositions:{},staffPositions:{}};
function Harness(){
  return <ShiftEditTab subs={SUBS} periods={[P]} staffList={["田中","鈴木"]}
    onSave={()=>{}} tt={()=>{}} settings={SETTINGS} plan="premium" shopId="S1" shopName="テスト店" onUpgrade={()=>{}}
    savePeriods={()=>{}} ownerReadOnly={false} onLoadPastSubs={()=>Promise.resolve()} pastSubsLoaded={true}/>;
}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);`;

const HIDDEN=["8h超","休憩不足","日の時間外","1日の残業が上限超"];
(async()=>{
  const h=await openHarness({root:ROOT,extraHead:EXTRA_HEAD,waitFor:"select",jsx:JSX});
  const out={};
  try{
    await h.page.waitForTimeout(1500);
    out.screen=await h.evaluate(()=>{
      const head=[...document.querySelectorAll("span")].find(s=>s.textContent.trim()==="⚠ 労務の確認が必要です");
      if(!head)return null;
      const box=head.parentElement.nextElementSibling;
      return [...box.children].map(d=>d.textContent.trim());
    });
    await h.evaluate(()=>{const Orig=window.jspdf.jsPDF;window.jspdf.jsPDF=function(...a){const d=new Orig(...a);d.save=()=>{window.__pdfSaved=true;};return d;};});
    await h.capturePdf();
    await h.clickExact("PDF出力");await h.clickExact("全データ");
    await h.page.waitForFunction(()=>window.__pdfSaved===true,null,{timeout:30000}).catch(()=>{});
    const blocks=await h.evaluate(()=>window.__pdf?window.__pdf.blocks:[]);
    const plain=b=>b.replace(/<[^>]*>/g,"").replace(/\s+/g,"");
    const fb=blocks.find(b=>plain(b).startsWith("労務の確認が必要です"));
    out.pdf=fb?plain(fb):null;
    const scr=(out.screen||[]).join("\n");
    const tanakaPdf=(out.pdf||"").split("田中：")[1]||"";
    out.verdict={
      panelShown:Array.isArray(out.screen)&&out.screen.length>0,
      tanakaRowGone:!(out.screen||[]).some(l=>l.startsWith("田中：")),
      suzukiKeepsOver12:(out.screen||[]).some(l=>l.startsWith("鈴木：")&&l.includes("12h超")),
      hiddenNotOnScreen:HIDDEN.every(k=>!scr.includes(k)),
      pdfKeepsAll:HIDDEN.every(k=>tanakaPdf.includes(k)),
    };
    out.verdict.allPass=Object.values(out.verdict).every(Boolean);
    out.errors=h.errors.slice();
  }finally{await h.close();}
  console.log(JSON.stringify(out,null,2));
  process.exit(out.verdict&&out.verdict.allPass&&!(out.errors||[]).length?0:1);
})().catch(e=>{console.error(e);process.exit(2);});
