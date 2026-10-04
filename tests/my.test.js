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
    const code = pick(["abcd efgh", "ＡＢＣＤ－２３４５", "ABCD2345", "abcd-2345", "ABCDI234", str()]);
    assert.strictEqual(m.normalizeLinkCode(code), cf.normalizeLinkCodeCF(code));
    assert.strictEqual(m.isValidLinkCode(m.normalizeLinkCode(code)), cf.isValidLinkCodeCF(cf.normalizeLinkCodeCF(code)));
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
  assert.strictEqual(m.MY_LINK_CODE_LEN, cf.LINK_CODE_LEN);
  assert.strictEqual(m.MY_LINK_CODE_TTL_MS, cf.LINK_CODE_TTL_MS);
  assert.strictEqual(m.MY_DISPLAY_NAME_MAX, cf.LINK_NAME_MAX);
  assert.strictEqual(m.MY_NUMBER_MAX, cf.LINK_NUMBER_MAX);
  // 生成したコードは検証を通る（紛らわしい I・O・0・1 を含まない）
  for (let i = 0; i < 200; i++) {
    const c = cf.genLinkCodeCF(n => Array.from({ length: n }, () => Math.floor(Math.random() * 256)));
    assert.ok(cf.isValidLinkCodeCF(c) && m.isValidLinkCode(c) && !/[IO01]/.test(c), c);
  }
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

test("E2 buildLinkRequestRecord / fmtLinkCodeExpiry", () => {
  assert.deepStrictEqual(m.buildLinkRequestRecord({ displayName: " 田中 ", number: "０１" }, "T"), { displayName: "田中", at: "T", number: "01" });
  assert.deepStrictEqual(m.buildLinkRequestRecord({ displayName: "田中" }, "T"), { displayName: "田中", at: "T" });
  assert.match(m.fmtLinkCodeExpiry(new Date(2026, 9, 5, 9, 3).getTime()), /^2026\/10\/05 09:03$/);
  assert.strictEqual(m.fmtLinkCodeExpiry(NaN), "");
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

test("E2 発行（planIssueStaffLinkCode）: 24時間・前のコードを消す・登録の無い名前と紐付け済みの名前は拒否", () => {
  const now = Date.UTC(2026, 9, 4, 0, 0);
  const r = cf.planIssueStaffLinkCode({ ...base(), name: "田中", callerUid: "OWN", now, nowIso: "T", code: "ABCD2345", prevCode: "WXYZ6789" });
  assert.strictEqual(r.expiry, now + 24 * 3600 * 1000);
  assert.deepStrictEqual(r.patch, { "staffLinkCodes/ABCD2345": { shopId: "S1", name: "田中", expiry: r.expiry, issuedBy: "OWN", createdAt: "T" }, "staffLinkCodeIndex/S1/田中": "ABCD2345", "staffLinkCodes/WXYZ6789": null });
  const e = o => cf.planIssueStaffLinkCode({ ...base(), name: "田中", callerUid: "OWN", now, nowIso: "T", code: "ABCD2345", ...o }).error;
  assert.strictEqual(e({ callerUid: "X" }).code, "permission-denied");
  assert.strictEqual(e({ name: "鈴木" }).code, "failed-precondition");
  assert.strictEqual(e({ staffLinks: { U1: { name: "田中", method: "name", at: "t" } } }).code, "failed-precondition");
});

test("E2 コードでの紐付け（planRedeemStaffLinkCode）: 24時間ちょうどで使えない・無いコードは失敗に数える・1回限りの印", () => {
  const now0 = Date.UTC(2026, 9, 4, 0, 0);
  const rec = { shopId: "S1", name: "田中", expiry: now0 + cf.LINK_CODE_TTL_MS, issuedBy: "OWN", createdAt: "c" };
  const go = o => cf.planRedeemStaffLinkCode({ ...base(), uid: "U1", email: "a@b.jp", rec, code: "ABCD2345", nowIso: "T", ...o });
  const ok = go({ now: rec.expiry - 1 });
  assert.ok(ok.consume, "24時間の直前は使える");
  assert.deepStrictEqual(ok.patch, { "shops/S1/staffLinks/U1": { name: "田中", method: "code", at: "T" }, "users/U1/links/S1": { name: "田中", at: "T" }, "shops/S1/linkRequests/U1": null, "staffLinkCodeAttempts/U1": null });
  const exact = go({ now: rec.expiry });
  assert.strictEqual(exact.error.code, "invalid-argument", "24時間ちょうどは期限切れ");
  assert.ok(exact.countFail && exact.deleteExpired);
  assert.strictEqual(go({ now: rec.expiry + 1 }).error.code, "invalid-argument");
  const missing = go({ now: now0, rec: null });
  assert.ok(missing.countFail && !missing.deleteExpired);
  assert.strictEqual(missing.error.msg, exact.error.msg, "無いコードと期限切れは同じ文言（どちらかを教えない）");
  assert.strictEqual(go({ now: now0, email: null }).error.code, "failed-precondition", "メールのある認証だけ");
  assert.strictEqual(go({ now: now0, uid: "OWN" }).error.code, "failed-precondition", "オーナーの uid はリンクしない");
  const gone = go({ now: now0, staff: ["山田 太郎"] });
  assert.ok(gone.error && gone.deleteExpired && !gone.consume, "名前が消えたコードは使わず消す");
  assert.strictEqual(go({ now: now0, staffLinks: { U9: { name: "田中", method: "name", at: "t" } } }).error.code, "failed-precondition");
});

test("E2 入力の失敗回数: 5回で15分止め、成功で消える。古い失敗は数え直す", () => {
  let st = null; const t0 = 1e12;
  for (let i = 1; i <= 4; i++) { st = cf.nextLinkCodeAttemptsCF(st, false, t0 + i); assert.strictEqual(st.fails, i); assert.strictEqual(cf.linkCodeWaitMsCF(st, t0 + i), 0); }
  st = cf.nextLinkCodeAttemptsCF(st, false, t0 + 5);
  assert.strictEqual(cf.linkCodeWaitMsCF(st, t0 + 5), cf.LINK_CODE_LOCK_MS);
  assert.strictEqual(cf.linkCodeWaitMsCF(st, t0 + 5 + cf.LINK_CODE_LOCK_MS), 0);
  assert.strictEqual(cf.nextLinkCodeAttemptsCF(st, true, t0), null);
  const old = { fails: 4, lastAt: t0 };
  assert.strictEqual(cf.nextLinkCodeAttemptsCF(old, false, t0 + cf.LINK_CODE_FAIL_WINDOW_MS + 1).fails, 1);
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
  ["staffLinkCodes", "staffLinkCodeIndex", "staffLinkCodeAttempts"].forEach(k => assert.deepStrictEqual(rules[k], { ".read": false, ".write": false }, k));
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
  // DB への書き込みだけを数える（E6 の会社設定の結果を覚える Map の .set は書き込みではない）
  const writes = [...body.matchAll(/\b(fbSet|fbUpd)\(\s*`?([^,`)]*)/g)].map(x => x[1] + " " + x[2]);
  assert.ok(!/\.ref\([^)]*\)\.(set|update|remove)\(/.test(body), "ref() から直接書かない");
  assert.deepStrictEqual([...body.matchAll(/(\w+)\.set\(/g)].map(x => x[1]).filter(n => n !== "_myCompanyPayCache"), [], "Map 以外の .set が無い");
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
  assert.strictEqual(m.MY_TIME_OPTIONS.length, 361, "0:00〜30:00 の5分刻み");
  assert.deepStrictEqual([m.MY_TIME_OPTIONS[0], m.MY_TIME_OPTIONS[1], m.MY_TIME_OPTIONS[360]], [{ value: "00:00", label: "0:00" }, { value: "00:05", label: "0:05" }, { value: "30:00", label: "30:00" }]);
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
test("E4 実績の上書き: 表示と給料の1日に効き、締の追加出勤は残る。指紋（変更あり）は公開内容のまま。公開と同じ値なら消す", () => {
  const ov = { "2026-10-18": { start: "18:00", end: "23:30", breakMin: 15 } };
  const base = m.buildMyShiftDays(e3Base({ periods: [E3Pub] }), U);
  const es = m.buildMyShiftDays(e3Base({ periods: [E3Pub], overrides: ov }), U);
  const d18 = es.find(e => e.date === "2026-10-18");
  assert.strictEqual(m.fmtMyRange(d18), "18:00〜23:30");
  assert.ok(d18.overridden && d18.breakMin === 15 && d18.workMin === 315, JSON.stringify(d18));
  assert.strictEqual(m.fmtMyRange(d18.sched), "18:00〜23:00", "公開内容は sched に残る");
  assert.deepStrictEqual(m.myPublishedFingerprints(es, ["S1|p1"]), m.myPublishedFingerprints(base, ["S1|p1"]), "上書きしても指紋は変わらない＝変更ありにならない");
  assert.ok(!es.find(e => e.date === "2026-10-17").overridden);
  // 締の追加出勤
  const subsX = [{ ...E3Subs[0], shifts: { "2026-10-18": { status: "work", start: "17:00", end: "22:00", extraStart: "23:00", extraEnd: "25:00", adjustedStartFixed: true } } }];
  const ex = m.buildMyShiftDays(e3Base({ periods: [E3Pub], subsByPeriod: { p1: subsX }, overrides: { "2026-10-18": { start: "17:00", end: "21:00", breakMin: 0 } } }), U)[0];
  assert.deepStrictEqual(ex.segments.map(g => [g.startMin, g.endMin, g.extra]), [[1020, 1260, false], [1380, 1500, true]], "上書きは主シフトだけ・追加出勤は残す");
  assert.strictEqual(ex.workMin, 240 + 120);
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
  assert.ok(unfolded.includes("DESCRIPTION:実績（本人の入力）"), "上書きした日は実績と書く");
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
  assert.ok(ev.includes("DESCRIPTION:公開\\na\\nb\r\n"), "単独の CR も \\n に（生の CR を残さない）");
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
  const e = { kind: "published", date: "2026-10-31", shopId: "S1", shopName: "A店 & 梅田", startMin: 22 * 60, endMin: 26 * 60, breakMin: 30, memo: "秘密のメモ",
    segments: [{ startMin: 22 * 60, endMin: 26 * 60 }, { startMin: 26 * 60 + 30, endMin: 27 * 60, extra: true }] };
  const links = m.myGoogleCalendarLinks(e);
  assert.strictEqual(links.length, 2, "締の追加出勤は別のリンク");
  const u = new URL(links[0].url);
  assert.strictEqual(u.origin + u.pathname, "https://calendar.google.com/calendar/render");
  assert.strictEqual(u.searchParams.get("action"), "TEMPLATE");
  assert.strictEqual(u.searchParams.get("text"), "A店 & 梅田");
  assert.strictEqual(u.searchParams.get("dates"), "20261031T220000/20261101T020000", "26:00 は翌日の 2:00（現地表記）");
  assert.strictEqual(u.searchParams.get("ctz"), "Asia/Tokyo");
  assert.deepStrictEqual([...u.searchParams.keys()].sort(), ["action", "ctz", "dates", "text"], "送るのは勤務先名と時刻だけ（休憩・メモは送らない）");
  assert.ok(!links[0].url.includes(encodeURIComponent("秘密")));
  assert.strictEqual(new URL(links[1].url).searchParams.get("text"), "A店 & 梅田（追加）");
  assert.strictEqual(links[1].extra, true);
  assert.deepStrictEqual(m.myGoogleCalendarLinks({ ...e, kind: "submitted" }), [], "未公開（グレー）は出さない");
  assert.deepStrictEqual(m.myGoogleCalendarLinks(null), []);
  assert.strictEqual(m.myGoogleCalendarLinks({ kind: "manual", date: "2026-10-12", shopName: "", startMin: 600, endMin: 900, segments: [] }).length, 1, "segments が空なら主シフト1件");
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
  assert.ok(/const pageRoute=MY_SCREEN_ENABLED&&parseUrl\(\)\?\.type==="page"/.test(main), "個別URLはゲートの下");
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
  assert.ok(/onSub=\{staffOnSub\}/.test(main) && /onSub=\{staffOnSub\} onDeleteSub=\{staffOnDeleteSub\}\/>;/.test(main), "募集URLと個別URLが同じ staffOnSub を通る");
  assert.ok(/useEffect\(\(\)=>\{ if\(pageRoute!==null&&latestPeriod&&apid!==latestPeriod\.id\) setApid\(latestPeriod\.id\); \}/.test(main), "最新の期間を購読する");
});
test("個別URL（P3）: 全員のシフト表は公開済みだけ・確定値・並びはシフト作成タブと同じ（写し・非表示・空白列）・休暇の帯は種別名", () => {
  const p = { id: "p1", startDate: "2026-10-01", endDate: "2026-10-03", label: "10月" };
  const pub = { ...p, published: { at: "2026-10-01T00:00:00.000Z", byUid: "O" } };
  const settings = { staffAliases: { 佐藤: ["さとう"] }, staffHidden: { 退職: true }, overtimeSettings: { byStaff: { 田中: { dinner: 30 } } } };
  const subs = [
    { id: "a", periodId: "p1", staffName: "田中", shifts: { "2026-10-01": { status: "work", start: "17:00", end: "23:00" }, "2026-10-02": { status: "work", start: "9:30", end: "15:00", adjustedStart: "10:00" } } },
    { id: "b", periodId: "p1", staffName: "さとう", shifts: { "2026-10-01": { status: "holiday", leaveTypes: { start: "paid", end: "paid" } }, "2026-10-02": { status: "work", start: "11:00", end: "15:00", leaveTypes: { end: "ceremony" } } } },
    { id: "c", periodId: "p1", staffName: "退職", shifts: { "2026-10-01": { status: "work", start: "10:00", end: "15:00" } } },
    { id: "z", periodId: "p0", staffName: "田中", shifts: { "2026-10-03": { status: "work", start: "1:00", end: "2:00" } } },
  ];
  const staff = ["田中", "__spacer__1", "佐藤", "退職"];
  assert.strictEqual(m.buildMyStaffTable({ period: null }, U).state, "noPeriod");
  assert.strictEqual(m.buildMyStaffTable({ period: pub, staff, settings, subs, premium: false }, U).state, "premium");
  assert.strictEqual(m.buildMyStaffTable({ period: p, staff, settings, subs, premium: true }, U).state, "unpublished", "未公開は出さない");
  const t = m.buildMyStaffTable({ period: pub, staff, settings, subs, premium: true, me: "佐藤", todayStr: "2026-10-01" }, U);
  assert.strictEqual(t.state, "ok");
  assert.deepStrictEqual(t.cols, [{ name: "田中", me: false }, { spacer: true }, { name: "佐藤", me: true }], "空白列は残し、非表示の人は落とす");
  assert.deepStrictEqual(t.rows.map(r => r.date), ["2026-10-01", "2026-10-02", "2026-10-03"]);
  // 田中: 退勤延長（ディナー30分）は確定値に入る。管理者の調整値（10:00）が出る。別の期間の提出は使わない
  assert.deepStrictEqual(t.rows[0].cells[0], { top: "17", bottom: "23:30", work: true, leave: false, extra: false });
  assert.strictEqual(t.rows[1].cells[0].top, "10");
  assert.strictEqual(t.rows[2].cells[0], null);
  assert.strictEqual(t.rows[0].cells[1], null, "空白列のセルは null");
  // 佐藤（別名で提出）: 終日の有給・半日の慶弔は種別名（退勤の帯だけ）
  assert.deepStrictEqual(t.rows[0].cells[2], { top: "有給", bottom: "有給", work: false, leave: true, extra: false });
  assert.deepStrictEqual(t.rows[1].cells[2], { top: "11", bottom: "慶弔", work: true, leave: true, extra: false });
  assert.strictEqual(t.maxChars, 5);
  // 確定・終了済みの期間は写しの並びと設定（写しに居ない人は出さない）
  const snap = { ...pub, confirmation: { at: "t", byUid: "O" }, snapshot: { staffList: ["佐藤"], settings: { staffAliases: { 佐藤: ["さとう"] } } } };
  assert.deepStrictEqual(m.buildMyStaffTable({ period: snap, staff, settings, subs, premium: true, todayStr: "2026-10-01" }, U).cols.map(c => c.name), ["佐藤"]);
  assert.strictEqual(m.myStaffTimeText(570), "9:30");
  assert.strictEqual(m.myStaffTimeText(1500), "25");
});
test("個別URL（P3）: 全員の表の寸法は横幅を超えない（列の幅の合計＝幅）。文字は14pxを上限に、収めることを優先", () => {
  const colsOf = (n, sp) => [...Array.from({ length: n }, (_, i) => ({ name: "n" + i })), ...Array.from({ length: sp }, () => ({ spacer: true }))];
  [[341, 10, 0, 4], [341, 30, 1, 4], [286, 30, 2, 5], [1000, 3, 0, 2], [0, 5, 0, 4]].forEach(([w, n, sp, ch]) => {
    const L = m.myStaffTableLayout({ width: w, cols: colsOf(n, sp), maxChars: ch });
    const sum = L.dateW + n * L.colW + sp * L.spacerW;
    assert.ok(sum <= Math.max(w, L.dateW) + 1e-6, `${w}/${n}: ${sum}`);
    assert.ok(L.fontPx <= 14 && L.fontPx > 0);
    if (w > 0) assert.ok(L.fontPx * ch * 0.62 <= L.colW - 2 + 0.2 || L.fontPx === 1, "文字がセルに収まる");
  });
  const a = m.myStaffTableLayout({ width: 341, cols: colsOf(10, 0), maxChars: 4 }), b = m.myStaffTableLayout({ width: 341, cols: colsOf(30, 1), maxChars: 4 });
  assert.ok(a.fontPx > b.fontPx, "人数が多いほど小さい");
  const my = fs.readFileSync(path.join(ROOT, "app-my.js"), "utf8");
  assert.ok(/overflowX:zoomed\?"hidden":"auto"/.test(my) && /scrollSnapType:"x mandatory"/.test(my), "ピンチで拡大中は横スクロールを止める・scroll-snap");
  assert.ok(/role="tablist" aria-label="表示の切り替え"/.test(my), "タップでも切り替えられる");
  assert.ok(!/<input/.test(my.slice(my.indexOf("function MyAllShiftTable("), my.indexOf("function MyPageStatusScreen("))), "全員の表は入力欄を持たない（16px の規約に触れない）");
});
