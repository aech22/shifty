// シフト作成タブのセルの紫（労務・CELL_COLOR_LEGEND の laborErr）の基準変更（2026-10-08 ユーザー指示）の実ブラウザ回帰。
//   塗る:   法定休日労働の日・月60h超の日（出勤した日）・特定技能の週の公休不足の週の出勤日・属性の週上限を超えた週の出勤日・
//           属性の1日上限を超えた日（12h超は従来どおり。ここでは対象外）
//   塗らない: 1日の残業予定が上限超（A制）・1日の残業が上限超（B制）だけの日（パネルには出る）
// app-main.js を読み込まないので Firebase へは1バイトも出ない（SKILL.md 1.6節）。
//
// 実行:   node .claude/skills/shifty-e2e-verify/scripts/example-labor-purple.js  → allPass=true / EXIT=0
//         （既定はこのスクリプトを含むリポジトリの配信物。worktree の中から回してもその worktree を測る）
// 反証:   SHIFTY_ROOT=<この変更より前の配信物> node ... → EXIT=1（落ちないなら何も検証していない）
"use strict";
const path = require("node:path");
const { openHarness } = require(path.join(__dirname, "mount-component.js"));

const ROOT = process.env.SHIFTY_ROOT || path.resolve(__dirname, "../../../..");
const EXTRA_HEAD = `<style>:root{--c-bg:#F0F2F5;--c-card:#FFFFFF;--c-input:#F3F4F6;--c-input2:#F0F2F5;`
  + `--c-border:#E5E7EB;--c-border2:#D1D5DB;--c-text:#1A1A2E;--c-text2:#374151;--c-text3:#6B7280;`
  + `--c-text4:#9CA3AF;--c-shadow:rgba(0,0,0,.06);--c-accent:#f87036;--c-danger:#DC2626;}</style>`;

// app-utils.js の CELL_COLOR_LEGEND の "laborErr" と同じ値
const LABOR_CELL_BG = "rgba(139,92,246,0.28)";

const P = { id: "p1", urlToken: "t1", shopId: "S1", label: "9月", startDate: "2026-09-01",
  endDate: "2026-09-30", deadlineDate: "", createdAt: "2026-08-20T00:00:00.000Z" };
const gd = (a, b) => { const o = []; for (let d = new Date(a + "T00:00:00"); d <= new Date(b + "T00:00:00"); d.setDate(d.getDate() + 1)) o.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`); return o; };
const dow = d => new Date(d + "T00:00:00").getDay();
const sh = (s, e) => ({ status: "work", start: s, end: e });
const shifts = (ds, s, e) => Object.fromEntries(ds.map(d => [d, sh(s, e)]));
const sub = (id, name, sf) => ({ id, periodId: "p1", staffName: name, shopId: "S1", comment: "", submittedAt: "2026-08-25T00:00:00.000Z", shifts: sf });

// 休憩は毎日 12:00〜13:00（勤務が丸ごと含む日だけ引く）
//   法定（A・社員）: 9/7〜9/13 の7日連続 8h（休みの無い週）→ 法定休日労働は週の最後の勤務日 9/13
//   残業（A・社員）: 平日だけ 10h。月の残業予定を日に配ると 1日あたり協定の1日の上限（1h）を超える＝パネルに「1日の残業予定が上限超」。紫は無し
//   六十（B・フル）: 日曜以外 12h。毎日「1日の残業が上限超」（8h＋1h 超）がパネルに出る。月の時間外が 60h を超えた 9/16 以降の出勤日だけ紫
//   技能（A・特定技能）: 9/21〜26 と 9/28〜30 に 8h。9/28 の週は9月側（28〜30）に公休が無い＝その出勤日が紫
//   週上（B・バイト・週20h）: 9/14〜17 に 6h（週24h）→ その週の出勤日4日が紫。9/21 の 6h は紫なし
//   日上（B・短時間・1日5h）: 9/8 に 6h → 紫、9/9 に 4h → 紫なし
const SEPT = gd("2026-09-01", "2026-09-30");
const SUBS = [
  sub("s1", "法定", shifts(gd("2026-09-07", "2026-09-13"), "09:00", "18:00")),
  sub("s2", "残業", shifts(SEPT.filter(d => dow(d) !== 0 && dow(d) !== 6), "09:00", "20:00")),
  sub("s3", "六十", shifts(SEPT.filter(d => dow(d) !== 0), "09:00", "22:00")),
  sub("s4", "技能", shifts([...gd("2026-09-21", "2026-09-26"), ...gd("2026-09-28", "2026-09-30")], "09:00", "18:00")),
  sub("s5", "週上", { ...shifts(gd("2026-09-14", "2026-09-17"), "09:00", "16:00"), "2026-09-21": sh("09:00", "16:00") }),
  sub("s6", "日上", { "2026-09-08": sh("09:00", "16:00"), "2026-09-09": sh("09:00", "13:00") }),
];
const BRK = [{ start: "12:00", end: "13:00" }];
const SETTINGS = { shopId: "S1", candidates: [{ start: "09:00", end: "23:00" }], weekdayCandidates: {},
  dateCandidates: {}, templates: [],
  breakTimes: { weekday: BRK, sat: BRK, sun: BRK, holSat: BRK, holSun: BRK },
  laborSettings: { agreementDailyOtMin: 60 },
  staffAttributes: { "法定": "employee", "残業": "employee", "六十": "full", "技能": "skl", "週上": "parttime", "日上": "short" },
  staffTypeLimits: { employee: { name: "社員", laborSystem: "A" }, parttime: { name: "バイト", laborSystem: "B", weekly: 20 },
    full: { name: "フル", laborSystem: "B" }, skl: { name: "特定技能", laborSystem: "A" }, short: { name: "短時間", laborSystem: "B", daily: 5 } },
  staffNumbers: { "法定": "1", "残業": "2", "六十": "3", "技能": "4", "週上": "5", "日上": "6" },
  staffColors: {}, staffAliases: {}, positions: { kitchen: [], hall: [] },
  requiredPositions: {}, staffPositions: {} };
const STAFF = ["法定", "残業", "六十", "技能", "週上", "日上"];

(async () => {
  const h = await openHarness({
    root: ROOT, extraHead: EXTRA_HEAD, waitFor: "#root > *",
    jsx: `
const P=${JSON.stringify(P)};const SUBS=${JSON.stringify(SUBS)};const SETTINGS=${JSON.stringify(SETTINGS)};
function Harness(){const [subs,setSubs]=React.useState(SUBS);
  return <ShiftEditTab subs={subs} periods={[P]} staffList={${JSON.stringify(STAFF)}}
    onSave={v=>setSubs(p=>typeof v==="function"?v(p):v)} tt={()=>{}}
    settings={SETTINGS} plan="premium" shopId="S1" shopName="テスト店" onUpgrade={()=>{}}
    onLoadPastSubs={()=>{}} pastSubsLoaded={true}
    savePeriods={()=>{}} ownerReadOnly={false}/>;}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);`,
  });
  await h.page.waitForTimeout(1500); // 後回しの計算（CALC_IDLE_MS）が済むのを待つ
  await h.page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(x => (x.textContent || "").includes("操作方法（セル入力コマンド"));
    if (b) b.click();
  });
  await h.page.waitForTimeout(300);
  const m = await h.evaluate((bg) => {
    // セル色は backgroundImage の linear-gradient レイヤーに載る（fill 方式）。backgroundColor だけを見ると偽陰性になる
    const cells = [...document.querySelectorAll("input")].filter(i => i.getAttribute("data-sc")).map(i => ({
      img: (getComputedStyle(i).backgroundImage || "").replace(/\s/g, ""), title: i.title || "",
      sc: i.getAttribute("data-sc"), n: i.getAttribute("data-scn") }));
    const panel = (() => {
      const d = [...document.querySelectorAll("div")].find(x => (x.innerText || "").startsWith("⚠ 労務の確認が必要です"));
      return d ? d.innerText : "";
    })();
    const legend = [...document.querySelectorAll("*")].find(x => x.children.length === 0 && (x.textContent || "").includes("法定休日労働の日"));
    // 週間勤務時間の表で赤（上限超過）になっているセル（週の行ラベル → 列の位置）。列の並びはグリッドと同じ staffList
    const wk = [...document.querySelectorAll("div")].find(x => (x.innerText || "").startsWith("週間勤務時間"));
    const weekRed = {};
    if (wk) [...wk.querySelectorAll("tbody tr")].forEach(tr => {
      const tds = [...tr.querySelectorAll("td")];
      const lab = (tds[0] && tds[0].innerText.trim()) || "";
      tds.slice(1).forEach((td, i) => { if (getComputedStyle(td).color.replace(/\s/g, "") === "rgb(255,71,87)") (weekRed[lab] = weekRed[lab] || []).push(i); });
    });
    return { total: cells.length, purple: cells.filter(c => c.img.includes(bg)).map(c => ({ n: c.n, sc: c.sc, title: c.title })),
      panel, legendText: legend ? legend.textContent : "", weekRed };
  }, LABOR_CELL_BG);
  const errors = h.errors.slice();
  await h.close();

  // 紫の日（名前|日付）。セル（出勤・退勤）2つずつ塗られるので日にまとめる
  const days = {};
  // data-sc は "日付|start|end の別"、data-scn は名前（example-labor-cell-color.js と同じ読み方）
  m.purple.forEach(c => { const d = String(c.sc).split("|")[0]; (days[c.n] = days[c.n] || new Set()).add(d); });
  const daysOf = n => [...(days[n] || [])].sort();
  const titlesOf = n => m.purple.filter(c => c.n === n).map(c => c.title);
  const bothCells = m.purple.length === Object.values(days).reduce((a, s) => a + s.size * 2, 0);
  const expect = {
    "法定": ["2026-09-13"],
    "残業": [],
    "六十": SEPT.filter(d => d >= "2026-09-16" && dow(d) !== 0),
    "技能": ["2026-09-28", "2026-09-29", "2026-09-30"],
    "週上": ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17"],
    "日上": ["2026-09-08"],
  };
  const eq = (a, b) => a.join(",") === b.join(",");
  const pass = {
    grid_rendered: m.total >= STAFF.length * 30 * 2,
    legal_holiday_day: eq(daysOf("法定"), expect["法定"]) && titlesOf("法定").every(t => t.includes("法定休日労働")),
    day_ot_only_not_purple: eq(daysOf("残業"), expect["残業"]) && /1日の残業予定が上限超/.test(m.panel),
    over60_days: eq(daysOf("六十"), expect["六十"]) && titlesOf("六十").every(t => t.includes("月60h超")),
    // 2026-10-10: 1日の残業が上限超（B制）は画面の欄に出さない
    b_day_ot_before_60h_not_purple: !/1日の残業が上限超/.test(m.panel) && !daysOf("六十").some(d => d < "2026-09-16"),
    skilled_short_week: eq(daysOf("技能"), expect["技能"]) && titlesOf("技能").every(t => t.includes("特定技能の週の公休不足")),
    attr_weekly_limit: eq(daysOf("週上"), expect["週上"]) && titlesOf("週上").every(t => t.includes("属性の週の上限超")),
    attr_daily_limit: eq(daysOf("日上"), expect["日上"]) && titlesOf("日上").every(t => t.includes("属性の1日の上限超")),
    // 紫の週上限と、既存の「週間勤務時間」の表の赤（上限超過）が同じ人・同じ週を指す（列4＝週上・14〜20日の行だけ）
    weekly_table_agrees: JSON.stringify(m.weekRed) === JSON.stringify({ "14〜20日": [STAFF.indexOf("週上")] }),
    both_cells_of_a_day: bothCells,
    no_other_staff_purple: Object.keys(days).every(n => n in expect),
    legend_new_criteria: /法定休日労働の日/.test(m.legendText) && /属性の勤務時間の上限/.test(m.legendText),
    no_console_errors: errors.length === 0,
  };
  const allPass = Object.values(pass).every(Boolean);
  console.log(JSON.stringify({ root: ROOT, purpleDays: Object.fromEntries(Object.keys(days).map(n => [n, daysOf(n)])),
    sampleTitles: Object.fromEntries(Object.keys(days).map(n => [n, titlesOf(n)[0]])), panel: m.panel, errors, pass, allPass }, null, 1));
  process.exit(allPass ? 0 : 1);
})();
