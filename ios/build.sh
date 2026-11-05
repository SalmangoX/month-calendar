#!/bin/bash
# 节律 iPhone 版：生成 Xcode 工程 → 编译。
#   ./build.sh        生成安装包 build/节律-<版本>.ipa（不签名；用 AltStore / SideStore 安装时会用你自己的 Apple ID 签名）
#   ./build.sh sim    只编译模拟器版（检查能不能编译过）
set -uo pipefail
cd "$(dirname "$0")"

if ! xcodebuild -version >/dev/null 2>&1; then
  echo "❌ 需要先从 App Store 安装 Xcode，并打开一次让它装完组件。"; exit 1
fi
if ! command -v xcodegen >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then echo "→ 安装 XcodeGen…"; brew install xcodegen || exit 1
  else echo "❌ 需要 Homebrew（https://brew.sh），装好后重新运行。"; exit 1; fi
fi

# 开发团队 ID（只有用 Xcode 直接装到手机时才用到）：优先用 Team.xcconfig 里的，没有就从钥匙串里的 Apple Development 证书读
TEAM=$(sed -n 's/^DEVELOPMENT_TEAM *= *\([A-Z0-9]\{10\}\).*/\1/p' Team.xcconfig 2>/dev/null)
[ -z "$TEAM" ] && TEAM=$(security find-certificate -c "Apple Development" -p 2>/dev/null | openssl x509 -noout -subject 2>/dev/null \
                         | sed -n 's/.*OU *= *\([A-Z0-9]\{10\}\).*/\1/p' | head -1)
printf '// 你的 Apple 开发团队 ID，build.sh 自动填写\nDEVELOPMENT_TEAM = %s\n' "$TEAM" > Team.xcconfig

echo "→ 生成工程…"
xcodegen generate --quiet || exit 1

# 版本号和网页、Mac 用同一个（仓库根目录的 version.json）；ios/version.json 里的 build 每次改原生代码加一
VER=$(plutil -extract version raw ../version.json 2>/dev/null | sed -E 's/-b[0-9]+$//')
BUILD=$(plutil -extract build raw version.json 2>/dev/null || echo 1)
mkdir -p build

if [ "${1:-}" = "sim" ]; then
  echo "→ 编译模拟器版 ${VER}（${BUILD}）…"
  if ! xcodebuild -project CadenceiOS.xcodeproj -scheme Cadence -configuration Debug -sdk iphonesimulator \
       -derivedDataPath build/dd MARKETING_VERSION="$VER" CURRENT_PROJECT_VERSION="$BUILD" build > build/log.txt 2>&1; then
    echo "❌ 编译失败（完整日志在 ios/build/log.txt）："; grep -E "error:" build/log.txt | sort -u | head -30; exit 1
  fi
  echo "✅ 模拟器版：$(pwd)/build/dd/Build/Products/Debug-iphonesimulator/Cadence.app"
  exit 0
fi

echo "→ 编译 iPhone 安装包 ${VER}（${BUILD}）…（第一次大约一两分钟）"
if ! xcodebuild -project CadenceiOS.xcodeproj -scheme Cadence -configuration Release -sdk iphoneos -derivedDataPath build/dd \
     CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY="" \
     MARKETING_VERSION="$VER" CURRENT_PROJECT_VERSION="$BUILD" build > build/log.txt 2>&1; then
  echo "❌ 编译失败（完整日志在 ios/build/log.txt）："; grep -E "error:" build/log.txt | sort -u | head -30; exit 1
fi
APP="build/dd/Build/Products/Release-iphoneos/Cadence.app"
[ -d "$APP" ] || { echo "❌ 没找到 $APP"; exit 1; }
rm -rf build/Payload && mkdir -p build/Payload && cp -R "$APP" build/Payload/
IPA="build/节律-${VER}.ipa"
rm -f "$IPA" && (cd build && zip -qry "$(basename "$IPA")" Payload) && rm -rf build/Payload
echo "✅ 安装包：$(pwd)/$IPA"
echo "   用 AltStore / SideStore 打开它安装（会用你自己的 Apple ID 签名，并自动续期）。"
