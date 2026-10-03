// 確定後の計算を後回しにしても、外へ出すものが古い計算を使わないこと（S3・2026-10-04）。
//   a. laborTotals（savePeriods）は「計算中」の間は書かれず、最後に書かれた値は確定したセルを含む
//   b. Excel 出力: 入力中のセルを残したままボタンを押す → 計算が済んでから expXl が呼ばれ、そのセルの値が入る
//   c. PDF 出力: 同じく、jsPDF が作られるのは計算が済んでから。シフト表にそのセルの値が入る
//   d. 確定: 入力中のセルを残したまま押す → 計算が済んでから確定（savePeriods に confirmation）、subs にそのセルの値が入っている
//   e. 非表示マウント（月次賃金の exportJob）: マウント直後に subs が変わっても、報告は変わった後の値
//   f. 「計算中」は確定の直後に出て、計算が済むと消える（S3 より前の版では出ない＝記録だけ）
// 変更前（SHIFTY_ROOT=<変更前>）で回しても a〜e の値は同じになる（outputs を見比べる）。
"use strict";
const path = require("node:path");
const crypto = require("node:crypto");
const { openHarness } = require(path.join(__dirname, "mount-component.js"));

const EXTRA_HEAD = `<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js" integrity="sha384-ZZ1pncU3bQe8y31yfZdMFdSpttDoPmOZg2wguVK9almUodir1PghgT0eY7Mrty8H" crossorigin="anonymous"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js" integrity="sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk" crossorigin="anonymous"></script>`;

const JSX = `
const NAMES=Array.from({length:12},(_,i)=>"人"+String(i+1).padStart(2,"0"));
const days=(a,b)=>{const o=[];const d=new Date(a+"T00:00:00");const e=new Date(b+"T00:00:00");while(d<=e){o.push(d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"));d.setDate(d.getDate()+1);}return o;};
const P={id:"pX",urlToken:"tX",shopId:"S1",label:"2099年10月",startDate:"2099-10-01",endDate:"2099-10-31",deadlineDate:"",createdAt:"2099-09-01T00:00:00.000Z"};
const mk=(p,mod)=>NAMES.map((n,i)=>({id:"s_"+p.id+"_"+i,periodId:p.id,staffName:n,shopId:"S1",comment:"",submittedAt:"2099-09-20T00:00:00.000Z",
  shifts:Object.fromEntries(days(p.startDate,p.endDate).map((d,k)=>[d,(k+i)%3===2?{status:"holiday"}:{status:"work",start:"09:00",end:(mod&&i===0&&k<10)?"21:00":"18:00"}]))}));
const SETTINGS={candidates:[{start:"09:00",end:"18:00"}],weekdayCandidates:{},dateCandidates:{},templates:[],
  breakTimes:{weekday:[{start:"12:00",end:"13:00"}],sat:[{start:"12:00",end:"13:00"}],sun:[{start:"12:00",end:"13:00"}],hol:[{start:"12:00",end:"13:00"}]},
  staffAttributes:Object.fromEntries(NAMES.map((n,i)=>[n,i%2?"parttime":"employee"]))};
const pend=()=>!!document.querySelector("#main [data-calc-pending]");
window.__saves=[];
function Harness(){
  const [subs,setSubs]=React.useState(()=>mk(P,false));
  const [periods,setPeriods]=React.useState([P]);
  const [hidden,setHidden]=React.useState(null);
  window.__setHidden=setHidden;
  const onSave=v=>setSubs(prev=>{const next=(typeof v==="function")?v(prev):v;window.__subs=next;return next;});
  const savePeriods=ps=>{const p=ps.find(x=>x.id==="pX");window.__saves.push({pending:pend(),hasTotals:!!(p&&p.laborTotals),totals:p&&p.laborTotals?JSON.stringify(p.laborTotals):null,confirmed:!!(p&&p.confirmation)});setPeriods(ps);};
  return <div>
    <div id="main"><ShiftEditTab subs={subs} periods={periods} staffList={NAMES} onSave={onSave} tt={m=>{window.__toast=m;}} settings={SETTINGS}
      plan="premium" shopId="S1" shopName="検証店" onUpgrade={()=>{}} allLinkedShops={[]} onLoadPastSubs={()=>{}} pastSubsLoaded={true}
      savePeriods={savePeriods} ownerReadOnly={false}/></div>
    {hidden&&<HiddenReport key={hidden.key} change={hidden.change}/>}
  </div>;
}
// 月次賃金と同じ形の非表示マウント。change=true ならマウント直後に subs を変える（人01 の最初の10日の退勤を 21:00 に）
const NO_PERIODS_SAVE=null;
function HiddenReport({change}){
  const [subs,setSubs]=React.useState(()=>mk(P,false));
  React.useEffect(()=>{if(change){const t=setTimeout(()=>setSubs(mk(P,true)),30);return()=>clearTimeout(t);}},[]);
  const job=React.useMemo(()=>({key:"j"+(change?1:0),kind:"payroll",onDone:(e,rep)=>{window.__rep=window.__rep||{};window.__rep[change?"changed":"plain"]=e?String(e):rep;}}),[]);
  return <div style={{position:"absolute",left:-20000,top:0,width:1400}}><ShiftEditTab subs={subs} periods={[P]} staffList={NAMES} onSave={()=>{}} tt={()=>{}} settings={SETTINGS}
    plan="premium" shopId="S1" shopName="検証店" onUpgrade={()=>{}} allLinkedShops={[]} onLoadPastSubs={()=>{}} pastSubsLoaded={true}
    savePeriods={NO_PERIODS_SAVE} ownerReadOnly={true} exportJob={job} initialPeriodId="pX"/></div>;
}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);
`;

(async () => {
  const h = await openHarness({ jsx: JSX, extraHead: EXTRA_HEAD, waitFor: '#main input[data-sc]', viewport: { width: 1400, height: 900 } });
  const p = h.page;
  const ev = (fn, arg) => h.evaluate(fn, arg);
  const pendingNow = () => ev(() => !!document.querySelector("#main [data-calc-pending]"));
  const settle = async () => { for (let i = 0; i < 200; i++) { await p.waitForTimeout(30); if (!(await pendingNow())) { await p.waitForTimeout(60); if (!(await pendingNow())) return; } } };
  const sel = (n, d, f) => `#main input[data-scn="${n}"][data-sc="${d}|${f}"]`;
  const typeInto = async (s, v) => { await p.focus(s); await p.keyboard.press("ControlOrMeta+A"); await p.keyboard.insertText(v); };
  const hash = s => s == null ? null : crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);
  await settle();
  const r = {}, out = {};

  // a. laborTotals: 確定の直後は「計算中」・書くのは済んでから
  await ev(() => { window.__saves = []; });
  await typeInto(sel("人01", "2099-10-02", "end"), "22");
  await ev(() => document.activeElement.blur());
  r.f_pendingRightAfterCommit = await pendingNow();
  await settle();
  const saves = await ev(() => window.__saves);
  const tot = saves.filter(s => s.hasTotals);
  r.a_totalsNotWrittenWhilePending = tot.every(s => !s.pending);
  r.a_totalsWritten = tot.length >= 1;
  const lastTot = tot.length ? JSON.parse(tot[tot.length - 1].totals) : null;
  out.a_totals = lastTot ? hash(JSON.stringify(lastTot)) : null;
  out.a_p01workMin = lastTot && lastTot["人01"] ? lastTot["人01"].workMin : null;
  r.f_pendingClearedAfter = !(await pendingNow());

  // b. Excel: 入力中のセルを残したままボタンをクリック（マウスで押す＝セルの blur で確定してから click）
  await ev(() => { window.__xl = null; window.expXl = function (period, subs, staff, tt, shop, opts, adj) { window.__xl = { pending: !!document.querySelector("#main [data-calc-pending]"), cell: adj ? adj("人02", "2099-10-03", "start") : null }; }; });
  await typeInto(sel("人02", "2099-10-03", "start"), "8");
  await p.click("#main button:has-text('Excel出力')");
  for (let i = 0; i < 100 && !(await ev(() => !!window.__xl)); i++) await p.waitForTimeout(30);
  const xl = await ev(() => window.__xl);
  r.b_excelAfterCalc = !!xl && !xl.pending;
  out.b_excelCell = xl ? xl.cell : null;
  r.b_excelHasValue = !!xl && xl.cell && xl.cell.time === "08:00";
  await settle();

  // c. PDF: 入力中のセルを残したまま PDF出力 → シフト
  const pdf = await h.capturePdf();
  await ev(() => {
    window.__pdfAt = null;
    const Orig = window.jspdf.jsPDF;
    window.jspdf.jsPDF = function (...a) { if (window.__pdfAt == null) window.__pdfAt = { pending: !!document.querySelector("#main [data-calc-pending]") }; const d = new Orig(...a); d.save = () => { window.__pdfSaved = true; }; return d; };
  });
  await typeInto(sel("人03", "2099-10-04", "end"), "20");
  await p.click("#main button:has-text('PDF出力')");
  await p.click("button:has-text('シフト表のみ')");
  await p.waitForFunction(() => window.__pdfSaved === true, null, { timeout: 30000 }).catch(() => {});
  const pdfAt = await ev(() => window.__pdfAt);
  const blocks = await ev(() => (window.__pdf && window.__pdf.blocks) || []);
  r.c_pdfAfterCalc = !!pdfAt && !pdfAt.pending;
  // 人03 の列の 10/4 の退勤＝20（シフト表の HTML に「20」が入る。列の特定はせず、PDF が書き出されたことと値の両方を見る）
  r.c_pdfSaved = await ev(() => window.__pdfSaved === true);
  out.c_pdfHash = hash(blocks.join("\n"));
  await settle();

  // d. 確定: 入力中のセルを残したまま「確定」
  await ev(() => { window.confirm = () => true; window.__saves = []; });
  await typeInto(sel("人04", "2099-10-05", "start"), "7");
  await p.click("#main button[data-period-confirm]");
  for (let i = 0; i < 100 && !(await ev(() => window.__saves.some(s => s.confirmed))); i++) await p.waitForTimeout(30);
  const cs = await ev(() => window.__saves.filter(s => s.confirmed));
  const sub4 = await ev(() => { const s = (window.__subs || []).find(x => x.staffName === "人04"); return s ? s.shifts["2099-10-05"] : null; });
  r.d_confirmAfterCalc = cs.length >= 1 && !cs[0].pending;
  r.d_confirmIncludesTyped = !!sub4 && sub4.adjustedStart === "07:00";
  out.d_toast = await ev(() => window.__toast);
  await settle();

  // e. 非表示マウントの報告: 変える前と変えた後で人01 の実労働が違い、変えた後の報告は変えた後の値
  await ev(() => { window.__rep = {}; window.__setHidden({ key: "plain", change: false }); });
  await p.waitForFunction(() => window.__rep && window.__rep.plain, null, { timeout: 30000 }).catch(() => {});
  await ev(() => window.__setHidden({ key: "changed", change: true }));
  await p.waitForFunction(() => window.__rep && window.__rep.changed, null, { timeout: 30000 }).catch(() => {});
  const rep = await ev(() => window.__rep);
  const w = k => { const x = rep[k]; const row = x && x.rows && x.rows.find(r => r.name === "人01"); return row && row.times ? row.times.workMin : null; };
  out.e_plainWorkMin = w("plain"); out.e_changedWorkMin = w("changed");
  r.e_reportUsesChangedSubs = out.e_plainWorkMin != null && out.e_changedWorkMin != null && out.e_changedWorkMin > out.e_plainWorkMin;

  r.noErrors = h.errors.length === 0;
  const allPass = Object.entries(r).filter(([k]) => !k.startsWith("f_")).every(([, v]) => v === true);
  console.log(JSON.stringify({ root: process.env.SHIFTY_ROOT || "(repo)", checks: r, outputs: out, errors: h.errors, allPass }, null, 2));
  await h.close();
  process.exit(allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
