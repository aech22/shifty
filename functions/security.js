"use strict";
// ============================================================
// 認証まわりの回数の制限（2026-10-08・セキュリティ強化）
// ============================================================
// 純粋関数だけを置く（index.js と tests/security.test.js が同じ関数を通す）。crypto も DB も読まない。
// 置き場はすべて Cloud Functions だけが書くパス（database.rules.json に書いていない＝クライアントからは読み書きできない）。
//   email_otps/{uid}                         = {code, email, emailLink, expiry, attempts, attemptsSince}
//   emailOtpRate/{uid|email}_{SHA-256の鍵}    = {count, windowStart}（送信回数。staffPageEmailRate と同じ形・同じ1歩の関数）
//   companies/{companyId}/private/loginFails = {fails, lockedUntil, lastAt}（企業コードのログインの試行回数。private はルールで閉じている）

const { pageEmailRateStepCF } = require("./my-page");

const _o = v => (v && typeof v === "object" ? v : null);
const err = (code, msg) => ({ error: { code, msg } });

// ------------------------------------------------------------
// メール連携の確認コード（sendEmailOtp / verifyEmailOtp）
// ------------------------------------------------------------
// 1時間あたりの送信回数（呼び出し元 uid ごと・宛先アドレスごと）。超えたら resource-exhausted
const EMAIL_OTP_RATE_WINDOW_MS = 60 * 60 * 1000;
const EMAIL_OTP_RATE_LIMITS = { uid: 5, email: 5 };
const EMAIL_OTP_TTL_MS = 10 * 60 * 1000;           // コードの有効期限（従来どおり10分）
const EMAIL_OTP_MAX_FAILS = 5;                      // 誤りの上限（従来どおり5回）
const EMAIL_OTP_FAIL_WINDOW_MS = 60 * 60 * 1000;    // 誤りの回数を持ち越す期間。再送しても0に戻さない
const EMAIL_OTP_EXHAUSTED_MSG = "確認コードの入力を続けて間違えたため、1時間ほど待ってから確認コードを再送信してください";
const EMAIL_OTP_INVALID_MSG = "確認コードが無効か期限切れです";

// 送信回数の制限の1歩（staffPageEmailRate と同じ形）。kind は "uid" | "email"
function emailOtpRateStep(rec, now, kind) {
  return pageEmailRateStepCF(rec, now, EMAIL_OTP_RATE_LIMITS[kind], EMAIL_OTP_RATE_WINDOW_MS);
}
// いまの記録で数えている誤りの回数（期間が過ぎていれば0）
function emailOtpFailsOf(rec, now) {
  const r = _o(rec);
  if (!r) return 0;
  const since = Number(r.attemptsSince) || 0;
  if (!(since > 0) || now - since >= EMAIL_OTP_FAIL_WINDOW_MS) return 0;
  return Math.max(0, Number(r.attempts) || 0);
}
// 送信の計画。prev＝いまの email_otps/{uid}。戻り値 {record} | {error}
// 誤りの回数は再送でも持ち越す（以前は再送のたびに attempts:0 で書き直していた＝再送を挟めば無制限に試せた）
function planEmailOtpSend(o) {
  const x = _o(o) || {};
  const now = Number(x.now) || 0;
  const prev = _o(x.prev);
  const fails = emailOtpFailsOf(prev, now);
  if (fails >= EMAIL_OTP_MAX_FAILS) return err("resource-exhausted", EMAIL_OTP_EXHAUSTED_MSG);
  if (typeof x.code !== "string" || !/^[0-9]{6}$/.test(x.code)) return err("internal", "確認コードを作れませんでした");
  const since = fails > 0 ? Number(prev.attemptsSince) : now;
  return { record: { code: x.code, email: String(x.email || ""), emailLink: String(x.emailLink || ""), expiry: now + EMAIL_OTP_TTL_MS, attempts: fails, attemptsSince: since } };
}
// 照合の計画。otp＝いまの email_otps/{uid}。戻り値 {result?, error?, patch}
// patch は email_otps/{uid} に書く値（null で消す・undefined は変えない）。誤りは比べる前に数える（並べて投げても回数を抜けない）
function planEmailOtpVerify(o) {
  const x = _o(o) || {};
  const now = Number(x.now) || 0;
  const otp = _o(x.otp);
  const fails = emailOtpFailsOf(otp, now);
  if (fails >= EMAIL_OTP_MAX_FAILS) return { ...err("resource-exhausted", EMAIL_OTP_EXHAUSTED_MSG), patch: undefined };
  if (!otp || typeof otp.code !== "string" || !otp.code || !(Number(otp.expiry) > now)) return { ...err("invalid-argument", EMAIL_OTP_INVALID_MSG), patch: undefined };
  const code = typeof x.code === "string" ? x.code.trim() : "";
  if (code !== otp.code) {
    const n = fails + 1;
    const since = fails > 0 ? Number(otp.attemptsSince) : now;
    // 上限に達したらコードを消す（記録は残して誤りの回数を持ち越す）
    const patch = n >= EMAIL_OTP_MAX_FAILS
      ? { attempts: n, attemptsSince: since, expiry: Number(otp.expiry) || 0 }
      : { ...otp, attempts: n, attemptsSince: since };
    return { ...err(n >= EMAIL_OTP_MAX_FAILS ? "resource-exhausted" : "invalid-argument", n >= EMAIL_OTP_MAX_FAILS ? EMAIL_OTP_EXHAUSTED_MSG : EMAIL_OTP_INVALID_MSG), patch };
  }
  return { result: { emailLink: otp.emailLink, email: otp.email }, patch: null };
}
// 毎日の掃除で email_otps/{uid} を消してよいか（コードの期限が切れていて、誤りの回数も持ち越していない）
function emailOtpPurgeable(entry, now) {
  const e = _o(entry);
  if (!e) return true;
  const exp = Number(e.expiry);
  const expired = !Number.isFinite(exp) || !(exp > now);
  return expired && emailOtpFailsOf(e, now) === 0;
}
// 毎日の掃除で emailOtpRate/{key} を消してよいか（窓が過ぎている）
function emailOtpRatePurgeable(rec, now) {
  const r = _o(rec);
  const ws = r ? Number(r.windowStart) : NaN;
  return !(ws > 0) || now - ws >= EMAIL_OTP_RATE_WINDOW_MS;
}

// ------------------------------------------------------------
// 企業コードのログイン（companyLogin）の試行回数
// ------------------------------------------------------------
// 企業コードごとに数える。5回目の試行から待ち時間を置き（1分）、以後は試行のたびに倍（2分・4分…上限30分）。成功で数え直す。
// 試行は**照合の前に**トランザクションで数える（悲観的に数える）。並べて投げても5回を超えて scrypt まで届かない。
// 最後の試行から24時間たてば数え直す（たまの打ち間違いが積もって何か月も後に止まらないように）。
// 待ち時間の間は scrypt を回さない（CPU を消費させる攻撃も止める）
const COMPANY_LOGIN_MAX_FAILS = 5;
const COMPANY_LOGIN_LOCK_BASE_MS = 60 * 1000;
const COMPANY_LOGIN_LOCK_MAX_MS = 30 * 60 * 1000;
const COMPANY_LOGIN_FAIL_RESET_MS = 24 * 60 * 60 * 1000;
// n 回目の試行（n>=5）のあとに置く待ち時間
function companyLoginLockMs(n) {
  const k = Math.max(0, (Number(n) || 0) - COMPANY_LOGIN_MAX_FAILS);
  return Math.min(COMPANY_LOGIN_LOCK_BASE_MS * Math.pow(2, Math.min(k, 30)), COMPANY_LOGIN_LOCK_MAX_MS);
}
// 試行の1歩。rec＝いまの loginFails。戻り値 {ok:false, waitMs}（待ち時間の間・記録は変えない）| {ok:true, rec}（この試行を数えた記録）
function planCompanyLoginAttempt(rec, now) {
  const r = _o(rec) || {};
  const until = Number(r.lockedUntil) || 0;
  if (until > now) return { ok: false, waitMs: until - now };
  const last = Number(r.lastAt) || 0;
  const fails = last > 0 && now - last < COMPANY_LOGIN_FAIL_RESET_MS ? Math.max(0, Number(r.fails) || 0) : 0;
  const n = fails + 1;
  return { ok: true, rec: { fails: n, lockedUntil: n >= COMPANY_LOGIN_MAX_FAILS ? now + companyLoginLockMs(n) : 0, lastAt: now } };
}
function companyLoginWaitMsg(waitMs) {
  const min = Math.max(1, Math.ceil((Number(waitMs) || 0) / 60000));
  return `ログインの失敗が続いたため、しばらく待ってから（約${min}分後に）もう一度お試しください`;
}

// ------------------------------------------------------------
// 課金系エンドポイントの店舗オーナー照合（verifyShopOwner）
// ------------------------------------------------------------
// owners に uid が登録されているときだけ true。owners が無い（未claim の）店舗は false（2026-10-08 まで移行猶予で true だった）
function isShopOwnerOf(owners, uid) {
  const o = _o(owners);
  return !!(o && typeof uid === "string" && uid && Object.prototype.hasOwnProperty.call(o, uid) && o[uid]);
}

module.exports = {
  EMAIL_OTP_RATE_WINDOW_MS, EMAIL_OTP_RATE_LIMITS, EMAIL_OTP_TTL_MS, EMAIL_OTP_MAX_FAILS, EMAIL_OTP_FAIL_WINDOW_MS,
  EMAIL_OTP_EXHAUSTED_MSG, EMAIL_OTP_INVALID_MSG,
  emailOtpRateStep, emailOtpFailsOf, planEmailOtpSend, planEmailOtpVerify, emailOtpPurgeable, emailOtpRatePurgeable,
  COMPANY_LOGIN_MAX_FAILS, COMPANY_LOGIN_LOCK_BASE_MS, COMPANY_LOGIN_LOCK_MAX_MS, COMPANY_LOGIN_FAIL_RESET_MS,
  companyLoginLockMs, planCompanyLoginAttempt, companyLoginWaitMsg,
  isShopOwnerOf,
};
