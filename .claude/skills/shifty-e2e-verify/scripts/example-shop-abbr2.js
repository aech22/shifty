// H1（2026-10-04）企業連携タブの店舗略称カード: 2セル表示用（上・下）の登録・変更・削除・予約語の拒否を実ブラウザで確かめる。
// CompanyTab だけをマウントし、他店舗の読み書きはスタブ Firebase（stub-firebase.js）で受ける。実ネットワーク・dev へは1バイトも出ない。
//
// 測るもの:
//  (a) 他店舗 B: 登録 → shops/B/settings/shopAbbr2 に {top,bottom}、書き込みは settings への update（set でない）、shopAbbrs は変わらない
//  (b) 変更・削除（null を update）・予約語（h・数字始まり）・3文字・片方だけ が拒否されて DB が変わらない
//  (c) 表示中の店舗 A: onSave（saveSettings）に shopAbbr2 が載る。shopAbbrs は残る
//  (d) 開き直す（再マウント）と登録済みの値が読み込まれて表示される
//  (e) 375px でカードの入力欄がはみ出さない（店舗カードの中にはみ出す要素が無い・入力欄がカードの内側）
//      ※ページ全体の scrollWidth は、既存の「企業アカウントを作成」フォームの入力欄で 376px になる（H1 の前から。r2.wide に記録）
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-shop-abbr2.js → allPass=true / EXIT=0
// 反証: SHIFTY_ROOT=<H1 より前の配信物> node ... → EXIT=1
"use strict";
const path = require("node:path");
const { openHarness } = require(path.join(__dirname, "mount-component.js"));
const { makeStub } = require(path.join(__dirname, "stub-firebase.js"));
const ROOT = process.env.SHIFTY_ROOT || undefined;
const THEME = `<style>:root{--c-bg:#F0F2F5;--c-card:#FFFFFF;--c-input:#F3F4F6;--c-input2:#F0F2F5;` +
  `--c-border:#E5E7EB;--c-border2:#D1D5DB;--c-text:#1A1A2E;--c-text2:#374151;--c-text3:#6B7280;` +
  `--c-text4:#9CA3AF;--c-shadow:rgba(0,0,0,.06);--c-accent:#f87036;--c-danger:#DC2626;}</style>`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SEED = { shops: {
  A: { settings: { shopId: "A", shopAbbrs: ["東"] } },
  B: { settings: { shopId: "B", shopAbbrs: ["鶏三"] } },
} };

async function mount(viewport, seedOverride) {
  const h = await openHarness({
    root: ROOT, viewport, waitFor: "[data-testid=ready]",
    extraHead: THEME + makeStub({ seed: seedOverride || SEED, uid: "u1" }),
    jsx: `
firebaseDB = firebase.database();
window.__toasts=window.__toasts||[];window.__writes=window.__writes||[];window.__saved=window.__saved||[];
{ const orig=firebaseDB.ref.bind(firebaseDB);
  firebaseDB.ref=p=>{const r=orig(p);["set","update","remove"].forEach(m=>{const f=r[m].bind(r);r[m]=(...a)=>{window.__writes.push({m,p,v:JSON.parse(JSON.stringify(a[0]===undefined?null:a[0]))});return f(...a);};});return r;}; }
const SHOPS=[{id:"A",name:"東通り"},{id:"B",name:"三ビル"}];
function Harness(){
  const [settings,setSettings]=React.useState(${JSON.stringify((seedOverride || SEED).shops.A.settings)});
  return <div data-testid="ready"><CompanyTab settings={settings} onSave={v=>{window.__saved.push(JSON.parse(JSON.stringify(v)));setSettings(v);}}
    tt={m=>window.__toasts.push(m)} shopId="A" authUser={{uid:"u1",isAnonymous:false,email:"t@example.com",providerData:[{providerId:"password"}]}} plan="premium" shops={SHOPS} allLinkedShops={SHOPS}/></div>;
}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);`,
  });
  await sleep(500);
  return h;
}
const expand = (h, name) => h.evaluate(name => {
  const d = [...document.querySelectorAll("div")].filter(x => x.style && x.style.cursor === "pointer" && (x.innerText || "").includes(name)).pop();
  if (d) d.click();
  return !!d;
}, name);
const setPart = (h, sid, part, v) => h.setInput(`[data-abbr2-card="${sid}"] input[data-abbr2="${part}"]`, v);
const press = (h, sid, label) => h.evaluate(([sid, label]) => {
  const b = [...document.querySelectorAll(`[data-abbr2-card="${sid}"] button`)].find(x => x.innerText.trim() === label);
  if (b) b.click();
  return !!b;
}, [sid, label]);
const state = h => h.evaluate(() => ({
  B2: window.__db("shops/B/settings/shopAbbr2"), Babbrs: window.__db("shops/B/settings/shopAbbrs"),
  writes: window.__writes.slice(), toasts: window.__toasts.slice(), saved: window.__saved.slice(),
  curB: (document.querySelector('[data-abbr2-current="B"]') || {}).innerText || null,
  curA: (document.querySelector('[data-abbr2-current="A"]') || {}).innerText || null,
}));

(async () => {
  const v = {};
  const h = await mount({ width: 1200, height: 900 });
  if (h.page && typeof h.setInput !== "function") throw new Error("setInput が無い");
  await expand(h, "三ビル"); await sleep(400);
  const s0 = await state(h);
  v.b_initialUnregistered = s0.curB === "未登録";
  // (a) 登録
  await setPart(h, "B", "top", "鶏"); await setPart(h, "B", "bottom", "三");
  v.b_pressRegister = await press(h, "B", "登録"); await sleep(300);
  const s1 = await state(h);
  v.b_registered = JSON.stringify(s1.B2) === JSON.stringify({ top: "鶏", bottom: "三" }) && /上「鶏」・下「三」/.test(s1.curB || "");
  const w1 = s1.writes.filter(w => /shopAbbr2/.test(w.p) || (w.v && typeof w.v === "object" && "shopAbbr2" in w.v));
  v.b_writeIsUpdateOnSettings = w1.length === 1 && w1[0].m === "update" && w1[0].p === "shops/B/settings";
  v.b_abbrsUnchanged = JSON.stringify(s1.Babbrs) === JSON.stringify(["鶏三"]);
  // (b) 拒否: 予約語・数字始まり・3文字・片方だけ（DB は鶏/三のまま）
  const rejects = [["h", "三"], ["鶏", "3"], ["鶏えん", "三"], ["鶏", ""]];
  let allRejected = true;
  for (const [t, b] of rejects) {
    const n0 = (await state(h)).toasts.length;
    await setPart(h, "B", "top", t); await setPart(h, "B", "bottom", b);
    await press(h, "B", "変更"); await sleep(200);
    const s = await state(h);
    const ok = JSON.stringify(s.B2) === JSON.stringify({ top: "鶏", bottom: "三" }) && s.toasts.length === n0 + 1 && /^✕/.test(s.toasts[s.toasts.length - 1]);
    if (!ok) { allRejected = false; v["b_reject_" + t + "_" + b] = false; }
  }
  v.b_rejects = allRejected;
  // 変更
  await setPart(h, "B", "top", "鶏"); await setPart(h, "B", "bottom", "ビ");
  await press(h, "B", "変更"); await sleep(300);
  v.b_changed = JSON.stringify((await state(h)).B2) === JSON.stringify({ top: "鶏", bottom: "ビ" });
  // 削除
  v.b_pressDelete = await press(h, "B", "削除"); await sleep(300);
  const s3 = await state(h);
  v.b_deleted = (s3.B2 === null || s3.B2 === undefined) && s3.curB === "未登録" && JSON.stringify(s3.Babbrs) === JSON.stringify(["鶏三"]);
  const lastB = s3.writes.filter(w => w.p === "shops/B/settings").pop();
  v.b_deleteIsUpdateNull = !!lastB && lastB.m === "update" && lastB.v.shopAbbr2 === null;
  v.noSetOnCollections = s3.writes.every(w => w.m !== "set");
  // (c) 表示中の店舗 A は onSave（saveSettings）経由
  await expand(h, "東通り"); await sleep(300);
  await setPart(h, "A", "top", "東"); await setPart(h, "A", "bottom", "通");
  await press(h, "A", "登録"); await sleep(300);
  const s4 = await state(h);
  const lastSaved = s4.saved[s4.saved.length - 1] || {};
  v.a_savedViaOnSave = JSON.stringify(lastSaved.shopAbbr2) === JSON.stringify({ top: "東", bottom: "通" }) && JSON.stringify(lastSaved.shopAbbrs) === JSON.stringify(["東"]);
  v.a_shown = /上「東」・下「通」/.test(s4.curA || "");
  v.noErrors1 = h.errors.length === 0;
  const err1 = h.errors.slice();
  await h.close();

  // (d) 登録済みの値を開き直して読み込む ＋ (e) 375px
  const seed2 = JSON.parse(JSON.stringify(SEED)); seed2.shops.B.settings.shopAbbr2 = { top: "鶏", bottom: "三" };
  const h2 = await mount({ width: 375, height: 812 }, seed2);
  await expand(h2, "三ビル"); await sleep(400);
  const r2 = await h2.evaluate(() => {
    const card = document.querySelector('[data-abbr2-card="B"]');
    const cr = card ? card.getBoundingClientRect() : null;
    const inputs = card ? [...card.querySelectorAll("input")].map(i => { const r = i.getBoundingClientRect(); return { l: r.left, r: r.right, v: i.value, fs: parseFloat(getComputedStyle(i).fontSize) }; }) : [];
    return { cur: (document.querySelector('[data-abbr2-current="B"]') || {}).innerText || null, cr: cr && { l: cr.left, r: cr.right }, inputs,
      docW: document.documentElement.scrollWidth, winW: window.innerWidth,
      // 店舗カード（展開した中身）の中ではみ出す要素。ページ全体の docW は既存の「企業アカウントを作成」フォームの入力欄（width:100%＋padding）で1px広がるため別に記録する
      cardWide: card ? [card.parentElement, ...card.parentElement.querySelectorAll("*")].filter(e => e.getBoundingClientRect().right > window.innerWidth + 0.5 || e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== "visible").map(e => e.tagName) : null,
      wide: [...document.querySelectorAll("*")].filter(e => e.getBoundingClientRect().right > window.innerWidth + 0.5).slice(0, 8).map(e => e.tagName + "|" + String(e.innerText || e.placeholder || "").slice(0, 30) + "|" + Math.round(e.getBoundingClientRect().right)) };
  });
  v.reload_loaded = /上「鶏」・下「三」/.test(r2.cur || "") && r2.inputs.length === 2 && r2.inputs[0].v === "鶏" && r2.inputs[1].v === "三";
  v.m375_cardNoOverflow = Array.isArray(r2.cardWide) && r2.cardWide.length === 0;
  v.m375_inputsInsideCard = !!r2.cr && r2.inputs.every(i => i.l >= r2.cr.l - 0.5 && i.r <= r2.cr.r + 0.5) && r2.inputs.every(i => i.r <= r2.winW);
  v.inputsFont16 = r2.inputs.every(i => i.fs >= 16);
  v.noErrors2 = h2.errors.length === 0;
  const err2 = h2.errors.slice();
  await h2.close();
  v.allPass = Object.values(v).every(Boolean);
  console.log(JSON.stringify({ r2, err1, err2, verdict: v }, null, 2));
  process.exit(v.allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
