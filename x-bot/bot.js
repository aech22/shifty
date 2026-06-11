require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const { TwitterApi } = require("twitter-api-v2");
const Anthropic = require("@anthropic-ai/sdk");
const cron = require("node-cron");
const fs = require("fs");
const path = require("path");

// ── クライアント初期化 ──────────────────────────────────────────────────────

const twitter = new TwitterApi({
  appKey: process.env.X_API_KEY,
  appSecret: process.env.X_API_SECRET,
  accessToken: process.env.X_ACCESS_TOKEN,
  accessSecret: process.env.X_ACCESS_SECRET,
});

const anthropic = new Anthropic.default();

// ── スタイルガイド読み込み ────────────────────────────────────────────────────

const STYLE_FILE = path.join(__dirname, "style-guide.json");

function loadStyleGuide() {
  try {
    return JSON.parse(fs.readFileSync(STYLE_FILE, "utf8"));
  } catch {
    return null;
  }
}

function styleGuidePrompt() {
  const guide = loadStyleGuide();
  if (!guide) return "";
  return `
【投稿スタイルガイド（学習済み）】
トーン: ${guide.tone ?? ""}
特徴: ${(guide.characteristics ?? []).join("、")}
推奨絵文字: ${(guide.effective_emojis ?? []).join(" ")}
やるべきこと: ${(guide.do ?? []).join("、")}
避けること: ${(guide.dont ?? []).join("、")}
テンプレート例:
${(guide.example_templates ?? []).map((t, i) => `  ${i + 1}. ${t}`).join("\n")}

上記のスタイルを参考にして、自然な日本語で文章を作成してください。`;
}

// ── 状態ファイル（処理済みメンションIDを保存）──────────────────────────────

const STATE_FILE = path.join(__dirname, "state.json");

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { lastMentionId: null };
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ── レポートファイル保存 ────────────────────────────────────────────────────

function saveReport(content) {
  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const file = path.join(__dirname, "reports", `report-${ts}.md`);
  fs.mkdirSync(path.join(__dirname, "reports"), { recursive: true });
  fs.writeFileSync(file, content);
  console.log(`[レポート保存] ${file}`);
}

// ── メンション取得 ──────────────────────────────────────────────────────────

async function fetchMentions(sinceId) {
  const me = await twitter.v2.me();
  const params = {
    max_results: 50,
    "tweet.fields": ["created_at", "author_id", "text", "in_reply_to_user_id"],
    expansions: ["author_id"],
    "user.fields": ["username", "name"],
  };
  if (sinceId) params.since_id = sinceId;

  const resp = await twitter.v2.userMentionTimeline(me.data.id, params);
  const tweets = resp.data?.data ?? [];
  const users = {};
  (resp.data?.includes?.users ?? []).forEach((u) => {
    users[u.id] = u;
  });

  return tweets.map((t) => ({
    id: t.id,
    text: t.text,
    authorId: t.author_id,
    username: users[t.author_id]?.username ?? "unknown",
    name: users[t.author_id]?.name ?? "unknown",
    createdAt: t.created_at,
  }));
}

// ── Claude でメンションを分類 + 返信文案生成 ────────────────────────────────

async function classifyAndReply(mentions) {
  if (mentions.length === 0) return [];

  const mentionsText = mentions
    .map((m, i) => `[${i + 1}] @${m.username}: ${m.text}`)
    .join("\n");

  const message = await anthropic.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    messages: [
      {
        role: "user",
        content: `あなたはShiftyというシフト管理アプリの公式Xアカウントの担当者です。
以下のメンション/リプライを分析して、JSON配列で返してください。

【アプリ概要】
Shifty — 飲食店向けシフト提出・管理Webアプリ。スタッフがシフトを提出し、管理者が確認・Excel出力できる。
${styleGuidePrompt()}
【メンション一覧】
${mentionsText}

【出力形式】
以下のJSON配列で返してください（マークダウンなし、JSONのみ）：
[
  {
    "index": 番号,
    "category": "bug" | "improvement" | "positive" | "question" | "other",
    "summary": "日本語で20文字以内の要約",
    "reply": "返信文（140文字以内、丁寧な日本語、改行なし）"
  }
]

【返信の方針】
- bug: 報告に感謝し、確認中と伝える
- improvement: 要望に感謝し、検討すると伝える
- positive: 喜びを表現し、引き続きよろしくと伝える
- question: 簡潔に回答する（わからない場合はDMで詳細を聞く）
- other: 丁寧に対応する

返信文には「@ユーザー名」を含めないでください（自動付与されます）。`,
      },
    ],
  });

  // thinking ブロックを除いたテキストを取得
  const textBlock = message.content.find((b) => b.type === "text");
  const raw = textBlock?.text ?? "[]";

  try {
    const parsed = JSON.parse(raw.trim());
    return parsed.map((item, i) => ({
      ...item,
      mention: mentions[item.index - 1] ?? mentions[i],
    }));
  } catch (e) {
    console.error("[JSON解析エラー]", e.message, raw.slice(0, 200));
    return [];
  }
}

// ── レポート生成（Claude でサマリー）────────────────────────────────────────

async function generateReport(classified) {
  const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  const header = `# Shifty X フィードバックレポート\n生成日時: ${now}\n\n`;

  if (classified.length === 0) {
    saveReport(header + "新しいメンションはありませんでした。\n");
    return;
  }

  const byCategory = { bug: [], improvement: [], positive: [], question: [], other: [] };
  classified.forEach((c) => {
    const cat = c.category ?? "other";
    (byCategory[cat] = byCategory[cat] ?? []).push(c);
  });

  const detailLines = classified
    .map((c) => `- [${c.category}] @${c.mention?.username}: ${c.summary}`)
    .join("\n");

  const summaryMsg = await anthropic.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 1000,
    thinking: { type: "adaptive" },
    messages: [
      {
        role: "user",
        content: `以下はShiftyアプリへの今回のXメンション分類結果です。
開発者向けに300文字以内で重要な傾向をまとめてください。

${detailLines}`,
      },
    ],
  });

  const summaryText = summaryMsg.content.find((b) => b.type === "text")?.text ?? "";

  const sections = Object.entries(byCategory)
    .filter(([, items]) => items.length > 0)
    .map(([cat, items]) => {
      const labels = { bug: "🐛 バグ報告", improvement: "💡 改善要望", positive: "👍 好意的反応", question: "❓ 質問", other: "📌 その他" };
      const lines = items.map((c) => `- @${c.mention?.username}: ${c.summary}`).join("\n");
      return `## ${labels[cat] ?? cat} (${items.length}件)\n${lines}`;
    })
    .join("\n\n");

  const report = `${header}## 全体サマリー\n${summaryText}\n\n---\n\n${sections}\n\n---\n\n## 詳細\n${detailLines}\n`;
  saveReport(report);
  console.log(report);
}

// ── 返信を投稿 ──────────────────────────────────────────────────────────────

async function postReplies(classified) {
  for (const item of classified) {
    if (!item.reply || !item.mention?.id) continue;
    try {
      await twitter.v2.reply(item.reply, item.mention.id);
      console.log(`[返信済] @${item.mention.username}: ${item.reply.slice(0, 40)}...`);
      await new Promise((r) => setTimeout(r, 2000)); // レート制限対策
    } catch (e) {
      console.error(`[返信エラー] @${item.mention.username}:`, e.message);
    }
  }
}

// ── メインルーティン ─────────────────────────────────────────────────────────

async function runRoutine() {
  console.log(`\n[${new Date().toLocaleString("ja-JP")}] ルーティン開始`);

  const state = loadState();
  let mentions = [];

  try {
    mentions = await fetchMentions(state.lastMentionId);
    console.log(`[取得] ${mentions.length} 件のメンション`);
  } catch (e) {
    console.error("[メンション取得エラー]", e.message);
    return;
  }

  // 最新のIDを記録
  if (mentions.length > 0) {
    const maxId = mentions.reduce((a, b) => (BigInt(a.id) > BigInt(b.id) ? a : b)).id;
    saveState({ lastMentionId: maxId });
  }

  // 分類 + 返信文案生成
  const classified = await classifyAndReply(mentions);

  // 返信投稿
  await postReplies(classified);

  // レポート生成
  await generateReport(classified);

  console.log("[ルーティン完了]\n");
}

// ── エントリーポイント ────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes("--test-post")) {
  // テスト投稿
  (async () => {
    console.log("テスト投稿中...");
    try {
      const res = await twitter.v2.tweet("【テスト】Shiftyサポートボットが起動しました。このツイートはすぐに削除されます。");
      console.log("投稿成功:", res.data.id);
      await new Promise((r) => setTimeout(r, 3000));
      await twitter.v2.deleteTweet(res.data.id);
      console.log("削除完了");
    } catch (e) {
      console.error("エラー:", e.message);
    }
  })();
} else if (args.includes("--test-fetch")) {
  // メンション取得テスト
  (async () => {
    console.log("メンション取得テスト...");
    try {
      const mentions = await fetchMentions(null);
      console.log(`${mentions.length} 件取得:`);
      mentions.slice(0, 5).forEach((m) => console.log(`  @${m.username}: ${m.text.slice(0, 60)}`));
    } catch (e) {
      console.error("エラー:", e.message);
    }
  })();
} else {
  // 即時1回実行 + スケジュール設定
  runRoutine();

  // 毎日 9:00 と 21:00（日本時間）
  cron.schedule("0 9 * * *", runRoutine, { timezone: "Asia/Tokyo" });
  cron.schedule("0 21 * * *", runRoutine, { timezone: "Asia/Tokyo" });

  console.log("スケジュール設定完了（毎日 9:00 / 21:00 JST）");
  console.log("Ctrl+C で停止\n");
}
