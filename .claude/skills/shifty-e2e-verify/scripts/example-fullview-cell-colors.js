// BACKLOG「🔴 シフト作成タブ: 『全員表示』を『全表示』に改め…」の受け入れ条件のうち、
// 唯一「未検証」で残っていた1行を機械照合する:
//
//   「全表示でも土日祝の色（dc/baseRb）・ポジション不足の黄色（rbS/rbE）・
//     セルコマンドの背景色（cellBgStyle）・スタッフ名色（nameColor）が
//     通常表示と同一規則で再現される」
//
//   node .claude/skills/shifty-e2e-verify/scripts/example-fullview-cell-colors.js
//
// ShiftEditTab だけを実ブラウザ（1400x900）にマウントし、通常表示と全表示の2モードで
// 「td 側の色が画面に出ているか」を測る。
// **Firebase へは1バイトも出さない**（app-main.js を読み込まないので firebaseDB は null）。
//
// 何を測っているのか:
//   土日祝の行色（baseRb）とポジション不足の黄色（rbS/rbE）は **td の背景**にしか出ない。
//   一方セルコマンドの色（cellBgStyle）は **input の背景**に出る。この2系統が同時に見える
//   経路は2つあり、どちらでも受け入れ条件（td の色が見える）を満たす:
//     ・edge … input を td より一回り小さくして td の背景を帯として覗かせる
//     ・fill … input の背景を透明にして td の色をセル全面に透かす
//   **2026-09-23 に通常表示・全表示とも fill へ一本化した**（cellBgStyle の分岐を廃止）ので、
//   両モードとも判定は同じ「帯があるか、input が透明か」でよい。帯の太さだけを見ると
//   fill が偽陰性になる（通常表示の帯は border-box 統一で 7px→3px に細くなっている）。
//
// index.html は読み込まないので、テーマ変数（--c-input 等）を extraHead で注入する。
// 注入しないと var(--c-input) が無効値になり input の背景が透明になって、
// **覆っていても td の色が見えてしまう＝偽陰性**になる（実測で確認済み）。
"use strict";

const path = require("node:path");
const { openHarness } = require(path.join(__dirname, "mount-component.js"));

// index.html の :root（ライトモード）と同じ値。
const EXTRA_HEAD = `<style>:root{--c-bg:#F0F2F5;--c-card:#FFFFFF;--c-input:#F3F4F6;--c-input2:#F0F2F5;` +
  `--c-border:#E5E7EB;--c-border2:#D1D5DB;--c-text:#1A1A2E;--c-text2:#374151;--c-text3:#6B7280;` +
  `--c-text4:#9CA3AF;--c-shadow:rgba(0,0,0,.06);--c-accent:#f87036;--c-danger:#DC2626;}</style>`;

// 2026-10-01(木)〜10-31。10/3・10/4・10/10・10/11・10/12(スポーツの日) 等を含む。
const LEVELS = [
  { label: "16日×8名", start: "2026-10-01", end: "2026-10-16", staff: 8 },
  { label: "31日×25名", start: "2026-10-01", end: "2026-10-31", staff: 25 },
];

const jsxFor = (start, end, staff) => {
  const names = ["田中", "佐藤"];
  for (let i = names.length; i < staff; i++) names.push("氏名" + String(i + 1).padStart(2, "0"));
  return `
const P={id:"p1",urlToken:"t1",shopId:"S1",label:"計測期間",startDate:${JSON.stringify(start)},endDate:${JSON.stringify(end)},deadlineDate:"",createdAt:"2026-09-01T00:00:00.000Z"};
const SUB={id:"s1",periodId:"p1",staffName:"田中",shopId:"S1",comment:"",submittedAt:"2026-09-02T00:00:00.000Z",
  shifts:{"2026-10-01":{status:"work",start:"09:00",end:"18:00"},
          "2026-10-03":{status:"work",start:"09:00",end:"18:00"}}};
function Harness(){
  return <ShiftEditTab
    subs={[SUB]} periods={[P]} staffList={${JSON.stringify(names)}}
    onSave={()=>{}} tt={()=>{}}
    settings={{candidates:[{start:"09:00",end:"23:00"}],weekdayCandidates:{},dateCandidates:{},templates:[],
      // 休憩を1時間入れておく。入れないと 9:00-18:00 が「休憩不足」に当たり、
      // 2026-09-26 に入った労務の要修正のセル色（laborErr）が入力欄を不透明にして
      // **この計測（td の曜日色が透けるか）が常に偽になる**。
      breakTimes:{weekday:[{start:"12:00",end:"13:00"}],sat:[{start:"12:00",end:"13:00"}],
        sun:[{start:"12:00",end:"13:00"}],holSat:[],holSun:[]},
      staffColors:{"佐藤":"red"}}}
    plan="premium" shopId="S1" shopName="テスト店" onUpgrade={()=>{}} allLinkedShops={[]}
    onLoadPastSubs={()=>{}} pastSubsLoaded={true}
    savePeriods={()=>{}} ownerReadOnly={false}/>;
}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);
`;
};

const MEASURE = () => {
  const grid = Array.from(document.querySelectorAll("table"))
    .find(t => ((t.querySelector("thead th") || {}).textContent || "").trim() === "日付");
  if (!grid) return { error: "grid not found" };

  // 背景が transparent でない tr ＝ 土日祝（baseRb）の行。
  const trs = Array.from(grid.querySelectorAll("tbody tr"));
  const tinted = trs.find(tr => {
    const bg = getComputedStyle(tr).backgroundColor;
    return bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent";
  });
  if (!tinted) return { error: "tinted (weekend) row not found" };

  const inp = tinted.querySelector("td input");
  if (!inp) return { error: "cell input not found" };
  const td = inp.closest("td");
  const cs = getComputedStyle(td);
  const b = td.getBoundingClientRect(), i = inp.getBoundingClientRect();
  // 左の border は背景ではなく枠線なので帯から除く。
  const borderL = parseFloat(cs.borderLeftWidth) || 0;

  const nameDivs = Array.from(grid.querySelectorAll("thead th div"));
  const byName = n => nameDivs.find(d => (d.textContent || "").trim() === n);
  const dateTds = Array.from(grid.querySelectorAll("tbody td")).filter(
    t => /^\d+\(/.test((t.textContent || "").trim()));
  const satOrSun = dateTds.find(t => /\(土\)|\(日\)/.test(t.textContent || ""));

  return {
    rowTint: getComputedStyle(tinted).backgroundColor,
    tdBg: cs.backgroundColor,
    inputBg: getComputedStyle(inp).backgroundColor,
    // td 背景のうち見えている帯（px）。左右は border を除いた実質の帯。
    bandX: Math.round((b.width - borderL - i.width) * 10) / 10,
    bandY: Math.round((b.height - i.height) * 10) / 10,
    cellW: Math.round(b.width * 10) / 10,
    cellH: Math.round(b.height * 10) / 10,
    inputFontSize: getComputedStyle(inp).fontSize,
    // 覆われない＝td色が見える領域の割合（枠線ぶんを除く）
    staffNameColorRed: byName("佐藤") ? getComputedStyle(byName("佐藤")).color : null,
    staffNameColorBlack: byName("田中") ? getComputedStyle(byName("田中")).color : null,
    weekendDateTextColor: satOrSun ? getComputedStyle(satOrSun).color : null,
  };
};

(async () => {
  const results = [];
  for (const lv of LEVELS) {
    for (const mode of ["normal", "full"]) {
      const h = await openHarness({ jsx: jsxFor(lv.start, lv.end, lv.staff), waitFor: "select", extraHead: EXTRA_HEAD });
      try {
        await h.page.waitForTimeout(400);
        if (mode === "full") {
          let c = await h.clickExact("全表示");
          if (c !== "ok") c = await h.clickExact("全員表示");
          if (c !== "ok") throw new Error("全表示/全員表示 ボタンが見つからない: " + c);
          await h.page.waitForTimeout(500);
        }
        results.push({ level: lv.label, mode, ...(await h.evaluate(MEASURE)), errors: h.errors.length });
      } finally { await h.close(); }
    }
  }
  const full = results.filter(r => r.mode === "full");
  const normal = results.filter(r => r.mode === "normal");
  // 「帯がある」か「input が透明」かのどちらかを満たせば td の色は見えている。
  // **帯だけを見ると fill が偽陰性になる**ので、両モードとも同じこの述語で判定する。
  const showsTdColor = r => (r.bandX >= 2 && r.bandY >= 2) || /rgba\([^)]*,\s*0\)$/.test(r.inputBg || "");
  const modeOf = rs => rs.every(r => /rgba\([^)]*,\s*0\)$/.test(r.inputBg || "")) ? "fill(input透明)"
    : rs.every(r => r.bandX >= 2 && r.bandY >= 2) ? "edge(帯)" : "色が出ていない";
  const verdict = {
    // 通常表示・全表示とも td の色が見えていること（2026-09-23 に両方 fill へ一本化）
    normalShowsTdColor: normal.every(showsTdColor),
    fullShowsTdColor: full.every(showsTdColor),
    // 参考値（どちらの方式で出しているかの内訳。判定には使わない）。
    // 一本化後は両方とも "fill(input透明)" になるのが期待値。
    normalMode: modeOf(normal),
    fullMode: modeOf(full),
    // td 以外に出る色（スタッフ名・日付文字）は全表示でも再現されている
    staffNameColorKept: full.every(r => r.staffNameColorRed === "rgb(229, 57, 53)"),
    weekendDateTextKept: full.every(r => /rgb\(25, 118, 210\)|rgb\(229, 57, 53\)/.test(r.weekendDateTextColor || "")),
    noConsoleErrors: results.every(r => r.errors === 0),
  };
  verdict.allPass = Object.entries(verdict).every(([k, v]) => k === "fullMode" || k === "normalMode" || v === true);
  console.log(JSON.stringify({ results, verdict }, null, 2));
  process.exitCode = verdict.allPass ? 0 : 1;
})().catch(e => { console.error("FATAL", e); process.exit(1); });
