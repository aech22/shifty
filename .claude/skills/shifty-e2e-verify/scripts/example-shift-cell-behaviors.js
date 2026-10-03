// シフト作成グリッドのセル操作の回帰（S2・2026-10-04）。セルを部品（ShiftCell）に分けても次の動作が変わらないこと:
//   Enter での移動（data-sc）・Ctrl/Cmd+Enter の逆向き・IME 変換中の Enter・「/」の切り替え（Enter の二重 blur でも1回）・
//   店舗と期間を切り替えたときの入力中の文字の破棄・確定済み期間の入力不可・Premium 以外のアップグレード誘導・
//   トリプルクリックの変更マーク・選択中のツールチップ・入力中に「保存」を押したときの件数と保存内容。
// **変更前の配信物でも同じ結果になる**ことを確かめる作り（SHIFTY_ROOT=<変更前> で回して両方 EXIT=0 になること）。
//
//   node .claude/skills/shifty-e2e-verify/scripts/example-shift-cell-behaviors.js
//   SHIFTY_ROOT=<変更前の配信物> node .../example-shift-cell-behaviors.js
"use strict";
const path = require("node:path");
const { openHarness } = require(path.join(__dirname, "mount-component.js"));

const JSX = `
const NAMES=["佐藤","鈴木","高橋"];
const days=(a,b)=>{const o=[];const d=new Date(a+"T00:00:00");const e=new Date(b+"T00:00:00");while(d<=e){o.push(d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"));d.setDate(d.getDate()+1);}return o;};
const P_A={id:"pA",urlToken:"tA",shopId:"S1",label:"2099年1月前半",startDate:"2099-01-01",endDate:"2099-01-15",deadlineDate:"",createdAt:"2098-12-01T00:00:00.000Z"};
const P_B={id:"pB",urlToken:"tB",shopId:"S1",label:"2099年1月後半",startDate:"2099-01-16",endDate:"2099-01-31",deadlineDate:"",createdAt:"2098-12-01T00:00:00.000Z",
  confirmation:{at:"2099-01-10T00:00:00.000Z",byUid:"u1"}};
const mk=(p)=>NAMES.map((n,i)=>({id:"s_"+p.id+"_"+i,periodId:p.id,staffName:n,shopId:"S1",comment:"",submittedAt:"2098-12-20T00:00:00.000Z",
  shifts:Object.fromEntries(days(p.startDate,p.endDate).map((d,k)=>[d,(k+i)%3===2?{status:"holiday"}:{status:"work",start:"09:00",end:"18:00"}]))}));
const SUBS0=[...mk(P_A),...mk(P_B)];
const SETTINGS={candidates:[{start:"09:00",end:"18:00"}],weekdayCandidates:{},dateCandidates:{},templates:[],breakTimes:{},
  staffAttributes:{佐藤:"employee",鈴木:"parttime",高橋:"parttime"}};
function Harness(){
  const [subs,setSubs]=React.useState(SUBS0);
  const [plan,setPlan]=React.useState("premium");
  const [shopId,setShopId]=React.useState("S1");
  window.__setPlan=setPlan;window.__setShop=setShopId;
  const onSave=v=>setSubs(prev=>{const next=(typeof v==="function")?v(prev):v;window.__subs=next;window.__saves=(window.__saves||0)+1;return next;});
  return <ShiftEditTab key="one"
    subs={subs} periods={[P_A,P_B]} staffList={NAMES}
    onSave={onSave} tt={m=>{window.__toast=m;}}
    settings={SETTINGS}
    plan={plan} shopId={shopId} shopName="検証店" onUpgrade={x=>{window.__upg=(window.__upg||0)+1;}} allLinkedShops={[]}
    onLoadPastSubs={()=>{}} pastSubsLoaded={true}
    savePeriods={()=>{}} ownerReadOnly={false}/>;
}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);
`;

(async () => {
  const h = await openHarness({ jsx: JSX, waitFor: 'input[data-sc]', viewport: { width: 1400, height: 900 } });
  const p = h.page;
  const ev = (fn, arg) => h.evaluate(fn, arg);
  const wait = ms => p.waitForTimeout(ms);
  // 重い計算の後回し（S3）を待つ。「計算中」の表示が消えるまで（それより前の版は表示が無いので即座に返る）
  const settle = async () => { for (let i = 0; i < 100; i++) { await wait(30); if (!(await ev(() => !!document.querySelector("[data-calc-pending]")))) return; } };
  const sel = (n, d, f) => `input[data-scn="${n}"][data-sc="${d}|${f}"]`;
  const val = (n, d, f) => ev(([s]) => document.querySelector(s)?.value ?? null, [sel(n, d, f)]);
  const active = () => ev(() => { const a = document.activeElement; return a && a.dataset ? (a.dataset.scn || "") + "|" + (a.dataset.sc || "") : ""; });
  const shiftOf = (n, d) => ev(([n, d]) => { const s = (window.__subs || []).find(x => x.periodId === "pA" && x.staffName === n); return s ? s.shifts[d] || null : null; }, [n, d]);
  const typeInto = async (s, v) => { await p.focus(s); await p.keyboard.press("ControlOrMeta+A"); await p.keyboard.insertText(v); };
  const r = {};

  // 1. Enter で 出勤→同じ日の退勤→翌日の出勤。値は確定（adjustedStart/adjustedEnd）
  await typeInto(sel("佐藤", "2099-01-02", "start"), "10");
  await p.keyboard.press("Enter"); await settle();
  r.a_enterStartToEnd = (await active()) === "佐藤|2099-01-02|end";
  await p.keyboard.press("ControlOrMeta+A"); await p.keyboard.insertText("19");
  await p.keyboard.press("Enter"); await settle();
  r.b_enterEndToNextStart = (await active()) === "佐藤|2099-01-03|start";
  const sh2 = await shiftOf("佐藤", "2099-01-02");
  r.c_enterCommitted = !!sh2 && sh2.adjustedStart === "10:00" && sh2.adjustedEnd === "19:00";
  r.d_valuesShown = (await val("佐藤", "2099-01-02", "start")) === "10" && (await val("佐藤", "2099-01-02", "end")) === "19";
  // Ctrl/Cmd+Enter は逆向き: 出勤→前日の退勤、退勤→同じ日の出勤
  await p.keyboard.press("ControlOrMeta+Enter"); await settle();
  r.e_ctrlEnterStartToPrevEnd = (await active()) === "佐藤|2099-01-02|end";
  await p.keyboard.press("ControlOrMeta+Enter"); await settle();
  r.f_ctrlEnterEndToStart = (await active()) === "佐藤|2099-01-02|start";
  await ev(() => document.activeElement.blur()); await settle();

  // 2. IME 変換中の Enter（isComposing）は確定もしないし移動もしない
  await p.focus(sel("鈴木", "2099-01-04", "start"));
  const savesBefore = await ev(() => window.__saves || 0);
  await ev(([s]) => { const el = document.querySelector(s); el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true, cancelable: true })); }, [sel("鈴木", "2099-01-04", "start")]);
  await wait(50);
  r.g_imeEnterNoMove = (await active()) === "鈴木|2099-01-04|start" && (await ev(() => window.__saves || 0)) === savesBefore;
  // keyCode 229（変換確定の Enter を keyCode で知らせる端末）も同じ
  await ev(([s]) => { const el = document.querySelector(s); const e = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }); Object.defineProperty(e, "keyCode", { get: () => 229 }); el.dispatchEvent(e); }, [sel("鈴木", "2099-01-04", "start")]);
  await wait(50);
  r.h_ime229NoMove = (await active()) === "鈴木|2099-01-04|start" && (await ev(() => window.__saves || 0)) === savesBefore;
  await ev(() => document.activeElement.blur()); await settle();

  // 3. 「/」の切り替え: Enter で確定（blur が2回来る）しても1回だけ切り替わる。もう一度入れると外れる
  await typeInto(sel("高橋", "2099-01-05", "end"), "/");
  await p.keyboard.press("Enter"); await settle();
  const r1 = await shiftOf("高橋", "2099-01-05");
  r.i_restOn = !!(r1 && r1.adminRest && r1.adminRest.end) && (await val("高橋", "2099-01-05", "end")) === "";
  await ev(() => document.activeElement && document.activeElement.blur()); await wait(500);
  await typeInto(sel("高橋", "2099-01-05", "end"), "/");
  await ev(() => document.activeElement.blur()); await settle();
  const r2 = await shiftOf("高橋", "2099-01-05");
  r.j_restOff = !!r2 && !(r2.adminRest && r2.adminRest.end) && (await val("高橋", "2099-01-05", "end")) === "18";

  // 4. ツールチップ: 選ぶとスタッフ提出の値を出し、離れると消える
  await p.focus(sel("佐藤", "2099-01-02", "start"));
  await wait(50);
  const tipText = await ev(() => [...document.querySelectorAll("div")].filter(d => d.style.position === "fixed" && d.style.zIndex === "9999").map(d => d.textContent).join("|"));
  await ev(() => document.activeElement.blur()); await settle();
  const tipAfter = await ev(() => [...document.querySelectorAll("div")].filter(d => d.style.position === "fixed" && d.style.zIndex === "9999").length);
  r.k_tooltip = tipText === "9" && tipAfter === 0;

  // 5. 入力中のまま「保存」を押す（JS の click はフォーカスを動かさない＝セルが入力中のまま flushEdits に入る）
  await typeInto(sel("鈴木", "2099-01-06", "end"), "21");
  await ev(() => { window.__toast = ""; const b = [...document.querySelectorAll("button")].find(x => x.textContent.trim() === "保存"); b.click(); });
  await settle();
  const sv = await shiftOf("鈴木", "2099-01-06");
  // 件数は変更前と見比べる（l_toast）。入力中の1件を含めて数え、打った値が保存されること
  r.l_saveWhileTyping = /^✓ \d+件のシフトを保存しました$/.test(await ev(() => window.__toast)) && !!sv && sv.adjustedEnd === "21:00";
  r.l_toast = await ev(() => window.__toast);

  // 6. 店舗を切り替えると入力中の文字を捨てる（blur しても打った文字は保存されない）
  await typeInto(sel("佐藤", "2099-01-07", "start"), "13");
  await ev(() => window.__setShop("S2")); await settle();
  const shownAfterShop = await val("佐藤", "2099-01-07", "start");
  await ev(() => document.activeElement && document.activeElement.blur()); await settle();
  const sh7 = await shiftOf("佐藤", "2099-01-07");
  r.m_shopSwitchDiscards = shownAfterShop !== "13" && !(sh7 && sh7.adjustedStart === "13:00");
  r.m_detail = { shownAfterShop, sh7 };
  await ev(() => window.__setShop("S1")); await settle();

  // 7. 期間を切り替えると入力中の文字を捨てる。確定済みの期間は入力できない（readOnly・打っても変わらない）
  await typeInto(sel("高橋", "2099-01-08", "start"), "14");
  await ev(() => { const s = document.querySelector("select"); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set; set.call(s, "pB"); s.dispatchEvent(new Event("change", { bubbles: true })); });
  await settle();
  const ro = await ev(() => [...document.querySelectorAll("input[data-sc]")].every(i => i.readOnly));
  await p.focus(sel("佐藤", "2099-01-20", "start"));
  await p.keyboard.insertText("7");
  const lockedVal = await val("佐藤", "2099-01-20", "start");
  await ev(() => document.activeElement && document.activeElement.blur()); await settle();
  const pbSub = await ev(() => (window.__subs || []).find(x => x.periodId === "pB" && x.staffName === "佐藤"));
  r.n_confirmedReadOnly = ro && lockedVal === "9" && !(pbSub && pbSub.shifts["2099-01-20"].adjustedStart);
  await ev(() => { const s = document.querySelector("select"); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set; set.call(s, "pA"); s.dispatchEvent(new Event("change", { bubbles: true })); });
  await settle();
  const sh8 = await shiftOf("高橋", "2099-01-08");
  r.o_periodSwitchDiscards = (await val("高橋", "2099-01-08", "start")) !== "14" && !(sh8 && sh8.adjustedStart === "14:00");

  // 8. トリプルクリックで変更マーク（changed）を付ける・外す
  await p.click(sel("鈴木", "2099-01-09", "start"), { clickCount: 3 });
  await settle();
  const c1 = await shiftOf("鈴木", "2099-01-09");
  await ev(() => document.activeElement && document.activeElement.blur()); await settle();
  const bgOn = await ev(([s]) => getComputedStyle(document.querySelector(s)).backgroundImage, [sel("鈴木", "2099-01-09", "start")]);
  await p.click(sel("鈴木", "2099-01-09", "start"), { clickCount: 3 });
  await settle();
  await ev(() => document.activeElement && document.activeElement.blur()); await settle();
  const c2 = await shiftOf("鈴木", "2099-01-09");
  r.p_tripleClickChanged = !!(c1 && c1.changed === true) && /gradient/.test(bgOn) && !!c2 && c2.changed !== true;

  // 9. Premium 以外: 選ぶとフォーカスを外してアップグレードに誘導し、打っても値は変わらない
  await ev(() => window.__setPlan("pro")); await settle();
  await ev(() => { window.__upg = 0; });
  await p.focus(sel("佐藤", "2099-01-10", "start"));
  await wait(50);
  const upg1 = await ev(() => window.__upg);
  const act9 = await active();
  await p.click(sel("佐藤", "2099-01-10", "start"));
  await wait(50);
  const upg2 = await ev(() => window.__upg);
  r.q_nonPremiumUpgrade = upg1 >= 1 && act9 !== "佐藤|2099-01-10|start" && upg2 > upg1;

  r.noErrors = h.errors.length === 0;
  const verdict = Object.fromEntries(Object.entries(r).filter(([k]) => !k.endsWith("_detail") && k !== "l_toast"));
  const allPass = Object.values(verdict).every(Boolean);
  console.log(JSON.stringify({ root: process.env.SHIFTY_ROOT || "(repo)", ...r, errors: h.errors, allPass }, null, 2));
  await h.close();
  process.exit(allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
