// 本番 Firebase → 開発 Firebase データコピースクリプト
// 使い方: node scripts/copy-prod-to-dev.js
//
// 事前準備:
//   1. Firebase コンソール(ontheshift) → プロジェクト設定 → サービスアカウント → 新しい秘密鍵を生成
//      → scripts/service-account-prod.json に保存
//   2. Firebase コンソール(thirty-dev-b6958) → プロジェクト設定 → サービスアカウント → 新しい秘密鍵を生成
//      → scripts/service-account-dev.json に保存

const { initializeApp, cert } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");

const PROD_DB_URL = "https://ontheshift-default-rtdb.firebaseio.com";
const DEV_DB_URL  = "https://thirty-dev-b6958-default-rtdb.firebaseio.com";

const prodApp = initializeApp({
  credential: cert(require("./service-account-prod.json")),
  databaseURL: PROD_DB_URL,
}, "prod");

const devApp = initializeApp({
  credential: cert(require("./service-account-dev.json")),
  databaseURL: DEV_DB_URL,
}, "dev");

const prodDB = getDatabase(prodApp);
const devDB  = getDatabase(devApp);

async function copyRef(label, path) {
  const snap = await prodDB.ref(path).once("value");
  const val  = snap.val();
  if (val === null) { console.log(`  (スキップ: ${label} はデータなし)`); return; }
  await devDB.ref(path).set(val);
  console.log(`  ✓ ${label}`);
}

async function main() {
  console.log("=== 本番 → 開発 Firebase コピー開始 ===\n");

  // 1. 店舗一覧
  const shopsSnap = await prodDB.ref("global/shops").once("value");
  const shops = shopsSnap.val() || {};
  const shopIds = Object.keys(shops);

  if (shopIds.length === 0) { console.log("本番に店舗データがありません"); process.exit(0); }
  console.log(`店舗数: ${shopIds.length} 件\n`);

  await devDB.ref("global/shops").set(shops);
  console.log("✓ global/shops\n");

  // 2. 各店舗データ
  for (const shopId of shopIds) {
    const name = shops[shopId]?.name || shopId;
    console.log(`[${name}]`);
    for (const key of ["settings", "periods", "staff", "subs", "lastActivity"]) {
      await copyRef(`shops/${shopId}/${key}`, `shops/${shopId}/${key}`);
    }

    // プラン情報（planExpiry はコピーしない）
    const planSnap = await prodDB.ref(`accounts/${shopId}/plan`).once("value");
    const plan = planSnap.val();
    if (plan) {
      await devDB.ref(`accounts/${shopId}/plan`).set(plan);
      console.log(`  ✓ accounts/${shopId}/plan (${plan})`);
    }
    console.log();
  }

  // 3. グローバルテンプレート
  await copyRef("global/templates", "global/templates");

  console.log("\n✅ コピー完了！localhost をリロードして確認してください。");
  process.exit(0);
}

main().catch(e => { console.error("エラー:", e.message); process.exit(1); });
