const { initializeApp, cert } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const { getAuth } = require("firebase-admin/auth");

const app = initializeApp({
  credential: cert("/Users/hiroshi/Downloads/ontheshift-firebase-adminsdk-fbsvc-acef00aa69.json"),
  databaseURL: "https://ontheshift-default-rtdb.firebaseio.com",
});
const db = getDatabase(app);
const auth = getAuth(app);

async function main() {
  const user = await auth.getUserByEmail("hiroshi.nishio.00@gmail.com");
  const uid = user.uid;

  const shopsSnap = await db.ref(`accounts/${uid}/shops`).once("value");
  const shopIds = Object.keys(shopsSnap.val() || {});

  console.log(`uid: ${uid}\n`);
  console.log("店舗名\t\t\tshopId");
  console.log("─".repeat(60));

  for (const shopId of shopIds) {
    const snap = await db.ref(`global/shops/${shopId}`).once("value");
    const shop = snap.val();
    const name = shop?.name || "(不明)";
    console.log(`${name}\t${shopId}`);
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
