// 企業横断ダッシュボード（2026-09-30・労務給与_複数法人_実装計画.md §6 P7）の実ブラウザ回帰テスト。
// アプリ全体をスタブ Firebase（stub-firebase.js）で動かす。Firebase へは1バイトも出ない。
//
// データ（2026年11月・1か月期間・年度は4月開始）。時間は example-payroll.js と同じ（労務判定表と同じ計算）:
//   法人A: A店（S1）＝田中（社員＝A制）・鈴木（バイト＝B制）。11月は確定済み・未交付。田中の11月の所定は laborMonths の登録値 183:20
//          B店（S2）＝11月にかかる期間なし
//   法人B: C店（S3）＝山田（バイト）。所定（laborMonths）は読めない（denyRead）
//  - 田中: 月所定 183:20 ／ 上限（総枠・30日）171:25 ／ 差 +11:55（赤）・年平均所定 183:20 − 分母 173:18 = +10:02（赤）・
//          月の残業（A制の残業予定）0:00 → 月の残り +45:00・年間休日 52日（10月の期間は空欄＝31日が公休＋11月21日）。10月の所定も 183:20
//   鈴木: 月の残業（B制の①＋②）14:00 → 月の残り +31:00・年の残り +346:00・720h の残り +706:00・複数月平均の最大 7:00（10〜11月）・年間休日 55日
//   山田: 11月だけ（空欄＝30日が公休）→ 年間休日 ＋30日・52日まで ＋22日（年度の途中＝淡色の「＋」）
//  A. 企業連携タブにカードがあり、11月を選んで「集計する」→ 法人の見出し2つ・店舗3行（A店は確定 1/1・交付 0/1、B店は期間なし、
//     C店は「所定を読み込めませんでした」）。A店を開くと人の行が出て上の値になる。CSV（BOM付き）に同じ値が入り、金額の列が無い。
//     集計の前後で A店の期間・所定が変わらない（非表示マウントは書き込まない）
//  B. Pro の店舗ではカードが出ない
//  C. 375px でページが横に動かない（表は枠の中でスクロール）
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-company-dashboard.js → allPass=true / EXIT=0
// 反証: SHIFTY_ROOT=<P7 より前の配信物> node ... → EXIT=1（カードが無い）
"use strict";
const path = require("node:path");
const { openHarness, REPO_ROOT } = require(path.join(__dirname, "mount-component.js"));
const { makeStub } = require(path.join(__dirname, "stub-firebase.js"));
const ROOT = process.env.SHIFTY_ROOT || REPO_ROOT;
const THEME = `<style>:root{--c-bg:#F0F2F5;--c-card:#FFFFFF;--c-input:#F3F4F6;--c-input2:#F0F2F5;` +
  `--c-border:#E5E7EB;--c-border2:#D1D5DB;--c-text:#1A1A2E;--c-text2:#374151;--c-text3:#6B7280;` +
  `--c-text4:#9CA3AF;--c-shadow:rgba(0,0,0,.06);--c-accent:#f87036;--c-danger:#DC2626;}</style>`;
const UID = "U1", CID = "C1";
const w = (s, e, x) => Object.assign({ status: "work", start: s, end: e }, x || {});
const B12 = [{ start: "12:00", end: "13:00" }];
const AT = "2026-10-31T10:00:00.000Z";
const per = (id, sid, s, e, extra) => ({ id, urlToken: "t" + id, shopId: sid, label: `${Number(s.slice(5, 7))}月`, startDate: s, endDate: e, deadlineDate: "", createdAt: "2026-09-01T00:00:00.000Z", ...(extra || {}) });
const tanaka = { "2026-11-02": w("09:00", "18:00"), "2026-11-04": w("13:00", "17:00", { extraStart: "23:00", extraEnd: "25:00" }) };
["09", "10", "11", "12", "13", "14", "15"].forEach(d => { tanaka[`2026-11-${d}`] = w("09:00", "18:00"); });
const suzuki = {};
["02", "03", "04", "05", "06", "07"].forEach(d => { suzuki[`2026-11-${d}`] = w("09:00", "19:00"); });
const SETTINGS = sid => ({ shopId: sid, candidates: [{ start: "09:00", end: "23:00" }], weekdayCandidates: {}, dateCandidates: {},
  breakTimes: { weekday: B12, sat: B12, sun: B12, holSat: B12, holSun: B12 },
  staffNumbers: { 田中: "12", 鈴木: "7" },
  staffAttributes: { 田中: "employee", 鈴木: "parttime", 山田: "parttime" }, staffTypeLimits: { employee: { name: "社員" }, parttime: { name: "バイト" } },
  staffColors: {}, staffAliases: {}, positions: { kitchen: [], hall: [] }, requiredPositions: {}, staffPositions: {} });
const names = { S1: "A店", S2: "B店", S3: "C店" };
const shopEntities = { S1: "E1", S2: "E1", S3: "E2" };
const mirror = sid => ({ id: CID, name: "テスト企業", entityId: shopEntities[sid], entityName: shopEntities[sid] === "E1" ? "法人A" : "法人B", kind: "shop",
  settings: {}, deadlines: {}, shops: names, shopEntities, syncedAt: "stub" });
const owners = { [UID]: "K", [`company_${CID}`]: "K" };
const seed = plan => ({
  global: { shops: { S1: { id: "S1", name: "A店" }, S2: { id: "S2", name: "B店" }, S3: { id: "S3", name: "C店" } } },
  shops: {
    S1: { owners, private: { adminKey: "K" }, staff: ["田中", "鈴木"], settings: SETTINGS("S1"), company: mirror("S1"),
      periods: { p10: per("p10", "S1", "2026-10-01", "2026-10-31"), p11: per("p11", "S1", "2026-11-01", "2026-11-30", { submission: { at: AT, byUid: "x" }, confirmation: { at: AT, byUid: "x" } }) },
      subs: { s1: { id: "s1", periodId: "p11", staffName: "田中", shopId: "S1", comment: "", submittedAt: AT, shifts: tanaka },
        s2: { id: "s2", periodId: "p11", staffName: "鈴木", shopId: "S1", comment: "", submittedAt: AT, shifts: suzuki } },
      laborMonths: { "2026-10": { 田中: { min: 11000, days: 9 } }, "2026-11": { 田中: { min: 11000, days: 9 } } } },
    S2: { owners, private: { adminKey: "K" }, staff: ["佐藤"], settings: SETTINGS("S2"), company: mirror("S2"),
      periods: { q10: per("q10", "S2", "2026-10-01", "2026-10-31") } },
    S3: { owners, private: { adminKey: "K" }, staff: ["山田"], settings: SETTINGS("S3"), company: mirror("S3"),
      periods: { r11: per("r11", "S3", "2026-11-01", "2026-11-30") } },
  },
  accounts: { S1: { plan }, [UID]: { shops: { S1: true, S2: true, S3: true }, company: { companyId: CID, code: "ABCD1234", name: "テスト企業" } } },
  companies: { [CID]: { pub: { name: "テスト企業", ownerUid: UID, code: "ABCD1234", shops: { S1: true, S2: true, S3: true },
    entities: { E1: { name: "法人A", createdAt: "t" }, E2: { name: "法人B", createdAt: "t" } }, defaultEntityId: "E1", shopEntities, config: { settings: {} } } } },
});
async function open(plan, o = {}) {
  return openHarness({
    root: ROOT, jsx: "window.__harnessReady=true;", waitFor: "#root > *", viewport: o.viewport || { width: 1400, height: 900 },
    extraHead: THEME + makeStub({ seed: seed(plan), uid: UID, view: "admin", tab: "company", denyRead: ["shops/S3/laborMonths"] }),
    scripts: ["app-utils.js", "app-core.js", "app-staff.js", "app-admin.js", "app-shift.js", "app-company.js", "app-main.js"].map(src => ({ src, babel: !/utils|core/.test(src) })),
  });
}
const selectMonth = async (h, ym) => {
  await h.page.$eval("[data-co-dashboard] input[type=month]", (el, v) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, ym);
};
const runAndWait = async h => {
  await h.evaluate(() => document.querySelector("[data-co-dashboard-run]").click());
  await h.page.waitForFunction(() => !!document.querySelector("[data-co-dashboard-table]") && !document.querySelector("[data-co-dashboard-progress]"), { timeout: 90000 });
};
const personCells = h => h.evaluate(() => {
  const out = {};
  document.querySelectorAll("[data-dash-person]").forEach(tr => {
    const r = { _bad: [], _partial: [] };
    tr.querySelectorAll("td[data-col]").forEach(td => {
      const k = td.getAttribute("data-col");
      r[k] = td.innerText.trim();
      if (td.getAttribute("data-bad")) r._bad.push(k);
      if (td.getAttribute("data-partial")) r._partial.push(k);
    });
    out[tr.getAttribute("data-dash-person")] = r;
  });
  return out;
});
const captureCsv = h => h.evaluate(async () => {
  const blobs = [];
  const oC = URL.createObjectURL, oK = HTMLAnchorElement.prototype.click;
  let name = "";
  URL.createObjectURL = b => { blobs.push(b); return "blob:stub"; };
  HTMLAnchorElement.prototype.click = function () { name = this.download; };
  try { document.querySelector("[data-co-dashboard-csv]").click(); await new Promise(r => setTimeout(r, 100)); }
  finally { URL.createObjectURL = oC; HTMLAnchorElement.prototype.click = oK; }
  if (!blobs.length) return null;
  const buf = new Uint8Array(await blobs[0].arrayBuffer());
  return { name, bom: buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF, text: new TextDecoder().decode(buf.slice(3)) };
});

(async () => {
  const R = {};
  let h = await open("premium");
  try {
    await h.page.waitForFunction(() => !!document.querySelector("[data-co-dashboard-run]"), { timeout: 20000 });
    R.monthFont = await h.evaluate(() => parseFloat(getComputedStyle(document.querySelector("[data-co-dashboard] input[type=month]")).fontSize));
    R.before = await h.evaluate(() => JSON.stringify([window.__db("shops/S1/periods"), window.__db("shops/S1/laborMonths")]));
    await selectMonth(h, "2026-11");
    await runAndWait(h);
    R.entityHeads = await h.evaluate(() => [...document.querySelectorAll("[data-dash-entity] td > div")].map(e => e.firstChild.textContent.trim()));
    R.shops = await h.evaluate(() => [...document.querySelectorAll("[data-dash-shop]")].map(e => ({ sid: e.getAttribute("data-dash-shop"), status: e.getAttribute("data-dash-status"), text: e.innerText.replace(/\s+/g, " ").trim() })));
    R.progressS1 = await h.evaluate(() => (document.querySelector("[data-dash-progress='S1']") || {}).innerText || "");
    R.countsS1 = await h.evaluate(() => (document.querySelector("[data-dash-counts='S1']") || {}).innerText || "");
    R.headers = await h.evaluate(() => [...document.querySelectorAll("[data-co-dashboard-table] thead tr:last-child th")].map(t => t.innerText.trim()));
    R.closedPersons = await h.evaluate(() => document.querySelectorAll("[data-dash-person]").length);
    await h.evaluate(() => document.querySelector("[data-dash-toggle='S1']").click());
    await h.evaluate(() => document.querySelector("[data-dash-toggle='S3']").click());
    await h.page.waitForTimeout(200);
    R.cells = await personCells(h);
    R.csv = await captureCsv(h);
    R.after = await h.evaluate(() => JSON.stringify([window.__db("shops/S1/periods"), window.__db("shops/S1/laborMonths")]));
  } catch (e) { R.exception = e.stack || e.message; }
  R.errors = h.errors.slice(); await h.close();

  h = await open("pro");
  try {
    await h.page.waitForFunction(() => document.body.innerText.includes("企業"), { timeout: 15000 });
    await h.page.waitForTimeout(600);
    R.proNoCard = await h.evaluate(() => !document.querySelector("[data-co-dashboard]"));
  } catch (e) { R.exceptionB = e.stack || e.message; }
  await h.close();

  h = await open("premium", { viewport: { width: 375, height: 812 } });
  try {
    await h.page.waitForFunction(() => !!document.querySelector("[data-co-dashboard-run]"), { timeout: 20000 });
    await selectMonth(h, "2026-11");
    await runAndWait(h);
    await h.evaluate(() => document.querySelector("[data-dash-toggle='S1']").click());
    await h.page.waitForTimeout(200);
    R.mobile = await h.evaluate(() => ({ page: document.documentElement.scrollWidth, vw: innerWidth }));
  } catch (e) { R.exceptionC = e.stack || e.message; }
  R.errorsC = h.errors.slice(); await h.close();

  const T = (R.cells || {})["田中"] || {}, S = (R.cells || {})["鈴木"] || {}, Y = (R.cells || {})["山田"] || {};
  const shop = sid => (R.shops || []).find(s => s.sid === sid) || {};
  const csv = (R.csv && R.csv.text) || "";
  const v = {
    entityHeads: JSON.stringify(R.entityHeads) === JSON.stringify(["法人A", "法人B"]),
    shopRows: shop("S1").status === "ok" && shop("S2").status === "none" && /この月にかかる期間がありません/.test(shop("S2").text)
      && shop("S3").status === "ok" && /所定を読み込めませんでした/.test(shop("S3").text),
    progress: R.progressS1 === "確定 1/1・交付 0/1",
    shopCounts: R.countsS1 === "対象 2人・所定超過 1・年平均超過 1・36協定 0・休日不足 0",
    headers: Array.isArray(R.headers) && ["名前", "区分", "月所定", "上限", "年平均", "分母", "月の残業", "月の残り", "年の残り", "720hの残り", "複数月平均", "80hの残り", "45h超", "年間休日", "52日まで"].every(x => R.headers.includes(x))
      && !R.headers.some(x => /円|賃金/.test(x)),
    personsCollapsedFirst: R.closedPersons === 0,
    tanaka: T.schedMin === "183:20" && T.capMin === "171:25" && T.schedDiffMin === "+11:55" && T.avgMin === "183:20" && T.avgDiffMin === "+10:02"
      && T.monthOtH === "0:00" && T.monthLeftH === "+45:00" && T.restDays === "52日" && T.restNeed === "0日",
    tanakaRed: (T._bad || []).includes("schedDiffMin") && (T._bad || []).includes("avgDiffMin") && !(T._bad || []).includes("monthLeftH"),
    suzuki: S.monthOtH === "14:00" && S.monthLeftH === "+31:00" && S.yearOtH === "14:00" && S.yearLeftH === "+346:00" && S.year720LeftH === "+706:00"
      && S.worstAvgH === "7:00" && S.avg80LeftH === "+73:00" && S.n45 === "0回" && S.restDays === "55日",
    yamadaPending: Y.restDays === "＋30日" && Y.restNeed === "＋22日" && (Y._partial || []).includes("restDays") && Y.schedMin === "0:00",
    csv: !!R.csv && R.csv.bom && R.csv.name === "テスト企業_2026-11_企業横断ダッシュボード.csv"
      && csv.includes('"法人A","A店","確定 1/1・交付 0/1","12","田中","変形","183:20","171:25","+11:55"')
      && csv.includes('"法人A","B店","期間なし"') && !/円|賃金|時給/.test(csv.split("\r\n")[0]),
    hiddenMountDoesNotWrite: !!R.before && R.before === R.after,
    monthInputFont16: R.monthFont >= 16,
    hiddenOnPro: R.proNoCard === true,
    mobileNoPageScroll: !!R.mobile && R.mobile.page <= R.mobile.vw,
    noErrors: R.errors.length === 0 && R.errorsC.length === 0 && !R.exception && !R.exceptionB && !R.exceptionC,
  };
  v.allPass = Object.values(v).every(Boolean);
  console.log(JSON.stringify({ R: { ...R, before: undefined, after: undefined, csv: R.csv ? { ...R.csv, text: csv.slice(0, 900) } : null }, verdict: v }, null, 2));
  process.exit(v.allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
