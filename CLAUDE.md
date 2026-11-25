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
- **改底部悬浮控件要改四处**：网页（`index.html` 末尾的 dock2 脚本 + `styles.css`「悬浮控件」一节）、iOS / Mac 的 `GlassNav.swift`、两份 `navJS`（`ios/App/WebShell.swift`、`macos/App/MainWindow.swift`）、安卓的 `Dock.kt`（含它自己的 `NAV_JS`）。状态字段四处要一致：`t ap today back pager n p set st lit pv`（安卓多一个 `fl`：月视图最下面那一行的顶边离底多远，`calendar.js` 的 `measure()` 写 `--d2-floor`，安卓的时钟胶囊、logo 整个放在这条线上面、当月虚线框里）（`n` 是页数，`p` 是停在第几页，拖动时是小数；`st` 是扇形里有没有「统计」）。
- iPhone / Mac 原生层已经没有旧的玻璃菜单栏和蓝色加号（`GlassTabBar` / `GlassFab` 已删）：网页发来底栏状态前什么都不画。水滴折射的 Metal 着色器也删了，编译不再需要 Metal 组件。
- **iPhone / Mac 的底部悬浮控件**（时钟胶囊 · 分页点 · logo 扇形 · 回到今天）是 `GlassNav.swift` 里的 `GlassDock`，用系统 Liquid Glass 画；点按交给网页里同名的按钮（`#bubbleToday` `#pager` `#fanAdd` `#fanSet` `#calBack` `#schedBack`），网页那一份在 App 里只是 `visibility:hidden`（今日页展开动画还要用它的位置）。状态由注入脚本 `navJS`（`ios/App/WebShell.swift`、`macos/App/MainWindow.swift` 各一份，两份要一起改）发给原生。
- Mac 的玻璃层（`GlassLayer`）必须 `.ignoresSafeArea()`，和网页同一个坐标；不然会让开标题栏，整层玻璃比网页里的控件低约 32pt（以前 Mac 上星期条压住日期就是这个原因）。
- 安卓的侧拉菜单是网页画的，拉出来时（`#calDrawer.vis`）`NAV_JS` 的 `cover` 为真，原生的时钟胶囊和 logo 让开。
- **iPhone / Mac 上网页里的玻璃控件**：`js/ui.js` 的 `LG_SEL` 里列出的元素，由原生在同样位置画系统液态玻璃（`MC.LG`）。
- **纪念日历**（`body[data-kind="days"]`）也用新底栏：分页点两页 纪念日 · 总览（`ORDER()`）。月历放在总览顶上的「本月」小窗里，点开是竖着滑的月历面板（`#dayMonths`）。列表每行是 透明底实心图标 · 名称日期 · 右边大数字（`.dv-row.v2`），不再铺渐变和水印。透明相机的控件由网页自己画（不进 `LG_SEL`），有倍率和前后镜头。旧的 `#dock` / `#tabbar` / `#fab` 都藏起来了，`#fab` 只留给扇形里的「添加」点。

## 设计规范（用户逐条确认过的，别改回去）

- 液态玻璃分段（`UI.lgBar`：优先级 / 等级 / 统计的 周月年全部 / 纪念日分享的面板）：**一按下水滴就浮起变大**（挂 `dragging`，iPhone / Mac 换成原生透明玻璃透镜），按着就能拖，松手吸到最近一格。统计页的那一条和卡片左右滑联动（滑卡片时水滴跟手、点 / 拖分段卡片滑过去）。
- 整页滑动返回（`index.html` 的 `SWIPES`）：设置页、统计页从左往右滑回到进来前那一页；今日页从右往左滑，整张卡片缩回去、再原路收进时钟胶囊（`toggleToday`）。手机跟手指，Mac 跟触控板两指左右扫（wheel deltaX）。开关、分段、能左右滑的卡片上不触发。
- 今日时间线可以捏合缩放（一小时 26–160，记在本机 `mcal.tlH`），以两指中间那个钟点为中心；手机两指、Mac 触控板（gesture 事件 / ctrl+wheel）都行。
- **从其他日历导入**（设置 → 数据）：`js/calimport.js`。三种来源整理成同一种「每一次发生」的格式（`date` `time` `endDate` `endTime` `allDay` `days` `remind` `cal` `uid` `recur`，本地时间的字符串）：系统日历（iPhone / Mac `macos/App/SysCal.swift` 用 EventKit，安卓 `SysCal.java` 用 CalendarContract，桥接方法 `sysCalRead`，功能名 `sysCal`；手机里登录的 iCloud、谷歌、Outlook / Exchange 都在里面）、谷歌日历的私密 iCal 地址（App 里经原生 `http` 代取，绕过跨域）、.ics 文件（`parseICS`：时区按事件自己的 TZID、重复规则在事件自己的时区里按墙上时间展开、EXDATE / 改过某一次 / CATEGORIES 分组）。弹出面板：每个来源日历 / 分类单独选 导到主日历 / 新建子日历 / 已有子日历 / 不导入（已有同名子日历时默认导到它）。事件 id = `imp` + UID、日期、钟点的哈希：再导一次不重复。范围：过去一年到未来两年。
- 子日历「⋯」里的「并入…」**是可以拆开的合集**（2026-11-25 用户定的：以前转移事件再删掉、不能撤销，不好）：选并入到哪（主日历或独立的记录日历，不套娃），被并入的日历挂在目标下面（`cal.under` = 目标 id，主日历是 `'@main'`，同步），侧拉菜单里缩进一格跟在目标后面（`.dr-row.child`，原生 `Row.child` / `mainKids`），不单独拖动；打开目标日历时两边的事件一起显示、各自保留颜色（`MC.hostOf` / `MC.kidsOf`、`MC.reindex`），事件本身不动；并入主日历同时打开「在主日历显示」（拆开时按 `underWas` 还原，小组件、原生不用另外认合集）。合集里新建的事件一律放进目标日历（用户定的，不加选择行）。挂着的日历「⋯」里是「从「X」拆开」，合集本身是「拆开合集」；删掉合集，挂着的变回独立的。
- 同名事件：编辑某个事件时，面板里有一行「同名事件」（`#cmpSame`，`editor.js` 的 `paintSame`），点开是一个窗口（`#sameSheet`）：每一条都列出来（日期、星期、钟点、备注、已完成、正在编辑），勾选要挪的（默认只勾正在编辑的这条），再选移到哪个日历，左上「取消」、右上「移动」（挪，不是复制）。子日历菜单里不再有「把主日历同名事件加进来」。
- 列表左滑出来的 编辑 / 删除：两颗 36 的淡色圆（编辑是正文色 8%、删除是红色 13% 底 + 红图标），只有图标，文字只给读屏；不要整块色块（塑料感）。
- iPhone / Mac 原生侧拉菜单开着时，点了里面要弹确认框 / 面板的项（除了切换日历和提醒），先收起侧拉菜单（`GlassNav.swift` 的 `act`），不然网页弹出的东西会被原生菜单盖住。
- 优先级条的滑块（`.pb-thumb`）和玻璃分段的水滴一样：停着时由网页画，按住拖时才换原生玻璃透镜；不然原生按速度推算位置，面板上下滑时会跟着抖。
- 子日历（记录日历）只有日历一页，没有日程：`ORDER()` 只给 `cal`，分页点只有一页时不显示。
- 侧拉菜单呼出：顺滑吸到位置，不过冲、不弹回（网页 `animateTo` 阻尼 44，只有用力甩出来才带一点回弹；原生 `openDrawer` 不加果冻过冲，`pullEnd` / `releaseDrawer` 弹簧阻尼 0.9 以上）。子日历「⋯」小窗口展开不晃（不冲过再缩回，原生按钮上不再套额外的动画）。
- 列表行的大小（用户在预览里定的）：侧拉菜单 行高 60、图标底块 36、图标图形 24、图标和字间距 18（网页 `.dr-pick` `.dr-ico`、原生 `GlassDrawer.row`）；设置 行高 53、图标底块 32、图形 19、间距 18（`.srow` `.sicon`）。
- 侧拉菜单选中的那一行是中性的白色高亮、对勾用正文色（网页 `.dr-row.on` / `.dr-tick`、原生 `GlassDrawer.row`），面板底色和遮罩是中性白 / 黑。
- **界面里不要蓝色**（用户多次说过；2026-11-24 定的最终方案）：主色 `--accent` 是**中性黑白**（浅色深墨 `#2B2D33` + 白字、深色近白 `#ECEDF1` + 深字 `--on-accent`），按钮、开关、链接、设置图标都是黑白 / 非蓝色系（设置图标原来的青、天蓝、长春花蓝换成了苔绿、石墨灰、灰紫，`SET_TONES`）。**只有两类保留蓝色**：事件优先级（`--p1` 天蓝等）和**日历选区**（选中的日子、今天的日期和淡圆、当前周的淡底、日期选择器的选中 / 范围、日程页今天、选周窗口），用单独的 `--cs` / `--cs-text` / `--cs-soft` 和 `--sel*` `--today-dim`；原生是 `Colors.swift` 的 `selV` / `sel` / `selText`、安卓 `colors.xml` 的 `sel` `w_today` `w_live`、`Theme.kt` 的 `selTint`。品牌渐变（金黄 → 天蓝）照旧。新东西别写死蓝色，也别拿 `--cs` 当普通配色；只改用户点名要改的地方。
- **交互动画要干脆**（用户多次说过太慢）：展开、收起、开关、扇形这类动画大约 0.2–0.4 秒做完，内容紧跟着出来，不要拖长、不要等。
- 苹果式的简洁美学；**点击区域要比看到的按钮大**（悬浮按钮热区 64，圆面 50–54）。
- **顶部标题板**（2026-11-05 用户定的：放弃悬浮的月份胶囊和星期条，改回一块半透明的板）：`#page-cal .topbar` 从屏幕最顶上（状态栏、灵动岛后面）一直到**吸附线**，底边正好落在吸附线上（`--snap-y`，`calendar.js` 的 `measure()` 按布局位置算）；日历的行和吸附线位置不变，日历在板下面滚动、透过磨砂隐约可见。材质：背景色 62%（深色 60%）+ 模糊 18px + 饱和 180%，底边一根发丝线，不加阴影和高光。版式是用户在三套里选的 B「编辑式标题」：月视图里上面一行小号眉题「2026　第 45 周」（11px、字距 .16em，周数是吸附线上那一行的 ISO 周，滚动时跟着变，`calendar.js` 的 `paintEyebrow`），下面大号粗体月份（40 / 800，中文用汉字「十一月」，其他语言交给翻译），右边一颗浅色胶囊写今天（`#calToday`，点了回到今天）；年份不跟在月份后面、不要箭头。周视图 / 年视图只留一行紧凑标题（30 号 + 日期范围 / 全年）。星期一行（`#weekdays`）贴在板底（底边离吸附线 4px），对准七列，11px、字距 .08em，周末更淡（`.we`），今天那一列更深（`.td`）。网页自己画，不走原生玻璃（已从 `LG_SEL` 去掉）。周视图 / 年视图只要标题那一条（安全区下 52px），周视图列顶留白 58、年视图 `.ypanel` 顶部留白 58。状态栏的软边（`#page-cal::before`）不再需要。
- 底部：左时钟胶囊、中分页点、右 logo。**按中轴放**：时钟胶囊的中轴对准周日 / 周一之间那条列线，logo 的中轴对准周五 / 周六之间那条（离两边都是 `2 + (宽 - 4) / 7`，网页 `--d2-cx`、原生 `DockSize.axis`、安卓 `cx`），胶囊多宽都不变；点开某一天的卡片时只往上挪。时钟和 logo 比分页点高（`--d2-lift: 40px`，原生 `DockSize.lift`），分页点只在日历 / 日程页出现。
- 分页点平时是淡的（`.idle`，透明度 .3），只在左右切页时亮起，停下 1.2 秒后再淡下去（状态字段 `lit`）。
- **月视图的日卡片按行号展开**（2026-11-24 用户定的）：卡片浮在日历上、贴着选中那一行，日历不再缩到上半屏（周视图还是上下分屏）。行号按吸附线下面看得见的行算（第 1–5 行 + 只露一半的第 6 行）：第 1、2 行不动、卡片从那一行下边往下展开；第 3 行先挪到第 2 行再往下展开；第 4、5 行不动、卡片在那一行上边往上展开（顶到标题板底边，`.pv-up`）；第 6 行先挪到第 5 行再往上展开。往上展开的卡片高度跟着内容、整张贴在那一行上面（事件紧接在标题下面，最高到标题板，再多在卡片里滚；2026-11-25 用户嫌事件太靠下、中间空太多）；往下展开的照旧从顶上排。挪行和卡片展开同时进行（约 0.24 秒减速，不整页重画）；为了展开挪过一行的，收起时日历滑回原位（今天在第 4 行，点第 3 行挪上去，收起后今天回到第 4 行）。日卡片（往上、往下都是）**不再让底栏挪进卡片**：往下展开的卡片底边停在底栏上方（时间胶囊、logo，还有显示着的「回到今天」都不压，2026-11-25 用户定的，`placeCard` 量 `#bubbleLogo .face`），`dock-pv` 只剩周视图的上下分屏在用；卡片里事件放不下时，列表底部淡出 + 一颗中性色「还有 n 项」小胶囊（数还没露出来的，滚动时跟着变、到底收起，点了往下翻，`paintMore` / `.pv-more`）；卡片开着时滑日历就收起（不回原位）；两种卡片都是整张往下拉收起，点事件不触发；所有收起都走 `closePreview`，拖动留下的位移、透明度一起清掉（`calendar.js` 的 `pvPlan` / `openFloat` / `placeCard` / `closePreview`，`.cal-body.pv-float` / `.pv-up`）。
- 日历里点开某一天的卡片时，时钟和 logo 往上、往里挪，整个落在卡片底部里面（`body.dock-pv` + `--d2-pv`，状态字段 `pv`），收起卡片回原位；分页点不动。
- logo 扇形：两个按钮沿圆弧排开（115° / 175°、半径 84，比四分之一圆弧整体逆时针转 10°，加号不要太高太靠右）：加号 + 设置。**在设置页里「设置」换成「返回」**（回到进设置之前那一页），没有「回到日历」键。开了等级评分的记录日历在加号和设置中间多一个「统计」（`#fanStat`，三个时 100° / 145° / 190°、半径 88），在统计页里它换成「返回」。
- 年视图里返回键一直显示（点了回到今天所在的月）。
- 侧拉菜单面板（iPhone / Mac 原生 `GlassDrawer.panel`，安卓 / 网页 `.drawer::before` 边缘玻璃 + `.drawer::after` 磨砂卡片，两边一起改）：**边缘是一圈透明液态玻璃**（`.clear`，露出 7pt；安卓 / 网页是 `.drawer::before`：不模糊、饱和 165% + 提亮 1.06 + 强折射 `#lg-refract-dr` + 一圈高光边，深色高光压暗，2026-11-25 用户从候选里选的 A；以前带 2px 模糊和白层，看起来像磨砂），**中间是一张带圆角（20）、透光的磨砂卡片**（`.thinMaterial` + 淡白 / 淡黑 + 细亮边），字在卡片上看得清；整块都用 `.regular` 会糊成一块灰，整块都用 `.clear` 又太透看不清字；拉出来时整个被它盖住的原生玻璃（月份胶囊）收起来，不透出字。
- 侧拉菜单底部「新建日历」是一颗液态玻璃胶囊 + 品牌渐变加号圆（网页 `.dr-add.lgbtn`，iOS / Mac 在 `GlassDrawer` 里用 `glassEffect`）。面板里的玻璃按钮用 `.lgbtn`（比页面上的玻璃亮一点，不然在毛玻璃面板上看不出来）。
- 设置类弹出框（`#formSheet` `#notifySheet` `#helpSheet`，类名 `.sheet.fl`）是悬浮卡片：四角 34 圆角、离屏幕边 8px；左上取消是玻璃胶囊（`.sh-btn.lgbtn.lgn`，iPhone / Mac 由原生画），右上确认是品牌渐变胶囊（`.sh-ok`）。新建 / 编辑日历顶上有跟着名字和颜色实时变的预览（`openForm` 的 `hero`）。
- 返回键（回到今天 / 本周）：平时贴在 logo 正上方（中心高 62），扇形打开时被顶到上方（151），收起时落回。今天不在屏幕上、被顶上的胶囊挡住，或者**选中的不是今天**，都要出现。
- 纪念日历里左右滑不切到日程。
- 「设置 → 星期颜色 → 情绪光谱」（默认关）：每一天一团柔光从星期条往上下散开，对准那一列；今天 74%、其他 32%、往下照屏幕高度的 33%（今天再远 30%）。色相 `MC.WEEK_MOOD_HUE`（天蓝 → 雾紫 → 丁香 → 玫瑰 → 蜜桃 → 杏 → 金），深色滤色、浅色正片叠底。光在日历内容**下面**（只染背景，不盖住事件和文字，不然像一层雾）；今天只靠更亮的光和字区分，不加小点；今天的光稍亮、稍宽（2.0 列，别太强），其他几天收淡收窄（1.5 列），要一眼分得出。代码在 `calendar.js` 的 `paintMood`、`#wkGlow`。
- 课程提醒：`data.courseRemind = { on, lead, tz }`（同步），四端各自排：`js/push.js`、`scripts/send-reminders.mjs`、安卓 `Engine.java`、iOS / Mac `Engine.swift`。
- 小组件里「今天」那一格 / 那一列用品牌渐变淡底（`Pal.todayTint`，和 App 里选中的今天同样的比例），日期圆用 `todayStyle`，都不要再用蓝色或灰色（大号「本周课表」的今天那一列也是）；小组件的标题、今天的星期字用正文色，底色和分隔线 iPhone / Mac 都是中性白 / 灰（`Pal.bg` / `line`），Mac 上不标 `widgetAccentable`（`accentable()`），免得着色样式下被系统染成蓝色。
- **纪念相机在 iPhone 上是原生的**（用户定的：做了 App 就用原生，不拿网页凑合）：`ios/App/NativeCam.swift`，网页 `Days.openCam` 见到功能 `nativeCam` 就交给 `MCNative.openCam`（带卡片文字、方案、翻译、相册小图），拍好的由 `Days.addShot(id, 放好卡片的 base64, 底图 base64, meta)` 存进相册。AVFoundation 取景（前后镜头、0.5× / 1× / 2× / 3× 用虚拟镜头的切换点）、Core Image 滤镜（`CamFX.apply`：肤色查找表 + 有脸时只留脸附近的遮罩上磨皮、美白、红润，Vision 人脸关键点做瘦脸 / 大眼，色温 / 反差 / 饱和 / 黑位上浮 / 光晕 / 暗角 / 颗粒），按钮、「调整」面板、玻璃卡片都是系统透明 Liquid Glass；拍照按原图重新套滤镜（`CamShot.make`）。布局：左上返回；右下翻转镜头上面是「调整」；左下相册小图；横着拿（CoreMotion 重力）所有按钮和卡片转正、拍出横照片。**安卓也是原生的**：`android/…/ui/NativeCam.kt`（`CamModel` / `NativeCamScreen`，挂在 `DockHost` 上，桥接 `Bridge.openCam`，功能名同样是 `nativeCam`）：CameraX 取景送进 OpenGL，用和网页 `CAM_FS` **同一个滤镜着色器**（三端颜色一致；SurfaceTexture 的变换矩阵已经把传感器方向转正、前置镜头也镜像了，着色器里不再转、不再翻），拍照用离屏 EGL 按原图再算一遍（`OffscreenFilter`），卡片用 Canvas 画（`CardPainter`），交给 `Days.addShot`；安卓没有系统背景模糊，「调整」面板压一层较深的底 + 高光边。安卓暂时没有瘦脸 / 大眼（要人脸关键点库）。Mac、浏览器还是网页版（下面这条）。本机调试：`localhost/#camtest`（安卓调试版：`APP_URL_DEBUG=http://10.0.2.2:8793/` 编译，`am start … --es hash '#camtest'`）直接打开相机。
- **纪念相机**（2026-11-05 重新设计，用户定的）：界面上**只有** 左上返回（除了安卓侧滑，唯一的返回）· 调整 · 快门 · 翻转 · 倍率；没有相册键、比例键、样式条。按钮是系统相机那样的半透明深色圆（`.cam-ic`），不用液态玻璃（用户嫌怪）。**方案**（`CAM_LOOKS`：原生 / 柔光人像 / 奶油 / 清透 / 胶片 / 暮光 / 黑白，每个 = 一套滤镜 + 卡片样式 + 字体）在取景框上左右滑着换，中间闪方案名、下面一排小点。「调整」展开四页：美颜（磨皮、美白、红润）· 滤镜（强度、亮度、色温、颗粒）· 文字（卡片样式、字体）· 画幅。滤镜是实时 WebGL（`camGL` 的 `CAM_FS`），预览、拍照（按拍照尺寸重算）、没有相机时选的照片都用同一套：磨皮按肤色挑出皮肤、保留边缘；美白 / 红润主要作用在皮肤；默认值取抖音里公认最自然的一档（磨皮 55、美白 35、红润 20）；「原生」是老 iPhone 那一套后期（微暖、反差柔和、黑位略浮、饱和度克制）。瘦脸大眼要人脸关键点，没做。
- 纪念相机拍完**不弹出照片**：一下闪白、画面缩成小图飞进左下角的相册小图（`flyToRoll`），马上能接着拍；拍好就存进这个日子的相册（`storeShot`，闪退也不丢）——一张放好卡片的（相册里看的、分享的）+ 一张加了滤镜没放卡片的底图（`photo.cam.base`，不在相册里列出来）。相册大图里纪念相机拍的有「编辑文字」：底图铺好、卡片放回原样，只改样式和字体，「完成」后替换原图（喜欢、时间保留）。界面：左上返回，下面 相册小图 · 快门 · 翻转，「调整」在右下、翻转镜头上面。「调整」面板是透明液态玻璃（几乎全透，高光边 + 内发光，支持的浏览器带折射）。
- 纪念日相册：大图右上 ♥ 喜欢（`photo.like`，同步）；相册标题右边 ♥ 只看喜欢的、「选择」进入多选（打勾）一起删。
- 纪念日主页（纪念日列表、总览）的行**不能左滑**（2026-11-07 用户定的：和整页左右滑切页冲突，左右滑只管切页）。**长按**像相册那样浮起一张预览卡片（`days.js` 的 `openPeek` / `closePeek`，`.dv-peek`）：那一行从原位放大浮起（胶片放大到屏幕六成多宽、摆正），背景变暗变虚，下面列出 编辑 · 隐藏 / 显示 · 删除（删除红色、要确认）；点卡片进编辑，点外面缩回原位；长按不选字。开着时挂 `ui-open`，`LAYERS` 里有 `.dv-peek.on`。**隐藏**（`x.hide`，同步）= 纪念日列表里不列，只在总览里显示（淡一点，`.is-hid`，长按出来的是「显示」）。
- 总览「接下来」的胶片只在总览露出来时播一次（拖着切页时 `.page.drag` 一显示就播），落定时不再重播（以前的 `replayFilm` 会让它动完卡一下又动一遍）。
- 总览「接下来」默认像洗好的胶卷：两张一排挂在微微下垂的绳子上、木夹子夹着、左右微歪，每张一格胶片（上下齿孔，`filmHTML`）；右边一颗键换成一条一条的（`mcal.dvNext`，本机）。切到总览时胶片**只在页面落定后挂一次**：滑动中（`.page.drag`）卡片的动画暂停、绳子空着（`days.css` 的 `.page.drag .fl-card`），不然落定那一下图层切换会让动画在 iPhone / 安卓上闪回起点重播。「快到的里程碑」不变。
- **纪念相机横着拍**：App 只竖屏，像系统相机一样界面不转，按钮图标和卡片转正（`--cam-rot`、`.cam.rot`），拍出横的照片（`shoot` 里整张画面转过来，卡片按自己没转的排版画）。iPhone 由原生按陀螺仪的重力方向报（`WebShell.swift` 的 `watchRotation` 用 CMMotionManager，**不用 UIDevice.orientation**：竖屏锁打开时它一直报竖屏；桥接 `devRot`，网页 `__mcDevRot`），安卓 / 网页看重力（`devicemotion`），都绕过旋转锁定。转正的：按钮图标（原生玻璃上的图标由 `rasterIcon` 按 CSS 转的角度画进图片）、倍率、卡片；比例 / 样式 / 字体分段的字不转（和系统相机一样）。相机上的圆按钮 iPhone / Mac 用原生液态玻璃（在 `LG_SEL` 里），分段在支持的浏览器里带 `#lg-refract-soft` 折射。
- 纪念日详情页（`#dayPage`）、相机、看大图浮在上面时，页面级的左右滑（`index.html` 两个 touchstart 和 wheel）不处理它们里面的手指：只关掉它、回到原来那一页（总览点开的回总览），不会顺便翻页。
- 纪念日详情页（`#dayPage`）整页哪里都能从左往右滑退出（不只是左边缘；能左右滑的东西、开关、输入框上不触发），快速一甩也算；Mac 触控板两指往右扫。
- 纪念日的提醒时间胶囊（`.dd-rm-opts .qchip`）选上之后是一颗饱满的水滴胶囊：Cadence logo 渐变（#9E9AC8 → #C7B3CF → #EBC7A6）灌满，同色柔光、下沿一点内阴影、上沿一线淡亮边，刚点上的那颗从中间涨开（`freshRm`）。
- 纪念日分享图片的照片模板：底色、文字、数字和图标的颜色**全部按照片的颜色算**（`days.js` 的 `photoTone` / `photoPal`），不跟高亮色走；高亮色只用在没有照片的模板。
- 纪念日历的图标是实心的（`js/days.js` 的 `FILL`：f 填满、k / d 用 mask 镂空），放在灰底块（`--tile`）里。
- 侧拉菜单里子日历的「⋯」：以三个点为正中心展开一个小窗口：一颗玻璃水滴从三个点上的小圆一口气拉伸成窗口（带一点果冻回弹），收起时缩回小圆（网页 `ui.js` 的 `dropPop`，原生 `moreShown` / `moreUp`）（网页 `UI.menu(…, { center: true })`，iPhone / Mac 原生 `GlassDrawer.moreCard`），开关类的选项（`sw: true`）点了原地切换、窗口不关。开关的样子：一颗透明玻璃水滴（原生用系统 `glassEffect(.clear)` 盖在最上面），关着是空的，打开后 Cadence logo 的渐变色（#9E9AC8 → #C7B3CF → #EBC7A6）像气体一样在玻璃下面涨开、由模糊变清晰到饱满，充满后白色小勾从左往右画出来（带紫调投影）；**分两层**：一点就先铺上一层淡淡的 logo 渐变（约 0.18 秒）并马上画出小勾，给出干脆的反馈；原来那团气再在上面慢慢涨开、由模糊变清晰（约 0.6 秒）把层次补饱满——不要为了快把气的效果去掉；按下去水滴压扁、松手果冻回弹，切换轻震一下；不要手画高光（`FillToggle` / `FillToggleBody`、`.mi-sw`）。
- **所有开关都是同一种透明水滴开关，统一叫「Cadence 开关」**（用户定的名字，说「Cadence 开关」就是它：侧拉菜单「⋯」里那种）：设置里的每日未完成提醒、日程开始前提醒，日历表单、全天、纪念日编辑……所有 `input.switch` 都由 `ui.js` 的 `skinSwitches` 自动套上 `.mi-sw` 的样子（和侧拉菜单「⋯」里的一样），原来的 checkbox 透明盖在上面接点按，状态跟着它变（改 `checked` 也会跟上）。新写开关照旧写 `<input type="checkbox" class="switch">` 就行。
- 纪念日历自己也能选图标（和日子同一套实心图标，`c.icon`），原生侧拉菜单用对应的系统符号（`drawer.js` 的 `SF_OF`）。
- logo 扇形展开像扇子打开（**要干脆**：约 0.32 秒弹簧、按钮之间隔 35ms，四端一样）：从 logo 出发先朝第一个按钮的方向，沿圆弧转到各自位置，按顺序一个接一个（网页 rotate-translate-rotate，原生 `FanArc`，安卓角度插值）。原生的扇形按钮**只用位移、不缩放**：玻璃容器里的玻璃不跟着 `scaleEffect` 走，一缩放玻璃就和图标错开；收起用 `FanBack`（相对位移），因为 asymmetric 转场的两个 identity 会同时生效，再加一遍位置按钮就跑到两倍半径。
- **切换日历的动画是「直接」**（2026-11-25 用户在手机上从五种里亲手选的）：内容马上换，只有日历内容那一块（`#calBody`，纪念日历是当前页）从透明度 .35、缩放 .99 在 0.2 秒里清晰起来；标题板不动，不先淡出，不整屏变暗缩放（以前那样用户嫌难受）。`drawer.js` 的 `D.pick`。时序：点了马上换、0.14 秒后收侧拉菜单。
- 从设置等页面回到日历：上次画完以后数据、当前日历、日期、设置、窗口大小都没变就不整月重画（`app.js` 的 `calKey` / `calDrawn`；窗口大小在 resize 时记，**画完日历别当场读 `innerWidth`**，会逼整页排版，手机上多 22ms）。安卓冷启动预热页面一画好（0.25 秒）就开始，**设置页排第一**（用户手机实测：打开 2.3 秒进设置，没预热 208–258ms 一帧，预热后 25ms），只在用户停手 1.2 秒以上、停在日历页、没开面板时做，忙就等，不给空闲回调设超时。
- **安卓无障碍**（2026-11-25 用户手机实测）：三星默认开着 Bixby、智能文案帮写、三星 Pass 等几个无障碍服务（不是读屏），WebView 会在网页每次变动时重建整页无障碍树，一帧 20–35ms。`MainActivity` 里没开读屏（触摸浏览）时 `getAccessibilityNodeProvider()` 返回 null + `IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS`；开了读屏照常。只设 importantForAccessibility 不够，内核照样建。
- **点按不许等双击**（2026-11-25 用户手机实测的根本原因）：安卓 App 冷启动时 WebView 开着「双击缩放」检测（页面重新加载后又没有，所以只在冷启动复现），每次点按要等约 0.3 秒才出点击，快速补点的两下被当成双击、一个点击都不发——「刚拉出侧拉菜单点日历 / ⋯ / 新建子日历没反应」就是它。`styles.css` 里 `html, body { touch-action: manipulation; }` + viewport `minimum-scale=1, user-scalable=no`，别删。
- **侧拉菜单的拉开 / 收起 / 松手回弹交给浏览器跑**：同一条弹簧按 1/120 秒采样成关键帧（`drawer.js` 的 `springPts` / `glide`，挤压拉伸、行的错位位移都按 `look()` 同一套公式），不再每帧用 JS 推；手指拖着时照旧 JS 跟手。手机实测收起丢帧 10 → 6–8。
- **动画只改 transform / opacity**：水滴、卡片的展开收起用「固定成终点大小 + 位移缩放 + 按缩放补偿的圆角」（`ui.js` 的 `dropPop`、`drawer.js` 的 `morphKinds`），不要逐帧改 left / top / width / height（每帧重新排版、重算玻璃，安卓上一帧一帧地卡）。
- 侧拉菜单子日历的「⋯」：看到的是 36 的圆，点按范围是整行高 × 52（`.dr-more` + `::before`，原生 52 × 56），水滴还是从那颗 36 的小圆长出来。
- **复现「点不上」要用真手指的数据**：`adb shell -tt "getevent -lt /dev/input/event11"`（外屏触摸；不加 `-tt` 输出被缓冲，录空）录下用户真实操作，解析后用调试协议 `Input.dispatchTouchEvent` 按原时间原坐标注入测试版（网页坐标 = 屏幕像素 ÷ 2.625，纵向减状态栏 41）；SELinux 不让往 `/dev/input` 写。`input tap` / `input swipe` 和真手指差很多（用户按住只有 23–73ms、拉出后 0.15–0.35 秒就点、没反应会 85ms 补点），而且要在**冷启动**后测。测试时 `adb shell svc power stayon usb` 防锁屏，测完 `svc power stayon false`。
- **在用户手机上实测性能**（别再靠猜）：手机连 USB、开 USB 调试后，编一个和正式版并排装的调试版：临时给 `app/build.gradle.kts` 的 debug 加 `applicationIdSuffix = ".perf"`、`AndroidManifest.xml` 里 `.share` 的 authorities 换成 `${applicationId}.share`，`APP_URL_DEBUG=http://localhost:8794/` 编译，`adb reverse tcp:8794 tcp:8794`，`adb forward tcp:9224 localabstract:webview_devtools_remote_<pid>` 后用 Chrome 调试协议跑脚本量 rAF 帧间隔、抓 Tracing（`devtools.timeline` + `disabled-by-default-devtools.timeline.stack`）。编完立刻还原那两个文件，测完 `adb uninstall …perf`。注意：改了网页要先 `Network.clearBrowserCache`（WebView 会用缓存里的旧 js）；强制结束进程会丢本机存储，测试数据每次重造。模拟器是软件渲染，测不出 GPU 卡顿；手机 Chrome 有硬盘上的着色器缓存，测不出 App 的「第一次」卡顿。
- 新建日历（从「新建子日历」介绍卡片点进去的）：正常宽度 `min(屏宽 - 24, 420)`、左右居中、比正中略高一点，不跟菜单一样宽、不贴顶，也别太高（用户要打字：顶边在 (屏高 - 卡片高) × 0.42，比正中略高，`ui.js` 的 `popPlace` 里 `top`）。编辑日历还是屏幕正中。
- **月份交替只画一条线**（2026-11-06 用户定的）：不再框整个月，两侧不画，只在本月和上 / 下个月的交界处画一根 Cadence logo 色（#9E9AC8 → #C7B3CF → #EBC7A6）缓缓流动的细实线（阶梯形，`calendar.js` 的 `drawFrame`）。不要再用 SVG + SMIL 动画画它（主线程每帧重画整个当月，静止时也一直出帧，安卓卡顿的主因）：现在每段是一个小块，里面的渐变带用 CSS transform 平移；安卓上改成每秒挪 12 次（`flowTick`），因为安卓 WebView 里合成器动画也会让整个 App 每帧重画。
- **手机上新建事件是悬浮卡片**：四角圆、离两边 8、不贴底，顶边落在那一天所在那一周的下面（那一天露在上面，`editor.js` 的 `openMid` / `revealAbove`，`.composer.float`）；标题下面一行小字写日期。
- **月视图上下滑的惯性和吸附**（2026-11-07 用户调过两次：嫌卡、短滑跳行、停下前滑太久太远）：以**手指按下时那一行**为准（`snapMonth(v, start)`）：挪不到约 0.45 行而且慢 → 留在原地；有意滑一下（估出来不到两行）→ 正好走一行；再多才按估算走（能滑多远 = 速度 × 220ms，`GLIDE_TAU`）。月份磁吸只在用力长甩（速度 > 1.2、会滑过 3 行以上）时才有。松手后沿手指速度减速滑到那一行（`glide`，三次方减速，0.2–0.7 秒停稳），慢松手 / 往回拉的用弹簧。不要改回「一松手就用弹簧拽到目标行」或「过半行就跳」。滚动中别做重活：别的月份变灰（`markOut`）等停稳再改，月份标题别扫全部事件。
- 月视图滚动时月份交界线淡下去，停稳那一刻（弹簧结束 settle）收回（`calendar.js` 的 `markMoving` / `endMoving`，`.mframe.moving`）；星期在标题板里，不再跟着变淡。停稳时**不整块重画**：只有离边快不够了才 `recenter`，否则 `markOut` 原地改别的月份的淡色——重画会把手指下面的格子换掉，第二下滑不动（安卓最明显）；触摸的 move / end 也挂在 `e.target` 上兜底。
- 侧拉菜单底部是「新建子日历」，点开是两种日历的介绍卡片（左记录日历、右纪念日历，各带一个简单的效果图），不要再改回系统菜单。卡片从「新建子日历」那颗胶囊长出来、收回时缩回胶囊（`js/drawer.js` 的 `morphKinds`，iPhone / Mac 按原生按钮的固定位置算）。网页 / 安卓里侧拉菜单留在卡片下面；iPhone / Mac 的原生侧拉菜单会先收起，没选就取消时再打开回来。纪念日历的示例不要写「考试」。iPhone / Mac 上介绍卡片是原生画的（`GlassDrawer.kindsCard`，文字来自 `D.model().kinds`），浮在原生侧拉菜单上面，侧拉菜单不收起。展开 / 收起是真的液态玻璃水滴，**一步到位、中途不停、要干脆（展开约 0.4 秒、收起约 0.3 秒，别拖长）**：玻璃从「新建子日历」胶囊里被拉长、拉出去，一口气弹开成卡片，收起倒过来融回胶囊（网页 `morphKinds` 的 `.ks-blob`，原生 `GlassDrawer.pillAndKinds` 一个弹簧 `kPhase` 0 → 2，同一个 `GlassEffectContainer`，状态同步放在一直都在的那一层）。卡片**收在侧拉菜单里**（2026-11-05 用户定的：不超出菜单的范围）：和菜单一样宽，底边落在胶囊上方往上长；两种日历上下排，每张左边是缩小的效果图（原样缩到 0.58，不重画）、右边名称和说明（网页 `#calKindSheet.in-drawer`，原生 `pillAndKinds` / `kindOption`）。展开后胶囊留在原位、只剩一颗空的液态玻璃，带凹陷、细亮边和投影，一眼看得出空了（`.dr-add.empty`）。底栏不让路。
- 有面板开着时根元素挂 `ui-open`（`js/ui.js` 的 `syncBackdrop`），三端的注入脚本靠它把原生底栏控件（时钟、logo、回到今天、分页点）收起来，别再只看某一个面板。
- 悬浮卡片（`.sheet.fl`）在宽、够高的窗口（≥700 × 520，Mac、iPad）里居中弹出，不贴在底部；手机上从底部弹出（要打字的表单，键盘不挡）。新建子日历的介绍卡片在侧拉菜单里（见上）。
- 纪念日历也能「在主日历显示」：日子到了那一天显示在主日历和小组件里（只读，点开是详情页）。
- **纪念日的颜色只由自己选的图标决定**（`iconColor`），类别只用来分组，选类别、按名称猜都不换图标。新建面板顺序：名称 → 日期 → 图标 → 类别 → 重复 → 更多选项。
- **提醒都可以多选**（用户定的）：事件 `remind` 是第一个（老版本只认它）+ `remindMore` 另外几个（`MC.remindsOf` / `withReminds` / `fireTimes`，安卓 `Data.Event.reminds` / `fireTimes`，iOS / Mac `CEvent.reminds` / `fireTimes`）；课程提醒 `lead` + `leadMore`（`MC.leadsOf`、安卓 `courseLeads`、Swift `courseLeads`）；同一个事件 / 课的几次提醒各发一次（key 后面带提前量）。选的时候用 `UI.multiMenu`（一直用网页的菜单打勾，App 里 `UI.menu` 被换成原生菜单、点一下就关，没法多选），打勾用正文色，不要蓝色。
- 子日历「⋯」里的「统一提醒…」：**对这个子日历生效**（用户定的）：选的几个提前量记在 `cal.remindDef`，日历里每个事件（以后加的也一样）到点时都按它提醒，和事件自己的提醒合在一起；**不写进各个事件**（用户还会改）。四端到点时合并：网页 `MC.effReminds` / `fireTimes`、`send-reminders.mjs` 的 `calRemind`、安卓 `Data.java` 读 cals 时并进 `Event.reminds`、Swift `Model.swift` 同样。编辑事件时提醒那一行写「跟随日历：…」。点一下就存，没开通知的顺手打开。
- **无需完成**（2026-11-25 用户定的：每年重复的日子只负责一个通知）：事件 `noDone`（同步）或整个子日历 `cal.noDone`（「⋯」里的开关，不写进各个事件，以前勾过的 `done` 留着）。判断一律用 `MC.noDoneOf` / `MC.isTask` / `MC.doneOf`（安卓 `Data.Event.noDone`、Swift `CEvent.noDone` 读数据时就把日历的合进来、`done` 当成 false）：列表里完成框换成中性小铃铛（`.check.nd-mark`，点了打开编辑），没有「已完成」按钮和「标为完成」，色条不画已完成，不算逾期、不进「已完成 x/y」、不进每日未完成提醒和记录日历的完成率；**到点提醒照发**。新建 / 编辑面板里在「提醒 / 重复」下面一行 Cadence 开关（单个和批量共用的日期选择器 `extraRows`），长按菜单里「设为无需完成 / 改为需要完成」。
- **已逾期只看这个月的**（2026-11-25 用户定的）：结束日在本月 1 号以后的才算，1 号那天看过去一周（`MC.overdueFrom` / `MC.isOverdue`，安卓 `Data.overdueFrom`、Swift `CalData.overdueFrom`），今日页、列表里的红日期、今日小组件都按它。
- **从点的那一条拉伸出来的小卡片**（用户定的，所有同类都这样，不再从底部滑上来）：选择窗口、动作菜单（「更换同步方式」、换头像、备份……）、提醒通知、帮助、同名事件、导入、表单（`ui.js` 的 `POP` 名单）。和新建子日历的水滴一样：一滴液态玻璃从点的那一条（同样位置、大小、圆角）被拉长、一口气展开成卡片，内容在一半多时淡进来；收起时卡片整块连着缩回那一条，**卡片自己**一口气缩回那一条，边缩边暗、淡掉，像沉回下面一层（`.pop-out`），不另画玻璃外框（用户嫌外框闪一下就没了）。卡片放在那一条下面（放不下放上面），宽度跟那一组一样；要打字的表单放屏幕上方（键盘不挡）。点的是哪一条由 `UI.open` 记下的最近一次点按自动找到（`opts.from` 可以指定）。`popPlace` / `popMorph`、`.sheet.fl.pop`、`.pop-blob`。
- **选择窗口统一**（用户定的）：所有「选一个 / 选几个」（有当前选中的）都用同一种窗口 `UI.choose`（`#chooseSheet`，和「提醒通知」一样的悬浮卡片：左上玻璃「取消」、标题、一组行、选中的右边打勾）。单选点一下打勾马上收起；多选（`UI.multiMenu`）点一下就存，「无」和具体项互斥，「完成」收起。`UI.menu` 自动分流：除了以「⋯」为中心展开、带开关的小窗口（`opts.center`），选择类和动作菜单都走 `UI.choose`（动作菜单不打勾，`.act`）。App 的注入脚本给 `UI.menu` 赋的原生菜单被 `ui.js` 的 setter 记下，只给动作菜单用。网页自己的菜单收起一律用 `closeWeb`（App 把 `UI.closeMenu` 换成了空函数）。
- 小菜单（动作菜单）从点的那个按钮里长出来：先是按钮的位置、大小、圆角，一口气展开（约 0.24 秒，不回弹），字跟着淡进来；收起缩回按钮（网页 `dropPop`，原生 `GlassMenu` 的 `grownID`）。弹出的窗口、确认框都不回弹。
- **编辑 / 新建日历**（2026-11-24 用户重定的：以前太长、不居中、太窄、等级很怪）：从侧拉菜单 / 「⋯」小菜单点开的卡片（编辑日历、统一提醒等）在**屏幕正中**弹出、宽 `min(屏宽 - 24, 420)`（`ui.js` 的 `popPlace` 里 `mid`）。顶上一行 = 图标块 + 名称输入框（`.cf-head`，不再单独一大块预览）；颜色两排各 7 个对齐（`.cf-sw`），色板 `MC.CAL_COLORS` 和优先级色同一档明度彩度，旧暗色板的颜色打开时对应到新色板最近的那个；等级名称是一排四个同色淡底的输入框 + 下面一根从低到高的细色条（不要圆点、描边、「绿 = 最低」说明）。开关不要 SVG 折射（小开关上会把左边缘挪碎）。侧拉菜单外圈的透明液态玻璃和中间的磨砂卡片，**任何状态都不许为性能改样子**（2026-11-25 用户骂过：有面板开着时关掉外圈滤镜、卡片换不透明色，外圈看起来成了磨砂）。**也不许用「看起来一样」的等价写法替换**（2026-11-25 拆成四条细带、把饱和并进卡片，模拟器截图一样、真机上外圈成了磨砂，用户第二次骂）：外圈就是 `.drawer::before` 一整块的背景滤镜。
- 侧拉菜单里**长按子日历拖动排序**（记录日历、纪念日历各自一组）：拿起来的一行浮起跟手、同组让位，松手排好；顺序存 `cal.order`（同步；`MC.calKey`、`MC.reorderCals`，合并时按它排，安卓 `CalMerge.kt` 一样）。网页 `drawer.js` 的 `startReorder`，iPhone / Mac 原生 `GlassDrawer.reorderable` → `NavModel.reorder` → 网页 `D.reorder`。
- **按住 logo 拖动**（四端一样，2026-11-06 用户定的）：拖起来就打开扇形，扇形这一块放大 1.12（原生改尺寸、加位移，不用 scaleEffect），周围暗下去（网页再虚一点）；**不要线**：logo 外面那圈透明玻璃被手指拉过去，根就是 logo 的玻璃圆，颈按水的表面张力（刚拉出来粗、根部张开，越拉越细但不细成线，`dropGeom` / `FanDropSize.geom` / 安卓 `dropGeom`），**出了扇形这一块（离 logo 中心 150）就断开成独立的一滴**，连着手指下面的一小滴玻璃，**logo 图标不动、不变形、不糊**（网页 canvas `.fan-trail` 的 `dropPath`、iOS / Mac `FanGlassDrop` + `DropShape`（拖着时 logo 自己的玻璃换成 `Glass.identity`）、安卓 `FanTrail` 的 `dropPath`）；手指离扇形按钮中心 100 以内（2026-11-11 从 58 放到 84，2026-11-25 用户又嫌要在按钮附近才识别，放到 100；几颗都够得着时取最近的那颗）；不够近但已经离开 logo 30 以上，就按手指朝的方向选（差 50° 以内，`fanPick`）；扇形按钮的点按热区 84（圆面 50），松手那一下的位置再判一次——拖得快、一甩就松手也能选上（不要按按钮动画中的位置判）；**离 logo 中心超过 150（水滴断开、出了扇形这一块）就什么都不选**（2026-11-24 用户定的：拖太远不要选中），松手时那里够不着也不退回之前选中的那颗——它就变大（1.26）、水滴被吸过去一点、冒出 logo 色调的粒子、轻震，**选中着就一直冒粒子**（每 45ms 三颗，不只刚选中那一下）；松手选中它，不在按钮上就收起；刚拖完的那一下不算点 logo。
- **扇形打开时（点开或拖动）整个界面暗一点，只有 logo 和扇形这一块亮着**（聚光圆心是 logo，120 以内全透、210 外全暗；浅色 12%、深色 32%，拖动时 17% / 40%）：让人看得出正在这里交互（不然拉不动侧拉菜单也不知道为什么）。网页 `.dock-scrim`（`spot()` 算 `--sx` `--sy`）、iOS / Mac `FanSpot`、安卓 `DockOverlay`。
- 隐私政策整页（`#pvDoc`）盖上去时算最上面一层（`LAYERS` 里有它），下面设置页的原生玻璃返回键不画，原生底栏也让开（`ui-open`）。
- 纪念日提醒：`reminds`（提前几天，在 `remindAt` 钟点）+ `remindH`（提前 1 / 12 小时，按精确时间、没有就按 0 点）+ `remindTz`，四端各自排（同课程提醒那四处）。
- 主题背景：`g:<名字>` 是内置背景（`SCENES`，画成图片当照片用），不要再加纯色；旧的 `c:#颜色` 只保留显示。
- 高亮的色块一律画成带光的圆角空心框（和列表里高亮一样），原生菜单用 `swatch` 字段传颜色。
- 有更上面一层（详情页、面板）时，`MC.LG` 不再算下面那页的遮挡（`.dv-bar` 等），不然会把上面的玻璃按钮挖掉一条。
- 安卓自动备份：`Backup.java`（系统文件夹选择器，每天一份「节律自动备份-日期.json」，留 7 份），提醒引擎每次醒来顺便检查。
- 面板（新建事件、批量添加、添加 / 编辑课程）在手机上有几档高度（`UI.detents`：.4 / .56 / 默认 / .74 / .9），往下拉先停在矮一档，拉过最矮那档才收起；不要一打开就铺满整屏。面板最上面 72px 一整条都能抓着上下拉（含取消 / 确认按钮，没拖动就是点按），别只认那根细把手。
- 今日页：从时钟胶囊长出一张大圆角卡片，可中途打断反向。圆角一直按当前卡片短边的一半过渡到 44（不要方框），iPhone 停在 44，网页 / Mac 最后 20% 才收成直角。今日页打开或展开中，别的页面里的原生玻璃不画（`js/ui.js` 的 `td`）。
- 分段选择（`.seg`）、按钮、标签一律是胶囊或大圆角，不要方角。
- 选日期的小月历按这个月实际占几周画（4–6 行），不把下个月整周塞进来。
- 翻译：繁体没写进字典的靠 `i18n.js` 的 `CMAP` 逐字转换，新增界面文字用到新的简体字要补进 `CMAP`；英 / 法 / 日要在字典里各加一条。
- 液态玻璃要**透明**（中间几乎全透，靠高光边和折射），深色模式**不要白边**。
- **优先级色条是渐变**（用户定的）：低在右端过渡到中级，中两端分别过渡到低级 / 高级，高在左端带一点中级；2026-11-24 用户重定的过渡规则：**不提亮**（提亮会像另一层、挡白字），橙 ↔ 红在 OKLCH 里色相顺着走；蓝 ↔ 橙**不转色相**，在 OKLab 里直接混合（中间短短一截中性灰调；转色相会经过紫、粉，用户明确不要紫色），都不半路突变，过渡集中在最末端（缓入曲线）；低右端走到完全的中级色，中两端走 80%，高左端只走 50% 且最集中（不遮字）。色标位置不变（低 75–100、中 0–12.5 / 87.5–100、高 0–25），算好的固定色标，几处同一组：`js/store.js` 的 `GRAD`、`macos/Shared/Colors.swift` 的 `Pal.GRAD_L/_D`、安卓 `chip_p*.xml`（底色 + 每侧两层透明叠层）+ `colors.xml` 的 `chip_p*_l1/l2/r1/r2`、`widget.html` / `widget-ios-scriptable.js` 的 `PGRAD`。月 / 周视图的色条两端的过渡顺着圆角弯（`MC.chipGrad`）。已完成、别的月份、记录日历颜色不渐变。
- **批量添加的卡片**（2026-11-24 用户定的）：名称 / 备注是一组带底色的输入框（46 / 42 高，整行可点）；优先级是卡片最右边一根竖条（`UI.priBar(…, { vertical: true })`），顶上写「优先级」，最下面无、最上面高，不另外列字，玻璃圈里写着当前那一档、字用那一档的颜色，拖动时像滚轮一格一格滚过去（`.pb-reel`）；竖条的渐变比纯色浅一档（纯色太暗、太浅又看不出颜色）。卡片按优先级在外框内侧泛一圈色（无 = 默认，低 / 中 / 高 = 天蓝 / 琥珀 / 朱红，只在边上、往里很快淡掉，拖动中跟着变，`.b-card.v[data-p]`）。记录日历的等级还是横着一行。日期选择器切到「时间段」时日期日历默认展开，选好日期接着展开时间。
- **月 / 周视图的事件色条**（2026-11-24 用户定的）：主日历还是彩底白字（优先级渐变），圆角 6.5；**只有中文字**小一号（9px、字距 .02em，`calendar.js` 的 `chipText` 把连续的中文包进 `.cj`），英文、数字保持 9.5px 和原来的紧凑字距（用户说过：只改中文，整条变细变长很难受）；标题放不下时截断处像色条右端的渐变一样淡出：`fadeOverflow` 在空闲时分批找出最后 7px 里的一两个字，字色调透明、最淡也留 45%（`.fd` + `--fa`；2026-11-25 用户嫌淡到看不见字，小组件同样：iOS 遮罩、`widget.html` 最淡 45%，安卓格子用系统渐隐边只能缩短到 3dp）；**不要用 mask-image**（安卓上几百个遮罩各开一层离屏画，滑动的慢帧多 25–35ms）。分日历（记录日历、纪念日历）的事件**在主日历里显示时也用分日历那种左竖条样式**（`calendar.js` 的 `subCls` → `.chip.sub`）。小组件一样：中文小一号、截断渐隐、分日历左竖条（iPhone / Mac `MonthView.swift` 的 `chipText` / `subFill`，安卓 `Widgets.java` 的 `chipText` / `sub_chip.xml` + `widget_month.xml` 的 `requiresFadingEdge`，`widget.html`；Scriptable 只能做左竖条）。子日历（`body[data-cal]`）用另一种：左边一根实色竖线 + 半透明淡底 + 同色深字。
- **性能（安卓）**：藏起来的带 `backdrop-filter` 的浮层要 `visibility:hidden`（淡出完再藏），只是 `opacity:0` 安卓照样每帧算模糊；SVG 折射（`lg-refract`）在滚动中由 `ui.js` 挂的 `html.scrolling` 暂时关掉，停下恢复。色条那种很长的渐变**不要写进每个色条的 style**（2b75223 这么做过：月视图 HTML 从 384KB 涨到 4.2MB、每次重画慢一倍，安卓明显变卡），在 `:root` 定义一次（`store.js` 的 `mcChipGrad`：`--cgl1…3` / `--cgk1…3`），色条上只写 class（`MC.toneCls` → `pg1–3`，渐变是 `store.js` 注入的固定规则；`var()` 引用也不行：每次重算样式都要把那串渐变重新解析一遍）。冷启动预热（安卓）：App 打开后空闲时把侧拉菜单、新建面板、日卡片、弹出卡片、小菜单在原位以 1% 透明度各画两帧（`drawer.js` 的 `warm`、`app.js` 的 warm-up、`.warm-up`），让 GPU 提前编译绘制程序；原生代码有基线配置 `android/app/src/main/baseline-prof.txt`。
- **优先级从左到右 = 低 → 高**。颜色按色彩心理学：无 `#A3A1AD` 灰 · 低 `#4687DB` 天蓝 · 中 `#E48E50` 杏橙 · 高 `#D53D37` 朱红（2026-11-24 用户从五种橙里选的「杏橙」：旧的琥珀 `#C98A1E` 太暗、像屎一样发棕，橙色明度别低于约 0.7；之后用户嫌红压不住橙、橙太艳、三色不在一个图层：橙降饱和、红加深，三色的明度和鲜艳度拉齐；深色调由 `MC.darkTone` / `CourseColors.darkTone` 按 OKLCH 算）。优先级用拖动条选（`UI.priBar`），渐变的每档颜色要正好落在刻度上。
- 品牌渐变（加号、选中的今天）：明亮的金黄 → 天蓝 → 亮蓝（`--brand-a/-mid/-b`），不要深色，不然发闷。
- **红色 `--red` 只用于**「现在时间」的线、删除、出错、逾期，和优先级无关。
- **记录日历的等级从左到右 = 默认（无）→ 最低 → 最高**（`MC.RATE_ORDER = [4, 3, 2, 1]`）：等级条、分段评价、等级菜单、日历设置里的名称、统计图例都按这个顺序。数据里 1 级 = 红 = 最高（比如「超忙」），4 级 = 绿 = 最低（比如「轻松」），颜色跟着名字走。热力图配色不动。
- **记录日历的统计页**：上面一张大圆角时段卡片（`#rsCard`），里面 周 / 月 / 年 / 全部 四页左右滑动切换（scroll-snap），顶上的胶囊滑块跟着手指走，每页自己的 ‹ › 翻时段（`rs.offs` 各记各的），页里是大数字、一句话、等级分布条（从左到右低 → 高）和几个小数字；卡片外面一排胶囊换看法 概览 / 时段 / 事件 / 备注，下面内容跟着卡片当前那一页（`app.js` 的 `renderRsCard` / `renderRsBody`）。
- 标题板里子日历名字的色块（`.cal-chip`）不要光晕（`text-shadow: none`）。
- 标题板里记录日历的名字是真文字（`#calChip`），别用 `::before` 写字。

### 颜色要同步的位置

改配色时这几处要一起改，否则各端不一致：

1. 网页：`styles.css` 顶部的 `:root` 变量（`--p0…--p3`、`--accent…`、`--red`）和末尾的 `--brand-*`；`js/store.js` 的 `MC.PAL.light`。
2. iOS / Mac：`macos/Shared/Colors.swift`（`Pal.P`、`accentV`、`fab`、`accentText`、`RED`），`macos/App/GlassNav.swift` 的 `Brand`。小组件也用 `Pal`。
3. 安卓：悬浮控件 `android/…/ui/Theme.kt`、`Palette.kt`；小组件在 `res/values*/colors.xml`（含 `brand_a/_mid/_b`）、`res/drawable/`（今天的日期 `today_bg.xml` 用品牌渐变）和 `Widgets.java`。
4. 网页版小组件和 Scriptable 脚本：`widget.html`、`widget-*-scriptable.js`。

安卓小组件的红色是 `res/values*/colors.xml` 里单独的 `red`（逾期、课表现在时间线），不要用 `p3`。XML 注释里不能出现两个连续的减号。

## 联动分组（改一处，同组的都要看一遍）

**规则（用户定的）**：影响操作体验的地方该用原生就用原生（iPhone / Mac 上盖在网页上的原生层，网页里的东西浮不上去），不要偷工减料。写代码时先判断这次改动属于哪一组，按组增删；改完对照同组每一处，确认都改到了（比如改了色条，已完成、别的月份、跨天横条、小组件都要跟着改）。新增同类的东西时，加进对应的组，并在代码里打上同样的标记。

每组在各处的定义点都有注释标记 `【联动:组名】`，改之前先搜：`grep -rn "联动:组名" js styles.css index.html widget* scripts macos ios android/app/src/main`。

| 组 | 包括哪些（每一种状态都要算：没完成 / 已完成 / 别的月份 / 跨天横条 / 浅色 / 深色） | 位置 |
| --- | --- | --- |
| 优先级颜色 | 无 · 低 · 中 · 高 四个基础色和它们的深色调 | `styles.css` `--p0…--p3`、`js/store.js` `MC.PAL`、`Colors.swift` `Pal.P`、安卓 `colors.xml` `p0…p3` / `chip_p*` / `p*_soft`、`widget.html` `COLORS` + CSS 变量、`widget-ios-scriptable.js` `PHEX` / `PDARK` |
| 优先级色条 | 渐变色标；月 / 周视图色条、跨天横条、已完成和淡色条 | `js/store.js` `GRAD` / `priGrad` / `toneVars`（`--cg` `--cgd` `--cgo`）、`styles.css` `.chip` `.chip.done`、`Colors.swift` `GRAD_L/_D` + `chipFill`、`MonthView.swift` `chip()` / `bar()`、安卓 `chip_p*.xml` `chip_p*_soft.xml` + `colors.xml`、`Widgets.java` `CHIP` / `SOFT`、`widget.html` `PGRAD`、`widget-ios-scriptable.js` `PGRAD` / `chipGrad` |
| 品牌渐变 | 加号、选中的今天、小组件今天的格子 | `styles.css` `--brand-*`、`Colors.swift` `todayTint` / `todayStyle`、`GlassNav.swift` `Brand`、安卓 `Theme.kt` `brandA…`、`Palette.kt`、`colors.xml` `brand_*`、`today_bg.xml` `more_today.xml`、`widget-ios-scriptable.js` `brandGrad` |
| 主色和红色 | 主色（`--accent`，中性黑白；日历选区的蓝是单独的 `--cs`）；红色只给现在时间线 / 删除 / 出错 / 逾期 | `styles.css` `--accent*` `--red`、`Colors.swift` `accentV` `RED`、安卓 `Theme.kt`、`colors.xml` `red` |
| 深色调 | 任意颜色的深色版（OKLCH 规则） | `js/store.js` `MC.darkTone`、`Colors.swift` `CourseColors.darkTone`、`CourseColors.java` `darkTone`、`widget.html` `darkTone`、`widget-ios-scriptable.js` `PDARK`、`widget-days-scriptable.js` `darkTone` |
| 课程颜色 | 按科目配色 | `js/sched.js` `toneOf`、`Colors.swift` `CourseColors`、`CourseColors.java`、`widget-sched-scriptable.js` `toneOf` |
| 底部悬浮控件 | 时钟胶囊 · 分页点 · logo 扇形 · 回到今天；状态字段 `t ap today back pager n p set st lit pv`；中轴、高度、扇形角度 | `index.html` dock2 + 扇形脚本、`styles.css`「悬浮控件」、`GlassNav.swift` `NavModel.Dock` / `GlassDock` / `DockSize`、`ios/App/WebShell.swift` `navJS`、`macos/App/MainWindow.swift` `navJS`、安卓 `Dock.kt` `DockModel` + `NAV_JS` |
| 顶部悬浮 | 顶部标题板（月份、星期）、吸附线（`--snap-y`）、周视图 / 年视图顶部留白、侧拉菜单的顶 | `js/calendar.js` `measure()`（`--wk-y` `--pill-y`）、`styles.css` `.topbar` `.weekdays` `.cal-w` `.drawer`、原生 `GlassDrawer` 的上边距 |
| 原生玻璃 | 网页控件由原生画液态玻璃：哪些控件、遮挡、坐标 | `js/ui.js` `LG_SEL` / `LAYERS` / 今日页 `td`、`styles.css` `.lg-native .lgx`、`GlassNav.swift` `GlassLayer`、Mac `MainWindow.swift` `lgLayer`（要 `ignoresSafeArea`）、iOS `CadenceApp.swift` |
| 提醒 | 事件 / 每日 / 课程 / 纪念日提醒（四端各自排） | `js/push.js`、`scripts/send-reminders.mjs`、安卓 `Engine.java`、`macos/App/Engine.swift` |
| 同步数据 | 数据格式和合并（字段只增不删） | `js/store.js` `MC.merge`、安卓 `CalMerge.kt` / `Data.java` / `Store.java`、`Model.swift` `CalData` / `SharedStore.swift` |
| 翻译 | 新文字要补四种语言 + 繁体转换表 | `js/i18n.js`（字典 + `CMAP`）、`macos/Shared/I18n.swift`、安卓 `I18n.java` + `res/values-*/strings.xml` |
| 侧拉菜单 | 日历列表、「更多」菜单（原生直接用网页给的 `menu`）、新建子日历（先弹两种日历的介绍卡片 `#calKindSheet`） | 网页 `js/drawer.js`（`D.model` 给原生用、`D.add('')` 打开介绍卡片）、iOS / Mac `GlassNav.swift` `GlassDrawer`、安卓用网页的（拉出时 `NAV_JS` 的 `cover` 让原生控件让开） |
| 在主日历显示 | 记录日历的事件、纪念日历的日子（每次出现的那天当成只读事件，id `dayv:`，网页里带 `dv`）出现在主日历和小组件里；计数、完成统计、每日提醒不算纪念日 | 网页 `js/store.js` `MC.reindex` / `dayEvents`、`js/ui.js` `itemHTML`（心形、点开详情）、`js/calendar.js` 预览计数和 `tally`、`js/app.js` 今日页、`js/push.js` 每日提醒；`Model.swift` 建索引处；安卓 `Data.java` `index()` |
| 小组件格线 | 每周之间（和课表每小时）的横线；每天之间不画竖线（用户定的） | `MonthView.swift` 背景画布、`ListViews.swift` 课表时间轴、安卓 `cell_*.xml` + `Widgets.java` 课表、`widget-ios-scriptable.js` `sep`、`widget-sched-scriptable.js`、`widget.html` `.c` |
| 记录等级 | 等级顺序 `RATE_ORDER`、名称、颜色、统计 | `js/store.js` `RATE_ORDER`、`js/editor.js` 等级条、`js/app.js` 统计、`js/drawer.js` 等级名称 |
| 版本号 | 改原生代码就加 build | `version.json`、`ios/version.json`、`macos/version.json` |

## 版本号和发布

- 根目录 `version.json` 是大版本（网页、安卓、iOS、Mac 共用）。源码里 `?v=0.22.0` 和 `sw.js` 的版本是占位，`pages.yml` 发布时自动改写，不用手改。
- **每次推送上线都要改 `version.json`**（2026-11-24 用户定的：以前推了好几次界面上还是 1.4.2）：一般改动最后一位加一（1.5.0 → 1.5.1），改动大（新功能、整体换样子）时中间一位加一、最后一位归零（1.5.x → 1.6.0）。界面上只显示这个号，自动加的构建号（`-b序号`）和 iOS / Mac 的 `build` 用户看不到，不能代替它。
- **改了 iOS / Mac 原生代码**：`ios/version.json`、`macos/version.json` 的 `build` 各加一（用 Mac 续签的 iPhone 和 Mac App 靠它发现新版本）。
- **改了 `android/` 或 `version.json`**：推送后 `android.yml` 自动编译签名，发布到 Releases（`android-<版本>-<序号>`），App 里「设置 → 安卓 App」检查更新。改版本号也重新打包（用户定的），安装包的版本号和界面上显示的一致。
- 推送到 `main` 就是上线。**提交、推送前先问用户**。

## 本地开发和验证

- 网页预览：`.claude/launch.json` 里的 `web`（`python3 -m http.server 8791`）。别的会话占着 8791 时用 `web-8792`（python 不认分配的端口，直接打开 `http://localhost:8792/`）。手机尺寸用浏览器面板的 mobile 预设。
- 本地开发（localhost）现在不注册 Service Worker，打开时还会注销旧的、清掉缓存（`js/app.js`）；但第一次换成这一版之前注册过的，要先手动注销一次。
- **Service Worker 会缓存旧文件**：改完看不到效果时，先在页面里注销 SW、清 caches，再用 `fetch(url, {cache:'reload'})` 刷一遍 CSS / JS，最后重新打开。
- 第一次打开有隐私弹窗（`#pvYes`）。测试时加的事件记得删掉。
- iOS：`bash ios/build.sh sim` 编译模拟器版；调试版用 `devURL` 指向本机网页：`xcrun simctl spawn booted defaults write io.github.salmangox.cadence devURL http://localhost:8791/`（用完改回原值）。
- iPhone 真机：`bash ios/install-iphone.sh` 编译并装到连着的 iPhone（数据线或同一 Wi-Fi），同时打开自动续期。
- Mac：`bash macos/build.sh` 会**直接替换「应用程序」里的节律并打开**，只想检查能不能编译时别用它。它编完会自动删掉 xcodegen 生成的 `macos/App/Info.plist`、`macos/Widgets/Info.plist` 和 entitlements。**不要在 `macos/` 里单独跑 `xcodegen`**，不然 iOS 编译会报「Multiple commands produce」，跑过的话把这几个文件删掉。先装 iPhone 再编 Mac（Mac 脚本会清掉多余的 `Cadence.app` 副本）。
- 安卓：本机有 Android SDK 和 Homebrew 的 JDK 17。编译要带上环境变量：`ANDROID_HOME=$HOME/Library/Android/sdk JAVA_HOME=$(/usr/libexec/java_home -v 17) bash ./gradlew :app:assembleDebug`（在 `android/` 里跑；`gradlew` 没有执行权限，用 `bash` 跑）。

## 署名和联系方式

- 所有开发都署名 **SalmangoX**，任何页面（隐私政策、关于页、App 内）都不要写个人真名。联系邮箱一律用 jxz2651189539@163.com。
- 隐私政策：`privacy.html`（`?embed` 时不显示网页自己的顶栏，App 里由 `index.html` 的 `#pvDoc` 整页盖上去，左上角返回回到原处，不离开 App；`&dark` / `&light` 跟 App 的浅色 / 深色）。设置里点「隐私政策」是只读回看（只有「完成」，点外面也能关），不再要求重新同意。内容要和实际功能一致（同步是 GitHub Gist / WebDAV / iCloud，网页版的关 App 提醒、相机、相册）。

## 协作注意

- 可能有别的会话在同一个文件夹里改（比如安卓原生）。**只提交自己改的文件**：用 `git commit -- <路径>`，别 `git add -A`，别动别人暂存的东西。
- 根目录别再放更新压缩包、旧副本之类的文件（以前 DeepSeek 留下的一批已清理）。
- `index.html` 末尾的 dock2 脚本是底部悬浮控件和日历 ↔ 日程拖拽切页的逻辑；`styles.css` 末尾「悬浮控件」一节是它的样式，只保留一份，别重复追加。
