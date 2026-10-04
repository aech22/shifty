// 実例: 従業員画面の紐付け（第2部 E2・2026-10-04）の Cloud Functions を本物のまま実行する。
//   approveStaffLink / issueStaffLinkCode / redeemStaffLinkCode / unlinkStaff と、
//   companyRenameStaff・mergePeople の追随（staffLinks の名前・personId）、purgeInactiveShops の期限切れコードの掃除。
// 許可側だけでなく拒否側（permission-denied / failed-precondition / invalid-argument / resource-exhausted）も1項目ずつ通す。
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

  // ===== 発行と、コードでの紐付け（方式C）=====
  h = load(base());
  const t0 = Date.now();
  r = await callFn(h.fns.issueStaffLinkCode, { shopId: "S1", name: "佐藤" }, { auth: em(OWNER).auth });
  const code1 = r.ok && r.res.code;
  check("C: オーナーが8桁のコードを発行できる", r.ok && /^[A-HJ-NP-Z2-9]{8}$/.test(code1), r);
  check("C: 有効期限は発行から24時間", r.ok && Math.abs(r.res.expiry - (t0 + 24 * 3600 * 1000)) < 5000, r);
  r = await callFn(h.fns.issueStaffLinkCode, { shopId: "S1", name: "佐藤" }, { auth: em(OWNER).auth });
  const code2 = r.ok && r.res.code;
  check("C: 発行し直すと前のコードは消える", r.ok && code2 !== code1 && h.db.get(`staffLinkCodes/${code1}`) === undefined && h.db.get(`staffLinkCodeIndex/S1/佐藤`) === code2);
  r = await callFn(h.fns.issueStaffLinkCode, { shopId: "S1", name: "佐藤" }, { auth: em(STAFF).auth });
  check("拒否: オーナーでない呼び出し元は発行できない", !r.ok && r.code === "permission-denied", r);
  r = await callFn(h.fns.issueStaffLinkCode, { shopId: "S1", name: "鈴木" }, { auth: em(OWNER).auth });
  check("拒否: 登録の無い名前", !r.ok && r.code === "failed-precondition", r);

  r = await callFn(h.fns.redeemStaffLinkCode, { code: code1 }, { auth: em(STAFF).auth });
  check("拒否: 発行し直す前のコードは使えない", !r.ok && r.code === "invalid-argument", r);
  r = await callFn(h.fns.redeemStaffLinkCode, { code: code2.toLowerCase().replace(/(....)/, "$1-") }, { auth: anon("anonUid").auth });
  check("拒否: メールの無い（匿名の）認証", !r.ok && r.code === "failed-precondition", r);
  r = await callFn(h.fns.redeemStaffLinkCode, { code: code2.toLowerCase().replace(/(....)/, "$1-") }, { auth: em(STAFF).auth });
  check("C: 小文字・ハイフン入りでも正規化して紐付く（承認なし）", r.ok && r.res.name === "佐藤", r);
  check("C: staffLinks に method:code", h.db.get(`shops/S1/staffLinks/${STAFF}/method`) === "code");
  check("C: コード・索引は消え、この店舗への申請も消える", h.db.get(`staffLinkCodes/${code2}`) === undefined && h.db.get("staffLinkCodeIndex/S1/佐藤") === undefined && h.db.get(`shops/S1/linkRequests/${STAFF}`) === undefined);
  r = await callFn(h.fns.redeemStaffLinkCode, { code: code2 }, { auth: em(STAFF2).auth });
  check("1回限り: 同じコードは2回使えない", !r.ok && r.code === "invalid-argument", r);
  r = await callFn(h.fns.issueStaffLinkCode, { shopId: "S1", name: "佐藤" }, { auth: em(OWNER).auth });
  check("拒否: 紐付け済みの名前には発行しない", !r.ok && r.code === "failed-precondition", r);

  // 期限切れ（24時間ちょうど）
  h = load(base());
  r = await callFn(h.fns.issueStaffLinkCode, { shopId: "S1", name: "佐藤" }, { auth: em(OWNER).auth });
  const c3 = r.res.code;
  h.db.put(`staffLinkCodes/${c3}/expiry`, Date.now());
  r = await callFn(h.fns.redeemStaffLinkCode, { code: c3 }, { auth: em(STAFF).auth });
  check("期限: 24時間を過ぎたコードは使えない", !r.ok && r.code === "invalid-argument", r);
  check("期限: 期限切れのコードは消える", h.db.get(`staffLinkCodes/${c3}`) === undefined);
  check("期限: 失敗に数える", h.db.get(`staffLinkCodeAttempts/${STAFF}/fails`) === 1);

  // 試行回数
  h = load(base());
  r = await callFn(h.fns.issueStaffLinkCode, { shopId: "S1", name: "佐藤" }, { auth: em(OWNER).auth });
  const c4 = r.res.code;
  for (let i = 0; i < 5; i++) await callFn(h.fns.redeemStaffLinkCode, { code: "ZZZZZZZZ" }, { auth: em(STAFF).auth });
  r = await callFn(h.fns.redeemStaffLinkCode, { code: c4 }, { auth: em(STAFF).auth });
  check("試行回数: 5回誤ると正しいコードでも止まる", !r.ok && r.code === "resource-exhausted", r);
  check("試行回数: 止めている間はコードを消費しない", h.db.get(`staffLinkCodes/${c4}`) !== undefined);
  r = await callFn(h.fns.redeemStaffLinkCode, { code: c4 }, { auth: em(STAFF2).auth });
  check("試行回数: 本人単位（別のアカウントは使える）", r.ok, r);
  r = await callFn(h.fns.redeemStaffLinkCode, { code: "12" }, { auth: em(STAFF).auth });
  check("拒否: 形の違うコード", !r.ok && r.code === "invalid-argument", r);

  // オーナーの uid はコードでも紐付けない
  h = load(base());
  r = await callFn(h.fns.issueStaffLinkCode, { shopId: "S1", name: "佐藤" }, { auth: em(OWNER).auth });
  const c5 = r.res.code;
  r = await callFn(h.fns.redeemStaffLinkCode, { code: c5 }, { auth: em(OWNER).auth });
  check("拒否: 店舗のオーナーの uid はコードでも紐付けない", !r.ok && r.code === "failed-precondition", r);
  // 発行後に名前が消えたコード
  h.db.put("shops/S1/staff", ["田中", "山田 太郎"]);
  r = await callFn(h.fns.redeemStaffLinkCode, { code: c5 }, { auth: em(STAFF).auth });
  check("拒否: 発行後にスタッフ一覧から消えた名前のコード（消える）", !r.ok && r.code === "failed-precondition" && h.db.get(`staffLinkCodes/${c5}`) === undefined, r);

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

  // ===== 定期の掃除 =====
  h = load(base());
  h.db.put("staffLinkCodes/AAAA2222", { shopId: "S1", name: "佐藤", expiry: Date.now() - 1, issuedBy: OWNER, createdAt: "t" });
  h.db.put("staffLinkCodeIndex/S1/佐藤", "AAAA2222");
  h.db.put("staffLinkCodes/BBBB3333", { shopId: "S1", name: "田中", expiry: Date.now() + 3600e3, issuedBy: OWNER, createdAt: "t" });
  h.db.put("staffLinkCodeAttempts/old", { fails: 2, lastAt: Date.now() - 3 * 24 * 3600e3 });
  h.db.put("staffLinkCodeAttempts/locked", { fails: 0, lockedUntil: Date.now() + 600e3, lastAt: Date.now() });
  r = await callRun(h.fns.purgeInactiveShops);
  check("掃除: 期限切れのコードと索引が消え、期限内のコードは残る", r.ok && h.db.get("staffLinkCodes/AAAA2222") === undefined && h.db.get("staffLinkCodeIndex/S1/佐藤") === undefined && h.db.get("staffLinkCodes/BBBB3333") !== undefined, r);
  check("掃除: 古い失敗回数は消え、止めている最中の記録は残る", h.db.get("staffLinkCodeAttempts/old") === undefined && h.db.get("staffLinkCodeAttempts/locked") !== undefined);

  check.done();
})();
