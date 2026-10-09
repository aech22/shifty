// 試作（KB_TRIAL・2026-10-09）: iPhone でセルを移ってもキーボードを戻さないための「入力欄1つ」方式の回帰。
// 試作を入れた端末（localStorage ots_kbTrial_v1=1）では、セルを選ぶと入力欄（data-kb-trial）にフォーカスが移り、
// Enter でフォーカスは同じ要素のまま次のセルの上へ動くこと（要点）・値は今までどおり確定すること・
// 入れていない端末では今までどおり（入力欄が無く、セル自身にフォーカスが残る）ことを確かめる。
//   node .claude/skills/shifty-e2e-verify/scripts/example-kb-trial.js
//   SHIFTY_ENGINE=webkit SHIFTY_DEVICE="iPhone 13" node .../example-kb-trial.js
"use strict";
const path = require("node:path");
const { openHarness } = require(path.join(__dirname, "mount-component.js"));

const JSX = `
const NAMES=["佐藤","鈴木"];
const days=(a,b)=>{const o=[];const d=new Date(a+"T00:00:00");const e=new Date(b+"T00:00:00");while(d<=e){o.push(d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"));d.setDate(d.getDate()+1);}return o;};
const P_A={id:"pA",urlToken:"tA",shopId:"S1",label:"2099年1月前半",startDate:"2099-01-01",endDate:"2099-01-15",deadlineDate:"",createdAt:"2098-12-01T00:00:00.000Z"};
const SUBS0=NAMES.map((n,i)=>({id:"s_"+i,periodId:"pA",staffName:n,shopId:"S1",comment:"",submittedAt:"2098-12-20T00:00:00.000Z",
  shifts:Object.fromEntries(days(P_A.startDate,P_A.endDate).map(d=>[d,{status:"work",start:"09:00",end:"18:00"}]))}));
const SETTINGS={candidates:[{start:"09:00",end:"18:00"}],weekdayCandidates:{},dateCandidates:{},templates:[],breakTimes:{},staffAttributes:{}};
function Harness(){
  const [subs,setSubs]=React.useState(SUBS0);
  const onSave=v=>setSubs(prev=>{const next=(typeof v==="function")?v(prev):v;window.__subs=next;return next;});
  return <ShiftEditTab subs={subs} periods={[P_A]} staffList={NAMES} onSave={onSave} tt={()=>{}} settings={SETTINGS}
    plan="premium" shopId="S1" shopName="検証店" onUpgrade={()=>{}} allLinkedShops={[]} onLoadPastSubs={()=>{}} pastSubsLoaded={true}
    savePeriods={()=>{}} ownerReadOnly={false}/>;
}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);
`;

async function run(trial) {
  const h = await openHarness({ jsx: JSX, waitFor: "input[data-sc]", viewport: { width: 1400, height: 900 },
    afterReact: trial ? 'localStorage.setItem("ots_kbTrial_v1","1");' : 'localStorage.removeItem("ots_kbTrial_v1");' });
  const p = h.page, ev = (fn, a) => h.evaluate(fn, a), wait = ms => p.waitForTimeout(ms);
  const sel = (n, d, f) => `input[data-scn="${n}"][data-sc="${d}|${f}"]`;
  const shiftOf = (n, d) => ev(([n, d]) => { const s = (window.__subs || []).find(x => x.staffName === n); return s ? s.shifts[d] : null; }, [n, d]);
  // 入力欄がどのセルの上にあるか（左上が一致するセル）
  const overCell = () => ev(() => {
    const a = document.activeElement; if (!a || !a.dataset) return "";
    if (a.dataset.sc) return "cell:" + a.dataset.scn + "|" + a.dataset.sc;
    if (a.dataset.kbTrial !== "1") return "other";
    const r = a.getBoundingClientRect();
    const c = [...document.querySelectorAll("input[data-sc]")].find(x => { const q = x.getBoundingClientRect(); return Math.abs(q.left - r.left) < 1 && Math.abs(q.top - r.top) < 1; });
    return c ? "editor:" + c.dataset.scn + "|" + c.dataset.sc : "editor:?";
  });
  const r = {};
  await p.click(sel("佐藤", "2099-01-02", "start")); await wait(100);
  const firstActive = await ev(() => document.activeElement);
  const startEl = await p.evaluateHandle(() => document.activeElement);
  r.focusTarget = await overCell();
  if (trial) {
    await ev(() => { window.__el = document.activeElement; });
    await p.keyboard.press("ControlOrMeta+A"); await p.keyboard.insertText("10"); await p.keyboard.press("Enter"); await wait(150);
    r.a_movedToEnd = await overCell();
    r.a_sameElement = await ev(() => document.activeElement === window.__el);
    r.a_valueIsNext = await ev(() => document.activeElement.value);
    await p.keyboard.press("ControlOrMeta+A"); await p.keyboard.insertText("19"); await p.keyboard.press("Enter"); await wait(150);
    r.b_movedToNextStart = await overCell();
    r.b_sameElement = await ev(() => document.activeElement === window.__el);
    r.c_committed = await shiftOf("佐藤", "2099-01-02");
    r.c_shown = await ev(([a, b]) => [document.querySelector(a).value, document.querySelector(b).value], [sel("佐藤", "2099-01-02", "start"), sel("佐藤", "2099-01-02", "end")]);
    await p.keyboard.press("ControlOrMeta+Enter"); await wait(150);
    r.d_back = await overCell();
    // IME 変換中の Enter は移動しない
    await ev(() => document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true, cancelable: true }))); await wait(80);
    r.e_imeStays = await overCell();
    // 別のセルをタップすると、入力中の値を確定してそのセルへ
    await p.keyboard.press("ControlOrMeta+A"); await p.keyboard.insertText("20");
    await p.click(sel("鈴木", "2099-01-05", "start")); await wait(150);
    r.f_tapOther = await overCell();
    r.f_committedOnTap = (await shiftOf("佐藤", "2099-01-02")).adjustedEnd;
    await ev(() => document.activeElement.blur()); await wait(150);
    r.g_hiddenAfterBlur = await ev(() => { const e = document.querySelector("[data-kb-trial]"); return e.getBoundingClientRect().left < -1000; });
  } else {
    r.noEditor = await ev(() => !document.querySelector("[data-kb-trial]"));
    await p.keyboard.press("ControlOrMeta+A"); await p.keyboard.insertText("10"); await p.keyboard.press("Enter"); await wait(150);
    r.a_movedToEnd = await overCell();
    r.c_committed = await shiftOf("佐藤", "2099-01-02");
  }
  r.errors = h.errors;
  await h.close();
  return r;
}

(async () => {
  const on = await run(true), off = await run(false);
  const ok = on.focusTarget === "editor:佐藤|2099-01-02|start" && on.a_movedToEnd === "editor:佐藤|2099-01-02|end" && on.a_sameElement && on.a_valueIsNext === "18"
    && on.b_movedToNextStart === "editor:佐藤|2099-01-03|start" && on.b_sameElement
    && on.c_committed && on.c_committed.adjustedStart === "10:00" && on.c_committed.adjustedEnd === "19:00"
    && on.c_shown[0] === "10" && on.c_shown[1] === "19" && on.d_back === "editor:佐藤|2099-01-02|end" && on.e_imeStays === "editor:佐藤|2099-01-02|end"
    && on.f_tapOther === "editor:鈴木|2099-01-05|start" && on.f_committedOnTap === "20:00" && on.g_hiddenAfterBlur && on.errors.length === 0
    && off.noEditor && off.focusTarget === "cell:佐藤|2099-01-02|start" && off.a_movedToEnd === "cell:佐藤|2099-01-02|end"
    && off.c_committed && off.c_committed.adjustedStart === "10:00" && off.errors.length === 0;
  console.log(JSON.stringify({ on, off, allPass: ok }, null, 1));
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
