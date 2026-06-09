const functions = require("firebase-functions");
const Stripe = require("stripe");
const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp();
const db = admin.database();

// Stripeは関数実行時に初期化（デプロイ解析時にAPIキーが不要）
function getStripe() { return Stripe(process.env.STRIPE_SECRET_KEY); }

// Stripe Price ID
const STRIPE_PRICES = {
  pro_monthly: "price_1TgTwHDjKKQsHl7LRZKClgFc", // Shifty Pro 500円/月（本番）
};

// ============================================================
// Stripe決済セッション作成
// ============================================================
exports.createCheckoutSession = functions
  .region("asia-northeast1")
  .runWith({ secrets: ["STRIPE_SECRET_KEY"] })
  .https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).send("Method Not Allowed"); return; }

    const { shopId, plan, successUrl, cancelUrl } = req.body;
    if (!shopId || !plan) { res.status(400).json({ error: "shopId, plan は必須です" }); return; }

    const priceId = STRIPE_PRICES.pro_monthly;
    const stripe = getStripe();

    try {
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [{ price: priceId, quantity: 1 }],
        metadata: { shopId, plan },
        success_url: successUrl || "https://shiftyshifty.app/?payment=success",
        cancel_url:  cancelUrl  || "https://shiftyshifty.app/?payment=cancel",
        locale: "ja",
      });
      res.status(200).json({ url: session.url });
    } catch (e) {
      console.error("Checkout session作成失敗:", e);
      res.status(500).json({ error: e.message });
    }
  });

// ============================================================
// Stripe Webhook受信（決済完了 → planをFirebaseに書き込む）
// ============================================================
exports.stripeWebhook = functions
  .region("asia-northeast1")
  .runWith({ secrets: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"] })
  .https.onRequest(async (req, res) => {
    const stripe = getStripe();
    const sig = req.headers["stripe-signature"];
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (e) {
      console.error("Webhook署名検証失敗:", e.message);
      res.status(400).send(`Webhook Error: ${e.message}`);
      return;
    }

    // 決済完了 or サブスク更新
    if (event.type === "checkout.session.completed" || event.type === "invoice.payment_succeeded") {
      const obj = event.data.object;
      let shopId = obj.metadata?.shopId;
      let plan   = obj.metadata?.plan;

      // invoice.payment_succeededの場合はsubscriptionからmetadataを取得
      if (!shopId && obj.subscription) {
        try {
          const sub = await getStripe().subscriptions.retrieve(obj.subscription);
          shopId = sub.metadata?.shopId;
          plan   = sub.metadata?.plan;
        } catch (e) {
          console.error("subscription取得失敗:", e);
        }
      }

      if (shopId && plan) {
        const expiry = new Date();
        expiry.setMonth(expiry.getMonth() + 1);
        await db.ref(`accounts/${shopId}/plan`).set(plan);
        await db.ref(`accounts/${shopId}/planExpiry`).set(expiry.toISOString().split("T")[0]);
        // Stripe顧客IDを保存（Customer Portal用）
        const customerId = obj.customer || (obj.subscription ? (await getStripe().subscriptions.retrieve(obj.subscription).catch(()=>null))?.customer : null);
        if (customerId) await db.ref(`accounts/${shopId}/stripeCustomerId`).set(customerId);
        console.log(`プラン更新完了: shopId=${shopId} plan=${plan} customerId=${customerId}`);
      }
    }

    // サブスクキャンセル → Freeに戻す
    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object;
      const shopId = sub.metadata?.shopId;
      if (shopId) {
        await db.ref(`accounts/${shopId}/plan`).set("free");
        await db.ref(`accounts/${shopId}/planExpiry`).remove();
        console.log(`プランFreeに戻す: shopId=${shopId}`);
      }
    }

    res.status(200).json({ received: true });
  });

// ============================================================
// Stripe Customer Portal セッション作成（請求管理・解約）
// ============================================================
exports.createPortalSession = functions
  .region("asia-northeast1")
  .runWith({ secrets: ["STRIPE_SECRET_KEY"] })
  .https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).send("Method Not Allowed"); return; }

    const { shopId, returnUrl } = req.body;
    if (!shopId) { res.status(400).json({ error: "shopId は必須です" }); return; }

    // FirebaseからStripe顧客IDを取得
    const snap = await db.ref(`accounts/${shopId}/stripeCustomerId`).once("value");
    const customerId = snap.val();
    if (!customerId) {
      res.status(404).json({ error: "決済情報が見つかりません。まずプランを購入してください。" });
      return;
    }

    const stripe = getStripe();
    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl || "https://shiftyshifty.app/",
      });
      res.status(200).json({ url: session.url });
    } catch (e) {
      console.error("Portal session作成失敗:", e);
      res.status(500).json({ error: e.message });
    }
  });
