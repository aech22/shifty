// 通知の購読（2026-10-08）のセキュリティルールを dev（thirty-dev-b6958）で REST 実測する。
// 新しい匿名uid A（オーナーでない端末）と、管理コードで owners に自己登録した匿名uid B（オーナー）で
// shops/{標準テスト店舗}/private/push と users/{uid}/push を叩き、許可リスト外の endpoint が拒否されることも確かめる。
// 使い捨ての購読と B の owners 登録は検証の中で消す。本番では実行しない。
// 実行: node .claude/skills/shifty-e2e-verify/scripts/probe-rules-push.js .claude/skills/shifty-e2e-verify/.secrets.local → ALL_OK true
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
  const K = "0123456789abcdef0123456789abcdef";
  const rec = (endpoint, uid) => ({ endpoint, keys: { p256dh: "BPk", auth: "au" }, at: "2026-10-08T00:00:00.000Z", ...(uid ? { uid } : {}) });
  await t("B owners 自己登録(管理コード)", "PUT", `${S}/owners/${B.uid}`, B, ADMIN, 200);
  await t("A 非オーナー private/push 書き", "PUT", `${S}/private/push/${K}`, A, rec("https://fcm.googleapis.com/fcm/send/x", A.uid), 401);
  await t("B オーナー private/push 書き(FCM)", "PUT", `${S}/private/push/${K}`, B, rec("https://fcm.googleapis.com/fcm/send/x", B.uid), 200);
  await t("B オーナー private/push 書き(許可リスト外)", "PUT", `${S}/private/push/${K}`, B, rec("https://evil.example/x", B.uid), 401);
  await t("B オーナー private/push 書き(他人の uid)", "PUT", `${S}/private/push/${K}`, B, rec("https://fcm.googleapis.com/fcm/send/x", A.uid), 401);
  await t("B オーナー private/push 書き(Apple)", "PUT", `${S}/private/push/${K}`, B, rec("https://web.push.apple.com/QAbc", B.uid), 200);
  await t("B オーナー private/push 削除", "DELETE", `${S}/private/push/${K}`, B, undefined, 200);
  // users/{uid}/push は「本人・メールのある認証」だけ。匿名の本人でも書けない
  await t("A 匿名 users/{自分}/push 書き", "PUT", `users/${A.uid}/push/${K}`, A, rec("https://fcm.googleapis.com/fcm/send/x"), 401);
  await t("A 匿名 users/{他人}/push 書き", "PUT", `users/${B.uid}/push/${K}`, A, rec("https://fcm.googleapis.com/fcm/send/x"), 401);
  // CF だけが書く回数のノード
  await t("A notifyRate 書き", "PUT", `notifyRate/submit_${SID}`, A, { count: 0, windowStart: 0 }, 401);
  await t("B owners 自己登録の削除", "DELETE", `${S}/owners/${B.uid}`, B, undefined, 200);
  console.log(JSON.stringify(R, null, 1));
  console.log("ALL_OK", R.every(r => r.ok));
})();
