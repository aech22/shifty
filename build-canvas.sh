#!/bin/bash
# Canvas用単一HTMLファイルを生成するスクリプト
# 使い方: ./build-canvas.sh
# 出力: canvas.html

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INDEX="$SCRIPT_DIR/index.html"
APPJS="$SCRIPT_DIR/app.js"
OUTPUT="$SCRIPT_DIR/canvas.html"

# index.html から <script type="text/babel" src="app.js"...> 行を削除し、
# </body> の直前に app.js をインライン化して挿入する
python3 - <<'PYEOF'
import sys, os

script_dir = os.path.dirname(os.path.abspath(__file__)) if '__file__' in dir() else os.getcwd()

with open(os.path.join(script_dir, 'index.html'), 'r', encoding='utf-8') as f:
    html = f.read()

with open(os.path.join(script_dir, 'app.js'), 'r', encoding='utf-8') as f:
    appjs = f.read()

import re

# <script type="text/babel" src="app.js" ...></script> を削除
html = re.sub(r'<script[^>]+type=["\']text/babel["\'][^>]+src=["\']app\.js["\'][^>]*>\s*</script>', '', html)

# </body> の前にインラインスクリプトを挿入
inline = f'\n  <script type="text/babel" data-presets="react">\n{appjs}\n  </script>\n'
html = html.replace('</body>', inline + '</body>')

output_path = os.path.join(script_dir, 'canvas.html')
with open(output_path, 'w', encoding='utf-8') as f:
    f.write(html)

print(f"生成完了: {output_path}")
print(f"ファイルサイズ: {os.path.getsize(output_path) // 1024} KB")
PYEOF
