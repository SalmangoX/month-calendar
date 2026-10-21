#!/bin/bash
# 把编译好的节律打包成 .dmg 安装盘，放在桌面，可以直接发给别的 Mac。
set -uo pipefail
cd "$(dirname "$0")"

APP="build/Release/Cadence.app"
if [ ! -d "$APP" ]; then
  echo "→ 还没编译过，先编译…"; bash build.sh || exit 1
fi

WORK=$(mktemp -d)
STAGE="$WORK/stage"
mkdir -p "$STAGE"
ditto "$APP" "$STAGE/Cadence.app"
A="$STAGE/Cadence.app"
W="$A/Contents/PlugIns/CadenceWidgets.appex"

# 免费账号的开发描述文件只认这台 Mac，带着它别的 Mac 打不开：去掉描述文件，改成通用的本地签名
if find "$A" -name embedded.provisionprofile | grep -q .; then
  echo "→ 改成通用签名…"
  strip_ents() { # 取出原来的权限，去掉只能配合描述文件使用的几项
    codesign -d --entitlements - --xml "$1" > "$2" 2>/dev/null
    for k in com.apple.application-identifier com.apple.developer.team-identifier com.apple.security.get-task-allow; do
      /usr/libexec/PlistBuddy -c "Delete :$k" "$2" >/dev/null 2>&1
    done
  }
  strip_ents "$W" "$WORK/w.plist"
  strip_ents "$A" "$WORK/a.plist"
  find "$A" -name embedded.provisionprofile -delete
  codesign --force --sign - --options runtime --entitlements "$WORK/w.plist" "$W" || exit 1
  codesign --force --sign - --options runtime --entitlements "$WORK/a.plist" "$A" || exit 1
fi

ln -s /Applications "$STAGE/Applications"
cat > "$STAGE/打不开请看这里.txt" <<'TXT'
安装：把 Cadence 拖到右边的「Applications（应用程序）」文件夹。

第一次打开如果提示「无法验证开发者」或「已损坏」：
  方法一：打开 系统设置 → 隐私与安全性，拉到下面，在「已阻止使用 Cadence」旁点「仍要打开」。
  方法二：打开「终端」，粘贴下面这行回车（会要求输入开机密码），然后再打开节律：
          sudo xattr -cr /Applications/Cadence.app

打开后在设置里连接自己的 GitHub 账号同步数据；菜单栏右上角有日历图标；
桌面小组件：桌面空白处右键 → 编辑小组件 → 搜索「节律」。
TXT

OUT="$HOME/Desktop/节律-Cadence.dmg"
rm -f "$OUT"
echo "→ 制作安装盘…"
hdiutil create -volname "节律" -srcfolder "$STAGE" -ov -format UDZO "$OUT" >/dev/null || { rm -rf "$WORK"; exit 1; }
rm -rf "$WORK"
echo "✅ 安装盘在桌面：节律-Cadence.dmg"
open -R "$OUT"
