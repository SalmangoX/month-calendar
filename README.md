# 节律 · Cadence 0.19

（原名「月历」）带优先级颜色的日历网页 App（PWA），外加安卓和 Mac 原生 App。

- **视图**：年 / 月 / 周三种视图（双指捏合切换），月视图逐周滚动、始终 6 行；跨天的全天事件连成一整条横条；底部菜单栏可点击也可长按拖动切换。
- **事件**：单个或批量添加，都支持时间段、多天、重复和提醒；四档优先级（高 / 中 / 低 / 无）按色彩心理设计，色弱也能分辨。
- **记录日历**：在日历页从左往右滑出侧栏，可新建和主日历分开的记录日历，每个日历可单独设置是否显示在主日历、是否通知。
- **今日列表、四象限、课表**：课程按科目自动配色（数学偏蓝、经济偏绿、语言偏杏……），同时在色环上均匀分开。
- **外观**：浅色 / 深色，配色取自图标；12 / 24 小时制默认跟随地区。
- **同步**：用自己的 GitHub 令牌多设备同步。
- **桌面小组件**：iOS（Scriptable）/ 安卓原生 / Mac 原生 / 网页版，样式和颜色与 App 一致。

设置页里每一项旁边的 **?** 都有完整步骤，下面是概要。

## 文件

| 文件 | 作用 |
| --- | --- |
| `index.html` `styles.css` `js/` | App 本体（网页） |
| `js/native.js` | 原生 App 桥接（安卓、Mac 共用），只在 App 里生效，浏览器和 iPhone 上什么都不做 |
| `manifest.webmanifest` `sw.js` `icons/` | 添加到主屏幕、离线打开、接收推送 |
| `widget-ios-scriptable.js` `widget-sched-scriptable.js` | iOS 小组件脚本（Scriptable） |
| `widget.html` | 网页版安卓小组件（不装 App 时用） |
| `android/` | 安卓原生 App：网页外壳 + 原生小组件 + 系统精确闹钟提醒 |
| `macos/` | Mac 原生 App：网页外壳 + 菜单栏月历 + 桌面小组件 + 系统通知（在自己的 Mac 上用 `macos/build.sh` 编译） |
| `.github/workflows/pages.yml` | 发布网页，并自动生成版本号 |
| `.github/workflows/android.yml` | 编译、签名并发布安卓 App 到 Releases |
| `.github/workflows/reminders.yml` `scripts/` | 网页版在 App 关闭时的提醒推送（iPhone 用） |
| `.github/workflows/apply-zip.yml` | 可选：把更新压缩包上传到根目录后自动解压（手机上没法上传文件夹时用） |

## 1. 部署网页

1. 仓库 Settings → Pages → Build and deployment → Source 选 **GitHub Actions**。
2. 把压缩包里的文件按原来的路径上传到仓库根目录（更新包只包含改动过的文件）。每次推送都会自动发布，版本号自动生成（例如 `0.9.0-b12`），所有设备打开时会在后台发现新版本并自动刷新。
3. iPhone 用 Safari 打开网址 → 分享 → 添加到主屏幕。

`version.json` 里的版本号只是「大版本」，想标记一次大改动时改它即可，其他三处（`sw.js`、`js/store.js`、`index.html` 的 `?v=`）发布时会自动改写，平时不用管。如果仍用「Deploy from a branch」发布，就需要像以前一样手动把这四处改成同一个版本号。

## 2. 同步（每人用自己的账号和数据）

GitHub → Settings → Developer settings → Personal access tokens → **Tokens (classic)** → Generate new token (classic)。Expiration 可选 No expiration，权限**只勾 `gist`**，生成后复制 `ghp_` 开头的令牌。

App → 设置 → 连接 GitHub → 粘贴令牌。数据存在各自账号下的私密 Gist，互不相通；令牌只保存在本机。把设备交给别人前，可在「断开连接」里选择清除本机数据。

## 3. 安卓 App

App 的界面就是上面这个网页，每次打开都加载最新版，**改网页不需要重新打包 APK**。原生部分只负责：

- **桌面小组件**：整月（格子高时显示事件名，矮时显示圆点，可翻月；折叠屏内外屏各自排版）、今日（已逾期 + 今天 + 接下来一周）、课表（今天的课，正在上的高亮）。
- **提醒**：用系统精确闹钟在本机弹出，App 关着、断网也准时；包括每日未完成提醒；开机、改时区后自动重新预约。
- **后台同步**：每 15 分钟从 Gist 拉一次（只读），其他设备的改动也会更新到小组件和提醒。

### 第一次设置

**① 生成签名密钥（只做一次，以后每个版本都用它签名）**

在 Windows 的 PowerShell 里，进入一个你会长期保存的文件夹，运行：

```powershell
& "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" -genkeypair -v -keystore month-calendar.jks -alias mcal -keyalg RSA -keysize 2048 -validity 36500 -storetype PKCS12
```

按提示设置密码（记住它），姓名等问题可以直接回车，最后输入 `y` 确认。然后把密钥转成文本并复制到剪贴板：

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("$PWD\month-calendar.jks")) | Set-Clipboard
```

`month-calendar.jks` 和密码一定要备份好。丢了就只能卸载重装 App（数据在 GitHub 里不会丢，但要重新连接、重新放小组件）。**不要**把 `.jks` 文件上传到仓库。

**② 在仓库里添加 3 个密钥**

仓库 Settings → Secrets and variables → Actions → New repository secret：

| Name | Secret |
| --- | --- |
| `ANDROID_KEYSTORE_B64` | 刚才复制到剪贴板的那一长串 |
| `ANDROID_KEYSTORE_PASSWORD` | 你设置的密码 |
| `ANDROID_KEY_ALIAS` | `mcal` |

**③ 上传 `android` 文件夹**，Actions 会自动编译，大约 5 分钟后在仓库的 **Releases** 里出现 `month-calendar.apk`。如果之前已经上传过、但当时还没设密钥，到 Actions → 安卓 App → 点失败的那次 → Re-run jobs。

**④ 在手机上安装**

用手机打开 `https://github.com/你的用户名/month-calendar/releases/latest`，下载 `month-calendar.apk` 并打开。三星手机如果提示被拦截：设置 → 安全和隐私 → **自动拦截器** 先关闭，装完可以再打开；Chrome 询问「安装未知应用」时允许即可。

**⑤ 打开 App 设置**

1. 设置 → 连接 GitHub，粘贴令牌（App 和 Chrome 的存储是分开的，需要再粘贴一次）。
2. 打开「提醒通知」并允许，然后点「提醒权限检查」，把通知、精确闹钟、电池三项都设成 ✓。三星手机再到 设置 → 电池 → 后台使用限制，确认「休眠应用」「深度休眠应用」里没有节律，最好加入「从不休眠的应用」。
3. 点「10 秒后测试」，马上回到桌面锁屏，收到测试通知就说明后台提醒正常。
4. 在设置里点 整月 / 今日 / 课表小组件，一键放到桌面。

如果同一台手机上还装着 Chrome 版的节律并开了提醒，请在 Chrome 版里关掉「提醒通知」，否则会收到两次。

### 以后怎么更新

- **只改网页**：照常推送，App 下次打开就是新版，不用动 APK。
- **改了 `android/` 里的原生代码**：把 `android/version.properties` 的 `versionName` 加一后推送，Actions 自动发布新 APK；App 打开时会提示有新版本，在 设置 → 安卓 App 点一下下载，安装会直接覆盖，数据和设置都保留。
- 在电脑上用 Android Studio 打开 `android` 文件夹可以浏览和调试代码，但**不要把 Android Studio 编出来的 APK 装到手机上**：它用的是调试签名，和 Releases 里的不一样，装过之后就得卸载重装才能换回来。

### 网页和 App 的版本适配

- App 通过 `MCNative.info()` 报告自己的版本、接口版本 `bridge` 和支持的功能列表。网页用 `MC.Native.has('功能名')` 判断，旧版 App 没有的功能就不显示，不会出错。
- 只有删改了已有的原生方法时，才需要把 `android/.../Bridge.java` 的 `BRIDGE` 和 `js/native.js` 的 `NEED_BRIDGE` 一起加一，旧版 App 会提示更新。新增方法不用改版本号。
- **数据格式**：原生端直接读取 Gist 里的 `mcal-calendar.json` 来画小组件、排提醒。以后改网页时，`events` / `courses` / `daily` 里的字段**只新增，不改名、不删除**；原生端会忽略不认识的字段，合并时原样保留。

### Mac App

需要 macOS 14 以上、Xcode（App Store 免费）和 Homebrew；Apple ID 免费账号就够。第一次先在 Xcode → 设置 → Accounts 登录 Apple ID，然后在终端运行：

```
cd month-calendar/macos && ./build.sh
```

脚本会生成工程、编译、装进「应用程序」并打开。窗口里就是网页版（改网页不用重新编译）；关掉窗口后留在菜单栏，点日历图标看本月和当天的事件；桌面小组件在桌面空白处右键 → 编辑小组件 → 搜索「节律」。macOS 26 上菜单栏的按钮和面板是液态玻璃，小组件的「清透 / 着色」样式由系统处理。只有改了 `macos/` 里的代码才需要重新运行 `build.sh`。

## 4. 网页版的提醒通知（iPhone）

App 打开时到点直接提醒。App 关闭时由仓库里的 GitHub Actions 每 5 分钟检查并推送：在设置里打开「提醒通知」，再点「App 关闭时也提醒」一键设置。GitHub 定时任务高峰时会晚几分钟到十几分钟；仓库 60 天没有改动时定时任务会被暂停，点 GitHub 发来的邮件即可恢复。

## 5. iOS 桌面小组件

安装 Scriptable → 设置里「复制 iOS 小组件脚本」→ 在 Scriptable 新建并粘贴 → 桌面添加 Scriptable 小组件并选择该脚本。课表小组件同理。
