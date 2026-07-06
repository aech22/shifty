// Shifty コアユーティリティのユニットテスト（node:test）
// 実行: npm test（= node --test tests/）
// 対象: app-utils.js（純粋関数・ブラウザAPI非依存）
const { test } = require("node:test");
const assert = require("node:assert");
const u = require("../app-utils.js");

test("calcNetWorkMinutes: 通常 10:00-15:00 = 300分", () => {
  assert.strictEqual(u.calcNetWorkMinutes({ status: "work", start: "10:00", end: "15:00" }, []), 300);
});

test("calcNetWorkMinutes: 休憩12:00-13:00を控除 = 240分", () => {
  assert.strictEqual(
    u.calcNetWorkMinutes({ status: "work", start: "10:00", end: "15:00" }, [{ start: "12:00", end: "13:00" }]),
    240
  );
});

test("calcNetWorkMinutes: 出勤開始後の休憩のみ控除（出勤前休憩は無視）", () => {
  // 出勤10:00、休憩09:00-09:30(出勤前)は控除しない → 300分のまま
  assert.strictEqual(
    u.calcNetWorkMinutes({ status: "work", start: "10:00", end: "15:00" }, [{ start: "09:00", end: "09:30" }]),
    300
  );
});

test("calcNetWorkMinutes: overtimeMins を退勤に加算", () => {
  assert.strictEqual(u.calcNetWorkMinutes({ status: "work", start: "10:00", end: "15:00" }, [], 30), 330);
});

test("calcNetWorkMinutes: adjustedStart/adjustedEnd を優先", () => {
  assert.strictEqual(
    u.calcNetWorkMinutes(
      { status: "work", start: "10:00", end: "15:00", adjustedStart: "11:00", adjustedEnd: "14:00" },
      []
    ),
    180
  );
});

test("calcNetWorkMinutes: end<=start は 0", () => {
  assert.strictEqual(u.calcNetWorkMinutes({ status: "work", start: "15:00", end: "10:00" }, []), 0);
});

test("calcNetWorkMinutes: status!=work は 0", () => {
  assert.strictEqual(u.calcNetWorkMinutes({ status: "holiday", start: "10:00", end: "15:00" }, []), 0);
});

test("shiftBandInfo: ランチのみ 10:00-14:00 → attendance 0.5", () => {
  const r = u.shiftBandInfo({ status: "work", start: "10:00", end: "14:00" });
  assert.strictEqual(r.attendance, 0.5);
  assert.strictEqual(r.hasLunch, true);
  assert.strictEqual(r.hasDinner, false);
});

test("shiftBandInfo: 通し 10:00-23:00 → attendance 1", () => {
  const r = u.shiftBandInfo({ status: "work", start: "10:00", end: "23:00" });
  assert.strictEqual(r.attendance, 1);
  assert.strictEqual(r.hasLunch, true);
  assert.strictEqual(r.hasDinner, true);
});

test("shiftBandInfo: 9時間以上 08:00-17:00（ディナー帯なし・540分）→ attendance 1", () => {
  const r = u.shiftBandInfo({ status: "work", start: "08:00", end: "17:00" });
  assert.strictEqual(r.attendance, 1);
  assert.strictEqual(r.hasDinner, false); // 1020分ちょうどで > 1020 ではない
});

test("getBreaksFor: 非適格（ランチのみ）→ []", () => {
  const settings = { breakTimes: { weekday: [{ start: "15:00", end: "16:00" }] } };
  assert.deepStrictEqual(
    u.getBreaksFor(settings, "2026-07-06", "A", { status: "work", start: "10:00", end: "14:00" }),
    []
  );
});

test("getBreaksFor: 属性タグフィルタ（employee向け休憩をparttimeは受け取らない）", () => {
  const settings = {
    breakTimes: { weekday: [{ start: "18:00", end: "19:00", tags: ["employee"] }] },
    staffAttributes: { A: "parttime" },
  };
  assert.deepStrictEqual(
    u.getBreaksFor(settings, "2026-07-06", "A", { status: "work", start: "10:00", end: "23:00" }),
    []
  );
});

test("getBreaksFor: 出勤開始が休憩開始以降 → 適用しない", () => {
  const settings = { breakTimes: { weekday: [{ start: "12:00", end: "13:00" }] } };
  // 出勤13:00 → 休憩12:00開始は適用外
  assert.deepStrictEqual(
    u.getBreaksFor(settings, "2026-07-06", "A", { status: "work", start: "13:00", end: "23:00" }),
    []
  );
  // 出勤10:00 → 休憩12:00開始は適用
  assert.deepStrictEqual(
    u.getBreaksFor(settings, "2026-07-06", "A", { status: "work", start: "10:00", end: "23:00" }),
    [{ start: "12:00", end: "13:00" }]
  );
});

test("isHoliday: 2026-01-01 = true（元日）", () => {
  assert.strictEqual(u.isHoliday("2026-01-01"), true);
});

test("isHoliday: 2028-09-22 = true（今回追加分）", () => {
  assert.strictEqual(u.isHoliday("2028-09-22"), true);
});

test("isHoliday: 2026-07-07 = false（平日）", () => {
  assert.strictEqual(u.isHoliday("2026-07-07"), false);
});

test("resolveAlias: 別名 → 登録名", () => {
  assert.strictEqual(u.resolveAlias("たろ", { "田中太郎": ["たろ", "タロー"] }), "田中太郎");
});

test("resolveAlias: 未知名はそのまま", () => {
  assert.strictEqual(u.resolveAlias("未知", { "田中太郎": ["たろ"] }), "未知");
});

test("sc: closed が末尾に来る", () => {
  const sorted = u.sc([
    { closed: true },
    { start: "18:00", end: "23:00" },
    { start: "10:00", end: "15:00" },
  ]);
  assert.strictEqual(sorted[0].start, "10:00");
  assert.strictEqual(sorted[1].start, "18:00");
  assert.strictEqual(sorted[2].closed, true);
});

test("gd: 正常な範囲は日付配列を返す", () => {
  assert.deepStrictEqual(u.gd("2026-06-01", "2026-06-03"), ["2026-06-01", "2026-06-02", "2026-06-03"]);
});

test("gd: startDate/endDate が undefined でも例外を投げず [] を返す（PeriodsTabクラッシュ防止）", () => {
  assert.deepStrictEqual(u.gd(undefined, "2026-06-03"), []);
  assert.deepStrictEqual(u.gd("2026-06-01", undefined), []);
  assert.deepStrictEqual(u.gd(undefined, undefined), []);
  assert.deepStrictEqual(u.gd("", ""), []);
});

test("pd: 非文字列は例外を投げず Invalid Date を返す", () => {
  assert.ok(Number.isNaN(u.pd(undefined).getTime()));
  assert.ok(Number.isNaN(u.pd("").getTime()));
});
