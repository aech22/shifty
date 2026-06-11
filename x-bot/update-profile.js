require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const { TwitterApi } = require("twitter-api-v2");
const fs = require("fs");

const twitter = new TwitterApi({
  appKey: process.env.X_API_KEY,
  appSecret: process.env.X_API_SECRET,
  accessToken: process.env.X_ACCESS_TOKEN,
  accessSecret: process.env.X_ACCESS_SECRET,
});

(async () => {
  // プロフィール画像
  console.log("プロフィール画像をアップロード中...");
  try {
    const avatar = fs.readFileSync("/tmp/favicon.svg.png");
    await twitter.v1.updateAccountProfileImage(avatar);
    console.log("✅ プロフィール画像 設定完了");
  } catch (e) {
    console.error("❌ プロフィール画像エラー:", JSON.stringify(e?.data), e?.message, e?.code);
  }

  // 自己紹介文
  console.log("自己紹介文を更新中...");
  try {
    await twitter.v1.updateAccountProfile({
      description: "🍽️ 飲食店向けシフト管理アプリ「Shifty」公式アカウント\nスタッフのシフト提出→Excel出力がワンクリックで。\n無料から使えます📋\n\nご質問・不具合報告はこちらへお気軽に💬",
    });
    console.log("✅ 自己紹介文 設定完了");
  } catch (e) {
    console.error("❌ 自己紹介文エラー:", JSON.stringify(e?.data), e?.message, e?.code);
  }

  // バナー画像
  console.log("バナー画像をアップロード中...");
  try {
    const banner = fs.readFileSync("/tmp/x-banner-crop.png");
    await twitter.v1.updateAccountProfileBanner(banner);
    console.log("✅ バナー画像 設定完了");
  } catch (e) {
    console.error("❌ バナー画像エラー:", JSON.stringify(e?.data), e?.message, e?.code);
  }
})();
