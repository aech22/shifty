// 「携帯でのヒートマップの出し方」（2026-09-23 ユーザー指示）の受け入れ条件を機械照合する計測スクリプト。
//
//   node .claude/skills/shifty-e2e-verify/scripts/example-heatmap-mobile-fit.js
//
// 指示:
//   ・通常表示のとき、ヒートマップは**横スクロールなしで全時間帯**を出す。
//     時間帯が多く携帯の幅を超えるときだけ横スクロールにする。
//   ・絞り込み表示（キッチンのみ／ホールのみ）でも通常表示と同じ出し方にする。
//
// ShiftEditTab だけを実ブラウザ（375x812＝携帯幅）にマウントし、時間帯別出勤人数の
// ヒートマップを 通常表示／キッチン絞り込み／ホール絞り込み の3水準で測る。
// **Firebase へは1バイトも出さない**（app-main.js を読み込まないので firebaseDB は null）。
//
// 期待する出力:
//   実装前 … verdict.allPass === false。通常表示のヒートマップが scrollW > clientW（横スクロール）で、
//     出ている時間帯も heatHours の一部だけになる。
//   実装後 … 3水準とも fitsH=true（scrollW <= clientW）かつ hourCols が heatHours の全数。
//
// 幅の内訳（app-admin.js の heatFitsIn）: 日付列52px＋枠線8px を引いた残りに、
// 1時間あたり最小9px を掛けた幅が要る。携帯幅では2枚を横に並べると1枚あたり約166pxしか
// 使えず届かないので、実装は**縦積みにして1枚あたり全幅**を使う。
"use strict";

const path = require("node:path");
const { openHarness } = require(path.join(__dirname, "mount-component.js"));

// 10:00〜25:00（＝16時間ぶんの列）。飲食店の通し営業に近い、列数が多いほうの現実的な水準。
const CANDS = [{ start: "10:00", end: "17:00" }, { start: "17:00", end: "25:00" }];
const EXPECTED_HOURS = 16;

// スペーサーより後ろがホール。2枚（キッチン／ホール）のヒートマップを出すために必ず入れる。
const STAFF = ["厨房1", "厨房2", "厨房3", "__spacer__1", "客席1", "客席2", "客席3"];

const JSX = `
const P={id:"p1",urlToken:"t1",shopId:"S1",label:"計測期間",startDate:"2026-10-01",endDate:"2026-10-16",deadlineDate:"",createdAt:"2026-09-01T00:00:00.000Z"};
function Harness(){
  return <ShiftEditTab
    subs={[]} periods={[P]} staffList={${JSON.stringify(STAFF)}}
    onSave={()=>{}} tt={()=>{}}
    settings={{candidates:${JSON.stringify(CANDS)},weekdayCandidates:{},dateCandidates:{},templates:[]}}
    plan="premium" shopId="S1" shopName="テスト店" onUpgrade={()=>{}} allLinkedShops={[]}
    onLoadPastSubs={()=>{}} pastSubsLoaded={true}
    savePeriods={()=>{}} ownerReadOnly={false}/>;
}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);
`;

// ヒートマップ＝thead の最初の th が「日付」で、2番目以降の th が時刻（"10"〜"25"）のテーブル。
// メイングリッドも最初の th が「日付」なので、**2番目の th が数字だけか**で見分ける。
const MEASURE = () => {
  const isHourHead = t => {
    const ths = t.querySelectorAll("thead th");
    if (ths.length < 2) return false;
    if ((ths[0].textContent || "").trim().replace(/\s+/g, "").indexOf("日付") < 0) return false;
    return /^\d{1,2}$/.test((ths[1].textContent || "").trim());
  };
  const tables = Array.from(document.querySelectorAll("table")).filter(isHourHead);
  return tables.map(t => {
    const box = t.closest("div");
    const ths = t.querySelectorAll("thead th");
    const hourTh = ths[1];
    return {
      clientW: box.clientWidth,
      scrollW: box.scrollWidth,
      // 実際に列として描かれている時間帯の数（日付列を除く）
      hourCols: ths.length - 1,
      hourColW: Math.round(hourTh.getBoundingClientRect().width * 10) / 10,
      overflowX: getComputedStyle(box).overflowX,
      boxLeft: Math.round(box.getBoundingClientRect().left),
      boxTop: Math.round(box.getBoundingClientRect().top),
    };
  });
};

const LEVELS = [
  { label: "通常表示", button: null },
  // ツールバーの絞り込みボタンは「キッチン」「ホール」。「キッチンのみ」「ホールのみ」は
  // PDF出力モーダルの別ボタンなので、そちらを指すとモーダルを開くまで見つからない。
  { label: "キッチン絞り込み", button: "キッチン" },
  { label: "ホール絞り込み", button: "ホール" },
];

(async () => {
  const results = [];
  for (const lv of LEVELS) {
    const h = await openHarness({ jsx: JSX, waitFor: "select", viewport: { width: 375, height: 812 } });
    try {
      await h.page.waitForTimeout(400);
      if (lv.button) {
        const r = await h.clickExact(lv.button);
        if (r !== "ok") throw new Error(`${lv.button} が押せない: ${r}`);
        await h.page.waitForTimeout(500);
      }
      const tables = await h.evaluate(MEASURE);
      results.push({
        level: lv.label,
        tables,
        tableCount: tables.length,
        // 全ヒートマップが横スクロールなしで全時間帯を出せているか
        fitsH: tables.length > 0 && tables.every(t => t.scrollW <= t.clientW),
        allHoursShown: tables.length > 0 && tables.every(t => t.hourCols === EXPECTED_HOURS),
        errors: h.errors.length,
      });
    } finally { await h.close(); }
  }
  const verdict = {
    everyLevelHasHeatmaps: results.every(r => r.tableCount >= 1),
    noHorizontalScroll: results.every(r => r.fitsH),
    allHoursShown: results.every(r => r.allHoursShown),
    noConsoleErrors: results.every(r => r.errors === 0),
  };
  verdict.allPass = Object.values(verdict).every(v => v === true);
  console.log(JSON.stringify({ expectedHours: EXPECTED_HOURS, results, verdict }, null, 2));
  process.exitCode = verdict.allPass ? 0 : 1;
})().catch(e => { console.error("FATAL", e); process.exit(1); });
