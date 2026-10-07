// 通知（Web Push）の「誰に何を送るか」を決める純粋関数（2026-10-08 新設）。index.js から読み込む。
// firebase を読まないので、tests/notify.test.js が node から直接呼んで確かめる。
//
// 送る通知は4種類:
//   1. 新しい期間（スタッフ向け）  … shops/{sid}/periods/{pid} の作成時（index.js の notifyNewPeriod）
//   2. 締切日の12時（スタッフ向け）… その期間の deadlineDate が今日で、まだ提出していない人（notifyDeadlines）
//   3. 提出（管理者向け）          … shops/{sid}/subs/{subId} の書き込みのうち、スタッフの提出と再提出だけ（notifyStaffSubmit）
//   4. 企業の提出締切の12時（管理者向け）… 企業の写しの締切が今日で、period.submission が無い期間（notifyDeadlines）
//
// 購読（PushSubscription の JSON）の置き場:
//   スタッフ個別URL   staffPageData/{token}/push/{key}   … 承認済みの staffPages の token
//   スタッフアカウント users/{uid}/push/{key}           … shops/{sid}/staffLinks の uid
//   管理者            shops/{sid}/private/push/{key}    … uid がいまも owners にいる端末だけ
// key は endpoint の SHA-256 の16進の先頭32文字（同じ端末で二重にならない。クライアントの pushKeyOfEndpoint と同じ）。
//
// 規則のうちクライアント（app-utils.js）と同じものは書き写している（functions/ は app-utils.js を読めないため）:
//   resolveAliasCF ＝ resolveAlias、isStaffHiddenInPeriodCF ＝ isStaffHiddenInPeriod、
//   companyDeadlineInfoCF ＝ shopDeadlineInfoFromLink。一致は tests/notify.test.js が乱数の入力で照合する。
"use strict";

const { staffNamesOf, isSafeKey } = require("./staff-link");
const { sanitizeMonthlyDeadlineDays } = require("./company-config");

// VAPID の公開鍵（公開してよい値）。クライアントの app-core.js の PUSH_VAPID_PUBLIC_KEY と同じ値（テストが照合する）。
// 秘密鍵は Secret Manager の VAPID_PRIVATE_KEY（リポジトリには置かない）
const VAPID_PUBLIC_KEY_CF = "BPnyDGWCQvzW2fBXzjwi4kIHpKmEAB--D93n8zIB1OSuNP_HAdiQ4jYp9br0Lc9O5QodfNq7nCOOrTPHCpgyhNo";
// VAPID の subject は mailto: か https: の URL。連絡先のメールアドレスを公開しないためサイトの URL にする
const VAPID_SUBJECT_CF = "https://shiftyshifty.app";
// 通知を押したときに開く先。本番のドメインに固定する（dev は CF が動かないので分けない）
const NOTIFY_BASE_URL_CF = "https://shiftyshifty.app/";
const PUSH_KEY_RE_CF = /^[0-9a-f]{32}$/;
const PAGE_TOKEN_RE = /^[A-Za-z0-9]{24}$/;
const NOTIFY_TITLE_CF = "Shifty";
// デモ店舗（index.js の DEMO_SHOP_IDS と同じ）。広告の着地先で、通知を送る相手がいない
const DEMO_SHOP_IDS_CF = ["demo-toriMatsu-v1"];

const _o = v => (v && typeof v === "object" ? v : null);
const _vals = v => (Array.isArray(v) ? v : Object.values(_o(v) || {}));
const _isDate = v => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && isRealDateCF(v);
function isRealDateCF(v) {
  const [y, m, d] = v.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

// サーバー時刻（UTC）から日本の日付（YYYY-MM-DD）
function jstTodayCF(nowMs) {
  return new Date((Number.isFinite(nowMs) ? nowMs : Date.now()) + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// ===== 購読の記録 =====
// 送ってよい宛先（ブラウザの Push サービス）。endpoint は購読した端末が書くので、ここに無いホストへは CF から POST しない
// （任意の URL を書かれると CF が外部へリクエストを送る踏み台になるため・2026-10-08）。database.rules.json の3つの push ノードの
// endpoint の .validate と同じ規則（tests/notify.test.js が照合する）。Chrome・Edge（Android）・Samsung は FCM、Safari は web.push.apple.com、
// Firefox は mozilla、Windows の Edge は *.notify.windows.com。
const PUSH_ENDPOINT_RE = /^https:\/\/(fcm\.googleapis\.com|android\.googleapis\.com|web\.push\.apple\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com)\//;
function isPushEndpointCF(endpoint) {
  return typeof endpoint === "string" && endpoint.length <= 1000 && PUSH_ENDPOINT_RE.test(endpoint);
}
function isPushRecordCF(rec) {
  const r = _o(rec);
  if (!r) return false;
  const k = _o(r.keys);
  return isPushEndpointCF(r.endpoint) &&
    !!k && typeof k.p256dh === "string" && k.p256dh.length >= 1 && k.p256dh.length <= 200 &&
    typeof k.auth === "string" && k.auth.length >= 1 && k.auth.length <= 100;
}
// {key: rec} の push ノードを送信先の配列にする。path は記録の場所（410/404 のとき消す）。
// ownerUids を渡すと、その中にいる uid の記録だけを残す（管理者の端末が owners から外れたら送らない）
function pushTargetsOfCF(node, basePath, opts = {}) {
  const out = [];
  const owners = opts.ownerUids ? new Set(opts.ownerUids) : null;
  Object.entries(_o(node) || {}).forEach(([key, rec]) => {
    if (!PUSH_KEY_RE_CF.test(key) || !isPushRecordCF(rec)) return;
    if (owners && !(typeof rec.uid === "string" && owners.has(rec.uid))) return;
    out.push({ path: `${basePath}/${key}`, sub: { endpoint: rec.endpoint, keys: { p256dh: rec.keys.p256dh, auth: rec.keys.auth } } });
  });
  return out;
}
// 同じ endpoint（同じ端末・同じブラウザ）には1回だけ送る（個別URLとアカウントの両方で購読した端末など）
function dedupeTargetsCF(targets) {
  const seen = new Set();
  return (targets || []).filter(t => {
    const e = t && t.sub && t.sub.endpoint;
    if (!e || seen.has(e)) return false;
    seen.add(e);
    return true;
  });
}
// 送信の失敗のうち、購読が無効になったもの（ブラウザで通知をオフにした・アプリを消した）だけ記録を消す
function pushErrorActionCF(statusCode) {
  return statusCode === 404 || statusCode === 410 ? "delete" : "keep";
}

// ===== 名前 =====
// app-utils.js の resolveAlias と同じ（入力名が誰かの別名なら登録名へ寄せる）
function resolveAliasCF(inputName, staffAliases) {
  if (!inputName || !staffAliases) return inputName;
  for (const [registered, aliases] of Object.entries(_o(staffAliases) || {})) {
    const list = _vals(aliases);
    if (list.length && list.map(a => String(a).trim()).includes(String(inputName).trim())) return registered;
  }
  return inputName;
}
// app-utils.js の isStaffHiddenInPeriod と同じ（期間の startDate が非表示の範囲に入るか）
function isStaffHiddenInPeriodCF(name, staffHidden, period) {
  const s = period && period.startDate;
  if (!s) return false;
  const raw = (_o(staffHidden) || {})[name];
  const ranges = raw === true ? [{ from: null, to: null }]
    : _vals(raw).filter(r => r && typeof r === "object").map(r => ({
      from: typeof r.from === "string" ? r.from : null, to: typeof r.to === "string" ? r.to : null,
    }));
  return ranges.some(r => (r.from == null || s >= r.from) && (r.to == null || s < r.to));
}
// その期間にスタッフの提出がある名前（登録名と、提出に書かれた名前の両方）。管理者の下書き（source:"grid"）は提出ではない
function submittedNamesCF(subs, periodId, staffAliases) {
  const out = new Set();
  _vals(subs).forEach(s => {
    if (!s || s.periodId !== periodId || s.source === "grid" || typeof s.staffName !== "string") return;
    out.add(s.staffName);
    out.add(resolveAliasCF(s.staffName, staffAliases));
  });
  return out;
}
function periodLabelCF(p) {
  const x = _o(p) || {};
  if (typeof x.label === "string" && x.label.trim()) return x.label.trim();
  return x.startDate && x.endDate ? `${x.startDate}〜${x.endDate}` : "シフト";
}

// ===== スタッフの宛先 =====
// 個別URL（承認済み・名前がいまのスタッフ一覧にある）とアカウントの紐付け（名前がいまのスタッフ一覧にある）。
// 同じ名前に両方があれば両方へ（端末が別のことがある。同じ端末なら送る直前の dedupeTargetsCF が1回にする）
function staffRecipientsCF({ staff, staffPages, staffLinks }) {
  const names = new Set(staffNamesOf(staff));
  const out = [];
  Object.entries(_o(staffPages) || {}).forEach(([token, rec]) => {
    const r = _o(rec);
    if (!PAGE_TOKEN_RE.test(token) || !r || r.status !== "approved" || typeof r.name !== "string" || !names.has(r.name)) return;
    out.push({ kind: "page", name: r.name, token, base: `staffPageData/${token}`, url: `${NOTIFY_BASE_URL_CF}#/m/${token}` });
  });
  Object.entries(_o(staffLinks) || {}).forEach(([uid, rec]) => {
    const r = _o(rec);
    if (!isSafeKey(uid) || !r || typeof r.name !== "string" || !names.has(r.name)) return;
    out.push({ kind: "account", name: r.name, uid, base: `users/${uid}`, url: `${NOTIFY_BASE_URL_CF}#/me` });
  });
  return out;
}

// 1. 新しい期間。過去に終わった期間を後から作ったときは送らない。その期間で非表示（休職など）の人には送らない
function planNewPeriodNotifyCF(o) {
  const x = _o(o) || {};
  const p = _o(x.period);
  if (DEMO_SHOP_IDS_CF.includes(x.shopId)) return { skip: "demo", recipients: [] };
  if (!p || !_isDate(p.startDate) || !_isDate(p.endDate)) return { skip: "invalid-period", recipients: [] };
  if (_isDate(x.today) && p.endDate < x.today) return { skip: "past-period", recipients: [] };
  const label = periodLabelCF(p);
  const shopName = typeof x.shopName === "string" && x.shopName.trim() ? x.shopName.trim() : "お店";
  const recipients = staffRecipientsCF(x)
    .filter(r => !isStaffHiddenInPeriodCF(r.name, x.staffHidden, p))
    .map(r => ({ ...r, payload: { title: NOTIFY_TITLE_CF, body: `${shopName}：${label}のシフト提出が始まりました`, url: r.url, tag: `period-${p.id || ""}` } }));
  return { recipients };
}

// 2. 締切日の12時。今日が締切の期間ごとに、まだ提出していない人へ
function deadlinePeriodsCF(periods, today) {
  return Object.entries(_o(periods) || {})
    .map(([id, p]) => (_o(p) ? { ...p, id: p.id || id } : null))
    .filter(p => p && p.deadlineDate === today && _isDate(today));
}
function planDeadlineStaffNotifyCF(o) {
  const x = _o(o) || {};
  const p = _o(x.period);
  if (DEMO_SHOP_IDS_CF.includes(x.shopId)) return { skip: "demo", recipients: [] };
  if (!p || !p.id) return { skip: "invalid-period", recipients: [] };
  const submitted = submittedNamesCF(x.subs, p.id, x.staffAliases);
  const label = periodLabelCF(p);
  const shopName = typeof x.shopName === "string" && x.shopName.trim() ? x.shopName.trim() : "お店";
  const recipients = staffRecipientsCF(x)
    .filter(r => !isStaffHiddenInPeriodCF(r.name, x.staffHidden, p) && !submitted.has(r.name))
    .map(r => ({ ...r, payload: { title: NOTIFY_TITLE_CF, body: `${shopName}：今日は${label}の提出締切日です`, url: r.url, tag: `deadline-${p.id}` } }));
  return { recipients };
}

// 3. 提出（管理者向け）。スタッフの提出かどうかを書き込みの前後から判定する。
// 根拠（クライアントの書き込み）:
//   ・スタッフの初回提出（app-staff.js の submit → App の staffOnSub）は、sub が無いところへ作るか、管理者の下書き（source:"grid"）を
//     引き継いで source を消し submittedAt を提出した時刻にする（isFirstSubmission）。
//   ・スタッフの再提出・提出状況一覧のセル編集（スタッフ画面の SmModal の onEditSub）は updatedAt を新しい時刻にし isUpdated:true を立てる。
//   ・管理者の書き込み（シフト作成タブの applyEditToSubs・提出一覧の詳細の saveAdj・期間管理タブから開いた SmModal・
//     実績・改名の CF）は updatedAt / isUpdated / submittedAt を立てない・変えない（バグチェック#59 で決めた不変条件）。
//     シフト作成タブが新しく作る sub は source:"grid" を持つ。
// したがって「スタッフの提出」＝ 後が存在し source が "grid" でなく、かつ
//   (a) 前が無いか前が source:"grid"（初回提出）、または
//   (b) updatedAt が前より新しくなり isUpdated が真（再提出）。削除（後が無い）は数えない。
function isStaffSubmissionWriteCF(before, after) {
  const a = _o(after);
  if (!a || a.source === "grid" || typeof a.staffName !== "string" || !a.staffName || typeof a.periodId !== "string") return null;
  const b = _o(before);
  if (!b || b.source === "grid") return typeof a.submittedAt === "string" && a.submittedAt ? "first" : null;
  // 時刻は ISO 文字列なので文字列の大小で比べる。前より新しいときだけ（管理者の端末が古い updatedAt を書き戻した形を数えない）
  if (a.isUpdated === true && typeof a.updatedAt === "string" && a.updatedAt && (typeof b.updatedAt !== "string" || a.updatedAt > b.updatedAt)) return "update";
  return null;
}
function planSubmitNotifyCF(o) {
  const x = _o(o) || {};
  if (DEMO_SHOP_IDS_CF.includes(x.shopId)) return { skip: "demo" };
  const kind = isStaffSubmissionWriteCF(x.before, x.after);
  if (!kind) return { skip: "not-submission" };
  const name = resolveAliasCF(x.after.staffName, x.staffAliases);
  const label = periodLabelCF(x.period);
  const shopName = typeof x.shopName === "string" && x.shopName.trim() ? x.shopName.trim() : "";
  const body = `${shopName ? shopName + "：" : ""}${name}さんがシフトを${kind === "first" ? "提出" : "再提出"}しました（${label}）`;
  return { kind, payload: { title: NOTIFY_TITLE_CF, body, url: `${NOTIFY_BASE_URL_CF}#/admin`, tag: `submit-${x.after.periodId}-${name}` } };
}

// 4. 企業の提出締切。app-utils.js の shopDeadlineInfoFromLink と同じ規則（期間ごとの日付指定 ＞ 毎月の固定日）。
// 毎月の固定日は「期間の開始日より前で最も遅い固定日」（開始月と前月だけを見る。29〜31 は短い月の月末）
function monthlyDeadlineForCF(days, startDate) {
  const ds = sanitizeMonthlyDeadlineDays(days);
  if (!ds.length || !_isDate(startDate)) return null;
  const [sy, sm] = startDate.split("-").map(Number);
  let best = null;
  for (let back = 0; back <= 1; back++) {
    const base = new Date(Date.UTC(sy, sm - 1 - back, 1));
    const y = base.getUTCFullYear(), m = base.getUTCMonth();
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    ds.forEach(d => {
      const c = new Date(Date.UTC(y, m, Math.min(d, last))).toISOString().slice(0, 10);
      if (c < startDate && (!best || c > best)) best = c;
    });
  }
  return best;
}
function companyDeadlineInfoCF(company, period) {
  const c = _o(company), p = _o(period);
  if (!c || !p) return null;
  const key = p.startDate && p.endDate ? `${p.startDate}_${p.endDate}` : "";
  const d = _o(c.deadlines);
  const own = d && key ? d[key] : null;
  if (_isDate(own)) return { date: own, source: "date" };
  const m = monthlyDeadlineForCF(c.monthlyDeadlineDays, p.startDate);
  return m ? { date: m, source: "monthly" } : null;
}
function planCompanyDeadlineNotifyCF(o) {
  const x = _o(o) || {};
  if (DEMO_SHOP_IDS_CF.includes(x.shopId) || !_o(x.company) || !_isDate(x.today)) return [];
  const shopName = typeof x.shopName === "string" && x.shopName.trim() ? x.shopName.trim() : "";
  return Object.entries(_o(x.periods) || {})
    .map(([id, p]) => (_o(p) ? { ...p, id: p.id || id } : null))
    .filter(p => p && !_o(p.submission))
    .filter(p => { const info = companyDeadlineInfoCF(x.company, p); return !!info && info.date === x.today; })
    .sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0))
    .map(p => ({
      periodId: p.id,
      payload: { title: NOTIFY_TITLE_CF, body: `${shopName ? shopName + "：" : ""}${periodLabelCF(p)}の企業へのシフト提出締切日です`, url: `${NOTIFY_BASE_URL_CF}#/admin`, tag: `company-deadline-${p.id}` },
    }));
}

module.exports = {
  PUSH_ENDPOINT_RE, isPushEndpointCF,
  VAPID_PUBLIC_KEY_CF, VAPID_SUBJECT_CF, NOTIFY_BASE_URL_CF, PUSH_KEY_RE_CF, NOTIFY_TITLE_CF,
  jstTodayCF, isPushRecordCF, pushTargetsOfCF, dedupeTargetsCF, pushErrorActionCF,
  resolveAliasCF, isStaffHiddenInPeriodCF, submittedNamesCF, periodLabelCF, staffRecipientsCF,
  planNewPeriodNotifyCF, deadlinePeriodsCF, planDeadlineStaffNotifyCF,
  isStaffSubmissionWriteCF, planSubmitNotifyCF,
  monthlyDeadlineForCF, companyDeadlineInfoCF, planCompanyDeadlineNotifyCF,
};
