/**
 * Stripe 初期設定スクリプト
 *
 * 実行方法:
 *   STRIPE_SECRET_KEY=sk_live_... node scripts/stripe-setup.js
 *
 * 実行内容:
 *   1. Webhookエンドポイントに invoice.payment_failed を追加
 *   2. Customer Portal を日本語に設定
 *   3. 消費税レート 10% を作成（未作成の場合のみ）
 */

const Stripe = require("stripe");

const WEBHOOK_URL = "https://asia-northeast1-ontheshift.cloudfunctions.net/stripeWebhook";
const REQUIRED_EVENTS = [
  "checkout.session.completed",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
  "customer.subscription.deleted",
  "customer.subscription.updated",
];

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error("❌ STRIPE_SECRET_KEY が設定されていません");
    console.error("   実行方法: STRIPE_SECRET_KEY=sk_live_... node scripts/stripe-setup.js");
    process.exit(1);
  }

  const stripe = Stripe(key);
  console.log("🔧 Stripe 初期設定を開始します...\n");

  // ── 1. Webhook エンドポイントの更新 ──────────────────────────
  console.log("1️⃣  Webhookエンドポイントを確認中...");
  const endpoints = await stripe.webhookEndpoints.list({ limit: 20 });
  const ep = endpoints.data.find(e => e.url === WEBHOOK_URL);

  if (!ep) {
    console.log(`   ⚠️  エンドポイント未登録: ${WEBHOOK_URL}`);
    console.log("   → Stripe Dashboard > Developers > Webhooks から手動登録してください");
  } else {
    const current = ep.enabled_events;
    const missing = REQUIRED_EVENTS.filter(e => !current.includes(e) && !current.includes("*"));
    if (missing.length === 0) {
      console.log("   ✅ 全イベント登録済み");
    } else {
      const merged = [...new Set([...current.filter(e => e !== "*"), ...REQUIRED_EVENTS])];
      await stripe.webhookEndpoints.update(ep.id, { enabled_events: merged });
      console.log(`   ✅ 追加したイベント: ${missing.join(", ")}`);
    }
  }

  // ── 2. Customer Portal 日本語化 ──────────────────────────────
  console.log("\n2️⃣  Customer Portal の言語設定を確認中...");
  try {
    const configs = await stripe.billingPortal.configurations.list({ limit: 10 });
    const active = configs.data.find(c => c.is_default) || configs.data[0];

    if (!active) {
      await stripe.billingPortal.configurations.create({
        business_profile: { headline: "Shifty サブスクリプション管理" },
        features: {
          customer_update: { enabled: true, allowed_updates: ["email", "address"] },
          invoice_history: { enabled: true },
          payment_method_update: { enabled: true },
          subscription_cancel: { enabled: true },
        },
        default_return_url: "https://shiftyshifty.app/",
      });
      console.log("   ✅ Customer Portal 設定を作成しました（言語はDashboardで手動設定: Settings > Customer portal > Language > Japanese）");
    } else {
      console.log(`   ✅ 既存設定確認済み (id: ${active.id})`);
      console.log("   📝 言語はAPIでは変更不可 → Dashboard: Settings > Customer portal > Language > Japanese");
    }
  } catch (e) {
    console.log("   ⚠️  Customer Portal 設定の取得に失敗:", e.message);
  }

  // ── 3. 消費税レート 10% ──────────────────────────────────────
  console.log("\n3️⃣  消費税レート（10%）を確認中...");
  const taxRates = await stripe.taxRates.list({ active: true, limit: 20 });
  const jpTax = taxRates.data.find(t => t.country === "JP" && t.percentage === 10);

  if (jpTax) {
    console.log(`   ✅ 既存の税率を確認: ${jpTax.id} (${jpTax.display_name} ${jpTax.percentage}%)`);
  } else {
    const created = await stripe.taxRates.create({
      display_name: "消費税",
      description: "日本 消費税 10%",
      jurisdiction: "JP",
      percentage: 10,
      inclusive: false,
      country: "JP",
    });
    console.log(`   ✅ 消費税レートを作成: ${created.id}`);
  }

  // ── 4. Premium プラン 2,980円/月 の Price 作成 ──────────────
  console.log("\n4️⃣  Premium Price（2,980円/月）を確認中...");
  const prices = await stripe.prices.list({ active: true, limit: 100 });
  const existingPremium = prices.data.find(p =>
    p.unit_amount === 2980 &&
    p.currency === "jpy" &&
    p.recurring?.interval === "month" &&
    p.metadata?.plan === "premium"
  );

  if (existingPremium) {
    console.log(`   ✅ 既存 Premium Price を確認: ${existingPremium.id}`);
    console.log(`   📝 functions/index.js の premium_monthly に設定してください: "${existingPremium.id}"`);
  } else {
    // 先に Product を作成（または既存を再利用）
    const products = await stripe.products.list({ active: true, limit: 100 });
    let premiumProduct = products.data.find(p => p.metadata?.plan === "premium");
    if (!premiumProduct) {
      premiumProduct = await stripe.products.create({
        name: "Shifty Premium",
        description: "シフト時間編集・全機能利用可能なPremiumプラン",
        metadata: { plan: "premium" },
      });
      console.log(`   ✅ Premium Product を作成: ${premiumProduct.id}`);
    } else {
      console.log(`   ✅ 既存 Premium Product を確認: ${premiumProduct.id}`);
    }
    const price = await stripe.prices.create({
      product: premiumProduct.id,
      unit_amount: 2980,
      currency: "jpy",
      recurring: { interval: "month" },
      metadata: { plan: "premium" },
    });
    console.log(`   ✅ Premium Price を作成: ${price.id}`);
    console.log(`   📝 functions/index.js の premium_monthly に設定してください: "${price.id}"`);
  }

  console.log("\n✨ 完了しました！\n");
  console.log("📋 残りの手動設定（APIでは変更不可）:");
  console.log("   • Smart Retries: Settings > Subscriptions and emails > Manage failed payments > Smart Retries をオン");
  console.log("   • Customer Portal 言語: Settings > Customer portal > Language > Japanese");
}

main().catch(e => {
  console.error("❌ エラー:", e.message);
  process.exit(1);
});
