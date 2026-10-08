// 実例: 企業のパスワードの作成・変更（createCompany・changeCompanyPassword）が、画面と同じ規則で推測されやすいパスワードを断る（2026-10-08）
//   8文字未満・よく使われるもの・日付に見える数字は invalid-argument で、DB に何も書かない（作成は企業を作らない・変更はハッシュを変えない）。
//   ふつうのパスワードは従来どおり通る。companyLogin（ログイン）には当てない＝既存の短いパスワードでもログインできる。
// 使い方: SHIFTY_CF_INDEX=<worktree>/functions/index.js node example-company-password-cf.js
// 反証: SHIFTY_CF_INDEX に 797f522 の functions/index.js を渡すと落ちる（6文字以上なら何でも通る）。
"use strict";
const { loadFunctions, callFn, makeChecker } = require("./cf-harness.js");
const crypto = require("crypto");

const INDEX = process.env.SHIFTY_CF_INDEX || undefined;
const check = makeChecker();
const hashPw = plain => { const salt = crypto.randomBytes(16).toString("hex"); return `${salt}:${crypto.scryptSync(String(plain), salt, 64).toString("hex")}`; };
const OWNER = "owner1";
const CID = "-Ncompany0001";

async function sectionCreate() {
  const h = loadFunctions({ indexPath: INDEX, data: {} });
  const create = password => callFn(h.fns.createCompany, { name: "テスト企業", password, shopIds: [] }, { uid: OWNER });
  for (const [pw, re] of [["abc1234", /8文字以上/], ["password1", /よく使われる/], ["Password!!", /よく使われる/], ["sakura0315", /日付に見える/], ["shop19990315", /日付に見える/]]) {
    const r = await create(pw);
    check(`作成: 「${pw}」は invalid-argument`, !r.ok && r.code === "invalid-argument" && re.test(r.msg), r);
  }
  check("作成: 断った呼び出しでは企業を1つも作っていない", h.db.get("companies") == null && h.db.get("companyCodes") == null, h.db.get("companies"));
  const r = await create("umikaze-42");
  const cid = r.ok && r.res && (r.res.companyId || null);
  check("作成: ふつうのパスワードは通り、企業とハッシュができる", r.ok && !!cid && typeof h.db.get(`companies/${cid}/private/passwordHash`) === "string", r);
}

async function sectionChange() {
  const data = { companies: { [CID]: { pub: { name: "テスト企業", ownerUid: OWNER, shops: {} }, private: { passwordHash: hashPw("oldpw1") } } }, companyCodes: { ABCD1234: CID } };
  const h = loadFunctions({ indexPath: INDEX, data });
  const before = h.db.get(`companies/${CID}/private/passwordHash`);
  const change = newPassword => callFn(h.fns.changeCompanyPassword, { companyId: CID, currentPassword: "oldpw1", newPassword }, { uid: OWNER });
  for (const [pw, re] of [["abc1234", /8文字以上/], ["qwerty2025", /よく使われる/], ["tora1225!", /日付に見える/], ["x9031599y", /日付に見える/]]) {
    const r = await change(pw);
    check(`変更: 「${pw}」は invalid-argument`, !r.ok && r.code === "invalid-argument" && re.test(r.msg), r);
  }
  check("変更: 断った呼び出しではハッシュが変わらない", h.db.get(`companies/${CID}/private/passwordHash`) === before);
  // ログインには当てない: 6文字の既存パスワード「oldpw1」でもログインの照合は通る（カスタムトークンまで進む）
  const login = await callFn(h.fns.companyLogin, { code: "ABCD1234", password: "oldpw1" }, {});
  check("ログイン: 既存の6文字のパスワードでもログインの照合は通る（新しい規則を当てない）", login.ok && !!(login.res && login.res.token), login);
  const ok = await change("newpass-mi7");
  check("変更: ふつうのパスワードは通り、ハッシュが変わる", ok.ok && h.db.get(`companies/${CID}/private/passwordHash`) !== before, ok);
}

(async () => {
  await sectionCreate();
  await sectionChange();
  process.exit(check.done ? check.done() : 0);
})().catch(e => { console.error(e); process.exit(2); });
