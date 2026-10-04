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
// 個人リンクコードと同じ15分）。管理者のリセットは shops/{sid}/staffPages/{token}.pinResetAt（オーナーが書く）より前に設定した番号を「未設定」として扱う。
// ハッシュは呼び出し側が計算して渡す（index.js は company-config.js の payCodeHashCF＝SHA-256(salt+番号)、E2E のスタブは app-utils.js の
// payCodeHash＝同じ値）。このファイルは crypto を読まない（スタブでブラウザにも埋め込むため）

const PAGE_TOKEN_RE_CF = /^[A-Za-z0-9]{24}$/;
const PAGE_PIN_RE_CF = /^[0-9]{4}$/;
const PAGE_PIN_MAX_FAILS_CF = 5;
const PAGE_PIN_LOCK_MS_CF = 15 * 60 * 1000;
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
// 失敗を1つ数えた記録（5回で15分止め、数え直す）
function _pinFailCF(pinRec, now) {
  const r = { ..._o(pinRec) };
  const fails = (Number(r.fails) || 0) + 1;
  if (fails >= PAGE_PIN_MAX_FAILS_CF) { r.fails = 0; r.lockedUntil = now + PAGE_PIN_LOCK_MS_CF; } else { r.fails = fails; r.lockedUntil = 0; }
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
  const lockedErr = () => err("resource-exhausted", `暗証番号を${PAGE_PIN_MAX_FAILS_CF}回まちがえたため、${Math.ceil(wait / 60000)}分後にもう一度お試しください`);
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
      return { ...err("permission-denied", left ? `暗証番号が正しくありません（残り${left}回）` : `暗証番号を${PAGE_PIN_MAX_FAILS_CF}回まちがえたため、15分後にもう一度お試しください`), pinPatch: p };
    }
    const r = _o(x.pinRec) || {};
    return { result: { ok: true, hasPin: true }, pinPatch: Number(r.fails) || Number(r.lockedUntil) ? { ...r, fails: 0, lockedUntil: 0 } : undefined, unlocked: true };
  }
  return err("invalid-argument", "操作が正しくありません");
}

module.exports = { PAGE_TOKEN_RE_CF, PAGE_PIN_RE_CF, PAGE_PIN_MAX_FAILS_CF, PAGE_PIN_LOCK_MS_CF, isPageTokenCF, isPagePinCF, myPageAccessCF, pinIsSetCF, pinWaitMsCF, planMyPagePin };
