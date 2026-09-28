// 全データPDFに「週の休み」「労務判定」を載せる・年計を実データで出す（2026-09-29 ユーザー指示）の回帰テスト。
// app-main.js を読み込まないので Firebase へは1バイトも出ない（SKILL.md 1.6節）。
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-pdf-labor.js → allPass=true / EXIT=0
// 反証: SHIFTY_ROOT=<変更前の配信物> node ... → EXIT=1
//
// 仕込み（今日=実行日。購読窓＝3ヶ月より前の期間は「過去データ読込」まで提出が届かない）:
//   4月 … 窓の外。凍結値 100分（嘘）／実データ 5日×8h＝40h
//   5月 … 窓の外。凍結値なし／実データ 5日×8h＝40h
//   当月 … 窓の中。凍結値 60分（古い）／実データ 8日×8h＋1日×13h＝77h
// 実データの年計は 157:00。凍結値を優先すると 100分＋60分＋（5月は読めない）になる。
"use strict";
const path=require("node:path");
const {openHarness}=require(path.join(__dirname,"mount-component.js"));
const ROOT=process.env.SHIFTY_ROOT||undefined;
const EXTRA_HEAD=`<style>:root{--c-bg:#F0F2F5;--c-card:#FFFFFF;--c-input:#F3F4F6;--c-input2:#F0F2F5;`+
  `--c-border:#E5E7EB;--c-border2:#D1D5DB;--c-text:#1A1A2E;--c-text2:#374151;--c-text3:#6B7280;`+
  `--c-text4:#9CA3AF;--c-shadow:rgba(0,0,0,.06);--c-accent:#f87036;--c-danger:#DC2626;}</style>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js" integrity="sha384-ZZ1pncU3bQe8y31yfZdMFdSpttDoPmOZg2wguVK9almUodir1PghgT0eY7Mrty8H" crossorigin="anonymous"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js" integrity="sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk" crossorigin="anonymous"></script>`;

const now=new Date();
const ym=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
const fyYear=now.getMonth()+1>=4?now.getFullYear():now.getFullYear()-1;
const lastDay=new Date(now.getFullYear(),now.getMonth()+1,0).getDate();
const days=(pfx,list,s="09:00",e="18:00")=>list.map(d=>`"${pfx}-${String(d).padStart(2,"0")}":{status:"work",start:"${s}",end:"${e}"}`).join(",");

const JSX=`
const P_CUR={id:"pc",urlToken:"tc",shopId:"S1",label:"今月",startDate:"${ym}-01",endDate:"${ym}-${lastDay}",deadlineDate:"",createdAt:"2026-01-01T00:00:00.000Z",
  laborTotals:{田中:{workMin:60}}};
const P_APR={id:"pa",urlToken:"ta",shopId:"S1",label:"4月",startDate:"${fyYear}-04-01",endDate:"${fyYear}-04-30",deadlineDate:"",createdAt:"2026-01-01T00:00:00.000Z",
  laborTotals:{田中:{workMin:100}}};
const P_MAY={id:"pm",urlToken:"tm",shopId:"S1",label:"5月",startDate:"${fyYear}-05-01",endDate:"${fyYear}-05-31",deadlineDate:"",createdAt:"2026-01-01T00:00:00.000Z"};
const CUR_SUB={id:"s1",periodId:"pc",staffName:"田中",shopId:"S1",comment:"",submittedAt:"2026-01-02T00:00:00.000Z",
  shifts:{${days(ym,[2,3,4,5,8,9,10,11])},${days(ym,[1],"09:00","23:00")}}};
const OLD_SUBS=[
 {id:"s2",periodId:"pa",staffName:"田中",shopId:"S1",comment:"",submittedAt:"2026-01-02T00:00:00.000Z",shifts:{${days(fyYear+"-04",[6,7,8,9,10])}}},
 {id:"s3",periodId:"pm",staffName:"田中",shopId:"S1",comment:"",submittedAt:"2026-01-02T00:00:00.000Z",shifts:{${days(fyYear+"-05",[11,12,13,14,15])}}},
];
const B=[{start:"12:00",end:"13:00"}];
const SETTINGS={shopId:"S1",candidates:[{start:"09:00",end:"23:00"}],weekdayCandidates:{},dateCandidates:{},
  breakTimes:{weekday:B,sat:B,sun:B,holSat:B,holSun:B},
  staffAttributes:{田中:"employee"},staffTypeLimits:{employee:{name:"社員"}},
  staffColors:{},staffAliases:{},positions:{kitchen:[],hall:[]},requiredPositions:{},staffPositions:{}};
window.__toasts=window.__toasts||[];
function Harness(){
  const [subs,setSubs]=React.useState([CUR_SUB]);
  const [loaded,setLoaded]=React.useState(false);
  window.__yearCell=()=>{const td=[...document.querySelectorAll("td")].find(t=>/^${fyYear}年度計$/.test((t.textContent||"").trim()));
    return td&&td.nextElementSibling?td.nextElementSibling.textContent.trim():null;};
  // 本物の loadPastSubs と同じく、フラグは即座に立ち、提出は遅れて届き、Promise は届いてから解決する
  const load=()=>{window.__loadCalls=(window.__loadCalls||0)+1;setLoaded(true);
    return new Promise(r=>setTimeout(()=>{setSubs(p=>[...p,...OLD_SUBS]);r();},400));};
  return <ShiftEditTab subs={subs} periods={[P_CUR,P_MAY,P_APR]} staffList={["田中"]}
    onSave={v=>setSubs(p=>typeof v==="function"?v(p):v)} tt={m=>window.__toasts.push(m)}
    settings={SETTINGS} plan="premium" shopId="S1" shopName="テスト店" onUpgrade={()=>{}}
    savePeriods={()=>{}} ownerReadOnly={false} onLoadPastSubs={load} pastSubsLoaded={loaded}/>;
}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);`;

(async()=>{
  const h=await openHarness({root:ROOT,extraHead:EXTRA_HEAD,waitFor:"select",jsx:JSX});
  await h.page.waitForTimeout(800);
  const before=await h.evaluate(()=>window.__yearCell());
  // jsPDF の配置を記録する（ページ数と、各画像がどのページのどの高さに置かれたか）
  await h.evaluate(()=>{
    window.__pdfLog=[];
    const Orig=window.jspdf.jsPDF;
    window.jspdf.jsPDF=function(...a){const d=new Orig(...a);let page=1;
      const ap=d.addPage.bind(d);d.addPage=(...x)=>{page++;window.__pdfLog.push({t:"page",page});return ap(...x);};
      const ai=d.addImage.bind(d);d.addImage=(img,fmt,x,y,w,hh)=>{window.__pdfLog.push({t:"img",page,y:+y.toFixed(1),h:+hh.toFixed(1)});return ai(img,fmt,x,y,w,hh);};
      d.save=()=>{window.__pdfSaved=true;};return d;};
  });
  const pdf=await h.capturePdf();
  const o=await h.clickExact("PDF出力");
  const a=await h.clickExact("全データ");
  await h.page.waitForFunction(()=>window.__pdfSaved===true,null,{timeout:30000}).catch(()=>{});
  await h.page.waitForTimeout(300);
  const after=await h.evaluate(()=>window.__yearCell());
  const blocks=await h.evaluate(()=>window.__pdf.blocks);
  const plain=b=>b.replace(/<[^>]*>/g,"").replace(/\s+/g,"");
  const weekBlock=blocks.find(b=>plain(b).startsWith("週の休み"));
  const laborBlock=blocks.find(b=>plain(b).startsWith("労務判定"));
  const findBlock=blocks.find(b=>plain(b).startsWith("労務の確認が必要です"));
  const laborText=laborBlock?plain(laborBlock):"";
  const r=await h.evaluate(()=>({loadCalls:window.__loadCalls||0,toasts:window.__toasts,log:window.__pdfLog,saved:!!window.__pdfSaved}));
  const imgs=r.log.filter(x=>x.t==="img");
  const m={clicked:[o,a],before,after,blockCount:blocks.length,laborText,
    weekText:weekBlock?plain(weekBlock).slice(0,80):null,findText:findBlock?plain(findBlock):null,...r,errors:h.errors.slice()};
  await h.close();
  const verdict={
    screenBeforeIsPartial:typeof before==="string"&&before.startsWith("＋"),
    loadedBeforeExport:m.loadCalls===1,
    pdfSaved:m.saved===true,
    weekRestInPdf:!!weekBlock&&/<table/.test(weekBlock),
    laborInPdf:!!laborBlock&&/<table/.test(laborBlock),
    // 年計が実データ（4月40h＋5月40h＋当月77h）で、途中の印「＋」が付かない
    yearIsRealData:laborText.includes(`${fyYear}年度計157:00`),
    yearNoPlus:!laborText.includes(`${fyYear}年度計＋`),
    findingsInPdf:!!findBlock&&findBlock.includes("12h超"),
    // 見出しと表は同じ画像ブロック＝同じ addImage の1枚。画像はすべてページの内側に収まる
    titleWithTable:[weekBlock,laborBlock].every(b=>b&&/^<div[^>]*>[^<]*<\/div><table/.test(b)),
    imagesInsidePage:imgs.length>0&&imgs.every(x=>x.y>=5&&x.y+x.h<=205+0.01),
    screenAfterIsReal:m.after==="157:00",
    toastOk:m.toasts.some(t=>/ダウンロードしました/.test(t)),
    noConsoleErrors:m.errors.length===0,
  };
  verdict.allPass=Object.values(verdict).every(Boolean);
  console.log(JSON.stringify({m,verdict},null,2));
  process.exit(verdict.allPass?0:1);
})();
