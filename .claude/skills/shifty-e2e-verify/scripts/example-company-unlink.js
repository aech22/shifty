// 企業連携タブの「解除」がリロード後に元へ戻らないかを実ブラウザで確かめる。
//
// 背景（2026-09-16 の本番報告）: 連携店舗を解除すると一覧からは消えるのに、リロードすると戻る。
// 連携の実体は **accounts/{uid}/shops** と **companies/{companyId}/pub/shops** の2箇所にあり、
// 解除が後者しか消していなかったため、Phase1（accounts を読む）が前者から復活させていた。
//
// 解除の実装（unlinkShopFromAuth）は App() のクロージャの中にあるので、タブ単体をマウントする
// 1.6節のやり方では実行できない。かわりに Firebase SDK ごと差し替える（stub-firebase.js）。
// **Firebase へは1バイトも出ない**が、3フェーズ初期化・companyInfo の復元・CompanyTab の描画・
// 解除ハンドラはすべて本物が動く。「リロード」は page.reload() で、モックDBは localStorage に
// 載っているのでリロードをまたいで残る（＝サーバー側に状態が残ることの再現）。
//
//   node .claude/skills/shifty-e2e-verify/scripts/example-company-unlink.js
//   SHIFTY_ROOT=/tmp/shifty-main-xxxx node .../example-company-unlink.js   # 修正前の版で落ちることの確認
"use strict";

const path = require("node:path");
const { openHarness, REPO_ROOT } = require(path.join(__dirname, "mount-component.js"));
const { makeStub } = require(path.join(__dirname, "stub-firebase.js"));

const UID = "U1";
const CID = "C1";

const SCRIPTS = [
  { src: "app-utils.js", babel: false },
  { src: "app-core.js", babel: false },
  { src: "app-staff.js", babel: true },
  { src: "app-admin.js", babel: true },
  { src: "app-main.js", babel: true },
];

// 3店舗にしてあるのは、CompanyTab の解除ボタンが `listShops.length>1` でしか描かれないため
// （2店舗だと1件解除した時点でボタンが消え、リロード後の一覧を同じ方法で読めない）。
const shopsNode = () => ({
  S1: { owners: { [UID]: "KEY1", [`company_${CID}`]: "KEY1" }, private: { adminKey: "KEY1" }, staff: { 0: "田中" } },
  S2: { owners: { [UID]: "KEY2", [`company_${CID}`]: "KEY2" }, private: { adminKey: "KEY2" }, staff: { 0: "鈴木" } },
  S3: { owners: { [UID]: "KEY3", [`company_${CID}`]: "KEY3" }, private: { adminKey: "KEY3" }, staff: { 0: "高橋" } },
});
const globalShops = { S1: { id: "S1", name: "A店" }, S2: { id: "S2", name: "B店" }, S3: { id: "S3", name: "C店" }, S4: { id: "S4", name: "D店" } };
const companyPub = { name: "テスト企業", ownerUid: UID, code: "ABCD1234", shops: { S1: true, S2: true, S3: true } };

const SCENARIOS = [
  {
    // 本件そのもの: 企業の作成者（Google/メールのuid）。3店舗とも自分が作った店舗なので
    // accounts/{uid}/shops にも companies/{id}/pub/shops にも載っている（createCompany がそうする）。
    key: "creator",
    title: "企業の作成者（accountsとcompaniesの両方に載っている）",
    uid: UID,
    seed: {
      global: { shops: globalShops },
      shops: shopsNode(),
      accounts: { [UID]: { shops: { S1: true, S2: true, S3: true }, company: { companyId: CID, code: "ABCD1234", name: "テスト企業" } } },
      companies: { [CID]: { pub: companyPub } },
    },
    cfHandlers: { unlinkStoreFromCompany: "unlink" },
    expect: {
      afterList: ["A店", "C店"], cfNames: ["unlinkStoreFromCompany"],
      company: { S1: true, S3: true }, account: { S1: true, S3: true },
      reloadList: ["A店", "C店"],
    },
  },
  {
    // 企業アカウントを持たない利用者（複数店舗を1つのGoogleアカウントで見ているだけ）。
    // CF を呼ばずに accounts から消えるべき（呼ぶと「企業アカウントがありません」で失敗する）。
    key: "no-company",
    title: "企業アカウント無し（accountsだけ）",
    uid: UID,
    seed: {
      global: { shops: globalShops },
      shops: shopsNode(),
      accounts: { [UID]: { shops: { S1: true, S2: true, S3: true } } },
    },
    cfHandlers: {},
    expect: {
      afterList: ["A店", "C店"], cfNames: [],
      company: null, account: { S1: true, S3: true },
      reloadList: ["A店", "C店"],
    },
  },
  {
    // 企業コード＋パスワードのセッション（uid="company_C1"）。Phase1 は companies/pub/shops を読む。
    // accounts/company_C1 は存在しないので、そちらを触ろうとしない（触っても消すものが無い）。
    key: "company-session",
    title: "企業ログインセッション（companiesだけ）",
    uid: `company_${CID}`,
    seed: {
      global: { shops: globalShops },
      shops: shopsNode(),
      companies: { [CID]: { pub: companyPub } },
    },
    cfHandlers: { unlinkStoreFromCompany: "unlink" },
    expect: {
      afterList: ["A店", "C店"], cfNames: ["unlinkStoreFromCompany"],
      company: { S1: true, S3: true }, account: null,
      reloadList: ["A店", "C店"],
    },
  },
  {
    // CF が拒否したとき（「この店舗の管理者はこの企業アカウントだけです」＝バグチェック#65 のガード）。
    // **片側だけ消えてはいけない**。accounts も companies もそのままで、一覧も変わらない。
    key: "cf-error",
    title: "CFが解除を拒否（片側だけ消さない）",
    uid: UID,
    seed: {
      global: { shops: globalShops },
      shops: shopsNode(),
      accounts: { [UID]: { shops: { S1: true, S2: true, S3: true }, company: { companyId: CID, code: "ABCD1234", name: "テスト企業" } } },
      companies: { [CID]: { pub: companyPub } },
    },
    cfHandlers: { unlinkStoreFromCompany: "reject:この店舗の管理者はこの企業アカウントだけです" },
    expect: {
      afterList: ["A店", "B店", "C店"], cfNames: ["unlinkStoreFromCompany"],
      company: { S1: true, S2: true, S3: true }, account: { S1: true, S2: true, S3: true },
      reloadList: ["A店", "B店", "C店"], toastHas: "✕ この店舗の管理者はこの企業アカウントだけです",
    },
  },
  {
    // 解除の裏返し（同じ一貫性の問題）。企業に入れていない自分の店舗（C店＝accounts にだけある）が
    // あるとき、店舗を1つ追加したら **一覧から C店 が消えてはいけない**（リロードすると戻ってくる＝
    // 操作直後とリロード後で一覧が食い違う）。_refreshCompanyLinkedShops の検証。
    key: "link-store",
    title: "管理コードで店舗を追加（accountsにだけある店舗を落とさない）",
    flow: "add",
    uid: UID,
    addCode: "S4.KEY4",
    seed: {
      global: { shops: globalShops },
      shops: shopsNode(),
      accounts: { [UID]: { shops: { S1: true, S2: true, S3: true }, company: { companyId: CID, code: "ABCD1234", name: "テスト企業" } } },
      companies: { [CID]: { pub: { name: "テスト企業", ownerUid: UID, code: "ABCD1234", shops: { S1: true, S2: true } } } },
    },
    cfHandlers: { linkStoreToCompany: "link" },
    expect: {
      afterList: ["A店", "B店", "C店", "D店"], cfNames: ["linkStoreToCompany"],
      company: { S1: true, S2: true, S4: true }, account: { S1: true, S2: true, S3: true },
      reloadList: ["A店", "B店", "C店", "D店"],
    },
  },
];

const listedShops = (h) => h.evaluate(() => {
  const btns = [...document.querySelectorAll("button")].filter(b => (b.innerText || "").trim() === "解除");
  return btns.map(b => {
    const card = b.closest("div").parentElement;
    const t = (card.innerText || "").split("\n").map(s => s.trim()).filter(Boolean);
    return t.find(s => /店$/.test(s)) || t[0];
  }).sort();
});

const clickUnlinkOf = (h, shopName) => h.evaluate((name) => {
  const btns = [...document.querySelectorAll("button")].filter(b => (b.innerText || "").trim() === "解除");
  for (const b of btns) {
    const card = b.closest("div").parentElement;
    if ((card.innerText || "").includes(name)) { b.click(); return true; }
  }
  return false;
}, shopName);

const waitForTab = (h) => h.page.waitForFunction(
  () => [...document.querySelectorAll("button")].some(b => (b.innerText || "").trim() === "解除"),
  { timeout: 15000 }
);

(async () => {
  const root = process.env.SHIFTY_ROOT || REPO_ROOT;
  const only = process.env.SCENARIO || "";
  const pass = [], fail = [], errs = [];
  const check = (name, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    (ok ? pass : fail).push(`${ok ? "pass" : "FAIL"}: ${name} → got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
  };
  console.log("root =", root);

  for (const sc of SCENARIOS) {
    if (only && only !== sc.key) continue;
    const h = await openHarness({
      root,
      jsx: "window.__harnessReady=true;",
      waitFor: "#root > *",
      viewport: { width: 1400, height: 950 },
      extraHead: makeStub({ seed: sc.seed, uid: sc.uid, view: "admin", tab: "company", cfHandlers: sc.cfHandlers }),
      scripts: SCRIPTS,
    });
    const p = `[${sc.key}] ${sc.title}`;
    try {
      await waitForTab(h);
      if (sc.flow === "add") {
        check(`${p} ① 追加前の一覧`, await listedShops(h), ["A店", "B店", "C店"]);
        check(`${p} ② 追加パネルを開けた`, await h.clickByText("管理コードで追加"), true);
        await h.setInput('input[placeholder="管理コードを貼り付け"]', sc.addCode);
        check(`${p} ②' 追加を押せた`, await h.clickByText("追加"), true);
      } else {
        check(`${p} ① 解除前の一覧`, await listedShops(h), ["A店", "B店", "C店"]);
        check(`${p} ② 解除を押せた`, await clickUnlinkOf(h, "B店"), true);
      }
      await h.page.waitForTimeout(900);
      check(`${p} ③ 操作直後の一覧`, await listedShops(h), sc.expect.afterList);
      check(`${p} ④ 呼ばれたCF`, await h.evaluate(() => window.__cf.map(c => c.name)), sc.expect.cfNames);
      check(`${p} ⑤ companies/pub/shops`, await h.evaluate(c => window.__db(`companies/${c}/pub/shops`), CID), sc.expect.company);
      check(`${p} ⑥ accounts/{uid}/shops`, await h.evaluate(u => window.__db(`accounts/${u}/shops`), sc.uid), sc.expect.account);
      if (sc.expect.toastHas) {
        const body = await h.evaluate(() => document.body.innerText);
        check(`${p} ⑦ エラー表示`, body.includes(sc.expect.toastHas), true);
      }
      await h.page.reload({ waitUntil: "networkidle" });
      await waitForTab(h);
      await h.page.waitForTimeout(900);
      check(`${p} ⑧ リロード後の一覧`, await listedShops(h), sc.expect.reloadList);
      if (h.errors.length) errs.push(`${p}:\n  ` + h.errors.join("\n  "));
    } catch (e) {
      fail.push(`FAIL: ${p} 例外 → ${e.message}`);
    } finally {
      await h.close();
    }
  }

  console.log([...pass, ...fail].join("\n"));
  console.log(`\npass ${pass.length} / fail ${fail.length}`);
  if (errs.length) console.log("errors:\n" + errs.join("\n"));
  process.exit(fail.length ? 1 : 0);
})();
