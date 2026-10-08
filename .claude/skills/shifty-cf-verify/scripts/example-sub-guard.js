// 提出データの監査（auditSubWrite）と、提出の人単位の縛りの印（nameGuards）の Cloud Functions を本物の functions/index.js で回す（2026-10-08）。
// 確かめること:
//   監査: オーナー以外の削除・別 uid の上書き・同じ名前と期間の重複作成を private/subAudit/{期間ID} に残す（before 込み）。
//         本人の再提出・オーナー・Admin SDK・デモ店舗は残さない。
//   縛り: approveStaffLink・unlinkStaff・linkStaffPage・companyRenameStaff のあとで nameGuards を計算し直す。
//         企業の改名は個別URL（staffPages）の名前も移し、印も新しい名前へ移る。
// 使い方: node example-sub-guard.js            （このファイルの4つ上の functions/index.js を読む）
//         SHIFTY_CF_INDEX=/path/index.js node example-sub-guard.js   （反証: 2026-10-08 より前の index.js では最初の項目で落ちる）
"use strict";
const path = require("path");
const { loadFunctions, callFn, makeChecker } = require("./cf-harness.js");

const INDEX = process.env.SHIFTY_CF_INDEX || path.join(__dirname, "..", "..", "..", "..", "functions", "index.js");
const check = makeChecker();
const OWNER = "owner1", STAFF = "staff1", OTHER = "other1", CO = "co1";
const T1 = "A".repeat(24), T2 = "B".repeat(24);
const em = uid => ({ auth: { uid, token: { email: `${uid}@example.com`, firebase: { sign_in_provider: "password" } } } });
const snapOf = v => ({ val: () => (v === undefined || v === null ? null : JSON.parse(JSON.stringify(v))) });
const changeOf = (b, a) => ({ before: snapOf(b), after: snapOf(a) });
const userCtx = (uid, params) => ({ params, authType: "USER", auth: { uid, token: {} } });
const quiet = async fn => { const w = console.warn, l = console.log; console.warn = () => {}; console.log = () => {}; try { return await fn(); } finally { console.warn = w; console.log = l; } };

const sub = (id, extra = {}) => ({ id, periodId: "p1", staffName: "田中", submitterUid: STAFF, submittedAt: "x", shifts: {}, ...extra });
const base = () => ({
  global: { shops: { S1: { id: "S1", name: "A店" }, "demo-toriMatsu-v1": { id: "demo-toriMatsu-v1", name: "デモ" } } },
  shops: {
    S1: {
      owners: { [OWNER]: "K" }, staff: ["田中", "佐藤", "鈴木"], settings: {},
      periods: { p1: { id: "p1", startDate: "2026-10-01", endDate: "2026-10-15" } },
      subs: { s1: sub("s1") },
      linkRequests: { [STAFF]: { displayName: "佐藤", at: "2026-10-04T00:00:00.000Z" } },
      staffPages: { [T1]: { status: "approved", name: "田中", displayName: "田中", requestedAt: "t", approvedAt: "t" } },
    },
  },
});
const audits = (h, pid = "p1") => Object.values(h.db.get(`shops/S1/private/subAudit/${pid}`) || {});

(async () => {
  let h = loadFunctions({ indexPath: INDEX, data: base() });
  check("関数がある（auditSubWrite）", typeof h.fns.auditSubWrite === "function");
  if (typeof h.fns.auditSubWrite !== "function") return check.done();
  const run = (b, a, uid, subId = "s1", shopId = "S1", authType = "USER") =>
    quiet(() => h.fns.auditSubWrite(changeOf(b, a), { ...userCtx(uid, { shopId, subId }), authType }));

  // ===== 監査 =====
  await run(sub("s1"), sub("s1", { comment: "x" }), STAFF);
  check("監査: 本人（前の提出者と同じ uid）の再提出は残さない", audits(h).length === 0);
  await run(sub("s1"), sub("s1", { comment: "x" }), OTHER);
  let a = audits(h);
  check("監査: 別 uid の上書きを残す（by・prevUid・before）", a.length === 1 && a[0].kind === "overwrite-other-uid" && a[0].by === OTHER && a[0].prevUid === STAFF && a[0].before.id === "s1", a);
  await run(sub("s1"), null, OTHER);
  a = audits(h);
  check("監査: オーナー以外の削除を残す（消された内容ごと）", a.length === 2 && a.some(x => x.kind === "delete" && x.before && x.before.staffName === "田中"));
  h.db.put("shops/S1/subs/s9", sub("s9", { submitterUid: OTHER }));
  await run(null, sub("s9", { submitterUid: OTHER }), OTHER, "s9");
  a = audits(h);
  check("監査: 同じ期間・同じ名前の重複作成を残す（sameAs）", a.some(x => x.kind === "duplicate-create" && x.sameAs === "s1" && x.subId === "s9"), a);
  const n = audits(h).length;
  await run(sub("s1"), null, OWNER);
  await run(sub("s1"), null, OTHER, "s1", "S1", "ADMIN");
  await run(sub("s1"), null, OTHER, "s1", "demo-toriMatsu-v1");
  check("監査: オーナー・Admin SDK・デモ店舗は残さない", audits(h).length === n);

  // ===== 縛りの印 =====
  h = loadFunctions({ indexPath: INDEX, data: base() });
  let r = await callFn(h.fns.approveStaffLink, { shopId: "S1", uid: STAFF, name: "佐藤" }, { auth: em(OWNER).auth });
  let g = h.db.get("shops/S1/nameGuards") || {};
  check("縛り: 承認（approveStaffLink）のあと、紐付いた名前と承認済みの個別URLの名前に印", r.ok && g["佐藤"] === true && g["田中"] === true && g["鈴木"] === undefined, { r, g });
  r = await callFn(h.fns.unlinkStaff, { shopId: "S1", uid: STAFF }, { auth: em(OWNER).auth });
  g = h.db.get("shops/S1/nameGuards") || {};
  check("縛り: 解除（unlinkStaff）のあと、紐付けの無くなった名前の印を外す（個別URLの印は残る）", r.ok && g["佐藤"] === undefined && g["田中"] === true, { r, g });

  // 企業の改名: staffLinks と staffPages の名前を移し、印も新しい名前へ
  const co = base();
  co.companies = { [CO]: { pub: { name: "TODGE", ownerUid: OWNER, shops: { S1: true },
    people: { "0012": { displayName: "田中", links: { S1: "田中" }, createdAt: "t", updatedAt: "t" } } } } };
  co.shops.S1.staffPages[T2] = { status: "revoked", name: "田中", displayName: "田中", requestedAt: "t", approvedAt: "t" };
  co.shops.S1.nameGuards = { 田中: true };
  h = loadFunctions({ indexPath: INDEX, data: co });
  r = await quiet(() => callFn(h.fns.companyRenameStaff, { companyId: CO, personId: "0012", newName: "田中 一郎", shopIds: ["S1"] }, { auth: em(OWNER).auth }));
  g = h.db.get("shops/S1/nameGuards") || {};
  check("企業の改名: 承認済みの個別URLの名前が移る（取り消し済みは移さない）",
    r.ok && h.db.get(`shops/S1/staffPages/${T1}/name`) === "田中 一郎" && h.db.get(`shops/S1/staffPages/${T2}/name`) === "田中", r);
  check("企業の改名: 印が新しい名前へ移る", g["田中 一郎"] === true && g["田中"] === undefined, g);

  check.done();
})();
