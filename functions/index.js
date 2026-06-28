const functions = require("firebase-functions");
const Stripe = require("stripe");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
if (!admin.apps.length) admin.initializeApp();
const db = admin.database();

// Stripeは関数実行時に初期化（デプロイ解析時にAPIキーが不要）
function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  console.log("STRIPE_SECRET_KEY prefix:", key ? key.substring(0, 12) : "EMPTY");
  return Stripe(key);
}

// Stripe Price ID
const STRIPE_PRICES = {
  pro_monthly:     "price_1TgTwHDjKKQsHl7LRZKClgFc", // Shifty Pro 500円/月（本番）
  premium_monthly: "price_REPLACE_WITH_PREMIUM_PRICE_ID", // Shifty Premium 2,980円/月（要Stripe作成）
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

    console.log("createCheckoutSession called, KEY:", process.env.STRIPE_SECRET_KEY ? process.env.STRIPE_SECRET_KEY.substring(0,12) : "EMPTY");

    const { shopId, plan, successUrl, cancelUrl } = req.body;
    if (!shopId || !plan) { res.status(400).json({ error: "shopId, plan は必須です" }); return; }

    const priceId = plan === "premium" ? STRIPE_PRICES.premium_monthly : STRIPE_PRICES.pro_monthly;
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

    // 決済失敗 → 警告フラグを立てる（即時ダウングレードはしない。Smart Retriesで回復したら解除）
    if (event.type === "invoice.payment_failed") {
      const obj = event.data.object;
      let shopId = obj.metadata?.shopId;
      if (!shopId && obj.subscription) {
        try {
          const sub = await getStripe().subscriptions.retrieve(obj.subscription);
          shopId = sub.metadata?.shopId;
        } catch (e) {
          console.error("subscription取得失敗(payment_failed):", e);
        }
      }
      if (shopId) {
        await db.ref(`accounts/${shopId}/paymentFailed`).set(true);
        console.log(`決済失敗フラグ: shopId=${shopId}`);
      }
    }

    // 決済成功（更新）→ 失敗フラグを解除
    if (event.type === "invoice.payment_succeeded") {
      const obj = event.data.object;
      let shopId = obj.metadata?.shopId;
      if (!shopId && obj.subscription) {
        try {
          const sub = await getStripe().subscriptions.retrieve(obj.subscription);
          shopId = sub.metadata?.shopId;
        } catch (e) {}
      }
      if (shopId) {
        await db.ref(`accounts/${shopId}/paymentFailed`).remove();
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

// ============================================================
// メールアドレス連携用 OTP 送信
// ============================================================
exports.sendEmailOtp = functions
  .region("asia-northeast1")
  .runWith({ secrets: ["SMTP_USER", "SMTP_PASS"] })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "ログインが必要です");
    }
    const email = (data.email || "").trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new functions.https.HttpsError("invalid-argument", "メールアドレスが無効です");
    }

    const uid = context.auth.uid;
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiry = Date.now() + 10 * 60 * 1000; // 10分

    const appUrl = process.env.APP_URL || "https://ontheshift.firebaseapp.com";
    const emailLink = await admin.auth().generateSignInWithEmailLink(email, {
      url: appUrl,
      handleCodeInApp: true,
    });

    await admin.database().ref(`email_otps/${uid}`).set({ code, email, emailLink, expiry });

    const smtpUser = process.env.SMTP_USER;
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: { user: smtpUser, pass: process.env.SMTP_PASS },
    });

    await transporter.sendMail({
      from: `"Shifty" <${smtpUser}>`,
      to: email,
      subject: "Shifty メール連携の確認コード",
      text: `確認コード: ${code}\n\nこのコードは10分間有効です。\nShiftyのアカウント連携画面に入力してください。`,
    });

    return { success: true };
  });

// ============================================================
// メールアドレス連携用 OTP 検証
// ============================================================
exports.verifyEmailOtp = functions
  .region("asia-northeast1")
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "ログインが必要です");
    }
    const uid = context.auth.uid;
    const code = String(data.code || "").trim();

    const snap = await admin.database().ref(`email_otps/${uid}`).once("value");
    const otp = snap.val();

    if (!otp || otp.code !== code || Date.now() > otp.expiry) {
      throw new functions.https.HttpsError("invalid-argument", "確認コードが無効か期限切れです");
    }

    await admin.database().ref(`email_otps/${uid}`).remove();
    return { emailLink: otp.emailLink, email: otp.email };
  });

// ============================================================
// ユーザーアンケート一斉送信（ワンショット・要秘密トークン）
// curl -X POST https://asia-northeast1-ontheshift.cloudfunctions.net/sendSurveyEmails \
//   -H "Content-Type: application/json" \
//   -d '{"token":"SURVEY_SEND_TOKEN"}'
// ============================================================
exports.sendSurveyEmails = functions
  .region("asia-northeast1")
  .runWith({ secrets: ["SMTP_USER", "SMTP_PASS", "SURVEY_SEND_TOKEN"], timeoutSeconds: 300 })
  .https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).send("Method Not Allowed"); return; }

    // トークン認証（誰でも叩けないように）
    const { token } = req.body;
    if (!token || token !== process.env.SURVEY_SEND_TOKEN) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const MANAGER_FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLSczQWvAMCkS_otEVWW14NkFDHbz7DuzU_Fv_qRm-P9o0GGpWA/viewform";

    const smtpUser = process.env.SMTP_USER || "shifty.app@gmail.com";
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: { user: smtpUser, pass: process.env.SMTP_PASS },
    });

    // Firebase Auth の全ユーザーをページネーションで取得
    const results = { sent: [], skipped: [], failed: [] };
    let nextPageToken;

    do {
      const listResult = await admin.auth().listUsers(1000, nextPageToken);
      nextPageToken = listResult.pageToken;

      for (const user of listResult.users) {
        if (!user.email) { results.skipped.push(user.uid); continue; }

        try {
          await transporter.sendMail({
            from: `"Shifty" <${smtpUser}>`,
            to: user.email,
            subject: "【Shifty】サービス改善のためアンケートにご協力ください（3〜5分）",
            text: [
              `${user.displayName || "Shiftyユーザー"} 様`,
              "",
              "いつもShiftyをご利用いただきありがとうございます。",
              "より良いサービスにするため、3〜5分ほどのアンケートにご協力いただけますか？",
              "匿名・謝礼なしで、お気軽にご回答いただけます。",
              "",
              "▼ アンケートはこちら（店長・管理者向け）",
              MANAGER_FORM_URL,
              "",
              "---",
              "Shifty（シフティ）",
              "https://shiftyshifty.app",
              "配信停止をご希望の場合はこのメールに返信してください。",
            ].join("\n"),
            html: `
              <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1a2e">
                <p>${user.displayName || "Shiftyユーザー"} 様</p>
                <p>いつもShiftyをご利用いただきありがとうございます。<br>
                より良いサービスにするため、<strong>3〜5分ほどのアンケート</strong>にご協力いただけますか？<br>
                匿名・謝礼なしで、お気軽にご回答いただけます。</p>
                <p style="margin:24px 0">
                  <a href="${MANAGER_FORM_URL}"
                     style="display:inline-block;padding:12px 24px;background:#f87036;color:white;border-radius:8px;text-decoration:none;font-weight:bold">
                    アンケートに回答する
                  </a>
                </p>
                <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
                <p style="font-size:12px;color:#6b7280">
                  Shifty（シフティ）｜ <a href="https://shiftyshifty.app">shiftyshifty.app</a><br>
                  配信停止をご希望の場合はこのメールに返信してください。
                </p>
              </div>
            `,
          });
          results.sent.push(user.email);
          console.log(`送信完了: ${user.email}`);
        } catch (e) {
          console.error(`送信失敗: ${user.email}`, e.message);
          results.failed.push(user.email);
        }

        // Gmail レート制限対策（100通/秒上限）
        await new Promise(r => setTimeout(r, 200));
      }
    } while (nextPageToken);

    console.log(`完了: 送信${results.sent.length}件 スキップ${results.skipped.length}件 失敗${results.failed.length}件`);
    res.status(200).json({
      message: "完了",
      sent: results.sent.length,
      skipped: results.skipped.length,
      failed: results.failed.length,
      failedEmails: results.failed,
    });
  });
