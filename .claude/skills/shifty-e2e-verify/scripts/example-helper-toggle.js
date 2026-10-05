// ヘルプ勤務の自動表示の ON/OFF（period.helperDisplayOff・2026-10-05 ユーザー指示）の実ブラウザ回帰テスト。
// ShiftEditTab だけをマウントし、他店舗のデータはスタブ Firebase（stub-firebase.js）から返す（example-helper-aggregate.js と同じ店舗・同じ田中）。
// 実ネットワーク・dev の Firebase へは1バイトも出ない（SKILL.md 1.6節）。
//
// 測るもの:
//  (a) メイングリッドの名前の見出しの下に切り替え（data-helper-toggle）が出るのは、自動のヘルプ勤務がある田中だけ（佐藤・山田には出ない・集計表の見出しにも出ない）
//  (b) OFF にすると savePeriods に period.helperDisplayOff={田中:true} が渡り、他の期間には書かない
//  (c) OFF の間、田中の自動表示（data-helper・黄色・読み取り専用）が消え、ヘルプ先だけの日は空欄で編集できる。自店の休みの提出の日は斜線に戻る
//  (d) 手打ちのヘルプ（10/2 の「9鶏三」＝adjustedStartNote）は ON/OFF に関係なくそのまま
//  (e) 労務判定・週の休み・月計・laborTotals は ON と OFF で同じ（見た目だけ）
//  (f) PDF・Excel からも自動表示が消える（Excel の休みの日は斜線に戻る）
//  (g) ON に戻すと表示が戻り helperDisplayOff が消える
//  (h) 全表示では切り替えを出さない／確定済みの期間では押せない（disabled）
//
// 実行: SHIFTY_ROOT=<リポジトリ> [SHIFTY_CDN_DIR=<CDN の npm 版を置いたディレクトリ>] node .claude/skills/shifty-e2e-verify/scripts/example-helper-toggle.js → allPass=true / EXIT=0
// 反証: SHIFTY_ROOT=<この機能より前の配信物> node ... → EXIT=1（切り替えが現れない）
"use strict";
const path = require("node:path");
const { openHarness } = require(path.join(__dirname, "mount-component.js"));
const { makeStub } = require(path.join(__dirname, "stub-firebase.js"));
const ROOT = process.env.SHIFTY_ROOT || undefined;
const THEME = `<style>:root{--c-bg:#F0F2F5;--c-card:#FFFFFF;--c-input:#F3F4F6;--c-input2:#F0F2F5;` +
  `--c-border:#E5E7EB;--c-border2:#D1D5DB;--c-text:#1A1A2E;--c-text2:#374151;--c-text3:#6B7280;` +
  `--c-text4:#9CA3AF;--c-shadow:rgba(0,0,0,.06);--c-accent:#f87036;--c-danger:#DC2626;}</style>`;
const PDF_LIBS = `<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js" integrity="sha384-ZZ1pncU3bQe8y31yfZdMFdSpttDoPmOZg2wguVK9almUodir1PghgT0eY7Mrty8H" crossorigin="anonymous"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js" integrity="sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk" crossorigin="anonymous"></script>
<script src="https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js"></script>`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const w = (s, e) => ({ status: "work", start: s, end: e });
const BRK0 = { weekday: [], sat: [], sun: [], holSat: [], holSun: [] };
const base = (sid, extra) => Object.assign({ shopId: sid, candidates: [{ start: "09:00", end: "23:00" }], weekdayCandidates: {}, dateCandidates: {},
  breakTimes: BRK0, staffAttributes: { "田中": "parttime", "佐藤": "parttime", "山田": "parttime" }, staffTypeLimits: {}, staffColors: {}, staffAliases: {},
  positions: { kitchen: [], hall: [] }, requiredPositions: {}, staffPositions: {} }, extra || {});
const B_SETTINGS = base("B", { staffHomeShop: { "田中": "A" }, shopAbbrs: ["鶏三"], shopAbbr2: { top: "鶏", bottom: "三" },
  breakTimes: { weekday: [{ start: "19:00", end: "19:30" }], sat: [], sun: [], holSat: [], holSun: [] } });
const B_PERIODS = { b1: { id: "b1", startDate: "2026-10-01", endDate: "2026-10-15", label: "10月前半" }, b2: { id: "b2", startDate: "2026-10-16", endDate: "2026-10-31", label: "10月後半" } };
const B_SUBS = {
  x1: { id: "x1", periodId: "b1", staffName: "田中", shopId: "B", shifts: {
    "2026-10-05": w("17:00", "23:00"), "2026-10-07": w("11:00", "15:00"), "2026-10-08": w("17:00", "23:00"), "2026-10-09": w("11:00", "15:00") } },
  x3: { id: "x3", periodId: "b1", staffName: "佐藤", shopId: "B", shifts: { "2026-10-06": w("17:00", "22:00") } },
};
const A_SETTINGS = base("A");
const A_PERIOD = { id: "pa", urlToken: "ta", shopId: "A", label: "10月", startDate: "2026-10-01", endDate: "2026-10-31", deadlineDate: "", createdAt: "2026-09-01T00:00:00.000Z" };
const A_OTHER = { id: "pz", urlToken: "tz", shopId: "A", label: "11月", startDate: "2026-11-01", endDate: "2026-11-30", deadlineDate: "", createdAt: "2026-09-01T00:00:00.000Z" };
const A_SUBS = {
  a1: { id: "a1", periodId: "pa", staffName: "田中", shopId: "A", comment: "", submittedAt: "2026-09-02T00:00:00.000Z", shifts: {
    "2026-10-01": w("10:00", "15:00"),
    // 手打ちのヘルプ（略称サフィックス）。自動表示の ON/OFF では変わらない
    "2026-10-02": { status: "work", start: "09:00", end: "15:00", adjustedStartNote: "鶏三" },
    "2026-10-07": w("17:00", "23:00"), "2026-10-08": w("11:00", "15:00"), "2026-10-09": { status: "holiday" } } },
  a2: { id: "a2", periodId: "pa", staffName: "佐藤", shopId: "A", comment: "", submittedAt: "2026-09-02T00:00:00.000Z", shifts: { "2026-10-01": w("10:00", "15:00") } },
};
const SEED = { shops: {
  A: { staff: ["田中", "佐藤", "山田"], settings: A_SETTINGS, subs: A_SUBS, periods: { pa: A_PERIOD, pz: A_OTHER } },
  B: { staff: ["田中", "佐藤"], settings: B_SETTINGS, subs: B_SUBS, periods: B_PERIODS },
}, global: { shops: { A: { name: "A店" }, B: { name: "鷄えん3ビル" } } } };
const cfc = require(path.join(__dirname, "..", "..", "..", "..", "functions", "company-config.js"));
const PUB = { name: "テスト企業", shops: { A: true, B: true },
  people: { "1042": { links: { A: "田中", B: "田中" } }, "p_AAAAAAAA": { links: { A: "佐藤" } }, "p_BBBBBBBB": { links: { B: "佐藤" } } } };
const LINK = cfc.buildShopMirror("C1", PUB, "A", { A: "A店", B: "鷄えん3ビル" }, "t");

async function mount(period) {
  const periods = [A_OTHER, period];
  const h = await openHarness({
    root: ROOT, viewport: { width: 1400, height: 900 }, extraHead: THEME + PDF_LIBS + makeStub({ seed: SEED, uid: "u_manager" }), waitFor: "[data-scn]",
    jsx: `
firebaseDB = firebase.database();
window.__saved=[];window.__toasts=[];
const SUBS=${JSON.stringify(Object.values(A_SUBS))};const SETTINGS=${JSON.stringify(A_SETTINGS)};
function Harness(){
  const [subs,setSubs]=React.useState(SUBS);
  const [periods,setPeriods]=React.useState(${JSON.stringify(periods)});
  return <ShiftEditTab subs={subs} periods={periods} staffList={["田中","佐藤","山田"]}
    onSave={v=>setSubs(p=>typeof v==="function"?v(p):v)} tt={m=>window.__toasts.push(m)} initialPeriodId="pa"
    settings={SETTINGS} plan="premium" shopId="A" shopName="A店" onUpgrade={()=>{}}
    allLinkedShops={[]} companyLink={${JSON.stringify(LINK)}}
    savePeriods={ps=>{window.__saved.push(JSON.parse(JSON.stringify(ps)));setPeriods(ps);}} ownerReadOnly={false} pastSubsLoaded={true}/>;
}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);`,
  });
  await sleep(1500);
  return h;
}
const cellOf = (h, n, d, f) => h.evaluate(([n, d, f]) => {
  const el = document.querySelector(`[data-sc="${d}|${f}"][data-scn="${n}"]`);
  if (!el) return null;
  const cs = getComputedStyle(el);
  return { v: el.value, ro: el.readOnly, helper: el.getAttribute("data-helper"), bgImg: cs.backgroundImage, title: el.title };
}, [n, d, f]);
const toggles = h => h.evaluate(() => [...document.querySelectorAll("[data-helper-toggle]")].map(b => ({ name: b.getAttribute("data-helper-toggle"), off: b.getAttribute("data-helper-off"), disabled: b.disabled })));
const laborOf = h => h.evaluate(() => {
  const table = head => {
    const wrap = [...document.querySelectorAll("div")].find(d => (d.innerText || "").startsWith(head));
    if (!wrap) return null;
    const rows = {};
    [...wrap.querySelectorAll("tbody tr")].forEach(tr => { const tds = [...tr.querySelectorAll("td")].map(td => td.innerText.trim()); rows[tds[0]] = tds.slice(1); });
    return rows;
  };
  let month = null;
  document.querySelectorAll("tr").forEach(tr => { const tds = [...tr.querySelectorAll("td")].map(td => td.innerText.trim()); if (tds.length > 1 && tds[0] === "月計") month = tds.slice(1); });
  const tables = [...document.querySelectorAll("table")].filter(t => !t.querySelector("input")).map(t => t.innerText.replace(/\s+/g, " ").trim());
  return { labor: table("労務判定（2026年10月）"), weekRest: table("週の休み"), month, tables };
});
const lastPa = h => h.evaluate(() => { const l = window.__saved.slice(-1)[0]; return l ? l.find(p => p && p.id === "pa") : null; });
const lastTotals = h => h.evaluate(() => { const l = [...window.__saved].reverse().find(ps => { const p = ps.find(x => x && x.id === "pa"); return p && p.laborTotals; }); return l ? l.find(x => x.id === "pa").laborTotals : null; });
const pdfHelpers = async h => {
  await h.capturePdf();
  await h.clickExact("PDF出力"); await h.clickExact("シフト"); await sleep(6000);
  return h.evaluate(() => {
    const html = (window.__pdf ? window.__pdf.blocks : []).join("");
    window.__pdf = null;
    const d = document.createElement("div"); d.innerHTML = html;
    return { helpers: [...d.querySelectorAll("[data-helper]")].map(td => td.textContent.trim()), hasManual: html.includes("9鶏三"), len: html.length };
  });
};
const excelOf = async h => {
  const dl = await h.captureDownloads();
  await h.clickExact("Excel出力"); await sleep(2000);
  const r = await h.evaluate(async () => {
    const b = window.__dl && window.__dl.blobs.slice(-1)[0];
    if (!b) return null;
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await b.arrayBuffer());
    const ws = wb.worksheets[0];
    let col = -1; ws.getRow(2).eachCell({ includeEmpty: true }, (c, i) => { if (String(c.value || "") === "田中") col = i; });
    const res = {};
    for (let r = 3; r <= ws.rowCount; r += 2) {
      const day = ws.getRow(r).getCell(1).value;
      if (typeof day !== "number") continue;
      const cl = c => ({ v: c.value == null ? "" : String(c.value), yel: !!(c.fill && c.fill.fgColor && c.fill.fgColor.argb === "FFFFFF00"), diag: !!(c.border && c.border.diagonal) });
      res[day] = { s: cl(ws.getRow(r).getCell(col)), e: cl(ws.getRow(r + 1).getCell(col)) };
    }
    return res;
  });
  await dl.restore();
  return r;
};

(async () => {
  const v = {};
  const out = {};
  const h = await mount(A_PERIOD);
  // ===== ON（既定）=====
  out.togglesOn = await toggles(h);
  out.on = { d5: await cellOf(h, "田中", "2026-10-05", "start"), d2: await cellOf(h, "田中", "2026-10-02", "start"), d9: await cellOf(h, "田中", "2026-10-09", "start") };
  out.laborOn = await laborOf(h);
  out.totalsOn = await lastTotals(h);
  v.a_onlyTanaka = out.togglesOn.length === 1 && out.togglesOn[0].name === "田中" && out.togglesOn[0].off === "0" && !out.togglesOn[0].disabled;
  v.a_onShowsHelper = !!out.on.d5 && out.on.d5.v === "17鶏" && out.on.d5.helper === "1" && out.on.d5.ro === true;
  v.d_manualOn = !!out.on.d2 && out.on.d2.v === "9鶏三" && out.on.d2.helper === null;
  out.pdfOn = await pdfHelpers(h);
  out.xlOn = await excelOf(h);

  // ===== OFF =====
  await h.page.click('[data-helper-toggle="田中"]'); await sleep(1200);
  out.savedOff = await lastPa(h);
  out.savedOther = await h.evaluate(() => { const l = window.__saved.slice(-1)[0]; return l ? l.find(p => p && p.id === "pz") : null; });
  out.togglesOff = await toggles(h);
  out.off = {};
  for (const d of ["2026-10-02", "2026-10-05", "2026-10-07", "2026-10-08", "2026-10-09"]) out.off[d] = { s: await cellOf(h, "田中", d, "start"), e: await cellOf(h, "田中", d, "end") };
  out.laborOff = await laborOf(h);
  out.totalsOff = await lastTotals(h);
  out.toasts = await h.evaluate(() => window.__toasts.slice());
  v.b_savedOnPeriod = !!out.savedOff && JSON.stringify(out.savedOff.helperDisplayOff) === JSON.stringify({ "田中": true });
  v.b_otherPeriodUntouched = !!out.savedOther && !("helperDisplayOff" in out.savedOther);
  v.b_toggleShowsOff = out.togglesOff.length === 1 && out.togglesOff[0].off === "1";
  const O = out.off;
  v.c_helperOnlyDayBlankEditable = O["2026-10-05"].s.v === "" && O["2026-10-05"].e.v === "" && O["2026-10-05"].s.ro === false && O["2026-10-05"].s.helper === null;
  v.c_mixedDayOwnOnly = O["2026-10-07"].s.v === "17" && O["2026-10-07"].e.v === "23" && O["2026-10-08"].e.v === "15" && O["2026-10-07"].s.helper === null;
  v.c_holidayHatchBack = /svg/.test(O["2026-10-09"].s.bgImg + O["2026-10-09"].e.bgImg) && !/svg/.test(out.on.d9.bgImg);
  v.d_manualOff = O["2026-10-02"].s.v === "9鶏三";
  // 見た目だけ: 労務・週の休み・月計・期間別などの表（入力欄を持たない表）と laborTotals が ON と同じ
  v.e_laborSame = JSON.stringify(out.laborOn.labor) === JSON.stringify(out.laborOff.labor) && !!out.laborOn.labor
    && JSON.stringify(out.laborOn.weekRest) === JSON.stringify(out.laborOff.weekRest) && JSON.stringify(out.laborOn.month) === JSON.stringify(out.laborOff.month);
  v.e_tablesSame = JSON.stringify(out.laborOn.tables) === JSON.stringify(out.laborOff.tables);
  v.e_totalsSame = !!out.totalsOn && JSON.stringify(out.totalsOn) === JSON.stringify(out.totalsOff || out.totalsOn);
  v.e_toastSaysAggregateContinues = out.toasts.some(t => /OFF/.test(t) && /合算は続けます/.test(t));
  out.pdfOff = await pdfHelpers(h);
  out.xlOff = await excelOf(h);
  v.f_pdf = out.pdfOn.helpers.length === 6 && out.pdfOff.helpers.length === 0 && out.pdfOn.hasManual && out.pdfOff.hasManual;
  const X0 = out.xlOn || {}, X1 = out.xlOff || {};
  v.f_excel = !!X0[5] && X0[5].s.v === "17鶏" && X0[5].s.yel && !!X1[5] && X1[5].s.v === "" && !X1[5].s.yel
    && !X0[9].s.diag && X1[9].s.diag && X1[2].s.v.startsWith("9");

  // ===== 全表示では出さない =====
  await h.clickExact("全表示"); await sleep(800);
  out.togglesFull = await toggles(h);
  await h.clickExact("通常表示"); await sleep(500);
  v.h_hiddenInFullView = out.togglesFull.length === 0;

  // ===== ON に戻す =====
  await h.page.click('[data-helper-toggle="田中"]'); await sleep(1200);
  out.savedBack = await lastPa(h);
  out.back = await cellOf(h, "田中", "2026-10-05", "start");
  v.g_backOn = !!out.savedBack && !("helperDisplayOff" in out.savedBack) && !!out.back && out.back.v === "17鶏" && out.back.helper === "1";
  out.errors = h.errors.slice();
  await h.close();

  // ===== 確定済みの期間では押せない（OFF の表示は残る）=====
  const hc = await mount({ ...A_PERIOD, confirmation: { at: "2026-10-01T00:00:00.000Z", byUid: "u_manager" }, helperDisplayOff: { "田中": true } });
  out.togglesConfirmed = await toggles(hc);
  out.confirmedD5 = await cellOf(hc, "田中", "2026-10-05", "start");
  await hc.page.click('[data-helper-toggle="田中"]', { force: true }).catch(() => {}); await sleep(500);
  out.savedConfirmed = await hc.evaluate(() => window.__saved.filter(ps => { const p = ps.find(x => x && x.id === "pa"); return p && !(p.helperDisplayOff && p.helperDisplayOff["田中"]); }).length);
  out.errorsC = hc.errors.slice();
  await hc.close();
  v.h_confirmedDisabled = out.togglesConfirmed.length === 1 && out.togglesConfirmed[0].disabled === true && out.togglesConfirmed[0].off === "1"
    && out.savedConfirmed === 0 && !!out.confirmedD5 && out.confirmedD5.helper === null;
  v.noErrors = out.errors.length === 0 && out.errorsC.length === 0;
  v.allPass = Object.values(v).every(Boolean);
  console.log(JSON.stringify({ out, verdict: v }, null, 2));
  process.exit(v.allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
