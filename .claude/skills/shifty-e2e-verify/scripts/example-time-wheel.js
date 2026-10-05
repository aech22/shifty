// 時刻の2列ホイール（2026-10-05 ユーザー指示「時間と分をそれぞれ選べるように。最初と最後で止まる。シフト提出は従来どおりの刻み、マイシフトは1分刻み」）の
// シフト提出側の回帰テスト。マイシフト側（1分刻み）は example-my-manual.js の B・C・I が測る。アプリ全体をスタブ Firebase で動かす（Firebase へは1バイトも出ない）。
//
//  S（個別URLの「提出」タブ・375px）: 出勤・退勤は select ではなくホイールのボタン。出勤の分は 00・30、退勤の分は 00・15・30・45（従来の TO_START・TO）。
//     時は 0〜27 で、27時は 00 分だけ。指で回して端まで行くと先頭・末尾で止まる。Esc で取り消すと値は変わらない。
//     出勤 18:30・退勤 22:45 を選んで提出すると、提出の shifts[今日] に入る。ダイアログは横にはみ出さない
//  C（提出状況一覧のセル編集＝CellEditPanel だけをマウント）: 出勤・退勤もホイール（TO＝15分刻み）。刻みに合わない今の値（18:10）は選択肢に足して保つ。
//     ダイアログの背景をタップしてもセル編集の画面は閉じない（ポータル越しのクリックを止める）
//  K（候補タブ＝CandTab だけをマウント・375px・2026-10-05 ユーザー指示「候補タブの時間設定もホイールで」）: 全体・曜日別・日付別・休憩の
//     時刻欄（8つ）が select ではなくホイール（TO＝15分刻み・0〜27時）。全体で 9:15〜14:45 を選んで追加すると candidates に入る。
//     退勤のホイールは出勤の値から始まる。ホイールを開いたまま親が描き直してもホイールは閉じない。休憩 12:00〜13:00 を追加すると breakTimes に入る
//  D（提出一覧の詳細画面＝SubsTab だけをマウント・375px・2026-10-05）: 出勤・退勤の調整値もホイール（TO＝15分）。未調整は「提出値」と出て、
//     開くと提出値（刻みに合わない 18:10 は寄せる）から始まる。選ぶと adjustedEnd に入り、「提出値に戻す」で消える。未調整のときは戻すボタンを出さない。
//     ホイールの背景をタップしても詳細画面は閉じない
//  すべての場面で console.error・pageerror が 0 件
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-time-wheel.js → allPass=true / EXIT=0
// 反証: SHIFTY_ROOT=<8cbeb56 の配信物> node ... → EXIT=1（ホイールが無い）
"use strict";
const path = require("node:path");
const { openHarness, REPO_ROOT } = require(path.join(__dirname, "mount-component.js"));
const { makeStub } = require(path.join(__dirname, "stub-firebase.js"));
const ROOT = process.env.SHIFTY_ROOT || REPO_ROOT;
const SCRIPTS = ["app-utils.js", "app-my-utils.js", "app-core.js", "app-staff.js", "app-admin.js", "app-shift.js", "app-company.js", "app-my.js", "app-main.js"].map(src => ({ src, babel: !/utils|core/.test(src) }));
const PHONE = { width: 375, height: 812 };
const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWx";
const pad = n => String(n).padStart(2, "0");
const now = new Date();
const TODAY = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const YM = TODAY.slice(0, 7);
const LAST = `${YM}-${pad(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate())}`;
const seed = () => ({
  global: { shops: { S1: { id: "S1", name: "A店" } } },
  shops: {
    S1: { owners: { OWN: "K1" }, private: { adminKey: "K1" }, staff: ["田中", "佐藤"],
      settings: { shopId: "S1", candidates: [{ start: "10:00", end: "15:00" }] },
      periods: { p1: { id: "p1", urlToken: "t1", shopId: "S1", label: "今月", startDate: `${YM}-01`, endDate: LAST, deadlineDate: "", createdAt: "2026-09-01T00:00:00.000Z" } },
      subs: { s1: { id: "s1", periodId: "p1", shopId: "S1", staffName: "田中", submittedAt: "2026-09-02T00:00:00Z", shifts: { [TODAY]: { status: "work", start: "10:00", end: "15:00" } } } },
      staffPages: { [TOKEN]: { status: "approved", displayName: "田中", name: "田中", requestedAt: "t", approvedAt: "2026-10-01T00:00:00.000Z", byUid: "OWN" } } },
  },
  staffPageTokens: { [TOKEN]: { shopId: "S1", at: "t" } },
  tokens: { t1: { shopId: "S1", periodId: "p1" } },
  accounts: { S1: { plan: "premium" } },
});
const hashHead = h => `<script>history.replaceState(null,"","/${h}");</script>`;
const sleep = (h, ms) => h.page.waitForTimeout(ms);
const waitSel = (h, s, ms = 15000) => h.page.waitForSelector(s, { timeout: ms }).then(() => true, () => false);
const click = (h, sel) => h.evaluate(sel => { const e = document.querySelector(sel); if (!e) return false; e.click(); return true; }, sel);
const db = (h, p) => h.evaluate(p => window.__db(p), p);
const wheel = h => h.evaluate(() => { const d = document.querySelector("[data-time-wheel-dialog]"); if (!d) return null;
  const items = c => [...d.querySelectorAll(`[data-time-wheel-col="${c}"] [data-time-wheel-item]`)].map(x => x.getAttribute("data-time-wheel-item"));
  const r = d.getBoundingClientRect();
  return { val: d.getAttribute("data-time-wheel-dialog"), hours: items("h"), mins: items("m"), left: r.left, right: r.right, vw: window.innerWidth }; });
const scrollCol = (h, c, top) => h.evaluate(([c, top]) => { const el = document.querySelector(`[data-time-wheel-col="${c}"]`); el.scrollTop = top; el.dispatchEvent(new Event("scroll")); }, [c, top]);
const pickTime = async (h, sel, v) => {
  if (!await click(h, sel)) throw new Error("時刻の欄が無い " + sel);
  await waitSel(h, "[data-time-wheel-dialog]");
  const [hh, mm] = v.split(":").map(Number);
  await click(h, `[data-time-wheel-col="h"] [data-time-wheel-item="${hh}"]`); await sleep(h, 80);
  await click(h, `[data-time-wheel-col="m"] [data-time-wheel-item="${mm}"]`); await sleep(h, 80);
  const got = await h.evaluate(() => document.querySelector("[data-time-wheel-dialog]").getAttribute("data-time-wheel-dialog"));
  await click(h, "[data-time-wheel-done]"); await sleep(h, 150);
  return got;
};
const valOf = (h, sel) => h.evaluate(sel => { const e = document.querySelector(sel); return e ? e.getAttribute("data-time-wheel-value") : null; }, sel);

(async () => {
  const R = {}, V = {};
  const errs = (k, h) => { R[k + "_errors"] = h.errors.slice(); return h.errors.length === 0; };
  // ---------------- S: 提出タブ ----------------
  {
    const h = await openHarness({ root: ROOT, jsx: "window.__harnessReady=true;", waitFor: '[data-my-view="page"]', viewport: PHONE,
      extraHead: hashHead("#/m/" + TOKEN) + makeStub({ seed: seed(), view: "staff", tab: "periods", auth: "accounts", authSeed: { users: {}, cur: null } }), scripts: SCRIPTS });
    try {
      await sleep(h, 500);
      await click(h, '[data-my-tab="submit"]');
      const S = {};
      const ST = `[data-time-wheel="${TODAY}-start"]`, EN = `[data-time-wheel="${TODAY}-end"]`;
      S.fields = await waitSel(h, ST, 8000) && await waitSel(h, EN, 3000);
      S.noSelect = await h.evaluate(d => !document.querySelector(`select[data-time-wheel]`) && !!document.querySelector(`button[data-time-wheel="${d}-start"]`), TODAY);
      S.before = [await valOf(h, ST), await valOf(h, EN)];
      // 出勤のホイール
      await click(h, ST); await waitSel(h, "[data-time-wheel-dialog]");
      S.startOpen = await wheel(h);
      await scrollCol(h, "h", 99999); await sleep(h, 450); S.startHourEnd = await wheel(h);
      await scrollCol(h, "h", 0); await sleep(h, 450); S.startHourStart = await wheel(h);
      await scrollCol(h, "h", 44 * 18); await sleep(h, 450);
      await scrollCol(h, "m", 99999); await sleep(h, 450); S.startMinEnd = await wheel(h);
      await h.page.keyboard.press("Escape"); await sleep(h, 150);
      S.afterEsc = { open: !!(await wheel(h)), val: await valOf(h, ST) };
      // 退勤のホイール
      await click(h, EN); await waitSel(h, "[data-time-wheel-dialog]");
      S.endOpen = await wheel(h);
      await click(h, "[data-time-wheel-overlay]"); await sleep(h, 150);
      S.afterBackdrop = { open: !!(await wheel(h)), val: await valOf(h, EN) };
      // 選んで提出
      S.pickStart = await pickTime(h, ST, "18:30");
      S.pickEnd = await pickTime(h, EN, "22:45");
      S.after = [await valOf(h, ST), await valOf(h, EN)];
      S.overflow = await h.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
      await h.evaluate(() => { const b = [...document.querySelectorAll("[data-staff-submit-bar] button")].find(x => /シフトを提出する/.test(x.innerText)); b.click(); });
      await sleep(h, 200);
      await h.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /^提出する$/.test(x.innerText.trim())); if (b) b.click(); });
      await sleep(h, 600);
      const subs = await db(h, "shops/S1/subs") || {};
      const mine = Object.values(subs).find(s => s && s.staffName === "田中" && s.periodId === "p1");
      S.saved = mine && mine.shifts && mine.shifts[TODAY];
      R.S = S;
      V.S_wheelNotSelect = S.fields && S.noSelect && JSON.stringify(S.before) === JSON.stringify(["10:00", "15:00"]);
      V.S_startStep30 = !!S.startOpen && S.startOpen.val === "10:00" && JSON.stringify(S.startOpen.mins) === '["0","30"]' &&
        S.startOpen.hours[0] === "0" && S.startOpen.hours[S.startOpen.hours.length - 1] === "27";
      V.S_stopsAtEnds = S.startHourEnd.val === "27:00" && JSON.stringify(S.startHourEnd.mins) === '["0"]' && S.startHourStart.val === "00:00" && S.startMinEnd.val === "18:30";
      V.S_escCancels = !S.afterEsc.open && S.afterEsc.val === "10:00";
      V.S_endStep15 = !!S.endOpen && S.endOpen.val === "15:00" && JSON.stringify(S.endOpen.mins) === '["0","15","30","45"]' && !S.afterBackdrop.open && S.afterBackdrop.val === "15:00";
      V.S_pickAndSubmit = S.pickStart === "18:30" && S.pickEnd === "22:45" && JSON.stringify(S.after) === JSON.stringify(["18:30", "22:45"]) &&
        !!S.saved && S.saved.start === "18:30" && S.saved.end === "22:45";
      V.S_layout375 = S.startOpen.left >= 0 && S.startOpen.right <= S.startOpen.vw && S.overflow <= 0;
      V.S_noErrors = errs("S", h);
    } finally { await h.browser.close(); }
  }
  // ---------------- C: 提出状況一覧のセル編集（CellEditPanel だけ）----------------
  {
    const jsx = `function Harness(){const[closed,setClosed]=React.useState(0);
      return closed?<div data-cell-closed="1">closed</div>:<CellEditPanel sub={{staffName:"田中"}} s={{status:"work",start:"18:10",end:"22:00"}} d={new Date(2026,9,12)}
        onApply={(st,a,b)=>{window.__applied=[st,a,b];}} onClose={()=>setClosed(1)}/>;}
      ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);window.__harnessReady=true;`;
    const h = await openHarness({ root: ROOT, jsx, waitFor: '[data-time-wheel="cell-start"]', viewport: PHONE,
      scripts: SCRIPTS.filter(s => s.src !== "app-main.js") });
    try {
      const C = {};
      C.vals = [await valOf(h, '[data-time-wheel="cell-start"]'), await valOf(h, '[data-time-wheel="cell-end"]')];
      await click(h, '[data-time-wheel="cell-start"]'); await waitSel(h, "[data-time-wheel-dialog]");
      C.open = await wheel(h);
      await click(h, "[data-time-wheel-overlay]"); await sleep(h, 150);
      C.panelStays = await h.evaluate(() => !document.querySelector("[data-cell-closed]") && !document.querySelector("[data-time-wheel-dialog]"));
      C.pick = await pickTime(h, '[data-time-wheel="cell-end"]', "23:15");
      C.panelStays2 = await h.evaluate(() => !document.querySelector("[data-cell-closed]"));
      await h.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /確定/.test(x.innerText)); b.click(); });
      await sleep(h, 150);
      C.applied = await h.evaluate(() => window.__applied || null);
      R.C = C;
      V.C_wheelKeepsOffStep = JSON.stringify(C.vals) === JSON.stringify(["18:10", "22:00"]) && !!C.open && C.open.val === "18:10" &&
        JSON.stringify(C.open.mins) === '["0","10","15","30","45"]';
      V.C_backdropKeepsPanel = C.panelStays && C.panelStays2;
      V.C_apply = C.pick === "23:15" && JSON.stringify(C.applied) === JSON.stringify(["work", "18:10", "23:15"]);
      V.C_noErrors = errs("C", h);
    } finally { await h.browser.close(); }
  }
  // ---------------- K: 候補タブ（CandTab だけ）----------------
  {
    const jsx = `function Harness(){const[s,setS]=React.useState({shopId:"S1",candidates:[]});const[n,setN]=React.useState(0);window.__bump=()=>setN(x=>x+1);
      return <div data-bump={n}><CandTab settings={s} onSave={v=>{window.__saved=v;setS(v);}} tt={m=>{window.__tt=m;}} plan="premium" periods={[]}/></div>;}
      ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);window.__harnessReady=true;`;
    const h = await openHarness({ root: ROOT, jsx, waitFor: '[data-time-wheel="cand-global-start"]', viewport: PHONE,
      scripts: SCRIPTS.filter(s => s.src !== "app-main.js") });
    const modeBtn = l => h.evaluate(l => { const b = [...document.querySelectorAll("button")].find(x => x.innerText.trim() === l); if (b) b.click(); return !!b; }, l);
    const addBtn = () => h.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /＋ 追加/.test(x.innerText)); if (b) b.click(); return !!b; });
    try {
      const K = { fields: {} };
      K.noSelectTimes = await h.evaluate(() => [...document.querySelectorAll("select")].every(sel => ![...sel.options].some(o => o.value === "10:00")));
      await click(h, '[data-time-wheel="cand-global-start"]'); await waitSel(h, "[data-time-wheel-dialog]");
      K.openStart = await wheel(h);
      await h.evaluate(() => window.__bump()); await sleep(h, 150);
      K.staysOpenOnRerender = !!(await wheel(h));
      await click(h, "[data-time-wheel-overlay]"); await sleep(h, 120);
      K.pickStart = await pickTime(h, '[data-time-wheel="cand-global-start"]', "09:15");
      await click(h, '[data-time-wheel="cand-global-end"]'); await waitSel(h, "[data-time-wheel-dialog]");
      K.endStartsAt = (await wheel(h)).val;
      await h.page.keyboard.press("Escape"); await sleep(h, 120);
      K.pickEnd = await pickTime(h, '[data-time-wheel="cand-global-end"]', "14:45");
      await addBtn(); await sleep(h, 200);
      K.candidates = await h.evaluate(() => (window.__saved && window.__saved.candidates) || null);
      K.resetAfterAdd = await valOf(h, '[data-time-wheel="cand-global-start"]');
      for (const [l, n] of [["曜日別", "weekday"], ["日付別", "date"], ["休憩", "break"]]) {
        await modeBtn(l); await sleep(h, 200);
        K.fields[n] = await h.evaluate(n => !!document.querySelector(`button[data-time-wheel="cand-${n}-start"]`) && !!document.querySelector(`button[data-time-wheel="cand-${n}-end"]`), n);
      }
      K.pickBrk = [await pickTime(h, '[data-time-wheel="cand-break-start"]', "12:00"), await pickTime(h, '[data-time-wheel="cand-break-end"]', "13:00")];
      await addBtn(); await sleep(h, 200);
      K.breaks = await h.evaluate(() => (window.__saved && window.__saved.breakTimes && window.__saved.breakTimes.weekday) || null);
      K.overflow = await h.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
      R.K = K;
      V.K_wheelNotSelect = K.noSelectTimes && !!K.openStart && K.openStart.val === "10:00" && JSON.stringify(K.openStart.mins) === '["0","15","30","45"]' &&
        K.openStart.hours[0] === "0" && K.openStart.hours[K.openStart.hours.length - 1] === "27" && Object.values(K.fields).every(Boolean);
      V.K_staysOpen = K.staysOpenOnRerender;
      V.K_addGlobal = K.pickStart === "09:15" && K.pickEnd === "14:45" && K.endStartsAt === "09:15" &&
        JSON.stringify(K.candidates) === JSON.stringify([{ start: "09:15", end: "14:45" }]) && K.resetAfterAdd === "";
      V.K_addBreak = JSON.stringify(K.pickBrk) === JSON.stringify(["12:00", "13:00"]) && JSON.stringify(K.breaks) === JSON.stringify([{ start: "12:00", end: "13:00" }]);
      V.K_layout375 = K.overflow <= 0 && K.openStart.left >= 0 && K.openStart.right <= K.openStart.vw;
      V.K_noErrors = errs("K", h);
    } finally { await h.browser.close(); }
  }
  // ---------------- D: 提出一覧の詳細画面（SubsTab だけ）----------------
  {
    const jsx = `const P={id:"p1",urlToken:"t1",shopId:"S1",label:"10月",startDate:"2026-10-01",endDate:"2026-10-31",deadlineDate:"",createdAt:"2026-09-01T00:00:00.000Z"};
      const SUBS=[{id:"s1",periodId:"p1",staffName:"田中",shopId:"S1",comment:"",submittedAt:"2026-09-02T00:00:00.000Z",
        shifts:{"2026-10-01":{status:"work",start:"09:00",end:"18:10"}}}];
      const SETTINGS={shopId:"S1",candidates:[],weekdayCandidates:{},dateCandidates:{},breakTimes:{weekday:[],sat:[],sun:[],holSat:[],holSun:[]},
        staffAttributes:{},staffTypeLimits:{},staffColors:{},staffAliases:{},positions:{kitchen:[],hall:[]},requiredPositions:{},staffPositions:{}};
      function Harness(){const[subs,setSubs]=React.useState(SUBS);window.__subs=subs;
        return <SubsTab subs={subs} periods={[P]} staffList={["田中"]} tt={()=>{}} plan="premium" settings={SETTINGS} onSaveSettings={()=>{}} pastSubsLoaded={true}
          onSave={v=>setSubs(p=>{const n=typeof v==="function"?v(p):v;window.__subs=n;return n;})}/>;}
      ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);window.__harnessReady=true;`;
    const h = await openHarness({ root: ROOT, jsx, waitFor: "table", viewport: PHONE, scripts: SCRIPTS.filter(s => s.src !== "app-main.js") });
    try {
      const D = {};
      await h.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => x.innerText.trim() === "詳細"); if (b) b.click(); });
      const ST = '[data-time-wheel="adj-2026-10-01-start"]', EN = '[data-time-wheel="adj-2026-10-01-end"]';
      D.fields = await waitSel(h, ST, 8000) && await waitSel(h, EN, 3000);
      D.noSelect = await h.evaluate(() => ![...document.querySelectorAll("select")].some(sel => [...sel.options].some(o => o.value === "18:00")));
      D.label = await h.evaluate(sel => document.querySelector(sel).innerText.trim(), EN);
      await click(h, EN); await waitSel(h, "[data-time-wheel-dialog]");
      D.open = await wheel(h);
      D.noClearWhenEmpty = await h.evaluate(() => !document.querySelector("[data-time-wheel-clear]"));
      await click(h, "[data-time-wheel-overlay]"); await sleep(h, 150);
      D.modalStays = await h.evaluate(sel => !!document.querySelector(sel) && !document.querySelector("[data-time-wheel-dialog]"), EN);
      D.pick = await pickTime(h, EN, "20:45");
      D.saved = await h.evaluate(() => window.__subs[0].shifts["2026-10-01"].adjustedEnd || null);
      D.valAfter = await valOf(h, EN);
      await click(h, EN); await waitSel(h, "[data-time-wheel-dialog]");
      D.hasClear = await h.evaluate(() => !!document.querySelector("[data-time-wheel-clear]"));
      await click(h, "[data-time-wheel-clear]"); await sleep(h, 200);
      D.afterClear = await h.evaluate(() => window.__subs[0].shifts["2026-10-01"].adjustedEnd);
      D.valCleared = await valOf(h, EN);
      D.submitted = await h.evaluate(() => window.__subs[0].shifts["2026-10-01"].end);
      D.overflow = await h.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
      R.D = D;
      V.D_wheelNotSelect = D.fields && D.noSelect && D.label === "提出値" && !!D.open && D.open.val === "18:15" && JSON.stringify(D.open.mins) === '["0","15","30","45"]' && D.noClearWhenEmpty;
      V.D_backdropKeepsModal = D.modalStays;
      V.D_pickAndClear = D.pick === "20:45" && D.saved === "20:45" && D.valAfter === "20:45" && D.hasClear && D.afterClear === undefined && D.valCleared === "" && D.submitted === "18:10";
      V.D_layout375 = D.open.left >= 0 && D.open.right <= D.open.vw;
      V.D_noErrors = errs("D", h);
    } finally { await h.browser.close(); }
  }
  const allPass = Object.values(V).every(Boolean);
  console.log(JSON.stringify({ allPass, verdict: V, results: R }, null, 1));
  process.exit(allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
