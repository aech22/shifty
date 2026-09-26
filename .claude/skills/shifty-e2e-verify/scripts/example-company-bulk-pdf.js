// 企業連携タブの一括PDF（2026-09-27 企業連携の拡張）の実ブラウザ回帰テスト。
// アプリ全体をスタブ Firebase 上で動かす（stub-firebase.js）。Firebase へは1バイトも出ない。
//
// 測るもの（提出済み A店・C店、未提出 B店、10月前半）:
//  - 「シフトのみPDF（2店舗）」で jsPDF の save が1回だけ呼ばれ、ファイル名が「企業名_開始〜終了_シフト.pdf」
//  - シフトのみのページ数は2（1店舗1ページ・先頭に空白ページが入らない）
//  - PDF に描かれる見出しに A店・C店が出て、未提出の B店は出ない
//  - 「全データPDF」のページ数は、同じ店舗を店舗単体で「全データ」出力したときのページ数の2倍
//  - 一括出力の前後で、他店舗（S3）の期間レコードが変わらない（写し・労務合計を書かない）
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-company-bulk-pdf.js → allPass=true / EXIT=0
"use strict";
const path = require("node:path");
const { openHarness, REPO_ROOT } = require(path.join(__dirname, "mount-component.js"));
const { makeStub } = require(path.join(__dirname, "stub-firebase.js"));
const ROOT = process.env.SHIFTY_ROOT || REPO_ROOT;
const THEME = `<style>:root{--c-bg:#F0F2F5;--c-card:#FFFFFF;--c-input:#F3F4F6;--c-input2:#F0F2F5;` +
  `--c-border:#E5E7EB;--c-border2:#D1D5DB;--c-text:#1A1A2E;--c-text2:#374151;--c-text3:#6B7280;` +
  `--c-text4:#9CA3AF;--c-shadow:rgba(0,0,0,.06);--c-accent:#f87036;--c-danger:#DC2626;}</style>`;
// index.html と同じ版・同じ SRI で読む
const PDF_LIBS = `<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js" integrity="sha384-ZZ1pncU3bQe8y31yfZdMFdSpttDoPmOZg2wguVK9almUodir1PghgT0eY7Mrty8H" crossorigin="anonymous"></script>` +
  `<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js" integrity="sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk" crossorigin="anonymous"></script>`;
const RK = "2026-10-01_2026-10-15";
const UID = "U1", CID = "C1";

const per = (id, sid, extra) => ({ id, urlToken: "t" + id, shopId: sid, label: "10月前半", startDate: "2026-10-01", endDate: "2026-10-15", deadlineDate: "", createdAt: "2026-09-01T00:00:00.000Z", ...(extra || {}) });
const subsFor = (sid, pid) => ({ ["x" + sid]: { id: "x" + sid, periodId: pid, staffName: "田中", shopId: sid, comment: "", submittedAt: "2026-09-20T00:00:00.000Z",
  shifts: { "2026-10-01": { status: "work", start: "10:00", end: "15:00" }, "2026-10-02": { status: "work", start: "17:00", end: "22:00" } } } });
const shop = (sid, pid, sub) => ({ owners: { [UID]: "K" + sid, [`company_${CID}`]: "K" + sid }, private: { adminKey: "K" + sid },
  staff: { 0: "田中", 1: "佐藤" }, periods: { [pid]: per(pid, sid, sub ? { submission: { at: "2026-09-24T05:03:00.000Z", byUid: "x" } } : {}) }, subs: subsFor(sid, pid) });
const seed = {
  global: { shops: { S1: { id: "S1", name: "A店" }, S2: { id: "S2", name: "B店" }, S3: { id: "S3", name: "C店" } } },
  shops: { S1: shop("S1", "p1", true), S2: shop("S2", "p2", false), S3: shop("S3", "p3", true) },
  accounts: { S1: { plan: "premium" }, [UID]: { shops: { S1: true, S2: true, S3: true }, company: { companyId: CID, code: "ABCD1234", name: "テスト企業" } } },
  companies: { [CID]: { pub: { name: "テスト企業", ownerUid: UID, code: "ABCD1234", shops: { S1: true, S2: true, S3: true } } } },
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
const selectRange = rk => {
  const c = document.querySelector("[data-co-summary]").closest("div").parentElement;
  const sel = c.querySelector("select");
  const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
  set.call(sel, rk); sel.dispatchEvent(new Event("change", { bubbles: true }));
};
const waitDone = h => h.page.waitForFunction(() => !document.querySelector("[data-co-progress]") && window.__saves && window.__saves.length > 0, { timeout: 60000 });

(async () => {
  const h = await openHarness({
    root: ROOT, jsx: "window.__harnessReady=true;", waitFor: "#root > *", viewport: { width: 1400, height: 950 },
    extraHead: THEME + PDF_LIBS + makeStub({ seed, uid: UID, view: "admin", tab: "company" }),
    scripts: ["app-utils.js", "app-core.js", "app-staff.js", "app-admin.js", "app-main.js"].map(src => ({ src, babel: !/utils|core/.test(src) })),
  });
  const R = {};
  try {
    await h.page.waitForFunction(() => !!document.querySelector("[data-co-summary]") && typeof window.jspdf !== "undefined", { timeout: 20000 });
    await h.evaluate(spyJsPdf);
    await h.evaluate(selectRange, RK);
    await h.page.waitForTimeout(400);
    R.periodsS3Before = await h.evaluate(() => JSON.stringify(window.__db("shops/S3/periods")));
    R.shiftBtn = await h.evaluate(() => [...document.querySelectorAll("button")].map(b => b.innerText.trim()).find(t => t.startsWith("シフトのみPDF")) || null);
    const cap = await h.capturePdf();
    await h.clickByText("シフトのみPDF");
    await waitDone(h);
    await h.page.waitForTimeout(300);
    R.shiftSave = await h.evaluate(() => window.__saves.slice());
    R.shiftText = await cap.text();
    R.toast = await h.evaluate(() => document.body.innerText.includes("テスト企業_2026-10-01〜2026-10-15_シフト.pdf をダウンロードしました"));
    R.periodsS3After = await h.evaluate(() => JSON.stringify(window.__db("shops/S3/periods")));

    await h.evaluate(() => { window.__saves = []; });
    await h.clickByText("全データPDF");
    await waitDone(h);
    R.allSave = await h.evaluate(() => window.__saves.slice());

    // 店舗単体（A店＝表示中の店舗）の「全データ」ページ数
    await h.evaluate(() => { window.__saves = []; });
    await h.clickExact("シフト作成");
    await h.page.waitForTimeout(1500);
    await h.clickExact("PDF出力");
    await h.page.waitForTimeout(300);
    await h.clickByText("全データ");
    await h.page.waitForFunction(() => window.__saves.length > 0, { timeout: 60000 });
    R.singleAll = await h.evaluate(() => window.__saves.slice());
  } catch (e) { R.exception = e.message; }
  R.errors = h.errors.slice();
  await h.close();

  const cnt = (t, w) => (t || "").split(w).length - 1;
  const v = {
    buttonLabel: R.shiftBtn === "シフトのみPDF（2店舗）",
    savedOnce: !!(R.shiftSave && R.shiftSave.length === 1),
    fileName: !!(R.shiftSave && R.shiftSave[0] && R.shiftSave[0].name === "テスト企業_2026-10-01〜2026-10-15_シフト.pdf"),
    shiftPages2: !!(R.shiftSave && R.shiftSave[0] && R.shiftSave[0].pages === 2),
    includesSubmitted: cnt(R.shiftText, "A店") >= 1 && cnt(R.shiftText, "C店") >= 1,
    excludesPending: cnt(R.shiftText, "B店") === 0,
    toast: R.toast === true,
    noWriteToOtherShopPeriods: !!R.periodsS3Before && R.periodsS3Before === R.periodsS3After,
    allPagesMatchSingle: !!(R.allSave && R.allSave[0] && R.singleAll && R.singleAll[0] && R.allSave[0].pages === 2 * R.singleAll[0].pages),
    noErrors: R.errors.length === 0 && !R.exception,
  };
  v.allPass = Object.values(v).every(Boolean);
  console.log(JSON.stringify({ R: { ...R, shiftText: (R.shiftText || "").slice(0, 200) }, verdict: v }, null, 2));
  process.exit(v.allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
