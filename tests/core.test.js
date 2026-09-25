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
  for (const v of ["h", "K", "x", "y", "休", "ｙ"]) assert.strictEqual(u.isReservedShopAbbr(v), true, `${v}`);
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
function collectShiftDayWrites() {
  const fs = require("node:fs");
  const path = require("node:path");
  const babel = require("@babel/core"); // devDependencies に宣言済み（@babel/parser は推移的依存なので直接requireしない）
  // 既定は配信物そのもの。SHIFTY_ADMIN_SRC は**この走査が本当に検出できるかを確かめる**ための
  // 差し替え口（app-admin.js は編集すると自動コミット＆pushされるため、対照は写しで採る）。
  const file = process.env.SHIFTY_ADMIN_SRC || path.join(__dirname, "..", "app-admin.js");
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
  const file = (envVar && process.env[envVar]) || path.join(__dirname, "..", relPath);
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
  const fs = require("node:fs");
  const src = fs.readFileSync(require("node:path").join(__dirname, "..", "app-admin.js"), "utf8");
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
  const fs = require("node:fs");
  const src = fs.readFileSync(require("node:path").join(__dirname, "..", "app-admin.js"), "utf8");
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
  assert.deepStrictEqual(u.getAttrOptions(legacy),
    [["employee", "社員"], ["parttime", "バイト"], ["dispatch", "派遣"], ["other", "その他"]]);
  // 名前の無いカスタム属性は従来どおり出さない（ID をそのまま見せないため）
  assert.deepStrictEqual(u.getAttrOptions({ staffTypeLimits: { custom_x: { daily: 0 } } }),
    [["employee", "社員"], ["parttime", "バイト"]]);
  // 一覧に無い組み込み属性は足さない（現行の既定＝社員・バイトのみ の店舗に派遣を生やさない）
  assert.deepStrictEqual(u.getAttrOptions({ staffTypeLimits: { custom_y: { name: "学生" } } }),
    [["employee", "社員"], ["parttime", "バイト"], ["custom_y", "学生"]]);
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
  assert.deepStrictEqual(u.laborFindingsFor(null, [600], 0, []), ["区分が空欄か誤り"]);
  // 不正な値も未設定と同じ扱い
  assert.strictEqual(u.laborSystemOf({ staffTypeLimits: { custom_a1: { laborSystem: "X" } } }, "custom_a1"), null);
});

test("S-4 A制の日次判定: 12h超n日・4h未満n日（境界ちょうどは出ない）", () => {
  // 13h・12h（境界）・3h59m・4h（境界）・8h
  const mins = [HM(13, 0), HM(12, 0), HM(3, 59), HM(4, 0), HM(8, 0)];
  assert.deepStrictEqual(u.laborFindingsFor("A", mins, 0, []), ["12h超1日", "4h未満1日"]);
  assert.deepStrictEqual(u.laborFindingsFor("A", [HM(12, 1), HM(12, 1)], 0, []), ["12h超2日"]);
  assert.deepStrictEqual(u.laborFindingsFor("A", [HM(8, 0)], 0, []), [], "どれにも当たらなければ空");
});

test("S-4 B制の日次判定: 8h超n日(残業)・週40h超(残業)", () => {
  // 8h01m と 9h が超過、8hちょうど（境界）は出ない
  assert.deepStrictEqual(u.laborFindingsFor("B", [HM(8, 1), HM(8, 0), HM(9, 0)], 0, []), ["8h超2日(残業)"]);
  assert.deepStrictEqual(
    u.laborFindingsFor("B", [HM(7, 0), HM(7, 0), HM(7, 0), HM(7, 0), HM(7, 0), HM(7, 0)], 0,
      [[HM(7, 0), HM(7, 0), HM(7, 0), HM(7, 0), HM(7, 0), HM(7, 0), 0]]),
    ["週40h超(残業)"]);
  // A制の判定（12h超・4h未満）はB制では出ない
  assert.deepStrictEqual(u.laborFindingsFor("B", [HM(13, 0)], 0, []), ["8h超1日(残業)"]);
});

test("S-4 時刻の入力ミス: 区分によらず件数つきで出る", () => {
  assert.deepStrictEqual(u.laborFindingsFor("A", [], 2, []), ["時刻の入力ミス2日"]);
  assert.deepStrictEqual(u.laborFindingsFor("none", [], 1, []), ["時刻の入力ミス1日"]);
  assert.deepStrictEqual(u.laborFindingsFor(null, [], 1, []), ["時刻の入力ミス1日", "区分が空欄か誤り"]);
});

test("項目1: 判定対象外（応援・外部）のスタッフは労働時間の判定から除外される", () => {
  // 13h・3h・9h が並んでも A制/B制 のどの判定も出ない（週40h超も出ない）
  const mins = [HM(13, 0), HM(3, 0), HM(9, 0), HM(9, 0), HM(9, 0), HM(9, 0)];
  const weeks = [[HM(9, 0), HM(9, 0), HM(9, 0), HM(9, 0), HM(9, 0), HM(9, 0), 0]];
  assert.deepStrictEqual(u.laborFindingsFor("none", mins, 0, weeks), []);
  // 同じ入力を A制／B制 に入れると判定が出る＝素通りするテストではない
  assert.ok(u.laborFindingsFor("A", mins, 0, weeks).length > 0);
  assert.ok(u.laborFindingsFor("B", mins, 0, weeks).length > 0);
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
  const fs = require("node:fs"), path = require("node:path");
  // 既定は配信物そのもの。SHIFTY_ADMIN_SRC はこの走査が本当に検出できるかを確かめる差し替え口。
  const file = process.env.SHIFTY_ADMIN_SRC || path.join(__dirname, "..", "app-admin.js");
  const raw = fs.readFileSync(file, "utf8");
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
});
