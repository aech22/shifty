// P3.5a（長さ方式のしきい値設定）と中休みの削除（2026-10-02）の実ブラウザ回帰テスト。ファイル名は P3.5a のときのまま。
// app-main.js を読み込まないので Firebase へは1バイトも出ない（SKILL.md 1.6節）。
//   1. 設定タブ: 長さ方式の「段の判定」（実働／拘束）と「段を自分で決める」が settings に入る。中休みの設定欄が無い
//   2. 提出一覧の詳細: 店舗データに idleBreak が残っていても長さ方式で計算する。自動＝灰（長さ）・手動＝太字、「自動に戻す」で adjustedBreak が消える
//   3. 確認表示（2026-10-02）: 長さ方式の休憩（60分）と候補タブの全属性の休憩（15:00〜17:00＝120分）が違うと、設定タブの休憩の決め方と
//      候補タブの休憩時間設定の両方に [data-break-mismatch] が出る。一致させる（15:00〜16:00）と消える。時間帯方式・タグ付きだけの休憩には出ない
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-break-idle.js → allPass=true / EXIT=0
// 反証: SHIFTY_ROOT=<中休みの削除より前の配信物> node ... → EXIT=1（中休みの UI があり、通し勤務が120分になる）
"use strict";
const path = require("node:path");
const { openHarness } = require(path.join(__dirname, "mount-component.js"));
const ROOT = process.env.SHIFTY_ROOT || undefined;
const EXTRA_HEAD = `<style>:root{--c-bg:#F0F2F5;--c-card:#FFFFFF;--c-input:#F3F4F6;--c-input2:#F0F2F5;` +
  `--c-border:#E5E7EB;--c-border2:#D1D5DB;--c-text:#1A1A2E;--c-text2:#374151;--c-text3:#6B7280;` +
  `--c-text4:#9CA3AF;--c-shadow:rgba(0,0,0,.06);--c-accent:#f87036;--c-danger:#DC2626;}</style>`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const setVal = (h, sel, v, idx = 0) => h.evaluate(([s, val, i]) => {
  const el = document.querySelectorAll(s)[i];
  if (!el) throw new Error("no " + s);
  const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, String(val));
  el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  if (el.tagName !== "SELECT") el.dispatchEvent(new Event("change", { bubbles: true }));
}, [sel, v, idx]);

async function setTab() {
  const h = await openHarness({ root: ROOT, extraHead: EXTRA_HEAD, waitFor: "#root > *", jsx: `
    function Harness(){
      const [settings,setSettings]=React.useState({shopId:"s1",candidates:[],staffAttributes:{},breakMode:"length",
        staffTypeLimits:{employee:{name:"社員"},parttime:{name:"バイト"}}});
      window.__settings=settings;
      return <SetTab settings={settings} onSave={s=>setSettings(s)} subs={[]} saveSubs={()=>{}}
        tt={()=>{}} syncStatus="online" plan="premium" shopId="s1"/>;
    }
    ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);` });
  const m = {};
  m.lengthBox = await h.evaluate(() => !!document.querySelector("[data-break-length]"));
  m.defaultTwoTier = await h.evaluate(() => /実働8時間超/.test(document.querySelector("[data-break-length]").innerText));
  await setVal(h, "[data-break-basis]", "binding"); await sleep(250);
  await h.evaluate(() => document.querySelector("[data-break-tier-add]").click()); await sleep(250);
  // 段: 6時間 0分 以上 → 60分（値は店舗設定の例。コードには無い）
  await setVal(h, "[data-break-tier='0'] input", 6, 0); await sleep(200);
  await setVal(h, "[data-break-tier='0'] select", "1"); await sleep(200);
  await setVal(h, "[data-break-tier='0'] input", 60, 2); await sleep(200);
  m.breakLength = await h.evaluate(() => window.__settings.breakLength);
  m.twoTierHidden = await h.evaluate(() => !/実働8時間超/.test(document.querySelector("[data-break-length]").innerText));
  // 中休みの設定欄は無い（2026-10-02 に機能ごと削除）
  m.idleUi = await h.evaluate(() => !!document.querySelector("[data-idle-break],[data-idle]") || /中休み/.test(document.body.innerText));
  m.fontsizes = await h.evaluate(() => [...document.querySelectorAll("[data-break-length] input,[data-break-length] select")].map(e => parseFloat(getComputedStyle(e).fontSize)));
  m.errors = h.errors.slice();
  await h.close();
  return m;
}

async function mismatch() {
  const b15 = [{ start: "15:00", end: "17:00" }];
  const h = await openHarness({ root: ROOT, extraHead: EXTRA_HEAD, waitFor: "#root > *", jsx: `
    function Harness(){
      const [settings,setSettings]=React.useState({shopId:"s1",candidates:[],staffAttributes:{},breakMode:"length",
        breakLength:{basis:"binding",tiers:[{overMin:360,breakMin:60,inclusive:true}]},
        breakTimes:{weekday:${JSON.stringify(b15)},sat:${JSON.stringify(b15)},sun:[],holSat:[],holSun:[]},
        staffTypeLimits:{employee:{name:"社員"},parttime:{name:"バイト"}}});
      window.__set=setSettings;
      const [tab,setTab]=React.useState("set");window.__tab=setTab;
      return tab==="set"
        ?<SetTab settings={settings} onSave={s=>setSettings(s)} subs={[]} saveSubs={()=>{}} tt={()=>{}} syncStatus="online" plan="premium" shopId="s1"/>
        :<CandTab settings={settings} onSave={s=>setSettings(s)} tt={()=>{}} plan="premium" periods={[]}/>;
    }
    ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);` });
  const txt = () => h.evaluate(() => [...document.querySelectorAll("[data-break-mismatch]")].map(e => e.innerText.trim()));
  const m = {};
  await sleep(400);
  m.setTab = await txt();
  await h.evaluate(() => window.__tab("cand")); await sleep(300);
  await h.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => x.innerText.trim() === "休憩"); b.click(); }); await sleep(300);
  m.candTab = await txt();
  m.candNote = await h.evaluate(() => /全属性の休憩（タグなし）だけをヒートマップ/.test(document.body.innerText));
  // 一致させる（平日・土曜とも 15:00〜16:00＝60分）と消える
  await h.evaluate(() => window.__set(s => ({ ...s, breakTimes: { ...s.breakTimes, weekday: [{ start: "15:00", end: "16:00" }], sat: [{ start: "15:00", end: "16:00" }] } }))); await sleep(300);
  m.candAfterMatch = await txt();
  // タグ付きだけ・時間帯方式には出ない
  await h.evaluate(() => window.__set(s => ({ ...s, breakTimes: { ...s.breakTimes, weekday: [{ start: "15:00", end: "17:00", tags: ["parttime"] }], sat: [] } }))); await sleep(300);
  m.candTaggedOnly = await txt();
  await h.evaluate(() => window.__set(s => ({ ...s, breakMode: "band", breakTimes: { ...s.breakTimes, weekday: [{ start: "15:00", end: "17:00" }] } }))); await sleep(300);
  m.candBand = await txt();
  m.errors = h.errors.slice();
  await h.close();
  return m;
}

async function detail() {
  const h = await openHarness({ root: ROOT, extraHead: EXTRA_HEAD, waitFor: "table", jsx: `
    function Harness(){
      const periods=[{id:"p1",label:"10月前半",startDate:"2026-10-01",endDate:"2026-10-15",deadlineDate:"2026-10-15"}];
      const settings={shopId:"s1",candidates:[],staffColors:{},staffAliases:{},staffAttributes:{},breakMode:"length",
        breakLength:{basis:"binding",tiers:[{overMin:360,breakMin:60,inclusive:true}]},
        idleBreak:{enabled:true,startBy:"14:30",endAfter:"17:00",min:120,days:"weekday"}};
      const [subs,setSubs]=React.useState([{id:"sub1",periodId:"p1",staffName:"田中",shopId:"s1",
        submittedAt:"2026-09-20T10:00:00.000Z",comment:"",
        shifts:{"2026-10-01":{status:"work",start:"10:00",end:"22:00"},
                "2026-10-02":{status:"work",start:"17:00",end:"23:00"},
                "2026-10-05":{status:"work",start:"10:00",end:"22:00",adjustedBreak:30}}}]);
      window.__subs=()=>subs;
      return <SubsTab subs={subs} periods={periods} staffList={["田中"]}
        onSave={setSubs} tt={()=>{}} settings={settings} onSaveSettings={()=>{}} plan="premium"/>;
    }
    ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);` });
  await h.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => x.textContent.trim() === "詳細"); b.click(); });
  await sleep(400);
  const read = () => h.evaluate(() => [...document.querySelectorAll("[data-break-src]")].map(e => ({
    src: e.getAttribute("data-break-src"), text: e.innerText.replace(/\s+/g, " ").trim(),
    bold: e.querySelector("span") ? getComputedStyle(e.querySelector("span")).fontWeight : getComputedStyle(e).fontWeight,
    color: getComputedStyle(e.querySelector("span") || e).color })));
  const m = { before: await read(), total: await h.evaluate(() => (document.body.innerText.match(/合計：([0-9]+:[0-9]{2})/) || [])[1] || null) };
  await h.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => x.textContent.trim() === "自動に戻す"); b.click(); });
  await sleep(300);
  m.after = await read();
  m.day05 = await h.evaluate(() => window.__subs()[0].shifts["2026-10-05"]);
  m.totalAfter = await h.evaluate(() => (document.body.innerText.match(/合計：([0-9]+:[0-9]{2})/) || [])[1] || null);
  m.errors = h.errors.slice();
  await h.close();
  return m;
}

(async () => {
  const a = await setTab();
  const b = await detail();
  const c = await mismatch();
  const MSG = "長さ方式の休憩（60分）と候補タブの休憩（平日・土曜 15:00〜17:00＝120分）が違います。";
  const v = {
    lengthBoxShown: a.lengthBox && a.defaultTwoTier,
    tierSaved: !!(a.breakLength && a.breakLength.basis === "binding" && Array.isArray(a.breakLength.tiers)
      && a.breakLength.tiers.length === 1 && a.breakLength.tiers[0].overMin === 360
      && a.breakLength.tiers[0].breakMin === 60 && a.breakLength.tiers[0].inclusive === true),
    twoTierReplaced: a.twoTierHidden,
    noIdleUi: a.idleUi === false,
    font16: a.fontsizes.length > 0 && a.fontsizes.every(f => f >= 16),
    // 店舗データに idleBreak（14:30以前・17:00以降・120分）が残っていても読まない:
    // 10/1 長さ60（以前は中休み120）/ 10/2 長さ60 / 10/5 手動30（太字・自動60を併記）
    idleIgnored: b.before[0] && b.before[0].src === "length" && /自動 60分（長さ）/.test(b.before[0].text) && !/中休み/.test(b.before.map(x => x.text).join(" ")),
    autoLength: b.before[1] && b.before[1].src === "length" && /自動 60分（長さ）/.test(b.before[1].text),
    manualBold: b.before[2] && b.before[2].src === "manual" && /手動 30分/.test(b.before[2].text)
      && /自動 60分/.test(b.before[2].text) && Number(b.before[2].bold) >= 700,
    autoNotBold: b.before[0] && Number(b.before[0].bold) < 700,
    // 合計: 10/1 12h−60=11:00, 10/2 6h−60=5:00, 10/5 12h−30=11:30 → 27:30。自動に戻すと 10/5 も 11:00 → 27:00
    totalBefore: b.total === "27:30",
    revertCleared: b.day05 && !("adjustedBreak" in b.day05) && b.after[2] && b.after[2].src === "length",
    totalAfterRevert: b.totalAfter === "27:00",
    mismatchShown: c.setTab.length === 1 && c.setTab[0].startsWith(MSG) && c.candTab.length === 1 && c.candTab[0] === c.setTab[0] && c.candNote === true,
    mismatchClearsWhenMatched: c.candAfterMatch.length === 0,
    mismatchIgnoresTaggedAndBand: c.candTaggedOnly.length === 0 && c.candBand.length === 0,
    noErrors: a.errors.length === 0 && b.errors.length === 0 && c.errors.length === 0,
  };
  v.allPass = Object.values(v).every(Boolean);
  console.log(JSON.stringify({ setTab: a, detail: b, mismatch: c, verdict: v }, null, 2));
  process.exit(v.allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
