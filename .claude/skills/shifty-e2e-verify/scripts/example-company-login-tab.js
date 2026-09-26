// 企業連携タブからの企業アカウントログイン（2026-09-27 ユーザー指示）の実ブラウザ回帰テスト。
// アプリ全体をスタブ Firebase 上で動かす。Firebase・Cloud Functions へは1バイトも出ない。
//
// A. Google/メールでログイン済みで企業に未ログインの端末: 企業連携タブに「企業アカウントでログイン」が出る／
//    「パスワードを表示」で伏せ字が外れる／企業コードとパスワードだけで companyLogin が呼ばれる／
//    ログイン後は企業アカウントの画面（企業名）に切り替わり、ログインカードは消える／開いていた店舗（B店）のまま
// B. サーバーが失敗を返したとき: エラーが表示され、ログインカードが残る
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-company-login-tab.js → allPass=true / EXIT=0
"use strict";
const path = require("node:path");
const { openHarness, REPO_ROOT } = require(path.join(__dirname, "mount-component.js"));
const { makeStub } = require(path.join(__dirname, "stub-firebase.js"));
const ROOT = process.env.SHIFTY_ROOT || REPO_ROOT;
const UID = "U1", CID = "C1";
const SCRIPTS = ["app-utils.js", "app-core.js", "app-staff.js", "app-admin.js", "app-main.js"].map(src => ({ src, babel: !/utils|core/.test(src) }));
const seed = () => ({
  global: { shops: { S1: { id: "S1", name: "A店" }, S2: { id: "S2", name: "B店" } } },
  shops: {
    S1: { owners: { [`company_${CID}`]: "K1" }, private: { adminKey: "K1" }, staff: { 0: "田中" } },
    S2: { owners: { [UID]: "K2", [`company_${CID}`]: "K2" }, private: { adminKey: "K2" }, staff: { 0: "鈴木" } },
  },
  accounts: { S2: { plan: "premium" }, [UID]: { shops: { S2: true } } },
  companies: { [CID]: { pub: { name: "テスト企業", ownerUid: "someoneElse", code: "ABCD1234", shops: { S1: true, S2: true } } } },
  companyCodes: { ABCD1234: CID },
});
const setVal = (ph, v) => `(()=>{const i=document.querySelector('input[placeholder=${JSON.stringify(ph)}]');if(!i)return "no-input";const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set;set.call(i,${JSON.stringify(v)});i.dispatchEvent(new Event("input",{bubbles:true}));return "ok";})()`;

async function run(cfHandlers) {
  const h = await openHarness({ root: ROOT, jsx: "window.__harnessReady=true;", waitFor: "#root > *", viewport: { width: 1200, height: 900 },
    extraHead: makeStub({ seed: seed(), uid: UID, view: "admin", tab: "company", cfHandlers }), scripts: SCRIPTS });
  const R = {};
  try {
    await h.page.waitForFunction(() => document.body.innerText.includes("企業アカウントでログイン"), { timeout: 15000 });
    R.cardShown = true;
    R.shopBefore = await h.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /店/.test(x.innerText) && x.innerText.includes("▼")); return b ? b.innerText.replace("▼", "").trim() : null; });
    R.typeBefore = await h.evaluate(`document.querySelector('input[placeholder="パスワード"]').type`);
    R.toggle = await h.evaluate(() => { const l = [...document.querySelectorAll("label")].find(x => x.innerText.trim() === "パスワードを表示"); if (!l) return false; l.querySelector("input").click(); return true; });
    await h.page.waitForTimeout(150);
    R.typeAfter = await h.evaluate(`document.querySelector('input[placeholder="パスワード"]').type`);
    await h.evaluate(setVal("企業コード", "abcd1234"));
    await h.evaluate(setVal("パスワード", "pw1234"));
    await h.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => x.innerText.trim() === "企業アカウントでログイン"); b.click(); });
    await h.page.waitForTimeout(1500);
    R.cf = await h.evaluate(() => window.__cf.filter(c => c.name === "companyLogin").map(c => c.payload));
    R.after = await h.evaluate(() => ({
      loginCard: [...document.querySelectorAll("button")].some(x => x.innerText.trim() === "企業アカウントでログイン"),
      // 企業名は編集できる入力欄の値として出る（innerText には現れない）
      companyName: document.body.innerText.includes("テスト企業") || [...document.querySelectorAll("input")].some(i => i.value === "テスト企業"),
      pwChangeBtn: [...document.querySelectorAll("button")].some(x => x.innerText.trim() === "パスワードを変更する"),
      err: (document.querySelector("[data-co-login-err]") || {}).innerText || null,
    }));
    R.shopAfter = await h.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /店/.test(x.innerText) && x.innerText.includes("▼")); return b ? b.innerText.replace("▼", "").trim() : null; });
  } catch (e) { R.exception = e.message; }
  R.errors = h.errors.slice();
  await h.close();
  return R;
}

(async () => {
  const A = await run({ companyLogin: `companyLogin:${CID}` });
  const B = await run({ companyLogin: "reject:INTERNAL" });
  const v = {
    A_cardShown: A.cardShown === true,
    A_showToggles: A.typeBefore === "password" && A.toggle === true && A.typeAfter === "text",
    A_cfCodeAndPwOnly: !!(A.cf && A.cf.length === 1 && A.cf[0].code === "abcd1234" && A.cf[0].password === "pw1234" && Object.keys(A.cf[0]).sort().join() === "code,password"),
    A_switchedToCompany: !!(A.after && !A.after.loginCard && A.after.companyName && A.after.pwChangeBtn),
    A_keptCurrentShop: A.shopBefore === "B店" && A.shopAfter === "B店",
    B_errorShown: !!(B.after && B.after.loginCard && B.after.err === "ログインに失敗しました。しばらくしてから再度お試しください"),
    noErrors: [A, B].every(x => x.errors.length === 0 && !x.exception),
  };
  v.allPass = Object.values(v).every(Boolean);
  console.log(JSON.stringify({ A, B, verdict: v }, null, 2));
  process.exit(v.allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
