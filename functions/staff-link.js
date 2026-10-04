// 従業員画面（第2部 E2）: スタッフアカウントと「店舗＋登録名」の紐付けの規則（純粋関数）。index.js から読み込む。
// firebase を読まないので、ローカルで node から直接呼んで確かめられる（tests/my.test.js が読む）。
// 照合の規則（番号・名前の正規化、候補の列挙、リンクコードの形、改名・削除の差分）はクライアントの
// app-my-utils.js と**同じ内容**にする（functions/ は app-my-utils.js を読めないため書き写している。一致は tests/my.test.js が照合する）。
//
// データ（Shifty_実装計画_2026-10.md E.4）:
//   shops/{shopId}/linkRequests/{uid}  {displayName, number?, at}          本人が書く・オーナーが読む／消す
//   shops/{shopId}/staffLinks/{uid}    {name, personId?, method, at}       作るのは CF だけ。オーナーは削除と name の書き換えだけできる（改名・削除の追随）
//   users/{uid}/links/{shopId}         {name, personId?, at}               CF だけが書く。本人が読む「どの店舗に紐付いているか」の索引
//   staffLinkCodes/{code}              {shopId, name, expiry, issuedBy, createdAt}   CF だけ
//   staffLinkCodeIndex/{shopId}/{name} code                                その名前の最新のコード（発行し直すと古いコードを消す）。CF だけ
//   staffLinkCodeAttempts/{uid}        {fails, lockedUntil?, lastAt}       コードの入力の失敗回数（本人単位）。CF だけ
// **名前の正本は shops/{shopId}/staffLinks/{uid}.name**。users/{uid}/links の name は紐付けた時点の写しで、
// オーナーの端末の改名では書き換わらない（users/ は CF しか書けない）。読む側は staffLinks の name を使う。
"use strict";

const LINK_METHODS = ["number", "name", "code"];
// 個人リンクコード: 企業コードと同じ文字種（紛らわしい I・O・0・1 を除く32文字）の8桁
const LINK_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LINK_CODE_LEN = 8;
const LINK_CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/;
const LINK_CODE_TTL_MS = 24 * 60 * 60 * 1000;
// コードの入力の失敗は本人（uid）単位で数える。誤ったコードはどの記録にも当たらないので、記録の側では数えられない
const LINK_CODE_MAX_FAILS = 5;
const LINK_CODE_LOCK_MS = 15 * 60 * 1000;
// 失敗の記録をこの時間より古ければ数え直す（1日に数回の打ち間違いで締め出さない）
const LINK_CODE_FAIL_WINDOW_MS = 24 * 60 * 60 * 1000;
const LINK_NAME_MAX = 50;
const LINK_NUMBER_MAX = 8;

const _obj = v => (v && typeof v === "object" ? v : null);
function isSafeKey(k) {
  return typeof k === "string" && k.length > 0 && k.length <= 128 && !/[/.#$[\]\x00-\x1f\x7f]/.test(k);
}
function isSpacerName(n) { return typeof n === "string" && n.startsWith("__spacer__"); }
// 店舗の staff（配列か数値キーのオブジェクト）を名前の配列にする。空白列は除く
function staffNamesOf(staff) {
  const arr = Array.isArray(staff) ? staff : Object.values(_obj(staff) || {});
  return arr.filter(n => typeof n === "string" && n && !isSpacerName(n));
}

// ===== 正規化（クライアントの app-my-utils.js と同じ）=====
function toHalfWidthDigitsCF(s) {
  return String(s == null ? "" : s).replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
}
// 方式A の照合キー: 全角数字を半角にし前後の空白を落とす。**数字だけのときだけ**キーになる（それ以外は ""＝照合しない）。先頭のゼロは残す
function linkNumberKeyCF(s) {
  const t = toHalfWidthDigitsCF(s).replace(/^[\s　]+|[\s　]+$/g, "");
  return /^[0-9]+$/.test(t) ? t : "";
}
// 方式B の照合キー: 空白（半角・全角、途中も含む）をすべて除く。それ以外は一字一句そのまま
function linkNameKeyCF(s) {
  return String(s == null ? "" : s).replace(/[\s　]/g, "");
}
// 入力されたコード: 全角英数を半角に・小文字を大文字に・空白とハイフンを除く
function normalizeLinkCodeCF(s) {
  return String(s == null ? "" : s)
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[\s　\-‐－ー]/g, "").toUpperCase();
}
function isValidLinkCodeCF(s) { return typeof s === "string" && LINK_CODE_RE.test(s); }

// 企業連携の店舗の写しの人物（{personId: {shopId: 登録名}}）から、その店舗のその名前の人物IDを引く
function personIdForShopNameCF(mirrorPeople, shopId, name) {
  const p = _obj(mirrorPeople) || {};
  for (const id of Object.keys(p)) {
    if (!/^(?:[0-9]{1,20}|p_[A-Za-z0-9]{8})$/.test(id)) continue;
    if ((_obj(p[id]) || {})[shopId] === name) return id;
  }
  return null;
}

// 申請 → 候補の列挙。req={displayName, number}、ctx={shopId, staff, staffNumbers, mirrorPeople, staffLinks, uid}。
// 戻り値は staff の並び順の [{name, methods:["number"|"name"...], takenBy}]（takenBy＝その名前に既に紐付いている別の uid）。
// 方式A: 申請の番号と、settings.staffNumbers[名前] または企業連携の人物ID（数字の従業員番号）が、どちらも数字だけで完全一致。
// 方式B: 空白を除いた申請の登録ネームと、空白を除いた登録名が一致。
function linkCandidatesForCF(req, ctx) {
  const r = _obj(req) || {}, c = _obj(ctx) || {};
  const names = staffNamesOf(c.staff);
  const nums = _obj(c.staffNumbers) || {};
  const rn = linkNumberKeyCF(r.number);
  const rk = linkNameKeyCF(r.displayName);
  const byNum = new Set();
  if (rn) {
    names.forEach(n => { if (linkNumberKeyCF(nums[n]) === rn) byNum.add(n); });
    const people = _obj(c.mirrorPeople) || {};
    if (/^[0-9]{1,20}$/.test(rn) && _obj(people[rn])) {
      const n = people[rn][c.shopId];
      if (typeof n === "string" && names.includes(n)) byNum.add(n);
    }
  }
  const takenOf = {};
  Object.entries(_obj(c.staffLinks) || {}).forEach(([u, rec]) => {
    const nm = (_obj(rec) || {}).name;
    if (typeof nm === "string" && u !== c.uid) takenOf[nm] = u;
  });
  const out = [];
  names.forEach(n => {
    const methods = [];
    if (byNum.has(n)) methods.push("number");
    if (rk && linkNameKeyCF(n) === rk) methods.push("name");
    if (methods.length) out.push({ name: n, methods, takenBy: takenOf[n] || null });
  });
  return out;
}
// 承認するときの方式（番号を優先）。候補に無い名前なら null
function linkMethodForCF(req, ctx, name) {
  const hit = linkCandidatesForCF(req, ctx).find(x => x.name === name);
  return hit ? hit.methods[0] : null;
}

// ===== 改名・削除の追随（クライアントの renameStaffInStaffLinks / dropStaffFromStaffLinks と同じ）=====
// staffLinks（{uid: {name,...}}）の旧名を新名へ。update に渡す差分 {"uid/name": 新名} を返す（変わらなければ null）
function renameStaffLinksPatchCF(staffLinks, oldName, newName) {
  const out = {};
  Object.entries(_obj(staffLinks) || {}).forEach(([u, rec]) => {
    if (isSafeKey(u) && (_obj(rec) || {}).name === oldName) out[`${u}/name`] = newName;
  });
  return Object.keys(out).length ? out : null;
}
function dropStaffLinksPatchCF(staffLinks, names) {
  const set = new Set((Array.isArray(names) ? names : []).filter(n => typeof n === "string"));
  const out = {};
  Object.entries(_obj(staffLinks) || {}).forEach(([u, rec]) => {
    if (isSafeKey(u) && set.has((_obj(rec) || {}).name)) out[u] = null;
  });
  return Object.keys(out).length ? out : null;
}
// 人物の統合・切り出し・ID の振り直しの後で、紐付けの personId を写しの人物に合わせ直す差分（ルートからのパス）。
// userLinks は {uid: users/{uid}/links/{shopId} の値}（無い uid には users/ 側を書かない＝部分的なノードを作らない）
function staffLinkPersonIdPatchCF(shopId, staffLinks, mirrorPeople, userLinks) {
  const out = {};
  const ul = _obj(userLinks) || {};
  Object.entries(_obj(staffLinks) || {}).forEach(([u, rec]) => {
    const r = _obj(rec);
    if (!r || !isSafeKey(u) || typeof r.name !== "string") return;
    const want = personIdForShopNameCF(mirrorPeople, shopId, r.name);
    if ((r.personId || null) !== want) out[`shops/${shopId}/staffLinks/${u}/personId`] = want;
    const cur = _obj(ul[u]);
    if (cur && (cur.personId || null) !== want) out[`users/${u}/links/${shopId}/personId`] = want;
  });
  return Object.keys(out).length ? out : null;
}

// ===== コードの入力の失敗回数 =====
function linkCodeWaitMsCF(st, now) {
  const s = _obj(st) || {};
  return typeof s.lockedUntil === "number" && s.lockedUntil > now ? s.lockedUntil - now : 0;
}
// 成功なら null（記録を消す）。失敗なら回数を足し、上限で lockedUntil を置いて数え直す
function nextLinkCodeAttemptsCF(st, ok, now) {
  if (ok) return null;
  const s = _obj(st) || {};
  const fresh = typeof s.lastAt === "number" && now - s.lastAt <= LINK_CODE_FAIL_WINDOW_MS;
  const fails = (fresh && typeof s.fails === "number" ? s.fails : 0) + 1;
  if (fails >= LINK_CODE_MAX_FAILS) return { fails: 0, lockedUntil: now + LINK_CODE_LOCK_MS, lastAt: now };
  return { fails, lastAt: now };
}
// 期限: expiry ちょうどの時刻から使えない（24時間ちょうどは期限切れ）
function linkCodeExpiredCF(rec, now) {
  const r = _obj(rec);
  return !r || typeof r.expiry !== "number" || now >= r.expiry;
}
function genLinkCodeCF(randomBytes) {
  const b = randomBytes(LINK_CODE_LEN);
  let t = "";
  for (let i = 0; i < LINK_CODE_LEN; i++) t += LINK_CODE_CHARS[b[i] % LINK_CODE_CHARS.length];
  return t;
}

// ===== CF の計画（読んだ値 → 書く差分）。index.js と E2E のスタブが同じ関数を通す =====
const err = (code, msg) => ({ error: { code, msg } });
const isOwnerOf = (owners, uid) => !!(_obj(owners) || {})[uid];
const isCompanyUid = uid => typeof uid === "string" && uid.startsWith("company_");
function linkRecordOf(name, personId, method, at) {
  const rec = { name, method, at };
  if (personId) rec.personId = personId;
  return rec;
}
function userLinkRecordOf(name, personId, at) {
  const rec = { name, at };
  if (personId) rec.personId = personId;
  return rec;
}
// 紐付けてよい相手か（承認・コードの両方）。店舗のオーナー・企業ログインの uid は紐付けない
function linkTargetError(uid, owners) {
  if (isCompanyUid(uid)) return err("failed-precondition", "企業アカウントのログインはリンクできません");
  if (isOwnerOf(owners, uid)) return err("failed-precondition", "この店舗の管理者として登録されているアカウントはリンクできません");
  return null;
}
// 承認（方式A・B）。o={shopId, uid, name, callerUid, nowIso, owners, request, staff, settings, mirrorPeople, staffLinks}
function planApproveStaffLink(o) {
  const x = _obj(o) || {};
  if (!isOwnerOf(x.owners, x.callerUid)) return err("permission-denied", "この店舗の管理者権限がありません");
  const req = _obj(x.request);
  if (!req) return err("not-found", "申請が見つかりません（取り消されたか、既に処理されています）");
  const te = linkTargetError(x.uid, x.owners);
  if (te) return te;
  const ctx = { shopId: x.shopId, staff: x.staff, staffNumbers: (_obj(x.settings) || {}).staffNumbers, mirrorPeople: x.mirrorPeople, staffLinks: x.staffLinks, uid: x.uid };
  const cand = linkCandidatesForCF(req, ctx).find(c => c.name === x.name);
  if (!cand) return err("failed-precondition", `この申請は「${x.name}」さんの従業員番号・登録名と一致しません`);
  if (cand.takenBy) return err("failed-precondition", `「${x.name}」さんは既に別のアカウントとリンクされています。先に解除してください`);
  const personId = personIdForShopNameCF(x.mirrorPeople, x.shopId, x.name);
  return { method: cand.methods[0], patch: {
    [`shops/${x.shopId}/staffLinks/${x.uid}`]: linkRecordOf(x.name, personId, cand.methods[0], x.nowIso),
    [`users/${x.uid}/links/${x.shopId}`]: userLinkRecordOf(x.name, personId, x.nowIso),
    [`shops/${x.shopId}/linkRequests/${x.uid}`]: null,
  } };
}
// 発行（方式C）。o={shopId, name, callerUid, now, nowIso, owners, staff, staffLinks, code, prevCode}
function planIssueStaffLinkCode(o) {
  const x = _obj(o) || {};
  if (!isOwnerOf(x.owners, x.callerUid)) return err("permission-denied", "この店舗の管理者権限がありません");
  if (!staffNamesOf(x.staff).includes(x.name)) return err("failed-precondition", `「${x.name}」さんはスタッフに登録されていません`);
  const taken = Object.values(_obj(x.staffLinks) || {}).some(r => (_obj(r) || {}).name === x.name);
  if (taken) return err("failed-precondition", `「${x.name}」さんは既にアカウントとリンクされています。先に解除してください`);
  if (!isValidLinkCodeCF(x.code)) return err("internal", "コードを作れませんでした");
  const expiry = x.now + LINK_CODE_TTL_MS;
  const patch = {
    [`staffLinkCodes/${x.code}`]: { shopId: x.shopId, name: x.name, expiry, issuedBy: x.callerUid, createdAt: x.nowIso },
    [`staffLinkCodeIndex/${x.shopId}/${x.name}`]: x.code,
  };
  // 同じ名前に前に発行したコードは使えなくする（最新の1つだけが有効）
  if (isValidLinkCodeCF(x.prevCode) && x.prevCode !== x.code) patch[`staffLinkCodes/${x.prevCode}`] = null;
  return { code: x.code, expiry, patch };
}
// コードでの紐付け（方式C）。rec は staffLinkCodes/{code} の値（無ければ null）。
// o={uid, email, rec, code, now, nowIso, owners, staff, mirrorPeople, staffLinks}
// 戻り値の consume=true のとき、index.js はトランザクションでコードを消してから patch を書く（1回限り）
function planRedeemStaffLinkCode(o) {
  const x = _obj(o) || {};
  if (!x.email) return err("failed-precondition", "マイシフトのアカウントにログインしてから入力してください");
  const bad = err("invalid-argument", "コードが正しくないか、有効期限が切れています");
  const rec = _obj(x.rec);
  if (!rec || linkCodeExpiredCF(rec, x.now)) return { ...bad, countFail: true, deleteExpired: !!rec };
  const te = linkTargetError(x.uid, x.owners);
  if (te) return te;
  if (!staffNamesOf(x.staff).includes(rec.name)) return { ...err("failed-precondition", "このコードのスタッフはお店のスタッフ一覧にいません（名前の変更か削除）。お店の管理者にもう一度発行してもらってください"), deleteExpired: true };
  const takenBy = Object.entries(_obj(x.staffLinks) || {}).find(([u, r]) => u !== x.uid && (_obj(r) || {}).name === rec.name);
  if (takenBy) return err("failed-precondition", "このスタッフは既に別のアカウントとリンクされています。お店の管理者に確認してください");
  const personId = personIdForShopNameCF(x.mirrorPeople, rec.shopId, rec.name);
  return { consume: true, shopId: rec.shopId, name: rec.name, patch: {
    [`shops/${rec.shopId}/staffLinks/${x.uid}`]: linkRecordOf(rec.name, personId, "code", x.nowIso),
    [`users/${x.uid}/links/${rec.shopId}`]: userLinkRecordOf(rec.name, personId, x.nowIso),
    [`shops/${rec.shopId}/linkRequests/${x.uid}`]: null,
    [`staffLinkCodeAttempts/${x.uid}`]: null,
  } };
}
// 解除。本人（uid を省くか自分の uid）か店舗のオーナー
function planUnlinkStaff(o) {
  const x = _obj(o) || {};
  const target = x.uid || x.callerUid;
  if (target !== x.callerUid && !isOwnerOf(x.owners, x.callerUid)) return err("permission-denied", "このリンクを解除する権限がありません");
  return { uid: target, patch: { [`shops/${x.shopId}/staffLinks/${target}`]: null, [`users/${target}/links/${x.shopId}`]: null } };
}

module.exports = {
  LINK_METHODS, LINK_CODE_CHARS, LINK_CODE_LEN, LINK_CODE_RE, LINK_CODE_TTL_MS, LINK_CODE_MAX_FAILS, LINK_CODE_LOCK_MS, LINK_CODE_FAIL_WINDOW_MS,
  LINK_NAME_MAX, LINK_NUMBER_MAX, isSafeKey, staffNamesOf, toHalfWidthDigitsCF, linkNumberKeyCF, linkNameKeyCF, normalizeLinkCodeCF, isValidLinkCodeCF,
  personIdForShopNameCF, linkCandidatesForCF, linkMethodForCF, renameStaffLinksPatchCF, dropStaffLinksPatchCF, staffLinkPersonIdPatchCF,
  linkCodeWaitMsCF, nextLinkCodeAttemptsCF, linkCodeExpiredCF, genLinkCodeCF,
  planApproveStaffLink, planIssueStaffLinkCode, planRedeemStaffLinkCode, planUnlinkStaff,
};
