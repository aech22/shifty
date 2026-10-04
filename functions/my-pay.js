"use strict";
// ============================================================
// 従業員画面: 会社が登録した本人の賃金の参照（2026-10-04・Shifty_実装計画_2026-10.md 第2部 E6・CF getMyPay）
// ============================================================
// 純粋関数だけを置く（index.js と E2E のスタブ・tests/my.test.js が同じ関数を通す）。
// 返すのは「呼び出し元 uid が紐付いている店舗の、その紐付けの名前の shops/{sid}/private/pay/{名前}」だけ。
// 名前は呼び出し元からは受け取らない（staffLinks/{uid}.name が正本）＝他人の賃金はこの関数の入口では指定できない。
// 版の形は app-utils.js の normalizePayVersion と**同じ規則**（tests/my.test.js が一致を照合する）。updatedAt は返さない。
// 最低賃金・割増率・端数規則（法人設定 wageSettings）は返さない: 写し shops/{sid}/company/settings は auth != null で読めるので
// クライアントが直接読む。閲覧パスコードは求めない（本人の分だけを返すため・計画書「確認したい点」5番）。

const _obj = v => (v && typeof v === "object" ? v : null);
const PAY_TYPES_CF = ["monthly", "hourly"];
const MY_PAY_HISTORY_MAX_CF = 50;
function _payIntCF(v) { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0; }
function _payArrCF(v) { return Array.isArray(v) ? v.filter(x => x != null) : (v && typeof v === "object" ? Object.values(v).filter(x => x != null) : []); }
const _DATE_RE_CF = /^\d{4}-\d{2}-\d{2}$/;
function _isDateCF(s) {
  if (typeof s !== "string" || !_DATE_RE_CF.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
// app-utils.js の normalizePayVersion と同じ（賃金の1版・history を除く）
function payVersionCF(v) {
  const p = _obj(v) || {};
  const payType = PAY_TYPES_CF.includes(p.payType) ? p.payType : "monthly";
  const out = { payType, base: _payIntCF(p.base), effectiveFrom: _isDateCF(p.effectiveFrom) ? p.effectiveFrom : "" };
  const cm = _obj(p.commute) || {};
  out.commute = { amount: _payIntCF(cm.amount), per: cm.per === "day" ? "day" : "month" };
  if (payType === "monthly") {
    out.allowances = _payArrCF(p.allowances).filter(a => a && typeof a === "object").map(a => ({
      name: String(a.name || "").slice(0, 30), amount: _payIntCF(a.amount), excludeFromRate: !!a.excludeFromRate, excludeFromDeduction: !!a.excludeFromDeduction,
    })).filter(a => a.name || a.amount);
    const fo = _obj(p.fixedOt) || {};
    const hours = Math.max(0, Math.round((Number(fo.hours) || 0) * 100) / 100);
    out.fixedOt = { hours, auto: fo.auto !== false, amount: _payIntCF(fo.amount) };
    const fn = _obj(p.fixedNight) || {};
    out.fixedNight = { hours: Math.max(0, Math.round((Number(fn.hours) || 0) * 100) / 100), amount: _payIntCF(fn.amount) };
  }
  return out;
}
// private/pay/{名前} の1人分 → 返す形（いまの版＋過去の版）。記録が無い・壊れていれば null
function myPayRecordCF(rec) {
  const r = _obj(rec);
  if (!r || !PAY_TYPES_CF.includes(r.payType)) return null;
  const out = payVersionCF(r);
  const hist = _payArrCF(r.history).filter(h => _obj(h) && PAY_TYPES_CF.includes(h.payType)).map(payVersionCF)
    .sort((a, b) => String(a.effectiveFrom).localeCompare(String(b.effectiveFrom))).slice(-MY_PAY_HISTORY_MAX_CF);
  if (hist.length) out.history = hist;
  return out;
}
const err = (code, msg) => ({ error: { code, msg } });
function _staffNamesCF(staff) {
  return (Array.isArray(staff) ? staff : Object.values(_obj(staff) || {})).filter(n => typeof n === "string" && n && !n.startsWith("__spacer__"));
}
// 1段目（private/pay を読む前）: 呼び出し元がメールのあるスタッフアカウントで、この店舗に紐付いているか。戻り値 {name} | {error}
function myPayLinkNameCF(o) {
  const x = _obj(o) || {};
  if (!x.email) return err("failed-precondition", "マイシフトのアカウントにログインしてから使ってください");
  const sl = _obj(x.staffLink);
  const name = sl && typeof sl.name === "string" ? sl.name : "";
  if (!name) return err("permission-denied", "このお店とリンクされていません");
  return { name };
}
// 2段目: 紐付けの名前がいまのスタッフ一覧にあるか確かめ、返す値を作る。
// o={shopId, name, staff, payRec, homeShopId（settings.staffHomeShop[名前]）, homeShopName}
// 賃金の記録が無く、所属店舗が別の店舗なら homeShopId を返す（ヘルプ先だけの紐付け。賃金は所属店舗に置かれる・P6a）
function planGetMyPay(o) {
  const x = _obj(o) || {};
  if (!_staffNamesCF(x.staff).includes(x.name)) return err("failed-precondition", "お店のスタッフ一覧にこの名前がありません（名前の変更か削除）");
  const pay = myPayRecordCF(x.payRec);
  const res = { ok: true, name: x.name, pay };
  if (!pay && typeof x.homeShopId === "string" && x.homeShopId && x.homeShopId !== x.shopId) {
    res.homeShopId = x.homeShopId;
    if (typeof x.homeShopName === "string" && x.homeShopName) res.homeShopName = x.homeShopName.slice(0, 100);
  }
  return { result: res };
}

module.exports = { PAY_TYPES_CF, MY_PAY_HISTORY_MAX_CF, payVersionCF, myPayRecordCF, myPayLinkNameCF, planGetMyPay };
