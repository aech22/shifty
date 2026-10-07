// 通知（Web Push・2026-10-08）のユニットテスト（node:test）
// 対象: functions/notify.js（誰に何を送るか）・app-my-utils.js の「通知」の節（購読の記録・端末の判定）・
//       database.rules.json の push ノードの形・クライアントと CF の規則の一致（乱数の入力で照合）
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const n = require("../functions/notify.js");
const m = require("../app-my-utils.js");
const u = require("../app-utils.js");

const ROOT = path.join(__dirname, "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const tok = c => c.repeat(24);

// ===== 鍵と置き場 =====
test("VAPID の公開鍵: app-core.js と functions/notify.js が同じ値で、P-256 の非圧縮点（65バイト・先頭 0x04）", () => {
  const core = read("app-core.js").match(/const PUSH_VAPID_PUBLIC_KEY\s*=\s*"([^"]+)"/);
  assert.ok(core, "app-core.js に PUSH_VAPID_PUBLIC_KEY がある");
  assert.strictEqual(core[1], n.VAPID_PUBLIC_KEY_CF);
  const bytes = m.pushUrlBase64ToBytes(core[1]);
  assert.strictEqual(bytes.length, 65);
  assert.strictEqual(bytes[0], 4);
  assert.match(n.VAPID_SUBJECT_CF, /^https:\/\//, "subject は連絡先のメールアドレスを出さない URL");
});

test("秘密鍵はリポジトリに置かない: functions/ と app-*.js に VAPID の秘密鍵の代入が無く、CF は Secret の VAPID_PRIVATE_KEY を読む", () => {
  const idx = read("functions/index.js");
  assert.match(idx, /secrets:\s*\["VAPID_PRIVATE_KEY"\]/);
  assert.match(idx, /process\.env\.VAPID_PRIVATE_KEY/);
  ["functions/index.js", "functions/notify.js", "app-core.js", "app-my.js", "app-my-utils.js"].forEach(f =>
    assert.ok(!/privateKey\s*[:=]\s*"[A-Za-z0-9_-]{40,}"/.test(read(f)), `${f} に秘密鍵の直書きが無い`));
});

test("pushKeyOfEndpoint: endpoint の SHA-256 の16進の先頭32文字（node の crypto と一致）・CF の PUSH_KEY_RE と同じ形", () => {
  const ep = "https://fcm.googleapis.com/fcm/send/abc:xyz";
  const key = m.pushKeyOfEndpoint(ep, u.sha256HexOfBytes);
  assert.strictEqual(key, crypto.createHash("sha256").update(ep).digest("hex").slice(0, 32));
  assert.ok(m.PUSH_KEY_RE.test(key) && n.PUSH_KEY_RE_CF.test(key));
  assert.strictEqual(m.PUSH_KEY_RE.source, n.PUSH_KEY_RE_CF.source);
  assert.strictEqual(m.pushKeyOfEndpoint("", u.sha256HexOfBytes), "");
  assert.strictEqual(m.pushKeyOfEndpoint(ep, null), "");
});

test("pushRecordOf: 形の揃った購読だけを記録にし、CF の isPushRecordCF が読める。uid・ua は渡したときだけ", () => {
  const json = { endpoint: "https://fcm.googleapis.com/fcm/send/1", expirationTime: null, keys: { p256dh: "BPk", auth: "au" } };
  const rec = m.pushRecordOf(json, { at: "2026-10-08T00:00:00.000Z", ua: "x".repeat(400) });
  assert.deepStrictEqual(Object.keys(rec).sort(), ["at", "endpoint", "keys", "ua"]);
  assert.strictEqual(rec.ua.length, m.PUSH_UA_MAX);
  assert.ok(n.isPushRecordCF(rec));
  assert.strictEqual(m.pushRecordOf(json, { at: "t", uid: "u1" }).uid, "u1");
  assert.strictEqual("uid" in m.pushRecordOf(json, { at: "t", uid: "" }), false, "空の uid は持たない（スタッフの置き場は uid を拒否する）");
  [null, {}, { ...json, endpoint: "http://x" }, { ...json, keys: { p256dh: "a" } }, { ...json, endpoint: "https://" + "a".repeat(1000) }]
    .forEach(j => assert.strictEqual(m.pushRecordOf(j, { at: "t" }), null, JSON.stringify(j).slice(0, 60)));
});

test("database.rules.json: push は3か所。スタッフ個別URLとアカウントは同じ形（.write を除く）、管理者は owners だけが書け uid は自分", () => {
  const rules = JSON.parse(read("database.rules.json")).rules;
  const up = rules.users.$uid.push, sp = rules.staffPageData.$token.push, pp = rules.shops.$shopId.private.push;
  assert.strictEqual(up.$key[".write"], "auth != null && auth.uid === $uid && auth.token.email != null", "アカウントはメールのある本人だけ");
  const strip = o => (o && typeof o === "object" ? Object.fromEntries(Object.entries(o).filter(([k]) => k !== ".write").map(([k, v]) => [k, strip(v)])) : o);
  assert.deepStrictEqual(sp, strip(up), "個別URLの push は users と同じ形（読み書きは staffPageData/$token の承認済みの条件）");
  assert.match(pp[".write"], /owners'\)\.child\(auth\.uid\)\.exists\(\)/, "管理者の push はオーナーだけ");
  assert.match(pp.$key.uid[".validate"], /newData\.val\(\) === auth\.uid/);
  assert.match(pp.$key[".validate"], /'uid'/, "管理者の記録は uid が必須（CF が owners と照合する）");
  [up.$key, pp.$key].forEach(k => {
    assert.match(k[".validate"], /\$key\.matches\(\/\^\[0-9a-f\]\{32\}\$\/\)/);
    assert.strictEqual(k.$other[".validate"], false);
    assert.strictEqual(k.keys.$other[".validate"], false);
    // endpoint の許可リストは CF の PUSH_ENDPOINT_RE と同じ正規表現（ルールの中の文字列から取り出して比べる）
    const m2 = /matches\((\/.*\/)\)/.exec(k.endpoint[".validate"]);
    assert.ok(m2, "endpoint は matches で許可リストを持つ");
    assert.strictEqual(m2[1], String(n.PUSH_ENDPOINT_RE));
  });
  assert.strictEqual(up.$key.uid, undefined, "スタッフの記録は uid を持たない（$other で拒否）");
  // クライアントの記録のキーはルールが受け付けるキーだけ
  const rec = m.pushRecordOf({ endpoint: "https://fcm.googleapis.com/fcm/send/1", keys: { p256dh: "a", auth: "b" } }, { at: "t", uid: "u", ua: "ua" });
  Object.keys(rec).forEach(k => assert.ok(k in pp.$key, `${k} は管理者のルールにある`));
  Object.keys(rec).filter(k => k !== "uid").forEach(k => assert.ok(k in up.$key, `${k} はスタッフのルールにある`));
});

test("pushSupportOf: http・iPhone の Safari のタブ・未対応・拒否・有効にできる、の5つに分ける", () => {
  const ok = { secure: true, hasSW: true, hasPush: true, hasNotification: true, ios: false, standalone: false, permission: "default" };
  assert.strictEqual(m.pushSupportOf(ok).state, "ok");
  assert.strictEqual(m.pushSupportOf({ ...ok, secure: false }).state, "unsupported");
  const ios = m.pushSupportOf({ ...ok, ios: true, hasPush: false, hasNotification: false });
  assert.strictEqual(ios.state, "ios-home");
  assert.match(ios.message, /ホーム画面に追加/);
  assert.strictEqual(m.pushSupportOf({ ...ok, ios: true, standalone: true }).state, "ok", "ホーム画面のアプリは有効にできる");
  assert.strictEqual(m.pushSupportOf({ ...ok, ios: true, standalone: true, hasPush: false }).state, "unsupported", "古い iOS のアプリ");
  assert.strictEqual(m.pushSupportOf({ ...ok, hasPush: false }).state, "unsupported");
  assert.strictEqual(m.pushSupportOf({ ...ok, permission: "denied" }).state, "denied");
});

// ===== クライアントとの規則の一致（乱数）=====
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
test("resolveAliasCF は app-utils.js の resolveAlias と同じ答え（乱数300件）", () => {
  const r = rng(7), names = ["田中", "佐藤", "たなか", "さとう", "タナカ", " 田中 ", "鈴木"];
  for (let i = 0; i < 300; i++) {
    const aliases = {};
    names.slice(0, 3).forEach(reg => { if (r() < 0.6) aliases[reg] = names.filter(() => r() < 0.3); });
    const input = names[Math.floor(r() * names.length)];
    assert.strictEqual(n.resolveAliasCF(input, aliases), u.resolveAlias(input, aliases), JSON.stringify({ input, aliases }));
  }
  assert.strictEqual(n.resolveAliasCF("さとう", { "佐藤": { 0: "さとう" } }), "佐藤", "Firebase が配列を数値キーで返しても読む");
});

test("isStaffHiddenInPeriodCF は app-utils.js の isStaffHiddenInPeriod と同じ答え（乱数300件）", () => {
  const r = rng(11), ds = ["2026-09-01", "2026-09-16", "2026-10-01", "2026-10-16", null];
  for (let i = 0; i < 300; i++) {
    const pick = () => ds[Math.floor(r() * ds.length)];
    const raw = r() < 0.15 ? true : Array.from({ length: Math.floor(r() * 3) }, () => ({ from: pick(), to: pick() }));
    const staffHidden = r() < 0.1 ? {} : { "田中": raw };
    const period = r() < 0.05 ? {} : { startDate: pick() || "2026-09-16" };
    assert.strictEqual(n.isStaffHiddenInPeriodCF("田中", staffHidden, period), u.isStaffHiddenInPeriod("田中", { staffHidden }, period), JSON.stringify({ raw, period }));
  }
});

test("companyDeadlineInfoCF は app-utils.js の shopDeadlineInfoFromLink と同じ答え（期間の日付指定 ＞ 毎月の固定日・乱数400件）", () => {
  const r = rng(23);
  for (let i = 0; i < 400; i++) {
    const y = 2026 + Math.floor(r() * 3), mo = 1 + Math.floor(r() * 12), d = 1 + Math.floor(r() * 28);
    const start = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const end = u.fd(new Date(y, mo - 1, d + 14));
    const days = Array.from({ length: Math.floor(r() * 4) }, () => (r() < 0.1 ? "x" : 1 + Math.floor(r() * 31)));
    const company = { monthlyDeadlineDays: days };
    if (r() < 0.3) company.deadlines = { [`${start}_${end}`]: r() < 0.8 ? u.fd(new Date(y, mo - 1, d - 3)) : "2026-02-30" };
    const period = { startDate: start, endDate: end };
    assert.deepStrictEqual(n.companyDeadlineInfoCF(company, period), u.shopDeadlineInfoFromLink(company, period), JSON.stringify({ company, period }));
  }
});

// ===== 宛先 =====
const shop = () => ({
  shopId: "s1", shopName: "三ビル店",
  staff: ["田中", "佐藤", "鈴木", "高橋", "__spacer__1"],
  staffPages: {
    [tok("A")]: { status: "approved", name: "田中" },
    [tok("C")]: { status: "pending", displayName: "鈴木" },
    [tok("D")]: { status: "approved", name: "退職者" },
    [tok("H")]: { status: "approved", name: "高橋" },
    short: { status: "approved", name: "佐藤" },
  },
  staffLinks: { uid1: { name: "鈴木" }, uid2: { name: "田中" }, "bad/uid": { name: "佐藤" }, uid3: { name: "退職者" } },
  staffHidden: { "高橋": true },
});

test("staffRecipientsCF: 承認済みで名前がいまのスタッフ一覧にある個別URLと、名前がスタッフ一覧にあるアカウントの紐付け", () => {
  const rs = n.staffRecipientsCF(shop());
  assert.deepStrictEqual(rs.map(r => `${r.kind}:${r.name}`).sort(), ["account:田中", "account:鈴木", "page:田中", "page:高橋"]);
  const a = rs.find(r => r.kind === "page" && r.name === "田中");
  assert.strictEqual(a.base, `staffPageData/${tok("A")}`);
  assert.strictEqual(a.url, `https://shiftyshifty.app/#/m/${tok("A")}`);
  assert.strictEqual(rs.find(r => r.kind === "account" && r.name === "鈴木").base, "users/uid1");
});

test("planNewPeriodNotifyCF: 本文・非表示の人を除く・終わった期間とデモ店舗と壊れた期間では送らない", () => {
  const p = { id: "p1", label: "10月後半", startDate: "2026-10-16", endDate: "2026-10-31" };
  const r = n.planNewPeriodNotifyCF({ ...shop(), period: p, today: "2026-10-08" });
  assert.deepStrictEqual(r.recipients.map(x => x.name).sort(), ["田中", "田中", "鈴木"]);
  assert.deepStrictEqual(r.recipients[0].payload, { title: "Shifty", body: "三ビル店：10月後半のシフト提出が始まりました", url: r.recipients[0].url, tag: "period-p1" });
  assert.strictEqual(n.planNewPeriodNotifyCF({ ...shop(), period: p, today: "2026-11-01" }).skip, "past-period");
  assert.strictEqual(n.planNewPeriodNotifyCF({ ...shop(), period: p, today: "2026-10-31" }).recipients.length, 3, "最終日当日はまだ送る");
  assert.strictEqual(n.planNewPeriodNotifyCF({ ...shop(), shopId: "demo-toriMatsu-v1", period: p, today: "2026-10-08" }).skip, "demo");
  assert.strictEqual(n.planNewPeriodNotifyCF({ ...shop(), period: { label: "x", startDate: "2026-02-30", endDate: "2026-03-10" } }).skip, "invalid-period");
  assert.match(n.planNewPeriodNotifyCF({ ...shop(), shopName: "", period: p, today: "2026-10-08" }).recipients[0].payload.body, /^お店：/, "店舗名が無ければ「お店」");
  assert.match(n.planNewPeriodNotifyCF({ ...shop(), period: { ...p, label: "" }, today: "2026-10-08" }).recipients[0].payload.body, /2026-10-16〜2026-10-31のシフト提出/);
});

test("planDeadlineStaffNotifyCF: まだ提出していない人だけ。別名の提出は本人の提出・管理者の下書き（source:grid）は提出ではない・別の期間の提出は数えない", () => {
  const p = { id: "p3", label: "10月前半", startDate: "2026-10-01", endDate: "2026-10-15", deadlineDate: "2026-09-25" };
  const subs = {
    a: { periodId: "p3", staffName: "たなか" },
    g: { periodId: "p3", staffName: "鈴木", source: "grid" },
    o: { periodId: "p9", staffName: "鈴木" },
  };
  const r = n.planDeadlineStaffNotifyCF({ ...shop(), period: p, subs, staffAliases: { "田中": ["たなか"] } });
  assert.deepStrictEqual(r.recipients.map(x => `${x.kind}:${x.name}`), ["account:鈴木"], "田中は別名で提出済み・高橋は非表示");
  assert.strictEqual(r.recipients[0].payload.body, "三ビル店：今日は10月前半の提出締切日です");
  assert.strictEqual(r.recipients[0].payload.url, "https://shiftyshifty.app/#/me");
  const none = n.planDeadlineStaffNotifyCF({ ...shop(), period: p, subs: {}, staffAliases: {} });
  assert.strictEqual(none.recipients.length, 3, "誰も出していなければ全員（非表示の人を除く）");
  assert.strictEqual(n.planDeadlineStaffNotifyCF({ ...shop(), shopId: "demo-toriMatsu-v1", period: p }).skip, "demo");
});

test("deadlinePeriodsCF: deadlineDate が今日の期間だけ（id はキーで補う）", () => {
  const ps = { a: { deadlineDate: "2026-10-08" }, b: { id: "b", deadlineDate: "2026-10-09" }, c: null, d: { id: "d" } };
  assert.deepStrictEqual(n.deadlinePeriodsCF(ps, "2026-10-08").map(p => p.id), ["a"]);
  assert.deepStrictEqual(n.deadlinePeriodsCF(ps, "bad"), []);
});

// ===== 提出の判定 =====
test("isStaffSubmissionWriteCF: スタッフの初回提出・再提出だけ。管理者の編集・下書き・削除・古い updatedAt の書き戻しは違う", () => {
  const s = (o = {}) => ({ id: "x", periodId: "p1", staffName: "田中", submittedAt: "2026-10-08T01:00:00.000Z", shifts: {}, ...o });
  const T = (b, a) => n.isStaffSubmissionWriteCF(b, a);
  assert.strictEqual(T(null, s()), "first", "新しく作る");
  assert.strictEqual(T(s({ source: "grid" }), s()), "first", "管理者の下書きの上に初めて出す（source が消える）");
  assert.strictEqual(T(s(), s({ updatedAt: "2026-10-08T02:00:00.000Z", isUpdated: true })), "update", "再提出");
  assert.strictEqual(T(s({ updatedAt: "2026-10-08T02:00:00.000Z", isUpdated: true }), s({ updatedAt: "2026-10-08T03:00:00.000Z", isUpdated: true })), "update", "もう一度の再提出");
  assert.strictEqual(T(s(), s({ shifts: { "2026-10-01": { status: "work", adjustedStart: "10:00" } } })), null, "管理者の編集（updatedAt を変えない）");
  assert.strictEqual(T(s({ updatedAt: "2026-10-08T02:00:00.000Z", isUpdated: true }), s({ updatedAt: "2026-10-08T02:00:00.000Z", isUpdated: true, comment: "x" })), null, "updatedAt が同じ");
  assert.strictEqual(T(s({ updatedAt: "2026-10-08T03:00:00.000Z", isUpdated: true }), s({ updatedAt: "2026-10-08T02:00:00.000Z", isUpdated: true })), null, "古い updatedAt の書き戻し");
  assert.strictEqual(T(null, s({ source: "grid" })), null, "管理者の下書きの作成");
  assert.strictEqual(T(s(), null), null, "削除");
  assert.strictEqual(T(null, s({ submittedAt: "" })), null, "submittedAt の無い新規");
  assert.strictEqual(T(null, { periodId: "p1" }), null, "名前の無い記録");
});

test("提出の判定が依りどころにする不変条件: isUpdated:true / updatedAt を書くのはスタッフ画面（app-staff.js）だけ", () => {
  ["app-admin.js", "app-shift.js", "app-company.js", "app-main.js", "app-my.js"].forEach(f => {
    const src = read(f);
    assert.ok(!/isUpdated\s*:\s*true/.test(src), `${f} は isUpdated:true を書かない（書くと管理者の編集が「提出」として通知される）`);
  });
  const staff = read("app-staff.js");
  assert.ok((staff.match(/isUpdated\s*:\s*true/g) || []).length >= 2, "スタッフの再提出と提出状況一覧のセル編集");
  // シフト作成タブが新しく作る sub は source:"grid"（管理者の下書き）
  const shift = read("app-shift.js");
  const created = shift.match(/const ns=\{id:genSecureId\([^\n]*/g) || [];
  assert.ok(created.length >= 1 && created.every(c => /source:"grid"/.test(c)), "シフト作成タブの新規 sub は source:grid");
});

test("planSubmitNotifyCF: 本文は登録名・期間名で、初回は「提出」再提出は「再提出」。開く先は #/admin", () => {
  const after = { periodId: "p1", staffName: "さとう", submittedAt: "t" };
  const r = n.planSubmitNotifyCF({ shopId: "s1", shopName: "三ビル店", before: null, after, period: { label: "10月前半" }, staffAliases: { "佐藤": ["さとう"] } });
  assert.deepStrictEqual(r.payload, { title: "Shifty", body: "三ビル店：佐藤さんがシフトを提出しました（10月前半）", url: "https://shiftyshifty.app/#/admin", tag: "submit-p1-佐藤" });
  const up = n.planSubmitNotifyCF({ shopId: "s1", shopName: "", before: { ...after, updatedAt: "a" }, after: { ...after, updatedAt: "b", isUpdated: true }, period: null });
  assert.strictEqual(up.payload.body, "さとうさんがシフトを再提出しました（シフト）");
  assert.strictEqual(n.planSubmitNotifyCF({ shopId: "demo-toriMatsu-v1", before: null, after }).skip, "demo");
  assert.strictEqual(n.planSubmitNotifyCF({ shopId: "s1", before: after, after }).skip, "not-submission");
});

test("planCompanyDeadlineNotifyCF: 今日が締切（日付指定か毎月の固定日）で、企業へ未提出の期間だけ", () => {
  const periods = {
    a: { label: "10月後半", startDate: "2026-10-16", endDate: "2026-10-31" },
    b: { label: "11月前半", startDate: "2026-11-01", endDate: "2026-11-15", submission: { at: "x" } },
    c: { label: "11月後半", startDate: "2026-11-16", endDate: "2026-11-30" },
  };
  const company = { deadlines: { "2026-10-16_2026-10-31": "2026-10-08", "2026-11-01_2026-11-15": "2026-10-08" } };
  const r = n.planCompanyDeadlineNotifyCF({ shopId: "s1", shopName: "三ビル店", company, periods, today: "2026-10-08" });
  assert.deepStrictEqual(r.map(x => x.periodId), ["a"]);
  assert.strictEqual(r[0].payload.body, "三ビル店：10月後半の企業へのシフト提出締切日です");
  const monthly = n.planCompanyDeadlineNotifyCF({ shopId: "s1", company: { monthlyDeadlineDays: [10] }, periods, today: "2026-11-10" });
  assert.deepStrictEqual(monthly.map(x => x.periodId), ["c"], "11/16 開始の期間の固定日の締切は 11/10");
  assert.deepStrictEqual(n.planCompanyDeadlineNotifyCF({ shopId: "s1", company: null, periods, today: "2026-10-08" }), [], "企業に連携していない店舗");
  assert.deepStrictEqual(n.planCompanyDeadlineNotifyCF({ shopId: "demo-toriMatsu-v1", company, periods, today: "2026-10-08" }), []);
});

// ===== 送信 =====
test("pushTargetsOfCF / dedupeTargetsCF / pushErrorActionCF: 形の違う記録は読まず、owners から外れた端末に送らず、同じ端末へは1回、410/404 だけ消す", () => {
  const rec = (e, uid) => ({ endpoint: e, keys: { p256dh: "a", auth: "b" }, at: "t", ...(uid ? { uid } : {}) });
  const node = { ["a".repeat(32)]: rec("https://fcm.googleapis.com/fcm/send/1", "o1"), ["b".repeat(32)]: rec("https://fcm.googleapis.com/fcm/send/2", "gone"), short: rec("https://fcm.googleapis.com/fcm/send/3", "o1"), ["c".repeat(32)]: { endpoint: "x" } };
  const all = n.pushTargetsOfCF(node, "shops/s1/private/push");
  assert.deepStrictEqual(all.map(t => t.sub.endpoint), ["https://fcm.googleapis.com/fcm/send/1", "https://fcm.googleapis.com/fcm/send/2"]);
  assert.strictEqual(all[0].path, `shops/s1/private/push/${"a".repeat(32)}`);
  assert.deepStrictEqual(n.pushTargetsOfCF(node, "x", { ownerUids: ["o1"] }).map(t => t.sub.endpoint), ["https://fcm.googleapis.com/fcm/send/1"]);
  assert.strictEqual(n.dedupeTargetsCF([...all, ...all]).length, 2);
  assert.strictEqual(n.pushErrorActionCF(410), "delete");
  assert.strictEqual(n.pushErrorActionCF(404), "delete");
  [400, 413, 429, 500, undefined].forEach(c => assert.strictEqual(n.pushErrorActionCF(c), "keep", String(c)));
});

test("jstTodayCF: 日本時間の日付（UTC 15:00 で翌日になる）", () => {
  assert.strictEqual(n.jstTodayCF(Date.UTC(2026, 9, 7, 14, 59)), "2026-10-07");
  assert.strictEqual(n.jstTodayCF(Date.UTC(2026, 9, 7, 15, 0)), "2026-10-08");
});

// ===== 配信物 =====
test("sw.js: push と notificationclick だけで、ファイルのキャッシュ（fetch・caches）を持たない。index.html からは読み込まない", () => {
  const sw = read("sw.js");
  assert.match(sw, /addEventListener\("push"/);
  assert.match(sw, /addEventListener\("notificationclick"/);
  assert.ok(!/addEventListener\("fetch"/.test(sw) && !/caches\./.test(sw), "キャッシュしない（?v= の版数管理を壊さない）");
  assert.ok(!/sw\.js/.test(read("index.html")), "index.html は sw.js を読み込まない（登録は通知を有効にする操作のときだけ）");
  assert.match(read("app-my.js"), /serviceWorker\.register\(PUSH_SW_URL/);
});

test("functions/package.json に web-push がある", () => {
  const pkg = JSON.parse(read("functions/package.json"));
  assert.ok(pkg.dependencies["web-push"]);
});

test("isPushEndpointCF: ブラウザの Push サービスの宛先だけを通す（任意の URL へ CF が POST する踏み台にしない）", () => {
  ["https://fcm.googleapis.com/fcm/send/abc", "https://android.googleapis.com/gcm/send/abc", "https://web.push.apple.com/QAbc",
   "https://updates.push.services.mozilla.com/wpush/v2/abc", "https://wns2-par02p.notify.windows.com/w/?token=abc"]
    .forEach(e => assert.ok(n.isPushEndpointCF(e), e));
  ["http://fcm.googleapis.com/fcm/send/abc", "https://fcm.googleapis.com.evil.example/x", "https://evil.example/fcm.googleapis.com/",
   "https://169.254.169.254/latest", "https://metadata.google.internal/x", "https://fcm.googleapis.com", "https://a.b.notify.windows.com/x",
   "https://fcm.googleapis.com/" + "a".repeat(1000), null, 1]
    .forEach(e => assert.ok(!n.isPushEndpointCF(e), String(e)));
  assert.ok(!n.isPushRecordCF({ endpoint: "https://evil.example/x", keys: { p256dh: "a", auth: "b" } }));
});
