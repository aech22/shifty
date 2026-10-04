// mount-component.js + 1.8節（生成された .xlsx を読む）の動作サンプル兼リグレッションテスト。
// バグチェック#137「その日のエントリを持たない日を Excel だけが休み（斜線）で描く」
// （app-admin.js の expXl・修正 = `else if(!sh)` 分岐の追加）をそのまま再現する。
//
//   node .claude/skills/shifty-e2e-verify/scripts/example-excel-missing-day.js
//
// 期待する出力: verdict.allPass === true。
// 修正前の版に向けると 田中 09-04/09-05 と 佐藤 の未入力4日が "斜線" になり false になる:
//   SHIFTY_ROOT=<修正前の配信物のあるディレクトリ> node .../example-excel-missing-day.js
//
// sub はあるのに その日の shifts エントリが無い状態は例外ではなく常用経路で生まれる:
//   1) 管理者がシフト作成グリッドで未提出スタッフのセルに入力すると applyEditToSubs が
//      **その日だけ**を持つ sub（source:"grid"）を作る＝期間の残り全日がこの状態になる
//   2) スタッフの提出後に期間の終了日を延ばすと、増えた日は提出時の shifts に無い
// 画面（holidayCellDash の `if(!sh)return false`）・PDF（`if(sh&&sh.status==="holiday")`）は
// どちらも空白にしており、Excel だけが else（休み）へ落ちていた。
//
// 2026-10-04（D・ユーザー指示「PDF も種別名に」「Excel も統一して」）: 休暇のセルは種別名（公休・有給・慶弔）で、斜線を引かない。
// 高橋の5日: ko（上下とも公休）・yu 午前（上だけ有給・下は時刻）・ke 午後（上は時刻・下だけ慶弔）・/（種別なし＝斜線のまま）・
// 提出の休みの日に yu 午前（上は有給・下は斜線）。2つの入口（resolver あり／なし）で同じ。種別名のセルは 12pt・中央・shrinkToFit。
// **種別名はシフト作成タブからの出力（resolver あり）だけ**。期間管理タブ（resolver なし）は「提出したままで良い」（ユーザー決定）＝
// D の前と同じ斜線。基準 PERIODS_TAB_LEAVE_19DA811 は 19da811 の配信物で書き出した高橋の列のセル（値・罫線・整列・文字・塗り）。
// 取り直し: DUMP_BASELINE=1 SHIFTY_ROOT=<19da811 の配信物> node ... が基準を出力する
// 反証: SHIFTY_ROOT=<D の前の配信物> で j_・k_ が落ちる
//
// Firebase へは1バイトも書かない（app-main.js を読み込まないので firebaseDB は null）。
"use strict";

const path = require("node:path");
const { openHarness } = require(path.join(__dirname, "mount-component.js"));

// K2 の前（b014efa）に書き出した名前セル以外の書式。名前セル以外が変わっていないことの基準
const OTHERS_BEFORE_K2 = {"periodLabel":{"al":{"horizontal":"center","vertical":"distributed"},"font":{"size":14,"bold":true,"color":null}},"wdHead":{"al":{"horizontal":"center","vertical":"distributed"},"font":{"size":14,"bold":true,"color":null}},"wdRight":{"al":{"horizontal":"center","vertical":"distributed"},"font":{"size":14,"bold":true,"color":null}},"shopName":{"al":{"horizontal":"center","vertical":"distributed"},"font":{"size":14,"bold":true,"color":null}},"number":{"al":{"horizontal":"center","vertical":"middle"},"font":{"size":8,"bold":false,"color":"FF000000"}},"day":{"al":{"horizontal":"center","vertical":"middle"},"font":{"size":12,"bold":false,"color":"FF000000"}},"weekday":{"al":{"horizontal":"center","vertical":"middle"},"font":{"size":12,"bold":false,"color":"FF000000"}},"timeTop":{"al":{"horizontal":"center","vertical":"middle"},"font":{"size":12,"bold":false,"color":null}},"timeBottom":{"al":{"horizontal":"center","vertical":"middle"},"font":{"size":12,"bold":false,"color":null}}};
const PERIODS_TAB_LEAVE_19DA811 = [["{\"v\":null,\"b\":{\"left\":{\"style\":\"thin\",\"color\":{\"argb\":\"FFAAAAAA\"}},\"right\":{\"style\":\"thin\",\"color\":{\"argb\":\"FFAAAAAA\"}},\"top\":{\"style\":\"medium\",\"color\":{\"argb\":\"FF555555\"}},\"bottom\":{\"style\":\"hair\",\"color\":{\"argb\":\"FFCCCCCC\"}},\"diagonal\":{\"style\":\"thin\",\"color\":{\"argb\":\"FFAAAAAA\"},\"up\":false,\"down\":true}},\"a\":{\"horizontal\":\"center\",\"vertical\":\"middle\"},\"f\":{\"size\":12,\"name\":\"Yu Gothic\"},\"fill\":{\"type\":\"pattern\",\"pattern\":\"none\",\"fgColor\":{\"argb\":\"FFFFFFFF\"},\"bgColor\":{\"argb\":\"FFFFFFFF\"}}}","{\"v\":null,\"b\":{\"left\":{\"style\":\"thin\",\"color\":{\"argb\":\"FFAAAAAA\"}},\"right\":{\"style\":\"thin\",\"color\":{\"argb\":\"FFAAAAAA\"}},\"top\":{\"style\":\"hair\",\"color\":{\"argb\":\"FFCCCCCC\"}},\"bottom\":{\"style\":\"thin\",\"color\":{\"argb\":\"FFAAAAAA\"}},\"diagonal\":{\"style\":\"thin\",\"color\":{\"argb\":\"FFAAAAAA\"},\"up\":false,\"down\":true}},\"a\":{\"horizontal\":\"center\",\"vertical\":\"middle\"},\"f\":{\"size\":12,\"name\":\"Yu Gothic\"},\"fill\":{\"type\":\"pattern\",\"pattern\":\"none\",\"fgColor\":{\"argb\":\"FFFFFFFF\"},\"bgColor\":{\"argb\":\"FFFFFFFF\"}}}"],["{\"v\":null,\"b\":{\"left\":{\"style\":\"thin\",\"color\":{\"argb\":\"FFAAAAAA\"}},\"right\":{\"style\":\"thin\",\"color\":{\"argb\":\"FFAAAAAA\"}},\"top\":{\"style\":\"medium\",\"color\":{\"argb\":\"FF555555\"}},\"bottom\":{\"style\":\"hair\",\"color\":{\"argb\":\"FFCCCCCC\"}},\"diagonal\":{\"style\":\"thin\",\"color\":{\"argb\":\"FFAAAAAA\"},\"up\":false,\"down\":true}},\"a\":{\"horizontal\":\"center\",\"vertical\":\"middle\"},\"f\":{\"size\":12,\"name\":\"Yu Gothic\"},\"fill\":{\"type\":\"pattern\",\"pattern\":\"none\",\"fgColor\":{\"argb\":\"FFFFFFFF\"},\"bgColor\":{\"argb\":\"FFFFFFFF\"}}}","{\"v\":\"22\",\"b\":{\"left\":{\"style\":\"thin\",\"color\":{\"argb\":\"FFAAAAAA\"}},\"right\":{\"style\":\"thin\",\"color\":{\"argb\":\"FFAAAAAA\"}},\"top\":{\"style\":\"hair\",\"color\":{\"argb\":\"FFCCCCCC\"}},\"bottom\":{\"style\":\"thin\",\"color\":{\"argb\":\"FFAAAAAA\"}}},\"a\":{\"horizontal\":\"center\",\"vertical\":\"middle\"},\"f\":{\"size\":12,\"name\":\"Yu Gothic\"},\"fill\":{\"type\":\"pattern\",\"pattern\":\"none\",\"fgColor\":{\"argb\":\"FFFFFFFF\"},\"bgColor\":{\"argb\":\"FFFFFFFF\"}}}"],["{\"v\":\"11\",\"b\":{\"left\":{\"style\":\"thin\",\"color\":{\"argb\":\"FFAAAAAA\"}},\"right\":{\"style\":\"thin\",\"color\":{\"argb\":\"FFAAAAAA\"}},\"top\":{\"style\":\"medium\",\"color\":{\"argb\":\"FF555555\"}},\"bottom\":{\"style\":\"hair\",\"color\":{\"argb\":\"FFCCCCCC\"}}},\"a\":{\"horizontal\":\"center\",\"vertical\":\"middle\"},\"f\":{\"size\":12,\"name\":\"Yu Gothic\"},\"fill\":{\"type\":\"pattern\",\"pattern\":\"none\",\"fgColor\":{\"argb\":\"FFFFFFFF\"},\"bgColor\":{\"argb\":\"FFFFFFFF\"}}}","{\"v\":null,\"b\":{\"left\":{\"style\":\"thin\",\"color\":{\"argb\":\"FFAAAAAA\"}},\"right\":{\"style\":\"thin\",\"color\":{\"argb\":\"FFAAAAAA\"}},\"top\":{\"style\":\"hair\",\"color\":{\"argb\":\"FFCCCCCC\"}},\"bottom\":{\"style\":\"thin\",\"color\":{\"argb\":\"FFAAAAAA\"}},\"diagonal\":{\"style\":\"thin\",\"color\":{\"argb\":\"FFAAAAAA\"},\"up\":false,\"down\":true}},\"a\":{\"horizontal\":\"center\",\"vertical\":\"middle\"},\"f\":{\"size\":12,\"name\":\"Yu Gothic\"},\"fill\":{\"type\":\"pattern\",\"pattern\":\"none\",\"fgColor\":{\"argb\":\"FFFFFFFF\"},\"bgColor\":{\"argb\":\"FFFFFFFF\"}}}"],["{\"v\":null,\"b\":{\"left\":{\"style\":\"thin\",\"color\":{\"argb\":\"FFAAAAAA\"}},\"right\":{\"style\":\"thin\",\"color\":{\"argb\":\"FFAAAAAA\"}},\"top\":{\"style\":\"medium\",\"color\":{\"argb\":\"FF555555\"}},\"bottom\":{\"style\":\"hair\",\"color\":{\"argb\":\"FFCCCCCC\"}},\"diagonal\":{\"style\":\"thin\",\"color\":{\"argb\":\"FFAAAAAA\"},\"up\":false,\"down\":true}},\"a\":{\"horizontal\":\"center\",\"vertical\":\"middle\"},\"f\":{\"size\":12,\"name\":\"Yu Gothic\"},\"fill\":{\"type\":\"pattern\",\"pattern\":\"none\",\"fgColor\":{\"argb\":\"FFFFFFFF\"},\"bgColor\":{\"argb\":\"FFFFFFFF\"}}}","{\"v\":null,\"b\":{\"left\":{\"style\":\"thin\",\"color\":{\"argb\":\"FFAAAAAA\"}},\"right\":{\"style\":\"thin\",\"color\":{\"argb\":\"FFAAAAAA\"}},\"top\":{\"style\":\"hair\",\"color\":{\"argb\":\"FFCCCCCC\"}},\"bottom\":{\"style\":\"thin\",\"color\":{\"argb\":\"FFAAAAAA\"}},\"diagonal\":{\"style\":\"thin\",\"color\":{\"argb\":\"FFAAAAAA\"},\"up\":false,\"down\":true}},\"a\":{\"horizontal\":\"center\",\"vertical\":\"middle\"},\"f\":{\"size\":12,\"name\":\"Yu Gothic\"},\"fill\":{\"type\":\"pattern\",\"pattern\":\"none\",\"fgColor\":{\"argb\":\"FFFFFFFF\"},\"bgColor\":{\"argb\":\"FFFFFFFF\"}}}"],["{\"v\":null,\"b\":{\"left\":{\"style\":\"thin\",\"color\":{\"argb\":\"FFAAAAAA\"}},\"right\":{\"style\":\"thin\",\"color\":{\"argb\":\"FFAAAAAA\"}},\"top\":{\"style\":\"medium\",\"color\":{\"argb\":\"FF555555\"}},\"bottom\":{\"style\":\"hair\",\"color\":{\"argb\":\"FFCCCCCC\"}},\"diagonal\":{\"style\":\"thin\",\"color\":{\"argb\":\"FFAAAAAA\"},\"up\":false,\"down\":true}},\"a\":{\"horizontal\":\"center\",\"vertical\":\"middle\"},\"f\":{\"size\":12,\"name\":\"Yu Gothic\"},\"fill\":{\"type\":\"pattern\",\"pattern\":\"solid\",\"fgColor\":{\"argb\":\"FFDDEEFF\"},\"bgColor\":{\"argb\":\"FFFFFFFF\"}}}","{\"v\":null,\"b\":{\"left\":{\"style\":\"thin\",\"color\":{\"argb\":\"FFAAAAAA\"}},\"right\":{\"style\":\"thin\",\"color\":{\"argb\":\"FFAAAAAA\"}},\"top\":{\"style\":\"hair\",\"color\":{\"argb\":\"FFCCCCCC\"}},\"bottom\":{\"style\":\"medium\",\"color\":{\"argb\":\"FF555555\"}},\"diagonal\":{\"style\":\"thin\",\"color\":{\"argb\":\"FFAAAAAA\"},\"up\":false,\"down\":true}},\"a\":{\"horizontal\":\"center\",\"vertical\":\"middle\"},\"f\":{\"size\":12,\"name\":\"Yu Gothic\"},\"fill\":{\"type\":\"pattern\",\"pattern\":\"solid\",\"fgColor\":{\"argb\":\"FFDDEEFF\"},\"bgColor\":{\"argb\":\"FFFFFFFF\"}}}"]];
const DATES = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"];

(async () => {
  const h = await openHarness({
    jsx: `function Harness(){return React.createElement("div",{id:"ok"},"ready");}
          ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(Harness));`,
    waitFor: "#ok",
    extraHead: `<script src="https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js"></script>`,
  });

  const out = await h.page.evaluate(async (dates) => {
    const period = { id: "p1", label: "9月前半", startDate: dates[0], endDate: dates[4], urlToken: "t1" };
    const mk = (s, e) => ({ status: "work", start: s, end: e });
    const subs = [{
      id: "s1", periodId: "p1", staffName: "田中",
      shifts: {
        [dates[0]]: mk("09:00", "18:00"),
        [dates[1]]: { status: "holiday" },                                    // 本人提出の休み → 斜線のまま
        [dates[2]]: { status: "work", adminRest: { start: true, end: true } }, // 管理者の /（休み希望） → 斜線のまま
        // dates[3] / dates[4] は期間の延長で増えた日＝エントリ無し → 空白であるべき
      }, comment: "", submittedAt: "2026-09-01T00:00:00Z",
    }, {
      // グリッドで1日だけ入力して作られた sub。提出はしていないので他の日を持たない
      id: "s2", periodId: "p1", staffName: "佐藤", source: "grid",
      shifts: { [dates[1]]: { status: "work", adjustedStart: "10:00", adjustedEnd: "19:00" } },
      comment: "", submittedAt: "2026-09-01T00:00:00Z",
    }, {
      id: "s3", periodId: "p1", staffName: "高橋",
      shifts: {
        [dates[0]]: { status: "work", start: "10:00", end: "15:00", adminRest: { start: true, end: true }, leaveTypes: { start: "public", end: "public" } },
        [dates[1]]: { status: "work", end: "22:00", adminRest: { start: true }, leaveTypes: { start: "paid" } },
        [dates[2]]: { status: "work", start: "11:00", adminRest: { end: true }, leaveTypes: { end: "ceremony" } },
        [dates[3]]: { status: "work", start: "10:00", end: "15:00", adminRest: { start: true, end: true } },
        [dates[4]]: { status: "holiday", adminRest: { start: true }, leaveTypes: { start: "paid" } },
      }, comment: "", submittedAt: "2026-09-01T00:00:00Z",
    }];
    const staffList = ["田中", "佐藤", "鈴木", "高橋"];   // 鈴木は sub 自体が無い（対照＝従来から空白）
    const settings = { shopId: "x", candidates: [], weekdayCandidates: {}, dateCandidates: {}, breakTimes: {} };

    // シフト作成タブ側の入口（adjResolver）を模す。未保存の localEdits も1つ混ぜて、
    // 「保存していない編集は従来どおり出る」＝修正が握り潰していないことを同時に測る。
    const localEdits = { [`佐藤|${dates[4]}|start`]: "13" };
    const resolver = (nm, ds, field) => {
      const sub = subs.find(s => s.staffName === nm);
      const sh = sub && sub.shifts[ds];
      if (sh && sh.adminRest && sh.adminRest[field]) return { time: "", note: "", fixed: false, rest: true };
      const key = `${nm}|${ds}|${field}`;
      if (key in localEdits) return { time: localEdits[key].padStart(2, "0") + ":00", note: "", fixed: false };
      if (!sh) return { time: "", note: "", fixed: false };
      return { time: (field === "start" ? (sh.adjustedStart ?? sh.start) : (sh.adjustedEnd ?? sh.end)) || "", note: "", fixed: false };
    };

    const run = async (useResolver) => {
      const captured = [];
      const oC = URL.createObjectURL, oK = HTMLAnchorElement.prototype.click;
      URL.createObjectURL = b => { captured.push(b); return "blob:stub"; };
      HTMLAnchorElement.prototype.click = function () {};
      try {
        expXl(period, subs, staffList, () => {}, "検証店舗",
          { settings, staffAliases: {}, staffColors: { 田中: "red" }, staffNumbers: { 田中: "12" } },
          useResolver ? resolver : null);
        await new Promise(r => setTimeout(r, 1500));   // writeBuffer() は非同期
      } finally { URL.createObjectURL = oC; HTMLAnchorElement.prototype.click = oK; }
      if (!captured.length) throw new Error("Blobが捕まらなかった");

      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await captured[0].arrayBuffer());
      const ws = wb.worksheets[0];
      const head = [];
      ws.getRow(2).eachCell({ includeEmpty: true }, c => head.push(c.value == null ? "" : String(c.value)));
      const r = {};
      for (const nm of ["田中", "佐藤", "鈴木"]) {
        const ci = head.indexOf(nm) + 1;
        r[nm] = dates.map((ds, di) => {
          const rT = 3 + di * 2;   // DATA_START=3・1日=2行
          const cT = ws.getRow(rT).getCell(ci), cB = ws.getRow(rT + 1).getCell(ci);
          const diag = c => !!(c.border && c.border.diagonal);
          const v = [cT.value, cB.value].map(x => x == null ? "" : String(x)).join("/");
          return (diag(cT) || diag(cB)) ? "斜線" : (v === "/" ? "空白" : v);
        });
      }
      // K2（2026-10-04）: 名前行の書式と、名前セル以外の書式（変わっていないことの照合用）
      const st = c => ({ al: c.alignment || null, font: c.font ? { size: c.font.size, bold: !!c.font.bold, color: c.font.color ? c.font.color.argb : null } : null });
      const ci = nm => head.indexOf(nm) + 1;
      const nameStyle = Object.fromEntries(["田中", "佐藤", "鈴木"].map(nm => [nm, st(ws.getRow(2).getCell(ci(nm)))]));
      const last = head.length;   // 右端＝店舗名・その左＝曜日
      const others = {
        periodLabel: st(ws.getRow(2).getCell(1)), wdHead: st(ws.getRow(2).getCell(2)),
        wdRight: st(ws.getRow(2).getCell(last - 1)), shopName: st(ws.getRow(2).getCell(last)),
        number: st(ws.getRow(1).getCell(ci("田中"))), day: st(ws.getRow(3).getCell(1)), weekday: st(ws.getRow(3).getCell(2)),
        timeTop: st(ws.getRow(3).getCell(ci("田中"))), timeBottom: st(ws.getRow(4).getCell(ci("田中"))),
      };
      // 休暇のセル（高橋）: セルごとに「値＋斜線なら＼」と書式
      const tci = head.indexOf("高橋") + 1;
      const leave = dates.map((ds, di) => [0, 1].map(k => { const c = ws.getRow(3 + di * 2 + k).getCell(tci);
        return (c.value == null ? "" : String(c.value)) + (c.border && c.border.diagonal ? "＼" : ""); }).join("/"));
      const lc = ws.getRow(3).getCell(tci);
      const leaveStyle = { al: lc.alignment || null, size: lc.font && lc.font.size, name: lc.font && lc.font.name, fill: lc.fill ? JSON.stringify(lc.fill) : null };
      const timeCell = ws.getRow(6).getCell(tci); // 9/2 の下＝時刻のセル
      const timeStyle = { al: timeCell.alignment || null, size: timeCell.font && timeCell.font.size, fill: timeCell.fill ? JSON.stringify(timeCell.fill) : null };
      // 高橋の列のセルを丸ごと（値・罫線＝斜線・整列・文字・塗り）。期間管理タブの出力が D の前と同じかを測る
      const leaveFull = dates.map((ds, di) => [0, 1].map(k => { const c = ws.getRow(3 + di * 2 + k).getCell(tci);
        return JSON.stringify({ v: c.value == null ? null : c.value, b: c.border || null, a: c.alignment || null, f: c.font || null, fill: c.fill || null }); }));
      return { r, nameStyle, others, leave, leaveStyle, timeStyle, leaveFull };
    };
    return { noResolver: await run(false), withResolver: await run(true) };
  }, DATES);

  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const verdict = {
    // 期間管理タブの入口（resolverなし）
    a_田中_提出済みの休みと管理者yは斜線のまま: eq(out.noResolver.r.田中.slice(0, 3), ["9/18", "斜線", "斜線"]),
    b_田中_延長で増えた日は空白: eq(out.noResolver.r.田中.slice(3), ["空白", "空白"]),
    c_佐藤_グリッド作成subの未入力日は空白: eq(out.noResolver.r.佐藤, ["空白", "10/19", "空白", "空白", "空白"]),
    d_鈴木_sub無しは従来どおり空白: eq(out.noResolver.r.鈴木, ["空白", "空白", "空白", "空白", "空白"]),
    // シフト作成タブの入口（resolverあり）
    e_resolver側も同じ: eq(out.withResolver.r.田中, ["9/18", "斜線", "斜線", "空白", "空白"]),
    f_未保存の編集は従来どおり出る: out.withResolver.r.佐藤[4] === "13/",
    // K2: 名前セルは 9pt・縦書き・左右中央・上下中央。太字と色（田中=赤・他=黒）は従来どおり。2つの入口で同じ
    g_名前行は9pt縦書き中央: ["noResolver", "withResolver"].every(k => ["田中", "佐藤", "鈴木"].every(nm => {
      const x = out[k].nameStyle[nm];
      return x.al && x.al.horizontal === "center" && x.al.vertical === "middle" && x.al.textRotation === "vertical"
        && x.font.size === 9 && x.font.bold === true && x.font.color === (nm === "田中" ? "FFFF0000" : "FF000000");
    })),
    h_2つの入口で名前行が同じ: eq(out.noResolver.nameStyle, out.withResolver.nameStyle),
    // 名前セル以外の書式は K2 の前と同じ（期待値は K2 より前の配信物 b014efa で書き出した値）
    i_名前セル以外は変わらない: eq(out.noResolver.others, OTHERS_BEFORE_K2) && eq(out.withResolver.others, OTHERS_BEFORE_K2),
    // D: 休暇は種別名・斜線なし。/ と提出の休みは斜線のまま
    j_シフト作成タブは種別名で斜線なし: eq(out.withResolver.leave, ["公休/公休", "有給/22", "11/慶弔", "＼/＼", "有給/＼"]),
    k_種別名のセルの書式は時刻のセルと同じで縮小表示: (() => {
      const L = out.withResolver.leaveStyle, T = out.withResolver.timeStyle;
      return L.size === 12 && L.name === "Yu Gothic" && L.al && L.al.horizontal === "center" && L.al.vertical === "middle" && L.al.shrinkToFit === true
        && T.size === 12 && L.fill === T.fill; })(),
    l_期間管理タブは19da811と同じ: eq(out.noResolver.leaveFull, PERIODS_TAB_LEAVE_19DA811) && eq(out.noResolver.leave, ["＼/＼", "＼/22", "11/＼", "＼/＼", "＼/＼"]),
  };
  verdict.allPass = Object.values(verdict).every(Boolean);
  if (process.env.DUMP_BASELINE) { console.log(JSON.stringify(out.noResolver.leaveFull)); await h.close(); process.exit(0); }

  console.log(JSON.stringify({ out, verdict, errors: h.errors }, null, 2));
  await h.close();
  process.exit(verdict.allPass && h.errors.length === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
