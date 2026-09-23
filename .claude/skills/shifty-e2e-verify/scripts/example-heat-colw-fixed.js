// 「ヒートマップの時間帯の列幅は固定で、枠いっぱいに引き伸ばさない」（2026-09-23 ユーザー指示）
// の回帰スクリプト。
//
//   node .claude/skills/shifty-e2e-verify/scripts/example-heat-colw-fixed.js
//
// 背景: `HeatTable` の `fitHours` は `table-layout:fixed` + `width:100%` なので、立てると
// 時間帯の列が枠幅まで伸びる。これを無条件に立てた版（03da503）では、デスクトップ幅の
// 通常表示・全表示で列幅が 24px から 39.7px へ伸びていた。`fitHours` は**自然幅では
// 収まらないときだけ**立てるのが正しい（携帯では詰めないと全時間帯が出せないため）。
//
// 測るもの: 1400x900 で スタッフ数 6/12/20/28 × 通常／キッチン絞り込み／全表示 の9通り。
//   ・時間帯1列の幅が全条件で同じ（＝スタッフ数にも表示モードにも依存しない）
//   ・その幅が自然幅 24px であること（枠幅 687px まで伸びていないこと）
//   ・全時間帯が出ていて横スクロールしないこと
//
// 期待する出力:
//   壊れている版 … allPass=false。通常・全表示の列幅だけ 39.7px になり distinctColW が2種類になる。
//   直っている版 … allPass=true。distinctColW が [24] の1種類。
//
// 携帯幅（375px）で「詰めて全部出す」側が壊れていないかは example-heatmap-mobile-fit.js が見る。
// この2本は逆向きの条件を押さえているので、両方が緑のときだけ仕様を満たす。
"use strict";

const path = require("node:path");
const { openHarness } = require(path.join(__dirname, "mount-component.js"));

// 10:00〜25:00（16時間ぶんの列）。自然幅は 52 + 24*16 + 8 = 444px で、1400px 幅なら余裕で収まる。
const CANDS = [{ start: "10:00", end: "17:00" }, { start: "17:00", end: "25:00" }];
const EXPECTED_HOURS = 16;
const NATURAL_COL_W = 24;

// スペーサーより後ろがホール。2枚（キッチン／ホール）を出すために必ず入れる。
const mkStaff = n => {
  const half = Math.max(1, Math.round(n / 2));
  return [...Array.from({ length: half }, (_, i) => `厨${i + 1}`), "__spacer__1",
          ...Array.from({ length: n - half }, (_, i) => `客${i + 1}`)];
};

const jsxFor = staff => `
const P={id:"p1",urlToken:"t1",shopId:"S1",label:"計測期間",startDate:"2026-10-01",endDate:"2026-10-16",deadlineDate:"",createdAt:"2026-09-01T00:00:00.000Z"};
function Harness(){
  return <ShiftEditTab
    subs={[]} periods={[P]} staffList={${JSON.stringify(staff)}}
    onSave={()=>{}} tt={()=>{}}
    settings={{candidates:${JSON.stringify(CANDS)},weekdayCandidates:{},dateCandidates:{},templates:[]}}
    plan="premium" shopId="S1" shopName="テスト店" onUpgrade={()=>{}} allLinkedShops={[]}
    onLoadPastSubs={()=>{}} pastSubsLoaded={true}
    savePeriods={()=>{}} ownerReadOnly={false}/>;
}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);
`;

// ヒートマップ＝thead の最初の th が「日付」で、2番目の th が数字だけのテーブル
// （メイングリッドも最初が「日付」なので2番目で見分ける）。
const MEASURE = () => {
  const isHourHead = t => {
    const ths = t.querySelectorAll("thead th");
    if (ths.length < 2) return false;
    if ((ths[0].textContent || "").trim().replace(/\s+/g, "").indexOf("日付") < 0) return false;
    return /^\d{1,2}$/.test((ths[1].textContent || "").trim());
  };
  return Array.from(document.querySelectorAll("table")).filter(isHourHead).map(t => {
    const box = t.closest("div");
    const ths = t.querySelectorAll("thead th");
    return {
      boxW: Math.round(box.getBoundingClientRect().width),
      hourCols: ths.length - 1,
      hourColW: Math.round(ths[1].getBoundingClientRect().width * 10) / 10,
      scrolls: box.scrollWidth > box.clientWidth,
    };
  });
};

const STAFF_N = [6, 12, 20, 28];
const LEVELS = [
  { label: "通常", button: null },
  { label: "キッチン絞り込み", button: "キッチン" },
  { label: "全表示", button: "全表示" },
];

(async () => {
  const rows = [];
  const errors = [];
  for (const n of STAFF_N) {
    for (const lv of LEVELS) {
      const h = await openHarness({ jsx: jsxFor(mkStaff(n)), waitFor: "select", viewport: { width: 1400, height: 900 } });
      try {
        await h.page.waitForTimeout(400);
        if (lv.button) {
          const r = await h.clickExact(lv.button);
          if (r !== "ok") throw new Error(`${lv.button} が押せない: ${r}`);
          await h.page.waitForTimeout(500);
        }
        const tables = await h.evaluate(MEASURE);
        if (!tables.length) throw new Error("ヒートマップが1枚も無い");
        rows.push({
          staff: n, level: lv.label,
          boxW: tables.map(t => t.boxW),
          hourColW: tables.map(t => t.hourColW),
          hourCols: tables.map(t => t.hourCols),
          scrolls: tables.map(t => t.scrolls),
        });
        errors.push(...h.errors);
      } catch (e) {
        rows.push({ staff: n, level: lv.label, error: String(e.message || e) });
      } finally { await h.close(); }
    }
  }

  const ok = rows.filter(r => !r.error);
  const allColW = ok.flatMap(r => r.hourColW);
  const distinctColW = [...new Set(allColW)].sort((a, b) => a - b);
  const verdict = {
    noMeasureFailure: ok.length === rows.length,
    colWidthFixed: distinctColW.length === 1,
    colWidthIsNatural: distinctColW.length === 1 && distinctColW[0] === NATURAL_COL_W,
    allHoursShown: ok.every(r => r.hourCols.every(c => c === EXPECTED_HOURS)),
    noHorizontalScroll: ok.every(r => r.scrolls.every(s => s === false)),
    noConsoleErrors: errors.length === 0,
  };
  verdict.allPass = Object.values(verdict).every(Boolean);

  console.log(JSON.stringify({ rows, distinctColW, errors, verdict }, null, 2));
  process.exit(verdict.allPass ? 0 : 1);
})();
