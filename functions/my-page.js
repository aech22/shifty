"use strict";
// ============================================================
// スタッフ個別URL（2026-10-04・ユーザーの仕様変更）: 給料の暗証番号と、会社が登録した賃金の参照（CF myPagePin）
// ============================================================
// 純粋関数だけを置く（index.js と E2E のスタブ・tests/my.test.js が同じ関数を通す）。
// 個別URL（#/m/<pageToken>）はログインが無く、pageToken を知っていることが権限（capability）。本人のデータ（staffPageData）は
// 誰でも読めてしまうので、給料の画面は4桁の暗証番号で伏せる（画面上の鍵）。**会社が登録した賃金（shops/{sid}/private/pay）だけは
// ここで暗証番号を照合してから返す**——ハッシュと試行回数は staffPagePins/{pageToken}（ルールでクライアントから読み書きできない）に置く。
// 4桁は1万通りなので、置き場がクライアントから読めると総当たりで破れる（だから CF 専用の場所に置き、設定・変更・照合も CF を通す）。
// 試行回数は5回の失敗で15分止める（賃金閲覧パスコードの60秒より長い: こちらは店舗の画面ではなく URL を知る誰でも試せるため。
// 削除した個人リンクコードと同じ15分）。2回目以降のロックは前の倍（30分・60分…上限24時間・2026-10-08）。正しい番号で数え直す。管理者のリセットは shops/{sid}/staffPages/{token}.pinResetAt（オーナーが書く）より前に設定した番号を「未設定」として扱う。
// ハッシュは呼び出し側が計算して渡す（index.js は company-config.js の payCodeHashCF＝SHA-256(salt+番号)、E2E のスタブは app-utils.js の
// payCodeHash＝同じ値）。このファイルは crypto を読まない（スタブでブラウザにも埋め込むため）

const PAGE_TOKEN_RE_CF = /^[A-Za-z0-9]{24}$/;
const PAGE_PIN_RE_CF = /^[0-9]{4}$/;
const PAGE_PIN_MAX_FAILS_CF = 5;
const PAGE_PIN_LOCK_MS_CF = 15 * 60 * 1000;
// 2回目以降のロックは前の倍（30分・60分…）で、上限24時間（2026-10-08）。正しい番号で数え直す（locks を0に戻す）
const PAGE_PIN_LOCK_MAX_MS_CF = 24 * 60 * 60 * 1000;
// n 回目のロック（n>=1）の長さ
function pageLockMsCF(n) {
  const k = Math.max(1, Math.floor(Number(n) || 1));
  return Math.min(PAGE_PIN_LOCK_MS_CF * Math.pow(2, Math.min(k - 1, 30)), PAGE_PIN_LOCK_MAX_MS_CF);
}
// 待ち時間の表示（2時間未満は分、それ以上は時間）
function pinWaitLabelCF(ms) {
  const min = Math.max(1, Math.ceil((Number(ms) || 0) / 60000));
  return min < 120 ? `${min}分` : `${Math.ceil(min / 60)}時間`;
}
const _o = v => (v && typeof v === "object" ? v : null);
const err = (code, msg) => ({ error: { code, msg } });
function isPageTokenCF(t) { return typeof t === "string" && PAGE_TOKEN_RE_CF.test(t); }
function isPagePinCF(p) { return typeof p === "string" && PAGE_PIN_RE_CF.test(p); }
function _staffNamesCF(staff) {
  return (Array.isArray(staff) ? staff : Object.values(_o(staff) || {})).filter(n => typeof n === "string" && n && !n.startsWith("__spacer__"));
}
// 個別URLが使える状態か（app-my-utils.js の resolveMyPage と同じ規則: 承認済みで、名前がいまのスタッフ一覧にある）。戻り値 {shopId,name} | {error}
function myPageAccessCF(o) {
  const x = _o(o) || {};
  if (!isPageTokenCF(x.token)) return err("invalid-argument", "URLが正しくありません");
  const tr = _o(x.tokenRec);
  const shopId = tr && typeof tr.shopId === "string" ? tr.shopId : "";
  if (!shopId) return err("not-found", "このURLは見つかりませんでした");
  const pr = _o(x.pageRec);
  if (!pr || pr.status !== "approved") return err("permission-denied", "このURLは承認されていないか、取り消されています");
  const name = typeof pr.name === "string" ? pr.name : "";
  if (!name || !_staffNamesCF(x.staff).includes(name)) return err("failed-precondition", "お店のスタッフ一覧にこの名前がありません（名前の変更か削除）");
  return { shopId, name };
}
// 暗証番号が設定済みか（管理者のリセットより後に設定したものだけ）
function pinIsSetCF(pinRec, pageRec) {
  const r = _o(pinRec);
  if (!r || typeof r.hash !== "string" || !/^[0-9a-f]{64}$/.test(r.hash) || typeof r.salt !== "string") return false;
  const reset = _o(pageRec) && typeof pageRec.pinResetAt === "string" ? pageRec.pinResetAt : "";
  const setAt = typeof r.setAt === "string" ? r.setAt : "";
  return !reset || setAt > reset;
}
function pinWaitMsCF(pinRec, now) {
  const r = _o(pinRec) || {};
  const until = Number(r.lockedUntil) || 0;
  return until > now ? until - now : 0;
}
// 16進のハッシュの比較（長さが同じなら全桁を見る＝最初の不一致で抜けない）
function _sameHexCF(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length || !a.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
// 失敗を1つ数えた記録（5回で止め、数え直す）。止める長さは1回目15分・以後は前の倍・上限24時間（locks＝これまでに止めた回数）
function _pinFailCF(pinRec, now) {
  const r = { ..._o(pinRec) };
  const fails = (Number(r.fails) || 0) + 1;
  if (fails >= PAGE_PIN_MAX_FAILS_CF) {
    const locks = Math.max(0, Math.floor(Number(r.locks) || 0)) + 1;
    r.fails = 0; r.locks = locks; r.lockedUntil = now + pageLockMsCF(locks);
  } else { r.fails = fails; r.lockedUntil = 0; }
  return r;
}
// 操作の計画。o={action:"status"|"set"|"verify", pin, currentPin, pinRec, pageRec, now, nowIso, salt,
//   pinHash（pin を pinRec.salt で）, currentHash（currentPin を pinRec.salt で）, newHash（pin を salt で）}
// 戻り値 {result, pinPatch?, unlocked?} | {error, pinPatch?}。pinPatch は staffPagePins/{token} に set する値（null で消す）。
// unlocked=true なら呼び出し側が会社の賃金を読んで result に足す（照合の前に賃金を読まない）
function planMyPagePin(o) {
  const x = _o(o) || {};
  const now = Number(x.now) || 0;
  const hasPin = pinIsSetCF(x.pinRec, x.pageRec);
  const wait = hasPin ? pinWaitMsCF(x.pinRec, now) : 0;
  if (x.action === "status") return { result: { ok: true, hasPin, waitSec: Math.ceil(wait / 1000) } };
  const lockedErr = () => err("resource-exhausted", `暗証番号を${PAGE_PIN_MAX_FAILS_CF}回まちがえたため、${pinWaitLabelCF(wait)}後にもう一度お試しください`);
  if (x.action === "set") {
    if (!isPagePinCF(x.pin)) return err("invalid-argument", "暗証番号は4桁の数字にしてください");
    if (hasPin) {
      if (wait) return lockedErr();
      if (!isPagePinCF(x.currentPin) || !_sameHexCF(x.currentHash, x.pinRec.hash)) {
        const p = _pinFailCF(x.pinRec, now);
        return { ...err("permission-denied", "いまの暗証番号が正しくありません"), pinPatch: p };
      }
    }
    if (typeof x.salt !== "string" || x.salt.length < 16 || typeof x.newHash !== "string" || !/^[0-9a-f]{64}$/.test(x.newHash)) return err("internal", "暗証番号を保存できませんでした");
    return { result: { ok: true, hasPin: true }, pinPatch: { hash: x.newHash, salt: x.salt, setAt: String(x.nowIso || ""), fails: 0, lockedUntil: 0 }, unlocked: true };
  }
  if (x.action === "verify") {
    if (!hasPin) return err("failed-precondition", "暗証番号がまだ決まっていません");
    if (wait) return lockedErr();
    if (!isPagePinCF(x.pin) || !_sameHexCF(x.pinHash, x.pinRec.hash)) {
      const p = _pinFailCF(x.pinRec, now);
      const left = p.lockedUntil ? 0 : PAGE_PIN_MAX_FAILS_CF - p.fails;
      return { ...err("permission-denied", left ? `暗証番号が正しくありません（残り${left}回）` : `暗証番号を${PAGE_PIN_MAX_FAILS_CF}回まちがえたため、${pinWaitLabelCF(p.lockedUntil - now)}後にもう一度お試しください`), pinPatch: p };
    }
    const r = _o(x.pinRec) || {};
    // 正しい番号で失敗の回数・ロックの段階（locks）を数え直す
    return { result: { ok: true, hasPin: true }, pinPatch: Number(r.fails) || Number(r.lockedUntil) || Number(r.locks) ? { ...r, fails: 0, lockedUntil: 0, locks: 0 } : undefined, unlocked: true };
  }
  return err("invalid-argument", "操作が正しくありません");
}

// ============================================================
// URLをなくしたとき用のメールアドレス（任意・2026-10-04 ユーザー指示「リンク喪失の時のためにメアドの登録(任意)でできるようにして」）
// ============================================================
// 置き場（すべて CF 専用＝ルールでクライアントから読み書きできない）:
//   staffPageEmails/{pageToken} = {email, key, setAt, sentAt?}      その個別URLに登録したアドレス（key＝下の emailKey）
//   staffPageEmailIndex/{key}/{pageToken} = true                     アドレスからの逆引き（key＝SHA-256("shiftyPageEmail:"+正規化したアドレス)）
//   staffPageEmailRate/{種類}_{鍵} = {count, windowStart}           送信回数の制限（同じ URL・同じアドレス・同じ呼び出し元）
// クライアントが受け取るのは「登録済みか」と伏せたアドレスだけ。なくしたときの送り直しは画面に URL を出さず、結果の文言も
// 登録の有無に関係なく同じ（アドレスを知っているだけの他人が URL を得られない・登録の有無が分からない）。
// 管理者が URL を発行し直した（古い URL が revoked・同じ名前に新しい承認済み）ら、登録済みのアドレスは新しい URL に引き継ぐ
// （次に状態を見た・送り直したときに移す＝pageEmailCurrentTokenCF）。取り消されて後継の無い URL は送らない。
const PAGE_EMAIL_MAX_CF = 254;
const PAGE_EMAIL_KEY_SALT_CF = "shiftyPageEmail:";
const PAGE_EMAIL_RATE_WINDOW_MS_CF = 60 * 60 * 1000;
const PAGE_EMAIL_RATE_LIMITS_CF = { setToken: 5, setUid: 10, recoverEmail: 3, recoverUid: 5 };
const PAGE_EMAIL_RECOVER_MSG_CF = "登録されているアドレスであれば、個別URLを送りました。届かないときは迷惑メールのフォルダを確かめるか、お店の管理者に確認してください";
function normalizePageEmailCF(s) { return typeof s === "string" ? s.trim().toLowerCase() : ""; }
// 形の確認。改行・空白・制御文字は入れない（メールのヘッダに入るため）
function isPageEmailCF(s) {
  return typeof s === "string" && s.length > 0 && s.length <= PAGE_EMAIL_MAX_CF && /^[^\s@<>"',;:\\()[\]\x00-\x1f\x7f]+@[^\s@<>"',;:\\()[\]\x00-\x1f\x7f]+\.[^\s@<>"',;:\\()[\]\x00-\x1f\x7f]+$/.test(s);
}
// 伏せたアドレス（a***@example.com）
function maskPageEmailCF(s) {
  const e = normalizePageEmailCF(s);
  const i = e.indexOf("@");
  if (i < 1) return "";
  return `${e[0]}***${e.slice(i)}`;
}
function pageUrlCF(base, token) { return `${String(base || "https://shiftyshifty.app").replace(/\/+$/, "")}/?openExternalBrowser=1#/m/${token}`; }
// 送信回数の制限の1歩。rec={count, windowStart}。戻り値 {ok, rec}（ok=false なら rec は変えない）
function pageEmailRateStepCF(rec, now, max, windowMs) {
  const r = _o(rec) || {};
  const w = Number(windowMs) || PAGE_EMAIL_RATE_WINDOW_MS_CF;
  const fresh = !(Number(r.windowStart) > 0) || now - Number(r.windowStart) >= w;
  const count = fresh ? 0 : Number(r.count) || 0;
  if (count >= max) return { ok: false, rec: r };
  return { ok: true, rec: { count: count + 1, windowStart: fresh ? now : Number(r.windowStart) } };
}
// その token の「いま使える」URL。自分が使えれば自分、取り消されていれば同じ店舗で同じ名前の承認済み（名前がスタッフ一覧にある）。無ければ null
function pageEmailCurrentTokenCF(token, pages, staff) {
  const ps = _o(pages) || {};
  const names = _staffNamesCF(staff);
  const rec = _o(ps[token]);
  if (!rec || typeof rec.name !== "string" || !rec.name) return null;
  const okRec = r => _o(r) && r.status === "approved" && typeof r.name === "string" && names.includes(r.name);
  if (okRec(rec)) return token;
  if (rec.status !== "revoked") return null;
  const next = Object.keys(ps).filter(t => t !== token && isPageTokenCF(t) && okRec(ps[t]) && ps[t].name === rec.name)
    .sort((a, b) => String(ps[b].approvedAt || "").localeCompare(String(ps[a].approvedAt || "")))[0];
  return next || null;
}
// 登録したアドレスを、取り消された前の URL から引き継ぐ元を探す（同じ店舗で同じ名前の revoked のうち、登録があって新しいもの）
function pageEmailInheritFromCF(token, pages, emailRecs) {
  const ps = _o(pages) || {}, ers = _o(emailRecs) || {};
  const rec = _o(ps[token]);
  if (!rec || rec.status !== "approved" || typeof rec.name !== "string") return null;
  const cands = Object.keys(ers).filter(t => t !== token && _o(ps[t]) && ps[t].status === "revoked" && ps[t].name === rec.name && _o(ers[t]) && isPageEmailCF(ers[t].email))
    .sort((a, b) => String(ers[b].setAt || "").localeCompare(String(ers[a].setAt || "")));
  return cands[0] || null;
}
// メールの本文（短い日本語・URL は本番ドメイン固定）。kind: "set"（登録の控え）| "recover"（送り直し）。entries=[{shopName, url}]
function pageEmailMailCF(kind, entries) {
  const list = (entries || []).map(e => `${e.shopName ? `${e.shopName}\n` : ""}${e.url}`).join("\n\n");
  const subject = kind === "set" ? "Shifty 自分専用のURLの控え" : "Shifty 自分専用のURL";
  const head = kind === "set"
    ? "Shifty で、URLをなくしたとき用にこのメールアドレスが登録されました。あなた専用のシフトの画面のURLです。"
    : "Shifty で、自分専用のURLの送り直しが依頼されました。あなた専用のシフトの画面のURLです。";
  const text = `${head}\n\n${list}\n\nこのURLを開くと、ログインなしで自分のシフトを見て提出できます。ほかの人には教えないでください。\n\n心当たりが無い場合は、このメールを破棄してください。URLは変わらず、あなたの画面に何も起きません。\n\n-- \nShifty https://shiftyshifty.app`;
  return { subject, text };
}
// 登録・変更・削除・状態。o={action, token, access（myPageAccessCF の戻り値）, pages（shops/{sid}/staffPages）, emailRec（staffPageEmails/{token}）,
//   prevEmailRecs（同じ名前の revoked の token の staffPageEmails・引き継ぎ用）, email（入力）, emailKey（入力を正規化したもののキー）, nowIso, base, shopName}
// 戻り値 {result, writes:{path:値|null}, mail?:{to, subject, text}} | {error}。rate の制限は呼び出し側が先に通す
function planSetPageEmailCF(o) {
  const x = _o(o) || {};
  if (!["status", "set", "remove"].includes(x.action)) return err("invalid-argument", "操作が正しくありません");
  if (!isPageTokenCF(x.token)) return err("invalid-argument", "URLが正しくありません");
  if (!x.access || x.access.error) return x.access && x.access.error ? x.access : err("permission-denied", "このURLは使えません");
  const writes = {};
  let cur = _o(x.emailRec) && isPageEmailCF(x.emailRec.email) ? x.emailRec : null;
  // 発行し直された URL へ、前の URL に登録したアドレスを引き継ぐ
  if (!cur) {
    const from = pageEmailInheritFromCF(x.token, x.pages, x.prevEmailRecs);
    if (from) {
      cur = { ...x.prevEmailRecs[from] };
      writes[`staffPageEmails/${x.token}`] = cur;
      writes[`staffPageEmails/${from}`] = null;
      if (typeof cur.key === "string" && cur.key) { writes[`staffPageEmailIndex/${cur.key}/${from}`] = null; writes[`staffPageEmailIndex/${cur.key}/${x.token}`] = true; }
    }
  }
  if (x.action === "status") return { result: { ok: true, registered: !!cur, masked: cur ? maskPageEmailCF(cur.email) : "" }, writes };
  if (x.action === "remove") {
    if (cur) {
      writes[`staffPageEmails/${x.token}`] = null;
      if (typeof cur.key === "string" && cur.key) writes[`staffPageEmailIndex/${cur.key}/${x.token}`] = null;
    }
    return { result: { ok: true, registered: false, masked: "" }, writes };
  }
  const email = normalizePageEmailCF(x.email);
  if (!isPageEmailCF(email)) return err("invalid-argument", "メールアドレスの形が正しくありません");
  if (typeof x.emailKey !== "string" || !/^[0-9a-f]{64}$/.test(x.emailKey)) return err("internal", "登録できませんでした");
  if (cur && cur.key && cur.key !== x.emailKey) writes[`staffPageEmailIndex/${cur.key}/${x.token}`] = null;
  const rec = { email, key: x.emailKey, setAt: String(x.nowIso || ""), sentAt: String(x.nowIso || "") };
  writes[`staffPageEmails/${x.token}`] = rec;
  writes[`staffPageEmailIndex/${x.emailKey}/${x.token}`] = true;
  const mail = { to: email, ...pageEmailMailCF("set", [{ shopName: x.shopName || "", url: pageUrlCF(x.base, x.token) }]) };
  return { result: { ok: true, registered: true, masked: maskPageEmailCF(email), sent: true }, writes, mail };
}
// なくしたときの送り直し。o={email, emailKey, index（staffPageEmailIndex/{key}）, tokenShops:{token: shopId}, pagesByShop:{sid: staffPages}, staffByShop, shopNames,
//   emailRecs:{token: staffPageEmails/{token}}, base, nowIso}
// 戻り値 {result:{ok,message}, writes, mail?}。**登録の有無に関係なく result は同じ**。送るのは、記録のアドレスが入力と一致し、いま使える URL だけ
function planRecoverPageUrlCF(o) {
  const x = _o(o) || {};
  const email = normalizePageEmailCF(x.email);
  if (!isPageEmailCF(email)) return err("invalid-argument", "メールアドレスの形が正しくありません");
  const result = { ok: true, message: PAGE_EMAIL_RECOVER_MSG_CF };
  const writes = {};
  const out = [], seen = new Set();
  Object.keys(_o(x.index) || {}).filter(isPageTokenCF).sort().forEach(t => {
    const er = _o((_o(x.emailRecs) || {})[t]);
    const sid = (_o(x.tokenShops) || {})[t];
    if (!er || normalizePageEmailCF(er.email) !== email || typeof sid !== "string" || !sid) return;
    const pages = (_o(x.pagesByShop) || {})[sid];
    const curT = pageEmailCurrentTokenCF(t, pages, (_o(x.staffByShop) || {})[sid]);
    if (!curT) return;
    if (curT !== t) {
      writes[`staffPageEmails/${curT}`] = { ...er };
      writes[`staffPageEmails/${t}`] = null;
      writes[`staffPageEmailIndex/${x.emailKey}/${t}`] = null;
      writes[`staffPageEmailIndex/${x.emailKey}/${curT}`] = true;
    }
    if (seen.has(curT)) return;
    seen.add(curT);
    out.push({ shopName: (_o(x.shopNames) || {})[sid] || "", url: pageUrlCF(x.base, curT) });
  });
  if (!out.length) return { result, writes };
  return { result, writes, mail: { to: email, ...pageEmailMailCF("recover", out) } };
}

module.exports = { PAGE_TOKEN_RE_CF, PAGE_PIN_RE_CF, PAGE_PIN_MAX_FAILS_CF, PAGE_PIN_LOCK_MS_CF, PAGE_PIN_LOCK_MAX_MS_CF, pageLockMsCF, pinWaitLabelCF, isPageTokenCF, isPagePinCF, myPageAccessCF, pinIsSetCF, pinWaitMsCF, planMyPagePin,
  PAGE_EMAIL_MAX_CF, PAGE_EMAIL_KEY_SALT_CF, PAGE_EMAIL_RATE_WINDOW_MS_CF, PAGE_EMAIL_RATE_LIMITS_CF, PAGE_EMAIL_RECOVER_MSG_CF, normalizePageEmailCF, isPageEmailCF, maskPageEmailCF,
  pageUrlCF, pageEmailRateStepCF, pageEmailCurrentTokenCF, pageEmailInheritFromCF, pageEmailMailCF, planSetPageEmailCF, planRecoverPageUrlCF };
