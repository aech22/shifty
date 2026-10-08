// 提出タブの店舗の切り替え（2026-10-08 ユーザー指示）の回帰テスト。アプリ全体をスタブ Firebase で動かす（Firebase・Cloud Functions へは1バイトも出ない）。
// **セキュリティルールは評価しない**（縛りの拒否そのものは確かめられない。縛りがある名前で案内を出すことだけを測る）。
//
//  PG（個別URL #/m/）: 提出タブに「提出するお店」のプルダウン。候補は A店（個別URLの店舗）・D店（この端末で開いた別の店舗の個別URL）・C店（ヘルプ先）の順。
//     既定は A店で、名前は承認された「田中」。D店を選ぶと名前は D店の個別URLの「たなか」・D店の最新の期間へ提出され、提出の前にこの端末が
//     shops/S4/pageDevices/{uid} に D店の token で登録される。C店（ヘルプ先）を選ぶと名前は C店での登録名「田中一郎」・C店の最新の期間（n3）へ提出。
//     A店・C店の他の提出は変わらない（他店の書き込みは差分 update）
//  GD（縛りの案内）: C店に nameGuards/田中一郎 があると、C店を選んでも提出フォームを出さず「専用のURLを一度開いて」の案内
//  AC（メールのアカウント #/me）: 下部タブに「提出」。候補は A店（紐付け）・C店（ヘルプ先）。A店を選ぶと名前は紐付けの「田中」、C店へ提出できる。
//     案内にはアカウント用の1文（リンクの申請）が付く
//  すべての場面で console.error・pageerror が 0 件。375px で横はみ出し無し・入力欄 16px 以上
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-my-submit-switch.js → allPass=true / EXIT=0
// 反証: SHIFTY_ROOT=<99be503 の配信物> node ... → EXIT≠0（プルダウンもアカウントの提出タブも無い）
"use strict";
const path = require("node:path");
const { openHarness, REPO_ROOT } = require(path.join(__dirname, "mount-component.js"));
const { makeStub } = require(path.join(__dirname, "stub-firebase.js"));
const ROOT = process.env.SHIFTY_ROOT || REPO_ROOT;
const SCRIPTS = ["app-utils.js", "app-my-utils.js", "app-core.js", "app-staff.js", "app-admin.js", "app-shift.js", "app-company.js", "app-my.js", "app-main.js"].map(src => ({ src, babel: !/utils|core/.test(src) }));
const PHONE = { width: 375, height: 812 };
const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWx";
const TOKEN2 = "ZyXwVuTsRqPoNmLkJiHgFeDc";
const USERS = { "tanaka@example.com": { uid: "T1", password: "pass12345" } };
const T1 = { uid: "T1", isAnonymous: false, email: "tanaka@example.com" };
const pad = n => String(n).padStart(2, "0");
const now = new Date();
const TODAY = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const YM = TODAY.slice(0, 7);
const LAST = `${YM}-${pad(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate())}`;
const nx = new Date(now.getFullYear(), now.getMonth() + 1, 1);
const NYM = `${nx.getFullYear()}-${pad(nx.getMonth() + 1)}`;
const per = (id, sid, tok, extra) => ({ id, urlToken: tok, shopId: sid, label: "今月", startDate: `${YM}-01`, endDate: LAST, deadlineDate: "", createdAt: "2026-09-01T00:00:00.000Z", ...(extra || {}) });
const PUB = { published: { at: "2026-09-02T00:00:00.000Z", byUid: "OWN" } };
const CONF = { confirmation: { at: "2026-09-03T00:00:00.000Z", byUid: "OWN3" } };
const work = (s, e) => ({ status: "work", start: s, end: e });
const company = { id: "C1", name: "企業", entityId: "E1", kind: "shop", settings: {}, deadlines: {}, shops: { S1: "A店", S3: "C店" },
  people: { p_aaaaaaaa: { S1: "田中", S3: "田中一郎" } }, shopEntities: { S1: "E1", S3: "E1" }, syncedAt: "t" };
const seed0 = (opts = {}) => ({
  global: { shops: { S1: { id: "S1", name: "A店" }, S3: { id: "S3", name: "C店" }, S4: { id: "S4", name: "D店" } } },
  shops: {
    S1: { owners: { OWN: "K1" }, private: { adminKey: "K1" }, staff: ["田中", "佐藤"],
      settings: { shopId: "S1", candidates: [{ start: "10:00", end: "15:00" }] },
      periods: { p1: per("p1", "S1", "t1", PUB) },
      subs: { s1: { id: "s1", periodId: "p1", shopId: "S1", staffName: "佐藤", submittedAt: "2026-09-02T00:00:00Z", shifts: { [TODAY]: work("10:00", "15:00") } } },
      staffLinks: { T1: { name: "田中", method: "code", at: "2026-10-01T00:00:00.000Z" } },
      staffPages: { [TOKEN]: { status: "approved", displayName: "田中", name: "田中", requestedAt: "t", approvedAt: "2026-10-01T00:00:00.000Z", byUid: "OWN" } },
      company },
    S3: { owners: { OWN3: "K3" }, private: { adminKey: "K3" }, staff: ["田中一郎", "山田"],
      settings: { shopId: "S3", candidates: [{ start: "17:00", end: "22:00" }] },
      periods: { c1: per("c1", "S3", "t3", CONF), n3: per("n3", "S3", "t7", { label: "来月", startDate: `${NYM}-01`, endDate: `${NYM}-15` }) },
      subs: { v1: { id: "v1", periodId: "n3", shopId: "S3", staffName: "山田", submittedAt: "t", shifts: { [`${NYM}-01`]: work("17:00", "22:00") } } },
      ...(opts.guard ? { nameGuards: { "田中一郎": true } } : {}),
      company },
    S4: { owners: { OWN4: "K4" }, private: { adminKey: "K4" }, staff: ["たなか", "鈴木"], settings: { shopId: "S4", candidates: [{ start: "09:00", end: "13:00" }] },
      periods: { d1: per("d1", "S4", "t5", PUB) },
      subs: { w1: { id: "w1", periodId: "d1", shopId: "S4", staffName: "鈴木", submittedAt: "t", shifts: { [TODAY]: work("09:00", "13:00") } } },
      staffPages: { [TOKEN2]: { status: "approved", displayName: "たなか", name: "たなか", requestedAt: "t", approvedAt: "2026-10-01T00:00:00.000Z", byUid: "OWN4" } } },
  },
  staffPageTokens: { [TOKEN]: { shopId: "S1", at: "t" }, [TOKEN2]: { shopId: "S4", at: "t" } },
  tokens: { t1: { shopId: "S1", periodId: "p1" }, t3: { shopId: "S3", periodId: "c1" }, t5: { shopId: "S4", periodId: "d1" }, t7: { shopId: "S3", periodId: "n3" } },
  accounts: { S1: { plan: "premium" }, S3: { plan: "premium" }, S4: { plan: "premium" } },
  users: { T1: { profile: { displayName: "田中", updatedAt: "t" }, links: { S1: { name: "田中", at: "t" } } } },
});
const hashHead = h => `<script>history.replaceState(null,"","/${h}");</script>`;
const preLS = obj => `<script>${Object.entries(obj).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)},${JSON.stringify(v)});`).join("")}</script>`;
const sleep = (h, ms) => h.page.waitForTimeout(ms);
const waitSel = (h, s, ms = 15000) => h.page.waitForSelector(s, { timeout: ms }).then(() => true, () => false);
const waitText = (h, t, ms = 8000) => h.page.waitForFunction(t => document.body.innerText.includes(t), t, { timeout: ms }).then(() => true, () => false);
const click = (h, sel) => h.evaluate(sel => { const e = document.querySelector(sel); if (!e) return false; e.click(); return true; }, sel);
const db = (h, p) => h.evaluate(p => window.__db(p), p);
const overflowX = h => h.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
const inputFonts = h => h.evaluate(() => [...document.querySelectorAll("input,select,textarea")].map(e => parseFloat(getComputedStyle(e).fontSize)));
const setSelect = (h, sel, v) => h.evaluate(([sel, v]) => { const e = document.querySelector(sel); if (!e) return false;
  Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set.call(e, v); e.dispatchEvent(new Event("change", { bubbles: true })); return true; }, [sel, v]);
const options = h => h.evaluate(() => [...document.querySelectorAll("[data-my-submit-select] option")].map(o => [o.value, o.textContent]));
const fixedName = h => h.evaluate(() => { const e = document.querySelector("[data-staff-fixed-name]"); return e ? e.getAttribute("data-staff-fixed-name") : null; });
const waitOptions = (h, n) => h.page.waitForFunction(n => document.querySelectorAll("[data-my-submit-select] option").length >= n, n, { timeout: 15000 }).then(() => true, () => false);
const choose = async (h, sid, name) => { await setSelect(h, "[data-my-submit-select]", sid); return waitSel(h, `[data-staff-fixed-name="${name}"]`); };
const submitNow = async h => {
  if (!(await h.clickExact("全日程「通し」"))) return false;
  await sleep(h, 200);
  await h.clickExact("シフトを提出する"); await sleep(h, 300);
  await h.clickExact("提出する");
  return waitText(h, "提出完了", 8000);
};
const subsOf = async (h, sid) => Object.values((await db(h, `shops/${sid}/subs`)) || {});
const openPage = d => openHarness({ root: ROOT, jsx: "window.__harnessReady=true;", waitFor: '[data-my-view="page"]', viewport: PHONE,
  extraHead: hashHead("#/m/" + TOKEN) + preLS({ ots_myPageKnown_v1: JSON.stringify({ S1: { token: TOKEN, at: "t" }, S4: { token: TOKEN2, at: "t" } }) }) +
    makeStub({ seed: d, view: "staff", tab: "periods", auth: "accounts", authSeed: { users: {}, cur: null } }), scripts: SCRIPTS });
const openAccount = d => openHarness({ root: ROOT, jsx: "window.__harnessReady=true;", waitFor: "[data-my-tab]", viewport: PHONE,
  extraHead: hashHead("#/me") + preLS({ ots_staffAccount_v1: JSON.stringify({ uid: "T1" }) }) +
    makeStub({ seed: d, view: "staff", tab: "periods", auth: "accounts", authSeed: { users: USERS, cur: T1 } }), scripts: SCRIPTS });

(async () => {
  const R = {}, V = {};
  const errs = (k, h) => { R[k + "_errors"] = h.errors.slice(); return h.errors.length === 0; };
  // ---------------- PG: 個別URL ----------------
  {
    const h = await openPage(seed0());
    try {
      await click(h, '[data-my-tab="submit"]');
      const P = {};
      P.opts = (await waitOptions(h, 3)) ? await options(h) : await options(h);
      P.defaultName = (await waitSel(h, "[data-staff-fixed-name]")) ? await fixedName(h) : null;
      P.defaultShop = await h.evaluate(() => (document.querySelector("[data-my-submit]") || { getAttribute: () => null }).getAttribute("data-my-submit-shop"));
      P.overflow = await overflowX(h);
      P.fonts = await inputFonts(h);
      const s3Before = await db(h, "shops/S3/subs/v1");
      // D店（この端末で開いた別の店舗の個別URL）へ
      P.d = await choose(h, "S4", "たなか");
      P.dHead = await h.evaluate(() => document.body.innerText.includes("D店"));
      P.dDone = await submitNow(h);
      const s4 = await subsOf(h, "S4");
      P.dMine = s4.filter(x => x.staffName === "たなか");
      P.dOther = s4.find(x => x.id === "w1");
      const uid = await h.evaluate(() => firebase.auth().currentUser && firebase.auth().currentUser.uid);
      P.device = uid ? await db(h, `shops/S4/pageDevices/${uid}`) : null;
      // C店（ヘルプ先）へ
      P.c = await choose(h, "S3", "田中一郎");
      P.cDone = await submitNow(h);
      const s3 = await subsOf(h, "S3");
      P.cMine = s3.filter(x => x.staffName === "田中一郎");
      P.s3Other = s3.find(x => x.id === "v1");
      P.s1 = await subsOf(h, "S1");
      R.PG = P;
      V.PG_options = JSON.stringify(P.opts) === JSON.stringify([["S1", "A店"], ["S4", "D店"], ["S3", "C店（ヘルプ先）"]]);
      V.PG_defaultHome = P.defaultShop === "S1" && P.defaultName === "田中";
      V.PG_layout = P.overflow <= 0 && P.fonts.every(f => f >= 16);
      V.PG_pageShop = P.d && P.dHead && P.dDone && P.dMine.length === 1 && P.dMine[0].periodId === "d1" &&
        Object.values(P.dMine[0].shifts).some(x => x.status === "work") && !!P.dOther && P.device && P.device.token === TOKEN2;
      V.PG_helpShop = P.c && P.cDone && P.cMine.length === 1 && P.cMine[0].periodId === "n3" &&
        require("node:util").isDeepStrictEqual(P.s3Other, s3Before);
      V.PG_homeUntouched = P.s1.length === 1 && P.s1[0].id === "s1";
      V.PG_noErrors = errs("PG", h);
    } finally { await h.close(); }
  }
  // ---------------- GD: 縛りのあるヘルプ先は案内 ----------------
  {
    const h = await openPage(seed0({ guard: true }));
    try {
      await click(h, '[data-my-tab="submit"]');
      await waitOptions(h, 3);
      await setSelect(h, "[data-my-submit-select]", "S3");
      const G = {};
      G.guard = await waitSel(h, "[data-my-submit-guard]");
      G.text = await h.evaluate(() => (document.querySelector("[data-my-submit-guard]") || {}).innerText || "");
      G.form = await h.evaluate(() => !!document.querySelector("[data-staff-fixed-name]"));
      G.overflow = await overflowX(h);
      R.GD = G;
      V.GD_guide = G.guard && !G.form && /専用のURL/.test(G.text) && /C店/.test(G.text) && !/リンクを申請/.test(G.text) && G.overflow <= 0;
      V.GD_noErrors = errs("GD", h);
    } finally { await h.close(); }
  }
  // ---------------- AC: メールのアカウント ----------------
  {
    const h = await openAccount(seed0());
    try {
      const A = {};
      A.tabs = await h.evaluate(() => [...document.querySelectorAll("[data-my-tab]")].map(b => b.getAttribute("data-my-tab")));
      await click(h, '[data-my-tab="submit"]');
      A.opts = (await waitOptions(h, 2)) ? await options(h) : await options(h);
      A.defaultName = (await waitSel(h, "[data-staff-fixed-name]")) ? await fixedName(h) : null;
      A.overflow = await overflowX(h);
      A.fonts = await inputFonts(h);
      A.c = await choose(h, "S3", "田中一郎");
      A.cDone = await submitNow(h);
      A.cMine = (await subsOf(h, "S3")).filter(x => x.staffName === "田中一郎");
      R.AC = A;
      V.AC_tab = JSON.stringify(A.tabs) === JSON.stringify(["shift", "submit", "pay", "settings"]);
      V.AC_options = JSON.stringify(A.opts) === JSON.stringify([["S1", "A店"], ["S3", "C店（ヘルプ先）"]]) && A.defaultName === "田中";
      V.AC_layout = A.overflow <= 0 && A.fonts.every(f => f >= 16);
      V.AC_helpSubmit = A.c && A.cDone && A.cMine.length === 1 && A.cMine[0].periodId === "n3";
      V.AC_noErrors = errs("AC", h);
    } finally { await h.close(); }
    const h2 = await openAccount(seed0({ guard: true }));
    try {
      await click(h2, '[data-my-tab="submit"]');
      await waitOptions(h2, 2);
      await setSelect(h2, "[data-my-submit-select]", "S3");
      await waitSel(h2, "[data-my-submit-guard]");
      R.AC_guard = await h2.evaluate(() => (document.querySelector("[data-my-submit-guard]") || {}).innerText || "");
      V.AC_guardGuide = /専用のURL/.test(R.AC_guard) && /リンクを申請/.test(R.AC_guard);
      V.AC_noErrors2 = errs("AC2", h2);
    } finally { await h2.close(); }
  }
  const allPass = Object.values(V).every(Boolean);
  console.log(JSON.stringify({ verdict: { allPass, ...V }, R }, null, 1));
  process.exit(allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
