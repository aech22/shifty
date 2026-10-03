// 賃金マスタ・閲覧パスコード（2026-09-30・労務給与_複数法人_実装計画.md §3.7・P6a）の実ブラウザ回帰テスト。
// アプリ全体をスタブ Firebase（stub-firebase.js）で動かす。Firebase へは1バイトも出ない。
// ルール（private/pay がオーナー以外から読めない等）はスタブでは評価されないので、probe-rules-pay.js（dev の REST）で測る。
//
//  A. 企業連携店舗（Premium・オーナー）
//     - スタッフタブの「スタッフ登録」の横に4桁のボックス。「初期パスコードのままです」の注意は出さない（2026-10-01 ユーザー指示で削除）
//     - 編集モーダルに「賃金設定を開く →」。ヘルプ（所属が別店舗）の人は「賃金は所属店舗（B店）で設定します」
//     - 開くと全画面（タブバーが消える）。解除前は金額が「••••」で保存できない。0000 で解除
//     - パート・アルバイトは時給が既定。時給 1,230 円・適用開始 2026-10-01 で最賃 1,231 円と比べて赤、1,231 円で緑
//     - 保存すると shops/S1/private/pay/田中 に書かれ（settings には書かない）、一覧の行に「¥」が出る
//     - 適用開始日を変えて保存すると前の版が history に積まれ、履歴に読み取り専用で出る
//     - 社員は給与形態の切替が無く月給、企業属性（特定技能）は月給が既定。固定残業 30h の自動計算が 46,199 円
//     - 「← 戻る」で編集モーダルに戻る。未保存で戻ると確認が出る
//     - 🔒 で伏せ直す／リロードで伏せ直す／10分無操作で伏せ直す
//     - 改名で private/pay のキーが移り、「どの期間にも残さない」削除で消える
//     - 企業連携店舗ではパスコードの「変更」は企業連携タブへの案内だけ
//     - 企業アカウントの「賃金の閲覧パスコードを変更する」で setCompanyPayCode が企業と全店舗に同じハッシュを書く
//     - 法人の設定で最低賃金を足すと写しの settings.wageSettings に入る
//     - 企業内登録スタッフの上部が「従業員番号順」「店舗別」「パスコード」の順で、解除すると賃金列に「時給 1,231円」
//     - 企業内登録スタッフの上部の箱にも「変更」（2026-10-01）。現在の番号→新しい番号2回。現在の番号の誤り・確認の不一致は
//       モーダルの中に理由が出て閉じない。正しく入れると setCompanyPayCode が {currentCode,newCode} で呼ばれ、賃金が伏せ直り、新しい番号で解除できる
//     - 5回間違えると60秒待ち
//  B. 企業に連携していない店舗: 「変更」で 0000 → 1234 に変えると private/payCode にハッシュが入り、0000 では解除できない
//  C. Pro: ボックスもボタンも出ない
//  D. 375px 幅で賃金設定ページが横に動かない
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-staff-pay.js → allPass=true / EXIT=0
"use strict";
const path = require("node:path");
const { openHarness, REPO_ROOT } = require(path.join(__dirname, "mount-component.js"));
const { makeStub } = require(path.join(__dirname, "stub-firebase.js"));
const ROOT = process.env.SHIFTY_ROOT || REPO_ROOT;
const THEME = `<style>:root{--c-bg:#F0F2F5;--c-card:#FFFFFF;--c-input:#F3F4F6;--c-input2:#F0F2F5;` +
  `--c-border:#E5E7EB;--c-border2:#D1D5DB;--c-text:#1A1A2E;--c-text2:#374151;--c-text3:#6B7280;` +
  `--c-text4:#9CA3AF;--c-shadow:rgba(0,0,0,.06);--c-accent:#f87036;--c-danger:#DC2626;}</style>`;
const UID = "U1", CID = "C1";
const CO_ATTR = "co_AbCd1234";
const coSettings = { staffTypeLimits: { [CO_ATTR]: { name: "特定技能", laborSystem: "A" } } };
const entSettings = { wageSettings: { minWage: [{ from: "2025-10-01", yen: 1177 }, { from: "2026-10-01", yen: 1231 }] } };
const shop = (sid, staff, settings) => ({ owners: { [UID]: "K" + sid }, private: { adminKey: "K" + sid }, staff, settings: { shopId: sid, candidates: [], ...settings }, periods: {} });
const names = { S1: "A店", S2: "B店" };
const mirror = () => ({ id: CID, name: "テスト企業", entityId: "E1", entityName: "テスト企業", kind: "shop",
  settings: { ...coSettings, ...entSettings }, deadlines: {}, shops: names, syncedAt: "stub" });
const seed = (plan, linked) => ({
  global: { shops: { S1: { id: "S1", name: "A店" }, S2: { id: "S2", name: "B店" } } },
  shops: {
    S1: { ...shop("S1", ["田中", "佐藤", "特定", "小林"], {
      staffNumbers: { "田中": "12", "佐藤": "3", "特定": "5", "小林": "7" },
      staffAttributes: { "田中": "parttime", "佐藤": "employee", "特定": CO_ATTR },
      staffHomeShop: { "小林": "S2" } }), ...(linked ? { company: mirror() } : {}) },
    S2: { ...shop("S2", ["小林"], { staffNumbers: { "小林": "7" } }), ...(linked ? { company: mirror() } : {}) },
  },
  accounts: { S1: { plan }, S2: { plan }, [UID]: { shops: { S1: true, S2: true }, ...(linked ? { company: { companyId: CID, code: "ABCD1234", name: "テスト企業" } } : {}) } },
  ...(linked ? { companies: { [CID]: { pub: { name: "テスト企業", ownerUid: UID, code: "ABCD1234", shops: { S1: true, S2: true },
    entities: { E1: { name: "テスト企業", createdAt: "t", settings: entSettings } }, defaultEntityId: "E1", shopEntities: { S1: "E1", S2: "E1" },
    config: { settings: coSettings } } } } } : {}),
});
const cfHandlers = { setCompanyPayCode: "payCode", ...Object.fromEntries(["ensureCompanyEntities", "createEntity", "renameEntity", "assignShopEntity", "saveEntityConfig", "setShopKind"].map(n => [n, "entity"])) };
async function open(plan, linked, o = {}) {
  return openHarness({
    root: ROOT, jsx: "window.__harnessReady=true;", waitFor: "#root > *", viewport: o.viewport || { width: 1200, height: 900 },
    extraHead: THEME + makeStub({ seed: seed(plan, linked), uid: UID, view: "admin", tab: o.tab || "staff", cfHandlers }),
    scripts: ["app-utils.js", "app-core.js", "app-staff.js", "app-admin.js", "app-shift.js", "app-company.js", "app-main.js"].map(src => ({ src, babel: !/utils|core/.test(src) })),
  });
}
const BOX = "[data-pay-code-box] input[type=password]";
const openEdit = async (h, n) => { await h.clickExact("編集", { rowText: n }); await h.page.waitForTimeout(200); };
const typeCode = async (h, code) => { await h.setInput(BOX, code); await h.page.waitForTimeout(250); };
const text = h => h.evaluate(() => document.body.innerText);
const payInputs = h => h.evaluate(() => [...document.querySelectorAll("[data-staff-pay-page] input[aria-label]")].map(i => i.getAttribute("aria-label")));

(async () => {
  const R = {};
  let h = await open("premium", true);
  try {
    await h.page.waitForFunction(() => document.body.innerText.includes("スタッフ一覧") && !!document.querySelector("[data-pay-code-box]"), { timeout: 15000 });
    R.boxNextToHeading = await h.evaluate(() => {
      // P6b でボックスの隣に「月次賃金 →」が入り、ボックスと月次賃金のボタンを1つの塊に包んだ（見出しの行の子は その塊）。
      // 見出しと同じ行にあることを、ボックスの親か祖父の子に見出しがあることで確かめる
      const box = document.querySelector("[data-pay-code-box]");
      return [box.parentElement, box.parentElement.parentElement].some(p => [...p.children].some(c => c.innerText.trim() === "スタッフ登録"));
    });
    R.noDefaultHint = !(await text(h)).includes("初期パスコードのままです");
    R.boxFont = await h.evaluate(s => parseFloat(getComputedStyle(document.querySelector(s)).fontSize), BOX);
    // ヘルプの人は案内だけ
    await openEdit(h, "小林");
    R.helperNote = await h.evaluate(() => (document.querySelector("[data-pay-helper-note]") || {}).innerText || "");
    R.helperNoButton = !(await text(h)).includes("賃金設定を開く →");
    await h.clickExact("閉じる");
    // 田中: 開く → 伏字 → 解除
    await openEdit(h, "田中");
    R.openBtn = await h.clickExact("賃金設定を開く →");
    await h.page.waitForSelector("[data-staff-pay-page]", { timeout: 5000 });
    R.fullPage = await h.evaluate(() => ![...document.querySelectorAll("button")].some(b => b.innerText.trim() === "期間"));
    R.maskedBefore = await h.evaluate(() => document.querySelectorAll("[data-pay-masked]").length);
    R.noYenInputsBefore = !(await payInputs(h)).includes("時給");
    R.saveDisabledBefore = await h.evaluate(() => [...document.querySelectorAll("button")].find(b => b.innerText.trim() === "保存").disabled);
    R.defaultHourly = await h.evaluate(() => { const b = document.querySelector('[data-pay-type="hourly"]'); return !!b && getComputedStyle(b).backgroundColor !== getComputedStyle(document.querySelector('[data-pay-type="monthly"]')).backgroundColor; });
    await typeCode(h, "0000");
    R.unlocked = (await payInputs(h)).includes("時給");
    await h.setInput('[aria-label="時給"]', "1230");
    await h.setInput('[data-staff-pay-page] input[type=date]', "2026-10-01");
    await h.page.waitForTimeout(150);
    R.redAt1230 = await h.evaluate(() => { const e = document.querySelector("[data-min-wage-ok]"); return e ? [e.getAttribute("data-min-wage-ok"), getComputedStyle(e).color, e.innerText] : null; });
    await h.setInput('[aria-label="時給"]', "1231");
    await h.page.waitForTimeout(150);
    R.greenAt1231 = await h.evaluate(() => { const e = document.querySelector("[data-min-wage-ok]"); return e ? e.getAttribute("data-min-wage-ok") : null; });
    await h.setInput('[aria-label="通勤手当"]', "500");
    await h.clickExact("保存"); await h.page.waitForTimeout(300);
    R.saved = await h.evaluate(() => window.__db("shops/S1/private/pay/田中"));
    R.notInSettings = await h.evaluate(() => JSON.stringify(window.__db("shops/S1/settings") || {}).indexOf("1231") < 0);
    // 改定: 適用開始日を変えて保存 → 前の版が history
    await h.setInput('[aria-label="時給"]', "1300");
    await h.setInput('[data-staff-pay-page] input[type=date]', "2027-04-01");
    await h.clickExact("保存"); await h.page.waitForTimeout(300);
    R.revised = await h.evaluate(() => window.__db("shops/S1/private/pay/田中"));
    R.historyShown = await h.evaluate(() => { const d = document.querySelector("[data-pay-history]"); if (!d) return null; d.open = true; return d.innerText; });
    // 未保存で戻ると確認（stub の confirm は true）→ 編集モーダルに戻る
    await h.setInput('[aria-label="時給"]', "1400");
    await h.evaluate(() => { window.__confirms = 0; const c = window.confirm; window.confirm = m => { window.__confirms++; return c(m); }; });
    await h.clickExact("← 戻る"); await h.page.waitForTimeout(300);
    R.confirmedOnDirtyBack = await h.evaluate(() => window.__confirms);
    R.backToModal = (await text(h)).includes("田中 の設定");
    await h.clickExact("閉じる");
    R.yenMark = await h.evaluate(() => !!document.querySelector('[data-pay-mark="田中"]') && !document.querySelector('[data-pay-mark="佐藤"]'));
    R.unlockedCarried = (await text(h)).includes("賃金を表示中");
    // 社員: 切替なし・月給
    await openEdit(h, "佐藤"); await h.clickExact("賃金設定を開く →"); await h.page.waitForSelector("[data-staff-pay-page]");
    R.employeeNoToggle = await h.evaluate(() => document.querySelectorAll("[data-pay-type]").length === 0 && document.body.innerText.includes("月給（社員は固定給）"));
    R.employeeNoHourly = !(await payInputs(h)).includes("時給") && (await payInputs(h)).includes("基本給");
    await h.setInput('[aria-label="基本給"]', "300000");
    await h.clickExact("保存"); await h.page.waitForTimeout(300);
    R.employeeSaved = await h.evaluate(() => (window.__db("shops/S1/private/pay/佐藤") || {}).payType);
    await h.clickExact("← 戻る"); await h.page.waitForTimeout(200); await h.clickExact("閉じる");
    // 企業属性（特定技能）: 月給が既定・固定残業 30h の自動計算
    await openEdit(h, "特定"); await h.clickExact("賃金設定を開く →"); await h.page.waitForSelector("[data-staff-pay-page]");
    R.coAttrMonthly = await h.evaluate(() => { const m = document.querySelector('[data-pay-type="monthly"]'); return !!m && getComputedStyle(m).color === "rgb(255, 255, 255)"; });
    await h.setInput('[aria-label="基本給"]', "213500");
    await h.setInput('[aria-label="固定残業の時間"]', "30");
    await h.clickExact("＋ 手当を追加");
    await h.setInput('[aria-label="手当の名前"]', "資格手当");
    await h.setInput('[aria-label="手当の金額"]', "5000");
    await h.page.$eval("[data-pay-allowance='0'] input[type=checkbox]", el => el.click());
    await h.setInput('[aria-label="固定深夜の時間"]', "32");
    await h.setInput('[aria-label="固定深夜の額"]', "10000");
    await h.page.waitForTimeout(150);
    R.fixedOtShown = await h.evaluate(() => (document.querySelector("[data-pay-fixed-ot]") || {}).innerText);
    await h.clickExact("保存"); await h.page.waitForTimeout(300);
    R.coSaved = await h.evaluate(() => window.__db("shops/S1/private/pay/特定"));
    // 🔒 で伏せ直す
    await h.evaluate(() => [...document.querySelectorAll("button")].find(b => b.getAttribute("aria-label") === "賃金を伏せる").click());
    await h.page.waitForTimeout(200);
    R.relockedByButton = await h.evaluate(() => document.querySelectorAll("[data-pay-masked]").length > 0 && (document.querySelector("[data-pay-fixed-ot]") || {}).innerText === "••••");
    // 10分無操作（Date.now を11分進め、見回りの間隔15秒を待つ）
    await typeCode(h, "0000");
    R.reunlocked = (await payInputs(h)).includes("基本給");
    await h.evaluate(() => { window.__realNow = Date.now; const off = 11 * 60 * 1000; Date.now = () => window.__realNow.call(Date) + off; });
    await h.page.waitForTimeout(16000);
    R.relockedByIdle = await h.evaluate(() => document.querySelectorAll("[data-pay-masked]").length > 0);
    await h.evaluate(() => { Date.now = window.__realNow; });
    await h.clickExact("← 戻る"); await h.page.waitForTimeout(200); await h.clickExact("閉じる");
    // パスコードの変更は企業連携タブへの案内
    await h.clickExact("変更"); await h.page.waitForTimeout(200);
    R.linkedChangeNote = await h.evaluate(() => (document.querySelector("[data-pay-code-modal]") || {}).innerText || "");
    await h.clickExact("閉じる");
    // 改名で private/pay のキーが移る
    await openEdit(h, "田中");
    await h.evaluate(() => { const el = [...document.querySelectorAll('input[maxlength="50"]')].find(i => i.value === "田中");
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, "田中 太郎"); el.dispatchEvent(new Event("input", { bubbles: true })); });
    R.saveBtnCount = await h.evaluate(() => [...document.querySelectorAll("button")].filter(b => (b.innerText || "").trim() === "保存").length);
    R.saveClick = await h.clickExact("保存"); await h.page.waitForTimeout(400);
    R.renamed = await h.evaluate(() => ({ old: window.__db("shops/S1/private/pay/田中"), next: !!window.__db("shops/S1/private/pay/田中 太郎") }));
    // 削除（期間が無い＝どの期間にも残さない）で消える
    await h.clickExact("削除", { rowText: "佐藤" }); await h.page.waitForTimeout(200);
    await h.clickExact("削除する"); await h.page.waitForTimeout(400);
    R.dropped = await h.evaluate(() => window.__db("shops/S1/private/pay/佐藤"));
    // リロードで伏せ直す
    await typeCode(h, "0000");
    await h.page.reload({ waitUntil: "networkidle" });
    await h.page.waitForFunction(() => !!document.querySelector("[data-pay-code-box] input[type=password]"), { timeout: 15000 });
    R.relockedByReload = !(await text(h)).includes("賃金を表示中");
    // 5回間違えると60秒待ち（sessionStorage に持つのでリロードでは消えない）
    for (let i = 0; i < 5; i++) await typeCode(h, "9999");
    R.lockout = await h.evaluate(() => document.querySelector("[data-pay-code-box]").innerText);
    await typeCode(h, "0000");
    R.lockoutHolds = !(await text(h)).includes("賃金を表示中");
    await h.page.reload({ waitUntil: "networkidle" });
    await h.page.waitForFunction(() => !!document.querySelector("[data-pay-code-box] input[type=password]"), { timeout: 15000 });
    await typeCode(h, "0000");
    R.lockoutSurvivesReload = !(await text(h)).includes("賃金を表示中");
    await h.evaluate(() => sessionStorage.removeItem("ss_payCodeLock"));
    // 企業連携タブ: 法人の最低賃金 → 写しへ
    await h.clickExact("企業連携"); await h.page.waitForFunction(() => document.body.innerText.includes("法人の設定"), { timeout: 15000 });
    await h.evaluate(() => [...document.querySelectorAll("[data-co-entity] button")].find(b => b.innerText.trim() === "法人の設定").click());
    await h.page.waitForTimeout(200);
    R.minWageRows = await h.evaluate(() => document.querySelectorAll("[data-co-min-wage]").length);
    await h.clickExact("＋ 最低賃金を追加");
    await h.setInput("[data-co-min-wage='2'] input[type=date]", "2027-10-01");
    await h.setInput("[data-co-min-wage='2'] input[inputmode=numeric]", "1300");
    await h.clickExact("この法人の設定を保存"); await h.page.waitForTimeout(500);
    R.mirrorWage = await h.evaluate(() => ((window.__db("shops/S1/company/settings") || {}).wageSettings || {}).minWage);
    // 企業の閲覧パスコードの変更 → 企業と全店舗に同じハッシュ
    await h.evaluate(() => document.querySelector("[data-co-pay-code]").click()); await h.page.waitForTimeout(200);
    const mi = "[data-pay-code-modal] input";
    await h.page.$$eval(mi, els => els.forEach((el, i) => { const v = ["0000", "2468", "2468"][i]; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); }));
    R.coModalInputs = await h.evaluate(() => [...document.querySelectorAll("[data-pay-code-modal] input")].map(i => i.value));
    R.coChangeClick = await h.clickExact("変更する"); await h.page.waitForTimeout(600);
    R.coCf = await h.evaluate(() => (window.__cf || []).filter(c => c.name === "setCompanyPayCode").map(c => ({ cur: c.payload.currentCode, next: c.payload.newCode })));
    R.coCode = await h.evaluate(() => { const c = window.__db("companies/C1/private/payCode"), a = window.__db("shops/S1/private/payCode"), b = window.__db("shops/S2/private/payCode"); return { has: !!(c && c.hash), same: !!c && !!a && !!b && c.hash === a.hash && a.hash === b.hash }; });
    // 企業内登録スタッフ: 並びと賃金列
    await h.clickExact("一覧を開く");
    await h.page.waitForFunction(() => !!document.querySelector("table tbody tr td") && !document.body.innerText.includes("読み込み中..."), { timeout: 10000 });
    R.dirOrder = await h.evaluate(() => {
      const bar = document.querySelector("[data-pay-code-box]").parentElement;
      return [...bar.children].map(c => c.matches("[data-pay-code-box]") ? "パスコード" : (c.innerText || "").trim()).filter(Boolean).slice(0, 3);
    });
    R.dirHeaders = await h.evaluate(() => [...document.querySelectorAll("table thead th")].map(t => t.innerText.trim()));
    R.dirMasked = await h.evaluate(() => (document.querySelector('[data-co-wage="田中 太郎"]') || {}).innerText);
    await typeCode(h, "0000");
    R.dirOldCodeRejected = (await h.evaluate(() => (document.querySelector('[data-co-wage="田中 太郎"]') || {}).innerText)) === "••••";
    await typeCode(h, "2468");
    await h.page.waitForTimeout(400);
    R.dirWage = await h.evaluate(() => ({ t: (document.querySelector('[data-co-wage="田中 太郎"]') || {}).innerText, k: (document.querySelector('[data-co-wage="特定"]') || {}).innerText, helper: (document.querySelector('[data-co-wage="小林"]') || {}).innerText }));
    // 企業内登録スタッフの上部の「変更」（2026-10-01）
    const fill3 = async vals => h.page.$$eval("[data-pay-code-modal] input", (els, vs) => els.forEach((el, i) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, vs[i]); el.dispatchEvent(new Event("input", { bubbles: true })); }), vals);
    R.dirChangeBtn = await h.evaluate(() => { const b = [...document.querySelectorAll("[data-pay-code-box] button")].find(x => x.innerText.trim() === "変更"); if (!b) return false; b.click(); return true; });
    await h.page.waitForTimeout(200);
    R.dirModalFields = await h.evaluate(() => [...document.querySelectorAll("[data-pay-code-modal] input")].map(i => i.placeholder));
    const cfBefore = await h.evaluate(() => (window.__cf || []).filter(c => c.name === "setCompanyPayCode").length);
    await fill3(["1111", "1357", "1357"]); await h.clickExact("変更する"); await h.page.waitForTimeout(500);
    R.dirWrongCur = await h.evaluate(() => ({ open: !!document.querySelector("[data-pay-code-modal]"), err: (document.querySelector("[data-pay-code-err]") || {}).innerText || "" }));
    await fill3(["2468", "1357", "9999"]); await h.clickExact("変更する"); await h.page.waitForTimeout(300);
    R.dirMismatch = await h.evaluate(() => ({ open: !!document.querySelector("[data-pay-code-modal]"), err: (document.querySelector("[data-pay-code-err]") || {}).innerText || "" }));
    R.dirMismatchNoCall = (await h.evaluate(() => (window.__cf || []).filter(c => c.name === "setCompanyPayCode").length)) === cfBefore + 1;
    const hashBefore = await h.evaluate(() => (window.__db("companies/C1/private/payCode") || {}).hash);
    await fill3(["2468", "1357", "1357"]); await h.clickExact("変更する"); await h.page.waitForTimeout(700);
    R.dirChangeCf = await h.evaluate(() => (window.__cf || []).filter(c => c.name === "setCompanyPayCode").slice(-1).map(c => ({ cur: c.payload.currentCode, next: c.payload.newCode }))[0]);
    R.dirChanged = await h.evaluate(hb => { const c = window.__db("companies/C1/private/payCode"), a = window.__db("shops/S1/private/payCode"); return { closed: !document.querySelector("[data-pay-code-modal]"), newHash: !!c && c.hash !== hb, synced: !!c && !!a && c.hash === a.hash, msg: (document.querySelector("[data-co-person-msg]") || {}).innerText || "" }; }, hashBefore);
    R.dirRelocked = (await h.evaluate(() => (document.querySelector('[data-co-wage="田中 太郎"]') || {}).innerText)) === "••••";
    await typeCode(h, "1357"); await h.page.waitForTimeout(400);
    R.dirNewCodeUnlocks = (await h.evaluate(() => (document.querySelector('[data-co-wage="田中 太郎"]') || {}).innerText)) === "時給 1,300円";
  } catch (e) { R.exception = e.stack || e.message; }
  R.errors = h.errors.slice(); await h.close();

  // B. 連携していない店舗: 店舗自身でパスコードを変える
  h = await open("premium", false);
  try {
    await h.page.waitForFunction(() => !!document.querySelector("[data-pay-code-box]"), { timeout: 15000 });
    await h.clickExact("変更"); await h.page.waitForTimeout(200);
    await h.page.$$eval("[data-pay-code-modal] input", els => els.forEach((el, i) => { const v = ["0000", "1234", "1234"][i]; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); }));
    await h.clickExact("変更する"); await h.page.waitForTimeout(500);
    R.shopCode = await h.evaluate(() => { const c = window.__db("shops/S1/private/payCode"); return c ? { hashLen: c.hash.length, salt: !!c.salt } : null; });
    R.shopCodeNotInSettings = await h.evaluate(() => !JSON.stringify(window.__db("shops/S1/settings") || {}).includes("hash"));
    await h.evaluate(() => [...document.querySelectorAll("button")].find(b => b.getAttribute("aria-label") === "賃金を伏せる").click());
    await h.page.waitForTimeout(200);
    await typeCode(h, "0000");
    R.shopOldRejected = !(await text(h)).includes("賃金を表示中");
    await typeCode(h, "1234");
    R.shopNewAccepted = (await text(h)).includes("賃金を表示中");
    R.noDefaultHintAfterChange = !(await text(h)).includes("初期パスコードのままです");
  } catch (e) { R.exceptionB = e.stack || e.message; }
  R.errorsB = h.errors.slice(); await h.close();

  // C. Pro
  h = await open("pro", true);
  try {
    await h.page.waitForFunction(() => document.body.innerText.includes("スタッフ一覧"), { timeout: 15000 });
    await h.page.waitForTimeout(400);
    R.proNoBox = await h.evaluate(() => !document.querySelector("[data-pay-code-box]"));
    await openEdit(h, "田中");
    R.proNoButton = !(await text(h)).includes("賃金設定を開く →");
  } catch (e) { R.exceptionC = e.stack || e.message; }
  await h.close();

  // D. 375px
  h = await open("premium", true, { viewport: { width: 375, height: 812 } });
  try {
    await h.page.waitForFunction(() => !!document.querySelector("[data-pay-code-box]"), { timeout: 15000 });
    await openEdit(h, "特定"); await h.clickExact("賃金設定を開く →"); await h.page.waitForSelector("[data-staff-pay-page]");
    await typeCode(h, "0000");
    await h.clickExact("＋ 手当を追加");
    await h.page.waitForTimeout(200);
    R.mobile = await h.evaluate(() => ({ page: document.documentElement.scrollWidth, vw: innerWidth }));
    R.mobileFonts = await h.evaluate(() => [...document.querySelectorAll("[data-staff-pay-page] input:not([type=checkbox]),[data-staff-pay-page] select")].map(e => parseFloat(getComputedStyle(e).fontSize)).filter(f => f < 16).length);
  } catch (e) { R.exceptionD = e.stack || e.message; }
  R.errorsD = h.errors.slice(); await h.close();

  const v = {
    boxNextToHeading: R.boxNextToHeading === true,
    noDefaultHint: R.noDefaultHint === true,
    boxFont16: R.boxFont >= 16,
    helperNote: /賃金は所属店舗（B店）で設定します/.test(R.helperNote || "") && R.helperNoButton === true,
    opensFullPage: R.openBtn === "ok" && R.fullPage === true,
    maskedBeforeUnlock: R.maskedBefore > 0 && R.noYenInputsBefore === true && R.saveDisabledBefore === true,
    parttimeDefaultHourly: R.defaultHourly === true,
    unlockWith0000: R.unlocked === true,
    minWageRed: !!R.redAt1230 && R.redAt1230[0] === "0" && R.redAt1230[1] === "rgb(220, 38, 38)" && R.redAt1230[2].includes("1,231円"),
    minWageGreen: R.greenAt1231 === "1",
    savedToPrivate: !!R.saved && R.saved.payType === "hourly" && R.saved.base === 1231 && R.saved.effectiveFrom === "2026-10-01" && R.saved.commute.amount === 500 && R.saved.commute.per === "day" && R.notInSettings === true,
    revisionAddsVersion: !!R.revised && R.revised.base === 1300 && R.revised.effectiveFrom === "2027-04-01" && Array.isArray(R.revised.history) && R.revised.history.length === 1 && R.revised.history[0].base === 1231 && /2026-10-01 から/.test(R.historyShown || ""),
    backConfirmsAndReturns: R.confirmedOnDirtyBack === 1 && R.backToModal === true,
    yenMarkOnly: R.yenMark === true,
    unlockCarriedAcrossPages: R.unlockedCarried === true,
    employeeMonthlyFixed: R.employeeNoToggle === true && R.employeeNoHourly === true && R.employeeSaved === "monthly",
    companyAttrMonthlyDefault: R.coAttrMonthly === true,
    fixedOt46199: R.fixedOtShown === "46,199円" && !!R.coSaved && R.coSaved.fixedOt.amount === 46199 && R.coSaved.fixedOt.hours === 30 && R.coSaved.fixedOt.auto === true
      && R.coSaved.fixedNight.hours === 32 && R.coSaved.fixedNight.amount === 10000
      && JSON.stringify(R.coSaved.allowances) === JSON.stringify([{ name: "資格手当", amount: 5000, excludeFromRate: true, excludeFromDeduction: false }]),
    relockButton: R.relockedByButton === true && R.reunlocked === true,
    relockIdle: R.relockedByIdle === true,
    relockReload: R.relockedByReload === true,
    linkedChangeNote: /企業連携タブの「企業アカウント」か、「企業内登録スタッフ」の一覧の上部にある「変更」で変更/.test(R.linkedChangeNote || ""),
    renameFollows: !!R.renamed && R.renamed.old === null && R.renamed.next === true,
    // K1（2026-10-04）: 編集モーダルの保存ボタンは「保存」1つだけで、それを押して改名が通る
    editSaveIsOnly: R.saveBtnCount === 1 && R.saveClick === "ok",
    deleteFollows: R.dropped === null,
    lockoutAfter5: /60秒待って|秒待ってから/.test(R.lockout || "") && R.lockoutHolds === true && R.lockoutSurvivesReload === true,
    entityMinWage: JSON.stringify(R.mirrorWage) === JSON.stringify([{ from: "2025-10-01", yen: 1177 }, { from: "2026-10-01", yen: 1231 }, { from: "2027-10-01", yen: 1300 }]) && R.minWageRows === 2,
    companyCodeSynced: !!R.coCode && R.coCode.has && R.coCode.same,
    dirOrder: JSON.stringify(R.dirOrder) === JSON.stringify(["従業員番号順", "店舗別", "パスコード"]),
    dirWageColumn: Array.isArray(R.dirHeaders) && JSON.stringify(R.dirHeaders.slice(-2)) === JSON.stringify(["賃金", ""]) /* 最後は「編集」の列（P1b・見出しなし） */ && R.dirMasked === "••••" && R.dirOldCodeRejected === true
      && !!R.dirWage && R.dirWage.t === "時給 1,300円" && R.dirWage.k === "月給 213,500円" && R.dirWage.helper === "—",
    dirChangeButton: R.dirChangeBtn === true && JSON.stringify(R.dirModalFields) === JSON.stringify(["現在", "新しい番号", "新しい番号（確認）"])
      && !!R.dirWrongCur && R.dirWrongCur.open && /現在のパスコードが正しくありません/.test(R.dirWrongCur.err)
      && !!R.dirMismatch && R.dirMismatch.open && /新しいパスコードが一致しません/.test(R.dirMismatch.err) && R.dirMismatchNoCall === true
      && !!R.dirChangeCf && R.dirChangeCf.cur === "2468" && R.dirChangeCf.next === "1357"
      && !!R.dirChanged && R.dirChanged.closed && R.dirChanged.newHash && R.dirChanged.synced && /変更しました/.test(R.dirChanged.msg)
      && R.dirRelocked === true && R.dirNewCodeUnlocks === true,
    shopOwnCode: !!R.shopCode && R.shopCode.hashLen === 64 && R.shopCode.salt && R.shopCodeNotInSettings === true && R.shopOldRejected === true && R.shopNewAccepted === true && R.noDefaultHintAfterChange === true,
    hiddenOnPro: R.proNoBox === true && R.proNoButton === true,
    mobileNoPageScroll: !!R.mobile && R.mobile.page <= R.mobile.vw && R.mobileFonts === 0,
    noErrors: R.errors.length === 0 && R.errorsB.length === 0 && R.errorsD.length === 0 && !R.exception && !R.exceptionB && !R.exceptionC && !R.exceptionD,
  };
  v.allPass = Object.values(v).every(Boolean);
  console.log(JSON.stringify({ R, verdict: v }, null, 2));
  process.exit(v.allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
