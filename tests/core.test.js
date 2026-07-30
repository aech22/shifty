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

test("getBreaksFor: シフト終了後に始まる休憩は重ならないため適用しない", () => {
  const settings = { breakTimes: { weekday: [{ start: "15:00", end: "16:00" }] } };
  assert.deepStrictEqual(
    u.getBreaksFor(settings, "2026-07-06", "A", { status: "work", start: "10:00", end: "14:00" }),
    []
  );
});

test("getBreaksFor: 9時間未満・ランチのみの短時間シフトでも休憩を完全にまたいでいれば適用する（出勤日数attendanceによる全か無かの判定は廃止）", () => {
  const settings = { breakTimes: { weekday: [{ start: "12:00", end: "13:00" }] } };
  // 10:00-14:00 = 4時間（attendance 0.5 相当・旧ロジックなら[]だった）だが、休憩12:00-13:00を丸ごとまたぐため適用する
  assert.deepStrictEqual(
    u.getBreaksFor(settings, "2026-07-06", "A", { status: "work", start: "10:00", end: "14:00" }),
    [{ start: "12:00", end: "13:00" }]
  );
});

test("getBreaksFor: ランチのみ（退勤=休憩終了と同時刻）は適用しない", () => {
  const settings = { breakTimes: { weekday: [{ start: "15:00", end: "17:00" }] } };
  // 10:00-17:00: 休憩の後半（17時以降）に及ばないため適用しない
  assert.deepStrictEqual(
    u.getBreaksFor(settings, "2026-07-06", "A", { status: "work", start: "10:00", end: "17:00" }),
    []
  );
});

test("getBreaksFor: ランチのみ（退勤が休憩の途中）も適用しない", () => {
  const settings = { breakTimes: { weekday: [{ start: "15:00", end: "17:00" }] } };
  // 10:00-16:00: 休憩終了(17:00)より前に退勤するため適用しない
  assert.deepStrictEqual(
    u.getBreaksFor(settings, "2026-07-06", "A", { status: "work", start: "10:00", end: "16:00" }),
    []
  );
});

test("getBreaksFor: ディナーのみ（出勤=休憩開始と同時刻）は適用しない", () => {
  const settings = { breakTimes: { weekday: [{ start: "15:00", end: "17:00" }] } };
  // 15:00-23:00: 休憩の前半（15時より前）に及ばないため適用しない
  assert.deepStrictEqual(
    u.getBreaksFor(settings, "2026-07-06", "A", { status: "work", start: "15:00", end: "23:00" }),
    []
  );
});

test("getBreaksFor: 通し勤務（休憩を完全にまたぐ）は適用する", () => {
  const settings = { breakTimes: { weekday: [{ start: "15:00", end: "17:00" }] } };
  // 10:00-23:00: 出勤が休憩開始(15:00)より前・退勤が休憩終了(17:00)より後 → 適用
  assert.deepStrictEqual(
    u.getBreaksFor(settings, "2026-07-06", "A", { status: "work", start: "10:00", end: "23:00" }),
    [{ start: "15:00", end: "17:00" }]
  );
});

test("回帰: 退勤時間を減らすと期間別勤務時間が増える不具合（境界9時間の崖）が解消されている", () => {
  const settings = { breakTimes: { weekday: [{ start: "12:00", end: "13:00" }] } };
  const breaksFull = u.getBreaksFor(settings, "2026-07-10", "A", { status: "work", start: "08:00", end: "17:00" });
  const netFull = u.calcNetWorkMinutes({ status: "work", start: "08:00", end: "17:00" }, breaksFull);
  const breaksReduced = u.getBreaksFor(settings, "2026-07-10", "A", { status: "work", start: "08:00", end: "16:55" });
  const netReduced = u.calcNetWorkMinutes({ status: "work", start: "08:00", end: "16:55" }, breaksReduced);
  // 退勤を17:00→16:55（5分減）にしたら、純勤務時間も5分減るのが正しい（480→475）。
  // 旧ロジックでは9時間(540分)の閾値を下回って休憩控除ごと消え、480→535に増えていた。
  assert.strictEqual(netFull, 480);
  assert.strictEqual(netReduced, 475);
  assert.ok(netReduced < netFull, "退勤時間を減らしたのに純勤務時間が増えてはいけない");
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

test("getBreaksFor: 差し替え方式（属性一致のタグ付き休憩がある場合、タグなし休憩は適用しない）", () => {
  const settings = {
    breakTimes: { weekday: [
      { start: "12:00", end: "13:00" },
      { start: "12:30", end: "13:30", tags: ["employee"] },
    ]},
    staffAttributes: { "社員A": "employee", "バイトB": "parttime" },
  };
  const shift = { status: "work", start: "10:00", end: "22:00" };
  // 社員A: タグ付き休憩のみ（タグなしは差し替えで除外）
  assert.deepStrictEqual(
    u.getBreaksFor(settings, "2026-07-06", "社員A", shift),
    [{ start: "12:30", end: "13:30", tags: ["employee"] }]
  );
  // バイトB: 従来どおりタグなし休憩が適用
  assert.deepStrictEqual(
    u.getBreaksFor(settings, "2026-07-06", "バイトB", shift),
    [{ start: "12:00", end: "13:00" }]
  );
});

test("getBreaksFor: 差し替えは日区分単位（出勤開始フィルタでタグ付きが外れてもタグなしは復活しない）", () => {
  const settings = {
    breakTimes: { weekday: [
      { start: "15:00", end: "16:00" },
      { start: "12:00", end: "13:00", tags: ["employee"] },
    ]},
    staffAttributes: { A: "employee" },
  };
  assert.deepStrictEqual(
    u.getBreaksFor(settings, "2026-07-06", "A", { status: "work", start: "13:00", end: "23:00" }),
    []
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

// ===== extractNote / セルコマンドレジストリ（シフト作成タブ） =====

test("extractNote: 時間のみ", () => {
  assert.deepStrictEqual(u.extractNote("9"), { numeric: "9", note: "", rest: false, hasFixed: false });
  assert.deepStrictEqual(u.extractNote("9:30"), { numeric: "9:30", note: "", rest: false, hasFixed: false });
});

test("extractNote: 登録サフィックス(h/k/x)は小文字に正規化", () => {
  assert.strictEqual(u.extractNote("9H").note, "h");
  assert.strictEqual(u.extractNote("930k").note, "k");
  assert.strictEqual(u.extractNote("9.5X").note, "x");
});

test("extractNote: コマンド以外の文字のみはメモとしてそのまま保持", () => {
  assert.deepStrictEqual(u.extractNote("三"), { numeric: "", note: "三", rest: false, hasFixed: false });
  assert.deepStrictEqual(u.extractNote("研修"), { numeric: "", note: "研修", rest: false, hasFixed: false });
  assert.deepStrictEqual(u.extractNote("AB"), { numeric: "", note: "AB", rest: false, hasFixed: false });
});

test("extractNote: x単体・登録サフィックス単体はカウント外(x)に収束", () => {
  // 時間なしのx/h/k単体はメモではなくカウント外マーカーとして扱う（数字なしでは所属上書きの意味を持たないため）
  for (const v of ["x", "X", "h", "k"]) assert.strictEqual(u.extractNote(v).note, "x", `input: ${v}`);
});

test("extractNote: 任意サフィックスはそのまま保持", () => {
  assert.deepStrictEqual(u.extractNote("9三"), { numeric: "9", note: "三", rest: false, hasFixed: false });
});

test("extractNote: y/休 は休み希望コマンド（時間付き9yは通常サフィックス）", () => {
  for (const v of ["y", "Y", "ｙ", "休", " y "]) assert.strictEqual(u.extractNote(v).rest, true, `input: ${v}`);
  assert.strictEqual(u.extractNote("9y").rest, false);
  assert.strictEqual(u.extractNote("9y").note, "y");
  assert.strictEqual(u.extractNote("").rest, false);
});

test("isRestCommand: y/ｙ/休のみtrue", () => {
  assert.strictEqual(u.isRestCommand("y"), true);
  assert.strictEqual(u.isRestCommand("休"), true);
  assert.strictEqual(u.isRestCommand("9"), false);
  assert.strictEqual(u.isRestCommand("x"), false);
  assert.strictEqual(u.isRestCommand(""), false);
  assert.strictEqual(u.isRestCommand(null), false);
});

test("CELL_COMMANDS: レジストリの完全性（レジェンド自動生成に必要なフィールドが揃っている）", () => {
  assert.ok(Array.isArray(u.CELL_COMMANDS) && u.CELL_COMMANDS.length >= 4);
  u.CELL_COMMANDS.forEach(c => {
    assert.ok(c.key && c.kind && c.usage && c.label && c.desc, `registry entry incomplete: ${JSON.stringify(c)}`);
  });
  // パーサが認識する予約サフィックス・休みコマンドがすべて登録されている
  ["h", "k", "x"].forEach(k => assert.ok(u.CELL_COMMANDS.some(c => c.kind === "suffix" && c.key === k), `suffix ${k} missing`));
  assert.ok(u.CELL_COMMANDS.some(c => c.kind === "rest" && c.key === "y"), "rest command y missing");
  // レジストリと実装の乖離防止: 登録済みサフィックスは extractNote が正規化して認識する
  u.CELL_COMMANDS.filter(c => c.kind === "suffix").forEach(c => {
    assert.strictEqual(u.extractNote("9" + c.key.toUpperCase()).note, c.key, `suffix ${c.key} not recognized`);
  });
  u.CELL_COMMANDS.filter(c => c.kind === "rest").forEach(c => {
    assert.strictEqual(u.extractNote(c.key).rest, true, `rest ${c.key} not recognized`);
  });
});

test("CELL_COLOR_LEGEND: 完全性（色または斜線+説明が揃っている）", () => {
  ["changed", "dup", "note", "rest"].forEach(k => assert.ok(u.CELL_COLOR_LEGEND.some(c => c.key === k), `legend ${k} missing`));
  u.CELL_COLOR_LEGEND.forEach(c => assert.ok(c.label && c.desc && (c.color || c.hatch), `legend entry incomplete: ${c.key}`));
});

// ===== fixedShiftCommandFor / isFixedShiftEligibleShop（東通り店専用「締」コマンド）=====

test("fixedShiftCommandFor: 「締」は23:00〜25:00固定コマンドとして認識される", () => {
  const cmd = u.fixedShiftCommandFor("締");
  assert.ok(cmd, "締 should resolve to a fixed-shift command");
  assert.strictEqual(cmd.start, "23:00");
  assert.strictEqual(cmd.end, "25:00");
  assert.strictEqual(u.fixedShiftCommandFor(" 締 ").start, "23:00"); // 前後空白は無視
});

test("fixedShiftCommandFor: 未登録の文字列・空文字はnull", () => {
  assert.strictEqual(u.fixedShiftCommandFor("9締"), null); // 数値付きは全体一致しないため対象外
  assert.strictEqual(u.fixedShiftCommandFor("三"), null);
  assert.strictEqual(u.fixedShiftCommandFor(""), null);
  assert.strictEqual(u.fixedShiftCommandFor(null), null);
});

test("isFixedShiftEligibleShop: 店舗名に「鷄えん東通り」または「東通り」を含む場合のみtrue", () => {
  assert.strictEqual(u.isFixedShiftEligibleShop("鷄えん東通り店"), true);
  assert.strictEqual(u.isFixedShiftEligibleShop("東通り店"), true);
  assert.strictEqual(u.isFixedShiftEligibleShop("鷄えん本店"), false);
  assert.strictEqual(u.isFixedShiftEligibleShop(""), false);
  assert.strictEqual(u.isFixedShiftEligibleShop(null), false);
  assert.strictEqual(u.isFixedShiftEligibleShop(undefined), false);
});

test("CELL_COMMANDS: 「締」固定シフトコマンドが登録されている", () => {
  assert.ok(u.CELL_COMMANDS.some(c => c.kind === "fixed" && c.key === "締" && c.start === "23:00" && c.end === "25:00"));
});

test("extractNote: 数字と組み合わせた「17締」は numeric=17・note=''・hasFixed=true", () => {
  const r = u.extractNote("17締");
  assert.strictEqual(r.numeric, "17");
  assert.strictEqual(r.note, "");
  assert.strictEqual(r.hasFixed, true);
  assert.strictEqual(r.rest, false);
});

test("extractNote: 単独の「締」は numeric=''・note=''・hasFixed=true（従来のヘルプ(x)には収束しない）", () => {
  const r = u.extractNote("締");
  assert.strictEqual(r.numeric, "");
  assert.strictEqual(r.note, "");
  assert.strictEqual(r.hasFixed, true);
  assert.strictEqual(r.rest, false);
});

test("extractNote: 締めを含まない未登録の文字だけの入力(三)はメモとして保持・hasFixed=false", () => {
  const r = u.extractNote("三");
  assert.strictEqual(r.note, "三");
  assert.strictEqual(r.hasFixed, false);
});

test("extractNote: 「16k締」のように他コマンドと併用すると note='k'・hasFixed=true（順序不問）", () => {
  const r1 = u.extractNote("16k締");
  assert.strictEqual(r1.numeric, "16");
  assert.strictEqual(r1.note, "k");
  assert.strictEqual(r1.hasFixed, true);
  const r2 = u.extractNote("16締k"); // 逆順でも同じ結果
  assert.strictEqual(r2.numeric, "16");
  assert.strictEqual(r2.note, "k");
  assert.strictEqual(r2.hasFixed, true);
});

test("extractNote: 「9三締」のように略称と締めを併用すると note='三'・hasFixed=true", () => {
  const r = u.extractNote("9三締");
  assert.strictEqual(r.numeric, "9");
  assert.strictEqual(r.note, "三");
  assert.strictEqual(r.hasFixed, true);
});

test("extractNote: 締めを含まない通常入力はhasFixed=false", () => {
  assert.strictEqual(u.extractNote("9h").hasFixed, false);
  assert.strictEqual(u.extractNote("9").hasFixed, false);
  assert.strictEqual(u.extractNote("").hasFixed, false);
});

// ===== calcNetWorkMinutes / shiftBandInfo: extraStart/extraEnd（「締」による追加出勤）=====

test("calcNetWorkMinutes: 主シフト(13:00-17:00)+追加出勤(23:00-25:00)を合算=360分", () => {
  const min = u.calcNetWorkMinutes({ status: "work", adjustedStart: "13:00", adjustedEnd: "17:00", extraStart: "23:00", extraEnd: "25:00" }, []);
  assert.strictEqual(min, 360);
});

test("calcNetWorkMinutes: 主シフトなし・追加出勤のみ(23:00-25:00)=120分", () => {
  const min = u.calcNetWorkMinutes({ status: "work", extraStart: "23:00", extraEnd: "25:00" }, []);
  assert.strictEqual(min, 120);
});

test("calcNetWorkMinutes: extraStart/extraEndが逆転(不正)なら加算しない", () => {
  const min = u.calcNetWorkMinutes({ status: "work", adjustedStart: "13:00", adjustedEnd: "17:00", extraStart: "25:00", extraEnd: "23:00" }, []);
  assert.strictEqual(min, 240);
});

test("calcNetWorkMinutes: extraStart/extraEndなしは従来通り（回帰なし）", () => {
  assert.strictEqual(u.calcNetWorkMinutes({ status: "work", start: "10:00", end: "15:00" }, []), 300);
});

test("shiftBandInfo: 主シフト(ランチのみ13-17)+追加出勤(23-25・ディナー帯)→ hasLunch/hasDinner両方trueでattendance=1", () => {
  const r = u.shiftBandInfo({ status: "work", adjustedStart: "13:00", adjustedEnd: "17:00", extraStart: "23:00", extraEnd: "25:00" });
  assert.strictEqual(r.hasLunch, true);
  assert.strictEqual(r.hasDinner, true);
  assert.strictEqual(r.attendance, 1);
});

test("shiftBandInfo: 追加出勤(23-25)のみ→ hasDinner=true・attendance=0.5", () => {
  const r = u.shiftBandInfo({ status: "work", extraStart: "23:00", extraEnd: "25:00" });
  assert.strictEqual(r.hasLunch, false);
  assert.strictEqual(r.hasDinner, true);
  assert.strictEqual(r.attendance, 0.5);
});

test("shiftBandInfo: extraStart/extraEndなしは従来通り（回帰なし）", () => {
  const r = u.shiftBandInfo({ status: "work", start: "10:00", end: "14:00" });
  assert.strictEqual(r.attendance, 0.5);
  assert.strictEqual(r.hasLunch, true);
  assert.strictEqual(r.hasDinner, false);
});

// ===== subs購読の直近ウィンドウ絞り込み（データ保存上限②） =====
test("subsWindowCutoff: refDateから3ヶ月前の日付を返す", () => {
  assert.strictEqual(u.subsWindowCutoff("2026-07-09"), "2026-04-09");
});

test("subsWindowCutoff: 月末境界（月数繰り下がり）", () => {
  // 2026-01-15 の3ヶ月前 = 2025-10-15
  assert.strictEqual(u.subsWindowCutoff("2026-01-15"), "2025-10-15");
});

test("subsWindowCutoff: months引数で窓幅を変更できる", () => {
  assert.strictEqual(u.subsWindowCutoff("2026-07-09", 1), "2026-06-09");
});

test("recentPeriodIds: cutoff以降のstartDateの期間IDのみ返す", () => {
  const periods = [
    { id: "p1", startDate: "2026-07-01" }, // 直近
    { id: "p2", startDate: "2026-05-01" }, // 直近（cutoff=2026-04-09以降）
    { id: "p3", startDate: "2026-03-01" }, // 古い（除外）
    { id: "p4", startDate: "2026-04-09" }, // 境界（cutoff当日=含む）
  ];
  assert.deepStrictEqual(u.recentPeriodIds(periods, "2026-07-09").sort(), ["p1", "p2", "p4"]);
});

test("recentPeriodIds: startDate欠損やnullは除外", () => {
  const periods = [{ id: "p1", startDate: "2026-07-01" }, { id: "p2" }, null, { startDate: "2026-07-01" }];
  assert.deepStrictEqual(u.recentPeriodIds(periods, "2026-07-09"), ["p1"]);
});

test("recentPeriodIds: 隣接前期間が3ヶ月窓に含まれる（2週間・1ヶ月単位とも）", () => {
  // 最新期間の直前期間（2週間前・1ヶ月前）は必ず窓内に入る＝前期間跨ぎ計算が維持される
  const biweekly = [{ id: "cur", startDate: "2026-07-01" }, { id: "prev", startDate: "2026-06-16" }];
  assert.ok(u.recentPeriodIds(biweekly, "2026-07-09").includes("prev"));
  const monthly = [{ id: "cur", startDate: "2026-07-01" }, { id: "prev", startDate: "2026-06-01" }];
  assert.ok(u.recentPeriodIds(monthly, "2026-07-09").includes("prev"));
});

test("dateCandidateDisplayCutoff: 期間0/1件はnull（全件表示）", () => {
  assert.strictEqual(u.dateCandidateDisplayCutoff([]), null);
  assert.strictEqual(u.dateCandidateDisplayCutoff(null), null);
  assert.strictEqual(u.dateCandidateDisplayCutoff([{ id: "p1", startDate: "2026-07-01" }]), null);
});

test("dateCandidateDisplayCutoff: 期間3件以下はnull（全件表示）", () => {
  const periods = [
    { id: "p1", startDate: "2026-07-01" },
    { id: "p2", startDate: "2026-06-01" },
    { id: "p3", startDate: "2026-05-01" },
  ];
  assert.strictEqual(u.dateCandidateDisplayCutoff(periods), null);
});

test("dateCandidateDisplayCutoff: 期間4件は最新から3個前(降順4番目)のstartDate", () => {
  const periods = [
    { id: "p1", startDate: "2026-07-01" },
    { id: "p2", startDate: "2026-06-01" },
    { id: "p3", startDate: "2026-05-01" },
    { id: "p4", startDate: "2026-04-01" },
  ];
  assert.strictEqual(u.dateCandidateDisplayCutoff(periods), "2026-04-01");
});

test("dateCandidateDisplayCutoff: 期間5件でも降順4番目を返す（未ソート入力も降順ソートして判定）", () => {
  const periods = [
    { id: "p3", startDate: "2026-05-01" },
    { id: "p5", startDate: "2026-03-01" },
    { id: "p1", startDate: "2026-07-01" },
    { id: "p4", startDate: "2026-04-01" },
    { id: "p2", startDate: "2026-06-01" },
  ];
  assert.strictEqual(u.dateCandidateDisplayCutoff(periods), "2026-04-01");
});

test("dateCandidateDisplayCutoff: cutoff当日は表示対象（dt>=cutoffで残る境界確認）", () => {
  const periods = [
    { id: "p1", startDate: "2026-07-01" },
    { id: "p2", startDate: "2026-06-01" },
    { id: "p3", startDate: "2026-05-01" },
    { id: "p4", startDate: "2026-04-01" },
  ];
  const cutoff = u.dateCandidateDisplayCutoff(periods);
  assert.ok("2026-04-01" >= cutoff); // cutoff当日は残る
  assert.ok(!("2026-03-31" >= cutoff)); // cutoffより前は隠れる
});

// ===== sanitizeForSet / sanitizeForUpdate（Firebase書き込みの最終防御）=====
// RTDBはundefinedを含むオブジェクトで同期例外を投げるため、書き込み直前に除去する。
// null（＝削除の意思表示）は保持すること、入力を破壊しないこと、set経路とupdate経路が
// 同じ最終状態に収束することが要件。

test("sanitizeForSet: undefinedキーは落とし、nullは保持する", () => {
  const r = u.sanitizeForSet({ a: 1, b: undefined, c: null });
  assert.deepStrictEqual(r.value, { a: 1, c: null });
  assert.deepStrictEqual(r.found, ["b"]);
});

test("sanitizeForSet: 入れ子のundefinedも落とす（休憩タグ全解除の実バグ形状）", () => {
  const s = { breakTimes: { weekday: [{ start: "12:00", end: "13:00", tags: undefined }] } };
  const r = u.sanitizeForSet(s);
  assert.deepStrictEqual(r.value, { breakTimes: { weekday: [{ start: "12:00", end: "13:00" }] } });
  assert.deepStrictEqual(r.found, ["breakTimes/weekday[0]/tags"]);
});

test("sanitizeForSet: 配列のundefined要素はnullに置換し添字を保つ", () => {
  const r = u.sanitizeForSet({ xs: ["a", undefined, "c"] });
  assert.deepStrictEqual(r.value, { xs: ["a", null, "c"] });
  assert.strictEqual(r.value.xs.length, 3);
});

test("sanitizeForSet: 入力オブジェクトを破壊しない（React stateをそのまま渡すため）", () => {
  const s = { breakTimes: { weekday: [{ start: "12:00", tags: undefined }] } };
  const snapshot = JSON.stringify(s);
  u.sanitizeForSet(s);
  assert.strictEqual(JSON.stringify(s), snapshot);
  assert.ok("tags" in s.breakTimes.weekday[0], "元オブジェクトのキーが消えている");
});

test("sanitizeForSet: トップレベルundefinedはnull（＝削除）になる", () => {
  assert.deepStrictEqual(u.sanitizeForSet(undefined).value, null);
});

test("sanitizeForSet: プリミティブ・null・falsy値はそのまま通す", () => {
  assert.strictEqual(u.sanitizeForSet("x").value, "x");
  assert.strictEqual(u.sanitizeForSet(0).value, 0);
  assert.strictEqual(u.sanitizeForSet(false).value, false);
  assert.strictEqual(u.sanitizeForSet("").value, "");
  assert.strictEqual(u.sanitizeForSet(null).value, null);
});

test("sanitizeForSet: undefinedが無ければfoundは空（＝警告を出さない）", () => {
  assert.deepStrictEqual(u.sanitizeForSet({ a: 1, b: { c: [1, 2] } }).found, []);
});

test("sanitizeForUpdate: トップレベルundefinedはnullに変換する（落とすと古い値が残る）", () => {
  const r = u.sanitizeForUpdate({ "s1/shifts/2026-01-01/tags": undefined, "s1/comment": "x" });
  assert.deepStrictEqual(r.value, { "s1/shifts/2026-01-01/tags": null, "s1/comment": "x" });
  assert.deepStrictEqual(r.found, ["s1/shifts/2026-01-01/tags"]);
});

test("sanitizeForUpdate: 値がオブジェクトなら中身はset相当（キーごと落とす）", () => {
  const r = u.sanitizeForUpdate({ "s1/shifts/2026-01-01": { status: "work", tags: undefined } });
  assert.deepStrictEqual(r.value, { "s1/shifts/2026-01-01": { status: "work" } });
});

test("sanitizeForUpdate: 既存の明示null（diffSubForFlatWriteの削除指示）は素通しする", () => {
  const r = u.sanitizeForUpdate({ s1: null });
  assert.deepStrictEqual(r.value, { s1: null });
  assert.deepStrictEqual(r.found, []);
});

// set経路（部分木置換）とupdate経路（パス単位代入・null=削除）が同じ最終状態に収束することを、
// RTDBの最小モデルで確認する。ここが崩れると「片方だけ古い値が残る」型のバグになる。
{
  const isObj = v => v !== null && typeof v === "object" && !Array.isArray(v);
  const dbSet = (store, path, val) => {
    const parts = path.split("/").filter(Boolean);
    let cur = store;
    for (let i = 0; i < parts.length - 1; i++) { if (!isObj(cur[parts[i]])) cur[parts[i]] = {}; cur = cur[parts[i]]; }
    const last = parts[parts.length - 1];
    if (val === null) delete cur[last]; else cur[last] = JSON.parse(JSON.stringify(val));
  };
  // RTDBはnull値のキーを保存しない（＝存在しないと同じ）ため、比較前に正規化する
  const norm = v => {
    if (Array.isArray(v)) return v.map(norm);
    if (isObj(v)) {
      const o = {};
      Object.keys(v).sort().forEach(k => { if (v[k] !== null) o[k] = norm(v[k]); });
      return o;
    }
    return v;
  };
  const cases = [
    ["tags:undefinedを含む日オブジェクト", { status: "work", tags: undefined }],
    ["undefined・null・実値が混在", { status: "work", tags: undefined, note: null, start: "09:00" }],
    ["undefinedが無い通常ケース", { status: "work", start: "09:00", end: "17:00" }],
  ];
  cases.forEach(([label, dayObj]) => {
    test(`sanitize: set経路とupdate経路が同じ最終状態に収束する（${label}）`, () => {
      const base = { shops: { s1: { subs: { sub1: { shifts: { "2026-01-01": { status: "work", tags: ["old"] } } } } } } };
      const A = JSON.parse(JSON.stringify(base));
      const B = JSON.parse(JSON.stringify(base));
      dbSet(A, "shops/s1/subs/sub1/shifts/2026-01-01", u.sanitizeForSet(dayObj).value);
      const flat = {};
      Object.keys(dayObj).forEach(k => { flat[`sub1/shifts/2026-01-01/${k}`] = dayObj[k]; });
      // setは部分木置換なので、update経路では消えたキーをnullで明示する（diffSubForFlatWriteと同じ規約）
      Object.keys(B.shops.s1.subs.sub1.shifts["2026-01-01"]).forEach(k => {
        if (!(k in dayObj)) flat[`sub1/shifts/2026-01-01/${k}`] = null;
      });
      const payload = u.sanitizeForUpdate(flat).value;
      Object.keys(payload).forEach(k => dbSet(B, `shops/s1/subs/${k}`, payload[k]));
      assert.deepStrictEqual(norm(A), norm(B));
    });
  });
}

// app-staff.js の stripUndef を sanitizeForSet に一本化したことの非回帰
// （日オブジェクトは平坦なので旧・浅い実装と結果が一致しなければならない）
test("sanitizeForSet: 平坦な日オブジェクトでは旧・浅いstripUndefと結果が一致する", () => {
  const shallow = o => { const r = { ...o }; Object.keys(r).forEach(k => { if (r[k] === undefined) delete r[k]; }); return r; };
  [
    { status: "work", start: "09:00", end: "17:00" },
    { status: "holiday", start: undefined, end: undefined },
    { status: "work", adjustedStart: "10:00", adjustedStartNote: "", changed: true },
    { status: "work", start: "09:00", end: undefined, changed: undefined },
  ].forEach(day => {
    assert.deepStrictEqual(u.sanitizeForSet(day).value, shallow(day));
  });
});

test("diffSubForFlatWrite: 新規subは丸ごと1エントリを返す", () => {
  const ns = { id: "s1", staffName: "太郎", shifts: { "2026-07-10": { status: "work", start: "9:00" } } };
  assert.deepStrictEqual(u.diffSubForFlatWrite("s1", undefined, ns), { s1: ns });
});

test("diffSubForFlatWrite: 変更したshifts日付のみをフラットパスで返す（他日付・他subは巻き込まない）", () => {
  const prev = { id: "s1", comment: "", shifts: {
    "2026-07-10": { status: "work", start: "9:00" },
    "2026-07-11": { status: "work", start: "10:00" },
  } };
  const next = { ...prev, shifts: { ...prev.shifts, "2026-07-10": { status: "work", start: "9:30" } } };
  const diff = u.diffSubForFlatWrite("s1", prev, next);
  assert.deepStrictEqual(diff, { "s1/shifts/2026-07-10": { status: "work", start: "9:30" } });
});

test("diffSubForFlatWrite: トップレベルフィールドの変更はsubId/フィールド名で返す", () => {
  const prev = { id: "s1", comment: "旧", updatedAt: "2026-07-01T00:00:00Z", shifts: {} };
  const next = { ...prev, comment: "新", updatedAt: "2026-07-10T00:00:00Z", isUpdated: true };
  const diff = u.diffSubForFlatWrite("s1", prev, next);
  assert.deepStrictEqual(diff, {
    "s1/comment": "新",
    "s1/updatedAt": "2026-07-10T00:00:00Z",
    "s1/isUpdated": true,
  });
});

test("diffSubForFlatWrite: 削除されたフィールド・日付はnullで返す", () => {
  const prev = { id: "s1", note: "x", shifts: { "2026-07-10": { status: "work" } } };
  const next = { id: "s1", shifts: {} };
  const diff = u.diffSubForFlatWrite("s1", prev, next);
  assert.deepStrictEqual(diff, { "s1/shifts/2026-07-10": null, "s1/note": null });
});

test("applyFlatSubWrite: subId丸ごとの新規追加・削除", () => {
  const map = {};
  u.applyFlatSubWrite(map, "s1", { id: "s1", shifts: {} });
  assert.deepStrictEqual(map, { s1: { id: "s1", shifts: {} } });
  u.applyFlatSubWrite(map, "s1", null);
  assert.deepStrictEqual(map, {});
});

test("applyFlatSubWrite: shifts/日付パッチは同subの他日付・他フィールドを保持する", () => {
  const map = { s1: { id: "s1", comment: "c", shifts: { "2026-07-10": { status: "work", start: "9:00" } } } };
  u.applyFlatSubWrite(map, "s1/shifts/2026-07-11", { status: "work", start: "10:00" });
  assert.deepStrictEqual(map.s1.shifts, {
    "2026-07-10": { status: "work", start: "9:00" },
    "2026-07-11": { status: "work", start: "10:00" },
  });
  assert.strictEqual(map.s1.comment, "c");
});

test("applyFlatSubWrite: ベースsubが未到着のフィールドパッチは無視される（後続flushで再試行）", () => {
  const map = {};
  u.applyFlatSubWrite(map, "s1/comment", "新");
  assert.deepStrictEqual(map, {});
});

// ===== ポジションエラー判定 =====
test("dayTypeOf: 平日/土/日を判定する", () => {
  assert.strictEqual(u.dayTypeOf("2026-07-13"), "weekday"); // 月曜
  assert.strictEqual(u.dayTypeOf("2026-07-11"), "sat"); // 土曜
  assert.strictEqual(u.dayTypeOf("2026-07-12"), "sun"); // 日曜
});

test("dayTypeOf: 祝日はholSat/holSunのどちらかに分類され、weekday/sat/sunにはならない", () => {
  // 2026-07-20は祝日（海の日・月曜、7/18土〜7/20月の3連休最終日）
  assert.strictEqual(u.isHoliday("2026-07-20"), true);
  assert.strictEqual(u.dayTypeOf("2026-07-20"), "holSun");
});

test("dayTypeOf: 前後を平日に挟まれた単独の祝日はholSat（土曜扱い）", () => {
  // 2026-01-01（元日・木曜）。前日12/31・翌日1/2はともに祝日でも土日でもない
  assert.strictEqual(u.isHoliday("2025-12-31"), false);
  assert.strictEqual(u.isHoliday("2026-01-02"), false);
  assert.strictEqual(u.dayTypeOf("2026-01-01"), "holSat");
});

test("dayTypeOf: 連休（2日以上の休み日の塊）の初日〜最終日前日はholSat", () => {
  // 2026年GW: 5/2(土,休日ではないが週末)〜5/3(日,祝)〜5/4(月,祝)〜5/5(火,祝)の4日連続休み。5/4は最終日(5/5)より前
  assert.strictEqual(u.dayTypeOf("2026-05-04"), "holSat");
});

test("dayTypeOf: 連休（2日以上の休み日の塊）の最終日はholSun", () => {
  // 同じGWの塊の最終日である5/5(火・こどもの日)
  assert.strictEqual(u.dayTypeOf("2026-05-05"), "holSun");
});

test("dayTypeOf: 祝日自体が日曜日ならholSun（連休の位置によらず常に）", () => {
  // 2026-05-03(日・憲法記念日)。連休の最終日ではない（5/4,5/5と続く）が、日曜日自体なので常にholSun
  assert.strictEqual(u.dayTypeOf("2026-05-03"), "holSun");
});

test("dayTypeOf: 祝日自体が土曜日ならholSat（連休の位置によらず常に）", () => {
  // 2025-05-03(土・憲法記念日)
  assert.strictEqual(u.dayTypeOf("2025-05-03"), "holSat");
});

test("dayTypeOf: 翌日(月曜)が祝日で連休が続く非祝日の日曜日はsatになる", () => {
  // 2026-01-11(日・非祝日)の翌日2026-01-12(月・成人の日)は祝日 → まだ連休の途中なのでsat扱い
  assert.strictEqual(u.isHoliday("2026-01-11"), false);
  assert.strictEqual(u.isHoliday("2026-01-12"), true);
  assert.strictEqual(u.dayTypeOf("2026-01-11"), "sat");
  assert.strictEqual(u.dayTypeOf("2026-01-12"), "holSun"); // 連休(土10日+日11日+月12日)の最終日
});

test("dayTypeOf: 翌日が平日の非祝日の日曜日は従来通りsun", () => {
  // 2026-07-12(日)の翌日2026-07-13(月)は祝日ではない普通の平日
  assert.strictEqual(u.isHoliday("2026-07-13"), false);
  assert.strictEqual(u.dayTypeOf("2026-07-12"), "sun");
});

test("weekdayKeyToPositionDayType: 曜日キー0〜8を区分に変換する", () => {
  assert.strictEqual(u.weekdayKeyToPositionDayType(0), "sun");
  assert.strictEqual(u.weekdayKeyToPositionDayType(1), "weekday");
  assert.strictEqual(u.weekdayKeyToPositionDayType(5), "weekday");
  assert.strictEqual(u.weekdayKeyToPositionDayType(6), "sat");
  assert.strictEqual(u.weekdayKeyToPositionDayType(7), "holSat");
  assert.strictEqual(u.weekdayKeyToPositionDayType(8), "holSun");
  assert.strictEqual(u.weekdayKeyToPositionDayType("6"), "sat"); // 文字列キーでも動く
  assert.strictEqual(u.weekdayKeyToPositionDayType(9), null);
});

test("candListsEqual: 順不同・closedを含めて内容一致を判定する", () => {
  const a = [{ start: "9:00", end: "17:00" }, { start: "17:00", end: "23:00" }];
  const b = [{ start: "17:00", end: "23:00" }, { start: "9:00", end: "17:00" }]; // 順序違い
  assert.strictEqual(u.candListsEqual(a, b), true);
  assert.strictEqual(u.candListsEqual(a, [{ start: "9:00", end: "17:00" }]), false); // 件数違い
  assert.strictEqual(u.candListsEqual(a, [{ start: "9:00", end: "18:00" }, { start: "17:00", end: "23:00" }]), false);
  assert.strictEqual(u.candListsEqual([{ closed: true }], [{ closed: true }]), true);
  assert.strictEqual(u.candListsEqual([{ closed: true }], [{ start: "9:00", end: "17:00" }]), false);
});

test("matchingPositionDayTypes: 一致する曜日別候補の区分集合を返す", () => {
  const cands = [{ start: "10:00", end: "22:00" }];
  // 土(6)と単独祝(7)が同じ候補、月(1)は別候補
  const wc = { 6: [{ start: "10:00", end: "22:00" }], 7: [{ start: "10:00", end: "22:00" }], 1: [{ start: "9:00", end: "17:00" }] };
  const set = u.matchingPositionDayTypes(cands, wc);
  assert.strictEqual(set.size, 2);
  assert.strictEqual(set.has("sat"), true);
  assert.strictEqual(set.has("holSat"), true);
  assert.strictEqual(set.has("weekday"), false);
});

test("positionDayTypeFor: 手動指定(dateCandidatePosTypes)を最優先する", () => {
  const s = { dateCandidatePosTypes: { "2026-07-11": "holSun" }, dateCandidates: { "2026-07-11": [{ start: "9:00", end: "17:00" }] }, weekdayCandidates: {} };
  assert.strictEqual(u.positionDayTypeFor("2026-07-11", s), "holSun");
});

test("positionDayTypeFor: 不正な手動指定は無視してフォールバックする", () => {
  const s = { dateCandidatePosTypes: { "2026-07-13": "bogus" }, dateCandidates: {}, weekdayCandidates: {} };
  assert.strictEqual(u.positionDayTypeFor("2026-07-13", s), "weekday"); // 7/13は月曜
});

test("positionDayTypeFor: 一致する曜日別候補の区分が一意ならそれを使う", () => {
  const s = { dateCandidates: { "2026-07-13": [{ start: "10:00", end: "22:00" }] }, weekdayCandidates: { 6: [{ start: "10:00", end: "22:00" }] } };
  // 7/13は本来weekdayだが、候補が土曜設定と一致 → satを返す
  assert.strictEqual(u.positionDayTypeFor("2026-07-13", s), "sat");
});

test("positionDayTypeFor: 区分が複数にまたがる場合はカレンダー規則へフォールバック", () => {
  const s = { dateCandidates: { "2026-07-13": [{ start: "10:00", end: "22:00" }] }, weekdayCandidates: { 6: [{ start: "10:00", end: "22:00" }], 7: [{ start: "10:00", end: "22:00" }] } };
  assert.strictEqual(u.positionDayTypeFor("2026-07-13", s), "weekday"); // 一意でない→dayTypeOf(月曜)=weekday
});

test("positionDayTypeFor: 日付別候補がなければdayTypeOfを返す", () => {
  assert.strictEqual(u.positionDayTypeFor("2026-07-11", { dateCandidates: {}, weekdayCandidates: {} }), "sat"); // 土曜
  assert.strictEqual(u.positionDayTypeFor("2026-07-11", {}), "sat"); // settings空でも安全
});

// getBreakList: 休憩の日区分を必要ポジションと同じ5区分(positionDayTypeFor)で解決する + 旧"hol"の後方互換
test("getBreakList: 平日はweekday区分の休憩を返す", () => {
  const s = { breakTimes: { weekday: [{ start: "12:00", end: "13:00" }] } };
  assert.deepStrictEqual(u.getBreakList(s, "2026-07-13"), [{ start: "12:00", end: "13:00" }]); // 7/13は月曜
});

test("getBreakList: 祝日はholSat/holSunに解決される（旧holではなく5区分）", () => {
  const s = { breakTimes: { holSat: [{ start: "14:00", end: "15:00" }], holSun: [{ start: "16:00", end: "17:00" }] } };
  assert.deepStrictEqual(u.getBreakList(s, "2026-02-11"), [{ start: "14:00", end: "15:00" }]); // 2/11(建国記念の日・単日)=holSat
  assert.deepStrictEqual(u.getBreakList(s, "2026-07-20"), [{ start: "16:00", end: "17:00" }]); // 7/20(海の日・連休最終日)=holSun
});

test("getBreakList: 候補タブの日付別区分(dateCandidatePosTypes)に自動追従する", () => {
  const s = { breakTimes: { holSun: [{ start: "20:00", end: "21:00" }] }, dateCandidatePosTypes: { "2026-07-13": "holSun" } };
  // 7/13は本来weekdayだが、候補タブでholSunに指定 → 休憩もholSunに追従
  assert.deepStrictEqual(u.getBreakList(s, "2026-07-13"), [{ start: "20:00", end: "21:00" }]);
});

test("getBreakList: 旧hol設定は祝日区分が空のときだけ後方互換で流用される", () => {
  const s = { breakTimes: { hol: [{ start: "14:00", end: "15:00" }] } };
  assert.deepStrictEqual(u.getBreakList(s, "2026-02-11"), [{ start: "14:00", end: "15:00" }]); // holSat未設定→旧holを流用
  assert.deepStrictEqual(u.getBreakList(s, "2026-07-20"), [{ start: "14:00", end: "15:00" }]); // holSun未設定→旧holを流用
});

test("getBreakList: 祝日区分が設定済みなら旧holより優先する", () => {
  const s = { breakTimes: { holSat: [{ start: "10:00", end: "11:00" }], hol: [{ start: "14:00", end: "15:00" }] } };
  assert.deepStrictEqual(u.getBreakList(s, "2026-02-11"), [{ start: "10:00", end: "11:00" }]); // holSat優先
});

test("getBreakList: 旧hol流用は祝日区分限定（平日/日曜等には波及しない）", () => {
  const s = { breakTimes: { hol: [{ start: "14:00", end: "15:00" }] } };
  assert.deepStrictEqual(u.getBreakList(s, "2026-07-13"), []); // 月曜=weekday未設定→旧holは流用しない
});

test("hasAnyRequiredPosition: 必要ポジションが1件でもあればtrue、なければfalse", () => {
  assert.strictEqual(u.hasAnyRequiredPosition(undefined), false);
  assert.strictEqual(u.hasAnyRequiredPosition({}), false);
  assert.strictEqual(u.hasAnyRequiredPosition({ weekday: {} }), false);
  assert.strictEqual(u.hasAnyRequiredPosition({ weekday: { lunch: { kitchen: [], hall: [] } } }), false);
  assert.strictEqual(u.hasAnyRequiredPosition({ weekday: { lunch: { kitchen: ["調理長"], hall: [] } } }), true);
  assert.strictEqual(u.hasAnyRequiredPosition({ sat: { dinner: { hall: ["ホール"] } } }), true);
});

test("matchPositionSlots: 必要枠なし(空配列)は不足なし", () => {
  const r = u.matchPositionSlots([], [{ name: "A", positions: ["調理長"] }]);
  assert.deepStrictEqual(r, { matchedCount: 0, shortageByPosition: {} });
});

test("matchPositionSlots: 単純に満たされるケース", () => {
  const r = u.matchPositionSlots(["調理長"], [{ name: "A", positions: ["調理長"] }]);
  assert.strictEqual(r.matchedCount, 1);
  assert.deepStrictEqual(r.shortageByPosition, {});
});

test("matchPositionSlots: 保有者不足は不足数を返す", () => {
  const r = u.matchPositionSlots(["調理長", "調理長"], [{ name: "A", positions: ["調理長"] }]);
  assert.strictEqual(r.matchedCount, 1);
  assert.deepStrictEqual(r.shortageByPosition, { 調理長: 1 });
});

test("matchPositionSlots: 複数ポジション保有者を跨いだ増加道で最大マッチングを求める（貪欲割当だと過大不足になるケース）", () => {
  // 枠: 調理長, フライヤー / A: 調理長+フライヤー両方保有, B: 調理長のみ保有
  // 貪欲に先頭の枠(調理長)からAを割り当てると、フライヤーを埋められるのはAしかいないため不足になってしまう。
  // 正しくはA→フライヤー, B→調理長で両方埋まる（不足0）。
  const slots = ["調理長", "フライヤー"];
  const attendees = [
    { name: "A", positions: ["調理長", "フライヤー"] },
    { name: "B", positions: ["調理長"] },
  ];
  const r = u.matchPositionSlots(slots, attendees);
  assert.strictEqual(r.matchedCount, 2);
  assert.deepStrictEqual(r.shortageByPosition, {});
});

test("matchPositionSlots: 1人は1出勤=1枠までしか埋められない（同じ人を2枠にカウントしない）", () => {
  const slots = ["調理長", "フライヤー"];
  const attendees = [{ name: "A", positions: ["調理長", "フライヤー"] }];
  const r = u.matchPositionSlots(slots, attendees);
  assert.strictEqual(r.matchedCount, 1);
  // どちらか一方が不足として残る（どちらかは実装の割当順に依存するため、不足件数のみ検証）
  assert.strictEqual(Object.values(r.shortageByPosition).reduce((a, b) => a + b, 0), 1);
});

// ===== subLastActionTime（提出一覧の並べ替えキー）=====

test("subLastActionTime: 新規提出（未更新）は submittedAt を返す", () => {
  const st = "2026-07-20T09:00:00.000Z";
  assert.strictEqual(u.subLastActionTime({ submittedAt: st }), new Date(st).getTime());
});

test("subLastActionTime: 再提出（変更あり）は updatedAt を返す", () => {
  const st = "2026-07-20T09:00:00.000Z", ut = "2026-07-20T15:30:00.000Z";
  assert.strictEqual(
    u.subLastActionTime({ submittedAt: st, updatedAt: ut, isUpdated: true }),
    new Date(ut).getTime()
  );
});

test("subLastActionTime: 再提出の方が新規提出より新しければ上位に並ぶ", () => {
  const older = { submittedAt: "2026-07-18T09:00:00.000Z", updatedAt: "2026-07-20T20:00:00.000Z", isUpdated: true };
  const newer = { submittedAt: "2026-07-20T10:00:00.000Z" };
  const sorted = [newer, older].sort((a, b) => u.subLastActionTime(b) - u.subLastActionTime(a));
  assert.strictEqual(sorted[0], older);
});

test("subLastActionTime: 同一分内の updatedAt は再提出とみなさず submittedAt を返す", () => {
  const st = "2026-07-20T09:00:10.000Z", ut = "2026-07-20T09:00:45.000Z";
  assert.strictEqual(
    u.subLastActionTime({ submittedAt: st, updatedAt: ut, isUpdated: true }),
    new Date(st).getTime()
  );
});

test("subLastActionTime: isUpdated が無い・updatedAt が無い場合は submittedAt を返す", () => {
  const st = "2026-07-20T09:00:00.000Z", ut = "2026-07-21T09:00:00.000Z";
  assert.strictEqual(u.subLastActionTime({ submittedAt: st, updatedAt: ut }), new Date(st).getTime());
  assert.strictEqual(u.subLastActionTime({ submittedAt: st, isUpdated: true }), new Date(st).getTime());
});

test("subLastActionTime: 日付が不正・sub が無い場合も例外にせず数値を返す", () => {
  assert.strictEqual(u.subLastActionTime(null), 0);
  assert.strictEqual(u.subLastActionTime({}), 0);
  const st = "2026-07-20T09:00:00.000Z";
  assert.strictEqual(
    u.subLastActionTime({ submittedAt: st, updatedAt: "こわれた日付", isUpdated: true }),
    new Date(st).getTime()
  );
});

// ===== subHasRealUpdate（提出一覧の「変更あり」バッジ・締切日ゲート付き・2026-07-21） =====
test("subHasRealUpdate: 変更なし（updatedAtなし）は締切あり/なしどちらも false", () => {
  const sub = { submittedAt: "2026-07-20T09:00:00.000Z" };
  assert.strictEqual(u.subHasRealUpdate(sub, ""), false);
  assert.strictEqual(u.subHasRealUpdate(sub, "2026-07-25"), false);
});

test("subHasRealUpdate: 締切なし・提出1分以上後に更新なら true（従来動作）", () => {
  const sub = { submittedAt: "2026-07-20T09:00:00.000Z", updatedAt: "2026-07-20T09:02:00.000Z", isUpdated: true };
  assert.strictEqual(u.subHasRealUpdate(sub, ""), true);
  assert.strictEqual(u.subHasRealUpdate(sub, undefined), true);
});

test("subHasRealUpdate: 締切ありで締切前の更新は false", () => {
  const sub = { submittedAt: "2026-07-20T09:00:00.000Z", updatedAt: "2026-07-22T09:00:00.000Z", isUpdated: true };
  assert.strictEqual(u.subHasRealUpdate(sub, "2026-07-25"), false);
});

test("subHasRealUpdate: 締切ありで締切後の更新は true", () => {
  const sub = { submittedAt: "2026-07-20T09:00:00.000Z", updatedAt: "2026-07-28T09:00:00.000Z", isUpdated: true };
  assert.strictEqual(u.subHasRealUpdate(sub, "2026-07-25"), true);
});

test("subHasRealUpdate: 締切当日中の更新は false・翌日以降の更新は true（境界）", () => {
  const before = { submittedAt: "2026-07-20T09:00:00.000Z", updatedAt: "2026-07-25T01:00:00.000Z", isUpdated: true };
  const after = { submittedAt: "2026-07-20T09:00:00.000Z", updatedAt: "2026-07-26T15:00:00.000Z", isUpdated: true };
  assert.strictEqual(u.subHasRealUpdate(before, "2026-07-25"), false);
  assert.strictEqual(u.subHasRealUpdate(after, "2026-07-25"), true);
});

test("subHasRealUpdate: 締切日が不正文字列なら従来判定にフォールバック", () => {
  const updated = { submittedAt: "2026-07-20T09:00:00.000Z", updatedAt: "2026-07-20T09:02:00.000Z", isUpdated: true };
  const notUpdated = { submittedAt: "2026-07-20T09:00:00.000Z" };
  assert.strictEqual(u.subHasRealUpdate(updated, "こわれた締切"), true);
  assert.strictEqual(u.subHasRealUpdate(notUpdated, "こわれた締切"), false);
});

test("subHasRealUpdate: submittedAt/updatedAt が不正・sub が無い場合も例外にせず false", () => {
  assert.strictEqual(u.subHasRealUpdate(null, "2026-07-25"), false);
  assert.strictEqual(u.subHasRealUpdate({}, "2026-07-25"), false);
  assert.strictEqual(
    u.subHasRealUpdate({ submittedAt: "こわれた", updatedAt: "こわれた", isUpdated: true }, "2026-07-25"),
    false
  );
});

// ===== ヒートマップの帯別セクション（h/kサフィックスのランチ/ディナー分割・2026-07-21） =====
const HS = (o) => u.heatSectionEntries({ defaultSec: "kit", splitEnabled: true, ...o });

test("heatSectionEntries: 跨ぎシフト(9-22)でstartNote=h・endNote無しはランチ=hall/ディナー=kitに分割される", () => {
  const r = HS({ stM: 540, enM: 1320, startNote: "h", endNote: "" });
  assert.deepStrictEqual(r, [
    { stM: 540, enM: 1020, section: "hall" },
    { stM: 1020, enM: 1320, section: "kit" },
  ]);
});

test("heatSectionEntries: 跨ぎシフトでendNote=hのみならランチ=kit/ディナー=hallになる", () => {
  const r = HS({ stM: 540, enM: 1320, startNote: "", endNote: "h" });
  assert.deepStrictEqual(r, [
    { stM: 540, enM: 1020, section: "kit" },
    { stM: 1020, enM: 1320, section: "hall" },
  ]);
});

test("heatSectionEntries: ディナーのみシフト(18-23)はendNote優先・空ならstartNoteにフォールバックする", () => {
  assert.deepStrictEqual(HS({ stM: 1080, enM: 1380, startNote: "h", endNote: "" }), [
    { stM: 1080, enM: 1380, section: "hall" },
  ]);
  assert.deepStrictEqual(HS({ stM: 1080, enM: 1380, startNote: "h", endNote: "k" }), [
    { stM: 1080, enM: 1380, section: "kit" },
  ]);
});

test("heatSectionEntries: ランチのみシフト(9-15)はstartNote優先・空ならendNoteにフォールバックする", () => {
  assert.deepStrictEqual(HS({ stM: 540, enM: 900, startNote: "", endNote: "h" }), [
    { stM: 540, enM: 900, section: "hall" },
  ]);
  assert.deepStrictEqual(HS({ stM: 540, enM: 900, startNote: "k", endNote: "h" }), [
    { stM: 540, enM: 900, section: "kit" },
  ]);
});

test("heatSectionEntries: 分割点は17:00固定で、17:00ちょうど終業(9-17)は分割されず1エントリになる", () => {
  assert.strictEqual(u.HEAT_BAND_SPLIT_MIN, 1020);
  assert.deepStrictEqual(HS({ stM: 540, enM: 1020, startNote: "h", endNote: "" }), [
    { stM: 540, enM: 1020, section: "hall" },
  ]);
});

test("heatSectionEntries: 両セルのnoteが同一(9h/22h)なら跨ぎでも分割せず1エントリになる", () => {
  assert.deepStrictEqual(HS({ stM: 540, enM: 1320, startNote: "h", endNote: "h" }), [
    { stM: 540, enM: 1320, section: "hall" },
  ]);
});

test("heatSectionEntries: ホール/キッチン分割未使用の店舗はnoteに関わらず常にdefaultSecの1エントリ", () => {
  const r = u.heatSectionEntries({ stM: 540, enM: 1320, startNote: "h", endNote: "k", defaultSec: "kit", splitEnabled: false });
  assert.deepStrictEqual(r, [{ stM: 540, enM: 1320, section: "kit" }]);
});

test("heatSectionEntries: ホール所属スタッフ(defaultSec=hall)はnote無しの帯がhallのままになる", () => {
  const r = u.heatSectionEntries({ stM: 540, enM: 1320, startNote: "k", endNote: "", defaultSec: "hall", splitEnabled: true });
  assert.deepStrictEqual(r, [
    { stM: 540, enM: 1020, section: "kit" },
    { stM: 1020, enM: 1320, section: "hall" },
  ]);
});

test("heatSectionEntries: 開始>=終了の不正な区間は空配列を返す", () => {
  assert.deepStrictEqual(HS({ stM: 1020, enM: 1020, startNote: "h", endNote: "" }), []);
});

test("resolveBandValues: 跨ぎは各セルの値を厳密に使い、片帯のみは反対側セルにフォールバックする", () => {
  // 跨ぎ（9三 / 22）→ ランチだけ他店舗ヘルプ
  assert.deepStrictEqual(u.resolveBandValues(540, 1320, "shopA", null), { lunch: "shopA", dinner: null });
  // ディナーのみ（18三 / 23）→ 出勤セルの略称がディナー帯にも効く
  assert.deepStrictEqual(u.resolveBandValues(1080, 1380, "shopA", null), { lunch: "shopA", dinner: "shopA" });
  // ランチのみ（9 / 15三）→ 退勤セルの略称がランチ帯にも効く
  assert.deepStrictEqual(u.resolveBandValues(540, 900, null, "shopB"), { lunch: "shopB", dinner: "shopB" });
  // 両方指定は終日
  assert.deepStrictEqual(u.resolveBandValues(540, 1320, "shopA", "shopB"), { lunch: "shopA", dinner: "shopB" });
});

test("noteToHeatSection: h→hall / k→kit / それ以外はnull", () => {
  assert.strictEqual(u.noteToHeatSection("h"), "hall");
  assert.strictEqual(u.noteToHeatSection("k"), "kit");
  assert.strictEqual(u.noteToHeatSection("x"), null);
  assert.strictEqual(u.noteToHeatSection("研修"), null);
  assert.strictEqual(u.noteToHeatSection(""), null);
});

test("CELL_COMMANDS: h/kのdescに帯別適用（ランチ帯/ディナー帯）の説明が含まれる", () => {
  ["h", "k"].forEach(k => {
    const c = u.CELL_COMMANDS.find(x => x.kind === "suffix" && x.key === k);
    assert.ok(c.desc.includes("ランチ帯") && c.desc.includes("ディナー帯"), `${k} の説明が帯別適用を説明していない`);
  });
});
