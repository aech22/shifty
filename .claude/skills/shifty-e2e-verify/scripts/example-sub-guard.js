// 提出の人単位の縛りと募集URLの受付期限（2026-10-08）の回帰テスト。スタブ Firebase・実ブラウザ。
//   P: 承認済みの個別URL（#/m/）を開いた端末は shops/S1/pageDevices/{uid} に {token} を登録し、そのあと提出できる
//   G: 縛りのある名前（nameGuards）の提出がルールに拒否されたら「本人専用のURL…」と出し、「提出完了」にしない（書き込みは拒否をスタブで再現）
//   E: 受付期限を過ぎた募集URL（tokens の読みが拒否される）を開くと「このURLの受付は終了しました」。管理者の画面に進まない
//   X: 期間の最終日を過ぎた募集URLの提出画面に「受付は終了しました」の帯
//   O: オーナーの端末: 承認済みの個別URLの名前に nameGuards を書く・期間に expiresAtMs を補う・tokens に expiresAtMs を書き直す・
//      期間管理タブで終わった期間の URL に「受付終了」
//   すべての場面で console.error・pageerror が 0 件。ルールそのものはスタブでは評価しない（dev の REST で別に実測する）
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-sub-guard.js → allPass=true / EXIT=0
// 反証: SHIFTY_ROOT=<2026-10-08 の変更前の配信物> で P・E・O が落ちる
"use strict";
const path = require("node:path");
const { openHarness, REPO_ROOT } = require(path.join(__dirname, "mount-component.js"));
const { makeStub } = require(path.join(__dirname, "stub-firebase.js"));
const ROOT = process.env.SHIFTY_ROOT || REPO_ROOT;
const SCRIPTS = ["app-utils.js", "app-my-utils.js", "app-core.js", "app-staff.js", "app-admin.js", "app-shift.js", "app-company.js", "app-my.js", "app-main.js"].map(src => ({ src, babel: !/utils|core/.test(src) }));
const PHONE = { width: 375, height: 812 };
const OWN = "OWN";
const T = "S".repeat(24);
const pad = n => String(n).padStart(2, "0");
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const now = new Date();
const TODAY = ymd(now);
const YM = TODAY.slice(0, 7);
const LAST = `${YM}-${pad(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate())}`;
const PAST_END = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
const PAST_START = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 15));
const jstNextDayMs = end => { const [y, m, d] = end.split("-").map(Number); return Date.UTC(y, m - 1, d + 1) - 9 * 3600000; };

const seed = (extra = {}) => ({
  global: { shops: { S1: { id: "S1", name: "A店" } } },
  shops: { S1: { owners: { [OWN]: "K1" }, private: { adminKey: "K1" }, staff: ["田中", "佐藤", "鈴木"],
    settings: { shopId: "S1", candidates: [{ start: "10:00", end: "15:00" }] },
    periods: {
      p1: { id: "p1", urlToken: "t1", shopId: "S1", label: "今月", startDate: `${YM}-01`, endDate: LAST, deadlineDate: "", createdAt: "2026-09-01T00:00:00.000Z" },
      p0: { id: "p0", urlToken: "t0", shopId: "S1", label: "前の期間", startDate: PAST_START, endDate: PAST_END, deadlineDate: "", createdAt: "2026-09-01T00:00:00.000Z" },
    },
    staffPages: { [T]: { status: "approved", name: "佐藤", displayName: "佐藤", requestedAt: "2026-10-01T00:00:00.000Z", approvedAt: "2026-10-01T00:00:00.000Z" } },
    ...(extra.shop || {}) } },
  staffPageTokens: { [T]: { shopId: "S1", at: "2026-10-01T00:00:00.000Z" } },
  tokens: { t1: { shopId: "S1", periodId: "p1" }, t0: { shopId: "S1", periodId: "p0" } },
  accounts: { S1: { plan: "premium" }, [OWN]: { shops: { S1: true } } },
});
const hashHead = h => `<script>history.replaceState(null,"","/${h}");</script>`;
async function openAnon({ hash, db, wait = "#root > *", denyRead, denyWrite }) {
  return openHarness({ root: ROOT, jsx: "window.__harnessReady=true;", waitFor: wait, viewport: PHONE,
    extraHead: hashHead(hash) + makeStub({ seed: db, view: "staff", tab: "periods", auth: "accounts", authSeed: { users: {}, cur: null }, denyRead, denyWrite }), scripts: SCRIPTS });
}
async function openOwner({ db, tab = "periods" }) {
  return openHarness({ root: ROOT, jsx: "window.__harnessReady=true;", waitFor: "#root > *", viewport: { width: 1200, height: 900 },
    extraHead: makeStub({ seed: db, uid: OWN, view: "admin", tab }), scripts: SCRIPTS });
}
const sleep = (h, ms) => h.page.waitForTimeout(ms);
const waitSel = (h, s, ms = 15000) => h.page.waitForSelector(s, { timeout: ms }).then(() => true, () => false);
const waitText = (h, t, ms = 15000) => h.page.waitForFunction(t => document.body.innerText.includes(t), t, { timeout: ms }).then(() => true, () => false);
const click = (h, sel) => h.evaluate(sel => { const e = document.querySelector(sel); if (!e) return false; e.click(); return true; }, sel);
const db = (h, p) => h.evaluate(p => window.__db(p), p);
const waitDb = async (h, p, pred, ms = 8000) => { const t0 = Date.now(); for (;;) { const v = await db(h, p); if (pred(v)) return v; if (Date.now() - t0 > ms) return v; await sleep(h, 200); } };
const submitAll = async h => {
  await click(h, '[data-my-tab="submit"]');
  await waitSel(h, "[data-staff-fixed-name]");
  await h.clickExact("全日程「通し」"); await sleep(h, 200);
  await h.clickExact("シフトを提出する"); await sleep(h, 300);
  await h.clickExact("提出する");
};

(async () => {
  const R = {}, V = {};
  // ---------------- P: 個別URLの端末の登録と提出 ----------------
  {
    const h = await openAnon({ hash: "#/m/" + T, db: seed(), wait: '[data-my-view="page"]' });
    try {
      const uid = await h.evaluate(() => window.__authCur().uid);
      const dev = await waitDb(h, `shops/S1/pageDevices/${uid}`, v => v && v.token);
      await submitAll(h);
      const done = await waitText(h, "提出完了", 8000);
      const subs = Object.values((await db(h, "shops/S1/subs")) || {}).filter(s => s.staffName === "佐藤");
      R.P = { uid, dev, done, subs: subs.length, errors: h.errors.slice() };
      V.P_deviceRegistered = !!dev && dev.token === T && typeof dev.at === "string";
      V.P_submitted = done && subs.length === 1;
      V.P_noErrors = R.P.errors.length === 0;
    } finally { await h.browser.close(); }
  }
  // ---------------- G: 縛りによる拒否の案内 ----------------
  {
    const h = await openAnon({ hash: "#/m/" + T, db: seed({ shop: { nameGuards: { 佐藤: true } } }), wait: '[data-my-view="page"]', denyWrite: ["shops/S1/subs"] });
    try {
      await submitAll(h);
      const msg = await waitText(h, "本人専用のURL", 8000);
      const done = await h.evaluate(() => document.body.innerText.includes("提出完了"));
      R.G = { msg, done, errors: h.errors.slice() };
      V.G_guardMessage = msg && !done;
      V.G_noErrors = R.G.errors.length === 0;
    } finally { await h.browser.close(); }
  }
  // ---------------- E: 期限切れの募集URL ----------------
  {
    const h = await openAnon({ hash: "#/s/t0", db: seed(), wait: "[data-staff-url-expired]", denyRead: ["tokens/t0"] });
    try {
      const shown = await waitSel(h, "[data-staff-url-expired]", 5000);
      const text = await h.evaluate(() => document.body.innerText);
      R.E = { shown, admin: /シフト作成|企業連携/.test(text), errors: h.errors.slice() };
      V.E_expiredScreen = shown && /このURLの受付は終了しました/.test(text) && !R.E.admin;
      V.E_noErrors = R.E.errors.length === 0;
    } finally { await h.browser.close(); }
  }
  // ---------------- X: 終わった期間の提出画面の帯 ----------------
  {
    const h = await openAnon({ hash: "#/s/t0", db: seed(), wait: "#root > *" });
    try {
      const banner = await waitSel(h, "[data-staff-expired]", 8000);
      R.X = { banner, errors: h.errors.slice() };
      V.X_banner = banner;
      V.X_noErrors = R.X.errors.length === 0;
    } finally { await h.browser.close(); }
  }
  // ---------------- O: オーナーの端末の補完 ----------------
  {
    const h = await openOwner({ db: seed() });
    try {
      const guards = await waitDb(h, "shops/S1/nameGuards", v => v && v["佐藤"] === true);
      const p0 = await waitDb(h, "shops/S1/periods/p0", v => v && v.expiresAtMs);
      const t0 = await waitDb(h, "tokens/t0", v => v && v.expiresAtMs);
      const label = await waitSel(h, "[data-period-url-expired]", 8000);
      const labels = await h.evaluate(() => document.querySelectorAll("[data-period-url-expired]").length);
      R.O = { guards, p0exp: p0 && p0.expiresAtMs, t0, label, labels, errors: h.errors.slice() };
      V.O_guardWritten = guards && guards["佐藤"] === true && guards["田中"] === undefined;
      V.O_periodExpiry = p0 && p0.expiresAtMs === jstNextDayMs(PAST_END);
      V.O_tokenExpiry = t0 && t0.expiresAtMs === jstNextDayMs(PAST_END) && t0.periodId === "p0";
      V.O_expiredLabelOnlyPast = label && labels === 1;
      V.O_noErrors = R.O.errors.length === 0;
    } finally { await h.browser.close(); }
  }
  V.allPass = Object.values(V).every(Boolean);
  console.log(JSON.stringify({ verdict: V, R }, null, 2));
  process.exit(V.allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
