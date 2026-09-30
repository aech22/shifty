// 企業連携タブのカードの並びと「企業内登録スタッフ」（2026-09-28）の実ブラウザ回帰テスト。
// アプリ全体をスタブ Firebase（stub-firebase.js）で動かす。Firebase へは1バイトも出ない。
//
//  - 企業連携タブのカードが シフトの提出状況 → 企業内登録スタッフ → 企業アカウント → 連携店舗 → 企業の共通設定 の順
//  - 「一覧を開く」で全画面の一覧に差し替わり、タブバーが消える。「← 戻る」で企業連携タブに戻る
//  - 既定は従業員番号順（数字のみ→数字＋文字→文字の50音→番号なし）。「店舗別」で所属店舗ごとに区切る
//  - ヘルプ先での登録（所属店舗側にも同名がいる）は1行にまとめる。所属店舗側に居なければヘルプ先の行で残る
//  - 数字だけの同じ従業員番号は1行にまとめ、名前はフルネームに寄せ、所属店舗を全部並べる（2026-09-29）
//  - 設定タブの管理コードの見出しは「店舗管理コード」（2026-09-29）
//  - 有給は「付与／残」。凍結値の無い期間がある人は残日数の前に「＋」
//  - 番号・名前で検索できる。提出データ（shops/{sid}/subs）は読みに行かない
//  - Pro ではカードが出ない。375px 幅でページ全体が横に動かない
//  - 賃金列（P6a）はパスコードを入れるまで全行「••••」（解除後の中身は example-staff-pay.js が測る）
//  - PC（1400×900・賃金列あり）で、長いフルネーム＋別の登録名＋所属店舗2つ＋企業属性の行があっても表が横スクロールしない
//    （pcNoScroll・2026-09-30。外枠 maxWidth:900 では scrollWidth 928 ＞ clientWidth 898 で落ちる）
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-company-staff-directory.js → allPass=true / EXIT=0
"use strict";
const path = require("node:path");
const { openHarness, REPO_ROOT } = require(path.join(__dirname, "mount-component.js"));
const { makeStub } = require(path.join(__dirname, "stub-firebase.js"));
const ROOT = process.env.SHIFTY_ROOT || REPO_ROOT;
const THEME = `<style>:root{--c-bg:#F0F2F5;--c-card:#FFFFFF;--c-input:#F3F4F6;--c-input2:#F0F2F5;` +
  `--c-border:#E5E7EB;--c-border2:#D1D5DB;--c-text:#1A1A2E;--c-text2:#374151;--c-text3:#6B7280;` +
  `--c-text4:#9CA3AF;--c-shadow:rgba(0,0,0,.06);--c-accent:#f87036;--c-danger:#DC2626;}</style>`;
const UID = "U1", CID = "C1";
const per = (id, sid, start, lt) => ({ id, urlToken: "t" + id, shopId: sid, label: id, startDate: start, endDate: start, deadlineDate: "", createdAt: "2026-04-01T00:00:00.000Z", ...(lt ? { laborTotals: lt } : {}) });
const shop = (sid, staff, settings, periods) => ({ owners: { [UID]: "K" + sid }, private: { adminKey: "K" + sid }, staff, settings: { shopId: sid, candidates: [], ...settings }, periods });
const seed = plan => ({
  global: { shops: { S1: { id: "S1", name: "A店" }, S2: { id: "S2", name: "B店" }, S3: { id: "S3", name: "C店" } } },
  shops: {
    S1: shop("S1", ["田中", "佐藤", "__spacer__1", "鈴木", "森"],
      { staffNumbers: { "田中": "12", "佐藤": "3", "鈴木": "2A", "森": "40" }, staffAttributes: { "田中": "employee" }, paidLeaveGranted: { "田中": 20 } },
      { a: per("a", "S1", "2026-05-01", { "田中": { paid: 1 } }), b: per("b", "S1", "2026-06-01", { "田中": { paid: 0.5 } }), c: per("c", "S1", "2026-07-01", null) }),
    S2: shop("S2", ["田中", "山田", "高橋", "森 花子"],
      { staffNumbers: { "田中": "12", "山田": "10", "高橋": "い", "森 花子": "40" }, staffHomeShop: { "田中": "S1" }, paidLeaveGranted: { "山田": 10 } },
      { d: per("d", "S2", "2026-05-01", { "山田": { paid: 2 }, "田中": { paid: 5 } }) }),
    S3: shop("S3", ["伊藤", "渡辺", "中村", "小林"],
      { staffNumbers: { "伊藤": "ア", "中村": "10B", "小林": "5" }, staffHomeShop: { "小林": "S1" } }, {}),
  },
  accounts: { S1: { plan }, [UID]: { shops: { S1: true, S2: true, S3: true }, company: { companyId: CID, code: "ABCD1234", name: "テスト企業" } } },
  companies: { [CID]: { pub: { name: "テスト企業", ownerUid: UID, code: "ABCD1234", shops: { S1: true, S2: true, S3: true }, config: {} } } },
});
// PC 幅の測定用（2026-09-30）。本番の名前は長い（フルネーム）ので、長い名前を2店舗に同じ番号で登録した行（所属店舗が2つ）と
// 長めの店舗名・有給の付与を入れる。賃金列（premium）あり。既存の seed を変えると並びの期待値が動くので別にする
const seedWide = () => ({
  global: { shops: { S1: { id: "S1", name: "鷄えん 東通り店" }, S2: { id: "S2", name: "鷄えん 三番街店" } } },
  shops: {
    S1: shop("S1", ["グエン ティ ホン ニュン", "田中 太郎"],
      { staffNumbers: { "グエン ティ ホン ニュン": "1234", "田中 太郎": "12" }, staffAttributes: { "グエン ティ ホン ニュン": "custom_tokutei1" },
        staffTypeLimits: { custom_tokutei1: { name: "特定技能1号（外食業）" } }, paidLeaveGranted: { "グエン ティ ホン ニュン": 20 } },
      { a: per("a", "S1", "2026-05-01", { "グエン ティ ホン ニュン": { paid: 1.5 } }), c: per("c", "S1", "2026-07-01", null) }),
    // 2店舗目はローマ字表記（同じ番号・名前が食い違う＝「別の登録名」が名前の列に折り返さずに出る）
    S2: shop("S2", ["NGUYEN THI HONG NHUNG", "佐藤"], { staffNumbers: { "NGUYEN THI HONG NHUNG": "1234", "佐藤": "3" } }, {}),
  },
  accounts: { S1: { plan: "premium" }, [UID]: { shops: { S1: true, S2: true }, company: { companyId: CID, code: "ABCD1234", name: "テスト企業" } } },
  companies: { [CID]: { pub: { name: "テスト企業", ownerUid: UID, code: "ABCD1234", shops: { S1: true, S2: true }, config: {} } } },
});
const TITLES = ["シフトの提出状況", "企業内登録スタッフ", "企業アカウント", "連携店舗", "企業の共通設定"];
const tableRows = () => [...document.querySelectorAll("table tbody tr")].map(tr => [...tr.querySelectorAll("td")].map(td => td.innerText.trim()));

async function open(plan, viewport, seedObj) {
  return openHarness({
    root: ROOT, jsx: "window.__harnessReady=true;", waitFor: "#root > *", viewport: viewport || { width: 1200, height: 900 },
    extraHead: THEME + makeStub({ seed: seedObj || seed(plan), uid: UID, view: "admin", tab: "company" }),
    scripts: ["app-utils.js", "app-core.js", "app-staff.js", "app-admin.js", "app-shift.js", "app-company.js", "app-main.js"].map(src => ({ src, babel: !/utils|core/.test(src) })),
  });
}

(async () => {
  const R = {};
  let h = await open("premium");
  try {
    await h.page.waitForFunction(() => document.body.innerText.includes("企業内登録スタッフ") && document.body.innerText.includes("企業の共通設定を保存"), { timeout: 15000 });
    R.order = await h.evaluate(t => {
      const els = [...document.querySelectorAll("div")].filter(d => t.includes((d.innerText || "").trim()) && d.children.length === 0 && getComputedStyle(d).fontWeight === "700");
      return els.map(e => e.innerText.trim());
    }, TITLES);
    await h.clickExact("一覧を開く");
    await h.page.waitForFunction(() => !!document.querySelector("table tbody tr td") && !document.body.innerText.includes("読み込み中..."), { timeout: 10000 });
    R.tabBarGone = await h.evaluate(() => ![...document.querySelectorAll("button")].some(b => b.innerText.trim() === "期間"));
    R.numberRows = await h.evaluate(tableRows);
    R.count = await h.evaluate(() => [...document.querySelectorAll("span")].map(s => s.innerText.trim()).find(t => /^\d+名$/.test(t)) || null);
    await h.clickExact("店舗別"); await h.page.waitForTimeout(200);
    R.shopRows = await h.evaluate(tableRows);
    await h.clickExact("従業員番号順");
    const search = async q => { await h.setInput('input[placeholder="従業員番号・名前で検索"]', q); await h.page.waitForTimeout(150); return h.evaluate(() => [...document.querySelectorAll("table tbody tr")].map(tr => tr.querySelectorAll("td")[1]?.innerText.trim())); };
    R.q12 = await search("12"); R.qYama = await search("山"); R.qMori = await search("森"); await search("");
    R.searchFont = await h.evaluate(() => parseFloat(getComputedStyle(document.querySelector('input[placeholder="従業員番号・名前で検索"]')).fontSize));
    R.reads = await h.evaluate(() => (window.__reads || []).filter(p => /\/subs/.test(p)));
    await h.clickExact("← 戻る"); await h.page.waitForTimeout(300);
    R.back = await h.evaluate(() => document.body.innerText.includes("企業アカウント") && [...document.querySelectorAll("button")].some(b => b.innerText.trim() === "企業連携"));
    await h.clickExact("設定"); await h.page.waitForTimeout(400);
    R.settingsTitle = await h.evaluate(() => ({ now: document.body.innerText.includes("店舗管理コード"), old: document.body.innerText.includes("この端末の管理コード") }));
  } catch (e) { R.exception = e.message; }
  R.errors = h.errors.slice(); await h.close();

  h = await open("pro");
  try {
    await h.page.waitForFunction(() => document.body.innerText.includes("企業アカウント"), { timeout: 15000 });
    await h.page.waitForTimeout(500);
    R.proCard = await h.evaluate(() => [...document.querySelectorAll("button")].some(b => b.innerText.trim() === "一覧を開く"));
  } catch (e) { R.exceptionPro = e.message; }
  await h.close();

  h = await open("premium", { width: 375, height: 812 });
  try {
    await h.page.waitForFunction(() => [...document.querySelectorAll("button")].some(b => b.innerText.trim() === "一覧を開く"), { timeout: 15000 });
    await h.clickExact("一覧を開く");
    await h.page.waitForFunction(() => !!document.querySelector("table tbody tr td"), { timeout: 10000 });
    await h.page.waitForTimeout(300);
    R.mobile = await h.evaluate(() => ({ page: document.documentElement.scrollWidth, vw: innerWidth, tableScrolls: [...document.querySelectorAll("div")].some(d => getComputedStyle(d).overflowX === "auto" && d.scrollWidth > d.clientWidth) }));
    R.mobileTable = await h.evaluate(() => { const box = document.querySelector("table").parentElement; return { scrollWidth: box.scrollWidth, clientWidth: box.clientWidth,
      edit: [...document.querySelectorAll("tr[data-co-person] button")].filter(x => x.innerText.trim() === "編集").slice(0, 1).map(b => { const r = b.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right)]; })[0] || null }; });
  } catch (e) { R.exceptionMobile = e.message; }
  await h.close();

  // PC（1400×900・賃金列あり）で表が横スクロールしない（2026-09-30 ユーザー指示「PC画面ではスクロールしないで表示されるように」）
  h = await open("premium", { width: 1400, height: 900 }, seedWide());
  try {
    await h.page.waitForFunction(() => [...document.querySelectorAll("button")].some(b => b.innerText.trim() === "一覧を開く"), { timeout: 15000 });
    await h.clickExact("一覧を開く");
    await h.page.waitForFunction(() => !!document.querySelector("table tbody tr td") && !document.body.innerText.includes("読み込み中..."), { timeout: 10000 });
    await h.page.waitForTimeout(400);
    R.pc = await h.evaluate(() => {
      const box = document.querySelector("table").parentElement;
      const heads = [...document.querySelectorAll("table thead th")].map(t => t.innerText.trim());
      const long = [...document.querySelectorAll("tr[data-co-person]")].find(tr => /グエン|NGUYEN/.test(tr.querySelectorAll("td")[1].innerText || ""));
      return { scrollWidth: box.scrollWidth, clientWidth: box.clientWidth, page: document.documentElement.scrollWidth, vw: innerWidth, heads,
        longRow: long ? [...long.querySelectorAll("td")].map(td => td.innerText.trim()) : null,
        edit: [...document.querySelectorAll("tr[data-co-person] button")].filter(x => x.innerText.trim() === "編集").map(b => { const r = b.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right)]; }) };
    });
  } catch (e) { R.exceptionPc = e.message; }
  R.errorsPc = h.errors.slice(); await h.close();

  // 列は 従業員番号・名前・属性・所属店舗・有給・賃金・編集 の7つ（賃金は P6a、編集は P1b・2026-09-30。パスコードを入れるまで「••••」）
  const names = rows => rows.filter(r => r.length === 7).map(r => r[1].replace(/非表示中$/, ""));
  const v = {
    cardOrder: JSON.stringify(R.order) === JSON.stringify(TITLES),
    opensFullPage: R.tabBarGone === true,
    numberOrder: !!R.numberRows && JSON.stringify(names(R.numberRows)) === JSON.stringify(["佐藤", "小林", "山田", "田中", "森 花子", "鈴木", "中村", "伊藤", "高橋", "渡辺"]),
    helpDeduped: !!R.numberRows && names(R.numberRows).filter(n => n === "田中").length === 1,
    helpOnlyRowKept: !!R.numberRows && (R.numberRows.find(r => r[1] === "小林") || [])[3] === "A店",
    paidWithPlus: !!R.numberRows && (R.numberRows.find(r => r[1] === "田中") || [])[4] === "付与 20／残 ＋18.5",
    paidNoPlus: !!R.numberRows && (R.numberRows.find(r => r[1] === "山田") || [])[4] === "付与 10／残 8",
    paidUnset: !!R.numberRows && (R.numberRows.find(r => r[1] === "佐藤") || [])[4] === "—",
    count: R.count === "10名",
    // 2店舗に登録があって所属店舗が明示されていない人には「所属店舗を設定してください」が付く（P3.6・ヘルプ先の合算先が決まらないため）
    numberMerged: !!R.numberRows && JSON.stringify(R.numberRows.find(r => r[0] === "40")) === JSON.stringify(["40", "森 花子", "未設定", "A店・B店\n所属店舗を設定してください", "—", "••••", "編集"]),
    wageMasked: !!R.numberRows && R.numberRows.filter(r => r.length === 7).every(r => r[5] === "••••"),
    shopGroups: !!R.shopRows && JSON.stringify(R.shopRows.filter(r => r.length === 1).map(r => r[0])) === JSON.stringify(["A店", "B店", "C店"])
      && JSON.stringify(names(R.shopRows)) === JSON.stringify(["佐藤", "小林", "田中", "森 花子", "鈴木", "山田", "高橋", "中村", "伊藤", "渡辺"]),
    search: JSON.stringify(R.q12) === JSON.stringify(["田中"]) && JSON.stringify(R.qYama) === JSON.stringify(["山田"]) && JSON.stringify(R.qMori) === JSON.stringify(["森 花子"]),
    font16: R.searchFont >= 16,
    noSubsRead: Array.isArray(R.reads) && R.reads.length === 0,
    backToCompanyTab: R.back === true,
    settingsTitle: !!R.settingsTitle && R.settingsTitle.now === true && R.settingsTitle.old === false,
    hiddenOnPro: R.proCard === false,
    mobileNoPageScroll: !!R.mobile && R.mobile.page <= R.mobile.vw,   // SHIFTY_DEVICE で端末幅が変わっても成り立つよう実幅と比べる
    pcNoScroll: !!R.pc && Array.isArray(R.pc.heads) && R.pc.heads.includes("賃金") && !!R.pc.longRow && /NGUYEN THI HONG NHUNG/.test(R.pc.longRow[1]) && /特定技能1号/.test(R.pc.longRow[2])
      && /鷄えん 東通り店・鷄えん 三番街店/.test(R.pc.longRow[3]) && R.pc.scrollWidth <= R.pc.clientWidth && R.pc.page <= R.pc.vw,
    noErrors: R.errors.length === 0 && !R.exception && !R.exceptionPro && !R.exceptionMobile && !R.exceptionPc && Array.isArray(R.errorsPc) && R.errorsPc.length === 0,
  };
  v.allPass = Object.values(v).every(Boolean);
  console.log(JSON.stringify({ R, verdict: v }, null, 2));
  process.exit(v.allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
