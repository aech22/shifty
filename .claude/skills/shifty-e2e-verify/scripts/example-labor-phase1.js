// 労務判定 第1弾（項目1・2＋3・6・12・日次判定パネル）の実ブラウザ回帰テスト。
// app-main.js を読み込まないので Firebase へは1バイトも出ない（SKILL.md 1.6節）。
//
// 実行:   node .claude/skills/shifty-e2e-verify/scripts/example-labor-phase1.js  → allPass=true / EXIT=0
// 反証:   SHIFTY_ROOT=<この機能より前の配信物> node ... → EXIT=1（落ちないなら何も検証していない）
"use strict";
const path = require("node:path");
const { openHarness } = require(path.join(__dirname, "mount-component.js"));

const ROOT = process.env.SHIFTY_ROOT || undefined;
// index.html は読み込まないので、テーマ変数を注入する（無いと var(--c-*) が無効値になる）。
const EXTRA_HEAD = `<style>:root{--c-bg:#F0F2F5;--c-card:#FFFFFF;--c-input:#F3F4F6;--c-input2:#F0F2F5;` +
  `--c-border:#E5E7EB;--c-border2:#D1D5DB;--c-text:#1A1A2E;--c-text2:#374151;--c-text3:#6B7280;` +
  `--c-text4:#9CA3AF;--c-shadow:rgba(0,0,0,.06);--c-accent:#f87036;--c-danger:#DC2626;}</style>`;

const R = { setTab: {}, shiftEditTab: {}, errors: [] };

// ---- 1. SetTab: 労働時間制セレクトと労務判定カード -----------------------------
async function setTab(plan) {
  const h = await openHarness({
    root: ROOT, extraHead: EXTRA_HEAD, waitFor: "#root > *",
    jsx: `
      function Harness(){
        const [settings,setSettings]=React.useState({shopId:"s1",candidates:[],
          staffAttributes:{},staffTypeLimits:{employee:{name:"社員"},parttime:{name:"バイト"},custom_x1:{name:"契約"}}});
        window.__settings=settings;
        return <SetTab settings={settings} onSave={s=>setSettings(s)} subs={[]} saveSubs={()=>{}}
          tt={m=>{window.__toast=m;}} syncStatus="online" plan=${JSON.stringify(plan)} shopId="s1" staffList={["田中"]}/>;
      }
      ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);`,
  });
  const read = () => h.evaluate(() => {
    const txt = document.body.innerText;
    const card = [...document.querySelectorAll("div")].find(d => (d.innerText || "").startsWith("労務判定（1か月単位の変形労働時間制）"));
    const rows = card ? [...card.querySelectorAll("tbody tr")].map(tr => [...tr.querySelectorAll("td")].map(td => td.innerText.trim())) : [];
    const sels = [...document.querySelectorAll("select")].filter(s => [...s.options].some(o => o.text === "判定対象外"));
    return {
      hasCard: !!card,
      wLine: (txt.match(/この値から週の法定労働時間を\s*(\S+)\s*と判定しました/) || [])[1] || null,
      rows,
      laborSelects: sels.map(s => ({ value: s.value, options: [...s.options].map(o => o.value) })),
      selectFontSizes: sels.map(s => getComputedStyle(s).fontSize),
    };
  });

  const before = await read();
  if (plan !== "premium") { await h.close(); return before; }

  // 属性セレクトを変える → settings.staffTypeLimits[*].laborSystem に入る
  await h.evaluate(() => {
    const sels = [...document.querySelectorAll("select")].filter(s => [...s.options].some(o => o.text === "判定対象外"));
    const set = (el, v) => {
      Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set.call(el, v);
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    const blank = sels.find(x => x.value === ""); // 未設定なのは custom_x1（契約）だけ
    if (blank) set(blank, "A"); // 変更前の配信物にはセレクトが無い＝例外で止めず assert を落とす
  });
  await h.page.waitForTimeout(200);
  const savedLabor = await h.evaluate(() => {
    const t = window.__settings.staffTypeLimits;
    return Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v.laborSystem || null]));
  });

  // 31日の総枠を 194:51 に変える → W=44時間 / 31日総枠 194:51
  await h.evaluate(() => {
    const card = [...document.querySelectorAll("div")].find(d => (d.innerText || "").startsWith("労務判定（1か月単位の変形労働時間制）"));
    if (!card) return; // 変更前の配信物にはカードが無い＝例外で止めず assert を落とす
    const ins = [...card.querySelectorAll("input[type=number]")];
    const set = (el, v) => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    set(ins[0], "194"); set(ins[1], "51");
  });
  await h.page.waitForTimeout(250);
  const after44 = await read();
  await h.close();
  return { before, savedLabor, after44 };
}

// ---- 2. ShiftEditTab: 時刻の入力ミスと労務判定パネル ---------------------------
async function shiftEditTab() {
  // 田中=社員(A制・既定) / 鈴木=バイト(B制・既定) / 佐藤=契約(custom・laborSystem未設定) / 平=派遣(対象外)
  // 田中 10/1 は 09:00-22:00（13時間＝12h超）、10/2 は 10:00-12:00（2時間＝4h未満）。
  // 鈴木 10/1 は 22:00→02:00 の入力ミス。
  // 平 10/1 は 09:00-23:00（14時間）＝対象外なので 12h超/8h超 のどれも出ない。
  const h = await openHarness({
    root: ROOT, extraHead: EXTRA_HEAD, waitFor: "select",
    jsx: `
const P={id:"p1",urlToken:"t1",shopId:"S1",label:"10月前半",startDate:"2026-10-01",endDate:"2026-10-05",deadlineDate:"",createdAt:"2026-09-01T00:00:00.000Z"};
const mk=(id,name,shifts)=>({id,periodId:"p1",staffName:name,shopId:"S1",comment:"",submittedAt:"2026-09-02T00:00:00.000Z",shifts});
const SUBS=[
  mk("s1","田中",{"2026-10-01":{status:"work",start:"09:00",end:"22:00"},"2026-10-02":{status:"work",start:"10:00",end:"12:00"}}),
  mk("s2","鈴木",{"2026-10-01":{status:"work",start:"22:00",end:"02:00"}}),
  mk("s3","佐藤",{"2026-10-01":{status:"work",start:"09:00",end:"17:00"}}),
  mk("s4","平",{"2026-10-01":{status:"work",start:"09:00",end:"23:00"}}),
];
const SETTINGS={shopId:"S1",candidates:[{start:"09:00",end:"23:00"}],weekdayCandidates:{},dateCandidates:{},
  breakTimes:{weekday:[],sat:[],sun:[],holSat:[],holSun:[]},
  staffAttributes:{田中:"employee",鈴木:"parttime",佐藤:"custom_x1",平:"dispatch"},
  staffTypeLimits:{employee:{name:"社員"},parttime:{name:"バイト"},dispatch:{name:"派遣"},custom_x1:{name:"契約"}},
  staffColors:{},staffAliases:{},positions:{kitchen:[],hall:[]},requiredPositions:{},staffPositions:{}};
function Harness(){
  const [subs,setSubs]=React.useState(SUBS);
  return <ShiftEditTab subs={subs} periods={[P]} staffList={["田中","鈴木","佐藤","平"]}
    onSave={v=>setSubs(p=>typeof v==="function"?v(p):v)} tt={m=>{window.__toast=m;}}
    settings={SETTINGS} plan="premium" shopId="S1" shopName="テスト店" onUpgrade={()=>{}}
    savePeriods={()=>{}} ownerReadOnly={false}/>;
}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);`,
  });
  await h.page.waitForTimeout(400);
  const m = await h.evaluate(() => {
    void document.body.innerText;
    // パネルの外枠を取る（文書順の最初の一致＝最も外側。innerText がタイトルで始まる div は外枠だけ）
    const panel = t => {
      const d = [...document.querySelectorAll("div")].find(x => (x.innerText || "").startsWith(t));
      return d ? d.innerText.replace(/\s+$/, "") : null;
    };
    // セル色: cellBgStyle は色を backgroundImage の linear-gradient レイヤーとして載せる（fill方式）。
    // backgroundColor だけを見ると不透明ベース(--c-card)しか返らず**必ず偽陰性**になる。
    const cells = [...document.querySelectorAll("input")].map(i => {
      const cs = getComputedStyle(i);
      return { bg: cs.backgroundColor, img: cs.backgroundImage, v: i.value };
    });
    return {
      timeErrPanel: panel("⚠ 時刻の入力ミス"),
      laborPanel: panel("⚠ 労務の確認が必要です"),
      timeErrCells: cells.filter(c => (c.img || "").replace(/\s/g, "").includes("rgba(190,24,93,0.25)")).map(c => c.v),
      dupColorCells: cells.filter(c => (c.img || "").replace(/\s/g, "").includes("rgba(255,71,87")).length,
    };
  });
  const errors = h.errors.slice();
  await h.close();
  return { ...m, errors };
}

(async () => {
  const st = await setTab("premium");
  const free = await setTab("pro");
  const se = await shiftEditTab();
  R.setTab = { ...st, proHasCard: free.hasCard, proLaborSelects: free.laborSelects.length };
  R.shiftEditTab = se;

  const rowsOf = a => (a.rows || []).map(r => r.join("/"));
  const pass = {
    // 項目1: 属性ごとに労働時間制を選べ、laborSystem に保存される
    labor_select_rendered: st.before.laborSelects.length === 3,
    labor_select_defaults: st.before.laborSelects.map(s => s.value).join(",") === "B,A," // バイト/社員/契約（50音順）
      || st.before.laborSelects.map(s => s.value).sort().join(",") === ",A,B",
    labor_select_options: st.before.laborSelects.every(s => s.options.join(",").endsWith("A,B,none")),
    labor_select_saved: st.savedLabor.custom_x1 === "A",
    labor_select_fontsize16: st.before.selectFontSizes.every(f => parseFloat(f) >= 16),
    // 項目2＋3: 導出表示と S-1 の4行
    w_line_40: st.before.wLine === "40時間",
    s1_table: rowsOf(st.before).join(" | ") ===
      "31日/177:08/200:00/207:08 | 30日/171:25/194:00/201:25 | 29日/165:42/188:00/195:42 | 28日/160:00/183:00/190:00",
    // S-1注記: 194:51 の入力で W=44時間 / 31日総枠 194:51
    w_line_44: st.after44.wLine === "44時間",
    base31_44: (st.after44.rows[0] || [])[1] === "194:51",
    // Premium ガード
    pro_has_no_card: free.hasCard === false && free.laborSelects.length === 0,
    // 項目12: エラーパネルとセル色
    time_err_panel: !!se.timeErrPanel && /鈴木 1\(木\)/.test(se.timeErrPanel) && /25:00・26:00/.test(se.timeErrPanel),
    // 鈴木 10/1 の出勤・退勤の2セルだけが入力ミス色になる（他の人・他の日には付かない）
    time_err_cell_color: se.timeErrCells.length === 2 && se.timeErrCells.join(",") === "22,2",
    // 日次判定パネル（S-4）
    labor_panel_a: !!se.laborPanel && /田中：12h超1日、4h未満1日、休憩不足1日/.test(se.laborPanel),
    labor_panel_b: !!se.laborPanel && /鈴木：時刻の入力ミス1日/.test(se.laborPanel),
    labor_panel_badsystem: !!se.laborPanel && /佐藤：休憩不足1日、区分が空欄か誤り/.test(se.laborPanel),
    // 項目1: 対象外（派遣）は労務判定に出ない
    labor_panel_excludes_none: !!se.laborPanel && !/平/.test(se.laborPanel),
    no_console_errors: se.errors.length === 0,
  };
  const allPass = Object.values(pass).every(Boolean);
  console.log(JSON.stringify({ measured: R, pass, allPass }, null, 2));
  process.exit(allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
