// 提出の人単位の縛り（nameGuards・pageDevices）と受付期限（periods/tokens の expiresAtMs）のルールを dev（thirty-dev-b6958）で REST 実測する（2026-10-08）。
// 匿名uid: A＝ただのスタッフ（募集URL）、C＝承認済みの個別URLを開いた端末、D＝関係の無い端末、B＝管理コードで owners に自己登録したオーナー。
// 確かめること:
//   nameGuards: オーナーだけが true を書ける（スタッフ・true 以外は拒否）
//   pageDevices: 承認済みの個別URLの token で本人の uid にだけ書ける（他人の uid・存在しない token・取り消し後は拒否）。一覧はオーナーだけ
//   subs: 縛りのある名前は C とオーナーだけが書ける（新規・上書き・削除・その名前への改名とも）。縛りの無い名前と、キーに使えない文字の名前は従来どおり
//         期限を過ぎた期間はオーナー以外書けない。期限を持たない期間は従来どおり書ける
//   tokens: 期限を過ぎた逆引きはオーナー以外読めない。期限内は読める。expiresAtMs は数値だけ
// 使い捨てデータ（periods/__probeG*、subs/__probeG*、staffPages の token、nameGuards/__probeG、pageDevices、tokens/__probeGTok*）と
// B の owners 登録は検証の中で消す。本番では実行しない。
//
// 実行: node .claude/skills/shifty-e2e-verify/scripts/probe-rules-guard.js .claude/skills/shifty-e2e-verify/.secrets.local → ALL_OK true
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
  const S = `shops/${SID}`, SUBS = `${S}/subs`;
  const P = "__probeGP", PX = "__probeGPX", PO = "__probeGPO";
  const TK = "PROBEG" + "a".repeat(18), TK2 = "PROBEH" + "b".repeat(18);
  const NAME = "__probeG", FREE = "__probeFree", BAD = "__probe.dot";
  const t = async (label, m, p, who, body, expect) => { const s = await req(m, p, who.tok, body); R.push({ label, status: s, expect, ok: s === expect }); };
  const sub = (id, name, pid = P, uid) => ({ id, periodId: pid, staffName: name, submittedAt: "2099-01-01T00:00:00.000Z", shifts: { "2099-01-02": { status: "work", start: "10:00", end: "15:00" } }, ...(uid ? { submitterUid: uid } : {}) });
  const past = Date.now() - 60000, future = Date.now() + 365 * 86400000;

  await t("B owners 自己登録(管理コード)", "PUT", `${S}/owners/${B.uid}`, B, ADMIN, 200);
  await t("B 期限内の期間", "PUT", `${S}/periods/${P}`, B, { id: P, startDate: "2099-01-01", endDate: "2099-01-15", expiresAtMs: future }, 200);
  await t("B 期限切れの期間", "PUT", `${S}/periods/${PX}`, B, { id: PX, startDate: "2026-01-01", endDate: "2026-01-15", expiresAtMs: past }, 200);
  await t("B 期限を持たない期間", "PUT", `${S}/periods/${PO}`, B, { id: PO, startDate: "2099-02-01", endDate: "2099-02-15" }, 200);
  await t("B periods の expiresAtMs が文字列なら拒否", "PUT", `${S}/periods/${P}/expiresAtMs`, B, "1", 401);
  const page = n => ({ status: "approved", name: n, displayName: n, requestedAt: "2099-01-01T00:00:00Z", approvedAt: "2099-01-01T00:00:00Z", byUid: B.uid });
  await t("B 承認済みの個別URL", "PUT", `${S}/staffPages/${TK}`, B, page(NAME), 200);

  // ---- nameGuards ----
  await t("A nameGuards を書けない", "PUT", `${S}/nameGuards/${NAME}`, A, true, 401);
  await t("B nameGuards に true 以外は書けない", "PUT", `${S}/nameGuards/${NAME}`, B, "yes", 401);
  await t("B nameGuards を書く", "PUT", `${S}/nameGuards/${NAME}`, B, true, 200);
  await t("A nameGuards を読める", "GET", `${S}/nameGuards/${NAME}`, A, undefined, 200);

  // ---- pageDevices ----
  const dev = tk => ({ token: tk, at: "2099-01-01T00:00:00Z" });
  await t("D 他人の uid に登録できない", "PUT", `${S}/pageDevices/${C.uid}`, D, dev(TK), 401);
  await t("D 存在しない token では登録できない", "PUT", `${S}/pageDevices/${D.uid}`, D, dev(TK2), 401);
  await t("C 承認済みの token で自分を登録", "PUT", `${S}/pageDevices/${C.uid}`, C, dev(TK), 200);
  await t("C 余計な項目は拒否", "PUT", `${S}/pageDevices/${C.uid}`, C, { ...dev(TK), x: 1 }, 401);
  await t("C 自分の登録を読める", "GET", `${S}/pageDevices/${C.uid}`, C, undefined, 200);
  await t("D 他人の登録は読めない", "GET", `${S}/pageDevices/${C.uid}`, D, undefined, 401);
  await t("A 一覧は読めない", "GET", `${S}/pageDevices`, A, undefined, 401);
  await t("B 一覧を読める", "GET", `${S}/pageDevices`, B, undefined, 200);

  // ---- subs（縛り）----
  await t("A 縛りのある名前で新規提出できない", "PUT", `${SUBS}/__probeG1`, A, sub("__probeG1", NAME, P, A.uid), 401);
  await t("C 登録した端末は提出できる", "PUT", `${SUBS}/__probeG2`, C, sub("__probeG2", NAME, P, C.uid), 200);
  await t("A その提出を上書きできない", "PATCH", SUBS, A, { "__probeG2/comment": "x" }, 401);
  await t("A その提出を消せない", "DELETE", `${SUBS}/__probeG2`, A, undefined, 401);
  await t("C 自分の提出を更新できる", "PATCH", SUBS, C, { "__probeG2/comment": "ok" }, 200);
  await t("B オーナーは縛られない（上書き）", "PATCH", SUBS, B, { "__probeG2/comment": "owner" }, 200);
  await t("A 縛りの無い名前は従来どおり", "PUT", `${SUBS}/__probeG3`, A, sub("__probeG3", FREE, P, A.uid), 200);
  await t("A 縛りのある名前へ改名できない", "PATCH", SUBS, A, { "__probeG3/staffName": NAME }, 401);
  await t("A キーに使えない文字の名前は従来どおり（縛りの判定で落ちない）", "PUT", `${SUBS}/__probeG4`, A, sub("__probeG4", BAD, P, A.uid), 200);
  await t("B 個別URLを取り消す", "PATCH", `${S}/staffPages/${TK}`, B, { status: "revoked", revokedAt: "2099-01-02T00:00:00Z" }, 200);
  await t("C 取り消し後は提出できない", "PATCH", SUBS, C, { "__probeG2/comment": "after revoke" }, 401);
  await t("C 取り消し後は端末を登録し直せない", "PUT", `${S}/pageDevices/${C.uid}`, C, dev(TK), 401);

  // ---- subs（受付期限）----
  await t("A 期限切れの期間に提出できない", "PUT", `${SUBS}/__probeG5`, A, sub("__probeG5", FREE, PX, A.uid), 401);
  await t("B 期限切れの期間でもオーナーは書ける", "PUT", `${SUBS}/__probeG6`, B, sub("__probeG6", FREE, PX), 200);
  await t("A 期限切れの期間の提出を消せない", "DELETE", `${SUBS}/__probeG6`, A, undefined, 401);
  await t("A 期限を持たない期間は従来どおり", "PUT", `${SUBS}/__probeG7`, A, sub("__probeG7", FREE, PO, A.uid), 200);

  // ---- tokens ----
  await t("B 期限切れの逆引き", "PUT", "tokens/__probeGTok1", B, { shopId: SID, periodId: PX, expiresAtMs: past }, 200);
  await t("B 期限内の逆引き", "PUT", "tokens/__probeGTok2", B, { shopId: SID, periodId: P, expiresAtMs: future }, 200);
  await t("B expiresAtMs が文字列なら拒否", "PUT", "tokens/__probeGTok3", B, { shopId: SID, periodId: P, expiresAtMs: "1" }, 401);
  await t("A 期限切れの逆引きは読めない", "GET", "tokens/__probeGTok1", A, undefined, 401);
  await t("B オーナーは期限切れでも読める", "GET", "tokens/__probeGTok1", B, undefined, 200);
  await t("A 期限内の逆引きは読める", "GET", "tokens/__probeGTok2", A, undefined, 200);
  await t("A 存在しない逆引きは従来どおり読める（null）", "GET", "tokens/__probeGTokNone", A, undefined, 200);

  // ---- 後始末 ----
  for (const id of ["__probeG1", "__probeG2", "__probeG3", "__probeG4", "__probeG5", "__probeG6", "__probeG7"]) await req("DELETE", `${SUBS}/${id}`, B.tok);
  for (const p of [`${S}/periods/${P}`, `${S}/periods/${PX}`, `${S}/periods/${PO}`, `${S}/staffPages/${TK}`, `${S}/nameGuards/${NAME}`, `${S}/pageDevices/${C.uid}`, "tokens/__probeGTok1", "tokens/__probeGTok2"]) await req("DELETE", p, B.tok);
  const left = {};
  for (const p of [`${SUBS}/__probeG2`, `${SUBS}/__probeG3`, `${S}/staffPages/${TK}`, `${S}/nameGuards/${NAME}`, `${S}/pageDevices/${C.uid}`, `${S}/periods/${P}`, "tokens/__probeGTok2"]) {
    left[p] = await (await fetch(`${DB}/${enc(p)}.json?auth=${B.tok}`)).json();
  }
  await t("B owners 自己登録の削除", "DELETE", `${S}/owners/${B.uid}`, B, undefined, 200);
  R.push({ label: "後始末の確認（使い捨てデータが残っていない）", value: left, ok: Object.values(left).every(v => v === null) });
  console.log(JSON.stringify(R, null, 1));
  console.log("NG", JSON.stringify(R.filter(r => !r.ok).map(r => r.label)));
  console.log("ALL_OK", R.every(r => r.ok));
})();
