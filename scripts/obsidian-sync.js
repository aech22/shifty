#!/usr/bin/env node
// Obsidian Projects/Shifty/ の変更を監視し、CLAUDE.md の末尾セクションを自動更新する

const fs = require("fs");
const path = require("path");

const VAULT_DIR = "/Users/hiroshi/Documents/Obsidian Vault/Projects/Shifty";
const CLAUDE_MD = path.join(__dirname, "../CLAUDE.md");
const CURSORRULES = path.join(__dirname, "../.cursorrules");
const SECTION_HEADER = "\n---\n\n## Obsidianノート（自動同期）\n";
const SECTION_MARKER = "## Obsidianノート（自動同期）";

function readAllNotes() {
  const files = fs.readdirSync(VAULT_DIR).filter(f => f.endsWith(".md"));
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
