// 特定技能の週の公休（2026-10-01 ユーザー指示）の実ブラウザ回帰テスト。
// app-main.js を読み込まないので Firebase へは1バイトも出ない（SKILL.md 1.6節）。
//
// 仕込み: 9月後半（9/16〜9/30）と10月前半（10/1〜10/15）の2期間。9/28(月)〜10/4(日) の週は月をまたぐ。
//   グエン（企業属性 co_Hzxk84Qv「特定技能」・A制）と田中（社員・対照）に同じシフトを入れる:
//   9/28・9/29・9/30・10/1・10/3・10/4 に 9:00〜18:00、10/2 だけ空欄（＝公休）。他の日は空欄。
//   → 週の公休は10月側の1日だけ。従来の週1休なら田中は「休1」で問題なし、特定技能のグエンは9月側に0日で違反。
//
//  - 週の休み表（28〜4日の行）: グエンは「×休1」が赤・太字、title に「9月側 0日・10月側 1日」。田中は「休1」
//  - 「⚠ 労務の確認が必要です」に「グエン：特定技能の週の公休不足（28〜4）」が出て、田中は出ない
//  - 労務判定表の総括はグエンが要修正
//  - 全データPDFの「週の休み」と「労務の確認が必要です」にも同じ内容が載る（画面と行定義を共有）
//  - 10/2 にもう1日足して9月側にも公休を入れる版（9/30 を空欄）では違反にならない（対照）
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-skilled-week-rest.js → allPass=true / EXIT=0
// 反証: SHIFTY_ROOT=<この変更より前の配信物> node ... → EXIT=1
"use strict";
const path=require("node:path");
const {openHarness}=require(path.join(__dirname,"mount-component.js"));
const ROOT=process.env.SHIFTY_ROOT||undefined;
const EXTRA_HEAD=`<style>:root{--c-bg:#F0F2F5;--c-card:#FFFFFF;--c-input:#F3F4F6;--c-input2:#F0F2F5;`+
  `--c-border:#E5E7EB;--c-border2:#D1D5DB;--c-text:#1A1A2E;--c-text2:#374151;--c-text3:#6B7280;`+
  `--c-text4:#9CA3AF;--c-shadow:rgba(0,0,0,.06);--c-accent:#f87036;--c-danger:#DC2626;}</style>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js" integrity="sha384-ZZ1pncU3bQe8y31yfZdMFdSpttDoPmOZg2wguVK9almUodir1PghgT0eY7Mrty8H" crossorigin="anonymous"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js" integrity="sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk" crossorigin="anonymous"></script>`;

const jsx=workDays=>{
  const sh=workDays.map(d=>`"${d}":{status:"work",start:"09:00",end:"18:00"}`).join(",");
  const sub=(id,pid,name,days)=>`{id:"${id}",periodId:"${pid}",staffName:"${name}",shopId:"S1",comment:"",submittedAt:"2026-09-02T00:00:00.000Z",shifts:{${days}}}`;
  const sep=workDays.filter(d=>d<"2026-10-01").map(d=>`"${d}":{status:"work",start:"09:00",end:"18:00"}`).join(",");
  const oct=workDays.filter(d=>d>="2026-10-01").map(d=>`"${d}":{status:"work",start:"09:00",end:"18:00"}`).join(",");
  void sh;
  return `
const PS={id:"ps",urlToken:"ts",shopId:"S1",label:"9月後半",startDate:"2026-09-16",endDate:"2026-09-30",deadlineDate:"",createdAt:"2026-09-01T00:00:00.000Z"};
const PO={id:"po",urlToken:"to",shopId:"S1",label:"10月前半",startDate:"2026-10-01",endDate:"2026-10-15",deadlineDate:"",createdAt:"2026-09-01T00:00:00.000Z"};
const SUBS=[${sub("a1","ps","グエン",sep)},${sub("a2","po","グエン",oct)},${sub("b1","ps","田中",sep)},${sub("b2","po","田中",oct)}];
const B=[{start:"12:00",end:"13:00"}];
const SETTINGS={shopId:"S1",candidates:[{start:"09:00",end:"23:00"}],weekdayCandidates:{},dateCandidates:{},
  breakTimes:{weekday:B,sat:B,sun:B,holSat:B,holSun:B},
  staffAttributes:{グエン:"co_Hzxk84Qv",田中:"employee"},
  staffTypeLimits:{employee:{name:"社員"},co_Hzxk84Qv:{name:"特定技能",laborSystem:"A",monthly:222,monthlyMin:207}},periodUnit:"2week",
  staffColors:{},staffAliases:{},positions:{kitchen:[],hall:[]},requiredPositions:{},staffPositions:{}};
window.__toasts=[];
function Harness(){
  const [subs,setSubs]=React.useState(SUBS);
  return <ShiftEditTab subs={subs} periods={[PO,PS]} staffList={["グエン","田中"]}
    onSave={v=>setSubs(p=>typeof v==="function"?v(p):v)} tt={m=>window.__toasts.push(m)}
    settings={SETTINGS} plan="premium" shopId="S1" shopName="テスト店" onUpgrade={()=>{}}
    savePeriods={()=>{}} ownerReadOnly={false} pastSubsLoaded={true}/>;
}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);`;
};

const measure=async(h)=>h.evaluate(()=>{
  const wr=[...document.querySelectorAll("div")].find(d=>(d.innerText||"").startsWith("週の休み"));
  const row=wr?[...wr.querySelectorAll("tbody tr")].find(tr=>{const c=tr.querySelector("td");return c&&c.innerText.trim()==="28〜4日";}):null;
  const cell=i=>{if(!row)return null;const td=row.querySelectorAll("td")[i];if(!td)return null;const el=td.querySelector("span,div")||td;
    const cs=getComputedStyle(el);return{v:td.innerText.trim(),t:td.getAttribute("title")||el.getAttribute("title")||"",color:cs.color,weight:cs.fontWeight};};
  const lab=[...document.querySelectorAll("div")].find(d=>/^労務判定（/.test(d.innerText||""));
  const vrow=lab?[...lab.querySelectorAll("tbody tr")].find(tr=>{const c=tr.querySelector("td");return c&&c.innerText.trim()==="総括";}):null;
  const panel=[...document.querySelectorAll("div")].find(d=>(d.innerText||"").startsWith("⚠ 労務の確認が必要です"));
  return{g:cell(1),t:cell(2),verdict:vrow?[...vrow.querySelectorAll("td")].slice(1,3).map(td=>td.innerText.trim()):null,
    panel:panel?panel.innerText:null};
});

(async()=>{
  // 違反の版: 10/2 だけ空欄
  const W=["2026-09-28","2026-09-29","2026-09-30","2026-10-01","2026-10-03","2026-10-04"];
  let h=await openHarness({root:ROOT,extraHead:EXTRA_HEAD,waitFor:"select",jsx:jsx(W)});
  await h.page.waitForTimeout(1000);
  const m=await measure(h);
  // 全データPDF
  await h.evaluate(()=>{const Orig=window.jspdf.jsPDF;window.jspdf.jsPDF=function(...a){const d=new Orig(...a);d.save=()=>{window.__pdfSaved=true;};return d;};});
  await h.capturePdf();
  m.pdfClick=[await h.clickExact("PDF出力"),await h.clickExact("全データ")];
  await h.page.waitForFunction(()=>window.__pdfSaved===true,null,{timeout:30000}).catch(()=>{});
  const blocks=await h.evaluate(()=>(window.__pdf&&window.__pdf.blocks)||[]);
  const plain=b=>b.replace(/<[^>]*>/g,"").replace(/\s+/g,"");
  const wb=blocks.find(b=>plain(b).startsWith("週の休み"));
  const fb=blocks.find(b=>plain(b).startsWith("労務の確認が必要です"));
  m.pdfWeek=wb?plain(wb):null;m.pdfWeekRed=!!wb&&/×休1/.test(wb)&&/#e53935/i.test(wb);
  m.pdfFind=fb?plain(fb):null;
  m.errors=h.errors.slice();await h.close();

  // 対照: 9/30 を空欄・10/2 も空欄（9月側・10月側に各1回）→ 違反にならない
  const W2=["2026-09-28","2026-09-29","2026-10-01","2026-10-03","2026-10-04"];
  h=await openHarness({root:ROOT,extraHead:EXTRA_HEAD,waitFor:"select",jsx:jsx(W2)});
  await h.page.waitForTimeout(1000);
  const c=await measure(h);c.errors=h.errors.slice();await h.close();

  const v={
    weekRowFound:!!m.g&&!!m.t,
    skilledRedBold:!!m.g&&m.g.v==="×休1"&&m.g.color==="rgb(229, 57, 53)"&&Number(m.g.weight)>=700,
    skilledTitleSides:!!m.g&&/9月側 0日・10月側 1日/.test(m.g.t)&&/月末側と月初側に各1回/.test(m.g.t),
    controlUnchanged:!!m.t&&m.t.v==="休1"&&m.t.color!=="rgb(229, 57, 53)",
    panelHasSkilled:!!m.panel&&/グエン：[^\n]*特定技能の週の公休不足（28〜4）/.test(m.panel),
    panelNoControl:!!m.panel&&!/田中：[^\n]*特定技能/.test(m.panel),
    verdictFix:Array.isArray(m.verdict)&&m.verdict[0]==="要修正",
    pdfWeek:!!m.pdfWeek&&m.pdfWeekRed===true,
    pdfFindings:!!m.pdfFind&&m.pdfFind.includes("特定技能の週の公休不足（28〜4）"),
    bothSidesOk:!!c.g&&c.g.v==="休2"&&c.g.color!=="rgb(229, 57, 53)"&&!(c.panel&&/特定技能の週の公休不足/.test(c.panel)),
    noErrors:m.errors.length===0&&c.errors.length===0,
  };
  v.allPass=Object.values(v).every(Boolean);
  console.log(JSON.stringify({m,control:c,verdict:v},null,2));
  process.exit(v.allPass?0:1);
})().catch(e=>{console.error(e);process.exit(2);});
