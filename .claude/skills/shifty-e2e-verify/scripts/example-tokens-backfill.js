// tokens 逆引きインデックスの補完（app-main.js の tokensSyncedRef を見る useEffect）の回帰テスト（2026-10-04）。
// 以前は periods が変わるたびに（label・snapshot・laborTotals の自動更新でも）全期間の tokens/{urlToken} を
// 同じ値で書き直していた。いまは「サーバーに同じ値がある token は書かない」。
// アプリ全体をスタブ Firebase（stub-firebase.js）で動かし、firebase.database().ref() を包んで
// **tokens/ への書き込み（set・update・remove）を数える**。Firebase・Cloud Functions へは1バイトも出ない。
//
//  a. 初回マウントで、欠けている token（tok2）と値が違う token（tok3）だけが書かれ、同じ値がある token（tok1）は書かれない
//  b. 期間のフィールド（label・snapshot・laborTotals）が別端末から変わっても tokens への書き込みが 0 件
//  c. 期間を1件足すとその1件の token だけが1回書かれる（UI から作成＝savePeriods の書き込みと二重にならない／
//     別端末が足した期間＝補完が1回だけ書く）
//  d. 店舗を切り替えると、切り替え先の欠けている token だけが補完され、戻っても書き直さない
//  e. 期間を削除するとその token が消える（savePeriods 側）
//  f. オーナーでない端末（claim が拒否される）は tokens に1件も書かない
//  すべての場面で console.error・pageerror が 0 件
//
// 修正前（tokensSyncedRef 導入前）では b・c（と a の「同じ値は書かない」・f）が落ちる。
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-tokens-backfill.js → allPass=true / EXIT=0
"use strict";
const path = require("node:path");
const { openHarness, REPO_ROOT } = require(path.join(__dirname, "mount-component.js"));
const { makeStub } = require(path.join(__dirname, "stub-firebase.js"));
const ROOT = process.env.SHIFTY_ROOT || REPO_ROOT;
const SCRIPTS = ["app-utils.js", "app-my-utils.js", "app-core.js", "app-staff.js", "app-admin.js", "app-shift.js", "app-company.js", "app-my.js", "app-main.js"].map(src => ({ src, babel: !/utils|core/.test(src) }));
const THEME = `<style>*{box-sizing:border-box;}:root{--c-bg:#F0F2F5;--c-card:#FFFFFF;--c-input:#F3F4F6;--c-input2:#F0F2F5;` +
  `--c-border:#E5E7EB;--c-border2:#D1D5DB;--c-text:#1A1A2E;--c-text2:#374151;--c-text3:#6B7280;` +
  `--c-text4:#9CA3AF;--c-shadow:rgba(0,0,0,.06);--c-accent:#f87036;--c-danger:#DC2626;}</style>`;

const per = (id, sid, tok, label, start, end) => ({ id, urlToken: tok, shopId: sid, label, startDate: start, endDate: end, deadlineDate: "", createdAt: "2026-09-01T00:00:00.000Z" });
const seed = owner => ({
  global: { shops: { S1: { id: "S1", name: "A店" }, S2: { id: "S2", name: "B店" } } },
  shops: {
    S1: { owners: { [owner]: "K1" }, private: { adminKey: "K1" }, staff: { 0: "田中" }, settings: { shopId: "S1", candidates: [] },
      periods: { p1: per("p1", "S1", "tok1", "8月前半", "2026-08-01", "2026-08-15"), p2: per("p2", "S1", "tok2", "8月後半", "2026-08-16", "2026-08-31"),
        p3: per("p3", "S1", "tok3", "9月前半", "2026-09-01", "2026-09-15") } },
    S2: { owners: { [owner]: "K2" }, private: { adminKey: "K2" }, staff: { 0: "鈴木" }, settings: { shopId: "S2", candidates: [] },
      periods: { q1: per("q1", "S2", "tokQ1", "8月前半", "2026-08-01", "2026-08-15"), q2: per("q2", "S2", "tokQ2", "8月後半", "2026-08-16", "2026-08-31") } },
  },
  tokens: { tok1: { shopId: "S1", periodId: "p1" }, tok3: { shopId: "S1", periodId: "pOld" }, tokQ2: { shopId: "S2", periodId: "q2" } },
  accounts: { S1: { plan: "premium" }, S2: { plan: "premium" }, U1: { shops: { S1: true, S2: true } }, U2: { shops: { S1: true, S2: true } } },
});

// tokens/ への書き込みを数える。deny=true なら private・owners の書き込みと private の読みを拒否する（＝オーナーでない端末）
const recorder = deny => `<script>
(function(){
  var db=firebase.database(), orig=db.ref;
  window.__tokW=[];
  function denied(){ var e=new Error("PERMISSION_DENIED: Permission denied"); e.code="PERMISSION_DENIED"; return Promise.reject(e); }
  db.ref=function(p){
    var s=String(p===undefined?"":p).replace(/^\\/+/,""), r=orig(p);
    var isTok=/^tokens(\\/|$)/.test(s), isPriv=${deny ? "true" : "false"}&&/^shops\\/[^/]+\\/(private|owners)(\\/|$)/.test(s);
    if(!isTok&&!isPriv) return r;
    var w=Object.assign({},r);
    ["set","update","remove"].forEach(function(op){ var f=r[op]; w[op]=function(v){
      if(isPriv) return denied();
      window.__tokW.push({op:op,path:s,val:v===undefined?null:JSON.parse(JSON.stringify(v))}); return f.apply(r,arguments); }; });
    if(isPriv){ w.once=function(){ return denied(); }; }
    return w;
  };
})();
</script>`;

async function open(uid, deny) {
  return openHarness({ root: ROOT, jsx: "window.__harnessReady=true;", waitFor: "#root > *", viewport: { width: 1200, height: 900 },
    extraHead: THEME + makeStub({ seed: seed(uid === "U2" && deny ? "OTHER" : uid), uid, view: "admin", tab: "periods" }) + recorder(deny), scripts: SCRIPTS });
}
const sleep = (h, ms) => h.page.waitForTimeout(ms);
const takeW = h => h.evaluate(() => { const w = window.__tokW.slice(); window.__tokW.length = 0; return w; });
const curShop = h => h.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /店/.test(x.innerText) && x.innerText.includes("▼")); return b ? b.innerText.replace("▼", "").trim() : null; });
const clickExact = (h, t) => h.evaluate(t => { const b = [...document.querySelectorAll("button")].find(x => x.innerText.trim() === t); if (!b) return false; b.click(); return true; }, t);

(async () => {
  const R = {};
  let h = await open("U1", false);
  try {
    await h.page.waitForFunction(() => document.body.innerText.includes("期間管理"), { timeout: 20000 });
    await sleep(h, 2500);
    R.shop0 = await curShop(h);
    // a. 初回
    R.a = await takeW(h);
    // b. 別端末が期間のフィールドを変える（label・snapshot・laborTotals）
    await h.evaluate(() => {
      const db = firebase.database();
      db.ref("shops/S1/periods/p1/label").set("8月前半（改名）");
      db.ref("shops/S1/periods/p2/snapshot").set({ staffList: ["田中"], settings: { shopId: "S1" } });
      db.ref("shops/S1/periods/p3/laborTotals").set({ "田中": { workMin: 60, paid: 0, publicOff: 0, ceremony: 0 } });
    });
    await sleep(h, 1500);
    R.bLabelShown = await h.evaluate(() => document.body.innerText.includes("8月前半（改名）"));
    R.b = await takeW(h);
    // c1. UI から期間を1件作る（プリセット）
    await clickExact(h, "＋ 新しい期間を作成");
    await sleep(h, 300);
    R.c1Preset = await h.evaluate(() => {
      const card = [...document.querySelectorAll("div")].find(d => d.firstChild && d.firstChild.innerText === "新しい期間を作成");
      const b = card && [...card.querySelectorAll("button")].find(x => /^\d{4}年\d{1,2}月/.test(x.innerText.trim()) || /月(前半|後半)?$/.test(x.innerText.trim()));
      if (!b) return null; const t = b.innerText.trim(); b.click(); return t;
    });
    await sleep(h, 1500);
    R.c1 = await takeW(h);
    R.c1Periods = await h.evaluate(() => Object.values(window.__db("shops/S1/periods") || {}).map(p => ({ id: p.id, tok: p.urlToken, label: p.label })));
    // c2. 別端末が期間を1件足す
    await h.evaluate(() => firebase.database().ref("shops/S1/periods/p9").set({ id: "p9", urlToken: "tok9", shopId: "S1", label: "10月後半", startDate: "2026-10-16", endDate: "2026-10-31", deadlineDate: "", createdAt: "2026-09-02T00:00:00.000Z" }));
    await sleep(h, 1500);
    R.c2 = await takeW(h);
    // e. UI で作った期間を削除する
    const made = (R.c1Periods || []).find(p => !["p1", "p2", "p3", "p9"].includes(p.id));
    R.eTarget = made || null;
    if (made) {
      R.eClicked = await h.evaluate(label => {
        const btn = [...document.querySelectorAll("button")].filter(b => b.innerText.trim() === "削除").find(b => {
          let c = b.parentElement; for (let i = 0; i < 8 && c; i++, c = c.parentElement) { const n = [...c.querySelectorAll("button")].filter(x => x.innerText.trim() === "削除").length; if (n > 1) return false; if (c.innerText.includes(label)) return true; } return false; });
        if (!btn) return false; btn.click(); return true;
      }, made.label);
      await sleep(h, 1500);
      R.e = await takeW(h);
      R.eTokenGone = await h.evaluate(t => window.__db("tokens/" + t) == null, made.tok);
    }
    // d. 店舗を切り替える（企業連携タブの連携店舗の「ログイン」）→ 戻る
    await clickExact(h, "企業連携");
    await sleep(h, 800);
    R.d1Clicked = await clickExact(h, "ログイン");
    await sleep(h, 2500);
    R.shop1 = await curShop(h);
    R.d1 = await takeW(h);
    R.d2Clicked = await clickExact(h, "ログイン");
    await sleep(h, 2500);
    R.shop2 = await curShop(h);
    R.d2 = await takeW(h);
    R.tokensFinal = await h.evaluate(() => window.__db("tokens"));
  } catch (e) { R.exception = e.message; }
  R.errors = h.errors.slice();
  await h.close();

  // f. オーナーでない端末
  const F = {};
  h = await open("U2", true);
  try {
    // 2026-10-08 から、オーナーでない端末には管理者画面を描かず管理コードの入力画面を出す
    await h.page.waitForFunction(() => !!document.querySelector("[data-admin-code-gate]"), { timeout: 20000 });
    await sleep(h, 2500);
    F.readOnlyBanner = await h.evaluate(() => !!document.querySelector("[data-admin-code-gate]") && !document.body.innerText.includes("期間管理"));
    await h.evaluate(() => firebase.database().ref("shops/S1/periods/p1/label").set("他端末の改名"));
    await h.evaluate(() => firebase.database().ref("shops/S2/periods/q1/label").set("他端末の改名"));
    await sleep(h, 1500);
    F.w = await takeW(h);
  } catch (e) { F.exception = e.message; }
  F.errors = h.errors.slice();
  await h.close();

  const sets = w => (w || []).filter(x => x.op === "set").map(x => x.path).sort();
  const firstShop = R.shop0 === "A店" ? "S1" : "S2";
  const expA = firstShop === "S1" ? ["tokens/tok2", "tokens/tok3"] : ["tokens/tokQ1"];
  const expD1 = firstShop === "S1" ? ["tokens/tokQ1"] : ["tokens/tok2", "tokens/tok3"];
  const v = {
    a_missingAndWrongWrittenOnce: JSON.stringify(sets(R.a)) === JSON.stringify(expA) && R.a.length === expA.length,
    a_sameValueNotWritten: !(R.a || []).some(x => x.path === "tokens/tok1" || x.path === "tokens/tokQ2"),
    a_valuesRight: firstShop !== "S1" || ((R.tokensFinal || {}).tok3 || {}).periodId === "p3",
    b_labelReachedUi: R.bLabelShown === true,
    b_noTokenWrites: Array.isArray(R.b) && R.b.length === 0,
    c1_onlyNewToken: !!(R.c1Preset && R.eTarget && R.c1.length === 1 && R.c1[0].path === "tokens/" + R.eTarget.tok && R.c1[0].val.periodId === R.eTarget.id),
    c2_onlyNewToken: Array.isArray(R.c2) && R.c2.length === 1 && R.c2[0].path === "tokens/tok9" && R.c2[0].op === "set",
    e_tokenRemoved: R.eClicked === true && R.eTokenGone === true && (R.e || []).some(x => x.op === "remove" && x.path === "tokens/" + (R.eTarget || {}).tok),
    d_switchedAndBack: R.d1Clicked === true && R.d2Clicked === true && R.shop1 && R.shop1 !== R.shop0 && R.shop2 === R.shop0,
    d_switchBackfills: JSON.stringify(sets(R.d1)) === JSON.stringify(expD1) && R.d1.length === expD1.length,
    d_backNoWrites: Array.isArray(R.d2) && R.d2.length === 0,
    f_readOnly: F.readOnlyBanner === true,
    f_noTokenWrites: Array.isArray(F.w) && F.w.length === 0,
    noErrors: R.errors.length === 0 && F.errors.length === 0 && !R.exception && !F.exception,
  };
  // 期間 a（初回）が S1 で始まらない環境でも d が両店舗を通るので a+d で全期間が1回ずつ補完される
  v.allPass = Object.values(v).every(Boolean);
  console.log(JSON.stringify({ root: ROOT, R, F, verdict: v }, null, 2));
  process.exit(v.allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
