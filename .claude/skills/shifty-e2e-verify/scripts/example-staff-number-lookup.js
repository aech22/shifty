// 従業員番号で企業内の他店舗のスタッフを呼び出す（2026-09-28）の実ブラウザ回帰テスト。
// StaffTab だけをマウントし、他店舗のデータはスタブ Firebase（stub-firebase.js）から返す。Firebase へは1バイトも出ない。
//
//  (a) 「12」→ A店所属の田中が1回で登録される（A店と B店の両方に居ても選択肢は出ない）。
//      staffNumbers.田中="12"・staffAttributes.田中="employee"（所属A店側の属性）・staffHomeShop.田中="A1"。有給の付与日数は持ち込まない
//  (b) 同じ番号で別の名前（企業内の番号重複）→ 選択肢が出て、選んだ人が登録される
//  (c) 自店舗に同名がいる → 「既に登録されています」で止まり、何も書かれない
//  (d) Pro／企業の写しに他店舗が無い／ownerReadOnly では入力欄が出ない
//  (e) 企業に入れていない自分の店舗（allLinkedShops だけにある店舗）は読みに行かない＝読むのは companyShops だけ
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-staff-number-lookup.js → allPass=true / EXIT=0
"use strict";
const path = require("node:path");
const { openHarness } = require(path.join(__dirname, "mount-component.js"));
const { makeStub } = require(path.join(__dirname, "stub-firebase.js"));
const ROOT = process.env.SHIFTY_ROOT || undefined;
const SEED = {
  shops: {
    A1: { staff: ["田中", "佐藤"], settings: { staffNumbers: { "田中": "12", "佐藤": "34" }, staffAttributes: { "田中": "employee" }, paidLeaveGranted: { "田中": 20 } } },
    B1: { staff: ["田中"], settings: { staffNumbers: { "田中": "12" }, staffAttributes: { "田中": "parttime" }, staffHomeShop: { "田中": "A1" } } },
    C1: { staff: ["高橋"], settings: { staffNumbers: { "高橋": "34" } } },
    X9: { staff: ["田中"], settings: { staffNumbers: { "田中": "12" } } },
  },
};
async function mount({ plan = "premium", companyShops, staff = ["山田"], readOnly = false } = {}) {
  const cs = companyShops || [{ id: "A1", name: "A店" }, { id: "B1", name: "B店" }, { id: "C1", name: "C店" }];
  return openHarness({
    root: ROOT, extraHead: makeStub({ seed: SEED, uid: "u_test" }), waitFor: "input[placeholder='スタッフ名を入力']",
    jsx: `
firebaseDB = firebase.database();
function Harness(){
  const [staff,setStaff]=React.useState(${JSON.stringify(staff)});
  const [settings,setSettings]=React.useState({shopId:"S1",candidates:[],staffAliases:{},staffTypeLimits:{}});
  window.__staff=staff;window.__settings=settings;
  return <StaffTab staffList={staff} onSave={v=>{window.__staff=v;setStaff(v);}} tt={m=>{window.__toast=m;}}
    plan="${plan}" onUpgrade={()=>{}} onRenameStaff={()=>{}}
    settings={settings} onSaveSettings={s=>{window.__settings=s;setSettings(s);}}
    subs={[]} periods={[]} savePeriods={()=>{}} ownerReadOnly={${readOnly}}
    shopId="S1" shopName="S店" linkedShops={[{id:"S1",name:"S店"},{id:"X9",name:"自分の別店舗"}]} companyShops={${JSON.stringify(cs)}}/>;
}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);`,
  });
}
const PH = "従業員番号（数字）で他店舗から呼び出す";
const typeNum = v => `(()=>{const i=document.querySelector('input[placeholder="${PH}"]');if(!i)return "no-input";const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set;set.call(i,${JSON.stringify(v)});i.dispatchEvent(new Event("input",{bubbles:true}));return "ok";})()`;
const hasInput = `!!document.querySelector('input[placeholder="${PH}"]')`;

(async () => {
  const R = {};
  let h = await mount();
  R.inputFont = await h.evaluate(`parseFloat(getComputedStyle(document.querySelector('input[placeholder="${PH}"]')).fontSize)`);
  await h.evaluate(typeNum("12"));
  await h.clickExact("呼び出す"); await h.page.waitForTimeout(500);
  R.a = await h.evaluate(() => ({ staff: window.__staff, s: window.__settings, toast: window.__toast, choices: [...document.querySelectorAll("button")].some(b => b.innerText.includes("（") && b.innerText.includes("店）")) }));
  R.reads = await h.evaluate(() => window.__reads || []);
  R.errA = h.errors.slice(); await h.close();

  h = await mount();
  await h.evaluate(typeNum("34"));
  await h.clickExact("呼び出す"); await h.page.waitForTimeout(500);
  R.bChoices = await h.evaluate(() => [...document.querySelectorAll("button")].map(b => b.innerText.trim()).filter(t => /（.+店）$/.test(t)));
  await h.clickByText("高橋（C店）"); await h.page.waitForTimeout(300);
  R.b = await h.evaluate(() => ({ staff: window.__staff, home: (window.__settings.staffHomeShop || {})["高橋"], num: (window.__settings.staffNumbers || {})["高橋"] }));
  R.errB = h.errors.slice(); await h.close();

  h = await mount({ staff: ["田中"] });
  await h.evaluate(typeNum("12"));
  await h.clickExact("呼び出す"); await h.page.waitForTimeout(500);
  R.c = await h.evaluate(() => ({ staff: window.__staff, toast: window.__toast, nums: window.__settings.staffNumbers || null }));
  await h.close();

  h = await mount({ plan: "pro" }); R.dPro = await h.evaluate(hasInput); await h.close();
  h = await mount({ companyShops: [] }); R.dNoCompany = await h.evaluate(hasInput); await h.close();
  h = await mount({ readOnly: true }); R.dReadOnly = await h.evaluate(hasInput); await h.close();

  const s = (R.a && R.a.s) || {};
  const v = {
    a_registeredOnce: JSON.stringify(R.a.staff) === JSON.stringify(["山田", "田中"]) && R.a.choices === false,
    a_number: (s.staffNumbers || {})["田中"] === "12",
    a_attrFromHomeShop: (s.staffAttributes || {})["田中"] === "employee",
    a_homeShop: (s.staffHomeShop || {})["田中"] === "A1",
    a_noPaidLeave: !s.paidLeaveGranted,
    b_choices: JSON.stringify(R.bChoices) === JSON.stringify(["佐藤（A店）", "高橋（C店）"]),
    b_registeredChosen: JSON.stringify(R.b.staff) === JSON.stringify(["山田", "高橋"]) && R.b.home === "C1" && R.b.num === "34",
    c_duplicateBlocked: JSON.stringify(R.c.staff) === JSON.stringify(["田中"]) && R.c.toast === "▲ 既に登録されています" && R.c.nums === null,
    d_hidden: R.dPro === false && R.dNoCompany === false && R.dReadOnly === false,
    e_readsCompanyShopsOnly: R.reads.length > 0 && R.reads.every(p => /^shops\/(A1|B1|C1)\//.test(p)),
    font16: R.inputFont >= 16,
    noErrors: R.errA.length === 0 && R.errB.length === 0,
  };
  v.allPass = Object.values(v).every(Boolean);
  console.log(JSON.stringify({ R, verdict: v }, null, 2));
  process.exit(v.allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
