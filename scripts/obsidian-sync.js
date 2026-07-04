#!/usr/bin/env node
// Obsidian Projects/Shifty/ の変更を監視し、CLAUDE.md の末尾セクションを自動更新する

const fs = require("fs");
const path = require("path");

const VAULT_DIR = "/Users/hiroshi/Documents/Obsidian Vault/Projects/Shifty";
const CLAUDE_MD = path.join(__dirname, "../CLAUDE.md");
const CURSORRULES = path.join(__dirname, "../.cursorrules");
const SECTION_HEADER = "\n---\n\n## Obsidianノート（自動同期）\n";
const SECTION_MARKER = "## Obsidianノート（自動同期）";

// 同期対象から除外するファイル。
// CLAUDE.md / .cursorrules は md_to_obsidian フックでこの同期元フォルダにもコピーされるため、
// ここで読み込むと「自分自身を自分の中に埋め込む」再帰が起きて無限に肥大化する。必ず除外する。
const EXCLUDE_NOTES = new Set(["CLAUDE.md", ".cursorrules.md"]);

function readAllNotes() {
  const files = fs.readdirSync(VAULT_DIR).filter(f => f.endsWith(".md") && !EXCLUDE_NOTES.has(f));
  return files.map(f => {
    const content = fs.readFileSync(path.join(VAULT_DIR, f), "utf8").trim();
    return `### ${f.replace(".md", "")}\n${content}`;
  }).join("\n\n");
}

function updateClaudeMd(notes) {
  let content = fs.readFileSync(CLAUDE_MD, "utf8");
  const idx = content.indexOf(SECTION_MARKER);
  if (idx !== -1) {
    content = content.slice(0, idx - 4); // "\n---\n" の手前まで
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
