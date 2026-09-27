// 管理コード（Cookie）で入った端末の店舗間シフト重複判定の実ブラウザ回帰テスト（バグチェック#150）。
// この端末は allLinkedShops を持たない（accounts/{uid}/shops を読む経路を通らない）ので、
// 他店舗の一覧は企業の写し（companyLink.shops＝companies/{id}/pub/shops の写し）から取る必要がある。
// ShiftEditTab だけをマウントし、他店舗のデータはスタブ Firebase から返す（dev へは1バイトも出ない）。
//
// 測るもの:
//  (a) allLinkedShops=[]・companyLink あり・田中の所属=A店 → 重複エラーに「田中 …（A店）」が出る
//  (b) allLinkedShops=[]・companyLink なし（企業に連携していない端末）→ 他店舗を読みに行かない＝エラーなし
//  (c) allLinkedShops にだけ A店がある（企業作成者の端末）→ 従来どおり出る（非回帰）
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-home-shop-dup-cookie-device.js → EXIT=0
// 反証: SHIFTY_ROOT=<a882991 の配信物> で (a) だけが落ちて EXIT=1
"use strict";
const path = require("node:path");
const { openHarness } = require(path.join(__dirname, "mount-component.js"));
const { makeStub } = require(path.join(__dirname, "stub-firebase.js"));
const ROOT = process.env.SHIFTY_ROOT || undefined;
const THEME = `<style>:root{--c-bg:#F0F2F5;--c-card:#FFFFFF;--c-input:#F3F4F6;--c-input2:#F0F2F5;` +
  `--c-border:#E5E7EB;--c-border2:#D1D5DB;--c-text:#1A1A2E;--c-text2:#374151;--c-text3:#6B7280;` +
  `--c-text4:#9CA3AF;--c-shadow:rgba(0,0,0,.06);--c-accent:#f87036;--c-danger:#DC2626;}</style>`;

// 他店舗 A1（A店）: 田中が 10/5 10:00-15:00 に出勤
const SEED = {
  shops: {
    A1: {
      staff: ["田中", "佐藤"],
      settings: { shopAbbrs: ["A"], staffAliases: {} },
      subs: { x1: { id: "x1", periodId: "pa", staffName: "田中", shopId: "A1",
        shifts: { "2026-10-05": { status: "work", start: "10:00", end: "15:00" } } } },
    },
  },
};

async function run(extraSettings, linked, companyLink) {
  const h = await openHarness({
    root: ROOT, extraHead: THEME + makeStub({ seed: SEED, uid: "u_test" }), waitFor: "select",
    jsx: `
firebaseDB = firebase.database();
const P={id:"p1",urlToken:"t1",shopId:"S1",label:"10月前半",startDate:"2026-10-01",endDate:"2026-10-15",deadlineDate:"",createdAt:"2026-09-01T00:00:00.000Z"};
const SUBS=[{id:"s1",periodId:"p1",staffName:"田中",shopId:"S1",comment:"",submittedAt:"2026-09-02T00:00:00.000Z",
  shifts:{"2026-10-05":{status:"work",start:"12:00",end:"18:00"}}},
  {id:"s2",periodId:"p1",staffName:"山田",shopId:"S1",comment:"",submittedAt:"2026-09-02T00:00:00.000Z",
  shifts:{"2026-10-05":{status:"work",start:"12:00",end:"18:00"}}}];
const SETTINGS=Object.assign({shopId:"S1",candidates:[{start:"09:00",end:"23:00"}],weekdayCandidates:{},dateCandidates:{},
  breakTimes:{weekday:[],sat:[],sun:[],holSat:[],holSun:[]},staffAttributes:{},staffTypeLimits:{},
  staffColors:{},staffAliases:{},positions:{kitchen:[],hall:[]},requiredPositions:{},staffPositions:{}},${JSON.stringify(extraSettings)});
function Harness(){
  const [subs,setSubs]=React.useState(SUBS);
  return <ShiftEditTab subs={subs} periods={[P]} staffList={["田中","山田"]}
    onSave={v=>setSubs(p=>typeof v==="function"?v(p):v)} tt={()=>{}}
    settings={SETTINGS} plan="premium" shopId="S1" shopName="B店" onUpgrade={()=>{}}
    allLinkedShops={${JSON.stringify(linked)}} companyLink={${JSON.stringify(companyLink)}}
    savePeriods={null} ownerReadOnly={true} pastSubsLoaded={true}/>;
}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);`,
  });
  await h.page.waitForTimeout(1200);
  const m = await h.evaluate(() => {
    const box = [...document.querySelectorAll("div")].find(d => (d.innerText || "").startsWith("⚠ 出勤がだぶついています"));
    const heads = {};
    document.querySelectorAll("th").forEach(th => {
      const t = (th.innerText || "").replace(/\s+/g, "");
      const home = th.querySelector("[data-home-shop]");
      if (t.startsWith("田中") || t.startsWith("山田")) heads[t.startsWith("田中") ? "田中" : "山田"] = home ? home.innerText.trim() : null;
    });
    return { dup: box ? box.innerText.replace(/\s+/g, " ") : null, heads };
  });
  m.errors = h.errors.slice();
  await h.close();
  return m;
}

(async () => {
  const CL = { id: "C1", name: "企業", settings: {}, deadlines: {}, shops: { S1: "B店", A1: "A店" }, syncedAt: "2026-09-27T00:00:00.000Z" };
  const a = await run({ staffHomeShop: { "田中": "A1" } }, [], CL);
  const b = await run({ staffHomeShop: { "田中": "A1" } }, [], null);
  const c = await run({ staffHomeShop: { "田中": "A1" } }, [{ id: "S1", name: "B店" }, { id: "A1", name: "A店" }], null);
  const verdict = {
    a_cookieDeviceDupShown: !!(a.dup && a.dup.includes("田中") && a.dup.includes("A店")),
    b_noCompanyNoRead: b.dup === null,
    c_creatorDeviceStillWorks: !!(c.dup && c.dup.includes("田中") && c.dup.includes("A店")),
    noErrors: [a, b, c].every(x => x.errors.length === 0),
  };
  verdict.allPass = Object.values(verdict).every(Boolean);
  console.log(JSON.stringify({ a: a.dup, b: b.dup, c: c.dup, verdict }, null, 2));
  process.exit(verdict.allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
