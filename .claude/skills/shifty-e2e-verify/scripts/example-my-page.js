// スタッフ個別URL（2026-10-04・ユーザーの仕様変更）の回帰テスト。アプリ全体をスタブ Firebase で動かす（Firebase・Cloud Functions へは1バイトも出ない）。
// **セキュリティルールは評価しない**（ルールの形は tests/my.test.js、CF 本体は shifty-cf-verify の example-my-page.js）。
//
//  S（スタッフ・375px・匿名）: 募集URL → 「自分専用のURLを作る」→ 名前と番号で申請 → その場で個別URL（コピー）と「承認待ち」。
//     staffPageTokens と staffPages（pending・name なし）だけが書かれる。横はみ出し無し・入力欄 16px 以上
//  P（別の端末＝新しい匿名 uid）: 承認前の個別URLは「承認待ち」の画面（URL つき）
//  O（オーナー・1200px）: スタッフタブの「個別URLの申請」→ 候補（番号・名前の一致）が選ばれた状態 → 承認 → status approved・name・approvedAt・byUid
//  V（さらに別の端末）: 同じURLでそのスタッフの画面（本人のカレンダー）。uid は S・P と違う
//  SB（P2・提出）: 佐藤の個別URLの「提出」タブ＝最新期間・名前は固定（入力欄なし）→ 通し → 提出 → subs に staffName 佐藤 の提出。
//     田中（提出済み）は「提出完了」から修正して同じ提出（s1）を更新する。送信の帯は下部タブの上。確定済みの期間は提出できない（書き込みなし）
//  AL（P3・全員の表）: 「自分のシフト」「全員のシフト」をタップと横スクロール（ホイール）で切り替え。未公開は「まだ公開されていません」。
//     公開済みは確定値（調整後の時刻）で、空白列は残し・非表示の人は出さず・本人の列に印。10人×16日と30人×31日で 375px に収まる（横スクロール0）
//     ことと文字サイズを実測。ピンチで拡大した状態（Chromium の page scale）では横スクロールを止める
//  F（オーナー）: 2人目を佐藤として承認 → 改名（佐藤 → 佐藤 花子）で name が移る → 削除で revoked → 同じ名前で再登録しても revoked のまま
//  X（オーナー）: 編集モーダルから田中の個別URLを取り消す → 開くと「使えなくなりました」
//  R（閲覧専用の端末）と PROD（本番相当 MY_SCREEN_ENABLED=false）: 申請の一覧が出ない／募集URLに入口が無く #/m/ は個別URLとして開かない
//  すべての場面で console.error・pageerror が 0 件
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-my-page.js → allPass=true / EXIT=0
//       SHIFTY_ENGINE=webkit SHIFTY_DEVICE="iPhone 13" node ... でも通る（端末の画面サイズで開くので 375/320 の指定は 390 になる・ピンチの項目は除く）
// 反証: SHIFTY_ROOT=<73942db の配信物> node ... → EXIT=1（入口が無い）
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { openHarness, REPO_ROOT } = require(path.join(__dirname, "mount-component.js"));
const { makeStub } = require(path.join(__dirname, "stub-firebase.js"));
const ROOT = process.env.SHIFTY_ROOT || REPO_ROOT;
const SCRIPTS = ["app-utils.js", "app-my-utils.js", "app-core.js", "app-staff.js", "app-admin.js", "app-shift.js", "app-company.js", "app-my.js", "app-main.js"].map(src => ({ src, babel: !/utils|core/.test(src) }));
const PHONE = { width: 375, height: 812 };
const OWN = "OWN";
const pad = n => String(n).padStart(2, "0");
const now = new Date();
const TODAY = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const YM = TODAY.slice(0, 7);
const LAST = `${YM}-${pad(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate())}`;
const seed0 = () => ({
  global: { shops: { S1: { id: "S1", name: "A店" } } },
  shops: { S1: { owners: { [OWN]: "K1" }, private: { adminKey: "K1" }, staff: ["田中", "佐藤", "鈴木"],
    settings: { shopId: "S1", candidates: [{ start: "10:00", end: "15:00" }], staffNumbers: { "田中": "012" } },
    periods: { p1: { id: "p1", urlToken: "t1", shopId: "S1", label: "今月", startDate: `${YM}-01`, endDate: LAST, deadlineDate: "", createdAt: "2026-09-01T00:00:00.000Z" } },
    subs: { s1: { id: "s1", periodId: "p1", shopId: "S1", staffName: "田中", submittedAt: "2026-09-02T00:00:00Z", shifts: { [TODAY]: { status: "work", start: "10:00", end: "15:00" } } } } } },
  tokens: { t1: { shopId: "S1", periodId: "p1" } },
  accounts: { S1: { plan: "premium" }, [OWN]: { shops: { S1: true } } },
});
const hashHead = h => `<script>history.replaceState(null,"","/${h}");</script>`;

function prodRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "shifty-page-prod-"));
  for (const s of SCRIPTS) fs.copyFileSync(path.join(ROOT, s.src), path.join(root, s.src));
  fs.copyFileSync(path.join(ROOT, "index.html"), path.join(root, "index.html"));
  const core = fs.readFileSync(path.join(ROOT, "app-core.js"), "utf8");
  const swapped = core.replace('const DEV_MODE = location.hostname !== "shiftyshifty.app";', "const DEV_MODE = false;");
  if (swapped === core) throw new Error("DEV_MODE の行が見つからない");
  fs.writeFileSync(path.join(root, "app-core.js"), swapped);
  return root;
}
// スタッフの端末（匿名。auth:"accounts" で cur を空にすると起動時に新しい匿名 uid が作られる＝別の端末）
async function openAnon({ hash, db, viewport = PHONE, root = ROOT, wait = "#root > *", cfHandlers }) {
  return openHarness({ root, jsx: "window.__harnessReady=true;", waitFor: wait, viewport,
    extraHead: hashHead(hash) + makeStub({ seed: db, view: "staff", tab: "periods", auth: "accounts", authSeed: { users: {}, cur: null }, cfHandlers }), scripts: SCRIPTS });
}
async function openOwner({ db, uid = OWN, viewport = { width: 1200, height: 900 }, root = ROOT }) {
  return openHarness({ root, jsx: "window.__harnessReady=true;", waitFor: "#root > *", viewport,
    extraHead: makeStub({ seed: db, uid, view: "admin", tab: "staff" }), scripts: SCRIPTS });
}
const sleep = (h, ms) => h.page.waitForTimeout(ms);
const waitSel = (h, s, ms = 15000) => h.page.waitForSelector(s, { timeout: ms }).then(() => true, () => false);
const waitText = (h, t, ms = 15000) => h.page.waitForFunction(t => document.body.innerText.includes(t), t, { timeout: ms }).then(() => true, () => false);
const click = (h, sel) => h.evaluate(sel => { const e = document.querySelector(sel); if (!e) return false; e.click(); return true; }, sel);
const db = (h, p) => h.evaluate(p => window.__db(p), p);
const overflowX = h => h.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
const inputFonts = h => h.evaluate(() => [...document.querySelectorAll("input,select,textarea")].filter(i => i.offsetParent).map(i => parseFloat(getComputedStyle(i).fontSize)));
const openEdit = async (h, n) => { const r = await h.clickExact("編集", { rowText: n }); await sleep(h, 250); return r; };
const closeEdit = h => h.clickExact("閉じる");
// clickExact は押せなかったとき例外を投げない（返り値で知らせる）ので、押せたことを確かめる
const assert1 = r => { if (r !== "ok") throw new Error("ボタンが押せない: " + r); };
const tokenOf = url => (String(url || "").match(/#\/m\/([A-Za-z0-9]+)/) || [])[1] || "";
// 募集URLから申請して個別URLのトークンを返す
async function requestPage(h, name, number) {
  await click(h, '[data-page-register-open="form"]');
  await waitSel(h, "[data-page-register]");
  await h.setInput('[data-my-input="pageDisplayName"]', name);
  if (number) await h.setInput('[data-my-input="pageNumber"]', number);
  await click(h, '[data-my-action="requestPage"]');
  await waitSel(h, '[data-my-page-made="pending"]');
  return tokenOf(await h.evaluate(() => document.querySelector("[data-my-page-url]").getAttribute("data-my-page-url")));
}

(async () => {
  const R = {}, V = {};
  let dump = null, T1 = "", T2 = "";
  // ---------------- S: 申請 ----------------
  {
    const h = await openAnon({ hash: "#/s/t1", db: seed0(), wait: '[data-page-register-open="form"]' });
    try {
      const S = {};
      S.uid = await h.evaluate(() => window.__authCur().uid);
      T1 = await requestPage(h, "田中", "０１２");
      S.token = T1;
      S.tokenRec = await db(h, `staffPageTokens/${T1}`);
      S.pageRec = await db(h, `shops/S1/staffPages/${T1}`);
      S.urlText = await h.evaluate(() => document.querySelector("[data-my-page-url]").innerText);
      S.status = await h.evaluate(() => document.querySelector("[data-my-page-made]").innerText);
      S.overflow = await overflowX(h);
      S.fonts = await inputFonts(h);
      await h.page.setViewportSize({ width: 320, height: 700 });
      await sleep(h, 200);
      S.overflow320 = await overflowX(h);
      // 店舗のデータへの書き込みは staffPages だけ（subs・settings・staff は変わらない）
      const d = await h.evaluate(() => window.__dbDump());
      S.subsSame = JSON.stringify(d.shops.S1.subs) === JSON.stringify(seed0().shops.S1.subs);
      S.staffSame = JSON.stringify(d.shops.S1.staff) === JSON.stringify(seed0().shops.S1.staff);
      S.errors = h.errors.slice();
      dump = d;
      R.S = S;
      V.S_tokenShape = /^[A-Za-z0-9]{24}$/.test(T1);
      V.S_written = !!S.tokenRec && S.tokenRec.shopId === "S1" && !!S.pageRec && S.pageRec.status === "pending" && S.pageRec.displayName === "田中" &&
        S.pageRec.number === "012" && !("name" in S.pageRec) && typeof S.pageRec.requestedAt === "string";
      V.S_urlShown = S.urlText.includes("#/m/" + T1) && /承認を待っています/.test(S.status);
      V.S_storeUntouched = S.subsSame && S.staffSame;
      V.S_layout = S.overflow <= 0 && S.overflow320 <= 0 && S.fonts.length > 0 && S.fonts.every(f => f >= 16);
      V.S_noErrors = S.errors.length === 0;
    } finally { await h.browser.close(); }
  }
  // ---------------- P: 承認前に別の端末で開く ----------------
  {
    const h = await openAnon({ hash: "#/m/" + T1, db: dump, wait: "[data-my-page-state],[data-my-view]" });
    try {
      const P = {};
      P.state = await h.evaluate(() => (document.querySelector("[data-my-page-state]") || {}).getAttribute ? document.querySelector("[data-my-page-state]").getAttribute("data-my-page-state") : null);
      P.url = await h.evaluate(() => (document.querySelector("[data-my-page-url]") || {}).getAttribute ? document.querySelector("[data-my-page-url]").getAttribute("data-my-page-url") : "");
      P.uid = await h.evaluate(() => window.__authCur().uid);
      P.overflow = await overflowX(h);
      P.errors = h.errors.slice();
      R.P = P;
      V.P_pendingScreen = P.state === "pending" && tokenOf(P.url) === T1 && P.overflow <= 0;
      V.P_noErrors = P.errors.length === 0;
    } finally { await h.browser.close(); }
  }
  // 2人目の申請（番号も名前も一致しない＝未一致）
  {
    const h = await openAnon({ hash: "#/s/t1", db: dump, wait: '[data-page-register-open="form"]' });
    try { T2 = await requestPage(h, "さとう"); dump = await h.evaluate(() => window.__dbDump()); } finally { await h.browser.close(); }
  }
  // ---------------- O: 承認 ----------------
  {
    const h = await openOwner({ db: dump });
    try {
      const O = {};
      O.card = await waitText(h, "個別URLの申請");
      await waitSel(h, `[data-page-request="${T1}"]`);
      O.sel1 = await h.evaluate(t => document.querySelector(`[data-page-request-name="${t}"]`).value, T1);
      O.sel2 = await h.evaluate(t => document.querySelector(`[data-page-request-name="${t}"]`).value, T2);
      O.cand1 = await h.evaluate(t => document.querySelector(`[data-page-request="${t}"]`).innerText, T1);
      await click(h, `[data-page-approve="${T1}"]`);
      await h.page.waitForFunction(t => !document.querySelector(`[data-page-request="${t}"]`), T1, { timeout: 8000 }).catch(() => {});
      O.rec1 = await db(h, `shops/S1/staffPages/${T1}`);
      // 2人目は佐藤を選んで承認
      await h.page.selectOption(`[data-page-request-name="${T2}"]`, "佐藤");
      await click(h, `[data-page-approve="${T2}"]`);
      await h.page.waitForFunction(t => !document.querySelector(`[data-page-request="${t}"]`), T2, { timeout: 8000 }).catch(() => {});
      O.rec2 = await db(h, `shops/S1/staffPages/${T2}`);
      // 編集モーダルに承認済みの個別URL
      await openEdit(h, "田中");
      O.editSection = await h.evaluate(() => { const e = document.querySelector('[data-staff-page="approved"]'); return e ? e.getAttribute("data-staff-page-token") : null; });
      await closeEdit(h);
      O.overflow = await overflowX(h);
      O.errors = h.errors.slice();
      dump = await h.evaluate(() => window.__dbDump());
      R.O = O;
      V.O_card = O.card;
      V.O_candidatePreselected = O.sel1 === "田中" && /従業員番号が一致/.test(O.cand1) && O.sel2 === "";
      V.O_approved = !!O.rec1 && O.rec1.status === "approved" && O.rec1.name === "田中" && typeof O.rec1.approvedAt === "string" && O.rec1.byUid === OWN;
      V.O_approvedPicked = !!O.rec2 && O.rec2.status === "approved" && O.rec2.name === "佐藤";
      V.O_editSection = O.editSection === T1;
      V.O_noErrors = O.errors.length === 0 && O.overflow <= 0;
    } finally { await h.browser.close(); }
  }
  // ---------------- V: 承認後に別の端末で開く ----------------
  {
    const h = await openAnon({ hash: "#/m/" + T1, db: dump, wait: '[data-my-view="page"],[data-my-page-state]' });
    try {
      const W = {};
      W.view = await h.evaluate(() => { const e = document.querySelector('[data-my-view="page"]'); return e ? e.getAttribute("data-my-page-name") : null; });
      W.shift = await waitSel(h, "[data-my-shift]");
      W.uid = await h.evaluate(() => window.__authCur().uid);
      W.tabs = await h.evaluate(() => [...document.querySelectorAll("[data-my-tab]")].map(b => b.getAttribute("data-my-tab")));
      await h.page.waitForFunction(() => !/読み込み中/.test((document.querySelector("[data-my-shift]") || {}).innerText || "x"), null, { timeout: 15000 }).catch(() => {});
      W.todayKinds = await h.evaluate(d => { const c = document.querySelector(`[data-my-cal-day="${d}"]`); return c ? c.getAttribute("data-my-cal-kinds") : null; }, TODAY);
      await click(h, '[data-my-tab="settings"]');
      W.settings = await waitSel(h, '[data-my-section="page"]');
      W.payLocked = await waitSel(h, '[data-my-section="workplaces"]');
      W.overflow = await overflowX(h);
      W.fonts = await inputFonts(h);
      W.errors = h.errors.slice();
      R.V = W;
      V.V_samePageOtherDevice = W.view === "田中" && W.shift && W.uid !== R.S.uid && W.uid !== R.P.uid;
      V.V_ownCalendar = W.todayKinds === "submitted";
      V.V_settings = W.settings && W.overflow <= 0 && W.fonts.every(f => f >= 16);
      V.V_noErrors = W.errors.length === 0;
    } finally { await h.browser.close(); }
  }
  // ---------------- SB: 個別URLからの提出（P2）----------------
  const submitVia = async (h, opts = {}) => {
    await click(h, '[data-my-tab="submit"]');
    await waitSel(h, "[data-staff-fixed-name]");
    if (opts.edit) { await h.clickExact("修正する"); await sleep(h, 300); }
    assert1(await h.clickExact("全日程「通し」")); await sleep(h, 200);
    await h.clickExact("シフトを提出する"); await sleep(h, 300);
    await h.clickExact("提出する");
    await waitText(h, "提出完了", 8000);
  };
  {
    const h = await openAnon({ hash: "#/m/" + T2, db: dump, wait: '[data-my-view="page"]' });
    try {
      const SB = {};
      await click(h, '[data-my-tab="submit"]');
      SB.fixed = await waitSel(h, '[data-staff-fixed-name="佐藤"]');
      SB.nameInput = await h.evaluate(() => !!document.querySelector('input[placeholder="お名前を入力"]') || /お名前を入力してください/.test(document.body.innerText));
      SB.period = await h.evaluate(() => /今月/.test(document.body.innerText));
      SB.bar = await h.evaluate(() => { const b = document.querySelector("[data-staff-submit-bar]").getBoundingClientRect(); const n = document.querySelector("nav").getBoundingClientRect(); return { barBottom: Math.round(b.bottom), navTop: Math.round(n.top) }; });
      SB.overflow = await overflowX(h);
      SB.fonts = await inputFonts(h);
      assert1(await h.clickExact("全日程「通し」")); await sleep(h, 200);
      await h.clickExact("シフトを提出する"); await sleep(h, 300);
      await h.clickExact("提出する");
      SB.done = await waitText(h, "提出完了", 8000);
      const subs = Object.values((await db(h, "shops/S1/subs")) || {});
      SB.sato = subs.filter(x => x.staffName === "佐藤");
      SB.cookie = await h.evaluate(() => document.cookie);
      SB.errors = h.errors.slice();
      dump = await h.evaluate(() => window.__dbDump());
      R.SB = SB;
      V.SB_fixedName = SB.fixed && !SB.nameInput && SB.period;
      V.SB_submitted = SB.done && SB.sato.length === 1 && SB.sato[0].periodId === "p1" && Object.values(SB.sato[0].shifts).some(x => x.status === "work");
      V.SB_barAboveTabs = SB.bar.barBottom <= SB.bar.navTop + 1;
      V.SB_layout = SB.overflow <= 0 && SB.fonts.every(f => f >= 16);
      V.SB_noCookieName = !/ots_staff|%E4%BD%90%E8%97%A4/.test(SB.cookie);
      V.SB_noErrors = SB.errors.length === 0;
    } finally { await h.browser.close(); }
  }
  {
    const h = await openAnon({ hash: "#/m/" + T1, db: dump, wait: '[data-my-view="page"]' });
    try {
      const SB2 = {};
      await submitVia(h, { edit: true });
      SB2.s1 = await db(h, "shops/S1/subs/s1");
      SB2.count = Object.values((await db(h, "shops/S1/subs")) || {}).filter(x => x.staffName === "田中").length;
      SB2.errors = h.errors.slice();
      dump = await h.evaluate(() => window.__dbDump());
      R.SB2 = SB2;
      V.SB_updatesOwnSub = !!SB2.s1 && SB2.s1.staffName === "田中" && SB2.s1.isUpdated === true && SB2.count === 1 && SB2.errors.length === 0 &&
        Object.values(SB2.s1.shifts).filter(x => x.status === "work").length > 1;
    } finally { await h.browser.close(); }
  }
  {
    const d = JSON.parse(JSON.stringify(dump));
    d.shops.S1.periods.p1.confirmation = { at: "2026-10-04T00:00:00.000Z", byUid: OWN };
    const h = await openAnon({ hash: "#/m/" + T2, db: d, wait: '[data-my-view="page"]' });
    try {
      const SB3 = {};
      await click(h, '[data-my-tab="submit"]');
      await waitSel(h, "[data-staff-fixed-name]");
      const before = JSON.stringify(await db(h, "shops/S1/subs"));
      if (await h.evaluate(() => /提出完了/.test(document.body.innerText))) { await h.clickExact("修正する"); await sleep(h, 300); }
      SB3.banner = await waitSel(h, "[data-staff-confirmed]", 5000);
      await h.clickExact("シフトを提出する"); await sleep(h, 500);
      SB3.modal = await h.evaluate(() => /シフトを提出しますか/.test(document.body.innerText));
      SB3.same = JSON.stringify(await db(h, "shops/S1/subs")) === before;
      SB3.errors = h.errors.slice();
      R.SB3 = SB3;
      V.SB_confirmedBlocked = SB3.banner && !SB3.modal && SB3.same && SB3.errors.length === 0;
    } finally { await h.browser.close(); }
  }
  // ---------------- AL: 全員の表と切り替え（P3）----------------
  const pagerState = h => h.evaluate(() => { const p = document.querySelector("[data-my-pager]"); const t = document.querySelector("[data-my-pager-track]");
    return { active: p && p.getAttribute("data-my-pager"), locked: p && p.getAttribute("data-my-pager-locked"), left: t ? Math.round(t.scrollLeft) : -1, w: t ? t.clientWidth : 0, ox: t ? getComputedStyle(t).overflowX : "" }; });
  const tableInfo = h => h.evaluate(() => { const t = document.querySelector("[data-my-all-table]"); const box = document.querySelector('[data-my-pane="all"]');
    if (!t) return null; const r = t.getBoundingClientRect(), b = box.getBoundingClientRect();
    return { font: parseFloat(t.getAttribute("data-my-all-font")), cellFont: parseFloat(getComputedStyle(t.querySelector("td[data-my-all-cell]") || t).fontSize),
      tableW: Math.round(r.width), paneW: Math.round(b.width), overTable: Math.round(r.right - b.right), cols: [...t.querySelectorAll("th[data-my-all-col]")].map(x => x.getAttribute("data-my-all-col")),
      me: (t.querySelector("[data-my-all-me]") || {}).getAttribute ? t.querySelector("[data-my-all-me]").getAttribute("data-my-all-col") : null,
      rows: t.querySelectorAll("[data-my-all-row]").length, spacers: t.querySelectorAll("thead th:not([data-my-all-col])").length - 1 }; });
  {
    const h = await openAnon({ hash: "#/m/" + T1, db: dump, wait: '[data-my-view="page"]' });
    try {
      const AL = {};
      await waitSel(h, "[data-my-pager]");
      AL.start = await pagerState(h);
      await click(h, '[data-my-pager-tab="all"]'); await sleep(h, 700);
      AL.afterTap = await pagerState(h);
      AL.unpublished = await waitSel(h, '[data-my-all-state="unpublished"]', 5000);
      // 横スクロール（スワイプ相当）で戻る
      const box = await h.page.evaluate(() => { const r = document.querySelector("[data-my-pager-track]").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + 40 }; });
      // Chromium はホイールの横スクロール（スワイプ相当）。モバイル WebKit はホイールを受け付けないので、スクロール位置を動かして
      // scroll イベントの経路（どちらを見ているかの更新）だけを確かめる（指のスワイプそのものは実機で確かめる）
      AL.swipeBy = "wheel";
      try { await h.page.mouse.move(box.x, box.y); await h.page.mouse.wheel(-800, 0); }
      catch (e) { AL.swipeBy = "scrollLeft"; await h.evaluate(() => { document.querySelector("[data-my-pager-track]").scrollLeft = 0; }); }
      await sleep(h, 900);
      AL.afterSwipe = await pagerState(h);
      AL.overflow = await overflowX(h);
      AL.errors = h.errors.slice();
      R.AL = AL;
      V.AL_tapSwitches = AL.start.active === "mine" && AL.afterTap.active === "all" && Math.abs(AL.afterTap.left - AL.afterTap.w) <= 2;
      V.AL_swipeSwitches = AL.afterSwipe.active === "mine" && AL.afterSwipe.left <= 2;
      V.AL_unpublished = AL.unpublished;
      V.AL_noOverflow = AL.overflow <= 0 && AL.errors.length === 0;
    } finally { await h.browser.close(); }
  }
  // 公開済みの表（10人×16日・30人×31日）
  const bigSeed = (nStaff, nDays) => {
    const d = seed0();
    const names = Array.from({ length: nStaff }, (_, i) => i === 0 ? "田中" : `スタッフ${i + 1}`);
    d.shops.S1.staff = [...names.slice(0, 3), "__spacer__1", ...names.slice(3), "退職者"];
    d.shops.S1.settings.staffHidden = { "退職者": true };
    const end = `${YM}-${pad(nDays)}`;
    d.shops.S1.periods.p1 = { ...d.shops.S1.periods.p1, endDate: end, published: { at: "2026-10-03T09:00:00.000Z", byUid: OWN } };
    const subs = {};
    names.concat(["退職者"]).forEach((n, i) => {
      const shifts = {};
      for (let k = 1; k <= nDays; k++) {
        const ds = `${YM}-${pad(k)}`;
        shifts[ds] = (k + i) % 3 === 0 ? { status: "holiday" } : { status: "work", start: (k + i) % 2 ? "17:00" : "9:30", end: (k + i) % 2 ? "25:00" : "15:00", ...(n === "田中" && k === 1 ? { adjustedEnd: "16:00", start: "10:00" } : {}) };
      }
      if (n === "スタッフ2") shifts[`${YM}-02`] = { status: "holiday", leaveTypes: { start: "paid", end: "paid" } };
      subs["x" + i] = { id: "x" + i, periodId: "p1", shopId: "S1", staffName: n, submittedAt: "2026-09-02T00:00:00Z", shifts };
    });
    d.shops.S1.subs = subs;
    d.staffPageTokens = { [T1]: { shopId: "S1", at: "x" } };
    d.shops.S1.staffPages = { [T1]: { status: "approved", name: "田中", displayName: "田中", requestedAt: "x", approvedAt: "2026-10-01T00:00:00.000Z" } };
    return d;
  };
  for (const [nS, nD, vp, eng] of [[10, 16, PHONE], [30, 31, PHONE], [30, 31, { width: 320, height: 700 }]]) {
    const h = await openAnon({ hash: "#/m/" + T1, db: bigSeed(nS, nD), wait: '[data-my-view="page"]', viewport: vp });
    try {
      const k = `${nS}x${nD}_${vp.width}`;
      await click(h, '[data-my-pager-tab="all"]'); await sleep(h, 800);
      await waitSel(h, "[data-my-all-table]");
      const T = await tableInfo(h);
      T.overflow = await overflowX(h);
      T.day1 = await h.evaluate(d => { const r = document.querySelector(`[data-my-all-row="${d}"]`); return r ? [...r.querySelectorAll("td[data-my-all-cell]")].slice(0, 3).map(c => c.innerText.replace(/\n/g, "/")) : null; }, `${YM}-01`);
      T.day2 = await h.evaluate(d => { const r = document.querySelector(`[data-my-all-row="${d}"]`); return r ? [...r.querySelectorAll("td[data-my-all-cell]")].slice(0, 3).map(c => c.innerText.replace(/\n/g, "/")) : null; }, `${YM}-02`);
      // ピンチの再現は Chromium の CDP だけ（WebKit では実機で確かめる＝BACKLOG の本番反映タスク）
      if (nS === 30 && vp.width === 375 && (process.env.SHIFTY_ENGINE || "chromium") === "chromium") {
        // ピンチで拡大（Chromium の page scale factor＝visualViewport.scale）している間は横スクロールを止める
        const cdp = await h.context.newCDPSession(h.page);
        await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 }); await sleep(h, 500);
        T.zoomed = await pagerState(h);
        T.vvScale = await h.evaluate(() => window.visualViewport && window.visualViewport.scale);
        await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 }); await sleep(h, 500);
        T.unzoomed = await pagerState(h);
      }
      T.errors = h.errors.slice();
      R["AL_" + k] = T;
      V["AL_fits_" + k] = T.overflow <= 0 && T.overTable <= 0 && T.tableW <= T.paneW && T.rows === nD;
      V["AL_columns_" + k] = T.cols.length === nS && !T.cols.includes("退職者") && T.spacers === 1 && T.me === "田中";
      V["AL_values_" + k] = !!T.day1 && T.day1[0] === "10/16" && !!T.day2 && T.day2[1] === "有給/有給";
      V["AL_noErrors_" + k] = T.errors.length === 0;
      if (T.zoomed) V.AL_pinchLocks = T.vvScale > 1.5 && T.zoomed.locked === "1" && T.zoomed.ox === "hidden" && T.unzoomed.locked === "0" && T.unzoomed.ox === "auto";
    } finally { await h.browser.close(); }
  }
  // ---------------- F: 改名・削除・再登録の追随 ----------------
  {
    const h = await openOwner({ db: dump });
    try {
      const F = {};
      await waitText(h, "スタッフ一覧");
      await sleep(h, 500);
      await openEdit(h, "佐藤");
      await h.evaluate(() => {
        const inp = [...document.querySelectorAll("input")].find(i => i.value === "佐藤" && i.maxLength === 50);
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
        set.call(inp, "佐藤 花子"); inp.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await h.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => x.innerText.trim() === "保存" && x.closest("div[style*='9998']")); b && b.click(); });
      await sleep(h, 900);
      F.renamed = await db(h, `shops/S1/staffPages/${T2}/name`);
      await h.clickExact("削除", { rowText: "佐藤 花子" }); await sleep(h, 300);
      await h.clickExact("削除する"); await sleep(h, 900);
      F.afterDelete = await db(h, `shops/S1/staffPages/${T2}/status`);
      await h.setInput('input[placeholder="スタッフ名を入力"]', "佐藤 花子");
      await h.clickExact("＋ 追加"); await sleep(h, 900);
      F.reAdded = ((await db(h, "shops/S1/staff")) || []).includes("佐藤 花子");
      F.afterReAdd = await db(h, `shops/S1/staffPages/${T2}/status`);
      F.tanakaUntouched = await db(h, `shops/S1/staffPages/${T1}/status`);
      F.errors = h.errors.slice();
      dump = await h.evaluate(() => window.__dbDump());
      R.F = F;
      V.F_renameFollows = F.renamed === "佐藤 花子";
      V.F_deleteRevokes = F.afterDelete === "revoked";
      V.F_reAddStaysRevoked = F.reAdded && F.afterReAdd === "revoked";
      V.F_othersUntouched = F.tanakaUntouched === "approved";
      V.F_noErrors = F.errors.length === 0;
    } finally { await h.browser.close(); }
  }
  {
    const h = await openAnon({ hash: "#/m/" + T2, db: dump, wait: "[data-my-page-state],[data-my-view]" });
    try {
      R.F2 = { state: await h.evaluate(() => { const e = document.querySelector("[data-my-page-state]"); return e ? e.getAttribute("data-my-page-state") : "view"; }), errors: h.errors.slice() };
      V.F_revokedPageClosed = R.F2.state === "revoked" && R.F2.errors.length === 0;
    } finally { await h.browser.close(); }
  }
  // ---------------- X: 取り消し ----------------
  {
    const h = await openOwner({ db: dump });
    try {
      const X = {};
      await waitText(h, "スタッフ一覧");
      await sleep(h, 500);
      await openEdit(h, "田中");
      await click(h, '[data-staff-page-action="revoke"]');
      await sleep(h, 800);
      X.status = await db(h, `shops/S1/staffPages/${T1}/status`);
      X.revokedAt = await db(h, `shops/S1/staffPages/${T1}/revokedAt`);
      X.errors = h.errors.slice();
      dump = await h.evaluate(() => window.__dbDump());
      R.X = X;
      V.X_revoked = X.status === "revoked" && typeof X.revokedAt === "string" && X.errors.length === 0;
    } finally { await h.browser.close(); }
  }
  {
    const h = await openAnon({ hash: "#/m/" + T1, db: dump, wait: "[data-my-page-state],[data-my-view]" });
    try {
      R.X2 = { state: await h.evaluate(() => { const e = document.querySelector("[data-my-page-state]"); return e ? e.getAttribute("data-my-page-state") : "view"; }),
        msg: await h.evaluate(() => (document.querySelector("[data-my-page-message]") || {}).innerText || ""), errors: h.errors.slice() };
      V.X_pageClosed = R.X2.state === "revoked" && /使えなくなりました/.test(R.X2.msg) && R.X2.errors.length === 0;
    } finally { await h.browser.close(); }
  }
  // ---------------- R: 閲覧専用の端末（owners に居ない uid）----------------
  {
    const d = JSON.parse(JSON.stringify(dump));
    d.shops.S1.staffPages.ZZZZZZZZZZZZZZZZZZZZZZZZ = { status: "pending", displayName: "鈴木", requestedAt: "2026-10-04T00:00:00.000Z" };
    const h = await openOwner({ db: d, uid: "NOTOWN" });
    try {
      await waitText(h, "スタッフ一覧");
      await sleep(h, 800);
      R.R = { card: await h.evaluate(() => !!document.querySelector("[data-page-request]")), errors: h.errors.slice() };
      V.R_readOnlyNoCard = R.R.card === false;
    } finally { await h.browser.close(); }
  }
  // ---------------- PROD: 本番相当（ゲート off）----------------
  {
    const root = prodRoot();
    const PR = {};
    const h1 = await openAnon({ hash: "#/s/t1", db: dump, root, wait: "#root > *" });
    try {
      await waitText(h1, "提出状況");
      await sleep(h1, 500);
      PR.entry = await h1.evaluate(() => !!document.querySelector("[data-page-register-open]"));
      PR.errors1 = h1.errors.slice();
    } finally { await h1.browser.close(); }
    const t = dump.shops.S1.staffPages && Object.keys(dump.shops.S1.staffPages)[0];
    const h2 = await openAnon({ hash: "#/m/" + t, db: dump, root, wait: "#root > *" });
    try {
      await sleep(h2, 2500);
      PR.pageView = await h2.evaluate(() => !!document.querySelector('[data-my-view="page"],[data-my-page-state]'));
      PR.reads = await h2.evaluate(() => (window.__reads || []).filter(p => /staffPage/.test(p)));
      PR.errors2 = h2.errors.filter(e => !/token一致なし|スタッフURL解決/.test(e));
    } finally { await h2.browser.close(); }
    R.PROD = PR;
    V.PROD_noEntry = PR.entry === false;
    V.PROD_noPageRoute = PR.pageView === false && PR.reads.length === 0;
    V.PROD_noErrors = PR.errors1.length === 0;
  }
  const allPass = Object.values(V).every(Boolean);
  console.log(JSON.stringify({ V, R }, null, 1));
  console.log("allPass=" + allPass);
  process.exit(allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
