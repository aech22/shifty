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

test("companyLogin の試行回数: 5回目から1分・試行のたびに倍・上限30分・待ちの間は数えない・24時間で数え直す", () => {
  const M = 60 * 1000;
  assert.deepStrictEqual([5, 6, 7, 8, 9, 10, 11, 50].map(S.companyLoginLockMs), [1, 2, 4, 8, 16, 30, 30, 30].map(x => x * M));
  let now = 1e12, rec = null;
  for (let i = 1; i <= 4; i++) {
    const st = S.planCompanyLoginAttempt(rec, now);
    assert.ok(st.ok && st.rec.fails === i && st.rec.lockedUntil === 0, `${i}回目は待ちなし`);
    rec = st.rec;
  }
  let st = S.planCompanyLoginAttempt(rec, now);
  assert.ok(st.ok && st.rec.fails === 5 && st.rec.lockedUntil === now + M, "5回目の試行で1分の待ち");
  rec = st.rec;
  st = S.planCompanyLoginAttempt(rec, now + 30 * 1000);
  assert.ok(!st.ok && st.waitMs === 30 * 1000, "待ちの間は通さない（記録も変えない）");
  assert.ok(/約1分後/.test(S.companyLoginWaitMsg(st.waitMs)) && /しばらく待ってから/.test(S.companyLoginWaitMsg(st.waitMs)));
  now += M;
  st = S.planCompanyLoginAttempt(rec, now);
  assert.ok(st.ok && st.rec.fails === 6 && st.rec.lockedUntil === now + 2 * M, "6回目は2分");
  rec = st.rec;
  for (let i = 0; i < 10; i++) { now = rec.lockedUntil; rec = S.planCompanyLoginAttempt(rec, now).rec; }
  assert.strictEqual(rec.lockedUntil - now, 30 * M, "上限30分");
  // 24時間たてば数え直す
  st = S.planCompanyLoginAttempt({ fails: 4, lockedUntil: 0, lastAt: now }, now + 24 * 60 * M);
  assert.ok(st.ok && st.rec.fails === 1);
  // 壊れた記録は0から
  assert.strictEqual(S.planCompanyLoginAttempt("x", now).rec.fails, 1);
});

test("companyLogin: 照合（scrypt）の前に試行を数え、成功で消す（functions/index.js のドリフト検出）", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "functions", "index.js"), "utf8");
  const start = src.indexOf("exports.companyLogin");
  const body = src.slice(start, src.indexOf("exports.changeCompanyPassword"));
  const iGate = body.indexOf("planCompanyLoginAttempt"), iVerify = body.indexOf("verifyPassword("), iReset = body.indexOf("failsRef.remove()");
  assert.ok(iGate > 0 && iVerify > iGate && iReset > iVerify, "数える → 照合 → 成功で消す の順");
  assert.ok(/private\/loginFails/.test(body), "置き場は companies/{id}/private（ルールで閉じている）");
});

test("genToken（スタッフURLのトークン）: crypto.getRandomValues で8文字・使う文字は32種類・Math.random を使わない", () => {
  const { genToken } = require("../app-utils.js");
  const CHARS = "abcdefghijkmnpqrstuvwxyz23456789";
  assert.strictEqual(CHARS.length, 32, "256 の約数なので剰余に偏りが出ない");
  const orig = globalThis.crypto.getRandomValues;
  let calls = 0;
  globalThis.crypto.getRandomValues = function (a) { calls++; return orig.call(globalThis.crypto, a); };
  const origRandom = Math.random;
  Math.random = () => { throw new Error("Math.random を使った"); };
  try {
    const seen = new Set();
    for (let i = 0; i < 2000; i++) {
      const t = genToken();
      assert.ok(t.length === 8 && [...t].every(c => CHARS.includes(c)), t);
      seen.add(t);
    }
    assert.strictEqual(seen.size, 2000, "2000個に重複が無い");
    assert.strictEqual(calls, 2000, "1回ごとに crypto.getRandomValues を呼ぶ");
  } finally {
    globalThis.crypto.getRandomValues = orig;
    Math.random = origRandom;
  }
  // 全32文字が出る（偏りの粗い確認）
  const counts = {};
  for (let i = 0; i < 4000; i++) for (const c of genToken()) counts[c] = (counts[c] || 0) + 1;
  assert.strictEqual(Object.keys(counts).length, 32);
  assert.ok(Math.min(...Object.values(counts)) > 32000 / 32 * 0.7, "各文字が平均の7割以上は出る");
});

test("verifyShopOwner: owners に uid があるときだけ許可・未claim（owners なし・空）は拒否", () => {
  assert.strictEqual(S.isShopOwnerOf({ u1: "KEY" }, "u1"), true);
  assert.strictEqual(S.isShopOwnerOf({ u1: "KEY" }, "u2"), false);
  assert.strictEqual(S.isShopOwnerOf(null, "u1"), false, "owners が無い店舗（2026-10-08 まで移行猶予で許可していた）");
  assert.strictEqual(S.isShopOwnerOf({}, "u1"), false);
  assert.strictEqual(S.isShopOwnerOf({ u1: "" }, "u1"), false);
  assert.strictEqual(S.isShopOwnerOf({ toString: "x" }, "toString"), true, "自分のキーとして持っているときだけ");
  assert.strictEqual(S.isShopOwnerOf({}, "toString"), false, "プロトタイプの名前は所有者にしない");
  assert.strictEqual(S.isShopOwnerOf({ u1: "K" }, undefined), false);
  const src = fs.readFileSync(path.join(__dirname, "..", "functions", "index.js"), "utf8");
  const body = src.slice(src.indexOf("async function verifyShopOwner"), src.indexOf("exports.createCheckoutSession"));
  assert.ok(/SEC\.isShopOwnerOf\(owners, decoded\.uid\)/.test(body), "verifyShopOwner はこの判定を通す");
  assert.ok(!/移行猶予として許可する/.test(body), "移行猶予の記述を残さない");
});
