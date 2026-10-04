// 実例: 従業員画面の紐付け（第2部 E2・2026-10-04）の Cloud Functions を本物のまま実行する。
//   approveStaffLink / unlinkStaff と、companyRenameStaff・mergePeople の追随（staffLinks の名前・personId）。
//   個人リンクコード（issueStaffLinkCode・redeemStaffLinkCode）は 2026-10-05 に機能ごと削除したので、CF が無いことと、
//   purgeInactiveShops が本番に残ったコードのノードを消すことを確かめる。
// 許可側だけでなく拒否側（permission-denied / failed-precondition）も1項目ずつ通す。
// 反証: SHIFTY_CF_INDEX に E2 より前の functions/index.js を渡すと落ちる（関数が無い）。
"use strict";
const { loadFunctions, callFn, callRun, makeChecker } = require("./cf-harness.js");

const INDEX = process.env.SHIFTY_CF_INDEX || undefined;
const CO = "-Nco1";
const OWNER = "ownerUid";
const STAFF = "staffUid";      // メールを連結したスタッフアカウント
const STAFF2 = "staffUid2";
const em = uid => ({ auth: { uid, token: { email: `${uid}@example.com`, firebase: { sign_in_provider: "password" } } } });
const anon = uid => ({ auth: { uid, token: { firebase: { sign_in_provider: "anonymous" } } } });

const base = () => ({
  global: { shops: { S1: { id: "S1", name: "A店" }, "demo-toriMatsu-v1": { id: "demo-toriMatsu-v1", name: "デモ" } } },
  shops: {
    S1: { owners: { [OWNER]: "K" }, staff: ["田中", "山田 太郎", "佐藤"],
      settings: { staffNumbers: { "田中": "012", "佐藤": "A-01" } },
      linkRequests: {
        [STAFF]: { displayName: "たなか", number: "０１２", at: "2026-10-04T00:00:00.000Z" },
        [STAFF2]: { displayName: "山田　太郎", at: "2026-10-04T00:01:00.000Z" },
      } },
    "demo-toriMatsu-v1": { owners: {}, staff: ["田中"], linkRequests: { [STAFF]: { displayName: "田中", at: "a" } } },
  },
});
const check = makeChecker();
const load = data => loadFunctions({ indexPath: INDEX, data });

(async () => {
  // ===== 承認（方式A・B）=====
  let h = load(base());
  let r = await callFn(h.fns.approveStaffLink, { shopId: "S1", uid: STAFF, name: "田中" }, { auth: em(OWNER).auth });
  check("A: 全角の番号 ０１２ の申請を「田中」へ承認できる", r.ok && r.res.method === "number", r);
  check("A: staffLinks に {name, method:number} が書かれる", JSON.stringify(h.db.get(`shops/S1/staffLinks/${STAFF}`)) === JSON.stringify({ name: "田中", method: "number", at: h.db.get(`shops/S1/staffLinks/${STAFF}/at`) }));
  check("A: 本人の索引 users/{uid}/links/S1 も書かれる", h.db.get(`users/${STAFF}/links/S1/name`) === "田中");
  check("A: 申請は消える", h.db.get(`shops/S1/linkRequests/${STAFF}`) === undefined);
  r = await callFn(h.fns.approveStaffLink, { shopId: "S1", uid: STAFF2, name: "山田 太郎" }, { auth: em(OWNER).auth });
  check("B: 空白違いの「山田　太郎」を「山田 太郎」へ承認できる", r.ok && r.res.method === "name", r);

  h = load(base());
  r = await callFn(h.fns.approveStaffLink, { shopId: "S1", uid: STAFF, name: "田中" }, { auth: em(STAFF2).auth });
  check("拒否: オーナーでない呼び出し元", !r.ok && r.code === "permission-denied", r);
  r = await callFn(h.fns.approveStaffLink, { shopId: "S1", uid: STAFF, name: "佐藤" }, { auth: em(OWNER).auth });
  check("拒否: 申請と一致しない名前（候補に無い）", !r.ok && r.code === "failed-precondition", r);
  check("拒否のときは何も書かない", h.db.get(`shops/S1/staffLinks`) === undefined && h.db.get(`shops/S1/linkRequests/${STAFF}`) !== undefined);
  r = await callFn(h.fns.approveStaffLink, { shopId: "S1", uid: "nobody", name: "田中" }, { auth: em(OWNER).auth });
  check("拒否: 申請が無い", !r.ok && r.code === "not-found", r);
  r = await callFn(h.fns.approveStaffLink, { shopId: "S1/", uid: STAFF, name: "田中" }, { auth: em(OWNER).auth });
  check("拒否: shopId の形（末尾のスラッシュ）", !r.ok && r.code === "invalid-argument", r);
  r = await callFn(h.fns.approveStaffLink, { shopId: "demo-toriMatsu-v1", uid: STAFF, name: "田中" }, { auth: em(OWNER).auth });
  check("拒否: デモ店舗", !r.ok && r.code === "permission-denied", r);
  r = await callFn(h.fns.approveStaffLink, { shopId: "S1", uid: STAFF, name: "田中" }, {});
  check("拒否: 未認証", !r.ok && r.code === "unauthenticated", r);
  h.db.put(`shops/S1/linkRequests/${OWNER}`, { displayName: "田中", at: "a" });
  r = await callFn(h.fns.approveStaffLink, { shopId: "S1", uid: OWNER, name: "田中" }, { auth: em(OWNER).auth });
  check("拒否: 店舗のオーナーの uid の申請は承認しない", !r.ok && r.code === "failed-precondition" && h.db.get(`shops/S1/staffLinks/${OWNER}`) === undefined, r);

  // ===== 個人リンクコード（方式C）は削除済み =====
  h = load(base());
  check("削除: issueStaffLinkCode・redeemStaffLinkCode の CF は無い", h.fns.issueStaffLinkCode === undefined && h.fns.redeemStaffLinkCode === undefined);

  // ===== 解除 =====
  h = load(base());
  await callFn(h.fns.approveStaffLink, { shopId: "S1", uid: STAFF, name: "田中" }, { auth: em(OWNER).auth });
  r = await callFn(h.fns.unlinkStaff, { shopId: "S1", uid: STAFF }, { auth: em(STAFF2).auth });
  check("拒否: 本人でもオーナーでもない解除", !r.ok && r.code === "permission-denied", r);
  r = await callFn(h.fns.unlinkStaff, { shopId: "S1" }, { auth: em(STAFF).auth });
  check("本人が解除すると staffLinks と users の両方が消える", r.ok && h.db.get(`shops/S1/staffLinks/${STAFF}`) === undefined && h.db.get(`users/${STAFF}/links/S1`) === undefined, r);
  await callFn(h.fns.approveStaffLink, { shopId: "S1", uid: STAFF2, name: "山田 太郎" }, { auth: em(OWNER).auth });
  r = await callFn(h.fns.unlinkStaff, { shopId: "S1", uid: STAFF2 }, { auth: em(OWNER).auth });
  check("オーナーも解除できる", r.ok && h.db.get(`shops/S1/staffLinks/${STAFF2}`) === undefined, r);

  // ===== 企業の改名・統合への追随 =====
  const coData = () => {
    const d = base();
    d.companies = { [CO]: { pub: { name: "TODGE", ownerUid: OWNER, shops: { S1: true },
      people: { "0012": { displayName: "田中", links: { S1: "田中" }, createdAt: "t", updatedAt: "t" },
        "p_abcdEFGH": { displayName: "山田 太郎", links: { S1: "山田 太郎" }, createdAt: "t", updatedAt: "t" } } } } };
    d.shops.S1.staffLinks = { [STAFF]: { name: "田中", personId: "0012", method: "number", at: "t" }, [STAFF2]: { name: "山田 太郎", method: "name", at: "t" } };
    d.users = { [STAFF]: { links: { S1: { name: "田中", personId: "0012", at: "t" } } }, [STAFF2]: { links: { S1: { name: "山田 太郎", at: "t" } } } };
    return d;
  };
  h = load(coData());
  r = await callFn(h.fns.companyRenameStaff, { companyId: CO, personId: "0012", newName: "田中 一郎", shopIds: ["S1"] }, { auth: em(OWNER).auth });
  check("改名（CF）: staffLinks の名前が移る", r.ok && h.db.get(`shops/S1/staffLinks/${STAFF}/name`) === "田中 一郎", r);
  check("改名（CF）: 本人の索引の名前も移る", h.db.get(`users/${STAFF}/links/S1/name`) === "田中 一郎");
  check("改名（CF）: 別の人の紐付けは変わらない", h.db.get(`shops/S1/staffLinks/${STAFF2}/name`) === "山田 太郎");
  check("改名の後の同期: 写しに無かった personId が付く（p_abcdEFGH）", h.db.get(`shops/S1/staffLinks/${STAFF2}/personId`) === "p_abcdEFGH" && h.db.get(`users/${STAFF2}/links/S1/personId`) === "p_abcdEFGH");
  h = load(coData());
  // 2人を同じ店舗で統合はできない（1店舗1名前）ので、2店舗目に同じ人を作って統合する
  h.db.put(`companies/${CO}/pub/shops/S2`, true);
  h.db.put("shops/S2", { owners: { [OWNER]: "K" }, staff: ["たなか"], settings: {}, staffLinks: { u3: { name: "たなか", personId: "p_dropDROP", method: "code", at: "t" } } });
  h.db.put(`companies/${CO}/pub/people/p_dropDROP`, { displayName: "たなか", links: { S2: "たなか" }, createdAt: "t", updatedAt: "t" });
  h.db.put("users/u3/links/S2", { name: "たなか", personId: "p_dropDROP", at: "t" });
  r = await callFn(h.fns.mergePeople, { companyId: CO, keepPersonId: "0012", dropPersonId: "p_dropDROP" }, { auth: em(OWNER).auth });
  check("統合: 消えた人物を指していた紐付けの personId が残す方へ付け替わる", r.ok && h.db.get("shops/S2/staffLinks/u3/personId") === "0012" && h.db.get("users/u3/links/S2/personId") === "0012", r);

  // ===== 定期の掃除: 廃止した個人リンクコードの残りを消す =====
  h = load(base());
  h.db.put("staffLinkCodes/AAAA2222", { shopId: "S1", name: "佐藤", expiry: Date.now() - 1, issuedBy: OWNER, createdAt: "t" });
  h.db.put("staffLinkCodeIndex/S1/佐藤", "AAAA2222");
  h.db.put("staffLinkCodes/BBBB3333", { shopId: "S1", name: "田中", expiry: Date.now() + 3600e3, issuedBy: OWNER, createdAt: "t" });
  h.db.put("staffLinkCodeAttempts/locked", { fails: 0, lockedUntil: Date.now() + 600e3, lastAt: Date.now() });
  r = await callRun(h.fns.purgeInactiveShops);
  check("掃除: コード・索引・失敗回数のノードがまるごと消える（期限内のコードも）", r.ok && h.db.get("staffLinkCodes") === undefined && h.db.get("staffLinkCodeIndex") === undefined && h.db.get("staffLinkCodeAttempts") === undefined, r);
  check("掃除: 紐付けそのもの（staffLinks）は消さない", h.db.get("shops/S1/staff") !== undefined);

  check.done();
})();
