// 2026-09-26 のユーザー指示4件の実ブラウザ回帰テスト。
//   ① 労務の要修正に当たる日のセルを色で示す（該当しない日は塗らない）
//   ② 労務の確認パネルを労務判定表の下に置く
//   ③ シフト表の空欄は公休として数える（全日が空欄の週も 休7）
//   ④ 労働時間制の選択肢に雇用形態の括弧を出す
// app-main.js を読み込まないので Firebase へは1バイトも出ない（SKILL.md 1.6節）。
//
// 実行:   node .claude/skills/shifty-e2e-verify/scripts/example-labor-cell-color.js  → allPass=true / EXIT=0
// 反証:   SHIFTY_ROOT=<この変更より前の配信物> node ... → EXIT=1（落ちないなら何も検証していない）
"use strict";
const path = require("node:path");
const { openHarness } = require(path.join(__dirname, "mount-component.js"));

const ROOT = process.env.SHIFTY_ROOT || undefined;
const EXTRA_HEAD = `<style>:root{--c-bg:#F0F2F5;--c-card:#FFFFFF;--c-input:#F3F4F6;--c-input2:#F0F2F5;`
  + `--c-border:#E5E7EB;--c-border2:#D1D5DB;--c-text:#1A1A2E;--c-text2:#374151;--c-text3:#6B7280;`
  + `--c-text4:#9CA3AF;--c-shadow:rgba(0,0,0,.06);--c-accent:#f87036;--c-danger:#DC2626;}</style>`;

// 労務の要修正のセル色。app-utils.js の CELL_COLOR_LEGEND の "laborErr" と同じ値にすること。
const LABOR_CELL_BG = "rgba(139,92,246,0.28)";

const P = { id: "p1", urlToken: "t1", shopId: "S1", label: "9月後半", startDate: "2026-09-16",
  endDate: "2026-09-30", deadlineDate: "", createdAt: "2026-09-01T00:00:00.000Z" };
// 田中: 12h超の日・正常な日・4h未満の日。鈴木: まるごと空欄（＝全日が公休になるはず）
const SUBS = [{ id: "s1", periodId: "p1", staffName: "田中", shopId: "S1", comment: "",
  submittedAt: "2026-09-02T00:00:00.000Z",
  shifts: { "2026-09-16": { status: "work", start: "09:00", end: "22:30" },
            "2026-09-17": { status: "work", start: "09:00", end: "18:00" },
            "2026-09-18": { status: "work", start: "10:00", end: "12:00" } } }];
const SETTINGS = { shopId: "S1", candidates: [{ start: "09:00", end: "23:00" }], weekdayCandidates: {},
  dateCandidates: {}, templates: [],
  // 休憩を入れておかないと 9:00-18:00 まで「休憩不足」に当たり、正常な日の対照が取れない
  breakTimes: { weekday: [{ start: "12:00", end: "13:00" }], sat: [{ start: "12:00", end: "13:00" }],
    sun: [], holSat: [], holSun: [] },
  staffAttributes: { "田中": "employee", "鈴木": "employee" },
  staffTypeLimits: { employee: { name: "社員", laborSystem: "A" }, parttime: { name: "バイト", laborSystem: "B" } },
  staffColors: {}, staffAliases: {}, positions: { kitchen: [], hall: [] },
  requiredPositions: {}, staffPositions: {} };

async function shiftEditTab() {
  const h = await openHarness({
    root: ROOT, extraHead: EXTRA_HEAD, waitFor: "#root > *",
    jsx: `
const P=${JSON.stringify(P)};const SUBS=${JSON.stringify(SUBS)};const SETTINGS=${JSON.stringify(SETTINGS)};
function Harness(){const [subs,setSubs]=React.useState(SUBS);
  return <ShiftEditTab subs={subs} periods={[P]} staffList={["田中","鈴木"]}
    onSave={v=>setSubs(p=>typeof v==="function"?v(p):v)} tt={()=>{}}
    settings={SETTINGS} plan="premium" shopId="S1" shopName="テスト店" onUpgrade={()=>{}}
    onLoadPastSubs={()=>{}} pastSubsLoaded={true}
    savePeriods={()=>{}} ownerReadOnly={false}/>;}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);`,
  });
  await h.page.waitForTimeout(600);
  // 操作方法レジェンドは既定で閉じているので開いてから読む
  await h.page.evaluate(() => {
    const b = [...document.querySelectorAll("button")]
      .find(x => (x.textContent || "").includes("操作方法（セル入力コマンド"));
    if (b) b.click();
  });
  await h.page.waitForTimeout(300);
  const m = await h.evaluate((bg) => {
    // セル色は backgroundImage の linear-gradient レイヤーに載る（fill 方式）。
    // backgroundColor だけを見ると不透明ベースしか返らず**必ず偽陰性**になる。
    const cells = [...document.querySelectorAll("input")].map(i => ({
      img: (getComputedStyle(i).backgroundImage || "").replace(/\s/g, ""),
      title: i.title || "",
      sc: i.getAttribute("data-sc"), n: i.getAttribute("data-scn") }));
    const purple = cells.filter(c => c.img.includes(bg));
    const order = [];
    const walk = n => {
      const t = n.innerText || "";
      if (n.tagName === "DIV") {
        if (t.startsWith("⚠ 労務の確認が必要です")) order.push("労務の確認");
        if (t.startsWith("労務判定（")) order.push("労務判定表");
      }
      [...n.children].forEach(walk);
    };
    walk(document.body);
    const seen = []; order.forEach(x => { if (seen[seen.length - 1] !== x) seen.push(x); });
    const tblOf = p => {
      const d = [...document.querySelectorAll("div")].find(x => (x.innerText || "").startsWith(p));
      return d ? [...d.querySelectorAll("tbody tr")].map(tr => [...tr.querySelectorAll("td")].map(td => td.innerText.trim())) : [];
    };
    return { purple: purple.map(c => ({ n: c.n, sc: c.sc, title: c.title })),
      order: seen, laborRows: tblOf("労務判定（"), weekRows: tblOf("週の休み（"),
      legendHasLabor: document.body.innerText.includes("労務の要修正") };
  }, LABOR_CELL_BG);
  const errors = h.errors.slice();
  await h.close();
  return { ...m, errors };
}

// ④ 労働時間制の選択肢の文言
async function setTab() {
  const h = await openHarness({
    root: ROOT, extraHead: EXTRA_HEAD, waitFor: "#root > *",
    jsx: `
function Harness(){
  const [settings,setSettings]=React.useState({shopId:"s1",candidates:[],
    staffAttributes:{},staffTypeLimits:{employee:{name:"社員"},parttime:{name:"バイト"}}});
  return <SetTab settings={settings} onSave={s=>setSettings(s)} subs={[]} saveSubs={()=>{}}
    tt={()=>{}} syncStatus="online" plan="premium" shopId="s1"/>;
}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);`,
  });
  const opts = await h.evaluate(() => {
    const s = [...document.querySelectorAll("select")].find(x => [...x.options].some(o => o.value === "none"));
    return s ? [...s.options].map(o => o.text) : [];
  });
  const errors = h.errors.slice();
  await h.close();
  return { opts, errors };
}

(async () => {
  const se = await shiftEditTab();
  const st = await setTab();
  const key = c => `${c.n}|${c.sc}`;
  const painted = se.purple.map(key).sort();
  const rowOf = (rows, label) => (rows.find(r => r[0] === label) || []).slice(1);
  const pass = {
    // ① 該当日だけが塗られる（12h超の 9/16 と 4h未満の 9/18 の両セル。正常な 9/17 は塗らない）
    labor_cell_painted: painted.join(",") === [
      "田中|2026-09-16|start", "田中|2026-09-16|end",
      "田中|2026-09-18|start", "田中|2026-09-18|end"].sort().join(","),
    labor_cell_title: se.purple.every(c => c.title.startsWith("労務の要修正: "))
      && se.purple.some(c => c.title.includes("12h超"))
      && se.purple.some(c => c.title.includes("4h未満")),
    labor_cell_in_legend: se.legendHasLabor === true,
    // ② 労務判定表 → 労務の確認 の順
    panel_below_table: se.order.join(">") === "労務判定表>労務の確認",
    // ③ 空欄は公休。期間は 9/16〜9/30 の15日。田中は出勤3日なので公12、鈴木はまるごと空欄で公15
    blank_counts_public: rowOf(se.laborRows, "休暇").join(",") === "有0/公12/慶0,有0/公15/慶0",
    blank_week_is_rest7: (rowOf(se.weekRows, "21〜27日") || []).join(",") === "休7,休7",
    // ④ 括弧つきの文言
    system_labels: st.opts.join(" / ") ===
      "1か月単位の変形労働時間制（正社員・契約社員・特定技能） / 通常の労働時間制（パート・アルバイト） / 判定対象外（応援・外部）",
    no_console_errors: se.errors.length === 0 && st.errors.length === 0,
  };
  const allPass = Object.values(pass).every(Boolean);
  console.log(JSON.stringify({ shiftEditTab: se, setTab: st, pass, allPass }, null, 1));
  process.exit(allPass ? 0 : 1);
})();
