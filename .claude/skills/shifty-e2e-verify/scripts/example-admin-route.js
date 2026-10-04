// 管理者画面のURL #/admin の回帰テスト（2026-10-05）。
//
// 本物の index.html を丸ごと配信し（Firebase の CDN 5本だけ stub-firebase.js に差し替え）、次を確かめる:
//   A. ルート（/）は従来どおり、そのタブの記憶（ss_view）の画面で開く。ここでは記憶を "staff" にしてスタッフ画面
//   B. /#/admin は、そのタブの記憶が "staff" でも管理者画面で開く（上部の切り替えも残る）
//   C. /#/admin でスタッフ画面へ切り替えてから再読み込みしても、管理者画面で開き直す
//   D. /#/s/<token>（スタッフURL）は従来どおりスタッフ専用（上部の切り替えが出ない・管理者のタブが出ない）
// すべてで console.error・pageerror が 0 件。Firebase・Cloud Functions へは1バイトも出ない。
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-admin-route.js → allPass=true / EXIT=0
// 反証: app-core.js の parseUrl から #/admin の判定を外すと B・C が落ちる（#/admin が旧形式のスタッフURL「トークン admin」に読まれる）
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

const UID = "U1";
const seed = () => ({
  global: { shops: { S2: { id: "S2", name: "B店" } } },
  shops: {
    S2: { owners: { [UID]: "K2" }, private: { adminKey: "K2" }, staff: { 0: "鈴木", 1: "佐藤" },
      periods: { p1: { id: "p1", urlToken: "t1", shopId: "S2", label: "10月前半", startDate: "2026-10-01", endDate: "2026-10-15", deadlineDate: "", createdAt: "2026-09-01T00:00:00.000Z" } } },
  },
  tokens: { t1: { shopId: "S2", periodId: "p1" } },
  accounts: { S2: { plan: "premium" }, [UID]: { shops: { S2: true } } },
});

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

async function open(browser, hash) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
  // そのタブの記憶は "staff"（新しいタブ・前回スタッフ画面で閉じたタブと同じ条件）
  const html = servedIndexHtml(makeStub({ seed: seed(), uid: UID, view: "staff", tab: "periods" }));
  await page.route("**/*", route => {
    const u = new URL(route.request().url());
    if (/googletagmanager\.com|google-analytics\.com|posthog\.com/.test(u.hostname)) return route.fulfill({ status: 200, contentType: MIME[".js"], body: "" });
    if (u.hostname !== "shifty.test") {
      // CDN に出られない環境（クラウドのセッションのネットワーク方針）では、同じ版の npm パッケージを置いた
      // ディレクトリ（SHIFTY_CDN_DIR＝その node_modules の親）から返す。unpkg・jsdelivr は npm の中身そのもの。
      // index.html の SRI（integrity）が中身の一致を確かめる
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
  await page.goto("http://shifty.test/" + hash, { waitUntil: "networkidle" });
  // 起動を待つ（スタッフ画面・管理者画面のどちらかが出るまで）
  await page.waitForFunction(() => /10月前半/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {});
  return { context, page, errors };
}

// 画面の状態: 上部の切り替えの有無と、管理者のタブ（「シフト作成」「企業連携」のボタン）の有無
const stateOf = page => page.evaluate(() => {
  const btns = [...document.querySelectorAll("button")].map(b => b.innerText.trim());
  return {
    toggle: btns.includes("スタッフ画面") && btns.includes("管理者画面"),
    adminTabs: btns.includes("シフト作成") && btns.includes("企業連携"),
    hash: location.hash,
  };
});
const click = (page, label) => page.evaluate(l => {
  const b = [...document.querySelectorAll("button")].find(x => x.innerText.trim() === l);
  if (!b) return false; b.click(); return true;
}, label);

(async () => {
  const R = {};
  const browser = await pw.chromium.launch({ headless: true });
  try {
    { const h = await open(browser, ""); R.A_root = { ...(await stateOf(h.page)), errors: h.errors }; await h.context.close(); }
    {
      const h = await open(browser, "#/admin");
      R.B_admin = { ...(await stateOf(h.page)), errors: h.errors.slice() };
      // C: スタッフ画面へ切り替え → 再読み込み → 管理者画面で開き直す
      R.C_clickedStaff = await click(h.page, "スタッフ画面");
      await h.page.waitForTimeout(500);
      R.C_afterClick = await stateOf(h.page);
      await h.page.reload({ waitUntil: "networkidle" });
      await h.page.waitForFunction(() => /10月前半/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {});
      R.C_afterReload = { ...(await stateOf(h.page)), errors: h.errors.slice() };
      await h.context.close();
    }
    { const h = await open(browser, "#/s/t1"); R.D_staffUrl = { ...(await stateOf(h.page)), errors: h.errors }; await h.context.close(); }
  } finally {
    await browser.close();
  }
  const noErr = x => x && x.errors && x.errors.length === 0;
  R.verdict = {
    A_rootIsStaff: R.A_root.toggle && !R.A_root.adminTabs && noErr(R.A_root),
    B_adminOpensAdmin: R.B_admin.toggle && R.B_admin.adminTabs && R.B_admin.hash === "#/admin" && noErr(R.B_admin),
    C_switchWorks: R.C_clickedStaff && !R.C_afterClick.adminTabs,
    C_reloadBackToAdmin: R.C_afterReload.adminTabs && noErr(R.C_afterReload),
    D_staffUrlLocked: !R.D_staffUrl.toggle && !R.D_staffUrl.adminTabs && noErr(R.D_staffUrl),
  };
  R.verdict.allPass = Object.values(R.verdict).every(Boolean);
  console.log(JSON.stringify(R, null, 2));
  process.exit(R.verdict.allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
