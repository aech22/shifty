// 実例1: Callable（claimCompanyShop / unlinkStoreFromCompany）の権限分岐を全部通す。
// 2026-09-16「企業連携タブからの他店舗ログインを管理コード無しで」の検証に使ったもの。
"use strict";
const { loadFunctions, callFn, makeChecker } = require("./cf-harness.js");

const CO = "-Ncompany1";
const CUID = `company_${CO}`;
const CREATOR = "googleUid_creator";   // 企業の作成者（companies/{id}/pub/ownerUid）
const SHOP_OWNER = "googleUid_shopB";  // 店舗Bの元からのオーナー
const KEY = "KEY_B_32chars";

const base = () => ({
  companies: { [CO]: { pub: { name: "TODGE", code: "ABCD2345", ownerUid: CREATOR, shops: { shopB: true } } } },
  shops: { shopB: { private: { adminKey: KEY }, owners: { [SHOP_OWNER]: KEY, [CUID]: KEY } } },
  global: { shops: { shopB: { id: "shopB", name: "京月梅田" } } },
});

const check = makeChecker();

(async () => {
  let h = loadFunctions({ data: base() });
  let r = await callFn(h.fns.claimCompanyShop, { companyId: CO, shopId: "shopB" }, { uid: CREATOR });
  check("作成者が連携済み店舗のオーナーになれる", r.ok && r.res.ok === true, r);
  check("owners に adminKey 付きで登録される", h.db.get(`shops/shopB/owners/${CREATOR}`) === KEY);
  check("grants 台帳に記録される", h.db.get(`companies/${CO}/grants/shopB/${CREATOR}`) === true);
  check("既存オーナーはそのまま", h.db.get(`shops/shopB/owners/${SHOP_OWNER}`) === KEY);

  h = loadFunctions({ data: base() });
  r = await callFn(h.fns.claimCompanyShop, { companyId: CO, shopId: "shopB" }, { uid: CUID });
  check("既にオーナーなら already で終わる", r.ok && r.res.already === true, r);
  check("その場合は台帳に書かない", h.db.get(`companies/${CO}/grants`) === undefined);

  h = loadFunctions({ data: base() });
  r = await callFn(h.fns.claimCompanyShop, { companyId: CO, shopId: "shopB" }, { uid: "stranger" });
  check("企業メンバーでなければ拒否", !r.ok && r.code === "permission-denied", r);
  check("owners は増えない", h.db.get("shops/shopB/owners/stranger") === undefined);

  h = loadFunctions({ data: base() });
  h.db.put("global/shops/shopC", { id: "shopC", name: "他人の店" });
  h.db.put("shops/shopC/owners/someone", "KEY_C");
  h.db.put("shops/shopC/private/adminKey", "KEY_C");
  r = await callFn(h.fns.claimCompanyShop, { companyId: CO, shopId: "shopC" }, { uid: CREATOR });
  check("企業に連携していない店舗は拒否", !r.ok && r.code === "permission-denied", r);

  h = loadFunctions({ data: base() });
  h.db.put("shops/shopB/owners", null);
  r = await callFn(h.fns.claimCompanyShop, { companyId: CO, shopId: "shopB" }, { uid: CREATOR });
  check("owners が空の店舗はここで初claimさせない", !r.ok && r.code === "failed-precondition", r);

  h = loadFunctions({ data: base() });
  h.db.put(`companies/${CO}/pub/shops/demo-toriMatsu-v1`, true);
  h.db.put("shops/demo-toriMatsu-v1/owners/x", "K");
  r = await callFn(h.fns.claimCompanyShop, { companyId: CO, shopId: "demo-toriMatsu-v1" }, { uid: CREATOR });
  check("デモ店舗は拒否", !r.ok && r.code === "permission-denied", r);

  h = loadFunctions({ data: base() });
  r = await callFn(h.fns.claimCompanyShop, { companyId: "/" + CO, shopId: "shopB" }, { uid: CREATOR });
  check("companyIdのパス細工（#126の形）は弾く", !r.ok && r.code === "invalid-argument", r);

  h = loadFunctions({ data: base() });
  await callFn(h.fns.claimCompanyShop, { companyId: CO, shopId: "shopB" }, { uid: CREATOR });
  r = await callFn(h.fns.unlinkStoreFromCompany, { companyId: CO, shopId: "shopB" }, { uid: CREATOR });
  check("解除できる", r.ok, r);
  check("解除で企業uidを外す", h.db.get(`shops/shopB/owners/${CUID}`) === undefined);
  check("解除で企業経由の権限も外す", h.db.get(`shops/shopB/owners/${CREATOR}`) === undefined);
  check("元のオーナーは残る", h.db.get(`shops/shopB/owners/${SHOP_OWNER}`) === KEY);
  check("連携マップから消える", h.db.get(`companies/${CO}/pub/shops/shopB`) === undefined);
  check("台帳も消える", h.db.get(`companies/${CO}/grants/shopB`) === undefined);

  h = loadFunctions({ data: base() });
  h.db.put(`shops/shopB/owners/${SHOP_OWNER}`, null);
  await callFn(h.fns.claimCompanyShop, { companyId: CO, shopId: "shopB" }, { uid: CREATOR });
  r = await callFn(h.fns.unlinkStoreFromCompany, { companyId: CO, shopId: "shopB" }, { uid: CREATOR });
  check("オーナーが企業由来だけなら解除を拒否", !r.ok && r.code === "failed-precondition", r);
  check("拒否のとき owners は保たれる", h.db.get(`shops/shopB/owners/${CUID}`) === KEY && h.db.get(`shops/shopB/owners/${CREATOR}`) === KEY);

  h = loadFunctions({ data: base() });
  r = await callFn(h.fns.unlinkStoreFromCompany, { companyId: CO, shopId: "shopB" }, { uid: CUID });
  check("台帳が無い従来ケースも解除できる（回帰）", r.ok && h.db.get(`shops/shopB/owners/${CUID}`) === undefined, r);
  check("その場合も元のオーナーは残る", h.db.get(`shops/shopB/owners/${SHOP_OWNER}`) === KEY);

  check.done();
})();
