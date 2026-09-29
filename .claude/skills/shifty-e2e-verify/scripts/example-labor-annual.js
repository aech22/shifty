// 年間所定労働時間と月の所定上限（2026-09-30・労務給与_複数法人_実装計画.md §3.3・§6 P2）の実ブラウザ回帰テスト。
// Firebase へは1バイトも出ない（SetTab・CoLaborFields だけをマウントし、保存をスパイに差し替える）。
//
// A. 店舗の設定タブ（企業なし）: 未設定では表に「所定上限」列が無く目安 31日=200:00（S-1 のまま）。
//    年間所定に 2080 を入れて確定すると laborSettings.annualScheduledMin=124800 で保存され、表に所定上限
//    31/30/28日 = 176:39／170:57／159:33、目安 199:00／193:00／182:00 が出る（上限 207:08 は変わらない）。
//    分母は空欄のとき「自動 173.3」、173.3 を入れると 10398 分。週の起算を日曜にすると weekStartDow=0。
//    年間所定を空欄に戻すと 0 で保存され、所定上限列が消え目安が 200:00 に戻る。
//    入力途中の「2080.」は確定前に消えない（小数1桁の入力を打てる）。
// B. 企業が年間所定と週の起算を決めている店舗: その2項目は「企業設定」の固定表示になり、分母は入力できる。
//    表に所定上限列が出る。余裕を変えて保存しても、企業の値（annualScheduledMin・weekStartDow）は店舗に書かれない。
// C. 企業の共通設定・法人の設定で共有する入力欄（CoLaborFields）: 2080 → 124800、分母を空欄→キーごと消える
//    （＝上の層の値を使う）、週の起算を「店舗で設定」→キーが消える、月曜→1。
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-labor-annual.js → allPass=true / EXIT=0
// 反証: SHIFTY_ROOT=<P2 より前の配信物（c51c3de）> node ... → EXIT≠0（年間所定の入力欄が無い）
"use strict";
const path = require("node:path");
const { openHarness, REPO_ROOT } = require(path.join(__dirname, "mount-component.js"));
const ROOT = process.env.SHIFTY_ROOT || REPO_ROOT;
const THEME = `<style>:root{--c-bg:#F0F2F5;--c-card:#FFFFFF;--c-input:#F3F4F6;--c-input2:#F0F2F5;` +
  `--c-border:#E5E7EB;--c-border2:#D1D5DB;--c-text:#1A1A2E;--c-text2:#374151;--c-text3:#6B7280;` +
  `--c-text4:#9CA3AF;--c-shadow:rgba(0,0,0,.06);--c-accent:#f87036;--c-danger:#DC2626;}</style>`;

// ラベル span の隣の入力（text/number/select）を返す式
const FIELD = label => `(()=>{const sp=[...document.querySelectorAll("span")].find(s=>(s.innerText||"").trim()===${JSON.stringify(label)});
  return sp?sp.parentElement.querySelector("input,select"):null;})()`;
// テキスト入力に値を入れて（blur しない）
const typeInto = (label, text) => `(()=>{const el=${FIELD(label)};if(!el)return "no-field";el.focus();
  const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set;
  set.call(el,${JSON.stringify(text)});el.dispatchEvent(new Event("input",{bubbles:true}));return "ok";})()`;
const blurField = label => `(()=>{const el=${FIELD(label)};if(!el)return "no-field";el.blur();return "ok";})()`;
const selectInto = (label, value) => `(()=>{const el=${FIELD(label)};if(!el||el.tagName!=="SELECT")return "no-select";
  const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value").set;
  set.call(el,${JSON.stringify(String(value))});el.dispatchEvent(new Event("change",{bubbles:true}));return "ok";})()`;
const fieldInfo = label => `(()=>{const el=${FIELD(label)};return el?{tag:el.tagName,value:el.value,placeholder:el.placeholder||"",fontSize:getComputedStyle(el).fontSize}:null;})()`;
const fixedText = label => `(()=>{const sp=[...document.querySelectorAll("span")].find(s=>(s.innerText||"").trim()===${JSON.stringify(label)});
  const f=sp&&sp.parentElement.querySelector("[data-company-fixed]");return f?f.innerText.replace(/\\s+/g," ").trim():null;})()`;
// 労務判定カードの表（暦日数の列で探す）を {見出し: [行の値...]} にする
const TABLE = `(()=>{const t=[...document.querySelectorAll("table")].find(t=>[...t.querySelectorAll("th")].some(th=>th.innerText.trim()==="暦日数"));
  if(!t)return null;const hs=[...t.querySelectorAll("th")].map(th=>th.innerText.trim());
  const rows=[...t.querySelectorAll("tbody tr")].map(tr=>[...tr.querySelectorAll("td")].map(td=>td.innerText.trim()));
  const o={};hs.forEach((h,i)=>{o[h]=rows.map(r=>r[i]);});return o;})()`;

const setTabJsx = (raw, cs) => `
  const CS=${JSON.stringify(cs)};
  const RAW=${JSON.stringify(raw)};
  window.__saves=[];
  function Harness(){
    const [raw,setRaw]=React.useState(RAW);
    const eff=CS?applyCompanySettings(raw,CS):raw;
    return <SetTab settings={eff} onSave={v=>{window.__saves.push(v);setRaw(CS?stripCompanySettings(v,CS):v);}} subs={[]} saveSubs={()=>{}}
      tt={()=>{}} syncStatus="online" plan="premium" shopId="S1" companyLink={CS?{id:"C1",name:"テスト企業",settings:CS}:null}/>;
  }
  ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);`;
const lastLabor = `(()=>{const s=window.__saves[window.__saves.length-1];return s?s.laborSettings:null;})()`;

async function partA() {
  const h = await openHarness({ root: ROOT, extraHead: THEME, waitFor: "#root > *",
    jsx: setTabJsx({ shopId: "S1", candidates: [], staffAttributes: {} }, null) });
  const R = {};
  const w = () => h.page.waitForTimeout(250);
  R.before = await h.evaluate(TABLE);
  R.annualField = await h.evaluate(fieldInfo("年間所定労働時間"));
  R.denomField = await h.evaluate(fieldInfo("1時間当たり賃金の分母"));
  R.weekField = await h.evaluate(fieldInfo("週の起算"));
  R.typePartial = await h.evaluate(typeInto("年間所定労働時間", "2080."));
  await w();
  R.partialKept = (await h.evaluate(fieldInfo("年間所定労働時間")) || {}).value;
  R.savesBeforeBlur = await h.evaluate(() => window.__saves.length);
  await h.evaluate(typeInto("年間所定労働時間", "2080"));
  await h.evaluate(blurField("年間所定労働時間"));
  await w();
  R.labor1 = await h.evaluate(lastLabor);
  R.after = await h.evaluate(TABLE);
  R.annualShown = (await h.evaluate(fieldInfo("年間所定労働時間")) || {}).value;
  R.denomPlaceholder = (await h.evaluate(fieldInfo("1時間当たり賃金の分母")) || {}).placeholder;
  await h.evaluate(typeInto("1時間当たり賃金の分母", "173.3"));
  await h.evaluate(blurField("1時間当たり賃金の分母"));
  await w();
  R.labor2 = await h.evaluate(lastLabor);
  R.denomShown = (await h.evaluate(fieldInfo("1時間当たり賃金の分母")) || {}).value;
  R.selWeek = await h.evaluate(selectInto("週の起算", 0));
  await w();
  R.labor3 = await h.evaluate(lastLabor);
  await h.evaluate(typeInto("年間所定労働時間", ""));
  await h.evaluate(blurField("年間所定労働時間"));
  await w();
  R.labor4 = await h.evaluate(lastLabor);
  R.cleared = await h.evaluate(TABLE);
  R.errors = h.errors.slice();
  await h.close();
  return R;
}

async function partB() {
  const CS = { laborSettings: { annualScheduledMin: 124800, weekStartDow: 0 } };
  const h = await openHarness({ root: ROOT, extraHead: THEME, waitFor: "#root > *",
    jsx: setTabJsx({ shopId: "S1", candidates: [], staffAttributes: {}, laborSettings: { marginMin: 420 } }, CS) });
  const R = {};
  R.annualFixed = await h.evaluate(fixedText("年間所定労働時間"));
  R.weekFixed = await h.evaluate(fixedText("週の起算"));
  R.denomField = await h.evaluate(fieldInfo("1時間当たり賃金の分母"));
  R.table = await h.evaluate(TABLE);
  // 余裕（number 入力）を変えて保存させる
  R.setMargin = await h.evaluate(`(()=>{const sp=[...document.querySelectorAll("span")].find(s=>s.innerText.trim()==="余裕");
    const el=sp&&sp.parentElement.querySelector("input[type=number]");if(!el)return "no-input";
    const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set;set.call(el,"5");
    el.dispatchEvent(new Event("input",{bubbles:true}));return "ok";})()`);
  await h.page.waitForTimeout(250);
  R.saved = await h.evaluate(lastLabor);
  R.errors = h.errors.slice();
  await h.close();
  return R;
}

async function partC() {
  const h = await openHarness({ root: ROOT, extraHead: THEME, waitFor: "#root > *",
    jsx: `
      window.__labor=null;
      function Harness(){
        const [labor,setL]=React.useState({rateDenominatorMin:10500,weekStartDow:3});
        React.useEffect(()=>{window.__labor=labor;},[labor]);
        const setLabor=(k,v)=>setL(p=>{const l={...p};if(v===null||v===undefined)delete l[k];else l[k]=v;return l;});
        return <CoLaborFields labor={labor} setLabor={setLabor} placeholder="店舗" blankLabel="店舗で設定"/>;
      }
      ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);` });
  const R = {};
  const w = () => h.page.waitForTimeout(200);
  R.initialDenom = (await h.evaluate(fieldInfo("1時間当たり賃金の分母")) || {}).value;
  R.initialAnnualPh = (await h.evaluate(fieldInfo("年間所定労働時間")) || {}).placeholder;
  await h.evaluate(typeInto("年間所定労働時間", "2080"));
  await h.evaluate(blurField("年間所定労働時間"));
  await w();
  R.l1 = await h.evaluate(() => window.__labor);
  await h.evaluate(typeInto("1時間当たり賃金の分母", ""));
  await h.evaluate(blurField("1時間当たり賃金の分母"));
  await w();
  R.l2 = await h.evaluate(() => window.__labor);
  await h.evaluate(selectInto("週の起算", ""));
  await w();
  R.l3 = await h.evaluate(() => window.__labor);
  await h.evaluate(selectInto("週の起算", 1));
  await w();
  R.l4 = await h.evaluate(() => window.__labor);
  R.errors = h.errors.slice();
  await h.close();
  return R;
}

(async () => {
  const A = await partA();
  const B = await partB();
  const C = await partC();
  const col = (t, k) => (t && t[k]) || [];
  const v = {
    A_noSchedColBefore: !!(A.before && !("所定上限" in A.before) && col(A.before, "目安")[0] === "200:00"),
    A_fieldsPresent: !!(A.annualField && A.annualField.tag === "INPUT" && A.denomField && A.weekField && A.weekField.tag === "SELECT"),
    A_fontSize16: !!(A.annualField && A.annualField.fontSize === "16px" && A.denomField && A.denomField.fontSize === "16px" && A.weekField.fontSize === "16px"),
    A_partialDecimalKept: A.partialKept === "2080." && A.savesBeforeBlur === 0,
    A_annualSaved: !!(A.labor1 && A.labor1.annualScheduledMin === 124800),
    A_schedCol: JSON.stringify(col(A.after, "所定上限")) === JSON.stringify(["176:39", "170:57", "164:48", "159:33"]),
    A_guideFromSched: col(A.after, "目安")[0] === "199:00" && col(A.after, "目安")[1] === "193:00" && col(A.after, "目安")[3] === "182:00",
    A_capUnchanged: col(A.after, "上限")[0] === "207:08" && col(A.after, "総枠（所定）")[0] === "177:08",
    A_annualShown: A.annualShown === "2080",
    A_denomAutoPlaceholder: A.denomPlaceholder === "自動 173.3",
    A_denomSaved: !!(A.labor2 && A.labor2.rateDenominatorMin === 10398 && A.denomShown === "173.3"),
    A_weekSaved: !!(A.selWeek === "ok" && A.labor3 && A.labor3.weekStartDow === 0),
    A_clearedToZero: !!(A.labor4 && A.labor4.annualScheduledMin === 0),
    A_clearedTable: !!(A.cleared && !("所定上限" in A.cleared) && col(A.cleared, "目安")[0] === "200:00"),
    B_annualFixed: B.annualFixed === "2080h 企業設定",
    B_weekFixed: B.weekFixed === "日曜 企業設定",
    B_denomEditable: !!(B.denomField && B.denomField.tag === "INPUT" && B.denomField.placeholder === "自動 173.3"),
    B_schedColShown: col(B.table, "所定上限")[0] === "176:39" && col(B.table, "目安")[0] === "199:00",
    B_companyKeysNotStored: !!(B.setMargin === "ok" && B.saved && !("annualScheduledMin" in B.saved) && !("weekStartDow" in B.saved) && B.saved.marginMin === 300),
    C_initialDenom: C.initialDenom === "175" && C.initialAnnualPh === "店舗",
    C_annual: !!(C.l1 && C.l1.annualScheduledMin === 124800),
    C_denomBlankDeletes: !!(C.l2 && !("rateDenominatorMin" in C.l2)),
    C_weekBlankDeletes: !!(C.l3 && !("weekStartDow" in C.l3)),
    C_weekMonday: !!(C.l4 && C.l4.weekStartDow === 1),
    noErrors: A.errors.length === 0 && B.errors.length === 0 && C.errors.length === 0,
  };
  v.allPass = Object.values(v).every(Boolean);
  console.log(JSON.stringify({ A, B, C, verdict: v }, null, 2));
  process.exit(v.allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
