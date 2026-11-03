#!/bin/bash
# 发布 iPhone 安装包：把 build.sh 打好的 .ipa 推到仓库的 dist-ios 分支（只保留最新一个，不让仓库越来越大），
# 同时生成 AltStore / SideStore 的「源」（source.json）：在 AltStore / SideStore 里添加一次这个源，以后新版本会直接提示更新。
# 文件经国内镜像 jsDelivr 提供，国内不翻墙也能下载。
# 用法：先运行 bash ios/build.sh 打包，再运行 bash ios/publish-ipa.sh
set -euo pipefail
cd "$(dirname "$0")"
REPO_DIR=$(git rev-parse --show-toplevel)
REMOTE=$(git -C "$REPO_DIR" remote get-url origin)
SLUG=$(echo "$REMOTE" | sed -E 's#.*github.com[:/]##; s#\.git$##')
VER=$(plutil -extract version raw ../version.json | sed -E 's/-b[0-9]+$//')
BUILD=$(plutil -extract build raw version.json 2>/dev/null || echo 1)
IPA="build/节律-${VER}.ipa"
[ -f "$IPA" ] || { echo "❌ 没找到 $IPA，先运行 bash ios/build.sh"; exit 1; }
BASE="https://cdn.jsdelivr.net/gh/$SLUG@dist-ios"
SIZE=$(stat -f %z "$IPA")

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
cp "$IPA" "$TMP/Cadence.ipa"
cp App/Assets.xcassets/AppIcon.appiconset/icon-1024.png "$TMP/icon.png"
cat > "$TMP/source.json" <<EOF
{
  "name": "节律",
  "identifier": "io.github.salmangox.cadence.source",
  "subtitle": "日历、待办、课表、纪念日",
  "iconURL": "$BASE/icon.png",
  "apps": [{
    "name": "节律",
    "bundleIdentifier": "io.github.salmangox.cadence",
    "developerName": "Salmango",
    "subtitle": "日历、待办、课表、纪念日",
    "localizedDescription": "节律 iPhone 版：提醒由 iPhone 系统按时弹出，App 关着、断网也准时；支持 iCloud 云盘、GitHub、WebDAV 同步；导航用液态玻璃。",
    "iconURL": "$BASE/icon.png",
    "tintColor": "4C6EAC",
    "versions": [{
      "version": "$VER",
      "buildVersion": "$BUILD",
      "date": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
      "downloadURL": "$BASE/Cadence.ipa",
      "size": $SIZE,
      "minOSVersion": "26.0"
    }]
  }],
  "news": []
}
EOF
cd "$TMP"
git init -q && git checkout -q -b dist-ios && git add . && git commit -q -m "iPhone 安装包 $VER（$BUILD）"
echo "→ 推送到 dist-ios 分支…"
git push -q -f "$REMOTE" dist-ios
echo "→ 刷新国内镜像…"
for f in Cadence.ipa source.json icon.png; do curl -fsS "https://purge.jsdelivr.net/gh/$SLUG@dist-ios/$f" >/dev/null || true; done
echo "✅ 已发布 $VER（$BUILD）"
echo "   AltStore / SideStore 的源：$BASE/source.json"
echo "   安装包：$BASE/Cadence.ipa"
