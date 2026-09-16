// 実例2: スケジュール関数（pubsub.onRun）を回す。
// purgeOldPeriods は本番で dry-run 中（PURGE_OLD_PERIODS_DRY_RUN = true）なので、
// 「36ヶ月超を検出はするが1件も消さない」ことを実測で押さえる回帰テストになる。
// orderByChild("periodId").equalTo(...) / numChildren / forEach / update / remove を
// まとめて通るため、ハーネスのDBモックの動作確認も兼ねている。
"use strict";
const { loadFunctions, callRun, makeChecker } = require("./cf-harness.js");

const ymd = monthsAgo => {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsAgo);
  return d.toISOString().slice(0, 10);
};

const data = () => ({
  global: { shops: { shopA: { id: "shopA", name: "検証店舗" } } },
  shops: {
    shopA: {
      periods: {
        old1: { id: "old1", endDate: ymd(40), urlToken: "tokOld" },   // 36ヶ月超＝対象
        recent: { id: "recent", endDate: ymd(2), urlToken: "tokNew" }, // 対象外
        broken: { id: "broken", endDate: "not-a-date", urlToken: "tokBad" }, // スキップされる
      },
      subs: {
        s1: { id: "s1", periodId: "old1", staffName: "田中" },
        s2: { id: "s2", periodId: "old1", staffName: "佐藤" },
        s3: { id: "s3", periodId: "recent", staffName: "鈴木" },
      },
    },
  },
  tokens: { tokOld: { shopId: "shopA", periodId: "old1" }, tokNew: { shopId: "shopA", periodId: "recent" } },
});

const check = makeChecker();

(async () => {
  const logs = [];
  const origLog = console.log, origWarn = console.warn;
  console.log = (...a) => logs.push(a.join(" "));
  console.warn = (...a) => logs.push("WARN " + a.join(" "));

  const h = loadFunctions({ data: data() });
  const r = await callRun(h.fns.purgeOldPeriods);

  console.log = origLog; console.warn = origWarn;

  check("正常に完走する", r.ok, r);
  check("36ヶ月超の期間を対象として検出する", logs.some(l => l.includes("[dry-run]") && l.includes("period=old1")), logs);
  check("対象のsubs件数を数えられている（クエリが効いている）", logs.some(l => l.includes("period=old1") && l.includes("subs=2件")), logs);
  check("endDateが不正な期間はスキップして警告する", logs.some(l => l.startsWith("WARN") && l.includes("period=broken")), logs);
  check("36ヶ月以内の期間は対象にしない", !logs.some(l => l.includes("period=recent")), logs);

  // dry-run 中なので、DBは1バイトも変わっていないこと
  check("dry-run: 期間を消していない", h.db.get("shops/shopA/periods/old1") !== undefined);
  check("dry-run: subsを消していない", Object.keys(h.db.get("shops/shopA/subs") || {}).length === 3);
  check("dry-run: tokensを消していない", h.db.get("tokens/tokOld") !== undefined);

  check.done();
})();
