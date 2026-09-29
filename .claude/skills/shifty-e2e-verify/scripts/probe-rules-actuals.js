// P4（実績 shops/{sid}/actuals）のセキュリティルールを dev（thirty-dev-b6958）で REST 実測する（2026-09-30）。
// 新しい匿名uid A（＝オーナーでない端末）と、管理コードで owners に自己登録した匿名uid B（＝オーナー）で
//   - A は読み・書き・削除とも 401、B は 200
//   - 形の不正（日付キー・時刻の形・分の範囲・真偽でない absent・知らない項目・長すぎるメモ・空の記録）は B でも 401
//   - 差分 update（期間/名前/日付 の記録単位・項目単位・null で消す）は B で 200
// を比べる。使い捨てデータ（actuals/__probeP）と B の owners 登録は検証の中で消す。本番では実行しない。
// 実行: node .claude/skills/shifty-e2e-verify/scripts/probe-rules-actuals.js .claude/skills/shifty-e2e-verify/.secrets.local → ALL_OK true
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
  const S = `shops/${SID}/actuals`;
  const P = `${S}/__probeP/__probe`;
  const t = async (label, m, p, who, body, expect) => { const s = await req(m, p, who.tok, body); R.push({ label, status: s, expect, ok: s === expect }); };
  await t("B owners 自己登録(管理コード)", "PUT", `shops/${SID}/owners/${B.uid}`, B, ADMIN, 200);
  // 非オーナー
  await t("A actuals 読み", "GET", S, A, undefined, 401);
  await t("A actuals 書き", "PUT", `${P}/2099-01-02`, A, { end: "19:00" }, 401);
  await t("A actuals 差分 update", "PATCH", S, A, { "__probeP/__probe/2099-01-02": { end: "19:00" } }, 401);
  // オーナー
  await t("B 書き(退勤だけ)", "PUT", `${P}/2099-01-02`, B, { end: "19:00" }, 200);
  await t("B 書き(全項目)", "PUT", `${P}/2099-01-03`, B, { start: "09:30", end: "25:00", breakMin: 45, absentMin: 30, legalHoliday: true, note: "応援" }, 200);
  await t("B 書き(欠勤)", "PUT", `${P}/2099-01-04`, B, { absent: true, absentMin: 480 }, 200);
  await t("B 読み", "GET", S, B, undefined, 200);
  await t("B 差分 update(記録単位＋項目単位＋null)", "PATCH", S, B, { "__probeP/__probe/2099-01-05": { start: "10:00" }, "__probeP/__probe/2099-01-03/note": "直し", "__probeP/__probe/2099-01-04": null }, 200);
  await t("A 削除", "DELETE", `${P}/2099-01-02`, A, undefined, 401);
  // 形の不正（オーナーでも拒否）
  await t("B 日付キーの不正", "PUT", `${P}/2099-13-01`, B, { end: "19:00" }, 401);
  await t("B 時刻の形の不正(9:00)", "PUT", `${P}/2099-01-06`, B, { start: "9:00" }, 401);
  await t("B 時刻の上限超え(31:00)", "PUT", `${P}/2099-01-06`, B, { end: "31:00" }, 401);
  await t("B 休憩が負", "PUT", `${P}/2099-01-06`, B, { breakMin: -1 }, 401);
  await t("B 休憩が1440超", "PUT", `${P}/2099-01-06`, B, { breakMin: 1441 }, 401);
  await t("B absent が文字列", "PUT", `${P}/2099-01-06`, B, { absent: "yes" }, 401);
  await t("B 知らない項目", "PUT", `${P}/2099-01-06`, B, { start: "10:00", foo: 1 }, 401);
  await t("B メモが201字", "PUT", `${P}/2099-01-06`, B, { note: "x".repeat(201) }, 401);
  await t("B 記録が文字列", "PUT", `${P}/2099-01-06`, B, "19:00", 401);
  // 後始末
  await t("B 後始末 actuals/__probeP", "DELETE", `${S}/__probeP`, B, undefined, 200);
  await t("B owners 自己登録の削除", "DELETE", `shops/${SID}/owners/${B.uid}`, B, undefined, 200);
  R.push({ label: "後始末の確認(Bはもう非オーナー→actuals 401)", status: await req("GET", S, B.tok), expect: 401, ok: true });
  R[R.length - 1].ok = R[R.length - 1].status === 401;
  console.log(JSON.stringify(R, null, 1));
  console.log("ALL_OK", R.every(r => r.ok));
})();
