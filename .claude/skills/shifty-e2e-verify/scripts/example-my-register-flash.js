// マイシフトの新規登録で「登録する」を押した直後に、認証後の画面（マイシフトのカレンダー＝[data-my-shift]）が一瞬出てから
// 認証待ちの画面（リンクを申請しました＝[data-my-link-requested]）に切り替わる不具合（2026-10-08 ユーザー報告）の回帰テスト。
// アプリ全体をスタブ Firebase（auth:"accounts"）で動かす。Firebase へは1バイトも出ない。
// 画面の移り変わりは2つの方法で採る:
//  ① ページに入れた MutationObserver が、DOM が変わるたびに状態（どの部品があるか）を sessionStorage に記録する（再読み込み・location.replace をまたいで残る）
//  ② Node から 50ms ごとに同じ状態を採る（ユーザーの目に入る程度の長さかどうかの目安）
// 状態: finish（続きの登録）／auth（ログイン・登録の画面）／shift（マイシフトのカレンダー＝認証後）／requested（申請しました＝認証待ち）／loading（読み込み中）
//  F1（メールリンク・375px）: 募集URL → 新規登録 → 確認メール → リンク → 登録ネーム・番号・パスワード →「登録する」→ 申請しました。
//      その間に shift が1度も出ないこと
//  F2（従来の登録欄・列挙保護で連結が拒否される＝本番と同じ）: 「アカウントを作成」→ 再読み込み → 申請しました。shift が出ないこと
//  F3（従来の登録欄・連結が通る環境）: 「アカウントを作成」→ 再読み込みなしで切り替わる → 申請しました。shift が出ないこと
//  F4（非回帰）: リンク済みのお店があるアカウントでログインすると、カレンダー（shift）がちゃんと出る
//  users/{uid}/links の読みは本番では数百ミリ秒かかるので、スタブの once() を 400ms 遅らせて読み込み中の間を作る（遅らせないと一瞬すぎて採れないことがある）
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-my-register-flash.js → allPass=true / EXIT=0
// 反証: SHIFTY_ROOT=<修正前の配信物> node ... → EXIT≠0（F1〜F3 で shift が先に出る）
"use strict";
const path = require("node:path");
const { openHarness } = require(path.join(__dirname, "mount-component.js"));
const { makeStub } = require(path.join(__dirname, "stub-firebase.js"));
// 既定はこのスクリプトが置かれたチェックアウト（mount-component.js の REPO_ROOT は本体のパスに固定なので、worktree では本体を見てしまう）
const ROOT = process.env.SHIFTY_ROOT || path.resolve(__dirname, "..", "..", "..", "..");
const SCRIPTS = ["app-utils.js", "app-my-utils.js", "app-core.js", "app-staff.js", "app-admin.js", "app-shift.js", "app-company.js", "app-my.js", "app-main.js"].map(src => ({ src, babel: !/utils|core/.test(src) }));
const seed = extra => Object.assign({
  global: { shops: { S1: { id: "S1", name: "A店" } } },
  shops: { S1: { owners: { OWNER: "K1" }, private: { adminKey: "K1" }, staff: ["田中", "鈴木"],
    settings: { shopId: "S1", candidates: [{ start: "10:00", end: "15:00" }] },
    periods: { p1: { id: "p1", urlToken: "t1", shopId: "S1", label: "10月前半", startDate: "2026-10-16", endDate: "2026-10-18", deadlineDate: "", createdAt: "2026-09-01T00:00:00.000Z" } } } },
  tokens: { t1: { shopId: "S1", periodId: "p1" } },
  accounts: { S1: { plan: "premium" } },
}, extra || {});
const urlHead = u => `<script>if(!sessionStorage.__urlSet){sessionStorage.__urlSet="1";history.replaceState(null,"",${JSON.stringify(u)});}</script>`;
// 読みの遅れ: users/*/links と users/*/workplaces 等の once() を遅らせる（本番の往復の代わり）。スタブの once を包む
const slowReads = `<script>(function(){var t=setInterval(function(){if(!window.firebase||!firebase.database)return;clearInterval(t);
  var db=firebase.database(),orig=db.ref.bind(db);db.ref=function(p){var r=orig(p);if(/^users\\/[^/]+\\/(links|workplaces|shifts|overrides)/.test(String(p||""))){var o=r.once.bind(r);r.once=function(){var a=arguments;return new Promise(function(res,rej){setTimeout(function(){o.apply(null,a).then(res,rej);},400);});};}return r;};
},1);})();</script>`;
// 状態の記録（再読み込みをまたぐ）。DOM の変化ごとに、直前と違う状態だけを足す
const RECORDER = `(() => {
  const st = () => { const q = s => !!document.querySelector(s); const a = [];
    if (q("[data-email-link-finish]")) a.push("finish"); if (q("[data-my-auth]")) a.push("auth");
    if (q("[data-my-shift]")) a.push("shift"); if (q("[data-my-link-requested]")) a.push("requested");
    if (!a.length && q("[data-my-view]")) a.push("view"); return a.join("+") || "other"; };
  window.__flashState = st;
  const rec = () => { if (sessionStorage.__flashOn !== "1") return; let log = []; try { log = JSON.parse(sessionStorage.__flashLog || "[]"); } catch {} const s = st();
    if (!log.length || log[log.length - 1] !== s) { log.push(s); sessionStorage.__flashLog = JSON.stringify(log); } };
  const start = () => { new MutationObserver(rec).observe(document.documentElement, { childList: true, subtree: true, attributes: true }); rec(); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();`;
const open = async ({ url, db, authSeed, viewport = { width: 375, height: 812 }, wait = "#root > *" }) => {
  const h = await openHarness({ root: ROOT, jsx: "window.__harnessReady=true;", waitFor: wait, viewport,
    extraHead: urlHead(url) + makeStub({ seed: db || seed(), view: "staff", tab: "periods", auth: "accounts", authSeed }) + (process.env.SHIFTY_FLASH_NO_DELAY === "1" ? "" : slowReads), scripts: SCRIPTS });
  await h.context.addInitScript(RECORDER);
  await h.page.evaluate(RECORDER);
  return h;
};
const waitSel = (h, s, ms = 15000) => h.page.waitForSelector(s, { timeout: ms }).then(() => true, () => false);
const click = (h, sel) => h.evaluate(sel => { const e = document.querySelector(sel); if (!e) return false; e.click(); return true; }, sel);
const layout = h => h.evaluate(() => ({ overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
  fonts: [...document.querySelectorAll("input,select,textarea")].filter(i => i.offsetParent).map(i => parseFloat(getComputedStyle(i).fontSize)) }));
const okLayout = L => L.overflow <= 0 && L.fonts.every(f => f >= 16);
const startRec = h => h.evaluate(() => { sessionStorage.__flashOn = "1"; sessionStorage.__flashLog = "[]"; });
// 50ms ごとに採る（再読み込み中の evaluate の失敗は飛ばす）。until の状態が出るか timeout まで
async function poll(h, until, ms = 12000) {
  const out = []; const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    let s = null; try { s = await h.evaluate(() => window.__flashState ? window.__flashState() : "boot"); } catch { s = "nav"; }
    if (!out.length || out[out.length - 1].s !== s) out.push({ t: Date.now() - t0, s });
    if (s && s.includes(until)) break;
    await h.page.waitForTimeout(50);
  }
  return out;
}
const recLog = h => h.evaluate(() => { try { return JSON.parse(sessionStorage.__flashLog || "[]"); } catch { return null; } });
const shiftBefore = (log, end) => { const i = log.findIndex(s => s.includes(end)); return log.slice(0, i < 0 ? log.length : i).some(s => s.includes("shift")); };
async function fillClassic(h, f) {
  for (const [k, v] of Object.entries(f)) await h.setInput(`[data-my-auth="register"] [data-my-input="${k}"]`, v);
}
(async () => {
  const R = {}, V = {};
  // ---- F1: メールリンク ----
  {
    const h = await open({ url: "/#/s/t1", wait: "[data-my-open]", authSeed: { users: {}, cur: null, emailLink: "on" } });
    try {
      await click(h, "[data-my-open]"); await waitSel(h, '[data-my-auth="login"]');
      await click(h, '[data-my-mode="register"]'); await waitSel(h, '[data-email-link-input="email"]');
      await h.setInput('[data-email-link-input="email"]', "tanaka@example.com");
      await click(h, '[data-email-link-action="send"]'); await waitSel(h, '[data-email-link="sent"]', 8000);
      const landing = await h.evaluate(() => window.__emailLinkUrl());
      await h.page.goto(landing, { waitUntil: "networkidle" });
      await waitSel(h, '[data-email-link-finish="form"]');
      for (const [k, v] of Object.entries({ displayName: "田中", number: "12", password: "pass1234", password2: "pass1234" }))
        await h.setInput(`[data-email-link-finish] [data-my-input="${k}"]`, v);
      await startRec(h);
      await click(h, '[data-email-link-action="finish"]');
      const samples = await poll(h, "requested");
      await waitSel(h, '[data-my-link-requested="S1"]', 8000);
      await h.page.waitForTimeout(800);
      const log = await recLog(h);
      R.F1 = { samples, log, layout: await layout(h), errors: h.errors.slice() };
      V.F1_emailLinkNoFlash = log && log.some(s => s.includes("requested")) && !shiftBefore(log, "requested") && !samples.some(x => x.s.includes("shift")) && okLayout(R.F1.layout);
      V.F1_noErrors = R.F1.errors.length === 0;
    } finally { await h.browser.close(); }
  }
  // ---- F2・F3: 従来の登録欄（メールリンクが使えない）。F2 は連結が拒否される（本番と同じ）、F3 は連結が通る ----
  for (const [key, linkBlocked] of [["F2", true], ["F3", false]]) {
    const h = await open({ url: "/#/s/t1", wait: "[data-my-open]", authSeed: { users: {}, cur: null, linkBlocked } });
    try {
      await click(h, "[data-my-open]"); await waitSel(h, '[data-my-auth="login"]');
      await click(h, '[data-my-mode="register"]'); await waitSel(h, '[data-email-link-input="email"]');
      await h.setInput('[data-email-link-input="email"]', "suzuki@example.com");
      await click(h, '[data-email-link-action="send"]');
      await waitSel(h, '[data-my-auth="register"] [data-my-input="displayName"]', 8000);
      await fillClassic(h, { displayName: "鈴木", number: "34", password: "pass1234", password2: "pass1234" });
      await startRec(h);
      await click(h, '[data-my-auth="register"] [data-my-action="submit"]');
      const samples = await poll(h, "requested");
      await waitSel(h, '[data-my-link-requested="S1"]', 8000);
      await h.page.waitForTimeout(800);
      const log = await recLog(h);
      R[key] = { samples, log, layout: await layout(h), errors: h.errors.slice() };
      V[key + "_classicNoFlash"] = log && log.some(s => s.includes("requested")) && !shiftBefore(log, "requested") && !samples.some(x => x.s.includes("shift")) && okLayout(R[key].layout);
      V[key + "_noErrors"] = R[key].errors.length === 0;
    } finally { await h.browser.close(); }
  }
  // ---- F4（非回帰）: リンク済みのアカウントでログインするとカレンダーが出る ----
  {
    const db = seed();
    db.shops.S1.staffLinks = { U9: { name: "田中", method: "number", at: "2026-10-01T00:00:00.000Z" } };
    db.users = { U9: { profile: { displayName: "田中", updatedAt: "2026-10-01T00:00:00.000Z" }, links: { S1: { name: "田中", at: "2026-10-01T00:00:00.000Z" } } } };
    const h = await open({ url: "/#/me", db, wait: '[data-my-auth="login"]', authSeed: { users: { "tanaka@example.com": { uid: "U9", password: "pass1234" } }, cur: null } });
    try {
      await h.setInput('[data-my-auth="login"] [data-my-input="email"]', "tanaka@example.com");
      await h.setInput('[data-my-auth="login"] [data-my-input="password"]', "pass1234");
      await startRec(h);
      await click(h, '[data-my-auth="login"] [data-my-action="submit"]');
      const shown = await waitSel(h, "[data-my-shift]", 12000);
      const log = await recLog(h);
      R.F4 = { shown, log, errors: h.errors.slice() };
      V.F4_linkedLoginShowsCalendar = shown && !log.some(s => s.includes("requested")) && R.F4.errors.length === 0;
    } finally { await h.browser.close(); }
  }
  const allPass = Object.values(V).every(Boolean);
  console.log(JSON.stringify({ verdict: { allPass, ...V }, R }, null, 1));
  process.exit(allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
