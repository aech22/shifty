// x（ヘルプ・カウント外）を半日単位にした（2026-09-28）ことの実ブラウザ回帰テスト。
// ShiftEditTab だけをマウントし、他店舗のデータはスタブ Firebase（stub-firebase.js）から返す。
// 実ネットワーク・dev の Firebase へは1バイトも出ない。
//
// 田中（所属A店）の自店舗シフト 10/5 9:00-22:00。A店にも 18:00-23:00 の出勤がある。
//  (a) 出勤セルだけ「9x」→ 時間帯別出勤人数の 12時台は減り 19時台は減らない。ディナー帯は自店舗勤務のままなので A店と重複エラーが出る
//  (b) 退勤セルだけ「22x」→ 19時台だけ減り 12時台は残る。自店舗の勤務は17時までなので重複エラーは出ない
//  (c) 両方に x → 12時台・19時台とも減る
//  (d) 9:00-15:00（17時をまたがない）の退勤セルだけ「15x」→ 反対側の帯にも効いて終日カウント外（h/k と同じ規則）
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-help-x-band.js → allPass=true / EXIT=0
// 反証: SHIFTY_ROOT=<修正前の配信物> node ... → EXIT=1（x が日単位なので (a)(b) が落ちる）
"use strict";
const path = require("node:path");
const { openHarness } = require(path.join(__dirname, "mount-component.js"));
const { makeStub } = require(path.join(__dirname, "stub-firebase.js"));
const ROOT = process.env.SHIFTY_ROOT || undefined;
const THEME = `<style>:root{--c-bg:#F0F2F5;--c-card:#FFFFFF;--c-input:#F3F4F6;--c-input2:#F0F2F5;` +
  `--c-border:#E5E7EB;--c-border2:#D1D5DB;--c-text:#1A1A2E;--c-text2:#374151;--c-text3:#6B7280;` +
  `--c-text4:#9CA3AF;--c-shadow:rgba(0,0,0,.06);--c-accent:#f87036;--c-danger:#DC2626;}</style>`;
const DATE = "2026-10-05";
const SEED = {
  shops: {
    A1: {
      staff: ["田中"],
      settings: { shopAbbrs: ["A"], staffAliases: {} },
      subs: { x1: { id: "x1", periodId: "pa", staffName: "田中", shopId: "A1",
        shifts: { [DATE]: { status: "work", start: "18:00", end: "23:00" } } } },
    },
  },
};

async function run(start, end, cells) {
  const h = await openHarness({
    root: ROOT, extraHead: THEME + makeStub({ seed: SEED, uid: "u_test" }), waitFor: "select",
    jsx: `
firebaseDB = firebase.database();
const P={id:"p1",urlToken:"t1",shopId:"S1",label:"10月前半",startDate:"2026-10-01",endDate:"2026-10-15",deadlineDate:"",createdAt:"2026-09-01T00:00:00.000Z"};
const SUBS=[{id:"s1",periodId:"p1",staffName:"田中",shopId:"S1",comment:"",submittedAt:"2026-09-02T00:00:00.000Z",
  shifts:{"${DATE}":{status:"work",start:"${start}",end:"${end}"}}},
  {id:"s2",periodId:"p1",staffName:"山田",shopId:"S1",comment:"",submittedAt:"2026-09-02T00:00:00.000Z",
  shifts:{"${DATE}":{status:"work",start:"09:00",end:"22:00"}}}];
const SETTINGS={shopId:"S1",candidates:[{start:"09:00",end:"23:00"}],weekdayCandidates:{},dateCandidates:{},
  breakTimes:{weekday:[],sat:[],sun:[],holSat:[],holSun:[]},staffAttributes:{},staffTypeLimits:{},
  staffColors:{},staffAliases:{},positions:{kitchen:[],hall:[]},requiredPositions:{},staffPositions:{},staffHomeShop:{"田中":"A1"}};
function Harness(){
  const [subs,setSubs]=React.useState(SUBS);
  return <ShiftEditTab subs={subs} periods={[P]} staffList={["田中","山田"]}
    onSave={v=>setSubs(p=>typeof v==="function"?v(p):v)} tt={()=>{}}
    settings={SETTINGS} plan="premium" shopId="S1" shopName="B店" onUpgrade={()=>{}}
    allLinkedShops={[{id:"S1",name:"B店"},{id:"A1",name:"A店"}]}
    savePeriods={null} ownerReadOnly={true} pastSubsLoaded={true}/>;
}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);`,
  });
  await h.page.waitForTimeout(1000);
  for (const [field, v] of cells) await h.fill(h.cell("田中", DATE, field), v);
  await h.page.waitForTimeout(500);
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
    const box = [...document.querySelectorAll("div")].find(d => (d.innerText || "").startsWith("⚠ 出勤がだぶついています"));
    return { heat, dup: box ? box.innerText.replace(/\s+/g, " ") : null };
  });
  m.errors = h.errors.slice();
  await h.close();
  return { h12: m.heat["12"], h19: m.heat["19"], dup: m.dup, errors: m.errors };
}

(async () => {
  const base = await run("09:00", "22:00", []);
  const a = await run("09:00", "22:00", [["start", "9x"]]);
  const b = await run("09:00", "22:00", [["end", "22x"]]);
  const c = await run("09:00", "22:00", [["start", "9x"], ["end", "22x"]]);
  const d = await run("09:00", "15:00", [["end", "15x"]]);
  const v = {
    base_bothCounted: base.h12 === 2 && base.h19 === 2,
    a_lunchOnly: a.h12 === 1 && a.h19 === 2,
    a_dupStillDetected: !!(a.dup && a.dup.includes("田中") && a.dup.includes("A店")),
    b_dinnerOnly: b.h12 === 2 && b.h19 === 1,
    b_noDup: b.dup === null,
    c_both: c.h12 === 1 && c.h19 === 1,
    d_fallbackWholeDay: d.h12 === 1,
    noErrors: [base, a, b, c, d].every(x => x.errors.length === 0),
  };
  v.allPass = Object.values(v).every(Boolean);
  console.log(JSON.stringify({ base, a, b, c, d, verdict: v }, null, 2));
  process.exit(v.allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
