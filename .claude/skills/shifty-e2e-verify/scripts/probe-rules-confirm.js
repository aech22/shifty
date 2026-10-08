// P3（人×月の所定・確定ロック）のセキュリティルールを dev（thirty-dev-b6958）で REST 実測する（2026-09-30）。
// 新しい匿名uid A（＝オーナーでない端末・スタッフ）と、管理コードで owners に自己登録した匿名uid B（＝オーナー）で
//   - subs: 未確定の期間への提出は A でも 200、確定済みの期間への提出・変更・削除は A だと 401、B（オーナー）は 200
//   - laborMonths: A は読み書きとも 401、B は 200、形の不正（月キー・days/min 欠落）は 401
// を比べる。使い捨てデータ（periods/__probeP・__probeC、subs/__probeS*、laborMonths/2099-01）と B の owners 登録は検証の中で消す。
// 本番では実行しない。
// 実行: node .claude/skills/shifty-e2e-verify/scripts/probe-rules-confirm.js .claude/skills/shifty-e2e-verify/.secrets.local → ALL_OK true
const fs = require("fs");
const KEY = "AIzaSyAR4TJRJytLge7jgei4xbKXHwUfU-nWEd0", DB = "https://thirty-dev-b6958-default-rtdb.firebaseio.com";
const sec = fs.readFileSync(process.argv[2], "utf8");
const code = (sec.match(/SHIFTY_TEST_ADMIN_CODE=(.+)/) || [])[1].trim().replace(/^["']|["']$/g, "");
const SID = "eb6AfsQv4JAht+cX*xP7fuDa";
if (!code.startsWith(SID + ".")) throw new Error("管理コードの形が想定外");
const ADMIN = code.slice(SID.length + 1);
const enc = p => p.split("/").map(encodeURIComponent).join("/").replace(/\*/g, "%2A");
async function anon() { const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${KEY}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ returnSecureToken: true }) }); const j = await r.json(); return { tok: j.idToken, uid: j.localId }; }
async function req(m, p, tok, body) { const r = await fetch(`${DB}/${enc(p)}.json?auth=${tok}`, { method: m, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }); return r.status; }
(async () => {
  const A = await anon(), B = await anon(), R = [];
  const S = `shops/${SID}`;
  const t = async (label, m, p, who, body, expect) => { const s = await req(m, p, who.tok, body); R.push({ label, status: s, expect, ok: s === expect }); };
  const per = id => ({ id, startDate: "2099-01-01", endDate: "2099-01-31", label: "probe" });
  const sub = (id, pid) => ({ id, periodId: pid, staffName: "__probe", shifts: { "2099-01-02": { status: "work", start: "10:00", end: "15:00" } }, submittedAt: "2099-01-01T00:00:00Z" });
  await t("B owners 自己登録(管理コード)", "PUT", `${S}/owners/${B.uid}`, B, ADMIN, 200);
  // 期間（オーナーが作る）: 未確定と確定済み
  await t("B 未確定の期間を作る", "PUT", `${S}/periods/__probeP`, B, per("__probeP"), 200);
  await t("B 確定済みの期間を作る", "PUT", `${S}/periods/__probeC`, B, { ...per("__probeC"), confirmation: { at: "2099-02-01T00:00:00Z", byUid: B.uid } }, 200);
  // subs: スタッフ（非オーナー）
  await t("A 未確定の期間へ提出", "PUT", `${S}/subs/__probeS1`, A, sub("__probeS1", "__probeP"), 200);
  await t("A 未確定の期間の提出を修正(PATCH)", "PATCH", `${S}/subs/__probeS1`, A, { "shifts/2099-01-03": { status: "work", start: "11:00", end: "15:00" } }, 200);
  await t("A 確定済みの期間へ提出", "PUT", `${S}/subs/__probeS2`, A, sub("__probeS2", "__probeC"), 401);
  await t("A 未確定の提出を確定済みの期間へ付け替え", "PATCH", `${S}/subs/__probeS1`, A, { periodId: "__probeC" }, 401);
  await t("A subs 全体への update で確定済みへ提出", "PATCH", `${S}/subs`, A, { "__probeS3": sub("__probeS3", "__probeC") }, 401);
  // 確定（オーナー）→ その後のスタッフの変更・削除は拒否
  await t("B 期間を確定", "PUT", `${S}/periods/__probeP/confirmation`, B, { at: "2099-02-01T00:00:00Z", byUid: B.uid }, 200);
  await t("A 確定後の修正(PATCH)", "PATCH", `${S}/subs/__probeS1`, A, { "shifts/2099-01-04": { status: "work", start: "11:00", end: "15:00" } }, 401);
  await t("A 確定後の削除", "DELETE", `${S}/subs/__probeS1`, A, undefined, 401);
  await t("B オーナーは確定済みでも修正できる", "PATCH", `${S}/subs/__probeS1`, B, { "shifts/2099-01-04": { status: "work", start: "11:00", end: "15:00" } }, 200);
  await t("B オーナーは確定済みの期間へ書ける", "PUT", `${S}/subs/__probeS2`, B, sub("__probeS2", "__probeC"), 200);
  // 解除すると再びスタッフが書ける
  await t("B 確定を解除", "DELETE", `${S}/periods/__probeP/confirmation`, B, undefined, 200);
  await t("A 解除後の修正", "PATCH", `${S}/subs/__probeS1`, A, { "shifts/2099-01-05": { status: "work", start: "11:00", end: "15:00" } }, 200);
  await t("A 解除後の削除(本人の提出の削除は従来どおり)", "DELETE", `${S}/subs/__probeS1`, A, undefined, 200);
  // laborMonths
  const rec = { days: 2, min: 840, auto: { days: 2, min: 840 } };
  await t("A laborMonths 読み", "GET", `${S}/laborMonths`, A, undefined, 401);
  await t("A laborMonths 書き", "PUT", `${S}/laborMonths/2099-01/__probe`, A, rec, 401);
  await t("B laborMonths 書き", "PUT", `${S}/laborMonths/2099-01/__probe`, B, rec, 200);
  await t("B laborMonths 読み", "GET", `${S}/laborMonths/2099-01`, B, undefined, 200);
  await t("B laborMonths update(凍結)", "PATCH", `${S}/laborMonths`, B, { "2099-01/__probe/frozenAt": "2099-02-01T00:00:00Z", "2099-01/__probe/frozenBy": B.uid }, 200);
  await t("B laborMonths update(凍結を解く)", "PATCH", `${S}/laborMonths`, B, { "2099-01/__probe/frozenAt": null, "2099-01/__probe/frozenBy": null }, 200);
  await t("B laborMonths 月キーの不正", "PUT", `${S}/laborMonths/2099-13/__probe`, B, rec, 401);
  await t("B laborMonths 形の不正(min 欠落)", "PUT", `${S}/laborMonths/2099-01/__probe2`, B, { days: 1 }, 401);
  await t("B laborMonths 形の不正(days 負)", "PUT", `${S}/laborMonths/2099-01/__probe2`, B, { days: -1, min: 1 }, 401);
  // 後始末
  await t("B 後始末 laborMonths", "DELETE", `${S}/laborMonths/2099-01`, B, undefined, 200);
  await t("B 後始末 subs __probeS2", "DELETE", `${S}/subs/__probeS2`, B, undefined, 200);
  await t("B 後始末 subs __probeS1(念のため)", "DELETE", `${S}/subs/__probeS1`, B, undefined, 200);
  await t("B 後始末 periods __probeP", "DELETE", `${S}/periods/__probeP`, B, undefined, 200);
  await t("B 後始末 periods __probeC", "DELETE", `${S}/periods/__probeC`, B, undefined, 200);
  // 残りの確認はオーナー登録を消す前に B で読む（2026-10-08 から店舗のデータは店舗IDだけでは読めない）
  const left = await (await fetch(`${DB}/${enc(S + "/subs/__probeS1")}.json?auth=${B.tok}`)).json();
  await t("B owners 自己登録の削除", "DELETE", `${S}/owners/${B.uid}`, B, undefined, 200);
  R.push({ label: "後始末の確認(Bはもう非オーナー→laborMonths 401)", status: await req("GET", `${S}/laborMonths`, B.tok), expect: 401 });
  R.push({ label: "後始末の確認(__probeS1 が残っていない)", value: left, ok: left === null });
  console.log(JSON.stringify(R, null, 1));
  console.log("ALL_OK", R.filter(r => "expect" in r).every(r => r.status === r.expect) && left === null);
})();
