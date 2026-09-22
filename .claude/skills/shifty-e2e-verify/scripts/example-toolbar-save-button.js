// シフト作成タブのツールバーで「保存」が常に「PDF出力」の右隣に並ぶことを確かめる回帰テスト。
//
//   node .claude/skills/shifty-e2e-verify/scripts/example-toolbar-save-button.js
//
// 期待する出力: verdict.allPass === true。
// 修正前（Excel出力/PDF出力/保存が親の flexWrap に直接並んでいた版）は、ツールバーの幅が
// 796〜846px のとき「保存」だけが次の行に落ちて splitWidths が非空になり false になる。
//
// 実アプリと同じ条件をそろえている点が3つある。どれか1つでも欠けると折り返しが再現せず、
// 修正前の版でも通ってしまう（素通りするテストになる）ので減らさないこと。
//   1. index.html の <style> を注入する（`*{box-sizing:border-box}` とフォント。
//      入れないと項目幅が実アプリより狭くなる）
//   2. AdminView のタブ本体と同じ箱（maxWidth:900 / padding:"20px 14px 60px"）に入れる
//      ＝ツールバーの幅はビューポートではなくこの箱で決まる（実測 856px）
//   3. スタッフ一覧に __spacer__ を入れて hasSplit を立てる（キッチン/ホールのボタンが増える）
// Firebase へは1バイトも出さない（app-main.js を読み込まない）。
"use strict";

const path = require("node:path");
const fs = require("node:fs");
const { openHarness, REPO_ROOT } = require(path.join(__dirname, "mount-component.js"));

const root = process.env.SHIFTY_ROOT || REPO_ROOT;
const STYLE = (fs.readFileSync(path.join(REPO_ROOT, "index.html"), "utf8")
  .match(/<style[^>]*>[\s\S]*?<\/style>/) || [""])[0];

const STAFF = [
  ...Array.from({ length: 8 }, (_, i) => "キッチン" + (i + 1)),
  "__spacer__1",
  ...Array.from({ length: 21 }, (_, i) => "ホール" + (i + 1)),
];

const JSX = `
const P={id:"pA",urlToken:"tA",shopId:"S1",label:"2026年10月前半",startDate:"2026-10-01",endDate:"2026-10-15",deadlineDate:"",createdAt:"2026-09-01T00:00:00.000Z"};
const OLD={id:"pOld",urlToken:"tO",shopId:"S1",label:"2025年1月前半",startDate:"2025-01-01",endDate:"2025-01-15",deadlineDate:"",createdAt:"2024-12-01T00:00:00.000Z"};
function Harness(){
  const [subs,setSubs]=React.useState([]);
  return <div style={{maxWidth:900,margin:"0 auto",padding:"20px 14px 60px"}}>
    <ShiftEditTab subs={subs} periods={[P,OLD]} staffList={${JSON.stringify(STAFF)}}
      onSave={v=>setSubs(p=>(typeof v==="function")?v(p):v)} tt={m=>{window.__toast=m;}}
      settings={{candidates:[],weekdayCandidates:{},dateCandidates:{},templates:[]}}
      plan="premium" shopId="S1" shopName="テスト店" onUpgrade={()=>{}} allLinkedShops={[]}
      onLoadPastSubs={()=>{}} pastSubsLoaded={false} savePeriods={()=>{}} ownerReadOnly={false}/>
  </div>;
}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);
`;

// 「保存」が「PDF出力」と同じ行にあり、かつ右側にあるか。
// 上端の差で行を判定する（padding と fontSize が違うので alignItems:center でも数px ずれる）。
const probe = () => {
  const bar = document.querySelector("select").closest("div");
  const btns = [...bar.querySelectorAll("button")];
  const pick = t => btns.find(b => b.textContent.trim() === t);
  const bx = b => { const r = b.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width) }; };
  const p = pick("PDF出力"), s = pick("保存");
  if (!p || !s) return { missing: true };
  const P = bx(p), S = bx(s);
  return {
    barW: Math.round(bar.getBoundingClientRect().width),
    pdf: P, save: S,
    sameRow: Math.abs(P.y - S.y) < 5,
    rightOfPdf: S.x > P.x,
    gap: S.x - (P.x + P.w),
  };
};

(async () => {
  // 830〜910 は実アプリのツールバー幅（856px）をまたぐ帯。修正前はこの中で折り返しが起きる。
  const widths = [375, 768, 830, 840, 850, 860, 870, 880, 890, 900, 1500];
  const rows = {};
  const errorsAll = [];
  for (const w of widths) {
    const h = await openHarness({ jsx: JSX, waitFor: "select", viewport: { width: w, height: 900 }, extraHead: STYLE, root });
    try {
      // 実画面と同じ「全表示」状態にする（ボタン表記が「通常表示」に変わる）
      const b = await h.page.$("text=全表示");
      if (b) await b.click();
      await h.page.waitForTimeout(200);
      rows[w] = await h.evaluate(probe);
      errorsAll.push(...(h.errors || []));
    } finally { await h.close(); }
  }

  const splitWidths = Object.entries(rows)
    .filter(([, r]) => r.missing || !r.sameRow || !r.rightOfPdf)
    .map(([w]) => Number(w));

  const verdict = {
    splitWidths,
    gapAlways8: Object.values(rows).every(r => r.gap === 8),
    noConsoleErrors: errorsAll.length === 0,
  };
  verdict.allPass = splitWidths.length === 0 && verdict.gapAlways8 && verdict.noConsoleErrors;

  console.log(JSON.stringify({ rows, errors: errorsAll, verdict }, null, 2));
  process.exit(verdict.allPass ? 0 : 1);
})();
