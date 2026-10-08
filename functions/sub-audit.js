// 提出データの監査（2026-10-08 ユーザー指示。推奨案「名前の一致のまま、他人名義の書き込みを記録する」）の判定（純粋関数）。
// index.js の auditSubWrite（shops/{shopId}/subs/{subId} の onWrite）が、書き込んだ uid（context.auth.uid＝クライアントが名乗る
// submitterUid ではなくサーバーが確かめた値）で呼ぶ。記録は shops/{shopId}/private/subAudit/{periodId}/{push id}（オーナーだけが読める）。
// 記録するのは次の3つ。オーナー（owners に居る uid・企業ログインを含む）と Admin SDK の書き込みは記録しない。
//   delete               オーナー以外が提出を消した（before を残す＝消された内容を戻せる）
//   overwrite-other-uid  オーナー以外が、前の提出者（submitterUid）と違う uid で上書きした
//   duplicate-create     同じ期間・同じ名前の提出が既にあるのに、新しい提出を作った（上書きの判定を素通りする手口）
// 正当な別端末（機種変更・家族のスマホで同じ個別URL）でも overwrite-other-uid は出る。件数の基準値を測ってから人単位の縛りの
// 要否を決めるための記録で、1件ずつが不正の証拠ではない。
"use strict";

const SUB_AUDIT_KINDS = ["delete", "overwrite-other-uid", "duplicate-create"];
const _obj = v => (v && typeof v === "object" ? v : null);

// o={before, after, authUid, isOwner, samePeriodSubs:{subId: sub}（after の期間の提出・新規作成の判定にだけ使う）, subId}
// 戻り値 {kind, sameAs?} | null（記録しない）
function planSubAuditCF(o) {
  const x = _obj(o) || {};
  const uid = typeof x.authUid === "string" && x.authUid ? x.authUid : "";
  if (!uid || x.isOwner) return null;
  const before = _obj(x.before), after = _obj(x.after);
  if (before && !after) return { kind: "delete" };
  if (!after) return null;
  if (before) {
    const prev = typeof before.submitterUid === "string" ? before.submitterUid : "";
    return prev && prev !== uid ? { kind: "overwrite-other-uid", prevUid: prev } : null;
  }
  const name = typeof after.staffName === "string" ? after.staffName : "";
  const pid = typeof after.periodId === "string" ? after.periodId : "";
  if (!name || !pid) return null;
  const same = Object.entries(_obj(x.samePeriodSubs) || {})
    .filter(([id, s]) => id !== x.subId && _obj(s) && s.periodId === pid && s.staffName === name).map(([id]) => id).sort();
  return same.length ? { kind: "duplicate-create", sameAs: same[0] } : null;
}

// 記録の1件（before は消された・上書きされた内容をそのまま残す）
function subAuditRecordCF(o) {
  const x = _obj(o) || {};
  const d = _obj(x.decision) || {};
  const src = _obj(x.after) || _obj(x.before) || {};
  const rec = {
    kind: d.kind, by: String(x.authUid || ""), subId: String(x.subId || ""),
    staffName: typeof src.staffName === "string" ? src.staffName.slice(0, 50) : "",
    periodId: typeof src.periodId === "string" ? src.periodId : "",
    at: String(x.nowIso || ""),
  };
  if (d.prevUid) rec.prevUid = d.prevUid;
  if (d.sameAs) rec.sameAs = d.sameAs;
  if (_obj(x.before)) rec.before = x.before;
  return rec;
}

module.exports = { SUB_AUDIT_KINDS, planSubAuditCF, subAuditRecordCF };
