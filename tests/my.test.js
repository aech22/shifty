// 従業員画面（第2部）の純粋関数のユニットテスト（node:test）
// 実行: npm test（= node --test "tests/**/*.test.js"）
// 対象: app-my-utils.js（ブラウザAPI非依存）
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const m = require("../app-my-utils.js");

const ROOT = path.join(__dirname, "..");

test("MY_TABS: 下部タブは マイシフト・給料・設定 の順", () => {
  assert.deepStrictEqual(m.MY_TABS.map(t => t.label), ["マイシフト", "給料", "設定"]);
  assert.deepStrictEqual(m.MY_TABS.map(t => t.key), ["shift", "pay", "settings"]);
});

// 読み込み順のドリフト検出（E0）。index.html・package.json の lint 対象・eslint の files が同じ9ファイル・同じ順か
test("E0 読み込み順: index.html / package.json / eslint.config.js が utils→my-utils→core→staff→admin→shift→company→my→main で揃っている", () => {
  const ORDER = ["app-utils.js", "app-my-utils.js", "app-core.js", "app-staff.js", "app-admin.js", "app-shift.js", "app-company.js", "app-my.js", "app-main.js"];
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const tags = [...html.matchAll(/<script[^>]*src="(app-[a-z-]+\.js)\?v=([^"]+)"[^>]*>/g)];
  assert.deepStrictEqual(tags.map(t => t[1]), ORDER, "index.html の <script> の並び");
  assert.strictEqual(new Set(tags.map(t => t[2])).size, 1, "?v= の版数が全ファイルで同じ");
  const plain = new Set(["app-utils.js", "app-my-utils.js", "app-core.js"]);
  tags.forEach(t => assert.strictEqual(/type="text\/babel"/.test(t[0]), !plain.has(t[1]), `${t[1]} の babel 指定`));
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  assert.deepStrictEqual(pkg.scripts.lint.split(/\s+/).slice(1), ORDER, "package.json の lint 対象");
  const es = fs.readFileSync(path.join(ROOT, "eslint.config.js"), "utf8");
  const files = JSON.parse(es.match(/files:\s*(\[[^\]]*\])/)[1]);
  assert.deepStrictEqual(files, ORDER, "eslint.config.js の files");
});

// ===== E1: アカウント =====
test("isMyRouteHash: #/me と #/me/ だけ。#/s/<token>・#/demo・#/meeting は違う", () => {
  assert.ok(m.isMyRouteHash("#/me"));
  assert.ok(m.isMyRouteHash("#/me/"));
  ["", "#/", "#/s/abc", "#/demo", "#/meeting", "#/me/x", "#me", null, undefined].forEach(h =>
    assert.strictEqual(m.isMyRouteHash(h), false, String(h)));
});

test("normalizeMyNumber: 全角数字を半角に、前後の空白を落とす。先頭のゼロは残す", () => {
  assert.strictEqual(m.normalizeMyNumber("０１２"), "012");
  assert.strictEqual(m.normalizeMyNumber(" 　0042 "), "0042");
  assert.strictEqual(m.normalizeMyNumber("A-０１"), "A-01", "数字以外は変えない");
  assert.notStrictEqual(m.normalizeMyNumber("012"), m.normalizeMyNumber("12"));
  assert.strictEqual(m.normalizeMyNumber(undefined), "");
});

test("normalizeMyDisplayName: 前後の空白（全角も）だけ落とし、途中の空白は残す", () => {
  assert.strictEqual(m.normalizeMyDisplayName("　山田 太郎 "), "山田 太郎");
  assert.strictEqual(m.normalizeMyDisplayName(null), "");
});

test("validateMyProfile / buildMyProfileRecord: 必須・上限・番号なしはキーを持たない", () => {
  assert.strictEqual(m.validateMyProfile({ displayName: "  " }), "登録ネームを入力してください");
  assert.match(m.validateMyProfile({ displayName: "あ".repeat(51) }), /50文字以内/);
  assert.strictEqual(m.validateMyProfile({ displayName: "あ".repeat(50) }), null);
  assert.match(m.validateMyProfile({ displayName: "山田", number: "123456789" }), /8文字以内/);
  assert.strictEqual(m.validateMyProfile({ displayName: "山田", number: "１２３４５６７８" }), null, "全角8桁は半角にして8文字");
  assert.deepStrictEqual(m.buildMyProfileRecord({ displayName: " 山田 ", number: "" }, "T"), { displayName: "山田", updatedAt: "T" });
  assert.deepStrictEqual(m.buildMyProfileRecord({ displayName: "山田", number: "０７" }, "T"), { displayName: "山田", number: "07", updatedAt: "T" });
  const rec = m.buildMyProfileRecord({ displayName: "山田" }, "T");
  assert.ok(Object.values(rec).every(v => v !== undefined), "undefined を含まない（fbSet が同期例外にしない）");
});

test("myProfileOf: 壊れた値は空文字に倒す", () => {
  assert.deepStrictEqual(m.myProfileOf(null), { displayName: "", number: "" });
  assert.deepStrictEqual(m.myProfileOf({ displayName: 3, number: "1" }), { displayName: "", number: "1" });
});

test("validateMyEmail / validateMyPassword: 形式・8文字以上・確認の一致", () => {
  assert.strictEqual(m.validateMyEmail(""), "メールアドレスを入力してください");
  assert.strictEqual(m.validateMyEmail("a@b"), "メールアドレスの形式が正しくありません");
  assert.strictEqual(m.validateMyEmail(" a@b.jp "), null);
  assert.strictEqual(m.MY_PASSWORD_MIN, 8);
  assert.match(m.validateMyPassword("1234567"), /8文字以上/);
  assert.strictEqual(m.validateMyPassword("12345678"), null, "確認を渡さなければ一致は見ない（ログイン）");
  assert.strictEqual(m.validateMyPassword("12345678", "12345679"), "確認用のパスワードが一致しません");
  assert.strictEqual(m.validateMyPassword("12345678", "12345678"), null);
});

test("myAuthErrorMessage: 主なコードを日本語にし、パスワード変更では『現在のパスワード』と言う", () => {
  const e = code => ({ code });
  assert.strictEqual(m.myAuthErrorMessage(e("auth/email-already-in-use"), "register"), "このメールアドレスは既に使われています");
  ["auth/user-not-found", "auth/wrong-password", "auth/invalid-credential", "auth/invalid-login-credentials"].forEach(c => {
    assert.strictEqual(m.myAuthErrorMessage(e(c), "login"), "メールアドレスまたはパスワードが正しくありません", c);
    assert.strictEqual(m.myAuthErrorMessage(e(c), "password"), "現在のパスワードが正しくありません", c);
    assert.ok(m.isMyCredentialError(e(c)), c);
  });
  assert.ok(!m.isMyCredentialError(e("auth/network-request-failed")), "通信エラーは試行回数に数えない");
  assert.match(m.myAuthErrorMessage(e("PERMISSION_DENIED"), "profile"), /サーバー側の設定が未反映/);
  assert.match(m.myAuthErrorMessage({ message: "permission_denied at /users/x" }, "register"), /サーバー側の設定が未反映/);
  assert.match(m.myAuthErrorMessage(e("auth/xyz"), "login"), /ログインに失敗しました/);
});

test("staffAccountBlockReason: 管理者の端末・企業ログイン・管理者のアカウント・体験版では作らせない", () => {
  const anon = { hasUser: true, isAnonymous: true };
  assert.strictEqual(m.staffAccountBlockReason(anon), null, "匿名で管理キーもオーナー登録も無い端末は作れる");
  assert.strictEqual(m.staffAccountBlockReason({ ...anon, adminKeyCount: 1 }).code, "owner", "管理キーを持つ端末");
  assert.strictEqual(m.staffAccountBlockReason({ ...anon, ownerShopIds: ["S1"] }).code, "owner", "owners に載っている uid");
  assert.strictEqual(m.staffAccountBlockReason({ ...anon, ownerCheckFailed: true }).code, "unknown", "確かめられないときは止める");
  assert.strictEqual(m.staffAccountBlockReason({ hasUser: true, isAnonymous: false, isCompanySession: true }).code, "company");
  assert.strictEqual(m.staffAccountBlockReason({ hasUser: true, isAnonymous: false }).code, "admin", "Google・メールの管理者ログイン中");
  assert.strictEqual(m.staffAccountBlockReason({ hasUser: true, isAnonymous: false, isStaff: true }), null, "既にスタッフアカウント");
  assert.strictEqual(m.staffAccountBlockReason({ ...anon, demo: true }).code, "demo");
  assert.strictEqual(m.staffAccountBlockReason({ hasUser: false }).code, "signin");
  Object.values(m.MY_BLOCK_MESSAGES).forEach(t => assert.ok(typeof t === "string" && t.length > 0));
});

test("myOwnerCheckShopIds: 現在の店舗・Cookie・管理キー・キャッシュを重複なく。default と禁止文字は除く", () => {
  assert.deepStrictEqual(m.myOwnerCheckShopIds({
    currentShopId: "S1", cookieShopId: "S2", adminKeys: { S2: "k", S3: "k" },
    cachedShops: [{ id: "S1" }, { id: "S4" }, null, { id: "a.b" }, { id: "default" }],
  }), ["S1", "S2", "S3", "S4"]);
  assert.deepStrictEqual(m.myOwnerCheckShopIds({}), []);
  assert.deepStrictEqual(m.myOwnerCheckShopIds({ currentShopId: "x#y", cookieShopId: "" }), []);
});

test("isStaffAccountMarked / mayBeStaffAccountUser", () => {
  assert.ok(m.isStaffAccountMarked({ uid: "u1" }, "u1"));
  assert.ok(!m.isStaffAccountMarked({ uid: "u1" }, "u2"));
  assert.ok(!m.isStaffAccountMarked(null, "u1"));
  assert.ok(!m.isStaffAccountMarked({ uid: "" }, ""));
  const pw = [{ providerId: "password" }];
  assert.ok(m.mayBeStaffAccountUser({ uid: "u1", isAnonymous: false, providerData: pw }));
  assert.ok(!m.mayBeStaffAccountUser({ uid: "u1", isAnonymous: true, providerData: pw }));
  assert.ok(!m.mayBeStaffAccountUser({ uid: "company_C1", isAnonymous: false, providerData: pw }), "企業ログインは読まない");
  assert.ok(!m.mayBeStaffAccountUser({ uid: "u1", isAnonymous: false, providerData: [{ providerId: "google.com" }] }), "Google だけの管理者は読まない");
});

// ルール（users/$uid）が追加だけで、既存のルールを変えていないことの固定（E1）
test("database.rules.json: users/$uid は本人だけ読め、profile はメールのある本人だけ書ける。形の検証つき", () => {
  const rules = JSON.parse(fs.readFileSync(path.join(ROOT, "database.rules.json"), "utf8")).rules;
  const u = rules.users.$uid;
  assert.strictEqual(u[".read"], "auth != null && auth.uid === $uid");
  assert.strictEqual(u[".write"], undefined, "users/$uid 直下に書き込み権限を持たせない（links などは CF だけが書く）");
  const p = u.profile;
  assert.match(p[".write"], /auth\.uid === \$uid/);
  assert.match(p[".write"], /auth\.token\.email != null/, "匿名のままの uid には書かせない");
  assert.strictEqual(p.$other[".validate"], false);
  assert.match(p.displayName[".validate"], /<= 50/);
  assert.match(p.number[".validate"], /<= 8/);
});

// ===== E2: 紐付け =====
const cf = require("../functions/staff-link.js");
const ctx0 = (o = {}) => ({ shopId: "S1", staff: ["田中", "山田 太郎", "__spacer__x", "佐藤"], staffNumbers: { "田中": "０１２", "佐藤": "A-01" }, mirrorPeople: null, staffLinks: {}, uid: "U1", ...o });

test("E2 linkNumberKey: 数字だけのときだけキーになる。全角は半角に、先頭のゼロは区別する", () => {
  assert.strictEqual(m.linkNumberKey("０１２"), "012");
  assert.strictEqual(m.linkNumberKey(" 012　"), "012");
  assert.notStrictEqual(m.linkNumberKey("012"), m.linkNumberKey("12"));
  ["A-01", "12a", "", "1 2", null, undefined, "−1"].forEach(v => assert.strictEqual(m.linkNumberKey(v), "", String(v)));
});

test("E2 linkNameKey: 空白（半角・全角・途中）をすべて除き、それ以外は一字一句そのまま", () => {
  assert.strictEqual(m.linkNameKey(" 山田　太 郎 "), "山田太郎");
  assert.notStrictEqual(m.linkNameKey("やまだ"), m.linkNameKey("ヤマダ"), "かなの違いは揃えない");
  assert.notStrictEqual(m.linkNameKey("Yamada"), m.linkNameKey("yamada"), "大文字小文字も揃えない");
});

test("E2 候補 A（従業員番号）: 全角の番号が一致すれば出る。先頭のゼロ違い・数字以外の番号では出ない", () => {
  assert.deepStrictEqual(m.linkCandidatesFor({ displayName: "たなか", number: "012" }, ctx0()), [{ name: "田中", methods: ["number"], takenBy: null }]);
  assert.deepStrictEqual(m.linkCandidatesFor({ displayName: "たなか", number: "12" }, ctx0()), [], "先頭のゼロは区別する");
  // 佐藤の番号は "A-01"（数字以外）。申請も "A-01" で文字列は一致するが、A の提案は出さない
  assert.deepStrictEqual(m.linkCandidatesFor({ displayName: "さとう", number: "A-01" }, ctx0()), [], "数字以外の番号では A の提案が出ない");
  assert.deepStrictEqual(m.linkCandidatesFor({ displayName: "さとう", number: "" }, ctx0()), []);
});

test("E2 候補 A（企業連携の人物ID）: 数字の人物IDが申請の番号と一致すれば、その店舗の登録名が候補になる", () => {
  const c = ctx0({ mirrorPeople: { "0042": { S1: "佐藤", S2: "さとう" }, "p_abcdEFGH": { S1: "田中" } } });
  assert.deepStrictEqual(m.linkCandidatesFor({ displayName: "x", number: "００４２" }, c).map(x => x.name), ["佐藤"]);
  assert.deepStrictEqual(m.linkCandidatesFor({ displayName: "x", number: "42" }, c), []);
  // 写しの名前がいまのスタッフ一覧に無ければ出さない
  const c2 = ctx0({ mirrorPeople: { "0042": { S1: "退職者" } } });
  assert.deepStrictEqual(m.linkCandidatesFor({ displayName: "x", number: "0042" }, c2), []);
});

test("E2 候補 B（登録ネーム）: 空白違いで出る。複数あれば全部並べる。番号と名前の両方が当たれば1件にまとめる", () => {
  assert.deepStrictEqual(m.linkCandidatesFor({ displayName: "山田太郎" }, ctx0()), [{ name: "山田 太郎", methods: ["name"], takenBy: null }]);
  assert.deepStrictEqual(m.linkCandidatesFor({ displayName: "　山田　 太郎" }, ctx0()).map(x => x.name), ["山田 太郎"]);
  assert.deepStrictEqual(m.linkCandidatesFor({ displayName: "山田" }, ctx0()), [], "部分一致はしない");
  const multi = ctx0({ staff: ["山田太郎", "山田 太郎", "鈴木"], staffNumbers: { "鈴木": "7" } });
  assert.deepStrictEqual(m.linkCandidatesFor({ displayName: "山田　太郎", number: "7" }, multi).map(x => [x.name, x.methods.join()]),
    [["山田太郎", "name"], ["山田 太郎", "name"], ["鈴木", "number"]], "候補が複数なら staff の並び順で全部");
  const both = ctx0({ staffNumbers: { "田中": "5" } });
  assert.deepStrictEqual(m.linkCandidatesFor({ displayName: "田 中", number: "5" }, both), [{ name: "田中", methods: ["number", "name"], takenBy: null }]);
});

test("E2 候補: 既に別のアカウントと紐付いた名前は takenBy を持つ（自分自身の紐付けは takenBy にしない）", () => {
  const c = ctx0({ staffLinks: { U9: { name: "田中", method: "code", at: "t" }, U1: { name: "佐藤", method: "name", at: "t" } } });
  assert.strictEqual(m.linkCandidatesFor({ displayName: "田中" }, c)[0].takenBy, "U9");
  assert.strictEqual(m.linkCandidatesFor({ displayName: "佐藤" }, c)[0].takenBy, null);
});

test("E2 splitLinkRequests: 当たる申請は提案、当たらない申請は未リンクの申請。古い順", () => {
  const r = m.splitLinkRequests({ U2: { displayName: "誰か", at: "2026-10-02" }, U1: { displayName: "田中", at: "2026-10-01" }, bad: "x" }, ctx0());
  assert.deepStrictEqual(r.withCand.map(x => x.uid), ["U1"]);
  assert.deepStrictEqual(r.unmatched.map(x => x.uid), ["U2"]);
});

// クライアント（app-my-utils.js）と Cloud Functions（functions/staff-link.js）が同じ規則か。乱数の入力で照合する
test("E2 クライアントと CF の照合規則が一致する（正規化・候補・コード・改名と削除の差分）", () => {
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = a => a[Math.floor(rnd() * a.length)];
  const parts = ["山田", "太郎", " ", "　", "０", "1", "２", "0", "A", "-", "田中", "ﾔﾏﾀﾞ", ""];
  const str = () => Array.from({ length: 1 + Math.floor(rnd() * 4) }, () => pick(parts)).join("");
  for (let i = 0; i < 400; i++) {
    const s = str();
    assert.strictEqual(m.linkNumberKey(s), cf.linkNumberKeyCF(s), `番号 ${JSON.stringify(s)}`);
    assert.strictEqual(m.linkNameKey(s), cf.linkNameKeyCF(s), `名前 ${JSON.stringify(s)}`);
    const staff = Array.from({ length: 4 }, str).filter(Boolean);
    const nums = {}; staff.forEach(n => { if (rnd() < 0.6) nums[n] = str(); });
    const links = {}; staff.forEach((n, j) => { if (rnd() < 0.3) links["U" + j] = { name: n, method: "name", at: "t" }; });
    const people = rnd() < 0.5 ? { "012": { S1: pick(staff.concat(["x"])) } } : null;
    const req = { displayName: str(), number: pick(["012", "１２", str(), ""]) };
    const c = { shopId: "S1", staff, staffNumbers: nums, mirrorPeople: people, staffLinks: links, uid: pick(["U0", "U1", "Z"]) };
    assert.deepStrictEqual(m.linkCandidatesFor(req, c), cf.linkCandidatesForCF(req, c), `候補 ${JSON.stringify({ req, c })}`);
    const o = pick(staff.concat(["無し"])), nn = str() || "新";
    assert.deepStrictEqual(m.renameStaffInStaffLinks(links, o, nn), cf.renameStaffLinksPatchCF(links, o, nn));
    assert.deepStrictEqual(m.dropStaffFromStaffLinks(links, [o]), cf.dropStaffLinksPatchCF(links, [o]));
    assert.strictEqual(m.personIdForShopName(people, "S1", o), cf.personIdForShopNameCF(people, "S1", o));
  }
  assert.strictEqual(m.MY_DISPLAY_NAME_MAX, cf.LINK_NAME_MAX);
  assert.strictEqual(m.MY_NUMBER_MAX, cf.LINK_NUMBER_MAX);
});

test("E2 改名・削除の差分: 旧名の紐付けだけを書き換える／消す", () => {
  const links = { U1: { name: "田中", method: "code", at: "t" }, U2: { name: "佐藤", method: "name", at: "t" } };
  assert.deepStrictEqual(m.renameStaffInStaffLinks(links, "田中", "田中 一郎"), { "U1/name": "田中 一郎" });
  assert.strictEqual(m.renameStaffInStaffLinks(links, "鈴木", "x"), null);
  assert.deepStrictEqual(m.dropStaffFromStaffLinks(links, ["佐藤", "鈴木"]), { U2: null });
  assert.strictEqual(m.dropStaffFromStaffLinks({}, ["田中"]), null);
});

test("E2 resolveMyLink: 名前は staffLinks が正。staffLinks が無い・名前がスタッフ一覧に無い紐付けは使わない", () => {
  const staff = ["田中", "佐藤"];
  assert.deepStrictEqual(m.resolveMyLink("S1", { name: "田中", at: "t" }, { name: "田中", method: "code", at: "t", personId: "0042" }, staff),
    { shopId: "S1", ok: true, name: "田中", personId: "0042", method: "code", at: "t" });
  // オーナーの端末で改名すると staffLinks だけが新しい名前になる（users/ は CF しか書けない）
  assert.strictEqual(m.resolveMyLink("S1", { name: "旧名", at: "t" }, { name: "佐藤", method: "name", at: "t" }, staff).name, "佐藤");
  assert.strictEqual(m.resolveMyLink("S1", { name: "田中", at: "t" }, null, staff).reason, "unlinked", "店舗側で外された");
  assert.strictEqual(m.resolveMyLink("S1", { name: "田中", at: "t" }, { name: "鈴木", method: "name", at: "t" }, staff).reason, "missing", "削除・改名の追随が届かなかった");
  assert.strictEqual(m.resolveMyLink("S1", null, null, staff), null);
  Object.values(m.MY_LINK_INVALID_LABELS).forEach(t => assert.ok(t.length > 0));
});

test("E2 buildLinkRequestRecord", () => {
  assert.deepStrictEqual(m.buildLinkRequestRecord({ displayName: " 田中 ", number: "０１" }, "T"), { displayName: "田中", at: "T", number: "01" });
  assert.deepStrictEqual(m.buildLinkRequestRecord({ displayName: "田中" }, "T"), { displayName: "田中", at: "T" });
});

// ===== E2: Cloud Functions の計画（functions/staff-link.js）=====
const base = () => ({ shopId: "S1", owners: { OWN: "K" }, staff: ["田中", "山田 太郎"], settings: { staffNumbers: { "田中": "012" } }, mirrorPeople: null, staffLinks: {} });

test("E2 承認（planApproveStaffLink）: オーナーだけ・申請が要る・候補の名前だけ・取られた名前と管理者の uid は拒否", () => {
  const ok = cf.planApproveStaffLink({ ...base(), uid: "U1", name: "田中", callerUid: "OWN", nowIso: "T", request: { displayName: "x", number: "０１２", at: "a" } });
  assert.strictEqual(ok.method, "number");
  assert.deepStrictEqual(ok.patch, { "shops/S1/staffLinks/U1": { name: "田中", method: "number", at: "T" }, "users/U1/links/S1": { name: "田中", at: "T" }, "shops/S1/linkRequests/U1": null });
  const nm = cf.planApproveStaffLink({ ...base(), uid: "U1", name: "山田 太郎", callerUid: "OWN", nowIso: "T", request: { displayName: "山田太郎", at: "a" } });
  assert.strictEqual(nm.method, "name");
  const e = o => cf.planApproveStaffLink({ ...base(), uid: "U1", name: "田中", callerUid: "OWN", nowIso: "T", request: { displayName: "田中", at: "a" }, ...o }).error;
  assert.strictEqual(e({ callerUid: "U1" }).code, "permission-denied");
  assert.strictEqual(e({ request: null }).code, "not-found");
  assert.strictEqual(e({ name: "山田 太郎" }).code, "failed-precondition", "候補に無い名前（申請と一致しない）");
  assert.strictEqual(e({ staffLinks: { U9: { name: "田中", method: "code", at: "t" } } }).code, "failed-precondition");
  assert.strictEqual(e({ uid: "OWN" }).code, "failed-precondition", "店舗のオーナーの uid はリンクしない");
  assert.strictEqual(e({ uid: "company_C1" }).code, "failed-precondition");
  // 企業連携の店舗では personId を持つ
  const pp = cf.planApproveStaffLink({ ...base(), mirrorPeople: { "0042": { S1: "田中" } }, uid: "U1", name: "田中", callerUid: "OWN", nowIso: "T", request: { displayName: "田中", at: "a" } });
  assert.strictEqual(pp.patch["shops/S1/staffLinks/U1"].personId, "0042");
  assert.strictEqual(pp.patch["users/U1/links/S1"].personId, "0042");
});

test("個人リンクコード（方式C）は 2026-10-05 に機能ごと削除した: クライアント・CF・ルールに残っていない", () => {
  ["normalizeLinkCode", "isValidLinkCode", "fmtLinkCodeExpiry", "MY_LINK_CODE_LEN", "MY_LINK_CODE_TTL_MS"].forEach(k => assert.strictEqual(m[k], undefined, k));
  ["planIssueStaffLinkCode", "planRedeemStaffLinkCode", "genLinkCodeCF", "normalizeLinkCodeCF", "nextLinkCodeAttemptsCF", "LINK_CODE_LEN"].forEach(k => assert.strictEqual(cf[k], undefined, k));
  const idx = fs.readFileSync(path.join(__dirname, "..", "functions", "index.js"), "utf8");
  assert.ok(!/exports\.(issueStaffLinkCode|redeemStaffLinkCode)\b/.test(idx), "コードの発行と入力の CF は無い");
  const client = ["app-main.js", "app-my.js", "app-admin.js"].map(f => fs.readFileSync(path.join(__dirname, "..", f), "utf8")).join("\n");
  assert.ok(!/issueStaffLinkCode|redeemStaffLinkCode|staffLinkCodes/.test(client), "画面からは呼ばない");
  // 以前にコードで作られた紐付けは method "code" のまま残るので、表示名と CF の受け付ける方式からは外さない
  assert.ok(m.MY_LINK_METHOD_LABELS.code && cf.LINK_METHODS.includes("code"));
});

test("E2 解除（planUnlinkStaff）: 本人かオーナー。両方のノードを消す", () => {
  assert.deepStrictEqual(cf.planUnlinkStaff({ shopId: "S1", callerUid: "U1" }).patch, { "shops/S1/staffLinks/U1": null, "users/U1/links/S1": null });
  assert.strictEqual(cf.planUnlinkStaff({ shopId: "S1", uid: "U1", callerUid: "OWN", owners: { OWN: "K" } }).uid, "U1");
  assert.strictEqual(cf.planUnlinkStaff({ shopId: "S1", uid: "U1", callerUid: "U2", owners: { OWN: "K" } }).error.code, "permission-denied");
});

test("E2 統合・切り出しの後の personId の合わせ直し（staffLinkPersonIdPatchCF）", () => {
  const links = { U1: { name: "田中", personId: "p_dropDROP", method: "name", at: "t" }, U2: { name: "佐藤", method: "code", at: "t" } };
  const people = { "0042": { S1: "田中" } };
  assert.deepStrictEqual(cf.staffLinkPersonIdPatchCF("S1", links, people, { U1: { name: "田中", personId: "p_dropDROP" } }),
    { "shops/S1/staffLinks/U1/personId": "0042", "users/U1/links/S1/personId": "0042" });
  assert.strictEqual(cf.staffLinkPersonIdPatchCF("S1", { U1: { name: "田中", personId: "0042" } }, people, {}), null, "揃っていれば書かない");
  assert.deepStrictEqual(cf.staffLinkPersonIdPatchCF("S1", { U1: { name: "田中", personId: "0042" } }, {}, {}), { "shops/S1/staffLinks/U1/personId": null }, "人物から外れたら消す・users 側は無ければ書かない");
});

// 追随の操作（2026-10-04）: 購読が届く前でも落ちないよう、操作を積んで読み直した staffLinks に当てる
test("追随の操作: 形・世代（操作より後に作られた紐付けには当てない）・保留の列・従来の差分と同じ結果", () => {
  assert.strictEqual(m.staffLinkOpOf("drop", [], null, "t"), null);
  assert.deepStrictEqual(m.staffLinkOpOf("drop", ["佐藤", "佐藤", "", 3], null, "2026-10-04T00:00:00.000Z"), { kind: "drop", names: ["佐藤"], at: "2026-10-04T00:00:00.000Z" });
  assert.deepStrictEqual(m.staffLinkOpOf("rename", "田中", "田中 一郎", "a"), { kind: "rename", from: "田中", to: "田中 一郎", at: "a" });
  assert.strictEqual(m.staffLinkOpOf("rename", "田中", "田中", "a"), null, "名前が変わらなければ操作にしない");
  assert.strictEqual(m.staffLinkOpOf("x", "a", "b", "a"), null);
  const links = {
    OLD: { name: "佐藤", method: "code", at: "2026-10-01T00:00:00.000Z" },
    NEW: { name: "佐藤", method: "name", at: "2026-10-05T00:00:00.000Z" },
    NOAT: { name: "田中", method: "number" },
    REN: { name: "田中", method: "number", at: "2026-10-01T00:00:00.000Z" },
    "bad/key": { name: "佐藤", at: "2026-10-01T00:00:00.000Z" },
  };
  const opAt = "2026-10-04T00:00:00.000Z";
  assert.deepStrictEqual(m.planStaffLinkOp(links, m.staffLinkOpOf("drop", ["佐藤"], null, opAt)), { OLD: null }, "操作より後に作られた NEW は消さない・不正なキーは触らない");
  assert.deepStrictEqual(m.planStaffLinkOp(links, m.staffLinkOpOf("rename", "田中", "田中 一郎", opAt)), { "NOAT/name": "田中 一郎", "REN/name": "田中 一郎" }, "at の無い紐付けは古いものとして扱う");
  assert.strictEqual(m.planStaffLinkOp(links, m.staffLinkOpOf("drop", ["鈴木"], null, opAt)), null);
  assert.strictEqual(m.planStaffLinkOp(links, null), null);
  // at の無い操作（世代を見ない）は従来の差分とまったく同じ
  for (const [o, nn] of [["佐藤", "佐藤 花子"], ["田中", "x"], ["無い人", "y"]]) {
    assert.deepStrictEqual(m.planStaffLinkOp(links, { kind: "drop", names: [o], at: "" }), m.dropStaffFromStaffLinks(links, [o]));
    assert.deepStrictEqual(m.planStaffLinkOp(links, { kind: "rename", from: o, to: nn, at: "" }), m.renameStaffInStaffLinks(links, o, nn));
  }
  assert.deepStrictEqual(m.staffLinksAsOf(links, opAt), { OLD: links.OLD, NOAT: links.NOAT, REN: links.REN, "bad/key": links["bad/key"] });
  // 保留の列
  const q1 = m.enqueueStaffLinkOp(undefined, m.staffLinkOpOf("drop", ["a"], null, "t1"));
  const q2 = m.enqueueStaffLinkOp([...q1, null, { kind: "zzz" }, 5], m.staffLinkOpOf("rename", "a", "b", "t2"));
  assert.deepStrictEqual(q2.map(x => x.kind), ["drop", "rename"], "形の壊れた記録は捨て、順番は保つ");
  let big = [];
  for (let i = 0; i < m.MY_STAFF_LINK_OPS_MAX + 5; i++) big = m.enqueueStaffLinkOp(big, m.staffLinkOpOf("drop", ["n" + i], null, "t"));
  assert.strictEqual(big.length, m.MY_STAFF_LINK_OPS_MAX);
  assert.deepStrictEqual(big[0].names, ["n5"], "上限を超えたら古い方から落とす");
  assert.ok(/保留/.test(m.MY_STAFF_LINK_PENDING_MSG));
});
test("追随の入口: App はキャッシュではなく読み直した staffLinks に操作を当て、失敗は保留して知らせる", () => {
  const main = fs.readFileSync(path.join(ROOT, "app-main.js"), "utf8");
  const blk = main.slice(main.indexOf("const flushStaffLinkOps="), main.indexOf("const flushStaffLinkOps=") + 1800);
  // 2026-10-04: 1つの操作を紐付け（staffLinks）とスタッフ個別URL（staffPages）の両方に当てる（意図して広げた）
  assert.ok(blk.includes(".once(\"value\")") && blk.includes("plan(cur,q[0])") && blk.includes("pending:true"), "読み直して当て、失敗は pending で返す");
  assert.ok(blk.includes('["staffLinks",planStaffLinkOp') && blk.includes('["staffPages",planStaffPageOp'), "紐付けと個別URLの両方に当てる");
  assert.ok(!/staffLinkMapRef/.test(main.replace(/\/\/[^\n]*/g, "")), "購読のキャッシュから差分を作らない");
  assert.ok(/const renameStaffLinks=\(oldName,newName\)=>queueStaffLinkOp\(staffLinkOpOf\("rename"/.test(main));
  assert.ok(/const dropStaffLinks=names=>queueStaffLinkOp\(staffLinkOpOf\("drop"/.test(main));
  assert.ok(/if\(!staffLinksLoaded\|\|!staffLinkOpsActive\(sid\)\|\|!readStaffLinkOps\(sid\)\.length\)return;\s*flushStaffLinkOps\(sid\)/.test(main), "購読が届いたら保留をやり直す");
  const admin = fs.readFileSync(path.join(ROOT, "app-admin.js"), "utf8");
  const calls = admin.match(/sl\.(drop|rename)\(/g) || [];
  const wrapped = admin.match(/staffLinkFollow\(tt,sl\.(drop|rename)\([^;]*/g) || [];
  assert.strictEqual(calls.length, 6, "追随の呼び出しは6か所（改名2・削除・追加・呼び出しの追加・期限切れ）");
  assert.strictEqual(wrapped.join("").match(/sl\.(drop|rename)\(/g).length, 6, "すべて staffLinkFollow で結果を見る（保留を知らせる）");
});

// 改名・削除・統合への追随（計画書のリスク: 落とすと別人の確定シフトが見える）。入口のドリフト検出
test("E2 追随の入口: 改名（StaffTab・CF）・削除・追加・人物の変更がすべて staffLinks を通る", () => {
  const admin = fs.readFileSync(path.join(ROOT, "app-admin.js"), "utf8");
  const ren = admin.slice(admin.indexOf("onRenameStaff={(oldName,newName)=>{"));
  assert.ok(ren.slice(0, 2500).includes("sl.rename(oldName,newName)"), "改名で staffLinks の名前を書き換えていない");
  const cd = admin.slice(admin.indexOf("const confirmDelete=()=>{"));
  assert.ok(cd.slice(0, cd.indexOf("setDelTarget(null);\n    const kept")).includes("sl.drop([n])"), "削除で紐付けを外していない");
  const addFn = admin.slice(admin.indexOf("const add=()=>{"), admin.indexOf("const add=()=>{") + 1200);
  assert.ok(addFn.includes("sl.drop([newName.trim()])"), "追加で同じ名前に残った紐付けを外していない");
  const look = admin.slice(admin.indexOf("const registerLookup=m=>{"), admin.indexOf("const registerLookup=m=>{") + 1200);
  assert.ok(look.includes("sl.drop([name])"), "呼び出しの追加で同じ名前に残った紐付けを外していない");
  const idx = fs.readFileSync(path.join(ROOT, "functions", "index.js"), "utf8");
  const body = idx.slice(idx.indexOf("exports.companyRenameStaff"), idx.indexOf("exports.companyUpdateStaff"));
  assert.ok(body.includes("renameStaffLinksPatchCF") && body.includes("users/${u}/links/${sid}/name"), "CF の改名が staffLinks と users の写しを移していない");
  const spm = idx.slice(idx.indexOf("async function syncPeopleMirror"), idx.indexOf("async function syncPeopleMirror") + 600);
  assert.ok(spm.includes("syncStaffLinkPersonIds"), "人物の変更で personId を合わせ直していない");
  // 人物を変える CF はすべて syncPeopleMirror を通る
  ["ensureCompanyPeople", "mergePeople", "splitPerson", "reassignPersonId", "companyRenameStaff"].forEach(n => {
    const at = idx.indexOf(`exports.${n} =`);
    const b = idx.slice(at, idx.indexOf("\nexports.", at + 10));
    assert.ok(b.includes("syncPeopleMirror("), `${n} が syncPeopleMirror を通らない`);
  });
});

test("E2 ルール: linkRequests は本人（メールのある認証）が書きオーナーが読む／消す。staffLinks は CF が作り、オーナーは削除と名前だけ", () => {
  const rules = JSON.parse(fs.readFileSync(path.join(ROOT, "database.rules.json"), "utf8")).rules;
  const sh = rules.shops.$shopId;
  const own = "root.child('shops').child($shopId).child('owners').child(auth.uid).exists()";
  const lr = sh.linkRequests;
  assert.ok(lr[".read"].includes(own));
  assert.strictEqual(lr.$uid[".read"], "auth != null && auth.uid === $uid");
  assert.match(lr.$uid[".write"], /auth\.uid === \$uid && auth\.token\.email != null/);
  assert.match(lr.$uid[".write"], /!newData\.exists\(\) && root\.child\('shops'\)/, "オーナーは消すだけ");
  assert.match(lr.$uid[".write"], /demo-toriMatsu-v1/);
  assert.match(lr.$uid[".write"], /global'\)\.child\('shops'\)\.child\(\$shopId\)\.exists\(\)/, "存在しない店舗に申請させない");
  assert.strictEqual(lr.$uid.$other[".validate"], false);
  assert.match(lr.$uid.displayName[".validate"], /<= 50/);
  assert.match(lr.$uid.number[".validate"], /<= 8/);
  const sl = sh.staffLinks;
  assert.ok(sl[".read"].includes(own));
  assert.strictEqual(sl[".write"], undefined, "staffLinks 全体への書き込み権限を持たせない");
  assert.strictEqual(sl.$uid[".read"], "auth != null && auth.uid === $uid", "本人は自分の紐付けを読める");
  assert.match(sl.$uid[".write"], /^auth != null && !newData\.exists\(\) && /, "オーナーは $uid を消すだけ（作れない）");
  assert.match(sl.$uid.name[".write"], /data\.exists\(\) && newData\.exists\(\)/, "名前は既存の紐付けの書き換えだけ");
  assert.strictEqual(sl.$uid.method[".write"], undefined);
  assert.strictEqual(sl.$uid.$other[".validate"], false);
  // 個人リンクコードのノードは 2026-10-05 に機能ごと削除した（ルールが無い＝クライアントからは読み書きできない。残りのデータは purgeInactiveShops が消す）
  ["staffLinkCodes", "staffLinkCodeIndex", "staffLinkCodeAttempts"].forEach(k => assert.strictEqual(rules[k], undefined, k));
  assert.strictEqual(rules.users.$uid.links, undefined, "users/{uid}/links は書き込みルールを持たない（CF だけ）");
});

// ===== E3: マイシフト =====
const U = require("../app-utils.js");
const E3P = { id: "p1", startDate: "2026-10-16", endDate: "2026-10-31" };
const E3Pub = { ...E3P, published: { at: "2026-10-10T00:00:00Z", byUid: "OWN" } };
const E3Subs = [
  { id: "s1", periodId: "p1", staffName: "田中", shifts: {
    "2026-10-17": { status: "work", start: "10:00", end: "15:00" },
    "2026-10-18": { status: "work", start: "17:00", end: "23:00", adjustedStart: "18:00" },
    "2026-10-19": { status: "holiday" },
    "2026-10-20": { status: "work", start: "10:00", end: "15:00", adminRest: { start: true, end: true } } } },
  { id: "s2", periodId: "p1", staffName: "佐藤", shifts: { "2026-10-17": { status: "work", start: "9:00", end: "18:00" } } },
];
const e3Base = over => ({ shopId: "S1", shopName: "A店", color: "#f87036", name: "田中", periods: [E3P], subsByPeriod: { p1: E3Subs },
  settings: { staffAliases: {} }, staff: ["田中", "佐藤"], todayStr: "2026-10-16", premium: true, ...over });

test("E3 buildMyShiftDays: 未公開は本人の提出（希望）をグレーで出す。休みの日と他人の提出は出さない", () => {
  const es = m.buildMyShiftDays(e3Base(), U);
  assert.deepStrictEqual(es.map(e => [e.date, e.kind, m.fmtMyRange(e)]), [
    ["2026-10-17", "submitted", "10:00〜15:00"], ["2026-10-18", "submitted", "17:00〜23:00"], ["2026-10-20", "submitted", "10:00〜15:00"]]);
  assert.ok(es.every(e => e.shopId === "S1" && e.periodId === "p1" && e.confirmed === false));
});
test("E3 buildMyShiftDays: 公開済みは scheduledDay（調整値を反映）を黒で出し、出勤にならなかった日は出さない。提出と違えば希望を持つ", () => {
  const es = m.buildMyShiftDays(e3Base({ periods: [E3Pub] }), U);
  assert.deepStrictEqual(es.map(e => [e.date, e.kind, m.fmtMyRange(e), e.differs]), [
    ["2026-10-17", "published", "10:00〜15:00", false], ["2026-10-18", "published", "18:00〜23:00", true]],
    "管理者の休み（adminRest）にした 20日は出さない・18日は調整後の時刻");
  assert.deepStrictEqual(es[1].hope, { startMin: 17 * 60, endMin: 23 * 60 });
  assert.strictEqual(es[0].workMin, 300);
  const conf = m.buildMyShiftDays(e3Base({ periods: [{ ...E3Pub, confirmation: { at: "t" } }] }), U);
  assert.ok(conf.every(e => e.confirmed), "確定済みなら confirmed");
});
test("E3 buildMyShiftDays: Premium でないと公開済みでもグレー（提出）のまま。読めていない期間は出さない。別名で出した提出も拾う", () => {
  assert.ok(m.buildMyShiftDays(e3Base({ periods: [E3Pub], premium: false }), U).every(e => e.kind === "submitted"));
  assert.deepStrictEqual(m.buildMyShiftDays(e3Base({ subsByPeriod: {} }), U), []);
  const aliasSubs = [{ ...E3Subs[0], staffName: "たなか" }];
  const es = m.buildMyShiftDays(e3Base({ periods: [E3Pub], subsByPeriod: { p1: aliasSubs }, settings: { staffAliases: { "田中": ["たなか"] } } }), U);
  assert.strictEqual(es.length, 2, "別名の提出");
  assert.deepStrictEqual(m.buildMyShiftDays(e3Base({ name: "" }), U), []);
});
test("E3 buildMyShiftDays: 確定・終了済みの期間は写しの設定で数える（退勤延長は写しの値）。その期間に非表示の人は公開分を出さない", () => {
  const snapP = { ...E3Pub, confirmation: { at: "t" }, snapshot: { staffList: ["田中"], settings: { overtimeSettings: { byStaff: { "田中": { lunch: 30, dinner: 0 } } } } } };
  const es = m.buildMyShiftDays(e3Base({ periods: [snapP], settings: { staffAliases: {}, overtimeSettings: { byStaff: {} } } }), U);
  assert.strictEqual(m.fmtMyRange(es[0]), "10:00〜15:30", "写しの退勤延長");
  const hidden = m.buildMyShiftDays(e3Base({ periods: [E3Pub], settings: { staffAliases: {}, staffHidden: { "田中": true } } }), U);
  assert.deepStrictEqual(hidden, []);
});
test("E3 変更あり: 指紋は本人の公開内容だけで作る。他人の変更では変わらず、自分の時刻・休憩の変更・日の追加と削除で変わる", () => {
  const fp = subs => m.myPublishedFingerprints(m.buildMyShiftDays(e3Base({ periods: [E3Pub], subsByPeriod: { p1: subs } }), U), ["S1|p1"])["S1|p1"];
  const before = fp(E3Subs);
  const seen = m.buildMySeenRecord(before, "2026-10-11T00:00:00Z");
  assert.deepStrictEqual(m.myChangedDates(seen, fp(E3Subs)), []);
  const others = [E3Subs[0], { ...E3Subs[1], shifts: { "2026-10-17": { status: "work", start: "12:00", end: "20:00" } } }];
  assert.deepStrictEqual(m.myChangedDates(seen, fp(others)), [], "他人の変更では付かない");
  const mine = [{ ...E3Subs[0], shifts: { ...E3Subs[0].shifts, "2026-10-17": { status: "work", start: "10:00", end: "16:00" }, "2026-10-21": { status: "work", start: "10:00", end: "14:00" } } }];
  assert.deepStrictEqual(m.myChangedDates(seen, fp([mine[0], E3Subs[1]])), ["2026-10-17", "2026-10-21"], "17日の時刻・21日の追加");
  const gone = { ...E3Subs[0], shifts: { ...E3Subs[0].shifts, "2026-10-18": { status: "holiday" } } };
  assert.deepStrictEqual(m.myChangedDates(seen, fp([gone, E3Subs[1]])), ["2026-10-18"], "出勤が無くなった日");
  assert.strictEqual(m.myChangedDates(undefined, before), null, "前回の記録が無ければ比べない（初回）");
  assert.deepStrictEqual(m.buildMySeenRecord({}, "t"), { at: "t" }, "出勤の無い公開は at だけ");
  assert.notStrictEqual(m.myDayFingerprint({ startMin: 600, endMin: 900, breakMin: 0, segments: [] }), m.myDayFingerprint({ startMin: 600, endMin: 900, breakMin: 30, segments: [] }), "休憩の変更");
  assert.notStrictEqual(m.myDayFingerprint({ startMin: 600, endMin: 900, breakMin: 0, segments: [] }),
    m.myDayFingerprint({ startMin: 600, endMin: 900, breakMin: 0, segments: [{ startMin: 1380, endMin: 1500, extra: true }] }), "締の追加出勤");
});
test("E3 次のシフト・月のカレンダー・期間の読み込み範囲", () => {
  const es = [{ date: "2026-10-15", kind: "published" }, { date: "2026-10-16", kind: "submitted" }, { date: "2026-10-18", kind: "published", shopId: "S1" }];
  assert.strictEqual(m.nextMyShift(es, "2026-10-16").date, "2026-10-18", "今日以降の公開済みの出勤だけ（グレーは次のシフトにしない）");
  assert.strictEqual(m.nextMyShift(es, "2026-10-19"), null);
  const g = m.myMonthGrid("2026-10");
  assert.strictEqual(g[0][0].date, "2026-09-27", "日曜はじまり");
  assert.strictEqual(g.flat().filter(c => c.inMonth).length, 31);
  assert.ok(g.every(w => w.length === 7));
  assert.strictEqual(m.myMonthGrid("2026-02").length, 4, "2026年2月は1日が日曜・28日なのでちょうど4週");
  assert.strictEqual(m.myMonthGrid("2026-08").length, 6, "2026年8月は1日が土曜なので6週");
  assert.deepStrictEqual(m.myMonthGrid("x"), []);
  assert.strictEqual(m.myShiftMonth("2026-01", -1), "2025-12");
  assert.strictEqual(m.myShiftMonth("2026-12", 1), "2027-01");
  const ps = [{ id: "a", startDate: "2026-08-01", endDate: "2026-08-15" }, { id: "b", startDate: "2026-09-16", endDate: "2026-10-03" }, { id: "c", startDate: "2026-11-01", endDate: "2026-11-15" }];
  assert.deepStrictEqual(m.myShiftPeriodsToRead(ps, "2026-10", "2026-10-04").map(p => p.id), ["b", "c"], "表示中の月にかかる期間と今日以降の期間");
  assert.deepStrictEqual(m.myShiftPeriodsToRead(ps, "2026-08", "2026-10-04").map(p => p.id), ["a", "c"]);
});
test("E3 プランと勤務先の色: いずれかの店舗が Premium なら公開済みを出す。色は既定の並びで、差し替え口で上書きできる", () => {
  assert.strictEqual(m.myShiftPremiumOf(["free", "premium"], U), true);
  assert.strictEqual(m.myShiftPremiumOf(["free", "pro", undefined], U), false);
  assert.strictEqual(m.myShiftPremiumOf([], U), false);
  assert.strictEqual(m.myWorkplaceColor("S1", 0), "#f87036");
  assert.strictEqual(m.myWorkplaceColor("S2", 1), m.MY_WORKPLACE_COLORS[1]);
  assert.strictEqual(m.myWorkplaceColor("S2", m.MY_WORKPLACE_COLORS.length), "#f87036", "一巡したら先頭へ");
  assert.strictEqual(m.myWorkplaceColor("S2", 1, { S2: "#123456" }), "#123456");
  assert.strictEqual(m.myWorkplaceColor("S2", 1, { S2: "red" }), m.MY_WORKPLACE_COLORS[1], "形の違う色は使わない");
  assert.strictEqual(m.fmtMyClock(25 * 60 + 5), "25:05");
  assert.strictEqual(m.fmtMyClock(null), "");
});
test("E3 database.rules.json: users/$uid/seen はメールのある本人だけ書け、at と日付キーの指紋だけを持つ", () => {
  const rules = JSON.parse(fs.readFileSync(path.join(ROOT, "database.rules.json"), "utf8")).rules;
  const p = rules.users.$uid.seen.$shopId.$periodId;
  assert.strictEqual(p[".write"], "auth != null && auth.uid === $uid && auth.token.email != null");
  assert.ok(/hasChildren\(\['at'\]\)/.test(p[".validate"]));
  assert.ok(/\$date\.matches/.test(p.days.$date[".validate"]));
  assert.strictEqual(p.$other[".validate"], false);
  assert.strictEqual(rules.users.$uid[".write"], undefined, "users/$uid 全体の書き込みは許さない");
});
test("E3/E4 マイシフトと勤務先の書き込みは users/{uid}/ の下だけ（店舗のデータに書かない）", () => {
  const src = fs.readFileSync(path.join(ROOT, "app-my.js"), "utf8");
  // 終わりは給料（E5）の部分の手前。給料の書き込みは E5 のテストが別に見る（意図して区切りを動かした）
  const a = src.indexOf("async function readMyShiftShop"), b = src.indexOf("function useMyPayExtras(");
  assert.ok(a > 0 && b > a);
  const body = src.slice(a, b);
  // DB への書き込みだけを数える（E6 の会社設定の結果を覚える Map と、2026-10-04 の店舗の読み込みを共有する Map の .set は書き込みではない）
  const writes = [...body.matchAll(/\b(fbSet|fbUpd)\(\s*`?([^,`)]*)/g)].map(x => x[1] + " " + x[2]);
  assert.ok(!/\.ref\([^)]*\)\.(set|update|remove)\(/.test(body), "ref() から直接書かない");
  assert.deepStrictEqual([...body.matchAll(/(\w+)\.set\(/g)].map(x => x[1]).filter(n => n !== "_myCompanyPayCache" && n !== "_myShopReads"), [], "Map 以外の .set が無い");
  // E3 は seen だけ。E4 で本人のデータ（workplaces・shifts・overrides）を users/{uid} への差分 update で書く（意図して広げた）。
  // 2026-10-04: 基点は本人（subject）の base（users/{uid} か staffPageData/{pageToken}）になった（意図して広げた。下で base の出どころを固定）
  assert.deepStrictEqual(writes, ["fbUpd base", "fbSet ${base}/seen/${sid}/${pid}"]);
  assert.ok(/function myAccountSubject\(uid\)\{\s*return uid\?\{kind:"account",key:"u:"\+uid,base:`users\/\$\{uid\}`/.test(src), "アカウントの基点は users/{uid}");
  assert.ok(/base:`staffPageData\/\$\{x\.token\}`/.test(src), "個別URLの基点は staffPageData/{pageToken}");
  assert.strictEqual((src.match(/base:`/g) || []).length, 2, "基点を作るのはこの2か所だけ");
  // users/{uid} への update の鍵は workplaces・shifts・overrides の3つだけ
  const keys = [...body.matchAll(/\[`(workplaces|shifts|overrides|[a-z]+)\/\$\{/g)].map(x => x[1]);
  assert.ok(keys.length >= 5 && keys.every(k => ["workplaces", "shifts", "overrides"].includes(k)), JSON.stringify(keys));
  assert.ok(/orderByChild\("periodId"\)\.equalTo\(pid\)/.test(body), "subs は期間ごとの部分読み");
  assert.ok(!/ref\(`shops\/\$\{sid\}\/subs`\)\.once/.test(body), "店舗の subs 全件を読まない");
  assert.ok(!/ref\([^)]*\)\.(push|transaction)\(/.test(body), "push・transaction で書かない");
  assert.ok(!/fbSet\(`users\/\$\{uid\}\/(shifts|workplaces|overrides)`/.test(body), "コレクション全体を set() しない");
});

// ===== E4: 手入力の勤務先とシフト・実績の上書き・.ics =====
test("E4 parseMyClockInput: 直接入力（9・930・1730・9:30・全角・24時超え）を HH:MM にする。30:00 を超える・読めない入力は null", () => {
  const cases = { "9": "09:00", "930": "09:30", "1730": "17:30", "9:30": "09:30", "９：３０": "09:30", " 25:00 ": "25:00", "30:00": "30:00", "2400": "24:00", "0:05": "00:05" };
  Object.entries(cases).forEach(([i, o]) => assert.strictEqual(m.parseMyClockInput(i), o, i));
  ["30:05", "31", "9:60", "abc", "12345", "9:3x"].forEach(i => assert.strictEqual(m.parseMyClockInput(i), null, i));
  assert.strictEqual(m.parseMyClockInput(""), "");
  // 2026-10-05 ユーザー指示: 時刻は時と分の2列ホイールで1分刻み（以前は15分刻みのプルダウン）。休憩は15分刻みのプルダウンのまま
  assert.strictEqual(m.MY_TIME_STEP_MIN, 1);
  assert.strictEqual(m.MY_TIME_OPTIONS.length, 1801, "0:00〜30:00 の1分刻み");
  assert.deepStrictEqual([m.MY_TIME_OPTIONS[0], m.MY_TIME_OPTIONS[1], m.MY_TIME_OPTIONS[1800]], [{ value: "00:00", label: "0:00" }, { value: "00:01", label: "0:01" }, { value: "30:00", label: "30:00" }]);
  assert.ok(m.MY_TIME_OPTIONS.some(o => o.value === "24:00") && m.MY_TIME_OPTIONS.some(o => o.value === "26:00" && o.label === "26:00"), "24時超えの表記を選べる");
  assert.ok(m.MY_TIME_OPTIONS.every(o => m.parseMyClockInput(o.value) === o.value), "選択肢は保存の形のまま検証を通る");
  assert.deepStrictEqual(m.MY_TIME_WHEEL_VALUES, m.MY_TIME_OPTIONS.map(o => o.value));
  assert.strictEqual(m.myTimeSelectOptions, undefined, "1分刻みで全部の値が入るので、今の値を足す関数は持たない");
  const wm = U.timeWheelModel(m.MY_TIME_WHEEL_VALUES);
  assert.deepStrictEqual([wm.hours[0], wm.hours[wm.hours.length - 1], wm.hours.length], [0, 30, 31], "時は 0〜30");
  assert.deepStrictEqual([wm.minutes[9].length, wm.minutes[9][0], wm.minutes[9][59]], [60, 0, 59], "分は 00〜59");
  assert.deepStrictEqual(wm.minutes[30], [0], "30時は 00 分だけ");
  assert.strictEqual(U.timeWheelPick(wm, 30, 45), "30:00", "30時を選ぶと分は 00 に寄る");
  assert.strictEqual(U.timeWheelPick(wm, 9, 5), "09:05");
  assert.deepStrictEqual(m.MY_BREAK_OPTIONS, [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180]);
  assert.deepStrictEqual(m.myBreakSelectOptions("10").slice(0, 3), [0, 10, 15]);
  assert.deepStrictEqual(m.myBreakSelectOptions("240").slice(-2), [180, 240], "180分を超える休憩も残す");
  assert.strictEqual(m.myBreakSelectOptions(""), m.MY_BREAK_OPTIONS);
  const myjs0 = fs.readFileSync(path.join(ROOT, "app-my.js"), "utf8");
  const inputs = myjs0.slice(myjs0.indexOf("function MyTimeInput("), myjs0.indexOf("// 開始・終了・休憩の3欄"));
  assert.ok(!/<input/.test(inputs) && (inputs.match(/<select /g) || []).length === 1, "休憩だけが select・時刻は自由記入の欄なし");
  assert.ok(/<TimeWheelField[^>]*options=\{MY_TIME_WHEEL_VALUES\}/.test(inputs), "時刻は1分刻みのホイール");
  assert.ok(/myBreakSelectOptions\(value\)/.test(inputs) && /style=\{AI\}/.test(inputs), "休憩は今の値を保つ選択肢・16px（AI）");
  assert.strictEqual(m.parseMyMinutesInput(""), 0);
  assert.strictEqual(m.parseMyMinutesInput("６０"), 60);
  assert.strictEqual(m.parseMyMinutesInput("1441"), null);
  assert.strictEqual(m.parseMyMinutesInput("-5"), null);
});
test("E4 validateMyShiftInput: 勤務先・日付・時刻・24時超えの案内・休憩が勤務より長い・メモの上限", () => {
  const ok = { workplaceId: "m_ABCDEFGH", date: "2026-10-04", start: "9:00", end: "17:00", breakMin: "60", memo: "" };
  assert.strictEqual(m.validateMyShiftInput(ok, { workplaceIds: ["m_ABCDEFGH"] }), null);
  assert.match(m.validateMyShiftInput({ ...ok, workplaceId: "" }).error, /勤務先/);
  assert.match(m.validateMyShiftInput(ok, { workplaceIds: ["m_ZZZZZZZZ"] }).error, /勤務先/, "消えた勤務先");
  assert.match(m.validateMyShiftInput({ ...ok, workplaceId: "S1" }).error, /勤務先/, "Shifty の店舗には手入力のシフトを入れない");
  ["2026-02-30", "2026-13-01", "20261004", ""].forEach(d => assert.match(m.validateMyShiftInput({ ...ok, date: d }).error, /日付/, d));
  const night = m.validateMyShiftInput({ ...ok, start: "18:00", end: "2:00", breakMin: "" });
  assert.match(night.error, /26:00/);
  assert.strictEqual(night.suggestEnd, "26:00", "退勤が開始より前なら 24時を足した時刻を案内する");
  assert.strictEqual(m.validateMyShiftInput({ ...ok, start: "08:00", end: "07:00" }).suggestEnd, null, "24時を足すと 30:00 を超えるなら案内しない");
  assert.strictEqual(m.validateMyShiftInput({ ...ok, start: "18:00", end: "26:00", breakMin: "0" }), null, "24時超え表記はそのまま通る");
  assert.match(m.validateMyShiftInput({ ...ok, start: "9:00", end: "9:00" }).error, /前/);
  assert.match(m.validateMyShiftInput({ ...ok, breakMin: "480" }).error, /休憩/, "休憩が勤務の長さ以上");
  assert.match(m.validateMyShiftInput({ ...ok, breakMin: "abc" }).error, /休憩/);
  assert.match(m.validateMyShiftInput({ ...ok, end: "" }).error, /入力/);
  assert.match(m.validateMyShiftInput({ ...ok, memo: "あ".repeat(201) }).error, /メモ/);
  assert.deepStrictEqual(m.buildMyShiftRecord({ ...ok, start: "930", end: "1730", breakMin: "" }), { workplaceId: "m_ABCDEFGH", date: "2026-10-04", start: "09:30", end: "17:30", breakMin: 0 });
  assert.deepStrictEqual(m.buildMyShiftRecord({ ...ok, memo: " 研修 " }).memo, "研修", "メモは前後の空白を落とし、空ならキーを持たない");
});
test("E4 ID: 手入力の勤務先は m_+8桁、シフトは h_+10桁（ルールの形と同じ）", () => {
  const rnd = n => Array.from({ length: n }, (_, i) => i * 37);
  const w = m.genMyRecordId("m_", 8, rnd), s = m.genMyRecordId("h_", 10, rnd);
  assert.ok(m.MY_MANUAL_WP_ID_RE.test(w) && m.MY_SHIFT_ID_RE.test(s), w + " " + s);
  assert.strictEqual(m.genMyRecordId("m_", 8, rnd), w, "同じ乱数なら同じ ID");
});
const E4L = [{ shopId: "S1", shopName: "A店", ok: true, name: "田中" }, { shopId: "S2", shopName: "B店", ok: true, name: "田中 太郎" }];
const E4W = { S2: { kind: "shifty", shopId: "S2", color: "#8a5a9e", name: "B店（梅田）" }, m_CAFE0001: { kind: "manual", name: "カフェ", color: "#4f7d4a" },
  m_AAAA0002: { kind: "manual", name: "あ書店", color: "#a3742c" }, S9: { kind: "shifty", shopId: "S9", color: "#6b6b6b", pay: { x: 1 } }, bad: { kind: "manual", name: "x" } };
test("E4 myWorkplaceList: Shifty の店舗（リンク順・既定の色）→ 手入力（名前順）→ リンク解除済み。本人の名前と色が効く", () => {
  const l = m.myWorkplaceList(E4L, E4W);
  assert.deepStrictEqual(l.map(w => [w.id, w.kind, w.name, w.color, w.linked]), [
    ["S1", "shifty", "A店", "#f87036", true], ["S2", "shifty", "B店（梅田）", "#8a5a9e", true],
    ["m_AAAA0002", "manual", "あ書店", "#a3742c", false], ["m_CAFE0001", "manual", "カフェ", "#4f7d4a", false],
    ["S9", "shifty", "（リンク解除済みのお店）", "#6b6b6b", false]]);
  assert.ok(!l.some(w => w.id === "bad"), "形の違う ID の手入力の勤務先は出さない");
  assert.strictEqual(m.myWorkplaceList(E4L, {})[1].color, m.MY_WORKPLACE_COLORS[1], "記録が無ければ E3 と同じ既定の色");
  assert.strictEqual(m.myNextWorkplaceColor(l), "#2f6f9f", "使っていないプリセットの先頭");
});
test("E4 勤務先の検証と update の中身（pay を消さない・店舗名と同じ名前は持たない）", () => {
  assert.match(m.validateMyWorkplaceInput({ name: " ", color: "#f87036" }, "manual"), /名前/);
  assert.strictEqual(m.validateMyWorkplaceInput({ name: "", color: "#f87036" }, "shifty"), null, "Shifty の店舗は空欄＝店舗名");
  assert.match(m.validateMyWorkplaceInput({ name: "x", color: "#123456" }, "manual"), /色/, "プリセット以外の色は選べない");
  assert.match(m.validateMyWorkplaceInput({ name: "あ".repeat(31), color: "#f87036" }, "manual"), /30文字/);
  const s1 = { kind: "shifty", shopId: "S1", shopName: "A店" };
  assert.deepStrictEqual(m.buildMyWorkplacePatch({ name: "A店", color: "#2f6f9f" }, s1), { kind: "shifty", shopId: "S1", color: "#2f6f9f", name: null });
  assert.deepStrictEqual(m.buildMyWorkplacePatch({ name: " 本店 ", color: "#2f6f9f" }, s1).name, "本店");
  const p = m.buildMyWorkplacePatch({ name: "カフェ", color: "#4f7d4a" }, { kind: "manual" });
  assert.deepStrictEqual(p, { kind: "manual", name: "カフェ", color: "#4f7d4a" });
  assert.ok(!("pay" in p), "pay は E5 の担当（update で触らない）");
});
const E4Shifts = {
  h_0000000001: { workplaceId: "m_CAFE0001", date: "2026-10-17", start: "09:00", end: "13:00", breakMin: 0, memo: "朝" },
  h_0000000002: { workplaceId: "m_CAFE0001", date: "2026-10-10", start: "09:00", end: "13:00", breakMin: 0 },
  h_0000000003: { workplaceId: "m_CAFE0001", date: "2026-10-12", start: "18:00", end: "26:00", breakMin: 30 },
  h_0000000004: { workplaceId: "m_GONE0001", date: "2026-10-17", start: "09:00", end: "10:00", breakMin: 0 },
  h_0000000005: { workplaceId: "m_AAAA0002", date: "2026-10-01", start: "10:00", end: "15:00", breakMin: 15 },
};
test("E4 手入力のシフトの entry: 同じ日に Shifty と手入力が並ぶ（開始順）。消えた勤務先のシフトは出さない。次のシフトに手入力も入る", () => {
  const list = m.myWorkplaceList(E4L, E4W);
  const man = m.buildMyManualDays(list, E4Shifts);
  assert.deepStrictEqual(man.map(e => [e.date, e.workplaceId, e.kind, m.fmtMyRange(e), e.workMin]), [
    ["2026-10-01", "m_AAAA0002", "manual", "10:00〜15:00", 285], ["2026-10-10", "m_CAFE0001", "manual", "9:00〜13:00", 240],
    ["2026-10-12", "m_CAFE0001", "manual", "18:00〜26:00", 450], ["2026-10-17", "m_CAFE0001", "manual", "9:00〜13:00", 240]]);
  assert.strictEqual(man[3].memo, "朝");
  assert.strictEqual(man[3].color, "#4f7d4a");
  const shifty = m.buildMyShiftDays(e3Base({ periods: [E3Pub] }), U);
  const all = [...shifty, ...man].sort(m.myEntryOrder);
  assert.deepStrictEqual(all.filter(e => e.date === "2026-10-17").map(e => [e.kind, m.fmtMyRange(e)]), [["manual", "9:00〜13:00"], ["published", "10:00〜15:00"]], "同じ日は開始の早い順");
  assert.strictEqual(m.nextMyShift(all, "2026-10-11").date, "2026-10-12", "手入力のシフトも次のシフトになる");
  assert.strictEqual(m.nextMyShift([{ date: "2026-10-12", kind: "submitted" }], "2026-10-11"), null, "グレーは次のシフトにしない");
});
test("E4 履歴から追加: 同じ勤務先の時間帯を新しい順に、同じ時間帯はまとめる。重複の判定", () => {
  const h = m.myShiftHistoryCandidates(E4Shifts, "m_CAFE0001", 5);
  assert.deepStrictEqual(h.map(x => x.label), ["9:00〜13:00", "18:00〜26:00（休憩30分）"]);
  assert.deepStrictEqual(h[0], { start: "09:00", end: "13:00", breakMin: 0, label: "9:00〜13:00" });
  assert.strictEqual(m.myShiftHistoryCandidates(E4Shifts, "m_CAFE0001", 1).length, 1);
  assert.deepStrictEqual(m.myShiftHistoryCandidates(E4Shifts, "m_NONE0000"), []);
  const dup = m.myShiftDuplicateOf(E4Shifts, { workplaceId: "m_CAFE0001", date: "2026-10-10", start: "09:00", end: "13:00" });
  assert.strictEqual(dup[0], "h_0000000002");
  assert.strictEqual(m.myShiftDuplicateOf(E4Shifts, { workplaceId: "m_CAFE0001", date: "2026-10-10", start: "09:00", end: "13:00" }, "h_0000000002"), null, "編集中のシフト自身は重複にしない");
});
test("E4 実績の上書き: 給料の1日にだけ効き、表示の時刻は公開内容のまま（2026-10-04 ユーザー指示）。締の追加出勤は残る。指紋（変更あり）は公開内容のまま。公開と同じ値なら消す", () => {
  const ov = { "2026-10-18": { start: "18:00", end: "23:30", breakMin: 15 } };
  const base = m.buildMyShiftDays(e3Base({ periods: [E3Pub] }), U);
  const es = m.buildMyShiftDays(e3Base({ periods: [E3Pub], overrides: ov }), U);
  const d18 = es.find(e => e.date === "2026-10-18");
  assert.strictEqual(m.fmtMyRange(d18), "18:00〜23:00", "表示の時刻は公開内容（上書きはシフトの表示に出さない）");
  assert.deepStrictEqual([d18.breakMin, d18.workMin], [0, 300], "表示の休憩・実働も公開内容");
  assert.deepStrictEqual(["startMin", "endMin", "breakMin", "workMin", "segments"].map(k => d18[k]), ["startMin", "endMin", "breakMin", "workMin", "segments"].map(k => d18.sched[k]));
  assert.ok(d18.overridden && d18.actual && d18.actual.breakMin === 15 && d18.actual.workMin === 315 && m.fmtMyRange(d18.actual) === "18:00〜23:30", JSON.stringify(d18));
  assert.strictEqual(d18.actualDay.workMin, 315, "給料に渡す actualDay は上書き適用後");
  assert.strictEqual(m.nextMyShift(es, "2026-10-18").startMin, d18.sched.startMin, "次のシフトも公開内容");
  assert.ok(/T230000/.test(m.buildMyIcs([d18], { nowIso: "2026-10-04T00:00:00Z" }).text) && !/T233000/.test(m.buildMyIcs([d18], { nowIso: "2026-10-04T00:00:00Z" }).text), ".ics も公開の時刻");
  assert.deepStrictEqual(m.myPublishedFingerprints(es, ["S1|p1"]), m.myPublishedFingerprints(base, ["S1|p1"]), "上書きしても指紋は変わらない＝変更ありにならない");
  assert.ok(!es.find(e => e.date === "2026-10-17").overridden);
  // 締の追加出勤
  const subsX = [{ ...E3Subs[0], shifts: { "2026-10-18": { status: "work", start: "17:00", end: "22:00", extraStart: "23:00", extraEnd: "25:00", adjustedStartFixed: true } } }];
  const ex = m.buildMyShiftDays(e3Base({ periods: [E3Pub], subsByPeriod: { p1: subsX }, overrides: { "2026-10-18": { start: "17:00", end: "21:00", breakMin: 0 } } }), U)[0];
  assert.deepStrictEqual(ex.actual.segments.map(g => [g.startMin, g.endMin, g.extra]), [[1020, 1260, false], [1380, 1500, true]], "上書きは主シフトだけ・追加出勤は残す");
  assert.strictEqual(ex.actual.workMin, 240 + 120);
  assert.deepStrictEqual(ex.segments.map(g => [g.startMin, g.endMin, g.extra]), [[1020, 1320, false], [1380, 1500, true]], "表示は公開内容のまま");
  // 壊れた上書きは使わない
  const broken = m.buildMyShiftDays(e3Base({ periods: [E3Pub], overrides: { "2026-10-18": { start: "20:00", end: "19:00", breakMin: 0 } } }), U);
  assert.ok(!broken.find(e => e.date === "2026-10-18").overridden);
  // Premium でない（グレー）なら上書きは効かない
  assert.ok(m.buildMyShiftDays(e3Base({ periods: [E3Pub], premium: false, overrides: ov }), U).every(e => !e.overridden));
  // 入力 → 記録
  assert.deepStrictEqual(m.planMyOverride({ start: "18:00", end: "23:00", breakMin: "0" }, d18.sched), { remove: true }, "公開と同じなら消す");
  assert.deepStrictEqual(m.planMyOverride({ start: "1800", end: "2330", breakMin: "15" }, d18.sched), { record: { start: "18:00", end: "23:30", breakMin: 15 } });
  assert.strictEqual(m.planMyOverride({ start: "18:00", end: "1:00", breakMin: "" }, d18.sched).suggestEnd, "25:00");
});
test("E4 給料計算（E5）に渡す1日の勤務: 未公開を除き、公開・上書き・手入力を同じ形で返す。Shifty の日は resolveActualDay の値を持つ", () => {
  const ov = { "2026-10-18": { start: "18:00", end: "23:30", breakMin: 15 } };
  const es = [...m.buildMyShiftDays(e3Base({ periods: [E3Pub], overrides: ov }), U), ...m.buildMyManualDays(m.myWorkplaceList(E4L, E4W), E4Shifts),
    ...m.buildMyShiftDays(e3Base({ shopId: "S2" }), U)].sort(m.myEntryOrder);
  const days = m.myPayWorkDays(es);
  assert.ok(days.every(d => d.source !== undefined && d.kind !== "submitted"));
  assert.ok(!days.some(d => d.shopId === "S2"), "未公開（グレー）は入れない");
  const d18 = days.find(d => d.date === "2026-10-18");
  assert.deepStrictEqual([d18.kind, d18.source, d18.workplaceId, d18.workMin], ["shifty", "override", "S1", 315]);
  assert.strictEqual(d18.actualDay.workMin, 315, "actualDay は resolveActualDay（上書き適用後）");
  assert.strictEqual(d18.actualDay.scheduledWorkMin, 300, "所定は公開内容");
  const d17 = days.filter(d => d.date === "2026-10-17");
  assert.deepStrictEqual(d17.map(d => [d.kind, d.source]), [["manual", "manual"], ["shifty", "published"]]);
  assert.strictEqual(d17[0].actualDay, null);
});
test("E4 .ics: VTIMEZONE と TZID=Asia/Tokyo・24時超えは翌日・締の追加出勤は別イベント・エスケープ・75オクテットの折り返し・CRLF・UID は固定", () => {
  const es = [
    { kind: "published", date: "2026-10-31", shopId: "eb6A+cX*xP", shopName: "A店; 本店, 梅田\\北", startMin: 22 * 60, endMin: 26 * 60, breakMin: 30, confirmed: true,
      segments: [{ startMin: 22 * 60, endMin: 26 * 60, extra: false }, { startMin: 26 * 60 + 30, endMin: 27 * 60, extra: true }] },
    { kind: "manual", date: "2026-10-12", shiftId: "h_0000000003", workplaceId: "m_CAFE0001", shopName: "カフェ", startMin: 18 * 60, endMin: 26 * 60, breakMin: 0,
      segments: [{ startMin: 18 * 60, endMin: 26 * 60, extra: false }], memo: "長い説明" + "あ".repeat(40) },
    { kind: "submitted", date: "2026-10-13", shopId: "S2", shopName: "B店", startMin: 600, endMin: 900, segments: [] },
    { kind: "published", date: "2026-10-14", shopId: "S1", shopName: "A店", startMin: 600, endMin: 900, breakMin: 0, overridden: true, segments: [{ startMin: 600, endMin: 900 }] },
  ];
  const { text, count } = m.buildMyIcs(es, { nowIso: "2026-10-04T01:02:03.456Z" });
  assert.strictEqual(count, 4, "主シフト3＋追加出勤1。グレーは入れない");
  assert.ok(text.endsWith("\r\n") && !/[^\r]\n/.test(text), "すべての行が CRLF");
  const lines = text.split("\r\n").slice(0, -1);
  assert.ok(lines.every(l => Buffer.byteLength(l, "utf8") <= 75), "75オクテット以下");
  const unfolded = text.replace(/\r\n /g, "");
  assert.ok(/BEGIN:VTIMEZONE\r\nTZID:Asia\/Tokyo\r\nX-LIC-LOCATION:Asia\/Tokyo\r\nBEGIN:STANDARD\r\nDTSTART:19700101T000000\r\nTZOFFSETFROM:\+0900\r\nTZOFFSETTO:\+0900\r\nTZNAME:JST\r\nEND:STANDARD\r\nEND:VTIMEZONE\r\n/.test(unfolded));
  assert.ok(unfolded.includes("DTSTART;TZID=Asia/Tokyo:20261031T220000\r\nDTEND;TZID=Asia/Tokyo:20261101T020000"), "26:00 は翌日の 2:00");
  assert.ok(unfolded.includes("DTSTART;TZID=Asia/Tokyo:20261101T023000\r\nDTEND;TZID=Asia/Tokyo:20261101T030000"), "締の追加出勤は別イベント・翌日");
  assert.ok(unfolded.includes("SUMMARY:A店\\; 本店\\, 梅田\\\\北\r\n"), "; , \\ のエスケープ");
  assert.ok(unfolded.includes("SUMMARY:A店\\; 本店\\, 梅田\\\\北（追加）"));
  assert.ok(unfolded.includes("DESCRIPTION:確定\\n休憩30分"), "改行は \\n");
  assert.ok(!unfolded.includes("実績"), "上書きのある日もカレンダーには公開として書く（上書きは給料計算だけ）");
  assert.ok(/UID:shifty-S1-20261014@shiftyshifty.app[\s\S]*?DESCRIPTION:確定/.test(unfolded));
  assert.ok(unfolded.includes("DTSTAMP:20261004T010203Z"));
  const uids = [...unfolded.matchAll(/UID:([^\r]+)/g)].map(x => x[1]);
  assert.deepStrictEqual(uids, ["shifty-eb6A_2bcX_2axP-20261031@shiftyshifty.app", "shifty-eb6A_2bcX_2axP-20261031-x1@shiftyshifty.app",
    "manual-h_5f0000000003@shiftyshifty.app", "shifty-S1-20261014@shiftyshifty.app"]);
  const strip = t => t.replace(/DTSTAMP:[^\r]+/g, "").replace(/SEQUENCE:[^\r]+/g, "");
  assert.strictEqual(strip(m.buildMyIcs(es, { nowIso: "2027-01-01T00:00:00Z" }).text), strip(text), "書き出し直しても DTSTAMP・SEQUENCE 以外は同じ（UID が安定）");
  assert.ok(lines.some(l => l.startsWith(" ")), "長い DESCRIPTION は折り返す");
  assert.ok(!unfolded.includes("B店"), "未公開は含めない");
  assert.deepStrictEqual(m.myIcsEntriesForMonth(es, "2026-10").map(e => e.date), ["2026-10-31", "2026-10-12", "2026-10-14"]);
  assert.strictEqual(m.icsFoldLine("a".repeat(75)), "a".repeat(75));
  assert.strictEqual(m.icsFoldLine("a".repeat(76)), "a".repeat(75) + "\r\n a");
});
test(".ics の互換性（2026-10-04）: 必須・推奨の項目・SEQUENCE・BOM なし・マルチバイトの折り返し・単独の CR のエスケープ", () => {
  const es = [{ kind: "published", date: "2026-10-12", shopId: "S1", shopName: "鶏えん" + "三".repeat(30), startMin: 600, endMin: 900, breakMin: 0, memo: "a\rb",
    segments: [{ startMin: 600, endMin: 900 }] }];
  const t1 = m.buildMyIcs(es, { nowIso: "2026-10-04T03:00:00Z" }).text;
  const t2 = m.buildMyIcs(es, { nowIso: "2026-10-04T04:10:00Z" }).text;
  assert.ok(t1.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//TODGE//Shifty MyShift//JA\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n"), "BOM なし・VERSION・PRODID・CALSCALE・METHOD");
  assert.notStrictEqual(t1.charCodeAt(0), 0xFEFF);
  const ev = t1.replace(/\r\n /g, "").split("BEGIN:VEVENT\r\n")[1];
  for (const k of ["UID:", "DTSTAMP:", "SEQUENCE:", "DTSTART;TZID=Asia/Tokyo:", "DTEND;TZID=Asia/Tokyo:", "SUMMARY:"]) assert.ok(ev.includes("\r\n" + k) || ev.startsWith(k), k + " がある");
  assert.ok(/DTSTAMP:\d{8}T\d{6}Z\r\n/.test(ev), "DTSTAMP は UTC の基本形式");
  const seq = s => +s.match(/SEQUENCE:(\d+)/)[1];
  assert.strictEqual(seq(t1), 397620, "SEQUENCE は 2026-01-01 からの分");
  assert.ok(seq(t2) > seq(t1), "後で書き出した方が SEQUENCE が大きい（取り込み直しで上書きされる）");
  assert.strictEqual(seq(m.buildMyIcs(es, { nowIso: "bad" }).text), 0, "時刻が読めなければ 0");
  assert.ok(ev.includes("DESCRIPTION:確定\\na\\nb\r\n"), "単独の CR も \\n に（生の CR を残さない）");
  assert.ok(!/\r(?!\n)/.test(t1), "CRLF 以外の CR が無い");
  // 折り返しは UTF-8 の文字の途中で切らない: 続きの行を足し戻すと元の文字列に戻り、どの行も有効な UTF-8
  const raw = "SUMMARY:" + "鶏えん" + "三".repeat(30);
  const folded = m.icsFoldLine(raw);
  assert.strictEqual(folded.replace(/\r\n /g, ""), raw);
  for (const l of folded.split("\r\n")) {
    const b = Buffer.from(l, "utf8");
    assert.ok(b.length <= 75, "75 オクテット以下");
    assert.strictEqual(b.toString("utf8"), l, "行の中で文字が割れていない");
  }
  assert.ok(folded.split("\r\n").length >= 2, "折り返している");
  // 4バイト文字（絵文字）でも割れない
  const emo = m.icsFoldLine("X".repeat(73) + "😀😀");
  assert.deepStrictEqual(emo.split("\r\n").map(l => Buffer.byteLength(l)), [73, 9]);
});
test(".ics の渡し方と Google カレンダーのリンク（2026-10-04）", () => {
  assert.strictEqual(m.myIcsPlatformOf("Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Version/27.0 Mobile/15E148 Safari/604.1", 5), "ios");
  assert.strictEqual(m.myIcsPlatformOf("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15", 5), "ios", "iPadOS の Safari は Mac の UA＋タッチ");
  assert.strictEqual(m.myIcsPlatformOf("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15", 0), "desktop");
  assert.strictEqual(m.myIcsPlatformOf("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36", 5), "android");
  assert.strictEqual(m.myIcsPlatformOf("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130", 0), "desktop");
  assert.strictEqual(m.myIcsPlatformOf(undefined, undefined), "desktop");
  for (const k of ["ios", "android", "desktop"]) assert.ok(typeof m.MY_ICS_HINTS[k] === "string" && m.MY_ICS_HINTS[k].length > 10);
  assert.ok(m.MY_ICS_HINTS.android.includes("Google カレンダー") && m.MY_ICS_HINTS.desktop.includes("インポート"));
  // TimeTree などの案内（2026-10-04）。TimeTree の公式ヘルプの事実だけ: .ics を直接取り込めない・端末のカレンダー経由・ホームカレンダーは自動更新・
  // 共有カレンダーへのインポートは自動更新されず重複しうる。確かめていない他社アプリの名前は出さない
  const G = m.MY_ICS_APP_GUIDE;
  assert.ok(/TimeTree/.test(G.title) && /直接は取り込めません/.test(G.intro) && /端末のカレンダー/.test(G.intro));
  for (const k of ["ios", "android", "desktop"]) assert.ok(Array.isArray(G.steps[k]) && G.steps[k].length === 3 && G.steps[k].every(t => typeof t === "string" && t.length > 10), k);
  assert.ok(/フルアクセス/.test(G.steps.ios[1]) && /表示するフィルターを選択/.test(G.steps.ios[2]));
  assert.ok(/インポート \/ エクスポート/.test(G.steps.android[0]) && /インポート \/ エクスポート/.test(G.steps.desktop[0]));
  assert.ok(/自動で反映/.test(G.note) && /重複/.test(G.note));
  const all = [G.title, G.intro, G.note, ...Object.values(G.steps).flat()].join("\n");
  assert.ok(!/ジョルテ|Yahoo|Lifebear|Outlook|Samsung/.test(all), "確かめていないアプリの名前を出さない");
  const myjs = fs.readFileSync(path.join(ROOT, "app-my.js"), "utf8");
  // 2026-10-04 ユーザー指示: 「TimeTree などのアプリで見るには」はマイシフトの一番下（書き出しのボタンの位置は変えない）
  const tab = myjs.slice(myjs.indexOf("function MyShiftTab("), myjs.indexOf("// ===== 設定タブ → 勤務先"));
  assert.ok(!/<MyMessage \{\.\.\.icsMsg\}\/>\s*<MyIcsAppGuide\/>/.test(tab), "書き出しボタンのすぐ下には置かない");
  assert.ok(tab.indexOf('data-my-action="ics"') < tab.indexOf("data-my-day={sel}"), "書き出しのボタンはカレンダーの下・日付の詳細の上のまま");
  assert.ok(tab.lastIndexOf("<MyIcsAppGuide/>") > tab.indexOf("data-my-legend") && tab.indexOf("<MyIcsAppGuide/>") === tab.lastIndexOf("<MyIcsAppGuide/>"), "案内は勤務先の凡例より下＝一番下に1つだけ");
  assert.ok(/<details data-my-ics-apps=/.test(myjs));
  // 2026-10-05 ユーザー指示: 日付ごとの「Google カレンダーに追加」は外し、取り込みは「この月のシフトをカレンダーに取り込む」1つにまとめる
  assert.strictEqual(m.myGoogleCalendarLinks, undefined, "1件ずつのリンクを作る関数は持たない");
  assert.ok(!/data-my-gcal|calendar\.google\.com|Google カレンダーに追加/.test(myjs), "日付の詳細に Google カレンダーのリンクを出さない");
  assert.strictEqual((tab.match(/data-my-action="ics"/g) || []).length, 1, "取り込みのボタンは1つ");
});
test("E4 database.rules.json: workplaces・shifts・overrides はメールのある本人だけ書け、形を検証し未知のキーを拒否する。pay は E5 で足した", () => {
  const rules = JSON.parse(fs.readFileSync(path.join(ROOT, "database.rules.json"), "utf8")).rules;
  const W = "auth != null && auth.uid === $uid && auth.token.email != null";
  const u = rules.users.$uid;
  const wp = u.workplaces.$wid, sh = u.shifts.$sid, ov = u.overrides.$shopId;
  assert.strictEqual(wp[".write"], W);
  assert.strictEqual(sh[".write"], W);
  assert.strictEqual(ov[".write"], W, "overrides は店舗ごとに書ける（リンク解除済みの店舗の上書きをまとめて消すため）");
  [u.workplaces, u.shifts, u.overrides].forEach(n => assert.strictEqual(n[".write"], undefined, "コレクション全体の書き込みは許さない"));
  assert.match(wp[".validate"], /hasChildren\(\['kind', ?'color'\]\)/);
  assert.match(wp[".validate"], /\^m_\[A-Za-z0-9\]\{8\}\$/);
  assert.match(wp[".validate"], /shopId'\)\.val\(\) === \$wid/, "Shifty の店舗の記録は id＝shopId");
  assert.match(wp.color[".validate"], /#\[0-9a-fA-F\]\{6\}/);
  assert.match(wp.kind[".validate"], /'shifty'/);
  assert.match(wp.kind[".validate"], /'manual'/);
  assert.strictEqual(wp.$other[".validate"], false);
  assert.ok(wp.pay && wp.pay[".validate"], "pay の形は E5 で足した（形は E5 のテストが見る）");
  assert.match(sh[".validate"], /\^h_\[A-Za-z0-9\]\{10\}\$/);
  assert.match(sh[".validate"], /hasChildren\(\['workplaceId', ?'date', ?'start', ?'end', ?'breakMin'\]\)/);
  const clock = sh.start[".validate"];
  assert.strictEqual(sh.end[".validate"], clock);
  const reOf = v => new RegExp(v.match(/matches\(\/(.+)\/\)/)[1]);
  const cre = reOf(clock);
  ["00:00", "09:30", "23:59", "26:00", "29:55", "30:00"].forEach(t => assert.ok(cre.test(t), t));
  ["9:30", "30:05", "31:00", "24:60", "0930", "09:3"].forEach(t => assert.ok(!cre.test(t), t));
  const dre = reOf(sh.date[".validate"]);
  assert.ok(dre.test("2026-10-04") && !dre.test("2026-13-01") && !dre.test("2026-1-4"));
  assert.match(sh.breakMin[".validate"], /isNumber\(\) && newData\.val\(\) >= 0 && newData\.val\(\) <= 1440/);
  assert.match(sh.memo[".validate"], /length <= 200/);
  assert.match(sh.workplaceId[".validate"], /\^m_/);
  assert.strictEqual(sh.$other[".validate"], false);
  const od = ov.$date;
  assert.match(od[".validate"], /hasChildren\(\['start', ?'end', ?'breakMin'\]\)/);
  assert.strictEqual(od.start[".validate"], clock);
  assert.strictEqual(od.$other[".validate"], false);
  // クライアントの検証と同じ時刻の形を書く
  ["9", "930", "25:00", "30:00"].forEach(i => assert.ok(cre.test(m.parseMyClockInput(i)), i));
  // 既存のノードは変えていない
  assert.strictEqual(u[".read"], "auth != null && auth.uid === $uid");
  assert.strictEqual(u.profile[".write"], W);
});

// ===== E5: 給料（支給月の振り分け・計算・表示）=====
// 期待値は手計算（実装の出力から逆生成しない）。曜日: 2026-10-25 日・2026-10-23 金・2026-10-26 月・2026-01-31 土・2026-02-02 月・2026-11-23 月（勤労感謝の日）
test("E5 締め期間: 月末・20日・15日・30日、短い月とうるう年の2月、年またぎ", () => {
  assert.deepStrictEqual(m.myClosingRangeOf("2026-02", 31), { from: "2026-02-01", to: "2026-02-28" });
  assert.deepStrictEqual(m.myClosingRangeOf("2028-02", 31), { from: "2028-02-01", to: "2028-02-29" }, "うるう年");
  assert.deepStrictEqual(m.myClosingRangeOf("2026-10", 20), { from: "2026-09-21", to: "2026-10-20" });
  assert.deepStrictEqual(m.myClosingRangeOf("2027-01", 15), { from: "2026-12-16", to: "2027-01-15" }, "年またぎ");
  // 30日締め: 2月は月末（28日）で締め、1/31 は2月の締めに入る。3/31 は4月の締め
  assert.deepStrictEqual(m.myClosingRangeOf("2027-02", 30), { from: "2027-01-31", to: "2027-02-28" });
  assert.deepStrictEqual(m.myClosingRangeOf("2027-03", 30), { from: "2027-03-01", to: "2027-03-30" });
  assert.strictEqual(m.myClosingMonthOf("2026-10-20", 20), "2026-10");
  assert.strictEqual(m.myClosingMonthOf("2026-10-21", 20), "2026-11");
  assert.strictEqual(m.myClosingMonthOf("2026-12-20", 15), "2027-01");
  assert.strictEqual(m.myClosingMonthOf("2027-03-31", 30), "2027-04");
  assert.strictEqual(m.myClosingMonthOf("2028-02-29", 31), "2028-02");
  // 支給月: 15日締め・翌月払いなら 12/20 の勤務は 2027年2月の支給
  const p15 = m.myPayOf({ closingDay: 15, payMonthOffset: 1, payDay: 25, holidayRule: "before" });
  assert.strictEqual(m.myPayMonthOfDate("2026-12-20", p15), "2027-02");
  assert.strictEqual(m.myPayMonthOfDate("2026-12-15", p15), "2027-01");
  assert.strictEqual(m.myPayMonthOfDate("2026-10-04", null), "2026-11", "未設定は月末締め・翌月払い");
});

test("E5 給料日: 土日祝の前倒し・後ろ倒し・そのまま。末日払い。祝日（勤労感謝の日）", () => {
  const off = d => U.isWeekendOrHoliday(d);
  assert.strictEqual(m.myPayDateOf("2026-10", 25, "before", off), "2026-10-23");
  assert.strictEqual(m.myPayDateOf("2026-10", 25, "after", off), "2026-10-26");
  assert.strictEqual(m.myPayDateOf("2026-10", 25, "none", off), "2026-10-25");
  assert.strictEqual(m.myPayDateOf("2026-01", 31, "before", off), "2026-01-30", "末日（土）は前の金曜");
  assert.strictEqual(m.myPayDateOf("2026-01", 31, "after", off), "2026-02-02", "後ろ倒しは翌月にかかってもよい");
  assert.strictEqual(m.myPayDateOf("2026-02", 31, "none", off), "2026-02-28", "短い月の末日");
  assert.strictEqual(m.myPayDateOf("2026-11", 23, "before", off), "2026-11-20", "祝日（月）→ 金曜");
  assert.strictEqual(m.myPayDateOf("2026-11", 23, "after", off), "2026-11-24");
  const plan = m.myPayPlanOf("2027-02", m.myPayOf({ closingDay: 15, payMonthOffset: 1, payDay: 25, holidayRule: "before" }), off);
  assert.deepStrictEqual({ c: plan.closingYm, f: plan.from, t: plan.to, d: plan.payDate, e: plan.monthEnd },
    { c: "2027-01", f: "2026-12-16", t: "2027-01-15", d: "2027-02-25", e: false });
  assert.strictEqual(m.myPayPlanOf("2026-12", null, off).monthEnd, true, "月末締め");
  assert.strictEqual(m.myPayPlanOf("2026-12", m.myPayOf({ closingDay: 30, payMonthOffset: 1, payDay: 25, holidayRule: "none" }), off).monthEnd, false,
    "30日締めは30日の月でも月末締めではない（前の月の31日から）");
});

test("E5 給料設定の検証と保存の形（当月払いは締日より後・会社設定があれば時給を求めない・手入力だけ割増のオン／オフ）", () => {
  const f = { closingDay: "31", payMonthOffset: "1", payDay: "25", holidayRule: "before", wageType: "hourly", rate: "１,２００", commuteAmount: "500", commutePer: "day", night: true, over8: false };
  assert.strictEqual(m.validateMyPayInput(f, { kind: "shifty" }), null);
  assert.match(m.validateMyPayInput({ ...f, payMonthOffset: "0", payDay: "20", closingDay: "20" }, { kind: "shifty" }), /締日より後/);
  assert.match(m.validateMyPayInput({ ...f, rate: "" }, { kind: "shifty" }), /時給/);
  assert.match(m.validateMyPayInput({ ...f, wageType: "daily", rate: "abc" }, { kind: "manual" }), /日給/);
  assert.strictEqual(m.validateMyPayInput({ ...f, rate: "" }, { kind: "shifty", companyPay: true }), null, "会社設定があれば時給は要らない");
  assert.match(m.validateMyPayInput({ ...f, commuteAmount: "x" }, { kind: "shifty" }), /交通費/);
  const rec = m.buildMyPayRecord(f, { kind: "shifty" }, "2026-10-04T00:00:00.000Z");
  assert.deepStrictEqual(rec, { closingDay: 31, payMonthOffset: 1, payDay: 25, holidayRule: "before", updatedAt: "2026-10-04T00:00:00.000Z",
    wageType: "hourly", rate: 1200, commute: { amount: 500, per: "day" } }, "Shifty の店舗は night・over8 を持たない（割増はお店の労働時間制で計算）");
  const recM = m.buildMyPayRecord({ ...f, commuteAmount: "" }, { kind: "manual" }, "t");
  assert.strictEqual(recM.night, true); assert.strictEqual(recM.over8, false); assert.ok(!("commute" in recM), "交通費0は持たない");
  assert.deepStrictEqual(m.myPayOf(rec).commute, { amount: 500, per: "day" });
  assert.strictEqual(m.myPayOf({ closingDay: 0, payMonthOffset: 1, payDay: 25, holidayRule: "before" }), null, "壊れた記録は使わない");
  assert.deepStrictEqual(m.myPayFormOf(rec).rate, "1200");
  assert.deepStrictEqual(m.myPayFormOf(null).closingDay, "31", "未設定の初期値は月末締め");
  assert.deepStrictEqual(m.parseMyGoalInput("120,000円"), { value: 120000 });
  assert.deepStrictEqual(m.parseMyGoalInput(""), { remove: true });
  assert.ok(m.parseMyGoalInput("12万").error);
  assert.deepStrictEqual(m.parseMyReceivedInput("98000"), { value: 98000 });
});

// 1か月（2026年11月）・公開済み・B制（パート・アルバイト）・休憩の設定なし。前後の期間も公開済み（週の休みと法定休日の判定のため）
const PUB = { at: "2026-10-01T00:00:00Z", byUid: "O" };
const E5P = [{ id: "p0", startDate: "2026-10-16", endDate: "2026-10-31", published: PUB }, { id: "p1", startDate: "2026-11-01", endDate: "2026-11-30", published: PUB },
  { id: "p2", startDate: "2026-12-01", endDate: "2026-12-15", published: PUB }];
const E5Shifts = { "2026-11-02": { status: "work", start: "10:00", end: "20:00" }, "2026-11-20": { status: "work", start: "18:00", end: "26:00" } };
const e5Subs = shifts => { const o = {}; E5P.forEach(p => { const s = {}; Object.keys(shifts).filter(d => d >= p.startDate && d <= p.endDate).forEach(d => { s[d] = shifts[d]; });
  o[p.id] = [{ id: "s_" + p.id, periodId: p.id, staffName: "田中", shifts: s }]; }); return o; };
const E5Settings = { staffAttributes: { "田中": "parttime" } };
const e5Shifty = (o = {}) => {
  const src = { name: "田中", periods: o.periods || E5P, subsByPeriod: o.subsByPeriod || e5Subs(o.shifts || E5Shifts), settings: o.settings || E5Settings, staff: ["田中"],
    todayStr: o.todayStr || "2026-11-10", premium: o.premium !== false, overrides: o.overrides };
  const info = m.myShiftyDayInfo(src, U);
  return { name: "田中", info, monthSettingsOf: ym => m.myMonthSettingsOf(src, ym, U), wageSettings: o.wageSettings || null };
};
const e5Row = (pay, o = {}) => m.myPayMonthFor({ payYm: o.payYm || "2026-12", todayStr: o.todayStr || "2026-11-10",
  workplaces: [{ id: "S1", kind: "shifty", name: "A店", pay: m.myPayOf(pay), companyPay: o.companyPay || null, shifty: e5Shifty(o) }] }, U).rows[0];
const P31 = { closingDay: 31, payMonthOffset: 1, payDay: 25, holidayRule: "before", wageType: "hourly", rate: 1200, commute: { amount: 500, per: "day" } };

test("E5 Shifty の店舗・時給（本人の設定）: 手計算の額。確定分は今日まで・見込みは差。交通費は日額×出勤日", () => {
  // 11/2 10:00〜20:00＝600分（B制の①＝600−480＝120分）、11/20 18:00〜26:00＝480分（深夜 22:00〜26:00＝240分）。週40h は超えない
  // 基本 1200×1080/60＝21,600 ／ 時間外（時給者は割増分だけ）1200×25%×120/60＝600 ／ 深夜 1200×25%×240/60＝1,200 ／ 交通費 500×2＝1,000 → 24,400
  const r = e5Row(P31);
  assert.deepStrictEqual(r.amounts.items, { base: 21600, ot: 600, over60: 0, night: 1200, holiday: 0, allowances: 0, commute: 1000, deduction: 0 });
  assert.strictEqual(r.amounts.total, 24400);
  // 今日 11/10: 確定は 11/2 だけ＝基本 12,000＋時間外 600＋交通費 500＝13,100、見込みは差 11,300
  assert.strictEqual(r.amounts.confirmedTotal, 13100);
  assert.strictEqual(r.amounts.projectedTotal, 11300);
  assert.deepStrictEqual({ w: r.amounts.minutes.workMin, ot: r.amounts.minutes.otMin, n: r.amounts.minutes.nightMin, d: r.amounts.minutes.workDays }, { w: 1080, ot: 120, n: 240, d: 2 });
  assert.strictEqual(r.estimate, false, "月末締めは目安の注記（月単位の割増のずれ）を出さない");
  assert.strictEqual(r.plan.payDate, "2026-12-25");
  assert.strictEqual(r.wage.source, "self");
});

test("E5 Shifty の店舗・月給（会社設定）: 基本給は動かさず割増だけ。締め期間が終わるまで基本給は見込み", () => {
  // 単価＝(基本給200,000＋割増の基礎に入る手当5,000) ÷ 173.3h（10398分）。時間外 205000×125×120/(10398×100)＝2,957.30… → 切上げ 2,958
  // 深夜 205000×25×240/(10398×100)＝1,182.92… → 1,183。基本給 200,000（日割りしない）・手当 5,000・交通費 月10,000 → 219,141
  const company = { payType: "monthly", base: 200000, effectiveFrom: "2026-04-01", commute: { amount: 10000, per: "month" }, allowances: [{ name: "役職", amount: 5000 }] };
  const r = e5Row({ ...P31, rate: 0 }, { companyPay: company });
  assert.strictEqual(r.wage.source, "company");
  assert.deepStrictEqual(r.amounts.items, { base: 200000, ot: 2958, over60: 0, night: 1183, holiday: 0, allowances: 5000, commute: 10000, deduction: 0 });
  assert.strictEqual(r.amounts.total, 219141);
  assert.strictEqual(r.amounts.confirmed.base, 0, "締め期間（〜11/30）が終わるまで基本給は確定分に入れない");
  assert.strictEqual(r.amounts.confirmed.ot, 2958, "11/2 の時間外は今日までの分");
  assert.strictEqual(r.amounts.confirmedTotal, 2958);
  const after = e5Row({ ...P31, rate: 0 }, { companyPay: company, todayStr: "2026-12-01" });
  assert.strictEqual(after.amounts.confirmedTotal, after.amounts.total, "締め期間が終われば全部確定");
});

test("E5 月末締めで月次賃金ページ（monthlyPayBreakdown）と同じ金額: 時給者・月給者。同じ入力＝確定シフトだけ・実績なし・ヘルプなし", () => {
  // 月次賃金ページの時間は ShiftEditTab の laborByStaff の割増（premiumDayOf → premiumMonthOf）。その dayOf を同じ形で組む
  const shifts = {};
  for (let i = 26; i <= 31; i++) if (i % 2) shifts[`2026-10-${i}`] = { status: "work", start: "10:00", end: "15:00" };
  for (let i = 2; i <= 30; i++) {
    const d = `2026-11-${String(i).padStart(2, "0")}`, dow = new Date(d + "T00:00:00Z").getUTCDay();
    if (i >= 9 && i <= 15) { shifts[d] = { status: "work", start: "10:00", end: "19:00" }; continue; }   // 休日の無い週＝最後の日が法定休日
    if (dow === 0 || dow === 6) continue;
    shifts[d] = i === 20 ? { status: "work", start: "18:00", end: "26:00" } : { status: "work", start: "10:00", end: "19:30", adjustedEnd: i === 24 ? "21:00" : undefined };
  }
  for (let i = 1; i <= 6; i++) shifts[`2026-12-0${i}`] = { status: "work", start: "10:00", end: "15:00" };
  Object.values(shifts).forEach(x => { if (x.adjustedEnd === undefined) delete x.adjustedEnd; });
  const settings = { staffAttributes: { "田中": "parttime" }, breakTimes: { weekday: [{ start: "12:00", end: "13:00" }] }, laborSettings: { annualScheduledMin: 2080 * 60 } };
  const ym = "2026-11", st = U.resolvePeriodMaster(E5P[1], ["田中"], settings, "2026-11-20").settings;
  const inP = d => E5P.some(p => p.startDate <= d && d <= p.endDate);
  const dayOf = d => { const has = inP(d), s = shifts[d];
    return U.premiumDayInput({ date: d, hasData: has, kind: U.dayRestKindOf(s, has), own: U.resolveActualDay({ shifts: s ? { [d]: s } : {} }, null, d, st, "田中") }); };
  const b = U.premiumMonthOf({ ym, system: U.laborSystemForStaff(st, "田中"), settings: st, dayOf });
  assert.ok(b.legalHolidayMin > 0 && b.otMin > 0 && b.nightMin > 0, "法定休日・時間外・深夜のすべてが出る入力");
  const times = { workMin: b.workMin, dayOverMin: b.dayOverMin, weekOverMin: b.weekOverMin, monthOverMin: b.monthOverMin, otMin: b.otMin, over60Min: b.over60Min,
    nightMin: b.nightMin, legalHolidayMin: b.legalHolidayMin, absentMin: b.absentMin, scheduledMin: 0 };
  const denomMin = U.rateDenominatorMinOf(U.laborSettingsOf(st));
  const wageSettings = { premiumRates: { ot: 30, night: 30 }, roundingRule: "round" };
  [{ payType: "hourly", base: 1234, effectiveFrom: "2026-01-01" },
   { payType: "monthly", base: 213500, effectiveFrom: "2026-01-01", fixedOt: { hours: 10, auto: true }, fixedNight: { hours: 1, amount: 0 }, allowances: [{ name: "役職", amount: 10000 }] }]
    .forEach(pay => {
      [null, wageSettings].forEach(ws => {
        const c = U.monthlyPayBreakdown({ pay, ym, times, denomMin, wageSettings: ws });
        const r = e5Row({ closingDay: 31, payMonthOffset: 1, payDay: 25, holidayRule: "before" }, { shifts, settings, todayStr: "2026-11-20", companyPay: pay, wageSettings: ws });
        const it = r.amounts.items;
        assert.deepStrictEqual([it.base, it.ot, it.over60, it.night, it.holiday, it.deduction],
          [c.wage.basePay, c.wage.otPay, c.wage.over60Pay, c.wage.nightPay, c.wage.holidayPay, c.deduction], `${pay.payType} ${ws ? "率・端数あり" : "既定"}`);
        assert.deepStrictEqual([r.amounts.minutes.workMin, r.amounts.minutes.otMin, r.amounts.minutes.nightMin, r.amounts.minutes.legalHolidayMin, r.amounts.minutes.over60Min],
          [b.workMin, b.otMin, b.nightMin, b.legalHolidayMin, b.over60Min], "時間も一致");
      });
    });
});

test("E5 締日が月末でない（20日締め）: 暦月をまたぐ締め期間を日ごとの時間外で集め、目安の印を付ける。15日締めは前半だけ", () => {
  const p20 = { ...P31, closingDay: 20 };
  const r = e5Row(p20);   // 2026年12月支給 ＝ 10/21〜11/20 の勤務（11/2 と 11/20 の両方）
  assert.deepStrictEqual({ f: r.plan.from, t: r.plan.to }, { f: "2026-10-21", t: "2026-11-20" });
  assert.strictEqual(r.amounts.total, 24400, "この入力では暦月の計算と同じ額");
  assert.strictEqual(r.estimate, true);
  const r15 = e5Row({ ...P31, closingDay: 15 });   // 10/16〜11/15 ＝ 11/2 だけ: 12,000＋600＋500
  assert.strictEqual(r15.amounts.total, 13100);
  // 60時間超は日付の順に積んで超えた分（月の合計と一致）。1日4時間の時間外を20日＝80時間 → 60h超 20時間
  const long = {}; for (let i = 2; i <= 21; i++) long[`2026-11-${String(i).padStart(2, "0")}`] = { status: "work", start: "08:00", end: "20:00" };
  const t = m.myShiftyPayTimes({ name: "田中", info: e5Shifty({ shifts: long }).info, monthSettingsOf: () => E5Settings, from: "2026-11-01", to: "2026-11-30", todayStr: "2026-11-10" }, U);
  const sum = k => t.days.reduce((a, d) => a + d[k], 0);
  assert.strictEqual(sum("over60Min"), Math.max(0, sum("otMin") - 3600));
  const half = m.myShiftyPayTimes({ name: "田中", info: e5Shifty({ shifts: long }).info, monthSettingsOf: () => E5Settings, from: "2026-11-16", to: "2026-11-30", todayStr: "2026-11-10" }, U);
  assert.ok(half.days.reduce((a, d) => a + d.over60Min, 0) > 0, "月の後半の締め期間に60h超が載る");
});

test("E5 未公開（グレー）は含めない・Premium でないと計算しない・実績の上書きが入る", () => {
  const unpub = E5P.map(p => p.id === "p1" ? { id: p.id, startDate: p.startDate, endDate: p.endDate } : p);
  const r = e5Row(P31, { periods: unpub });
  assert.strictEqual(r.amounts.total, 0, "公開されていない期間の勤務は数えない");
  assert.ok(r.notes.some(n => /未公開のシフト2日/.test(n)), r.notes.join("／"));
  const np = e5Row(P31, { premium: false });
  assert.strictEqual(np.amounts.total, 0);
  // 上書き: 11/2 を 10:00〜18:00 休憩0 → 480分・時間外0。基本 1200×960/60＝19,200 ＋ 深夜 1,200 ＋ 交通費 1,000
  const ov = e5Row(P31, { overrides: { "2026-11-02": { start: "10:00", end: "18:00", breakMin: 0 } } });
  assert.deepStrictEqual({ b: ov.amounts.items.base, ot: ov.amounts.items.ot, t: ov.amounts.total }, { b: 19200, ot: 0, t: 21400 });
  assert.ok(ov.notes.some(n => n === "あなたが入れた実績の時間で計算した日 1日（11/2）。シフトの表示は公開された時間のままです"), ov.notes.join("／"));
  assert.ok(!r.notes.some(n => /実績の時間で計算/.test(n)) && !e5Row(P31, {}).notes.some(n => /実績の時間で計算/.test(n)), "上書きの無い月は注記しない");
});

test("E5 手入力の勤務先: 時給×時間・深夜25%（休憩は拘束の比率で按分）・8h超25%・日給×出勤日数。交通費の月額", () => {
  const list = [{ id: "m_CAFE0001", kind: "manual", name: "カフェ", color: "#4f7d4a" }];
  const shifts = { h_AAAAAAAAAA: { workplaceId: "m_CAFE0001", date: "2026-11-05", start: "13:00", end: "23:30", breakMin: 30 },
    h_BBBBBBBBBB: { workplaceId: "m_CAFE0001", date: "2026-10-30", start: "10:00", end: "12:00", breakMin: 0 } };
  const ent = m.buildMyManualDays(list, shifts);
  const row = pay => m.myPayMonthFor({ payYm: "2026-12", todayStr: "2026-11-10", workplaces: [{ id: "m_CAFE0001", kind: "manual", name: "カフェ", pay: m.myPayOf(pay), manualEntries: ent }] }, U).rows[0];
  // 11/5: 拘束630分・休憩30 → 実働600。深夜 22:00〜23:30＝90分から休憩の按分 floor(30×90/630)＝4 を引いて86分。8h超＝120分
  // 基本 1000×600/60＝10,000 ／ 深夜 1000×25%×86/60＝358.3… → 359 ／ 8h超 1000×25%×120/60＝500 ／ 交通費 月額3,000 → 13,859
  const r = row({ closingDay: 31, payMonthOffset: 1, payDay: 25, holidayRule: "before", wageType: "hourly", rate: 1000, night: true, over8: true, commute: { amount: 3000, per: "month" } });
  assert.deepStrictEqual(r.amounts.items, { base: 10000, ot: 500, over60: 0, night: 359, holiday: 0, allowances: 0, commute: 3000, deduction: 0 });
  assert.strictEqual(r.amounts.minutes.workMin, 600, "10/30 は11月の締め期間の外");
  const off = row({ closingDay: 31, payMonthOffset: 1, payDay: 25, holidayRule: "before", wageType: "hourly", rate: 1000 });
  assert.strictEqual(off.amounts.total, 10000, "割増はオフが既定");
  const daily = row({ closingDay: 31, payMonthOffset: 1, payDay: 25, holidayRule: "before", wageType: "daily", rate: 8000 });
  assert.strictEqual(daily.amounts.total, 8000);
  const none = row({ closingDay: 31, payMonthOffset: 1, payDay: 25, holidayRule: "before" });
  assert.strictEqual(none.amounts.total, null, "時給が無ければ金額は出さない");
  assert.strictEqual(none.amounts.minutes.workMin, 600);
});

test("E5 年: 支給月ごとの一覧と合計・振込額。既定の支給月と読む範囲", () => {
  const months = m.myPayYearMonths(2026).map(ym => m.myPayMonthFor({ payYm: ym, todayStr: "2026-11-10",
    workplaces: [{ id: "S1", kind: "shifty", name: "A店", pay: m.myPayOf(P31), shifty: e5Shifty() }] }, U));
  const y = m.myPayYearSummary(months, { "2026-12": { S1: 24000 }, "2026-05": { S1: 1000, m_X: 500 } });
  assert.strictEqual(y.rows.length, 12);
  assert.strictEqual(y.rows[11].total, 24400, "12月支給 ＝ 11月の勤務");
  assert.strictEqual(y.total, 24400, "他の月は勤務なし");
  assert.strictEqual(y.received, 25500);
  assert.strictEqual(y.rows[4].received, 1500);
  assert.strictEqual(m.myDefaultPayMonth([m.myPayOf(P31), m.myPayOf({ ...P31, closingDay: 20, payMonthOffset: 0, payDay: 25 })], "2026-10-04"), "2026-10",
    "20日締め当月払いの方が早い");
  const rng = m.myPayReadRange([m.myPayPlanOf("2026-12", m.myPayOf({ ...P31, closingDay: 20 }), null)]);
  assert.deepStrictEqual(rng, { from: "2026-09-24", to: "2026-12-07" }, "締め期間を含む暦月の全日と前後1週");
  assert.strictEqual(m.fmtMyYen(-1234), "−1,234円");
  assert.strictEqual(m.myGoalProgress(50000, 200000), 0.25);
  assert.strictEqual(m.myGoalProgress(300000, 200000), 1);
  assert.strictEqual(m.myGoalProgress(1, 0), null);
});

test("E5 database.rules.json: pay・goals・actuals はメールのある本人だけ書け、形を検証する", () => {
  const rules = JSON.parse(fs.readFileSync(path.join(ROOT, "database.rules.json"), "utf8")).rules;
  const W = "auth != null && auth.uid === $uid && auth.token.email != null";
  const u = rules.users.$uid, pay = u.workplaces.$wid.pay;
  assert.match(pay[".validate"], /hasChildren\(\['closingDay', ?'payMonthOffset', ?'payDay', ?'holidayRule'\]\)/);
  assert.match(pay.closingDay[".validate"], />= 1 && newData\.val\(\) <= 31/);
  assert.match(pay.payMonthOffset[".validate"], /=== 0 .*=== 1 .*=== 2/);
  ["before", "after", "none"].forEach(k => assert.ok(pay.holidayRule[".validate"].includes(`'${k}'`)));
  ["hourly", "daily"].forEach(k => assert.ok(pay.wageType[".validate"].includes(`'${k}'`)));
  assert.strictEqual(pay.$other[".validate"], false);
  assert.strictEqual(pay.commute.$other[".validate"], false);
  assert.strictEqual(pay.night[".validate"], "newData.isBoolean()");
  assert.strictEqual(u.goals[".write"], W);
  assert.strictEqual(u.goals.$other[".validate"], false);
  assert.strictEqual(u.actuals[".write"], undefined, "振込額の全体は書けない");
  assert.strictEqual(u.actuals.$ym[".write"], W);
  const ymRe = new RegExp(u.actuals.$ym.$wid[".validate"].match(/\$ym\.matches\(\/(.+?)\/\)/)[1]);
  assert.ok(ymRe.test("2026-12") && !ymRe.test("2026-13") && !ymRe.test("2026-1"));
  // クライアントが書く形がルールの必須キーを満たす
  const rec = m.buildMyPayRecord(m.myPayFormOf(null), { kind: "shifty" }, "t");
  ["closingDay", "payMonthOffset", "payDay", "holidayRule"].forEach(k => assert.ok(k in rec, k));
  assert.ok(Object.keys(rec).every(k => k in pay), "未知のキーを書かない");
  assert.ok(rec.closingDay >= 1 && rec.closingDay <= 31 && [0, 1, 2].includes(rec.payMonthOffset));
});

test("E5 給料タブと月間目標の書き込みは users/{uid} の goals と actuals だけ（店舗のデータに書かない）", () => {
  const src = fs.readFileSync(path.join(ROOT, "app-my.js"), "utf8");
  const a = src.indexOf("function useMyPayExtras("), b = src.indexOf("function MySettingsTab(");
  assert.ok(a > 0 && b > a);
  const body = src.slice(a, b);
  const writes = [...body.matchAll(/\b(fbSet|fbUpd)\(\s*`?([^,`)]*)/g)].map(x => x[1] + " " + x[2]);
  assert.deepStrictEqual(writes, ["fbUpd base"]); // 2026-10-04: 本人の基点（users/{uid} か staffPageData/{pageToken}）
  assert.ok(!/\.ref\([^)]*\)\.(set|update|remove|push|transaction)\(/.test(body), "ref() から直接書かない");
  const keys = [...body.matchAll(/write\(\{\s*\[?`?([a-z]+)[/`:]/g)].map(x => x[1]);
  assert.deepStrictEqual(keys.sort(), ["actuals", "goals"]);
  assert.ok(!/ref\(`shops\//.test(body), "店舗のパスを直接読まない（読みは useMyShiftSources 経由）");
});

// ===== E6: 会社設定の賃金（getMyPay）=====
const mp = require("../functions/my-pay.js");
test("E6 CF の版の形は app-utils.js の normalizePayVersion と同じ（乱数の入力でも）", () => {
  const vals = [undefined, null, "", "x", -5, 0, 1.4, 1234.6, 213500, "1200", true, [], {}];
  const pick = a => a[Math.floor(Math.random() * a.length)];
  for (let i = 0; i < 400; i++) {
    const v = { payType: pick(["hourly", "monthly", "x", undefined]), base: pick(vals), effectiveFrom: pick(["2026-04-01", "2026-02-30", "", undefined, 5]),
      commute: pick([undefined, { amount: pick(vals), per: pick(["day", "month", "x"]) }]),
      allowances: pick([undefined, [{ name: pick(["役職", "", "あ".repeat(40)]), amount: pick(vals), excludeFromRate: pick([true, 0, "y"]) }, null], { a: { name: "x", amount: 3 } }]),
      fixedOt: pick([undefined, { hours: pick(vals), auto: pick([true, false, undefined]), amount: pick(vals) }]), fixedNight: pick([undefined, { hours: pick(vals), amount: pick(vals) }]) };
    assert.deepStrictEqual(mp.payVersionCF(v), U.normalizePayVersion(v), JSON.stringify(v));
  }
});
test("E6 getMyPay の判定: 名前は staffLinks が正・メールのある認証だけ・スタッフ一覧に無い名前は拒否・ヘルプ先だけなら所属店舗", () => {
  assert.strictEqual(mp.myPayLinkNameCF({ email: "", staffLink: { name: "田中" } }).error.code, "failed-precondition");
  assert.strictEqual(mp.myPayLinkNameCF({ email: "a@b", staffLink: null }).error.code, "permission-denied");
  assert.deepStrictEqual(mp.myPayLinkNameCF({ email: "a@b", staffLink: { name: "田中" } }), { name: "田中" });
  const rec = { payType: "hourly", base: 1300, effectiveFrom: "2026-04-01", updatedAt: "t", history: [{ payType: "hourly", base: 1200, effectiveFrom: "2025-04-01", updatedAt: "u" }, { bad: 1 }] };
  const ok = mp.planGetMyPay({ shopId: "S1", name: "田中", staff: ["田中"], payRec: rec });
  assert.strictEqual(ok.result.pay.base, 1300);
  assert.strictEqual(ok.result.pay.history.length, 1, "壊れた版は返さない");
  assert.ok(!JSON.stringify(ok.result).includes("updatedAt"));
  assert.strictEqual(mp.planGetMyPay({ shopId: "S1", name: "退職者", staff: ["田中"], payRec: rec }).error.code, "failed-precondition");
  const help = mp.planGetMyPay({ shopId: "S1", name: "田中", staff: ["田中"], payRec: null, homeShopId: "S0", homeShopName: "本店" });
  assert.deepStrictEqual(help.result, { ok: true, name: "田中", pay: null, homeShopId: "S0", homeShopName: "本店" });
  assert.ok(!("homeShopId" in mp.planGetMyPay({ shopId: "S1", name: "田中", staff: ["田中"], payRec: null, homeShopId: "S1" }).result), "所属店舗が自店なら付けない");
  // 返す版で月初時点の版が選べる（クライアントは payVersionOn を通す）
  assert.strictEqual(U.payVersionOn(ok.result.pay, "2026-03-01").base, 1200);
  assert.strictEqual(U.payVersionOn(ok.result.pay, "2026-04-01").base, 1300);
});
test("E6 クライアントの読み（myCompanyPayOf）と、会社設定の時給が本人の設定より優先されること", () => {
  assert.deepStrictEqual(m.myCompanyPayOf({ error: "x" }).state, "error");
  assert.strictEqual(m.myCompanyPayOf({ ok: true, pay: { payType: "weird" } }).pay, null);
  assert.strictEqual(m.myCompanyPayOf({ ok: true, pay: null, homeShopId: "S0", homeShopName: "本店" }).homeShopName, "本店");
  const cp = m.myCompanyPayOf({ ok: true, name: "田中", pay: mp.myPayRecordCF({ payType: "hourly", base: 1300, effectiveFrom: "2026-01-01", commute: { amount: 3000, per: "month" } }) });
  // 時給1,300円・会社設定の交通費 月3,000（本人の 500円/日 は使わない）: 1300×1080/60＝23,400 ＋ 時間外 1300×25%×120/60＝650 ＋ 深夜 1300×25%×240/60＝1,300 ＋ 3,000
  const r = e5Row(P31, { companyPay: cp.pay });
  assert.strictEqual(r.wage.source, "company");
  assert.deepStrictEqual(r.amounts.items, { base: 23400, ot: 650, over60: 0, night: 1300, holiday: 0, allowances: 0, commute: 3000, deduction: 0 });
  const late = e5Row(P31, { companyPay: { ...cp.pay, effectiveFrom: "2026-11-15" } });
  assert.strictEqual(late.wage.source, "company");
  assert.ok(late.notes.some(n => /2026-11-15 からの会社設定/.test(n)), "月の途中から適用の注記（日割りしない＝月次賃金と同じ）");
});
test("E6 getMyPay は index.js で名前を呼び出し元から受け取らず、staffLinks の名前で private/pay を読む", () => {
  const src = fs.readFileSync(path.join(ROOT, "functions", "index.js"), "utf8");
  const a = src.indexOf("exports.getMyPay"), b = src.indexOf("\n  });", a);
  assert.ok(a > 0 && b > a);
  const body = src.slice(a, b);
  assert.ok(!/data\s*&&\s*data\.(name|uid)|data\.name|data\.uid/.test(body), "name・uid を data から読まない");
  assert.ok(/staffLinks\/\$\{uid\}/.test(body) && /private\/pay\/\$\{name\}/.test(body));
  assert.ok(body.indexOf("myPayLinkNameCF") < body.indexOf("private/pay"), "紐付けを確かめてから賃金を読む");
  assert.ok(!/\.(set|update|remove|push|transaction)\(/.test(body), "何も書かない");
  assert.ok(/readLinkShopId\(data\)/.test(body), "shopId の形とデモ店舗を確かめる");
});

// ===== スタッフ個別URL（2026-10-04・ユーザーの仕様変更）=====
test("個別URL: トークンの形・生成・ルート・URL", () => {
  assert.ok(m.isMyPageToken("A".repeat(24)) && m.isMyPageToken("aZ09".repeat(6)));
  ["", "A".repeat(23), "A".repeat(25), "A".repeat(23) + "-", "A".repeat(23) + ".", null, 5].forEach(t => assert.strictEqual(m.isMyPageToken(t), false, String(t)));
  let i = 0;
  const t = m.genMyPageToken(n => Array.from({ length: n }, () => (i++ * 37) % 256));
  assert.ok(m.isMyPageToken(t), t);
  assert.strictEqual(m.myPageRouteOf("#/m/" + t), t);
  assert.strictEqual(m.myPageRouteOf("#/m/" + t + "/"), t);
  assert.strictEqual(m.myPageRouteOf("#/m/"), "", "空は空文字（画面で使えないURLと出す）");
  ["#/me", "#/s/abc", "#/demo", "#/mx/abc", "", null].forEach(h => assert.strictEqual(m.myPageRouteOf(h), null, String(h)));
  assert.strictEqual(m.buildMyPageUrl("https://shiftyshifty.app/", t), `https://shiftyshifty.app/?openExternalBrowser=1#/m/${t}`);
  assert.deepStrictEqual(m.MY_PAGE_TABS.map(x => x.key), ["shift", "submit", "pay", "settings"]);
  // parseUrl は MY_SCREEN_ENABLED のときだけ個別URLとして返す（本番は旧形式のスタッフURLのまま）
  const core = fs.readFileSync(path.join(ROOT, "app-core.js"), "utf8");
  assert.ok(/if\(MY_SCREEN_ENABLED\)\{const pt=myPageRouteOf\(h\);if\(pt!==null\) return\{type:"page",pageToken:pt\};\}/.test(core));
  assert.ok(core.indexOf("myPageRouteOf(h)") < core.indexOf('if(h.startsWith("#/s/"))'), "スタッフURL・旧形式より先に判定する");
});
test("個別URL: 申請の記録・画面の状態（承認済みで名前がスタッフ一覧にあるときだけ ok）", () => {
  assert.ok(m.buildMyPageRequest({ displayName: " " }, "t").error);
  assert.ok(m.buildMyPageRequest({ displayName: "あ".repeat(51) }, "t").error);
  assert.deepStrictEqual(m.buildMyPageRequest({ displayName: " 田中 ", number: "０１２" }, "t").rec, { status: "pending", displayName: "田中", requestedAt: "t", number: "012" });
  assert.ok(!("number" in m.buildMyPageRequest({ displayName: "田中", number: " " }, "t").rec), "番号が空ならキーを持たない");
  const T = "A".repeat(24), staff = ["田中", "__spacer__1", "佐藤"];
  assert.strictEqual(m.resolveMyPage("bad", { shopId: "S1" }, {}, staff).state, "invalid");
  assert.strictEqual(m.resolveMyPage(T, null, null, staff).state, "missing");
  assert.strictEqual(m.resolveMyPage(T, { shopId: "S1" }, null, staff).state, "missing");
  assert.strictEqual(m.resolveMyPage(T, { shopId: "S1" }, { status: "weird" }, staff).state, "missing");
  ["pending", "rejected", "revoked"].forEach(st => assert.strictEqual(m.resolveMyPage(T, { shopId: "S1" }, { status: st, displayName: "田中", name: "田中" }, staff).state, st));
  assert.strictEqual(m.resolveMyPage(T, { shopId: "S1" }, { status: "approved", name: "高橋" }, staff).state, "missingName", "改名・削除の追随が届かなかった名前は使わない");
  assert.strictEqual(m.resolveMyPage(T, { shopId: "S1" }, { status: "approved", name: "__spacer__1" }, staff).state, "missingName");
  assert.deepStrictEqual(m.resolveMyPage(T, { shopId: "S1" }, { status: "approved", name: "田中", displayName: "たなか", approvedAt: "a" }, staff),
    { state: "ok", shopId: "S1", displayName: "たなか", name: "田中", approvedAt: "a" });
  Object.keys(m.MY_PAGE_STATE_MESSAGES).forEach(k => assert.ok(m.MY_PAGE_STATE_MESSAGES[k].length > 10, k));
  ["invalid", "missing", "pending", "rejected", "revoked", "missingName"].forEach(k => assert.ok(m.MY_PAGE_STATE_MESSAGES[k], k));
});
test("個別URL: 承認・却下・取り消し・暗証番号のリセットの差分（1つの名前に承認済みは1つ）", () => {
  const A = "A".repeat(24), B = "B".repeat(24), C = "C".repeat(24);
  const pages = { [A]: { status: "pending", displayName: "田中" }, [B]: { status: "approved", name: "田中", approvedAt: "x" }, [C]: { status: "approved", name: "佐藤", approvedAt: "x" } };
  const staff = ["田中", "佐藤"];
  assert.deepStrictEqual(m.planApproveStaffPage({ pages, token: A, name: "田中", staff, byUid: "O", nowIso: "n" }).patch,
    { [`${A}/status`]: "approved", [`${A}/name`]: "田中", [`${A}/approvedAt`]: "n", [`${A}/byUid`]: "O", [`${B}/status`]: "revoked", [`${B}/revokedAt`]: "n" });
  assert.ok(m.planApproveStaffPage({ pages, token: A, name: "高橋", staff, nowIso: "n" }).error, "スタッフ一覧に無い名前");
  assert.ok(m.planApproveStaffPage({ pages, token: B, name: "田中", staff, nowIso: "n" }).error, "pending だけ承認できる");
  assert.ok(m.planApproveStaffPage({ pages, token: "x", name: "田中", staff }).error);
  assert.ok(!("" + JSON.stringify(m.planApproveStaffPage({ pages, token: A, name: "田中", staff, nowIso: "n" }).patch)).includes(C), "別の名前の承認は触らない");
  assert.deepStrictEqual(m.planRejectStaffPage(pages, A).patch, { [`${A}/status`]: "rejected" });
  assert.ok(m.planRejectStaffPage(pages, B).error);
  assert.deepStrictEqual(m.planRevokeStaffPage(pages, B, "n").patch, { [`${B}/status`]: "revoked", [`${B}/revokedAt`]: "n" });
  assert.ok(m.planRevokeStaffPage(pages, A, "n").error);
  assert.deepStrictEqual(m.planResetStaffPagePin(pages, C, "n").patch, { [`${C}/pinResetAt`]: "n" });
  assert.ok(m.planResetStaffPagePin(pages, A, "n").error);
  assert.deepStrictEqual(Object.keys(m.approvedStaffPagesByName(pages)).sort(), ["佐藤", "田中"]);
});
test("個別URL: 管理者が直接発行（承認済みの記録・同じ名前の古い URL は取り消す・ルールは今のままで通る・CF なし）（2026-10-04）", () => {
  const A = "A".repeat(24), B = "B".repeat(24), C = "C".repeat(24), N = "N".repeat(24);
  const pages = { [A]: { status: "pending", displayName: "田中" }, [B]: { status: "approved", name: "田中", approvedAt: "x" }, [C]: { status: "approved", name: "佐藤", approvedAt: "x" } };
  const staff = ["田中", "佐藤", "__spacer__1"];
  const r = m.planIssueStaffPage({ pages, token: N, name: "田中", staff, shopId: "S1", byUid: "O", nowIso: "n" });
  assert.deepStrictEqual(r.tokenRec, { shopId: "S1", at: "n" });
  assert.deepStrictEqual(r.patch, { [N]: { status: "approved", displayName: "田中", requestedAt: "n", name: "田中", approvedAt: "n", byUid: "O" },
    [`${B}/status`]: "revoked", [`${B}/revokedAt`]: "n" }, "再発行: 同じ名前の承認済みは取り消し、申請中（pending）と別の名前は触らない");
  assert.deepStrictEqual(r.revoked, [B]);
  const first = m.planIssueStaffPage({ pages: {}, token: N, name: "佐藤", staff, shopId: "S1", nowIso: "n" });
  assert.deepStrictEqual(Object.keys(first.patch), [N], "初めての発行は記録1つだけ");
  assert.ok(m.planIssueStaffPage({ pages, token: N, name: "高橋", staff, shopId: "S1" }).error, "スタッフ一覧に無い名前");
  assert.ok(m.planIssueStaffPage({ pages, token: N, name: "__spacer__1", staff, shopId: "S1" }).error, "空白列");
  assert.ok(m.planIssueStaffPage({ pages, token: A, name: "田中", staff, shopId: "S1" }).error, "既にある token は使わない");
  assert.ok(m.planIssueStaffPage({ pages, token: "x", name: "田中", staff, shopId: "S1" }).error);
  // 発行した URL は本人がそのまま開ける（resolveMyPage が ok）
  assert.strictEqual(m.resolveMyPage(N, r.tokenRec, r.patch[N], ["田中", "佐藤"]).state, "ok");
  // 改名・削除の追随は申請から承認したものと同じ（planStaffPageOp）。発行より前の操作は当てない（世代の目印）
  const issued = { [N]: { ...r.patch[N], approvedAt: "2026-10-04T00:00:00.000Z" } };
  assert.deepStrictEqual(m.planStaffPageOp(issued, m.staffLinkOpOf("rename", "田中", "田中 一郎", "2026-10-05T00:00:00.000Z")), { [`${N}/name`]: "田中 一郎" });
  assert.deepStrictEqual(m.planStaffPageOp(issued, m.staffLinkOpOf("drop", ["田中"], null, "2026-10-05T00:00:00.000Z")), { [`${N}/status`]: "revoked", [`${N}/revokedAt`]: "2026-10-05T00:00:00.000Z" });
  assert.strictEqual(m.planStaffPageOp(issued, m.staffLinkOpOf("drop", ["田中"], null, "2026-10-03T00:00:00.000Z")), null);
  // ルール: オーナーは approved の記録を必須の子つきで新規作成でき（$other は無い）、逆引きは新規作成なら書ける＝ルールの変更は要らない
  const rules = JSON.parse(fs.readFileSync(path.join(ROOT, "database.rules.json"), "utf8")).rules;
  const sp = rules.shops.$shopId.staffPages.$token, tk = rules.staffPageTokens.$token;
  assert.ok(sp[".write"].includes("root.child('shops').child($shopId).child('owners').child(auth.uid).exists()"), "オーナーは書ける");
  assert.ok(/hasChildren\(\['status','displayName','requestedAt'\]\)/.test(sp[".validate"]) && /hasChildren\(\['name','approvedAt'\]\)/.test(sp[".validate"]));
  Object.keys(r.patch[N]).forEach(k => assert.ok(sp[k] && sp[k][".validate"], `${k} はルールにある子`));
  assert.ok(/!data\.exists\(\) && newData\.exists\(\)/.test(tk[".write"]) && Object.keys(r.tokenRec).every(k => tk[k]));
  // 入口: App は逆引きを先に、記録を後に書く。発行の UI はオーナーの端末（links.enabled）だけ
  const main = fs.readFileSync(path.join(ROOT, "app-main.js"), "utf8");
  const act = main.slice(main.indexOf("const staffPageAct="), main.indexOf("const STAFF_LINK_CFS="));
  assert.ok(/kind==="issue"/.test(act) && act.indexOf("fbSet(`staffPageTokens/${token}`") < act.indexOf("fbUpd(`shops/${sid}/staffPages`,p.patch)"), "逆引き → 記録の順");
  assert.ok(/staffLinks=\{\{enabled:MY_SCREEN_ENABLED&&!DEMO_MODE&&!ownerReadOnly&&ownerClaimedSid===sid/.test(main), "オーナーの端末・デモ以外だけ");
  const my = fs.readFileSync(path.join(ROOT, "app-my.js"), "utf8");
  const sec = my.slice(my.indexOf("function StaffPageEditSection("), my.indexOf("// ---- 本人のカレンダーと全員のシフト表の切り替え"));
  assert.ok(/if\(!links\|\|!links\.enabled\)return null;/.test(sec) && /pageAct\("issue"/.test(sec) && /window\.confirm/.test(sec), "再発行は確認つき");
});
test("個別URL: 改名・削除の追随（紐付けと同じ操作・世代の目印・削除は取り消し）", () => {
  const A = "A".repeat(24), B = "B".repeat(24), C = "C".repeat(24), D = "D".repeat(24);
  const pages = { [A]: { status: "approved", name: "田中", approvedAt: "2026-10-01T00:00:00.000Z" },
    [B]: { status: "approved", name: "田中", approvedAt: "2026-10-09T00:00:00.000Z" }, // 操作より後に承認＝当てない
    [C]: { status: "pending", displayName: "田中" }, [D]: { status: "revoked", name: "田中", approvedAt: "2026-09-01T00:00:00.000Z" }, bad: { status: "approved", name: "田中" } };
  const ren = m.staffLinkOpOf("rename", "田中", "田中 一郎", "2026-10-05T00:00:00.000Z");
  assert.deepStrictEqual(m.planStaffPageOp(pages, ren), { [`${A}/name`]: "田中 一郎" });
  const drop = m.staffLinkOpOf("drop", ["田中"], null, "2026-10-05T00:00:00.000Z");
  assert.deepStrictEqual(m.planStaffPageOp(pages, drop), { [`${A}/status`]: "revoked", [`${A}/revokedAt`]: "2026-10-05T00:00:00.000Z" });
  assert.strictEqual(m.planStaffPageOp(pages, m.staffLinkOpOf("drop", ["佐藤"], null, "t")), null);
  assert.strictEqual(m.planStaffPageOp(pages, null), null);
  // 当て直しても同じ（片方のノードだけ書けたときに列に残してやり直すため）
  const after = JSON.parse(JSON.stringify(pages)); after[A].name = "田中 一郎";
  assert.strictEqual(m.planStaffPageOp(after, ren), null);
});
test("個別URL: 申請の候補（番号・名前の一致）と、承認済みの名前の印", () => {
  const A = "A".repeat(24), B = "B".repeat(24), C = "C".repeat(24);
  const pages = { [A]: { status: "pending", displayName: "たなか", number: "012", requestedAt: "2" }, [B]: { status: "pending", displayName: "山田　太郎", requestedAt: "1" },
    [C]: { status: "approved", name: "田中", approvedAt: "x" }, X: { status: "pending", displayName: "誰か", requestedAt: "3" } };
  const r = m.splitStaffPageRequests(pages, { shopId: "S1", staff: ["田中", "山田 太郎"], staffNumbers: { 田中: "012" } });
  assert.deepStrictEqual(r.withCand.map(x => x.token), [B, A], "古い申請から");
  assert.deepStrictEqual(r.withCand[1].cands, [{ name: "田中", methods: ["number"], takenBy: C }]);
  assert.deepStrictEqual(r.withCand[0].cands.map(c => c.name), ["山田 太郎"]);
  assert.deepStrictEqual(r.unmatched.map(x => x.token), ["X"]);
});
test("個別URL: ルールの形（追加だけ。申請は pending だけ・名前と承認はオーナー・本人のデータは承認済みの間だけ・暗証番号はCFだけ）", () => {
  const rules = JSON.parse(fs.readFileSync(path.join(ROOT, "database.rules.json"), "utf8")).rules;
  const own = "root.child('shops').child($shopId).child('owners').child(auth.uid).exists()";
  const tk = rules.staffPageTokens;
  assert.strictEqual(tk[".read"], undefined, "一覧は読めない（直キーだけ）");
  assert.strictEqual(tk.$token[".read"], "auth != null");
  assert.match(tk.$token[".write"], /\(!data\.exists\(\) && newData\.exists\(\)\)/, "作るだけ（作成後は書き換えられない）");
  assert.match(tk.$token[".write"], /data\.exists\(\) && !newData\.exists\(\) && root\.child\('shops'\)\.child\(data\.child\('shopId'\)\.val\(\)\)\.child\('owners'\)/, "消せるのはその店舗のオーナーだけ");
  assert.match(tk.$token[".validate"], /\$token\.matches\(\/\^\[A-Za-z0-9\]\{24\}\$\/\)/);
  assert.match(tk.$token[".validate"], /demo-toriMatsu-v1/);
  assert.match(tk.$token[".validate"], /root\.child\('global'\)\.child\('shops'\)\.child\(newData\.child\('shopId'\)\.val\(\)\)\.exists\(\)/, "存在しない店舗を指させない");
  assert.strictEqual(tk.$token.$other[".validate"], false);
  const tokRe = new RegExp(tk.$token[".validate"].match(/\$token\.matches\(\/(.+?)\/\)/)[1]);
  assert.ok(tokRe.test(m.genMyPageToken(n => Array.from({ length: n }, (_, i) => i * 11))) && !tokRe.test("A".repeat(23)), "クライアントのトークンの形と一致");
  const sp = rules.shops.$shopId.staffPages;
  assert.strictEqual(sp[".read"], "auth != null && " + own, "一覧はオーナーだけ");
  assert.strictEqual(sp[".write"], undefined);
  assert.strictEqual(sp.$token[".read"], "auth != null", "1件はトークンを知っていれば読める");
  const w = sp.$token[".write"];
  assert.ok(w.includes(own) && w.includes("$shopId !== 'demo-toriMatsu-v1'"));
  assert.match(w, /!data\.exists\(\) && newData\.child\('status'\)\.val\(\) === 'pending'/, "オーナー以外は pending を作るだけ");
  assert.match(w, /data\.child\('status'\)\.val\(\) === 'pending' && !newData\.exists\(\)/, "pending の取り下げだけは誰でも");
  ["name", "approvedAt", "byUid", "revokedAt", "pinResetAt"].forEach(k => assert.ok(sp.$token[k][".validate"].startsWith(own), `${k} はオーナーだけ`));
  assert.match(sp.$token.byUid[".validate"], /newData\.val\(\) === auth\.uid/);
  assert.match(sp.$token[".validate"], /newData\.child\('status'\)\.val\(\) !== 'approved' \|\| newData\.hasChildren\(\['name','approvedAt'\]\)/);
  m.MY_PAGE_STATUSES.forEach(st => assert.ok(sp.$token.status[".validate"].includes(`'${st}'`), st));
  assert.strictEqual(sp.$token.$other[".validate"], false);
  // 申請の記録はルールの必須キーを満たし、オーナーの項目を持たない
  const rec = m.buildMyPageRequest({ displayName: "田中", number: "1" }, "t").rec;
  ["status", "displayName", "requestedAt"].forEach(k => assert.ok(k in rec));
  assert.ok(Object.keys(rec).every(k => k in sp.$token && !sp.$token[k][".validate"].startsWith(own)), "申請はオーナーの項目を書かない");
  // 本人のデータ: users/$uid と同じ形（.write を除く）。読み書きは承認済みの間だけ
  const pd2 = rules.staffPageData;
  assert.strictEqual(pd2[".read"], undefined, "一覧は読めない");
  const ap = "root.child('shops').child(root.child('staffPageTokens').child($token).child('shopId').val()).child('staffPages').child($token).child('status').val() === 'approved'";
  assert.ok(pd2.$token[".read"].includes(ap) && pd2.$token[".write"].includes(ap), "承認済みの間だけ");
  assert.match(pd2.$token[".write"], /\$token\.matches\(\/\^\[A-Za-z0-9\]\{24\}\$\/\)/);
  const strip = o => (o && typeof o === "object" ? Object.fromEntries(Object.entries(o).filter(([k]) => k !== ".write").map(([k, v]) => [k, strip(v)])) : o);
  ["workplaces", "shifts", "overrides", "goals", "actuals", "seen"].forEach(k => assert.deepStrictEqual(pd2.$token[k], strip(rules.users.$uid[k]), `${k} の形が users と同じ（ドリフト検出）`));
  assert.strictEqual(pd2.$token.$other[".validate"], false, "未知のキー（profile・links など）は書けない");
  assert.deepStrictEqual(rules.staffPagePins, { ".read": false, ".write": false }, "暗証番号は Cloud Functions だけ");
});
test("個別URL: 入口のゲートと、App の書き込み（承認はオーナーが読み直して書く・追随は紐付けと同じ列）", () => {
  const main = fs.readFileSync(path.join(ROOT, "app-main.js"), "utf8");
  assert.ok(/const pageRoute=MY_SCREEN_ENABLED&&bootRoute\?\.type==="page"/.test(main), "個別URLはゲートの下");
  assert.ok(/if\(MY_SCREEN_ENABLED&&pageRoute!==null\) return <MyPageView /.test(main));
  assert.ok(/onOpenPageRegister=\{MY_SCREEN_ENABLED&&urlLocked&&!DEMO_MODE\?/.test(main), "申請の入口もゲートの下");
  const act = main.slice(main.indexOf("const staffPageAct="), main.indexOf("const STAFF_LINK_CFS="));
  assert.ok(act.includes('.ref(`shops/${sid}/staffPages`).once("value")') && act.includes("fbUpd(`shops/${sid}/staffPages`,r.patch)"), "読み直した staffPages から差分を作って update");
  assert.ok(!/fbSet\(`shops\/\$\{sid\}\/staffPages`/.test(main), "staffPages 全体を set() しない");
  // 店舗のデータへの書き込みは申請（staffPageTokens・staffPages）だけ。本人の画面から店舗の他のノードに書かない
  const my = fs.readFileSync(path.join(ROOT, "app-my.js"), "utf8");
  const reg = my.slice(my.indexOf("function MyPageRegister("), my.indexOf("function StaffPageRequestsCard("));
  assert.deepStrictEqual([...reg.matchAll(/\b(fbSet|fbUpd)\(\s*`([^`]*)`/g)].map(x => x[2]), ["staffPageTokens/${token}", "shops/${shopId}/staffPages/${token}"]);
  const view = my.slice(my.indexOf("function MyPageView("));
  assert.ok(!/\b(fbSet|fbUpd)\(/.test(view.slice(0, view.indexOf("\n}\n"))), "個別URLの画面の入口は店舗に書かない（提出は App の staffOnSub）");
});
test("個別URL（P2）: 提出先は最新の期間・名前は承認された名前で固定（Cookie を読まない・書かない）・提出は App の同じ処理", () => {
  assert.strictEqual(m.myLatestPeriodOf([]), null);
  assert.strictEqual(m.myLatestPeriodOf([{ id: "a", startDate: "2026-10-01" }, { id: "b", startDate: "2026-10-16" }, { id: "c", startDate: "bad" }, null]).id, "b");
  assert.strictEqual(m.myLatestPeriodOf([{ id: "a", startDate: "2026-10-16" }, { id: "b", startDate: "2026-10-01" }]).id, "a");
  const st = fs.readFileSync(path.join(ROOT, "app-staff.js"), "utf8");
  assert.ok(/const savedName=fixedName\|\|\(shopId&&apid\?getCookie/.test(st), "固定の名前を先に使う");
  assert.ok(/if\(shopId&&apid&&!fixedName\) setCookie\(ckStaffKey/.test(st), "個別URLの提出は Cookie に名前を書かない");
  assert.strictEqual((st.match(/setName\(fixedName\|\|sub\.staffName\)/g) || []).length, 2, "提出状況からの修正でも名前は固定のまま");
  const my = fs.readFileSync(path.join(ROOT, "app-my.js"), "utf8");
  const sub = my.slice(my.indexOf('if(tab==="submit"){'), my.indexOf('if(tab==="submit"){') + 900);
  assert.ok(/ap=\{latest\} apid=\{latest\.id\}/.test(sub) && /fixedName=\{page\.name\}/.test(sub) && /onSub=\{onSub\}/.test(sub), "最新の期間・承認された名前・App の提出");
  const main = fs.readFileSync(path.join(ROOT, "app-main.js"), "utf8");
  assert.ok(/onSub=\{staffOnSub\}/.test(main) && /onSub=\{staffOnSub\} onDeleteSub=\{staffOnDeleteSub\}( staffUser=\{staffUser\})?\/>;/.test(main), "募集URLと個別URLが同じ staffOnSub を通る");
  assert.ok(/useEffect\(\(\)=>\{ if\(pageRoute!==null&&latestPeriod&&apid!==latestPeriod\.id\) setApid\(latestPeriod\.id\); \}/.test(main), "最新の期間を購読する");
});
// 全員のシフト表（2026-10-04 に PDF の「シフト表」と同じ仕様へ・ユーザー指示）。HTML から列・行・セルを読む
function _sheetCells(html) {
  const out = {};
  for (const tr of html.split("<tr").slice(1)) {
    const rm = /data-sheet-row="([^"]+)" data-sheet-field="(start|end)"/.exec(tr);
    if (!rm) continue;
    const tds = [...tr.matchAll(/<td data-sheet-cell="(\w+)"( data-helper="1")? style="([^"]*)">([^<]*)<\/td>/g)];
    out[rm[1] + "|" + rm[2]] = tds.map(t => ({ kind: t[1], style: t[3], text: t[4] }));
  }
  return out;
}
const _sheetCols = html => [...html.matchAll(/data-sheet-col="([^"]+)"/g)].map(x => x[1]);
test("全員のシフト表（PDF と同じ仕様）: 公開済みだけ・並びは写しと非表示を当てた名簿＋未登録の提出者・保存値の時刻（17.5 の表記）・メモ・休暇は種別名（2026-10-04 から PDF も種別名）", () => {
  const p = { id: "p1", startDate: "2026-10-01", endDate: "2026-10-03", label: "2026年10月" };
  const pub = { ...p, published: { at: "2026-10-01T00:00:00.000Z", byUid: "O" } };
  const settings = { staffAliases: { 佐藤: ["さとう"] }, staffHidden: { 退職: true }, overtimeSettings: { byStaff: { 田中: { dinner: 30 } } },
    staffNumbers: { 田中: "001" }, staffColors: { 佐藤: "red" } };
  const subs = [
    { id: "a", periodId: "p1", staffName: "田中", shifts: { "2026-10-01": { status: "work", start: "17:30", end: "23:00", startNote: "h", changed: true }, "2026-10-02": { status: "work", start: "9:30", end: "15:00", adjustedStart: "10:00", adjustedEndNote: "研修" } } },
    { id: "b", periodId: "p1", staffName: "さとう", shifts: { "2026-10-01": { status: "work", start: "10:00", end: "15:00", adminRest: { start: true, end: true }, leaveTypes: { start: "paid", end: "paid" } }, "2026-10-02": { status: "work", start: "11:00", end: "15:00", adminRest: { end: true }, leaveTypes: { end: "ceremony" } }, "2026-10-03": { status: "holiday" } } },
    { id: "c", periodId: "p1", staffName: "退職", shifts: { "2026-10-01": { status: "work", start: "10:00", end: "15:00" } } },
    { id: "d", periodId: "p1", staffName: "飛び入り<b>", shifts: { "2026-10-03": { status: "work", start: "12:00", end: "14:00" } } },
    { id: "z", periodId: "p0", staffName: "田中", shifts: { "2026-10-03": { status: "work", start: "1:00", end: "2:00" } } },
  ];
  const staff = ["田中", "__spacer__1", "佐藤", "退職"];
  assert.strictEqual(m.buildMyShiftSheet({ period: null }, U).state, "noPeriod");
  assert.strictEqual(m.buildMyShiftSheet({ period: pub, staff, settings, subs, premium: false }, U).state, "premium");
  assert.strictEqual(m.buildMyShiftSheet({ period: p, staff, settings, subs, premium: true }, U).state, "unpublished", "未公開は出さない");
  const t = m.buildMyShiftSheet({ period: pub, staff, settings, subs, premium: true, me: "佐藤", todayStr: "2026-10-01", shopName: "駅前店" }, U);
  assert.strictEqual(t.state, "ok");
  assert.deepStrictEqual(_sheetCols(t.html), ["田中", "佐藤", "飛び入り&lt;b&gt;"], "空白列は残し・非表示の人は落とし・未登録の提出者は末尾（PDF の buildPdfCols と同じ）。名前はエスケープする");
  assert.ok(!t.html.includes("<b>"), "文字はすべてエスケープ（innerHTML で入れるため）");
  assert.ok(/data-sheet-col="佐藤" data-sheet-me="1"/.test(t.html), "本人の列に印");
  assert.ok(/color:#e53935/.test(t.html), "名前の色（staffColors）");
  assert.ok(/>001<\/th>/.test(t.html), "従業員番号の行");
  assert.ok(t.html.includes(">1<br>0<br>月<") && !t.html.includes("2<br>0<br>2<br>6"), "左上は年を除いた期間名を縦に（PDF と同じ）");
  assert.ok(t.html.includes("駅<br>前<br>店"), "右上は店舗名を縦に");
  const c = _sheetCells(t.html);
  // 列: 田中・空白・佐藤・飛び入り（空白列は data-sheet-cell を持たないので3つ）
  assert.deepStrictEqual(c["2026-10-01|start"].map(x => x.text), ["17.5h", "有給", ""]);
  assert.ok(/#B7EBC6/.test(c["2026-10-01|start"][0].style), "変更マークは緑（メモの黄色より優先）");
  assert.strictEqual(c["2026-10-01|end"][0].text, "23", "退勤延長は足さない（PDF は保存された時刻を出す）");
  assert.deepStrictEqual(c["2026-10-02|start"].map(x => x.text), ["10", "11", ""], "管理者の調整値が出る");
  assert.strictEqual(c["2026-10-02|end"][0].text, "15研修");
  assert.ok(/#FFFF00/.test(c["2026-10-02|end"][0].style), "メモのあるセルは黄色");
  assert.deepStrictEqual(c["2026-10-01|start"].map(x => x.kind), ["text", "leave", "none"], "終日の有給は種別名（画面と同じ・斜線なし）");
  assert.deepStrictEqual([c["2026-10-01|start"][1].text, c["2026-10-01|end"][1].text], ["有給", "有給"], "終日なら上下とも");
  assert.ok(!/svg/.test(c["2026-10-01|start"][1].style), "種別名のセルには斜線を引かない");
  assert.ok(/font-size:12px/.test(c["2026-10-01|start"][1].style), "全角2文字は 30px の列に 12px で収まる");
  assert.deepStrictEqual([c["2026-10-02|start"][1].kind, c["2026-10-02|start"][1].text, c["2026-10-02|end"][1].kind, c["2026-10-02|end"][1].text], ["text", "11", "leave", "慶弔"], "半日の慶弔は退勤の帯だけ種別名・出勤は時刻");
  assert.deepStrictEqual(c["2026-10-03|start"].map(x => x.kind), ["none", "hatch", "text"], "休みの提出は斜線・別の期間の提出は使わない");
  assert.ok(!/data-headcount/.test(t.html), "昼夜の人数は設定した店舗だけ");
  // 確定・終了済みの期間は写しの並びと設定（写しに居ない人は出さない）
  const snap = { ...pub, confirmation: { at: "t", byUid: "O" }, snapshot: { staffList: ["佐藤"], settings: { staffAliases: { 佐藤: ["さとう"] } } } };
  assert.deepStrictEqual(_sheetCols(m.buildMyShiftSheet({ period: snap, staff, settings, subs, premium: true, todayStr: "2026-10-01" }, U).html), ["佐藤", ...["田中", "退職", "飛び入り&lt;b&gt;"].sort((a, b) => a.localeCompare(b, "ja"))],
    "写しに居ない人の提出は未登録の名前として末尾に出る（PDF と同じ）");
  // 昼夜の人数（headcountAt）はヒートマップと同じ区間で数える。休暇の帯の人は数えない
  const hc = m.buildMyShiftSheet({ period: pub, staff, settings: { ...settings, headcountAt: { enabled: true, lunch: "12:00", dinner: "19:00" } }, subs, premium: true, todayStr: "2026-10-01" }, U);
  assert.deepStrictEqual([...hc.html.matchAll(/data-headcount="([^"]*)"/g)].map(x => x[1]).slice(0, 2), ["夜1", "夜1"], "10/1 は田中（17:30〜）だけ。有給の佐藤は数えない");
  assert.strictEqual(hc.headcount, true);
});
test("全員のシフト表: 他店でのヘルプ勤務（H2）を PDF と同じ規則で出す（所属店舗の人だけ・休暇の日は出さない・読めない他店は helperUnread）（2026-10-04）", () => {
  const pub = { id: "p1", startDate: "2026-10-01", endDate: "2026-10-03", label: "10月", published: { at: "2026-10-01T00:00:00.000Z", byUid: "O" } };
  const staff = ["田中", "佐藤"];
  const settings = {};
  const subs = [{ id: "a", periodId: "p1", staffName: "田中", shifts: {
    "2026-10-01": { status: "work", start: "10:00", end: "15:00" },
    "2026-10-02": { status: "holiday" },
    "2026-10-03": { status: "work", start: "10:00", end: "15:00", adminRest: { start: true, end: true }, leaveTypes: { start: "paid", end: "paid" } } } }];
  const bSubs = { x: { id: "x", periodId: "b1", staffName: "田中", shifts: {
    "2026-10-01": { status: "work", start: "17:00", end: "22:00" }, "2026-10-02": { status: "work", start: "11:00", end: "15:00" },
    "2026-10-03": { status: "work", start: "17:00", end: "21:00" } } },
    y: { id: "y", periodId: "b1", staffName: "佐藤", shifts: { "2026-10-01": { status: "work", start: "17:00", end: "22:00" } } } };
  const B = U.otherShopDataOf({ name: "三ビル", settings: { staffHomeShop: { 田中: "A" }, shopAbbrs: ["鶏三"], shopAbbr2: { top: "鶏", bottom: "三" } },
    subs: bSubs, staff: ["田中", "佐藤"], periods: { b1: { id: "b1", startDate: "2026-10-01", endDate: "2026-10-15" } } });
  // 佐藤は B の別人（人物が別）。田中は人物 1042 で A・B がつながる
  const link = { id: "C1", shops: { A: "駅前店", B: "三ビル" }, people: { "1042": { A: "田中", B: "田中" }, p_AAAAAAAA: { A: "佐藤" }, p_BBBBBBBB: { B: "佐藤" } } };
  const t = m.buildMyShiftSheet({ period: pub, staff, settings, subs, premium: true, todayStr: "2026-10-01", shopId: "A", helpers: { companyLink: link, otherShops: { B } } }, U);
  const c = _sheetCells(t.html);
  assert.strictEqual(c["2026-10-01|end"][0].text, "22鶏三", "自店 10-15 ＋ B 17-22 は下のセルにヘルプ先の終了と略称");
  assert.strictEqual(c["2026-10-01|end"][0].kind, "helper");
  assert.ok(/#FFFF00/.test(c["2026-10-01|end"][0].style), "ヘルプのセルは黄色");
  assert.strictEqual(c["2026-10-01|start"][0].text, "10", "上は自店の開始のまま");
  assert.deepStrictEqual([c["2026-10-02|start"][0].text, c["2026-10-02|end"][0].text], ["11鶏", "15三"], "自店は休みの提出＋ヘルプ先だけの日は2セル用の略称・斜線なし");
  assert.deepStrictEqual([c["2026-10-03|start"][0].kind, c["2026-10-03|end"][0].text], ["leave", "有給"], "休暇の日は種別名を優先してヘルプを出さない（画面・PDF と同じ）");
  assert.ok(!t.html.includes("17鶏") && !t.html.includes("21三"), "10/3 の B 17-21 は出ない");
  assert.strictEqual(c["2026-10-01|end"][1].kind, "none", "別人の佐藤には合算しない");
  assert.strictEqual(t.helperUnread, false);
  // 材料が無い（企業に連携していない・読み込み中）ならヘルプなし＝従来の表
  const t0 = m.buildMyShiftSheet({ period: pub, staff, settings, subs, premium: true, todayStr: "2026-10-01", shopId: "A" }, U);
  // シフト作成タブでこの期間の田中の自動表示を OFF にしたら出さない（PDF と同じ・2026-10-05）。表はヘルプなしの表と同じ
  const tOff = m.buildMyShiftSheet({ period: { ...pub, helperDisplayOff: { 田中: true } }, staff, settings, subs, premium: true, todayStr: "2026-10-01", shopId: "A", helpers: { companyLink: link, otherShops: { B } } }, U);
  assert.strictEqual(tOff.html, t0.html, "OFF にした人の自動表示は消え、ヘルプなしの表と一致する");
  assert.ok(!/data-helper/.test(t0.html));
  assert.strictEqual(m.buildMyShiftSheet({ period: pub, staff, settings, subs, premium: true, todayStr: "2026-10-01", shopId: "A", helpers: { companyLink: null, otherShops: { B } } }, U).html, t0.html);
  // 読めなかった他店があれば helperUnread（画面は注記を出す）
  const F = U.otherShopDataOf({ name: "三ビル", loadFailed: true });
  const tf = m.buildMyShiftSheet({ period: pub, staff, settings, subs, premium: true, todayStr: "2026-10-01", shopId: "A", helpers: { companyLink: link, otherShops: { B: F } } }, U);
  assert.strictEqual(tf.helperUnread, true);
  assert.ok(!/data-helper/.test(tf.html));
  // ドリフト検出: 画面の材料は期間ごとの部分読みで、他店の subs を丸ごと読まない。PDF と同じ関数を通る
  const my = fs.readFileSync(path.join(ROOT, "app-my.js"), "utf8");
  const hk = my.slice(my.indexOf("const _myHelperReads="), my.indexOf("function MyAllShiftTable("));
  assert.ok(/readMyPeriodSubs\(sid,pid\)/.test(hk) && !/\/subs`\)\.once/.test(hk) && /otherShopDataOf\(/.test(hk), "他店の subs は期間ごとの部分読み・形は otherShopDataOf");
  assert.ok(!/\.(update|remove|push|transaction)\(|fbSet\(|fbUpd\(/.test(hk) && !/\.set\(/.test(hk.replace(/_myHelperReads\.set\(/g, "")), "他店の材料の読み込みは何も書かない");
  const mu = fs.readFileSync(path.join(ROOT, "app-my-utils.js"), "utf8");
  const b = mu.slice(mu.indexOf("function buildMyShiftSheet("), mu.indexOf("const MY_SHEET_MAX_SCALE"));
  ["u.helperShopsOf(", "u.helperPersonOf(", "u.helperWorkOn(", "u.helperCellDisplay("].forEach(k => assert.ok(b.includes(k), `buildMyShiftSheet が ${k} を通っていない`));
});
test("全員のシフト表: PDF と同じ関数を通る（ドリフト検出）・倍率は横幅に合わせて比率を保つ（2倍まで）", () => {
  const mu = fs.readFileSync(path.join(ROOT, "app-my-utils.js"), "utf8");
  const b = mu.slice(mu.indexOf("function buildMyShiftSheet("), mu.indexOf("const MY_SHEET_MAX_SCALE"));
  ["u.shiftTableHtmlOf(", "u.shiftSheetCellOf(", "u.shiftSheetStoredText(", "u.shiftSheetHeadcountOf(", "u.heatStaffDayEntriesOf(", "u.isUnregisteredSubName(", "u.visibleStaffList(", "u.resolvePeriodMaster("]
    .forEach(k => assert.ok(b.includes(k), `buildMyShiftSheet が ${k} を通っていない`));
  const sh = fs.readFileSync(path.join(ROOT, "app-shift.js"), "utf8");
  const pdf = sh.slice(sh.indexOf("const buildShiftTableHtml="), sh.indexOf("// 休み・連勤カウント統合table"));
  ["shiftTableHtmlOf(", "shiftSheetCellOf(", "shiftSheetHeadcountOf("].forEach(k => assert.ok(pdf.includes(k), `PDF が ${k} を通っていない`));
  assert.ok(sh.includes("shiftSheetStoredText(") && sh.includes("heatStaffDayEntriesOf("), "PDF の保存値の解決とヒートマップも同じ関数");
  assert.strictEqual(m.myShiftSheetScale(343, 686), 0.5);
  assert.strictEqual(m.myShiftSheetScale(1000, 300), m.MY_SHEET_MAX_SCALE);
  assert.strictEqual(m.myShiftSheetScale(0, 300), 1);
  const my = fs.readFileSync(path.join(ROOT, "app-my.js"), "utf8");
  const tb = my.slice(my.indexOf("function MyAllShiftTable("), my.indexOf("function MyPageStatusScreen("));
  assert.ok(/buildMyShiftSheet\(/.test(tb) && /dangerouslySetInnerHTML=\{\{__html:t\.html\}\}/.test(tb) && /transform:`scale\(\$\{sc\}\)`/.test(tb), "PDF と同じ HTML を縮めて出す");
  assert.ok(!/<input/.test(tb), "全員の表は入力欄を持たない（16px の規約に触れない）");
  assert.ok(!/2本の指/.test(my), "「2本の指で拡大」の文言は出さない（ユーザー指示）");
  assert.ok(/overflowX:zoomed\|\|single\?"hidden":"auto"/.test(my) && /scrollSnapType:"x mandatory"/.test(my), "ピンチで拡大中は横スクロールを止める・scroll-snap");
  assert.ok(/role="tablist" aria-label="表示の切り替え"/.test(my), "タップでも切り替えられる");
});
test("給料タブの要約: 月間目標は任意（目標なしでも金額を出し、円グラフは目標を設定したときだけ）・時給が未設定の勤務先を返す（2026-10-04）", () => {
  const row = (name, total, confirmed) => ({ name, amounts: { total, confirmedTotal: confirmed, projectedTotal: total == null ? null : total - confirmed, minutes: { workMin: 60 } } });
  const month = { rows: [row("A店", 10000, 4000), row("B店", null, null)], total: 10000, confirmedTotal: 4000, projectedTotal: 6000, hasAmount: true };
  assert.deepStrictEqual(m.myPaySummaryOf(month, 0), { showRing: false, progress: null, projectedProgress: null, missingWage: ["B店"], allMissing: false });
  assert.deepStrictEqual(m.myPaySummaryOf(month, 20000), { showRing: true, progress: 0.2, projectedProgress: 0.5, missingWage: ["B店"], allMissing: false });
  assert.strictEqual(m.myPaySummaryOf({ rows: [row("B店", null, null)] }, 0).allMissing, true);
  assert.deepStrictEqual(m.myPaySummaryOf(null, 5000), { showRing: true, progress: null, projectedProgress: null, missingWage: [], allMissing: false });
  const my = fs.readFileSync(path.join(ROOT, "app-my.js"), "utf8");
  const tab = my.slice(my.indexOf("function MyPayTab("), my.indexOf("function MyGoalSection("));
  const body = my.slice(my.indexOf("function MyPaySummaryBody("), my.indexOf("const _myYmLabel="));
  assert.ok(/<MyPaySummaryBody data=\{month\} summary=\{summary\}\/>/.test(tab) && /\{ring&&<MyGoalRing progress=\{summary\.progress\} projected=\{summary\.projectedProgress\}\/>\}/.test(body), "円グラフは目標を設定したときだけ（月と年で同じ部品）");
  assert.ok(!/premium&&X\.goal/.test(tab) && !/X\.goal>0&&month/.test(tab), "金額の表示は目標に左右されない");
  assert.ok(/<MyPayTab me=\{me\} personal=\{personal\} onGoSettings=\{\(\)=>setTab\("settings"\)\}\/>/.test(my), "個別URLの給料タブからも設定へ行ける");
});
test("勤務先の従業員番号: 店舗ごとに settings.staffNumbers[名前] を出す（無ければ出さない）・アカウントの番号は照合に使う旨の説明（2026-10-04）", () => {
  assert.strictEqual(m.myStaffNumberOf({ staffNumbers: { 田中: " 001 " } }, "田中"), "001");
  assert.strictEqual(m.myStaffNumberOf({ staffNumbers: { 田中: 12 } }, "田中"), "12");
  assert.strictEqual(m.myStaffNumberOf({ staffNumbers: { 佐藤: "1" } }, "田中"), "");
  assert.strictEqual(m.myStaffNumberOf({}, "田中"), "");
  assert.strictEqual(m.myStaffNumberOf(null, "田中"), "");
  assert.strictEqual(m.myStaffNumberOf({ staffNumbers: { 田中: { x: 1 } } }, "田中"), "");
  const my = fs.readFileSync(path.join(ROOT, "app-my.js"), "utf8");
  const sec = my.slice(my.indexOf("function useMyStaffNumbers("), my.indexOf("// ===== 給料（2026-10-04・第2部 E5）====="));
  assert.ok(/readMyShiftShopShared\(l\.shopId\)/.test(sec) && /myStaffNumberOf\(v\.settings,l\.name\)/.test(sec), "番号は店舗の settings から、紐付いた名前で引く");
  assert.ok(/data-my-wp-number=/.test(sec) && !/fbSet|fbUpd/.test(sec.slice(0, sec.indexOf("function MyWorkplacesSection("))), "読むだけ");
  assert.ok(/hint=\{MY_PROFILE_NUMBER_HINT\}/.test(my) && /掛け持ち先の番号は、そのお店に申請するとき/.test(m.MY_PROFILE_NUMBER_HINT));
});
test("これまでの給料の一括入力（2026-10-04）: 変えたセルだけ書く・空欄は変えない・入っていた金額を消したときだけ null・読めない入力は書かない", () => {
  const rc = { "2025-01": { S1: 100000 }, "2025-02": { S1: 90000, m_A: 1 }, "2026-01": { S1: 5 } };
  const f = m.myReceivedBulkForm(rc, 2025, ["S1", "m_A"]);
  assert.strictEqual(Object.keys(f.S1).length, 12);
  assert.deepStrictEqual([f.S1["2025-01"], f.S1["2025-02"], f.S1["2025-03"], f.m_A["2025-02"]], ["100000", "90000", "", "1"], "今の値が初期値");
  assert.deepStrictEqual(m.planMyReceivedBulk(rc, f), { patch: {}, writes: 0, removes: 0 }, "何も変えなければ書かない");
  const r = m.planMyReceivedBulk(rc, { ...f, S1: { ...f.S1, "2025-01": "100000", "2025-02": "", "2025-03": "８０,０００" }, m_A: { ...f.m_A, "2025-12": "0" } });
  assert.deepStrictEqual(r, { patch: { "actuals/2025-02/S1": null, "actuals/2025-03/S1": 80000, "actuals/2025-12/m_A": 0 }, writes: 2, removes: 1 });
  assert.ok(!Object.keys(r.patch).some(k => k.startsWith("actuals/2026")), "ほかの年は触らない");
  assert.deepStrictEqual(m.planMyReceivedBulk(rc, { S1: { "2025-05": "1万" } }), { error: "振込額は円の数字で入力してください", ym: "2025-05", wid: "S1" });
  assert.deepStrictEqual(m.planMyReceivedBulk(rc, { S1: { "2025-13": "1" } }).patch, {}, "支給月の形でない鍵は使わない");
  // 年の表示の合計の規則は変えない: 見込み（目安）と振込額は別々の列・別々の年間合計。シフトが無い月の振込額も振込額の年間に入る
  const y = m.myPayYearSummary(m.myPayYearMonths(2025).map(ym => ({ payYm: ym, total: 0, confirmedTotal: 0, projectedTotal: 0, workMin: 0 })), rc);
  assert.strictEqual(y.received, 190001); assert.strictEqual(y.total, 0);
  const my = fs.readFileSync(path.join(ROOT, "app-my.js"), "utf8");
  const tab = my.slice(my.indexOf("function MyReceivedBulkForm("), my.indexOf("function MyGoalSection("));
  assert.ok(/planMyReceivedBulk\(received,form\)/.test(tab) && /saveReceivedBulk/.test(tab) && /canEdit&&!bulk/.test(tab), "保存は差分・入口は振込額の入力と同じ境目（canEdit）");
  assert.ok(/inputMode="numeric"/.test(tab) && /style=\{\{\.\.\.AI/.test(tab), "数字の入力・16px（AI）");
  const ex = my.slice(my.indexOf("function useMyPayExtras("), my.indexOf("function MyGoalRing("));
  assert.ok(/saveReceivedBulk:async patch=>\{/.test(ex) && !/fbSet\(/.test(ex), "1回の update で書く（set しない）");
});
// ===== 全員のシフトの期間と店舗の選び方（2026-10-04・ユーザー指示: 未公開の案内を出さない・期間をプルダウン・直近3ヶ月・#/me でも）=====
test("全員のシフト: 期間の選択肢は公開済みかつ直近3ヶ月（subsWindowCutoff と同じ窓）を新しい順。Premium でなければ空", () => {
  const pub = { at: "2026-09-01T00:00:00.000Z", byUid: "O" };
  const ps = [
    { id: "a", startDate: "2026-10-16", endDate: "2026-10-31", label: "10月後半" },                 // 最新だが未公開
    { id: "b", startDate: "2026-10-01", endDate: "2026-10-15", label: "10月前半", published: pub },
    { id: "c", startDate: "2026-09-16", endDate: "2026-09-30", published: pub },
    { id: "d", startDate: "2026-07-04", endDate: "2026-07-15", published: pub },                  // 窓の下限ちょうど（今日 10-04 の3ヶ月前）
    { id: "e", startDate: "2026-07-03", endDate: "2026-07-15", published: pub },                  // 窓の外
    { id: "f", startDate: "bad", published: pub }, null,
  ];
  assert.strictEqual(U.subsWindowCutoff(new Date(2026, 9, 4)), "2026-07-04");
  const o = m.myAllShiftPeriodOptions(ps, { premium: true, todayStr: "2026-10-04" }, U);
  assert.deepStrictEqual(o.map(p => p.id), ["b", "c", "d"], "未公開・3ヶ月より古い・日付の無い期間は出さない。既定（先頭）は公開済みの最新");
  assert.deepStrictEqual(m.myAllShiftPeriodOptions(ps, { premium: false, todayStr: "2026-10-04" }, U), []);
  assert.deepStrictEqual(m.myAllShiftPeriodOptions(ps.filter(p => p && !p.published), { premium: true, todayStr: "2026-10-04" }, U), [], "公開済みが無ければ空");
  // 管理者画面と同じ窓（recentPeriodIds の決め方）
  const recent = new Set(U.recentPeriodIds(ps.filter(Boolean), new Date(2026, 9, 4)));
  o.forEach(p => assert.ok(recent.has(p.id), p.id));
});
test("全員のシフト: 店舗の選択肢と既定（募集URLの店舗 → 公開済みの最新が最も新しい店舗）・選び直し", () => {
  const pub = { at: "t", byUid: "O" };
  const shop = (shopId, plan, starts, extra) => ({ shopId, shopName: shopId + "店", name: "田中", plan, settings: { x: shopId }, staff: ["田中"],
    periods: starts.map((d, i) => ({ id: shopId + i, startDate: d, endDate: d, published: pub })), ...(extra || {}) });
  const A = shop("A", "premium", ["2026-09-16"]), B = shop("B", "premium", ["2026-10-01", "2026-09-16"]),
    C = shop("C", "pro", ["2026-10-01"]), D = shop("D", "premium", ["2026-01-01"]);
  const c = m.myAllShiftChoices({ shops: [A, B, C, D], todayStr: "2026-10-04" }, U);
  assert.deepStrictEqual(c.shops.map(s => s.shopId), ["A", "B"], "Premium でない店舗・選べる期間の無い店舗は出さない（並びは渡した順）");
  assert.strictEqual(c.defaultShopId, "B", "公開済みの最新が最も新しい店舗");
  assert.deepStrictEqual(c.shops[1].settings, { x: "B" }, "表の材料（settings・staff・plan）は持ち回る");
  assert.strictEqual(c.shops[1].name, "田中");
  assert.strictEqual(m.myAllShiftChoices({ shops: [A, B], preferredShopId: "A", todayStr: "2026-10-04" }, U).defaultShopId, "A", "募集URLから開いたときはその店舗");
  assert.strictEqual(m.myAllShiftChoices({ shops: [A, B], preferredShopId: "C", todayStr: "2026-10-04" }, U).defaultShopId, "B", "その店舗に選択肢が無ければ通常の既定");
  const tie = m.myAllShiftChoices({ shops: [shop("X", "premium", ["2026-10-01"]), shop("Y", "premium", ["2026-10-01"])], todayStr: "2026-10-04" }, U);
  assert.strictEqual(tie.defaultShopId, "X", "同じ日なら並びの先");
  const none = m.myAllShiftChoices({ shops: [C, D], todayStr: "2026-10-04" }, U);
  assert.deepStrictEqual(none, { shops: [], defaultShopId: null });
  assert.strictEqual(m.myAllShiftSelection(none, {}), null, "選べる期間が無ければ何も出さない");
  // 選び直し
  assert.strictEqual(m.myAllShiftSelection(c, {}).period.id, "B0");
  assert.strictEqual(m.myAllShiftSelection(c, { shopId: "B", periodId: "B1" }).period.id, "B1");
  assert.strictEqual(m.myAllShiftSelection(c, { shopId: "A", periodId: null }).period.id, "A0");
  assert.strictEqual(m.myAllShiftSelection(c, { shopId: "B", periodId: "gone" }).period.id, "B0", "選んだ期間が選択肢から消えたら既定へ");
  assert.strictEqual(m.myAllShiftSelection(c, { shopId: "Z", periodId: "B1" }).shop.shopId, "B", "店舗が消えたら既定の店舗へ");
});
test("全員のシフト: 既定の期間は今日を含む期間（2026-10-05）。無ければ今日より前に始まった最新、それも無ければいちばん近い先", () => {
  const pub = { at: "t", byUid: "O" };
  const P = (id, s, e) => ({ id, startDate: s, endDate: e, published: pub });
  const ps = [P("oct2", "2026-10-16", "2026-10-31"), P("oct1", "2026-10-01", "2026-10-15"), P("sep2", "2026-09-16", "2026-09-30")];
  const opts = today => m.myAllShiftPeriodOptions(ps, { premium: true, todayStr: today }, U);
  // 次の期間（10月後半）が公開済みでも、今日（10/5）を含む10月前半を出す。境界（開始日・最終日）も含む
  assert.deepStrictEqual(m.myNowPeriodOf(opts("2026-10-05"), "2026-10-05"), { period: ps[1], now: true });
  assert.strictEqual(m.myNowPeriodOf(opts("2026-10-01"), "2026-10-01").period.id, "oct1");
  assert.strictEqual(m.myNowPeriodOf(opts("2026-10-15"), "2026-10-15").period.id, "oct1");
  assert.strictEqual(m.myNowPeriodOf(opts("2026-10-16"), "2026-10-16").period.id, "oct2");
  // いまの期間が未公開なら、今日より前に始まった最も新しい公開済み（先の期間には飛ばない）
  const noCur = [ps[0], ps[2]];
  assert.deepStrictEqual(m.myNowPeriodOf(noCur, "2026-10-05"), { period: ps[2], now: false });
  // 先の期間しか無ければいちばん近い先
  assert.strictEqual(m.myNowPeriodOf([ps[0], ps[1]], "2026-09-20").period.id, "oct1");
  assert.strictEqual(m.myNowPeriodOf([], "2026-10-05"), null);
  // myAllShiftChoices と myAllShiftSelection: 選択肢の並び（新しい順）は変えず、既定だけ今日の期間
  const shop = (shopId, periods) => ({ shopId, shopName: shopId, name: "田中", plan: "premium", periods });
  const c = m.myAllShiftChoices({ shops: [shop("A", ps)], todayStr: "2026-10-05" }, U);
  assert.deepStrictEqual(c.shops[0].options.map(p => p.id), ["oct2", "oct1", "sep2"]);
  assert.strictEqual(c.shops[0].defaultPeriodId, "oct1");
  assert.strictEqual(m.myAllShiftSelection(c, {}).period.id, "oct1");
  assert.strictEqual(m.myAllShiftSelection(c, { shopId: "A", periodId: "oct2" }).period.id, "oct2", "選び直しは従来どおり");
  assert.strictEqual(m.myAllShiftSelection(c, { shopId: "A", periodId: "gone" }).period.id, "oct1", "選んだ期間が消えたら今日の期間へ");
  // 既定の店舗: 今日を含む期間がある店舗を先に（B は先の期間の開始が新しくても、今日の期間が未公開）
  const A = shop("A", [ps[2], P("a-oct1", "2026-10-01", "2026-10-15")]), B = shop("B", [ps[2], P("b-oct2", "2026-10-16", "2026-10-31")]);
  assert.strictEqual(m.myAllShiftChoices({ shops: [B, A], todayStr: "2026-10-05" }, U).defaultShopId, "A");
  assert.strictEqual(m.myAllShiftChoices({ shops: [B, A], preferredShopId: "B", todayStr: "2026-10-05" }, U).defaultShopId, "B", "募集URLの店舗が優先");
  // ヘルプ先（確定済みだけ）も同じ規則
  const conf = { at: "t", byUid: "O" };
  const H = { shopId: "H", shopName: "H", name: "田中", plan: "premium", helpDest: true,
    periods: [{ id: "h2", startDate: "2026-10-16", endDate: "2026-10-31", confirmation: conf }, { id: "h1", startDate: "2026-10-01", endDate: "2026-10-15", confirmation: conf }] };
  const ch = m.myAllShiftChoices({ shops: [H], todayStr: "2026-10-05" }, U);
  assert.strictEqual(m.myAllShiftSelection(ch, {}).period.id, "h1");
});
test("全員のシフト（画面）: 未公開・Premium の案内文を出さない・選択肢が無いときは切り替えを出さない・#/me にも同じ部品", () => {
  const my = fs.readFileSync(path.join(ROOT, "app-my.js"), "utf8");
  assert.ok(!/まだ公開されていません/.test(my), "未公開の案内文は無い");
  assert.ok(!/data-my-all-state="unpublished"/.test(my) && !/data-my-all-state="premium"/.test(my));
  assert.ok(/\{!single&&<div role="tablist"/.test(my), "表示が1つのときはタブを出さない");
  const pv = my.slice(my.indexOf("function MyPageView("));
  assert.ok(/allChoices\.shops\.length\?\[\{key:"all"/.test(pv), "個別URL: 選択肢があるときだけ全員のシフト");
  const ap = my.slice(my.indexOf("function MyAccountShiftPager("), my.indexOf("function MyView("));
  assert.ok(/useMyAllShiftSources\(me\)/.test(ap) && /preferredShopId:shopId/.test(ap) && /<MyAllShiftPane /.test(ap), "#/me: 同じ部品・募集URLの店舗が既定");
  assert.ok(/<MyAccountShiftPager /.test(my.slice(my.indexOf("function MyView("), my.indexOf("function MyView(") + 4000)));
  // 読み込み: 期間ごとの部分読み（readMyPeriodSubs）だけ。店舗の subs 全件を読まない
  const src = my.slice(my.indexOf("function useMyAllShiftSources("), my.indexOf("function mySubsByPeriodOf("));
  assert.ok(/readMyPeriodSubs\(sid,pid\)/.test(src) && !/\/subs`\)/.test(src) && !/\.set\(|\.update\(|\.push\(/.test(src), "期間ごとの部分読み・書き込みなし");
  assert.ok(/orderByChild\("periodId"\)\.equalTo\(pid\)/.test(my.slice(my.indexOf("async function readMyPeriodSubs("), my.indexOf("async function readMyPeriodSubs(") + 400)));
  // プルダウンは 16px（AI）
  const pane = my.slice(my.indexOf("function MyAllShiftPane("), my.indexOf("function MyAllShiftTable("));
  // 2026-10-05: 店舗のプルダウンは無く、期間の1つだけ（店舗は縦に並べる＝myAllShiftStack）
  assert.strictEqual((pane.match(/<select /g) || []).length, 1);
  assert.ok(!/data-my-all-shop="1"/.test(pane), "店舗のプルダウンは無い");
  assert.ok(/myAllShiftStack\(choices,/.test(pane) && /st\.blocks\.map\(/.test(pane), "店舗は縦に並べる");
  assert.strictEqual((pane.match(/style=\{\{\.\.\.AI,/g) || []).length, 1, "select は AI（16px）");
});
// ===== 個別URL（P4）: 給料の暗証番号（CF myPagePin）=====
const mpg = require("../functions/my-page.js");
const cc = require("../functions/company-config.js");
test("個別URL（P4）: 暗証番号の入力（全角は半角・4桁・確認の一致）", () => {
  assert.ok(m.isValidMyPagePin("1234") && m.isValidMyPagePin("１２３４") && m.isValidMyPagePin(" 0000 "));
  ["123", "12345", "12a4", "", null].forEach(p => assert.strictEqual(m.isValidMyPagePin(p), false, String(p)));
  assert.strictEqual(m.validateMyPagePinInput("1234", "１２３４"), null);
  assert.ok(m.validateMyPagePinInput("1234", "1235"));
  assert.ok(m.validateMyPagePinInput("12"));
});
test("個別URL（P4）: CF の判定（使える状態はクライアントの resolveMyPage と同じ規則）", () => {
  const T = "A".repeat(24), staff = ["田中"];
  const cases = [
    [{ token: "x", tokenRec: { shopId: "S1" }, pageRec: { status: "approved", name: "田中" }, staff }, "invalid"],
    [{ token: T, tokenRec: null, pageRec: null, staff }, "missing"],
    [{ token: T, tokenRec: { shopId: "S1" }, pageRec: { status: "pending" }, staff }, "pending"],
    [{ token: T, tokenRec: { shopId: "S1" }, pageRec: { status: "revoked", name: "田中" }, staff }, "revoked"],
    [{ token: T, tokenRec: { shopId: "S1" }, pageRec: { status: "approved", name: "退職" }, staff }, "missingName"],
    [{ token: T, tokenRec: { shopId: "S1" }, pageRec: { status: "approved", name: "田中" }, staff }, "ok"],
  ];
  cases.forEach(([o, st]) => {
    const cf = mpg.myPageAccessCF(o), cl = m.resolveMyPage(o.token, o.tokenRec, o.pageRec, o.staff);
    assert.strictEqual(cl.state, st, JSON.stringify(o));
    assert.strictEqual(!cf.error, st === "ok", JSON.stringify(o));
    if (!cf.error) assert.deepStrictEqual(cf, { shopId: "S1", name: "田中" });
  });
});
test("個別URL（P4）: 暗証番号の計画（決める・照合・5回で15分・変更はいまの番号が要る・管理者のリセット）", () => {
  const H = (salt, p) => cc.payCodeHashCF(salt, p);
  const salt = "s".repeat(16), now = 1e12, page = { status: "approved", name: "田中" };
  let r = mpg.planMyPagePin({ action: "status", pinRec: null, pageRec: page, now });
  assert.deepStrictEqual(r.result, { ok: true, hasPin: false, waitSec: 0 });
  assert.strictEqual(mpg.planMyPagePin({ action: "verify", pin: "1234", pinRec: null, pageRec: page, now }).error.code, "failed-precondition");
  assert.strictEqual(mpg.planMyPagePin({ action: "set", pin: "123", salt, newHash: H(salt, "123"), pinRec: null, pageRec: page, now }).error.code, "invalid-argument");
  r = mpg.planMyPagePin({ action: "set", pin: "1234", salt, newHash: H(salt, "1234"), pinRec: null, pageRec: page, now, nowIso: "2026-10-04T00:00:00.000Z" });
  assert.ok(r.unlocked && r.pinPatch.hash === H(salt, "1234") && r.pinPatch.salt === salt && r.pinPatch.fails === 0);
  let rec = r.pinPatch;
  assert.ok(mpg.pinIsSetCF(rec, page));
  r = mpg.planMyPagePin({ action: "verify", pin: "1234", pinHash: H(rec.salt, "1234"), pinRec: rec, pageRec: page, now });
  assert.ok(r.unlocked && r.pinPatch === undefined, "成功で失敗の記録が無ければ書かない");
  for (let i = 1; i <= 4; i++) {
    r = mpg.planMyPagePin({ action: "verify", pin: "0000", pinHash: H(rec.salt, "0000"), pinRec: rec, pageRec: page, now });
    assert.strictEqual(r.error.code, "permission-denied"); assert.strictEqual(r.pinPatch.fails, i); assert.ok(!r.unlocked);
    rec = r.pinPatch;
  }
  r = mpg.planMyPagePin({ action: "verify", pin: "0000", pinHash: H(rec.salt, "0000"), pinRec: rec, pageRec: page, now });
  assert.strictEqual(r.pinPatch.lockedUntil, now + mpg.PAGE_PIN_LOCK_MS_CF); assert.strictEqual(r.pinPatch.fails, 0);
  rec = r.pinPatch;
  assert.strictEqual(mpg.planMyPagePin({ action: "verify", pin: "1234", pinHash: H(rec.salt, "1234"), pinRec: rec, pageRec: page, now: now + 1000 }).error.code, "resource-exhausted", "止まっている間は正しい番号でも開かない");
  assert.ok(mpg.planMyPagePin({ action: "status", pinRec: rec, pageRec: page, now }).result.waitSec > 800);
  r = mpg.planMyPagePin({ action: "verify", pin: "1234", pinHash: H(rec.salt, "1234"), pinRec: rec, pageRec: page, now: now + mpg.PAGE_PIN_LOCK_MS_CF + 1 });
  assert.ok(r.unlocked && r.pinPatch.lockedUntil === 0, "待ちが過ぎれば開き、記録を戻す");
  rec = r.pinPatch;
  assert.strictEqual(mpg.planMyPagePin({ action: "set", pin: "5678", salt, newHash: H(salt, "5678"), pinRec: rec, pageRec: page, now }).error.code, "permission-denied", "変更はいまの番号が要る");
  r = mpg.planMyPagePin({ action: "set", pin: "5678", currentPin: "1234", currentHash: H(rec.salt, "1234"), salt: "t".repeat(16), newHash: H("t".repeat(16), "5678"), pinRec: rec, pageRec: page, now, nowIso: "2026-10-04T01:00:00.000Z" });
  assert.ok(r.unlocked && r.pinPatch.hash === H("t".repeat(16), "5678"));
  rec = r.pinPatch;
  // 管理者のリセット（pinResetAt）より前に決めた番号は未設定として扱う
  assert.ok(!mpg.pinIsSetCF(rec, { ...page, pinResetAt: "2026-10-05T00:00:00.000Z" }));
  assert.ok(mpg.pinIsSetCF(rec, { ...page, pinResetAt: "2026-10-03T00:00:00.000Z" }));
  assert.strictEqual(mpg.planMyPagePin({ action: "x", pinRec: rec, pageRec: page, now }).error.code, "invalid-argument");
  // ハッシュはクライアント（app-utils.js の payCodeHash）と同じ SHA-256(salt+番号)
  assert.strictEqual(cc.payCodeHashCF("abc", "1234"), require("node:crypto").createHash("sha256").update("abc1234").digest("hex"));
});

test("個別URL: 暗証番号のロックは2回目から倍（30分・60分…上限24時間）・正しい番号で数え直す（2026-10-08）", () => {
  const H = (salt, p) => cc.payCodeHashCF(salt, p);
  const M = 60 * 1000, page = { status: "approved", name: "田中" };
  assert.deepStrictEqual([1, 2, 3, 4, 5, 6, 7, 8, 20].map(mpg.pageLockMsCF), [15, 30, 60, 120, 240, 480, 960, 1440, 1440].map(x => x * M));
  assert.strictEqual(mpg.PAGE_PIN_LOCK_MAX_MS_CF, 24 * 60 * M);
  let now = 1e12;
  let rec = { hash: H("s".repeat(16), "1234"), salt: "s".repeat(16), setAt: "2026-10-04T00:00:00.000Z", fails: 0, lockedUntil: 0 };
  const wrongFive = () => {
    let r;
    for (let i = 0; i < 5; i++) { r = mpg.planMyPagePin({ action: "verify", pin: "0000", pinHash: H(rec.salt, "0000"), pinRec: rec, pageRec: page, now }); rec = r.pinPatch; }
    return r;
  };
  const lens = [];
  for (let k = 1; k <= 9; k++) {
    const r = wrongFive();
    lens.push((rec.lockedUntil - now) / M);
    assert.strictEqual(rec.locks, k, `${k}回目のロック`);
    if (k === 1) assert.ok(/15分後/.test(r.error.msg), r.error.msg);
    if (k === 2) assert.ok(/30分後/.test(r.error.msg), r.error.msg);
    if (k === 9) assert.ok(/24時間後/.test(r.error.msg), r.error.msg);
    // 止まっている間は正しい番号でも開かず、待ちの表示も同じ長さ
    const locked = mpg.planMyPagePin({ action: "verify", pin: "1234", pinHash: H(rec.salt, "1234"), pinRec: rec, pageRec: page, now: now + 1000 });
    assert.strictEqual(locked.error.code, "resource-exhausted");
    now = rec.lockedUntil;
  }
  assert.deepStrictEqual(lens, [15, 30, 60, 120, 240, 480, 960, 1440, 1440]);
  // 正しい番号で数え直す（次のロックは15分から）
  const ok = mpg.planMyPagePin({ action: "verify", pin: "1234", pinHash: H(rec.salt, "1234"), pinRec: rec, pageRec: page, now });
  assert.ok(ok.unlocked && ok.pinPatch.locks === 0 && ok.pinPatch.fails === 0 && ok.pinPatch.lockedUntil === 0);
  rec = ok.pinPatch;
  wrongFive();
  assert.strictEqual(rec.lockedUntil - now, 15 * M, "数え直した後の最初のロックは15分");
  // 番号の変更（いまの番号が正しい）でも数え直す
  now = rec.lockedUntil;
  const set = mpg.planMyPagePin({ action: "set", pin: "5678", currentPin: "1234", currentHash: H(rec.salt, "1234"), salt: "t".repeat(16), newHash: H("t".repeat(16), "5678"), pinRec: rec, pageRec: page, now, nowIso: "2026-10-05T00:00:00.000Z" });
  assert.ok(set.unlocked && !set.pinPatch.locks);
});
test("個別URL（P4）: CF myPagePin は名前を受け取らず、照合が通るまで賃金を読まない・回数はトランザクション・店舗のアーカイブで後始末", () => {
  const src = fs.readFileSync(path.join(ROOT, "functions", "index.js"), "utf8");
  const a = src.indexOf("exports.myPagePin"), b = src.indexOf("exports.getMyPay");
  assert.ok(a > 0 && b > a);
  const body = src.slice(a, b);
  assert.ok(!/data\.name|data\.uid|data\.shopId/.test(body), "名前・uid・店舗を呼び出し元から受け取らない（URL から引く）");
  assert.ok(body.indexOf("throwPlanError(acc)") < body.indexOf("private/pay"), "使える URL かを確かめてから");
  assert.ok(body.indexOf("if (!r.unlocked) return r.result;") < body.indexOf("private/pay"), "照合が通るまで賃金を読まない");
  assert.ok(/\.transaction\(cur => \{/.test(body), "試行回数はトランザクションで数える");
  assert.ok(/readVal\(`staffPageTokens\/\$\{token\}`\)/.test(body) && /isDemoShop\(shopId\)/.test(body) && /isPageTokenCF\(token\)/.test(body));
  const pu = src.slice(src.indexOf("exports.purgeInactiveShops"), src.indexOf("exports.purgeOldPeriods"));
  ["staffPageTokens", "staffPageData", "staffPagePins"].forEach(k => assert.ok(pu.includes("await db.ref(`" + k + "/${t}`).remove()"), k));
  // クライアントは staffPagePins に触らない（CF を呼ぶだけ）
  const my = fs.readFileSync(path.join(ROOT, "app-my.js"), "utf8");
  assert.ok(!/staffPagePins/.test(my.replace(/\/\/[^\n]*/g, "")), "クライアントは暗証番号の置き場を読み書きしない");
  assert.ok(/myCallCF\("myPagePin",\{token,action:"status"\}\)/.test(my));
});

test("カレンダーへ取り込む前の確認（2026-10-04・端末とブラウザごと）", () => {
  const UA = {
    iosSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1",
    // ホーム画面から開いた状態の UA は Safari のタブと同じ（iOS 27 のシミュレーターで実測）
    iosStandalone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1",
    ipad: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
    iosChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1",
    iosLine: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.16.0",
    androidLine: "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.86 Mobile Safari/537.36 Line/14.16.0/IAB",
    iosInstagram: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.25.104 (iPhone15,2; iOS 18_7; ja_JP; ja; scale=3.00; 1179x2556; 642155385)",
    androidInstagram: "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.86 Mobile Safari/537.36 Instagram 350.0.0.25.104 Android",
    iosFacebook: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0.0.40.104;FBBV/650000000;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/18.7;FBSS/3;FBID/phone;FBLC/ja_JP;FBOP/5]",
    iosWebView: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
    androidWebView: "Mozilla/5.0 (Linux; Android 10; K; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.0.0 Mobile Safari/537.36",
    androidChrome: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
    winChrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    macSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
    winEdge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
    macFirefox: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:131.0) Gecko/20100101 Firefox/131.0",
    linux: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  };
  const env = (k, o) => m.myCalendarEnvOf({ ua: UA[k], maxTouchPoints: /ipad|ios/i.test(k) ? 5 : 0, ...(o || {}) });
  const p = (k, action, o, eo) => m.myCalendarPromptOf(env(k, eo), action, o);
  // 判定の素
  assert.deepStrictEqual(m.myInAppBrowserOf(UA.iosLine), { id: "line", name: "LINE" });
  assert.deepStrictEqual(m.myInAppBrowserOf(UA.androidLine), { id: "line", name: "LINE" });
  assert.strictEqual(m.myInAppBrowserOf(UA.iosInstagram).id, "instagram");
  assert.strictEqual(m.myInAppBrowserOf(UA.androidInstagram).id, "instagram");
  assert.strictEqual(m.myInAppBrowserOf(UA.iosFacebook).id, "facebook");
  assert.strictEqual(m.myInAppBrowserOf(UA.iosWebView).id, "webview");
  assert.strictEqual(m.myInAppBrowserOf(UA.androidWebView).id, "webview");
  for (const k of ["iosSafari", "iosStandalone", "ipad", "iosChrome", "androidChrome", "winChrome", "macSafari", "winEdge", "macFirefox", "linux"]) {
    assert.strictEqual(m.myInAppBrowserOf(UA[k]), null, k + " はアプリの中ではない");
  }
  assert.strictEqual(m.myInAppBrowserOf("Mozilla/5.0 (X11; Linux x86_64) Gecko Firefox/131.0"), null, "Linux を Line と取り違えない");
  assert.strictEqual(m.myInAppBrowserOf(undefined), null);
  assert.strictEqual(env("iosChrome").iosOther, true);
  assert.strictEqual(env("iosSafari").iosOther, false);
  // .ics: iOS の Safari はタブでもホーム画面から開いた状態でも出さない（シミュレーターで取り込みの画面がそのまま出た）
  assert.strictEqual(p("iosSafari", "ics"), null);
  assert.strictEqual(p("iosStandalone", "ics", {}, { standalone: true }), null, "ホーム画面への追加は取り込みに不要なので促さない");
  assert.strictEqual(p("ipad", "ics"), null);
  // iOS の Safari 以外のブラウザ: 任意（覚えられる）
  const ic = p("iosChrome", "ics");
  assert.ok(ic && ic.kind === "iosOther" && ic.required === false && /Safari/.test(ic.lead) && !ic.openLabel);
  // アプリの中のブラウザ: 必須・LINE だけ外部ブラウザのボタン
  const il = p("iosLine", "ics");
  assert.ok(il.kind === "inApp" && il.required && il.openLabel === "Safariで開く" && /LINE/.test(il.title) && il.steps.length === 2);
  const al = p("androidLine", "ics");
  assert.ok(al.kind === "inApp" && al.required && al.openLabel === "Chromeで開く" && /Chrome/.test(al.lead));
  for (const k of ["iosInstagram", "androidInstagram", "iosFacebook", "iosWebView", "androidWebView"]) {
    const x = p(k, "ics");
    assert.ok(x.kind === "inApp" && x.required && x.openLabel === null && /URL をコピー/.test(x.steps[0]), k);
  }
  assert.ok(p("iosWebView", "ics").title === "アプリの中で開いています");
  // メールのアカウント（#/me）は開いたブラウザでログインし直す1行を足す（個別URLは足さない）
  assert.strictEqual(p("iosLine", "ics", { needsLogin: true }).steps.length, 3);
  assert.ok(/ログイン/.test(p("iosLine", "ics", { needsLogin: true }).steps[2]));
  // Android の Chrome・PC: ダウンロード後に開く（任意）
  const ac = p("androidChrome", "ics");
  assert.ok(ac.kind === "downloadThenOpen" && !ac.required && ac.steps.length === 3 && /Google カレンダーのアプリは \.ics を開けません/.test(ac.steps[2]));
  for (const k of ["winChrome", "macSafari", "winEdge", "macFirefox", "linux"]) {
    const x = p(k, "ics");
    assert.ok(x.kind === "downloadThenOpen" && !x.required && x.steps.length === 3 && /インポート \/ エクスポート/.test(x.steps[2]), k);
  }
  // 確認の文言が、外した「Google カレンダーに追加」を案内しない（2026-10-05）
  for (const k of Object.keys(UA)) for (const nl of [false, true]) {
    const x = p(k, "ics", { needsLogin: nl });
    if (x) assert.ok(!/Google カレンダーに追加/.test([x.title, x.lead, ...x.steps].join("")), k);
  }
  for (const v of Object.values(m.MY_ICS_HINTS)) assert.ok(!/Google カレンダーに追加/.test(v));
  for (const v of Object.values(m.MY_ICS_APP_GUIDE.steps).flat()) assert.ok(!/Google カレンダーに追加/.test(v));
  // 「次から表示しない」: 任意のものだけ覚える。必須は覚えていても出す
  assert.strictEqual(m.myCalendarPromptKey("ics", ac), "ics:downloadThenOpen");
  assert.strictEqual(m.myCalendarPromptShown(ac, "ics", {}), true);
  assert.strictEqual(m.myCalendarPromptShown(ac, "ics", { "ics:downloadThenOpen": true }), false);
  assert.strictEqual(m.myCalendarPromptShown(il, "ics", { "ics:inApp": true }), true, "必須は覚えていても出す");
  assert.strictEqual(m.myCalendarPromptShown(null, "ics", {}), false);
  assert.strictEqual(m.myCalendarPromptShown(ac, "ics", null), true);
  // 手順は3つまで・文言に絵文字を使わない
  for (const k of Object.keys(UA)) for (const a of ["ics"]) for (const nl of [false, true]) {
    const x = p(k, a, { needsLogin: nl });
    if (!x) continue;
    assert.ok(x.steps.length <= 3, `${k} ${a} 手順は3つまで`);
    assert.ok(![x.title, x.lead, ...x.steps].join("").match(/\p{Extended_Pictographic}/u), "絵文字なし");
  }
  // LINE の外部ブラウザで開く URL: ハッシュとほかのクエリを保つ・二重に付けない
  assert.strictEqual(m.myExternalBrowserUrl("https://shiftyshifty.app/#/m/abcDEF123"), "https://shiftyshifty.app/?openExternalBrowser=1#/m/abcDEF123");
  assert.strictEqual(m.myExternalBrowserUrl("https://shiftyshifty.app/?openExternalBrowser=1#/me"), "https://shiftyshifty.app/?openExternalBrowser=1#/me");
  assert.strictEqual(m.myExternalBrowserUrl("https://shiftyshifty.app/?plan=premium#/m/x"), "https://shiftyshifty.app/?plan=premium&openExternalBrowser=1#/m/x");
  assert.strictEqual(m.myExternalBrowserUrl("blob:https://x/1"), "");
  assert.strictEqual(m.myExternalBrowserUrl("javascript:alert(1)"), "");
  assert.strictEqual(m.myExternalBrowserUrl(""), "");
  // ホーム画面から開いた iOS の書き出し後の1文（促すのではなく、出ないときの逃げ道）
  assert.ok(/ホーム画面/.test(m.MY_ICS_STANDALONE_NOTE) && /Safari/.test(m.MY_ICS_STANDALONE_NOTE));
  // 入口: .ics の書き出しが確認を通る
  const myjs = fs.readFileSync(path.join(ROOT, "app-my.js"), "utf8");
  assert.ok(/withCalPrompt\("ics",writeIcs\)/.test(myjs), ".ics の書き出しは確認を通る");
});

// ===== メール確認つきの新規登録（2026-10-04）=====
test("メール確認つきの登録: 戻り先の URL・開いた URL の判定・後始末の URL・覚えておく記録・パスワード・切り替えるエラー", () => {
  const loc = { origin: "https://shiftyshifty.app", pathname: "/" };
  assert.strictEqual(m.emailLinkContinueUrl(loc, { kind: "staff", hash: "#/s/abc_12" }), "https://shiftyshifty.app/?elk=staff&elh=%23%2Fs%2Fabc_12");
  assert.strictEqual(m.emailLinkContinueUrl(loc, { kind: "admin", hash: "#/s/abc" }), "https://shiftyshifty.app/?elk=admin", "管理者はハッシュを持たない");
  assert.strictEqual(m.emailLinkContinueUrl(loc, { kind: "x" }), "https://shiftyshifty.app/?elk=admin");
  assert.ok(!/@|%40/.test(m.emailLinkContinueUrl(loc, { kind: "staff", hash: "#/me", email: "a@b.c" })), "メールアドレスは URL に載せない");
  ["javascript:alert(1)", "#/../x", "https://evil.example/", "#/" + "a".repeat(200), "#me"].forEach(h => assert.strictEqual(m.emailLinkSafeHash(h), "", h));
  ["#/s/t1", "#/me", "#/m/AAAA"].forEach(h => assert.strictEqual(m.emailLinkSafeHash(h), h));
  const land = "https://shiftyshifty.app/?elk=staff&elh=%23%2Fs%2Ft1&apiKey=k&oobCode=OOB&mode=signIn&lang=ja";
  assert.deepStrictEqual(m.parseEmailLinkLanding(land), { kind: "staff", hash: "#/s/t1", hasCode: true });
  assert.deepStrictEqual(m.parseEmailLinkLanding("https://shiftyshifty.app/?elk=admin"), { kind: "admin", hash: "", hasCode: false });
  // 2026-10-05: elk の無いメールリンク（mode=signIn と oobCode がある）も続きの登録。送った記録の kind、無ければスタッフ
  assert.deepStrictEqual(m.parseEmailLinkLanding("https://shiftyshifty.app/?oobCode=1&mode=signIn"), { kind: "staff", hash: "", hasCode: true });
  assert.deepStrictEqual(m.parseEmailLinkLanding("https://shiftyshifty.app/?oobCode=1&mode=signIn", { pendingKind: "admin" }), { kind: "admin", hash: "", hasCode: true });
  assert.strictEqual(m.parseEmailLinkLanding("https://shiftyshifty.app/?oobCode=1&mode=resetPassword"), null, "パスワード再設定のリンクは続きの登録ではない");
  assert.strictEqual(m.parseEmailLinkLanding("https://shiftyshifty.app/#/s/t1"), null);
  assert.strictEqual(m.parseEmailLinkLanding("not a url"), null);
  assert.strictEqual(m.emailLinkCleanUrl(land, "#/s/t1"), "https://shiftyshifty.app/#/s/t1", "oobCode を落とす");
  assert.strictEqual(m.emailLinkCleanUrl(land, ""), "https://shiftyshifty.app/");
  const rec = m.emailLinkPendingRecord(" a@b.jp ", "admin", 1000, "S1");
  assert.deepStrictEqual(rec, { email: "a@b.jp", kind: "admin", at: 1000, linkShopId: "S1" });
  assert.strictEqual(m.emailLinkPendingFor(rec, "admin", 2000), rec);
  assert.strictEqual(m.emailLinkPendingFor(rec, "staff", 2000), null, "別の登録の記録は使わない");
  assert.strictEqual(m.emailLinkPendingFor(rec, "admin", 1000 + m.EMAIL_LINK_PENDING_MAX_MS + 1), null, "古い記録は使わない");
  assert.strictEqual(m.validateEmailLinkPassword("staff", "1234567", "1234567"), `パスワードは${m.MY_PASSWORD_MIN}文字以上にしてください`);
  assert.strictEqual(m.validateEmailLinkPassword("admin", "123456", "123456"), null, "管理者は従来どおり6文字以上");
  assert.ok(m.validateEmailLinkPassword("admin", "123456", "123457"));
  ["auth/operation-not-allowed", "auth/unauthorized-continue-uri", "auth/invalid-continue-uri", "auth/unauthorized-domain"].forEach(c => assert.ok(m.isEmailLinkFallbackError({ code: c }), c));
  ["auth/invalid-email", "auth/too-many-requests", "auth/network-request-failed"].forEach(c => assert.ok(!m.isEmailLinkFallbackError({ code: c }), c));
  assert.ok(/期限切れ/.test(m.emailLinkErrorMessage({ code: "auth/invalid-action-code" }, "finish")) && /期限切れ/.test(m.emailLinkErrorMessage({ code: "auth/expired-action-code" }, "finish")));
  assert.ok(/送ったアドレスと違います/.test(m.emailLinkErrorMessage({ code: "auth/invalid-email" }, "finish")));
  assert.ok(/形式/.test(m.emailLinkErrorMessage({ code: "auth/invalid-email" }, "send")));
});
test("メール確認つきの登録: 新規登録の3つの入口が同じ部品を通り、確認なしに作るのは送れないとき（従来の欄）だけ（ドリフト検出）", () => {
  const my = fs.readFileSync(path.join(ROOT, "app-my.js"), "utf8");
  const main = fs.readFileSync(path.join(ROOT, "app-main.js"), "utf8");
  const co = fs.readFileSync(path.join(ROOT, "app-company.js"), "utf8");
  const auth = my.slice(my.indexOf("function MyAuthScreen("), my.indexOf("function MyAccountShiftPager("));
  assert.ok(/mode==="register"&&!classic\?<EmailLinkSendBox kind="staff"/.test(auth), "マイシフトの新規登録");
  assert.ok(/emailMode==="register"&&!regClassic\?<EmailLinkSendBox kind="admin"/.test(main), "ログイン画面の新規登録");
  assert.ok(/acctEmailMode==="register"&&!acctRegClassic\?<EmailLinkSendBox kind="admin" linkShopId=\{shopId\}/.test(co), "設定タブのアカウント連携の新規登録");
  assert.ok(/if\(emailLanding\) return <EmailLinkFinishScreen landing=\{emailLanding\}\/>;/.test(main), "リンクを開いたら続きの登録");
  // 送信は sendSignInLinkToEmail だけ・切り替えは isEmailLinkFallbackError のときだけ（onFallback）
  const send = my.slice(my.indexOf("async function sendEmailLinkRegister("), my.indexOf("function EmailLinkSendBox("));
  assert.ok(/sendSignInLinkToEmail\(/.test(send) && /isEmailLinkFallbackError\(e\)\)return\{fallback:true/.test(send) && /handleCodeInApp:true/.test(send));
  const fin = my.slice(my.indexOf("function EmailLinkFinishScreen("), my.indexOf("// ===== 紐付け（第2部 E2）====="));
  assert.ok(/signInWithEmailLink\(/.test(fin) && /updatePassword\(/.test(fin) && /myBlockReason\(null\)/.test(fin) && /window\.location\.replace\(emailLinkCleanUrl\(/.test(fin));
  assert.ok(/accounts\/\$\{user\.uid\}\/shops/.test(fin) && /readStaffProfile\(user\.uid\)/.test(fin), "管理者用とマイシフト用のアカウントを混ぜない");
});

test("マイシフトを開いている間のアドレスバー（2026-10-04）: 開く個別URLの選び方・ハッシュ・起動時の URL で一度だけ決める", () => {
  const T1 = "A".repeat(24), T2 = "B".repeat(24), T3 = "C".repeat(24);
  // 候補は known（開いたもの）が先・made（申請したもの）が後・同じ token は1つ・形の違う token と他店は入れない
  assert.deepStrictEqual(m.myPageOpenCandidates({ S1: { token: T1 }, S2: { token: T3 } }, { S1: { token: T2 } }, "S1"), [T1, T2]);
  assert.deepStrictEqual(m.myPageOpenCandidates({ S1: { token: T1 } }, { S1: { token: T1 } }, "S1"), [T1]);
  assert.deepStrictEqual(m.myPageOpenCandidates({ S1: { token: "bad" } }, null, "S1"), []);
  const staff = ["田中", "佐藤"];
  const ok = { status: "approved", displayName: "田中", name: "田中", approvedAt: "x", requestedAt: "x" };
  // 使えるもの（承認済み・名前がスタッフ一覧にある）だけ。取り消し・承認待ち・名前が消えたものは選ばない
  assert.deepStrictEqual(m.myPickOpenablePage([T1, T2], { [T1]: { ...ok, status: "revoked" }, [T2]: { ...ok, name: "佐藤" } }, staff, "S1"), { token: T2, name: "佐藤" });
  assert.strictEqual(m.myPickOpenablePage([T1], { [T1]: { ...ok, status: "pending" } }, staff, "S1"), null);
  assert.strictEqual(m.myPickOpenablePage([T1], { [T1]: { ...ok, name: "鈴木" } }, staff, "S1"), null);
  assert.deepStrictEqual(m.myPickOpenablePage([T1, T2], { [T1]: ok, [T2]: { ...ok, name: "佐藤" } }, staff, "S1"), { token: T1, name: "田中" });
  // ハッシュ: 個別URL ＞ アカウント ＞ 変えない
  assert.strictEqual(m.myOverlayHashOf({ pageToken: T1, account: true }), "#/m/" + T1);
  assert.strictEqual(m.myOverlayHashOf({ account: true }), "#/me");
  assert.strictEqual(m.myOverlayHashOf({}), null);
  assert.strictEqual(m.buildMyAccountUrl("https://shiftyshifty.app/"), "https://shiftyshifty.app/?openExternalBrowser=1#/me");
  assert.ok(/^このURLは使えなくなりました。お店の管理者から新しいURLを受け取ってください/.test(m.MY_PAGE_STATE_MESSAGES.revoked));
  // App は起動時の URL で一度だけ画面を決める（pushState でハッシュを替えても個別URL・#/me の画面へ描き替わらない）
  const main = fs.readFileSync(path.join(ROOT, "app-main.js"), "utf8");
  const head = main.slice(main.indexOf("function App(){"), main.indexOf("// Phase1: Firebase初期化"));
  assert.ok(/const\[bootRoute\]=useState\(\(\)=>parseUrl\(\)\)/.test(head));
  assert.ok(!/parseUrl\(\)\?\./.test(head), "レンダーのたびに parseUrl() を読まない");
  // 個別URLの設定タブは個別URLを一番下に置き、本人の画面からは変更・再発行できない（入力欄・発行の操作が無い）
  const my = fs.readFileSync(path.join(ROOT, "app-my.js"), "utf8");
  const st = my.slice(my.indexOf("function MyPageSettingsTab("), my.indexOf("// 個別URLの入口。"));
  assert.ok(st.lastIndexOf('data-my-section="page"') > st.lastIndexOf("MyPagePinChange"), "個別URLは一番下");
  assert.ok(/URLの変更はお店の管理者に依頼してください/.test(st) && !/genMyPageToken|planIssueStaffPage|staffPages/.test(st));
});

// ---- ヘルプ先の勤務（2026-10-04 B）: 所属店舗（S1・A店）が公開済みなら、PDF のシフト表どおりのヘルプ勤務を本人のカレンダーと給料に入れる ----
// 田中は S1 所属（両方の店舗で staffHomeShop を S1 と明示）。S2（B店）の 11/5（木）17:00〜23:00 にヘルプ。S2 の期間は**未公開**で、
// 本人は S2 に紐付いていない。休憩は**行き先（S2）の設定** 20:00〜20:30 で引く＝実働 330分・深夜 22:00〜23:00＝60分
const HelpLink = { shops: { S1: "A店", S2: "B店" }, settings: {} };
const helpS2 = (o = {}) => U.otherShopDataOf({ name: "B店", settings: { staffHomeShop: { "田中": "S1" }, breakTimes: { weekday: [{ start: "20:00", end: "20:30" }] } }, staff: ["田中"],
  periods: { q1: { id: "q1", startDate: "2026-11-01", endDate: "2026-11-30", ...(o.publish ? { published: PUB } : {}) } },
  subs: { h1: { id: "h1", periodId: "q1", staffName: "田中", shifts: { "2026-11-05": { status: "work", start: o.start || "17:00", end: "23:00" } } } } });
const HelpSettings = { ...E5Settings, staffHomeShop: { "田中": "S1" } };
const helpDays = (o = {}) => m.myHelperDaysOf({ shopId: "S1", name: "田中", periods: o.periods || E5P, subsByPeriod: e5Subs(o.shifts || E5Shifts), settings: HelpSettings, staff: ["田中"],
  todayStr: "2026-11-10", premium: o.premium !== false, companyLink: HelpLink, otherShops: { S2: helpS2(o) }, overrides: o.overrides }, U);

test("ヘルプ勤務（B）: 所属店舗が公開済みなら、ヘルプ先が未公開・未紐付けでも PDF どおりの勤務（行き先の店の休憩で引いた実働）。未公開・休暇・自店と重なる日は出さない", () => {
  const hd = helpDays();
  assert.strictEqual(hd.role, "home");
  const rows = hd.byDate["2026-11-05"];
  assert.ok(rows && rows.length === 1, JSON.stringify(hd));
  assert.deepStrictEqual({ s: rows[0].shopId, n: rows[0].shopName, st: rows[0].sched.startMin, en: rows[0].sched.endMin, b: rows[0].sched.breakMin, w: rows[0].sched.workMin },
    { s: "S2", n: "B店", st: 1020, en: 1380, b: 30, w: 330 });
  // 実働は管理者画面の合算（helperWorkOn）と同じ
  const shops = U.helperShopsOf(HelpLink, { S2: helpS2() }, "S1");
  const hi = U.helperPersonOf({ shopId: "S1", name: "田中", settings: HelpSettings, people: null, otherShops: shops });
  assert.strictEqual(U.helperWorkOn({ regs: hi.regs, otherShops: shops, date: "2026-11-05", todayStr: "2026-11-10", companySettings: null, ownRange: null })[0].min, 330);
  // 所属店舗の期間が未公開・Premium でないなら出さない
  assert.deepStrictEqual(helpDays({ periods: E5P.map(p => ({ id: p.id, startDate: p.startDate, endDate: p.endDate })) }).byDate, {});
  assert.deepStrictEqual(helpDays({ premium: false }).byDate, {});
  // 自店のその日の勤務と時間が重なれば足さない（二重に数えない）・休暇の日は出さない（PDF と同じ）
  assert.deepStrictEqual(helpDays({ shifts: { ...E5Shifts, "2026-11-05": { status: "work", start: "16:00", end: "18:00" } } }).byDate, {});
  assert.deepStrictEqual(helpDays({ shifts: { ...E5Shifts, "2026-11-05": { status: "work", adminRest: { start: true, end: true }, leaveTypes: { start: "paid", end: "paid" } } } }).byDate, {});
  // 所属店舗が決まらない人（両方とも未設定）は合算しない
  const noHome = m.myHelperDaysOf({ shopId: "S1", name: "田中", periods: E5P, subsByPeriod: e5Subs(E5Shifts), settings: E5Settings, staff: ["田中"], todayStr: "2026-11-10", premium: true,
    companyLink: HelpLink, otherShops: { S2: U.otherShopDataOf({ name: "B店", settings: {}, staff: ["田中"], periods: {}, subs: helpS2() && {} }) } }, U);
  assert.strictEqual(noHome.role, null);
  // 読めない他店があれば unread
  const un = m.myHelperDaysOf({ shopId: "S1", name: "田中", periods: E5P, subsByPeriod: e5Subs(E5Shifts), settings: HelpSettings, staff: ["田中"], todayStr: "2026-11-10", premium: true,
    companyLink: HelpLink, otherShops: { S2: U.otherShopDataOf({ name: "B店", loadFailed: true }) } }, U);
  assert.strictEqual(un.unread, true);
});

test("ヘルプ勤務（B）: カレンダーの entry（公開と同じ扱い・変更ありに入れない）と、ヘルプ先に紐付いていて公開済みなら1つにまとめる", () => {
  const es = m.myHelperShiftEntries(helpDays(), { homeShopName: "A店", colorOf: () => "#123456" });
  assert.strictEqual(es.length, 1);
  assert.deepStrictEqual({ k: es[0].kind, h: es[0].helper, s: es[0].shopId, home: es[0].homeShopId, st: es[0].startMin, w: es[0].workMin, c: es[0].color },
    { k: "published", h: true, s: "S2", home: "S1", st: 1020, w: 330, c: "#123456" });
  assert.strictEqual(m.nextMyShift(es, "2026-11-01").date, "2026-11-05", "次のシフトに出る");
  assert.deepStrictEqual(m.myPublishedFingerprints(es, []), {}, "変更ありの指紋に入れない");
  const own = { kind: "published", shopId: "S2", date: "2026-11-05", startMin: 1020, endMin: 1380 };
  assert.strictEqual(m.myMergeHelperEntries([own], es).length, 1, "ヘルプ先の公開済みのシフトがあれば、そちらだけ");
  assert.strictEqual(m.myMergeHelperEntries([], es).length, 1);
});

// 給料: 所属店舗（A店）の行に入れ、A店の時給で計算する
const helpRow = (pay, o = {}) => {
  const hd = helpDays(o);
  const src = { name: "田中", periods: E5P, subsByPeriod: e5Subs(o.shifts || E5Shifts), settings: HelpSettings, staff: ["田中"], todayStr: "2026-11-10", premium: true,
    overrides: (o.overrides || {}).S1, helperDays: hd.byDate };
  const info = m.myShiftyDayInfo(src, U);
  return m.myPayMonthFor({ payYm: "2026-12", todayStr: "2026-11-10", workplaces: [{ id: "S1", kind: "shifty", name: "A店", pay: m.myPayOf(pay), companyPay: o.companyPay || null,
    shifty: { name: "田中", info, monthSettingsOf: ym => m.myMonthSettingsOf(src, ym, U), wageSettings: o.wageSettings || null, helperUnread: !!o.unread } }] }, U).rows[0];
};
test("ヘルプ勤務（B）: 給料は所属店舗の行・所属店舗の時給。手計算の額と内訳の注記。読めない他店は＋", () => {
  // 11/2 600分（①120）・11/5 ヘルプ 330分（深夜60）・11/20 480分（深夜240）。週40h は超えない
  // 基本 1200×1410/60＝28,200 ／ 時間外 1200×25%×120/60＝600 ／ 深夜 1200×25%×300/60＝1,500 ／ 交通費 500×3＝1,500 → 31,800
  const r = helpRow(P31);
  assert.deepStrictEqual(r.amounts.items, { base: 28200, ot: 600, over60: 0, night: 1500, holiday: 0, allowances: 0, commute: 1500, deduction: 0 });
  assert.strictEqual(r.amounts.total, 31800);
  assert.strictEqual(r.amounts.minutes.workMin, 1410);
  assert.ok(r.notes.some(n => n === "うち他店でのヘルプ 5:30（B店・1日）。この勤務先の賃金で計算しています"), r.notes.join("／"));
  assert.strictEqual(r.partial, false);
  const un = helpRow(P31, { unread: true });
  assert.ok(un.partial && un.notes.some(n => /ヘルプ勤務の一部を読み込めていません/.test(n)));
  assert.strictEqual(m.myPayMonthFor({ payYm: "2026-12", todayStr: "2026-11-10", workplaces: [] }, U).partial, false);
});

test("ヘルプ勤務（B）: 本人がヘルプ先の日に入れた実績（overrides/{ヘルプ先}/{日付}）で計算する。休憩は入れた値。消せば公開の時間", () => {
  // 11/5 を 17:00〜22:00 休憩0 → 300分・深夜0。基本 1200×1380/60＝27,600 ／ 時間外 600 ／ 深夜 1200×25%×240/60＝1,200 ／ 交通費 1,500 → 30,900
  const ov = { S2: { "2026-11-05": { start: "17:00", end: "22:00", breakMin: 0 } } };
  const hd = helpDays({ overrides: ov });
  assert.deepStrictEqual({ w: hd.byDate["2026-11-05"][0].actualDay.workMin, sched: hd.byDate["2026-11-05"][0].sched.workMin }, { w: 300, sched: 330 }, "表示（sched）は公開のまま");
  const r = helpRow(P31, { overrides: ov });
  assert.deepStrictEqual({ b: r.amounts.items.base, n: r.amounts.items.night, t: r.amounts.total }, { b: 27600, n: 1200, t: 30900 });
  assert.ok(r.notes.some(n => n === "あなたが入れた実績の時間で計算した日 1日（11/5）。シフトの表示は公開された時間のままです"), r.notes.join("／"));
  // 休憩を入れない実績の形は無い（breakMin は必須）。ヘルプ先の勤務が無くなった日の実績は使わない
  const gone = helpRow(P31, { overrides: { S2: { "2026-11-06": { start: "17:00", end: "22:00", breakMin: 0 } } } });
  assert.strictEqual(gone.amounts.total, 31800);
  assert.ok(!gone.notes.some(n => /実績の時間で計算/.test(n)));
  // 実績の休憩が無い形（resolveActualDay に breakMin を渡さない）なら、行き先の店の設定で判定し直す
  const shops = U.helperShopsOf(HelpLink, { S2: helpS2() }, "S1");
  const st2 = U.helperShopSettingsOn(shops.S2, "S2", "2026-11-05", "2026-11-10", null, null);
  assert.strictEqual(U.resolveActualDay({ shifts: { "2026-11-05": shops.S2.workMap.get("田中|2026-11-05") } }, { start: "17:30", end: "23:00" }, "2026-11-05", st2, "田中").breakMin, 30);
});

test("ヘルプ勤務（B）: ヘルプ先にも紐付いていれば、所属店舗へ寄せた日をヘルプ先の行から外す（二重に数えない）", () => {
  const hd = helpDays();
  const moved = m.myMovedHelperDates({ S1: hd });
  assert.deepStrictEqual(moved, { S2: ["2026-11-05"] });
  // ヘルプ先 S2 の勤務先（S2 の期間は公開済みとする）
  const P2 = [{ id: "q1", startDate: "2026-11-01", endDate: "2026-11-30", published: PUB }];
  const src2 = { name: "田中", periods: P2, subsByPeriod: { q1: [{ id: "h1", periodId: "q1", staffName: "田中", shifts: { "2026-11-05": { status: "work", start: "17:00", end: "23:00" } } }] },
    settings: { staffHomeShop: { "田中": "S1" }, breakTimes: { weekday: [{ start: "20:00", end: "20:30" }] }, staffAttributes: { "田中": "parttime" } }, staff: ["田中"],
    todayStr: "2026-11-10", premium: true, movedDates: moved.S2 };
  const info2 = m.myShiftyDayInfo(src2, U);
  const row = m.myPayMonthFor({ payYm: "2026-12", todayStr: "2026-11-10", workplaces: [{ id: "S2", kind: "shifty", name: "B店", pay: m.myPayOf(P31), companyPay: null,
    shifty: { name: "田中", info: info2, monthSettingsOf: ym => m.myMonthSettingsOf(src2, ym, U), wageSettings: null, homeShopName: "A店" } }] }, U).rows[0];
  assert.strictEqual(row.amounts.minutes.workMin, 0);
  assert.ok(row.notes.some(n => n === "所属店舗（A店）の給料に入れたヘルプの日 1日（11/5）は、この勤務先には含めていません"), row.notes.join("／"));
  const notMoved = m.myShiftyDayInfo({ ...src2, movedDates: [] }, U);
  assert.strictEqual(m.myPayMonthFor({ payYm: "2026-12", todayStr: "2026-11-10", workplaces: [{ id: "S2", kind: "shifty", name: "B店", pay: m.myPayOf(P31), companyPay: null,
    shifty: { name: "田中", info: notMoved, monthSettingsOf: ym => m.myMonthSettingsOf(src2, ym, U), wageSettings: null } }] }, U).rows[0].amounts.minutes.workMin, 330);
});

test("ヘルプ勤務（B）: 月末締めで月次賃金ページ（monthlyPayBreakdown・ShiftEditTab の premiumDayOf が他店の勤務を helpers に足す形）と同じ金額。実績なし", () => {
  const settings = HelpSettings;
  const ym = "2026-11", st = U.resolvePeriodMaster(E5P[1], ["田中"], settings, "2026-11-20").settings;
  const shops = U.helperShopsOf(HelpLink, { S2: helpS2() }, "S1");
  const hi = U.helperPersonOf({ shopId: "S1", name: "田中", settings: st, people: null, otherShops: shops });
  const inP = d => E5P.some(p => p.startDate <= d && d <= p.endDate);
  const dayOf = d => { const has = inP(d), s = E5Shifts[d];
    const helpers = U.helperActualDaysOn({ regs: hi.regs, otherShops: shops, date: d, todayStr: "2026-11-20", companySettings: null, ownRange: s ? U.effShiftRangeMin(s, st) : null, cache: new Map() });
    const k0 = U.dayRestKindOf(s, has);
    return U.premiumDayInput({ date: d, hasData: has, kind: k0 === "rest" && helpers.length ? "work" : k0, own: U.resolveActualDay({ shifts: s ? { [d]: s } : {} }, null, d, st, "田中"), helpers }); };
  const b = U.premiumMonthOf({ ym, system: U.laborSystemForStaff(st, "田中"), settings: st, dayOf });
  assert.strictEqual(b.workMin, 1410, "ヘルプ先の 330分を含む");
  const times = { workMin: b.workMin, dayOverMin: b.dayOverMin, weekOverMin: b.weekOverMin, monthOverMin: b.monthOverMin, otMin: b.otMin, over60Min: b.over60Min,
    nightMin: b.nightMin, legalHolidayMin: b.legalHolidayMin, absentMin: b.absentMin, scheduledMin: 0 };
  const denomMin = U.rateDenominatorMinOf(U.laborSettingsOf(st));
  [{ payType: "hourly", base: 1234, effectiveFrom: "2026-01-01" }, { payType: "monthly", base: 213500, effectiveFrom: "2026-01-01" }].forEach(pay => {
    const c = U.monthlyPayBreakdown({ pay, ym, times, denomMin, wageSettings: null });
    const r = helpRow({ closingDay: 31, payMonthOffset: 1, payDay: 25, holidayRule: "before" }, { companyPay: pay });
    const it = r.amounts.items;
    assert.deepStrictEqual([it.base, it.ot, it.over60, it.night, it.holiday, it.deduction], [c.wage.basePay, c.wage.otPay, c.wage.over60Pay, c.wage.nightPay, c.wage.holidayPay, c.deduction], pay.payType);
    assert.deepStrictEqual([r.amounts.minutes.workMin, r.amounts.minutes.otMin, r.amounts.minutes.nightMin], [b.workMin, b.otMin, b.nightMin]);
  });
});

test("ヘルプ勤務（B）: 全員のシフト表もヘルプ先の状態に関係なく PDF どおり（ヘルプ先の期間が未公開・ヘルプ先のプランを見ない）", () => {
  const sub = e5Subs(E5Shifts).p1;
  const t = m.buildMyShiftSheet({ period: E5P[1], staff: ["田中"], settings: HelpSettings, subs: sub, todayStr: "2026-11-10", premium: true, me: "田中", shopName: "A店", shopId: "S1",
    helpers: { companyLink: HelpLink, otherShops: { S2: helpS2() } } }, U);
  assert.strictEqual(t.state, "ok");
  assert.ok(/17B/.test(t.html) && /23B|>23</.test(t.html), "ヘルプ先が未公開でも B店 17〜23 が出る");
  const none = m.buildMyShiftSheet({ period: E5P[1], staff: ["田中"], settings: HelpSettings, subs: sub, todayStr: "2026-11-10", premium: true, me: "田中", shopName: "A店", shopId: "S1" }, U);
  assert.ok(!/17B/.test(none.html));
  // 画面の読み込みは所属店舗の公開と Premium だけで決まり、他店の読みに公開・プランの判定は無い
  const my = fs.readFileSync(path.join(ROOT, "app-my.js"), "utf8");
  const rd = my.slice(my.indexOf("function readMyHelperShop("), my.indexOf("function useMyHelperShops("));
  assert.ok(!/plan|published|isPeriodPublished/.test(rd), "他店の読みに公開・プランの判定を入れない");
  const hk = my.slice(my.indexOf("function useMyHelperSources("), my.indexOf("function myRangeOfPeriods("));
  assert.ok(/isPeriodPublished\(p\)\)/.test(hk) && !/accounts\//.test(hk), "公開の判定は所属店舗の期間だけ・他店のプランは読まない");
});

test("URLをなくしたとき用のメールアドレス（C）: 形・伏せ方・回数・後継・登録と送り直しの計画（functions/my-page.js）", () => {
  const P = require("../functions/my-page.js");
  assert.strictEqual(P.normalizePageEmailCF("  A@B.Co "), "a@b.co");
  assert.ok(P.isPageEmailCF("a@b.co") && !P.isPageEmailCF("a@b") && !P.isPageEmailCF("a@b.co\r\nBcc: x@y.z") && !P.isPageEmailCF("a b@c.d") && !P.isPageEmailCF("x".repeat(250) + "@b.co"));
  assert.strictEqual(P.maskPageEmailCF("tanaka@example.com"), "t***@example.com");
  assert.strictEqual(P.pageUrlCF("https://shiftyshifty.app/", "A".repeat(24)), "https://shiftyshifty.app/?openExternalBrowser=1#/m/" + "A".repeat(24));
  // 回数: 窓の中は max まで・窓が過ぎたら数え直す
  let rr = null; const now = 1e12;
  for (let i = 0; i < 3; i++) { const st = P.pageEmailRateStepCF(rr, now + i, 3, 3600000); assert.ok(st.ok); rr = st.rec; }
  assert.strictEqual(P.pageEmailRateStepCF(rr, now + 10, 3, 3600000).ok, false);
  assert.ok(P.pageEmailRateStepCF(rr, now + 3600000, 3, 3600000).ok);
  // 後継: 取り消された URL は同じ名前の承認済み（名前がスタッフ一覧にある）へ。後継が無ければ null
  const T = "A".repeat(24), N = "N".repeat(24), X = "X".repeat(24);
  const pages = { [T]: { status: "revoked", name: "田中" }, [N]: { status: "approved", name: "田中", approvedAt: "b" }, [X]: { status: "revoked", name: "退職" } };
  assert.strictEqual(P.pageEmailCurrentTokenCF(T, pages, ["田中"]), N);
  assert.strictEqual(P.pageEmailCurrentTokenCF(N, pages, ["田中"]), N);
  assert.strictEqual(P.pageEmailCurrentTokenCF(X, pages, ["田中"]), null);
  assert.strictEqual(P.pageEmailCurrentTokenCF(T, pages, ["佐藤"]), null, "名前が消えていれば送らない");
  // 登録: 状態は伏せたアドレスだけ・登録は記録と逆引きと控えのメール・変更で前の逆引きを消す・削除
  const acc = { shopId: "S1", name: "田中" }, key = "a".repeat(64), key2 = "b".repeat(64);
  let r = P.planSetPageEmailCF({ action: "set", token: N, access: acc, pages, email: " Tanaka@Example.com", emailKey: key, nowIso: "t", base: "https://shiftyshifty.app", shopName: "A店" });
  assert.deepStrictEqual(r.result, { ok: true, registered: true, masked: "t***@example.com", sent: true });
  assert.deepStrictEqual(r.writes, { [`staffPageEmails/${N}`]: { email: "tanaka@example.com", key, setAt: "t", sentAt: "t" }, [`staffPageEmailIndex/${key}/${N}`]: true });
  assert.ok(r.mail.to === "tanaka@example.com" && r.mail.text.includes("#/m/" + N) && r.mail.text.includes("A店"));
  const cur = { email: "tanaka@example.com", key, setAt: "t" };
  r = P.planSetPageEmailCF({ action: "set", token: N, access: acc, pages, emailRec: cur, email: "new@example.com", emailKey: key2, nowIso: "t2" });
  assert.strictEqual(r.writes[`staffPageEmailIndex/${key}/${N}`], null);
  r = P.planSetPageEmailCF({ action: "status", token: N, access: acc, pages, emailRec: cur });
  assert.deepStrictEqual(r.result, { ok: true, registered: true, masked: "t***@example.com" });
  assert.ok(!JSON.stringify(r.result).includes("tanaka@"), "生のアドレスを返さない");
  r = P.planSetPageEmailCF({ action: "remove", token: N, access: acc, pages, emailRec: cur });
  assert.deepStrictEqual(r.writes, { [`staffPageEmails/${N}`]: null, [`staffPageEmailIndex/${key}/${N}`]: null });
  // 発行し直した URL の状態で、前の URL の登録を引き継ぐ
  r = P.planSetPageEmailCF({ action: "status", token: N, access: acc, pages, emailRec: null, prevEmailRecs: { [T]: cur } });
  assert.ok(r.result.registered && r.writes[`staffPageEmails/${N}`] && r.writes[`staffPageEmails/${T}`] === null && r.writes[`staffPageEmailIndex/${key}/${N}`] === true);
  assert.ok(P.planSetPageEmailCF({ action: "set", token: N, access: { error: { code: "permission-denied", msg: "x" } } }).error);
  assert.ok(P.planSetPageEmailCF({ action: "set", token: N, access: acc, email: "bad", emailKey: key }).error);
  // 送り直し: 結果は登録の有無に関係なく同じ。送るのは記録のアドレスが一致し、いま使える URL だけ（再発行は新しい URL）
  const base = { email: "tanaka@example.com", emailKey: key, tokenShops: { [T]: "S1" }, pagesByShop: { S1: pages }, staffByShop: { S1: ["田中"] }, shopNames: { S1: "A店" }, base: "https://shiftyshifty.app" };
  r = P.planRecoverPageUrlCF({ ...base, index: { [T]: true }, emailRecs: { [T]: cur } });
  const none = P.planRecoverPageUrlCF({ ...base, index: {}, emailRecs: {} });
  assert.deepStrictEqual(r.result, none.result);
  assert.ok(r.mail && r.mail.text.includes("#/m/" + N) && !r.mail.text.includes("#/m/" + T) && !none.mail);
  assert.ok(!JSON.stringify(r.result).includes("#/m/"), "戻り値に URL を出さない");
  assert.ok(!P.planRecoverPageUrlCF({ ...base, email: "other@example.com", index: { [T]: true }, emailRecs: { [T]: cur } }).mail, "記録と違うアドレスには送らない");
});

test("URLをなくしたとき用のメールアドレス（C）: ルールは CF 専用・クライアントはもう呼ばない（2026-10-08 アカウントに一本化）・入口はゲートの下・index.js の配線は残す", () => {
  const rules = JSON.parse(fs.readFileSync(path.join(ROOT, "database.rules.json"), "utf8")).rules;
  ["staffPageEmails", "staffPageEmailIndex", "staffPageEmailRate"].forEach(k => assert.deepStrictEqual(rules[k], { ".read": false, ".write": false }, k));
  const my = fs.readFileSync(path.join(ROOT, "app-my.js"), "utf8");
  assert.ok(!/staffPageEmail/.test(my), "クライアントはアドレスの置き場を読み書きしない");
  // 2026-10-08: URLをなくしたときはマイシフトのアカウントへ誘導する。クライアントは setPageEmail・recoverPageUrl を呼ばない（CF は残す）
  const src = ["app-utils.js", "app-my-utils.js", "app-core.js", "app-staff.js", "app-admin.js", "app-shift.js", "app-company.js", "app-my.js", "app-main.js"]
    .map(f => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n");
  assert.ok(!/myCallCF\("(setPageEmail|recoverPageUrl)"/.test(src) && !/MyPageEmailBox/.test(src), "クライアントから呼ばない");
  const st = my.slice(my.indexOf("function MyPageSettingsTab("), my.indexOf("// 個別URLの入口。"));
  assert.ok(st.indexOf("<MyPageAccountLinkBox") >= 0 && st.indexOf("<MyPageLostNote/>") > st.indexOf("<MyPageAccountLinkBox"), "なくしたときの案内はアカウントに追加の下");
  const rb = my.slice(my.indexOf("function MyPageRecoverBox("), my.indexOf("function MyPageRecoverScreen("));
  assert.ok(/myOpenAccountScreen/.test(rb) && /URLの再発行を頼んでください/.test(rb) && !/<input|MyField/.test(rb), "送り直しの入力は無く、#/me への案内とボタン");
  const main = fs.readFileSync(path.join(ROOT, "app-main.js"), "utf8");
  assert.ok(/onOpenPageRecover=\{MY_SCREEN_ENABLED&&urlLocked&&!DEMO_MODE\?/.test(main));
  const idx = fs.readFileSync(path.join(ROOT, "functions", "index.js"), "utf8");
  assert.ok(/exports\.setPageEmail = functions/.test(idx) && /exports\.recoverPageUrl = functions/.test(idx));
  assert.ok(/const PAGE_EMAIL_BASE = process\.env\.APP_URL \|\| "https:\/\/shiftyshifty\.app"/.test(idx), "URL はサーバーの環境で決める（呼び出し元から受け取らない）");
  const rec = idx.slice(idx.indexOf("exports.recoverPageUrl"), idx.indexOf("});", idx.indexOf("exports.recoverPageUrl")));
  assert.ok(rec.indexOf('pageEmailRate("recoverEmail"') < rec.indexOf("staffPageEmailIndex/"), "回数は登録の有無を読む前に数える");
  const pu = idx.slice(idx.indexOf("exports.purgeInactiveShops"));
  assert.ok(/staffPageEmails\/\$\{t\}/.test(pu) && /staffPageEmailIndex\/\$\{er\.key\}\/\$\{t\}/.test(pu), "アーカイブで後始末");
});

// ===== 2026-10-05 のユーザー指示 =====
test("全員のシフトのヘルプ先（2026-10-05）: 同じ人の他店の登録をヘルプ先にし、公開済みか確定済みの期間を選択肢にする・既定は自分の店舗", () => {
  const conf = { at: "2026-09-20T00:00:00.000Z", byUid: "O" }, pub = { at: "2026-09-10T00:00:00.000Z", byUid: "O" };
  const link = { id: "co1", shops: { A: "A店", B: "B店", C: "C店" }, people: { "123": { A: "田中", B: "田中太郎" } }, shopEntities: { A: "e1", B: "e1", C: "e2" }, entityId: "e1" };
  const others = {
    B: U.otherShopDataOf({ name: "B店", settings: {}, staff: ["田中太郎", "佐藤"], periods: {} }),
    C: U.otherShopDataOf({ name: "C店", settings: {}, staff: ["田中"], periods: {} }),
  };
  // 人物で束ねた B（登録名は違ってよい）。C は別の法人なので出さない
  assert.deepStrictEqual(m.myHelpDestRegs({ shopId: "A", name: "田中", settings: {}, companyLink: link, otherShops: others }, U).map(r => [r.shopId, r.name]), [["B", "田中太郎"]]);
  // 企業に連携していない・読めなかった店舗は出さない
  assert.deepStrictEqual(m.myHelpDestRegs({ shopId: "A", name: "田中", settings: {}, companyLink: null, otherShops: others }, U), []);
  assert.deepStrictEqual(m.myHelpDestRegs({ shopId: "A", name: "田中", settings: {}, companyLink: link, otherShops: { B: U.otherShopDataOf({ name: "B店", loadFailed: true }) } }, U), []);
  // 期間: 公開済みか確定済みで直近3ヶ月だけ（2026-10-05 同日の追加指示で公開だけの期間も出す。未公開は出さない）
  const ps = [
    { id: "b1", startDate: "2026-10-01", endDate: "2026-10-15", published: pub },                       // 公開だけ
    { id: "b2", startDate: "2026-09-16", endDate: "2026-09-30", confirmation: conf },                   // 確定（公開の記録なし）
    { id: "b3", startDate: "2026-09-01", endDate: "2026-09-15", confirmation: conf, published: pub },
    { id: "b4", startDate: "2026-06-01", endDate: "2026-06-15", confirmation: conf },                   // 窓の外
    { id: "b5", startDate: "2026-10-16", endDate: "2026-10-31" },                                       // 未公開
  ];
  assert.deepStrictEqual(m.myHelpDestPeriodOptions(ps, { premium: true, todayStr: "2026-10-04" }, U).map(p => p.id), ["b1", "b2", "b3"]);
  assert.deepStrictEqual(m.myHelpDestPeriodOptions(ps, { premium: false, todayStr: "2026-10-04" }, U), []);
  // 店舗の選択肢: ヘルプ先は確定の期間だけ。既定はヘルプ先の期間が新しくても自分の店舗
  const A = { shopId: "A", shopName: "A店", name: "田中", plan: "premium", periods: [{ id: "a1", startDate: "2026-09-01", endDate: "2026-09-15", published: pub }] };
  const B = { shopId: "B", shopName: "B店", name: "田中太郎", plan: "premium", periods: ps, helpDest: true };
  const c = m.myAllShiftChoices({ shops: [A, B], todayStr: "2026-10-04" }, U);
  assert.deepStrictEqual(c.shops.map(s => [s.shopId, s.helpDest, s.options.map(p => p.id)]), [["A", false, ["a1"]], ["B", true, ["b1", "b2", "b3"]]]);
  assert.strictEqual(c.defaultShopId, "A");
  // ヘルプ先しか無ければヘルプ先が既定。自分の店舗と同じ店舗がヘルプ先として来ても重ねない
  assert.strictEqual(m.myAllShiftChoices({ shops: [B], todayStr: "2026-10-04" }, U).defaultShopId, "B");
  assert.strictEqual(m.myAllShiftChoices({ shops: [A, { ...A, helpDest: true }], todayStr: "2026-10-04" }, U).shops.length, 1);
  // 表: ヘルプ先は確定済みなら公開の記録が無くても出す・公開だけでも出す（日付は公開した日）・未公開は出さない。日付は確定済みなら確定した日
  const sheet = p => m.buildMyShiftSheet({ period: p, staff: ["田中太郎"], settings: {}, subs: [], premium: true, todayStr: "2026-10-04", me: "田中太郎", shopName: "B店", shopId: "B", helpDest: true }, U);
  assert.strictEqual(sheet(ps[1]).state, "ok");
  assert.strictEqual(sheet(ps[1]).shownAt, conf.at);
  assert.strictEqual(sheet(ps[0]).state, "ok");
  assert.strictEqual(sheet(ps[0]).shownAt, pub.at);
  assert.strictEqual(sheet(ps[4]).state, "unpublished");
  // 自分の店舗は従来どおり公開済みから（日付は公開した日・確定済みなら確定した日）
  assert.strictEqual(m.buildMyShiftSheet({ period: ps[0], staff: ["田中"], settings: {}, subs: [], premium: true, todayStr: "2026-10-04", shopId: "A" }, U).shownAt, pub.at);
  assert.strictEqual(m.buildMyShiftSheet({ period: ps[2], staff: ["田中"], settings: {}, subs: [], premium: true, todayStr: "2026-10-04", shopId: "A" }, U).shownAt, conf.at);
  // 画面: ヘルプ先は「（ヘルプ先）」の印・提出は選んだ期間だけを部分読み（読み込みは書き込みなし）
  const my = fs.readFileSync(path.join(ROOT, "app-my.js"), "utf8");
  assert.ok(/shop\.helpDest\?"（ヘルプ先）":""/.test(my));
  const hk = my.slice(my.indexOf("function useMyHelpDestShops("), my.indexOf("function MyAllShiftTable("));
  assert.ok(/myHelpDestRegs\(/.test(hk) && /readMyPeriodSubs\(sid,pid\)/.test(hk) && !/\/subs`\)\.once/.test(hk));
  assert.ok(!/\.(update|remove|push|transaction)\(|fbSet\(|fbUpd\(/.test(hk), "ヘルプ先の読み込みは何も書かない");
});
test("全員のシフトを1画面に縦に並べる（2026-10-05）: 所属店舗の下に同じ期間のヘルプ先（公開済みか確定済み）と別の店舗", () => {
  const pub = { at: "2026-10-01T00:00:00.000Z", byUid: "O" }, conf = { at: "2026-10-02T00:00:00.000Z", byUid: "O" };
  const A = { shopId: "A", shopName: "A店", name: "田中", plan: "premium", periods: [
    { id: "a1", startDate: "2026-10-01", endDate: "2026-10-15", published: pub },
    { id: "a0", startDate: "2026-09-16", endDate: "2026-09-30", published: pub }] };
  // A のヘルプ先 H（半月）。h1 は公開だけ＝出す（2026-10-05 同日の追加指示）、h2 は未公開＝出さない
  const H = { shopId: "H", shopName: "H店", name: "田中太郎", plan: "premium", helpDest: true, baseShopId: "A", periods: [
    { id: "h1", startDate: "2026-10-01", endDate: "2026-10-15", published: pub },
    { id: "h2", startDate: "2026-10-01", endDate: "2026-10-15" },
    { id: "h0", startDate: "2026-09-16", endDate: "2026-09-30", confirmation: conf }] };
  // 別の店舗 B（期間の切り方が違う＝1か月）と、B のヘルプ先 BH。X は重なる期間が無い
  const B = { shopId: "B", shopName: "B店", name: "田中", plan: "premium", periods: [{ id: "b1", startDate: "2026-10-01", endDate: "2026-10-31", published: pub }] };
  const BH = { shopId: "BH", shopName: "BH店", name: "田中", plan: "premium", helpDest: true, baseShopId: "B", periods: [
    { id: "bh2", startDate: "2026-10-16", endDate: "2026-10-31", confirmation: conf },
    { id: "bh1", startDate: "2026-10-01", endDate: "2026-10-15", confirmation: conf }] };
  const X = { shopId: "X", shopName: "X店", name: "田中", plan: "premium", periods: [{ id: "x1", startDate: "2026-11-01", endDate: "2026-11-15", published: pub }] };
  const c = m.myAllShiftChoices({ shops: [A, B, X, BH, H], todayStr: "2026-10-05" }, U);
  const st = m.myAllShiftStack(c, {});
  assert.strictEqual(st.primary.shopId, "A");
  assert.strictEqual(st.period.id, "a1", "既定は今日を含む期間");
  assert.deepStrictEqual(st.blocks.map(b => [b.shop.shopId, b.period.id, b.primary]),
    [["A", "a1", true], ["H", "h1", false], ["B", "b1", false], ["BH", "bh1", false]],
    "所属店舗 → そのヘルプ先 → 別の店舗 → そのヘルプ先。未公開のヘルプ先の期間・重ならない店舗（X）は出さない");
  // 前の期間を選ぶと、同じ期間（重なる期間）に替わる。B は重ならないので出ない
  assert.deepStrictEqual(m.myAllShiftStack(c, { periodId: "a0" }).blocks.map(b => [b.shop.shopId, b.period.id]), [["A", "a0"], ["H", "h0"]]);
  // 選んだ期間が消えたら既定へ
  assert.strictEqual(m.myAllShiftStack(c, { periodId: "gone" }).period.id, "a1");
  // 先頭が1か月の期間なら、半月の店舗は重なる期間をすべて開始の順に出す
  const c2 = m.myAllShiftChoices({ shops: [B, BH], todayStr: "2026-10-05" }, U);
  assert.deepStrictEqual(m.myAllShiftStack(c2, {}).blocks.map(b => b.period.id), ["b1", "bh1", "bh2"]);
  // 選択肢が無ければ null
  assert.strictEqual(m.myAllShiftStack(m.myAllShiftChoices({ shops: [], todayStr: "2026-10-05" }, U), {}), null);
  // この端末で開いた個別URLの別の店舗（いま開いている店舗は除く・開けたもの→作ったものの順）
  const T1 = "AbCdEfGhIjKlMnOpQrStUvWx", T2 = "ZyXwVuTsRqPoNmLkJiHgFeDc";
  assert.deepStrictEqual(m.myKnownPageShops({ A: { token: T1 }, B: { token: T1 } }, { B: { token: T2 }, C: { token: "bad" } }, "A"),
    [{ shopId: "B", tokens: [T1, T2] }]);
  assert.deepStrictEqual(m.myKnownPageShops(null, null, "A"), []);
  // 画面: 別の店舗の読み込みは書き込みなし・承認済みの個別URLだけ
  const my = fs.readFileSync(path.join(ROOT, "app-my.js"), "utf8");
  const kh = my.slice(my.indexOf("function useMyKnownPageShops("), my.indexOf("function useMyPeriodSubsLoader("));
  assert.ok(/resolveMyPage\(/.test(kh) && /pg\.state!=="ok"/.test(kh));
  assert.ok(!/\.(set|update|remove|push|transaction)\(|fbSet\(|fbUpd\(/.test(kh), "別の店舗の読み込みは何も書かない");
});
test("マイシフトの「公開」は「確定」と表示する（2026-10-05）", () => {
  const my = fs.readFileSync(path.join(ROOT, "app-my.js"), "utf8");
  assert.ok(/const MY_KIND_LABEL=\{published:"確定",confirmed:"確定",/.test(my));
  const tb = my.slice(my.indexOf("function MyAllShiftTable("), my.indexOf("function MyPageStatusScreen("));
  assert.ok(!/"公開"/.test(tb) && !/ 公開）/.test(tb), "全員の表の見出しに「公開」を出さない");
});
test("給料のグラフ（2026-10-05）: 見込みまでの割合・年の目標（月×12）・年の勤務先ごとの収入", () => {
  const month = { rows: [], total: 30000, confirmedTotal: 10000, projectedTotal: 20000, hasAmount: true };
  const s = m.myPaySummaryOf(month, 40000);
  assert.strictEqual(s.progress, 0.25); assert.strictEqual(s.projectedProgress, 0.75);
  assert.strictEqual(m.myPaySummaryOf({ ...month, total: 90000 }, 40000).projectedProgress, 1, "100%で止める");
  // 年
  const row = (id, name, total, confirmed, wm) => ({ id, name, kind: "shifty", color: "#000", partial: false,
    amounts: { total, confirmedTotal: confirmed, projectedTotal: total == null ? null : total - confirmed, minutes: { workMin: wm } } });
  const months = [
    { payYm: "2026-01", rows: [row("A", "A店", 100000, 100000, 600), row("m_1", "カフェ", null, null, 120)], total: 100000, confirmedTotal: 100000, projectedTotal: 0, workMin: 720, hasAmount: true },
    { payYm: "2026-02", rows: [row("A", "A店", 80000, 30000, 480), row("m_1", "カフェ", null, null, 0)], total: 80000, confirmedTotal: 30000, projectedTotal: 50000, workMin: 480, hasAmount: true },
  ];
  const received = { "2026-01": { A: 95000 }, "2026-02": { m_1: 0 } };
  const y = m.myPayYearSummary(months, received);
  assert.strictEqual(y.total, 180000); assert.strictEqual(y.confirmedTotal, 130000); assert.strictEqual(y.projectedTotal, 50000); assert.strictEqual(y.hasAmount, true);
  const g = m.myPayYearGoalOf(y, 30000);
  assert.strictEqual(g.goal, 360000); assert.strictEqual(g.showRing, true);
  assert.strictEqual(g.progress, 130000 / 360000); assert.strictEqual(g.projectedProgress, 0.5);
  assert.strictEqual(m.myPayYearGoalOf(y, 0).showRing, false);
  const w = m.myPayYearByWorkplace(months, received);
  assert.deepStrictEqual(w.map(x => [x.id, x.total, x.confirmedTotal, x.workMin, x.received, x.hasReceived]),
    [["A", 180000, 130000, 1080, 95000, true], ["m_1", null, 0, 120, 0, true]]);
  assert.deepStrictEqual(w[0].months.map(x => [x.payYm, x.total]), [["2026-01", 100000], ["2026-02", 80000]]);
  // 画面: 月と年は同じ部品（MyPaySummaryBody）で、見込みは下地より濃いグレー（--c-text4）
  const my = fs.readFileSync(path.join(ROOT, "app-my.js"), "utf8");
  const ring = my.slice(my.indexOf("function MyGoalRing("), my.indexOf("function MyPaySummaryBody("));
  assert.ok(/stroke="var\(--c-border\)"/.test(ring) && /arc\(pv,"var\(--c-text4\)"\)/.test(ring) && /arc\(v,"var\(--c-accent\)"\)/.test(ring));
  const tab = my.slice(my.indexOf("function MyPayTab("), my.indexOf("function MyGoalSection("));
  assert.ok(/<MyPaySummaryBody data=\{yearRows\} summary=\{yearGoal\}\/>/.test(tab) && /myPayYearByWorkplace\(yearMonths,X\.received\)/.test(tab));
});
test("お店の締日・給料日（2026-10-05）: 検証・読み・本人の設定より優先・画面の入口", () => {
  assert.strictEqual(m.validatePayCalendarInput({ closingDay: "25", payMonthOffset: "1", payDay: "10", holidayRule: "before" }), null);
  assert.strictEqual(m.validatePayCalendarInput({ closingDay: "25", payMonthOffset: "0", payDay: "10", holidayRule: "before" }), "当月払いのときは、給料日を締日より後の日にしてください");
  assert.strictEqual(m.validatePayCalendarInput({ closingDay: "0", payMonthOffset: "1", payDay: "10", holidayRule: "before" }), "締日を選んでください");
  // 本人の給料設定の検証も同じ規則
  assert.strictEqual(m.validateMyPayInput({ closingDay: "25", payMonthOffset: "0", payDay: "10", holidayRule: "before" }, { companyPay: true }), "当月払いのときは、給料日を締日より後の日にしてください");
  const rec = m.buildPayCalendarRecord({ closingDay: "20", payMonthOffset: "1", payDay: "31", holidayRule: "after" }, "2026-10-05T00:00:00.000Z");
  assert.deepStrictEqual(rec, { closingDay: 20, payMonthOffset: 1, payDay: 31, holidayRule: "after", updatedAt: "2026-10-05T00:00:00.000Z" });
  assert.deepStrictEqual(m.normalizePayCalendar(rec), { closingDay: 20, payMonthOffset: 1, payDay: 31, holidayRule: "after" });
  assert.strictEqual(m.normalizePayCalendar({ closingDay: 20, payMonthOffset: 0, payDay: 10, holidayRule: "after" }), null, "矛盾した記録は使わない");
  assert.strictEqual(m.normalizePayCalendar(null), null);
  assert.strictEqual(m.payCalendarText(rec), "20日締め・翌月末日払い（土日祝は後ろ倒し）");
  assert.deepStrictEqual(m.payCalendarFormOf(null), { closingDay: "31", payMonthOffset: "1", payDay: "25", holidayRule: "before" });
  // 優先: 締日・給料日はお店、時給・交通費は本人のまま
  const own = m.myPayOf({ closingDay: 31, payMonthOffset: 1, payDay: 25, holidayRule: "before", wageType: "hourly", rate: 1200, commute: { amount: 300, per: "day" } });
  const eff = m.myPayWithShopCalendar(own, rec);
  assert.deepStrictEqual([eff.closingDay, eff.payMonthOffset, eff.payDay, eff.holidayRule, eff.rate, eff.commute.amount, eff.calendarFrom], [20, 1, 31, "after", 1200, 300, "shop"]);
  assert.strictEqual(m.myPayWithShopCalendar(own, null), own, "お店の登録が無ければ本人の設定のまま");
  const blank = m.myPayWithShopCalendar(null, rec);
  assert.deepStrictEqual([blank.closingDay, blank.rate, blank.wageType], [20, 0, "hourly"], "本人が未設定でもお店の締日で振り分ける（時給は未設定）");
  // 振り分け: 20日締め・翌月末払い → 11月支給は 9/21〜10/20
  const plan = m.myPayPlanOf("2026-11", eff, null);
  assert.deepStrictEqual([plan.from, plan.to, plan.payDate], ["2026-09-21", "2026-10-20", "2026-11-30"]);
  // 画面の入口: 給料タブの Shifty の店舗はお店の登録を重ねる・設定の欄は固定表示・管理者は設定タブと企業連携タブ
  const my = fs.readFileSync(path.join(ROOT, "app-my.js"), "utf8");
  const tab = my.slice(my.indexOf("function MyPayTab("), my.indexOf("function MyGoalSection("));
  assert.ok(/base\.pay=myPayWithShopCalendar\(base\.pay,sh\.settings&&sh\.settings\.payCalendar\)/.test(tab));
  assert.ok(/\{shopCal\?<MyShopCalendarView cal=\{shopCal\}\/>/.test(my));
  const co = fs.readFileSync(path.join(ROOT, "app-company.js"), "utf8");
  assert.ok(/<PayCalendarCard settings=\{settings\} onSave=\{onSaveOwn\}/.test(co) && /<CompanyPayCalendarCard listShops=\{listShops\}/.test(co));
  // 他店舗への保存は settings/payCalendar だけの差分（settings を丸ごと set しない）
  const card = co.slice(co.indexOf("function CompanyPayCalendarCard("), co.indexOf("function SetTab("));
  assert.ok(/fbUpd\(`shops\/\$\{id\}\/settings`,\{payCalendar:rec\}\)/.test(card) && !/fbSet\(/.test(card));
});

test("確認メールのリンク（2026-10-05）: アクション URL を自前のドメインにした形でも続きの登録・戻り先が無いスタッフは #/me・登録と同時にリンクを申請", () => {
  // Firebase コンソールでアクション URL を https://shiftyshifty.app/ にしたときの形（戻り先は continueUrl の中）
  const cont = "https://shiftyshifty.app/?elk=staff&elh=%23%2Fs%2Ft1";
  const custom = "https://shiftyshifty.app/?mode=signIn&oobCode=ABC&apiKey=K&continueUrl=" + encodeURIComponent(cont) + "&lang=ja";
  assert.deepStrictEqual(m.parseEmailLinkLanding(custom), { kind: "staff", hash: "#/s/t1", hasCode: true });
  // 旧 Dynamic Links の形（link の中に Firebase のリンク、その中に continueUrl）
  const fb = "https://ontheshift.firebaseapp.com/__/auth/action?apiKey=K&mode=signIn&oobCode=ABC&continueUrl=" + encodeURIComponent("https://shiftyshifty.app/?elk=admin");
  assert.deepStrictEqual(m.parseEmailLinkLanding("https://shiftyshifty.app/?link=" + encodeURIComponent(fb)), { kind: "admin", hash: "", hasCode: true });
  // 戻るハッシュ: スタッフで戻り先が無ければ #/me（"/" は管理者のログイン画面）
  assert.strictEqual(m.emailLinkReturnHash("staff", ""), "#/me");
  assert.strictEqual(m.emailLinkReturnHash("staff", "#/s/t1"), "#/s/t1");
  assert.strictEqual(m.emailLinkReturnHash("admin", ""), "");
  // 申請する店舗を引くパス
  assert.strictEqual(m.myLinkShopRefOfHash("#/s/abc23"), "tokens/abc23");
  assert.strictEqual(m.myLinkShopRefOfHash("#/m/AbCdEfGhIjKlMnOpQrStUvWx"), "staffPageTokens/AbCdEfGhIjKlMnOpQrStUvWx");
  assert.strictEqual(m.myLinkShopRefOfHash("#/me"), null);
  assert.strictEqual(m.myLinkShopRefOfHash("#/s/a.b"), null);
  assert.strictEqual(m.myLinkShopRefOfHash("#/m/short"), null);
  // 画面: 続きの登録・従来の登録の両方が登録と同時に申請する。後始末は戻るハッシュを通す
  const my = fs.readFileSync(path.join(ROOT, "app-my.js"), "utf8");
  const fin = my.slice(my.indexOf("function EmailLinkFinishScreen("), my.indexOf("function EmailLinkFinishScreen(") + 6000);
  assert.ok(/myResolveShopIdOfHash\(landing\.hash\)/.test(fin) && /myAutoLinkRequest\(user\.uid,sid,f\)/.test(fin));
  assert.ok(/emailLinkCleanUrl\(href,emailLinkReturnHash\(kind,landing\.hash\)\)/.test(fin));
  const reg = my.slice(my.indexOf("async function myRegister("), my.indexOf("async function myLogin("));
  assert.strictEqual((reg.match(/myAutoLinkRequest\(/g) || []).length, 2);
  const ar = my.slice(my.indexOf("async function myAutoLinkRequest("), my.indexOf("async function myRegister("));
  assert.ok(/fbSet\(`shops\/\$\{shopId\}\/linkRequests\/\$\{uid\}`,buildLinkRequestRecord\(input,/.test(ar) && /staffLinks\/\$\{uid\}/.test(ar), "設定タブの申請と同じ形・リンク済みなら申請しない");
  const main = fs.readFileSync(path.join(ROOT, "app-main.js"), "utf8");
  assert.ok(/parseEmailLinkLanding\(window\.location\.href,\{pendingKind:/.test(main));
  // 管理者のスタッフ編集: 個別URLの取り消しは「連携解除」
  assert.ok(/>連携解除<\/button>/.test(my) && !/>URLを取り消す</.test(my));
});

// ===== 掛け持ち（2026-10-05 ユーザー指示）: お店ごとの従業員番号・専用URLのお店をアカウントに追加 =====
test("掛け持ちの番号: 申請の欄の初期値はリンク済みのお店が無いときだけアカウントの番号・申請はお店ごとの番号を送る", () => {
  assert.strictEqual(m.myLinkRequestNumberDefault({ number: " ０１２ " }, []), "012");
  assert.strictEqual(m.myLinkRequestNumberDefault({ number: "012" }, undefined), "012", "読み込み中も初期値は出す");
  assert.strictEqual(m.myLinkRequestNumberDefault({ number: "012" }, [{ shopId: "A", ok: true }]), "", "リンク済みのお店がある＝その番号は別のお店のもの");
  assert.strictEqual(m.myLinkRequestNumberDefault({ number: "012" }, [{ shopId: "A", ok: false }]), "012", "外れたリンクは数えない");
  assert.strictEqual(m.myLinkRequestNumberDefault(null, []), "");
  assert.deepStrictEqual(m.buildLinkRequestRecord({ displayName: "山田", number: "７７" }, "T"), { displayName: "山田", at: "T", number: "77" });
  const my = fs.readFileSync(path.join(ROOT, "app-my.js"), "utf8");
  const sec = my.slice(my.indexOf("function MyLinksSection("), my.indexOf("function MyLinksSection(") + 9000);
  assert.ok(/buildLinkRequestRecord\(\{displayName:profile\.displayName,number:numValue\}/.test(sec), "設定タブの申請はこのお店の番号を送る");
  assert.ok(/data-my-input="linkNumber"/.test(sec) && /hint=\{MY_LINK_NUMBER_HINT\}/.test(sec), "申請の欄に番号の入力がある");
  assert.ok(!/buildLinkRequestRecord\(profile,/.test(sec), "アカウントの番号をそのまま送らない");
});
test("専用URLのアカウント追加の状態: ログインなし・読み込み中・読めない・同じ名前でリンク済み・別の名前・追加できる", () => {
  const u = { uid: "U1", email: "a@b.c" };
  assert.strictEqual(m.myPageAccountLinkState({ staffUser: null, links: [], shopId: "S", name: "田中" }), "login");
  assert.strictEqual(m.myPageAccountLinkState({ staffUser: u, links: undefined, shopId: "S", name: "田中" }), "loading");
  assert.strictEqual(m.myPageAccountLinkState({ staffUser: u, links: null, shopId: "S", name: "田中" }), "unread");
  assert.strictEqual(m.myPageAccountLinkState({ staffUser: u, links: [{ shopId: "S", ok: true, name: "田中" }], shopId: "S", name: "田中" }), "linked");
  assert.strictEqual(m.myPageAccountLinkState({ staffUser: u, links: [{ shopId: "S", ok: true, name: "佐藤" }], shopId: "S", name: "田中" }), "other");
  assert.strictEqual(m.myPageAccountLinkState({ staffUser: u, links: [{ shopId: "A", ok: true, name: "田中" }], shopId: "S", name: "田中" }), "ready", "別のお店とのリンクは関係ない");
  assert.strictEqual(m.myPageAccountLinkState({ staffUser: u, links: [{ shopId: "S", ok: false, name: "田中" }], shopId: "S", name: "田中" }), "ready");
  assert.ok(m.MY_LINK_METHOD_LABELS.page);
});
test("専用URLからアカウントへ追加（planLinkStaffPage）: 名前は URL の承認済みの名前・管理者と企業の uid は拒否・別の名前／取られた名前は拒否・同じなら書かない", () => {
  const b = { shopId: "S1", uid: "U1", name: "田中", nowIso: "T", owners: { OWN: "k" }, staffLinks: {}, mirrorPeople: null };
  const ok = cf.planLinkStaffPage(b);
  assert.deepStrictEqual(ok, { method: "page", patch: {
    "shops/S1/staffLinks/U1": { name: "田中", method: "page", at: "T" },
    "users/U1/links/S1": { name: "田中", at: "T" },
    "shops/S1/linkRequests/U1": null,
  } });
  const pp = cf.planLinkStaffPage({ ...b, mirrorPeople: { "0042": { S1: "田中" } } });
  assert.strictEqual(pp.patch["shops/S1/staffLinks/U1"].personId, "0042");
  assert.strictEqual(pp.patch["users/U1/links/S1"].personId, "0042");
  assert.deepStrictEqual(cf.planLinkStaffPage({ ...b, staffLinks: { U1: { name: "田中", method: "name", at: "a" } } }), { already: true, patch: null });
  const e = o => cf.planLinkStaffPage({ ...b, ...o }).error;
  assert.strictEqual(e({ staffLinks: { U1: { name: "佐藤", method: "name", at: "a" } } }).code, "failed-precondition");
  assert.strictEqual(e({ staffLinks: { U2: { name: "田中", method: "name", at: "a" } } }).code, "failed-precondition");
  assert.strictEqual(e({ uid: "OWN" }).code, "failed-precondition", "店舗の管理者の uid は紐付けない");
  assert.strictEqual(e({ uid: "company_X" }).code, "failed-precondition");
  assert.strictEqual(e({ name: "" }).code, "failed-precondition");
  assert.ok(cf.LINK_METHODS.includes("page"));
});
test("専用URLからアカウントへ追加: ルールの method と CF の LINK_METHODS が同じ・CF は名前を呼び出し元から受け取らず暗証番号を照合する", () => {
  const rules = fs.readFileSync(path.join(ROOT, "database.rules.json"), "utf8");
  const line = rules.split("\n").find(l => /"method":/.test(l) && /newData\.val\(\) === 'number'/.test(l));
  const inRule = [...line.matchAll(/newData\.val\(\) === '([a-z]+)'/g)].map(x => x[1]).sort();
  assert.deepStrictEqual(inRule, [...cf.LINK_METHODS].sort());
  const idx = fs.readFileSync(path.join(ROOT, "functions", "index.js"), "utf8");
  const fn = idx.slice(idx.indexOf("exports.linkStaffPage"), idx.indexOf("exports.getMyPay"));
  assert.ok(/myPageAccessCF\(\{ token, tokenRec, pageRec, staff \}\)/.test(fn) && /name: acc\.name/.test(fn), "名前は staffPages の承認済みの名前");
  assert.ok(!/data\.name|data && data\.name/.test(fn), "名前を呼び出し元から受け取らない");
  assert.ok(/action: "verify"/.test(fn) && /\.transaction\(/.test(fn), "暗証番号はトランザクションで照合する");
  assert.ok(fn.indexOf("planLinkStaffPage(") < fn.indexOf(".transaction("), "リンクできないのに試行回数を減らさない");
  assert.ok(/auth\.token && context\.auth\.token\.email/.test(fn), "メールのある認証だけ");
});
