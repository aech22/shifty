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
  // 田中は平日22日を 09:00-19:00（休憩12-13で実働9h）＝月実働198:00。総枠177:08・目安200hに対し
  // 目安未満 あと2h になる。休憩を1時間入れてあるので休憩不足は出ず、土日が休みなので×休なしも出ない
  // （＝第2弾の判定だけを測れる。第3弾の判定は example-labor-phase3.js で測る）。
  const wd=[1,2,5,6,7,8,9,12,13,14,15,16,19,20,21,22,23,26,27,28,29,30];
  const sh=wd.map(d=>`"2026-10-${String(d).padStart(2,"0")}":{status:"work",start:"09:00",end:"19:00"}`).join(",");
  const h=await openHarness({root:ROOT,extraHead:EXTRA_HEAD,waitFor:"select",jsx:`
const P={id:"p1",urlToken:"t1",shopId:"S1",label:"10月",startDate:"2026-10-01",endDate:"2026-10-31",deadlineDate:"",createdAt:"2026-09-01T00:00:00.000Z"};
const SUBS=[
 {id:"s1",periodId:"p1",staffName:"田中",shopId:"S1",comment:"",submittedAt:"2026-09-02T00:00:00.000Z",shifts:{${sh}}},
 {id:"s2",periodId:"p1",staffName:"鈴木",shopId:"S1",comment:"",submittedAt:"2026-09-02T00:00:00.000Z",
  shifts:{"2026-10-01":{status:"work",start:"09:00",end:"19:00"}}},
];
const SETTINGS={shopId:"S1",candidates:[{start:"09:00",end:"23:00"}],weekdayCandidates:{},dateCandidates:{},
  breakTimes:{weekday:[{start:"12:00",end:"13:00"}],sat:[{start:"12:00",end:"13:00"}],sun:[{start:"12:00",end:"13:00"}],holSat:[{start:"12:00",end:"13:00"}],holSun:[{start:"12:00",end:"13:00"}]},
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
  await h.page.waitForTimeout(800);
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

// ---- 3. 2週間運用の月判定タイミング（2026-09-26 ユーザー指示で条件を1つに減らした）------
// 月単位の判定の条件は**その月の全日がデータで埋まっていること**だけになった。この筋書きは
// 10月前半・後半の両方の期間が存在する＝月が埋まっているので、**前半を開いていても後半と
// まったく同じ月の判定が出る**（以前はここで「要確認」に倒していた）。
async function halfMonth(){
  const wd=[1,2,5,6,7,8,9,12,13,14,15,16,19,20,21,22,23,26,27,28,29,30];
  const sh=wd.map(d=>`"2026-10-${String(d).padStart(2,"0")}":{status:"work",start:"09:00",end:"19:00"}`).join(",");
  const h=await openHarness({root:ROOT,extraHead:EXTRA_HEAD,waitFor:"select",jsx:`
const PB={id:"pb",urlToken:"tb",shopId:"S1",label:"10月後半",startDate:"2026-10-16",endDate:"2026-10-31",deadlineDate:"",createdAt:"2026-09-01T00:00:00.000Z"};
const PA={id:"pa",urlToken:"ta",shopId:"S1",label:"10月前半",startDate:"2026-10-01",endDate:"2026-10-15",deadlineDate:"",createdAt:"2026-09-01T00:00:00.000Z"};
const SUBS=[
 {id:"s1",periodId:"pa",staffName:"田中",shopId:"S1",comment:"",submittedAt:"2026-09-02T00:00:00.000Z",shifts:{${sh}}},
 {id:"s2",periodId:"pb",staffName:"田中",shopId:"S1",comment:"",submittedAt:"2026-09-02T00:00:00.000Z",shifts:{}}];
const SETTINGS={shopId:"S1",candidates:[{start:"09:00",end:"23:00"}],weekdayCandidates:{},dateCandidates:{},
  breakTimes:{weekday:[{start:"12:00",end:"13:00"}],sat:[{start:"12:00",end:"13:00"}],sun:[{start:"12:00",end:"13:00"}],holSat:[{start:"12:00",end:"13:00"}],holSun:[{start:"12:00",end:"13:00"}]},
  staffAttributes:{田中:"employee"},staffTypeLimits:{employee:{name:"社員"}},periodUnit:"2week",
  staffColors:{},staffAliases:{},positions:{kitchen:[],hall:[]},requiredPositions:{},staffPositions:{}};
function Harness(){
  const [subs,setSubs]=React.useState(SUBS);
  return <ShiftEditTab subs={subs} periods={[PB,PA]} staffList={["田中"]}
    onSave={v=>setSubs(p=>typeof v==="function"?v(p):v)} tt={()=>{}}
    settings={SETTINGS} plan="premium" shopId="S1" shopName="テスト店" onUpgrade={()=>{}}
    savePeriods={()=>{}} ownerReadOnly={false} pastSubsLoaded={true}/>;
}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);`});
  await h.page.waitForTimeout(800);
  const read=()=>h.evaluate(()=>{
    const w=[...document.querySelectorAll("div")].find(d=>(d.innerText||"").startsWith("労務判定（"));
    if(!w)return null;const r={};[...w.querySelectorAll("tbody tr")].forEach(tr=>{
      const td=[...tr.querySelectorAll("td")];r[td[0].innerText.trim()]={v:td[1]?td[1].innerText.trim():"",t:td[1]?td[1].getAttribute("title")||"":""};});
    return r;});
  const latter=await read();           // 既定＝配列の先頭＝後半
  await h.evaluate(()=>{const s2=document.querySelector("select");
    Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,"value").set.call(s2,"pa");
    s2.dispatchEvent(new Event("change",{bubbles:true}));});
  await h.page.waitForTimeout(900);
  const former=await read();           // 前半に切り替える
  const errors=h.errors.slice();
  await h.close();
  return{latter,former,errors};
}

// ---- 4. 36協定の年単位4項目（判断4・案b）------------------------------------
// 4〜9月の各月に「その月の最後の期間」を置き、凍結値(monthOtH)だけで年判定が出ることを見る
// （＝過去参照を押さなくても効く）。10月は判定を出す当月で、月まるごと1期間。
async function yearAgreement(){
  // 45h超が**7回**になるよう7ヶ月ぶん置く（6回ちょうどでは上限内で出ない＝境界を跨がせる）
  const months=["2026-04","2026-05","2026-06","2026-07","2026-08","2026-09","2026-11"];
  const ps=months.map((m,i)=>`{id:"y${"$"}{${i}}",urlToken:"u${"$"}{${i}}",shopId:"S1",label:"${"$"}{${JSON.stringify(months)}[${i}]}",startDate:"${"$"}{${JSON.stringify(months)}[${i}]}-01",endDate:"${"$"}{${JSON.stringify(months)}[${i}]}-28",deadlineDate:"",createdAt:"2026-01-01T00:00:00.000Z",laborTotals:{田中:{monthOtH:90}}}`).join(",");
  void ps;
  const periodsJs=months.map((m,i)=>`{id:"y${i}",urlToken:"u${i}",shopId:"S1",label:"${m}",startDate:"${m}-01",endDate:"${m}-28",deadlineDate:"",createdAt:"2026-01-01T00:00:00.000Z",laborTotals:{田中:{monthOtH:90}}}`).join(",\n ");
  const wd=[1,2,5,6,7,8,9,12,13,14,15,16,19,20,21,22,23,26,27,28,29,30];
  const sh=wd.map(d=>`"2026-10-${String(d).padStart(2,"0")}":{status:"work",start:"09:00",end:"19:00"}`).join(",");
  const h=await openHarness({root:ROOT,extraHead:EXTRA_HEAD,waitFor:"select",jsx:`
const PS=[{id:"p1",urlToken:"t1",shopId:"S1",label:"10月",startDate:"2026-10-01",endDate:"2026-10-31",deadlineDate:"",createdAt:"2026-09-01T00:00:00.000Z"},
 ${periodsJs}];
const SUBS=[{id:"s1",periodId:"p1",staffName:"田中",shopId:"S1",comment:"",submittedAt:"2026-09-02T00:00:00.000Z",shifts:{${sh}}}];
const SETTINGS={shopId:"S1",candidates:[{start:"09:00",end:"23:00"}],weekdayCandidates:{},dateCandidates:{},
  breakTimes:{weekday:[{start:"12:00",end:"13:00"}],sat:[{start:"12:00",end:"13:00"}],sun:[{start:"12:00",end:"13:00"}],holSat:[{start:"12:00",end:"13:00"}],holSun:[{start:"12:00",end:"13:00"}]},
  staffAttributes:{田中:"employee"},staffTypeLimits:{employee:{name:"社員"}},
  staffColors:{},staffAliases:{},positions:{kitchen:[],hall:[]},requiredPositions:{},staffPositions:{}};
function Harness(){
  return <ShiftEditTab subs={SUBS} periods={PS} staffList={["田中"]} onSave={()=>{}} tt={()=>{}}
    settings={SETTINGS} plan="premium" shopId="S1" shopName="テスト店" onUpgrade={()=>{}}
    savePeriods={()=>{}} ownerReadOnly={false} pastSubsLoaded={true}/>;
}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);`});
  await h.page.waitForTimeout(900);
  const panel=await h.evaluate(()=>{const d=[...document.querySelectorAll("div")].find(x=>(x.innerText||"").startsWith("⚠ 労務の確認が必要です"));return d?d.innerText.replace(/\s+/g," "):null;});
  const errors=h.errors.slice();
  await h.close();
  return{panel,errors};
}

(async()=>{
  const st=await setTab(), sh=await shiftTab(), hm=await halfMonth(), ya=await yearAgreement();
  const pass={
    set_has_36:st.has36&&st.daily&&st.monthly,
    // 判断4・案b（2026-09-26）で年単位4項目も判定するようになり、未判定は0になった
    set_checklist:st.judged>=7&&st.unjudged===0,
    set_holiday_note:st.holiday,
    set_no_next_phase_note:st.noNextPhaseNote,
    set_fontsize16:st.nums.every(n=>parseFloat(n.fs)>=16),
    set_daily0_guide_equals_base:st.row31After0==="31日/177:08/177:08/207:08",
    shift_table:sh.found&&sh.title==="労務判定（2026年10月）",
    // 田中: 月実働198:00・目安200hに対し不足2h・総括は目安未満
    shift_month:sh.found&&sh.rows["月実働"]&&sh.rows["月実働"][0]==="198:00",
    shift_guide:sh.found&&sh.rows["目安"]&&sh.rows["目安"][0]==="目安未満 あと2h",
    shift_verdict:sh.found&&sh.rows["総括"]&&sh.rows["総括"][0]==="目安未満",
    // 鈴木(B制): 実働9h の日が1日＝8h超 → 残業あり。目安は空欄（A制のみ）
    shift_b_guide_blank:sh.found&&sh.rows["目安"]&&sh.rows["目安"][1]==="",
    shift_b_verdict:sh.found&&sh.rows["総括"]&&sh.rows["総括"][1]==="残業あり",
    // 2週間運用: 月が埋まっていれば**前半を開いていても後半と同じ月の判定が出る**
    // （2026-09-26 に「前半では要確認」から変更。材料が揃っている値を隠さない）
    half_latter_judged:!!hm.latter&&hm.latter["目安"].v==="目安未満 あと2h",
    half_former_same_as_latter:!!hm.former&&hm.former["目安"].v==="目安未満 あと2h",
    half_former_verdict:!!hm.former&&hm.former["総括"].v==="目安未満",
    // 「＋」は付かない（月が埋まっているので途中の値ではない）
    half_former_not_partial:!!hm.former&&!/＋/.test(hm.former["目安"].v)
      &&!/＋/.test(hm.former["総括"].v),
    // 残業予定は**半月ごと**に出る（前半を開いていても月の材料が揃っていれば出す）
    half_ot_former:!!hm.former&&/^\d+(\.\d+)?h$/.test(hm.former["残業予定"].v),
    half_ot_latter:!!hm.latter&&/^\d+(\.\d+)?h$/.test(hm.latter["残業予定"].v),
    // 月実働198:00 − 総枠177:08 = 20.87h。前半・後半の和がこれに一致する（按分の性質）
    half_ot_sum:!!hm.former&&!!hm.latter&&
      Math.abs(parseFloat(hm.former["残業予定"].v)+parseFloat(hm.latter["残業予定"].v)-20.87)<0.005,
    half_ot_title:!!hm.latter&&/月の合計 20.87h/.test(hm.latter["残業予定"].t||""),
    // 36協定の年単位（4〜9月と11月に90h×7＝630h の凍結値。年360h超・月45h超が年7回・平均80h超）
    year_360:!!ya.panel&&/年360h超/.test(ya.panel),
    year_over45:!!ya.panel&&/月45h超が年\d+回/.test(ya.panel),
    year_avg80:!!ya.panel&&/複数月平均80h超/.test(ya.panel),
    no_console_errors:st.errors.length===0&&sh.errors.length===0&&hm.errors.length===0&&ya.errors.length===0,
  };
  const allPass=Object.values(pass).every(Boolean);
  console.log(JSON.stringify({setTab:st,shiftTab:sh,halfMonth:hm,yearAgreement:ya,pass,allPass},null,1));
  process.exit(allPass?0:1);
})().catch(e=>{console.error(e);process.exit(1);});
