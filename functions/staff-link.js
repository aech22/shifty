// 従業員画面（第2部 E2）: スタッフアカウントと「店舗＋登録名」の紐付けの規則（純粋関数）。index.js から読み込む。
// firebase を読まないので、ローカルで node から直接呼んで確かめられる（tests/my.test.js が読む）。
// 照合の規則（番号・名前の正規化、候補の列挙、改名・削除の差分）はクライアントの
// app-my-utils.js と**同じ内容**にする（functions/ は app-my-utils.js を読めないため書き写している。一致は tests/my.test.js が照合する）。
//
// データ（Shifty_実装計画_2026-10.md E.4）:
//   shops/{shopId}/linkRequests/{uid}  {displayName, number?, at}          本人が書く・オーナーが読む／消す
//   shops/{shopId}/staffLinks/{uid}    {name, personId?, method, at}       作るのは CF だけ。オーナーは削除と name の書き換えだけできる（改名・削除の追随）
//   users/{uid}/links/{shopId}         {name, personId?, at}               CF だけが書く。本人が読む「どの店舗に紐付いているか」の索引
// 個人リンクコード（方式C・staffLinkCodes 等）は 2026-10-05 にユーザー指示で機能ごと削除した（スタッフ専用のURLに一本化）。
// 以前にコードで作られた紐付けは method:"code" のまま残るので、LINK_METHODS とルールは "code" を受け付けたままにしている。
// 方式 "page"（2026-10-05 ユーザー指示）: 管理者が承認・発行したスタッフ専用のURL（#/m/<token>）を開いた本人が、
// その URL のお店をメールのアカウントに追加する（planLinkStaffPage）。管理者の承認は URL の承認で済んでいるので再承認しない。
// 暗証番号を決めている URL は番号の照合を通してから（index.js の linkStaffPage がトランザクションで照合する）
// **名前の正本は shops/{shopId}/staffLinks/{uid}.name**。users/{uid}/links の name は紐付けた時点の写しで、
// オーナーの端末の改名では書き換わらない（users/ は CF しか書けない）。読む側は staffLinks の name を使う。
"use strict";

const LINK_METHODS = ["number", "name", "code", "page"];
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
// 紐付けてよい相手か。店舗のオーナー・企業ログインの uid は紐付けない
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
// 専用URLからアカウントへ追加（方式 "page"・2026-10-05）。o={shopId, uid, name, nowIso, owners, staffLinks, mirrorPeople}
// name は URL の承認済みの名前（呼び出し元からは受け取らない＝index.js が staffPages の name を確かめてから渡す）。
// 既に同じ名前でリンク済みなら書かない（already）。このお店に別の名前でリンク済み・その名前が別のアカウントとリンク済みなら拒否
function planLinkStaffPage(o) {
  const x = _obj(o) || {};
  if (typeof x.name !== "string" || !x.name) return err("failed-precondition", "お店のスタッフ一覧にこの名前がありません（名前の変更か削除）");
  const te = linkTargetError(x.uid, x.owners);
  if (te) return te;
  const links = _obj(x.staffLinks) || {};
  const mine = _obj(links[x.uid]);
  if (mine && typeof mine.name === "string" && mine.name) {
    if (mine.name === x.name) return { already: true, patch: null };
    return err("failed-precondition", `このアカウントは既にこのお店の「${mine.name}」さんとリンクされています。先に設定の「勤務先のお店」で解除してください`);
  }
  const taken = Object.entries(links).find(([u, r]) => u !== x.uid && (_obj(r) || {}).name === x.name);
  if (taken) return err("failed-precondition", `「${x.name}」さんは既に別のアカウントとリンクされています。お店の管理者に解除を依頼してください`);
  const personId = personIdForShopNameCF(x.mirrorPeople, x.shopId, x.name);
  return { method: "page", patch: {
    [`shops/${x.shopId}/staffLinks/${x.uid}`]: linkRecordOf(x.name, personId, "page", x.nowIso),
    [`users/${x.uid}/links/${x.shopId}`]: userLinkRecordOf(x.name, personId, x.nowIso),
    [`shops/${x.shopId}/linkRequests/${x.uid}`]: null,
  } };
}
// 解除。本人（uid を省くか自分の uid）か店舗のオーナー
function planUnlinkStaff(o) {
  const x = _obj(o) || {};
  const target = x.uid || x.callerUid;
  if (target !== x.callerUid && !isOwnerOf(x.owners, x.callerUid)) return err("permission-denied", "このリンクを解除する権限がありません");
  return { uid: target, patch: { [`shops/${x.shopId}/staffLinks/${target}`]: null, [`users/${target}/links/${x.shopId}`]: null } };
}

// ===== 提出の人単位の縛り（2026-10-08）: shops/{shopId}/nameGuards/{名前}=true =====
// 承認済みの個別URLか staffLinks の紐付けがある名前に印を付ける。ルールはこの印がある名前の提出を本人（紐付いた uid・登録した端末）と
// オーナーに限る。紐付けを変える関数（approveStaffLink・unlinkStaff・linkStaffPage・companyRenameStaff）のあとに計算し直す。
// クライアントの app-my-utils.js の planNameGuards と同じ規則（tests/my.test.js が照合する）
const NAME_GUARD_KEY_BAD_CF = /[.#$/[\]\x00-\x1f\x7f]/;
function nameGuardKeyOkCF(name) { return typeof name === "string" && !!name && name.length <= 50 && !NAME_GUARD_KEY_BAD_CF.test(name); }
function planNameGuardsCF(o) {
  const x = _obj(o) || {};
  const names = new Set(staffNamesOf(x.staff).filter(nameGuardKeyOkCF));
  const want = {};
  Object.values(_obj(x.pages) || {}).forEach(r => { const rec = _obj(r); if (rec && rec.status === "approved" && names.has(rec.name)) want[rec.name] = true; });
  Object.values(_obj(x.staffLinks) || {}).forEach(r => { const rec = _obj(r); if (rec && typeof rec.name === "string" && names.has(rec.name)) want[rec.name] = true; });
  const cur = _obj(x.guards) || {};
  const patch = {};
  Object.keys(want).forEach(n => { if (cur[n] !== true) patch[n] = true; });
  Object.keys(cur).forEach(n => { if (!want[n]) patch[n] = null; });
  return Object.keys(patch).length ? patch : null;
}

module.exports = {
  LINK_METHODS, LINK_NAME_MAX, LINK_NUMBER_MAX, isSafeKey, staffNamesOf, toHalfWidthDigitsCF, linkNumberKeyCF, linkNameKeyCF,
  personIdForShopNameCF, linkCandidatesForCF, linkMethodForCF, renameStaffLinksPatchCF, dropStaffLinksPatchCF, staffLinkPersonIdPatchCF,
  planApproveStaffLink, planUnlinkStaff, planLinkStaffPage, nameGuardKeyOkCF, planNameGuardsCF,
};
