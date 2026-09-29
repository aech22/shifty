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
  "agreementMonthlyOtMin", "agreementAnnualOtMin", "fiscalYearStartMonth",
  "annualScheduledMin", "rateDenominatorMin", "weekStartDow", "weekSplitAtMonthEdge",
  "showDailyOverB", "dailyOverThresholdMin", "highlightExternalOver8h", "externalOverThresholdMin"];
// 範囲の決まっているキー（クライアントの LABOR_SETTING_RANGES と同じ。tests/core.test.js が照合する）
const COMPANY_LABOR_RANGES = { fiscalYearStartMonth: [1, 12], weekStartDow: [0, 6], weekSplitAtMonthEdge: [0, 1], showDailyOverB: [0, 1], highlightExternalOver8h: [0, 1] };
const COMPANY_LIMIT_NUM_KEYS = ["customDays", "customHours", "customHoursMin", "daily", "dailyMin", "weekly",
  "weeklyMin", "biweekly", "biweeklyMin", "monthly", "monthlyMin", "monthlyOt"];
const COMPANY_LABOR_SYSTEMS = ["A", "B", "none"];
// 残業予定の按分窓（P3.5b）。クライアントの otProrateOf（app-utils.js）と同じ規則（tests/core.test.js が照合する）
const COMPANY_OT_PRORATE_WINDOWS = ["month", "halfMonth"];
const COMPANY_OT_PRORATE_FIXED_MAX_MIN = 744 * 60;
function sanitizeOtProrate(raw) {
  if (!raw || typeof raw !== "object" || !COMPANY_OT_PRORATE_WINDOWS.includes(raw.window)) return null;
  const o = { window: raw.window };
  const f = Number(raw.fixedMin);
  if (Number.isFinite(f) && f > 0 && f <= COMPANY_OT_PRORATE_FIXED_MAX_MIN) o.fixedMin = Math.round(f);
  return o;
}
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
      const r = COMPANY_LABOR_RANGES[k];
      if (r && !(v >= r[0] && v <= r[1])) return;
      if (r && k !== "fiscalYearStartMonth" && !Number.isInteger(v)) return;
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
      const op = sanitizeOtProrate(e.otProrate);
      if (op) eo.otProrate = op;
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
  const w = sanitizeWageSettings(raw.wageSettings);
  if (Object.keys(w).length) out.wageSettings = w;
  return out;
}
// 賃金の法人設定（2026-09-30・P6a）。いまは最低賃金の履歴 minWage=[{from,yen}] だけ。
// クライアントの sanitizeWageSettings（app-utils.js）と**同じ規則**（tests/core.test.js が照合する）。
const MIN_WAGE_MAX_ENTRIES = 20;
function sanitizeWageSettings(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  const src = Array.isArray(raw.minWage) ? raw.minWage : (raw.minWage && typeof raw.minWage === "object" ? Object.values(raw.minWage) : []);
  const byFrom = {};
  src.forEach(e => {
    if (!e || typeof e !== "object" || !isValidDateStrCF(e.from)) return;
    const y = Number(e.yen);
    if (!Number.isInteger(y) || y < 1 || y > 100000) return;
    byFrom[e.from] = y;
  });
  const mw = Object.keys(byFrom).sort().slice(-MIN_WAGE_MAX_ENTRIES).map(from => ({ from, yen: byFrom[from] }));
  if (mw.length) out.minWage = mw;
  return out;
}
// 賃金の閲覧パスコード（2026-09-30・P6a）。4桁の数字。hash = SHA-256(salt + code) の16進で、
// クライアントの payCodeHash（app-utils.js・Web Crypto）と同じ値になる（tests/core.test.js が照合する）。
// crypto は呼んだときにだけ読む（このファイルは E2E のスタブでブラウザにも埋め込まれるため）。
const PAY_CODE_DEFAULT = "0000";
function isValidPayCodeCF(c) { return typeof c === "string" && /^\d{4}$/.test(c); }
function payCodeHashCF(salt, code) {
  return require("crypto").createHash("sha256").update(String(salt || "") + String(code || ""), "utf8").digest("hex");
}
function isPayCodeRecordCF(rec) {
  return !!rec && typeof rec === "object" && typeof rec.hash === "string" && /^[0-9a-f]{64}$/.test(rec.hash) && typeof rec.salt === "string";
}
// 現在のパスコードの照合。記録が無ければ初期値 0000 を受け付ける
function verifyPayCodeCF(code, rec) {
  if (!isValidPayCodeCF(code)) return false;
  if (!isPayCodeRecordCF(rec)) return code === PAY_CODE_DEFAULT;
  const h = payCodeHashCF(rec.salt, code);
  const a = Buffer.from(h, "hex"), b = Buffer.from(rec.hash, "hex");
  return a.length === b.length && require("crypto").timingSafeEqual(a, b);
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
  // 賃金の法人設定はキー単位（最低賃金の履歴は丸ごと）。法人が持てば法人が勝つ
  const wage = { ...(_obj(c.wageSettings) || {}), ...(_obj(e.wageSettings) || {}) };
  if (Object.keys(wage).length) out.wageSettings = wage;
  return out;
}
// 写しに焼く人物（P3.6）。{personId: {shopId: 登録名}} を連携店舗ぶんだけ。人物の正本 companies/{id}/pub/people は
// 企業コードのログインと作成者しか読めないので、店長のセッション（店舗の管理者）がヘルプ先の勤務を所属店舗へ合算する
// ときの同一人物の判定はこの写しを読む。1店舗にしか登録の無い人物も載せる——「別の人物に載っている＝別人」を
// 店舗側が判定するのに要る（同姓同名を束ねない）。
function mirrorPeopleOf(pub) {
  const p = _obj(pub) || {};
  const linked = new Set(Object.keys(_obj(p.shops) || {}).filter(isValidShopId));
  const out = {};
  Object.keys(_obj(p.people) || {}).forEach(id => {
    if (!isValidPersonId(id)) return;
    const l = _obj((_obj(p.people[id]) || {}).links) || {};
    const m = {};
    Object.keys(l).forEach(sid => { if (linked.has(sid) && typeof l[sid] === "string" && l[sid]) m[sid] = l[sid]; });
    if (Object.keys(m).length) out[id] = m;
  });
  return out;
}
// 連携店舗それぞれの法人（P3.6）。ヘルプ先の合算を同じ法人の中に絞るのに使う（法人の無い企業では空）
function mirrorShopEntitiesOf(pub) {
  const p = _obj(pub) || {};
  const out = {};
  Object.keys(_obj(p.shops) || {}).filter(isValidShopId).forEach(sid => {
    const e = entityIdOfShop(p, sid);
    if (e) out[sid] = e;
  });
  return out;
}
// 店舗の写し（shops/{sid}/company）を作る。syncCompanyMirror とテスト・E2E のスタブが同じ関数を使う。
function buildShopMirror(companyId, pub, shopId, names, nowIso) {
  const p = _obj(pub) || {};
  const cfg = _obj(p.config) || {};
  const eid = entityIdOfShop(p, shopId);
  const ent = eid ? (_obj((p.entities || {})[eid]) || {}) : {};
  const monthly = sanitizeMonthlyDeadlineDays(cfg.monthlyDeadlineDays);
  const people = mirrorPeopleOf(p);
  const shopEntities = mirrorShopEntitiesOf(p);
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
    // 空のマップは Firebase に保存されない（ノードごと消える）ので、無いときはキーを持たない
    ...(Object.keys(people).length ? { people } : {}),
    ...(Object.keys(shopEntities).length ? { shopEntities } : {}),
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

// ============================================================
// 人物ID（personId）と企業スタッフ一覧の編集（2026-09-30・労務給与_複数法人_実装計画.md §3.8・P1b）
// 正本は companies/{id}/pub/people/{personId} = {displayName, entityId?, number?, links:{shopId: 登録名}, createdAt, updatedAt, mergedFrom?}
// 書くのは CF だけ（companies/* は .write:false）。店舗側の名前キーは変えない（企業レベルの上乗せ）。
// 規則のうちクライアントにもあるもの（同一人物の推定・改名の後始末）は app-utils.js と**同じ内容**にし、
// tests/core.test.js が一致を照合する（functions/ は app-utils.js を読めないため書き写している）。
// ============================================================
// personId は「数字だけの従業員番号（1〜20桁）」か「p_ + 英数字8桁」。どちらも Firebase のキー禁止文字を含まない。
const PERSON_ID_RE = /^(\d{1,20}|p_[A-Za-z0-9]{8})$/;
function isValidPersonId(id) { return typeof id === "string" && PERSON_ID_RE.test(id); }
// 自動採番の文字集合。**genSecureId（記号を含む）を使わない**——記号はキー禁止文字ではなくても
// PERSON_ID_RE を通らず、検証で捨てられる（genCompanyAttrId と同じ理由）。
const PERSON_AUTO_ID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
// randBytes(n): 0〜255 の整数 n 個を返す関数（CF は crypto.randomBytes、テストは決まった列）
function genPersonAutoId(randBytes) {
  const b = randBytes(8);
  let t = "";
  for (let i = 0; i < 8; i++) t += PERSON_AUTO_ID_CHARS[b[i] % PERSON_AUTO_ID_CHARS.length];
  return "p_" + t;
}
// 数字だけの番号ならその番号、それ以外（数字以外を含む・未設定・既に使われている）は自動採番（決定 #13）。
// 既に使われている＝企業内の別法人に同じ番号の人がいる（番号は法人内で一意なので、同じ法人では推定がまとめている）。
function personIdFor(number, takenIds, genAuto) {
  const taken = takenIds instanceof Set ? takenIds : new Set(takenIds || []);
  const n = String(number == null ? "" : number).trim();
  if (/^\d{1,20}$/.test(n) && !taken.has(n)) return n;
  for (let i = 0; i < 100; i++) {
    const id = genAuto();
    if (isValidPersonId(id) && !taken.has(id)) return id;
  }
  throw new Error("personId を採番できませんでした");
}
// 従業員番号の検証（空＝番号なし）。キーにはならないが、表示と Excel に出るので長さと制御文字だけ弾く
const STAFF_NUMBER_MAX = 20;
function sanitizeStaffNumber(raw) {
  const s = String(raw == null ? "" : raw).trim();
  if (s.length > STAFF_NUMBER_MAX || /[\x00-\x1f\x7f]/.test(s)) return null;
  return s;
}
function _staffNameLenCF(n) { return String(n || "").replace(/[\s　]/g, "").length; }
// 企業内の同一人物の推定（app-utils.js の groupStaffRegs と同じ規則）。regs: [{shopId, name, entityId, number, homeShopId}]
// ① 同じ法人で、数字だけの同じ従業員番号 ② ヘルプ先の登録（所属店舗側に同名がいる）を同じ人とみなす。
// 戻り値: 同じ人の regs の添字の配列の配列（先頭の添字の昇順）
function groupStaffRegsCF(regs) {
  const list = regs || [];
  const parent = list.map((_, i) => i);
  const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb); };
  const byNumber = new Map(), byShopName = new Map();
  list.forEach((r, i) => {
    byShopName.set(r.shopId + "\u0000" + r.name, i);
    const num = String(r.number == null ? "" : r.number).trim();
    if (!/^\d+$/.test(num)) return;
    const nk = (r.entityId || "") + "\u0000" + num;
    if (byNumber.has(nk)) union(byNumber.get(nk), i); else byNumber.set(nk, i);
  });
  list.forEach((r, i) => {
    const home = r.homeShopId || r.shopId;
    if (home === r.shopId) return;
    const j = byShopName.get(home + "\u0000" + r.name);
    if (j != null) union(i, j);
  });
  const groups = new Map();
  list.forEach((_, i) => { const k = find(i); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i); });
  return [...groups.values()];
}
function _personObj(p) { return p && typeof p === "object" ? p : null; }
function _linksOf(p) { const l = (_personObj(p) || {}).links; return l && typeof l === "object" ? l : {}; }
// 表示名は、つながっている登録名のうち空白を除いて最も長い表記（buildCompanyStaffRows と同じ＝フルネームに寄せる）
function personDisplayName(names) {
  let best = "";
  (names || []).forEach(n => { if (typeof n === "string" && _staffNameLenCF(n) > _staffNameLenCF(best)) best = n; });
  return best;
}
// 人物の代表の登録（所属店舗に登録されている方を優先）から、法人と番号を決める
function _personSeed(regsOfGroup) {
  const atHome = regsOfGroup.filter(r => (r.homeShopId || r.shopId) === r.shopId);
  const ordered = [...(atHome.length ? atHome : regsOfGroup), ...regsOfGroup];
  const base = ordered[0];
  const numReg = ordered.find(r => String(r.number || "").trim());
  return { entityId: base.entityId || "", number: numReg ? String(numReg.number).trim() : "" };
}
// 人物の同期（CF ensureCompanyPeople）。保存済みの people が正で、まだどの人物にもつながっていない登録名
// （未リンク）だけを推定で拾う:
//   - 推定で同じ人とされた登録のうち、既につながっている人物が1人だけならそこへ足す
//     （その人物がその店舗に別の生きた登録名を持っていれば足さず、新しい人物にする＝1店舗1名前）
//   - つながっている人物がいなければ、同じ法人・同じ番号でその店舗の登録名が消えている（店舗側で改名された）人物へ戻す
//   - それ以外は新しい人物を作る（ID は personIdFor）
// つながっている人物が2人以上（統合解除で分けた等）のときは勝手にまとめず、新しい人物にする。
// 戻り値: people ノードへの update 用のパッチ（無ければ null）と、作った人物の ID
function planPeopleSync(people, regs, genAuto, nowIso) {
  const P = {};
  Object.keys(_personObj(people) || {}).forEach(id => { if (isValidPersonId(id) && _personObj(people[id])) P[id] = people[id]; });
  const list = regs || [];
  const key = (sid, n) => sid + "\u0000" + n;
  const live = new Set(list.map(r => key(r.shopId, r.name)));
  const ownerOf = new Map();
  Object.keys(P).forEach(id => {
    const l = _linksOf(P[id]);
    Object.keys(l).forEach(sid => { if (live.has(key(sid, l[sid])) && !ownerOf.has(key(sid, l[sid]))) ownerOf.set(key(sid, l[sid]), id); });
  });
  const unlinked = new Set(list.map((r, i) => ownerOf.has(key(r.shopId, r.name)) ? -1 : i).filter(i => i >= 0));
  if (!unlinked.size) return { patch: null, created: [] };
  const patch = {};
  const taken = new Set(Object.keys(P));
  const created = [];
  const links = {}; // 人物ID → この同期で決まった links（既存＋追加）
  const linksOf = id => { if (!links[id]) links[id] = { ..._linksOf(P[id]) }; return links[id]; };
  const newPerson = idxs => {
    const rs = idxs.map(i => list[i]);
    const seed = _personSeed(rs);
    const id = personIdFor(seed.number, taken, genAuto);
    taken.add(id); created.push(id);
    const l = {};
    rs.forEach(r => { if (l[r.shopId] === undefined) l[r.shopId] = r.name; });
    const rec = { displayName: personDisplayName(Object.values(l)), links: l, createdAt: nowIso, updatedAt: nowIso };
    if (seed.entityId) rec.entityId = seed.entityId;
    if (seed.number) rec.number = seed.number;
    patch[id] = rec;
    // 同じ店舗に2つ目の登録名があれば、それぞれ別の人物にする（1店舗1名前）
    const extra = rs.filter(r => l[r.shopId] !== r.name);
    extra.forEach(r => newPerson([list.indexOf(r)]));
  };
  groupStaffRegsCF(list).forEach(group => {
    const un = group.filter(i => unlinked.has(i));
    if (!un.length) return;
    const persons = [...new Set(group.map(i => ownerOf.get(key(list[i].shopId, list[i].name))).filter(Boolean))];
    let target = persons.length === 1 ? persons[0] : null;
    if (!target && persons.length === 0) {
      const r0 = list[un[0]];
      const num = String(r0.number || "").trim();
      if (num) {
        const cand = Object.keys(P).filter(id => {
          const p = P[id];
          if (String(p.number || "") !== num || (p.entityId || "") !== (r0.entityId || "")) return false;
          const l = _linksOf(p);
          return un.some(i => { const s = l[list[i].shopId]; return typeof s === "string" && !live.has(key(list[i].shopId, s)); });
        });
        if (cand.length === 1) target = cand[0];
      }
    }
    if (!target) { newPerson(un); return; }
    const l = linksOf(target);
    const rest = [];
    un.forEach(i => {
      const r = list[i];
      const cur = l[r.shopId];
      if (typeof cur === "string" && cur !== r.name && live.has(key(r.shopId, cur))) { rest.push(i); return; }
      l[r.shopId] = r.name;
      patch[`${target}/links/${r.shopId}`] = r.name;
    });
    patch[`${target}/displayName`] = personDisplayName(Object.keys(l).filter(sid => live.has(key(sid, l[sid]))).map(sid => l[sid]));
    patch[`${target}/updatedAt`] = nowIso;
    rest.forEach(i => newPerson([i]));
  });
  return { patch: Object.keys(patch).length ? patch : null, created };
}
// その法人でその番号を既に使っている人物（自分以外）。保存済みの人物の番号と、店舗の登録の番号
// （regs・自分につながっていない登録）の両方を見る。見つかれば {personId?, shopId?, name?}、無ければ null
function staffNumberConflict(people, regs, entityId, number, selfPersonId) {
  const n = String(number == null ? "" : number).trim();
  if (!n) return null;
  const e = entityId || "";
  const P = _personObj(people) || {};
  for (const id of Object.keys(P)) {
    if (id === selfPersonId || !_personObj(P[id])) continue;
    if (String(P[id].number || "").trim() === n && (P[id].entityId || "") === e) return { personId: id };
  }
  const own = _linksOf(P[selfPersonId]);
  for (const r of regs || []) {
    if ((r.entityId || "") !== e || String(r.number || "").trim() !== n) continue;
    if (own[r.shopId] === r.name) continue;
    return { shopId: r.shopId, name: r.name };
  }
  return null;
}
// 統合: keepId の番号・法人を残し、dropId の links を合流して dropId を消す（店舗側のデータは動かさない）。
// 同じ店舗に別の登録名があるときは統合できない（1店舗1名前）。戻り値 {patch} か {error}
function planMergePeople(people, keepId, dropId, nowIso) {
  const P = _personObj(people) || {};
  if (!isValidPersonId(keepId) || !isValidPersonId(dropId) || keepId === dropId) return { error: "統合する2人を選んでください" };
  const k = _personObj(P[keepId]), d = _personObj(P[dropId]);
  if (!k || !d) return { error: "人物が見つかりません" };
  const lk = _linksOf(k), ld = _linksOf(d);
  const merged = { ...lk };
  for (const sid of Object.keys(ld)) {
    if (merged[sid] !== undefined && merged[sid] !== ld[sid]) return { error: "同じ店舗に別の登録名があるため統合できません" };
    merged[sid] = ld[sid];
  }
  return { patch: {
    [`${keepId}/links`]: merged,
    [`${keepId}/displayName`]: personDisplayName(Object.values(merged)),
    [`${keepId}/mergedFrom/${dropId}`]: nowIso,
    [`${keepId}/updatedAt`]: nowIso,
    [dropId]: null,
  } };
}
// 統合解除: personId から shopId の登録を切り出して新しい人物にする。reg はその登録（{shopId,name,entityId,number}）。
// 新しい人物の番号は店舗の番号。ただし元の人物と同じ法人で同じ番号なら持たせない（番号は法人内で一意）。
function planSplitPerson(people, personId, reg, genAuto, nowIso) {
  const P = _personObj(people) || {};
  const p = _personObj(P[personId]);
  if (!p) return { error: "人物が見つかりません" };
  const l = _linksOf(p);
  if (!reg || l[reg.shopId] !== reg.name) return { error: "この人物につながっていない登録です" };
  if (Object.keys(l).length < 2) return { error: "登録が1つだけの人物は切り出せません" };
  let num = String(reg.number || "").trim();
  if (num && num === String(p.number || "").trim() && (reg.entityId || "") === (p.entityId || "")) num = "";
  const id = personIdFor(num, new Set(Object.keys(P)), genAuto);
  const rest = { ...l }; delete rest[reg.shopId];
  const rec = { displayName: reg.name, links: { [reg.shopId]: reg.name }, createdAt: nowIso, updatedAt: nowIso };
  if (reg.entityId) rec.entityId = reg.entityId;
  if (num) rec.number = num;
  return { newId: id, patch: {
    [id]: rec,
    [`${personId}/links/${reg.shopId}`]: null,
    [`${personId}/displayName`]: personDisplayName(Object.values(rest)),
    [`${personId}/updatedAt`]: nowIso,
  } };
}
// ID を番号に振り直す（明示操作のみ）。番号が数字だけで、その ID がまだ使われていないときだけ。
// 今は人物を参照するノードが people の中だけなので移すのはこの1件（P3 以降で laborMonths 等を足す担当が付け替えを足す）
function planReassignPersonId(people, personId) {
  const P = _personObj(people) || {};
  const p = _personObj(P[personId]);
  if (!p) return { error: "人物が見つかりません" };
  const n = String(p.number || "").trim();
  if (!/^\d{1,20}$/.test(n)) return { error: "従業員番号が数字だけのときに振り直せます" };
  if (n === personId) return { error: "既に番号と同じIDです" };
  if (P[n]) return { error: `ID ${n} は既に別の人物が使っています` };
  return { newId: n, patch: { [n]: { ...p, updatedAt: p.updatedAt }, [personId]: null } };
}

// ---- 改名の後始末（CF companyRenameStaff）。app-utils.js の renameStaffInSettings / renameStaffInPeriods /
// renameStaffInPay と同じ規則を、update 用の差分パッチで返す（settings も periods も全体 set() しない）。
// 名前キーのノードを足したら、ここと app-utils.js の両方に足す（テストが照合する）。
// P3 の laborMonths は renameStaffLaborMonthsPatch、P4 の actuals は renameStaffActualsPatch で移す。
const STAFF_KEYED_SETTING_MAPS_CF = ["staffColors", "staffAttributes", "staffNumbers", "staffPositions", "staffAliases", "staffWorkplaces", "staffHidden", "paidLeaveGranted", "staffHomeShop"];
const STAFF_KEYED_PRIVATE_NODES_CF = ["pay"];
// 月キー付きの名前ノード（shops/{sid}/laborMonths/{YYYY-MM}/{名前}・P3）。app-utils.js の STAFF_KEYED_MONTH_NODES と一致（テストが照合する）
const STAFF_KEYED_MONTH_NODES_CF = ["laborMonths"];
// 期間キー付きの名前ノード（shops/{sid}/actuals/{期間ID}/{名前}・P4）。app-utils.js の STAFF_KEYED_PERIOD_NODES と一致（テストが照合する）
const STAFF_KEYED_PERIOD_NODES_CF = ["actuals"];
const STAFF_NAME_FORBIDDEN_RE = /[.#$\/[\]\u0000-\u001F\u007F]/;
// 改名の検証（StaffTab の confirmEdit と同じ規則）。問題が無ければ null、あれば理由
function validateStaffRename(staff, settings, oldName, newName) {
  const list = (Array.isArray(staff) ? staff : Object.values(staff || {})).filter(n => typeof n === "string");
  const nn = String(newName || "").trim();
  if (!list.includes(oldName)) return "この店舗に登録されていない名前です";
  if (!nn) return "名前を入力してください";
  if (nn === oldName) return "名前が変わっていません";
  if (list.includes(nn)) return "既に登録されている名前です";
  if (STAFF_NAME_FORBIDDEN_RE.test(nn)) return "名前に使えない文字があります（. # $ / [ ] と制御文字）";
  const al = (_personObj(settings) || {}).staffAliases || {};
  for (const reg of Object.keys(al)) {
    if (reg === oldName) continue;
    const a = al[reg];
    const arr = Array.isArray(a) ? a : (a && typeof a === "object" ? Object.values(a) : []);
    if (arr.some(x => String(x || "").trim() === nn)) return `「${nn}」は ${reg} さんの別名として登録されています`;
  }
  return null;
}
function renameStaffListCF(staff, oldName, newName) {
  const list = Array.isArray(staff) ? staff : Object.values(staff || {});
  return list.map(n => n === oldName ? newName : n);
}
function _renameMapKeyCF(map, oldName, newName) {
  const m = { ...(map || {}) };
  if (m[oldName] === undefined) return m;
  m[newName] = m[oldName]; delete m[oldName];
  return m;
}
function _hasStaffKeyCF(settings, name) {
  const st = settings || {};
  if (STAFF_KEYED_SETTING_MAPS_CF.some(k => st[k] && st[k][name] !== undefined)) return true;
  return !!(st.overtimeSettings && st.overtimeSettings.byStaff && st.overtimeSettings.byStaff[name] !== undefined);
}
// settings の差分（shops/{sid}/settings への update 用）。元から無いキーは作らない
function renameStaffSettingsPatch(settings, oldName, newName) {
  const st = _personObj(settings) || {};
  const out = {};
  STAFF_KEYED_SETTING_MAPS_CF.forEach(k => {
    const m = st[k];
    if (m && typeof m === "object" && m[oldName] !== undefined) { out[`${k}/${newName}`] = m[oldName]; out[`${k}/${oldName}`] = null; }
  });
  const bs = st.overtimeSettings && st.overtimeSettings.byStaff;
  if (bs && typeof bs === "object" && bs[oldName] !== undefined) {
    out[`overtimeSettings/byStaff/${newName}`] = bs[oldName]; out[`overtimeSettings/byStaff/${oldName}`] = null;
  }
  return out;
}
function _renameSettingsWholeCF(settings, oldName, newName) {
  const out = { ...(settings || {}) };
  STAFF_KEYED_SETTING_MAPS_CF.forEach(k => { if (out[k] !== undefined) out[k] = _renameMapKeyCF(out[k], oldName, newName); });
  if (out.overtimeSettings && out.overtimeSettings.byStaff)
    out.overtimeSettings = { ...out.overtimeSettings, byStaff: _renameMapKeyCF(out.overtimeSettings.byStaff, oldName, newName) };
  return out;
}
function _renameKeepStaffCF(raw, oldName, newName) {
  const list = Array.isArray(raw) ? raw : (raw && typeof raw === "object" ? Object.values(raw) : null);
  if (!list || !list.length) return null;
  const nameOf = e => typeof e === "string" ? e : (e && typeof e === "object" && typeof e.name === "string" ? e.name : null);
  if (!list.some(e => nameOf(e) === oldName)) return null;
  const hasNew = list.some(e => nameOf(e) === newName);
  const out = [];
  list.forEach(e => {
    if (nameOf(e) !== oldName) { out.push(e); return; }
    if (hasNew) return;
    out.push(typeof e === "string" ? newName : { ...e, name: newName });
  });
  return out;
}
function _keepAttrsOfCF(period) {
  const raw = period && period.keepAttrs;
  if (!raw || typeof raw !== "object") return null;
  const out = {};
  Object.keys(raw).forEach(k => { if (typeof raw[k] === "string" && raw[k]) out[k] = raw[k]; });
  return Object.keys(out).length ? out : null;
}
// periods の差分（shops/{sid}/periods への update 用・期間のフィールド単位）。全体 set() しない（CLAUDE.md の書き込み規則）
function renameStaffPeriodsPatch(periods, oldName, newName) {
  const out = {};
  const obj = Array.isArray(periods) ? Object.fromEntries(periods.map((p, i) => [(p && p.id) || String(i), p])) : (_personObj(periods) || {});
  Object.keys(obj).forEach(pk => {
    const p = obj[pk];
    if (!p || typeof p !== "object") return;
    const ks = _renameKeepStaffCF(p.keepStaff, oldName, newName);
    if (ks) out[`${pk}/keepStaff`] = ks;
    const ka = _keepAttrsOfCF(p);
    if (ka && ka[oldName] !== undefined) out[`${pk}/keepAttrs`] = _renameMapKeyCF(ka, oldName, newName);
    const lt = p.laborTotals;
    if (lt && typeof lt === "object" && lt[oldName] !== undefined) out[`${pk}/laborTotals`] = _renameMapKeyCF(lt, oldName, newName);
    const snap = p.snapshot;
    if (!snap) return;
    const rawSl = snap.staffList;
    const sl = Array.isArray(rawSl) ? rawSl : (rawSl && typeof rawSl === "object" ? Object.values(rawSl) : null);
    if (!sl) return;
    if (!sl.includes(oldName) && !_hasStaffKeyCF(snap.settings, oldName)) return;
    out[`${pk}/snapshot`] = { ...snap, staffList: sl.map(n => n === oldName ? newName : n), settings: _renameSettingsWholeCF(snap.settings, oldName, newName) };
  });
  return out;
}
// private/pay の差分（app-utils.js の renameStaffInPay と同じ）。移すものが無ければ null
function renameStaffPayPatch(payMap, oldName, newName) {
  const m = payMap && typeof payMap === "object" ? payMap : {};
  if (!oldName || !newName || oldName === newName || m[oldName] == null) return null;
  return { [newName]: m[oldName], [oldName]: null };
}
// laborMonths の差分（app-utils.js の renameStaffInLaborMonths と同じ）。月ごとに旧名のキーを新名へ移す。移すものが無ければ null
function renameStaffLaborMonthsPatch(laborMonths, oldName, newName) {
  const lm = _personObj(laborMonths) || {};
  if (!oldName || !newName || oldName === newName) return null;
  const out = {};
  Object.keys(lm).forEach(ym => {
    const m = lm[ym];
    if (m && typeof m === "object" && !Array.isArray(m) && m[oldName] != null) { out[`${ym}/${newName}`] = m[oldName]; out[`${ym}/${oldName}`] = null; }
  });
  return Object.keys(out).length ? out : null;
}
// actuals の差分（app-utils.js の renameStaffInActuals と同じ）。期間ごとに旧名のキーを新名へ移す。移すものが無ければ null
function renameStaffActualsPatch(actuals, oldName, newName) {
  const ac = _personObj(actuals) || {};
  if (!oldName || !newName || oldName === newName) return null;
  const out = {};
  Object.keys(ac).forEach(pid => {
    const m = ac[pid];
    if (m && typeof m === "object" && !Array.isArray(m) && m[oldName] != null) { out[`${pid}/${newName}`] = m[oldName]; out[`${pid}/${oldName}`] = null; }
  });
  return Object.keys(out).length ? out : null;
}
// subs の差分（shops/{sid}/subs への update 用）。3ヶ月の購読窓の外の期間も含めて全件を移す
// （StaffTab の改名は読み込み済みの subs しか直せないが、CF は全件を読める）
function renameStaffSubsPatch(subs, oldName, newName) {
  const out = {};
  Object.keys(_personObj(subs) || {}).forEach(id => {
    const s = subs[id];
    if (s && typeof s === "object" && s.staffName === oldName) out[`${id}/staffName`] = newName;
  });
  return out;
}

module.exports = { PERSON_ID_RE, isValidPersonId, PERSON_AUTO_ID_CHARS, genPersonAutoId, personIdFor, STAFF_NUMBER_MAX, sanitizeStaffNumber,
  groupStaffRegsCF, personDisplayName, planPeopleSync, staffNumberConflict, planMergePeople, planSplitPerson, planReassignPersonId,
  STAFF_KEYED_SETTING_MAPS_CF, STAFF_KEYED_PRIVATE_NODES_CF, STAFF_KEYED_MONTH_NODES_CF, STAFF_KEYED_PERIOD_NODES_CF, validateStaffRename, renameStaffListCF, renameStaffSettingsPatch,
  renameStaffPeriodsPatch, renameStaffPayPatch, renameStaffLaborMonthsPatch, renameStaffActualsPatch, renameStaffSubsPatch,
  MIN_WAGE_MAX_ENTRIES, sanitizeWageSettings, PAY_CODE_DEFAULT, isValidPayCodeCF, payCodeHashCF, isPayCodeRecordCF, verifyPayCodeCF,
  ENTITY_ID_RE, isValidEntityId, SHOP_KINDS, ENTITY_NAME_MAX, sanitizeEntityName, entityIdOfShop, shopKindOf,
  planEntityMigration, mergeEntitySettings, mirrorPeopleOf, mirrorShopEntitiesOf, buildShopMirror, otherCompanyLinksOf,
  COMPANY_SESSION_UID_PREFIX, canChangeCompanyPassword, COMPANY_LABOR_KEYS, COMPANY_LABOR_RANGES, COMPANY_LIMIT_NUM_KEYS, COMPANY_LABOR_SYSTEMS, COMPANY_OT_PRORATE_WINDOWS, COMPANY_OT_PRORATE_FIXED_MAX_MIN, sanitizeOtProrate, COMPANY_BUILTIN_ATTRS,
  COMPANY_ATTR_ID_RE, PERIOD_RANGE_KEY_RE, isValidDateStrCF, sanitizeCompanySettings, sanitizeCompanyDeadlines,
  effectiveDeadlinesForShop, MONTHLY_DEADLINE_MAX, sanitizeMonthlyDeadlineDays };
