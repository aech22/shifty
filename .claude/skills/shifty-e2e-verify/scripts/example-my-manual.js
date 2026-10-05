// 従業員画面 E4（手入力の勤務先とシフト・履歴から追加・実績の上書き・.ics）の回帰テスト（2026-10-04・Shifty_実装計画_2026-10.md 第2部 E.2・E.4・E.6）。
// アプリ全体をスタブ Firebase で動かす（Firebase へは1バイトも出ない）。**セキュリティルールは評価しない**（ルールの形は tests/my.test.js）。
//
//  A（スタッフ・375px・設定タブ）: 勤務先の一覧に Shifty の2店舗。手入力の勤務先「カフェ」を追加（色を選ぶ）→ users/T1/workplaces/m_* 。
//     A店の名前と色を変える → workplaces/S1 は kind shifty・shopId S1（フィールド単位の update＝既存の pay は残る）
//  B（マイシフト）: 今日に手入力のシフトを追加 → カレンダーに3つのドット（掛け持ち）・詳細に「手入力」。A店のドットは選んだ色。次のシフトが手入力の 9:00
//     別の日に 18:00〜2:00 → 24時超えの案内と「26:00 にする」→ 保存は 26:00。今日のシフトを直す。3つ目の日に履歴から追加（ワンタップ）→ 削除（確認つき）
//  C（実績の上書き）: 公開済みの A店の今日を 10:00〜17:30・休憩15分に → **シフトの表示は公開の 10:00〜16:00 のまま**（2026-10-04 ユーザー指示
//     「スタッフ側の出退勤時間の変更は給料計算のみに影響」）で、「給料計算の実績 10:00〜17:30（休憩15分）」の1行が出る・変更ありは付かない。
//     給料の内訳に「あなたが入れた実績の時間で計算した日」。開き直しても同じ。「実績を消す」で消える
//  D（.ics）: この月の公開済み＋手入力（グレーは入らない）。CRLF・TZID・26:00 は翌日の 2:00・上書きの時刻・SEQUENCE・書き出し後の端末ごとの案内・
//     TimeTree などで見るときの折りたたみの案内（端末ごとの3手順・2026-10-04）・
//            日付の詳細の「Google カレンダーに追加」リンク（2026-10-04。2026-10-05 に外したので、無いことを確かめる）
//  E: A〜D で店舗のデータ（shops/）が1バイトも変わらない
//  F（Premium でない）: 入れたシフトは表示・追加と編集と .ics は出ない・削除はできる。設定タブも追加と編集が出ない
//  G（ルール未反映＝users への書き込みを拒否）: 追加しても画面が落ちず理由を出す
//  H（勤務先の削除）: シフトの件数を示して確認 → 勤務先とそのシフトが消える
//  すべての場面で console.error・pageerror が 0 件。375px で横はみ出し無し・入力欄16px以上
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-my-manual.js → allPass=true / EXIT=0
"use strict";
const path = require("node:path");
const { openHarness, REPO_ROOT } = require(path.join(__dirname, "mount-component.js"));
const { makeStub } = require(path.join(__dirname, "stub-firebase.js"));
const ROOT = process.env.SHIFTY_ROOT || REPO_ROOT;
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
// 今日と別の、同じ月の日を2つ
const others = [1, 2, 3, 4].map(d => `${YM}-${pad(d)}`).filter(d => d !== TODAY);
const D2 = others[0], D3 = others[1];
const nextDay = d => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10).replace(/-/g, ""); };
const per = (id, sid, tok, extra) => ({ id, urlToken: tok, shopId: sid, label: "今月", startDate: `${YM}-01`, endDate: LAST, deadlineDate: "", createdAt: "2026-09-01T00:00:00.000Z", ...(extra || {}) });
const seed0 = () => ({
  global: { shops: { S1: { id: "S1", name: "A店" }, S2: { id: "S2", name: "B店" } } },
  shops: {
    S1: { owners: { OWN: "K1" }, private: { adminKey: "K1" }, staff: ["田中", "佐藤"],
      settings: { shopId: "S1", candidates: [{ start: "10:00", end: "15:00" }], staffNumbers: { "佐藤": "77" } },
      periods: { p1: per("p1", "S1", "t1", { published: { at: "2026-09-02T00:00:00.000Z", byUid: "OWN" } }) },
      subs: { s1: { id: "s1", periodId: "p1", shopId: "S1", staffName: "田中", submittedAt: "2026-09-02T00:00:00Z", shifts: { [TODAY]: { status: "work", start: "10:00", end: "15:00", adjustedEnd: "16:00" } } } },
      staffLinks: { T1: { name: "田中", method: "code", at: "2026-10-01T00:00:00.000Z" } } },
    S2: { owners: { OWN2: "K2" }, private: { adminKey: "K2" }, staff: ["田中 太郎"],
      settings: { shopId: "S2", candidates: [{ start: "18:00", end: "22:00" }], staffNumbers: { "田中 太郎": "0123" } },
      periods: { q1: per("q1", "S2", "t2") },
      subs: { u1: { id: "u1", periodId: "q1", shopId: "S2", staffName: "田中 太郎", submittedAt: "2026-09-02T00:00:00Z", shifts: { [TODAY]: { status: "work", start: "18:00", end: "22:00" } } } },
      staffLinks: { T1: { name: "田中 太郎", method: "code", at: "2026-10-01T00:00:00.000Z" } } },
  },
  tokens: { t1: { shopId: "S1", periodId: "p1" }, t2: { shopId: "S2", periodId: "q1" } },
  accounts: { S1: { plan: "premium" }, S2: { plan: "premium" } },
  users: { T1: { profile: { displayName: "田中", updatedAt: "t" }, links: { S1: { name: "田中", at: "t" }, S2: { name: "田中 太郎", at: "t" } },
    workplaces: { S1: { kind: "shifty", shopId: "S1", color: "#f87036", pay: { note: "E5 が置く給料設定の代わり" } } } } },
});
const hashHead = h => `<script>history.replaceState(null,"","/${h}");</script>`;
const preLS = obj => `<script>${Object.entries(obj).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)},${JSON.stringify(v)});`).join("")}</script>`;
// ダウンロードを捕まえる（Blob の中身とファイル名）
const CAPTURE = `<script>window.__dl=[];(function(){var o=URL.createObjectURL;URL.createObjectURL=function(b){window.__lastBlob=b;return "blob:stub";};
URL.revokeObjectURL=function(){};var c=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download){window.__dl.push(this.download);return;}return c.apply(this,arguments);};})();</script>`;
async function openStaff({ db, viewport = PHONE, denyWrite, wait = "[data-my-shift],[data-my-empty]" }) {
  const head = hashHead("#/me") + preLS({ ots_staffAccount_v1: JSON.stringify({ uid: "T1" }) }) + THEME + CAPTURE +
    makeStub({ seed: db, view: "staff", tab: "periods", auth: "accounts", authSeed: { users: USERS, cur: T1 }, denyWrite }) +
    // スタブは window.confirm を true に差し替える。確認の文言を見るため、その上から記録する
    `<script>(function(){var c=window.confirm;window.__confirms=[];window.confirm=function(m){window.__confirms.push(String(m));return c(m);};})();</script>`;
  const h = await openHarness({ root: ROOT, jsx: "window.__harnessReady=true;", waitFor: wait, viewport, extraHead: head, scripts: SCRIPTS });
  return h;
}
const sleep = (h, ms) => h.page.waitForTimeout(ms);
const waitSel = (h, s, ms = 15000) => h.page.waitForSelector(s, { timeout: ms }).then(() => true, () => false);
const click = (h, sel) => h.evaluate(sel => { const e = document.querySelector(sel); if (!e) return false; e.click(); return true; }, sel);
// 時刻の2列ホイール（2026-10-05）で選ぶ: 欄を押す → 時の行・分の行を押す → 決定。戻り値は決定の直前にダイアログが持っていた値
const pickTime = async (h, sel, v) => {
  if (!await click(h, sel)) throw new Error("時刻の欄が無い " + sel);
  await waitSel(h, "[data-time-wheel-dialog]");
  const [hh, mm] = v.split(":").map(Number);
  await click(h, `[data-time-wheel-col="h"] [data-time-wheel-item="${hh}"]`); await sleep(h, 80);
  await click(h, `[data-time-wheel-col="m"] [data-time-wheel-item="${mm}"]`); await sleep(h, 80);
  const got = await h.evaluate(() => document.querySelector("[data-time-wheel-dialog]").getAttribute("data-time-wheel-dialog"));
  await click(h, "[data-time-wheel-done]"); await sleep(h, 120);
  return got;
};
const fill = (h, sel, v) => h.page.fill(sel, v);
const db = (h, p) => h.evaluate(p => window.__db(p), p);
const dumpOf = h => h.evaluate(() => window.__dbDump());
const overflowX = h => h.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
const fontsOk = h => h.evaluate(() => [...document.querySelectorAll("input,select,textarea")].every(i => parseFloat(getComputedStyle(i).fontSize) >= 16));
const settled = h => h.page.waitForFunction(() => { const d = document.querySelector("[data-my-shift]"); return d && !/読み込み中/.test(d.innerText); }, null, { timeout: 15000 }).catch(() => {});
async function dayView(h, date) {
  await settled(h);
  await click(h, `[data-my-cal-day="${date}"]`);
  await sleep(h, 250);
  return h.evaluate(date => {
    const cell = document.querySelector(`[data-my-cal-day="${date}"]`);
    return {
      kinds: cell ? cell.getAttribute("data-my-cal-kinds") : null,
      dots: cell ? [...cell.querySelectorAll("[data-my-dot]")].map(d => d.getAttribute("data-my-dot") + ":" + getComputedStyle(d).backgroundColor) : [],
      cellChanged: !!(cell && cell.querySelector("[data-my-cal-changed]")),
      rows: [...document.querySelectorAll("[data-my-day] [data-my-entry]")].map(r => ({ state: r.getAttribute("data-my-entry"), shop: r.getAttribute("data-my-entry-shop"),
        time: (r.querySelector("[data-my-entry-time]") || {}).innerText || "", actual: !!r.querySelector("[data-my-entry-actual]"), actualText: (r.querySelector("[data-my-entry-actual]") || {}).innerText || "",
        sched: (r.querySelector("[data-my-entry-sched]") || {}).innerText || "", memo: (r.querySelector("[data-my-entry-memo]") || {}).innerText || "",
        changed: !!r.querySelector("[data-my-entry-changed]"), actions: [...r.querySelectorAll("[data-my-action]")].map(b => b.getAttribute("data-my-action")) })),
      next: document.querySelector("[data-my-next]").getAttribute("data-my-next"), nextText: document.querySelector("[data-my-next]").innerText,
      changed: !!document.querySelector("[data-my-changed]"), addBtn: !!document.querySelector('[data-my-action="addManual"]'),
      gcal: [...document.querySelectorAll("[data-my-day] [data-my-gcal]")].map(a => ({ date: a.getAttribute("data-my-gcal"), href: a.getAttribute("href"), target: a.getAttribute("target"), rel: a.getAttribute("rel"), text: a.innerText })),
      icsBtn: !!document.querySelector('[data-my-action="ics"]'), msg: [...document.querySelectorAll("[data-my-day] [data-my-msg]")].map(x => x.getAttribute("data-my-msg") + ":" + x.innerText),
    };
  }, date);
}
const rowOf = (v, shop, state) => v.rows.find(r => r.shop.startsWith(shop) && (!state || r.state === state)) || {};
const manualIds = async h => Object.keys((await db(h, "users/T1/shifts")) || {});

(async () => {
  const R = {}, V = {};
  let dump = seed0();
  const shops0 = JSON.stringify(dump.shops);
  const errs = (k, h) => { R[k + "_errors"] = h.errors.slice(); return h.errors.length === 0; };
  let cafeId = null;

  // ---------------- A: 設定タブ → 勤務先 ----------------
  {
    const h = await openStaff({ db: dump });
    try {
      await click(h, '[data-my-tab="settings"]');
      await waitSel(h, '[data-my-section="workplaces"] [data-my-wp]');
      await sleep(h, 300);
      const list0 = await h.evaluate(() => [...document.querySelectorAll("[data-my-wp]")].map(e => e.getAttribute("data-my-wp") + ":" + e.getAttribute("data-my-wp-kind")));
      // 勤務先の名前の横に、その店舗でのその人の従業員番号（店舗ごとに違う・2026-10-04）。番号が無い店舗（S1 の田中）は出さない
      await h.page.waitForFunction(() => !!document.querySelector('[data-my-wp="S2"] [data-my-wp-number]'), null, { timeout: 8000 }).catch(() => {});
      const nums = await h.evaluate(() => [...document.querySelectorAll("[data-my-wp]")].map(e => { const n = e.querySelector("[data-my-wp-number]"); return e.getAttribute("data-my-wp") + ":" + (n ? n.innerText : ""); }));
      const numHint = await h.evaluate(() => /照合に使います/.test(document.querySelector('[data-my-section]') ? document.body.innerText : ""));
      await click(h, '[data-my-action="addWorkplace"]');
      await waitSel(h, '[data-my-wp-editor="new"]');
      await fill(h, '[data-my-wp-editor="new"] [data-my-input="wpName"]', "カフェ");
      await click(h, '[data-my-wp-editor="new"] [data-my-color="#4f7d4a"]');
      const layoutA = { overflow: await overflowX(h), fonts: await fontsOk(h) };
      await click(h, '[data-my-action="saveWorkplace"]');
      await sleep(h, 400);
      const wps = await db(h, "users/T1/workplaces");
      cafeId = Object.keys(wps).find(k => /^m_/.test(k));
      // A店の名前と色
      await h.evaluate(() => { const r = document.querySelector('[data-my-wp="S1"] [data-my-action="editWorkplace"]'); r && r.click(); });
      await waitSel(h, '[data-my-wp-editor="S1"]');
      await fill(h, '[data-my-wp-editor="S1"] [data-my-input="wpName"]', "本店");
      await click(h, '[data-my-wp-editor="S1"] [data-my-color="#2f6f9f"]');
      await click(h, '[data-my-wp-editor="S1"] [data-my-action="saveWorkplace"]');
      await sleep(h, 400);
      const s1 = await db(h, "users/T1/workplaces/S1");
      const list1 = await h.evaluate(() => [...document.querySelectorAll("[data-my-wp]")].map(e => e.getAttribute("data-my-wp") + ":" + e.querySelector("[data-my-wp-name]").innerText));
      R.A = { list0, wps, s1, list1, layoutA };
      V.A_listShifty = JSON.stringify(list0) === JSON.stringify(["S1:shifty", "S2:shifty"]);
      R.A_nums = { nums, numHint };
      V.A_staffNumberPerShop = JSON.stringify(nums) === JSON.stringify(["S1:", "S2:従業員番号 0123"]) && numHint;
      V.A_addManual = !!cafeId && wps[cafeId].kind === "manual" && wps[cafeId].name === "カフェ" && wps[cafeId].color === "#4f7d4a" && !("shopId" in wps[cafeId]);
      V.A_editShifty = s1.kind === "shifty" && s1.shopId === "S1" && s1.color === "#2f6f9f" && s1.name === "本店" && !!s1.pay && list1.includes("S1:本店") && list1.includes(`${cafeId}:カフェ`);
      V.A_layout375 = layoutA.overflow <= 0 && layoutA.fonts;
      V.A_noErrors = errs("A", h);
      dump = await dumpOf(h);
    } finally { await h.browser.close(); }
  }
  // ---------------- B: 手入力のシフト ----------------
  {
    const h = await openStaff({ db: dump });
    try {
      let v = await dayView(h, TODAY);
      R.B = { before: v };
      await click(h, '[data-my-action="addManual"]');
      await waitSel(h, '[data-my-manual-form="add"]');
      // 時刻は時と分の2列ホイールで1分刻み（2026-10-05 ユーザー指示）、休憩は15分刻みのプルダウン。自由記入の欄は無い
      R.B.form = await h.evaluate(() => { const f = document.querySelector('[data-my-manual-form="add"]');
        return { inputs: ["start", "end", "breakMin"].map(k => !!f.querySelector(`input[data-my-input="${k}"]`)),
          wheels: ["start", "end"].map(k => !!f.querySelector(`button[data-time-wheel="${k}"]`)), breakSelect: !!f.querySelector('select[data-my-select="breakMin"]'),
          breakOpts: [...f.querySelector('[data-my-select="breakMin"]').options].map(o => o.value),
          startVal: f.querySelector('[data-time-wheel="start"]').getAttribute("data-time-wheel-value"), startText: f.querySelector('[data-time-wheel="start"]').innerText,
          breakVal: f.querySelector('[data-my-select="breakMin"]').value,
          fonts: [...f.querySelectorAll("select,[data-time-wheel]")].map(x => parseFloat(getComputedStyle(x).fontSize)) }; });
      // ホイールの中身: 空の開始を開くと 9:00 から。時は 0〜30・分は 00〜59（1分刻み）・30時は 00 分だけ。指で回して端まで行くと先頭・末尾で止まる
      await click(h, '[data-time-wheel="start"]'); await waitSel(h, "[data-time-wheel-dialog]");
      const wheel = async () => h.evaluate(() => { const d = document.querySelector("[data-time-wheel-dialog]");
        const items = c => [...d.querySelectorAll(`[data-time-wheel-col="${c}"] [data-time-wheel-item]`)].map(x => x.getAttribute("data-time-wheel-item"));
        return { val: d.getAttribute("data-time-wheel-dialog"), hours: items("h"), mins: items("m") }; });
      const scrollCol = (c, top) => h.evaluate(([c, top]) => { const el = document.querySelector(`[data-time-wheel-col="${c}"]`); el.scrollTop = top; el.dispatchEvent(new Event("scroll")); }, [c, top]);
      const W = { open: await wheel() };
      await scrollCol("m", 99999); await sleep(h, 450); W.minEnd = await wheel();
      await scrollCol("m", -500); await sleep(h, 450); W.minStart = await wheel();
      await scrollCol("m", 44 * 37); await sleep(h, 450); W.min37 = await wheel();
      await scrollCol("h", 99999); await sleep(h, 450); W.hourEnd = await wheel();
      await scrollCol("h", 0); await sleep(h, 450); W.hourStart = await wheel();
      W.layout = await h.evaluate(() => { const d = document.querySelector("[data-time-wheel-dialog]").getBoundingClientRect(); return { left: d.left, right: d.right, vw: window.innerWidth }; });
      await h.page.keyboard.press("Escape"); await sleep(h, 150);
      W.cancelled = await h.evaluate(() => !document.querySelector("[data-time-wheel-dialog]") && document.querySelector('[data-time-wheel="start"]').getAttribute("data-time-wheel-value") === "");
      R.B.wheel = W;
      V.B_wheel1min = R.B.form.inputs.every(x => !x) && R.B.form.wheels.every(Boolean) && R.B.form.breakSelect &&
        JSON.stringify(R.B.form.breakOpts) === JSON.stringify(["0", "15", "30", "45", "60", "75", "90", "105", "120", "135", "150", "165", "180"]) &&
        R.B.form.startVal === "" && /選ぶ/.test(R.B.form.startText) && R.B.form.breakVal === "0" && R.B.form.fonts.every(x => x >= 16) &&
        W.open.val === "09:00" && W.open.hours.length === 31 && W.open.hours[0] === "0" && W.open.hours[30] === "30" && W.open.mins.length === 60 && W.open.mins[59] === "59" &&
        W.minEnd.val === "09:59" && W.minStart.val === "09:00" && W.min37.val === "09:37" && W.hourEnd.val === "30:00" && JSON.stringify(W.hourEnd.mins) === '["0"]' &&
        W.hourStart.val === "00:00" && W.layout.left >= 0 && W.layout.right <= W.layout.vw && W.cancelled;
      await pickTime(h, '[data-time-wheel="start"]', "09:00");
      await pickTime(h, '[data-time-wheel="end"]', "13:00");
      await fill(h, '[data-my-input="memo"]', "朝のシフト");
      const layoutB = { overflow: await overflowX(h), fonts: await fontsOk(h) };
      await click(h, '[data-my-action="saveManual"]');
      await sleep(h, 400);
      v = await dayView(h, TODAY);
      R.B.added = v; R.B.layoutB = layoutB;
      const ids1 = await manualIds(h);
      const rec1 = ids1.length ? await db(h, `users/T1/shifts/${ids1[0]}`) : null;
      R.B.rec1 = rec1;
      V.B_addManual = ids1.length === 1 && rec1.workplaceId === cafeId && rec1.date === TODAY && rec1.start === "09:00" && rec1.end === "13:00" && rec1.breakMin === 0 && rec1.memo === "朝のシフト";
      V.B_calendarThree = v.dots.length === 3 && v.dots.some(d => d === "manual:rgb(79, 125, 74)") && v.dots.some(d => d === "published:rgb(47, 111, 159)")
        && rowOf(v, cafeId).state === "manual" && rowOf(v, cafeId).time === "9:00〜13:00" && /朝のシフト/.test(rowOf(v, cafeId).memo)
        && /本店/.test(await h.evaluate(() => document.querySelector("[data-my-day]").innerText));
      V.B_nextIncludesManual = v.next === TODAY && /9:00〜13:00/.test(v.nextText) && /カフェ/.test(v.nextText);
      V.B_layout375 = layoutB.overflow <= 0 && layoutB.fonts;
      // 24時超え（D2）
      await dayView(h, D2);
      await click(h, '[data-my-action="addManual"]');
      await waitSel(h, '[data-my-manual-form="add"]');
      await pickTime(h, '[data-time-wheel="start"]', "18:00");
      await pickTime(h, '[data-time-wheel="end"]', "02:00");
      await h.page.selectOption('[data-my-select="breakMin"]', "30");
      await click(h, '[data-my-action="saveManual"]');
      await sleep(h, 200);
      const overnight = await h.evaluate(() => ({ msg: (document.querySelector('[data-my-manual-form] [data-my-msg="error"]') || {}).innerText || "", btn: (document.querySelector('[data-my-action="useSuggestEnd"]') || {}).innerText || "" }));
      await click(h, '[data-my-action="useSuggestEnd"]');
      await sleep(h, 100);
      const endVal = await h.evaluate(() => document.querySelector('[data-time-wheel="end"]').getAttribute("data-time-wheel-value"));
      await click(h, '[data-my-action="saveManual"]');
      await sleep(h, 400);
      const ids2 = await manualIds(h);
      const recN = await db(h, `users/T1/shifts/${ids2.find(i => i !== ids1[0])}`);
      R.B.overnight = { ...overnight, endVal, recN };
      V.B_overnightGuide = /26:00/.test(overnight.msg) && /26:00/.test(overnight.btn) && endVal === "26:00" && recN && recN.start === "18:00" && recN.end === "26:00" && recN.breakMin === 30;
      // 今日のシフトを直す
      await dayView(h, TODAY);
      await h.evaluate(id => { const r = [...document.querySelectorAll("[data-my-day] [data-my-entry]")].find(x => x.getAttribute("data-my-entry-shop") === id); r.querySelector('[data-my-action="editManual"]').click(); }, cafeId);
      await waitSel(h, '[data-my-manual-form="edit"]');
      await pickTime(h, '[data-time-wheel="end"]', "14:00");
      await click(h, '[data-my-action="saveManual"]');
      await sleep(h, 400);
      const rec1b = await db(h, `users/T1/shifts/${ids1[0]}`);
      v = await dayView(h, TODAY);
      R.B.edited = { rec1b, row: rowOf(v, cafeId) };
      V.B_editManual = rec1b.end === "14:00" && rec1b.start === "09:00" && rowOf(v, cafeId).time === "9:00〜14:00" && (await manualIds(h)).length === 2;
      // 履歴から追加（D3）→ 削除
      await dayView(h, D3);
      await click(h, '[data-my-action="addManual"]');
      await waitSel(h, '[data-my-history]');
      const chips = await h.evaluate(() => [...document.querySelectorAll("[data-my-history-pick]")].map(b => b.innerText));
      await click(h, '[data-my-history-pick="09:00-14:00-0"]');
      await sleep(h, 400);
      v = await dayView(h, D3);
      const ids3 = await manualIds(h);
      const hist = ids3.length === 3 ? await db(h, `users/T1/shifts/${ids3.find(i => !ids2.includes(i))}`) : null;
      R.B.history = { chips, hist, rows: v.rows };
      V.B_historyAdd = JSON.stringify(chips) === JSON.stringify(["9:00〜14:00", "18:00〜26:00（休憩30分）"]) && hist && hist.date === D3 && hist.start === "09:00" && hist.end === "14:00"
        && rowOf(v, cafeId).time === "9:00〜14:00";
      await h.evaluate(id => { const r = [...document.querySelectorAll("[data-my-day] [data-my-entry]")].find(x => x.getAttribute("data-my-entry-shop") === id); r.querySelector('[data-my-action="deleteManual"]').click(); }, cafeId);
      await sleep(h, 400);
      v = await dayView(h, D3);
      R.B.deleted = { dialogs: await h.evaluate(() => window.__confirms.slice()), ids: await manualIds(h), rows: v.rows };
      V.B_deleteManual = R.B.deleted.dialogs.some(m => /削除しますか/.test(m)) && R.B.deleted.ids.length === 2 && !v.rows.some(r => r.state === "manual");
      V.B_noErrors = errs("B", h);
      dump = await dumpOf(h);
    } finally { await h.browser.close(); }
  }
  // ---------------- C: 実績の上書き ----------------
  {
    let h = await openStaff({ db: dump });
    try {
      let v = await dayView(h, TODAY);
      const pubRow = rowOf(v, "S1", "published");
      await h.evaluate(() => { const r = [...document.querySelectorAll("[data-my-day] [data-my-entry]")].find(x => x.getAttribute("data-my-entry-shop") === "S1"); r.querySelector('[data-my-action="editOverride"]').click(); });
      await waitSel(h, "[data-my-override-form]");
      const pre = await h.evaluate(() => ["start", "end", "breakMin"].map(k => { const e = document.querySelector(`[data-my-override-form] [data-time-wheel="${k}"]`); return e ? e.getAttribute("data-time-wheel-value") : document.querySelector(`[data-my-override-form] [data-my-select="${k}"]`).value; }));
      const layoutC = { overflow: await overflowX(h), fonts: await fontsOk(h) };
      await pickTime(h, '[data-my-override-form] [data-time-wheel="end"]', "17:30");
      await h.page.selectOption('[data-my-override-form] [data-my-select="breakMin"]', "15");
      await click(h, '[data-my-action="saveOverride"]');
      await sleep(h, 400);
      v = await dayView(h, TODAY);
      const ov = await db(h, `users/T1/overrides/S1/${TODAY}`);
      R.C = { pubRow, pre, ov, after: v, layoutC };
      V.C_layout375 = layoutC.overflow <= 0 && layoutC.fonts;
      const r = rowOf(v, "S1", "published");
      V.C_overrideSaved = JSON.stringify(pre) === JSON.stringify(["10:00", "16:00", "0"]) && ov && ov.start === "10:00" && ov.end === "17:30" && ov.breakMin === 15;
      V.C_overrideShown = r.actual && r.time === "10:00〜16:00" && r.actualText === "給料計算の実績 10:00〜17:30（休憩15分）" && !r.sched && !r.changed && !v.changed && !v.cellChanged;
      V.C_noErrors1 = errs("C1", h);
      dump = await dumpOf(h);
    } finally { await h.browser.close(); }
    // 給料の内訳に、実績で計算した日が出る（上書きは給料計算にだけ効く）
    h = await openStaff({ db: dump });
    try {
      await click(h, '[data-my-tab="pay"]');
      await waitSel(h, '[data-my-pay-row="S1"] [data-my-action="payDetail"]');
      await click(h, '[data-my-pay-row="S1"] [data-my-action="payDetail"]');
      await sleep(h, 300);
      R.C.payNotes = await h.evaluate(() => { const n = document.querySelector('[data-my-pay-notes="S1"]'); return n ? n.innerText : ""; });
      const md = `${Number(TODAY.slice(5, 7))}/${Number(TODAY.slice(8))}`;
      V.C_payNote = R.C.payNotes.includes(`あなたが入れた実績の時間で計算した日 1日（${md}）。シフトの表示は公開された時間のままです`);
      V.C_noErrorsPay = errs("Cpay", h);
    } finally { await h.browser.close(); }
    h = await openStaff({ db: dump });
    try {
      let v = await dayView(h, TODAY);
      R.C.reopen = v;
      V.C_reopenNoChanged = rowOf(v, "S1", "published").actual && !v.changed && !v.cellChanged;
      // D（.ics）はこの状態で書き出す（上書きがあっても公開の時刻＝上書きは給料計算だけ）
      await click(h, '[data-my-action="ics"]');
      await sleep(h, 300);
      // PC・Android では書き出す前に確認が出る（2026-10-04・example-my-cal-prompt.js が詳しく見る）。iOS の Safari では出ない
      const calPrompt = await h.evaluate(() => { const d = document.querySelector("[data-my-cal-prompt]"); return d ? { kind: d.getAttribute("data-my-cal-prompt"), text: d.innerText } : null; });
      if (calPrompt) { await click(h, '[data-my-action="calProceed"]'); await sleep(h, 300); }
      const ics = await h.evaluate(async () => ({ names: window.__dl.slice(), text: window.__lastBlob ? await window.__lastBlob.text() : "", type: window.__lastBlob ? window.__lastBlob.type : "" }));
      R.D = { names: ics.names, type: ics.type, text: ics.text };
      // 書き出した後の案内は端末ごと（このハーネスはデスクトップの Chromium＝Google カレンダーの「インポート」を案内する）
      R.D.msg = await h.evaluate(() => { const b = document.querySelector('[data-my-action="ics"]'); const m = b && b.parentElement.querySelector("[data-my-msg]"); return m ? m.getAttribute("data-my-msg") + ":" + m.innerText : ""; });
      // WebKit の iPhone（SHIFTY_DEVICE）で回すと iOS の案内になる（「すべてを追加」）。それ以外はデスクトップの案内
      const IOS = !!process.env.SHIFTY_DEVICE && /iPhone|iPad/.test(process.env.SHIFTY_DEVICE);
      // PC では確認の手順に「インポート / エクスポート」があり、書き出した後の案内は重ねない
      R.D.calPrompt = calPrompt;
      V.D_icsHint = IOS ? (!calPrompt && /^ok:3件のシフトを書き出しました。/.test(R.D.msg) && R.D.msg.includes("すべてを追加"))
        : (!!calPrompt && calPrompt.kind === "downloadThenOpen" && calPrompt.text.includes("設定 → インポート / エクスポート") && R.D.msg === "ok:3件のシフトを書き出しました。");
      // TimeTree などの案内（折りたたみ・2026-10-04）。閉じた状態で置き、開くとこの端末（デスクトップ）の3手順と、
      // ホームカレンダーは自動で反映・共有カレンダーへのインポートは重複しうる、の注記
      R.D.apps = await h.evaluate(() => { const d = document.querySelector("[data-my-ics-apps]"); if (!d) return null;
        const closed = !d.open; d.open = true;
        return { closed, plat: d.getAttribute("data-my-ics-apps"), steps: d.querySelectorAll("[data-my-ics-steps] li").length, text: d.innerText,
          right: Math.round(d.getBoundingClientRect().right), vw: window.innerWidth,
          // 一番下（2026-10-04 ユーザー指示）: 日付の詳細・書き出しのボタンより下で、マイシフトの中で最後の要素
          below: (() => { const t = d.getBoundingClientRect().top; const day = document.querySelector("[data-my-day]"), ics = document.querySelector('[data-my-action="ics"]');
            const root = document.querySelector("[data-my-shift]"); const last = root && root.lastElementChild;
            return !!day && !!ics && t >= day.getBoundingClientRect().bottom && t >= ics.getBoundingClientRect().bottom && !!last && last.contains(d); })() }; });
      V.D_icsAppGuide = !!R.D.apps && R.D.apps.closed && R.D.apps.plat === (IOS ? "ios" : "desktop") && R.D.apps.steps === 3 && /TimeTree/.test(R.D.apps.text) &&
        /直接は取り込めません/.test(R.D.apps.text) && /重複/.test(R.D.apps.text) && R.D.apps.right <= R.D.apps.vw && R.D.apps.below;
      // 日付の詳細に「Google カレンダーに追加」のリンクは出さない（2026-10-05 ユーザー指示で外した。取り込みは .ics の1つ）
      R.D.gcal = v.gcal;
      V.D_noGcalLinks = v.gcal.length === 0 && v.icsBtn;
      const u = ics.text.replace(/\r\n /g, "");
      const events = (u.match(/BEGIN:VEVENT/g) || []).length;
      V.D_icsFile = JSON.stringify(ics.names) === JSON.stringify([`shifty-${YM}.ics`]) && /^text\/calendar/.test(ics.type);
      V.D_icsContent = events === 3 && ics.text.endsWith("\r\n") && !/[^\r]\n/.test(ics.text) && /BEGIN:VTIMEZONE\r\nTZID:Asia\/Tokyo/.test(u)
        && u.includes(`DTSTART;TZID=Asia/Tokyo:${TODAY.replace(/-/g, "")}T100000\r\nDTEND;TZID=Asia/Tokyo:${TODAY.replace(/-/g, "")}T160000`)
        && u.includes(`DTEND;TZID=Asia/Tokyo:${nextDay(D2)}T020000`) && u.includes("SUMMARY:本店") && u.includes("SUMMARY:カフェ") && !u.includes("B店")
        && !u.includes("実績") && !u.includes("T173000") && ics.text.split("\r\n").every(l => Buffer.byteLength(l, "utf8") <= 75)
        && /\r\nSEQUENCE:\d+\r\n/.test(u) && u.includes("X-LIC-LOCATION:Asia/Tokyo") && ics.text.charCodeAt(0) !== 0xFEFF;
      // 実績を消す
      await h.evaluate(() => { const r = [...document.querySelectorAll("[data-my-day] [data-my-entry]")].find(x => x.getAttribute("data-my-entry-shop") === "S1"); r.querySelector('[data-my-action="resetOverride"]').click(); });
      await sleep(h, 400);
      v = await dayView(h, TODAY);
      R.C.reset = { ov: await db(h, `users/T1/overrides/S1/${TODAY}`), row: rowOf(v, "S1", "published") };
      V.C_resetOverride = R.C.reset.ov == null && !R.C.reset.row.actual && R.C.reset.row.time === "10:00〜16:00";
      V.C_noErrors2 = errs("C2", h);
      dump = await dumpOf(h);
    } finally { await h.browser.close(); }
  }
  // ---------------- E: 店舗のデータは変わらない ----------------
  V.E_noShopWrites = JSON.stringify(dump.shops) === shops0;
  // ---------------- F: Premium でない ----------------
  {
    const d = JSON.parse(JSON.stringify(dump));
    d.accounts.S1.plan = "free"; d.accounts.S2.plan = "pro";
    d.users.T1.overrides = { S1: { [TODAY]: { start: "10:00", end: "17:00", breakMin: 0 } } };
    const h = await openStaff({ db: d });
    try {
      const v = await dayView(h, TODAY);
      const man = rowOf(v, cafeId);
      R.F = { v };
      V.F_viewOnly = man.state === "manual" && man.time === "9:00〜14:00" && !v.addBtn && !v.icsBtn && v.gcal.length === 0 && !man.actions.includes("editManual") && man.actions.includes("deleteManual")
        && !v.rows.some(r => r.actions.includes("editOverride")) && v.rows.filter(r => r.shop === "S1").every(r => r.state === "submitted");
      await click(h, '[data-my-tab="settings"]');
      await waitSel(h, '[data-my-section="workplaces"] [data-my-wp]');
      await sleep(h, 400);
      R.F.settings = await h.evaluate(() => ({ add: !!document.querySelector('[data-my-action="addWorkplace"]'), edit: document.querySelectorAll('[data-my-action="editWorkplace"]').length,
        del: document.querySelectorAll('[data-my-action="deleteWorkplace"]').length, note: !!document.querySelector("[data-my-wp-premium-note]") }));
      V.F_settingsViewOnly = !R.F.settings.add && R.F.settings.edit === 0 && R.F.settings.del === 1 && R.F.settings.note;
      V.F_noErrors = errs("F", h);
    } finally { await h.browser.close(); }
  }
  // ---------------- G: ルール未反映（users への書き込みを拒否）----------------
  {
    const h = await openStaff({ db: dump, denyWrite: ["users/T1"] });
    try {
      await dayView(h, D3);
      await click(h, '[data-my-action="addManual"]');
      await waitSel(h, '[data-my-manual-form="add"]');
      await pickTime(h, '[data-time-wheel="start"]', "10:00");
      await pickTime(h, '[data-time-wheel="end"]', "12:00");
      await click(h, '[data-my-action="saveManual"]');
      await sleep(h, 400);
      R.G = await h.evaluate(() => ({ msg: (document.querySelector('[data-my-manual-form] [data-my-msg="error"]') || {}).innerText || "", form: !!document.querySelector("[data-my-manual-form]") }));
      R.G.ids = await manualIds(h);
      V.G_deniedShowsReason = /サーバー側の設定が未反映/.test(R.G.msg) && R.G.form && R.G.ids.length === 2;
      V.G_noErrors = errs("G", h);
    } finally { await h.browser.close(); }
  }
  // ---------------- I: 15分刻みでない以前の値（5分刻みの入力・休憩10分）は選択肢に足して保持する（黙って丸めない）----------------
  {
    const d = JSON.parse(JSON.stringify(dump));
    d.users.T1.shifts.h_old0000000 = { workplaceId: cafeId, date: D3, start: "09:05", end: "17:10", breakMin: 10 };
    const h = await openStaff({ db: d });
    try {
      await dayView(h, D3);
      await h.evaluate(() => { const r = [...document.querySelectorAll("[data-my-day] [data-my-entry]")].find(x => /9:05/.test(x.innerText)); r.querySelector('[data-my-action="editManual"]').click(); });
      await waitSel(h, '[data-my-manual-form="edit"]');
      // 2026-10-05 から時刻は1分刻みのホイールなので 9:05・17:10 はそのまま選べる値。休憩10分は15分刻みのプルダウンに足して保つ
      R.I = await h.evaluate(() => { const f = document.querySelector('[data-my-manual-form="edit"]'); const w = k => f.querySelector(`[data-time-wheel="${k}"]`); const b = f.querySelector('[data-my-select="breakMin"]');
        return { vals: [w("start").getAttribute("data-time-wheel-value"), w("end").getAttribute("data-time-wheel-value"), b.value],
          labels: [w("start").innerText, w("end").innerText, b.selectedOptions[0].textContent], breakCount: b.options.length }; });
      await click(h, '[data-time-wheel="end"]'); await waitSel(h, "[data-time-wheel-dialog]");
      R.I.endOpen = await h.evaluate(() => document.querySelector("[data-time-wheel-dialog]").getAttribute("data-time-wheel-dialog"));
      await click(h, "[data-time-wheel-done]"); await sleep(h, 120);
      await click(h, '[data-my-action="saveManual"]');
      await sleep(h, 400);
      R.I.rec = await db(h, "users/T1/shifts/h_old0000000");
      V.I_keepsOffStepValues = JSON.stringify(R.I.vals) === JSON.stringify(["09:05", "17:10", "10"]) && JSON.stringify(R.I.labels) === JSON.stringify(["9:05", "17:10", "10分"]) &&
        R.I.breakCount === 14 && R.I.endOpen === "17:10" && R.I.rec && R.I.rec.start === "09:05" && R.I.rec.end === "17:10" && R.I.rec.breakMin === 10;
      V.I_noErrors = errs("I", h);
    } finally { await h.browser.close(); }
  }
  // ---------------- H: 勤務先の削除 ----------------
  {
    const h = await openStaff({ db: dump });
    try {
      await click(h, '[data-my-tab="settings"]');
      await waitSel(h, `[data-my-wp="${cafeId}"]`);
      await sleep(h, 300);
      await h.evaluate(id => document.querySelector(`[data-my-wp="${id}"] [data-my-action="deleteWorkplace"]`).click(), cafeId);
      await sleep(h, 400);
      R.H = { dialogs: await h.evaluate(() => window.__confirms.slice()), wp: await db(h, `users/T1/workplaces/${cafeId}`), ids: await manualIds(h), s1: await db(h, "users/T1/workplaces/S1"),
        listed: await h.evaluate(id => !!document.querySelector(`[data-my-wp="${id}"]`), cafeId) };
      V.H_deleteWithShifts = R.H.dialogs.some(m => /シフト2件も一緒に削除/.test(m)) && R.H.wp == null && R.H.ids.length === 0 && !R.H.listed && !!R.H.s1;
      V.H_noErrors = errs("H", h);
    } finally { await h.browser.close(); }
  }
  const allPass = Object.values(V).every(Boolean);
  console.log(JSON.stringify({ verdict: { allPass, ...V }, detail: R }, null, 1));
  process.exit(allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
