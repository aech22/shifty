// 従業員画面 E4（手入力の勤務先とシフト・履歴から追加・実績の上書き・.ics）の回帰テスト（2026-10-04・Shifty_実装計画_2026-10.md 第2部 E.2・E.4・E.6）。
// アプリ全体をスタブ Firebase で動かす（Firebase へは1バイトも出ない）。**セキュリティルールは評価しない**（ルールの形は tests/my.test.js）。
//
//  A（スタッフ・375px・設定タブ）: 勤務先の一覧に Shifty の2店舗。手入力の勤務先「カフェ」を追加（色を選ぶ）→ users/T1/workplaces/m_* 。
//     A店の名前と色を変える → workplaces/S1 は kind shifty・shopId S1（フィールド単位の update＝既存の pay は残る）
//  B（マイシフト）: 今日に手入力のシフトを追加 → カレンダーに3つのドット（掛け持ち）・詳細に「手入力」。A店のドットは選んだ色。次のシフトが手入力の 9:00
//     別の日に 18:00〜2:00 → 24時超えの案内と「26:00 にする」→ 保存は 26:00。今日のシフトを直す。3つ目の日に履歴から追加（ワンタップ）→ 削除（確認つき）
//  C（実績の上書き）: 公開済みの A店の今日を 10:00〜17:30・休憩15分に → 「実績」・公開の時間も表示・変更ありは付かない。開き直しても同じ。公開の時間に戻すと消える
//  D（.ics）: この月の公開済み＋手入力（グレーは入らない）。CRLF・TZID・26:00 は翌日の 2:00・上書きの時刻
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
      settings: { shopId: "S1", candidates: [{ start: "10:00", end: "15:00" }] },
      periods: { p1: per("p1", "S1", "t1", { published: { at: "2026-09-02T00:00:00.000Z", byUid: "OWN" } }) },
      subs: { s1: { id: "s1", periodId: "p1", shopId: "S1", staffName: "田中", submittedAt: "2026-09-02T00:00:00Z", shifts: { [TODAY]: { status: "work", start: "10:00", end: "15:00", adjustedEnd: "16:00" } } } },
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
        time: (r.querySelector("[data-my-entry-time]") || {}).innerText || "", actual: !!r.querySelector("[data-my-entry-actual]"),
        sched: (r.querySelector("[data-my-entry-sched]") || {}).innerText || "", memo: (r.querySelector("[data-my-entry-memo]") || {}).innerText || "",
        changed: !!r.querySelector("[data-my-entry-changed]"), actions: [...r.querySelectorAll("[data-my-action]")].map(b => b.getAttribute("data-my-action")) })),
      next: document.querySelector("[data-my-next]").getAttribute("data-my-next"), nextText: document.querySelector("[data-my-next]").innerText,
      changed: !!document.querySelector("[data-my-changed]"), addBtn: !!document.querySelector('[data-my-action="addManual"]'),
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
      await fill(h, '[data-my-input="start"]', "9");
      await h.page.selectOption('[data-my-select="end"]', "13:00");
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
      await fill(h, '[data-my-input="start"]', "18:00");
      await fill(h, '[data-my-input="end"]', "2:00");
      await fill(h, '[data-my-input="breakMin"]', "30");
      await click(h, '[data-my-action="saveManual"]');
      await sleep(h, 200);
      const overnight = await h.evaluate(() => ({ msg: (document.querySelector('[data-my-manual-form] [data-my-msg="error"]') || {}).innerText || "", btn: (document.querySelector('[data-my-action="useSuggestEnd"]') || {}).innerText || "" }));
      await click(h, '[data-my-action="useSuggestEnd"]');
      await sleep(h, 100);
      const endVal = await h.evaluate(() => document.querySelector('[data-my-input="end"]').value);
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
      await fill(h, '[data-my-input="end"]', "14:00");
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
      const pre = await h.evaluate(() => ["start", "end", "breakMin"].map(k => document.querySelector(`[data-my-override-form] [data-my-input="${k}"]`).value));
      const layoutC = { overflow: await overflowX(h), fonts: await fontsOk(h) };
      await fill(h, '[data-my-override-form] [data-my-input="end"]', "1730");
      await h.page.selectOption('[data-my-override-form] [data-my-select="breakMin"]', "15");
      await click(h, '[data-my-action="saveOverride"]');
      await sleep(h, 400);
      v = await dayView(h, TODAY);
      const ov = await db(h, `users/T1/overrides/S1/${TODAY}`);
      R.C = { pubRow, pre, ov, after: v, layoutC };
      V.C_layout375 = layoutC.overflow <= 0 && layoutC.fonts;
      const r = rowOf(v, "S1", "published");
      V.C_overrideSaved = JSON.stringify(pre) === JSON.stringify(["10:00", "16:00", "0"]) && ov && ov.start === "10:00" && ov.end === "17:30" && ov.breakMin === 15;
      V.C_overrideShown = r.actual && r.time === "10:00〜17:30" && /公開 10:00〜16:00/.test(r.sched) && !r.changed && !v.changed && !v.cellChanged;
      V.C_noErrors1 = errs("C1", h);
      dump = await dumpOf(h);
    } finally { await h.browser.close(); }
    h = await openStaff({ db: dump });
    try {
      let v = await dayView(h, TODAY);
      R.C.reopen = v;
      V.C_reopenNoChanged = rowOf(v, "S1", "published").actual && !v.changed && !v.cellChanged;
      // D（.ics）はこの状態で書き出す（上書きの時刻が入る）
      await click(h, '[data-my-action="ics"]');
      await sleep(h, 300);
      const ics = await h.evaluate(async () => ({ names: window.__dl.slice(), text: window.__lastBlob ? await window.__lastBlob.text() : "", type: window.__lastBlob ? window.__lastBlob.type : "" }));
      R.D = { names: ics.names, type: ics.type, text: ics.text };
      const u = ics.text.replace(/\r\n /g, "");
      const events = (u.match(/BEGIN:VEVENT/g) || []).length;
      V.D_icsFile = JSON.stringify(ics.names) === JSON.stringify([`shifty-${YM}.ics`]) && /^text\/calendar/.test(ics.type);
      V.D_icsContent = events === 3 && ics.text.endsWith("\r\n") && !/[^\r]\n/.test(ics.text) && /BEGIN:VTIMEZONE\r\nTZID:Asia\/Tokyo/.test(u)
        && u.includes(`DTSTART;TZID=Asia/Tokyo:${TODAY.replace(/-/g, "")}T100000\r\nDTEND;TZID=Asia/Tokyo:${TODAY.replace(/-/g, "")}T173000`)
        && u.includes(`DTEND;TZID=Asia/Tokyo:${nextDay(D2)}T020000`) && u.includes("SUMMARY:本店") && u.includes("SUMMARY:カフェ") && !u.includes("B店")
        && u.includes("実績（本人の入力）") && ics.text.split("\r\n").every(l => Buffer.byteLength(l, "utf8") <= 75);
      // 公開の時間に戻す
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
      V.F_viewOnly = man.state === "manual" && man.time === "9:00〜14:00" && !v.addBtn && !v.icsBtn && !man.actions.includes("editManual") && man.actions.includes("deleteManual")
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
      await fill(h, '[data-my-input="start"]', "10");
      await fill(h, '[data-my-input="end"]', "12");
      await click(h, '[data-my-action="saveManual"]');
      await sleep(h, 400);
      R.G = await h.evaluate(() => ({ msg: (document.querySelector('[data-my-manual-form] [data-my-msg="error"]') || {}).innerText || "", form: !!document.querySelector("[data-my-manual-form]") }));
      R.G.ids = await manualIds(h);
      V.G_deniedShowsReason = /サーバー側の設定が未反映/.test(R.G.msg) && R.G.form && R.G.ids.length === 2;
      V.G_noErrors = errs("G", h);
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
