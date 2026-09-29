// 企業の共通設定・提出期限の検証（純粋関数）。index.js から読み込む。
// firebase を読まないので、ローカルで node から直接呼んで確かめられる。
// キーと値の規則はクライアントの app-utils.js（COMPANY_LABOR_KEYS・COMPANY_LIMIT_KEYS・
// COMPANY_ATTR_ID_RE・isValidDateStr）と**同じ内容**にする（functions/ は app-utils.js を読めないため書き写している。
// 一致は tests/core.test.js が照合する）。
"use strict";
// index.js の isValidShopId と同じ規則（循環 require を避けるためここにも置く）
function isValidShopId(shopId) {
  return typeof shopId === "string" && shopId.length > 0 && !/[/.#$[\]\x00-\x1f\x7f]/.test(shopId);
}
const COMPANY_LABOR_KEYS = ["monthlyBase31Min", "fixedOvertimeMin", "marginMin", "agreementDailyOtMin",
  "agreementMonthlyOtMin", "agreementAnnualOtMin", "fiscalYearStartMonth"];
const COMPANY_LIMIT_NUM_KEYS = ["customDays", "customHours", "customHoursMin", "daily", "dailyMin", "weekly",
  "weeklyMin", "biweekly", "biweeklyMin", "monthly", "monthlyMin", "monthlyOt"];
const COMPANY_LABOR_SYSTEMS = ["A", "B", "none"];
const COMPANY_BUILTIN_ATTRS = ["employee", "parttime", "dispatch", "other"];
const COMPANY_ATTR_ID_RE = /^co_[A-Za-z0-9]{8}$/;
const PERIOD_RANGE_KEY_RE = /^\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}$/;
function isValidDateStrCF(v) {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
// 企業の共通設定を検証する。許可外のキー・範囲外の値は捨てる（拒否せず、通る部分だけを保存する）。
function sanitizeCompanySettings(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  const l = raw.laborSettings;
  if (l && typeof l === "object") {
    const lo = {};
    COMPANY_LABOR_KEYS.forEach(k => {
      const v = Number(l[k]);
      if (l[k] === undefined || l[k] === null || l[k] === "" || !Number.isFinite(v) || v < 0 || v > 1000000) return;
      if (k === "fiscalYearStartMonth" && !(v >= 1 && v <= 12)) return;
      lo[k] = Math.round(v);
    });
    if (Object.keys(lo).length) out.laborSettings = lo;
  }
  const st = raw.staffTypeLimits;
  if (st && typeof st === "object") {
    const so = {};
    Object.keys(st).slice(0, 50).forEach(id => {
      const isCo = COMPANY_ATTR_ID_RE.test(id);
      if (!isCo && !COMPANY_BUILTIN_ATTRS.includes(id)) return;
      const e = st[id];
      if (!e || typeof e !== "object") return;
      const eo = {};
      if (COMPANY_LABOR_SYSTEMS.includes(e.laborSystem)) eo.laborSystem = e.laborSystem;
      COMPANY_LIMIT_NUM_KEYS.forEach(k => {
        const v = Number(e[k]);
        if (Number.isFinite(v) && v > 0 && v <= 10000) eo[k] = v;
      });
      if (isCo) {
        const nm = typeof e.name === "string" ? e.name.trim().slice(0, 20) : "";
        if (!nm) return; // 名前の無い企業属性は属性の選択肢に出ないので保存しない
        eo.name = nm;
      }
      if (Object.keys(eo).length) so[id] = eo;
    });
    if (Object.keys(so).length) out.staffTypeLimits = so;
  }
  return out;
}
// 提出期限の差分を検証する。{[periodRangeKey]: {all?, shops?:{shopId:date}} | null}。
// null は「その期間の期限を消す」。shops のキーは連携中の店舗だけを通す。
function sanitizeCompanyDeadlines(raw, linkedShopIds) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  Object.keys(raw).slice(0, 100).forEach(rk => {
    if (!PERIOD_RANGE_KEY_RE.test(rk)) return;
    const e = raw[rk];
    if (e === null) { out[rk] = null; return; }
    if (!e || typeof e !== "object") return;
    const eo = {};
    if (isValidDateStrCF(e.all)) eo.all = e.all;
    if (e.shops && typeof e.shops === "object") {
      const so = {};
      Object.keys(e.shops).forEach(sid => {
        if (isValidShopId(sid) && linkedShopIds.includes(sid) && isValidDateStrCF(e.shops[sid])) so[sid] = e.shops[sid];
      });
      if (Object.keys(so).length) eo.shops = so;
    }
    out[rk] = Object.keys(eo).length ? eo : null;
  });
  return out;
}
// 店舗に効く期限だけを取り出す（店舗別の日付が全店共通より優先）。
function effectiveDeadlinesForShop(deadlines, shopId) {
  const out = {};
  Object.keys(deadlines || {}).forEach(rk => {
    const e = deadlines[rk] || {};
    const own = e.shops && e.shops[shopId];
    const v = isValidDateStrCF(own) ? own : (isValidDateStrCF(e.all) ? e.all : null);
    if (v) out[rk] = v;
  });
  return out;
}
// 毎月の固定締切（日だけ・1〜31・最大4件）。クライアントの sanitizeMonthlyDeadlineDays と同じ規則。
const MONTHLY_DEADLINE_MAX = 4;
function sanitizeMonthlyDeadlineDays(raw) {
  const vals = Array.isArray(raw) ? raw : (raw && typeof raw === "object" ? Object.values(raw) : []);
  const set = new Set();
  vals.forEach(v => { const n = Number(v); if (Number.isInteger(n) && n >= 1 && n <= 31) set.add(n); });
  return [...set].sort((a, b) => a - b).slice(0, MONTHLY_DEADLINE_MAX);
}

// 企業パスワードの変更を許すか（2026-09-28）。作成者本人（pub/ownerUid）のアカウントだけに許し、
// 企業コード＋パスワードでログインしたセッション（uid が "company_" で始まる）には許さない。
// コードとパスワードを共有された人が作成者を締め出せないようにするため。
const COMPANY_SESSION_UID_PREFIX = "company_";
function canChangeCompanyPassword(uid, ownerUid) {
  if (typeof uid !== "string" || !uid) return false;
  if (uid.indexOf(COMPANY_SESSION_UID_PREFIX) === 0) return false;
  return typeof ownerUid === "string" && ownerUid === uid;
}

// ============================================================
// 法人（entity）レイヤー（2026-09-30・労務給与_複数法人_実装計画.md §3.1・P1）
// 企業（管理グループ）の下に法人を置き、店舗は必ず1法人に属す。正本は companies/{id}/pub の
//   entities/{entityId}: {name, createdAt, settings?}
//   shopEntities/{shopId}: entityId        ← pub/shops（{sid:true}）の形は変えない
//   defaultEntityId                        ← 割当の無い店舗の受け皿
//   shopKinds/{shopId}: "hq"               ← 本部店舗（無ければ通常の店舗）
// 店舗は写し shops/{sid}/company だけを読むので、「企業共通 → 法人」の重ね合わせはここで焼き込む。
// クライアントの applyCompanySettings / stripCompanySettings / companyControlledKeys は変えない
// （写しの settings にキーがあれば「企業が決めた項目」として固定表示になる）。
// ============================================================
// 法人IDは CF の push().key だけから生まれる（companyId と同じ文字種）
const ENTITY_ID_RE = /^[-0-9A-Za-z_]{1,64}$/;
function isValidEntityId(id) { return typeof id === "string" && ENTITY_ID_RE.test(id); }
const SHOP_KINDS = ["shop", "hq"];
const ENTITY_NAME_MAX = 100;
function sanitizeEntityName(raw) {
  const s = typeof raw === "string" ? raw.trim() : "";
  return s && s.length <= ENTITY_NAME_MAX ? s : "";
}
function _obj(v) { return v && typeof v === "object" ? v : null; }
// 店舗の法人。割当が無い・割当先の法人が消えている店舗は既定の法人へ倒す。どれも無ければ null。
function entityIdOfShop(pub, shopId) {
  const p = _obj(pub) || {};
  const ents = _obj(p.entities) || {};
  const own = (_obj(p.shopEntities) || {})[shopId];
  if (isValidEntityId(own) && _obj(ents[own])) return own;
  const def = p.defaultEntityId;
  if (isValidEntityId(def) && _obj(ents[def])) return def;
  return null;
}
function shopKindOf(pub, shopId) {
  const k = ((_obj(pub) || {}).shopKinds || {})[shopId];
  return k === "hq" ? "hq" : "shop";
}
// 既存企業の片方向移行。足りないもの（法人・既定の法人・店舗の割当）だけをパッチで返す。何も要らなければ null。
// newId: 新しい法人IDを返す関数（CF は push().key）。法人名は企業名（無ければ「法人」）。
// 既存の pub/config.settings は動かさない＝企業共通の層のまま残り、既定の法人は設定を持たないので、
// 移行前後で写しの settings は同じになる（既存ユーザーの見た目が変わらない）。
function planEntityMigration(pub, newId, nowIso) {
  const p = _obj(pub) || {};
  const ents = _obj(p.entities) || {};
  const patch = {};
  let def = isValidEntityId(p.defaultEntityId) && _obj(ents[p.defaultEntityId]) ? p.defaultEntityId : null;
  if (!def) {
    const existing = Object.keys(ents).filter(id => isValidEntityId(id) && _obj(ents[id]));
    if (existing.length) def = existing.sort()[0];
    else {
      def = newId();
      patch[`entities/${def}`] = { name: sanitizeEntityName(p.name) || "法人", createdAt: nowIso };
    }
    patch.defaultEntityId = def;
  }
  const valid = id => isValidEntityId(id) && (_obj(ents[id]) || id === def);
  const se = _obj(p.shopEntities) || {};
  Object.keys(_obj(p.shops) || {}).filter(isValidShopId).forEach(sid => {
    if (!valid(se[sid])) patch[`shopEntities/${sid}`] = def;
  });
  return Object.keys(patch).length ? patch : null;
}
// 企業共通 → 法人 の順で重ねる。労務設定はキー単位（法人が決めたキーが勝つ）、属性別の制限は属性×キー単位。
// どちらも sanitizeCompanySettings を通した値を受け取る前提（ここでは形だけを見る）。
function mergeEntitySettings(companySettings, entitySettings) {
  const c = _obj(companySettings) || {};
  const e = _obj(entitySettings) || {};
  const out = {};
  const lab = { ...(_obj(c.laborSettings) || {}), ...(_obj(e.laborSettings) || {}) };
  if (Object.keys(lab).length) out.laborSettings = lab;
  const cs = _obj(c.staffTypeLimits) || {}, es = _obj(e.staffTypeLimits) || {};
  const ids = [...new Set([...Object.keys(cs), ...Object.keys(es)])];
  if (ids.length) {
    const stl = {};
    ids.forEach(id => { stl[id] = { ...(_obj(cs[id]) || {}), ...(_obj(es[id]) || {}) }; });
    out.staffTypeLimits = stl;
  }
  return out;
}
// 店舗の写し（shops/{sid}/company）を作る。syncCompanyMirror とテスト・E2E のスタブが同じ関数を使う。
function buildShopMirror(companyId, pub, shopId, names, nowIso) {
  const p = _obj(pub) || {};
  const cfg = _obj(p.config) || {};
  const eid = entityIdOfShop(p, shopId);
  const ent = eid ? (_obj((p.entities || {})[eid]) || {}) : {};
  const monthly = sanitizeMonthlyDeadlineDays(cfg.monthlyDeadlineDays);
  return {
    id: companyId,
    name: p.name || "",
    ...(eid ? { entityId: eid, entityName: ent.name || "" } : {}),
    kind: shopKindOf(p, shopId),
    settings: mergeEntitySettings(cfg.settings, ent.settings),
    deadlines: effectiveDeadlinesForShop(cfg.deadlines, shopId),
    // 空配列は Firebase に保存されない（ノードごと消える）ので、無いときはキーを持たない
    ...(monthly.length ? { monthlyDeadlineDays: monthly } : {}),
    shops: names || {},
    syncedAt: nowIso,
  };
}
// 店舗が別の企業に連携済みか。連携すると owners に "company_{企業ID}" が入り（registerCompanyAsOwner）、
// 写しの id にも企業IDが入る。そのどちらかで自分以外の企業が見つかれば、その企業IDを返す（無ければ null）。
// 呼び出し側は返った企業の pub/shops/{sid} を読んで、実際に連携中かを確かめてから拒否する。
function otherCompanyLinksOf(owners, mirror, companyId) {
  const out = new Set();
  Object.keys(_obj(owners) || {}).forEach(u => {
    if (u.indexOf(COMPANY_SESSION_UID_PREFIX) !== 0) return;
    const cid = u.slice(COMPANY_SESSION_UID_PREFIX.length);
    if (cid && cid !== companyId) out.add(cid);
  });
  const m = _obj(mirror);
  if (m && typeof m.id === "string" && m.id && m.id !== companyId) out.add(m.id);
  return [...out];
}

module.exports = { ENTITY_ID_RE, isValidEntityId, SHOP_KINDS, ENTITY_NAME_MAX, sanitizeEntityName, entityIdOfShop, shopKindOf,
  planEntityMigration, mergeEntitySettings, buildShopMirror, otherCompanyLinksOf,
  COMPANY_SESSION_UID_PREFIX, canChangeCompanyPassword, COMPANY_LABOR_KEYS, COMPANY_LIMIT_NUM_KEYS, COMPANY_LABOR_SYSTEMS, COMPANY_BUILTIN_ATTRS,
  COMPANY_ATTR_ID_RE, PERIOD_RANGE_KEY_RE, isValidDateStrCF, sanitizeCompanySettings, sanitizeCompanyDeadlines,
  effectiveDeadlinesForShop, MONTHLY_DEADLINE_MAX, sanitizeMonthlyDeadlineDays };
