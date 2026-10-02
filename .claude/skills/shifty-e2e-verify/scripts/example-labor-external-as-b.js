// 2026-10-03 のユーザー指示2件の実ブラウザ回帰テスト。
//   ① 労働時間制「応援・外部」（保存値 none）の人を判定対象外にせず、通常の労働時間制（B）と同じ判定にする。
//      同じ勤務を入れた parttime の人と、労務判定表の列・労務の確認パネルの行が一致する（従業員番号の未設定だけは出さない）。
//      設定タブの選択肢は「応援・外部」で、「判定対象外」の文言は無い。
//   ② シフト作成タブの「外部の長時間」（P3.5c）を削除した。設定タブのトグル（[data-external-over]）と
//      操作方法レジェンドの「外部の長時間」が無く、保存済みの highlightExternalOver8h:1 があってもセルは塗られない。
// app-main.js を読み込まないので Firebase へは1バイトも出ない（SKILL.md 1.6節）。
//
// 実行:   node .claude/skills/shifty-e2e-verify/scripts/example-labor-external-as-b.js  → allPass=true / EXIT=0
// 反証:   SHIFTY_ROOT=<この変更より前の配信物> node ... → EXIT=1（落ちないなら何も検証していない）
"use strict";
const path = require("node:path");
const { openHarness } = require(path.join(__dirname, "mount-component.js"));

const ROOT = process.env.SHIFTY_ROOT || undefined;
const EXTRA_HEAD = `<style>:root{--c-bg:#F0F2F5;--c-card:#FFFFFF;--c-input:#F3F4F6;--c-input2:#F0F2F5;`
  + `--c-border:#E5E7EB;--c-border2:#D1D5DB;--c-text:#1A1A2E;--c-text2:#374151;--c-text3:#6B7280;`
  + `--c-text4:#9CA3AF;--c-shadow:rgba(0,0,0,.06);--c-accent:#f87036;--c-danger:#DC2626;}</style>`;

const P = { id: "p1", urlToken: "t1", shopId: "S1", label: "9月後半", startDate: "2026-09-16",
  endDate: "2026-09-30", deadlineDate: "", createdAt: "2026-09-01T00:00:00.000Z" };
// 外部さん（属性 custom_ext＝laborSystem:"none"）とバイト（parttime）に同じ勤務を入れる。
//   9/16 は 09:00-23:00（14h＝8h超・1日の残業が上限超・休憩不足）、9/17〜9/20 は 09:00-19:00（10h）。
//   日の時間外・深夜（割増の確認）も同じ形で出る。
const SH = { "2026-09-16": { status: "work", start: "09:00", end: "23:00" },
  "2026-09-17": { status: "work", start: "09:00", end: "19:00" },
  "2026-09-18": { status: "work", start: "09:00", end: "19:00" },
  "2026-09-19": { status: "work", start: "09:00", end: "19:00" },
  "2026-09-20": { status: "work", start: "09:00", end: "19:00" } };
const mk = (id, name) => ({ id, periodId: "p1", staffName: name, shopId: "S1", comment: "",
  submittedAt: "2026-09-02T00:00:00.000Z", shifts: JSON.parse(JSON.stringify(SH)) });
const SUBS = [mk("s1", "外部さん"), mk("s2", "バイト")];
const SETTINGS = { shopId: "S1", candidates: [{ start: "09:00", end: "23:00" }], weekdayCandidates: {},
  dateCandidates: {}, templates: [],
  breakTimes: { weekday: [{ start: "12:00", end: "13:00" }], sat: [], sun: [], holSat: [], holSun: [] },
  staffAttributes: { "外部さん": "custom_ext", "バイト": "parttime" },
  staffTypeLimits: { parttime: { name: "バイト" }, custom_ext: { name: "応援", laborSystem: "none" } },
  // バイトは番号を持ち、外部さんは持たない（応援・外部には「従業員番号が未設定」を出さない）
  staffNumbers: { "バイト": "12" },
  // 本番の店舗に残っている削除済みの設定（読み手が黙って捨てること・セルが塗られないこと）
  laborSettings: { highlightExternalOver8h: 1, externalOverThresholdMin: 480 },
  staffColors: {}, staffAliases: {}, positions: { kitchen: [], hall: [] },
  requiredPositions: {}, staffPositions: {} };
const OLD_EXT_BG = "rgba(185,28,28,0.45)"; // 削除前の「外部の長時間」の色

async function shiftEditTab() {
  const h = await openHarness({
    root: ROOT, extraHead: EXTRA_HEAD, waitFor: "#root > *",
    jsx: `
const P=${JSON.stringify(P)};const SUBS=${JSON.stringify(SUBS)};const SETTINGS=${JSON.stringify(SETTINGS)};
function Harness(){const [subs,setSubs]=React.useState(SUBS);
  return <ShiftEditTab subs={subs} periods={[P]} staffList={["外部さん","バイト"]}
    onSave={v=>setSubs(p=>typeof v==="function"?v(p):v)} tt={()=>{}}
    settings={SETTINGS} plan="premium" shopId="S1" shopName="テスト店" onUpgrade={()=>{}}
    onLoadPastSubs={()=>{}} pastSubsLoaded={true}
    savePeriods={()=>{}} ownerReadOnly={false}/>;}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);`,
  });
  await h.page.waitForTimeout(600);
  await h.page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(x => (x.textContent || "").includes("操作方法（セル入力コマンド"));
    if (b) b.click();
  });
  await h.page.waitForTimeout(300);
  const m = await h.evaluate((oldBg) => {
    const tbl = p => {
      const d = [...document.querySelectorAll("div")].find(x => (x.innerText || "").startsWith(p));
      return d ? [...d.querySelectorAll("tbody tr")].map(tr => [...tr.querySelectorAll("td")].map(td => td.innerText.trim())) : [];
    };
    const panel = (() => {
      const d = [...document.querySelectorAll("div")].find(x => (x.innerText || "").startsWith("⚠ 労務の確認が必要です"));
      return d ? d.innerText : "";
    })();
    const imgs = [...document.querySelectorAll("input")].map(i => (getComputedStyle(i).backgroundImage || "").replace(/\s/g, ""));
    const oldColor = oldBg.replace(/\s/g, "");
    return { laborRows: tbl("労務判定（"), weekRows: tbl("週の休み（"), panel,
      legendOpened: document.body.innerText.includes("労務の要修正"),
      legendHasExternal: document.body.innerText.includes("外部の長時間"),
      oldColorCells: imgs.filter(x => x.includes(oldColor)).length };
  }, OLD_EXT_BG);
  const errors = h.errors.slice();
  await h.close();
  return { ...m, errors };
}

async function setTab() {
  const h = await openHarness({
    root: ROOT, extraHead: EXTRA_HEAD, waitFor: "#root > *",
    jsx: `
function Harness(){
  const [settings,setSettings]=React.useState({shopId:"s1",candidates:[],staffAttributes:{},
    staffTypeLimits:{employee:{name:"社員"},parttime:{name:"バイト"},dispatch:{name:"派遣"}},
    laborSettings:{highlightExternalOver8h:1,externalOverThresholdMin:480}});
  return <SetTab settings={settings} onSave={s=>setSettings(s)} subs={[]} saveSubs={()=>{}}
    tt={()=>{}} syncStatus="online" plan="premium" shopId="s1"/>;
}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);`,
  });
  await h.page.waitForTimeout(300);
  const m = await h.evaluate(() => {
    const sels = [...document.querySelectorAll("select")].filter(x => [...x.options].some(o => o.value === "none"));
    return {
      optTexts: sels.length ? [...sels[0].options].map(o => o.text) : [],
      // 派遣（組み込み dispatch の既定＝保存値 none）の select が「応援・外部」を選んだ状態で出る
      selectedTexts: sels.map(s => s.options[s.selectedIndex] ? s.options[s.selectedIndex].text : ""),
      hasExternalToggle: !!document.querySelector("[data-external-over]"),
      bodyHasJudgeExcluded: document.body.innerText.includes("判定対象外"),
      bodyHasExternalLong: document.body.innerText.includes("外部の長時間") || document.body.innerText.includes("長時間の日"),
    };
  });
  const errors = h.errors.slice();
  await h.close();
  return { ...m, errors };
}

(async () => {
  const se = await shiftEditTab();
  const st = await setTab();
  // 労務判定表は1列目が行の名前、続いて staffList の順（外部さん・バイト）
  const colOf = (rows, i) => rows.map(r => `${r[0]}=${r[i] == null ? "" : r[i]}`);
  const lineOf = (txt, name) => ((txt || "").split("\n").find(l => l.startsWith(name + "：")) || "").slice(name.length + 1);
  const ext = lineOf(se.panel, "外部さん"), pt = lineOf(se.panel, "バイト");
  const pass = {
    // ① 労務判定表の列が B の人と完全に一致する（総括・月実働・残業予定・割増の行まで）
    labor_table_rendered: se.laborRows.length >= 5,
    labor_column_same_as_b: se.laborRows.length > 0 && colOf(se.laborRows, 1).join("|") === colOf(se.laborRows, 2).join("|"),
    labor_verdict_not_blank: (() => { const r = se.laborRows.find(x => x[0] === "総括"); return !!r && r[1] !== "" && r[1] === r[2]; })(),
    // 労務の確認パネル: 同じ判定が出て、従業員番号の未設定は出さない（バイトは番号を持つので両方とも出ない）
    panel_line_same_as_b: ext !== "" && ext === pt && /8h超/.test(ext) && /休憩不足/.test(ext),
    panel_no_number_for_external: !/従業員番号が未設定/.test(ext),
    week_rest_same_as_b: colOf(se.weekRows, 1).join("|") === colOf(se.weekRows, 2).join("|"),
    // ② 外部の長時間は消えた（保存済みの設定があっても塗らない・レジェンドにも無い）
    legend_opened: se.legendOpened === true,
    legend_has_no_external_long: se.legendHasExternal === false,
    no_old_external_color: se.oldColorCells === 0,
    settab_no_external_toggle: st.hasExternalToggle === false && st.bodyHasExternalLong === false,
    // 選択肢は「応援・外部」で、「判定対象外」の文言が無い
    option_labels: st.optTexts.join(" / ") ===
      "1か月単位の変形労働時間制（正社員・契約社員・特定技能） / 通常の労働時間制（パート・アルバイト） / 応援・外部",
    dispatch_shows_external: st.selectedTexts.includes("応援・外部"),
    settab_no_judge_excluded: st.bodyHasJudgeExcluded === false,
    no_console_errors: se.errors.length === 0 && st.errors.length === 0,
  };
  const allPass = Object.values(pass).every(Boolean);
  console.log(JSON.stringify({ shiftEditTab: se, setTab: st, pass, allPass }, null, 1));
  process.exit(allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
