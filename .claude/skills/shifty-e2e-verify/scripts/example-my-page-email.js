// 「自分専用のURLをなくしたとき」をマイシフトのアカウントに一本化した（2026-10-08 ユーザー指示「URLをなくしたとき用のメールアドレスを
// アカウント登録で解決・統一」）回帰テスト。以前（2026-10-05）は個別URLに任意のメールアドレスを登録し、なくしたら CF recoverPageUrl で送り直していた。
// アプリ全体をスタブ Firebase で動かす（Firebase へは1バイトも出ない）。CF の呼び出しはスタブの window.__cf で数える。
//  A: 個別URLの設定タブにメールアドレスの欄が無い（data-my-page-email・pageEmail の入力欄なし）。その位置に「アカウントに追加しておけば、URLをなくしても
//     メールアドレスとパスワードでログインして見られます」の案内（data-my-section="pageLost"）が「マイシフトのアカウントに追加」の下にあり、
//     個別URLのセクションは一番下のまま。setPageEmail を呼ばない
//  C: 募集URLの画面の「URLをなくした場合」: メールの入力欄が無く、「アカウントに追加済みなら マイシフト（#/me）からログイン／追加していなければ
//     お店の管理者に再発行を頼む」案内と「マイシフトにログインする」ボタン。押すと #/me のログイン画面が開く。recoverPageUrl を呼ばない
//  M: #/me のログイン画面の「自分専用のURLをなくした場合」も同じ案内（入力欄なし・この画面の上からログイン）
//  375px・320px で横はみ出し無し、console.error 0 件
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-my-page-email.js → allPass=true / EXIT=0
// 反証: SHIFTY_ROOT=<8d9ee98 の配信物> node ... → EXIT=1（メールアドレスの欄と送り直しの入力がある）
"use strict";
const path = require("node:path");
const { openHarness } = require(path.join(__dirname, "mount-component.js"));
const { makeStub } = require(path.join(__dirname, "stub-firebase.js"));
// 既定はこのスクリプトが置かれたチェックアウト（mount-component.js の REPO_ROOT は本体のパスに固定）
const ROOT = process.env.SHIFTY_ROOT || path.resolve(__dirname, "..", "..", "..", "..");
const SCRIPTS = ["app-utils.js", "app-my-utils.js", "app-core.js", "app-staff.js", "app-admin.js", "app-shift.js", "app-company.js", "app-my.js", "app-main.js"].map(src => ({ src, babel: !/utils|core/.test(src) }));
const PHONE = { width: 375, height: 812 };
const TOK = "AbCdEfGhIjKlMnOpQrStUvWx";
const pad = n => String(n).padStart(2, "0");
const now = new Date();
const YM = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
const LAST = `${YM}-${pad(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate())}`;
const seed0 = () => ({
  global: { shops: { S1: { id: "S1", name: "A店" } } },
  shops: { S1: { owners: { OWN: "K1" }, private: { adminKey: "K1" }, staff: ["田中", "佐藤"],
    settings: { shopId: "S1", candidates: [{ start: "10:00", end: "15:00" }] },
    periods: { p1: { id: "p1", urlToken: "t1", shopId: "S1", label: "今月", startDate: `${YM}-01`, endDate: LAST, deadlineDate: "", createdAt: "2026-09-01T00:00:00.000Z" } },
    staffPages: { [TOK]: { status: "approved", name: "田中", displayName: "田中", requestedAt: "2026-10-01T00:00:00.000Z", approvedAt: "2026-10-01T00:00:00.000Z" } } } },
  tokens: { t1: { shopId: "S1", periodId: "p1" } },
  staffPageTokens: { [TOK]: { shopId: "S1" } },
  accounts: { S1: { plan: "premium" } },
});
const urlHead = u => `<script>if(!sessionStorage.__urlSet){sessionStorage.__urlSet="1";history.replaceState(null,"",${JSON.stringify(u)});}</script>`;
const open = ({ url, wait }) => openHarness({ root: ROOT, jsx: "window.__harnessReady=true;", waitFor: wait, viewport: PHONE,
  extraHead: urlHead(url) + makeStub({ seed: seed0(), view: "staff", tab: "periods", auth: "accounts", authSeed: { users: {}, cur: null } }), scripts: SCRIPTS });
const sleep = (h, ms) => h.page.waitForTimeout(ms);
const waitSel = (h, s, ms = 15000) => h.page.waitForSelector(s, { timeout: ms }).then(() => true, () => false);
const click = (h, sel) => h.evaluate(sel => { const e = document.querySelector(sel); if (!e) return false; e.click(); return true; }, sel);
const overflowX = h => h.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
const cfCalls = h => h.evaluate(() => (window.__cf || []).map(c => c.name));
const noEmailCf = calls => !calls.some(n => n === "setPageEmail" || n === "recoverPageUrl");

(async () => {
  const R = {}, V = {};
  // ---------------- A: 個別URLの設定タブ ----------------
  {
    const h = await open({ url: "/#/m/" + TOK, wait: '[data-my-view="page"]' });
    try {
      const A = {};
      await click(h, '[data-my-tab="settings"]');
      A.lost = await waitSel(h, '[data-my-section="pageLost"]');
      await sleep(h, 600);
      A.secs = await h.evaluate(() => [...document.querySelectorAll("[data-my-section]")].map(s => s.getAttribute("data-my-section")));
      A.noEmailBox = await h.evaluate(() => !document.querySelector("[data-my-page-email]") && !document.querySelector('[data-my-input="pageEmail"]'));
      A.note = await h.evaluate(() => (document.querySelector('[data-my-section="pageLost"]') || {}).innerText || "");
      A.overflow = await overflowX(h);
      await h.page.setViewportSize({ width: 320, height: 700 });
      await sleep(h, 200);
      A.overflow320 = await overflowX(h);
      A.calls = await cfCalls(h);
      A.errors = h.errors.slice();
      R.A = A;
      const iAcc = A.secs.indexOf("pageAccount"), iLost = A.secs.indexOf("pageLost");
      V.A_noEmailBox = A.lost && A.noEmailBox;
      V.A_noteText = /アカウントに追加しておけば、URLをなくしてもメールアドレスとパスワードでログインして見られます/.test(A.note);
      V.A_order = iAcc >= 0 && iLost > iAcc && A.secs[A.secs.length - 1] === "page";
      V.A_noCf = noEmailCf(A.calls);
      V.A_layout = A.overflow <= 0 && A.overflow320 <= 0;
      V.A_noErrors = A.errors.length === 0;
    } finally { await h.browser.close(); }
  }
  // ---------------- C: 募集URLの画面の「なくした場合」 ----------------
  {
    const h = await open({ url: "/#/s/t1", wait: "[data-page-recover-open]" });
    try {
      const C = {};
      await click(h, "[data-page-recover-open]");
      C.screen = await waitSel(h, "[data-my-page-recover-screen]");
      C.text = await h.evaluate(() => (document.querySelector("[data-my-page-recover]") || {}).innerText || "");
      C.inputs = await h.evaluate(() => document.querySelectorAll("[data-my-page-recover-screen] input").length);
      C.overflow = await overflowX(h);
      await h.page.setViewportSize({ width: 320, height: 700 });
      await sleep(h, 200);
      C.overflow320 = await overflowX(h);
      C.calls = await cfCalls(h);
      // 「マイシフトにログインする」で #/me のログイン画面へ（search を変えた開き直し）
      await Promise.all([h.page.waitForNavigation({ timeout: 15000 }).catch(() => null), click(h, '[data-my-action="openAccount"]')]);
      C.toMe = await waitSel(h, '[data-my-auth="login"]');
      C.url = await h.evaluate(() => location.hash + "|" + location.search);
      C.errors = h.errors.slice();
      R.C = C;
      V.C_noInput = C.screen && C.inputs === 0;
      V.C_text = /アカウントに追加済みなら/.test(C.text) && /マイシフト/.test(C.text) && /お店の管理者にURLの再発行を頼んでください/.test(C.text);
      V.C_toMe = C.toMe && /^#\/me\|/.test(C.url);
      V.C_noCf = noEmailCf(C.calls);
      V.C_layout = C.overflow <= 0 && C.overflow320 <= 0;
      V.C_noErrors = C.errors.length === 0;
    } finally { await h.browser.close(); }
  }
  // ---------------- M: #/me のログイン画面の「なくした場合」 ----------------
  {
    const h = await open({ url: "/#/me", wait: '[data-my-auth="login"]' });
    try {
      const M = {};
      await h.evaluate(() => { const d = document.querySelector("[data-my-recover-details]"); if (d) d.open = true; });
      await sleep(h, 200);
      M.text = await h.evaluate(() => (document.querySelector("[data-my-recover-details] [data-my-page-recover]") || {}).innerText || "");
      M.inputs = await h.evaluate(() => document.querySelectorAll("[data-my-recover-details] input").length);
      M.noButton = await h.evaluate(() => !document.querySelector('[data-my-recover-details] [data-my-action="openAccount"]'));
      M.calls = await cfCalls(h);
      M.errors = h.errors.slice();
      R.M = M;
      V.M_guide = /この画面の上からログインしてください/.test(M.text) && /再発行/.test(M.text) && M.inputs === 0 && M.noButton && noEmailCf(M.calls) && M.errors.length === 0;
    } finally { await h.browser.close(); }
  }
  const allPass = Object.values(V).every(Boolean);
  console.log(JSON.stringify({ verdict: V, detail: R, allPass }, null, 1));
  process.exit(allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
