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
// 移る前と同じに見る必要があるので、2ファイルを読み込み順（admin→company）で連結した1本として読む。
// どちらも import/export の無いグローバルスクリプトなので、連結しても1つのスクリプトとして構文が成り立つ。
// 差し替え口: SHIFTY_ADMIN_SRC（app-admin.js の写し）・SHIFTY_COMPANY_SRC（app-company.js の写し）。
// 走査の検出力を対照で確かめるときに使う（配信物は編集すると自動コミットされるため写しで採る）。
function _readAdminSurface() {
  const fs = require("node:fs");
  const path = require("node:path");
  const admin = process.env.SHIFTY_ADMIN_SRC || path.join(__dirname, "..", "app-admin.js");
  const company = process.env.SHIFTY_COMPANY_SRC || path.join(__dirname, "..", "app-company.js");
  return fs.readFileSync(admin, "utf8") + "\n" + fs.readFileSync(company, "utf8");
}

function collectShiftDayWrites() {
  const babel = require("@babel/core"); // devDependencies に宣言済み（@babel/parser は推移的依存なので直接requireしない）
  // 既定は配信物そのもの（app-admin.js＋app-company.js）。SHIFTY_ADMIN_SRC／SHIFTY_COMPANY_SRC は
  // **この走査が本当に検出できるかを確かめる**ための差し替え口（_readAdminSurface）。
  const src = _readAdminSurface();
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
  // app-admin.js は切り出した app-company.js と連結して読む（_readAdminSurface。2026-09-30 分割）
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
  // 固定は 社員 → パート・アルバイト の2つだけ。派遣／その他は固定の外なので50音順に入る（その他 < 派遣）
  assert.deepStrictEqual(u.getAttrOptions(legacy),
    [["employee", "社員"], ["parttime", "パート・アルバイト"], ["other", "その他"], ["dispatch", "派遣"]]);
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

test("項目1 laborSystemOf: 組み込み属性の既定は 社員=A・バイト=B・派遣/その他=対象外", () => {
  assert.strictEqual(u.laborSystemOf({}, "employee"), "A");
  assert.strictEqual(u.laborSystemOf({}, "parttime"), "B");
  assert.strictEqual(u.laborSystemOf({}, "dispatch"), "none");
  assert.strictEqual(u.laborSystemOf({}, "other"), "none");
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

test("項目1: 判定対象外（応援・外部）のスタッフは労働時間の判定から除外される", () => {
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
  // 既定は配信物そのもの（app-admin.js＋app-company.js）。SHIFTY_ADMIN_SRC／SHIFTY_COMPANY_SRC は
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
  // 共通の3つはどちらの区分でも要修正
  for (const o of [{ timeErrorCount: 1 }, { breakShortCount: 1 }]) {
    assert.strictEqual(v({ laborSystem: "B", findings: F({ laborSystem: "B", ...o }), guideKey: "none" }), "要修正");
  }
  // 判定対象外は休憩不足も出さない（労務の判定のため）。時刻の入力ミスだけは区分によらず出る
  assert.deepStrictEqual(u.laborFindingLabels({ laborSystem: "none", breakShortCount: 2, timeErrorCount: 1 }),
    ["時刻の入力ミス1日"]);
  assert.strictEqual(v({ laborSystem: null, findings: F({ laborSystem: null }), guideKey: "none" }), "要修正", "区分が空欄");
  // 判定対象外は空欄
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
  // 判定対象外は日付を渡しても休憩不足そのものを出さない（区分の規則が先）
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

// ===== P3.5a 休憩の中休み方式＋長さ方式のしきい値設定（労務給与_複数法人_実装計画.md §3.9-1・§6 P3.5a）=====
// 期待値は計画書 §6 P3.5a のテスト欄からの転記。設定値（14:30 等）は店舗設定の例で、コードには無い。
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
  // 時間帯方式の店舗も中休みを持たなければ変わらない
  assert.strictEqual(brkMin(BT([{ start: "12:00", end: "13:00" }]), { start: "10:00", end: "22:00" }), 60);
});
test("P3.5a 中休み: 優先順は 上書き ＞ 中休み ＞ 長さ ＞ 時間帯", () => {
  const st = { ...BT([{ start: "12:00", end: "13:00" }]), breakMode: "length", breakLength: BIND6, idleBreak: IDLE };
  assert.strictEqual(brkMin(st, { start: "10:00", end: "22:00" }), 120, "10-22 平日は中休み120分");
  assert.strictEqual(brkMin(st, { start: "15:00", end: "23:00" }), 60, "15-23 は中休みに当たらず長さ方式の60分");
  assert.strictEqual(brkMin(st, { start: "10:00", end: "16:59" }), 60, "退勤が endAfter より前は中休みに当たらない");
  assert.strictEqual(brkMin(st, { start: "14:30", end: "17:00" }), 120, "境界ちょうど（出勤=startBy・退勤=endAfter）も当たる");
  assert.strictEqual(brkMin(st, { start: "14:45", end: "22:00" }), 60, "出勤が startBy より後は当たらない");
  assert.strictEqual(brkMin(st, { start: "10:00", end: "22:00", adjustedBreak: 30 }), 30, "日別の上書きが最優先");
  assert.strictEqual(brkMin(st, { start: "10:00", end: "22:00" }, "2026-10-03"), 60, "土曜は平日のみの中休みに当たらない");
  assert.strictEqual(brkMin({ ...st, idleBreak: { ...IDLE, days: "all" } }, { start: "10:00", end: "22:00" }, "2026-10-03"), 120, "毎日なら土曜も当たる");
  assert.strictEqual(brkMin({ ...st, idleBreak: { ...IDLE, days: "none" } }, { start: "10:00", end: "22:00" }), 60, "どの日にも付けない");
  assert.strictEqual(brkMin({ ...st, idleBreak: { ...IDLE, enabled: false } }, { start: "10:00", end: "22:00" }), 60, "無効なら長さ方式");
  // 時間帯方式の店舗でも中休みが帯より先に効く
  const band = { ...BT([{ start: "12:00", end: "13:00" }]), idleBreak: IDLE };
  assert.strictEqual(brkMin(band, { start: "10:00", end: "22:00" }), 120);
  // 片側セルには付けない（他の方式と同じ）
  assert.deepStrictEqual(u.getBreaksFor(band, WD, "田中", { status: "work", start: "10:00" }), []);
  // 合成の帯（ヒートマップは時刻として読まない）
  assert.strictEqual(u.getBreaksFor(band, WD, "田中", { status: "work", start: "10:00", end: "22:00" })[0].synthetic, true);
});
test("P3.5a 休憩の出どころ（自動＝中休み／長さ／時間帯・手動＝上書き）と「自動に戻す」の値", () => {
  const st = { ...BT([]), breakMode: "length", breakLength: BIND6, idleBreak: IDLE };
  const d = sh => u.breakDecisionOf(st, WD, "田中", { status: "work", ...sh });
  assert.deepStrictEqual(d({ start: "10:00", end: "22:00" }), { source: "idle", min: 120, autoMin: 120, autoSource: "idle" });
  assert.deepStrictEqual(d({ start: "15:00", end: "23:00" }), { source: "length", min: 60, autoMin: 60, autoSource: "length" });
  assert.deepStrictEqual(d({ start: "10:00", end: "22:00", adjustedBreak: 45 }), { source: "manual", min: 45, autoMin: 120, autoSource: "idle" });
  assert.strictEqual(d({ start: "10:00", end: "22:00", adjustedBreak: 0 }).source, "manual", "0 も手動（休憩なし）");
  assert.strictEqual(u.breakDecisionOf(BT([]), WD, "田中", { status: "work", start: "10:00", end: "15:00" }).source, "band");
});
test("P3.5a 休憩不足の判定（isBreakShort）は法定の基準のまま", () => {
  // 設定で段を短くしても、法定（実働6h超で45分）を下回れば不足になる
  const st = { ...BT([]), breakMode: "length", breakLength: { basis: "binding", tiers: [{ overMin: 360, breakMin: 30, inclusive: true }] } };
  assert.strictEqual(u.isBreakShort({ status: "work", start: "10:00", end: "17:30" }, st, WD, "田中"), true);
  const ok = { ...st, breakLength: BIND6 };
  assert.strictEqual(u.isBreakShort({ status: "work", start: "10:00", end: "17:30" }, ok, WD, "田中"), false);
  assert.ok(u.PERIOD_SNAPSHOT_SETTING_KEYS.includes("idleBreak"), "確定済み期間は写しの中休みで計算する");
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
    assert.strictEqual(per("dayOtOverAgreement"), countOf(labels, /^1日の残業予定が上限超/), "A制の1日残業");
    assert.strictEqual(per("dayOverAgreementB"), countOf(labels, /^1日の残業が上限超/), "B制の1日残業");
    // **塗らないと決めたもの**は日ごとの一覧に出ない（パネルには出る・2026-09-26 ユーザー指定）
    assert.strictEqual(per("under4"), 0, "4h未満は塗らない");
    assert.strictEqual(per("breakShort"), 0, "休憩不足は塗らない");
    assert.ok(countOf(labels, /^4h未満/) + countOf(labels, /^休憩不足/) >= 0, "パネル側の件数は数えられる");
    // 返すキーは要修正だけ（8h超・週40h超のような「残業あり」は塗らない）
    days.forEach(ks => ks.forEach(k => {
      assert.ok(u.LABOR_DAY_FIX_KEYS.includes(k), `${k} は LABOR_DAY_FIX_KEYS にある`);
      assert.ok(u.OVERALL_FIX_KEYS.includes(k), `${k} は要修正のキー`);
    }));
  }
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
});

// 労務の要修正の色は**画面だけ**の目印で、配る Excel・PDF には出さない（2026-09-26 ユーザー指示）。
// 現状そうなっているのは「書き出しが画面とは別の色付けを持っている」からで、
// 誰かが揃えようとして参照を足すと黙って配布物に出る。ここで参照が無いことを固定する。
test("Excel・PDF の書き出しは労務の要修正の色を参照しない", () => {
  const src = _readAdminSurface(); // app-admin.js＋app-company.js（2026-09-30 分割）
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
  const targets = [["PDF", "const buildShiftTableHtml="], ["Excel", "function expXl("]];
  for (const [label, marker] of targets) {
    const body = bodyFrom(marker);
    assert.ok(body.split("\n").length > 50, `${label}: 本体の切り出しが短すぎる（${body.split("\n").length}行）`);
    for (const ident of ["laborDayErrors", "laborErrTitle", "LEGEND_COLORS.laborErr"]) {
      assert.ok(!body.includes(ident), `${label} の書き出しが ${ident} を参照している`);
    }
  }
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
  const admin = _readAdminSurface(); // app-admin.js＋app-company.js（2026-09-30 分割）
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
  assert.strictEqual(cfp.planPeopleSync(people, p1bRegs(P1B_SHOPS), () => "p_x", "T4").patch, null, "推定では同じ人でも、解除した登録は再びまとめない");
  assert.ok(cfp.planSplitPerson(people, "12", { shopId: "A1", name: "田中" }, () => "p_x", "T").error, "登録が1つだけなら切り出せない");
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
  ["ensureCompanyPeople", "mergePeople", "splitPerson", "reassignPersonId", "companyRenameStaff", "companyUpdateStaff"]
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
test("P2 目安: 年間所定を設定すると所定上限 + 固定残業 − 余裕（31日 199h／30日 193h／2月 182h）。上限は変えない", () => {
  const ls = { laborSettings: { annualScheduledMin: HM(2080, 0) } };
  assert.strictEqual(u.laborMonthFrame(ls, "2026-10").guideMin, HM(199, 0));
  assert.strictEqual(u.laborMonthFrame(ls, "2026-11").guideMin, HM(193, 0));
  assert.strictEqual(u.laborMonthFrame(ls, "2027-02").guideMin, HM(182, 0));
  // 上限（総枠 + 固定残業）と総枠は年間所定に関係なく従来どおり
  assert.strictEqual(u.laborMonthFrame(ls, "2026-10").capMin, HM(207, 8));
  assert.strictEqual(u.laborMonthFrame(ls, "2026-10").baseMin, HM(177, 8));
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
  assert.strictEqual((admin.match(/readOnly=\{!canEditCells\}/g) || []).length, 2);
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

// ===== P3.5c 判定対象外（区分 none）の長時間の日に色を付ける（§3.9-3・§6 P3.5c）=====
test("P3.5c 外部の長時間の日: トグル既定オフ・しきい値ちょうどは塗らない・表と総括には載せない", () => {
  const ls0 = u.laborSettingsOf({});
  assert.strictEqual(ls0.highlightExternalOver8h, 0, "既定はオフ");
  assert.strictEqual(u.externalOverThresholdOf(ls0), 0, "オフならしきい値0＝塗らない");
  const ls = u.laborSettingsOf({ laborSettings: { highlightExternalOver8h: 1 } });
  assert.strictEqual(u.externalOverThresholdOf(ls), u.LEGAL_DAILY_MIN, "既定のしきい値は法定8h");
  const th = u.externalOverThresholdOf(ls);
  const d = u.laborDayFindingsFor({ laborSystem: "none", dayMins: [th, th + 1, 0, 900], externalOverMin: th });
  assert.deepStrictEqual(d, [[], ["externalOver"], [], ["externalOver"]], "ちょうど閾値は塗らない・超えた日だけ");
  assert.deepStrictEqual(u.laborDayFindingsFor({ laborSystem: "none", dayMins: [900] }), [[]], "トグルオフ（0）なら塗らない");
  // 対象は区分 none だけ（A・B の人の長い日には付けない）
  assert.deepStrictEqual(u.laborDayFindingsFor({ laborSystem: "B", dayMins: [900], externalOverMin: th }), [[]]);
  assert.ok(!u.laborDayFindingsFor({ laborSystem: "A", dayMins: [600], externalOverMin: th })[0].includes("externalOver"));
  // しきい値は設定値
  assert.strictEqual(u.externalOverThresholdOf(u.laborSettingsOf({ laborSettings: { highlightExternalOver8h: 1, externalOverThresholdMin: 600 } })), 600);
  // 判定表（laborFindingsFor）と総括（OVERALL_FIX_KEYS）には載せない
  assert.ok(u.LABOR_DAY_FIX_KEYS.includes("externalOver") && u.LABOR_DAY_ERR_LABELS.externalOver);
  assert.ok(!u.OVERALL_FIX_KEYS.includes("externalOver"));
  assert.deepStrictEqual(u.laborFindingLabels({ laborSystem: "none", dayMins: [900], externalOverMin: th }), []);
  assert.strictEqual(u.overallVerdictOf({ laborSystem: "none", findings: [] }).key, "none");
  // セル色は専用の赤（CELL_COLOR_LEGEND の externalOver）。労務の要修正（紫）・店舗間重複（dup の赤）とは別の色
  const col = k => (u.CELL_COLOR_LEGEND.find(c => c.key === k) || {}).color;
  assert.ok(col("externalOver"), "externalOver の色がレジェンドに登録されている");
  assert.notStrictEqual(col("externalOver"), col("laborErr"));
  assert.notStrictEqual(col("externalOver"), col("dup"));
  assert.ok(/^rgba\((1[5-9]\d|2[0-5]\d),\s*\d{1,2},\s*\d{1,2},/.test(col("externalOver")), "赤系（R が高く G・B が低い）");
  const src = _readAdminSurface();
  assert.ok(/includes\("externalOver"\)\?LEGEND_COLORS\.externalOver:LEGEND_COLORS\.laborErr/.test(src), "セルの色付けが externalOver のキーで分かれている");
  // CF の書き写しと一致（キー一覧・範囲は上の company-config のドリフト検出が照合する）
  assert.ok(cfc.COMPANY_LABOR_KEYS.includes("highlightExternalOver8h") && cfc.COMPANY_LABOR_KEYS.includes("externalOverThresholdMin"));
  assert.deepStrictEqual(cfc.COMPANY_LABOR_RANGES.highlightExternalOver8h, u.LABOR_SETTING_RANGES.highlightExternalOver8h);
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
