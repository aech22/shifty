// 入力の確認（2026-10-01・シフトひな型2026-10版_取り込みと差分_実装計画.html 第3部 F6・D11）の実ブラウザ回帰テスト。
// app-main.js を読み込まないので Firebase へは1バイトも出ない（SKILL.md 1.6節）。
//
// 仕込み（10月前半・3人とも通常の労働時間制＝バイト）:
//   松南恭介 … 計画書の検証手順どおり、退勤だけ 23:00 ×3（2・6・9日）・出勤だけ 11:00 ×1（13日）。番号あり
//   山田     … 14日の出勤セルにグリッドから「事務11」と打つ（時刻が取れずメモだけ残る）。番号なし
//   鈴木     … グリッドから設計どおりの入力だけを打つ: 「9k」「18」／出勤「11」＋退勤「/」（半日の休み希望）／
//              出勤「11」＋退勤「yu」（半日の有給）／出勤「9x」だけ（ランチ帯の応援）。番号あり
// 期待: 「⚠ 労務の確認が必要です」に
//   松南恭介：入力の確認4日（2・6・9・13）、深夜3日（2・6・9）（深夜は既存の割増の目印）
//   山田：入力の確認1日（14）、従業員番号が未設定
// が出て、鈴木は出ない。**総括は3人とも「OK」**（入力の確認は要修正ではない）。
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-labor-input-check.js → allPass=true / EXIT=0
// 反証: SHIFTY_ROOT=<F6 より前の配信物> node ... → EXIT=1（パネルに入力の確認が出ない）。総括は変更前と同じ値になる
"use strict";
const path=require("node:path");
const {openHarness}=require(path.join(__dirname,"mount-component.js"));
const ROOT=process.env.SHIFTY_ROOT||undefined;
const EXTRA_HEAD=`<style>:root{--c-bg:#F0F2F5;--c-card:#FFFFFF;--c-input:#F3F4F6;--c-input2:#F0F2F5;`+
  `--c-border:#E5E7EB;--c-border2:#D1D5DB;--c-text:#1A1A2E;--c-text2:#374151;--c-text3:#6B7280;`+
  `--c-text4:#9CA3AF;--c-shadow:rgba(0,0,0,.06);--c-accent:#f87036;--c-danger:#DC2626;}</style>`;

const JSX=`
const PA={id:"pa",urlToken:"ta",shopId:"S1",label:"10月前半",startDate:"2026-10-01",endDate:"2026-10-15",deadlineDate:"",createdAt:"2026-09-01T00:00:00.000Z"};
const W=(s,e)=>({status:"work",adjustedStart:s,adjustedEnd:e,adjustedStartNote:"",adjustedEndNote:""});
const SUBS=[
 {id:"s1",periodId:"pa",staffName:"松南恭介",shopId:"S1",comment:"",submittedAt:"2026-09-02T00:00:00.000Z",source:"grid",shifts:{
   "2026-10-01":W("11:00","15:00"),"2026-10-07":W("11:00","15:00"),
   "2026-10-02":{status:"work",adjustedEnd:"23:00",adjustedEndNote:""},
   "2026-10-06":{status:"work",adjustedEnd:"23:00",adjustedEndNote:""},
   "2026-10-09":{status:"work",adjustedEnd:"23:00",adjustedEndNote:""},
   "2026-10-13":{status:"work",adjustedStart:"11:00",adjustedStartNote:""}}},
 {id:"s2",periodId:"pa",staffName:"山田",shopId:"S1",comment:"",submittedAt:"2026-09-02T00:00:00.000Z",source:"grid",shifts:{
   "2026-10-02":W("11:00","15:00"),"2026-10-08":W("11:00","15:00")}},
];
const B=[{start:"12:00",end:"13:00"}];
const SETTINGS={shopId:"S1",candidates:[{start:"11:00",end:"15:00"},{start:"17:00",end:"23:00"}],weekdayCandidates:{},dateCandidates:{},
  breakTimes:{weekday:B,sat:B,sun:B,holSat:B,holSun:B},
  staffAttributes:{松南恭介:"parttime",山田:"parttime",鈴木:"parttime"},staffTypeLimits:{parttime:{name:"パート・アルバイト"}},
  staffNumbers:{松南恭介:"8801",鈴木:"8803"},periodUnit:"2week",
  staffColors:{},staffAliases:{},positions:{kitchen:[],hall:[]},requiredPositions:{},staffPositions:{}};
function Harness(){
  const [subs,setSubs]=React.useState(SUBS);
  window.__subs=subs;
  return <ShiftEditTab subs={subs} periods={[PA]} staffList={["松南恭介","山田","鈴木"]}
    onSave={v=>setSubs(p=>typeof v==="function"?v(p):v)} tt={()=>{}}
    settings={SETTINGS} plan="premium" shopId="S1" shopName="テスト店" onUpgrade={()=>{}}
    savePeriods={()=>{}} ownerReadOnly={false} pastSubsLoaded={true}/>;
}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);`;

(async()=>{
  const h=await openHarness({root:ROOT,extraHead:EXTRA_HEAD,waitFor:"select",jsx:JSX});
  await h.page.waitForTimeout(800);
  const typed=[];
  const put=async(name,date,field,val)=>{const sel=h.cell(name,date,field);
    const ok=await h.page.$(sel);typed.push({name,date,field,val,found:!!ok});if(ok)await h.fill(sel,val);};
  await put("山田","2026-10-14","start","事務11");
  await put("鈴木","2026-10-01","start","9k");
  await put("鈴木","2026-10-01","end","18");
  await put("鈴木","2026-10-05","start","11");
  await put("鈴木","2026-10-05","end","/");
  await put("鈴木","2026-10-08","start","11");
  await put("鈴木","2026-10-08","end","yu");
  await put("鈴木","2026-10-12","start","9x");
  await h.page.waitForTimeout(600);
  const m=await h.evaluate(()=>{
    const panel=[...document.querySelectorAll("div")].find(d=>(d.innerText||"").startsWith("⚠ 労務の確認が必要です"));
    const lines=panel?[...panel.querySelectorAll("div > div > div")].map(x=>x.innerText.trim()).filter(Boolean):[];
    const w=[...document.querySelectorAll("div")].find(d=>(d.innerText||"").startsWith("労務判定（2026年10月）"));
    let verdict=null;
    if(w){const t=w.querySelector("table");const hs=[...t.querySelectorAll("thead th")].map(th=>th.innerText.trim());
      const row=[...t.querySelectorAll("tbody tr")].find(tr=>tr.querySelector("td").innerText.trim()==="総括");
      if(row){const td=[...row.querySelectorAll("td")].map(x=>x.innerText.trim());verdict={};hs.forEach((n,i)=>{if(i>0)verdict[n]=td[i];});}}
    const sh=(n,d)=>{const s=(window.__subs||[]).find(x=>x.staffName===n);return s&&s.shifts?s.shifts[d]||null:null;};
    return{panelText:panel?panel.innerText:null,lines,verdict,
      yamada14:sh("山田","2026-10-14"),suzuki:{d1:sh("鈴木","2026-10-01"),d5:sh("鈴木","2026-10-05"),d8:sh("鈴木","2026-10-08"),d12:sh("鈴木","2026-10-12")}};
  });
  m.typed=typed;m.errors=h.errors.slice();
  await h.close();
  const line=n=>(m.lines||[]).find(l=>l.startsWith(n+"："))||"";
  const v={
    cells_found:typed.every(t=>t.found),
    // 「事務11」はグリッドの入力経路で時刻なし・メモだけとして保存される
    yamada_memo_stored:!!m.yamada14&&m.yamada14.adjustedStart===""&&m.yamada14.adjustedStartNote==="事務11",
    // 鈴木の入力が設計どおりの形で保存されている（応援 x・半日の休み希望・半日の有給・k）
    suzuki_stored:!!(m.suzuki.d1&&m.suzuki.d1.adjustedStartNote==="k"&&m.suzuki.d5&&m.suzuki.d5.adminRest&&m.suzuki.d5.adminRest.end
      &&m.suzuki.d8&&m.suzuki.d8.leaveTypes&&m.suzuki.d8.leaveTypes.end==="paid"&&m.suzuki.d12&&m.suzuki.d12.adjustedStartNote==="x"),
    panel_found:m.panelText!==null,
    // 23:00 退勤なので既存の「深夜3日（2・6・9）」（割増の目印・要修正ではない）が後ろに続く
    matsunami_line:line("松南恭介").startsWith("松南恭介：入力の確認4日（2・6・9・13）"),
    yamada_line:line("山田")==="山田：入力の確認1日（14）、従業員番号が未設定",
    suzuki_absent:line("鈴木")==="",
    // 総括は3人とも OK（入力の確認は要修正ではない）
    verdict_ok:!!m.verdict&&m.verdict["松南恭介"]==="OK"&&m.verdict["山田"]==="OK"&&m.verdict["鈴木"]==="OK",
    no_console_errors:m.errors.length===0,
  };
  v.allPass=Object.values(v).every(Boolean);
  console.log(JSON.stringify({m,verdict:v},null,1));
  process.exit(v.allPass?0:1);
})().catch(e=>{console.error(e);process.exit(1);});
