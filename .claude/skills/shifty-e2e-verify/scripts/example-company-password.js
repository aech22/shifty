// 企業アカウントのパスワード（2026-09-27 ユーザー指示）の実ブラウザ回帰テスト。
// アプリ全体をスタブ Firebase 上で動かす。Firebase・Cloud Functions へは1バイトも出ない。
//
// A. 作成: 「パスワードを表示」で伏せ字が外れる／2回の入力が違うと「パスワードが一致しません」で CF を呼ばない／
//    一致すれば createCompany が1回呼ばれ、送られるパスワードが入力どおり
// B. 変更: 現在のパスワード欄がある／現在が空・新しい2つが不一致・現在と同じ のそれぞれで CF を呼ばない／
//    正しく入れると changeCompanyPassword に currentPassword と newPassword が送られる／
//    CF が「現在のパスワードが正しくありません」を返すとその文言が出る
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-company-password.js → allPass=true / EXIT=0
"use strict";
const path = require("node:path");
const { openHarness, REPO_ROOT } = require(path.join(__dirname, "mount-component.js"));
const { makeStub } = require(path.join(__dirname, "stub-firebase.js"));
const ROOT = process.env.SHIFTY_ROOT || REPO_ROOT;
const UID = "U1", CID = "C1";
const SCRIPTS = ["app-utils.js", "app-core.js", "app-staff.js", "app-admin.js", "app-main.js"].map(src => ({ src, babel: !/utils|core/.test(src) }));
const base = () => ({
  global: { shops: { S1: { id: "S1", name: "A店" } } },
  shops: { S1: { owners: { [UID]: "K1" }, private: { adminKey: "K1" }, staff: { 0: "田中" } } },
  accounts: { S1: { plan: "premium" }, [UID]: { shops: { S1: true } } },
});
const setVal = (ph, v) => `(()=>{const i=document.querySelector('input[placeholder=${JSON.stringify(ph)}]');if(!i)return "no-input";const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set;set.call(i,${JSON.stringify(v)});i.dispatchEvent(new Event("input",{bubbles:true}));return "ok";})()`;
const typeOf = ph => `(document.querySelector('input[placeholder=${JSON.stringify(ph)}]')||{}).type||null`;
const toggleShow = `(()=>{const l=[...document.querySelectorAll("label")].find(x=>x.innerText.trim()==="パスワードを表示");if(!l)return false;l.querySelector("input").click();return true;})()`;
const cfCalls = name => `window.__cf.filter(c=>c.name===${JSON.stringify(name)}).map(c=>c.payload)`;

async function create() {
  const h = await openHarness({ root: ROOT, jsx: "window.__harnessReady=true;", waitFor: "#root > *", viewport: { width: 1200, height: 900 },
    extraHead: makeStub({ seed: base(), uid: UID, view: "admin", tab: "company" }), scripts: SCRIPTS });
  const R = {};
  try {
    await h.page.waitForFunction(() => document.body.innerText.includes("企業アカウントを作成する"), { timeout: 15000 });
    R.confirmField = await h.evaluate(`!!document.querySelector('input[placeholder="パスワード（確認）"]')`);
    R.typeBefore = await h.evaluate(typeOf("パスワード"));
    R.toggled = await h.evaluate(toggleShow);
    await h.page.waitForTimeout(150);
    R.typeAfter = await h.evaluate(typeOf("パスワード"));
    await h.evaluate(setVal("例）〇〇フーズ", "テスト企業"));
    await h.evaluate(setVal("パスワード", "abc123"));
    await h.evaluate(setVal("パスワード（確認）", "abc124"));
    await h.clickByText("企業アカウントを作成する");
    await h.page.waitForTimeout(300);
    R.mismatchMsg = await h.evaluate(() => document.body.innerText.includes("パスワードが一致しません"));
    R.cfAfterMismatch = await h.evaluate(cfCalls("createCompany"));
    await h.evaluate(setVal("パスワード（確認）", "abc123"));
    await h.clickByText("企業アカウントを作成する");
    await h.page.waitForTimeout(600);
    R.cfAfterMatch = await h.evaluate(cfCalls("createCompany"));
  } catch (e) { R.exception = e.message; }
  R.errors = h.errors.slice();
  await h.close();
  return R;
}

async function change(cfHandlers) {
  const seed = base();
  seed.accounts[UID].company = { companyId: CID, code: "ABCD1234", name: "テスト企業" };
  seed.companies = { [CID]: { pub: { name: "テスト企業", ownerUid: UID, code: "ABCD1234", shops: { S1: true } } } };
  const h = await openHarness({ root: ROOT, jsx: "window.__harnessReady=true;", waitFor: "#root > *", viewport: { width: 1200, height: 900 },
    extraHead: makeStub({ seed, uid: UID, view: "admin", tab: "company", cfHandlers }), scripts: SCRIPTS });
  const R = {};
  const toast = () => h.evaluate(() => [...document.querySelectorAll("div")].map(d => d.innerText).filter(t => /^[✓✕]/.test((t || "").trim())).pop() || null);
  const press = async () => { await h.clickExact("変更"); await h.page.waitForTimeout(400); };
  try {
    await h.page.waitForFunction(() => document.body.innerText.includes("パスワードを変更する"), { timeout: 15000 });
    await h.clickByText("パスワードを変更する");
    await h.page.waitForTimeout(200);
    R.fields = await h.evaluate(() => ["現在のパスワード", "新しいパスワード", "新しいパスワード（確認）"].map(p => !!document.querySelector(`input[placeholder="${p}"]`)));
    await h.evaluate(setVal("新しいパスワード", "newpw1"));
    await h.evaluate(setVal("新しいパスワード（確認）", "newpw1"));
    await press(); R.noCurrent = await toast();
    await h.evaluate(setVal("現在のパスワード", "oldpw1"));
    await h.evaluate(setVal("新しいパスワード（確認）", "newpw2"));
    await press(); R.mismatch = await toast();
    await h.evaluate(setVal("新しいパスワード", "oldpw1"));
    await h.evaluate(setVal("新しいパスワード（確認）", "oldpw1"));
    await press(); R.same = await toast();
    R.cfBefore = await h.evaluate(cfCalls("changeCompanyPassword"));
    R.toggled = await h.evaluate(toggleShow);
    await h.page.waitForTimeout(150);
    R.typesShown = await h.evaluate(() => ["現在のパスワード", "新しいパスワード", "新しいパスワード（確認）"].map(p => (document.querySelector(`input[placeholder="${p}"]`) || {}).type));
    await h.evaluate(setVal("新しいパスワード", "newpw1"));
    await h.evaluate(setVal("新しいパスワード（確認）", "newpw1"));
    await press(); R.final = await toast();
    R.cfAfter = await h.evaluate(cfCalls("changeCompanyPassword"));
  } catch (e) { R.exception = e.message; }
  R.errors = h.errors.slice();
  await h.close();
  return R;
}

(async () => {
  const A = await create();
  const B = await change({});
  const C = await change({ changeCompanyPassword: "reject:現在のパスワードが正しくありません" });
  const v = {
    A_confirmField: A.confirmField === true,
    A_showToggles: A.typeBefore === "password" && A.toggled === true && A.typeAfter === "text",
    A_mismatchBlocks: A.mismatchMsg === true && Array.isArray(A.cfAfterMismatch) && A.cfAfterMismatch.length === 0,
    A_matchCallsCF: !!(A.cfAfterMatch && A.cfAfterMatch.length === 1 && A.cfAfterMatch[0].password === "abc123"),
    B_threeFields: !!(B.fields && B.fields.every(Boolean)),
    B_blocksNoCurrent: B.noCurrent === "✕ 現在のパスワードを入力してください",
    B_blocksMismatch: B.mismatch === "✕ 新しいパスワードが一致しません",
    B_blocksSame: B.same === "✕ 現在と同じパスワードです",
    B_noCFBeforeValid: Array.isArray(B.cfBefore) && B.cfBefore.length === 0,
    B_showToggles: !!(B.typesShown && B.typesShown.every(t => t === "text")),
    B_sendsCurrentAndNew: !!(B.cfAfter && B.cfAfter.length === 1 && B.cfAfter[0].currentPassword === "oldpw1" && B.cfAfter[0].newPassword === "newpw1" && B.cfAfter[0].companyId === CID),
    B_successToast: B.final === "✓ パスワードを変更しました",
    C_wrongCurrentShown: C.final === "✕ 現在のパスワードが正しくありません",
    noErrors: [A, B, C].every(x => x.errors.length === 0 && !x.exception),
  };
  v.allPass = Object.values(v).every(Boolean);
  console.log(JSON.stringify({ A, B, C, verdict: v }, null, 2));
  process.exit(v.allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
