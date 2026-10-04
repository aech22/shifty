// 従業員画面 E2（紐付け）の回帰テスト（2026-10-04・Shifty_実装計画_2026-10.md 第2部 E.3・E.4・E.6）。
// アプリ全体をスタブ Firebase で動かす（Firebase・Cloud Functions へは1バイトも出ない）。Cloud Functions は
// stub-firebase.js の cfHandlers "staffLink" が functions/staff-link.js の本物の計画関数を通す。
// **セキュリティルールは評価しない**（ルールの形は tests/my.test.js、CF 本体は shifty-cf-verify の example-staff-link.js）。
//
//  S（スタッフの端末・375px）: スタッフURL → マイシフト → 設定 → 「A店にリンクを申請」（登録ネームと番号を送る）→ 申請中 → 取り消し → もう一度申請。
//     横はみ出し無し・入力欄 16px 以上
//  O（オーナーの端末・1200px と 375px）: スタッフタブに「マイシフトのリンク申請」。
//     A（全角の番号 ０１２ → 田中）・B（空白違いの「山田　太郎」→ 山田 太郎）の提案、候補が2つの申請（田中＝名前・鈴木＝番号）、
//     数字以外の番号「A-01」では佐藤が提案されず「未リンクの申請」に残る。承認・取られた名前は押せない・却下。
//     編集モーダルのリンク済みの表示（個人リンクコードは 2026-10-05 に機能ごと削除＝発行のボタンもコードも出ない）。
//     改名で staffLinks の名前が移る／削除で紐付けが外れる／同じ名前に残っていた古い紐付けは追加のときに外れる
//  R（閲覧専用の端末）と P（本番相当 MY_SCREEN_ENABLED=false）: 提案が出ない
//  C（別のスタッフの端末・#/me）: 以前にコードで作られた紐付け（method "code"）が店舗名と登録名で出る。コードの入力欄は無い。解除
//  T（S の端末）: オーナーの改名の後は新しい名前（staffLinks が正）。削除された人は「お店の側でリンクが外されました」
//  H（2026-10-04）: オーナーの端末で staffLinks の購読が**まだ届いていない**あいだ（stub の holdOn）に、削除→同じ名前で再登録・改名・
//     古い紐付けの残る名前の追加をしても追随が書かれる（読む側 resolveMyLink でも古い紐付けは使われない）。staffLinks が読めないときは
//     「保留しました」を出して localStorage の列に残し、読めるようになって購読が届くとやり直す。
//     反証: SHIFTY_ROOT=<この修正より前の配信物> node ... → EXIT=1（購読が届く前の操作は何も書かれない）
//  すべての場面で console.error・pageerror が 0 件
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-my-link.js → allPass=true / EXIT=0
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
const USERS = {
  "tanaka@example.com": { uid: "T1", password: "pass12345" },
  "sato@example.com": { uid: "SA1", password: "pass12345" },
};
const seed0 = () => ({
  global: { shops: { S1: { id: "S1", name: "A店" } } },
  shops: { S1: { owners: { [OWN]: "K1" }, private: { adminKey: "K1" }, staff: ["田中", "山田 太郎", "佐藤", "鈴木"],
    settings: { shopId: "S1", candidates: [{ start: "10:00", end: "15:00" }], staffNumbers: { "田中": "012", "佐藤": "A-01", "鈴木": "7" } },
    periods: { p1: { id: "p1", urlToken: "t1", shopId: "S1", label: "10月後半", startDate: "2026-10-16", endDate: "2026-10-31", deadlineDate: "", createdAt: "2026-09-01T00:00:00.000Z" } },
    // 前に「高橋」と紐付いていたが、削除の追随が届かなかった古い紐付け（高橋はいまのスタッフ一覧に無い）
    staffLinks: { OLD1: { name: "高橋", method: "code", at: "2026-09-01T00:00:00.000Z" } } } },
  tokens: { t1: { shopId: "S1", periodId: "p1" } },
  accounts: { S1: { plan: "premium" }, [OWN]: { shops: { S1: true } } },
  users: {
    T1: { profile: { displayName: "たなか", number: "０１２".replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)), updatedAt: "t" } },
    SA1: { profile: { displayName: "さとう", updatedAt: "t" } },
  },
});
const hashHead = h => `<script>history.replaceState(null,"","/${h}");</script>`;
const preLS = obj => `<script>${Object.entries(obj).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)},${JSON.stringify(v)});`).join("")}</script>`;
const staffMark = uid => ({ ots_staffAccount_v1: JSON.stringify({ uid }) });

function prodRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "shifty-link-prod-"));
  for (const s of SCRIPTS) fs.copyFileSync(path.join(ROOT, s.src), path.join(root, s.src));
  const core = fs.readFileSync(path.join(ROOT, "app-core.js"), "utf8");
  const swapped = core.replace('const DEV_MODE = location.hostname !== "shiftyshifty.app";', "const DEV_MODE = false;")
    // 2026-10-04 に本番公開（MY_SCREEN_ENABLED = true）。この場面は「止め口を false にすると一括で消える」ことを確かめる
    .replace("const MY_SCREEN_ENABLED = true;", "const MY_SCREEN_ENABLED = false;");
  if (swapped === core) throw new Error("DEV_MODE の行が見つからない");
  fs.writeFileSync(path.join(root, "app-core.js"), swapped);
  return root;
}
async function openStaff({ hash, db, cur, viewport = PHONE, wait = "#root > *" }) {
  const head = hashHead(hash) + preLS(staffMark(cur.uid)) + THEME +
    makeStub({ seed: db, view: "staff", tab: "periods", auth: "accounts", authSeed: { users: USERS, cur }, cfHandlers: CFH });
  return openHarness({ root: ROOT, jsx: "window.__harnessReady=true;", waitFor: wait, viewport, extraHead: head, scripts: SCRIPTS });
}
async function openOwner({ db, uid = OWN, viewport = { width: 1200, height: 900 }, root = ROOT, denyRead, denyWrite, holdOn }) {
  return openHarness({ root, jsx: "window.__harnessReady=true;", waitFor: "#root > *", viewport,
    extraHead: THEME + makeStub({ seed: db, uid, view: "admin", tab: "staff", cfHandlers: CFH, denyRead, denyWrite, holdOn }), scripts: SCRIPTS });
}
const CFH = Object.fromEntries(["approveStaffLink", "unlinkStaff"].map(n => [n, "staffLink"]));
const sleep = (h, ms) => h.page.waitForTimeout(ms);
const text = h => h.evaluate(() => document.body.innerText);
const waitSel = (h, s, ms = 15000) => h.page.waitForSelector(s, { timeout: ms }).then(() => true, () => false);
const waitText = (h, t, ms = 15000) => h.page.waitForFunction(t => document.body.innerText.includes(t), t, { timeout: ms }).then(() => true, () => false);
const click = (h, sel) => h.evaluate(sel => { const e = document.querySelector(sel); if (!e) return false; e.click(); return true; }, sel);
const db = (h, p) => h.evaluate(p => window.__db(p), p);
const overflowX = h => h.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
const myMsg = h => h.evaluate(() => [...document.querySelectorAll("[data-my-msg]")].map(e => e.getAttribute("data-my-msg") + ":" + e.innerText.trim()).join("|"));
const openEdit = async (h, n) => { const r = await h.clickExact("編集", { rowText: n }); await sleep(h, 250); return r; };
const closeEdit = h => h.clickExact("閉じる");
const cands = (h, uid) => h.evaluate(u => { const el = document.querySelector(`[data-link-request="${u}"]`); return el ? [...el.querySelectorAll("[data-link-candidate]")].map(c => c.getAttribute("data-link-candidate") + (c.querySelector("[data-link-approve]") ? "" : "(取られた)") + ":" + c.innerText.split("\n")[1]) : null; }, uid);

(async () => {
  const R = {}, V = {};
  let dump = null;
  // ---------------- S: 申請 ----------------
  {
    const h = await openStaff({ hash: "#/s/t1", db: seed0(), cur: { uid: "T1", isAnonymous: false, email: "tanaka@example.com" }, wait: "[data-my-open]" });
    try {
      const S = {};
      await click(h, "[data-my-open]");
      S.view = await waitSel(h, "[data-my-view]");
      await click(h, '[data-my-tab="settings"]');
      S.section = await waitSel(h, '[data-my-section="links"]');
      S.none = await waitText(h, "まだどのお店ともリンクしていません");
      S.applyBox = await waitSel(h, '[data-my-link-apply="none"]');
      S.applyText = await h.evaluate(() => (document.querySelector('[data-my-link-apply]') || {}).innerText || "");
      await click(h, '[data-my-action="apply"]');
      S.pending = await waitSel(h, '[data-my-link-apply="pending"]');
      S.req = await db(h, "shops/S1/linkRequests/T1");
      await click(h, '[data-my-action="cancelRequest"]');
      await waitSel(h, '[data-my-link-apply="none"]');
      S.afterCancel = await db(h, "shops/S1/linkRequests/T1");
      await click(h, '[data-my-action="apply"]');
      await waitSel(h, '[data-my-link-apply="pending"]');
      S.overflow = await overflowX(h);
      S.fonts = await h.evaluate(() => [...document.querySelectorAll("[data-my-view] input")].map(i => parseFloat(getComputedStyle(i).fontSize)));
      S.errors = h.errors.slice();
      dump = await h.evaluate(() => window.__dbDump());
      R.S = S;
      V.S_apply = S.view && S.section && S.none && S.applyBox && /A店にリンクを申請/.test(S.applyText) && /たなか/.test(S.applyText) && /012/.test(S.applyText);
      V.S_requestWritten = !!S.req && S.req.displayName === "たなか" && S.req.number === "012" && typeof S.req.at === "string";
      V.S_pendingAndCancel = S.pending && S.afterCancel === null;
      V.S_layout = S.overflow <= 0 && S.fonts.length > 0 && S.fonts.every(f => f >= 16);
      V.S_noErrors = S.errors.length === 0;
    } finally { await h.browser.close(); }
  }
  // ほかのスタッフの申請（B・候補2つ・未リンク）を足す
  dump.shops.S1.linkRequests = {
    ...dump.shops.S1.linkRequests,
    Y1: { displayName: "山田　太郎", at: "2026-10-04T01:00:00.000Z" },
    X1: { displayName: "田中", number: "7", at: "2026-10-04T02:00:00.000Z" },
    Z1: { displayName: "さとう", number: "A-01", at: "2026-10-04T03:00:00.000Z" },
  };
  // ---------------- O: オーナー ----------------
  {
    const h = await openOwner({ db: dump });
    try {
      const O = {};
      O.card = await waitText(h, "マイシフトのリンク申請");
      await waitSel(h, '[data-link-request="T1"]');
      O.t1 = await cands(h, "T1");
      O.y1 = await cands(h, "Y1");
      O.x1 = await cands(h, "X1");
      O.z1Unmatched = await h.evaluate(() => !!document.querySelector('[data-link-unmatched] [data-link-request="Z1"]'));
      O.z1NoCand = await cands(h, "Z1");
      // A: 承認
      await click(h, '[data-link-request="T1"] [data-link-approve="田中"]');
      await h.page.waitForFunction(() => !document.querySelector('[data-link-request="T1"]'), null, { timeout: 8000 }).catch(() => {});
      O.linkT1 = await db(h, "shops/S1/staffLinks/T1");
      O.userT1 = await db(h, "users/T1/links/S1");
      O.reqT1Gone = (await db(h, "shops/S1/linkRequests/T1")) === null;
      await sleep(h, 300);
      // 田中が取られたので X1 の候補の田中は押せない
      O.x1After = await cands(h, "X1");
      await click(h, '[data-link-request="X1"] [data-link-approve="鈴木"]');
      await h.page.waitForFunction(() => !document.querySelector('[data-link-request="X1"]'), null, { timeout: 8000 }).catch(() => {});
      O.linkX1 = await db(h, "shops/S1/staffLinks/X1");
      await click(h, '[data-link-request="Y1"] [data-link-approve="山田 太郎"]');
      await h.page.waitForFunction(() => !document.querySelector('[data-link-request="Y1"]'), null, { timeout: 8000 }).catch(() => {});
      O.linkY1 = await db(h, "shops/S1/staffLinks/Y1");
      // 却下
      await click(h, '[data-link-reject="Z1"]');
      await h.page.waitForFunction(() => !document.querySelector('[data-link-request="Z1"]'), null, { timeout: 8000 }).catch(() => {});
      O.reqZ1Gone = (await db(h, "shops/S1/linkRequests/Z1")) === null;
      O.cardGone = !(await text(h)).includes("マイシフトのリンク申請");
      // 編集モーダル: リンク済み
      O.editTanaka = await openEdit(h, "田中");
      O.tanakaLinked = await h.evaluate(() => (document.querySelector('[data-staff-link="linked"]') || {}).innerText || "");
      await closeEdit(h);
      await openEdit(h, "佐藤");
      // 個人リンクコードは 2026-10-05 に機能ごと削除した。画面には発行のボタンもコードも出ない
      O.noIssueUi = await h.evaluate(() => !document.querySelector('[data-staff-link-action="issue"]') && !document.querySelector("[data-staff-link-code]") && !document.body.innerText.includes("個人リンクコード"));
      O.overflow1200 = await overflowX(h);
      await closeEdit(h);
      // 改名: 田中 → 田中 一郎
      await openEdit(h, "田中");
      await h.evaluate(() => {
        const inp = [...document.querySelectorAll("input")].find(i => i.value === "田中" && i.maxLength === 50);
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
        set.call(inp, "田中 一郎"); inp.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await h.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => x.innerText.trim() === "保存" && x.closest("div[style*='9998']")); b && b.click(); });
      await sleep(h, 800);
      O.renamed = await db(h, "shops/S1/staffLinks/T1/name");
      O.userT1NameAfterRename = await db(h, "users/T1/links/S1/name");
      // 削除: 鈴木（どの期間にも残さない）
      await h.clickExact("削除", { rowText: "鈴木" });
      await sleep(h, 300);
      await h.clickExact("削除する");
      await sleep(h, 800);
      O.x1Dropped = (await db(h, "shops/S1/staffLinks/X1")) === null;
      O.x1UserIndexStays = !!(await db(h, "users/X1/links/S1"));
      // 追加: 高橋（古い紐付け OLD1 が残っている名前）
      O.oldBefore = !!(await db(h, "shops/S1/staffLinks/OLD1"));
      await h.setInput('input[placeholder="スタッフ名を入力"]', "高橋");
      await h.clickExact("＋ 追加");
      await sleep(h, 800);
      O.takahashiAdded = ((await db(h, "shops/S1/staff")) || []).includes("高橋");
      O.oldDropped = (await db(h, "shops/S1/staffLinks/OLD1")) === null;
      O.errors = h.errors.slice();
      dump = await h.evaluate(() => window.__dbDump());
      R.O = O;
      V.O_card = O.card;
      V.O_suggestA_fullwidth = JSON.stringify(O.t1) === JSON.stringify(["田中:従業員番号が一致"]);
      V.O_suggestB_spaces = JSON.stringify(O.y1) === JSON.stringify(["山田 太郎:登録ネームが一致"]);
      V.O_multipleCandidates = JSON.stringify(O.x1) === JSON.stringify(["田中:登録ネームが一致", "鈴木:従業員番号が一致"]);
      V.O_nonDigitNotSuggested = O.z1Unmatched && O.z1NoCand && O.z1NoCand.length === 0;
      V.O_approveA = !!O.linkT1 && O.linkT1.name === "田中" && O.linkT1.method === "number" && !!O.userT1 && O.reqT1Gone;
      V.O_takenNotApprovable = !!O.x1After && O.x1After.some(s => s.startsWith("田中(取られた)")) && !!O.linkX1 && O.linkX1.name === "鈴木";
      V.O_approveB = !!O.linkY1 && O.linkY1.name === "山田 太郎" && O.linkY1.method === "name";
      V.O_reject = O.reqZ1Gone && O.cardGone;
      V.O_editLinked = O.editTanaka === "ok" && /リンク済み/.test(O.tanakaLinked) && /従業員番号が一致/.test(O.tanakaLinked);
      V.O_noIssueUi = O.noIssueUi === true;
      V.O_renameFollows = O.renamed === "田中 一郎" && O.userT1NameAfterRename === "田中";
      V.O_deleteDrops = O.x1Dropped;
      V.O_addDropsStale = O.oldBefore && O.takahashiAdded && O.oldDropped;
      V.O_layout = O.overflow1200 <= 0;
      V.O_noErrors = O.errors.length === 0;
    } finally { await h.browser.close(); }
  }
  // ---------------- O375 / R / P ----------------
  {
    const d = JSON.parse(JSON.stringify(dump));
    d.shops.S1.linkRequests = { Q1: { displayName: "山田太郎", number: "99999999", at: "2026-10-04T05:00:00.000Z" } };
    const h = await openOwner({ db: d, viewport: PHONE });
    try {
      R.O375 = { card: await waitSel(h, '[data-link-request="Q1"]') };
      R.O375.overflow = await overflowX(h);
      R.O375.errors = h.errors.slice();
      V.O375_layout = R.O375.card && R.O375.overflow <= 0 && R.O375.errors.length === 0;
    } finally { await h.browser.close(); }
    const d2 = JSON.parse(JSON.stringify(d));
    d2.accounts.STR = { shops: { S1: true } };
    // スタブはルールを評価しないので、オーナーでない端末の拒否（private の読み・owners と private の書き込み）を denyRead/denyWrite で再現する
    const r = await openOwner({ db: d2, uid: "STR", denyRead: ["shops/S1/private", "shops/S1/owners"], denyWrite: ["shops/S1/private", "shops/S1/owners"] });
    try {
      await waitText(r, "スタッフ一覧");
      await waitText(r, "この端末は管理者として登録されていません", 8000);
      await sleep(r, 800);
      R.R = { card: (await text(r)).includes("マイシフトのリンク申請") };
      R.R.edit = await openEdit(r, "佐藤");
      R.R.readOnlyBanner = (await text(r)).includes("この端末は管理者として登録されていません");
      R.R.section = await r.evaluate(() => !!document.querySelector("[data-staff-link]"));
      R.R.errors = r.errors.slice();
      V.R_readOnlyHidden = R.R.readOnlyBanner && R.R.edit === "ok" && !R.R.card && !R.R.section;
    } finally { await r.browser.close(); }
    const p = await openOwner({ db: d, root: prodRoot() });
    try {
      await waitText(p, "スタッフ一覧");
      await sleep(p, 800);
      R.P = { card: (await text(p)).includes("マイシフトのリンク申請") };
      R.P.edit = await openEdit(p, "佐藤");
      R.P.section = await p.evaluate(() => !!document.querySelector("[data-staff-link]"));
      R.P.reads = await p.evaluate(() => (window.__reads || []).filter(x => /staffLinks|linkRequests/.test(x)));
      V.P_prodHidden = R.P.edit === "ok" && !R.P.card && !R.P.section && R.P.reads.length === 0;
    } finally { await p.browser.close(); }
  }
  // ---------------- C: 以前にコードで作られた紐付けの表示と解除（#/me）----------------
  {
    const d = JSON.parse(JSON.stringify(dump));
    // 個人リンクコードを削除する前に作られた紐付け（method "code"）が残っている状態
    d.shops.S1.staffLinks = { ...(d.shops.S1.staffLinks || {}), SA1: { name: "佐藤", method: "code", at: "2026-10-04T00:00:00.000Z" } };
    d.users = { ...(d.users || {}), SA1: { ...((d.users || {}).SA1 || {}), links: { S1: { name: "佐藤", at: "2026-10-04T00:00:00.000Z" } } } };
    const h = await openStaff({ hash: "#/me", db: d, cur: { uid: "SA1", isAnonymous: false, email: "sato@example.com" }, wait: "[data-my-view]" });
    try {
      const C = {};
      await click(h, '[data-my-tab="settings"]');
      await waitSel(h, '[data-my-section="links"]');
      // コードの入力欄は無い
      C.noCodeUi = await h.evaluate(() => !document.querySelector('[data-my-input="linkCode"]') && !document.querySelector('[data-my-action="redeem"]'));
      C.linked = await waitSel(h, '[data-my-link="S1"][data-my-link-ok="1"]');
      C.row = await h.evaluate(() => (document.querySelector('[data-my-link="S1"]') || {}).innerText || "");
      C.msg = await myMsg(h);
      C.link = await db(h, "shops/S1/staffLinks/SA1");
      C.overflow = await overflowX(h);
      C.fonts = await h.evaluate(() => [...document.querySelectorAll("[data-my-view] input")].map(i => parseFloat(getComputedStyle(i).fontSize)));
      h.page.on("dialog", dlg => dlg.accept());
      await h.evaluate(() => { window.confirm = () => true; });
      await click(h, '[data-my-action="unlink"]');
      await waitText(h, "まだどのお店ともリンクしていません");
      C.unlinked = (await db(h, "shops/S1/staffLinks/SA1")) === null && (await db(h, "users/SA1/links/S1")) === null;
      C.errors = h.errors.slice();
      R.C = C;
      V.C_noCodeUi = C.noCodeUi === true;
      V.C_oldCodeLinkShown = C.linked && /A店/.test(C.row) && /登録名: 佐藤/.test(C.row) && !!C.link && C.link.method === "code";
      V.C_unlink = C.unlinked;
      V.C_layout = C.overflow <= 0 && C.fonts.every(f => f >= 16);
      V.C_noErrors = C.errors.length === 0;
    } finally { await h.browser.close(); }
  }
  // ---------------- T: 改名・削除の後の本人の見え方 ----------------
  {
    const h = await openStaff({ hash: "#/me", db: dump, cur: { uid: "T1", isAnonymous: false, email: "tanaka@example.com" }, wait: "[data-my-view]" });
    try {
      await click(h, '[data-my-tab="settings"]');
      const ok = await waitSel(h, '[data-my-link="S1"]');
      R.T = { ok, row: await h.evaluate(() => (document.querySelector('[data-my-link="S1"]') || {}).innerText || ""), errors: h.errors.slice() };
      V.T_renamedNameFromStaffLinks = /登録名: 田中 一郎/.test(R.T.row) && R.T.errors.length === 0;
    } finally { await h.browser.close(); }
    const d = JSON.parse(JSON.stringify(dump));
    USERS["x1@example.com"] = { uid: "X1", password: "pass12345" };
    const x = await openStaff({ hash: "#/me", db: d, cur: { uid: "X1", isAnonymous: false, email: "x1@example.com" }, wait: "[data-my-view]" });
    try {
      await click(x, '[data-my-tab="settings"]');
      await waitSel(x, '[data-my-link="S1"]');
      R.X = { row: await x.evaluate(() => (document.querySelector('[data-my-link="S1"]') || {}).innerText || ""), ok: await x.evaluate(() => document.querySelector('[data-my-link="S1"]').getAttribute("data-my-link-ok")), errors: x.errors.slice() };
      V.T_deletedShowsUnlinked = R.X.ok === "0" && /お店の側でリンクが外されました/.test(R.X.row) && R.X.errors.length === 0;
    } finally { await x.browser.close(); }
  }

  // ---------------- H: 購読が届く前の追随（2026-10-04）----------------
  {
    const at0 = "2026-10-01T00:00:00.000Z";
    const seedH = () => {
      const d = seed0();
      d.shops.S1.staff = ["田中", "佐藤", "鈴木"];
      d.shops.S1.staffLinks = { U_TAN: { name: "田中", method: "number", at: at0 }, U_SAT: { name: "佐藤", method: "name", at: at0 },
        U_SUZ: { name: "鈴木", method: "code", at: at0 }, U_OLD: { name: "高橋", method: "code", at: at0 } };
      delete d.shops.S1.linkRequests;
      return d;
    };
    const SL = "shops/S1/staffLinks";
    const queueOf = h => h.evaluate(() => { try { return JSON.parse(localStorage.getItem("ots_staffLinkOps_v1") || "{}"); } catch { return { broken: true }; } });
    const linkOk = (h, uid, nameForUser) => h.evaluate(([u, n]) => { const r = resolveMyLink("S1", { name: n }, window.__db("shops/S1/staffLinks/" + u), window.__db("shops/S1/staff")); return !!(r && r.ok); }, [uid, nameForUser]);
    const renameTanaka = async h => {
      await openEdit(h, "田中");
      await h.evaluate(() => {
        const inp = [...document.querySelectorAll("input")].find(i => i.value === "田中" && i.maxLength === 50);
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
        set.call(inp, "田中 一郎"); inp.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await h.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => x.innerText.trim() === "保存" && x.closest("div[style*='9998']")); b && b.click(); });
      await sleep(h, 800);
    };
    // H1: 購読は止めたまま（once は読める）
    let hDump = null;
    const h = await openOwner({ db: seedH(), holdOn: [SL] });
    try {
      const H = {};
      await waitText(h, "スタッフ一覧");
      await sleep(h, 600);
      H.heldAtStart = await h.evaluate(p => window.__holdPending(p), SL);
      // 削除 → 同じ名前で再登録
      await h.clickExact("削除", { rowText: "佐藤" }); await sleep(h, 300);
      await h.clickExact("削除する"); await sleep(h, 800);
      H.satAfterDelete = await db(h, SL + "/U_SAT");
      await h.setInput('input[placeholder="スタッフ名を入力"]', "佐藤");
      await h.clickExact("＋ 追加"); await sleep(h, 800);
      H.satReAdded = ((await db(h, "shops/S1/staff")) || []).includes("佐藤");
      H.satLinkGone = (await db(h, SL + "/U_SAT")) === null;
      H.satOldAccountSeesNew = await linkOk(h, "U_SAT", "佐藤");
      // 改名
      await renameTanaka(h);
      H.tanRenamed = await db(h, SL + "/U_TAN/name");
      // 古い紐付けの残る名前（高橋）の追加
      await h.setInput('input[placeholder="スタッフ名を入力"]', "高橋");
      await h.clickExact("＋ 追加"); await sleep(h, 800);
      H.oldGone = (await db(h, SL + "/U_OLD")) === null;
      H.oldAccountSeesNew = await linkOk(h, "U_OLD", "高橋");
      H.suzKept = !!(await db(h, SL + "/U_SUZ"));
      H.heldAtEnd = await h.evaluate(p => window.__holdPending(p), SL);
      H.queue = await queueOf(h);
      H.pendingToast = (await text(h)).includes("保留しました");
      H.errors = h.errors.slice();
      hDump = await h.evaluate(() => window.__dbDump());
      R.H = H;
      V.H_heldWholeTime = H.heldAtStart === true && H.heldAtEnd === true;
      V.H_deleteThenReAddDrops = H.satAfterDelete === null && H.satReAdded && H.satLinkGone && H.satOldAccountSeesNew === false;
      V.H_renameFollows = H.tanRenamed === "田中 一郎";
      V.H_addDropsStale = H.oldGone && H.oldAccountSeesNew === false && H.suzKept;
      V.H_noPending = !H.pendingToast && Object.keys(H.queue).length === 0;
      V.H_noErrors = H.errors.length === 0;
    } finally { await h.browser.close(); }
    // H2: staffLinks が読めない（ルール未反映・通信の失敗に相当）→ 保留して知らせる → 読めるようになって購読が届くとやり直す
    const h2 = await openOwner({ db: hDump, holdOn: [SL], denyRead: [SL] });
    try {
      const H2 = {};
      await waitText(h2, "スタッフ一覧");
      await sleep(h2, 600);
      await h2.clickExact("削除", { rowText: "鈴木" }); await sleep(h2, 300);
      await h2.clickExact("削除する");
      H2.toast = await waitText(h2, "保留しました", 5000);
      H2.suzStillThere = !!(await db(h2, SL + "/U_SUZ"));
      H2.queue = await queueOf(h2);
      await h2.evaluate(p => { window.__setDenyRead([]); window.__releaseHold(p); }, SL);
      await h2.page.waitForFunction(p => window.__db(p) === null, SL + "/U_SUZ", { timeout: 8000 }).catch(() => {});
      H2.suzGone = (await db(h2, SL + "/U_SUZ")) === null;
      H2.queueAfter = await queueOf(h2);
      H2.othersKept = !!(await db(h2, SL + "/U_TAN"));
      H2.errors = h2.errors.slice();
      R.H2 = H2;
      V.H2_pendingNotified = H2.toast && H2.suzStillThere && Array.isArray(H2.queue.S1) && H2.queue.S1.length === 1 && H2.queue.S1[0].kind === "drop";
      V.H2_retriedWhenReadable = H2.suzGone && Object.keys(H2.queueAfter).length === 0 && H2.othersKept;
      V.H2_noErrors = H2.errors.length === 0;
    } finally { await h2.browser.close(); }
  }

  const allPass = Object.values(V).every(Boolean);
  console.log(JSON.stringify({ verdict: { allPass, ...V }, detail: R }, null, 1));
  process.exit(allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
