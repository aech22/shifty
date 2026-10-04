// 従業員画面 E1（アカウントと入口）の回帰テスト（2026-10-04・Shifty_実装計画_2026-10.md 第2部）。
// アプリ全体をスタブ Firebase（stub-firebase.js の auth:"accounts"）で動かす。Firebase・Cloud Functions へは1バイトも出ない。
// **セキュリティルールは評価しない**。users/{uid} への書き込みは、スタブがルールの条件（本人・メールのある認証）を真似て通すだけ。
//
//  A（スタッフの端末・375px）: スタッフURL → アカウント無しで提出できる → 「マイシフト」→ 確認用パスワード違い・使用済みメールの
//     エラー → 登録（uid が変わらない・profile が書かれる・番号は半角）→ 設定タブ（メール表示・名前の保存・パスワード変更の誤り/成功・
//     再設定メール）→ 閉じても提出画面が残る → 再読み込みしてもスタッフアカウントのまま（accounts/{uid}/shops を読まない）→
//     ログアウトで匿名（新しい uid）に戻り、また提出できる。横はみ出し無し
//  B（別の端末）: A のサーバー状態で #/me を開く → 誤ったパスワードで「残りn回」→ 正しいパスワードで同じ uid・同じ登録ネーム
//  C（管理者の端末）: owners に載っている匿名 uid／管理キーを持つ端末では作れない（理由が出る・連結しない）
//  D（ルール未反映）: users/ への書き込みが拒否されても落ちない。連結は済み、設定タブに理由が出る
//  E（管理者ログイン画面の非回帰）: メールでのログインの誤り（残り9回・名前空間 email）と成功（店舗に入る）。スタッフ側の試行回数は増えない
//  G（管理者のアカウント）: accounts/{uid}/shops がある管理者のメールでマイシフトにログインすると、断って匿名に戻す（理由を出す）
//  F（本番相当）: MY_SCREEN_ENABLED=false（DEV_MODE=false）にすると「マイシフト」ボタンが出ない
//  すべての場面で console.error・pageerror が 0 件
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-my-account.js → allPass=true / EXIT=0
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { openHarness, REPO_ROOT } = require(path.join(__dirname, "mount-component.js"));
const { makeStub } = require(path.join(__dirname, "stub-firebase.js"));
const ROOT = process.env.SHIFTY_ROOT || REPO_ROOT;
const SCRIPTS = ["app-utils.js", "app-my-utils.js", "app-core.js", "app-staff.js", "app-admin.js", "app-shift.js", "app-company.js", "app-my.js", "app-main.js"].map(src => ({ src, babel: !/utils|core/.test(src) }));
// index.html と同じグローバル CSS（box-sizing を含む。ハーネスは index.html を読まないので自前で入れる）
const THEME = `<style>*{box-sizing:border-box;margin:0;padding:0;}:root{--c-bg:#F0F2F5;--c-card:#FFFFFF;--c-input:#F3F4F6;--c-input2:#F0F2F5;` +
  `--c-border:#E5E7EB;--c-border2:#D1D5DB;--c-text:#1A1A2E;--c-text2:#374151;--c-text3:#6B7280;` +
  `--c-text4:#9CA3AF;--c-shadow:rgba(0,0,0,.06);--c-accent:#f87036;--c-danger:#DC2626;}input,select,textarea{font-size:16px;}</style>`;
const PHONE = { width: 375, height: 812 };

const seed = () => ({
  global: { shops: { S1: { id: "S1", name: "A店" } } },
  shops: { S1: { owners: { OWNER: "K1" }, private: { adminKey: "K1" }, staff: { 0: "田中", 1: "鈴木" },
    settings: { shopId: "S1", candidates: [{ start: "10:00", end: "15:00" }] },
    periods: { p1: { id: "p1", urlToken: "t1", shopId: "S1", label: "10月前半", startDate: "2026-10-16", endDate: "2026-10-18", deadlineDate: "", createdAt: "2026-09-01T00:00:00.000Z" } } } },
  tokens: { t1: { shopId: "S1", periodId: "p1" } },
  accounts: { S1: { plan: "free" }, ADM: { shops: { S1: true } } },
});
const USERS0 = { "taken@example.com": { uid: "OTHER", password: "otherpass1" }, "admin@example.com": { uid: "ADM", password: "adminpass1" } };

// ハッシュは extraHead の先頭で入れる（parseUrl はアプリのファイルが読まれた直後に呼ばれる）
const hashHead = h => `<script>history.replaceState(null,"","/${h}");</script>`;
const preLS = obj => `<script>${Object.entries(obj).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)},${JSON.stringify(v)});`).join("")}</script>`;

async function open({ hash, seedDb, authSeed, denyWrite, ls, devMode = true, wait = "#root > *" }) {
  const head = hashHead(hash) + (ls ? preLS(ls) : "") + THEME +
    makeStub({ seed: seedDb || seed(), view: "staff", tab: "periods", auth: "accounts", authSeed: authSeed || { users: USERS0, cur: null }, denyWrite });
  let root = ROOT;
  if (!devMode) {
    // 本番相当: app-core.js の DEV_MODE だけを false にした写しで配信する（ほかのファイルは本物）
    root = fs.mkdtempSync(path.join(os.tmpdir(), "shifty-my-prod-"));
    for (const s of SCRIPTS) fs.copyFileSync(path.join(ROOT, s.src), path.join(root, s.src));
    const core = fs.readFileSync(path.join(ROOT, "app-core.js"), "utf8");
    const swapped = core.replace('const DEV_MODE = location.hostname !== "shiftyshifty.app";', "const DEV_MODE = false;");
    if (swapped === core) throw new Error("DEV_MODE の行が見つからない");
    fs.writeFileSync(path.join(root, "app-core.js"), swapped);
  }
  return openHarness({ root, jsx: "window.__harnessReady=true;", waitFor: wait, viewport: PHONE, extraHead: head, scripts: SCRIPTS });
}
const sleep = (h, ms) => h.page.waitForTimeout(ms);
const text = h => h.evaluate(() => document.body.innerText);
const waitText = (h, t, ms = 15000) => h.page.waitForFunction(t => document.body.innerText.includes(t), t, { timeout: ms }).then(() => true, () => false);
const waitSel = (h, s, ms = 15000) => h.page.waitForSelector(s, { timeout: ms }).then(() => true, () => false);
const click = (h, sel) => h.evaluate(sel => { const e = document.querySelector(sel); if (!e) return false; e.click(); return true; }, sel);
const clickText = (h, t) => h.evaluate(t => { const b = [...document.querySelectorAll("button")].find(x => x.innerText.trim() === t); if (!b) return false; b.click(); return true; }, t);
const myMsg = h => h.evaluate(() => [...document.querySelectorAll("[data-my-msg]")].map(e => e.getAttribute("data-my-msg") + ":" + e.innerText.trim()));
const setMy = (h, key, v) => h.setInput(`[data-my-input="${key}"]`, v);
const authCur = h => h.evaluate(() => window.__authCur());
const overflowX = h => h.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
const reloadPage = async h => { await h.page.reload({ waitUntil: "networkidle" }); await h.page.waitForSelector("#root > *", { timeout: 20000 }); await sleep(h, 600); };

// スタッフURLの画面で名前を入れて提出する（3.5節の手順。名前カード → 入力 → 確定 → 提出 → 確認の「提出する」）
async function submitAs(h, name) {
  // 同じ端末は氏名Cookieで前回の提出（提出完了の画面）を開き直す。別の名前で出すときは「最初から」に戻す
  if ((await text(h)).includes("提出完了")) { await clickText(h, "↺ 最初から"); await sleep(h, 300); }
  const opened = await h.evaluate(() => { const els = [...document.querySelectorAll("div")].filter(d => d.innerText.trim().startsWith("お名前を入力してください")); const el = els[els.length - 1]; if (!el) return false; el.click(); return true; });
  if (!opened) return "no-name-card";
  await sleep(h, 200);
  await h.setInput('input[placeholder="お名前を入力"]', name);
  await clickText(h, "確定");
  await sleep(h, 200);
  if (!(await clickText(h, "シフトを提出する"))) return "no-submit";
  await sleep(h, 300);
  if (!(await clickText(h, "提出する"))) return "no-confirm";
  return (await waitText(h, "提出完了")) ? "ok" : "no-done";
}
const subsOf = h => h.evaluate(() => Object.values(window.__db("shops/S1/subs") || {}));

(async () => {
  const R = {};
  const V = {};
  let dumpA = null, usersA = null, uid0 = null;
  // ---------------- A ----------------
  {
    const h = await open({ hash: "#/s/t1", wait: "[data-my-open]" });
    try {
      const A = {};
      A.myButton = await h.evaluate(() => !!document.querySelector("[data-my-open]"));
      const anon0 = await authCur(h);
      uid0 = anon0 && anon0.uid;
      A.anonAtStart = !!(anon0 && anon0.isAnonymous);
      A.submitNoAccount = await submitAs(h, "田中");
      const subs1 = await subsOf(h);
      A.subByAnon = subs1.some(s => s.staffName === "田中" && s.submitterUid === uid0);
      A.overflowStaff = await overflowX(h);
      // マイシフトを開く（提出画面は残る）
      await click(h, "[data-my-open]");
      A.authScreen = await waitSel(h, '[data-my-auth="login"]');
      await click(h, '[data-my-mode="register"]');
      await waitSel(h, '[data-my-auth="register"]');
      // 確認用パスワード違い
      await setMy(h, "displayName", "　田中 ");
      await setMy(h, "number", "０１２");
      await setMy(h, "email", "tanaka@example.com");
      await setMy(h, "password", "pass12345");
      await setMy(h, "password2", "pass12340");
      await click(h, '[data-my-action="submit"]'); await sleep(h, 500);
      A.mismatch = (await myMsg(h)).join("|");
      // 使用済みのメール
      await setMy(h, "email", "taken@example.com");
      await setMy(h, "password2", "pass12345");
      await click(h, '[data-my-action="submit"]'); await sleep(h, 600);
      A.taken = (await myMsg(h)).join("|");
      A.stillAnonAfterErrors = (await authCur(h)).isAnonymous === true;
      A.overflowAuth = await overflowX(h);
      // 登録
      await setMy(h, "email", "tanaka@example.com");
      await click(h, '[data-my-action="submit"]');
      A.myView = await waitSel(h, "[data-my-view]");
      const cur = await authCur(h);
      A.sameUid = cur.uid === uid0;
      A.linked = cur.isAnonymous === false && cur.email === "tanaka@example.com";
      A.profile = await h.evaluate(u => window.__db(`users/${u}/profile`), uid0);
      A.tokenRefreshed = (await h.evaluate(() => window.__tokenRefreshes || 0)) >= 1;
      A.mark = await h.evaluate(() => JSON.parse(localStorage.getItem("ots_staffAccount_v1") || "null"));
      A.tabs = await h.evaluate(() => [...document.querySelectorAll("[data-my-tab]")].map(b => b.innerText.trim()));
      A.emptyShift = await h.evaluate(() => !!document.querySelector("[data-my-empty]"));
      A.who = await h.evaluate(() => (document.querySelector("[data-my-who]") || {}).innerText || "");
      A.overflowMy = await overflowX(h);
      // 設定タブ
      await click(h, '[data-my-tab="settings"]'); await sleep(h, 300);
      A.emailShown = await h.evaluate(() => (document.querySelector("[data-my-email]") || {}).innerText || "");
      await setMy(h, "displayName", "田中 太郎");
      await click(h, '[data-my-action="saveProfile"]'); await sleep(h, 500);
      A.saveMsg = (await myMsg(h)).join("|");
      A.profile2 = await h.evaluate(u => window.__db(`users/${u}/profile`), uid0);
      await click(h, '[data-my-action="openPassword"]'); await sleep(h, 200);
      await setMy(h, "pwCurrent", "wrongpass1");
      await setMy(h, "pwNext", "newpass123");
      await setMy(h, "pwNext2", "newpass123");
      await click(h, '[data-my-action="changePassword"]'); await sleep(h, 500);
      A.pwWrong = (await myMsg(h)).join("|");
      await setMy(h, "pwCurrent", "pass12345");
      await click(h, '[data-my-action="changePassword"]'); await sleep(h, 500);
      A.pwOk = (await myMsg(h)).join("|");
      await click(h, '[data-my-action="sendReset"]'); await sleep(h, 500);
      A.resetMsg = (await myMsg(h)).join("|");
      A.resets = (await h.evaluate(() => window.__authDump().resets));
      A.overflowSettings = await overflowX(h);
      A.inputFonts = await h.evaluate(() => [...document.querySelectorAll("[data-my-view] input")].map(i => parseFloat(getComputedStyle(i).fontSize)));
      // 閉じると提出画面（提出完了の表示）が残っている
      await click(h, "[data-my-close]"); await sleep(h, 300);
      A.backToStaff = (await text(h)).includes("提出完了") && !(await h.evaluate(() => !!document.querySelector("[data-my-overlay]")));
      // 再読み込み: スタッフアカウントのまま。管理者の経路（accounts/{uid}/shops）を読まない
      await h.evaluate(() => { window.__reads = []; });
      await reloadPage(h);
      await waitSel(h, "[data-my-open]");
      A.afterReloadUid = (await authCur(h)).uid === uid0;
      A.readsAccounts = await h.evaluate(u => (window.__reads || []).filter(p => p.indexOf(`accounts/${u}`) >= 0), uid0);
      await click(h, "[data-my-open]");
      A.reloadMyView = await waitSel(h, "[data-my-view]");
      A.reloadWho = await waitText(h, "田中 太郎 さん");
      // 別端末の検証用にサーバーの状態を残す（ログアウトの前）
      dumpA = await h.evaluate(() => window.__dbDump());
      usersA = (await h.evaluate(() => window.__authDump())).users;
      // ログアウト → 匿名（別の uid）に戻り、また提出できる
      await click(h, '[data-my-tab="settings"]'); await sleep(h, 200);
      await click(h, '[data-my-action="logout"]');
      await h.page.waitForLoadState("networkidle"); await h.page.waitForSelector("#root > *", { timeout: 20000 }); await sleep(h, 800);
      const after = await authCur(h);
      A.logoutAnon = !!(after && after.isAnonymous && after.uid !== uid0);
      A.markCleared = await h.evaluate(() => localStorage.getItem("ots_staffAccount_v1") === null);
      A.logoutShowsStaff = await waitSel(h, "[data-my-open]") && !(await h.evaluate(() => !!document.querySelector("[data-my-overlay]")));
      A.submitAfterLogout = await submitAs(h, "鈴木");
      const subs2 = await subsOf(h);
      A.subAfterLogout = subs2.some(s => s.staffName === "鈴木" && s.submitterUid === after.uid);
      A.errors = h.errors.slice();
      R.A = A;
      V.A_button = A.myButton && A.anonAtStart;
      V.A_submitWithoutAccount = A.submitNoAccount === "ok" && A.subByAnon;
      V.A_errors = /確認用のパスワードが一致しません/.test(A.mismatch) && /このメールアドレスは既に使われています/.test(A.taken) && A.stillAnonAfterErrors;
      V.A_registerSameUid = A.myView && A.sameUid && A.linked && A.tokenRefreshed && !!A.mark && A.mark.uid === uid0;
      V.A_profile = !!A.profile && A.profile.displayName === "田中" && A.profile.number === "012" && typeof A.profile.updatedAt === "string";
      V.A_tabs = JSON.stringify(A.tabs) === JSON.stringify(["マイシフト", "給料", "設定"]) && A.emptyShift && A.who.includes("田中");
      V.A_settings = A.emailShown === "tanaka@example.com" && /保存しました/.test(A.saveMsg) && A.profile2 && A.profile2.displayName === "田中 太郎" && A.profile2.number === "012";
      V.A_password = /現在のパスワードが正しくありません/.test(A.pwWrong) && /パスワードを変更しました/.test(A.pwOk);
      V.A_reset = /再設定するメールを送りました/.test(A.resetMsg) && A.resets.includes("tanaka@example.com");
      V.A_closeKeepsStaff = A.backToStaff;
      V.A_reloadStaysStaff = A.afterReloadUid && A.readsAccounts.length === 0 && A.reloadMyView && A.reloadWho;
      V.A_logout = A.logoutAnon && A.markCleared && A.logoutShowsStaff && A.submitAfterLogout === "ok" && A.subAfterLogout;
      V.A_noOverflow375 = [A.overflowStaff, A.overflowAuth, A.overflowMy, A.overflowSettings].every(x => x <= 0);
      V.A_inputFont16 = A.inputFonts.length > 0 && A.inputFonts.every(x => x >= 16);
      V.A_noErrors = A.errors.length === 0;
    } catch (e) { R.A_exception = e.stack || e.message; V.A_noException = false; }
    await h.close();
  }
  // ---------------- B: 別の端末 ----------------
  {
    const h = await open({ hash: "#/me", seedDb: dumpA, authSeed: { users: usersA || {}, cur: null }, wait: '[data-my-auth="login"]' });
    try {
      const B = {};
      B.anonUid = (await authCur(h)).uid;
      await setMy(h, "email", "tanaka@example.com");
      await setMy(h, "password", "pass12345"); // 変更前のパスワード
      await click(h, '[data-my-action="submit"]'); await sleep(h, 600);
      B.wrong = (await myMsg(h)).join("|");
      B.staffAttempts = await h.evaluate(() => localStorage.getItem("ots_login_attempts_staff"));
      B.emailAttempts = await h.evaluate(() => localStorage.getItem("ots_login_attempts_email"));
      await setMy(h, "password", "newpass123");
      await click(h, '[data-my-action="submit"]');
      await h.page.waitForLoadState("networkidle");
      B.myView = await waitSel(h, "[data-my-view]", 20000);
      B.uid = (await authCur(h)).uid;
      B.who = await waitText(h, "田中 太郎 さん");
      B.noClose = await h.evaluate(() => !document.querySelector("[data-my-close]"));
      B.errors = h.errors.slice();
      R.B = B;
      V.B_otherDeviceSameUid = B.myView && B.uid === uid0 && B.uid !== B.anonUid && B.who && B.noClose;
      V.B_wrongPassword = /メールアドレスまたはパスワードが正しくありません（残り9回）/.test(B.wrong) && B.staffAttempts === "1" && B.emailAttempts === null;
      V.B_noErrors = B.errors.length === 0;
    } catch (e) { R.B_exception = e.stack || e.message; V.B_noException = false; }
    await h.close();
  }
  // ---------------- C: 管理者の端末 ----------------
  for (const [label, opts] of [
    ["owners", { seedDb: (() => { const s = seed(); s.shops.S1.owners.ANONOWNER = "K1"; return s; })(), authSeed: { users: USERS0, cur: { uid: "ANONOWNER", isAnonymous: true } } }],
    ["adminKey", { ls: { ots_adminKeys_v1: JSON.stringify({ S9: "K9" }) } }],
  ]) {
    const h = await open({ hash: "#/s/t1", wait: "[data-my-open]", ...opts });
    try {
      const C = {};
      await click(h, "[data-my-open]");
      C.blocked = await waitSel(h, '[data-my-blocked="owner"]');
      C.noForm = await h.evaluate(() => !document.querySelector('[data-my-action="submit"]'));
      C.stillAnon = (await authCur(h)).isAnonymous === true;
      C.errors = h.errors.slice();
      R["C_" + label] = C;
      V["C_" + label + "Blocked"] = C.blocked && C.noForm && C.stillAnon && C.errors.length === 0;
    } catch (e) { R["C_" + label + "_exception"] = e.stack || e.message; V["C_" + label + "NoException"] = false; }
    await h.close();
  }
  // ---------------- D: ルール未反映（users/ が拒否される） ----------------
  {
    const h = await open({ hash: "#/me", denyWrite: ["users"], wait: '[data-my-auth="login"]' });
    try {
      const D = {};
      D.uid0 = (await authCur(h)).uid;
      await click(h, '[data-my-mode="register"]'); await sleep(h, 200);
      await setMy(h, "displayName", "佐藤");
      await setMy(h, "email", "sato@example.com");
      await setMy(h, "password", "pass12345");
      await setMy(h, "password2", "pass12345");
      await click(h, '[data-my-action="submit"]');
      D.myView = await waitSel(h, "[data-my-view]", 20000);
      await sleep(h, 300);
      D.onSettings = await h.evaluate(() => !!document.querySelector('[data-my-section="profile"]'));
      D.msg = (await myMsg(h)).join("|");
      const cur = await authCur(h);
      D.linkedSameUid = cur.uid === D.uid0 && cur.isAnonymous === false;
      D.denied = await h.evaluate(() => (window.__denied || []).length);
      D.errors = h.errors.slice();
      R.D = D;
      V.D_rulesMissingGraceful = D.myView && D.onSettings && /サーバー側の設定が未反映/.test(D.msg) && D.linkedSameUid && D.denied >= 2 && D.errors.length === 0;
    } catch (e) { R.D_exception = e.stack || e.message; V.D_noException = false; }
    await h.close();
  }
  // ---------------- E: 管理者ログイン画面の非回帰 ----------------
  {
    const h = await open({ hash: "", wait: "button" });
    try {
      const E = {};
      E.loginScreen = await waitText(h, "メールアドレスで続ける");
      await clickText(h, "メールアドレスで続ける"); await sleep(h, 200);
      await h.setInput('input[placeholder="メールアドレス"]', "admin@example.com");
      await h.setInput('input[placeholder="パスワード（6文字以上）"]', "wrongpass");
      await clickText(h, "ログイン"); await sleep(h, 600);
      E.wrong = await waitText(h, "メールアドレスまたはパスワードが正しくありません（残り9回）", 5000);
      E.emailAttempts = await h.evaluate(() => localStorage.getItem("ots_login_attempts_email"));
      E.staffAttempts = await h.evaluate(() => localStorage.getItem("ots_login_attempts_staff"));
      await h.setInput('input[placeholder="パスワード（6文字以上）"]', "adminpass1");
      await clickText(h, "ログイン");
      E.enteredShop = await waitText(h, "管理者画面", 15000);
      E.uid = (await authCur(h)).uid;
      E.noMark = await h.evaluate(() => localStorage.getItem("ots_staffAccount_v1") === null);
      E.errors = h.errors.slice();
      R.E = E;
      V.E_adminLoginUnchanged = E.loginScreen && E.wrong && E.emailAttempts === "1" && E.staffAttempts === null && E.enteredShop && E.uid === "ADM" && E.noMark && E.errors.length === 0;
    } catch (e) { R.E_exception = e.stack || e.message; V.E_noException = false; }
    await h.close();
  }
  // ---------------- G: 管理者のメールアカウントではマイシフトにログインしない ----------------
  {
    const h = await open({ hash: "#/s/t1", wait: "[data-my-open]" });
    try {
      const G = {};
      await click(h, "[data-my-open]");
      await waitSel(h, '[data-my-auth="login"]');
      await setMy(h, "email", "admin@example.com");
      await setMy(h, "password", "adminpass1");
      await click(h, '[data-my-action="submit"]');
      await h.page.waitForLoadState("networkidle"); await sleep(h, 1500);
      G.notice = await waitText(h, "このメールアドレスは店舗の管理用のアカウントです", 15000);
      const cur = await authCur(h);
      G.backToAnon = !!(cur && cur.isAnonymous);
      G.noMark = await h.evaluate(() => localStorage.getItem("ots_staffAccount_v1") === null);
      G.errors = h.errors.slice();
      R.G = G;
      V.G_adminAccountRefused = G.notice && G.backToAnon && G.noMark && G.errors.length === 0;
    } catch (e) { R.G_exception = e.stack || e.message; V.G_noException = false; }
    await h.close();
  }
  // ---------------- F: 本番相当（DEV_MODE=false）では入口が出ない ----------------
  {
    const h = await open({ hash: "#/s/t1", devMode: false, wait: "button" });
    try {
      const F = {};
      F.staffShown = await waitText(h, "シフトを提出する");
      F.noButton = await h.evaluate(() => !document.querySelector("[data-my-open]"));
      F.errors = h.errors.slice();
      R.F = F;
      V.F_prodNoEntry = F.staffShown && F.noButton && F.errors.length === 0;
    } catch (e) { R.F_exception = e.stack || e.message; V.F_noException = false; }
    await h.close();
  }
  V.allPass = Object.values(V).every(Boolean);
  R.verdict = V;
  console.log(JSON.stringify(R, null, 2));
  process.exit(V.allPass ? 0 : 1);
})();
