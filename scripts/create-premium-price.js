/**
 * Shifty Premium 2,980円/月 の Price を既存 Product に追加する
 *
 * 実行方法:
 *   STRIPE_SECRET_KEY=sk_live_... node scripts/create-premium-price.js
 */

const Stripe = require("stripe");

const PRODUCT_ID = "prod_Umy2VMCXpwASFu"; // Shifty Premium product

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error("❌ STRIPE_SECRET_KEY が設定されていません");
    console.error("   実行方法: STRIPE_SECRET_KEY=sk_live_... node scripts/create-premium-price.js");
    process.exit(1);
  }

  const stripe = Stripe(key);

  // 既存の Premium Price を確認
  const prices = await stripe.prices.list({ product: PRODUCT_ID, active: true, limit: 10 });
  const existing = prices.data.find(p => p.unit_amount === 2980 && p.currency === "jpy" && p.recurring?.interval === "month");

  if (existing) {
    console.log(`✅ 既存の Premium Price を確認: ${existing.id}`);
    console.log(`📝 functions/index.js の premium_monthly に設定してください:`);
    console.log(`   premium_monthly: "${existing.id}",`);
    return;
  }

  const price = await stripe.prices.create({
    product: PRODUCT_ID,
    unit_amount: 2980,
    currency: "jpy",
    recurring: { interval: "month" },
    metadata: { plan: "premium" },
  });

  console.log(`✅ Premium Price を作成しました: ${price.id}`);
  console.log(`\n📝 functions/index.js の premium_monthly に設定してください:`);
  console.log(`   premium_monthly: "${price.id}",`);
}

main().catch(e => {
  console.error("❌ エラー:", e.message);
  process.exit(1);
});
