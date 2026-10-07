// index.html の CSP（Content-Security-Policy の meta・2026-10-08）の回帰テスト。
//
// CSP は「許可し忘れた先」があると、その機能だけが黙って動かなくなる（console に1行出るだけ）。
// ここでは **本物の index.html を、このスクリプトが立てる http サーバー（127.0.0.1・localhost で開く＝DEV_MODE）から配信**し、
// 次の場面で securitypolicyviolation が 0 件であることを数える:
//   A. 本物の Firebase SDK（dev の thirty-dev-b6958 に接続）: ログイン画面・匿名サインイン・RTDB の接続（WebSocket）・
//      CDN のライブラリ（ExcelJS・jsPDF・html2canvas）・計測タグ（gtag・PostHog の読み込み）・Google ログインのポップアップを
//      開いたときの gapi と authDomain の iframe（ポップアップはログイン画面を開いただけで閉じる。何も入力しない）。
//      **dev への書き込みは匿名サインインだけ**（店舗のデータは読みも書きもしない。RTDB は .info/connected を見るだけ）。
//   B. スタブの Firebase（stub-firebase.js・外へ出ない）: 管理者画面のシフト作成タブで Excel出力・PDF出力（全データ）を実際に押し、
//      sw.js（通知の Service Worker）を登録する。
//   C. 対照: CSP が実際に効いていること（許可していない https://example.com の画像を差し込むと violation が出る・meta がある）。
// 計測の送信（GA の collect・PostHog の取り込み）は CSP の判定を通った後で abort する（CSP の判定は送信の前に起きるので、
// 許可し忘れていれば abort より先に violation が出る）。
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-csp.js → allPass=true / EXIT=0
//       SHIFTY_ROOT=<worktree> で配信物の場所を変える。SHIFTY_SKIP_REAL=1 で A を飛ばす（ネットワークの無い環境）。
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { REPO_ROOT } = require(path.join(__dirname, "mount-component.js"));
const { makeStub } = require(path.join(__dirname, "stub-firebase.js"));
const ROOT = process.env.SHIFTY_ROOT || REPO_ROOT;

const PW_CANDIDATES = [
  path.join(process.env.HOME || "", ".claude/skills/rendered-contrast-check/node_modules/playwright-core"),
  path.join(process.env.HOME || "", ".claude/skills/shifty-e2e-verify/node_modules/playwright-core"),
  "playwright-core", "playwright",
];
const pw = (() => { for (const c of PW_CANDIDATES) { try { return require(c); } catch (e) { /* 次の候補 */ } } throw new Error("playwright-core が見つかりません"); })();

const MIME = { ".js": "application/javascript; charset=utf-8", ".html": "text/html; charset=utf-8", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };

const UID = "U1";
const stubSeed = () => ({
  global: { shops: { S2: { id: "S2", name: "B店" } } },
  shops: {
    S2: { owners: { [UID]: "K2" }, private: { adminKey: "K2" }, staff: { 0: "鈴木", 1: "佐藤" },
      periods: { p1: { id: "p1", urlToken: "t1", shopId: "S2", label: "10月前半", startDate: "2026-10-01", endDate: "2026-10-15", deadlineDate: "", createdAt: "2026-09-01T00:00:00.000Z" } },
      subs: { s1: { id: "s1", periodId: "p1", staffName: "鈴木", shopId: "S2", comment: "", submittedAt: "2026-09-20T00:00:00.000Z",
        shifts: { "2026-10-02": { status: "work", start: "09:00", end: "18:00" } } } } },
  },
  accounts: { S2: { plan: "premium" }, [UID]: { shops: { S2: true } } },
});

// 本物の index.html から Firebase の CDN 5本を抜き、同じ位置にスタブを置く（example-index-html-load.js と同じ）
function stubIndexHtml(stubHead) {
  const raw = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const fbTag = /\s*<script src="https:\/\/www\.gstatic\.com\/firebasejs\/[^"]+"[^>]*><\/script>/g;
  const n = (raw.match(fbTag) || []).length;
  if (n !== 5) throw new Error(`index.html の Firebase CDN が5本ではない（${n}本）`);
  let done = false;
  return raw.replace(fbTag, m => { if (done) return ""; done = true; return "\n" + stubHead; });
}

function startServer(stubHtml) {
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, "http://localhost");
    if (u.pathname === "/stub.html") { res.writeHead(200, { "content-type": MIME[".html"] }); return res.end(stubHtml); }
    let rel = decodeURIComponent(u.pathname).replace(/^\//, "");
    if (rel === "") rel = "index.html";
    const f = path.join(ROOT, rel);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" });
    res.end(fs.readFileSync(f));
  });
  return new Promise(r => srv.listen(0, "127.0.0.1", () => r(srv)));
}

const CSP_LISTENER = () => {
  window.__csp = [];
  document.addEventListener("securitypolicyviolation", e => {
    window.__csp.push({ directive: e.effectiveDirective, blocked: e.blockedURI, source: e.sourceFile, line: e.lineNumber, sample: e.sample });
  });
};

async function newPage(browser, { signedOut }) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  await context.addInitScript(CSP_LISTENER);
  if (signedOut) await context.addInitScript(() => { try { localStorage.setItem("__stub_fauth", "false"); } catch (e) { /* 無視 */ } });
  const page = await context.newPage();
  const errors = [], cspConsole = [], aborted = [], ws = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => {
    const t = m.text();
    if (/Content Security Policy|Refused to (load|connect|execute|frame|create)/i.test(t)) cspConsole.push(t);
    else if (m.type() === "error") errors.push("console: " + t);
  });
  page.on("websocket", w => ws.push(w.url()));
  // 計測の送信は外へ出さない（CSP の判定はここより前に起きる）
  // abort すると console に「Failed to load resource」が出てエラーと区別できないので、空の 204 で返す
  await page.route(/(google-analytics\.com|analytics\.google\.com|doubleclick\.net)\//, r => { aborted.push(r.request().url()); return r.fulfill({ status: 204, body: "" }); });
  await page.route(/https:\/\/us\.i\.posthog\.com\//, r => { aborted.push(r.request().url()); return r.fulfill({ status: 204, body: "" }); });
  return { context, page, errors, cspConsole, aborted, ws };
}

const textHas = (page, s, timeout = 30000) =>
  page.waitForFunction(t => document.body.innerText.includes(t), s, { timeout }).then(() => true, () => false);
// ボタンの先頭行で探す（PDF の「全データ」は2行目に説明を持つ）
const clickText = (page, label) => page.evaluate(l => {
  const b = [...document.querySelectorAll("button")].find(x => x.innerText.trim().split("\n")[0].trim() === l);
  if (!b) return false; b.click(); return true;
}, label);
const cspOf = page => page.evaluate(() => window.__csp || []);

(async () => {
  const R = {};
  const srv = await startServer(stubIndexHtml(makeStub({ seed: stubSeed(), uid: UID, view: "admin", tab: "edit" })));
  const ORIGIN = `http://localhost:${srv.address().port}`;
  const browser = await pw.chromium.launch({ headless: true });
  try {
    // 0. 静的: meta があり、必須の指示が入っている
    {
      const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
      const m = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
      const csp = m ? m[1] : "";
      const firstScript = html.search(/<script[\s>]/);
      R.static = {
        present: !!m,
        beforeScripts: !!m && html.indexOf(m[0]) < firstScript,
        hasObjectNone: /object-src 'none'/.test(csp),
        hasBaseUri: /base-uri 'self'/.test(csp),
        hasFormAction: /form-action /.test(csp),
        hasFrameSrc: /frame-src /.test(csp),
        hasWorkerSrc: /worker-src /.test(csp),
        hasImgData: /img-src [^;]*data:[^;]*blob:/.test(csp),
      };
    }

    // A. 本物の Firebase SDK（dev）
    if (!process.env.SHIFTY_SKIP_REAL) {
      const h = await newPage(browser, { signedOut: false });
      const A = {};
      R.real = A; // 途中で例外になっても、そこまでの値を残す
      await h.page.goto(`${ORIGIN}/`, { waitUntil: "load", timeout: 60000 });
      A.loginScreen = await textHas(h.page, "管理コードで参加", 60000);
      A.anonymous = await h.page.waitForFunction(() => { const u = window.firebase && firebase.auth().currentUser; return !!(u && u.isAnonymous); }, null, { timeout: 30000 }).then(() => true, () => false);
      A.rtdbConnected = await h.page.evaluate(() => new Promise(res => {
        const ref = firebase.database().ref(".info/connected");
        const t = setTimeout(() => { ref.off(); res(false); }, 20000);
        ref.on("value", s => { if (s.val() === true) { clearTimeout(t); ref.off(); res(true); } });
      }));
      A.websocket = h.ws.filter(u => /^wss:\/\/[^/]*firebaseio\.com\//.test(u));
      A.libs = await h.page.evaluate(() => ({ exceljs: typeof ExcelJS !== "undefined", jspdf: !!(window.jspdf && window.jspdf.jsPDF), html2canvas: typeof window.html2canvas === "function", babel: typeof Babel !== "undefined", react: typeof React !== "undefined" }));
      // 計測タグ: gtag.js と PostHog の array.js が読み込まれたか（localhost では PostHog は送信を止める）
      A.analytics = await h.page.evaluate(() => ({
        gtag: [...document.scripts].some(s => /googletagmanager\.com\/gtag\/js/.test(s.src)) && !!(window.google_tag_manager || window.google_tag_data),
        posthog: !!(window.posthog && window.posthog.__loaded),
      }));
      // ライブラリを実際に動かす（html2canvas は iframe に複製して描く・jsPDF は画像を埋める・ExcelJS は zip を作る）
      A.libRun = await h.page.evaluate(async () => { try {
        const d = document.createElement("div"); d.style.cssText = "position:fixed;left:-3000px;top:0;padding:8px;background:#fff"; d.innerHTML = "<table><tr><td>テスト</td><td style=\"background:url('data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E')\">9</td></tr></table>";
        document.body.appendChild(d);
        const c = await window.html2canvas(d, { scale: 1 }); d.remove();
        const pdf = new window.jspdf.jsPDF(); pdf.addImage(c.toDataURL("image/jpeg", 0.9), "JPEG", 5, 5, 50, 20);
        const pdfBytes = pdf.output("arraybuffer").byteLength;
        const wb = new ExcelJS.Workbook(); wb.addWorksheet("s").getCell("A1").value = "x";
        const xl = (await wb.xlsx.writeBuffer()).byteLength;
        return { canvas: c.width > 0, pdfBytes, xl };
      } catch (e) { return { error: e.message }; } });
      A.cspBeforePopup = await cspOf(h.page);
      // Google ログインのポップアップ（gapi の読み込みと authDomain の iframe が CSP を通るか）。ログイン画面を開いて閉じるだけ
      const popupP = h.page.context().waitForEvent("page", { timeout: 20000 }).catch(() => null);
      A.googleClicked = await h.page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => x.innerText.includes("Googleでログイン")); if (!b) return false; b.click(); return true; });
      const popup = await popupP;
      A.popupOpened = !!popup;
      A.authIframe = await h.page.waitForFunction(() => [...document.querySelectorAll("iframe")].some(f => /\/__\/auth\/iframe/.test(f.src)), null, { timeout: 20000 }).then(() => true, () => false);
      A.gapi = await h.page.evaluate(() => [...document.scripts].some(s => /apis\.google\.com\/js\/api\.js/.test(s.src)));
      if (popup) { A.popupUrlHost = (() => { try { return new URL(popup.url()).host; } catch (e) { return popup.url(); } })(); await popup.close().catch(() => {}); }
      await h.page.waitForTimeout(1500);
      A.csp = await cspOf(h.page);
      A.cspConsole = h.cspConsole.slice();
      A.errors = h.errors.slice();
      A.abortedCount = h.aborted.length;
      await h.context.close();
    }

    // B. スタブ: Excel出力・PDF出力・Service Worker
    {
      const h = await newPage(browser, { signedOut: false });
      const B = {};
      R.stub = B;
      const downloads = [];
      h.page.on("download", d => downloads.push(d.suggestedFilename()));
      await h.page.goto(`${ORIGIN}/stub.html`, { waitUntil: "load", timeout: 60000 });
      B.editTab = await textHas(h.page, "操作方法（セル入力コマンド・色の意味）");
      B.excelClicked = await clickText(h.page, "Excel出力");
      B.excelToast = await textHas(h.page, ".xlsx をダウンロードしました", 20000);
      B.pdfOpened = await clickText(h.page, "PDF出力");
      await h.page.waitForTimeout(300);
      B.pdfAllClicked = await clickText(h.page, "全データ");
      B.pdfToast = await textHas(h.page, ".pdf をダウンロードしました", 60000);
      await h.page.waitForTimeout(800);
      B.downloads = downloads.slice();
      B.sw = await h.page.evaluate(async () => {
        if (!("serviceWorker" in navigator)) return "no-sw";
        try { const r = await navigator.serviceWorker.register("sw.js", { scope: "./" }); await r.unregister(); return "ok"; }
        catch (e) { return "error: " + e.message; }
      });
      B.csp = await cspOf(h.page);
      // C. 対照: 許可していない先の画像は止まる（CSP が実際に効いている）
      B.controlBlocked = await h.page.evaluate(() => new Promise(res => {
        const before = window.__csp.length;
        const img = new Image(); img.src = "https://example.com/csp-control.png"; document.body.appendChild(img);
        setTimeout(() => res(window.__csp.slice(before).some(v => v.directive === "img-src" && /example\.com/.test(v.blocked))), 1500);
      }));
      B.cspConsole = h.cspConsole.filter(t => !/example\.com/.test(t));
      B.errors = h.errors.slice();
      await h.context.close();
    }
  } catch (e) {
    R.exception = e.stack || e.message;
  }
  await browser.close();
  srv.close();
  const s = R.static || {}, B = R.stub || {};
  // A を飛ばしたときだけ real_* を通す（例外で A が途中までのときは、そのまま値で判定する）
  const skipReal = !!process.env.SHIFTY_SKIP_REAL;
  const A = R.real || { libs: {}, csp: [null], cspConsole: [], errors: [], websocket: [] };
  const realOk = skipReal ? true : null;
  R.verdict = {
    cspPresent: !!(s.present && s.beforeScripts && s.hasObjectNone && s.hasBaseUri && s.hasFormAction && s.hasFrameSrc && s.hasWorkerSrc && s.hasImgData),
    real_loginScreen: realOk ?? !!A.loginScreen,
    real_anonymousSignIn: realOk ?? !!A.anonymous,
    real_rtdbWebSocket: realOk ?? !!(A.rtdbConnected && A.websocket && A.websocket.length > 0),
    real_libsLoaded: realOk ?? !!(A.libs && Object.keys(A.libs).length && Object.values(A.libs).every(Boolean)),
    real_libsRun: realOk ?? !!(A.libRun && A.libRun.canvas && A.libRun.pdfBytes > 0 && A.libRun.xl > 0),
    real_analyticsLoaded: realOk ?? !!(A.analytics && A.analytics.gtag && A.analytics.posthog),
    real_googlePopup: realOk ?? !!(A.popupOpened && A.authIframe && A.gapi),
    real_noViolation: realOk ?? !!(A.csp && A.csp.length === 0 && A.cspConsole.length === 0),
    real_noErrors: realOk ?? !!(A.errors && A.errors.length === 0),
    stub_excel: !!(B.excelClicked && B.excelToast),
    stub_pdf: !!(B.pdfOpened && B.pdfAllClicked && B.pdfToast),
    stub_serviceWorker: B.sw === "ok",
    stub_noViolation: !!(B.csp && B.csp.filter(v => !/example\.com/.test(v.blocked)).length === 0 && B.cspConsole.length === 0),
    stub_noErrors: !!(B.errors && B.errors.length === 0),
    control_blocked: !!B.controlBlocked,
    noException: !R.exception,
  };
  R.verdict.allPass = Object.values(R.verdict).every(Boolean);
  console.log(JSON.stringify(R, null, 2));
  process.exit(R.verdict.allPass ? 0 : 1);
})();
