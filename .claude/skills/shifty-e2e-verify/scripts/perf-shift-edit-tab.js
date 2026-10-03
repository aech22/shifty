// シフト作成タブ（ShiftEditTab）の操作の重さを測る計測スクリプト（S1 2026-10-04 → S2・S3 で拡張）。
// 計画書 Shifty_実装計画_2026-10.md の S.0・S1・S2・S3。
//
//   node .claude/skills/shifty-e2e-verify/scripts/perf-shift-edit-tab.js
//   CPU_RATES=1,6 REPS=5 node .../perf-shift-edit-tab.js          # CPU を6倍遅くした端末相当も測る（既定）
//   SHIFTY_ROOT=<変更前の配信物> PERF_EXPECT=s1 node .../perf-shift-edit-tab.js   # 変更前と比べる（SKILL.md 1.6節）
//
// 合成データ: 30人 × 31日（2026年10月）＋前の期間（9月）。Firebase へは1バイトも出ない
// （app-main.js を読み込まない・onSave は親の state に入れるだけ）。
//
// 測るもの（操作1回ごと・REPS回の中央値）:
//   focus   … セルを選ぶ（el.focus()）
//   key     … 1文字入力（input イベント1回）
//   commit  … 確定して次のセルへ（次のセルを focus＝前のセルの blur で確定）。
//              urgentMs＝次のセルにフォーカスが移り、確定したセルに値が出るまで（React の同期描画が済んだ時点）、
//              settledMs＝重い計算（労務判定・合計・ヒートマップ）まで済むまで（「計算中」の表示が消えるまで）。
//              S3 より前は確定で全部を同期で計算するので urgentMs≒settledMs になる
//   keyAfterCommit … 確定の 60ms 後に次のセルへ打った1文字が、ページで処理されるまでの時間（再計算に待たされるか）
//   burst   … 5セル続けて「値を打って Enter」したときの、laborFindingsFor の呼び出し回数を人数で割った値
//              （全員分を1回と数えた再計算の回数）。S3 の受け入れ条件は「入力の回数（5）より少ない」
// 描き直しの数: ShiftEditTab の描画回数（parentRenders）と、セル部品（ShiftCell）が描画された回数とそのセル。
// React.memo を React 読み込み直後に包んで数える（afterReact）。S2 より前は ShiftCell が無いので null。
// あわせて、その操作の間に呼ばれた laborFindingsFor / calcNetWorkMinutes / resolveSubByAlias の回数を数える
// （app-utils.js はプレーンscriptなので、グローバルを包めば ShiftEditTab からの呼び出しも数えられる）。
//
// 表示と保存の一致: マウント直後・全操作の後の、タブ全体の文字と全セルの値・背景色の指紋（sha256）と、
// onSave に渡った subs の指紋。同じ合成データ・同じ操作列なら変更前（SHIFTY_ROOT）と同じ値になる。
//
// 判定（EXIT）: PERF_EXPECT（既定 s3）までの受け入れ条件。
//   s1: focus と key で laborFindingsFor が0回
//   s2: ＋ focus と key で ShiftEditTab が描き直されず、描き直されたセル部品は操作したセルだけ
//   s3: ＋ 確定の同期描画で laborFindingsFor が0回・「計算中」が出て消える・burst の再計算が5回より少ない
"use strict";

const path = require("node:path");
const crypto = require("node:crypto");
const { openHarness } = require(path.join(__dirname, "mount-component.js"));

const N_STAFF = 30;
const REPS = Number(process.env.REPS || 5);
const CPU_RATES = (process.env.CPU_RATES || "1,6").split(",").map(Number);
const EXPECT = process.env.PERF_EXPECT || "s3";
const LEVEL = { s1: 1, s2: 2, s3: 3 }[EXPECT] || 3;

// React.memo を包んで、memo 部品ごとの描画回数を数える（ShiftCell は描画されたセルも記録）
const AFTER_REACT = `
window.__rr={};window.__rrKeys=[];
(function(){var m=React.memo;React.memo=function(t,c){if(typeof t!=="function")return m(t,c);var nm=t.name||"anon";
  var w=function(p,r){window.__rr[nm]=(window.__rr[nm]||0)+1;if(nm==="ShiftCell")window.__rrKeys.push(p.name+"|"+p.date+"|"+p.field);return t(p,r);};
  return m(w,c);};})();`;

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
// ShiftEditTab の描画回数を数える（中身はそのまま呼ぶ＝フックは CountedShiftEditTab のものとして動く）
const SET=ShiftEditTab;
function CountedShiftEditTab(p){window.__pr=(window.__pr||0)+1;return SET(p);}
function Harness(){
  const [subs,setSubs]=React.useState(SUBS0);
  const onSave=v=>setSubs(prev=>{const next=(typeof v==="function")?v(prev):v;window.__subs=next;return next;});
  return <CountedShiftEditTab
    subs={subs} periods={[P_OCT,P_SEP]} staffList={STAFF}
    onSave={onSave} tt={m=>{window.__toast=m;}}
    settings={SETTINGS}
    plan="premium" shopId="S1" shopName="計測店" onUpgrade={()=>{}} allLinkedShops={[]}
    onLoadPastSubs={()=>{}} pastSubsLoaded={true}
    savePeriods={()=>{}} ownerReadOnly={false}/>;
}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);
`;

const median = a => { const s = [...a].filter(x => x != null).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const h = await openHarness({ jsx: JSX, waitFor: 'input[data-sc]', viewport: { width: 1400, height: 900 }, afterReact: AFTER_REACT });
  const cdp = await h.page.context().newCDPSession(h.page);
  const hasCellComponent = await h.evaluate(() => typeof ShiftCell !== "undefined");

  // 呼び出し回数のカウンタ。グローバル関数を包む（ShiftEditTab は呼び出し時にグローバルを引く）
  await h.evaluate(() => {
    window.__cnt = {};
    for (const fn of ["laborFindingsFor", "calcNetWorkMinutes", "resolveSubByAlias"]) {
      const orig = window[fn];
      if (typeof orig !== "function") { window.__cnt[fn] = "missing"; continue; }
      window.__cnt[fn] = 0;
      window[fn] = function () { window.__cnt[fn]++; return orig.apply(this, arguments); };
    }
    window.__resetCounters = () => {
      for (const k of Object.keys(window.__cnt)) if (typeof window.__cnt[k] === "number") window.__cnt[k] = 0;
      window.__pr = 0; window.__rr = {}; window.__rrKeys = [];
    };
    window.__q = (n, d, f) => document.querySelector(`input[data-scn="${n}"][data-sc="${d}|${f}"]`);
    // 「計算中」の表示が消え、描き直しが落ち着くまで待つ（S3 より前は表示が無いので即座に返る）
    window.__settle = async (maxMs) => {
      const t0 = performance.now();
      let calm = 0;
      for (;;) {
        await new Promise(r => setTimeout(r, 0));
        const pending = !!document.querySelector("[data-calc-pending]");
        calm = pending ? 0 : calm + 1;
        if (calm >= 3) return { ok: true, sawPendingAtEnd: false };
        if (performance.now() - t0 > maxMs) return { ok: false };
      }
    };
  });
  await h.page.waitForTimeout(500);

  // 表示の指紋（変更前後で一致するか見比べる用）。グリッド・労務判定表・集計を含むタブ全体の文字と、
  // 入力欄の値と背景色、onSave に渡った subs
  const fingerprint = () => h.evaluate(() => {
    const root = document.getElementById("root");
    const inputs = [...root.querySelectorAll("input[data-sc]")].map(i => i.getAttribute("data-scn") + "|" + i.getAttribute("data-sc") + "=" + i.value + "@" + getComputedStyle(i).backgroundColor + "/" + getComputedStyle(i).backgroundImage + "/" + getComputedStyle(i.parentElement).backgroundColor);
    return { text: root.innerText, cells: inputs.join("\n"), nInputs: inputs.length, subs: JSON.stringify(window.__subs || null) };
  });
  const hash = s => crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);
  const fp0 = await fingerprint();

  const snap = () => h.evaluate(() => ({ cnt: { ...window.__cnt }, pr: window.__pr || 0, rr: { ...window.__rr }, keys: [...window.__rrKeys] }));

  // 1回の操作を測る（focus / key）
  const measure = (op, args) => h.evaluate(async ([op, args]) => {
    window.__resetCounters();
    const t0 = performance.now();
    if (op === "focus") { window.__q(...args.cell).focus(); }
    else if (op === "key") {
      const el = window.__q(...args.cell);
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, args.value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
    await new Promise(r => setTimeout(r, 0));
    const t1 = performance.now();
    return { ms: +(t1 - t0).toFixed(1), cnt: { ...window.__cnt }, pr: window.__pr || 0, rr: { ...window.__rr }, keys: [...window.__rrKeys] };
  }, [op, args]);

  // 確定して次のセルへ。同期描画が済んだ時点（urgent）と、重い計算まで済んだ時点（settled）を分けて測る
  const measureCommit = (args) => h.evaluate(async ([args]) => {
    window.__resetCounters();
    const prev = window.__q(...args.prev), next = window.__q(...args.next);
    const t0 = performance.now();
    next.focus();
    await Promise.resolve(); await Promise.resolve();
    const t1 = performance.now();
    const urgent = { cnt: { ...window.__cnt }, focusMoved: document.activeElement === next, prevVal: prev.value, pending: !!document.querySelector("[data-calc-pending]") };
    const st = await window.__settle(15000);
    const t2 = performance.now();
    return { urgentMs: +(t1 - t0).toFixed(1), settledMs: +(t2 - t0).toFixed(1), urgent, settled: st.ok, cnt: { ...window.__cnt }, pr: window.__pr || 0 };
  }, [args]);

  // 確定の 60ms 後に打った1文字が処理されるまで（ページの時刻と Node の時刻はどちらもシステム時刻）
  const measureKeyAfterCommit = async (args) => {
    const orig = await h.evaluate(([args]) => {
      window.__inAt = null;
      const next = window.__q(...args.next);
      next.addEventListener("input", () => { if (window.__inAt == null) window.__inAt = performance.timeOrigin + performance.now(); }, { once: true });
      setTimeout(() => { window.__c0 = performance.timeOrigin + performance.now(); next.focus(); }, 0);
      return next.value;
    }, [args]);
    await sleep(60);
    const sent = Date.now();
    await h.page.keyboard.insertText("5");
    await h.evaluate(() => window.__settle(15000));
    const r = await h.evaluate(() => ({ inAt: window.__inAt, c0: window.__c0 }));
    // 打った文字を元に戻して確定する（変更前と同じ操作列にするため。値は打つ前と同じ）
    await h.evaluate(([args, orig]) => {
      const el = window.__q(...args.next);
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, orig);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.blur();
    }, [args, orig]);
    await h.evaluate(() => window.__settle(15000));
    return { handledAfterCommitMs: r.inAt && r.c0 ? +(r.inAt - r.c0).toFixed(1) : null, blockedMs: r.inAt ? +(r.inAt - sent).toFixed(1) : null };
  };

  // 5セル続けて「値を打って Enter」（出勤→退勤→翌日の出勤…）
  const measureBurst = async (name, date0) => {
    await h.evaluate(([n, d]) => { window.__q(n, d, "start").focus(); }, [name, date0]);
    await h.evaluate(() => window.__settle(15000));
    await h.evaluate(() => window.__resetCounters());
    const t0 = Date.now();
    const vals = ["10", "19", "11", "20", "12"];
    for (const v of vals) {
      await h.page.keyboard.press("ControlOrMeta+A");
      await h.page.keyboard.insertText(v);
      await h.page.keyboard.press("Enter");
    }
    const tTyped = Date.now();
    await h.evaluate(() => window.__settle(20000));
    const tSettled = Date.now();
    const s = await snap();
    await h.evaluate(() => document.activeElement && document.activeElement.blur());
    await h.evaluate(() => window.__settle(15000));
    return { typedMs: tTyped - t0, settledMs: tSettled - t0, laborFindingsFor: s.cnt.laborFindingsFor, recomputes: +(s.cnt.laborFindingsFor / N_STAFF).toFixed(2), parentRenders: s.pr };
  };

  const results = {};
  for (const rate of CPU_RATES) {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate });
    const rec = { focus: [], key: [], commit: [], keyAfterCommit: [] };
    for (let i = 0; i < REPS; i++) {
      // 毎回ちがう人・日のセルを使う（同じセルを打ち直すと2回目以降の状態が変わるため）
      const name = "スタッフ" + String(i + 1 + rate).padStart(2, "0");
      const date = "2026-10-" + String(10 + i).padStart(2, "0");
      const A = [name, date, "start"], B = [name, date, "end"];
      rec.focus.push(await measure("focus", { cell: A }));
      rec.key.push(await measure("key", { cell: A, value: "1" }));
      rec.key.push(await measure("key", { cell: A, value: "11" }));
      rec.commit.push(await measureCommit({ prev: A, next: B }));
      await h.evaluate(() => document.activeElement && document.activeElement.blur());
      await h.evaluate(() => window.__settle(15000));
      await h.page.waitForTimeout(100);
      // 確定の直後に打つ: 翌日の出勤を選んでおき、退勤へ移る確定の 60ms 後に1文字打つ
      const name2 = "スタッフ" + String(12 + i + rate).padStart(2, "0");
      const C = [name2, "2026-10-" + String(20 + i).padStart(2, "0"), "start"], D = [name2, C[1], "end"];
      await h.evaluate(([c]) => { const el = window.__q(...c); el.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, "13"); el.dispatchEvent(new Event("input", { bubbles: true })); }, [C]);
      await h.evaluate(() => window.__settle(15000));
      rec.keyAfterCommit.push(await measureKeyAfterCommit({ next: D }));
      await h.page.waitForTimeout(100);
    }
    const sum = arr => ({
      medianMs: median(arr.map(x => x.ms)), maxMs: Math.max(...arr.map(x => x.ms)),
      laborFindingsFor: { median: median(arr.map(x => x.cnt.laborFindingsFor)), max: Math.max(...arr.map(x => x.cnt.laborFindingsFor)) },
      calcNetWorkMinutes: median(arr.map(x => x.cnt.calcNetWorkMinutes)),
      resolveSubByAlias: median(arr.map(x => x.cnt.resolveSubByAlias)),
      parentRenders: { median: median(arr.map(x => x.pr)), max: Math.max(...arr.map(x => x.pr)) },
      shiftCellRenders: hasCellComponent ? { median: median(arr.map(x => x.rr.ShiftCell || 0)), max: Math.max(...arr.map(x => x.rr.ShiftCell || 0)) } : null,
      cellTipRenders: hasCellComponent ? median(arr.map(x => x.rr.CellTip || 0)) : null,
      // 描き直されたセル部品が操作したセルだけか（同じセルが2回描かれるのは可）
      onlyTargetCell: hasCellComponent ? arr.every((x, k) => x.keys.every(kk => kk === x.target)) : null,
    });
    // 対象セルの key を記録しておく（onlyTargetCell の判定用）
    rec.focus.forEach((x, k) => { x.target = "スタッフ" + String(k + 1 + rate).padStart(2, "0") + "|2026-10-" + String(10 + k).padStart(2, "0") + "|start"; });
    rec.key.forEach((x, k) => { const kk = Math.floor(k / 2); x.target = "スタッフ" + String(kk + 1 + rate).padStart(2, "0") + "|2026-10-" + String(10 + kk).padStart(2, "0") + "|start"; });
    const commitSum = {
      urgentMs: median(rec.commit.map(x => x.urgentMs)), urgentMaxMs: Math.max(...rec.commit.map(x => x.urgentMs)),
      settledMs: median(rec.commit.map(x => x.settledMs)), settledMaxMs: Math.max(...rec.commit.map(x => x.settledMs)),
      urgentLaborFindingsFor: Math.max(...rec.commit.map(x => x.urgent.cnt.laborFindingsFor)),
      totalLaborFindingsFor: { median: median(rec.commit.map(x => x.cnt.laborFindingsFor)), max: Math.max(...rec.commit.map(x => x.cnt.laborFindingsFor)) },
      focusMovedBeforeSettle: rec.commit.every(x => x.urgent.focusMoved && x.urgent.prevVal === "11"),
      pendingShown: rec.commit.every(x => x.urgent.pending),
      allSettled: rec.commit.every(x => x.settled),
      parentRenders: median(rec.commit.map(x => x.pr)),
    };
    const kac = {
      handledAfterCommitMs: median(rec.keyAfterCommit.map(x => x.handledAfterCommitMs)),
      blockedMs: median(rec.keyAfterCommit.map(x => x.blockedMs)), blockedMaxMs: Math.max(...rec.keyAfterCommit.map(x => x.blockedMs || 0)),
    };
    const burst = await measureBurst("スタッフ" + String(20 + rate).padStart(2, "0"), "2026-10-03");
    results["cpu" + rate + "x"] = { focus: sum(rec.focus), key: sum(rec.key), commit: commitSum, keyAfterCommit: kac, burst };
  }
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  await h.page.waitForTimeout(300);
  await h.evaluate(() => window.__settle(15000));
  const fp1 = await fingerprint();

  const all = Object.values(results);
  const verdict = {
    focusNoLabor: all.every(r => r.focus.laborFindingsFor.max === 0),
    keyNoLabor: all.every(r => r.key.laborFindingsFor.max === 0),
    noErrors: h.errors.length === 0,
  };
  if (LEVEL >= 2) {
    verdict.focusNoParentRender = all.every(r => r.focus.parentRenders.max === 0);
    verdict.keyNoParentRender = all.every(r => r.key.parentRenders.max === 0);
    verdict.onlyTargetCellRerenders = all.every(r => r.focus.onlyTargetCell === true && r.key.onlyTargetCell === true && r.focus.shiftCellRenders.max >= 1 && r.key.shiftCellRenders.max >= 1);
  }
  if (LEVEL >= 3) {
    verdict.urgentRenderNoLabor = all.every(r => r.commit.urgentLaborFindingsFor === 0);
    verdict.focusMovesBeforeRecompute = all.every(r => r.commit.focusMovedBeforeSettle);
    verdict.pendingShownThenCleared = all.every(r => r.commit.pendingShown && r.commit.allSettled);
    verdict.commitStillRecomputes = all.every(r => r.commit.totalLaborFindingsFor.max > 0);
    verdict.burstFewerRecomputes = all.every(r => r.burst.recomputes < 5);
  }
  verdict.allPass = Object.values(verdict).every(Boolean);
  console.log(JSON.stringify({
    root: process.env.SHIFTY_ROOT || "(repo)", expect: EXPECT, staff: N_STAFF, days: 31, reps: REPS, nInputs: fp0.nInputs, hasCellComponent,
    results,
    fingerprint: { mountText: hash(fp0.text), mountCells: hash(fp0.cells), afterText: hash(fp1.text), afterCells: hash(fp1.cells), afterSubs: hash(fp1.subs) },
    verdict, errors: h.errors,
  }, null, 2));
  await h.close();
  process.exit(verdict.allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
