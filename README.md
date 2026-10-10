# 月历 0.4

带优先级颜色的日历网页 App（PWA）。年 / 月 / 周三种视图（双指捏合切换），月视图逐周滚动、始终 6 行；底部菜单栏可点击也可长按拖动切换；今日列表、四象限总览；单个或批量添加事件，支持时间段、重复和提醒；浅色 / 深色；用自己的 GitHub 令牌多设备同步，令牌用密码加密；iOS / 安卓桌面小组件。

设置页里每一项旁边的 **?** 都有完整步骤，下面是概要。

## 文件

| 文件 | 作用 |
| --- | --- |
| `index.html` `styles.css` `js/` | App 本体 |
| `manifest.webmanifest` `sw.js` `icons/` | 添加到主屏幕、离线打开、接收推送 |
| `widget-ios-scriptable.js` | iOS 小组件脚本（Scriptable） |
| `widget.html` | 安卓小组件网页 |
| `.github/workflows/reminders.yml` `scripts/` | App 关闭时的提醒推送（GitHub Actions） |

## 1. 部署

1. 新建一个 Public 仓库，把压缩包里的**所有内容**上传到根目录。
   Mac 的访达默认隐藏 `.github` 文件夹，上传时如果没带上，之后可以在 App 的提醒帮助里一键复制，再在 GitHub 上新建这个文件。
2. 仓库 Settings → Pages → Deploy from a branch → `main` / `(root)` → Save。
3. iPhone 用 Safari 打开网址 → 分享 → 添加到主屏幕；安卓用 Chrome → 安装应用。

自己改代码后发布新版本：把 `version.json`、`sw.js` 的 `VERSION`、`js/store.js` 的 `MC.VERSION`、`index.html` 里的 `?v=` 改成同一个新版本号。App 打开时会在后台发现新版本并自动刷新；也可以在设置 → 检查更新 手动更新。

## 2. 同步（每人用自己的账号和数据）

GitHub → Settings → Developer settings → Personal access tokens → **Tokens (classic)** → Generate new token (classic)。Expiration 可选 No expiration，权限**只勾 `gist`**，生成后复制 `ghp_` 开头的令牌。

App → 设置 → 连接 GitHub → 粘贴令牌并设置密码。数据存在各自账号下的私密 Gist，互不相通；令牌用密码加密后只保存在本机。把设备交给别人前，可在「断开连接」里选择清除本机数据。

别人用你部署的网址时，同步和小组件都用他自己的账号；App 关闭时的后台提醒只推送给仓库主人，其他人需要 Fork 一份仓库自己设置。

## 3. 提醒通知

App 打开时到点直接提醒。App 关闭时由仓库里的 GitHub Actions 每 5 分钟检查并推送，需要设置一次：

1. 设置里打开「提醒通知」，允许通知（iPhone 需 iOS 16.4+，从主屏幕图标打开）。
2. 复制通知密钥，在仓库 Settings → Secrets and variables → Actions 新建：
   - `VAPID_PRIVATE_KEY` = 通知密钥
   - `GIST_TOKEN` = 你的 GitHub 令牌
3. 仓库 Actions 页 → 月历提醒 → Run workflow，出现绿色对勾即成功。

GitHub 定时任务高峰时会晚几分钟到十几分钟。仓库 60 天没有改动时定时任务会被暂停，点 GitHub 发来的邮件即可恢复。

## 4. 桌面小组件

- **iOS**：安装 Scriptable → 设置里「复制 iOS 小组件脚本」→ 在 Scriptable 新建并粘贴 → 桌面添加 Scriptable 小组件并选择该脚本。
- **安卓**：安装一个能显示网页的小组件 App → 设置里「复制安卓小组件链接」→ 粘贴进去。
