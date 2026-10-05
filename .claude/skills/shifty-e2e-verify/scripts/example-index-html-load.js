// 本物の index.html を丸ごと起動する回帰テスト（2026-09-30 app-admin.js → app-company.js 分割・
// 同日の2回目の分割で app-shift.js を追加・2026-10-04 に従業員画面の app-my-utils.js と app-my.js を追加）。
//
// mount-component.js（1.6節）は読み込むファイルを自前で並べるので、index.html の <script> の並びが
// 壊れていても通ってしまう。ここでは **index.html をそのまま配信**し、次を確かめる:
//   0. index.html の読み込み順が utils→my-utils→core→staff→admin→shift→company→my→main で、?v= が9箇所とも同じ版数
//      ／app-admin.js・app-shift.js・app-company.js・app-my.js がどれも 40万字以下（Babel Standalone の 500KB 上限に余裕を残す）
//   1. 未ログインの端末でログイン画面が出る
//   2. 管理者画面の企業連携タブ（app-company.js）・スタッフタブ（app-admin.js）・シフト作成タブ（app-shift.js）・
//      設定タブ（app-company.js）が描ける
//   すべてで console.error・pageerror が 0 件（Babel の 500KB 超過の Note も数える）。
//
// Firebase の CDN 5本だけを stub-firebase.js（1.65節）に差し替えるので、Firebase・Cloud Functions へは
// 1バイトも出ない。計測タグ（gtag・PostHog）は空の JS を返して外へ出さない。React・Babel・ExcelJS 等の CDN は実物。
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-index-html-load.js → allPass=true / EXIT=0
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

const MIME = { ".js": "application/javascript; charset=utf-8", ".html": "text/html; charset=utf-8", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };
const APP_FILES = ["app-utils.js", "app-my-utils.js", "app-core.js", "app-staff.js", "app-admin.js", "app-shift.js", "app-company.js", "app-my.js", "app-main.js"];
const PLAIN_FILES = ["app-utils.js", "app-my-utils.js", "app-core.js"];
const MAX_CHARS = 400000;

const UID = "U1", CID = "C1";
const seed = () => ({
  global: { shops: { S1: { id: "S1", name: "A店" }, S2: { id: "S2", name: "B店" } } },
  shops: {
    S1: { owners: { [`company_${CID}`]: "K1" }, private: { adminKey: "K1" }, staff: { 0: "田中" } },
    S2: { owners: { [UID]: "K2", [`company_${CID}`]: "K2" }, private: { adminKey: "K2" }, staff: { 0: "鈴木", 1: "佐藤" },
      // シフト作成タブ（app-shift.js）を描くための期間。提出は無くてよい（グリッドと操作方法は出る）
      periods: { p1: { id: "p1", urlToken: "t1", shopId: "S2", label: "10月前半", startDate: "2026-10-01", endDate: "2026-10-15", deadlineDate: "", createdAt: "2026-09-01T00:00:00.000Z" } } },
  },
  accounts: { S2: { plan: "premium" }, [UID]: { shops: { S2: true } } },
  companies: { [CID]: { pub: { name: "テスト企業", ownerUid: "someoneElse", code: "ABCD1234", shops: { S1: true, S2: true } } } },
  companyCodes: { ABCD1234: CID },
});

// 本物の index.html から Firebase の CDN 5本を抜き、同じ位置にスタブを置く（それ以外は1バイトも変えない）
function servedIndexHtml(stubHead) {
  const raw = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const fbTag = /\s*<script src="https:\/\/www\.gstatic\.com\/firebasejs\/[^"]+"[^>]*><\/script>/g;
  const n = (raw.match(fbTag) || []).length;
  if (n !== 5) throw new Error(`index.html の Firebase CDN が5本ではない（${n}本）。スタブの差し込み位置を見直すこと`);
  let done = false;
  return raw.replace(fbTag, m => { if (done) return ""; done = true; return "\n" + stubHead; });
}

function staticChecks() {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const tags = [...html.matchAll(/<script[^>]*src="(app-[a-z-]+\.js)\?v=([^"]+)"[^>]*>/g)];
  const order = tags.map(t => t[1]);
  const versions = [...new Set(tags.map(t => t[2]))];
  const babelOk = tags.every(t => PLAIN_FILES.includes(t[1]) ? !/text\/babel/.test(t[0]) : /type="text\/babel"/.test(t[0]) && /data-presets="react"/.test(t[0]));
  const sizes = Object.fromEntries(["app-admin.js", "app-shift.js", "app-company.js", "app-my.js"].map(f => [f, fs.readFileSync(path.join(ROOT, f), "utf8").length]));
  return {
    order, orderOk: JSON.stringify(order) === JSON.stringify(APP_FILES),
    vCount: tags.length, versions, versionOk: tags.length === APP_FILES.length && versions.length === 1,
    babelOk,
    sizes, sizeOk: Object.values(sizes).every(n => n <= MAX_CHARS),
  };
}

async function openIndex(browser, { signedIn, view, tab }) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  if (!signedIn) await context.addInitScript(() => { try { localStorage.setItem("__stub_fauth", "false"); } catch (e) { /* 無視 */ } });
  const page = await context.newPage();
  const errors = [], loaded = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
  const html = servedIndexHtml(makeStub({ seed: seed(), uid: UID, view, tab }));
  await page.route("**/*", route => {
    const u = new URL(route.request().url());
    if (/googletagmanager\.com|google-analytics\.com|posthog\.com/.test(u.hostname)) {
      return route.fulfill({ status: 200, contentType: MIME[".js"], body: "" });
    }
    if (u.hostname !== "shifty.test") {
      const local = cdnLocalFile(u);
      if (local) return route.fulfill({ contentType: "application/javascript; charset=utf-8", body: fs.readFileSync(local) });
      return route.continue();
    }
    if (u.pathname === "/" || u.pathname === "/index.html") return route.fulfill({ contentType: MIME[".html"], body: html });
    const rel = decodeURIComponent(u.pathname).replace(/^\//, "");
    const f = path.join(ROOT, rel);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return route.fulfill({ status: 404, body: "not found" });
    if (/^app-[a-z-]+\.js$/.test(rel)) loaded.push(rel);
    return route.fulfill({ contentType: MIME[path.extname(f)] || "application/octet-stream", body: fs.readFileSync(f) });
  });
  await page.goto("http://shifty.test/", { waitUntil: "networkidle" });
  return { context, page, errors, loaded };
}

const textHas = (page, s, timeout = 20000) =>
  page.waitForFunction(t => document.body.innerText.includes(t), s, { timeout }).then(() => true, () => false);
const clickTab = (page, label) => page.evaluate(l => {
  const b = [...document.querySelectorAll("button")].find(x => x.innerText.trim() === l);
  if (!b) return false; b.click(); return true;
}, label);

(async () => {
  const R = { static: staticChecks() };
  const browser = await pw.chromium.launch({ headless: true });
  try {
    // 1. 未ログイン → ログイン画面
    {
      const h = await openIndex(browser, { signedIn: false, view: "admin", tab: "periods" });
      R.login = {
        loginScreen: await textHas(h.page, "店舗コードで参加"),
        googleBtn: await h.page.evaluate(() => [...document.querySelectorAll("button")].some(b => b.innerText.includes("Googleでログイン"))),
        loaded: h.loaded.slice(),
        errors: h.errors.slice(),
      };
      await h.context.close();
    }
    // 2. 管理者画面: 企業連携 → スタッフ → 設定
    {
      const h = await openIndex(browser, { signedIn: true, view: "admin", tab: "company" });
      const A = {};
      A.companyTab = await textHas(h.page, "企業アカウントでログイン");
      A.staffClicked = await clickTab(h.page, "スタッフ");
      A.staffTab = await textHas(h.page, "佐藤") && await h.page.evaluate(() =>
        [...document.querySelectorAll("button")].filter(b => b.innerText.trim() === "編集").length >= 2);
      // シフト作成タブ（app-shift.js の ShiftEditTab）。期間を1つ持たせてあるのでグリッドと操作方法が出る
      A.editClicked = await clickTab(h.page, "シフト作成");
      A.editTab = await textHas(h.page, "操作方法（セル入力コマンド・色の意味）");
      A.settingsClicked = await clickTab(h.page, "設定");
      A.settingsTab = await textHas(h.page, "テーマ");
      A.loaded = h.loaded.slice();
      A.errors = h.errors.slice();
      R.admin = A;
      await h.context.close();
    }
  } catch (e) {
    R.exception = e.message;
  }
  await browser.close();
  const s = R.static;
  const allLoaded = l => l && APP_FILES.every(f => l.includes(f));
  R.verdict = {
    orderOk: s.orderOk, versionOk: s.versionOk, babelOk: s.babelOk, sizeOk: s.sizeOk,
    loginScreen: !!(R.login && R.login.loginScreen && R.login.googleBtn),
    loginLoadedAll: !!(R.login && allLoaded(R.login.loaded)),
    loginNoErrors: !!(R.login && R.login.errors.length === 0),
    companyTab: !!(R.admin && R.admin.companyTab),
    staffTab: !!(R.admin && R.admin.staffTab),
    editTab: !!(R.admin && R.admin.editTab),
    settingsTab: !!(R.admin && R.admin.settingsTab),
    adminNoErrors: !!(R.admin && R.admin.errors.length === 0),
    noException: !R.exception,
  };
  R.verdict.allPass = Object.values(R.verdict).every(Boolean);
  console.log(JSON.stringify(R, null, 2));
  process.exit(R.verdict.allPass ? 0 : 1);
})();
