// functions/security.js（認証まわりの回数の制限・2026-10-08）の純粋関数のテスト
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const S = require("../functions/security.js");

const H = 60 * 60 * 1000;

test("sendEmailOtp の送信回数: uid ごと・アドレスごとに1時間5回まで・窓が過ぎたら数え直す", () => {
  const now = 1e12;
  for (const kind of ["uid", "email"]) {
    let rec = null;
    for (let i = 1; i <= 5; i++) {
      const st = S.emailOtpRateStep(rec, now + i, kind);
      assert.ok(st.ok, `${kind}: ${i}回目は通る`);
      assert.strictEqual(st.rec.count, i);
      rec = st.rec;
    }
    const sixth = S.emailOtpRateStep(rec, now + 10, kind);
    assert.ok(!sixth.ok, `${kind}: 6回目は止まる`);
    assert.deepStrictEqual(sixth.rec, rec, "止めたときは記録を変えない");
    const later = S.emailOtpRateStep(rec, now + 1 + H, kind);
    assert.ok(later.ok && later.rec.count === 1, "1時間たてば数え直す");
  }
  assert.strictEqual(S.EMAIL_OTP_RATE_LIMITS.uid, 5);
  assert.strictEqual(S.EMAIL_OTP_RATE_LIMITS.email, 5);
});

test("確認コード: 再送しても誤りの回数を0に戻さない・5回で止める・1時間で戻る・正しいコードで消す", () => {
  const now = 1e12;
  let r = S.planEmailOtpSend({ prev: null, now, code: "123456", email: "a@example.com", emailLink: "L" });
  assert.strictEqual(r.record.attempts, 0);
  assert.strictEqual(r.record.expiry, now + S.EMAIL_OTP_TTL_MS);
  let otp = r.record;
  // 4回まちがえる
  for (let i = 1; i <= 4; i++) {
    const v = S.planEmailOtpVerify({ otp, code: "000000", now: now + i });
    assert.strictEqual(v.error.code, "invalid-argument");
    assert.strictEqual(v.patch.attempts, i);
    otp = v.patch;
  }
  // 再送しても4回のまま（以前は attempts:0 に戻っていた）
  r = S.planEmailOtpSend({ prev: otp, now: now + 100, code: "654321", email: "a@example.com", emailLink: "L2" });
  assert.strictEqual(r.record.attempts, 4, "再送で0に戻さない");
  assert.strictEqual(r.record.attemptsSince, otp.attemptsSince, "数え始めの時刻も持ち越す");
  otp = r.record;
  // 5回目の誤りで止まり、コードを消す
  let v = S.planEmailOtpVerify({ otp, code: "000000", now: now + 200 });
  assert.strictEqual(v.error.code, "resource-exhausted");
  assert.strictEqual(v.patch.attempts, 5);
  assert.ok(!("code" in v.patch), "上限に達したらコードを消す");
  otp = v.patch;
  // 止まっている間は正しいコードでも通らず、再送もできない
  assert.strictEqual(S.planEmailOtpVerify({ otp: { ...otp, code: "654321", expiry: now + 1e6 }, code: "654321", now: now + 300 }).error.code, "resource-exhausted");
  assert.strictEqual(S.planEmailOtpSend({ prev: otp, now: now + 300, code: "111111" }).error.code, "resource-exhausted");
  // 1時間たてば送れて、回数は0から
  r = S.planEmailOtpSend({ prev: otp, now: now + 1 + H, code: "222222", email: "a@example.com", emailLink: "L3" });
  assert.strictEqual(r.record.attempts, 0);
  v = S.planEmailOtpVerify({ otp: r.record, code: " 222222 ", now: now + 2 + H });
  assert.deepStrictEqual(v.result, { emailLink: "L3", email: "a@example.com" });
  assert.strictEqual(v.patch, null, "正しいコードで記録を消す");
  // 期限切れ・記録なしは無効（回数は変えない）
  assert.strictEqual(S.planEmailOtpVerify({ otp: { ...r.record, expiry: now }, code: "222222", now: now + 2 + H }).error.code, "invalid-argument");
  assert.strictEqual(S.planEmailOtpVerify({ otp: null, code: "222222", now }).patch, undefined);
  // コードの形がおかしい送信は作らない
  assert.strictEqual(S.planEmailOtpSend({ prev: null, now, code: "12345" }).error.code, "internal");
});

test("確認コード: 掃除は誤りの回数を持ち越している間は消さない・送信回数は窓が過ぎたら消す", () => {
  const now = 1e12;
  assert.ok(S.emailOtpPurgeable({ expiry: now - 1, attempts: 0, attemptsSince: now - 10 }, now));
  assert.ok(!S.emailOtpPurgeable({ expiry: now - 1, attempts: 3, attemptsSince: now - 10 }, now), "持ち越し中は残す");
  assert.ok(S.emailOtpPurgeable({ expiry: now - 1, attempts: 3, attemptsSince: now - H }, now), "1時間たてば消す");
  assert.ok(!S.emailOtpPurgeable({ expiry: now + 1 }, now), "有効なコードは消さない");
  assert.ok(S.emailOtpPurgeable({}, now), "期限の無い記録は消す（従来どおり）");
  assert.ok(S.emailOtpRatePurgeable({ count: 5, windowStart: now - H }, now));
  assert.ok(!S.emailOtpRatePurgeable({ count: 5, windowStart: now - 10 }, now));
  assert.ok(S.emailOtpRatePurgeable(null, now));
});

test("sendEmailOtp: コードは crypto.randomInt で作り、Math.random を使わない（functions/index.js のドリフト検出）", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "functions", "index.js"), "utf8");
  const start = src.indexOf("exports.sendEmailOtp");
  const end = src.indexOf("exports.verifyEmailOtp");
  assert.ok(start > 0 && end > start);
  const body = src.slice(start, end);
  assert.ok(/crypto\.randomInt\(100000, 1000000\)/.test(body));
  assert.ok(!/Math\.random/.test(body));
  assert.ok(/emailOtpRate\("uid"/.test(body) && /emailOtpRate\("email"/.test(body), "uid とアドレスの両方で数える");
});
