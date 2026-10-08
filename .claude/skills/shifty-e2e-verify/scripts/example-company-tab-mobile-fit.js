// 企業連携タブの横はみ出しの回帰テスト（2026-10-04）。
// **本物の index.html を配信する**（このスクリプトを書いた時点の mount-component.js は index.html の `*{box-sizing:border-box}` を持たず、
// width:100%＋padding の入力欄が content-box で測られ、本番では起きない 1〜2px のはみ出しを報告した。
// H1 が記録した「企業アカウントを作成」フォームの 376px はこの測り方の産物で、本物の index.html では 375px・320px とも 0px だった。
// 2026-10-04 から mount-component.js も index.html の <style> を既定で入れるが、ここは index.html の body の構造ごと確かめるので本物を配信したままにする）。Firebase の CDN 5本だけを stub-firebase.js に差し替える。
//
// 場面は2つ。A=企業未作成（企業アカウントでログイン・企業アカウントを作成・連携店舗）、
// B=企業ログイン後・Premium（提出状況・企業内登録スタッフ・ダッシュボード・企業アカウント・連携店舗・法人・企業の共通設定）。
// それぞれ「開いた直後」「連携店舗を全部開く」「パスワード変更・管理コードで追加・法人の設定を開く」の3段で測る。
//
//  1. 375px と 320px で documentElement.scrollWidth <= clientWidth（ページが横に動かない）
//  2. カード（AC）の中の要素がカードの外へ出ない。ただし overflow-x:auto 等の枠の中（表が意図して横スクロールする箇所）は数えない
//  3. 入力欄（input・select・textarea）の fontSize が 16px 以上
//  4. 1280px でもはみ出しが無く、maxWidth を足した select（法人の絞り込み・残業予定の配り方）が PC では縮んでいない
//     （maxWidth を外したときの幅と同じ＝PC の見た目は変えていない）
//  5. console.error・pageerror が 0 件
//
// 修正前（869818b）では B の 320px で、企業の共通設定の「残業予定の配り方」select がページを 27px 広げ（カードからは 42px）、
// 法人の絞り込み select が提出状況・ダッシュボードのカードから 8px 出て落ちる。
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-company-tab-mobile-fit.js → allPass=true / EXIT=0
//       SHIFTY_ENGINE=webkit でも同じ結果になる
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { REPO_ROOT } = require(path.join(__dirname, "mount-component.js"));
const { makeStub } = require(path.join(__dirname, "stub-firebase.js"));
const cfc = require(path.join(REPO_ROOT, "functions", "company-config.js"));
const ROOT = process.env.SHIFTY_ROOT || REPO_ROOT;
const ENGINE = process.env.SHIFTY_ENGINE || "chromium";

const PW_CANDIDATES = [
  path.join(process.env.HOME || "", ".claude/skills/rendered-contrast-check/node_modules/playwright-core"),
  path.join(process.env.HOME || "", ".claude/skills/shifty-e2e-verify/node_modules/playwright-core"),
  "playwright-core", "playwright",
];
const pw = (() => { for (const c of PW_CANDIDATES) { try { return require(c); } catch (e) { /* 次の候補 */ } } throw new Error("playwright-core が見つかりません"); })();
const MIME = { ".js": "application/javascript; charset=utf-8", ".html": "text/html; charset=utf-8", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };

const UID = "U1", CID = "C1";
const per = (id, sid) => ({ id, urlToken: "tok" + id, shopId: sid, label: "10月", startDate: "2026-10-01", endDate: "2026-10-31", deadlineDate: "", createdAt: "2026-09-01T00:00:00.000Z" });
// A: 企業未作成。長い店舗名を1つ入れる
const seedNoCompany = () => ({
  global: { shops: { S2: { id: "S2", name: "B店" }, S4: { id: "S4", name: "とても長い名前の店舗 梅田茶屋町本店" } } },
  shops: {
    S2: { owners: { [UID]: "K2" }, private: { adminKey: "K2" }, staff: { 0: "鈴木" }, settings: { shopId: "S2", candidates: [], shopAbbrs: ["三"] } },
    S4: { owners: { [UID]: "K4" }, private: { adminKey: "K4" }, staff: { 0: "田中" } },
  },
  accounts: { S2: { plan: "premium" }, [UID]: { shops: { S2: true, S4: true } } },
});
// B: 企業ログイン後。法人2つ（長い法人名）・本部・企業の共通設定に属性の制限あり
const seedCompany = () => {
  const names = { S1: "A店", S2: "B店", S3: "とても長い名前の店舗 梅田茶屋町本店" };
  const pub = {
    name: "テスト企業株式会社ホールディングス", ownerUid: UID, code: "ABCD1234", shops: { S1: true, S2: true, S3: true },
    config: { settings: { staffTypeLimits: { parttime: { weekly: 30 } } } },
    entities: { E1: { name: "テスト企業" }, E2: { name: "とても長い名前の乙法人株式会社", settings: { laborSettings: { fixedOvertimeMin: 2700 } } } },
    defaultEntityId: "E1", shopEntities: { S1: "E1", S2: "E2", S3: "E1" }, shopKinds: { S3: "hq" },
  };
  const sh = (sid, staff) => ({ owners: { [UID]: "K" + sid, ["company_" + CID]: "K" + sid }, private: { adminKey: "K" + sid }, staff,
    settings: { shopId: sid, candidates: [], staffNumbers: {} }, periods: { ["p" + sid]: per("p" + sid, sid) } });
  const s = {
    global: { shops: Object.fromEntries(Object.entries(names).map(([k, v]) => [k, { id: k, name: v }])) },
    shops: { S1: sh("S1", ["田中"]), S2: sh("S2", ["鈴木"]), S3: sh("S3", ["事務 花子"]) },
    accounts: { S1: { plan: "premium" }, S2: { plan: "premium" }, S3: { plan: "premium" },
      [UID]: { shops: { S1: true, S2: true, S3: true }, company: { companyId: CID, code: "ABCD1234", name: pub.name } } },
    companies: { [CID]: { pub } }, companyCodes: { ABCD1234: CID },
  };
  ["S1", "S2", "S3"].forEach(sid => { s.shops[sid].company = cfc.buildShopMirror(CID, pub, sid, names, "seed"); });
  return s;
};
const cfHandlers = { ...Object.fromEntries(["ensureCompanyEntities", "createEntity", "renameEntity", "assignShopEntity", "saveEntityConfig", "setShopKind"].map(n => [n, "entity"])),
  saveCompanyConfig: "companyConfig", ensureCompanyPeople: "people" };

function servedIndexHtml(stubHead) {
  const raw = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const fbTag = /\s*<script src="https:\/\/www\.gstatic\.com\/firebasejs\/[^"]+"[^>]*><\/script>/g;
  const n = (raw.match(fbTag) || []).length;
  if (n !== 5) throw new Error(`index.html の Firebase CDN が5本ではない（${n}本）`);
  let done = false;
  return raw.replace(fbTag, () => { if (done) return ""; done = true; return "\n" + stubHead; });
}

// ページ・カードのはみ出し、枠の中の横スクロール、入力欄の文字の大きさを測る
const MEASURE = () => {
  const de = document.documentElement, cw = de.clientWidth;
  const page = [], card = [], boxes = [], small = [];
  const cards = [...document.querySelectorAll("div")].filter(d => { const c = getComputedStyle(d); return c.paddingTop === "20px" && c.borderTopLeftRadius === "12px"; });
  const scrollAnc = el => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === "auto" || o === "scroll" || o === "hidden") return p; } return null; };
  const lab = el => el.tagName + (el.placeholder ? `[${el.placeholder}]` : "") + [...el.attributes].filter(a => a.name.startsWith("data-")).map(a => `[${a.name}]`).join("") + " " + (el.innerText || el.value || "").replace(/\s+/g, " ").slice(0, 24);
  for (const el of document.querySelectorAll("body *")) {
    const rc = el.getBoundingClientRect();
    if (rc.width === 0 || rc.height === 0) continue;
    const sa = scrollAnc(el);
    if (rc.right > cw + 0.5 && !sa) page.push({ el: lab(el), over: +(rc.right - cw).toFixed(1) });
    const c = cards.find(k => k.contains(el) && k !== el);
    if (c && !(sa && c.contains(sa))) {
      const cr = c.getBoundingClientRect();
      const ov = Math.max(rc.right - (cr.right - 1), (cr.left + 1) - rc.left);
      if (ov > 0.5) card.push({ card: (c.firstChild && c.firstChild.innerText || "").slice(0, 16), el: lab(el), over: +ov.toFixed(1) });
    }
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) && el.type !== "checkbox" && el.type !== "radio" && parseFloat(getComputedStyle(el).fontSize) < 16) small.push(lab(el));
  }
  for (const p of document.querySelectorAll("body *")) { const o = getComputedStyle(p).overflowX; if ((o === "auto" || o === "scroll") && p.scrollWidth > p.clientWidth + 1) boxes.push({ el: lab(p).slice(0, 40), sw: p.scrollWidth, cw: p.clientWidth }); }
  return { scrollWidth: de.scrollWidth, clientWidth: cw, page, card, boxes, small,
    createInputs: [...document.querySelectorAll('input[placeholder="例）〇〇フーズ"],input[placeholder="パスワード（8文字以上）"],input[placeholder="パスワード（確認）"]')].length };
};
// maxWidth を足した select が PC で縮んでいないか（maxWidth を外した幅と比べる）
const SELECT_WIDTHS = () => {
  const sels = [...document.querySelectorAll("select[data-co-entity-filter], [data-ot-prorate] select")];
  return sels.map(s => { const w = s.getBoundingClientRect().width; const keep = s.style.maxWidth; s.style.maxWidth = "none"; const natural = s.getBoundingClientRect().width; s.style.maxWidth = keep; return { w, natural }; });
};

async function run(browser, scene, width) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
  const html = servedIndexHtml(makeStub({ seed: scene === "company" ? seedCompany() : seedNoCompany(), uid: UID, view: "admin", tab: "company", cfHandlers }));
  await page.route("**/*", route => {
    const u = new URL(route.request().url());
    if (/googletagmanager\.com|google-analytics\.com|posthog\.com/.test(u.hostname)) return route.fulfill({ status: 200, contentType: MIME[".js"], body: "" });
    if (u.hostname !== "shifty.test") return route.continue();
    if (u.pathname === "/" || u.pathname === "/index.html") return route.fulfill({ contentType: MIME[".html"], body: html });
    const f = path.join(ROOT, decodeURIComponent(u.pathname).replace(/^\//, ""));
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return route.fulfill({ status: 404, body: "not found" });
    return route.fulfill({ contentType: MIME[path.extname(f)] || "application/octet-stream", body: fs.readFileSync(f) });
  });
  const R = { steps: {} };
  try {
    await page.goto("http://shifty.test/", { waitUntil: "networkidle" });
    await page.waitForFunction(t => document.body.innerText.includes(t), scene === "company" ? "企業の共通設定" : "企業アカウントを作成", { timeout: 20000 });
    if (scene === "company") await page.waitForSelector("[data-co-entity]", { timeout: 15000 });
    await page.waitForTimeout(800);
    R.steps.initial = await page.evaluate(MEASURE);
    // 連携店舗のカードを全部開く（略称・2セル表示用の欄が出る）
    R.shopsOpened = await page.evaluate(() => { const ds = [...document.querySelectorAll("div")].filter(d => d.style.cursor === "pointer" && d.innerText.includes("▶")); ds.forEach(d => d.click()); return ds.length; });
    await page.waitForTimeout(600);
    R.steps.shopsOpen = await page.evaluate(MEASURE);
    R.clicked = await page.evaluate(() => {
      const click = t => { const bs = [...document.querySelectorAll("button")].filter(x => x.innerText.trim() === t); bs.forEach(b => b.click()); return bs.length; };
      return { pw: click("パスワードを変更する"), add: click("＋ 管理コードで追加"), entity: click("法人の設定") };
    });
    await page.waitForTimeout(600);
    R.steps.formsOpen = await page.evaluate(MEASURE);
    if (width >= 1000) R.selects = await page.evaluate(SELECT_WIDTHS);
  } catch (e) { R.exception = e.message; }
  R.errors = errors;
  await context.close();
  return R;
}

(async () => {
  const browser = await pw[ENGINE].launch({ headless: true });
  const R = {};
  for (const scene of ["noCompany", "company"]) for (const w of [375, 320, 1280]) R[`${scene}_${w}`] = await run(browser, scene, w);
  await browser.close();
  const fits = r => !!r && !r.exception && Object.values(r.steps).length === 3 && Object.values(r.steps).every(m => m.scrollWidth <= m.clientWidth && m.page.length === 0 && m.card.length === 0 && m.small.length === 0);
  const v = {};
  for (const [k, r] of Object.entries(R)) v[`fit_${k}`] = fits(r);
  // 場面が意図どおり描けていること（素通りしないため）
  v.noCompany_createFormShown = ["noCompany_375", "noCompany_320"].every(k => R[k].steps.initial && R[k].steps.initial.createInputs === 3);
  v.company_formsOpened = ["company_375", "company_320"].every(k => R[k].clicked && R[k].clicked.pw === 1 && R[k].clicked.add === 1 && R[k].clicked.entity === 2 && R[k].shopsOpened === 3);
  v.pc_selectsNotShrunk = ["company_1280"].every(k => Array.isArray(R[k].selects) && R[k].selects.length >= 4 && R[k].selects.every(s => Math.abs(s.w - s.natural) < 0.5));
  v.noErrors = Object.values(R).every(r => r.errors.length === 0 && !r.exception);
  v.allPass = Object.values(v).every(Boolean);
  // 枠の中で横スクロールする表（対象外。記録だけ）
  const scrollBoxes = Object.fromEntries(Object.entries(R).map(([k, r]) => [k, r.steps.initial ? r.steps.initial.boxes : null]));
  const fails = Object.fromEntries(Object.entries(R).map(([k, r]) => [k, Object.fromEntries(Object.entries(r.steps).map(([s, m]) => [s, { sw: m.scrollWidth, cw: m.clientWidth, page: m.page, card: m.card, small: m.small }]))]));
  console.log(JSON.stringify({ engine: ENGINE, root: ROOT, verdict: v, scrollBoxes, measured: fails, selects: R.company_1280.selects, errors: Object.fromEntries(Object.entries(R).map(([k, r]) => [k, r.errors.concat(r.exception ? [r.exception] : [])])) }, null, 2));
  process.exit(v.allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
