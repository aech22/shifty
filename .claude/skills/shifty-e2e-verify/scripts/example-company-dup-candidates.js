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
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-company-dup-candidates.js → allPass=true / EXIT=0
// 反証: SHIFTY_ROOT=<P3.6 より前の配信物> node ... → EXIT=1
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
const PEOPLE_CFS = ["ensureCompanyPeople", "mergePeople", "splitPerson", "reassignPersonId", "companyRenameStaff", "companyUpdateStaff"];
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

(async () => {
  const cfHandlers = {};
  PEOPLE_CFS.forEach(n => { cfHandlers[n] = "people"; });
  ENTITY_CFS.forEach(n => { cfHandlers[n] = "entity"; });
  const h = await openHarness({
    root: ROOT, jsx: "window.__harnessReady=true;", waitFor: "#root > *", viewport: { width: 1200, height: 900 },
    extraHead: THEME + makeStub({ seed: seed(), uid: UID, view: "admin", tab: "company", cfHandlers }),
    scripts: ["app-utils.js", "app-core.js", "app-staff.js", "app-admin.js", "app-company.js", "app-main.js"].map(src => ({ src, babel: !/utils|core/.test(src) })),
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
  v.allPass = Object.values(v).every(Boolean);
  console.log(JSON.stringify({ R, verdict: v }, null, 2));
  process.exit(v.allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
