// シフト作成タブのセルを空欄にできることの回帰テスト。
// 2026-09-26 の `96df9d6`（休暇をセルの文字で見せる）で handleBlur の先頭に入った
// 「セルに出している休暇の種別名をそのまま blur したら何もしない」ガードが、
// **休暇でないセル**にも当たっていた（leaveCellText が "" を返すため "" === "" で一致し、
// 空欄化の blur がすべて早期returnして localEdits ごと捨てられる＝文字が消えない）。
//
//   node .claude/skills/shifty-e2e-verify/scripts/example-cell-clear.js
//
// あわせて「休暇の種別（公休/有給/慶弔）もセルの文字消しで外せる」（2026-09-26 ユーザー指示の追加）を
// 測る。外す範囲は「同じコマンドをもう一度入れたとき」と同じで、ko は終日・yu/ke はその帯だけ。
//
// 期待する出力: verdict.allPass === true。
// 修正前（`SHIFTY_ROOT` に 2d1ca8d の配信物を置いて実測）は EXIT=1 で9項目が false になる:
// clear1_displayBlank / clear1_savedBlank / clear2_displayBlank / clear2_noteCleared /
// ko1_bothBlank / ko1_typeGone / ko2_bothBlank / ko2_typeGone / yu_endKept。
// **休暇セルと通常セルで壊れ方が違う**点に注意——通常セルは早期returnで localEdits ごと捨てられて
// 文字が即座に戻るが、休暇セルはガードが一致しない（"有給" ≠ ""）ので表示だけ空欄になり、
// 保存値には種別が残る＝再レンダーで戻る。そのため `yu_onlyStartCleared` は修正前でも true になる。
// Firebase へは1バイトも書かない（app-main.js を読み込まないので firebaseDB は null）。
"use strict";

const path = require("node:path");
const { openHarness } = require(path.join(__dirname, "mount-component.js"));

const JSX = `
const PA={id:"pA",urlToken:"tA",shopId:"S1",label:"7月前半",startDate:"2026-07-01",endDate:"2026-07-15",deadlineDate:"",createdAt:"2026-06-01T00:00:00.000Z"};
// 田中はスタッフ提出あり（7/2 09:00-17:00）。空欄化＝提出値を管理者が消す操作になる。
const SUB_A={id:"subA",periodId:"pA",staffName:"田中",shopId:"S1",comment:"",submittedAt:"2026-06-20T00:00:00.000Z",
  shifts:{"2026-07-02":{status:"work",start:"09:00",end:"17:00"},"2026-07-13":{status:"work",start:"09:00",end:"17:00"}}};

function Harness(){
  const [subs,setSubs]=React.useState([SUB_A]);
  const onSave=v=>setSubs(prev=>{const next=(typeof v==="function")?v(prev):v;window.__subs=next;return next;});
  return <ShiftEditTab
    subs={subs} periods={[PA]} staffList={["田中","佐藤"]}
    onSave={onSave} tt={m=>{window.__toast=m;}}
    settings={{candidates:[],weekdayCandidates:{},dateCandidates:{},templates:[]}}
    plan="premium" shopId="S1" shopName="テスト店" onUpgrade={()=>{}} allLinkedShops={[]}
    onLoadPastSubs={()=>{}} pastSubsLoaded={true}
    savePeriods={()=>{}} ownerReadOnly={false}/>;
}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);
`;

const shiftOf = (h, name, date) => h.evaluate(([n, d]) => {
  const s = (window.__subs || []).find(x => x.staffName === n);
  return s && s.shifts ? (s.shifts[d] || null) : null;
}, [name, date]);

(async () => {
  const h = await openHarness({ jsx: JSX, waitFor: "select" });
  const out = {};
  const cellValue = sel => h.page.$eval(sel, el => el.value);

  try {
    // 1) スタッフ提出のある時刻セルを空欄にする（本件の報告そのもの）
    const c1 = h.cell("田中", "2026-07-02", "start");
    out.clear1_before = await cellValue(c1);
    await h.fill(c1, "");
    out.clear1_after_display = await cellValue(c1);
    out.clear1_after_shift = await shiftOf(h, "田中", "2026-07-02");

    // 2) 管理者がメモだけ入れたセルを空欄にする（未提出スタッフ＝新規subの経路）
    const c2 = h.cell("佐藤", "2026-07-03", "start");
    await h.fill(c2, "研修");
    out.clear2_typed_display = await cellValue(c2);
    await h.fill(c2, "");
    out.clear2_after_display = await cellValue(c2);
    out.clear2_after_shift = await shiftOf(h, "佐藤", "2026-07-03");

    // 3) 非回帰: 休暇の種別名を表示したまま blur してもメモとして保存しない（ガード本来の目的）
    const c3 = h.cell("田中", "2026-07-06", "start");
    await h.fill(c3, "ko");
    out.leave_display = await cellValue(c3);
    await h.fill(c3, await cellValue(c3));   // 表示のまま blur
    out.leave_after_shift = await shiftOf(h, "田中", "2026-07-06");

    // 4) 非回帰: 通常の時刻入力が従来どおり効く
    const c4 = h.cell("田中", "2026-07-07", "end");
    await h.fill(c4, "18");
    out.time_after_shift = await shiftOf(h, "田中", "2026-07-07");

    // 5) 公休（終日）を出勤セルの文字消しで外す。**終日なので退勤セルの「公休」も一緒に消える**
    await h.fill(h.cell("田中", "2026-07-08", "start"), "ko");
    out.ko1_display = [await cellValue(h.cell("田中", "2026-07-08", "start")),
                       await cellValue(h.cell("田中", "2026-07-08", "end"))];
    await h.fill(h.cell("田中", "2026-07-08", "start"), "");
    out.ko1_after_display = [await cellValue(h.cell("田中", "2026-07-08", "start")),
                             await cellValue(h.cell("田中", "2026-07-08", "end"))];
    out.ko1_after_shift = await shiftOf(h, "田中", "2026-07-08");

    // 6) 同じことを退勤セル側からやっても同じ結果になる（どちらから外しても終日ぶん消える）
    await h.fill(h.cell("田中", "2026-07-09", "start"), "ko");
    await h.fill(h.cell("田中", "2026-07-09", "end"), "");
    out.ko2_after_display = [await cellValue(h.cell("田中", "2026-07-09", "start")),
                             await cellValue(h.cell("田中", "2026-07-09", "end"))];
    out.ko2_after_shift = await shiftOf(h, "田中", "2026-07-09");

    // 7) 有給は半日単位＝打ち込んだ帯だけ外す。両方の帯に入れてから出勤セルだけ消す
    await h.fill(h.cell("佐藤", "2026-07-10", "start"), "yu");
    await h.fill(h.cell("佐藤", "2026-07-10", "end"), "yu");
    out.yu_display = [await cellValue(h.cell("佐藤", "2026-07-10", "start")),
                      await cellValue(h.cell("佐藤", "2026-07-10", "end"))];
    await h.fill(h.cell("佐藤", "2026-07-10", "start"), "");
    out.yu_after_display = [await cellValue(h.cell("佐藤", "2026-07-10", "start")),
                            await cellValue(h.cell("佐藤", "2026-07-10", "end"))];
    out.yu_after_shift = await shiftOf(h, "佐藤", "2026-07-10");

    // 6) スタッフ提出のある日に ko を入れ、出勤セルの「公休」を消す（バグチェック#149）。
    //    打ったセルだけを空欄にしていたため、退勤セルに提出時刻が戻り片側だけの勤務になっていた。
    await h.fill(h.cell("田中", "2026-07-13", "start"), "ko");
    await h.fill(h.cell("田中", "2026-07-13", "start"), "");
    out.ko3_after_display = [await cellValue(h.cell("田中", "2026-07-13", "start")),
                             await cellValue(h.cell("田中", "2026-07-13", "end"))];

    out.errors = h.errors;
    const s1 = out.clear1_after_shift || {}, s2 = out.clear2_after_shift || {};
    const s3 = out.leave_after_shift || {}, s4 = out.time_after_shift || {};
    const k1 = out.ko1_after_shift || {}, k2 = out.ko2_after_shift || {}, y = out.yu_after_shift || {};
    const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    out.verdict = {
      clear1_displayBlank: out.clear1_after_display === "",
      clear1_savedBlank: s1.adjustedStart === "",
      clear2_displayBlank: out.clear2_after_display === "",
      clear2_noteCleared: !s2.adjustedStartNote,
      leave_stillPublic: !!(s3.leaveTypes && s3.leaveTypes.start === "public") && !s3.adjustedStartNote,
      time_applied: s4.adjustedEnd === "18:00",
      ko1_shown: eq(out.ko1_display, ["公休", "公休"]),
      ko1_bothBlank: eq(out.ko1_after_display, ["", ""]),
      ko1_typeGone: !k1.leaveTypes && !k1.leaveType && !k1.adminRest,
      ko2_bothBlank: eq(out.ko2_after_display, ["", ""]),
      ko2_typeGone: !k2.leaveTypes && !k2.leaveType && !k2.adminRest,
      ko3_staffDayBothBlank: eq(out.ko3_after_display, ["", ""]),
      yu_shown: eq(out.yu_display, ["有給", "有給"]),
      yu_onlyStartCleared: eq(out.yu_after_display, ["", "有給"]),
      yu_endKept: !!(y.leaveTypes && y.leaveTypes.end === "paid" && !y.leaveTypes.start)
        && !!(y.adminRest && y.adminRest.end && !y.adminRest.start),
      noConsoleErrors: h.errors.length === 0,
    };
    out.verdict.allPass = Object.entries(out.verdict).every(([k, v]) => k === "allPass" || v === true);
    console.log(JSON.stringify(out, null, 2));
    process.exitCode = out.verdict.allPass ? 0 : 1;
  } finally {
    await h.close();
  }
})().catch(e => { console.error("FATAL", e); process.exit(1); });
