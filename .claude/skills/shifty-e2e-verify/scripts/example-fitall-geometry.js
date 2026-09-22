// BACKLOG「🔴 シフト作成タブ: 『全員表示』を『全表示』に改め、期間全体を縦横スクロールなしで一望する」
// の受け入れ条件を機械照合するための計測スクリプト。
//
//   node .claude/skills/shifty-e2e-verify/scripts/example-fitall-geometry.js
//
// ShiftEditTab だけを実ブラウザ（1400x900）にマウントし、全表示（現在のラベルは「全員表示」）に
// 切り替えたうえでメイングリッドのスクロールコンテナを 16日/31日 × 8/15/25名 の6水準で測る。
// **Firebase へは1バイトも出さない**（app-main.js を読み込まないので firebaseDB は null）。
//
// 期待する出力:
//   実装前（develop 2f758c4 時点） … verdict.allPass === false。
//     横は全水準 fitsH=false（scrollWidth > clientWidth）。原因は td/th が content-box なので
//     SD(padding 2px 4px) が日付列に +8px、VTH(padding 2px) が各スタッフ列に +4px 実幅を足すのに、
//     colW の式（app-admin.js:1179）がそれを勘定していないこと。はみ出し量 ≒ 4×人数+8−端数。
//     縦は全水準 fitsV=false（70vh 固定・app-admin.js:1777 のため）。
//   実装後 … 6水準すべてで fitsH かつ fitsV が true になること。
//
// ラベルは実装で「全員表示」→「全表示」に変わるので、どちらでも押せるようにしてある。
"use strict";

const path = require("node:path");
const { openHarness } = require(path.join(__dirname, "mount-component.js"));

// 16日=2週間運用、31日=1ヶ月運用。人数は Free 上限20名を挟む3水準。
const LEVELS = [];
for (const [label, start, end] of [["16日", "2026-10-01", "2026-10-16"], ["31日", "2026-10-01", "2026-10-31"]]) {
  for (const staff of [8, 15, 25]) LEVELS.push({ label: `${label}×${staff}名`, start, end, staff });
}

const jsxFor = (start, end, staff) => {
  const names = [];
  for (let i = 0; i < staff; i++) names.push("氏名" + String(i + 1).padStart(2, "0"));
  return `
const P={id:"p1",urlToken:"t1",shopId:"S1",label:"計測期間",startDate:${JSON.stringify(start)},endDate:${JSON.stringify(end)},deadlineDate:"",createdAt:"2026-09-01T00:00:00.000Z"};
function Harness(){
  return <ShiftEditTab
    subs={[]} periods={[P]} staffList={${JSON.stringify(names)}}
    onSave={()=>{}} tt={()=>{}}
    settings={{candidates:[],weekdayCandidates:{},dateCandidates:{},templates:[]}}
    plan="premium" shopId="S1" shopName="テスト店" onUpgrade={()=>{}} allLinkedShops={[]}
    onLoadPastSubs={()=>{}} pastSubsLoaded={true}
    savePeriods={()=>{}} ownerReadOnly={false}/>;
}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);
`;
};

// メイングリッド＝thead の最初の th が「日付」のテーブル。そのスクロールコンテナを測る。
const MEASURE = () => {
  const grid = Array.from(document.querySelectorAll("table"))
    .find(t => ((t.querySelector("thead th") || {}).textContent || "").trim() === "日付");
  if (!grid) return { error: "grid not found" };
  const box = grid.closest("div");
  const ths = grid.querySelectorAll("thead th");
  const firstInput = grid.querySelector("tbody input");
  const rows = grid.querySelectorAll("tbody tr");
  const stride = rows.length >= 3
    ? rows[2].getBoundingClientRect().top - rows[0].getBoundingClientRect().top : null;
  return {
    clientW: box.clientWidth, scrollW: box.scrollWidth,
    clientH: box.clientHeight, scrollH: box.scrollHeight,
    dateColW: Math.round(ths[0].getBoundingClientRect().width),
    staffColW: Math.round(ths[1].getBoundingClientRect().width),
    bodyRows: rows.length,
    stridePerDate: stride ? Math.round(stride * 10) / 10 : null,
    // 右端にも日付列が要る（受け入れ条件）。実装後は最後の th も「日付」になる想定。
    lastHeaderText: (ths[ths.length - 1].textContent || "").trim(),
    inputFontSize: firstInput ? getComputedStyle(firstInput).fontSize : null,
    // 休みカウント表・集計表の1スタッフ目の列がグリッドと同じ位置から始まるか。
    // 休みカウント表はスタッフ名のヘッダを持たず列位置だけで誰の数字かを示すので、ここがずれると読めなくなる。
    // 時間帯別出勤人数（HeatTable）は列が時刻なので揃える必要がなく、比較から外す。
    // **列数で外そうとすると失敗する**——スタッフ15名のとき grid は 1+15+1=17 列、HeatTable も
    // 1+16時間=17 列でちょうど一致してしまう（実測）。見出し「時間帯別出勤人数」の直下の
    // コンテナごと除外する。
    columnOffsets: (() => {
      const heatWrap = Array.from(document.querySelectorAll("div")).find(
        d => d.firstElementChild && (d.firstElementChild.textContent || "").trim() === "時間帯別出勤人数");
      return Array.from(document.querySelectorAll("table")).map(t => {
        if (heatWrap && heatWrap.contains(t)) return null;
        const row = t.querySelector("tr");
        const cells = row ? row.children : [];
        if (cells.length < 3) return null;
        return Math.round(cells[1].getBoundingClientRect().left - t.getBoundingClientRect().left);
      }).filter(v => v !== null);
    })(),
  };
};

(async () => {
  const results = [];
  for (const lv of LEVELS) {
    const h = await openHarness({ jsx: jsxFor(lv.start, lv.end, lv.staff), waitFor: "select" });
    try {
      await h.page.waitForTimeout(400);
      // 実装前は「全員表示」、実装後は「全表示」。どちらでも押せるようにする。
      // clickByText は部分一致のうえ **見つからなくても例外を投げず false を返す**ので、
      // try/catch ではなく戻り値で分岐する（try/catch で書くと押せていないまま通常表示を測る）。
      // 状態で表記が変わるボタンなので完全一致の clickExact を使う（mount-component.js の注意書き）。
      let clicked = await h.clickExact("全表示");
      if (clicked !== "ok") clicked = await h.clickExact("全員表示");
      if (clicked !== "ok") throw new Error("全表示/全員表示 ボタンが見つからない: " + clicked);
      await h.page.waitForTimeout(500);
      const m = await h.evaluate(MEASURE);
      // 縦は「2週間ぶん（最長16日）まで1画面」が仕様。16日を超える期間は**スクロールするのが正しい**
      // （2026-09-23 ユーザー指示）。したがって31日の水準で scrollH>clientH になるのは不具合ではない。
      const days = (new Date(lv.end) - new Date(lv.start)) / 86400000 + 1;
      results.push({
        level: lv.label, days,
        expectVerticalFit: days <= 16,
        ...m,
        fitsH: m.scrollW <= m.clientW,
        fitsV: days <= 16 ? (m.scrollH <= m.clientH) : (m.scrollH > m.clientH),
        overflowX: m.scrollW - m.clientW,
        overflowY: m.scrollH - m.clientH,
        errors: h.errors.length,
      });
    } finally { await h.close(); }
  }
  const verdict = {
    allFitHorizontally: results.every(r => r.fitsH),
    verticalBehaviourCorrect: results.every(r => r.fitsV), // 16日以下は1画面・それ以上はスクロール
    dateColumnAtBothEnds: results.every(r => r.lastHeaderText === "日付"),
    summaryTablesAligned: results.every(r => new Set(r.columnOffsets).size === 1),
    noConsoleErrors: results.every(r => r.errors === 0),
  };
  verdict.allPass = Object.values(verdict).every(v => v === true);
  console.log(JSON.stringify({ results, verdict }, null, 2));
  process.exitCode = verdict.allPass ? 0 : 1;
})().catch(e => { console.error("FATAL", e); process.exit(1); });
