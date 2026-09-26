// 属性の並び順（2026-09-26 ユーザー指示）の実ブラウザ回帰テスト。
// スタッフタブの属性プルダウンと設定タブの属性別勤務時間設定が、
// 社員 → パート・アルバイト → 自由追加分（表示名の50音順）の**同じ並び**で出ることを測る。
// 既存店舗の staffTypeLimits.parttime.name には旧既定の「バイト」が入っているので、
// 組み込みの表示名が STAFF_TYPE_LABELS 側から出ること（＝改称が既存店舗に届くこと）も同時に見る。
// app-main.js を読み込まないので Firebase へは1バイトも出ない（SKILL.md 1.6節）。
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-attr-order.js → allPass=true / EXIT=0
// 反証: SHIFTY_ROOT=<この変更より前の配信物> node ... → EXIT=1（落ちないなら何も検証していない）
"use strict";
const path=require("node:path");
const {openHarness}=require(path.join("/Users/hiroshi/Documents/Claude Code/シフト作成アプリーshifty",".claude/skills/shifty-e2e-verify/scripts/mount-component.js"));
const ROOT=process.env.SHIFTY_ROOT||undefined;
const EXTRA_HEAD=`<style>:root{--c-bg:#F0F2F5;--c-card:#FFFFFF;--c-input:#F3F4F6;--c-input2:#F0F2F5;`+
  `--c-border:#E5E7EB;--c-border2:#D1D5DB;--c-text:#1A1A2E;--c-text2:#374151;--c-text3:#6B7280;`+
  `--c-text4:#9CA3AF;--c-shadow:rgba(0,0,0,.06);--c-accent:#f87036;--c-danger:#DC2626;}</style>`;
// 保存済みの parttime.name は旧既定の「バイト」＝既存店舗の実データの形
const LIMITS=`{custom_c:{name:"夏季"},custom_a:{name:"アルバイトB"},custom_b:{name:"学生"},`+
  `custom_d:{name:"契約社員"},parttime:{name:"バイト"},employee:{name:"社員"}}`;

async function staffTab(){
  const h=await openHarness({root:ROOT,extraHead:EXTRA_HEAD,waitFor:"input[placeholder='スタッフ名を入力']",jsx:`
    function Harness(){
      const [settings,setSettings]=React.useState({shopId:"s1",candidates:[],staffColors:{},staffAliases:{},
        staffAttributes:{田中:"parttime"},staffTypeLimits:${LIMITS}});
      return <StaffTab staffList={["田中"]} onSave={()=>{}} tt={()=>{}} plan="premium" onUpgrade={()=>{}}
        onRenameStaff={()=>{}} settings={settings} onSaveSettings={s=>setSettings(s)} subs={[]}
        periods={[{id:"p1",label:"9月前半",startDate:"2026-09-01",endDate:"2026-12-31"}]}
        savePeriods={()=>{}} ownerReadOnly={false}/>;
    }
    ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);`});
  const r=await h.clickExact("編集",{rowText:"田中"});
  await h.page.waitForTimeout(300);
  const out=await h.evaluate(()=>{
    const sel=[...document.querySelectorAll("select")].filter(x=>[...x.options].some(o=>o.text==="社員")).pop();
    return sel?{options:[...sel.options].map(o=>o.text),selected:sel.options[sel.selectedIndex].text}:null;
  });
  const errors=h.errors.slice(); await h.close();
  return {modalOpened:r,...(out||{}),errors};
}

async function setTab(){
  const h=await openHarness({root:ROOT,extraHead:EXTRA_HEAD,waitFor:"#root > *",jsx:`
    function Harness(){
      const [settings,setSettings]=React.useState({shopId:"s1",candidates:[],staffAttributes:{},
        staffTypeLimits:${LIMITS}});
      return <SetTab settings={settings} onSave={s=>setSettings(s)} subs={[]} saveSubs={()=>{}}
        tt={()=>{}} syncStatus="online" plan="premium" shopId="s1"/>;
    }
    ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);`});
  await h.page.waitForTimeout(400);
  const out=await h.evaluate(()=>{
    const card=[...document.querySelectorAll("div")].find(x=>(x.innerText||"").startsWith("スタッフ属性別 勤務時間制限"));
    if(!card)return null;
    // 各属性ブロックの先頭行＝固定表示の名前 or 名前入力欄
    const blocks=[...card.querySelectorAll("div")].filter(d=>/^(上限)/.test((d.innerText||"").trim()));
    const names=[...card.querySelectorAll("div")]
      .filter(d=>d.children.length===0&&(d.innerText||"").trim()&&getComputedStyle(d).fontWeight==="700")
      .map(d=>d.innerText.trim());
    const inputs=[...card.querySelectorAll("input[placeholder='属性名を入力']")].map(i=>i.value);
    return {blocks:blocks.length,boldTexts:names,customInputs:inputs};
  });
  const errors=h.errors.slice(); await h.close();
  return {...(out||{}),errors};
}

(async()=>{
  const st=await staffTab(), se=await setTab();
  // 設定タブの並びは「固定表示(社員)」と「入力欄(カスタム)」が混ざるので、DOM順で名前を拾う
  const pass={
    staffDropdownOrder: JSON.stringify(st.options)===JSON.stringify(["社員","パート・アルバイト","アルバイトB","夏季","学生","契約社員"]),
    staffDropdownNoOldLabel: !(st.options||[]).includes("バイト"),
    setTabBlocks: se.blocks===6,
    setTabCustomInputOrder: JSON.stringify(se.customInputs)===JSON.stringify(["アルバイトB","夏季","学生","契約社員"]),
    setTabBuiltinFirst: JSON.stringify((se.boldTexts||[]).slice(1,3))===JSON.stringify(["社員","パート・アルバイト"]),
    noErrors: (st.errors||[]).length===0&&(se.errors||[]).length===0,
  };
  const allPass=Object.values(pass).every(Boolean);
  console.log(JSON.stringify({staffTab:st,setTab:se,pass,allPass},null,1));
  process.exit(allPass?0:1);
})().catch(e=>{console.error(e);process.exit(2);});
