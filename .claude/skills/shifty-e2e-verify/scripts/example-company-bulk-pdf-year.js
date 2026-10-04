// 企業連携タブの一括PDF（全データ）が年度の値を正しく数えるかの実ブラウザ回帰テスト（2026-09-30・P7 の前に実測）。
// アプリ全体をスタブ Firebase（stub-firebase.js）で動かす。Firebase へは1バイトも出ない。
//
// 背景: 一括PDFの非表示マウントは pastSubsLoaded=true を渡すのに、提出は対象期間と直前の期間の2つしか読んでいなかった。
// ShiftEditTab は pastSubsLoaded=true の期間を「読めている」とみなすので、読んでいない期間は空欄＝実働0・全日公休として
// 年度の累計（年計・年平均所定）に入る。「＋」（読めていない印）も付かない＝黙って小さく出る。
//
// データ: 2026年度（4月開始）の4〜10月に1か月の期間を1つずつ。田中（バイト＝B制）は毎月2日 10:00〜15:00（休憩なし）＝月10:00。
//   正しい年計 = 7か月 × 10:00 = 70:00 ／ 年平均所定 = 10:00（凍結値 laborTotals は持たせない＝実データで数える経路）
//  - 一括PDF（10月・全データ）の「2026年度計」が 70:00、「年平均所定/分母」が 10:00 で始まる
//  - 同じ店舗を店舗単体で「全データ」出力した値と一致する（単体は書き出す前に3ヶ月より前の提出も読む）
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-company-bulk-pdf-year.js → allPass=true / EXIT=0
// 反証: SHIFTY_ROOT=<修正前の配信物> node ... → EXIT=1（年計 20:00・年平均 2:51 になる）
"use strict";
const path = require("node:path");
const { openHarness, REPO_ROOT } = require(path.join(__dirname, "mount-component.js"));
const { makeStub } = require(path.join(__dirname, "stub-firebase.js"));
const ROOT = process.env.SHIFTY_ROOT || REPO_ROOT;
const THEME = `<style>:root{--c-bg:#F0F2F5;--c-card:#FFFFFF;--c-input:#F3F4F6;--c-input2:#F0F2F5;` +
  `--c-border:#E5E7EB;--c-border2:#D1D5DB;--c-text:#1A1A2E;--c-text2:#374151;--c-text3:#6B7280;` +
  `--c-text4:#9CA3AF;--c-shadow:rgba(0,0,0,.06);--c-accent:#f87036;--c-danger:#DC2626;}</style>`;
const PDF_LIBS = `<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js" integrity="sha384-ZZ1pncU3bQe8y31yfZdMFdSpttDoPmOZg2wguVK9almUodir1PghgT0eY7Mrty8H" crossorigin="anonymous"></script>` +
  `<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js" integrity="sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk" crossorigin="anonymous"></script>`;
const UID = "U1", CID = "C1";
const MONTHS = ["04", "05", "06", "07", "08", "09", "10"];
const last = m => String(new Date(2026, Number(m), 0).getDate());
const periods = {}, subs = {};
MONTHS.forEach(m => {
  const id = "p" + m;
  periods[id] = { id, urlToken: "t" + m, shopId: "S1", label: `${Number(m)}月`, startDate: `2026-${m}-01`, endDate: `2026-${m}-${last(m)}`,
    deadlineDate: "", createdAt: "2026-03-01T00:00:00.000Z", ...(m === "10" ? { submission: { at: "2026-09-24T05:03:00.000Z", byUid: "x" } } : {}) };
  subs["s" + m] = { id: "s" + m, periodId: id, staffName: "田中", shopId: "S1", comment: "", submittedAt: "2026-03-20T00:00:00.000Z",
    shifts: { [`2026-${m}-07`]: { status: "work", start: "10:00", end: "15:00" }, [`2026-${m}-14`]: { status: "work", start: "10:00", end: "15:00" } } };
});
const seed = {
  global: { shops: { S1: { id: "S1", name: "A店" } } },
  shops: { S1: { owners: { [UID]: "KS1", [`company_${CID}`]: "KS1" }, private: { adminKey: "KS1" }, staff: { 0: "田中" }, periods, subs,
    settings: { shopId: "S1", candidates: [{ start: "09:00", end: "23:00" }], weekdayCandidates: {}, dateCandidates: {}, staffAttributes: { 田中: "parttime" } } } },
  accounts: { S1: { plan: "premium" }, [UID]: { shops: { S1: true }, company: { companyId: CID, code: "ABCD1234", name: "テスト企業" } } },
  companies: { [CID]: { pub: { name: "テスト企業", ownerUid: UID, code: "ABCD1234", shops: { S1: true } } } },
};
const spyJsPdf = () => {
  const Real = window.jspdf.jsPDF;
  window.__saves = [];
  window.jspdf = Object.assign({}, window.jspdf, { jsPDF: function (o) {
    const d = new Real(o);
    d.save = function (n) { window.__saves.push({ name: n, pages: d.getNumberOfPages() }); return d; };
    return d;
  } });
};
// PDF に描かれた表から、行の見出しに label を含む行の最初のスタッフ列の文字を取る
const rowValue = ({ html, label }) => {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  for (const tr of doc.querySelectorAll("tr")) {
    const tds = [...tr.children];
    if (tds.length > 1 && tds[0].textContent.includes(label)) return tds[1].textContent.replace(/\s+/g, "");
  }
  return null;
};

(async () => {
  const h = await openHarness({
    root: ROOT, jsx: "window.__harnessReady=true;", waitFor: "#root > *", viewport: { width: 1400, height: 950 },
    extraHead: THEME + PDF_LIBS + makeStub({ seed, uid: UID, view: "admin", tab: "company" }),
    scripts: ["app-utils.js", "app-my-utils.js", "app-core.js", "app-staff.js", "app-admin.js", "app-shift.js", "app-company.js", "app-my.js", "app-main.js"].map(src => ({ src, babel: !/utils|core/.test(src) })),
  });
  const R = {};
  try {
    await h.page.waitForFunction(() => !!document.querySelector("[data-co-summary]") && typeof window.jspdf !== "undefined", { timeout: 20000 });
    await h.evaluate(spyJsPdf);
    await h.page.waitForTimeout(400);
    R.range = await h.evaluate(() => { const s = document.querySelector("[data-co-summary]").closest("div").parentElement.querySelector("select"); return s ? s.value : null; });
    let cap = await h.capturePdf();
    await h.clickByText("全データPDF");
    await h.page.waitForFunction(() => !document.querySelector("[data-co-progress]") && window.__saves && window.__saves.length > 0, { timeout: 60000 });
    const bulkHtml = await cap.html();
    R.bulkYear = await h.evaluate(rowValue, { html: bulkHtml, label: "年度計" });
    R.bulkAvg = await h.evaluate(rowValue, { html: bulkHtml, label: "年平均所定" });

    // 店舗単体（A店）の「全データ」
    await h.evaluate(() => { window.__saves = []; });
    await h.clickExact("シフト作成");
    await h.page.waitForTimeout(1500);
    // 先に「過去データ読込」で3ヶ月より前の提出を読ませる（スタブの once は同じクエリの on より先に解決するので、
    // 「全データ」が内部で呼ぶ読み込み待ちに頼ると、届く前の提出で数えてしまう＝スタブだけの順序。実機の Firebase では起きない）
    await h.clickExact("過去データ読込");
    await h.page.waitForTimeout(800);
    cap = await h.capturePdf();
    await h.clickExact("PDF出力");
    await h.page.waitForTimeout(300);
    await h.clickByText("全データ");
    await h.page.waitForFunction(() => window.__saves.length > 0, { timeout: 60000 });
    const singleHtml = await cap.html();
    R.singleYear = await h.evaluate(rowValue, { html: singleHtml, label: "年度計" });
    R.singleAvg = await h.evaluate(rowValue, { html: singleHtml, label: "年平均所定" });
  } catch (e) { R.exception = e.stack || e.message; }
  R.errors = h.errors.slice();
  await h.close();

  const v = {
    octoberRange: R.range === "2026-10-01_2026-10-31",
    bulkYearTotal: R.bulkYear === "70:00",
    bulkYearAverage: typeof R.bulkAvg === "string" && R.bulkAvg.startsWith("10:00"),
    bulkMatchesSingle: !!R.bulkYear && R.bulkYear === R.singleYear && R.bulkAvg === R.singleAvg,
    noErrors: R.errors.length === 0 && !R.exception,
  };
  v.allPass = Object.values(v).every(Boolean);
  console.log(JSON.stringify({ R, verdict: v }, null, 2));
  process.exit(v.allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
