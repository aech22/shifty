// メール確認つきの新規登録（2026-10-04・ユーザー指示「確認メールを送り、メールのリンクから登録を続ける」）の回帰テスト。
// アプリ全体をスタブ Firebase（auth:"accounts"・emailLink）で動かす。Firebase へは1バイトも出ない（メールも送らない。リンクはスタブの表に残る）。
//  S1（スタッフ・375px）: 募集URL → マイシフト → 新規登録 → アドレスだけ入れて送る →「メールを確認してください」（アドレス・直す・再送は30秒待ち）
//  S2（同じブラウザでリンクを開く）: 続きの登録（アドレスは入力済み）→ 登録ネーム・番号・パスワード → 登録 → oobCode を落とした募集URLに戻り、
//     マイシフトがスタッフアカウントで開く（印・profile・パスワード）。もう一度同じリンクを開くと「このリンクは使えません」
//  S3（別のブラウザ）: アドレスの入力を求める → 違うアドレスは理由を出す → 正しいアドレスで登録できる
//  S4（パスワードの設定に失敗）: サインインしたまま「パスワードの設定」になり、やり直すと終わる
//  S5（管理者用のアドレスでマイシフトに登録）: 断ってサインアウトし理由を出す
//  S6（期限切れのリンク）: 「このリンクは使えません」
//  S2・S7（2026-10-05）: 登録と同時に始めた画面のお店へリンクを申請（次の画面で「申請する」を押させない）。アクション URL を自前のドメインにした形
//     （?mode=signIn&oobCode=…&continueUrl=<戻り先>）でも管理者のログイン画面ではなく続きの登録になる
//  A1（管理者のログイン画面・320px）: メールアドレスで続ける → 新規登録 → 送る → リンク → パスワード → 管理者の実ログイン（印なし・AUTH_LOGGED_OUT_LS=false）
//  F（メールリンクが無効＝コンソール設定前）: 管理者のログイン画面でも従来の登録欄に切り替わり、そのまま作れる。ドメイン未承認でも同じ
//  すべての画面で横はみ出し 0・入力欄 16px 以上・console.error 0 件
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-email-link.js → allPass=true / EXIT=0
// 反証: SHIFTY_ROOT=<a47183e の配信物> node ... → EXIT≠0（送信の欄が無い）
"use strict";
const path = require("node:path");
const { openHarness, REPO_ROOT } = require(path.join(__dirname, "mount-component.js"));
const { makeStub } = require(path.join(__dirname, "stub-firebase.js"));
const ROOT = process.env.SHIFTY_ROOT || REPO_ROOT;
const SCRIPTS = ["app-utils.js", "app-my-utils.js", "app-core.js", "app-staff.js", "app-admin.js", "app-shift.js", "app-company.js", "app-my.js", "app-main.js"].map(src => ({ src, babel: !/utils|core/.test(src) }));
const seed = () => ({
  global: { shops: { S1: { id: "S1", name: "A店" } } },
  shops: { S1: { owners: { OWNER: "K1" }, private: { adminKey: "K1" }, staff: { 0: "田中", 1: "鈴木" },
    settings: { shopId: "S1", candidates: [{ start: "10:00", end: "15:00" }] },
    periods: { p1: { id: "p1", urlToken: "t1", shopId: "S1", label: "10月前半", startDate: "2026-10-16", endDate: "2026-10-18", deadlineDate: "", createdAt: "2026-09-01T00:00:00.000Z" } } } },
  tokens: { t1: { shopId: "S1", periodId: "p1" } },
  accounts: { S1: { plan: "free" }, ADM: { shops: { S1: true } } },
});
const USERS0 = { "admin@example.com": { uid: "ADM", password: "adminpass1" } };
// 最初の読み込みだけ URL を決める（以後の再読み込み・移動では書き換えない）
const urlHead = u => `<script>if(!sessionStorage.__urlSet){sessionStorage.__urlSet="1";history.replaceState(null,"",${JSON.stringify(u)});}</script>`;
const open = ({ url = "/", db, authSeed, viewport = { width: 375, height: 812 }, wait = "#root > *" }) => openHarness({ root: ROOT, jsx: "window.__harnessReady=true;", waitFor: wait, viewport,
  extraHead: urlHead(url) + makeStub({ seed: db || seed(), view: "staff", tab: "periods", auth: "accounts", authSeed: authSeed || { users: USERS0, cur: null, emailLink: "on" } }), scripts: SCRIPTS });
const sleep = (h, ms) => h.page.waitForTimeout(ms);
const waitSel = (h, s, ms = 15000) => h.page.waitForSelector(s, { timeout: ms }).then(() => true, () => false);
const click = (h, sel) => h.evaluate(sel => { const e = document.querySelector(sel); if (!e) return false; e.click(); return true; }, sel);
const msgs = h => h.evaluate(() => [...document.querySelectorAll("[data-my-msg]")].map(e => e.getAttribute("data-my-msg") + ":" + e.innerText.trim()).join("|"));
const layout = h => h.evaluate(() => ({ overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
  fonts: [...document.querySelectorAll("input,select,textarea")].filter(i => i.offsetParent).map(i => parseFloat(getComputedStyle(i).fontSize)) }));
const okLayout = L => L.overflow <= 0 && L.fonts.every(f => f >= 16);
const authCur = h => h.evaluate(() => window.__authCur());
const pathOf = u => { const x = new URL(u); return x.pathname + x.search + x.hash; };
async function staffSend(h, email) {
  await click(h, "[data-my-open]");
  await waitSel(h, '[data-my-auth="login"]');
  await click(h, '[data-my-mode="register"]');
  await waitSel(h, '[data-email-link-input="email"]');
  await h.setInput('[data-email-link-input="email"]', email);
  await click(h, '[data-email-link-action="send"]');
  return waitSel(h, '[data-email-link="sent"]', 8000);
}
async function fillFinish(h, f) {
  for (const [k, v] of Object.entries(f)) await h.setInput(`[data-email-link-finish] [data-my-input="${k}"]`, v);
  await click(h, '[data-email-link-action="finish"]');
}
(async () => {
  const R = {}, V = {};
  let landing = null, acc = null, dbDump = null, accUsed = null;
  // ---- S1・S2 ----
  {
    const h = await open({ url: "/#/s/t1", wait: "[data-my-open]" });
    try {
      const S = {};
      const L0 = await (async () => { await click(h, "[data-my-open]"); await waitSel(h, '[data-my-auth="login"]'); await click(h, '[data-my-mode="register"]'); await waitSel(h, '[data-email-link-input="email"]'); return layout(h); })();
      S.noPasswordFirst = await h.evaluate(() => !document.querySelector('[data-my-auth="register"] input[type="password"]'));
      await h.setInput('[data-email-link-input="email"]', "tanaka@example.com");
      await click(h, '[data-email-link-action="send"]');
      S.sent = await waitSel(h, '[data-email-link="sent"]', 8000);
      S.sentText = await h.evaluate(() => document.querySelector("[data-email-link-to]").innerText);
      S.resendWait = await h.evaluate(() => { const b = document.querySelector('[data-email-link-action="resend"]'); return b.disabled && /秒/.test(b.innerText); });
      S.sentLayout = await layout(h);
      S.sends = await h.evaluate(() => window.__linkSends);
      await click(h, '[data-email-link-action="edit"]');
      S.editKeeps = await h.evaluate(() => document.querySelector('[data-email-link-input="email"]').value === "tanaka@example.com");
      await click(h, '[data-email-link-action="send"]'); await waitSel(h, '[data-email-link="sent"]', 8000);
      S.pending = await h.evaluate(() => JSON.parse(localStorage.getItem("ots_emailLinkPending_v1") || "null"));
      landing = await h.evaluate(() => window.__emailLinkUrl());
      // 別のブラウザ用に、使う前の状態を残す
      acc = await h.evaluate(() => window.__authDump()); dbDump = await h.evaluate(() => window.__dbDump());
      // 同じブラウザでリンクを開く
      await h.page.goto(landing, { waitUntil: "networkidle" });
      S.finish = await waitSel(h, '[data-email-link-finish="form"][data-email-link-kind="staff"]');
      S.addressShown = await h.evaluate(() => (document.querySelector("[data-email-link-address]") || {}).innerText || "");
      S.noEmailInput = await h.evaluate(() => !document.querySelector('[data-email-link-finish] [data-my-input="email"]'));
      S.finishLayout = await layout(h);
      await fillFinish(h, { displayName: "田中", number: "０１２", password: "pass1234", password2: "pass1239" });
      S.mismatch = await msgs(h);
      await fillFinish(h, { password2: "pass1234" });
      await h.page.waitForFunction(() => !location.search && document.querySelector("[data-my-view]"), null, { timeout: 15000 }).catch(() => {});
      S.after = { url: await h.evaluate(() => location.href), myView: await h.evaluate(() => !!document.querySelector("[data-my-view]")) };
      const cur = await authCur(h);
      S.cur = cur;
      S.mark = await h.evaluate(() => JSON.parse(localStorage.getItem("ots_staffAccount_v1") || "null"));
      S.profile = cur ? await h.evaluate(u => window.__db(`users/${u}/profile`), cur.uid) : null;
      S.user = (await h.evaluate(() => window.__authDump().users))["tanaka@example.com"];
      S.pendingCleared = await h.evaluate(() => localStorage.getItem("ots_emailLinkPending_v1") === null);
      // 2026-10-05: 登録と同時に、始めた画面のお店（募集URL t1 → S1）にリンクを申請し、マイシフトに「申請しました」
      S.linkReq = cur ? await h.evaluate(u => window.__db(`shops/S1/linkRequests/${u}`), cur.uid) : null;
      await waitSel(h, '[data-my-link-requested="S1"]', 8000);
      S.requestedShown = await h.evaluate(() => { const e = document.querySelector('[data-my-link-requested="S1"]'); return e ? e.innerText : ""; });
      S.goLinksHidden = await h.evaluate(() => !document.querySelector('[data-my-action="goLinks"]'));
      accUsed = await h.evaluate(() => window.__authDump());
      S.errors = h.errors.slice();
      R.S = S;
      V.S1_sendFirst = okLayout(L0) && S.noPasswordFirst && S.sent && S.sentText.includes("tanaka@example.com") && S.resendWait && okLayout(S.sentLayout) && S.editKeeps;
      V.S1_continueUrl = S.sends.length >= 1 && /\?elk=staff&elh=%23%2Fs%2Ft1$/.test(S.sends[0].url) && !S.sends[0].url.includes("tanaka") && S.pending && S.pending.email === "tanaka@example.com" && S.pending.kind === "staff";
      V.S2_finishSameBrowser = S.finish && S.addressShown === "tanaka@example.com" && S.noEmailInput && okLayout(S.finishLayout) && /一致しません/.test(S.mismatch);
      V.S2_done = S.after.myView && /\/#\/me$/.test(S.after.url) /* マイシフトを開いている間は開き直せる URL（#/me）になる（d5822bc） */ && !/oobCode/.test(S.after.url) && cur && !cur.isAnonymous && cur.email === "tanaka@example.com" &&
        S.mark && S.mark.uid === cur.uid && S.profile && S.profile.displayName === "田中" && S.profile.number === "012" && S.user && S.user.password === "pass1234" && S.pendingCleared;
      V.S2_autoLinkRequest = !!S.linkReq && S.linkReq.displayName === "田中" && S.linkReq.number === "012" && /A店にリンクを申請しました/.test(S.requestedShown) && S.goLinksHidden;
      V.S_noErrors = S.errors.length === 0;
    } finally { await h.browser.close(); }
  }
  // ---- S3: 別のブラウザ（覚えたアドレス無し）・S4: パスワードの設定に失敗 ----
  {
    const h = await open({ url: pathOf(landing), db: dbDump, viewport: { width: 320, height: 700 }, wait: "[data-email-link-finish]",
      authSeed: { users: acc.users, links: acc.links, cur: null, emailLink: "on", failUpdatePassword: 1 } });
    try {
      const B = {};
      B.emailAsked = await h.evaluate(() => !!document.querySelector('[data-email-link-finish] [data-my-input="email"]'));
      B.layout = await layout(h);
      await fillFinish(h, { email: "other@example.com", displayName: "田中", password: "pass1234", password2: "pass1234" });
      await sleep(h, 400);
      B.wrong = await msgs(h);
      await fillFinish(h, { email: "tanaka@example.com" });
      B.pwStage = await waitSel(h, '[data-email-link-finish="password"]', 8000);
      B.pwMsg = await msgs(h);
      B.signedIn = await authCur(h);
      await fillFinish(h, { password: "pass5678", password2: "pass5678" });
      await h.page.waitForFunction(() => !location.search && document.querySelector("[data-my-view]"), null, { timeout: 15000 }).catch(() => {});
      B.done = await h.evaluate(() => ({ url: location.href, myView: !!document.querySelector("[data-my-view]") }));
      B.user = (await h.evaluate(() => window.__authDump().users))["tanaka@example.com"];
      B.errors = h.errors.slice();
      R.B = B;
      V.S3_otherBrowserAsksEmail = B.emailAsked && okLayout(B.layout) && /送ったアドレスと違います/.test(B.wrong);
      V.S4_passwordRetry = B.pwStage && /^error:/.test(B.pwMsg) && B.signedIn && !B.signedIn.isAnonymous;
      V.S3_done = B.done.myView && !/oobCode/.test(B.done.url) && B.user && B.user.password === "pass5678" && B.errors.length === 0;
    } finally { await h.browser.close(); }
  }
  // ---- S5: 管理者のアドレスでマイシフトに登録 ----
  {
    const links = [{ email: "admin@example.com", url: "http://shifty.test/?elk=staff&elh=%23%2Fs%2Ft1", oob: "OOBADMIN", used: false }];
    const h = await open({ url: "/?elk=staff&elh=%23%2Fs%2Ft1&apiKey=stub&oobCode=OOBADMIN&mode=signIn&lang=ja", wait: "[data-email-link-finish]",
      authSeed: { users: USERS0, links, cur: null, emailLink: "on" } });
    try {
      await fillFinish(h, { email: "admin@example.com", displayName: "田中", password: "pass1234", password2: "pass1234" });
      const stop = await waitSel(h, '[data-email-link-finish="stop"]', 8000);
      R.S5 = { stop, msg: await msgs(h), cur: await authCur(h), pw: (await h.evaluate(() => window.__authDump().users))["admin@example.com"].password, mark: await h.evaluate(() => localStorage.getItem("ots_staffAccount_v1")), errors: h.errors.slice() };
      V.S5_adminEmailRefused = stop && /店舗の管理用/.test(R.S5.msg) && !R.S5.cur && R.S5.pw === "adminpass1" && R.S5.mark === null && R.S5.errors.length === 0;
    } finally { await h.browser.close(); }
  }
  // ---- S2b: 使い終わったリンクを別のブラウザで開く ----
  {
    const h = await open({ url: pathOf(landing), db: dbDump, wait: "[data-email-link-finish]", authSeed: { users: accUsed.users, links: accUsed.links, cur: null, emailLink: "on" } });
    try {
      await fillFinish(h, { email: "tanaka@example.com", displayName: "田中", password: "pass1234", password2: "pass1234" });
      R.S2b = { bad: await waitSel(h, '[data-email-link-finish="bad"]', 8000), errors: h.errors.slice() };
      V.S2_usedLinkBad = R.S2b.bad && R.S2b.errors.length === 0;
    } finally { await h.browser.close(); }
  }
  // ---- S6: 期限切れ ----
  {
    const h = await open({ url: pathOf(landing), db: dbDump, wait: "[data-email-link-finish]", authSeed: { users: acc.users, links: acc.links, cur: null, emailLink: "on", expireLinks: true } });
    try {
      await fillFinish(h, { email: "tanaka@example.com", displayName: "田中", password: "pass1234", password2: "pass1234" });
      R.S6 = { bad: await waitSel(h, '[data-email-link-finish="bad"]', 8000), text: await h.evaluate(() => document.body.innerText), errors: h.errors.slice() };
      await click(h, '[data-email-link-action="leave"]');
      await h.page.waitForFunction(() => !location.search, null, { timeout: 8000 }).catch(() => {});
      R.S6.leftUrl = await h.evaluate(() => location.href);
      V.S6_expiredBad = R.S6.bad && /期限が切れているか/.test(R.S6.text) && /\/#\/s\/t1$/.test(R.S6.leftUrl) && R.S6.errors.length === 0;
    } finally { await h.browser.close(); }
  }
  // ---- S7（2026-10-05）: アクション URL を自前のドメインにした形（戻り先が continueUrl の中）でも、管理者のログイン画面ではなく続きの登録 ----
  {
    const links = [{ email: "sato@example.com", url: "http://shifty.test/?elk=staff&elh=%23%2Fs%2Ft1", oob: "OOBSATO", used: false }];
    const cont = encodeURIComponent("http://shifty.test/?elk=staff&elh=%23%2Fs%2Ft1");
    const h = await open({ url: `/?mode=signIn&oobCode=OOBSATO&apiKey=stub&continueUrl=${cont}&lang=ja`, wait: "#root > *",
      authSeed: { users: USERS0, links, cur: null, emailLink: "on" } });
    try {
      const C = {};
      C.finish = await waitSel(h, '[data-email-link-finish="form"][data-email-link-kind="staff"]', 10000);
      C.adminLogin = await h.evaluate(() => /Googleでログイン/.test(document.body.innerText));
      await fillFinish(h, { email: "sato@example.com", displayName: "鈴木", password: "pass1234", password2: "pass1234" });
      await h.page.waitForFunction(() => !location.search && document.querySelector("[data-my-view]"), null, { timeout: 15000 }).catch(() => {});
      C.url = await h.evaluate(() => location.href);
      const cur = await authCur(h);
      C.linkReq = cur ? await h.evaluate(u => window.__db(`shops/S1/linkRequests/${u}`), cur.uid) : null;
      C.errors = h.errors.slice();
      R.S7 = C;
      V.S7_customActionUrl = C.finish && !C.adminLogin && !/oobCode/.test(C.url) && !!C.linkReq && C.linkReq.displayName === "鈴木" && C.errors.length === 0;
    } finally { await h.browser.close(); }
  }
  // ---- A1: 管理者のログイン画面（320px） ----
  {
    const h = await open({ url: "/", viewport: { width: 320, height: 700 }, wait: "button" });
    try {
      const A = {};
      await h.clickExact("メールアドレスで続ける"); await sleep(h, 200);
      await h.clickExact("新規登録"); await sleep(h, 200);
      A.form = await waitSel(h, '[data-email-link="form"]');
      A.layout = await layout(h);
      await h.setInput('[data-email-link-input="email"]', "boss@example.com");
      await click(h, '[data-email-link-action="send"]');
      A.sent = await waitSel(h, '[data-email-link="sent"]', 8000);
      A.send = await h.evaluate(() => window.__linkSends.slice(-1)[0]);
      const u = await h.evaluate(() => window.__emailLinkUrl());
      await h.page.goto(u, { waitUntil: "networkidle" });
      A.finish = await waitSel(h, '[data-email-link-finish="form"][data-email-link-kind="admin"]');
      A.noProfile = await h.evaluate(() => !document.querySelector('[data-email-link-finish] [data-my-input="displayName"]'));
      A.finLayout = await layout(h);
      await fillFinish(h, { password: "abc123", password2: "abc123" });
      await h.page.waitForFunction(() => !location.search, null, { timeout: 15000 }).catch(() => {});
      await sleep(h, 800);
      A.cur = await authCur(h);
      A.loggedOutFlag = await h.evaluate(() => localStorage.getItem("ots_authLoggedOut_v1"));
      A.mark = await h.evaluate(() => localStorage.getItem("ots_staffAccount_v1"));
      A.user = (await h.evaluate(() => window.__authDump().users))["boss@example.com"];
      A.url = await h.evaluate(() => location.href);
      A.errors = h.errors.slice();
      R.A = A;
      V.A1_adminLinkFlow = A.form && okLayout(A.layout) && A.sent && /\?elk=admin$/.test(A.send.url) && A.finish && A.noProfile && okLayout(A.finLayout) &&
        A.cur && !A.cur.isAnonymous && A.cur.email === "boss@example.com" && A.loggedOutFlag === "false" && A.mark === null && A.user && A.user.password === "abc123" && !/oobCode/.test(A.url) && A.errors.length === 0;
    } finally { await h.browser.close(); }
  }
  // ---- F: メールリンクが無効・ドメイン未承認 → 管理者のログイン画面でも従来の登録 ----
  for (const mode of [undefined, "domain"]) {
    const h = await open({ url: "/", wait: "button", authSeed: { users: USERS0, cur: null, emailLink: mode } });
    try {
      await h.clickExact("メールアドレスで続ける"); await sleep(h, 200);
      await h.clickExact("新規登録"); await sleep(h, 200);
      await h.setInput('[data-email-link-input="email"]', "classic@example.com");
      await click(h, '[data-email-link-action="send"]');
      const fb = await waitSel(h, "[data-email-link-fallback]", 8000);
      const emailKept = await h.evaluate(() => document.querySelector('input[type="email"]').value);
      await h.setInput('input[placeholder="パスワード（6文字以上）"]', "abc123");
      await h.setInput('input[placeholder="パスワード（確認）"]', "abc123");
      await h.clickExact("アカウント作成");
      await sleep(h, 1200);
      const user = (await h.evaluate(() => window.__authDump().users))["classic@example.com"];
      const k = "F_" + (mode || "disabled");
      R[k] = { fb, emailKept, user, errors: h.errors.slice() };
      V[k + "_fallsBackToClassic"] = fb && emailKept === "classic@example.com" && !!user && user.password === "abc123" && R[k].errors.length === 0;
    } finally { await h.browser.close(); }
  }
  const allPass = Object.values(V).every(Boolean);
  console.log(JSON.stringify({ V, R, allPass }, null, 1));
  process.exit(allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
