// スタッフ個別URLの「URLをなくしたとき用のメールアドレス（任意）」を実ブラウザで確かめる（2026-10-05）。
// スタブ Firebase の cfHandlers "pageEmail" が functions/my-page.js の planSetPageEmailCF・planRecoverPageUrlCF をそのまま通し、
// 送ろうとしたメールを window.__mails に積む（実際には送らない）。
//  A: 個別URLの設定タブで登録 → 控えのメールが1通（宛先・本文に本番ドメインの個別URL）／伏せたアドレスだけ画面に出る／
//     アドレスは staffPageEmails に入り staffPageData・shops には入らない／個別URLのセクションが設定の一番下
//  B: 形の不正なアドレスは送らずに理由を出す
//  C: 募集URLの画面の「なくした場合」→ 登録済みのアドレスで1通・画面に URL を出さない／未登録のアドレスでも同じ文言で0通
//  D: 削除すると登録なしに戻り、送り直しても0通
//  375px・320px で横はみ出し無し、入力欄は 16px 以上
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-my-page-email.js → allPass=true / EXIT=0
// 反証: SHIFTY_ROOT=<9251272 の配信物> node ... → EXIT=1（登録欄が無い）
"use strict";
const path = require("node:path");
const { openHarness, REPO_ROOT } = require(path.join(__dirname, "mount-component.js"));
const { makeStub } = require(path.join(__dirname, "stub-firebase.js"));
const ROOT = process.env.SHIFTY_ROOT || REPO_ROOT;
const SCRIPTS = ["app-utils.js", "app-my-utils.js", "app-core.js", "app-staff.js", "app-admin.js", "app-shift.js", "app-company.js", "app-my.js", "app-main.js"].map(src => ({ src, babel: !/utils|core/.test(src) }));
const PHONE = { width: 375, height: 812 };
const TOK = "AbCdEfGhIjKlMnOpQrStUvWx";
const MAIL = "tanaka@example.com";
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
const hashHead = h => `<script>history.replaceState(null,"","/${h}");</script>`;
const open = ({ hash, db, wait }) => openHarness({ root: ROOT, jsx: "window.__harnessReady=true;", waitFor: wait, viewport: PHONE,
  extraHead: hashHead(hash) + makeStub({ seed: db, view: "staff", tab: "periods", auth: "accounts", authSeed: { users: {}, cur: null }, cfHandlers: { setPageEmail: "pageEmail", recoverPageUrl: "pageEmail" } }), scripts: SCRIPTS });
const sleep = (h, ms) => h.page.waitForTimeout(ms);
const waitSel = (h, s, ms = 15000) => h.page.waitForSelector(s, { timeout: ms }).then(() => true, () => false);
const click = (h, sel) => h.evaluate(sel => { const e = document.querySelector(sel); if (!e) return false; e.click(); return true; }, sel);
const overflowX = h => h.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
const inputFonts = h => h.evaluate(() => [...document.querySelectorAll("input,select,textarea")].filter(i => i.offsetParent).map(i => parseFloat(getComputedStyle(i).fontSize)));
const mails = h => h.evaluate(() => (window.__mails || []).map(m => ({ to: m.to, subject: m.subject || "", text: String(m.text || m.body || m.html || "") })));
const secState = h => h.evaluate(() => { const e = document.querySelector("[data-my-page-email]"); return e ? e.getAttribute("data-my-page-email") : null; });
const secText = h => h.evaluate(() => { const e = document.querySelector('[data-my-section="pageEmail"]'); return e ? e.innerText : ""; });

(async () => {
  const R = {}, V = {};
  let dump = null;
  // ---------------- A・B・D の前半: 個別URLの設定タブ ----------------
  {
    const h = await open({ hash: "#/m/" + TOK, db: seed0(), wait: '[data-my-view="page"]' });
    try {
      const A = {};
      await click(h, '[data-my-tab="settings"]');
      A.hasBox = await waitSel(h, '[data-my-page-email="none"]');
      A.lastSec = await h.evaluate(() => { const s = [...document.querySelectorAll("[data-my-section]")]; return s.length ? s[s.length - 1].getAttribute("data-my-section") : null; });
      A.overflow = await overflowX(h);
      A.fonts = await inputFonts(h);
      // B: 形の不正
      await h.setInput('[data-my-input="pageEmail"]', "tanaka-at-example");
      await click(h, '[data-my-action="savePageEmail"]');
      await sleep(h, 300);
      A.badText = await secText(h);
      A.badMails = (await mails(h)).length;
      // A: 登録
      await h.setInput('[data-my-input="pageEmail"]', MAIL);
      await click(h, '[data-my-action="savePageEmail"]');
      A.saved = await waitSel(h, '[data-my-page-email="set"]');
      await sleep(h, 300);
      A.text = await secText(h);
      A.mails = await mails(h);
      dump = await h.evaluate(() => window.__dbDump());
      A.rec = (dump.staffPageEmails || {})[TOK] || null;
      A.inPageData = JSON.stringify(dump.staffPageData || {}).includes(MAIL);
      A.inShops = JSON.stringify(dump.shops || {}).includes(MAIL);
      await h.page.setViewportSize({ width: 320, height: 700 });
      await sleep(h, 200);
      A.overflow320 = await overflowX(h);
      A.errors = h.errors.slice();
      R.A = A;
      const m = A.mails[0] || { to: "", text: "" };
      V.A_boxShown = A.hasBox;
      V.A_urlSectionLast = A.lastSec === "page";
      V.B_badRejected = /形が正しくありません/.test(A.badText) && A.badMails === 0;
      V.A_savedMasked = A.saved && !A.text.includes(MAIL) && /登録済み/.test(A.text) && /@/.test(A.text);
      V.A_oneMail = A.mails.length === 1 && m.to === MAIL && new RegExp("https://shiftyshifty\\.app/(\\?openExternalBrowser=1)?#/m/" + TOK).test(m.text);
      V.A_storedCfOnly = !!A.rec && !A.inPageData && !A.inShops;
      V.A_layout = A.overflow <= 0 && A.overflow320 <= 0 && A.fonts.length > 0 && A.fonts.every(f => f >= 16);
      V.A_noErrors = A.errors.length === 0;
    } finally { await h.browser.close(); }
  }
  // ---------------- C: 募集URLの画面の「なくした場合」 ----------------
  {
    const h = await open({ hash: "#/s/t1", db: dump, wait: "[data-page-recover-open]" });
    try {
      const C = {};
      await click(h, "[data-page-recover-open]");
      C.screen = await waitSel(h, "[data-my-page-recover-screen]");
      C.overflow = await overflowX(h);
      C.fonts = await inputFonts(h);
      await h.setInput('[data-my-input="recoverEmail"]', "nobody@example.com");
      await click(h, '[data-my-action="recoverPage"]');
      await sleep(h, 600);
      C.unknownText = await h.evaluate(() => document.querySelector("[data-my-page-recover]").innerText);
      C.unknownMails = (await mails(h)).length;
      await h.setInput('[data-my-input="recoverEmail"]', MAIL);
      await click(h, '[data-my-action="recoverPage"]');
      await sleep(h, 600);
      C.knownText = await h.evaluate(() => document.querySelector("[data-my-page-recover]").innerText);
      C.mails = await mails(h);
      C.urlOnScreen = await h.evaluate(t => document.body.innerText.includes(t), TOK);
      C.errors = h.errors.slice();
      R.C = C;
      const tail = s => (s.split("\n").filter(Boolean).pop() || "");
      const m = C.mails[0] || { to: "", text: "" };
      V.C_screen = C.screen && C.overflow <= 0 && C.fonts.length > 0 && C.fonts.every(f => f >= 16);
      V.C_unknownNoMail = C.unknownMails === 0 && /送りました/.test(C.unknownText);
      V.C_knownOneMail = C.mails.length === 1 && m.to === MAIL && new RegExp("https://shiftyshifty\\.app/(\\?openExternalBrowser=1)?#/m/" + TOK).test(m.text);
      V.C_sameMessage = tail(C.unknownText) === tail(C.knownText);
      V.C_urlNotShown = C.urlOnScreen === false;
      V.C_noErrors = C.errors.length === 0;
    } finally { await h.browser.close(); }
  }
  // ---------------- D: 削除 → 送り直しても届かない ----------------
  {
    const h = await open({ hash: "#/m/" + TOK, db: dump, wait: '[data-my-view="page"]' });
    try {
      const D = {};
      await h.evaluate(() => { window.confirm = () => true; });
      await click(h, '[data-my-tab="settings"]');
      D.set = await waitSel(h, '[data-my-page-email="set"]');
      await click(h, '[data-my-action="removePageEmail"]');
      D.none = await waitSel(h, '[data-my-page-email="none"]');
      const d = await h.evaluate(() => window.__dbDump());
      D.recGone = !((d.staffPageEmails || {})[TOK]);
      D.errors = h.errors.slice();
      R.D = D;
      V.D_removed = D.set && D.none && D.recGone;
      V.D_noErrors = D.errors.length === 0;
      dump = d;
    } finally { await h.browser.close(); }
  }
  {
    const h = await open({ hash: "#/s/t1", db: dump, wait: "[data-page-recover-open]" });
    try {
      await click(h, "[data-page-recover-open]");
      await waitSel(h, "[data-my-page-recover-screen]");
      await h.setInput('[data-my-input="recoverEmail"]', MAIL);
      await click(h, '[data-my-action="recoverPage"]');
      await sleep(h, 600);
      V.D_noMailAfterRemove = (await mails(h)).length === 0;
    } finally { await h.browser.close(); }
  }
  const allPass = Object.values(V).every(Boolean);
  console.log(JSON.stringify({ verdict: V, detail: R, allPass }, null, 1));
  process.exit(allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
