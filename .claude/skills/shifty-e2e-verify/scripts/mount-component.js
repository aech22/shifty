// Shifty の配信物から「コンポーネント1つだけ」を実ブラウザにマウントするハーネス。
//
// なぜ要るか: アプリ全体（1.5節）を起動すると App() が Firebase に接続し、検証のたびに
// dev の標準テスト店舗を実際に書き換えてしまう。破壊的な操作（スタッフ削除・期間削除）を
// 含む再現は、環境を用意するより「副作用の出口だけ差し替える」ほうが速くて安全になる。
// app-main.js を読み込まないので firebaseDB は null のままで、Firebase へは1バイトも出ない。
//
// 使い方は SKILL.md 1.6節。バグチェック #91・#92・#93 で3回同じものを書き直したため関数化した。
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = "/Users/hiroshi/Documents/Claude Code/シフト作成アプリーshifty";

// Playwright本体はスキルのnode_modulesにある（npm install 不要・ブラウザ本体もキャッシュ済み）。
// 置き場所が変わっても落ちないよう候補を順に試す。
const PW_CANDIDATES = [
  path.join(process.env.HOME || "", ".claude/skills/rendered-contrast-check/node_modules/playwright-core"),
  path.join(process.env.HOME || "", ".claude/skills/shifty-e2e-verify/node_modules/playwright-core"),
  "playwright-core",
  "playwright",
];

function loadPlaywright() {
  const tried = [];
  for (const c of PW_CANDIDATES) {
    try { return require(c); } catch (e) { tried.push(c); }
  }
  throw new Error("playwright-core が見つかりません。試した場所:\n  " + tried.join("\n  "));
}

// 既定の読み込みセット。app-main.js は入れない（入れると App() がマウントされFirebaseへ繋ぐ）。
const DEFAULT_SCRIPTS = [
  { src: "app-utils.js", babel: false },
  { src: "app-core.js", babel: false },
  { src: "app-staff.js", babel: true },
  { src: "app-admin.js", babel: true },
];

const CDN = [
  "https://unpkg.com/react@18.3.1/umd/react.production.min.js",
  "https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js",
  "https://unpkg.com/@babel/standalone@7.27.4/babel.min.js",
];

const MIME = {
  ".js": "application/javascript; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

function buildHtml(scripts, jsx, extraHead) {
  const tags = scripts.map(s =>
    s.babel
      ? `<script type="text/babel" src="${s.src}" data-presets="react"></script>`
      : `<script src="${s.src}"></script>`
  ).join("\n");
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>shifty-harness</title>
${extraHead || ""}</head><body>
<div id="root"></div>
${CDN.map(u => `<script src="${u}"></script>`).join("\n")}
${tags}
<script type="text/babel" data-presets="react">
${jsx}
</script></body></html>`;
}

/**
 * 部品を1つマウントしたページを返す。
 *
 * @param {object} o
 * @param {string} o.jsx        Harness を定義して ReactDOM.createRoot(...).render(<Harness/>) まで行うJSXソース。
 *                              **`const {useState}=React` のような分割代入をトップレベルに書かないこと**
 *                              （app-staff.js が同じ名前でグローバル宣言済みのため
 *                               "Identifier 'useState' has already been declared" で丸ごと落ちる）。
 *                              `React.useState(...)` のように名前空間付きで呼ぶ。
 * @param {string} [o.waitFor]  マウント完了の判定に使うセレクタ（既定 "#root > *"）。
 * @param {string} [o.engine]   "chromium"（既定）| "webkit"。ユーザーの主戦場は iOS Safari なので
 *                              見た目・レイアウトの結論を出すときは webkit でも回す。
 * @param {object} [o.viewport] 既定 {width:1400,height:900}。モバイル検証は {width:375,height:812}。
 * @param {Array}  [o.scripts]  読み込むアプリファイル。既定は utils/core/staff/admin（app-main.js を含めない）。
 * @param {string} [o.root]     配信物を読むルート。既定は環境変数 SHIFTY_ROOT、無ければリポジトリ本体。
 *                              worktree隔離（0.5節）や「修正前の版で落ちることの確認」に使う。
 * @param {boolean}[o.headed]   デバッグ時に true。
 * @param {number} [o.timeout]  マウント待ちのミリ秒（既定 20000）。
 */
async function openHarness(o) {
  if (!o || typeof o.jsx !== "string") throw new Error("openHarness: jsx（Harnessを定義して描画するソース）は必須です");
  const root = o.root || process.env.SHIFTY_ROOT || REPO_ROOT;
  const scripts = o.scripts || DEFAULT_SCRIPTS;
  const engine = o.engine || "chromium";
  const waitFor = o.waitFor || "#root > *";
  const timeout = o.timeout || 20000;

  if (scripts.some(s => String(s.src || s).includes("app-main.js"))) {
    console.warn("[mount-component] app-main.js を読み込むと App() がマウントされ Firebase に接続します。" +
      "部品単体の検証では外してください（アプリ全体を起動したいなら SKILL.md 1.5節）。");
  }

  const pw = loadPlaywright();
  const browserType = pw[engine];
  if (!browserType) throw new Error(`未知のengine: ${engine}`);

  const browser = await browserType.launch({ headless: !o.headed });
  const context = await browser.newContext({ viewport: o.viewport || { width: 1400, height: 900 } });
  const page = await context.newPage();

  const errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });

  const html = buildHtml(scripts, o.jsx, o.extraHead);

  await page.route("**/*", route => {
    const u = new URL(route.request().url());
    if (u.hostname !== "shifty.test") return route.continue();      // CDNは実ネットワークへ通す
    if (u.pathname === "/") return route.fulfill({ contentType: MIME[".html"], body: html });
    const f = path.join(root, decodeURIComponent(u.pathname).replace(/^\//, ""));
    if (!f.startsWith(root) || !fs.existsSync(f)) return route.fulfill({ status: 404, body: "not found" });
    return route.fulfill({ contentType: MIME[path.extname(f)] || "application/octet-stream", body: fs.readFileSync(f) });
  });

  await page.goto("http://shifty.test/", { waitUntil: "networkidle" });

  try {
    await page.waitForSelector(waitFor, { timeout });
  } catch (e) {
    const hint = errors.some(x => x.includes("has already been declared"))
      ? "\nヒント: jsx のトップレベルで React のフックを分割代入していませんか（app-staff.js が同名でグローバル宣言済み）。React.useState(...) の形に変えてください。"
      : "";
    await browser.close();
    throw new Error(`マウントに失敗しました（"${waitFor}" が現れない）。\nerrors=${JSON.stringify(errors, null, 2)}${hint}`);
  }

  // ---- 操作ヘルパ ----------------------------------------------------------
  // Reactの制御コンポーネントは value を直接代入しても onChange が走らないため、
  // ネイティブのvalue setterを呼んでから input イベントを発火する。
  const setInput = async (selector, value) => {
    await page.focus(selector);
    await page.$eval(selector, (el, v) => {
      const proto = el instanceof window.HTMLTextAreaElement ? window.HTMLTextAreaElement : window.HTMLInputElement;
      Object.getOwnPropertyDescriptor(proto.prototype, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }, value);
  };
  const blur = async (selector) => { await page.$eval(selector, el => el.blur()); await page.waitForTimeout(150); };
  // 入力→blur確定までを1回で。グリッドのセルはこの形でしか確定しない（onBlurでsubsへ適用される）。
  const fill = async (selector, value) => { await setInput(selector, value); await blur(selector); };
  // 日本語ラベルのボタンはテキストで掴む。押せたら true。
  const clickByText = async (text) => {
    for (const b of await page.$$("button")) {
      if (((await b.innerText()) || "").trim().includes(text)) { await b.click(); await page.waitForTimeout(250); return true; }
    }
    return false;
  };
  // シフト作成グリッドのセル（data-sc / data-scn は Enter でのフォーカス移動用に元から付いている）
  const cell = (name, date, field) => `[data-sc="${date}|${field}"][data-scn="${name}"]`;

  return {
    browser, context, page, errors,
    setInput, blur, fill, clickByText, cell,
    evaluate: (...a) => page.evaluate(...a),
    close: () => browser.close(),
  };
}

module.exports = { openHarness, REPO_ROOT, DEFAULT_SCRIPTS };
