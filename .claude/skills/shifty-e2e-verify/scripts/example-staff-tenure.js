// 入社日・退社日・新店開始日（settings.staffTenure・2026-10-08）の実ブラウザ回帰テスト。
// Firebase へは1バイトも出ない（シフト作成タブは firebaseDB=null、スタッフタブはスタブ Firebase＝stub-firebase.js）。
//
//  G. シフト作成タブ（ShiftEditTab）のグリッドの列。期間は半月 P1=10/1〜15・P2=10/16〜31・P3=11/1〜15
//     G1 入社日 10/20: P1 に出ない／P2・P3 に出る
//     G2 退社日 10/20: P2 に出る／P3 に出ない
//     G3 新店開始日 10/20（期間の途中）: P2 に出る／P3 に出ない。新店開始日 10/16（P2 の初日）: P2 に出ない
//     G4 Excel（期間管理タブと同じ expXl の呼び方）でも P1 に入社日前の人の列が出ない
//  S. スタッフタブ（StaffTab）の編集モーダル
//     S1 入社日・退社日を保存できる（入社日 > 退社日は保存しない）。input の fontSize は 16px 以上
//     S2 新店開始日を設定すると、自店に transfer、新店（スタブDB）に staff の追加と staffTenure/{名前}/join が差分で書かれる
//        （新店の他のスタッフ・他の設定は消えない）。行に「入社 10/1」「退社 12/31」「→梅田店 11/1〜」
//     S3 新店に同じ名前が居る: 確認ダイアログ → staff は重複させず join だけ書く
//     S4 新店への書き込みが拒否される: 自店の transfer は保存し、「管理者権限が無いため」の案内が出る
//     S5 解除は自店の transfer だけを消す（新店側は触らない）
//     S6 削除（どの期間にも残さない）で staffTenure のキーが消える
//     S7 企業連携でない店舗・Pro では新店開始日の欄が出ない
//
// 実行:   SHIFTY_ROOT=<配信物> node .claude/skills/shifty-e2e-verify/scripts/example-staff-tenure.js → allPass=true / EXIT=0
// 反証:   SHIFTY_ROOT=<この機能より前の配信物> node ... → EXIT≠0（落ちないなら何も検証していない）
"use strict";
const path = require("node:path");
const { openHarness } = require(path.join(__dirname, "mount-component.js"));
const { makeStub } = require(path.join(__dirname, "stub-firebase.js"));
const ROOT = process.env.SHIFTY_ROOT || undefined;
const R = {};

const P = {
  p1: `{id:"p1",urlToken:"t1",shopId:"s1",label:"10月前半",startDate:"2026-10-01",endDate:"2026-10-15",deadlineDate:"2026-09-28",createdAt:"2026-09-01T00:00:00.000Z"}`,
  p2: `{id:"p2",urlToken:"t2",shopId:"s1",label:"10月後半",startDate:"2026-10-16",endDate:"2026-10-31",deadlineDate:"2026-10-10",createdAt:"2026-09-01T00:00:00.000Z"}`,
  p3: `{id:"p3",urlToken:"t3",shopId:"s1",label:"11月前半",startDate:"2026-11-01",endDate:"2026-11-15",deadlineDate:"2026-10-25",createdAt:"2026-09-01T00:00:00.000Z"}`,
};
const STAFF = `["田中","佐藤"]`;
const base = `{shopId:"s1",candidates:[],staffColors:{},staffAliases:{}}`;
const XL = `<script src="https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js" integrity="sha384-Pqp51FUN2/qzfxZxBCtF0stpc9ONI6MYZpVqmo8m20SoaQCzf+arZvACkLkirlPz" crossorigin="anonymous"></script>`;

// ---- G. シフト作成タブ（期間ごとに1回マウントし、settings だけ差し替える）---------------
async function grid(pk, cases, withExcel) {
  const h = await openHarness({
    root: ROOT, waitFor: "[data-scn]", extraHead: withExcel ? XL : "",
    jsx: `
      function Harness(){
        const [settings,setSettings]=React.useState(${base});
        window.__setSettings=s=>setSettings(s);
        window.__period=${P[pk]};
        return <ShiftEditTab subs={[]} periods={[${P[pk]}]} staffList={${STAFF}}
          onSave={()=>{}} tt={()=>{}} settings={settings} plan="premium"
          shopId="s1" shopName="検証店舗" onUpgrade={()=>{}} allLinkedShops={[]}
          onLoadPastSubs={()=>{}} pastSubsLoaded={true} savePeriods={()=>{}} ownerReadOnly={true}/>;
      }
      ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);`,
  });
  const out = {};
  for (const [key, tenure] of Object.entries(cases)) {
    await h.evaluate(t => window.__setSettings({ shopId: "s1", candidates: [], staffColors: {}, staffAliases: {}, staffTenure: { "田中": t } }), tenure);
    await h.page.waitForTimeout(400);
    out[key] = await h.gridStaffNames();
  }
  if (withExcel) {
    const dl = await h.captureDownloads();
    out.excelHead = await h.evaluate(async () => {
      const settings = { shopId: "s1", candidates: [], staffColors: {}, staffAliases: {}, staffTenure: { "田中": { join: "2026-10-20" } } };
      expXl(window.__period, [], ["田中", "佐藤"], () => { }, "検証店舗", { staffColors: {}, staffAliases: {}, staffNumbers: {}, settings });
      await new Promise(r => setTimeout(r, 1500));
      if (!window.__dl.blobs.length) return { error: "blob not captured" };
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await window.__dl.blobs[window.__dl.blobs.length - 1].arrayBuffer());
      const head = [];
      wb.worksheets[0].getRow(2).eachCell({ includeEmpty: true }, c => head.push(c.value == null ? "" : String(c.value)));
      return head;
    });
    await dl.restore();
  }
  out.errors = h.errors.slice();
  await h.close();
  return out;
}

// ---- S. スタッフタブ ---------------------------------------------------------------
const SEED = (bStaff) => ({
  shops: {
    B1: { staff: bStaff, settings: { staffNumbers: { "佐藤": "7" }, shopAbbrs: ["梅"] }, owners: { u_test: "k" } },
    C1: { staff: ["高橋"], settings: { staffNumbers: { "高橋": "9" } } },
  },
});
async function staffTab({ bStaff = ["佐藤"], denyWrite = [], plan = "premium", companyLinked = true, confirm = true } = {}) {
  return openHarness({
    root: ROOT, extraHead: makeStub({ seed: SEED(bStaff), uid: "u_test", denyWrite, confirm }), waitFor: "input[placeholder='スタッフ名を入力']",
    jsx: `
firebaseDB = firebase.database();
function Harness(){
  const [staff,setStaff]=React.useState(["田中","山田"]);
  const [settings,setSettings]=React.useState(${base});
  window.__staff=staff;window.__settings=settings;
  return <StaffTab staffList={staff} onSave={v=>{window.__staff=v;setStaff(v);}} tt={m=>{window.__toast=m;(window.__toasts=window.__toasts||[]).push(m);}}
    plan="${plan}" onUpgrade={()=>{}} onRenameStaff={()=>{}}
    settings={settings} onSaveSettings={s=>{window.__settings=s;setSettings(s);}}
    subs={[]} periods={[]} savePeriods={()=>{}} ownerReadOnly={false}
    shopId="S1" shopName="本店" linkedShops={[{id:"S1",name:"本店"}]} companyLinked={${companyLinked}}
    companyShops={[{id:"B1",name:"梅田店"},{id:"C1",name:"難波店"}]}/>;
}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);`,
  });
}
const setDate = (h, sel, v) => h.evaluate(([sel, v]) => {
  const i = document.querySelector(sel); if (!i) return "no-input";
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, v);
  i.dispatchEvent(new Event("input", { bubbles: true })); i.dispatchEvent(new Event("change", { bubbles: true }));
  return "ok";
}, [sel, v]);
const setSelect = (h, sel, v) => h.evaluate(([sel, v]) => {
  const i = document.querySelector(sel); if (!i) return "no-select";
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(i, v);
  i.dispatchEvent(new Event("change", { bubbles: true }));
  return "ok";
}, [sel, v]);
const wait = (h, ms = 300) => h.page.waitForTimeout(ms);

async function staffFlow() {
  let h = await staffTab();
  R.openEdit = await h.clickExact("編集", { rowText: "田中" });
  R.fonts = await h.evaluate(() => [...document.querySelectorAll("[data-staff-tenure-input],[data-staff-transfer-date],[data-staff-transfer-shop]")].map(e => parseFloat(getComputedStyle(e).fontSize)));
  // 編集モーダルが横にはみ出さない（SHIFTY_DEVICE="iPhone 13" で回すと 390px 幅で測れる）
  R.modalFit = await h.evaluate(() => {
    const card = document.querySelector("[data-staff-transfer-shop]").closest("div[style*='max-width']");
    return card ? { scroll: card.scrollWidth, client: card.clientWidth, vw: window.innerWidth } : null;
  });
  R.s1join = await setDate(h, "[data-staff-tenure-input='join']", "2026-10-01"); await wait(h);
  R.s1afterJoin = await h.evaluate(() => JSON.parse(JSON.stringify((window.__settings.staffTenure || {})["田中"] || null)));
  // 入社日より前の退社日は保存しない
  await setDate(h, "[data-staff-tenure-input='leave']", "2026-09-30"); await wait(h);
  R.s1badLeave = await h.evaluate(() => ({ t: JSON.parse(JSON.stringify((window.__settings.staffTenure || {})["田中"] || null)), toast: window.__toast }));
  await setDate(h, "[data-staff-tenure-input='leave']", "2026-12-31"); await wait(h);
  R.s1afterLeave = await h.evaluate(() => JSON.parse(JSON.stringify((window.__settings.staffTenure || {})["田中"] || null)));
  // 新店開始日
  R.s2shop = await setSelect(h, "[data-staff-transfer-shop]", "B1"); await wait(h, 150);
  R.s2date = await setDate(h, "[data-staff-transfer-date]", "2026-11-01"); await wait(h, 150);
  R.s2save = await h.clickExact("新店開始日を設定する"); await wait(h, 600);
  R.s2 = await h.evaluate(() => ({
    own: JSON.parse(JSON.stringify((window.__settings.staffTenure || {})["田中"] || null)),
    bStaff: window.__db("shops/B1/staff"), bSettings: window.__db("shops/B1/settings"),
    toast: window.__toast, current: !!document.querySelector("[data-staff-transfer-current]"),
  }));
  await h.clickExact("閉じる"); await wait(h);
  R.s2badges = await h.evaluate(() => [...document.querySelectorAll("[data-staff-tenure]")].map(e => e.innerText.trim()));
  // 解除（自店だけ）
  await h.clickExact("編集", { rowText: "田中" });
  R.s5clear = await h.clickExact("解除"); await wait(h);
  R.s5 = await h.evaluate(() => ({ own: JSON.parse(JSON.stringify((window.__settings.staffTenure || {})["田中"] || null)), bSettings: window.__db("shops/B1/settings"), bStaff: window.__db("shops/B1/staff") }));
  await h.clickExact("閉じる"); await wait(h);
  // 削除（期間が無い＝どの期間にも残さない）
  R.s6del = await h.clickExact("削除", { rowText: "田中" });
  R.s6confirm = await h.clickExact("削除する"); await wait(h);
  R.s6 = await h.evaluate(() => ({ staff: window.__staff, tenure: window.__settings.staffTenure === undefined ? "none" : JSON.parse(JSON.stringify(window.__settings.staffTenure)) }));
  R.errS = h.errors.slice(); await h.close();

  // S3 新店に同じ名前が居る
  h = await staffTab({ bStaff: ["佐藤", "田中"] });
  await h.evaluate(() => { window.__confirmMsgs = []; const o = window.confirm; window.confirm = m => { window.__confirmMsgs.push(m); return true; }; });
  await h.clickExact("編集", { rowText: "田中" });
  await setSelect(h, "[data-staff-transfer-shop]", "B1"); await wait(h, 150);
  await setDate(h, "[data-staff-transfer-date]", "2026-11-01"); await wait(h, 150);
  await h.clickExact("新店開始日を設定する"); await wait(h, 600);
  R.s3 = await h.evaluate(() => ({ confirms: window.__confirmMsgs, bStaff: window.__db("shops/B1/staff"), join: (((window.__db("shops/B1/settings") || {}).staffTenure || {})["田中"] || {}).join }));
  R.errS3 = h.errors.slice(); await h.close();

  // S4 新店への書き込みが拒否される
  h = await staffTab({ denyWrite: ["shops/C1"] });
  await h.clickExact("編集", { rowText: "田中" });
  await setSelect(h, "[data-staff-transfer-shop]", "C1"); await wait(h, 150);
  await setDate(h, "[data-staff-transfer-date]", "2026-11-01"); await wait(h, 150);
  await h.clickExact("新店開始日を設定する"); await wait(h, 600);
  R.s4 = await h.evaluate(() => ({ own: JSON.parse(JSON.stringify((window.__settings.staffTenure || {})["田中"] || null)), toast: window.__toast, cStaff: window.__db("shops/C1/staff"), cSettings: window.__db("shops/C1/settings") }));
  R.errS4 = h.errors.slice(); await h.close();

  // S7 企業連携でない・Pro
  h = await staffTab({ companyLinked: false });
  await h.clickExact("編集", { rowText: "田中" });
  R.s7noCompany = await h.evaluate(() => ({ transfer: !!document.querySelector("[data-staff-transfer-shop]"), tenure: !!document.querySelector("[data-staff-tenure-input='join']") }));
  await h.close();
  h = await staffTab({ plan: "pro" });
  await h.clickExact("編集", { rowText: "田中" });
  R.s7pro = await h.evaluate(() => !!document.querySelector("[data-staff-transfer-shop]"));
  await h.close();
}

(async () => {
  R.g1 = await grid("p1", { join: { join: "2026-10-20" }, none: {} }, true);
  R.g2 = await grid("p2", { join: { join: "2026-10-20" }, leave: { leave: "2026-10-20" }, mid: { transfer: { shopId: "B1", date: "2026-10-20" } }, first: { transfer: { shopId: "B1", date: "2026-10-16" } } });
  R.g3 = await grid("p3", { join: { join: "2026-10-20" }, leave: { leave: "2026-10-20" }, mid: { transfer: { shopId: "B1", date: "2026-10-20" } } });
  await staffFlow();
  const has = (a, n) => Array.isArray(a) && a.includes(n);
  const v = {
    G1_joinNotBefore: !has(R.g1.join, "田中") && has(R.g1.join, "佐藤"),
    G1_noTenureShowsAll: has(R.g1.none, "田中") && has(R.g1.none, "佐藤"),
    G1_joinFromPeriodContaining: has(R.g2.join, "田中") && has(R.g3.join, "田中"),
    G2_leaveUntilPeriodContaining: has(R.g2.leave, "田中") && !has(R.g3.leave, "田中") && has(R.g3.leave, "佐藤"),
    G3_transferMidShowsInOld: has(R.g2.mid, "田中") && !has(R.g3.mid, "田中"),
    G3_transferFirstDayHidesOld: !has(R.g2.first, "田中") && has(R.g2.first, "佐藤"),
    G4_excelDropsBeforeJoin: Array.isArray(R.g1.excelHead) && R.g1.excelHead.includes("佐藤") && !R.g1.excelHead.includes("田中"),
    G_noErrors: [R.g1, R.g2, R.g3].every(g => g.errors.length === 0),
    S1_font16: Array.isArray(R.fonts) && R.fonts.length === 4 && R.fonts.every(f => f >= 16),
    S1_modalFits: !!R.modalFit && R.modalFit.scroll <= R.modalFit.client,
    S1_joinSaved: JSON.stringify(R.s1afterJoin) === JSON.stringify({ join: "2026-10-01" }),
    S1_badLeaveRejected: JSON.stringify(R.s1badLeave.t) === JSON.stringify({ join: "2026-10-01" }) && /退社日は入社日より後/.test(R.s1badLeave.toast || ""),
    S1_leaveSaved: JSON.stringify(R.s1afterLeave) === JSON.stringify({ join: "2026-10-01", leave: "2026-12-31" }),
    S2_ownTransfer: R.s2save === "ok" && !!R.s2.own && JSON.stringify(R.s2.own.transfer) === JSON.stringify({ shopId: "B1", date: "2026-11-01" }),
    S2_newShopStaffAppended: JSON.stringify(R.s2.bStaff) === JSON.stringify(["佐藤", "田中"]),
    S2_newShopJoinDiff: !!R.s2.bSettings && JSON.stringify(R.s2.bSettings.staffTenure) === JSON.stringify({ "田中": { join: "2026-11-01" } })
      && JSON.stringify(R.s2.bSettings.staffNumbers) === JSON.stringify({ "佐藤": "7" }) && JSON.stringify(R.s2.bSettings.shopAbbrs) === JSON.stringify(["梅"]),
    S2_toastAndCurrent: /梅田店に田中さんを追加/.test(R.s2.toast || "") && R.s2.current === true,
    S2_rowBadges: JSON.stringify(R.s2badges) === JSON.stringify(["入社 10/1", "退社 12/31", "→梅田店 11/1〜"]),
    S3_sameNameConfirmed: Array.isArray(R.s3.confirms) && R.s3.confirms.length === 1 && /同じ人として扱います/.test(R.s3.confirms[0]),
    S3_noDuplicate: JSON.stringify(R.s3.bStaff) === JSON.stringify(["佐藤", "田中"]) && R.s3.join === "2026-11-01",
    S4_ownSavedOnDeny: !!R.s4.own && JSON.stringify(R.s4.own.transfer) === JSON.stringify({ shopId: "C1", date: "2026-11-01" }),
    S4_guideShown: /管理者権限が無いため/.test(R.s4.toast || "") && JSON.stringify(R.s4.cStaff) === JSON.stringify(["高橋"]) && !(R.s4.cSettings || {}).staffTenure,
    S5_clearOwnOnly: R.s5clear === "ok" && JSON.stringify(R.s5.own) === JSON.stringify({ join: "2026-10-01", leave: "2026-12-31" })
      && JSON.stringify((R.s5.bSettings || {}).staffTenure) === JSON.stringify({ "田中": { join: "2026-11-01" } }) && JSON.stringify(R.s5.bStaff) === JSON.stringify(["佐藤", "田中"]),
    // settingsWithoutStaff は他のマップと同じく空のマップ {} を残す（Firebase は空のオブジェクトを保存しない）。見るのは田中のキーが無いこと
    S6_deleteDropsTenure: R.s6confirm === "ok" && JSON.stringify(R.s6.staff) === JSON.stringify(["山田"])
      && (R.s6.tenure === "none" || (typeof R.s6.tenure === "object" && !("田中" in R.s6.tenure))),
    S7_hiddenWithoutCompanyOrPremium: R.s7noCompany.transfer === false && R.s7noCompany.tenure === true && R.s7pro === false,
    S_noErrors: R.errS.length === 0 && R.errS3.length === 0 && R.errS4.length === 0,
  };
  v.allPass = Object.values(v).every(Boolean);
  console.log(JSON.stringify({ R, verdict: v }, null, 2));
  process.exit(v.allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
