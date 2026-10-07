// 通知（Web Push・2026-10-08）の「この端末で受け取る」を実ブラウザで確かめる。
// 本物の App（app-main.js）をスタブ Firebase で動かし、Notification・PushManager・navigator.serviceWorker もスタブにする
// （購読は endpoint を localStorage に残すので、再読み込みをまたいで「受け取り中」が判定できる）。
//  P: スタッフ個別URL（#/m/<token>）の設定タブ → 「通知を受け取る」で staffPageData/{token}/push/{key} に記録（key は endpoint の SHA-256 の先頭32文字・uid なし）。
//     Service Worker は sw.js を scope "./" で登録し、applicationServerKey は 65 バイト。再読み込みで「受け取り中」。「通知を止める」で記録が消える
//  A: マイシフトのアカウント（#/me）の設定タブ → users/{uid}/push/{key}。止めると消える
//  D: 管理者の設定タブ（オーナーの端末）→ shops/{sid}/private/push/{key}（uid 付き）。止めると消える
//  X: オーナーでない端末（閲覧専用）には管理者のカードが出ない
//  N: 通知を拒否されたら記録しない・理由を出す
//  375px で横はみ出し無し・コンソールエラー0件
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-notify-optin.js → allPass=true / EXIT=0
//       （worktree で作業しているときは SHIFTY_ROOT=<worktree> を付ける。既定はリポジトリ本体）
// 反証: SHIFTY_ROOT=<通知を足す前の配信物> で回すと P の最初の項目で落ちる（EXIT=1）
"use strict";
const path = require("node:path");
const crypto = require("node:crypto");
const { openHarness, REPO_ROOT } = require(path.join(__dirname, "mount-component.js"));
const { makeStub } = require(path.join(__dirname, "stub-firebase.js"));
const ROOT = process.env.SHIFTY_ROOT || REPO_ROOT;
const SCRIPTS = ["app-utils.js", "app-my-utils.js", "app-core.js", "app-staff.js", "app-admin.js", "app-shift.js", "app-company.js", "app-my.js", "app-main.js"].map(src => ({ src, babel: !/utils|core/.test(src) }));
const PHONE = { width: 375, height: 812 };
const TOK = "AbCdEfGhIjKlMnOpQrStUvWx";
const pad = n => String(n).padStart(2, "0");
const now = new Date();
const YM = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
const LAST = `${YM}-${pad(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate())}`;
const keyOf = ep => crypto.createHash("sha256").update(ep).digest("hex").slice(0, 32);

const seed = (o = {}) => ({
  global: { shops: { S1: { id: "S1", name: "A店" } } },
  shops: { S1: { owners: o.owners || { U1: "K1" }, private: { adminKey: "K1" }, staff: ["田中", "佐藤"],
    settings: { shopId: "S1", candidates: [{ start: "10:00", end: "15:00" }] },
    periods: { p1: { id: "p1", urlToken: "t1", shopId: "S1", label: "今月", startDate: `${YM}-01`, endDate: LAST, deadlineDate: "", createdAt: "2026-09-01T00:00:00.000Z" } },
    staffPages: { [TOK]: { status: "approved", name: "田中", displayName: "田中", requestedAt: "2026-10-01T00:00:00.000Z", approvedAt: "2026-10-01T00:00:00.000Z" } },
    staffLinks: { T1: { name: "佐藤", method: "name", at: "2026-10-01T00:00:00.000Z" } } } },
  tokens: { t1: { shopId: "S1", periodId: "p1" } },
  staffPageTokens: { [TOK]: { shopId: "S1" } },
  accounts: { S1: { plan: "premium" }, U1: { shops: { S1: true } } },
  users: { T1: { profile: { displayName: "佐藤", updatedAt: "t" }, links: { S1: { name: "佐藤", at: "t" } } } },
});

// Notification・PushManager・navigator.serviceWorker のスタブ。http://shifty.test は安全なコンテキストではないので isSecureContext も true にする
const PUSH_STUB = `<script>
(function(){
  try{Object.defineProperty(window,"isSecureContext",{configurable:true,get:function(){return true;}});}catch(e){}
  var LS="__push_sub";
  var P=window.__push={subscribes:0,registers:0,perm:localStorage.getItem("__push_perm")||"default",nextPerm:localStorage.getItem("__push_next")||"granted"};
  function mk(ep,key){return{endpoint:ep,options:{applicationServerKey:key},
    toJSON:function(){return{endpoint:ep,expirationTime:null,keys:{p256dh:"BPkTestKey",auth:"AuTest"}};},
    unsubscribe:function(){localStorage.removeItem(LS);sub=null;return Promise.resolve(true);}};}
  var saved=localStorage.getItem(LS);
  var sub=saved?mk(saved,null):null;
  var pm={getSubscription:function(){return Promise.resolve(sub);},
    subscribe:function(o){P.subscribes++;P.keyLen=o&&o.applicationServerKey?o.applicationServerKey.length:0;P.userVisibleOnly=o&&o.userVisibleOnly;
      var ep="https://push.example/sub-"+Date.now();localStorage.setItem(LS,ep);sub=mk(ep,o.applicationServerKey.buffer);return Promise.resolve(sub);}};
  var reg={scope:location.origin+"/",pushManager:pm};
  var sw={register:function(u,o){P.registers++;P.swUrl=u;P.swScope=o&&o.scope;return Promise.resolve(reg);},
    getRegistration:function(){return Promise.resolve(localStorage.getItem(LS)?reg:undefined);}};
  Object.defineProperty(sw,"ready",{get:function(){return Promise.resolve(reg);}});
  try{Object.defineProperty(navigator,"serviceWorker",{configurable:true,get:function(){return sw;}});}catch(e){}
  window.PushManager=function(){};
  window.Notification=function(){};
  Object.defineProperty(window.Notification,"permission",{get:function(){return P.perm;}});
  window.Notification.requestPermission=function(){P.perm=P.nextPerm;localStorage.setItem("__push_perm",P.perm);return Promise.resolve(P.perm);};
})();
</script>`;
const hashHead = h => `<script>history.replaceState(null,"","/${h}");</script>`;
const preLS = obj => `<script>${Object.entries(obj).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)},${JSON.stringify(v)});`).join("")}</script>`;
const USERS = { "sato@example.com": { uid: "T1", password: "pass12345" } };
const T1 = { uid: "T1", isAnonymous: false, email: "sato@example.com" };

const openStaffPage = (db, extra = "") => openHarness({ root: ROOT, jsx: "window.__harnessReady=true;", waitFor: '[data-my-view="page"]', viewport: PHONE,
  extraHead: hashHead("#/m/" + TOK) + extra + PUSH_STUB + makeStub({ seed: db, view: "staff", tab: "periods", auth: "accounts", authSeed: { users: {}, cur: null } }), scripts: SCRIPTS });
const openAccount = db => openHarness({ root: ROOT, jsx: "window.__harnessReady=true;", waitFor: "[data-my-shift],[data-my-empty],[data-my-view]", viewport: PHONE,
  extraHead: hashHead("#/me") + preLS({ ots_staffAccount_v1: JSON.stringify({ uid: "T1" }) }) + PUSH_STUB +
    makeStub({ seed: db, view: "staff", tab: "periods", auth: "accounts", authSeed: { users: USERS, cur: T1 } }), scripts: SCRIPTS });
const openAdmin = (db, o = {}) => openHarness({ root: ROOT, jsx: "window.__harnessReady=true;", waitFor: o.wait || "[data-admin-push]", viewport: PHONE, timeout: o.timeout,
  extraHead: PUSH_STUB + makeStub({ seed: db, uid: "U1", view: "admin", tab: "settings", denyWrite: o.denyWrite }), scripts: SCRIPTS });

const sleep = (h, ms) => h.page.waitForTimeout(ms);
const waitSel = (h, s, ms = 15000) => h.page.waitForSelector(s, { timeout: ms }).then(() => true, () => false);
const click = (h, sel) => h.evaluate(sel => { const e = document.querySelector(sel); if (!e) return false; e.click(); return true; }, sel);
const overflowX = h => h.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
const db = (h, p) => h.evaluate(p => window.__db(p), p);
const pushInfo = h => h.evaluate(() => ({ ...window.__push, sub: localStorage.getItem("__push_sub") }));

(async () => {
  const R = {}, V = {};
  // ---------------- P: スタッフ個別URL ----------------
  {
    const h = await openStaffPage(seed());
    try {
      await click(h, '[data-my-tab="settings"]');
      const P = {};
      P.offShown = await waitSel(h, '[data-my-section="push"] [data-push-state="off"]');
      P.btn = await waitSel(h, '[data-push-action="on"]', 3000);
      await click(h, '[data-push-action="on"]');
      P.on = await waitSel(h, '[data-push-state="on"]');
      const info = await pushInfo(h);
      const node = (await db(h, `staffPageData/${TOK}/push`)) || {};
      const key = info.sub ? keyOf(info.sub) : "";
      P.info = info; P.keys = Object.keys(node);
      P.rec = node[key] || null;
      P.overflow = await overflowX(h);
      // 再読み込みで「受け取り中」を判定し直す
      await h.page.reload({ waitUntil: "networkidle" });
      await waitSel(h, '[data-my-view="page"]');
      await click(h, '[data-my-tab="settings"]');
      P.onAfterReload = await waitSel(h, '[data-push-state="on"]');
      await click(h, '[data-push-action="off"]');
      P.offAgain = await waitSel(h, '[data-push-state="off"]');
      await sleep(h, 200);
      P.afterOff = await db(h, `staffPageData/${TOK}/push`);
      P.subKept = !!(await pushInfo(h)).sub;
      P.errors = h.errors.slice();
      V.P = P;
      R.P_on = P.offShown && P.btn && P.on;
      R.P_record = P.keys.length === 1 && P.keys[0] === key && !!P.rec && P.rec.endpoint === info.sub && P.rec.keys.p256dh === "BPkTestKey" &&
        typeof P.rec.at === "string" && !("uid" in P.rec) && typeof P.rec.ua === "string";
      R.P_sw = info.swUrl === "sw.js" && info.swScope === "./" && info.keyLen === 65 && info.userVisibleOnly === true && info.subscribes === 1;
      R.P_reload = P.onAfterReload;
      R.P_off = P.offAgain && (P.afterOff == null || Object.keys(P.afterOff).length === 0) && P.subKept;
      R.P_noOverflow = P.overflow <= 0;
      R.P_noErrors = P.errors.length === 0;
    } finally { await h.close(); }
  }
  // ---------------- A: マイシフトのアカウント ----------------
  {
    const h = await openAccount(seed());
    try {
      const A = {};
      await click(h, '[data-my-tab="settings"]');
      A.off = await waitSel(h, '[data-my-section="push"] [data-push-state="off"]');
      await click(h, '[data-push-action="on"]');
      A.on = await waitSel(h, '[data-push-state="on"]');
      const info = await pushInfo(h);
      const node = (await db(h, "users/T1/push")) || {};
      A.keys = Object.keys(node);
      A.rec = node[keyOf(info.sub || "")] || null;
      await click(h, '[data-push-action="off"]');
      A.offAgain = await waitSel(h, '[data-push-state="off"]');
      await sleep(h, 200);
      A.afterOff = await db(h, "users/T1/push");
      A.overflow = await overflowX(h);
      A.errors = h.errors.slice();
      V.A = A;
      R.A_record = A.off && A.on && A.keys.length === 1 && !!A.rec && !("uid" in A.rec);
      R.A_off = A.offAgain && (A.afterOff == null || Object.keys(A.afterOff).length === 0);
      R.A_noOverflowNoErrors = A.overflow <= 0 && A.errors.length === 0;
    } finally { await h.close(); }
  }
  // ---------------- D: 管理者の設定タブ ----------------
  {
    const h = await openAdmin(seed());
    try {
      const D = {};
      D.off = await waitSel(h, '[data-admin-push] [data-push-state="off"]');
      D.text = await h.evaluate(() => (document.querySelector("[data-admin-push]") || {}).innerText || "");
      await click(h, '[data-admin-push] [data-push-action="on"]');
      D.on = await waitSel(h, '[data-admin-push] [data-push-state="on"]');
      const info = await pushInfo(h);
      const node = (await db(h, "shops/S1/private/push")) || {};
      D.keys = Object.keys(node);
      D.rec = node[keyOf(info.sub || "")] || null;
      await click(h, '[data-admin-push] [data-push-action="off"]');
      D.offAgain = await waitSel(h, '[data-admin-push] [data-push-state="off"]');
      await sleep(h, 200);
      D.afterOff = await db(h, "shops/S1/private/push");
      D.overflow = await overflowX(h);
      D.errors = h.errors.slice();
      V.D = D;
      R.D_record = D.off && D.on && D.keys.length === 1 && !!D.rec && D.rec.uid === "U1" && /提出・再提出/.test(D.text);
      R.D_off = D.offAgain && (D.afterOff == null || Object.keys(D.afterOff).length === 0);
      R.D_noOverflowNoErrors = D.overflow <= 0 && D.errors.length === 0;
    } finally { await h.close(); }
  }
  // ---------------- X: オーナーでない端末（閲覧専用）----------------
  {
    const h = await openAdmin(seed({ owners: { OTHER: "K1" } }), { wait: "#root > *", denyWrite: ["shops/S1/owners", "shops/S1/private"] });
    try {
      await sleep(h, 2500);
      const X = {};
      X.readOnlyBanner = await h.evaluate(() => /管理者として登録されていません|閲覧/.test(document.body.innerText));
      X.card = await h.evaluate(() => !!document.querySelector("[data-admin-push]"));
      V.X = X;
      R.X_hidden = X.readOnlyBanner && !X.card;
    } finally { await h.close(); }
  }
  // ---------------- N: 通知を拒否された ----------------
  {
    const h = await openStaffPage(seed(), preLS({ __push_next: "denied" }));
    try {
      await click(h, '[data-my-tab="settings"]');
      await waitSel(h, '[data-push-action="on"]');
      await click(h, '[data-push-action="on"]');
      await sleep(h, 500);
      const N = {};
      N.msg = await h.evaluate(() => { const e = document.querySelector('[data-my-section="push"] [data-my-msg="error"]'); return e ? e.innerText : ""; });
      N.state = await h.evaluate(() => (document.querySelector("[data-push-state]") || {}).getAttribute && document.querySelector("[data-push-state]").getAttribute("data-push-state"));
      N.node = await db(h, `staffPageData/${TOK}/push`);
      N.subscribes = (await pushInfo(h)).subscribes;
      N.errors = h.errors.slice();
      V.N = N;
      R.N_denied = /許可されませんでした/.test(N.msg) && N.state === "off" && N.node == null && N.subscribes === 0 && N.errors.length === 0;
    } finally { await h.close(); }
  }
  const allPass = Object.values(R).every(Boolean);
  console.log(JSON.stringify({ results: R, detail: V }, null, 1));
  console.log("allPass=" + allPass);
  process.exit(allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
