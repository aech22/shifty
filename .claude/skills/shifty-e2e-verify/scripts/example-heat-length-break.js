// 長さ方式の店舗のヒートマップの休憩（2026-10-02 ユーザー指示）の実ブラウザ回帰テスト。
// ShiftEditTab だけをマウントし、スタブ Firebase（stub-firebase.js）で動かす。Firebase へは1バイトも出ない。
//
// 勤務時間と休憩の分は長さ方式のまま。ヒートマップだけは候補タブの休憩帯（15:00〜17:00）で人数を外す。
// 田中 10:00〜23:00・山田 17:00〜23:00（2026-10-05 月曜）。段は「拘束6h 以上 → 60分」。
//  (a) 長さ方式: 10時台2→ではなく 10時台1・15/16時台0（田中は休憩帯）・17時台2。以前は休憩を勤務の先頭（田中 10-11・山田 17-18）に置いて外していた
//  (b) 長さ方式の月計（期間別勤務時間）は 田中 12（13h−60）・山田 5（6h−60）で変わらない
//  (c) 時間帯方式（非回帰）: ヒートマップは同じ（10時台1・15/16時台0・17時台2）
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-heat-length-break.js → allPass=true / EXIT=0
// 反証: SHIFTY_ROOT=<修正前の配信物> node ... → EXIT=1（(a) の 10時台が0・15時台が1・17時台が1）
"use strict";
const path = require("node:path");
const { openHarness } = require(path.join(__dirname, "mount-component.js"));
const { makeStub } = require(path.join(__dirname, "stub-firebase.js"));
const ROOT = process.env.SHIFTY_ROOT || undefined;
const THEME = `<style>:root{--c-bg:#F0F2F5;--c-card:#FFFFFF;--c-input:#F3F4F6;--c-input2:#F0F2F5;` +
  `--c-border:#E5E7EB;--c-border2:#D1D5DB;--c-text:#1A1A2E;--c-text2:#374151;--c-text3:#6B7280;` +
  `--c-text4:#9CA3AF;--c-shadow:rgba(0,0,0,.06);--c-accent:#f87036;--c-danger:#DC2626;}</style>`;
const DATE = "2026-10-05";

async function run(mode) {
  const brk = [{ start: "15:00", end: "17:00" }];
  const SETTINGS = { shopId: "S1", candidates: [{ start: "10:00", end: "23:00" }], weekdayCandidates: {}, dateCandidates: {},
    breakTimes: { weekday: brk, sat: brk, sun: brk, holSat: brk, holSun: brk },
    ...(mode === "length" ? { breakMode: "length", breakLength: { basis: "binding", tiers: [{ overMin: 360, breakMin: 60, inclusive: true }] } } : {}),
    staffAttributes: {}, staffTypeLimits: {}, staffColors: {}, staffAliases: {}, positions: { kitchen: [], hall: [] }, requiredPositions: {}, staffPositions: {} };
  const h = await openHarness({
    root: ROOT, extraHead: THEME + makeStub({ seed: {}, uid: "u_test" }), waitFor: "select",
    jsx: `
firebaseDB = firebase.database();
const P={id:"p1",urlToken:"t1",shopId:"S1",label:"10月前半",startDate:"2026-10-01",endDate:"2026-10-15",deadlineDate:"",createdAt:"2026-09-01T00:00:00.000Z"};
const SUBS=[{id:"s1",periodId:"p1",staffName:"田中",shopId:"S1",comment:"",submittedAt:"2026-09-02T00:00:00.000Z",
  shifts:{"${DATE}":{status:"work",start:"10:00",end:"23:00"}}},
  {id:"s2",periodId:"p1",staffName:"山田",shopId:"S1",comment:"",submittedAt:"2026-09-02T00:00:00.000Z",
  shifts:{"${DATE}":{status:"work",start:"17:00",end:"23:00"}}}];
const SETTINGS=${JSON.stringify(SETTINGS)};
function Harness(){
  const [subs,setSubs]=React.useState(SUBS);
  return <ShiftEditTab subs={subs} periods={[P]} staffList={["田中","山田"]}
    onSave={v=>setSubs(p=>typeof v==="function"?v(p):v)} tt={()=>{}}
    settings={SETTINGS} plan="premium" shopId="S1" shopName="テスト店" onUpgrade={()=>{}}
    allLinkedShops={[]} savePeriods={null} ownerReadOnly={true} pastSubsLoaded={true}/>;
}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);`,
  });
  await h.page.waitForTimeout(1200);
  const m = await h.evaluate(() => {
    const heat = {};
    for (const t of document.querySelectorAll("table")) {
      const ths = [...t.querySelectorAll("thead th")].map(x => (x.innerText || "").trim());
      if (!ths.length || !ths[0].endsWith("日付") || ths.length < 4 || !ths.slice(1).every(x => /^\d+$/.test(x))) continue;
      const row = [...t.querySelectorAll("tbody tr")].find(r => (r.querySelector("td").innerText || "").trim().startsWith("5("));
      if (!row) continue;
      const tds = [...row.querySelectorAll("td")].slice(1).map(x => (x.innerText || "").trim());
      ths.slice(1).forEach((hr, i) => { heat[hr] = (heat[hr] || 0) + (Number(tds[i]) || 0); });
    }
    return { heat, text: document.body.innerText };
  });
  // 期間別勤務時間の表（行＝期間・列＝スタッフ）の「月計」行。ちょうどの時間は分を省いて「12」「5」と出る
  const work = await h.evaluate(() => {
    const tr = [...document.querySelectorAll("tr")].find(r => ((r.querySelector("td,th") || {}).innerText || "").trim() === "月計");
    return tr ? [...tr.querySelectorAll("td,th")].slice(1).map(x => (x.innerText || "").trim()).filter(Boolean) : null;
  });
  const errors = h.errors.slice();
  await h.close();
  return { h10: m.heat["10"], h15: m.heat["15"], h16: m.heat["16"], h17: m.heat["17"], h19: m.heat["19"], work, errors };
}

(async () => {
  const len = await run("length");
  const band = await run("band");
  const v = {
    a_lengthHeatUsesBreakBand: len.h10 === 1 && len.h15 === 0 && len.h16 === 0 && len.h17 === 2 && len.h19 === 2,
    b_lengthWorkUnchanged: JSON.stringify(len.work) === JSON.stringify(["12", "5"]),
    c_bandUnchanged: band.h10 === 1 && band.h15 === 0 && band.h16 === 0 && band.h17 === 2 && band.h19 === 2,
    noErrors: len.errors.length === 0 && band.errors.length === 0,
  };
  v.allPass = Object.values(v).every(Boolean);
  console.log(JSON.stringify({ len, band, verdict: v }, null, 2));
  process.exit(v.allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
