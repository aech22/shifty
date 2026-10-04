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
test("E3 マイシフトの書き込みは users/{uid}/seen だけ（店舗のデータに書かない）", () => {
  const src = fs.readFileSync(path.join(ROOT, "app-my.js"), "utf8");
  const a = src.indexOf("async function readMyShiftShop"), b = src.indexOf("function MyPayTab(");
  assert.ok(a > 0 && b > a);
  const body = src.slice(a, b);
  const writes = [...body.matchAll(/\b(fbSet|fbUpd|\.set|\.update|\.remove)\(\s*`?([^,`)]*)/g)].map(x => x[1] + " " + x[2]);
  assert.deepStrictEqual(writes, ["fbSet users/${uid}/seen/${sid}/${pid}"]);
  assert.ok(/orderByChild\("periodId"\)\.equalTo\(pid\)/.test(body), "subs は期間ごとの部分読み");
  assert.ok(!/ref\(`shops\/\$\{sid\}\/subs`\)\.once/.test(body), "店舗の subs 全件を読まない");
});
