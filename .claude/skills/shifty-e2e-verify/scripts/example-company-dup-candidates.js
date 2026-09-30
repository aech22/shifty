// P3.6（ヘルプ先勤務の合算）の「重複候補」の実ブラウザ回帰テスト。企業内登録スタッフの一覧に、
// 同じ名前が2店舗以上にあって人物（personId）が別の登録を先頭に出し、その場で統合できることを測る。
// アプリ全体をスタブ Firebase（stub-firebase.js）で動かす。Firebase へは1バイトも出ない。
// 人物の CF はスタブが functions/company-config.js をそのまま読み込んで同じ規則で後始末し、本物と同じく
// 人物が変わったら連携全店舗の写し（shops/{sid}/company.people）を作り直す（buildShopMirror）。
//
//  A. 重複候補に「田中（A店 ／ B店）」が出る。同じ店舗の中だけの名前・1人だけの名前（佐藤）は出ない
//  B. 所属店舗が明示されていない側に「所属店舗を設定してください」
//  C. 候補の「統合する」→ 統合モーダル → 統合で1人にまとまり、候補が消える。まとまった行に所属店舗の注記が残る（両方未設定）
//  D. 写し shops/S1/company.people と shops/S2/company.people が同じ人物に A・B の両方の登録名を持つ（店長のセッションが読む）
//  E. コンソールエラー0件
// 「統合しない」（2026-09-30）は別の seed（2人組「リン」＝S1・S2、3人組「タオ」＝S1・S2・S3）の2回目のハーネスで測る:
//  F. リンの「統合しない」→ 候補から消える・行数は変わらない・people/{a}/distinct/{b} と逆向きの両方が入る
//  G. リンの「編集」→「統合しない相手」に相手の名前が出る →「取り消す」→ 記録が消えて候補に戻る
//  H. タオ（3人組）の「統合しない」→ 3ペア（6キー）が記録され候補から消える
//  I. 2回目のハーネスもコンソールエラー0件
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-company-dup-candidates.js → allPass=true / EXIT=0
// 反証: SHIFTY_ROOT=<P3.6 より前の配信物> node ... → EXIT=1（F〜H は「統合しない」より前の配信物で落ちる）
"use strict";
const path = require("node:path");
const { openHarness, REPO_ROOT } = require(path.join(__dirname, "mount-component.js"));
const { makeStub } = require(path.join(__dirname, "stub-firebase.js"));
const cfc = require(path.join(__dirname, "..", "..", "..", "..", "functions", "company-config.js"));
const ROOT = process.env.SHIFTY_ROOT || REPO_ROOT;
const THEME = `<style>:root{--c-bg:#F0F2F5;--c-card:#FFFFFF;--c-input:#F3F4F6;--c-input2:#F0F2F5;` +
  `--c-border:#E5E7EB;--c-border2:#D1D5DB;--c-text:#1A1A2E;--c-text2:#374151;--c-text3:#6B7280;` +
  `--c-text4:#9CA3AF;--c-shadow:rgba(0,0,0,.06);--c-accent:#f87036;--c-danger:#DC2626;}</style>`;
const UID = "U1", CID = "C1";
const PEOPLE_CFS = ["ensureCompanyPeople", "mergePeople", "splitPerson", "reassignPersonId", "companyRenameStaff", "companyUpdateStaff", "markPeopleDistinct"];
const ENTITY_CFS = ["ensureCompanyEntities", "createEntity", "renameEntity", "assignShopEntity", "saveEntityConfig", "setShopKind"];
const shop = (sid, staff, settings) => ({ owners: { [UID]: "K" + sid }, private: { adminKey: "K" + sid }, staff, settings: { shopId: sid, candidates: [], ...settings }, periods: {} });
const PUB = { name: "テスト企業", ownerUid: UID, code: "ABCD1234", shops: { S1: true, S2: true }, config: {},
  entities: { E1: { name: "甲法人" } }, defaultEntityId: "E1", shopEntities: { S1: "E1", S2: "E1" },
  people: {
    p_AAAAAAAA: { displayName: "田中", entityId: "E1", links: { S1: "田中" }, createdAt: "t", updatedAt: "t" },
    p_BBBBBBBB: { displayName: "田中", entityId: "E1", links: { S2: "田中" }, createdAt: "t", updatedAt: "t" },
    p_CCCCCCCC: { displayName: "佐藤", entityId: "E1", links: { S1: "佐藤" }, createdAt: "t", updatedAt: "t" },
    p_DDDDDDDD: { displayName: "高橋", entityId: "E1", links: { S2: "高橋" }, createdAt: "t", updatedAt: "t" },
  } };
const NAMES = { S1: "A店", S2: "B店" };
const seed = () => ({
  global: { shops: { S1: { id: "S1", name: "A店" }, S2: { id: "S2", name: "B店" } } },
  shops: {
    S1: { ...shop("S1", ["田中", "佐藤"], {}), company: cfc.buildShopMirror(CID, PUB, "S1", NAMES, "t") },
    S2: { ...shop("S2", ["田中", "高橋"], {}), company: cfc.buildShopMirror(CID, PUB, "S2", NAMES, "t") },
  },
  accounts: { S1: { plan: "premium" }, S2: { plan: "premium" }, [UID]: { shops: { S1: true, S2: true }, company: { companyId: CID, code: "ABCD1234", name: "テスト企業" } } },
  companies: { [CID]: { pub: PUB } },
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
// 「統合しない」用の seed。リン（2人組）とタオ（3人組）はどれも同名の別人
const PUB2 = { name: "テスト企業", ownerUid: UID, code: "ABCD1234", shops: { S1: true, S2: true, S3: true }, config: {},
  entities: { E1: { name: "甲法人" } }, defaultEntityId: "E1", shopEntities: { S1: "E1", S2: "E1", S3: "E1" },
  people: {
    p_RIN1AAAA: { displayName: "リン", entityId: "E1", links: { S1: "リン" }, createdAt: "t", updatedAt: "t" },
    p_RIN2BBBB: { displayName: "リン", entityId: "E1", links: { S2: "リン" }, createdAt: "t", updatedAt: "t" },
    p_TAO1AAAA: { displayName: "タオ", entityId: "E1", links: { S1: "タオ" }, createdAt: "t", updatedAt: "t" },
    p_TAO2BBBB: { displayName: "タオ", entityId: "E1", links: { S2: "タオ" }, createdAt: "t", updatedAt: "t" },
    p_TAO3CCCC: { displayName: "タオ", entityId: "E1", links: { S3: "タオ" }, createdAt: "t", updatedAt: "t" },
  } };
const NAMES2 = { S1: "A店", S2: "B店", S3: "C店" };
const seed2 = () => ({
  global: { shops: { S1: { id: "S1", name: "A店" }, S2: { id: "S2", name: "B店" }, S3: { id: "S3", name: "C店" } } },
  shops: {
    S1: { ...shop("S1", ["リン", "タオ"], {}), company: cfc.buildShopMirror(CID, PUB2, "S1", NAMES2, "t") },
    S2: { ...shop("S2", ["リン", "タオ"], {}), company: cfc.buildShopMirror(CID, PUB2, "S2", NAMES2, "t") },
    S3: { ...shop("S3", ["タオ"], {}), company: cfc.buildShopMirror(CID, PUB2, "S3", NAMES2, "t") },
  },
  accounts: { S1: { plan: "premium" }, S2: { plan: "premium" }, S3: { plan: "premium" }, [UID]: { shops: { S1: true, S2: true, S3: true }, company: { companyId: CID, code: "ABCD1234", name: "テスト企業" } } },
  companies: { [CID]: { pub: PUB2 } },
});
const SCRIPTS = ["app-utils.js", "app-core.js", "app-staff.js", "app-admin.js", "app-shift.js", "app-company.js", "app-main.js"].map(src => ({ src, babel: !/utils|core/.test(src) }));

(async () => {
  const cfHandlers = {};
  PEOPLE_CFS.forEach(n => { cfHandlers[n] = "people"; });
  ENTITY_CFS.forEach(n => { cfHandlers[n] = "entity"; });
  const h = await openHarness({
    root: ROOT, jsx: "window.__harnessReady=true;", waitFor: "#root > *", viewport: { width: 1200, height: 900 },
    extraHead: THEME + makeStub({ seed: seed(), uid: UID, view: "admin", tab: "company", cfHandlers }),
    scripts: ["app-utils.js", "app-core.js", "app-staff.js", "app-admin.js", "app-shift.js", "app-company.js", "app-main.js"].map(src => ({ src, babel: !/utils|core/.test(src) })),
  });
  const R = {};
  try {
    await h.page.waitForFunction(() => [...document.querySelectorAll("button")].some(b => b.innerText.trim() === "一覧を開く"), { timeout: 15000 });
    await h.clickExact("一覧を開く");
    await h.page.waitForFunction(() => !!document.querySelector("table tbody tr td") && !document.body.innerText.includes("読み込み中..."), { timeout: 10000 });
    await sleep(600);
    R.before = await h.evaluate(() => ({
      cands: [...document.querySelectorAll("[data-co-dup-cand]")].map(e => ({ name: e.getAttribute("data-co-dup-cand"), text: e.innerText.replace(/\s+/g, " ") })),
      homeHint: !!document.querySelector("[data-co-dup-home-hint]"),
      rows: document.querySelectorAll("tr[data-co-person]").length,
    }));
    // 候補の「統合する」→ モーダルの「統合する」
    await h.evaluate(() => { const b = [...document.querySelectorAll("[data-co-dup-cand] button")].find(x => x.innerText.trim() === "統合する"); b && b.click(); });
    await sleep(300);
    R.modal = await h.evaluate(() => !!document.querySelector("[data-co-merge-modal]"));
    await h.evaluate(() => { const m = document.querySelector("[data-co-merge-modal]"); const b = m && [...m.querySelectorAll("button")].find(x => x.innerText.trim() === "統合する"); b && b.click(); });
    await h.page.waitForFunction(() => !document.querySelector("[data-co-merge-modal]"), { timeout: 5000 }).catch(() => {});
    await sleep(1200);
    R.after = await h.evaluate(() => ({
      cands: document.querySelectorAll("[data-co-dup-cand]").length,
      rows: document.querySelectorAll("tr[data-co-person]").length,
      tanakaHint: [...document.querySelectorAll("tr[data-co-person]")].filter(tr => (tr.querySelectorAll("td")[1].innerText || "").startsWith("田中")).map(tr => !!tr.querySelector("[data-co-home-hint]")),
      msg: (document.querySelector("[data-co-person-msg]") || {}).innerText || "",
      mirror1: window.__db("shops/S1/company/people"), mirror2: window.__db("shops/S2/company/people"),
    }));
  } catch (e) { R.exception = String(e && e.stack || e); }
  R.errors = h.errors.slice();
  await h.close();

  // ---- 2回目: 「統合しない」（F〜I）----
  const h2 = await openHarness({
    root: ROOT, jsx: "window.__harnessReady=true;", waitFor: "#root > *", viewport: { width: 1200, height: 900 },
    extraHead: THEME + makeStub({ seed: seed2(), uid: UID, view: "admin", tab: "company", cfHandlers }),
    scripts: SCRIPTS,
  });
  const candNames = () => h2.evaluate(() => [...document.querySelectorAll("[data-co-dup-cand]")].map(e => e.getAttribute("data-co-dup-cand")));
  const clickInCand = (cand, text) => h2.evaluate(([c, t]) => {
    const el = [...document.querySelectorAll("[data-co-dup-cand]")].find(e => e.getAttribute("data-co-dup-cand") === c);
    const b = el && [...el.querySelectorAll("button")].find(x => x.innerText.trim() === t);
    if (!b) return false; b.click(); return true;
  }, [cand, text]);
  const rowCount = () => h2.evaluate(() => document.querySelectorAll("tr[data-co-person]").length);
  const distinctOf = id => h2.evaluate(i => window.__db("companies/C1/pub/people/" + i + "/distinct") || null, id);
  try {
    await h2.page.waitForFunction(() => [...document.querySelectorAll("button")].some(b => b.innerText.trim() === "一覧を開く"), { timeout: 15000 });
    await h2.clickExact("一覧を開く");
    await h2.page.waitForFunction(() => !!document.querySelector("table tbody tr td") && !document.body.innerText.includes("読み込み中..."), { timeout: 10000 });
    await sleep(600);
    R.f0 = { cands: await candNames(), rows: await rowCount(),
      taoText: await h2.evaluate(() => { const e = [...document.querySelectorAll("[data-co-dup-cand]")].find(x => x.getAttribute("data-co-dup-cand") === "タオ"); return e ? e.innerText.replace(/\s+/g, " ") : ""; }) };
    // F. リン（2人組）の「統合しない」
    R.fClicked = await clickInCand("リン", "統合しない");
    await sleep(1200);
    R.f1 = { cands: await candNames(), rows: await rowCount(), msg: await h2.evaluate(() => (document.querySelector("[data-co-person-msg]") || {}).innerText || ""),
      d1: await distinctOf("p_RIN1AAAA"), d2: await distinctOf("p_RIN2BBBB") };
    // G. リン（A店）の「編集」→「統合しない相手」→「取り消す」
    R.gEdit = await h2.evaluate(() => { const tr = document.querySelector('tr[data-co-person="p_RIN1AAAA"]'); const b = tr && [...tr.querySelectorAll("button")].find(x => x.innerText.trim() === "編集"); if (!b) return false; b.click(); return true; });
    await sleep(400);
    R.g0 = await h2.evaluate(() => {
      const m = document.querySelector("[data-co-person-modal]"); const sec = m && m.querySelector("[data-co-distinct-list]");
      return { modal: !!m, section: !!sec, peers: sec ? [...sec.querySelectorAll("[data-co-distinct-peer]")].map(e => ({ id: e.getAttribute("data-co-distinct-peer"), text: e.innerText.replace(/\s+/g, " ") })) : [] };
    });
    R.gUndo = await h2.evaluate(() => { const b = document.querySelector("[data-co-person-modal] [data-co-distinct-undo]"); if (!b) return false; b.click(); return true; });
    await sleep(1200);
    R.g1 = { cands: await candNames(), msg: await h2.evaluate(() => (document.querySelector("[data-co-person-msg]") || {}).innerText || ""),
      d1: await distinctOf("p_RIN1AAAA"), d2: await distinctOf("p_RIN2BBBB") };
    // H. タオ（3人組）の「統合しない」
    R.hClicked = await clickInCand("タオ", "統合しない");
    await sleep(1200);
    R.h1 = { cands: await candNames(), rows: await rowCount(),
      d: { a: await distinctOf("p_TAO1AAAA"), b: await distinctOf("p_TAO2BBBB"), c: await distinctOf("p_TAO3CCCC") } };
  } catch (e) { R.exception2 = String(e && e.stack || e); }
  R.errors2 = h2.errors.slice();
  await h2.close();
  const merged = m => !!m && Object.values(m).some(l => l && l.S1 === "田中" && l.S2 === "田中");
  const b = R.before || {}, a = R.after || {};
  const v = {
    A_candidateShown: !!b.cands && b.cands.length === 1 && b.cands[0].name === "田中" && /A店/.test(b.cands[0].text) && /B店/.test(b.cands[0].text),
    B_homeHint: b.homeHint === true,
    C_modalOpened: R.modal === true,
    C_mergedOneRow: a.cands === 0 && b.rows - a.rows === 1 && /統合しました/.test(a.msg || ""),
    C_rowHintRemains: Array.isArray(a.tanakaHint) && a.tanakaHint.length === 1 && a.tanakaHint[0] === true,
    D_mirrorPeople: merged(a.mirror1) && merged(a.mirror2),
    E_noErrors: !R.exception && R.errors.length === 0,
  };
  const f0 = R.f0 || {}, f1 = R.f1 || {}, g0 = R.g0 || {}, g1 = R.g1 || {}, h1 = R.h1 || {};
  const has = (o, k) => !!o && typeof o[k] === "string" && !!o[k];
  const keys = o => Object.keys(o || {}).sort();
  Object.assign(v, {
    F_before: Array.isArray(f0.cands) && f0.cands.includes("リン") && f0.cands.includes("タオ") && /統合する2人を一覧で選んでください/.test(f0.taoText || "") && /統合しない/.test(f0.taoText || ""),
    F_markDistinct: R.fClicked === true && Array.isArray(f1.cands) && !f1.cands.includes("リン") && f1.cands.includes("タオ") && f1.rows === f0.rows
      && has(f1.d1, "p_RIN2BBBB") && has(f1.d2, "p_RIN1AAAA") && /別の人として記録しました/.test(f1.msg || ""),
    G_listedInEdit: R.gEdit === true && g0.modal === true && g0.section === true && Array.isArray(g0.peers) && g0.peers.length === 1
      && g0.peers[0].id === "p_RIN2BBBB" && /リン/.test(g0.peers[0].text) && /B店/.test(g0.peers[0].text),
    G_undo: R.gUndo === true && Array.isArray(g1.cands) && g1.cands.includes("リン") && g1.d1 === null && g1.d2 === null && /取り消しました/.test(g1.msg || ""),
    H_threeDistinct: R.hClicked === true && Array.isArray(h1.cands) && !h1.cands.includes("タオ") && h1.rows === f0.rows
      && JSON.stringify(keys((h1.d || {}).a)) === JSON.stringify(["p_TAO2BBBB", "p_TAO3CCCC"])
      && JSON.stringify(keys((h1.d || {}).b)) === JSON.stringify(["p_TAO1AAAA", "p_TAO3CCCC"])
      && JSON.stringify(keys((h1.d || {}).c)) === JSON.stringify(["p_TAO1AAAA", "p_TAO2BBBB"]),
    I_noErrors2: !R.exception2 && Array.isArray(R.errors2) && R.errors2.length === 0,
  });
  v.allPass = Object.values(v).every(Boolean);
  console.log(JSON.stringify({ R, verdict: v }, null, 2));
  process.exit(v.allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
