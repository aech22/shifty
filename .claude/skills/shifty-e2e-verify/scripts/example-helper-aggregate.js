// P3.6（ヘルプ先勤務の所属店舗への合算）＋ H2（2026-10-04 ヘルプ勤務の表示変更）の実ブラウザ回帰テスト。
// ShiftEditTab だけをマウントし、他店舗のデータはスタブ Firebase（stub-firebase.js）から返す。
// 実ネットワーク・dev の Firebase へは1バイトも出ない（SKILL.md 1.6節）。
// セッションは店長（uid は企業コードのログインではない・allLinkedShops は空）で、同一人物は写し（companyLink.people）から引く。
//
// 行き先 B（鷄えん3ビル）の略称は 1セル用「鶏三」・2セル用 上「鶏」下「三」。田中（所属 A・1か月の期間）の各日:
//   10/1  自店のみ 10-15                    → 「10」「15」黄色なし
//   10/5  ヘルプ先のみ B 17-23              → 「17鶏」「23三」上下とも黄・読み取り専用
//   10/7  昼ヘルプ B 11-15＋夜自店 17-23     → 「11鶏三」（黄）「23」。上を選ぶと自店の「17」に切り替わって編集できる
//   10/8  昼自店 11-15＋夜ヘルプ B 17-23     → 「11」「23鶏三」（黄）
//   10/9  自店はスタッフ提出の休み＋B 11-15   → 「11鶏」「15三」、休みの斜線なし（画面・Excel）
//   10/13 自店 10-15 と B 12-16 が重なる      → ヘルプは出さない（helperWorkOn の重複除外）
//   10/20 ヘルプ先のみ B 17-21（B は半月の期間の後半）
// 測るもの:
//  (a) 上の表示・黄色・読み取り専用・「→」・斜体・灰色が無いこと・ツールチップ（隠れる時刻も含む全件）
//  (b) 混在の日のフォーカス編集: 自店の値に切り替わり、保存されるのは自店の値だけ（略称は subs に入らない）・blur で合成表示に戻る
//  (c) 列幅は変えない: 田中の列の td の位置と幅が H2 より前と同じ（通常表示・全表示）。合成表示は文字を縮めて収め、入力欄の高さは変えない
//  (d) 労務判定・週の休み・期間別勤務時間・ヒートマップ・重複の表示が H2 より前と同じ（STABLE に H2 前の配信物で測った値）
//  (e) PDF と Excel にも同じ文字・黄色、ヘルプ先の勤務がある日は Excel の斜線なし（生成物を読み直す）
//  (f) 同じ名前でも人物（personId）が別の佐藤は合算・表示されない／行き先の店 B では田中は「所属店舗で判定」
//  (g) 他店舗を読み終える前に合算前の laborTotals を書かない
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-helper-aggregate.js → allPass=true / EXIT=0
// 反証: SHIFTY_ROOT=<H2 より前の配信物> node ... → EXIT=1（表示の項目が落ちる。STABLE の項目は通る＝計算は変えていない）
// STABLE の取り直し: DUMP_STABLE=1 SHIFTY_ROOT=<H2 より前の配信物> node ... で stable を出力する
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

// 行き先 B（鷄えん3ビル）。佐藤は B の別人（人物が別）で 10/6 17-22
const B_SETTINGS = base("B", { staffHomeShop: { "田中": "A" }, shopAbbrs: ["鶏三"], shopAbbr2: { top: "鶏", bottom: "三" },
  breakTimes: { weekday: [{ start: "19:00", end: "19:30" }], sat: [], sun: [], holSat: [], holSun: [] } });
const B_PERIODS = { b1: { id: "b1", startDate: "2026-10-01", endDate: "2026-10-15", label: "10月前半" }, b2: { id: "b2", startDate: "2026-10-16", endDate: "2026-10-31", label: "10月後半" } };
const B_SUBS = {
  x1: { id: "x1", periodId: "b1", staffName: "田中", shopId: "B", shifts: {
    "2026-10-05": w("17:00", "23:00"), "2026-10-07": w("11:00", "15:00"), "2026-10-08": w("17:00", "23:00"),
    "2026-10-09": w("11:00", "15:00"), "2026-10-13": w("12:00", "16:00") } },
  x2: { id: "x2", periodId: "b2", staffName: "田中", shopId: "B", shifts: { "2026-10-20": w("17:00", "21:00") } },
  x3: { id: "x3", periodId: "b1", staffName: "佐藤", shopId: "B", shifts: { "2026-10-06": w("17:00", "22:00") } },
};
const A_SETTINGS = base("A");
const A_PERIOD = { id: "pa", urlToken: "ta", shopId: "A", label: "10月", startDate: "2026-10-01", endDate: "2026-10-31", deadlineDate: "", createdAt: "2026-09-01T00:00:00.000Z" };
const A_SUBS = {
  a1: { id: "a1", periodId: "pa", staffName: "田中", shopId: "A", comment: "", submittedAt: "2026-09-02T00:00:00.000Z", shifts: {
    "2026-10-01": w("10:00", "15:00"), "2026-10-07": w("17:00", "23:00"), "2026-10-08": w("11:00", "15:00"),
    "2026-10-09": { status: "holiday" }, "2026-10-13": w("10:00", "15:00") } },
  a2: { id: "a2", periodId: "pa", staffName: "佐藤", shopId: "A", comment: "", submittedAt: "2026-09-02T00:00:00.000Z", shifts: { "2026-10-01": w("10:00", "15:00") } },
};
const SEED = { shops: {
  A: { staff: ["田中", "佐藤", "山田"], settings: A_SETTINGS, subs: A_SUBS, periods: { pa: A_PERIOD } },
  B: { staff: ["田中", "佐藤"], settings: B_SETTINGS, subs: B_SUBS, periods: B_PERIODS },
}, global: { shops: { A: { name: "A店" }, B: { name: "鷄えん3ビル" } } } };
const cfc = require(path.join(__dirname, "..", "..", "..", "..", "functions", "company-config.js"));
const PUB = { name: "テスト企業", shops: { A: true, B: true },
  people: { "1042": { links: { A: "田中", B: "田中" } }, "p_AAAAAAAA": { links: { A: "佐藤" } }, "p_BBBBBBBB": { links: { B: "佐藤" } } } };
const LINK = (sid) => cfc.buildShopMirror("C1", PUB, sid, { A: "A店", B: "鷄えん3ビル" }, "t");

// H2 より前の配信物（978277e）で測った、表示以外の値（労務判定・週の休み・期間別勤務時間・ヒートマップ・重複・laborTotals・列の位置）
const STABLE = require(path.join(__dirname, "example-helper-aggregate.stable.json"));

async function mount(sid, pdf) {
  const own = sid === "A" ? { P: A_PERIOD, subs: Object.values(A_SUBS), settings: A_SETTINGS, staff: ["田中", "佐藤", "山田"], periods: [A_PERIOD] }
    : { P: B_PERIODS.b1, subs: Object.values(B_SUBS), settings: B_SETTINGS, staff: ["田中", "佐藤"], periods: [B_PERIODS.b2, B_PERIODS.b1] };
  const h = await openHarness({
    root: ROOT, viewport: { width: 1400, height: 900 }, extraHead: THEME + (pdf ? PDF_LIBS : "") + makeStub({ seed: SEED, uid: "u_manager" }), waitFor: "[data-scn]",
    jsx: `
firebaseDB = firebase.database();
window.__saved=window.__saved||[];window.__subs=window.__subs||null;
const PERIODS=${JSON.stringify(own.periods)};const SUBS=${JSON.stringify(own.subs)};const SETTINGS=${JSON.stringify(own.settings)};
function Harness(){
  const [subs,setSubs]=React.useState(SUBS);
  return <ShiftEditTab subs={subs} periods={PERIODS} staffList={${JSON.stringify(own.staff)}}
    onSave={v=>setSubs(p=>{const n=typeof v==="function"?v(p):v;window.__subs=JSON.parse(JSON.stringify(n));return n;})} tt={()=>{}} initialPeriodId=${JSON.stringify(own.P.id)}
    settings={SETTINGS} plan="premium" shopId=${JSON.stringify(sid)} shopName=${JSON.stringify(sid === "A" ? "A店" : "鷄えん3ビル")} onUpgrade={()=>{}}
    allLinkedShops={[]} companyLink={${JSON.stringify(LINK(sid))}}
    savePeriods={ps=>window.__saved.push(JSON.parse(JSON.stringify(ps)))} ownerReadOnly={false} pastSubsLoaded={true}/>;
}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);`,
  });
  await sleep(1500);
  return h;
}
const cellOf = (h, n, d, f) => h.evaluate(([n, d, f]) => {
  const el = document.querySelector(`[data-sc="${d}|${f}"][data-scn="${n}"]`);
  if (!el) return null;
  const cs = getComputedStyle(el); const td = el.parentElement.getBoundingClientRect();
  return { v: el.value, ro: el.readOnly, helper: el.getAttribute("data-helper"), title: el.title, fs: parseFloat(cs.fontSize),
    bgImg: cs.backgroundImage, bgImgInline: el.style.backgroundImage || "", color: cs.color, italic: cs.fontStyle === "italic",
    fits: el.scrollWidth <= el.clientWidth + 0.5, h: el.offsetHeight, tdLeft: Math.round(td.left * 10) / 10, tdW: Math.round(td.width * 10) / 10 };
}, [n, d, f]);
const readStable = (h, pid) => h.evaluate((pid) => {
  const table = head => {
    const wrap = [...document.querySelectorAll("div")].find(d => (d.innerText || "").startsWith(head));
    if (!wrap) return null;
    const rows = {};
    [...wrap.querySelectorAll("tbody tr")].forEach(tr => { const tds = [...tr.querySelectorAll("td")].map(td => td.innerText.trim()); rows[tds[0]] = tds.slice(1); });
    return rows;
  };
  const allRows = {};
  document.querySelectorAll("tr").forEach(tr => { const tds = [...tr.querySelectorAll("td")].map(td => td.innerText.trim()); if (tds.length > 1 && tds[0] === "月計") allRows["月計"] = tds.slice(1); });
  // 入力欄を持たない表（グリッド以外）の文字。凡例は説明文を H2 で変えたので除く
  const tables = [...document.querySelectorAll("table")].filter(t => !t.querySelector("input") && !(t.innerText || "").includes("特記あり")).map(t => t.innerText.replace(/\s+/g, " ").trim());
  const dupLines = (document.body.innerText || "").split("\n").filter(l => /重複/.test(l) && !/特記あり|店舗間シフト重複$/.test(l));
  const last = (window.__saved || []).slice(-1)[0] || null;
  const p = last ? last.find(x => x && x.id === pid) : null;
  return {
    labor: table("労務判定（2026年10月）"), weekRest: table("週の休み"), monthTotal: allRows["月計"] || null,
    laborTotals: p ? (p.laborTotals || {}) : null, tables, dupLines,
  };
}, pid);
const allTanakaOf = (h, pid) => h.evaluate(pid => (window.__saved || []).map(ps => { const q = ps.find(x => x && x.id === pid); return q && q.laborTotals ? (q.laborTotals["田中"] ? q.laborTotals["田中"].workMin || 0 : "none") : "noTotals"; }), pid);
const geomOf = (h) => h.evaluate(() => {
  const td = n => { const el = document.querySelector(`[data-sc="2026-10-07|start"][data-scn="${n}"]`); if (!el) return null; const r = el.parentElement.getBoundingClientRect(); return [Math.round(r.left * 10) / 10, Math.round(r.width * 10) / 10]; };
  return { tanaka: td("田中"), sato: td("佐藤"), yamada: td("山田") };
});

(async () => {
  const v = {};
  const out = {};
  // ===== 所属店舗 A =====
  const hA = await mount("A", true);
  const days = ["2026-10-01", "2026-10-05", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-13", "2026-10-20"];
  const scr = {};
  for (const d of days) scr[d] = { s: await cellOf(hA, "田中", d, "start"), e: await cellOf(hA, "田中", d, "end") };
  out.screen = scr;
  out.sato6 = await cellOf(hA, "佐藤", "2026-10-06", "start");
  const stableA = await readStable(hA, "pa");
  out.stableA = stableA;
  out.geomNormal = await geomOf(hA);
  out.allTanaka = await allTanakaOf(hA, "pa");

  const txt = (d, f) => scr[d][f] ? scr[d][f].v : null;
  const isYel = c => !!c && /255, 243, 176/.test(c.bgImg);   // LEGEND_COLORS.note #FFF3B0
  const noHatch = c => !!c && !/svg/.test(c.bgImg);
  const plain = c => !!c && !c.italic && !/107, 114, 128/.test(c.color) && !(c.v || "").includes("→");
  v.s_own_only = txt("2026-10-01", "s") === "10" && txt("2026-10-01", "e") === "15" && !isYel(scr["2026-10-01"].s) && !isYel(scr["2026-10-01"].e) && scr["2026-10-01"].s.helper === null;
  v.s_helper_only = txt("2026-10-05", "s") === "17鶏" && txt("2026-10-05", "e") === "23三" && isYel(scr["2026-10-05"].s) && isYel(scr["2026-10-05"].e)
    && scr["2026-10-05"].s.ro === true && scr["2026-10-05"].e.ro === true && scr["2026-10-05"].s.helper === "1" && scr["2026-10-05"].e.helper === "1";
  v.s_helper_only_title = /鷄えん3ビル 17:00〜23:00（実働 5:30）/.test(scr["2026-10-05"].s.title || "");
  v.s_lunch_helper = txt("2026-10-07", "s") === "11鶏三" && txt("2026-10-07", "e") === "23" && isYel(scr["2026-10-07"].s) && !isYel(scr["2026-10-07"].e)
    && scr["2026-10-07"].s.ro === false && scr["2026-10-07"].e.helper === null;
  v.s_mixed_title = /鷄えん3ビル 11:00〜15:00（実働 4:00）／自店 17:00〜23:00/.test(scr["2026-10-07"].s.title || "");
  v.s_dinner_helper = txt("2026-10-08", "s") === "11" && txt("2026-10-08", "e") === "23鶏三" && !isYel(scr["2026-10-08"].s) && isYel(scr["2026-10-08"].e);
  v.s_holiday_noHatch = txt("2026-10-09", "s") === "11鶏" && txt("2026-10-09", "e") === "15三" && noHatch(scr["2026-10-09"].s) && noHatch(scr["2026-10-09"].e);
  v.s_overlap_hidden = txt("2026-10-13", "s") === "10" && txt("2026-10-13", "e") === "15" && scr["2026-10-13"].s.helper === null && scr["2026-10-13"].e.helper === null;
  v.s_second_half = txt("2026-10-20", "s") === "17鶏" && txt("2026-10-20", "e") === "21三";
  const helperCells = Object.values(scr).flatMap(x => [x.s, x.e]).filter(c => c && c.helper === "1");
  v.s_noArrowItalicGray = helperCells.length === 8 && helperCells.every(plain);
  v.s_fitsWithoutWidening = helperCells.every(c => c.fits);
  // 文字を縮めたセルでも入力欄の高さ（＝行の高さ）は通常のセルと同じ
  v.s_rowHeightKept = helperCells.every(c => c.h === scr["2026-10-01"].s.h);
  v.s_sameNameNotMerged = !!out.sato6 && out.sato6.v === "" && out.sato6.helper === null;

  // (b) 混在の日のフォーカス編集
  const fe = {};
  await hA.page.focus('[data-sc="2026-10-07|start"][data-scn="田中"]'); await sleep(200);
  fe.focused = await cellOf(hA, "田中", "2026-10-07", "start");
  // 変えずに離れても何も保存しない（合成表示の文字列を subs に入れない）
  await hA.page.evaluate(() => document.activeElement.blur()); await sleep(300);
  fe.subsAfterNoop = await hA.evaluate(() => window.__subs);
  fe.afterNoop = await cellOf(hA, "田中", "2026-10-07", "start");
  await hA.setInput('[data-sc="2026-10-07|start"][data-scn="田中"]', "18"); await sleep(100);
  await hA.page.evaluate(() => document.activeElement.blur()); await sleep(400);
  fe.after = await cellOf(hA, "田中", "2026-10-07", "start");
  fe.subs = await hA.evaluate(() => window.__subs);
  out.focusEdit = { focused: fe.focused, afterNoop: fe.afterNoop, after: fe.after };
  const a1 = (fe.subs || []).find(s => s.id === "a1");
  const d7 = a1 && a1.shifts["2026-10-07"];
  out.focusEdit.saved = d7;
  v.f_focusShowsOwn = !!fe.focused && fe.focused.v === "17" && fe.focused.fs === 16 && fe.focused.helper === null;
  v.f_noopBlurDoesNotSave = fe.subsAfterNoop === null || !JSON.stringify(fe.subsAfterNoop).includes("鶏");
  v.f_backToComposite = !!fe.afterNoop && fe.afterNoop.v === "11鶏三";
  v.f_savedOwnOnly = !!d7 && d7.adjustedStart === "18:00" && !d7.adjustedStartNote && !JSON.stringify(a1).includes("鶏") && d7.start === "17:00";
  v.f_compositeAfterEdit = !!fe.after && fe.after.v === "11鶏三" && fe.after.fs < 16;

  // (c)+(d) 列の位置（通常表示・全表示）と、表示以外の値が H2 前と同じ
  await hA.clickExact("全表示"); await sleep(800);
  out.geomFull = await geomOf(hA);
  out.fullCell = await cellOf(hA, "田中", "2026-10-07", "start");
  await hA.clickExact("通常表示"); await sleep(500);
  const stable = { labor: stableA.labor, weekRest: stableA.weekRest, monthTotal: stableA.monthTotal, laborTotals: stableA.laborTotals,
    tables: stableA.tables, dupLines: stableA.dupLines, geomNormal: out.geomNormal, geomFull: out.geomFull };
  if (process.env.DUMP_STABLE) { console.log(JSON.stringify(stable, null, 2)); await hA.close(); process.exit(0); }
  v.c_colWidthUnchangedNormal = JSON.stringify(out.geomNormal) === JSON.stringify(STABLE.geomNormal) && out.geomNormal.tanaka[1] === 39;
  v.c_colWidthUnchangedFull = JSON.stringify(out.geomFull) === JSON.stringify(STABLE.geomFull);
  v.c_fullViewFits = !!out.fullCell && out.fullCell.v === "11鶏三" && out.fullCell.fits;
  v.d_laborSame = JSON.stringify(stableA.labor) === JSON.stringify(STABLE.labor) && JSON.stringify(stableA.weekRest) === JSON.stringify(STABLE.weekRest)
    && JSON.stringify(stableA.monthTotal) === JSON.stringify(STABLE.monthTotal);
  v.d_laborTotalsSame = JSON.stringify(stableA.laborTotals) === JSON.stringify(STABLE.laborTotals);
  v.d_tablesSame = JSON.stringify(stableA.tables) === JSON.stringify(STABLE.tables);
  v.d_dupSame = JSON.stringify(stableA.dupLines) === JSON.stringify(STABLE.dupLines);
  v.g_noEarlyTotals = out.allTanaka.length > 0 && out.allTanaka.every(x => x === STABLE.laborTotals["田中"].workMin || x === "noTotals");

  // (e) PDF
  await hA.capturePdf();
  await hA.clickExact("PDF出力");
  await hA.clickExact("シフト");
  await sleep(6000);
  out.pdf = await hA.evaluate(() => {
    const html = (window.__pdf ? window.__pdf.blocks : []).join("");
    const d = document.createElement("div"); d.innerHTML = html;
    return [...d.querySelectorAll("[data-helper]")].map(td => ({ t: td.textContent.trim(), bg: td.style.background || td.style.backgroundColor, fs: td.style.fontSize, italic: td.style.fontStyle }));
  });
  const pdfT = out.pdf.map(x => x.t);
  v.p_texts = JSON.stringify(pdfT) === JSON.stringify(["17鶏", "23三", "11鶏三", "23鶏三", "11鶏", "15三", "17鶏", "21三"]);
  v.p_yellowNotItalic = out.pdf.length === 8 && out.pdf.every(x => /255, 255, 0|#FFFF00/i.test(x.bg) && x.italic !== "italic" && !x.t.includes("→"));
  v.p_shrunkLongOnes = out.pdf.filter(x => x.t.length >= 4).every(x => parseFloat(x.fs) < 12);
  // (e) Excel（シフト作成タブのボタン＝adjResolver あり）
  const dl = await hA.captureDownloads();
  await hA.clickExact("Excel出力"); await sleep(2000);
  out.xl = await hA.evaluate(async () => {
    const b = window.__dl && window.__dl.blobs[0];
    if (!b) return null;
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await b.arrayBuffer());
    const ws = wb.worksheets[0];
    let col = -1; ws.getRow(2).eachCell({ includeEmpty: true }, (c, i) => { if (String(c.value || "") === "田中") col = i; });
    const res = {};
    for (let r = 3; r <= ws.rowCount; r += 2) {
      const day = ws.getRow(r).getCell(1).value;
      if (typeof day !== "number") continue;
      const cl = c => ({ v: c.value == null ? "" : String(c.value), fill: c.fill && c.fill.fgColor ? c.fill.fgColor.argb : (c.fill ? c.fill.pattern : null),
        diag: !!(c.border && c.border.diagonal), shrink: !!(c.alignment && c.alignment.shrinkToFit) });
      res[day] = { s: cl(ws.getRow(r).getCell(col)), e: cl(ws.getRow(r + 1).getCell(col)) };
    }
    return { col, res };
  });
  await dl.restore();
  const X = out.xl ? out.xl.res : {};
  const xv = (d, f) => X[d] ? X[d][f].v : null;
  const xy = (d, f) => !!X[d] && X[d][f].fill === "FFFFFF00";
  v.x_own_only = xv(1, "s") === "10" && xv(1, "e") === "15" && !xy(1, "s") && !xy(1, "e");
  v.x_helper_only = xv(5, "s") === "17鶏" && xv(5, "e") === "23三" && xy(5, "s") && xy(5, "e") && X[5].s.shrink;
  v.x_lunch_helper = xv(7, "s") === "11鶏三" && xv(7, "e") === "23" && xy(7, "s") && !xy(7, "e");
  v.x_dinner_helper = xv(8, "s") === "11" && xv(8, "e") === "23鶏三" && !xy(8, "s") && xy(8, "e");
  v.x_holiday_noDiagonal = xv(9, "s") === "11鶏" && xv(9, "e") === "15三" && !X[9].s.diag && !X[9].e.diag;
  v.x_overlap_hidden = xv(13, "s") === "10" && xv(13, "e") === "15";
  v.x_noShrinkOnOwnCells = !!X[1] && !X[1].s.shrink && !X[8].s.shrink;
  out.errorsA = hA.errors.slice();
  await hA.close();

  // ===== 行き先 B =====
  const hB = await mount("B", false);
  const b = await readStable(hB, "b1");
  b.t5s = await cellOf(hB, "田中", "2026-10-05", "start");
  b.allTanaka = await allTanakaOf(hB, "b1");
  b.errors = hB.errors.slice();
  await hB.close();
  out.b = { labor: b.labor, laborTotals: b.laborTotals, t5s: b.t5s };
  const col = (rows, key, i) => rows && rows[key] ? rows[key][i] : undefined;
  v.b_verdictDest = col(b.labor, "総括", 0) === "所属店舗で判定";
  v.b_laborTotalsExcludesTanaka = !!b.laborTotals && !("田中" in b.laborTotals) && !!b.laborTotals["佐藤"];
  v.b_noHelperCells = !!b.t5s && b.t5s.helper === null && b.t5s.v === "17";
  v.b_noEarlyTotals = b.allTanaka.every(x => x === "none" || x === "noTotals");
  v.noErrors = out.errorsA.length === 0 && b.errors.length === 0;
  v.allPass = Object.values(v).every(Boolean);
  console.log(JSON.stringify({ out, verdict: v }, null, 2));
  process.exit(v.allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
