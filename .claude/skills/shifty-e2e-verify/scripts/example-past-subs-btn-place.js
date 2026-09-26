// 「過去データ読込」ボタンの置き場（2026-09-26 ユーザー指示で労務判定の見出しの右へ移動）の回帰テスト。
// app-main.js を読み込まないので Firebase へは1バイトも出ない（SKILL.md 1.6節）。
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-past-subs-btn-place.js → allPass=true / EXIT=0
// 反証: SHIFTY_ROOT=<移動前の配信物> node ... → EXIT=1（ヘッダー側に出るため inLaborTitle=false）
"use strict";
const path=require("node:path");
const {openHarness}=require(path.join(__dirname,"mount-component.js"));
const ROOT=process.env.SHIFTY_ROOT||undefined;
const EXTRA_HEAD=`<style>:root{--c-bg:#F0F2F5;--c-card:#FFFFFF;--c-input:#F3F4F6;--c-input2:#F0F2F5;`+
  `--c-border:#E5E7EB;--c-border2:#D1D5DB;--c-text:#1A1A2E;--c-text2:#374151;--c-text3:#6B7280;`+
  `--c-text4:#9CA3AF;--c-shadow:rgba(0,0,0,.06);--c-accent:#f87036;--c-danger:#DC2626;}</style>`;

// 10月まるごと1期間＋購読窓の外（3ヶ月より前）の古い期間1件＝hasOlderPeriods が true になる。
const wd=[1,2,5,6,7,8,9,12,13,14,15,16,19,20,21,22,23,26,27,28,29,30];
const sh=wd.map(d=>`"2026-10-${String(d).padStart(2,"0")}":{status:"work",start:"09:00",end:"19:00"}`).join(",");

function jsx(plan){return `
const P={id:"p1",urlToken:"t1",shopId:"S1",label:"10月",startDate:"2026-10-01",endDate:"2026-10-31",deadlineDate:"",createdAt:"2026-09-01T00:00:00.000Z"};
const OLD={id:"p0",urlToken:"t0",shopId:"S1",label:"1月",startDate:"2026-01-01",endDate:"2026-01-31",deadlineDate:"",createdAt:"2025-12-01T00:00:00.000Z"};
const SUBS=[
 {id:"s1",periodId:"p1",staffName:"田中",shopId:"S1",comment:"",submittedAt:"2026-09-02T00:00:00.000Z",shifts:{${sh}}},
];
const SETTINGS={shopId:"S1",candidates:[{start:"09:00",end:"23:00"}],weekdayCandidates:{},dateCandidates:{},
  breakTimes:{weekday:[{start:"12:00",end:"13:00"}],sat:[{start:"12:00",end:"13:00"}],sun:[{start:"12:00",end:"13:00"}],holSat:[{start:"12:00",end:"13:00"}],holSun:[{start:"12:00",end:"13:00"}]},
  staffAttributes:{田中:"employee"},
  staffTypeLimits:{employee:{name:"社員"}},
  staffColors:{},staffAliases:{},positions:{kitchen:[],hall:[]},requiredPositions:{},staffPositions:{}};
function Harness(){
  const [subs,setSubs]=React.useState(SUBS);
  return <ShiftEditTab subs={subs} periods={[P,OLD]} staffList={["田中"]}
    onSave={v=>setSubs(p=>typeof v==="function"?v(p):v)} tt={()=>{}}
    settings={SETTINGS} plan="${plan}" shopId="S1" shopName="テスト店" onUpgrade={()=>{}}
    savePeriods={()=>{}} ownerReadOnly={false}
    onLoadPastSubs={()=>{window.__loadPastCalled=(window.__loadPastCalled||0)+1;}} pastSubsLoaded={false}/>;
}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);`;}

async function run(plan){
  const h=await openHarness({root:ROOT,extraHead:EXTRA_HEAD,waitFor:"select",jsx:jsx(plan)});
  await h.page.waitForTimeout(800);
  const m=await h.evaluate(()=>{
    const btns=[...document.querySelectorAll("button")].filter(b=>(b.textContent||"").trim()==="過去データ読込");
    const out={btnCount:btns.length,laborTableShown:false,inLaborTitle:false,inHeader:false,
      prevText:null,sameRow:null,gapPx:null};
    // 見出しの要素はタグに依らず「子要素を持たず本文が見出しそのもの」で探す。
    // span 決め打ちにすると、移動前（div に直書き）を「表が無い」と誤判定して反証が鈍る。
    const laborTitle=[...document.querySelectorAll("*")].find(e=>e.children.length===0
      &&/^労務判定（\d{4}年\d{1,2}月）$/.test((e.textContent||"").trim()));
    out.laborTableShown=!!laborTitle;
    out.laborTitleText=laborTitle?laborTitle.textContent.trim():null;
    if(btns.length===1){
      const b=btns[0];
      // 見出しの直後の兄弟か（= SummaryTable の titleRight スロットに入っているか）
      out.prevText=b.previousElementSibling?b.previousElementSibling.textContent.trim():null;
      out.inLaborTitle=!!laborTitle&&b.previousElementSibling===laborTitle;
      // 「シフト作成」ヘッダー行の中に居るか
      const hdr=[...document.querySelectorAll("span")].find(s=>(s.textContent||"").trim()==="シフト作成");
      out.inHeader=!!hdr&&hdr.parentElement.contains(b);
      if(laborTitle){
        const rb=b.getBoundingClientRect(),rt=laborTitle.getBoundingClientRect();
        out.sameRow=Math.abs((rb.top+rb.height/2)-(rt.top+rt.height/2))<6;
        out.gapPx=Math.round(rb.left-rt.right);
      }
      b.click();
    }
    out.clicked=window.__loadPastCalled||0;
    return out;
  });
  m.errors=h.errors.slice();
  await h.close();
  return m;
}

(async()=>{
  const premium=await run("premium");
  const pro=await run("pro");
  const verdict={
    // Premium＝労務判定表が出る → ボタンは見出しの右隣の1個だけ・ヘッダーには居ない
    premium_laborTableShown:premium.laborTableShown===true,
    premium_oneButton:premium.btnCount===1,
    premium_nextToLaborTitle:premium.inLaborTitle===true,
    premium_sameRow:premium.sameRow===true,
    premium_notInHeader:premium.inHeader===false,
    premium_clickWorks:premium.clicked===1,
    // 非Premium＝労務判定表が出ない → ボタンが消えず従来どおりヘッダーに残る
    pro_noLaborTable:pro.laborTableShown===false,
    pro_oneButton:pro.btnCount===1,
    pro_inHeader:pro.inHeader===true,
    pro_clickWorks:pro.clicked===1,
    noConsoleErrors:premium.errors.length===0&&pro.errors.length===0,
  };
  verdict.allPass=Object.values(verdict).every(Boolean);
  console.log(JSON.stringify({premium,pro,verdict},null,2));
  process.exit(verdict.allPass?0:1);
})();
