// 店舗IDだけでの読み取りの禁止（2026-10-08）のルールを dev（thirty-dev-b6958）で REST 実測する（2026-10-09）。
// 匿名uid: A＝スタッフURLの端末、C＝承認済みの個別URLの端末、D＝関係の無い端末、B＝管理コードで owners に自己登録したオーナー。
// 確かめること:
//   D は settings・periods・staff・subs・company を読めない（global/shops の店舗名と accounts/{sid}/plan は読める）
//   readers は本人の uid にだけ、値の照合が通ったときだけ書ける（存在しないトークン・期限切れのトークン・他人の uid・未知の項目は拒否）
//   t（スタッフURL）・p（承認済みの個別URL）を登録した端末は読める。トークンを消す・個別URLを取り消すと読めなくなる
//   readers の一覧はオーナーだけが読める
// 使い捨てデータ（tokens/PROBESR*・staffPageTokens/PROBESR*・staffPages/PROBESR*・readers の A/C）と B の owners 登録は検証の中で消す。
// 本番では実行しない。反証: ルールを出す前の dev に向けると D の読みが 200 になり NG に並ぶ。
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/probe-rules-shop-read.js .claude/skills/shifty-e2e-verify/.secrets.local → ALL_OK true
"use strict";
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
  const [A, B, C, D] = [await anon(), await anon(), await anon(), await anon()];
  const R = [];
  const S = `shops/${SID}`;
  const TOK = "PROBESRtok" + "a".repeat(10), TOKX = "PROBESRtokx" + "b".repeat(9), PT = "PROBESRpage" + "c".repeat(13);
  const t = async (label, m, p, who, body, expect) => { const s = await req(m, p, who.tok, body); R.push({ label, status: s, expect, ok: s === expect }); };
  const READ = ["settings", "periods", "staff", "subs", "company"];

  for (const k of READ) await t(`D ${k} を読めない`, "GET", `${S}/${k}`, D, undefined, 401);
  await t("D global/shops の店舗名は読める", "GET", `global/shops/${SID}`, D, undefined, 200);
  await t("D accounts/{sid}/plan は読める", "GET", `accounts/${SID}/plan`, D, undefined, 200);

  await t("B owners 自己登録(管理コード)", "PUT", `${S}/owners/${B.uid}`, B, ADMIN, 200);
  await t("B オーナーは settings を読める", "GET", `${S}/settings`, B, undefined, 200);
  await t("B 期限内のトークン", "PUT", `tokens/${TOK}`, B, { shopId: SID, periodId: "__probeSRP", expiresAtMs: Date.now() + 86400000 }, 200);
  await t("B 期限切れのトークン", "PUT", `tokens/${TOKX}`, B, { shopId: SID, periodId: "__probeSRP", expiresAtMs: Date.now() - 60000 }, 200);
  await t("B 個別URLの逆引き", "PUT", `staffPageTokens/${PT}`, B, { shopId: SID, at: "2099-01-01T00:00:00Z" }, 200);
  await t("B 承認済みの個別URL", "PUT", `${S}/staffPages/${PT}`, B, { status: "approved", name: "__probeSR", displayName: "__probeSR", requestedAt: "2099-01-01T00:00:00Z", approvedAt: "2099-01-01T00:00:00Z", byUid: B.uid }, 200);

  await t("A 存在しないトークンは登録できない", "PUT", `${S}/readers/${A.uid}`, A, { t: "PROBESRnone" }, 401);
  await t("A 期限切れのトークンは登録できない", "PUT", `${S}/readers/${A.uid}`, A, { t: TOKX }, 401);
  await t("A 未知の項目は登録できない", "PUT", `${S}/readers/${A.uid}`, A, { t: TOK, x: 1 }, 401);
  await t("D 他人の uid には登録できない", "PUT", `${S}/readers/${A.uid}`, D, { t: TOK }, 401);
  await t("A スタッフURLのトークンで登録", "PUT", `${S}/readers/${A.uid}`, A, { t: TOK }, 200);
  for (const k of READ) await t(`A 登録後は ${k} を読める`, "GET", `${S}/${k}`, A, undefined, 200);
  await t("D は A の登録があっても読めない", "GET", `${S}/settings`, D, undefined, 401);

  await t("C 承認済みの個別URLで登録", "PUT", `${S}/readers/${C.uid}`, C, { p: PT }, 200);
  await t("C 登録後は subs を読める", "GET", `${S}/subs`, C, undefined, 200);

  await t("A readers の一覧は読めない", "GET", `${S}/readers`, A, undefined, 401);
  await t("A 自分の登録は読める", "GET", `${S}/readers/${A.uid}`, A, undefined, 200);
  await t("B readers の一覧を読める", "GET", `${S}/readers`, B, undefined, 200);

  await t("B トークンを消す", "DELETE", `tokens/${TOK}`, B, undefined, 200);
  await t("A トークンが消えたら読めない", "GET", `${S}/settings`, A, undefined, 401);
  await t("B 個別URLを取り消す", "PUT", `${S}/staffPages/${PT}/status`, B, "revoked", 200);
  await t("C 取り消し後は読めない", "GET", `${S}/settings`, C, undefined, 401);

  // ---- 後始末 ----
  for (const p of [`${S}/readers/${A.uid}`, `${S}/readers/${C.uid}`, `tokens/${TOKX}`, `${S}/staffPages/${PT}`, `staffPageTokens/${PT}`]) await req("DELETE", p, B.tok);
  const left = {};
  for (const p of [`${S}/readers/${A.uid}`, `${S}/readers/${C.uid}`, `tokens/${TOK}`, `tokens/${TOKX}`, `${S}/staffPages/${PT}`, `staffPageTokens/${PT}`]) {
    left[p] = await (await fetch(`${DB}/${enc(p)}.json?auth=${B.tok}`)).json();
  }
  await t("B owners 自己登録の削除", "DELETE", `${S}/owners/${B.uid}`, B, undefined, 200);
  R.push({ label: "後始末の確認（使い捨てデータが残っていない）", value: left, ok: Object.values(left).every(v => v === null) });
  console.log(JSON.stringify(R, null, 1));
  console.log("NG", JSON.stringify(R.filter(r => !r.ok).map(r => r.label)));
  console.log("ALL_OK", R.every(r => r.ok));
})();
