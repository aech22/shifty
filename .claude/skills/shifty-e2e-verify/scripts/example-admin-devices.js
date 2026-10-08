// 管理端末の一覧・解除・管理コードの作り直し（2026-10-08・設定タブの「店舗管理コード」の下）の回帰テスト。
//
// 本物の index.html を丸ごと配信し（Firebase の CDN 5本だけ stub-firebase.js に差し替え）、スタブの ownerRules で
// database.rules.json の owners・private の規則を真似る。Firebase・Cloud Functions へは1バイトも出ない。375px で開く。
//   A. オーナーの端末（uid ME）の設定タブに一覧が出る: 4台・この端末が先頭で「この端末」・企業アカウントの印・この端末には解除が無い
//   B. 他の端末（OTHER2）の解除: 確認文に「作り直す」の案内、owners から消え 3台になる
//   C. 管理コードの作り直し: 確認文に外す台数（1台）と「新しい管理コードの入力が必要」、private/adminKey が新しくなり、
//      この端末の owners と localStorage の控え・画面の管理コードが新しいキーになる。OTHER1 は外れ、企業アカウントは残る
//   D. 企業アカウントの解除: 確認文に「企業連携タブのログイン」、owners から消える
//   E. 別の端末（匿名 uid・Cookie の店舗）: 古い管理コードでは登録できず、新しい管理コードで登録できる
//   F. 閲覧専用の端末（管理者でない）では一覧のカードを出さない
// すべてで console.error・pageerror が 0 件、カードは横にはみ出さない。
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-admin-devices.js → allPass=true / EXIT=0
// 反証: SHIFTY_ROOT=<変更前の配信物> だとカードが無く A から落ちる
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { REPO_ROOT, cdnLocalFile } = require(path.join(__dirname, "mount-component.js"));
const { makeStub } = require(path.join(__dirname, "stub-firebase.js"));
const ROOT = process.env.SHIFTY_ROOT || REPO_ROOT;

const PW_CANDIDATES = [
  path.join(process.env.HOME || "", ".claude/skills/rendered-contrast-check/node_modules/playwright-core"),
  path.join(process.env.HOME || "", ".claude/skills/shifty-e2e-verify/node_modules/playwright-core"),
  "playwright-core", "playwright",
];
const pw = (() => { for (const c of PW_CANDIDATES) { try { return require(c); } catch (e) { /* 次の候補 */ } } throw new Error("playwright-core が見つかりません"); })();
const MIME = { ".js": "application/javascript; charset=utf-8", ".html": "text/html; charset=utf-8", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };

const OLD = "K1OLDKEY_0123456789abcdef";
const seed = () => ({
  global: { shops: { S1: { id: "S1", name: "A店" } } },
  shops: { S1: { owners: { ME: OLD, OTHER1: OLD, OTHER2: OLD, company_C1: OLD }, private: { adminKey: OLD }, staff: { 0: "鈴木" },
    periods: { p1: { id: "p1", urlToken: "t1", shopId: "S1", label: "10月前半", startDate: "2026-10-01", endDate: "2026-10-15", deadlineDate: "", createdAt: "2026-09-01T00:00:00.000Z" } } } },
  tokens: { t1: { shopId: "S1", periodId: "p1" } },
  accounts: { S1: { plan: "premium" }, ME: { shops: { S1: true } } },
});

function servedIndexHtml(stubHead) {
  const raw = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const fbTag = /\s*<script src="https:\/\/www\.gstatic\.com\/firebasejs\/[^"]+"[^>]*><\/script>/g;
  let done = false;
  // スタブは window.confirm を常に true にする。確認文を記録するため、その後ろで包む
  const confirmSpy = `<script>(function(){var c=window.confirm;window.__confirms=[];window.confirm=function(m){window.__confirms.push(String(m));return c.call(window,m);};})();</script>`;
  return raw.replace(fbTag, () => { if (done) return ""; done = true; return "\n" + stubHead + "\n" + confirmSpy; });
}

async function open(browser, { stub, cookie, adminKeys, hash }) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  if (cookie) await context.addCookies([{ name: "ots_shopId", value: cookie, url: "http://shifty.test/" }]);
  if (adminKeys) await context.addInitScript(k => { try { localStorage.setItem("ots_adminKeys_v1", JSON.stringify(k)); } catch (e) { /* 無視 */ } }, adminKeys);
  const html = servedIndexHtml(stub);
  await context.route("**/*", route => {
    const u = new URL(route.request().url());
    if (/googletagmanager\.com|google-analytics\.com|posthog\.com/.test(u.hostname)) return route.fulfill({ status: 200, contentType: MIME[".js"], body: "" });
    if (u.hostname !== "shifty.test") {
      const local = cdnLocalFile(u);
      if (local) return route.fulfill({ contentType: MIME[".js"], body: fs.readFileSync(local) });
      return route.continue();
    }
    if (u.pathname === "/" || u.pathname === "/index.html") return route.fulfill({ contentType: MIME[".html"], body: html });
    const rel = decodeURIComponent(u.pathname).replace(/^\//, "");
    const f = path.join(ROOT, rel);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return route.fulfill({ status: 404, body: "not found" });
    return route.fulfill({ contentType: MIME[path.extname(f)] || "application/octet-stream", body: fs.readFileSync(f) });
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
  await page.goto("http://shifty.test/" + (hash || ""), { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  return { context, page, errors };
}
const db = (page, p) => page.evaluate(x => JSON.parse(JSON.stringify(window.__db(x) === undefined ? null : window.__db(x))), p);
const card = page => page.evaluate(() => {
  const root = document.querySelector("[data-admin-devices]");
  if (!root) return null;
  const rows = [...root.querySelectorAll("[data-admin-device]")].map(el => ({
    uid: el.getAttribute("data-admin-device"), me: el.hasAttribute("data-admin-device-me"), company: el.hasAttribute("data-admin-device-company"),
    text: el.innerText.replace(/\s+/g, " ").trim(), remove: !!el.querySelector("[data-admin-device-remove]"),
  }));
  const box = root.closest("div[style]");
  return { count: root.getAttribute("data-admin-devices"), rows, overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth), cardOverflow: box ? box.scrollWidth - box.clientWidth : 0 };
});
const waitCount = (page, n) => page.waitForFunction(x => { const r = document.querySelector("[data-admin-devices]"); return r && r.getAttribute("data-admin-devices") === x; }, String(n), { timeout: 8000 }).then(() => true, () => false);
const shownCode = page => page.evaluate(() => { const s = [...document.querySelectorAll("span")].find(x => /^S1\./.test(x.innerText.trim())); return s ? s.innerText.trim() : null; });
const lastConfirm = page => page.evaluate(() => window.__confirms[window.__confirms.length - 1] || "");
const textHas = (page, s, timeout = 8000) => page.waitForFunction(t => document.body.innerText.includes(t), s, { timeout }).then(() => true, () => false);
const gateTry = async (page, code) => {
  await page.fill("[data-admin-code-gate] input", code);
  await page.evaluate(() => [...document.querySelectorAll("[data-admin-code-gate] button")].find(b => b.innerText.trim() === "登録").click());
  await page.waitForTimeout(1000);
  return page.evaluate(() => ({ gate: !!document.querySelector("[data-admin-code-gate]"), admin: [...document.querySelectorAll("button")].some(b => b.innerText.trim() === "シフト作成"), msg: (document.querySelector("[data-admin-code-msg]") || {}).innerText || "" }));
};

(async () => {
  const R = {};
  const allErrors = [];
  const browser = await pw.chromium.launch({ headless: true });
  try {
    let dump = null, newKey = null;
    {
      const h = await open(browser, { stub: makeStub({ seed: seed(), uid: "ME", ownerRules: true, view: "admin", tab: "settings" }), adminKeys: { S1: OLD } });
      // A. 一覧
      const A = {};
      A.loaded = await waitCount(h.page, 4);
      A.card = await card(h.page);
      R.A = A;
      // B. 他の端末の解除
      const B = {};
      B.clicked = await h.page.evaluate(() => { const b = document.querySelector('[data-admin-device-remove="OTHER2"]'); if (!b) return false; b.click(); return true; });
      B.count3 = await waitCount(h.page, 3);
      B.confirm = await lastConfirm(h.page);
      B.owners = await db(h.page, "shops/S1/owners");
      R.B = B;
      // C. 管理コードの作り直し
      const C = {};
      C.codeBefore = await shownCode(h.page);
      C.clicked = await h.page.evaluate(() => { const b = document.querySelector("[data-admin-key-rotate]"); if (!b) return false; b.click(); return true; });
      C.count2 = await waitCount(h.page, 2);
      C.toast = await textHas(h.page, "管理コードを作り直し");
      C.confirm = await lastConfirm(h.page);
      newKey = await db(h.page, "shops/S1/private/adminKey");
      C.newKey = newKey;
      C.keyChanged = typeof newKey === "string" && newKey !== OLD && newKey.length === 32;
      C.owners = await db(h.page, "shops/S1/owners");
      C.lsKey = await h.page.evaluate(() => JSON.parse(localStorage.getItem("ots_adminKeys_v1") || "{}").S1);
      C.codeAfter = await shownCode(h.page);
      C.card = await card(h.page);
      R.C = C;
      // D. 企業アカウントの解除
      const D = {};
      D.clicked = await h.page.evaluate(() => { const b = document.querySelector('[data-admin-device-remove="company_C1"]'); if (!b) return false; b.click(); return true; });
      D.count1 = await waitCount(h.page, 1);
      D.confirm = await lastConfirm(h.page);
      D.owners = await db(h.page, "shops/S1/owners");
      R.D = D;
      dump = await h.page.evaluate(() => JSON.parse(JSON.stringify(window.__dbDump())));
      allErrors.push(...h.errors);
      await h.context.close();
    }
    // E. 別の端末: 古い管理コードでは登録できず、新しい管理コードで登録できる
    {
      const h = await open(browser, { stub: makeStub({ seed: dump, auth: "accounts", authSeed: { users: {}, cur: null }, ownerRules: true, view: "admin", tab: "settings" }), cookie: "S1", hash: "#/admin" });
      const E = {};
      E.gateShown = await h.page.evaluate(() => !!document.querySelector("[data-admin-code-gate]"));
      E.old = await gateTry(h.page, "S1." + OLD);
      E.neu = await gateTry(h.page, "S1." + newKey);
      E.ownersAfter = await db(h.page, "shops/S1/owners");
      // F. この端末は管理者になったので、設定タブにカードが出る（2台）
      E.cardAfter = await waitCount(h.page, 2);
      R.E = E;
      allErrors.push(...h.errors);
      await h.context.close();
    }
    // F. 閲覧専用の端末（管理キーを持たない・owners に無い）: 管理者画面に入れないのでカードも出ない。
    //    管理者画面の閲覧専用バナーの状態（ownerReadOnly）でも出さないことは、denyWrite で claim を失敗させて確かめる
    {
      const s = seed();
      const h = await open(browser, { stub: makeStub({ seed: s, uid: "ME", ownerRules: true, view: "admin", tab: "settings", denyWrite: ["shops/S1/owners"] }), adminKeys: { S1: "WRONGKEY_WRONGKEY_WRONGKEY_123" } });
      await h.page.waitForTimeout(800);
      R.F = { card: await h.page.evaluate(() => !!document.querySelector("[data-admin-devices]")), readOnlyBanner: await h.page.evaluate(() => document.body.innerText.includes("管理者として登録されていません")) };
      // denyWrite による拒否は console.warn（オーナー登録失敗）で出る。error は数える
      allErrors.push(...h.errors);
      await h.context.close();
    }
  } catch (e) {
    R.exception = e.stack || e.message;
  }
  await browser.close();
  R.errors = allErrors;
  const A = R.A || {}, B = R.B || {}, C = R.C || {}, D = R.D || {}, E = R.E || {}, F = R.F || {};
  const ac = A.card || { rows: [] };
  R.verdict = {
    A_list4: !!A.loaded && ac.rows.length === 4,
    A_meFirst: !!(ac.rows[0] && ac.rows[0].uid === "ME" && ac.rows[0].me && /この端末/.test(ac.rows[0].text) && !ac.rows[0].remove),
    A_companyMarked: ac.rows.some(r => r.uid === "company_C1" && r.company && /企業アカウント/.test(r.text) && r.remove),
    A_othersRemovable: ac.rows.filter(r => !r.me).every(r => r.remove),
    A_noOverflow: ac.overflow === 0 && ac.cardOverflow <= 0,
    B_removed: !!(B.count3 && B.owners && !("OTHER2" in B.owners) && "OTHER1" in B.owners),
    B_confirmMentionsRotate: /管理コードを作り直す/.test(B.confirm || ""),
    C_keyChanged: !!C.keyChanged,
    C_ownersKept: !!(C.owners && C.owners.ME === newKeyOf(R) && "company_C1" in C.owners && !("OTHER1" in C.owners) && Object.keys(C.owners).length === 2),
    C_localKey: C.lsKey === newKeyOf(R),
    C_shownCode: C.codeBefore === "S1." + OLD && C.codeAfter === "S1." + newKeyOf(R),
    C_confirm: /1台の登録を外します/.test(C.confirm || "") && /新しい管理コードの入力が必要/.test(C.confirm || ""),
    C_toast: !!C.toast,
    D_companyRemoved: !!(D.count1 && D.owners && Object.keys(D.owners).join() === "ME"),
    D_confirm: /企業連携タブのログイン/.test(D.confirm || ""),
    E_oldRejected: !!(E.gateShown && E.old && E.old.gate && !E.old.admin && E.old.msg),
    E_newAccepted: !!(E.neu && E.neu.admin && E.ownersAfter && Object.keys(E.ownersAfter).length === 2),
    E_cardAfter: !!E.cardAfter,
    F_noCardReadOnly: F.card === false,
    noErrors: allErrors.length === 0,
    noException: !R.exception,
  };
  function newKeyOf(r) { return r.C ? r.C.newKey : undefined; } // DB の private/adminKey（作り直した後）
  R.verdict.allPass = Object.values(R.verdict).every(Boolean);
  console.log(JSON.stringify(R, null, 2));
  process.exit(R.verdict.allPass ? 0 : 1);
})();
