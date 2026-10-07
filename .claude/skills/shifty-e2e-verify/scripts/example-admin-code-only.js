// 店舗コード（店舗IDだけ）の廃止の回帰テスト（2026-10-08）。管理コード（店舗ID.キー）だけで端末を管理者に登録する。
//
// 本物の index.html を丸ごと配信し（Firebase の CDN 5本だけ stub-firebase.js に差し替え）、スタブの ownerRules で
// database.rules.json の owners・private の規則（owners/{uid} の値が private/adminKey と一致するときだけ書ける）を真似て確かめる:
//   A. 管理者として登録されていない端末（Cookie の A店）で #/admin → 管理者画面を描かず管理コードの入力画面だけを出す
//      店舗IDだけ・間違ったキー・別の店舗の管理コードは拒否、正しい管理コードで管理者画面に入れる（owners に自分の uid）
//   B. 店舗メニューの「管理コードで追加」: 店舗IDだけは拒否、正しい管理コードで B店を追加でき、B店でも管理者画面に入れる
//   C. 再読み込み: 管理コードを登録した端末はそのまま管理者画面（確認中の表示は出ても入力画面は出ない）
//   D. ログイン画面（何も無い端末）: 「管理コードで参加」に店舗IDだけは拒否、正しい管理コードで入れる
//   E. スタッフURL（#/s/）は従来どおりスタッフ画面（入力画面は出ない）
//   F. 設定タブの店舗管理コードは「店舗ID.キー」（店舗IDだけを表示しない）
// すべてで console.error・pageerror が 0 件。Firebase・Cloud Functions へは1バイトも出ない。
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-admin-code-only.js → allPass=true / EXIT=0
// 反証: SHIFTY_ROOT=<変更前の配信物> だと A（閲覧専用の管理者画面が出る）・B・D（店舗IDだけで通る）が落ちる
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
    S1: { owners: { OTHER: "K1KEY" }, private: { adminKey: "K1KEY" }, staff: { 0: "鈴木" }, periods: { p1: P("S1", "p1", "t1") } },
    S2: { owners: { OTHER: "K2KEY" }, private: { adminKey: "K2KEY" }, staff: { 0: "佐藤" }, periods: { p2: P("S2", "p2", "t2") } },
  },
  tokens: { t1: { shopId: "S1", periodId: "p1" }, t2: { shopId: "S2", periodId: "p2" } },
  accounts: { S1: { plan: "premium" }, S2: { plan: "premium" } },
});

async function newContext(browser, cookie) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  if (cookie) await context.addCookies([{ name: "ots_shopId", value: cookie, url: "http://shifty.test/" }]);
  const errors = [];
  const html = servedIndexHtml(makeStub({ seed: seed(), auth: "accounts", authSeed: { users: {}, cur: null }, ownerRules: true, view: "admin", tab: "periods" }));
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
  page.on("dialog", d => d.accept());
  return { context, page, errors };
}
const sleep = (page, ms) => page.waitForTimeout(ms);
const go = async (page, hash) => { await page.goto("http://shifty.test/" + hash, { waitUntil: "networkidle" }); await sleep(page, 1500); };
const state = page => page.evaluate(() => {
  const t = document.body.innerText;
  return {
    gate: (document.querySelector("[data-admin-code-gate]") || {}).getAttribute ? document.querySelector("[data-admin-code-gate]").getAttribute("data-admin-code-gate") : null,
    admin: /期間管理/.test(t) && !!document.querySelector("button") && [...document.querySelectorAll("button")].some(b => b.innerText.trim() === "シフト作成"),
    readOnlyBanner: t.includes("この端末は管理者として登録されていません（") || t.includes("提出データの編集はできますが"),
    msg: (document.querySelector("[data-admin-code-msg]") || {}).innerText || "",
  };
});
const gateTry = async (page, code) => {
  await page.fill("[data-admin-code-gate] input", code);
  await page.evaluate(() => [...document.querySelectorAll("[data-admin-code-gate] button")].find(b => b.innerText.trim() === "登録").click());
  await sleep(page, 900);
  return state(page);
};
const clickText = (page, label) => page.evaluate(l => {
  const b = [...document.querySelectorAll("button")].find(x => x.innerText && x.innerText.trim() === l);
  if (!b) return false; b.click(); return true;
}, label);
const openMenu = page => page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /▼$/.test(x.innerText.trim())); if (b) b.click(); return !!b; });
const ownersOf = (page, sid) => page.evaluate(s => window.__dbDump ? (JSON.parse(JSON.stringify(window.__dbDump())).shops[s].owners) : null, sid);

(async () => {
  const R = {};
  const browser = await pw.chromium.launch({ headless: true });
  const allErrors = [];
  try {
    // ---- A・B・C・F: Cookie の A店の端末（管理キーなし）----
    const h = await newContext(browser, "S1");
    const { page } = h;
    await go(page, "#/admin");
    R.A_first = await state(page);
    R.A_shopIdOnly = await gateTry(page, "S1");
    R.A_wrongKey = await gateTry(page, "S1.WRONG");
    R.A_otherShop = await gateTry(page, "S2.K2KEY");
    R.A_ok = await gateTry(page, "S1.K1KEY");
    await sleep(page, 800);
    R.A_after = await state(page);
    R.A_owners = await ownersOf(page, "S1");
    // F: 設定タブの店舗管理コード
    await clickText(page, "設定"); await sleep(page, 600);
    R.F_code = await page.evaluate(() => { const c = [...document.querySelectorAll("span")].find(s => /^S1\./.test(s.innerText.trim()) || s.innerText.trim() === "S1"); return c ? c.innerText.trim() : null; });
    await clickText(page, "期間"); await sleep(page, 300);
    // B: 店舗メニューの「管理コードで追加」
    R.B_menu = await openMenu(page); await sleep(page, 300);
    R.B_open = await clickText(page, "管理コードで追加"); await sleep(page, 300);
    const addTry = async code => {
      await page.fill('input[placeholder="管理コード（店舗ID.キー）を貼り付け"]', code);
      await clickText(page, "追加"); await sleep(page, 900);
      return page.evaluate(() => document.body.innerText);
    };
    const t1 = await addTry("S2");
    R.B_shopIdOnlyRejected = /管理コード（店舗ID\.キー）を貼り付けてください/.test(t1);
    const t2 = await addTry("S2.K2KEY");
    R.B_added = /「B店」を追加しました/.test(t2);
    await sleep(page, 1500);
    R.B_after = await state(page);
    R.B_owners = await ownersOf(page, "S2");
    // C: 再読み込み
    await page.reload({ waitUntil: "networkidle" }); await sleep(page, 1800);
    R.C_after = await state(page);
    allErrors.push(...h.errors);
    await h.context.close();

    // ---- D: ログイン画面 ----
    const d = await newContext(browser, null);
    await go(d.page, "");
    R.D_login = await d.page.evaluate(() => document.body.innerText.includes("管理コードで参加"));
    const loginTry = async code => {
      await d.page.fill('input[placeholder="管理コード（店舗ID.キー）を貼り付け"]', code);
      await d.page.evaluate(() => [...document.querySelectorAll("button")].find(b => b.innerText.trim() === "参加").click());
      await sleep(d.page, 1200);
      return d.page.evaluate(() => document.body.innerText);
    };
    const l1 = await loginTry("S1");
    R.D_shopIdOnlyRejected = /店舗ID\.キー/.test(l1) && !/期間管理/.test(l1);
    const l2 = await loginTry("S1.K1KEY");
    R.D_ok = /期間管理|10月前半|管理者画面/.test(l2) && !(await d.page.evaluate(() => !!document.querySelector("[data-admin-code-gate]")));
    allErrors.push(...d.errors);
    await d.context.close();

    // ---- E: スタッフURL ----
    const e = await newContext(browser, null);
    await go(e.page, "#/s/t1");
    R.E_staff = await e.page.evaluate(() => ({ text: /10月前半/.test(document.body.innerText), gate: !!document.querySelector("[data-admin-code-gate]") }));
    allErrors.push(...e.errors);
    await e.context.close();
  } finally {
    await browser.close();
  }
  R.errors = allErrors;
  R.verdict = {
    A_gateNotAdmin: R.A_first.gate === "S1" && !R.A_first.admin && !R.A_first.readOnlyBanner,
    A_shopIdOnlyRejected: !!R.A_shopIdOnly.gate && /店舗ID\.キー/.test(R.A_shopIdOnly.msg),
    A_wrongKeyRejected: !!R.A_wrongKey.gate && /正しくありません/.test(R.A_wrongKey.msg),
    A_otherShopRejected: !!R.A_otherShop.gate && /この店舗の管理コードではありません/.test(R.A_otherShop.msg),
    A_okEntersAdmin: !R.A_after.gate && R.A_after.admin && !!R.A_owners && Object.keys(R.A_owners).length === 2,
    F_codeIsAdminCode: R.F_code === "S1.K1KEY",
    B_shopIdOnlyRejected: R.B_shopIdOnlyRejected,
    B_addedAndAdmin: R.B_added && !R.B_after.gate && R.B_after.admin && !!R.B_owners && Object.keys(R.B_owners).length === 2,
    C_reloadStaysAdmin: !R.C_after.gate && R.C_after.admin,
    D_loginByAdminCodeOnly: R.D_login && R.D_shopIdOnlyRejected && R.D_ok,
    E_staffUrlUnchanged: R.E_staff.text && !R.E_staff.gate,
    noErrors: R.errors.length === 0,
  };
  R.verdict.allPass = Object.values(R.verdict).every(Boolean);
  console.log(JSON.stringify(R, null, 2));
  process.exit(R.verdict.allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
