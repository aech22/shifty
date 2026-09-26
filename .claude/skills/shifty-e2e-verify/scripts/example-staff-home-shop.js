// スタッフ編集モーダルの「所属店舗」（staffHomeShop・2026-09-27）の実ブラウザ回帰テスト。
// app-main.js を読み込まないので Firebase へは1バイトも出ない。
//
// 測るもの:
//  - Premium で連携店舗があるとき、編集モーダルに「所属店舗」のセレクトが出る（fontSize 16px 以上）
//  - A店を選ぶと onSaveSettings に staffHomeShop.田中="A1" が入る
//  - 「この店舗」に戻すとキーが消える
//  - Pro では出ない（D9: Premium のみ）／連携店舗が無ければ出ない
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-staff-home-shop.js → allPass=true / EXIT=0
// 反証: SHIFTY_ROOT=<所属店舗より前の配信物> node ... → EXIT=1
"use strict";
const { openHarness } = require(require("node:path").join(__dirname, "mount-component.js"));
const ROOT = process.env.SHIFTY_ROOT || undefined;

async function mount(plan, linked) {
  return openHarness({
    root: ROOT,
    waitFor: "input[placeholder='スタッフ名を入力']",
    jsx: `
      function Harness(){
        const [settings,setSettings]=React.useState({shopId:"S1",candidates:[],staffColors:{},staffAliases:{}});
        window.__settings=settings;
        return <StaffTab staffList={["田中","佐藤"]} onSave={()=>{}} tt={()=>{}}
          plan="${plan}" onUpgrade={()=>{}} onRenameStaff={()=>{}}
          settings={settings} onSaveSettings={s=>{window.__settings=s;setSettings(s);}}
          subs={[]} periods={[]} savePeriods={()=>{}} ownerReadOnly={false}
          shopId="S1" linkedShops={${JSON.stringify(linked)}}/>;
      }
      ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);`,
  });
}
const findHomeSelect = () => {
  const lab = [...document.querySelectorAll("div")].find(d => (d.innerText || "").trim() === "所属店舗");
  if (!lab) return null;
  return lab.parentElement.querySelector("select");
};

(async () => {
  const R = {};
  const LINKED = [{ id: "S1", name: "B店" }, { id: "A1", name: "A店" }];
  let h = await mount("premium", LINKED);
  await h.clickExact("編集", { rowText: "田中" });
  await h.page.waitForTimeout(300);
  R.premium = await h.evaluate(`(${findHomeSelect.toString()})()?({options:[...(${findHomeSelect.toString()})().options].map(o=>o.text),font:parseFloat(getComputedStyle((${findHomeSelect.toString()})()).fontSize)}):null`);
  await h.evaluate(`(()=>{const s=(${findHomeSelect.toString()})();const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value").set;set.call(s,"A1");s.dispatchEvent(new Event("change",{bubbles:true}));})()`);
  await h.page.waitForTimeout(200);
  R.afterA = await h.evaluate(() => (window.__settings.staffHomeShop || null));
  await h.evaluate(`(()=>{const s=(${findHomeSelect.toString()})();const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value").set;set.call(s,"");s.dispatchEvent(new Event("change",{bubbles:true}));})()`);
  await h.page.waitForTimeout(200);
  R.afterSelf = await h.evaluate(() => (window.__settings.staffHomeShop || null));
  R.errors1 = h.errors.slice();
  await h.close();

  h = await mount("pro", LINKED);
  await h.clickExact("編集", { rowText: "田中" });
  await h.page.waitForTimeout(300);
  R.pro = await h.evaluate(`!!(${findHomeSelect.toString()})()`);
  await h.close();

  h = await mount("premium", [{ id: "S1", name: "B店" }]);
  await h.clickExact("編集", { rowText: "田中" });
  await h.page.waitForTimeout(300);
  R.noLinked = await h.evaluate(`!!(${findHomeSelect.toString()})()`);
  await h.close();

  const verdict = {
    shownOnPremium: !!(R.premium && R.premium.options.join(",") === "この店舗,A店"),
    font16: !!(R.premium && R.premium.font >= 16),
    savesHome: !!(R.afterA && R.afterA["田中"] === "A1"),
    selfRemovesKey: !!(R.afterSelf && !("田中" in R.afterSelf)),
    hiddenOnPro: R.pro === false,
    hiddenWithoutLinked: R.noLinked === false,
    noErrors: R.errors1.length === 0,
  };
  verdict.allPass = Object.values(verdict).every(Boolean);
  console.log(JSON.stringify({ R, verdict }, null, 2));
  process.exit(verdict.allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
