// シフト作成タブ（ShiftEditTab）の操作の重さを測る計測スクリプト（S1・2026-10-04）。
// 計画書 Shifty_実装計画_2026-10.md の S.0・S1。
//
//   node .claude/skills/shifty-e2e-verify/scripts/perf-shift-edit-tab.js
//   CPU_RATES=1,6 REPS=5 node .../perf-shift-edit-tab.js          # CPU を6倍遅くした端末相当も測る（既定）
//   SHIFTY_ROOT=<変更前の配信物> node .../perf-shift-edit-tab.js   # 変更前と比べる（SKILL.md 1.6節）
//
// 合成データ: 30人 × 31日（2026年10月）＋前の期間（9月）。Firebase へは1バイトも出ない
// （app-main.js を読み込まない・onSave は親の state に入れるだけ）。
//
// 測るもの（操作1回ごと・REPS回の中央値）:
//   focus   … セルを選ぶ（el.focus()）
//   key     … 1文字入力（input イベント1回）
//   commit  … 確定して次のセルへ（次のセルを focus＝前のセルの blur で確定）
// 時間は「操作の直前」から「その操作で積まれた描き直しが済んだ後の setTimeout(0)」まで。
// あわせて、その操作の間に呼ばれた laborFindingsFor / calcNetWorkMinutes / resolveSubByAlias の回数を数える
// （app-utils.js はプレーンscriptなので、グローバルを包めば ShiftEditTab からの呼び出しも数えられる）。
//
// 判定（EXIT）: focus と key で laborFindingsFor が0回であること（S1 の受け入れ条件）。
// 表示が変わっていないことは textHash / colorHash を変更前の出力と見比べる（同じ合成データなら同じ値になる）。
"use strict";

const path = require("node:path");
const crypto = require("node:crypto");
const { openHarness } = require(path.join(__dirname, "mount-component.js"));

const N_STAFF = 30;
const REPS = Number(process.env.REPS || 5);
const CPU_RATES = (process.env.CPU_RATES || "1,6").split(",").map(Number);

const JSX = `
const NAMES=Array.from({length:${N_STAFF}},(_,i)=>"スタッフ"+String(i+1).padStart(2,"0"));
const days=(ym,n)=>Array.from({length:n},(_,i)=>ym+"-"+String(i+1).padStart(2,"0"));
const P_OCT={id:"pOct",urlToken:"tO",shopId:"S1",label:"10月",startDate:"2026-10-01",endDate:"2026-10-31",deadlineDate:"",createdAt:"2026-09-01T00:00:00.000Z"};
const P_SEP={id:"pSep",urlToken:"tS",shopId:"S1",label:"9月",startDate:"2026-09-01",endDate:"2026-09-30",deadlineDate:"",createdAt:"2026-08-01T00:00:00.000Z"};
// 人ごとにずらした4日周期（日中・夜・通し・休み）。毎回同じデータになる（乱数を使わない）
const shiftOf=(i,d)=>{const k=(i+d)%4;return k===0?{status:"work",start:"09:00",end:"18:00"}:k===1?{status:"work",start:"17:00",end:"23:00"}:k===2?{status:"work",start:"10:00",end:"22:00"}:{status:"holiday"};};
const mkSubs=(p,ds)=>NAMES.map((n,i)=>({id:"s_"+p.id+"_"+i,periodId:p.id,staffName:n,shopId:"S1",comment:"",submittedAt:"2026-08-20T00:00:00.000Z",
  shifts:Object.fromEntries(ds.map((d,di)=>[d,shiftOf(i,di)]))}));
const SUBS0=[...mkSubs(P_OCT,days("2026-10",31)),...mkSubs(P_SEP,days("2026-09",30))];
const SETTINGS={candidates:[{start:"09:00",end:"18:00"},{start:"17:00",end:"23:00"}],weekdayCandidates:{},dateCandidates:{},templates:[],
  breakTimes:{weekday:[{start:"12:00",end:"13:00"}],sat:[{start:"12:00",end:"13:00"}],sun:[{start:"12:00",end:"13:00"}],hol:[{start:"12:00",end:"13:00"}]},
  staffAttributes:Object.fromEntries(NAMES.map((n,i)=>[n,i%3===0?"employee":"parttime"])),
  staffNumbers:Object.fromEntries(NAMES.map((n,i)=>[n,String(100+i)]))};
const STAFF=[...NAMES];
function Harness(){
  const [subs,setSubs]=React.useState(SUBS0);
  const onSave=v=>setSubs(prev=>{const next=(typeof v==="function")?v(prev):v;window.__subs=next;return next;});
  return <ShiftEditTab
    subs={subs} periods={[P_OCT,P_SEP]} staffList={STAFF}
    onSave={onSave} tt={m=>{window.__toast=m;}}
    settings={SETTINGS}
    plan="premium" shopId="S1" shopName="計測店" onUpgrade={()=>{}} allLinkedShops={[]}
    onLoadPastSubs={()=>{}} pastSubsLoaded={true}
    savePeriods={()=>{}} ownerReadOnly={false}/>;
}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);
`;

const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };

(async () => {
  const h = await openHarness({ jsx: JSX, waitFor: 'input[data-sc]', viewport: { width: 1400, height: 900 } });
  const cdp = await h.page.context().newCDPSession(h.page);

  // 呼び出し回数のカウンタ。グローバル関数を包む（ShiftEditTab は呼び出し時にグローバルを引く）
  await h.evaluate(() => {
    window.__cnt = {};
    for (const fn of ["laborFindingsFor", "calcNetWorkMinutes", "resolveSubByAlias"]) {
      const orig = window[fn];
      if (typeof orig !== "function") { window.__cnt[fn] = "missing"; continue; }
      window.__cnt[fn] = 0;
      window[fn] = function () { window.__cnt[fn]++; return orig.apply(this, arguments); };
    }
  });
  await h.page.waitForTimeout(500);

  // 表示の指紋（変更前後で一致するか見比べる用）。グリッド・労務判定表・集計を含むタブ全体の文字と、
  // 入力欄の値と背景色
  const fingerprint = () => h.evaluate(() => {
    const root = document.getElementById("root");
    const inputs = [...root.querySelectorAll("input[data-sc]")].map(i => i.getAttribute("data-scn") + "|" + i.getAttribute("data-sc") + "=" + i.value + "@" + getComputedStyle(i).backgroundColor + "/" + getComputedStyle(i.parentElement).backgroundColor);
    return { text: root.innerText, cells: inputs.join("\n"), nInputs: inputs.length };
  });
  const hash = s => crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);
  const fp0 = await fingerprint();

  // 1回の操作を測る。act はページ内で実行する操作の名前と引数
  const measure = (op, args) => h.evaluate(async ([op, args]) => {
    const q = (n, d, f) => document.querySelector(`input[data-scn="${n}"][data-sc="${d}|${f}"]`);
    for (const k of Object.keys(window.__cnt)) if (typeof window.__cnt[k] === "number") window.__cnt[k] = 0;
    const t0 = performance.now();
    if (op === "focus") { q(...args.cell).focus(); }
    else if (op === "key") {
      const el = q(...args.cell);
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, args.value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    } else if (op === "commit") { q(...args.next).focus(); }
    await new Promise(r => setTimeout(r, 0));
    const t1 = performance.now();
    return { ms: +(t1 - t0).toFixed(1), cnt: { ...window.__cnt } };
  }, [op, args]);

  const results = {};
  for (const rate of CPU_RATES) {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate });
    const rec = { focus: [], key: [], commit: [] };
    for (let i = 0; i < REPS; i++) {
      // 毎回ちがう人・日のセルを使う（同じセルを打ち直すと2回目以降の状態が変わるため）
      const name = "スタッフ" + String(i + 1 + rate).padStart(2, "0");
      const date = "2026-10-" + String(10 + i).padStart(2, "0");
      const A = [name, date, "start"], B = [name, date, "end"];
      rec.focus.push(await measure("focus", { cell: A }));
      rec.key.push(await measure("key", { cell: A, value: "1" }));
      rec.key.push(await measure("key", { cell: A, value: "11" }));
      rec.commit.push(await measure("commit", { next: B }));
      await h.evaluate(() => document.activeElement && document.activeElement.blur());
      await h.page.waitForTimeout(150);
    }
    const sum = arr => ({
      medianMs: median(arr.map(x => x.ms)), maxMs: Math.max(...arr.map(x => x.ms)),
      laborFindingsFor: { median: median(arr.map(x => x.cnt.laborFindingsFor)), max: Math.max(...arr.map(x => x.cnt.laborFindingsFor)) },
      calcNetWorkMinutes: median(arr.map(x => x.cnt.calcNetWorkMinutes)),
      resolveSubByAlias: median(arr.map(x => x.cnt.resolveSubByAlias)),
    });
    results["cpu" + rate + "x"] = { focus: sum(rec.focus), key: sum(rec.key), commit: sum(rec.commit) };
  }
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  await h.page.waitForTimeout(300);
  const fp1 = await fingerprint();

  const all = Object.values(results);
  const verdict = {
    focusNoLabor: all.every(r => r.focus.laborFindingsFor.max === 0),
    keyNoLabor: all.every(r => r.key.laborFindingsFor.max === 0),
    commitRecomputes: all.every(r => r.commit.laborFindingsFor.max > 0),   // 確定では計算する（S1 では変えない）
    noErrors: h.errors.length === 0,
  };
  verdict.allPass = Object.values(verdict).every(Boolean);
  console.log(JSON.stringify({
    root: process.env.SHIFTY_ROOT || "(repo)", staff: N_STAFF, days: 31, reps: REPS, nInputs: fp0.nInputs,
    results,
    fingerprint: { mountText: hash(fp0.text), mountCells: hash(fp0.cells), afterText: hash(fp1.text), afterCells: hash(fp1.cells) },
    verdict, errors: h.errors,
  }, null, 2));
  await h.close();
  process.exit(verdict.allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
