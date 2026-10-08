// 計測（GA4・PostHog）に送る URL の伏せ字（2026-10-08）のユニットテスト。
// 規則は index.html の head の analytics-mask の印の間にある（PostHog の array.js は async で app-*.js より先に動くことがあるので
// app-utils.js には置けない）。ここではその script を index.html から取り出して実行する＝index.html を直せばテストも追随する。
// 送信の実測（本物の posthog-js と gtag.js が何を送るか）は .claude/skills/shifty-e2e-verify/scripts/example-analytics-mask.js
"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const HTML = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
function load() {
  const m = /\/\* analytics-mask:start \*\/([\s\S]*?)\/\* analytics-mask:end \*\//.exec(HTML);
  assert.ok(m, "index.html に analytics-mask の印がある");
  const ctx = {};
  vm.runInNewContext(m[1] + "\nthis.mask=shiftyMaskUrlText;this.scrub=shiftyScrubForAnalytics;", ctx);
  return ctx;
}

test("伏せ字: スタッフURL・個別URL・旧形式のトークンを伏せ、#/admin・#/demo・#/me は残す", () => {
  const { mask } = load();
  assert.strictEqual(mask("https://shiftyshifty.app/#/m/AbCdEf0123456789xyzABCDE"), "https://shiftyshifty.app/#/m/:token");
  assert.strictEqual(mask("https://shiftyshifty.app/#/s/ab23cdef"), "https://shiftyshifty.app/#/s/:token");
  assert.strictEqual(mask("https://shiftyshifty.app/#/ab23cdef"), "https://shiftyshifty.app/#/:token");
  assert.strictEqual(mask("https://shiftyshifty.app/#p=ab23cdef"), "https://shiftyshifty.app/#/:token");
  for (const keep of ["#/admin", "#/demo", "#/me", "#/me/"]) assert.strictEqual(mask("https://shiftyshifty.app/" + keep), "https://shiftyshifty.app/" + keep);
  // 文中（録画の DOM の文字・自動取得の要素の href）でも伏せる。CSS の色は触らない
  assert.strictEqual(mask("私のURL https://shiftyshifty.app/#/m/TOKEN1 です"), "私のURL https://shiftyshifty.app/#/m/:token です");
  assert.strictEqual(mask('a:nth-child(1):attr__href="#/s/TOK"'), 'a:nth-child(1):attr__href="#/s/:token"');
  assert.strictEqual(mask("color:#fff;background:#F87036"), "color:#fff;background:#F87036");
  assert.strictEqual(mask(""), "");
  assert.strictEqual(mask(12), 12);
});

test("伏せ字: メールリンクの oobCode・apiKey・continueUrl・elh の値を伏せ、他のクエリは残す", () => {
  const { mask } = load();
  const cont = encodeURIComponent("https://shiftyshifty.app/?elk=staff&elh=" + encodeURIComponent("#/m/TOK"));
  assert.strictEqual(
    mask(`https://shiftyshifty.app/?mode=signIn&oobCode=OOB123&apiKey=AIzaXYZ&continueUrl=${cont}&lang=ja#/m/TOK2`),
    "https://shiftyshifty.app/?mode=signIn&oobCode=:redacted&apiKey=:redacted&continueUrl=:redacted&lang=ja#/m/:token");
  assert.strictEqual(mask("https://shiftyshifty.app/?elk=staff&elh=%23%2Fm%2FTOK"), "https://shiftyshifty.app/?elk=staff&elh=:redacted");
  // 伏せる名前に無いパラメータの中に、エンコードされたトークンが入っていても伏せる
  assert.strictEqual(mask("https://x.test/?next=%23%2Fs%2Fab23cdef&plan=pro"), "https://x.test/?next=%23%2Fs%2F%3Atoken&plan=pro");
  assert.strictEqual(mask("https://shiftyshifty.app/?plan=premium&openExternalBrowser=1"), "https://shiftyshifty.app/?plan=premium&openExternalBrowser=1");
});

test("伏せ字: PostHog のイベントの入れ子（properties・$set_once・配列）の文字列を全部伏せ、数値・日時は変えない", () => {
  const { scrub } = load();
  const at = new Date(0);
  const ev = {
    event: "$pageview", timestamp: at,
    properties: { $current_url: "https://a/#/m/T1", n: 3, list: ["#/s/T2", { href: "https://a/?oobCode=X#/m/T3" }] },
    $set_once: { $initial_current_url: "https://a/#/s/T4" },
  };
  const out = scrub(ev, 0);
  assert.strictEqual(out.properties.$current_url, "https://a/#/m/:token");
  assert.strictEqual(out.properties.n, 3);
  assert.strictEqual(out.properties.list[0], "#/s/:token");
  assert.strictEqual(out.properties.list[1].href, "https://a/?oobCode=:redacted#/m/:token");
  assert.strictEqual(out.$set_once.$initial_current_url, "https://a/#/s/:token");
  assert.strictEqual(out.timestamp, at);
  assert.ok(!/T[1-4]\b/.test(JSON.stringify(out)), "伏せ残しが無い");
});

test("伏せ字: index.html の GA と PostHog の初期化が伏せ字を通し、定義は計測の読み込みより前にある", () => {
  assert.ok(HTML.includes("gtag('config', 'G-P8RP0TG9JG', { page_location: shiftyMaskUrlText(location.href.split('#')[0]), page_referrer: shiftyMaskUrlText(document.referrer) });"),
    "GA の config に、ハッシュを落としクエリを伏せた page_location と伏せた page_referrer を渡す");
  assert.ok(HTML.includes("before_send: function(ev) { try { return shiftyScrubForAnalytics(ev, 0); } catch (e) { return null; } }"),
    "PostHog の before_send で伏せ、失敗したら送らない");
  const at = HTML.indexOf("analytics-mask:start");
  assert.ok(at > 0 && at < HTML.indexOf("googletagmanager.com/gtag/js") && at < HTML.indexOf("posthog.init("), "定義は計測の読み込みより前");
});
