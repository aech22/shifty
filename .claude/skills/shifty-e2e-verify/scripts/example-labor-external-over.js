// P3.5c（判定対象外＝区分 none の人の長時間の日に色を付ける）の実ブラウザ回帰テスト。
// app-main.js を読み込まないので Firebase へは1バイトも出ない（SKILL.md 1.6節）。
//   トグルオン: 実働がしきい値（既定8h）を**超える**日だけ塗る。ちょうど8hは塗らない。労務判定の表・パネルには出ない
//   トグルオフ（既定）: 何も塗らない
//   設定タブ: トグルとしきい値が laborSettings に入る
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-labor-external-over.js → allPass=true / EXIT=0
// 反証: SHIFTY_ROOT=<P3.5c より前の配信物> node ... → EXIT≠0
"use strict";
const path = require("node:path");
const { openHarness } = require(path.join(__dirname, "mount-component.js"));
const ROOT = process.env.SHIFTY_ROOT || undefined;
const EXTRA_HEAD = `<style>:root{--c-bg:#F0F2F5;--c-card:#FFFFFF;--c-input:#F3F4F6;--c-input2:#F0F2F5;` +
  `--c-border:#E5E7EB;--c-border2:#D1D5DB;--c-text:#1A1A2E;--c-text2:#374151;--c-text3:#6B7280;` +
  `--c-text4:#9CA3AF;--c-shadow:rgba(0,0,0,.06);--c-accent:#f87036;--c-danger:#DC2626;}</style>`;
const LABOR_CELL_BG = "rgba(139,92,246,0.28)"; // CELL_COLOR_LEGEND の laborErr と同じ値
const sleep = ms => new Promise(r => setTimeout(r, ms));
const P = { id: "p1", urlToken: "t1", shopId: "S1", label: "9月後半", startDate: "2026-09-16", endDate: "2026-09-30", deadlineDate: "", createdAt: "2026-09-01T00:00:00.000Z" };
// 山田＝派遣（判定対象外）。16日 8:00ちょうど／17日 8:01／18日 10:00。休憩帯なし。
const SUBS = [{ id: "s1", periodId: "p1", staffName: "山田", shopId: "S1", comment: "", submittedAt: "2026-09-02T00:00:00.000Z",
  shifts: { "2026-09-16": { status: "work", start: "09:00", end: "17:00" }, "2026-09-17": { status: "work", start: "09:00", end: "17:01" },
    "2026-09-18": { status: "work", start: "09:00", end: "19:00" } } }];

async function shiftTab(on) {
  const SETTINGS = { shopId: "S1", candidates: [{ start: "09:00", end: "23:00" }], weekdayCandidates: {}, dateCandidates: {},
    breakTimes: { weekday: [], sat: [], sun: [], holSat: [], holSun: [] },
    laborSettings: on ? { highlightExternalOver8h: 1 } : {},
    staffAttributes: { 山田: "dispatch" }, staffTypeLimits: { dispatch: { name: "派遣" } },
    staffColors: {}, staffAliases: {}, positions: { kitchen: [], hall: [] }, requiredPositions: {}, staffPositions: {} };
  const h = await openHarness({ root: ROOT, extraHead: EXTRA_HEAD, waitFor: "#root > *", jsx: `
const P=${JSON.stringify(P)};const SUBS=${JSON.stringify(SUBS)};const SETTINGS=${JSON.stringify(SETTINGS)};
function Harness(){const [subs,setSubs]=React.useState(SUBS);
  return <ShiftEditTab subs={subs} periods={[P]} staffList={["山田"]} onSave={v=>setSubs(p=>typeof v==="function"?v(p):v)} tt={()=>{}}
    settings={SETTINGS} plan="premium" shopId="S1" shopName="テスト店" onUpgrade={()=>{}} pastSubsLoaded={true}
    savePeriods={()=>{}} ownerReadOnly={false}/>;}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);` });
  await sleep(700);
  const m = await h.evaluate(bg => {
    const cells = [...document.querySelectorAll("input[data-sc]")].map(i => ({ sc: i.getAttribute("data-sc"),
      img: (getComputedStyle(i).backgroundImage || "").replace(/\s/g, ""), title: i.title || "" }));
    const panel = [...document.querySelectorAll("div")].find(x => (x.innerText || "").startsWith("⚠ 労務の確認が必要です"));
    const w = [...document.querySelectorAll("div")].find(d => (d.innerText || "").startsWith("労務判定（"));
    const verdict = w ? ([...w.querySelectorAll("tbody tr")].map(tr => [...tr.querySelectorAll("td")].map(td => td.innerText.trim()))
      .find(r => r[0] === "総括") || []).slice(1) : null;
    return { painted: cells.filter(c => c.img.includes(bg)).map(c => c.sc).sort(),
      titles: cells.filter(c => c.img.includes(bg)).map(c => c.title), panel: panel ? panel.innerText : null, verdict };
  }, LABOR_CELL_BG);
  m.errors = h.errors.slice();
  await h.close();
  return m;
}

async function setTab() {
  const h = await openHarness({ root: ROOT, extraHead: EXTRA_HEAD, waitFor: "#root > *", jsx: `
    function Harness(){
      const [settings,setSettings]=React.useState({shopId:"s1",candidates:[],staffAttributes:{},staffTypeLimits:{employee:{name:"社員"},parttime:{name:"バイト"}}});
      window.__settings=settings;
      return <SetTab settings={settings} onSave={s=>setSettings(s)} onSaveOwn={s=>setSettings(s)} subs={[]} saveSubs={()=>{}}
        tt={()=>{}} syncStatus="online" plan="premium" shopId="s1"/>;
    }
    ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);` });
  const m = {};
  m.offByDefault = await h.evaluate(() => { const c = document.querySelector("[data-external-over] input[type=checkbox]"); return c ? !c.checked : null; });
  await h.evaluate(() => document.querySelector("[data-external-over] input[type=checkbox]").click()); await sleep(300);
  await h.evaluate(() => { const i = document.querySelectorAll("[data-external-over] input[type=number]")[0];
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, "10"); i.dispatchEvent(new Event("input", { bubbles: true })); });
  await sleep(300);
  m.labor = await h.evaluate(() => window.__settings.laborSettings);
  m.errors = h.errors.slice();
  await h.close();
  return m;
}

(async () => {
  const on = await shiftTab(true);
  const off = await shiftTab(false);
  const st = await setTab();
  const v = {
    paintedOnlyOverDays: on.painted.join(",") === ["2026-09-17|end", "2026-09-17|start", "2026-09-18|end", "2026-09-18|start"].join(","),
    exactNotPainted: !on.painted.some(s => s.startsWith("2026-09-16")),
    titleExplains: on.titles.length > 0 && on.titles.every(t => /判定対象外（応援・外部）の長時間の日/.test(t)),
    notInPanelOrVerdict: (!on.panel || !/長時間/.test(on.panel)) && Array.isArray(on.verdict) && on.verdict.every(x => x === ""),
    offPaintsNothing: off.painted.length === 0,
    setOffByDefault: st.offByDefault === true,
    setSaved: !!(st.labor && st.labor.highlightExternalOver8h === 1 && st.labor.externalOverThresholdMin === 600),
    noErrors: on.errors.length === 0 && off.errors.length === 0 && st.errors.length === 0,
  };
  v.allPass = Object.values(v).every(Boolean);
  console.log(JSON.stringify({ on, off, setTab: st, verdict: v }, null, 2));
  process.exit(v.allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
