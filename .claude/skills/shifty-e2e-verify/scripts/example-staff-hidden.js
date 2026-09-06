// スタッフ非表示機能（settings.staffHidden）の実ブラウザ回帰テスト。
// 1.6節のハーネスの動くサンプル兼、clickExact / captureDownloads / capturePdf の実証。
// app-main.js を読み込まないので Firebase へは1バイトも出ない。
//
// 実行:   node .claude/skills/shifty-e2e-verify/scripts/example-staff-hidden.js   → allPass=true / EXIT=0
// 反証:   SHIFTY_ROOT=<非表示機能より前の配信物> node ... → EXIT=1（落ちないなら何も検証していない）
"use strict";
const { openHarness } = require(require("node:path").join(__dirname, "mount-component.js"));

const ROOT = process.env.SHIFTY_ROOT || undefined;
const R = {};

const STAFF = `["田中","佐藤","__spacer__zz","鈴木"]`;
const PERIOD = `{id:"p1",urlToken:"t1",shopId:"s1",label:"2026年10月前半",startDate:"2026-10-01",endDate:"2026-10-03",deadlineDate:"2026-09-28",createdAt:"2026-09-01T00:00:00.000Z"}`;
// 佐藤（非表示にする人）にも提出がある。非表示にしたとき「未登録の提出名」に化けて
// Excel・PDF の末尾に列として復活しないこと＝この機能でいちばん壊れやすい不変条件の確認用。
const SUBS = `[{id:"sub1",periodId:"p1",shopId:"s1",staffName:"佐藤",comment:"",submittedAt:"2026-09-20T00:00:00.000Z",shifts:{"2026-10-01":{status:"work",start:"10:00",end:"18:00"}}},
{id:"sub2",periodId:"p1",shopId:"s1",staffName:"田中",comment:"",submittedAt:"2026-09-20T00:00:00.000Z",shifts:{"2026-10-01":{status:"work",start:"11:00",end:"19:00"}}}]`;

// ---- 1. スタッフ一覧のトグル --------------------------------------------------
async function staffTab() {
  const h = await openHarness({
    root: ROOT,
    waitFor: "input[placeholder='スタッフ名を入力']",
    jsx: `
      function Harness(){
        const [settings,setSettings]=React.useState({shopId:"s1",candidates:[],staffColors:{},staffAliases:{}});
        window.__settings=settings;
        return <StaffTab staffList={${STAFF}} onSave={v=>{window.__staffListSaved=v;}} tt={m=>{window.__toast=m;}}
          plan="premium" onUpgrade={()=>{}} onRenameStaff={()=>{}}
          settings={settings} onSaveSettings={s=>{window.__settings=s;setSettings(s);}}
          subs={${SUBS}} periods={[${PERIOD}]} savePeriods={()=>{}} ownerReadOnly={false}/>;
      }
      ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);
    `,
  });
  R.hideButtonRows = await h.evaluate(() =>
    [...document.querySelectorAll("[data-staff-idx]")]
      .filter(r => [...r.querySelectorAll("button")].some(b => b.innerText.trim() === "非表示")).length);
  // clickByText は部分一致なので "表示" が "非表示" に当たる。行を絞った完全一致で押す。
  R.clickHide = await h.clickExact("非表示", { rowText: "佐藤" });
  // 押しただけでは保存されない。開始期間を選ぶポップアップが出る（2026-09-06 決定）。
  R.dialogAfterHideClick = await h.evaluate(() => {
    const t = document.body.innerText;
    return {
      shown: t.includes("を非表示にします") && t.includes("どの期間から非表示にしますか？"),
      choices: [...document.querySelectorAll("input[name='hideChoice']")].length,
      latestMarked: t.includes("（最新）"),
      savedYet: window.__settings.staffHidden !== undefined,
    };
  });
  R.confirmHide = await h.clickExact("非表示にする");
  R.savedHidden = await h.evaluate(() => window.__settings && window.__settings.staffHidden);
  R.staffListUntouched = await h.evaluate(() => window.__staffListSaved === undefined);
  R.labelsAfterHide = await h.evaluate(() => {
    const row = [...document.querySelectorAll("[data-staff-idx]")].find(r => r.innerText.includes("佐藤"));
    return [...row.querySelectorAll("button")].map(b => b.innerText.trim());
  });
  R.captionShown = await h.evaluate(() => {
    const row = [...document.querySelectorAll("[data-staff-idx]")].find(r => r.innerText.includes("佐藤"));
    return row.innerText.includes("シフト作成タブ・Excel・PDF に出ません");
  });
  R.clickShow = await h.clickExact("表示", { rowText: "佐藤" });
  R.dialogAfterShowClick = await h.evaluate(() => {
    const t = document.body.innerText;
    return {
      shown: t.includes("を表示に戻します") && t.includes("どの期間から表示に戻しますか？"),
      showsCurrentRange: t.includes("以降を非表示にしています"),
      // 非表示の開始と同じ期間を選ぶと、範囲が空になるので指定ごと取り消される旨を出す
      warnsCancel: t.includes("非表示の指定ごと取り消されます"),
    };
  });
  R.confirmShow = await h.clickExact("表示に戻す");
  R.afterToggleBack = await h.evaluate(() => window.__settings.staffHidden);
  // 同じ期間の中で付けて外したので、何も隠していない範囲は残さない＝キーごと消える
  R.afterToggleBackIsGone = R.afterToggleBack === undefined;
  R.spacerHasNoHideBtn = await h.evaluate(() => {
    const sp = [...document.querySelectorAll("[data-staff-idx]")].find(r => r.innerText.includes("空白列"));
    return sp ? ![...sp.querySelectorAll("button")].some(b => b.innerText.trim() === "非表示") : "spacer-row-not-found";
  });
  R.staffTabErrors = h.errors.slice();
  await h.close();
}

// ---- 1b. 期間が4件あるとき、選択肢は「最新を含む3件」だけ ----------------------
async function staffTabThreePeriods() {
  const P = ["2026-08-01", "2026-09-01", "2026-10-01", "2026-11-01"].map((s, i) =>
    `{id:"q${i}",label:"期間${i}",startDate:"${s}",endDate:"${s.slice(0, 8)}28"}`).join(",");
  const h = await openHarness({
    root: ROOT,
    waitFor: "input[placeholder='スタッフ名を入力']",
    jsx: `
      function Harness(){
        const [settings,setSettings]=React.useState({shopId:"s1",candidates:[],staffColors:{},staffAliases:{}});
        window.__settings=settings;
        return <StaffTab staffList={["田中","佐藤"]} onSave={()=>{}} tt={()=>{}}
          plan="premium" onUpgrade={()=>{}} onRenameStaff={()=>{}}
          settings={settings} onSaveSettings={s=>{window.__settings=s;setSettings(s);}}
          subs={[]} periods={[${P}]} savePeriods={()=>{}} ownerReadOnly={false}/>;
      }
      ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);
    `,
  });
  await h.clickExact("非表示", { rowText: "佐藤" });
  R.threePeriodDialog = await h.evaluate(() => {
    const t = document.body.innerText;
    return {
      choices: [...document.querySelectorAll("input[name='hideChoice']")].length,
      labels: [...document.querySelectorAll("label")].map(l => l.innerText.split("\n")[0].trim()).filter(x => x.startsWith("期間")),
      notesOlderExcluded: t.includes("これより古い期間は選べません"),
    };
  });
  // 最新ではなく1つ前（期間2 / 2026-10-01）を選んで確定する。
  // ポップアップの無い実装に対して流したときに例外で落ちないよう、存在を確かめてから押す
  // （落ちると verdict が出ず、どの前提が崩れたのか読めなくなる）。
  R.pickedOlderRadio = await h.evaluate(() => {
    const r = document.querySelectorAll("input[name='hideChoice']")[1];
    if (!r) return false;
    r.click();
    return true;
  });
  R.confirmOlder = await h.clickExact("非表示にする");
  R.savedFromOlderPeriod = await h.evaluate(() => window.__settings.staffHidden);
  R.threePeriodErrors = h.errors.slice();
  await h.close();
}

// ---- 2. シフト作成グリッド・Excel・PDF ----------------------------------------
async function shiftEditTab() {
  const h = await openHarness({
    root: ROOT,
    waitFor: "[data-scn]",
    // integrity は index.html と同じ値（バージョンを変えるときは両方で再計算する）
    extraHead: `<script src="https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js" integrity="sha384-Pqp51FUN2/qzfxZxBCtF0stpc9ONI6MYZpVqmo8m20SoaQCzf+arZvACkLkirlPz" crossorigin="anonymous"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js" integrity="sha384-ZZ1pncU3bQe8y31yfZdMFdSpttDoPmOZg2wguVK9almUodir1PghgT0eY7Mrty8H" crossorigin="anonymous"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js" integrity="sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk" crossorigin="anonymous"></script>`,
    jsx: `
      function Harness(){
        const [settings,setSettings]=React.useState({shopId:"s1",candidates:[],staffColors:{},staffAliases:{},staffHidden:{}});
        window.__setSettings=s=>setSettings(s);
        window.__period=${PERIOD}; window.__subs=${SUBS}; window.__staffList=${STAFF};
        return <ShiftEditTab subs={${SUBS}} periods={[${PERIOD}]} staffList={${STAFF}}
          onSave={()=>{}} tt={m=>{window.__toast=m;}} settings={settings} plan="premium"
          shopId="s1" shopName="検証店舗" onUpgrade={()=>{}} allLinkedShops={[]}
          onLoadPastSubs={()=>{}} pastSubsLoaded={true} savePeriods={()=>{}} ownerReadOnly={true}/>;
      }
      ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);
    `,
  });
  R.gridBefore = await h.gridStaffNames();
  await h.evaluate(() => window.__setSettings({ shopId: "s1", candidates: [], staffColors: {}, staffAliases: {}, staffHidden: { "佐藤": [{ from: "2026-10-01", to: null }] } }));
  await h.page.waitForTimeout(400);
  R.gridAfter = await h.gridStaffNames();
  // 範囲が本当に期間ごとに評価されているかを確かめる。開始をこの期間より後（11/01）にすると、
  // 同じ非表示設定のままでも 佐藤 は戻ってくるはず。戻らなければ期間を見ずに隠している。
  await h.evaluate(() => window.__setSettings({ shopId: "s1", candidates: [], staffColors: {}, staffAliases: {}, staffHidden: { "佐藤": [{ from: "2026-11-01", to: null }] } }));
  await h.page.waitForTimeout(400);
  R.gridWithLaterRange = await h.gridStaffNames();
  // 検証の続きは「この期間が非表示の範囲に入っている」状態で行う
  await h.evaluate(() => window.__setSettings({ shopId: "s1", candidates: [], staffColors: {}, staffAliases: {}, staffHidden: { "佐藤": [{ from: "2026-10-01", to: null }] } }));
  await h.page.waitForTimeout(400);

  // グリッドの列だけでなく、タブ全体（ヒートマップ・休みカウント・勤務時間集計）から
  // 名前が消えていることを見る。これらは realStaff = staffList.filter(!isSpacer) から導出されるので
  // 1箇所で絞れば全部追従するはずだが、「はず」を測らずに完了と呼ばないための実測。
  R.tabTextHasHidden = await h.evaluate(() => document.body.innerText.includes("佐藤"));

  const readExcelHead = () => h.evaluate(async () => {
    await new Promise(r => setTimeout(r, 1500));           // writeBuffer() は非同期
    if (!window.__dl.blobs.length) return { error: "blob not captured" };
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await window.__dl.blobs[window.__dl.blobs.length - 1].arrayBuffer());
    const head = [];
    wb.worksheets[0].getRow(2).eachCell({ includeEmpty: true }, c => head.push(c.value == null ? "" : String(c.value)));
    return head;                                            // 見出しは2行目
  });

  // Excel①: シフト作成タブの「Excel出力」ボタン＝実際のユーザー操作の経路（resolver あり）
  const dl = await h.captureDownloads();
  R.excelBtn = await h.clickExact("Excel出力");
  R.excelHeadFromTab = await readExcelHead();
  // Excel②: 期間管理タブと同じ呼び方（resolver なし）。列構成は同じでも入口が違うので両方測る。
  R.excelHead = await h.evaluate(async () => {
    const settings = { shopId: "s1", candidates: [], staffColors: {}, staffAliases: {}, staffHidden: { "佐藤": [{ from: "2026-10-01", to: null }] } };
    expXl(window.__period, window.__subs, window.__staffList, () => { }, "検証店舗",
      { staffColors: {}, staffAliases: {}, staffNumbers: {}, settings });
    await new Promise(r => setTimeout(r, 1500));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await window.__dl.blobs[window.__dl.blobs.length - 1].arrayBuffer());
    const head = [];
    wb.worksheets[0].getRow(2).eachCell({ includeEmpty: true }, c => head.push(c.value == null ? "" : String(c.value)));
    return head;
  });
  await dl.restore();   // 戻さないと jsPDF の save() が blob:stub でコンソールエラーを出す

  // PDF（1.8節）。判定は html ではなく text（vtext の縦書きを潰した平文）で行う。
  const pdf = await h.capturePdf();
  R.pdfOpen = await h.clickExact("PDF出力");
  R.pdfShift = await h.clickExact("シフト");                // ラベルは2行なので1行目の完全一致で拾う
  await h.page.waitForTimeout(6000);
  R.pdfBlocks = await pdf.count();
  R.pdfText = await pdf.text();
  R.shiftEditErrors = h.errors.slice();
  await h.close();
}

(async () => {
  await staffTab();
  await staffTabThreePeriods();
  await shiftEditTab();
  const head = Array.isArray(R.excelHead) ? R.excelHead : [];
  const pdfText = R.pdfText || "";
  const verdict = {
    step1_hideButtonOnEveryRealStaff: R.hideButtonRows === 3,
    step1_clickHit: R.clickHide === "ok" && R.clickShow === "ok"
      && R.confirmHide === "ok" && R.confirmShow === "ok",
    step1_hideDialogAsksForPeriod: !!R.dialogAfterHideClick && R.dialogAfterHideClick.shown === true
      && R.dialogAfterHideClick.choices === 1 && R.dialogAfterHideClick.latestMarked === true,
    step1_noSaveBeforeConfirm: !!R.dialogAfterHideClick && R.dialogAfterHideClick.savedYet === false,
    step1_showDialogExplainsRange: !!R.dialogAfterShowClick && R.dialogAfterShowClick.shown === true
      && R.dialogAfterShowClick.showsCurrentRange === true && R.dialogAfterShowClick.warnsCancel === true,
    step1_savedAsRangeFromLatestPeriod: JSON.stringify(R.savedHidden)
      === JSON.stringify({ "佐藤": [{ from: "2026-10-01", to: null }] }),
    step1_staffListUntouched: R.staffListUntouched === true,
    step1_labelFlipsToShow: (R.labelsAfterHide || []).includes("表示") && !(R.labelsAfterHide || []).includes("非表示"),
    step1_captionShown: R.captionShown === true,
    step1_toggleBackDeletesKey: R.afterToggleBackIsGone === true,
    step1_spacerHasNoHideButton: R.spacerHasNoHideBtn === true,
    step1b_showsLatestPlusTwoOlder: !!R.threePeriodDialog && R.threePeriodDialog.choices === 3
      && JSON.stringify(R.threePeriodDialog.labels) === JSON.stringify(["期間3（最新）", "期間2", "期間1"])
      && R.threePeriodDialog.notesOlderExcluded === true,
    step1b_canStartFromAnOlderPeriod: R.pickedOlderRadio === true && R.confirmOlder === "ok"
      && JSON.stringify(R.savedFromOlderPeriod) === JSON.stringify({ "佐藤": [{ from: "2026-10-01", to: null }] }),
    step1b_noErrors: (R.threePeriodErrors || []).length === 0,
    step2_gridHadThree: (R.gridBefore || []).length === 3,
    step2_gridDropsHidden: !(R.gridAfter || []).includes("佐藤")
      && (R.gridAfter || []).includes("田中") && (R.gridAfter || []).includes("鈴木"),
    step2_rangeIsEvaluatedPerPeriod: (R.gridWithLaterRange || []).includes("佐藤"),
    step2_tabDropsHiddenEverywhere: R.tabTextHasHidden === false,
    step2_excelFromTabButton: Array.isArray(R.excelHeadFromTab) && R.excelHeadFromTab.length > 0
      && !R.excelHeadFromTab.includes("佐藤")
      && R.excelHeadFromTab.includes("田中") && R.excelHeadFromTab.includes("鈴木"),
    step2_excelDropsHidden: head.length > 0 && !head.includes("佐藤"),
    step2_excelKeepsVisible: head.includes("田中") && head.includes("鈴木"),
    step2_pdfCaptured: R.pdfBlocks > 0 && pdfText.length > 0,
    step2_pdfDropsHidden: pdfText.length > 0 && !pdfText.includes("佐藤"),
    step2_pdfKeepsVisible: pdfText.includes("田中") && pdfText.includes("鈴木"),
    noConsoleErrors: (R.staffTabErrors || []).length === 0 && (R.shiftEditErrors || []).length === 0,
  };
  const allPass = Object.values(verdict).every(Boolean);
  console.log(JSON.stringify({ detail: R, verdict, allPass }, null, 2));
  console.log("allPass=" + allPass);
  process.exit(allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
