/**
 * learn-style.js
 * 手動で収集した投稿サンプルを Claude で分析し、
 * 自然な日本語投稿スタイルガイドを style-guide.json に保存する。
 *
 * 使い方:
 *   node learn-style.js          # 分析 + 保存
 *   node learn-style.js --show   # 保存済みスタイルガイドを表示
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const Anthropic = require("@anthropic-ai/sdk");
const fs = require("fs");
const path = require("path");

const anthropic = new Anthropic.default();
const STYLE_FILE = path.join(__dirname, "style-guide.json");

// ── 学習用サンプル投稿 ────────────────────────────────────────────────────
// 飲食店・SaaS・業務効率化系アカウントの自然な日本語投稿を参考に作成

const SAMPLE_POSTS = [
  // 共感・課題提起型
  "シフト表、まだExcelで手作りしてますか？\n集計ミス、調整の連絡、印刷…毎月これで1〜2時間消えてませんか😮‍💨",
  "「あの子、今月何時間入れたっけ」\nすぐ確認できたら楽なのに、って思ったことありませんか？",
  "バイトさんのシフト希望、LINEで来てそれをExcelに転記して…この作業、地味に時間かかりますよね。",
  "飲食店の悩みあるある\n・シフト希望の集め方がバラバラ\n・直前の変更が多くて管理が大変\n・Excelの数式が崩れる\n全部あるある😅",

  // 機能紹介・使用例型
  "Shiftyの使い方はシンプル。\n①スタッフにURLを送る\n②希望を入力してもらう\n③管理者がExcel出力\n\nこれだけです✅",
  "スタッフはアプリのインストール不要。\nURLを開いて希望を入れるだけ。\nスマホでもPCでもOKです📱",
  "希望シフトの締め切り日を設定しておけば、それ以降は入力できなくなります。\n「まだ提出してない人がいる」の確認も一覧で一目瞭然👀",
  "Excel出力したら、そのまま印刷できます。\nフォーマットを整える手間、ゼロ。",

  // 告知・リリース型
  "Shifty、リリースしました🎉\n飲食店のシフト管理をもっとラクに。\nまずは無料でお試しください👇",
  "【お知らせ】\n複数店舗の管理に対応しました。\nチェーン店や複数拠点を持つ方はぜひ✨",
  "夏のかき入れ時、シフト管理で消耗していませんか？\nShiftyなら希望収集〜Excel出力まで全部まとめて。\n無料から使えます🍧",

  // 柔らかい共感型
  "今日もお疲れさまでした🍺\n飲食業界で働く皆さんを、もっとラクにしたくてShiftyを作りました。",
  "「使ってみたら意外と簡単だった」\nそう言ってもらえるのが一番うれしいです😊",
  "シフト管理、ちょっとだけラクになったら\nその分スタッフとの会話に使ってほしい。\nそんな気持ちで作っています。",

  // 問いかけ・エンゲージメント型
  "シフト希望の集め方、今どうしてますか？\nLINE / 紙 / Excel / その他\n教えてもらえると嬉しいです🙋",
  "飲食店の管理者さんに聞きたいのですが、シフト作成にかかる時間、1回あたりどのくらいですか？",
];

// ── Claude でスタイル分析 ─────────────────────────────────────────────────

async function analyzeStyle(samples) {
  const sampleText = samples
    .map((t, i) => `[${i + 1}] ${t.replace(/\n/g, "↵")}`)
    .join("\n");

  console.log("🤖 Claude でスタイルを分析中...");

  const message = await anthropic.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 3000,
    thinking: { type: "adaptive" },
    messages: [
      {
        role: "user",
        content: `以下は飲食店向けSaaSアプリ「Shifty」のXアカウント用に作成した投稿サンプルです。
このスタイルを学習して、同じトーン・文体で投稿を生成するためのスタイルガイドをJSON形式で作成してください。

【投稿サンプル】
${sampleText}

【出力形式】JSONのみ（マークダウンなし）:
{
  "tone": "投稿全体のトーン",
  "characteristics": ["文体の特徴1", "特徴2", "特徴3", "特徴4", "特徴5"],
  "sentence_length": "文の長さの傾向",
  "effective_emojis": ["絵文字1", "絵文字2", "絵文字3", "絵文字4", "絵文字5"],
  "hashtags": ["#シフト管理", "#飲食店", "#業務効率化", "#スタッフ管理", "#無料ツール"],
  "post_types": {
    "empathy": "課題提起・共感型の書き方のコツ",
    "howto": "使い方紹介型の書き方のコツ",
    "announce": "告知・リリース型の書き方のコツ",
    "soft": "柔らかい共感型の書き方のコツ",
    "question": "問いかけ型の書き方のコツ"
  },
  "do": ["やるべきこと1", "やるべきこと2", "やるべきこと3"],
  "dont": ["避けるべきこと1", "避けるべきこと2", "避けるべきこと3"],
  "example_templates": [
    "テンプレート1（[変数]で可変部分を示す）",
    "テンプレート2",
    "テンプレート3",
    "テンプレート4",
    "テンプレート5"
  ],
  "analyzed_at": "${new Date().toISOString()}"
}`,
      },
    ],
  });

  const text = message.content.find((b) => b.type === "text")?.text ?? "{}";
  try {
    return JSON.parse(text.trim());
  } catch {
    const match = text.match(/\{[\s\S]+\}/);
    return match ? JSON.parse(match[0]) : {};
  }
}

// ── メイン ───────────────────────────────────────────────────────────────

async function main() {
  if (process.argv.includes("--show")) {
    if (fs.existsSync(STYLE_FILE)) {
      const guide = JSON.parse(fs.readFileSync(STYLE_FILE, "utf8"));
      console.log(JSON.stringify(guide, null, 2));
    } else {
      console.log("style-guide.json がまだありません。先に node learn-style.js を実行してください。");
    }
    return;
  }

  console.log(`📚 ${SAMPLE_POSTS.length} 件のサンプルからスタイルを学習します...\n`);

  const guide = await analyzeStyle(SAMPLE_POSTS);

  fs.writeFileSync(STYLE_FILE, JSON.stringify(guide, null, 2));

  console.log("\n✅ style-guide.json を保存しました\n");
  console.log("【分析結果】");
  console.log(`トーン: ${guide.tone}`);
  console.log(`文の長さ: ${guide.sentence_length}`);
  console.log(`特徴: ${(guide.characteristics ?? []).join(" / ")}`);
  console.log(`推奨絵文字: ${(guide.effective_emojis ?? []).join(" ")}`);
  console.log("\nやるべきこと:");
  (guide.do ?? []).forEach((d) => console.log(`  ✅ ${d}`));
  console.log("\n避けること:");
  (guide.dont ?? []).forEach((d) => console.log(`  ❌ ${d}`));
  console.log("\nテンプレート例:");
  (guide.example_templates ?? []).forEach((t, i) => console.log(`  ${i + 1}. ${t}`));
}

main().catch(console.error);
