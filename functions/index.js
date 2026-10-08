const functions = require("firebase-functions/v1");
const Stripe = require("stripe");
// firebase-admin 14 で名前空間の書き方（admin の auth・database）が廃止されたので、機能ごとのモジュールから読む（2026-10-08）
const { initializeApp, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getDatabase } = require("firebase-admin/database");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
// 認証まわりの回数の制限と店舗オーナーの判定（純粋関数・tests/security.test.js）
const SEC = require("./security");
if (!getApps().length) initializeApp();
const db = getDatabase();

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
  // 値そのものは出さない（ログに平文が蓄積するため）。読み込めているかとバイト長だけで
  // 「未設定 / 二重ペースト・改行混入による長さ異常」は切り分けられる。
  console.log("STRIPE_SECRET_KEY:", key ? `loaded(${Buffer.byteLength(key)}b)` : "EMPTY");
  return Stripe(key);
}

// Stripe Price ID
const STRIPE_PRICES = {
  pro_monthly:     "price_1TgTwHDjKKQsHl7LRZKClgFc", // Shifty Pro 500円/月（本番）
  premium_monthly: "price_1TnOJYDjKKQsHl7LhJxMUbQE", // Shifty Premium 2,980円/月
};

// デモ店舗（クライアントの #/demo が読み込む固定店舗）。
// この店舗は owners を持たない状態で運用する。下の verifyShopOwner は 2026-10-08 から owners の無い店舗を 403 にするので
// 課金系はそこでも止まるが、デモURLは広告から誰でも開けるので、多重防御として shopId で明示的にも拒否する
// （クライアント側の DEMO_MODE 判定は、直接POSTされれば無いのと同じ）。
const DEMO_SHOP_IDS = ["demo-toriMatsu-v1"];
function isDemoShop(shopId) { return DEMO_SHOP_IDS.includes(shopId); }

// リクエスト本文の shopId を DB パスへ埋め込む前に形を確かめる。isDemoShop より先に通すこと。
// Admin SDK はパスの空セグメントを詰めるため、"demo-toriMatsu-v1/" や配列 ["demo-toriMatsu-v1"] は
// isDemoShop の比較には一致しないのに、DB 上は本物のデモ店舗を読む（バグチェック#125で実測）。
// 禁止文字（. # $ [ ]）は ref() が同期に throw し、onRequest はそれを捕まえないので応答が返らない。
// 正規の shopId は genSecureId の文字種（これらを含まない）なので既存店舗は弾かれない。
function isValidShopId(shopId) {
  return typeof shopId === "string" && shopId.length > 0 && !/[/.#$[\]\x00-\x1f\x7f]/.test(shopId);
}
// companyId は createCompany の push().key だけから生まれるので、その文字種に限る。
// "/C1" は権限チェック（companies//C1/pub/ownerUid → C1）を通る一方、owners には
// "company_" という偽のキーを作り、unlinkStoreFromCompany の「最後のオーナーは外さない」判定が
// それを他のオーナーと数えて素通りする（バグチェック#126で実測）。
function isValidCompanyId(companyId) {
  return typeof companyId === "string" && /^[-0-9A-Za-z_]{1,64}$/.test(companyId);
}
// uid も DB パスのキーになる（owners/{uid}・grants/{shopId}/{uid}）。Auth の uid に
// 禁止文字は入らないが、isValidShopId と同じ多重防御をかけておく。
function isSafeDbKey(k) {
  return typeof k === "string" && k.length > 0 && k.length <= 128 && !/[/.#$[\]\x00-\x1f\x7f]/.test(k);
}

// ============================================================
// Firebase IDトークン検証 + 店舗オーナー照合
// owners に呼び出し元の uid が登録されている店舗だけを許可する。owners が無い（未claim の）店舗も 403。
// 2026-10-08 まではここだけ未claim を「移行猶予」として許可していたが、ルール側の猶予は 2026-07-28（dbdd9d9）に終わっている。
// クライアントは匿名認証を含め常にauth済みのため、トークンなしは拒否してよい。
// ============================================================
async function verifyShopOwner(req, shopId) {
  const m = (req.headers.authorization || "").match(/^Bearer (.+)$/);
  if (!m) return { ok: false, status: 401, error: "認証トークンがありません。ページを再読み込みしてお試しください。" };
  let decoded;
  try {
    decoded = await getAuth().verifyIdToken(m[1]);
  } catch (e) {
    return { ok: false, status: 401, error: "認証トークンが無効です。ページを再読み込みしてお試しください。" };
  }
  const ownersSnap = await db.ref(`shops/${shopId}/owners`).once("value");
  const owners = ownersSnap.val();
  if (!SEC.isShopOwnerOf(owners, decoded.uid)) {
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

    console.log("createCheckoutSession called, KEY:", process.env.STRIPE_SECRET_KEY ? `loaded(${Buffer.byteLength(process.env.STRIPE_SECRET_KEY)}b)` : "EMPTY");

    const { shopId, plan, successUrl, cancelUrl } = req.body;
    if (!shopId || !plan) { res.status(400).json({ error: "shopId, plan は必須です" }); return; }
    // changePlan と同じ検証。ここを通さないと "premium" 以外の値はすべて Pro の price で課金されるのに、
    // metadata.plan には受け取った値がそのまま載り、checkout.session.completed がそれを accounts へ書く
    // （クライアントは未知のプラン名を free に倒すので、Pro を払って Free になる）。
    if (plan !== "pro" && plan !== "premium") { res.status(400).json({ error: "plan は pro または premium を指定してください" }); return; }
    if (!isValidShopId(shopId)) { res.status(400).json({ error: "shopId が不正です" }); return; }
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
    if (!isValidShopId(shopId)) { res.status(400).json({ error: "shopId が不正です" }); return; }
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
// プラン変更の予約（ダウングレード）を取り消す
//
// 有料プランは Pro と Premium の2つしかないため、予約が入っている状態では
// マイページの「プランを変更」の選択肢が現在プランと予約プランで2つとも除外され、
// セクションごと消える。カスタマーポータルにもプラン変更のUIは無いので、
// この関数が無いと **ユーザーは自分で入れた予約から降りられない**。
//
// changePlan は end_behavior:"release" でスケジュールを作っているので、
// release すれば現行priceのまま通常の契約へ戻る（契約は解約されない）。
// ============================================================
exports.cancelPlanChange = functions
  .region("asia-northeast1")
  .runWith({ secrets: ["STRIPE_SECRET_KEY"] })
  .https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).send("Method Not Allowed"); return; }

    const { shopId } = req.body || {};
    if (!shopId) { res.status(400).json({ error: "shopId は必須です" }); return; }
    if (!isValidShopId(shopId)) { res.status(400).json({ error: "shopId が不正です" }); return; }
    if (isDemoShop(shopId)) { res.status(403).json({ error: "デモ店舗ではプラン変更のお手続きはできません。" }); return; }

    const auth = await verifyShopOwner(req, shopId);
    if (!auth.ok) { res.status(auth.status).json({ error: auth.error }); return; }

    const stripe = getStripe();
    try {
      const sub = await findActiveSubscription(shopId);
      if (!sub) {
        res.status(409).json({ error: "有効な契約が見つかりません。", code: "no_subscription" });
        return;
      }
      let released = false;
      if (sub.schedule) {
        const scheduleId = typeof sub.schedule === "string" ? sub.schedule : sub.schedule.id;
        try {
          await stripe.subscriptionSchedules.release(scheduleId);
          released = true;
          console.log(`プラン変更予約を取り消し: shopId=${shopId} schedule=${scheduleId} sub=${sub.id}`);
        } catch (e) {
          // 既に released/canceled/completed なスケジュールは release できない。
          // その場合 Stripe 側には予約が残っていないので、DBの予約表示だけ消せばよい。
          console.warn(`スケジュールの解放をスキップ: shopId=${shopId} schedule=${scheduleId} ${e.message}`);
        }
      }
      // Stripe に予約が無かった場合でも DB の予約表示は必ず消す。
      // （予約バナーだけが残って取り消せない、という状態を作らないため）
      await db.ref(`accounts/${shopId}`).update({ scheduledPlan: null, scheduledPlanDate: null });
      const plan = planOfSubscription(sub);
      if (plan) await db.ref(`accounts/${shopId}/plan`).set(plan);
      res.status(200).json({ ok: true, released, plan: plan || null });
    } catch (e) {
      console.error("プラン変更予約の取り消し失敗:", e);
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
    if (!isValidShopId(shopId)) { res.status(400).json({ error: "shopId が不正です" }); return; }
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
// 2026-10-08: 送信回数を呼び出し元 uid ごと・宛先アドレスごとに1時間5回までに制限し（emailOtpRate・CF 専用のパス）、
// コードは crypto.randomInt で作る（以前は Math.random）。誤りの回数は再送しても0に戻さない（以前は再送のたびに attempts:0）。
// 判定は functions/security.js（tests/security.test.js が同じ関数を通す）
async function emailOtpRate(kind, key) {
  const now = Date.now();
  let ok = false;
  await db.ref(`emailOtpRate/${kind}_${key}`).transaction(cur => {
    const st = SEC.emailOtpRateStep(cur, now, kind);
    ok = st.ok;
    return st.ok ? st.rec : cur;
  });
  if (!ok) throw new functions.https.HttpsError("resource-exhausted", "確認コードの送信が続いたため、しばらく待ってからもう一度お試しください");
}
exports.sendEmailOtp = functions
  .region("asia-northeast1")
  .runWith({ secrets: ["SMTP_USER", "SMTP_PASS"] })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "ログインが必要です");
    }
    const email = (data && typeof data.email === "string" ? data.email : "").trim();
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new functions.https.HttpsError("invalid-argument", "メールアドレスが無効です");
    }

    const uid = context.auth.uid;
    if (!isSafeDbKey(uid)) throw new functions.https.HttpsError("invalid-argument", "アカウントが無効です");
    // 誤りの上限に達している間は送らない（回数も数えない）
    const prev = (await db.ref(`email_otps/${uid}`).once("value")).val();
    const pre = SEC.planEmailOtpSend({ prev, now: Date.now(), code: "000000" });
    throwPlanError(pre);
    await emailOtpRate("uid", payCodeHashCF("otpUid:", uid));
    await emailOtpRate("email", payCodeHashCF("otpEmail:", email.toLowerCase()));

    const code = String(crypto.randomInt(100000, 1000000));
    const appUrl = process.env.APP_URL || "https://shiftyshifty.app";
    const emailLink = await getAuth().generateSignInWithEmailLink(email, {
      url: appUrl,
      handleCodeInApp: true,
    });

    const plan = SEC.planEmailOtpSend({ prev, now: Date.now(), code, email, emailLink });
    throwPlanError(plan);
    await db.ref(`email_otps/${uid}`).set(plan.record);

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
// 総当たり対策: 誤りは5回まで（1時間は再送しても持ち越す）。比べる前にトランザクションで数える（並べて投げても回数を抜けない）
exports.verifyEmailOtp = functions
  .region("asia-northeast1")
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "ログインが必要です");
    }
    const uid = context.auth.uid;
    if (!isSafeDbKey(uid)) throw new functions.https.HttpsError("invalid-argument", "アカウントが無効です");
    const code = String((data && data.code) || "").trim();

    let r;
    // 手元に値が無いと最初に null で呼ばれる（Admin SDK）。null なら何も変えずに返し、サーバーの値で呼び直される
    await db.ref(`email_otps/${uid}`).transaction(cur => {
      r = SEC.planEmailOtpVerify({ otp: cur, code, now: Date.now() });
      return r.patch !== undefined ? r.patch : cur;
    });
    throwPlanError(r);
    return r.result;
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
      // デモ店舗は「1年未更新なら捨ててよい放置店舗」ではなく、広告の着地先として置いてある常設の展示物。
      // しかも lastActivity を更新できる経路が1つも無い: touchLastActivity（app-main.js）は fbSet 経由で、
      // #/demo は fbSet の入口で書き込みを握り潰し、スタッフURL経由で開いた端末はオーナーではないので
      // ルールが lastActivity の書き込みを拒否する（demo は owners が空で、adminKey も設定済のため
      // 誰もオーナーになれない）。つまり放っておけば投入時刻のまま必ず古くなり、ある日 archived/ へ
      // 退避されて #/demo がログイン画面に落ちる。プランでも救えない（accounts ノードを持たない＝Free扱い）。
      if (isDemoShop(id)) continue;

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
      // スタッフ個別URL（2026-10-04）: 店舗の外にある逆引き・本人のデータ・暗証番号も消す（店舗が無いと二度と使われない孤児になる）。
      // 申請の記録（staffPages）は店舗のデータごと archived/ に残る。本人のデータ（staffPageData）は退避しない（給料の目安などの個人の入力）
      for (const t of Object.keys(shopData.staffPages || {})) {
        if (!isPageTokenCF(t)) continue;
        await db.ref(`staffPageTokens/${t}`).remove();
        await db.ref(`staffPageData/${t}`).remove();
        await db.ref(`staffPagePins/${t}`).remove();
        // URLをなくしたとき用のメールアドレス（2026-10-04）と、その逆引き
        const er = (await db.ref(`staffPageEmails/${t}`).once("value")).val();
        if (er && typeof er.key === "string" && /^[0-9a-f]{64}$/.test(er.key)) await db.ref(`staffPageEmailIndex/${er.key}/${t}`).remove();
        await db.ref(`staffPageEmails/${t}`).remove();
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
      // 誤りの回数を持ち越している間（1時間）は消さない（消すと再送で数え直せてしまう）
      if (SEC.emailOtpPurgeable(entry, now)) {
        await db.ref(`email_otps/${uid}`).remove();
        console.log(`email_otp期限切れを削除: ${uid}`);
      }
    }
    // 確認コードの送信回数（emailOtpRate）は窓が過ぎたものを消す
    const otpRate = (await db.ref("emailOtpRate").once("value")).val() || {};
    for (const [k, rec] of Object.entries(otpRate)) {
      if (SEC.emailOtpRatePurgeable(rec, now)) await db.ref(`emailOtpRate/${k}`).remove();
    }

    // 4) 個人リンクコード（従業員画面 E2）は 2026-10-05 に機能ごと削除した。本番に残っているコード・索引・失敗回数を消す
    //    （発行と入力の CF もルールも無いので、ノードごと消してよい。消えた後は空読みだけ）
    for (const node of ["staffLinkCodes", "staffLinkCodeIndex", "staffLinkCodeAttempts"]) {
      if ((await db.ref(node).once("value")).exists()) {
        await db.ref(node).remove();
        console.log(`廃止した個人リンクコードの残りを削除: ${node}`);
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
      // デモ店舗は展示物なので期間も間引かない（上の purgeInactiveShops と同じ理由）。
      // 期間が消えると tokens も subs も一緒に消え、中身の無い店舗が残る＝デモとして機能しなくなる。
      if (isDemoShop(shopId)) continue;
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
        // 実績（P4・shops/{sid}/actuals/{期間ID}）も期間と一緒に消す
        await db.ref(`shops/${shopId}/actuals/${periodId}`).remove();
        // 提出の監査の記録（2026-10-08・private/subAudit/{期間ID}）も期間と一緒に消す
        await db.ref(`shops/${shopId}/private/subAudit/${periodId}`).remove();
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
      const listResult = await getAuth().listUsers(1000, nextPageToken);
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

// ============================================================
// 企業の共通設定・提出期限（2026-09-27 企業連携の拡張）
// 正本は companies/{companyId}/pub/config。各連携店舗の shops/{shopId}/company に写し（ミラー）を置き、
// 店舗側はミラーだけを読む（companies 配下はクライアントから書けず、読みも企業uidと作成者に限られるため）。
// キーと値の規則はクライアントの app-utils.js（COMPANY_LABOR_KEYS・COMPANY_LIMIT_KEYS・COMPANY_ATTR_ID_RE・
// isValidDateStr）と**同じ内容**にする。functions/ は app-utils.js を読めないので書き写している。
// ============================================================
const { sanitizeCompanySettings, sanitizeCompanyDeadlines, sanitizeMonthlyDeadlineDays, canChangeCompanyPassword,
  isValidEntityId, sanitizeEntityName, planEntityMigration, buildShopMirror, otherCompanyLinksOf, SHOP_KINDS,
  isValidPayCodeCF, payCodeHashCF, isPayCodeRecordCF, verifyPayCodeCF,
  isValidPersonId, genPersonAutoId, sanitizeStaffNumber, entityIdOfShop, planPeopleSync, staffNumberConflict,
  planMergePeople, planSplitPerson, planReassignPersonId, planMarkDistinct, planUnmarkDistinct, validateStaffRename, renameStaffListCF,
  renameStaffSettingsPatch, renameStaffPeriodsPatch, renameStaffPayPatch, renameStaffLaborMonthsPatch, renameStaffActualsPatch, renameStaffSubsPatch,
  COMPANY_BUILTIN_ATTRS, COMPANY_ATTR_ID_RE, mirrorPeopleOf } = require("./company-config");
// 従業員画面の紐付け（第2部 E2）の規則。クライアントの app-my-utils.js と同じ内容（tests/my.test.js が照合する）
const { renameStaffLinksPatchCF, staffLinkPersonIdPatchCF, planApproveStaffLink, planUnlinkStaff, planLinkStaffPage,
  LINK_NAME_MAX, planNameGuardsCF } = require("./staff-link");
// 提出データの監査（2026-10-08）の判定
const { planSubAuditCF, subAuditRecordCF } = require("./sub-audit");
// 従業員画面の会社設定の賃金（第2部 E6・getMyPay）の判定。tests/my.test.js が app-utils.js の normalizePayVersion との一致を照合する
const { myPayLinkNameCF, planGetMyPay } = require("./my-pay");
// 法人レイヤーの片方向移行（2026-09-30・P1）。法人が無い企業には企業名と同名の法人を1つ作り、
// 割当の無い連携店舗をすべて既定の法人へ割り当てる。冪等なので、写しを作り直す前に毎回通してよい。
async function ensureCompanyEntities(companyId) {
  const pub = (await db.ref(`companies/${companyId}/pub`).once("value")).val() || {};
  const patch = planEntityMigration(pub, () => db.ref(`companies/${companyId}/pub/entities`).push().key, new Date().toISOString());
  if (patch) await db.ref(`companies/${companyId}/pub`).update(patch);
  return !!patch;
}
// 店舗が別の企業に連携中なら、その企業IDを返す（owners の企業uid と写しの id から候補を出し、
// 候補の企業の pub/shops で実際に連携中かを確かめる。解除済みの残骸では拒否しない）。
async function linkedToOtherCompany(shopId, companyId) {
  const [owners, mirror] = await Promise.all([
    db.ref(`shops/${shopId}/owners`).once("value").then(x => x.val()),
    db.ref(`shops/${shopId}/company`).once("value").then(x => x.val()),
  ]);
  for (const cid of otherCompanyLinksOf(owners, mirror, companyId)) {
    if (!isValidCompanyId(cid)) continue;
    const v = (await db.ref(`companies/${cid}/pub/shops/${shopId}`).once("value")).val();
    if (v === true) return cid;
  }
  return null;
}
// 連携店舗の shops/{shopId}/company を正本から作り直す。shopIds を省けば連携全店舗。
// 1店舗の失敗で残りを止めない（冪等なので、失敗した店舗は次の保存で書き直される）。
async function syncCompanyMirror(companyId, shopIds) {
  await ensureCompanyEntities(companyId);
  const pub = (await db.ref(`companies/${companyId}/pub`).once("value")).val() || {};
  const linked = Object.keys(pub.shops || {}).filter(isValidShopId);
  const names = {};
  for (const sid of linked) {
    try { names[sid] = ((await db.ref(`global/shops/${sid}/name`).once("value")).val()) || ""; } catch (e) { names[sid] = ""; }
  }
  const targets = (shopIds || linked).filter(sid => linked.includes(sid));
  const synced = [], failed = [];
  for (const sid of targets) {
    try {
      // 企業共通 → 法人 の重ね合わせ・法人名・本部店舗の種別はここで焼き込む（company-config.js の buildShopMirror）
      await db.ref(`shops/${sid}/company`).set(buildShopMirror(companyId, pub, sid, names, new Date().toISOString()));
      synced.push(sid);
    } catch (e) { failed.push(sid); }
  }
  // 賃金の閲覧パスコード（P6a）も企業のものに揃える。後から連携した店舗にも、次の写しの作り直しで届く。
  // 企業がまだ設定していなければ店舗のものは触らない（店舗は未設定＝0000 のまま）
  try {
    const code = (await db.ref(`companies/${companyId}/private/payCode`).once("value")).val();
    if (isPayCodeRecordCF(code)) {
      for (const sid of synced) {
        try { await db.ref(`shops/${sid}/private/payCode`).set(code); } catch (e) { /* 次の同期で書き直される */ }
      }
    }
  } catch (e) { /* パスコードの同期の失敗で写しの作り直しを失敗扱いにしない */ }
  return { synced, failed };
}

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
    { const pwErr = SEC.newPasswordErrorCF(password); if (pwErr) throw new functions.https.HttpsError("invalid-argument", pwErr); }

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
      // 呼び出し元由来の shopId は DB パスへ入る前に形を確かめる。#125（課金系4本）・#132（企業系2本）で
      // 同じ検証を入れたが、**複数形の `shopIds` を取るここだけが両方の網から漏れていた**（#133 で数え直して検出）。
      // isDemoShop より先に通すこと（"demo-toriMatsu-v1/" は文字列比較に一致しないのに同じノードを読む）。
      if (!isValidShopId(shopId)) continue;
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
      // 別の企業に連携中の店舗は二重に連携しない（linkStoreToCompany と同じ判断）
      if (await linkedToOtherCompany(shopId, companyId)) { skipped.push(shopId); continue; }
      await db.ref(`companies/${companyId}/pub/shops/${shopId}`).set(true);
      await registerCompanyAsOwner(companyId, shopId);
      linked.push(shopId);
    }
    // 企業作成と同時に企業名と同名の法人を1つ作り、連携店舗をそこへ割り当てる（店舗が無くても作る）
    if (linked.length) await syncCompanyMirror(companyId, linked);
    else await ensureCompanyEntities(companyId);
    return { companyId, code, name, linkedShops: linked, skippedShops: skipped };
  });

// 企業コード＋パスワードでログイン → カスタムトークンを発行
exports.companyLogin = functions
  .region("asia-northeast1")
  .https.onCall(async (data, context) => {
    const code = (data && typeof data.code === "string") ? data.code.trim().toUpperCase() : "";
    const password = (data && typeof data.password === "string") ? data.password : "";
    if (!code || !password) throw new functions.https.HttpsError("invalid-argument", "企業コードとパスワードを入力してください");

    // 企業コードは genCompanyCode の文字種（英大文字と数字）。それ以外は DB を読まずに同じ文言で返す（パスの禁止文字で ref() が throw しない）
    if (!/^[0-9A-Z]{1,32}$/.test(code)) throw new functions.https.HttpsError("not-found", "企業コードまたはパスワードが正しくありません");
    const idSnap = await db.ref(`companyCodes/${code}`).once("value");
    const companyId = idSnap.val();
    if (!companyId || !isValidCompanyId(companyId)) throw new functions.https.HttpsError("not-found", "企業コードまたはパスワードが正しくありません");
    // 試行回数（2026-10-08）: 照合の前に企業コードごとに数え、5回目から待ち時間（1分から倍・上限30分）。待ち時間の間は scrypt を回さない。
    // 判定は functions/security.js の planCompanyLoginAttempt（tests/security.test.js）
    const failsRef = db.ref(`companies/${companyId}/private/loginFails`);
    let gate;
    await failsRef.transaction(cur => {
      gate = SEC.planCompanyLoginAttempt(cur, Date.now());
      return gate.ok ? gate.rec : cur;
    });
    if (!gate.ok) throw new functions.https.HttpsError("resource-exhausted", SEC.companyLoginWaitMsg(gate.waitMs));
    const hashSnap = await db.ref(`companies/${companyId}/private/passwordHash`).once("value");
    if (!verifyPassword(password, hashSnap.val())) {
      throw new functions.https.HttpsError("permission-denied", "企業コードまたはパスワードが正しくありません");
    }
    await failsRef.remove(); // 成功で数え直す
    const nameSnap = await db.ref(`companies/${companyId}/pub/name`).once("value");
    const token = await getAuth().createCustomToken(companyUid(companyId), { companyId, kind: "company" });
    return { token, companyId, name: nameSnap.val() || "" };
  });

// 企業パスワード変更（企業ログインuid or 作成者本人）
exports.changeCompanyPassword = functions
  .region("asia-northeast1")
  .https.onCall(async (data, context) => {
    const companyId = (data && typeof data.companyId === "string") ? data.companyId : "";
    const newPassword = (data && typeof data.newPassword === "string") ? data.newPassword : "";
    const currentPassword = (data && typeof data.currentPassword === "string") ? data.currentPassword : "";
    if (!isValidCompanyId(companyId)) throw new functions.https.HttpsError("invalid-argument", "企業IDが無効です");
    { const pwErr = SEC.newPasswordErrorCF(newPassword); if (pwErr) throw new functions.https.HttpsError("invalid-argument", pwErr); }
    await assertCompanyMember(context, companyId);
    // 変更は作成者のアカウント（メール／Google）だけ（2026-09-28）。企業コードでログインした人は現在の
    // パスワードを知っているので、下の照合だけでは作成者を締め出す変更を防げない
    const ownerUidForPw = (await db.ref(`companies/${companyId}/pub/ownerUid`).once("value")).val();
    if (!canChangeCompanyPassword(context.auth.uid, ownerUidForPw)) {
      throw new functions.https.HttpsError("permission-denied", "企業コードでログインしたセッションではパスワードを変更できません。作成者のアカウント（メール／Google）でログインしてください");
    }
    // 現在のパスワードを照合する（2026-09-27）。企業メンバーのセッションを開いたまま離席した端末から、
    // 第三者がパスワードを書き換えて企業を乗っ取るのを防ぐ
    const stored = (await db.ref(`companies/${companyId}/private/passwordHash`).once("value")).val();
    if (!currentPassword || !stored || !verifyPassword(currentPassword, stored)) {
      throw new functions.https.HttpsError("permission-denied", "現在のパスワードが正しくありません");
    }
    await db.ref(`companies/${companyId}/private/passwordHash`).set(hashPassword(newPassword));
    return { ok: true };
  });

// 企業名の変更
exports.renameCompany = functions
  .region("asia-northeast1")
  .https.onCall(async (data, context) => {
    const companyId = (data && typeof data.companyId === "string") ? data.companyId : "";
    const name = (data && typeof data.name === "string") ? data.name.trim() : "";
    if (!isValidCompanyId(companyId) || !name || name.length > 100) throw new functions.https.HttpsError("invalid-argument", "企業名が無効です");
    await assertCompanyMember(context, companyId);
    await db.ref(`companies/${companyId}/pub/name`).set(name);
    // 作成者ポインタの表示名も更新
    const ownerSnap = await db.ref(`companies/${companyId}/pub/ownerUid`).once("value");
    if (ownerSnap.val()) await db.ref(`accounts/${ownerSnap.val()}/company/name`).set(name);
    await syncCompanyMirror(companyId);
    return { ok: true };
  });

// 店舗を企業に連携（企業ログインuidをownerに登録）。shopCodeは "shopId" または "shopId.adminKey"
exports.linkStoreToCompany = functions
  .region("asia-northeast1")
  .https.onCall(async (data, context) => {
    const companyId = (data && typeof data.companyId === "string") ? data.companyId : "";
    const shopId = (data && typeof data.shopId === "string") ? data.shopId.trim() : "";
    const adminKey = (data && typeof data.adminKey === "string") ? data.adminKey.trim() : "";
    if (!isValidCompanyId(companyId) || !isValidShopId(shopId)) throw new functions.https.HttpsError("invalid-argument", "企業ID・店舗コードが無効です");
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
    // 別の企業に連携中の店舗は拒否する（2026-09-30・P1）。写しは1店舗に1つしか置けず、後から連携した企業が
    // 前の企業の写しを黙って上書きしてしまうため。先に前の企業で連携を解除してもらう
    if (await linkedToOtherCompany(shopId, companyId)) {
      throw new functions.https.HttpsError("failed-precondition", "この店舗は別の企業アカウントに連携されています。先にその企業で連携を解除してください");
    }
    await db.ref(`companies/${companyId}/pub/shops/${shopId}`).set(true);
    await registerCompanyAsOwner(companyId, shopId);
    // 追加した店舗にミラーを作り、既存店舗のミラーの店舗一覧（所属店舗の選択肢）も更新する
    await syncCompanyMirror(companyId);
    return { ok: true, name: shop.name || "" };
  });

// 企業に連携済みの店舗を、いま使っているuidでも管理できるようにオーナー登録する。
// 企業連携タブの「ログイン」（他店舗への切り替え）から呼ぶ。
//
// 企業ログインuid（company_{companyId}）は linkStoreToCompany の時点で owners に入るが、
// 企業の作成者本人（Google/メールのuid）は自分がclaimした店舗のownersにしか居ない。
// そのため作成者が企業連携タブから他店舗へ切り替えると「管理者として登録されていません
// （閲覧のみ）」になり、店舗ごとに管理コードを入力し直す必要があった。
// ここでの権限の根拠は「呼び出し元が企業メンバー」＋「その店舗が企業に連携済み」の2つで、
// 連携の時点で管理コード（または既存オーナーであること）の証明は済んでいる。
exports.claimCompanyShop = functions
  .region("asia-northeast1")
  .https.onCall(async (data, context) => {
    const companyId = (data && typeof data.companyId === "string") ? data.companyId : "";
    const shopId = (data && typeof data.shopId === "string") ? data.shopId.trim() : "";
    if (!isValidCompanyId(companyId) || !isValidShopId(shopId)) {
      throw new functions.https.HttpsError("invalid-argument", "企業ID・店舗IDが無効です");
    }
    if (isDemoShop(shopId)) throw new functions.https.HttpsError("permission-denied", "デモ店舗は企業アカウントで管理できません");
    const callerUid = await assertCompanyMember(context, companyId);
    if (!isSafeDbKey(callerUid)) throw new functions.https.HttpsError("permission-denied", "このアカウントでは登録できません");
    // 連携済みの店舗だけが対象。shopId は誰でも辿れるので、連携マップを唯一の根拠にする
    const linked = (await db.ref(`companies/${companyId}/pub/shops/${shopId}`).once("value")).val();
    if (linked !== true) throw new functions.https.HttpsError("permission-denied", "この店舗は企業アカウントに連携されていません");
    const owners = (await db.ref(`shops/${shopId}/owners`).once("value")).val();
    // owners が空の店舗をここで初claimさせない（「先に触った人がオーナーになれる」窓を
    // 作らないため。linkStoreToCompany・createCompany と同じ判断）
    if (!owners) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "この店舗はまだ管理者端末が登録されていません。先に店舗の管理者画面を開いてください"
      );
    }
    if (owners[callerUid]) return { ok: true, already: true };
    const key = (await db.ref(`shops/${shopId}/private/adminKey`).once("value")).val();
    if (!key) throw new functions.https.HttpsError("failed-precondition", "この店舗の管理キーが見つかりません");
    await db.ref(`shops/${shopId}/owners/${callerUid}`).set(key);
    // 企業経由で与えた権限だけを解除時に回収できるよう台帳に残す（元からのオーナーは記録しない）。
    // companies/{companyId}/grants はクライアントに読み書きルールが無い＝CF専用パス。
    await db.ref(`companies/${companyId}/grants/${shopId}/${callerUid}`).set(true);
    return { ok: true };
  });

// 店舗の企業連携を解除（企業ログインuidをownerから外す）
exports.unlinkStoreFromCompany = functions
  .region("asia-northeast1")
  .https.onCall(async (data, context) => {
    const companyId = (data && typeof data.companyId === "string") ? data.companyId : "";
    const shopId = (data && typeof data.shopId === "string") ? data.shopId.trim() : "";
    // shopId も形を確かめる。`"/"` は truthy なので `!shopId` を素通りし、Admin SDK の
    // パス正規化で `companies/{id}/pub/shops` と `companies/{id}/grants` を**丸ごと**指す。
    // 下の「最後のオーナーは外さない」判定は `shops//owners`（→ `shops/owners`）を読んで
    // 空と判断するため発火せず、連携マップと付与台帳が一度に消える（バグチェック#132で実測）。
    if (!isValidCompanyId(companyId) || !isValidShopId(shopId)) throw new functions.https.HttpsError("invalid-argument", "企業ID・店舗IDが無効です");
    await assertCompanyMember(context, companyId);
    // 企業ログインのセッションで作った店舗はオーナーが企業uidだけなので、無条件に外すと
    // owners が空＝未claim状態へ戻ってしまう。その状態は「shopIdを知る第三者が
    // 自分の企業のオーナーになれる」窓そのものなので、最後のオーナーは外さない（バグチェック#65）。
    const cUid = companyUid(companyId);
    const owners = (await db.ref(`shops/${shopId}/owners`).once("value")).val() || {};
    // 企業uidに加え、claimCompanyShop が企業経由で与えたuidも一緒に外す。残すと
    // 「連携を解除したのに、企業の作成者だけは店舗を編集できたまま」になる
    const granted = Object.keys((await db.ref(`companies/${companyId}/grants/${shopId}`).once("value")).val() || {});
    const revoke = [cUid, ...granted.filter(u => u !== cUid)].filter(isSafeDbKey);
    const others = Object.keys(owners).filter(u => !revoke.includes(u));
    if (revoke.some(u => owners[u]) && others.length === 0) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "この店舗の管理者はこの企業アカウントだけです。解除するとどの端末からも管理できなくなるため、先に別の端末を管理コードで追加してください"
      );
    }
    await db.ref(`companies/${companyId}/pub/shops/${shopId}`).remove();
    for (const u of revoke) await db.ref(`shops/${shopId}/owners/${u}`).remove();
    await db.ref(`companies/${companyId}/grants/${shopId}`).remove();
    // 法人の割当と本部の種別も外す（再連携したときは既定の法人・通常の店舗から始まる）
    await db.ref(`companies/${companyId}/pub/shopEntities/${shopId}`).remove();
    await db.ref(`companies/${companyId}/pub/shopKinds/${shopId}`).remove();
    await db.ref(`global/shops/${shopId}/kind`).remove();
    // 解除した店舗のミラーを消し（企業設定・提出期限・提出ボタンの表示が外れる）、
    // 企業の提出期限表からその店舗の上書きを取り除く。残りの店舗のミラーは店舗一覧を更新する。
    await db.ref(`shops/${shopId}/company`).remove();
    const dls = (await db.ref(`companies/${companyId}/pub/config/deadlines`).once("value")).val() || {};
    for (const rk of Object.keys(dls)) {
      if (dls[rk] && dls[rk].shops && dls[rk].shops[shopId] !== undefined) {
        await db.ref(`companies/${companyId}/pub/config/deadlines/${rk}/shops/${shopId}`).remove();
      }
    }
    await syncCompanyMirror(companyId);
    return { ok: true };
  });

// 企業の共通設定（労務設定・属性別の勤務時間制限）と提出期限（期間ごとの日付・毎月の固定締切）を保存し、連携全店舗のミラーを更新する。
// settings は丸ごと置き換える（空欄にした項目を消せるように）。deadlines は期間ごとの差分で、
// 渡した期間だけを置き換える（null でその期間の期限を消す）。
exports.saveCompanyConfig = functions
  .region("asia-northeast1")
  .https.onCall(async (data, context) => {
    const companyId = (data && typeof data.companyId === "string") ? data.companyId : "";
    if (!isValidCompanyId(companyId)) throw new functions.https.HttpsError("invalid-argument", "企業IDが無効です");
    await assertCompanyMember(context, companyId);
    const linked = Object.keys((await db.ref(`companies/${companyId}/pub/shops`).once("value")).val() || {});
    const hasSettings = data && data.settings !== undefined;
    const hasDeadlines = data && data.deadlines !== undefined;
    const hasMonthly = data && data.monthlyDeadlineDays !== undefined;
    if (!hasSettings && !hasDeadlines && !hasMonthly) throw new functions.https.HttpsError("invalid-argument", "保存する内容がありません");
    if (hasSettings) await db.ref(`companies/${companyId}/pub/config/settings`).set(sanitizeCompanySettings(data.settings));
    if (hasDeadlines) {
      const dl = sanitizeCompanyDeadlines(data.deadlines, linked);
      for (const rk of Object.keys(dl)) await db.ref(`companies/${companyId}/pub/config/deadlines/${rk}`).set(dl[rk]);
    }
    if (hasMonthly) {
      // 毎月の固定締切は丸ごと置き換える（空で送れば消える）
      const md = sanitizeMonthlyDeadlineDays(data.monthlyDeadlineDays);
      await db.ref(`companies/${companyId}/pub/config/monthlyDeadlineDays`).set(md.length ? md : null);
    }
    await db.ref(`companies/${companyId}/pub/config/updatedAt`).set(new Date().toISOString());
    const { synced, failed } = await syncCompanyMirror(companyId);
    return { ok: true, synced, failed };
  });

// ============================================================
// 法人（entity）の管理（2026-09-30・労務給与_複数法人_実装計画.md §3.1・P1）
// 書き込みはすべて CF（companies/* はクライアントから書けない）。権限は assertCompanyMember（企業コードの
// セッションと作成者本人）。保存後に連携全店舗の写しを作り直す（法人名・法人の設定・本部の種別が写しに入る）。
// ============================================================
function readEntityArgs(data) {
  const companyId = (data && typeof data.companyId === "string") ? data.companyId : "";
  if (!isValidCompanyId(companyId)) throw new functions.https.HttpsError("invalid-argument", "企業IDが無効です");
  return companyId;
}
async function assertEntityExists(companyId, entityId) {
  if (!isValidEntityId(entityId)) throw new functions.https.HttpsError("invalid-argument", "法人IDが無効です");
  const e = (await db.ref(`companies/${companyId}/pub/entities/${entityId}`).once("value")).val();
  if (!e) throw new functions.https.HttpsError("not-found", "法人が見つかりません");
}
async function assertLinkedShop(companyId, shopId) {
  if (!isValidShopId(shopId)) throw new functions.https.HttpsError("invalid-argument", "店舗IDが無効です");
  const v = (await db.ref(`companies/${companyId}/pub/shops/${shopId}`).once("value")).val();
  if (v !== true) throw new functions.https.HttpsError("permission-denied", "この店舗は企業アカウントに連携されていません");
}

// 既存企業の初回起動で法人を用意する（企業連携タブの法人カードが、法人が無いときに1回呼ぶ）
exports.ensureCompanyEntities = functions
  .region("asia-northeast1")
  .https.onCall(async (data, context) => {
    const companyId = readEntityArgs(data);
    await assertCompanyMember(context, companyId);
    const migrated = await ensureCompanyEntities(companyId);
    if (migrated) await syncCompanyMirror(companyId);
    return { ok: true, migrated };
  });

exports.createEntity = functions
  .region("asia-northeast1")
  .https.onCall(async (data, context) => {
    const companyId = readEntityArgs(data);
    const name = sanitizeEntityName(data && data.name);
    if (!name) throw new functions.https.HttpsError("invalid-argument", "法人名は1〜100文字にしてください");
    await assertCompanyMember(context, companyId);
    await ensureCompanyEntities(companyId);
    const count = Object.keys((await db.ref(`companies/${companyId}/pub/entities`).once("value")).val() || {}).length;
    if (count >= 50) throw new functions.https.HttpsError("resource-exhausted", "法人は50件までです");
    const ref = db.ref(`companies/${companyId}/pub/entities`).push();
    await ref.set({ name, createdAt: new Date().toISOString() });
    return { ok: true, entityId: ref.key };
  });

exports.renameEntity = functions
  .region("asia-northeast1")
  .https.onCall(async (data, context) => {
    const companyId = readEntityArgs(data);
    const entityId = data && data.entityId;
    const name = sanitizeEntityName(data && data.name);
    if (!name) throw new functions.https.HttpsError("invalid-argument", "法人名は1〜100文字にしてください");
    await assertCompanyMember(context, companyId);
    await assertEntityExists(companyId, entityId);
    await db.ref(`companies/${companyId}/pub/entities/${entityId}/name`).set(name);
    const { synced, failed } = await syncCompanyMirror(companyId);
    return { ok: true, synced, failed };
  });

exports.assignShopEntity = functions
  .region("asia-northeast1")
  .https.onCall(async (data, context) => {
    const companyId = readEntityArgs(data);
    const shopId = (data && typeof data.shopId === "string") ? data.shopId.trim() : "";
    const entityId = data && data.entityId;
    await assertCompanyMember(context, companyId);
    await assertLinkedShop(companyId, shopId);
    await assertEntityExists(companyId, entityId);
    await db.ref(`companies/${companyId}/pub/shopEntities/${shopId}`).set(entityId);
    const { synced, failed } = await syncCompanyMirror(companyId, [shopId]);
    return { ok: true, synced, failed };
  });

// 法人別の設定（労務設定・属性別の制限）。企業の共通設定と同じ検証を通し、丸ごと置き換える（空欄にした項目を消せるように）
exports.saveEntityConfig = functions
  .region("asia-northeast1")
  .https.onCall(async (data, context) => {
    const companyId = readEntityArgs(data);
    const entityId = data && data.entityId;
    await assertCompanyMember(context, companyId);
    await assertEntityExists(companyId, entityId);
    const settings = sanitizeCompanySettings(data && data.settings);
    await db.ref(`companies/${companyId}/pub/entities/${entityId}/settings`).set(Object.keys(settings).length ? settings : null);
    const { synced, failed } = await syncCompanyMirror(companyId);
    return { ok: true, synced, failed };
  });

// 本部店舗（kind:"hq"）の設定。正本は companies/{id}/pub/shopKinds（CF専用）。global/shops/{sid}/kind にも写すが、
// global/shops/{sid} はクライアントの saveShops が店舗オブジェクト丸ごと set() するため、そちらは消えうる写しであって正本ではない
// （写し shops/{sid}/company.kind は正本から毎回作り直すので消えない）。
exports.setShopKind = functions
  .region("asia-northeast1")
  .https.onCall(async (data, context) => {
    const companyId = readEntityArgs(data);
    const shopId = (data && typeof data.shopId === "string") ? data.shopId.trim() : "";
    const kind = data && data.kind;
    if (!SHOP_KINDS.includes(kind)) throw new functions.https.HttpsError("invalid-argument", "店舗の種別が無効です");
    await assertCompanyMember(context, companyId);
    await assertLinkedShop(companyId, shopId);
    await db.ref(`companies/${companyId}/pub/shopKinds/${shopId}`).set(kind === "hq" ? "hq" : null);
    await db.ref(`global/shops/${shopId}/kind`).set(kind === "hq" ? "hq" : null);
    const { synced, failed } = await syncCompanyMirror(companyId, [shopId]);
    return { ok: true, synced, failed };
  });

// ============================================================
// 賃金の閲覧パスコード（2026-09-30・労務給与_複数法人_実装計画.md §3.7・P6a）
// 企業に連携している店舗は企業のパスコードに統一する（店長ごとに別の番号を覚えさせない）。
// 正本は companies/{id}/private/payCode = {hash, salt, updatedAt}（企業uidと作成者だけが読める）。
// 連携全店舗の shops/{sid}/private/payCode（owners だけが読める）に同じ値を書く。
// 画面ロック用の4桁なので総当たりに耐える設計にはしない。代わりにハッシュを auth != null で読める場所に置かない。
// 変更は企業コードのセッションと作成者本人の両方が可（assertCompanyMember）。現在の番号の照合を必須にする。
// ============================================================
exports.setCompanyPayCode = functions
  .region("asia-northeast1")
  .https.onCall(async (data, context) => {
    const companyId = (data && typeof data.companyId === "string") ? data.companyId : "";
    const currentCode = (data && typeof data.currentCode === "string") ? data.currentCode : "";
    const newCode = (data && typeof data.newCode === "string") ? data.newCode : "";
    if (!isValidCompanyId(companyId)) throw new functions.https.HttpsError("invalid-argument", "企業IDが無効です");
    if (!isValidPayCodeCF(newCode)) throw new functions.https.HttpsError("invalid-argument", "パスコードは4桁の数字にしてください");
    await assertCompanyMember(context, companyId);
    const stored = (await db.ref(`companies/${companyId}/private/payCode`).once("value")).val();
    if (!verifyPayCodeCF(currentCode, stored)) {
      throw new functions.https.HttpsError("permission-denied", "現在のパスコードが正しくありません");
    }
    const salt = crypto.randomBytes(16).toString("hex");
    const rec = { hash: payCodeHashCF(salt, newCode), salt, updatedAt: new Date().toISOString() };
    await db.ref(`companies/${companyId}/private/payCode`).set(rec);
    const linked = Object.keys((await db.ref(`companies/${companyId}/pub/shops`).once("value")).val() || {}).filter(isValidShopId);
    const synced = [], failed = [];
    for (const sid of linked) {
      try { await db.ref(`shops/${sid}/private/payCode`).set(rec); synced.push(sid); } catch (e) { failed.push(sid); }
    }
    return { ok: true, synced, failed };
  });

// ============================================================
// 人物ID（personId）と企業スタッフ一覧の編集（2026-09-30・労務給与_複数法人_実装計画.md §3.8・P1b）
// 正本は companies/{id}/pub/people/{personId}（書くのは CF だけ。読みは pub のルール＝企業uidと作成者）。
// 店舗側の名前キーは変えない。改名だけは店舗のデータを書き換える（StaffTab の改名と同じ結果）。
// 権限はすべて assertCompanyMember（企業コードのセッションと作成者本人）。
// 規則は functions/company-config.js の純粋関数（tests/core.test.js がクライアントとの一致を照合する）。
// ============================================================
const genPersonId = () => genPersonAutoId(n => [...crypto.randomBytes(n)]);
// 連携全店舗の登録（店舗×名前）を読む。読めなかった店舗は failed に入れて登録を持たない
async function readCompanyRegs(companyId, pub) {
  const linked = Object.keys((pub && pub.shops) || {}).filter(isValidShopId);
  const regs = [], shopData = {}, failed = [];
  for (const sid of linked) {
    try {
      const [staff, settings] = await Promise.all(["staff", "settings"].map(k => db.ref(`shops/${sid}/${k}`).once("value").then(x => x.val())));
      const st = settings || {};
      const list = (Array.isArray(staff) ? staff : Object.values(staff || {})).filter(n => typeof n === "string" && n && !n.startsWith("__spacer__"));
      shopData[sid] = { staff: staff || [], settings: st };
      const eid = entityIdOfShop(pub, sid) || "";
      list.forEach(name => {
        const h = (st.staffHomeShop || {})[name];
        const num = (st.staffNumbers || {})[name];
        regs.push({ shopId: sid, name, entityId: eid, homeShopId: typeof h === "string" && h ? h : sid, number: String(num == null ? "" : num).trim() });
      });
    } catch (e) { failed.push(sid); }
  }
  return { regs, shopData, failed, linked };
}
// 人物が変わったあとの写しの作り直し（P3.6）。写しの people を店長のセッションが同一人物の判定に使う。
// 失敗しても人物の保存は済んでいるので呼び出しを失敗にしない（写しは次の保存で作り直される＝冪等）
async function syncPeopleMirror(companyId) {
  try { await syncCompanyMirror(companyId); } catch (e) { console.warn("syncPeopleMirror", companyId, e && e.message); }
  // 従業員画面の紐付け（E2）の personId を人物に合わせ直す（統合・切り出し・ID の振り直し・改名の後）
  try { await syncStaffLinkPersonIds(companyId); } catch (e) { console.warn("syncStaffLinkPersonIds", companyId, e && e.message); }
}
// shops/{sid}/staffLinks/{uid}.personId と users/{uid}/links/{sid}.personId を、いまの人物（店舗＋登録名）に揃える。
// 人物を変える CF（ensureCompanyPeople・mergePeople・splitPerson・reassignPersonId・companyRenameStaff）はすべて
// syncPeopleMirror を通るので、ここで1回まとめて直す。冪等（変わらなければ書かない）
async function syncStaffLinkPersonIds(companyId) {
  const pub = await readPub(companyId);
  const mirror = mirrorPeopleOf(pub);
  for (const sid of Object.keys(pub.shops || {}).filter(isValidShopId)) {
    const links = (await db.ref(`shops/${sid}/staffLinks`).once("value")).val() || {};
    const uids = Object.keys(links).filter(isSafeDbKey);
    if (!uids.length) continue;
    const userLinks = {};
    for (const u of uids) userLinks[u] = (await db.ref(`users/${u}/links/${sid}`).once("value")).val();
    const patch = staffLinkPersonIdPatchCF(sid, links, mirror, userLinks);
    if (patch) await db.ref().update(patch);
  }
}
async function readPub(companyId) {
  return (await db.ref(`companies/${companyId}/pub`).once("value")).val() || {};
}
function readPersonArg(data) {
  const personId = data && data.personId;
  if (!isValidPersonId(personId)) throw new functions.https.HttpsError("invalid-argument", "人物IDが無効です");
  return personId;
}
function personOr404(pub, personId) {
  const p = ((pub.people || {})[personId]);
  if (!p || typeof p !== "object") throw new functions.https.HttpsError("not-found", "人物が見つかりません");
  return p;
}

// 人物の自動生成と未リンクの登録名の取り込み（企業内登録スタッフの一覧を開いたときに呼ぶ・冪等）。
// 初回は既存の推定（buildCompanyStaffRows と同じ規則）から全員分を作る。以後は保存済みの people が正で、
// どの人物にもつながっていない登録名だけを拾う（計画書の upsertPerson にあたる。人物を作るのはこの関数だけ）。
exports.ensureCompanyPeople = functions
  .region("asia-northeast1")
  .https.onCall(async (data, context) => {
    const companyId = readEntityArgs(data);
    await assertCompanyMember(context, companyId);
    await ensureCompanyEntities(companyId);
    const pub = await readPub(companyId);
    const { regs, failed } = await readCompanyRegs(companyId, pub);
    // 読めなかった店舗があるときは作らない（その店舗の登録が未リンクのまま別人物として作られるのを防ぐ）
    if (failed.length) return { ok: false, failed, created: [] };
    const { patch, created } = planPeopleSync(pub.people || {}, regs, genPersonId, new Date().toISOString());
    if (patch) {
      await db.ref(`companies/${companyId}/pub/people`).update(patch);
      // 写しの people（P3.6・ヘルプ先勤務の合算の同一人物の判定）を作り直す
      await syncPeopleMirror(companyId);
    }
    return { ok: true, created, changed: !!patch };
  });

// 統合: 2人を同一人物として束ねる。keepPersonId の番号・法人を残す（店舗側のデータは動かさない）
exports.mergePeople = functions
  .region("asia-northeast1")
  .https.onCall(async (data, context) => {
    const companyId = readEntityArgs(data);
    const keepId = data && data.keepPersonId, dropId = data && data.dropPersonId;
    if (!isValidPersonId(keepId) || !isValidPersonId(dropId)) throw new functions.https.HttpsError("invalid-argument", "人物IDが無効です");
    await assertCompanyMember(context, companyId);
    const pub = await readPub(companyId);
    const r = planMergePeople(pub.people || {}, keepId, dropId, new Date().toISOString());
    if (r.error) throw new functions.https.HttpsError("failed-precondition", r.error);
    await db.ref(`companies/${companyId}/pub/people`).update(r.patch);
    await syncPeopleMirror(companyId);
    return { ok: true, personId: keepId };
  });

// 「統合しない」: 同じ名前の別人（外国人スタッフの略称・スポットワークの登録名など）を別の人として記録する。
// distinct:true で personIds（2人以上）の全ペアを両方向に記録、distinct:false で personIds:[a,b] の記録を取り消す。
// 記録は companies/{id}/pub/people/{personId}/distinct/{相手}。links は変わらないので写しは作り直さない
exports.markPeopleDistinct = functions
  .region("asia-northeast1")
  .https.onCall(async (data, context) => {
    const companyId = readEntityArgs(data);
    const ids = Array.isArray(data && data.personIds) ? data.personIds : [];
    if (ids.length < 2 || !ids.every(isValidPersonId)) throw new functions.https.HttpsError("invalid-argument", "人物IDが無効です");
    const mark = !(data && data.distinct === false);
    if (!mark && ids.length !== 2) throw new functions.https.HttpsError("invalid-argument", "取り消す2人を選んでください");
    await assertCompanyMember(context, companyId);
    const pub = await readPub(companyId);
    const r = mark ? planMarkDistinct(pub.people || {}, ids, new Date().toISOString()) : planUnmarkDistinct(pub.people || {}, ids[0], ids[1]);
    if (r.error) throw new functions.https.HttpsError("failed-precondition", r.error);
    await db.ref(`companies/${companyId}/pub/people`).update(r.patch);
    return { ok: true };
  });

// 統合解除: 人物から1店舗の登録を切り出して別の人物にする
exports.splitPerson = functions
  .region("asia-northeast1")
  .https.onCall(async (data, context) => {
    const companyId = readEntityArgs(data);
    const personId = readPersonArg(data);
    const shopId = (data && typeof data.shopId === "string") ? data.shopId : "";
    await assertCompanyMember(context, companyId);
    await assertLinkedShop(companyId, shopId);
    const pub = await readPub(companyId);
    const p = personOr404(pub, personId);
    const name = (p.links || {})[shopId];
    const settings = (await db.ref(`shops/${shopId}/settings`).once("value")).val() || {};
    const num = (settings.staffNumbers || {})[name];
    const reg = { shopId, name, entityId: entityIdOfShop(pub, shopId) || "", number: String(num == null ? "" : num).trim() };
    const r = planSplitPerson(pub.people || {}, personId, reg, genPersonId, new Date().toISOString());
    if (r.error) throw new functions.https.HttpsError("failed-precondition", r.error);
    await db.ref(`companies/${companyId}/pub/people`).update(r.patch);
    await syncPeopleMirror(companyId);
    return { ok: true, personId: r.newId };
  });

// ID を番号に振り直す（明示操作のみ・決定 #13）
exports.reassignPersonId = functions
  .region("asia-northeast1")
  .https.onCall(async (data, context) => {
    const companyId = readEntityArgs(data);
    const personId = readPersonArg(data);
    await assertCompanyMember(context, companyId);
    const pub = await readPub(companyId);
    personOr404(pub, personId);
    const r = planReassignPersonId(pub.people || {}, personId);
    if (r.error) throw new functions.https.HttpsError("failed-precondition", r.error);
    // laborMonths（P3）は名前キーで personId を参照しないので付け替えは要らない。personId を参照するノードを足した担当はここで付け替える
    await db.ref(`companies/${companyId}/pub/people`).update(r.patch);
    await syncPeopleMirror(companyId);
    return { ok: true, personId: r.newId };
  });

// 名前の変更。選んだ店舗ごとに、店舗の staff・全 subs.staffName・settings（名前キーの8マップ）・
// periods（snapshot / keepStaff / keepAttrs / laborTotals）・private/pay・laborMonths・actuals を移し、people.links を書き換える。
// 規則は StaffTab の改名（renameStaffInSettings / renameStaffInPeriods / renameStaffInPay）と同じ（tests が照合）。
// subs と periods と settings は差分 update（全体 set() しない）。staff は配列なのでトランザクションで置き換える。
// laborMonths（P3）と actuals（P4）も名前キーなので移す。名前キーのノードを足したらここにも足す（テストが照合する）。
exports.companyRenameStaff = functions
  .region("asia-northeast1")
  .https.onCall(async (data, context) => {
    const companyId = readEntityArgs(data);
    const personId = readPersonArg(data);
    const newName = (data && typeof data.newName === "string") ? data.newName.trim() : "";
    const shopIds = Array.isArray(data && data.shopIds) ? data.shopIds.filter(x => typeof x === "string") : [];
    if (!shopIds.length) throw new functions.https.HttpsError("invalid-argument", "名前を変える店舗を選んでください");
    await assertCompanyMember(context, companyId);
    for (const sid of shopIds) await assertLinkedShop(companyId, sid);
    const pub = await readPub(companyId);
    const p = personOr404(pub, personId);
    const links = p.links || {};
    // 先に全店舗を検証してから書く（途中の店舗で拒否されて半端に終わらないように）
    const plans = [];
    for (const sid of shopIds) {
      const oldName = links[sid];
      if (typeof oldName !== "string") throw new functions.https.HttpsError("failed-precondition", "この人物はその店舗に登録されていません");
      const [staff, settings] = await Promise.all(["staff", "settings"].map(k => db.ref(`shops/${sid}/${k}`).once("value").then(x => x.val())));
      const err = validateStaffRename(staff, settings || {}, oldName, newName);
      if (err) throw new functions.https.HttpsError("failed-precondition", err);
      plans.push({ sid, oldName, settings: settings || {} });
    }
    const done = [], failed = [];
    for (const { sid, oldName, settings } of plans) {
      try {
        await db.ref(`shops/${sid}/staff`).transaction(cur => cur == null ? cur : renameStaffListCF(cur, oldName, newName));
        const sp = renameStaffSettingsPatch(settings, oldName, newName);
        if (Object.keys(sp).length) await db.ref(`shops/${sid}/settings`).update(sp);
        // staffName の索引はルールに無いので全件を読む（3ヶ月の購読窓の外の期間も含めて移す）
        const subs = (await db.ref(`shops/${sid}/subs`).once("value")).val() || {};
        const subP = renameStaffSubsPatch(subs, oldName, newName);
        if (Object.keys(subP).length) await db.ref(`shops/${sid}/subs`).update(subP);
        const periods = (await db.ref(`shops/${sid}/periods`).once("value")).val() || {};
        const pp = renameStaffPeriodsPatch(periods, oldName, newName);
        if (Object.keys(pp).length) await db.ref(`shops/${sid}/periods`).update(pp);
        const pay = (await db.ref(`shops/${sid}/private/pay`).once("value")).val() || {};
        const payP = renameStaffPayPatch(pay, oldName, newName);
        if (payP) await db.ref(`shops/${sid}/private/pay`).update(payP);
        // 人×月の所定（P3）も名前キー。月ごとに旧名のキーを新名へ移す（renameStaffInLaborMonths と同じ規則）
        const lm = (await db.ref(`shops/${sid}/laborMonths`).once("value")).val() || {};
        const lmP = renameStaffLaborMonthsPatch(lm, oldName, newName);
        if (lmP) await db.ref(`shops/${sid}/laborMonths`).update(lmP);
        // 実績（P4）も名前キー。期間ごとに旧名のキーを新名へ移す（renameStaffInActuals と同じ規則）
        const ac = (await db.ref(`shops/${sid}/actuals`).once("value")).val() || {};
        const acP = renameStaffActualsPatch(ac, oldName, newName);
        if (acP) await db.ref(`shops/${sid}/actuals`).update(acP);
        // 従業員画面の紐付け（E2）も名前を値に持つ。staffLinks（名前の正本）と本人の索引 users/{uid}/links の写しを移す
        const sl = (await db.ref(`shops/${sid}/staffLinks`).once("value")).val() || {};
        const slP = renameStaffLinksPatchCF(sl, oldName, newName);
        if (slP) {
          await db.ref(`shops/${sid}/staffLinks`).update(slP);
          for (const k of Object.keys(slP)) {
            const u = k.split("/")[0];
            const ul = (await db.ref(`users/${u}/links/${sid}`).once("value")).val();
            if (ul) await db.ref(`users/${u}/links/${sid}/name`).set(newName);
          }
        }
        // スタッフ個別URL（2026-10-04）の名前も移す（クライアントの改名の追随 planStaffPageOp と同じ。移さないと URL が「名前が無い」で止まる）
        const pg = (await db.ref(`shops/${sid}/staffPages`).once("value")).val() || {};
        const pgP = {};
        Object.entries(pg).forEach(([t, r]) => { if (isPageTokenCF(t) && r && typeof r === "object" && r.status === "approved" && r.name === oldName) pgP[`${t}/name`] = newName; });
        if (Object.keys(pgP).length) await db.ref(`shops/${sid}/staffPages`).update(pgP);
        await db.ref(`companies/${companyId}/pub/people/${personId}/links/${sid}`).set(newName);
        await syncNameGuardsCF(sid);
        done.push(sid);
      } catch (e) { failed.push(sid); }
    }
    const fresh = ((await db.ref(`companies/${companyId}/pub/people/${personId}/links`).once("value")).val()) || {};
    const names = Object.values(fresh).filter(n => typeof n === "string");
    let best = ""; names.forEach(n => { if (n.replace(/[\s　]/g, "").length > best.replace(/[\s　]/g, "").length) best = n; });
    await db.ref(`companies/${companyId}/pub/people/${personId}`).update({ displayName: best, updatedAt: new Date().toISOString() });
    await syncPeopleMirror(companyId);
    return { ok: failed.length === 0, done, failed };
  });

// 従業員番号・法人・属性・所属店舗の変更。番号は法人内で一意（衝突は拒否）。番号は人物と、つながっている
// 全店舗の settings/staffNumbers に書く。属性と所属店舗は該当店舗の settings に書く（StaffTab と同じ値）。
// 渡した項目だけを変える（undefined は触らない）。属性・所属店舗は {shopId: 値} で店舗ごとに渡す。
exports.companyUpdateStaff = functions
  .region("asia-northeast1")
  .https.onCall(async (data, context) => {
    const companyId = readEntityArgs(data);
    const personId = readPersonArg(data);
    await assertCompanyMember(context, companyId);
    const pub = await readPub(companyId);
    const p = personOr404(pub, personId);
    const links = p.links || {};
    const hasNumber = data && data.number !== undefined;
    const hasEntity = data && data.entityId !== undefined;
    const number = hasNumber ? sanitizeStaffNumber(data.number) : String(p.number || "");
    if (number === null) throw new functions.https.HttpsError("invalid-argument", "従業員番号は20文字以内にしてください");
    const entityId = hasEntity ? data.entityId : (p.entityId || "");
    if (hasEntity) await assertEntityExists(companyId, entityId);
    if (hasNumber || hasEntity) {
      const { regs } = await readCompanyRegs(companyId, pub);
      const c = staffNumberConflict(pub.people || {}, regs, entityId, number, personId);
      if (c) throw new functions.https.HttpsError("already-exists", `従業員番号 ${number} はこの法人で既に使われています${c.name ? `（${c.name}）` : ""}`);
    }
    const attrs = (data && data.attrs && typeof data.attrs === "object") ? data.attrs : {};
    const homes = (data && data.homeShops && typeof data.homeShops === "object") ? data.homeShops : {};
    const linkedShops = Object.keys(pub.shops || {});
    for (const sid of [...Object.keys(attrs), ...Object.keys(homes)]) {
      if (typeof links[sid] !== "string") throw new functions.https.HttpsError("failed-precondition", "この人物はその店舗に登録されていません");
    }
    for (const sid of Object.keys(attrs)) {
      const a = attrs[sid];
      if (a !== null && !(COMPANY_BUILTIN_ATTRS.includes(a) || (typeof a === "string" && (COMPANY_ATTR_ID_RE.test(a) || /^custom_[A-Za-z0-9!@%&*+\-=?_~]{1,16}$/.test(a))))) {
        throw new functions.https.HttpsError("invalid-argument", "属性が無効です");
      }
    }
    for (const sid of Object.keys(homes)) {
      const h = homes[sid];
      if (h !== null && !(typeof h === "string" && linkedShops.includes(h))) throw new functions.https.HttpsError("invalid-argument", "所属店舗が無効です");
    }
    const now = new Date().toISOString();
    const upd = { updatedAt: now };
    if (hasNumber) upd.number = number || null;
    if (hasEntity) upd.entityId = entityId;
    await db.ref(`companies/${companyId}/pub/people/${personId}`).update(upd);
    const failed = [];
    for (const sid of Object.keys(links)) {
      if (!isValidShopId(sid) || !linkedShops.includes(sid)) continue;
      const name = links[sid];
      const sp = {};
      if (hasNumber) sp[`staffNumbers/${name}`] = number || null;
      if (attrs[sid] !== undefined) sp[`staffAttributes/${name}`] = attrs[sid];
      // 所属店舗は自店なら消す（無い＝自店所属。StaffTab と同じ）
      if (homes[sid] !== undefined) sp[`staffHomeShop/${name}`] = homes[sid] && homes[sid] !== sid ? homes[sid] : null;
      if (!Object.keys(sp).length) continue;
      try { await db.ref(`shops/${sid}/settings`).update(sp); } catch (e) { failed.push(sid); }
    }
    return { ok: failed.length === 0, failed };
  });

// ============================================================
// 従業員画面: スタッフアカウントと「店舗＋登録名」の紐付け（2026-10-04・Shifty_実装計画_2026-10.md 第2部 E2）
// 2方式: A＝従業員番号・B＝登録ネーム（本人の申請 → 管理者が承認）。C＝個人リンクコードは 2026-10-05 に機能ごと削除した。
// 規則は functions/staff-link.js の純粋関数（クライアントの app-my-utils.js と同じ。tests/my.test.js が照合する）。
// 書くのは shops/{sid}/staffLinks/{uid}（名前の正本）と users/{uid}/links/{sid}（本人の索引）を同じ update で。
// 入力の shopId・uid・名前は、パスに埋め込む前に形を確かめる（Admin SDK は空セグメントを詰める・バグチェック#125）。
// ============================================================
function readLinkShopId(data) {
  const shopId = data && data.shopId;
  if (!isValidShopId(shopId)) throw new functions.https.HttpsError("invalid-argument", "店舗が無効です");
  if (isDemoShop(shopId)) throw new functions.https.HttpsError("permission-denied", "体験版の店舗では使えません");
  return shopId;
}
function readLinkName(data) {
  const name = data && data.name;
  if (typeof name !== "string" || !name || name.length > LINK_NAME_MAX || !isSafeDbKey(name)) throw new functions.https.HttpsError("invalid-argument", "スタッフ名が無効です");
  return name;
}
function linkAuthUid(context) {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "ログインが必要です");
  return context.auth.uid;
}
async function readVal(p) { return (await db.ref(p).once("value")).val(); }
function throwPlanError(r) {
  if (r && r.error) throw new functions.https.HttpsError(r.error.code, r.error.msg);
}
// 提出の人単位の縛りの印（shops/{sid}/nameGuards）を、今の staffPages・staffLinks・スタッフ一覧から計算し直す（2026-10-08）。
// 紐付けを変える関数のあとに呼ぶ。失敗しても呼び出し元の処理は成功のまま返す（オーナーの端末が管理画面を開くたびに同じ計算で直す）
async function syncNameGuardsCF(shopId) {
  try {
    const [pages, staffLinks, staff, guards] = await Promise.all([
      readVal(`shops/${shopId}/staffPages`), readVal(`shops/${shopId}/staffLinks`), readVal(`shops/${shopId}/staff`), readVal(`shops/${shopId}/nameGuards`),
    ]);
    const patch = planNameGuardsCF({ pages, staffLinks, staff, guards });
    if (patch) await db.ref(`shops/${shopId}/nameGuards`).update(patch);
  } catch (e) { console.warn("nameGuards の更新に失敗:", shopId, e && e.message); }
}

// 承認（方式A・B）: 店舗のオーナーが申請を候補の名前へ紐付ける。候補に無い名前は拒否する（CF が照合し直す）
exports.approveStaffLink = functions
  .region("asia-northeast1")
  .https.onCall(async (data, context) => {
    const callerUid = linkAuthUid(context);
    const shopId = readLinkShopId(data);
    const uid = data && data.uid;
    if (!isSafeDbKey(uid)) throw new functions.https.HttpsError("invalid-argument", "アカウントが無効です");
    const name = readLinkName(data);
    const [owners, request, staff, settings, mirrorPeople, staffLinks] = await Promise.all([
      readVal(`shops/${shopId}/owners`), readVal(`shops/${shopId}/linkRequests/${uid}`), readVal(`shops/${shopId}/staff`),
      readVal(`shops/${shopId}/settings`), readVal(`shops/${shopId}/company/people`), readVal(`shops/${shopId}/staffLinks`),
    ]);
    const r = planApproveStaffLink({ shopId, uid, name, callerUid, nowIso: new Date().toISOString(), owners, request, staff, settings, mirrorPeople, staffLinks });
    throwPlanError(r);
    await db.ref().update(r.patch);
    await syncNameGuardsCF(shopId);
    return { ok: true, method: r.method };
  });

// 解除: 本人（uid を省く）か店舗のオーナー（uid を渡す）。staffLinks と users/{uid}/links の両方を消す
exports.unlinkStaff = functions
  .region("asia-northeast1")
  .https.onCall(async (data, context) => {
    const callerUid = linkAuthUid(context);
    const shopId = readLinkShopId(data);
    const uid = data && data.uid !== undefined ? data.uid : callerUid;
    if (!isSafeDbKey(uid)) throw new functions.https.HttpsError("invalid-argument", "アカウントが無効です");
    const owners = uid === callerUid ? null : await readVal(`shops/${shopId}/owners`);
    const r = planUnlinkStaff({ shopId, uid, callerUid, owners });
    throwPlanError(r);
    await db.ref().update(r.patch);
    await syncNameGuardsCF(shopId);
    return { ok: true };
  });

// 会社が登録した本人の賃金（第2部 E6）。呼び出し元 uid の shops/{sid}/staffLinks/{uid} の名前の private/pay/{名前} だけを返す。
// 名前は呼び出し元から受け取らない（他人の賃金は指定できない）。紐付けが無い・名前がスタッフ一覧に無いなら拒否。
// 閲覧パスコードは求めない（本人の分だけのため）。読むだけで何も書かない
// ============================================================
// スタッフ個別URL（2026-10-04・ユーザーの仕様変更）: 給料の暗証番号と、会社が登録した賃金（myPagePin）
// ============================================================
// 個別URL（#/m/<pageToken>）はログインが無い（pageToken を知っていることが権限）。給料の画面は4桁の暗証番号で開き、
// 会社が登録した賃金（private/pay）は**ここで番号を照合してから**本人の分だけ返す（名前は呼び出し元から受け取らず staffPages の name が正）。
// ハッシュと試行回数は staffPagePins/{pageToken}（ルールでクライアントから読み書きできない）。試行回数はトランザクションで数える
// （並べて投げて回数の制限を抜けられないように）。判定は functions/my-page.js の純粋関数（tests/my.test.js が照合する）
const { isPageTokenCF, myPageAccessCF, planMyPagePin } = require("./my-page");
exports.myPagePin = functions
  .region("asia-northeast1")
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "ログインが必要です");
    const token = data && data.token;
    if (!isPageTokenCF(token)) throw new functions.https.HttpsError("invalid-argument", "URLが正しくありません");
    const action = data && data.action;
    if (!["status", "set", "verify"].includes(action)) throw new functions.https.HttpsError("invalid-argument", "操作が正しくありません");
    const tokenRec = await readVal(`staffPageTokens/${token}`);
    const shopId = tokenRec && tokenRec.shopId;
    if (!isValidShopId(shopId)) throw new functions.https.HttpsError("not-found", "このURLは見つかりませんでした");
    if (isDemoShop(shopId)) throw new functions.https.HttpsError("permission-denied", "体験版の店舗では使えません");
    const [pageRec, staff] = await Promise.all([readVal(`shops/${shopId}/staffPages/${token}`), readVal(`shops/${shopId}/staff`)]);
    const acc = myPageAccessCF({ token, tokenRec, pageRec, staff });
    throwPlanError(acc);
    const pin = typeof (data && data.pin) === "string" ? data.pin : "";
    const currentPin = typeof (data && data.currentPin) === "string" ? data.currentPin : "";
    const hashOf = (salt, p) => (typeof salt === "string" && /^[0-9]{4}$/.test(p) ? payCodeHashCF(salt, p) : "");
    const plan = cur => {
      const salt = action === "set" ? crypto.randomBytes(16).toString("hex") : "";
      const pr = cur && typeof cur === "object" ? cur : null;
      return planMyPagePin({ action, pin, currentPin, pinRec: pr, pageRec, now: Date.now(), nowIso: new Date().toISOString(), salt,
        pinHash: hashOf(pr && pr.salt, pin), currentHash: hashOf(pr && pr.salt, currentPin), newHash: hashOf(salt, pin) });
    };
    let r;
    if (action === "status") r = plan(await readVal(`staffPagePins/${token}`));
    else {
      // 手元に値が無いと最初に null で呼ばれる（Admin SDK）。null のときは何も変えずに返し、サーバーの値と食い違えば取り直して呼び直される
      await db.ref(`staffPagePins/${token}`).transaction(cur => {
        r = plan(cur);
        return r.pinPatch !== undefined ? r.pinPatch : cur;
      });
    }
    throwPlanError(r);
    if (!r.unlocked) return r.result;
    const name = acc.name;
    if (!isSafeDbKey(name)) throw new functions.https.HttpsError("failed-precondition", "名前が正しくありません");
    const [payRec, homeShopId] = await Promise.all([readVal(`shops/${shopId}/private/pay/${name}`), readVal(`shops/${shopId}/settings/staffHomeShop/${name}`)]);
    const home = typeof homeShopId === "string" && isValidShopId(homeShopId) && homeShopId !== shopId ? homeShopId : "";
    const homeShopName = home ? await readVal(`global/shops/${home}/name`) : null;
    const g = planGetMyPay({ shopId, name, staff, payRec, homeShopId: home, homeShopName });
    throwPlanError(g);
    return { ...g.result, ...r.result, shopId };
  });

// 専用URLのお店をメールのアカウントに追加（方式 "page"・2026-10-05 ユーザー指示）。{token, pin?}。
// URL が使える状態（承認済み・名前がスタッフ一覧にある）を myPagePin と同じ myPageAccessCF で確かめ、名前は staffPages の name を使う
// （呼び出し元から受け取らない）。リンクすると getMyPay で会社が登録した賃金が見えるようになるので、暗証番号を決めている URL は
// myPagePin と同じ照合（試行回数をトランザクションで数える）を通す。決めていない URL は番号なしで通す
// （URL を持っていれば暗証番号を決めて賃金を開けるので、守りの強さは変わらない）。管理者の再承認はしない（URL の承認で済んでいる）
exports.linkStaffPage = functions
  .region("asia-northeast1")
  .https.onCall(async (data, context) => {
    const uid = linkAuthUid(context);
    if (!isSafeDbKey(uid)) throw new functions.https.HttpsError("invalid-argument", "アカウントが無効です");
    const email = context.auth.token && context.auth.token.email;
    if (typeof email !== "string" || !email) throw new functions.https.HttpsError("failed-precondition", "メールアドレスで登録したマイシフトのアカウントでログインしてください");
    const token = data && data.token;
    if (!isPageTokenCF(token)) throw new functions.https.HttpsError("invalid-argument", "URLが正しくありません");
    const tokenRec = await readVal(`staffPageTokens/${token}`);
    const shopId = tokenRec && tokenRec.shopId;
    if (!isValidShopId(shopId)) throw new functions.https.HttpsError("not-found", "このURLは見つかりませんでした");
    if (isDemoShop(shopId)) throw new functions.https.HttpsError("permission-denied", "体験版の店舗では使えません");
    const [pageRec, staff, owners, staffLinks, mirrorPeople, pinRec] = await Promise.all([
      readVal(`shops/${shopId}/staffPages/${token}`), readVal(`shops/${shopId}/staff`), readVal(`shops/${shopId}/owners`),
      readVal(`shops/${shopId}/staffLinks`), readVal(`shops/${shopId}/company/people`), readVal(`staffPagePins/${token}`),
    ]);
    const acc = myPageAccessCF({ token, tokenRec, pageRec, staff });
    throwPlanError(acc);
    if (!isSafeDbKey(acc.name)) throw new functions.https.HttpsError("failed-precondition", "名前が正しくありません");
    const nowIso = new Date().toISOString();
    // 先にリンクできるかを確かめる（できないのに暗証番号の試行回数を減らさない）
    const pre = planLinkStaffPage({ shopId, uid, name: acc.name, nowIso, owners, staffLinks, mirrorPeople });
    throwPlanError(pre);
    if (pre.already) return { ok: true, already: true, shopId, name: acc.name };
    const st = planMyPagePin({ action: "status", pinRec, pageRec, now: Date.now() });
    if (st.result && st.result.hasPin) {
      const pin = typeof (data && data.pin) === "string" ? data.pin : "";
      // 番号が入っていないときは照合しない（試行回数を減らさない）。画面はこの文言で暗証番号の欄を出す
      if (!/^[0-9]{4}$/.test(pin)) throw new functions.https.HttpsError("failed-precondition", "このURLの暗証番号（4桁）を入れてください");
      let r;
      await db.ref(`staffPagePins/${token}`).transaction(cur => {
        const pr = cur && typeof cur === "object" ? cur : null;
        const hash = pr && typeof pr.salt === "string" && /^[0-9]{4}$/.test(pin) ? payCodeHashCF(pr.salt, pin) : "";
        r = planMyPagePin({ action: "verify", pin, pinRec: pr, pageRec, now: Date.now(), nowIso, pinHash: hash });
        return r.pinPatch !== undefined ? r.pinPatch : cur;
      });
      throwPlanError(r);
    }
    await db.ref().update(pre.patch);
    await syncNameGuardsCF(shopId);
    return { ok: true, shopId, name: acc.name };
  });

exports.getMyPay = functions
  .region("asia-northeast1")
  .https.onCall(async (data, context) => {
    const uid = linkAuthUid(context);
    if (!isSafeDbKey(uid)) throw new functions.https.HttpsError("invalid-argument", "アカウントが無効です");
    const shopId = readLinkShopId(data);
    const email = context.auth.token && context.auth.token.email;
    const link = myPayLinkNameCF({ email, staffLink: await readVal(`shops/${shopId}/staffLinks/${uid}`) });
    throwPlanError(link);
    const name = link.name;
    if (!isSafeDbKey(name)) throw new functions.https.HttpsError("failed-precondition", "リンクの名前が正しくありません");
    const [staff, payRec, homeShopId] = await Promise.all([
      readVal(`shops/${shopId}/staff`), readVal(`shops/${shopId}/private/pay/${name}`), readVal(`shops/${shopId}/settings/staffHomeShop/${name}`),
    ]);
    const home = typeof homeShopId === "string" && isValidShopId(homeShopId) && homeShopId !== shopId ? homeShopId : "";
    const homeShopName = home ? await readVal(`global/shops/${home}/name`) : null;
    const r = planGetMyPay({ shopId, name, staff, payRec, homeShopId: home, homeShopName });
    throwPlanError(r);
    return r.result;
  });

// ============================================================
// 通知（Web Push・2026-10-08）
// 誰に何を送るかは functions/notify.js（純粋関数・tests/notify.test.js）。ここは読み込みと送信だけ。
// 送信は npm の web-push（標準の Web Push＝VAPID。FCM のコンソール設定に依存しない）。
// 秘密鍵は Secret Manager の VAPID_PRIVATE_KEY（runWith の secrets で process.env に入る。既存の STRIPE_SECRET_KEY と同じ形）。
// 1つの宛先の失敗で他の宛先を止めない。404/410（購読が無効になった）の記録は消す。
// ============================================================
const NOTIFY = require("./notify");
const webPush = require("web-push");
let _webPushReady = false;
function getWebPush() {
  const key = process.env.VAPID_PRIVATE_KEY;
  if (!key) { console.warn("VAPID_PRIVATE_KEY が未設定のため通知を送りません"); return null; }
  if (!_webPushReady) {
    // 鍵の形が壊れている（二重ペースト・改行の混入）と setVapidDetails が例外を投げる。関数ごと落とさず送らない側に倒す。
    // 値そのものはログに出さない（バイト長だけ。getStripe と同じ扱い）
    try { webPush.setVapidDetails(NOTIFY.VAPID_SUBJECT_CF, NOTIFY.VAPID_PUBLIC_KEY_CF, key.trim()); }
    catch (e) { console.error(`VAPID の設定に失敗（VAPID_PRIVATE_KEY ${Buffer.byteLength(key)}b）:`, e && e.message); return null; }
    _webPushReady = true;
  }
  return webPush;
}
// targets: [{path, sub, payload}]。同じ endpoint は1回だけ送る
async function sendPushTargets(targets) {
  const list = NOTIFY.dedupeTargetsCF(targets);
  const result = { sent: 0, removed: 0, failed: 0 };
  if (!list.length) return result;
  const wp = getWebPush();
  if (!wp) return result;
  await Promise.all(list.map(async t => {
    try {
      await wp.sendNotification(t.sub, JSON.stringify(t.payload), { TTL: 24 * 60 * 60, urgency: "normal" });
      result.sent++;
    } catch (e) {
      const code = e && e.statusCode;
      if (NOTIFY.pushErrorActionCF(code) === "delete") {
        result.removed++;
        try { await db.ref(t.path).remove(); } catch (e2) { console.warn("無効な購読の削除に失敗:", t.path, e2 && e2.message); }
      } else {
        result.failed++;
        console.warn("通知の送信に失敗:", code || "", e && e.message);
      }
    }
  }));
  return result;
}
// スタッフの宛先（staffRecipientsCF の結果）ごとに購読を読み、その宛先の payload を付けて返す
async function staffPushTargets(recipients) {
  const out = [];
  await Promise.all((recipients || []).map(async r => {
    const node = await readVal(`${r.base}/push`);
    NOTIFY.pushTargetsOfCF(node, `${r.base}/push`).forEach(t => out.push({ ...t, payload: r.payload }));
  }));
  return out;
}
// 管理者の宛先: private/push のうち、記録した uid がいまも owners にいる端末だけ
async function ownerPushTargets(shopId, payload) {
  const [node, owners] = await Promise.all([readVal(`shops/${shopId}/private/push`), readVal(`shops/${shopId}/owners`)]);
  return NOTIFY.pushTargetsOfCF(node, `shops/${shopId}/private/push`, { ownerUids: Object.keys(owners || {}) })
    .map(t => ({ ...t, payload }));
}

// 1. 新しい期間（スタッフ向け）。期間は savePeriods が丸ごと1エントリで新規作成する（diffPeriodsForFlatWrite）ので onCreate で1回
exports.notifyNewPeriod = functions
  .region("asia-northeast1")
  .runWith({ secrets: ["VAPID_PRIVATE_KEY"] })
  .database.ref("/shops/{shopId}/periods/{periodId}")
  .onCreate(async (snap, context) => {
    const { shopId, periodId } = context.params;
    if (!isValidShopId(shopId) || isDemoShop(shopId)) return null;
    const period = { ...(snap.val() || {}), id: periodId };
    const [shopName, staff, staffHidden, staffPages, staffLinks] = await Promise.all([
      readVal(`global/shops/${shopId}/name`), readVal(`shops/${shopId}/staff`), readVal(`shops/${shopId}/settings/staffHidden`),
      readVal(`shops/${shopId}/staffPages`), readVal(`shops/${shopId}/staffLinks`),
    ]);
    const plan = NOTIFY.planNewPeriodNotifyCF({ shopId, shopName, period, staff, staffHidden, staffPages, staffLinks, today: NOTIFY.jstTodayCF(Date.now()) });
    if (plan.skip) return null;
    const r = await sendPushTargets(await staffPushTargets(plan.recipients));
    console.log(`[notifyNewPeriod] shop=${shopId} period=${periodId} sent=${r.sent} removed=${r.removed} failed=${r.failed}`);
    return null;
  });

// 3. 提出（管理者向け）。subs は差分 update で書かれるが、トリガーには sub 全体の前後が来る
// ============================================================
// 提出データの監査（2026-10-08 ユーザー指示）。名前の一致で書ける提出を、オーナー以外が他人名義で上書き・削除・重複作成したときに、
// サーバーが確かめた uid（context.auth.uid）と変更前の値を shops/{sid}/private/subAudit/{期間ID}/{push id} に残す（オーナーだけが読める）。
// 判定は functions/sub-audit.js。通知（notifyStaffSubmit）とは別の関数にする（通知は提出以外の書き込みで先に戻り、回数の上限もあるため）。
// 記録を見る画面は無い（件数の基準値を測るための記録。読むときは shifty-prod-data-probe）
// ============================================================
const SUB_AUDIT_PERIOD_RE = /^[A-Za-z0-9_-]{1,64}$/;
exports.auditSubWrite = functions
  .region("asia-northeast1")
  .database.ref("/shops/{shopId}/subs/{subId}")
  .onWrite(async (change, context) => {
    const { shopId, subId } = context.params;
    if (!isValidShopId(shopId) || isDemoShop(shopId)) return null;
    // Admin SDK の書き込み（CF の改名・期間の削除など）は記録しない
    const authUid = context.authType === "USER" && context.auth && context.auth.uid;
    if (!authUid || !isSafeDbKey(authUid)) return null;
    const before = change.before.val(), after = change.after.val();
    const isOwner = (await readVal(`shops/${shopId}/owners/${authUid}`)) !== null;
    if (isOwner) return null;
    let samePeriodSubs = null;
    if (!before && after && typeof after.periodId === "string" && SUB_AUDIT_PERIOD_RE.test(after.periodId)) {
      samePeriodSubs = (await db.ref(`shops/${shopId}/subs`).orderByChild("periodId").equalTo(after.periodId).once("value")).val();
    }
    const decision = planSubAuditCF({ before, after, authUid, isOwner, samePeriodSubs, subId });
    if (!decision) return null;
    const rec = subAuditRecordCF({ decision, before, after, authUid, subId, nowIso: new Date().toISOString() });
    const pid = SUB_AUDIT_PERIOD_RE.test(rec.periodId) ? rec.periodId : "_unknown";
    await db.ref(`shops/${shopId}/private/subAudit/${pid}`).push(rec);
    return null;
  });

exports.notifyStaffSubmit = functions
  .region("asia-northeast1")
  .runWith({ secrets: ["VAPID_PRIVATE_KEY"] })
  .database.ref("/shops/{shopId}/subs/{subId}")
  .onWrite(async (change, context) => {
    const { shopId } = context.params;
    if (!isValidShopId(shopId) || isDemoShop(shopId)) return null;
    const before = change.before.val(), after = change.after.val();
    // 提出でない書き込み（管理者の編集・削除）はここで終わる＝余計な読み込みをしない
    if (!NOTIFY.isStaffSubmissionWriteCF(before, after)) return null;
    const [shopName, period, staffAliases] = await Promise.all([
      readVal(`global/shops/${shopId}/name`), readVal(`shops/${shopId}/periods/${after.periodId}`), readVal(`shops/${shopId}/settings/staffAliases`),
    ]);
    const plan = NOTIFY.planSubmitNotifyCF({ shopId, shopName, before, after, period, staffAliases });
    if (plan.skip) return null;
    // 店舗ごとの1時間あたりの上限（匿名の書き込みの繰り返しで通知をあふれさせない）。notifyRate はルールに無い＝CF だけが書く
    let allowed = false;
    await db.ref(`notifyRate/submit_${shopId}`).transaction(cur => {
      const nx = NOTIFY.nextSubmitNotifyRateCF(cur, Date.now());
      allowed = nx.allowed;
      return nx.rec;
    });
    if (!allowed) { console.warn(`[notifyStaffSubmit] shop=${shopId} 上限（${NOTIFY.SUBMIT_NOTIFY_LIMIT_PER_HOUR}/時）に達したので送らない`); return null; }
    const r = await sendPushTargets(await ownerPushTargets(shopId, plan.payload));
    console.log(`[notifyStaffSubmit] shop=${shopId} kind=${plan.kind} sent=${r.sent} removed=${r.removed} failed=${r.failed}`);
    return null;
  });

// 2・4. 締切日の昼12時（日本時間）。スタッフの提出締切（period.deadlineDate）と企業への提出締切（写しの deadlines・monthlyDeadlineDays）
exports.notifyDeadlines = functions
  .region("asia-northeast1")
  .runWith({ secrets: ["VAPID_PRIVATE_KEY"], timeoutSeconds: 300 })
  .pubsub.schedule("0 12 * * *")
  .timeZone("Asia/Tokyo")
  .onRun(async () => {
    const today = NOTIFY.jstTodayCF(Date.now());
    const shopIds = Object.keys((await readVal("global/shops")) || {}).filter(id => isValidShopId(id) && !isDemoShop(id));
    const total = { staffSent: 0, adminSent: 0, removed: 0, failed: 0, errors: 0 };
    for (const shopId of shopIds) {
      try {
        const [periods, company, shopName] = await Promise.all([
          readVal(`shops/${shopId}/periods`), readVal(`shops/${shopId}/company`), readVal(`global/shops/${shopId}/name`),
        ]);
        // スタッフの提出締切
        const due = NOTIFY.deadlinePeriodsCF(periods, today);
        if (due.length) {
          const [staff, staffHidden, staffAliases, staffPages, staffLinks] = await Promise.all([
            readVal(`shops/${shopId}/staff`), readVal(`shops/${shopId}/settings/staffHidden`), readVal(`shops/${shopId}/settings/staffAliases`),
            readVal(`shops/${shopId}/staffPages`), readVal(`shops/${shopId}/staffLinks`),
          ]);
          for (const period of due) {
            const subs = (await db.ref(`shops/${shopId}/subs`).orderByChild("periodId").equalTo(period.id).once("value")).val();
            const plan = NOTIFY.planDeadlineStaffNotifyCF({ shopId, shopName, period, subs, staff, staffHidden, staffAliases, staffPages, staffLinks });
            const r = await sendPushTargets(await staffPushTargets(plan.recipients));
            total.staffSent += r.sent; total.removed += r.removed; total.failed += r.failed;
          }
        }
        // 企業への提出締切
        const coDue = NOTIFY.planCompanyDeadlineNotifyCF({ shopId, shopName, company, periods, today });
        for (const item of coDue) {
          const r = await sendPushTargets(await ownerPushTargets(shopId, item.payload));
          total.adminSent += r.sent; total.removed += r.removed; total.failed += r.failed;
        }
      } catch (e) {
        total.errors++;
        console.warn(`[notifyDeadlines] shop=${shopId} の処理に失敗:`, e && e.message);
      }
    }
    console.log(`[notifyDeadlines] today=${today} shops=${shopIds.length} staffSent=${total.staffSent} adminSent=${total.adminSent} removed=${total.removed} failed=${total.failed} errors=${total.errors}`);
    return null;
  });
