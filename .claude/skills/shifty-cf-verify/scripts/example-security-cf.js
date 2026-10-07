// 実例: セキュリティ強化（2026-10-08）の Cloud Functions を本物のまま実行する。
//   1. sendEmailOtp / verifyEmailOtp: 送信回数（uid ごと・アドレスごとに1時間5回）・乱数のコード・再送しても誤りの回数を持ち越す・掃除
//   2. companyLogin: 企業コードごとの試行回数（5回目から1分・倍・上限30分）・待ちの間は scrypt を回さない・成功で数え直す
// 許可側（従来の正しい呼び出しが通る）と拒否側（上限・ロック）を1項目ずつ通す。
// 使い方: SHIFTY_CF_INDEX=<worktree>/functions/index.js node example-security-cf.js
// 反証: SHIFTY_CF_INDEX に 1bc0b4f の functions/index.js を渡すと落ちる（上限が無い・再送で回数が戻る）。
"use strict";
const { loadFunctions, callFn, callRun, makeChecker } = require("./cf-harness.js");
const crypto = require("crypto");
// scrypt の呼び出し回数を数える（functions/index.js の verifyPassword が呼ぶ。同じ crypto モジュールを共有する）
let scryptCalls = 0;
const origScrypt = crypto.scryptSync;
crypto.scryptSync = function (...a) { scryptCalls++; return origScrypt.apply(this, a); };
function hashPw(plain) { const salt = "0123456789abcdef0123456789abcdef"; return `${salt}:${origScrypt(String(plain), salt, 64).toString("hex")}`; }

const INDEX = process.env.SHIFTY_CF_INDEX || undefined;
const user = (uid, email) => ({ auth: { uid, token: { email: email || `${uid}@example.com`, firebase: { sign_in_provider: "password" } } } });
const check = makeChecker();

async function sectionEmailOtp() {
  const h = loadFunctions({ indexPath: INDEX, data: {} });
  const send = (uid, email) => callFn(h.fns.sendEmailOtp, { email }, user(uid));
  const verify = (uid, code) => callFn(h.fns.verifyEmailOtp, { code }, user(uid));

  let r = await callFn(h.fns.sendEmailOtp, { email: "a@example.com" }, {});
  check("OTP: 未認証は拒否", !r.ok && r.code === "unauthenticated", r);

  // 正しい流れ（従来どおり）: 送る → 正しいコードで emailLink が返り、記録が消える
  r = await send("ok1", "ok1@example.com");
  const rec = h.db.get("email_otps/ok1");
  check("OTP: 送信が通り、6桁のコードと10分の期限が入る", r.ok && /^[0-9]{6}$/.test(rec.code) && rec.attempts === 0 && rec.expiry > Date.now() + 9 * 60 * 1000, { r, rec });
  check("OTP: メールにそのコードが載る", h.mails.length === 1 && h.mails[0].text.includes(rec.code) && h.mails[0].to === "ok1@example.com", h.mails);
  r = await verify("ok1", rec.code);
  check("OTP: 正しいコードで emailLink が返り、記録が消える", r.ok && r.res.email === "ok1@example.com" && /emailLink/.test(r.res.emailLink) && h.db.get("email_otps/ok1") == null, r);

  // uid ごとの上限: 違うアドレスへ5回は通り、6回目は止まる
  let okCount = 0;
  for (let i = 1; i <= 5; i++) { r = await send("u1", `a${i}@example.com`); if (r.ok) okCount++; }
  check("OTP: 同じ uid から1時間に5回までは送れる", okCount === 5, okCount);
  const mailsBefore = h.mails.length;
  r = await send("u1", "a6@example.com");
  check("OTP: 同じ uid の6回目は resource-exhausted・メールを送らない", !r.ok && r.code === "resource-exhausted" && h.mails.length === mailsBefore, r);

  // アドレスごとの上限: 別々の uid から同じアドレスへ5回、6回目（大文字小文字違い）は止まる
  okCount = 0;
  for (let i = 2; i <= 6; i++) { r = await send(`u${i}`, "target@example.com"); if (r.ok) okCount++; }
  check("OTP: 同じアドレスへは1時間に5回まで", okCount === 5, okCount);
  r = await send("u7", "TARGET@example.com");
  check("OTP: 同じアドレスの6回目は uid が新しくても止まる（大文字小文字は同じアドレス）", !r.ok && r.code === "resource-exhausted", r);
  const rateKeys = Object.keys(h.db.get("emailOtpRate") || {});
  check("OTP: 回数は emailOtpRate（CF 専用のパス）に uid と email の鍵で入り、生のアドレスは鍵に入らない",
    rateKeys.some(k => k.startsWith("uid_")) && rateKeys.some(k => k.startsWith("email_")) && rateKeys.every(k => !k.includes("@")) && h.db.get("staffPageEmailRate") == null, rateKeys);

  // 再送しても誤りの回数を0に戻さない
  await send("v1", "v1@example.com");
  for (let i = 0; i < 4; i++) await verify("v1", "000000" === h.db.get("email_otps/v1/code") ? "111111" : "000000");
  check("OTP: 4回まちがえると attempts=4", h.db.get("email_otps/v1/attempts") === 4, h.db.get("email_otps/v1"));
  r = await send("v1", "v1@example.com");
  check("OTP: 再送しても attempts は 4 のまま（以前は0に戻った）", r.ok && h.db.get("email_otps/v1/attempts") === 4, h.db.get("email_otps/v1"));
  const code2 = h.db.get("email_otps/v1/code");
  r = await verify("v1", code2 === "000000" ? "111111" : "000000");
  check("OTP: 5回目の誤りで resource-exhausted・コードが消える", !r.ok && r.code === "resource-exhausted" && h.db.get("email_otps/v1/code") == null, { r, rec: h.db.get("email_otps/v1") });
  r = await verify("v1", code2);
  check("OTP: 止まっている間は正しいコードでも通らない", !r.ok && r.code === "resource-exhausted", r);
  const m2 = h.mails.length;
  r = await send("v1", "v1@example.com");
  check("OTP: 止まっている間は再送もしない（メールを送らない）", !r.ok && r.code === "resource-exhausted" && h.mails.length === m2, r);
  // 1時間たてば送れる（数え始めの時刻を1時間前へずらす）
  h.db.put("email_otps/v1/attemptsSince", Date.now() - 61 * 60 * 1000);
  r = await send("v1", "v1@example.com");
  check("OTP: 1時間たてば再送でき、回数は0から", r.ok && h.db.get("email_otps/v1/attempts") === 0, h.db.get("email_otps/v1"));

  // 毎日の掃除: 誤りを持ち越している記録は残し、窓の過ぎた送信回数は消す
  const now = Date.now();
  h.db.put("email_otps/p1", { code: null, expiry: now - 1000, attempts: 5, attemptsSince: now - 1000 });
  h.db.put("email_otps/p2", { code: "123456", expiry: now - 1000, attempts: 0, attemptsSince: now - 5000 });
  h.db.put("emailOtpRate/uid_old", { count: 5, windowStart: now - 2 * 60 * 60 * 1000 });
  h.db.put("emailOtpRate/uid_new", { count: 5, windowStart: now - 1000 });
  r = await callRun(h.fns.purgeInactiveShops);
  check("掃除: 誤りを持ち越している OTP は残し、期限切れの OTP は消す", r.ok && h.db.get("email_otps/p1") != null && h.db.get("email_otps/p2") == null, { r, p1: h.db.get("email_otps/p1") });
  check("掃除: 窓の過ぎた送信回数は消し、窓の中は残す", h.db.get("emailOtpRate/uid_old") == null && h.db.get("emailOtpRate/uid_new") != null, h.db.get("emailOtpRate"));
}

async function sectionCompanyLogin() {
  const CID = "-Nco1";
  const h = loadFunctions({ indexPath: INDEX, data: {
    companyCodes: { ABCD2345: CID },
    companies: { [CID]: { pub: { name: "テスト企業", ownerUid: "OWN", shops: {} }, private: { passwordHash: hashPw("correct-pw") } } },
  } });
  const login = (password, code = "abcd2345") => callFn(h.fns.companyLogin, { code, password }, {});
  const fails = () => h.db.get(`companies/${CID}/private/loginFails`);

  let r = await login("correct-pw");
  check("login: 正しいパスワードでカスタムトークンが返る（従来どおり）", r.ok && r.res.token && r.res.companyId === CID && fails() == null, { r, f: fails() });
  for (let i = 1; i <= 4; i++) r = await login("wrong");
  check("login: 4回の誤りは permission-denied・待ちなし", !r.ok && r.code === "permission-denied" && (fails() || {}).fails === 4 && (fails() || {}).lockedUntil === 0, { r, f: fails() });
  r = await login("wrong");
  const until = (fails() || {}).lockedUntil;
  check("login: 5回目の誤りで1分の待ちが入る", !r.ok && r.code === "permission-denied" && until > Date.now() + 50 * 1000 && until <= Date.now() + 60 * 1000, { r, f: fails() });
  const s0 = scryptCalls;
  check("login: scrypt の計数が効いている（ここまでの照合6回ぶん以上）", s0 >= 6, s0);
  r = await login("correct-pw");
  check("login: 待ちの間は正しいパスワードでも resource-exhausted（しばらく待ってから）", !r.ok && r.code === "resource-exhausted" && /しばらく待ってから/.test(r.msg) && /約1分後/.test(r.msg), r);
  check("login: 待ちの間は scrypt を回さない", scryptCalls === s0, { scryptCalls, s0 });
  check("login: 待ちの間の試行は数えない（記録が変わらない）", (fails() || {}).fails === 5 && (fails() || {}).lockedUntil === until, fails());
  // 待ちが過ぎた後の誤りは2分
  h.db.put(`companies/${CID}/private/loginFails/lockedUntil`, Date.now() - 1);
  r = await login("wrong");
  const w2 = (fails() || {}).lockedUntil - Date.now();
  check("login: 6回目の誤りで待ちが倍（2分）", !r.ok && r.code === "permission-denied" && (fails() || {}).fails === 6 && w2 > 110 * 1000 && w2 <= 120 * 1000, { r, f: fails() });
  // 上限30分
  h.db.put(`companies/${CID}/private/loginFails`, { fails: 20, lockedUntil: Date.now() - 1, lastAt: Date.now() - 1000 });
  r = await login("wrong");
  const w3 = (fails() || {}).lockedUntil - Date.now();
  check("login: 待ちの上限は30分", !r.ok && w3 > 29 * 60 * 1000 && w3 <= 30 * 60 * 1000, { r, f: fails() });
  // 待ちが過ぎれば正しいパスワードで入れて、数え直す
  h.db.put(`companies/${CID}/private/loginFails/lockedUntil`, Date.now() - 1);
  r = await login("correct-pw");
  check("login: 待ちが過ぎれば正しいパスワードで入れて、記録を消す（数え直す）", r.ok && r.res.token && fails() == null, { r, f: fails() });
  r = await login("x", "NOPE9999");
  check("login: 存在しない企業コードは not-found", !r.ok && r.code === "not-found", r);
  r = await login("x", "AB.CD/12");
  check("login: 形のおかしい企業コードは DB を読まずに not-found（throw しない）", !r.ok && r.code === "not-found", r);
  check("login: 試行回数は private の下にだけ書く", h.db.get(`companies/${CID}/pub/loginFails`) == null, h.db.get(`companies/${CID}/pub`));
}

(async () => {
  await sectionEmailOtp();
  await sectionCompanyLogin();
  check.done();
})().catch(e => { console.error(e); process.exit(1); });
