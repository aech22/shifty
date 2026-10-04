// 管理者がスタッフ専用のURL（個別URL）を直接発行する（2026-10-04・ユーザー指示「個人リンクコードは新規登録に繋がる URL の方が助かる」）の回帰テスト。
// アプリ全体をスタブ Firebase で動かす（Firebase・Cloud Functions へは1バイトも出ない。ルールは評価しない＝形は tests/my.test.js）。
//  I（オーナー・375px）: 佐藤の「編集」→「スタッフ専用のURL」→「このスタッフ専用のURLを発行」→ 承認済みの記録（name・byUid）と逆引きができ、
//     URL・コピーが出る。一覧の行に「URL」の印。横はみ出し無し・入力欄 16px 以上。個人リンクコードは「メールのアカウントとリンクする場合」の下
//  V（別の端末＝新しい匿名 uid・375px と 320px）: その URL を開くだけで佐藤の画面（名前・パスワードの入力なし）→ 最新期間に提出できる
//  RE（オーナー）: 「新しいURLを発行」（確認つき）→ 新しい URL ができ、前の URL は revoked → 前の URL を開くと「使えなくなりました」・新しい URL は開ける
//  RO（閲覧専用の端末＝owners に居ない uid）: 発行の UI が出ない
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-staff-page-issue.js → allPass=true / EXIT=0
// 反証: SHIFTY_ROOT=<f6a0804 の配信物> node ... → EXIT≠0（発行のボタンが無い）
"use strict";
const path = require("node:path");
const { openHarness, REPO_ROOT } = require(path.join(__dirname, "mount-component.js"));
const { makeStub } = require(path.join(__dirname, "stub-firebase.js"));
const ROOT = process.env.SHIFTY_ROOT || REPO_ROOT;
const SCRIPTS = ["app-utils.js", "app-my-utils.js", "app-core.js", "app-staff.js", "app-admin.js", "app-shift.js", "app-company.js", "app-my.js", "app-main.js"].map(src => ({ src, babel: !/utils|core/.test(src) }));
const OWN = "OWN";
const pad = n => String(n).padStart(2, "0");
const now = new Date();
const TODAY = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const YM = TODAY.slice(0, 7);
const LAST = `${YM}-${pad(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate())}`;
const seed0 = () => ({
  global: { shops: { S1: { id: "S1", name: "A店" } } },
  shops: { S1: { owners: { [OWN]: "K1" }, private: { adminKey: "K1" }, staff: ["田中", "佐藤", "鈴木"],
    settings: { shopId: "S1", candidates: [{ start: "10:00", end: "15:00" }] },
    periods: { p1: { id: "p1", urlToken: "t1", shopId: "S1", label: "今月", startDate: `${YM}-01`, endDate: LAST, deadlineDate: "", createdAt: "2026-09-01T00:00:00.000Z" } } } },
  tokens: { t1: { shopId: "S1", periodId: "p1" } },
  accounts: { S1: { plan: "premium" }, [OWN]: { shops: { S1: true } } },
});
const hashHead = h => `<script>history.replaceState(null,"","/${h}");</script>`;
const PHONE = { width: 375, height: 812 };
const openOwner = ({ db, uid = OWN, viewport = PHONE }) => openHarness({ root: ROOT, jsx: "window.__harnessReady=true;", waitFor: "#root > *", viewport,
  extraHead: makeStub({ seed: db, uid, view: "admin", tab: "staff" }), scripts: SCRIPTS });
const openAnon = ({ hash, db, viewport = PHONE, wait }) => openHarness({ root: ROOT, jsx: "window.__harnessReady=true;", waitFor: wait || "#root > *", viewport,
  extraHead: hashHead(hash) + makeStub({ seed: db, view: "staff", tab: "periods", auth: "accounts", authSeed: { users: {}, cur: null } }), scripts: SCRIPTS });
const sleep = (h, ms) => h.page.waitForTimeout(ms);
const waitSel = (h, s, ms = 15000) => h.page.waitForSelector(s, { timeout: ms }).then(() => true, () => false);
const waitText = (h, t, ms = 15000) => h.page.waitForFunction(t => document.body.innerText.includes(t), t, { timeout: ms }).then(() => true, () => false);
const click = (h, sel) => h.evaluate(sel => { const e = document.querySelector(sel); if (!e) return false; e.click(); return true; }, sel);
const db = (h, p) => h.evaluate(p => window.__db(p), p);
const overflowX = h => h.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
const inputFonts = h => h.evaluate(() => [...document.querySelectorAll("input,select,textarea")].filter(i => i.offsetParent).map(i => parseFloat(getComputedStyle(i).fontSize)));
const openEdit = async (h, n) => { const r = await h.clickExact("編集", { rowText: n }); await sleep(h, 300); return r; };
const pageState = h => h.evaluate(() => { const e = document.querySelector("[data-my-page-state]"); return e ? e.getAttribute("data-my-page-state") : (document.querySelector('[data-my-view="page"]') ? "view" : "none"); });

(async () => {
  const R = {}, V = {};
  let dump = seed0(), T1 = null, T2 = null;
  // ---- I: 発行 ----
  {
    const h = await openOwner({ db: dump });
    try {
      await waitText(h, "スタッフ一覧"); await sleep(h, 600);
      R.markBefore = await h.evaluate(() => !!document.querySelector('[data-staff-page-mark="佐藤"]'));
      await openEdit(h, "佐藤");
      const I = {};
      I.none = await waitSel(h, '[data-staff-page="none"]', 5000);
      I.order = await h.evaluate(() => { const t = document.body.innerText; const a = t.indexOf("スタッフ専用のURL"); return a >= 0 && !t.includes("個人リンクコード") && !document.querySelector('[data-staff-link-action="issue"]'); });
      await click(h, '[data-staff-page-action="issue"]');
      I.approved = await waitSel(h, '[data-staff-page="approved"]', 8000);
      T1 = await h.evaluate(() => (document.querySelector('[data-staff-page="approved"]') || { getAttribute: () => null }).getAttribute("data-staff-page-token"));
      I.url = await h.evaluate(() => (document.querySelector("[data-my-page-url]") || { getAttribute: () => "" }).getAttribute("data-my-page-url"));
      I.copyBtn = await h.evaluate(() => !!document.querySelector('[data-my-action="copyPageUrl"]'));
      I.rec = await db(h, `shops/S1/staffPages/${T1}`);
      I.tok = await db(h, `staffPageTokens/${T1}`);
      I.overflow = await overflowX(h); I.fonts = await inputFonts(h);
      await h.page.keyboard.press("Escape").catch(() => {});
      await h.clickExact("キャンセル").catch(() => {}); await h.clickExact("閉じる").catch(() => {});
      await sleep(h, 300);
      I.mark = await h.evaluate(() => !!document.querySelector('[data-staff-page-mark="佐藤"]'));
      I.errors = h.errors.slice();
      dump = await h.evaluate(() => window.__dbDump());
      R.I = I;
      V.I_issued = I.none && I.approved && /^[A-Za-z0-9]{24}$/.test(T1 || "") && I.url.endsWith("#/m/" + T1) && I.copyBtn &&
        I.rec && I.rec.status === "approved" && I.rec.name === "佐藤" && I.rec.byUid === OWN && I.rec.displayName === "佐藤" && I.tok && I.tok.shopId === "S1";
      V.I_codeBelowUrl = I.order;
      V.I_rowMark = !R.markBefore && I.mark;
      V.I_layout = I.overflow <= 0 && I.fonts.every(f => f >= 16);
      V.I_noErrors = I.errors.length === 0;
    } finally { await h.browser.close(); }
  }
  // ---- V: 別の端末で開くだけ → 提出 ----
  for (const width of [375, 320]) {
    const h = await openAnon({ hash: "#/m/" + T1, db: dump, viewport: { width, height: 760 }, wait: '[data-my-view="page"]' });
    try {
      const X = {};
      X.uid = await h.evaluate(() => window.__authCur().uid);
      X.noLogin = await h.evaluate(() => !document.querySelector('input[type="password"]'));
      await click(h, '[data-my-tab="submit"]');
      // 375px で提出したあとの 320px は「提出完了」の画面になる（佐藤の提出がある）
      X.fixed = width === 375 ? await waitSel(h, '[data-staff-fixed-name="佐藤"]') : await waitText(h, "提出完了", 8000);
      X.overflow = await overflowX(h); X.fonts = await inputFonts(h);
      if (width === 375) {
        await h.clickExact("全日程「通し」"); await sleep(h, 200);
        await h.clickExact("シフトを提出する"); await sleep(h, 300);
        await h.clickExact("提出する");
        X.done = await waitText(h, "提出完了", 8000);
        X.sato = Object.values((await db(h, "shops/S1/subs")) || {}).filter(s => s.staffName === "佐藤");
        dump = await h.evaluate(() => window.__dbDump());
      }
      X.errors = h.errors.slice();
      R["V" + width] = X;
      V["V" + width + "_opensAsStaff"] = X.uid !== OWN && X.noLogin && X.fixed && X.overflow <= 0 && X.fonts.every(f => f >= 16) && X.errors.length === 0;
      if (width === 375) V.V_submitted = X.done && X.sato.length === 1 && X.sato[0].periodId === "p1";
    } finally { await h.browser.close(); }
  }
  // ---- RE: 再発行 ----
  {
    const h = await openOwner({ db: dump, viewport: { width: 1200, height: 900 } });
    try {
      await waitText(h, "スタッフ一覧"); await sleep(h, 600);
      await openEdit(h, "佐藤");
      await waitSel(h, '[data-staff-page="approved"]');
      await click(h, '[data-staff-page-action="reissue"]');
      await h.page.waitForFunction(t => { const e = document.querySelector('[data-staff-page="approved"]'); return e && e.getAttribute("data-staff-page-token") !== t; }, T1, { timeout: 8000 }).catch(() => {});
      T2 = await h.evaluate(() => (document.querySelector('[data-staff-page="approved"]') || { getAttribute: () => null }).getAttribute("data-staff-page-token"));
      R.RE = { old: await db(h, `shops/S1/staffPages/${T1}`), neu: await db(h, `shops/S1/staffPages/${T2}`), errors: h.errors.slice() };
      dump = await h.evaluate(() => window.__dbDump());
      V.RE_reissued = !!T2 && T2 !== T1 && R.RE.old.status === "revoked" && typeof R.RE.old.revokedAt === "string" && R.RE.neu.status === "approved" && R.RE.neu.name === "佐藤" && R.RE.errors.length === 0;
    } finally { await h.browser.close(); }
  }
  for (const [k, t, want] of [["old", () => T1, "revoked"], ["new", () => T2, "view"]]) {
    const h = await openAnon({ hash: "#/m/" + t(), db: dump, wait: "[data-my-page-state],[data-my-view]" });
    try { await sleep(h, 400); R["RE_" + k] = { state: await pageState(h), errors: h.errors.slice() }; V["RE_" + k + "Url"] = R["RE_" + k].state === want && R["RE_" + k].errors.length === 0; }
    finally { await h.browser.close(); }
  }
  // ---- RO: 閲覧専用の端末 ----
  {
    const h = await openOwner({ db: dump, uid: "NOTOWN", viewport: { width: 1200, height: 900 } });
    try {
      await waitText(h, "スタッフ一覧"); await sleep(h, 600);
      await openEdit(h, "鈴木");
      R.RO = { ui: await h.evaluate(() => !!document.querySelector("[data-staff-page],[data-staff-page-action]")), mark: await h.evaluate(() => !!document.querySelector("[data-staff-page-mark]")), errors: h.errors.slice() };
      V.RO_noIssueUi = !R.RO.ui && !R.RO.mark;
    } finally { await h.browser.close(); }
  }
  const allPass = Object.values(V).every(Boolean);
  console.log(JSON.stringify({ V, R, allPass }, null, 1));
  process.exit(allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
