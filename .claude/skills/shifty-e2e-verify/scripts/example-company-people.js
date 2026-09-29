// 人物ID（personId）と企業スタッフ一覧の編集（2026-09-30・労務給与_複数法人_実装計画.md §3.8・P1b）の実ブラウザ回帰テスト。
// アプリ全体をスタブ Firebase（stub-firebase.js）で動かす。Firebase へは1バイトも出ない。
// 人物の CF 6本はスタブが functions/company-config.js をそのまま読み込んで同じ規則で後始末する
// （planPeopleSync・planMergePeople・planSplitPerson・planReassignPersonId・改名の差分パッチ）。
// CF 本体の権限（assertCompanyMember）と Admin SDK での書き込みは、本番デプロイ後の実データ確認の領分で、ここでは測らない。
//
//  A. 一覧を開くと ensureCompanyPeople が1回だけ呼ばれ、人物が作られる。一覧の行は人物が無いとき（CF が拒否）と同じ
//     - 同じ法人の番号12は人物 "12"、別法人の番号12は p_ 自動採番。別法人の番号の重なりは行に注記
//  B. 「編集」→ 名前の変更（A店だけ）: 店舗の staff・全 subs（3ヶ月より前の期間を含む）・settings・periods
//     （snapshot / keepStaff / keepAttrs / laborTotals）・private/pay・people.links が移る。B店は変わらない
//  C. 検証: 既にいる名前への改名・法人内で重なる従業員番号は拒否され、何も書かれない
//  D. 属性・所属店舗の変更は、つながっている店舗の settings に書かれる
//  E. 2行を選んで統合 → 1行に。店舗のデータは変わらない。「切り出す」で元の2行に戻り、再読み込みしても再びまとまらない
//  F. 番号を数字に変えてから「ID を番号に振り直す」で人物IDが番号になる
//  G. 375px で編集モーダルがページを横に広げない・入力欄は16px以上・コンソールエラー0件
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-company-people.js → allPass=true / EXIT=0
"use strict";
const path = require("node:path");
const { openHarness, REPO_ROOT } = require(path.join(__dirname, "mount-component.js"));
const { makeStub } = require(path.join(__dirname, "stub-firebase.js"));
const ROOT = process.env.SHIFTY_ROOT || REPO_ROOT;
const THEME = `<style>:root{--c-bg:#F0F2F5;--c-card:#FFFFFF;--c-input:#F3F4F6;--c-input2:#F0F2F5;` +
  `--c-border:#E5E7EB;--c-border2:#D1D5DB;--c-text:#1A1A2E;--c-text2:#374151;--c-text3:#6B7280;` +
  `--c-text4:#9CA3AF;--c-shadow:rgba(0,0,0,.06);--c-accent:#f87036;--c-danger:#DC2626;}</style>`;
const UID = "U1", CID = "C1";
const PEOPLE_CFS = ["ensureCompanyPeople", "mergePeople", "splitPerson", "reassignPersonId", "companyRenameStaff", "companyUpdateStaff"];
const ENTITY_CFS = ["ensureCompanyEntities", "createEntity", "renameEntity", "assignShopEntity", "saveEntityConfig", "setShopKind"];
const per = (id, sid, start, end, extra) => ({ id, urlToken: "tok" + id, shopId: sid, label: id, startDate: start, endDate: end, deadlineDate: "", createdAt: "2026-01-01T00:00:00.000Z", ...(extra || {}) });
const shop = (sid, staff, settings, periods, more) => ({ owners: { [UID]: "K" + sid }, private: { adminKey: "K" + sid, ...((more && more.private) || {}) }, staff, settings: { shopId: sid, candidates: [], ...settings }, periods, ...((more && more.subs) ? { subs: more.subs } : {}) });
const seed = () => ({
  global: { shops: { S1: { id: "S1", name: "A店" }, S2: { id: "S2", name: "B店" }, S3: { id: "S3", name: "C店" } } },
  shops: {
    S1: shop("S1", ["田中", "佐藤", "鈴木"],
      { staffNumbers: { "田中": "12", "佐藤": "3", "鈴木": "A7" }, staffAttributes: { "田中": "employee" }, staffColors: { "田中": "red" },
        staffAliases: { "田中": ["たなか"] }, paidLeaveGranted: { "田中": 10 } },
      {
        old: per("old", "S1", "2026-03-01", "2026-03-31", { keepStaff: [{ name: "田中", index: 0 }], keepAttrs: { "田中": "parttime" },
          laborTotals: { "田中": { workMin: 600, paid: 1 } }, snapshot: { staffList: ["田中", "佐藤"], settings: { staffNumbers: { "田中": "12" } } } }),
        cur: per("cur", "S1", "2026-09-01", "2026-09-30"),
      },
      { subs: { sa: { id: "sa", periodId: "old", staffName: "田中", shopId: "S1", shifts: {} }, sb: { id: "sb", periodId: "cur", staffName: "田中", shopId: "S1", shifts: {} },
        sc: { id: "sc", periodId: "cur", staffName: "佐藤", shopId: "S1", shifts: {} } },
        private: { pay: { "田中": { payType: "monthly", base: 250000, effectiveFrom: "2026-04-01" } } } }),
    S2: shop("S2", ["田中 太郎", "高橋"], { staffNumbers: { "田中 太郎": "12" } }, { p2: per("p2", "S2", "2026-09-01", "2026-09-30") },
      { subs: { s2a: { id: "s2a", periodId: "p2", staffName: "田中 太郎", shopId: "S2", shifts: {} } } }),
    S3: shop("S3", ["田中 次郎", "伊藤"], { staffNumbers: { "田中 次郎": "12", "伊藤": "5" } }, {}),
  },
  accounts: { S1: { plan: "premium" }, S2: { plan: "premium" }, S3: { plan: "premium" }, [UID]: { shops: { S1: true, S2: true, S3: true }, company: { companyId: CID, code: "ABCD1234", name: "テスト企業" } } },
  companies: { [CID]: { pub: { name: "テスト企業", ownerUid: UID, code: "ABCD1234", shops: { S1: true, S2: true, S3: true }, config: {},
    entities: { E1: { name: "甲法人" }, E2: { name: "乙法人" } }, defaultEntityId: "E1", shopEntities: { S1: "E1", S2: "E1", S3: "E2" } } } },
});

async function open(cfHandlers, viewport) {
  return openHarness({
    root: ROOT, jsx: "window.__harnessReady=true;", waitFor: "#root > *", viewport: viewport || { width: 1200, height: 900 },
    extraHead: THEME + makeStub({ seed: seed(), uid: UID, view: "admin", tab: "company", cfHandlers }),
    scripts: ["app-utils.js", "app-core.js", "app-staff.js", "app-admin.js", "app-main.js"].map(src => ({ src, babel: !/utils|core/.test(src) })),
  });
}
const rowsText = () => [...document.querySelectorAll("table tbody tr[data-co-person]")].map(tr => [...tr.querySelectorAll("td")].slice(0, 5).map(td => td.innerText.trim().split("\n")[0]));
async function openList(h) {
  await h.page.waitForFunction(() => [...document.querySelectorAll("button")].some(b => b.innerText.trim() === "一覧を開く"), { timeout: 15000 });
  await h.clickExact("一覧を開く");
  await h.page.waitForFunction(() => !!document.querySelector("table tbody tr td") && !document.body.innerText.includes("読み込み中..."), { timeout: 10000 });
  await h.page.waitForTimeout(600);
}
// 名前（行の2列目の1行目）で行の「編集」を押す
const clickEdit = (h, name) => h.evaluate(n => {
  const tr = [...document.querySelectorAll("tr[data-co-person]")].find(t => (t.querySelectorAll("td")[1].innerText || "").split("\n")[0].trim() === n);
  if (!tr) return "row-not-found";
  const b = [...tr.querySelectorAll("button")].find(x => x.innerText.trim() === "編集");
  if (!b || b.disabled) return "button-not-found";
  b.click(); return "ok";
}, name);
const pickRow = (h, name) => h.evaluate(n => {
  const tr = [...document.querySelectorAll("tr[data-co-person]")].find(t => (t.querySelectorAll("td")[1].innerText || "").split("\n")[0].trim() === n);
  const c = tr && tr.querySelector('input[type="checkbox"]');
  if (!c) return false; c.click(); return true;
}, name);
const modalClick = (h, label) => h.evaluate(l => {
  const m = document.querySelector("[data-co-person-modal],[data-co-merge-modal]");
  const b = m && [...m.querySelectorAll("button")].find(x => x.innerText.trim() === l);
  if (!b || b.disabled) return false; b.click(); return true;
}, label);
const msg = h => h.evaluate(() => (document.querySelector("[data-co-person-msg]") || {}).innerText || "");
const settle = h => h.page.waitForTimeout(700);

(async () => {
  const R = {};
  // 対照: 人物を作らせない（CF が拒否）ときの一覧
  let h = await open({ ...Object.fromEntries(ENTITY_CFS.map(n => [n, "entity"])), ensureCompanyPeople: "reject:止めた" });
  try { await openList(h); R.baseline = await h.evaluate(rowsText); } catch (e) { R.exceptionBase = e.message; }
  R.errorsBase = h.errors.slice(); await h.close();

  const handlers = { ...Object.fromEntries(ENTITY_CFS.map(n => [n, "entity"])), ...Object.fromEntries(PEOPLE_CFS.map(n => [n, "people"])) };
  h = await open(handlers);
  try {
    await openList(h);
    R.ensureCalls = await h.evaluate(() => window.__cf.filter(c => c.name === "ensureCompanyPeople").length);
    R.people = await h.evaluate(() => window.__db("companies/C1/pub/people"));
    R.rows = await h.evaluate(rowsText);
    R.allHaveId = await h.evaluate(() => [...document.querySelectorAll("tr[data-co-person]")].every(t => t.getAttribute("data-co-person")));
    R.noteJiro = await h.evaluate(() => { const tr = [...document.querySelectorAll("tr[data-co-person]")].find(t => t.innerText.includes("田中 次郎")); return tr ? tr.querySelector("td").innerText : null; });

    // B. 名前の変更（A店だけ）
    R.editTanaka = await clickEdit(h, "田中 太郎");
    await h.page.waitForTimeout(300);
    R.modalId = await h.evaluate(() => (document.querySelector("[data-co-person-id]") || {}).innerText);
    R.modalFonts = await h.evaluate(() => [...document.querySelectorAll("[data-co-person-modal] input:not([type=checkbox]):not([type=radio]),[data-co-person-modal] select")].map(e => parseFloat(getComputedStyle(e).fontSize)));
    await h.setInput('[data-co-person-modal] input[aria-label="新しい名前"]', "田中 一郎");
    // B店のチェックを外す（A店だけ改名）
    await h.evaluate(() => { const l = [...document.querySelectorAll("[data-co-person-modal] label")].find(x => x.innerText.includes("B店")); l.querySelector("input").click(); });
    R.renameClick = await modalClick(h, "名前を変更");
    await settle(h);
    R.renameMsg = await msg(h);
    R.afterRename = await h.evaluate(() => ({
      staff1: window.__db("shops/S1/staff"), staff2: window.__db("shops/S2/staff"),
      subs: Object.values(window.__db("shops/S1/subs")).map(s => s.staffName).sort(), sub2: window.__db("shops/S2/subs/s2a/staffName"),
      colors: window.__db("shops/S1/settings/staffColors"), aliases: window.__db("shops/S1/settings/staffAliases"), attrs: window.__db("shops/S1/settings/staffAttributes"),
      old: window.__db("shops/S1/periods/old"), pay: Object.keys(window.__db("shops/S1/private/pay") || {}),
      links: window.__db("companies/C1/pub/people/12/links"), dn: window.__db("companies/C1/pub/people/12/displayName"),
    }));
    R.cfRename = await h.evaluate(() => window.__cf.filter(c => c.name === "companyRenameStaff").map(c => c.payload));

    // C. 検証: 既にいる名前（佐藤）への改名は拒否（改名後の行はフルネームの規則で「田中 一郎」になる）
    R.rowAfterRename = await h.evaluate(() => [...document.querySelectorAll("tr[data-co-person]")].filter(t => t.getAttribute("data-co-person") === "12").map(t => t.querySelectorAll("td")[1].innerText.split("\n")[0]));
    await clickEdit(h, "田中 一郎"); await h.page.waitForTimeout(300);
    await h.setInput('[data-co-person-modal] input[aria-label="新しい名前"]', "佐藤");
    await h.evaluate(() => { const l = [...document.querySelectorAll("[data-co-person-modal] label")].find(x => x.innerText.includes("B店")); l.querySelector("input").click(); });
    await modalClick(h, "名前を変更"); await settle(h);
    R.dupMsg = await msg(h);
    R.dupStaff = await h.evaluate(() => window.__db("shops/S1/staff"));
    await modalClick(h, "閉じる"); await h.page.waitForTimeout(200);
    // 番号の重なり（鈴木に佐藤と同じ番号3・同じ甲法人）は拒否
    await clickEdit(h, "鈴木"); await h.page.waitForTimeout(300);
    await h.setInput('[data-co-person-modal] input[aria-label="従業員番号"]', "3");
    await modalClick(h, "保存"); await settle(h);
    R.numMsg = await msg(h);
    R.numAfter = await h.evaluate(() => window.__db("shops/S1/settings/staffNumbers/鈴木"));
    await modalClick(h, "閉じる"); await h.page.waitForTimeout(200);

    // D. 属性・所属店舗（高橋: B店の登録 → 属性パート・アルバイト、所属 A店）
    await clickEdit(h, "高橋"); await h.page.waitForTimeout(300);
    await h.page.selectOption('[data-co-person-modal] select[aria-label="属性"]', "parttime");
    await h.page.selectOption('[data-co-person-modal] select[aria-label="所属店舗"]', "S1");
    await modalClick(h, "保存"); await settle(h);
    R.attrHome = await h.evaluate(() => ({ a: window.__db("shops/S2/settings/staffAttributes/高橋"), home: window.__db("shops/S2/settings/staffHomeShop/高橋") }));

    // E. 統合（鈴木＋高橋・鈴木を残す）→ 解除
    const beforeMerge = await h.evaluate(() => document.querySelectorAll("tr[data-co-person]").length);
    await pickRow(h, "鈴木"); await pickRow(h, "高橋"); await h.page.waitForTimeout(200);
    R.mergeBtn = await h.clickExact("同一人物として統合");
    await h.page.waitForTimeout(300);
    await h.evaluate(() => { const l = [...document.querySelectorAll("[data-co-merge-modal] label")].find(x => x.innerText.includes("鈴木")); l.querySelector("input").click(); });
    await modalClick(h, "統合する"); await settle(h);
    R.merged = await h.evaluate(() => {
      const ppl = window.__db("companies/C1/pub/people") || {};
      const p = Object.keys(ppl).find(id => (ppl[id].links || {}).S1 === "鈴木");
      return { rows: document.querySelectorAll("tr[data-co-person]").length, links: p && ppl[p].links, number: p && ppl[p].number, id: p,
        staff2: window.__db("shops/S2/staff"), num2: window.__db("shops/S2/settings/staffNumbers") };
    });
    R.mergedDelta = beforeMerge - R.merged.rows;
    await clickEdit(h, "鈴木"); await h.page.waitForTimeout(300);
    R.splitClick = await h.evaluate(() => {
      const m = document.querySelector("[data-co-person-modal]");
      const row = [...m.querySelectorAll("div")].find(d => d.children.length === 2 && d.innerText.startsWith("B店: 高橋"));
      const b = row && row.querySelector("button"); if (!b) return false; b.click(); return true;
    });
    await settle(h);
    R.afterSplitRows = await h.evaluate(() => document.querySelectorAll("tr[data-co-person]").length);

    // F. 鈴木の番号を 77 にして、ID を番号に振り直す
    await clickEdit(h, "鈴木"); await h.page.waitForTimeout(300);
    await h.setInput('[data-co-person-modal] input[aria-label="従業員番号"]', "77");
    await modalClick(h, "保存"); await settle(h);
    await clickEdit(h, "鈴木"); await h.page.waitForTimeout(300);
    R.reassignClick = await modalClick(h, "ID を番号に振り直す");
    await settle(h);
    R.reassigned = await h.evaluate(() => { const p = window.__db("companies/C1/pub/people/77"); return p ? p.links : null; });
    R.num77 = await h.evaluate(() => window.__db("shops/S1/settings/staffNumbers/鈴木"));

    // 再読み込みしても、解除した高橋は鈴木にまとまらない（ensure が再び束ねない）
    await h.page.reload();
    await openList(h);
    R.reloadRows = await h.evaluate(() => document.querySelectorAll("tr[data-co-person]").length);
    R.takahashiSeparate = await h.evaluate(() => { const ppl = window.__db("companies/C1/pub/people") || {}; return Object.values(ppl).filter(p => (p.links || {}).S2 === "高橋" && !(p.links || {}).S1).length === 1; });
  } catch (e) { R.exception = e.message + "\n" + e.stack; }
  R.errors = h.errors.slice(); await h.close();

  // G. 375px
  h = await open(handlers, { width: 375, height: 812 });
  try {
    await openList(h);
    await clickEdit(h, "田中 太郎"); await h.page.waitForTimeout(400);
    R.mobile = await h.evaluate(() => { const m = document.querySelector("[data-co-person-modal]"); const r = m.getBoundingClientRect(); return { page: document.documentElement.scrollWidth, vw: innerWidth, left: r.left, right: r.right }; });
  } catch (e) { R.exceptionMobile = e.message; }
  R.errorsMobile = h.errors.slice(); await h.close();

  const P = R.people || {};
  const jiroId = Object.keys(P).find(id => (P[id].links || {}).S3 === "田中 次郎");
  const old = (R.afterRename || {}).old || {};
  const v = {
    ensureOnce: R.ensureCalls === 1,
    samePersonSameEntity: JSON.stringify((P["12"] || {}).links) === JSON.stringify({ S1: "田中", S2: "田中 太郎" }),
    otherEntityAutoId: /^p_[A-Za-z0-9]{8}$/.test(jiroId || ""),
    rowsUnchanged: !!R.baseline && JSON.stringify(R.rows) === JSON.stringify(R.baseline),
    allRowsHaveId: R.allHaveId === true,
    crossEntityNote: typeof R.noteJiro === "string" && R.noteJiro.includes("番号 12 は甲法人でも使われています"),
    modalShowsId: R.modalId === "12",
    font16: Array.isArray(R.modalFonts) && R.modalFonts.length >= 4 && R.modalFonts.every(f => f >= 16),
    renameStaff: !!R.afterRename && JSON.stringify(R.afterRename.staff1) === JSON.stringify(["田中 一郎", "佐藤", "鈴木"]) && JSON.stringify(R.afterRename.staff2) === JSON.stringify(["田中 太郎", "高橋"]),
    renameSubsAll: !!R.afterRename && JSON.stringify(R.afterRename.subs) === JSON.stringify(["佐藤", "田中 一郎", "田中 一郎"]) && R.afterRename.sub2 === "田中 太郎",
    renameSettings: !!R.afterRename && R.afterRename.colors["田中 一郎"] === "red" && !R.afterRename.colors["田中"] && JSON.stringify(R.afterRename.aliases) === JSON.stringify({ "田中 一郎": ["たなか"] }) && R.afterRename.attrs["田中 一郎"] === "employee",
    renamePeriods: JSON.stringify(old.keepStaff) === JSON.stringify([{ name: "田中 一郎", index: 0 }]) && (old.keepAttrs || {})["田中 一郎"] === "parttime"
      && !!(old.laborTotals || {})["田中 一郎"] && JSON.stringify((old.snapshot || {}).staffList) === JSON.stringify(["田中 一郎", "佐藤"]) && ((old.snapshot || {}).settings || {}).staffNumbers["田中 一郎"] === "12",
    renamePay: !!R.afterRename && JSON.stringify(R.afterRename.pay) === JSON.stringify(["田中 一郎"]),
    renameLinks: !!R.afterRename && JSON.stringify(R.afterRename.links) === JSON.stringify({ S1: "田中 一郎", S2: "田中 太郎" }),
    renameOnlyChosenShop: Array.isArray(R.cfRename) && R.cfRename.length === 1 && JSON.stringify(R.cfRename[0].shopIds) === JSON.stringify(["S1"]),
    renameMsg: /名前を変更しました/.test(R.renameMsg || "") && JSON.stringify(R.rowAfterRename) === JSON.stringify(["田中 一郎"]),
    dupRejected: /既に登録されている名前です/.test(R.dupMsg || "") && JSON.stringify(R.dupStaff) === JSON.stringify(["田中 一郎", "佐藤", "鈴木"]),
    numberConflictRejected: /従業員番号 3 はこの法人で既に使われています/.test(R.numMsg || "") && R.numAfter === "A7",
    attrHome: !!R.attrHome && R.attrHome.a === "parttime" && R.attrHome.home === "S1",
    merged: R.mergedDelta === 1 && JSON.stringify((R.merged || {}).links) === JSON.stringify({ S1: "鈴木", S2: "高橋" }) && R.merged.number === "A7",
    mergeKeepsShopData: !!R.merged && JSON.stringify(R.merged.staff2) === JSON.stringify(["田中 太郎", "高橋"]),
    split: R.splitClick === true && R.afterSplitRows === R.merged.rows + 1,
    reassigned: R.reassignClick === true && JSON.stringify(R.reassigned) === JSON.stringify({ S1: "鈴木" }) && R.num77 === "77",
    splitStaysAfterReload: R.reloadRows === R.afterSplitRows && R.takahashiSeparate === true,
    mobileFits: !!R.mobile && R.mobile.page <= R.mobile.vw && R.mobile.left >= 0 && R.mobile.right <= R.mobile.vw,
    noErrors: [R.errors, R.errorsBase, R.errorsMobile].every(e => Array.isArray(e) && e.length === 0) && !R.exception && !R.exceptionBase && !R.exceptionMobile,
  };
  v.allPass = Object.values(v).every(Boolean);
  console.log(JSON.stringify({ R, verdict: v }, null, 2));
  process.exit(v.allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
