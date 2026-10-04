// 従業員画面の「全員のシフト」が PDF の「シフト表」と同じ表かを、同じデータで突き合わせる（2026-10-04 ユーザー指示「全員のシフトは PDF と同じ仕様」）。
// app-main.js を読み込まないので Firebase へは1バイトも出ない（SKILL.md 1.6節）。
//   ①シフト作成タブの PDF 出力（シフト）の table と、MyAllShiftTable の table が、従業員画面だけの印（data-sheet-* と本人の列の見出しの背景）を除いて同じ HTML
//     （時刻の表記・メモ・締・休み／休暇の斜線・変更マークの緑・メモの黄色・従業員番号・名前の色・土日祝の色・未登録の提出者・空白列・昼夜の人数）
//   ②35人超（空白列に日付）でも同じ
//   休暇（2026-10-04 D）: 種別の入った休暇は PDF・全員の表とも種別名（斜線なし）、種別の無い休み希望と提出の休みは斜線のまま
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
      headcounts: myT ? myT.querySelectorAll("[data-headcount]").length : 0,
      // 休暇（D・2026-10-04）: 高橋の 10/11 は終日の有給＝上下とも「有給」で斜線なし。渡辺の 10/11 の下は種別なしの休み希望＝斜線のまま
      leaveCells: myT ? [...myT.querySelectorAll("td[data-sheet-cell='leave']")].map(td => { const tr = td.closest("tr"); return tr.getAttribute("data-sheet-row") + "|" + tr.getAttribute("data-sheet-field") + "=" + td.textContent + (/svg/.test(td.getAttribute("style") || "") ? "＼" : ""); }) : [],
      pdfLeave: pdfT ? (pdfT.innerHTML.match(/>有給</g) || []).length : 0,
      hatches: myT ? myT.querySelectorAll("td[data-sheet-cell='hatch']").length : 0 };
  });
  r.errors = h.errors.slice();
  await h.close();
  return r;
}
// ---- 他店でのヘルプ勤務（H2）も PDF と同じに出る（2026-10-04 ユーザー指示）----
// 所属店舗 A の田中が行き先 B（略称 1セル用「鶏三」・2セル用 上「鶏」下「三」）でも働く。同一人物は写しの people（personId 1042）。
//   10/10 自店 10-15（変更マーク）＋ B 17-22 → 下のセルが「22鶏三」（黄）
//   10/12 自店はスタッフ提出の休み＋ B 11-15 → 「11鶏」「15三」（黄・斜線なし）
//   10/13 自店なし＋ B 17-23 → 「17鶏」「23三」
// B の期間は b0（9月・表示中の期間にかからない）・b1（10/1〜15）・b2（10/16〜）。読むのは b1 の subs だけ（期間ごとの部分読み）
const cfc = require(path.join(__dirname, "..", "..", "..", "..", "functions", "company-config.js"));
const { makeStub } = require(path.join(__dirname, "stub-firebase.js"));
function helperData() {
  const { SUBS, STAFF, SETTINGS } = dataset(false);
  const PA = { ...P, shopId: "A" };
  const SA = { ...SETTINGS, shopId: "A" };
  const B_SETTINGS = { ...SETTINGS, shopId: "B", headcountAt: undefined, staffNumbers: {}, staffColors: {}, overtimeSettings: { byStaff: {} },
    staffHomeShop: { "田中": "A" }, shopAbbrs: ["鶏三"], shopAbbr2: { top: "鶏", bottom: "三" } };
  const B_PERIODS = { b0: { id: "b0", startDate: "2026-09-01", endDate: "2026-09-15", label: "9月前半" },
    b1: { id: "b1", startDate: "2026-10-01", endDate: "2026-10-15", label: "10月前半" }, b2: { id: "b2", startDate: "2026-10-16", endDate: "2026-10-31", label: "10月後半" } };
  const B_SUBS = {
    x0: { id: "x0", periodId: "b0", staffName: "田中", shopId: "B", shifts: { "2026-09-02": w("17:00", "23:00") } },
    x1: { id: "x1", periodId: "b1", staffName: "田中", shopId: "B", shifts: { "2026-10-10": w("17:00", "22:00"), "2026-10-12": w("11:00", "15:00"), "2026-10-13": w("17:00", "23:00") } },
    x2: { id: "x2", periodId: "b2", staffName: "田中", shopId: "B", shifts: { "2026-10-20": w("17:00", "21:00") } },
  };
  const PUB = { name: "テスト企業", shops: { A: true, B: true }, people: { "1042": { links: { A: "田中", B: "田中" } } } };
  const LINK = sid => cfc.buildShopMirror("C1", PUB, sid, { A: "駅前店", B: "鷄えん3ビル" }, "t");
  const SEED = { shops: {
    A: { staff: STAFF, settings: SA, subs: Object.fromEntries(SUBS.map(s => [s.id, s])), periods: { p1: PA }, company: LINK("A") },
    B: { staff: ["田中", "佐藤"], settings: B_SETTINGS, subs: B_SUBS, periods: B_PERIODS, company: LINK("B") },
  }, global: { shops: { A: { name: "駅前店" }, B: { name: "鷄えん3ビル" } } } };
  return { SUBS, STAFF, SA, PA, SEED, LINK };
}
// 期間ごとの部分読みを記録する（orderByChild("periodId").equalTo(pid)）。once() のパスは stub が __reads に残す
const QUERY_LOG = `firebaseDB=firebase.database();window.__q=[];{const _r=firebaseDB.ref.bind(firebaseDB);firebaseDB.ref=p=>{const r=_r(p);const oc=r.orderByChild;
r.orderByChild=k=>{const r2=oc(k);const eq=r2.equalTo;r2.equalTo=v=>{window.__q.push(p+"?"+k+"="+v);return eq(v);};return r2;};return r;};}`;
async function compareHelper() {
  const { SUBS, STAFF, SA, PA, SEED, LINK } = helperData();
  const h = await openHarness({ root: ROOT, extraHead: THEME(false) + PDFLIBS + makeStub({ seed: SEED, uid: "u_staff" }), waitFor: "[data-my-all-helpers='ok']", jsx: `
firebaseDB=firebase.database();
const P=${JSON.stringify(PA)};const SUBS=${JSON.stringify(SUBS)};const SETTINGS=${JSON.stringify(SA)};const STAFF=${JSON.stringify(STAFF)};
function Harness(){const [subs,setSubs]=React.useState(SUBS);
  return <div><div id="mine" style={{width:340}}><MyAllShiftTable period={P} staff={STAFF} settings={SETTINGS} subs={subs} plan="premium" me="田中" shopId="A" shopName="駅前店"/></div>
    <ShiftEditTab subs={subs} periods={[P]} staffList={STAFF} onSave={v=>setSubs(p=>typeof v==="function"?v(p):v)} tt={()=>{}}
    settings={SETTINGS} plan="premium" shopId="A" shopName="駅前店" onUpgrade={()=>{}} allLinkedShops={[]} companyLink={${JSON.stringify(LINK("A"))}}
    onLoadPastSubs={()=>{}} pastSubsLoaded={true} savePeriods={()=>{}} ownerReadOnly={false}/></div>;}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);` });
  await sleep(1500);
  await h.capturePdf();
  await h.clickExact("PDF出力");
  await h.clickExact("シフト");
  await sleep(7000);
  const r = await h.evaluate(() => {
    const norm = t => { const c = t.cloneNode(true); c.querySelectorAll("*").forEach(e => { [...e.attributes].forEach(a => { if (a.name.startsWith("data-sheet-")) e.removeAttribute(a.name); });
      if (e.getAttribute("style")) e.setAttribute("style", e.getAttribute("style").replace("background:#FFE3D3;", "")); }); return c.outerHTML; };
    const d = new DOMParser().parseFromString("<div>" + (window.__pdf ? window.__pdf.blocks : []).join("") + "</div>", "text/html");
    const pdfT = d.querySelector("table");
    const myT = document.querySelector("#mine [data-my-sheet] table");
    const pdf = pdfT ? pdfT.outerHTML : "", mine = myT ? norm(myT) : "";
    let at = 0; while (at < pdf.length && pdf[at] === mine[at]) at++;
    // ヘルプのセル（data-helper・黄色。変更マークのある日は緑が勝つ）を「日付|上下=文字」で集める。ヘルプ先で働くのは田中だけ
    const cells = myT ? [...myT.querySelectorAll("td[data-helper='1']")].map(td => { const tr = td.closest("tr");
      const bg = /#FFFF00/i.test(td.getAttribute("style") || "") ? "Y" : /#B7EBC6/i.test(td.getAttribute("style") || "") ? "G" : "?";
      return tr.getAttribute("data-sheet-row") + "|" + tr.getAttribute("data-sheet-field") + "=" + td.textContent.trim() + ":" + bg; }) : [];
    return { same: !!pdf && pdf === mine, at, pdfAt: pdf.slice(Math.max(0, at - 60), at + 80), myAt: mine.slice(Math.max(0, at - 60), at + 80),
      yellowTanaka: cells, pdfHas17: pdf.includes("17鶏"), state: document.querySelector("[data-my-all]").getAttribute("data-my-all-helpers") };
  });
  r.errors = h.errors.slice();
  await h.close();
  return r;
}
// 読む範囲: 表示中の期間（10/10〜14）にかかる B の期間（b1）の subs だけ。B の subs を丸ごと読まない・b0・b2 を読まない。
// 企業に連携していない店舗（写しなし）では他店を何も読まない
async function helperReads(linked) {
  const { SUBS, STAFF, SA, PA, SEED } = helperData();
  if (!linked) delete SEED.shops.A.company;
  const h = await openHarness({ root: ROOT, extraHead: THEME(false) + makeStub({ seed: SEED, uid: "u_staff" }), waitFor: linked ? "[data-my-all-helpers='ok']" : "[data-my-all-helpers='none']", jsx: `
${QUERY_LOG}
const P=${JSON.stringify(PA)};const SUBS=${JSON.stringify(SUBS)};const SETTINGS=${JSON.stringify(SA)};const STAFF=${JSON.stringify(STAFF)};
ReactDOM.createRoot(document.getElementById("root")).render(<div style={{padding:"0 16px"}}><MyAllShiftTable period={P} staff={STAFF} settings={SETTINGS} subs={SUBS} plan="premium" me="田中" shopId="A" shopName="駅前店"/></div>);` });
  await sleep(500);
  const r = await h.evaluate(() => ({ reads: (window.__reads || []).slice(), q: (window.__q || []).slice(), writes: Object.keys(window.__dbDump ? {} : {}),
    text: (document.querySelector("[data-my-sheet]") || {}).textContent || "" }));
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
  V.leaveShown = R.small.leaveCells.join(",") === "2026-10-11|start=有給,2026-10-11|end=有給" && R.small.pdfLeave === 2 && R.small.hatches > 0;
  R.helper = await compareHelper();
  V.helperSamePdf = R.helper.same && R.helper.errors.length === 0 && R.helper.pdfHas17 && R.helper.state === "ok";
  const yt = R.helper.yellowTanaka.join(",");
  // 10/10 は田中に変更マークがあるので緑（黄より優先・PDF と同じ）。他は黄
  V.helperCells = ["2026-10-10|end=22鶏三:G", "2026-10-12|start=11鶏:Y", "2026-10-12|end=15三:Y", "2026-10-13|start=17鶏:Y", "2026-10-13|end=23三:Y"].every(s => yt.includes(s)) && R.helper.yellowTanaka.length === 5;
  R.reads = await helperReads(true);
  const bSubs = R.reads.reads.filter(p => p === "shops/B/subs");
  V.helperReadScope = R.reads.q.filter(s => s.startsWith("shops/B/subs")).join(",") === "shops/B/subs?periodId=b1" && bSubs.length === 1 && R.reads.errors.length === 0;
  R.readsUnlinked = await helperReads(false);
  V.helperNoReadUnlinked = !R.readsUnlinked.reads.some(p => p.startsWith("shops/B")) && R.readsUnlinked.errors.length === 0;
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
