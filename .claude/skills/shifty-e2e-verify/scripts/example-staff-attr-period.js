// 属性の期間指定（period.keepAttrs）の実ブラウザ回帰テスト。
// 夏休みだけ上限の大きい属性にして元へ戻すと、配り終えた期間まで新しい上限で再判定されて
// 上限超過エラーが出る、という2026-09-08のユーザー報告への対応を測る。
// app-main.js を読み込まないので Firebase へは1バイトも出ない（SKILL.md 1.6節）。
//
// 実行:   node .claude/skills/shifty-e2e-verify/scripts/example-staff-attr-period.js  → allPass=true / EXIT=0
// 反証:   SHIFTY_ROOT=<この機能より前の配信物> node ... → EXIT=1（落ちないなら何も検証していない）
"use strict";
const { openHarness } = require(require("node:path").join(__dirname, "mount-component.js"));

const ROOT = process.env.SHIFTY_ROOT || undefined;
const R = {};

// 期間は startDate 降順で P3(進行中) → P2 → P1 → P0(4つ目＝選択肢に出ない)。
// **P3 の endDate をわざと遠い先にしてある**。既定の選択が「いちばん新しい終了済みの期間」なので、
// P3 が終了済みになった日から既定が変わり、実行日によって結果が変わるテストになってしまう。
const P3 = `{id:"p3",label:"9月前半",startDate:"2026-09-01",endDate:"2026-12-31"}`;
const P2 = `{id:"p2",label:"8月後半",startDate:"2026-08-16",endDate:"2026-08-31"}`;
const P1 = `{id:"p1",label:"8月前半",startDate:"2026-08-01",endDate:"2026-08-15"}`;
const P0 = `{id:"p0",label:"7月後半",startDate:"2026-07-16",endDate:"2026-07-31"}`;
const TYPE_LIMITS = `{employee:{name:"社員"},parttime:{name:"バイト",monthly:1},summer:{name:"夏休み",monthly:200}}`;

const selectAttr = (h, staffName, value) => h.evaluate(([n, v]) => {
  const row = [...document.querySelectorAll("[data-staff-idx]")].find(r => r.innerText.includes(n));
  if (!row) return "row-not-found";
  const sel = row.querySelector("select");
  if (!sel) return "select-not-found";
  Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set.call(sel, v);
  sel.dispatchEvent(new Event("change", { bubbles: true }));
  return "ok";
}, [staffName, value]);

// ---- 1. スタッフ一覧の属性変更ポップアップ ------------------------------------
async function staffTab({ preset = "{}", periods = `[${P3},${P2},${P1},${P0}]` } = {}) {
  const h = await openHarness({
    root: ROOT,
    waitFor: "input[placeholder='スタッフ名を入力']",
    jsx: `
      function Harness(){
        const [settings,setSettings]=React.useState({shopId:"s1",candidates:[],staffColors:{},staffAliases:{},
          staffAttributes:{田中:"parttime"},staffTypeLimits:${TYPE_LIMITS}});
        const [periods,setPeriods]=React.useState(${periods}.map(p=>({...p,...(${preset}[p.id]?{keepAttrs:${preset}[p.id]}:{})})));
        window.__settings=settings; window.__periods=periods;
        return <StaffTab staffList={["田中","佐藤"]} onSave={()=>{}} tt={m=>{window.__toast=m;}}
          plan="premium" onUpgrade={()=>{}} onRenameStaff={()=>{}}
          settings={settings} onSaveSettings={s=>{window.__settings=s;setSettings(s);}}
          subs={[]} periods={periods}
          savePeriods={v=>{window.__savedPeriods=v;window.__periods=v;setPeriods(v);}} ownerReadOnly={false}/>;
      }
      ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);
    `,
  });
  return h;
}

async function part1() {
  const h = await staffTab();
  R.selectChanged = await selectAttr(h, "田中", "summer");
  // 選んだ瞬間には保存しない。ポップアップが出るだけ。
  R.afterSelect = await h.evaluate(() => {
    const t = document.body.innerText;
    return {
      dialogShown: t.includes("の属性を バイト → 夏休み に変更します"),
      asksUntil: t.includes("どの期間まで バイト のままにしますか？"),
      choices: [...document.querySelectorAll("input[name='attrKeep']")].length,
      // 「期限なし」は作らない（2026-09-08 ユーザー決定・3択）
      noUnlimitedOption: !t.includes("期限なし"),
      // 既定は「いちばん新しい終了済みの期間」＝P3(進行中)ではなくP2
      checkedIdx: [...document.querySelectorAll("input[name='attrKeep']")].findIndex(i => i.checked),
      savedYet: window.__settings.staffAttributes.田中,
      periodsWrittenYet: window.__savedPeriods === undefined,
    };
  });
  R.confirm = await h.clickExact("変更する");
  R.afterConfirm = await h.evaluate(() => ({
    attr: window.__settings.staffAttributes.田中,
    // 選んだ期間(P2)と **それより古い** P1 に旧属性を書き置く。P3(新しい側)とP0(選択肢外)は触らない。
    keep: Object.fromEntries((window.__savedPeriods || []).map(p => [p.id, (p.keepAttrs || {}).田中 || null])),
    toast: window.__toast,
  }));
  R.part1Errors = h.errors.slice();
  await h.close();
}

// ---- 2. キャンセルでは何も保存されない ----------------------------------------
async function part2() {
  const h = await staffTab();
  await selectAttr(h, "田中", "employee");
  R.cancel = await h.clickExact("キャンセル");
  R.afterCancel = await h.evaluate(() => ({
    attr: window.__settings.staffAttributes.田中,
    periodsUntouched: window.__savedPeriods === undefined,
    dialogClosed: !document.body.innerText.includes("どの期間まで"),
    // value は settings のままなので、キャンセルすると select の表示も元の属性へ戻る
    selectValue: [...document.querySelectorAll("[data-staff-idx]")]
      .find(r => r.innerText.includes("田中")).querySelector("select").value,
  }));
  R.part2Errors = h.errors.slice();
  await h.close();
}

// ---- 3. 前回の変更で指定済みの期間は上書きしない ------------------------------
async function part3() {
  const h = await staffTab({ preset: `{p1:{田中:"employee"}}` });
  await selectAttr(h, "田中", "summer");
  R.fixedNoteShown = await h.evaluate(() =>
    document.body.innerText.includes("前回の変更で 社員 に固定済み（変わりません）"));
  await h.clickExact("変更する");
  R.afterOverwriteAttempt = await h.evaluate(() =>
    Object.fromEntries((window.__savedPeriods || []).map(p => [p.id, (p.keepAttrs || {}).田中 || null])));
  R.part3Errors = h.errors.slice();
  await h.close();
}

// ---- 4. 期間が1件も無ければポップアップを出さず即反映 --------------------------
async function part4() {
  const h = await staffTab({ periods: "[]" });
  await selectAttr(h, "田中", "summer");
  R.noPeriods = await h.evaluate(() => ({
    attr: window.__settings.staffAttributes.田中,
    dialogShown: document.body.innerText.includes("どの期間まで"),
  }));
  R.part4Errors = h.errors.slice();
  await h.close();
}

// ---- 5. 終了した期間の上限判定が旧属性で行われる（この機能の目的そのもの）------
// 8月前半（終了済み）に月200時間の「夏休み」属性で組んだシフトを、9月に「バイト」（月1時間）へ
// 戻したあとで開く。keepAttrs が無ければ月計セルが上限超過（赤）になり、あれば消える。
async function shiftEditTab(keepAttrs) {
  const SUB = `{id:"s1",periodId:"p1",shopId:"s1",staffName:"田中",comment:"",submittedAt:"2026-07-30T00:00:00.000Z",
    shifts:{"2026-08-03":{status:"work",start:"10:00",end:"18:00"},"2026-08-04":{status:"work",start:"10:00",end:"18:00"}}}`;
  const h = await openHarness({
    root: ROOT,
    waitFor: "table",
    jsx: `
      function Harness(){
        return <ShiftEditTab subs={[${SUB}]} periods={[{...${P1},urlToken:"t1",shopId:"s1",deadlineDate:"2026-07-25"${keepAttrs ? `,keepAttrs:{田中:"summer"}` : ""}}]}
          staffList={["田中"]} onSave={()=>{}} tt={()=>{}}
          settings={{candidates:[],weekdayCandidates:{},dateCandidates:{},templates:[],
            staffAttributes:{田中:"parttime"},staffTypeLimits:${TYPE_LIMITS}}}
          plan="premium" shopId="s1" shopName="検証店舗" onUpgrade={()=>{}} allLinkedShops={[]}
          onLoadPastSubs={()=>{}} pastSubsLoaded={true} savePeriods={()=>{}} ownerReadOnly={true}/>;
      }
      ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);
    `,
  });
  const out = await h.evaluate(() => {
    const rowOf = label => [...document.querySelectorAll("tr")]
      .find(tr => tr.querySelector("td") && tr.querySelector("td").innerText.trim() === label);
    const cell = label => { const r = rowOf(label); if (!r) return null; const td = r.querySelectorAll("td")[1]; return td && { text: td.innerText.trim(), bg: getComputedStyle(td).backgroundColor }; };
    return { limit: cell("月上限"), total: cell("月計") };
  });
  const errors = h.errors.slice();
  await h.close();
  return { ...out, errors };
}

(async () => {
  await part1();
  await part2();
  await part3();
  await part4();
  R.gridWithout = await shiftEditTab(false);
  R.gridWith = await shiftEditTab(true);

  const VIO = "rgba(255, 71, 87, 0.15)";
  const checks = {
    selectFound: R.selectChanged === "ok",
    dialogShown: R.afterSelect.dialogShown && R.afterSelect.asksUntil,
    threeChoices: R.afterSelect.choices === 3,
    noUnlimitedOption: R.afterSelect.noUnlimitedOption,
    defaultIsNewestEnded: R.afterSelect.checkedIdx === 1,
    notSavedBeforeConfirm: R.afterSelect.savedYet === "parttime" && R.afterSelect.periodsWrittenYet,
    confirmClicked: R.confirm === "ok",
    attrChanged: R.afterConfirm.attr === "summer",
    // P2(選択)とP1(それより古い)に旧属性、P3(新しい側)とP0(選択肢外)は触らない
    keepWrittenToChosenAndOlder: JSON.stringify(R.afterConfirm.keep) === JSON.stringify({ p3: null, p2: "parttime", p1: "parttime", p0: null }),
    toastMentionsBoundary: /「8月後半」まではバイトのまま/.test(R.afterConfirm.toast || ""),
    cancelKeepsAttr: R.afterCancel.attr === "parttime" && R.afterCancel.periodsUntouched,
    cancelClosesDialog: R.afterCancel.dialogClosed && R.afterCancel.selectValue === "parttime",
    fixedNoteShown: R.fixedNoteShown,
    fixedPeriodNotOverwritten: JSON.stringify(R.afterOverwriteAttempt) === JSON.stringify({ p3: null, p2: "parttime", p1: "employee", p0: null }),
    noPeriodsSavesDirectly: R.noPeriods.attr === "summer" && !R.noPeriods.dialogShown,
    // 5: keepAttrs 無し＝現在の属性(バイト・月1h)で再判定され、月計が上限超過になる
    withoutKeepShowsParttimeLimit: R.gridWithout.limit && R.gridWithout.limit.text === "1",
    withoutKeepIsViolation: R.gridWithout.total && R.gridWithout.total.bg === VIO,
    // 5: keepAttrs 有り＝その期間は夏休み(月200h)のままなので超過しない
    withKeepShowsSummerLimit: R.gridWith.limit && R.gridWith.limit.text === "200",
    withKeepNoViolation: R.gridWith.total && R.gridWith.total.bg !== VIO,
    noConsoleErrors: [R.part1Errors, R.part2Errors, R.part3Errors, R.part4Errors, R.gridWithout.errors, R.gridWith.errors]
      .every(e => e.length === 0),
  };
  const allPass = Object.values(checks).every(Boolean);
  console.log(JSON.stringify({ checks, allPass, detail: R }, null, 2));
  process.exit(allPass ? 0 : 1);
})();
