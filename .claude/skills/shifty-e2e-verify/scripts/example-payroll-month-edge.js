// 月次賃金（P6b）の月末をまたぐ週の法定休日の実ブラウザ回帰テスト（バグチェック#161・2026-10-02）。
// アプリ全体をスタブ Firebase（stub-firebase.js）で動かす。Firebase へは1バイトも出ない。
//
// 月次賃金ページは以前、提出を月末までの期間しか読んでいなかった。月末をまたぐ週（2026-10-26(月)〜11-01(日)）で
// 11/1 が終日の有給（休日ではない）なら、週に休日が無い → 最後の勤務日 10/31 が法定休日労働（決定 #5）。
// 11月の提出を読まないと 11/1 は空欄＝公休に見え、10/31 の法定休日労働（8:00）が月次賃金から消えていた。
//   田中: 10/26〜31 出勤・11/1 有給 → 10月の法定休日 8:00
//   佐藤: 10/26〜31 出勤・11/1 空欄 → 10月の法定休日なし（対照）
//   鈴木: 10/26〜31 出勤・11/1 出勤 → 10月の法定休日なし（法定休日は 11/1＝11月の分・対照）
// 期待値は同じ配信物の premiumBreakdownOf に「全部読めている」日を渡して出す（expectedPure）。
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-payroll-month-edge.js → allPass=true / EXIT=0
// 反証: SHIFTY_ROOT=<修正前の配信物> node ... → tanakaLegal8h=false / EXIT=1
"use strict";
const path = require("node:path");
const { openHarness, REPO_ROOT } = require(path.join(__dirname, "mount-component.js"));
const { makeStub } = require(path.join(__dirname, "stub-firebase.js"));
const ROOT = process.env.SHIFTY_ROOT || REPO_ROOT;
const THEME = `<style>:root{--c-bg:#F0F2F5;--c-card:#FFFFFF;--c-input:#F3F4F6;--c-input2:#F0F2F5;` +
  `--c-border:#E5E7EB;--c-border2:#D1D5DB;--c-text:#1A1A2E;--c-text2:#374151;--c-text3:#6B7280;` +
  `--c-text4:#9CA3AF;--c-shadow:rgba(0,0,0,.06);--c-accent:#f87036;--c-danger:#DC2626;}</style>`;
const UID = "U1";
const w = (s, e) => ({ status: "work", start: s, end: e });
const B12 = [{ start: "12:00", end: "13:00" }];
const P10 = { id: "p10", urlToken: "t10", shopId: "S1", label: "10月", startDate: "2026-10-01", endDate: "2026-10-31", deadlineDate: "", createdAt: "2026-09-01T00:00:00.000Z" };
const P11 = { id: "p11", urlToken: "t11", shopId: "S1", label: "11月", startDate: "2026-11-01", endDate: "2026-11-30", deadlineDate: "", createdAt: "2026-09-02T00:00:00.000Z" };
const lastWeek = () => { const o = {}; ["26", "27", "28", "29", "30", "31"].forEach(d => { o[`2026-10-${d}`] = w("09:00", "18:00"); }); return o; };
const PAID = { status: "work", adminRest: { start: true, end: true }, leaveTypes: { start: "paid", end: "paid" } };
const SETTINGS = { shopId: "S1", candidates: [{ start: "09:00", end: "23:00" }], weekdayCandidates: {}, dateCandidates: {},
  breakTimes: { weekday: B12, sat: B12, sun: B12, holSat: B12, holSun: B12 },
  staffNumbers: { 田中: "1", 佐藤: "2", 鈴木: "3" },
  staffAttributes: { 田中: "employee", 佐藤: "employee", 鈴木: "employee" }, staffTypeLimits: { employee: { name: "社員" } },
  staffColors: {}, staffAliases: {}, positions: { kitchen: [], hall: [] }, requiredPositions: {}, staffPositions: {} };
const mk = n => ({ payType: "monthly", base: 213500, effectiveFrom: "2026-04-01", allowances: [], fixedOt: { hours: 0, auto: true, amount: 0 },
  fixedNight: { hours: 0, amount: 0 }, commute: { amount: 0, per: "month" }, updatedAt: "t" });
const sub = (id, pid, name, shifts) => ({ id, periodId: pid, staffName: name, shopId: "S1", comment: "", submittedAt: "2026-09-02T00:00:00.000Z", shifts });
const seed = {
  global: { shops: { S1: { id: "S1", name: "A店" } } },
  shops: { S1: {
    owners: { [UID]: "KS1" }, private: { adminKey: "KS1", pay: { 田中: mk(), 佐藤: mk(), 鈴木: mk() } }, staff: ["田中", "佐藤", "鈴木"], settings: SETTINGS,
    periods: { p10: P10, p11: P11 },
    subs: {
      a1: sub("a1", "p10", "田中", lastWeek()), a2: sub("a2", "p11", "田中", { "2026-11-01": PAID }),
      b1: sub("b1", "p10", "佐藤", lastWeek()),
      c1: sub("c1", "p10", "鈴木", lastWeek()), c2: sub("c2", "p11", "鈴木", { "2026-11-01": w("09:00", "18:00") }),
    } } },
  accounts: { S1: { plan: "premium" }, [UID]: { shops: { S1: true } } },
};
const cellsOf = h => h.evaluate(() => {
  const out = {};
  document.querySelectorAll("[data-payroll-row]").forEach(tr => {
    const r = {};
    tr.querySelectorAll("td[data-col]").forEach(td => { r[td.getAttribute("data-col")] = td.innerText.trim(); });
    out[tr.getAttribute("data-payroll-row")] = r;
  });
  return out;
});
(async () => {
  const R = {};
  const h = await openHarness({
    root: ROOT, jsx: "window.__harnessReady=true;", waitFor: "#root > *", viewport: { width: 1400, height: 900 },
    extraHead: THEME + makeStub({ seed, uid: UID, view: "admin", tab: "staff", cfHandlers: {} }),
    scripts: ["app-utils.js", "app-core.js", "app-staff.js", "app-admin.js", "app-shift.js", "app-company.js", "app-main.js"].map(src => ({ src, babel: !/utils|core/.test(src) })),
  });
  try {
    await h.page.waitForFunction(() => !!document.querySelector("[data-open-payroll]"), { timeout: 15000 });
    await h.evaluate(() => document.querySelector("[data-open-payroll]").click());
    await h.page.waitForSelector("[data-payroll-page]", { timeout: 5000 });
    await h.page.$eval("[data-payroll-page] input[type=month]", (el, v) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }, "2026-10");
    await h.page.waitForTimeout(500);
    await h.page.waitForFunction(() => !!document.querySelector("[data-payroll-row]") || !!document.querySelector("[data-payroll-error]"), { timeout: 20000 });
    R.error = await h.evaluate(() => (document.querySelector("[data-payroll-error]") || {}).innerText || "");
    R.cells = await cellsOf(h);
    // 同じ配信物の純粋関数で、提出を全部読めているときの期待値を出す
    R.expected = await h.evaluate(() => {
      const mkDays = nov1 => {
        const ds = premiumMonthDates("2026-10", 1);
        return ds.map(d => {
          const worked = d >= "2026-10-26" && d <= "2026-10-31";
          if (worked) return { date: d, workMin: 480, scheduledMin: 480, nightMin: 0, rest: false };
          if (d === "2026-11-01") return nov1;
          return { date: d, workMin: 0, scheduledMin: 0, nightMin: 0, rest: true };
        });
      };
      const f = nov1 => premiumBreakdownOf({ system: "A", days: mkDays(nov1), ym: "2026-10", weekStartDow: 1, splitAtMonthEdge: 1, monthFrameMin: 10628 }).legalHolidayMin;
      return {
        paid: f({ date: "2026-11-01", workMin: 0, scheduledMin: 0, nightMin: 0, rest: false }),
        blank: f({ date: "2026-11-01", workMin: 0, scheduledMin: 0, nightMin: 0, rest: true }),
        worked: f({ date: "2026-11-01", workMin: 480, scheduledMin: 480, nightMin: 0, rest: false }),
      };
    });
  } catch (e) { R.exception = e.stack || e.message; }
  R.errors = h.errors.slice(); await h.close();
  const c = R.cells || {};
  const pick = n => ({ legal: (c[n] || {}).legalHolidayMin, work: (c[n] || {}).workMin, ot: (c[n] || {}).otMin, notes: (c[n] || {}).notes });
  const out = { error: R.error, expected: R.expected, 田中: pick("田中"), 佐藤: pick("佐藤"), 鈴木: pick("鈴木"), errors: R.errors, exception: R.exception };
  const v = {
    tanakaLegal8h: out.田中.legal === "8:00",
    satoNone: out.佐藤.legal === "0:00",
    suzukiNone: out.鈴木.legal === "0:00",
    expectedPure: !!R.expected && R.expected.paid === 480 && R.expected.blank === 0 && R.expected.worked === 0,
    noErrors: R.errors.length === 0 && !R.exception && !R.error,
  };
  v.allPass = Object.values(v).every(Boolean);
  console.log(JSON.stringify({ out, verdict: v }, null, 2));
  process.exit(v.allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
