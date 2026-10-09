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

test("carryAdminShiftFields: 休みで出し直した日は調整時刻・追加出勤を引き継がない（メモと休み希望は残す）", () => {
  const old = {
    status: "work", start: "09:00", end: "17:00",
    adjustedStart: "10:00", adjustedEnd: "18:00",
    adjustedStartNote: "研修", adminRest: { end: "13:00" },
    extraStart: "23:00", extraEnd: "25:00", adjustedStartFixed: true,
  };
  const holiday = u.carryAdminShiftFields({ status: "holiday" }, old);
  assert.strictEqual(holiday.status, "work", "「締」がある日は従来どおり出勤へ戻る");
  assert.strictEqual(holiday.adjustedStart, undefined);
  assert.strictEqual(holiday.adjustedEnd, undefined);
  assert.strictEqual(holiday.extraStart, "23:00", "「締」の追加出勤は別軸なので残す");
  assert.strictEqual(holiday.adjustedStartFixed, true);
  assert.strictEqual(holiday.adjustedStartNote, "研修", "メモは残す");
  assert.deepStrictEqual(holiday.adminRest, { end: "13:00" }, "休み希望マークは残す");
  const plain = u.carryAdminShiftFields({ status: "holiday" }, { status: "work", start: "09:00", end: "17:00", adjustedStart: "10:00", adjustedEnd: "18:00", adjustedEndNote: "早番" });
  assert.strictEqual(plain.status, "holiday");
  assert.strictEqual(plain.adjustedStart, undefined, "休みの日に調整時刻を残さない");
  assert.strictEqual(plain.adjustedEnd, undefined);
  assert.strictEqual(plain.adjustedEndNote, "早番", "メモは残す");
  assert.strictEqual(u.calcNetWorkMinutes(plain, []), 0);
  // 出勤で出し直した日は従来どおり全部引き継ぐ
  const work = u.carryAdminShiftFields({ status: "work", start: "11:00", end: "20:00" }, old);
  assert.strictEqual(work.adjustedStart, "10:00");
  assert.strictEqual(work.extraStart, "23:00");
  assert.strictEqual(work.status, "work");
});

test("validatePeriodDates: 空・逆転はエラー、重なりは警告、隣接は通す", () => {
  const others = [
    { id: "p1", label: "8月前半", startDate: "2026-08-01", endDate: "2026-08-15" },
    { id: "p2", label: "8月後半", startDate: "2026-08-16", endDate: "2026-08-31" },
  ];
  assert.ok(u.validatePeriodDates({ startDate: "", endDate: "2026-09-01" }, others).error, "空はエラー");
  assert.ok(u.validatePeriodDates({ startDate: "2026-09-10", endDate: "2026-09-01" }, others).error, "終了日<開始日はエラー");
  assert.deepStrictEqual(u.validatePeriodDates({ startDate: "2026-09-01", endDate: "2026-09-15" }, others), {}, "重ならなければ何も返さない");
  const w = u.validatePeriodDates({ startDate: "2026-08-10", endDate: "2026-08-20" }, others);
  assert.ok(w.warning && w.warning.includes("8月前半") && w.warning.includes("8月後半"), "重なった期間を全部挙げる");
  // 自分自身は重なり判定から外す（編集で日付を変えないまま保存できる）
  assert.deepStrictEqual(u.validatePeriodDates({ id: "p1", startDate: "2026-08-01", endDate: "2026-08-15" }, others), {});
  // 端が接するだけ（8/15 と 8/16）は重なりではない
  assert.deepStrictEqual(u.validatePeriodDates({ startDate: "2026-07-20", endDate: "2026-07-31" }, others), {});
});

test("getBreaksFor: 休憩の内側から出勤して休憩をまたぐ日には適用しない（2026-08-31 決定3・#89の案Cを撤回）", () => {
  const settings = { breakTimes: { weekday: [{ start: "12:00", end: "13:00" }] } };
  const sh = { status: "work", start: "12:30", end: "20:00" };
  assert.deepStrictEqual(u.getBreaksFor(settings, "2026-07-06", "A", sh), [], "出勤が休憩の内側なので適用しない");
  // 案Cの下では30分引かれて7:00だった。撤回により控除なしの7:30へ戻る。
  assert.strictEqual(u.calcNetWorkMinutes(sh, u.getBreaksFor(settings, "2026-07-06", "A", sh)), 7 * 60 + 30);
});

test("getBreaksFor: 勤務が休憩を完全に含む日にだけ適用する（決定3の境界）", () => {
  const settings = { breakTimes: { weekday: [{ start: "12:00", end: "13:00" }] } };
  const b = sh => u.getBreaksFor(settings, "2026-07-06", "A", { status: "work", ...sh });
  // 完全に含む → 適用（60分控除）
  assert.strictEqual(b({ start: "09:00", end: "18:00" }).length, 1);
  assert.strictEqual(
    u.calcNetWorkMinutes({ status: "work", start: "09:00", end: "18:00" }, b({ start: "09:00", end: "18:00" })),
    8 * 60
  );
  // 出勤が休憩開始と同時刻・休憩の内側 → 適用しない
  assert.deepStrictEqual(b({ start: "12:00", end: "20:00" }), []);
  assert.deepStrictEqual(b({ start: "12:30", end: "20:00" }), []);
  // 退勤が休憩終了と同時刻・休憩の内側 → 適用しない
  assert.deepStrictEqual(b({ start: "09:00", end: "13:00" }), []);
  assert.deepStrictEqual(b({ start: "09:00", end: "12:30" }), []);
  // 休憩の完全に内側で始まって内側で終わる → 適用しない
  assert.deepStrictEqual(b({ start: "12:10", end: "12:50" }), []);
});

test("getBreaksFor: 片側セル（出勤だけ・退勤だけ）の日には休憩を一切適用しない（決定3）", () => {
  const settings = {
    candidates: [{ start: "09:00", end: "15:00" }, { start: "17:00", end: "23:00" }],
    breakTimes: { weekday: [{ start: "12:00", end: "13:00" }] },
  };
  // 補完すると 09:00〜15:00 で休憩を丸ごと含むが、片側セルなので適用しない
  assert.deepStrictEqual(u.getBreaksFor(settings, "2026-07-06", "A", { status: "work", start: "09:00" }), []);
  assert.deepStrictEqual(u.getBreaksFor(settings, "2026-07-06", "A", { status: "work", end: "22:00" }), []);
  // 両側そろえば従来どおり適用される（片側判定が両側の日を巻き込んでいないことの確認）
  assert.strictEqual(
    u.getBreaksFor(settings, "2026-07-06", "A", { status: "work", start: "09:00", end: "15:00" }).length, 1
  );
});

test("oneSidedFillBounds: 候補時間から補完境界を出す（候補が無ければ 15:00 / 17:00）", () => {
  assert.deepStrictEqual(u.oneSidedFillBounds(null), { lunchEnd: 900, dinnerStart: 1020 });
  const settings = { candidates: [{ start: "09:30", end: "16:00" }, { start: "17:30", end: "23:00" }] };
  assert.deepStrictEqual(u.oneSidedFillBounds(settings), { lunchEnd: 960, dinnerStart: 1050 });
  const closedOnly = { candidates: [{ closed: true }] };
  assert.deepStrictEqual(u.oneSidedFillBounds(closedOnly), { lunchEnd: 900, dinnerStart: 1020 });
});

test("calcNetWorkMinutes: 片側だけ入力された日を、settingsを渡したときだけ補完して数える（#82）", () => {
  const settings = { candidates: [{ start: "09:00", end: "15:00" }, { start: "17:00", end: "23:00" }], breakTimes: {} };
  const onlyStart = { status: "work", start: "09:00" };
  const onlyEnd = { status: "work", end: "22:00" };
  assert.strictEqual(u.calcNetWorkMinutes(onlyStart, [], 0), 0, "settings無しでは従来どおり0分");
  assert.strictEqual(u.calcNetWorkMinutes(onlyStart, [], 0, settings), 6 * 60, "出勤のみ→ランチ終わりまで");
  assert.strictEqual(u.calcNetWorkMinutes(onlyEnd, [], 0, settings), 5 * 60, "退勤のみ→ディナー始まりから");
  // 補完して数えるのは勤務時間・出勤日数だけで、休憩は引かない（2026-08-31 決定3）。
  // 案C下では休憩60分が引かれて5:00だった。
  const withBreak = { ...settings, breakTimes: { weekday: [{ start: "12:00", end: "13:00" }] } };
  assert.strictEqual(
    u.calcNetWorkMinutes(onlyStart, u.getBreaksFor(withBreak, "2026-07-06", "A", onlyStart), 0, withBreak),
    6 * 60
  );
  // 退勤延長は片側セルの日でも反映する（決定3）
  assert.strictEqual(u.calcNetWorkMinutes(onlyStart, [], 30, settings), 6 * 60 + 30);
});

test("shiftBandInfo: 片側だけの日は補完して0.5日として数える（settings無しでは0）", () => {
  const settings = { candidates: [{ start: "09:00", end: "15:00" }, { start: "17:00", end: "23:00" }] };
  const onlyStart = { status: "work", start: "09:00" };
  assert.strictEqual(u.shiftBandInfo(onlyStart).attendance, 0, "settings無しでは従来どおり判定材料なし");
  const b = u.shiftBandInfo(onlyStart, settings);
  assert.strictEqual(b.attendance, 0.5);
  assert.strictEqual(b.hasLunch, true);
  assert.strictEqual(b.hasDinner, false);
  const both = u.shiftBandInfo({ status: "work", start: "09:00", end: "22:00" }, settings);
  assert.strictEqual(both.attendance, 1, "両方ある日は従来どおり");
});

test("getOT: 片側セル（出勤だけ）の日は補完後の退勤で帯を判定する（ディナー扱いにしない）", () => {
  const settings = {
    candidates: [{ start: "09:00", end: "15:00" }, { start: "17:00", end: "23:00" }],
    overtimeSettings: { byStaff: { 田中: { lunch: 15, dinner: 60 } } },
  };
  const onlyStart = { status: "work", start: "09:00" };
  // 補完すると 09:00〜15:00 ＝ 両側そろったランチのシフトと同じレンジになる。
  // 生の end を見ていた頃はここが dinner(60) に落ち、純勤務が 6:15 ではなく 7:00 になっていた。
  assert.strictEqual(u.getOT("田中", settings, onlyStart), 15, "補完後の退勤15:00＝ランチ帯");
  assert.strictEqual(
    u.getOT("田中", settings, { status: "work", start: "09:00", end: "15:00" }),
    15,
    "両側そろったランチと同じ値になる"
  );
  assert.strictEqual(
    u.calcNetWorkMinutes(onlyStart, [], u.getOT("田中", settings, onlyStart), settings),
    6 * 60 + 15
  );
  // 退勤だけの日・両側そろったディナーは従来どおりディナー側
  assert.strictEqual(u.getOT("田中", settings, { status: "work", end: "23:00" }), 60);
  assert.strictEqual(u.getOT("田中", settings, { status: "work", start: "17:00", end: "23:00" }), 60);
  // settings に候補が無い＝補完できない呼び出しは従来の生の値による判定へフォールバックする
  const noCand = { overtimeSettings: settings.overtimeSettings };
  assert.strictEqual(u.getOT("田中", noCand, { status: "work", end: "14:00" }), 15);
  assert.strictEqual(u.getOT("田中", noCand, null), 60, "シフトが無い日は従来どおりディナー");
  assert.strictEqual(u.getOT("未登録", settings, onlyStart), 0, "設定の無い人は0");
  assert.strictEqual(u.getOT("田中", { overtimeSettings: { byStaff: { 田中: 20 } } }, onlyStart), 20, "レガシー数値");
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

// resolveSubByAlias（バグチェック#105）: 登録名subと別名subが併存したとき、どちらを採るか。
// 修正前の expXl は `find(登録名一致||別名一致)` ＝配列順で決めており、Firebaseのキー順しだいで
// グリッド・PDF と違うsubを採っていた。並び順に依存しないことをここで固定する。
const _dupSubs = () => [
  { id: "A", periodId: "p1", staffName: "たなか" },
  { id: "B", periodId: "p1", staffName: "田中" },
];
const _lookupBy = (list) => (n) => list.find((s) => s.staffName === n);

test("resolveSubByAlias: 登録名のsubを必ず優先する（別名subが先に並んでいても）", () => {
  const al = { "田中": ["たなか"] };
  assert.strictEqual(u.resolveSubByAlias(_lookupBy(_dupSubs()), "田中", al).id, "B");
});

test("resolveSubByAlias: 並び順を逆にしても同じsubを返す（配列順に依存しない）", () => {
  const al = { "田中": ["たなか"] };
  const rev = _dupSubs().reverse();
  assert.strictEqual(u.resolveSubByAlias(_lookupBy(rev), "田中", al).id, "B");
});

test("resolveSubByAlias: 登録名のsubが無ければ別名を登録順に探す", () => {
  const al = { "田中": ["たなか", "タナカ"] };
  const only = [{ id: "C", staffName: "タナカ" }, { id: "A", staffName: "たなか" }];
  assert.strictEqual(u.resolveSubByAlias(_lookupBy(only), "田中", al).id, "A");
});

test("resolveSubByAlias: どれにも当たらなければ undefined", () => {
  assert.strictEqual(u.resolveSubByAlias(_lookupBy([]), "田中", { "田中": ["たなか"] }), undefined);
  assert.strictEqual(u.resolveSubByAlias(_lookupBy(_dupSubs()), "佐藤", undefined), undefined);
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

test("extractNote: / と ／ は休み希望コマンド（時間付き9/は通常サフィックス＝メモ）", () => {
  for (const v of ["/", "／", " / ", " ／ "]) assert.strictEqual(u.extractNote(v).rest, true, `input: ${v}`);
  assert.strictEqual(u.extractNote("/").leaveType, null, "/ は種別を持たない（斜線のまま）");
  assert.strictEqual(u.extractNote("9/").rest, false);
  assert.strictEqual(u.extractNote("9/").numeric, "9");
  assert.strictEqual(u.extractNote("9/").note, "/");
  assert.strictEqual(u.extractNote("").rest, false);
});

// 休み希望は 2026-09-30 に y から / へ変えた（計画書 §3.9・決定 #16）。y・ｙ・休 は別名に残さない。
// 打たれたら休みにならず、他のコマンド外の文字と同じくメモとして残る（廃止の案内トーストは出さない）。
test("extractNote: 廃止した y・Y・ｙ・休 は休みにならずメモとして残る", () => {
  for (const v of ["y", "Y", "ｙ", "休"]) {
    const r = u.extractNote(v);
    assert.strictEqual(r.rest, false, `${v} が休みになっている`);
    assert.strictEqual(r.note, v, `${v} がメモとして残っていない`);
    assert.strictEqual(r.numeric, "");
  }
  assert.deepStrictEqual(u.extractNote("9y"), { numeric: "9", note: "y", rest: false, hasFixed: false });
  assert.deepStrictEqual(u.extractNote("9休"), { numeric: "9", note: "休", rest: false, hasFixed: false });
});

test("isRestCommand: / と ／ は true・廃止した y/ｙ/休 は false", () => {
  assert.strictEqual(u.isRestCommand("/"), true);
  assert.strictEqual(u.isRestCommand("／"), true);
  for (const v of ["y", "Y", "ｙ", "休"]) assert.strictEqual(u.isRestCommand(v), false, `${v}`);
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
  assert.ok(u.CELL_COMMANDS.some(c => c.kind === "rest" && c.key === "/" && c.usage === "/"), "rest command / missing");
  // 廃止した y・ｙ・休 はキーにも別名にも残っていない（レジェンドにも出ない）
  const restKeys = u.CELL_COMMANDS.filter(c => c.kind === "rest").flatMap(c => [c.key, ...(c.aliases || [])]);
  for (const v of ["y", "ｙ", "休"]) assert.ok(!restKeys.includes(v), `${v} がまだ休みコマンドに残っている`);
  assert.deepStrictEqual(u.CELL_COMMANDS.find(c => c.key === "/").aliases, ["／"]);
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

test("isReservedShopAbbr: 固定シフトコマンド(締)は『含む』だけで予約語（#133の回帰）", () => {
  // extractNote は締を部分一致で取り除くので、含む略称は登録できてはいけない。
  // 「西締」が登録できると、セル「9西締」は note="西" に化けて abbrToShop の完全一致lookupが
  // 必ず外れる（ヘルプ判定も店舗間重複判定も無言で止まる）。
  for (const v of ["締", "西締", "締西", "東締店"]) {
    assert.strictEqual(u.isReservedShopAbbr(v), true, `${v} が予約語として弾かれていない`);
    // 実際にパースが壊れることを同時に示す（note に元の略称が残らない）
    assert.notStrictEqual(u.extractNote("9" + v).note, v, `${v} は extractNote が原形を保っていない`);
  }
});

test("isReservedShopAbbr: suffix/rest は完全一致だけが予約語・通常の略称は通る（#133の非回帰）", () => {
  for (const v of ["h", "K", "x", "/", "／", "ko", "yu", "ke"]) assert.strictEqual(u.isReservedShopAbbr(v), true, `${v}`);
  // 廃止した y・ｙ・休 は休みコマンドではなくなったので予約語でもない（略称として登録できる）
  for (const v of ["y", "ｙ", "休"]) assert.strictEqual(u.isReservedShopAbbr(v), false, `${v}`);
  for (const v of ["2号", ".西", ":東", "", "   "]) assert.strictEqual(u.isReservedShopAbbr(v), true, `${v}`);
  // 既存の正常な略称は従来どおり登録できる（締を含まず、コマンドと完全一致もしない）
  for (const v of ["三", "西", "hk", "梅田", "東通"]) {
    assert.strictEqual(u.isReservedShopAbbr(v), false, `${v} が誤って弾かれた`);
    assert.strictEqual(u.extractNote("9" + v).note, v, `${v} のパースが壊れている`);
  }
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

// ===== diffPeriodsForFlatWrite（期間の差分書き込み）=====
// 2026-09-23 に本番で期間レコードが1件だけ消えた事故の再発防止。
// 「保存する端末が知らない期間には触らない」ことがこの関数の存在理由なので、
// 最初のテストが本丸（全体 set() だったころの実装では必ず落ちる）。
test("diffPeriodsForFlatWrite: 保存する端末が知らない期間には触らない（本番事故の再現）", () => {
  // 端末Aの periods は localStorage の前回値のままで、別端末が作った p_new を知らない
  const stale = [{ id: "p_old", label: "9月後半", startDate: "2026-09-16" }];
  const next = [{ id: "p_old", label: "9月後半（改）", startDate: "2026-09-16" }];
  const diff = u.diffPeriodsForFlatWrite(stale, next);
  assert.deepStrictEqual(diff, { "p_old/label": "9月後半（改）" });
  assert.ok(!("p_new" in diff));
  // update() の意味論では「payloadに無いキー＝触らない」なので p_new は残る
  const server = { p_old: stale[0], p_new: { id: "p_new", label: "10月前半" } };
  Object.entries(diff).forEach(([path, val]) => {
    const [id, key] = path.split("/");
    if (key === undefined) { if (val === null) delete server[id]; else server[id] = val; return; }
    server[id] = { ...server[id], [key]: val };
  });
  assert.deepStrictEqual(Object.keys(server).sort(), ["p_new", "p_old"]);
  assert.strictEqual(server.p_new.label, "10月前半");
});

test("diffPeriodsForFlatWrite: 新規の期間は丸ごと1エントリ（.validateのidを満たす）", () => {
  const np = { id: "p2", label: "10月前半", startDate: "2026-10-01" };
  assert.deepStrictEqual(u.diffPeriodsForFlatWrite([{ id: "p1" }], [{ id: "p1" }, np]), { p2: np });
});

test("diffPeriodsForFlatWrite: この端末が削除した期間だけを null にする", () => {
  const prev = [{ id: "p1", label: "A" }, { id: "p2", label: "B" }];
  assert.deepStrictEqual(u.diffPeriodsForFlatWrite(prev, [{ id: "p1", label: "A" }]), { p2: null });
});

test("diffPeriodsForFlatWrite: 変更が無ければ空（＝書き込みを発行しない）", () => {
  const list = [{ id: "p1", label: "A", keepStaff: [{ name: "田中", index: 0 }] }];
  assert.deepStrictEqual(u.diffPeriodsForFlatWrite(list, [{ id: "p1", label: "A", keepStaff: [{ name: "田中", index: 0 }] }]), {});
});

test("diffPeriodsForFlatWrite: 写しの更新は同じ期間の他フィールドを巻き込まない", () => {
  // シフト作成タブは期間を開くたび snapshot を自動で書く。キー単位（期間まるごと）だと
  // 他端末が直したばかりの label をここで巻き戻す
  const prev = [{ id: "p1", label: "A", snapshot: { staffList: ["田中"] } }];
  const next = [{ id: "p1", label: "A", snapshot: { staffList: ["田中", "鈴木"] } }];
  assert.deepStrictEqual(u.diffPeriodsForFlatWrite(prev, next), { "p1/snapshot": { staffList: ["田中", "鈴木"] } });
});

test("diffPeriodsForFlatWrite: 確定の解除で消えたフィールドは null で明示する", () => {
  const prev = [{ id: "p1", label: "A", snapshot: { staffList: ["田中"] }, lockedAt: "2026-09-01T00:00:00Z" }];
  const next = [{ id: "p1", label: "A" }];
  assert.deepStrictEqual(u.diffPeriodsForFlatWrite(prev, next), { "p1/snapshot": null, "p1/lockedAt": null });
});

test("diffPeriodsForFlatWrite: Firebaseが落とした空の入れ物を「変化」と読まない（写しの再書き込み）", () => {
  // buildPeriodSnapshot は既定設定の店舗でも breakTimes の空配列・staffAttributes の空オブジェクトを
  // そのまま含む。Firebaseはそれをキーごと落として返すので、素朴に比べると保存のたびに
  // 写し全体が書き込み対象になり、触っていない写しを古い state で上書きしうる（#142）
  const local = { staffList: ["田中"], settings: { staffAttributes: {}, breakTimes: { weekday: [], sat: [] }, candidates: [{ start: "09:00", end: "17:00" }] } };
  const server = { staffList: ["田中"], settings: { candidates: [{ start: "09:00", end: "17:00" }] } }; // 往復後
  assert.deepStrictEqual(u.diffPeriodsForFlatWrite([{ id: "p1", snapshot: server }], [{ id: "p1", snapshot: local }]), {});
  // 同じ理由で、空のまま持っているキーと「キーごと無い」も行き来で書き込みを生まない
  assert.deepStrictEqual(u.diffPeriodsForFlatWrite([{ id: "p1" }], [{ id: "p1", keepStaff: [], keepAttrs: {} }]), {});
  assert.deepStrictEqual(u.diffPeriodsForFlatWrite([{ id: "p1", keepStaff: [] }], [{ id: "p1" }]), {});
});

test("diffPeriodsForFlatWrite: 中身のある値が空になったときは消す（正規化で握りつぶさない）", () => {
  const prev = [{ id: "p1", keepStaff: [{ name: "佐藤", index: 1 }], keepAttrs: { 田中: "summer" } }];
  const next = [{ id: "p1", keepStaff: [], keepAttrs: {} }];
  assert.deepStrictEqual(u.diffPeriodsForFlatWrite(prev, next), { "p1/keepStaff": [], "p1/keepAttrs": {} });
});

test("diffPeriodsForFlatWrite: idを持たない要素・空リストで落ちない", () => {
  assert.deepStrictEqual(u.diffPeriodsForFlatWrite(null, undefined), {});
  assert.deepStrictEqual(u.diffPeriodsForFlatWrite([null, { label: "idなし" }], []), {});
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
  // 2026年GW: 5/2(土)〜5/3(日,祝)〜5/4(月,祝)〜5/5(火,祝)〜5/6(水,振替)の5日連続休み。5/4は最終日より前
  assert.strictEqual(u.dayTypeOf("2026-05-04"), "holSat");
});

test("dayTypeOf: 連休（2日以上の休み日の塊）の最終日はholSun", () => {
  // 同じGWの塊の最終日である5/6(水・振替休日)。
  // #110 で 2026-05-06 の振替休日を足すまで塊が5/5で終わっていたため、この行は 5/5 を最終日と書いていた。
  // 祝日テーブルの欠落は「その日が消える」だけでなく **隣の日の曜日区分まで変える**（＝休憩・必要ポジションが
  // 連休最終日の設定で適用されなくなる）ことの実例なので、5/5がholSatへ移ったことも併せて固定する。
  assert.strictEqual(u.dayTypeOf("2026-05-06"), "holSun");
  assert.strictEqual(u.dayTypeOf("2026-05-05"), "holSat");
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

// requiredPositionsFor: 必要ポジションも休憩と同じ旧"hol"後方互換を持つ（バグチェック#120）。
// 2026-07-10 に必要ポジションが入り、翌日 1cdcd6b で祝日を holSat/holSun に分けたが移行が無く、
// その1日に「祝日」で保存された枠は祝日の不足判定から黙って消えていた。
const holSlot = { lunch: { kitchen: ["調理長"], hall: [], all: [] }, dinner: { kitchen: [], hall: [], all: [] } };

test("requiredPositionsFor: 祝日区分が未設定なら旧holの枠を流用する", () => {
  const s = { requiredPositions: { hol: holSlot } };
  assert.deepStrictEqual(u.requiredPositionsFor(s, "2026-02-11"), holSlot); // holSat
  assert.deepStrictEqual(u.requiredPositionsFor(s, "2026-07-20"), holSlot); // holSun
});

test("requiredPositionsFor: 祝日区分に枠があれば旧holより優先する（空の器だけなら流用する）", () => {
  const own = { lunch: { kitchen: [], hall: ["リーダー"], all: [] }, dinner: { kitchen: [], hall: [], all: [] } };
  const empty = { lunch: { kitchen: [], hall: [], all: [] }, dinner: { kitchen: [], hall: [], all: [] } };
  assert.deepStrictEqual(u.requiredPositionsFor({ requiredPositions: { holSat: own, hol: holSlot } }, "2026-02-11"), own);
  assert.deepStrictEqual(u.requiredPositionsFor({ requiredPositions: { holSat: empty, hol: holSlot } }, "2026-02-11"), holSlot);
});

test("requiredPositionsFor: 旧holは祝日以外に波及せず、何も無ければ空オブジェクト", () => {
  const s = { requiredPositions: { hol: holSlot } };
  assert.deepStrictEqual(u.requiredPositionsFor(s, "2026-07-13"), {}); // 月曜
  assert.deepStrictEqual(u.requiredPositionsFor({}, "2026-02-11"), {});
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

// ===== deadlineGatePassed（変更あり判定の締切ゲート・バッジとセルの緑で共有・2026-09-20） =====
test("deadlineGatePassed: 締切なしは常に true（従来どおり常に変更マークを付ける）", () => {
  assert.strictEqual(u.deadlineGatePassed("", "2026-07-20T09:00:00.000Z"), true);
  assert.strictEqual(u.deadlineGatePassed(undefined, "2026-07-20T09:00:00.000Z"), true);
  assert.strictEqual(u.deadlineGatePassed(null, "2026-07-20T09:00:00.000Z"), true);
});

test("deadlineGatePassed: 締切内の変更は false・締切後の変更は true", () => {
  assert.strictEqual(u.deadlineGatePassed("2026-07-25", "2026-07-22T09:00:00.000Z"), false);
  assert.strictEqual(u.deadlineGatePassed("2026-07-25", "2026-07-28T09:00:00.000Z"), true);
});

test("deadlineGatePassed: 締切当日中は false・翌日以降は true（境界＝当日23:59:59まで締切内）", () => {
  // 締切のパースと同じローカル時刻表記で比較する（実行環境のTZに依存させない）
  assert.strictEqual(u.deadlineGatePassed("2026-07-25", "2026-07-25T23:59:59"), false);
  assert.strictEqual(u.deadlineGatePassed("2026-07-25", "2026-07-26T00:00:00"), true);
});

test("deadlineGatePassed: 締切日・時刻が不正なら通す（従来判定へフォールバック）", () => {
  assert.strictEqual(u.deadlineGatePassed("こわれた締切", "2026-07-22T09:00:00.000Z"), true);
  assert.strictEqual(u.deadlineGatePassed("2026-07-25", "こわれた時刻"), true);
});

test("deadlineGatePassed: 時刻を省略すると現在時刻で判定する", () => {
  const past = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
  const future = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  assert.strictEqual(u.deadlineGatePassed(past), true);
  assert.strictEqual(u.deadlineGatePassed(future), false);
});

test("deadlineGatePassed: ミリ秒（数値）でも判定できる（subHasRealUpdate からの呼び出し形）", () => {
  assert.strictEqual(u.deadlineGatePassed("2026-07-25", new Date("2026-07-22T09:00:00.000Z").getTime()), false);
  assert.strictEqual(u.deadlineGatePassed("2026-07-25", new Date("2026-07-28T09:00:00.000Z").getTime()), true);
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

// ===== 管理者の休み希望(adminRest)は実効値を抑制する（バグチェック#50）=====
// 管理者がシフト作成タブのセルに y／休 を入力すると adminRest[field] が立つだけで
// スタッフ提出の start/end/status は残る。読み出し側で抑制しないと、画面表示・休みカウント・
// ヒートマップは休み扱いなのに勤務時間と出勤日数の集計だけが提出値のまま計上される。
test("effShiftStart/effShiftEnd: adminRestが付いたフィールドは空文字（値なし）を返す", () => {
  const sh = { status: "work", start: "10:00", end: "18:00", adminRest: { start: true } };
  assert.strictEqual(u.effShiftStart(sh), "");
  assert.strictEqual(u.effShiftEnd(sh), "18:00");
  assert.strictEqual(u.effShiftStart(undefined), undefined);
});

test("effShiftStart: adminRestが無ければ adjustedStart→start の優先順を保つ", () => {
  assert.strictEqual(u.effShiftStart({ start: "10:00", adjustedStart: "12:00" }), "12:00");
  assert.strictEqual(u.effShiftStart({ start: "10:00" }), "10:00");
  assert.strictEqual(u.effShiftEnd({ end: "18:00", adjustedEnd: "20:00" }), "20:00");
});

test("calcNetWorkMinutes: adminRestが片側でも付けば主シフトは0分になる", () => {
  const base = { status: "work", start: "10:00", end: "18:00" };
  assert.strictEqual(u.calcNetWorkMinutes(base, []), 480); // 非回帰: 通常は従来どおり
  assert.strictEqual(u.calcNetWorkMinutes({ ...base, adminRest: { start: true } }, []), 0);
  assert.strictEqual(u.calcNetWorkMinutes({ ...base, adminRest: { end: true } }, []), 0);
  assert.strictEqual(u.calcNetWorkMinutes({ ...base, adminRest: { start: true, end: true } }, []), 0);
});

test("calcNetWorkMinutes: adminRestは管理者調整値(adjustedStart)より優先される", () => {
  const sh = { status: "work", start: "10:00", end: "18:00", adjustedStart: "12:00", adminRest: { start: true } };
  assert.strictEqual(u.calcNetWorkMinutes(sh, []), 0);
});

test("calcNetWorkMinutes: adminRestで主シフトが消えても「締」の追加出勤は残る", () => {
  // 追加出勤は adjustedStartFixed/adjustedEndFixed で独立に制御されるため adminRest では消えない
  const sh = { status: "work", start: "10:00", end: "18:00", adminRest: { start: true, end: true }, extraStart: "23:00", extraEnd: "25:00" };
  assert.strictEqual(u.calcNetWorkMinutes(sh, []), 120);
});

test("calcNetWorkMinutes: 空のadminRestオブジェクトは抑制しない", () => {
  assert.strictEqual(u.calcNetWorkMinutes({ status: "work", start: "10:00", end: "18:00", adminRest: {} }, []), 480);
});

test("shiftBandInfo: adminRestで主シフトが消えると出勤日数0、締があれば0.5", () => {
  const base = { status: "work", start: "10:00", end: "22:00" };
  assert.strictEqual(u.shiftBandInfo(base).attendance, 1); // 非回帰
  assert.strictEqual(u.shiftBandInfo({ ...base, adminRest: { start: true, end: true } }).attendance, 0);
  assert.strictEqual(
    u.shiftBandInfo({ ...base, adminRest: { start: true, end: true }, extraStart: "23:00", extraEnd: "25:00" }).attendance,
    0.5
  );
});

// ===== carryAdminShiftFields: スタッフ再提出時の管理者フィールド引き継ぎ（バグチェック#51）=====

test("ADMIN_SHIFT_FIELDS: 管理者が日ごとに書き込む全フィールドが登録されている", () => {
  // app-admin.js の applyEditToSubs / SubsTab が shift オブジェクトへ書く管理者フィールドの全量。
  // ここに載っていないフィールドはスタッフ再提出で消えるため、追加時は必ず両方を更新する。
  const expected = [
    "adjustedStart", "adjustedEnd", "adjustedStartNote", "adjustedEndNote",
    "adminRest", "extraStart", "extraEnd", "adjustedStartFixed", "adjustedEndFixed", "origStatus",
    "adjustedBreak", "leaveType", "leaveTypes",
  ];
  assert.deepStrictEqual([...u.ADMIN_SHIFT_FIELDS].sort(), expected.sort());
});

// ===== ADMIN_SHIFT_FIELDS のドリフト検出（バグチェック#144）=====
// 直上のテストは ADMIN_SHIFT_FIELDS を「手で書き写した同じ一覧」と突き合わせているだけで、
// app-admin.js の実装を一度も読まない。そのため #143 が手で見つけた「toggleChanged が書く
// changed が一覧に無い」を素通りさせていた（実測: app-admin.js に新フィールドを注入しても
// 直上のテストは落ちない）。定義側の「新しい管理者フィールドを追加したら必ずここに登録すること」
// というコメントを、コメントではなく機械で守らせるのがこのテスト。
//
// app-admin.js を AST で読み、シフト日オブジェクト（sub.shifts[日付]）へ実際に書かれるキーを
// 列挙して一覧と突き合わせる。文字列マスクではなく @babel/core の parseSync を使う
// （JSX・テンプレートリテラルを含むファイルを正規表現で読むと誤検出・見落としが出るため）。
// ===== 管理者画面の実装を読む検査の共通の読み口（2026-09-30 分割）=====
// app-admin.js が Babel Standalone の 500KB 上限を超えたため、企業連携タブ一式・SetTab・賃金マスタを
// app-company.js へそのまま移した。管理者画面の実装を読む検査（ドリフト検出など）は、移った関数も
// 移る前と同じに見る必要があるので、読み込み順（admin→shift→company）で連結した1本として読む。
// 同日の2回目の分割で、シフト作成タブ一式（ShiftEditTab・ActualsGrid・HeatTable 等）を app-shift.js へ
// そのまま移したので、それも admin と company の間に挟む（index.html の読み込み順と同じ）。
// どれも import/export の無いグローバルスクリプトなので、連結しても1つのスクリプトとして構文が成り立つ。
// 差し替え口: SHIFTY_ADMIN_SRC（app-admin.js の写し）・SHIFTY_SHIFT_SRC（app-shift.js の写し）・
// SHIFTY_COMPANY_SRC（app-company.js の写し）。
// 走査の検出力を対照で確かめるときに使う（配信物は編集すると自動コミットされるため写しで採る）。
function _readAdminSurface() {
  const fs = require("node:fs");
  const path = require("node:path");
  const admin = process.env.SHIFTY_ADMIN_SRC || path.join(__dirname, "..", "app-admin.js");
  const shift = process.env.SHIFTY_SHIFT_SRC || path.join(__dirname, "..", "app-shift.js");
  const company = process.env.SHIFTY_COMPANY_SRC || path.join(__dirname, "..", "app-company.js");
  return [admin, shift, company].map(f => fs.readFileSync(f, "utf8")).join("\n");
}

function collectShiftDayWrites(srcOverride) {
  const babel = require("@babel/core"); // devDependencies に宣言済み（@babel/parser は推移的依存なので直接requireしない）
  // 既定は配信物そのもの（app-admin.js＋app-shift.js＋app-company.js）。SHIFTY_ADMIN_SRC／SHIFTY_SHIFT_SRC／SHIFTY_COMPANY_SRC は
  // **この走査が本当に検出できるかを確かめる**ための差し替え口（_readAdminSurface）。
  // srcOverride はほかのファイル（app-utils.js・app-staff.js）を同じ規則で読むため（subs のルールのドリフト検出）。
  const src = srcOverride != null ? srcOverride : _readAdminSurface();
  const ast = babel.parseSync(src, {
    configFile: false, babelrc: false, sourceType: "script",
    parserOpts: { plugins: ["jsx"], errorRecovery: true },
  });
  const srcOf = n => src.slice(n.start, n.end);
  const walk = (node, fn) => {
    if (!node || typeof node.type !== "string") return;
    fn(node);
    for (const k of Object.keys(node)) {
      if (k === "loc" || k === "leadingComments" || k === "trailingComments") continue;
      const v = node[k];
      if (Array.isArray(v)) v.forEach(c => c && typeof c.type === "string" && walk(c, fn));
      else if (v && typeof v.type === "string") walk(v, fn);
    }
  };

  // シフト日オブジェクトを指す式:  shifts[date] / sh[date] / ns.shifts[date] …
  const isShiftDayMember = n =>
    !!n && n.type === "MemberExpression" && n.computed && /(^|\.)(shifts|sh)$/.test(srcOf(n.object));
  // シフト日オブジェクトを保持する変数:  const sd={...(shifts[date]||{status:"work"})} / const sd0={status:"work"}
  // **オブジェクトリテラルに限る**。アロー関数を通すと関数本体の同じ形に反応して関数名まで拾い、
  // `newSubs[idx]=sub` を書き込みとして誤検出する（実測で確認して絞り込んだ）。
  const shiftVars = new Set();
  walk(ast, n => {
    if (n.type !== "VariableDeclarator" || n.id.type !== "Identifier" || !n.init) return;
    if (n.init.type !== "ObjectExpression") return;
    const s = srcOf(n.init);
    if (/\.\.\.\s*\(?\s*(shifts|sh)\s*\[/.test(s) || /^\{\s*status\s*:/.test(s.replace(/\s+/g, " "))) {
      shiftVars.add(n.id.name);
    }
  });
  const isShiftBase = o => !!o && ((o.type === "Identifier" && shiftVars.has(o.name)) || isShiftDayMember(o));

  // 計算キーの解決。`const adjField = field==="start" ? "adjustedStart" : "adjustedEnd"` のような
  // 文字列リテラルだけの三項は両辺を採る。関数引数（saveAdj の field）は呼び出し側の実引数から採る。
  const ternaryVals = new Map();
  walk(ast, n => {
    if (n.type !== "VariableDeclarator" || n.id.type !== "Identifier" || !n.init) return;
    const strs = [];
    const collect = e => {
      if (!e) return false;
      if (e.type === "StringLiteral") { strs.push(e.value); return true; }
      if (e.type === "ConditionalExpression") return collect(e.consequent) && collect(e.alternate);
      return false;
    };
    if (collect(n.init)) ternaryVals.set(n.id.name, strs);
  });
  // 関数名 → 仮引数名の位置
  const fnParams = new Map();
  walk(ast, n => {
    if (n.type === "VariableDeclarator" && n.id.type === "Identifier" && n.init &&
        (n.init.type === "ArrowFunctionExpression" || n.init.type === "FunctionExpression")) {
      fnParams.set(n.id.name, n.init.params.map(p => (p.type === "Identifier" ? p.name : null)));
    }
    if (n.type === "FunctionDeclaration" && n.id) {
      fnParams.set(n.id.name, n.params.map(p => (p.type === "Identifier" ? p.name : null)));
    }
  });
  const paramVals = new Map(); // "fn:param" → [literal,...]
  walk(ast, n => {
    if (n.type !== "CallExpression" || n.callee.type !== "Identifier") return;
    const params = fnParams.get(n.callee.name);
    if (!params) return;
    n.arguments.forEach((a, i) => {
      if (a.type !== "StringLiteral" || !params[i]) return;
      const key = `${n.callee.name}:${params[i]}`;
      if (!paramVals.has(key)) paramVals.set(key, new Set());
      paramVals.get(key).add(a.value);
    });
  });
  // どの関数の中にいるかを辿れるよう、関数ノード→名前を持っておく
  const fnNameByNode = new Map();
  walk(ast, n => {
    if (n.type === "VariableDeclarator" && n.id.type === "Identifier" && n.init &&
        (n.init.type === "ArrowFunctionExpression" || n.init.type === "FunctionExpression")) {
      fnNameByNode.set(n.init, n.id.name);
    }
    if (n.type === "FunctionDeclaration" && n.id) fnNameByNode.set(n, n.id.name);
  });

  const written = new Set();
  const unresolved = [];
  const addKey = (keyNode, computed, enclosingFns) => {
    if (!computed && keyNode.type === "Identifier") { written.add(keyNode.name); return; }
    if (keyNode.type === "StringLiteral") { written.add(keyNode.value); return; }
    if (keyNode.type === "Identifier") {
      if (ternaryVals.has(keyNode.name)) { ternaryVals.get(keyNode.name).forEach(v => written.add(v)); return; }
      for (const fn of enclosingFns) {
        const vals = paramVals.get(`${fn}:${keyNode.name}`);
        if (vals) { vals.forEach(v => written.add(v)); return; }
      }
    }
    unresolved.push(srcOf(keyNode));
  };
  // 親を辿れないので、関数ノードの範囲で包含関係を判定する
  const fnRanges = [...fnNameByNode.entries()].map(([node, name]) => ({ name, start: node.start, end: node.end }));
  const enclosing = n => fnRanges.filter(f => f.start <= n.start && n.end <= f.end).map(f => f.name);

  walk(ast, n => {
    if (n.type === "AssignmentExpression" && n.left.type === "MemberExpression" && isShiftBase(n.left.object)) {
      addKey(n.left.property, n.left.computed, enclosing(n));
    }
    if (n.type === "UnaryExpression" && n.operator === "delete" &&
        n.argument.type === "MemberExpression" && isShiftBase(n.argument.object)) {
      addKey(n.argument.property, n.argument.computed, enclosing(n));
    }
    const litInto = props => props.forEach(p => { if (p.type === "ObjectProperty") addKey(p.key, p.computed, enclosing(p)); });
    if (n.type === "AssignmentExpression" && isShiftDayMember(n.left) && n.right.type === "ObjectExpression") litInto(n.right.properties);
    if (n.type === "VariableDeclarator" && n.id.type === "Identifier" && shiftVars.has(n.id.name) &&
        n.init && n.init.type === "ObjectExpression") litInto(n.init.properties);
  });
  return { written, unresolved, shiftVars: [...shiftVars] };
}

test("ADMIN_SHIFT_FIELDS: app-admin.js が実際に書くキーと一覧が食い違っていない（実装を読んで照合）", () => {
  const { written, unresolved, shiftVars } = collectShiftDayWrites();
  // 走査が機能していること自体を先に確かめる（「0件」が測定失敗でないことの担保）。
  assert.ok(shiftVars.length > 0, "シフト日オブジェクトを保持する変数を1つも見つけられていない＝走査が壊れている");
  assert.deepStrictEqual(unresolved, [],
    `シフト日への書き込みキーを解決できなかった: ${unresolved.join(" / ")}（テスト側の解決規則を足すこと）`);
  assert.ok(written.has("adjustedStart") && written.has("adminRest"),
    "既知の管理者フィールドを検出できていない＝走査が壊れている");

  // 一覧に載せない2つ。増やすときは理由を書くこと。
  const NOT_ADMIN_FIELDS = [
    // スタッフ提出値そのもの。再提出では buildShift がスタッフの新しい値で作り直すのが正しい。
    "status",
    // 管理者のトリプルクリックによる手動マーク。**一覧に無いのは既知の未修正**で、
    // BACKLOG「変更マーク（緑セル）と提出一覧のバッジが…」の③として起票済み（#143）。
    // 素直に登録すると carryAdminShiftFields が前回の「自動」マークまで引き継いでしまい、
    // buildShift の `delete nw.changed`（過去のchangedは作り直す）と衝突するため、
    // 案B（手動マークに別の印を持たせる）を決めるまで足せない。
    "changed",
  ];
  const expected = [...u.ADMIN_SHIFT_FIELDS, ...NOT_ADMIN_FIELDS].sort();
  assert.deepStrictEqual([...written].sort(), expected,
    "app-admin.js がシフト日へ書くキーと ADMIN_SHIFT_FIELDS が食い違っている。" +
    "新しい管理者フィールドなら ADMIN_SHIFT_FIELDS に登録する（登録しないとスタッフ再提出で黙って消える）。" +
    "引き継がないフィールドなら上の NOT_ADMIN_FIELDS に理由つきで足す。");
});

// ===== subs のルール（形の検証）のドリフト検出（2026-10-08）=====
// database.rules.json の shops/$shopId/subs/$subId は、提出の直下と日ごとの項目を許可制にしている
// （$other は書き込めない）。**クライアントに新しい項目を足してルールに足し忘れると、その書き込みが
// ルールに拒否されて黙って保存されない**（saveSubs は削除以外の拒否を console.warn にしか出さない）。
// このテストはクライアントが subs に書く項目を実装から読み出し、ルールが許す項目に入っていることを確かめる。
// 読む場所:
//   提出の直下 … 提出の形のオブジェクト（periodId・staffName・shifts を持つリテラル。条件付きの spread の中も）、
//                onSub/onEditSub に渡す {...sub, …}、subs の .map の中の {...s, …}（改名・調整値の保存）
//   日ごと     … 管理者画面（collectShiftDayWrites）・app-utils.js（固定勤務パターン）・app-staff.js（提出・セル編集）
function _babelAst(src) {
  const babel = require("@babel/core");
  return babel.parseSync(src, { configFile: false, babelrc: false, sourceType: "script", parserOpts: { plugins: ["jsx"], errorRecovery: true } });
}
function _walkAst(node, fn) {
  if (!node || typeof node.type !== "string") return;
  fn(node);
  for (const k of Object.keys(node)) {
    if (k === "loc" || k === "leadingComments" || k === "trailingComments") continue;
    const v = node[k];
    if (Array.isArray(v)) v.forEach(c => c && typeof c.type === "string" && _walkAst(c, fn));
    else if (v && typeof v.type === "string") _walkAst(v, fn);
  }
}
// 提出の直下に書く項目（全 app-*.js を連結した src から）
function collectSubTopWrites(src) {
  const ast = _babelAst(src);
  const srcOf = n => src.slice(n.start, n.end);
  const keys = new Set(), unresolved = [];
  const keyOf = p => {
    if (p.type !== "ObjectProperty") return;
    if (!p.computed && p.key.type === "Identifier") keys.add(p.key.name);
    else if (p.key.type === "StringLiteral") keys.add(p.key.value);
    else unresolved.push(srcOf(p.key));
  };
  // spread の中の条件付きオブジェクト: ...(cond?{a}:{b}) / ...(cond&&{a})
  const spreadObjs = e => {
    if (!e) return [];
    if (e.type === "ObjectExpression") return [e];
    if (e.type === "ConditionalExpression") return [...spreadObjs(e.consequent), ...spreadObjs(e.alternate)];
    if (e.type === "LogicalExpression") return spreadObjs(e.right);
    return [];
  };
  const take = obj => obj.properties.forEach(p => {
    if (p.type === "SpreadElement") spreadObjs(p.argument).forEach(take);
    else keyOf(p);
  });
  const hasKey = (obj, k) => obj.properties.some(p => p.type === "ObjectProperty" && !p.computed && p.key.type === "Identifier" && p.key.name === k);
  const spreadsIdent = obj => obj.properties.length && obj.properties[0].type === "SpreadElement" && obj.properties[0].argument.type === "Identifier";
  // .map の中（subs の配列）の範囲
  const mapRanges = [];
  _walkAst(ast, n => {
    if (n.type === "CallExpression" && n.callee.type === "MemberExpression" && !n.callee.computed &&
        n.callee.property.name === "map" && /(^|\.)(subs|newSubs|prevSubs)$/i.test(srcOf(n.callee.object))) {
      mapRanges.push({ start: n.start, end: n.end });
    }
  });
  _walkAst(ast, n => {
    if (n.type === "ObjectExpression" && hasKey(n, "periodId") && hasKey(n, "staffName") && hasKey(n, "shifts")) take(n);
    if (n.type === "CallExpression" && n.callee.type === "Identifier" && /^on(Edit)?Sub$/.test(n.callee.name)) {
      n.arguments.filter(a => a.type === "ObjectExpression").forEach(take);
    }
    if (n.type === "ObjectExpression" && spreadsIdent(n) && mapRanges.some(r => r.start <= n.start && n.end <= r.end)) take(n);
  });
  return { keys, unresolved };
}
// app-staff.js が日ごとに書く項目（提出の buildShift・提出状況一覧のセル編集・入力中の upd・一括反映）
function collectStaffDayWrites(src) {
  const ast = _babelAst(src);
  const srcOf = n => src.slice(n.start, n.end);
  const keys = new Set(), unresolved = [];
  const DAY_VARS = new Set(["nw", "next"]);
  // TimeWheelField の [f] は [["start",…],["end",…]].map(([f,l])=> から来る
  const fVals = /\[\["start","[^"]*"\],\["end","[^"]*"\]\]\.map\(\(\[f,/.test(src) ? ["start", "end"] : null;
  const keyOf = p => {
    if (p.type !== "ObjectProperty") return;
    if (!p.computed && p.key.type === "Identifier") keys.add(p.key.name);
    else if (p.key.type === "StringLiteral") keys.add(p.key.value);
    else if (p.key.type === "Identifier" && p.key.name === "f" && fVals) fVals.forEach(v => keys.add(v));
    else unresolved.push(srcOf(p.key));
  };
  _walkAst(ast, n => {
    const mem = n.type === "AssignmentExpression" ? n.left : (n.type === "UnaryExpression" && n.operator === "delete" ? n.argument : null);
    if (mem && mem.type === "MemberExpression" && mem.object.type === "Identifier" && DAY_VARS.has(mem.object.name)) {
      if (!mem.computed && mem.property.type === "Identifier") keys.add(mem.property.name); else unresolved.push(srcOf(mem));
    }
    if (n.type === "CallExpression" && n.callee.type === "Identifier" && n.callee.name === "upd" && n.arguments[1] && n.arguments[1].type === "ObjectExpression") {
      n.arguments[1].properties.forEach(keyOf);
    }
    // 一括反映: {...n[ds], status:…, start:…, end:…} と、日の既定値 {status:"holiday"}
    if (n.type === "ObjectExpression" && n.properties.length) {
      const p0 = n.properties[0];
      const spreadsDay = p0.type === "SpreadElement" && /^n\[ds\]$/.test(srcOf(p0.argument));
      const isDefault = /^\{\s*status\s*:/.test(srcOf(n));
      if (spreadsDay || isDefault) n.properties.forEach(keyOf);
    }
  });
  return { keys, unresolved };
}
function _allAppSrc() {
  const fs = require("node:fs");
  const path = require("node:path");
  return ["app-utils.js", "app-my-utils.js", "app-core.js", "app-staff.js", "app-admin.js", "app-shift.js", "app-company.js", "app-my.js", "app-main.js"]
    .map(f => fs.readFileSync(path.join(__dirname, "..", f), "utf8")).join("\n");
}
function _subsRuleKeys() {
  const fs = require("node:fs");
  const path = require("node:path");
  const S = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "database.rules.json"), "utf8")).rules.shops.$shopId.subs.$subId;
  const own = o => Object.keys(o).filter(k => !k.startsWith(".") && k !== "$other");
  return { S, D: S.shifts.$date, top: own(S), day: own(S.shifts.$date) };
}

test("subs ルール: 提出の直下と日ごとの項目は許可制（未知の項目・長すぎる値・名前の記号を拒否）", () => {
  const { S, D } = _subsRuleKeys();
  assert.strictEqual(S.$other[".validate"], false, "提出の直下の未知の項目は書けない");
  assert.strictEqual(D.$other[".validate"], false, "日ごとの未知の項目は書けない");
  assert.strictEqual(D.adminRest.$other[".validate"], false);
  assert.strictEqual(D.leaveTypes.$other[".validate"], false);
  assert.match(S[".validate"], /newData\.hasChildren\(\['id','staffName','periodId','shifts','submittedAt'\]\)/, "必須の項目");
  assert.match(D[".validate"], /\$date\.matches\(/, "日付のキーを検証する");
  // 既存の書き込み規則（確定済みの期間はオーナーだけ・デモ店舗は不可）は変えていない
  assert.ok(S[".write"].includes("demo-toriMatsu-v1") && (S[".write"].match(/child\('confirmation'\)\.exists\(\)/g) || []).length === 2);
  // 名前: 全員のシフト表へのスクリプト注入の多重防御として " < > と（空白以外の）制御的な空白を拒否
  const sn = S.staffName[".validate"];
  assert.ok(sn.includes("length <= 50") && sn.includes('matches(/["<>]/)') && sn.includes("matches(/\\s/)"), sn);
  assert.ok(sn.includes("replace(' ', '')") && sn.includes("replace('　', '')"), "半角・全角の空白は名前に使える（実データに半角空白の名前が多数ある）");
  assert.match(S.comment[".validate"], /length <= 500/, "コメントは入力欄（maxLength 500）と同じ上限");
  assert.match(S.id[".validate"], /newData\.val\(\) === \$subId/);
  // 休暇の種別はクライアントの LEAVE_TYPES と一致
  u.LEAVE_TYPES.forEach(t => {
    assert.ok(D.leaveTypes.start[".validate"].includes(`'${t}'`) && D.leaveTypes.end[".validate"].includes(`'${t}'`) && D.leaveType[".validate"].includes(`'${t}'`), t);
  });
  // 時刻の形はシフト作成タブのセル（parseTime: 0〜30時・分は 00〜59）と一致させる。30:00 を上限にする
  // 正規表現（実績の .validate と同じ）を当てると、parseTime が受け付ける "30:30" の保存が黙って拒否される
  const timeRe = new RegExp(D.adjustedStart[".validate"].match(/matches\(\/(.+?)\/\)/)[1]);
  ["00:00", "09:30", "23:45", "25:00", "29:59", "30:00", "30:30"].forEach(t => assert.ok(timeRe.test(t), t));
  ["9:00", "31:00", "24:60", "ab:cd", "09:00x"].forEach(t => assert.ok(!timeRe.test(t), t));
  ["start", "end", "adjustedStart", "adjustedEnd", "extraStart", "extraEnd"].forEach(k =>
    assert.strictEqual(D[k][".validate"], D.adjustedStart[".validate"], `${k} は同じ時刻の規則（空文字は管理者の「時間なし」の上書き）`));
});

test("subs ルール ドリフト検出: クライアントが subs に書く項目はすべてルールが許している", () => {
  const { top, day } = _subsRuleKeys();
  const fs = require("node:fs");
  const path = require("node:path");
  const all = _allAppSrc();
  const staffSrc = fs.readFileSync(path.join(__dirname, "..", "app-staff.js"), "utf8");
  const utilsSrc = fs.readFileSync(path.join(__dirname, "..", "app-utils.js"), "utf8");

  // 提出の直下
  const t = collectSubTopWrites(all);
  assert.deepStrictEqual(t.unresolved, [], "提出の直下へ書くキーを解決できなかった（テスト側の規則を足すこと）");
  // 走査が機能していること（0件が測定失敗でない担保）
  ["id", "periodId", "staffName", "shifts", "submittedAt", "comment", "source", "submitterUid", "updatedAt", "isUpdated", "shopId"]
    .forEach(k => assert.ok(t.keys.has(k), `走査が ${k} を見つけられていない＝走査が壊れている`));
  const topMissing = [...t.keys].filter(k => !top.includes(k));
  assert.deepStrictEqual(topMissing, [], `クライアントが提出の直下に書くのにルールが許していない項目: ${topMissing.join(",")}` +
    "（database.rules.json の shops/$shopId/subs/$subId に型と長さを決めて足す。足さないと書き込みが拒否される）");

  // 日ごと
  const admin = collectShiftDayWrites();
  const utilsW = collectShiftDayWrites(utilsSrc);
  const staffW = collectStaffDayWrites(staffSrc);
  assert.deepStrictEqual([...admin.unresolved, ...utilsW.unresolved, ...staffW.unresolved], [], "日ごとに書くキーを解決できなかった");
  ["status", "start", "end", "changed"].forEach(k => assert.ok(staffW.keys.has(k), `スタッフ側の走査が ${k} を見つけられていない＝走査が壊れている`));
  assert.ok(utilsW.written.has("adjustedBreak"), "固定勤務パターン（app-utils.js）の走査が壊れている");
  const dayWritten = new Set([...admin.written, ...utilsW.written, ...staffW.keys, ...u.ADMIN_SHIFT_FIELDS]);
  const dayMissing = [...dayWritten].filter(k => !day.includes(k));
  assert.deepStrictEqual(dayMissing, [], `クライアントが日ごとに書くのにルールが許していない項目: ${dayMissing.join(",")}` +
    "（database.rules.json の subs/$subId/shifts/$date に足す。日ごとは丸ごと書き直すので、1つでも漏れるとその日の保存がすべて拒否される）");

  // 対照: 新しい項目を足した写しを読むと、走査がそれを拾う（＝上の照合が素通りしない）
  const injTop = all.replace("comment:comment.trim()", "comment:comment.trim(),__probeTop:1");
  assert.notStrictEqual(injTop, all, "注入箇所（app-staff.js の提出の comment）が見つからない");
  assert.ok(collectSubTopWrites(injTop).keys.has("__probeTop"), "提出の直下に足した項目を走査が拾えない");
  const injStaff = staffSrc.replace("if(changed)nw.changed=true;", "if(changed)nw.changed=true;nw.__probeDay=1;");
  assert.notStrictEqual(injStaff, staffSrc, "注入箇所（buildShift の changed）が見つからない");
  assert.ok(collectStaffDayWrites(injStaff).keys.has("__probeDay"), "日ごとに足した項目を走査が拾えない");
});

test("carryAdminShiftFields: 管理者の休み希望(adminRest)が再提出で消えない", () => {
  const old = { status: "work", start: "9:00", end: "18:00", adjustedStart: "10:00", adminRest: { start: true, end: true } };
  const resubmitted = { status: "work", start: "9:00", end: "18:00" }; // Cookieなし端末＝管理者フィールドを持たない
  const nw = u.carryAdminShiftFields(resubmitted, old);
  assert.deepStrictEqual(nw.adminRest, { start: true, end: true });
  assert.strictEqual(nw.adjustedStart, "10:00");
  assert.strictEqual(u.calcNetWorkMinutes(nw, []), 0);   // 修正前は480分に戻っていた
  assert.strictEqual(u.shiftBandInfo(nw).attendance, 0); // 修正前は1日に戻っていた
});

test("carryAdminShiftFields: 「締」の追加出勤が引き継がれ status も work に戻る", () => {
  const old = { status: "work", origStatus: "holiday", adjustedStartFixed: true, extraStart: "23:00", extraEnd: "25:00" };
  const nw = u.carryAdminShiftFields({ status: "holiday" }, old);
  assert.strictEqual(nw.extraStart, "23:00");
  assert.strictEqual(nw.extraEnd, "25:00");
  assert.strictEqual(nw.adjustedStartFixed, true);
  assert.strictEqual(nw.status, "work");        // 戻さないと status!=="work" の早期returnで0分になる
  assert.strictEqual(nw.origStatus, "holiday"); // 締を消したときの復元先を保つ
  assert.strictEqual(u.calcNetWorkMinutes(nw, []), 120); // 修正前は0分に落ちていた
});

test("carryAdminShiftFields: 追加出勤フラグが無ければ status は書き換えない", () => {
  const nw = u.carryAdminShiftFields({ status: "holiday" }, { status: "work", start: "9:00", end: "18:00" });
  assert.strictEqual(nw.status, "holiday");
  assert.strictEqual(nw.origStatus, undefined);
});

test("carryAdminShiftFields: スタッフの新しい入力を管理者フィールドで上書きしない", () => {
  const old = { status: "work", adjustedStart: "10:00", adminRest: { start: true } };
  const nw = u.carryAdminShiftFields({ status: "work", adjustedStart: "13:00" }, old);
  assert.strictEqual(nw.adjustedStart, "13:00"); // 既に値がある側を優先
  assert.deepStrictEqual(nw.adminRest, { start: true });
});

test("carryAdminShiftFields: 旧シフトが無ければ素通し・入力オブジェクトを破壊しない", () => {
  const src = { status: "work", start: "9:00" };
  assert.deepStrictEqual(u.carryAdminShiftFields(src, null), src);
  const old = { status: "work", adminRest: { start: true } };
  u.carryAdminShiftFields(src, old);
  assert.strictEqual(src.adminRest, undefined); // srcは変更されない
});

// ===== スタッフ再提出（onSub）の差分書き込み =====
// 以前 onSub は sub 全体を set() しており、管理者が同じsubの別の日を編集した直後に
// スタッフが再提出すると、その編集ごと巻き戻していた。差分書き込みでそれが起きないことを固定する。
test("diffSubForFlatWrite: スタッフが触っていない日は書き込みパスに現れない（管理者の編集が残る）", () => {
  const serverSub = {
    id: "s1", staffName: "田中", periodId: "p1", submittedAt: "2026-08-01T00:00:00.000Z",
    shifts: {
      "2026-08-01": { status: "work", start: "10:00", end: "15:00" },
      // 管理者が 8/2 に調整値を入れた（スタッフ端末はこれを知らない可能性がある）
      "2026-08-02": { status: "work", start: "10:00", end: "15:00", adjustedStart: "11:00" },
    },
    comment: "",
  };
  // スタッフは 8/1 だけ変更して再提出する
  const resubmitted = {
    ...serverSub,
    shifts: {
      "2026-08-01": { status: "work", start: "12:00", end: "18:00" },
      "2026-08-02": serverSub.shifts["2026-08-02"],
    },
    updatedAt: "2026-08-03T00:00:00.000Z", isUpdated: true,
  };
  const flat = u.diffSubForFlatWrite("s1", serverSub, resubmitted);
  assert.ok("s1/shifts/2026-08-01" in flat, "変更した日は書き込む");
  assert.strictEqual("s1/shifts/2026-08-02" in flat, false, "触っていない日（管理者の調整値）は書き込まない");
  assert.strictEqual("s1" in flat, false, "sub全体の上書きにならない");
  assert.strictEqual(flat["s1/isUpdated"], true);
});

test("diffSubForFlatWrite: 内容が同じなら別オブジェクトでも変更扱いしない（再提出は全日付を作り直す）", () => {
  // StaffView は再提出のたびに shifts の全日付を buildShift で作り直すため、
  // 参照比較のままだと1日直しただけで全日付が書き込み対象になり差分書き込みが無効化される。
  const prev = {
    id: "s4", staffName: "高橋", periodId: "p1", submittedAt: "t",
    shifts: {
      "2026-08-01": { status: "work", start: "10:00", end: "15:00" },
      "2026-08-02": { status: "holiday" },
      "2026-08-03": { status: "work", start: "10:00", end: "15:00", adminRest: { start: true } },
    },
  };
  // 全日付を「同じ内容の新しいオブジェクト」で作り直し、8/1 だけ実際に変更する
  const rebuilt = {
    ...prev,
    shifts: {
      "2026-08-01": { status: "work", start: "12:00", end: "18:00" },
      "2026-08-02": { status: "holiday" },
      "2026-08-03": { status: "work", start: "10:00", end: "15:00", adminRest: { start: true } },
    },
  };
  const flat = u.diffSubForFlatWrite("s4", prev, rebuilt);
  assert.deepStrictEqual(Object.keys(flat), ["s4/shifts/2026-08-01"], "実際に変わった1日だけを書く");
});

test("diffSubForFlatWrite: ネストしたadminRestの中身が変われば検出する", () => {
  const prev = { id: "s5", staffName: "田中", periodId: "p1", submittedAt: "t",
    shifts: { "2026-08-01": { status: "work", adminRest: { start: true } } } };
  const next = { id: "s5", staffName: "田中", periodId: "p1", submittedAt: "t",
    shifts: { "2026-08-01": { status: "work", adminRest: { start: true, end: true } } } };
  assert.deepStrictEqual(Object.keys(u.diffSubForFlatWrite("s5", prev, next)), ["s5/shifts/2026-08-01"]);
});

test("diffSubForFlatWrite: 新規提出は sub 全体を書く（IDキー1件）", () => {
  const fresh = { id: "s2", staffName: "佐藤", periodId: "p1", shifts: {}, submittedAt: "2026-08-01T00:00:00.000Z" };
  const flat = u.diffSubForFlatWrite("s2", null, fresh);
  assert.deepStrictEqual(Object.keys(flat), ["s2"]);
  assert.strictEqual(flat.s2, fresh);
});

test("diffSubForFlatWrite: 何も変わっていなければ書き込みパスは0件（無駄な書き込みをしない）", () => {
  const sub = { id: "s3", staffName: "鈴木", periodId: "p1", shifts: { "2026-08-01": { status: "holiday" } }, submittedAt: "x" };
  const same = { ...sub, shifts: sub.shifts };
  assert.strictEqual(Object.keys(u.diffSubForFlatWrite("s3", sub, same)).length, 0);
});

// ===== isSpecialRedDate（平日に日祝系ポジション区分が設定された日の赤背景判定）=====
// 基準日: 2026-08-12(水・非祝日) / 2026-08-15(土) / 2026-08-16(日) / 2026-08-11(火・山の日)
const RED_WEEKDAY = "2026-08-12";
const posSettings = (dateStr, posType) => ({ dateCandidatePosTypes: { [dateStr]: posType } });

test("isSpecialRedDate: 平日に sun/holSat/holSun が設定されていれば true", () => {
  for (const t of ["sun", "holSat", "holSun"]) {
    assert.strictEqual(u.isSpecialRedDate(RED_WEEKDAY, posSettings(RED_WEEKDAY, t)), true, `posType=${t}`);
  }
});

test("isSpecialRedDate: 平日でも weekday/sat は対象外", () => {
  for (const t of ["weekday", "sat"]) {
    assert.strictEqual(u.isSpecialRedDate(RED_WEEKDAY, posSettings(RED_WEEKDAY, t)), false, `posType=${t}`);
  }
});

test("isSpecialRedDate: posTypeが未設定・settings欠損なら false", () => {
  assert.strictEqual(u.isSpecialRedDate(RED_WEEKDAY, posSettings("2026-08-13", "sun")), false); // 別の日付にだけ設定
  assert.strictEqual(u.isSpecialRedDate(RED_WEEKDAY, { dateCandidatePosTypes: {} }), false);
  assert.strictEqual(u.isSpecialRedDate(RED_WEEKDAY, {}), false);
  assert.strictEqual(u.isSpecialRedDate(RED_WEEKDAY, null), false);
});

test("isSpecialRedDate: 土曜・日曜は元々色があるため早期returnで false", () => {
  for (const d of ["2026-08-15", "2026-08-16"]) {
    assert.strictEqual(u.isHoliday(d), false, `${d} は祝日ではない前提`);
    assert.strictEqual(u.isSpecialRedDate(d, posSettings(d, "sun")), false, d);
  }
});

test("isSpecialRedDate: 実祝日（平日の山の日）は元々色があるため false", () => {
  const hol = "2026-08-11"; // 火曜・山の日
  assert.strictEqual(u.isHoliday(hol), true, "山の日が祝日として登録されている前提");
  assert.strictEqual(u.pd(hol).getDay(), 2, "平日（火曜）である前提");
  for (const t of ["sun", "holSat", "holSun"]) {
    assert.strictEqual(u.isSpecialRedDate(hol, posSettings(hol, t)), false, `posType=${t}`);
  }
});

// ===== プラン序列（PLAN_RANK_UI）=====
// クライアントの PLAN_RANK_UI は「アップグレードかダウングレードか」の判定に使われ、
// Cloud Functions 側の PLAN_RANK は更新イベントの降格防止ガードに使われる。
// 両者がずれると、画面では「アップグレード」と表示しながらサーバーは降格として扱う、
// といった食い違いが起きるため、値の一致をテストで固定する。
test("PLAN_RANK_UI: free < pro < premium の順序である", () => {
  assert.ok(u.PLAN_RANK_UI.free < u.PLAN_RANK_UI.pro, "free < pro");
  assert.ok(u.PLAN_RANK_UI.pro < u.PLAN_RANK_UI.premium, "pro < premium");
});

test("PLAN_RANK_UI: Cloud Functions 側の PLAN_RANK と同じ値である", () => {
  const fs = require("node:fs");
  const src = fs.readFileSync(require("node:path").join(__dirname, "..", "functions", "index.js"), "utf8");
  const m = src.match(/const PLAN_RANK\s*=\s*\{([^}]*)\}/);
  assert.ok(m, "functions/index.js に PLAN_RANK の定義が見つからない");
  const server = {};
  for (const part of m[1].split(",")) {
    const kv = part.split(":").map(x => x.trim());
    if (kv.length === 2 && kv[0]) server[kv[0]] = Number(kv[1]);
  }
  assert.deepStrictEqual(server, u.PLAN_RANK_UI,
    "PLAN_RANK（サーバー）と PLAN_RANK_UI（クライアント）の値が一致していない");
});

test("PLAN_RANK_UI: PLAN_LABELS と同じプラン名を漏れなく持つ", () => {
  assert.deepStrictEqual(Object.keys(u.PLAN_RANK_UI).sort(), Object.keys(u.PLAN_LABELS).sort());
});

// ===== 期間の確定（終了した期間のマスタ凍結）=====
const _basePeriod = { id: "p1", startDate: "2026-07-01", endDate: "2026-07-31" };
const _liveStaff = ["田中", "佐藤", "山田"];
const _liveSettings = {
  staffAttributes: { 田中: "employee" }, staffNumbers: { 田中: "001" },
  overtimeSettings: { byStaff: { 田中: { lunch: 30 } } }, breakTimes: { weekday: [{ start: "12:00", end: "13:00" }] },
  xlShopName: "現在の店舗名", periodUnit: "1month",
};

test("isPeriodEnded: 最終日当日はまだ終了ではない・翌日から終了", () => {
  assert.strictEqual(u.isPeriodEnded(_basePeriod, "2026-07-31"), false);
  assert.strictEqual(u.isPeriodEnded(_basePeriod, "2026-08-01"), true);
  assert.strictEqual(u.isPeriodEnded(_basePeriod, "2026-07-01"), false);
  assert.strictEqual(u.isPeriodEnded(null, "2026-08-01"), false);
  assert.strictEqual(u.isPeriodEnded({ id: "p" }, "2026-08-01"), false, "endDateが無ければ終了扱いにしない");
});

test("buildPeriodSnapshot: 凍結対象キーだけを写し取り、対象外は含めない", () => {
  const snap = u.buildPeriodSnapshot(_liveStaff, _liveSettings);
  assert.deepStrictEqual(snap.staffList, _liveStaff);
  assert.ok(snap.settings.staffAttributes && snap.settings.breakTimes);
  assert.strictEqual(snap.settings.xlShopName, undefined, "xlShopNameは凍結対象外");
  assert.strictEqual(snap.settings.periodUnit, undefined, "periodUnitは凍結対象外");
  snap.staffList.push("侵入");
  assert.strictEqual(_liveStaff.length, 3, "元のstaffListを破壊しない");
});

test("buildPeriodSnapshot: 日付キーの候補（dateCandidates系）は写さない＝periodsを肥大化させない", () => {
  const dateCandidates = {}, posTypes = {};
  for (let i = 0; i < 400; i++) {
    const d = new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString().slice(0, 10);
    dateCandidates[d] = [{ start: "09:00", end: "17:00" }];
    posTypes[d] = "weekday";
  }
  const snap = u.buildPeriodSnapshot(["田中"], { ..._liveSettings, dateCandidates, dateCandidatePosTypes: posTypes });
  assert.strictEqual(snap.settings.dateCandidates, undefined, "日付別候補は凍結しない");
  assert.strictEqual(snap.settings.dateCandidatePosTypes, undefined, "日付別の区分も凍結しない");
  assert.ok(snap.settings.breakTimes, "他の凍結対象は従来どおり写す");
  // 400日ぶんの候補を持つ店舗でも写しが1KB未満に収まること（起動時DL量の回帰検知）
  assert.ok(JSON.stringify(snap).length < 1024, `写しが大きすぎる: ${JSON.stringify(snap).length} bytes`);
});

test("resolvePeriodMaster: 確定済み期間でも日付別候補は現在値を使う（凍結対象外）", () => {
  const snap = u.buildPeriodSnapshot(["田中", "佐藤"], { positions: ["調理"] });
  const p = { ..._basePeriod, snapshot: snap };
  const now = { positions: ["フロア"], dateCandidates: { "2026-07-05": [{ start: "10:00", end: "15:00" }] } };
  const r = u.resolvePeriodMaster(p, ["田中"], now, "2026-08-24");
  assert.strictEqual(r.locked, true);
  assert.deepStrictEqual(r.settings.positions, ["調理"], "凍結対象は写しの値");
  assert.deepStrictEqual(r.settings.dateCandidates, now.dateCandidates, "日付別候補は現在値のまま渡る");
});

test("periodSnapshotEqual: Firebaseが空配列・空オブジェクトを落としても等価と判定する（書き込みループ防止）", () => {
  const a = u.buildPeriodSnapshot(["田中"], { staffAttributes: {}, staffNumbers: { 田中: "1" }, breakTimes: { weekday: [] } });
  const readBack = { staffList: ["田中"], settings: { staffNumbers: { 田中: "1" } } }; // 空が落ちた形
  assert.strictEqual(u.periodSnapshotEqual(a, readBack), true);
  assert.strictEqual(u.periodSnapshotEqual(a, { staffList: ["田中", "佐藤"], settings: { staffNumbers: { 田中: "1" } } }), false);
  assert.strictEqual(u.periodSnapshotEqual(undefined, u.buildPeriodSnapshot([], {})), true, "空の写しと未作成は等価");
});

test("resolvePeriodMaster: 終了前は現在値・終了後は写しを使う", () => {
  const snap = u.buildPeriodSnapshot(["田中", "退職者"], { staffAttributes: { 退職者: "parttime" } });
  const p = { ..._basePeriod, snapshot: snap };
  const before = u.resolvePeriodMaster(p, _liveStaff, _liveSettings, "2026-07-20");
  assert.strictEqual(before.locked, false);
  assert.deepStrictEqual(before.staffList, _liveStaff, "終了前は現在のstaffList");
  const after = u.resolvePeriodMaster(p, _liveStaff, _liveSettings, "2026-08-05");
  assert.strictEqual(after.locked, true);
  assert.deepStrictEqual(after.staffList, ["田中", "退職者"], "終了後は写しのstaffList＝削除済みスタッフの列が残る");
  assert.deepStrictEqual(after.settings.staffAttributes, { 退職者: "parttime" });
  assert.strictEqual(after.settings.staffNumbers, undefined, "写しに無い凍結対象キーは現在値を漏らさない");
  assert.strictEqual(after.settings.xlShopName, "現在の店舗名", "凍結対象外のキーは現在値のまま");
});

test("resolvePeriodMaster: 写しの無い過去期間は従来どおり現在値で動く", () => {
  const r = u.resolvePeriodMaster(_basePeriod, _liveStaff, _liveSettings, "2026-08-05");
  assert.strictEqual(r.locked, false);
  assert.deepStrictEqual(r.staffList, _liveStaff);
  assert.strictEqual(r.settings, _liveSettings);
});

test("resolvePeriodMaster: Firebaseがオブジェクト化して返したstaffListも配列として扱う", () => {
  const p = { ..._basePeriod, snapshot: { staffList: { 0: "田中", 1: "佐藤" }, settings: {} } };
  const r = u.resolvePeriodMaster(p, _liveStaff, _liveSettings, "2026-08-05");
  assert.strictEqual(r.locked, true);
  assert.deepStrictEqual(r.staffList, ["田中", "佐藤"]);
});

// ===== 削除済みスタッフを期間ごとに残す（period.keepStaff）=====
// スタッフ一覧から消しても、削除時のポップアップで「残す」と選んだ期間のシフト表には列を残す。
// 写し(snapshot)とは独立した足し算なので、確定済み期間の凍結を壊さず、期間の終了前にも効く。
test("mergeKeepStaff: 削除前の位置に戻す（末尾送りにしない）", () => {
  // 真ん中の人を消しても列の並びが変わらないこと。ここが崩れると配布済みのシフト表と列順がズレる
  assert.deepStrictEqual(
    u.mergeKeepStaff(["田中", "鈴木"], { keepStaff: [{ name: "佐藤", index: 1 }] }),
    ["田中", "佐藤", "鈴木"]);
  assert.deepStrictEqual(
    u.mergeKeepStaff(["佐藤", "鈴木"], { keepStaff: [{ name: "田中", index: 0 }] }),
    ["田中", "佐藤", "鈴木"], "先頭も先頭のまま");
  // スペーサー（キッチン/ホールの境界）より前の人は前のまま＝所属セクションが変わらない
  assert.deepStrictEqual(
    u.mergeKeepStaff(["田中", "__spacer__x", "高橋"], { keepStaff: [{ name: "佐藤", index: 1 }] }),
    ["田中", "佐藤", "__spacer__x", "高橋"]);
});

test("mergeKeepStaff: 複数人を残しても互いの位置がずれない", () => {
  // keepStaff の後ろ（＝最後に削除した人）から挿入しないと、先に入れた分だけ後続がずれる
  const r = u.mergeKeepStaff(["A", "D"], { keepStaff: [{ name: "C", index: 2 }, { name: "B", index: 1 }] });
  assert.deepStrictEqual(r, ["A", "B", "C", "D"]);
});

// StaffTab.confirmDelete と同じ式（位置は indexOf・除外は名前）で削除を再現する。
// index は「その削除の瞬間の一覧」での位置なので、削除の順番によって同じ人でも別の値になる。
const _delKeep = (list, keep, name) =>
  ({ list: list.filter(x => x !== name), keep: [...keep, { name, index: list.indexOf(name) }] });
const _restore = (orig, order) => {
  let list = [...orig], keep = [];
  order.forEach(n => { const r = _delKeep(list, keep, n); list = r.list; keep = r.keep; });
  return u.mergeKeepStaff(list, { keepStaff: keep });
};

test("mergeKeepStaff: 削除の順番が変わっても元の並びに戻る", () => {
  // 後ろの人から消した場合（index は元の一覧と同じ値になる＝以前から通っていたケース）
  assert.deepStrictEqual(_restore(["A", "B", "C", "D"], ["C", "B"]), ["A", "B", "C", "D"]);
  // 前の人から消した場合。2人目の index は1人目が抜けた一覧で採られるため、
  // index昇順に挿入すると ["A","C","B","D"] になっていた
  assert.deepStrictEqual(_restore(["A", "B", "C", "D"], ["B", "C"]), ["A", "B", "C", "D"]);
  assert.deepStrictEqual(_restore(["A", "B", "C", "D", "E"], ["A", "C", "E"]), ["A", "B", "C", "D", "E"]);
  assert.deepStrictEqual(_restore(["A", "B", "C"], ["A", "B", "C"]), ["A", "B", "C"]);
});

test("mergeKeepStaff: 残した人が空白列を跨いで別セクションへ移らない", () => {
  // 空白列(スペーサー)は ShiftEditTab の spIdx ＝キッチン/ホールの境界なので、
  // 位置がずれると列順だけでなく所属セクションまで変わる
  assert.deepStrictEqual(
    _restore(["A", "B", "__spacer__s1", "C"], ["B", "C"]),
    ["A", "B", "__spacer__s1", "C"],
    "C はスペーサーより後（ホール）のまま");
  assert.deepStrictEqual(
    _restore(["田中", "佐藤", "__spacer__s1", "鈴木", "高橋"], ["佐藤", "鈴木"]),
    ["田中", "佐藤", "__spacer__s1", "鈴木", "高橋"]);
});

test("mergeKeepStaff: 重複しない・Firebaseのオブジェクト形も受ける・壊れた値を無視する", () => {
  assert.deepStrictEqual(u.mergeKeepStaff(["田中"], { keepStaff: { 0: { name: "鈴木", index: 1 } } }), ["田中", "鈴木"]);
  assert.deepStrictEqual(u.mergeKeepStaff(["田中"], { keepStaff: [{ name: "田中", index: 0 }] }), ["田中"], "既に居る人を二重に足さない");
  assert.deepStrictEqual(u.mergeKeepStaff(["田中"], {}), ["田中"], "keepStaffが無ければ素通し");
  assert.deepStrictEqual(u.mergeKeepStaff(["田中"], null), ["田中"]);
  assert.deepStrictEqual(u.mergeKeepStaff(null, { keepStaff: [{ name: "鈴木", index: 0 }] }), ["鈴木"]);
  assert.deepStrictEqual(u.mergeKeepStaff(["田中"], { keepStaff: ["", null, 3, {}] }), ["田中"], "空・非文字列・名前なしは足さない");
  assert.deepStrictEqual(u.mergeKeepStaff(["田中"], { keepStaff: [{ name: "鈴木", index: 99 }] }), ["田中", "鈴木"], "範囲外の位置は末尾");
  assert.deepStrictEqual(u.mergeKeepStaff(["田中"], { keepStaff: [{ name: "鈴木", index: -5 }] }), ["鈴木", "田中"], "負の位置は先頭に丸める");
  assert.deepStrictEqual(u.mergeKeepStaff(["田中"], { keepStaff: ["鈴木"] }), ["田中", "鈴木"], "旧形式(名前だけ)は末尾");
});

test("isUnregisteredSubName: 期限付き削除で名前を残した期間では未登録扱いにしない", () => {
  const list = ["田中", "鈴木"];
  const aliases = { 田中: ["たなか"] };
  // 本番で起きた症状: 「9月後半まで残す」で削除した佐藤が9月後半に提出すると「別名を登録」が出た。
  const kept = { id: "p9b", keepStaff: [{ name: "佐藤", index: 2 }] };
  assert.strictEqual(u.isUnregisteredSubName("佐藤", list, aliases, kept), false,
    "keepStaff に載っている＝その期間のシフト表に列がある人は未登録ではない");
  assert.strictEqual(u.isUnregisteredSubName("佐藤", list, aliases, { id: "p10a" }), true,
    "残していない期間では従来どおり未登録として扱う");
  assert.strictEqual(u.isUnregisteredSubName("佐藤", list, aliases, null), true,
    "期間を渡さなければ keepStaff 抜き＝従来の判定");
  assert.strictEqual(u.isUnregisteredSubName("田中", list, aliases, kept), false, "登録名は未登録ではない");
  assert.strictEqual(u.isUnregisteredSubName("たなか", list, aliases, kept), false, "別名は未登録ではない");
  assert.strictEqual(u.isUnregisteredSubName("山田", list, aliases, kept), true, "本当に知らない名前だけ true");
  assert.strictEqual(u.isUnregisteredSubName("__spacer__1", list, aliases, kept), false, "空白列は名前ではない");
  assert.strictEqual(u.isUnregisteredSubName("", list, aliases, kept), false);
  assert.strictEqual(u.isUnregisteredSubName("山田", list, undefined, kept), true, "別名マップ未設定でも落ちない");
});

// 配信物を AST で読むための共通ヘルパー（#144 の collectShiftDayWrites と同じ設定）。
// **「禁止された書き方が残っていないこと」を主張するテストを正規表現で書かないこと。**
// 文字列の正規表現は書き方の揺れ（`settings.staffAliases` 経由・オプショナルチェーン・
// 改行・クォートの種類）を静かに見逃し、**見逃しても assert は通る**＝必ず通るテストになる。
// バグチェック#145 で実測: 移行前の2本はそれぞれ 7件中4件・5件中3件の再発形を見逃していた。
// envVar は走査の検出力を対照で確かめるための差し替え口（配信物は編集すると自動コミットされるため写しで採る）。
function _parseAppFile(relPath, envVar) {
  const fs = require("node:fs");
  const path = require("node:path");
  const babel = require("@babel/core"); // devDependencies に宣言済み
  // app-admin.js は切り出した app-shift.js・app-company.js と連結して読む（_readAdminSurface。2026-09-30 分割）
  const src = relPath === "app-admin.js" ? _readAdminSurface()
    : fs.readFileSync((envVar && process.env[envVar]) || path.join(__dirname, "..", relPath), "utf8");
  const ast = babel.parseSync(src, {
    configFile: false, babelrc: false, sourceType: "script",
    parserOpts: { plugins: ["jsx"], errorRecovery: true },
  });
  const srcOf = n => src.slice(n.start, n.end);
  const walk = (node, fn) => {
    if (!node || typeof node.type !== "string") return;
    fn(node);
    for (const k of Object.keys(node)) {
      if (k === "loc" || k === "leadingComments" || k === "trailingComments") continue;
      const v = node[k];
      if (Array.isArray(v)) v.forEach(c => c && typeof c.type === "string" && walk(c, fn));
      else if (v && typeof v.type === "string") walk(v, fn);
    }
  };
  return { src, ast, srcOf, walk };
}

test("isUnregisteredSubName: 未登録名の判定が app-admin.js に書き写されていない", () => {
  // 「提出された名前が名簿にも別名にも無いか」の入口は4つある（提出一覧の別名バッジ・
  // スタッフタブの未登録名・Excelの列構成・PDFの列構成）。keepStaff のような名簿の要素を
  // 後から足したとき、書き写した側だけが追随せず黙って食い違う（#105〜#108 と同じ形）。
  const found = [];
  let objectValuesSeen = 0, adminSrc = "";
  for (const [rel, env] of [["app-admin.js", "SHIFTY_ADMIN_SRC"], ["app-staff.js", "SHIFTY_STAFF_SRC"]]) {
    const { src, ast, srcOf, walk } = _parseAppFile(rel, env);
    if (rel === "app-admin.js") adminSrc = src;
    // 別名マップを中間変数に入れてから展開する形も拾う（app-admin.js:622 の
    // `const staffAliases=settings?.staffAliases||{}` のように名前が変わりうるため）。
    const aliasVars = new Set();
    walk(ast, n => {
      if (n.type === "VariableDeclarator" && n.id.type === "Identifier" && n.init &&
          /staffAlias/i.test(srcOf(n.init))) aliasVars.add(n.id.name);
    });
    walk(ast, n => {
      if (n.type !== "CallExpression") return;
      if (srcOf(n.callee) === "Object.values") objectValuesSeen++;
      const c = n.callee;
      if (!(c.type === "MemberExpression" && !c.computed &&
            c.property.type === "Identifier" && c.property.name === "flat")) return;
      const inner = c.object;
      if (!(inner && inner.type === "CallExpression" && srcOf(inner.callee) === "Object.values")) return;
      const arg = inner.arguments[0];
      if (!arg) return;
      if (/staffAlias/i.test(srcOf(arg)) || (arg.type === "Identifier" && aliasVars.has(arg.name))) {
        found.push(`${rel}: ${srcOf(n).replace(/\s+/g, " ").slice(0, 80)}`);
      }
    });
  }
  // 走査が機能していること自体を先に確かめる（「0件」が測定失敗でないことの担保）。
  assert.ok(objectValuesSeen > 0, "Object.values の呼び出しを1つも見つけられていない＝走査が壊れている");
  assert.deepStrictEqual(found, [],
    `別名リストの自前展開が残っている（isUnregisteredSubName を使うこと）: ${found.join(" / ")}`);
  const calls = (adminSrc.match(/isUnregisteredSubName\(/g) || []).length;
  assert.strictEqual(calls, 4,
    `app-admin.js の未登録名判定は4箇所（提出一覧・スタッフタブ・Excel・PDF）のはずが ${calls} 箇所`);
});

// choices は startDate 降順（新しい順）＝ StaffTab の delPeriodChoices と同じ並び
const _CH = [{ id: "p9a", label: "9月前半" }, { id: "p8b", label: "8月後半" }, { id: "p8a", label: "8月前半" }];

test("retainedPeriodIds: 「この期間まで残す」は時系列で読む（選んだ期間と、それより古い方に残す）", () => {
  // 本番で起きた取り違え: 「8月後半まで残す」を選んだのに、より新しい9月前半にも名前が出続けた。
  assert.deepStrictEqual(u.retainedPeriodIds(_CH, 2), ["p8b", "p8a"],
    "8月後半を選んだら 8月後半と8月前半。9月前半（より新しい）は含めない");
  assert.ok(!u.retainedPeriodIds(_CH, 2).includes("p9a"), "選んだ期間より新しい期間からは外す");
  assert.deepStrictEqual(u.retainedPeriodIds(_CH, 1), ["p9a", "p8b", "p8a"], "最新を選べば全部に残る");
  assert.deepStrictEqual(u.retainedPeriodIds(_CH, 3), ["p8a"], "いちばん古いのを選べばそれだけ");
});

// 削除ポップアップを開いた瞬間の既定（2026-08-31 決定・案B）。choices は新しい順。
const _CHD = [
  { id: "p9a", label: "9月前半", endDate: "2026-09-15" },
  { id: "p8b", label: "8月後半", endDate: "2026-08-31" },
  { id: "p8a", label: "8月前半", endDate: "2026-08-15" },
];

test("defaultKeepCount: 既定は「いちばん新しい終了済みの期間まで残す」", () => {
  // 2026-09-01 時点: 9月前半はまだ終わっていない、8月後半が終了済みの最新。
  assert.strictEqual(u.defaultKeepCount(_CHD, "2026-09-01"), 2, "8月後半（index1）を選んだ状態で開く");
  // 修正前の既定（1＝最新の期間まで残す）だと、これから配る9月前半にも名前が残っていた。
  assert.ok(!u.retainedPeriodIds(_CHD, u.defaultKeepCount(_CHD, "2026-09-01")).includes("p9a"),
    "既定のまま確定しても、これから配る期間には名前を残さない");
  assert.deepStrictEqual(u.retainedPeriodIds(_CHD, u.defaultKeepCount(_CHD, "2026-09-01")), ["p8b", "p8a"],
    "配り終えた期間には残る（機能の当初の動機を壊さない）");
});

test("defaultKeepCount: 終了済みの期間が無ければ「どの期間にも残さない」", () => {
  assert.strictEqual(u.defaultKeepCount(_CHD, "2026-08-01"), 0, "全期間がまだ終わっていない");
  assert.deepStrictEqual(u.retainedPeriodIds(_CHD, u.defaultKeepCount(_CHD, "2026-08-01")), []);
  assert.strictEqual(u.defaultKeepCount(_CHD, "2026-08-15"), 0, "最終日当日はまだ終わっていない");
  assert.strictEqual(u.defaultKeepCount(_CHD, "2026-08-16"), 3, "翌日から終了済み＝8月前半が選ばれる");
});

test("defaultKeepCount: 壊れた入力・期間なしは0（残さない側に倒す）", () => {
  assert.strictEqual(u.defaultKeepCount([], "2026-09-01"), 0);
  assert.strictEqual(u.defaultKeepCount(null, "2026-09-01"), 0);
  assert.strictEqual(u.defaultKeepCount(_CHD, ""), 0, "今日が取れなければ残さない");
  assert.strictEqual(u.defaultKeepCount([{ id: "x" }, null], "2026-09-01"), 0, "endDateが無い期間は終了済みと見なさない");
  assert.strictEqual(u.defaultKeepCount([{ id: "x" }, { id: "y", endDate: "2026-01-01" }], "2026-09-01"), 2,
    "endDateの無い期間は飛ばして、その先の終了済みを選ぶ");
});

test("retainedPeriodIds: 0・範囲外・壊れた入力はどこにも残さない", () => {
  assert.deepStrictEqual(u.retainedPeriodIds(_CH, 0), [], "「どの期間にも残さない」");
  assert.deepStrictEqual(u.retainedPeriodIds(_CH, -1), []);
  assert.deepStrictEqual(u.retainedPeriodIds(_CH, undefined), []);
  assert.deepStrictEqual(u.retainedPeriodIds([], 2), []);
  assert.deepStrictEqual(u.retainedPeriodIds(null, 2), []);
  assert.deepStrictEqual(u.retainedPeriodIds(_CH, 99), [], "選択位置が件数を超えたら空");
  assert.deepStrictEqual(u.retainedPeriodIds([{ id: "a" }, null, {}], 1), ["a"], "idの無い要素は落とす");
});

test("resolvePeriodMaster: keepStaff は終了前の期間でも名簿に残る（写しはまだ採用されない時期）", () => {
  const p = { ..._basePeriod, keepStaff: [{ name: "退職者", index: 0 }] };
  const r = u.resolvePeriodMaster(p, _liveStaff, _liveSettings, "2026-07-20"); // 終了前
  assert.strictEqual(r.locked, false, "keepStaff は確定扱いにしない");
  assert.deepStrictEqual(r.staffList, ["退職者", ..._liveStaff], "index=0 なので先頭に戻る");
});

test("resolvePeriodMaster: keepStaff は確定済み期間の写しにも足す（写し自体は書き換えない）", () => {
  const snap = u.buildPeriodSnapshot(["田中", "高橋"], {});
  const p = { ..._basePeriod, snapshot: snap, keepStaff: [{ name: "退職者", index: 1 }] };
  const r = u.resolvePeriodMaster(p, _liveStaff, _liveSettings, "2026-08-05"); // 終了後
  assert.strictEqual(r.locked, true);
  assert.deepStrictEqual(r.staffList, ["田中", "退職者", "高橋"]);
  assert.deepStrictEqual(snap.staffList, ["田中", "高橋"], "写しの中身は変わらない");
});

test("resolvePeriodMaster: 確定済みの写しに既に居る人は keepStaff で二重に出ない", () => {
  const p = { ..._basePeriod, snapshot: u.buildPeriodSnapshot(["田中", "退職者"], {}), keepStaff: [{ name: "退職者", index: 1 }] };
  const r = u.resolvePeriodMaster(p, _liveStaff, _liveSettings, "2026-08-05");
  assert.deepStrictEqual(r.staffList, ["田中", "退職者"]);
});

test("resolvePeriodMaster: keepStaff を持たない期間は従来と1バイトも変わらない", () => {
  const p = { ..._basePeriod, snapshot: u.buildPeriodSnapshot(["田中", "佐藤"], {}) };
  assert.deepStrictEqual(u.resolvePeriodMaster(p, _liveStaff, _liveSettings, "2026-08-05").staffList, ["田中", "佐藤"]);
  assert.deepStrictEqual(u.resolvePeriodMaster(p, _liveStaff, _liveSettings, "2026-07-20").staffList, _liveStaff);
});

// ===== 属性を期間ごとに残す（period.keepAttrs）=====
// 夏休みだけ上限の大きい属性にして元へ戻したとき、配り終えた期間まで新しい上限で再判定されて
// 上限超過エラーが出る、という報告への対応（2026-09-08）。旧属性を期間側へ書き置いて解決する。
test("keepAttrsOf: 文字列の値だけを拾い、空・非オブジェクトは null", () => {
  assert.deepStrictEqual(u.keepAttrsOf({ keepAttrs: { 田中: "summer" } }), { 田中: "summer" });
  assert.strictEqual(u.keepAttrsOf({ keepAttrs: {} }), null, "空マップは指定なし扱い");
  assert.strictEqual(u.keepAttrsOf({}), null);
  assert.strictEqual(u.keepAttrsOf(null), null);
  assert.strictEqual(u.keepAttrsOf({ keepAttrs: true }), null, "非オブジェクトは無視");
  assert.deepStrictEqual(u.keepAttrsOf({ keepAttrs: { 田中: "", 佐藤: 3, 山田: "employee" } }), { 山田: "employee" },
    "空文字・非文字列の値は落とす");
});

test("applyKeepAttrs: 指定が無ければ同じ参照を返す（持たない期間は従来と変わらない）", () => {
  assert.strictEqual(u.applyKeepAttrs(_liveSettings, _basePeriod), _liveSettings);
  assert.strictEqual(u.applyKeepAttrs(_liveSettings, { keepAttrs: {} }), _liveSettings);
});

test("applyKeepAttrs: staffAttributes だけを差し替え、元の settings を壊さない", () => {
  const r = u.applyKeepAttrs(_liveSettings, { keepAttrs: { 田中: "summer" } });
  assert.strictEqual(r.staffAttributes.田中, "summer");
  assert.strictEqual(r.xlShopName, "現在の店舗名", "他のキーはそのまま");
  assert.strictEqual(_liveSettings.staffAttributes.田中, "employee", "元のsettingsは破壊しない");
});

test("applyKeepAttrs: 指定の無い人の属性は現在値のまま残る", () => {
  const s = { staffAttributes: { 田中: "employee", 佐藤: "parttime" } };
  const r = u.applyKeepAttrs(s, { keepAttrs: { 田中: "summer" } });
  assert.deepStrictEqual(r.staffAttributes, { 田中: "summer", 佐藤: "parttime" });
});

test("resolvePeriodMaster: keepAttrs は終了前の期間にも効く（写しがまだ採用されない時期）", () => {
  const p = { ..._basePeriod, keepAttrs: { 田中: "summer" } };
  const r = u.resolvePeriodMaster(p, _liveStaff, _liveSettings, "2026-07-20");
  assert.strictEqual(r.locked, false);
  assert.strictEqual(r.settings.staffAttributes.田中, "summer");
});

test("resolvePeriodMaster: 確定済みの写しと食い違ったら keepAttrs が勝つ", () => {
  // 写しは「その期間を開いた瞬間の値」を受動的に撮ったもの。keepAttrs は管理者がその期間を
  // 名指しで指定した記録なので、あとから入った明示の指定を優先する。
  const snap = u.buildPeriodSnapshot(_liveStaff, { staffAttributes: { 田中: "parttime" } });
  const p = { ..._basePeriod, snapshot: snap, keepAttrs: { 田中: "summer" } };
  const r = u.resolvePeriodMaster(p, _liveStaff, _liveSettings, "2026-08-05");
  assert.strictEqual(r.locked, true);
  assert.strictEqual(r.settings.staffAttributes.田中, "summer");
  assert.strictEqual(snap.settings.staffAttributes.田中, "parttime", "写しの中身は変わらない");
});

// 属性を削除しても keepAttrs は掃除されない（SetTab の deleteType は periods を props に持たない）。
// 消えたIDを当てると staffTypeLimits の引きが undefined になり、読み手が typeLim を全0の既定へ
// 落として **上限判定そのものが走らなくなる**——掃除された他の人は "parttime" にフォールバックして
// 上限が効くので、固定した人だけエラーが出ない（バグチェック#119）。
test("applyKeepAttrs: 削除済みの属性を指す指定は当てない（固定した人だけ上限が消えるのを防ぐ）", () => {
  const stl = { employee: { name: "社員" }, parttime: { name: "バイト", weekly: 28 } };
  const s = { staffTypeLimits: stl, staffAttributes: { 鈴木: "parttime" } };
  // custom_summer は deleteType が staffTypeLimits から消した後＝もう引けない
  const r = u.applyKeepAttrs(s, { keepAttrs: { 田中: "custom_summer" } });
  assert.strictEqual(r, s, "当てるものが1件も無ければ同じ参照を返す");
  assert.strictEqual((r.staffAttributes || {}).田中, undefined,
    "指定を当てないので、掃除済みの他の人と同じ既定（parttime）へフォールバックする");
});

test("applyKeepAttrs: 生きている属性の指定は当てる／死んだ指定だけを落とす", () => {
  const s = {
    staffTypeLimits: { employee: { name: "社員" }, parttime: { name: "バイト" }, custom_a: { name: "夏季" } },
    staffAttributes: {},
  };
  const r = u.applyKeepAttrs(s, { keepAttrs: { 田中: "custom_a", 佐藤: "custom_gone", 山田: "employee" } });
  assert.strictEqual(r.staffAttributes.田中, "custom_a", "実在する custom は当てる");
  assert.strictEqual(r.staffAttributes.山田, "employee", "組み込みは常に当てる");
  assert.strictEqual(r.staffAttributes.佐藤, undefined, "消えた custom だけ落とす");
});

test("applyKeepAttrs: staffTypeLimits を持たない settings では何も落とさない（消えた証拠が無い）", () => {
  // 上限を1つも設定していない店舗と「その属性が削除された」は区別できない。ここで落とすと
  // 上限には影響しないのに staffAttributes だけが変わり、休憩の属性タグが別の休憩を引く。
  const r = u.applyKeepAttrs({ staffAttributes: {} }, { keepAttrs: { 田中: "summer" } });
  assert.strictEqual(r.staffAttributes.田中, "summer");
});

test("attrIdExists: 組み込みは常に有効・一覧が無ければ有効・一覧にあれば有効", () => {
  assert.strictEqual(u.attrIdExists({ staffTypeLimits: {} }, "parttime"), true, "組み込みは消せない");
  assert.strictEqual(u.attrIdExists({ staffTypeLimits: {} }, "custom_x"), false);
  assert.strictEqual(u.attrIdExists({}, "custom_x"), true, "一覧そのものが無ければ判定しない");
  assert.strictEqual(u.attrIdExists({ staffTypeLimits: { custom_x: { name: "夏" } } }, "custom_x"), true);
  assert.ok(u.BUILTIN_TYPES.includes("employee") && u.BUILTIN_TYPES.includes("parttime"),
    "判定は SetTab の削除ボタンと同じ BUILTIN_TYPES を使う（一覧を書き写さない）");
});

test("resolvePeriodMaster: 確定済み期間は写しが属性を覚えている限り指定が生き続ける", () => {
  // 凍結の意味を壊さないための性質。判定に使う staffTypeLimits は「その期間を支配する側」。
  const snap = u.buildPeriodSnapshot(_liveStaff, {
    staffTypeLimits: { employee: { name: "社員" }, parttime: { name: "バイト" }, custom_a: { name: "夏季" } },
    staffAttributes: { 田中: "parttime" },
  });
  const p = { ..._basePeriod, snapshot: snap, keepAttrs: { 田中: "custom_a" } };
  // 現在の settings からは削除済み。それでも写しが覚えているので確定済み期間では効く
  const now = { staffTypeLimits: { employee: { name: "社員" }, parttime: { name: "バイト" } } };
  const r = u.resolvePeriodMaster(p, _liveStaff, now, "2026-08-05");
  assert.strictEqual(r.locked, true);
  assert.strictEqual(r.settings.staffAttributes.田中, "custom_a");
  // 同じ期間がまだ終わっていなければ現在値で判定する＝消えた属性は当たらない
  const live = u.resolvePeriodMaster(p, _liveStaff, now, "2026-07-20");
  assert.strictEqual(live.locked, false);
  assert.strictEqual((live.settings.staffAttributes || {}).田中, undefined);
});

test("renameStaffInPeriods: keepAttrs のキーも移す（写しを持たない期間でも）", () => {
  // 移し替えないと改名した瞬間に過去期間の属性指定が引けなくなり、現在の属性で再判定される
  // ＝消したはずの上限超過エラーが黙って戻る（#107 と同じ形）。
  const periods = [{ id: "p1", keepAttrs: { 田中: "summer" } }, { id: "p2" }];
  const r = u.renameStaffInPeriods(periods, "田中", "田中 太郎");
  assert.strictEqual(r.changed, true);
  assert.deepStrictEqual(r.periods[0].keepAttrs, { "田中 太郎": "summer" });
  assert.strictEqual(r.periods[1], periods[1], "関係ない期間は同じ参照のまま");
  assert.deepStrictEqual(periods[0].keepAttrs, { 田中: "summer" }, "元の配列は破壊しない");
});

test("renameStaffInPeriods: keepAttrs と写しの両方を1回で移す", () => {
  const snap = u.buildPeriodSnapshot(["田中"], { staffAttributes: { 田中: "employee" } });
  const r = u.renameStaffInPeriods([{ id: "p1", snapshot: snap, keepAttrs: { 田中: "summer" } }], "田中", "T");
  assert.deepStrictEqual(r.periods[0].keepAttrs, { T: "summer" });
  assert.deepStrictEqual(r.periods[0].snapshot.staffList, ["T"]);
  assert.strictEqual(r.periods[0].snapshot.settings.staffAttributes.T, "employee");
});

test("renameStaffInPeriods: 凍結した労務の合計（laborTotals）のキーも移す", () => {
  // 移さないと終わった期間の年度累計・有給の消化・月の残業予定が旧名に取り残され、
  // 改名後は「読めていない期間」扱いになる（有給残が多く出る／36協定の年判定が月を見落とす・#148）。
  const periods = [
    { id: "p1", startDate: "2026-04-01", endDate: "2026-04-30", laborTotals: { 田中: { workMin: 10000, paid: 1, monthOtH: 50 }, 佐藤: { workMin: 1 } } },
    { id: "p2", startDate: "2026-05-01", endDate: "2026-05-31", laborTotals: { 佐藤: { workMin: 2 } } },
  ];
  const r = u.renameStaffInPeriods(periods, "田中", "田中太郎");
  assert.strictEqual(r.changed, true);
  assert.deepStrictEqual(r.periods[0].laborTotals, { 田中太郎: { workMin: 10000, paid: 1, monthOtH: 50 }, 佐藤: { workMin: 1 } });
  assert.strictEqual(r.periods[1], periods[1], "その人の合計を持たない期間は同じ参照のまま");
  const ys = u.yearLaborSummary(r.periods, "田中太郎", 2026, 4, () => null);
  assert.strictEqual(ys.workMin, 10000);
  assert.strictEqual(ys.paid, 1);
  const yo = u.yearOvertimeMonths(r.periods, "田中太郎", 2026, 4, () => null);
  assert.deepStrictEqual(yo.missingMonths, ["2026-05"], "4月は凍結値から読める（5月は田中の合計を持たない）");
  assert.strictEqual(yo.list[0].h, 50);
});

test("renameStaffInPeriods: keepAttrs に居ない人の改名では何も起きない", () => {
  const periods = [{ id: "p1", keepAttrs: { 佐藤: "summer" } }];
  const r = u.renameStaffInPeriods(periods, "田中", "T");
  assert.strictEqual(r.changed, false);
  assert.strictEqual(r.periods[0], periods[0]);
});

// ===== スタッフ名のFirebase禁止文字 =====
// 名前は staffColors 等7つの設定マップでキーになる。禁止文字を含むと set() が同期例外を投げ、
// fbW の .catch では拾えないまま保存が失われる（バグチェック#89）。
test("firebaseKeyForbiddenChars: Firebaseがキーに使えない文字を検出する", () => {
  assert.deepStrictEqual(u.firebaseKeyForbiddenChars("田中.太郎"), ["."]);
  assert.deepStrictEqual(u.firebaseKeyForbiddenChars("A/B"), ["/"]);
  assert.deepStrictEqual(u.firebaseKeyForbiddenChars("山田#2"), ["#"]);
  assert.deepStrictEqual(u.firebaseKeyForbiddenChars("S$1"), ["$"]);
  assert.deepStrictEqual(u.firebaseKeyForbiddenChars("X[1]"), ["[", "]"]);
  assert.deepStrictEqual(u.firebaseKeyForbiddenChars("タブ\t入り"), ["制御文字"]);
});

test("firebaseKeyForbiddenChars: 通常の名前は通す（スペース・ハイフン・全角記号を弾かない）", () => {
  ["田中", "田中 太郎", "Anne-Marie", "佐藤(店長)", "Ｍ．ケン", "__spacer__abc"].forEach(n => {
    assert.deepStrictEqual(u.firebaseKeyForbiddenChars(n), [], n);
  });
  assert.deepStrictEqual(u.firebaseKeyForbiddenChars(""), []);
  assert.deepStrictEqual(u.firebaseKeyForbiddenChars(null), []);
});

test("firebaseKeyForbiddenChars: 同じ文字が複数あっても1回だけ返す", () => {
  assert.deepStrictEqual(u.firebaseKeyForbiddenChars("a.b.c"), ["."]);
});

// ===== Cookie名に使う文字列の "=" 除去 =====
// ブラウザはCookieを最初の "=" で名前と値に分ける。genSecureId は "=" を含むため、
// "=" を持つ shopId から作った ckStaffKey は名前が切られ、同じ店舗の全期間が
// 1つのCookieを共有してしまう（バグチェック#90・Chromium/WebKitで実測）。
const CK = (shopId, periodId) => u.cookieSafeKey(`ots_staff_${shopId}_${periodId}`);

test("cookieSafeKey: '=' を含む shopId でも期間ごとに別のCookie名になる", () => {
  const withEq = "mKdff4?v88uPN=B=eEsc&WHW"; // "=" を2つ持つ実在形式のshopId
  const k1 = CK(withEq, "p_1"), k2 = CK(withEq, "p_2");
  assert.ok(!k1.includes("="), "Cookie名に '=' が残ってはいけない");
  assert.notStrictEqual(k1, k2, "期間が違えばCookie名も違わなければならない");
  // 名前が最初の "=" で切られないこと（＝ブラウザが保存する名前が完全形と一致する）
  assert.strictEqual(k1.split("=")[0], k1);
});

test("cookieSafeKey: '=' を持たない shopId ではキーが1バイトも変わらない（既存Cookieの非破壊）", () => {
  const noEq = "eb6AfsQv4JAht+cX*xP7fuDa";
  assert.strictEqual(CK(noEq, "p_1"), `ots_staff_${noEq}_p_1`);
  // "+" "*" "?" "&" 等はCookie名を壊さないので置換しない
  assert.strictEqual(u.cookieSafeKey("a+b*c?d&e~f"), "a+b*c?d&e~f");
});

test("cookieSafeKey: 置換が別のshopIdと衝突しない（'.' は genSecureId の文字集合に無い）", () => {
  assert.ok(!"ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@%&*+-=?_~".includes("."));
  assert.notStrictEqual(u.cookieSafeKey("A=B"), u.cookieSafeKey("A=C"));
  assert.strictEqual(u.cookieSafeKey("A=B"), "A.B");
  assert.strictEqual(u.cookieSafeKey(null), "");
});

// ===== 改名の写しへの反映（バグチェック#107）=====
// sub.staffName は改名時に全期間ぶん書き換わる。確定済み期間の写し(period.snapshot)だけ旧名で
// 残ると、旧名の行で新名のsubを引くことになりシフトが丸ごと空欄になる。
const _renSettings = () => ({
  staffAttributes: { "田中": "emp", "鈴木": "part" },
  staffNumbers: { "田中": "001" },
  overtimeSettings: { byStaff: { "田中": { lunch: 15, dinner: 0 } } },
  xlShopName: "テスト店",
});

test("renameStaffInSettings: 名前をキーに持つマップだけを移し替える", () => {
  const r = u.renameStaffInSettings(_renSettings(), "田中", "田中太郎");
  assert.strictEqual(r.staffAttributes["田中太郎"], "emp");
  assert.strictEqual(r.staffAttributes["田中"], undefined);
  assert.strictEqual(r.staffAttributes["鈴木"], "part", "他人を巻き込んではいけない");
  assert.strictEqual(r.staffNumbers["田中太郎"], "001");
  assert.deepStrictEqual(r.overtimeSettings.byStaff["田中太郎"], { lunch: 15, dinner: 0 });
  assert.strictEqual(r.overtimeSettings.byStaff["田中"], undefined);
  assert.strictEqual(r.xlShopName, "テスト店", "凍結対象外のキーは触らない");
});

test("renameStaffInSettings: 元から無いキーを作らない（写しの凍結対象キーの有無を変えない）", () => {
  const r = u.renameStaffInSettings({ staffAttributes: { "田中": "emp" } }, "田中", "田中太郎");
  assert.strictEqual("staffColors" in r, false);
  assert.strictEqual("staffAliases" in r, false);
  // 元オブジェクトは書き換えない
  const src = _renSettings();
  u.renameStaffInSettings(src, "田中", "田中太郎");
  assert.strictEqual(src.staffAttributes["田中"], "emp");
});

test("renameStaffInPeriods: 写しの staffList と設定マップを改名し、変更の有無を返す", () => {
  const periods = [
    { id: "P1", endDate: "2026-08-15", snapshot: { staffList: ["田中", "鈴木"], settings: _renSettings() } },
    { id: "P2", endDate: "2026-07-15", snapshot: { staffList: ["鈴木"], settings: { staffAttributes: { "鈴木": "part" } } } },
    { id: "P3", endDate: "2026-09-30" },
  ];
  const r = u.renameStaffInPeriods(periods, "田中", "田中太郎");
  assert.strictEqual(r.changed, true);
  assert.deepStrictEqual(r.periods[0].snapshot.staffList, ["田中太郎", "鈴木"]);
  assert.strictEqual(r.periods[0].snapshot.settings.staffAttributes["田中太郎"], "emp");
  assert.strictEqual(r.periods[1], periods[1], "その人が居ない写しは参照ごと据え置く");
  assert.strictEqual(r.periods[2], periods[2], "写しの無い期間は触らない");
});

test("renameStaffInPeriods: keepStaff の名前も移す（削除して残す→同名で追加し直す→改名）", () => {
  // 「残す」で削除した人を同名で追加し直すと現役スタッフに戻り、編集ボタンから改名できる。
  // keepStaff が旧名のまま残ると mergeKeepStaff が旧名を別人として足し、同じ人が2列に割れる。
  const periods = [{ id: "P1", endDate: "2026-09-15", keepStaff: [{ name: "田中", index: 1 }] }];
  const r = u.renameStaffInPeriods(periods, "田中", "田中太郎");
  assert.strictEqual(r.changed, true);
  assert.deepStrictEqual(r.periods[0].keepStaff, [{ name: "田中太郎", index: 1 }], "index は保つ");
  assert.deepStrictEqual(
    u.mergeKeepStaff(["佐藤", "田中太郎", "鈴木"], r.periods[0]),
    ["佐藤", "田中太郎", "鈴木"],
    "改名後の名簿に旧名の列が復活しない"
  );
});

test("renameStaffInPeriods: keepStaff が数値キーのobject・文字列要素でも移す（Firebase往復の形）", () => {
  const r = u.renameStaffInPeriods([{ id: "P1", keepStaff: { 0: { name: "田中", index: 2 }, 1: { name: "鈴木", index: 0 } } }], "田中", "T");
  assert.deepStrictEqual(r.periods[0].keepStaff, [{ name: "T", index: 2 }, { name: "鈴木", index: 0 }]);
  const r2 = u.renameStaffInPeriods([{ id: "P1", keepStaff: ["田中", "鈴木"] }], "田中", "T");
  assert.deepStrictEqual(r2.periods[0].keepStaff, ["T", "鈴木"]);
});

test("renameStaffInPeriods: 改名先が既に keepStaff に居れば重複させない", () => {
  const r = u.renameStaffInPeriods([{ id: "P1", keepStaff: [{ name: "田中", index: 1 }, { name: "田中太郎", index: 3 }] }], "田中", "田中太郎");
  assert.strictEqual(r.changed, true);
  assert.deepStrictEqual(r.periods[0].keepStaff, [{ name: "田中太郎", index: 3 }]);
});

test("renameStaffInPeriods: keepStaff に居ない人の改名では keepStaff を触らない", () => {
  const periods = [{ id: "P1", keepStaff: [{ name: "鈴木", index: 0 }] }];
  const r = u.renameStaffInPeriods(periods, "田中", "田中太郎");
  assert.strictEqual(r.changed, false);
  assert.strictEqual(r.periods[0], periods[0], "参照ごと据え置く");
});

test("renameStaffInPeriods: 該当者が居なければ changed=false（無駄な書き込みをしない）", () => {
  const periods = [{ id: "P1", snapshot: { staffList: ["鈴木"], settings: {} } }, { id: "P2" }];
  assert.strictEqual(u.renameStaffInPeriods(periods, "田中", "田中太郎").changed, false);
  assert.strictEqual(u.renameStaffInPeriods([], "田中", "田中太郎").changed, false);
  assert.strictEqual(u.renameStaffInPeriods(null, "田中", "田中太郎").changed, false);
});

test("renameStaffInPeriods: 名簿に居なくても設定マップにだけ残る人を拾う", () => {
  const periods = [{ id: "P1", snapshot: { staffList: ["鈴木"], settings: { staffAttributes: { "田中": "emp" } } } }];
  const r = u.renameStaffInPeriods(periods, "田中", "田中太郎");
  assert.strictEqual(r.changed, true);
  assert.strictEqual(r.periods[0].snapshot.settings.staffAttributes["田中太郎"], "emp");
});

test("renameStaffInPeriods: 改名後も確定済み期間の行がその人のsubを引ける（結合の回帰）", () => {
  const settings = _renSettings();
  const period = { id: "P1", endDate: "2026-08-15", snapshot: u.buildPeriodSnapshot(["田中", "鈴木"], settings) };
  const subs = [{ id: "S1", periodId: "P1", staffName: "田中太郎", shifts: { "2026-08-10": { status: "work", start: "09:00", end: "18:00" } } }];
  const r = u.renameStaffInPeriods([period], "田中", "田中太郎");
  const pm = u.resolvePeriodMaster(r.periods[0], ["田中太郎", "鈴木"], u.renameStaffInSettings(settings, "田中", "田中太郎"), "2026-09-03");
  assert.strictEqual(pm.locked, true);
  // app-admin.js の _getSubForPeriod と同じ引き方
  const byKey = new Map(subs.map(s => [s.periodId + "|" + s.staffName, s]));
  const got = u.resolveSubByAlias(n => byKey.get("P1|" + n), pm.staffList[0], pm.settings.staffAliases || {});
  assert.strictEqual(got && got.id, "S1", "改名後も写しの行から提出を引けなければならない");
  assert.strictEqual(pm.settings.staffAttributes[pm.staffList[0]], "emp");
});

// ===== 他人の別名と同名のスタッフ登録（バグチェック#107）=====
// resolveAlias は入力名が誰かの別名なら登録名へ寄せる。別名と同名のスタッフを作ると、
// 本人が自分の名前を入力しても別人の提出になる。
test("aliasOwnerOf: その名前を別名にしている他人を返す", () => {
  const al = { "鈴木": ["たなか", "スズキ"], "高橋": [] };
  assert.strictEqual(u.aliasOwnerOf("たなか", al), "鈴木");
  assert.strictEqual(u.aliasOwnerOf(" たなか ", al), "鈴木", "前後の空白は resolveAlias と同じく無視する");
  assert.strictEqual(u.aliasOwnerOf("高橋", al), null, "登録名そのものは別名ではない");
  assert.strictEqual(u.aliasOwnerOf("佐藤", al), null);
});

test("aliasOwnerOf: 自分自身の別名は衝突にしない（自分の通称へ改名できる）", () => {
  const al = { "鈴木": ["スズキ"] };
  assert.strictEqual(u.aliasOwnerOf("スズキ", al, "鈴木"), null);
  assert.strictEqual(u.aliasOwnerOf("スズキ", al, "高橋"), "鈴木");
});

test("aliasOwnerOf: 空・未設定を安全に扱う", () => {
  assert.strictEqual(u.aliasOwnerOf("", { "鈴木": ["たなか"] }), null);
  assert.strictEqual(u.aliasOwnerOf("たなか", null), null);
  assert.strictEqual(u.aliasOwnerOf("たなか", { "鈴木": null }), null);
});

test("aliasOwnerOf: 弾かなかった場合に実際に起きること（resolveAlias との対応）", () => {
  const al = { "鈴木": ["たなか"] };
  // 「たなか」というスタッフを登録してしまうと、本人の入力が鈴木へ寄る
  assert.strictEqual(u.resolveAlias("たなか", al), "鈴木");
  // aliasOwnerOf はまさにその状態を作る名前を検出する
  assert.strictEqual(u.aliasOwnerOf("たなか", al), "鈴木");
});

// 期間の並び（startDate 昇順）。P2 で非表示にし、P4 で解除する筋書きを共有する。
const HP = {
  p1: { id: "p1", label: "9月前半", startDate: "2026-09-01", endDate: "2026-09-15" },
  p2: { id: "p2", label: "9月後半", startDate: "2026-09-16", endDate: "2026-09-30" },
  p3: { id: "p3", label: "10月前半", startDate: "2026-10-01", endDate: "2026-10-15" },
  p4: { id: "p4", label: "10月後半", startDate: "2026-10-16", endDate: "2026-10-31" },
  p5: { id: "p5", label: "11月前半", startDate: "2026-11-01", endDate: "2026-11-15" },
};

test("staffHidden: 非表示にした期間から解除した期間の1つ前までが非表示（2026-09-06 ユーザー決定・仕様の本体）", () => {
  // 「非表示にした時の最新の期間から、解除した時の最新の期間の1個前まで非表示。
  //   解除時の最新の期間では表示される」をそのまま固定する。
  const hidden = u.hideStaffFrom({}, "佐藤", HP.p2.startDate);      // P2 が最新のときに非表示にした
  const after = u.showStaffFrom(hidden, "佐藤", HP.p4.startDate);   // P4 が最新のときに解除した
  const inP = p => u.isStaffHiddenInPeriod("佐藤", after, p);
  assert.strictEqual(inP(HP.p1), false, "非表示にする前の期間は表示のまま");
  assert.strictEqual(inP(HP.p2), true, "非表示にした時点の最新期間から非表示");
  assert.strictEqual(inP(HP.p3), true, "その間の期間も非表示");
  assert.strictEqual(inP(HP.p4), false, "解除した時点の最新期間からは表示に戻る");
  assert.strictEqual(inP(HP.p5), false, "それ以降も表示");
  // 解除前は上限が無いので、以降ずっと非表示
  assert.strictEqual(u.isStaffHiddenInPeriod("佐藤", hidden, HP.p5), true, "未解除なら先の期間も非表示");
  assert.strictEqual(u.isStaffHiddenNow(hidden, "佐藤"), true);
  assert.strictEqual(u.isStaffHiddenNow(after, "佐藤"), false, "解除後は『いま非表示』ではない");
});

test("staffHidden: 非表示と解除を繰り返しても過去の範囲が消えない", () => {
  let s = u.hideStaffFrom({}, "佐藤", HP.p1.startDate);
  s = u.showStaffFrom(s, "佐藤", HP.p2.startDate);   // P1 だけ非表示
  s = u.hideStaffFrom(s, "佐藤", HP.p3.startDate);
  s = u.showStaffFrom(s, "佐藤", HP.p5.startDate);   // P3・P4 が非表示
  assert.strictEqual(u.staffHiddenRanges(s, "佐藤").length, 2, "範囲は2本残る（上書きしない）");
  const inP = p => u.isStaffHiddenInPeriod("佐藤", s, p);
  assert.deepStrictEqual([inP(HP.p1), inP(HP.p2), inP(HP.p3), inP(HP.p4), inP(HP.p5)],
    [true, false, true, true, false], "1回目の休職中に配った期間に名前が生えない");
});

test("staffHidden: 同じ期間の中で付けて外したら範囲ごと消える", () => {
  const s = u.showStaffFrom(u.hideStaffFrom({}, "佐藤", HP.p2.startDate), "佐藤", HP.p2.startDate);
  assert.deepStrictEqual(u.staffHiddenRanges(s, "佐藤"), [], "何も隠していない範囲は残さない");
  assert.strictEqual(s.staffHidden, undefined, "空になったらキーごと消す（Firebaseの読み戻しと形を揃える）");
  assert.strictEqual(u.hideStaffFrom(s, "佐藤", HP.p2.startDate) !== s, true, "付け直しはできる");
  // 既に非表示なら二重に開かない
  const h = u.hideStaffFrom({}, "佐藤", HP.p2.startDate);
  assert.strictEqual(u.hideStaffFrom(h, "佐藤", HP.p3.startDate), h, "変化なしなら同じ参照を返す＝書き込まない");
});

test("staffHidden: 旧形式（true）を読んでも壊れない（本番に出ているデータの後方互換）", () => {
  const legacy = { staffHidden: { "佐藤": true } };
  assert.deepStrictEqual(u.staffHiddenRanges(legacy, "佐藤"), [{ from: null, to: null }],
    "下限も上限もない1本の範囲として読む＝従来どおり全期間で非表示");
  assert.strictEqual(u.isStaffHiddenInPeriod("佐藤", legacy, HP.p1), true);
  assert.strictEqual(u.isStaffHiddenNow(legacy, "佐藤"), true);
  const released = u.showStaffFrom(legacy, "佐藤", HP.p4.startDate);
  assert.strictEqual(u.isStaffHiddenInPeriod("佐藤", released, HP.p3), true, "解除前の期間は非表示のまま");
  assert.strictEqual(u.isStaffHiddenInPeriod("佐藤", released, HP.p4), false, "解除した期間からは表示");
  // Firebaseが配列を数値キーのオブジェクトで返す形も読める
  const fb = { staffHidden: { "佐藤": { 0: { from: "2026-09-16", to: null } } } };
  assert.strictEqual(u.isStaffHiddenInPeriod("佐藤", fb, HP.p2), true);
});

test("staffHidden: 期間が1件も無い店舗で非表示にしても、Firebaseの往復で消えない", () => {
  // 期間が無いと下限・上限を書けず {from:null,to:null} になる。全キーがnullの範囲は
  // Firebaseに保存できない（nullのキーは書かれず、キーの残らない空オブジェクトはノードごと消える）ため、
  // 配列のまま書くと非表示が黙って無かったことになる。旧形式の true で書いて往復させる。
  const s = u.hideStaffFrom({}, "佐藤", null);
  assert.strictEqual(u.isStaffHiddenInPeriod("佐藤", s, HP.p1), true, "書いた直後は非表示");
  // Firebase RTDB の set() 意味論: null のキーは書かれない／空オブジェクト・空配列はノードごと消える
  const roundTrip = v => {
    if (Array.isArray(v)) {
      const o = {};
      v.forEach((el, i) => { const r = roundTrip(el); if (r !== undefined) o[i] = r; });
      return Object.keys(o).length ? o : undefined;
    }
    if (v !== null && typeof v === "object") {
      const o = {};
      Object.keys(v).forEach(k => { const r = roundTrip(v[k]); if (r !== undefined) o[k] = r; });
      return Object.keys(o).length ? o : undefined;
    }
    return v === null ? undefined : v;
  };
  const back = roundTrip(u.sanitizeForSet(s).value) || {};
  assert.notStrictEqual(back.staffHidden, undefined, "往復しても staffHidden が消えない");
  assert.strictEqual(u.isStaffHiddenInPeriod("佐藤", back, HP.p1), true, "往復後も非表示のまま");
  assert.strictEqual(u.isStaffHiddenNow(back, "佐藤"), true, "往復後も未解除として扱う");
  // 往復後の値からそのまま解除でき、以前の期間は非表示のまま残る
  const released = u.showStaffFrom(back, "佐藤", HP.p4.startDate);
  assert.strictEqual(u.isStaffHiddenInPeriod("佐藤", released, HP.p3), true, "解除前の期間は非表示のまま");
  assert.strictEqual(u.isStaffHiddenInPeriod("佐藤", released, HP.p4), false, "解除した期間からは表示");
});

test("visibleStaffList: 非表示スタッフだけを名簿から落とす（空白列は残す）", () => {
  const list = ["田中", "佐藤", "__spacer__1", "鈴木"];
  const hideSato = u.hideStaffFrom({}, "佐藤", HP.p1.startDate);
  assert.deepStrictEqual(u.visibleStaffList(list, hideSato, HP.p2),
    ["田中", "__spacer__1", "鈴木"], "非表示にした人だけ消える");
  assert.deepStrictEqual(u.visibleStaffList(list, {}, HP.p2), list, "設定が無ければ全員出る");
  assert.deepStrictEqual(u.visibleStaffList(list, undefined, HP.p2), list, "settings 未指定でも落ちない");
  assert.deepStrictEqual(u.visibleStaffList(undefined, hideSato, HP.p2), [], "名簿未指定でも落ちない");
  assert.deepStrictEqual(u.visibleStaffList(list, hideSato, null), list,
    "期間が特定できないときは隠さない（渡し忘れで全員消えるより安全側）");
  // 空白列は staffList の中でキッチン/ホールの境界（ShiftEditTab の spIdx）なので、
  // 非表示にしても実スタッフの前後関係が入れ替わらないことを確かめる
  const v = u.visibleStaffList(list, u.hideStaffFrom({}, "田中", HP.p1.startDate), HP.p2);
  assert.ok(v.indexOf("__spacer__1") < v.indexOf("鈴木"), "鈴木はホール側のまま");
});

test("visibleStaffList: 非表示にしても『未登録の提出名』にはならない（Excel/PDF に列が復活しない）", () => {
  // isUnregisteredSubName に visibleStaffList を通した名簿を渡すと、非表示の人の提出が未登録名に化け、
  // expXl / buildPdfCols が末尾に足す未登録列としてそのまま復活する（隠したのに出る）。
  // 判定は必ず生の名簿で行う、という取り決めをここで固定する。
  const roster = ["田中", "佐藤"];
  const settings = u.hideStaffFrom({}, "佐藤", HP.p1.startDate);
  assert.strictEqual(u.isUnregisteredSubName("佐藤", roster, {}, null), false,
    "名簿で判定すれば未登録ではない");
  assert.strictEqual(u.isUnregisteredSubName("佐藤", u.visibleStaffList(roster, settings, HP.p2), {}, null), true,
    "絞り込み後の名簿で判定すると未登録に化ける＝この渡し方をしてはいけない");
});

test("staffHidden: 写しに凍結しない（範囲が唯一の正本。終了した期間でも現在の範囲で判定する）", () => {
  // staffHidden は値そのものが期間の範囲を持つので、写しへ焼くと同じ問いへの答えが2つできる。
  // 凍結対象外のキーは resolvePeriodMaster が現在値のまま残す＝終了した期間もその startDate で評価される。
  assert.ok(!u.PERIOD_SNAPSHOT_SETTING_KEYS.includes("staffHidden"), "凍結対象に入れない");
  assert.ok(u.PERIOD_SNAPSHOT_EXEMPT_STAFF_MAPS.includes("staffHidden"), "除外は明示的に登録する");
  const settings = { ...u.hideStaffFrom({}, "佐藤", HP.p3.startDate), staffColors: {} };
  // P1 は終了して写しを持つ。非表示の範囲は P3 以降なので、この期間には名前が残る。
  const endedBefore = { ...HP.p1, snapshot: { staffList: ["田中", "佐藤"], settings: { staffColors: {} } } };
  const m1 = u.resolvePeriodMaster(endedBefore, ["田中", "佐藤"], settings, "2026-11-20");
  assert.strictEqual(m1.locked, true, "終了＋写しあり＝凍結");
  assert.deepStrictEqual(u.visibleStaffList(m1.staffList, m1.settings, endedBefore), ["田中", "佐藤"],
    "非表示にする前に配り終えた期間には名前が残る");
  // P3 も終了して写しを持つが、こちらは非表示の範囲に入るので消える（写しに焼いていないから効く）
  const endedInside = { ...HP.p3, snapshot: { staffList: ["田中", "佐藤"], settings: { staffColors: {} } } };
  const m3 = u.resolvePeriodMaster(endedInside, ["田中", "佐藤"], settings, "2026-11-20");
  assert.deepStrictEqual(u.visibleStaffList(m3.staffList, m3.settings, endedInside), ["田中"],
    "非表示にしていた間の期間は、終了後も非表示のまま");
});

test("staffHidden: プランの人数制限には数える（2026-09-06 ユーザー決定）", () => {
  // 非表示にしても登録は残るので上限判定の母数から外さない。StaffTab の上限判定は
  // staffList.filter(n=>!isSpacer(n)).length で、staffHidden を一切参照しないことを固定する。
  const src = _readAdminSurface();
  const limitLines = src.split("\n").filter(l => l.includes("PLAN_LIMITS[plan]") || (l.includes(">=lim") && l.includes("isSpacer")));
  assert.ok(limitLines.length > 0, "上限判定の行が見つからない（実装が変わったらこのテストを見直すこと）");
  assert.ok(limitLines.every(l => !l.includes("staffHidden")),
    `上限判定が staffHidden を見ている（非表示で上限を回避できてしまう）: ${limitLines.join(" / ")}`);
});

test("staffHidden: 改名でキーが移り、削除の後始末で落ちる（STAFF_KEYED_SETTING_MAPS 登録の実効確認）", () => {
  const ranges = [{ from: "2026-09-16", to: null }];
  const s = u.renameStaffInSettings({ staffHidden: { "佐藤": ranges } }, "佐藤", "佐藤 花子");
  assert.deepStrictEqual(s.staffHidden, { "佐藤 花子": ranges },
    "改名で移し替わらないと、改名した瞬間にその人がシフト表へ復活する");
  assert.ok(u.STAFF_KEYED_SETTING_MAPS.includes("staffHidden"),
    "settingsWithoutStaff（削除の後始末）はこの一覧を見るので、登録が無いと削除後もキーが残る");
});

test("STAFF_KEYED_SETTING_MAPS: スタッフ名キーの設定マップ一覧が app-admin.js に書き写されていない", () => {
  // 改名（renameStaffInSettings）と削除の後始末（settingsWithoutStaff）は、同じ「スタッフ名を
  // キーに持つ設定マップ」という不変条件を守る2つの入口。片方が一覧を書き写していると、
  // 新しいマップを足したときに黙って守る範囲が食い違う（#105〜#107 が3回続けて踏んだ形）。
  // 検出は AST で行う（正規表現だとクォートの種類・改行・コメントの有無で静かに見逃す。#145）。
  const { src, ast, srcOf, walk } = _parseAppFile("app-admin.js", "SHIFTY_ADMIN_SRC");
  const literals = [];
  let arraysSeen = 0;
  walk(ast, n => {
    if (n.type !== "ArrayExpression") return;
    arraysSeen++;
    // 要素が全て "staffXxx" の文字列リテラルで2つ以上＝一覧の書き写し。
    // `[...STAFF_KEYED_SETTING_MAPS,"staffMemo"]` は SpreadElement を含むので対象外（正当な拡張）。
    const els = n.elements;
    if (els.length < 2) return;
    if (!els.every(e => e && e.type === "StringLiteral" && /^staff[A-Za-z]+$/.test(e.value))) return;
    literals.push(srcOf(n).replace(/\s+/g, " "));
  });
  // 走査が機能していること自体の担保（「0件」が測定失敗でないこと）。
  assert.ok(arraysSeen > 0, "配列リテラルを1つも見つけられていない＝走査が壊れている");
  assert.deepStrictEqual(literals, [],
    `app-admin.js にスタッフ設定マップ一覧の直書きが残っている（STAFF_KEYED_SETTING_MAPS を使うこと）: ${literals.join(" / ")}`);
  assert.ok(/STAFF_KEYED_SETTING_MAPS\.forEach/.test(src),
    "settingsWithoutStaff が STAFF_KEYED_SETTING_MAPS を参照していない");
});

test("STAFF_KEYED_SETTING_MAPS: 凍結対象キー(PERIOD_SNAPSHOT_SETTING_KEYS)に全て含まれる", () => {
  // 含まれないマップがあると、そのマップだけ写しの側で改名が届かない＝#107 の再発になる。
  // 例外は PERIOD_SNAPSHOT_EXEMPT_STAFF_MAPS に**名指しで**登録したものだけ。
  // 「凍結しない」という判断は個別に理由が要るので、うっかり足したマップが素通りしないよう
  // 除外リスト側も STAFF_KEYED_SETTING_MAPS に載っていることを併せて確かめる。
  const exempt = u.PERIOD_SNAPSHOT_EXEMPT_STAFF_MAPS;
  const missing = u.STAFF_KEYED_SETTING_MAPS
    .filter(k => !exempt.includes(k))
    .filter(k => !u.PERIOD_SNAPSHOT_SETTING_KEYS.includes(k));
  assert.deepStrictEqual(missing, [],
    `写しに凍結されないスタッフ設定マップがある: ${missing.join(",")}`);
  const stray = exempt.filter(k => !u.STAFF_KEYED_SETTING_MAPS.includes(k));
  assert.deepStrictEqual(stray, [],
    `除外リストにスタッフ設定マップでないキーがある: ${stray.join(",")}`);
  const both = exempt.filter(k => u.PERIOD_SNAPSHOT_SETTING_KEYS.includes(k));
  assert.deepStrictEqual(both, [],
    `除外と凍結の両方に載っている（どちらが正か決まっていない）: ${both.join(",")}`);
});

// ===== 祝日テーブルのドリフト検出（バグチェック#110）=====
// JH_DATES は手で並べた文字列の集合なので、抜けても何も壊れず「その日が平日になる」だけになる。
// 実際 2025-02-24・2025-05-06・2026-05-06 の振替休日3件が落ちていて、同じ性質の 2025-11-24 は
// 入っていた（＝方針ではなく記入漏れ）。落ちると休憩時間・必要ポジション・候補時間の区分と
// シフト表の「祝」表示が全部ずれるのに、コンソールにも npm test にも何も出ない。
// そこで計算で出した参照カレンダーと全欄を突き合わせる。年を足すときはこのテストを通すこと。
// 春分・秋分は1980〜2099で使える近似式（既存の2025〜2028の実データと完全一致することを確認済み）。
function _jpHolidayRef(y) {
  const set = new Map();
  const pad = n => String(n).padStart(2, "0");
  const key = (m, d) => `${y}-${pad(m)}-${pad(d)}`;
  const nthMonday = (m, n) => {
    let c = 0;
    for (let i = 1; i <= 31; i++) {
      const t = new Date(Date.UTC(y, m - 1, i));
      if (t.getUTCMonth() !== m - 1) break;
      if (t.getUTCDay() === 1 && ++c === n) return i;
    }
    return null;
  };
  const eq = base => Math.floor(base + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
  [[1, 1], [1, nthMonday(1, 2)], [2, 11], [2, 23], [3, eq(20.8431)], [4, 29], [5, 3], [5, 4], [5, 5],
   [7, nthMonday(7, 3)], [8, 11], [9, nthMonday(9, 3)], [9, eq(23.2488)], [10, nthMonday(10, 2)],
   [11, 3], [11, 23]].forEach(([m, d]) => set.set(key(m, d), true));
  // 国民の休日: 祝日に前後を挟まれた平日（敬老の日と秋分の日の間に出る）
  [...set.keys()].sort().forEach(k => {
    const d = new Date(k + "T00:00:00Z");
    const mid = new Date(d); mid.setUTCDate(d.getUTCDate() - 1);
    const prev = new Date(d); prev.setUTCDate(d.getUTCDate() - 2);
    const ms = mid.toISOString().slice(0, 10);
    if (set.has(prev.toISOString().slice(0, 10)) && !set.has(ms) && mid.getUTCDay() !== 0) set.set(ms, true);
  });
  // 振替休日: 日曜の祝日 → その後の最初の「祝日でない日」
  [...set.keys()].sort().forEach(k => {
    const d = new Date(k + "T00:00:00Z");
    if (d.getUTCDay() !== 0) return;
    const n = new Date(d);
    do { n.setUTCDate(n.getUTCDate() + 1); } while (set.has(n.toISOString().slice(0, 10)));
    set.set(n.toISOString().slice(0, 10), true);
  });
  return set;
}

test("isHoliday: 祝日テーブルが計算した日本の祝日と一致する（JH_DATES が覆う全年）", () => {
  const years = [...new Set([...u.JH_DATES].map(s => Number(String(s).slice(0, 4))))].sort();
  assert.ok(years.length > 0, "JH_DATES が空");
  const problems = [];
  years.forEach(y => {
    const ref = _jpHolidayRef(y);
    ref.forEach((_, k) => { if (!u.isHoliday(k)) problems.push(`欠落 ${k}`); });
    for (let m = 1; m <= 12; m++) {
      for (let d = 1; d <= 31; d++) {
        const dt = new Date(Date.UTC(y, m - 1, d));
        if (dt.getUTCMonth() !== m - 1) continue;
        const k = dt.toISOString().slice(0, 10);
        if (u.isHoliday(k) && !ref.has(k)) problems.push(`余分 ${k}`);
      }
    }
  });
  assert.deepStrictEqual(problems, [],
    `祝日テーブルが参照カレンダーと食い違う（対象年 ${years.join(",")}）: ${problems.join(" / ")}`);
});

test("isHoliday: 欠落していた振替休日3件（#110の回帰）", () => {
  // どれも「祝日が日曜 → 連休の先へ押し出された振替休日」。修正前は false だった。
  assert.strictEqual(u.isHoliday("2025-02-24"), true, "2025-02-23(日)天皇誕生日の振替");
  assert.strictEqual(u.isHoliday("2025-05-06"), true, "2025-05-04(日)みどりの日の振替（5/5を飛ばす）");
  assert.strictEqual(u.isHoliday("2026-05-06"), true, "2026-05-03(日)憲法記念日の振替（5/4・5/5を飛ばす）");
  // 土日祝の判定と曜日区分にも届いていること（休憩・必要ポジション・候補時間がこれで切り替わる）
  assert.strictEqual(u.isWeekendOrHoliday("2026-05-06"), true);
  assert.ok(["holSat", "holSun"].includes(u.dayTypeOf("2026-05-06")),
    `振替休日が祝日区分にならない: ${u.dayTypeOf("2026-05-06")}`);
});

test("isHoliday: 2029年の移動祝日9件（テーブル切れの回帰）", () => {
  // JH_DATES は 2028-11-23 で尽きており、2029年は JH_FIXED の10件しか効かなかった。
  // 下の9件は「テーブルに書かないと絶対に出てこない」もの＝ハッピーマンデー・春分秋分・振替休日。
  // 2029-01-08 から壊れ始めるので、2029年前半のシフトを組む 2028年12月までに入っている必要がある。
  [["2029-01-08", "成人の日（第2月曜）"],
   ["2029-02-12", "2/11(日)建国記念の日の振替"],
   ["2029-03-20", "春分の日"],
   ["2029-04-30", "4/29(日)昭和の日の振替"],
   ["2029-07-16", "海の日（第3月曜）"],
   ["2029-09-17", "敬老の日（第3月曜）"],
   ["2029-09-23", "秋分の日"],
   ["2029-09-24", "9/23(日)秋分の日の振替"],
   ["2029-10-08", "スポーツの日（第2月曜）"]].forEach(([d, label]) => {
    assert.strictEqual(u.isHoliday(d), true, `${d} ${label}`);
    assert.strictEqual(u.isWeekendOrHoliday(d), true, `${d} が土日祝判定に届いていない`);
  });
  // 平日扱いに落ちると休憩・必要ポジション・候補時間の区分がずれる（#110 と同じ連鎖）
  assert.ok(["holSat", "holSun"].includes(u.dayTypeOf("2029-01-08")),
    `2029-01-08 が祝日区分にならない: ${u.dayTypeOf("2029-01-08")}`);
});

// ===== 店舗間シフト重複（dupErrors）の他店舗側の解決規則（バグチェック#118）=====
// dupErrors（app-admin.js）は自店舗側の出退勤を「片側セルなら候補時間から補完する」規則で解決する
// （バグチェック#86。補完せずに落とすと『出勤だけ入っている日は他店舗と重なっていても一度も
// 見に行かない』になる、というのが #86 の指摘そのもの）。他店舗側は長らく
// `if(os===null||oe===null)continue` で、休み希望マークと**片側セルを区別せずまとめて落として**いた。
// 直上のコメントは「休み希望マークが付いたセルは勤務ではないので重複エラーにしない」と
// 理由つきで**否定**しており、その理由自体は正しいぶん、片側セルまで落ちることが読み取れなかった。
test("dupErrors: 他店舗側の出退勤も effShiftRangeMin（自店舗側と同じ規則）で解決する", () => {
  const src = _readAdminSurface();
  const i = src.indexOf("companyData[osid].workMap.get");
  assert.ok(i > 0, "dupErrors の他店舗ルックアップが見つからない（このテストの前提が崩れている）");
  const block = src.slice(i, i + 1200);
  assert.ok(/effShiftRangeMin\(\s*osh\s*,\s*settings\s*\)/.test(block),
    "他店舗側が effShiftRangeMin を通っていない（片側セルの補完が自店舗側と食い違う）");
  assert.ok(!/\bos\s*===\s*null\s*\|\|\s*oe\s*===\s*null/.test(block),
    "生の null チェックが残っている＝休み希望と片側セルを区別せず落としている（#86 の穴が他店舗側に再発）");
});

test("effShiftRangeMin: dupErrors が他店舗側で頼っている4ケース", () => {
  // 自店舗側の補完境界（app-admin.js の HEAT_LUNCH_END_MIN / HEAT_DINNER_START_MIN）と
  // 同じ値になることは oneSidedFillBounds が担保する。ここは dupErrors が区別したい
  // 「勤務なし（落とす）」と「片側セル（補完して見る）」の切り分けを固定する。
  const settings = { candidates: [{ start: "09:00", end: "15:00" }, { start: "17:00", end: "23:00" }] };
  assert.deepStrictEqual(u.effShiftRangeMin({ status: "work", end: "22:00" }, settings),
    { startMin: 1020, endMin: 1320 }, "退勤だけの日はディナー始まりから補完して重複判定に乗せる");
  assert.strictEqual(u.effShiftRangeMin({ status: "work", start: "17:00", end: "22:00",
    adminRest: { start: true, end: true } }, settings), null, "休み希望マークは勤務なし＝落とす");
  assert.strictEqual(u.effShiftRangeMin({ status: "work", adjustedStart: "", adjustedEnd: "" }, settings),
    null, "メモだけのセルは勤務なし＝落とす");
  assert.strictEqual(u.effShiftRangeMin({ status: "work", start: "17:00" }, settings), null,
    "出勤17:00だけの日はランチ終わり(15:00)まで補完すると逆転する＝自店舗側の s>=e と同じく落とす");
});

test("getAttrOptions: 名前を持たない組み込み属性（2026-06-16〜06-28 の既定値）も既定名で選択肢に出す", () => {
  // 当時の makeSettings は dispatch/other を {daily,weekly} だけで保存した。スタッフタブの属性選択と
  // 設定タブの制限一覧は STAFF_TYPE_LABELS で補うので、休憩タグの選択肢だけ落ちると食い違う（バグチェック#121）。
  const legacy = { staffTypeLimits: { employee: { daily: 0, weekly: 0 }, parttime: { daily: 0, weekly: 0 },
    dispatch: { daily: 0, weekly: 0 }, other: { daily: 0, weekly: 0 } } };
  // 固定は 社員 → パート・アルバイト の2つだけ。応援・外部（dispatch）／その他は固定の外なので50音順に入る
  // （2026-10-03 に dispatch を「派遣」から「応援・外部」へ改称した。「応援」は漢字始まりなので照合順でかなの「その他」の後）
  assert.deepStrictEqual(u.getAttrOptions(legacy),
    [["employee", "社員"], ["parttime", "パート・アルバイト"], ["other", "その他"], ["dispatch", "応援・外部"]]);
  // 名前の無いカスタム属性は従来どおり出さない（ID をそのまま見せないため）
  assert.deepStrictEqual(u.getAttrOptions({ staffTypeLimits: { custom_x: { daily: 0 } } }),
    [["employee", "社員"], ["parttime", "パート・アルバイト"]]);
  // 一覧に無い組み込み属性は足さない（現行の既定＝社員・パート・アルバイトのみ の店舗に派遣を生やさない）
  assert.deepStrictEqual(u.getAttrOptions({ staffTypeLimits: { custom_y: { name: "学生" } } }),
    [["employee", "社員"], ["parttime", "パート・アルバイト"], ["custom_y", "学生"]]);
});

test("getAttrOptions / sortAttrEntries: 社員→パート・アルバイトを固定し、自由追加分を表示名の50音順に並べる（2026-09-26）", () => {
  // スタッフタブの属性プルダウンと設定タブの属性別勤務時間設定が同じ並びになることの正本。
  // Firebase のキー順（≒辞書順の custom_a, custom_b, …）で並んでいたものが、表示名で並ぶ。
  const s = { staffTypeLimits: {
    custom_c: { name: "夏季" }, custom_a: { name: "アルバイトB" },
    custom_b: { name: "学生" }, custom_d: { name: "契約社員" },
    parttime: { name: "バイト" }, employee: { name: "社員" } } };
  assert.deepStrictEqual(u.getAttrOptions(s).map(([, n]) => n),
    ["社員", "パート・アルバイト", "アルバイトB", "夏季", "学生", "契約社員"],
    "組み込み2つが先頭・残りは50音順（かなが漢字より先に来るのは localeCompare('ja') の照合順で許容）");
  // 組み込みの表示名は staffTypeLimits の name を読まない＝既存店舗に残る旧既定名「バイト」が出ない
  assert.strictEqual(u.getAttrOptions(s)[1][1], "パート・アルバイト");
  // 設定タブは lim 本体が要るので [ID, 表示名] を自分で組んで sortAttrEntries に渡す（同じ並びになる）
  assert.deepStrictEqual(u.sortAttrEntries([["custom_b", "学生"], ["parttime", "パート・アルバイト"],
    ["custom_a", "アルバイトB"], ["employee", "社員"]]).map(([id]) => id),
    ["employee", "parttime", "custom_a", "custom_b"]);
  // 名前が空のカスタム属性（設定タブで名前を消した直後）は落とさず先頭側に置く＝入力欄が消えない
  assert.deepStrictEqual(u.sortAttrEntries([["custom_a", "学生"], ["custom_b", ""]]).map(([id]) => id),
    ["custom_b", "custom_a"]);
});

test("moveStaffHiddenBoundaries: 期間の開始日を編集すると非表示の境界も追随する（バグチェック#136）", () => {
  let s = u.hideStaffFrom({}, "佐藤", HP.p2.startDate);
  s = u.showStaffFrom(s, "佐藤", HP.p4.startDate);   // P2・P3 が非表示
  const hiddenIn = (st, ps) => ps.map(p => u.isStaffHiddenInPeriod("佐藤", st, p));
  // 非表示にした期間(P2)の開始日を前へ
  const p2e = { ...HP.p2, startDate: "2026-09-15" };
  const others2 = [HP.p1, HP.p3, HP.p4, HP.p5];
  assert.deepStrictEqual(hiddenIn(s, [p2e, HP.p3, HP.p4]), [false, true, false], "追随しないと P2 で再び表示される");
  const s2 = u.moveStaffHiddenBoundaries(s, HP.p2.startDate, p2e.startDate, others2);
  assert.deepStrictEqual(hiddenIn(s2, [HP.p1, p2e, HP.p3, HP.p4]), [false, true, true, false]);
  // 解除した期間(P4)の開始日を前へ
  const p4e = { ...HP.p4, startDate: "2026-10-15" };
  assert.deepStrictEqual(hiddenIn(s, [HP.p3, p4e]), [true, true], "追随しないと解除した P4 で消える");
  const s4 = u.moveStaffHiddenBoundaries(s, HP.p4.startDate, p4e.startDate, [HP.p1, HP.p2, HP.p3, HP.p5]);
  assert.deepStrictEqual(hiddenIn(s4, [HP.p2, HP.p3, p4e]), [true, true, false]);
});

test("moveStaffHiddenBoundaries: 変化が無いときは同じ参照を返す（無駄な書き込みをしない）", () => {
  const s = u.hideStaffFrom({}, "佐藤", HP.p2.startDate);
  assert.strictEqual(u.moveStaffHiddenBoundaries(s, HP.p2.startDate, HP.p2.startDate, []), s, "開始日を変えていない");
  assert.strictEqual(u.moveStaffHiddenBoundaries(s, HP.p3.startDate, "2026-10-02", []), s, "境界に使われていない開始日");
  assert.strictEqual(u.moveStaffHiddenBoundaries(s, HP.p2.startDate, "2026-09-17", [{ ...HP.p3, startDate: HP.p2.startDate }]), s, "同じ開始日の期間が他にもある＝どちらの境界か区別できない");
  const legacy = { staffHidden: { "佐藤": true } };
  assert.strictEqual(u.moveStaffHiddenBoundaries(legacy, HP.p2.startDate, "2026-09-17", []), legacy, "旧形式 true は境界を持たない");
  assert.strictEqual(u.moveStaffHiddenBoundaries({}, HP.p2.startDate, "2026-09-17", []).staffHidden, undefined);
});

// 片側セル補完の境界は app-utils.js の oneSidedFillBounds が正本だが、app-admin.js の
// ヒートマップは同じ式の**2つ目の写し**を持ち、帯境界を HEAT_BAND_SPLIT_MIN ではなく
// 数値リテラル 1020 で直書きしている（app-admin.js の HEAT_LUNCH_END_MIN/HEAT_DINNER_START_MIN）。
// 値が一致している限り実害は無いが、HEAT_BAND_SPLIT_MIN を変えると**集計側だけが追随し
// ヒートマップは17:00固定のまま残る**——「ヒートマップと勤務時間集計が同じ日を別扱いする」
// ＝バグチェック#82 で一度直した食い違いがそのまま再発する。写しを消すのは配信物の
// リファクタなので、ここでは #144・#145 と同じく**ドリフトを検出するテストで留める**。
// バグチェック#146（2026-09-25）で検出。
function _adminFillBounds() {
  const { ast, srcOf, walk } = _parseAppFile("app-admin.js", "SHIFTY_ADMIN_SRC");
  let iife = null, timeToMin = null;
  walk(ast, n => {
    if (n.type !== "VariableDeclarator") return;
    if (n.id && n.id.type === "Identifier" && n.id.name === "timeToMin" && !timeToMin) timeToMin = srcOf(n);
    if (n.id && n.id.type === "ObjectPattern") {
      const keys = n.id.properties.map(p => p.key && p.key.name);
      if (keys.includes("HEAT_LUNCH_END_MIN") && keys.includes("HEAT_DINNER_START_MIN")) iife = n.init;
    }
  });
  return { iife, iifeSrc: iife ? srcOf(iife) : null, timeToMin };
}

test("片側セル補完の境界: app-admin.js の写しが app-utils.js の oneSidedFillBounds と同じ答えを出す", () => {
  const { iife, iifeSrc, timeToMin } = _adminFillBounds();
  // 0件が測定失敗でないことの担保（#145 の教訓）。見つからなければ走査が壊れている。
  assert.ok(iife, "app-admin.js に HEAT_LUNCH_END_MIN/HEAT_DINNER_START_MIN の分解代入が無い（走査が壊れている）");
  assert.ok(timeToMin, "app-admin.js に timeToMin の宣言が無い（走査が壊れている）");
  assert.match(iifeSrc, /lunchEnds/, "抽出したのが境界計算の式ではない（走査が壊れている）");

  const run = new Function("settings", `
    const ${timeToMin};
    const {HEAT_LUNCH_END_MIN,HEAT_DINNER_START_MIN}=${iifeSrc};
    return {lunchEnd:HEAT_LUNCH_END_MIN,dinnerStart:HEAT_DINNER_START_MIN};
  `);
  const C = (s, e) => ({ start: s, end: e });
  const sparse = []; sparse[0] = C("11:00", "15:00"); sparse[2] = C("17:00", "22:00");
  const cases = [
    ["通常", { candidates: [C("11:00", "15:00"), C("17:00", "23:00")] }],
    ["候補なし", { candidates: [] }],
    ["曜日別・日付別を混在", { candidates: [C("10:00", "14:00")], weekdayCandidates: { 1: [C("11:00", "16:00")] }, dateCandidates: { "2026-10-01": [C("18:00", "24:00")] } }],
    ["closed を含む", { candidates: [C("11:00", "15:00"), { closed: true }] }],
    // 帯境界ちょうどの候補。<= / >= を < / > に変えるとここだけが動くので必ず残す
    // （境界に掛からない候補しか無いと、両方の写しが同じフォールバックへ落ちて差が消える）
    ["帯境界ちょうど・退勤17:00が最も遅い", { candidates: [C("11:00", "15:00"), C("11:00", "17:00")] }],
    ["帯境界ちょうど・出勤17:00が最も早い", { candidates: [C("17:00", "23:00"), C("18:00", "24:00")] }],
    ["疎な配列（Firebase往復）", { candidates: sparse }],
    ["26時超え表記", { candidates: [C("18:00", "26:00")] }],
    ["不正な時刻文字列", { candidates: [C("abc", "xyz"), C("11:00", "15:00")] }],
    ["コロンなし", { candidates: [C("9", "17"), C("11:00", "15:00")] }],
  ];
  for (const [label, settings] of cases) {
    // oneSidedFillBounds は settings を WeakMap でキャッシュするので毎回新しい参照を渡す
    const a = u.oneSidedFillBounds(JSON.parse(JSON.stringify(settings)));
    const b = run(settings);
    assert.deepStrictEqual({ lunchEnd: b.lunchEnd, dinnerStart: b.dinnerStart },
      { lunchEnd: a.lunchEnd, dinnerStart: a.dinnerStart },
      `${label}: ヒートマップの補完境界が勤務時間・集計側と食い違う（#82 の再発）`);
  }
});

test("片側セル補完の境界: app-admin.js の写しが帯境界を HEAT_BAND_SPLIT_MIN からずらしていない", () => {
  const { iife, iifeSrc } = _adminFillBounds();
  assert.ok(iife, "境界計算の式が見つからない（走査が壊れている）");
  // 式に出てくる数値のうち 900（ランチ終わりの既定値・帯境界とは独立）以外は
  // すべて帯境界でなければならない。HEAT_BAND_SPLIT_MIN を変えてここを直し忘れると落ちる。
  const nums = [];
  const walk2 = n => {
    if (!n || typeof n.type !== "string") return;
    if (n.type === "NumericLiteral") nums.push(n.value);
    for (const k of Object.keys(n)) {
      if (k === "loc") continue;
      const v = n[k];
      if (Array.isArray(v)) v.forEach(c => c && typeof c.type === "string" && walk2(c));
      else if (v && typeof v.type === "string") walk2(v);
    }
  };
  walk2(iife);
  assert.ok(nums.length > 0, "数値が1つも無い＝走査が壊れている");
  const stray = nums.filter(v => v !== 900 && v !== u.HEAT_BAND_SPLIT_MIN);
  assert.deepStrictEqual(stray, [],
    `app-admin.js の補完境界に HEAT_BAND_SPLIT_MIN(${u.HEAT_BAND_SPLIT_MIN}) でも 900 でもない数値がある: ${stray.join(",")}（帯境界を変えたなら両方の写しを直すこと）`);
  assert.ok(nums.includes(u.HEAT_BAND_SPLIT_MIN),
    `app-admin.js の補完境界に HEAT_BAND_SPLIT_MIN(${u.HEAT_BAND_SPLIT_MIN}) が現れない＝写しがずれている`);
});

// ============================================================
// subs 部分購読の窓: app-main.js の reconcileSubs が app-utils.js の recentPeriodIds と同じ規則か
// ------------------------------------------------------------
// recentPeriodIds は **配信物のどこからも呼ばれていない**（呼ぶのはこのテストだけ）。
// startSubscriptions の reconcileSubs（app-main.js）は subsWindowCutoff だけを借りて、
// 「どの期間を購読するか」の判定は自前で書いた同じ式を持っている。値が一致している今は
// ユーザーに見える差は無いが、**窓の規則を変えたときに片方だけが追随する**——そのとき壊れるのは
// 「直近3ヶ月の提出だけを購読する」という DL 量の前提そのもので、症状は
// 「古い期間の提出が出てこない」か「全期間を読んでしまう」のどちらかになり、どちらも気づきにくい。
// fixedShiftCommandFor（#124）と同じ「テストからしか呼ばれない純粋関数」の形で、これが2例目。
// 写しを消すのは配信物のリファクタなので、ここではドリフトの検出だけを行う。
test("subs部分購読の窓: app-main.js の reconcileSubs が recentPeriodIds と同じ期間を選ぶ", () => {
  const fs = require("fs"), path = require("path"), babel = require("@babel/core");
  // 既定は配信物そのもの。SHIFTY_MAIN_SRC はこの走査が本当に検出できるかを確かめるための差し替え口。
  const file = process.env.SHIFTY_MAIN_SRC || path.join(__dirname, "..", "app-main.js");
  const src = fs.readFileSync(file, "utf8");
  const ast = babel.parseSync(src, {
    configFile: false, babelrc: false, sourceType: "script",
    parserOpts: { plugins: ["jsx"], errorRecovery: true },
  });
  const srcOf = n => src.slice(n.start, n.end);
  const walk = (node, fn) => {
    if (!node || typeof node.type !== "string") return;
    fn(node);
    for (const k of Object.keys(node)) {
      if (k === "loc" || k === "leadingComments" || k === "trailingComments") continue;
      const v = node[k];
      if (Array.isArray(v)) v.forEach(c => c && typeof c.type === "string" && walk(c, fn));
      else if (v && typeof v.type === "string") walk(v, fn);
    }
  };

  let fnBody = null;
  walk(ast, n => {
    if (n.type !== "VariableDeclarator" || !n.id || n.id.name !== "reconcileSubs") return;
    if (!n.init || n.init.type !== "ArrowFunctionExpression" || n.init.body.type !== "BlockStatement") return;
    fnBody = n.init.body;
  });
  assert.ok(fnBody, "app-main.js に reconcileSubs のアロー関数が見つからない（名前か形が変わった）");

  // 窓の下限を決める行と、want へ期間IDを入れる行だけを取り出す
  let cutoffInit = null, addStmt = null;
  fnBody.body.forEach(st => {
    if (st.type === "VariableDeclaration") {
      st.declarations.forEach(d => { if (d.id && d.id.name === "cutoff" && d.init) cutoffInit = srcOf(d.init); });
    }
    const s = srcOf(st);
    if (/want\.add\(p\.id\)/.test(s)) addStmt = s;
  });
  assert.ok(cutoffInit, "reconcileSubs に cutoff の宣言が見つからない");
  assert.ok(addStmt, "reconcileSubs に want.add(p.id) を含む文が見つからない");
  // 窓の下限は app-utils.js の subsWindowCutoff で決めること（自前の月計算へ分岐していない）
  assert.match(cutoffInit, /subsWindowCutoff\(/,
    `reconcileSubs の cutoff が subsWindowCutoff を通っていない: ${cutoffInit}`);

  // 取り出した2行をそのまま実行して、選ばれる期間IDを採る（wantAll=false・active=null＝窓の規則だけを見る）
  const inlineWant = (periods, refDate) => {
    const all = periods, want = new Set(), wantAll = false, active = null;
    const subsWindowCutoff = (d, m) => u.subsWindowCutoff(d || refDate, m);
    const cutoff = eval(cutoffInit); // eslint-disable-line no-eval
    eval(addStmt); // eslint-disable-line no-eval
    return [...want].sort();
  };

  const REF = "2026-09-25"; // 窓の下限はちょうど 2026-06-25
  assert.strictEqual(u.subsWindowCutoff(REF), "2026-06-25", "前提: 3ヶ月窓の下限");
  const cases = [
    // 境界そのものを必ず入れる。境界に掛かる期間が無いと >= を > に変えても両者が一致してしまう（#146 の教訓）
    { label: "下限ちょうど", periods: [{ id: "p1", startDate: "2026-06-25" }] },
    { label: "下限の1日前", periods: [{ id: "p2", startDate: "2026-06-24" }] },
    { label: "窓の内側", periods: [{ id: "p3", startDate: "2026-09-01" }] },
    { label: "ずっと古い", periods: [{ id: "p4", startDate: "2026-01-01" }] },
    { label: "startDate なし", periods: [{ id: "p5" }] },
    { label: "id なし", periods: [{ startDate: "2026-09-01" }] },
    { label: "null 要素", periods: [null, { id: "p7", startDate: "2026-09-10" }] },
    { label: "混在", periods: [
      { id: "a", startDate: "2026-06-25" }, { id: "b", startDate: "2026-06-24" },
      { id: "c", startDate: "2026-12-01" }, null, { id: "d" },
    ] },
  ];
  for (const c of cases) {
    assert.deepStrictEqual(
      inlineWant(c.periods, REF),
      [...u.recentPeriodIds(c.periods, REF)].sort(),
      `${c.label}: reconcileSubs の写しと recentPeriodIds が違う期間を選んだ`);
  }
});

// ===== 労務判定（2026-09-26・第1弾）=====
// 期待値はすべて実装計画書『労務判定_実装計画.html』の確定仕様 S-1〜S-5 からの転記。
// **実装の出力から逆生成していない。**
const HM = (h, m) => h * 60 + (m || 0);

test("S-1 総枠: 31/30/29/28日が Excel と分単位で一致（W=40h）", () => {
  const W = u.weeklyLegalMinFromBase31(HM(177, 8)); // 31日の総枠 177:08 を入力
  assert.strictEqual(W, HM(40, 0), "週の法定労働時間が40時間に丸まる");
  assert.strictEqual(u.monthlyBaseMin(W, 31), HM(177, 8));
  assert.strictEqual(u.monthlyBaseMin(W, 30), HM(171, 25));
  assert.strictEqual(u.monthlyBaseMin(W, 29), HM(165, 42));
  assert.strictEqual(u.monthlyBaseMin(W, 28), HM(160, 0));
});

test("S-1 総枠: W は30分単位に丸めてから各月を計算する（端数のまま使わない）", () => {
  // 177:08 から素直に割った W は 40時間ちょうどではない（39.9977…h）。丸めずにそのまま
  // 各月へ配ると Excel とずれるので、30分単位に丸めて確定させてから計算する（判断2）。
  // 判断2 が例に挙げる「比例配分だと30日が 171:27」は、こちらで再現できる式が見つからなかったため
  // 期待値として固定していない（S-1 に無い値を実装から逆生成しないという規則に従う）。
  const raw = HM(177, 8) * 7 / 31;
  assert.ok(Math.abs(raw - HM(40, 0)) > 0, "素の逆算は40時間ちょうどではない");
  assert.strictEqual(u.weeklyLegalMinFromBase31(HM(177, 8)), HM(40, 0), "30分単位に丸めて40時間へ確定する");
  assert.strictEqual(u.monthlyBaseMin(u.weeklyLegalMinFromBase31(HM(177, 8)), 30), HM(171, 25));
  // 丸めずに端数の W をそのまま使うと合わない月が出る（＝丸めが効いていることの対照）。
  // 28日の月は 159:59 になり、S-1 の 160:00 と1分ずれる。
  assert.strictEqual(u.monthlyBaseMin(raw, 28), HM(159, 59));
  assert.strictEqual(u.monthlyBaseMin(HM(40, 0), 28), HM(160, 0));
});

test("S-1注記 W=44h: 31日に 194:51 を入力すると週44時間に丸まる（特例措置対象事業場）", () => {
  const W = u.weeklyLegalMinFromBase31(HM(194, 51));
  assert.strictEqual(W, HM(44, 0));
  assert.strictEqual(u.monthlyBaseMin(W, 31), HM(194, 51));
});

test("S-1 目安・上限: 固定残業30h・余裕7h で Excel と一致", () => {
  const W = u.weeklyLegalMinFromBase31(HM(177, 8));
  const FIX = HM(30, 0), MG = HM(7, 0), DOT = HM(3, 0);
  const exp = {
    31: { guide: HM(200, 0), cap: HM(207, 8) },
    30: { guide: HM(194, 0), cap: HM(201, 25) },
    29: { guide: HM(188, 0), cap: HM(195, 42) },
    28: { guide: HM(183, 0), cap: HM(190, 0) },
  };
  [31, 30, 29, 28].forEach(d => {
    const b = u.monthlyBaseMin(W, d);
    assert.strictEqual(u.monthlyGuideMin(b, FIX, MG, DOT), exp[d].guide, `${d}日の目安`);
    assert.strictEqual(u.monthlyCapMin(b, FIX), exp[d].cap, `${d}日の上限`);
  });
});

test("S-1 目安: 1日の残業上限を0にすると目安＝総枠に切り替わる", () => {
  const b = u.monthlyBaseMin(HM(40, 0), 31);
  assert.strictEqual(u.monthlyGuideMin(b, HM(30, 0), HM(7, 0), 0), b);
  assert.strictEqual(u.monthlyGuideMin(b, HM(30, 0), HM(7, 0), HM(3, 0)), HM(200, 0), "0以外なら従来どおり");
});

test("laborMonthFrame: 設定を持たない店舗は既定（W=40h）で動き、暦日数を月から引く", () => {
  const f = u.laborMonthFrame({}, "2026-08"); // 8月=31日
  assert.strictEqual(f.days, 31);
  assert.strictEqual(f.weeklyMin, HM(40, 0));
  assert.strictEqual(f.baseMin, HM(177, 8));
  assert.strictEqual(f.guideMin, HM(200, 0));
  assert.strictEqual(f.capMin, HM(207, 8));
  assert.strictEqual(u.laborMonthFrame({}, "2026-02").days, 28);
  assert.strictEqual(u.laborMonthFrame({}, "2028-02-15").days, 29, "うるう年・日付つきでも月から引く");
});

test("項目6: 法定基準 1日8時間・週40時間が定数として存在する", () => {
  assert.strictEqual(u.LEGAL_DAILY_HOURS, 8);
  assert.strictEqual(u.LEGAL_WEEKLY_HOURS, 40);
  assert.strictEqual(u.LEGAL_DAILY_MIN, 480);
  assert.strictEqual(u.LEGAL_WEEKLY_MIN, 2400);
});

test("S-5 B制の週40h超: 1日8hで切ってから週で足し、40h超のぶんだけを取る", () => {
  // 10h×5日 → 8h×5=40h で超過0（1日8hで切るため）
  assert.strictEqual(u.weeklyOverMinB([600, 600, 600, 600, 600, 0, 0]), 0);
  // 8h×6日 → 48h で 8h超過
  assert.strictEqual(u.weeklyOverMinB([480, 480, 480, 480, 480, 480, 0]), HM(8, 0));
  // 7h×6日 = 42h で 2h超過
  assert.strictEqual(u.weeklyOverMinB([420, 420, 420, 420, 420, 420, 0]), HM(2, 0));
  // ちょうど40hは超過なし（境界）
  assert.strictEqual(u.weeklyOverMinB([480, 480, 480, 480, 480]), 0);
  // 週ごとの合計。負の週は0に丸めてから足す（引き算で相殺しない）
  assert.strictEqual(u.weeklyOverTotalMinB([[480, 480, 480, 480, 480, 480], [120]]), HM(8, 0));
  // 期間をまたぐ週は「データのある日だけ」を渡す＝渡さなかった日は加算されない
  assert.strictEqual(u.weeklyOverTotalMinB([[480, 480, 480]]), 0);
});

test("項目1 laborSystemOf: 組み込み属性の既定は 社員=A・バイト=B・派遣/その他=応援・外部（判定は B と同じ）", () => {
  assert.strictEqual(u.laborSystemOf({}, "employee"), "A");
  assert.strictEqual(u.laborSystemOf({}, "parttime"), "B");
  // 2026-10-03: 応援・外部（保存値 none）は判定上 B に読み替える。保存値は laborSystemRawOf が返す
  assert.strictEqual(u.laborSystemOf({}, "dispatch"), "B");
  assert.strictEqual(u.laborSystemOf({}, "other"), "B");
  assert.strictEqual(u.laborSystemRawOf({}, "dispatch"), "none");
  assert.strictEqual(u.laborSystemRawOf({}, "other"), "none");
  // 属性が未割当のスタッフは既存フォールバックで parttime＝B制（安全側）
  assert.strictEqual(u.laborSystemForStaff({}, "田中"), "B");
});

test("項目1 laborSystemOf: 明示の laborSystem が既定より優先する", () => {
  const st = { staffTypeLimits: { employee: { name: "社員", laborSystem: "B" }, parttime: { name: "バイト", laborSystem: "A" } },
               staffAttributes: { 田中: "employee" } };
  assert.strictEqual(u.laborSystemOf(st, "employee"), "B");
  assert.strictEqual(u.laborSystemOf(st, "parttime"), "A");
  assert.strictEqual(u.laborSystemForStaff(st, "田中"), "B");
});

test("S-4 区分が空欄か誤り: custom属性で未設定、または staffTypeLimits に無い属性は null", () => {
  const st = { staffTypeLimits: { custom_a1: { name: "契約" } }, staffAttributes: { 田中: "custom_a1", 鈴木: "custom_zz" } };
  assert.strictEqual(u.laborSystemForStaff(st, "田中"), null, "custom属性で laborSystem 未設定");
  assert.strictEqual(u.laborSystemForStaff(st, "鈴木"), null, "staffTypeLimits に無い属性");
  assert.deepStrictEqual(u.laborFindingLabels({ laborSystem: null, dayMins: [600] }), ["区分が空欄か誤り"]);
  // 不正な値も未設定と同じ扱い
  assert.strictEqual(u.laborSystemOf({ staffTypeLimits: { custom_a1: { laborSystem: "X" } } }, "custom_a1"), null);
});

test("S-4 A制の日次判定: 12h超n日・4h未満n日（境界ちょうどは出ない）", () => {
  // 13h・12h（境界）・3h59m・4h（境界）・8h
  const mins = [HM(13, 0), HM(12, 0), HM(3, 59), HM(4, 0), HM(8, 0)];
  assert.deepStrictEqual(u.laborFindingLabels({ laborSystem: "A", dayMins: mins }), ["12h超1日", "4h未満1日"]);
  assert.deepStrictEqual(u.laborFindingLabels({ laborSystem: "A", dayMins: [HM(12, 1), HM(12, 1)] }), ["12h超2日"]);
  assert.deepStrictEqual(u.laborFindingLabels({ laborSystem: "A", dayMins: [HM(8, 0)] }), [], "どれにも当たらなければ空");
});

test("S-4 B制の日次判定: 8h超n日(残業)・週40h超(残業)", () => {
  // 8h01m と 9h が超過、8hちょうど（境界）は出ない
  assert.deepStrictEqual(u.laborFindingLabels({ laborSystem: "B", dayMins: [HM(8, 1), HM(8, 0), HM(9, 0)] }), ["8h超2日(残業)"]);
  assert.deepStrictEqual(
    u.laborFindingLabels({ laborSystem: "B", dayMins: [HM(7, 0), HM(7, 0), HM(7, 0), HM(7, 0), HM(7, 0), HM(7, 0)],
      weekDayMins: [[HM(7, 0), HM(7, 0), HM(7, 0), HM(7, 0), HM(7, 0), HM(7, 0), 0]] }),
    // 1日の残業上限が未設定(0)なので「週40h超(協定なし)」も同時に出る（S-4 の B制の4行目）
    ["週40h超(残業)", "週40h超(協定なし)"]);
  // 1日の残業上限を設定すると「協定なし」は出ない
  assert.deepStrictEqual(
    u.laborFindingLabels({ laborSystem: "B", dayMins: [HM(7, 0)], agreementDailyOtH: 3,
      weekDayMins: [[HM(7, 0), HM(7, 0), HM(7, 0), HM(7, 0), HM(7, 0), HM(7, 0), 0]] }),
    ["週40h超(残業)"]);
  // A制の判定（12h超・4h未満）はB制では出ない
  assert.deepStrictEqual(u.laborFindingLabels({ laborSystem: "B", dayMins: [HM(13, 0)] }), ["8h超1日(残業)"]);
});

test("S-4 時刻の入力ミス: 区分によらず件数つきで出る", () => {
  assert.deepStrictEqual(u.laborFindingLabels({ laborSystem: "A", timeErrorCount: 2 }), ["時刻の入力ミス2日"]);
  assert.deepStrictEqual(u.laborFindingLabels({ laborSystem: "none", timeErrorCount: 1 }), ["時刻の入力ミス1日"]);
  assert.deepStrictEqual(u.laborFindingLabels({ laborSystem: null, timeErrorCount: 1 }), ["時刻の入力ミス1日", "区分が空欄か誤り"]);
});

// 内部値 none は、行き先の店で「所属店舗で判定」する人（P3.6）を判定から外すために ShiftEditTab が入れる値。
// 属性の「応援・外部」は 2026-10-03 から laborSystemOf が B に読み替えるのでここには来ない（下の「応援・外部は B と同じ判定」）
test("項目1: 内部値 none（所属店舗で判定する人）は労働時間の判定から除外される", () => {
  // 13h・3h・9h が並んでも A制/B制 のどの判定も出ない（週40h超も出ない）
  const mins = [HM(13, 0), HM(3, 0), HM(9, 0), HM(9, 0), HM(9, 0), HM(9, 0)];
  const weeks = [[HM(9, 0), HM(9, 0), HM(9, 0), HM(9, 0), HM(9, 0), HM(9, 0), 0]];
  assert.deepStrictEqual(u.laborFindingLabels({ laborSystem: "none", dayMins: mins, weekDayMins: weeks }), []);
  // 同じ入力を A制／B制 に入れると判定が出る＝素通りするテストではない
  assert.ok(u.laborFindingLabels({ laborSystem: "A", dayMins: mins, weekDayMins: weeks }).length > 0);
  assert.ok(u.laborFindingLabels({ laborSystem: "B", dayMins: mins, weekDayMins: weeks }).length > 0);
});

test("項目12 isTimeOrderInvalid: 退勤≦出勤の日だけを true にする", () => {
  assert.strictEqual(u.isTimeOrderInvalid({ status: "work", start: "22:00", end: "02:00" }), true);
  assert.strictEqual(u.isTimeOrderInvalid({ status: "work", start: "18:00", end: "01:00" }), true);
  assert.strictEqual(u.isTimeOrderInvalid({ status: "work", start: "10:00", end: "10:00" }), true, "同時刻も実働0で誤り");
  // 24時超え表記の正常入力は影響を受けない（非回帰）
  assert.strictEqual(u.isTimeOrderInvalid({ status: "work", start: "22:00", end: "26:00" }), false);
  assert.strictEqual(u.isTimeOrderInvalid({ status: "work", start: "18:00", end: "25:00" }), false);
  assert.strictEqual(u.isTimeOrderInvalid({ status: "work", start: "10:00", end: "15:00" }), false);
  // 片側セルは対象外（補完の領分）
  assert.strictEqual(u.isTimeOrderInvalid({ status: "work", start: "22:00" }), false);
  assert.strictEqual(u.isTimeOrderInvalid({ status: "work", end: "02:00" }), false);
  // 休み・空は対象外
  assert.strictEqual(u.isTimeOrderInvalid({ status: "holiday", start: "22:00", end: "02:00" }), false);
  assert.strictEqual(u.isTimeOrderInvalid(null), false);
  // 管理者調整値が優先される
  assert.strictEqual(u.isTimeOrderInvalid({ status: "work", start: "10:00", end: "15:00", adjustedEnd: "09:00" }), true);
  assert.strictEqual(u.isTimeOrderInvalid({ status: "work", start: "22:00", end: "02:00", adjustedEnd: "26:00" }), false);
});

test("項目12: 退勤≦出勤の日は effShiftRangeMin が null＝実働0 のまま（案C＝データを変えない）", () => {
  const sh = { status: "work", start: "22:00", end: "02:00" };
  assert.strictEqual(u.effShiftRangeMin(sh, null), null);
  assert.strictEqual(u.calcNetWorkMinutes(sh, [], 0, null), 0);
  assert.strictEqual(u.isTimeOrderInvalid(sh), true, "0になること自体は変えず、誤りとして検出だけする");
});

test("laborSettingsOf: 設定キーの無い店舗は既定、部分指定はその項目だけ上書き", () => {
  assert.deepStrictEqual(u.laborSettingsOf({}), u.DEFAULT_LABOR_SETTINGS);
  assert.deepStrictEqual(u.laborSettingsOf(null), u.DEFAULT_LABOR_SETTINGS);
  const p = u.laborSettingsOf({ laborSettings: { marginMin: 600 } });
  assert.strictEqual(p.marginMin, 600);
  assert.strictEqual(p.monthlyBase31Min, u.DEFAULT_LABOR_SETTINGS.monthlyBase31Min);
  // 不正値は既定に倒す（負・NaN）
  assert.strictEqual(u.laborSettingsOf({ laborSettings: { marginMin: -5 } }).marginMin, u.DEFAULT_LABOR_SETTINGS.marginMin);
  assert.strictEqual(u.laborSettingsOf({ laborSettings: { marginMin: "x" } }).marginMin, u.DEFAULT_LABOR_SETTINGS.marginMin);
});

test("凍結: laborSettings が PERIOD_SNAPSHOT_SETTING_KEYS に登録され、確定済み期間で写しの値が使われる", () => {
  assert.ok(u.PERIOD_SNAPSHOT_SETTING_KEYS.includes("laborSettings"));
  const period = { id: "p1", startDate: "2026-08-01", endDate: "2026-08-31",
    snapshot: { staffList: ["田中"], settings: { laborSettings: { monthlyBase31Min: 10628, marginMin: 420 } } } };
  const now = { laborSettings: { monthlyBase31Min: 11691, marginMin: 1200 } }; // 期間終了後に44hへ変更した
  const locked = u.resolvePeriodMaster(period, ["田中"], now, "2026-09-05");
  assert.strictEqual(locked.locked, true);
  assert.strictEqual(u.laborSettingsOf(locked.settings).monthlyBase31Min, 10628, "写しの値で判定する");
  assert.strictEqual(u.laborMonthFrame(locked.settings, "2026-08").weeklyMin, 2400);
  // 未確定の期間は現在値
  const live = u.resolvePeriodMaster(period, ["田中"], now, "2026-08-15");
  assert.strictEqual(live.locked, false);
  assert.strictEqual(u.laborMonthFrame(live.settings, "2026-08").weeklyMin, 2640);
});

test("項目12 ドリフト検出: applyEditToSubs と saveAdj が同じ isTimeOrderInvalid を通る", () => {
  // 既定は配信物そのもの（app-admin.js＋app-shift.js＋app-company.js）。SHIFTY_ADMIN_SRC／SHIFTY_SHIFT_SRC／SHIFTY_COMPANY_SRC は
  // この走査が本当に検出できるかを確かめる差し替え口（_readAdminSurface）。
  const raw = _readAdminSurface();
  // **コメントを先に落とす。** 落とさないと「同じ isTimeOrderInvalid を通す」と書いた説明コメントだけで
  // 走査が通り、呼び出しを外しても検出できない（対照で実測した偽陰性）。
  // 落とすのは行まるごとのコメントと、引用符・スラッシュを1つも含まない行の末尾コメントだけ
  // ＝文字列や正規表現の途中を誤って切らない。
  const src = raw.split("\n").map(l => {
    if (l.trim().startsWith("//")) return "";
    const i2 = l.indexOf("//");
    if (i2 < 0) return l;
    return /["'`/]/.test(l.slice(0, i2)) ? l : l.slice(0, i2);
  }).join("\n");
  // 宣言位置から波括弧の対応で本文を切り出す（文字列・テンプレートリテラル中の括弧は数えない）
  const bodyOf = name => {
    const i3 = src.indexOf(`const ${name}=(`);
    assert.ok(i3 >= 0, `${name} の宣言が見つからない`);
    const open = src.indexOf("{", src.indexOf("=>", i3));
    let d = 0, q = null;
    for (let j = open; j < src.length; j++) {
      const c = src[j], prev = src[j - 1];
      if (q) { if (c === q && prev !== "\\") q = null; continue; }
      if (c === '"' || c === "'" || c === "`") { q = c; continue; }
      if (c === "{") d++;
      else if (c === "}") { d--; if (d === 0) return src.slice(open, j + 1); }
    }
    assert.fail(`${name} の本文を切り出せない`);
  };
  ["applyEditToSubs", "saveAdj"].forEach(n =>
    assert.ok(/isTimeOrderInvalid/.test(bodyOf(n)),
      `${n} が isTimeOrderInvalid を通っていない（片方だけだと同じ状態をもう一方の入口から作れる）`));
  // セル色・エラーパネルの単一ソースになる timeErrors も同じ関数から作る（表示と保存時の判定がずれない）
  const ti = src.indexOf("const timeErrors=useMemo(");
  assert.ok(ti >= 0, "timeErrors が見つからない");
  assert.ok(/isTimeOrderInvalid/.test(src.slice(ti, ti + 900)), "timeErrors が isTimeOrderInvalid を通っていない");
  // ポジション不足の割り込みは入力ミス色を上書きしない。2026-09-26 に dev 実機で、不足のある日の
  // 出勤セルが黄色に塗り替えられて**セル側の手がかりが消える**のを実測して直した。
  const pe = src.split("\n").find(l => l.includes("cellPosErr(name,date,field===") && l.includes("LEGEND_COLORS.posErr"));
  assert.ok(pe, "posErr の割り込み行が見つからない");
  assert.ok(pe.includes("LEGEND_COLORS.timeErr"),
    "posErr の割り込みが timeErr を除外していない（不足のある日は入力ミスのセル色が消える）");
});

// ===== 労務判定 第2弾（A制の中核）=====
// 期待値は確定仕様 S-2・S-4・S-6 からの転記。実装の出力から逆生成していない。

test("Excel丸め: ROUND は絶対値が大きい方へ丸める（Math.round と負の値で違う）", () => {
  assert.strictEqual(u.excelRound(0.5), 1);
  assert.strictEqual(u.excelRound(-0.5), -1, "Math.round(-0.5) は -0 になる");
  assert.strictEqual(u.excelRound(2.345, 2), 2.35);
  assert.strictEqual(u.excelRound(-2.345, 2), -2.35);
  assert.strictEqual(u.excelRound(1.005, 2), 1.01, "二進小数の取りこぼしを起こさない");
  assert.strictEqual(u.excelRoundUp(5.3667, 2), 5.37);
  assert.strictEqual(u.excelRoundUp(5.37, 2), 5.37, "ちょうどの値は増やさない");
  assert.strictEqual(u.excelRoundDown(5.379, 2), 5.37);
  assert.strictEqual(u.excelRoundDown(200.13333, 0), 200);
});

test("S-2 月の残業予定 = ROUNDUP(MAX(0, 月実働 − 総枠), 2)", () => {
  const base = u.monthlyBaseMin(HM(40, 0), 31) / 60; // 177.1333…h
  assert.strictEqual(u.monthlyOvertimeH(182.5, base), 5.37);
  assert.strictEqual(u.monthlyOvertimeH(170, base), 0, "総枠以下なら0");
  assert.strictEqual(u.monthlyOvertimeH(base, base), 0);
});

test("S-2 日別の按分: 24日の系列が Excel と一致し、和が月の残業予定と完全に一致する", () => {
  // 1〜15日目 7.5h / 16〜20日目 6.0h / 21〜24日目 10.0h ＝ 月実働 182.5h
  const days = [...Array(15).fill(7.5), ...Array(5).fill(6.0), ...Array(4).fill(10.0)];
  assert.strictEqual(days.reduce((a, b) => a + b, 0), 182.5);
  const base = u.monthlyBaseMin(HM(40, 0), 31) / 60;
  const ot = u.monthlyOvertimeH(182.5, base);
  assert.strictEqual(ot, 5.37);
  const per = u.prorateOvertimeH(days, ot, 182.5);
  const exp = [
    0.22, 0.22, 0.22, 0.22, 0.22, 0.22, 0.22, // 1〜7日目
    0.23,                                     // 8日目
    0.22, 0.22, 0.22, 0.22, 0.22, 0.22, 0.22, // 9〜15日目
    0.18, 0.17, 0.18, 0.18, 0.17,             // 16〜20日目
    0.30, 0.29, 0.30, 0.29,                   // 21〜24日目
  ];
  assert.deepStrictEqual(per, exp);
  assert.strictEqual(u.excelRound(per.reduce((a, b) => a + b, 0), 2), 5.37, "日別の和 = 月の残業予定");
});

test("S-2 按分の対象外: 実働0以下の日・月の残業予定0・月実働0 はすべて0", () => {
  assert.deepStrictEqual(u.prorateOvertimeH([7.5, 0, 7.5], 0, 15), [0, 0, 0], "残業予定0");
  assert.deepStrictEqual(u.prorateOvertimeH([7.5, 7.5], 5, 0), [0, 0], "月実働0");
  const p = u.prorateOvertimeH([8, 0, 8], 2, 16);
  assert.strictEqual(p[1], 0, "実働0の日は0");
  assert.strictEqual(u.excelRound(p.reduce((a, b) => a + b, 0), 2), 2);
});

test("S-6 目安の確認: 4段階が条件・丸めともに一致する（総枠177:08・固定残業30h・目安200h）", () => {
  const base = u.monthlyBaseMin(HM(40, 0), 31), fix = HM(30, 0), guide = HM(200, 0);
  const g = w => u.guideStatusOf(w, base, fix, guide);
  // みなし超: 月実働 > ROUND(総枠+固定残業,2) = 207.13h
  assert.deepStrictEqual(
    { k: g(HM(210, 0)).key, l: g(HM(210, 0)).label }, { k: "over", l: "みなし超 2.87h" });
  // 所定未満: 月実働 < ROUND(総枠,2) = 177.13h
  assert.deepStrictEqual(
    { k: g(HM(170, 0)).key, l: g(HM(170, 0)).label }, { k: "under_base", l: "所定未満 あと7.14h" });
  // 目安未満: 月実働 < 目安 200h
  assert.deepStrictEqual(
    { k: g(HM(190, 0)).key, l: g(HM(190, 0)).label }, { k: "under_guide", l: "目安未満 あと10h" });
  // OK: 残りは ROUNDDOWN
  assert.deepStrictEqual(
    { k: g(HM(205, 0)).key, l: g(HM(205, 0)).label }, { k: "ok", l: "OK 上限まで2.13h" });
  // 月実働0（1日も出勤がない人）は空欄
  assert.strictEqual(g(0).key, "none");
});

test("S-4 第2弾ぶんの日次・月次判定: 文言と発火条件", () => {
  const A = o => u.laborFindingLabels({ laborSystem: "A", monthReady: true, ...o });
  assert.deepStrictEqual(A({ monthOtH: 46, agreementMonthlyOtH: 45 }), ["月の残業が上限超"]);
  assert.deepStrictEqual(A({ monthOtH: 45, agreementMonthlyOtH: 45 }), [], "ちょうどは出ない");
  assert.deepStrictEqual(A({ monthOtH: 31, fixedOtH: 30, agreementMonthlyOtH: 45 }), ["固定残業30h超"]);
  assert.deepStrictEqual(A({ dayOtH: [3.5, 1, 4], agreementDailyOtH: 3 }), ["1日の残業予定が上限超2日"]);
  assert.deepStrictEqual(A({ dayOtH: [3], agreementDailyOtH: 3 }), [], "ちょうどは出ない");
  // 単月100h未満（S-4 の表に無い行。文言は判断4を受けてここで決めた）
  assert.deepStrictEqual(A({ monthOtH: 100, agreementMonthlyOtH: 200, fixedOtH: 0 }), ["月の残業が100h以上"]);
  assert.deepStrictEqual(A({ monthOtH: 99.99, agreementMonthlyOtH: 200, fixedOtH: 0 }), []);
  // B制: 1日の残業が上限超（8h+協定値）
  assert.deepStrictEqual(
    u.laborFindingLabels({ laborSystem: "B", dayMins: [HM(11, 1), HM(11, 0)], agreementDailyOtH: 3 }),
    ["8h超2日(残業)", "1日の残業が上限超1日"]);
});

test("S-4 月が埋まっていないときは月単位の判定を出さない（日単位は出す）", () => {
  const o = { laborSystem: "A", dayMins: [HM(13, 0)], monthOtH: 60, agreementMonthlyOtH: 45, fixedOtH: 30 };
  assert.deepStrictEqual(u.laborFindingLabels({ ...o, monthReady: true }),
    ["12h超1日", "月の残業が上限超", "固定残業30h超"]);
  assert.deepStrictEqual(u.laborFindingLabels({ ...o, monthReady: false }), ["12h超1日"]);
});

test("S-6 総括判定: 上から順に 要修正／目安未満／残業あり／OK", () => {
  const v = o => u.overallVerdictOf(o).label;
  const F = o => u.laborFindingsFor(o);
  assert.strictEqual(v({ laborSystem: "A", findings: F({ laborSystem: "A", dayMins: [HM(13, 0)] }), guideKey: "ok" }), "要修正");
  assert.strictEqual(v({ laborSystem: "A", findings: [], guideKey: "over" }), "要修正", "みなし超");
  assert.strictEqual(v({ laborSystem: "A", findings: [], guideKey: "under_base" }), "要修正", "所定未満");
  assert.strictEqual(v({ laborSystem: "A", findings: [], guideKey: "under_guide" }), "目安未満");
  assert.strictEqual(v({ laborSystem: "B", findings: F({ laborSystem: "B", dayMins: [HM(9, 0)] }), guideKey: "none" }), "残業あり");
  assert.strictEqual(v({ laborSystem: "B", findings: [], guideKey: "none" }), "OK");
  // 時刻の入力ミスはどちらの区分でも要修正。休憩不足は 2026-10-10 から要修正にしない（画面の労務の確認から外した10項目）
  assert.strictEqual(v({ laborSystem: "B", findings: F({ laborSystem: "B", timeErrorCount: 1 }), guideKey: "none" }), "要修正");
  assert.strictEqual(v({ laborSystem: "B", findings: F({ laborSystem: "B", breakShortCount: 1 }), guideKey: "none" }), "OK");
  // 内部値 none は休憩不足も出さない（労務の判定のため）。時刻の入力ミスだけは区分によらず出る
  assert.deepStrictEqual(u.laborFindingLabels({ laborSystem: "none", breakShortCount: 2, timeErrorCount: 1 }),
    ["時刻の入力ミス1日"]);
  assert.strictEqual(v({ laborSystem: null, findings: F({ laborSystem: null }), guideKey: "none" }), "要修正", "区分が空欄");
  // 内部値 none（所属店舗で判定する人）は空欄
  assert.strictEqual(v({ laborSystem: "none", findings: [], guideKey: "none" }), "");
  // 月が埋まっていない A制は「＋OK」（Shifty固有・S-6 の4値の外。2026-09-26 に「要確認」から変更）
  assert.strictEqual(v({ laborSystem: "A", findings: [], guideKey: "none", monthReady: false }), "＋OK");
  // **月に帰属する目安は総括に入れない。** 呼び出し側は月が埋まる前も現状の実数で guideStatusOf を
  // 出すので、その key を採ると暦月の枠に対して全員が所定未満＝要修正になる
  assert.strictEqual(v({ laborSystem: "A", findings: [], guideKey: "under_base", monthReady: false }), "＋OK");
  assert.strictEqual(v({ laborSystem: "A", findings: [], guideKey: "under_guide", monthReady: false }), "＋OK");
  // 日に帰属する要修正は月が埋まっていなくても出る（材料が揃っているので伏せる理由が無い）
  assert.strictEqual(v({ laborSystem: "A", findings: [{ key: "over12" }], guideKey: "none", monthReady: false }), "要修正");
  // B制は月に帰属する判定を持たないので monthReady に影響されない
  assert.strictEqual(v({ laborSystem: "B", findings: [], guideKey: "none", monthReady: false }), "OK");
  // 週の休みの ×休なし は第3弾で渡す。渡せば要修正になる
  assert.strictEqual(v({ laborSystem: "B", findings: [], guideKey: "none", weekNoRest: true }), "要修正");
});

// ===== 労務判定 第3弾（休みと休憩）=====
// 期待値は確定仕様 S-3・S-5・S-6 からの転記。実装の出力から逆生成していない。
const BT = b => ({ breakTimes: { weekday: b, sat: [], sun: [], holSat: [], holSun: [] }, candidates: [] });
const WD = "2026-10-01"; // 木曜（平日）
const netOf = (st, sh, name = "田中") =>
  u.calcNetWorkMinutes(sh, u.getBreaksFor(st, WD, name, sh), u.getOT(name, st, sh), st);

test("S-3 休憩: 両方式で結果が食い違う4ケースが表どおりになる", () => {
  const cases = [
    // [シフト, 休憩帯, 長さ方式の実働, 時間帯方式の実働]
    [["09:00", "15:00"], [{ start: "12:00", end: "13:00" }], HM(6, 0), HM(5, 0)],
    [["11:00", "23:00"], [{ start: "14:00", end: "17:00" }], HM(11, 0), HM(9, 0)],
    [["12:30", "21:00"], [{ start: "12:00", end: "13:00" }], HM(7, 45), HM(8, 30)],
    [["17:30", "23:00"], [], HM(5, 30), HM(5, 30)],
  ];
  cases.forEach(([[a, b], breaks, lenExp, bandExp], i) => {
    const sh = { status: "work", start: a, end: b };
    assert.strictEqual(netOf({ ...BT(breaks), breakMode: "length" }, sh), lenExp, `ケース${i + 1} 長さ方式`);
    assert.strictEqual(netOf(BT(breaks), sh), bandExp, `ケース${i + 1} 時間帯方式`);
  });
});

test("S-3 休憩の段は実働で決める（拘束8.5h は 1.0h ではなく 0.75h）", () => {
  // S-3 の本文は「拘束>8h→1.0h」だが同じ節の表はケース3で 0.75h・実働7.75h としている。
  // 労基法34条の「労働時間」も実働なので表を採った。この境界を固定する。
  const st = { ...BT([]), breakMode: "length" };
  assert.strictEqual(netOf(st, { status: "work", start: "12:30", end: "21:00" }), HM(7, 45), "拘束8.5h → 45分");
  assert.strictEqual(netOf(st, { status: "work", start: "11:00", end: "23:00" }), HM(11, 0), "拘束12h → 60分");
  assert.strictEqual(netOf(st, { status: "work", start: "09:00", end: "15:00" }), HM(6, 0), "拘束6h ちょうどは0");
  assert.strictEqual(netOf(st, { status: "work", start: "09:00", end: "15:46" }), HM(6, 1), "拘束6h46m → 45分");
});

test("S-3 休憩不足: 実働>6h の日だけが対象で、基準を下回ると不足", () => {
  const short = (st, sh) => u.isBreakShort(sh, st, WD, "田中");
  // 時間帯方式で 12:30〜21:00＋休憩帯12:00〜13:00 は控除0＝主たる検出対象
  assert.strictEqual(short(BT([{ start: "12:00", end: "13:00" }]), { status: "work", start: "12:30", end: "21:00" }), true);
  // 長さ方式なら 0.75h 引かれるので不足にならない（S-3 の注記どおり）
  assert.strictEqual(short({ ...BT([{ start: "12:00", end: "13:00" }]), breakMode: "length" },
    { status: "work", start: "12:30", end: "21:00" }), false);
  // 実働6h ちょうどは対象外
  assert.strictEqual(short(BT([]), { status: "work", start: "09:00", end: "15:00" }), false);
  // 実働>8h は 0.999h が基準。45分では不足、60分なら足りる
  assert.strictEqual(short(BT([]), { status: "work", start: "09:00", end: "18:30", adjustedBreak: 45 }), true);
  assert.strictEqual(short(BT([]), { status: "work", start: "09:00", end: "18:30", adjustedBreak: 60 }), false);
  // 休みの日は対象外
  assert.strictEqual(short(BT([]), { status: "holiday" }), false);
});

test("S-3 休憩不足: 退勤延長が付いた日でも 拘束 − 実働 が負にならない", () => {
  // 拘束も実働も同じ範囲（延長・締を含む）で測るので、控除より延長が長くても負にならない。
  const st = { ...BT([{ start: "12:00", end: "13:00" }]), overtimeSettings: { byStaff: { 田中: { lunch: 120, dinner: 120 } } } };
  const sh = { status: "work", start: "09:00", end: "18:00" };
  const work = netOf(st, sh);
  const bind = u.shiftBindingMin(sh, st, "田中");
  assert.ok(bind - work >= 0, `拘束${bind} − 実働${work} が負`);
  assert.strictEqual(bind - work, 60, "引かれた休憩そのものと一致する");
  // 締の追加出勤がある日も同じ
  const sh2 = { status: "work", start: "09:00", end: "18:00", extraStart: "23:00", extraEnd: "25:00" };
  assert.ok(u.shiftBindingMin(sh2, st, "田中") - netOf(st, sh2) >= 0);
});

test("労務判定: 日に帰属する項目すべてに該当日を出す（月は出さず日だけ）", () => {
  const D = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05"];
  // A制: 1日=13h(12h超) / 2日=2h(4h未満) / 3日=8h / 4日=休み / 5日=9h・残業予定4h(上限3h超)
  assert.deepStrictEqual(u.laborFindingLabels({
    laborSystem: "A", dayDates: D, dayMins: [HM(13, 0), HM(2, 0), HM(8, 0), 0, HM(9, 0)],
    dayOtH: [0, 0, 0, 0, 4], agreementDailyOtH: 3,
    breakShortDates: ["2026-10-03", "2026-10-05"], timeErrorDates: ["2026-10-02"],
  }), ["12h超1日（1）", "4h未満1日（2）", "1日の残業予定が上限超1日（5）",
    "休憩不足2日（3・5）", "時刻の入力ミス1日（2）"]);
  // B制: 8h超は日で、週40h超は**該当週**（月曜〜日曜の日）で出す
  const W = [[HM(9, 0), HM(9, 0), HM(9, 0), HM(9, 0), HM(9, 0), HM(9, 0), 0], [HM(8, 0), HM(8, 0), 0, 0, 0, 0, 0]];
  assert.deepStrictEqual(u.laborFindingLabels({
    laborSystem: "B", dayDates: D, dayMins: [HM(9, 0), HM(8, 0), 0, 0, 0],
    weekDayMins: W, weekDates: ["2026-10-05", "2026-10-12"], agreementDailyOtH: 2,
  }), ["8h超1日(残業)（1）", "週40h超(残業)（5〜11）"]);
  // 協定なしの側も同じ該当週を出す（同じ週を2つの文言で説明するので食い違わせない）
  assert.deepStrictEqual(u.laborFindingLabels({
    laborSystem: "B", weekDayMins: W, weekDates: ["2026-10-05", "2026-10-12"],
  }), ["週40h超(残業)（5〜11）", "週40h超(協定なし)（5〜11）"]);
  // 日付を渡さない従来の呼び出しは表示が変わらない（後方互換）
  assert.deepStrictEqual(u.laborFindingLabels({
    laborSystem: "A", dayMins: [HM(13, 0)], breakShortCount: 2, timeErrorCount: 1,
  }), ["12h超1日", "休憩不足2日", "時刻の入力ミス1日"]);
  // 日付を渡したときは件数もそこから数える（同じ問いへの答えを2つ持たない）
  assert.deepStrictEqual(u.laborFindingLabels({
    laborSystem: "A", breakShortCount: 9, breakShortDates: ["2026-09-17"],
  }), ["休憩不足1日（17）"]);
  // 多い日は上限まで並べて残りを件数で示す（休憩を1件も設定していない店舗では全出勤日が該当する）
  const many = Array.from({ length: u.LABOR_FINDING_DATES_MAX + 3 },
    (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`);
  const lbl = u.laborFindingLabels({ laborSystem: "A", breakShortDates: many })[0];
  assert.ok(lbl.startsWith(`休憩不足${many.length}日（1・2・`), lbl);
  assert.ok(lbl.endsWith(" ほか3日）"), lbl);
  assert.strictEqual((lbl.match(/・/g) || []).length, u.LABOR_FINDING_DATES_MAX - 1, "並べる日付は上限まで");
  // 内部値 none は日付を渡しても休憩不足そのものを出さない（区分の規則が先）
  assert.deepStrictEqual(u.laborFindingLabels({ laborSystem: "none", breakShortDates: ["2026-09-17"] }), []);
});

test("項目8 日別の休憩上書き(adjustedBreak): 方式によらず最優先で効く", () => {
  const sh = m => ({ status: "work", start: "09:00", end: "18:00", adjustedBreak: m });
  assert.strictEqual(netOf(BT([{ start: "12:00", end: "13:00" }]), sh(30)), HM(8, 30), "時間帯方式の60分より優先");
  assert.strictEqual(netOf({ ...BT([]), breakMode: "length" }, sh(30)), HM(8, 30), "長さ方式の60分より優先");
  assert.strictEqual(netOf(BT([{ start: "12:00", end: "13:00" }]), sh(0)), HM(9, 0), "0 は「休憩なし」として効く");
  assert.ok(u.ADMIN_SHIFT_FIELDS.includes("adjustedBreak"), "再提出で消えないよう登録されている");
  assert.ok(u.ADMIN_SHIFT_FIELDS.includes("leaveType"));
});

test("項目8 設定キーの無い既存店舗は時間帯方式＝現行挙動（既定の担保）", () => {
  assert.strictEqual(u.breakModeOf({}), "band");
  assert.strictEqual(u.breakModeOf(null), "band");
  assert.strictEqual(u.breakModeOf({ breakMode: "なにか" }), "band");
  assert.deepStrictEqual(u.breakLengthOf({}), u.DEFAULT_BREAK_LENGTH);
  // 合成の休憩帯には synthetic:true が付く（時間帯として読む側＝ヒートマップが除外できる）
  const b = u.getBreaksFor({ ...BT([]), breakMode: "length" }, WD, "田中", { status: "work", start: "09:00", end: "20:00" });
  assert.strictEqual(b.length, 1);
  assert.strictEqual(b[0].synthetic, true);
  assert.ok(!u.getBreaksFor(BT([{ start: "12:00", end: "13:00" }]), WD, "田中",
    { status: "work", start: "09:00", end: "20:00" })[0].synthetic, "時間帯方式は実在の帯");
});

// ===== P3.5a 長さ方式のしきい値設定（労務給与_複数法人_実装計画.md §3.9-1・§6 P3.5a）=====
// 期待値は計画書 §6 P3.5a のテスト欄からの転記。中休み（idleBreak）は 2026-10-02 のユーザー指示で機能ごと削除した。
const brkMin = (st, sh, d = WD) => u.breakMinutesOf(u.getBreaksFor(st, d, "田中", { status: "work", ...sh }));
const BIND6 = { basis: "binding", tiers: [{ overMin: 360, breakMin: 60, inclusive: true }] };
const IDLE = { enabled: true, startBy: "14:30", endAfter: "17:00", min: 120, days: "weekday" };
test("P3.5a 長さ方式のしきい値を拘束で・6h ちょうどを含めて判定できる", () => {
  const st = { ...BT([]), breakMode: "length", breakLength: BIND6 };
  assert.strictEqual(brkMin(st, { start: "17:00", end: "23:00" }), 60, "17-23（拘束6h ちょうど）は60分");
  assert.strictEqual(brkMin(st, { start: "10:00", end: "17:00" }), 60, "10-17 は60分");
  assert.strictEqual(brkMin(st, { start: "10:00", end: "15:59" }), 0, "10-15:59 は0分");
  // 「超」（inclusive:false）なら6h ちょうどは当たらない
  const ex = { ...st, breakLength: { basis: "binding", tiers: [{ overMin: 360, breakMin: 60, inclusive: false }] } };
  assert.strictEqual(brkMin(ex, { start: "17:00", end: "23:00" }), 0);
  assert.deepStrictEqual(u.breakLengthRuleOf(st), { basis: "binding", custom: true, tiers: BIND6.tiers });
});
test("P3.5a 設定の無い店舗は従来どおり（17-23 は0分・over6Min を60にしても段は実働6h超のまま）", () => {
  assert.strictEqual(brkMin({ ...BT([]), breakMode: "length" }, { start: "17:00", end: "23:00" }), 0);
  // v8 の実測: 既存の長さ方式に値だけ入れても「6h 以上→60分」は表せない（これがしきい値設定を足した理由）
  const old = { ...BT([]), breakMode: "length", breakLength: { over8Min: 60, over6Min: 60 } };
  assert.strictEqual(brkMin(old, { start: "17:00", end: "23:00" }), 0, "17-23");
  assert.strictEqual(brkMin(old, { start: "10:00", end: "17:00" }), 0, "10-17");
  // 既定の2段は tiers に展開しても S-3 の4ケース（上のテスト）と同じ値になる
  assert.deepStrictEqual(u.breakLengthRuleOf({}).tiers.map(t => [t.overMin, t.breakMin, t.inclusive]),
    [[u.LEGAL_DAILY_MIN, 60, false], [u.BREAK_SHORT_TARGET_MIN, 45, false]]);
  assert.strictEqual(u.breakLengthRuleOf({}).basis, "work");
  assert.strictEqual(brkMin(BT([{ start: "12:00", end: "13:00" }]), { start: "10:00", end: "22:00" }), 60);
});
test("中休みの削除（2026-10-02）: 店舗データに idleBreak が残っていても読まず、優先順は 上書き ＞ 長さ ＞ 時間帯", () => {
  // 本番の NITO 店舗の値（14:30以前出勤・17:00以降退勤・120分）を残したまま計算する
  const left = { enabled: true, startBy: "14:30", endAfter: "17:00", min: 120, days: "all" };
  const len = { ...BT([{ start: "15:00", end: "17:00" }]), breakMode: "length", breakLength: BIND6, idleBreak: left };
  assert.strictEqual(brkMin(len, { start: "10:00", end: "22:00" }), 60, "長さ方式の通し勤務は長さ方式の60分（以前は中休み120分）");
  assert.strictEqual(brkMin(len, { start: "10:00", end: "17:00" }), 60, "10-17 も60分");
  assert.strictEqual(brkMin(len, { start: "10:00", end: "22:00", adjustedBreak: 30 }), 30, "日別の上書きが最優先");
  const band = { ...BT([{ start: "15:00", end: "17:00" }]), idleBreak: left };
  assert.strictEqual(brkMin(band, { start: "10:00", end: "23:00" }), 120, "時間帯方式は休憩帯 15-17 をまたぐ日に120分");
  assert.strictEqual(brkMin(band, { start: "10:00", end: "17:00" }), 0, "休憩の後に勤務が無い日（退勤＝休憩の終わり）は当たらない");
  assert.strictEqual(brkMin(band, { start: "17:00", end: "23:00" }), 0, "休憩の前に勤務が無い日も当たらない");
  assert.ok(!u.getBreaksFor(band, WD, "田中", { status: "work", start: "10:00", end: "23:00" }).some(b => b.synthetic), "時間帯方式は位置つきの帯（合成の帯ではない）");
  // 出どころに中休みは無い
  const d = sh => u.breakDecisionOf(len, WD, "田中", { status: "work", ...sh });
  assert.deepStrictEqual(d({ start: "10:00", end: "22:00" }), { source: "length", min: 60, autoMin: 60, autoSource: "length" });
  assert.deepStrictEqual(d({ start: "10:00", end: "22:00", adjustedBreak: 45 }), { source: "manual", min: 45, autoMin: 60, autoSource: "length" });
  assert.strictEqual(d({ start: "10:00", end: "22:00", adjustedBreak: 0 }).source, "manual", "0 も手動（休憩なし）");
  assert.strictEqual(u.breakDecisionOf(BT([]), WD, "田中", { status: "work", start: "10:00", end: "15:00" }).source, "band");
  // 関数・写しのキー・画面からも消えている（ドリフト検出）
  assert.strictEqual(u.idleBreakOf, undefined);
  assert.strictEqual(u.IDLE_BREAK_DAYS, undefined);
  assert.ok(!u.PERIOD_SNAPSHOT_SETTING_KEYS.includes("idleBreak"), "写しに中休みを焼かない");
  const fs = require("node:fs"), path = require("node:path");
  ["app-utils.js", "app-admin.js", "app-company.js", "app-shift.js", "app-main.js", "app-staff.js", "app-core.js"].forEach(f => {
    const src = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
    assert.ok(!/idleBreakOf|_idleBreakMin|IDLE_BREAK|data-idle/.test(src), `${f} に中休みの参照が残っている`);
  });
});
test("ヒートマップの休憩（2026-10-02）: 長さ方式は勤務時間を長さ方式で引き、ヒートマップだけ候補タブの休憩帯で外す", () => {
  const len = { ...BT([{ start: "15:00", end: "17:00" }]), breakMode: "length", breakLength: BIND6 };
  const w = (a, b, x) => ({ status: "work", start: a, end: b, ...(x || {}) });
  const pos = l => l.map(b => `${b.start}-${b.end}${b.synthetic ? "*" : ""}`);
  // 勤務時間・休憩の分は長さ方式のまま（10-23 拘束13h → 60分・実働12h）
  assert.strictEqual(brkMin(len, { start: "10:00", end: "23:00" }), 60);
  assert.strictEqual(u.calcNetWorkMinutes(w("10:00", "23:00"), u.getBreaksFor(len, WD, "田中", w("10:00", "23:00")), 0, len), 720);
  // ヒートマップは候補タブの 15-17（以前は勤務の先頭 10-11 の合成の帯を外していた）
  assert.deepStrictEqual(pos(u.heatBreaksFor(len, WD, "田中", w("10:00", "23:00"))), ["15:00-17:00"]);
  assert.deepStrictEqual(pos(u.heatBreaksFor(len, WD, "田中", w("17:00", "23:00"))), [], "休憩帯を含まない勤務は外さない（長さ方式の60分はヒートマップに出さない）");
  assert.deepStrictEqual(pos(u.heatBreaksFor(len, WD, "田中", w("10:00", "17:00"))), [], "退勤＝休憩の終わりは時間帯方式と同じく当てない");
  assert.deepStrictEqual(pos(u.heatBreaksFor(len, WD, "田中", w("10:00", "23:00", { adjustedBreak: 30 }))), ["15:00-17:00"], "日別の上書き（分だけ）でもヒートマップは休憩帯");
  // 属性ありの休憩が当たる人はその帯（勤務時間と同じ）、当たらない人は全属性の休憩帯（2026-10-02）
  const tag = { ...BT([{ start: "15:00", end: "17:00", tags: ["employee"] }, { start: "20:00", end: "21:00" }]), breakMode: "length", breakLength: BIND6, staffAttributes: { "田中": "employee" } };
  assert.deepStrictEqual(pos(u.heatBreaksFor(tag, WD, "田中", w("10:00", "23:00"))), ["15:00-17:00"], "社員は属性ありの 15-17（全属性の 20-21 とは差し替え）");
  assert.deepStrictEqual(pos(u.heatBreaksFor(tag, WD, "佐藤", w("10:00", "23:00"))), ["20:00-21:00"], "社員でない人は全属性の 20-21");
  assert.deepStrictEqual(pos(u.heatBreaksFor(tag, WD, "田中", w("17:00", "23:00"))), ["20:00-21:00"], "属性ありの休憩が当たらない日は全属性の休憩帯");
  // 時間帯方式は従来どおり getBreaksFor と同じ
  const band = BT([{ start: "15:00", end: "17:00" }]);
  [w("10:00", "23:00"), w("10:00", "23:00", { adjustedBreak: 30 }), w("17:00", "23:00")].forEach(sh =>
    assert.deepStrictEqual(u.heatBreaksFor(band, WD, "田中", sh), u.getBreaksFor(band, WD, "田中", sh)));
  // シフト作成タブのヒートマップは heatBreaksFor を通す（ドリフト検出）
  // 1人1日の区間は app-utils.js の heatStaffDayEntriesOf（従業員画面のシフト表の人数と共有・2026-10-04）
  const src = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "app-shift.js"), "utf8");
  const i = src.indexOf("const heatData=useMemo(");
  const body = src.slice(i, src.indexOf("perDate[date]=arr;", i));
  assert.ok(i > 0 && /heatStaffDayEntriesOf\(/.test(body) && !/getBreaksFor\(|heatBreaksFor\(/.test(body), "heatData が heatStaffDayEntriesOf を通っていない");
  const usrc = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "app-utils.js"), "utf8");
  const j = usrc.indexOf("function heatStaffDayEntriesOf(");
  const hb = usrc.slice(j, usrc.indexOf("\n}\n", j));
  assert.ok(j > 0 && /heatBreaksFor\(settings,date,name,hsh\)/.test(hb) && !/getBreaksFor\(/.test(hb), "heatStaffDayEntriesOf が heatBreaksFor 以外で休憩を引いている");
});
test("長さ方式でも属性ありの休憩が当たる日はそちらを優先する（2026-10-02）", () => {
  // 鷄えん東通りの土曜の形: パート 15-17・社員 17-18（属性あり）。段は拘束6h以上 → 60分
  const st = { breakTimes: { weekday: [{ start: "15:00", end: "17:00", tags: ["parttime"] }, { start: "17:00", end: "18:00", tags: ["employee"] }, { start: "20:00", end: "21:00" }], sat: [], sun: [], holSat: [], holSun: [] },
    candidates: [], breakMode: "length", breakLength: BIND6, staffAttributes: { "社員": "employee" } };
  const w = (a, b, x) => ({ status: "work", start: a, end: b, ...(x || {}) });
  const pos = l => l.map(b => `${b.start}-${b.end}${b.synthetic ? "*" : ""}`);
  const br = (n, sh) => pos(u.getBreaksFor(st, WD, n, sh));
  assert.deepStrictEqual(br("パート", w("10:00", "23:00")), ["15:00-17:00"], "パートの通しは属性ありの 15-17（120分）");
  assert.deepStrictEqual(br("社員", w("10:00", "23:00")), ["17:00-18:00"], "社員の通しは属性ありの 17-18（60分）");
  assert.deepStrictEqual(br("パート", w("17:00", "23:00")), ["17:00-18:00*"], "属性ありの休憩を含まない日は長さ方式の60分（全属性の 20-21 は勤務時間に使わない）");
  assert.deepStrictEqual(br("社員", w("10:00", "15:00")), [], "長さ方式でも休憩なしの日（拘束5h）");
  assert.deepStrictEqual(br("パート", w("10:00", "23:00", { adjustedBreak: 30 })), ["10:00-10:30*"], "日別の上書きが最優先");
  assert.deepStrictEqual(br("パート", { status: "work", start: "10:00" }), [], "片側セルには付けない");
  assert.strictEqual(u.calcNetWorkMinutes(w("10:00", "23:00"), u.getBreaksFor(st, WD, "パート", w("10:00", "23:00")), 0, st), 660, "13h − 120分");
  // 休憩の出どころ（詳細モーダル）
  assert.strictEqual(u.breakDecisionOf(st, WD, "パート", w("10:00", "23:00")).source, "band");
  assert.strictEqual(u.breakDecisionOf(st, WD, "パート", w("17:00", "23:00")).source, "length");
  // 深夜の按分: 属性ありの休憩は位置を持つ（合成の帯ではない）
  assert.ok(!u.getBreaksFor(st, WD, "パート", w("10:00", "23:00")).some(b => b.synthetic));
});
test("長さ方式の休憩と候補タブの休憩の食い違い（2026-10-02）: 全属性の休憩帯の合計といちばん長い段の分を日区分ごとに比べる", () => {
  const T2 = { basis: "binding", tiers: [{ overMin: 480, breakMin: 60, inclusive: true }, { overMin: 360, breakMin: 60, inclusive: true }] };
  const b15 = [{ start: "15:00", end: "17:00" }];
  const nito = { breakTimes: { weekday: b15, sat: b15, sun: b15, holSat: b15, holSun: b15 }, breakMode: "length", breakLength: T2 };
  const m = u.lengthBandMismatchOf(nito);
  assert.deepStrictEqual(m.map(x => [x.dayType, x.bandMin, x.lengthMin]), [["weekday", 120, 60], ["sat", 120, 60], ["sun", 120, 60], ["holSat", 120, 60], ["holSun", 120, 60]]);
  assert.strictEqual(u.lengthBandMismatchText(m), "長さ方式の休憩（60分）と候補タブの全属性の休憩（平日・土曜・日曜・祝日（連休中・単日）・祝日（最終日） 15:00〜17:00＝120分）が違います。勤務時間と休憩は長さ方式の60分で計算し（属性ありの休憩が当たる日はその休憩）、全属性の休憩はヒートマップで人数を外す時間帯にだけ使います。");
  // 合計が同じなら出さない（2つの帯の合計でもよい）
  assert.deepStrictEqual(u.lengthBandMismatchOf({ ...nito, ...BT([{ start: "15:00", end: "15:30" }, { start: "16:00", end: "16:30" }]) }), []);
  // いちばん長い段の分と比べる（既定の2段は 8h超60分・6h超45分 → 60分）
  assert.deepStrictEqual(u.lengthBandMismatchOf({ ...BT([{ start: "15:00", end: "16:00" }]), breakMode: "length" }), []);
  assert.strictEqual(u.lengthBandMismatchOf({ ...BT([{ start: "15:00", end: "15:45" }]), breakMode: "length" })[0].lengthMin, 60);
  // タグ付きの休憩帯は比べない・全属性の帯が無い区分は出さない
  assert.deepStrictEqual(u.lengthBandMismatchOf({ ...BT([{ start: "15:00", end: "17:00", tags: ["parttime"] }]), breakMode: "length", breakLength: T2 }), []);
  assert.deepStrictEqual(u.lengthBandMismatchOf({ ...BT([]), breakMode: "length", breakLength: T2 }), []);
  // 時間帯方式の店舗には出さない
  assert.deepStrictEqual(u.lengthBandMismatchOf(BT([{ start: "15:00", end: "17:00" }])), []);
  assert.strictEqual(u.lengthBandMismatchText([]), "");
  // 画面の2か所（設定タブの休憩の決め方・候補タブの休憩時間設定）が同じ関数を通す（ドリフト検出）
  const fs = require("node:fs"), path = require("node:path");
  ["app-company.js", "app-admin.js"].forEach(f => assert.ok(/lengthBandMismatchText\(lengthBandMismatchOf\(settings\)\)/.test(fs.readFileSync(path.join(__dirname, "..", f), "utf8")), `${f} に確認表示が無い`));
});
test("P3.5a 休憩不足の判定（isBreakShort）は法定の基準のまま", () => {
  // 設定で段を短くしても、法定（実働6h超で45分）を下回れば不足になる
  const st = { ...BT([]), breakMode: "length", breakLength: { basis: "binding", tiers: [{ overMin: 360, breakMin: 30, inclusive: true }] } };
  assert.strictEqual(u.isBreakShort({ status: "work", start: "10:00", end: "17:30" }, st, WD, "田中"), true);
  const ok = { ...st, breakLength: BIND6 };
  assert.strictEqual(u.isBreakShort({ status: "work", start: "10:00", end: "17:30" }, ok, WD, "田中"), false);
});

test("項目9 休暇種別: yu=有給・ke=慶弔 がコマンドとして登録され、略称に使えない", () => {
  assert.strictEqual(u.restCommandOf("yu").leaveType, "paid");
  assert.strictEqual(u.restCommandOf("ke").leaveType, "ceremony");
  assert.strictEqual(u.restCommandOf("/").leaveType, undefined, "/ は種別を持たない（終日なら公休）");
  assert.strictEqual(u.restCommandOf("／").key, "/", "全角の別名");
  assert.strictEqual(u.restCommandOf("y"), null, "y は廃止");
  assert.strictEqual(u.restCommandOf("休"), null, "休 は廃止");
  assert.strictEqual(u.restCommandOf("ｙ"), null, "ｙ は廃止");
  assert.strictEqual(u.restCommandOf("YU").leaveType, "paid", "大文字でも受ける");
  assert.strictEqual(u.restCommandOf("9yu"), null, "時間付きはコマンドではない");
  assert.strictEqual(u.extractNote("yu").rest, true);
  assert.strictEqual(u.extractNote("yu").leaveType, "paid");
  assert.strictEqual(u.extractNote("ke").leaveType, "ceremony");
  assert.ok(u.isReservedShopAbbr("yu"), "店舗略称として登録できない");
  assert.ok(u.isReservedShopAbbr("ke"));
  assert.ok(!u.isReservedShopAbbr("三"), "通常の略称は通る（非回帰）");
  // k（キッチン入り）は1文字のサフィックスのままで、ke に食われない
  assert.strictEqual(u.restCommandOf("k"), null);
  assert.strictEqual(u.extractNote("9k").note, "k");
  // 休暇は色ではなくセルの文字で見せる（2026-09-26 ユーザー指示）。色のレジェンドは持たない。
  ["leavePublic", "leavePaid", "leaveCeremony"].forEach(k =>
    assert.ok(!u.CELL_COLOR_LEGEND.some(c => c.key === k), `legend ${k} は色で持たない`));
  assert.strictEqual(u.leaveCellTextOf({ status: "work", leaveType: "paid" }), "有給", "旧い日単位の形も読む");
  assert.strictEqual(u.leaveCellTextOf({ status: "work", leaveTypes: { start: "paid", end: "paid" } }), "有給");
  // **有給は半日単位。打ち込んだ帯にだけ文字が出る**（2026-09-26 ユーザー指示）
  const halfPaid = { status: "work", adminRest: { start: true }, leaveTypes: { start: "paid" }, end: "22:00" };
  assert.strictEqual(u.leaveCellTextOf(halfPaid, "start"), "有給");
  assert.strictEqual(u.leaveCellTextOf(halfPaid, "end"), "");
  assert.deepStrictEqual(u.leaveHalfDaysOf(halfPaid), { paid: 0.5, ceremony: 0 });
  assert.strictEqual(u.dayRestKindOf(halfPaid, true), "work", "半日有給の日は出勤日のまま");
  assert.deepStrictEqual(u.leaveHalfDaysOf({ status: "work", leaveTypes: { start: "paid", end: "ceremony" } }),
    { paid: 0.5, ceremony: 0.5 }, "午前有給・午後慶弔も数えられる");
  // y は終日でも文字を出さない（斜線のまま）。文字が出るのは leaveType が明示的に入った日だけ
  assert.strictEqual(u.leaveCellTextOf({ status: "work", adminRest: { start: true, end: true } }), "");
  assert.strictEqual(u.leaveCellTextOf({ status: "work", adminRest: { start: true } }), "");
  // 数え方（週の休み）のほうは終日 y も公休のまま
  assert.strictEqual(u.leaveTypeOf({ status: "work", adminRest: { start: true, end: true } }), "public");
  assert.strictEqual(u.leaveCellTextOf({ status: "work", start: "09:00", end: "18:00" }), "");
});

test("判断8 leaveTypeOf: 導入前の終日 y（leaveType なし）は公休として扱う", () => {
  assert.strictEqual(u.leaveTypeOf({ status: "work", adminRest: { start: true, end: true } }), "public");
  assert.strictEqual(u.leaveTypeOf({ status: "holiday" }), "public", "スタッフ提出の終日休み");
  assert.strictEqual(u.leaveTypeOf({ status: "work", adminRest: { start: true } }), null, "半日の / は休み希望のまま");
  assert.strictEqual(u.leaveTypeOf({ status: "work", leaveType: "paid" }), "paid");
  assert.strictEqual(u.leaveTypeOf({ status: "work", start: "09:00", end: "18:00" }), null);
});

test("S-5 週の休み: 休n／×休なし／揃わない週も実数", () => {
  const W = k => u.weekRestStateOf(k);
  assert.strictEqual(W(["work", "work", "work", "work", "work", "rest", "rest"]).label, "休2");
  assert.strictEqual(W(["work", "work", "work", "work", "work", "work", "work"]).label, "×休なし");
  // 有給・慶弔は休みに数えない（有給の週も別に公休が1日以上要る）
  assert.strictEqual(W(["work", "work", "work", "work", "work", "work", "leave"]).label, "×休なし");
  assert.strictEqual(W(["work", "work", "work", "work", "work", "leave", "rest"]).label, "休1");
  // 揃わない日がある週も、データのある日だけで数えた実数を出す（2026-09-26 に「要確認」から変更）
  const p = W(["work", "work", "nodata", "rest", "rest", "rest", "rest"]);
  assert.strictEqual(p.label, "＋休4");
  assert.strictEqual(p.key, "partial");
  assert.strictEqual(p.count, 4);
  assert.strictEqual(p.missing, 1);
  // **揃わない週を ×休なし にしてはいけない**——総括が key==="none" を週1休の違反として
  // 要修正に直結させるので、3日出勤・4日不明の週が誤って要修正になる
  const p0 = W(["work", "work", "work", "nodata", "nodata", "nodata", "nodata"]);
  assert.strictEqual(p0.key, "partial");
  assert.strictEqual(p0.label, "＋休0");
  assert.strictEqual(u.overallVerdictOf({ laborSystem: "A", findings: [], guideKey: "none",
    weekNoRest: p0.key === "none" }).label, "OK", "揃わない週は要修正にしない");
  // 7日揃って休み0 のときだけ ×休なし＝要修正になる
  assert.strictEqual(u.overallVerdictOf({ laborSystem: "A", findings: [], guideKey: "none",
    weekNoRest: W(["work", "work", "work", "work", "work", "work", "work"]).key === "none" }).label, "要修正");
  // 全日が無記入の週も公休7日として数える（2026-09-26 ユーザー指示。以前は skip だった）
  assert.strictEqual(W(["rest", "rest", "rest", "rest", "rest", "rest", "rest"]).label, "休7");
});

test("S-5 dayRestKindOf: 無記入は休み・有給と慶弔は leave・出勤は work", () => {
  assert.strictEqual(u.dayRestKindOf(undefined, true), "rest", "無記入＝公休として数える");
  assert.strictEqual(u.dayRestKindOf(undefined, false), "nodata");
  assert.strictEqual(u.dayRestKindOf({ status: "work", leaveType: "paid" }, true), "leave");
  assert.strictEqual(u.dayRestKindOf({ status: "work", leaveType: "ceremony" }, true), "leave");
  assert.strictEqual(u.dayRestKindOf({ status: "work", adminRest: { start: true, end: true } }, true), "rest");
  assert.strictEqual(u.dayRestKindOf({ status: "work", start: "09:00", end: "18:00" }, true), "work");
  assert.strictEqual(u.dayRestKindOf({ status: "holiday" }, true), "rest");
  assert.strictEqual(u.dayRestKindOf({ status: "work", adminRest: { start: true }, end: "22:00" }, true), "work",
    "半日 y は出勤日のまま");
});

test("S-6 総括判定: 週の休みに ×休なし があれば要修正（第3弾で戻した条件）", () => {
  assert.strictEqual(u.overallVerdictOf({ laborSystem: "B", findings: [], guideKey: "none", weekNoRest: true }).label, "要修正");
  assert.strictEqual(u.overallVerdictOf({ laborSystem: "A", findings: [], guideKey: "ok", weekNoRest: true }).label, "要修正");
  assert.strictEqual(u.overallVerdictOf({ laborSystem: "A", findings: [], guideKey: "ok", weekNoRest: false }).label, "OK");
});

test("年度の区切り: 既定は4月開始、設定で暦年にできる", () => {
  assert.strictEqual(u.fiscalYearStartMonthOf({}), 4);
  assert.strictEqual(u.fiscalYearStartMonthOf({ laborSettings: { fiscalYearStartMonth: 1 } }), 1);
  assert.strictEqual(u.fiscalYearOf("2026-03-31", 4), 2025);
  assert.strictEqual(u.fiscalYearOf("2026-04-01", 4), 2026);
  assert.strictEqual(u.fiscalYearOf("2026-12-31", 1), 2026);
  assert.strictEqual(u.fiscalYearLabel(2026, 4), "2026年度");
  assert.strictEqual(u.fiscalYearLabel(2026, 1), "2026年");
});

test("年度の合計: 期間に残した laborTotals を優先し、無い期間は live で数える", () => {
  const periods = [
    { id: "p1", startDate: "2026-04-01", laborTotals: { 田中: { workMin: 9600, paid: 2 } } },
    { id: "p2", startDate: "2026-05-01" },                       // 凍結値なし→live
    { id: "p3", startDate: "2026-06-01" },                       // live も無い＝読めていない
    { id: "p4", startDate: "2026-03-01", laborTotals: { 田中: { workMin: 99999 } } }, // 前年度＝対象外
  ];
  const live = p => (p.id === "p2" ? { workMin: 600, paid: 1, publicOff: 8 } : null);
  const r = u.yearLaborSummary(periods, "田中", 2026, 4, live);
  assert.strictEqual(r.workMin, 10200);
  assert.strictEqual(r.paid, 3);
  assert.strictEqual(r.publicOff, 8);
  assert.deepStrictEqual(r.missingPeriodIds, ["p3"], "読めていない期間を明示できる");
  // 凍結値だけでも（live なしでも）年度の合計が出る＝過去参照を押さなくてよい
  const r2 = u.yearLaborSummary(periods, "田中", 2026, 4, null);
  assert.strictEqual(r2.workMin, 9600);
  assert.deepStrictEqual(r2.missingPeriodIds, ["p2", "p3"]);
});

test("yearLaborSummary: preferLive なら読めている期間は凍結値より実データを使う（2026-09-29）", () => {
  const periods = [
    { id: "p1", startDate: "2026-04-01", laborTotals: { 田中: { workMin: 9600, paid: 2 } } },
    { id: "p2", startDate: "2026-05-01", laborTotals: { 田中: { workMin: 100 } } },
    { id: "p3", startDate: "2026-06-01" },
  ];
  // p1 は読めない（凍結値を使う）・p2 は終了後に直した実データ・p3 は読めない上に凍結値も無い
  const live = p => (p.id === "p2" ? { workMin: 600, paid: 1 } : null);
  const r = u.yearLaborSummary(periods, "田中", 2026, 4, live, true);
  assert.strictEqual(r.workMin, 10200, "p2 は凍結値100ではなく実データ600");
  assert.strictEqual(r.paid, 3);
  assert.deepStrictEqual(r.missingPeriodIds, ["p3"]);
  // 既定（preferLive なし）は従来どおり凍結値が勝つ
  assert.strictEqual(u.yearLaborSummary(periods, "田中", 2026, 4, live).workMin, 9700);
});

test("有給の残数: 付与日数から年度の消化分を引く。未入力なら null", () => {
  const st = { paidLeaveGranted: { 田中: 10, 佐藤: 0 } };
  assert.strictEqual(u.paidLeaveRemaining(st, "田中", 3), 7);
  assert.strictEqual(u.paidLeaveRemaining(st, "田中", 0), 10);
  assert.strictEqual(u.paidLeaveRemaining(st, "田中", 12), -2, "使いすぎはマイナスで見せる");
  assert.strictEqual(u.paidLeaveRemaining(st, "佐藤", 1), -1, "0日付与も入力済みとして扱う");
  assert.strictEqual(u.paidLeaveRemaining(st, "鈴木", 1), null, "未入力は残数を出さない");
  assert.ok(u.STAFF_KEYED_SETTING_MAPS.includes("paidLeaveGranted"), "改名・削除の後始末に乗る");
  assert.ok(u.PERIOD_SNAPSHOT_SETTING_KEYS.includes("paidLeaveGranted"));
  ["breakMode", "breakLength"].forEach(k => assert.ok(u.PERIOD_SNAPSHOT_SETTING_KEYS.includes(k), k));
});

test("compactLaborTotal / laborTotalsEqual: 0 は持たず、同値なら書き直さない", () => {
  assert.deepStrictEqual(u.compactLaborTotal({ workMin: 600, paid: 0 }), { workMin: 600 });
  assert.strictEqual(u.compactLaborTotal({ workMin: 0, paid: 0 }), null);
  assert.ok(u.laborTotalsEqual({ 田中: { workMin: 600 } }, { 田中: { workMin: 600, paid: 0 } }));
  assert.ok(!u.laborTotalsEqual({ 田中: { workMin: 600 } }, { 田中: { workMin: 601 } }));
  assert.ok(!u.laborTotalsEqual({ 田中: { workMin: 600 } }, {}));
});

// ===== 勤務時間の下限（2026-09-26 追加要件）=====
// 2026-09-28: 下限は「目安」に改め、判定しない（under を返さない）
test("limitStateOf: 上限超過だけを over にし、目安（旧・下限）は判定しない", () => {
  assert.strictEqual(u.limitStateOf(HM(9, 0), 8, 0), "over");
  assert.strictEqual(u.limitStateOf(HM(8, 0), 8, 0), null, "ちょうどは超過でない");
  assert.strictEqual(u.limitStateOf(HM(3, 0), 8, 4), null, "目安（旧・下限）を下回っても判定しない");
  assert.strictEqual(u.limitStateOf(HM(3, 0), 8), null);
  assert.strictEqual(u.limitStateOf(0, 8, 4), null, "勤務が1分もない窓は判定しない");
  assert.strictEqual(u.limitStateOf(HM(3, 0), 0, 0), null, "どちらも未設定なら判定しない");
  // 上限が先。矛盾した設定（下限>上限）でも上限側を返して黙らない
  assert.strictEqual(u.limitStateOf(HM(20, 0), 8, 40), "over");
});

test("staffLimitOf / hasAnyStaffLimit: 未設定は0で埋まり、目安だけでは判定を走らせない", () => {
  const st = { staffTypeLimits: { employee: { name: "社員", weekly: 40, weeklyMin: 30 } } };
  const l = u.staffLimitOf(st, "employee");
  assert.strictEqual(l.weekly, 40);
  assert.strictEqual(l.weeklyMin, 30);
  assert.strictEqual(l.monthly, 0);
  assert.strictEqual(l.monthlyMin, 0);
  assert.strictEqual(l.customHoursMin, 0);
  assert.strictEqual(u.staffLimitOf({}, "parttime").weekly, 0, "属性が無くても0で返る");
  assert.ok(u.hasAnyStaffLimit(l));
  assert.ok(!u.hasAnyStaffLimit({ ...u.STAFF_LIMIT_DEFAULTS, monthlyMin: 60 }), "目安だけでは走らない（判定しないため）");
  assert.strictEqual(l.monthlyOt, 0, "1ヶ月の残業も0で埋まる");
  assert.ok(!u.hasAnyStaffLimit(u.STAFF_LIMIT_DEFAULTS));
  assert.ok(!u.hasAnyStaffLimit({ ...u.STAFF_LIMIT_DEFAULTS, customDays: 10 }), "日数だけでは走らない");
  assert.ok(!u.hasAnyStaffLimit({ ...u.STAFF_LIMIT_DEFAULTS, customDays: 10, customHoursMin: 30 }), "任意日数の目安だけでも走らない");
  assert.ok(u.hasAnyStaffLimit({ ...u.STAFF_LIMIT_DEFAULTS, customDays: 10, customHours: 30 }));
});

test("STAFF_LIMIT_WINDOWS: 上限キーと下限キーが対で揃っている", () => {
  assert.deepStrictEqual(u.STAFF_LIMIT_WINDOWS.map(w => w.key), ["daily", "weekly", "biweekly", "monthly"]);
  u.STAFF_LIMIT_WINDOWS.forEach(w => {
    assert.strictEqual(w.minKey, w.key + "Min", `${w.key} の下限キー`);
    assert.ok(w.label && w.max > 0);
    assert.strictEqual(u.STAFF_LIMIT_DEFAULTS[w.key], 0);
    assert.strictEqual(u.STAFF_LIMIT_DEFAULTS[w.minKey], 0);
  });
});

test("勤務時間の下限: 既存店舗（下限キーなし）は従来どおり上限だけで判定する（非回帰）", () => {
  const st = { staffTypeLimits: { parttime: { name: "バイト", weekly: 28 } } };
  const l = u.staffLimitOf(st, "parttime");
  assert.strictEqual(u.limitStateOf(HM(29, 0), l.weekly, l.weeklyMin), "over");
  assert.strictEqual(u.limitStateOf(HM(1, 0), l.weekly, l.weeklyMin), null, "下限が無ければ何時間でも不足にしない");
});

// ===== 36協定の年単位4項目（判断4・案b・2026-09-26 追加）=====
test("fiscalYearMonths: 年度の12ヶ月を開始月から並べる", () => {
  assert.deepStrictEqual(u.fiscalYearMonths(2026, 4).slice(0, 3), ["2026-04", "2026-05", "2026-06"]);
  assert.strictEqual(u.fiscalYearMonths(2026, 4)[11], "2027-03");
  assert.strictEqual(u.fiscalYearMonths(2026, 1)[0], "2026-01");
  assert.strictEqual(u.fiscalYearMonths(2026, 1)[11], "2026-12");
});

test("agreementYearFindings: 年360h・年720h・月45h超が年6回・複数月平均80h", () => {
  const M = hs => hs.map((h, i) => ({ ym: "m" + i, h }));
  const L = (hs, lim) => u.agreementYearFindings(M(hs), lim).map(f => f.label);
  // 協定の年間上限（既定360h）
  assert.deepStrictEqual(L([40, 40, 40, 40, 40, 40, 40, 40, 40, 40], 360), ["年360h超"], "400h");
  assert.deepStrictEqual(L([36, 36, 36, 36, 36, 36, 36, 36, 36, 36], 360), [], "360h ちょうどは超えない");
  // 絶対上限 720h（協定値を大きくしても出る）
  assert.ok(L([100, 100, 100, 100, 100, 100, 100, 30], 9999).includes("年720h超"));
  // 月45h超は年6回まで
  assert.ok(L([46, 46, 46, 46, 46, 46, 46], 9999).includes("月45h超が年7回"));
  assert.ok(!L([46, 46, 46, 46, 46, 46], 9999).some(x => /45h超/.test(x)), "6回ちょうどは出ない");
  assert.ok(!L([45, 45, 45, 45, 45, 45, 45], 9999).some(x => /45h超/.test(x)), "45h ちょうどは超えない");
  // 複数月平均80h（2〜6ヶ月の連続する窓を全通り）
  assert.ok(L([90, 90], 9999).includes("複数月平均80h超(2ヶ月)"));
  assert.ok(!L([90, 60], 9999).some(x => /複数月平均/.test(x)), "2ヶ月平均75hは超えない");
  // 平均が同じなら短い窓が報告される（2〜6ヶ月のうち平均がいちばん高い窓を1つだけ出す）
  assert.ok(L([0, 0, 100, 100, 100, 0], 9999).includes("複数月平均80h超(2ヶ月)"));
  assert.ok(L([0, 0, 90, 100, 90, 0], 9999).includes("複数月平均80h超(2ヶ月)"), "最大平均は 90/100 の2ヶ月");
  assert.deepStrictEqual(L([10, 10, 10], 360), [], "どれにも当たらなければ空");
  assert.deepStrictEqual(L([], 360), [], "月が1つも無ければ何も出さない");
});

test("yearOvertimeMonths: 月の値は「その月の最後の期間」からだけ取る（半月で2重に数えない）", () => {
  const periods = [
    // 4月は前半・後半の2期間。値は**後半にだけ**載っている
    { id: "a1", startDate: "2026-04-01", endDate: "2026-04-15", laborTotals: { 田中: { monthOtH: 99 } } },
    { id: "a2", startDate: "2026-04-16", endDate: "2026-04-30", laborTotals: { 田中: { monthOtH: 12 } } },
    { id: "b1", startDate: "2026-05-01", endDate: "2026-05-31" }, // 凍結値なし→live
    { id: "c1", startDate: "2026-06-01", endDate: "2026-06-30" }, // live も無い＝読めていない
  ];
  const live = ym => (ym === "2026-05" ? 7 : null);
  const r = u.yearOvertimeMonths(periods, "田中", 2026, 4, live);
  assert.strictEqual(r.list[0].h, 12, "4月は後半の値だけを使う（99 は無視）");
  assert.strictEqual(r.list[1].h, 7, "5月は live");
  assert.strictEqual(r.list[2].h, 0, "6月は読めない＝0 で置く");
  assert.deepStrictEqual(r.missingMonths, ["2026-06"]);
  // シフトを組んである月まででいったん打ち切る（未作成の月を0として平均に混ぜない）
  assert.strictEqual(r.scoped.length, 3);
  assert.strictEqual(u.excelRound(r.scoped.reduce((a, v) => a + v.h, 0), 2), 19);
  // 期間が1つも無い年度は空
  assert.strictEqual(u.yearOvertimeMonths([], "田中", 2026, 4, null).scoped.length, 0);
});

test("compactLaborTotal / laborTotalsEqual: 月の残業予定も持ち回る", () => {
  assert.deepStrictEqual(u.compactLaborTotal({ workMin: 600, monthOtH: 5.366 }), { workMin: 600, monthOtH: 5.37 });
  assert.strictEqual(u.compactLaborTotal({ workMin: 0, monthOtH: 0 }), null);
  assert.ok(!u.laborTotalsEqual({ 田中: { monthOtH: 5.37 } }, { 田中: { monthOtH: 5.38 } }));
  assert.ok(u.laborTotalsEqual({ 田中: { monthOtH: 5.37 } }, { 田中: { monthOtH: 5.37, paid: 0 } }));
});

test("AGREEMENT_LEGAL_ITEMS: 7項目すべてを判定するようになった（判断4・案b）", () => {
  assert.strictEqual(u.AGREEMENT_LEGAL_ITEMS.length, 7);
  assert.ok(u.AGREEMENT_LEGAL_ITEMS.every(i => i.judged), "未判定の項目は残っていない");
  assert.strictEqual(u.AGREEMENT_ANNUAL_CAP_H, 720);
  assert.strictEqual(u.AGREEMENT_AVG_CAP_H, 80);
  assert.strictEqual(u.AGREEMENT_OVER45_COUNT_LIMIT, 6);
  assert.strictEqual(u.laborSettingsOf({}).agreementAnnualOtMin, 21600, "既定は年360h");
});

// ===== 休暇の見せ方（2026-09-26 ユーザー指示・色と斜線をやめて文字にする）=====
test("休暇コマンド: ko=公休・yu=有給・ke=慶弔 の3つが終日の休暇種別を付ける", () => {
  assert.strictEqual(u.restCommandOf("ko").leaveType, "public");
  assert.strictEqual(u.restCommandOf("yu").leaveType, "paid");
  assert.strictEqual(u.restCommandOf("ke").leaveType, "ceremony");
  assert.strictEqual(u.extractNote("ko").leaveType, "public");
  assert.ok(u.isReservedShopAbbr("ko"), "店舗略称として登録できない");
  // 1文字のサフィックス（k=キッチン入り）は食われない
  assert.strictEqual(u.restCommandOf("k"), null);
  assert.strictEqual(u.extractNote("9k").note, "k");
  // レジストリに3つとも載っている（レジェンドが自動生成される）
  ["ko", "yu", "ke"].forEach(k =>
    assert.ok(u.CELL_COMMANDS.some(c => c.kind === "rest" && c.key === k), `CELL_COMMANDS ${k}`));
});

test("leaveCellTextOf: セルに出す文字（色も斜線も使わない）", () => {
  assert.strictEqual(u.leaveCellTextOf({ status: "work", leaveType: "public" }), "公休");
  assert.strictEqual(u.leaveCellTextOf({ status: "work", leaveType: "paid" }), "有給", "旧い日単位の形も読む");
  assert.strictEqual(u.leaveCellTextOf({ status: "work", leaveTypes: { start: "paid", end: "paid" } }), "有給");
  // **有給は半日単位。打ち込んだ帯にだけ文字が出る**（2026-09-26 ユーザー指示）
  const halfPaid = { status: "work", adminRest: { start: true }, leaveTypes: { start: "paid" }, end: "22:00" };
  assert.strictEqual(u.leaveCellTextOf(halfPaid, "start"), "有給");
  assert.strictEqual(u.leaveCellTextOf(halfPaid, "end"), "");
  assert.deepStrictEqual(u.leaveHalfDaysOf(halfPaid), { paid: 0.5, ceremony: 0 });
  assert.strictEqual(u.dayRestKindOf(halfPaid, true), "work", "半日有給の日は出勤日のまま");
  assert.deepStrictEqual(u.leaveHalfDaysOf({ status: "work", leaveTypes: { start: "paid", end: "ceremony" } }),
    { paid: 0.5, ceremony: 0.5 }, "午前有給・午後慶弔も数えられる");
  // y は終日でも文字を出さない（2026-09-26 ユーザー指示・斜線のまま）
  assert.strictEqual(u.leaveCellTextOf({ status: "work", adminRest: { start: true, end: true } }), "");
  assert.strictEqual(u.leaveCellTextOf({ status: "work", adminRest: { end: true } }), "");
  assert.strictEqual(u.leaveCellTextOf({ status: "holiday" }), "", "スタッフ提出の休みも文字なし");
  assert.strictEqual(u.leaveCellTextOf(null), "");
  // 色のレジェンドは持たない
  ["leavePublic", "leavePaid", "leaveCeremony"].forEach(k =>
    assert.ok(!u.CELL_COLOR_LEGEND.some(c => c.key === k), `legend ${k} は持たない`));
});

test("leaveShownTextOf と PDF・全員の表のセル: ko は上下とも・yu/ke は打ち込んだ帯だけ種別名・斜線なし。/ と提出の休みは斜線（2026-10-04 PDF・Excel も種別名）", () => {
  const ko = { status: "work", start: "10:00", end: "15:00", adminRest: { start: true, end: true }, leaveTypes: { start: "public", end: "public" } };
  const yuAm = { status: "work", end: "22:00", adminRest: { start: true }, leaveTypes: { start: "paid" } };
  const kePm = { status: "work", start: "11:00", adminRest: { end: true }, leaveTypes: { end: "ceremony" } };
  const slash = { status: "work", start: "10:00", end: "15:00", adminRest: { start: true, end: true } };
  const subHol = { status: "holiday" };
  const yuOnHol = { status: "holiday", adminRest: { start: true }, leaveTypes: { start: "paid" } };
  const T = (sh, f) => u.leaveShownTextOf(sh, f);
  assert.deepStrictEqual([T(ko, "start"), T(ko, "end")], ["公休", "公休"]);
  assert.deepStrictEqual([T(yuAm, "start"), T(yuAm, "end")], ["有給", ""]);
  assert.deepStrictEqual([T(kePm, "start"), T(kePm, "end")], ["", "慶弔"]);
  assert.deepStrictEqual([T(slash, "start"), T(subHol, "start"), T(null, "start")], ["", "", ""]);
  assert.strictEqual(T({ status: "work", leaveTypes: { start: "paid" } }, "start"), "", "休み扱い（adminRest）でない帯には出さない（画面と同じ）");
  const cell = (sh, f, helper) => {
    const r = u.shiftSheetStoredText(sh, f, false), o = u.shiftSheetStoredText(sh, f === "start" ? "end" : "start", false);
    return u.shiftSheetCellOf({ sh, field: f, hasSub: !!sh, helper: helper || null, r, otherDisp: o.disp });
  };
  const k = (sh, f) => { const c = cell(sh, f); return c.kind + (c.text ? ":" + c.text : ""); };
  assert.deepStrictEqual([k(ko, "start"), k(ko, "end")], ["leave:公休", "leave:公休"]);
  assert.deepStrictEqual([k(yuAm, "start"), k(yuAm, "end")], ["leave:有給", "text:22"], "半日の有給: もう片側は勤務の時刻");
  assert.deepStrictEqual([k(kePm, "start"), k(kePm, "end")], ["text:11", "leave:慶弔"]);
  assert.deepStrictEqual([k(slash, "start"), k(subHol, "start"), k(subHol, "end")], ["hatch", "hatch", "hatch"], "種別の無い休み希望・提出の休みは斜線のまま");
  assert.deepStrictEqual([k(yuOnHol, "start"), k(yuOnHol, "end")], ["leave:有給", "hatch"], "提出の休みの日の片側休暇: もう片側は斜線（画面の cellDash と同じ）");
  assert.strictEqual(cell(ko, "start").fontPx, 12, "全角2文字は 30px の列に 12px で収まる");
  assert.strictEqual(cell({ ...ko, changed: true }, "start").green, true, "変更マークの緑は残す");
  // PDF の HTML: 種別名のセルは斜線の背景を持たない
  const html = u.shiftTableHtmlOf({ cols: ["田中"], dates: ["2026-10-01"], periodLabel: "10月", shopName: "店", staffNums: {}, staffColors: {}, settings: {},
    cellOf: (nm, ds, f) => cell(ko, f), tags: true });
  const tds = [...html.matchAll(/<td data-sheet-cell="leave" style="([^"]*)">([^<]*)<\/td>/g)];
  assert.deepStrictEqual(tds.map(t => t[2]), ["公休", "公休"]);
  assert.ok(tds.every(t => !/svg/.test(t[1]) && /font-size:12px/.test(t[1])));
  // 4か所（画面・PDF と全員の表・Excel）が同じ関数を通る（ドリフト検出）
  const fs = require("node:fs"), path = require("node:path"), R = f => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
  const sh = R("app-shift.js");
  assert.ok(/const leaveCellText=\(name,date,field\)=>leaveShownTextOf\(/.test(sh), "画面の leaveCellText は leaveShownTextOf");
  const ad = R("app-admin.js");
  const xl = ad.slice(ad.indexOf("const storedRv="), ad.indexOf("// ファイル名・ダウンロード"));
  assert.ok(/leaveShownTextOf\(sh,"start"\)/.test(xl) && /leaveShownTextOf\(sh,"end"\)/.test(xl), "expXl は leaveShownTextOf");
  assert.ok(/const lvOn=!!resolver&&!isSpacer\(nm\);/.test(xl), "expXl の種別名はシフト作成タブ（resolver あり）だけ。期間管理タブは提出したまま（ユーザー決定）");
  const ut = R("app-utils.js");
  const sc = ut.slice(ut.indexOf("function shiftSheetCellOf("), ut.indexOf("function shiftTableHtmlOf("));
  assert.ok(/leaveShownTextOf\(sh,f\)/.test(sc), "shiftSheetCellOf は leaveShownTextOf");
});
test("斜線（y・提出の休み）も公休として数える — 見せ方と数え方を分けたあとの非回帰", () => {
  // 2026-09-26: y は**セルに文字を出さない**（斜線のまま）が、**数え方は公休のまま**。
  // 見せ方（leaveCellTextOf）と数え方（leaveTypeOf / dayRestKindOf）を別の関数で答える。
  const cases = [
    ["終日 y（管理者）", { status: "work", adminRest: { start: true, end: true } }],
    ["提出の休み", { status: "holiday" }],
    ["ko（明示の公休）", { status: "work", leaveType: "public", adminRest: { start: true, end: true } }],
  ];
  cases.forEach(([label, sh]) => {
    assert.strictEqual(u.leaveTypeOf(sh), "public", `${label}: 公休として扱う`);
    assert.strictEqual(u.dayRestKindOf(sh, true), "rest", `${label}: 週の休みに数える`);
  });
  // 文字が出るのは ko（明示）だけ
  assert.strictEqual(u.leaveCellTextOf(cases[0][1]), "");
  assert.strictEqual(u.leaveCellTextOf(cases[1][1]), "");
  assert.strictEqual(u.leaveCellTextOf(cases[2][1]), "公休");
  // 無記入も公休として週の休みに数える（判断8）
  assert.strictEqual(u.dayRestKindOf(undefined, true), "rest");
  // 有給・慶弔は休みに数えない（出勤日に取る休暇のため）
  assert.strictEqual(u.dayRestKindOf({ status: "work", leaveType: "paid" }, true), "leave");
  assert.strictEqual(u.dayRestKindOf({ status: "work", leaveType: "ceremony" }, true), "leave");
});

// === 労務の要修正をセル色で示すための「日ごとの判定」（2026-09-26 ユーザー指示） ===
// laborDayFindingsFor は laborFindingsFor と**同じ規則**で日を選ぶ。件数が食い違うと
// 「パネルには n日と出ているのに塗られているセルは m個」という形で静かに嘘になるので、
// ここで日ごとの件数と集計の件数を突き合わせる。
test("laborDayFindingsFor: 日ごとの該当数が laborFindingsFor の件数と一致する", () => {
  const cases = [
    { laborSystem: "A", dayMins: [800, 200, 480, 0, 900], dayOtH: [0, 0, 4, 0, 1],
      agreementDailyOtH: 3, breakShortDays: [false, false, true, false, false] },
    { laborSystem: "B", dayMins: [700, 480, 660, 0], dayOtH: [], agreementDailyOtH: 2,
      breakShortDays: [true, false, false, false] },
    { laborSystem: "A", dayMins: [480, 480], dayOtH: [0, 0], agreementDailyOtH: 0,
      breakShortDays: [false, false] },
    { laborSystem: "none", dayMins: [900, 100], dayOtH: [0, 0], agreementDailyOtH: 3,
      breakShortDays: [true, true] },
  ];
  const countOf = (labels, re) => {
    const hit = labels.find(l => re.test(l));
    if (!hit) return 0;
    // 該当日を出す形（`…2日（3・5）`）でも件数が読めるように、「n日」の直後で切る
    const m = hit.match(/(\d+)日(?:\(残業\))?(?:（|$)/);
    return m ? Number(m[1]) : 1;
  };
  for (const c of cases) {
    const days = u.laborDayFindingsFor(c);
    assert.strictEqual(days.length, c.dayMins.length, "日数ぶん返る");
    // 集計側は件数で受ける（日ごとの配列を件数に畳んで同じ入力にする）
    const labels = u.laborFindingLabels({ ...c, monthReady: true,
      breakShortCount: c.breakShortDays.filter(Boolean).length });
    const per = k => days.filter(ks => ks.includes(k)).length;
    assert.strictEqual(per("over12"), countOf(labels, /^12h超/), "12h超");
    // **1日の残業の上限超は塗らない**（2026-10-08 ユーザー指示。A制の残業予定・B制の実残業とも）。パネルには従来どおり出る
    assert.strictEqual(per("dayOtOverAgreement"), 0, "A制の1日の残業予定が上限超は塗らない");
    assert.strictEqual(per("dayOverAgreementB"), 0, "B制の1日の残業が上限超は塗らない");
    // **塗らないと決めたもの**は日ごとの一覧に出ない（パネルには出る・2026-09-26 ユーザー指定）
    assert.strictEqual(per("under4"), 0, "4h未満は塗らない");
    assert.strictEqual(per("breakShort"), 0, "休憩不足は塗らない");
    assert.ok(countOf(labels, /^4h未満/) + countOf(labels, /^休憩不足/) >= 0, "パネル側の件数は数えられる");
    // 返すキーは LABOR_DAY_FIX_KEYS だけ（8h超・週40h超のような「残業あり」は塗らない）
    days.forEach(ks => ks.forEach(k => {
      assert.ok(u.LABOR_DAY_FIX_KEYS.includes(k), `${k} は LABOR_DAY_FIX_KEYS にある`);
    }));
  }
  // 外した2つはパネルには出る（入力の1件目・2件目で実際に該当していることを確かめ、上の 0 が素通りでないことを示す）
  assert.ok(countOf(u.laborFindingLabels({ ...cases[0], monthReady: true }), /^1日の残業予定が上限超/) > 0, "A制の1日残業はパネルに出る");
  assert.ok(countOf(u.laborFindingLabels({ ...cases[1], monthReady: true }), /^1日の残業が上限超/) > 0, "B制の1日残業はパネルに出る");
  // B制の「1日の残業が上限超」の日は必ず「8h超(残業)」の日でもある（8h＋協定の上限を超えた日）＝外したのはユーザーの言う「8h超(残業)」の紫
  const bLabels = u.laborFindingLabels({ ...cases[1], monthReady: true });
  assert.ok(countOf(bLabels, /^8h超/) >= countOf(bLabels, /^1日の残業が上限超/), "B制の1日残業の上限超の日は8h超の日に含まれる");
  // パネルには出るが色は付かない、という非対称そのものを固定する
  const panelOnly = { laborSystem: "A", dayMins: [120, 600], dayOtH: [0, 0], agreementDailyOtH: 0,
    breakShortDays: [false, true] };
  assert.deepStrictEqual(u.laborDayFindingsFor(panelOnly), [[], []], "4h未満と休憩不足の日は塗らない");
  const panelLabels = u.laborFindingLabels({ ...panelOnly, monthReady: true, breakShortCount: 1 });
  assert.ok(panelLabels.some(l => l.startsWith("4h未満")), "4h未満はパネルに出る");
  assert.ok(panelLabels.some(l => l.startsWith("休憩不足")), "休憩不足はパネルに出る");
});

test("LABOR_DAY_FIX_KEYS: 全キーに title 用のラベルがあり、セル色が登録されている", () => {
  u.LABOR_DAY_FIX_KEYS.forEach(k =>
    assert.ok(u.LABOR_DAY_ERR_LABELS[k], `${k} のラベルが無い`));
  const legend = u.CELL_COLOR_LEGEND.find(c => c.key === "laborErr");
  assert.ok(legend && legend.color, "laborErr の色が CELL_COLOR_LEGEND に登録されている");
  // 操作方法レジェンドの説明が新しい基準（2026-10-08）を書いている
  for (const w of ["12時間", "法定休日", "60時間", "特定技能", "属性"]) assert.ok(legend.desc.includes(w), `説明に「${w}」が無い`);
  assert.ok(/1日の残業の上限超/.test(legend.desc) && /色を付けず/.test(legend.desc), "1日の残業の上限超は塗らないと書いてある");
});

// === セルの紫の基準（2026-10-08 ユーザー指示）===
// 塗る: 12h超・法定休日労働・月60h超・特定技能の週の公休不足の週の出勤日・属性の上限超。塗らない: 1日の残業の上限超（A・B）
function _premDaysOf(ym, minOf) {
  return u.premiumMonthDates(ym, 1).map(d => ({ date: d, workMin: minOf(d), scheduledMin: 0, nightMin: 0, rest: minOf(d) > 0 ? false : true }));
}
test("紫: 法定休日労働の日が塗られ、件数がパネル（premiumFindingsFor）と一致する", () => {
  // 毎日12h・休みなし（B制）。各週の最後の勤務日（日曜）が法定休日労働
  const b = u.premiumBreakdownOf({ system: "B", days: _premDaysOf("2026-09", () => 720), ym: "2026-09", weekStartDow: 1 });
  assert.ok(b.legalHolidayDates.length >= 4, "法定休日労働がある＝素通りしない");
  const dates = u.gd("2026-09-14", "2026-09-27");
  const day = u.laborDayFindingsFor({ laborSystem: "B", dayMins: dates.map(() => 720), dayDates: dates,
    legalHolidayDates: b.legalHolidayDates });
  const painted = dates.filter((d, i) => day[i].includes("legalHoliday"));
  assert.deepStrictEqual(painted, ["2026-09-20", "2026-09-27"]);
  const f = u.premiumFindingsFor(b, { system: "B", dates }).find(x => x.key === "p5LegalHoliday");
  assert.ok(f && f.label.startsWith(`法定休日労働${painted.length}日`), "パネルの件数と一致");
  // B制の12h勤務でも「1日の残業が上限超」は塗らない（パネルには出る）
  assert.ok(!day.some(ks => ks.includes("dayOverAgreementB")));
  assert.ok(u.laborFindingLabels({ laborSystem: "B", dayMins: dates.map(() => 720), agreementDailyOtH: 2, monthReady: true })
    .some(l => l.startsWith("1日の残業が上限超")), "パネルには出る");
  // 日付を渡さない呼び出し（従来の形）では法定休日は塗られない＝12h超（A制）だけ
  assert.deepStrictEqual(u.laborDayFindingsFor({ laborSystem: "A", dayMins: [800, 480] }), [["over12"], []]);
});
test("紫: over60DatesOf は時間外を日付の順に積み、60h を超えた日とそれ以降に時間外がある日を返す（超過の合計は over60Min）", () => {
  const b = u.premiumBreakdownOf({ system: "B", days: _premDaysOf("2026-09", () => 720), ym: "2026-09", weekStartDow: 1 });
  assert.ok(b.over60Min > 0, "60h超がある＝素通りしない");
  const ds = u.over60DatesOf(b);
  let cum = 0, sum = 0; const exp = [];
  Object.keys(b.perDay).sort().forEach(d => { const before = cum; cum += b.perDay[d]; const inc = Math.max(0, cum - 3600) - Math.max(0, before - 3600); if (inc > 0) { exp.push(d); sum += inc; } });
  assert.deepStrictEqual(ds, exp);
  assert.strictEqual(sum, b.over60Min, "超過分の合計が over60Min と一致");
  // 60h に届く前の日は返さない・届いた後も時間外の無い日は返さない
  const firstIdx = Object.keys(b.perDay).sort().indexOf(ds[0]);
  let pre = 0; Object.keys(b.perDay).sort().slice(0, firstIdx).forEach(d => { pre += b.perDay[d]; });
  assert.ok(pre <= 3600, "最初の日の前までは60h以下");
  assert.ok(ds.every(d => b.perDay[d] > 0));
  // 時間外が60h以下の月は空
  assert.deepStrictEqual(u.over60DatesOf(u.premiumBreakdownOf({ system: "B", days: _premDaysOf("2026-09", () => 540), ym: "2026-09", weekStartDow: 1 })), []);
  assert.deepStrictEqual(u.over60DatesOf(null), []);
  const dates = u.gd("2026-09-01", "2026-09-30");
  const day = u.laborDayFindingsFor({ laborSystem: "B", dayMins: dates.map(() => 720), dayDates: dates, over60Dates: ds });
  assert.deepStrictEqual(dates.filter((d, i) => day[i].includes("over60")), ds.filter(d => d.startsWith("2026-09")));
});
test("紫: skilledShortWorkDates は不足した週の出勤日（月をまたぐ週は足りなかった月の側だけ）", () => {
  const cross = u.gd("2026-09-28", "2026-10-04");
  const kinds = ["work", "work", "work", "work", "rest", "work", "work"];
  const st = u.skilledWeekRestStateOf(kinds, cross);
  assert.strictEqual(st.key, "skilledNone");
  assert.deepStrictEqual(u.skilledShortWorkDates(st, cross, kinds), ["2026-09-28", "2026-09-29", "2026-09-30"], "9月側だけ");
  const flat = u.gd("2026-09-14", "2026-09-20");
  const k2 = ["work", "work", "leave", "work", "work", "work", "work"];
  const st2 = u.skilledWeekRestStateOf(k2, flat);
  assert.strictEqual(st2.key, "none");
  assert.deepStrictEqual(u.skilledShortWorkDates(st2, flat, k2), flat.filter((d, i) => k2[i] === "work"), "有給の日は出勤日に数えない");
  const ok = u.skilledWeekRestStateOf(["work", "rest", "work", "work", "work", "work", "work"], flat);
  assert.deepStrictEqual(u.skilledShortWorkDates(ok, flat, ["work", "rest", "work", "work", "work", "work", "work"]), []);
  const day = u.laborDayFindingsFor({ laborSystem: "A", dayMins: cross.map(() => 480), dayDates: cross,
    skilledWeekRestDates: u.skilledShortWorkDates(st, cross, kinds) });
  assert.deepStrictEqual(day.map(ks => ks.includes("skilledWeekRest")), [true, true, true, false, false, false, false]);
});
test("紫: rollingLimitOverWindows は提出一覧のバッジの以前の式（全出勤日を起点からの日数で足す）と同じ判定を返す", () => {
  // 以前の SubsTab の _windowStates をそのまま写した参照実装
  const old = (startDs, allWork, minOf, days, upH) => {
    for (const sd of [...startDs].sort()) {
      const start = u.pd(sd); let tot = 0;
      for (const d2 of allWork) { if (d2 < sd) continue; const diffD = (u.pd(d2) - start) / 86400000; if (diffD >= days) break; tot += minOf(d2); }
      if (u.limitStateOf(tot, upH) === "over") return true;
    }
    return false;
  };
  let seed = 7; const rnd = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const all = u.gd("2026-08-20", "2026-10-20");
  let overs = 0;
  for (let t = 0; t < 300; t++) {
    const mins = {}; all.forEach(d => { if (rnd(3) > 0) mins[d] = 120 + rnd(9) * 60; });
    const minOf = d => mins[d] || 0;
    const allWork = all.filter(d => minOf(d) > 0);
    const startDs = u.gd("2026-09-14", "2026-09-27").filter(d => minOf(d) > 0);
    const days = [3, 7, 14, 21][rnd(4)], upH = 10 + rnd(60);
    const a = old(startDs, allWork, minOf, days, upH);
    const w = u.rollingLimitOverWindows({ startDates: startDs, minOf, days, upperHours: upH });
    assert.strictEqual(w.length > 0, a, `t=${t}`);
    if (a) overs++;
    w.forEach(x => x.dates.forEach(d => { assert.ok(minOf(d) > 0 && d >= x.start && (u.pd(d) - u.pd(x.start)) / 86400000 < days); }));
  }
  assert.ok(overs > 20 && overs < 280, `超える場合と超えない場合の両方を通る（${overs}）`);
  assert.deepStrictEqual(u.rollingLimitOverWindows({ startDates: ["2026-09-14"], minOf: () => 600, days: 14, upperHours: 0 }), [], "上限0は判定しない");
});
test("紫: attrLimitOverDatesOf は属性の上限を超えた日と窓の中の出勤日を返す（目安は判定しない）", () => {
  const dates = u.gd("2026-09-14", "2026-09-27");
  const mins = { "2026-09-14": 540, "2026-09-15": 240, "2026-09-16": 240, "2026-09-17": 240, "2026-09-21": 240, "2026-09-22": 240 };
  const minOf = d => mins[d] || 0;
  const weeks = ["2026-09-14", "2026-09-21"];
  const weekMinOf = ws => u.gd(ws, u.fd(new Date(u.pd(ws).getTime() + 6 * 86400000))).reduce((a, d) => a + minOf(d), 0);
  const base = { dates, minOf, weeks, weekMinOf, monthYm: "2026-09", monthMin: 1740 };
  const lim = o => ({ ...u.STAFF_LIMIT_DEFAULTS, ...o });
  assert.deepStrictEqual(u.attrLimitOverDatesOf({ ...base, lim: lim({ daily: 8 }) }).daily, ["2026-09-14"]);
  // 週: 14〜20 は 21h（上限20h）＝その週の出勤日4日、21〜27 は 8h で超えない
  assert.deepStrictEqual(u.attrLimitOverDatesOf({ ...base, lim: lim({ weekly: 20 }) }).weekly, ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17"]);
  // 2週間: 14 起点の14日間が 29h（上限20h）
  assert.deepStrictEqual(u.attrLimitOverDatesOf({ ...base, lim: lim({ biweekly: 20 }) }).biweekly,
    ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-21", "2026-09-22"]);
  // 任意日数（3日で10h）: 14起点 17h・15起点 12h が超え、16起点 8h・21起点 8h は超えない
  assert.deepStrictEqual(u.attrLimitOverDatesOf({ ...base, lim: lim({ customDays: 3, customHours: 10 }) }).custom,
    ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17"]);
  // 1ヶ月: 月計（monthMin）を attrMonthFrameOf の上限と比べる＝期間別勤務時間の「月計」の赤と同じ
  const lm = lim({ monthly: 20 });
  const cap = u.attrMonthFrameOf(lm, "2026-09").capMin;
  assert.ok(cap > 0 && 1740 > cap, "月計が上限を超える入力");
  assert.deepStrictEqual(u.attrLimitOverDatesOf({ ...base, lim: lm }).monthly, Object.keys(mins).sort());
  assert.deepStrictEqual(u.attrLimitOverDatesOf({ ...base, lim: lm, monthMin: cap }).monthly, [], "ちょうど上限は超えていない");
  // 上限 0（未設定）・目安だけ（*Min）は何も返さない
  const none = u.attrLimitOverDatesOf({ ...base, lim: lim({ dailyMin: 1, weeklyMin: 1, biweeklyMin: 1, monthlyMin: 1, customHoursMin: 1 }) });
  Object.values(none).forEach(v => assert.deepStrictEqual(v, []));
  // laborDayFindingsFor に渡すと窓ごとのキーで塗られる
  const all = u.attrLimitOverDatesOf({ ...base, lim: lim({ daily: 8, weekly: 20 }) });
  const day = u.laborDayFindingsFor({ laborSystem: "B", dayMins: dates.map(minOf), dayDates: dates, attrLimitDates: all });
  assert.deepStrictEqual(day[0], ["attrLimitDaily", "attrLimitWeekly"]);
  assert.deepStrictEqual(day[1], ["attrLimitWeekly"]);
  assert.deepStrictEqual(day[7], [], "21日は超えていない");
});
test("紫: シフト作成タブと提出一覧が同じ判定を通す（ドリフト検出）", () => {
  const src = _readAdminSurface();
  const lc = src.slice(src.indexOf("const laborCalc=useMemo("), src.indexOf("const laborByStaff=laborCalc.out;"));
  assert.ok(lc.length > 1000, "laborCalc を切り出せた");
  assert.ok(/laborDayFindingsFor\(\{laborSystem:sys,dayMins,dayDates:dates,/.test(lc), "日付を渡している");
  for (const s of ["legalHolidayDates:prem?prem.legalHolidayDates", "over60DatesOf(prem)", "skilledShortDatesFor(name)", "attrLimitDatesFor(name)"]) assert.ok(lc.includes(s), `${s} が無い`);
  assert.ok(!/laborDayFindingsFor\(\{[^}]*agreementDailyOtH/.test(lc), "1日の残業の上限は紫の判定に渡さない");
  // 属性の上限: 週は週間勤務時間の表と同じ getWeekMin、1ヶ月は「月計」と同じ getPeriodMin の和
  const at = src.slice(src.indexOf("const attrLimitDatesFor="), src.indexOf("const skilledShortDatesFor="));
  assert.ok(at.includes("weekMinOf:ws=>getWeekMin(ws,name)") && at.includes("getPeriodMin(p.id,name)") && at.includes("attrLimitOverDatesOf("));
  // 提出一覧のバッジの2週間・任意日数も同じ関数
  assert.ok(/const _windowStates=[^\n]*rollingLimitOverWindows\(/.test(src), "提出一覧が rollingLimitOverWindows を通していない");
});

// 労務の要修正の色は**画面だけ**の目印で、配る Excel・PDF には出さない（2026-09-26 ユーザー指示）。
// 現状そうなっているのは「書き出しが画面とは別の色付けを持っている」からで、
// 誰かが揃えようとして参照を足すと黙って配布物に出る。ここで参照が無いことを固定する。
test("Excel・PDF の書き出しは労務の要修正の色を参照しない", () => {
  const src = _readAdminSurface(); // app-admin.js＋app-shift.js＋app-company.js（2026-09-30 分割）
  // 行コメントを落とす（説明文の中の「画面（cellBgFor）」を参照と読み違えないため）
  const strip = t => t.split("\n").map(l => {
    const i = l.indexOf("//");
    if (i < 0) return l;
    const before = l.slice(0, i);
    // 文字列・正規表現の中の // は落とさない（引用符の数が偶数のときだけコメントとみなす）
    const q = (before.match(/"/g) || []).length + (before.match(/'/g) || []).length
      + (before.match(/`/g) || []).length;
    return q % 2 === 0 ? before : l;
  }).join("\n");
  const bodyFrom = (marker) => {
    const i = src.indexOf(marker);
    assert.ok(i >= 0, `${marker} が見つからない`);
    // 引数の既定値（options={}）を本体の波括弧と読み違えないよう、**引数の括弧を閉じてから**数える
    let pd = 0, sawParen = false, k = i;
    for (; k < src.length; k++) {
      const c = src[k];
      if (c === "(") { pd++; sawParen = true; }
      else if (c === ")") { pd--; if (sawParen && pd === 0) { k++; break; } }
    }
    let d = 0, started = false;
    for (let j = k; j < src.length; j++) {
      const c = src[j];
      if (c === "{") { d++; started = true; }
      else if (c === "}") { d--; if (started && d === 0) return strip(src.slice(i, j + 1)); }
    }
    assert.fail(`${marker} の本体を切り出せなかった`);
  };
  // PDF のシフト表は app-utils.js の shiftTableHtmlOf・shiftSheetCellOf で組み立てる（従業員画面の全員のシフトと共有・2026-10-04）。
  // 呼び出し側（buildShiftTableHtml）と共有の本体を合わせて検査する
  const usrc = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "app-utils.js"), "utf8");
  const uBody = name => { const i = usrc.indexOf(`function ${name}(`); assert.ok(i > 0, `${name} が無い`); const rest = usrc.slice(i + 1); const e = rest.search(/\n(function |const |\/\/ =====)/); return strip(usrc.slice(i, i + 1 + (e > 0 ? e : rest.length))); };
  const targets = [["PDF", "const buildShiftTableHtml=", ["shiftTableHtmlOf", "shiftSheetCellOf", "shiftSheetStoredText"]], ["Excel", "function expXl(", []]];
  for (const [label, marker, shared] of targets) {
    const body = bodyFrom(marker) + shared.map(uBody).join("\n");
    assert.ok(body.split("\n").length > 50, `${label}: 本体の切り出しが短すぎる（${body.split("\n").length}行）`);
    for (const ident of ["laborDayErrors", "laborErrTitle", "LEGEND_COLORS.laborErr", "laborErr"]) {
      assert.ok(!body.includes(ident), `${label} の書き出しが ${ident} を参照している`);
    }
  }
  assert.ok(bodyFrom("const buildShiftTableHtml=").includes("shiftTableHtmlOf("), "PDF のシフト表は shiftTableHtmlOf を通る");
});

// ===== 企業連携の拡張（2026-09-27）=====
test("applyCompanySettings: 企業設定が無ければ同じ参照を返す（持たない店舗は1バイトも変わらない）", () => {
  const s = { laborSettings: { fixedOvertimeMin: 1800 }, staffTypeLimits: { parttime: { weekly: 28 } } };
  assert.strictEqual(u.applyCompanySettings(s, null), s);
  assert.strictEqual(u.applyCompanySettings(s, undefined), s);
  assert.strictEqual(u.applyCompanySettings(s, {}), s);
});

test("applyCompanySettings: 企業が決めた窓だけ企業優先、店舗の他の窓は残る", () => {
  const s = { staffTypeLimits: { parttime: { weekly: 28, daily: 8 } } };
  const r = u.applyCompanySettings(s, { staffTypeLimits: { parttime: { weekly: 40 } } });
  assert.strictEqual(r.staffTypeLimits.parttime.weekly, 40);
  assert.strictEqual(r.staffTypeLimits.parttime.daily, 8);
  assert.strictEqual(s.staffTypeLimits.parttime.weekly, 28, "元の settings を書き換えない");
});

test("applyCompanySettings: 労務設定の 0 は企業の決定、上限・下限の 0 は未設定", () => {
  const s = { laborSettings: { agreementDailyOtMin: 180 }, staffTypeLimits: { parttime: { weekly: 28 } } };
  const r = u.applyCompanySettings(s, { laborSettings: { agreementDailyOtMin: 0 }, staffTypeLimits: { parttime: { weekly: 0 } } });
  assert.strictEqual(r.laborSettings.agreementDailyOtMin, 0);
  assert.strictEqual(r.staffTypeLimits.parttime.weekly, 28);
});

test("applyCompanySettings: 企業属性は店舗に無くても現れ、属性の選択肢に出る。店舗の custom_ は企業が決められない", () => {
  const r = u.applyCompanySettings({ staffTypeLimits: { custom_x: { name: "店独自", weekly: 10 } } },
    { staffTypeLimits: { co_AbCd1234: { name: "契約社員", laborSystem: "A", weekly: 40 }, custom_x: { weekly: 99 } } });
  assert.deepStrictEqual(r.staffTypeLimits.co_AbCd1234, { name: "契約社員", laborSystem: "A", weekly: 40 });
  assert.strictEqual(r.staffTypeLimits.custom_x.weekly, 10);
  assert.ok(u.getAttrOptions(r).some(([id, nm]) => id === "co_AbCd1234" && nm === "契約社員"));
});

test("applyCompanySettings: 企業が消した属性への割当は未設定扱い。ミラー未着（null）では落とさない", () => {
  const s = { staffAttributes: { "田中": "co_AbCd1234", "佐藤": "employee" } };
  const r = u.applyCompanySettings(s, { staffTypeLimits: { co_ZZZZ9999: { name: "別" } } });
  assert.deepStrictEqual(r.staffAttributes, { "佐藤": "employee" });
  assert.strictEqual(u.laborSystemForStaff(r, "田中"), "B", "未設定＝parttime 既定に倒れ、区分が空欄にならない");
  assert.strictEqual(u.applyCompanySettings(s, null), s);
  assert.deepStrictEqual(u.applyCompanySettings(s, {}).staffAttributes, { "佐藤": "employee" }, "企業が属性を1つも持たないときも落とす");
});

test("stripCompanySettings: strip(apply(raw)) と strip(raw) が一致する（往復で企業値が漏れない）", () => {
  const raw = { laborSettings: { fixedOvertimeMin: 1800, marginMin: 420 },
    staffTypeLimits: { parttime: { weekly: 28, daily: 8 }, employee: { monthly: 200 }, custom_x: { name: "店", weekly: 10 } },
    staffAttributes: { "田中": "co_AbCd1234" } };
  const cs = { laborSettings: { fixedOvertimeMin: 1200 },
    staffTypeLimits: { parttime: { weekly: 40, laborSystem: "B" }, co_AbCd1234: { name: "契約", weekly: 30 } } };
  assert.deepStrictEqual(u.stripCompanySettings(u.applyCompanySettings(raw, cs), cs), u.stripCompanySettings(raw, cs));
  const st = u.stripCompanySettings(raw, cs);
  assert.ok(!("fixedOvertimeMin" in st.laborSettings));
  assert.strictEqual(st.laborSettings.marginMin, 420);
  assert.deepStrictEqual(st.staffTypeLimits.parttime, { daily: 8 });
  assert.ok(!("co_AbCd1234" in st.staffTypeLimits));
  assert.strictEqual(st.staffAttributes["田中"], "co_AbCd1234", "割当そのものは店舗の値なので残す");
});

test("stripCompanySettings: 値の一致ではなくキーの支配で落とす／企業設定が無ければ同じ参照", () => {
  const raw = { staffTypeLimits: { parttime: { weekly: 40 } } };
  assert.deepStrictEqual(u.stripCompanySettings(raw, { staffTypeLimits: { parttime: { weekly: 40 } } }).staffTypeLimits.parttime, {});
  assert.strictEqual(u.stripCompanySettings(raw, null), raw);
});

test("companyControlledKeys: 企業が決めた項目だけを返す", () => {
  const k = u.companyControlledKeys({ laborSettings: { marginMin: 0, x: 1 }, staffTypeLimits: { parttime: { weekly: 40, daily: 0 }, co_AbCd1234: { name: "契約" } } });
  assert.deepStrictEqual([...k.labor], ["marginMin"]);
  assert.deepStrictEqual([...k.limits.parttime], ["weekly"]);
  assert.deepStrictEqual([...k.attrs], ["co_AbCd1234"]);
});

test("genCompanyAttrId: 1,000件すべてが COMPANY_ATTR_ID_RE に一致する（genSecureId の記号を含まない）", () => {
  for (let i = 0; i < 1000; i++) {
    const id = u.genCompanyAttrId();
    assert.ok(u.COMPANY_ATTR_ID_RE.test(id), id);
  }
  assert.ok(!u.isCompanyAttrId("co_ab!d1234"));
  assert.ok(!u.isCompanyAttrId("custom_abc"));
});

test("periodRangeLabel: 前半・後半・1か月・それ以外", () => {
  assert.strictEqual(u.periodRangeLabel("2026-10-01", "2026-10-15"), "2026年10月前半");
  assert.strictEqual(u.periodRangeLabel("2026-10-16", "2026-10-31"), "2026年10月後半");
  assert.strictEqual(u.periodRangeLabel("2026-02-15", "2026-02-28"), "2026年2月後半");
  assert.strictEqual(u.periodRangeLabel("2026-10-01", "2026-10-31"), "2026年10月");
  assert.strictEqual(u.periodRangeLabel("2026-10-05", "2026-10-18"), "2026/10/5〜10/18");
});

test("collectPeriodRanges: 同じ範囲を1件に畳み、店舗を集約し、新しい順に並べる", () => {
  const r = u.collectPeriodRanges({
    A: [{ startDate: "2026-10-01", endDate: "2026-10-15" }, { startDate: "2026-09-16", endDate: "2026-09-30" }],
    B: [{ startDate: "2026-10-01", endDate: "2026-10-15" }],
  });
  assert.deepStrictEqual(r.map(x => [x.key, x.shopIds]), [["2026-10-01_2026-10-15", ["A", "B"]], ["2026-09-16_2026-09-30", ["A"]]]);
  assert.strictEqual(r[0].label, "2026年10月前半");
  assert.strictEqual(u.findShopPeriodByRange([{ id: "p1", startDate: "2026-10-01", endDate: "2026-10-15" }], "2026-10-01_2026-10-15").id, "p1");
});

test("companyDeadlineFor / shopDeadlineFromLink: 店舗別の日付が全店共通より優先、不正な日付は無視", () => {
  const dl = { "2026-10-01_2026-10-15": { all: "2026-09-25", shops: { B: "2026-09-27", C: "2026-02-30" } } };
  assert.strictEqual(u.companyDeadlineFor(dl, "2026-10-01_2026-10-15", "A"), "2026-09-25");
  assert.strictEqual(u.companyDeadlineFor(dl, "2026-10-01_2026-10-15", "B"), "2026-09-27");
  assert.strictEqual(u.companyDeadlineFor(dl, "2026-10-01_2026-10-15", "C"), "2026-09-25", "存在しない日付は全店共通へ");
  assert.strictEqual(u.companyDeadlineFor(dl, "2026-11-01_2026-11-15", "A"), null);
  const link = { deadlines: { "2026-10-01_2026-10-15": "2026-09-25" } };
  assert.strictEqual(u.shopDeadlineFromLink(link, { startDate: "2026-10-01", endDate: "2026-10-15" }), "2026-09-25");
  assert.strictEqual(u.shopDeadlineFromLink(null, { startDate: "2026-10-01", endDate: "2026-10-15" }), null);
});

test("dupTargetShopsFor: 所属が一致する同名だけを同一人物とみなす（双方向）", () => {
  const A = { staffSet: new Set(["田中"]), homeShop: null };
  const Bstaff = { staffSet: new Set(["田中"]), homeShop: { "田中": "A" } };
  // B店から見る: 田中の所属はA店、A店の田中は自店所属＝一致
  assert.deepStrictEqual(u.dupTargetShopsFor({ name: "田中", shopId: "B", settings: { staffHomeShop: { "田中": "A" } }, otherShops: { A } }), ["A"]);
  // A店から見る: B店の田中は所属A店＝一致
  assert.deepStrictEqual(u.dupTargetShopsFor({ name: "田中", shopId: "A", settings: {}, otherShops: { B: Bstaff } }), ["B"]);
  // 両店とも自店所属の同名は別人
  assert.deepStrictEqual(u.dupTargetShopsFor({ name: "田中", shopId: "A", settings: {}, otherShops: { B: { staffSet: new Set(["田中"]), homeShop: null } } }), []);
  // 名簿に無い店舗は返さない
  assert.deepStrictEqual(u.dupTargetShopsFor({ name: "田中", shopId: "B", settings: { staffHomeShop: { "田中": "A" } }, otherShops: { A: { staffSet: new Set(["佐藤"]) } } }), []);
});

test("dupTargetShopsFor: 旧 staffWorkplaces だけを持つ店舗では従来どおりの対象が返る", () => {
  assert.deepStrictEqual(u.dupTargetShopsFor({ name: "田中", shopId: "A", settings: { staffWorkplaces: { "田中": { B: true, A: true } } }, otherShops: {} }), ["B"]);
});

test("staffHomeShop: 2つの一覧に登録され、改名でキーが移る", () => {
  assert.ok(u.STAFF_KEYED_SETTING_MAPS.includes("staffHomeShop"));
  assert.ok(u.PERIOD_SNAPSHOT_SETTING_KEYS.includes("staffHomeShop"));
  const s = u.renameStaffInSettings({ staffHomeShop: { "田中": "A" } }, "田中", "田中 太郎");
  assert.deepStrictEqual(s.staffHomeShop, { "田中 太郎": "A" });
  assert.strictEqual(u.isHelperAt({ staffHomeShop: { "田中": "A" } }, "田中", "B"), true);
  assert.strictEqual(u.isHelperAt({}, "田中", "B"), false);
});

// ===== 企業の共通設定・提出期限（Cloud Functions 側の検証。functions/company-config.js）=====
const cfc = require("../functions/company-config.js");
test("company-config: CF 側のキー一覧・属性ID・労働時間制がクライアントと一致する（書き写しのドリフト検出）", () => {
  assert.deepStrictEqual(cfc.COMPANY_LABOR_KEYS, u.COMPANY_LABOR_KEYS);
  // laborSystem と otProrate（按分窓・P3.5b）は数値でないキーとして別の検証を通る
  assert.deepStrictEqual(["laborSystem", "otProrate", ...cfc.COMPANY_LIMIT_NUM_KEYS].sort(), [...u.COMPANY_LIMIT_KEYS].sort());
  assert.deepStrictEqual(cfc.COMPANY_LABOR_SYSTEMS, u.LABOR_SYSTEMS);
  assert.deepStrictEqual(cfc.COMPANY_BUILTIN_ATTRS, u.BUILTIN_TYPES);
  assert.strictEqual(String(cfc.COMPANY_ATTR_ID_RE), String(u.COMPANY_ATTR_ID_RE));
  for (let i = 0; i < 1000; i++) {
    const id = u.genCompanyAttrId();
    assert.ok(cfc.COMPANY_ATTR_ID_RE.test(id), `CF の検証で捨てられる企業属性ID: ${id}`);
  }
});

test("sanitizeCompanySettings: 許可外キー・範囲外の値・不正な属性IDを捨てる", () => {
  const r = cfc.sanitizeCompanySettings({
    xlShopName: "x", staffAttributes: { a: "b" },
    laborSettings: { fixedOvertimeMin: 1200, marginMin: -1, monthlyBase31Min: "abc", agreementDailyOtMin: 0, fiscalYearStartMonth: 13, foo: 1 },
    staffTypeLimits: {
      parttime: { weekly: 30, daily: 0, laborSystem: "B", evil: 1 },
      custom_abc: { weekly: 10 }, "/": { weekly: 1 }, co_short: { name: "x" },
      "co_ab!d1234": { name: "x", weekly: 1 }, co_AbCd1234: { name: " 契約社員 ", weekly: 40 }, co_NoName12: { weekly: 1 },
    },
  });
  assert.deepStrictEqual(r, {
    laborSettings: { fixedOvertimeMin: 1200, agreementDailyOtMin: 0 },
    staffTypeLimits: { parttime: { weekly: 30, laborSystem: "B" }, co_AbCd1234: { name: "契約社員", weekly: 40 } },
  });
  assert.deepStrictEqual(cfc.sanitizeCompanySettings(null), {});
});

test("sanitizeCompanyDeadlines / effectiveDeadlinesForShop: 期間キー・日付・連携店舗を検証し、店舗別を優先する", () => {
  const d = cfc.sanitizeCompanyDeadlines({
    "2026-10-01_2026-10-15": { all: "2026-09-25", shops: { A: "2026-09-27", Z: "2026-09-20", "a/b": "2026-09-20", B: "2026-02-30" } },
    "2026-11-01_2026-11-15": null,
    "bad key": { all: "2026-09-25" },
    "2026-12-01_2026-12-15": { all: "nope" },
  }, ["A", "B"]);
  assert.deepStrictEqual(d, {
    "2026-10-01_2026-10-15": { all: "2026-09-25", shops: { A: "2026-09-27" } },
    "2026-11-01_2026-11-15": null,
    "2026-12-01_2026-12-15": null,
  });
  const full = { "2026-10-01_2026-10-15": { all: "2026-09-25", shops: { A: "2026-09-27" } } };
  assert.deepStrictEqual(cfc.effectiveDeadlinesForShop(full, "A"), { "2026-10-01_2026-10-15": "2026-09-27" });
  assert.deepStrictEqual(cfc.effectiveDeadlinesForShop(full, "B"), { "2026-10-01_2026-10-15": "2026-09-25" });
  // クライアントの companyDeadlineFor と同じ答えを返す
  assert.strictEqual(u.companyDeadlineFor(full, "2026-10-01_2026-10-15", "A"), "2026-09-27");
  assert.strictEqual(u.companyDeadlineFor(full, "2026-10-01_2026-10-15", "B"), "2026-09-25");
});

// ===== 毎月の固定締切（2026-09-27）=====
test("sanitizeMonthlyDeadlineDays: 1〜31の整数だけ・重複なし・昇順・最大4件、Firebaseのオブジェクト形も受ける", () => {
  assert.deepStrictEqual(u.sanitizeMonthlyDeadlineDays([25, "10", 10, 0, 32, 1.5, null]), [10, 25]);
  assert.deepStrictEqual(u.sanitizeMonthlyDeadlineDays({ 0: 20, 1: 5 }), [5, 20]);
  assert.deepStrictEqual(u.sanitizeMonthlyDeadlineDays([1, 2, 3, 4, 5]), [1, 2, 3, 4]);
  assert.deepStrictEqual(u.sanitizeMonthlyDeadlineDays(null), []);
  assert.deepStrictEqual(u.sanitizeMonthlyDeadlineDays("10"), []);
});
test("monthlyDeadlineFor: 開始日より前で最も遅い固定日（2週間運用で月2回）", () => {
  const days = [10, 25];
  assert.strictEqual(u.monthlyDeadlineFor(days, "2026-10-01"), "2026-09-25", "前半は前月25日");
  assert.strictEqual(u.monthlyDeadlineFor(days, "2026-10-16"), "2026-10-10", "後半は当月10日");
  assert.strictEqual(u.monthlyDeadlineFor([20], "2026-11-01"), "2026-10-20", "1ヶ月運用は前月20日");
  assert.strictEqual(u.monthlyDeadlineFor([10], "2026-10-10"), "2026-09-10", "開始日と同じ日は締切にしない");
  assert.strictEqual(u.monthlyDeadlineFor([10], "2026-10-11"), "2026-10-10");
  assert.strictEqual(u.monthlyDeadlineFor([31], "2026-03-01"), "2026-02-28", "月末は短い月の末日に丸める");
  assert.strictEqual(u.monthlyDeadlineFor([30], "2026-03-16"), "2026-02-28");
  assert.strictEqual(u.monthlyDeadlineFor([25], "2027-01-01"), "2026-12-25", "年をまたぐ");
  assert.strictEqual(u.monthlyDeadlineFor([], "2026-10-01"), null);
  assert.strictEqual(u.monthlyDeadlineFor([10], "bad"), null);
});
test("shopDeadlineInfoFromLink: 日付指定が毎月の固定締切より優先", () => {
  const P1 = { startDate: "2026-10-01", endDate: "2026-10-15" };
  const P2 = { startDate: "2026-10-16", endDate: "2026-10-31" };
  const link = { deadlines: { "2026-10-01_2026-10-15": "2026-09-20" }, monthlyDeadlineDays: [10, 25] };
  assert.deepStrictEqual(u.shopDeadlineInfoFromLink(link, P1), { date: "2026-09-20", source: "date" });
  assert.deepStrictEqual(u.shopDeadlineInfoFromLink(link, P2), { date: "2026-10-10", source: "monthly" });
  assert.deepStrictEqual(u.shopDeadlineInfoFromLink({ deadlines: {} }, P1), null);
  assert.strictEqual(u.shopDeadlineInfoFromLink(null, P1), null);
  // 不正な日付指定は無いものとして毎月の固定締切へ落ちる
  assert.deepStrictEqual(u.shopDeadlineInfoFromLink({ deadlines: { "2026-10-01_2026-10-15": "nope" }, monthlyDeadlineDays: [25] }, P1),
    { date: "2026-09-25", source: "monthly" });
});
test("company-config: 毎月の固定締切の検証がクライアントと一致する（書き写しのドリフト検出）", () => {
  assert.strictEqual(cfc.MONTHLY_DEADLINE_MAX, u.MONTHLY_DEADLINE_MAX);
  const inputs = [[25, "10", 10, 0, 32, 1.5, null], { 0: 20, 1: 5 }, [1, 2, 3, 4, 5], null, "10", [31, 31, 29], [-1, 15]];
  inputs.forEach(x => assert.deepStrictEqual(cfc.sanitizeMonthlyDeadlineDays(x), u.sanitizeMonthlyDeadlineDays(x), JSON.stringify(x)));
});

// ===== ⑦ 企業パスワード変更は作成者のアカウントだけ（2026-09-28）=====
test("isCompanySessionUid: 企業コードでログインしたセッションの uid だけを true にする", () => {
  assert.strictEqual(u.isCompanySessionUid("company_-Nabc123"), true);
  assert.strictEqual(u.isCompanySessionUid("gX9aUid"), false, "Google/メールの uid");
  assert.strictEqual(u.isCompanySessionUid("xcompany_1"), false, "先頭一致だけ");
  assert.strictEqual(u.isCompanySessionUid(null), false);
  assert.strictEqual(u.isCompanySessionUid(undefined), false);
});

test("company-config: canChangeCompanyPassword は作成者本人だけ許し、企業コードのセッションは拒否する", () => {
  const cc = require("../functions/company-config.js");
  assert.strictEqual(cc.canChangeCompanyPassword("ownerUid1", "ownerUid1"), true, "作成者本人");
  assert.strictEqual(cc.canChangeCompanyPassword("company_C1", "ownerUid1"), false, "企業コードのセッション");
  assert.strictEqual(cc.canChangeCompanyPassword("company_C1", "company_C1"), false, "ownerUid が壊れていても企業uidには許さない");
  assert.strictEqual(cc.canChangeCompanyPassword("otherUid", "ownerUid1"), false, "作成者以外");
  assert.strictEqual(cc.canChangeCompanyPassword("ownerUid1", null), false, "ownerUid 不明");
  assert.strictEqual(cc.canChangeCompanyPassword("", ""), false);
});

test("company-config: 企業セッションの uid の接頭辞がクライアントと一致する（書き写しのドリフト検出）", () => {
  const cc = require("../functions/company-config.js");
  assert.strictEqual(cc.COMPANY_SESSION_UID_PREFIX, u.COMPANY_SESSION_UID_PREFIX);
  const idx = require("node:fs").readFileSync(require("node:path").join(__dirname, "../functions/index.js"), "utf8");
  assert.ok(idx.includes("function companyUid(companyId) { return `company_${companyId}`; }"), "CF の companyUid が同じ接頭辞で uid を作る");
});

// ===== ② x（ヘルプ・カウント外）を半日単位にする（2026-09-28）=====
test("excludedBandsOf: x は出勤セル=ランチ帯・退勤セル=ディナー帯・両方=終日", () => {
  const M = h => h * 60;
  const ab = { "三": "S3" };
  assert.deepStrictEqual(u.excludedBandsOf({ stM: M(9), enM: M(22), startNote: "x", endNote: "", abbrToShop: ab }), { lunch: true, dinner: false }, "出勤セルのx=ランチだけ");
  assert.deepStrictEqual(u.excludedBandsOf({ stM: M(9), enM: M(22), startNote: "", endNote: "x", abbrToShop: ab }), { lunch: false, dinner: true }, "退勤セルのx=ディナーだけ");
  assert.deepStrictEqual(u.excludedBandsOf({ stM: M(9), enM: M(22), startNote: "x", endNote: "x", abbrToShop: ab }), { lunch: true, dinner: true }, "両方=終日");
  assert.deepStrictEqual(u.excludedBandsOf({ stM: M(9), enM: M(15), startNote: "", endNote: "x", abbrToShop: ab }), { lunch: true, dinner: true }, "17時をまたがないシフトは反対側セルのxも有効（h/kと同じ）");
  assert.deepStrictEqual(u.excludedBandsOf({ stM: M(18), enM: M(23), startNote: "x", endNote: "", abbrToShop: ab }), { lunch: true, dinner: true }, "ディナーのみシフトの出勤セルのxが黙殺されない");
  assert.deepStrictEqual(u.excludedBandsOf({ stM: M(9), enM: M(22), startNote: "三", endNote: "x", abbrToShop: ab }), { lunch: true, dinner: true }, "略称とxの混在");
  assert.deepStrictEqual(u.excludedBandsOf({ stM: M(9), enM: M(22), startNote: "三", endNote: "", abbrToShop: ab }), { lunch: true, dinner: false }, "略称の規則は従来どおり");
  assert.deepStrictEqual(u.excludedBandsOf({ stM: M(9), enM: M(22), startNote: "h", endNote: "k", abbrToShop: ab }), { lunch: false, dinner: false }, "h/kは外さない");
  assert.deepStrictEqual(u.excludedBandsOf({ stM: M(9), enM: M(22), startNote: "constructor", endNote: "", abbrToShop: ab }), { lunch: false, dinner: false }, "未登録の略称（プロトタイプの名前）は外さない");
});

// ===== ① 1ヶ月の上限・目安を月の暦日数で日割りし、1ヶ月の残業を足す（2026-09-28）=====
// 期待値は労務設定と同じ丸め（W を30分単位→FLOOR(W×暦日数÷7)）から手計算した値（計画書の表）。実装の出力から逆生成しない
test("prorateMonthlyHours: 31日の月の値を労務設定と同じ式で日割りする", () => {
  assert.strictEqual(u.prorateMonthlyHours(177, "2026-03"), HM(177, 8), "31日 177:08");
  assert.strictEqual(u.prorateMonthlyHours(177, "2026-04"), HM(171, 25), "30日 171:25");
  assert.strictEqual(u.prorateMonthlyHours(177, "2026-02"), HM(160, 0), "28日 160:00");
  assert.strictEqual(u.prorateMonthlyHours(160, "2026-03"), HM(159, 25), "160h は W=36h に丸まり 31日でも 159:25");
  assert.strictEqual(u.prorateMonthlyHours(150, "2026-04"), HM(145, 42), "目安 150h の 30日");
  assert.strictEqual(u.prorateMonthlyHours(0, "2026-04"), 0);
  assert.strictEqual(u.prorateMonthlyHours(177, "bad"), 0);
  assert.strictEqual(u.prorateMonthlyHours(1, "2026-03"), 60, "W が0に丸まる小さい値でも上限を消さない（比例で出す）");
  assert.strictEqual(u.prorateMonthlyHours(1, "2026-04"), 58);
});

test("attrMonthFrameOf: 上限・目安とも日割り＋1ヶ月の残業。残業だけでは枠にならない", () => {
  const D = u.STAFF_LIMIT_DEFAULTS;
  assert.deepStrictEqual(u.attrMonthFrameOf({ ...D, monthly: 177, monthlyOt: 20 }, "2026-04"), { capMin: HM(191, 25), guideMin: 0 });
  assert.deepStrictEqual(u.attrMonthFrameOf({ ...D, monthly: 177, monthlyOt: 20 }, "2026-03"), { capMin: HM(197, 8), guideMin: 0 });
  assert.deepStrictEqual(u.attrMonthFrameOf({ ...D, monthly: 0, monthlyOt: 20 }, "2026-04"), { capMin: 0, guideMin: 0 }, "上限が無ければ残業だけでは枠にしない");
  assert.deepStrictEqual(u.attrMonthFrameOf({ ...D, monthlyMin: 150, monthlyOt: 20 }, "2026-04"), { capMin: 0, guideMin: HM(165, 42) });
  assert.deepStrictEqual(u.attrMonthFrameOf({ ...D, monthly: 177 }, "2026-04"), { capMin: HM(171, 25), guideMin: 0 }, "残業未設定は日割りだけ");
  const st = { staffTypeLimits: { employee: { monthly: 177, monthlyOt: 20 } } };
  assert.strictEqual(u.attrMonthFrame(st, "employee", "2026-04").capMin, HM(191, 25));
  // 4月に 172:00 働いた人: 残業0なら4月の上限 171:25 を超える／3月の 177:08 は超えない
  const noOt = { ...D, monthly: 177 };
  assert.strictEqual(u.limitStateOf(HM(172, 0), u.attrMonthFrameOf(noOt, "2026-04").capMin / 60), "over");
  assert.strictEqual(u.limitStateOf(HM(172, 0), u.attrMonthFrameOf(noOt, "2026-03").capMin / 60), null);
});

test("1ヶ月の残業（monthlyOt）は企業の共通設定でも決められ、CF の検証でも捨てられない", () => {
  assert.ok(u.COMPANY_LIMIT_KEYS.includes("monthlyOt"));
  const r = cfc.sanitizeCompanySettings({ staffTypeLimits: { parttime: { monthly: 177, monthlyOt: 20 } } });
  assert.deepStrictEqual(r.staffTypeLimits.parttime, { monthly: 177, monthlyOt: 20 });
});

// ===== ④ 従業員番号で企業内の他店舗のスタッフを呼び出す（2026-09-28）=====
test("findStaffByNumber: 数字だけの番号を文字列の完全一致で探す", () => {
  const shops = [
    { id: "A1", name: "A店", staff: ["田中", "__spacer__x", "佐藤", "鈴木"], staffNumbers: { "田中": "12", "佐藤": "A12", "鈴木": "012", "__spacer__x": "12" }, staffAttributes: { "田中": "employee" }, staffHomeShop: {} },
    { id: "B1", name: "B店", staff: { 0: "田中", 1: "山田" }, staffNumbers: { "田中": "12", "山田": "99", "幽霊": "12" }, staffAttributes: { "田中": "parttime" }, staffHomeShop: { "田中": "A1" } },
  ];
  const r = u.findStaffByNumber("12", shops);
  assert.deepStrictEqual(r.map(x => `${x.shopId}:${x.name}`), ["A1:田中", "B1:田中"], "同番号が2店舗にあれば2件・spacer と名簿に無い名前は除外");
  assert.strictEqual(r[0].homeShopId, "A1", "所属が未設定ならその店舗");
  assert.strictEqual(r[1].homeShopId, "A1", "ヘルプ先の登録は所属先を指す");
  assert.deepStrictEqual(u.findStaffByNumber("012", shops).map(x => x.name), ["鈴木"], "「012」と「12」は別");
  assert.deepStrictEqual(u.findStaffByNumber("12a", shops), [], "入力が数字以外なら探さない");
  assert.deepStrictEqual(u.findStaffByNumber("A12", shops), [], "数字以外の番号の人は対象外");
  assert.deepStrictEqual(u.findStaffByNumber("", shops), []);
});

test("mergeStaffMatches: 同じ人の複数登録は1人にまとめ、所属店舗側の登録を正とする", () => {
  const A = { shopId: "A1", shopName: "A店", name: "田中", attrId: "employee", homeShopId: "A1" };
  const B = { shopId: "B1", shopName: "B店", name: "田中", attrId: "parttime", homeShopId: "A1" };
  assert.deepStrictEqual(u.mergeStaffMatches([B, A]), [{ name: "田中", attrId: "employee", homeShopId: "A1", homeShopName: "A店", shops: ["B1", "A1"] }], "所属A店・社員");
  assert.deepStrictEqual(u.mergeStaffMatches([B]), [{ name: "田中", attrId: "parttime", homeShopId: "A1", homeShopName: null, shops: ["B1"] }], "B店にしか居なくても所属はA店");
  const C = { shopId: "C1", shopName: "C店", name: "佐藤", attrId: null, homeShopId: "C1" };
  assert.strictEqual(u.mergeStaffMatches([A, C]).length, 2, "同じ番号で別の名前＝選択肢");
  assert.deepStrictEqual(u.mergeStaffMatches([]), []);
});

// ===== ⑤ 企業内登録スタッフ（2026-09-28）=====
test("compareCompanyStaffRows: 数字のみ→数字＋文字→文字（50音）→番号なし。同じ番号は名前の50音", () => {
  // かなの種類（あ／ア）の前後は照合の実装で入れ替わる（Node と Chromium で違った）ので、50音で位置の違う字で測る
  const rows = ["3", "10", "2A", "10B", "い", "ア", "", "2"].map((n, i) => ({ number: n, name: "n" + i }));
  assert.deepStrictEqual(rows.slice().sort((a, b) => u.compareCompanyStaffRows(a, b, "number")).map(r => r.number), ["2", "3", "10", "2A", "10B", "ア", "い", ""]);
  const same = [{ number: "5", name: "佐藤" }, { number: "5", name: "伊藤" }];
  assert.deepStrictEqual(same.sort((a, b) => u.compareCompanyStaffRows(a, b, "number")).map(r => r.name), ["伊藤", "佐藤"].sort((a, b) => a.localeCompare(b, "ja")));
  assert.ok(u.compareCompanyStaffRows({ number: "02", name: "a" }, { number: "2", name: "a" }, "number") > 0, "同値なら桁数の少ない順");
  const byShop = [{ number: "1", name: "x", homeShopName: "B店" }, { number: "9", name: "y", homeShopName: "A店" }, { number: "2", name: "z", homeShopName: "A店" }];
  assert.deepStrictEqual(byShop.sort((a, b) => u.compareCompanyStaffRows(a, b, "shop")).map(r => r.number), ["2", "9", "1"], "店舗名の50音 → その中で番号順");
});

test("filterCompanyStaffRows: 番号と名前の部分一致。空は全件", () => {
  const rows = [{ number: "012", name: "田中" }, { number: "120", name: "佐藤" }, { number: "7", name: "12号室" }, { number: "5", name: "鈴木" }];
  assert.deepStrictEqual(u.filterCompanyStaffRows(rows, "12").map(r => r.name), ["田中", "佐藤", "12号室"]);
  assert.strictEqual(u.filterCompanyStaffRows(rows, " ").length, 4);
  assert.deepStrictEqual(u.filterCompanyStaffRows(rows, "鈴").map(r => r.number), ["5"]);
});

test("buildCompanyStaffRows: ヘルプ先の登録は所属店舗側に同名がいれば出さず、有給は所属店舗の凍結値だけで数える", () => {
  const P = (id, start, paid) => ({ id, label: id + "の期間", startDate: start, endDate: start, ...(paid == null ? {} : { laborTotals: { "田中": { workMin: 0, paid, publicOff: 0, ceremony: 0 } } }) });
  const shops = [
    { id: "A1", name: "A店", staff: ["田中", "__spacer__1", "佐藤"],
      settings: { staffNumbers: { "田中": "12" }, staffAttributes: { "田中": "employee" }, paidLeaveGranted: { "田中": 20 }, staffHidden: { "佐藤": true } },
      periods: { a: P("pa", "2026-05-01", 1), b: P("pb", "2026-06-01", 0.5), c: P("pc", "2026-07-01", null), old: P("po", "2025-05-01", 3) } },
    { id: "B1", name: "B店", staff: ["田中", "山田"],
      settings: { staffNumbers: { "田中": "12" }, staffAttributes: { "田中": "parttime", "山田": "co_Abcdefgh" }, staffHomeShop: { "田中": "A1", "山田": "A1" } },
      periods: { x: { id: "px", label: "B", startDate: "2026-05-01", endDate: "2026-05-15", laborTotals: { "田中": { paid: 5 } } } } },
  ];
  const cs = { staffTypeLimits: { co_Abcdefgh: { name: "契約" } } };
  const rows = u.buildCompanyStaffRows(shops, cs, "2026-09-28");
  const key = rows.map(r => `${r.shopId}:${r.name}`).sort();
  assert.deepStrictEqual(key, ["A1:佐藤", "A1:田中", "B1:山田"], "B店の田中（所属A店・A店にも居る）は出さない／A店に居ない山田は B店の行で残る／spacer は出さない");
  const t = rows.find(r => r.name === "田中");
  assert.strictEqual(t.attrLabel, "社員");
  assert.strictEqual(t.paidGranted, 20);
  assert.strictEqual(t.paidUsed, 1.5, "年度（4月開始）内の凍結値だけ。ヘルプ先 B店の5日は足さない・前年度の3日も足さない");
  assert.strictEqual(t.paidRemain, 18.5);
  assert.deepStrictEqual(t.paidMissing, ["pcの期間"], "凍結値の無い期間");
  // シフト作成タブの「有給残」と同じ式（yearLaborSummary＋paidLeaveRemaining）に通した値と一致する
  const same = u.paidLeaveRemaining(shops[0].settings, "田中", u.yearLaborSummary(Object.values(shops[0].periods), "田中", 2026, 4, null).paid);
  assert.strictEqual(t.paidRemain, same);
  const y = rows.find(r => r.name === "山田");
  assert.strictEqual(y.homeShopName, "A店", "所属店舗の列は所属先の店舗名");
  assert.strictEqual(y.attrLabel, "契約", "企業属性の名前は企業の共通設定から");
  assert.strictEqual(y.paidGranted, null);
  assert.strictEqual(y.paidRemain, null, "付与が未入力なら残数は出さない");
  assert.strictEqual(rows.find(r => r.name === "佐藤").hidden, true);
});

test("buildCompanyStaffRows: 数字だけの同じ従業員番号は1行にまとめ、名前はフルネームに寄せ、所属店舗を全部並べる（2026-09-29）", () => {
  const shops = [
    { id: "A1", name: "A店", staff: ["田中", "鈴木", "高橋"],
      settings: { staffNumbers: { "田中": "12", "鈴木": "A7", "高橋": "30" }, staffAttributes: { "田中": "employee" }, paidLeaveGranted: { "田中": 10 } },
      periods: { a: { id: "pa", label: "5月", startDate: "2026-05-01", endDate: "2026-05-15", laborTotals: { "田中": { paid: 2 } } } } },
    { id: "B1", name: "B店", staff: ["田中 太郎", "鈴木一郎", "佐藤"],
      settings: { staffNumbers: { "田中 太郎": "12", "鈴木一郎": "A7", "佐藤": "30" } },
      periods: {} },
    { id: "C1", name: "C店", staff: ["田中太郎"], settings: { staffNumbers: { "田中太郎": " 12 " } }, periods: {} },
  ];
  const rows = u.buildCompanyStaffRows(shops, null, "2026-09-28");
  const t = rows.filter(r => r.number === "12");
  assert.strictEqual(t.length, 1, "3店舗の番号12は1行");
  assert.strictEqual(t[0].name, "田中 太郎", "空白を除いて最も長い表記。同じ長さなら先に見つかった方");
  assert.deepStrictEqual(t[0].otherNames, ["田中", "田中太郎"]);
  assert.deepStrictEqual(t[0].conflictNames, [], "名字だけ・空白違いは食い違いにしない");
  assert.deepStrictEqual(t[0].homeShopNames, ["A店", "B店", "C店"], "所属店舗を全部並べる");
  assert.strictEqual(t[0].homeShopName, "A店");
  assert.strictEqual(t[0].attrLabel, "社員", "属性は代表（有給の付与がある A店の登録）から");
  assert.strictEqual(t[0].paidRemain, 8, "有給は代表の所属店舗の凍結値だけ");
  assert.strictEqual(rows.filter(r => r.name.startsWith("鈴木")).length, 2, "数字以外の番号（A7）はまとめない");
  const x = rows.filter(r => r.number === "30");
  assert.strictEqual(x.length, 1);
  assert.deepStrictEqual(x[0].conflictNames.length, 1, "同じ番号で名前が食い違う登録は印を付けて残す");
  assert.strictEqual(new Set(rows.map(r => r.key)).size, rows.length, "行のキーは重複しない");
  assert.deepStrictEqual(u.filterCompanyStaffRows(rows, "田中太郎").map(r => r.number), ["12"], "まとめる前の表記でも検索に当たる");
});

// ===== ⑧ 全表示: 人数が多いときだけ列を横幅に合わせる（2026-09-28）=====
test("fullViewColW: 少人数は39px・横幅いっぱいに割った列幅が48px以下になる人数から横幅に合わせる（2週間以下のみ）", () => {
  const f = (n, days) => u.fullViewColW({ availW: 1350, staffCount: n, days, maxDays: 16, dateW: 45 });
  assert.deepStrictEqual(f(4, 16), { colW: 39, expanded: false, fillW: 315 }, "少人数は従来どおり");
  assert.deepStrictEqual([f(25, 16).colW, f(25, 16).expanded], [39, false], "25名は fillW=50>48 なので従来どおり");
  assert.deepStrictEqual([f(26, 16).colW, f(26, 16).expanded], [48, true], "26名から横幅に合わせる");
  assert.strictEqual(f(27, 16).colW, 46);
  assert.strictEqual(f(32, 16).colW, 39);
  assert.strictEqual(f(35, 16).colW, 36, "33名以上は従来と同じ値（横幅に合わせて細くなる）");
  assert.strictEqual(f(40, 16).colW, 31);
  assert.strictEqual(f(200, 16).colW, 12, "下限12px");
  // 1ヶ月（17日以上）は人数に関係なく従来の式 min(39, fillW)
  assert.deepStrictEqual([f(26, 31).colW, f(26, 31).expanded], [39, false]);
  assert.strictEqual(f(35, 31).colW, 36);
  // 横幅を超えない
  for (let n = 1; n <= 60; n++) { const r = f(n, 16); assert.ok(45 * 2 + r.colW * n <= 1350 || r.colW === 12, `n=${n}`); }
});

test("fullViewFontOf: 列を広げても文字は大きくせず、39pxより細い列では比例して小さくする", () => {
  assert.strictEqual(u.fullViewFontOf(14, 48), 14);
  assert.strictEqual(u.fullViewFontOf(14, 39), 14);
  assert.strictEqual(u.fullViewFontOf(14, 36), 12);
  assert.strictEqual(u.fullViewFontOf(14, 31), 11);
  assert.strictEqual(u.fullViewFontOf(14, 12), 5);
});

// ===== 法人（entity）レイヤー（2026-09-30・労務給与_複数法人_実装計画.md P1）=====
const cfe = require("../functions/company-config.js");
test("法人: CF 側の法人ID・店舗種別・店舗の法人の解決がクライアントと一致する（書き写しのドリフト検出）", () => {
  assert.strictEqual(String(cfe.ENTITY_ID_RE), String(u.COMPANY_ENTITY_ID_RE));
  assert.deepStrictEqual(cfe.SHOP_KINDS, u.COMPANY_SHOP_KINDS);
  const pubs = [
    null, {},
    { entities: { E1: { name: "甲" } }, defaultEntityId: "E1", shopEntities: { S1: "E1", S2: "E9", S3: "bad/id" }, shopKinds: { S1: "hq", S2: "shop", S3: "x" } },
    { entities: { E1: { name: "甲" }, E2: { name: "乙" } }, defaultEntityId: "E9", shopEntities: { S1: "E2" } },
    { entities: { E1: null }, defaultEntityId: "E1", shopEntities: { S1: "E1" } },
  ];
  pubs.forEach((p, i) => ["S1", "S2", "S3", "S4"].forEach(sid => {
    assert.strictEqual(u.companyEntityIdOfShop(p, sid), cfe.entityIdOfShop(p, sid), `pub#${i} ${sid}`);
    assert.strictEqual(u.companyShopKindOf(p, sid), cfe.shopKindOf(p, sid), `pub#${i} ${sid} kind`);
  }));
  assert.strictEqual(cfe.entityIdOfShop(pubs[2], "S2"), "E1", "消えた法人への割当は既定の法人へ倒す");
  assert.strictEqual(cfe.entityIdOfShop(pubs[3], "S3"), null, "既定の法人も無ければ null");
  assert.strictEqual(cfe.shopKindOf(pubs[2], "S1"), "hq");
  assert.strictEqual(cfe.shopKindOf(pubs[2], "S3"), "shop", "hq 以外の値は通常の店舗");
  assert.ok(cfe.isValidEntityId("-Nabc_09Z"));
  ["", "a/b", "a.b", "a#b", "x".repeat(65), 12, null].forEach(v => assert.ok(!cfe.isValidEntityId(v), String(v)));
});

test("法人: 既存企業の移行は法人を1つ作って全店舗を割り当て、2回目は何もしない（冪等）", () => {
  const pub = { name: "テスト企業", shops: { S1: true, S2: true, "bad/": true }, config: { settings: { laborSettings: { fixedOvertimeMin: 1800 } } } };
  let n = 0;
  const patch = cfe.planEntityMigration(pub, () => "E" + (++n), "2026-09-30T00:00:00Z");
  assert.deepStrictEqual(patch, {
    "entities/E1": { name: "テスト企業", createdAt: "2026-09-30T00:00:00Z" },
    defaultEntityId: "E1", "shopEntities/S1": "E1", "shopEntities/S2": "E1",
  });
  // パッチを当てた後は何も要らない
  const after = { ...pub, entities: { E1: { name: "テスト企業" } }, defaultEntityId: "E1", shopEntities: { S1: "E1", S2: "E1" } };
  assert.strictEqual(cfe.planEntityMigration(after, () => "X", "t"), null);
  // 新しく連携した店舗と、消えた法人を指す店舗だけが既定へ
  const later = { ...after, shops: { S1: true, S2: true, S3: true }, entities: { E1: { name: "甲" }, E2: { name: "乙" } }, shopEntities: { S1: "E2", S2: "E7" } };
  assert.deepStrictEqual(cfe.planEntityMigration(later, () => "X", "t"), { "shopEntities/S2": "E1", "shopEntities/S3": "E1" });
  // 既定の法人が消えていたら、残っている法人のうち1つを既定にする（新しい法人は作らない）
  assert.deepStrictEqual(cfe.planEntityMigration({ shops: {}, entities: { B: { name: "b" }, A: { name: "a" } }, defaultEntityId: "Z" }, () => "X", "t"), { defaultEntityId: "A" });
  // 企業名が無くても法人名は空にしない
  assert.strictEqual(cfe.planEntityMigration({}, () => "E1", "t")["entities/E1"].name, "法人");
});

test("法人: 企業共通 → 法人 の重ね合わせ（労務はキー単位・属性は属性×キー単位で法人が勝つ）", () => {
  const c = { laborSettings: { fixedOvertimeMin: 1800, marginMin: 420 }, staffTypeLimits: { parttime: { weekly: 30, laborSystem: "B" }, co_AbCd1234: { name: "特定技能", laborSystem: "A" } } };
  const e = { laborSettings: { fixedOvertimeMin: 2700, agreementDailyOtMin: 0 }, staffTypeLimits: { parttime: { weekly: 20 }, employee: { monthly: 200 } } };
  assert.deepStrictEqual(cfe.mergeEntitySettings(c, e), {
    laborSettings: { fixedOvertimeMin: 2700, marginMin: 420, agreementDailyOtMin: 0 },
    staffTypeLimits: { parttime: { weekly: 20, laborSystem: "B" }, co_AbCd1234: { name: "特定技能", laborSystem: "A" }, employee: { monthly: 200 } },
  });
  assert.deepStrictEqual(cfe.mergeEntitySettings(c, null), c, "法人の設定が無ければ企業共通のまま");
  assert.deepStrictEqual(cfe.mergeEntitySettings(null, null), {});
  // 写しに焼いた法人の値は、店舗側で「企業が決めた項目」として固定表示・保存時に剥がされる（クライアントは変更なし）
  const merged = cfe.mergeEntitySettings(c, e);
  const keys = u.companyControlledKeys(merged);
  assert.ok(keys.labor.has("agreementDailyOtMin") && keys.labor.has("fixedOvertimeMin"));
  const eff = u.applyCompanySettings({ laborSettings: { fixedOvertimeMin: 60, monthlyBase31Min: 10628 } }, merged);
  assert.strictEqual(eff.laborSettings.fixedOvertimeMin, 2700, "法人の値が店舗の値より優先");
  assert.strictEqual(eff.laborSettings.monthlyBase31Min, 10628, "企業も法人も決めていない項目は店舗の値");
  assert.deepStrictEqual(u.stripCompanySettings(eff, merged).laborSettings, { monthlyBase31Min: 10628 });
});

test("法人: 写し（buildShopMirror）に法人名・種別・重ねた設定が入り、移行前後で settings が変わらない", () => {
  const before = { name: "テスト企業", shops: { S1: true, S2: true }, config: { settings: { laborSettings: { fixedOvertimeMin: 1800 } }, deadlines: { "2026-10-01_2026-10-15": { all: "2026-09-25" } }, monthlyDeadlineDays: [20] } };
  const m0 = cfe.buildShopMirror("C1", before, "S1", { S1: "A店" }, "t");
  let n = 0;
  const patch = cfe.planEntityMigration(before, () => "E" + (++n), "t");
  const after = JSON.parse(JSON.stringify(before));
  Object.keys(patch).forEach(k => { const ks = k.split("/"); let o = after; ks.slice(0, -1).forEach(x => { o[x] = o[x] || {}; o = o[x]; }); o[ks[ks.length - 1]] = patch[k]; });
  const m1 = cfe.buildShopMirror("C1", after, "S1", { S1: "A店" }, "t");
  assert.deepStrictEqual(m1.settings, m0.settings, "既定の法人は設定を持たないので、移行で写しの設定は変わらない");
  assert.deepStrictEqual(m1.deadlines, { "2026-10-01_2026-10-15": "2026-09-25" });
  assert.deepStrictEqual(m1.monthlyDeadlineDays, [20]);
  assert.strictEqual(m1.entityId, "E1");
  assert.strictEqual(m1.entityName, "テスト企業");
  assert.strictEqual(m1.kind, "shop");
  assert.strictEqual(m0.entityId, undefined, "法人が無い企業の写しは entityId を持たない");
  const two = { ...after, entities: { E1: { name: "甲" }, E2: { name: "乙", settings: { laborSettings: { fixedOvertimeMin: 2700 } } } }, shopEntities: { S1: "E1", S2: "E2" }, shopKinds: { S2: "hq" } };
  const m2 = cfe.buildShopMirror("C1", two, "S2", {}, "t");
  assert.deepStrictEqual([m2.entityId, m2.entityName, m2.kind, m2.settings.laborSettings.fixedOvertimeMin], ["E2", "乙", "hq", 2700]);
  assert.strictEqual(cfe.buildShopMirror("C1", two, "S1", {}, "t").settings.laborSettings.fixedOvertimeMin, 1800, "別の法人の設定は混ざらない");
});

test("法人: 他企業に連携済みの店舗の検出（owners の企業uid と写しの id）", () => {
  assert.deepStrictEqual(cfe.otherCompanyLinksOf({ U1: "k", company_C1: "k" }, { id: "C1" }, "C1"), [], "自分の企業だけなら拒否しない");
  assert.deepStrictEqual(cfe.otherCompanyLinksOf({ U1: "k", company_C2: "k" }, null, "C1"), ["C2"]);
  assert.deepStrictEqual(cfe.otherCompanyLinksOf({ U1: "k" }, { id: "C3" }, "C1"), ["C3"], "owners に無くても写しがあれば候補");
  assert.deepStrictEqual(cfe.otherCompanyLinksOf({ company_C2: "k" }, { id: "C2" }, "C1"), ["C2"], "重複しない");
  assert.deepStrictEqual(cfe.otherCompanyLinksOf(null, null, "C1"), []);
});

test("buildCompanyStaffRows: 従業員番号でまとめるのは同じ法人の中だけ・本部店舗の所属は isHq（2026-09-30・P1）", () => {
  const shops = [
    { id: "A1", name: "A店", entityId: "E1", staff: ["田中", "事務 花子"], settings: { staffNumbers: { "田中": "12", "事務 花子": "90" }, staffHomeShop: { "事務 花子": "H1" } }, periods: {} },
    { id: "B1", name: "B店", entityId: "E1", staff: ["田中 太郎"], settings: { staffNumbers: { "田中 太郎": "12" } }, periods: {} },
    { id: "C1", name: "C店", entityId: "E2", staff: ["田中 次郎"], settings: { staffNumbers: { "田中 次郎": "12" } }, periods: {} },
    { id: "H1", name: "本部", entityId: "E1", kind: "hq", staff: ["事務 花子"], settings: { staffNumbers: { "事務 花子": "90" } }, periods: {} },
  ];
  const rows = u.buildCompanyStaffRows(shops, null, "2026-09-30");
  const t = rows.filter(r => r.number === "12").sort((a, b) => a.entityId.localeCompare(b.entityId));
  assert.strictEqual(t.length, 2, "別法人の同じ番号は別行");
  assert.deepStrictEqual(t.map(r => [r.entityId, r.name, r.homeShopNames.join("・")]), [["E1", "田中 太郎", "A店・B店"], ["E2", "田中 次郎", "C店"]]);
  const h = rows.filter(r => r.number === "90");
  assert.strictEqual(h.length, 1);
  assert.strictEqual(h[0].isHq, true, "所属店舗が本部なら isHq");
  assert.strictEqual(t[0].isHq, false);
  // 法人を持たない店舗（移行前）どうしは従来どおり番号でまとまる
  const legacy = u.buildCompanyStaffRows(shops.map(s => ({ ...s, entityId: undefined })), null, "2026-09-30");
  assert.strictEqual(legacy.filter(r => r.number === "12").length, 1);
  // 写しの settings（coSettings）があれば店舗ごとにそちらを重ねる
  const r2 = u.buildCompanyStaffRows([{ id: "A1", name: "A店", entityId: "E1", staff: ["佐藤"], settings: { staffAttributes: { "佐藤": "co_AbCd1234" } }, periods: {},
    coSettings: { staffTypeLimits: { co_AbCd1234: { name: "特定技能" } } } }], null, "2026-09-30");
  assert.strictEqual(r2[0].attrLabel, "特定技能");
});

test("companyEntityList: 既定の法人を先頭に、残りは名前の50音順", () => {
  const pub = { entities: { E1: { name: "NITOエンタープライズ" }, E2: { name: "あ法人" }, E3: { name: "NITOエンターテイメント" }, "bad/": { name: "x" } }, defaultEntityId: "E3" };
  assert.deepStrictEqual(u.companyEntityList(pub).map(e => e.id), ["E3", "E1", "E2"], "既定(E3)が先頭、残りは localeCompare(ja) の順");
  assert.strictEqual(u.companyEntityList(pub)[0].isDefault, true);
  assert.strictEqual(u.companyEntityList(pub).length, 3, "不正なIDは出さない");
  assert.deepStrictEqual(u.companyEntityList(null), []);
});

// ===== 賃金マスタ・閲覧パスコード（2026-09-30・労務給与_複数法人_実装計画.md §3.7・P6a）=====
test("P6a fixedOtAmountOf: 213,500 ÷ 173.3 × 1.25 × 30 = 46,199（1円未満切上げ）", () => {
  assert.strictEqual(u.fixedOtAmountOf(213500, 30, 10398), 46199);
  assert.strictEqual(u.fixedOtAmountOf(213500, 30), 46199, "分母が無ければ 173.3h（10398分）");
  assert.strictEqual(u.DEFAULT_RATE_DENOMINATOR_MIN, 10398);
  // 割り切れるときは切り上げない（浮動小数の誤差で1円増えない）: 10398×100 の倍数になる基本給
  assert.strictEqual(u.fixedOtAmountOf(173300, 1, 10398), 1250);
  assert.strictEqual(u.fixedOtAmountOf(0, 30, 10398), 0);
  assert.strictEqual(u.fixedOtAmountOf(213500, 0, 10398), 0);
});
test("P6a rateDenominatorMinOf: 法人設定の値、無ければ 10398", () => {
  assert.strictEqual(u.rateDenominatorMinOf({ rateDenominatorMin: 10400 }), 10400);
  assert.strictEqual(u.rateDenominatorMinOf({}), 10398);
  assert.strictEqual(u.rateDenominatorMinOf(null), 10398);
  assert.strictEqual(u.rateDenominatorMinOf({ rateDenominatorMin: 0 }), 10398);
  assert.strictEqual(u.rateDenominatorMinOf({ rateDenominatorMin: "abc" }), 10398);
});
test("P6a 給与形態: 社員は月給固定、企業属性は月給既定、パート・アルバイトは時給既定", () => {
  assert.strictEqual(u.isPayTypeFixed("employee"), true);
  assert.strictEqual(u.isPayTypeFixed("parttime"), false);
  assert.strictEqual(u.isPayTypeFixed("co_AbCd1234"), false);
  assert.strictEqual(u.defaultPayTypeOf("employee"), "monthly");
  assert.strictEqual(u.defaultPayTypeOf("parttime"), "hourly");
  assert.strictEqual(u.defaultPayTypeOf("co_AbCd1234"), "monthly");
  assert.strictEqual(u.defaultPayTypeOf("dispatch"), "hourly");
  assert.strictEqual(u.defaultPayTypeOf(undefined), "hourly");
});
test("P6a 最賃比較: 時給 1,230 円 vs 最賃 1,231 円は NG、月給は 基本給÷分母 で比べる", () => {
  const ws = { minWage: [{ from: "2025-10-01", yen: 1177 }, { from: "2026-10-01", yen: 1231 }] };
  assert.strictEqual(u.minWageOn(ws, "2026-09-30"), 1177);
  assert.strictEqual(u.minWageOn(ws, "2026-10-01"), 1231);
  assert.strictEqual(u.minWageOn(ws, "2025-01-01"), null, "履歴より前は分からない");
  assert.strictEqual(u.minWageOn(null, "2026-10-01"), null, "法人設定が無ければ比較しない");
  const ng = u.minWageCheck({ payType: "hourly", base: 1230 }, 1231, 10398);
  assert.deepStrictEqual([ng.rate, ng.min, ng.ok], [1230, 1231, false]);
  assert.strictEqual(u.minWageCheck({ payType: "hourly", base: 1231 }, 1231).ok, true);
  const m = u.minWageCheck({ payType: "monthly", base: 213500, allowances: [{ name: "資格", amount: 50000 }] }, 1231, 10398);
  assert.ok(Math.abs(m.rate - 213500 * 60 / 10398) < 1e-9, "月給の最賃比較は基本給だけ（§4.5）");
  assert.strictEqual(m.ok, true);
  assert.strictEqual(u.minWageCheck({ payType: "hourly", base: 1230 }, null), null);
  // 時給換算は割増の基礎に入る手当を含む
  const r = u.hourlyRateOf({ payType: "monthly", base: 173300, allowances: [{ name: "a", amount: 17330 }, { name: "b", amount: 99999, excludeFromRate: true }] }, 10398);
  assert.ok(Math.abs(r - 1100) < 1e-9);
  assert.strictEqual(u.hourlyRateOf({ payType: "hourly", base: 1300 }, 10398), 1300);
});
test("P6a sanitizeWageSettings: CF 側と同じ規則（書き写しのドリフト検出）", () => {
  const cases = [
    null, {}, { minWage: [] },
    { minWage: [{ from: "2026-10-01", yen: 1231 }, { from: "2025-10-01", yen: 1177 }] },
    { minWage: { 0: { from: "2026-10-01", yen: 1231 }, 1: { from: "2026-10-01", yen: 1250 } } },
    { minWage: [{ from: "2026-02-30", yen: 1231 }, { from: "2026-10-01", yen: 0 }, { from: "2026-10-01", yen: 1.5 }, { from: "2026-11-01", yen: "1300" }, null, 5] },
    { minWage: Array.from({ length: 25 }, (_, i) => ({ from: `20${String(10 + i).padStart(2, "0")}-10-01`, yen: 900 + i })) },
  ];
  cases.forEach((c, i) => assert.deepStrictEqual(cfc.sanitizeWageSettings(c), u.sanitizeWageSettings(c), `case#${i}`));
  assert.deepStrictEqual(u.sanitizeWageSettings(cases[3]), { minWage: [{ from: "2025-10-01", yen: 1177 }, { from: "2026-10-01", yen: 1231 }] }, "日付順に並べる");
  assert.strictEqual(u.sanitizeWageSettings(cases[6]).minWage.length, u.MIN_WAGE_MAX_ENTRIES);
  assert.strictEqual(cfc.MIN_WAGE_MAX_ENTRIES, u.MIN_WAGE_MAX_ENTRIES);
  // 企業の共通設定・法人設定の検証に通り、法人が勝つ形で写しへ重なる
  const s = cfc.sanitizeCompanySettings({ wageSettings: cases[3], evil: 1 });
  assert.deepStrictEqual(s.wageSettings, u.sanitizeWageSettings(cases[3]));
  const merged = cfc.mergeEntitySettings({ wageSettings: { minWage: [{ from: "2025-10-01", yen: 1177 }] } }, { wageSettings: { minWage: [{ from: "2026-10-01", yen: 1231 }] } });
  assert.deepStrictEqual(merged.wageSettings, { minWage: [{ from: "2026-10-01", yen: 1231 }] });
  assert.deepStrictEqual(cfc.mergeEntitySettings({ wageSettings: { minWage: [{ from: "2025-10-01", yen: 1177 }] } }, {}).wageSettings.minWage[0].yen, 1177);
  // 店舗の settings には入らない（applyCompanySettings は労務設定と属性別の制限だけを重ねる）
  assert.strictEqual(u.applyCompanySettings({}, merged).wageSettings, undefined);
});
test("P6a 改定は版を足す（適用開始日が変われば history へ積み、同じ日なら訂正）", () => {
  const v1 = { payType: "hourly", base: 1200, effectiveFrom: "2026-04-01", commute: { amount: 500, per: "day" } };
  const r1 = u.applyPayRevision(null, v1, "t1");
  assert.strictEqual(r1.history, undefined);
  assert.strictEqual(r1.base, 1200);
  assert.strictEqual(u.applyPayRevision(r1, v1, "t9"), r1, "変化が無ければ同じ参照（書かない）");
  const r1b = u.applyPayRevision(r1, { ...v1, base: 1210 }, "t2");
  assert.strictEqual(r1b.base, 1210);
  assert.strictEqual(r1b.history, undefined, "同じ適用開始日は訂正");
  const r2 = u.applyPayRevision(r1b, { ...v1, base: 1250, effectiveFrom: "2026-10-01" }, "t3");
  assert.strictEqual(r2.base, 1250);
  assert.deepStrictEqual(r2.history.map(h => [h.effectiveFrom, h.base, h.updatedAt]), [["2026-04-01", 1210, "t2"]]);
  const r3 = u.applyPayRevision(r2, { ...v1, base: 1300, effectiveFrom: "2027-04-01" }, "t4");
  assert.deepStrictEqual(r3.history.map(h => h.base), [1210, 1250], "古い版は上書きしない");
  assert.strictEqual(u.payVersionOn(r3, "2026-12-31").base, 1250);
  assert.strictEqual(u.payVersionOn(r3, "2027-04-01").base, 1300);
  assert.strictEqual(u.payVersionOn(r3, "2026-05-01").base, 1210);
  // Firebase の配列→オブジェクト変換にも耐える
  const fb = { ...r3, history: { 0: r3.history[0], 1: r3.history[1] } };
  assert.strictEqual(u.payVersionOn(fb, "2026-05-01").base, 1210);
});
test("P6a normalizePayVersion: 社員は月給・時給者は月給の項目を持たない・固定残業の自動計算", () => {
  const n = u.withFixedOtAmount({ payType: "monthly", base: 213500, fixedOt: { hours: 30, auto: true, amount: 1 },
    fixedNight: { hours: 32, amount: 10000 }, allowances: [{ name: "資格手当", amount: 5000, excludeFromRate: true }, { name: "", amount: 0 }] }, 10398);
  assert.strictEqual(n.fixedOt.amount, 46199);
  assert.deepStrictEqual(n.allowances, [{ name: "資格手当", amount: 5000, excludeFromRate: true, excludeFromDeduction: false }], "空行は捨てる");
  const manual = u.withFixedOtAmount({ payType: "monthly", base: 213500, fixedOt: { hours: 30, auto: false, amount: 45000 } }, 10398);
  assert.strictEqual(manual.fixedOt.amount, 45000, "手修正は式で置き換えない");
  const h = u.normalizePayVersion({ payType: "hourly", base: 1300, fixedOt: { hours: 30 }, allowances: [{ name: "x", amount: 1 }] });
  assert.strictEqual(h.fixedOt, undefined);
  assert.strictEqual(h.allowances, undefined);
  assert.strictEqual(u.normalizePayVersion({ payType: "weekly" }).payType, "monthly");
});
test("P6a 改名・削除の後始末: private/pay が追随する（STAFF_KEYED_PRIVATE_NODES）", () => {
  assert.deepStrictEqual(u.STAFF_KEYED_PRIVATE_NODES, ["pay"]);
  const m = { "田中": { payType: "hourly", base: 1200 } };
  assert.deepStrictEqual(u.renameStaffInPay(m, "田中", "田中 太郎"), { "田中 太郎": m["田中"], "田中": null });
  assert.strictEqual(u.renameStaffInPay(m, "佐藤", "佐藤 次郎"), null);
  assert.strictEqual(u.renameStaffInPay(m, "田中", "田中"), null);
  assert.deepStrictEqual(u.dropStaffFromPay(m, ["田中", "佐藤"]), { "田中": null });
  assert.strictEqual(u.dropStaffFromPay(m, ["佐藤"]), null);
  assert.strictEqual(u.dropStaffFromPay(null, ["田中"]), null);
});
test("P6a ドリフト検出: 改名と削除の入口が private/pay の後始末を通る", () => {
  const fs = require("node:fs");
  const admin = _readAdminSurface(); // app-admin.js＋app-shift.js＋app-company.js（2026-09-30 分割）
  // 改名（AdminView の onRenameStaff）は renameStaffInSettings と同じ場所で pay も移す
  const ren = admin.slice(admin.indexOf("onRenameStaff={(oldName,newName)=>{"));
  const renBody = ren.slice(0, ren.indexOf("tt(`✓ ${oldName} → ${newName} に変更しました`)"));
  assert.ok(/renameStaffInSettings\(/.test(renBody) && /pay\.rename\(/.test(renBody), "改名で private/pay を移していない");
  // 削除の後始末（settingsWithoutStaff を呼ぶ場所すべて）の直後で pay も落とす
  const sites = [];
  let i = -1;
  while ((i = admin.indexOf("=settingsWithoutStaff(", i + 1)) >= 0) sites.push(i);
  assert.ok(sites.length >= 2, `settingsWithoutStaff の呼び出しが ${sites.length} か所しか見つからない`);
  sites.forEach(at => assert.ok(admin.slice(at, at + 400).includes("pay.drop("), `settingsWithoutStaff の呼び出し（${admin.slice(0, at).split("\n").length}行目）の近くに pay.drop が無い`));
  const main = fs.readFileSync(require("node:path").join(__dirname, "..", "app-main.js"), "utf8");
  assert.ok(/renameStaffInPay\(/.test(main) && /dropStaffFromPay\(/.test(main), "app-main.js が改名・削除の差分関数を使っていない");
});
test("P6a パスコード: SHA-256(salt+code) がクライアントと CF で一致し、未設定は 0000 を受け付ける", async () => {
  for (const [salt, code] of [["ab", "1234"], ["", "0000"], ["0123456789abcdef0123456789abcdef", "9876"]]) {
    assert.strictEqual(await u.payCodeHash(salt, code), cfc.payCodeHashCF(salt, code));
  }
  assert.strictEqual(await u.verifyPayCode("0000", null), true);
  assert.strictEqual(await u.verifyPayCode("1234", null), false);
  assert.strictEqual(await u.verifyPayCode("000", null), false);
  const rec = { hash: cfc.payCodeHashCF("s1", "4321"), salt: "s1", updatedAt: "t" };
  assert.strictEqual(await u.verifyPayCode("4321", rec), true);
  assert.strictEqual(await u.verifyPayCode("0000", rec), false, "設定済みなら 0000 は通らない");
  assert.strictEqual(cfc.verifyPayCodeCF("4321", rec), true);
  assert.strictEqual(cfc.verifyPayCodeCF("0000", null), true);
  assert.strictEqual(cfc.verifyPayCodeCF("0000", rec), false);
  assert.strictEqual(cfc.verifyPayCodeCF("12a4", null), false);
  assert.strictEqual(cfc.PAY_CODE_DEFAULT, u.PAY_CODE_DEFAULT);
  ["0000", "1234"].forEach(c => assert.strictEqual(cfc.isValidPayCodeCF(c), u.isValidPayCode(c)));
  ["", "123", "12345", "１２３４", "12a4", 1234, null].forEach(c => assert.strictEqual(cfc.isValidPayCodeCF(c), u.isValidPayCode(c), String(c)));
  assert.strictEqual(u.payCodeIdentity(rec), rec.hash);
  assert.strictEqual(u.payCodeIdentity(null), "default");
});
test("P6a sha256HexOfBytes: crypto.subtle が無い環境の予備実装が Node の SHA-256 と一致する", () => {
  const crypto = require("node:crypto");
  const inputs = ["", "abc", "0000", "s1" + "4321", "あいう漢字", "x".repeat(55), "y".repeat(56), "z".repeat(64), "w".repeat(1000)];
  inputs.forEach(str => assert.strictEqual(u.sha256HexOfBytes(new TextEncoder().encode(str)), crypto.createHash("sha256").update(str, "utf8").digest("hex"), JSON.stringify(str.slice(0, 10))));
});
test("P6a パスコード: 5回失敗で60秒待たせ、成功で数え直す", () => {
  let st = { fails: 0, lockedUntil: 0 };
  for (let i = 0; i < 4; i++) st = u.nextPayCodeLockout(st, false, 1000);
  assert.deepStrictEqual(st, { fails: 4, lockedUntil: 0 });
  assert.strictEqual(u.payCodeWaitSec(st, 1000), 0);
  st = u.nextPayCodeLockout(st, false, 1000);
  assert.strictEqual(st.lockedUntil, 61000);
  assert.strictEqual(u.payCodeWaitSec(st, 1000), 60);
  assert.strictEqual(u.payCodeWaitSec(st, 60500), 1);
  assert.strictEqual(u.payCodeWaitSec(st, 61000), 0);
  assert.deepStrictEqual(u.nextPayCodeLockout({ fails: 3 }, true, 5), { fails: 0, lockedUntil: 0 });
  assert.strictEqual(u.PAY_UNLOCK_IDLE_MS, 600000, "10分無操作で伏せ直す");
});
test("P6a featureEnabled: 賃金などの新機能は Premium だけ・知らない機能は出さない", () => {
  assert.strictEqual(u.featureEnabled("pay", { plan: "premium" }), true);
  assert.strictEqual(u.featureEnabled("pay", { plan: "pro" }), false);
  assert.strictEqual(u.featureEnabled("pay", { plan: "free" }), false);
  assert.strictEqual(u.featureEnabled("pay", null), false);
  assert.strictEqual(u.featureEnabled("unknown", { plan: "premium" }), false);
  ["entity", "scheduled", "confirm", "actuals", "pay"].forEach(k => assert.ok(u.GATED_FEATURES.includes(k)));
});
test("P6a maskYen: 伏せると桁数も出さない", () => {
  assert.strictEqual(u.maskYen(213500, false), "••••");
  assert.strictEqual(u.maskYen(213500, true), "213,500円");
  assert.strictEqual(u.maskYen(null, true), "—");
});
test("P6a buildCompanyStaffRows: 賃金の置き場は所属店舗に登録されている名前（ヘルプ先だけの人は null）", () => {
  const rows = u.buildCompanyStaffRows([
    { id: "A", name: "A店", staff: ["田中"], settings: {}, periods: {} },
    { id: "B", name: "B店", staff: ["田中", "小林"], settings: { staffHomeShop: { "田中": "A", "小林": "A" } }, periods: {} },
  ], null, "2026-09-30");
  const t = rows.find(r => r.name === "田中"), k = rows.find(r => r.name === "小林");
  assert.deepStrictEqual([t.payShopId, t.payName], ["A", "田中"]);
  assert.deepStrictEqual([k.payShopId, k.payName], [null, null]);
});

// ===== P1b 人物ID（personId）と企業スタッフ一覧の編集（2026-09-30・労務給与_複数法人_実装計画.md §3.8）=====
const cfp = require("../functions/company-config.js");
// CF の readCompanyRegs（functions/index.js）と同じ形で、店舗の配列から登録（店舗×名前）を作る
const p1bRegs = shops => {
  const regs = [];
  shops.forEach(s => {
    const st = s.settings || {};
    (s.staff || []).filter(n => typeof n === "string" && n && !n.startsWith("__spacer__")).forEach(name => {
      const h = (st.staffHomeShop || {})[name], num = (st.staffNumbers || {})[name];
      regs.push({ shopId: s.id, name, entityId: s.entityId || "", homeShopId: typeof h === "string" && h ? h : s.id, number: String(num == null ? "" : num).trim() });
    });
  });
  return regs;
};
// Firebase の update（パス＝値・null で削除・空になったノードは消える）を JS オブジェクトに当てる
const p1bApply = (obj, patch) => {
  const out = JSON.parse(JSON.stringify(obj || {}));
  Object.keys(patch || {}).forEach(k => {
    const ks = k.split("/"); let n = out;
    for (let i = 0; i < ks.length - 1; i++) { if (!n[ks[i]] || typeof n[ks[i]] !== "object") n[ks[i]] = {}; n = n[ks[i]]; }
    if (patch[k] === null) delete n[ks[ks.length - 1]]; else n[ks[ks.length - 1]] = JSON.parse(JSON.stringify(patch[k]));
  });
  const prune = o => { Object.keys(o).forEach(k => { if (o[k] && typeof o[k] === "object") { prune(o[k]); if (!Object.keys(o[k]).length) delete o[k]; } }); return o; };
  return prune(out);
};
const p1bNorm = v => { const o = JSON.parse(JSON.stringify(v)); const prune = x => { if (x && typeof x === "object") Object.keys(x).forEach(k => { prune(x[k]); if (x[k] && typeof x[k] === "object" && !Array.isArray(x[k]) && !Object.keys(x[k]).length) delete x[k]; }); return x; }; return prune(o); };
const p1bSeq = () => { let i = 0; return n => Array.from({ length: n }, () => (i++ * 7) % 256); };

test("P1b 改名の後始末: CF の名前キー一覧がクライアントと一致する（書き写しのドリフト検出）", () => {
  assert.deepStrictEqual(cfp.STAFF_KEYED_SETTING_MAPS_CF, u.STAFF_KEYED_SETTING_MAPS);
  assert.deepStrictEqual(cfp.STAFF_KEYED_PRIVATE_NODES_CF, u.STAFF_KEYED_PRIVATE_NODES);
});
test("P1b 改名の後始末: settings の差分パッチを当てた結果が renameStaffInSettings と一致する", () => {
  const cases = [
    { staffColors: { "田中": "red", "佐藤": "black" }, staffAttributes: { "田中": "employee" }, staffNumbers: { "田中": "12" }, staffPositions: { "田中": ["k"] },
      staffAliases: { "田中": ["たなか"] }, staffWorkplaces: { "田中": ["S2"] }, staffHidden: { "田中": [{ from: "2026-04-01", to: null }] },
      paidLeaveGranted: { "田中": 10 }, staffHomeShop: { "田中": "S2" }, overtimeSettings: { byStaff: { "田中": { lunch: 15, dinner: 0 } } }, xlShopName: "A" },
    { staffColors: { "佐藤": "red" } },
    {},
    { overtimeSettings: { byStaff: { "佐藤": { lunch: 0 } } }, staffAttributes: { "田中": "parttime" } },
  ];
  cases.forEach((st, i) => {
    const patched = p1bApply(st, cfp.renameStaffSettingsPatch(st, "田中", "田中 太郎"));
    assert.deepStrictEqual(p1bNorm(patched), p1bNorm(u.renameStaffInSettings(st, "田中", "田中 太郎")), "ケース" + i);
  });
  assert.deepStrictEqual(cfp.renameStaffSettingsPatch({ staffColors: { "佐藤": "red" } }, "田中", "X"), {}, "無いキーは作らない");
});
test("P1b 改名の後始末: periods の差分パッチ（フィールド単位）を当てた結果が renameStaffInPeriods と一致する", () => {
  const periods = {
    p1: { id: "p1", startDate: "2026-04-01", keepStaff: [{ name: "田中", index: 0 }, { name: "佐藤", index: 1 }], keepAttrs: { "田中": "employee" },
      laborTotals: { "田中": { workMin: 600, paid: 1 } }, snapshot: { staffList: ["田中", "佐藤"], settings: { staffAttributes: { "田中": "employee" } } } },
    p2: { id: "p2", startDate: "2026-05-01", keepStaff: { 0: { name: "田中", index: 0 } }, snapshot: { staffList: ["佐藤"], settings: { staffNumbers: { "田中": "12" } } } },
    p3: { id: "p3", startDate: "2026-06-01", snapshot: { staffList: ["佐藤"], settings: {} } },
    p4: { id: "p4", startDate: "2026-07-01", keepStaff: [{ name: "田中", index: 0 }, { name: "田中 太郎", index: 1 }] },
  };
  const patch = cfp.renameStaffPeriodsPatch(periods, "田中", "田中 太郎");
  assert.ok(!Object.keys(patch).some(k => k.startsWith("p3/")), "関係の無い期間には書かない");
  assert.ok(Object.keys(patch).every(k => k.split("/").length === 2), "期間のフィールド単位（期間を丸ごと set しない）");
  const expected = u.renameStaffInPeriods(Object.values(periods), "田中", "田中 太郎").periods;
  const got = p1bApply(periods, patch);
  expected.forEach(p => assert.deepStrictEqual(p1bNorm(got[p.id]), p1bNorm(p), p.id));
});
test("P1b 改名の後始末: private/pay・subs・staff の差分", () => {
  const pay = { "田中": { payType: "hourly", base: 1200 } };
  assert.deepStrictEqual(cfp.renameStaffPayPatch(pay, "田中", "田中 太郎"), u.renameStaffInPay(pay, "田中", "田中 太郎"));
  assert.strictEqual(cfp.renameStaffPayPatch(pay, "佐藤", "X"), u.renameStaffInPay(pay, "佐藤", "X"));
  const subs = { a: { staffName: "田中", periodId: "p1" }, b: { staffName: "佐藤" }, c: { staffName: "田中", periodId: "p_old" } };
  assert.deepStrictEqual(cfp.renameStaffSubsPatch(subs, "田中", "田中 太郎"), { "a/staffName": "田中 太郎", "c/staffName": "田中 太郎" }, "3ヶ月の窓の外の期間も含めて全件");
  assert.deepStrictEqual(cfp.renameStaffListCF(["田中", "__spacer__1", "佐藤"], "田中", "田中 太郎"), ["田中 太郎", "__spacer__1", "佐藤"]);
});
test("P1b 改名の検証: StaffTab と同じ規則（空・同名・重複・禁止文字・他人の別名）", () => {
  const staff = ["田中", "佐藤"], st = { staffAliases: { "佐藤": ["さとう"], "田中": ["たなか"] } };
  assert.strictEqual(cfp.validateStaffRename(staff, st, "田中", "田中 太郎"), null);
  assert.ok(cfp.validateStaffRename(staff, st, "田中", " "));
  assert.ok(cfp.validateStaffRename(staff, st, "田中", "田中"));
  assert.ok(cfp.validateStaffRename(staff, st, "田中", "佐藤"));
  assert.ok(cfp.validateStaffRename(staff, st, "田中", "田.中"));
  assert.ok(/佐藤 さんの別名/.test(cfp.validateStaffRename(staff, st, "田中", "さとう")));
  assert.strictEqual(cfp.validateStaffRename(staff, st, "田中", "たなか"), null, "自分の別名への改名は許す（StaffTab の aliasOwnerOf と同じ）");
  assert.ok(cfp.validateStaffRename(staff, st, "山田", "山田 花子"), "店舗に居ない名前は改名できない");
  // 禁止文字の集合はクライアントの firebaseKeyForbiddenChars と同じ
  [".", "#", "$", "/", "[", "]", "\u0001", "\u007f"].forEach(c => assert.strictEqual(!!cfp.validateStaffRename(["a"], {}, "a", "b" + c), u.firebaseKeyForbiddenChars("b" + c).length > 0, JSON.stringify(c)));
});
test("P1b 同一人物の推定: CF の groupStaffRegsCF がクライアントの groupStaffRegs と一致する（ドリフト検出）", () => {
  const regs = [
    { shopId: "A", name: "田中", entityId: "E1", number: "12", homeShopId: "A" },
    { shopId: "B", name: "田中 太郎", entityId: "E1", number: "12", homeShopId: "B" },
    { shopId: "C", name: "田中 次郎", entityId: "E2", number: "12", homeShopId: "C" },
    { shopId: "B", name: "小林", entityId: "E1", number: "", homeShopId: "A" },
    { shopId: "A", name: "小林", entityId: "E1", number: "A7", homeShopId: "A" },
    { shopId: "A", name: "鈴木", entityId: "E1", number: "A7", homeShopId: "A" },
    { shopId: "C", name: "森", entityId: "", number: " 40 ", homeShopId: "C" },
    { shopId: "D", name: "森 花子", entityId: "", number: "40", homeShopId: "D" },
  ];
  assert.deepStrictEqual(cfp.groupStaffRegsCF(regs), u.groupStaffRegs(regs));
  assert.deepStrictEqual(u.groupStaffRegs(regs), [[0, 1], [2], [3, 4], [5], [6, 7]]);
  // 乱数の登録でも一致する
  let seed = 7; const rnd = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  for (let t = 0; t < 30; t++) {
    const rs = Array.from({ length: 12 }, () => ({ shopId: "S" + rnd(3), name: "N" + rnd(5), entityId: "E" + rnd(2), number: ["", "1", "2", "3A"][rnd(4)], homeShopId: "S" + rnd(3) }));
    assert.deepStrictEqual(cfp.groupStaffRegsCF(rs), u.groupStaffRegs(rs), "乱数" + t);
  }
});
test("P1b personId: 数字だけの番号はその番号・それ以外と別法人との衝突は p_ 自動採番（キー禁止文字を含まない）", () => {
  const gen = () => cfp.genPersonAutoId(p1bSeq());
  assert.strictEqual(cfp.personIdFor("1042", new Set(), gen), "1042");
  assert.strictEqual(cfp.personIdFor(" 012 ", new Set(), gen), "012", "先頭の0は残す（「012」と「12」は別の番号）");
  assert.ok(/^p_[A-Za-z0-9]{8}$/.test(cfp.personIdFor("1042", new Set(["1042"]), gen)), "既に使われていれば自動採番");
  assert.ok(/^p_/.test(cfp.personIdFor("A7", new Set(), gen)));
  assert.ok(/^p_/.test(cfp.personIdFor("", new Set(), gen)));
  assert.ok(/^p_/.test(cfp.personIdFor("123456789012345678901", new Set(), gen)), "21桁以上は番号にしない");
  // 自動採番は全バイト値で英数字だけ（genSecureId と違って記号を含まない）
  for (let b = 0; b < 256; b++) {
    const id = cfp.genPersonAutoId(n => Array(n).fill(b));
    assert.ok(cfp.isValidPersonId(id) && u.firebaseKeyForbiddenChars(id).length === 0, id);
  }
  assert.strictEqual(String(cfp.PERSON_ID_RE), String(u.PERSON_ID_RE), "クライアントと同じ形");
});

const P1B_SHOPS = [
  { id: "A1", name: "A店", entityId: "E1", staff: ["田中", "小林", "鈴木"], settings: { staffNumbers: { "田中": "12", "鈴木": "A7" } }, periods: {} },
  { id: "B1", name: "B店", entityId: "E1", staff: ["田中 太郎", "小林", "高橋"], settings: { staffNumbers: { "田中 太郎": "12" }, staffHomeShop: { "小林": "A1" } }, periods: {} },
  { id: "C1", name: "C店", entityId: "E2", staff: ["田中 次郎", "伊藤"], settings: { staffNumbers: { "田中 次郎": "12", "伊藤": "5" } }, periods: {} },
];
const p1bInit = () => { const seq = p1bSeq(); return cfp.planPeopleSync(null, p1bRegs(P1B_SHOPS), () => cfp.genPersonAutoId(seq), "T0"); };
test("P1b 人物の自動生成: 既存の推定と同じまとまりで作り、一覧の見た目が変わらない", () => {
  const { patch, created } = p1bInit();
  const people = p1bApply({}, patch);
  assert.strictEqual(created.length, Object.keys(people).length);
  assert.strictEqual(people["12"].displayName, "田中 太郎");
  assert.deepStrictEqual(people["12"].links, { A1: "田中", B1: "田中 太郎" }, "同じ法人の番号12は1人");
  assert.strictEqual(people["12"].entityId, "E1");
  const jiro = Object.keys(people).find(id => people[id].links.C1 === "田中 次郎");
  assert.ok(/^p_/.test(jiro), "別法人で番号12が衝突した側だけ自動採番");
  assert.strictEqual(people[jiro].number, "12");
  assert.strictEqual(people["5"].links.C1, "伊藤");
  const kob = Object.keys(people).find(id => people[id].links.A1 === "小林");
  assert.deepStrictEqual(people[kob].links, { A1: "小林", B1: "小林" }, "ヘルプ先の登録は所属店舗の人物に");
  // 一覧: people で束ねた行と推定だけの行が、人物IDと links 以外で一致する
  const strip = rows => rows.map(r => { const o = { ...r }; delete o.personId; delete o.key; delete o.links; return o; })
    .sort((a, b) => (a.shopId + a.name).localeCompare(b.shopId + b.name));
  const before = u.buildCompanyStaffRows(P1B_SHOPS, null, "2026-09-30");
  const after = u.buildCompanyStaffRows(P1B_SHOPS, null, "2026-09-30", people);
  assert.deepStrictEqual(strip(after), strip(before));
  assert.ok(after.every(r => r.personId), "全員に人物IDが付く");
  assert.strictEqual(cfp.planPeopleSync(people, p1bRegs(P1B_SHOPS), () => "p_zzzzzzzz", "T1").patch, null, "2回目は何もしない（冪等）");
});
test("P1b 人物の同期: 未リンクの登録だけを拾う（推定で1人につながれば足す・店舗側の改名は番号で同じ人物へ戻す）", () => {
  const people = p1bApply({}, p1bInit().patch);
  // C店に田中 太郎のヘルプ登録（所属 B店）を足す → 人物12へ
  const shops2 = JSON.parse(JSON.stringify(P1B_SHOPS));
  shops2[2].staff.push("田中 太郎"); shops2[2].settings.staffHomeShop = { "田中 太郎": "B1" };
  const r1 = cfp.planPeopleSync(people, p1bRegs(shops2), () => "p_newnewne", "T1");
  assert.deepStrictEqual(r1.created, []);
  assert.strictEqual(r1.patch["12/links/C1"], "田中 太郎");
  // 店舗側（StaffTab）で伊藤→伊藤 一郎に改名（staffNumbers も移る）→ 同じ人物5へ戻す
  const shops3 = JSON.parse(JSON.stringify(P1B_SHOPS));
  shops3[2].staff = ["田中 次郎", "伊藤 一郎"]; shops3[2].settings.staffNumbers = { "田中 次郎": "12", "伊藤 一郎": "5" };
  const r2 = cfp.planPeopleSync(people, p1bRegs(shops3), () => "p_newnewne", "T1");
  assert.deepStrictEqual(r2.created, [], "新しい人物を作らない＝personId が変わらない");
  assert.strictEqual(r2.patch["5/links/C1"], "伊藤 一郎");
  assert.strictEqual(r2.patch["5/displayName"], "伊藤 一郎");
  // 番号の無い新人は新しい人物
  const shops4 = JSON.parse(JSON.stringify(P1B_SHOPS)); shops4[0].staff.push("新人");
  const r3 = cfp.planPeopleSync(people, p1bRegs(shops4), () => "p_newnewne", "T1");
  assert.deepStrictEqual(r3.created, ["p_newnewne"]);
  assert.deepStrictEqual(r3.patch.p_newnewne.links, { A1: "新人" });
});
test("P1b 統合・統合解除: 企業側の束ね方だけを変え、解除した登録は同期で再びまとめない", () => {
  let people = p1bApply({}, p1bInit().patch);
  const suz = Object.keys(people).find(id => people[id].links.A1 === "鈴木");
  const tak = Object.keys(people).find(id => people[id].links.B1 === "高橋");
  const m = cfp.planMergePeople(people, suz, tak, "T2");
  people = p1bApply(people, m.patch);
  assert.strictEqual(people[tak], undefined);
  assert.deepStrictEqual(people[suz].links, { A1: "鈴木", B1: "高橋" });
  assert.strictEqual(people[suz].number, "A7", "残す方の番号");
  assert.ok(people[suz].mergedFrom[tak], "統合の履歴");
  const rows = u.buildCompanyStaffRows(P1B_SHOPS, null, "2026-09-30", people);
  assert.strictEqual(rows.filter(r => r.personId === suz).length, 1, "2人が1行になる");
  assert.strictEqual(rows.length, u.buildCompanyStaffRows(P1B_SHOPS, null, "2026-09-30").length - 1);
  assert.ok(cfp.planMergePeople(people, "12", suz, "T2").error, "同じ店舗に別の登録名があれば統合できない");
  assert.ok(cfp.planMergePeople(people, suz, suz, "T2").error);
  // 統合解除: 12 から B店の田中 太郎を切り出す。同じ法人で同じ番号なので新しい人物は番号を持たない
  const sp = cfp.planSplitPerson(people, "12", { shopId: "B1", name: "田中 太郎", entityId: "E1", number: "12" }, () => "p_splitaaa", "T3");
  people = p1bApply(people, sp.patch);
  assert.strictEqual(sp.newId, "p_splitaaa");
  assert.deepStrictEqual(people["12"].links, { A1: "田中" });
  assert.strictEqual(people["12"].displayName, "田中");
  assert.strictEqual(people.p_splitaaa.number, undefined);
  // 文字の番号は重複にしないので、切り出した人物にもそのまま残る（2026-10-02）
  const hk = { H: { displayName: "コ", entityId: "E1", number: "派遣", links: { A1: "コ", B1: "コ" } } };
  const sp2 = cfp.planSplitPerson(hk, "H", { shopId: "B1", name: "コ", entityId: "E1", number: "派遣" }, () => "p_splitbbb", "T3");
  assert.strictEqual(sp2.patch.p_splitbbb.number, "派遣");
  assert.strictEqual(cfp.planPeopleSync(people, p1bRegs(P1B_SHOPS), () => "p_x", "T4").patch, null, "推定では同じ人でも、解除した登録は再びまとめない");
  assert.ok(cfp.planSplitPerson(people, "12", { shopId: "A1", name: "田中" }, () => "p_x", "T").error, "登録が1つだけなら切り出せない");
  // その人物につながっていない店舗（CF は links[shopId] を名前にするので undefined になる）は拒否する。
  // 以前は undefined どうしの一致でガードを素通りし、undefined 入りの patch を返していた（バグチェック#156）
  const two = { P: { displayName: "田中", links: { A1: "田中", C1: "田中" } } };
  assert.strictEqual(cfp.planSplitPerson(two, "P", { shopId: "B1", name: two.P.links.B1 }, () => "p_x", "T").error, "この人物につながっていない登録です");
});
// ===== 「統合しない」（別人として記録・2026-09-30）=====
// 記録は people/{id}/distinct/{相手}=ISO時刻。両方向に書く。期待値は指示書の規則からの手書き（実装の出力から逆生成していない）
const DIS_P = () => ({
  p_aaaaaaaa: { displayName: "タオ", links: { S1: "タオ" } },
  p_bbbbbbbb: { displayName: "タオ", links: { S2: "タオ" } },
  "12": { displayName: "タオ", links: { S3: "タオ" } },
});
test("統合しない: planMarkDistinct は全ペアを両方向に書く（2人は2キー・3人は3ペア6キー）・不正は error", () => {
  const two = cfp.planMarkDistinct(DIS_P(), ["p_aaaaaaaa", "p_bbbbbbbb"], "T1");
  assert.deepStrictEqual(two.patch, { "p_aaaaaaaa/distinct/p_bbbbbbbb": "T1", "p_bbbbbbbb/distinct/p_aaaaaaaa": "T1" });
  const three = cfp.planMarkDistinct(DIS_P(), ["p_aaaaaaaa", "p_bbbbbbbb", "12"], "T1");
  assert.deepStrictEqual(three.patch, {
    "p_aaaaaaaa/distinct/p_bbbbbbbb": "T1", "p_bbbbbbbb/distinct/p_aaaaaaaa": "T1",
    "p_aaaaaaaa/distinct/12": "T1", "12/distinct/p_aaaaaaaa": "T1",
    "p_bbbbbbbb/distinct/12": "T1", "12/distinct/p_bbbbbbbb": "T1",
  });
  const people = p1bApply(DIS_P(), three.patch);
  assert.ok(cfp.isDistinctPair(people, "12", "p_aaaaaaaa") && cfp.isDistinctPair(people, "p_bbbbbbbb", "12"));
  assert.ok(cfp.planMarkDistinct(DIS_P(), ["p_aaaaaaaa"], "T").error, "1人だけ");
  assert.ok(cfp.planMarkDistinct(DIS_P(), ["p_aaaaaaaa", "p_aaaaaaaa"], "T").error, "同一人物");
  assert.ok(cfp.planMarkDistinct(DIS_P(), ["p_aaaaaaaa", "bad/id"], "T").error, "不正なID");
  assert.ok(cfp.planMarkDistinct(DIS_P(), ["p_aaaaaaaa", "99"], "T").error, "存在しない人物");
  assert.ok(cfp.planMarkDistinct(DIS_P(), "p_aaaaaaaa", "T").error, "配列でない");
});
test("統合しない: planUnmarkDistinct は両方向を null にし、isDistinctPair は一方向の記録でも true", () => {
  const one = { ...DIS_P(), p_aaaaaaaa: { ...DIS_P().p_aaaaaaaa, distinct: { p_bbbbbbbb: "T1" } } };
  assert.strictEqual(cfp.isDistinctPair(one, "p_aaaaaaaa", "p_bbbbbbbb"), true);
  assert.strictEqual(cfp.isDistinctPair(one, "p_bbbbbbbb", "p_aaaaaaaa"), true, "逆向きから見ても記録あり");
  assert.strictEqual(cfp.isDistinctPair(one, "p_aaaaaaaa", "12"), false);
  assert.strictEqual(cfp.isDistinctPair(one, "p_aaaaaaaa", "p_aaaaaaaa"), false);
  const r = cfp.planUnmarkDistinct(one, "p_aaaaaaaa", "p_bbbbbbbb");
  assert.deepStrictEqual(r.patch, { "p_aaaaaaaa/distinct/p_bbbbbbbb": null, "p_bbbbbbbb/distinct/p_aaaaaaaa": null });
  assert.strictEqual(cfp.isDistinctPair(p1bApply(one, r.patch), "p_aaaaaaaa", "p_bbbbbbbb"), false);
  // 相手が消えた人物でも記録を消せる
  const gone = { p_aaaaaaaa: { links: { S1: "タオ" }, distinct: { p_zzzzzzzz: "T1" } } };
  assert.deepStrictEqual(p1bApply(gone, cfp.planUnmarkDistinct(gone, "p_aaaaaaaa", "p_zzzzzzzz").patch), { p_aaaaaaaa: { links: { S1: "タオ" } } });
  assert.ok(cfp.planUnmarkDistinct(one, "p_aaaaaaaa", "p_aaaaaaaa").error);
  assert.ok(cfp.planUnmarkDistinct(one, "99", "p_aaaaaaaa").error, "起点の人物が無い");
});
test("統合しない: 統合は keep/drop 間の記録を消し、drop の記録を keep へ引き継ぎ、drop を指す第三者を keep へ付け替える", () => {
  const P = {
    p_keepkeep: { displayName: "リン", links: { S1: "リン" }, distinct: { p_dropdrop: "T0" } },
    p_dropdrop: { displayName: "リン", links: { S2: "リン" }, distinct: { p_keepkeep: "T0", p_thirdabc: "T0", p_fourthab: "T0" } },
    p_thirdabc: { displayName: "リン", links: { S3: "リン" }, distinct: { p_dropdrop: "T0" } },
    p_fourthab: { displayName: "リン", links: { S4: "リン" } }, // 一方向だけ（drop 側だけが記録）
  };
  const m = cfp.planMergePeople(P, "p_keepkeep", "p_dropdrop", "T9");
  assert.strictEqual(m.patch["p_keepkeep/distinct/p_dropdrop"], null, "keep/drop 間の記録を消す");
  assert.strictEqual(m.patch["p_keepkeep/distinct/p_thirdabc"], "T0", "drop の記録を引き継ぐ（時刻もそのまま）");
  assert.strictEqual(m.patch["p_keepkeep/distinct/p_fourthab"], "T0");
  assert.strictEqual(m.patch["p_thirdabc/distinct/p_dropdrop"], null, "第三者の drop への記録を外す");
  assert.strictEqual(m.patch["p_thirdabc/distinct/p_keepkeep"], "T9", "第三者は keep を指す");
  assert.strictEqual(m.patch["p_fourthab/distinct/p_dropdrop"], undefined, "drop を指していない人は触らない");
  const after = p1bApply(P, m.patch);
  assert.strictEqual(after.p_dropdrop, undefined);
  assert.deepStrictEqual(after.p_keepkeep.distinct, { p_thirdabc: "T0", p_fourthab: "T0" });
  assert.deepStrictEqual(after.p_thirdabc.distinct, { p_keepkeep: "T9" });
  assert.ok(cfp.isDistinctPair(after, "p_keepkeep", "p_fourthab"));
  // 記録の無い統合では distinct のキーを1つも足さない（従来の patch と同じ）
  const plain = cfp.planMergePeople(DIS_P(), "p_aaaaaaaa", "p_bbbbbbbb", "T9");
  assert.deepStrictEqual(Object.keys(plain.patch).filter(k => k.includes("/distinct/")), []);
  // パスが重ならない（Firebase の multi-path update は祖先・子孫の重なりを拒否する）
  const keys = Object.keys(m.patch);
  keys.forEach(a => keys.forEach(b => assert.ok(a === b || !b.startsWith(a + "/"), a + " と " + b + " が重なる")));
});
test("統合しない: 切り出しは元の人物と両方向に記録し、ID の振り直しは他人の記録を新しい ID へ付け替える", () => {
  const P = { "12": { displayName: "タム", number: "12", entityId: "E1", links: { S1: "タム", S2: "タム" } }, p_otherabc: { links: { S3: "タム" }, distinct: { p_movemove: "T0" } },
    p_movemove: { displayName: "タム", number: "77", links: { S4: "タム" }, distinct: { p_otherabc: "T0" } } };
  const sp = cfp.planSplitPerson(P, "12", { shopId: "S2", name: "タム", entityId: "E1", number: "12" }, () => "p_splitaaa", "T3");
  assert.deepStrictEqual(sp.patch.p_splitaaa.distinct, { "12": "T3" });
  assert.strictEqual(sp.patch["12/distinct/p_splitaaa"], "T3");
  const keys = Object.keys(sp.patch);
  keys.forEach(a => keys.forEach(b => assert.ok(a === b || !b.startsWith(a + "/"), a + " と " + b + " が重なる")));
  assert.ok(cfp.isDistinctPair(p1bApply(P, sp.patch), "12", "p_splitaaa"));
  const re = cfp.planReassignPersonId(P, "p_movemove");
  assert.strictEqual(re.newId, "77");
  assert.strictEqual(re.patch["p_otherabc/distinct/p_movemove"], null);
  assert.strictEqual(re.patch["p_otherabc/distinct/77"], "T0");
  const after = p1bApply(P, re.patch);
  assert.ok(cfp.isDistinctPair(after, "p_otherabc", "77") && !after.p_otherabc.distinct.p_movemove);
});
test("P1b 従業員番号は法人内で一意（保存時の衝突検出）・ID の振り直しは明示操作", () => {
  const people = p1bApply({}, p1bInit().patch);
  const regs = p1bRegs(P1B_SHOPS);
  const suz = Object.keys(people).find(id => people[id].links.A1 === "鈴木");
  assert.deepStrictEqual(cfp.staffNumberConflict(people, regs, "E1", "12", suz), { personId: "12" }, "同じ法人の別人");
  assert.strictEqual(cfp.staffNumberConflict(people, regs, "E1", "12", "12"), null, "自分自身とは衝突しない");
  assert.strictEqual(cfp.staffNumberConflict(people, regs, "E1", "5", suz), null, "別法人の同じ番号は衝突しない");
  assert.strictEqual(cfp.staffNumberConflict(people, regs, "E1", "", suz), null);
  // 人物に番号が無くても、店舗の登録にその番号があれば衝突（未リンクの登録も見る）
  const regs2 = [...regs, { shopId: "A1", name: "新人", entityId: "E1", number: "99", homeShopId: "A1" }];
  assert.deepStrictEqual(cfp.staffNumberConflict(people, regs2, "E1", "99", suz), { shopId: "A1", name: "新人" });
  // 数字だけでない番号は重複の判定から外す（2026-10-02 ユーザー指示。「派遣」「外部」などは区分の印として多くの人に付く）
  const regs3 = [...regs, { shopId: "A1", name: "派遣A", entityId: "E1", number: "派遣", homeShopId: "A1" }, { shopId: "A1", name: "鈴木", entityId: "E1", number: "A7", homeShopId: "A1" }];
  const p3 = { ...people, p_hakenaaa: { displayName: "派遣B", entityId: "E1", number: "派遣", links: { A1: "派遣B" } } };
  assert.strictEqual(cfp.staffNumberConflict(p3, regs3, "E1", "派遣", suz), null, "人物にも店舗の登録にも同じ文字の番号があっても重複にしない");
  assert.strictEqual(cfp.staffNumberConflict(p3, regs3, "E1", "A7", "12"), null, "数字と文字の混ざった番号も判定しない");
  assert.strictEqual(cfp.staffNumberConflict(p3, regs3, "E1", " 12 ", suz) && true, true, "前後の空白を除いた数字は判定する");
  const jiro = Object.keys(people).find(id => people[id].links.C1 === "田中 次郎");
  assert.ok(cfp.planReassignPersonId(people, jiro).error, "番号の ID が別の人物に使われていれば振り直せない");
  const p2 = { ...people, [jiro]: { ...people[jiro], number: "77" } };
  const r = cfp.planReassignPersonId(p2, jiro);
  assert.strictEqual(r.newId, "77");
  assert.strictEqual(r.patch[jiro], null);
  assert.deepStrictEqual(r.patch["77"].links, people[jiro].links);
  assert.ok(cfp.planReassignPersonId(people, suz).error, "数字だけでない番号（A7）は振り直せない");
});
test("P1b ドリフト検出: companyRenameStaff が名前キーの後始末をすべて通り、クライアントが新しい CF を呼べる", () => {
  const fs = require("node:fs");
  const idx = fs.readFileSync(require("node:path").join(__dirname, "..", "functions", "index.js"), "utf8");
  const body = idx.slice(idx.indexOf("exports.companyRenameStaff"), idx.indexOf("exports.companyUpdateStaff"));
  ["renameStaffListCF(", "renameStaffSettingsPatch(", "renameStaffSubsPatch(", "renameStaffPeriodsPatch(", "renameStaffPayPatch(", "validateStaffRename("]
    .forEach(f => assert.ok(body.includes(f), "companyRenameStaff が " + f + " を通っていない"));
  // private の名前キーノードを足したら、CF の改名もそのノードを読むこと
  u.STAFF_KEYED_PRIVATE_NODES.forEach(n => assert.ok(body.includes("private/" + n), "private/" + n + " を移していない"));
  assert.ok(!/\.ref\(`shops\/\$\{sid\}\/(periods|subs|settings)`\)\.set\(/.test(body), "periods・subs・settings を全体 set() しない");
  const main = fs.readFileSync(require("node:path").join(__dirname, "..", "app-main.js"), "utf8");
  ["ensureCompanyPeople", "mergePeople", "splitPerson", "reassignPersonId", "companyRenameStaff", "companyUpdateStaff", "markPeopleDistinct"]
    .forEach(n => { assert.ok(idx.includes("exports." + n + " "), n + " が CF に無い"); assert.ok(new RegExp('COMPANY_ENTITY_CFS=\\[[^\\]]*"' + n + '"').test(main), n + " を callCompanyCF が通さない"); });
});

// ===== P2 年間所定労働時間と月の所定上限（労務給与_複数法人_実装計画.md §3.3・§6 P2）=====
// 期待値は計画書 §3.3 と設定メモ（31日 199h／30日 193h／2月 182h）からの転記。実装の出力から逆生成していない。
test("P2 所定上限: 2,080h で 31/30/28日・うるう年2月 = 176:39／170:57／159:33／164:48", () => {
  const ls = { laborSettings: { annualScheduledMin: HM(2080, 0) } };
  assert.strictEqual(u.laborMonthFrame(ls, "2026-10").scheduledCapMin, HM(176, 39), "31日");
  assert.strictEqual(u.laborMonthFrame(ls, "2026-11").scheduledCapMin, HM(170, 57), "30日");
  assert.strictEqual(u.laborMonthFrame(ls, "2027-02").scheduledCapMin, HM(159, 33), "28日");
  assert.strictEqual(u.laborMonthFrame(ls, "2028-02-15").scheduledCapMin, HM(164, 48), "うるう年2月（その暦年は366日）");
  assert.strictEqual(u.yearDaysOf(2028), 366);
  assert.strictEqual(u.yearDaysOf(2100), 365);
  assert.strictEqual(u.yearDaysOf(2000), 366);
});
test("P2 目安: 年間所定を設定すると所定上限 + 固定残業 − 余裕（31日 199h／30日 193h／2月 182h）。総枠は変えない", () => {
  const ls = { laborSettings: { annualScheduledMin: HM(2080, 0) } };
  assert.strictEqual(u.laborMonthFrame(ls, "2026-10").guideMin, HM(199, 0));
  assert.strictEqual(u.laborMonthFrame(ls, "2026-11").guideMin, HM(193, 0));
  assert.strictEqual(u.laborMonthFrame(ls, "2027-02").guideMin, HM(182, 0));
  // 総枠（残業予定の基準）は年間所定に関係なく従来どおり。上限は F4（2026-10-01）から所定上限基準（下のテスト）
  assert.strictEqual(u.laborMonthFrame(ls, "2026-10").baseMin, HM(177, 8));
});
// ===== F4 上限と「所定未満」を所定基準にする（シフトひな型2026-10版_取り込みと差分_実装計画.html 第3部 F4・D10）=====
// 期待値はひな型（2026-10-01版）の値: 年2,080h・31日で 所定176:39／目安199／上限206（= ROUNDDOWN(所定 + 固定残業30h)）。
// 30日・28日の上限は同じ式の手計算（170:57+30h=200:57→200:00、159:33+30h=189:33→189:00）。実装の出力から逆生成していない。
test("F4 上限: 年間所定 2,080h・2026年10月で 所定176:39・目安199・上限206（ひな型の値）", () => {
  const ls = { laborSettings: { annualScheduledMin: HM(2080, 0) } };
  const f = u.laborMonthFrame(ls, "2026-10");
  assert.strictEqual(f.scheduledCapMin, 10599, "所定 176:39");
  assert.strictEqual(f.guideMin, HM(199, 0), "目安 199h");
  assert.strictEqual(f.capMin, HM(206, 0), "上限 206h（176:39+30h=206:39 の時間未満切り捨て）");
  assert.strictEqual(u.laborMonthFrame(ls, "2026-11").capMin, HM(200, 0), "30日");
  assert.strictEqual(u.laborMonthFrame(ls, "2027-02").capMin, HM(189, 0), "28日");
  // 固定残業を変えても同じ式（0 なら所定上限の時間未満切り捨て）
  assert.strictEqual(u.laborMonthFrame({ laborSettings: { annualScheduledMin: HM(2080, 0), fixedOvertimeMin: 0 } }, "2026-10").capMin, HM(176, 0));
  assert.strictEqual(u.monthlyCapMinFor(HM(177, 8), 10599, HM(30, 0)), HM(206, 0));
  assert.strictEqual(u.monthlyCapMinFor(HM(177, 8), 0, HM(30, 0)), HM(207, 8), "所定上限0なら総枠＋固定残業");
});
test("F4 上限: 年間所定が無い・0 なら capMin は 総枠 + 固定残業 のまま（207:08）", () => {
  [{}, { laborSettings: { annualScheduledMin: 0 } }, null].forEach(s => {
    assert.strictEqual(u.laborMonthFrame(s, "2026-10").capMin, HM(207, 8));
    assert.strictEqual(u.laborMonthFrame(s, "2026-10").capMin, u.monthlyCapMin(u.laborMonthFrame(s, "2026-10").baseMin, HM(30, 0)));
  });
});
test("F4 目安の確認: 年間所定があるとき「所定未満」は所定上限 176:39、「みなし超」は上限 206h と比べる", () => {
  const base = u.monthlyBaseMin(HM(40, 0), 31), fix = HM(30, 0), guide = HM(199, 0), sched = 10599;
  const g = w => u.guideStatusOf(w, base, fix, guide, sched);
  // 176:00 < 176:39 → 所定未満 あと ROUNDUP(0.65,2)=0.65h
  assert.deepStrictEqual({ k: g(HM(176, 0)).key, l: g(HM(176, 0)).label }, { k: "under_base", l: "所定未満 あと0.65h" });
  // 177:00 は総枠 177:08 未満だが所定 176:39 以上 → 目安未満（以前の基準なら所定未満だった）
  assert.deepStrictEqual({ k: g(HM(177, 0)).key, l: g(HM(177, 0)).label }, { k: "under_guide", l: "目安未満 あと22h" });
  assert.strictEqual(u.guideStatusOf(HM(177, 0), base, fix, guide).key, "under_base", "所定上限を渡さなければ従来の総枠比較");
  // 206:30 は上限 206h 超 → みなし超 0.5h（以前の上限 207:08 なら OK だった）
  assert.deepStrictEqual({ k: g(HM(206, 30)).key, l: g(HM(206, 30)).label }, { k: "over", l: "みなし超 0.5h" });
  assert.strictEqual(u.guideStatusOf(HM(206, 30), base, fix, guide).key, "ok", "所定上限を渡さなければ従来の上限 207:08");
  // 205:00 → OK 上限まで1h
  assert.deepStrictEqual({ k: g(HM(205, 0)).key, l: g(HM(205, 0)).label }, { k: "ok", l: "OK 上限まで1h" });
  assert.strictEqual(g(0).key, "none");
  // 0 を渡すと省略と同じ
  [HM(170, 0), HM(190, 0), HM(205, 0), HM(210, 0)].forEach(w =>
    assert.deepStrictEqual(u.guideStatusOf(w, base, fix, guide, 0), u.guideStatusOf(w, base, fix, guide)));
});
test("F4 ドリフト検出: シフト作成タブの目安は laborMonthFrame の所定上限を guideStatusOf に渡す", () => {
  const fs = require("node:fs"), path = require("node:path");
  const src = fs.readFileSync(path.join(__dirname, "..", "app-shift.js"), "utf8");
  assert.ok(/guideStatusOf\(monthWorkMin,laborFrame\.baseMin,ls\.fixedOvertimeMin,laborFrame\.guideMin,laborFrame\.scheduledCapMin\)/.test(src));
});
test("P2 未設定: 年間所定が無い・0 なら所定上限は0、目安・総枠・上限は S-1 と完全に同じ値", () => {
  [{}, { laborSettings: { annualScheduledMin: 0 } }, { laborSettings: { annualScheduledMin: "x" } }, null].forEach(s => {
    ["2026-08", "2026-09", "2026-02", "2028-02"].forEach(ym => {
      const f = u.laborMonthFrame(s, ym);
      const b = u.monthlyBaseMin(HM(40, 0), u.daysInMonthOf(ym));
      assert.strictEqual(f.scheduledCapMin, 0);
      assert.strictEqual(f.baseMin, b);
      assert.strictEqual(f.guideMin, u.monthlyGuideMin(b, HM(30, 0), HM(7, 0), HM(3, 0)), `${ym} の目安`);
      assert.strictEqual(f.capMin, u.monthlyCapMin(b, HM(30, 0)));
    });
  });
  assert.strictEqual(u.laborMonthFrame({}, "2026-08").guideMin, HM(200, 0), "S-1 の 31日目安 200h のまま");
});
test("P2 分母: 0（未設定）なら年間所定÷12 を 0.1h 単位で切り捨て（2,080h → 173.3h＝10398分）。年間所定も無ければ 10398", () => {
  assert.strictEqual(u.rateDenominatorMinOf({ annualScheduledMin: HM(2080, 0) }), 10398);
  assert.strictEqual(u.rateDenominatorMinOf({ annualScheduledMin: HM(2080, 0), rateDenominatorMin: 0 }), 10398);
  assert.strictEqual(u.rateDenominatorMinOf({ annualScheduledMin: HM(2085, 0) }), 10422, "2,085h ÷ 12 = 173.75h → 173.7h");
  assert.strictEqual(u.rateDenominatorMinOf({ annualScheduledMin: HM(2080, 0), rateDenominatorMin: 10500 }), 10500, "分母を入れればその値");
  assert.strictEqual(u.rateDenominatorMinOf({ annualScheduledMin: 0 }), 10398);
  assert.strictEqual(u.rateDenominatorMinOf(u.laborSettingsOf({})), 10398, "既定の労務設定は分母 173.3h");
});
test("P2 労務設定: 新キー4つの既定値と範囲（週の起算 0〜6・月をまたぐ週 0/1）", () => {
  const d = u.laborSettingsOf({});
  assert.strictEqual(d.annualScheduledMin, 0);
  assert.strictEqual(d.rateDenominatorMin, 0);
  assert.strictEqual(d.weekStartDow, 1);
  assert.strictEqual(d.weekSplitAtMonthEdge, 1);
  assert.strictEqual(u.laborSettingsOf({ laborSettings: { weekStartDow: 0 } }).weekStartDow, 0, "日曜起算");
  assert.strictEqual(u.laborSettingsOf({ laborSettings: { weekStartDow: 7 } }).weekStartDow, 1, "範囲外は既定");
  assert.strictEqual(u.laborSettingsOf({ laborSettings: { weekStartDow: 2.5 } }).weekStartDow, 1, "小数は既定");
  assert.strictEqual(u.laborSettingsOf({ laborSettings: { weekSplitAtMonthEdge: 0 } }).weekSplitAtMonthEdge, 0);
  assert.strictEqual(u.laborSettingsOf({ laborSettings: { weekSplitAtMonthEdge: 2 } }).weekSplitAtMonthEdge, 1);
  assert.strictEqual(u.laborSettingsOf({ laborSettings: { annualScheduledMin: 124800 } }).annualScheduledMin, 124800);
});
test("P2 CF: 新キー4つを企業・法人の設定として受け、範囲外を捨てる（クライアントと同じ範囲）", () => {
  const r = cfc.sanitizeCompanySettings({ laborSettings: { annualScheduledMin: 124800, rateDenominatorMin: 10398, weekStartDow: 0, weekSplitAtMonthEdge: 1 } });
  assert.deepStrictEqual(r.laborSettings, { annualScheduledMin: 124800, rateDenominatorMin: 10398, weekStartDow: 0, weekSplitAtMonthEdge: 1 });
  const bad = cfc.sanitizeCompanySettings({ laborSettings: { weekStartDow: 7, weekSplitAtMonthEdge: 2, annualScheduledMin: -1, fiscalYearStartMonth: 4 } });
  assert.deepStrictEqual(bad.laborSettings, { fiscalYearStartMonth: 4 });
  assert.deepStrictEqual(cfc.sanitizeCompanySettings({ laborSettings: { weekStartDow: 1.5 } }), {});
  // 範囲の書き写しがクライアントと一致する（fiscalYearStartMonth は CF 側だけが範囲で捨てる既存の規則）
  Object.keys(u.LABOR_SETTING_RANGES).forEach(k => assert.deepStrictEqual(cfc.COMPANY_LABOR_RANGES[k], u.LABOR_SETTING_RANGES[k], k));
  // クライアントが範囲外として捨てる値は CF も捨てる（逆も同じ）
  [-1, 0, 1, 2, 6, 7, 0.5].forEach(v => ["weekStartDow", "weekSplitAtMonthEdge"].forEach(k => {
    const cfKeeps = (cfc.sanitizeCompanySettings({ laborSettings: { [k]: v } }).laborSettings || {})[k] !== undefined;
    const clKeeps = u.laborSettingsOf({ laborSettings: { [k]: v } })[k] === v;
    assert.strictEqual(cfKeeps, clKeeps, `${k}=${v}`);
  }));
});
test("P2 写し: 企業共通→法人の順で年間所定・分母・週の起算が店舗の写しに焼かれ、店舗の目安と分母に効く", () => {
  const pub = {
    name: "テスト企業", shops: { S1: true }, defaultEntityId: "E1", shopEntities: { S1: "E2" },
    config: { settings: cfc.sanitizeCompanySettings({ laborSettings: { annualScheduledMin: HM(2000, 0), weekStartDow: 0 } }) },
    entities: { E1: { name: "既定" }, E2: { name: "法人B", settings: cfc.sanitizeCompanySettings({ laborSettings: { annualScheduledMin: HM(2080, 0) } }) } },
  };
  const m = cfc.buildShopMirror("C1", pub, "S1", { S1: "A店" }, "t");
  assert.deepStrictEqual(m.settings.laborSettings, { annualScheduledMin: HM(2080, 0), weekStartDow: 0 }, "法人の年間所定が勝ち、企業の週の起算は残る");
  const eff = u.applyCompanySettings({ laborSettings: { annualScheduledMin: HM(1000, 0), marginMin: 420 } }, m.settings);
  assert.strictEqual(u.laborMonthFrame(eff, "2026-10").scheduledCapMin, HM(176, 39));
  assert.strictEqual(u.laborMonthFrame(eff, "2026-10").guideMin, HM(199, 0));
  assert.strictEqual(u.laborSettingsOf(eff).weekStartDow, 0);
  assert.strictEqual(u.rateDenominatorMinOf(u.laborSettingsOf(eff)), 10398);
  const keys = u.companyControlledKeys(m.settings);
  assert.ok(keys.labor.has("annualScheduledMin") && keys.labor.has("weekStartDow") && !keys.labor.has("rateDenominatorMin"));
  assert.ok(!("annualScheduledMin" in u.stripCompanySettings(eff, m.settings).laborSettings), "企業が決めた年間所定は店舗に保存しない");
});

// ===== P3 人×月の所定・確定ロック・交付（労務給与_複数法人_実装計画.md §3.4・§3.5・§6 P3）=====
// 期待値は手で数えた値（10:00-15:00＝300分、9:00-18:00 休憩60分＝480分など）。実装の出力から逆生成していない。
const p3Half1 = { id: "p1", startDate: "2026-11-01", endDate: "2026-11-15", label: "11月前半" };
const p3Half2 = { id: "p2", startDate: "2026-11-16", endDate: "2026-11-30", label: "11月後半" };
const p3Subs = [
  { id: "s1", periodId: "p1", staffName: "田中", shifts: {
    "2026-11-02": { status: "work", start: "10:00", end: "15:00" },
    "2026-11-03": { status: "holiday" },
  } },
  { id: "s2", periodId: "p2", staffName: "田中", shifts: {
    "2026-11-20": { status: "work", adjustedStart: "09:00", adjustedEnd: "18:00", adjustedBreak: 60 },
    "2026-12-01": { status: "work", start: "10:00", end: "15:00" },
  } },
  { id: "s3", periodId: "p2", staffName: "たなか", shifts: { "2026-11-25": { status: "work", start: "10:00", end: "12:00" } } },
];
const p3Settings = { staffAliases: { "田中": ["たなか"] } };

test("P3 状態: 未提出 → 提出済み → 確定済み → 交付済み（交付は確定が無ければ数えない）", () => {
  assert.strictEqual(u.periodStateOf({ id: "p" }), "pending");
  assert.strictEqual(u.periodStateOf({ id: "p", submission: { at: "t" } }), "submitted");
  assert.strictEqual(u.periodStateOf({ id: "p", submission: { at: "t" }, confirmation: { at: "t2" } }), "confirmed");
  assert.strictEqual(u.periodStateOf({ id: "p", confirmation: { at: "t2" }, delivery: { at: "t3" } }), "delivered");
  assert.strictEqual(u.periodStateOf({ id: "p", delivery: { at: "t3" } }), "pending", "確定の無い交付の記録は状態に数えない");
  assert.strictEqual(u.isPeriodConfirmed({ lockedAt: "2026-09-01T00:00:00Z", snapshot: {} }), false, "旧 lockedAt は確定ではない");
});
test("P3 確定できるセッション: 連携店舗は企業セッション（同じ企業）だけ・単独店舗はオーナー", () => {
  assert.strictEqual(u.canConfirmPeriod({ companyLinkId: "C1", sessionCompanyId: "C1" }), true);
  assert.strictEqual(u.canConfirmPeriod({ companyLinkId: "C1", sessionCompanyId: "C2" }), false);
  assert.strictEqual(u.canConfirmPeriod({ companyLinkId: "C1", sessionCompanyId: null }), false, "店舗のオーナーでも企業セッションでなければ確定できない");
  assert.strictEqual(u.canConfirmPeriod({ companyLinkId: null }), true, "単独店舗はオーナーが確定");
  assert.strictEqual(u.canConfirmPeriod({ companyLinkId: null, ownerReadOnly: true }), false);
  assert.strictEqual(u.canConfirmPeriod({ companyLinkId: "C1", sessionCompanyId: "C1", ownerReadOnly: true }), false);
});
test("P3 resolvePeriodMaster: 確定した期間は終了前でも写しを使う（未確定の終了前は現在値）", () => {
  const snap = { staffList: ["田中", "佐藤"], settings: { staffAttributes: { "佐藤": "employee" } } };
  const live = u.resolvePeriodMaster({ ...p3Half1, snapshot: snap }, ["田中"], {}, "2026-11-05");
  assert.strictEqual(live.locked, false);
  assert.deepStrictEqual(live.staffList, ["田中"]);
  const locked = u.resolvePeriodMaster({ ...p3Half1, snapshot: snap, confirmation: { at: "2026-11-05T00:00:00Z" } }, ["田中"], {}, "2026-11-05");
  assert.strictEqual(locked.locked, true);
  assert.deepStrictEqual(locked.staffList, ["田中", "佐藤"]);
  assert.strictEqual(locked.settings.staffAttributes["佐藤"], "employee");
});
test("P3 履歴: 期間の差分書き込みは履歴を記録1件ずつ書き、他の端末の記録を上書きしない", () => {
  const e1 = { kind: "submit", at: "2026-11-10T00:00:00Z", byUid: "u1" };
  const e2 = { kind: "confirm", at: "2026-11-11T00:00:00Z", byUid: "u2" };
  assert.deepStrictEqual(u.diffPeriodsForFlatWrite([{ id: "p1" }], [{ id: "p1", history: { a: e1 } }]), { "p1/history/a": e1 });
  assert.deepStrictEqual(u.diffPeriodsForFlatWrite([{ id: "p1", history: { a: e1 } }], [{ id: "p1", history: { a: e1, b: e2 } }]), { "p1/history/b": e2 });
  assert.deepStrictEqual(u.diffPeriodsForFlatWrite([{ id: "p1", history: { a: e1 } }], [{ id: "p1", history: { a: e1 } }]), {});
  assert.deepStrictEqual(u.periodHistoryList({ history: { b: e2, a: e1 } }).map(x => x.kind), ["submit", "confirm"], "時刻順");
  assert.deepStrictEqual(u.periodHistoryList({ history: { a: { kind: "bogus", at: "t" } } }), [], "知らない種類は出さない");
  assert.ok(/^h[0-9a-z]+$/.test(u.genPeriodHistoryKey(Date.parse("2026-11-10T00:00:00Z"))), "Firebase のキーに使えない文字を含まない");
});
test("P3 所定の自動集計: 休憩控除後・別名の提出も合算・休みと月外の日は数えない", () => {
  const r = u.aggregateScheduledMonth({ subs: p3Subs, names: ["田中", "__spacer__1", "佐藤"], settings: p3Settings, ym: "2026-11" });
  // 11/2 300分 ＋ 11/20 480分（9-18 から休憩60分）＋ 11/25 120分（別名たなか）= 900分・3日
  assert.deepStrictEqual(r["田中"], { days: 3, min: 900 });
  assert.deepStrictEqual(r["佐藤"], { days: 0, min: 0 });
  assert.ok(!("__spacer__1" in r), "空白列は集計しない");
  assert.deepStrictEqual(u.aggregateScheduledMonth({ subs: p3Subs, names: ["田中"], settings: p3Settings, ym: "2026-12" })["田中"], { days: 1, min: 300 });
});
test("P3 確定: 写し・確定・履歴を書き lockedAt を消す。前半だけでは月を凍結せず、後半の確定で月全体を凍結する", () => {
  const legacy = { ...p3Half1, lockedAt: "2026-10-01T00:00:00Z" };
  const r1 = u.planPeriodConfirmation({ period: legacy, periods: [legacy, p3Half2], subs: p3Subs, staffList: ["田中"], settings: p3Settings,
    laborMonths: {}, todayStr: "2026-11-10", uid: "company_C1", nowIso: "2026-11-10T09:00:00Z", historyKey: "h1" });
  assert.deepStrictEqual(r1.period.confirmation, { at: "2026-11-10T09:00:00Z", byUid: "company_C1" });
  assert.strictEqual(r1.period.lockedAt, undefined);
  assert.deepStrictEqual(r1.period.snapshot.staffList, ["田中"], "確定の瞬間に写しを書く");
  assert.deepStrictEqual(r1.period.history.h1, { kind: "confirm", at: "2026-11-10T09:00:00Z", byUid: "company_C1" });
  assert.deepStrictEqual(r1.months, ["2026-11"]);
  assert.deepStrictEqual(r1.laborMonthsPatch, { "2026-11/田中": { days: 3, min: 900, auto: { days: 3, min: 900 } } }, "後半が未確定なので凍結しない");
  const lm = { "2026-11": { "田中": r1.laborMonthsPatch["2026-11/田中"] } };
  const r2 = u.planPeriodConfirmation({ period: p3Half2, periods: [r1.period, p3Half2], subs: p3Subs, staffList: ["田中"], settings: p3Settings,
    laborMonths: lm, todayStr: "2026-11-30", uid: "company_C1", nowIso: "2026-11-30T09:00:00Z", historyKey: "h2" });
  assert.deepStrictEqual(r2.laborMonthsPatch["2026-11/田中"], { days: 3, min: 900, auto: { days: 3, min: 900 }, frozenAt: "2026-11-30T09:00:00Z", frozenBy: "company_C1" });
  assert.ok(u.planPeriodConfirmation({ period: r1.period, periods: [], subs: [], staffList: [], settings: {}, todayStr: "2026-11-10" }).error, "確定済みは二重に確定しない");
});
test("P3 確定: 手修正した所定は確定で上書きせず、自動集計だけ更新する。終了済みの期間は既存の写しを残す", () => {
  const lm = { "2026-11": { "田中": { days: 10, min: 4800, auto: { days: 1, min: 300 } } } };
  const ended = { ...p3Half1, snapshot: { staffList: ["田中", "退職者"], settings: { staffAliases: { "田中": ["たなか"] } } } }; // 写しの設定で集計する（別名も写しから）
  const r = u.planPeriodConfirmation({ period: ended, periods: [ended, p3Half2], subs: p3Subs, staffList: ["田中"], settings: p3Settings,
    laborMonths: lm, todayStr: "2026-12-05", uid: "u", nowIso: "2026-12-05T00:00:00Z", historyKey: "h" });
  assert.deepStrictEqual(r.period.snapshot.staffList, ["田中", "退職者"], "終了時点で凍結した写しを確定する");
  assert.deepStrictEqual(r.laborMonthsPatch["2026-11/田中"], { days: 10, min: 4800, auto: { days: 3, min: 900 } });
  assert.deepStrictEqual(r.laborMonthsPatch["2026-11/退職者"], { days: 0, min: 0, auto: { days: 0, min: 0 } });
});
test("P3 凍結の条件: 月の全日が期間に入り、その月の期間がすべて確定済み", () => {
  const c = p => ({ ...p, confirmation: { at: "t" } });
  assert.strictEqual(u.isMonthFullyConfirmed([c(p3Half1)], "2026-11"), false, "後半の期間がまだ無い");
  assert.strictEqual(u.isMonthFullyConfirmed([c(p3Half1), p3Half2], "2026-11"), false);
  assert.strictEqual(u.isMonthFullyConfirmed([c(p3Half1), c(p3Half2)], "2026-11"), true);
  assert.strictEqual(u.isMonthFullyConfirmed([c({ id: "m", startDate: "2026-11-01", endDate: "2026-11-30" })], "2026-11"), true);
});
test("P3 解除と交付: 解除は確定・交付を外して凍結を解き履歴に理由を残す。交付は確定済みだけ", () => {
  const conf = { ...p3Half1, confirmation: { at: "t1", byUid: "u" }, delivery: { at: "t2", byUid: "u" }, history: { a: { kind: "confirm", at: "t1", byUid: "u" } } };
  const lm = { "2026-11": { "田中": { days: 3, min: 900, auto: { days: 3, min: 900 }, frozenAt: "t1", frozenBy: "u" }, "佐藤": { days: 1, min: 60 } } };
  const r = u.planPeriodUnconfirm({ period: conf, laborMonths: lm, uid: "u2", nowIso: "2026-11-12T00:00:00Z", historyKey: "b", note: "所定の直し" });
  assert.strictEqual(r.period.confirmation, undefined);
  assert.strictEqual(r.period.delivery, undefined);
  assert.deepStrictEqual(r.period.history.b, { kind: "unconfirm", at: "2026-11-12T00:00:00Z", byUid: "u2", note: "所定の直し" });
  assert.ok(r.period.history.a, "以前の履歴は残す");
  assert.deepStrictEqual(r.laborMonthsPatch, { "2026-11/田中/frozenAt": null, "2026-11/田中/frozenBy": null });
  assert.ok(u.planPeriodDelivery({ period: p3Half1 }).error, "未確定は交付できない");
  const d = u.planPeriodDelivery({ period: conf, uid: "u3", nowIso: "2026-11-13T00:00:00Z", historyKey: "c", method: "LINE" });
  assert.deepStrictEqual(d.period.delivery, { at: "2026-11-13T00:00:00Z", byUid: "u3", method: "LINE" });
  assert.deepStrictEqual(d.period.history.c, { kind: "deliver", at: "2026-11-13T00:00:00Z", byUid: "u3", method: "LINE" });
});
// ===== 第2部 E3: 従業員画面への公開 =====
test("E3 公開: 公開・取り下げは published と履歴だけを差分で書く。二重の公開・未公開の取り下げは拒否", () => {
  const r = u.planPeriodPublish({ period: p3Half1, uid: "OWN", nowIso: "2026-11-01T00:00:00Z", historyKey: "k1" });
  assert.deepStrictEqual(r.period.published, { at: "2026-11-01T00:00:00Z", byUid: "OWN" });
  assert.deepStrictEqual(r.period.history.k1, { kind: "publish", at: "2026-11-01T00:00:00Z", byUid: "OWN" });
  assert.strictEqual(u.isPeriodPublished(r.period), true);
  assert.strictEqual(u.isPeriodPublished(p3Half1), false);
  assert.deepStrictEqual(u.diffPeriodsForFlatWrite([p3Half1, p3Half2], [r.period, p3Half2]),
    { "p1/published": { at: "2026-11-01T00:00:00Z", byUid: "OWN" }, "p1/history/k1": { kind: "publish", at: "2026-11-01T00:00:00Z", byUid: "OWN" } },
    "期間まるごとではなく published と履歴1件だけ（他の期間に触らない）");
  assert.ok(u.planPeriodPublish({ period: r.period }).error, "公開済みは二重に公開しない");
  const un = u.planPeriodUnpublish({ period: r.period, uid: "OWN", nowIso: "2026-11-02T00:00:00Z", historyKey: "k2" });
  assert.strictEqual(un.period.published, undefined);
  assert.deepStrictEqual(u.diffPeriodsForFlatWrite([r.period], [un.period]),
    { "p1/published": null, "p1/history/k2": { kind: "unpublish", at: "2026-11-02T00:00:00Z", byUid: "OWN" } });
  assert.ok(u.planPeriodUnpublish({ period: p3Half1 }).error, "公開していない期間は取り下げられない");
  assert.ok(u.planPeriodPublish({ period: null }).error);
});
test("E3 公開: 確定は未公開なら同時に公開する。公開済みなら at を変えない。確定の解除では公開を外さない", () => {
  const c = u.planPeriodConfirmation({ period: p3Half1, periods: [p3Half1], subs: p3Subs, staffList: ["田中"], settings: p3Settings,
    laborMonths: {}, todayStr: "2026-11-10", uid: "company_C1", nowIso: "2026-11-10T09:00:00Z", historyKey: "h1", publishHistoryKey: "h1p" });
  assert.deepStrictEqual(c.period.published, { at: "2026-11-10T09:00:00Z", byUid: "company_C1" });
  assert.deepStrictEqual(c.period.history.h1p, { kind: "publish", at: "2026-11-10T09:00:00Z", byUid: "company_C1", method: "confirm" });
  assert.deepStrictEqual(c.period.history.h1, { kind: "confirm", at: "2026-11-10T09:00:00Z", byUid: "company_C1" }, "確定の記録はそのまま");
  const pub = { ...p3Half1, published: { at: "2026-11-01T00:00:00Z", byUid: "OWN" } };
  const c2 = u.planPeriodConfirmation({ period: pub, periods: [pub], subs: p3Subs, staffList: ["田中"], settings: p3Settings,
    laborMonths: {}, todayStr: "2026-11-10", uid: "company_C1", nowIso: "2026-11-10T09:00:00Z", historyKey: "h1" });
  assert.deepStrictEqual(c2.period.published, { at: "2026-11-01T00:00:00Z", byUid: "OWN" }, "先に公開していればその記録を残す");
  assert.deepStrictEqual(Object.keys(c2.period.history), ["h1"], "公開の履歴は足さない");
  const un = u.planPeriodUnconfirm({ period: c.period, laborMonths: {}, uid: "company_C1", nowIso: "2026-11-11T00:00:00Z", historyKey: "h2", note: "直し" });
  assert.deepStrictEqual(un.period.published, { at: "2026-11-10T09:00:00Z", byUid: "company_C1" }, "解除しても黒文字のまま");
  assert.strictEqual(u.isPeriodConfirmed(un.period), false);
});
test("E3 履歴の種類: どの種類にも表示名があり、公開・取り下げが履歴の一覧に出る", () => {
  u.PERIOD_HISTORY_KINDS.forEach(k => assert.ok(typeof u.PERIOD_HISTORY_LABELS[k] === "string" && u.PERIOD_HISTORY_LABELS[k], k));
  assert.deepStrictEqual(Object.keys(u.PERIOD_HISTORY_LABELS).sort(), [...u.PERIOD_HISTORY_KINDS].sort(), "表示名だけの種類が無い");
  const p = { history: { a: { kind: "publish", at: "1" }, b: { kind: "unpublish", at: "2" } } };
  assert.deepStrictEqual(u.periodHistoryList(p).map(x => x.kind), ["publish", "unpublish"]);
});
test("E3 featureEnabled: myShift は Premium だけ", () => {
  assert.ok(u.GATED_FEATURES.includes("myShift"));
  assert.strictEqual(u.featureEnabled("myShift", { plan: "premium" }), true);
  ["pro", "free", undefined].forEach(pl => assert.strictEqual(u.featureEnabled("myShift", { plan: pl }), false, String(pl)));
});
test("E3 公開ボタンの入口: 入口のゲート・Premium・オーナー・非表示マウント除外を通り、公開と取り下げは planPeriodPublish / planPeriodUnpublish を savePeriods で書く", () => {
  const fs = require("node:fs"), path = require("node:path");
  const shift = fs.readFileSync(process.env.SHIFTY_SHIFT_SRC || path.join(__dirname, "..", "app-shift.js"), "utf8");
  const m = shift.match(/const canPublish=([^;]+);/);
  assert.ok(m, "canPublish の定義");
  ["MY_SCREEN_ENABLED", "savePeriods", "!ownerReadOnly", "!exportJob", 'featureEnabled("myShift"'].forEach(t => assert.ok(m[1].includes(t), t));
  assert.ok(/planPeriodPublish\(\{period,uid:curUid\(\)\}\)[\s\S]{0,120}savePeriods\(periods\.map/.test(shift), "公開は savePeriods（差分 update）で書く");
  assert.ok(/planPeriodUnpublish\(\{period,uid:curUid\(\)\}\)[\s\S]{0,120}savePeriods\(periods\.map/.test(shift), "取り下げも savePeriods");
  assert.ok(!/fbSet\([^)]*periods/.test(shift), "periods を set しない");
});
test("P3 手修正（10月分の遡り登録を含む）: 凍結前だけ・値の範囲を検査する", () => {
  const r = u.planLaborMonthManual({ laborMonths: {}, ym: "2026-10", name: "田中", days: 22, min: HM(176, 30), auto: { days: 21, min: HM(170, 0) } });
  assert.deepStrictEqual(r.patch, { "2026-10/田中": { days: 22, min: HM(176, 30), auto: { days: 21, min: HM(170, 0) } } });
  assert.ok(u.planLaborMonthManual({ laborMonths: { "2026-10": { "田中": { frozenAt: "t" } } }, ym: "2026-10", name: "田中", days: 1, min: 60 }).error);
  assert.ok(u.planLaborMonthManual({ laborMonths: {}, ym: "2026-13", name: "田中", days: 1, min: 60 }).error);
  assert.ok(u.planLaborMonthManual({ laborMonths: {}, ym: "2026-10", name: "田中", days: 32, min: 60 }).error);
  assert.ok(u.planLaborMonthManual({ laborMonths: {}, ym: "2026-10", name: "a/b", days: 1, min: 60 }).error);
  assert.strictEqual(u.isLaborMonthEdited(r.patch["2026-10/田中"]), true);
  assert.strictEqual(u.isLaborMonthEdited({ days: 3, min: 900, auto: { days: 3, min: 900 } }), false);
  assert.strictEqual(u.parseHoursMinutes("176:39"), HM(176, 39));
  assert.strictEqual(u.parseHoursMinutes("170"), HM(170, 0));
  assert.strictEqual(u.parseHoursMinutes("1:60"), null);
  assert.strictEqual(u.fmtSignedMin(-12), "−0:12");
  assert.strictEqual(u.fmtSignedMin(80), "+1:20");
  assert.strictEqual(u.fmtSignedMin(0), "±0:00");
});
test("P3 改名・削除の後始末: laborMonths のキーが月ごとに移る（STAFF_KEYED_MONTH_NODES）", () => {
  assert.deepStrictEqual(u.STAFF_KEYED_MONTH_NODES, ["laborMonths"]);
  const lm = { "2026-10": { "田中": { days: 1, min: 60 }, "佐藤": { days: 2, min: 120 } }, "2026-11": { "田中": { days: 3, min: 180 } }, "2026-12": { "佐藤": { days: 1, min: 1 } } };
  assert.deepStrictEqual(u.renameStaffInLaborMonths(lm, "田中", "田中 太郎"), {
    "2026-10/田中 太郎": lm["2026-10"]["田中"], "2026-10/田中": null, "2026-11/田中 太郎": lm["2026-11"]["田中"], "2026-11/田中": null });
  assert.strictEqual(u.renameStaffInLaborMonths(lm, "鈴木", "鈴木 一郎"), null);
  assert.strictEqual(u.renameStaffInLaborMonths(lm, "田中", "田中"), null);
  assert.deepStrictEqual(u.dropStaffFromLaborMonths(lm, ["佐藤"]), { "2026-10/佐藤": null, "2026-12/佐藤": null });
  assert.strictEqual(u.dropStaffFromLaborMonths(lm, ["鈴木"]), null);
});
test("P3 年平均所定: 確定値・埋め値の月を平均し、読めない月は missing・期間の無い月は数えない", () => {
  const v = { "2026-04": HM(170, 0), "2026-05": null, "2026-07": HM(180, 0) };
  const r = u.yearScheduledAverage(["2026-04", "2026-05", "2026-06", "2026-07"], ym => v[ym]);
  assert.deepStrictEqual(r, { avgMin: HM(175, 0), count: 2, missing: ["2026-05"] });
  assert.deepStrictEqual(u.yearScheduledAverage(["2026-04"], () => undefined), { avgMin: null, count: 0, missing: [] });
});
test("P3 本部の固定勤務パターン: 土日祝と閉店日を除き、何も入っていない日だけに入れる", () => {
  // 2026-11-01(日) 02(月) 03(火・文化の日) 04(水) 05(木) 06(金) 07(土)
  const dates = ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07"];
  const settings = { weekdayCandidates: { 4: [{ closed: true }] } }; // 木曜は閉店日
  const subs = [{ id: "x", periodId: "hp", staffName: "田中", shopId: "S", shifts: { "2026-11-04": { status: "holiday" } } }];
  let n = 0;
  const r = u.fillFixedPattern({ subs, periodId: "hp", shopId: "S", names: ["田中", "佐藤"], dates, start: "09:00", end: "18:00", breakMin: 60,
    settings, genId: () => "new" + (n++), nowIso: "2026-11-01T00:00:00Z" });
  assert.strictEqual(r.dates, 3, "対象日は 11/2・11/4・11/6");
  assert.strictEqual(r.filled, 5, "田中 2日（11/4 は休み希望があるので入れない）＋佐藤 3日");
  const tanaka = r.subs.find(s => s.staffName === "田中");
  assert.deepStrictEqual(Object.keys(tanaka.shifts).sort(), ["2026-11-02", "2026-11-04", "2026-11-06"]);
  assert.deepStrictEqual(tanaka.shifts["2026-11-04"], { status: "holiday" });
  const sato = r.subs.find(s => s.staffName === "佐藤");
  assert.strictEqual(sato.source, "grid");
  assert.strictEqual(u.calcNetWorkMinutes(sato.shifts["2026-11-02"], u.getBreaksFor({}, "2026-11-02", "佐藤", sato.shifts["2026-11-02"]), 0, {}), 480, "9:00-18:00・休憩60分＝8時間");
  assert.strictEqual(subs[0].shifts["2026-11-02"], undefined, "元の配列は書き換えない");
  const again = u.fillFixedPattern({ subs: r.subs, periodId: "hp", names: ["田中", "佐藤"], dates, start: "09:00", end: "18:00", breakMin: 60, settings });
  assert.strictEqual(again.filled, 0, "押し直しても入っている日は上書きしない");
});
test("P3 改名の後始末（CF）: laborMonths の一覧と差分パッチがクライアントと一致し、companyRenameStaff が laborMonths を移す", () => {
  const fs = require("node:fs");
  assert.deepStrictEqual(cfp.STAFF_KEYED_MONTH_NODES_CF, u.STAFF_KEYED_MONTH_NODES);
  const cases = [
    { "2026-10": { "田中": { days: 1, min: 60 }, "佐藤": { days: 2, min: 120 } }, "2026-11": { "田中": { days: 3, min: 180, frozenAt: "t" } } },
    { "2026-10": { "佐藤": { days: 2, min: 120 } } },
    {},
  ];
  cases.forEach(lm => {
    assert.deepStrictEqual(cfp.renameStaffLaborMonthsPatch(lm, "田中", "田中 太郎"), u.renameStaffInLaborMonths(lm, "田中", "田中 太郎"));
    const patch = u.renameStaffInLaborMonths(lm, "田中", "田中 太郎");
    if (patch) {
      const after = p1bApply(lm, patch);
      Object.keys(lm).forEach(ym => { if (lm[ym]["田中"]) assert.deepStrictEqual(after[ym]["田中 太郎"], lm[ym]["田中"]); assert.ok(!(after[ym] || {})["田中"]); });
    }
  });
  const idx = fs.readFileSync(require("node:path").join(__dirname, "..", "functions", "index.js"), "utf8");
  const body = idx.slice(idx.indexOf("exports.companyRenameStaff"), idx.indexOf("exports.companyUpdateStaff"));
  u.STAFF_KEYED_MONTH_NODES.forEach(n => assert.ok(body.includes("shops/${sid}/" + n), n + " を移していない"));
  assert.ok(body.includes("renameStaffLaborMonthsPatch("), "companyRenameStaff が renameStaffLaborMonthsPatch を通っていない");
});
test("P3 ドリフト検出: ルール（laborMonths はオーナーのみ・確定済み期間の subs はオーナーだけ書ける）と改名・削除・確定の入口", () => {
  const fs = require("node:fs");
  const rules = JSON.parse(fs.readFileSync(require("node:path").join(__dirname, "..", "database.rules.json"), "utf8")).rules.shops.$shopId;
  const OWNER = "root.child('shops').child($shopId).child('owners').child(auth.uid).exists()";
  assert.ok(rules.laborMonths[".read"].includes(OWNER) && rules.laborMonths[".write"].includes(OWNER), "laborMonths はオーナーだけが読み書きする");
  assert.ok(!/^auth != null$/.test(rules.laborMonths[".read"]), "所定を auth != null で公開しない");
  const w = rules.subs.$subId[".write"];
  assert.ok(w.includes("demo-toriMatsu-v1") && w.includes(OWNER), "オーナーは確定済みでも書ける");
  assert.ok(w.includes("newData.child('periodId').val()") && w.includes("data.child('periodId').val()") && (w.match(/child\('confirmation'\)\.exists\(\)/g) || []).length === 2,
    "書き込み後と書き込み前（削除）の両方の期間の confirmation を見る");
  const admin = _readAdminSurface();
  const ren = admin.slice(admin.indexOf("onRenameStaff={(oldName,newName)=>{"));
  const renBody = ren.slice(0, ren.indexOf("tt(`✓ ${oldName} → ${newName} に変更しました`)"));
  assert.ok(/lm\.rename\(/.test(renBody), "改名で laborMonths を移していない");
  const sites = [];
  let i = -1;
  while ((i = admin.indexOf("=settingsWithoutStaff(", i + 1)) >= 0) sites.push(i);
  sites.forEach(at => assert.ok(admin.slice(at, at + 500).includes("lm.drop("), "settingsWithoutStaff の近くに lm.drop が無い"));
  const main = fs.readFileSync(require("node:path").join(__dirname, "..", "app-main.js"), "utf8");
  assert.ok(/renameStaffInLaborMonths\(/.test(main) && /dropStaffFromLaborMonths\(/.test(main));
  // セルのロック: グリッドの2つの input は確定で readOnly になり、写しの最新化は確定済みで止まる
  // （P3.6 で他店での勤務を出すセルも読み取り専用に足した。H2 でヘルプ先だけの日に絞った＝isHelperOnly。確定のロックはそのまま両方の input に掛かる）
  // S2（2026-10-04）でセルを部品（ShiftCell）に分けた: readOnly は cellPropsOf が1か所で決め、グリッドは出勤・退勤の
  // 2つのセルをどちらも cellPropsOf を通して描く（ShiftCell は受け取った readOnly をそのまま input に付ける）
  assert.ok(/readOnly:!canEditCells\|\|hDay,/.test(admin) && /const hDay=isHelperOnly\(name,date\);/.test(admin), "セルのロックが確定（canEditCells）とヘルプ先だけの日で決まっていない");
  assert.strictEqual((admin.match(/<ShiftCell \{\.\.\.cellPropsOf\(name,date,"(start|end)",di\)\}\/>/g) || []).length, 2);
  assert.ok(/const ShiftCell=React\.memo\(function ShiftCell\(/.test(admin) && /readOnly=\{readOnly\}/.test(admin));
  assert.ok(!/readOnly=\{!isPremium\}/.test(admin));
  assert.ok(/const snapSame=isPeriodConfirmed\(period\)\|\|periodSnapshotEqual\(/.test(admin));
  // 確定はシフト作成タブと提出状況表の2つの入口で、どちらも同じ planPeriodConfirmation を通る
  assert.ok((admin.match(/planPeriodConfirmation\(/g) || []).length >= 2);
});

// ===== P3.5b 残業予定の日割り（労務給与_複数法人_実装計画.md §3.9-2・§6 P3.5b）=====
// B制の日ごとの「しきい値超」（店舗トグル）と、属性の按分窓（月／半月＋固定枠）。値はすべて設定で、既定は従来どおり。
const OCT = Array.from({ length: 31 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`);
test("P3.5b B制の日ごとのしきい値超: 既定はオフ・しきい値は法定8h", () => {
  const ls = u.laborSettingsOf({});
  assert.strictEqual(ls.showDailyOverB, 0, "既定はオフ");
  assert.strictEqual(ls.dailyOverThresholdMin, u.LEGAL_DAILY_MIN);
  assert.strictEqual(u.laborSettingsOf({ laborSettings: { showDailyOverB: 2 } }).showDailyOverB, 0, "範囲外は既定へ");
  assert.strictEqual(u.laborSettingsOf({ laborSettings: { showDailyOverB: 1, dailyOverThresholdMin: 420 } }).dailyOverThresholdMin, 420);
  assert.deepStrictEqual(u.dailyOverMinB([540, 480, 600, 0], 480), [60, 0, 120, 0], "ちょうど8hは0");
  assert.deepStrictEqual(u.dailyOverMinB([540], 0), [60], "0以下のしきい値は法定8h");
  assert.strictEqual(u.dailyOverThresholdOf({ dailyOverThresholdMin: 0 }), u.LEGAL_DAILY_MIN);
});
test("P3.5b 按分窓: 設定の無い属性は従来の月按分と完全に同じ", () => {
  const mins = OCT.map((d, i) => (i % 3 === 0 ? 0 : 600));
  const base = 10628 * 31 / 31; // 値は任意（従来関数と同じ入力を渡して一致を見る）
  const plan = u.overtimePlanOf({ dates: OCT, dayMins: mins, baseMin: base, prorate: null });
  const tot = mins.reduce((a, b) => a + b, 0);
  const ot = u.monthlyOvertimeH(tot / 60, base / 60);
  assert.strictEqual(plan.monthOtH, ot);
  assert.deepStrictEqual(plan.dayOtH, u.prorateOvertimeH(mins.map(m => m / 60), ot, tot / 60));
  assert.strictEqual(plan.fixed, false);
  // 固定枠の無い半月は配る元が無いので月と同じ
  assert.deepStrictEqual(u.overtimePlanOf({ dates: OCT, dayMins: mins, baseMin: base, prorate: { window: "halfMonth" } }).dayOtH, plan.dayOtH);
  assert.deepStrictEqual(u.staffOtProrateOf({}, "田中"), { window: "month" });
});
test("P3.5b 按分窓: 半月15h（実働15h未満はその値）を各勤務日に実働比で按分する", () => {
  // 前半: 1〜10日に 8h×10日＝80h → 15h を 1.5h ずつ。後半: 20・21日に 6h×2日＝12h（15h 未満）→ 12h を 6h ずつ
  const mins = OCT.map((d, i) => (i < 10 ? 480 : (i === 19 || i === 20) ? 360 : 0));
  const p = u.overtimePlanOf({ dates: OCT, dayMins: mins, baseMin: 99999, prorate: { window: "halfMonth", fixedMin: 900 } });
  assert.deepStrictEqual(p.dayOtH.slice(0, 10), Array(10).fill(1.5), "前半は 15h を10日に");
  assert.deepStrictEqual(p.dayOtH.slice(10, 19), Array(9).fill(0));
  assert.strictEqual(p.dayOtH[19], 6); assert.strictEqual(p.dayOtH[20], 6);
  assert.strictEqual(p.monthOtH, 27, "月の残業予定は半月ずつの和");
  assert.strictEqual(p.window, "halfMonth"); assert.strictEqual(p.fixed, true);
  // 実働比: 前半に 4h と 12h の日があれば 15h を 1:3 で配る（累積の差分なので和は窓の値に一致）
  const m2 = OCT.map((d, i) => (i === 0 ? 240 : i === 1 ? 720 : 0));
  const p2 = u.overtimePlanOf({ dates: OCT, dayMins: m2, baseMin: 0, prorate: { window: "halfMonth", fixedMin: 900 } });
  assert.deepStrictEqual([p2.dayOtH[0], p2.dayOtH[1]], [3.75, 11.25]);
  // 月の窓＋固定枠: 月に 15h（実働が短ければ実働）
  const p3 = u.overtimePlanOf({ dates: OCT, dayMins: mins, baseMin: 0, prorate: { window: "month", fixedMin: 900 } });
  assert.strictEqual(p3.monthOtH, 15);
  assert.strictEqual(Math.round(p3.dayOtH.reduce((a, b) => a + b, 0) * 100) / 100, 15);
  // 属性の設定から引く（staffAttributes → staffTypeLimits[属性].otProrate）
  const st = { staffAttributes: { 田中: "co_AbCd1234" }, staffTypeLimits: { co_AbCd1234: { name: "特定技能", otProrate: { window: "halfMonth", fixedMin: 900 } } } };
  assert.deepStrictEqual(u.staffOtProrateOf(st, "田中"), { window: "halfMonth", fixedMin: 900 });
  assert.deepStrictEqual(u.staffOtProrateOf(st, "佐藤"), { window: "month" }, "属性の無い人は月");
});
test("P3.5b 按分窓は企業共通（法人上書き可）で効き、CF の検証と一致する", () => {
  const inputs = [null, "x", {}, { window: "week" }, { window: "month" }, { window: "halfMonth", fixedMin: 900 },
    { window: "halfMonth", fixedMin: -1 }, { window: "month", fixedMin: "600" }, { window: "halfMonth", fixedMin: 744 * 60 + 1 },
    { window: "halfMonth", fixedMin: 900.4, extra: 1 }];
  inputs.forEach(v => assert.deepStrictEqual(cfc.sanitizeOtProrate(v), u.otProrateOf(v), JSON.stringify(v)));
  assert.deepStrictEqual(cfc.COMPANY_OT_PRORATE_WINDOWS, u.OT_PRORATE_WINDOWS);
  assert.strictEqual(cfc.COMPANY_OT_PRORATE_FIXED_MAX_MIN, u.OT_PRORATE_FIXED_MAX_MIN);
  const cs = cfc.sanitizeCompanySettings({ staffTypeLimits: { parttime: { otProrate: { window: "halfMonth", fixedMin: 900 } } },
    laborSettings: { showDailyOverB: 1, dailyOverThresholdMin: 420 } });
  assert.deepStrictEqual(cs.staffTypeLimits.parttime.otProrate, { window: "halfMonth", fixedMin: 900 });
  assert.deepStrictEqual(cs.laborSettings, { showDailyOverB: 1, dailyOverThresholdMin: 420 });
  // 店舗の値より企業が勝ち、保存時には店舗側の同じキーを剥がす
  const shop = { staffTypeLimits: { parttime: { name: "パート", otProrate: { window: "month", fixedMin: 60 } } } };
  const eff = u.applyCompanySettings(shop, cs);
  assert.deepStrictEqual(eff.staffTypeLimits.parttime.otProrate, { window: "halfMonth", fixedMin: 900 });
  assert.ok(u.companyControlledKeys(cs).limits.parttime.has("otProrate"));
  assert.ok(!("otProrate" in u.stripCompanySettings(shop, cs).staffTypeLimits.parttime));
  // 法人の上書き（属性×キー単位で丸ごと置き換わる）
  const merged = cfc.mergeEntitySettings(cs, { staffTypeLimits: { parttime: { otProrate: { window: "month" } } } });
  assert.deepStrictEqual(merged.staffTypeLimits.parttime.otProrate, { window: "month" });
});

// ===== 応援・外部を B と同じ判定に（2026-10-03 ユーザー指示）=====
test("応援・外部: 属性の laborSystem:\"none\" は判定上 B・保存値は none・選択肢は A・B だけ・dispatch の名前は「応援・外部」", () => {
  const st = { staffAttributes: { "外部さん": "custom_ext", "バイト": "parttime", "派遣さん": "dispatch" },
    staffTypeLimits: { custom_ext: { name: "応援", laborSystem: "none" } } };
  // ① 判定用の読み手は B を返す（明示の none も組み込み dispatch の既定も）
  assert.strictEqual(u.laborSystemForStaff(st, "外部さん"), "B");
  assert.strictEqual(u.laborSystemForStaff(st, "派遣さん"), "B");
  assert.ok(u.LABOR_SYSTEMS.every(x => u.laborSystemOf({ staffTypeLimits: { c: { laborSystem: x } } }, "c") !== "none"), "判定用の読み手は none を返さない");
  // ② 保存値の関数は none を返す（設定の select・従業員番号の未設定の判定が使う）
  assert.strictEqual(u.laborSystemRawForStaff(st, "外部さん"), "none");
  assert.strictEqual(u.laborSystemRawForStaff(st, "派遣さん"), "none");
  assert.strictEqual(u.laborSystemRawForStaff(st, "バイト"), "B");
  // ③ 保存値の検証は none を受け付けたまま（データ移行なし）。選択肢は A・B だけで、none は B を選んだ状態で出す
  //    （2026-10-03 の追加指示。属性 dispatch の名前「応援・外部」と同じ名前の労働時間制を並べない）
  assert.deepStrictEqual(u.LABOR_SYSTEMS, ["A", "B", "none"]);
  assert.deepStrictEqual(u.LABOR_SYSTEM_CHOICES, ["A", "B"]);
  assert.deepStrictEqual(Object.keys(u.LABOR_SYSTEM_LABELS).sort(), ["A", "B"], "ラベルは選択肢の2つだけ（参照の無い none を残さない）");
  assert.ok(!Object.values(u.LABOR_SYSTEM_LABELS).some(l => l.includes("判定対象外") || l.includes("応援・外部")));
  assert.strictEqual(u.laborSystemChoiceOf("none"), "B");
  assert.strictEqual(u.laborSystemChoiceOf("A"), "A");
  assert.strictEqual(u.laborSystemChoiceOf("B"), "B");
  assert.strictEqual(u.laborSystemChoiceOf(undefined), "");
  assert.strictEqual(u.laborSystemChoiceOf("X"), "");
  // 組み込み属性 dispatch の表示名は「応援・外部」（ID・保存データは変えない）
  assert.strictEqual(u.STAFF_TYPE_LABELS.dispatch, "応援・外部");
  assert.ok(u.getAttrOptions({ staffTypeLimits: { dispatch: { name: "派遣" } } }).some(([id, nm]) => id === "dispatch" && nm === "応援・外部"),
    "保存値の旧名（派遣）は読まない");
  // 従業員番号の未設定は応援・外部の人には出さない（番号を持たないため）。B の人には従来どおり出る
  assert.strictEqual(u.isStaffNumberMissing(st, "外部さん"), false);
  assert.strictEqual(u.isStaffNumberMissing(st, "派遣さん"), false);
  assert.strictEqual(u.isStaffNumberMissing(st, "バイト"), true);
});
test("応援・外部: 同じ勤務データなら parttime の人と laborFindingsFor・総括が一致する（従業員番号の未設定を除く）", () => {
  const st = { staffAttributes: { "外部さん": "custom_ext", "バイト": "parttime" },
    staffTypeLimits: { custom_ext: { name: "応援", laborSystem: "none" } }, staffNumbers: { "バイト": "12" } };
  const mins = [HM(13, 0), HM(3, 0), HM(9, 0), HM(9, 0), HM(9, 0), HM(9, 0)];
  const dates = ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19"];
  const weeks = [[HM(9, 0), HM(9, 0), HM(9, 0), HM(9, 0), HM(9, 0), HM(9, 0), 0]];
  const run = name => {
    const sys = u.laborSystemForStaff(st, name);
    const f = u.laborFindingsFor({ laborSystem: sys, dayMins: mins, dayDates: dates, weekDayMins: weeks, weekDates: ["2026-09-14"],
      breakShortDates: ["2026-09-16"], skilledWeekDates: [], inputCheckDates: [], staffNumberMissing: u.isStaffNumberMissing(st, name),
      monthOtH: 50, monthAgreementH: 50, agreementDailyOtH: 3, agreementMonthlyOtH: 45, monthReady: true });
    return { sys, f, overall: u.overallVerdictOf({ laborSystem: sys, findings: f, guideKey: "none", monthReady: true }),
      day: u.laborDayFindingsFor({ laborSystem: sys, dayMins: mins, agreementDailyOtH: 3 }) };
  };
  const ext = run("外部さん"), pt = run("バイト");
  assert.ok(ext.f.length > 0, "判定が出る＝素通りしない");
  assert.deepStrictEqual(ext, pt);
  // 2026-10-10: 1日の残業が上限超・月の残業が上限超・休憩不足は総括の要修正に数えない。8h超があるので「残業あり」
  assert.strictEqual(ext.overall.key, "ot");
  // 番号を持たない場合: バイトには「従業員番号が未設定」が出て、応援・外部には出ない
  const st2 = { ...st, staffNumbers: {} };
  assert.ok(u.laborFindingsFor({ laborSystem: "B", staffNumberMissing: u.isStaffNumberMissing(st2, "バイト") }).some(x => x.key === "inputCheckNumber"));
  assert.ok(!u.laborFindingsFor({ laborSystem: u.laborSystemForStaff(st2, "外部さん"), staffNumberMissing: u.isStaffNumberMissing(st2, "外部さん") }).some(x => x.key === "inputCheckNumber"));
});
test("応援・外部: 画面に「判定対象外」の文言と内部値 none 以外の none の分岐が残っていない", () => {
  const src = _readAdminSurface();
  // 管理者画面のコード（コメントを除く文字列）に「判定対象外」が出ない
  const strs = src.match(/"[^"\n]*"|`[^`]*`/g) || [];
  assert.ok(!strs.some(x => x.includes("判定対象外")), "画面の文言に「判定対象外」が残っている");
  // 行き先（所属店舗で判定）の人だけが sys:"none" を持つ
  assert.strictEqual((src.match(/sys:"none"/g) || []).length, 1);
  assert.ok(/role==="dest"[\s\S]{0,400}sys:"none"/.test(src), "sys:\"none\" は dest の分岐の中だけ");
});

// ===== P3.5c の削除（2026-10-03 ユーザー指示）=====
// 判定対象外の人の長時間の日をセル色で示す店舗トグル（P3.5c）は、完成したシフトにも色が残り直す必要のない目印が増えるため機能ごと消した。
// 本番の店舗には保存済みの値（highlightExternalOver8h:1・externalOverThresholdMin:480）が残るが、データ移行はしない。
// 読み手（laborSettingsOf）が既定値の無いキーを黙って捨てるので無害であることをここで固定する。
test("P3.5c の削除: セル色・日のキー・労務設定・CF のキーから消え、保存済みの値は黙って捨てられる", () => {
  const gone = ["external" + "Over", "highlight" + "ExternalOver8h", "external" + "OverThresholdMin", "external" + "OverThresholdOf"];
  assert.ok(!u.CELL_COLOR_LEGEND.some(c => c.key === gone[0]), "セル色のレジェンドに無い");
  assert.ok(!u.LABOR_DAY_FIX_KEYS.includes(gone[0]) && !(gone[0] in u.LABOR_DAY_ERR_LABELS), "色を塗る日のキーに無い");
  assert.strictEqual(u[gone[3]], undefined, "しきい値の関数は無い");
  const ls = u.laborSettingsOf({ laborSettings: { [gone[1]]: 1, [gone[2]]: 480, showDailyOverB: 1 } });
  assert.ok(!(gone[1] in ls) && !(gone[2] in ls), "保存済みの値は読み手で捨てられる");
  assert.strictEqual(ls.showDailyOverB, 1, "他のキーは従来どおり読む");
  assert.ok(!(gone[1] in u.DEFAULT_LABOR_SETTINGS) && !(gone[1] in u.LABOR_SETTING_RANGES));
  assert.ok(!cfc.COMPANY_LABOR_KEYS.includes(gone[1]) && !cfc.COMPANY_LABOR_KEYS.includes(gone[2]), "CF のキーにも無い");
  assert.ok(!(gone[1] in cfc.COMPANY_LABOR_RANGES));
  // 判定対象外の人の長い日にも、日のキーは何も付かない（以前は店舗トグルで付いた）
  assert.deepStrictEqual(u.laborDayFindingsFor({ laborSystem: "none", dayMins: [900] }), [[]]);
  // 管理者画面の実装にも残っていない（設定タブのトグル・セル色の分岐・title）
  const src = _readAdminSurface();
  assert.ok(!src.includes(gone[0]) && !src.includes("外部の" + "長時間"), "管理者画面の実装に参照が無い");
});

// ===== P3.5d PDF の昼・夜の人数（§3.9-4・§6 P3.5d）=====
test("P3.5d 昼・夜の人数: 既定オフ・出勤≦確認時刻＜退勤・休暇の帯は数えない・同じ人は1人・0人の側と店休日は出さない", () => {
  assert.deepStrictEqual(u.headcountAtOf({}), { enabled: false, lunch: "", dinner: "" }, "既定はオフで時刻も無い");
  assert.deepStrictEqual(u.headcountAtOf({ headcountAt: { enabled: true, lunch: "12:00", dinner: "x" } }), { enabled: true, lunch: "12:00", dinner: "" });
  const E = [
    { name: "A", stM: 600, enM: 900 },            // 10:00-15:00
    { name: "B", stM: 720, enM: 1020 },           // 12:00-17:00（出勤＝確認時刻は数える）
    { name: "B", stM: 1020, enM: 1320 },          // 同じ人の後半（17:00で帯が割れた区間）
    { name: "C", stM: 540, enM: 720 },            // 9:00-12:00（退勤＝確認時刻は数えない）
    { name: "D", stM: 600, enM: 1320, leave: { lunch: true, dinner: false } }, // 昼の帯に有給
  ];
  assert.strictEqual(u.countPresentAt(E, 720), 2, "12:00 は A・B（C は退勤ちょうど・D は休暇）");
  assert.strictEqual(u.countPresentAt(E, 1140), 2, "19:00 は B・D（B は1人）");
  assert.strictEqual(u.countPresentAt(E, NaN), 0);
  assert.strictEqual(u.headcountLabelOf({ lunch: 3, dinner: 7 }, false), "昼3 夜7");
  assert.strictEqual(u.headcountLabelOf({ lunch: 0, dinner: 2 }, false), "夜2", "0人の側は出さない");
  assert.strictEqual(u.headcountLabelOf({ lunch: 0, dinner: 0 }, false), "");
  assert.strictEqual(u.headcountLabelOf({ lunch: 3, dinner: 7 }, true), "", "店休日は曜日だけ");
});
test("昼・夜の人数をキッチンとホールで分ける（2026-10-02）: 区分ごとに数え、区分の印は付けない", () => {
  const E = [
    { name: "A", stM: 600, enM: 1380, section: "kit" },   // 10:00-23:00 キッチン
    { name: "B", stM: 660, enM: 1020, section: "hall" },  // 11:00-17:00 ホール（17:00 でキッチンへ）
    { name: "B", stM: 1020, enM: 1380, section: "kit" },  // 同じ人の後半はキッチン（17:00 で区分が変わる）
    { name: "C", stM: 1080, enM: 1380, section: "hall" }, // 18:00-23:00 ホール
    { name: "D", stM: 600, enM: 1380, section: "hall", leave: { lunch: true, dinner: false } }, // 昼に有給
  ];
  assert.strictEqual(u.countPresentAt(E, 720, "kit"), 1, "12:00 のキッチンは A");
  assert.strictEqual(u.countPresentAt(E, 720, "hall"), 1, "12:00 のホールは B（D は休暇）");
  assert.strictEqual(u.countPresentAt(E, 1140, "kit"), 2, "19:00 のキッチンは A・B");
  assert.strictEqual(u.countPresentAt(E, 1140, "hall"), 2, "19:00 のホールは C・D");
  assert.strictEqual(u.countPresentAt(E, 1140), 4, "区分を渡さなければ従来どおり合計（B は1人）");
});
test("P3.5d 昼・夜の人数は PDF だけに出る（画面のグリッドと Excel は参照しない）", () => {
  const src = _readAdminSurface();
  const x0 = src.indexOf("function expXl(");
  assert.ok(x0 > 0, "expXl が見つからない");
  const rest = src.slice(x0 + 1);
  const x1 = rest.search(/\n(async )?function [A-Za-z]/);
  const xlBody = rest.slice(0, x1 > 0 ? x1 : rest.length);
  assert.ok(xlBody.length > 1000, "expXl の本体を切り出せていない");
  assert.ok(!/headcount|countPresentAt/i.test(xlBody), "expXl が人数を参照している");
  const b0 = src.indexOf("const buildShiftTableHtml=(");
  assert.ok(b0 > 0);
  const inBuilder = i => i > b0 && i < src.indexOf("\n  };\n", b0);
  let i = -1, hits = 0;
  while ((i = src.indexOf("headcountAtOf(settings)", i + 1)) >= 0) { hits++; if (!/data-headcount-card/.test(src.slice(i, i + 800))) assert.ok(inBuilder(i), "PDF の外で人数を読んでいる"); }
  assert.ok(hits >= 1);
  ["pdfHeadcount(", "countPresentAt("].forEach(k => { let j = -1; while ((j = src.indexOf(k, j + 1)) >= 0) assert.ok(inBuilder(j), `${k} が PDF の外にある`); });
});

// ===== P3.6 ヘルプ先勤務の所属店舗への合算（労務給与_複数法人_実装計画.md §3.9・§6 P3.6）=====
const cf36 = require("../functions/company-config.js");
const _w36 = (s, e) => ({ status: "work", start: s, end: e });
const _shop36 = (name, o) => u.otherShopDataOf({ name, settings: o.settings || {}, subs: o.subs || {}, staff: o.staff || [], periods: o.periods || {}, loadFailed: !!o.loadFailed });

test("P3.6 同一人物: 写しの people が第1の根拠（登録名が違っても束なる）・別の人物の同姓同名は束ねない・人物に無い登録は所属店舗の一致", () => {
  const B = _shop36("B店", { staff: ["田中 太郎", "佐藤", "鈴木"], settings: { staffHomeShop: { "鈴木": "A" } } });
  const shops = { B: { ...B, entityId: null } };
  const people = { "1042": { A: "田中", B: "田中 太郎" }, "p_AAAAAAAA": { A: "佐藤" }, "p_BBBBBBBB": { B: "佐藤" } };
  assert.deepStrictEqual(u.samePersonRegistrations({ shopId: "A", name: "田中", settings: {}, people, otherShops: shops }), [{ shopId: "B", name: "田中 太郎", by: "person" }]);
  assert.deepStrictEqual(u.samePersonRegistrations({ shopId: "A", name: "佐藤", settings: {}, people, otherShops: shops }), [], "同じ名前でも人物が別なら別人");
  // 鈴木はどの人物にも載っていない＝後方互換の規則（B店の登録の所属が A＝自店の所属と一致）
  assert.deepStrictEqual(u.samePersonRegistrations({ shopId: "A", name: "鈴木", settings: {}, people, otherShops: shops }), [{ shopId: "B", name: "鈴木", by: "home" }]);
  // 名前が同じで番号も所属も無い登録は別人（people が無くても）
  const C = { C: { ..._shop36("C店", { staff: ["山田"] }), entityId: null } };
  assert.deepStrictEqual(u.samePersonRegistrations({ shopId: "A", name: "山田", settings: {}, people: null, otherShops: C }), []);
  // 法人が違う店舗は対象外
  assert.deepStrictEqual(u.samePersonRegistrations({ shopId: "A", name: "田中", settings: {}, people, otherShops: { B: { ...B, entityId: "E2" } }, entityId: "E1" }), []);
  assert.strictEqual(u.samePersonRegistrations({ shopId: "A", name: "田中", settings: {}, people, otherShops: { B: { ...B, entityId: "E1" } }, entityId: "E1" }).length, 1);
});

test("P3.6 所属と行き先: 明示された所属店舗が1つに決まれば所属側が合算し行き先は所属店舗で判定。両方未設定・食い違いはどちらにも合算しない", () => {
  const people = { "1042": { A: "田中", B: "田中" } };
  const Bh = { B: { ..._shop36("B店", { staff: ["田中"], settings: { staffHomeShop: { "田中": "A" } } }), entityId: null } };
  const Ah = { A: { ..._shop36("A店", { staff: ["田中"] }), entityId: null } };
  assert.strictEqual(u.helperPersonOf({ shopId: "A", name: "田中", settings: {}, people, otherShops: Bh }).role, "home");
  assert.strictEqual(u.helperPersonOf({ shopId: "B", name: "田中", settings: { staffHomeShop: { "田中": "A" } }, people, otherShops: Ah }).role, "dest");
  const Bn = { B: { ..._shop36("B店", { staff: ["田中"] }), entityId: null } };
  const h0 = u.helperPersonOf({ shopId: "A", name: "田中", settings: {}, people, otherShops: Bn });
  assert.deepStrictEqual([h0.role, h0.home], [null, null], "両方とも所属店舗が未設定なら決めない（2店舗で二重に数えない）");
  const Bx = { B: { ..._shop36("B店", { staff: ["田中"], settings: { staffHomeShop: { "田中": "A" } } }), entityId: null } };
  assert.strictEqual(u.helperPersonOf({ shopId: "A", name: "田中", settings: { staffHomeShop: { "田中": "B" } }, people, otherShops: Bx }).role, null, "食い違いは決めない");
  // 所属店舗の登録を知らない行き先は「所属店舗で判定」にしない（どこでも数えられなくなるのを防ぐ）
  assert.strictEqual(u.helperPersonOf({ shopId: "B", name: "田中", settings: { staffHomeShop: { "田中": "Z" } }, people: null, otherShops: Ah }).role, null);
  // 読めない他店があれば unread
  const Bf = { B: { ..._shop36("B店", { staff: [], loadFailed: true }), entityId: null } };
  assert.strictEqual(u.helperPersonOf({ shopId: "A", name: "田中", settings: {}, people, otherShops: Bf }).unread, true);
  assert.strictEqual(u.helperPersonOf({ shopId: "A", name: "田中", settings: {}, people, otherShops: Bh }).unread, false);
});

test("P3.6 他店の勤務: 行き先の店の休憩で引いた実働を持ち込み、自店の勤務と重なる勤務は足さない。確定済みの期間は写しの設定", () => {
  const brk = { weekday: [{ start: "19:00", end: "19:30" }], sat: [], sun: [], holSat: [], holSun: [] };
  const B = { ..._shop36("B店", {
    staff: ["田中"], settings: { staffHomeShop: { "田中": "A" }, breakTimes: brk, shopAbbrs: ["三"] },
    subs: { s1: { id: "s1", staffName: "田中", periodId: "pb", shifts: { "2026-10-05": _w36("17:00", "23:00"), "2026-10-06": _w36("12:00", "16:00") } } },
  }), entityId: null };
  const regs = [{ shopId: "B", name: "田中", by: "person" }];
  const e1 = u.helperWorkOn({ regs, otherShops: { B }, date: "2026-10-05", todayStr: "2026-10-01" });
  assert.deepStrictEqual(e1.map(e => [e.abbr, e.start, e.end, e.min]), [["三", "17:00", "23:00", 330]], "行き先の休憩30分を引いた 5:30");
  // 自店が 10-15 で他店が 12-16 の日は重なる＝ヘルプコマンドで自店にも入れている／重複の日なので足さない
  assert.deepStrictEqual(u.helperWorkOn({ regs, otherShops: { B }, date: "2026-10-06", ownRange: { startMin: 600, endMin: 900 } }), []);
  // 重ならない（自店 10-12・他店 12-16）なら足す
  assert.strictEqual(u.helperWorkOn({ regs, otherShops: { B }, date: "2026-10-06", ownRange: { startMin: 600, endMin: 720 } })[0].min, 240);
  // 行き先の期間が確定済みで写しの休憩が違えば、写しの休憩で数える（行き先の画面と同じ）
  const snapBrk = { weekday: [{ start: "19:00", end: "20:00" }], sat: [], sun: [], holSat: [], holSun: [] };
  const Bc = { ...B, periods: { pb: { id: "pb", startDate: "2026-10-01", endDate: "2026-10-15", confirmation: { at: "2026-09-30T00:00:00Z" },
    snapshot: { staffList: ["田中"], settings: { breakTimes: snapBrk } } } } };
  assert.strictEqual(u.helperWorkOn({ regs, otherShops: { B: Bc }, date: "2026-10-05", todayStr: "2026-10-01", cache: new Map() })[0].min, 300);
  // 読めなかった店舗は足さない（unread 側で「＋」を出す）
  assert.deepStrictEqual(u.helperWorkOn({ regs, otherShops: { B: { ...B, loadFailed: true } }, date: "2026-10-05" }), []);
});

test("P3.6 期間の切り方が違う2店舗: 日付の重なりで拾い、所属店舗の laborMonths は合算後・行き先の店では数えない", () => {
  // 所属 A は1か月の期間、行き先 B は半月の期間2つ。B の2つの期間の勤務がどちらも A の月に入る
  const B = { ..._shop36("B店", {
    staff: ["田中"], settings: { staffHomeShop: { "田中": "A" } },
    periods: { b1: { id: "b1", startDate: "2026-10-01", endDate: "2026-10-15" }, b2: { id: "b2", startDate: "2026-10-16", endDate: "2026-10-31" } },
    subs: { x1: { id: "x1", staffName: "田中", periodId: "b1", shifts: { "2026-10-05": _w36("17:00", "22:00") } },
      x2: { id: "x2", staffName: "田中", periodId: "b2", shifts: { "2026-10-20": _w36("17:00", "21:00") } } },
  }), entityId: null };
  const cl = { shops: { A: "A店", B: "B店" }, people: { "1042": { A: "田中", B: "田中" } } };
  const subsA = [{ id: "a1", staffName: "田中", periodId: "pa", shifts: { "2026-10-01": _w36("10:00", "15:00") } }];
  const ctx = u.helperScheduleContext({ shopId: "A", names: ["田中"], settings: {}, companyLink: cl, otherShops: u.helperShopsOf(cl, { B }, "A"), subs: subsA, todayStr: "2026-10-01" });
  assert.deepStrictEqual([ctx.dayMin("田中", "2026-10-05"), ctx.dayMin("田中", "2026-10-20"), ctx.dayMin("田中", "2026-10-01")], [300, 240, 0]);
  const agg = u.aggregateScheduledMonth({ subs: subsA, names: ["田中"], settings: {}, ym: "2026-10", extraDayMin: ctx.dayMin });
  assert.deepStrictEqual(agg["田中"], { days: 3, min: 300 + 300 + 240 }, "所定日数・所定時間とも他店の勤務を含む");
  const PA = { id: "pa", startDate: "2026-10-01", endDate: "2026-10-31" };
  const r = u.planPeriodConfirmation({ period: PA, periods: [PA], subs: subsA, staffList: ["田中"], settings: {}, laborMonths: {}, todayStr: "2026-10-01", uid: "u",
    nowIso: "2026-10-01T00:00:00Z", extraDayMin: ctx.dayMin, excludeNames: ctx.excludeNames });
  assert.strictEqual(r.laborMonthsPatch["2026-10/田中"].min, 840);
  assert.ok(r.laborMonthsPatch["2026-10/田中"].frozenAt, "凍結値が合算後");
  // 行き先 B から見ると田中は所属店舗で判定する人＝ B の所定に載せない
  const A = { ..._shop36("A店", { staff: ["田中"], subs: { a1: subsA[0] } }), entityId: null };
  const ctxB = u.helperScheduleContext({ shopId: "B", names: ["田中"], settings: { staffHomeShop: { "田中": "A" } }, companyLink: cl, otherShops: u.helperShopsOf(cl, { A }, "B"), subs: [], todayStr: "2026-10-01" });
  assert.deepStrictEqual(ctxB.excludeNames, ["田中"]);
  const PB = { id: "b1", startDate: "2026-10-01", endDate: "2026-10-15" };
  const rB = u.planPeriodConfirmation({ period: PB, periods: [PB], subs: [], staffList: ["田中"], settings: { staffHomeShop: { "田中": "A" } }, laborMonths: {}, todayStr: "2026-10-01", uid: "u",
    extraDayMin: ctxB.dayMin, excludeNames: ctxB.excludeNames });
  assert.strictEqual(rB.laborMonthsPatch["2026-10/田中"], undefined, "行き先の店の laborMonths には入れない");
  // 同姓同名で人物が別なら合算しない
  const cl2 = { shops: { A: "A店", B: "B店" }, people: { "p_AAAAAAAA": { A: "田中" }, "p_BBBBBBBB": { B: "田中" } } };
  const Bn = { ...B, homeShop: null, settings: {} };
  const ctx2 = u.helperScheduleContext({ shopId: "A", names: ["田中"], settings: {}, companyLink: cl2, otherShops: u.helperShopsOf(cl2, { B: Bn }, "A"), subs: subsA, todayStr: "2026-10-01" });
  assert.strictEqual(ctx2.dayMin("田中", "2026-10-05"), 0);
  // 設定の無い呼び出しは従来どおり（extraDayMin 無し）
  assert.deepStrictEqual(u.aggregateScheduledMonth({ subs: subsA, names: ["田中"], settings: {}, ym: "2026-10" })["田中"], { days: 1, min: 300 });
});

test("P3.6 otherShopDataOf: 他店の別名で提出された sub を登録名へ解決し、同じ日は両方揃ったシフトを優先", () => {
  const d = _shop36("B店", { staff: ["田中", "__spacer__1"], settings: { staffAliases: { "田中": ["たなか"] }, shopAbbrs: { 0: "三" } },
    subs: { a: { staffName: "たなか", shifts: { "2026-10-05": { status: "work", start: "17:00" } } }, b: { staffName: "田中", shifts: { "2026-10-05": _w36("18:00", "22:00") } } } });
  assert.deepStrictEqual(d.workMap.get("田中|2026-10-05"), _w36("18:00", "22:00"));
  assert.deepStrictEqual([...d.staffSet], ["田中"]);
  assert.deepStrictEqual(d.abbrs, ["三"]);
});

test("P3.6 写し: CF の buildShopMirror が people（連携店舗ぶん・人物ID の形を満たすもの）と店舗の法人を焼き込む", () => {
  const pub = { name: "x", shops: { S1: true, S2: true }, entities: { E1: { name: "甲" }, E2: { name: "乙" } }, defaultEntityId: "E1", shopEntities: { S2: "E2" },
    people: { "1042": { links: { S1: "田中", S2: "田中 太郎", S9: "外" } }, "bad.id": { links: { S1: "a" } }, "p_AbCdEfGh": { links: { S9: "外だけ" } } } };
  const m = cf36.buildShopMirror("C1", pub, "S1", { S1: "A店" }, "t");
  assert.deepStrictEqual(m.people, { "1042": { S1: "田中", S2: "田中 太郎" } }, "連携していない店舗・不正な人物ID・連携店舗に登録の無い人物は載せない");
  assert.deepStrictEqual(m.shopEntities, { S1: "E1", S2: "E2" });
  const m0 = cf36.buildShopMirror("C1", { name: "x", shops: { S1: true } }, "S1", {}, "t");
  assert.ok(!("people" in m0) && !("shopEntities" in m0), "無いときはキーを持たない（空のマップは Firebase に残らない）");
  // 店舗側の索引と CF の人物ID の形が同じ（PERSON_ID_RE の一致）
  assert.strictEqual(String(u.PERSON_ID_RE), String(cf36.PERSON_ID_RE));
  assert.strictEqual(u.personIndexOfMirror(m.people).get("S2\u0000田中 太郎"), "1042");
});

test("P3.6 重複候補: 同じ名前が2店舗以上にあって人物が別の行を束ねる（同じ店舗だけの同名・1人だけの名前は出さない）", () => {
  const rows = [
    { personId: "1", name: "田中", links: [{ shopId: "A", name: "田中" }] },
    { personId: "p_x", name: "田中", links: [{ shopId: "B", name: "田 中" }] },
    { personId: "3", name: "佐藤", links: [{ shopId: "A", name: "佐藤" }, { shopId: "B", name: "佐藤" }] },
    { personId: "4", name: "山田", links: [{ shopId: "A", name: "山田" }] },
    { personId: "5", name: "山田", links: [{ shopId: "A", name: "山田" }] },
    { personId: null, name: "鈴木", links: [{ shopId: "A", name: "鈴木" }] },
  ];
  const c = u.duplicatePersonCandidates(rows);
  assert.deepStrictEqual(c.map(g => [g.name, g.rows.map(r => r.personId), g.shopIds.sort()]), [["田中", ["1", "p_x"], ["A", "B"]]]);
  // 企業内登録スタッフの行に「所属店舗が明示されているか」が載る
  const rs = u.buildCompanyStaffRows([
    { id: "A", name: "A店", staff: ["田中"], settings: {} },
    { id: "B", name: "B店", staff: ["田中"], settings: { staffHomeShop: { "田中": "A" } } },
    { id: "C", name: "C店", staff: ["佐藤"], settings: {} },
  ], null, "2026-10-01", null);
  const byName = Object.fromEntries(rs.map(r => [r.name, r.homeExplicit]));
  assert.deepStrictEqual(byName, { "田中": true, "佐藤": false });
});

test("統合しない: 重複候補は組の全ペアが distinct（一方向でも可）なら出さず、1ペアでも未記録なら組ごと出す", () => {
  const row = (pid, shop, distinct) => ({ personId: pid, name: "タオ", links: [{ shopId: shop, name: "タオ" }], distinct: distinct || [] });
  // 2人組: 一方向だけの記録でも記録済み扱い
  assert.deepStrictEqual(u.duplicatePersonCandidates([row("1", "A", ["2"]), row("2", "B")]), [], "一方向だけの記録で消える");
  assert.deepStrictEqual(u.duplicatePersonCandidates([row("1", "A"), row("2", "B", ["1"])]), [], "逆向きだけでも消える");
  assert.strictEqual(u.duplicatePersonCandidates([row("1", "A"), row("2", "B")]).length, 1, "記録が無ければ出る");
  assert.strictEqual(u.duplicatePersonCandidates([row("1", "A", ["9"]), row("2", "B")]).length, 1, "関係の無い相手との記録では消えない");
  // 3人組: 3ペア全部で消える。2ペアだけなら組ごと（行は3つとも）出る
  const all3 = [row("1", "A", ["2", "3"]), row("2", "B", ["1", "3"]), row("3", "C", ["1", "2"])];
  assert.deepStrictEqual(u.duplicatePersonCandidates(all3), []);
  const two3 = [row("1", "A", ["2", "3"]), row("2", "B", ["1"]), row("3", "C", ["1"])];
  const c = u.duplicatePersonCandidates(two3);
  assert.deepStrictEqual(c.map(g => g.rows.map(r => r.personId)), [["1", "2", "3"]], "2と3の間が未記録なので行は全部出る");
  // distinct を持たない行（人物の無い時期の行）は従来どおり
  assert.strictEqual(u.duplicatePersonCandidates([{ personId: "1", links: [{ shopId: "A", name: "タオ" }] }, { personId: "2", links: [{ shopId: "B", name: "タオ" }] }]).length, 1);
  // buildCompanyStaffRows が people の distinct を行に載せる（無ければ []）
  const shops = [{ id: "A", name: "A店", staff: ["タオ"], settings: {} }, { id: "B", name: "B店", staff: ["タオ"], settings: {} }];
  const people = { p_aaaaaaaa: { links: { A: "タオ" }, distinct: { p_bbbbbbbb: "T" } }, p_bbbbbbbb: { links: { B: "タオ" } } };
  const rs = u.buildCompanyStaffRows(shops, null, "2026-10-01", people);
  const by = Object.fromEntries(rs.map(r => [r.personId, r.distinct]));
  assert.deepStrictEqual(by, { p_aaaaaaaa: ["p_bbbbbbbb"], p_bbbbbbbb: [] });
  assert.deepStrictEqual(u.duplicatePersonCandidates(rs), [], "people の一方向の記録で候補から消える");
  assert.ok(u.buildCompanyStaffRows(shops, null, "2026-10-01").every(r => Array.isArray(r.distinct) && r.distinct.length === 0), "people が無ければ []");
  // CF の isDistinctPair と同じ判定（一方向でも記録済み）
  assert.strictEqual(cfp.isDistinctPair(people, "p_bbbbbbbb", "p_aaaaaaaa"), true);
});

test("P3.6 入口の固定: 確定の2つの入口がヘルプ先の合算を渡し、労務の日次の入口が他店の勤務を足す", () => {
  const admin = _readAdminSurface();
  const calls = [];
  let i = -1;
  while ((i = admin.indexOf("planPeriodConfirmation({", i + 1)) >= 0) calls.push(admin.slice(i, admin.indexOf("})", i)));
  assert.strictEqual(calls.length, 2);
  calls.forEach(c => assert.ok(/extraDayMin:/.test(c) && /excludeNames:/.test(c), "確定で他店の勤務を渡していない: " + c.slice(0, 80)));
  assert.ok((admin.match(/helperScheduleContext\(/g) || []).length >= 2, "シフト作成タブと企業の確定が同じ helperScheduleContext を通る");
  assert.ok(/const laborDayMin=\(name,ds\)=>\{[^\n]*helperMinOn\(name,ds\)/.test(admin), "laborDayMin に他店の勤務が入っていない");
  // S3（2026-10-04）で週計・期間別の合計は後回しの値のキャッシュ（totalsCache）を通すようになった。中身は *Raw が数える
  assert.ok(/const getWeekMinRaw=[\s\S]{0,400}helperMinOn\(name,ds\)/.test(admin), "週計に他店の勤務が入っていない");
  assert.ok(/const getPeriodMinRaw=[\s\S]{0,600}helperMinOn\(name,d\)/.test(admin), "期間別勤務時間（月計）に他店の勤務が入っていない");
  assert.ok(/const getWeekMin=[\s\S]{0,200}getWeekMinRaw\(monStr,name\)/.test(admin) && /const getPeriodMin=[\s\S]{0,200}getPeriodMinRaw\(pid,name\)/.test(admin));
  // 他店の読み込みは一本化した otherShopDataOf を通る（企業の確定と同じ形）
  assert.ok((admin.match(/otherShopDataOf\(/g) || []).length >= 2);
  // CF: 人物を変える CF は写しを作り直す（写しの people を店長のセッションが読む）
  const idx = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "functions", "index.js"), "utf8");
  ["ensureCompanyPeople", "mergePeople", "splitPerson", "reassignPersonId", "companyRenameStaff"].forEach(n => {
    const at = idx.indexOf(`exports.${n} = functions`);
    const body = idx.slice(at, idx.indexOf("exports.", at + 10));
    assert.ok(/syncPeopleMirror\(companyId\)/.test(body), `${n} が写しを作り直していない`);
  });
});

// ===== P4 実績レイヤー（労務給与_複数法人_実装計画.md §3.6・§4.1・§6 P4）=====
const P4_S = { candidates: [], breakTimes: { weekday: [{ start: "12:00", end: "13:00" }] }, staffAttributes: {},
  overtimeSettings: { byStaff: { "田中": { lunch: 0, dinner: 30 } } } };
const P4_D = "2026-11-02"; // 月曜（平日の休憩 12:00〜13:00 が当たる）
const p4Sub = shifts => ({ id: "s1", periodId: "p1", staffName: "田中", shifts });
test("P4 時刻の読み書き: parseClockInput はセルと同じ読み方、minToClock は 24時超えをそのまま出す", () => {
  assert.strictEqual(u.parseClockInput("9"), "09:00");
  assert.strictEqual(u.parseClockInput("930"), "09:30");
  assert.strictEqual(u.parseClockInput("9:30"), "09:30");
  assert.strictEqual(u.parseClockInput("9.5"), "09:30");
  assert.strictEqual(u.parseClockInput("25"), "25:00");
  assert.strictEqual(u.parseClockInput("31"), "");
  assert.strictEqual(u.parseClockInput("abc"), "");
  assert.strictEqual(u.parseClockInput(""), "");
  assert.strictEqual(u.minToClock(1500), "25:00");
  assert.strictEqual(u.minToClock(null), "", "null を 00:00 にしない");
  assert.strictEqual(u.parseMinutesInput("60"), 60);
  assert.strictEqual(u.parseMinutesInput("1:30"), 90);
  assert.strictEqual(u.parseMinutesInput(""), null);
  assert.ok(Number.isNaN(u.parseMinutesInput("x")));
});
test("P4 resolveActualDay: 未入力の日は確定シフトの値（休憩控除・退勤延長・締を含む）を返す", () => {
  const sh = { status: "work", start: "10:00", end: "18:00" };
  const sub = p4Sub({ [P4_D]: sh, "2026-11-04": { status: "work", start: "13:00", end: "17:00", extraStart: "23:00", extraEnd: "25:00" } });
  const direct = u.calcNetWorkMinutes(sh, u.getBreaksFor(P4_S, P4_D, "田中", sh), u.getOT("田中", P4_S, sh), P4_S);
  assert.strictEqual(direct, 450, "10:00-18:00・休憩60分・退勤延長30分");
  const sd = u.scheduledDay(sub, P4_D, P4_S);
  assert.deepStrictEqual({ s: sd.startMin, e: sd.endMin, b: sd.breakMin, w: sd.workMin }, { s: 600, e: 1110, b: 60, w: 450 });
  [null, undefined, {}].forEach(a => {
    const r = u.resolveActualDay(sub, a, P4_D, P4_S);
    assert.deepStrictEqual({ s: r.startMin, e: r.endMin, b: r.breakMin, w: r.workMin, ab: r.absentMin, rest: r.isRest, lh: r.isLegalHoliday, has: r.hasActual },
      { s: 600, e: 1110, b: 60, w: direct, ab: 0, rest: false, lh: false, has: false });
  });
  const ex = u.resolveActualDay(sub, null, "2026-11-04", P4_S);
  assert.strictEqual(ex.workMin, 240 + 120, "締の追加出勤も確定シフトどおり数える");
  assert.strictEqual(ex.segments.length, 2);
  const rest = u.resolveActualDay(sub, null, "2026-11-05", P4_S);
  assert.deepStrictEqual({ w: rest.workMin, rest: rest.isRest, s: rest.startMin }, { w: 0, rest: true, s: null });
  // aggregateScheduledMonth（所定）と同じ値になる
  const agg = u.aggregateScheduledMonth({ ym: "2026-11", names: ["田中"], subs: [sub], settings: P4_S });
  const sum = u.monthDatesOf("2026-11").reduce((a, d) => a + u.scheduledDay(sub, d, P4_S).workMin, 0);
  assert.strictEqual(sum, agg["田中"].min);
});
test("P4 resolveActualDay: 実績の時刻・休憩・欠勤・遅刻早退・法定休日", () => {
  const sub = p4Sub({ [P4_D]: { status: "work", start: "10:00", end: "18:00" }, "2026-11-04": { status: "work", start: "13:00", end: "17:00", extraStart: "23:00", extraEnd: "25:00" } });
  const R = a => u.resolveActualDay(sub, a, P4_D, P4_S);
  let r = R({ start: "13:30" });
  assert.deepStrictEqual({ s: r.startMin, e: r.endMin, b: r.breakMin, w: r.workMin }, { s: 810, e: 1110, b: 0, w: 300 }, "遅く出た日は休憩を判定し直す（休憩を含まない）");
  r = R({ end: "18:00" });
  assert.deepStrictEqual({ e: r.endMin, b: r.breakMin, w: r.workMin }, { e: 1080, b: 60, w: 420 }, "入れた退勤が実際の退勤（退勤延長は足さない）");
  r = R({ start: "10:00", end: "20:00", breakMin: 45 });
  assert.strictEqual(r.workMin, 555);
  r = R({ breakMin: 30 });
  assert.deepStrictEqual({ e: r.endMin, b: r.breakMin, w: r.workMin }, { e: 1110, b: 30, w: 480 }, "休憩だけ直した日");
  r = R({ absent: true });
  assert.deepStrictEqual({ w: r.workMin, ab: r.absentMin, rest: r.isRest, absent: r.absent }, { w: 0, ab: 450, rest: false, absent: true }, "欠勤＝不就労は予定の実働");
  assert.strictEqual(R({ absent: true, absentMin: 240 }).absentMin, 240);
  r = R({ absentMin: 30 });
  assert.deepStrictEqual({ w: r.workMin, ab: r.absentMin }, { w: 450, ab: 30 }, "遅刻・早退の分は実働から引かない（控除用の値）");
  r = R({ legalHoliday: true, note: "応援" });
  assert.deepStrictEqual({ lh: r.isLegalHoliday, w: r.workMin, note: r.note, has: r.hasActual }, { lh: true, w: 450, note: "応援", has: true });
  const rd = u.resolveActualDay(sub, { start: "10:00", end: "15:00" }, "2026-11-05", P4_S);
  assert.deepStrictEqual({ w: rd.workMin, rest: rd.isRest }, { w: 240, rest: false }, "予定の無い日に働いた日");
  const ex = u.resolveActualDay(sub, { end: "18:00" }, "2026-11-04", P4_S);
  assert.strictEqual(ex.workMin, 300 + 120, "出勤・退勤は主シフトを置き換え、締は確定シフトのまま足す");
});
test("P4 planActualEdit: 確定シフトと違う項目だけを保存し、同じなら消す（差分のある日だけ）", () => {
  const sub = p4Sub({ [P4_D]: { status: "work", start: "10:00", end: "18:00" } });
  const P = (entry, date = P4_D) => u.planActualEdit({ periodId: "p1", name: "田中", date, entry, sub, settings: P4_S });
  const K = "p1/田中/" + P4_D;
  assert.deepStrictEqual(P({ start: "10:00", end: "18:30" }).patch, { [K]: null }, "予定どおり（延長後の退勤）なら持たない");
  assert.deepStrictEqual(P({ start: "", end: "" }).patch, { [K]: null });
  assert.deepStrictEqual(P({ start: "10", end: "1800" }).patch, { [K]: { end: "18:00" } });
  assert.deepStrictEqual(P({ start: "9", end: "" }).patch, { [K]: { start: "09:00" } });
  assert.deepStrictEqual(P({ breakMin: "60" }).patch, { [K]: null }, "自動で決まる休憩と同じ値は持たない");
  assert.deepStrictEqual(P({ breakMin: "45" }).patch, { [K]: { breakMin: 45 } });
  assert.deepStrictEqual(P({ start: "13:30", breakMin: "0" }).patch, { [K]: { start: "13:30" } }, "時刻を変えた後の自動の休憩（0分）と同じ");
  assert.deepStrictEqual(P({ absent: true }).patch, { [K]: { absent: true } });
  assert.deepStrictEqual(P({ absent: true, absentMin: "450" }).patch, { [K]: { absent: true } }, "予定の実働と同じ不就労は持たない");
  assert.deepStrictEqual(P({ absent: true, start: "11:00", note: " 体調不良 " }).patch, { [K]: { absent: true, note: "体調不良" } }, "欠勤の日は時刻を持たない");
  assert.deepStrictEqual(P({ absentMin: "30", legalHoliday: true }).patch, { [K]: { absentMin: 30, legalHoliday: true } });
  assert.deepStrictEqual(P(null).patch, { [K]: null });
  assert.ok(P({ absent: true }, "2026-11-05").error, "予定の無い日は欠勤にできない");
  assert.ok(P({ start: "10:00" }, "2026-11-05").error, "予定の無い日は両方要る");
  assert.deepStrictEqual(P({ start: "10:00", end: "15:00" }, "2026-11-05").patch, { "p1/田中/2026-11-05": { start: "10:00", end: "15:00" } });
  assert.ok(P({ start: "18:00", end: "10:00" }).error, "退勤≦出勤");
  assert.ok(P({ start: "ab" }).error);
  assert.ok(P({ breakMin: "600" }).error, "休憩が勤務時間以上");
  assert.ok(P({ breakMin: "-1" }).error);
  assert.ok(P({ note: "x".repeat(201) }).error);
  assert.ok(u.planActualEdit({ periodId: "p1", name: "田.中", date: P4_D, entry: {}, sub, settings: P4_S }).error);
  assert.ok(u.planActualEdit({ periodId: "p1", name: "田中", date: "2026-13-01", entry: {}, sub, settings: P4_S }).error);
  // 保存した記録から解決すると入力どおりになる
  const rec = P({ start: "9:30", end: "19:00" }).record;
  const r = u.resolveActualDay(sub, rec, P4_D, P4_S);
  assert.deepStrictEqual({ s: r.startMin, e: r.endMin, w: r.workMin }, { s: 570, e: 1140, w: 510 });
});
test("P4 改名・削除の後始末: actuals のキーが期間ごとに移る（STAFF_KEYED_PERIOD_NODES）", () => {
  assert.deepStrictEqual(u.STAFF_KEYED_PERIOD_NODES, ["actuals"]);
  const ac = { p1: { "田中": { [P4_D]: { end: "18:00" } }, "佐藤": { [P4_D]: { absent: true } } }, p2: { "田中": { "2026-11-20": { legalHoliday: true } } }, p3: { "佐藤": {} } };
  assert.deepStrictEqual(u.renameStaffInActuals(ac, "田中", "田中 太郎"), {
    "p1/田中 太郎": ac.p1["田中"], "p1/田中": null, "p2/田中 太郎": ac.p2["田中"], "p2/田中": null });
  assert.strictEqual(u.renameStaffInActuals(ac, "鈴木", "鈴木 一郎"), null);
  assert.strictEqual(u.renameStaffInActuals(ac, "田中", "田中"), null);
  assert.deepStrictEqual(u.dropStaffFromActuals(ac, ["佐藤"]), { "p1/佐藤": null, "p3/佐藤": null });
  assert.strictEqual(u.dropStaffFromActuals(ac, ["鈴木"]), null);
  assert.deepStrictEqual(u.actualOf(ac, "p1", "田中", P4_D), { end: "18:00" });
  assert.strictEqual(u.actualOf(ac, "p9", "田中", P4_D), null);
});
test("P4 改名の後始末（CF）: actuals の一覧と差分パッチがクライアントと一致し、companyRenameStaff と purgeOldPeriods が actuals を扱う", () => {
  const fs = require("node:fs");
  assert.deepStrictEqual(cfp.STAFF_KEYED_PERIOD_NODES_CF, u.STAFF_KEYED_PERIOD_NODES);
  const cases = [
    { p1: { "田中": { [P4_D]: { end: "18:00" } }, "佐藤": { [P4_D]: { absent: true } } }, p2: { "田中": { "2026-11-20": { legalHoliday: true } } } },
    { p1: { "佐藤": { [P4_D]: { absent: true } } } },
    {},
  ];
  cases.forEach(ac => {
    assert.deepStrictEqual(cfp.renameStaffActualsPatch(ac, "田中", "田中 太郎"), u.renameStaffInActuals(ac, "田中", "田中 太郎"));
    const patch = u.renameStaffInActuals(ac, "田中", "田中 太郎");
    if (patch) {
      const after = p1bApply(ac, patch);
      Object.keys(ac).forEach(pid => { if (ac[pid]["田中"]) assert.deepStrictEqual(after[pid]["田中 太郎"], ac[pid]["田中"]); assert.ok(!(after[pid] || {})["田中"]); });
    }
  });
  const idx = fs.readFileSync(require("node:path").join(__dirname, "..", "functions", "index.js"), "utf8");
  const body = idx.slice(idx.indexOf("exports.companyRenameStaff"), idx.indexOf("exports.companyUpdateStaff"));
  u.STAFF_KEYED_PERIOD_NODES.forEach(n => assert.ok(body.includes("shops/${sid}/" + n), n + " を移していない"));
  assert.ok(body.includes("renameStaffActualsPatch("), "companyRenameStaff が renameStaffActualsPatch を通っていない");
  const purge = idx.slice(idx.indexOf("exports.purgeOldPeriods"), idx.indexOf("exports.sendSurveyEmails"));
  assert.ok(purge.includes("shops/${shopId}/actuals/${periodId}"), "期間の自動削除で実績も消す");
});
test("P4 ドリフト検出: ルール（actuals はオーナーだけが読み書き・形の検証）と改名・削除・期間削除・保存の入口", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const rules = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "database.rules.json"), "utf8")).rules.shops.$shopId;
  const OWNER = "root.child('shops').child($shopId).child('owners').child(auth.uid).exists()";
  const A = rules.actuals;
  assert.ok(A && A[".read"].includes(OWNER) && A[".write"].includes(OWNER), "actuals はオーナーだけが読み書きする");
  const D = A.$periodId.$name.$date;
  assert.ok(D[".validate"].includes("$date.matches("), "日付のキーを検証する");
  ["start", "end", "breakMin", "absent", "absentMin", "legalHoliday", "note"].forEach(f => assert.ok(D[f] && D[f][".validate"], f + " の検証が無い"));
  assert.deepStrictEqual(u.ACTUAL_FIELDS, ["start", "end", "breakMin", "absent", "absentMin", "legalHoliday", "note"], "ルールの項目と一致させる");
  assert.strictEqual(D.$other[".validate"], false, "知らない項目は書けない");
  const admin = _readAdminSurface();
  const ren = admin.slice(admin.indexOf("onRenameStaff={(oldName,newName)=>{"));
  const renBody = ren.slice(0, ren.indexOf("tt(`✓ ${oldName} → ${newName} に変更しました`)"));
  assert.ok(/act\.rename\(/.test(renBody), "改名で actuals を移していない");
  const sites = [];
  let i = -1;
  while ((i = admin.indexOf("=settingsWithoutStaff(", i + 1)) >= 0) sites.push(i);
  assert.ok(sites.length >= 2);
  sites.forEach(at => assert.ok(admin.slice(at, at + 600).includes("act.drop("), "settingsWithoutStaff の近くに act.drop が無い"));
  const main = fs.readFileSync(path.join(__dirname, "..", "app-main.js"), "utf8");
  assert.ok(main.includes("fbUpd(`shops/${sid}/actuals`,patch)"), "実績は差分 update で書く");
  assert.ok(!/ref\(`shops\/\$\{sid\}\/actuals`\)\.set\(/.test(main), "actuals を全体 set() しない");
  assert.ok(main.includes("firebaseDB.ref(`shops/${sid}/actuals/${p.id}`).remove()"), "期間の削除で実績も消す");
  const sub = main.slice(main.indexOf("const[actuals,setActuals]"), main.indexOf("const saveActuals"));
  assert.ok(sub.includes("ownerClaimedSid!==sid"), "claim が通った店舗でだけ購読する");
  // 実績の切替は確定済みの期間だけ
  assert.ok(/const canActuals=!!period&&periodConfirmed&&/.test(admin), "実績の切替を確定済みの期間に限る");
});
test("P4 CSV取込: 列の位置・見出し・別名・期間の外・知らない名前・2行目以降・既存の実績との合わせ方", () => {
  assert.deepStrictEqual(u.parseCsvRows('﻿日付,名前\r\n"2026-11-02","田中, 太郎"\r\n\r\n"a""b",c'), [["日付", "名前"], ["2026-11-02", "田中, 太郎"], ['a"b', "c"]]);
  assert.deepStrictEqual(u.parseCsvRows("a\tb\n1\t2"), [["a", "b"], ["1", "2"]], "タブ区切り");
  const per = { id: "p1", startDate: "2026-12-16", endDate: "2027-01-15" };
  assert.strictEqual(u.parseCsvDate("2026/11/2", per), "2026-11-02");
  assert.strictEqual(u.parseCsvDate("2026年11月2日", per), "2026-11-02");
  assert.strictEqual(u.parseCsvDate("1/5", per), "2027-01-05", "月/日は期間に入る年");
  assert.strictEqual(u.parseCsvDate("12/20", per), "2026-12-20");
  assert.strictEqual(u.parseCsvDate("2026-02-30", per), null);
  assert.deepStrictEqual(u.actualsCsvMappingOf({}), u.DEFAULT_ACTUALS_CSV_MAPPING);
  assert.deepStrictEqual(u.actualsCsvMappingOf({ actualsCsv: { hasHeader: false, date: 2, name: 1, start: 3, end: 4, breakMin: 0 } }),
    { hasHeader: false, date: 2, name: 1, start: 3, end: 4, breakMin: 0 });
  const period = { id: "p1", startDate: "2026-11-01", endDate: "2026-11-30" };
  const settings = { ...P4_S, staffAliases: { "田中": ["たなか"] } };
  const subs = [p4Sub({ [P4_D]: { status: "work", start: "10:00", end: "18:00" } })];
  const actuals = { p1: { "田中": { [P4_D]: { absent: true, legalHoliday: true, note: "応援" } } } };
  const text = ["日付,名前,出勤,退勤,休憩", "2026-11-02,たなか,9:58,18:05,60", "2026-11-02,田中,10:00,18:00,", "2026-12-01,田中,10:00,18:00,",
    "11/5,佐藤,10:00,15:00,", "11/6,田中,10:00,,", "11/7,鈴木,10:00,15:00,", "11/9,田中,10:00,18:30,"].join("\n");
  const r = u.planActualsImport({ text, mapping: u.DEFAULT_ACTUALS_CSV_MAPPING, period, staffList: ["田中", "佐藤", "--"], subs, settings, actuals });
  const reasons = Object.fromEntries(r.rows.map(x => [x.line, x.ok ? "ok" : x.reason]));
  assert.strictEqual(reasons[2], "ok");
  assert.match(reasons[3], /2行目以降/);
  assert.match(reasons[4], /期間の外/);
  assert.strictEqual(reasons[5], "ok", "予定の無い日の打刻");
  assert.match(reasons[6], /両方/);
  assert.match(reasons[7], /スタッフにいない/);
  assert.strictEqual(reasons[8], "ok");
  assert.strictEqual(r.applied, 3);
  assert.deepStrictEqual(r.patch["p1/田中/2026-11-02"], { start: "09:58", end: "18:05", legalHoliday: true, note: "応援" }, "欠勤は外し、法定休日とメモは残す・休憩60は自動と同じなので持たない");
  assert.deepStrictEqual(r.patch["p1/佐藤/2026-11-05"], { start: "10:00", end: "15:00" });
  assert.deepStrictEqual(r.patch["p1/田中/2026-11-09"], { start: "10:00", end: "18:30" }, "予定の無い日は両方を持つ");
  const r2 = u.planActualsImport({ text: "田中,11/2,11:00,18:00", mapping: { hasHeader: false, name: 1, date: 2, start: 3, end: 4, breakMin: 0 }, period, staffList: ["田中"], subs, settings, actuals: {} });
  assert.deepStrictEqual(r2.patch, { "p1/田中/2026-11-02": { start: "11:00", end: "18:00" } }, "列の位置を入れ替えられる");
});

// ===== P5 割増の計算（労務給与_複数法人_実装計画.md §4.1〜§4.4・§6 P5・決定 #3・#4・#5）=====
// 期待値はすべて手計算（式と途中の値をコメントに書いた）。実装の出力から逆生成していない。
// 日付の並びを作る: [開始日, 日数, (i,date)=>日の値]
const p5Add = (s, n) => { const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const p5Days = (start, n, f) => Array.from({ length: n }, (_, i) => { const d = p5Add(start, i); return { date: d, ...f(i, d) }; });
const p5Rest = { workMin: 0, scheduledMin: 0, nightMin: 0, rest: true };
test("P5 深夜: 締 23:00〜25:00 は全部深夜・休憩が深夜帯にかかる分は引く（帯は重なり、位置の無い休憩は拘束比で按分）", () => {
  const S = { candidates: [], breakTimes: { weekday: [{ start: "12:00", end: "13:00" }] }, staffAttributes: {} };
  // 締: 主シフト 13:00-17:00（休憩12-13は出勤が休憩開始以降なので当たらない）＋締 23:00-25:00
  //  深夜 = [23:00,25:00]∩[22:00,29:00] = 120分。主シフトは深夜なし
  const sub = { shifts: { "2026-11-04": { status: "work", start: "13:00", end: "17:00", extraStart: "23:00", extraEnd: "25:00" } } };
  const d = u.resolveActualDay(sub, null, "2026-11-04", S, "田中");
  assert.strictEqual(d.workMin, 360);
  assert.strictEqual(u.nightMinutesOf(d), 120);
  // 時間帯方式の休憩が深夜帯にある: 17:00-26:00・休憩 22:00-22:30（勤務が休憩を完全に含む）
  //  深夜の拘束 = [22:00,26:00] = 240分、休憩のうち深夜 = 30分 → 210分
  const Sb = { ...S, breakTimes: { weekday: [{ start: "22:00", end: "22:30" }] } };
  const sb = { shifts: { "2026-11-02": { status: "work", start: "17:00", end: "26:00" } } };
  const db = u.resolveActualDay(sb, null, "2026-11-02", Sb, "田中");
  assert.strictEqual(db.workMin, 510);
  assert.deepStrictEqual(db.breakBands, [{ startMin: 1320, endMin: 1350 }]);
  assert.strictEqual(u.nightMinutesOf(db), 210);
  // 長さ方式（休憩の位置が無い）: 17:00-27:00 拘束600分。実働基準で 600-60=540>480 → 休憩60分
  //  深夜の拘束 = [22:00,27:00] = 300分 → 引く分 = floor(60×300/600) = 30 → 270分
  const Sl = { ...S, breakMode: "length" };
  const sl = { shifts: { "2026-11-02": { status: "work", start: "17:00", end: "27:00" } } };
  const dl = u.resolveActualDay(sl, null, "2026-11-02", Sl, "田中");
  assert.strictEqual(dl.breakMin, 60);
  assert.strictEqual(dl.breakBands, null, "長さ方式は休憩の位置を持たない");
  assert.strictEqual(u.nightMinutesOf(dl), 270);
  // 実績で休憩の分だけを入れた日も按分: 17:00-26:00 拘束540分・休憩50分 → 深夜240 − floor(50×240/540=22.2)=22 → 218
  const da = u.resolveActualDay(sb, { breakMin: 50 }, "2026-11-02", Sb, "田中");
  assert.strictEqual(da.workMin, 490);
  assert.strictEqual(da.breakBands, null);
  assert.strictEqual(u.nightMinutesOf(da), 218);
  // 早朝: 4:00-9:00 → [4:00,5:00] の60分。29:00-30:00（翌5:00〜6:00）は深夜ではない
  assert.strictEqual(u.nightMinutesOf({ segments: [{ startMin: 240, endMin: 540 }], breakMin: 0 }), 60);
  assert.strictEqual(u.nightOverlapMin(1740, 1800), 0);
  assert.strictEqual(u.nightMinutesOf(u.resolveActualDay(sb, { absent: true }, "2026-11-02", Sb, "田中")), 0, "欠勤の日は0");
});
test("P5 A制: 12h 勤務の日と所定4hの日（①日・②週・所定は max(所定,8h)／max(Σ週所定,40h)）", () => {
  // 2026-11-02(月) 1日だけ 実働720・所定480。ほかの日は休み。
  //  ① = 720 − max(480,480) = 240。週(11/2〜8) Σ(実働−①) = 480 ≦ max(480,2400) → ②=0。③: 480 − 総枠 < 0 → 0
  const nov = p5Days("2026-11-01", 30, (i, d) => d === "2026-11-02" ? { workMin: 720, scheduledMin: 480, nightMin: 0, rest: false } : p5Rest);
  const frame = u.laborMonthFrame({}, "2026-11").baseMin;
  assert.strictEqual(frame, 10285, "30日の総枠 = floor(2400×30/7)");
  let b = u.premiumBreakdownOf({ system: "A", days: nov, ym: "2026-11", monthFrameMin: frame });
  assert.deepStrictEqual({ d: b.dayOverMin, w: b.weekOverMin, m: b.monthOverMin, ot: b.otMin }, { d: 240, w: 0, m: 0, ot: 240 });
  // 変形の所定10hの日: ① = 720 − max(600,480) = 120
  const nov10 = nov.map(x => x.date === "2026-11-02" ? { ...x, scheduledMin: 600 } : x);
  assert.strictEqual(u.premiumBreakdownOf({ system: "A", days: nov10, ym: "2026-11", monthFrameMin: frame }).dayOverMin, 120);
  // 所定4hの日を含む週（11/2〜8）: 所定 月240・火〜金480・土0・日0（休み）／実績 月600・火〜金480・土300
  //  ① 月 = 600 − max(240,480) = 120、土 = 300 − max(0,480) → 0
  //  ② Σ(実働−①) = 480+1920+300 = 2700、Σ所定 = 2160 → max(2160,2400)=2400 → ② = 300（週の最後の日 11/8 に載る）
  const sched = { "2026-11-02": 240, "2026-11-03": 480, "2026-11-04": 480, "2026-11-05": 480, "2026-11-06": 480 };
  const act = { "2026-11-02": 600, "2026-11-03": 480, "2026-11-04": 480, "2026-11-05": 480, "2026-11-06": 480, "2026-11-07": 300 };
  const wk = p5Days("2026-11-01", 30, (i, d) => act[d] ? { workMin: act[d], scheduledMin: sched[d] || 0, nightMin: 0, rest: false } : p5Rest);
  b = u.premiumBreakdownOf({ system: "A", days: wk, ym: "2026-11", monthFrameMin: frame });
  assert.deepStrictEqual({ d: b.dayOverMin, w: b.weekOverMin, m: b.monthOverMin, ot: b.otMin }, { d: 120, w: 300, m: 0, ot: 420 });
  assert.deepStrictEqual(b.dayOt, { "2026-11-02": 120 });
  assert.strictEqual(b.perDay["2026-11-08"], 300);
  // 実績が月360（所定240）なら ① = max(0,360−480) = 0（所定が8h未満でも日の時間外は8hを超えてから）
  const wk2 = wk.map(x => x.date === "2026-11-02" ? { ...x, workMin: 360 } : x);
  assert.strictEqual(u.premiumBreakdownOf({ system: "A", days: wk2, ym: "2026-11", monthFrameMin: frame }).dayOverMin, 0);
});
test("P5 A制: ③月の総枠超と月60h超（法定休日労働は60hに含めない）", () => {
  // 11月の平日20日（11/2〜27の月〜金）を実働480・所定480。総枠を3000分として渡す。
  //  ① 0、② 各週 Σ2400 − max(2400,2400) = 0、③ = 9600 − 3000 = 6600 → 60h超 = 6600 − 3600 = 3000
  const wd = d => { const w = new Date(d + "T00:00:00").getDay(); return w >= 1 && w <= 5 && d <= "2026-11-27" && d >= "2026-11-02"; };
  const days = p5Days("2026-11-01", 30, (i, d) => wd(d) ? { workMin: 480, scheduledMin: 480, nightMin: 0, rest: false } : p5Rest);
  const b = u.premiumBreakdownOf({ system: "A", days, ym: "2026-11", monthFrameMin: 3000 });
  assert.deepStrictEqual({ d: b.dayOverMin, w: b.weekOverMin, m: b.monthOverMin, ot: b.otMin, o60: b.over60Min }, { d: 0, w: 0, m: 6600, ot: 6600, o60: 3000 });
  assert.strictEqual(b.perDay["2026-11-30"], 6600, "③は月の最終日に載せる");
  assert.strictEqual(b.legalHolidayMin, 0);
});
test("P5 法定休日: 休日ゼロの週の最後の勤務日（①②③に含めない・深夜は別に持つ）／実績の指定が優先／7日揃わない週は判定しない", () => {
  // 11/9(月)〜15(日) を毎日 実働480・所定480。休日が1日も無い → 最後の勤務日 11/15 が法定休日労働（480分）。
  // 11/15 は深夜60分つき → 法定休日の深夜 60。ほかの週は休み（前の週 11/2〜8 は 11/1 を含むが 11/1 は休み）
  const allWeek = d => d >= "2026-11-09" && d <= "2026-11-15";
  const mk = over => p5Days("2026-10-26", 36, (i, d) => allWeek(d) ? { workMin: 480, scheduledMin: 480, nightMin: d === "2026-11-15" ? 60 : 0, rest: false, ...(over[d] || {}) } : p5Rest);
  let b = u.premiumBreakdownOf({ system: "B", days: mk({}), ym: "2026-11", monthFrameMin: 0 });
  assert.deepStrictEqual(b.legalHolidayDates, ["2026-11-15"]);
  assert.deepStrictEqual({ lh: b.legalHolidayMin, lhn: b.legalHolidayNightMin, night: b.nightMin }, { lh: 480, lhn: 60, night: 60 });
  // B制の週: 法定休日を除いた6日 Σ2880 − 2400 = 480（②）。①は0
  assert.deepStrictEqual({ d: b.dayOverMin, w: b.weekOverMin, ot: b.otMin }, { d: 0, w: 480, ot: 480 });
  // A制: Σ(実働−①) = 2880、Σ所定 = 2880（法定休日の日は所定からも外す）→ ② = 2880 − max(2880,2400) = 0
  const a = u.premiumBreakdownOf({ system: "A", days: mk({}), ym: "2026-11", monthFrameMin: 10285 });
  assert.deepStrictEqual({ w: a.weekOverMin, ot: a.otMin, lh: a.legalHolidayMin }, { w: 0, ot: 0, lh: 480 });
  // 実績で 11/11 を法定休日に指定 → その日だけ（自動判定しない）。B制の週は 11/15 を含む6日で ② = 480
  b = u.premiumBreakdownOf({ system: "B", days: mk({ "2026-11-11": { manualLegal: true } }), ym: "2026-11" });
  assert.deepStrictEqual(b.legalHolidayDates, ["2026-11-11"]);
  assert.deepStrictEqual(b.legalHolidayManual, ["2026-11-11"]);
  // 休日が1日ある週は法定休日なし
  b = u.premiumBreakdownOf({ system: "B", days: mk({ "2026-11-12": { workMin: 0, scheduledMin: 0, rest: true } }), ym: "2026-11" });
  assert.deepStrictEqual(b.legalHolidayDates, []);
  assert.strictEqual(b.weekOverMin, 480, "休日を除く6日×480 = 2880 − 2400 → ②480（法定休日が無いので全日を週に数える）");
  // 有給・欠勤の日（働いていないが休日ではない）は休日に数えない → 最後の勤務日 11/15 が法定休日
  b = u.premiumBreakdownOf({ system: "B", days: mk({ "2026-11-12": { workMin: 0, scheduledMin: 480, rest: false } }), ym: "2026-11" });
  assert.deepStrictEqual(b.legalHolidayDates, ["2026-11-15"]);
  // データの無い日がある週は判定しない
  b = u.premiumBreakdownOf({ system: "B", days: mk({ "2026-11-12": { rest: null } }), ym: "2026-11" });
  assert.deepStrictEqual(b.legalHolidayDates, []);
  assert.ok(b.undeterminedWeeks.includes("2026-11-09"));
  // 60h超に法定休日労働を含めない: 上の③の例に法定休日480分を足しても 60h超は変わらない
  assert.strictEqual(u.legalHolidayDatesOf({ days: mk({}) }).auto[0], "2026-11-15");
});
test("P5 月をまたぐ週: 既定はその月の日だけで切る（weekSplitAtMonthEdge=1）／0は週の開始日の月に7日まるごと", () => {
  // 週 9/28(月)〜10/4(日): 9/28〜10/3 を実働600（10h）、10/4 は休み。10/5〜31 と 9/1〜27 は休み。B制。
  const work = d => d >= "2026-09-28" && d <= "2026-10-03";
  const days = p5Days("2026-09-01", 61, (i, d) => work(d) ? { workMin: 600, scheduledMin: 480, nightMin: 0, rest: false } : p5Rest);
  // 10月・切る: 10/1〜3 の① = 120×3 = 360。週(10/1〜4) Σ(実働−①) = 1440 ≦ 2400 → ②0
  let b = u.premiumBreakdownOf({ system: "B", days, ym: "2026-10", splitAtMonthEdge: 1 });
  assert.deepStrictEqual({ d: b.dayOverMin, w: b.weekOverMin, ot: b.otMin }, { d: 360, w: 0, ot: 360 });
  // 9月・切る: 9/28〜30 の① = 360、週(9/28〜30) Σ1440 → ②0
  b = u.premiumBreakdownOf({ system: "B", days, ym: "2026-09", splitAtMonthEdge: 1 });
  assert.deepStrictEqual({ d: b.dayOverMin, w: b.weekOverMin }, { d: 360, w: 0 });
  // 9月・切らない（行政解釈）: 週 9/28〜10/4 は9月の分。Σ(実働−①) = 480×6 = 2880 → ② = 480（9月の最後の日 9/30 に載る）
  b = u.premiumBreakdownOf({ system: "B", days, ym: "2026-09", splitAtMonthEdge: 0 });
  assert.deepStrictEqual({ d: b.dayOverMin, w: b.weekOverMin, ot: b.otMin }, { d: 360, w: 480, ot: 840 });
  assert.strictEqual(b.perDay["2026-09-30"], 120 + 480);
  // 10月・切らない: その週は9月の分なので②は出ない（①は日なので10月の日の分）
  b = u.premiumBreakdownOf({ system: "B", days, ym: "2026-10", splitAtMonthEdge: 0 });
  assert.deepStrictEqual({ d: b.dayOverMin, w: b.weekOverMin }, { d: 360, w: 0 });
  // 既存の B制の週40h超（労務判定の weekOver40）は今までどおり月で切らない＝同じ週で 480 のまま（P2 の約束）
  assert.strictEqual(u.weeklyOverMinB([600, 600, 600, 600, 600, 600, 0]), 480);
  // 週の起算: 日曜起算なら 10/4(日) の週は 10/4〜10
  assert.strictEqual(u.premiumWeekStartOf("2026-10-04", 0), "2026-10-04");
  assert.strictEqual(u.premiumWeekStartOf("2026-10-04", 1), "2026-09-28");
});
test("P5 36協定: B制に月45h・単月100h、100h と複数月平均80h は法定休日労働を含める", () => {
  const base = { laborSystem: "B", dayMins: [], agreementMonthlyOtH: 45, monthReady: true };
  const K = o => u.laborFindingsFor({ ...base, ...o }).map(f => f.key);
  assert.ok(K({ monthOtH: 46 }).includes("monthOtOverAgreement"));
  assert.ok(!K({ monthOtH: 45 }).includes("monthOtOverAgreement"), "ちょうど45hは超えていない");
  assert.ok(!K({ monthOtH: 46, monthReady: false }).includes("monthOtOverAgreement"), "月が埋まるまで出さない");
  assert.ok(K({ monthOtH: 90, monthAgreementH: 100 }).includes("monthOt100"), "時間外90h＋法定休日10h = 100h");
  // 2026-10-10: 月の残業が上限超は総括の要修正に数えない（画面の労務の確認から外した10項目）。単月100h は従来どおり要修正
  assert.notStrictEqual(u.overallVerdictOf({ laborSystem: "B", findings: u.laborFindingsFor({ ...base, monthOtH: 46 }) }).key, "fix");
  assert.strictEqual(u.overallVerdictOf({ laborSystem: "B", findings: u.laborFindingsFor({ ...base, monthOtH: 90, monthAgreementH: 100 }) }).key, "fix");
  // A制の単月100h も同じ（以前は残業予定だけ＝休日労働を足していなかった）
  const A = o => u.laborFindingsFor({ laborSystem: "A", dayMins: [], monthReady: true, ...o }).map(f => f.key);
  assert.ok(!A({ monthOtH: 90 }).includes("monthOt100"));
  assert.ok(A({ monthOtH: 90, monthAgreementH: 101 }).includes("monthOt100"));
  // premiumAgreementH = (時間外 + 法定休日労働)/60 を2桁
  assert.strictEqual(u.premiumAgreementH({ otMin: 5400, legalHolidayMin: 610 }), 100.17);
  // 複数月平均80h: 時間外70h×2 では出ないが、法定休日15hずつを足すと 85h 平均で出る
  const M = arr => arr.map(([h, ag]) => ({ h, ag }));
  assert.ok(!u.agreementYearFindings(M([[70, 70], [70, 70]]), 360).some(f => f.key === "avgOver80"));
  assert.ok(u.agreementYearFindings(M([[70, 85], [70, 85]]), 360).some(f => f.key === "avgOver80"));
  // 年360h・年720h・月45h超の回数は時間外だけ（ag を使わない）
  assert.ok(!u.agreementYearFindings(M([[40, 50], [40, 50]]), 360).some(f => f.key === "over45Count"));
  // yearOvertimeMonths は凍結値 monthAgH、live の {h,ag} を読む。monthAgH の無い凍結値は h で代える
  const periods = [
    { id: "a", startDate: "2026-04-01", laborTotals: { 田中: { monthOtH: 10, monthAgH: 18 } } },
    { id: "b", startDate: "2026-05-01", laborTotals: { 田中: { monthOtH: 12 } } },
    { id: "c", startDate: "2026-06-01" }];
  const yo = u.yearOvertimeMonths(periods, "田中", 2026, 4, ym => ym === "2026-06" ? { h: 5, ag: 9 } : null);
  assert.deepStrictEqual(yo.scoped.map(v => [v.h, v.ag]), [[10, 18], [12, 12], [5, 9]]);
  // B制の月の時間外を laborTotals に持つ
  assert.deepStrictEqual(u.compactLaborTotal({ workMin: 600, monthOtH: 3.5, monthAgH: 11.5 }), { workMin: 600, monthOtH: 3.5, monthAgH: 11.5 });
  assert.strictEqual(u.laborTotalsEqual({ a: { monthAgH: 1 } }, { a: { monthAgH: 2 } }), false);
  // 設定画面の説明文も「足していない」ではなくなった
  assert.ok(!u.AGREEMENT_LEGAL_ITEMS.some(i => /足していません/.test(i.note)));
});
test("P5 労務確認パネル: 割増の該当日（期間の日だけ）・総括は変えない", () => {
  const b = { dayOt: { "2026-11-02": 120, "2026-11-20": 60 }, weekOt: [{ weekStart: "2026-11-02", dates: ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"], min: 300, lastDate: "2026-11-08" }],
    nightDates: ["2026-11-04"], legalHolidayDates: ["2026-11-15"], over60Min: 90 };
  const dates = u.gd("2026-11-01", "2026-11-15");
  const f = u.premiumFindingsFor(b, { system: "A", dates });
  // 深夜は出さない（2026-10-08 ユーザー指示。nightDates があっても一覧に載らない）
  assert.deepStrictEqual(f.map(x => x.label), ["日の時間外1日（2）", "週の時間外（2〜8）", "法定休日労働1日（15）", "月60h超 1:30"]);
  assert.ok(!f.some(x => /深夜/.test(x.label)) && !u.PREMIUM_FINDING_KEYS.includes("p5Night"));
  assert.deepStrictEqual(u.premiumFindingsFor(b, { system: "none", dates }), []);
  assert.ok(f.every(x => u.PREMIUM_FINDING_KEYS.includes(x.key)));
  // 要修正に入らない（OK のまま）
  assert.strictEqual(u.overallVerdictOf({ laborSystem: "A", findings: f, guideKey: "ok" }).key, "ok");
});
test("P5 他店の実績（P3.6 の申し送り）: 行き先の店のオーナーで読めたときだけ実績で解決し、読めず確定済みの期間なら印を付ける", () => {
  const sh = { status: "work", start: "17:00", end: "23:00" };
  const mkShop = (over) => u.otherShopDataOf({ name: "三宮", settings: {}, staff: ["田中"],
    subs: { s: { staffName: "田中", shifts: { "2026-11-04": sh } } },
    periods: { p9: { id: "p9", startDate: "2026-11-01", endDate: "2026-11-15", confirmation: { at: "2026-11-16T00:00:00Z" } } }, ...over });
  const regs = [{ shopId: "S2", name: "田中" }];
  // 読めた（オーナー）: 実績 退勤 25:00 → 実働 480・深夜 [22:00,25:00] = 180
  let r = u.helperActualDaysOn({ regs, otherShops: { S2: mkShop({ actuals: { p9: { 田中: { "2026-11-04": { end: "25:00" } } } } }) }, date: "2026-11-04" });
  assert.strictEqual(r.length, 1);
  assert.deepStrictEqual({ w: r[0].day.workMin, n: u.nightMinutesOf(r[0].day), un: r[0].actualUnread }, { w: 480, n: 180, un: false });
  // 読めない（店長のセッション）: 確定シフトで解決（360・深夜60）し、確定済みの期間なので actualUnread
  r = u.helperActualDaysOn({ regs, otherShops: { S2: mkShop({ actualsUnread: true }) }, date: "2026-11-04" });
  assert.deepStrictEqual({ w: r[0].day.workMin, n: u.nightMinutesOf(r[0].day), un: r[0].actualUnread }, { w: 360, n: 60, un: true });
  // 未確定の期間なら実績の入口が無いので印を付けない
  const unconf = mkShop({ actualsUnread: true, periods: { p9: { id: "p9", startDate: "2026-11-01", endDate: "2026-11-15" } } });
  assert.strictEqual(u.helperActualDaysOn({ regs, otherShops: { S2: unconf }, date: "2026-11-04" })[0].actualUnread, false);
  // 自店の勤務と時間が重なる他店の勤務は足さない（helperWorkOn と同じ）
  assert.strictEqual(u.helperActualDaysOn({ regs, otherShops: { S2: mkShop({ actuals: {} }) }, date: "2026-11-04", ownRange: { startMin: 1000, endMin: 1100 } }).length, 0);
});
test("P5 画面の入口: premiumDayInput（休日の数え方）・premiumMonthDates（前後の週）・premiumMonthOf・premiumRowCell（＋と前提の注記）", () => {
  // 休日: 空欄・公休は休日、実績で働いた日・欠勤は休日にしない、データの無い日は null
  const own = w => ({ workMin: w, scheduledWorkMin: 0, segments: [], breakMin: 0 });
  assert.strictEqual(u.premiumDayInput({ date: "2026-11-01", own: own(0), kind: "rest" }).rest, true);
  assert.strictEqual(u.premiumDayInput({ date: "2026-11-01", own: own(300), kind: "rest" }).rest, false, "予定の休みに働いた");
  assert.strictEqual(u.premiumDayInput({ date: "2026-11-01", own: { ...own(0), absent: true }, kind: "work" }).rest, false, "欠勤");
  assert.strictEqual(u.premiumDayInput({ date: "2026-11-01", own: own(0), kind: "leave" }).rest, false, "有給");
  assert.strictEqual(u.premiumDayInput({ date: "2026-11-01", own: own(0), kind: "rest", hasData: false }).rest, null);
  // 他店の勤務を足す（実働・所定・深夜）。行き先の実績を読めない日は unread
  const hd = { workMin: 360, scheduledWorkMin: 360, segments: [{ startMin: 1020, endMin: 1380 }], breakMin: 0 };
  const x = u.premiumDayInput({ date: "2026-11-04", own: own(0), kind: "work", helpers: [{ day: hd, actualUnread: true }] });
  assert.deepStrictEqual({ w: x.workMin, s: x.scheduledMin, n: x.nightMin, r: x.rest, un: x.unread }, { w: 360, s: 360, n: 60, r: false, un: true });
  // 11月（1日が日曜）: 月曜起算で 10/26〜12/6 の6週42日
  const md = u.premiumMonthDates("2026-11", 1);
  assert.deepStrictEqual([md[0], md[md.length - 1], md.length], ["2026-10-26", "2026-12-06", 42]);
  // premiumMonthOf は settings の労務設定（週の起算・月で切る・総枠）で premiumBreakdownOf を通す
  const pm = u.premiumMonthOf({ ym: "2026-11", system: "B", settings: {}, dayOf: d => ({ date: d, workMin: d === "2026-11-02" ? 600 : 0, scheduledMin: 0, nightMin: 0, rest: d !== "2026-11-02" }) });
  assert.deepStrictEqual({ ot: pm.otMin, h: pm.otH, ag: pm.agH, un: pm.unread }, { ot: 120, h: 2, ag: 2, un: false });
  // セル: 月が埋まっていない → 「＋」と淡色、実績を読めない端末 → 注記
  const l = { sys: "A", monthCovered: true, prem: { otMin: 240, dayOverMin: 240, weekOverMin: 0, monthOverMin: 0, nightMin: 0, nightDates: [], legalHolidayMin: 480,
    legalHolidayDates: ["2026-11-15"], legalHolidayManual: [], legalHolidayNightMin: 0, over60Min: 0, unread: false } };
  const c = u.premiumRowCell("ot", l, { actualsReadable: true });
  assert.deepStrictEqual({ v: c.label, t: /①日 4:00／②週 0:00／③月 0:00/.test(c.title) && /実績（入力の無い日は確定シフト）で計算/.test(c.title) }, { v: "4:00", t: true });
  assert.strictEqual(u.premiumRowCell("ot", { ...l, monthCovered: false }, { pendingReason: "途中" }).label, "＋4:00");
  assert.ok(/確定シフトで計算/.test(u.premiumRowCell("legal", l, {}).title));
  assert.strictEqual(u.premiumRowCell("legal", l, {}).label, "8:00");
  assert.strictEqual(u.premiumRowCell("night", l, {}).label, undefined, "0 は空欄");
  const un = u.premiumRowCell("legal", { ...l, prem: { ...l.prem, unread: true } }, {});
  assert.ok(un.label === "＋8:00" && /他店の実績を読み込めていません/.test(un.title));
  // B制の残業予定: この期間の①＋②（分）を時間で
  assert.strictEqual(u.premiumRowCell("bPlan", { ...l, sys: "B", periodOtB: 840, monthOtB: 14 }, { monthLabel: "2026年11" }).label, "14h");
});

// ===== P6b 賃金計算と出力（労務給与_複数法人_実装計画.md §4.5・§6 P6b）=====
// 期待値は手計算（単価＝(基本給＋割増の基礎に入る手当) ÷ 分母(分)。例: 218,500 ÷ 10,398 × 1.25 × 600分 = 15,760.24… → 切上げ 15,761）
const _p6bMonthly = { payType: "monthly", base: 213500, effectiveFrom: "2026-10-01",
  allowances: [{ name: "資格手当", amount: 5000 }, { name: "住宅手当", amount: 20000, excludeFromRate: true, excludeFromDeduction: true }],
  fixedOt: { hours: 30, auto: true }, fixedNight: { hours: 32, amount: 10000 }, commute: { amount: 8000, per: "month" } };
test("P6b 月給者: 固定残業の時間を充当して超えた分だけ時間外手当・深夜割増から固定深夜手当を引く・法定休日・欠勤控除（控除は切捨て）", () => {
  const w = u.wageOf({ pay: _p6bMonthly, denomMin: 10398, times: { workMin: 12000, otMin: 2400, over60Min: 0, nightMin: 2400, legalHolidayMin: 480 } });
  assert.strictEqual(w.basePay, 213500, "月給者は基本給を動かさない");
  assert.strictEqual(w.otCoveredMin, 1800, "固定残業30h を充当");
  assert.strictEqual(w.otPaidMin, 600);
  assert.strictEqual(w.otPay, 15761, "218,500 ÷ 10,398 × 1.25 × 600 = 15,760.24… → 15,761（住宅手当は割増の基礎から除く）");
  assert.strictEqual(w.nightPremium, 12609, "218,500 ÷ 10,398 × 0.25 × 2,400 = 12,608.19… → 12,609");
  assert.strictEqual(w.nightCovered, 10000, "固定深夜手当 10,000 円を充当");
  assert.strictEqual(w.nightPay, 2609);
  assert.strictEqual(w.holidayPay, 13617, "× 1.35 × 480 = 13,616.84… → 13,617");
  assert.strictEqual(w.over60Pay, 0);
  // 欠勤控除: (213,500 + 5,000) ÷ 10,398 × 120 = 2,521.63… → 労働者に有利な向き（切捨て）2,521。住宅手当は控除から除く
  assert.strictEqual(u.deductionOf({ pay: _p6bMonthly, absentMin: 120, denomMin: 10398 }), 2521);
  assert.strictEqual(u.deductionOf({ pay: _p6bMonthly, absentMin: 120, denomMin: 10398, rule: "floor" }), 2522, "支払いを切捨てにしたら控除は切上げ");
  // 固定残業の時間に届かなければ時間外手当は 0（全部充当）
  assert.strictEqual(u.wageOf({ pay: _p6bMonthly, denomMin: 10398, times: { otMin: 1200 } }).otPay, 0);
  // 固定深夜の額が深夜割増を上回れば深夜の支払いは 0
  assert.strictEqual(u.wageOf({ pay: _p6bMonthly, denomMin: 10398, times: { nightMin: 600 } }).nightPay, 0);
  // 額が 0 で時間だけなら、その時間分の深夜割増を充当の上限にする（32h ぶん＝深夜 40h のうち 8h ぶんだけ払う）
  const w2 = u.wageOf({ pay: { ..._p6bMonthly, fixedNight: { hours: 32, amount: 0 } }, denomMin: 10398, times: { nightMin: 2400 } });
  assert.strictEqual(w2.nightCovered, 10087, "218,500 ÷ 10,398 × 0.25 × 1,920 = 10,086.55… → 10,087");
  assert.strictEqual(w2.nightPay, 12609 - 10087);
});
test("P6b 時給者: 時給 × 実労働に、時間外・深夜・法定休日は率の分だけを足す（固定残業・欠勤控除は無い）／端数規則", () => {
  const hp = { payType: "hourly", base: 1231, effectiveFrom: "2026-10-01" };
  const t = { workMin: 10000, otMin: 600, nightMin: 120, legalHolidayMin: 60 };
  const w = u.wageOf({ pay: hp, denomMin: 10398, times: t });
  assert.strictEqual(w.basePay, 205167, "1,231 × 10,000 ÷ 60 = 205,166.66… → 205,167");
  assert.strictEqual(w.otPay, 3078, "1,231 ÷ 60 × 0.25 × 600 = 3,077.5 → 3,078");
  assert.strictEqual(w.nightPay, 616, "× 0.25 × 120 = 615.5 → 616");
  assert.strictEqual(w.holidayPay, 431, "× 0.35 × 60 = 430.85 → 431");
  assert.strictEqual(w.otCoveredMin, 0);
  assert.strictEqual(u.deductionOf({ pay: hp, absentMin: 600, denomMin: 10398 }), 0, "時給者は控除しない");
  const f = u.wageOf({ pay: hp, denomMin: 10398, times: t, rule: "floor" });
  assert.deepStrictEqual([f.basePay, f.otPay, f.nightPay], [205166, 3077, 615]);
  const r = u.wageOf({ pay: hp, denomMin: 10398, times: t, rule: "round" });
  assert.deepStrictEqual([r.basePay, r.otPay, r.nightPay], [205167, 3078, 616], "0.5 は切上げ");
  // 割増率の上乗せ（時間外30%）。1,231 ÷ 60 × 0.30 × 600 = 3,693 ちょうど（浮動小数だと 3,692.99… になるので整数で割る）
  assert.strictEqual(u.wageOf({ pay: hp, denomMin: 10398, times: t, rates: { ...u.LEGAL_PREMIUM_RATES, ot: 30 } }).otPay, 3693);
});
test("P6b 月60h超: 60h を超えた時間外に追加の率（既定25%）", () => {
  const mp = { payType: "monthly", base: 300000, effectiveFrom: "2026-01-01" };
  const w = u.wageOf({ pay: mp, denomMin: 10398, times: { otMin: 4200, over60Min: 600 } });
  assert.strictEqual(w.otPay, 151472, "300,000 ÷ 10,398 × 1.25 × 4,200 = 151,471.43… → 151,472");
  assert.strictEqual(w.over60Pay, 4328, "× 0.25 × 600 = 4,327.75… → 4,328");
  assert.strictEqual(w.premiumTotal, 151472 + 4328);
});
test("P6b 版の選択: 月初時点の版（月の途中の改定は日割りせず注記）／月の途中から適用の人／未設定", () => {
  const pay = { payType: "monthly", base: 220000, effectiveFrom: "2026-11-15",
    history: [{ payType: "monthly", base: 200000, effectiveFrom: "2026-04-01" }] };
  const nov = u.monthlyPayBreakdown({ pay, ym: "2026-11", times: {}, denomMin: 10398 });
  assert.strictEqual(nov.version.base, 200000, "11月は 11/1 時点の版");
  assert.ok(nov.notes.some(x => x.includes("2026-11-15 に改定")), nov.notes.join("|"));
  assert.strictEqual(u.monthlyPayBreakdown({ pay, ym: "2026-12", times: {}, denomMin: 10398 }).version.base, 220000);
  const hire = u.monthlyPayBreakdown({ pay: { payType: "hourly", base: 1300, effectiveFrom: "2026-11-10" }, ym: "2026-11", times: { workMin: 600 } });
  assert.strictEqual(hire.version.base, 1300);
  assert.ok(hire.notes.some(x => x.includes("月の途中から適用")));
  assert.strictEqual(hire.wage.basePay, 13000);
  const none = u.monthlyPayBreakdown({ pay: null, ym: "2026-11", times: { workMin: 600 } });
  assert.strictEqual(none.wage, null);
  assert.ok(none.warnings.some(x => x.key === "noPay"));
});
test("P6b 警告: 年平均所定 > 分母（月給者だけ）・最低賃金割れ", () => {
  const m = { payType: "monthly", base: 213500, effectiveFrom: "2026-10-01" };
  const k = o => u.monthlyPayBreakdown({ ym: "2026-11", times: {}, denomMin: 10398, ...o }).warnings.map(x => x.key);
  assert.ok(k({ pay: m, schedAvgMin: 10500 }).includes("schedAvgOverDenom"));
  assert.ok(!k({ pay: m, schedAvgMin: 10398 }).includes("schedAvgOverDenom"), "等しいときは出さない");
  assert.ok(!k({ pay: m, schedAvgMin: null }).includes("schedAvgOverDenom"));
  assert.ok(!k({ pay: { payType: "hourly", base: 1300, effectiveFrom: "2026-10-01" }, schedAvgMin: 12000 }).includes("schedAvgOverDenom"), "時給者は分母を使わない");
  const ws = { minWage: [{ from: "2026-10-01", yen: 1231 }] };
  assert.ok(k({ pay: { payType: "hourly", base: 1230, effectiveFrom: "2026-10-01" }, wageSettings: ws }).includes("minWage"));
  assert.ok(!k({ pay: { payType: "hourly", base: 1231, effectiveFrom: "2026-10-01" }, wageSettings: ws }).includes("minWage"));
  // 月初時点の最賃（10/1 改定の前の月は旧額）
  assert.ok(!k({ pay: { payType: "hourly", base: 1200, effectiveFrom: "2026-01-01" }, ym: "2026-09", wageSettings: { minWage: [{ from: "2025-10-01", yen: 1177 }, { from: "2026-10-01", yen: 1231 }] } }).includes("minWage"));
});
test("P6b 法人の賃金設定: 割増率は法定より下げられない・端数規則（クライアントと CF が同じ規則）", () => {
  const cases = [
    { premiumRates: { ot: 30, over60: 25, night: 24, holiday: 40 }, roundingRule: "round" },
    { premiumRates: { ot: "35", over60: 50.5, night: 101, holiday: 35 }, roundingRule: "ceil" },
    { premiumRates: { ot: 100 }, roundingRule: "floor", minWage: [{ from: "2026-10-01", yen: 1231 }] },
    { premiumRates: "x", roundingRule: "bogus" },
    null,
  ];
  cases.forEach(c => assert.deepStrictEqual(cfc.sanitizeWageSettings(c), u.sanitizeWageSettings(c), JSON.stringify(c)));
  assert.deepStrictEqual(u.sanitizeWageSettings(cases[0]), { premiumRates: { ot: 30, holiday: 40 }, roundingRule: "round" }, "法定と同じ・下回る値は持たない");
  assert.deepStrictEqual(u.sanitizeWageSettings(cases[1]), { premiumRates: { ot: 35 } }, "既定の ceil は持たない・整数でない・上限超は捨てる");
  assert.deepStrictEqual(u.premiumRatesOf(null), { ot: 25, over60: 25, night: 25, holiday: 35 });
  assert.deepStrictEqual(u.premiumRatesOf(cases[0]), { ot: 30, over60: 25, night: 25, holiday: 40 });
  assert.strictEqual(u.roundingRuleOf(null), "ceil");
  assert.strictEqual(u.roundingRuleOf(cases[2]), "floor");
  // 企業共通と法人の重ね合わせ（CF）: 法人が持てば法人が勝つ（キー単位）
  const merged = cfc.mergeEntitySettings({ wageSettings: { roundingRule: "floor", premiumRates: { ot: 30 } } }, { wageSettings: { premiumRates: { night: 30 } } });
  assert.deepStrictEqual(merged.wageSettings, { roundingRule: "floor", premiumRates: { night: 30 } });
  assert.deepStrictEqual(cfc.sanitizeCompanySettings({ wageSettings: cases[0] }).wageSettings, u.sanitizeWageSettings(cases[0]));
});
test("P6b 月次内訳と CSV: 列の定義を画面と共有・金額はパスコードを解除するまで伏せる（時間は伏せない）", () => {
  const calc = u.monthlyPayBreakdown({ pay: _p6bMonthly, ym: "2026-11", denomMin: 10398,
    times: { scheduledMin: 10598, workMin: 12000, dayOverMin: 600, weekOverMin: 1200, monthOverMin: 600, otMin: 2400, over60Min: 0, nightMin: 2400, legalHolidayMin: 480, absentMin: 120 } });
  const row = { name: "特定 \"A\"", number: "9001", attr: "特定技能", sysLabel: "A", times: calc && { scheduledMin: 10598, workMin: 12000, dayOverMin: 600, weekOverMin: 1200, monthOverMin: 600, otMin: 2400, over60Min: 0, nightMin: 2400, legalHolidayMin: 480, absentMin: 120 }, calc, notes: ["所定は未確定（シフトから集計）"] };
  const v = u.payrollRowValues(row);
  assert.strictEqual(v.otPay, 15761);
  assert.strictEqual(v.deduction, 2521);
  assert.strictEqual(v.otCoveredMin, 1800);
  const locked = u.payrollCsvOf([row], false);
  const unlocked = u.payrollCsvOf([row], true);
  assert.ok(locked.startsWith('"従業員番号","名前"'));
  assert.ok(locked.endsWith("\r\n") && locked.split("\r\n").length === 3, "見出し＋1行・CRLF");
  assert.ok(locked.includes('"特定 ""A"""'), "引用符を二重にする");
  assert.ok(!locked.includes("15761") && locked.includes('"••••"'), "解除していなければ金額を出さない");
  assert.ok(locked.includes('"40:00"') && locked.includes('"176:38"'), "時間は伏せない（時:分）");
  assert.ok(unlocked.includes('"15761"') && unlocked.includes('"2521"') && unlocked.includes('"213500"'));
  assert.ok(unlocked.includes("所定は未確定"));
  // 列の種類: 金額の列は yen、時間の列は time（伏せる／伏せないの規則が列の定義で決まる）
  const kinds = Object.fromEntries(u.PAYROLL_COLUMNS.map(c => [c.key, c.kind]));
  ["otPay", "over60Pay", "nightPay", "nightCovered", "holidayPay", "deduction", "basePay", "rate"].forEach(k => assert.strictEqual(kinds[k], "yen", k));
  ["scheduledMin", "workMin", "dayOverMin", "weekOverMin", "monthOverMin", "otMin", "over60Min", "nightMin", "legalHolidayMin", "absentMin", "otCoveredMin"].forEach(k => assert.strictEqual(kinds[k], "time", k));
});
test("P6b 割増の内訳に月の実労働・所定・不就労の合計が入る（前後の月の日は数えない）／premiumDayInput は他店の不就労も足す", () => {
  const days = [
    { date: "2026-10-31", workMin: 480, scheduledMin: 480, absentMin: 60, rest: false },
    { date: "2026-11-02", workMin: 600, scheduledMin: 480, absentMin: 0, rest: false },
    { date: "2026-11-03", workMin: 0, scheduledMin: 480, absentMin: 480, rest: false },
  ];
  const b = u.premiumBreakdownOf({ system: "B", days, ym: "2026-11" });
  assert.deepStrictEqual([b.workMin, b.scheduledMin, b.absentMin], [600, 960, 480]);
  const x = u.premiumDayInput({ date: "2026-11-04", own: { workMin: 300, absentMin: 30 }, kind: "work",
    helpers: [{ day: { workMin: 120, absentMin: 15 } }] });
  assert.strictEqual(x.absentMin, 45);
});
test("P6b 賃金は PDF・Excel に出ない（書き出しが月次賃金の関数・賃金マスタを参照しない）", () => {
  const src = _readAdminSurface();
  const bodyOf = marker => {
    const i = src.indexOf(marker);
    assert.ok(i > 0, `${marker} が見つからない`);
    // 引数の分割代入（{...}）を本体と読み違えないよう、引数の括弧を閉じてから数える
    let pd = 0, saw = false, k = i;
    for (; k < src.length; k++) { const c = src[k]; if (c === "(") { pd++; saw = true; } else if (c === ")") { pd--; if (saw && pd === 0) { k++; break; } } }
    let d = 0, started = false;
    for (let j = k; j < src.length; j++) {
      const c = src[j];
      if (c === "{") { d++; started = true; } else if (c === "}") { d--; if (started && d === 0) return src.slice(i, j + 1); }
    }
    assert.fail(`${marker} の本体を切り出せなかった`);
  };
  for (const [label, marker] of [["PDF", "const buildShiftTableHtml="], ["Excel", "function expXl("], ["全データPDF", "const exportPdf="]]) {
    const body = bodyOf(marker);
    assert.ok(body.length > 1000, `${label}: 本体の切り出しが短すぎる`);
    for (const ident of ["monthlyPayBreakdown", "payrollCsvOf", "payrollRowValues", "PAYROLL_COLUMNS", "wageOf(", "deductionOf(", "private/pay", "payMap", "payrollReportRef"]) {
      assert.ok(!body.includes(ident), `${label} の書き出しが ${ident} を参照している`);
    }
  }
  // 月次賃金ページは CSV だけを出す（jsPDF・ExcelJS を使わない）
  const pg = bodyOf("function PayrollPage(");
  assert.ok(pg.includes("payrollCsvOf(") && !/jspdf|jsPDF|ExcelJS|exportPdf|expXl/.test(pg));
});

// ===== 非表示マウントが読む提出の範囲（2026-09-30・P7 の前に実測して修正）=====
test("laborReadPeriodIds: 年度の全期間と前後の週にかかる期間を返す（一括PDF・ダッシュボードの年の値）", () => {
  const P = (id, s, e) => ({ id, startDate: s, endDate: e });
  const periods = [
    P("mar2", "2026-03-16", "2026-03-31"), // 年度の外だが4/1の週（前の週）にかかる
    P("mar1", "2026-03-01", "2026-03-15"), // 年度の外・週にもかからない
    P("apr", "2026-04-01", "2026-04-30"), P("sep", "2026-09-01", "2026-09-30"), P("oct", "2026-10-01", "2026-10-31"),
    P("nov", "2026-11-01", "2026-11-30"), // 年度内の後の期間（年計に入るので読む）
    P("mar27", "2027-03-01", "2027-03-31"), P("apr27", "2027-04-01", "2027-04-30"), // 翌年度（最初の週は年度末の月をまたぐ週にかかる）
    P("may27", "2027-05-01", "2027-05-31"), // 翌年度・週にもかからない
    { id: "bad", startDate: "", endDate: "2026-10-01" },
  ];
  const st = { laborSettings: { fiscalYearStartMonth: 4 } };
  assert.deepStrictEqual(u.laborReadPeriodIds(periods, st, "2026-10-01", "2026-10-31").sort(),
    ["apr", "apr27", "mar2", "mar27", "nov", "oct", "sep"]);
  // 暦年（1月開始）なら 2026-03 の期間も同じ年
  assert.ok(u.laborReadPeriodIds(periods, { laborSettings: { fiscalYearStartMonth: 1 } }, "2026-10-01", "2026-10-31").includes("mar1"));
  assert.deepStrictEqual(u.laborReadPeriodIds(periods, st, "", "2026-10-31"), []);
});

test("一括PDFの読み込みは laborReadPeriodIds を通す（直前の期間だけを読む形に戻さない）", () => {
  const src = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "app-company.js"), "utf8");
  const i = src.indexOf("function CompanyBulkPdf(");
  const body = src.slice(i, src.indexOf("\nfunction ", i + 10));
  assert.ok(body.includes("laborReadPeriodIds(") && body.includes("pastSubsLoaded={true}"));
});

// ===== 企業横断ダッシュボード（2026-09-30・P7）=====
test("P7 agreementYearStatus: 判定（agreementYearFindings）と同じ合計・45h超の回数・複数月平均の最大（80h以下でも返す）", () => {
  const M = arr => arr.map(([h, ag], i) => ({ ym: `2026-${String(4 + i).padStart(2, "0")}`, h, ag }));
  const st = u.agreementYearStatus(M([[40, 40], [50, 90], [30, 80]]));
  assert.strictEqual(st.totalH, 120);
  assert.strictEqual(st.n45, 1);
  assert.deepStrictEqual(st.worstAvg, { w: 2, avg: 85 }); // 窓 [90,80]
  assert.deepStrictEqual(u.agreementYearFindings(M([[40, 40], [50, 90], [30, 80]]), 360).map(f => f.key), ["avgOver80"]);
  // 80h 以下でも最大の窓を返す（ダッシュボードの「80hの残り」）が、判定は出さない
  const low = u.agreementYearStatus(M([[10, 10], [20, 30]]));
  assert.deepStrictEqual(low.worstAvg, { w: 2, avg: 20 });
  assert.deepStrictEqual(u.agreementYearFindings(M([[10, 10], [20, 30]]), 360), []);
  assert.strictEqual(u.agreementYearStatus([]).worstAvg, null);
  assert.strictEqual(u.agreementYearStatus(M([[50, 50]])).worstAvg, null); // 窓は2か月から
});

test("P7 annualRestStatusOf: 52日以上＝ok／残りの日で届かない・年度の最後＝short／それ以外と読めていない期間があるときは pending", () => {
  assert.strictEqual(u.ANNUAL_REST_MIN_DAYS, 52);
  assert.deepStrictEqual(u.annualRestStatusOf({ restDays: 52, remainDays: 0, final: true }), { key: "ok", days: 52, need: 0 });
  assert.strictEqual(u.annualRestStatusOf({ restDays: 20, remainDays: 200 }).key, "pending");
  assert.strictEqual(u.annualRestStatusOf({ restDays: 20, remainDays: 31 }).key, "short");   // 残り31日で32日は無理
  assert.strictEqual(u.annualRestStatusOf({ restDays: 50, remainDays: 0, final: true }).key, "short");
  assert.strictEqual(u.annualRestStatusOf({ restDays: 50, remainDays: 0, final: true, missing: 1 }).key, "pending");
  assert.strictEqual(u.annualRestStatusOf({ restDays: 20, remainDays: 31 }).need, 32);
});

test("P7 monthPeriodProgressOf: その月にかかる期間の確定・交付の数（periodStateOf の数え上げ）", () => {
  const at = "2026-10-01T00:00:00.000Z";
  const ps = [
    { id: "a", label: "10月前半", startDate: "2026-10-01", endDate: "2026-10-15", submission: { at }, confirmation: { at }, delivery: { at } },
    { id: "b", label: "10月後半", startDate: "2026-10-16", endDate: "2026-10-31", submission: { at } },
    { id: "c", label: "9月後半", startDate: "2026-09-16", endDate: "2026-09-30", confirmation: { at } },
  ];
  const pg = u.monthPeriodProgressOf(ps, "2026-10");
  assert.deepStrictEqual({ t: pg.total, s: pg.submitted, c: pg.confirmed, d: pg.delivered }, { t: 2, s: 2, c: 1, d: 1 });
  assert.deepStrictEqual(pg.labels, ["10月前半: 交付済み", "10月後半: 提出済み"]);
  assert.strictEqual(u.monthProgressLabel(pg), "確定 1/2・交付 1/2");
  assert.strictEqual(u.monthProgressLabel(u.monthPeriodProgressOf(ps, "2026-12")), "期間なし");
});

test("P7 dashboardPersonView: 所定と上限の差・年平均と分母の差・36協定の残り・年間休日（手計算）", () => {
  const ctx = { capMin: 10599, capName: "所定上限", denomMin: 10398, agMonthH: 45, agYearH: 360, restRemainDays: 200, restFinal: false };
  const r = { name: "田中", number: "12", sys: "A", schedMin: 11000, schedSource: "frozen", schedPartial: false, avgMin: 10500, avgMissing: 0,
    monthOtH: 50, monthPartial: false, yearMonths: [{ ym: "2026-04", h: 40, ag: 40 }, { ym: "2026-05", h: 50, ag: 90 }, { ym: "2026-06", h: 30, ag: 80 }],
    yearMissing: [], restDays: 20, restMissing: 0 };
  const v = u.dashboardPersonView(r, ctx);
  assert.deepStrictEqual({ d: v.schedDiffMin, o: v.schedOver, ad: v.avgDiffMin, ao: v.avgOver }, { d: 401, o: true, ad: 102, ao: true });
  assert.deepStrictEqual({ m: v.monthLeftH, y: v.yearOtH, yl: v.yearLeftH, y7: v.year720LeftH, wa: v.worstAvgH, w: v.worstAvgW, a8: v.avg80LeftH, n: v.n45, nl: v.n45Left },
    { m: -5, y: 120, yl: 240, y7: 600, wa: 85, w: 2, a8: -5, n: 1, nl: 5 });
  assert.strictEqual(v.agOver, true);
  assert.deepStrictEqual(v.rest, { key: "pending", days: 20, need: 32 });
  const val = u.dashboardRowValues({ view: v, entity: "法人A", shop: "A店", progress: "確定 1/1・交付 0/1" });
  const txt = k => u.dashboardCellText(u.DASHBOARD_COLUMNS.find(c => c.key === k), val);
  assert.deepStrictEqual(["schedMin", "capMin", "schedDiffMin", "avgDiffMin", "monthLeftH", "yearLeftH", "worstAvgH", "avg80LeftH", "n45", "restDays", "restNeed", "sys"].map(txt),
    ["183:20", "176:39", "+6:41", "+1:42", "−5:00", "+240:00", "85:00", "−5:00", "1回", "20日", "32日", "変形"]);
  assert.ok(/年間休日はあと32日（年度の途中）/.test(val.notes) && /複数月平均の最大は2か月/.test(val.notes));
  // 月が埋まっていない（途中）なら、月の残業の超過・月所定の超過は出さない（労務判定表の monthReady・labor_sched と同じ）
  const p = u.dashboardPersonView({ ...r, schedPartial: true, monthPartial: true, schedSource: "auto", yearMonths: [], avgMin: 100 }, ctx);
  assert.deepStrictEqual({ so: p.schedOver, ag: p.agOver, ao: p.avgOver }, { so: false, ag: false, ao: false });
  assert.ok(/＋月の日がデータで埋まっていない途中の値/.test(u.dashboardRowValues({ view: p }).notes));
  // B制は所定の超過を出さない（A制の枠）。行き先・データの無い人は注記だけ（応援・外部は B と同じ行になる・2026-10-03）
  assert.strictEqual(u.dashboardPersonView({ ...r, sys: "B" }, ctx).schedOver, false);
  assert.strictEqual(u.dashboardRowValues({ view: u.dashboardPersonView({ name: "佐藤", sys: "B", dest: true, homeName: "B店" }, ctx) }).notes, "所属店舗（B店）で集計します");
  assert.strictEqual(u.dashboardRowValues({ view: u.dashboardPersonView({ name: "外部", sys: "B", skip: "noData" }, ctx) }).notes, "データがありません");
  assert.strictEqual(u.dashboardRowValues({ view: u.dashboardPersonView({ name: "外部", sys: "B", skip: "noData" }, ctx) }).sys, "通常");
  assert.deepStrictEqual(u.dashboardCountsOf([v, p, u.dashboardPersonView({ name: "佐藤", dest: true }, ctx)]),
    { people: 2, schedOver: 1, avgOver: 1, agOver: 1, restShort: 0 });
});

test("P7 dashboardCsvOf: 見出しと人の行・店舗の注記の行（金額の列は無い）", () => {
  const ctx = { capMin: 10599, denomMin: 10398, agMonthH: 45, agYearH: 360, restRemainDays: 0, restFinal: true };
  const v = u.dashboardPersonView({ name: "田中", number: "12", sys: "A", schedMin: 10000, schedPartial: false, avgMin: 10000, avgMissing: 0,
    monthOtH: 10, yearMonths: [{ ym: "2027-03", h: 10, ag: 10 }], yearMissing: [], restDays: 60, restMissing: 0 }, ctx);
  const csv = u.dashboardCsvOf([{ view: v, entity: "法人A", shop: "A店", progress: "確定 1/1・交付 1/1" }, { entity: "法人A", shop: "B店", progress: "期間なし", shopNote: "この月にかかる期間がありません" }]);
  const lines = csv.split("\r\n");
  assert.strictEqual(lines.length, 4);
  assert.ok(lines[0].startsWith('"法人","店舗","確定・交付","従業員番号","名前","区分","月所定（時:分）"'));
  assert.ok(lines[1].startsWith('"法人A","A店","確定 1/1・交付 1/1","12","田中","変形","166:40","176:39","−9:59"'));
  assert.ok(lines[1].includes('"60日","0日"') && lines[1].endsWith('"年間休日52日以上"'));
  assert.ok(lines[2].startsWith('"法人A","B店","期間なし","",""') && lines[2].endsWith('"この月にかかる期間がありません"'));
  assert.ok(!/円|賃金|時給|基本給/.test(lines[0]));
});

test("P7 ダッシュボードは労務判定表と同じ値を返し、賃金を読まない・書き込まない（ドリフト検出）", () => {
  const src = _readAdminSurface();
  const bodyOf = (marker, endMarker) => { const i = src.indexOf(marker); assert.ok(i >= 0, marker); const j = src.indexOf(endMarker, i + marker.length); return src.slice(i, j < 0 ? undefined : j); };
  // ShiftEditTab の書き出しジョブ: 労務判定表と同じ入力（laborByStaff・schedAvgByStaff・laborMonthOf・schedCapOf・yearOvertimeMonths・yearLaborSummary）
  const rep = bodyOf("dashboardReportRef.current=()=>{", "// 人×月の所定の手修正欄");
  for (const id of ["laborByStaff[name]", "schedAvgByStaff[name]", "laborMonthOf(lm.map", "schedCapOf()", "yearOvertimeMonths(", "yearLaborSummary(", "liveMonthOtFor(name)", "liveTotalFor(name)"])
    assert.ok(rep.includes(id), `ダッシュボードの値が ${id} を通っていない`);
  assert.ok(src.includes('exportJob.kind==="dashboard"'));
  // カード: 年度の全期間を読み、非表示マウントは書き込まない。賃金（private/pay・月次賃金の関数）を参照しない
  const card = bodyOf("async function loadShopForDashboard(", "// 企業アカウントでログイン");
  assert.ok(card.includes("laborReadPeriodIds(") && card.includes("pastSubsLoaded={true}") && card.includes("savePeriods={null}") && card.includes("ownerReadOnly={true}") && card.includes("allLinkedShops={[]}"));
  for (const id of ["private/pay", "private`", "payMap", "monthlyPayBreakdown", "wageOf(", "payrollCsvOf", "PAYROLL_COLUMNS", "/private"])
    assert.ok(!card.includes(id), `ダッシュボードが ${id} を参照している`);
  for (const id of ["fbUpd(", "fbSet(", ".set(", ".update(", "savePeriods("])
    assert.ok(!card.includes(id), `ダッシュボードが書き込み ${id} を持っている`);
});

// ===== 労務判定の法人への統合（2026-10-01）=====
test("planLaborToEntities: 企業の労務設定を全法人へ移しても写し（buildShopMirror）は1つも変わらない", () => {
  const cc = require("../functions/company-config.js");
  // 本番の NITO と同じ形: 企業に7項目、法人2つはどちらも laborSettings を持たない
  const coLabor = { agreementAnnualOtMin: 21600, agreementDailyOtMin: 180, agreementMonthlyOtMin: 2700, fiscalYearStartMonth: 1, fixedOvertimeMin: 1800, marginMin: 420, monthlyBase31Min: 10628 };
  const coSettings = { laborSettings: coLabor, staffTypeLimits: { co_Hzxk84Qv: { name: "特定技能", laborSystem: "A", monthly: 222, monthlyMin: 207 } } };
  const pubBefore = {
    name: "NITO", shops: { S1: true, S2: true, S3: true }, defaultEntityId: "E1",
    entities: { E1: { name: "ニトエンターテイメント" }, E2: { name: "ニトエンタープライズ", settings: { wageSettings: { minWage: [{ from: "2026-10-01", yen: 1177 }] } } } },
    shopEntities: { S1: "E1", S2: "E2" }, config: { settings: coSettings },
  };
  const plan = u.planLaborToEntities(coSettings, pubBefore);
  assert.ok(plan, "移す計画が返る");
  assert.deepStrictEqual(Object.keys(plan.entities).sort(), ["E1", "E2"]);
  assert.deepStrictEqual(plan.entities.E1.laborSettings, coLabor);
  assert.deepStrictEqual(plan.entities.E2.wageSettings, { minWage: [{ from: "2026-10-01", yen: 1177 }] }, "法人の他の設定は送り直す");
  assert.strictEqual(plan.company.laborSettings, undefined, "企業側から laborSettings を外す");
  assert.deepStrictEqual(plan.company.staffTypeLimits, coSettings.staffTypeLimits, "属性別の制限は企業に残す");
  // CF（saveEntityConfig / saveCompanyConfig）が保存する形に通してから写しを作る
  const ents = JSON.parse(JSON.stringify(pubBefore.entities));
  for (const id of Object.keys(plan.entities)) ents[id].settings = cc.sanitizeCompanySettings(plan.entities[id]);
  const pubAfter = { ...pubBefore, entities: ents, config: { settings: cc.sanitizeCompanySettings(plan.company) } };
  assert.strictEqual(pubAfter.config.settings.laborSettings, undefined);
  for (const sid of ["S1", "S2", "S3"]) {
    const a = cc.buildShopMirror("C1", pubBefore, sid, {}, "T"), b = cc.buildShopMirror("C1", pubAfter, sid, {}, "T");
    assert.deepStrictEqual(b, a, `${sid} の写しが移行の前後で変わらない`);
    assert.deepStrictEqual(b.settings.laborSettings, coLabor);
  }
  // 2回目は移すものが無い（冪等）
  assert.strictEqual(u.planLaborToEntities(pubAfter.config.settings, pubAfter), null);
});
test("planLaborToEntities: 法人が持つ値は法人が勝つ（写しの重ね合わせと同じ）", () => {
  const cc = require("../functions/company-config.js");
  const coSettings = { laborSettings: { marginMin: 420, fixedOvertimeMin: 1800 } };
  const pub = { shops: { S1: true }, defaultEntityId: "E1", entities: { E1: { name: "A", settings: { laborSettings: { marginMin: 60 } } } }, config: { settings: coSettings } };
  const plan = u.planLaborToEntities(coSettings, pub);
  assert.deepStrictEqual(plan.entities.E1.laborSettings, { marginMin: 60, fixedOvertimeMin: 1800 });
  const after = { ...pub, entities: { E1: { name: "A", settings: cc.sanitizeCompanySettings(plan.entities.E1) } }, config: { settings: cc.sanitizeCompanySettings(plan.company) } };
  assert.deepStrictEqual(cc.buildShopMirror("C1", after, "S1", {}, "T"), cc.buildShopMirror("C1", pub, "S1", {}, "T"));
});
test("planLaborToEntities: 移すものが無い・法人が無い・どの法人にも属さない店舗があるときは null", () => {
  const lab = { laborSettings: { marginMin: 420 } };
  assert.strictEqual(u.planLaborToEntities({}, { shops: { S1: true }, defaultEntityId: "E1", entities: { E1: { name: "A" } } }), null);
  assert.strictEqual(u.planLaborToEntities({ laborSettings: {} }, { shops: { S1: true }, defaultEntityId: "E1", entities: { E1: { name: "A" } } }), null);
  assert.strictEqual(u.planLaborToEntities(lab, { shops: { S1: true } }), null, "法人の無い企業（移行前）");
  // 既定の法人が無く、割当の無い店舗がある＝その店舗は移行で労務設定を失うので移さない
  assert.strictEqual(u.planLaborToEntities(lab, { shops: { S1: true, S2: true }, entities: { E1: { name: "A" } }, shopEntities: { S1: "E1" } }), null);
  assert.ok(u.planLaborToEntities(lab, { shops: { S1: true }, entities: { E1: { name: "A" } }, shopEntities: { S1: "E1" } }));
});
test("企業の共通設定カードは労務判定の欄を持たず、法人の設定だけが持つ（2026-10-01 の統合）", () => {
  const src = _readAdminSurface();
  const cfg = src.slice(src.indexOf("function CompanyConfigCard("), src.indexOf("function CompanyEntityCard("));
  assert.ok(cfg.length > 1000);
  assert.ok(!cfg.includes("<CoLaborFields"), "企業の共通設定に労務判定の欄が残っている");
  assert.ok(!cfg.includes("<AL>労務判定</AL>"));
  const ent = src.slice(src.indexOf("function CompanyEntityCard("), src.indexOf("function EntityFilter("));
  assert.ok(ent.includes("<CoLaborFields"), "法人の設定に労務判定の欄が無い");
  assert.ok(ent.includes("労務判定（空欄は店舗の設定）"));
  assert.ok(ent.includes("planLaborToEntities("), "法人カードが移行の計画を通していない");
});

// ===== 特定技能の週の公休（2026-10-01）=====
const _wk = (start) => { const out = []; const d = new Date(start + "T00:00:00"); for (let i = 0; i < 7; i++) { const x = new Date(d); x.setDate(d.getDate() + i); out.push(u.fd(x)); } return out; };
test("skilledWeekRestStateOf: 月をまたがない週は従来の週1休（公休0で違反・1でOK）", () => {
  const ds = _wk("2026-09-14");
  const w = ["work", "work", "work", "work", "work", "work", "work"];
  const st0 = u.skilledWeekRestStateOf(w, ds);
  assert.strictEqual(st0.key, "none"); assert.strictEqual(st0.label, "×休なし"); assert.ok(u.isSkilledWeekRestShort(st0));
  const st1 = u.skilledWeekRestStateOf(["work", "work", "rest", "work", "work", "work", "work"], ds);
  assert.strictEqual(st1.key, "ok"); assert.strictEqual(st1.label, "休1"); assert.ok(!u.isSkilledWeekRestShort(st1));
});
test("skilledWeekRestStateOf: 9/28〜10/4 は9月側・10月側に各1回の公休が要る", () => {
  const ds = _wk("2026-09-28");
  assert.deepStrictEqual(ds.map(d => d.slice(5)), ["09-28", "09-29", "09-30", "10-01", "10-02", "10-03", "10-04"]);
  // 9月側に公休0・10月側に1 → 違反（従来の週1休なら休1でOK）
  const k = ["work", "work", "work", "work", "rest", "work", "work"];
  assert.strictEqual(u.weekRestStateOf(k).key, "ok", "従来の週1休では OK");
  const st = u.skilledWeekRestStateOf(k, ds);
  assert.strictEqual(st.key, "skilledNone"); assert.strictEqual(st.label, "×休1"); assert.ok(u.isSkilledWeekRestShort(st));
  assert.strictEqual(u.skilledWeekSidesLabel(st), "9月側 0日・10月側 1日");
  // 両側1 → OK
  const ok = u.skilledWeekRestStateOf(["work", "rest", "work", "work", "rest", "work", "work"], ds);
  assert.strictEqual(ok.key, "ok"); assert.strictEqual(ok.label, "休2");
  assert.strictEqual(u.skilledWeekSidesLabel(ok), "9月側 1日・10月側 1日");
  // 有給は公休に数えない（既存の週の休みと同じ）
  assert.strictEqual(u.skilledWeekRestStateOf(["work", "leave", "work", "work", "rest", "work", "work"], ds).key, "skilledNone");
});
test("skilledWeekRestStateOf: データの無い日を含む側は判定しない（partial）", () => {
  const ds = _wk("2026-09-28");
  // 10月側がまだ無い（次の期間が未作成）・9月側に公休1 → 判定できる側は満たしている → partial
  const p = u.skilledWeekRestStateOf(["work", "rest", "work", "nodata", "nodata", "nodata", "nodata"], ds);
  assert.strictEqual(p.key, "partial"); assert.strictEqual(p.label, "＋休1"); assert.ok(!u.isSkilledWeekRestShort(p));
  assert.strictEqual(u.skilledWeekSidesLabel(p), "9月側 1日・10月側 ＋0日");
  // 9月側が揃っていて公休0なら、10月側が無くても違反
  const v = u.skilledWeekRestStateOf(["work", "work", "work", "nodata", "nodata", "nodata", "nodata"], ds);
  assert.strictEqual(v.key, "skilledNone");
  // 9月側に nodata があり公休0 → 判定しない
  assert.strictEqual(u.skilledWeekRestStateOf(["nodata", "work", "work", "work", "rest", "work", "work"], ds).key, "partial");
});
test("isSkilledWorkerAttr: 属性名に「特定技能」を含む人だけ（企業属性・店舗属性とも）。応援・外部の属性も対象（B と同じ判定）", () => {
  const settings = {
    staffAttributes: { "グエン": "co_Hzxk84Qv", "リン": "custom_t1", "田中": "employee", "佐藤": "parttime", "応援": "custom_t2", "無し": undefined },
    staffTypeLimits: { co_Hzxk84Qv: { name: "特定技能", laborSystem: "A" }, custom_t1: { name: "特定技能1", laborSystem: "A" }, custom_t2: { name: "特定技能（応援）", laborSystem: "none" } },
  };
  assert.strictEqual(u.isSkilledWorkerAttr(settings, "グエン"), true);
  assert.strictEqual(u.isSkilledWorkerAttr(settings, "リン"), true);
  assert.strictEqual(u.isSkilledWorkerAttr(settings, "田中"), false);
  assert.strictEqual(u.isSkilledWorkerAttr(settings, "佐藤"), false);
  // 2026-10-03: 応援・外部は B と同じ判定にしたので、名前に「特定技能」を含めば対象（以前は判定対象外として除いた）
  assert.strictEqual(u.isSkilledWorkerAttr(settings, "応援"), true, "応援・外部でも名前に特定技能を含めば対象");
  assert.strictEqual(u.isSkilledWorkerAttr(settings, "無し"), false);
  assert.strictEqual(u.isSkilledWorkerAttr({}, "誰か"), false);
});
test("laborFindingsFor: 特定技能の週の公休不足が該当週つきで出て、総括は要修正（A制・B制とも・内部値 none は出さない）", () => {
  const fa = u.laborFindingsFor({ laborSystem: "A", skilledWeekDates: ["2026-09-28"] });
  const f = fa.find(x => x.key === "skilledWeekRest");
  assert.ok(f); assert.strictEqual(f.label, "特定技能の週の公休不足（28〜4）");
  assert.ok(u.OVERALL_FIX_KEYS.includes("skilledWeekRest"));
  assert.strictEqual(u.overallVerdictOf({ laborSystem: "A", findings: fa }).key, "fix");
  const fb = u.laborFindingsFor({ laborSystem: "B", skilledWeekDates: ["2026-09-14", "2026-09-28"] });
  assert.strictEqual(fb.find(x => x.key === "skilledWeekRest").label, "特定技能の週の公休不足（14〜20・28〜4）");
  assert.strictEqual(u.overallVerdictOf({ laborSystem: "B", findings: fb }).key, "fix");
  assert.ok(!u.laborFindingsFor({ laborSystem: "none", skilledWeekDates: ["2026-09-28"] }).some(x => x.key === "skilledWeekRest"));
  assert.ok(!u.laborFindingsFor({ laborSystem: "A" }).some(x => x.key === "skilledWeekRest"), "渡さなければ出ない");
  // 2026-10-08 のユーザー指示で、不足した週の出勤日を紫で塗るようになった（skilledShortWorkDates）
  assert.ok(u.LABOR_DAY_FIX_KEYS.includes("skilledWeekRest"), "セル色を塗る");
});
test("特定技能の週の公休はシフト作成タブの週の休みと労務判定の両方が同じ判定を通す（ドリフト検出）", () => {
  const src = _readAdminSurface();
  assert.ok(src.includes("skilledWeekRestStateOf(kinds,wds)"), "週の休みが特定技能の判定を通していない");
  assert.ok(src.includes("isSkilledWorkerAttr(settings,name)"));
  assert.ok(/skilledWeekDates=weeks\.filter\([^\n]{0,200}?weekRestByStaff[^\n]{0,120}?isSkilledWeekRestShort\(st\)/.test(src), "労務判定が週の休みと同じ状態から該当週を作っていない");
  assert.ok(src.includes("skilledWeekDates,"), "laborFindingsFor に該当週を渡していない");
});

// ===== F6 入力の確認（シフトひな型2026-10版_取り込みと差分_実装計画.html 第3部 F6・D11）=====
// ひな型が「入力の問題」として要修正にしていた日（片側だけ・読めない文字・番号の不備）を、Shifty では
// 「入力の確認」として労務の確認パネルに並べる。**要修正ではない**（総括を変えない）。
test("F6 inputCheckOfShift: 片側だけの日（補完が効く日）を oneSided、時刻もコマンドも無い文字だけのセルを memoOnly にする", () => {
  const ic = (sh, ab) => u.inputCheckOfShift(sh, ab);
  // ① 片側だけ（グリッドの入力の形: 管理者調整値は adjustedXxx、空欄の上書きは ""）
  assert.deepStrictEqual(ic({ status: "work", adjustedEnd: "23:00" }), { oneSided: true, memoOnly: false }, "退勤だけ");
  assert.deepStrictEqual(ic({ status: "work", adjustedStart: "11:00" }), { oneSided: true, memoOnly: false }, "出勤だけ");
  assert.deepStrictEqual(ic({ status: "work", start: "09:00", adjustedEnd: "" }), { oneSided: true, memoOnly: false }, "提出の退勤を空欄で上書き");
  assert.deepStrictEqual(ic({ status: "work", adjustedStart: "09:00", adjustedEnd: "18:00" }), { oneSided: false, memoOnly: false }, "両側あり");
  assert.deepStrictEqual(ic({ status: "work", adjustedStart: "18:00", adjustedEnd: "09:00" }), { oneSided: false, memoOnly: false }, "退勤≦出勤は timeError の領分");
  // 空いている側が意図した空欄（休み希望・半日の休暇・締め）なら出さない
  assert.strictEqual(ic({ status: "work", adjustedStart: "11:00", adminRest: { end: true } }).oneSided, false, "退勤側が休み希望");
  assert.strictEqual(ic({ status: "work", adjustedStart: "11:00", adminRest: { end: true }, leaveTypes: { end: "paid" } }).oneSided, false, "退勤側が半日の有給");
  assert.strictEqual(ic({ status: "work", adjustedStart: "17:00", adjustedEndFixed: true, extraStart: "23:00", extraEnd: "25:00" }).oneSided, false, "退勤側が締め");
  // 応援の指定（x・店舗略称）は出勤セルだけ＝ランチ帯の応援、の設計どおりの入力なので出さない
  const AB = { "三": { id: "S3", name: "三ビル" } };
  assert.strictEqual(ic({ status: "work", adjustedStart: "09:00", adjustedStartNote: "三" }, AB).oneSided, false, "略称つきの応援");
  assert.strictEqual(ic({ status: "work", adjustedStart: "09:00", adjustedStartNote: "x" }).oneSided, false, "x の応援");
  assert.strictEqual(ic({ status: "work", adjustedStart: "09:00", adjustedStartNote: "k" }).oneSided, true, "h/k は帯の担当で応援ではない");
  assert.strictEqual(ic({ status: "holiday", start: "09:00" }).oneSided, false, "出勤でない日");
  // ② 読めない文字だけ（extractNote("事務11") は時刻を取れず note に全体が残る）
  assert.deepStrictEqual(u.extractNote("事務11"), { numeric: "", note: "事務11", rest: false, hasFixed: false });
  assert.deepStrictEqual(ic({ status: "work", adjustedStart: "", adjustedStartNote: "事務11" }), { oneSided: false, memoOnly: true });
  assert.deepStrictEqual(ic({ status: "work", adjustedStart: "", adjustedStartNote: "事務11", adjustedEnd: "17:00" }), { oneSided: true, memoOnly: true }, "片側だけかつメモ");
  assert.strictEqual(ic({ status: "work", adjustedStart: "09:00", adjustedStartNote: "研修", adjustedEnd: "18:00" }).memoOnly, false, "時刻つきのメモは対象外");
  assert.strictEqual(ic({ status: "work", adjustedStart: "", adjustedStartNote: "x" }).memoOnly, false, "h/k/x 単独は x に正規化されコマンド");
  assert.strictEqual(ic({ status: "work", adjustedStart: "", adjustedStartNote: "三" }, AB).memoOnly, false, "店舗略称だけ");
  assert.strictEqual(ic({ status: "work", adjustedStart: "", adjustedStartNote: "三" }).memoOnly, true, "略称が企業に無ければ読めない文字");
  assert.strictEqual(ic({ status: "work", adminRest: { start: true }, adjustedStartNote: "事務11" }).memoOnly, false, "休み希望のセルはメモを読まない");
  assert.deepStrictEqual(ic(null), { oneSided: false, memoOnly: false });
  assert.deepStrictEqual(ic(undefined, AB), { oneSided: false, memoOnly: false });
});
test("F6 isStaffNumberMissing: 空欄・空白だけ・「派遣」を未設定とみなす", () => {
  const st = { staffNumbers: { 田中: "012", 佐藤: " ", 鈴木: "派遣", 高橋: "派遣元A1" } };
  assert.strictEqual(u.isStaffNumberMissing(st, "田中"), false);
  assert.strictEqual(u.isStaffNumberMissing(st, "佐藤"), true);
  assert.strictEqual(u.isStaffNumberMissing(st, "鈴木"), true);
  assert.strictEqual(u.isStaffNumberMissing(st, "高橋"), false, "派遣元の番号は設定済み");
  assert.strictEqual(u.isStaffNumberMissing(st, "未登録"), true);
  assert.strictEqual(u.isStaffNumberMissing({}, "田中"), true);
  assert.strictEqual(u.isStaffNumberMissing(null, "田中"), true);
});
test("F6 laborFindingsFor: 入力の確認n日（…）と従業員番号が未設定を出し、総括は変えない", () => {
  const dates = ["2026-10-03", "2026-10-07", "2026-10-09", "2026-10-12"];
  const base = { laborSystem: "A", dayMins: [480, 480], monthReady: true };
  const f = u.laborFindingsFor({ ...base, inputCheckDates: dates, staffNumberMissing: true });
  assert.deepStrictEqual(f.map(x => x.key), ["inputCheck", "inputCheckNumber"]);
  assert.strictEqual(f[0].label, "入力の確認4日（3・7・9・12）");
  assert.strictEqual(f[1].label, "従業員番号が未設定");
  // 重複・並びの乱れは日付で整える
  assert.strictEqual(u.laborFindingsFor({ ...base, inputCheckDates: ["2026-10-09", "2026-10-03", "2026-10-09"] })[0].label, "入力の確認2日（3・9）");
  // 内部値 none（所属店舗で判定する人）にも①②は出すが、番号は出さない
  const none = u.laborFindingsFor({ laborSystem: "none", inputCheckDates: dates, staffNumberMissing: true });
  assert.deepStrictEqual(none.map(x => x.key), ["inputCheck"]);
  // B制にも番号は出す。区分が空欄（null）の人は区分の指摘だけで番号は出さない
  assert.ok(u.laborFindingsFor({ laborSystem: "B", staffNumberMissing: true }).some(x => x.key === "inputCheckNumber"));
  assert.ok(!u.laborFindingsFor({ laborSystem: null, staffNumberMissing: true }).some(x => x.key === "inputCheckNumber"));
  // 何も渡さなければ従来と同じ
  assert.deepStrictEqual(u.laborFindingsFor(base), []);
  // 要修正ではない＝総括を変えない（A・B・none とも）
  assert.ok(!u.OVERALL_FIX_KEYS.includes("inputCheck") && !u.OVERALL_FIX_KEYS.includes("inputCheckNumber"));
  assert.ok(!u.LABOR_DAY_FIX_KEYS.includes("inputCheck") && !u.LABOR_DAY_FIX_KEYS.includes("inputCheckNumber"));
  assert.deepStrictEqual(u.overallVerdictOf({ laborSystem: "A", findings: f, guideKey: "ok", monthReady: true }), { key: "ok", label: "OK" });
  assert.deepStrictEqual(u.overallVerdictOf({ laborSystem: "A", findings: f, guideKey: "ok", monthReady: false }), { key: "ok_partial", label: "＋OK" });
  assert.deepStrictEqual(u.overallVerdictOf({ laborSystem: "B", findings: u.laborFindingsFor({ laborSystem: "B", inputCheckDates: dates, staffNumberMissing: true }), monthReady: true }), { key: "ok", label: "OK" });
  assert.deepStrictEqual(u.overallVerdictOf({ laborSystem: "none", findings: none }), { key: "none", label: "" });
  // 日ごとの色（laborDayFindingsFor）は入力の確認を返さない
  assert.deepStrictEqual(u.laborDayFindingsFor({ laborSystem: "A", dayMins: [480, 480] }), [[], []]);
});
test("F6 ドリフト検出: シフト作成タブの労務判定は入力の確認と従業員番号を laborFindingsFor へ渡す", () => {
  const fs = require("node:fs"), path = require("node:path");
  const src = fs.readFileSync(path.join(__dirname, "..", "app-shift.js"), "utf8");
  assert.ok(/inputCheckDatesOf=name=>dates\.filter\(d=>\{const r=inputCheckOfShift\(_getAnyShift\(name,d\),abbrToShop\);return r\.oneSided\|\|r\.memoOnly;\}\)/.test(src), "inputCheckOfShift を日ごとに通す");
  assert.ok(/inputCheckDates:inputCheckDatesOf\(name\),staffNumberMissing:isStaffNumberMissing\(settings,name\)/.test(src), "laborFindingsFor に渡す");
});

// ===== H1（2026-10-04）: 店舗略称の2パターン =====
test("H1 shopAbbr2Of: 上下が両方揃ったときだけ有効。片方・形の違う値・未設定は未登録（null）", () => {
  assert.deepStrictEqual(u.shopAbbr2Of({ shopAbbr2: { top: "鶏", bottom: "三" } }), { top: "鶏", bottom: "三" });
  assert.deepStrictEqual(u.shopAbbr2Of({ shopAbbr2: { top: " 鶏 ", bottom: "三" } }), { top: "鶏", bottom: "三" });
  assert.strictEqual(u.shopAbbr2Of({ shopAbbr2: { top: "鶏", bottom: "" } }), null);
  assert.strictEqual(u.shopAbbr2Of({ shopAbbr2: { top: "鶏" } }), null);
  assert.strictEqual(u.shopAbbr2Of({ shopAbbr2: null }), null);
  assert.strictEqual(u.shopAbbr2Of({ shopAbbr2: "鶏三" }), null);
  assert.strictEqual(u.shopAbbr2Of({}), null);
  assert.strictEqual(u.shopAbbr2Of(null), null);
});

test("H1 shopAbbr2Error: 両方必須・各2文字まで・予約語は1セル用と同じ isReservedShopAbbr で弾く", () => {
  assert.strictEqual(u.SHOP_ABBR2_MAX_LEN, 2);
  assert.strictEqual(u.shopAbbr2Error("鶏", "三"), null);
  assert.strictEqual(u.shopAbbr2Error("鶏え", "三ビ"), null);
  assert.match(u.shopAbbr2Error("鶏", ""), /両方/);
  assert.match(u.shopAbbr2Error("", "三"), /両方/);
  assert.match(u.shopAbbr2Error("鶏えん", "三"), /2文字以内/);
  for (const bad of ["h", "k", "x", "/", "ko", "締", "1", ".a"]) {
    assert.match(u.shopAbbr2Error(bad, "三"), /使用できません/, `上「${bad}」`);
    assert.match(u.shopAbbr2Error("鶏", bad), /使用できません/, `下「${bad}」`);
  }
});

test("H1 otherShopDataOf・helperWorkOn: 2セル用を読んで勤務に載せる。手入力コマンドの abbrs には入れない・写しのキーにも無い", () => {
  const B = { ..._shop36("B店", { staff: ["田中"], settings: { shopAbbrs: ["鶏三"], shopAbbr2: { top: "鶏", bottom: "三" } },
    subs: { s1: { id: "s1", staffName: "田中", periodId: "pb", shifts: { "2026-10-05": _w36("11:00", "15:00") } } } }), entityId: null };
  assert.deepStrictEqual(B.abbrs, ["鶏三"], "abbrs（abbrToShop の元）は1セル用だけ");
  assert.deepStrictEqual(B.abbr2, { top: "鶏", bottom: "三" });
  const e = u.helperWorkOn({ regs: [{ shopId: "B", name: "田中" }], otherShops: { B }, date: "2026-10-05" });
  assert.deepStrictEqual([e[0].abbr, e[0].abbr2], ["鶏三", { top: "鶏", bottom: "三" }]);
  const C = { ..._shop36("C店", { staff: ["田中"], settings: {},
    subs: { s1: { id: "s1", staffName: "田中", periodId: "pc", shifts: { "2026-10-05": _w36("11:00", "15:00") } } } }), entityId: null };
  assert.strictEqual(C.abbr2, null);
  assert.strictEqual(u.helperWorkOn({ regs: [{ shopId: "C", name: "田中" }], otherShops: { C }, date: "2026-10-05" })[0].abbr2, null);
  assert.ok(!u.PERIOD_SNAPSHOT_SETTING_KEYS.includes("shopAbbr2") && !u.PERIOD_SNAPSHOT_SETTING_KEYS.includes("shopAbbrs"));
});

// ===== H2（2026-10-04）: ヘルプ勤務の表示（helperCellDisplay）=====
// 鷄えん東通り所属で鷄えん3ビルへヘルプ（1セル用「鶏三」・2セル用 上「鶏」下「三」）。計画書 H2 の表の4通り
const _H2E = (start, end, o) => Object.assign({ shopId: "B", shopName: "鷄えん3ビル", abbr: "鶏三", abbr2: { top: "鶏", bottom: "三" }, start, end, min: 240 }, o || {});
const _h2 = (entries, ownRange, ownText) => u.helperCellDisplay({ entries, ownRange: ownRange || null, ownText: ownText || { start: "", end: "" } });
const _cells = d => d && [d.start.helper ? d.start.text : "(自店)", d.end.helper ? d.end.text : "(自店)"];
test("H2 helperCellDisplay: 計画書の表の4通り（ヘルプ先のみ／昼ヘルプ＋夜自店／昼自店＋夜ヘルプ／自店のみ）", () => {
  const only = _h2([_H2E("11:00", "15:00")]);
  assert.deepStrictEqual(_cells(only), ["11鶏", "15三"]);
  assert.strictEqual(only.helperOnly, true);
  // 昼ヘルプ 11〜15、夜自店 17〜25 → 上「11鶏三」（黄）・下は自店
  const lunch = _h2([_H2E("11:00", "15:00")], { startMin: 17 * 60, endMin: 25 * 60 }, { start: "17", end: "25" });
  assert.deepStrictEqual(_cells(lunch), ["11鶏三", "(自店)"]);
  assert.strictEqual(lunch.helperOnly, false);
  // 昼自店 11〜15、夜ヘルプ 17〜23 → 上は自店・下「23鶏三」（黄）
  const dinner = _h2([_H2E("17:00", "23:00")], { startMin: 11 * 60, endMin: 15 * 60 }, { start: "11", end: "15" });
  assert.deepStrictEqual(_cells(dinner), ["(自店)", "23鶏三"]);
  // 自店のみ（ヘルプ先の勤務なし）→ null（何も変えない・斜線もそのまま）
  assert.strictEqual(_h2([], { startMin: 660, endMin: 1500 }, { start: "11", end: "25" }), null);
  assert.strictEqual(u.helperCellDisplay(null), null);
});
test("H2 helperCellDisplay: 2セル用が未登録なら上に1セル用・下は時刻のみ（→ を付けない）。略称未登録なら店舗名の1文字目", () => {
  assert.deepStrictEqual(_cells(_h2([_H2E("11:00", "15:00", { abbr2: null })])), ["11鶏三", "15"]);
  assert.deepStrictEqual(_cells(_h2([_H2E("11:00", "15:00", { abbr2: { top: "鶏", bottom: "" } })])), ["11鶏三", "15"], "片方だけの2セル用は未登録");
  assert.deepStrictEqual(_cells(_h2([_H2E("17:00", "23:00", { abbr: "", abbr2: null, shopName: "三ビル" })])), ["17三", "23"]);
  // 混在の日の略称未登録
  assert.deepStrictEqual(_cells(_h2([_H2E("17:00", "23:00", { abbr: "", abbr2: null, shopName: "三ビル" })], { startMin: 600, endMin: 900 }, { start: "10", end: "15" })), ["(自店)", "23三"]);
  // 30分単位は toDecimal と同じ小数
  assert.deepStrictEqual(_cells(_h2([_H2E("11:30", "15:30")])), ["11.5鶏", "15.5三"]);
  for (const d of [_h2([_H2E("11:00", "15:00")]), _h2([_H2E("11:00", "15:00", { abbr2: null })])])
    for (const f of ["start", "end"]) assert.ok(!d[f].text.includes("→"), "→ は付けない");
});
test("H2 helperCellDisplay: 2店舗へヘルプに行く日は上下それぞれに該当店舗の1セル用。ツールチップは全件を時刻順", () => {
  const C = { shopId: "C", shopName: "鷄えん梅田", abbr: "梅", abbr2: { top: "鶏", bottom: "梅" }, min: 180 };
  const two = _h2([_H2E("17:00", "22:00"), _H2E("10:00", "13:00", C)]);
  assert.deepStrictEqual(_cells(two), ["10梅", "22鶏三"], "2店舗の日は2セル用を使わない");
  assert.strictEqual(two.helperOnly, true);
  assert.match(two.title, /^鷄えん梅田 10:00〜13:00（実働 3:00）／鷄えん3ビル 17:00〜22:00（実働 4:00）。/);
  // 混在の日のツールチップに自店の時刻（隠れる時刻）も出す
  const mix = _h2([_H2E("11:00", "15:00")], { startMin: 17 * 60, endMin: 25 * 60 }, { start: "17", end: "25" });
  assert.match(mix.title, /^鷄えん3ビル 11:00〜15:00（実働 4:00）／自店 17:00〜25:00。/);
  // 同じ店舗の勤務が2件でも1店舗扱い（2セル用を使う）
  assert.deepStrictEqual(_cells(_h2([_H2E("10:00", "12:00"), _H2E("18:00", "21:00")])), ["10鶏", "21三"]);
});
test("H2 helperCellDisplay: 自店に時刻の無いメモだけの日は、自店のセルが空いている側だけヘルプを出す", () => {
  const d = _h2([_H2E("17:00", "23:00")], null, { start: "研修", end: "" });
  assert.deepStrictEqual(_cells(d), ["(自店)", "23鶏三"]);
  assert.strictEqual(d.helperOnly, false);
});
test("H2 helperCellFontPx: 列幅を変えずに収まる大きさまで縮める（基準を超えない・下限で止める・0.5px刻み）", () => {
  // 通常表示: 列39px − 罫線1 − padding2 − 余白1 = 35px
  assert.strictEqual(u.helperCellFontPx("11", 35, 16), 16);
  assert.strictEqual(u.helperCellFontPx("11鶏三", 35, 16), 10.5);
  assert.strictEqual(u.helperCellFontPx("15三", 35, 16), 15.5);
  assert.strictEqual(u.helperCellFontPx("11.5鶏三", 35, 16), 8, "下限 8px");
  assert.strictEqual(u.helperCellFontPx("11.5鶏三", 30, 16, 6), 7, "下限を変えればその手前まで縮む");
  assert.strictEqual(u.helperCellFontPx("x", 0, 16), 16);
  // 全表示で基準が下限より小さいときは基準のまま（大きくしない）
  assert.strictEqual(u.helperCellFontPx("11鶏三", 20, 6), 6);
  for (const t of ["11鶏三", "23鶏三", "11.5鶏", "15三"]) assert.ok(u.helperCellFontPx(t, 35, 16) * u.cellTextEm(t) <= 35 || u.helperCellFontPx(t, 35, 16) === u.HELPER_CELL_MIN_FONT_PX);
});

// ===== 管理者画面のURL #/admin（2026-10-05）=====
test("isAdminRouteHash: #/admin と #/admin/ だけ", () => {
  assert.ok(u.isAdminRouteHash("#/admin"));
  assert.ok(u.isAdminRouteHash("#/admin/"));
  ["", "#", "#/", "#/s/abcd2345", "#/admins", "#/administrator", "#/admin/x", "#/Admin", "#admin", "#/me", "#/demo", null, undefined]
    .forEach(h => assert.strictEqual(u.isAdminRouteHash(h), false, String(h)));
});

test("parseUrl: #/admin は管理者画面（旧形式のスタッフURL「トークン admin」に読まれない）・他のURLは従来どおり", () => {
  const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
  const src = fs.readFileSync(path.join(__dirname, "..", "app-core.js"), "utf8");
  const start = src.indexOf("function parseUrl(){");
  assert.ok(start >= 0);
  // 関数の終わり（行頭の "}"）までを取り出して、window だけ差し替えて実行する
  const end = src.indexOf("\n}\n", start);
  const fnSrc = src.slice(start, end + 2);
  const my = require("../app-my-utils.js");
  const run = (hash, enabled) => {
    const ctx = { window: { location: { hash } }, isAdminRouteHash: u.isAdminRouteHash, isMyRouteHash: my.isMyRouteHash,
      myPageRouteOf: my.myPageRouteOf, MY_SCREEN_ENABLED: enabled };
    vm.runInNewContext(fnSrc + "\nresult=JSON.stringify(parseUrl());", ctx);
    return JSON.parse(ctx.result); // vm の別の realm のオブジェクトは deepStrictEqual で原型が違うので JSON で持ち出す
  };
  for (const enabled of [true, false]) {
    assert.deepStrictEqual(run("#/admin", enabled), { type: "admin" });
    assert.deepStrictEqual(run("#/admin/", enabled), { type: "admin" });
    assert.deepStrictEqual(run("#/s/abcd2345", enabled), { type: "staff", token: "abcd2345" });
    assert.deepStrictEqual(run("#/abcd2345", enabled), { type: "staff", token: "abcd2345" });
    assert.deepStrictEqual(run("#/admins", enabled), { type: "staff", token: "admins" });
    assert.deepStrictEqual(run("#/demo", enabled), { type: "demo" });
    assert.strictEqual(run("", enabled), null);
  }
  assert.deepStrictEqual(run("#/me", true), { type: "me" });
});

test("App: #/admin で開いたタブは管理者画面から始まり、スタッフURLの扱い（urlLocked）は変えない", () => {
  const fs = require("node:fs"), path = require("node:path");
  const src = fs.readFileSync(path.join(__dirname, "..", "app-main.js"), "utf8");
  assert.ok(/const\[view,setView\]=useState\(\(\)=>_hasUrlToken\?"staff":bootRoute\?\.type==="admin"\?"admin":ssGet\(SS_VIEW,"staff"\)\)/.test(src));
  assert.ok(/const _hasUrlToken=!!\(bootRoute\?\.type==="staff"\|\|bootRoute\?\.type==="page"\);/.test(src));
});

// ===== 管理者のセッションの店舗一覧の復元・ホーム画面のアイコン（2026-10-05） =====
test("sessionShopIdsToRestore: 保存した並びを保ち、Cookie の店舗を必ず含める", () => {
  assert.deepStrictEqual(u.sessionShopIdsToRestore(["A", "B", "C"], "B"), ["A", "B", "C"]);
  assert.deepStrictEqual(u.sessionShopIdsToRestore(["A", "B"], "C"), ["C", "A", "B"]); // 保存に無い店舗は先頭
  assert.deepStrictEqual(u.sessionShopIdsToRestore(null, "A"), ["A"]); // 何も保存していない端末は従来どおり1店舗
  assert.deepStrictEqual(u.sessionShopIdsToRestore([], "A"), ["A"]); // ログアウトで消した後
});
test("sessionShopIdsToRestore: 重複・不正な ID・壊れた保存値を落とす", () => {
  assert.deepStrictEqual(u.sessionShopIdsToRestore(["A", "A", "", null, 3, "default", "x.y", "a/b", "B"], "A"), ["A", "B"]);
  assert.deepStrictEqual(u.sessionShopIdsToRestore({ 0: "A" }, "B"), ["B"]);
  assert.deepStrictEqual(u.sessionShopIdsToRestore(["A"], null), ["A"]);
  assert.deepStrictEqual(u.sessionShopIdsToRestore(["A"], "bad#id"), ["A"]);
});
test("sessionShopIdsToRestore: 件数の上限でも Cookie の店舗は残る", () => {
  const many = Array.from({ length: 60 }, (_, i) => "S" + i);
  const r = u.sessionShopIdsToRestore(many, "S59", 50);
  assert.strictEqual(r.length, 50);
  assert.ok(r.includes("S59"));
  assert.strictEqual(u.sessionShopIdsToRestore(many, "S3", 50).length, 50);
  assert.strictEqual(u.SESSION_SHOPS_MAX, 50);
});
test("homeIconKindOf: スタッフ側の URL だけスタッフ用アイコン", () => {
  assert.strictEqual(u.homeIconKindOf({ type: "staff", token: "t" }), "staff");
  assert.strictEqual(u.homeIconKindOf({ type: "page", pageToken: "p" }), "staff");
  assert.strictEqual(u.homeIconKindOf({ type: "me" }), "staff");
  assert.strictEqual(u.homeIconKindOf({ type: "admin" }), "admin");
  assert.strictEqual(u.homeIconKindOf({ type: "demo" }), "admin");
  assert.strictEqual(u.homeIconKindOf(null), "admin");
});
test("homeManifestOf: スタッフ側の URL は開いている URL を start_url にする（ホーム画面のアプリが管理者画面で開かない）", () => {
  const href = "https://shiftyshifty.app/#/m/AbCdEfGhIjKlMnOpQrStUvWx";
  const m = u.homeManifestOf({ type: "page", pageToken: "AbCdEfGhIjKlMnOpQrStUvWx" }, href);
  assert.strictEqual(m.start_url, href);
  assert.strictEqual(m.id, href);
  assert.strictEqual(m.scope, "https://shiftyshifty.app/");
  assert.strictEqual(m.display, "standalone");
  m.icons.forEach(ic => assert.ok(/^https:\/\/shiftyshifty\.app\/favicon-staff/.test(ic.src), ic.src));
  // 募集URL（クエリ付き）・#/me もそのまま
  const s = "https://shiftyshifty.app/?openExternalBrowser=1#/s/tok123";
  assert.strictEqual(u.homeManifestOf({ type: "staff", token: "tok123" }, s).start_url, s);
  assert.strictEqual(u.homeManifestOf({ type: "me" }, "https://shiftyshifty.app/#/me").start_url, "https://shiftyshifty.app/#/me");
  // 管理者側・ハッシュの無い URL・壊れた URL は null（manifest.json のまま）
  assert.strictEqual(u.homeManifestOf({ type: "admin" }, "https://shiftyshifty.app/#/admin"), null);
  assert.strictEqual(u.homeManifestOf(null, "https://shiftyshifty.app/"), null);
  assert.strictEqual(u.homeManifestOf({ type: "page", pageToken: "x" }, "https://shiftyshifty.app/"), null);
  assert.strictEqual(u.homeManifestOf({ type: "page", pageToken: "x" }, "not a url"), null);
});
test("iOS のホーム画面のアプリ（2026-10-05 2回目）: スタッフ側は manifest を外す・ホーム画面から開いたときに戻すハッシュ", () => {
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";
  assert.strictEqual(u.isIosLike(iphone, "iPhone", 5), true);
  assert.strictEqual(u.isIosLike("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 5), true, "iPadOS は Mac の UA＋タッチ");
  assert.strictEqual(u.isIosLike("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 0), false);
  assert.strictEqual(u.isIosLike("Mozilla/5.0 (Linux; Android 14)", "Linux", 5), false);
  const page = { type: "page", pageToken: "AbCdEfGhIjKlMnOpQrStUvWx" }, href = "https://shiftyshifty.app/#/m/AbCdEfGhIjKlMnOpQrStUvWx";
  assert.deepStrictEqual(u.homeManifestPlanOf(page, href, true), { mode: "none" });
  assert.strictEqual(u.homeManifestPlanOf(page, href, false).mode, "data");
  assert.deepStrictEqual(u.homeManifestPlanOf({ type: "admin" }, "https://shiftyshifty.app/#/admin", true), { mode: "json" });
  // スタッフ側のハッシュの検査
  ["#/s/abc23", "#/m/AbCdEfGhIjKlMnOpQrStUvWx", "#/me"].forEach(h => assert.ok(u.isHomeStaffHash(h), h));
  ["", "#/admin", "#/demo", "#/s/a.b", "javascript:alert(1)", "#/me/x"].forEach(h => assert.ok(!u.isHomeStaffHash(h), h));
  // ホーム画面から開いたとき
  const M = "#/m/AbCdEfGhIjKlMnOpQrStUvWx";
  assert.deepStrictEqual(u.homeLaunchRestoreOf({ hash: "", cookieHash: M, saved: null }), { hash: M, save: M }, "初回: Safari から写った Cookie で決める");
  assert.deepStrictEqual(u.homeLaunchRestoreOf({ hash: "", cookieHash: "", saved: null }), { save: "admin" }, "初回で Cookie が無ければ管理者のアプリ");
  assert.deepStrictEqual(u.homeLaunchRestoreOf({ hash: "", cookieHash: M, saved: "admin" }), {}, "管理者のアプリと決めたら、あとの Cookie に引きずられない");
  assert.deepStrictEqual(u.homeLaunchRestoreOf({ hash: "", cookieHash: "", saved: M }), { hash: M });
  assert.deepStrictEqual(u.homeLaunchRestoreOf({ hash: M, cookieHash: "", saved: null }), { save: M }, "ハッシュ付きで開けたらそれを残す");
  assert.deepStrictEqual(u.homeLaunchRestoreOf({ hash: M, cookieHash: "", saved: M }), {});
  assert.deepStrictEqual(u.homeLaunchRestoreOf({ hash: "#/admin", cookieHash: M, saved: null }), {});
  assert.deepStrictEqual(u.homeLaunchRestoreOf({ hash: "", cookieHash: "#/s/a.b", saved: null }), { save: "admin" }, "壊れた値は戻さない");
  // index.html の head は静的な manifest を置かず、iOS のスタッフ側では入れない（app-core.js と同じ規則）
  const fs = require("node:fs"), path = require("node:path");
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.ok(!/<link rel="manifest"/.test(html), "静的な manifest の link を置かない");
  const head = html.split("</head>")[0];
  assert.ok(/if\(staff&&ios\)return;/.test(head) && /l\.href="manifest\.json"/.test(head));
  const core = fs.readFileSync(path.join(__dirname, "..", "app-core.js"), "utf8");
  assert.ok(/homeManifestPlanOf\(parseUrl\(\),window\.location\.href,HOME_IOS\)/.test(core) && /restoreHomeLaunch/.test(core));
  assert.ok(core.indexOf("(function restoreHomeLaunch(){") < core.indexOf("applyHomeLaunch();\nwindow.addEventListener"), "App が URL を読む前（app-core.js の読み込み時）に戻す");
});
test("ホーム画面のアイコン: index.html の link と app-core.js の切り替え先のファイルが揃っている", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const root = path.join(__dirname, "..");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const core = fs.readFileSync(path.join(root, "app-core.js"), "utf8");
  assert.ok(/<link rel="apple-touch-icon"[^>]*href="favicon-180\.png"/.test(html));
  for (const f of ["favicon-180.png", "favicon.svg", "favicon-staff-180.png", "favicon-staff.svg"]) {
    assert.ok(core.includes(`"${f}"`), f + " が app-core.js の HOME_ICONS に無い");
    assert.ok(fs.existsSync(path.join(root, f)), f + " が無い");
  }
});

// ===== 時刻の2列ホイール（2026-10-05 ユーザー指示「時間と分をそれぞれ選べるように。シフト提出は従来どおりの刻み」）=====
test("時刻のホイール: 提出の刻みは従来どおり（出勤 TO_START＝30分・退勤 TO＝15分）で、端で止まり、選べない組み合わせは寄せる", () => {
  const ms = u.timeWheelModel(u.TO_START);
  assert.deepStrictEqual([ms.hours[0], ms.hours[ms.hours.length - 1]], [0, 27], "時は 0〜27（ループしない）");
  assert.deepStrictEqual(ms.minutes[18], [0, 30], "出勤の分は 00・30");
  assert.deepStrictEqual(ms.minutes[27], [0], "27時は 00 分だけ");
  const me = u.timeWheelModel(u.TO);
  assert.deepStrictEqual(me.minutes[18], [0, 15, 30, 45], "退勤の分は 00・15・30・45");
  // 選択肢に無い分は近い方へ、選べない時は列の端へ寄せる（同じ距離なら小さい方）
  assert.strictEqual(u.timeWheelPick(ms, 26, 30), "26:30");
  assert.strictEqual(u.timeWheelPick(ms, 27, 30), "27:00", "27時は 00 分に寄る");
  assert.strictEqual(u.timeWheelPick(ms, 18, 15), "18:00", "15分は 00 と 30 の中間＝小さい方");
  assert.strictEqual(u.timeWheelPick(ms, 18, 20), "18:30");
  assert.strictEqual(u.timeWheelPick(ms, 40, 0), "27:00", "列に無い時は末尾で止まる");
  assert.strictEqual(u.timeWheelPick(ms, -3, 0), "00:00", "先頭で止まる");
  // 提出済みの値が刻みに合わない（例 18:10）ときは選択肢に足して保つ（StaffView の opts と同じ規則）
  const opts = [...u.TO_START, "18:10"].sort();
  assert.deepStrictEqual(u.timeWheelModel(opts).minutes[18], [0, 10, 30]);
  assert.strictEqual(u.timeWheelPick(u.timeWheelModel(opts), 18, 10), "18:10");
  assert.strictEqual(u.timeWheelPick(u.timeWheelModel([]), 9, 0), null);
  assert.deepStrictEqual(u.timeWheelSplit("9:05"), { h: 9, m: 5 });
  assert.strictEqual(u.timeWheelSplit(""), null);
  // 入口: 提出画面とセル編集は select ではなくホイール（刻みの配列は従来のもの）
  const staff = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "app-staff.js"), "utf8");
  const view = staff.slice(staff.indexOf("function StaffView("));
  assert.ok(/const base=f==="start"\?TO_START:TO;/.test(view) && /<TimeWheelField name=\{`\$\{ds\}-\$\{f\}`\}[^>]*options=\{opts\}/.test(view), "提出画面: 出勤 TO_START・退勤 TO のホイール");
  assert.ok(/<TimeWheelField name=\{`cell-\$\{f\}`\}/.test(staff) && !/\{TO\.map\(t=><option/.test(staff), "セル編集もホイール");
});
test("時刻のホイール: 候補タブの時刻欄（全体・曜日別・日付別・休憩）もホイール（TO＝15分）で、CandTab の外の部品（2026-10-05）", () => {
  const adm = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "app-admin.js"), "utf8");
  const comp = adm.slice(adm.indexOf("function CandTimeWheel("), adm.indexOf("function CandTab("));
  assert.ok(comp.length > 0 && /<TimeWheelField [^>]*options=\{TO\}/.test(comp), "部品は TO のホイール");
  const tab = adm.slice(adm.indexOf("function CandTab("), adm.indexOf("function SubsTab("));
  ["global", "weekday", "date", "break"].forEach(n => ["start", "end"].forEach(f =>
    assert.ok(tab.includes(`<CandTimeWheel name="cand-${n}-${f}"`), `cand-${n}-${f}`)));
  assert.ok(!/SingleTimeSelect/.test(tab) && !/\{TO\.map\(t=><option/.test(tab), "候補タブに時刻の select は残っていない");
  assert.ok(!/const CandTimeWheel|function CandTimeWheel/.test(tab), "CandTab の中で定義しない（再描画で開いたホイールが閉じる）");
});
test("時刻のホイール: 提出一覧の詳細の調整値と PDF の昼夜の人数の確認時刻もホイール（TO）・空に戻すボタン・刻みに合わない値を保つ（2026-10-05）", () => {
  assert.deepStrictEqual(u.timeWheelOptionsWith(["09:00", "09:15"], "09:10", "", null, "9:5", "09:15"), ["09:00", "09:10", "09:15"]);
  const base = ["09:00"];
  assert.strictEqual(u.timeWheelOptionsWith(base), base, "足すものが無ければ同じ配列");
  const adm = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "app-admin.js"), "utf8");
  const subs = adm.slice(adm.indexOf("function SubsTab("));
  ["start", "end"].forEach(f => { const i = subs.indexOf("<TimeWheelField name={`adj-${ds}-" + f + "`}"); assert.ok(i > 0 && subs.slice(i, i + 600).includes('clearLabel="提出値に戻す"'), f); });
  assert.ok(!/<option value="">提出値<\/option>/.test(subs), "調整値の select は残っていない");
  const co = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "app-company.js"), "utf8");
  { const i = co.indexOf("<TimeWheelField name={`headcount-${k}`}"); assert.ok(i > 0 && co.slice(i, i + 400).includes('clearLabel="出さない"') && !/TOPT\.map/.test(co), "確認時刻はホイール"); }
  const staff = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "app-staff.js"), "utf8");
  assert.ok(/clearLabel=\{value\?clearLabel:null\}/.test(staff), "空に戻すボタンは値が入っているときだけ");
});

// ===== 削り（2026-10-05 ユーザー指示）=====
// 提出した帯を管理者が削った日だけを数える。通しの半分も終日も1日1回。
{
  const sub = { id: "s1", staffName: "田中", periodId: "p1", shifts: {} };
  const through = { status: "work", start: "11:00", end: "23:00" };
  const cut = (shift, cell, s = sub) => u.shiftCutOf({ sub: s, shift, startH: NaN, endH: NaN, startNote: "", endNote: "", fixed: false, ...cell });

  test("shiftCutOf: 提出どおりなら削りではない", () => {
    assert.strictEqual(cut(through, { startH: 11, endH: 23 }), false);
    assert.strictEqual(cut({ status: "work", start: "17:00", end: "23:00" }, { startH: 17, endH: 23 }), false);
  });
  test("shiftCutOf: 通しの片方の帯を空欄にした日・終日空欄にした日は削り", () => {
    assert.strictEqual(cut(through, { startH: NaN, endH: 23 }), true, "ランチ帯を空欄");
    assert.strictEqual(cut(through, { startH: 11, endH: 15 }), true, "退勤を15にしてディナー帯を削る");
    assert.strictEqual(cut(through, { startH: 11, endH: 17 }), true, "退勤17はディナー帯に入らない");
    assert.strictEqual(cut(through, {}), true, "終日空欄");
    assert.strictEqual(cut({ status: "work", start: "11:00", end: "15:00" }, {}), true, "ランチだけの提出を空欄");
  });
  test("shiftCutOf: 11〜23 の提出を 17〜23 にした日は削り（ユーザー決定）", () => {
    assert.strictEqual(cut(through, { startH: 17, endH: 23 }), true);
  });
  test("shiftCutOf: 帯の移し替え（提出に無い帯を足した日）は数えない", () => {
    assert.strictEqual(cut({ status: "work", start: "11:00", end: "15:00" }, { startH: 17, endH: 23 }), false);
    assert.strictEqual(cut({ status: "work", start: "17:00", end: "23:00" }, { startH: 11, endH: 15 }), false);
    assert.strictEqual(cut({ status: "work", start: "11:00", end: "15:00" }, { startH: 11, endH: 15, fixed: true }), false, "締を足しただけ");
  });
  test("shiftCutOf: 同じ帯の中で短くしただけは削りではない", () => {
    assert.strictEqual(cut({ status: "work", start: "17:00", end: "23:00" }, { startH: 17, endH: 20 }), false);
    assert.strictEqual(cut(through, { startH: 12, endH: 22 }), false);
  });
  test("shiftCutOf: 休みコマンドを入れた帯は数えない", () => {
    assert.strictEqual(cut({ ...through, adminRest: { start: true } }, { startH: NaN, endH: 23 }), false, "/ をランチ帯に");
    assert.strictEqual(cut({ ...through, adminRest: { start: true, end: true }, leaveTypes: { start: "public", end: "public" } }, {}), false, "ko");
    assert.strictEqual(cut({ ...through, adminRest: { end: true }, leaveTypes: { end: "paid" } }, { startH: 11 }), false, "yu をディナー帯に");
    assert.strictEqual(cut({ ...through, adminRest: { start: true } }, { startH: NaN, endH: 15 }), true, "休みにしていない帯を削れば数える");
  });
  test("shiftCutOf: ヘルプ（x・他店舗の略称）にした帯は数えない", () => {
    assert.strictEqual(cut(through, { startH: 11, startNote: "三", endH: 23 }), false, "11三");
    assert.strictEqual(cut(through, { startH: NaN, startNote: "x", endH: 23 }), false, "時刻なしの略称・x");
    assert.strictEqual(cut(through, { startH: NaN, startNote: "研修", endH: 23 }), false, "メモが入っていれば帯は残っているとみなす");
  });
  test("shiftCutOf: 提出の無い日・休みの提出・手入力だけの日は数えない", () => {
    assert.strictEqual(cut(undefined, {}), false);
    assert.strictEqual(cut({ status: "holiday" }, {}), false);
    assert.strictEqual(cut({ status: "work", origStatus: "holiday", adjustedStart: "" }, {}), false, "休みの提出に時刻を入れて消した日");
    assert.strictEqual(cut({ status: "work", adjustedStart: "", adjustedEnd: "23:00" }, { endH: 23 }), false, "提出の時刻が無い");
    const grid = { ...sub, source: "grid" };
    assert.strictEqual(cut({ status: "work", start: "11:00", end: "23:00" }, {}, grid), false, "source:grid は手入力");
  });
}

test("削り: 画面の表と PDF の表が同じ cutCounts を使う", () => {
  const src = require("fs").readFileSync(require("path").join(__dirname, "..", "app-shift.js"), "utf8");
  assert.ok(/\["削り（回）",nm=>cutCounts\[nm\]\|\|0\]/.test(src), "PDF の休み・連勤カウント表に削りの行");
  assert.ok(/key:"cut",label:"削り（回）",short:"削り",[^\n]*cutCounts\[name\]/.test(src), "画面の表に削りの行");
  assert.ok(/shiftCutOf\(\{sub,shift:/.test(src), "cutCounts は shiftCutOf を通す");
});

// ===== ヘルプ勤務の自動表示の ON/OFF（period.helperDisplayOff・2026-10-05）=====
const cfhd = require("../functions/company-config.js");
test("helperDisplayOff: 既定は ON・切り替えは期間ごと・ON に戻して誰も残らなければフィールドを外す", () => {
  const p = { id: "p1", startDate: "2026-10-01", endDate: "2026-10-15" };
  assert.strictEqual(u.isHelperDisplayOff(p, "田中"), false);
  assert.strictEqual(u.helperDisplayOffOf(p), null);
  const off = u.planHelperDisplayToggle(p, "田中", true);
  assert.notStrictEqual(off, p);
  assert.deepStrictEqual(off.helperDisplayOff, { 田中: true });
  assert.strictEqual(u.isHelperDisplayOff(off, "田中"), true);
  assert.strictEqual(u.isHelperDisplayOff(off, "鈴木"), false); // 他の人には効かない
  assert.strictEqual(p.helperDisplayOff, undefined); // 元の期間は変えない
  assert.strictEqual(u.planHelperDisplayToggle(off, "田中", true), off); // 変わらなければ同じ参照
  const on = u.planHelperDisplayToggle(off, "田中", false);
  assert.ok(!("helperDisplayOff" in on));
  // true 以外の値は OFF とみなさない（壊れた値で表示が消えない）
  assert.strictEqual(u.isHelperDisplayOff({ helperDisplayOff: { 田中: "1", 鈴木: false } }, "田中"), false);
});
test("helperDisplayOff: diffPeriodsForFlatWrite は名前1件ずつのパスで書く（他の端末の切り替えを巻き戻さない）", () => {
  const p = { id: "p1", label: "10月前半" };
  const a = u.planHelperDisplayToggle(p, "田中", true);
  assert.deepStrictEqual(u.diffPeriodsForFlatWrite([p], [a]), { "p1/helperDisplayOff/田中": true });
  const b = u.planHelperDisplayToggle(a, "鈴木", true);
  assert.deepStrictEqual(u.diffPeriodsForFlatWrite([a], [b]), { "p1/helperDisplayOff/鈴木": true });
  // 全員 ON に戻した（フィールドごと消えた）ときも1件ずつ null
  const c = u.planHelperDisplayToggle(a, "田中", false);
  assert.deepStrictEqual(u.diffPeriodsForFlatWrite([a], [c]), { "p1/helperDisplayOff/田中": null });
  // 別の期間には書かない
  const q = { id: "p2", label: "10月後半" };
  assert.deepStrictEqual(u.diffPeriodsForFlatWrite([p, q], [a, q]), { "p1/helperDisplayOff/田中": true });
});
test("helperDisplayOff: 改名で名前が移り、CF の renameStaffPeriodsPatch とクライアントが同じ結果になる", () => {
  const periods = [
    { id: "p1", helperDisplayOff: { 田中: true, 鈴木: true } },
    { id: "p2", helperDisplayOff: { 鈴木: true } },
    { id: "p3" },
  ];
  const r = u.renameStaffInPeriods(periods, "田中", "田中 太郎");
  const out = Array.isArray(r) ? r : r.periods;
  assert.deepStrictEqual(out[0].helperDisplayOff, { "田中 太郎": true, 鈴木: true });
  assert.deepStrictEqual(out[1].helperDisplayOff, { 鈴木: true });
  const patch = cfhd.renameStaffPeriodsPatch(periods, "田中", "田中 太郎");
  assert.deepStrictEqual(patch["p1/helperDisplayOff"], out[0].helperDisplayOff);
  assert.ok(!("p2/helperDisplayOff" in patch));
  assert.ok(!("p3/helperDisplayOff" in patch));
});
test("helperDisplayOff: 自動表示の入口（helperDisp）が OFF を見て、合算（helperEntriesOn）は見ない（ドリフト検出）", () => {
  const src = require("fs").readFileSync(require("path").join(__dirname, "..", "app-shift.js"), "utf8");
  const disp = src.slice(src.indexOf("const helperDisp=(name,date)=>{"), src.indexOf("const isHelperOnly="));
  assert.ok(/isHelperDisplayOff\(period,name\)/.test(disp), "helperDisp が OFF を見ていない");
  const ent = src.slice(src.indexOf("const helperEntriesOn="), src.indexOf("const helperMinOn="));
  assert.ok(ent.length > 0 && !/isHelperDisplayOff/.test(ent), "合算（helperEntriesOn）が OFF を見ている＝見た目だけの設定が労務に効く");
});

// ===== 入社日・退社日・新店開始日（settings.staffTenure・2026-10-08）=====
// 期間は半月。P1=10/1〜10/15、P2=10/16〜10/31、P3=11/1〜11/15
const TP = {
  p1: { id: "p1", startDate: "2026-10-01", endDate: "2026-10-15" },
  p2: { id: "p2", startDate: "2026-10-16", endDate: "2026-10-31" },
  p3: { id: "p3", startDate: "2026-11-01", endDate: "2026-11-15" },
};
const tenureVis = (tenure, p) => u.visibleStaffList(["田中", "佐藤"], { staffTenure: { "田中": tenure } }, p);

test("staffTenure: 入社日は、その日を含む期間から出す（途中・初日・最終日）", () => {
  // 期間の途中（10/20）
  assert.deepStrictEqual(tenureVis({ join: "2026-10-20" }, TP.p1), ["佐藤"], "入社日より前に終わる期間には出さない");
  assert.deepStrictEqual(tenureVis({ join: "2026-10-20" }, TP.p2), ["田中", "佐藤"], "入社日を含む期間から出す");
  assert.deepStrictEqual(tenureVis({ join: "2026-10-20" }, TP.p3), ["田中", "佐藤"]);
  // 期間の初日（10/16）
  assert.deepStrictEqual(tenureVis({ join: "2026-10-16" }, TP.p1), ["佐藤"]);
  assert.deepStrictEqual(tenureVis({ join: "2026-10-16" }, TP.p2), ["田中", "佐藤"]);
  // 期間の最終日（10/31）
  assert.deepStrictEqual(tenureVis({ join: "2026-10-31" }, TP.p1), ["佐藤"]);
  assert.deepStrictEqual(tenureVis({ join: "2026-10-31" }, TP.p2), ["田中", "佐藤"], "最終日に入社でもその期間に出す");
});

test("staffTenure: 退社日は、その日を含む期間まで出す", () => {
  assert.deepStrictEqual(tenureVis({ leave: "2026-10-20" }, TP.p1), ["田中", "佐藤"]);
  assert.deepStrictEqual(tenureVis({ leave: "2026-10-20" }, TP.p2), ["田中", "佐藤"], "退社日を含む期間には出す");
  assert.deepStrictEqual(tenureVis({ leave: "2026-10-20" }, TP.p3), ["佐藤"], "退社日より後に始まる期間には出さない");
  assert.deepStrictEqual(tenureVis({ leave: "2026-10-16" }, TP.p2), ["田中", "佐藤"], "期間の初日に退社でもその期間には出す");
  assert.deepStrictEqual(tenureVis({ leave: "2026-10-15" }, TP.p2), ["佐藤"], "前の期間の最終日に退社なら次の期間には出さない");
});

test("staffTenure: 新店開始日が期間の途中なら旧店舗にも出し、初日なら旧店舗には出さない", () => {
  const mid = { transfer: { shopId: "B", date: "2026-10-20" } };
  assert.deepStrictEqual(tenureVis(mid, TP.p1), ["田中", "佐藤"]);
  assert.deepStrictEqual(tenureVis(mid, TP.p2), ["田中", "佐藤"], "期間の途中で移る＝その期間は旧店舗にも出す");
  assert.deepStrictEqual(tenureVis(mid, TP.p3), ["佐藤"]);
  const first = { transfer: { shopId: "B", date: "2026-10-16" } };
  assert.deepStrictEqual(tenureVis(first, TP.p1), ["田中", "佐藤"]);
  assert.deepStrictEqual(tenureVis(first, TP.p2), ["佐藤"], "新店開始日が期間の初日なら旧店舗には出さない");
  // 新店の側は join＝新店開始日で、その日を含む期間から出る
  assert.deepStrictEqual(tenureVis({ join: "2026-10-20" }, TP.p2), ["田中", "佐藤"], "新店では新店開始日を含む期間から出る");
});

test("staffTenure: 日付が無い・期間が無い・読めない値は出す側に倒す", () => {
  assert.deepStrictEqual(tenureVis(undefined, TP.p1), ["田中", "佐藤"]);
  assert.deepStrictEqual(tenureVis({}, TP.p1), ["田中", "佐藤"]);
  assert.deepStrictEqual(tenureVis({ join: "2026-12-01" }, null), ["田中", "佐藤"], "期間が特定できない");
  assert.deepStrictEqual(tenureVis({ join: "2026-12-01" }, { id: "x" }), ["田中", "佐藤"], "期間に日付が無い");
  assert.deepStrictEqual(tenureVis({ join: "12/1", leave: "x", transfer: { shopId: "", date: "2026-10-01" } }, TP.p3), ["田中", "佐藤"], "読めない値は無いものとして扱う");
  assert.deepStrictEqual(u.visibleStaffList(["田中"], {}, TP.p1), ["田中"], "staffTenure が無い店舗は従来どおり");
});

test("staffTenure: 非表示（staffHidden）と両方効く", () => {
  const st = { ...u.hideStaffFrom({}, "佐藤", TP.p2.startDate), staffTenure: { "田中": { join: "2026-11-01" } } };
  assert.deepStrictEqual(u.visibleStaffList(["田中", "佐藤"], st, TP.p2), []);
  assert.deepStrictEqual(u.visibleStaffList(["田中", "佐藤"], st, TP.p1), ["佐藤"]);
});

test("staffTenure: 書き換えは空のエントリをキーごと消し、変化が無ければ同じ参照を返す", () => {
  const s0 = { shopId: "A" };
  const s1 = u.setStaffTenureField(s0, "田中", "join", "2026-10-01");
  assert.deepStrictEqual(s1.staffTenure, { "田中": { join: "2026-10-01" } });
  assert.strictEqual(u.setStaffTenureField(s1, "田中", "join", "2026-10-01"), s1, "同じ値なら同じ参照（書かない）");
  const s2 = u.setStaffTenureField(s1, "田中", "transfer", { shopId: "B", date: "2026-11-01" });
  assert.deepStrictEqual(s2.staffTenure["田中"], { join: "2026-10-01", transfer: { shopId: "B", date: "2026-11-01" } });
  const s3 = u.setStaffTenureField(u.setStaffTenureField(s2, "田中", "join", ""), "田中", "transfer", null);
  assert.ok(!("staffTenure" in s3), "最後の項目を消したら staffTenure ごと消す（null/undefined を残さない）");
  assert.ok(!JSON.stringify(s3).includes("null"));
  assert.strictEqual(u.setStaffTenureField(s0, "田中", "leave", "bad"), s0, "読めない日付は書かない");
});

test("staffTenure: 入社日・退社日の検証", () => {
  assert.strictEqual(u.staffTenureDateError("2026-10-01", "2026-10-31"), null);
  assert.strictEqual(u.staffTenureDateError("2026-10-01", "2026-10-01"), null);
  assert.ok(u.staffTenureDateError("2026-11-01", "2026-10-31"));
  assert.ok(u.staffTenureDateError("2026-02-30", null));
});

test("staffTenure: 新店の staff への追加と settings の差分（全体 set() しない）", () => {
  assert.deepStrictEqual(u.staffListWithName(["佐藤"], "田中"), ["佐藤", "田中"]);
  assert.deepStrictEqual(u.staffListWithName({ 0: "佐藤", 1: "鈴木" }, "田中"), ["佐藤", "鈴木", "田中"], "数値キーのオブジェクト");
  assert.deepStrictEqual(u.staffListWithName(null, "田中"), ["田中"]);
  assert.strictEqual(u.staffListWithName(["佐藤", "田中"], "田中"), null, "既に居れば書かない");
  assert.deepStrictEqual(u.staffTransferTargetPatch("田中", "2026-11-01"), { "staffTenure/田中/join": "2026-11-01" });
});

test("staffTenure: 一覧の行の表記", () => {
  const st = { staffTenure: { "田中": { join: "2026-09-01", leave: "2026-10-15", transfer: { shopId: "B", date: "2026-11-01" } } } };
  assert.deepStrictEqual(u.staffTenureBadges(st, "田中", id => id === "B" ? "梅田店" : null).map(b => b.text), ["入社 9/1", "退社 10/15", "→梅田店 11/1〜"]);
  assert.deepStrictEqual(u.staffTenureBadges(st, "佐藤", () => null), []);
});

test("staffTenure: 改名でキーが移り、削除の後始末の一覧に載り、写しには凍結しない", () => {
  const t = { join: "2026-10-01", transfer: { shopId: "B", date: "2026-11-01" } };
  const s = u.renameStaffInSettings({ staffTenure: { "田中": t } }, "田中", "田中 太郎");
  assert.deepStrictEqual(s.staffTenure, { "田中 太郎": t });
  assert.ok(u.STAFF_KEYED_SETTING_MAPS.includes("staffTenure"), "settingsWithoutStaff（削除の後始末）はこの一覧を見る");
  assert.ok(u.PERIOD_SNAPSHOT_EXEMPT_STAFF_MAPS.includes("staffTenure"));
  assert.ok(!u.PERIOD_SNAPSHOT_SETTING_KEYS.includes("staffTenure"));
  // 終了して写しを持つ期間でも、いまの入社日で判定する（写しに焼いていないから効く）
  const ended = { ...TP.p1, snapshot: { staffList: ["田中", "佐藤"], settings: {} } };
  const m = u.resolvePeriodMaster(ended, ["田中", "佐藤"], { staffTenure: { "田中": { join: "2026-10-16" } } }, "2026-12-01");
  assert.strictEqual(m.locked, true);
  assert.deepStrictEqual(u.visibleStaffList(m.staffList, m.settings, ended), ["佐藤"]);
  // CF の改名パッチも同じ結果
  const st = { staffTenure: { "田中": t, "佐藤": { leave: "2026-12-31" } } };
  const patched = p1bApply(st, cfp.renameStaffSettingsPatch(st, "田中", "田中 太郎"));
  assert.deepStrictEqual(p1bNorm(patched), p1bNorm(u.renameStaffInSettings(st, "田中", "田中 太郎")));
});

test("staffTenure: 削除の後始末（settingsWithoutStaff と同じ規則）で消える", () => {
  // settingsWithoutStaff（app-admin.js の StaffTab 内）は STAFF_KEYED_SETTING_MAPS の各マップから名前を落とす。同じ規則で確かめる
  // （実際の削除ボタンからの後始末は example-staff-tenure.js が実ブラウザで確かめる）
  const st = { staffTenure: { "田中": { join: "2026-10-01" }, "佐藤": { leave: "2026-12-31" } } };
  const ns = { ...st };
  u.STAFF_KEYED_SETTING_MAPS.forEach(k => { if (ns[k] && ns[k]["田中"] !== undefined) { const m = { ...ns[k] }; delete m["田中"]; ns[k] = m; } });
  assert.deepStrictEqual(ns.staffTenure, { "佐藤": { leave: "2026-12-31" } });
});

// 提出状況一覧（SmModal）の未提出は、その期間で非表示の人を数えない（2026-10-08 ユーザー指示）。
// 判定は SmModal の中の visibleStaffList で、settings を渡さない呼び出しは非表示の人を数えたままになる＝呼び出し元のドリフト検出
test("SmModal: 未提出は visibleStaffList を通し、呼び出し元はすべて settings を渡す", () => {
  const fs = require("node:fs"), path = require("node:path");
  const read = f => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
  const staff = read("app-staff.js");
  const body = staff.slice(staff.indexOf("function SmModal("), staff.indexOf("const notSubmitted=", staff.indexOf("function SmModal(")));
  assert.ok(/const roster=visibleStaffList\(mergeKeepStaff\(staffList,period\),settings,period\);/.test(body), "未提出の名簿が visibleStaffList を通っていない");
  const calls = ["app-staff.js", "app-admin.js", "app-shift.js", "app-company.js", "app-my.js", "app-main.js"]
    .flatMap(f => (read(f).match(/<SmModal [^\n]*?\/>/g) || []).map(c => [f, c]));
  assert.ok(calls.length >= 3, "SmModal の呼び出しが見つからない");
  calls.forEach(([f, c]) => assert.ok(/ settings=\{settings\}/.test(c), `${f} の SmModal に settings が渡っていない`));
  // 振る舞い: 非表示の人だけが名簿から落ちる（期間の startDate で判定）
  const P = { id: "p1", startDate: "2026-10-01", endDate: "2026-10-15" };
  assert.deepStrictEqual(u.visibleStaffList(["田中", "佐藤"], { staffHidden: { "佐藤": true } }, P), ["田中"]);
  assert.deepStrictEqual(u.visibleStaffList(["田中", "佐藤"], { staffHidden: { "佐藤": [{ from: "2026-11-01", to: null }] } }, P), ["田中", "佐藤"]);
});

// 2026-10-08: 全員のシフト表（従業員画面）では、スタッフURLから提出された未登録の名前が data-sheet-col="…" の属性値に入る。
// " をエスケープしないと属性を抜け出してイベントハンドラを書き込める（dangerouslySetInnerHTML で描くのでスクリプトが動く）
test("shiftSheetEsc: 属性値を抜け出す \" と ' もエスケープする（全員のシフト表のスクリプト注入の修正）", () => {
  const bad = `x" onmouseover="alert(1)`;
  const e = u.shiftSheetEsc(bad);
  assert.ok(!e.includes('"') && !e.includes("'"), e);
  assert.strictEqual(u.shiftSheetEsc(`<a href='x'>&`), "&lt;a href=&#39;x&#39;&gt;&amp;");
  // 実際の表: 属性に入る名前が属性を閉じない
  const html = `<td data-sheet-col="${u.shiftSheetEsc(bad)}">`;
  assert.strictEqual((html.match(/"/g) || []).length, 2, html);
});

test("staffNameUnsafeChars: 提出のルールが拒否する \" < > と改行・タブを拾い、普通の名前は通す（ルールと同じ集合）", () => {
  assert.deepStrictEqual(u.staffNameUnsafeChars("田中 太郎"), []);
  assert.deepStrictEqual(u.staffNameUnsafeChars("山田　花子"), [], "全角空白は通す");
  assert.deepStrictEqual(u.staffNameUnsafeChars('a"b<c>'), ['"', "<", ">"]);
  assert.deepStrictEqual(u.staffNameUnsafeChars("a\tb\nc"), ["改行・タブ"]);
  const rules = require("../database.rules.json");
  const v = rules.rules.shops.$shopId.subs.$subId.staffName[".validate"];
  ['"', "<", ">"].forEach(c => assert.ok(v.includes(c), `ルールの staffName が ${c} を拒否していない`));
});

// シフト作成タブの「⚠ 労務の確認が必要です」（画面）から外す4項目（2026-10-10 ユーザー指示）。
// 判定そのもの・PDF の同じ欄・総括・セル色は変えない。
test("労務の確認（画面）: 8h超・休憩不足・日の時間外・1日の残業が上限超（B制）だけを外す", () => {
  assert.deepStrictEqual([...u.SHIFT_TAB_HIDDEN_FINDING_KEYS].sort(), ["avgOver80", "breakShort", "dayOtOverAgreement", "dayOverAgreementB",
    "monthOtOverAgreement", "over8", "p5DayOt", "p5Over60", "p5WeekOt", "weekOver40"]);
  // キーの書き間違いで黙って何も外れない、を防ぐ: 実際の判定が同じキーを出すこと
  const B = u.laborFindingsFor({ laborSystem: "B", dayMins: [600], dayDates: ["2026-10-16"], agreementDailyOtH: 1, breakShortDates: ["2026-10-16"] }).map(f => f.key);
  ["over8", "dayOverAgreementB", "breakShort"].forEach(k => assert.ok(B.includes(k), k));
  const A = u.laborFindingsFor({ laborSystem: "A", dayMins: [600], dayDates: ["2026-10-16"], dayOtH: [3], agreementDailyOtH: 1,
    monthOtH: 50, agreementMonthlyOtH: 45, monthReady: true }).map(f => f.key);
  ["dayOtOverAgreement", "monthOtOverAgreement"].forEach(k => assert.ok(A.includes(k), k));
  assert.ok(u.laborFindingsFor({ laborSystem: "B", dayMins: [], weekDayMins: [[480, 480, 480, 480, 480, 480]], weekDates: ["2026-10-12"] }).some(f => f.key === "weekOver40"));
  assert.ok(u.agreementYearFindings([{ h: 85, ag: 85 }, { h: 85, ag: 85 }], 360).some(f => f.key === "avgOver80"));
  const src = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "app-utils.js"), "utf8");
  ["p5DayOt", "p5WeekOt", "p5Over60"].forEach(k => assert.ok(new RegExp(`key:"${k}"`).test(src), k));
  const fs = [{ key: "over8", label: "8h超1日(残業)" }, { key: "breakShort", label: "休憩不足1日" }, { key: "p5DayOt", label: "日の時間外1日" },
    { key: "dayOverAgreementB", label: "1日の残業が上限超1日" }, { key: "dayOtOverAgreement", label: "1日の残業予定が上限超1日" }, { key: "over12", label: "12h超1日" },
    { key: "weekOver40NoAgreement", label: "週40h超(協定なし)" }, { key: "monthOt100", label: "月の残業が100h以上" }, { key: "p5LegalHoliday", label: "法定休日労働1日" }];
  assert.deepStrictEqual(u.shiftTabFindingLabels(fs), ["12h超1日", "週40h超(協定なし)", "月の残業が100h以上", "法定休日労働1日"]);
  assert.deepStrictEqual(u.shiftTabFindingLabels(null), []);
  // 外すのは画面だけ: 画面の一覧は screen、PDF（buildLaborFindingsHtml）は findings のまま。総括は判定の全量
  const shift = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "app-shift.js"), "utf8");
  assert.ok(/screen:shiftTabFindingLabels\(all\)/.test(shift));
  assert.ok(/laborFindings\.filter\(f=>f\.screen\.length>0\)\.map\(\(\{name,screen\}\)/.test(shift));
  const pdf = shift.slice(shift.indexOf("const buildLaborFindingsHtml"), shift.indexOf("const renderBlock"));
  assert.ok(pdf.includes("findings.join") && !pdf.includes("screen"), "PDF は全項目のまま");
});

// 画面の「労務の確認」から外した10項目は総括の要修正にも数えない（2026-10-10 ユーザー指示）
test("総括: SHIFT_TAB_HIDDEN_FINDING_KEYS だけでは要修正にならない・ほかの要修正と残業ありは従来どおり", () => {
  const v = (sys, keys, o) => u.overallVerdictOf({ laborSystem: sys, findings: keys.map(key => ({ key })), guideKey: "none", monthReady: true, ...(o || {}) }).key;
  u.SHIFT_TAB_HIDDEN_FINDING_KEYS.forEach(k => {
    assert.notStrictEqual(v("A", [k]), "fix", `A ${k}`);
    assert.notStrictEqual(v("B", [k]), "fix", `B ${k}`);
    assert.ok(!u.OVERALL_FIX_KEYS.includes(k), `OVERALL_FIX_KEYS に ${k} が残っている`);
  });
  assert.strictEqual(v("A", u.SHIFT_TAB_HIDDEN_FINDING_KEYS), "ok");
  assert.strictEqual(v("B", ["over8", "breakShort"]), "ot", "8h超は残業ありのまま");
  assert.strictEqual(v("B", ["weekOver40"]), "ot", "週40h超は残業ありのまま");
  ["over12", "under4", "monthOt100"].forEach(k => assert.strictEqual(v("A", [k, "breakShort"]), "fix", k));
  ["timeError", "badSystem", "skilledWeekRest"].forEach(k => assert.strictEqual(v("B", [k]), "fix", k));
  assert.strictEqual(v("B", ["weekOver40NoAgreement"]), "fix");
  assert.strictEqual(v("B", [], { weekNoRest: true }), "fix", "×休なし");
  assert.strictEqual(u.overallVerdictOf({ laborSystem: "A", findings: [], guideKey: "over" }).key, "fix", "みなし超");
});
