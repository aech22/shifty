// マイシフトの「カレンダーへ取り込む前の確認」（2026-10-04・ユーザー指示「カレンダー同期の際、ホーム画面にブックマークを保存する必要がある、
// ないしはその他操作が必要ならその操作を促すポップアップを表示する」）の回帰テスト。アプリ全体をスタブ Firebase で動かす（Firebase へは1バイトも出ない）。
// UA・タッチ点・navigator.standalone は extraHead の script で差し替える（判定は app-my-utils.js の myCalendarPromptOf）。
//
//  A（iOS の Safari・#/me）: 確認を出さずにそのまま書き出す。案内は「すべてを追加」
//  B（iOS のホーム画面から開いた状態＝standalone）: 確認を出さない（ホーム画面への追加は不要・iOS 27 のシミュレーターで取り込めた）。案内に「Safari で開く」の1文
//  C（LINE の中・iOS・#/me）: 必須の確認。「Safariで開く」で openExternalBrowser=1 付きの URL（ハッシュ #/me を保つ）へ移る。ログインし直しの1行。
//     「このまま書き出す」で書き出せる。Esc・背景のタップで閉じる。開くとフォーカスが確認の中に移る。「次から表示しない」は出ない
//  D（Instagram の中・Android）: 必須。外部ブラウザのボタンは無く「URL をコピー」（コピーできなければ URL の欄を出す）
//  E（2026-10-05）: 日付の詳細に「Google カレンダーに追加」のリンクが無い（取り込みは「この月のシフトをカレンダーに取り込む」1つ）。LINE の中・PC の Chrome の両方
//  F（PC の Chrome）: 任意の確認（手順3つ・「次から表示しない」）。書き出した後の案内は重ねない。チェックして書き出すと次から出ず、案内が出る。
//     LINE の必須の確認は覚えていても出る
//  G（375px・320px）: 確認の横はみ出し無し・入力欄 16px 以上
//  H（個別URL #/m/…・LINE の中）: 必須の確認が出る。ログインし直しの1行は出ない
//  すべての場面で console.error・pageerror が 0 件
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/example-my-cal-prompt.js → allPass=true / EXIT=0
//       SHIFTY_ENGINE=webkit SHIFTY_DEVICE="iPhone 13" node ... でも通る（端末の画面サイズで開くので 375/320 の指定は 390 になる）
// 反証: SHIFTY_ROOT=<95fc029 の配信物> node ... → EXIT=1（確認が出ない）
"use strict";
const path = require("node:path");
const { openHarness, REPO_ROOT } = require(path.join(__dirname, "mount-component.js"));
const { makeStub } = require(path.join(__dirname, "stub-firebase.js"));
const ROOT = process.env.SHIFTY_ROOT || REPO_ROOT;
const SCRIPTS = ["app-utils.js", "app-my-utils.js", "app-core.js", "app-staff.js", "app-admin.js", "app-shift.js", "app-company.js", "app-my.js", "app-main.js"].map(src => ({ src, babel: !/utils|core/.test(src) }));
const PHONE = { width: 375, height: 812 };
const USERS = { "tanaka@example.com": { uid: "T1", password: "pass12345" } };
const T1 = { uid: "T1", isAnonymous: false, email: "tanaka@example.com" };
const PAGE = "AbCdEfGhIjKlMnOpQrStUv12";
const pad = n => String(n).padStart(2, "0");
const now = new Date();
const TODAY = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const YM = TODAY.slice(0, 7);
const LAST = `${YM}-${pad(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate())}`;
const UA = {
  iosSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1",
  iosLine: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.16.0",
  androidInstagram: "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.86 Mobile Safari/537.36 Instagram 350.0.0.25.104 Android",
  winChrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
};
const seed = () => ({
  global: { shops: { S1: { id: "S1", name: "A店" } } },
  shops: { S1: { owners: { OWN: "K1" }, private: { adminKey: "K1" }, staff: ["田中", "佐藤"],
    settings: { shopId: "S1", candidates: [{ start: "10:00", end: "15:00" }] },
    periods: { p1: { id: "p1", urlToken: "t1", shopId: "S1", label: "今月", startDate: `${YM}-01`, endDate: LAST, deadlineDate: "", createdAt: "2026-09-01T00:00:00.000Z", published: { at: "2026-09-02T00:00:00.000Z", byUid: "OWN" } } },
    subs: { s1: { id: "s1", periodId: "p1", shopId: "S1", staffName: "田中", submittedAt: "2026-09-02T00:00:00Z", shifts: { [TODAY]: { status: "work", start: "10:00", end: "15:00" } } } },
    staffLinks: { T1: { name: "田中", method: "code", at: "2026-10-01T00:00:00.000Z" } },
    staffPages: { [PAGE]: { status: "approved", name: "田中", displayName: "田中", requestedAt: "x", approvedAt: "2026-10-01T00:00:00.000Z" } } } },
  tokens: { t1: { shopId: "S1", periodId: "p1" } },
  staffPageTokens: { [PAGE]: { shopId: "S1", at: "x" } },
  accounts: { S1: { plan: "premium" } },
  users: { T1: { profile: { displayName: "田中", updatedAt: "t" }, links: { S1: { name: "田中", at: "t" } } } },
});
const hashHead = h => `<script>history.replaceState(null,"","/${h}");</script>`;
const preLS = obj => `<script>${Object.entries(obj).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)},${JSON.stringify(v)});`).join("")}</script>`;
// UA・タッチ点・standalone の差し替え（プロトタイプの getter を上書き）
const envHead = ({ ua, touch = 0, standalone = false }) => `<script>(function(){var P=Navigator.prototype;
function def(k,v){try{Object.defineProperty(P,k,{get:function(){return v;},configurable:true});}catch(e){Object.defineProperty(navigator,k,{get:function(){return v;},configurable:true});}}
def("userAgent",${JSON.stringify(ua)});def("maxTouchPoints",${touch});${standalone ? 'def("standalone",true);' : ""}})();</script>`;
// ダウンロードと window.open とリンクの既定の動作（window まで上がった click の defaultPrevented を記録してから、実際の遷移は止める）
const CAPTURE = `<script>window.__dl=[];window.__opened=[];window.__clicks=[];(function(){URL.createObjectURL=function(b){window.__lastBlob=b;return "blob:stub";};
URL.revokeObjectURL=function(){};var c=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download){window.__dl.push(this.download);return;}return c.apply(this,arguments);};
window.open=function(u,t,f){window.__opened.push([u,t,f]);return null;};
window.addEventListener("click",function(e){var a=e.target&&e.target.closest&&e.target.closest("[data-my-gcal]");if(a){window.__clicks.push(e.defaultPrevented);e.preventDefault();}});})();</script>`;
async function open({ hash = "#/me", env, ls = {}, viewport = PHONE }) {
  const isMe = hash === "#/me";
  const head = hashHead(hash) + preLS({ ...(isMe ? { ots_staffAccount_v1: JSON.stringify({ uid: "T1" }) } : {}), ...ls }) + envHead(env) + CAPTURE +
    makeStub({ seed: seed(), view: "staff", tab: "periods", auth: "accounts", authSeed: isMe ? { users: USERS, cur: T1 } : { users: {}, cur: null } });
  const h = await openHarness({ root: ROOT, jsx: "window.__harnessReady=true;", waitFor: "[data-my-shift],[data-my-empty],[data-my-view]", viewport, extraHead: head, scripts: SCRIPTS });
  await h.page.waitForSelector('[data-my-action="ics"]', { timeout: 15000 }).catch(() => {});
  await h.page.waitForTimeout(300);
  return h;
}
const sleep = (h, ms) => h.page.waitForTimeout(ms);
const click = (h, sel) => h.evaluate(sel => { const e = document.querySelector(sel); if (!e) return false; e.click(); return true; }, sel);
const state = h => h.evaluate(() => {
  const d = document.querySelector("[data-my-cal-prompt]");
  const b = document.querySelector('[data-my-action="ics"]');
  const m = b && b.parentElement.querySelector("[data-my-msg]");
  return {
    icsBtn: !!b,
    prompt: d ? { kind: d.getAttribute("data-my-cal-prompt"), action: d.getAttribute("data-my-cal-prompt-action"), role: d.getAttribute("role"), modal: d.getAttribute("aria-modal"),
      text: d.innerText, steps: d.querySelectorAll("[data-my-cal-steps] li").length, skip: !!d.querySelector('[data-my-input="calSkip"]'),
      actions: [...d.querySelectorAll("[data-my-action]")].map(x => x.getAttribute("data-my-action")),
      focusIn: d.contains(document.activeElement), right: Math.round(d.getBoundingClientRect().right), left: Math.round(d.getBoundingClientRect().left) } : null,
    dl: window.__dl.slice(), opened: window.__opened.slice(), clicks: window.__clicks.slice(),
    msg: m ? m.getAttribute("data-my-msg") + ":" + m.innerText : "",
    overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth, vw: window.innerWidth,
    fonts: [...document.querySelectorAll("input,select,textarea")].every(i => parseFloat(getComputedStyle(i).fontSize) >= 16),
    lsRec: localStorage.getItem("shifty_my_calPrompt_v1"),
  };
});

(async () => {
  const R = {}, V = {};
  const errs = (k, h) => { R[k + "_errors"] = h.errors.slice(); return h.errors.length === 0; };
  // A: iOS の Safari
  {
    const h = await open({ env: { ua: UA.iosSafari, touch: 5 } });
    try {
      await click(h, '[data-my-action="ics"]'); await sleep(h, 300);
      const s = await state(h); R.A = s;
      V.A_noPrompt = s.icsBtn && !s.prompt && s.dl.length === 1 && /すべてを追加/.test(s.msg) && !/ホーム画面から/.test(s.msg);
      V.A_noErrors = errs("A", h);
    } finally { await h.browser.close(); }
  }
  // B: iOS のホーム画面から開いた状態
  {
    const h = await open({ env: { ua: UA.iosSafari, touch: 5, standalone: true } });
    try {
      await click(h, '[data-my-action="ics"]'); await sleep(h, 300);
      const s = await state(h); R.B = s;
      V.B_standaloneNoPrompt = s.icsBtn && !s.prompt && s.dl.length === 1 && /すべてを追加/.test(s.msg) && /ホーム画面から開いていてその画面が出ないときは、Safari/.test(s.msg);
      V.B_noErrors = errs("B", h);
    } finally { await h.browser.close(); }
  }
  // C: LINE の中（iOS・#/me）
  {
    const h = await open({ env: { ua: UA.iosLine, touch: 5 } });
    try {
      await click(h, '[data-my-action="ics"]'); await sleep(h, 300);
      let s = await state(h); R.C = { first: s };
      V.C_lineRequired = !!s.prompt && s.prompt.kind === "inApp" && s.prompt.action === "ics" && s.prompt.role === "dialog" && s.prompt.modal === "true" &&
        /LINEの中で開いています/.test(s.prompt.text) && s.prompt.steps === 3 && /ログイン/.test(s.prompt.text) && !s.prompt.skip &&
        s.prompt.actions.join() === "calOpenExternal,calCopyUrl,calProceed,calClose" && /Safariで開く/.test(s.prompt.text) && s.dl.length === 0;
      V.C_focusMoved = s.prompt && s.prompt.focusIn;
      // Esc で閉じる → 書き出さない
      await h.page.keyboard.press("Escape"); await sleep(h, 200);
      s = await state(h); R.C.esc = s;
      V.C_escCloses = !s.prompt && s.dl.length === 0;
      // 背景のタップで閉じる
      await click(h, '[data-my-action="ics"]'); await sleep(h, 200);
      await h.page.mouse.click(5, 5); await sleep(h, 200);
      s = await state(h); R.C.bg = s;
      V.C_backdropCloses = !s.prompt && s.dl.length === 0;
      // このまま書き出す
      await click(h, '[data-my-action="ics"]'); await sleep(h, 200);
      await click(h, '[data-my-action="calProceed"]'); await sleep(h, 300);
      s = await state(h); R.C.proceed = s;
      V.C_proceedWrites = !s.prompt && s.dl.length === 1 && /^ok:1件のシフトを書き出しました。$/.test(s.msg);
      // Safariで開く → openExternalBrowser=1 付き・ハッシュを保つ
      await click(h, '[data-my-action="ics"]'); await sleep(h, 200);
      const navs = [];
      h.page.on("request", r => { if (r.isNavigationRequest()) navs.push(r.url()); });
      R.C.btnHref = await h.evaluate(() => typeof myExternalBrowserUrl === "function" ? myExternalBrowserUrl(location.href) : null);
      await click(h, '[data-my-action="calOpenExternal"]');
      await sleep(h, 1500);
      R.C.navs = navs;
      // 遷移のリクエストにハッシュは載らないので、移り先（ハッシュつき）は関数の値で、実際に遷移したことはリクエストで見る
      V.C_openExternal = R.C.btnHref === "http://shifty.test/?openExternalBrowser=1#/me" && R.C.navs[0] === "http://shifty.test/?openExternalBrowser=1";
      V.C_noErrors = errs("C", h);
    } finally { await h.browser.close(); }
  }
  // D: Instagram の中（Android）
  {
    const h = await open({ env: { ua: UA.androidInstagram, touch: 5 } });
    try {
      await click(h, '[data-my-action="ics"]'); await sleep(h, 300);
      let s = await state(h); R.D = { first: s };
      V.D_instagramRequired = !!s.prompt && s.prompt.kind === "inApp" && /Instagramの中で開いています/.test(s.prompt.text) && /Chrome/.test(s.prompt.text) &&
        !s.prompt.actions.includes("calOpenExternal") && s.prompt.actions.includes("calCopyUrl") && !s.prompt.skip && s.dl.length === 0;
      await click(h, '[data-my-action="calCopyUrl"]'); await sleep(h, 400);
      R.D.copy = await h.evaluate(() => ({ ok: !!document.querySelector("[data-my-cal-copied]"), input: (document.querySelector('[data-my-input="calUrl"]') || {}).value || null, href: location.href }));
      V.D_copyUrl = R.D.copy.ok || R.D.copy.input === R.D.copy.href;
      s = await state(h);
      V.D_fonts = s.fonts && s.overflow <= 0;
      V.D_noErrors = errs("D", h);
    } finally { await h.browser.close(); }
  }
  // E: 日付の詳細に Google カレンダーのリンクが無い（2026-10-05 ユーザー指示で外した）
  for (const [k, env] of [["line", { ua: UA.iosLine, touch: 5 }], ["pc", { ua: UA.winChrome }]]) {
    const h = await open({ env });
    try {
      await h.page.waitForSelector("[data-my-day] [data-my-entry]", { timeout: 10000 }).catch(() => {});
      const v = await h.page.evaluate(() => ({ entries: document.querySelectorAll("[data-my-day] [data-my-entry]").length,
        gcal: document.querySelectorAll("[data-my-gcal]").length, gText: /Google カレンダーに追加/.test(document.body.innerText),
        gHref: [...document.querySelectorAll("a[href]")].some(a => /calendar\.google\.com/.test(a.getAttribute("href"))),
        ics: document.querySelectorAll('[data-my-action="ics"]').length }));
      (R.E = R.E || {})[k] = v;
      V["E_noGcal_" + k] = v.entries >= 1 && v.gcal === 0 && !v.gText && !v.gHref && v.ics === 1;
      V["E_noErrors_" + k] = errs("E_" + k, h);
    } finally { await h.browser.close(); }
  }
  // F: PC の Chrome（任意の確認と「次から表示しない」）
  {
    const h = await open({ env: { ua: UA.winChrome } });
    try {
      await click(h, '[data-my-action="ics"]'); await sleep(h, 300);
      let s = await state(h); R.F = { first: s };
      V.F_pcOptional = !!s.prompt && s.prompt.kind === "downloadThenOpen" && s.prompt.steps === 3 && s.prompt.skip && /インポート \/ エクスポート/.test(s.prompt.text) &&
        s.prompt.actions.join() === "calProceed,calClose" && s.dl.length === 0;
      await click(h, '[data-my-action="calProceed"]'); await sleep(h, 300);
      s = await state(h); R.F.proceed = s;
      V.F_noDuplicateHint = s.dl.length === 1 && /^ok:1件のシフトを書き出しました。$/.test(s.msg);
      await click(h, '[data-my-action="ics"]'); await sleep(h, 300);
      s = await state(h); R.F.again = s;
      V.F_promptAgain = !!s.prompt && s.dl.length === 1;
      await click(h, '[data-my-input="calSkip"]'); await sleep(h, 100);
      await click(h, '[data-my-action="calProceed"]'); await sleep(h, 300);
      await click(h, '[data-my-action="ics"]'); await sleep(h, 300);
      s = await state(h); R.F.remembered = s;
      V.F_skipRemembered = !s.prompt && s.dl.length === 3 && JSON.parse(s.lsRec || "{}")["ics:downloadThenOpen"] === true && /インポート \/ エクスポート/.test(s.msg);
      V.F_noErrors = errs("F", h);
    } finally { await h.browser.close(); }
    // 必須の確認は覚えていても出る
    const h2 = await open({ env: { ua: UA.iosLine, touch: 5 }, ls: { shifty_my_calPrompt_v1: JSON.stringify({ "ics:inApp": true, "ics:downloadThenOpen": true }) } });
    try {
      await click(h2, '[data-my-action="ics"]'); await sleep(h2, 300);
      const s = await state(h2); R.F.required = s;
      V.F_requiredIgnoresSkip = !!s.prompt && s.prompt.kind === "inApp" && s.dl.length === 0;
      V.F_noErrors2 = errs("F2", h2);
    } finally { await h2.browser.close(); }
  }
  // G: 375px・320px
  for (const [k, env] of [["line", { ua: UA.iosLine, touch: 5 }], ["pc", { ua: UA.winChrome }]]) {
    for (const vp of [PHONE, { width: 320, height: 640 }]) {
      const h = await open({ env, viewport: vp });
      try {
        await click(h, '[data-my-action="ics"]'); await sleep(h, 300);
        if (k === "line") { await click(h, '[data-my-action="calCopyUrl"]'); await sleep(h, 300); }
        const s = await state(h); const key = `G_${k}_${vp.width}`;
        R[key] = { overflow: s.overflow, right: s.prompt && s.prompt.right, left: s.prompt && s.prompt.left, vw: s.vw, fonts: s.fonts };
        V[key] = !!s.prompt && s.overflow <= 0 && s.prompt.right <= s.vw && s.prompt.left >= 0 && s.fonts;
        V[key + "_noErrors"] = errs(key, h);
      } finally { await h.browser.close(); }
    }
  }
  // H: 個別URL（#/m/…）・LINE の中
  {
    const h = await open({ hash: "#/m/" + PAGE, env: { ua: UA.iosLine, touch: 5 } });
    try {
      await click(h, '[data-my-action="ics"]'); await sleep(h, 300);
      const s = await state(h); R.H = s;
      V.H_pageLinePrompt = s.icsBtn && !!s.prompt && s.prompt.kind === "inApp" && s.prompt.steps === 2 && !/ログイン/.test(s.prompt.text);
      V.H_noErrors = errs("H", h);
    } finally { await h.browser.close(); }
  }
  const allPass = Object.values(V).every(Boolean);
  console.log(JSON.stringify({ verdict: { allPass, ...V }, R }, null, 1));
  process.exit(allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
