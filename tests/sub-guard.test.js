// 提出データの監査（functions/sub-audit.js）・人単位の縛り（nameGuards・pageDevices）・募集URLの受付期限（expiresAtMs）のテスト（2026-10-08）
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.join(__dirname, "..");
const A = require("../functions/sub-audit.js");
const CF = require("../functions/staff-link.js");
const U = require("../app-utils.js");
const M = require("../app-my-utils.js");

const T1 = "A".repeat(24), T2 = "B".repeat(24), T3 = "C".repeat(24);

// ===== 監査 =====
test("監査: オーナー以外の削除・別 uid の上書き・同じ名前と期間の重複作成だけを記録する", () => {
  const sub = { id: "s1", periodId: "p1", staffName: "田中", submitterUid: "u1", shifts: {}, submittedAt: "x" };
  assert.deepStrictEqual(A.planSubAuditCF({ before: sub, after: null, authUid: "u2" }), { kind: "delete" });
  assert.deepStrictEqual(A.planSubAuditCF({ before: sub, after: { ...sub, comment: "x" }, authUid: "u2" }), { kind: "overwrite-other-uid", prevUid: "u1" });
  assert.strictEqual(A.planSubAuditCF({ before: sub, after: { ...sub, comment: "x" }, authUid: "u1" }), null, "本人の同じ uid の再提出は記録しない");
  assert.strictEqual(A.planSubAuditCF({ before: { ...sub, submitterUid: undefined }, after: sub, authUid: "u9" }), null, "前の提出者が分からない上書きは記録しない");
  const other = { s0: { ...sub, id: "s0" }, s5: { ...sub, id: "s5", staffName: "佐藤" }, s6: { ...sub, id: "s6", periodId: "p2" } };
  assert.deepStrictEqual(A.planSubAuditCF({ before: null, after: { ...sub, id: "s9" }, authUid: "u3", samePeriodSubs: other, subId: "s9" }), { kind: "duplicate-create", sameAs: "s0" });
  assert.strictEqual(A.planSubAuditCF({ before: null, after: { ...sub, staffName: "鈴木" }, authUid: "u3", samePeriodSubs: other, subId: "s9" }), null);
  // オーナー・Admin SDK（uid なし）は記録しない
  assert.strictEqual(A.planSubAuditCF({ before: sub, after: null, authUid: "u2", isOwner: true }), null);
  assert.strictEqual(A.planSubAuditCF({ before: sub, after: null, authUid: "" }), null);
  const rec = A.subAuditRecordCF({ decision: { kind: "delete" }, before: sub, after: null, authUid: "u2", subId: "s1", nowIso: "t" });
  assert.deepStrictEqual(rec, { kind: "delete", by: "u2", subId: "s1", staffName: "田中", periodId: "p1", at: "t", before: sub }, "消された内容を残す");
});

test("監査: index.js は独立した onWrite トリガーで、Admin SDK とオーナーを除き、private/subAudit/{期間ID} に残す。期間の削除で一緒に消す", () => {
  const idx = fs.readFileSync(path.join(ROOT, "functions", "index.js"), "utf8");
  const fn = idx.slice(idx.indexOf("exports.auditSubWrite"), idx.indexOf("exports.notifyStaffSubmit"));
  assert.ok(/\.database\.ref\("\/shops\/\{shopId\}\/subs\/\{subId\}"\)/.test(fn) && /\.onWrite\(/.test(fn));
  assert.ok(/context\.authType === "USER"/.test(fn), "Admin SDK の書き込みを除く");
  assert.ok(/owners\/\$\{authUid\}/.test(fn), "オーナーを除く");
  assert.ok(/private\/subAudit\/\$\{pid\}/.test(fn) && !/secrets/.test(fn));
  const purge = idx.slice(idx.indexOf("exports.purgeOldPeriods"), idx.indexOf("exports.purgeOldPeriods") + 4000);
  assert.ok(/private\/subAudit\/\$\{periodId\}`\)\.remove\(\)/.test(purge));
});

// ===== 人単位の縛り =====
const pagesBase = {
  [T1]: { status: "approved", name: "田中" }, [T2]: { status: "revoked", name: "佐藤" }, [T3]: { status: "pending", displayName: "鈴木" },
};
test("縛りの印: 承認済みの個別URLか紐付けがあり、スタッフ一覧にある名前だけ。取り消し・申請中・一覧に無い・キーに使えない名前は外す", () => {
  const staff = ["田中", "佐藤", "鈴木", "高橋", "a.b", "__spacer__1"];
  const links = { u1: { name: "高橋" }, u2: { name: "退職者" }, u3: { name: "a.b" } };
  assert.deepStrictEqual(M.planNameGuards({ pages: pagesBase, staffLinks: links, staff, guards: { 佐藤: true, 退職者: true } }),
    { 田中: true, 高橋: true, 佐藤: null, 退職者: null });
  assert.strictEqual(M.planNameGuards({ pages: pagesBase, staffLinks: links, staff, guards: { 田中: true, 高橋: true } }), null, "変わらなければ書かない");
  // 改名: 個別URLと紐付けの名前が新しい名前に移れば、印も移る
  assert.deepStrictEqual(M.planNameGuards({ pages: { [T1]: { status: "approved", name: "田中太郎" } }, staffLinks: {}, staff: ["田中太郎"], guards: { 田中: true } }),
    { 田中太郎: true, 田中: null });
  // 削除と同じ名前の再登録: 個別URLが取り消され紐付けが消えていれば、印は残らない（新しい人を締め出さない）
  assert.deepStrictEqual(M.planNameGuards({ pages: { [T1]: { status: "revoked", name: "田中" } }, staffLinks: {}, staff: ["田中"], guards: { 田中: true } }), { 田中: null });
});

test("縛りの印: クライアント（planNameGuards）と Cloud Functions（planNameGuardsCF）が乱数の入力で同じ答え", () => {
  const names = ["田中", "佐藤", "a.b", "x/y", "鈴木", "高橋"];
  const sts = ["approved", "revoked", "pending", "rejected"];
  let seed = 7; const rnd = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  for (let i = 0; i < 400; i++) {
    const pages = {}, links = {}, guards = {};
    for (let k = 0; k < rnd(5); k++) pages["T" + k] = { status: sts[rnd(4)], name: names[rnd(6)] };
    for (let k = 0; k < rnd(4); k++) links["u" + k] = { name: names[rnd(6)] };
    for (let k = 0; k < rnd(4); k++) guards[names[rnd(6)]] = true;
    const staff = names.filter(() => rnd(3) > 0);
    assert.deepStrictEqual(M.planNameGuards({ pages, staffLinks: links, staff, guards }), CF.planNameGuardsCF({ pages, staffLinks: links, staff, guards }));
  }
});

test("提出の拒否の理由: 受付期限切れ → 確定済み → 本人専用の名前 の順", () => {
  const p = U.withPeriodExpiry({ id: "p1", endDate: "2026-10-15" });
  const before = Date.parse("2026-10-15T23:59:00+09:00"), after = Date.parse("2026-10-16T00:00:00+09:00");
  assert.strictEqual(M.subDeniedReasonOf({ period: p, nowMs: after, guarded: true }), "expired");
  assert.strictEqual(M.subDeniedReasonOf({ period: { ...p, confirmation: { at: "x" } }, nowMs: before, guarded: true }), "confirmed");
  assert.strictEqual(M.subDeniedReasonOf({ period: p, nowMs: before, guarded: true }), "guard");
  assert.strictEqual(M.subDeniedReasonOf({ period: p, nowMs: before, guarded: false }), null);
  ["expired", "confirmed", "guard"].forEach(k => assert.ok(M.SUB_DENIED_MESSAGES[k]));
  assert.deepStrictEqual(M.pageDeviceRecordOf(T1, "t"), { token: T1, at: "t" });
  assert.strictEqual(M.pageDeviceRecordOf("bad", "t"), null);
});

// ===== 受付期限 =====
test("受付期限: 期間の末日の翌日 0:00（日本時間）。月末・年末・うるう年もずれない", () => {
  const jst = s => Date.parse(s + "+09:00");
  assert.strictEqual(U.periodExpiresAtMs("2026-10-15"), jst("2026-10-16T00:00:00"));
  assert.strictEqual(U.periodExpiresAtMs("2026-10-31"), jst("2026-11-01T00:00:00"));
  assert.strictEqual(U.periodExpiresAtMs("2026-12-31"), jst("2027-01-01T00:00:00"));
  assert.strictEqual(U.periodExpiresAtMs("2028-02-28"), jst("2028-02-29T00:00:00"));
  assert.strictEqual(U.periodExpiresAtMs(""), null);
  assert.strictEqual(U.isPeriodExpiredAt({ endDate: "2026-10-15" }, jst("2026-10-15T23:59:59")), false, "最終日の夜はまだ提出できる");
  assert.strictEqual(U.isPeriodExpiredAt({ endDate: "2026-10-15" }, jst("2026-10-16T00:00:00")), true);
  const p = { id: "p", endDate: "2026-10-15" };
  const w = U.withPeriodExpiry(p);
  assert.ok(w !== p && w.expiresAtMs === jst("2026-10-16T00:00:00"));
  assert.strictEqual(U.withPeriodExpiry(w), w, "合っていれば同じ参照（差分を増やさない）");
  assert.notStrictEqual(U.withPeriodExpiry({ ...w, endDate: "2026-10-31" }).expiresAtMs, w.expiresAtMs, "末日を変えたら期限も変わる");
  assert.deepStrictEqual(U.staffUrlTokenRecord("S", w), { shopId: "S", periodId: "p", expiresAtMs: w.expiresAtMs });
  assert.notStrictEqual(U.staffUrlTokenSig({ shopId: "S", periodId: "p" }), U.staffUrlTokenSig(U.staffUrlTokenRecord("S", w)), "期限の無い古い逆引きは書き直す");
});

// ===== ルールの形 =====
const rules = JSON.parse(fs.readFileSync(path.join(ROOT, "database.rules.json"), "utf8")).rules;
const shop = rules.shops.$shopId;
test("ルール: subs はオーナー以外に、受付期限内・縛りのある名前は本人（紐付けの uid か登録した端末）だけ。前後の両方の値で見る", () => {
  const w = shop.subs.$subId[".write"];
  ["newData", "data"].forEach(X => {
    assert.ok(w.includes(`child(${X}.child('periodId').val()).child('expiresAtMs').val() > now`), X + " の期限");
    assert.ok(w.includes(`child('nameGuards').child(${X}.child('staffName').val()).exists()`), X + " の縛り");
    assert.ok(w.includes(`child('staffLinks').child(auth.uid).child('name').val() === ${X}.child('staffName').val()`), X + " のアカウント");
    assert.ok(w.includes(`child('name').val() === ${X}.child('staffName').val()`), X + " の個別URLの名前");
  });
  assert.ok(w.includes("child('pageDevices').child(auth.uid).child('token')") && w.includes("child('status').val() === 'approved'"));
  assert.ok(w.startsWith("auth != null && $shopId !== 'demo-toriMatsu-v1' && (root.child('shops').child($shopId).child('owners').child(auth.uid).exists() ||"), "オーナーは縛られない");
  assert.ok(w.includes(".matches(/[.#$\\[\\]\\/]/)"), "キーに使えない名前は縛りの判定を読まない（読むとルールの評価が失敗して誰も書けなくなる）");
});
test("ルール: nameGuards はオーナーだけが true を書く・pageDevices は承認済みの個別URLの本人の端末だけ・tokens は期限後にオーナーしか読めない", () => {
  assert.strictEqual(shop.nameGuards[".read"], "auth != null");
  assert.ok(/owners'\)\.child\(auth\.uid\)\.exists\(\)/.test(shop.nameGuards.$name[".write"]) && shop.nameGuards.$name[".validate"] === "newData.val() === true");
  const pd = shop.pageDevices.$uid;
  assert.ok(pd[".write"].includes("auth.uid === $uid") && pd[".write"].includes("child('staffPages').child(newData.child('token').val()).child('status').val() === 'approved'"));
  assert.ok(pd[".write"].includes("demo-toriMatsu-v1") && pd.$other[".validate"] === false && /\^\[A-Za-z0-9\]\{24\}\$/.test(pd.token[".validate"]));
  assert.ok(!/auth != null$/.test(shop.pageDevices[".read"]), "一覧はオーナーだけ");
  const tr = rules.tokens.$token[".read"];
  assert.ok(tr.includes("data.child('expiresAtMs').val() > now") && tr.includes("owners').child(auth.uid).exists()"));
  assert.strictEqual(rules.tokens.$token.expiresAtMs[".validate"], "newData.isNumber()");
  assert.strictEqual(shop.periods.$periodId.expiresAtMs[".validate"], "newData.isNumber()");
});

// ===== 配線 =====
test("配線: 紐付けを変える CF は印を計算し直し、企業の改名は個別URLの名前も移す。クライアントは発行・承認・取り消し・追随・スタッフ一覧の変化で計算し直す", () => {
  const idx = fs.readFileSync(path.join(ROOT, "functions", "index.js"), "utf8");
  ["exports.approveStaffLink", "exports.unlinkStaff", "exports.linkStaffPage"].forEach(k => {
    const body = idx.slice(idx.indexOf(k), idx.indexOf("\n  });", idx.indexOf(k)));
    assert.ok(/await syncNameGuardsCF\(shopId\)/.test(body), k);
  });
  const ren = idx.slice(idx.indexOf("exports.companyRenameStaff"), idx.indexOf("exports.companyRenameStaff") + 9000);
  assert.ok(/staffPages/.test(ren) && /await syncNameGuardsCF\(sid\)/.test(ren));
  const main = fs.readFileSync(path.join(ROOT, "app-main.js"), "utf8");
  const act = main.slice(main.indexOf("const staffPageAct="), main.indexOf("const STAFF_LINK_CFS="));
  assert.strictEqual((act.match(/await syncNameGuards\(sid\)/g) || []).length, 2, "発行と、承認・却下・取り消し・暗証番号のリセット");
  const fl = main.slice(main.indexOf("const flushStaffLinkOps="), main.indexOf("const queueStaffLinkOp="));
  assert.ok(/await syncNameGuards\(targetSid\)/.test(fl));
  assert.ok(/syncNameGuards\(sid\);\},800\)/.test(main));
  // 提出: 個別URLの端末を登録してから書く・拒否は理由を付けて返し、画面から消す
  const so = main.slice(main.indexOf("const staffOnSub="), main.indexOf("const staffOnDeleteSub="));
  assert.ok(/ensurePageDevice\(\)\.then\(\(\)=>fbUpd\(path, flat\)\)/.test(so) && /userMessage:msg/.test(so) && /prevSub\?prev\.map/.test(so));
  // 期間の保存は受付期限を endDate に合わせ、逆引きにも書く
  const sp = main.slice(main.indexOf("const savePeriods =useCallback("), main.indexOf("const saveStaff   =useCallback("));
  assert.ok(/map\(withPeriodExpiry\)/.test(sp) && /staffUrlTokenRecord\(sid,p\)/.test(sp));
  // 期限切れの募集URLは「受付終了」の画面（管理者の画面や Cookie の店舗へ進まない）
  assert.ok(/isPermissionDeniedError\(e\)\)\{ console\.warn\("受付期限を過ぎたスタッフURL:",token\); setInitError\("expired"\); return; \}/.test(main));
  // フックは早期 return より前
  const firstReturn = main.indexOf('if(initError==="expired") return(');
  ["const pageDeviceRef=useRef", "const periodExpiryTriedRef=useRef"].forEach(k => assert.ok(main.indexOf(k) > 0 && main.indexOf(k) < firstReturn, k));
});
