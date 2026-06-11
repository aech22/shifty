// 店舗一括登録スクリプト（本番Firebase: ontheshift）
// 実行: node scripts/seed_shops.js

const { initializeApp, cert, applicationDefault } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const { getAuth } = require("firebase-admin/auth");

const app = initializeApp({
  credential: cert("/Users/hiroshi/Downloads/ontheshift-firebase-adminsdk-fbsvc-acef00aa69.json"),
  databaseURL: "https://ontheshift-default-rtdb.firebaseio.com",
});

const db = getDatabase(app);
const auth = getAuth(app);

// --- 登録データ ---
const SHOPS_DATA = [
  { name: "心斎橋",     excelName: "心斎橋" },
  { name: "文蔵天満橋", excelName: "天文" },
  { name: "京月天満橋", excelName: "天京" },
  { name: "京月梅田",   excelName: "梅田" },
  { name: "炭えん３ビル",  excelName: "炭３" },
  { name: "炭えんバル地下", excelName: "炭バルチカ" },
  { name: "魚えん",     excelName: "魚えん" },
  { name: "小鉄４ビル", excelName: "４ビル" },
  { name: "小鉄難波",   excelName: "小鉄難波" },
];

const CORPORATE_EMAIL = "hiroshi.nishio.00@gmail.com";
const DEFAULT_PW = "admin1234";

// app.js と同じ genSecureId ロジック
const crypto = require("crypto");
function genSecureId(len = 24) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@%&*+-=?_~";
  const arr = crypto.randomBytes(len);
  return Array.from(arr, b => chars[b % chars.length]).join("");
}
function genToken() {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  let t = "";
  const arr = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) t += chars[arr[i] % chars.length];
  return t;
}

function makePeriod(shopId) {
  const td = new Date();
  const yr = td.getFullYear(), mo = td.getMonth() + 1;
  const ms = String(mo).padStart(2, "0");
  return {
    id: `p_${Date.now()}`,
    urlToken: genToken(),
    shopId,
    label: `${yr}年${mo}月前半`,
    startDate: `${yr}-${ms}-01`,
    endDate: `${yr}-${ms}-15`,
    deadlineDate: "",
    createdAt: new Date().toISOString(),
  };
}

const CAND_WEEKDAY = [
  { id: "c1", label: "ランチ",    start: "11:00", end: "16:00" },
  { id: "c2", label: "ディナー",  start: "17:00", end: "23:00" },
  { id: "c3", label: "通し",      start: "11:00", end: "23:00" },
];

async function main() {
  // --- 企業アカウントのUID取得（なければ作成） ---
  let uid;
  try {
    const user = await auth.getUserByEmail(CORPORATE_EMAIL);
    uid = user.uid;
    console.log(`既存ユーザー: ${CORPORATE_EMAIL} uid=${uid}`);
  } catch (e) {
    if (e.code === "auth/user-not-found") {
      const user = await auth.createUser({ email: CORPORATE_EMAIL, displayName: "企業アカウント" });
      uid = user.uid;
      console.log(`新規ユーザー作成: ${CORPORATE_EMAIL} uid=${uid}`);
    } else {
      throw e;
    }
  }

  const shopIdMap = {};

  for (const shopData of SHOPS_DATA) {
    const shopId = genSecureId(24);
    const now = new Date().toISOString();

    // shops/{shopId}
    const shop = { id: shopId, name: shopData.name, createdAt: now };
    await db.ref(`shops/${shopId}/settings`).set({
      shopId,
      password: DEFAULT_PW,
      excelShopName: shopData.excelName,
      candidates: CAND_WEEKDAY,
      weekdayCandidates: { 0: CAND_WEEKDAY, 6: CAND_WEEKDAY },
      dateCandidates: {},
      templates: [],
    });

    // デフォルト期間
    const period = makePeriod(shopId);
    await db.ref(`shops/${shopId}/periods/${period.id}`).set(period);

    // staff (空)
    await db.ref(`shops/${shopId}/staff`).set([]);

    // global/shops
    await db.ref(`global/shops/${shopId}`).set(shop);

    // accounts/{shopId}/plan = "pro"
    await db.ref(`accounts/${shopId}`).set({
      plan: "pro",
      planExpiry: "2099-12-31",
    });

    // accounts/{uid}/shops/{shopId}
    await db.ref(`accounts/${uid}/shops/${shopId}`).set(true);

    shopIdMap[shopData.name] = shopId;
    console.log(`✅ ${shopData.name} (${shopData.excelName}) → shopId: ${shopId}`);
  }

  console.log("\n=== 完了 ===");
  console.log(`企業UID: ${uid}`);
  console.log("登録店舗:", JSON.stringify(shopIdMap, null, 2));
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
