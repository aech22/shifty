// 従業員画面の「全員のシフト」が PDF の「シフト表」と同じ表かを、同じデータで突き合わせる（2026-10-04 ユーザー指示「全員のシフトは PDF と同じ仕様」）。
// app-main.js を読み込まないので Firebase へは1バイトも出ない（SKILL.md 1.6節）。
//   ①シフト作成タブの PDF 出力（シフト）の table と、MyAllShiftTable の table が、従業員画面だけの印（data-sheet-* と本人の列の見出しの背景）を除いて同じ HTML
//     （時刻の表記・メモ・締・休み／休暇の斜線・変更マークの緑・メモの黄色・従業員番号・名前の色・土日祝の色・未登録の提出者・空白列・昼夜の人数）
//   ②35人超（空白列に日付）でも同じ
//   ③画面の横幅に収まる（375・390・320px で横スクロール 0・表の幅＝枠の幅・比率を保って縮める）・ダーク表示でも白地に黒文字（紙と同じ）
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-my-sheet-pdf.js → allPass=true / EXIT=0
//       SHIFTY_ENGINE=webkit SHIFTY_DEVICE="iPhone 13" node ... でも通る
// 反証: SHIFTY_ROOT=<a10c1e3 の配信物> node ... → EXIT≠0（従業員画面の表が PDF と違う）
"use strict";
const path = require("node:path");
const { openHarness } = require(path.join(__dirname, "mount-component.js"));
const ROOT = process.env.SHIFTY_ROOT || undefined;
const THEME = dark => `<style>:root{--c-bg:${dark ? "#111" : "#F0F2F5"};--c-card:${dark ? "#1c1c1e" : "#FFFFFF"};--c-input:${dark ? "#2c2c2e" : "#F3F4F6"};--c-input2:#F0F2F5;` +
  `--c-border:#E5E7EB;--c-border2:#D1D5DB;--c-text:${dark ? "#f2f2f2" : "#1A1A2E"};--c-text2:#374151;--c-text3:#6B7280;` +
  `--c-text4:#9CA3AF;--c-shadow:rgba(0,0,0,.06);--c-accent:#f87036;--c-danger:#DC2626;}body{background:var(--c-bg);color:var(--c-text);margin:0}</style>`;
const PDFLIBS = `<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js" integrity="sha384-ZZ1pncU3bQe8y31yfZdMFdSpttDoPmOZg2wguVK9almUodir1PghgT0eY7Mrty8H" crossorigin="anonymous"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js" integrity="sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk" crossorigin="anonymous"></script>`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const P = { id: "p1", urlToken: "t1", shopId: "S1", label: "2026年10月前半", startDate: "2026-10-10", endDate: "2026-10-14", deadlineDate: "", createdAt: "2026-09-01T00:00:00.000Z",
  published: { at: "2026-10-09T09:00:00.000Z", byUid: "O" } };
const w = (s, e, x = {}) => ({ status: "work", start: s, end: e, ...x });
const sub = (id, name, shifts) => ({ id, periodId: "p1", staffName: name, shopId: "S1", comment: "", submittedAt: "2026-09-02T00:00:00.000Z", shifts });
function dataset(big) {
  const SUBS = [
    sub("a", "田中", { "2026-10-10": w("10:00", "15:00", { changed: true }), "2026-10-11": w("17:30", "23:00", { startNote: "h" }), "2026-10-12": { status: "holiday" } }),
    sub("b", "佐藤", { "2026-10-10": w("11:00", "22:00", { adjustedStart: "11:15", adjustedEndNote: "研修" }), "2026-10-13": w("09:00", "", {}) }),
    sub("c", "高橋", { "2026-10-10": w("11:00", "22:00", { startNote: "x" }), "2026-10-11": w("18:00", "23:00", { adminRest: { start: true, end: true }, leaveTypes: { start: "paid", end: "paid" } }) }),
    sub("d", "鈴木", { "2026-10-10": w("18:00", "23:00", { adjustedEndFixed: true, extraStart: "23:00", extraEnd: "25:00" }), "2026-10-12": w("12:00", "17:20", { changed: true }), "2026-10-14": w("", "22:00") }),
    sub("e", "渡辺", { "2026-10-11": w("10:00", "12:00", { adminRest: { end: true } }) }),
    sub("f", "未登録の人", { "2026-10-12": w("10:00", "14:00") }),
  ];
  const STAFF = ["田中", "佐藤", "高橋", "", "鈴木", "渡辺"];
  if (big) for (let i = 0; i < 34; i++) STAFF.push("追加" + i);
  const SETTINGS = { shopId: "S1", candidates: [{ start: "10:00", end: "15:00" }, { start: "17:00", end: "23:00" }], weekdayCandidates: {},
    dateCandidates: { "2026-10-14": [{ closed: true }] }, dateCandidatePosTypes: { "2026-10-13": "sun" }, breakTimes: { weekday: [{ start: "12:00", end: "13:00" }], sat: [], sun: [], holSat: [], holSun: [] },
    headcountAt: { enabled: true, lunch: "12:00", dinner: "19:00" }, staffNumbers: { "田中": "001", "佐藤": "12" }, staffColors: { "佐藤": "red" },
    staffAttributes: {}, staffTypeLimits: {}, staffAliases: {}, positions: { kitchen: [], hall: [] }, requiredPositions: {}, staffPositions: {},
    overtimeSettings: { byStaff: { "鈴木": { lunch: 0, dinner: 30 } } } };
  return { SUBS, STAFF, SETTINGS };
}
async function compare(big) {
  const { SUBS, STAFF, SETTINGS } = dataset(big);
  const h = await openHarness({ root: ROOT, extraHead: THEME(false) + PDFLIBS, waitFor: "[data-scn]", jsx: `
const P=${JSON.stringify(P)};const SUBS=${JSON.stringify(SUBS)};const SETTINGS=${JSON.stringify(SETTINGS)};const STAFF=${JSON.stringify(STAFF)};
function Harness(){const [subs,setSubs]=React.useState(SUBS);
  return <div><div id="mine" style={{width:340}}><MyAllShiftTable period={P} staff={STAFF} settings={SETTINGS} subs={subs} plan="premium" me="佐藤" shopId="S1" shopName="鷄えん東通り店"/></div>
    <ShiftEditTab subs={subs} periods={[P]} staffList={STAFF} onSave={v=>setSubs(p=>typeof v==="function"?v(p):v)} tt={()=>{}}
    settings={SETTINGS} plan="premium" shopId="S1" shopName="鷄えん東通り店" onUpgrade={()=>{}} allLinkedShops={[]}
    onLoadPastSubs={()=>{}} pastSubsLoaded={true} savePeriods={()=>{}} ownerReadOnly={false}/></div>;}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);` });
  await sleep(900);
  await h.capturePdf();
  await h.clickExact("PDF出力");
  await h.clickExact("シフト");
  await sleep(7000);
  const r = await h.evaluate(() => {
    // 従業員画面だけの印（data-sheet-* と本人の列の見出しの背景）を外して、PDF の table と同じ形にする
    const norm = t => { const c = t.cloneNode(true); c.querySelectorAll("*").forEach(e => { [...e.attributes].forEach(a => { if (a.name.startsWith("data-sheet-")) e.removeAttribute(a.name); });
      if (e.getAttribute("style")) e.setAttribute("style", e.getAttribute("style").replace("background:#FFE3D3;", "")); }); return c.outerHTML; };
    // 採取した PDF のブロック（自分で生成した HTML）を DOMParser で読む
    const d = new DOMParser().parseFromString("<div>" + (window.__pdf ? window.__pdf.blocks : []).join("") + "</div>", "text/html");
    const pdfT = d.querySelector("table");
    const myT = document.querySelector("#mine [data-my-sheet] table");
    const pdf = pdfT ? pdfT.outerHTML : "", mine = myT ? norm(myT) : "";
    let at = 0; while (at < pdf.length && pdf[at] === mine[at]) at++;
    return { pdfLen: pdf.length, myLen: mine.length, same: !!pdf && pdf === mine, at, pdfAt: pdf.slice(Math.max(0, at - 60), at + 80), myAt: mine.slice(Math.max(0, at - 60), at + 80),
      me: myT ? (myT.querySelector("[data-sheet-me]") || { getAttribute: () => null }).getAttribute("data-sheet-col") : null,
      headcounts: myT ? myT.querySelectorAll("[data-headcount]").length : 0 };
  });
  r.errors = h.errors.slice();
  await h.close();
  return r;
}
async function fit(width, dark) {
  const { SUBS, STAFF, SETTINGS } = dataset(false);
  const extra = Array.from({ length: 24 }, (_, i) => "人" + i);
  const h = await openHarness({ root: ROOT, extraHead: THEME(dark), viewport: { width, height: 800 }, waitFor: "[data-my-sheet] table", jsx: `
const P=${JSON.stringify(P)};const SUBS=${JSON.stringify(SUBS)};const SETTINGS=${JSON.stringify(SETTINGS)};const STAFF=${JSON.stringify([...STAFF, ...extra])};
ReactDOM.createRoot(document.getElementById("root")).render(<div style={{padding:"0 16px"}}><MyAllShiftTable period={P} staff={STAFF} settings={SETTINGS} subs={SUBS} plan="premium" me="田中" shopId="S1" shopName="駅前店"/></div>);` });
  await sleep(700);
  const r = await h.evaluate(() => {
    const s = document.querySelector("[data-my-sheet]"), fr = document.querySelector("[data-my-sheet-frame]"), box = document.querySelector("[data-my-all]");
    const a = s.getBoundingClientRect(), b = fr.getBoundingClientRect(), c = box.getBoundingClientRect();
    const cs = getComputedStyle(s);
    return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, sheetW: Math.round(a.width), frameW: Math.round(b.width), boxW: Math.round(c.width),
      sheetH: Math.round(a.height), frameH: Math.round(b.height), scale: parseFloat(s.getAttribute("data-my-sheet-scale")), natW: s.offsetWidth,
      bg: cs.backgroundColor, color: cs.color, inputs: document.querySelectorAll("[data-my-all] input").length };
  });
  r.errors = h.errors.slice();
  await h.close();
  return r;
}
(async () => {
  const R = {}, V = {};
  R.small = await compare(false);
  R.big = await compare(true);
  V.samePdf = R.small.same && R.small.errors.length === 0 && R.small.headcounts > 0 && R.small.me === "佐藤";
  V.samePdf35 = R.big.same && R.big.errors.length === 0;
  for (const [wd, dark] of [[375, false], [390, true], [320, false]]) {
    const F = await fit(wd, dark);
    R["fit" + wd] = F;
    V["fit" + wd] = F.overflow <= 0 && Math.abs(F.sheetW - F.boxW) <= 1 && Math.abs(F.frameH - F.sheetH) <= 1 && F.scale < 1 && Math.abs(F.natW * F.scale - F.sheetW) <= 1 && F.inputs === 0 && F.errors.length === 0;
    V["paper" + wd] = F.bg === "rgb(255, 255, 255)" && F.color === "rgb(0, 0, 0)";
  }
  const allPass = Object.values(V).every(Boolean);
  console.log(JSON.stringify({ R, V, allPass }, null, 1));
  process.exit(allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
