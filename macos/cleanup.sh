#!/bin/bash
# 清理多余的节律：只保留「应用程序」里的 /Applications/Cadence.app，
# 删掉编译过程中留下的其他副本（下载文件夹、编译目录、Xcode 缓存等），并让系统忘掉它们（启动台、Spotlight、小组件列表里不再重复出现）。
KEEP="/Applications/Cadence.app"
LSR=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
{
  mdfind "kMDItemCFBundleIdentifier == 'io.github.salmangox.cadence'" 2>/dev/null
  find "$HOME/Downloads" "$HOME/Desktop" "$HOME/Library/Application Support/Cadence" "$HOME/Library/Developer/Xcode/DerivedData" \
       -name "Cadence.app" -type d -prune 2>/dev/null
} | sort -u | while IFS= read -r a; do
  [ -z "$a" ] || [ "$a" = "$KEEP" ] && continue
  case "$a" in /Volumes/*) continue ;; esac # 挂载着的安装盘不动
  echo "  删除多余的副本：$a"
  "$LSR" -u "$a" >/dev/null 2>&1
  rm -rf "$a"
done
[ -d "$KEEP" ] && "$LSR" -f "$KEEP" >/dev/null 2>&1 # 重新登记正确的那个
killall chronod 2>/dev/null || true                  # 小组件列表刷新
