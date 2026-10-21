#!/bin/bash
# 节律 Mac 版：生成 Xcode 工程 → 编译 → 装进「应用程序」并打开。改了 macos 文件夹里的代码后重新运行即可。
set -uo pipefail
cd "$(dirname "$0")"

if ! xcodebuild -version >/dev/null 2>&1; then
  echo "❌ 需要先从 App Store 安装 Xcode，并打开一次让它装完组件。"; exit 1
fi
if ! command -v xcodegen >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    echo "→ 安装 XcodeGen…"; brew install xcodegen || exit 1
  else
    echo "❌ 需要 Homebrew（https://brew.sh），装好后重新运行。"; exit 1
  fi
fi

# 开发团队 ID：优先用 Team.xcconfig 里的，没有就从钥匙串里的 Apple Development 证书读
TEAM=$(sed -n 's/^DEVELOPMENT_TEAM *= *\([A-Z0-9]\{10\}\).*/\1/p' Team.xcconfig 2>/dev/null)
if [ -z "$TEAM" ]; then
  TEAM=$(security find-certificate -c "Apple Development" -p 2>/dev/null | openssl x509 -noout -subject 2>/dev/null \
         | sed -n 's/.*OU *= *\([A-Z0-9]\{10\}\).*/\1/p' | head -1)
fi
if [ -z "$TEAM" ]; then
  cat <<'MSG'
❌ 还没有开发证书（免费的 Apple ID 就够）。
   打开 Xcode → 设置 → Accounts → 左下角 + 登录 Apple ID →
   选中你的团队 → Manage Certificates… → + → Apple Development，然后重新运行 ./build.sh
MSG
  exit 1
fi
printf '// 你的 Apple 开发团队 ID，build.sh 自动填写\nDEVELOPMENT_TEAM = %s\n' "$TEAM" > Team.xcconfig
echo "→ 团队 $TEAM"

echo "→ 生成工程…"
xcodegen generate --quiet || exit 1

VER=$(plutil -extract version raw version.json 2>/dev/null || echo 1.0.0)
BUILD=$(plutil -extract build raw version.json 2>/dev/null || echo 1)
echo "→ 编译 ${VER}（${BUILD}）…（第一次大约一两分钟）"
mkdir -p build
if ! xcodebuild -project Cadence.xcodeproj -target Cadence -configuration Release -allowProvisioningUpdates \
     DEVELOPMENT_TEAM="$TEAM" MARKETING_VERSION="$VER" CURRENT_PROJECT_VERSION="$BUILD" build > build/log.txt 2>&1; then
  echo "❌ 编译失败，下面是错误（完整日志在 macos/build/log.txt）："
  grep -E "error:|错误" build/log.txt | sort -u | head -30
  exit 1
fi

APP="build/Release/Cadence.app"
[ -d "$APP" ] || { echo "❌ 没找到 $APP"; exit 1; }
osascript -e 'tell application id "io.github.salmangox.cadence" to quit' >/dev/null 2>&1
sleep 1
rm -rf /Applications/Cadence.app
ditto "$APP" /Applications/Cadence.app
killall chronod 2>/dev/null || true # 让系统重新加载小组件（不然桌面上可能还是旧样子）
open /Applications/Cadence.app
echo "✅ 已安装到「应用程序」并打开。桌面小组件：在桌面空白处右键 → 编辑小组件 → 搜索「节律」。"
