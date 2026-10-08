// 店舗IDだけでの読み取りの禁止（2026-10-08）のドリフト検出。
// 規則そのものの実測はエミュレータで行う（.claude/skills/shifty-e2e-verify/scripts/emu-rules-shop-read.js・emu-e2e-shop-read.js）。
// ここでは「後の編集で auth != null だけの読みに戻っていないか」と「他の店舗を読む入口が読みの登録を通っているか」を見る。
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const rules = JSON.parse(fs.readFileSync(path.join(ROOT, "database.rules.json"), "utf8")).rules;
const shop = rules.shops.$shopId;
const READ_NODES = ["settings", "periods", "staff", "templates", "lastActivity", "company", "subs"];

test("店舗のデータの読みは、オーナー・リンク・企業・読みの登録（readers）のどれかを要求する", () => {
  for (const n of READ_NODES) {
    const r = shop[n] && shop[n][".read"];
    assert.ok(typeof r === "string", `shops/$shopId/${n} に .read が無い`);
    assert.notStrictEqual(r.replace(/\s+/g, ""), "auth!=null", `shops/$shopId/${n} の読みが auth != null だけに戻っている`);
    for (const k of ["owners", "staffLinks", "readers", "'demo-toriMatsu-v1'"]) {
      assert.ok(r.includes(k), `shops/$shopId/${n} の読みに ${k} が無い`);
    }
  }
  // 同じ式を7か所に書いているので、1か所だけ直した食い違いを検出する
  const forms = new Set(READ_NODES.map(n => shop[n][".read"]));
  assert.strictEqual(forms.size, 1, "店舗のデータの読みの式が node ごとに食い違っている");
});

test("readers: 書けるのは本人（とオーナーの削除）だけで、項目は t・p・o・l・q・qs に限る", () => {
  const rd = shop.readers;
  assert.ok(rd, "shops/$shopId/readers のルールが無い");
  assert.ok(rd.$uid[".write"].includes("auth.uid === $uid"), "readers の書き込みが本人に限られていない");
  assert.ok(rd.$uid[".write"].includes("demo-toriMatsu-v1"), "デモ店舗の readers を拒否していない");
  const keys = Object.keys(rd.$uid).filter(k => !k.startsWith("."));
  assert.deepStrictEqual(keys.sort(), ["$other", "l", "o", "p", "q", "qs", "t"].sort());
  assert.strictEqual(rd.$uid.$other[".validate"], false);
});

test("readers の各項目の読みの条件は、child() の前に isString() で値を確かめている（null を渡すとルール全体が拒否になる）", () => {
  const r = shop.settings[".read"];
  for (const k of ["t", "p", "o", "l", "q", "qs"]) {
    const uses = r.split(`child('${k}').val()`).length - 1;
    if (uses === 0) continue;
    assert.ok(r.includes(`child('${k}').isString()`), `readers の ${k} を isString() で確かめていない`);
  }
});

test("他の店舗を読む入口は shopReadReady を通る（読みの登録をしてから読む）", () => {
  const src = f => fs.readFileSync(path.join(ROOT, f), "utf8");
  const shift = src("app-shift.js");
  assert.ok(/otherShops\.map\(os=>shopReadReady\(os\.id\)/.test(shift), "シフト作成タブの他店の読み込みが shopReadReady を通っていない");
  const my = src("app-my.js");
  assert.ok(/const _myRead=p=>\{[\s\S]{0,600}shopReadReady/.test(my), "従業員画面の読み（_myRead）が shopReadReady を通っていない");
  const company = src("app-company.js");
  assert.ok(!/firebaseDB\.ref\(p\)\.once\("value"\)/.test(company), "企業連携タブに shopReadOnce を通らない店舗の読みが残っている");
  const main = src("app-main.js");
  assert.ok(main.includes('noteShopReadCred("t"') && main.includes('noteShopReadCred("p"'), "スタッフURL・個別URLの入口が読みの理由を覚えていない");
  assert.ok(main.includes("resubscribeIfDenied"), "拒否された購読を張り直す処理が無い");
});
