#!/bin/bash
# 节律 Mac 版更新：从 GitHub 下载最新的 macos 源码 → 编译 → 替换「应用程序」里的节律并重新打开。
# 用法（节律菜单栏里点「更新…」会自动复制这一行）：
#   curl -fsSL https://raw.githubusercontent.com/SalmangoX/month-calendar/main/macos/update.sh | bash
set -euo pipefail
REPO="${CADENCE_REPO:-SalmangoX/month-calendar}"
DIR="$HOME/Library/Application Support/Cadence/source"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "→ 下载最新源码…"
curl -fsSL "https://codeload.github.com/$REPO/zip/refs/heads/main" -o "$TMP/src.zip"
unzip -q "$TMP/src.zip" -d "$TMP"
SRC=$(find "$TMP" -maxdepth 2 -type d -name macos | head -1)
[ -n "$SRC" ] || { echo "❌ 仓库里没有 macos 文件夹"; exit 1; }

# 源码放在固定位置，保留本机生成的团队设置和编译缓存，下次更新更快
mkdir -p "$DIR"
rsync -a --delete --exclude build/ --exclude Cadence.xcodeproj/ --exclude Team.xcconfig "$SRC/" "$DIR/"
bash "$DIR/build.sh"
