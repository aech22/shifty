// シフト作成タブのタッチ用の入力欄（TouchCellEditor・2026-10-10）の回帰。
// iOS は別の入力欄にフォーカスが移るたびにキーボードを「かな」に戻すので、指でタップしたセルだけ入力欄を1つにし、
// 改行ではフォーカスを動かさずにその欄を次のセルの上へ動かす。確かめること:
//   指（pointerType touch）で選ぶと入力欄が出て、改行で移ってもフォーカスは同じ要素のまま・値は今までどおり確定する／
//   ページとグリッドの中をスクロールしても欄がセルの上に残る／IME 変換中の改行では動かない／別のセルを指で選ぶと確定して移る／
//   マウスのクリック・キーボード（focus）で選んだセルは今までどおりセル自身で入力する（入力欄は出ない）／
//   一度指で選んだセルを後からマウスで選んでも、そのセルの確定が効く（フォーカスを渡した印が残らない）。
//   node .claude/skills/shifty-e2e-verify/scripts/example-touch-cell-editor.js
//   SHIFTY_DEVICE="iPhone 13" node .../example-touch-cell-editor.js   （指のタップ＝page.tap でも確かめる）
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

(async () => {
  const h = await openHarness({ jsx: JSX, waitFor: "input[data-sc]", viewport: { width: 1400, height: 900 } });
  const p = h.page, ev = (fn, a) => h.evaluate(fn, a), wait = ms => p.waitForTimeout(ms);
  const hasTouch = await ev(() => navigator.maxTouchPoints > 0);
  const sel = (n, d, f) => `input[data-scn="${n}"][data-sc="${d}|${f}"]`;
  const shiftOf = (n, d) => ev(([n, d]) => { const s = (window.__subs || []).find(x => x.staffName === n); return s ? s.shifts[d] : null; }, [n, d]);
  // 指で選ぶ: 実機と同じく pointerdown（touch）→ focus の順に起こす。タッチの端末では page.tap も使う
  const touchSelect = async (s, real) => {
    if (real && hasTouch) { await p.tap(s); }
    else await ev(([s]) => { const el = document.querySelector(s); el.dispatchEvent(new PointerEvent("pointerdown", { pointerType: "touch", bubbles: true })); el.focus(); }, [s]);
    await wait(120);
  };
  // フォーカスがどこにあるか（入力欄ならどのセルの上か）
  const where = () => ev(() => {
    const a = document.activeElement; if (!a || !a.dataset) return "";
    if (a.dataset.sc) return "cell:" + a.dataset.scn + "|" + a.dataset.sc;
    if (a.dataset.touchEditor !== "1") return "other";
    const r = a.getBoundingClientRect();
    const c = [...document.querySelectorAll("input[data-sc]")].find(x => { const q = x.getBoundingClientRect(); return Math.abs(q.left - r.left) < 1 && Math.abs(q.top - r.top) < 1; });
    return c ? "editor:" + c.dataset.scn + "|" + c.dataset.sc : "editor:?";
  });
  const typeHere = async v => { await p.keyboard.press("ControlOrMeta+A"); await p.keyboard.insertText(v); };
  const r = {};

  // 1. 指で選ぶ → 入力欄。改行で移ってもフォーカスは同じ要素のまま
  await touchSelect(sel("佐藤", "2099-01-02", "start"), true);
  r.t1_editorOnCell = await where();
  await ev(() => { window.__el = document.activeElement; });
  await typeHere("10"); await p.keyboard.press("Enter"); await wait(150);
  r.t2_movedToEnd = await where();
  r.t2_sameElement = await ev(() => document.activeElement === window.__el);
  r.t2_valueIsNext = await ev(() => document.activeElement.value);
  await ev(() => { document.body.style.minHeight = "3000px"; window.scrollBy(0, 150); }); await wait(100);
  r.t3_afterPageScroll = await where();
  await ev(() => { let e = document.querySelector('input[data-sc]'); while (e && !(e.scrollHeight > e.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(e).overflowY))) e = e.parentElement; if (e) e.scrollTop += 40; }); await wait(100);
  r.t3_afterInnerScroll = await where();
  await typeHere("19"); await p.keyboard.press("Enter"); await wait(150);
  r.t4_movedToNextStart = await where();
  r.t4_sameElement = await ev(() => document.activeElement === window.__el);
  r.t5_committed = await shiftOf("佐藤", "2099-01-02");
  r.t5_shown = await ev(([a, b]) => [document.querySelector(a).value, document.querySelector(b).value], [sel("佐藤", "2099-01-02", "start"), sel("佐藤", "2099-01-02", "end")]);
  await p.keyboard.press("ControlOrMeta+Enter"); await wait(150);
  r.t6_back = await where();
  await ev(() => document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true, cancelable: true }))); await wait(80);
  r.t7_imeStays = await where();
  await typeHere("20");
  await touchSelect(sel("鈴木", "2099-01-05", "start"), false);
  r.t8_tapOther = await where();
  r.t8_committedOnTap = (await shiftOf("佐藤", "2099-01-02")).adjustedEnd;
  await ev(() => document.activeElement.blur()); await wait(150);
  r.t9_hiddenAfterBlur = await ev(() => document.querySelector("[data-touch-editor]").getBoundingClientRect().left < -1000);
  await ev(() => window.scrollTo(0, 0)); await wait(80);

  // 2. マウスで選ぶ → 今までどおりセル自身。一度指で選んだセル（佐藤 1/2 出勤）でも確定が効く
  await p.click(sel("佐藤", "2099-01-02", "start")); await wait(120);
  r.m1_cellItself = await where();
  await typeHere("15");
  await p.click(sel("鈴木", "2099-01-07", "end")); await wait(150);
  r.m2_committed = (await shiftOf("佐藤", "2099-01-02")).adjustedStart;
  r.m2_cellItselfAgain = await where();
  await typeHere("21"); await p.keyboard.press("Enter"); await wait(150);
  r.m3_enterMovesCell = await where();
  r.m3_committed = (await shiftOf("鈴木", "2099-01-07")).adjustedEnd;
  await ev(() => document.activeElement.blur()); await wait(100);

  // 3. キーボード（focus だけ・pointerdown なし）→ 今までどおりセル自身
  await p.focus(sel("鈴木", "2099-01-09", "start")); await wait(100);
  r.k1_cellItself = await where();
  // 指で押してから時間が経った focus は指の操作とみなさない
  await ev(([s]) => document.querySelector(s).dispatchEvent(new PointerEvent("pointerdown", { pointerType: "touch", bubbles: true })), [sel("鈴木", "2099-01-10", "start")]);
  await wait(1700);
  await p.focus(sel("鈴木", "2099-01-10", "start")); await wait(100);
  r.k2_staleTouchIgnored = await where();
  r.errors = h.errors;
  await h.close();

  const E = (k, v) => r[k] === v;
  const ok = E("t1_editorOnCell", "editor:佐藤|2099-01-02|start") && E("t2_movedToEnd", "editor:佐藤|2099-01-02|end") && r.t2_sameElement && E("t2_valueIsNext", "18")
    && E("t3_afterPageScroll", "editor:佐藤|2099-01-02|end") && E("t3_afterInnerScroll", "editor:佐藤|2099-01-02|end")
    && E("t4_movedToNextStart", "editor:佐藤|2099-01-03|start") && r.t4_sameElement
    && r.t5_committed && r.t5_committed.adjustedStart === "10:00" && r.t5_committed.adjustedEnd === "19:00" && r.t5_shown[0] === "10" && r.t5_shown[1] === "19"
    && E("t6_back", "editor:佐藤|2099-01-02|end") && E("t7_imeStays", "editor:佐藤|2099-01-02|end")
    && E("t8_tapOther", "editor:鈴木|2099-01-05|start") && E("t8_committedOnTap", "20:00") && r.t9_hiddenAfterBlur
    && E("m1_cellItself", "cell:佐藤|2099-01-02|start") && E("m2_committed", "15:00") && E("m2_cellItselfAgain", "cell:鈴木|2099-01-07|end")
    && E("m3_enterMovesCell", "cell:鈴木|2099-01-08|start") && E("m3_committed", "21:00")
    && E("k1_cellItself", "cell:鈴木|2099-01-09|start") && E("k2_staleTouchIgnored", "cell:鈴木|2099-01-10|start") && r.errors.length === 0;
  console.log(JSON.stringify({ hasTouch, r, allPass: ok }, null, 1));
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
