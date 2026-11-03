#!/bin/bash
# 把节律装到连着这台 Mac 的 iPhone 上（用 Xcode 里的免费开发者证书签名，手机上不用装 AltStore 之类的东西）。
#   bash ios/install-iphone.sh          现在就编译并安装（数据线或同一个 Wi-Fi 都行），并打开自动续期
#   bash ios/install-iphone.sh --renew  自动续期用（后台任务每 6 小时跑一次）：上次安装超过 5 天、手机连得上才重装，否则什么都不做
#   bash ios/install-iphone.sh --off    关掉自动续期（删掉后台任务）
# 免费证书签的名 7 天过期，所以要定期重装；重装不会丢数据。
set -uo pipefail
HOME_DIR="$HOME/Library/Application Support/Cadence"
WORK="$HOME_DIR/ios-build"                # 编译用的副本（后台任务读不了「桌面」文件夹，所以放这里）
STAMP="$HOME_DIR/iphone-installed"        # 上次成功安装的时间
LOG="$HOME_DIR/iphone-renew.log"
AGENT="$HOME/Library/LaunchAgents/io.github.salmangox.cadence.iphone-renew.plist"
TEAM=MXUS255FGQ
mkdir -p "$HOME_DIR"

if [ "${1:-}" = "--off" ]; then
  launchctl bootout "gui/$(id -u)" "$AGENT" 2>/dev/null; rm -f "$AGENT"
  echo "✅ 已关掉自动续期"; exit 0
fi

# 找连着的 iPhone（数据线或同一个 Wi-Fi），要已经配对、打开了开发者模式
find_phone() {
  local j; j=$(mktemp)
  xcrun devicectl list devices --json-output "$j" >/dev/null 2>&1
  python3 - "$j" <<'PY'
import json, sys
try: devs = json.load(open(sys.argv[1]))["result"]["devices"]
except Exception: devs = []
for d in devs:
    h, c, p = d.get("hardwareProperties", {}), d.get("connectionProperties", {}), d.get("deviceProperties", {})
    if h.get("reality") == "physical" and h.get("platform") == "iOS" and c.get("pairingState") == "paired" \
       and c.get("tunnelState") != "unavailable" and p.get("developerModeStatus") == "enabled":
        print(h.get("udid", "")); break
PY
  rm -f "$j"
}

if [ "${1:-}" = "--renew" ]; then
  exec >>"$LOG" 2>&1
  last=$(cat "$STAMP" 2>/dev/null || echo 0)
  [ $(( $(date +%s) - last )) -lt $(( 5 * 86400 )) ] && exit 0   # 5 天内装过：不用续
  echo "---- $(date '+%F %T') 自动续期"
else
  # 手动安装：先把仓库里最新的代码复制过去
  SRC="$(cd "$(dirname "$0")/.." && pwd)"
  mkdir -p "$WORK"
  rsync -a --delete --exclude build/ --exclude CadenceiOS.xcodeproj/ "$SRC/ios/" "$WORK/ios/"
  rsync -a --delete --exclude build/ --exclude Cadence.xcodeproj/ "$SRC/macos/" "$WORK/macos/"
  cp "$SRC/version.json" "$WORK/version.json"
fi

UDID=$(find_phone)
if [ -z "$UDID" ]; then
  [ "${1:-}" = "--renew" ] && { echo "手机不在身边（或没解锁、不在同一个 Wi-Fi），下次再试"; exit 0; }
  echo "❌ 没找到可用的 iPhone：用数据线连上 Mac、解锁，并在 设置 → 隐私与安全性 里打开「开发者模式」"; exit 1
fi

cd "$WORK/ios" || { echo "❌ 还没有编译用的副本，先在仓库里运行一次 bash ios/install-iphone.sh"; exit 1; }
printf 'DEVELOPMENT_TEAM = %s\n' "$TEAM" > Team.xcconfig
xcodegen generate --quiet || exit 1
VER=$(plutil -extract version raw ../version.json | sed -E 's/-b[0-9]+$//')
BUILD=$(plutil -extract build raw version.json 2>/dev/null || echo 1)
echo "→ 编译并签名 ${VER}（${BUILD}）…"  # 编译目标就是这台 iPhone：第一次会把它登记到你的开发者账号，签名才包含它
mkdir -p build
if ! xcodebuild -project CadenceiOS.xcodeproj -scheme Cadence -configuration Release -destination "id=$UDID" \
     -derivedDataPath build/dev -allowProvisioningUpdates -allowProvisioningDeviceRegistration \
     DEVELOPMENT_TEAM="$TEAM" MARKETING_VERSION="$VER" CURRENT_PROJECT_VERSION="$BUILD" build > build/dev-log.txt 2>&1; then
  echo "❌ 编译失败（日志：$WORK/ios/build/dev-log.txt）"; grep -E "error:" build/dev-log.txt | sort -u | head -10; exit 1
fi
echo "→ 安装到 iPhone…"
if ! xcrun devicectl device install app --device "$UDID" build/dev/Build/Products/Release-iphoneos/Cadence.app >/dev/null 2>build/install-err.txt; then
  echo "❌ 安装失败："; tail -5 build/install-err.txt; exit 1
fi
date +%s > "$STAMP"
echo "✅ 已装到 iPhone（$(date '+%F %T')）"

# 打开自动续期：每 6 小时检查一次（只在需要时才真正重装）
if [ ! -f "$AGENT" ]; then
  cat > "$AGENT" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>io.github.salmangox.cadence.iphone-renew</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$WORK/ios/install-iphone.sh</string><string>--renew</string></array>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
  <key>StartInterval</key><integer>21600</integer>
  <key>RunAtLoad</key><true/>
</dict></plist>
EOF
  launchctl bootstrap "gui/$(id -u)" "$AGENT" 2>/dev/null
  echo "✅ 已打开自动续期：手机和 Mac 在同一个 Wi-Fi 时，每 5 天自动重装一次（关掉：bash ios/install-iphone.sh --off）"
fi
