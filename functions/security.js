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

// ------------------------------------------------------------
// 新しいパスワードの検査（2026-10-08 ユーザー指示「全て揃えて」）
// ------------------------------------------------------------
// 画面の newPasswordError（app-my-utils.js）と同じ規則を企業のパスワードの作成・変更（createCompany・changeCompanyPassword）でも当てる。
// 画面を通さずに Callable を直接呼ぶ変更も止めるため。一覧・判定・文言は app-my-utils.js と同じで、tests/security.test.js が一致を照合する
const NEW_PASSWORD_MIN_CF = 8;
const NEW_PASSWORD_MAX_CF = 128;
const PW_COMMON_MSG_CF = "よく使われるパスワードは使えません。推測されにくいものにしてください";
const PW_DATE_MSG_CF = "日付に見える数字（19990315・0315・1999 など）を含むパスワードは使えません";
const PW_COMMON_CF = new Set(["password","password1","password12","password123","passw0rd","p@ssw0rd","p@ssword","12345678","123456789","1234567890","0123456789","87654321","987654321","0987654321","qwertyui","qwertyuiop","qwerty12","qwerty123","qwer1234","1q2w3e4r","1q2w3e4r5t","q1w2e3r4","1qaz2wsx","zaq12wsx","zaq1zaq1","asdfghjk","asdfghjkl","asdf1234","zxcvbnm1","abcd1234","abc12345","aa12345678","a1b2c3d4","iloveyou","sunshine","princess","football","baseball","superman","starwars","trustno1","whatever","computer","internet","welcome1","letmein1","admin123","administrator","changeme","shiftyshifty","ontheshift"]);
const PW_COMMON_CORES_CF = new Set(["password","passwd","passw0rd","p@ssw0rd","p@ssword","qwerty","qwertyui","qwertyuiop","qwer","asdf","asdfghjk","asdfghjkl","zxcvbnm","abc","abcd","abcdefg","abcdefgh","iloveyou","sunshine","princess","football","baseball","superman","starwars","welcome","letmein","admin","administrator","changeme","shifty","shiftyshifty","ontheshift","myshift"]);
const _pwHalf = s => String(s == null ? "" : s).replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
const _pwDaysIn = (m, y) => m === 2 ? ((y == null || (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0))) ? 29 : 28) : ([4, 6, 9, 11].includes(m) ? 30 : 31);
const _pwYmd = (y, m, d) => y >= 1900 && y <= 2099 && m >= 1 && m <= 12 && d >= 1 && d <= _pwDaysIn(m, y);
function _pwDate8(t) {
  const n = i => +t.slice(i, i + 2), y4 = i => +t.slice(i, i + 4);
  return _pwYmd(y4(0), n(4), n(6)) || _pwYmd(y4(4), n(0), n(2)) || _pwYmd(y4(4), n(2), n(0));
}
function _pwDate4(t) {
  const m = +t.slice(0, 2), d = +t.slice(2, 4), y = +t;
  return (m >= 1 && m <= 12 && d >= 1 && d <= _pwDaysIn(m, null)) || (y >= 1900 && y <= 2099);
}
function passwordHasDateCF(pw) {
  for (const r of _pwHalf(pw).match(/\d{4,}/g) || []) {
    for (let i = 0; i + 8 <= r.length; i++) if (_pwDate8(r.slice(i, i + 8))) return true;
    for (let i = 0; i + 4 <= r.length; i++) if (_pwDate4(r.slice(i, i + 4))) return true;
  }
  return false;
}
function passwordIsCommonCF(pw) {
  const s = _pwHalf(pw).toLowerCase();
  if (PW_COMMON_CF.has(s)) return true;
  if (/^(.)\1+$/.test(s)) return true;
  const cs = [...s].map(c => c.codePointAt(0)), st = cs[1] - cs[0];
  if (cs.length > 1 && Math.abs(st) === 1 && cs.every((c, i) => i === 0 || c - cs[i - 1] === st)) return true;
  return PW_COMMON_CORES_CF.has(s.replace(/^[^a-z]+|[^a-z]+$/g, ""));
}
// 断る理由（無ければ null）。文字列でないものは空のパスワードとして扱う
function newPasswordErrorCF(pw) {
  const s = typeof pw === "string" ? pw : "";
  if (!s) return "パスワードを入力してください";
  if (s.length < NEW_PASSWORD_MIN_CF) return `パスワードは${NEW_PASSWORD_MIN_CF}文字以上にしてください`;
  if (s.length > NEW_PASSWORD_MAX_CF) return `パスワードは${NEW_PASSWORD_MAX_CF}文字以内にしてください`;
  if (passwordIsCommonCF(s)) return PW_COMMON_MSG_CF;
  if (passwordHasDateCF(s)) return PW_DATE_MSG_CF;
  return null;
}

module.exports = {
  NEW_PASSWORD_MIN_CF, NEW_PASSWORD_MAX_CF, PW_COMMON_MSG_CF, PW_DATE_MSG_CF, PW_COMMON_CF, PW_COMMON_CORES_CF,
  passwordHasDateCF, passwordIsCommonCF, newPasswordErrorCF,
  EMAIL_OTP_RATE_WINDOW_MS, EMAIL_OTP_RATE_LIMITS, EMAIL_OTP_TTL_MS, EMAIL_OTP_MAX_FAILS, EMAIL_OTP_FAIL_WINDOW_MS,
  EMAIL_OTP_EXHAUSTED_MSG, EMAIL_OTP_INVALID_MSG,
  emailOtpRateStep, emailOtpFailsOf, planEmailOtpSend, planEmailOtpVerify, emailOtpPurgeable, emailOtpRatePurgeable,
  COMPANY_LOGIN_MAX_FAILS, COMPANY_LOGIN_LOCK_BASE_MS, COMPANY_LOGIN_LOCK_MAX_MS, COMPANY_LOGIN_FAIL_RESET_MS,
  companyLoginLockMs, planCompanyLoginAttempt, companyLoginWaitMsg,
  isShopOwnerOf,
};
