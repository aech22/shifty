#!/bin/bash
# クラウドセッション開始時に Obsidian Vault の Knowledge を読ませるフック。
# ローカル（Mac）ではユーザー設定が /Users/hiroshi/Documents/Obsidian Vault/Knowledge/ を直接読ませるので何もしない。
# クラウドのコンテナにはそのパスが無いため、Vault を private の GitHub リポジトリとして持ち込み、
# 同じ3ファイルを読むよう指示を出す（stdout はセッションの文脈に入る）。
#
# Vault リポジトリ名は環境変数 OBSIDIAN_VAULT_REPO（owner/name）で変えられる。既定は aech22/obsidian-vault。
# 中身はここに貼らずパスだけを渡す（ファイルが大きくなっても文脈の上限に当たらないように）。
set -u

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

VAULT_REPO="${OBSIDIAN_VAULT_REPO:-aech22/obsidian-vault}"
VAULT_NAME="${VAULT_REPO##*/}"
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
KNOWLEDGE_FILES="mistakes.md profile.md session-rules.md"

# セッション開始時に一緒に選んだリポジトリは、作業リポジトリと同じ階層に clone されている
VAULT_DIR=""
for d in "${OBSIDIAN_VAULT_DIR:-}" "$(dirname "$PROJECT_DIR")/$VAULT_NAME" "$HOME/$VAULT_NAME"; do
  if [ -n "$d" ] && [ -d "$d/Knowledge" ]; then VAULT_DIR="$d"; break; fi
done

# 見つからなければ clone を試す（セッションに付いていない private リポジトリは認証で失敗する）
if [ -z "$VAULT_DIR" ]; then
  target="$(dirname "$PROJECT_DIR")/$VAULT_NAME"
  if GIT_TERMINAL_PROMPT=0 timeout 60 git clone -q --depth 1 "https://github.com/$VAULT_REPO" "$target" >/dev/null 2>&1 \
     && [ -d "$target/Knowledge" ]; then
    VAULT_DIR="$target"
  fi
else
  # 既にあるなら最新にする（失敗しても古い内容で続ける）
  GIT_TERMINAL_PROMPT=0 timeout 30 git -C "$VAULT_DIR" pull -q --ff-only >/dev/null 2>&1 || true
fi

echo "## Obsidian Vault（クラウドセッション）"
if [ -n "$VAULT_DIR" ]; then
  echo "ユーザー設定の「Obsidian ファイルを必ず確認する」は、クラウドでは次のパスで行う。作業に入る前に Read ツールで3つとも読み、記載された指示・ルール・タスクに従うこと。"
  for f in $KNOWLEDGE_FILES; do
    if [ -f "$VAULT_DIR/Knowledge/$f" ]; then
      echo "- $VAULT_DIR/Knowledge/$f"
    else
      echo "- $VAULT_DIR/Knowledge/$f（見つからない。ユーザーに伝えること）"
    fi
  done
  echo "Vault のほかのノート（例: Projects/Shifty/バグチェックログ.md）も $VAULT_DIR 配下にある。"
  echo "Vault のファイルを書き換えたら、$VAULT_DIR で commit して push すること（push しないとローカルの Obsidian に届かない）。"
else
  echo "Vault リポジトリ $VAULT_REPO がこのセッションに付いていないため、Knowledge を読めていない。"
  echo "作業に入る前に add_repo（owner と repo を分けて渡す）でこのリポジトリを付け、案内どおり $(dirname "$PROJECT_DIR")/$VAULT_NAME へ clone し、"
  echo "Knowledge/ の $KNOWLEDGE_FILES を Read ツールで読んでから作業すること。付けられなければ、その旨をユーザーに伝えてから作業する。"
fi
exit 0
