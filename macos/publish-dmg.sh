#!/bin/bash
# 发布 Mac 安装包：把「应用程序」里这份节律打成 .dmg，推到仓库的 dist 分支（只保留最新一个，不让仓库越来越大），
# 再刷新国内镜像 jsDelivr 的缓存。没装 Xcode 的 Mac（比如国内的朋友）在「更新…」里就是从这里下载安装包。
# 用法：先用 build.sh 编译安装好最新版，再在仓库里运行 bash macos/publish-dmg.sh
set -euo pipefail
cd "$(dirname "$0")"
REPO_DIR=$(git rev-parse --show-toplevel)
REMOTE=$(git -C "$REPO_DIR" remote get-url origin)
SLUG=$(echo "$REMOTE" | sed -E 's#.*github.com[:/]##; s#\.git$##')
APP=/Applications/Cadence.app
VER=$(defaults read "$APP/Contents/Info" CFBundleShortVersionString)
BUILD=$(defaults read "$APP/Contents/Info" CFBundleVersion)

NO_REVEAL=1 bash make-dmg.sh
DMG="$HOME/Desktop/节律-Cadence-$VER.dmg"
[ -f "$DMG" ] || { echo "❌ 没找到 $DMG"; exit 1; }

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
cp "$DMG" "$TMP/Cadence.dmg"
printf '{ "version": "%s", "build": %s }\n' "$VER" "$BUILD" > "$TMP/mac.json"
cd "$TMP"
git init -q && git checkout -q -b dist && git add . && git commit -q -m "Mac 安装包 $VER（$BUILD）"
echo "→ 推送到 dist 分支…"
git push -q -f "$REMOTE" dist
echo "→ 刷新国内镜像…"
for f in Cadence.dmg mac.json; do curl -fsS "https://purge.jsdelivr.net/gh/$SLUG@dist/$f" >/dev/null || true; done
for f in macos/version.json version.json; do curl -fsS "https://purge.jsdelivr.net/gh/$SLUG@main/$f" >/dev/null || true; done
echo "✅ 已发布 $VER（$BUILD）：https://cdn.jsdelivr.net/gh/$SLUG@dist/Cadence.dmg"
