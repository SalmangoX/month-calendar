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
| 安卓 | **网页**（WebView）+ 原生画底部悬浮控件（Kotlin + Jetpack Compose） | 悬浮控件在 `android/app/src/main/kotlin/…/monthcalendar/ui/Dock.kt`（状态脚本 `NAV_JS` 也在里面）；Java 部分负责小组件、提醒、同步 |

- **只改网页**：浏览器、iPhone、Mac、安卓都立刻变（推送后 GitHub Pages 自动发布，App 打开就加载新网页，不用重新打包）。
- **安卓（2026-11-05 定的）**：和 iPhone 一样是「网页壳 + 原生悬浮层」，页面全部用网页，原生只画底部悬浮控件，外加小组件、提醒、同步。
- **改底部悬浮控件要改四处**：网页（`index.html` 末尾的 dock2 脚本 + `styles.css`「悬浮控件」一节）、iOS / Mac 的 `GlassNav.swift`、两份 `navJS`（`ios/App/WebShell.swift`、`macos/App/MainWindow.swift`）、安卓的 `Dock.kt`（含它自己的 `NAV_JS`）。状态字段四处要一致：`t ap today back pager n p set st lit pv`（`n` 是页数，`p` 是停在第几页，拖动时是小数；`st` 是扇形里有没有「统计」）。
- iPhone / Mac 原生层已经没有旧的玻璃菜单栏和蓝色加号（`GlassTabBar` / `GlassFab` 已删）：网页发来底栏状态前什么都不画。水滴折射的 Metal 着色器也删了，编译不再需要 Metal 组件。
- **iPhone / Mac 的底部悬浮控件**（时钟胶囊 · 分页点 · logo 扇形 · 回到今天）是 `GlassNav.swift` 里的 `GlassDock`，用系统 Liquid Glass 画；点按交给网页里同名的按钮（`#bubbleToday` `#pager` `#fanAdd` `#fanSet` `#calBack` `#schedBack`），网页那一份在 App 里只是 `visibility:hidden`（今日页展开动画还要用它的位置）。状态由注入脚本 `navJS`（`ios/App/WebShell.swift`、`macos/App/MainWindow.swift` 各一份，两份要一起改）发给原生。
- Mac 的玻璃层（`GlassLayer`）必须 `.ignoresSafeArea()`，和网页同一个坐标；不然会让开标题栏，整层玻璃比网页里的控件低约 32pt（以前 Mac 上星期条压住日期就是这个原因）。
- 安卓的侧拉菜单是网页画的，拉出来时（`#calDrawer.vis`）`NAV_JS` 的 `cover` 为真，原生的时钟胶囊和 logo 让开。
- **iPhone / Mac 上网页里的玻璃控件**：`js/ui.js` 的 `LG_SEL` 里列出的元素，由原生在同样位置画系统液态玻璃（`MC.LG`）。
- **纪念日历**（`body[data-kind="days"]`）也用新底栏：分页点两页 纪念日 · 总览（`ORDER()`）。月历放在总览顶上的「本月」小窗里，点开是竖着滑的月历面板（`#dayMonths`）。列表每行是 透明底实心图标 · 名称日期 · 右边大数字（`.dv-row.v2`），不再铺渐变和水印。透明相机的控件由网页自己画（不进 `LG_SEL`），有倍率和前后镜头。旧的 `#dock` / `#tabbar` / `#fab` 都藏起来了，`#fab` 只留给扇形里的「添加」点。

## 设计规范（用户逐条确认过的，别改回去）

- 苹果式的简洁美学；**点击区域要比看到的按钮大**（悬浮按钮热区 64，圆面 50–54）。
- 日历**整页显示**：顶部没有标题栏，月份胶囊（`#page-cal .topbar .title`）和星期条（`#weekdays`）悬浮在日历上面，在安全区下面（不压灵动岛）。日历内容不要再加顶部留白（`--cal-top: 0`）。
- 底部：左时钟胶囊、中分页点、右 logo。**按中轴放**：时钟胶囊的中轴对准周日 / 周一之间那条列线，logo 的中轴对准周五 / 周六之间那条（离两边都是 `2 + (宽 - 4) / 7`，网页 `--d2-cx`、原生 `DockSize.axis`、安卓 `cx`），胶囊多宽都不变；点开某一天的卡片时只往上挪。时钟和 logo 比分页点高（`--d2-lift: 40px`，原生 `DockSize.lift`），分页点只在日历 / 日程页出现。
- 分页点平时是淡的（`.idle`，透明度 .3），只在左右切页时亮起，停下 1.2 秒后再淡下去（状态字段 `lit`）。
- 日历里点开某一天的卡片时，时钟和 logo 往上、往里挪，整个落在卡片底部里面（`body.dock-pv` + `--d2-pv`，状态字段 `pv`），收起卡片回原位；分页点不动。
- logo 扇形：两个按钮沿圆弧排开（115° / 175°、半径 84，比四分之一圆弧整体逆时针转 10°，加号不要太高太靠右）：加号 + 设置。**在设置页里「设置」换成「返回」**（回到进设置之前那一页），没有「回到日历」键。开了等级评分的记录日历在加号和设置中间多一个「统计」（`#fanStat`，三个时 100° / 145° / 190°、半径 88），在统计页里它换成「返回」。
- 年视图里返回键一直显示（点了回到今天所在的月）。周视图的列顶上让开月份胶囊（`body.cal-w`），日期上面写星期。
- **吸附线**：默认状态下本周那一行的顶边（`TOP + rowH`）。月份胶囊、星期条跟着它走：星期条底边在吸附线上方 4px；月份胶囊（高 36，左留白 18 / 右 14）的水平中线在最上面那行第一、第二条事件中间（行顶 + `--ct` + `--chip-h` + 1）（`calendar.js` 的 `measure()` 用 offsetTop 算，写 `--wk-y` / `--pill-y`；`--safe-t` 变了会重新算，Mac 是加载后才改成 28px 的），格子大小和行的位置都不动。周视图列顶留白也按 `--pill-y` 算。
- （旧的默认值，JS 没算出来时用）月份胶囊在安全区下 12px、星期条下 56px：比侧拉菜单的顶（安全区下 10px，原生 `GlassDrawer` 同样）低一点，菜单拉出来能整个盖住胶囊。多出来的这段是 `--cal-drop`（6px），月视图的日历行也整体往下挪同样多（`calendar.js` 的 `TOP`），再加 `--cal-shift`（-20px，用户在效果图里调的，让灵动岛那一段也露出日期和事件）；行高照旧按不含它们的高度算——不要改变日历格子大小。
- 侧拉菜单底部「新建日历」是一颗液态玻璃胶囊 + 品牌渐变加号圆（网页 `.dr-add.lgbtn`，iOS / Mac 在 `GlassDrawer` 里用 `glassEffect`）。面板里的玻璃按钮用 `.lgbtn`（比页面上的玻璃亮一点，不然在毛玻璃面板上看不出来）。
- 设置类弹出框（`#formSheet` `#notifySheet` `#helpSheet`，类名 `.sheet.fl`）是悬浮卡片：四角 34 圆角、离屏幕边 8px；左上取消是玻璃胶囊（`.sh-btn.lgbtn.lgn`，iPhone / Mac 由原生画），右上确认是品牌渐变胶囊（`.sh-ok`）。新建 / 编辑日历顶上有跟着名字和颜色实时变的预览（`openForm` 的 `hero`）。
- 原生玻璃上的彩色小色块（月份胶囊里的记录日历名 `.cal-chip`）：`pads` 第 6 项带颜色，原生画在玻璃上面，网页那份在 `.lgx` 里变透明。
- 返回键（回到今天 / 本周）：平时贴在 logo 正上方（中心高 62），扇形打开时被顶到上方（151），收起时落回。今天不在屏幕上、被顶上的胶囊挡住，或者**选中的不是今天**，都要出现。
- 日历顶部**不要遮挡**：月视图一直铺到屏幕最顶上、灵动岛后面也画日历（`body.cal-m` 去掉页面顶部留白，`calendar.js` 的 `TOP` 加上安全区高度让行位置不变），状态栏那一条只是轻模糊 + 渐隐的软边（`#page-cal::before`），**只在灵动岛从上往下 15% 以上**（安全区高度的 .27；强度 4px、底色 55%、渐隐 65%，用户在效果图里定的），下面日历照常显示，不是实底，星期条是一条细长的悬浮玻璃，和月份胶囊、底部按钮同一种玻璃（iPhone 上是同一种原生液态玻璃，深色不发白）；左右边距和日历每一行（`.wrow` 各 2px）一样，七个字对准七列。
- 纪念日历里左右滑不切到日程。
- 「设置 → 星期颜色 → 情绪光谱」（默认关）：每一天一团柔光从星期条往上下散开，对准那一列；今天 74%、其他 32%、往下照屏幕高度的 33%（今天再远 30%）。色相 `MC.WEEK_MOOD_HUE`（天蓝 → 雾紫 → 丁香 → 玫瑰 → 蜜桃 → 杏 → 金），深色滤色、浅色正片叠底。光在日历内容**下面**（只染背景，不盖住事件和文字，不然像一层雾）；今天只靠更亮的光和字区分，不加小点；今天的光稍亮、稍宽（2.0 列，别太强），其他几天收淡收窄（1.5 列），要一眼分得出。代码在 `calendar.js` 的 `paintMood`、`#wkGlow`。
- 课程提醒：`data.courseRemind = { on, lead, tz }`（同步），四端各自排：`js/push.js`、`scripts/send-reminders.mjs`、安卓 `Engine.java`、iOS / Mac `Engine.swift`。
- 小组件里「今天」那一格 / 那一列用品牌渐变淡底（`Pal.todayTint`，和 App 里选中的今天同样的比例），日期圆用 `todayStyle`，都不要再用蓝色或灰色。
- 纪念日历的图标是实心的（`js/days.js` 的 `FILL`：f 填满、k / d 用 mask 镂空），放在灰底块（`--tile`）里。
- 侧拉菜单底部是「新建子日历」，点开是两种日历的介绍卡片（左记录日历、右纪念日历，各带一个简单的效果图），不要再改回系统菜单。
- 纪念日历也能「在主日历显示」：日子到了那一天显示在主日历和小组件里（只读，点开是详情页）。
- **纪念日的颜色只由自己选的图标决定**（`iconColor`），类别只用来分组，选类别、按名称猜都不换图标。新建面板顺序：名称 → 日期 → 图标 → 类别 → 重复 → 更多选项。
- 纪念日提醒：`reminds`（提前几天，在 `remindAt` 钟点）+ `remindH`（提前 1 / 12 小时，按精确时间、没有就按 0 点）+ `remindTz`，四端各自排（同课程提醒那四处）。
- 主题背景：`g:<名字>` 是内置背景（`SCENES`，画成图片当照片用），不要再加纯色；旧的 `c:#颜色` 只保留显示。
- 高亮的色块一律画成带光的圆角空心框（和列表里高亮一样），原生菜单用 `swatch` 字段传颜色。
- 有更上面一层（详情页、面板）时，`MC.LG` 不再算下面那页的遮挡（`.dv-bar` 等），不然会把上面的玻璃按钮挖掉一条。
- 安卓自动备份：`Backup.java`（系统文件夹选择器，每天一份「节律自动备份-日期.json」，留 7 份），提醒引擎每次醒来顺便检查。
- 面板（新建事件、批量添加、添加 / 编辑课程）在手机上有几档高度（`UI.detents`：.4 / .56 / 默认 / .74 / .9），往下拉先停在矮一档，拉过最矮那档才收起；不要一打开就铺满整屏。
- 今日页：从时钟胶囊长出一张大圆角卡片，可中途打断反向。圆角一直按当前卡片短边的一半过渡到 44（不要方框），iPhone 停在 44，网页 / Mac 最后 20% 才收成直角。今日页打开或展开中，别的页面里的原生玻璃不画（`js/ui.js` 的 `td`）。
- 安卓 App 里月份胶囊、星期条也要像 iOS：轻微模糊（2px）+ 柔和折射（`#lg-refract-soft`），不提亮、不加重饱和；别再改成完全不模糊的纯透明。
- 分段选择（`.seg`）、按钮、标签一律是胶囊或大圆角，不要方角。
- 选日期的小月历按这个月实际占几周画（4–6 行），不把下个月整周塞进来。
- 翻译：繁体没写进字典的靠 `i18n.js` 的 `CMAP` 逐字转换，新增界面文字用到新的简体字要补进 `CMAP`；英 / 法 / 日要在字典里各加一条。
- 液态玻璃要**透明**（中间几乎全透，靠高光边和折射），深色模式**不要白边**。
- **优先级色条是渐变**（用户定的）：低在右端带一点中级，中两端带低级 / 高级，高在左端带一点中级；用户在效果图里定的「提亮过渡」：端点往相邻那档走 65%、纯色占 75%、过渡处提亮 9、保持鲜艳 90%（不要直接混，蓝和琥珀直接混会发灰发闷）；算好的固定色标，几处同一组：`js/store.js` 的 `GRAD`、`macos/Shared/Colors.swift` 的 `Pal.GRAD_L/_D`、安卓 `chip_p*.xml`（底色 + 每侧两层透明叠层）+ `colors.xml` 的 `chip_p*_l1/l2/r1/r2`、`widget.html` / `widget-ios-scriptable.js` 的 `PGRAD`。已完成、别的月份、记录日历颜色不渐变。
- **优先级从左到右 = 低 → 高**。颜色按色彩心理学：无 `#A3A1AD` 灰 · 低 `#5B8FD0` 天蓝 · 中 `#C98A1E` 琥珀 · 高 `#D4472C` 朱红（深色调由 `MC.darkTone` / `CourseColors.darkTone` 按 OKLCH 算）。优先级用拖动条选（`UI.priBar`），渐变的每档颜色要正好落在刻度上。
- 品牌渐变（加号、选中的今天）：明亮的金黄 → 天蓝 → 亮蓝（`--brand-a/-mid/-b`），不要深色，不然发闷。
- 主色天蓝 `#4F80C4`（深色 `#8DB0EA`）。
- **红色 `--red` 只用于**「现在时间」的线、删除、出错、逾期，和优先级无关。
- **记录日历的等级从左到右 = 默认（无）→ 最低 → 最高**（`MC.RATE_ORDER = [4, 3, 2, 1]`）：等级条、分段评价、等级菜单、日历设置里的名称、统计图例都按这个顺序。数据里 1 级 = 红 = 最高（比如「超忙」），4 级 = 绿 = 最低（比如「轻松」），颜色跟着名字走。热力图配色不动。
- 月份胶囊里记录日历的名字是真文字（`#calChip`），别用 `::before` 写字：iPhone / Mac 的原生玻璃只重画真实的文字节点。

### 颜色要同步的位置

改配色时这几处要一起改，否则各端不一致：

1. 网页：`styles.css` 顶部的 `:root` 变量（`--p0…--p3`、`--accent…`、`--red`）和末尾的 `--brand-*`；`js/store.js` 的 `MC.PAL.light`。
2. iOS / Mac：`macos/Shared/Colors.swift`（`Pal.P`、`accentV`、`fab`、`accentText`、`RED`），`macos/App/GlassNav.swift` 的 `Brand`。小组件也用 `Pal`。
3. 安卓：悬浮控件 `android/…/ui/Theme.kt`、`Palette.kt`；小组件在 `res/values*/colors.xml`（含 `brand_a/_mid/_b`）、`res/drawable/`（今天的日期 `today_bg.xml` 用品牌渐变）和 `Widgets.java`。
4. 网页版小组件和 Scriptable 脚本：`widget.html`、`widget-*-scriptable.js`。

安卓小组件的红色是 `res/values*/colors.xml` 里单独的 `red`（逾期、课表现在时间线），不要用 `p3`。XML 注释里不能出现两个连续的减号。

## 联动分组（改一处，同组的都要看一遍）

**规则（用户定的）**：写代码时先判断这次改动属于哪一组，按组增删；改完对照同组每一处，确认都改到了（比如改了色条，已完成、别的月份、跨天横条、小组件都要跟着改）。新增同类的东西时，加进对应的组，并在代码里打上同样的标记。

每组在各处的定义点都有注释标记 `【联动:组名】`，改之前先搜：`grep -rn "联动:组名" js styles.css index.html widget* scripts macos ios android/app/src/main`。

| 组 | 包括哪些（每一种状态都要算：没完成 / 已完成 / 别的月份 / 跨天横条 / 浅色 / 深色） | 位置 |
| --- | --- | --- |
| 优先级颜色 | 无 · 低 · 中 · 高 四个基础色和它们的深色调 | `styles.css` `--p0…--p3`、`js/store.js` `MC.PAL`、`Colors.swift` `Pal.P`、安卓 `colors.xml` `p0…p3` / `chip_p*` / `p*_soft`、`widget.html` `COLORS` + CSS 变量、`widget-ios-scriptable.js` `PHEX` / `PDARK` |
| 优先级色条 | 渐变色标；月 / 周视图色条、跨天横条、已完成和淡色条 | `js/store.js` `GRAD` / `priGrad` / `toneVars`（`--cg` `--cgd` `--cgo`）、`styles.css` `.chip` `.chip.done`、`Colors.swift` `GRAD_L/_D` + `chipFill`、`MonthView.swift` `chip()` / `bar()`、安卓 `chip_p*.xml` `chip_p*_soft.xml` + `colors.xml`、`Widgets.java` `CHIP` / `SOFT`、`widget.html` `PGRAD`、`widget-ios-scriptable.js` `PGRAD` / `chipGrad` |
| 品牌渐变 | 加号、选中的今天、小组件今天的格子 | `styles.css` `--brand-*`、`Colors.swift` `todayTint` / `todayStyle`、`GlassNav.swift` `Brand`、安卓 `Theme.kt` `brandA…`、`Palette.kt`、`colors.xml` `brand_*`、`today_bg.xml` `more_today.xml`、`widget-ios-scriptable.js` `brandGrad` |
| 主色和红色 | 主色天蓝；红色只给现在时间线 / 删除 / 出错 / 逾期 | `styles.css` `--accent*` `--red`、`Colors.swift` `accentV` `RED`、安卓 `Theme.kt`、`colors.xml` `red` |
| 深色调 | 任意颜色的深色版（OKLCH 规则） | `js/store.js` `MC.darkTone`、`Colors.swift` `CourseColors.darkTone`、`CourseColors.java` `darkTone`、`widget.html` `darkTone`、`widget-ios-scriptable.js` `PDARK`、`widget-days-scriptable.js` `darkTone` |
| 课程颜色 | 按科目配色 | `js/sched.js` `toneOf`、`Colors.swift` `CourseColors`、`CourseColors.java`、`widget-sched-scriptable.js` `toneOf` |
| 底部悬浮控件 | 时钟胶囊 · 分页点 · logo 扇形 · 回到今天；状态字段 `t ap today back pager n p set st lit pv`；中轴、高度、扇形角度 | `index.html` dock2 + 扇形脚本、`styles.css`「悬浮控件」、`GlassNav.swift` `NavModel.Dock` / `GlassDock` / `DockSize`、`ios/App/WebShell.swift` `navJS`、`macos/App/MainWindow.swift` `navJS`、安卓 `Dock.kt` `DockModel` + `NAV_JS` |
| 顶部悬浮 | 月份胶囊、星期条、吸附线、周视图列顶留白、侧拉菜单的顶 | `js/calendar.js` `measure()`（`--wk-y` `--pill-y`）、`styles.css` `.topbar` `.weekdays` `.cal-w` `.drawer`、原生 `GlassDrawer` 的上边距 |
| 原生玻璃 | 网页控件由原生画液态玻璃：哪些控件、遮挡、坐标 | `js/ui.js` `LG_SEL` / `LAYERS` / 今日页 `td`、`styles.css` `.lg-native .lgx`、`GlassNav.swift` `GlassLayer`、Mac `MainWindow.swift` `lgLayer`（要 `ignoresSafeArea`）、iOS `CadenceApp.swift` |
| 提醒 | 事件 / 每日 / 课程 / 纪念日提醒（四端各自排） | `js/push.js`、`scripts/send-reminders.mjs`、安卓 `Engine.java`、`macos/App/Engine.swift` |
| 同步数据 | 数据格式和合并（字段只增不删） | `js/store.js` `MC.merge`、安卓 `CalMerge.kt` / `Data.java` / `Store.java`、`Model.swift` `CalData` / `SharedStore.swift` |
| 翻译 | 新文字要补四种语言 + 繁体转换表 | `js/i18n.js`（字典 + `CMAP`）、`macos/Shared/I18n.swift`、安卓 `I18n.java` + `res/values-*/strings.xml` |
| 侧拉菜单 | 日历列表、「更多」菜单（原生直接用网页给的 `menu`）、新建子日历（先弹两种日历的介绍卡片 `#calKindSheet`） | 网页 `js/drawer.js`（`D.model` 给原生用、`D.add('')` 打开介绍卡片）、iOS / Mac `GlassNav.swift` `GlassDrawer`、安卓用网页的（拉出时 `NAV_JS` 的 `cover` 让原生控件让开） |
| 在主日历显示 | 记录日历的事件、纪念日历的日子（每次出现的那天当成只读事件，id `dayv:`，网页里带 `dv`）出现在主日历和小组件里；计数、完成统计、每日提醒不算纪念日 | 网页 `js/store.js` `MC.reindex` / `dayEvents`、`js/ui.js` `itemHTML`（心形、点开详情）、`js/calendar.js` 预览计数和 `tally`、`js/app.js` 今日页、`js/push.js` 每日提醒；`Model.swift` 建索引处；安卓 `Data.java` `index()` |
| 记录等级 | 等级顺序 `RATE_ORDER`、名称、颜色、统计 | `js/store.js` `RATE_ORDER`、`js/editor.js` 等级条、`js/app.js` 统计、`js/drawer.js` 等级名称 |
| 版本号 | 改原生代码就加 build | `version.json`、`ios/version.json`、`macos/version.json` |

## 版本号和发布

- 根目录 `version.json` 是大版本（网页、安卓、iOS、Mac 共用）。源码里 `?v=0.22.0` 和 `sw.js` 的版本是占位，`pages.yml` 发布时自动改写，不用手改。
- **改了 iOS / Mac 原生代码**：`ios/version.json`、`macos/version.json` 的 `build` 各加一（用 Mac 续签的 iPhone 和 Mac App 靠它发现新版本）。
- **改了 `android/`**：推送后 `android.yml` 自动编译签名，发布到 Releases（`android-<版本>-<序号>`），App 里「设置 → 安卓 App」检查更新。
- 推送到 `main` 就是上线。**提交、推送前先问用户**。

## 本地开发和验证

- 网页预览：`.claude/launch.json` 里的 `web`（`python3 -m http.server 8791`）。别的会话占着 8791 时用 `web-8792`（python 不认分配的端口，直接打开 `http://localhost:8792/`）。手机尺寸用浏览器面板的 mobile 预设。
- **Service Worker 会缓存旧文件**：改完看不到效果时，先在页面里注销 SW、清 caches，再用 `fetch(url, {cache:'reload'})` 刷一遍 CSS / JS，最后重新打开。
- 第一次打开有隐私弹窗（`#pvYes`）。测试时加的事件记得删掉。
- iOS：`bash ios/build.sh sim` 编译模拟器版；调试版用 `devURL` 指向本机网页：`xcrun simctl spawn booted defaults write io.github.salmangox.cadence devURL http://localhost:8791/`（用完改回原值）。
- iPhone 真机：`bash ios/install-iphone.sh` 编译并装到连着的 iPhone（数据线或同一 Wi-Fi），同时打开自动续期。
- Mac：`bash macos/build.sh` 会**直接替换「应用程序」里的节律并打开**，只想检查能不能编译时别用它。它编完会自动删掉 xcodegen 生成的 `macos/App/Info.plist`、`macos/Widgets/Info.plist` 和 entitlements。**不要在 `macos/` 里单独跑 `xcodegen`**，不然 iOS 编译会报「Multiple commands produce」，跑过的话把这几个文件删掉。先装 iPhone 再编 Mac（Mac 脚本会清掉多余的 `Cadence.app` 副本）。
- 安卓：本机有 Android SDK 和 Homebrew 的 JDK 17。编译要带上环境变量：`ANDROID_HOME=$HOME/Library/Android/sdk JAVA_HOME=$(/usr/libexec/java_home -v 17) bash ./gradlew :app:assembleDebug`（在 `android/` 里跑；`gradlew` 没有执行权限，用 `bash` 跑）。

## 协作注意

- 可能有别的会话在同一个文件夹里改（比如安卓原生）。**只提交自己改的文件**：用 `git commit -- <路径>`，别 `git add -A`，别动别人暂存的东西。
- 根目录别再放更新压缩包、旧副本之类的文件（以前 DeepSeek 留下的一批已清理）。
- `index.html` 末尾的 dock2 脚本是底部悬浮控件和日历 ↔ 日程拖拽切页的逻辑；`styles.css` 末尾「悬浮控件」一节是它的样式，只保留一份，别重复追加。
