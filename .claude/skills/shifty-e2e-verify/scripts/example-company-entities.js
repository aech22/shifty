// 法人レイヤー（2026-09-30・労務給与_複数法人_実装計画.md P1）の実ブラウザ回帰テスト。
// アプリ全体をスタブ Firebase（stub-firebase.js）で動かす。Firebase へは1バイトも出ない。
// 法人の CF（ensureCompanyEntities など6本）はスタブが functions/company-config.js をそのまま読み込んで
// 同じ規則（planEntityMigration・buildShopMirror）で後始末する。CF 本体の権限・入力検証は tests/core.test.js と
// 本番デプロイ後の実データ確認の領分で、ここでは測らない。
//
//  A. 法人の無い既存企業（移行前）で企業連携タブを開く
//     - 法人カードが ensureCompanyEntities を1回だけ呼び、企業名と同名の法人が1つでき、全店舗がそこに割り当たる
//     - 写し shops/{sid}/company に entityId/entityName が入り、settings は移行前と同じ（見た目が変わらない）
//     - 法人が1つの間は提出状況・企業内登録スタッフに法人の絞り込みが出ない
//  B. 法人の追加・店舗の割当・本部の種別・法人の設定
//     - 「＋ 追加」で法人ができ、店舗の法人を変えると写しの entityId/entityName が変わる
//     - 種別を「本部」にすると pub/shopKinds と写しの kind が hq になる
//     - 法人の設定（固定残業）はその法人の店舗の写しにだけ焼かれる
//     - 提出状況に法人の絞り込みと法人の見出しが出て、絞ると他法人の店舗が消える
//     - 企業内登録スタッフで別法人の同じ従業員番号は別行、本部の所属は「本部」の見出し
//  C. 法人の設定が効いている店舗の設定タブで、その項目が「企業設定」の固定表示になる
//  D. 本部店舗の期間管理タブでスタッフ提出URLが出ず、「URLを表示」で出せる
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-company-entities.js → allPass=true / EXIT=0
"use strict";
const path = require("node:path");
const { openHarness, REPO_ROOT } = require(path.join(__dirname, "mount-component.js"));
const { makeStub } = require(path.join(__dirname, "stub-firebase.js"));
const cfc = require(path.join(REPO_ROOT, "functions", "company-config.js"));
const ROOT = process.env.SHIFTY_ROOT || REPO_ROOT;
const THEME = `<style>:root{--c-bg:#F0F2F5;--c-card:#FFFFFF;--c-input:#F3F4F6;--c-input2:#F0F2F5;` +
  `--c-border:#E5E7EB;--c-border2:#D1D5DB;--c-text:#1A1A2E;--c-text2:#374151;--c-text3:#6B7280;` +
  `--c-text4:#9CA3AF;--c-shadow:rgba(0,0,0,.06);--c-accent:#f87036;--c-danger:#DC2626;}</style>`;
const UID = "U1", CID = "C1";
const ENTITY_CFS = ["ensureCompanyEntities", "createEntity", "renameEntity", "assignShopEntity", "saveEntityConfig", "setShopKind"];
const cfHandlers = Object.fromEntries(ENTITY_CFS.map(n => [n, "entity"]));
const per = (id, sid, start, end) => ({ id, urlToken: "tok" + id, shopId: sid, label: id, startDate: start, endDate: end, deadlineDate: "", createdAt: "2026-09-01T00:00:00.000Z" });
const shop = (sid, staff, settings, periods) => ({ owners: { [UID]: "K" + sid }, private: { adminKey: "K" + sid }, staff, settings: { shopId: sid, candidates: [], ...settings }, periods });
const coSettings = { staffTypeLimits: { parttime: { weekly: 30 } } };
// 移行前の企業（法人なし）。写しは P1 より前の形（entityId なし）
const legacySeed = () => {
  const pub = { name: "テスト企業", ownerUid: UID, code: "ABCD1234", shops: { S1: true, S2: true, S3: true }, config: { settings: coSettings } };
  const names = { S1: "A店", S2: "B店", S3: "事務所" };
  const mirror = sid => ({ id: CID, name: "テスト企業", settings: coSettings, deadlines: {}, shops: names, syncedAt: "old" });
  return {
    global: { shops: { S1: { id: "S1", name: "A店" }, S2: { id: "S2", name: "B店" }, S3: { id: "S3", name: "事務所" } } },
    shops: {
      S1: { ...shop("S1", ["田中", "佐藤"], { staffNumbers: { "田中": "12", "佐藤": "3" } }, { p1: per("p1", "S1", "2026-10-01", "2026-10-31") }), company: mirror("S1") },
      S2: { ...shop("S2", ["田中 次郎"], { staffNumbers: { "田中 次郎": "12" } }, { p2: per("p2", "S2", "2026-10-01", "2026-10-31") }), company: mirror("S2") },
      S3: { ...shop("S3", ["事務 花子"], { staffNumbers: { "事務 花子": "90" } }, { p3: per("p3", "S3", "2026-10-01", "2026-10-31") }), company: mirror("S3") },
    },
    accounts: { S1: { plan: "premium" }, S2: { plan: "premium" }, S3: { plan: "premium" }, [UID]: { shops: { S1: true, S2: true, S3: true }, company: { companyId: CID, code: "ABCD1234", name: "テスト企業" } } },
    companies: { [CID]: { pub } },
  };
};
// 法人を持つ企業（C/D 用）。写しは CF と同じ関数で組み立てる
const entitySeed = currentShop => {
  const s = legacySeed();
  const pub = s.companies[CID].pub;
  Object.assign(pub, {
    entities: { E1: { name: "テスト企業" }, E2: { name: "乙法人", settings: { laborSettings: { fixedOvertimeMin: 2700 } } } },
    defaultEntityId: "E1", shopEntities: { S1: "E1", S2: "E2", S3: "E1" }, shopKinds: { S3: "hq" },
  });
  const names = { S1: "A店", S2: "B店", S3: "事務所" };
  ["S1", "S2", "S3"].forEach(sid => { s.shops[sid].company = cfc.buildShopMirror(CID, pub, sid, names, "seed"); });
  s.accounts[UID].shops = { [currentShop]: true };
  return s;
};

async function open(seed, tab, viewport) {
  return openHarness({
    root: ROOT, jsx: "window.__harnessReady=true;", waitFor: "#root > *", viewport: viewport || { width: 1200, height: 900 },
    extraHead: THEME + makeStub({ seed, uid: UID, view: "admin", tab, cfHandlers }),
    scripts: ["app-utils.js", "app-core.js", "app-staff.js", "app-admin.js", "app-shift.js", "app-company.js", "app-main.js"].map(src => ({ src, babel: !/utils|core/.test(src) })),
  });
}
const waitText = (h, t, ms = 15000) => h.page.waitForFunction(x => document.body.innerText.includes(x), t, { timeout: ms });

(async () => {
  const R = {};
  // ===== A・B =====
  let h = await open(legacySeed(), "company");
  try {
    await waitText(h, "店舗の法人と種別");
    await h.page.waitForFunction(() => document.querySelectorAll("[data-co-entity]").length >= 1, { timeout: 10000 });
    await h.page.waitForTimeout(300);
    R.ensureCalls = await h.evaluate(() => window.__cf.filter(c => c.name === "ensureCompanyEntities").length);
    R.afterMigrate = await h.evaluate(() => {
      const pub = window.__db("companies/C1/pub");
      const m = ["S1", "S2", "S3"].map(s => window.__db("shops/" + s + "/company"));
      return { ents: Object.values(pub.entities || {}).map(e => e.name), def: pub.defaultEntityId, se: pub.shopEntities,
        mEnt: m.map(x => x.entityId), mName: m.map(x => x.entityName), mSettings: m.map(x => JSON.stringify(x.settings)), mKind: m.map(x => x.kind) };
    });
    // 提出状況表の法人フィルタだけを数える（企業横断ダッシュボード・P7 も同じ部品を持つ）
    R.filterA = await h.evaluate(() => [...document.querySelectorAll("[data-co-entity-filter]")].filter(e => !e.closest("[data-co-dashboard]")).length);

    // 法人を追加
    await h.setInput('input[placeholder="法人名（例：株式会社〇〇）"]', "乙法人");
    await h.clickExact("＋ 法人を追加");
    await h.page.waitForFunction(() => document.querySelectorAll("[data-co-entity]").length === 2, { timeout: 10000 });
    const e2 = await h.evaluate(() => Object.entries(window.__db("companies/C1/pub/entities")).find(([, v]) => v.name === "乙法人")[0]);
    R.created = !!e2;
    // B店を乙法人へ
    await h.page.selectOption('[data-co-shop-entity="S2"] td:nth-child(2) select', e2);
    await h.page.waitForFunction(id => (window.__db("shops/S2/company") || {}).entityId === id, e2, { timeout: 10000 });
    R.assigned = await h.evaluate(() => { const m = window.__db("shops/S2/company"); return { name: m.entityName, s1: window.__db("shops/S1/company").entityName }; });
    // 事務所を本部に
    await h.page.selectOption('[data-co-shop-entity="S3"] td:nth-child(3) select', "hq");
    await h.page.waitForFunction(() => (window.__db("shops/S3/company") || {}).kind === "hq", null, { timeout: 10000 });
    R.hq = await h.evaluate(() => ({ pub: window.__db("companies/C1/pub/shopKinds/S3"), global: window.__db("global/shops/S3/kind"), s1: window.__db("shops/S1/company").kind }));
    // 乙法人の設定: 固定残業 45h
    await h.page.click(`[data-co-entity="${e2}"] button:has-text("法人の設定")`);
    await h.page.waitForSelector(`[data-co-entity="${e2}"] input[type=number]`, { timeout: 5000 });
    // CoLaborFields の並び: 31日の総枠(時間・分) → 固定残業 …
    const inputs = await h.page.$$(`[data-co-entity="${e2}"] input[type=number]`);
    await inputs[2].fill("45");
    await h.page.click(`[data-co-entity="${e2}"] button:has-text("この法人の設定を保存")`);
    await h.page.waitForFunction(() => (((window.__db("shops/S2/company") || {}).settings || {}).laborSettings || {}).fixedOvertimeMin === 2700, null, { timeout: 10000 });
    R.entityCfg = await h.evaluate(() => ({ s2: window.__db("shops/S2/company").settings, s1: window.__db("shops/S1/company").settings }));
    await h.page.waitForTimeout(500);
    // 提出状況: 絞り込みと見出し
    R.subsHeads = await h.evaluate(() => [...document.querySelectorAll("[data-co-entity-head]")].map(x => x.innerText.trim()));
    R.subsRows = await h.evaluate(() => [...document.querySelectorAll("[data-co-row]")].map(x => x.getAttribute("data-co-row")));
    // 提出状況表の法人フィルタだけを数える（企業横断ダッシュボード・P7 も同じ部品を持つ）
    R.filterB = await h.evaluate(() => [...document.querySelectorAll("[data-co-entity-filter]")].filter(e => !e.closest("[data-co-dashboard]")).length);
    await h.page.selectOption("[data-co-entity-filter]", e2);
    await h.page.waitForTimeout(300);
    R.subsFiltered = await h.evaluate(() => [...document.querySelectorAll("[data-co-row]")].map(x => x.getAttribute("data-co-row")));
    R.subsHqBadge = null;
    await h.page.selectOption("[data-co-entity-filter]", "");
    await h.page.waitForTimeout(300);
    R.subsHqBadge = await h.evaluate(() => (document.querySelector('[data-co-row="S3"] td') || {}).innerText || "");
    // 企業内登録スタッフ
    await h.clickExact("一覧を開く");
    await h.page.waitForFunction(() => !!document.querySelector("table tbody tr td") && !document.body.innerText.includes("読み込み中..."), { timeout: 10000 });
    await h.page.waitForTimeout(300);
    R.dirSections = await h.evaluate(() => [...document.querySelectorAll("[data-co-section]")].map(x => x.getAttribute("data-co-section")));
    // セルの1行目だけを読む（番号のセルには別法人との重なりの注記が2行目に付く・P1b）
    R.dir12 = await h.evaluate(() => [...document.querySelectorAll("table tbody tr")].map(tr => [...tr.querySelectorAll("td")].map(td => td.innerText.trim().split("\n")[0])).filter(r => r[0] === "12").map(r => r[1]));
    R.dirFilter = await h.evaluate(() => document.querySelectorAll("[data-co-entity-filter]").length);
  } catch (e) { R.exceptionAB = e.message; }
  R.errorsAB = h.errors.slice(); await h.close();

  // ===== C: 乙法人の店舗（B店）の設定タブ =====
  h = await open(entitySeed("S2"), "settings");
  try {
    await waitText(h, "企業設定");
    await h.page.waitForTimeout(400);
    R.setNote = await h.evaluate(() => document.body.innerText.includes("企業アカウント（テスト企業・乙法人）"));
    R.coTags = await h.evaluate(() => [...document.querySelectorAll("span")].filter(s => s.innerText.trim() === "企業設定").length);
  } catch (e) { R.exceptionC = e.message; }
  R.errorsC = h.errors.slice(); await h.close();

  // ===== D: 本部店舗（事務所）の期間管理タブ =====
  h = await open(entitySeed("S3"), "periods");
  try {
    await h.page.waitForSelector("[data-hq-url-hidden]", { timeout: 15000 });
    R.hqHidden = await h.evaluate(() => ({ hidden: document.querySelectorAll("[data-hq-url-hidden]").length, url: document.body.innerText.includes("tokp3") }));
    await h.clickExact("URLを表示");
    await h.page.waitForTimeout(200);
    R.hqShown = await h.evaluate(() => ({ hidden: document.querySelectorAll("[data-hq-url-hidden]").length, url: document.body.innerText.includes("tokp3") }));
  } catch (e) { R.exceptionD = e.message; }
  R.errorsD = h.errors.slice(); await h.close();
  // 対照: 通常の店舗（A店）では最初から URL が出る
  h = await open(entitySeed("S1"), "periods");
  try {
    await waitText(h, "tokp1");
    R.shopUrl = await h.evaluate(() => ({ hidden: document.querySelectorAll("[data-hq-url-hidden]").length, url: document.body.innerText.includes("tokp1") }));
  } catch (e) { R.exceptionD2 = e.message; }
  R.errorsD2 = h.errors.slice(); await h.close();

  // ===== E: 375px 幅で法人カードがページを横に動かさず、入力欄は 16px 以上 =====
  h = await open(entitySeed("S1"), "company", { width: 375, height: 812 });
  try {
    await h.page.waitForSelector("[data-co-entity]", { timeout: 15000 });
    await h.page.waitForTimeout(300);
    R.mobile = await h.evaluate(() => ({ page: document.documentElement.scrollWidth, vw: innerWidth,
      minFont: Math.min(...[...document.querySelectorAll("[data-co-entity] input, [data-co-entity] select, [data-co-shop-entity] select, input[placeholder^='法人名']")].map(e => parseFloat(getComputedStyle(e).fontSize))) }));
  } catch (e) { R.exceptionE = e.message; }
  R.errorsE = h.errors.slice(); await h.close();

  const a = R.afterMigrate || {};
  const legacySettings = JSON.stringify(coSettings);
  const v = {
    ensureOnce: R.ensureCalls === 1,
    migratedOneEntity: JSON.stringify(a.ents) === JSON.stringify(["テスト企業"]) && !!a.def,
    allShopsAssigned: !!a.se && ["S1", "S2", "S3"].every(s => a.se[s] === a.def),
    mirrorHasEntity: JSON.stringify(a.mEnt) === JSON.stringify([a.def, a.def, a.def]) && (a.mName || []).every(n => n === "テスト企業"),
    mirrorSettingsUnchanged: (a.mSettings || []).every(x => x === legacySettings),
    noFilterWithOneEntity: R.filterA === 0,
    entityCreated: R.created === true,
    shopAssigned: !!R.assigned && R.assigned.name === "乙法人" && R.assigned.s1 === "テスト企業",
    hqKind: !!R.hq && R.hq.pub === "hq" && R.hq.global === "hq" && R.hq.s1 === "shop",
    entitySettingsBakedOnlyToItsShops: !!R.entityCfg && R.entityCfg.s2.laborSettings.fixedOvertimeMin === 2700 && JSON.stringify(R.entityCfg.s2.staffTypeLimits) === JSON.stringify(coSettings.staffTypeLimits)
      && !(R.entityCfg.s1.laborSettings && R.entityCfg.s1.laborSettings.fixedOvertimeMin),
    subsEntityHeads: JSON.stringify(R.subsHeads) === JSON.stringify(["テスト企業", "乙法人"]),
    subsGroupedByEntity: JSON.stringify(R.subsRows) === JSON.stringify(["S1", "S3", "S2"]),
    subsFilter: R.filterB === 1 && JSON.stringify(R.subsFiltered) === JSON.stringify(["S2"]),
    subsHqBadge: /本部/.test(R.subsHqBadge || ""),
    dirSameNumberOtherEntity: JSON.stringify((R.dir12 || []).slice().sort()) === JSON.stringify(["田中", "田中 次郎"]),
    dirSections: JSON.stringify(R.dirSections) === JSON.stringify(["テスト企業", "テスト企業・本部", "乙法人"]),
    dirFilter: R.dirFilter === 1,
    settingsNoteShowsEntity: R.setNote === true,
    settingsFixedDisplay: R.coTags >= 1,
    hqUrlHidden: !!R.hqHidden && R.hqHidden.hidden >= 1 && R.hqHidden.url === false,
    hqUrlShowable: !!R.hqShown && R.hqShown.hidden === 0 && R.hqShown.url === true,
    shopUrlUnchanged: !!R.shopUrl && R.shopUrl.hidden === 0 && R.shopUrl.url === true,
    mobileNoPageScroll: !!R.mobile && R.mobile.page <= R.mobile.vw,
    mobileFont16: !!R.mobile && R.mobile.minFont >= 16,
    noErrors: [R.errorsAB, R.errorsC, R.errorsD, R.errorsD2, R.errorsE].every(e => e && e.length === 0) && !R.exceptionAB && !R.exceptionC && !R.exceptionD && !R.exceptionD2 && !R.exceptionE,
  };
  v.allPass = Object.values(v).every(Boolean);
  console.log(JSON.stringify({ R, verdict: v }, null, 2));
  process.exit(v.allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
