// 実例: 従業員画面の会社設定の賃金（第2部 E6・2026-10-04）の Cloud Function getMyPay を本物のまま実行する。
// 許可側（本人の賃金だけが返る・history 込み・updatedAt は返さない）と拒否側（未認証・匿名・紐付けなし・名前がスタッフ一覧に無い・
// shopId の形・デモ店舗）を1項目ずつ通す。他人の賃金は取れない（名前を渡しても無視される）。何も書かないことも見る。
// 反証: SHIFTY_CF_INDEX に E6 より前の functions/index.js を渡すと落ちる（関数が無い）。
"use strict";
const { loadFunctions, callFn, makeChecker } = require("./cf-harness.js");

const INDEX = process.env.SHIFTY_CF_INDEX || undefined;
const STAFF = "staffUid", OTHER = "otherUid", OWNER = "ownerUid";
const em = uid => ({ auth: { uid, token: { email: `${uid}@example.com`, firebase: { sign_in_provider: "password" } } } });
const anon = uid => ({ auth: { uid, token: { firebase: { sign_in_provider: "anonymous" } } } });
const PAY_TANAKA = { payType: "hourly", base: 1300, effectiveFrom: "2026-04-01", commute: { amount: 3000, per: "month" }, updatedAt: "2026-04-01T00:00:00.000Z",
  history: [{ payType: "hourly", base: 1200, effectiveFrom: "2025-04-01", commute: { amount: 3000, per: "month" }, updatedAt: "x" }] };
const base = () => ({
  global: { shops: { S1: { id: "S1", name: "A店" }, S0: { id: "S0", name: "本店" }, "demo-toriMatsu-v1": { id: "demo-toriMatsu-v1", name: "デモ" } } },
  shops: {
    S1: { owners: { [OWNER]: "K" }, staff: ["田中", "佐藤", "山田"],
      settings: { staffHomeShop: { "山田": "S0" } },
      staffLinks: { [STAFF]: { name: "田中", method: "code", at: "a" }, [OTHER]: { name: "山田", method: "code", at: "a" }, ghost: { name: "退職者", method: "code", at: "a" } },
      private: { pay: { "田中": PAY_TANAKA, "佐藤": { payType: "monthly", base: 250000, effectiveFrom: "2026-01-01" } } } },
    "demo-toriMatsu-v1": { owners: {}, staff: ["田中"], staffLinks: { [STAFF]: { name: "田中" } } },
  },
});
const check = makeChecker();
const load = data => loadFunctions({ indexPath: INDEX, data });

(async () => {
  let h = load(base());
  const before = JSON.stringify(h.db.get(""));
  let r = await callFn(h.fns.getMyPay, { shopId: "S1" }, em(STAFF));
  check("許可: 紐付いた本人に自分の賃金が返る（時給1,300円・名前は田中）", r.ok && r.res.ok && r.res.name === "田中" && r.res.pay.payType === "hourly" && r.res.pay.base === 1300, r);
  check("許可: 過去の版も返る（月初時点の版を選ぶため）", r.ok && r.res.pay.history.length === 1 && r.res.pay.history[0].base === 1200, r);
  check("許可: updatedAt は返さない", r.ok && !("updatedAt" in r.res.pay) && !("updatedAt" in r.res.pay.history[0]), r);
  r = await callFn(h.fns.getMyPay, { shopId: "S1", name: "佐藤", uid: OTHER }, em(STAFF));
  check("他人の賃金は取れない: name・uid を渡しても自分（田中）の分だけ", r.ok && r.res.name === "田中" && r.res.pay.base === 1300 && !JSON.stringify(r.res).includes("250000"), r);
  r = await callFn(h.fns.getMyPay, { shopId: "S1" }, em(OTHER));
  check("ヘルプ先だけの紐付け: 記録が無く所属店舗が別なら pay:null と所属店舗（本店）", r.ok && r.res.pay === null && r.res.homeShopId === "S0" && r.res.homeShopName === "本店", r);
  check("何も書かない", JSON.stringify(h.db.get("")) === before);

  r = await callFn(h.fns.getMyPay, { shopId: "S1" }, {});
  check("拒否: 未認証", !r.ok && r.code === "unauthenticated", r);
  r = await callFn(h.fns.getMyPay, { shopId: "S1" }, anon(STAFF));
  check("拒否: メールの無い（匿名の）認証", !r.ok && r.code === "failed-precondition", r);
  r = await callFn(h.fns.getMyPay, { shopId: "S1" }, em("nobody"));
  check("拒否: この店舗と紐付いていない", !r.ok && r.code === "permission-denied", r);
  r = await callFn(h.fns.getMyPay, { shopId: "S1" }, em(OWNER));
  check("拒否: 店舗のオーナーでも紐付けが無ければ取れない", !r.ok && r.code === "permission-denied", r);
  r = await callFn(h.fns.getMyPay, { shopId: "S1" }, em("ghost"));
  check("拒否: 紐付けの名前がスタッフ一覧に無い（改名・削除の後）", !r.ok && r.code === "failed-precondition", r);
  r = await callFn(h.fns.getMyPay, { shopId: "S1/" }, em(STAFF));
  check("拒否: shopId の形（末尾のスラッシュ）", !r.ok && r.code === "invalid-argument", r);
  r = await callFn(h.fns.getMyPay, { shopId: ["S1"] }, em(STAFF));
  check("拒否: shopId が配列", !r.ok && r.code === "invalid-argument", r);
  r = await callFn(h.fns.getMyPay, { shopId: "demo-toriMatsu-v1" }, em(STAFF));
  check("拒否: デモ店舗", !r.ok && r.code === "permission-denied", r);
  check("拒否でも何も書かない", JSON.stringify(h.db.get("")) === before);
  check.done();
})().catch(e => { console.error(e); process.exit(1); });
