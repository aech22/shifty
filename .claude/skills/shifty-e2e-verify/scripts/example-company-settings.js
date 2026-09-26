// 企業の共通設定（2026-09-27 企業連携の拡張）の実ブラウザ回帰テスト。Firebase へは1バイトも出ない。
//
// A. 設定タブ単体: 企業が決めた項目は入力欄ではなく値＋「企業設定」になり、店舗が別の項目を
//    保存しても企業の値が店舗設定に書かれない（SetTab 自身の剥がし）。
// B. アプリ全体（stub-firebase.js）: 企業連携タブの「企業の共通設定」で固定残業20hを保存すると
//    saveCompanyConfig が1回だけ呼ばれ、店舗の写し（shops/S1/company）経由で設定タブが「企業設定」表示に
//    変わる。その後に設定タブで余裕を変えても、shops/S1/settings に企業の値（fixedOvertimeMin）が書かれない
//    （App の saveSettings の剥がし）。
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-company-settings.js → allPass=true / EXIT=0
// 反証: SHIFTY_ROOT=<企業設定より前の配信物> node ... → EXIT≠0
"use strict";
const path = require("node:path");
const { openHarness, REPO_ROOT } = require(path.join(__dirname, "mount-component.js"));
const { makeStub } = require(path.join(__dirname, "stub-firebase.js"));
const ROOT = process.env.SHIFTY_ROOT || REPO_ROOT;
const THEME = `<style>:root{--c-bg:#F0F2F5;--c-card:#FFFFFF;--c-input:#F3F4F6;--c-input2:#F0F2F5;` +
  `--c-border:#E5E7EB;--c-border2:#D1D5DB;--c-text:#1A1A2E;--c-text2:#374151;--c-text3:#6B7280;` +
  `--c-text4:#9CA3AF;--c-shadow:rgba(0,0,0,.06);--c-accent:#f87036;--c-danger:#DC2626;}</style>`;

// 指定したカード（見出しの文字列で探す）の中で、ラベル span の隣の数値入力に値を入れる
const setNumberByLabel = (cardTitle, label, value) => `(()=>{
  const card=[...document.querySelectorAll("div")].filter(d=>(d.innerText||"").trim().startsWith(${JSON.stringify(cardTitle)})&&[...d.querySelectorAll("span")].some(s=>(s.innerText||"").trim()===${JSON.stringify(label)})).pop();
  if(!card)return "no-card";
  const sp=[...card.querySelectorAll("span")].find(s=>(s.innerText||"").trim()===${JSON.stringify(label)});
  if(!sp)return "no-label";
  const inp=sp.parentElement.querySelector("input[type=number]");
  if(!inp)return "no-input";
  const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set;
  set.call(inp,${JSON.stringify(String(value))});inp.dispatchEvent(new Event("input",{bubbles:true}));
  return "ok";
})()`;
const rowFixedText = (cardTitle, label) => `(()=>{
  const card=[...document.querySelectorAll("div")].filter(d=>(d.innerText||"").trim().startsWith(${JSON.stringify(cardTitle)})&&[...d.querySelectorAll("span")].some(s=>(s.innerText||"").trim()===${JSON.stringify(label)})).pop();
  if(!card)return null;
  const sp=[...card.querySelectorAll("span")].find(s=>(s.innerText||"").trim()===${JSON.stringify(label)});
  if(!sp)return null;
  const f=sp.parentElement.querySelector("[data-company-fixed]");
  return f?f.innerText.replace(/\\s+/g," ").trim():null;
})()`;

async function partA() {
  const h = await openHarness({
    root: ROOT, extraHead: THEME, waitFor: "#root > *",
    jsx: `
      const CS={laborSettings:{fixedOvertimeMin:1200},staffTypeLimits:{parttime:{weekly:30},co_AbCd1234:{name:"特定技能1",laborSystem:"A",monthly:210}}};
      const RAW={shopId:"S1",candidates:[],staffAttributes:{},laborSettings:{fixedOvertimeMin:1800,marginMin:420},staffTypeLimits:{parttime:{weekly:28,daily:8}}};
      window.__saved=null;
      function Harness(){
        const [raw,setRaw]=React.useState(RAW);
        const eff=applyCompanySettings(raw,CS);
        return <SetTab settings={eff} onSave={v=>{window.__saved=v;setRaw(stripCompanySettings(v,CS));}} subs={[]} saveSubs={()=>{}}
          tt={()=>{}} syncStatus="online" plan="premium" shopId="S1" companyLink={{id:"C1",name:"テスト企業",settings:CS}}/>;
      }
      ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);`,
  });
  const R = {};
  R.fixedOvertime = await h.evaluate(rowFixedText("労務判定", "固定残業"));
  R.marginIsInput = await h.evaluate(`(()=>{const sp=[...document.querySelectorAll("span")].find(s=>s.innerText.trim()==="余裕");return !!(sp&&sp.parentElement.querySelector("input[type=number]"));})()`);
  R.limitsFixedCount = await h.evaluate(`[...document.querySelectorAll("[data-company-fixed]")].length`);
  // 企業の属性（co_）の行は入力欄・セレクトを1つも出さない。組み込みの属性は企業が決めていない項目を入力できる
  R.coBlock = await h.evaluate(() => {
    const blk = [...document.querySelectorAll("div")].filter(d => (d.innerText || "").trim().startsWith("特定技能1") && d.querySelector("[data-company-fixed]")).pop();
    const card = blk && blk.closest("div[style*='margin-bottom: 8px']");
    const root = card || blk;
    return root ? { inputs: root.querySelectorAll("input").length, selects: root.querySelectorAll("select").length, fixed: root.querySelectorAll("[data-company-fixed]").length, deleteBtn: [...root.querySelectorAll("button")].some(b => b.innerText.trim() === "削除") } : null;
  });
  R.parttimeInputs = await h.evaluate(() => {
    const blk = [...document.querySelectorAll("div[style*='margin-bottom: 8px']")].find(d => (d.innerText || "").trim().startsWith("パート・アルバイト"));
    return blk ? blk.querySelectorAll("input[type=number]").length : null;
  });
  R.note = await h.evaluate(`document.body.innerText.includes("企業アカウント（テスト企業）が決めているため")`);
  R.setMargin = await h.evaluate(setNumberByLabel("労務判定", "余裕", 5));
  await h.page.waitForTimeout(300);
  R.saved = await h.evaluate(() => window.__saved);
  R.errors = h.errors.slice();
  await h.close();
  return R;
}

async function partB() {
  const UID = "U1", CID = "C1";
  const seed = {
    global: { shops: { S1: { id: "S1", name: "A店" }, S2: { id: "S2", name: "B店" } } },
    shops: {
      S1: { owners: { [UID]: "K1", [`company_${CID}`]: "K1" }, private: { adminKey: "K1" }, staff: { 0: "田中" },
        settings: { shopId: "S1", candidates: [], laborSettings: { marginMin: 420 } } },
      S2: { owners: { [UID]: "K2", [`company_${CID}`]: "K2" }, private: { adminKey: "K2" }, staff: { 0: "鈴木" } },
    },
    accounts: { S1: { plan: "premium" }, [UID]: { shops: { S1: true, S2: true }, company: { companyId: CID, code: "ABCD1234", name: "テスト企業" } } },
    companies: { [CID]: { pub: { name: "テスト企業", ownerUid: UID, code: "ABCD1234", shops: { S1: true, S2: true } } } },
  };
  const h = await openHarness({
    root: ROOT, jsx: "window.__harnessReady=true;", waitFor: "#root > *", viewport: { width: 1400, height: 950 },
    extraHead: THEME + makeStub({ seed, uid: UID, view: "admin", tab: "company", cfHandlers: { saveCompanyConfig: "companyConfig" } }),
    scripts: ["app-utils.js", "app-core.js", "app-staff.js", "app-admin.js", "app-main.js"].map(src => ({ src, babel: !/utils|core/.test(src) })),
  });
  const R = {};
  try {
    await h.page.waitForFunction(() => document.body.innerText.includes("企業の共通設定を保存"), { timeout: 15000 });
    R.cardShown = true;
    R.configRows = await h.evaluate(() => [...document.querySelectorAll("[data-co-attr]")].map(e => e.getAttribute("data-co-attr")));
    R.setFixed = await h.evaluate(setNumberByLabel("企業の共通設定", "固定残業", 20));
    await h.page.waitForTimeout(200);
    R.clickSave = await h.clickByText("企業の共通設定を保存");
    await h.page.waitForTimeout(900);
    R.cf = await h.evaluate(() => window.__cf.map(c => ({ name: c.name, lab: c.payload && c.payload.settings && c.payload.settings.laborSettings })));
    R.mirror = await h.evaluate(() => window.__db("shops/S1/company/settings"));
    R.toast = await h.evaluate(() => document.body.innerText.includes("連携店舗 2 件に反映しました"));
    await h.clickByText("設定");
    await h.page.waitForTimeout(700);
    R.settingsFixed = await h.evaluate(rowFixedText("労務判定", "固定残業"));
    R.setMargin = await h.evaluate(setNumberByLabel("労務判定", "余裕", 6));
    await h.page.waitForTimeout(700);
    R.storedLabor = await h.evaluate(() => window.__db("shops/S1/settings/laborSettings"));
  } catch (e) {
    R.exception = e.message;
  }
  R.errors = h.errors.slice();
  await h.close();
  return R;
}

(async () => {
  const A = await partA();
  const B = await partB();
  const v = {
    A_fixedShown: A.fixedOvertime === "20 企業設定",
    A_marginStillInput: A.marginIsInput === true,
    A_limitFixed: A.limitsFixedCount >= 2,
    A_coAttrAllFixed: !!(A.coBlock && A.coBlock.inputs === 0 && A.coBlock.selects === 0 && A.coBlock.fixed >= 10 && !A.coBlock.deleteBtn),
    A_builtinStillEditable: A.parttimeInputs >= 8,
    B_noOtherRow: !!(B.configRows && !B.configRows.includes("other") && B.configRows.includes("dispatch")),
    A_note: A.note === true,
    A_saveExcludesCompanyKeys: !!(A.saved && A.saved.laborSettings && !("fixedOvertimeMin" in A.saved.laborSettings)
      && A.saved.laborSettings.marginMin === 300 && !("weekly" in ((A.saved.staffTypeLimits || {}).parttime || {}))),
    B_cardShown: B.cardShown === true,
    B_cfCalledOnce: !!(B.cf && B.cf.length === 1 && B.cf[0].name === "saveCompanyConfig" && B.cf[0].lab && B.cf[0].lab.fixedOvertimeMin === 1200),
    B_mirrorWritten: !!(B.mirror && B.mirror.laborSettings && B.mirror.laborSettings.fixedOvertimeMin === 1200),
    B_toast: B.toast === true,
    B_settingsTabFixed: B.settingsFixed === "20 企業設定",
    B_storeDoesNotHoldCompanyValue: !!(B.storedLabor && !("fixedOvertimeMin" in B.storedLabor) && B.storedLabor.marginMin === 360),
    noErrors: A.errors.length === 0 && B.errors.length === 0 && !B.exception,
  };
  v.allPass = Object.values(v).every(Boolean);
  console.log(JSON.stringify({ A, B, verdict: v }, null, 2));
  process.exit(v.allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
