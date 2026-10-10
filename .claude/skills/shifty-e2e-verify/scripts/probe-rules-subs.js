// 提出データ（shops/$shopId/subs/$subId）の形の検証ルールを dev（thirty-dev-b6958）で REST 実測する（2026-10-08）。
// 新しい匿名uid A（＝オーナーでない端末・スタッフ）と、管理コードで owners に自己登録した匿名uid B（＝オーナー）で
//   - 許可される書き込み: 新規提出（PUT）・日付1件の差分 update・updatedAt/isUpdated・セル編集（changed つき）・
//     管理者の調整値（全項目）・シフト作成タブの下書き（source:"grid"）・下書きへのスタッフの初回提出（source を消す）・
//     半角／全角の空白を含む名前への改名・削除
//   - 拒否される書き込み: 未知の項目（直下・日ごと・adminRest/leaveTypes の中）・日付キーの形・status の欠落・
//     時刻の形・長すぎるメモ／コメント／名前・名前の " < > と改行・タブ・id の不一致・periodId の形・型の誤り
// を比べる。使い捨てデータ（periods/__probeSubsP、subs/__probeSubs*）と B の owners 登録は検証の中で消す。
// 本番では実行しない（デプロイ前のルールに当てても「拒否されるはず」の項目が 200 になるだけで壊れはしないが、意味が無い）。
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/probe-rules-subs.js .claude/skills/shifty-e2e-verify/.secrets.local [dev のサービスアカウント JSON]
//   → ALL_OK true
// 第2引数（任意）に dev のサービスアカウント（scripts/service-account-dev.json）を渡すと、Admin SDK で
// 「ルールに無い古い項目を持つ提出」を1件置き、ルールの評価が書いた場所だけに掛かるか（既存の未知の項目が
// 別の項目の差分 update を巻き添えで止めないか）も測る。project_id が thirty-dev-b6958 でなければ止まる。
const fs = require("fs");
const path = require("path");
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
  const S = `shops/${SID}`, SUBS = `${S}/subs`, P = "__probeSubsP";
  const t = async (label, m, p, who, body, expect) => { const s = await req(m, p, who.tok, body); R.push({ label, status: s, expect, ok: s === expect }); };
  // クライアントと同じ書き方: 新規は subs/{id} への PUT 相当、既存は subs への PATCH（"{id}/shifts/{日付}" などのフラットパス）
  const patch = (label, who, flat, expect) => t(label, "PATCH", SUBS, who, flat, expect);
  const sub = (id, extra = {}) => ({
    id, periodId: P, staffName: "__probe", submittedAt: "2099-01-01T00:00:00.000Z", comment: "よろしくお願いします",
    shifts: { "2099-01-02": { status: "work", start: "10:00", end: "15:00" }, "2099-01-03": { status: "holiday" } }, ...extra,
  });

  await t("B owners 自己登録(管理コード)", "PUT", `${S}/owners/${B.uid}`, B, ADMIN, 200);
  await t("B 未確定の期間を作る", "PUT", `${S}/periods/${P}`, B, { id: P, startDate: "2099-01-01", endDate: "2099-01-15", label: "probe" }, 200);

  // ---- 許可される書き込み ----
  await t("A 新規提出（submitterUid=自分）", "PUT", `${SUBS}/__probeSubs1`, A, sub("__probeSubs1", { submitterUid: A.uid }), 200);
  await patch("A 日付1件の差分 update（再提出）", A, { "__probeSubs1/shifts/2099-01-04": { status: "work", start: "17:00", end: "25:00", changed: true } }, 200);
  await patch("A updatedAt・isUpdated の差分 update", A, { "__probeSubs1/updatedAt": "2099-01-01T01:00:00.000Z", "__probeSubs1/isUpdated": true }, 200);
  await patch("A 提出状況一覧のセル編集（休みにする＝start/end を消した日）", A, { "__probeSubs1/shifts/2099-01-02": { status: "holiday" }, "__probeSubs1/updatedAt": "2099-01-01T02:00:00.000Z" }, 200);
  await patch("A 日付を消す（null）", A, { "__probeSubs1/shifts/2099-01-04": null }, 200);
  await patch("B 管理者の調整値（全項目）", B, {
    "__probeSubs1/shifts/2099-01-05": {
      status: "work", origStatus: "holiday", start: "10:00", end: "15:00", adjustedStart: "09:30", adjustedEnd: "30:30",
      adjustedStartNote: "研修", adjustedEndNote: "", adjustedStartFixed: true, adjustedEndFixed: false,
      extraStart: "23:00", extraEnd: "25:00", adjustedBreak: 45, changed: true,
      adminRest: { start: true }, leaveTypes: { end: "paid" },
    },
  }, 200);
  await patch("B 空欄の上書き（adjustedStart=\"\"・メモだけ）", B, { "__probeSubs1/shifts/2099-01-06": { status: "work", adjustedStart: "", adjustedStartNote: "事務11" } }, 200);
  await patch("B 旧い日単位の leaveType", B, { "__probeSubs1/shifts/2099-01-07": { status: "work", adminRest: { start: true, end: true }, leaveType: "public" } }, 200);
  await t("B シフト作成タブの下書き（source:grid・shopId・comment 空）", "PUT", `${SUBS}/__probeSubs2`, B,
    { id: "__probeSubs2", periodId: P, staffName: "__probe2", shopId: SID, shifts: { "2099-01-02": { status: "work", adminRest: { start: true } } }, comment: "", submittedAt: "2099-01-01T00:00:00.000Z", source: "grid" }, 200);
  await patch("A 下書きへのスタッフの初回提出（source・shopId を消す）", A, {
    "__probeSubs2/source": null, "__probeSubs2/shopId": null, "__probeSubs2/submitterUid": A.uid, "__probeSubs2/comment": "初回",
    "__probeSubs2/shifts/2099-01-03": { status: "work", start: "11:00", end: "15:00" },
  }, 200);
  await patch("A 改名（半角空白を含む名前）", A, { "__probeSubs1/staffName": "グエン ティ フォン" }, 200);
  await patch("A 改名（全角空白を含む名前）", A, { "__probeSubs1/staffName": "前川　佐登志" }, 200);
  await patch("A コメント 500字", A, { "__probeSubs1/comment": "あ".repeat(500) }, 200);
  await patch("A コメントの改行（名前以外は改行を許す）", A, { "__probeSubs1/comment": "1行目\n2行目" }, 200);

  // ---- 拒否される書き込み ----
  await t("A 新規提出に未知の項目", "PUT", `${SUBS}/__probeSubs3`, A, sub("__probeSubs3", { foo: 1 }), 401);
  await patch("A 直下に未知の項目", A, { "__probeSubs1/foo": "x" }, 401);
  await patch("A 日ごとに未知の項目", A, { "__probeSubs1/shifts/2099-01-08": { status: "work", start: "10:00", end: "15:00", foo: 1 } }, 401);
  await patch("B adminRest の中に未知の項目", B, { "__probeSubs1/shifts/2099-01-08": { status: "work", adminRest: { mid: true } } }, 401);
  await patch("B adminRest がオブジェクトでない", B, { "__probeSubs1/shifts/2099-01-08": { status: "work", adminRest: true } }, 401);
  await patch("B leaveTypes の種別が誤り", B, { "__probeSubs1/shifts/2099-01-08": { status: "work", leaveTypes: { start: "vacation" } } }, 401);
  await patch("A 日付キーの形（2099-13-01）", A, { "__probeSubs1/shifts/2099-13-01": { status: "work" } }, 401);
  await patch("A 日付キーの形（x）", A, { "__probeSubs1/shifts/x": { status: "work" } }, 401);
  await patch("A 日に status が無い", A, { "__probeSubs1/shifts/2099-01-08": { start: "10:00", end: "15:00" } }, 401);
  await patch("A status の値", A, { "__probeSubs1/shifts/2099-01-08": { status: "off" } }, 401);
  await patch("A 時刻の形（9:00）", A, { "__probeSubs1/shifts/2099-01-08": { status: "work", start: "9:00", end: "15:00" } }, 401);
  await patch("B 時刻の上限（31:00）", B, { "__probeSubs1/shifts/2099-01-08": { status: "work", adjustedEnd: "31:00" } }, 401);
  await patch("B メモ 201字", B, { "__probeSubs1/shifts/2099-01-08": { status: "work", adjustedStartNote: "あ".repeat(201) } }, 401);
  await patch("B 休憩が負", B, { "__probeSubs1/shifts/2099-01-08": { status: "work", adjustedBreak: -1 } }, 401);
  await patch("B 休憩が文字列", B, { "__probeSubs1/shifts/2099-01-08": { status: "work", adjustedBreak: "60" } }, 401);
  await patch("B changed が文字列", B, { "__probeSubs1/shifts/2099-01-08": { status: "work", changed: "true" } }, 401);
  await patch("A コメント 501字", A, { "__probeSubs1/comment": "あ".repeat(501) }, 401);
  await patch("A 名前に \"", A, { "__probeSubs1/staffName": "a\"b" }, 401);
  await patch("A 名前に <", A, { "__probeSubs1/staffName": "<script>" }, 401);
  await patch("A 名前に >", A, { "__probeSubs1/staffName": "a>b" }, 401);
  await patch("A 名前に改行", A, { "__probeSubs1/staffName": "a\nb" }, 401);
  await patch("A 名前にタブ", A, { "__probeSubs1/staffName": "a\tb" }, 401);
  await patch("A 名前 51字", A, { "__probeSubs1/staffName": "あ".repeat(51) }, 401);
  await patch("A 名前が空", A, { "__probeSubs1/staffName": "" }, 401);
  await t("A id が鍵と違う", "PUT", `${SUBS}/__probeSubs4`, A, sub("__probeSubs5"), 401);
  await t("A periodId の形", "PUT", `${SUBS}/__probeSubs4`, A, sub("__probeSubs4", { periodId: "bad id!" }), 401);
  await patch("A source が grid 以外", A, { "__probeSubs1/source": "other" }, 401);
  await patch("A isUpdated が文字列", A, { "__probeSubs1/isUpdated": "true" }, 401);
  await patch("A submittedAt が長すぎる", A, { "__probeSubs1/submittedAt": "x".repeat(41) }, 401);
  await patch("A submitterUid に他人の uid（従来の規則）", A, { "__probeSubs1/submitterUid": B.uid }, 401);

  // ---- 既存の未知の項目（任意・Admin SDK）----
  // 期待: ルールの評価は書いた場所とその祖先・子孫に掛かる。触っていない兄弟の未知の項目では止まらない。
  //       ただし日を丸ごと書き直すとき、その日に未知の項目が残っていれば（持ち越せば）拒否される。
  let adminDb = null;
  if (process.argv[3]) {
    const sa = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
    if (sa.project_id !== "thirty-dev-b6958") throw new Error("サービスアカウントが dev（thirty-dev-b6958）ではない: " + sa.project_id);
    const { createRequire } = require("module");
    const req2 = createRequire(path.resolve(path.dirname(process.argv[3]), "package.json"));
    // firebase-admin v14 はルートの export に credential が無い。subpath（firebase-admin/app・/database）で読む
    const { initializeApp, cert } = req2("firebase-admin/app");
    const { getDatabase } = req2("firebase-admin/database");
    const app = initializeApp({ credential: cert(sa), databaseURL: DB }, "probe-rules-subs");
    adminDb = getDatabase(app);
    await adminDb.ref(`${SUBS}/__probeSubsL`).set({ ...sub("__probeSubsL"), legacyTop: "x", shifts: { "2099-01-02": { status: "work", start: "10:00", end: "15:00", legacyDay: 1 } } });
    await patch("[legacy] 未知の項目を持つ提出の updatedAt を update", A, { "__probeSubsL/updatedAt": "2099-01-01T03:00:00.000Z" }, 200);
    await patch("[legacy] 未知の項目を持つ提出の別の日を update", A, { "__probeSubsL/shifts/2099-01-03": { status: "work", start: "11:00", end: "15:00" } }, 200);
    await patch("[legacy] 未知の項目を持つ日の中の1項目だけを update", B, { "__probeSubsL/shifts/2099-01-02/adjustedStart": "09:00" }, 200);
    await patch("[legacy] 未知の項目を持ち越して日を丸ごと書き直す", A, { "__probeSubsL/shifts/2099-01-02": { status: "work", start: "10:00", end: "16:00", legacyDay: 1 } }, 401);
    await patch("[legacy] 未知の項目を落として日を丸ごと書き直す", A, { "__probeSubsL/shifts/2099-01-02": { status: "work", start: "10:00", end: "16:00" } }, 200);
    await t("[legacy] 削除", "DELETE", `${SUBS}/__probeSubsL`, A, undefined, 200);
  }

  // ---- 後始末 ----
  await t("A 削除（本人の提出の削除は従来どおり）", "DELETE", `${SUBS}/__probeSubs1`, A, undefined, 200);
  await t("B 後始末 subs __probeSubs2", "DELETE", `${SUBS}/__probeSubs2`, B, undefined, 200);
  for (const id of ["__probeSubs3", "__probeSubs4", "__probeSubs5", "__probeSubsL"]) await req("DELETE", `${SUBS}/${id}`, B.tok);
  await t("B 後始末 periods", "DELETE", `${S}/periods/${P}`, B, undefined, 200);
  // 残りの確認はオーナー登録を消す前に B で読む（2026-10-08 から店舗のデータは店舗IDだけでは読めない）
  const left = {};
  for (const id of ["__probeSubs1", "__probeSubs2", "__probeSubs3", "__probeSubs4", "__probeSubs5", "__probeSubsL"]) {
    left[id] = await (await fetch(`${DB}/${enc(`${SUBS}/${id}`)}.json?auth=${B.tok}`)).json();
  }
  await t("B owners 自己登録の削除", "DELETE", `${S}/owners/${B.uid}`, B, undefined, 200);
  const clean = Object.values(left).every(v => v === null);
  R.push({ label: "後始末の確認(__probeSubs* が残っていない)", value: left, ok: clean });
  if (adminDb) await adminDb.app.delete();
  console.log(JSON.stringify(R, null, 1));
  console.log("NG", JSON.stringify(R.filter(r => !r.ok).map(r => r.label)));
  console.log("ALL_OK", R.every(r => r.ok));
})();
