// P3.5b（残業予定の日割り: B制の日ごとのしきい値超・属性の按分窓）の実ブラウザ回帰テスト。
// app-main.js を読み込まないので Firebase へは1バイトも出ない（SKILL.md 1.6節）。
//   1. 設定タブ: B制トグル（既定オフ）としきい値、属性の「残業予定の配り方」が settings に入る
//   2. シフト作成タブ: 半月15h 固定枠の属性（A制）と B制トグルの残業予定が表に出る／トグルオフの店舗は
//      割増の計算（P5・2026-09-30）の ①日8h超＋②週40h超 が出る（以前は空欄だった）
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-labor-ot-window.js → allPass=true / EXIT=0
// 反証: SHIFTY_ROOT=<P3.5b より前の配信物> node ... → EXIT≠0
"use strict";
const path = require("node:path");
const { openHarness } = require(path.join(__dirname, "mount-component.js"));
const ROOT = process.env.SHIFTY_ROOT || undefined;
const EXTRA_HEAD = `<style>:root{--c-bg:#F0F2F5;--c-card:#FFFFFF;--c-input:#F3F4F6;--c-input2:#F0F2F5;` +
  `--c-border:#E5E7EB;--c-border2:#D1D5DB;--c-text:#1A1A2E;--c-text2:#374151;--c-text3:#6B7280;` +
  `--c-text4:#9CA3AF;--c-shadow:rgba(0,0,0,.06);--c-accent:#f87036;--c-danger:#DC2626;}</style>`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function setTab() {
  const h = await openHarness({ root: ROOT, extraHead: EXTRA_HEAD, waitFor: "#root > *", jsx: `
    function Harness(){
      const [settings,setSettings]=React.useState({shopId:"s1",candidates:[],staffAttributes:{},
        staffTypeLimits:{employee:{name:"社員"},parttime:{name:"バイト"}}});
      window.__settings=settings;
      return <SetTab settings={settings} onSave={s=>setSettings(s)} onSaveOwn={s=>setSettings(s)} subs={[]} saveSubs={()=>{}}
        tt={()=>{}} syncStatus="online" plan="premium" shopId="s1"/>;
    }
    ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);` });
  const m = {};
  m.toggleOffByDefault = await h.evaluate(() => { const c = document.querySelector("[data-daily-over-b] input[type=checkbox]"); return c ? !c.checked : null; });
  m.thresholdHidden = await h.evaluate(() => !/しきい値/.test(document.querySelector("[data-daily-over-b]").innerText.replace("しきい値を超えた", "")));
  await h.evaluate(() => document.querySelector("[data-daily-over-b] input[type=checkbox]").click()); await sleep(300);
  m.labor = await h.evaluate(() => window.__settings.laborSettings);
  m.thresholdShown = await h.evaluate(() => document.querySelectorAll("[data-daily-over-b] input[type=number]").length === 2);
  // バイト（2つ目の属性行）の配り方を「半月」にして固定枠 15h
  const setSel = (i, v) => h.evaluate(([i, v]) => { const s = document.querySelectorAll("[data-ot-prorate] select")[i];
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(s, v); s.dispatchEvent(new Event("change", { bubbles: true })); }, [i, v]);
  m.proRows = await h.evaluate(() => document.querySelectorAll("[data-ot-prorate]").length);
  await setSel(1, "halfMonth"); await sleep(300);
  await h.evaluate(() => { const box = document.querySelectorAll("[data-ot-prorate]")[1]; const i = box.querySelector("input"); i.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, "15"); i.dispatchEvent(new Event("input", { bubbles: true })); i.blur(); });
  await sleep(300);
  m.parttime = await h.evaluate(() => window.__settings.staffTypeLimits.parttime);
  await setSel(1, ""); await sleep(300);
  m.parttimeCleared = await h.evaluate(() => window.__settings.staffTypeLimits.parttime);
  m.fontsizes = await h.evaluate(() => [...document.querySelectorAll("[data-ot-prorate] select,[data-ot-prorate] input,[data-daily-over-b] input[type=number]")].map(e => parseFloat(getComputedStyle(e).fontSize)));
  m.errors = h.errors.slice();
  await h.close();
  return m;
}

async function shiftTab(showB) {
  // 10月まるごと1期間。田中＝バイト（B制）: 1日 10h・2日 8h・3日 9h。
  // 佐藤＝特定技能（A制・半月 15h 固定枠）: 1〜10日 8h、20・21日 6h → 前半15h＋後半12h＝27h。
  const tanaka = `"2026-10-01":{status:"work",start:"09:00",end:"19:00"},"2026-10-02":{status:"work",start:"09:00",end:"17:00"},"2026-10-03":{status:"work",start:"09:00",end:"18:00"}`;
  const sato = [1,2,3,4,5,6,7,8,9,10].map(d => `"2026-10-${String(d).padStart(2,"0")}":{status:"work",start:"09:00",end:"17:00"}`)
    .concat([20,21].map(d => `"2026-10-${d}":{status:"work",start:"09:00",end:"15:00"}`)).join(",");
  const h = await openHarness({ root: ROOT, extraHead: EXTRA_HEAD, waitFor: "select", jsx: `
const P={id:"p1",urlToken:"t1",shopId:"S1",label:"10月",startDate:"2026-10-01",endDate:"2026-10-31",deadlineDate:"",createdAt:"2026-09-01T00:00:00.000Z"};
const SUBS=[{id:"s1",periodId:"p1",staffName:"田中",shopId:"S1",comment:"",submittedAt:"2026-09-02T00:00:00.000Z",shifts:{${tanaka}}},
  {id:"s2",periodId:"p1",staffName:"佐藤",shopId:"S1",comment:"",submittedAt:"2026-09-02T00:00:00.000Z",shifts:{${sato}}}];
const SETTINGS={shopId:"S1",candidates:[{start:"09:00",end:"23:00"}],weekdayCandidates:{},dateCandidates:{},
  breakTimes:{weekday:[],sat:[],sun:[],holSat:[],holSun:[]},
  laborSettings:${showB ? "{showDailyOverB:1}" : "{}"},
  staffAttributes:{田中:"parttime",佐藤:"co_AbCd1234"},
  staffTypeLimits:{parttime:{name:"バイト"},co_AbCd1234:{name:"特定技能",laborSystem:"A",otProrate:{window:"halfMonth",fixedMin:900}}},
  staffColors:{},staffAliases:{},positions:{kitchen:[],hall:[]},requiredPositions:{},staffPositions:{}};
function Harness(){
  const [subs,setSubs]=React.useState(SUBS);
  return <ShiftEditTab subs={subs} periods={[P]} staffList={["田中","佐藤"]}
    onSave={v=>setSubs(p=>typeof v==="function"?v(p):v)} tt={()=>{}}
    settings={SETTINGS} plan="premium" shopId="S1" shopName="テスト店" onUpgrade={()=>{}}
    savePeriods={()=>{}} ownerReadOnly={false} pastSubsLoaded={true}/>;
}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);` });
  await sleep(800);
  const m = await h.evaluate(() => {
    const w = [...document.querySelectorAll("div")].find(d => (d.innerText || "").startsWith("労務判定（2026年10月）"));
    if (!w) return { table: null };
    const head = [...w.querySelectorAll("thead th")].map(x => x.innerText.trim());
    const r = {}; [...w.querySelectorAll("tbody tr")].forEach(tr => { const td = [...tr.querySelectorAll("td")];
      r[td[0].innerText.trim()] = td.slice(1).map(x => ({ t: x.innerText.trim(), title: x.getAttribute("title") || "" })); });
    return { head, ot: r["残業予定"] || null };
  });
  m.errors = h.errors.slice();
  await h.close();
  return m;
}

(async () => {
  const a = await setTab();
  const on = await shiftTab(true);
  const off = await shiftTab(false);
  const col = (m, name) => { const i = (m.head || []).findIndex(x => x.replace(/\s/g, "").includes(name)); return i > 0 && m.ot ? m.ot[i - 1] : null; };
  const onT = col(on, "田中"), onS = col(on, "佐藤"), offT = col(off, "田中"), offS = col(off, "佐藤");
  const v = {
    toggleOffByDefault: a.toggleOffByDefault === true && a.thresholdHidden,
    toggleSaved: !!(a.labor && a.labor.showDailyOverB === 1) && a.thresholdShown,
    proRowsPerAttr: a.proRows >= 2,
    otProrateSaved: !!(a.parttime && a.parttime.otProrate && a.parttime.otProrate.window === "halfMonth" && a.parttime.otProrate.fixedMin === 900),
    otProrateCleared: !!a.parttimeCleared && (a.parttimeCleared.otProrate == null),
    font16: a.fontsizes.length > 0 && a.fontsizes.every(f => f >= 16),
    // B制 10h→2h、8h→0、9h→1h → 3h（日ごとの内訳は title）
    bShown: !!onT && onT.t === "3h" && /1日 2:00・3日 1:00/.test(onT.title),
    // トグルオフでも B制の残業予定は割増の計算（P5）で出る。10/1〜3 の①= 2h+0+1h = 3h、週(10/1〜4・月で切る) Σ(実働−①)=24h ≦ 40h → ②0
    bP5WhenOff: !!off.ot && !!offT && offT.t === "3h" && /1日8時間超 3:00・週40時間超 0:00/.test(offT.title),
    // A制・半月15h 固定枠: 月の残業予定＝15＋12＝27h（オン／オフに関係なく属性の設定で効く）
    halfMonthFixed: !!onS && /27h/.test(onS.t + onS.title) && /半月ごと/.test(onS.title) && !!offS && /27h/.test(offS.t + offS.title),
    noErrors: a.errors.length === 0 && on.errors.length === 0 && off.errors.length === 0,
  };
  v.allPass = Object.values(v).every(Boolean);
  console.log(JSON.stringify({ setTab: a, on, off, verdict: v }, null, 2));
  process.exit(v.allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
