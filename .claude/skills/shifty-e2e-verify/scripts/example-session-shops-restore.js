// 管理者のセッションで開いていた店舗を、次に開いたときに全部戻す回帰テスト（2026-10-05）。
//
// iOS のホーム画面アプリは Safari と保存場所が別で、終了・再起動も多い。Google・メールのログインが無い端末は
// 再読み込みのたびに Cookie の1店舗しか戻らず、「コードで追加」した他の店舗が消えていた。
// 本物の index.html を丸ごと配信し（Firebase の CDN 5本だけ stub-firebase.js に差し替え）、次を確かめる:
//   A. ログインなし（匿名）の端末: Cookie の A店で開き、店舗メニューの「コードで追加」で B店を足す → 再読み込み → A店・B店の両方が残る
//      （再読み込み後に開いている店舗は最後に選んだ B店＝Cookie）
//   B. 片方の店舗からログアウトして再読み込み → 残した1店舗だけ
//   C. スタッフURL（#/s/）を同じ端末で開いても、管理者の店舗一覧は上書きされない（その後の再読み込みで2店舗とも残る）
//   D. ホーム画面のアイコン: 管理者側は favicon-180.png、スタッフURL・#/m/・#/me は favicon-staff-180.png
// すべてで console.error・pageerror が 0 件。Firebase・Cloud Functions へは1バイトも出ない。
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-session-shops-restore.js → allPass=true / EXIT=0
// 反証: SHIFTY_ROOT=<変更前の配信物> だと A（再読み込みで B店が消える）・D が落ちる
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { REPO_ROOT } = require(path.join(__dirname, "mount-component.js"));
const { makeStub } = require(path.join(__dirname, "stub-firebase.js"));
const ROOT = process.env.SHIFTY_ROOT || REPO_ROOT;

const PW_CANDIDATES = [
  path.join(process.env.HOME || "", ".claude/skills/rendered-contrast-check/node_modules/playwright-core"),
  path.join(process.env.HOME || "", ".claude/skills/shifty-e2e-verify/node_modules/playwright-core"),
  "playwright-core", "playwright",
];
const pw = (() => { for (const c of PW_CANDIDATES) { try { return require(c); } catch (e) { /* 次の候補 */ } } throw new Error("playwright-core が見つかりません"); })();

const MIME = { ".js": "application/javascript; charset=utf-8", ".html": "text/html; charset=utf-8", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };

function servedIndexHtml(stubHead) {
  const raw = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const fbTag = /\s*<script src="https:\/\/www\.gstatic\.com\/firebasejs\/[^"]+"[^>]*><\/script>/g;
  const n = (raw.match(fbTag) || []).length;
  if (n !== 5) throw new Error(`index.html の Firebase CDN が5本ではない（${n}本）`);
  let done = false;
  return raw.replace(fbTag, m => { if (done) return ""; done = true; return "\n" + stubHead; });
}

function cdnLocalFile(u) {
  const dir = process.env.SHIFTY_CDN_DIR;
  if (!dir) return null;
  let rel = null;
  const npm = /^\/(?:npm\/)?((?:@[^/]+\/)?[^/@]+)@[^/]+\/(.+)$/.exec(u.pathname);
  if ((u.hostname === "unpkg.com" || u.hostname === "cdn.jsdelivr.net") && npm) rel = `${npm[1]}/${npm[2]}`;
  const cdnjs = /^\/ajax\/libs\/([^/]+)\/[^/]+\/(.+)$/.exec(u.pathname);
  if (u.hostname === "cdnjs.cloudflare.com" && cdnjs) rel = `${cdnjs[1]}/dist/${cdnjs[2]}`;
  if (!rel) return null;
  const f = path.join(dir, "node_modules", rel);
  return fs.existsSync(f) ? f : null;
}


const P = (sid, id, tok) => ({ id, urlToken: tok, shopId: sid, label: "10月前半", startDate: "2026-10-01", endDate: "2026-10-15", deadlineDate: "", createdAt: "2026-09-01T00:00:00.000Z" });
const seed = () => ({
  global: { shops: { S1: { id: "S1", name: "A店" }, S2: { id: "S2", name: "B店" } } },
  shops: {
    S1: { owners: { OTHER: "K1" }, private: { adminKey: "K1" }, staff: { 0: "鈴木" }, periods: { p1: P("S1", "p1", "t1") } },
    S2: { owners: { OTHER: "K2" }, private: { adminKey: "K2" }, staff: { 0: "佐藤" }, periods: { p2: P("S2", "p2", "t2") } },
  },
  tokens: { t1: { shopId: "S1", periodId: "p1" }, t2: { shopId: "S2", periodId: "p2" } },
  accounts: { S1: { plan: "premium" }, S2: { plan: "premium" } },
});

async function newContext(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies([{ name: "ots_shopId", value: "S1", url: "http://shifty.test/" }]);
  const errors = [];
  // auth:"accounts"・cur:null ＝ ログインなしの端末（起動時に匿名サインイン）
  const html = servedIndexHtml(makeStub({ seed: seed(), auth: "accounts", authSeed: { users: {}, cur: null }, view: "admin", tab: "periods" }));
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
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
  return { context, page, errors };
}
const waitBoot = page => page.waitForFunction(() => /10月前半/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {});
const go = async (page, hash) => { await page.goto("http://shifty.test/" + hash, { waitUntil: "networkidle" }); await waitBoot(page); await page.waitForTimeout(400); };
const reload = async page => { await page.reload({ waitUntil: "networkidle" }); await waitBoot(page); await page.waitForTimeout(400); };
const clickText = (page, label) => page.evaluate(l => {
  const b = [...document.querySelectorAll("button,div")].find(x => x.childElementCount <= 1 && x.innerText && x.innerText.trim() === l);
  if (!b) return false; b.click(); return true;
}, label);
// 店舗メニューを開いて、並んでいる店舗名を読む（閉じて戻す）
const menuShops = async page => {
  const opened = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(x => /▼$/.test(x.innerText.trim()));
    if (!b) return null; b.click(); return b.innerText.trim();
  });
  await page.waitForTimeout(200);
  const names = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(x => /▼$/.test(x.innerText.trim()));
    const menu = b && b.nextElementSibling;
    if (!menu) return null;
    return [...menu.children].map(r => (r.firstElementChild && r.firstElementChild.innerText || "").replace("✓", "").trim()).filter(n => /店$/.test(n));
  });
  return { current: opened, names };
};
const closeMenu = page => page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /▼$/.test(x.innerText.trim())); if (b) b.click(); });
const iconOf = page => page.evaluate(() => ({
  touch: document.querySelector('link[rel="apple-touch-icon"]').getAttribute("href"),
  svg: document.querySelector('link[rel="icon"][type="image/svg+xml"]').getAttribute("href"),
}));

(async () => {
  const R = {};
  const browser = await pw.chromium.launch({ headless: true });
  try {
    const h = await newContext(browser);
    const { page } = h;
    await go(page, "#/admin");
    R.A_first = await menuShops(page);
    R.D_adminIcon = await iconOf(page);
    // コードで追加（B店）
    R.A_codeOpen = await clickText(page, "管理コードで追加");
    await page.waitForTimeout(200);
    await page.fill('input[placeholder="管理コード（店舗ID.キー）を貼り付け"]', "S2.K2");
    R.A_add = await clickText(page, "追加");
    await page.waitForFunction(() => /「B店」を追加しました/.test(document.body.innerText), null, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    R.A_afterAdd = await menuShops(page); await closeMenu(page);
    await reload(page);
    R.A_afterReload = await menuShops(page); await closeMenu(page);
    R.A_saved = await page.evaluate(() => localStorage.getItem("ots_adminShops_v1"));
    // C: 同じ端末でスタッフURL（A店）を開いてから管理者の URL に戻る
    await go(page, "#/s/t1");
    R.D_staffIcon = await iconOf(page);
    R.C_savedAfterStaff = await page.evaluate(() => localStorage.getItem("ots_adminShops_v1"));
    await go(page, "#/m/abcdefghijklmnopqrstuvwx");
    R.D_pageIcon = await iconOf(page);
    await go(page, "#/me");
    R.D_meIcon = await iconOf(page);
    await go(page, "#/admin");
    R.C_afterStaffUrl = await menuShops(page); await closeMenu(page);
    R.D_adminIconAgain = await iconOf(page);
    // B: B店（いま開いている店舗）からログアウト → 再読み込み
    page.once("dialog", d => d.accept());
    await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /▼$/.test(x.innerText.trim())); b.click(); });
    await page.waitForTimeout(200);
    R.B_logoutClicked = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find(x => /▼$/.test(x.innerText.trim()));
      const row = [...b.nextElementSibling.children].find(r => r.firstElementChild && /B店/.test(r.firstElementChild.innerText));
      const btn = row && row.querySelector("button"); if (!btn) return false; btn.click(); return true;
    });
    await page.waitForTimeout(500);
    await reload(page);
    R.B_afterReload = await menuShops(page); await closeMenu(page);
    R.errors = h.errors;
    await h.context.close();
  } finally {
    await browser.close();
  }
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const STAFF = { touch: "favicon-staff-180.png", svg: "favicon-staff.svg" }, ADMIN = { touch: "favicon-180.png", svg: "favicon.svg" };
  R.verdict = {
    A_firstOnlyA: same(R.A_first.names, ["A店"]),
    A_added: same(R.A_afterAdd.names, ["A店", "B店"]),
    A_reloadKeepsBoth: same(R.A_afterReload.names, ["A店", "B店"]) && /^B店/.test(R.A_afterReload.current || ""),
    C_staffUrlDoesNotOverwrite: R.C_savedAfterStaff === '["S1","S2"]' && same(R.C_afterStaffUrl.names, ["A店", "B店"]),
    B_logoutOneShop: R.B_logoutClicked && same(R.B_afterReload.names, ["A店"]),
    D_icons: same(R.D_adminIcon, ADMIN) && same(R.D_staffIcon, STAFF) && same(R.D_pageIcon, STAFF) && same(R.D_meIcon, STAFF) && same(R.D_adminIconAgain, ADMIN),
    noErrors: R.errors.length === 0,
  };
  R.verdict.allPass = Object.values(R.verdict).every(Boolean);
  console.log(JSON.stringify(R, null, 2));
  process.exit(R.verdict.allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
