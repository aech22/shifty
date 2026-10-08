// ホーム画面に追加したアプリ（iOS standalone）で上端がステータスバーの裏に隠れる不具合（2026-10-08 ユーザー報告）の回帰テスト。
// viewport-fit=cover のため standalone では画面がステータスバーの裏から描かれる。ヘッドレスのブラウザでは env(safe-area-inset-top) が 0 なので、
// index.html の --safe-top（＝env(safe-area-inset-top)）を 47px に上書きしてステータスバーのある状態を再現する（スタブ Firebase・外へは出ない）。
//
//  PG（個別URL #/m/ を直接開く・提出タブ）: 先頭の「提出するお店」の帯の上端が 47px 以上（ステータスバーの下）
//  ME（#/me を直接開く）: スクロールしても上に貼り付くヘッダーがステータスバーの下（47px）で止まる・最初の位置も 47px 以上
//  OV（募集URLの画面から「マイシフト」を重ねて開く）: 重ね表示の中身の上端が 47px 以上・スクロールしてもヘッダーが 47px で止まる・
//     重ね表示の上の帯（0〜47px）が背景色で塗られ下の画面が透けない
//  SM（提出状況の一覧＝全画面）: 見出しの上端が 47px 以上
//  0px（通常の Safari・PC 相当）では以上のどれも位置が変わらない（上端 0・ヘッダー 0）
//  すべての場面で console.error・pageerror が 0 件
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-safe-top.js → allPass=true / EXIT=0
// 反証: SHIFTY_ROOT=<ad687f9 の配信物> node ... → EXIT=1（帯も見出しも 0px＝ステータスバーの裏）
"use strict";
const path = require("node:path");
const { openHarness, REPO_ROOT } = require(path.join(__dirname, "mount-component.js"));
const { makeStub } = require(path.join(__dirname, "stub-firebase.js"));
const ROOT = process.env.SHIFTY_ROOT || REPO_ROOT;
const SCRIPTS = ["app-utils.js", "app-my-utils.js", "app-core.js", "app-staff.js", "app-admin.js", "app-shift.js", "app-company.js", "app-my.js", "app-main.js"].map(src => ({ src, babel: !/utils|core/.test(src) }));
const PHONE = { width: 375, height: 812 };
const SAT = 47;
const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWx";
const TOKEN2 = "ZyXwVuTsRqPoNmLkJiHgFeDc";
const USERS = { "tanaka@example.com": { uid: "T1", password: "pass12345" } };
const T1 = { uid: "T1", isAnonymous: false, email: "tanaka@example.com" };
const pad = n => String(n).padStart(2, "0");
const now = new Date();
const YM = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
const LAST = `${YM}-${pad(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate())}`;
const per = (id, sid, tok) => ({ id, urlToken: tok, shopId: sid, label: "今月", startDate: `${YM}-01`, endDate: LAST, deadlineDate: "", createdAt: "2026-09-01T00:00:00.000Z" });
const seed = () => ({
  global: { shops: { S1: { id: "S1", name: "A店" }, S4: { id: "S4", name: "D店" } } },
  shops: {
    S1: { owners: { OWN: "K1" }, private: { adminKey: "K1" }, staff: ["田中", "佐藤"], settings: { shopId: "S1", candidates: [{ start: "10:00", end: "15:00" }] },
      periods: { p1: per("p1", "S1", "t1") }, subs: {},
      staffLinks: { T1: { name: "田中", method: "code", at: "2026-10-01T00:00:00.000Z" } },
      staffPages: { [TOKEN]: { status: "approved", displayName: "田中", name: "田中", requestedAt: "t", approvedAt: "2026-10-01T00:00:00.000Z", byUid: "OWN" } } },
    S4: { owners: { OWN4: "K4" }, private: { adminKey: "K4" }, staff: ["たなか"], settings: { shopId: "S4", candidates: [{ start: "09:00", end: "13:00" }] },
      periods: { d1: per("d1", "S4", "t5") }, subs: {},
      staffPages: { [TOKEN2]: { status: "approved", displayName: "たなか", name: "たなか", requestedAt: "t", approvedAt: "2026-10-01T00:00:00.000Z", byUid: "OWN4" } } },
  },
  staffPageTokens: { [TOKEN]: { shopId: "S1", at: "t" }, [TOKEN2]: { shopId: "S4", at: "t" } },
  tokens: { t1: { shopId: "S1", periodId: "p1" }, t5: { shopId: "S4", periodId: "d1" } },
  accounts: { S1: { plan: "premium" }, S4: { plan: "premium" } },
  users: { T1: { profile: { displayName: "田中", updatedAt: "t" }, links: { S1: { name: "田中", at: "t" } } } },
});
const hashHead = h => `<script>history.replaceState(null,"","/${h}");</script>`;
const preLS = obj => `<script>${Object.entries(obj).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)},${JSON.stringify(v)});`).join("")}</script>`;
const satCss = px => `<style>:root{--safe-top:${px}px;}</style>`;
const waitSel = (h, s, ms = 15000) => h.page.waitForSelector(s, { timeout: ms }).then(() => true, () => false);
const click = (h, sel) => h.evaluate(sel => { const e = document.querySelector(sel); if (!e) return false; e.click(); return true; }, sel);
const topOf = (h, sel) => h.evaluate(sel => { const e = document.querySelector(sel); return e ? Math.round(e.getBoundingClientRect().top) : null; }, sel);
const sleep = (h, ms) => h.page.waitForTimeout(ms);
const open = (hash, px, ls, authSeed, waitFor) => openHarness({ root: ROOT, jsx: "window.__harnessReady=true;", waitFor, viewport: PHONE,
  extraHead: satCss(px) + hashHead(hash) + preLS(ls) + makeStub({ seed: seed(), view: "staff", tab: "periods", auth: "accounts", authSeed }), scripts: SCRIPTS });
// ページを縦に長くしてスクロールできるようにする（中身の量に左右されずに sticky を測るため）
const growPage = (h, sel) => h.evaluate(sel => { const e = document.querySelector(sel) || document.body; const d = document.createElement("div"); d.style.height = "3000px"; e.appendChild(d); }, sel);

(async () => {
  const R = {}, V = {};
  const errs = (k, h) => { R[k + "_errors"] = h.errors.slice(); return h.errors.length === 0; };
  for (const px of [SAT, 0]) {
    const k = px ? "" : "_zero";
    // ---------------- PG: 個別URL を直接開く（提出タブ） ----------------
    {
      const h = await open("#/m/" + TOKEN, px, { ots_myPageKnown_v1: JSON.stringify({ S1: { token: TOKEN, at: "t" }, S4: { token: TOKEN2, at: "t" } }) },
        { users: {}, cur: null }, '[data-my-view="page"]');
      try {
        await click(h, '[data-my-tab="submit"]');
        const bar = await waitSel(h, "[data-my-submit-bar]");
        R["PG" + k] = { bar, barTop: await topOf(h, "[data-my-submit-bar]"), scrollY: await h.evaluate(() => window.scrollY) };
        V["PG_barBelowStatusBar" + k] = bar && R["PG" + k].barTop === px;
        V["PG_noErrors" + k] = errs("PG" + k, h);
      } finally { await h.close(); }
    }
    // ---------------- ME: #/me を直接開く（ヘッダーが上に貼り付く） ----------------
    {
      const h = await open("#/me", px, { ots_staffAccount_v1: JSON.stringify({ uid: "T1" }) }, { users: USERS, cur: T1 }, "[data-my-tab]");
      try {
        await sleep(h, 300);
        const M = { headTop0: await topOf(h, "[data-my-view] header") };
        await growPage(h, "[data-my-view]");
        await h.evaluate(() => window.scrollTo(0, 600)); await sleep(h, 200);
        M.scrollY = await h.evaluate(() => window.scrollY);
        M.headTopScrolled = await topOf(h, "[data-my-view] header");
        R["ME" + k] = M;
        V["ME_headerStart" + k] = M.headTop0 === px;
        V["ME_headerSticksBelowStatusBar" + k] = M.scrollY > 0 && M.headTopScrolled === px;
        V["ME_noErrors" + k] = errs("ME" + k, h);
      } finally { await h.close(); }
    }
    // ---------------- OV: 募集URLの画面から「マイシフト」を重ねて開く ----------------
    {
      const h = await open("#/s/t1", px, { ots_staffAccount_v1: JSON.stringify({ uid: "T1" }) }, { users: USERS, cur: T1 }, "[data-my-open]");
      try {
        const O = { sm: null };
        // 提出状況の一覧（全画面）
        await h.clickExact("提出状況");
        O.sm = await waitSel(h, "[data-sm-modal]", 5000);
        O.smFirstTop = await h.evaluate(() => { const m = document.querySelector("[data-sm-modal]"); const c = m && m.firstElementChild; return c ? Math.round(c.getBoundingClientRect().top) : null; });
        await h.evaluate(() => { const b = [...document.querySelectorAll("[data-sm-modal] button")].find(x => /✕|閉じる/.test(x.textContent)); if (b) b.click(); });
        await sleep(h, 200);
        await click(h, "[data-my-open]");
        O.ov = await waitSel(h, '[data-my-overlay="1"] [data-my-tab]');
        await sleep(h, 300);
        O.headTop0 = await topOf(h, '[data-my-overlay="1"] header');
        await growPage(h, '[data-my-overlay="1"] [data-my-view]');
        await h.evaluate(() => { const o = document.querySelector('[data-my-overlay="1"]'); o.scrollTop = 600; o.dispatchEvent(new Event("scroll")); }); await sleep(h, 200);
        O.ovScroll = await h.evaluate(() => document.querySelector('[data-my-overlay="1"]').scrollTop);
        O.headTopScrolled = await topOf(h, '[data-my-overlay="1"] header');
        // 0〜SAT の帯を何が覆っているか（重ね表示自身＝背景で塗られていれば下の画面は透けない）
        O.bandOwner = await h.evaluate(sat => { if (!sat) return "none"; const e = document.elementFromPoint(187, Math.floor(sat / 2)); return e && e.closest('[data-my-overlay="1"]') ? "overlay" : (e ? e.tagName : null); }, px);
        R["OV" + k] = O;
        V["OV_smHeaderBelowStatusBar" + k] = O.sm && O.smFirstTop === px;
        V["OV_overlayStart" + k] = O.ov && O.headTop0 === px;
        V["OV_headerSticksBelowStatusBar" + k] = O.ovScroll > 0 && O.headTopScrolled === px;
        V["OV_bandPainted" + k] = px ? O.bandOwner === "overlay" : true;
        V["OV_noErrors" + k] = errs("OV" + k, h);
      } finally { await h.close(); }
    }
  }
  const allPass = Object.values(V).every(Boolean);
  console.log(JSON.stringify({ verdict: { allPass, ...V }, R }, null, 1));
  process.exit(allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
