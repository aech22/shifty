#!/usr/bin/env node
// Obsidian Projects/Shifty/ の変更を監視し、CLAUDE.md の末尾セクションを自動更新する

const fs = require("fs");
const path = require("path");

const VAULT_DIR = "/Users/hiroshi/Documents/Obsidian Vault/Projects/Shifty";
const CLAUDE_MD = path.join(__dirname, "../CLAUDE.md");
const CURSORRULES = path.join(__dirname, "../.cursorrules");
const SECTION_MARKER = "## Obsidianノート（自動同期）";
const SECTION_PREFIX = "\n---\n\n";                       // マーカーの前に置く区切り
const SECTION_HEADER = SECTION_PREFIX + SECTION_MARKER + "\n";

// 同期対象は許可リスト方式（2026-07-07に除外リスト方式から反転）。
// 理由: 全ノート埋め込みでCLAUDE.mdが187KBまで肥大化し、コンテキストノイズで
// モデル（特にSonnet系）の指示遵守率とキャッシュ効率を悪化させていたため。
// - バグチェックログ（85KB・全履歴）: 最新1件はCLAUDE.md手動部にあるため不要
// - bug-check等スキル6本: .claude/commands のコピーでありスキルとして読み込み済み（二重）
// - RULES/VISION/コードレビュー/実装ログ等: スキルが必要時にReadする設計のため常駐不要
// CLAUDE.md / .cursorrules 自身を含めると再帰肥大化するので、許可リストに追加してはいけない。
const INCLUDE_NOTES = new Set(["BACKLOG.md"]);

function readAllNotes() {
  const files = fs.readdirSync(VAULT_DIR).filter(f => INCLUDE_NOTES.has(f));
  return files.map(f => {
    const content = fs.readFileSync(path.join(VAULT_DIR, f), "utf8").trim();
    return `### ${f.replace(".md", "")}\n${content}`;
  }).join("\n\n");
}

function updateClaudeMd(notes) {
  let content = fs.readFileSync(CLAUDE_MD, "utf8");
  const idx = content.indexOf(SECTION_MARKER);
  if (idx !== -1) {
    // 区切り（SECTION_PREFIX）ごと切り落とす。長さを固定値で持つと
    // 削り残しが同期のたびに "-" 行として蓄積するため、必ず実長で計算する
    const start = idx - SECTION_PREFIX.length;
    content = content.slice(0, content.startsWith(SECTION_PREFIX, start) ? start : idx);
  }
  content += SECTION_HEADER + notes + "\n";
  fs.writeFileSync(CLAUDE_MD, content, "utf8");
}

function updateCursorRules(notes) {
  let content = fs.readFileSync(CURSORRULES, "utf8");
  const marker = "\n## Obsidianノート（自動同期）";
  const idx = content.indexOf(marker);
  if (idx !== -1) {
    content = content.slice(0, idx);
  }
  content += marker + "\n" + notes + "\n";
  fs.writeFileSync(CURSORRULES, content, "utf8");
}

function sync() {
  try {
    const notes = readAllNotes();
    updateClaudeMd(notes);
    updateCursorRules(notes);
    console.log(`[${new Date().toLocaleTimeString()}] 同期完了`);
  } catch (e) {
    console.error("同期エラー:", e.message);
  }
}

// 起動時に1回同期
sync();

// --once: 監視せず1回だけ同期して終了（クリーンアップ/手動再生成用）
if (process.argv.includes("--once")) {
  process.exit(0);
}

// 監視開始
let debounceTimer = null;
fs.watch(VAULT_DIR, { recursive: true }, (event, filename) => {
  if (!filename || !filename.endsWith(".md")) return;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    console.log(`[${new Date().toLocaleTimeString()}] 変更検知: ${filename}`);
    sync();
  }, 500);
});

console.log(`監視中: ${VAULT_DIR}`);
