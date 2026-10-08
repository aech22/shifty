// 店舗IDだけでの読み取りの禁止（2026-10-08）を、本物の Firebase SDK（9.23.0 compat）と本物の database.rules.json で、
// 実ブラウザから確かめる。接続先は Firebase エミュレータ（auth と database）だけで、dev・本番には一切つながない。
//
// 場面:
//   A. スタッフURL（#/s/<token>）: 店舗のデータが出て、shops/{sid}/readers/{uid}/t が登録される
//   B. 店舗の Cookie だけの端末: 管理コードの入力画面が出て、ページから直接読んでも拒否される（global/shops の名前は読める）
//   D. B の続き: 入力画面に管理コードを入れると、購読を張り直して店舗のデータが出る
//   C. 管理キーを持つがまだオーナーでない端末: claim が通ったあと購読を張り直してデータが出る
//   E. 承認済みの個別URL（#/m/<token>）: 提出タブに期間が出て、readers/{uid}/p が登録される
//   F. 承認待ちの個別URLを開いたまま管理者が承認する: 読みの登録をやり直してデータが出る
//   G. 店長（S1 のオーナー）がシフト作成タブを開く: 同じ企業の S2 に readers/{uid}/o=S1 が登録され、S2 の提出が読める
//
// 実行:
//   1) エミュレータを起動: firebase emulators:start --only auth,database（database 9010・auth 9099）
//   2) SHIFTY_FB_SDK_DIR=<firebase@9.23.0 の node_modules/firebase> SHIFTY_CDN_DIR=<CDN の写し> node emu-e2e-shop-read.js
//      → allPass=true / EXIT=0。反証: SHIFTY_RULES=<変更前のルール> では B の「直接読むと拒否」が落ちる
"use strict";
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { REPO_ROOT, cdnLocalFile } = require(path.join(__dirname, "mount-component.js"));
const ROOT = process.env.SHIFTY_ROOT || (fs.existsSync(path.join(REPO_ROOT, "index.html")) ? REPO_ROOT : path.join(__dirname, "../../../.."));
const RULES = process.env.SHIFTY_RULES || path.join(ROOT, "database.rules.json");
const DB_PORT = +(process.env.EMU_DB_PORT || 9010);
const AUTH_PORT = +(process.env.EMU_AUTH_PORT || 9099);
const NS = "thirty-dev-b6958-default-rtdb"; // app-core.js の DEV の databaseURL と同じ名前空間（エミュレータの中だけ）
const SDK_DIR = process.env.SHIFTY_FB_SDK_DIR;
if (!SDK_DIR) { console.error("SHIFTY_FB_SDK_DIR（firebase@9.23.0 の node_modules/firebase）を指定してください"); process.exit(2); }

const PW_CANDIDATES = [
  path.join(process.env.HOME || "", ".claude/skills/shifty-e2e-verify/node_modules/playwright-core"),
  "playwright-core", "playwright",
];
const pw = (() => { for (const c of PW_CANDIDATES) { try { return require(c); } catch (e) { /* 次の候補 */ } } throw new Error("playwright-core が見つかりません"); })();
const MIME = { ".js": "application/javascript; charset=utf-8", ".html": "text/html; charset=utf-8", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };

const PT1 = "AAAAAAAAAAAAAAAAAAAAAAA1"; // 承認済み（24文字）
const PT2 = "BBBBBBBBBBBBBBBBBBBBBBB2"; // 承認待ち
const period = (id, token, sid) => ({ id, urlToken: token, shopId: sid, label: "10月前半", startDate: "2026-10-01", endDate: "2026-10-15",
  deadlineDate: "2026-12-31", createdAt: "2026-09-01T00:00:00.000Z" });
const seed = () => ({
  global: { shops: { S1: { id: "S1", name: "A店" }, S2: { id: "S2", name: "B店" } } },
  tokens: { T1: { shopId: "S1", periodId: "p1" }, T2: { shopId: "S2", periodId: "p2" } },
  staffPageTokens: { [PT1]: { shopId: "S1", at: "2026-10-01T00:00:00.000Z" }, [PT2]: { shopId: "S1", at: "2026-10-01T00:00:00.000Z" } },
  companies: { C1: { pub: { ownerUid: "CREATOR", name: "企業", shops: { S1: true, S2: true } } } },
  accounts: { S1: { plan: "premium" }, S2: { plan: "premium" } },
  shops: {
    S1: {
      owners: { OWN0: "K1" }, private: { adminKey: "K1" },
      staffPages: {
        [PT1]: { status: "approved", name: "田中", displayName: "田中", requestedAt: "2026-10-01T00:00:00.000Z", approvedAt: "2026-10-01T00:00:00.000Z", byUid: "OWN0" },
        [PT2]: { status: "pending", displayName: "鈴木", requestedAt: "2026-10-01T00:00:00.000Z" },
      },
      settings: { shopId: "S1" }, staff: ["田中", "鈴木"],
      periods: { p1: period("p1", "T1", "S1") },
      subs: { s1: { id: "s1", periodId: "p1", staffName: "田中", shopId: "S1", comment: "", submittedAt: "2026-09-20T00:00:00.000Z",
        shifts: { "2026-10-02": { status: "work", start: "09:00", end: "18:00" } } } },
      company: { id: "C1", name: "企業", shops: { S1: "A店", S2: "B店" }, settings: {}, syncedAt: "2026-10-01T00:00:00.000Z" },
    },
    S2: {
      owners: { OWN9: "K2" }, private: { adminKey: "K2" },
      settings: { shopId: "S2" }, staff: ["佐藤"],
      periods: { p2: period("p2", "T2", "S2") },
      subs: { s2: { id: "s2", periodId: "p2", staffName: "佐藤", shopId: "S2", comment: "", submittedAt: "2026-09-20T00:00:00.000Z",
        shifts: { "2026-10-03": { status: "work", start: "10:00", end: "15:00" } } } },
      company: { id: "C1", name: "企業", shops: { S1: "A店", S2: "B店" }, settings: {}, syncedAt: "2026-10-01T00:00:00.000Z" },
    },
  },
});

const rest = async (method, p, body) => {
  const r = await fetch(`http://127.0.0.1:${DB_PORT}/${p}.json?ns=${NS}`, {
    method, headers: { Authorization: "Bearer owner", "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!r.ok) throw new Error(`${method} ${p}: ${r.status} ${await r.text()}`);
  return r.json();
};

// ページは 127.0.0.1 に立てた http サーバーから配る（route で返したページからは 127.0.0.1 のエミュレータへ繋げない＝Private Network Access）。
// 本物の index.html から CSP の meta を外し（エミュレータの 127.0.0.1 を許可していないため・テストの中だけ）、
// Firebase の SDK の直後に「initializeApp の直後にエミュレータへ向ける」差し込みを足す
function servedIndexHtml() {
  let raw = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  raw = raw.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, "");
  const lastFb = /(<script src="https:\/\/www\.gstatic\.com\/firebasejs\/9\.23\.0\/firebase-app-check-compat\.js"[^>]*><\/script>)/;
  if (!lastFb.test(raw)) throw new Error("index.html の app-check の SDK が見つからない");
  const inject = `<script>(function(){var o=firebase.initializeApp.bind(firebase);firebase.initializeApp=function(c,n){var a=o(c,n);
    a.database().useEmulator("127.0.0.1",${DB_PORT});a.auth().useEmulator("http://127.0.0.1:${AUTH_PORT}",{disableWarnings:true});window.__emu=true;return a;};})();</script>`;
  return raw.replace(lastFb, `$1\n${inject}`);
}

let PAGE_PORT = 0;
function startServer() {
  const html = servedIndexHtml();
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, "http://127.0.0.1");
    if (u.pathname === "/" || u.pathname === "/index.html") { res.writeHead(200, { "content-type": MIME[".html"] }); return res.end(html); }
    const rel = decodeURIComponent(u.pathname).replace(/^\//, "");
    const f = path.join(ROOT, rel);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" });
    res.end(fs.readFileSync(f));
  });
  return new Promise(r => srv.listen(0, "127.0.0.1", () => { PAGE_PORT = srv.address().port; r(srv); }));
}

async function open(browser, hash, { cookieShop, adminKeys, viewAdmin } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  if (cookieShop) await context.addCookies([{ name: "ots_shopId", value: cookieShop, domain: "127.0.0.1", path: "/" }]);
  await context.addInitScript(({ adminKeys, viewAdmin }) => {
    try {
      if (adminKeys && !localStorage.getItem("ots_adminKeys_v1")) localStorage.setItem("ots_adminKeys_v1", JSON.stringify(adminKeys));
      if (viewAdmin) sessionStorage.setItem("ss_view", "admin");
    } catch (e) { /* 無視 */ }
  }, { adminKeys: adminKeys || null, viewAdmin: !!viewAdmin });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message + " @ " + String(e.stack || "").split("\n").slice(1, 4).join(" | ")));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
  await page.route("**/*", route => {
    const u = new URL(route.request().url());
    if (u.hostname === "127.0.0.1") return route.continue(); // ページ自身とエミュレータ
    if (/googletagmanager\.com|google-analytics\.com|posthog\.com/.test(u.hostname)) return route.fulfill({ status: 200, contentType: MIME[".js"], body: "" });
    if (u.hostname === "www.gstatic.com" && /^\/firebasejs\/9\.23\.0\//.test(u.pathname)) {
      const f = path.join(SDK_DIR, path.basename(u.pathname));
      return fs.existsSync(f) ? route.fulfill({ contentType: MIME[".js"], body: fs.readFileSync(f) }) : route.fulfill({ status: 404, body: "" });
    }
    const local = cdnLocalFile(u);
    if (local) return route.fulfill({ contentType: MIME[".js"], body: fs.readFileSync(local) });
    return route.continue();
  });
  await page.goto(`http://127.0.0.1:${PAGE_PORT}/` + (hash || ""), { waitUntil: "load" });
  return { context, page, errors };
}

const textHas = (page, s, timeout = 20000) =>
  page.waitForFunction(t => document.body.innerText.includes(t), s, { timeout }).then(() => true, () => false);
const uidOf = page => page.waitForFunction(() => { try { return window.__emu && firebase.apps.length && firebase.auth().currentUser && firebase.auth().currentUser.uid; } catch (e) { return false; } }, null, { timeout: 20000 })
  .then(h => h.jsonValue(), () => null);
const directRead = (page, p) => page.evaluate(p => firebase.database().ref(p).once("value").then(() => "ok", e => String(e && (e.code || e.message))), p);
const clickExact = (page, label) => page.evaluate(l => {
  const b = [...document.querySelectorAll("button")].find(x => x.innerText.trim() === l); if (!b) return false; b.click(); return true;
}, label);

(async () => {
  const rulesText = fs.readFileSync(RULES, "utf8").split("/\\\\s/").join("/[ \\\\t\\\\n\\\\r]/"); // エミュレータは \s を読めない（写しだけ置き換える）
  {
    const r = await fetch(`http://127.0.0.1:${DB_PORT}/.settings/rules.json?ns=${NS}`, { method: "PUT", headers: { Authorization: "Bearer owner" }, body: rulesText });
    if (!r.ok) throw new Error("ルールの読み込みに失敗: " + (await r.text()));
  }
  await rest("PUT", "", seed());
  const server = await startServer();

  const browser = await pw.chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {});
  const R = {}; const notes = {}; const allErrors = [];
  const done = async o => { allErrors.push(...o.errors.filter(e => !/permission_denied|PERMISSION_DENIED|Client doesn't have permission/i.test(e))); await o.context.close(); };

  // A. スタッフURL
  {
    const o = await open(browser, "#/s/T1");
    R.A_staffUrlShowsPeriod = await textHas(o.page, "10月前半");
    const uid = await uidOf(o.page);
    const rd = await rest("GET", `shops/S1/readers/${uid}`);
    R.A_readerT_registered = !!rd && rd.t === "T1";
    R.A_canReadStaff = (await directRead(o.page, "shops/S1/staff")) === "ok";
    R.A_cannotReadOtherShop = (await directRead(o.page, "shops/S2/settings")) !== "ok";
    notes.A = { uid, reader: rd };
    await done(o);
  }

  // B・D. Cookie だけの端末 → 入力画面 → 管理コード
  {
    const o = await open(browser, "#/admin", { cookieShop: "S1", viewAdmin: true });
    R.B_gateShown = await o.page.waitForSelector('[data-admin-code-gate="S1"]', { timeout: 20000 }).then(() => true, () => false);
    await uidOf(o.page);
    const reads = {};
    for (const n of ["settings", "periods", "staff", "subs", "company"]) reads[n] = await directRead(o.page, `shops/S1/${n}`);
    R.B_directReadsDenied = Object.values(reads).every(v => v !== "ok");
    R.B_globalNameReadable = (await directRead(o.page, "global/shops/S1")) === "ok";
    R.B_noPeriodLabel = !(await o.page.evaluate(() => document.body.innerText.includes("10月前半")));
    notes.B = reads;
    if (!R.B_gateShown) notes.B_body = (await o.page.evaluate(() => document.body.innerText)).slice(0, 600);
    if (R.B_gateShown) await o.page.fill('[data-admin-code-gate] input', "S1.K1");
    await clickExact(o.page, "登録");
    R.D_afterCodeGateGone = await o.page.waitForSelector('[data-admin-code-gate]', { state: "detached", timeout: 20000 }).then(() => true, () => false);
    R.D_afterCodeShowsData = await textHas(o.page, "10月前半");
    await done(o);
  }

  // C. 管理キーを持つがまだオーナーでない端末
  {
    const o = await open(browser, "#/admin", { cookieShop: "S1", adminKeys: { S1: "K1" }, viewAdmin: true });
    const uid = await uidOf(o.page);
    R.C_claimShowsData = await textHas(o.page, "10月前半");
    const owner = await rest("GET", `shops/S1/owners/${uid}`);
    R.C_ownerRegistered = owner === "K1";
    R.C_noGate = !(await o.page.$('[data-admin-code-gate]'));
    await done(o);
  }

  // E. 承認済みの個別URL
  {
    const o = await open(browser, `#/m/${PT1}`);
    const uid = await uidOf(o.page);
    const rdOk = await o.page.waitForFunction(() => true).then(async () => {
      for (let i = 0; i < 40; i++) { const r = await rest("GET", `shops/S1/readers/${uid}`); if (r && r.p === PT1) return true; await new Promise(z => setTimeout(z, 250)); }
      return false;
    });
    R.E_readerP_registered = rdOk;
    notes.E_uid = uid;
    R.E_notPending = !(await textHas(o.page, "承認待ち", 3000));
    await clickExact(o.page, "提出");
    R.E_submitTabShowsPeriod = await textHas(o.page, "10月前半");
    await done(o);
  }

  // F. 承認待ちの個別URLを開いたまま承認する
  {
    const o = await open(browser, `#/m/${PT2}`);
    const uid = await uidOf(o.page);
    R.F_pendingShown = await textHas(o.page, "承認待ち");
    R.F_pendingCannotRead = (await directRead(o.page, "shops/S1/staff")) !== "ok";
    await rest("PATCH", `shops/S1/staffPages/${PT2}`, { status: "approved", name: "鈴木", approvedAt: "2026-10-08T00:00:00.000Z", byUid: "OWN0" });
    let ok = false;
    for (let i = 0; i < 60; i++) { const r = await rest("GET", `shops/S1/readers/${uid}`); if (r && r.p === PT2) { ok = true; break; } await new Promise(z => setTimeout(z, 250)); }
    R.F_readerP_afterApprove = ok;
    notes.F_uid = uid;
    R.F_canReadAfterApprove = (await directRead(o.page, "shops/S1/staff")) === "ok";
    await clickExact(o.page, "提出");
    R.F_submitTabShowsPeriod = await textHas(o.page, "10月前半");
    await done(o);
  }

  // G. 店長がシフト作成タブを開く → 同じ企業の S2 を読む
  {
    const o = await open(browser, "#/admin", { cookieShop: "S1", adminKeys: { S1: "K1" }, viewAdmin: true });
    const uid = await uidOf(o.page);
    await textHas(o.page, "10月前半");
    await clickExact(o.page, "シフト作成");
    let rd = null;
    for (let i = 0; i < 60; i++) { rd = await rest("GET", `shops/S2/readers/${uid}`); if (rd && rd.o === "S1") break; await new Promise(z => setTimeout(z, 250)); }
    R.G_readerO_registered = !!rd && rd.o === "S1";
    R.G_canReadSiblingSubs = (await directRead(o.page, "shops/S2/subs")) === "ok";
    R.G_cannotReadSiblingPrivate = (await directRead(o.page, "shops/S2/private")) !== "ok";
    notes.G = { uid, rd };
    await done(o);
  }

  notes.readersS1 = await rest("GET", "shops/S1/readers");
  notes.readersS2 = await rest("GET", "shops/S2/readers");
  await browser.close();
  server.close();
  R.noUnexpectedErrors = allErrors.length === 0;
  const allPass = Object.values(R).every(Boolean);
  console.log(JSON.stringify({ allPass, results: R, notes, errors: allErrors.slice(0, 20) }, null, 2));
  process.exit(allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
