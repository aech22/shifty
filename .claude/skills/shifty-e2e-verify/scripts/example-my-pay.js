// 従業員画面 E5（給料設定・支給月の振り分け・月と年の表示）と E6（会社設定の賃金・getMyPay）の回帰テスト
// （2026-10-04・Shifty_実装計画_2026-10.md 第2部 E.2・E.4・E.5・E.6）。
// アプリ全体をスタブ Firebase で動かす（Firebase へは1バイトも出ない）。**セキュリティルールは評価しない**（ルールの形は tests/my.test.js）。
// E6 の getMyPay は cfHandlers の "myPay" が functions/my-pay.js の本物の判定関数を通す（CF 本体は shifty-cf-verify で本物を動かす）。
//
//  A（375px・設定タブ）: A店に給料設定（月末締め・翌月25日・時給1,200円・交通費500円/日）→ users/T1/workplaces/S1/pay。名前と色は残る。
//     手入力の「カフェ」に時給1,000円・深夜25%オン → workplaces/m_CAFE0001/pay（night:true）。一覧に要約が出る
//  B（給料タブ・月）: 既定は翌月の支給。A店 今日 10:00〜16:00＝6h → 7,200＋交通費500＝7,700、カフェ 13:00〜18:00＝5h → 5,000、合計12,700。
//     B店は未公開（グレー）なので金額に入らず「未公開のシフト1日は含めていません」。B店は時給が未設定で「—」
//  C（内訳と振込額）: A店の内訳に 基本 7,200・交通費 500。振込額 7,000 を保存 → users/T1/actuals/{支給月}/S1
//  D（年）: 支給月の行に 12,700 と 7,000。年間の合計
//  E（月間目標）: 設定タブで 50,000 円 → users/T1/goals/monthly。給料タブの弧が確定分の割合
//  F（Premium でない）: 金額を出さず案内。振込額は表示だけ（保存できない）・勤務先の編集が出ない
//  G（ルール未反映＝users への書き込みを拒否）: 振込額の保存で理由を出し、画面が落ちない
//  I（20日締め）: 締め期間が暦月をまたぐ・「目安」と月単位の割増のずれの注記
//  J（E6・会社設定）: getMyPay が賃金マスタの時給1,300円を返す → 勤務先の編集で「会社設定」の固定表示・時給の入力欄が無い・
//     給料タブの A店は 1,300 円で計算（7,800＋会社設定の交通費 月3,000）。呼び出しは shopId だけ（名前を渡さない）
//  K（E6・CF 失敗）: getMyPay が失敗 → 本人の設定（1,200円）で計算し「会社の賃金設定を確認できませんでした」
//  L（E6・ヘルプ先だけ）: 賃金の記録が無く所属店舗が別 → 「所属店舗（本店）で設定されています」・本人の設定で計算
//  M: A〜L で店舗のデータ（shops/）が1バイトも変わらない
//  すべての場面で console.error・pageerror が 0 件。375px で横はみ出し無し・入力欄16px以上
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-my-pay.js → allPass=true / EXIT=0
"use strict";
const path = require("node:path");
const { openHarness, REPO_ROOT } = require(path.join(__dirname, "mount-component.js"));
const { makeStub } = require(path.join(__dirname, "stub-firebase.js"));
const ROOT = process.env.SHIFTY_ROOT || REPO_ROOT;
const ONLY = process.env.SHIFTY_ONLY ? process.env.SHIFTY_ONLY.split(",") : null;
const SCRIPTS = ["app-utils.js", "app-my-utils.js", "app-core.js", "app-staff.js", "app-admin.js", "app-shift.js", "app-company.js", "app-my.js", "app-main.js"].map(src => ({ src, babel: !/utils|core/.test(src) }));
const THEME = `<style>*{box-sizing:border-box;margin:0;padding:0;}:root{--c-bg:#F0F2F5;--c-card:#FFFFFF;--c-input:#F3F4F6;--c-input2:#F0F2F5;` +
  `--c-border:#E5E7EB;--c-border2:#D1D5DB;--c-text:#1A1A2E;--c-text2:#374151;--c-text3:#6B7280;` +
  `--c-text4:#9CA3AF;--c-shadow:rgba(0,0,0,.06);--c-accent:#f87036;--c-danger:#DC2626;}input,select,textarea{font-size:16px;}</style>`;
const PHONE = { width: 375, height: 812 };
const USERS = { "tanaka@example.com": { uid: "T1", password: "pass12345" } };
const T1 = { uid: "T1", isAnonymous: false, email: "tanaka@example.com" };
const pad = n => String(n).padStart(2, "0");
const now = new Date();
const TODAY = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const YM = TODAY.slice(0, 7);
const DAYS = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
const LAST = `${YM}-${pad(DAYS)}`;
const NM = (() => { const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1)); return d.toISOString().slice(0, 7); })();
const D2 = [1, 2, 3].map(d => `${YM}-${pad(d)}`).find(d => d !== TODAY);
const per = (id, sid, tok, extra) => ({ id, urlToken: tok, shopId: sid, label: "今月", startDate: `${YM}-01`, endDate: LAST, deadlineDate: "", createdAt: "2026-09-01T00:00:00.000Z", ...(extra || {}) });
const PUB = { published: { at: "2026-09-02T00:00:00.000Z", byUid: "OWN" } };
const seed0 = () => ({
  global: { shops: { S1: { id: "S1", name: "A店" }, S2: { id: "S2", name: "B店" }, S0: { id: "S0", name: "本店" } } },
  shops: {
    S1: { owners: { OWN: "K1" }, private: { adminKey: "K1" }, staff: ["田中", "佐藤"],
      settings: { shopId: "S1", staffAttributes: { "田中": "parttime" }, candidates: [{ start: "10:00", end: "15:00" }] },
      periods: { p1: per("p1", "S1", "t1", PUB) },
      subs: { s1: { id: "s1", periodId: "p1", shopId: "S1", staffName: "田中", submittedAt: "2026-09-02T00:00:00Z", shifts: { [TODAY]: { status: "work", start: "10:00", end: "15:00", adjustedEnd: "16:00" } } },
        s2: { id: "s2", periodId: "p1", shopId: "S1", staffName: "佐藤", submittedAt: "2026-09-02T00:00:00Z", shifts: { [TODAY]: { status: "work", start: "9:00", end: "22:00" } } } },
      staffLinks: { T1: { name: "田中", method: "code", at: "2026-10-01T00:00:00.000Z" } } },
    S2: { owners: { OWN2: "K2" }, private: { adminKey: "K2" }, staff: ["田中 太郎"],
      settings: { shopId: "S2", candidates: [{ start: "18:00", end: "22:00" }] },
      periods: { q1: per("q1", "S2", "t2") },
      subs: { u1: { id: "u1", periodId: "q1", shopId: "S2", staffName: "田中 太郎", submittedAt: "2026-09-02T00:00:00Z", shifts: { [TODAY]: { status: "work", start: "18:00", end: "22:00" } } } },
      staffLinks: { T1: { name: "田中 太郎", method: "code", at: "2026-10-01T00:00:00.000Z" } } },
  },
  tokens: { t1: { shopId: "S1", periodId: "p1" }, t2: { shopId: "S2", periodId: "q1" } },
  accounts: { S1: { plan: "premium" }, S2: { plan: "premium" } },
  users: { T1: { profile: { displayName: "田中", updatedAt: "t" }, links: { S1: { name: "田中", at: "t" }, S2: { name: "田中 太郎", at: "t" } },
    workplaces: { S1: { kind: "shifty", shopId: "S1", color: "#2f6f9f", name: "本店前" }, m_CAFE0001: { kind: "manual", name: "カフェ", color: "#4f7d4a" } },
    shifts: { h_AAAAAAAAAA: { workplaceId: "m_CAFE0001", date: D2, start: "13:00", end: "18:00", breakMin: 0 } } } },
});
const hashHead = h => `<script>history.replaceState(null,"","/${h}");</script>`;
const preLS = obj => `<script>${Object.entries(obj).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)},${JSON.stringify(v)});`).join("")}</script>`;
async function openStaff({ db, viewport = PHONE, denyWrite, cfHandlers, wait = "[data-my-shift],[data-my-empty]" }) {
  const head = hashHead("#/me") + preLS({ ots_staffAccount_v1: JSON.stringify({ uid: "T1" }) }) + THEME +
    makeStub({ seed: db, view: "staff", tab: "periods", auth: "accounts", authSeed: { users: USERS, cur: T1 }, denyWrite, cfHandlers });
  return openHarness({ root: ROOT, jsx: "window.__harnessReady=true;", waitFor: wait, viewport, extraHead: head, scripts: SCRIPTS });
}
const sleep = (h, ms) => h.page.waitForTimeout(ms);
const waitSel = (h, s, ms = 15000) => h.page.waitForSelector(s, { timeout: ms }).then(() => true, () => false);
const click = (h, sel) => h.evaluate(sel => { const e = document.querySelector(sel); if (!e) return false; e.click(); return true; }, sel);
const db = (h, p) => h.evaluate(p => window.__db(p), p);
const overflowX = h => h.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
const fontsOk = h => h.evaluate(() => [...document.querySelectorAll("input,select,textarea")].every(i => parseFloat(getComputedStyle(i).fontSize) >= 16));
const settledPay = h => h.page.waitForFunction(() => { const d = document.querySelector("[data-my-pay]"); return d && !/読み込み中/.test(d.innerText); }, null, { timeout: 15000 }).catch(() => {});
async function openPay(h) { await click(h, '[data-my-tab="pay"]'); await waitSel(h, "[data-my-pay],[data-my-empty]"); await settledPay(h); await sleep(h, 300); }
const payView = h => h.evaluate(() => {
  const q = s => document.querySelector(s);
  const at = (s, a) => { const e = q(s); return e ? e.getAttribute(a) : null; };
  return {
    month: at("[data-my-pay-month]", "data-my-pay-month"), total: at("[data-my-pay-total]", "data-my-pay-total"),
    confirmed: at("[data-my-pay-confirmed]", "data-my-pay-confirmed"), projected: at("[data-my-pay-projected]", "data-my-pay-projected"),
    workmin: at("[data-my-pay-workmin]", "data-my-pay-workmin"), ring: at("[data-my-goal-ring]", "data-my-goal-ring"),
    goalMode: at("[data-my-pay-summary]", "data-my-pay-goal"), noWage: at("[data-my-pay-nowage]", "data-my-pay-nowage"), noWageText: (q("[data-my-pay-nowage]") || {}).innerText || "",
    goWage: !!q('[data-my-action="goWage"]'), totalFont: q("[data-my-pay-total]") ? parseFloat(getComputedStyle(q("[data-my-pay-total]")).fontSize) : 0,
    rows: [...document.querySelectorAll("[data-my-pay-row]")].map(r => ({ id: r.getAttribute("data-my-pay-row"), total: (r.querySelector("[data-my-pay-row-total]") || { getAttribute: () => null }).getAttribute("data-my-pay-row-total"),
      text: r.innerText, received: !!r.querySelector('[data-my-input="received"]'), receivedDisabled: !!(r.querySelector('[data-my-input="received"]') || {}).disabled,
      saveBtn: !!r.querySelector('[data-my-action="saveReceived"]') })),
    estimate: (q("[data-my-pay-estimate]") || {}).innerText || "", premiumNote: !!q("[data-my-pay-premium-note]"), text: (q("[data-my-pay]") || {}).innerText || "",
  };
});
async function editWorkplace(h, id) {
  await click(h, '[data-my-tab="settings"]');
  await waitSel(h, `[data-my-wp="${id}"] [data-my-action="editWorkplace"]`);
  await sleep(h, 300);
  await click(h, `[data-my-wp="${id}"] [data-my-action="editWorkplace"]`);
  await waitSel(h, `[data-my-wp-editor="${id}"]`);
}

(async () => {
  const R = {}, V = {};
  const run = k => !ONLY || ONLY.includes(k);
  let dump = seed0();
  const shops0 = JSON.stringify(dump.shops);
  const errs = (k, h) => { R[k + "_errors"] = h.errors.slice(); return h.errors.length === 0; };
  const pastD2 = D2 <= TODAY;

  // ---------------- A: 設定タブ → 給料設定 ----------------
  {
    const h = await openStaff({ db: dump });
    try {
      await editWorkplace(h, "S1");
      await click(h, '[data-my-wp-editor="S1"] [data-my-action="openPay"]');
      await waitSel(h, '[data-my-wp-editor="S1"] [data-my-pay-fields]');
      const fieldsA = await h.evaluate(() => [...document.querySelectorAll('[data-my-wp-editor="S1"] [data-my-input]')].map(e => e.getAttribute("data-my-input")));
      await h.page.fill('[data-my-wp-editor="S1"] [data-my-input="rate"]', "1200");
      await h.page.fill('[data-my-wp-editor="S1"] [data-my-input="commuteAmount"]', "500");
      const layoutA = { overflow: await overflowX(h), fonts: await fontsOk(h) };
      await click(h, '[data-my-wp-editor="S1"] [data-my-action="saveWorkplace"]');
      await sleep(h, 400);
      const s1 = await db(h, "users/T1/workplaces/S1");
      // カフェ（手入力）
      await click(h, '[data-my-wp="m_CAFE0001"] [data-my-action="editWorkplace"]');
      await waitSel(h, '[data-my-wp-editor="m_CAFE0001"]');
      await click(h, '[data-my-wp-editor="m_CAFE0001"] [data-my-action="openPay"]');
      await waitSel(h, '[data-my-wp-editor="m_CAFE0001"] [data-my-input="night"]');
      await h.page.fill('[data-my-wp-editor="m_CAFE0001"] [data-my-input="rate"]', "1000");
      await h.page.check('[data-my-wp-editor="m_CAFE0001"] [data-my-input="night"]');
      await click(h, '[data-my-wp-editor="m_CAFE0001"] [data-my-action="saveWorkplace"]');
      await sleep(h, 400);
      const cafe = await db(h, "users/T1/workplaces/m_CAFE0001");
      const summary = await h.evaluate(() => [...document.querySelectorAll("[data-my-wp]")].map(e => e.getAttribute("data-my-wp") + ":" + ((e.querySelector("[data-my-wp-pay]") || {}).innerText || "")));
      R.A = { fieldsA, s1, cafe, summary, layoutA };
      V.A_shiftyFields = ["closingDay", "holidayRule", "payMonthOffset", "payDay", "wageType", "rate", "commuteAmount", "commutePer"].every(k => fieldsA.includes(k)) && !fieldsA.includes("night");
      V.A_savedShifty = !!s1 && s1.kind === "shifty" && s1.shopId === "S1" && s1.color === "#2f6f9f" && s1.name === "本店前" && !!s1.pay &&
        s1.pay.closingDay === 31 && s1.pay.payMonthOffset === 1 && s1.pay.payDay === 25 && s1.pay.holidayRule === "before" && s1.pay.wageType === "hourly" &&
        s1.pay.rate === 1200 && JSON.stringify(s1.pay.commute) === JSON.stringify({ amount: 500, per: "day" }) && !("night" in s1.pay);
      V.A_savedManual = !!cafe && cafe.kind === "manual" && cafe.name === "カフェ" && cafe.pay && cafe.pay.rate === 1000 && cafe.pay.night === true && cafe.pay.over8 === false;
      V.A_summary = summary.some(x => x.startsWith("S1:") && /末日締め・翌月25日払い・時給1,200円/.test(x)) && summary.some(x => x.startsWith("m_CAFE0001:") && /時給1,000円/.test(x));
      V.A_layout = layoutA.overflow <= 0 && layoutA.fonts;
      V.A_noErrors = errs("A", h);
      dump = await h.evaluate(() => window.__dbDump());
    } finally { await h.browser.close(); }
  }
  const expS1 = 7700, expCafe = 5000, expTotal = expS1 + expCafe, expConfirmed = expS1 + (pastD2 ? expCafe : 0);

  // ---------------- B・C・D: 給料タブ ----------------
  {
    const h = await openStaff({ db: dump });
    try {
      await openPay(h);
      const v = await payView(h);
      const layoutB = { overflow: await overflowX(h), fonts: await fontsOk(h) };
      R.B = { v, layoutB, NM };
      const s1 = v.rows.find(r => r.id === "S1") || {}, cafe = v.rows.find(r => r.id === "m_CAFE0001") || {}, s2 = v.rows.find(r => r.id === "S2") || {};
      V.B_defaultMonth = v.month === NM;
      V.B_amounts = s1.total === String(expS1) && cafe.total === String(expCafe) && v.total === String(expTotal);
      V.B_confirmedSplit = v.confirmed === String(expConfirmed) && v.projected === String(expTotal - expConfirmed);
      V.B_workMin = v.workmin === String(360 + 300);
      // 月間目標は任意（2026-10-04 ユーザー指示）: 目標なしでも合計・確定分・見込みを大きく出し、円グラフは出さない。
      // 時給が未設定の勤務先（B店）は名前と「設定で時給を入れる」を出す
      V.B_noGoalShowsAmounts = v.goalMode === "none" && v.ring === null && v.totalFont >= 28 && v.total === String(expTotal) && v.confirmed === String(expConfirmed);
      V.B_noWageGuide = v.noWage === "some" && /B店/.test(v.noWageText) && /合計に入っていません/.test(v.noWageText) && v.goWage;
      V.B_grayExcluded = s2.total === "none" && /未公開のシフト1日は含めていません/.test(s2.text) === false && /目安/.test(v.estimate) && /グレー表示（未公開）のシフトは含めていません/.test(v.estimate);
      V.B_layout = layoutB.overflow <= 0 && layoutB.fonts;
      // C: 内訳と振込額
      await click(h, '[data-my-pay-row="S1"] [data-my-action="payDetail"]');
      await sleep(h, 200);
      const det = await h.evaluate(() => { const d = document.querySelector('[data-my-pay-detail="S1"]'); return d ? { text: d.innerText, items: [...d.querySelectorAll("[data-my-pay-item]")].map(x => x.getAttribute("data-my-pay-item") + ":" + x.innerText.replace(/\s+/g, " ")) } : null; });
      await click(h, '[data-my-pay-row="S2"] [data-my-action="payDetail"]');
      await sleep(h, 200);
      const detS2 = await h.evaluate(() => (document.querySelector('[data-my-pay-detail="S2"]') || {}).innerText || "");
      await h.page.fill('[data-my-pay-row="S1"] [data-my-input="received"]', "7,000");
      await click(h, '[data-my-pay-row="S1"] [data-my-action="saveReceived"]');
      await sleep(h, 400);
      const rec = await db(h, `users/T1/actuals/${NM}/S1`);
      R.C = { det, detS2, rec };
      V.C_detail = !!det && det.items.some(x => /^base:基本 6:00 7,200円$/.test(x)) && det.items.some(x => /^commute:交通費 500円$/.test(x)) && /本人の設定（時給 1,200円）/.test(det.text);
      V.C_grayNote = /未公開のシフト1日は含めていません/.test(detS2) && /時給（日給）が未設定/.test(detS2);
      V.C_received = rec === 7000;
      // D: 年
      await click(h, '[data-my-pay-tab="year"]');
      await settledPay(h);
      if (NM.slice(0, 4) !== YM.slice(0, 4)) await click(h, '[data-my-pay-nav="nextYear"]');
      await settledPay(h);
      await sleep(h, 400);
      const y = await h.evaluate(nm => {
        const r = document.querySelector(`[data-my-pay-year-row="${nm}"]`);
        return { row: r ? r.innerText.replace(/\s+/g, " ") : null, total: r ? r.querySelector("[data-my-pay-year-total]").getAttribute("data-my-pay-year-total") : null,
          sum: (document.querySelector("[data-my-pay-year-sumtotal]") || { getAttribute: () => null }).getAttribute("data-my-pay-year-sumtotal"),
          sumRec: (document.querySelector("[data-my-pay-year-sumreceived]") || { getAttribute: () => null }).getAttribute("data-my-pay-year-sumreceived"),
          rows: document.querySelectorAll("[data-my-pay-year-row]").length };
      }, NM);
      R.D = y;
      V.D_year = y.rows === 12 && y.total === String(expTotal) && /7,000円/.test(y.row) && y.sum === String(expTotal) && y.sumRec === "7000";
      V.D_layout = (await overflowX(h)) <= 0;
      V.BCD_noErrors = errs("BCD", h);
      dump = await h.evaluate(() => window.__dbDump());
    } finally { await h.browser.close(); }
  }

  // ---------------- N: これまでの給料をまとめて入力（引き継ぎ・2026-10-04）----------------
  // 前の年（Shifty を使う前）の年の表示から開き、A店の1〜3月とカフェの1月を入れる。前から入っていた A店の2月（50,000）は初期表示され、
  // 消すと確認が出て null で消える。書くのは変えたセルだけ（1回の update）。保存後、年の表の振込額の列と年間の合計に入る（見込みの列は変えない）
  {
    const PY = String(Number(YM.slice(0, 4)) - 1);
    const d = JSON.parse(JSON.stringify(dump));
    d.users.T1.actuals = { ...(d.users.T1.actuals || {}), [`${PY}-02`]: { S1: 50000 }, [`${PY}-04`]: { S1: 60000 } };
    for (const vp of [PHONE, { width: 320, height: 700 }]) {
      const h = await openStaff({ db: d, viewport: vp });
      try {
        const N = {};
        await openPay(h);
        await click(h, '[data-my-pay-tab="year"]'); await settledPay(h);
        while (await h.evaluate(py => !document.querySelector(`[data-my-pay-year="${py}"]`), PY)) { await click(h, '[data-my-pay-nav="prevYear"]'); await sleep(h, 200); }
        await settledPay(h); await sleep(h, 300);
        N.openBtn = await click(h, '[data-my-action="openBulk"]');
        await waitSel(h, `[data-my-bulk="${PY}"]`);
        N.form = await h.evaluate(py => { const f = document.querySelector("[data-my-bulk]"); const ins = [...f.querySelectorAll("[data-my-bulk-month]")];
          return { months: ins.length, wps: [...(f.querySelector("[data-my-bulk-wp]") || { options: [] }).options].map(o => o.value), feb: (f.querySelector(`[data-my-bulk-month="${py}-02"]`) || {}).value,
            numeric: ins.every(i => i.getAttribute("inputmode") === "numeric"), fonts: [...f.querySelectorAll("input,select")].every(i => parseFloat(getComputedStyle(i).fontSize) >= 16) }; }, PY);
        N.overflow = await overflowX(h);
        if (vp.width === 375) {
          await h.page.fill(`[data-my-bulk-month="${PY}-01"]`, "180000");
          await h.page.fill(`[data-my-bulk-month="${PY}-02"]`, "");
          await h.page.fill(`[data-my-bulk-month="${PY}-03"]`, "185,000");
          await h.page.selectOption("[data-my-bulk-wp]", "m_CAFE0001");
          await h.page.fill(`[data-my-bulk-month="${PY}-01"]`, "30000");
          await h.page.selectOption("[data-my-bulk-wp]", "S1");
          N.keptAfterSwitch = await h.evaluate(py => document.querySelector(`[data-my-bulk-month="${py}-01"]`).value, PY);
          // 書き込みを記録する（update の基点と鍵）・確認の文言を記録する
          await h.evaluate(() => { window.__upd = []; const o = firebaseDB.ref.bind(firebaseDB); firebaseDB.ref = p => { const r = o(p); const u = r.update && r.update.bind(r);
            if (u) r.update = v => { window.__upd.push({ p, keys: Object.keys(v).sort(), v }); return u(v); }; return r; };
            window.__cf = []; const c = window.confirm; window.confirm = m => { window.__cf.push(String(m)); return c(m); }; });
          await click(h, '[data-my-action="saveBulk"]'); await sleep(h, 600);
          N.upd = await h.evaluate(() => window.__upd); N.confirms = await h.evaluate(() => window.__cf);
          N.saved = await db(h, "users/T1/actuals");
          N.msg = await h.evaluate(() => [...document.querySelectorAll("[data-my-msg]")].map(x => x.innerText).join("|"));
          N.year = await h.evaluate(py => { const r = m => document.querySelector(`[data-my-pay-year-row="${py}-${m}"]`); return { jan: r("01") && r("01").innerText.replace(/\s+/g, " "),
            feb: r("02") && r("02").innerText.replace(/\s+/g, " "), sumRec: document.querySelector("[data-my-pay-year-sumreceived]").getAttribute("data-my-pay-year-sumreceived"),
            sumTotal: document.querySelector("[data-my-pay-year-sumtotal]").getAttribute("data-my-pay-year-sumtotal") }; }, PY);
          // もう一度開くと保存した値が入っている
          await click(h, '[data-my-action="openBulk"]'); await waitSel(h, "[data-my-bulk]");
          N.reopen = await h.evaluate(py => ["01", "02", "03"].map(m => document.querySelector(`[data-my-bulk-month="${py}-${m}"]`).value), PY);
          // 読めない入力は書かずに理由を出す
          await h.page.fill(`[data-my-bulk-month="${PY}-05"]`, "abc");
          await h.evaluate(() => { window.__upd = []; });
          await click(h, '[data-my-action="saveBulk"]'); await sleep(h, 300);
          N.badMsg = await h.evaluate(() => (document.querySelector('[data-my-bulk] [data-my-msg="error"]') || {}).innerText || "");
          N.badWrites = await h.evaluate(() => window.__upd.length);
          const u0 = (N.upd || [])[0] || { keys: [] };
          V.N_bulkSave = N.openBtn && N.form.months === 12 && N.form.wps.includes("S1") && N.form.wps.includes("m_CAFE0001") && N.form.feb === "50000" && N.form.numeric && N.form.fonts && N.keptAfterSwitch === "180000" &&
            N.upd.length === 1 && u0.p === "users/T1" && JSON.stringify(u0.keys) === JSON.stringify([`actuals/${PY}-01/m_CAFE0001`, `actuals/${PY}-01/S1`, `actuals/${PY}-02/S1`, `actuals/${PY}-03/S1`].sort()) &&
            u0.v[`actuals/${PY}-02/S1`] === null && N.confirms.some(m => /1件消します/.test(m)) &&
            N.saved[`${PY}-01`].S1 === 180000 && N.saved[`${PY}-01`].m_CAFE0001 === 30000 && !N.saved[`${PY}-02`] && N.saved[`${PY}-03`].S1 === 185000 && N.saved[`${PY}-04`].S1 === 60000;
          V.N_yearReflects = /210,000円/.test(N.year.jan) && N.year.sumRec === String(180000 + 30000 + 185000 + 60000) && N.year.sumTotal === "0" && /保存しました/.test(N.msg);
          V.N_reopenShowsSaved = JSON.stringify(N.reopen) === JSON.stringify(["180000", "", "185000"]);
          V.N_badInputNoWrite = /5月/.test(N.badMsg) && N.badWrites === 0;
        }
        N.errors = h.errors.slice();
        R["N" + vp.width] = N;
        V["N_layout" + vp.width] = N.overflow <= 0 && N.form.fonts && N.errors.length === 0;
      } finally { await h.browser.close(); }
    }
  }
  // ---------------- E: 月間目標 ----------------
  {
    const h = await openStaff({ db: dump });
    try {
      await click(h, '[data-my-tab="settings"]');
      await waitSel(h, '[data-my-section="goal"] [data-my-action="saveGoal"]');
      await h.page.fill('[data-my-input="goal"]', "50000");
      await click(h, '[data-my-action="saveGoal"]');
      await sleep(h, 400);
      const goal = await db(h, "users/T1/goals");
      await openPay(h);
      const v = await payView(h);
      R.E = { goal, ring: v.ring };
      V.E_goal = goal && goal.monthly === 50000 && v.ring === String(Math.round(expConfirmed / 50000 * 100)) && v.goalMode === "set";
      V.E_noErrors = errs("E", h);
      dump = await h.evaluate(() => window.__dbDump());
    } finally { await h.browser.close(); }
  }

  // ---------------- F: Premium でない ----------------
  {
    const d = JSON.parse(JSON.stringify(dump));
    d.accounts = { S1: { plan: "pro" }, S2: { plan: "pro" } };
    const h = await openStaff({ db: d });
    try {
      await openPay(h);
      const v = await payView(h);
      const s1 = v.rows.find(r => r.id === "S1") || {};
      R.F = { v };
      V.F_noAmounts = v.premiumNote && v.total === null && s1.total === null && s1.received && s1.receivedDisabled && !s1.saveBtn;
      // 一括入力も振込額の入力と同じ境目（Premium でなければ入口を出さない）
      await click(h, '[data-my-pay-tab="year"]'); await sleep(h, 400);
      V.F_noBulk = await h.evaluate(() => !!document.querySelector("[data-my-pay-yeartable]") && !document.querySelector('[data-my-action="openBulk"]'));
      await click(h, '[data-my-tab="settings"]');
      await waitSel(h, '[data-my-section="workplaces"] [data-my-wp]');
      await sleep(h, 400);
      R.F.settings = await h.evaluate(() => ({ edit: document.querySelectorAll('[data-my-action="editWorkplace"]').length, goalSave: !!document.querySelector('[data-my-action="saveGoal"]'),
        goalNote: !!document.querySelector("[data-my-goal-premium-note]") }));
      V.F_settingsViewOnly = R.F.settings.edit === 0 && !R.F.settings.goalSave && R.F.settings.goalNote;
      V.F_noErrors = errs("F", h);
    } finally { await h.browser.close(); }
  }

  // ---------------- G: ルール未反映（users への書き込みを拒否）----------------
  {
    const h = await openStaff({ db: dump, denyWrite: ["users/T1"] });
    try {
      await openPay(h);
      await h.page.fill('[data-my-pay-row="S1"] [data-my-input="received"]', "8000");
      await click(h, '[data-my-pay-row="S1"] [data-my-action="saveReceived"]');
      await sleep(h, 400);
      R.G = { msg: await h.evaluate(() => (document.querySelector('[data-my-received="S1"] [data-my-msg="error"]') || {}).innerText || ""), rec: await db(h, `users/T1/actuals/${NM}/S1`) };
      V.G_deniedShowsReason = /サーバー側の設定が未反映/.test(R.G.msg) && R.G.rec === 7000;
      V.G_noErrors = errs("G", h);
    } finally { await h.browser.close(); }
  }

  // ---------------- I: 20日締め（目安） ----------------
  {
    const d = JSON.parse(JSON.stringify(dump));
    d.users.T1.workplaces.S1.pay.closingDay = 20;
    const h = await openStaff({ db: d });
    try {
      await openPay(h);
      const v = await payView(h);
      const s1 = v.rows.find(r => r.id === "S1") || {};
      R.I = { v };
      const day = Number(TODAY.slice(8));
      const expMonth = day <= 20 ? NM : (() => { const x = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 2, 1)); return x.toISOString().slice(0, 7); })();
      V.I_estimate = v.month === expMonth && s1.total === String(expS1) && /目安/.test(s1.text) && /締日が月末でない勤務先/.test(v.estimate) && /21〜/.test(s1.text);
      V.I_noErrors = errs("I", h);
    } finally { await h.browser.close(); }
  }

  // ---------------- J・K・L: 会社設定（E6） ----------------
  if (run("J")) {
    const d = JSON.parse(JSON.stringify(dump));
    d.shops.S1.private.pay = { "田中": { payType: "hourly", base: 1300, effectiveFrom: "2026-01-01", commute: { amount: 3000, per: "month" }, updatedAt: "t" },
      "佐藤": { payType: "hourly", base: 9999, effectiveFrom: "2026-01-01", commute: { amount: 0, per: "month" } } };
    const h = await openStaff({ db: d, cfHandlers: { getMyPay: "myPay" } });
    try {
      await editWorkplace(h, "S1");
      await sleep(h, 300);
      const ed = await h.evaluate(() => { const e = document.querySelector('[data-my-wp-editor="S1"]'); return { company: !!e.querySelector("[data-my-company-pay]"), text: e.innerText,
        rate: !!e.querySelector('[data-my-input="rate"]'), commute: !!e.querySelector('[data-my-input="commuteAmount"]'), closing: !!e.querySelector('[data-my-input="closingDay"]') }; });
      await click(h, '[data-my-wp-editor="S1"] [data-my-action="cancelWorkplace"]');
      await openPay(h);
      const v = await payView(h);
      const s1 = v.rows.find(r => r.id === "S1") || {};
      const calls = await h.evaluate(() => window.__cf.filter(c => c.name === "getMyPay").map(c => c.payload));
      R.J = { ed, v: { total: v.total, s1 }, calls };
      V.J_companyFixed = ed.company && /会社設定/.test(ed.text) && /1,300円/.test(ed.text) && !ed.rate && !ed.commute && ed.closing && !/9,999/.test(ed.text);
      V.J_usesCompanyRate = s1.total === String(1300 * 6 + 3000);
      V.J_callShape = calls.length >= 1 && calls.every(p => Object.keys(p).join(",") === "shopId") && calls.some(p => p.shopId === "S1");
      V.J_noErrors = errs("J", h);
    } finally { await h.browser.close(); }
  }
  if (run("K")) {
    const h = await openStaff({ db: dump, cfHandlers: { getMyPay: "reject:internal" } });
    try {
      await editWorkplace(h, "S1");
      await sleep(h, 300);
      const ed = await h.evaluate(() => { const e = document.querySelector('[data-my-wp-editor="S1"]'); return { err: !!e.querySelector("[data-my-company-pay-error]"), rate: !!e.querySelector('[data-my-input="rate"]') }; });
      await click(h, '[data-my-wp-editor="S1"] [data-my-action="cancelWorkplace"]');
      await openPay(h);
      await click(h, '[data-my-pay-row="S1"] [data-my-action="payDetail"]');
      await sleep(h, 200);
      const v = await payView(h);
      const s1 = v.rows.find(r => r.id === "S1") || {};
      R.K = { ed, s1 };
      V.K_fallback = ed.err && ed.rate && s1.total === String(expS1) && /会社の賃金設定を確認できませんでした/.test(s1.text);
      V.K_noErrors = errs("K", h);
    } finally { await h.browser.close(); }
  }
  if (run("L")) {
    const d = JSON.parse(JSON.stringify(dump));
    d.shops.S1.settings.staffHomeShop = { "田中": "S0" };
    const h = await openStaff({ db: d, cfHandlers: { getMyPay: "myPay" } });
    try {
      await editWorkplace(h, "S1");
      await sleep(h, 300);
      const ed = await h.evaluate(() => { const e = document.querySelector('[data-my-wp-editor="S1"]'); return { home: (e.querySelector("[data-my-company-pay-home]") || {}).innerText || "", rate: !!e.querySelector('[data-my-input="rate"]') }; });
      await click(h, '[data-my-wp-editor="S1"] [data-my-action="cancelWorkplace"]');
      await openPay(h);
      const v = await payView(h);
      const s1 = v.rows.find(r => r.id === "S1") || {};
      R.L = { ed, s1 };
      V.L_homeShop = /所属店舗（本店）/.test(ed.home) && ed.rate && s1.total === String(expS1);
      V.L_noErrors = errs("L", h);
    } finally { await h.browser.close(); }
  }

  // ---------------- M: 店舗のデータは変わらない ----------------
  V.M_shopsUntouched = JSON.stringify(dump.shops) === shops0;
  const allPass = Object.values(V).every(Boolean);
  console.log(JSON.stringify({ verdict: { allPass, ...V }, detail: R }, null, 1));
  process.exit(allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
