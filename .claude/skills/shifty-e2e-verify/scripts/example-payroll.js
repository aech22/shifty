// 月次賃金（2026-09-30・労務給与_複数法人_実装計画.md §4.5・P6b）の実ブラウザ回帰テスト。
// アプリ全体をスタブ Firebase（stub-firebase.js）で動かす。Firebase へは1バイトも出ない。
//
// データは example-labor-premium.js と同じ 2026年11月（1か月期間）。割増の時間はシフト作成タブの労務判定表と同じ計算で出る:
//   田中（社員＝A制・月給 213,500・固定残業 2h・分母 173.3h＝10,398分）: 時間外 4:00・深夜 2:00・法定休日 8:00。
//     11/10 に実績で遅刻 60 分（absentMin）。月所定は laborMonths の登録値 183:20（11,000分）＝年平均所定が分母を上回る警告
//     時間外手当 = 213,500 × 1.25 × (240 − 120) ÷ 10,398 = 3,079.9… → 3,080（固定残業 2h を充当）
//     深夜割増   = 213,500 × 0.25 × 120 ÷ 10,398 = 615.9… → 616
//     法定休日   = 213,500 × 1.35 × 480 ÷ 10,398 = 13,305.2… → 13,306
//     欠勤控除   = 213,500 × 60 ÷ 10,398 = 1,231.9… → 1,231（控除は切捨て）
//   鈴木（バイト＝B制・時給 1,231）: 実労働 54:00（3,240分）・時間外 14:00
//     時給×実労働 = 1,231 × 3,240 ÷ 60 = 66,474 ／ 時間外手当 = 1,231 × 0.25 × 840 ÷ 60 = 4,308.5 → 4,309
//
//  A. 自店（連携なし・Premium・オーナー）: スタッフタブの「月次賃金 →」で全画面が開く。解除前は金額が「••••」で時間は見え、
//     CSV は押せない。0000 で解除すると金額が出て、CSV（BOM付き UTF-8）に同じ値が入る。「← 戻る」でスタッフタブへ
//  B. 企業連携（法人の賃金設定: 時間外30%・円未満切捨て）: 企業連携タブの法人カード「月次賃金: A店 →」から開く。
//     鈴木の時間外手当 = 1,231 × 0.30 × 840 ÷ 60 = 5,170.2 → 5,170（切捨て）。法人の設定を開くと割増率と端数の欄がある。
//     賃金設定ページ（P6a）の割増率の表示も法人の設定になる（時間外 30%・月60時間超 55%）
//  C. Pro: 「月次賃金 →」が出ない
//  D. 375px: ページが横に動かない（表は枠の中でスクロール）
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-payroll.js → allPass=true / EXIT=0
// 反証: SHIFTY_ROOT=<P6b より前の配信物> node ... → EXIT=1
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
const P = { id: "p", urlToken: "t", shopId: "S1", label: "11月", startDate: "2026-11-01", endDate: "2026-11-30", deadlineDate: "", createdAt: "2026-09-01T00:00:00.000Z" };
const tanaka = { "2026-11-02": w("09:00", "18:00"), "2026-11-04": w("13:00", "17:00", { extraStart: "23:00", extraEnd: "25:00" }) };
["09", "10", "11", "12", "13", "14", "15"].forEach(d => { tanaka[`2026-11-${d}`] = w("09:00", "18:00"); });
const suzuki = {};
["02", "03", "04", "05", "06", "07"].forEach(d => { suzuki[`2026-11-${d}`] = w("09:00", "19:00"); });
const SETTINGS = { shopId: "S1", candidates: [{ start: "09:00", end: "23:00" }], weekdayCandidates: {}, dateCandidates: {},
  breakTimes: { weekday: B12, sat: B12, sun: B12, holSat: B12, holSun: B12 },
  staffNumbers: { 田中: "12", 鈴木: "7" },
  staffAttributes: { 田中: "employee", 鈴木: "parttime" }, staffTypeLimits: { employee: { name: "社員" }, parttime: { name: "バイト" } },
  staffColors: {}, staffAliases: {}, positions: { kitchen: [], hall: [] }, requiredPositions: {}, staffPositions: {} };
const PAY = {
  田中: { payType: "monthly", base: 213500, effectiveFrom: "2026-10-01", allowances: [], fixedOt: { hours: 2, auto: true, amount: 3080 },
    fixedNight: { hours: 0, amount: 0 }, commute: { amount: 0, per: "month" }, updatedAt: "t" },
  鈴木: { payType: "hourly", base: 1231, effectiveFrom: "2026-10-01", commute: { amount: 500, per: "day" }, updatedAt: "t" },
};
const wageSettings = { premiumRates: { ot: 30 }, roundingRule: "floor" };
const names = { S1: "A店" };
const mirror = () => ({ id: CID, name: "テスト企業", entityId: "E1", entityName: "テスト法人", kind: "shop",
  settings: { wageSettings }, deadlines: {}, shops: names, syncedAt: "stub" });
const seed = (plan, linked) => ({
  global: { shops: { S1: { id: "S1", name: "A店" } } },
  shops: { S1: {
    owners: { [UID]: "KS1" }, private: { adminKey: "KS1", pay: PAY }, staff: ["田中", "鈴木"], settings: SETTINGS,
    periods: { p: P },
    subs: { s1: { id: "s1", periodId: "p", staffName: "田中", shopId: "S1", comment: "", submittedAt: "2026-09-02T00:00:00.000Z", shifts: tanaka },
      s2: { id: "s2", periodId: "p", staffName: "鈴木", shopId: "S1", comment: "", submittedAt: "2026-09-02T00:00:00.000Z", shifts: suzuki } },
    actuals: { p: { 田中: { "2026-11-02": { end: "22:00" }, "2026-11-10": { absentMin: 60 } } } },
    laborMonths: { "2026-11": { 田中: { min: 11000, days: 9 } } },
    ...(linked ? { company: mirror() } : {}) } },
  accounts: { S1: { plan }, [UID]: { shops: { S1: true }, ...(linked ? { company: { companyId: CID, code: "ABCD1234", name: "テスト企業" } } : {}) } },
  ...(linked ? { companies: { [CID]: { pub: { name: "テスト企業", ownerUid: UID, code: "ABCD1234", shops: { S1: true },
    entities: { E1: { name: "テスト法人", createdAt: "t", settings: { wageSettings } } }, defaultEntityId: "E1", shopEntities: { S1: "E1" },
    config: { settings: {} } } } } } : {}),
});
const cfHandlers = Object.fromEntries(["ensureCompanyEntities", "createEntity", "renameEntity", "assignShopEntity", "saveEntityConfig", "setShopKind"].map(n => [n, "entity"]));
async function open(plan, linked, o = {}) {
  return openHarness({
    root: ROOT, jsx: "window.__harnessReady=true;", waitFor: "#root > *", viewport: o.viewport || { width: 1400, height: 900 },
    extraHead: THEME + makeStub({ seed: seed(plan, linked), uid: UID, view: "admin", tab: o.tab || "staff", cfHandlers }),
    scripts: ["app-utils.js", "app-core.js", "app-staff.js", "app-admin.js", "app-shift.js", "app-company.js", "app-main.js"].map(src => ({ src, babel: !/utils|core/.test(src) })),
  });
}
const BOX = "[data-payroll-page] [data-pay-code-box] input[type=password]";
const cellsOf = h => h.evaluate(() => {
  const out = {};
  document.querySelectorAll("[data-payroll-row]").forEach(tr => {
    const r = {};
    tr.querySelectorAll("td[data-col]").forEach(td => { r[td.getAttribute("data-col")] = td.innerText.trim(); });
    out[tr.getAttribute("data-payroll-row")] = r;
  });
  return out;
});
const waitTable = h => h.page.waitForFunction(() => !!document.querySelector("[data-payroll-row]") || !!document.querySelector("[data-payroll-error]"), { timeout: 20000 });
const selectMonth = async (h, ym) => {
  await h.page.$eval("[data-payroll-page] input[type=month]", (el, v) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, ym);
};
const captureCsv = h => h.evaluate(async () => {
  const blobs = [];
  const oC = URL.createObjectURL, oK = HTMLAnchorElement.prototype.click;
  let name = "";
  URL.createObjectURL = b => { blobs.push(b); return "blob:stub"; };
  HTMLAnchorElement.prototype.click = function () { name = this.download; };
  try { document.querySelector("[data-payroll-csv]").click(); await new Promise(r => setTimeout(r, 100)); }
  finally { URL.createObjectURL = oC; HTMLAnchorElement.prototype.click = oK; }
  if (!blobs.length) return null;
  const buf = new Uint8Array(await blobs[0].arrayBuffer());
  return { name, bom: buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF, text: new TextDecoder().decode(buf.slice(3)) };
});

(async () => {
  const R = {};
  // A. 自店
  let h = await open("premium", false);
  try {
    await h.page.waitForFunction(() => !!document.querySelector("[data-open-payroll]"), { timeout: 15000 });
    await h.evaluate(() => document.querySelector("[data-open-payroll]").click());
    await h.page.waitForSelector("[data-payroll-page]", { timeout: 5000 });
    R.fullPage = await h.evaluate(() => ![...document.querySelectorAll("button")].some(b => b.innerText.trim() === "期間"));
    await selectMonth(h, "2026-11");
    await waitTable(h);
    R.error = await h.evaluate(() => (document.querySelector("[data-payroll-error]") || {}).innerText || "");
    R.headers = await h.evaluate(() => [...document.querySelectorAll("[data-payroll-table] thead th")].map(t => t.innerText.trim()));
    R.locked = await cellsOf(h);
    R.csvDisabledLocked = await h.evaluate(() => document.querySelector("[data-payroll-csv]").disabled);
    R.boxFont = await h.evaluate(s => parseFloat(getComputedStyle(document.querySelector(s)).fontSize), BOX);
    R.monthFont = await h.evaluate(() => parseFloat(getComputedStyle(document.querySelector("[data-payroll-page] input[type=month]")).fontSize));
    await h.setInput(BOX, "0000"); await h.page.waitForTimeout(300);
    R.unlocked = await cellsOf(h);
    R.csv = await captureCsv(h);
    R.noteText = await h.evaluate(() => document.querySelector("[data-payroll-page]").innerText);
    await h.clickExact("← 戻る"); await h.page.waitForTimeout(300);
    R.back = await h.evaluate(() => document.body.innerText.includes("スタッフ一覧") && !document.querySelector("[data-payroll-page]"));
    R.noWrites = await h.evaluate(() => JSON.stringify(window.__db("shops/S1/periods/p")).indexOf("laborTotals") < 0);
  } catch (e) { R.exception = e.stack || e.message; }
  R.errors = h.errors.slice(); await h.close();

  // B. 企業連携タブの法人カードから
  h = await open("premium", true, { tab: "company" });
  try {
    await h.page.waitForFunction(() => !!document.querySelector("[data-co-payroll-btn]"), { timeout: 15000 });
    R.entityBtn = await h.evaluate(() => { const b = document.querySelector("[data-co-payroll-btn='S1']"); return b ? b.closest("[data-co-entity]").getAttribute("data-co-entity") + "|" + b.innerText.trim() : null; });
    // 法人の設定に割増率と端数の欄
    await h.evaluate(() => [...document.querySelectorAll("[data-co-entity] button")].find(b => b.innerText.trim() === "法人の設定").click());
    await h.page.waitForTimeout(200);
    R.entityRateFields = await h.evaluate(() => ({ n: document.querySelectorAll("[data-co-premium-rate] input").length,
      ot: (document.querySelector("[data-co-premium-rate='ot'] input") || {}).value, round: (document.querySelector("[data-co-rounding]") || {}).value }));
    await h.evaluate(() => document.querySelector("[data-co-payroll-btn='S1']").click());
    await h.page.waitForSelector("[data-payroll-page]", { timeout: 5000 });
    await selectMonth(h, "2026-11");
    await waitTable(h);
    await h.setInput(BOX, "0000"); await h.page.waitForTimeout(300);
    R.linked = await cellsOf(h);
    R.linkedNote = await h.evaluate(() => document.querySelector("[data-payroll-page]").innerText);
    // 賃金設定ページの割増率の表示も法人の設定（時間外30%）になる
    await h.clickExact("← 戻る"); await h.page.waitForTimeout(300);
    await h.clickExact("スタッフ"); await h.page.waitForTimeout(300);
    await h.clickExact("編集", { rowText: "鈴木" }); await h.page.waitForTimeout(200);
    await h.clickExact("賃金設定を開く →"); await h.page.waitForSelector("[data-staff-pay-page]", { timeout: 5000 });
    R.staffPayRates = await h.evaluate(() => (document.querySelector("[data-pay-rates]") || {}).innerText || "");
  } catch (e) { R.exceptionB = e.stack || e.message; }
  R.errorsB = h.errors.slice(); await h.close();

  // C. Pro
  h = await open("pro", false);
  try {
    await h.page.waitForFunction(() => document.body.innerText.includes("スタッフ一覧"), { timeout: 15000 });
    await h.page.waitForTimeout(400);
    R.proNoButton = await h.evaluate(() => !document.querySelector("[data-open-payroll]"));
  } catch (e) { R.exceptionC = e.stack || e.message; }
  await h.close();

  // D. 375px
  h = await open("premium", false, { viewport: { width: 375, height: 812 } });
  try {
    await h.page.waitForFunction(() => !!document.querySelector("[data-open-payroll]"), { timeout: 15000 });
    await h.evaluate(() => document.querySelector("[data-open-payroll]").click());
    await h.page.waitForSelector("[data-payroll-page]");
    await selectMonth(h, "2026-11");
    await waitTable(h);
    await h.setInput(BOX, "0000"); await h.page.waitForTimeout(300);
    R.mobile = await h.evaluate(() => ({ page: document.documentElement.scrollWidth, vw: innerWidth }));
  } catch (e) { R.exceptionD = e.stack || e.message; }
  R.errorsD = h.errors.slice(); await h.close();

  const L = R.locked || {}, U = R.unlocked || {}, K = R.linked || {};
  const T = U["田中"] || {}, S = U["鈴木"] || {};
  const v = {
    opensFullPage: R.fullPage === true && !R.error,
    headers: Array.isArray(R.headers) && ["所定", "実労働", "時間外①日", "時間外②週", "時間外③月", "60h超", "深夜", "法定休日", "欠勤・遅刻早退", "時間外手当", "固定残業の充当", "欠勤控除"].every(x => R.headers.includes(x)),
    // 時間は労務判定表（example-labor-premium.js）と同じ値
    timesSameAsLaborTable: (L["田中"] || {}).otMin === "4:00" && (L["田中"] || {}).nightMin === "2:00" && (L["田中"] || {}).legalHolidayMin === "8:00"
      && (L["田中"] || {}).absentMin === "1:00" && (L["田中"] || {}).scheduledMin === "183:20" && (L["鈴木"] || {}).otMin === "14:00" && (L["鈴木"] || {}).workMin === "54:00",
    maskedBeforeUnlock: (L["田中"] || {}).otPay === "••••" && (L["鈴木"] || {}).basePay === "••••" && (L["田中"] || {}).deduction === "••••" && R.csvDisabledLocked === true,
    monthlyAmounts: T.basePay === "213,500" && T.otCoveredMin === "2:00" && T.otPay === "3,080" && T.nightPay === "616" && T.holidayPay === "13,306" && T.deduction === "1,231",
    hourlyAmounts: S.basePay === "66,474" && S.otPay === "4,309" && S.deduction === "" && S.otCoveredMin === "",
    schedAvgWarning: /年平均所定 183:20 が分母 173:18 を上回っています/.test(T.notes || ""),
    csv: !!R.csv && R.csv.bom && /A店_2026-11_月次賃金\.csv$/.test(R.csv.name) && R.csv.text.includes('"12","田中"') && R.csv.text.includes('"3080"') && R.csv.text.includes('"66474"') && R.csv.text.includes('"4:00"'),
    fonts16: R.boxFont >= 16 && R.monthFont >= 16,
    backToStaffTab: R.back === true,
    hiddenMountDoesNotWrite: R.noWrites === true,
    entityPayrollButton: R.entityBtn === "E1|A店 →" && !!R.entityRateFields && R.entityRateFields.n === 4 && R.entityRateFields.ot === "30" && R.entityRateFields.round === "floor",
    linkedRatesApplied: (K["鈴木"] || {}).otPay === "5,170" && (K["鈴木"] || {}).basePay === "66,474" && /時間外30%/.test(R.linkedNote || "") && /円未満切捨て/.test(R.linkedNote || ""),
    staffPayPageShowsEntityRates: /時間外 30%.*月60時間超 55%（法人の設定）/.test(R.staffPayRates || ""),
    hiddenOnPro: R.proNoButton === true,
    mobileNoPageScroll: !!R.mobile && R.mobile.page <= R.mobile.vw,
    noErrors: R.errors.length === 0 && R.errorsB.length === 0 && R.errorsD.length === 0 && !R.exception && !R.exceptionB && !R.exceptionC && !R.exceptionD,
  };
  v.allPass = Object.values(v).every(Boolean);
  console.log(JSON.stringify({ R: { ...R, csv: R.csv ? { ...R.csv, text: R.csv.text.slice(0, 800) } : null, noteText: undefined, linkedNote: undefined }, verdict: v }, null, 2));
  process.exit(v.allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
