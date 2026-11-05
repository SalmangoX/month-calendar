# 节律 · Cadence — 项目说明（给 AI 助手和自己看）

每个新对话开始先读这份。用户用中文交流，回复、代码注释、提交信息都用中文。

## 这是什么

带优先级颜色的日历 App：月 / 周 / 年视图、今日页、日程（课表）、记录日历（带等级评分和统计）、纪念日历。
一份网页 + 安卓 / iOS / Mac 三个原生壳，数据存在用户自己的 GitHub Gist / WebDAV / iCloud 里，各端互通。

## 架构：改一个东西要去哪里改

| 平台 | 界面由谁画 | 位置 |
| --- | --- | --- |
| 网页（浏览器 / PWA） | 网页 | `index.html` `styles.css` `days.css` `js/` |
| iPhone | **网页**（WKWebView 加载线上网址）+ 原生画底部悬浮控件和液态玻璃 | `ios/App/`，原生层和 Mac 共用 `macos/App/GlassNav.swift` |
| Mac | 同 iPhone | `macos/App/`、`macos/Shared/` |
| 安卓 | **原生**（Kotlin + Jetpack Compose）：主日历、今日、新建 / 编辑、底部悬浮控件；日程、纪念日、设置等暂时还是 WebView 加载网页 | `android/app/src/main/kotlin/…/monthcalendar/`（`ui/` 是界面），老的 Java 部分负责小组件、提醒、同步 |

- **只改网页**：浏览器、iPhone、Mac 立刻都变（推送后 GitHub Pages 自动发布，App 打开就加载新网页，不用重新打包）。安卓上只有还在用 WebView 的那几页会变。
- **安卓原生的那几页**（日历、今日、编辑、底部控件）要在 Kotlin 里单独改一遍。是否改回「网页 + 原生悬浮层」（和 iPhone 一样）还没定，动手前先问用户。
- **iPhone / Mac 的底部悬浮控件**（时钟胶囊 · 分页点 · logo 扇形 · 回到今天）是 `GlassNav.swift` 里的 `GlassDock`，用系统 Liquid Glass 画；点按交给网页里同名的按钮（`#bubbleToday` `#pager` `#fanAdd` `#fanSet` `#fanCal` `#calBack` `#schedBack`），网页那一份在 App 里只是 `visibility:hidden`（今日页展开动画还要用它的位置）。状态由注入脚本 `navJS`（`ios/App/WebShell.swift`、`macos/App/MainWindow.swift` 各一份，两份要一起改）发给原生。
- **iPhone / Mac 上网页里的玻璃控件**：`js/ui.js` 的 `LG_SEL` 里列出的元素，由原生在同样位置画系统液态玻璃（`MC.LG`）。
- **纪念日历**（`body[data-kind="days"]`）还用旧的底部菜单栏 `#dock` / `#tabbar` 和加号 `#fab`。

## 设计规范（用户逐条确认过的，别改回去）

- 苹果式的简洁美学；**点击区域要比看到的按钮大**（悬浮按钮热区 64，圆面 50–54）。
- 日历**整页显示**：顶部没有标题栏，月份胶囊（`#page-cal .topbar .title`）和星期条（`#weekdays`）悬浮在日历上面，在安全区下面（不压灵动岛）。日历内容不要再加顶部留白（`--cal-top: 0`）。
- 底部：左时钟胶囊、中分页点、右 logo。时钟和 logo 比分页点高（`--d2-lift: 40px`，原生 `DockSize.lift`），分页点只在日历 / 日程页出现。
- logo 扇形：按钮沿四分之一圆弧均匀排开（两个时 105° / 165°、半径 84；三个时 90° / 135° / 180°、半径 88）；设置页多一个最上面的「回到日历」。
- 返回键（回到今天 / 本周）：平时贴在 logo 正上方（中心高 62），扇形打开时被顶到上方（151），收起时落回。今天所在周被顶上的胶囊挡住（滑到最上面一行）也要出现。
- 今日页：从时钟胶囊长出一张大圆角卡片，可中途打断反向。
- 液态玻璃要**透明**（中间几乎全透，靠高光边和折射），深色模式**不要白边**。
- **优先级从左到右 = 低 → 高**。颜色按色彩心理学：无 `#A3A1AD` 灰 · 低 `#5B8FD0` 天蓝 · 中 `#C98A1E` 琥珀 · 高 `#D4472C` 朱红（深色调由 `MC.darkTone` / `CourseColors.darkTone` 按 OKLCH 算）。优先级用拖动条选（`UI.priBar`），渐变的每档颜色要正好落在刻度上。
- 品牌渐变（加号、选中的今天）：明亮的金黄 → 天蓝 → 亮蓝（`--brand-a/-mid/-b`），不要深色，不然发闷。
- 主色天蓝 `#4F80C4`（深色 `#8DB0EA`）。
- **红色 `--red` 只用于**「现在时间」的线、删除、出错、逾期，和优先级无关。
- 热力图（记录日历的等级统计）配色不动，但图例从左到右也是低 → 高。

### 颜色要同步的位置

改配色时这几处要一起改，否则各端不一致：

1. 网页：`styles.css` 顶部的 `:root` 变量（`--p0…--p3`、`--accent…`、`--red`）和末尾的 `--brand-*`；`js/store.js` 的 `MC.PAL.light`。
2. iOS / Mac：`macos/Shared/Colors.swift`（`Pal.P`、`accentV`、`fab`、`accentText`、`RED`），`macos/App/GlassNav.swift` 的 `Brand`。小组件也用 `Pal`。
3. 安卓原生：`android/…/ui/Theme.kt`、`Palette.kt`；安卓小组件在老的 Java / `res` 里。
4. 网页版小组件和 Scriptable 脚本：`widget.html`、`widget-*-scriptable.js`。

> 待办：安卓原生（Theme.kt / Palette.kt）、安卓小组件、`widget.html` 和 Scriptable 脚本还是旧配色，没同步到上面的新颜色。

## 版本号和发布

- 根目录 `version.json` 是大版本（网页、安卓、iOS、Mac 共用）。源码里 `?v=0.22.0` 和 `sw.js` 的版本是占位，`pages.yml` 发布时自动改写，不用手改。
- **改了 iOS / Mac 原生代码**：`ios/version.json`、`macos/version.json` 的 `build` 各加一（用 Mac 续签的 iPhone 和 Mac App 靠它发现新版本）。
- **改了 `android/`**：推送后 `android.yml` 自动编译签名，发布到 Releases（`android-<版本>-<序号>`），App 里「设置 → 安卓 App」检查更新。
- 推送到 `main` 就是上线。**提交、推送前先问用户**。

## 本地开发和验证

- 网页预览：`.claude/launch.json` 里的 `web`（`python3 -m http.server 8791`）。手机尺寸用浏览器面板的 mobile 预设。
- **Service Worker 会缓存旧文件**：改完看不到效果时，先在页面里注销 SW、清 caches，再用 `fetch(url, {cache:'reload'})` 刷一遍 CSS / JS，最后重新打开。
- 第一次打开有隐私弹窗（`#pvYes`）。测试时加的事件记得删掉。
- iOS：`bash ios/build.sh sim` 编译模拟器版；调试版用 `devURL` 指向本机网页：`xcrun simctl spawn booted defaults write io.github.salmangox.cadence devURL http://localhost:8791/`（用完改回原值）。
- Mac：`bash macos/build.sh` 会**直接替换「应用程序」里的节律并打开**，只想检查能不能编译时别用它。**不要在 `macos/` 里单独跑 `xcodegen`**：它会生成 `macos/Widgets/Info.plist` 等文件，iOS 工程会重复引用导致编译失败；跑过的话把生成的文件删掉。
- 安卓：本机有 Android SDK（`~/Library/Android/sdk`）和 Homebrew 的 JDK 17。

## 协作注意

- 可能有别的会话在同一个文件夹里改（比如安卓原生）。**只提交自己改的文件**：用 `git commit -- <路径>`，别 `git add -A`，别动别人暂存的东西。
- 根目录别再放更新压缩包、旧副本之类的文件（以前 DeepSeek 留下的一批已清理）。
- `index.html` 末尾的 dock2 脚本是底部悬浮控件和日历 ↔ 日程拖拽切页的逻辑；`styles.css` 末尾「悬浮控件」一节是它的样式，只保留一份，别重复追加。
