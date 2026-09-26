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
  "weeklyMin", "biweekly", "biweeklyMin", "monthly", "monthlyMin"];
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

module.exports = { COMPANY_LABOR_KEYS, COMPANY_LIMIT_NUM_KEYS, COMPANY_LABOR_SYSTEMS, COMPANY_BUILTIN_ATTRS,
  COMPANY_ATTR_ID_RE, PERIOD_RANGE_KEY_RE, isValidDateStrCF, sanitizeCompanySettings, sanitizeCompanyDeadlines,
  effectiveDeadlinesForShop };
