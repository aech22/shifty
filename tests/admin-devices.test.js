// 管理端末の一覧と管理コードの作り直し（2026-10-08）の純粋関数のテスト。画面の実測は
// .claude/skills/shifty-e2e-verify/scripts/example-admin-devices.js
"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const u = require("../app-utils.js");

test("adminDeviceRows: この端末 → 企業アカウント → その他（uid 順）。null の登録は数えない", () => {
  const rows = u.adminDeviceRows({ zzz999: "K", company_C1: "K", ME123456: "K", aaa111: "K", gone: null }, "ME123456");
  assert.deepStrictEqual(rows.map(r => r.uid), ["ME123456", "company_C1", "aaa111", "zzz999"]);
  assert.deepStrictEqual(rows.map(r => [r.me, r.company]), [[true, false], [false, true], [false, false], [false, false]]);
  assert.strictEqual(rows[0].label, "端末 ME1234");
  assert.strictEqual(rows[1].label, "企業アカウント");
  assert.deepStrictEqual(u.adminDeviceRows(null, "x"), []);
});

test("adminKeyRotationRemovals: この端末と企業アカウントは残し、それ以外を全部外す", () => {
  assert.deepStrictEqual(u.adminKeyRotationRemovals({ ME: "K", company_C1: "K", A: "K", B: "K" }, "ME"), ["A", "B"]);
  assert.deepStrictEqual(u.adminKeyRotationRemovals({ ME: "K", company_C1: "K" }, "ME"), []);
  // 自分が一覧に無い（読み違い）ときも自分の uid は外す対象にしない
  assert.deepStrictEqual(u.adminKeyRotationRemovals({ A: "K" }, "ME"), ["A"]);
  assert.strictEqual(u.isCompanyOwnerUid("company_x"), true);
  assert.strictEqual(u.isCompanyOwnerUid("xcompany_"), false);
});

// ルールの前提（ドリフト検出）: 作り直しは「キー → 自分の登録 → 他の端末を外す」を別々に書く。
// owners/$uid の書き込みは書き込む前の private/adminKey と比べる（root）ので、1回の update にまとめると自分の登録が拒否される。
test("作り直しの順序とルールの前提: owners/$uid は root の adminKey と比べ、オーナーは他の端末を削除できる", () => {
  const rules = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "database.rules.json"), "utf8"));
  const w = rules.rules.shops.$shopId.owners.$uid[".write"];
  assert.ok(/newData\.val\(\) === root\.child\('shops'\)\.child\(\$shopId\)\.child\('private'\)\.child\('adminKey'\)\.val\(\)/.test(w), "自分の登録は書き込む前の管理キーと比べる");
  assert.ok(/!newData\.exists\(\) && data\.parent\(\)\.child\(auth\.uid\)\.exists\(\)/.test(w), "オーナーは owners の登録を削除できる");
  const main = fs.readFileSync(path.join(__dirname, "..", "app-main.js"), "utf8");
  const body = main.slice(main.indexOf("const rotateAdminKey="), main.indexOf("const rotateAdminKey=") + 1500);
  const iKey = body.indexOf("private/adminKey`,key)");
  const iMe = body.indexOf("owners/${me}`,key)");
  const iRm = body.indexOf("owners`,Object.fromEntries(removals");
  assert.ok(iKey > 0 && iMe > iKey && iRm > iMe, "キー → 自分の登録 → 他の端末を外す の順に別々に書く");
});
