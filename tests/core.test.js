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
  // app-admin.js:563 の _getSubForPeriod と同じ引き方
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

test("STAFF_KEYED_SETTING_MAPS: スタッフ名キーの設定マップ一覧が app-admin.js に書き写されていない", () => {
  // 改名（renameStaffInSettings）と削除の後始末（settingsWithoutStaff）は、同じ「スタッフ名を
  // キーに持つ設定マップ」という不変条件を守る2つの入口。片方が一覧を書き写していると、
  // 新しいマップを足したときに黙って守る範囲が食い違う（#105〜#107 が3回続けて踏んだ形）。
  const fs = require("node:fs");
  const src = fs.readFileSync(require("node:path").join(__dirname, "..", "app-admin.js"), "utf8");
  const literals = src.match(/\[\s*"staff[A-Za-z]+"(?:\s*,\s*"staff[A-Za-z]+")+\s*\]/g) || [];
  assert.deepStrictEqual(literals, [],
    `app-admin.js にスタッフ設定マップ一覧の直書きが残っている（STAFF_KEYED_SETTING_MAPS を使うこと）: ${literals.join(" / ")}`);
  assert.ok(/STAFF_KEYED_SETTING_MAPS\.forEach/.test(src),
    "settingsWithoutStaff が STAFF_KEYED_SETTING_MAPS を参照していない");
});

test("STAFF_KEYED_SETTING_MAPS: 凍結対象キー(PERIOD_SNAPSHOT_SETTING_KEYS)に全て含まれる", () => {
  // 含まれないマップがあると、そのマップだけ写しの側で改名が届かない＝#107 の再発になる。
  const missing = u.STAFF_KEYED_SETTING_MAPS.filter(k => !u.PERIOD_SNAPSHOT_SETTING_KEYS.includes(k));
  assert.deepStrictEqual(missing, [],
    `写しに凍結されないスタッフ設定マップがある: ${missing.join(",")}`);
});
