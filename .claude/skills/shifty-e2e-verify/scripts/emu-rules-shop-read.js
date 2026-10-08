// 店舗IDだけでの読み取りの禁止（2026-10-08）のルールを、Firebase の Realtime Database エミュレータで確かめる。
// 本物の database.rules.json をそのまま読み込む。dev・本番には一切接続しない。
// 実行: java と firebase-database-emulator の jar が要る（`firebase setup:emulators:database` で取得）。
//   EMU_PORT=9010 NODE_PATH=<@firebase/rules-unit-testing と firebase を入れた node_modules> node emu-rules-shop-read.js
//   → ALL_OK / EXIT=0。反証: 変更前のルール（SHIFTY_RULES=<旧ファイル>）では「他人の店舗が読めない」系が落ちる
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { initializeTestEnvironment } = require("@firebase/rules-unit-testing");
const RULES = process.env.SHIFTY_RULES || path.join(__dirname, "../../../../database.rules.json");
const PORT = +(process.env.EMU_PORT || 9010);

const seed = () => ({
  global: { shops: { S1: { id: "S1", name: "A店" }, S2: { id: "S2", name: "B店" }, S3: { id: "S3", name: "C店" } } },
  tokens: { T1: { shopId: "S1", periodId: "p1" }, T3: { shopId: "S3", periodId: "p3" }, TX: { shopId: "S1", periodId: "p1", expiresAtMs: 1 }, TF: { shopId: "S1", periodId: "p1", expiresAtMs: 9999999999999 } },
  staffPageTokens: { PT1: { shopId: "S1", at: "x" }, PT2: { shopId: "S1", at: "x" }, PT3: { shopId: "S2", at: "x" } },
  companies: { C1: { pub: { ownerUid: "CREATOR", name: "企業" } } },
  shops: {
    S1: {
      owners: { OWN1: "K1" }, private: { adminKey: "K1" },
      staffLinks: { LINKED: { name: "田中", method: "name", at: "x" } },
      staffPages: { PT1: { status: "approved", name: "田中", displayName: "田中", requestedAt: "x" }, PT2: { status: "pending", displayName: "鈴木", requestedAt: "x" } },
      settings: { shopId: "S1" }, staff: ["田中", "鈴木"],
      periods: { p1: { id: "p1", startDate: "2026-10-01", endDate: "2026-10-15" } },
      subs: { s1: { id: "s1", periodId: "p1", staffName: "田中", shifts: {}, submittedAt: "x" } },
      company: { id: "C1", name: "企業", shops: { S1: "A店", S2: "B店" } },
    },
    S2: {
      owners: { OWN2: "K2" }, private: { adminKey: "K2" },
      staffLinks: { LINK2: { name: "佐藤", method: "name", at: "x" } },
      staffPages: { PT3: { status: "approved", name: "佐藤", displayName: "佐藤", requestedAt: "x" } },
      settings: { shopId: "S2" }, staff: ["佐藤"], periods: { p2: { id: "p2", startDate: "2026-10-01", endDate: "2026-10-15" } },
      company: { id: "C1", name: "企業", shops: { S1: "A店", S2: "B店" } },
    },
    S3: { owners: { OWN3: "K3" }, settings: { shopId: "S3" }, staff: ["山田"] },
    "demo-toriMatsu-v1": { settings: { shopId: "demo-toriMatsu-v1" }, staff: ["デモ"] },
  },
});

(async () => {
  // エミュレータ（v4.11.2）は正規表現の \s を読めない（本物の RTDB は読める＝subs の staffName の規則は dev で実測済み）。
  // エミュレータに渡す写しだけ、同じ意味の文字クラスに置き換える（ファイルは変えない）
  const rulesText = fs.readFileSync(RULES, "utf8").split("/\\\\s/").join("/[ \\\\t\\\\n\\\\r]/");
  const env = await initializeTestEnvironment({ projectId: "shifty-rules", database: { host: "127.0.0.1", port: PORT, rules: rulesText } });
  await env.withSecurityRulesDisabled(c => c.database().ref().set(seed()));
  const db = uid => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).database();
  const can = async p => { try { await p; return true; } catch (e) { return false; } };
  const read = (uid, path) => can(db(uid).ref(path).once("value"));
  const query = (uid, sid, pid) => can(db(uid).ref(`shops/${sid}/subs`).orderByChild("periodId").equalTo(pid).once("value"));
  const set = (uid, path, v) => can(db(uid).ref(path).set(v));
  const upd = (uid, path, v) => can(db(uid).ref(path).update(v));
  const admin = fn => env.withSecurityRulesDisabled(c => fn(c.database()));
  const R = {};
  const NODES = ["settings", "periods", "staff", "subs", "company", "nameGuards"];

  // 1. 店舗IDだけでは読めない（匿名の他人）。global/shops の名前は従来どおり読める
  for (const n of NODES) R[`stranger_${n}_denied`] = !(await read("X", `shops/S1/${n}`));
  R.stranger_subsQuery_denied = !(await query("X", "S1", "p1"));
  R.stranger_globalShop_allowed = await read("X", "global/shops/S1");
  R.unauth_denied = !(await read(null, "shops/S1/settings"));
  // 2. 管理者・リンク済みのスタッフ・企業（作成者と企業ログイン）・デモ
  for (const n of NODES) R[`owner_${n}`] = await read("OWN1", `shops/S1/${n}`);
  R.linked_read = await read("LINKED", "shops/S1/periods") && await query("LINKED", "S1", "p1");
  R.companyLogin_read = await read("company_C1", "shops/S1/staff");
  R.creator_read = await read("CREATOR", "shops/S2/settings");
  R.creator_otherCompany_denied = !(await read("CREATOR", "shops/S3/settings"));
  R.demo_read = await read("X", "shops/demo-toriMatsu-v1/staff");
  R.demo_register_denied = !(await set("X", "shops/demo-toriMatsu-v1/readers/X/t", "T1"));
  // 3. スタッフURL（t）
  R.t_otherShopToken_denied = !(await set("X", "shops/S1/readers/X/t", "T3"));
  R.t_unknown_denied = !(await set("X", "shops/S1/readers/X/t", "NOPE"));
  R.t_otherUid_denied = !(await set("X", "shops/S1/readers/Y/t", "T1"));
  R.t_register = await set("X", "shops/S1/readers/X/t", "T1");
  R.t_read = (await read("X", "shops/S1/settings")) && (await query("X", "S1", "p1")) && (await read("X", "shops/S1/company"));
  R.t_notOtherShop = !(await read("X", "shops/S3/settings"));
  R.t_extraKey_denied = !(await set("X", "shops/S1/readers/X/zz", "T1"));
  // 受付期限（tokens の expiresAtMs）を過ぎたスタッフURLは読む理由にならない。期限前は従来どおり
  R.t_expired_register_denied = !(await set("V", "shops/S1/readers/V/t", "TX"));
  R.t_future_register = await set("V", "shops/S1/readers/V/t", "TF");
  R.t_future_read = await read("V", "shops/S1/settings");
  await admin(d => d.ref("tokens/TF/expiresAtMs").set(1));
  R.t_expiredAfter_read_denied = !(await read("V", "shops/S1/settings"));
  R.nameGuards_stranger_denied = !(await read("Z", "shops/S1/nameGuards"));
  R.nameGuards_reader_read = await read("X", "shops/S1/nameGuards");
  // 4. 個別URL（p）: 承認済みだけ。取り消すとその場で読めなくなる
  R.p_pending_denied = !(await set("Z", "shops/S1/readers/Z/p", "PT2"));
  R.p_register = await set("Y", "shops/S1/readers/Y/p", "PT1");
  R.p_read = await read("Y", "shops/S1/staff");
  await admin(d => d.ref("shops/S1/staffPages/PT1/status").set("revoked"));
  R.p_revoked_denied = !(await read("Y", "shops/S1/staff"));
  await admin(d => d.ref("shops/S1/staffPages/PT1/status").set("approved"));
  // 5. 同じ企業の他店（o: 管理者・l: リンク済み・q: 個別URL）
  R.o_register = await set("OWN1", "shops/S2/readers/OWN1/o", "S1");
  R.o_read = await read("OWN1", "shops/S2/subs");
  R.o_notOwner_denied = !(await set("X", "shops/S2/readers/X/o", "S1"));
  R.o_otherCompany_denied = !(await set("OWN3", "shops/S1/readers/OWN3/o", "S3"));
  R.o_badChars_denied = !(await set("OWN1", "shops/S2/readers/OWN1/o", "a/b"));
  R.l_register = await set("LINKED", "shops/S2/readers/LINKED/l", "S1");
  R.l_read = await read("LINKED", "shops/S2/periods");
  R.l_notLinked_denied = !(await set("X", "shops/S2/readers/X/l", "S1"));
  R.q_register = await upd("Y", "shops/S2/readers/Y", { q: "PT1", qs: "S1" });
  R.q_read = await read("Y", "shops/S2/staff");
  R.q_mismatch_denied = !(await upd("Z", "shops/S2/readers/Z", { q: "PT1", qs: "S2" }));
  R.q_pending_denied = !(await upd("Z", "shops/S2/readers/Z", { q: "PT2", qs: "S1" }));
  R.qs_alone_denied = !(await set("Z", "shops/S2/readers/Z/qs", "S1"));
  // 6. 後始末の権限: 本人と管理者は消せる・他人は消せない。トークンが消えると読めなくなる（その場で判定する）
  R.readers_list_owner = await read("OWN1", "shops/S1/readers");
  R.readers_list_stranger_denied = !(await read("X", "shops/S1/readers"));
  R.delete_byOther_denied = !(await set("Z", "shops/S1/readers/X", null));
  R.delete_byOwner = await set("OWN1", "shops/S1/readers/Y", null);
  await admin(d => d.ref("tokens/T1").remove());
  R.t_tokenDeleted_denied = !(await read("X", "shops/S1/settings"));
  // 7. 既存の書き込みは変わらない（認証済みなら提出できる・オーナーだけ設定を書ける）
  R.stranger_canStillSubmit = await set("W", "shops/S1/subs/new1", { id: "new1", periodId: "p1", staffName: "鈴木", shopId: "S1", shifts: { "2026-10-02": { status: "work", start: "09:00", end: "17:00" } }, submittedAt: "2026-10-08T00:00:00.000Z" });
  R.owner_canWriteSettings = await set("OWN1", "shops/S1/settings/xlShopName", "A");
  R.stranger_cannotWriteSettings = !(await set("X", "shops/S1/settings/xlShopName", "B"));
  await env.cleanup();
  const bad = Object.entries(R).filter(([, v]) => v !== true).map(([k]) => k);
  console.log(JSON.stringify(R, null, 1));
  console.log(bad.length ? "FAIL: " + bad.join(", ") : `ALL_OK (${Object.keys(R).length} items)`);
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
