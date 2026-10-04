// 従業員画面 E3（シフト作成タブの「公開」ボタンとマイシフト）の回帰テスト（2026-10-04・Shifty_実装計画_2026-10.md 第2部 E.1・E.2・E.5・E.6）。
// アプリ全体をスタブ Firebase で動かす（Firebase へは1バイトも出ない）。**セキュリティルールは評価しない**（ルールの形は tests/my.test.js）。
//
//  A（スタッフ・375px・#/me）: 2店舗に紐付いた人。公開前は今日のマスに2つのグレーのドット、詳細は「提出済み（未確定）」、次のシフトは無し
//  B（オーナー・シフト作成タブ）: 「公開」→ periods/p1/published が書かれる（期間の差分 update＝他のフィールドは変わらない）
//  C（スタッフ）: A店の今日が黒文字（公開）で、管理者の調整後の時刻（10:00〜16:00）と希望（10:00〜15:00）。B店はグレーのまま。次のシフトは今日。
//     初めて見た公開は「変更あり」にせず、seen に今の内容が記録される
//  D（オーナー）: 「公開を取り下げる」→ published が消える → スタッフはグレーに戻る
//  E（オーナー）: 未公開から「確定」→ published も書かれる → スタッフは黒・「確定」。「確定を解除」→ published は残る → 黒のまま・「公開」
//  F（スタッフ）: 公開後に管理者が本人のシフトを直す → 「変更あり」の帯とマスの印 → 「確認した」で消え、開き直しても出ない
//  G（スタッフ）: 他人のシフトの変更では「変更あり」が付かない
//  H（スタッフ）: 改名で紐付けが無効になった店舗は出さない（理由を出す）
//  I（スタッフ）: どの店舗も Premium でないと公開済みでもグレー・プランの案内
//  AM（スタッフ・#/me）: 全員のシフト（2026-10-04）。有効な紐付けの2店舗・既定は公開済みの最新が新しい店舗・店舗の切り替え・未公開は選択肢に無い・
//     無効な紐付けの店舗は出ない・募集URLから開くとその店舗・公開済みが無ければ切り替えを出さない・375/320px
//  J（閲覧専用の端末）と K（本番相当 MY_SCREEN_ENABLED=false）: 公開ボタンが出ない。K はスタッフURLにマイシフトの入口も出ない
//  すべての場面で console.error・pageerror が 0 件。375px で横はみ出し無し
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-my-shift.js → allPass=true / EXIT=0
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { openHarness, REPO_ROOT } = require(path.join(__dirname, "mount-component.js"));
const { makeStub } = require(path.join(__dirname, "stub-firebase.js"));
const ROOT = process.env.SHIFTY_ROOT || REPO_ROOT;
const SCRIPTS = ["app-utils.js", "app-my-utils.js", "app-core.js", "app-staff.js", "app-admin.js", "app-shift.js", "app-company.js", "app-my.js", "app-main.js"].map(src => ({ src, babel: !/utils|core/.test(src) }));
const THEME = `<style>*{box-sizing:border-box;margin:0;padding:0;}:root{--c-bg:#F0F2F5;--c-card:#FFFFFF;--c-input:#F3F4F6;--c-input2:#F0F2F5;` +
  `--c-border:#E5E7EB;--c-border2:#D1D5DB;--c-text:#1A1A2E;--c-text2:#374151;--c-text3:#6B7280;` +
  `--c-text4:#9CA3AF;--c-shadow:rgba(0,0,0,.06);--c-accent:#f87036;--c-danger:#DC2626;}input,select,textarea{font-size:16px;}</style>`;
const PHONE = { width: 375, height: 812 };
const OWN = "OWN";
const USERS = { "tanaka@example.com": { uid: "T1", password: "pass12345" } };
const T1 = { uid: "T1", isAnonymous: false, email: "tanaka@example.com" };
const pad = n => String(n).padStart(2, "0");
const now = new Date();
const TODAY = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const YM = TODAY.slice(0, 7);
const LAST = `${YM}-${pad(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate())}`;
const per = (id, sid, tok) => ({ id, urlToken: tok, shopId: sid, label: "今月", startDate: `${YM}-01`, endDate: LAST, deadlineDate: "", createdAt: "2026-09-01T00:00:00.000Z" });
const seed0 = () => ({
  global: { shops: { S1: { id: "S1", name: "A店" }, S2: { id: "S2", name: "B店" } } },
  shops: {
    S1: { owners: { [OWN]: "K1" }, private: { adminKey: "K1" }, staff: ["田中", "佐藤"],
      settings: { shopId: "S1", candidates: [{ start: "10:00", end: "15:00" }] },
      periods: { p1: per("p1", "S1", "t1") },
      subs: {
        s1: { id: "s1", periodId: "p1", shopId: "S1", staffName: "田中", submittedAt: "2026-09-02T00:00:00Z", shifts: { [TODAY]: { status: "work", start: "10:00", end: "15:00", adjustedEnd: "16:00" } } },
        s2: { id: "s2", periodId: "p1", shopId: "S1", staffName: "佐藤", submittedAt: "2026-09-02T00:00:00Z", shifts: { [TODAY]: { status: "work", start: "12:00", end: "18:00" } } },
      },
      staffLinks: { T1: { name: "田中", method: "code", at: "2026-10-01T00:00:00.000Z" } } },
    S2: { owners: { OWN2: "K2" }, private: { adminKey: "K2" }, staff: ["田中 太郎"],
      settings: { shopId: "S2", candidates: [{ start: "18:00", end: "22:00" }] },
      periods: { q1: per("q1", "S2", "t2") },
      subs: { u1: { id: "u1", periodId: "q1", shopId: "S2", staffName: "田中 太郎", submittedAt: "2026-09-02T00:00:00Z", shifts: { [TODAY]: { status: "work", start: "18:00", end: "22:00" } } } },
      staffLinks: { T1: { name: "田中 太郎", method: "code", at: "2026-10-01T00:00:00.000Z" } } },
  },
  tokens: { t1: { shopId: "S1", periodId: "p1" }, t2: { shopId: "S2", periodId: "q1" } },
  accounts: { S1: { plan: "premium" }, S2: { plan: "premium" }, [OWN]: { shops: { S1: true } } },
  users: { T1: { profile: { displayName: "田中", updatedAt: "t" }, links: { S1: { name: "田中", at: "t" }, S2: { name: "田中 太郎", at: "t" } } } },
});
const hashHead = h => `<script>history.replaceState(null,"","/${h}");</script>`;
const preLS = obj => `<script>${Object.entries(obj).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)},${JSON.stringify(v)});`).join("")}</script>`;

function prodRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "shifty-myshift-prod-"));
  for (const s of SCRIPTS) fs.copyFileSync(path.join(ROOT, s.src), path.join(root, s.src));
  const core = fs.readFileSync(path.join(ROOT, "app-core.js"), "utf8");
  const swapped = core.replace('const DEV_MODE = location.hostname !== "shiftyshifty.app";', "const DEV_MODE = false;");
  if (swapped === core) throw new Error("DEV_MODE の行が見つからない");
  fs.writeFileSync(path.join(root, "app-core.js"), swapped);
  return root;
}
async function openStaff({ db, hash = "#/me", viewport = PHONE, root = ROOT, wait = "[data-my-shift],[data-my-empty]" }) {
  const head = hashHead(hash) + preLS({ ots_staffAccount_v1: JSON.stringify({ uid: "T1" }) }) + THEME +
    makeStub({ seed: db, view: "staff", tab: "periods", auth: "accounts", authSeed: { users: USERS, cur: T1 } });
  return openHarness({ root, jsx: "window.__harnessReady=true;", waitFor: wait, viewport, extraHead: head, scripts: SCRIPTS });
}
async function openOwner({ db, root = ROOT, denyRead, denyWrite, wait = "[data-period-confirm],[data-period-unconfirm]" }) {
  const h = await openHarness({ root, jsx: "window.__harnessReady=true;", waitFor: wait, viewport: { width: 1280, height: 900 },
    extraHead: THEME + makeStub({ seed: db, uid: OWN, view: "admin", tab: "edit", denyRead, denyWrite }), scripts: SCRIPTS });
  h.page.on("dialog", d => d.accept("所定の直し"));
  return h;
}
const sleep = (h, ms) => h.page.waitForTimeout(ms);
const waitSel = (h, s, ms = 15000) => h.page.waitForSelector(s, { timeout: ms }).then(() => true, () => false);
const click = (h, sel) => h.evaluate(sel => { const e = document.querySelector(sel); if (!e) return false; e.click(); return true; }, sel);
const db = (h, p) => h.evaluate(p => window.__db(p), p);
const dumpOf = h => h.evaluate(() => window.__dbDump());
const overflowX = h => h.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
// スタッフの画面で、今日のマス・今日の詳細・次のシフト・変更ありを読む（読み込みが落ち着くまで待つ）
async function staffView(h) {
  await h.page.waitForFunction(() => { const d = document.querySelector("[data-my-day]"); return d && !/読み込み中/.test(document.querySelector("[data-my-shift]").innerText); }, null, { timeout: 15000 }).catch(() => {});
  await sleep(h, 300);
  return h.evaluate(today => {
    const cell = document.querySelector(`[data-my-cal-day="${today}"]`);
    const rows = [...document.querySelectorAll("[data-my-entry]")].map(r => ({
      state: r.getAttribute("data-my-entry"), shop: r.getAttribute("data-my-entry-shop"),
      time: (r.querySelector("[data-my-entry-time]") || {}).innerText || "",
      color: getComputedStyle(r.querySelector("[data-my-entry-time]")).color,
      hope: (r.querySelector("[data-my-entry-hope]") || {}).innerText || "", changed: !!r.querySelector("[data-my-entry-changed]") }));
    return {
      kinds: cell ? cell.getAttribute("data-my-cal-kinds") : null,
      dots: cell ? [...cell.querySelectorAll("[data-my-dot]")].map(d => d.getAttribute("data-my-dot") + ":" + getComputedStyle(d).backgroundColor) : [],
      cellChanged: !!(cell && cell.querySelector("[data-my-cal-changed]")),
      rows, next: (document.querySelector("[data-my-next]") || {}).getAttribute ? document.querySelector("[data-my-next]").getAttribute("data-my-next") : null,
      nextText: (document.querySelector("[data-my-next]") || {}).innerText || "",
      changed: !!document.querySelector("[data-my-changed]"),
      premiumNote: !!document.querySelector("[data-my-premium-note]"),
      badLinks: (document.querySelector("[data-my-bad-links]") || {}).innerText || "",
    };
  }, TODAY);
}
const BLACK = "rgb(26, 26, 46)", GREY = "rgb(107, 114, 128)";
const rowOf = (v, shop) => v.rows.find(r => r.shop === shop) || {};

(async () => {
  const R = {}, V = {};
  let dump = seed0();
  const errs = (k, h) => { R[k + "_errors"] = h.errors.slice(); return h.errors.length === 0; };

  // ---------------- A: 公開前（グレー）----------------
  {
    const h = await openStaff({ db: dump });
    try {
      const v = await staffView(h);
      R.A = { ...v, overflow: await overflowX(h), fonts: await h.evaluate(() => [...document.querySelectorAll("input,select,textarea")].map(i => parseFloat(getComputedStyle(i).fontSize))) };
      V.A_greyBeforePublish = v.kinds === "submitted,submitted" && v.rows.length === 2 && v.rows.every(r => r.state === "submitted" && r.color === GREY)
        && rowOf(v, "S1").time === "10:00〜15:00" && rowOf(v, "S2").time === "18:00〜22:00" && v.next === "none" && !v.premiumNote;
      V.A_greyDots = v.dots.length === 2 && v.dots.every(d => d.startsWith("submitted:rgb(156, 163, 175)"));
      V.A_layout375 = R.A.overflow <= 0 && R.A.fonts.every(f => f >= 16);
      V.A_noErrors = errs("A", h);
    } finally { await h.browser.close(); }
  }
  // ---------------- B: 公開 ----------------
  {
    const h = await openOwner({ db: dump });
    try {
      const B = { publishBtn: await waitSel(h, "[data-period-publish]") };
      const before = await db(h, "shops/S1/periods/p1");
      await click(h, "[data-period-publish]");
      B.badge = await waitSel(h, "[data-period-published]");
      B.unpublishBtn = !!(await h.evaluate(() => document.querySelector("[data-period-unpublish]")));
      const after = await db(h, "shops/S1/periods/p1");
      B.published = after.published;
      B.otherSame = Object.keys(before).every(k => JSON.stringify(before[k]) === JSON.stringify(after[k]));
      B.hist = Object.values(after.history || {}).map(x => x.kind);
      B.s1 = await db(h, "shops/S1/subs/s1");
      R.B = B;
      V.B_publishWrites = B.publishBtn && B.badge && B.unpublishBtn && !!B.published && B.published.byUid === OWN && typeof B.published.at === "string"
        && B.otherSame && JSON.stringify(B.hist) === '["publish"]';
      V.B_noErrors = errs("B", h);
      dump = await dumpOf(h);
    } finally { await h.browser.close(); }
  }
  // ---------------- C: 公開後（黒文字・初回は変更ありにしない）----------------
  {
    const h = await openStaff({ db: dump });
    try {
      const v = await staffView(h);
      await sleep(h, 300);
      R.C = { ...v, seen: await db(h, "users/T1/seen") };
      const a = rowOf(v, "S1"), b = rowOf(v, "S2");
      V.C_blackAfterPublish = a.state === "published" && a.color === BLACK && a.time === "10:00〜16:00" && /希望 10:00〜15:00/.test(a.hope)
        && b.state === "submitted" && b.color === GREY && v.next === TODAY && /A店/.test(v.nextText);
      V.C_dotColor = v.dots.some(d => d === "published:rgb(248, 112, 54)") && v.dots.some(d => d.startsWith("submitted:"));
      V.C_firstViewNotChanged = !v.changed && !v.cellChanged && !!(R.C.seen && R.C.seen.S1 && R.C.seen.S1.p1 && R.C.seen.S1.p1.days && R.C.seen.S1.p1.days[TODAY]);
      V.C_noErrors = errs("C", h);
      dump = await dumpOf(h);
    } finally { await h.browser.close(); }
  }
  // ---------------- D: 取り下げ → グレーに戻る ----------------
  {
    const h = await openOwner({ db: dump });
    try {
      await waitSel(h, "[data-period-unpublish]");
      await click(h, "[data-period-unpublish]");
      await waitSel(h, "[data-period-publish]");
      R.D = { published: (await db(h, "shops/S1/periods/p1")).published || null };
      V.D_unpublishRemoves = R.D.published === null;
      V.D_noErrors = errs("D", h);
      dump = await dumpOf(h);
    } finally { await h.browser.close(); }
    const s = await openStaff({ db: dump });
    try {
      const v = await staffView(s);
      R.D.staff = v;
      V.D_staffGreyAgain = rowOf(v, "S1").state === "submitted" && rowOf(v, "S1").color === GREY && rowOf(v, "S1").time === "10:00〜15:00" && v.next === "none";
      V.D_staffNoErrors = errs("Ds", s);
      dump = await dumpOf(s);
    } finally { await s.browser.close(); }
  }
  // ---------------- E: 確定で同時に公開・解除しても公開は残る ----------------
  {
    const h = await openOwner({ db: dump });
    try {
      await click(h, "[data-period-confirm]");
      await waitSel(h, "[data-period-unconfirm]");
      await sleep(h, 300);
      const p = await db(h, "shops/S1/periods/p1");
      R.E = { confirmed: !!p.confirmation, published: p.published || null };
      V.E_confirmPublishes = R.E.confirmed && !!R.E.published && R.E.published.byUid === OWN;
      dump = await dumpOf(h);
    } finally { await h.browser.close(); }
    let s = await openStaff({ db: dump });
    try {
      const v = await staffView(s);
      R.E.staffConfirmed = v;
      V.E_staffConfirmedLabel = rowOf(v, "S1").state === "confirmed" && rowOf(v, "S1").color === BLACK && /確定/.test(v.nextText);
      V.E_staffNoErrors1 = errs("Es1", s);
      dump = await dumpOf(s);
    } finally { await s.browser.close(); }
    const h2 = await openOwner({ db: dump });
    try {
      await click(h2, "[data-period-unconfirm]");
      await waitSel(h2, "[data-period-confirm]");
      await sleep(h2, 300);
      const p = await db(h2, "shops/S1/periods/p1");
      R.E.afterUnconfirm = { confirmed: !!p.confirmation, published: p.published || null };
      V.E_unconfirmKeepsPublished = !R.E.afterUnconfirm.confirmed && !!R.E.afterUnconfirm.published && R.E.afterUnconfirm.published.at === R.E.published.at;
      V.E_noErrors = errs("E", h2);
      dump = await dumpOf(h2);
    } finally { await h2.browser.close(); }
    s = await openStaff({ db: dump });
    try {
      const v = await staffView(s);
      R.E.staffAfterUnconfirm = v;
      V.E_staffStillBlack = rowOf(v, "S1").state === "published" && rowOf(v, "S1").color === BLACK && !v.changed;
      V.E_staffNoErrors2 = errs("Es2", s);
      dump = await dumpOf(s);
    } finally { await s.browser.close(); }
  }
  // ---------------- G: 他人の変更では付かない ----------------
  {
    const d = JSON.parse(JSON.stringify(dump));
    d.shops.S1.subs.s2.shifts[TODAY] = { status: "work", start: "9:00", end: "21:00" };
    const s = await openStaff({ db: d });
    try {
      const v = await staffView(s);
      R.G = v;
      V.G_othersChangeNoBadge = !v.changed && !v.cellChanged && rowOf(v, "S1").state === "published";
      V.G_noErrors = errs("G", s);
    } finally { await s.browser.close(); }
  }
  // ---------------- F: 本人の変更で「変更あり」→ 確認した で消える ----------------
  {
    const d = JSON.parse(JSON.stringify(dump));
    d.shops.S1.subs.s1.shifts[TODAY].adjustedEnd = "17:00";
    let s = await openStaff({ db: d });
    try {
      const v = await staffView(s);
      R.F = { before: v };
      V.F_changedBadge = v.changed && v.cellChanged && rowOf(v, "S1").changed && rowOf(v, "S1").time === "10:00〜17:00" && /変更あり/.test(v.nextText);
      await click(s, '[data-my-action="seenChanges"]');
      await sleep(s, 400);
      const v2 = await staffView(s);
      R.F.afterSeen = v2;
      V.F_seenClears = !v2.changed && !v2.cellChanged && !rowOf(v2, "S1").changed;
      V.F_noErrors1 = errs("F1", s);
      dump = await dumpOf(s);
    } finally { await s.browser.close(); }
    s = await openStaff({ db: dump });
    try {
      const v = await staffView(s);
      R.F.reopen = v;
      V.F_reopenNoBadge = !v.changed && rowOf(v, "S1").time === "10:00〜17:00";
      V.F_noErrors2 = errs("F2", s);
    } finally { await s.browser.close(); }
  }
  // ---------------- H: 紐付けが無効（改名で名前がスタッフ一覧に無い）----------------
  {
    const d = JSON.parse(JSON.stringify(dump));
    d.shops.S1.staff = ["田中 一郎", "佐藤"];
    const s = await openStaff({ db: d });
    try {
      const v = await staffView(s);
      R.H = v;
      V.H_invalidLinkHidden = !v.rows.some(r => r.shop === "S1") && rowOf(v, "S2").state === "submitted" && /A店/.test(v.badLinks);
      V.H_noErrors = errs("H", s);
    } finally { await s.browser.close(); }
  }
  // ---------------- I: Premium でない ----------------
  {
    const d = JSON.parse(JSON.stringify(dump));
    d.accounts.S1.plan = "free"; d.accounts.S2.plan = "pro";
    const s = await openStaff({ db: d });
    try {
      const v = await staffView(s);
      R.I = v;
      V.I_nonPremiumGrey = v.rows.length === 2 && v.rows.every(r => r.state === "submitted") && v.premiumNote && v.next === "none";
      V.I_noErrors = errs("I", s);
    } finally { await s.browser.close(); }
    const d2 = JSON.parse(JSON.stringify(dump));
    d2.accounts.S1.plan = "free";
    const s2 = await openStaff({ db: d2 });
    try {
      const v = await staffView(s2);
      R.I.anyPremium = v;
      V.I_anyPremiumEnough = rowOf(v, "S1").state === "published" && !v.premiumNote;
      V.I_noErrors2 = errs("I2", s2);
    } finally { await s2.browser.close(); }
    const d3 = JSON.parse(JSON.stringify(seed0()));
    d3.accounts.S1.plan = "pro";
    const o = await openOwner({ db: d3, wait: "#root > *" });
    try {
      await sleep(o, 1500);
      R.I.ownerPro = await o.evaluate(() => ({ publish: !!document.querySelector("[data-period-publish]"), tab: document.body.innerText.includes("Excel出力") }));
      V.I_ownerProNoPublish = R.I.ownerPro.tab && !R.I.ownerPro.publish;
      V.I_noErrors3 = errs("I3", o);
    } finally { await o.browser.close(); }
  }
  // ---------------- J: 閲覧専用の端末 ----------------
  {
    const o = await openOwner({ db: seed0(), denyRead: ["shops/S1/private", "shops/S1/owners"], denyWrite: ["shops/S1/private", "shops/S1/owners"], wait: "#root > *" });
    try {
      await sleep(o, 2000);
      R.J = await o.evaluate(() => ({ publish: !!document.querySelector("[data-period-publish]"), text: document.body.innerText.includes("Excel出力"), readOnly: document.body.innerText.includes("管理者として登録されていません") }));
      V.J_readOnlyNoPublish = R.J.text && R.J.readOnly && !R.J.publish;
    } finally { await o.browser.close(); }
  }
  // ---------------- AM: メールのアカウントの「全員のシフト」（2026-10-04）----------------
  // 有効な紐付けのある2店舗。既定は公開済みの最新が新しい店舗（B店の後半）。店舗を A店に替えると A店の表（本人の列に印）。
  // 未公開の期間は選択肢に無い。紐付けが無効な店舗は出ない（1店舗なら店舗のプルダウンも出ない）。募集URLから開くとその店舗が既定。
  // どの店舗にも公開済みが無ければ切り替えを出さない。375px・320px で横はみ出し無し
  {
    const PUBM = { at: "2026-10-03T09:00:00.000Z", byUid: OWN };
    const amSeed = () => {
      const d = seed0();
      d.shops.S1.periods.p1.published = PUBM;
      d.shops.S2.periods.q1.published = PUBM;
      d.shops.S2.periods.q2 = { ...per("q2", "S2", "t3"), label: "後半", startDate: `${YM}-16`, published: PUBM };
      d.shops.S2.periods.q3 = { ...per("q3", "S2", "t4"), label: "未公開", startDate: `${YM}-20` };
      d.tokens.t3 = { shopId: "S2", periodId: "q2" }; d.tokens.t4 = { shopId: "S2", periodId: "q3" };
      return d;
    };
    const allInfo = h => h.evaluate(() => {
      const ps = document.querySelector("[data-my-all-period]"), ss = document.querySelector("[data-my-all-shop]"), t = document.querySelector("[data-my-all-table]");
      return { shop: ss ? ss.value : null, shops: ss ? [...ss.options].map(o => o.value) : [], period: ps ? ps.value : null, periods: ps ? [...ps.options].map(o => o.value) : [],
        cols: t ? [...t.querySelectorAll("th[data-my-all-col]")].map(x => x.getAttribute("data-my-all-col")) : [], me: t && t.querySelector("[data-my-all-me]") ? t.querySelector("[data-my-all-me]").getAttribute("data-my-all-col") : null,
        fonts: [...document.querySelectorAll("[data-my-all-pane] select")].map(x => parseFloat(getComputedStyle(x).fontSize)),
        tabs: document.querySelectorAll("[data-my-pager-tab]").length, text: /まだ公開されていません/.test(document.body.innerText) };
    });
    const openAll = async s => { await s.page.waitForSelector('[data-my-pager-tab="all"]', { timeout: 15000 }); await click(s, '[data-my-pager-tab="all"]'); await sleep(s, 600); await s.page.waitForSelector("[data-my-all-table]", { timeout: 15000 }); await sleep(s, 300); };
    let s = await openStaff({ db: amSeed() });
    try {
      const A = {};
      await openAll(s);
      A.first = await allInfo(s);
      await s.page.selectOption("[data-my-all-shop]", "S1"); await sleep(s, 800);
      await s.page.waitForSelector("[data-my-all-table]", { timeout: 15000 });
      A.s1 = await allInfo(s);
      A.overflow = await overflowX(s);
      await s.page.setViewportSize({ width: 320, height: 700 }); await sleep(s, 400);
      A.overflow320 = await overflowX(s);
      A.subsReads = await s.evaluate(() => (window.__reads || []).filter(p => /\/subs$/.test(p)).length);
      R.AM = A;
      V.AM_defaultNewestShop = A.first.shop === "S2" && JSON.stringify(A.first.shops) === JSON.stringify(["S1", "S2"]) && A.first.period === "q2" &&
        JSON.stringify(A.first.periods) === JSON.stringify(["q2", "q1"]) && A.first.me === "田中 太郎" && !A.first.text;
      V.AM_switchShop = A.s1.shop === "S1" && A.s1.period === "p1" && JSON.stringify(A.s1.cols) === JSON.stringify(["田中", "佐藤"]) && A.s1.me === "田中";
      V.AM_layout = A.overflow <= 0 && A.overflow320 <= 0 && A.first.fonts.length === 2 && A.first.fonts.every(f => f >= 16);
      V.AM_noErrors = errs("AM", s);
    } finally { await s.browser.close(); }
    // 紐付けが無効な店舗（S1 の名前が改名で消えた）は出ない。1店舗なので店舗のプルダウンも出ない
    const d = amSeed(); d.shops.S1.staff = ["田中 一郎", "佐藤"];
    s = await openStaff({ db: d });
    try {
      await openAll(s);
      const B = await allInfo(s);
      R.AM.invalid = B;
      V.AM_invalidLinkHidden = B.shops.length === 0 && B.shop === null && B.period === "q2" && B.me === "田中 太郎";
      V.AM_noErrors2 = errs("AM2", s);
    } finally { await s.browser.close(); }
    // 募集URL（A店）の「マイシフト」から開くと A店が既定
    s = await openStaff({ db: amSeed(), hash: "#/s/t1", wait: "[data-my-open]" });
    try {
      await click(s, "[data-my-open]");
      await openAll(s);
      const C = await allInfo(s);
      R.AM.fromStaffUrl = C;
      V.AM_preferredShop = C.shop === "S1" && C.period === "p1";
      V.AM_noErrors3 = errs("AM3", s);
    } finally { await s.browser.close(); }
    // どの店舗にも公開済みが無い → 切り替えを出さない（案内文も出さない）
    s = await openStaff({ db: seed0() });
    try {
      await staffView(s); await sleep(s, 1200);
      const D = await allInfo(s);
      D.allPane = await s.evaluate(() => !!document.querySelector('[data-my-pane="all"]'));
      R.AM.none = D;
      V.AM_noneNoSwitch = D.tabs === 0 && !D.allPane && !D.text;
      V.AM_noErrors4 = errs("AM4", s);
    } finally { await s.browser.close(); }
  }
  // ---------------- K: 本番相当 ----------------
  {
    const root = prodRoot();
    const o = await openOwner({ db: seed0(), root });
    try {
      R.K = await o.evaluate(() => ({ publish: !!document.querySelector("[data-period-publish]"), confirm: !!document.querySelector("[data-period-confirm]") }));
      V.K_prodNoPublish = R.K.confirm && !R.K.publish;
      V.K_noErrors = errs("K", o);
    } finally { await o.browser.close(); }
    const s = await openStaff({ db: seed0(), hash: "#/s/t1", root, wait: "#root > *" });
    try {
      await sleep(s, 1500);
      R.K.staff = await s.evaluate(() => ({ myOpen: !!document.querySelector("[data-my-open]"), my: !!document.querySelector("[data-my-shift]") }));
      V.K_prodNoMyEntrance = !R.K.staff.myOpen && !R.K.staff.my;
      V.K_noErrors2 = errs("K2", s);
    } finally { await s.browser.close(); }
  }
  const allPass = Object.values(V).every(Boolean);
  console.log(JSON.stringify({ verdict: { allPass, ...V }, detail: R }, null, 1));
  process.exit(allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
