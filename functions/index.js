const functions = require("firebase-functions");
const Stripe = require("stripe");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
if (!admin.apps.length) admin.initializeApp();
const db = admin.database();

// ============================================================
// 企業アカウント: パスワードハッシュ（scrypt・追加依存なし）
// 形式: "salt(hex):hash(hex)"。平文はDBに保存しない。
// ============================================================
function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(plain), salt, 64).toString("hex");
  return `${salt}:${hash}`;
}
function verifyPassword(plain, stored) {
  if (typeof stored !== "string" || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  const cand = crypto.scryptSync(String(plain), salt, 64).toString("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(cand, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
// 企業ログイン用の安定uid（カスタムトークン）
function companyUid(companyId) { return `company_${companyId}`; }
// 定数時間の文字列比較（adminKey照合用）。長さが違う・空文字は無条件で不一致にする
function safeEqualStr(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (!a.length || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
// 8桁の企業コード生成（衝突時リトライは呼び出し側）
function genCompanyCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let t = "";
  const arr = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) t += chars[arr[i] % chars.length];
  return t;
}
// 呼び出し元が企業の管理者（作成者本人 or 企業ログインuid）か検証
async function assertCompanyMember(context, companyId) {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "ログインが必要です");
  const uid = context.auth.uid;
  if (uid === companyUid(companyId)) return uid;
  const ownerSnap = await db.ref(`companies/${companyId}/pub/ownerUid`).once("value");
  if (ownerSnap.val() === uid) return uid;
  throw new functions.https.HttpsError("permission-denied", "この企業アカウントの権限がありません");
}
// 企業ログインuidを店舗ownerに登録（Admin SDKでadminKey照合をバイパス）
async function registerCompanyAsOwner(companyId, shopId) {
  const keySnap = await db.ref(`shops/${shopId}/private/adminKey`).once("value");
  let key = keySnap.val();
  if (!key) {
    // 未claim店舗: adminKeyを生成して初回claim扱い
    key = crypto.randomBytes(24).toString("base64").replace(/[^A-Za-z0-9]/g, "").slice(0, 32);
    await db.ref(`shops/${shopId}/private/adminKey`).set(key);
  }
  await db.ref(`shops/${shopId}/owners/${companyUid(companyId)}`).set(key);
}

// Stripeは関数実行時に初期化（デプロイ解析時にAPIキーが不要）
function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  console.log("STRIPE_SECRET_KEY prefix:", key ? key.substring(0, 12) : "EMPTY");
  return Stripe(key);
}

// Stripe Price ID
const STRIPE_PRICES = {
  pro_monthly:     "price_1TgTwHDjKKQsHl7LRZKClgFc", // Shifty Pro 500円/月（本番）
  premium_monthly: "price_1TnOJYDjKKQsHl7LhJxMUbQE", // Shifty Premium 2,980円/月
};

// ============================================================
// Firebase IDトークン検証 + 店舗オーナー照合
// owners未登録（未claim）の店舗は移行猶予として許可する。
// クライアントは匿名認証を含め常にauth済みのため、トークンなしは拒否してよい。
// ============================================================
async function verifyShopOwner(req, shopId) {
  const m = (req.headers.authorization || "").match(/^Bearer (.+)$/);
  if (!m) return { ok: false, status: 401, error: "認証トークンがありません。ページを再読み込みしてお試しください。" };
  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(m[1]);
  } catch (e) {
    return { ok: false, status: 401, error: "認証トークンが無効です。ページを再読み込みしてお試しください。" };
  }
  const ownersSnap = await db.ref(`shops/${shopId}/owners`).once("value");
  const owners = ownersSnap.val();
  if (owners && !owners[decoded.uid]) {
    return { ok: false, status: 403, error: "この店舗の管理者権限がありません。" };
  }
  return { ok: true, uid: decoded.uid };
}

// ============================================================
// Stripe決済セッション作成
// ============================================================
exports.createCheckoutSession = functions
  .region("asia-northeast1")
  .runWith({ secrets: ["STRIPE_SECRET_KEY"] })
  .https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).send("Method Not Allowed"); return; }

    console.log("createCheckoutSession called, KEY:", process.env.STRIPE_SECRET_KEY ? process.env.STRIPE_SECRET_KEY.substring(0,12) : "EMPTY");

    const { shopId, plan, successUrl, cancelUrl } = req.body;
    if (!shopId || !plan) { res.status(400).json({ error: "shopId, plan は必須です" }); return; }

    const auth = await verifyShopOwner(req, shopId);
    if (!auth.ok) { res.status(auth.status).json({ error: auth.error }); return; }

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
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).send("Method Not Allowed"); return; }

    const { shopId, returnUrl } = req.body;
    if (!shopId) { res.status(400).json({ error: "shopId は必須です" }); return; }

    const auth = await verifyShopOwner(req, shopId);
    if (!auth.ok) { res.status(auth.status).json({ error: auth.error }); return; }

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

    const appUrl = process.env.APP_URL || "https://shiftyshifty.app";
    const emailLink = await admin.auth().generateSignInWithEmailLink(email, {
      url: appUrl,
      handleCodeInApp: true,
    });

    await admin.database().ref(`email_otps/${uid}`).set({ code, email, emailLink, expiry, attempts: 0 });

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

    if (!otp || Date.now() > otp.expiry) {
      throw new functions.https.HttpsError("invalid-argument", "確認コードが無効か期限切れです");
    }
    // 総当たり対策: 5回失敗でOTPを無効化（再送信が必要）
    const attempts = (otp.attempts || 0) + 1;
    if (attempts > 5) {
      await admin.database().ref(`email_otps/${uid}`).remove();
      throw new functions.https.HttpsError("resource-exhausted", "試行回数の上限を超えました。確認コードを再送信してください");
    }
    if (otp.code !== code) {
      await admin.database().ref(`email_otps/${uid}/attempts`).set(attempts);
      throw new functions.https.HttpsError("invalid-argument", "確認コードが無効か期限切れです");
    }

    await admin.database().ref(`email_otps/${uid}`).remove();
    return { emailLink: otp.emailLink, email: otp.email };
  });

// ============================================================
// 1年間未更新の店舗を自動アーカイブ（毎日実行・30日猶予後に本削除）
// 旧実装はクライアント側で即時削除していたが、端末時計ズレや壊れた
// lastActivity（Invalid Date）による誤削除リスクがあるため、
// スケジュール実行 + 二段階削除（archived/ 経由）に移行。
//
// 走査起点は /global/shops ではなく /shops 本体にする。/global/shops は
// 店舗コード検索用のインデックスに過ぎず未登録の孤児店舗が存在しうるため、
// インデックス起点だと孤児店舗が永久に削除対象へ入らない（2026-07-09判明）。
// 課金中（pro/premium）の店舗は stripeCustomerId 等の記録を守るため対象外。
// ============================================================
function purgeShopStaleness(id, shopData, globalEntry, now, ONE_YEAR_MS) {
  const raw = (shopData && shopData.lastActivity) || (globalEntry && globalEntry.lastActivity) || (globalEntry && globalEntry.createdAt);
  const t = raw ? new Date(raw).getTime() : NaN;
  if (Number.isNaN(t)) return { stale: false, invalid: true, raw };
  return { stale: now - t >= ONE_YEAR_MS, invalid: false, raw };
}

exports.purgeInactiveShops = functions
  .region("asia-northeast1")
  .pubsub.schedule("every 24 hours")
  .timeZone("Asia/Tokyo")
  .onRun(async () => {
    const now = Date.now();
    const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
    const GRACE_MS = 30 * 24 * 60 * 60 * 1000;

    // 1) 1年未更新かつFreeプランの店舗を archived/shops へ移動（即削除しない）
    const [shopsSnap, globalShopsSnap] = await Promise.all([
      db.ref("shops").once("value"),
      db.ref("global/shops").once("value"),
    ]);
    const allShops = shopsSnap.val() || {};
    const globalShops = globalShopsSnap.val() || {};

    for (const [id, shopData] of Object.entries(allShops)) {
      if (!shopData) continue;

      const planSnap = await db.ref(`accounts/${id}/plan`).once("value");
      const planVal = planSnap.val();
      if (planVal === "pro" || planVal === "premium") continue;

      const globalEntry = globalShops[id];
      const label = (globalEntry && globalEntry.name) || id;
      const { stale, invalid, raw } = purgeShopStaleness(id, shopData, globalEntry, now, ONE_YEAR_MS);
      if (invalid) {
        console.warn(`lastActivityが不正のためスキップ: ${id} (${label}) raw=${raw}`);
        continue;
      }
      if (!stale) continue;

      await db.ref(`archived/shops/${id}`).set({
        shop: globalEntry || { id },
        data: shopData,
        archivedAt: new Date(now).toISOString(),
      });
      await db.ref(`shops/${id}`).remove();
      await db.ref(`global/shops/${id}`).remove();
      await db.ref(`accounts/${id}`).remove();

      const periods = shopData.periods || {};
      for (const period of Object.values(periods)) {
        if (period && period.urlToken) {
          await db.ref(`tokens/${period.urlToken}`).remove();
        }
      }

      console.log(`アーカイブ: ${id} (${label}) lastActivity=${raw}`);
    }

    // 2) アーカイブから30日経過したものを本削除
    const archSnap = await db.ref("archived/shops").once("value");
    const archived = archSnap.val() || {};
    for (const [id, entry] of Object.entries(archived)) {
      const at = entry && entry.archivedAt ? new Date(entry.archivedAt).getTime() : NaN;
      if (Number.isNaN(at)) continue;
      if (now - at < GRACE_MS) continue;
      await db.ref(`archived/shops/${id}`).remove();
      console.log(`アーカイブ期限切れを本削除: ${id}`);
    }

    // 3) 期限切れの inviteCodes / email_otps を削除（期限フィールド欠損も対象）
    const inviteSnap = await db.ref("inviteCodes").once("value");
    const invites = inviteSnap.val() || {};
    for (const [code, entry] of Object.entries(invites)) {
      const exp = entry && entry.expiresAt ? new Date(entry.expiresAt).getTime() : NaN;
      if (Number.isNaN(exp) || now > exp) {
        await db.ref(`inviteCodes/${code}`).remove();
        console.log(`inviteCode期限切れを削除: ${code}`);
      }
    }

    const otpSnap = await db.ref("email_otps").once("value");
    const otps = otpSnap.val() || {};
    for (const [uid, entry] of Object.entries(otps)) {
      const exp = entry && entry.expiry ? Number(entry.expiry) : NaN;
      if (Number.isNaN(exp) || now > exp) {
        await db.ref(`email_otps/${uid}`).remove();
        console.log(`email_otp期限切れを削除: ${uid}`);
      }
    }

    return null;
  });

// ============================================================
// 36ヶ月超のシフト期間データ削除（保存上限④・毎日実行）
// 労基法の帳簿保存義務（3年）に整合させ、期間データの無限増加を止める。
// dry-runで先行リリースし、アプリ内告知のうえ1ヶ月観察してから
// PURGE_OLD_PERIODS_DRY_RUN を false に切り替えて本削除を有効化する
// （BACKLOG.md「セキュリティ強化」タスクと同様の段階リリース）。
//
// 日次スキャンは shops/{id}/periods のみ読み（subsを含まない軽量な部分木）、
// 36ヶ月超の期間が見つかった場合のみ shops/{id}/subs を
// orderByChild("periodId").equalTo(periodId) で絞り込んで読む。
// subs全件読み取りは行わない。
//
// periodIdが現存するどの期間にも紐付かない孤児subsはこのスキャンの対象外
// （endDateという判定基準を持たないため削除しない。孤児"店舗"の掃除は
// purgeInactiveShops側の別の関心事）。
//
// 列挙元は /global/shops（軽量なインデックス）。/global/shops に載っていない
// 孤児店舗はこの期間クリーンアップの対象外（孤児店舗自体はpurgeInactiveShops
// が /shops 起点で別途処理する）。
// ============================================================
const PURGE_OLD_PERIODS_DRY_RUN = true; // 1ヶ月観察後にfalseへ切り替える

function purgeOldPeriodsCutoff(now) {
  const d = new Date(now);
  d.setMonth(d.getMonth() - 36);
  return d.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

exports.purgeOldPeriods = functions
  .region("asia-northeast1")
  .pubsub.schedule("every 24 hours")
  .timeZone("Asia/Tokyo")
  .onRun(async () => {
    const now = Date.now();
    const cutoff = purgeOldPeriodsCutoff(now);

    const globalShopsSnap = await db.ref("global/shops").once("value");
    const globalShops = globalShopsSnap.val() || {};

    for (const shopId of Object.keys(globalShops)) {
      const periodsSnap = await db.ref(`shops/${shopId}/periods`).once("value");
      const periods = periodsSnap.val() || {};

      for (const [periodId, period] of Object.entries(periods)) {
        if (!period || !period.endDate || Number.isNaN(Date.parse(period.endDate))) {
          console.warn(`endDateが不正のためスキップ: shop=${shopId} period=${periodId}`);
          continue;
        }
        if (period.endDate >= cutoff) continue; // 36ヶ月以内は対象外

        const subsSnap = await db.ref(`shops/${shopId}/subs`)
          .orderByChild("periodId").equalTo(periodId).once("value");
        const subCount = subsSnap.numChildren();

        if (PURGE_OLD_PERIODS_DRY_RUN) {
          console.log(`[dry-run] 削除対象: shop=${shopId} period=${periodId} (endDate=${period.endDate}) subs=${subCount}件`);
          continue;
        }

        const subUpdates = {};
        subsSnap.forEach((child) => { subUpdates[child.key] = null; });
        if (Object.keys(subUpdates).length > 0) {
          await db.ref(`shops/${shopId}/subs`).update(subUpdates);
        }
        if (period.urlToken) {
          await db.ref(`tokens/${period.urlToken}`).remove();
        }
        await db.ref(`shops/${shopId}/periods/${periodId}`).remove();
        console.log(`削除: shop=${shopId} period=${periodId} (endDate=${period.endDate}) subs=${subCount}件`);
      }
    }

    return null;
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

// ============================================================
// 企業アカウント Cloud Functions
// ============================================================

// 企業アカウント作成（メール/グーグルでログイン済みの本人が実行）
// name: 企業名, password: 企業ログイン用パスワード, shopIds: 連携する既存店舗（作成者がオーナーの店舗）
exports.createCompany = functions
  .region("asia-northeast1")
  .https.onCall(async (data, context) => {
    if (!context.auth || context.auth.token.firebase.sign_in_provider === "anonymous") {
      throw new functions.https.HttpsError("unauthenticated", "メールまたはGoogleでログインしてください");
    }
    const uid = context.auth.uid;
    const name = (data && typeof data.name === "string") ? data.name.trim() : "";
    const password = (data && typeof data.password === "string") ? data.password : "";
    const shopIds = (data && Array.isArray(data.shopIds)) ? data.shopIds.filter(s => typeof s === "string").slice(0, 50) : [];
    if (!name || name.length > 100) throw new functions.https.HttpsError("invalid-argument", "企業名が無効です");
    if (password.length < 6 || password.length > 128) throw new functions.https.HttpsError("invalid-argument", "パスワードは6〜128文字にしてください");

    // 企業コードを衝突しないよう生成
    let code = "";
    for (let attempt = 0; attempt < 8; attempt++) {
      const c = genCompanyCode();
      const exists = await db.ref(`companyCodes/${c}`).once("value");
      if (!exists.exists()) { code = c; break; }
    }
    if (!code) throw new functions.https.HttpsError("internal", "企業コードの生成に失敗しました");

    const companyId = db.ref("companies").push().key;
    await db.ref(`companies/${companyId}/pub`).set({
      name, code, ownerUid: uid, createdAt: new Date().toISOString(),
    });
    await db.ref(`companies/${companyId}/private/passwordHash`).set(hashPassword(password));
    await db.ref(`companyCodes/${code}`).set(companyId);
    // 作成者本人が次回ログイン時に企業情報を復元できるようポインタを保存
    await db.ref(`accounts/${uid}/company`).set({ companyId, code, name });

    // 連携店舗: 作成者がオーナーの店舗のみ登録し、企業ログインuidをownerに追加
    const linked = [];
    for (const shopId of shopIds) {
      const ownersSnap = await db.ref(`shops/${shopId}/owners`).once("value");
      const owners = ownersSnap.val();
      // 未claim(owners無し) または 作成者がオーナー の店舗のみ
      if (owners && !owners[uid]) continue;
      await db.ref(`companies/${companyId}/pub/shops/${shopId}`).set(true);
      await registerCompanyAsOwner(companyId, shopId);
      linked.push(shopId);
    }
    return { companyId, code, name, linkedShops: linked };
  });

// 企業コード＋パスワードでログイン → カスタムトークンを発行
exports.companyLogin = functions
  .region("asia-northeast1")
  .https.onCall(async (data, context) => {
    const code = (data && typeof data.code === "string") ? data.code.trim().toUpperCase() : "";
    const password = (data && typeof data.password === "string") ? data.password : "";
    if (!code || !password) throw new functions.https.HttpsError("invalid-argument", "企業コードとパスワードを入力してください");

    const idSnap = await db.ref(`companyCodes/${code}`).once("value");
    const companyId = idSnap.val();
    if (!companyId) throw new functions.https.HttpsError("not-found", "企業コードまたはパスワードが正しくありません");
    const hashSnap = await db.ref(`companies/${companyId}/private/passwordHash`).once("value");
    if (!verifyPassword(password, hashSnap.val())) {
      throw new functions.https.HttpsError("permission-denied", "企業コードまたはパスワードが正しくありません");
    }
    const nameSnap = await db.ref(`companies/${companyId}/pub/name`).once("value");
    const token = await admin.auth().createCustomToken(companyUid(companyId), { companyId, kind: "company" });
    return { token, companyId, name: nameSnap.val() || "" };
  });

// 企業パスワード変更（企業ログインuid or 作成者本人）
exports.changeCompanyPassword = functions
  .region("asia-northeast1")
  .https.onCall(async (data, context) => {
    const companyId = (data && typeof data.companyId === "string") ? data.companyId : "";
    const newPassword = (data && typeof data.newPassword === "string") ? data.newPassword : "";
    if (!companyId) throw new functions.https.HttpsError("invalid-argument", "企業IDが無効です");
    if (newPassword.length < 6 || newPassword.length > 128) throw new functions.https.HttpsError("invalid-argument", "パスワードは6〜128文字にしてください");
    await assertCompanyMember(context, companyId);
    await db.ref(`companies/${companyId}/private/passwordHash`).set(hashPassword(newPassword));
    return { ok: true };
  });

// 企業名の変更
exports.renameCompany = functions
  .region("asia-northeast1")
  .https.onCall(async (data, context) => {
    const companyId = (data && typeof data.companyId === "string") ? data.companyId : "";
    const name = (data && typeof data.name === "string") ? data.name.trim() : "";
    if (!companyId || !name || name.length > 100) throw new functions.https.HttpsError("invalid-argument", "企業名が無効です");
    await assertCompanyMember(context, companyId);
    await db.ref(`companies/${companyId}/pub/name`).set(name);
    // 作成者ポインタの表示名も更新
    const ownerSnap = await db.ref(`companies/${companyId}/pub/ownerUid`).once("value");
    if (ownerSnap.val()) await db.ref(`accounts/${ownerSnap.val()}/company/name`).set(name);
    return { ok: true };
  });

// 店舗を企業に連携（企業ログインuidをownerに登録）。shopCodeは "shopId" または "shopId.adminKey"
exports.linkStoreToCompany = functions
  .region("asia-northeast1")
  .https.onCall(async (data, context) => {
    const companyId = (data && typeof data.companyId === "string") ? data.companyId : "";
    const shopId = (data && typeof data.shopId === "string") ? data.shopId.trim() : "";
    const adminKey = (data && typeof data.adminKey === "string") ? data.adminKey.trim() : "";
    if (!companyId || !shopId) throw new functions.https.HttpsError("invalid-argument", "企業ID・店舗コードが無効です");
    const callerUid = await assertCompanyMember(context, companyId);
    const shopSnap = await db.ref(`global/shops/${shopId}`).once("value");
    const shop = shopSnap.val();
    if (!shop || shop.id !== shopId) throw new functions.https.HttpsError("not-found", "店舗コードが正しくありません");
    // 店舗コード(shopId)はスタッフURLのtokens逆引きから誰でも辿れるため、shopIdだけを根拠に
    // registerCompanyAsOwner を呼んではいけない（Admin SDKがadminKey照合をバイパスして
    // owners に登録するため、オーナー権限分離＝管理キー方式がそのまま無効化される）。
    // createCompany 側は同じ理由で owners[uid] を確認している。ここでも同等の証明を要求する。
    const ownersSnap = await db.ref(`shops/${shopId}/owners`).once("value");
    const owners = ownersSnap.val();
    let allowed = !owners;                                  // 未claim店舗（createCompanyと同じ扱い）
    if (!allowed && owners[callerUid]) allowed = true;       // 呼び出し元が既にこの店舗のオーナー
    if (!allowed) {                                          // 企業の作成者本人がオーナー（企業uidで呼んだ場合）
      const ownerUid = (await db.ref(`companies/${companyId}/pub/ownerUid`).once("value")).val();
      if (ownerUid && owners[ownerUid]) allowed = true;
    }
    if (!allowed && adminKey) {                              // 管理コード（shopId.adminKey）を提示した場合
      const stored = (await db.ref(`shops/${shopId}/private/adminKey`).once("value")).val();
      if (safeEqualStr(adminKey, stored)) allowed = true;
    }
    if (!allowed) throw new functions.https.HttpsError("permission-denied", "この店舗の管理コード（店舗コード.管理キー）を入力してください");
    await db.ref(`companies/${companyId}/pub/shops/${shopId}`).set(true);
    await registerCompanyAsOwner(companyId, shopId);
    return { ok: true, name: shop.name || "" };
  });

// 店舗の企業連携を解除（企業ログインuidをownerから外す）
exports.unlinkStoreFromCompany = functions
  .region("asia-northeast1")
  .https.onCall(async (data, context) => {
    const companyId = (data && typeof data.companyId === "string") ? data.companyId : "";
    const shopId = (data && typeof data.shopId === "string") ? data.shopId.trim() : "";
    if (!companyId || !shopId) throw new functions.https.HttpsError("invalid-argument", "企業ID・店舗IDが無効です");
    await assertCompanyMember(context, companyId);
    await db.ref(`companies/${companyId}/pub/shops/${shopId}`).remove();
    await db.ref(`shops/${shopId}/owners/${companyUid(companyId)}`).remove();
    return { ok: true };
  });
