// PostHog と GA4 に送る URL から、スタッフURLのトークンとメールリンクの鍵を伏せる（2026-10-08）の回帰テスト。
//
// スタッフ個別URL（#/m/<pageToken>）は**知っている人なら誰でもその人のデータを読める鍵**で、スタッフURL（#/s/<token>）も
// 店舗の提出画面の鍵、メールリンクの oobCode・apiKey・continueUrl は登録の続きに使う値。計測には URL がそのまま載るので、
// index.html の計測の初期化で伏せてから送る。ここでは**本物の posthog-js（us-assets の array.js）と gtag.js を読み込み**、
// 送信を route で捕まえて中身（gzip・base64 を戻した本文と URL）を調べる。送信は 204 で返して外へ出さない。
// Firebase はスタブ（stub-firebase.js）で外へ出ない。ホスト名を shifty.test にする（localhost だと PostHog が送信を止めるため）。
//
// 場面: ① ?oobCode=…&apiKey=…#/m/<token> で開く（GA4 はハッシュを送らないがクエリは送る） ② #/s/<token> へハッシュを変える ③ history.replaceState でメールリンクの形
//       （?mode=signIn&oobCode=…&apiKey=…&continueUrl=…（中に elh=#/m/…）#/m/…）にする ④ #/me（伏せない経路）へ
//       ⑤ アプリの ph() と同じく posthog.capture に URL を含む独自の属性を付けて送る。
// 判定: 捕まえた送信のどれにも秘密の文字列（SECRET…）が無く、PostHog と GA の両方が実際に送っていて、伏せた形
//       （#/m/:token・oobCode=:redacted）と伏せない経路（#/me）が PostHog の送信に残っていること。
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-analytics-mask.js → allPass=true / EXIT=0
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
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

function stubIndexHtml(stubHead) {
  const raw = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const fbTag = /\s*<script src="https:\/\/www\.gstatic\.com\/firebasejs\/[^"]+"[^>]*><\/script>/g;
  let done = false;
  return raw.replace(fbTag, () => { if (done) return ""; done = true; return "\n" + stubHead; });
}

// 送信の本文を読める文字列に戻す（gzip・base64・URL エンコード）
function decodeBody(buf, url) {
  if (!buf || !buf.length) return "";
  const out = [];
  try { out.push(zlib.gunzipSync(buf).toString("utf8")); } catch (e) { /* gzip でない */ }
  const txt = buf.toString("utf8");
  out.push(txt);
  try { out.push(decodeURIComponent(txt.replace(/\+/g, " "))); } catch (e) { /* 無視 */ }
  const m = /(?:^|&)data=([^&]+)/.exec(txt);
  if (m) { try { out.push(Buffer.from(decodeURIComponent(m[1]), "base64").toString("utf8")); } catch (e) { /* 無視 */ } }
  if (/compression=base64/.test(url)) { try { out.push(Buffer.from(txt, "base64").toString("utf8")); } catch (e) { /* 無視 */ } }
  return out.join("\n");
}
const decodeUrl = u => { try { return u + "\n" + decodeURIComponent(u); } catch (e) { return u; } };

(async () => {
  const R = {};
  const html = stubIndexHtml(makeStub({ seed: { global: { shops: {} }, shops: {}, accounts: {} }, uid: "U1", view: "staff", tab: "periods" }));
  const browser = await pw.chromium.launch({ headless: true });
  // PostHog はヘッドレスのブラウザをボットとして扱い何も送らない（2026-10-08 実測: navigator.webdriver が true だと $pageview すら作らない）。
  // 送信の中身を調べるため、UA を通常の Chrome にし、webdriver を false に見せる
  const context = await browser.newContext({ viewport: { width: 390, height: 844 },
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36" });
  await context.addInitScript(() => { Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false }); });
  const page = await context.newPage();
  const sent = { ph: [], ga: [] };
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.route("**/*", async route => {
    const req = route.request();
    const u = new URL(req.url());
    if (u.hostname === "us.i.posthog.com") {
      sent.ph.push({ url: req.url(), text: decodeUrl(req.url()) + "\n" + decodeBody(req.postDataBuffer(), req.url()) });
      if (/\/flags/.test(u.pathname)) return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      return route.fulfill({ status: 200, contentType: "application/json", body: "{\"status\":1}" });
    }
    if (/google-analytics\.com$|analytics\.google\.com$|doubleclick\.net$/.test(u.hostname)) {
      sent.ga.push({ url: req.url(), text: decodeUrl(req.url()) + "\n" + decodeBody(req.postDataBuffer(), req.url()) });
      return route.fulfill({ status: 204, body: "" });
    }
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
  try {
    await page.goto("http://shifty.test/?oobCode=SECRETOOB0&apiKey=SECRETAPIKEY0&lang=ja#/m/SECRETPAGETOKEN1", { waitUntil: "load", timeout: 60000 });
    await page.waitForFunction(() => window.posthog && window.posthog.__loaded, null, { timeout: 30000 });
    await page.waitForTimeout(2500);
    await page.evaluate(() => { location.hash = "#/s/SECRETSTAFFTOKEN2"; });
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      const cont = "http://shifty.test/?elk=staff&elh=" + encodeURIComponent("#/m/SECRETPAGETOKEN3");
      history.replaceState(null, "", "/?mode=signIn&oobCode=SECRETOOB4&apiKey=SECRETAPIKEY5&continueUrl=" + encodeURIComponent(cont) + "&lang=ja#/m/SECRETPAGETOKEN6");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await page.waitForTimeout(1500);
    // PostHog の history_change はパスが変わったときだけ $pageview を送る（ハッシュだけの変化では送らない）ので、#/me は独自イベントで送る
    await page.evaluate(() => { history.pushState(null, "", "/#/me"); window.posthog.capture("probe_me", { link: location.href }); });
    await page.waitForTimeout(1500);
    // アプリの ph() と同じ経路で、URL を含む属性を付けて送る
    await page.evaluate(() => { history.replaceState(null, "", "/?oobCode=SECRETOOB7#/m/SECRETPAGETOKEN8"); window.posthog.capture("probe_event", { link: location.href, nested: { u: "#/s/SECRETSTAFF9" } }); });
    await page.waitForTimeout(4500);
    // 未送信のものを出し切る（PostHog は待ち行列を数秒ごとに送る）
    await page.evaluate(() => { try { window.posthog._requestQueue && window.posthog._requestQueue.unload && window.posthog._requestQueue.unload(); } catch (e) { /* 無視 */ } });
    await page.waitForTimeout(1500);
    R.phVersion = await page.evaluate(() => window.posthog && (window.posthog.version || (window.posthog.LIB_VERSION)));
  } catch (e) {
    R.exception = e.stack || e.message;
  }
  await browser.close();
  const all = [...sent.ph, ...sent.ga];
  const leaks = [];
  for (const s of all) { const m = s.text.match(/SECRET[A-Z]+\d/g); if (m) leaks.push(...m); }
  const phText = sent.ph.map(s => s.text).join("\n");
  const gaText = sent.ga.map(s => s.text).join("\n");
  R.counts = { ph: sent.ph.length, ga: sent.ga.length };
  R.leaks = [...new Set(leaks)];
  R.samples = {
    phCurrentUrls: [...new Set((phText.match(/"\$current_url"\s*:\s*"[^"]*"/g) || []))].slice(0, 12),
    gaDl: [...new Set((gaText.match(/[?&]dl=[^&\s]*/g) || []).map(x => { try { return decodeURIComponent(x); } catch (e) { return x; } }))].slice(0, 12),
  };
  // 送信に載っていた URL の形（伏せ方の確認用）。送り先ごとに、出てきた形を重複なしで並べる
  const urlsOf = t => [...new Set(t.match(/https?:\/\/shifty\.test\/[^"\s\\&,]*(?:&[^"\s\\,]*)?/g) || [])];
  R.urlsSeen = { ph: urlsOf(phText).slice(0, 30), ga: urlsOf(gaText).slice(0, 30), gaEvents: [...new Set((gaText.match(/[?&]en=[a-z_]+/g) || []))] };
  R.errors = errors;
  R.verdict = {
    phSent: sent.ph.length > 0 && /\$pageview/.test(phText),
    gaSent: sent.ga.length > 0 && /page_view/.test(gaText),
    phProbeSent: /probe_event/.test(phText),
    noLeak: R.leaks.length === 0,
    phMaskedHash: /#\/m\/:token/.test(phText) && /#\/s\/:token/.test(phText),
    phMaskedQuery: /oobCode=:redacted/.test(phText),
    gaMaskedQuery: /oobCode=:redacted/.test(gaText),
    phKeepsMe: /shifty\.test\/#\/me"/.test(phText),
    gaNoHash: !/[?&]dl=[^&]*%23|[?&]dl=[^&]*#/.test(sent.ga.map(x => x.url).join("\n")),
    noException: !R.exception,
  };
  R.verdict.allPass = Object.values(R.verdict).every(Boolean);
  console.log(JSON.stringify(R, null, 2));
  process.exit(R.verdict.allPass ? 0 : 1);
})();
