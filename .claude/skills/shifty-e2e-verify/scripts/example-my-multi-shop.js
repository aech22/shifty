// 掛け持ち（2026-10-05 ユーザー指示）の回帰テスト。アプリ全体をスタブ Firebase で動かす（Firebase・Cloud Functions へは1バイトも出ない）。
// Cloud Functions は stub-firebase.js の cfHandlers "pageLink" が functions/staff-link.js の planLinkStaffPage と
// functions/my-page.js の myPageAccessCF・planMyPagePin を通す（CF 本体は shifty-cf-verify の example-link-staff-page.js）。
//  N（375px）: A店とリンク済みのアカウントで B店の募集URL → マイシフト → 設定。申請の欄に「このお店の従業員番号」があり、
//     初期値は空（アカウントの番号＝A店の番号を出さない）。77 を入れて申請 → linkRequests の number が 77。申請中の表示に送った番号
//  H（375px・#/me）: リンク済みのお店があっても「掛け持ち先のお店を足すときは」の案内が出る
//  L（375px・#/m/ 未ログイン）: 設定に「マイシフトのアカウントに追加」と「ログイン・登録して追加する」→ 押すとログインの画面・
//     sessionStorage に戻り先の印
//  I（再読み込み後を再現）: 印があるとき設定タブから始まり、印は消える
//  A（375px・#/m/ ログイン済み・暗証番号なし）: 「このお店をアカウントに追加」→ staffLinks（method page）と users/links ができ、「追加済み」になる。
//     個別URLの本人のデータ（staffPageData）はアカウントに移らない
//  P（#/m/ ログイン済み・暗証番号あり）: 番号の欄が出る。誤りは理由を出しリンクしない／正しい番号でリンク
//  O（#/m/ ログイン済み・このお店に別の名前でリンク済み）: 追加のボタンを出さず理由
//  すべての場面で console.error・pageerror が 0 件・横はみ出し無し・入力欄 16px 以上
// 反証: SHIFTY_ROOT=<d781ac6 の配信物> → EXIT=1
"use strict";
const path = require("node:path");
const { openHarness, REPO_ROOT } = require(path.join(__dirname, "mount-component.js"));
const { makeStub } = require(path.join(__dirname, "stub-firebase.js"));
const ROOT = process.env.SHIFTY_ROOT || REPO_ROOT;
const SCRIPTS = ["app-utils.js", "app-my-utils.js", "app-core.js", "app-staff.js", "app-admin.js", "app-shift.js", "app-company.js", "app-my.js", "app-main.js"].map(src => ({ src, babel: !/utils|core/.test(src) }));
const THEME = `<style>*{box-sizing:border-box;margin:0;padding:0;}:root{--c-bg:#F0F2F5;--c-card:#FFFFFF;--c-input:#F3F4F6;--c-input2:#F0F2F5;` +
  `--c-border:#E5E7EB;--c-border2:#D1D5DB;--c-text:#1A1A2E;--c-text2:#374151;--c-text3:#6B7280;` +
  `--c-text4:#9CA3AF;--c-shadow:rgba(0,0,0,.06);--c-accent:#f87036;--c-danger:#DC2626;}input,select,textarea{font-size:16px;}</style>`;
const PHONE = { width: 375, height: 812 };
const TB = "B".repeat(24), TP = "P".repeat(24);
const USERS = { "tanaka@example.com": { uid: "T1", password: "pass12345" } };
const TANAKA = { uid: "T1", isAnonymous: false, email: "tanaka@example.com" };
const per = sid => ({ p1: { id: "p1", urlToken: "t" + sid, shopId: sid, label: "10月後半", startDate: "2026-10-16", endDate: "2026-10-31", deadlineDate: "", createdAt: "2026-09-01T00:00:00.000Z" } });
const ap = n => ({ status: "approved", name: n, displayName: n, requestedAt: "a", approvedAt: "2026-10-01T00:00:00.000Z" });
const seed0 = () => ({
  global: { shops: { SA: { id: "SA", name: "A店" }, SB: { id: "SB", name: "B店" } } },
  shops: {
    SA: { owners: { OWN: "K" }, staff: ["田中"], settings: { shopId: "SA", candidates: [], staffNumbers: { "田中": "012" } }, periods: per("SA"),
      staffLinks: { T1: { name: "田中", method: "number", at: "2026-10-01T00:00:00.000Z" } } },
    SB: { owners: { OWN2: "K" }, staff: ["たなか", "佐藤"], settings: { shopId: "SB", candidates: [], staffNumbers: { "たなか": "77" } }, periods: per("SB"),
      staffPages: { [TB]: ap("たなか"), [TP]: ap("佐藤") } },
  },
  tokens: { tSA: { shopId: "SA", periodId: "p1" }, tSB: { shopId: "SB", periodId: "p1" } },
  staffPageTokens: { [TB]: { shopId: "SB", at: "a" }, [TP]: { shopId: "SB", at: "a" } },
  staffPageData: { [TB]: { goals: { monthly: 123456, updatedAt: "a" } } },
  accounts: { SA: { plan: "premium" }, SB: { plan: "premium" } },
  users: { T1: { profile: { displayName: "たなか", number: "012", updatedAt: "t" }, links: { SA: { name: "田中", at: "2026-10-01T00:00:00.000Z" } } } },
});
const hashHead = h => `<script>history.replaceState(null,"","/${h}");</script>`;
const preLS = obj => `<script>${Object.entries(obj).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)},${JSON.stringify(v)});`).join("")}</script>`;
const preSS = obj => `<script>${Object.entries(obj).map(([k, v]) => `sessionStorage.setItem(${JSON.stringify(k)},${JSON.stringify(v)});`).join("")}</script>`;
const CFH = { linkStaffPage: "pageLink", myPagePin: "myPage" };
async function open({ hash, db, cur, wait, ss = {} }) {
  const head = hashHead(hash) + (cur ? preLS({ ots_staffAccount_v1: JSON.stringify({ uid: cur.uid }) }) : "") + preSS(ss) + THEME +
    makeStub({ seed: db, view: "staff", tab: "periods", auth: "accounts", authSeed: { users: USERS, cur }, cfHandlers: CFH });
  return openHarness({ root: ROOT, jsx: "window.__harnessReady=true;", waitFor: wait, viewport: PHONE, extraHead: head, scripts: SCRIPTS });
}
const waitSel = (h, s, ms = 15000) => h.page.waitForSelector(s, { timeout: ms }).then(() => true, () => false);
const waitText = (h, t, ms = 15000) => h.page.waitForFunction(t => document.body.innerText.includes(t), t, { timeout: ms }).then(() => true, () => false);
const click = (h, sel) => h.evaluate(sel => { const e = document.querySelector(sel); if (!e) return false; e.click(); return true; }, sel);
const db = (h, p) => h.evaluate(p => window.__db(p), p);
const attr = (h, sel, a) => h.evaluate(([s, a]) => { const e = document.querySelector(s); return e ? e.getAttribute(a) : null; }, [sel, a]);
const layout = h => h.evaluate(() => ({ over: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
  fonts: [...document.querySelectorAll("input,select,textarea")].map(i => parseFloat(getComputedStyle(i).fontSize)) }));
const typeInto = async (h, sel, v) => { await h.page.fill(sel, v); };
const layoutOk = L => L.over <= 0 && L.fonts.every(f => f >= 16);
const pageSettings = async h => { await waitSel(h, '[data-my-view="page"]'); await click(h, '[data-my-tab="settings"]'); return waitSel(h, '[data-my-section="pageAccount"]'); };

(async () => {
  const V = {}, R = {};
  // N: B店の募集URLから申請（お店ごとの番号）
  {
    const h = await open({ hash: "#/s/tSB", db: seed0(), cur: TANAKA, wait: "[data-my-open]" });
    try {
      await click(h, "[data-my-open]");
      await waitSel(h, "[data-my-view]");
      await click(h, '[data-my-tab="settings"]');
      await waitSel(h, '[data-my-link-apply="none"]');
      R.N_initial = await h.evaluate(() => (document.querySelector('[data-my-input="linkNumber"]') || {}).value);
      await typeInto(h, '[data-my-input="linkNumber"]', "７７");
      await click(h, '[data-my-action="apply"]');
      await waitSel(h, '[data-my-link-apply="pending"]');
      R.N_req = await db(h, "shops/SB/linkRequests/T1");
      R.N_sent = await h.evaluate(() => (document.querySelector("[data-my-link-req-sent]") || {}).innerText || "");
      R.N_profile = await db(h, "users/T1/profile/number");
      R.N_layout = await layout(h);
      V.N_numberField = R.N_initial === "";
      V.N_requestNumber = !!R.N_req && R.N_req.number === "77" && R.N_req.displayName === "たなか";
      V.N_sentShown = /77/.test(R.N_sent);
      V.N_profileUnchanged = R.N_profile === "012";
      V.N_layout = layoutOk(R.N_layout);
      V.N_noErrors = h.errors.length === 0; R.N_errors = h.errors.slice();
    } finally { await h.browser.close(); }
  }
  // H: #/me の案内
  {
    const h = await open({ hash: "#/me", db: seed0(), cur: TANAKA, wait: "[data-my-view]" });
    try {
      await click(h, '[data-my-tab="settings"]');
      V.H_howto = await waitText(h, "掛け持ち先のお店を足すときは");
      V.H_noErrors = h.errors.length === 0; R.H_errors = h.errors.slice();
    } finally { await h.browser.close(); }
  }
  // L: #/m/ 未ログイン
  {
    const h = await open({ hash: "#/m/" + TB, db: seed0(), cur: null, wait: '[data-my-view="page"]' });
    try {
      V.L_section = await pageSettings(h);
      R.L_state = await attr(h, '[data-my-section="pageAccount"]', "data-my-page-account");
      await click(h, '[data-my-action="pageAccountLogin"]');
      V.L_authScreen = await waitText(h, "アカウントは任意で");
      R.L_intent = await h.evaluate(() => sessionStorage.getItem("ss_myPageLinkIntent"));
      V.L_state = R.L_state === "login" && R.L_intent === TB;
      V.L_layout = layoutOk(await layout(h));
      V.L_noErrors = h.errors.length === 0; R.L_errors = h.errors.slice();
    } finally { await h.browser.close(); }
  }
  // I: 再読み込み後（印あり・ログイン済み）は設定タブから
  {
    const h = await open({ hash: "#/m/" + TB, db: seed0(), cur: TANAKA, wait: '[data-my-view="page"]', ss: { ss_myPageLinkIntent: TB } });
    try {
      V.I_settingsFirst = await waitSel(h, '[data-my-section="pageAccount"]', 8000);
      await h.page.waitForTimeout(300);
      R.I_intent = await h.evaluate(() => sessionStorage.getItem("ss_myPageLinkIntent"));
      V.I_intentCleared = R.I_intent === null;
      V.I_noErrors = h.errors.length === 0; R.I_errors = h.errors.slice();
    } finally { await h.browser.close(); }
  }
  // A: ログイン済み・暗証番号なし → 追加
  {
    const h = await open({ hash: "#/m/" + TB, db: seed0(), cur: TANAKA, wait: '[data-my-view="page"]' });
    try {
      await pageSettings(h);
      V.A_ready = await waitSel(h, '[data-my-page-account="ready"] [data-my-action="addPageToAccount"]:not([disabled])');
      R.A_pinField = await h.evaluate(() => !!document.querySelector('[data-my-input="pageAccountPin"]'));
      await click(h, '[data-my-action="addPageToAccount"]');
      V.A_linkedUi = await waitSel(h, '[data-my-page-account="linked"]');
      R.A_sl = await db(h, "shops/SB/staffLinks/T1"); R.A_ul = await db(h, "users/T1/links/SB"); R.A_ula = await db(h, "users/T1/links/SA");
      R.A_goals = await db(h, "users/T1/goals");
      V.A_written = !R.A_pinField && R.A_sl && R.A_sl.name === "たなか" && R.A_sl.method === "page" && R.A_ul && R.A_ul.name === "たなか" && !!R.A_ula;
      V.A_noDataCarried = R.A_goals == null;
      V.A_layout = layoutOk(await layout(h));
      V.A_noErrors = h.errors.length === 0; R.A_errors = h.errors.slice();
    } finally { await h.browser.close(); }
  }
  // P: 暗証番号あり
  {
    const d = seed0();
    // 本物と同じハッシュ（SHA-256(salt+pin) の16進＝app-utils.js の payCodeHash・index.js の payCodeHashCF）
    const salt = "0123456789abcdef0123456789abcdef";
    d.staffPagePins = { [TB]: { hash: require("node:crypto").createHash("sha256").update(salt + "2468").digest("hex"), salt, setAt: "b", fails: 0, lockedUntil: 0 } };
    const h = await open({ hash: "#/m/" + TB, db: d, cur: TANAKA, wait: '[data-my-view="page"]' });
    try {
      await pageSettings(h);
      V.P_pinField = await waitSel(h, '[data-my-input="pageAccountPin"]');
      await typeInto(h, '[data-my-input="pageAccountPin"]', "1111");
      await click(h, '[data-my-action="addPageToAccount"]');
      await waitSel(h, '[data-my-msg="error"]');
      R.P_err = await h.evaluate(() => (document.querySelector('[data-my-msg="error"]') || {}).innerText || "");
      R.P_slAfterWrong = await db(h, "shops/SB/staffLinks/T1");
      await typeInto(h, '[data-my-input="pageAccountPin"]', "2468");
      await click(h, '[data-my-action="addPageToAccount"]');
      V.P_linked = await waitSel(h, '[data-my-page-account="linked"]');
      V.P_wrongRejected = /暗証番号が正しくありません/.test(R.P_err) && R.P_slAfterWrong == null;
      V.P_noErrors = h.errors.length === 0; R.P_errors = h.errors.slice();
    } finally { await h.browser.close(); }
  }
  // O: このお店に別の名前でリンク済み
  {
    const d = seed0(); d.shops.SB.staffLinks = { T1: { name: "佐藤", method: "name", at: "a" } }; d.users.T1.links.SB = { name: "佐藤", at: "a" };
    const h = await open({ hash: "#/m/" + TB, db: d, cur: TANAKA, wait: '[data-my-view="page"]' });
    try {
      await pageSettings(h);
      V.O_other = await waitSel(h, '[data-my-page-account="other"]');
      V.O_noButton = !(await h.evaluate(() => !!document.querySelector('[data-my-action="addPageToAccount"]')));
      V.O_noErrors = h.errors.length === 0; R.O_errors = h.errors.slice();
    } finally { await h.browser.close(); }
  }
  const allPass = Object.values(V).every(Boolean);
  console.log(JSON.stringify({ verdict: { allPass, ...V }, detail: R }, null, 1));
  process.exit(allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
