// 2026-10-05 のユーザー指示7件の回帰テスト。アプリ全体をスタブ Firebase で動かす（Firebase・Cloud Functions へは1バイトも出ない）。
// **セキュリティルールは評価しない**。
//
//  MF（ホーム画面のアプリ）: スタッフ側の URL（#/m/<token>・#/me）では link[rel=manifest] が「いま開いている URL を start_url にした」data: の manifest に
//     差し替わる（iOS の「ホーム画面に追加」が manifest.json の start_url "./" で開き、管理者の端末では管理者画面になっていた）。#/admin は manifest.json のまま
//  IOS（2026-10-05 2回目・iPhone の UA）: Safari の個別URLでは manifest を置かず Cookie に開き先。ホーム画面から開く（ハッシュ無し）と、管理者登録している端末でも
//     マイシフト（以後はアプリ側に残した開き先）。Cookie の無いアプリ（管理者画面から追加）は管理者側のまま
//  SB（提出タブ）: 個別URLで提出済みの期間は「提出完了」ではなく、提出の内容を反映した選択画面（data-staff-restored）が開く
//  HD（全員のシフトのヘルプ先）: 企業の写しの人物で束ねた他店（C店）が「C店（ヘルプ先）」として選べ、確定済みの期間だけが選択肢。
//     選ぶとその店の表（本人の列に印）が出て、見出しは「ヘルプ先 ／ 確定」。自分の店の見出しは「公開」ではなく「確定」。公開だけの期間はヘルプ先では選べない
//  LB（「公開」→「確定」）: 自分のシフトの日付の詳細・次のシフトに「公開」の表示が無く「確定」
//  GR（給料のグラフ）: 月間目標を設定すると、確定分（アクセント）と見込みまで（--c-text4）の2本の弧。年の表示にも同じグラフ（目標×12）と勤務先ごとの行・内訳
//  PC（締日・給料日の優先）: お店の settings.payCalendar（20日締め・翌月10日）が本人の設定（月末締め・翌月25日）より優先され、給料タブの行の締め期間が 21日〜20日。
//     勤務先の編集は締日の欄の代わりに「お店の登録・変更できません」
//  AD（管理者）: 設定タブのカードで締日を変えて保存 → shops/S1/settings/payCalendar。企業連携タブのカードで選んだ店舗（C店を含む）に保存 → shops/S3/settings/payCalendar
//  すべての場面で console.error・pageerror が 0 件。375px で横はみ出し無し
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-my-1005.js → allPass=true / EXIT=0
// 反証: SHIFTY_ROOT=<39ca88c の配信物> node ... → EXIT=1
"use strict";
const path = require("node:path");
const { openHarness, REPO_ROOT } = require(path.join(__dirname, "mount-component.js"));
const { makeStub } = require(path.join(__dirname, "stub-firebase.js"));
const ROOT = process.env.SHIFTY_ROOT || REPO_ROOT;
const SCRIPTS = ["app-utils.js", "app-my-utils.js", "app-core.js", "app-staff.js", "app-admin.js", "app-shift.js", "app-company.js", "app-my.js", "app-main.js"].map(src => ({ src, babel: !/utils|core/.test(src) }));
const PHONE = { width: 375, height: 812 };
const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWx";
const USERS = { "tanaka@example.com": { uid: "T1", password: "pass12345" } };
const T1 = { uid: "T1", isAnonymous: false, email: "tanaka@example.com" };
const pad = n => String(n).padStart(2, "0");
const now = new Date();
const TODAY = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const YM = TODAY.slice(0, 7);
const DAYS = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
const LAST = `${YM}-${pad(DAYS)}`;
// 今日より後の勤務（見込み）。お店の締日は20日なので、同じ支給月に入るよう20日に置く（今日が20日以降なら見込みの弧は測らない）
const LATER = now.getDate() < 20 ? `${YM}-20` : null;
const per = (id, sid, tok, extra) => ({ id, urlToken: tok, shopId: sid, label: "今月", startDate: `${YM}-01`, endDate: LAST, deadlineDate: "", createdAt: "2026-09-01T00:00:00.000Z", ...(extra || {}) });
const PUB = { published: { at: "2026-09-02T00:00:00.000Z", byUid: "OWN" } };
const CONF = { confirmation: { at: "2026-09-03T00:00:00.000Z", byUid: "OWN3" } };
const work = (s, e) => ({ status: "work", start: s, end: e });
const seed0 = () => ({
  global: { shops: { S1: { id: "S1", name: "A店" }, S3: { id: "S3", name: "C店" } } },
  shops: {
    S1: { owners: { OWN: "K1" }, private: { adminKey: "K1" }, staff: ["田中", "佐藤"],
      settings: { shopId: "S1", staffAttributes: { "田中": "parttime" }, candidates: [{ start: "10:00", end: "15:00" }],
        payCalendar: { closingDay: 20, payMonthOffset: 1, payDay: 10, holidayRule: "before", updatedAt: "t" } },
      periods: { p1: per("p1", "S1", "t1", PUB) },
      subs: { s1: { id: "s1", periodId: "p1", shopId: "S1", staffName: "田中", submittedAt: "2026-09-02T00:00:00Z",
        shifts: { [TODAY]: work("10:00", "15:00"), ...(LATER ? { [LATER]: work("10:00", "15:00") } : {}) } } },
      staffLinks: { T1: { name: "田中", method: "code", at: "2026-10-01T00:00:00.000Z" } },
      staffPages: { [TOKEN]: { status: "approved", displayName: "田中", name: "田中", requestedAt: "t", approvedAt: "2026-10-01T00:00:00.000Z", byUid: "OWN" } },
      company: { id: "C1", name: "企業", entityId: "E1", kind: "shop", settings: {}, deadlines: {}, shops: { S1: "A店", S3: "C店" },
        people: { p_aaaaaaaa: { S1: "田中", S3: "田中一郎" } }, shopEntities: { S1: "E1", S3: "E1" }, syncedAt: "t" } },
    S3: { owners: { OWN: "K3" }, private: { adminKey: "K3" }, staff: ["田中一郎", "山田"],
      settings: { shopId: "S3", candidates: [{ start: "17:00", end: "22:00" }] },
      periods: { c1: per("c1", "S3", "t3", CONF), c2: per("c2", "S3", "t4", { ...PUB, label: "公開だけ", startDate: `${YM}-01` }) },
      subs: { v1: { id: "v1", periodId: "c1", shopId: "S3", staffName: "山田", submittedAt: "t", shifts: { [TODAY]: work("17:00", "22:00") } } },
      company: { id: "C1", name: "企業", entityId: "E1", kind: "shop", settings: {}, deadlines: {}, shops: { S1: "A店", S3: "C店" },
        people: { p_aaaaaaaa: { S1: "田中", S3: "田中一郎" } }, shopEntities: { S1: "E1", S3: "E1" }, syncedAt: "t" } },
  },
  staffPageTokens: { [TOKEN]: { shopId: "S1", at: "t" } },
  tokens: { t1: { shopId: "S1", periodId: "p1" }, t3: { shopId: "S3", periodId: "c1" }, t4: { shopId: "S3", periodId: "c2" } },
  accounts: { S1: { plan: "premium" }, S3: { plan: "premium" }, OWN: { shops: { S1: true, S3: true } } },
  users: { T1: { profile: { displayName: "田中", updatedAt: "t" }, links: { S1: { name: "田中", at: "t" } }, goals: { monthly: 10000, updatedAt: "t" },
    workplaces: { S1: { kind: "shifty", shopId: "S1", color: "#2f6f9f",
      pay: { closingDay: 31, payMonthOffset: 1, payDay: 25, holidayRule: "before", wageType: "hourly", rate: 1000, updatedAt: "t" } } } } },
});
const hashHead = h => `<script>history.replaceState(null,"","/${h}");</script>`;
const preLS = obj => `<script>${Object.entries(obj).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)},${JSON.stringify(v)});`).join("")}</script>`;
const sleep = (h, ms) => h.page.waitForTimeout(ms);
const waitSel = (h, s, ms = 15000) => h.page.waitForSelector(s, { timeout: ms }).then(() => true, () => false);
const click = (h, sel) => h.evaluate(sel => { const e = document.querySelector(sel); if (!e) return false; e.click(); return true; }, sel);
const db = (h, p) => h.evaluate(p => window.__db(p), p);
const overflowX = h => h.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
const setSelect = (h, sel, v) => h.evaluate(([sel, v]) => { const e = document.querySelector(sel); if (!e) return false;
  Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set.call(e, v); e.dispatchEvent(new Event("change", { bubbles: true })); return true; }, [sel, v]);
const manifestOf = h => h.evaluate(() => {
  const l = document.querySelector('link[rel="manifest"]'); const href = l ? l.getAttribute("href") : null;
  if (!href || !href.startsWith("data:")) return { href, json: null, count: document.querySelectorAll('link[rel="manifest"]').length };
  return { href: "data:", json: JSON.parse(decodeURIComponent(href.slice(href.indexOf(",") + 1))), count: document.querySelectorAll('link[rel="manifest"]').length };
});
async function openPage(db) {
  return openHarness({ root: ROOT, jsx: "window.__harnessReady=true;", waitFor: '[data-my-view="page"]', viewport: PHONE,
    extraHead: hashHead("#/m/" + TOKEN) + makeStub({ seed: db, view: "staff", tab: "periods", auth: "accounts", authSeed: { users: {}, cur: null } }), scripts: SCRIPTS });
}
// iPhone の Safari／ホーム画面のアプリ（standalone）を UA と navigator.standalone の差し替えで作る（Chromium でも効く）
const IOS_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";
const iosHead = standalone => `<script>(function(){var P=Navigator.prototype;var d=function(k,v){Object.defineProperty(P,k,{get:function(){return v;},configurable:true});};
  d("userAgent",${JSON.stringify(IOS_UA)});d("platform","iPhone");d("maxTouchPoints",5);d("standalone",${standalone ? "true" : "false"});})();</script>`;
// 管理者登録している端末（管理キー・開いていた店舗・Cookie の店舗）。ホーム画面のアプリにも Safari の Cookie が写る前提
const adminDeviceHead = (cookieHash) => `<script>localStorage.setItem("ots_adminKeys_v1",JSON.stringify({S1:"K1"}));localStorage.setItem("ots_adminShops_v1",JSON.stringify(["S1"]));
  document.cookie="ots_shopId=S1;path=/";${cookieHash ? `document.cookie="ots_homeLaunch="+encodeURIComponent(${JSON.stringify(cookieHash)})+";path=/";` : ""}</script>`;
async function openIos({ db, hash, standalone, cookieHash, wait = "#root > *" }) {
  return openHarness({ root: ROOT, jsx: "window.__harnessReady=true;", waitFor: wait, viewport: PHONE,
    extraHead: (hash ? hashHead(hash) : "") + iosHead(standalone) + adminDeviceHead(cookieHash) +
      makeStub({ seed: db, view: "admin", tab: "periods", auth: "accounts", authSeed: { users: {}, cur: null } }), scripts: SCRIPTS });
}
async function openStaff(db) {
  return openHarness({ root: ROOT, jsx: "window.__harnessReady=true;", waitFor: "[data-my-shift],[data-my-empty]", viewport: PHONE,
    extraHead: hashHead("#/me") + preLS({ ots_staffAccount_v1: JSON.stringify({ uid: "T1" }) }) +
      makeStub({ seed: db, view: "staff", tab: "periods", auth: "accounts", authSeed: { users: USERS, cur: T1 } }), scripts: SCRIPTS });
}
async function openOwner(db, tab, hash = "") {
  return openHarness({ root: ROOT, jsx: "window.__harnessReady=true;", waitFor: "#root > *", viewport: { width: 1200, height: 900 },
    extraHead: (hash ? hashHead(hash) : "") + makeStub({ seed: db, uid: "OWN", view: "admin", tab }), scripts: SCRIPTS });
}
const settledPay = h => h.page.waitForFunction(() => { const d = document.querySelector("[data-my-pay]"); return d && !/読み込み中/.test(d.innerText); }, null, { timeout: 15000 }).catch(() => {});

(async () => {
  const R = {}, V = {};
  const errs = (k, h) => { R[k + "_errors"] = h.errors.slice(); return h.errors.length === 0; };
  // ---------------- MF・SB・HD・LB: 個別URL ----------------
  {
    const h = await openPage(seed0());
    try {
      await sleep(h, 600);
      const mf = await manifestOf(h);
      R.MF_page = mf;
      V.MF_pageStartUrl = !!mf.json && /#\/m\/AbCdEfGhIjKlMnOpQrStUvWx$/.test(mf.json.start_url) && mf.json.id === mf.json.start_url && mf.count === 1 &&
        mf.json.display === "standalone" && mf.json.icons.every(i => /^http/.test(i.src));
      // LB: 自分のシフトに「公開」の表示が無い（「確定」）
      await waitSel(h, "[data-my-shift]");
      await sleep(h, 800);
      R.LB = await h.evaluate(() => { const t = document.querySelector('[data-my-pane="mine"]'); return t ? t.innerText : ""; });
      V.LB_noPublishedLabel = !/(^|\s|／ )公開(\s|$)/.test(R.LB) && /確定/.test(R.LB);
      // HD: 全員のシフト
      await click(h, '[data-my-pager-tab="all"]');
      const pane = await waitSel(h, "[data-my-all-pane]");
      await h.page.waitForFunction(() => { const s = document.querySelector("[data-my-all-shop]"); return s && s.options.length >= 2; }, null, { timeout: 15000 }).catch(() => {});
      const HD = {};
      HD.pane = pane;
      HD.shopOptions = await h.evaluate(() => { const s = document.querySelector("[data-my-all-shop]"); return s ? [...s.options].map(o => [o.value, o.text]) : []; });
      HD.defaultShop = await h.evaluate(() => document.querySelector("[data-my-all-pane]").getAttribute("data-my-all-shop-sel"));
      await waitSel(h, '[data-my-all-state="ok"]');
      HD.ownHead = await h.evaluate(() => (document.querySelector('[data-my-all-state="ok"]') || {}).innerText || "");
      await setSelect(h, "[data-my-all-shop]", "S3");
      await h.page.waitForFunction(() => { const p = document.querySelector("[data-my-all-pane]"); return p && p.getAttribute("data-my-all-helpdest") === "1"; }, null, { timeout: 15000 }).catch(() => {});
      await waitSel(h, '[data-my-all-state="ok"]');
      await sleep(h, 500);
      HD.helpPeriods = await h.evaluate(() => [...document.querySelector("[data-my-all-period]").options].map(o => o.value));
      HD.helpHead = await h.evaluate(() => (document.querySelector('[data-my-all-state="ok"]') || {}).innerText.split("\n")[0] || "");
      HD.helpCols = await h.evaluate(() => [...document.querySelectorAll("th[data-sheet-col]")].map(t => t.getAttribute("data-sheet-col")));
      HD.me = await h.evaluate(() => { const t = document.querySelector("th[data-sheet-me]"); return t ? t.getAttribute("data-sheet-col") : null; });
      HD.overflow = await overflowX(h);
      R.HD = HD;
      V.HD_option = HD.shopOptions.some(([v, t]) => v === "S3" && /C店（ヘルプ先）/.test(t)) && HD.defaultShop === "S1";
      V.HD_ownHeadConfirmed = /^確定/.test(HD.ownHead) && !/公開/.test(HD.ownHead.split("\n")[0]);
      V.HD_confirmedOnly = JSON.stringify(HD.helpPeriods) === JSON.stringify(["c1"]);
      V.HD_table = /^ヘルプ先 ／ 確定/.test(HD.helpHead) && HD.helpCols.includes("田中一郎") && HD.helpCols.includes("山田") && HD.me === "田中一郎";
      V.HD_layout = HD.overflow <= 0;
      // SB: 提出タブ
      await click(h, '[data-my-tab="submit"]');
      await waitSel(h, "[data-staff-fixed-name]");
      const SB = {};
      SB.restored = await waitSel(h, "[data-staff-restored]", 5000);
      SB.done = await h.evaluate(() => /提出完了/.test(document.body.innerText));
      R.SB = SB;
      V.SB_restoredForm = SB.restored && !SB.done;
      V.PAGE_noErrors = errs("PAGE", h);
    } finally { await h.close(); }
  }
  // ---------------- IOS（2026-10-05 2回目）: iPhone の Safari で個別URL → manifest を置かない・Cookie に開き先 ----------------
  {
    const h = await openIos({ db: seed0(), hash: "#/m/" + TOKEN, standalone: false, wait: '[data-my-view="page"]' });
    try {
      await sleep(h, 500);
      const I = { manifests: await h.evaluate(() => document.querySelectorAll('link[rel="manifest"]').length),
        cookie: await h.evaluate(() => (document.cookie.match(/(?:^|; )ots_homeLaunch=([^;]*)/) || [])[1] || "") };
      R.IOS_safari = I;
      V.IOS_safariNoManifest = I.manifests === 0 && decodeURIComponent(I.cookie) === "#/m/" + TOKEN;
      V.IOS_safari_noErrors = errs("IOS_safari", h);
    } finally { await h.close(); }
  }
  {
    // ホーム画面のアプリとして初めて開く（start_url はハッシュ無しの "/"）＝管理者登録している端末でもマイシフト
    const h = await openIos({ db: seed0(), hash: "", standalone: true, cookieHash: "#/m/" + TOKEN, wait: '[data-my-view="page"]' });
    try {
      const I = { page: await waitSel(h, '[data-my-view="page"]', 8000), hash: await h.evaluate(() => location.hash),
        saved: await h.evaluate(() => JSON.parse(localStorage.getItem("ots_homeLaunch_v1") || "null")),
        adminLogin: await h.evaluate(() => /Googleでログイン/.test(document.body.innerText)) };
      R.IOS_app = I;
      V.IOS_appOpensMyShift = I.page && I.hash === "#/m/" + TOKEN && I.saved === "#/m/" + TOKEN && !I.adminLogin;
      // 2回目以降も同じ（Cookie が消えていても、アプリ側に残した開き先で開く）
      await h.evaluate(() => { document.cookie = "ots_homeLaunch=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/"; history.replaceState(null, "", "/"); });
      await h.page.reload({ waitUntil: "networkidle" });
      V.IOS_appReopen = (await waitSel(h, '[data-my-view="page"]', 8000)) && (await h.evaluate(() => location.hash)) === "#/m/" + TOKEN;
      V.IOS_app_noErrors = errs("IOS_app", h);
    } finally { await h.close(); }
  }
  {
    // 管理者画面から追加したアプリ（Cookie なし）は管理者側のまま
    const h = await openIos({ db: seed0(), hash: "", standalone: true, cookieHash: "", wait: "#root > *" });
    try {
      await sleep(h, 1500);
      const I = { my: await h.evaluate(() => !!document.querySelector("[data-my-view]")), hash: await h.evaluate(() => location.hash),
        saved: await h.evaluate(() => JSON.parse(localStorage.getItem("ots_homeLaunch_v1") || "null")) };
      R.IOS_admin = I;
      V.IOS_adminAppStaysAdmin = !I.my && I.hash === "" && I.saved === "admin";
    } finally { await h.close(); }
  }
  // ---------------- GR・PC: メールのアカウント（給料）----------------
  {
    const h = await openStaff(seed0());
    try {
      const mf = await manifestOf(h);
      V.MF_meStartUrl = !!mf.json && /#\/me$/.test(mf.json.start_url);
      await click(h, '[data-my-tab="pay"]');
      await waitSel(h, "[data-my-pay]");
      await settledPay(h); await sleep(h, 500);
      const G = await h.evaluate(() => {
        const q = s => document.querySelector(s);
        return { ring: q("[data-my-goal-ring]") && q("[data-my-goal-ring]").getAttribute("data-my-goal-ring"),
          projected: q("[data-my-goal-ring]") && q("[data-my-goal-ring]").getAttribute("data-my-goal-projected"),
          confArc: q('[data-my-goal-arc="confirmed"] circle') && q('[data-my-goal-arc="confirmed"] circle').getAttribute("stroke"),
          projArc: q('[data-my-goal-arc="projected"] circle') && q('[data-my-goal-arc="projected"] circle').getAttribute("stroke"),
          month: q("[data-my-pay-month]") && q("[data-my-pay-month]").getAttribute("data-my-pay-month"),
          row: (q('[data-my-pay-row="S1"]') || {}).innerText || "" };
      });
      // PC: 給料タブの S1 の締め期間はお店の登録（20日締め）。支給月の行に「21〜」「20の勤務」
      await click(h, '[data-my-pay-row="S1"] [data-my-action="payDetail"]'); await sleep(h, 200);
      G.notes = await h.evaluate(() => (document.querySelector('[data-my-pay-notes="S1"]') || {}).innerText || "");
      // 年の表示
      await click(h, '[data-my-pay-tab="year"]');
      await settledPay(h); await sleep(h, 500);
      G.year = await h.evaluate(() => {
        const q = s => document.querySelector(s);
        return { summary: !!q("[data-my-pay-year-summary]"), goal: q("[data-my-pay-year-summary]") && q("[data-my-pay-year-summary]").getAttribute("data-my-pay-goal"),
          ring: !!q("[data-my-pay-year-summary] [data-my-goal-ring]"), wp: [...document.querySelectorAll("[data-my-pay-year-wp]")].map(e => e.getAttribute("data-my-pay-year-wp")),
          wpTotal: q('[data-my-pay-year-wp-total]') && q('[data-my-pay-year-wp-total]').getAttribute("data-my-pay-year-wp-total"),
          goalText: (q("[data-my-pay-year-summary]") || {}).innerText || "" };
      });
      await click(h, '[data-my-pay-year-wp="S1"] [data-my-action="payYearWpDetail"]'); await sleep(h, 200);
      G.yearDetail = await h.evaluate(() => [...document.querySelectorAll("[data-my-pay-year-wp-month]")].map(e => e.getAttribute("data-my-pay-year-wp-month")));
      G.overflow = await overflowX(h);
      // 設定タブ: お店の締日・給料日は固定表示
      await click(h, '[data-my-tab="settings"]');
      await waitSel(h, '[data-my-wp="S1"] [data-my-action="editWorkplace"]'); await sleep(h, 300);
      G.wpSummary = await h.evaluate(() => (document.querySelector('[data-my-wp="S1"] [data-my-wp-pay]') || {}).innerText || "");
      await click(h, '[data-my-wp="S1"] [data-my-action="editWorkplace"]');
      await waitSel(h, '[data-my-wp-editor="S1"]');
      G.shopCal = await h.evaluate(() => { const e = document.querySelector('[data-my-wp-editor="S1"] [data-my-shop-calendar]'); return e ? e.innerText : null; });
      G.closingSelect = await h.evaluate(() => !!document.querySelector('[data-my-wp-editor="S1"] [data-my-input="closingDay"]'));
      R.G = G;
      V.GR_twoArcs = G.ring !== null && G.confArc === "var(--c-accent)" && (LATER ? G.projArc === "var(--c-text4)" && Number(G.projected) > Number(G.ring) : true);
      V.GR_year = G.year.summary && G.year.goal === "set" && G.year.ring && /× 12/.test(G.year.goalText) && G.year.wp.includes("S1") && G.yearDetail.length >= 1;
      V.PC_rowPeriod = /\/21〜\d+\/20の勤務/.test(G.row) && /お店の登録/.test(G.notes);
      V.PC_settings = !!G.shopCal && /20日締め・翌月10日払い/.test(G.shopCal) && !G.closingSelect && /お店の登録/.test(G.wpSummary);
      V.GR_layout = G.overflow <= 0;
      V.ME_noErrors = errs("ME", h);
    } finally { await h.close(); }
  }
  // ---------------- AD: 管理者（設定タブ・企業連携タブ）／ MF の #/admin ----------------
  {
    const h = await openOwner(seed0(), "settings", "#/admin");
    try {
      await waitSel(h, "[data-pay-cal-card]");
      const mf = await manifestOf(h);
      V.MF_adminKeepsJson = mf.href === "manifest.json" && mf.count === 1;
      const AD = {};
      AD.current = await h.evaluate(() => (document.querySelector("[data-pay-cal-current]") || {}).innerText || "");
      await setSelect(h, '[data-pay-cal="closingDay"]', "15");
      await click(h, "[data-pay-cal-save]"); await sleep(h, 500);
      AD.saved = await db(h, "shops/S1/settings/payCalendar");
      V.AD_setTab = /20日締め・翌月10日払い/.test(AD.current) && AD.saved && AD.saved.closingDay === 15 && AD.saved.payDay === 10;
      R.AD = AD;
      V.ADS_noErrors = errs("ADS", h);
    } finally { await h.close(); }
  }
  {
    const h = await openOwner(seed0(), "company");
    try {
      const card = await waitSel(h, "[data-company-pay-cal]");
      await h.page.waitForFunction(() => document.querySelectorAll("[data-company-pay-cal-shop]").length >= 2, null, { timeout: 10000 }).catch(() => {});
      const C = {};
      C.shops = await h.evaluate(() => [...document.querySelectorAll("[data-company-pay-cal-shop]")].map(e => [e.getAttribute("data-company-pay-cal-shop"), e.innerText.replace(/\s+/g, " ")]));
      await h.evaluate(() => { const els = [...document.querySelectorAll('[data-pay-cal="closingDay"]')]; const e = els[els.length - 1]; if (!e) return;
        Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set.call(e, "25"); e.dispatchEvent(new Event("change", { bubbles: true })); });
      await click(h, "[data-company-pay-cal-save]"); await sleep(h, 800);
      C.s3 = await db(h, "shops/S3/settings/payCalendar");
      C.s1 = await db(h, "shops/S1/settings/payCalendar");
      C.s3settingsOther = await db(h, "shops/S3/settings/candidates");
      R.C = C;
      V.AD_companyTab = card && C.shops.length === 2 && C.s3 && C.s3.closingDay === 25 && C.s1 && C.s1.closingDay === 25 && Array.isArray(C.s3settingsOther);
      V.ADC_noErrors = errs("ADC", h);
    } finally { await h.close(); }
  }
  console.log(JSON.stringify({ V, R }, null, 1));
  const allPass = Object.values(V).every(Boolean);
  console.log("allPass=" + allPass);
  process.exit(allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
