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
// Firebase へは1バイトも書かない（app-main.js を読み込まないので firebaseDB は null）。
"use strict";

const path = require("node:path");
const { openHarness } = require(path.join(__dirname, "mount-component.js"));

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
        [dates[2]]: { status: "work", adminRest: { start: true, end: true } }, // 管理者の y → 斜線のまま
        // dates[3] / dates[4] は期間の延長で増えた日＝エントリ無し → 空白であるべき
      }, comment: "", submittedAt: "2026-09-01T00:00:00Z",
    }, {
      // グリッドで1日だけ入力して作られた sub。提出はしていないので他の日を持たない
      id: "s2", periodId: "p1", staffName: "佐藤", source: "grid",
      shifts: { [dates[1]]: { status: "work", adjustedStart: "10:00", adjustedEnd: "19:00" } },
      comment: "", submittedAt: "2026-09-01T00:00:00Z",
    }];
    const staffList = ["田中", "佐藤", "鈴木"];   // 鈴木は sub 自体が無い（対照＝従来から空白）
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
          { settings, staffAliases: {}, staffColors: {}, staffNumbers: {} },
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
      return r;
    };
    return { noResolver: await run(false), withResolver: await run(true) };
  }, DATES);

  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const verdict = {
    // 期間管理タブの入口（resolverなし）
    a_田中_提出済みの休みと管理者yは斜線のまま: eq(out.noResolver.田中.slice(0, 3), ["9/18", "斜線", "斜線"]),
    b_田中_延長で増えた日は空白: eq(out.noResolver.田中.slice(3), ["空白", "空白"]),
    c_佐藤_グリッド作成subの未入力日は空白: eq(out.noResolver.佐藤, ["空白", "10/19", "空白", "空白", "空白"]),
    d_鈴木_sub無しは従来どおり空白: eq(out.noResolver.鈴木, ["空白", "空白", "空白", "空白", "空白"]),
    // シフト作成タブの入口（resolverあり）
    e_resolver側も同じ: eq(out.withResolver.田中, ["9/18", "斜線", "斜線", "空白", "空白"]),
    f_未保存の編集は従来どおり出る: out.withResolver.佐藤[4] === "13/",
  };
  verdict.allPass = Object.values(verdict).every(Boolean);

  console.log(JSON.stringify({ out, verdict, errors: h.errors }, null, 2));
  await h.close();
  process.exit(verdict.allPass && h.errors.length === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
