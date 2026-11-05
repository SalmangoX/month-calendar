# 节律 · Cadence 1.4

带优先级颜色的日历：一份网页（PWA），外加 iPhone、Mac、安卓三个原生 App。三个 App 的界面都是同一份网页，原生只负责液态玻璃控件、桌面小组件、系统提醒和同步，所以**改网页不用重新打包**，各端打开就是新版。数据存在你自己的 GitHub Gist、WebDAV 网盘或 iCloud 云盘里，各端互通。

## 功能

- **日历**：年 / 月 / 周三种视图（双指捏合或点月份胶囊切换）。月视图整页铺满、逐周滚动，月份胶囊和星期条是悬浮的液态玻璃；跨天的全天事件连成一整条横条。可选「情绪光谱」：每一天一团自己颜色的柔光。
- **事件**：单个或批量添加，支持时间段、多天、重复和提醒。四档优先级 无 · 低 · 中 · 高（灰 · 天蓝 · 琥珀 · 朱红，按色彩心理设计，色条带相邻档位的渐变），用拖动条选。
- **今日页**：点左下角的时钟胶囊，从胶囊里长出一张大圆角卡片：今天的时间轴，加上逾期和接下来几天的事件。
- **日程（课表）**：从网页复制的表格、保存的 .html、课表照片都能识别导入；课程按科目自动配色；课前提醒。
- **记录日历**：从日历页左边拉出侧栏，新建和主日历分开的日历，可以单独设置是否显示在主日历、是否通知。打开「等级评分」后改用 4 个等级给事件评级，logo 菜单里多一个「统计」（按周 / 月 / 年看各等级的占比和时段热力图）。
- **纪念日历**：倒数日和纪念日，实心图标、主题背景、小纸条、相册、分享图片、提醒（提前几天 / 几小时）。
- **底部悬浮控件**：左边时钟胶囊（点开今日页），中间分页点（日历 ⇄ 日程），右边 logo（展开扇形：添加 · 设置，记录日历多一个统计）。不在今天时上方出现「回到今天」。
- **同步**：GitHub Gist、WebDAV（坚果云、Nextcloud、群晖等，国内也能用）、iCloud 云盘（iPhone / Mac App）三选一，多设备合并。安卓 App 还能每天自动备份到手机文件夹。
- **提醒**：网页打开时到点提醒；iPhone / Mac / 安卓 App 用系统通知，App 关着也准时；只用网页时由 GitHub Actions 推送。
- **外观和语言**：浅色 / 深色；12 / 24 小时制跟随地区；简体、繁体、English、Français、日本語。
- **桌面小组件**：整月、今日、课表、纪念日。iPhone / Mac 原生小组件、安卓原生小组件，没装 App 时还有 Scriptable 脚本（iOS）和网页版小组件，样式和颜色和 App 一致。

设置页里每一项旁边的 **?** 都有完整步骤，下面是概要。

## 文件

| 文件 | 作用 |
| --- | --- |
| `index.html` `styles.css` `days.css` `js/` | App 本体（网页），三个原生 App 加载的也是它 |
| `js/schedread.js` | 课表识别：网页表格、.html、课表照片（照片在网页里识别，第一次用时下载识别模型） |
| `js/native.js` | 原生 App 桥接，只在 App 里生效 |
| `js/i18n.js` | 翻译（繁体没写进字典的按字转换） |
| `manifest.webmanifest` `sw.js` `icons/` | 添加到主屏幕、离线打开、接收推送 |
| `privacy.html` `about.html` | 隐私政策、关于 |
| `widget-ios-scriptable.js` `widget-sched-scriptable.js` `widget-days-scriptable.js` | iOS 小组件脚本（Scriptable，不装 iPhone App 时用） |
| `widget.html` | 网页版小组件（不装安卓 App 时用） |
| `ios/` | iPhone App：网页外壳 + 原生液态玻璃控件 + 桌面小组件 + 系统提醒 + iCloud 同步（和 Mac 共用 `macos/` 里的大部分代码） |
| `macos/` | Mac App：同上，外加菜单栏月历 |
| `android/` | 安卓 App：网页外壳 + 原生悬浮控件（Jetpack Compose）+ 桌面小组件 + 精确闹钟提醒 + 自动备份 |
| `.github/workflows/pages.yml` | 发布网页，并自动生成版本号 |
| `.github/workflows/android.yml` | 编译、签名并发布安卓 App 到 Releases |
| `.github/workflows/reminders.yml` `scripts/` | 只用网页时，App 关着也推送提醒 |
| `CLAUDE.md` | 架构说明和设计规范（改代码前先看） |

## 1. 部署网页

1. 仓库 Settings → Pages → Build and deployment → Source 选 **GitHub Actions**。
2. 推送到 `main` 就会自动发布，版本号自动生成（例如 `1.4.2-b12`），所有设备打开时会在后台发现新版本并自动刷新。
3. iPhone 只用网页的话：Safari 打开网址 → 分享 → 添加到主屏幕。

根目录 `version.json` 是大版本（网页和三个 App 共用），想标记一次大改动时改它。源码里的 `?v=` 和 `sw.js` 的版本是占位，发布时自动改写，不用手改。

## 2. 同步（每人用自己的账号和数据）

设置 → 同步，三选一：

- **GitHub**：GitHub → Settings → Developer settings → Personal access tokens → **Tokens (classic)** → Generate new token (classic)。Expiration 可选 No expiration，权限**只勾 `gist`**，复制 `ghp_` 开头的令牌，粘贴到 App 里。数据存在你账号下的私密 Gist。
- **WebDAV**：填网盘的地址、账号和应用密码（坚果云在 账户信息 → 安全选项 里生成）。
- **iCloud 云盘**：只在 iPhone / Mac App 里有，打开开关即可。

令牌和密码只保存在本机。把设备交给别人前，可在「断开连接」里选择清除本机数据。

## 3. iPhone App

不上 App Store，用自己的 Apple ID（免费的就行）签名安装，需要 iOS 26 以上。最省事的是 iPhone 连上 Mac 后在仓库里运行：

```bash
bash ios/install-iphone.sh
```

它会编译、装到 iPhone，并在 Mac 上开一个后台任务：同一个 Wi-Fi 下每 5 天自动续签，GitHub 上有新版本时自动更新。也可以用 AltStore / SideStore 安装，详见 [`ios/安装说明.md`](ios/安装说明.md)。

## 4. Mac App

需要 macOS 14 以上（液态玻璃要 macOS 26）、Xcode（App Store 免费）和 Homebrew；Apple ID 免费账号就够。第一次先在 Xcode → 设置 → Accounts 登录 Apple ID，然后运行：

```bash
cd month-calendar/macos && ./build.sh
```

脚本会生成工程、编译、装进「应用程序」并打开。关掉窗口后留在菜单栏，点日历图标看本月和当天的事件；桌面小组件在桌面空白处右键 → 编辑小组件 → 搜索「节律」。只有改了 `macos/` 里的代码才需要重新运行。

Mac 版每 6 小时对比一次仓库里 `macos/version.json` 的 `build` 号，有新版本时菜单栏提示「更新…」，点它复制一行更新命令并打开终端，粘贴回车即可。`macos/make-dmg.sh` 可以打包成发给别人的 .dmg。

## 5. 安卓 App

App 的界面就是上面的网页，原生部分负责：底部悬浮控件、桌面小组件（整月 / 今日 / 课表 / 纪念日）、系统精确闹钟提醒（App 关着、断网也准时，开机和改时区后自动重新预约）、每 15 分钟后台同步、每天自动备份到手机文件夹。

### 第一次设置

**① 生成签名密钥（只做一次，以后每个版本都用它签名）**

```powershell
keytool -genkeypair -v -keystore month-calendar.jks -alias mcal -keyalg RSA -keysize 2048 -validity 36500 -storetype PKCS12
```

按提示设置密码（记住它），然后把密钥转成一行文本（Windows PowerShell：`[Convert]::ToBase64String([IO.File]::ReadAllBytes("$PWD\month-calendar.jks")) | Set-Clipboard`；Mac：`base64 -i month-calendar.jks | pbcopy`）。

`month-calendar.jks` 和密码一定要备份好，丢了就只能卸载重装 App。**不要**把 `.jks` 上传到仓库。

**② 在仓库里添加 3 个密钥**（Settings → Secrets and variables → Actions → New repository secret）

| Name | Secret |
| --- | --- |
| `ANDROID_KEYSTORE_B64` | 上一步复制的那一长串 |
| `ANDROID_KEYSTORE_PASSWORD` | 你设置的密码 |
| `ANDROID_KEY_ALIAS` | `mcal` |

**③** 推送后 Actions 自动编译，几分钟后在 **Releases** 里出现 `month-calendar.apk`。之前没设密钥时失败的那次，到 Actions → 安卓 App → Re-run jobs。

**④** 手机打开 `https://github.com/你的用户名/month-calendar/releases/latest` 下载安装。三星手机提示被拦截时：设置 → 安全和隐私 → **自动拦截器** 先关闭。

**⑤** 打开 App：设置 → 同步 连接账号；设置 → 提醒通知 打开，在卡片里检查通知、精确闹钟、电池三项权限，点「测试通知」后锁屏确认能收到；设置 → 桌面小组件 一键放到桌面。三星手机再到 设置 → 电池 → 后台使用限制，把节律加入「从不休眠的应用」。

同一台手机上如果还用 Chrome 打开过网页版并开了提醒，请在网页版里关掉，否则会收到两次。

### 以后怎么更新

- **只改网页**：照常推送，App 下次打开就是新版。
- **改了 `android/`**：推送后 Actions 自动发布新 APK（`android-<版本>-<序号>`），App 里 设置 → 安卓 App 点一下下载，覆盖安装，数据和设置都保留。
- 不要把 Android Studio 编出来的调试版 APK 装到手机上：签名和 Releases 里的不一样，装过之后就得卸载重装才能换回来。

### 网页和 App 的版本适配

- App 通过 `MCNative.info()` 报告自己的版本、接口版本和支持的功能，网页用 `MC.Native.has('功能名')` 判断，旧版 App 没有的功能就不显示。
- 只有删改了已有的原生方法时，才需要把 `Bridge.java` 的 `BRIDGE` 和 `js/native.js` 的 `NEED_BRIDGE` 一起加一。
- **数据格式**：原生端直接读同步文件里的 `events` / `courses` / `daily` 等来画小组件、排提醒。改网页时这些字段**只新增，不改名、不删除**；原生端会忽略不认识的字段，合并时原样保留。

## 6. 只用网页时的提醒（iPhone Safari）

网页打开时到点直接提醒。网页关着时由仓库里的 GitHub Actions 每 5 分钟检查并推送：设置 → 提醒通知 → 「App 关闭时也提醒」一键设置。GitHub 定时任务高峰时会晚几分钟；仓库 60 天没有改动时定时任务会被暂停，点 GitHub 发来的邮件即可恢复。

## 7. 不装 App 时的桌面小组件

- **iPhone**：安装 Scriptable → 设置里「复制 iOS 小组件脚本」→ 在 Scriptable 新建并粘贴 → 桌面添加 Scriptable 小组件并选择该脚本。课表、纪念日小组件同理。
- **安卓**：在 Play 商店装一个能在桌面显示网页的小组件 App（搜「web widget」），设置 → 安卓小组件 复制链接粘贴进去（需要先连接 GitHub 同步）。
