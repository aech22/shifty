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

// デモ店舗（クライアントの #/demo が読み込む固定店舗）。
// この店舗は owners を持たない状態で運用するため、下の verifyShopOwner の
// 「未claim店舗は許可」という移行猶予をそのまま通過してしまう。デモURLは広告から
// 誰でも開けるので、課金系のエンドポイントだけは shopId で明示的に拒否する
// （クライアント側の DEMO_MODE 判定は、直接POSTされれば無いのと同じ）。
const DEMO_SHOP_IDS = ["demo-toriMatsu-v1"];
function isDemoShop(shopId) { return DEMO_SHOP_IDS.includes(shopId); }

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
    if (isDemoShop(shopId)) { res.status(403).json({ error: "デモ店舗では購入のお手続きはできません。" }); return; }

    const auth = await verifyShopOwner(req, shopId);
    if (!auth.ok) { res.status(auth.status).json({ error: auth.error }); return; }

    // 既に有効な契約がある店舗に新しい契約を作らせない。これを許すと1店舗が2契約を持ち、
    // 更新・解約イベントがどちらの契約のものか判別できなくなる（旧実装の二重課金の原因）。
    // プランの変更は契約を作り直さずに changePlan（subscriptions.update）で行う。
    const existingSub = await findActiveSubscription(shopId);
    if (existingSub) {
      res.status(409).json({
        error: "すでに有効な契約があります。プランの変更はマイページの「プランを変更」からお手続きください。",
        code: "already_subscribed",
        currentPlan: planOfSubscription(existingSub),
      });
      return;
    }

    const priceId = plan === "premium" ? STRIPE_PRICES.premium_monthly : STRIPE_PRICES.pro_monthly;
    const stripe = getStripe();

    try {
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [{ price: priceId, quantity: 1 }],
        metadata: { shopId, plan },
        // Stripeは Checkout Session の metadata を、そこで作られる Subscription へコピーしない。
        // 更新・失敗・解約のWebhookイベントが参照するのは Subscription 側のmetadataなので、
        // ここで明示的に付けないと初回チェックアウト以降そのイベントから店舗を特定できなくなる。
        subscription_data: { metadata: { shopId, plan } },
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
// プラン変更（Pro ⇄ Premium）
//
// 契約を作り直さず、既存 subscription の price を差し替える。これにより
// 「1店舗＝1契約」が構造的に保証され、二重課金が起こりようがなくなる。
//
// アップグレード（Pro→Premium）: 即時反映 + 差額を即請求（always_invoice）。
//   押した瞬間に上位機能が使えないとアップグレードの意味がないため。差額のみの
//   請求で、二重取りにはならない。
// ダウングレード（Premium→Pro）: 期間終了時に切替（Subscription Schedule）。
//   利用規約が日割り返金なしのため、支払い済みの期間は上位プランのまま使える
//   のが筋。即時に落とすと「金は返さないが機能は取り上げる」形になる。
// ============================================================
exports.changePlan = functions
  .region("asia-northeast1")
  .runWith({ secrets: ["STRIPE_SECRET_KEY"] })
  .https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).send("Method Not Allowed"); return; }

    const { shopId, plan } = req.body || {};
    if (!shopId || !plan) { res.status(400).json({ error: "shopId, plan は必須です" }); return; }
    if (plan !== "pro" && plan !== "premium") { res.status(400).json({ error: "plan は pro または premium を指定してください" }); return; }
    if (isDemoShop(shopId)) { res.status(403).json({ error: "デモ店舗ではプラン変更のお手続きはできません。" }); return; }

    const auth = await verifyShopOwner(req, shopId);
    if (!auth.ok) { res.status(auth.status).json({ error: auth.error }); return; }

    const stripe = getStripe();
    try {
      const sub = await findActiveSubscription(shopId);
      if (!sub) {
        res.status(409).json({ error: "有効な契約が見つかりません。新規のお申し込みからお手続きください。", code: "no_subscription" });
        return;
      }
      const currentPlan = planOfSubscription(sub);
      if (currentPlan === plan) {
        res.status(400).json({ error: "すでにそのプランをご利用中です。", code: "same_plan" });
        return;
      }
      const newPrice = plan === "premium" ? STRIPE_PRICES.premium_monthly : STRIPE_PRICES.pro_monthly;
      const itemId = sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].id;
      if (!itemId) {
        res.status(500).json({ error: "契約明細を取得できませんでした。時間をおいてお試しください。" });
        return;
      }

      // 現行プランが未知（Priceを差し替え済み等）の場合は序列比較ができないので、
      // 安全側に倒して即時アップグレード扱いにはせず、エラーにする
      if (planRank(currentPlan) < 0) {
        console.error(`現行プランを判定できません: shopId=${shopId} sub=${sub.id}`);
        res.status(409).json({ error: "現在のプランを判定できませんでした。お問い合わせください。", code: "unknown_current_plan" });
        return;
      }

      if (planRank(plan) > planRank(currentPlan)) {
        // --- アップグレード: 即時反映 + 差額請求 ---
        await stripe.subscriptions.update(sub.id, {
          items: [{ id: itemId, price: newPrice }],
          proration_behavior: "always_invoice",
          metadata: { ...(sub.metadata || {}), shopId, plan },
        });
        // Webhook(customer.subscription.updated)でも同じ値が入るが、押した直後に画面へ
        // 反映されるようここでも書く（Stripe側の設定変更に依存させないため）
        await db.ref(`accounts/${shopId}`).update({
          plan, stripeSubscriptionId: sub.id, scheduledPlan: null, scheduledPlanDate: null,
        });
        console.log(`プラン変更(即時アップグレード): shopId=${shopId} ${currentPlan}→${plan} sub=${sub.id}`);
        res.status(200).json({ ok: true, applied: "immediate", plan });
        return;
      }

      // --- ダウングレード: 期間終了時に切替 ---
      // Subscription Schedule で「現在の期間は現行price」「以降は新price」の2フェーズにする。
      // end_behavior:"release" により、切替後はスケジュールを離れて通常の契約として継続する。
      let schedule;
      if (sub.schedule) {
        schedule = await stripe.subscriptionSchedules.retrieve(
          typeof sub.schedule === "string" ? sub.schedule : sub.schedule.id
        );
      } else {
        schedule = await stripe.subscriptionSchedules.create({ from_subscription: sub.id });
      }
      const cur = schedule.phases[schedule.phases.length - 1];
      const curPrice = cur.items[0].price;
      try {
        await stripe.subscriptionSchedules.update(schedule.id, {
          end_behavior: "release",
          phases: [
            { items: [{ price: typeof curPrice === "string" ? curPrice : curPrice.id, quantity: 1 }],
              start_date: cur.start_date, end_date: cur.end_date,
              metadata: { shopId, plan: currentPlan } },
            // フェーズのmetadataは、そのフェーズが始まったときに契約のmetadataへ反映される。
            // 切替後の契約が「plan=変更前」を持ち続けないようにするための多重防御
            // （本命の対策は resolveShopMeta が price からプランを解決すること）。
            { items: [{ price: newPrice, quantity: 1 }], metadata: { shopId, plan } },
          ],
          metadata: { shopId, plan },
        });
      } catch (e) {
        // フェーズ更新に失敗すると、契約には「現状をなぞるだけのスケジュール」が
        // 貼り付いたまま残る。解約や次のプラン変更の妨げになるため、自分が新規作成した
        // ときに限って release して元の状態へ戻す（既存のスケジュールには触らない）。
        if (!sub.schedule) {
          await stripe.subscriptionSchedules.release(schedule.id)
            .then(() => console.log(`スケジュールを解放して原状復帰: shopId=${shopId} schedule=${schedule.id}`))
            .catch(re => console.error("スケジュールの解放に失敗:", re.message));
        }
        throw e;
      }
      const effectiveAt = tsToDate(cur.end_date) || tsToDate(periodEndOf(sub));
      // 予約内容は subscription_schedule.* のWebhookでも拾えるが、そのイベント種別は
      // エンドポイントの購読対象に入っていない（2026-08-11時点の購読は5種類）。
      // Stripe側の設定変更に依存させないため、予約はここで直接書く。
      await db.ref(`accounts/${shopId}`).update({
        scheduledPlan: plan, scheduledPlanDate: effectiveAt, stripeSubscriptionId: sub.id,
      });
      console.log(`プラン変更(期間終了時ダウングレード): shopId=${shopId} ${currentPlan}→${plan} 切替日=${effectiveAt} sub=${sub.id}`);
      res.status(200).json({ ok: true, applied: "period_end", plan, effectiveAt });
    } catch (e) {
      console.error("プラン変更失敗:", e);
      res.status(500).json({ error: e.message });
    }
  });

// ============================================================
// Webhookイベント → 対象店舗(shopId)とプランの解決
//
// metadata は checkout.session.completed のときだけイベント本体に載っている。
// 更新(invoice.payment_succeeded)・失敗(invoice.payment_failed)・解約
// (customer.subscription.deleted)のイベント本体には shopId が無いため、
// 次の順で辿る:
//   ① イベント本体の metadata（checkout.session.completed）
//   ② Subscription の metadata（subscription_data.metadata を付けて作った契約）
//   ③ その Subscription を作った Checkout Session の metadata
//      （②の付与より前に作られた既存契約の救済。Stripeは①のmetadataを②へコピーしない）
// ============================================================
function subscriptionIdOf(obj) {
  if (!obj) return null;
  if (obj.object === "subscription" && obj.id) return obj.id;
  if (typeof obj.subscription === "string") return obj.subscription;
  if (obj.subscription && obj.subscription.id) return obj.subscription.id;
  // 新しいAPIバージョンの Invoice は subscription 参照が parent 配下に移っている
  const pd = obj.parent && obj.parent.subscription_details;
  if (pd) {
    if (typeof pd.subscription === "string") return pd.subscription;
    if (pd.subscription && pd.subscription.id) return pd.subscription.id;
  }
  return null;
}

async function resolveShopMeta(obj) {
  const md = obj && obj.metadata;
  if (md && md.shopId) {
    // 対象が Subscription 本体（customer.subscription.updated / .deleted）のときは、
    // プランを metadata ではなく **契約の実際のprice** から解決する。下の retrieve 経路と同じ理由で、
    // 期間終了時ダウングレード（Subscription Schedule）は price だけを差し替えるため
    // metadata.plan が変更前のまま残りうる。ここで metadata を信じると、
    // customer.subscription.deleted のプラン照合が食い違って解約が握り潰され、
    // 契約が消えた後も有料プランのまま残る（以後イベントが来ないので自動回復しない）。
    const livePlan = planOfSubscription(obj);
    return { shopId: md.shopId, plan: livePlan || md.plan || null };
  }

  const subId = subscriptionIdOf(obj);
  if (!subId) return { shopId: null, plan: null };
  const stripe = getStripe();

  try {
    const sub = await stripe.subscriptions.retrieve(subId);
    if (sub && sub.metadata && sub.metadata.shopId) {
      // プランは metadata ではなく **契約の実際のprice** から解決する。
      // 期間終了時ダウングレード（Subscription Schedule）は price だけを差し替えるため、
      // metadata.plan は変更前のプランのまま残る。metadata を信じると、切替後の最初の
      // 更新請求で「上位プランへの更新」と誤判定して降格を巻き戻してしまう
      // （2026-08-11 の実購入テストで、Premium→Pro 予約後の契約に plan:premium が
      //   残っていることを実データで確認した）。
      const livePlan = planOfSubscription(sub);
      return { shopId: sub.metadata.shopId, plan: livePlan || sub.metadata.plan || null };
    }
  } catch (e) {
    console.error("subscription取得失敗:", e.message);
  }

  try {
    const sessions = await stripe.checkout.sessions.list({ subscription: subId, limit: 1 });
    const s = sessions && sessions.data && sessions.data[0];
    if (s && s.metadata && s.metadata.shopId) {
      return { shopId: s.metadata.shopId, plan: s.metadata.plan || null };
    }
  } catch (e) {
    console.error("checkout session逆引き失敗:", e.message);
  }

  console.error(`shopIdを解決できませんでした: subscription=${subId}`);
  return { shopId: null, plan: null };
}

// プランの序列。更新イベントが現行プランを引き下げていないかの判定に使う。
const PLAN_RANK = { free: 0, pro: 1, premium: 2 };
function planRank(p) {
  return Object.prototype.hasOwnProperty.call(PLAN_RANK, p) ? PLAN_RANK[p] : -1;
}
// Pro→Premium のアップグレードは「別の契約を新規作成する」方式のため、旧Proを解約する
// までは1店舗が2つの契約を同時に持つ（アプリ内に旧Proの解約導線が無い）。この状態では
// 旧Proの毎月の更新請求が成功するたびに invoice.payment_succeeded が届くため、
// 無条件に反映すると支払い済みのPremiumが毎月Proへ引き下げられる。
// 明示的な購入(checkout.session.completed)は常に反映し、更新イベントだけは
// 現行プランより下位のときに限って無視する（＝ダウングレードは購入経由でのみ起こる）。
function shouldApplyRenewalPlan(currentPlan, incomingPlan) {
  const inc = planRank(incomingPlan);
  if (inc < 0) return false;              // 未知のプラン名は書かない
  const cur = planRank(currentPlan);
  if (cur < 0) return true;               // 現行プランが未設定・不正なら反映する
  return inc >= cur;
}

// Price ID → プラン名。契約が「いまどのプランか」の唯一の真実はStripe側のpriceなので、
// プラン変更後の状態はメタデータではなくここから解決する。
function planOfPriceId(priceId) {
  if (priceId === STRIPE_PRICES.premium_monthly) return "premium";
  if (priceId === STRIPE_PRICES.pro_monthly) return "pro";
  return null;
}
function planOfSubscription(sub) {
  const item = sub && sub.items && sub.items.data && sub.items.data[0];
  return item && item.price ? planOfPriceId(item.price.id) : null;
}
// 新しいAPIバージョンでは current_period_end が subscription item 配下へ移っているため両方見る
function periodEndOf(sub) {
  if (!sub) return null;
  if (sub.current_period_end) return sub.current_period_end;
  const item = sub.items && sub.items.data && sub.items.data[0];
  return (item && item.current_period_end) || null;
}
// Cloud Functions のサーバー時刻はUTCのため、日付だけを取り出すと JST 9:00〜24:00 の
// 出来事が前日として記録される（2026-08-11 の実購入テストで planExpiry が1日巻き戻った）。
// アプリの表示はすべて日本時間が前提なので、日付へ落とすときは必ずJSTへ寄せてから切る。
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
function toJstDateStr(d) {
  return new Date(d.getTime() + JST_OFFSET_MS).toISOString().split("T")[0];
}
function tsToDate(ts) {
  return ts ? toJstDateStr(new Date(ts * 1000)) : null;
}

// 店舗の「いま有効な契約」を1本だけ返す。プラン変更(changePlan)と、
// 新規契約の二重作成防止(createCheckoutSession)の両方がこれを基準にする。
const LIVE_SUB_STATUSES = ["active", "trialing", "past_due", "unpaid"];
async function findActiveSubscription(shopId) {
  const acct = (await db.ref(`accounts/${shopId}`).once("value")).val() || {};
  const stripe = getStripe();
  // 追跡中のsubscription IDを優先（プラン変更で契約が入れ替わらない前提を守るため）
  if (acct.stripeSubscriptionId) {
    try {
      const s = await stripe.subscriptions.retrieve(acct.stripeSubscriptionId);
      if (s && LIVE_SUB_STATUSES.includes(s.status)) return s;
    } catch (e) {
      console.warn("追跡中subscriptionの取得失敗:", e.message);
    }
  }
  if (!acct.stripeCustomerId) return null;
  try {
    const list = await stripe.subscriptions.list({ customer: acct.stripeCustomerId, status: "all", limit: 20 });
    const live = (list.data || []).filter(s => s && LIVE_SUB_STATUSES.includes(s.status));
    // 同じ店舗のmetadataを持つものを優先し、無ければ最初の有効契約
    return live.find(s => s.metadata && s.metadata.shopId === shopId) || live[0] || null;
  } catch (e) {
    console.error("subscription一覧の取得失敗:", e.message);
    return null;
  }
}

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
      const { shopId, plan } = await resolveShopMeta(obj);

      if (shopId && plan) {
        // 更新（invoice.payment_succeeded）は、同じ店舗が持つ別契約の請求である可能性がある。
        // 現行プランより下位なら反映しない（stripeCustomerIdも上書きしない＝Customer Portalが
        // 上位プランの顧客を指したままになる）。
        let apply = true;
        if (event.type === "invoice.payment_succeeded") {
          const currentPlan = (await db.ref(`accounts/${shopId}/plan`).once("value")).val();
          apply = shouldApplyRenewalPlan(currentPlan, plan);
          if (!apply) console.log(`現行プラン(${currentPlan})より下位の契約(${plan})の更新のため反映しない: shopId=${shopId}`);
        }
        if (apply) {
          // JSTの「今日」から1ヶ月後。UTCのまま計算すると JST午前9時以降の購入で1日短くなる
          const expiry = new Date(Date.now() + JST_OFFSET_MS);
          expiry.setUTCMonth(expiry.getUTCMonth() + 1);
          await db.ref(`accounts/${shopId}/plan`).set(plan);
          await db.ref(`accounts/${shopId}/planExpiry`).set(expiry.toISOString().split("T")[0]); // 既にJSTへ寄せた値
          // Stripe顧客IDを保存（Customer Portal用）
          const subId = subscriptionIdOf(obj);
          const customerId = obj.customer || (subId ? (await getStripe().subscriptions.retrieve(subId).catch(()=>null))?.customer : null);
          if (customerId) await db.ref(`accounts/${shopId}/stripeCustomerId`).set(customerId);
          // subscription ID も保存する。findActiveSubscription がこれを起点に「その店舗の契約」を
          // 一意に特定できるようにし、プラン変更が別契約を掴むことを防ぐ。
          if (subId) await db.ref(`accounts/${shopId}/stripeSubscriptionId`).set(subId);
          // 新規契約・アップグレード直後は解約予約・変更予約が無い状態なので、古い表示を残さない
          await db.ref(`accounts/${shopId}`).update({ cancelAtPeriodEnd: null, scheduledPlan: null, scheduledPlanDate: null });
          console.log(`プラン更新完了: shopId=${shopId} plan=${plan} customerId=${customerId}`);
        }
      }
    }

    // 決済失敗 → 警告フラグを立てる（即時ダウングレードはしない。Smart Retriesで回復したら解除）
    if (event.type === "invoice.payment_failed") {
      const obj = event.data.object;
      const { shopId } = await resolveShopMeta(obj);
      if (shopId) {
        await db.ref(`accounts/${shopId}/paymentFailed`).set(true);
        console.log(`決済失敗フラグ: shopId=${shopId}`);
      }
    }

    // 決済成功（更新）→ 失敗フラグを解除
    if (event.type === "invoice.payment_succeeded") {
      const obj = event.data.object;
      const { shopId } = await resolveShopMeta(obj);
      if (shopId) {
        await db.ref(`accounts/${shopId}/paymentFailed`).remove();
      }
    }

    // 契約の変更 → 解約予約・プラン変更予約の状態をアプリへ反映する
    //
    // これを処理しないと、ユーザーがカスタマーポータルで解約しても（Stripeは「期間終了時に
    // 解約」として customer.subscription.updated を送るだけなので）アプリの表示が一切変わらず、
    // 解約が効いていないように見える（2026-08-11 の実購入テストで確認）。
    // プランの降格そのものは従来どおり customer.subscription.deleted で行い、
    // ここでは「いつ終わるか」「いつ何に変わるか」だけを保存する。
    if (event.type === "customer.subscription.updated") {
      const sub = event.data.object;
      const { shopId } = await resolveShopMeta(sub);
      if (shopId) {
        // 追跡中の契約と異なるものは無視する（万一2契約が並存しても表示を壊さない多重防御）
        const tracked = (await db.ref(`accounts/${shopId}/stripeSubscriptionId`).once("value")).val();
        if (tracked && sub.id && tracked !== sub.id) {
          console.log(`追跡中(${tracked})と異なる契約(${sub.id})の更新のため無視: shopId=${shopId}`);
        } else {
          const updates = {
            cancelAtPeriodEnd: sub.cancel_at_period_end ? true : null,
            currentPeriodEnd: tsToDate(periodEndOf(sub)),
          };
          if (!tracked && sub.id) updates.stripeSubscriptionId = sub.id;
          // 現在有効なプランはStripeのpriceが唯一の真実。アップグレードの即時反映も、
          // スケジュールされたダウングレードが期間終了時に発火したときも、ここで追随する。
          const livePlan = planOfSubscription(sub);
          if (livePlan && LIVE_SUB_STATUSES.includes(sub.status)) updates.plan = livePlan;
          await db.ref(`accounts/${shopId}`).update(updates);
          console.log(`契約更新: shopId=${shopId} plan=${livePlan} 解約予約=${!!sub.cancel_at_period_end} 期間終了=${updates.currentPeriodEnd}`);
        }
      }
    }

    // プラン変更の予約（ダウングレードのSubscription Schedule）→ 予約内容をアプリへ反映する
    if (event.type === "subscription_schedule.updated" || event.type === "subscription_schedule.created") {
      const sch = event.data.object;
      const shopId = sch && sch.metadata && sch.metadata.shopId;
      const plan = sch && sch.metadata && sch.metadata.plan;
      if (shopId && plan) {
        const phases = sch.phases || [];
        const next = phases.length > 1 ? phases[phases.length - 1] : null;
        await db.ref(`accounts/${shopId}`).update({
          scheduledPlan: plan,
          scheduledPlanDate: tsToDate(next && next.start_date),
        });
        console.log(`プラン変更予約: shopId=${shopId} → ${plan} 切替日=${tsToDate(next && next.start_date)}`);
      }
    }

    // 予約が完了・解除された → 予約表示を消す
    if (event.type === "subscription_schedule.released" || event.type === "subscription_schedule.canceled"
        || event.type === "subscription_schedule.completed") {
      const sch = event.data.object;
      const shopId = sch && sch.metadata && sch.metadata.shopId;
      if (shopId) {
        await db.ref(`accounts/${shopId}`).update({ scheduledPlan: null, scheduledPlanDate: null });
        console.log(`プラン変更予約を解除: shopId=${shopId} (${event.type})`);
      }
    }

    // サブスクキャンセル → Freeに戻す
    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object;
      const { shopId, plan } = await resolveShopMeta(sub);
      if (shopId) {
        // Pro→Premiumのアップグレードは「別のサブスクを新規作成する」方式のため、
        // 1店舗が同時に2つの契約を持つ状態が起こりうる。あとから旧Proを解約したときに
        // 無条件でFreeに落とすと、支払い済みのPremiumごと剥奪してしまう。
        // 解約された契約のプランが現行プランと食い違う場合は、別契約の解約とみなして何もしない。
        // （プランが特定できない古い契約は従来どおりダウングレードする＝安全側の既定動作）
        // なお createCheckoutSession が有効契約のある店舗を409で拒否するようになった今、
        // 1店舗2契約は構造的に作れない。それでもこのガードを残すのは多重防御としてであり、
        // resolveShopMeta が price からプランを解決するようになったことで
        // 「metadataが古いだけで解約が握り潰される」誤爆はなくなっている。
        const currentPlan = (await db.ref(`accounts/${shopId}/plan`).once("value")).val();
        if (plan && currentPlan && plan !== currentPlan) {
          console.log(`現行プラン(${currentPlan})と異なる契約(${plan})の解約のためダウングレードしない: shopId=${shopId}`);
        } else {
          await db.ref(`accounts/${shopId}/plan`).set("free");
          await db.ref(`accounts/${shopId}/planExpiry`).remove();
          // 契約が消えた以上、解約予約・プラン変更予約・追跡中subscriptionの表示は残さない
          // （stripeCustomerId は Customer Portal と再契約のために残す）
          await db.ref(`accounts/${shopId}`).update({
            cancelAtPeriodEnd: null, currentPeriodEnd: null,
            scheduledPlan: null, scheduledPlanDate: null, stripeSubscriptionId: null,
          });
          console.log(`プランFreeに戻す: shopId=${shopId}`);
        }
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
    if (isDemoShop(shopId)) { res.status(403).json({ error: "デモ店舗では請求管理をご利用いただけません。" }); return; }

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
    const skipped = [];
    for (const shopId of shopIds) {
      // デモ店舗は owners を持たないため下の未claim分岐を通ってしまう。誰でも開ける
      // デモURLから自分の企業のオーナーにされないよう、連携対象から外す
      if (isDemoShop(shopId)) continue;
      const ownersSnap = await db.ref(`shops/${shopId}/owners`).once("value");
      const owners = ownersSnap.val();
      // オーナーとして登録済みの店舗だけを連携する。
      // 以前は「未claim(owners無し)」も許可していたが、shopIdはスタッフURLのtokens逆引きから
      // 誰でも辿れるうえ、店舗を開いただけで accounts/{uid}/shops に載る経路があるため、
      // 「先に触った人がオーナーになれる」窓が開いていた（バグチェック#67・デモ店舗で実際に到達）。
      // 未claim店舗は、その店舗の管理者画面を一度開いて claim してから
      // 管理コードで linkStoreToCompany を使う。
      if (!owners || !owners[uid]) { skipped.push(shopId); continue; }
      await db.ref(`companies/${companyId}/pub/shops/${shopId}`).set(true);
      await registerCompanyAsOwner(companyId, shopId);
      linked.push(shopId);
    }
    return { companyId, code, name, linkedShops: linked, skippedShops: skipped };
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
    // デモ店舗は未claimのまま運用するため、下の allowed = !owners を素通りしてしまう
    if (isDemoShop(shopId)) throw new functions.https.HttpsError("permission-denied", "デモ店舗は企業アカウントに連携できません");
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
    // 未claim(owners無し)を無条件で許可しない。shopIdは誰でも辿れるので、それだけを根拠に
    // オーナーになれると「先に触った人がオーナーになれる」窓が残る（バグチェック#65・#67）。
    if (!owners) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "この店舗はまだ管理者端末が登録されていません。先に店舗の管理者画面を開いてから、管理コード（店舗コード.管理キー）で連携してください"
      );
    }
    let allowed = false;
    if (owners[callerUid]) allowed = true;                   // 呼び出し元が既にこの店舗のオーナー
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
    // 企業ログインのセッションで作った店舗はオーナーが企業uidだけなので、無条件に外すと
    // owners が空＝未claim状態へ戻ってしまう。その状態は「shopIdを知る第三者が
    // 自分の企業のオーナーになれる」窓そのものなので、最後のオーナーは外さない（バグチェック#65）。
    const cUid = companyUid(companyId);
    const owners = (await db.ref(`shops/${shopId}/owners`).once("value")).val() || {};
    const others = Object.keys(owners).filter(u => u !== cUid);
    if (owners[cUid] && others.length === 0) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "この店舗の管理者はこの企業アカウントだけです。解除するとどの端末からも管理できなくなるため、先に別の端末を管理コードで追加してください"
      );
    }
    await db.ref(`companies/${companyId}/pub/shops/${shopId}`).remove();
    await db.ref(`shops/${shopId}/owners/${cUid}`).remove();
    return { ok: true };
  });
