/* 节律 · 纪念日历（倒数日 / 纪念日）
 * 在左侧日历栏新建「纪念日历」后，日历页换成这个视图：未来的日子倒数，过去的日子累计。
 * 每个日子：图标、分类、高亮、置顶、精确时间、小纸条、相册、分享图片、透明相机。
 * 数据在 store.js（MC.data.days / books / album），照片本身放在单独的私密 Gist（不拖慢日历同步和小组件）。
 */
(() => {
  'use strict';
  const MC = window.MC, UI = MC.UI, $ = UI.$, esc = MC.esc;
  const Days = (MC.Days = {});
  const pad = MC.pad, ymd = MC.ymd, parse = MC.parse;

  // ---------- 多语言：本模块的界面文字（繁体由 i18n.js 自动转换） ----------
  const LANG = MC.lang ? MC.lang() : 'zh-Hans';
  const DICT = { en: {"小号显示置顶（没有置顶就是最近的）日子；中号和大号再列出接下来的几个。在 App 里置顶的日子会显示在这里。": "Small shows your pinned day (or the next one); medium and large also list the ones after it. Pin a day in the app to show it here.", "复制纪念日小组件脚本": "Copy days widget script", "长按小组件 → 编辑小组件 → Script 选「纪念日」。": "Touch and hold the widget → Edit Widget → set Script to “Days”.", "回到桌面长按 → 编辑 → 添加小组件 → Scriptable → 选小号、中号或大号。": "On the Home Screen, touch and hold → Edit → Add Widget → Scriptable → pick small, medium or large.", "打开 Scriptable → 右上角 ＋ → 粘贴 → 把标题改成「纪念日」→ Done。": "Open Scriptable → ＋ at the top right → paste → rename it “Days” → Done.", "点下方「复制纪念日小组件脚本」。": "Tap “Copy days widget script” below.", "先在「账户与同步」连接 GitHub，并同步成功一次。": "First connect GitHub in Account & sync and sync once.", "新建日历": "New calendar", "按年": "Years", "按月": "Months", "按周": "Weeks", "按天": "Days", "{0} 个日子": "{0} days", "{0} 个日子 · 下一个「{1}」还有 {2} 天": "{0} days · “{1}” in {2} days", "{0} 个日子 · 今天是「{1}」": "{0} days · today is “{1}”", "{0} 个月": "{0} mo", "{0} 周年": "{0}-year anniversary", "{0} 天": "{0} d", "{0} 的小纸条": "A note from {0}", "上个月": "Previous month", "下个月": "Next month", "下一个里程碑": "Next milestone", "下一次": "Next", "不重复": "Once", "不高亮": "No highlight", "个月": "months", "今天": "Today", "从相册选择": "Choose a photo", "保存": "Save", "保存 / 分享": "Save / Share", "倒数精确到时、分、秒": "Count down to the second", "先写一个名称": "Add a name first", "全部": "All", "关闭": "Close", "其他设备同步后也会删除。": "It will also be removed from your other devices.", "写一张": "Write", "写一张小纸条": "New note", "出行": "Travel", "分": "min", "分享图片": "Share image", "分类": "Category", "切换镜头": "Switch camera", "列表": "List", "删除": "Delete", "删除「{0}」？": "Delete “{0}”? ", "删除「{0}」？小纸条和相册会一起删除，其他设备同步后也会删除。": "Delete “{0}”? Its notes and photos will be deleted too, on all your devices.", "删除分类": "Delete category", "删除分类「{0}」？里面的日子不会删除，会移到「未分类」。": "Delete category “{0}”? Its days stay and move to Uncategorized.", "删除照片": "Delete photo", "删除这个日历": "Delete this calendar", "删除这个日子": "Delete this day", "删除这张小纸条？": "Delete this note?", "删除这张照片？其他设备同步后也会删除。": "Delete this photo? It will also be removed from your other devices.", "即将到来": "Coming up", "又": "and", "可以允许使用相机后再试，或者从相册选一张照片当背景。": "Allow camera access and try again, or use a photo as the background.", "名称": "Name", "名称和颜色": "Name and color", "周": "weeks", "图标": "Icon", "图片已下载": "Image downloaded", "图片生成失败": "Couldn’t create the image", "圆体": "Rounded", "夜": "Night", "天": "days", "字": "A", "存进相册": "Add to album", "学习 · 工作": "Study & work", "宠物": "Pets", "小纸条": "Notes", "小纸条已贴上": "Note added", "就是今天": "It’s today", "尺寸": "Size", "已保存": "Saved", "已删除": "Deleted", "已删除「{0}」": "Deleted “{0}”", "已取消置顶": "Unpinned", "已添加 {0} 张照片": "Added {0} photo(s)", "已添加 {0} 张照片（连接 GitHub 后可在其他设备看到）": "Added {0} photo(s) (connect GitHub to see them on other devices)", "已添加「{0}」": "Added “{0}”", "已经": "It’s been", "已经过去": "Past", "已置顶": "Pinned", "已置顶，会显示在最上面和小组件里": "Pinned to the top and to widgets", "已高亮": "Highlighted", "年": "years", "我": "Me", "或输入一个表情": "or type an emoji", "把这一天的照片放在一起。照片会同步到你自己的 GitHub（单独的私密 Gist）。": "Keep this day’s photos together. They sync to your own GitHub, in a separate secret Gist.", "拍摄": "Take photo", "拖动卡片调整位置，双指缩放大小": "Drag the card to move it, pinch to resize", "放在最上面，也显示在小组件里": "Shown at the top and in widgets", "数字字体": "Number font", "新分类": "New category", "新建": "Create", "新建分类": "New category", "新建纪念日历": "New days calendar", "新建记录日历": "New tracking calendar", "新的日子": "New day", "日历": "Calendar", "日期": "Date", "日期在未来：倒数还有多少天。": "Date in the future: counts down the days left.", "日期在过去：累计已经过了多少天。": "Date in the past: counts the days since.", "时": "h", "时间": "Time", "显示单位": "Show in", "显示成「第 N 天」，比如在一起第 100 天": "Show as “Day N”, e.g. Day 100 together", "更多": "More", "月": "Months", "未分类": "Uncategorized", "未来": "Future", "查看照片": "View photo", "样式": "Style", "正在添加 {0} 张照片…": "Adding {0} photo(s)…", "每周": "Weekly", "每年": "Yearly", "每月": "Monthly", "每次过去后自动倒数到下一次。": "After each one passes, it counts down to the next.", "比如：去巴黎旅行、在一起、考研": "e.g. Paris trip, Together, Final exam", "比如：我们、生日、考试": "e.g. Us, Birthdays, Exams", "比如：生活、纪念日、考试、旅行": "e.g. Life, Anniversaries, Exams, Travel", "没有保存": "Not saved", "没法打开相机": "Camera unavailable", "浅色": "Light", "深色": "Dark", "添加": "Add", "添加照片": "Add photos", "湖蓝": "Lake", "点右下角 ＋ 记下第一个重要的日子：未来的倒数，过去的累计。": "Tap ＋ to add your first day: future days count down, past days count up.", "照片": "Photo", "照片读取失败": "Couldn’t read the photo", "爱好": "Hobbies", "玫瑰": "Rose", "玻璃": "Glass", "琥珀": "Amber", "生成分享图片": "Make share image", "生日、纪念日这类每年都有的日子：一直倒数到下一次。": "For birthdays and anniversaries: always counts down to the next one.", "用名称的第一个字": "Use the first letter of the name", "用它做分享图片": "Use for share image", "留白": "Blank", "目标日": "Target date", "相册": "Album", "相机还没准备好": "Camera isn’t ready yet", "石墨": "Graphite", "秒": "s", "第": "Day", "第 {0} 天": "Day {0}", "等宽": "Mono", "精确时间": "Exact time", "素白": "Plain", "紫藤": "Wisteria", "纪念": "Moments", "纪念日历": "Days calendars", "纪念日历记录重要的日子：未来的倒数，过去的累计。每个日子可以写小纸条、建相册、生成分享图片。": "A days calendar keeps your important days: future ones count down, past ones count up. Each day can have notes, an album and share images.", "纸条": "Note", "编辑": "Edit", "编辑小纸条": "Edit note", "编辑日子": "Edit day", "编辑纪念日历": "Edit days calendar", "置顶": "Pin", "背景照片": "Background photo", "色块": "Color", "节律": "Cadence", "节日": "Holidays", "莓果": "Berry", "衬线": "Serif", "记下这一天的期待、心情，或者那天发生的小事。": "Write down what you’re looking forward to, how you feel, or what happened that day.", "记录重要的日子": "Keep your important days", "请填写名称": "Please enter a name", "起始于": "Since", "起始日": "Start date", "起始日算第 1 天": "Count the start date as day 1", "过去": "Past", "还有": "Coming up in", "还有 {0} 天": "in {0} days", "还没有小纸条，先在详情里写一张吧。": "No notes yet. Write one from the day’s details.", "还没有日子": "No days yet", "这一天没有标记的日子": "Nothing marked on this date", "这个分类还没有日子": "No days in this category yet", "这是第 {0} 次": "Occurrence {0}", "这里还没有未来的日子": "No upcoming days here", "这里还没有过去的日子": "No past days here", "选择照片": "Choose a photo", "透明": "Clear", "透明相机": "Camera", "那天就是这一天": "written on the day itself", "那天已经 {0} 天": "written on day {0}", "那天是第 {0} 天": "written on day {0}", "那天还有 {0} 天": "written {0} days before", "里程碑": "Milestone", "里面的 {0} 个日子、小纸条和相册会一起删除，": "Its {0} days, notes and photos will be deleted too. ", "重命名": "Rename", "重命名分类": "Rename category", "重复": "Repeat", "重拍": "Retake", "青绿": "Teal", "青草": "Grass", "高亮": "Highlight", "默认": "Default", "（无标题）": "(Untitled)", "取消": "Cancel", "完成": "Done", "贴上": "Add", "选择日历": "Choose calendar", "今天想对这个日子说点什么？": "What do you want to say about this day?", "纪念日": "Days", "还没有日子，打开节律添加": "No days yet. Open Cadence to add one.", "纪念日小组件": "Days widget", "置顶或最近的日子，以及接下来的几个": "Your pinned or next day, plus a few more", "iOS 纪念日小组件": "iOS days widget", "复制 Scriptable 脚本": "Copy Scriptable script", "已复制纪念日小组件脚本": "Days widget script copied", "脚本还在加载，请稍后再点一次": "The script is still loading. Tap again in a moment.", "请先连接 GitHub 并完成一次同步": "Connect GitHub and sync once first", "安卓纪念日小组件": "Android days widget", "复制小组件链接": "Copy widget link", "已复制纪念日小组件链接": "Days widget link copied", "{0} 天前": "{0} days ago", "{0}的小纸条": "A note from {0}", "万圣节": "Halloween", "上一年": "Previous year", "下一年": "Next year", "中秋": "Mid-Autumn", "从手机相册选择": "Choose from your photos", "会裁成封面铺满顶部": "Fills the top of the page", "入职": "New job", "其他": "Other", "养花": "Plants", "删除细分": "Delete subcategory", "删除细分「{0}」？里面的日子不会删除。": "Delete subcategory “{0}”? Its days stay.", "回家": "Going home", "圣诞": "Christmas", "在「{0}」里加一个细分": "Add a subcategory to {0}", "宝宝": "Baby", "家人": "Family", "小宠": "Small pets", "已添加「{0}」，可以给它设一张主题图片": "Added “{0}”. You can give it a cover photo.", "开学": "New term", "恋爱": "Love", "情人节": "Valentine’s Day", "截止日": "Deadline", "收起": "Show less", "新年": "New Year", "旅行": "Trip", "春节": "Lunar New Year", "更多表情": "More emoji", "更换主题图片": "Change cover", "朋友": "Friends", "比如：去巴黎旅行、回家": "e.g. Paris trip", "比如：在一起、结婚纪念日": "e.g. Together, Wedding anniversary", "比如：小橘到家": "e.g. Mochi came home", "比如：搬家": "e.g. Moving day", "比如：春节、圣诞节": "e.g. Christmas", "比如：期末考试、毕业": "e.g. Final exam, Graduation", "比如：演唱会、马拉松": "e.g. Concert, Marathon", "比如：纪念日、周年、考研": "e.g. Anniversary", "比赛": "Competition", "毕业": "Graduation", "海边": "Beach", "游戏": "Games", "演唱会": "Concert", "爬山": "Hiking", "狗狗": "Dog", "猫咪": "Cat", "生日": "Birthday", "生活 · 爱好": "Life & hobbies", "电影": "Movies", "疫苗": "Vaccine", "移除主题图片": "Remove cover", "类别": "Category", "纯色": "Solid color", "细分": "Subcategory", "结婚": "Wedding", "美食": "Food", "考试": "Exam", "自定义": "Custom", "自驾": "Road trip", "设置主题图片": "Set cover", "运动": "Sport", "这一年的日子": "Days this year", "这一年还没有标记的日子": "Nothing marked this year", "这个日子的相册": "This day’s album", "重命名细分": "Rename subcategory", "露营": "Camping", "主题图片": "Cover", "今天是": "Today is", "更多图标": "More icons", "选了细分会自动换成对应的图标": "Picking a subcategory sets its icon", "选了类别会自动换成对应的图标": "Picking a category sets its icon", "选填": "optional", "返回": "Back", "总览": "Overview", "今年还会到来": "Still to come this year", "今天没有纪念日 · 离「{0}」还有 {1} 天": "Nothing today · {1} days until {0}", "今天没有纪念日": "Nothing today", "接下来": "Coming up", "快到的里程碑": "Milestones ahead", "回忆": "Memories", "{0} 张小纸条 · {1} 张照片": "{0} notes · {1} photos", "在日子的主页里写小纸条、放照片，这里会显示最近的一张。": "Write notes and add photos on a day’s page; the latest note shows here."},
    fr: {"小号显示置顶（没有置顶就是最近的）日子；中号和大号再列出接下来的几个。在 App 里置顶的日子会显示在这里。": "Le petit format montre le jour épinglé (ou le prochain) ; moyen et grand listent aussi les suivants. Épinglez un jour dans l’app pour l’afficher ici.", "复制纪念日小组件脚本": "Copier le script du widget", "长按小组件 → 编辑小组件 → Script 选「纪念日」。": "Maintenez le widget → Modifier le widget → Script : « Jours ».", "回到桌面长按 → 编辑 → 添加小组件 → Scriptable → 选小号、中号或大号。": "Sur l’écran d’accueil, maintenez → Modifier → Ajouter un widget → Scriptable → choisissez petit, moyen ou grand.", "打开 Scriptable → 右上角 ＋ → 粘贴 → 把标题改成「纪念日」→ Done。": "Ouvrez Scriptable → ＋ en haut à droite → collez → renommez-le « Jours » → Done.", "点下方「复制纪念日小组件脚本」。": "Touchez « Copier le script du widget » ci-dessous.", "先在「账户与同步」连接 GitHub，并同步成功一次。": "Connectez d’abord GitHub dans Compte et synchronisation, puis synchronisez une fois.", "新建日历": "Nouveau calendrier", "按年": "Années", "按月": "Mois", "按周": "Semaines", "按天": "Jours", "{0} 个日子": "{0} jours", "{0} 个日子 · 下一个「{1}」还有 {2} 天": "{0} jours · « {1} » dans {2} jours", "{0} 个日子 · 今天是「{1}」": "{0} jours · aujourd’hui : « {1} »", "{0} 个月": "{0} mois", "{0} 周年": "{0} an(s)", "{0} 天": "{0} j", "{0} 的小纸条": "Un mot de {0}", "上个月": "Mois précédent", "下个月": "Mois suivant", "下一个里程碑": "Prochaine étape", "下一次": "Prochaine fois", "不重复": "Une fois", "不高亮": "Sans surlignage", "个月": "mois", "今天": "Aujourd’hui", "从相册选择": "Choisir une photo", "保存": "Enregistrer", "保存 / 分享": "Enregistrer / Partager", "倒数精确到时、分、秒": "Compte à rebours à la seconde", "先写一个名称": "Ajoutez d’abord un nom", "全部": "Tous", "关闭": "Fermer", "其他设备同步后也会删除。": "Il sera aussi supprimé sur vos autres appareils.", "写一张": "Écrire", "写一张小纸条": "Nouveau mot", "出行": "Voyages", "分": "min", "分享图片": "Image à partager", "分类": "Catégorie", "切换镜头": "Changer de caméra", "列表": "Liste", "删除": "Supprimer", "删除「{0}」？": "Supprimer « {0} » ? ", "删除「{0}」？小纸条和相册会一起删除，其他设备同步后也会删除。": "Supprimer « {0} » ? Ses mots et photos seront aussi supprimés, sur tous vos appareils.", "删除分类": "Supprimer la catégorie", "删除分类「{0}」？里面的日子不会删除，会移到「未分类」。": "Supprimer la catégorie « {0} » ? Ses jours restent, dans « Sans catégorie ».", "删除照片": "Supprimer la photo", "删除这个日历": "Supprimer ce calendrier", "删除这个日子": "Supprimer ce jour", "删除这张小纸条？": "Supprimer ce mot ?", "删除这张照片？其他设备同步后也会删除。": "Supprimer cette photo ? Elle sera aussi supprimée sur vos autres appareils.", "即将到来": "À venir", "又": "et", "可以允许使用相机后再试，或者从相册选一张照片当背景。": "Autorisez la caméra et réessayez, ou utilisez une photo en arrière-plan.", "名称": "Nom", "名称和颜色": "Nom et couleur", "周": "semaines", "图标": "Icône", "图片已下载": "Image téléchargée", "图片生成失败": "Impossible de créer l’image", "圆体": "Arrondie", "夜": "Nuit", "天": "jours", "字": "A", "存进相册": "Ajouter à l’album", "学习 · 工作": "Études et travail", "宠物": "Animaux", "小纸条": "Mots", "小纸条已贴上": "Mot ajouté", "就是今天": "C’est aujourd’hui", "尺寸": "Format", "已保存": "Enregistré", "已删除": "Supprimé", "已删除「{0}」": "« {0} » supprimé", "已取消置顶": "Désépinglé", "已添加 {0} 张照片": "{0} photo(s) ajoutée(s)", "已添加 {0} 张照片（连接 GitHub 后可在其他设备看到）": "{0} photo(s) ajoutée(s) (connectez GitHub pour les voir sur vos autres appareils)", "已添加「{0}」": "« {0} » ajouté", "已经": "Depuis", "已经过去": "Passés", "已置顶": "Épinglé", "已置顶，会显示在最上面和小组件里": "Épinglé en haut et dans les widgets", "已高亮": "Surligné", "年": "ans", "我": "Moi", "或输入一个表情": "ou tapez un emoji", "把这一天的照片放在一起。照片会同步到你自己的 GitHub（单独的私密 Gist）。": "Gardez les photos de ce jour ensemble. Elles se synchronisent sur votre GitHub, dans un Gist secret à part.", "拍摄": "Prendre la photo", "拖动卡片调整位置，双指缩放大小": "Faites glisser la carte, pincez pour la redimensionner", "放在最上面，也显示在小组件里": "Affiché en haut et dans les widgets", "数字字体": "Police des chiffres", "新分类": "Nouvelle catégorie", "新建": "Créer", "新建分类": "Nouvelle catégorie", "新建纪念日历": "Nouveau calendrier de jours", "新建记录日历": "Nouveau calendrier de suivi", "新的日子": "Nouveau jour", "日历": "Calendrier", "日期": "Date", "日期在未来：倒数还有多少天。": "Date future : compte à rebours des jours restants.", "日期在过去：累计已经过了多少天。": "Date passée : compte les jours écoulés.", "时": "h", "时间": "Heure", "显示单位": "Afficher en", "显示成「第 N 天」，比如在一起第 100 天": "Afficher « Jour N », p. ex. jour 100 ensemble", "更多": "Plus", "月": "Mois", "未分类": "Sans catégorie", "未来": "À venir", "查看照片": "Voir la photo", "样式": "Style", "正在添加 {0} 张照片…": "Ajout de {0} photo(s)…", "每周": "Chaque semaine", "每年": "Chaque année", "每月": "Chaque mois", "每次过去后自动倒数到下一次。": "Après chaque occurrence, le compte repart vers la suivante.", "比如：去巴黎旅行、在一起、考研": "p. ex. Voyage à Paris, Ensemble, Examen", "比如：我们、生日、考试": "p. ex. Nous, Anniversaires, Examens", "比如：生活、纪念日、考试、旅行": "p. ex. Vie, Anniversaires, Examens, Voyages", "没有保存": "Non enregistré", "没法打开相机": "Caméra indisponible", "浅色": "Clair", "深色": "Sombre", "添加": "Ajouter", "添加照片": "Ajouter des photos", "湖蓝": "Lac", "点右下角 ＋ 记下第一个重要的日子：未来的倒数，过去的累计。": "Touchez ＋ pour ajouter un premier jour : les jours à venir se décomptent, les jours passés se comptent.", "照片": "Photo", "照片读取失败": "Impossible de lire la photo", "爱好": "Loisirs", "玫瑰": "Rose", "玻璃": "Verre", "琥珀": "Ambre", "生成分享图片": "Créer une image", "生日、纪念日这类每年都有的日子：一直倒数到下一次。": "Pour anniversaires et fêtes : compte toujours jusqu’au prochain.", "用名称的第一个字": "Utiliser la première lettre du nom", "用它做分享图片": "Utiliser pour l’image", "留白": "Épuré", "目标日": "Date cible", "相册": "Album", "相机还没准备好": "La caméra n’est pas prête", "石墨": "Graphite", "秒": "s", "第": "Jour", "第 {0} 天": "Jour {0}", "等宽": "Mono", "精确时间": "Heure précise", "素白": "Uni", "紫藤": "Glycine", "纪念": "Moments", "纪念日历": "Calendriers de jours", "纪念日历记录重要的日子：未来的倒数，过去的累计。每个日子可以写小纸条、建相册、生成分享图片。": "Un calendrier de jours garde vos dates importantes : les futures se décomptent, les passées se comptent. Chaque jour peut avoir des mots, un album et des images.", "纸条": "Mot", "编辑": "Modifier", "编辑小纸条": "Modifier le mot", "编辑日子": "Modifier le jour", "编辑纪念日历": "Modifier le calendrier", "置顶": "Épingler", "背景照片": "Photo de fond", "色块": "Couleur", "节律": "Cadence", "节日": "Fêtes", "莓果": "Baie", "衬线": "Serif", "记下这一天的期待、心情，或者那天发生的小事。": "Notez vos attentes, votre humeur, ou ce qui s’est passé ce jour-là.", "记录重要的日子": "Vos dates importantes", "请填写名称": "Indiquez un nom", "起始于": "Depuis le", "起始日": "Date de début", "起始日算第 1 天": "Compter le premier jour comme jour 1", "过去": "Passés", "还有": "Dans", "还有 {0} 天": "dans {0} jours", "还没有小纸条，先在详情里写一张吧。": "Pas encore de mot. Écrivez-en un dans les détails du jour.", "还没有日子": "Aucun jour", "这一天没有标记的日子": "Rien de marqué à cette date", "这个分类还没有日子": "Aucun jour dans cette catégorie", "这是第 {0} 次": "Occurrence {0}", "这里还没有未来的日子": "Aucun jour à venir ici", "这里还没有过去的日子": "Aucun jour passé ici", "选择照片": "Choisir une photo", "透明": "Transparent", "透明相机": "Caméra", "那天就是这一天": "écrit le jour même", "那天已经 {0} 天": "écrit au jour {0}", "那天是第 {0} 天": "écrit au jour {0}", "那天还有 {0} 天": "écrit {0} jours avant", "里程碑": "Étape", "里面的 {0} 个日子、小纸条和相册会一起删除，": "Ses {0} jours, mots et photos seront aussi supprimés. ", "重命名": "Renommer", "重命名分类": "Renommer la catégorie", "重复": "Répéter", "重拍": "Reprendre", "青绿": "Sarcelle", "青草": "Herbe", "高亮": "Surligner", "默认": "Par défaut", "（无标题）": "(Sans titre)", "取消": "Annuler", "完成": "Terminé", "贴上": "Ajouter", "选择日历": "Choisir un calendrier", "今天想对这个日子说点什么？": "Que voulez-vous dire sur ce jour ?", "纪念日": "Jours", "还没有日子，打开节律添加": "Aucun jour. Ouvrez Cadence pour en ajouter.", "纪念日小组件": "Widget des jours", "置顶或最近的日子，以及接下来的几个": "Votre jour épinglé ou le prochain, et quelques autres", "iOS 纪念日小组件": "Widget iOS des jours", "复制 Scriptable 脚本": "Copier le script Scriptable", "已复制纪念日小组件脚本": "Script du widget copié", "脚本还在加载，请稍后再点一次": "Le script se charge encore. Touchez à nouveau dans un instant.", "请先连接 GitHub 并完成一次同步": "Connectez GitHub et synchronisez une fois d’abord", "安卓纪念日小组件": "Widget Android des jours", "复制小组件链接": "Copier le lien du widget", "已复制纪念日小组件链接": "Lien du widget copié", "{0} 天前": "il y a {0} jours", "{0}的小纸条": "Un mot de {0}", "万圣节": "Halloween", "上一年": "Année précédente", "下一年": "Année suivante", "中秋": "Mi-automne", "从手机相册选择": "Choisir dans vos photos", "会裁成封面铺满顶部": "Remplit le haut de la page", "入职": "Nouveau poste", "其他": "Autre", "养花": "Plantes", "删除细分": "Supprimer la sous-catégorie", "删除细分「{0}」？里面的日子不会删除。": "Supprimer la sous-catégorie « {0} » ? Ses jours restent.", "回家": "Retour à la maison", "圣诞": "Noël", "在「{0}」里加一个细分": "Ajouter une sous-catégorie à {0}", "宝宝": "Bébé", "家人": "Famille", "小宠": "Petits animaux", "已添加「{0}」，可以给它设一张主题图片": "« {0} » ajouté. Vous pouvez lui donner une photo de couverture.", "开学": "Rentrée", "恋爱": "Amour", "情人节": "Saint-Valentin", "截止日": "Échéance", "收起": "Moins", "新年": "Nouvel An", "旅行": "Voyage", "春节": "Nouvel An lunaire", "更多表情": "Plus d’emoji", "更换主题图片": "Changer la couverture", "朋友": "Amis", "比如：去巴黎旅行、回家": "p. ex. Voyage à Paris", "比如：在一起、结婚纪念日": "p. ex. Ensemble, Anniversaire de mariage", "比如：小橘到家": "p. ex. Arrivée de Mochi", "比如：搬家": "p. ex. Déménagement", "比如：春节、圣诞节": "p. ex. Noël", "比如：期末考试、毕业": "p. ex. Examen final, Diplôme", "比如：演唱会、马拉松": "p. ex. Concert, Marathon", "比如：纪念日、周年、考研": "p. ex. Anniversaire", "比赛": "Compétition", "毕业": "Diplôme", "海边": "Plage", "游戏": "Jeux", "演唱会": "Concert", "爬山": "Randonnée", "狗狗": "Chien", "猫咪": "Chat", "生日": "Anniversaire", "生活 · 爱好": "Vie et loisirs", "电影": "Cinéma", "疫苗": "Vaccin", "移除主题图片": "Retirer la couverture", "类别": "Catégorie", "纯色": "Couleur unie", "细分": "Sous-catégorie", "结婚": "Mariage", "美食": "Gastronomie", "考试": "Examen", "自定义": "Personnaliser", "自驾": "Road trip", "设置主题图片": "Ajouter une couverture", "运动": "Sport", "这一年的日子": "Jours de cette année", "这一年还没有标记的日子": "Rien de marqué cette année", "这个日子的相册": "Album de ce jour", "重命名细分": "Renommer la sous-catégorie", "露营": "Camping", "主题图片": "Couverture", "今天是": "Aujourd’hui :", "更多图标": "Plus d’icônes", "选了细分会自动换成对应的图标": "Choisir une sous-catégorie change l’icône", "选了类别会自动换成对应的图标": "Choisir une catégorie change l’icône", "选填": "facultatif", "返回": "Retour", "总览": "Aperçu", "今年还会到来": "À venir cette année", "今天没有纪念日 · 离「{0}」还有 {1} 天": "Rien aujourd’hui · {0} dans {1} jours", "今天没有纪念日": "Rien aujourd’hui", "接下来": "À venir", "快到的里程碑": "Étapes à venir", "回忆": "Souvenirs", "{0} 张小纸条 · {1} 张照片": "{0} mots · {1} photos", "在日子的主页里写小纸条、放照片，这里会显示最近的一张。": "Écrivez des mots et ajoutez des photos sur la page d’un jour ; le plus récent s’affiche ici."},
    'zh-Hant': {"小号显示置顶（没有置顶就是最近的）日子；中号和大号再列出接下来的几个。在 App 里置顶的日子会显示在这里。": "小號顯示置頂（沒有置頂就是最近的）日子；中號和大號再列出接下來的幾個。在 App 裡置頂的日子會顯示在這裡。", "复制纪念日小组件脚本": "複製紀念日小元件指令碼", "长按小组件 → 编辑小组件 → Script 选「纪念日」。": "長按小元件 → 編輯小元件 → Script 選「紀念日」。", "回到桌面长按 → 编辑 → 添加小组件 → Scriptable → 选小号、中号或大号。": "回到桌面長按 → 編輯 → 新增小元件 → Scriptable → 選小號、中號或大號。", "打开 Scriptable → 右上角 ＋ → 粘贴 → 把标题改成「纪念日」→ Done。": "開啟 Scriptable → 右上角 ＋ → 貼上 → 把標題改成「紀念日」→ Done。", "点下方「复制纪念日小组件脚本」。": "點下方「複製紀念日小元件指令碼」。", "先在「账户与同步」连接 GitHub，并同步成功一次。": "先在「賬戶與同步」連線 GitHub，並同步成功一次。", "新建日历": "新建日曆", "{0} 个日子": "{0} 個日子", "{0} 个日子 · 下一个「{1}」还有 {2} 天": "{0} 個日子 · 下一個「{1}」還有 {2} 天", "{0} 个日子 · 今天是「{1}」": "{0} 個日子 · 今天是「{1}」", "{0} 个月": "{0} 個月", "{0} 周年": "{0} 週年", "{0} 的小纸条": "{0} 的小紙條", "上个月": "上個月", "下个月": "下個月", "下一个里程碑": "下一個里程碑", "不重复": "不重複", "个月": "個月", "从相册选择": "從相簿選擇", "保存": "儲存", "保存 / 分享": "儲存 / 分享", "倒数精确到时、分、秒": "倒數精確到時、分、秒", "先写一个名称": "先寫一個名稱", "关闭": "關閉", "其他设备同步后也会删除。": "其他裝置同步後也會刪除。", "写一张": "寫一張", "写一张小纸条": "寫一張小紙條", "分享图片": "分享圖片", "分类": "分類", "切换镜头": "切換鏡頭", "删除": "刪除", "删除「{0}」？": "刪除「{0}」？", "删除「{0}」？小纸条和相册会一起删除，其他设备同步后也会删除。": "刪除「{0}」？小紙條和相簿會一起刪除，其他裝置同步後也會刪除。", "删除分类": "刪除分類", "删除分类「{0}」？里面的日子不会删除，会移到「未分类」。": "刪除分類「{0}」？裡面的日子不會刪除，會移到「未分類」。", "删除照片": "刪除照片", "删除这个日历": "刪除這個日曆", "删除这个日子": "刪除這個日子", "删除这张小纸条？": "刪除這張小紙條？", "删除这张照片？其他设备同步后也会删除。": "刪除這張照片？其他裝置同步後也會刪除。", "即将到来": "即將到來", "可以允许使用相机后再试，或者从相册选一张照片当背景。": "可以允許使用相機後再試，或者從相簿選一張照片當背景。", "名称": "名稱", "名称和颜色": "名稱和顏色", "图标": "圖示", "图片已下载": "圖片已下載", "图片生成失败": "圖片生成失敗", "圆体": "圓體", "存进相册": "存進相簿", "学习 · 工作": "學習 · 工作", "宠物": "寵物", "小纸条": "小紙條", "小纸条已贴上": "小紙條已貼上", "已保存": "已儲存", "已删除": "已刪除", "已删除「{0}」": "已刪除「{0}」", "已取消置顶": "已取消置頂", "已添加 {0} 张照片": "已新增 {0} 張照片", "已添加 {0} 张照片（连接 GitHub 后可在其他设备看到）": "已新增 {0} 張照片（連線 GitHub 後可在其他裝置看到）", "已添加「{0}」": "已新增「{0}」", "已经": "已經", "已经过去": "已經過去", "已置顶": "已置頂", "已置顶，会显示在最上面和小组件里": "已置頂，會顯示在最上面和小元件裡", "或输入一个表情": "或輸入一個表情", "把这一天的照片放在一起。照片会同步到你自己的 GitHub（单独的私密 Gist）。": "把這一天的照片放在一起。照片會同步到你自己的 GitHub（單獨的私密 Gist）。", "拍摄": "拍攝", "拖动卡片调整位置，双指缩放大小": "拖動卡片調整位置，雙指縮放大小", "放在最上面，也显示在小组件里": "放在最上面，也顯示在小元件裡", "数字字体": "數字字型", "新分类": "新分類", "新建分类": "新建分類", "新建纪念日历": "新建紀念日曆", "新建记录日历": "新建記錄日曆", "日历": "日曆", "日期在未来：倒数还有多少天。": "日期在未來：倒數還有多少天。", "日期在过去：累计已经过了多少天。": "日期在過去：累計已經過了多少天。", "时": "時", "时间": "時間", "显示单位": "顯示單位", "显示成「第 N 天」，比如在一起第 100 天": "顯示成「第 N 天」，比如在一起第 100 天", "未分类": "未分類", "未来": "未來", "查看照片": "檢視照片", "样式": "樣式", "正在添加 {0} 张照片…": "正在新增 {0} 張照片…", "每周": "每週", "每次过去后自动倒数到下一次。": "每次過去後自動倒數到下一次。", "比如：我们、生日、考试": "比如：我們、生日、考試", "比如：生活、纪念日、考试、旅行": "比如：生活、紀念日、考試、旅行", "没有保存": "沒有儲存", "没法打开相机": "沒法開啟相機", "浅色": "淺色", "添加": "新增", "添加照片": "新增照片", "湖蓝": "湖藍", "点右下角 ＋ 记下第一个重要的日子：未来的倒数，过去的累计。": "點右下角 ＋ 記下第一個重要的日子：未來的倒數，過去的累計。", "照片读取失败": "照片讀取失敗", "爱好": "愛好", "生成分享图片": "生成分享圖片", "生日、纪念日这类每年都有的日子：一直倒数到下一次。": "生日、紀念日這類每年都有的日子：一直倒數到下一次。", "用名称的第一个字": "用名稱的第一個字", "用它做分享图片": "用它做分享圖片", "目标日": "目標日", "相册": "相簿", "相机还没准备好": "相機還沒準備好", "等宽": "等寬", "精确时间": "精確時間", "纪念": "紀念", "纪念日历": "紀念日曆", "纪念日历记录重要的日子：未来的倒数，过去的累计。每个日子可以写小纸条、建相册、生成分享图片。": "紀念日曆記錄重要的日子：未來的倒數，過去的累計。每個日子可以寫小紙條、建相簿、生成分享圖片。", "纸条": "紙條", "编辑": "編輯", "编辑小纸条": "編輯小紙條", "编辑日子": "編輯日子", "编辑纪念日历": "編輯紀念日曆", "置顶": "置頂", "色块": "色塊", "节律": "節律", "节日": "節日", "衬线": "襯線", "记下这一天的期待、心情，或者那天发生的小事。": "記下這一天的期待、心情，或者那天發生的小事。", "记录重要的日子": "記錄重要的日子", "请填写名称": "請填寫名稱", "起始于": "起始於", "过去": "過去", "还有": "還有", "还有 {0} 天": "還有 {0} 天", "还没有小纸条，先在详情里写一张吧。": "還沒有小紙條，先在詳情裡寫一張吧。", "还没有日子": "還沒有日子", "这一天没有标记的日子": "這一天沒有標記的日子", "这个分类还没有日子": "這個分類還沒有日子", "这是第 {0} 次": "這是第 {0} 次", "这里还没有未来的日子": "這裡還沒有未來的日子", "这里还没有过去的日子": "這裡還沒有過去的日子", "选择照片": "選擇照片", "透明相机": "透明相機", "那天就是这一天": "那天就是這一天", "那天已经 {0} 天": "那天已經 {0} 天", "那天还有 {0} 天": "那天還有 {0} 天", "里面的 {0} 个日子、小纸条和相册会一起删除，": "裡面的 {0} 個日子、小紙條和相簿會一起刪除，", "重命名": "重新命名", "重命名分类": "重新命名分類", "重复": "重複", "青绿": "青綠", "默认": "預設", "（无标题）": "（無標題）", "贴上": "貼上", "选择日历": "選擇日曆", "今天想对这个日子说点什么？": "今天想對這個日子說點什麼？", "纪念日": "紀念日", "还没有日子，打开节律添加": "還沒有日子，開啟節律新增", "纪念日小组件": "紀念日小元件", "置顶或最近的日子，以及接下来的几个": "置頂或最近的日子，以及接下來的幾個", "iOS 纪念日小组件": "iOS 紀念日小元件", "复制 Scriptable 脚本": "複製 Scriptable 指令碼", "已复制纪念日小组件脚本": "已複製紀念日小元件指令碼", "脚本还在加载，请稍后再点一次": "指令碼還在載入，請稍後再點一次", "请先连接 GitHub 并完成一次同步": "請先連線 GitHub 並完成一次同步", "安卓纪念日小组件": "安卓紀念日小元件", "复制小组件链接": "複製小元件連結", "已复制纪念日小组件链接": "已複製紀念日小元件連結", "{0}的小纸条": "{0}的小紙條", "万圣节": "萬聖節", "从手机相册选择": "從手機相簿選擇", "会裁成封面铺满顶部": "會裁成封面鋪滿頂部", "入职": "入職", "养花": "養花", "删除细分": "刪除細分", "删除细分「{0}」？里面的日子不会删除。": "刪除細分「{0}」？裡面的日子不會刪除。", "圣诞": "聖誕", "在「{0}」里加一个细分": "在「{0}」里加一個細分", "宝宝": "寶寶", "小宠": "小寵", "已添加「{0}」，可以给它设一张主题图片": "已新增「{0}」，可以給它設一張主題圖片", "开学": "開學", "恋爱": "戀愛", "情人节": "情人節", "春节": "春節", "更换主题图片": "更換主題圖片", "比如：在一起、结婚纪念日": "比如：在一起、結婚紀念日", "比如：春节、圣诞节": "比如：春節、聖誕節", "比如：期末考试、毕业": "比如：期末考試、畢業", "比如：演唱会、马拉松": "比如：演唱會、馬拉松", "比如：纪念日、周年、考研": "比如：紀念日、週年、考研", "比赛": "比賽", "毕业": "畢業", "海边": "海邊", "游戏": "遊戲", "演唱会": "演唱會", "猫咪": "貓咪", "生活 · 爱好": "生活 · 愛好", "电影": "電影", "移除主题图片": "移除主題圖片", "类别": "類別", "纯色": "純色", "细分": "細分", "结婚": "結婚", "考试": "考試", "自定义": "自定義", "自驾": "自駕", "设置主题图片": "設定主題圖片", "运动": "運動", "这一年的日子": "這一年的日子", "这一年还没有标记的日子": "這一年還沒有標記的日子", "这个日子的相册": "這個日子的相簿", "重命名细分": "重新命名細分", "露营": "露營", "主题图片": "主題圖片", "更多图标": "更多圖示", "选了细分会自动换成对应的图标": "選了細分會自動換成對應的圖示", "选了类别会自动换成对应的图标": "選了類別會自動換成對應的圖示", "选填": "選填", "周": "週", "返回": "返回", "总览": "總覽", "今年还会到来": "今年還會到來", "今天没有纪念日 · 离「{0}」还有 {1} 天": "今天沒有紀念日 · 離「{0}」還有 {1} 天", "今天没有纪念日": "今天沒有紀念日", "接下来": "接下來", "回忆": "回憶", "{0} 张小纸条 · {1} 张照片": "{0} 張小紙條 · {1} 張照片", "在日子的主页里写小纸条、放照片，这里会显示最近的一张。": "在日子的主頁裡寫小紙條、放照片，這裡會顯示最近的一張。"},
    ja: {"小号显示置顶（没有置顶就是最近的）日子；中号和大号再列出接下来的几个。在 App 里置顶的日子会显示在这里。": "小サイズはピン留めした日（なければ次の日）を表示し、中・大サイズはその後の日も一覧表示します。アプリでピン留めした日がここに表示されます。", "复制纪念日小组件脚本": "記念日ウィジェットのスクリプトをコピー", "长按小组件 → 编辑小组件 → Script 选「纪念日」。": "ウィジェットを長押し → ウィジェットを編集 → Script で「記念日」を選択。", "回到桌面长按 → 编辑 → 添加小组件 → Scriptable → 选小号、中号或大号。": "ホーム画面で長押し → 編集 → ウィジェットを追加 → Scriptable → 小・中・大を選択。", "打开 Scriptable → 右上角 ＋ → 粘贴 → 把标题改成「纪念日」→ Done。": "Scriptable を開く → 右上の ＋ → 貼り付け → タイトルを「記念日」に変更 → Done。", "点下方「复制纪念日小组件脚本」。": "下の「記念日ウィジェットのスクリプトをコピー」をタップ。", "先在「账户与同步」连接 GitHub，并同步成功一次。": "まず「同期」で GitHub に接続し、一度同期を完了してください。", "新建日历": "新しいカレンダー", "按年": "年", "按月": "月", "按周": "週", "按天": "日", "{0} 个日子": "{0} 件の記念日", "{0} 个日子 · 下一个「{1}」还有 {2} 天": "{0} 件 · 次の「{1}」まであと {2} 日", "{0} 个日子 · 今天是「{1}」": "{0} 件 · 今日は「{1}」", "{0} 个月": "{0} か月", "{0} 周年": "{0} 周年", "{0} 天": "{0} 日", "{0} 的小纸条": "{0} のメモ", "上个月": "前の月", "下个月": "次の月", "下一个里程碑": "次の節目", "下一次": "次回", "不重复": "繰り返さない", "不高亮": "ハイライトなし", "个月": "か月", "今天": "今日", "从相册选择": "写真から選ぶ", "保存": "保存", "保存 / 分享": "保存 / 共有", "倒数精确到时、分、秒": "時・分・秒までカウントダウン", "先写一个名称": "先に名前を入力してください", "全部": "すべて", "关闭": "閉じる", "其他设备同步后也会删除。": "同期後はほかのデバイスからも削除されます。", "写一张": "書く", "写一张小纸条": "メモを書く", "出行": "お出かけ", "分": "分", "分享图片": "画像で共有", "分类": "カテゴリ", "切换镜头": "カメラを切り替え", "列表": "リスト", "删除": "削除", "删除「{0}」？": "「{0}」を削除しますか？", "删除「{0}」？小纸条和相册会一起删除，其他设备同步后也会删除。": "「{0}」を削除しますか？メモとアルバムも削除され、同期後はほかのデバイスからも削除されます。", "删除分类": "カテゴリを削除", "删除分类「{0}」？里面的日子不会删除，会移到「未分类」。": "カテゴリ「{0}」を削除しますか？記念日は削除されず「未分類」に移ります。", "删除照片": "写真を削除", "删除这个日历": "このカレンダーを削除", "删除这个日子": "この記念日を削除", "删除这张小纸条？": "このメモを削除しますか？", "删除这张照片？其他设备同步后也会删除。": "この写真を削除しますか？同期後はほかのデバイスからも削除されます。", "即将到来": "これから", "又": "と", "可以允许使用相机后再试，或者从相册选一张照片当背景。": "カメラへのアクセスを許可してもう一度試すか、写真を背景にしてください。", "名称": "名前", "名称和颜色": "名前と色", "周": "週", "图标": "アイコン", "图片已下载": "画像をダウンロードしました", "图片生成失败": "画像を作成できませんでした", "圆体": "丸ゴシック", "夜": "夜", "天": "日", "字": "字", "存进相册": "アルバムに保存", "学习 · 工作": "学業 · 仕事", "宠物": "ペット", "小纸条": "メモ", "小纸条已贴上": "メモを追加しました", "就是今天": "今日です", "尺寸": "サイズ", "已保存": "保存しました", "已删除": "削除しました", "已删除「{0}」": "「{0}」を削除しました", "已取消置顶": "ピン留めを外しました", "已添加 {0} 张照片": "写真を {0} 枚追加しました", "已添加 {0} 张照片（连接 GitHub 后可在其他设备看到）": "写真を {0} 枚追加しました（GitHub に接続するとほかのデバイスでも見られます）", "已添加「{0}」": "「{0}」を追加しました", "已经": "経過", "已经过去": "過ぎた日", "已置顶": "ピン留め中", "已置顶，会显示在最上面和小组件里": "ピン留めしました。いちばん上とウィジェットに表示されます", "已高亮": "ハイライト中", "年": "年", "我": "自分", "或输入一个表情": "または絵文字を入力", "把这一天的照片放在一起。照片会同步到你自己的 GitHub（单独的私密 Gist）。": "この日の写真をまとめておけます。写真はあなたの GitHub（別の非公開 Gist）に同期されます。", "拍摄": "撮影", "拖动卡片调整位置，双指缩放大小": "カードをドラッグして移動、ピンチでサイズ変更", "放在最上面，也显示在小组件里": "いちばん上に表示し、ウィジェットにも表示", "数字字体": "数字のフォント", "新分类": "新しいカテゴリ", "新建": "作成", "新建分类": "新しいカテゴリ", "新建纪念日历": "新しい記念日カレンダー", "新建记录日历": "新しい記録カレンダー", "新的日子": "新しい記念日", "日历": "カレンダー", "日期": "日付", "日期在未来：倒数还有多少天。": "未来の日付：残りの日数をカウントダウンします。", "日期在过去：累计已经过了多少天。": "過去の日付：経過した日数を数えます。", "时": "時", "时间": "時刻", "显示单位": "表示単位", "显示成「第 N 天」，比如在一起第 100 天": "「N 日目」と表示（例：付き合って 100 日目）", "更多": "その他", "月": "月", "未分类": "未分類", "未来": "未来", "查看照片": "写真を見る", "样式": "スタイル", "正在添加 {0} 张照片…": "写真を {0} 枚追加中…", "每周": "毎週", "每年": "毎年", "每月": "毎月", "每次过去后自动倒数到下一次。": "過ぎるたびに次の日へ自動でカウントダウンします。", "比如：去巴黎旅行、在一起、考研": "例：パリ旅行、付き合った日、試験", "比如：我们、生日、考试": "例：ふたり、誕生日、試験", "比如：生活、纪念日、考试、旅行": "例：生活、記念日、試験、旅行", "没有保存": "保存されていません", "没法打开相机": "カメラを起動できません", "浅色": "ライト", "深色": "ダーク", "添加": "追加", "添加照片": "写真を追加", "湖蓝": "湖", "点右下角 ＋ 记下第一个重要的日子：未来的倒数，过去的累计。": "右下の ＋ で最初の大切な日を追加しましょう。未来の日はカウントダウン、過去の日は経過日数を数えます。", "照片": "写真", "照片读取失败": "写真を読み込めませんでした", "爱好": "趣味", "玫瑰": "ローズ", "玻璃": "ガラス", "琥珀": "アンバー", "生成分享图片": "共有画像を作成", "生日、纪念日这类每年都有的日子：一直倒数到下一次。": "誕生日や記念日など毎年ある日：いつも次の日までカウントダウンします。", "用名称的第一个字": "名前の最初の文字を使う", "用它做分享图片": "共有画像に使う", "留白": "余白", "目标日": "目標日", "相册": "アルバム", "相机还没准备好": "カメラの準備ができていません", "石墨": "グラファイト", "秒": "秒", "第": "", "第 {0} 天": "{0} 日目", "等宽": "等幅", "精确时间": "正確な時刻", "素白": "シンプル", "紫藤": "藤", "纪念": "記念", "纪念日历": "記念日カレンダー", "纪念日历记录重要的日子：未来的倒数，过去的累计。每个日子可以写小纸条、建相册、生成分享图片。": "記念日カレンダーは大切な日を記録します。未来の日はカウントダウン、過去の日は経過日数を数えます。日ごとにメモやアルバム、共有画像を作れます。", "纸条": "メモ", "编辑": "編集", "编辑小纸条": "メモを編集", "编辑日子": "記念日を編集", "编辑纪念日历": "記念日カレンダーを編集", "置顶": "ピン留め", "背景照片": "背景の写真", "色块": "カラー", "节律": "Cadence", "节日": "行事", "莓果": "ベリー", "衬线": "明朝", "记下这一天的期待、心情，或者那天发生的小事。": "この日への期待や気持ち、その日の出来事を書き留めましょう。", "记录重要的日子": "大切な日を記録", "请填写名称": "名前を入力してください", "起始于": "開始日", "起始日": "開始日", "起始日算第 1 天": "開始日を 1 日目として数える", "过去": "過去", "还有": "あと", "还有 {0} 天": "あと {0} 日", "还没有小纸条，先在详情里写一张吧。": "まだメモがありません。記念日の詳細から書いてみましょう。", "还没有日子": "まだ記念日がありません", "这一天没有标记的日子": "この日には記念日がありません", "这个分类还没有日子": "このカテゴリにはまだ記念日がありません", "这是第 {0} 次": "{0} 回目", "这里还没有未来的日子": "これからの記念日はまだありません", "这里还没有过去的日子": "過ぎた記念日はまだありません", "选择照片": "写真を選ぶ", "透明": "透明", "透明相机": "透明カメラ", "那天就是这一天": "当日に書いたメモ", "那天已经 {0} 天": "{0} 日目に書いたメモ", "那天是第 {0} 天": "{0} 日目に書いたメモ", "那天还有 {0} 天": "{0} 日前に書いたメモ", "里程碑": "節目", "里面的 {0} 个日子、小纸条和相册会一起删除，": "中の {0} 件の記念日・メモ・アルバムも削除され、", "重命名": "名前を変更", "重命名分类": "カテゴリ名を変更", "重复": "繰り返し", "重拍": "撮り直す", "青绿": "ティール", "青草": "グリーン", "高亮": "ハイライト", "默认": "標準", "（无标题）": "（タイトルなし）", "取消": "キャンセル", "完成": "完了", "贴上": "追加", "选择日历": "カレンダーを選択", "今天想对这个日子说点什么？": "今日はこの日に何を伝えたいですか？", "纪念日": "記念日", "还没有日子，打开节律添加": "まだ記念日がありません。Cadence を開いて追加してください", "纪念日小组件": "記念日ウィジェット", "置顶或最近的日子，以及接下来的几个": "ピン留めした日か次の日と、その後の記念日", "iOS 纪念日小组件": "iOS 記念日ウィジェット", "复制 Scriptable 脚本": "Scriptable のスクリプトをコピー", "已复制纪念日小组件脚本": "記念日ウィジェットのスクリプトをコピーしました", "脚本还在加载，请稍后再点一次": "スクリプトを読み込み中です。少ししてからもう一度タップしてください", "请先连接 GitHub 并完成一次同步": "先に GitHub に接続して一度同期してください", "安卓纪念日小组件": "Android 記念日ウィジェット", "复制小组件链接": "ウィジェットのリンクをコピー", "已复制纪念日小组件链接": "記念日ウィジェットのリンクをコピーしました", "{0} 天前": "{0} 日前", "{0}的小纸条": "{0}のメモ", "万圣节": "ハロウィン", "上一年": "前の年", "下一年": "次の年", "中秋": "中秋", "从手机相册选择": "写真ライブラリから選ぶ", "会裁成封面铺满顶部": "上部いっぱいのカバーになります", "入职": "入社", "其他": "その他", "养花": "ガーデニング", "删除细分": "サブカテゴリを削除", "删除细分「{0}」？里面的日子不会删除。": "サブカテゴリ「{0}」を削除しますか？記念日は削除されません。", "回家": "帰省", "圣诞": "クリスマス", "在「{0}」里加一个细分": "「{0}」にサブカテゴリを追加", "宝宝": "赤ちゃん", "家人": "家族", "小宠": "小動物", "已添加「{0}」，可以给它设一张主题图片": "「{0}」を追加しました。カバー写真を設定できます", "开学": "新学期", "恋爱": "恋愛", "情人节": "バレンタイン", "截止日": "締め切り", "收起": "閉じる", "新年": "お正月", "旅行": "旅行", "春节": "春節", "更多表情": "その他の絵文字", "更换主题图片": "カバーを変更", "朋友": "友達", "比如：去巴黎旅行、回家": "例：パリ旅行、帰省", "比如：在一起、结婚纪念日": "例：付き合った日、結婚記念日", "比如：小橘到家": "例：ミケがうちに来た日", "比如：搬家": "例：引っ越し", "比如：春节、圣诞节": "例：お正月、クリスマス", "比如：期末考试、毕业": "例：期末試験、卒業", "比如：演唱会、马拉松": "例：コンサート、マラソン", "比如：纪念日、周年、考研": "例：記念日、周年、受験", "比赛": "大会", "毕业": "卒業", "海边": "海", "游戏": "ゲーム", "演唱会": "コンサート", "爬山": "登山", "狗狗": "犬", "猫咪": "猫", "生日": "誕生日", "生活 · 爱好": "生活 · 趣味", "电影": "映画", "疫苗": "ワクチン", "移除主题图片": "カバーを削除", "类别": "カテゴリ", "纯色": "単色", "细分": "サブカテゴリ", "结婚": "結婚", "美食": "グルメ", "考试": "試験", "自定义": "カスタム", "自驾": "ドライブ", "设置主题图片": "カバーを設定", "运动": "スポーツ", "这一年的日子": "今年の記念日", "这一年还没有标记的日子": "今年の記念日はまだありません", "这个日子的相册": "この日のアルバム", "重命名细分": "サブカテゴリ名を変更", "露营": "キャンプ", "主题图片": "カバー", "今天是": "今日で", "更多图标": "その他のアイコン", "选了细分会自动换成对应的图标": "サブカテゴリを選ぶとアイコンも切り替わります", "选了类别会自动换成对应的图标": "カテゴリを選ぶとアイコンも切り替わります", "选填": "任意", "返回": "戻る", "总览": "概要", "今年还会到来": "今年これから", "今天没有纪念日 · 离「{0}」还有 {1} 天": "今日は記念日なし · {0}まであと {1} 日", "今天没有纪念日": "今日は記念日なし", "接下来": "これから", "快到的里程碑": "もうすぐの節目", "回忆": "思い出", "{0} 张小纸条 · {1} 张照片": "メモ {0} 件 · 写真 {1} 枚", "在日子的主页里写小纸条、放照片，这里会显示最近的一张。": "記念日のページでメモや写真を追加すると、最新のメモがここに表示されます。"} };
  const T = (Days.T = s => { const d = DICT[LANG]; return d && d[s] != null ? d[s] : s; });
  const F = (s, ...a) => T(s).replace(/\{(\d)\}/g, (m, n) => (a[n] !== undefined ? a[n] : m));
  const TT = s => (MC.t ? MC.t(s) : s);     // 画在图片里的文字（繁体也要转）
  const FT = (s, ...a) => TT(F(s, ...a));

  // ---------- 日期 ----------
  const DAY = 864e5;
  const t0 = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const utcDays = d => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY;
  const diffDays = (a, b) => Math.round(utcDays(b) - utcDays(a));
  const clampDate = (y, m, d) => new Date(y, m, Math.min(d, new Date(y, m + 1, 0).getDate()));
  const inMonth = (y, m) => new Date(y, m + 1, 0).getDate();
  // a ≤ b：相差几年几个月几天
  function ymdDiff(a, b) {
    let y = b.getFullYear() - a.getFullYear(), m = b.getMonth() - a.getMonth(), d = b.getDate() - a.getDate();
    if (d < 0) { m--; d += inMonth(b.getFullYear(), b.getMonth() - 1); }
    if (m < 0) { y--; m += 12; }
    return { y, m, d };
  }
  // 重复的日子：从 from 起的下一次
  function occurrence(x, from) {
    const b = parse(x.date);
    if (!x.rep || b >= from) return b;
    if (x.rep === 'week') return MC.addDays(b, Math.ceil(diffDays(b, from) / 7) * 7);
    if (x.rep === 'month') {
      let d = clampDate(from.getFullYear(), from.getMonth(), b.getDate());
      if (d < from) d = clampDate(from.getFullYear(), from.getMonth() + 1, b.getDate());
      return d;
    }
    let d = clampDate(from.getFullYear(), b.getMonth(), b.getDate());
    if (d < from) d = clampDate(from.getFullYear() + 1, b.getMonth(), b.getDate());
    return d;
  }
  // 这一天是不是这个日子（日历里标记用）
  function hits(x, d) {
    const b = parse(x.date);
    if (!x.rep) return diffDays(b, d) === 0;
    if (d < b) return false;
    if (x.rep === 'week') return diffDays(b, d) % 7 === 0;
    if (x.rep === 'month') return clampDate(d.getFullYear(), d.getMonth(), b.getDate()).getDate() === d.getDate();
    return d.getMonth() === b.getMonth() && clampDate(d.getFullYear(), b.getMonth(), b.getDate()).getDate() === d.getDate();
  }
  const withTime = (d, time) => { const r = new Date(d); if (time) { const [h, m] = time.split(':').map(Number); r.setHours(h, m, 0, 0); } return r; };

  // 一个日子现在的状态
  function info(x, now = new Date()) {
    const today = t0(now), base = parse(x.date), occ = occurrence(x, today);
    const diff = diffDays(today, occ);
    const state = diff > 0 ? 'fut' : diff === 0 ? 'today' : 'past';
    const at = withTime(occ, x.time);
    let nth = 0;
    if (x.rep === 'year') nth = occ.getFullYear() - base.getFullYear();
    else if (x.rep === 'month') nth = (occ.getFullYear() - base.getFullYear()) * 12 + occ.getMonth() - base.getMonth();
    else if (x.rep === 'week') nth = Math.round(diffDays(base, occ) / 7);
    // 进度：距离上一次（或添加那天）走了多少
    let prog = null;
    if (state === 'fut') {
      let from = new Date(x.createdAt || Date.now());
      if (x.rep) {
        const prev = x.rep === 'week' ? MC.addDays(occ, -7) : x.rep === 'month' ? clampDate(occ.getFullYear(), occ.getMonth() - 1, base.getDate()) : clampDate(occ.getFullYear() - 1, base.getMonth(), base.getDate());
        if (prev >= base) from = prev;
      }
      const span = at - from;
      prog = span > 0 ? Math.max(0, Math.min(1, (now - from) / span)) : null;
    }
    return { state, diff, occ, at, base, nth, prog };
  }
  Days.info = info;

  // 显示的数字：天 / 周 / 月 / 年
  function amount(x, inf, unit = x.unit) {
    if (inf.state === 'today') return { num: TT(T('今天')), unit: '', rest: '', today: true };
    const past = inf.state === 'past';
    const n = Math.abs(inf.diff) + (past && x.from1 ? 1 : 0);
    const a = past ? inf.occ : t0(), b = past ? t0() : inf.occ;
    const dd = ymdDiff(a, b);
    if (unit === 'w' && n >= 7) return { num: Math.floor(n / 7), unit: T('周'), rest: n % 7 ? F('{0} 天', n % 7) : '' };
    if (unit === 'm' && dd.y * 12 + dd.m >= 1) return { num: dd.y * 12 + dd.m, unit: T('个月'), rest: dd.d ? F('{0} 天', dd.d) : '' };
    if (unit === 'y' && dd.y >= 1) return { num: dd.y, unit: T('年'), rest: [dd.m ? F('{0} 个月', dd.m) : '', dd.d ? F('{0} 天', dd.d) : ''].filter(Boolean).join(' ') };
    return { num: n, unit: past && x.from1 ? (LANG === 'ja' ? '日目' : /^zh/.test(LANG) ? T('天') : '') : T('天'), rest: '' };
  }
  const stateWord = (x, inf) => inf.state === 'today' ? T('就是今天') : inf.state === 'fut' ? T('还有') : x.from1 ? T('第') : T('已经');
  const repLabel = r => ({ week: T('每周'), month: T('每月'), year: T('每年') })[r] || '';
  const DATE_FMT = new Intl.DateTimeFormat(MC.locale ? MC.locale() : 'zh-CN', { year: 'numeric', month: 'short', day: 'numeric', weekday: 'short' });
  const DATE_FMT_S = new Intl.DateTimeFormat(MC.locale ? MC.locale() : 'zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric' });
  const fmtDate = d => DATE_FMT.format(d);
  const fmtTime = s => (MC.fmtTime ? MC.fmtTime(s) : s);
  const fmtDateTime = (d, time) => fmtDate(d) + (time ? ' ' + fmtTime(time) : '');
  // 精确时间：差多少天、时、分、秒
  function clock(x, inf, now = new Date()) {
    let ms = inf.at - now;
    const fut = ms > 0;
    if (!fut && inf.state !== 'past' && !x.time) ms = 0; // 今天的全天日子
    ms = Math.abs(ms);
    const s = Math.floor(ms / 1000);
    return { fut, d: Math.floor(s / 86400), h: Math.floor(s / 3600) % 24, m: Math.floor(s / 60) % 60, s: s % 60 };
  }
  // 过去的日子：下一个里程碑（每 100 天 / 每满一年）
  function milestone(x, inf) {
    if (inf.state !== 'past' || x.rep) return null;
    const n = -inf.diff + (x.from1 ? 1 : 0);
    const next100 = (Math.floor(n / 100) + 1) * 100;
    const d100 = MC.addDays(inf.occ, next100 - (x.from1 ? 1 : 0));
    const yrs = ymdDiff(inf.occ, t0()).y + 1;
    const dy = clampDate(inf.occ.getFullYear() + yrs, inf.occ.getMonth(), inf.occ.getDate());
    return dy < d100 ? { label: F('{0} 周年', yrs), date: dy, left: diffDays(t0(), dy) } : { label: F('第 {0} 天', next100), date: d100, left: diffDays(t0(), d100) };
  }
  // 日历里要标出的里程碑
  function milestonesIn(x, y, m) {
    if (x.rep) return [];
    const b = parse(x.date), out = [], first = new Date(y, m, 1), last = new Date(y, m + 1, 0);
    if (last < b) return out;
    const off = x.from1 ? 1 : 0;
    for (let k = Math.max(1, Math.ceil((diffDays(b, first) + off) / 100)); ; k++) {
      const d = MC.addDays(b, k * 100 - off);
      if (d > last) break;
      if (d >= first) out.push({ d, label: F('第 {0} 天', k * 100) });
    }
    const yrs = y - b.getFullYear();
    if (yrs >= 1 && b.getMonth() === m) out.push({ d: clampDate(y, m, b.getDate()), label: F('{0} 周年', yrs) });
    return out;
  }

  // ---------- 颜色 ----------
  const dark = () => document.documentElement.dataset.theme === 'dark';
  const TONES = { fut: ['#4776B4', '#8EB0E6'], today: ['#4776B4', '#8EB0E6'], past: ['#B6733B', '#E2A673'] };
  const toneHex = st => TONES[st][dark() ? 1 : 0];
  // 高亮颜色（和记录日历同一套配色里挑 8 个）
  const HL = [
    { c: '#B76271', n: '玫瑰' }, { c: '#B06F35', n: '琥珀' }, { c: '#539156', n: '青草' }, { c: '#009390', n: '青绿' },
    { c: '#4086BD', n: '湖蓝' }, { c: '#8074BD', n: '紫藤' }, { c: '#AE648F', n: '莓果' }, { c: '#656970', n: '石墨' },
  ];
  const hlTone = c => (dark() ? MC.darkTone(c)[0] : c);
  const hlInk = c => (dark() ? MC.darkTone(c)[1] : '#fff');

  // ---------- 图标：一套简约的双色线条图标（线条 + 很淡的填充），颜色跟着大类走 ----------
  const C = (x, y, r) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
  const R = (x, y, w, h, r) => `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}z`;
  const ICONS = {
    heart: ['M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z'],
    ring: [C(12, 14.5, 5.5), 'M9.2 3.8h5.6L12 8z'],
    cake: ['M5 20h14v-6.5a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2z', 'M5 15.5c1.2 1 2.3 1 3.5 0s2.3-1 3.5 0 2.3 1 3.5 0 2.3-1 3.5 0', 'M12 11.5V8.5', 'M12 6.2c.9-.7.9-1.6 0-2.7-.9 1.1-.9 2 0 2.7z'],
    gift: [R(4, 9, 16, 4.2, 1.2), 'M5.5 13.2V20h13v-6.8', 'M12 9v11', 'M12 9c-1.2-3-4.6-3.6-4.6-1.5C7.4 9 10 9 12 9zM12 9c1.2-3 4.6-3.6 4.6-1.5C16.6 9 14 9 12 9z'],
    people: [C(9, 8.5, 3), 'M3.5 19c.5-3 2.8-5 5.5-5s5 2 5.5 5', C(16.5, 9, 2.4), 'M16.2 13.8c2.4 0 4 1.7 4.4 4.4'],
    smile: [C(12, 12, 8.2), 'M8.8 14.2c1.8 1.9 4.6 1.9 6.4 0', C(9.3, 10, .55), C(14.7, 10, .55)],
    home: ['M4.5 11L12 4.5l7.5 6.5', 'M6.5 9.5v10h11v-10', 'M10 19.5v-5h4v5'],
    star: ['M12 4l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4-3.9-3.8 5.4-.8z'],
    plane: ['M10.4 13.6L4 11.2l1.6-1.6 6.9 1 4.1-4.1c.9-.9 2.4-1.2 2.9-.7s.2 2-.7 2.9l-4.1 4.1 1 6.9-1.6 1.6-2.4-6.4-3 3 .3 2.3-1.2 1.2-1.6-3-3-1.6 1.2-1.2 2.3.3z'],
    train: [R(6, 3.5, 12, 13.5, 3.2), 'M6 10.5h12', 'M9 20.5l1.5-3.5M15 20.5l-1.5-3.5', C(9, 13.8, .6), C(15, 13.8, .6)],
    car: ['M5.2 14.5l1.5-4.6A2 2 0 0 1 8.6 8.5h6.8a2 2 0 0 1 1.9 1.4l1.5 4.6', R(4, 14.5, 16, 4.5, 1.6), 'M6.5 19v1.5M17.5 19v1.5', C(7.6, 16.8, .5), C(16.4, 16.8, .5)],
    bag: [R(4, 7.5, 16, 12, 2.5), 'M9 7.5V5.8a1.3 1.3 0 0 1 1.3-1.3h3.4A1.3 1.3 0 0 1 15 5.8v1.7', 'M8.5 7.5v12M15.5 7.5v12'],
    mountain: ['M3.5 19l6-9 4 6 2.4-3.4L20.5 19z', 'M7.9 12.4l1.6 1.2 1.6-1.3'],
    sea: [C(16.5, 7.5, 2.5), 'M3.5 15c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5', 'M3.5 19c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5'],
    pin: ['M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z', C(12, 10, 2.3)],
    cap: ['M3 9.5L12 5l9 4.5-9 4.5z', 'M7 11.6v3.9c1.5 1.4 3 2 5 2s3.5-.6 5-2v-3.9', 'M21 9.5v5'],
    book: ['M5 5.5A1.5 1.5 0 0 1 6.5 4H19v14H6.5A1.5 1.5 0 0 0 5 19.5z', 'M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3'],
    paper: [R(5, 3.5, 14, 17, 2.2), 'M8.5 8h7M8.5 12h7M8.5 16h4'],
    case: [R(3.5, 7.5, 17, 12, 2.5), 'M9 7.5V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v1.5', 'M3.5 12.5h17'],
    clock: [C(12, 12, 8.2), 'M12 7.5V12l3 2'],
    flag: ['M6 21V4h11l-2.2 4.2L17 12.5H6'],
    music: ['M9 17.5V6l10-2v11.5', C(6.5, 17.5, 2.5), C(16.5, 15.5, 2.5)],
    mic: [R(9, 3.5, 6, 10.5, 3), 'M6 11a6 6 0 0 0 12 0', 'M12 17v3.5'],
    film: [R(3.5, 5.5, 17, 13, 2.5), 'M3.5 9.5h17M8 5.5l-1.5 4M13 5.5l-1.5 4M18 5.5l-1.5 4'],
    game: ['M7 8.5h10a4 4 0 0 1 3.9 4.8l-.7 3.4a2 2 0 0 1-3.4 1l-2.3-2.2H9.5l-2.3 2.2a2 2 0 0 1-3.4-1l-.7-3.4A4 4 0 0 1 7 8.5z', 'M8 11v3M6.5 12.5h3', C(15.5, 11.6, .55), C(17, 13.2, .55)],
    camera: ['M4 8.5a2 2 0 0 1 2-2h2l1.5-2h5l1.5 2h2a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z', C(12, 13, 3.4)],
    gym: ['M6.5 8v8M17.5 8v8M4 10v4M20 10v4M6.5 12h11'],
    plant: ['M12 20v-8', 'M12 12c0-4 3-6.5 7-6.5 0 4-3 6.5-7 6.5z', 'M12 14c0-3-2.5-5-5.5-5 0 3 2.5 5 5.5 5z', 'M8 20h8'],
    coffee: ['M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z', 'M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16', 'M8.5 3.5v2.5M11.5 3.5v2.5'],
    paw: [C(6.6, 11.2, 1.6), C(9.4, 7.3, 1.6), C(14.6, 7.3, 1.6), C(17.4, 11.2, 1.6), 'M12 12.5c2.6 0 5 2.8 5 5 0 1.6-1.3 2.3-2.6 2-1-.3-1.6-.6-2.4-.6s-1.4.3-2.4.6C8.3 19.8 7 19.1 7 17.5c0-2.2 2.4-5 5-5z'],
    cat: ['M5 9.2L5.6 4l4 3.2h4.8L18.4 4l.6 5.2c.6 1.1 1 2.4 1 3.8 0 4.2-3.6 7-8 7s-8-2.8-8-7c0-1.4.4-2.7 1-3.8z', C(9.4, 13, .6), C(14.6, 13, .6), 'M11.2 15.6h1.6L12 16.5z'],
    dog: ['M8.6 5.6L5 7.4l1 5', 'M15.4 5.6l3.6 1.8-1 5', 'M7 10c0-2.3 2.2-4.5 5-4.5s5 2.2 5 4.5v3.5c0 3.5-2.2 6-5 6s-5-2.5-5-6z', C(10, 12, .6), C(14, 12, .6), 'M11 15.4h2l-1 1.1z'],
    lantern: ['M12 3v2', 'M8.5 5h7', 'M7.5 7.5c0-1.4 2-2.5 4.5-2.5s4.5 1.1 4.5 2.5v7c0 1.4-2 2.5-4.5 2.5s-4.5-1.1-4.5-2.5z', 'M10 5.3c-.8 3-.8 8.4 0 11.4M14 5.3c.8 3 .8 8.4 0 11.4', 'M12 17v3.5'],
    tree: ['M12 3.5l5 6h-2.5l4 5h-3l3.5 4.5h-14l3.5-4.5h-3l4-5H7z', 'M12 19v2'],
    moon: ['M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z'],
    spark: ['M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6'],
    tent: ['M3.5 19.5L12 5l8.5 14.5z', 'M12 5v14.5', 'M9.6 19.5L12 15l2.4 4.5'],
    trophy: ['M7.5 4.5h9V9a4.5 4.5 0 0 1-9 0z', 'M7.5 6.5H5.2a2.6 2.6 0 0 0 2.6 3.6M16.5 6.5h2.3a2.6 2.6 0 0 1-2.6 3.6', 'M12 13.5V17', 'M8.7 20.5h6.6l-.8-3.5H9.5z'],
    calendar: [R(4, 5, 16, 15.5, 3.5), 'M4 10h16M8.5 3v4M15.5 3v4', 'M8.5 14.5h3'],
    syringe: ['M14.8 6.2l3 3-8.3 8.3H6.5v-3z', 'M17.2 3.8l3 3M15.7 5.3l3 3', 'M6.5 17.5L4 20', 'M10.5 10.5l1.3 1.3M8.7 12.3l1.3 1.3'],
    pumpkin: ['M12 7.2c-4.6 0-7.5 2.6-7.5 6.4S7.4 20 12 20s7.5-2.6 7.5-6.4-2.9-6.4-7.5-6.4z', 'M12 7.2c-1.9 1.9-1.9 10.9 0 12.8M12 7.2c1.9 1.9 1.9 10.9 0 12.8', 'M12 7.2c0-1.6.7-2.8 2.2-3.4'],
    stroller: ['M4.5 10h15a7.5 7.5 0 0 1-15 0z', 'M12 10V3.6A6.4 6.4 0 0 1 18.4 10', C(8, 20.2, 1.4), C(16, 20.2, 1.4), 'M2.8 7.2h1.6l.9 2.8'],
  };
  // 每个图标第几段路径加淡淡的填充（-1 不填）
  const DUO = { heart: 0, ring: 0, cake: 0, gift: 0, people: 0, smile: 0, home: -1, star: 0, plane: 0, train: 0, car: 1, bag: 0, mountain: 0, sea: 0, pin: 0, cap: 0, book: 0, paper: 0,
    case: 0, clock: 0, flag: 0, music: 1, mic: 0, film: 0, game: 0, camera: 0, gym: -1, plant: 1, coffee: 0, paw: 4, cat: 0, dog: 2, lantern: 2, tree: 0, moon: 0, spark: -1,
    tent: 0, trophy: 0, calendar: 0, syringe: 0, pumpkin: 0, stroller: 0 };
  // 分类：先选大类，再选细分（细分自带图标；每个大类下还可以加自己的细分）。每个大类一种颜色
  const CATS = [
    { k: 'love', n: '纪念', c: '#E26A82', i: 'heart', subs: [['love', '恋爱', 'heart'], ['wed', '结婚', 'ring'], ['bday', '生日', 'cake'], ['baby', '宝宝', 'stroller'], ['family', '家人', 'home'], ['friend', '朋友', 'people']] },
    { k: 'trip', n: '出行', c: '#3A87D6', i: 'plane', subs: [['travel', '旅行', 'plane'], ['home', '回家', 'train'], ['drive', '自驾', 'car'], ['camp', '露营', 'tent'], ['beach', '海边', 'sea'], ['hike', '爬山', 'mountain']] },
    { k: 'study', n: '学习 · 工作', c: '#6C68D4', i: 'cap', subs: [['exam', '考试', 'paper'], ['grad', '毕业', 'cap'], ['term', '开学', 'book'], ['job', '入职', 'case'], ['due', '截止日', 'calendar'], ['match', '比赛', 'trophy']] },
    { k: 'life', n: '生活 · 爱好', c: '#3C9A6B', i: 'plant', subs: [['show', '演唱会', 'mic'], ['movie', '电影', 'film'], ['sport', '运动', 'gym'], ['game', '游戏', 'game'], ['plant', '养花', 'plant'], ['food', '美食', 'coffee']] },
    { k: 'pet', n: '宠物', c: '#D38B2C', i: 'paw', subs: [['dog', '狗狗', 'dog'], ['cat', '猫咪', 'cat'], ['small', '小宠', 'paw'], ['vax', '疫苗', 'syringe']] },
    { k: 'fest', n: '节日', c: '#DE6448', i: 'spark', subs: [['ny', '新年', 'spark'], ['spring', '春节', 'lantern'], ['moon', '中秋', 'moon'], ['xmas', '圣诞', 'tree'], ['val', '情人节', 'gift'], ['hallo', '万圣节', 'pumpkin']] },
    { k: 'other', n: '其他', c: '#7A8698', i: 'star', subs: [] },
  ];
  const catDef = k => CATS.find(c => c.k === k) || CATS[CATS.length - 1];
  const ICON_GROUPS = [...CATS.filter(c => c.subs.length).map(c => [c.n, [...new Set(c.subs.map(s => s[2]))]]), // 图标按大类分组（只用来选图标）
    ['更多', ['star', 'smile', 'music', 'camera', 'clock', 'flag', 'pin', 'bag', 'gift', 'cake']]];
  // 之前存成表情的，换回对应的图标
  const EMO_ICON = { '❤': 'heart', '💕': 'heart', '💝': 'heart', '💍': 'ring', '🎂': 'cake', '🍰': 'cake', '🎁': 'gift', '💐': 'plant', '🌹': 'gift', '🥂': 'people', '👫': 'people', '👶': 'stroller', '🏡': 'home', '🏠': 'home',
    '✈': 'plane', '🚄': 'train', '🚗': 'car', '🧳': 'bag', '🏔': 'mountain', '🏖': 'sea', '🗼': 'pin', '🗺': 'pin', '📍': 'pin', '⛺': 'tent', '🎡': 'star', '⭐': 'star',
    '🎓': 'cap', '📚': 'book', '📝': 'paper', '🔬': 'paper', '💼': 'case', '💻': 'case', '🏆': 'trophy', '📅': 'calendar', '⏰': 'clock', '🚩': 'flag',
    '🎵': 'music', '🎤': 'mic', '🎬': 'film', '🎮': 'game', '📷': 'camera', '🏃': 'gym', '🧘': 'gym', '🏋': 'gym', '🌱': 'plant', '☕': 'coffee',
    '🐶': 'dog', '🐱': 'cat', '🐰': 'paw', '🐹': 'paw', '🐠': 'paw', '🐦': 'paw', '🐾': 'paw', '💉': 'syringe',
    '🎄': 'tree', '🏮': 'lantern', '🧧': 'lantern', '🎆': 'spark', '🎉': 'spark', '🐉': 'spark', '🎃': 'pumpkin', '🌕': 'moon', '😊': 'smile' };
  const iconOf = x => { const v = String(x.icon || ''); return ICONS[v] ? v : EMO_ICON[v.replace(/[\uFE0F\u200D]/g, '')] || ''; };
  const ICON_CAT = {}; CATS.forEach(c => c.subs.forEach(s => (ICON_CAT[s[2]] = ICON_CAT[s[2]] || c.k)));
  // 旧数据没有大类：自定义分类归到「其他」，否则按图标猜
  const catOf = x => (CATS.some(c => c.k === x.cat) ? x.cat : x.book ? 'other' : ICON_CAT[iconOf(x)] || 'other');
  const catColor = x => catDef(catOf(x)).c;
  const emojiOf = x => (iconOf(x) ? '' : x.icon || ''); // 自己输入、没有对应图标的表情
  const svgOf = name => (ICONS[name] ? `<svg viewBox="0 0 24 24" class="duo" aria-hidden="true">${ICONS[name].map((d, i) => `<path d="${d}"${i === DUO[name] ? ' class="f"' : ''}/>`).join('')}</svg>` : '');
  const firstChar = s => (Array.from(String(s || '').trim())[0] || '·');
  // 图块里的内容：图标 / 表情 / 标题第一个字
  function glyph(x) {
    const ic = iconOf(x);
    if (ic) return svgOf(ic);
    if (x.icon) return `<span class="emo" data-uc>${esc(x.icon)}</span>`;
    return `<span class="ini" data-uc>${esc(firstChar(x.title))}</span>`;
  }
  const subKey = x => x.book || ''; // 细分只用自己建的（不再有内置的细分）
  const subName = (x, books = MC.data.books) => {
    if (x.book) { const b = books.find(y => y.id === x.book); return b ? b.name : ''; }
    return '';
  };
  // 主题图片的纯色（清新的浅色调；深色模式在 CSS 里压暗）
  const COVERS = ['#DCE8F7', '#F7E1E6', '#DFF0E4', '#F6EAD8', '#E7E2F6', '#DAEFEF', '#F4EFE2', '#E6E9EE'];
  const UI_IC = {
    list: '<svg viewBox="0 0 24 24"><path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.8" cy="6.5" r=".9"/><circle cx="4.8" cy="12" r=".9"/><circle cx="4.8" cy="17.5" r=".9"/></svg>',
    cal: '<svg viewBox="0 0 24 24"><rect x="3.5" y="4.5" width="17" height="16" rx="4"/><path d="M3.5 9.2h17M8 2.8v3.4M16 2.8v3.4"/></svg>',
    share: '<svg viewBox="0 0 24 24"><path d="M12 15V3.5M7.5 8L12 3.5 16.5 8"/><path d="M5 12.5V18a2.5 2.5 0 0 0 2.5 2.5h9A2.5 2.5 0 0 0 19 18v-5.5"/></svg>',
    cam: '<svg viewBox="0 0 24 24"><path d="M4 8.5a2 2 0 0 1 2-2h2l1.5-2h5l1.5 2h2a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.4"/></svg>',
    hl: '<svg viewBox="0 0 24 24"><path d="M14.5 4.5l5 5-8.8 8.8H5.7v-5z"/><path d="M4 20.5h16"/></svg>',
    pin: '<svg viewBox="0 0 24 24"><path d="M9 3.5h6l-1 5 3.5 3.5v1.5h-11V12L10 8.5z"/><path d="M12 13.5v7"/></svg>',
    note: '<svg viewBox="0 0 24 24"><path d="M6.5 3.5h11a2 2 0 0 1 2 2v9l-6 6h-7a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2z"/><path d="M13.5 20.5v-4a2 2 0 0 1 2-2h4"/></svg>',
    photo: '<svg viewBox="0 0 24 24"><rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 15.5l-4.5-4.5-8.5 8.5"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    more: '<svg viewBox="0 0 24 24" class="filled"><circle cx="6" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="18" cy="12" r="1.7"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    flip: '<svg viewBox="0 0 24 24"><path d="M4.5 9.5A7.5 7.5 0 0 1 18 6.5l1.5 1.5"/><path d="M19.5 4v4h-4"/><path d="M19.5 14.5A7.5 7.5 0 0 1 6 17.5L4.5 16"/><path d="M4.5 20v-4h4"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M14.5 5.5L8 12l6.5 6.5"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4.5 6.5h15M9.5 6.5V4.5h5v2M6.5 6.5l1 13h9l1-13"/></svg>',
    chev: '<svg viewBox="0 0 24 24"><path d="M9 5.5l6.5 6.5L9 18.5"/></svg>',
  };

  // ---------- 照片：本机存在 IndexedDB，同步到单独的私密 Gist ----------
  const PDB = (() => {
    let p = null;
    const db = () => p || (p = new Promise((res, rej) => {
      const r = indexedDB.open('cadence-album', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('p');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    }));
    const tx = async (mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction('p', mode), s = t.objectStore('p'); const q = fn(s); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }); };
    return { get: id => tx('readonly', s => s.get(id)), put: (id, b) => tx('readwrite', s => s.put(b, id)), del: id => tx('readwrite', s => s.delete(id)) };
  })();
  const urls = new Map();
  async function photoURL(id) {
    if (urls.has(id)) return urls.get(id);
    let b = null;
    try { b = await PDB.get(id); } catch (e) {}
    if (!b) { b = await Album.download(id); }
    if (!b) return '';
    const u = URL.createObjectURL(b); urls.set(id, u); return u;
  }
  // 选的照片压缩到长边 1600，避免 Gist 太大
  function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }
  async function compress(file, max = 1600, q = .84) {
    const u = URL.createObjectURL(file);
    try {
      const img = await loadImg(u);
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', q));
      return { blob, w, h };
    } finally { URL.revokeObjectURL(u); }
  }
  const blobToB64 = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(b); });
  const b64ToBlob = async (s, type = 'image/jpeg') => (await fetch(`data:${type};base64,${s.trim()}`)).blob();

  const ALBUM_DESC = '节律 · 纪念日相册（由 App 自动管理，请勿手动修改）';
  const QKEY = 'mcal.album.queue.v1';
  const Album = {
    file: id => `p-${id}.b64`,
    queue() { try { const q = JSON.parse(localStorage.getItem(QKEY)) || {}; return { up: q.up || [], del: q.del || [] }; } catch (e) { return { up: [], del: [] }; } },
    save(q) { localStorage.setItem(QKEY, JSON.stringify(q)); },
    enqueue(kind, id) { const q = this.queue(); if (!q[kind].includes(id)) q[kind].push(id); if (kind === 'del') q.up = q.up.filter(x => x !== id); this.save(q); this.flush(); },
    async ensure() {
      const a = MC.data.album;
      if (a && a.gist) return a;
      if (!MC.session.token) return null;
      let g = null;
      try { const list = await MC.gh('/gists?per_page=100'); g = list.find(x => x.description === ALBUM_DESC) || null; } catch (e) {}
      if (!g) g = await MC.gh('/gists', { method: 'POST', body: JSON.stringify({ description: ALBUM_DESC, public: false, files: { 'README.md': { content: '节律纪念日历的相册照片。每个文件是一张 JPEG（Base64）。' } } }) });
      MC.data.album = { gist: g.id, owner: (g.owner && g.owner.login) || MC.settings.account || '' };
      MC.commit();
      return MC.data.album;
    },
    busy: false,
    async flush() {
      if (this.busy || !MC.session.token || !navigator.onLine) return;
      const q = this.queue(); if (!q.up.length && !q.del.length) return;
      this.busy = true;
      try {
        const a = await this.ensure(); if (!a) return;
        for (const id of [...q.del]) {
          try { await MC.gh('/gists/' + a.gist, { method: 'PATCH', body: JSON.stringify({ files: { [this.file(id)]: null } }) }); } catch (e) { if (!/404|422/.test(e.message)) throw e; }
          const cur = this.queue(); cur.del = cur.del.filter(x => x !== id); this.save(cur);
        }
        for (const id of [...q.up]) {
          const b = await PDB.get(id).catch(() => null);
          if (b) await MC.gh('/gists/' + a.gist, { method: 'PATCH', body: JSON.stringify({ files: { [this.file(id)]: { content: await blobToB64(b) } } }) });
          const cur = this.queue(); cur.up = cur.up.filter(x => x !== id); this.save(cur);
        }
      } catch (e) { /* 下次联网或同步时再传 */ } finally { this.busy = false; }
    },
    loading: new Map(),
    download(id) {
      if (this.loading.has(id)) return this.loading.get(id);
      const p = (async () => {
        const a = MC.data.album; if (!a || !a.gist) return null;
        let text = '';
        try {
          if (a.owner) { const r = await fetch(`https://gist.githubusercontent.com/${a.owner}/${a.gist}/raw/${this.file(id)}`, { cache: 'no-cache' }); if (r.ok) text = await r.text(); }
          if (!text && MC.session.token) { const g = await MC.gh('/gists/' + a.gist); const f = g.files && g.files[this.file(id)]; if (f) text = f.truncated ? await (await fetch(f.raw_url)).text() : f.content; }
        } catch (e) {}
        if (!text) return null;
        const b = await b64ToBlob(text);
        try { await PDB.put(id, b); } catch (e) {}
        return b;
      })();
      this.loading.set(id, p);
      p.finally(() => setTimeout(() => this.loading.delete(id), 30000));
      return p;
    },
  };
  Days.Album = Album;
  window.addEventListener('online', () => Album.flush());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') Album.flush(); });
  setTimeout(() => Album.flush(), 4000);

  async function addPhotos(x, files) {
    const list = [...files].filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|heic|webp|gif)$/i.test(f.name));
    if (!list.length) return;
    UI.toast(F('正在添加 {0} 张照片…', list.length));
    const added = [];
    for (const f of list) {
      try {
        const { blob, w, h } = await compress(f);
        const id = 'p' + MC.uid();
        await PDB.put(id, blob);
        added.push({ id, at: Date.now(), w, h });
      } catch (e) {}
    }
    if (!added.length) { UI.toast(T('照片读取失败')); return; }
    MC.updateDay(x, { photos: [...added, ...x.photos] });
    added.forEach(p => Album.enqueue('up', p.id));
    UI.toast(MC.session.token ? F('已添加 {0} 张照片', added.length) : F('已添加 {0} 张照片（连接 GitHub 后可在其他设备看到）', added.length));
  }
  async function removePhoto(x, id) {
    MC.updateDay(x, { photos: x.photos.filter(p => p.id !== id) });
    try { await PDB.del(id); } catch (e) {}
    if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id); }
    Album.enqueue('del', id);
  }
  // 主题图片：从手机选一张（和相册分开存，不占相册），或者用相册里的照片 / 纯色
  async function dropCover(x) {
    const old = x.cover;
    if (!old || old.startsWith('c:') || x.photos.some(p => p.id === old)) return;
    try { await PDB.del(old); } catch (e) {}
    if (urls.has(old)) { URL.revokeObjectURL(urls.get(old)); urls.delete(old); }
    Album.enqueue('del', old);
  }
  async function setCover(x, value) { await dropCover(x); MC.updateDay(x, { cover: value || '' }); }
  async function setCoverFile(x, file) {
    try {
      const { blob } = await compress(file, 2000, .86);
      const id = 'p' + MC.uid();
      await PDB.put(id, blob);
      await dropCover(x);
      MC.updateDay(x, { cover: id });
      Album.enqueue('up', id);
    } catch (e) { UI.toast(T('照片读取失败')); }
  }
  Days.parts = { T, F, TT, FT, info, amount, stateWord, repLabel, fmtDate, fmtDateTime, clock, milestone, milestonesIn, hits, occurrence, diffDays, t0,
    toneHex, HL, hlTone, hlInk, ICONS, ICON_GROUPS, svgOf, glyph, firstChar, UI_IC, emojiOf, iconOf, catColor, DUO, COVERS, setCover, setCoverFile, CATS, catDef, catOf, subKey, subName, photoURL, addPhotos, removePhoto, PDB, loadImg, DICT, LANG, dark };
})();

/* ---------- 纪念日历视图：列表 / 日历、详情、编辑、小纸条 ---------- */
(() => {
  'use strict';
  const MC = window.MC, UI = MC.UI, $ = UI.$, esc = MC.esc, Days = MC.Days;
  const P = Days.parts;
  const { T, F, info, amount, stateWord, repLabel, fmtDate, fmtDateTime, clock, milestone, milestonesIn, hits, diffDays, t0, toneHex, HL, hlTone, hlInk, ICONS, ICON_GROUPS, svgOf, glyph, UI_IC, CATS, catDef, catOf, subKey, subName } = P;
  const body = document.body;
  const isOn = () => body.dataset.kind === 'days';
  const calId = () => MC.activeCal();
  const daysOf = id => MC.data.days.filter(x => x.cal === id);
  const booksOf = id => MC.data.books.filter(b => b.cal === id);
  const find = id => MC.data.days.find(x => x.id === id);
  const st = { filter: 'all', cat: '', sub: '', cv: MC.settings.daysCalView === 'year' ? 'year' : 'month', ym: null, yy: null, sel: MC.todayStr() };
  // 纪念日历是一套单独的界面：底部菜单只有「日历（年 / 月）· 纪念日 · 设置」
  const view = $('#daysView'), dvBody = $('#dvBody'), listPage = $('#page-days'), dvList = $('#dvList'), sumPage = $('#page-dsum'), dvSum = $('#dvSum');
  const UNIT_SEG = /^zh/.test(P.LANG) ? [['d', '天'], ['w', '周'], ['m', '月'], ['y', '年']] : [['d', '按天'], ['w', '按周'], ['m', '按月'], ['y', '按年']];
  { const b = $('#drawerAdd'); const tn = b && [...b.childNodes].find(n => n.nodeType === 3 && n.nodeValue.trim()); if (tn) tn.nodeValue = ' ' + T('新建日历'); }
  // 面板上写死在 index.html 里的文字
  [['#dayCover [data-close]', '取消'], ['#dayCover h2', '主题图片'], ['#dpEdit', '编辑'], ['#dayEditor [data-close]', '取消'], ['#dayNote [data-close]', '取消'], ['#dnTitle', '写一张小纸条'], ['#dnSave', '贴上'],
    ['#dayShare [data-close]', '完成'], ['#dayShare h2', '分享图片'], ['#dsSave', '保存']].forEach(([s, l]) => { const el = l && $(s); if (el) el.textContent = T(l); });
  $('#dnText').placeholder = T('今天想对这个日子说点什么？');
  [['#dayPage', '纪念日'], ['#dayEditor', '编辑日子'], ['#dayNote', '小纸条'], ['#dayShare', '分享图片'], ['#dayCover', '主题图片'], ['#dayPage [data-pg="back"]', '返回'], ['#dayPage [data-pg="share"]', '分享图片']]
    .forEach(([q, l]) => { const el = $(q); if (el) el.setAttribute('aria-label', T(l)); });
  $('#deHead').textContent = T('新的日子');
  document.querySelectorAll('.dv-title').forEach(b => b.setAttribute('aria-label', T('选择日历')));
  [['days', '纪念日'], ['dsum', '总览']].forEach(([pg, l]) => { const tb = document.querySelector(`#tabbar [data-page="${pg}"]`); if (tb) { tb.setAttribute('aria-label', T(l)); tb.querySelector('span').textContent = T(l); } });
  document.querySelectorAll('.dvSumName').forEach(e => (e.textContent = T('总览')));
  document.querySelectorAll('#dvYM [data-ym]').forEach(b => (b.textContent = T(b.dataset.ym === 'year' ? '年' : '月')));
  const vib = () => { try { navigator.vibrate && navigator.vibrate(6); } catch (e) {} };

  // ---------- 小部件 ----------
  // 颜色都用 CSS 变量，切换深浅色时不用重画：--fut / --past 在 days.css；高亮色给出浅色和深色两个值
  const hlVars = c => `--hl-l:${c};--hl-d:${MC.darkTone(c)[0]};--hl-ink-d:${MC.darkTone(c)[1]}`;
  const toneVar = (x, inf) => `--tone:var(--${inf.state === 'past' ? 'past' : 'fut'})${x.hl ? ';' + hlVars(x.hl) : ''}`;
  // 图块：有主题照片时用照片缩略图（表情做小角标）；纯色主题用那个颜色；否则用未来 / 过去的浅色
  const isPhotoCover = x => /^p/.test(x.cover || '');
  const coverColor = x => (x.cover && x.cover.startsWith('c:') ? x.cover.slice(2) : '');
  // 图块：大类颜色的淡底 + 同色线条图标
  const tile = (x, inf, cls = '') => `<span class="dv-ico ${cls}" style="--ic:${P.catColor(x)}">${glyph(x)}</span>`;

  // 把页面里还没加载的主题照片填上
  function fillCovers(root) {
    root.querySelectorAll('img[data-cover]:not([src])').forEach(async img => { const u = await P.photoURL(img.dataset.cover); if (u) { img.src = u; img.classList.add('ok'); } });
  }
  function subLine(x, inf) {
    const word = inf.state === 'today' ? T('就是今天') : inf.state === 'fut' ? T('还有') : T('起始于');
    const bits = [`<span class="dv-st">${word}</span>`, esc(fmtDateTime(inf.occ, x.time))];
    if (x.rep) bits.push(repLabel(x.rep) + (x.rep === 'year' && inf.nth > 0 ? ' · ' + F('{0} 周年', inf.nth) : ''));
    return bits.join('<i class="dot">·</i>');
  }
  function numHTML(x, inf, unit) {
    const a = amount(x, inf, unit);
    if (a.today) return `<span class="dv-n today"><b>${T('今天')}</b></span>`;
    const pre = inf.state === 'past' && x.from1 && /^zh/.test(P.LANG) ? `<i class="pre">${T('第')}</i>` : '';
    return `<span class="dv-n">${pre}<b>${a.num}</b><i>${a.unit}</i></span>`;
  }
  // 小条：文字全靠左；右边约 38% 宽放主题照片，从左往右渐变出来。没有照片时右边是一层很淡的大类颜色和一个大图标水印
  function rowHTML(x, now) {
    const inf = info(x, now), a = amount(x, inf), photo = isPhotoCover(x), cc = coverColor(x);
    const word = inf.state === 'today' ? '' : inf.state === 'fut' ? T('还有') : x.from1 ? '' : T('已经');
    const pre = inf.state === 'past' && x.from1 && /^zh/.test(P.LANG) ? T('第') : '';
    const num = a.today ? `<b class="today">${T('就是今天')}</b>` : `${word ? `<em>${word}</em>` : ''}${pre ? `<i class="pre">${pre}</i>` : ''}<b>${a.num}</b><i>${a.unit}</i>`;
    const art = photo ? `<span class="rw-art"><img alt="" data-cover="${x.cover}"></span>`
      : `<span class="rw-art plain"${cc ? ` style="--pastel:${cc}"` : ''}>${svgOf(P.iconOf(x)) || ''}</span>`;
    return `<button class="dv-row${x.hl ? ' hl' : ''}${inf.state === 'past' ? ' past' : ''}${photo ? ' photo' : ''}" data-id="${x.id}" style="${toneVar(x, inf)};--ic:${P.catColor(x)}">
      ${art}
      ${tile(x, inf)}
      <span class="dv-txt">
        <b data-uc>${esc(x.title || T('（无标题）'))}${x.pin ? `<span class="dv-pin" title="${T('置顶')}">${UI_IC.pin}</span>` : ''}</b>
        <small><span class="rw-n">${num}</span><i class="dot">·</i>${esc(fmtDateTime(inf.occ, x.time))}${x.rep ? '<i class="dot">·</i>' + repLabel(x.rep) : ''}</small>
      </span>
    </button>`;
  }
  const pad = MC.pad;
  function tickHTML(x, inf, now) {
    const c = clock(x, inf, now);
    return `<span class="tk"><b>${c.d}</b><i>${T('天')}</i></span><span class="tk"><b>${pad(c.h)}</b><i>${T('时')}</i></span><span class="tk"><b>${pad(c.m)}</b><i>${T('分')}</i></span><span class="tk"><b>${pad(c.s)}</b><i>${T('秒')}</i></span>`;
  }
  function heroHTML(x, now, big) {
    const inf = info(x, now), a = amount(x, inf), ms = milestone(x, inf);
    const head = inf.state === 'today' ? T('就是今天') : stateWord(x, inf);
    return `<div class="dv-hero${big ? ' big' : ''}${x.hl ? ' hl' : ''}" data-id="${x.id}" style="${toneVar(x, inf)}" role="button" tabindex="0">
      <div class="dh-top">${tile(x, inf, 'lg')}<div class="dh-title"><b data-uc>${esc(x.title || T('（无标题）'))}</b><small>${esc(fmtDateTime(inf.occ, x.time))}${x.rep ? ' · ' + repLabel(x.rep) : ''}</small></div>${x.pin && !big ? `<span class="dv-pin">${UI_IC.pin}</span>` : ''}</div>
      <div class="dh-mid">
        <span class="dh-st">${head}</span>
        ${a.today ? `<span class="dh-num today" data-cycle>${T('今天')}</span>` : `<span class="dh-num" data-cycle><b>${a.num}</b><i>${a.unit}</i></span>`}
        ${a.rest ? `<span class="dh-rest">${T('又')} ${a.rest}</span>` : ''}
      </div>
      ${x.time || big ? `<div class="dh-tick" data-tick="${x.id}">${tickHTML(x, inf, now)}</div>` : ''}
      ${inf.prog !== null ? `<div class="dh-prog" aria-hidden="true"><span style="width:${(inf.prog * 100).toFixed(1)}%"></span></div>` : ''}
      ${big && ms ? `<div class="dh-ms">${T('下一个里程碑')} <b>${ms.label}</b> · ${esc(fmtDate(ms.date))} · ${F('还有 {0} 天', ms.left)}</div>` : ''}
      ${big && x.rep === 'year' && inf.nth > 0 ? `<div class="dh-ms">${F('这是第 {0} 次', inf.nth)} · ${T('起始于')} ${esc(fmtDate(inf.base))}</div>` : ''}
    </div>`;
  }

  // 列表最上面的大卡片：主题图片铺满，下面一块磨砂的倒数
  function coverCardHTML(x, now) {
    const inf = info(x, now), a = amount(x, inf), cc = coverColor(x), photo = isPhotoCover(x);
    const pre = inf.state === 'past' && x.from1 && /^zh/.test(P.LANG) ? `<i class="pre">${T('第')}</i>` : '';
    const word = inf.state === 'today' ? T('就是今天') : inf.state === 'fut' ? T('还有') : x.from1 ? T('今天是') : T('已经');
    return `<div class="dv-cover${photo ? ' photo' : ''}${inf.state === 'past' ? ' past' : ''}" data-id="${x.id}" role="button" tabindex="0" style="${toneVar(x, inf)}${cc ? `;--pastel:${cc}` : ''}">
      ${photo ? `<img class="cv-img" alt="" data-cover="${x.cover}">` : ''}
      <div class="cv-top"><span class="cv-tile" style="--ic:${P.catColor(x)}">${glyph(x)}</span>${x.pin ? `<span class="cv-pin" title="${T('置顶')}">${UI_IC.pin}</span>` : ''}</div>
      <div class="cv-plate">
        <div class="cv-l"><b data-uc>${esc(x.title || T('（无标题）'))}</b><small>${esc(fmtDateTime(inf.occ, x.time))}${x.rep ? ' · ' + repLabel(x.rep) : ''}</small></div>
        <div class="cv-r"><small>${word}</small>${a.today ? `<b class="today">${T('今天')}</b>` : `<b>${pre}${a.num}<i>${a.unit}</i></b>`}</div>
      </div>
    </div>`;
  }

  // ---------- 列表 / 日历 ----------
  function filtered(now) {
    let list = daysOf(calId());
    if (st.cat) list = list.filter(x => catOf(x) === st.cat && (!st.sub || subKey(x) === st.sub));
    return list.map(x => ({ x, inf: info(x, now) })).filter(o => st.filter === 'all' || (st.filter === 'fut' ? o.inf.state !== 'past' : o.inf.state === 'past'));
  }
  function render() {
    if (!isOn()) return;
    const c = MC.cal(calId()); if (!c) return;
    const now = new Date(), all = daysOf(c.id);
    const next = all.map(x => ({ x, inf: info(x, now) })).filter(o => o.inf.state !== 'past').sort((a, b) => a.inf.diff - b.inf.diff)[0];
    const sub = !all.length ? T('记录重要的日子') : next
      ? (next.inf.state === 'today' ? F('{0} 个日子 · 今天是「{1}」', all.length, next.x.title) : F('{0} 个日子 · 下一个「{1}」还有 {2} 天', all.length, next.x.title, next.inf.diff))
      : F('{0} 个日子', all.length);
    document.querySelectorAll('.dvName').forEach(e => (e.textContent = c.name));
    document.querySelectorAll('.dvSub').forEach(e => (e.textContent = sub));
    document.querySelectorAll('#dvYM [data-ym]').forEach(b => b.classList.toggle('on', b.dataset.ym === st.cv));
    const books = booksOf(c.id);
    const cats = CATS.filter(k => all.some(x => catOf(x) === k.k));
    if (st.cat && !cats.some(k => k.k === st.cat)) { st.cat = ''; st.sub = ''; }
    const inCat = st.cat ? all.filter(x => catOf(x) === st.cat) : [];
    const subs = [...new Set(inCat.map(subKey).filter(Boolean))];
    if (st.sub && !subs.includes(st.sub)) st.sub = '';
    // 纪念日（列表）
    let h = cats.length > 1 || st.cat ? `<div class="dv-bar">
      ${cats.length > 1 || st.cat ? `<div class="dv-books dv-noswipe">
        <button class="dv-book${!st.cat ? ' on' : ''}" data-cat="">${T('全部')}</button>
        ${cats.map(k => `<button class="dv-book${st.cat === k.k ? ' on' : ''}" data-cat="${k.k}"><span class="e" style="--ic:${k.c}">${svgOf(k.i)}</span>${T(k.n)}<small>${all.filter(x => catOf(x) === k.k).length}</small></button>`).join('')}
      </div>` : ''}
      ${st.cat && subs.length > 1 ? `<div class="dv-books dv-subs dv-noswipe">
        <button class="dv-sub${!st.sub ? ' on' : ''}" data-sub="">${T('全部')}</button>
        ${subs.map(k => { const x0 = inCat.find(x => subKey(x) === k); return `<button class="dv-sub${st.sub === k ? ' on' : ''}" data-sub="${k}"${k.startsWith('b') ? ` data-custom="${k}"` : ''}><span data-uc>${esc(subName(x0, books))}</span><small>${inCat.filter(x => subKey(x) === k).length}</small></button>`; }).join('')}
      </div>` : ''}
    </div>` : '';
    const empty = `<div class="dv-empty"><span class="dv-empty-ico">${svgOf('heart')}</span><b>${T('还没有日子')}</b><p>${T('点右下角 ＋ 记下第一个重要的日子：未来的倒数，过去的累计。')}</p></div>`;
    dvList.innerHTML = h + (all.length ? listHTML(now) : empty);
    fillCovers(dvList);
    // 日历（年 / 月）
    dvBody.innerHTML = st.cv === 'year' ? yearHTML(now) : calHTML(now);
    fillCovers(dvBody);
    // 总览
    dvSum.innerHTML = all.length ? sumHTML(now, all) : empty;
    fillCovers(dvSum);
  }
  // 总览：一眼看到今天、接下来、快到的里程碑、各个类别和最近的小纸条
  function sumHTML(now, all) {
    const today = t0(now), items = all.map(x => ({ x, inf: info(x, now) }));
    const fut = items.filter(o => o.inf.state === 'fut').sort((a, b) => a.inf.diff - b.inf.diff);
    const past = items.filter(o => o.inf.state === 'past');
    const todays = items.filter(o => o.inf.state === 'today');
    const thisYear = items.filter(o => o.inf.occ.getFullYear() === today.getFullYear() && o.inf.state !== 'past').length;
    const notes = all.reduce((n, x) => n + x.notes.length, 0), photos = all.reduce((n, x) => n + x.photos.length, 0);
    const stat = (n, l, c) => `<div class="sm-stat"${c ? ` style="--c:${c}"` : ''}><b>${n}</b><span>${l}</span></div>`;
    let h = `<div class="sm-stats">${stat(all.length, T('全部'))}${stat(fut.length + todays.length, T('未来'), 'var(--fut)')}${stat(past.length, T('过去'), 'var(--past)')}${stat(thisYear, T('今年还会到来'))}</div>`;
    // 今天
    h += `<p class="dv-sec">${T('今天')}<span>${esc(fmtDate(today))}</span></p>`;
    h += todays.length ? `<div class="dv-cards">${todays.map(o => rowHTML(o.x, now)).join('')}</div>`
      : `<div class="sm-quiet">${fut[0] ? F('今天没有纪念日 · 离「{0}」还有 {1} 天', `<b data-uc>${esc(fut[0].x.title)}</b>`, fut[0].inf.diff) : T('今天没有纪念日')}</div>`;
    // 接下来：横向滑动的小卡片
    if (fut.length) h += `<p class="dv-sec">${T('接下来')}<span>${fut.length}</span></p><div class="sm-next dv-noswipe">${fut.slice(0, 8).map(o => {
      const a = amount(o.x, o.inf, 'd'), photo = isPhotoCover(o.x), cc = coverColor(o.x);
      return `<button class="sm-card${photo ? ' photo' : ''}" data-id="${o.x.id}" style="--ic:${P.catColor(o.x)}${cc ? `;--pastel:${cc}` : ''}">
        ${photo ? `<img alt="" data-cover="${o.x.cover}">` : ''}
        <span class="sm-ic">${glyph(o.x)}</span>
        <span class="sm-n"><b>${a.num}</b><i>${a.unit}</i></span>
        <span class="sm-t" data-uc>${esc(o.x.title)}</span>
        <small>${esc(fmtDate(o.inf.occ))}</small>
      </button>`; }).join('')}</div>`;
    // 快到的里程碑（过去的日子：每 100 天、每满一年），90 天内
    const ms = past.map(o => ({ o, m: milestone(o.x, o.inf) })).filter(z => z.m && z.m.left <= 90).sort((a, b) => a.m.left - b.m.left);
    if (ms.length) h += `<p class="dv-sec">${T('快到的里程碑')}<span>${ms.length}</span></p><div class="dv-cards">${ms.slice(0, 5).map(({ o, m }) => `
      <button class="dv-row sm-ms" data-id="${o.x.id}" style="--tone:var(--past);--ic:${P.catColor(o.x)}">${tile(o.x, o.inf)}
        <span class="dv-txt"><b data-uc>${esc(o.x.title)}</b><small>${m.label}<i class="dot">·</i>${esc(fmtDate(m.date))}</small></span>
        <span class="dv-n sm"><b>${m.left === 0 ? T('就是今天') : F('还有 {0} 天', m.left)}</b></span></button>`).join('')}</div>`;
    // 类别
    const cats = CATS.map(c => ({ c, list: items.filter(o => catOf(o.x) === c.k) })).filter(z => z.list.length);
    if (cats.length) h += `<p class="dv-sec">${T('类别')}</p><div class="sm-cats">${cats.map(({ c, list }) => {
      const nx = list.filter(o => o.inf.state !== 'past').sort((a, b) => a.inf.diff - b.inf.diff)[0];
      return `<button class="sm-cat" data-gocat="${c.k}" style="--ic:${c.c}"><span class="sm-ic">${svgOf(c.i)}</span>
        <span class="sm-ct"><b>${T(c.n)}</b><small>${nx ? (nx.inf.state === 'today' ? T('今天') : F('还有 {0} 天', nx.inf.diff)) + ' · ' + `<span data-uc>${esc(nx.x.title)}</span>` : F('{0} 个日子', list.length)}</small></span>
        <em>${list.length}</em></button>`; }).join('')}</div>`;
    // 最近的小纸条
    const lastNote = all.flatMap(x => x.notes.map(n => ({ x, n }))).sort((a, b) => b.n.at - a.n.at)[0];
    h += `<p class="dv-sec">${T('回忆')}<span>${F('{0} 张小纸条 · {1} 张照片', notes, photos)}</span></p>`;
    h += lastNote ? `<button class="sm-note" data-id="${lastNote.x.id}"><small><span data-uc>${esc(lastNote.x.title)}</span> · ${esc(fmtDate(new Date(lastNote.n.at)))}</small><p data-uc>${esc(lastNote.n.text)}</p></button>`
      : `<div class="sm-quiet">${T('在日子的主页里写小纸条、放照片，这里会显示最近的一张。')}</div>`;
    return h;
  }
  // 年视图：12 个小月历，有日子的那天涂上颜色；下面列出这一年里的日子
  function yearHTML(now) {
    const today = t0(now);
    if (!st.yy) st.yy = today.getFullYear();
    const y = st.yy, ws = MC.settings.weekStart || 0, list = daysOf(calId());
    const mn = new Intl.DateTimeFormat(MC.locale ? MC.locale() : 'zh-CN', { month: 'short' });
    const occ = []; // 这一年里的每一次
    let months = '';
    for (let m = 0; m < 12; m++) {
      const first = new Date(y, m, 1), lead = (first.getDay() - ws + 7) % 7, n = new Date(y, m + 1, 0).getDate();
      let cells = '';
      for (let i = 0; i < lead; i++) cells += '<i></i>';
      for (let i = 1; i <= n; i++) {
        const d = new Date(y, m, i), hit = list.filter(x => P.hits(x, d));
        hit.forEach(x => occ.push({ x, d }));
        const c = hit.length ? (hit[0].hl ? hlTone(hit[0].hl) : `var(--${d < today ? 'past' : 'fut'})`) : '';
        cells += `<i class="${hit.length ? 'on' : ''}${diffDays(d, today) === 0 ? ' td' : ''}"${c ? ` style="--c:${c}"` : ''}>${i}</i>`;
      }
      months += `<button class="ym${y === today.getFullYear() && m === today.getMonth() ? ' cur' : ''}" data-month="${m}"><b>${mn.format(first)}</b><span class="ym-g">${cells}</span></button>`;
    }
    const rows = occ.length ? `<div class="dv-cards">${occ.map(o => {
      const inf = info(o.x, now), dd = diffDays(today, o.d);
      const word = dd === 0 ? T('就是今天') : dd > 0 ? F('还有 {0} 天', dd) : F('{0} 天前', -dd);
      return `<button class="dv-row${dd < 0 ? ' past' : ''}" data-id="${o.x.id}" style="--tone:var(--${dd < 0 ? 'past' : 'fut'})${o.x.hl ? ';' + hlVars(o.x.hl) : ''}">${tile(o.x, inf)}
        <span class="dv-txt"><b data-uc>${esc(o.x.title || T('（无标题）'))}</b><small>${esc(fmtDate(o.d))}${o.x.rep ? '<i class="dot">·</i>' + repLabel(o.x.rep) : ''}</small></span>
        <span class="dv-n sm"><b>${word}</b></span></button>`;
    }).join('')}</div>` : `<p class="dv-none">${T('这一年还没有标记的日子')}</p>`;
    return `<div class="dv-cal dv-year">
      <div class="dv-cal-head"><button class="nav-btn" data-ynav="-1" aria-label="${T('上一年')}">‹</button><b>${MC.isZh || P.LANG === 'ja' ? y + '年' : y}</b><button class="nav-btn" data-ynav="1" aria-label="${T('下一年')}">›</button></div>
      <div class="ym-grid">${months}</div>
    </div>
    <p class="dv-sec">${T('这一年的日子')}<span>${occ.length || ''}</span></p>${rows}`;
  }
  function listHTML(now) {
    const items = filtered(now);
    if (!items.length) return `<div class="dv-empty small"><p>${st.filter === 'past' ? T('这里还没有过去的日子') : st.filter === 'fut' ? T('这里还没有未来的日子') : T('这个分类还没有日子')}</p></div>`;
    const fut = items.filter(o => o.inf.state !== 'past').sort((a, b) => (b.x.pin - a.x.pin) || (a.inf.diff - b.inf.diff));
    const past = items.filter(o => o.inf.state === 'past').sort((a, b) => (b.x.pin - a.x.pin) || (b.inf.diff - a.inf.diff));
    const pinned = items.filter(o => o.x.pin).sort((a, b) => b.x.updatedAt - a.x.updatedAt)[0];
    const hero = pinned || fut[0] || past[0];
    let h = coverCardHTML(hero.x, now);
    const sec = (title, list) => list.length ? `<p class="dv-sec">${title}<span>${list.length}</span></p><div class="dv-cards">${list.map(o => rowHTML(o.x, now)).join('')}</div>` : '';
    h += sec(T('即将到来'), fut.filter(o => o !== hero));
    h += sec(T('已经过去'), past.filter(o => o !== hero));
    return h;
  }
  function calHTML(now) {
    const today = t0(now);
    if (!st.ym) st.ym = [today.getFullYear(), today.getMonth()];
    const [y, m] = st.ym, ws = MC.settings.weekStart || 0;
    const first = new Date(y, m, 1), lead = (first.getDay() - ws + 7) % 7, n = new Date(y, m + 1, 0).getDate();
    const list = daysOf(calId());
    const marks = new Map(); // 日期 → [{x, kind}]
    const add = (d, o) => { const k = MC.ymd(d); if (!marks.has(k)) marks.set(k, []); marks.get(k).push(o); };
    for (let i = 1; i <= n; i++) { const d = new Date(y, m, i); for (const x of list) if (P.hits(x, d)) add(d, { x, kind: 'day' }); }
    for (const x of list) for (const ms of milestonesIn(x, y, m)) add(ms.d, { x, kind: 'ms', label: ms.label });
    let cells = '';
    for (let i = 0; i < lead; i++) cells += '<span class="dc out"></span>';
    for (let i = 1; i <= n; i++) {
      const d = new Date(y, m, i), k = MC.ymd(d), mk = marks.get(k) || [];
      const dots = mk.slice(0, 3).map(o => { const c = o.x.hl ? hlTone(o.x.hl) : `var(--${d < today ? 'past' : 'fut'})`; return `<i class="${o.kind === 'ms' ? 'ms' : ''}" style="--c:${c}"></i>`; }).join('');
      cells += `<button class="dc${k === MC.ymd(today) ? ' today' : ''}${k === st.sel ? ' sel' : ''}${mk.length ? ' has' : ''}" data-date="${k}"><b>${i}</b><span class="dd">${dots}</span></button>`;
    }
    const wd = Array.from({ length: 7 }, (_, i) => `<span>${MC.WD[(i + ws) % 7]}</span>`).join('');
    const selD = MC.parse(st.sel), selMarks = (marks.get(st.sel) || []);
    const selList = selMarks.length ? `<div class="dv-cards">${selMarks.map(o => o.kind === 'ms'
      ? `<button class="dv-row ms" data-id="${o.x.id}" style="--tone:var(--past)${o.x.hl ? ';' + hlVars(o.x.hl) : ''}">${tile(o.x, info(o.x, now))}<span class="dv-txt"><b data-uc>${esc(o.x.title)}</b><small>${T('里程碑')}<i class="dot">·</i>${o.label}</small></span><span class="dv-n sm"><b>${o.label}</b></span></button>`
      : rowHTML(o.x, now)).join('')}</div>` : `<p class="dv-none">${T('这一天没有标记的日子')}</p>`;
    const title = new Intl.DateTimeFormat(MC.locale ? MC.locale() : 'zh-CN', { year: 'numeric', month: 'long' }).format(first);
    return `<div class="dv-cal">
      <div class="dv-cal-head"><button class="nav-btn" data-nav="-1" aria-label="${T('上个月')}">‹</button><b>${title}</b><button class="nav-btn" data-nav="1" aria-label="${T('下个月')}">›</button></div>
      <div class="dv-wd">${wd}</div><div class="dv-grid">${cells}</div>
      <div class="dv-legend"><span><i style="--c:var(--fut)"></i>${T('未来')}</span><span><i style="--c:var(--past)"></i>${T('过去')}</span><span><i class="ms" style="--c:var(--past)"></i>${T('里程碑')}</span></div>
    </div>
    <p class="dv-sec">${P.fmtDate(selD)}</p>${selList}`;
  }

  const onClick = e => {
    const t = e.target;
    if (t.closest('.dv-title')) { MC.Drawer.open(); return; }
    const ym = t.closest('[data-ym]'); if (ym) { st.cv = ym.dataset.ym; MC.settings.daysCalView = st.cv; MC.saveSettings(); render(); return; }
    const f = t.closest('[data-filter]'); if (f) { st.filter = f.dataset.filter; render(); return; }
    const ck = t.closest('[data-cat]'); if (ck && !ck.closest('.de-body')) { st.cat = ck.dataset.cat; st.sub = ''; render(); return; }
    const sk = t.closest('[data-sub]');
    if (sk) {
      const id = sk.dataset.sub;
      if (sk.dataset.custom && st.sub === id) { bookMenu(sk, MC.data.books.find(b => b.id === id)); return; }
      st.sub = id; render(); return;
    }
    const nav = t.closest('[data-nav]');
    if (nav) { const [y, m] = st.ym; const d = new Date(y, m + Number(nav.dataset.nav), 1); st.ym = [d.getFullYear(), d.getMonth()]; render(); return; }
    const yn = t.closest('[data-ynav]'); if (yn) { st.yy += Number(yn.dataset.ynav); render(); return; }
    const mo = t.closest('[data-month]');
    if (mo) { st.ym = [st.yy, Number(mo.dataset.month)]; st.cv = 'month'; MC.settings.daysCalView = 'month'; MC.saveSettings(); const d = new Date(st.yy, Number(mo.dataset.month), 1); st.sel = MC.ymd(d.getMonth() === new Date().getMonth() && d.getFullYear() === new Date().getFullYear() ? new Date() : d); render(); return; }
    const dc = t.closest('.dc[data-date]'); if (dc) { st.sel = dc.dataset.date; vib(); render(); return; }
    const row = t.closest('[data-id]'); if (row) openPage(row.dataset.id);
  };
  view.addEventListener('click', onClick);
  listPage.addEventListener('click', onClick);
  sumPage.addEventListener('click', e => {
    if (e.target.closest('.dv-title')) { MC.Drawer.open(); return; }
    const gc = e.target.closest('[data-gocat]');
    if (gc) { st.cat = gc.dataset.gocat; st.sub = ''; MC.App.showPage('days'); return; }
    const row = e.target.closest('[data-id]'); if (row) openPage(row.dataset.id);
  });


  // ---------- 分类 ----------
  function bookForm(b, done, cat = 'other') {
    MC.openForm({
      title: b ? T('重命名细分') : F('在「{0}」里加一个细分', T(catDef(cat).n)), submit: b ? T('保存') : T('添加'),
      fields: [{ id: 'bookName', label: T('名称'), ph: T('比如：纪念日、周年、考研'), val: b ? b.name : '', max: 24 }],
      onSubmit: async v => {
        const name = v.bookName.trim(); if (!name) throw new Error(T('请填写名称'));
        if (b) { MC.updateBook(b, { name }); done && done(b); return; }
        const nb = MC.addBook(calId(), name, cat); done && done(nb);
      },
    });
    setTimeout(() => { const i = $('#ff_bookName'); i && i.focus(); }, 360);
  }
  function bookMenu(anchor, b) {
    if (!b) return;
    UI.menu(anchor, [{ label: T('重命名'), value: 'ren' }, { label: T('删除细分'), value: 'del' }], v => {
      if (v === 'ren') bookForm(b, () => render());
      else if (confirm(F('删除细分「{0}」？里面的日子不会删除。', b.name))) { MC.deleteBook(b); st.sub = ''; render(); }
    });
  }

  // ---------- 日子的主页：单独的一页，上面是主题图片，下面是其他功能 ----------
  let cur = null;
  const page = $('#dayPage'), pgScroll = $('#dpScroll'), ddBody = $('#ddBody');
  function openPage(id) {
    const x = find(id); if (!x) return;
    cur = id; renderPage();
    pgScroll.scrollTop = 0;
    page.classList.add('show'); page.setAttribute('aria-hidden', 'false');
    body.classList.add('dp-open');
  }
  function closePage() {
    if (!page.classList.contains('show')) return false;
    page.classList.remove('show'); page.setAttribute('aria-hidden', 'true');
    body.classList.remove('dp-open');
    page.style.transform = ''; cur = null;
    return true;
  }
  Days.openDetail = Days.openPage = openPage;
  Days.closePage = closePage;
  Days.pageOpen = () => page.classList.contains('show');
  function renderPage() {
    const x = cur && find(cur); if (!x) { closePage(); return; }
    const now = new Date(), inf = info(x, now), a = amount(x, inf), ms = milestone(x, inf), cc = coverColor(x);
    // 封面
    const cover = $('#dpCover');
    cover.className = 'dp-cover' + (isPhotoCover(x) ? ' photo' : '') + (inf.state === 'past' ? ' past' : '');
    cover.style.cssText = toneVar(x, inf) + (cc ? `;--pastel:${cc}` : '');
    $('#dpCoverBg').innerHTML = isPhotoCover(x) ? `<img alt="" data-cover="${x.cover}">` : `<span class="dp-glyph" style="--ic:${P.catColor(x)}">${glyph(x)}</span>`;
    $('#dpSetCover').innerHTML = `${UI_IC.photo}<span>${x.cover ? T('更换主题图片') : T('设置主题图片')}</span>`;
    $('#dpPlate').innerHTML = `
      <b class="dp-title" data-uc>${esc(x.title || T('（无标题）'))}</b>
      <span class="dp-st">${inf.state === 'today' ? T('就是今天') : stateWord(x, inf)}</span>
      ${a.today ? `<span class="dp-num today" data-cycle>${T('今天')}</span>` : `<span class="dp-num" data-cycle><b>${a.num}</b><i>${a.unit}</i></span>`}
      ${a.rest ? `<span class="dp-rest">${T('又')} ${a.rest}</span>` : ''}
      <span class="dp-date">${esc(fmtDateTime(inf.occ, x.time))}${x.rep ? ' · ' + repLabel(x.rep) : ''}</span>
      <div class="dh-tick" data-tick="${x.id}">${tickHTML(x, inf, now)}</div>`;
    fillCovers(cover);
    // 下面的内容
    const cd = catDef(catOf(x)), sn = subName(x);
    const notes = [...x.notes].sort((p, q) => q.at - p.at);
    const extra = [ms ? `${T('下一个里程碑')} <b>${ms.label}</b> · ${esc(fmtDate(ms.date))} · ${F('还有 {0} 天', ms.left)}` : '',
      x.rep === 'year' && inf.nth > 0 ? `${F('这是第 {0} 次', inf.nth)} · ${T('起始于')} ${esc(fmtDate(inf.base))}` : ''].filter(Boolean);
    ddBody.innerHTML = `
      <div class="seg small dd-units" role="tablist" aria-label="${T('显示单位')}">${UNIT_SEG.map(([v, l]) => `<button data-unit="${v}" class="${x.unit === v ? 'on' : ''}">${T(l)}</button>`).join('')}</div>
      ${inf.prog !== null ? `<div class="dp-prog" aria-hidden="true"><span style="width:${(inf.prog * 100).toFixed(1)}%;--tone:var(--${inf.state === 'past' ? 'past' : 'fut'})"></span></div>` : ''}
      ${extra.length ? `<div class="dp-ms">${extra.map(t => `<p>${t}</p>`).join('')}</div>` : ''}
      <div class="dd-acts">
        <button data-dd="share"><span class="ai" style="--ac:#5B8DEF">${UI_IC.share}</span><span>${T('分享图片')}</span></button>
        <button data-dd="cam"><span class="ai" style="--ac:#8B6FD6">${UI_IC.cam}</span><span>${T('透明相机')}</span></button>
        <button data-dd="hl" class="${x.hl ? 'on' : ''}" style="${x.hl ? hlVars(x.hl) : ''}"><span class="ai" style="--ac:${x.hl ? 'var(--hl)' : '#E0869A'}">${UI_IC.hl}</span><span>${x.hl ? T('已高亮') : T('高亮')}</span></button>
        <button data-dd="pin" class="${x.pin ? 'on' : ''}"><span class="ai" style="--ac:#E3A048">${UI_IC.pin}</span><span>${x.pin ? T('已置顶') : T('置顶')}</span></button>
      </div>
      <div class="group dd-info">
        <div class="dd-kv"><span>${x.rep || inf.state === 'past' ? T('起始日') : T('目标日')}</span><b>${esc(fmtDateTime(P.occurrence({ ...x, rep: '' }, t0()), x.time))}</b></div>
        ${x.rep ? `<div class="dd-kv"><span>${T('下一次')}</span><b>${esc(fmtDateTime(inf.occ, x.time))}</b></div><div class="dd-kv"><span>${T('重复')}</span><b>${repLabel(x.rep)}</b></div>` : ''}
        <div class="dd-kv"><span>${T('分类')}</span><b><span class="kv-ic" style="--ic:${cd.c}">${svgOf(cd.i)}</span> ${T(cd.n)}${sn ? ` · <span data-uc>${esc(sn)}</span>` : ''}</b></div>
      </div>
      <div class="dd-sec"><h3><span class="si">${UI_IC.note}</span>${T('小纸条')}<span>${notes.length || ''}</span></h3><button class="chip-btn glass" data-dd="note">${T('写一张')}</button></div>
      ${notes.length ? `<div class="dd-notes">${notes.map(n => noteHTML(x, n)).join('')}</div>` : `<p class="dd-hint">${T('记下这一天的期待、心情，或者那天发生的小事。')}</p>`}
      <div class="dd-sec"><h3><span class="si">${UI_IC.photo}</span>${T('相册')}<span>${x.photos.length || ''}</span></h3><button class="chip-btn glass" data-dd="photo">${T('添加照片')}</button></div>
      ${x.photos.length ? `<div class="dd-photos">${x.photos.map((p, i) => `<button class="dd-ph" data-ph="${p.id}" data-i="${i}" aria-label="${T('查看照片')}"><img alt="" data-src="${p.id}"></button>`).join('')}<button class="dd-ph add" data-dd="photo" aria-label="${T('添加照片')}">${UI_IC.plus}</button></div>` : `<p class="dd-hint">${T('把这一天的照片放在一起。照片会同步到你自己的 GitHub（单独的私密 Gist）。')}</p>`}
      <button class="dd-del" data-dd="del">${T('删除这个日子')}</button>`;
    ddBody.querySelectorAll('img[data-src]').forEach(async img => { const u = await P.photoURL(img.dataset.src); if (u) { img.src = u; img.parentElement.classList.add('ok'); } else img.parentElement.classList.add('miss'); });
  }
  const renderDetail = renderPage;
  function noteHTML(x, n) {
    const d = new Date(n.at), inf = info(x, d), a = amount(x, inf, 'd');
    const when = inf.state === 'today' ? T('那天就是这一天') : inf.state === 'fut' ? F('那天还有 {0} 天', a.num) : x.from1 ? F('那天是第 {0} 天', a.num) : F('那天已经 {0} 天', a.num);
    const who = MC.data.profile.name ? `<b data-uc>${esc(MC.data.profile.name)}</b>` : '';
    return `<div class="dd-note" data-note="${n.id}">
      <div class="dn-top">${who}<small>${esc(P.fmtDate(d))} · ${when}</small><button class="dn-more" data-nmore="${n.id}" aria-label="${T('更多')}">${UI_IC.more}</button></div>
      <p data-uc>${esc(n.text)}</p></div>`;
  }
  // 封面上的按钮：返回、分享、编辑、主题图片；点大数字切换单位
  page.addEventListener('click', e => {
    const x = cur && find(cur); if (!x) return;
    const b = e.target.closest('[data-pg]');
    if (b) {
      const a = b.dataset.pg;
      if (a === 'back') closePage();
      else if (a === 'share') Days.openShare(x);
      else if (a === 'edit') openEditor(x);
      else if (a === 'cover') openCover(x);
      return;
    }
    if (e.target.closest('#dpPlate [data-cycle]')) { const order = ['d', 'w', 'm', 'y']; MC.updateDay(x, { unit: order[(order.indexOf(x.unit) + 1) % 4] }); vib(); }
  });
  ddBody.addEventListener('click', async e => {
    const x = cur && find(cur); if (!x) return;
    const t = e.target;
    const u = t.closest('[data-unit]'); if (u) { MC.updateDay(x, { unit: u.dataset.unit }); vib(); return; }
    const nm = t.closest('[data-nmore]');
    if (nm) {
      const n = x.notes.find(y => y.id === nm.dataset.nmore); if (!n) return;
      UI.menu(nm, [{ label: T('编辑'), value: 'edit' }, { label: T('生成分享图片'), value: 'share' }, { label: T('删除'), value: 'del' }], v => {
        if (v === 'edit') openNote(x, n);
        else if (v === 'share') Days.openShare(x, { note: n.id });
        else if (confirm(T('删除这张小纸条？'))) MC.updateDay(x, { notes: x.notes.filter(y => y.id !== n.id) });
      });
      return;
    }
    const ph = t.closest('[data-ph]'); if (ph) { Days.openViewer(x, Number(ph.dataset.i)); return; }
    const b = t.closest('[data-dd]'); if (!b) return;
    const a = b.dataset.dd;
    if (a === 'share') Days.openShare(x);
    else if (a === 'cam') Days.openCam(x);
    else if (a === 'pin') { MC.updateDay(x, { pin: !x.pin }); UI.toast(x.pin ? T('已置顶，会显示在最上面和小组件里') : T('已取消置顶')); }
    else if (a === 'hl') UI.menu(b, [{ label: T('不高亮'), value: '', on: !x.hl }, ...HL.map(h => ({ label: T(h.n), value: h.c, on: x.hl === h.c, icon: `<span class="hl-dot" style="--c:${hlTone(h.c)}"></span>` }))], v => MC.updateDay(x, { hl: v }));
    else if (a === 'note') openNote(x, null);
    else if (a === 'photo') pickPhotos(x);
    else if (a === 'del') removeDay(x);
  });
  async function removeDay(x) {
    if (!confirm(F('删除「{0}」？小纸条和相册会一起删除，其他设备同步后也会删除。', x.title))) return false;
    for (const p of [...x.photos, ...(isPhotoCover(x) ? [{ id: x.cover }] : [])]) { try { await P.PDB.del(p.id); } catch (err) {} Days.Album.enqueue('del', p.id); }
    MC.deleteDay(x);
    if (UI.isOpen('dayEditor')) UI.close('dayEditor', true);
    closePage();
    UI.toast(T('已删除'));
    return true;
  }
  const photoIn = $('#dayPhotoFile');
  let photoFor = null;
  function pickPhotos(x) { photoFor = x.id; photoIn.value = ''; photoIn.click(); }
  photoIn.addEventListener('change', async () => { const x = photoFor && find(photoFor); if (x && photoIn.files.length) await P.addPhotos(x, photoIn.files); });

  // 从左边缘往右滑返回（和系统的返回手势一样）
  let sw = null;
  page.addEventListener('touchstart', e => {
    const t = e.touches[0];
    sw = e.touches.length === 1 && t.clientX < 28 && !UI.anyOpen() ? { x0: t.clientX, y0: t.clientY, on: false, w: page.offsetWidth } : null;
  }, { passive: true });
  page.addEventListener('touchmove', e => {
    if (!sw) return;
    const t = e.touches[0], dx = t.clientX - sw.x0, dy = t.clientY - sw.y0;
    if (!sw.on) { if (Math.abs(dx) < 8) return; if (dx < 0 || Math.abs(dy) > dx) { sw = null; return; } sw.on = true; page.style.transition = 'none'; }
    if (e.cancelable) e.preventDefault();
    page.style.transform = `translate3d(${Math.max(0, dx)}px,0,0)`;
    sw.dx = dx;
  }, { passive: false });
  page.addEventListener('touchend', () => {
    if (!sw || !sw.on) { sw = null; return; }
    page.style.transition = '';
    if (sw.dx > sw.w * .32) { page.style.transform = `translate3d(${sw.w}px,0,0)`; setTimeout(closePage, 220); }
    else page.style.transform = '';
    sw = null;
  });

  // ---------- 主题图片 ----------
  let coverFor = null;
  const coverIn = $('#dayCoverFile');
  function openCover(x) {
    coverFor = x.id;
    const cc = coverColor(x);
    $('#dcBody').innerHTML = `
      <button class="dc-pick" data-cv="pick"><span class="ai" style="--ac:#5B8DEF">${UI_IC.photo}</span><span><b>${T('从手机相册选择')}</b><small>${T('会裁成封面铺满顶部')}</small></span></button>
      ${x.photos.length ? `<p class="cmp-label">${T('这个日子的相册')}</p><div class="dc-grid">${x.photos.map(p => `<button class="dc-ph${x.cover === p.id ? ' on' : ''}" data-cv="${p.id}"><img alt="" data-src="${p.id}"></button>`).join('')}</div>` : ''}
      <p class="cmp-label">${T('纯色')}</p>
      <div class="dc-colors">${P.COVERS.map(c => `<button class="dc-col${cc === c ? ' on' : ''}" style="--pastel:${c}" data-cv="c:${c}" aria-label="${c}"></button>`).join('')}</div>
      ${x.cover ? `<button class="dd-del" data-cv="none">${T('移除主题图片')}</button>` : ''}`;
    $('#dcBody').querySelectorAll('img[data-src]').forEach(async img => { const u = await P.photoURL(img.dataset.src); if (u) img.src = u; });
    UI.open('dayCover');
  }
  $('#dcBody').addEventListener('click', async e => {
    const b = e.target.closest('[data-cv]'); const x = coverFor && find(coverFor); if (!b || !x) return;
    const v = b.dataset.cv;
    if (v === 'pick') { coverIn.value = ''; coverIn.click(); return; }
    await P.setCover(x, v === 'none' ? '' : v);
    UI.close('dayCover', true);
  });
  coverIn.addEventListener('change', async () => {
    const x = coverFor && find(coverFor), f = coverIn.files[0]; if (!x || !f) return;
    UI.close('dayCover', true);
    await P.setCoverFile(x, f);
  });

  // ---------- 小纸条 ----------
  let noteCtx = null;
  function openNote(x, n) {
    noteCtx = { id: x.id, note: n ? n.id : '' };
    $('#dnTitle').textContent = n ? T('编辑小纸条') : T('写一张小纸条');
    $('#dnText').value = n ? n.text : '';
    const inf = info(x, n ? new Date(n.at) : new Date()), a = amount(x, inf, 'd');
    $('#dnMeta').textContent = `${x.title} · ${inf.state === 'today' ? T('就是今天') : stateWord(x, inf) + ' ' + a.num + ' ' + T('天')}`;
    UI.open('dayNote');
    setTimeout(() => $('#dnText').focus(), 340);
  }
  $('#dnSave').onclick = () => {
    const x = noteCtx && find(noteCtx.id); if (!x) { UI.close('dayNote'); return; }
    const text = $('#dnText').value.trim();
    if (!text) { $('#dnText').classList.add('shake'); setTimeout(() => $('#dnText').classList.remove('shake'), 400); return; }
    const notes = noteCtx.note ? x.notes.map(n => (n.id === noteCtx.note ? { ...n, text } : n)) : [{ id: 'n' + MC.uid(), text, at: Date.now() }, ...x.notes];
    MC.updateDay(x, { notes });
    UI.close('dayNote', true);
    UI.toast(noteCtx.note ? T('已保存') : T('小纸条已贴上'));
  };

  // ---------- 编辑 ----------
  let ed = null, edFor = null;
  const deBody = $('#deBody');
  function openEditor(x, defaults = {}) {
    edFor = x ? x.id : null;
    ed = x ? { title: x.title, date: x.date, time: x.time, rep: x.rep, book: x.book, cat: catOf(x), sub: x.sub, iconSet: true, icon: P.iconOf(x) || x.icon, hl: x.hl, pin: x.pin, unit: x.unit, from1: x.from1 }
      : { title: '', date: defaults.date || MC.todayStr(), time: '', rep: '', book: '', cat: defaults.cat || '', sub: '', iconSet: false, icon: '', hl: '', pin: false, unit: 'd', from1: false };
    ed.open = '';
    $('#deHead').textContent = x ? T('编辑日子') : T('新的日子');
    $('#deSave').textContent = x ? T('保存') : T('添加');
    renderEditor();
    UI.open('dayEditor');
    deBody.scrollTop = 0;
    if (!x) setTimeout(() => { const i = $('#deTitle'); i && i.focus(); }, 360);
  }
  Days.openEditor = openEditor;
  function edPreview() {
    const old = edFor && find(edFor);
    const fake = { ...ed, id: 'preview', cover: old ? old.cover : '', notes: [], photos: [], createdAt: Date.now(), title: ed.title || edPlaceholder().replace(/^[^：:]*[：:]\s*/, '').split(/[、,]/)[0] };
    const h = $('#dePreview'); if (h) { h.innerHTML = coverCardHTML(fake, new Date()); fillCovers(h); }
  }
  const PH = { love: '比如：在一起、结婚纪念日', trip: '比如：去巴黎旅行、回家', study: '比如：期末考试、毕业', life: '比如：演唱会、马拉松', pet: '比如：小橘到家', fest: '比如：春节、圣诞节', other: '比如：搬家' };
  const edPlaceholder = () => T(PH[ed.cat] || '比如：去巴黎旅行、在一起、考研');
  function renderEditor() {
    const books = booksOf(calId());
    const d = MC.parse(ed.date), isPast = d < t0() && !ed.rep;
    const sw = (id, on, label, sub) => `<label class="pk-row"><span>${label}${sub ? `<small>${sub}</small>` : ''}</span><input type="checkbox" class="switch" id="${id}"${on ? ' checked' : ''}></label>`;
    deBody.innerHTML = `
      <div id="dePreview" class="de-preview" aria-hidden="true"></div>
      <p class="cmp-label">${T('类别')}</p>
      <div class="de-cats">${CATS.map(c => `<button class="de-cat${ed.cat === c.k ? ' on' : ''}" data-cat="${c.k}"><span class="e" style="--ic:${c.c}">${svgOf(c.i)}</span><span>${T(c.n)}</span></button>`).join('')}</div>
      ${ed.cat ? `<p class="cmp-label">${T('细分')}<span class="opt">${T('选填')}</span></p>
      <div class="cmp-chips de-subs">${books.filter(b => b.cat === ed.cat).map(b => `<button class="qchip${ed.book === b.id ? ' on' : ''}" data-bk="${b.id}"><span data-uc>${esc(b.name)}</span></button>`).join('')}<button class="qchip ghost" data-newbk>＋ ${T('自定义')}</button></div>` : ''}
      <p class="cmp-label">${T('名称')}</p>
      <div class="cmp-card de-card"><input id="deTitle" maxlength="120" placeholder="${esc(edPlaceholder())}" value="${esc(ed.title)}" enterkeyhint="done" autocomplete="off"></div>
      <div class="group de-rows">
        <button class="pk-row" data-open="date"><span>${T('日期')}</span><span class="grow-val on">${esc(fmtDate(d))}</span></button>
        <div class="wheel-wrap" id="deDateW" ${ed.open === 'date' ? '' : 'hidden'}></div>
        ${sw('deTimeOn', !!ed.time, T('精确时间'), T('倒数精确到时、分、秒'))}
        ${ed.time ? `<button class="pk-row" data-open="time"><span>${T('时间')}</span><span class="grow-val on">${esc(MC.fmtTime ? MC.fmtTime(ed.time) : ed.time)}</span></button><div class="wheel-wrap" id="deTimeW" ${ed.open === 'time' ? '' : 'hidden'}></div>` : ''}
      </div>
      <p class="cmp-label">${T('重复')}</p>
      <div class="cmp-chips">${[['', '不重复'], ['week', '每周'], ['month', '每月'], ['year', '每年']].map(([v, l]) => `<button class="qchip${ed.rep === v ? ' on' : ''}" data-rep="${v}">${T(l)}</button>`).join('')}</div>
      <p class="de-tip">${ed.rep === 'year' ? T('生日、纪念日这类每年都有的日子：一直倒数到下一次。') : ed.rep ? T('每次过去后自动倒数到下一次。') : isPast ? T('日期在过去：累计已经过了多少天。') : T('日期在未来：倒数还有多少天。')}</p>
      ${isPast ? `<div class="group de-rows">${sw('deFrom1', ed.from1, T('起始日算第 1 天'), T('显示成「第 N 天」，比如在一起第 100 天'))}</div>` : ''}
      <p class="cmp-label">${T('显示单位')}</p>
      <div class="seg de-seg">${UNIT_SEG.map(([v, l]) => `<button data-unit="${v}" class="${ed.unit === v ? 'on' : ''}">${T(l)}</button>`).join('')}</div>
      <p class="cmp-label">${T('图标')}</p>
      <div class="de-icons${ed.moreIcons ? '' : ' fold'}">
        <div class="de-ic-row" style="--ic:${catDef(ed.cat || 'other').c}">${ed.icon ? `<span class="de-ic on cur">${glyph({ icon: ed.icon, title: ed.title })}</span>` : ''}<button class="de-ic${!ed.icon ? ' on' : ''}" data-ic="" aria-label="${T('用名称的第一个字')}"><span class="ini">${esc(P.firstChar(ed.title || T('字')))}</span></button><span class="de-ic-hint">${ed.icon ? T('选了类别会自动换成对应的图标') : T('用名称的第一个字')}</span></div>
        <button class="de-more" data-moreic>${ed.moreIcons ? T('收起') : T('更多图标')}</button>
        ${!ed.moreIcons ? '' : ICON_GROUPS.map(([g, list]) => `<p class="de-ic-g">${T(g)}</p><div class="de-ic-grid">${list.map(n => `<button class="de-ic${ed.icon === n ? ' on' : ''}" data-ic="${n}" aria-label="${n}" style="--ic:${(CATS.find(c => c.n === g) || catDef(ed.cat || 'other')).c}">${svgOf(n)}</button>`).join('')}</div>`).join('')}
      </div>
      <p class="cmp-label">${T('高亮')}</p>
      <div class="dr-swatches de-hl"><button type="button" class="dr-sw none${!ed.hl ? ' on' : ''}" data-hl="" aria-label="${T('不高亮')}"></button>${HL.map(h => `<button type="button" class="dr-sw${ed.hl === h.c ? ' on' : ''}" style="--cc:${hlTone(h.c)}" data-hl="${h.c}" aria-label="${T(h.n)}"></button>`).join('')}</div>
      <div class="group de-rows">${sw('dePin', ed.pin, T('置顶'), T('放在最上面，也显示在小组件里'))}</div>
      ${edFor ? `<button class="dd-del" data-del>${T('删除这个日子')}</button>` : ''}`;
    edPreview();
    if (ed.open === 'date') dateWheel($('#deDateW'));
    if (ed.open === 'time' && ed.time) timeWheel($('#deTimeW'));
  }
  function dateWheel(host) {
    const d = MC.parse(ed.date), now = new Date().getFullYear();
    const CJK = MC.isZh || P.LANG === 'ja';
    const years = []; for (let y = 1900; y <= now + 60; y++) years.push({ label: CJK ? y + '年' : String(y), value: y });
    const mn = new Intl.DateTimeFormat(MC.locale ? MC.locale() : 'zh-CN', { month: 'short' });
    const months = []; for (let m = 1; m <= 12; m++) months.push({ label: mn.format(new Date(2000, m - 1, 1)), value: m });
    const dayItems = (y, m) => { const n = new Date(y, m, 0).getDate(), out = []; for (let i = 1; i <= n; i++) out.push({ label: MC.isZh ? `${i}日 ${T('周')}${MC.WD[new Date(y, m - 1, i).getDay()]}` : CJK ? `${i}日(${'日月火水木金土'[new Date(y, m - 1, i).getDay()]})` : `${i}`, value: i }); return out; };
    let y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
    const w = UI.wheel(host, [{ items: years, value: y, flex: 1 }, { items: months, value: m, flex: .8 }, { items: dayItems(y, m), value: day, flex: 1.4 }], (ci, v) => {
      if (ci === 0) y = v; else if (ci === 1) m = v; else day = v;
      if (ci < 2) { day = Math.min(day, new Date(y, m, 0).getDate()); w.cols[2].set(dayItems(y, m), day); }
      ed.date = `${y}-${pad(m)}-${pad(day)}`;
      const row = deBody.querySelector('[data-open="date"] .grow-val'); if (row) row.textContent = fmtDate(MC.parse(ed.date));
      edPreview();
      clearTimeout(dateWheel.t); dateWheel.t = setTimeout(() => { const wasPast = !!$('#deFrom1'); const nowPast = MC.parse(ed.date) < t0() && !ed.rep; if (wasPast !== nowPast) { ed.open = 'date'; const st0 = deBody.scrollTop; renderEditor(); deBody.scrollTop = st0; } }, 500);
    });
  }
  function timeWheel(host) {
    const [h0, m0] = ed.time.split(':').map(Number);
    const hours = []; for (let h = 0; h < 24; h++) hours.push({ label: MC.use12 && MC.use12() ? MC.hourLabel(h) : pad(h), value: h });
    const mins = []; for (let m = 0; m < 60; m++) mins.push({ label: pad(m), value: m });
    const w = UI.wheel(host, [{ items: hours, value: h0 }, { sep: ':' }, { items: mins, value: m0 }], () => {
      ed.time = `${pad(w.cols[0].value)}:${pad(w.cols[2].value)}`;
      const row = deBody.querySelector('[data-open="time"] .grow-val'); if (row) row.textContent = MC.fmtTime ? MC.fmtTime(ed.time) : ed.time;
      edPreview();
    });
  }
  deBody.addEventListener('input', e => {
    if (e.target.id === 'deTitle') { ed.title = e.target.value; const ini = deBody.querySelector('[data-ic=""] .ini'); if (ini) ini.textContent = P.firstChar(ed.title || T('字')); edPreview(); }
  });
  deBody.addEventListener('change', e => {
    const id = e.target.id;
    if (id === 'deTimeOn') { ed.time = e.target.checked ? (ed.time || '09:00') : ''; ed.open = e.target.checked ? 'time' : ''; keep(renderEditor); }
    else if (id === 'deFrom1') { ed.from1 = e.target.checked; edPreview(); }
    else if (id === 'dePin') { ed.pin = e.target.checked; edPreview(); }
  });
  const keep = fn => { const s = deBody.scrollTop; fn(); deBody.scrollTop = s; };
  deBody.addEventListener('click', e => {
    const t = e.target;
    const op = t.closest('[data-open]'); if (op) { ed.open = ed.open === op.dataset.open ? '' : op.dataset.open; keep(renderEditor); return; }
    const rp = t.closest('[data-rep]'); if (rp) { ed.rep = rp.dataset.rep; if (ed.rep) ed.from1 = false; keep(renderEditor); return; }
    const un = t.closest('[data-unit]'); if (un) { ed.unit = un.dataset.unit; deBody.querySelectorAll('.de-seg button').forEach(b => b.classList.toggle('on', b === un)); edPreview(); return; }
    const ct = t.closest('[data-cat]');
    if (ct) { if (ed.cat !== ct.dataset.cat) { ed.cat = ct.dataset.cat; ed.sub = ''; ed.book = ''; if (!ed.iconSet) ed.icon = catDef(ed.cat).i; } keep(renderEditor); vib(); return; }
    const ps = t.closest('[data-psub]');
    if (ps) {
      ed.sub = ps.dataset.psub; ed.book = '';
      const [c, k] = ed.sub.split('.'), d0 = catDef(c).subs.find(x => x[0] === k);
      if (d0 && !ed.iconSet) ed.icon = d0[2];
      keep(renderEditor); vib(); return;
    }
    const bk = t.closest('[data-bk]'); if (bk) { ed.book = bk.dataset.bk; ed.sub = ''; keep(renderEditor); return; }
    if (t.closest('[data-newbk]')) { bookForm(null, b => { ed.book = b.id; ed.sub = ''; keep(renderEditor); }, ed.cat || 'other'); return; }
    if (t.closest('[data-moreic]')) { ed.moreIcons = !ed.moreIcons; keep(renderEditor); return; }
    const ic = t.closest('[data-ic]'); if (ic) { ed.icon = ic.dataset.ic; ed.iconSet = !!ed.icon; keep(renderEditor); vib(); return; }
    const hl = t.closest('[data-hl]'); if (hl) { ed.hl = hl.dataset.hl; deBody.querySelectorAll('[data-hl]').forEach(b => b.classList.toggle('on', b === hl)); edPreview(); return; }
    if (t.closest('[data-del]')) { const x = find(edFor); if (x) removeDay(x); }
  });
  $('#deSave').onclick = () => {
    const title = (ed.title || '').trim();
    if (!title) { const i = $('#deTitle'); i.placeholder = T('先写一个名称'); i.parentElement.classList.add('shake'); setTimeout(() => i.parentElement.classList.remove('shake'), 400); i.focus(); return; }
    const fields = { title, date: ed.date, time: ed.time, rep: ed.rep, book: ed.book, cat: ed.cat || 'other', sub: ed.book ? '' : ed.sub, icon: ed.icon, hl: ed.hl, pin: ed.pin, unit: ed.unit, from1: !ed.rep && ed.from1 };
    if (edFor) { const x = find(edFor); if (x) MC.updateDay(x, fields); UI.close('dayEditor', true); UI.toast(T('已保存')); return; }
    const x = MC.addDay({ ...fields, cal: calId() });
    UI.close('dayEditor', true);
    if (st.cat && st.cat !== catOf(x)) { st.cat = ''; st.sub = ''; }
    render();
    openPage(x.id);
    UI.toast(F('已添加「{0}」，可以给它设一张主题图片', title));
  };

  // ---------- 刷新 ----------
  // 进出纪念日历：切换底部菜单（日历 · 纪念日 · 设置），进来时直接到「纪念日」
  let wasOn = null;
  function syncTabs() {
    const on = isOn(), tb = $('#tabbar');
    if (on === wasOn) return;
    const entering = on && wasOn !== null;
    wasOn = on;
    tb.querySelectorAll('button[data-page]').forEach(b => {
      const p = b.dataset.page;
      b.hidden = on ? !['cal', 'days', 'dsum', 'set'].includes(p) : p === 'days' || p === 'dsum';
    });
    body.classList.toggle('days-mode', on);
    if (!MC.App) return;
    const pg = MC.App.page();
    if (on && (entering || pg === 'today' || pg === 'quad' || pg === 'sched')) MC.App.showPage('days');
    else if (!on && (pg === 'days' || pg === 'dsum')) MC.App.showPage('cal');
    else MC.App.placeInd();
  }
  Days.paint = () => { syncTabs(); if (isOn()) render(); };
  Days.render = render;
  Days.refresh = () => { if (isOn()) render(); if (cur && Days.pageOpen()) { const s = pgScroll.scrollTop; renderPage(); pgScroll.scrollTop = s; } if (Days.refreshShare) Days.refreshShare(); };
  // 每秒更新精确时间；过了午夜重画
  let lastDay = MC.todayStr();
  setInterval(() => {
    if (MC.todayStr() !== lastDay) { lastDay = MC.todayStr(); Days.refresh(); return; }
    const els = document.querySelectorAll('[data-tick]'); if (!els.length) return;
    const now = new Date();
    els.forEach(el => { const x = find(el.dataset.tick); if (x) el.innerHTML = tickHTML(x, info(x, now), now); });
  }, 1000);

  // 和应用其他部分接起来：加号、数据变化、返回键、小组件链接
  const fab = $('#fab'), prevFab = fab.onclick;
  fab.onclick = e => (['cal', 'days', 'dsum'].includes(body.dataset.page) && isOn()
    ? openEditor(null, { date: body.dataset.page === 'cal' && st.cv === 'month' ? st.sel : MC.todayStr(), cat: body.dataset.page === 'days' ? st.cat : '' })
    : prevFab && prevFab.call(fab, e));
  const prevChange = MC.onChange;
  MC.onChange = () => { prevChange(); Days.refresh(); };
  const prevBack = MC.back;
  MC.back = () => (Days.closeOverlay && Days.closeOverlay()) || (!UI.anyOpen() && closePage()) || prevBack();
  const prevHash = MC.openHash;
  MC.openHash = h => {
    const m = /^#days(?:-(.+))?$/.exec(h || '');
    if (!m) return prevHash(h);
    const target = m[1] ? MC.data.days.find(x => x.id === m[1]) : null;
    const cal = (target && MC.cal(target.cal)) || MC.data.cals.find(c => c.kind === 'days');
    if (!cal) return;
    if (MC.activeCal() !== cal.id) { MC.setActiveCal(cal.id); MC.Drawer.paint(); }
    syncTabs();
    if (MC.App && MC.App.page() !== 'days') MC.App.showPage('days');
    render();
    if (target) setTimeout(() => openPage(target.id), 200);
  };
  syncTabs();
  if (/^#days/.test(location.hash)) { const h = location.hash; history.replaceState(null, '', location.pathname); setTimeout(() => MC.openHash(h), 60); }
  render();
})();

/* ---------- 分享图片、透明相机、照片查看 ---------- */
(() => {
  'use strict';
  const MC = window.MC, UI = MC.UI, $ = UI.$, esc = MC.esc, Days = MC.Days;
  const P = Days.parts;
  const { T, F, TT, FT, info, amount, stateWord, repLabel, fmtDate, toneHex, hlTone, ICONS, UI_IC } = P;
  const find = id => MC.data.days.find(x => x.id === id);
  const zh = /^zh/.test(P.LANG);

  // ---------- 画布工具 ----------
  const FONTS = {
    sans: '-apple-system, "SF Pro Display", "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif',
    round: 'ui-rounded, "SF Pro Rounded", "Hiragino Maru Gothic ProN", "PingFang SC", "Noto Sans SC", system-ui, sans-serif',
    serif: '"New York", ui-serif, "Songti SC", "Noto Serif SC", "Source Han Serif SC", Georgia, serif',
    mono: 'ui-monospace, "SF Mono", Menlo, "PingFang SC", monospace',
  };
  const FONT_NAMES = [['sans', '默认'], ['round', '圆体'], ['serif', '衬线'], ['mono', '等宽']];
  const font = (w, px, fam = 'sans') => `${w} ${Math.round(px)}px ${FONTS[fam] || FONTS.sans}`;
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  // 按宽度换行：中文按字，英文按词；超出行数加省略号
  function wrap(ctx, text, maxW, maxLines = 3) {
    const out = []; let line = '';
    const chars = Array.from(String(text || ''));
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      if (ch === '\n') { out.push(line); line = ''; continue; }
      const t = line + ch;
      if (ctx.measureText(t).width > maxW && line) {
        const sp = line.lastIndexOf(' ');
        if (/[A-Za-z0-9]/.test(ch) && sp > 0) { out.push(line.slice(0, sp)); line = line.slice(sp + 1) + ch; }
        else { out.push(line); line = ch.trim() ? ch : ''; }
      } else line = t;
    }
    if (line) out.push(line);
    if (out.length > maxLines) {
      const keep = out.slice(0, maxLines); let last = keep[maxLines - 1];
      while (last && ctx.measureText(last + '…').width > maxW) last = Array.from(last).slice(0, -1).join('');
      keep[maxLines - 1] = last + '…'; return keep;
    }
    return out;
  }
  function fitFont(ctx, text, maxW, maxPx, weight, fam) {
    let px = maxPx; ctx.font = font(weight, px, fam);
    const w = ctx.measureText(text).width;
    if (w > maxW) { px = Math.max(24, px * maxW / w); ctx.font = font(weight, px, fam); }
    return px;
  }
  // 磨砂玻璃：把画布上这一块缩小再放大，得到柔和的模糊
  function frost(ctx, x, y, w, h, r, tint) {
    const cv = ctx.canvas, s1 = 8, s2 = 28;
    const a = document.createElement('canvas'); a.width = Math.max(2, Math.round(w / s1)); a.height = Math.max(2, Math.round(h / s1));
    const b = document.createElement('canvas'); b.width = Math.max(2, Math.round(w / s2)); b.height = Math.max(2, Math.round(h / s2));
    const ax = a.getContext('2d'), bx = b.getContext('2d');
    ax.imageSmoothingQuality = bx.imageSmoothingQuality = 'high';
    ax.drawImage(cv, x, y, w, h, 0, 0, a.width, a.height);
    bx.drawImage(a, 0, 0, b.width, b.height);
    ax.clearRect(0, 0, a.width, a.height); ax.drawImage(b, 0, 0, a.width, a.height);
    ctx.save(); rr(ctx, x, y, w, h, r); ctx.clip();
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(a, x, y, w, h);
    ctx.fillStyle = tint; ctx.fillRect(x, y, w, h);
    ctx.restore();
    ctx.save(); rr(ctx, x + .5, y + .5, w - 1, h - 1, r); ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = Math.max(1, w / 500); ctx.stroke(); ctx.restore();
  }
  function cover(ctx, img, x, y, w, h) {
    const iw = img.naturalWidth || img.videoWidth || img.width, ih = img.naturalHeight || img.videoHeight || img.height;
    const k = Math.max(w / iw, h / ih), sw = w / k, sh = h / k;
    ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
  }
  function drawIcon(ctx, x, name, cx, cy, size, color, fam) {
    const ic = P.iconOf(x), col = P.catColor(x);
    ctx.save();
    if (ic) {
      ctx.translate(cx - size / 2, cy - size / 2); ctx.scale(size / 24, size / 24);
      ctx.strokeStyle = color === '#fff' ? '#fff' : col; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = 1.7; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ICONS[ic].forEach((d, i) => { const p2 = new Path2D(d); if (i === P.DUO[ic]) { ctx.globalAlpha = .16; ctx.fill(p2); ctx.globalAlpha = 1; } ctx.stroke(p2); });
    } else {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (x.icon) { ctx.font = `${Math.round(size * .9)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`; ctx.fillText(x.icon, cx, cy + size * .05); }
      else { ctx.fillStyle = color === '#fff' ? '#fff' : col; ctx.font = font(650, size * .78, fam); ctx.fillText(P.firstChar(x.title), cx, cy + size * .04); }
    }
    ctx.restore();
  }
  let appIcon = null;
  P.loadImg('icons/icon-192.png').then(i => (appIcon = i)).catch(() => {});

  // ---------- 分享图片的样式 ----------
  const TPLS = [['clean', '素白'], ['night', '夜'], ['tone', '色块'], ['photo', '照片'], ['note', '纸条'], ['type', '留白']];
  const RATIOS = [['45', '4:5', 1080, 1350], ['916', '9:16', 1080, 1920], ['11', '1:1', 1080, 1080]];
  const PAL = {
    light: { bg: '#EEF2F6', card: '#FFFFFF', text: '#171B20', text2: '#6E757E', line: 'rgba(20,40,70,.09)' },
    dark: { bg: '#07080B', card: '#15161B', text: '#EEEEF1', text2: '#8F929B', line: 'rgba(236,238,250,.09)' },
  };
  const TONE_HEX = { fut: ['#4776B4', '#8EB0E6'], today: ['#4776B4', '#8EB0E6'], past: ['#B6733B', '#E2A673'] };
  const toneOf = (st, darkMode) => TONE_HEX[st][darkMode ? 1 : 0];
  const hlOf = (c, darkMode) => (darkMode ? MC.darkTone(c)[0] : c);

  // 主体：图标 + 名称 + 还有/已经 + 大数字 + 日期；dry = 只量高度
  function block(ctx, x, o, X, Y, W, pal, dry) {
    const inf = info(x), a = amount(x, inf), pad = W * .085, fam = o.font;
    const tone = x.hl ? hlOf(x.hl, o.dark) : toneOf(inf.state, o.dark);
    let y = Y + pad;
    const s = W * .12;
    if (!dry) {
      ctx.save(); rr(ctx, X + pad, y, s, s, s * .3); ctx.fillStyle = o.onImage ? '#fff' : P.catColor(x); ctx.globalAlpha = o.onImage ? .22 : .13; ctx.fill(); ctx.restore();
      drawIcon(ctx, x, '', X + pad + s / 2, y + s / 2, s * .56, o.onImage ? '#fff' : tone, fam);
    }
    ctx.font = font(650, W * .056); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    const tl = wrap(ctx, x.title, W - pad * 2 - s - W * .04, 2);
    const lh = W * .07, th = tl.length * lh;
    if (!dry) { ctx.fillStyle = pal.text; tl.forEach((l, i) => ctx.fillText(l, X + pad + s + W * .04, y + s / 2 - th / 2 + lh * (i + .78))); }
    y += Math.max(s, th) + W * .075;
    if (!a.today) {
      ctx.font = font(650, W * .045);
      if (!dry) { ctx.fillStyle = tone; ctx.fillText(TT(stateWord(x, inf)), X + pad, y + W * .04); }
      y += W * .06;
    }
    const num = String(a.num), unit = TT(a.unit);
    ctx.font = font(650, W * .075, fam); const uw = unit ? ctx.measureText(unit).width + W * .025 : 0;
    const px = fitFont(ctx, num, W - pad * 2 - uw, W * (a.today ? .2 : .3), 750, fam);
    if (!dry) {
      ctx.fillStyle = a.today ? tone : pal.text; ctx.font = font(750, px, fam);
      ctx.fillText(num, X + pad - px * .03, y + px * .82);
      const nw = ctx.measureText(num).width;
      if (unit) { ctx.font = font(650, W * .075, fam); ctx.fillStyle = pal.text2; ctx.fillText(unit, X + pad + nw + W * .02, y + px * .82); }
    }
    y += px * .98;
    if (a.rest) { ctx.font = font(500, W * .038); if (!dry) { ctx.fillStyle = pal.text2; ctx.fillText(TT(T('又')) + ' ' + TT(a.rest), X + pad, y + W * .03); } y += W * .055; }
    y += W * .045;
    if (!dry) { ctx.fillStyle = pal.line; ctx.fillRect(X + pad, y, W - pad * 2, Math.max(1, W / 540)); }
    y += W * .05;
    ctx.font = font(500, W * .036);
    const dl = TT(P.fmtDateTime(inf.occ, x.time)) + (x.rep ? ' · ' + TT(repLabel(x.rep)) : '');
    if (!dry) { ctx.fillStyle = pal.text2; ctx.fillText(dl, X + pad, y + W * .03); }
    y += W * .04;
    if (inf.prog !== null && !o.noProg) {
      y += W * .04;
      if (!dry) {
        ctx.save(); rr(ctx, X + pad, y, W - pad * 2, W * .009, W * .005); ctx.fillStyle = pal.line; ctx.fill();
        rr(ctx, X + pad, y, Math.max(W * .009, (W - pad * 2) * inf.prog), W * .009, W * .005); ctx.fillStyle = tone; ctx.fill(); ctx.restore();
      }
      y += W * .009;
    }
    return y + pad - Y;
  }
  function brand(ctx, X, Y, W, color, align = 'left') {
    const s = W * .045, label = /^zh/.test(P.LANG) ? TT('节律') + ' · Cadence' : 'Cadence';
    ctx.font = font(600, W * .03); ctx.textBaseline = 'middle';
    const tw = ctx.measureText(label).width, total = s + W * .02 + tw;
    const x0 = align === 'left' ? X : align === 'right' ? X - total : X - total / 2;
    if (appIcon) { ctx.save(); rr(ctx, x0, Y - s / 2, s, s, s * .26); ctx.clip(); ctx.drawImage(appIcon, x0, Y - s / 2, s, s); ctx.restore(); }
    ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.fillText(label, x0 + s + W * .02, Y); ctx.textBaseline = 'alphabetic';
  }
  async function avatarImg() {
    const a = MC.data.profile.avatar;
    if (!a || !/^data:image\//.test(a)) return null;
    try { return await P.loadImg(a); } catch (e) { return null; }
  }

  async function render(x, o) {
    const [, , W, H] = RATIOS.find(r => r[0] === o.ratio) || RATIOS[0];
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    const inf = info(x), dk = o.tpl === 'night';
    o.dark = dk;
    if (o.tpl === 'clean' || o.tpl === 'night' || o.tpl === 'note') {
      const pal = dk ? PAL.dark : PAL.light;
      ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, W, H);
      const cw = W * .84, cx = (W - cw) / 2;
      let ch = block(ctx, x, o, cx, 0, cw, pal, true);
      let note = null, nlines = [], av = null;
      if (o.tpl === 'note') {
        note = x.notes.find(n => n.id === o.note) || [...x.notes].sort((a, b) => b.at - a.at)[0] || null;
        if (note) { ctx.font = font(500, cw * .042); nlines = wrap(ctx, note.text, cw * .83, o.ratio === '916' ? 16 : o.ratio === '11' ? 6 : 10); av = await avatarImg(); ch += cw * .2 + nlines.length * cw * .068; }
      }
      const cy = Math.max(W * .08, (H - ch) / 2 - W * .03);
      ctx.save(); ctx.shadowColor = dk ? 'rgba(0,0,0,.6)' : 'rgba(30,45,70,.10)'; ctx.shadowBlur = W * .06; ctx.shadowOffsetY = W * .02;
      rr(ctx, cx, cy, cw, ch, cw * .075); ctx.fillStyle = pal.card; ctx.fill(); ctx.restore();
      let y = cy + block(ctx, x, o, cx, cy, cw, pal, false);
      if (note) {
        const pad = cw * .085; y -= pad - cw * .02;
        ctx.fillStyle = pal.line; ctx.fillRect(cx + pad, y, cw - pad * 2, Math.max(1, W / 540)); y += cw * .06;
        const as = cw * .075, name = MC.data.profile.name || TT(T('我'));
        ctx.save(); ctx.beginPath(); ctx.arc(cx + pad + as / 2, y + as / 2, as / 2, 0, Math.PI * 2); ctx.closePath();
        if (av) { ctx.clip(); cover(ctx, av, cx + pad, y, as, as); } else { ctx.fillStyle = toneOf(inf.state, o.dark); ctx.globalAlpha = .18; ctx.fill(); ctx.globalAlpha = 1; ctx.fillStyle = toneOf(inf.state, o.dark); ctx.font = font(650, as * .5); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(P.firstChar(name), cx + pad + as / 2, y + as / 2); }
        ctx.restore(); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.font = font(650, cw * .04); ctx.fillStyle = pal.text; ctx.fillText(FT('{0}的小纸条', name), cx + pad + as + cw * .03, y + as * .42);
        ctx.font = font(500, cw * .032); ctx.fillStyle = pal.text2; ctx.fillText(TT(fmtDate(new Date(note.at))), cx + pad + as + cw * .03, y + as * .92);
        y += as + cw * .06;
        ctx.font = font(500, cw * .042); ctx.fillStyle = pal.text;
        nlines.forEach((l, i) => ctx.fillText(l, cx + pad, y + cw * .045 + i * cw * .068));
      }
      brand(ctx, W / 2, Math.min(H - W * .06, cy + ch + (H - cy - ch) / 2), W, pal.text2, 'center');
    } else if (o.tpl === 'tone') {
      const c = x.hl || toneOf(inf.state, false);
      ctx.fillStyle = c; ctx.fillRect(0, 0, W, H);
      const a = amount(x, inf), pad = W * .09;
      ctx.fillStyle = '#fff'; ctx.textAlign = 'left';
      ctx.font = font(650, W * .062); const tl = wrap(ctx, x.title, W - pad * 2 - W * .26, 3);
      tl.forEach((l, i) => ctx.fillText(l, pad, pad + W * .07 + i * W * .08));
      ctx.globalAlpha = .78; ctx.font = font(600, W * .046); ctx.fillText(a.today ? TT(T('就是今天')) : TT(stateWord(x, inf)), pad, pad + W * .07 + tl.length * W * .08 + W * .02); ctx.globalAlpha = 1;
      const num = String(a.num), px = fitFont(ctx, num, W - pad * 2, W * (a.today ? .3 : .52), 760, o.font);
      ctx.font = font(760, px, o.font); const ny = H * .5 + px * .36;
      ctx.fillText(num, pad - px * .04, ny);
      if (a.unit) { ctx.font = font(650, W * .08, o.font); ctx.globalAlpha = .82; ctx.fillText(TT(a.unit) + (a.rest ? '  ' + TT(T('又')) + ' ' + TT(a.rest) : ''), pad, ny + W * .11); ctx.globalAlpha = 1; }
      ctx.font = font(500, W * .036); ctx.globalAlpha = .78;
      ctx.fillText(TT(P.fmtDateTime(inf.occ, x.time)) + (x.rep ? ' · ' + TT(repLabel(x.rep)) : ''), pad, H - pad - W * .02);
      ctx.globalAlpha = .7; brand(ctx, W - pad, pad + W * .02, W, '#fff', 'right'); ctx.globalAlpha = 1;
    } else if (o.tpl === 'type') {
      const paper = '#F7F6F2', ink = '#1B1B1A', ink2 = '#7A776F', pad = W * .09, a = amount(x, inf), fam = o.font === 'sans' ? 'serif' : o.font;
      ctx.fillStyle = paper; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = ink2; ctx.font = font(600, W * .03); ctx.textAlign = 'left';
      ctx.fillText(TT(P.fmtDate(new Date())), pad, pad + W * .02);
      ctx.fillStyle = ink; ctx.fillRect(pad, pad + W * .05, W - pad * 2, Math.max(2, W / 400));
      ctx.font = font(650, W * .07, fam); const tl = wrap(ctx, x.title, W - pad * 2, 3);
      tl.forEach((l, i) => ctx.fillText(l, pad, pad + W * .17 + i * W * .088));
      ctx.fillStyle = x.hl || toneOf(inf.state, false); ctx.font = font(600, W * .045, fam);
      ctx.fillText(a.today ? TT(T('就是今天')) : TT(stateWord(x, inf)), pad, pad + W * .17 + tl.length * W * .088 + W * .015);
      const num = String(a.num), px = fitFont(ctx, num, W - pad * 2, W * .62, 400, fam);
      ctx.fillStyle = ink; ctx.font = font(400, px, fam);
      const by = H - pad - W * .2;
      ctx.fillText(num, pad - px * .05, by);
      ctx.font = font(500, W * .06, fam); ctx.fillText(TT(a.unit), pad, by + W * .1);
      ctx.fillStyle = ink2; ctx.font = font(500, W * .034); ctx.textAlign = 'right';
      ctx.fillText(TT(P.fmtDateTime(inf.occ, x.time)), W - pad, by + W * .1);
      ctx.textAlign = 'left'; ctx.fillStyle = ink; ctx.fillRect(pad, H - pad - W * .045, W - pad * 2, Math.max(2, W / 400));
      brand(ctx, pad, H - pad, W, ink2, 'left');
    } else if (o.tpl === 'photo') {
      ctx.fillStyle = '#111'; ctx.fillRect(0, 0, W, H);
      if (o.bg) cover(ctx, o.bg, 0, 0, W, H);
      const cw = W * .84, cx = (W - cw) / 2;
      const pal = { text: '#fff', text2: 'rgba(255,255,255,.78)', line: 'rgba(255,255,255,.25)' };
      const oo = { ...o, onImage: true, noProg: true };
      const ch = block(ctx, x, oo, cx, 0, cw, pal, true), cy = H - ch - W * .14;
      frost(ctx, cx, cy, cw, ch, cw * .075, 'rgba(20,22,28,.26)');
      block(ctx, x, oo, cx, cy, cw, pal, false);
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = W * .01; brand(ctx, W / 2, H - W * .07, W, 'rgba(255,255,255,.92)', 'center'); ctx.restore();
    }
    return cv;
  }

  // 保存 / 分享：系统分享面板 → App 原生保存 → 浏览器下载
  async function deliver(cv, name, type = 'image/png') {
    const blob = await new Promise(r => cv.toBlob(r, type, .92));
    if (!blob) { UI.toast(T('图片生成失败')); return; }
    const file = new File([blob], name, { type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    if (MC.Native.on && MC.Native.has('saveImage')) {
      const r = await MC.Native.saveFile(name, type, cv.toDataURL(type, .92));
      UI.toast(r && r.ok ? T('已保存') : T('没有保存'));
      return;
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    UI.toast(T('图片已下载'));
  }
  const fileName = x => `${(x.title || 'cadence').replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 30)}-${MC.todayStr()}`;

  // ---------- 分享面板 ----------
  const sh = { id: null, tpl: 'clean', ratio: '45', font: 'sans', note: '', bgId: '', bgImg: null, cv: null, url: '' };
  const opts = $('#dsOpts'), img = $('#dsImg');
  Days.openShare = (x, extra = {}) => {
    sh.id = x.id; sh.note = extra.note || ''; sh.tpl = extra.note ? 'note' : extra.bg ? 'photo' : (sh.tpl === 'note' && !x.notes.length) || (sh.tpl === 'photo' && !x.photos.length && !/^p/.test(x.cover || '')) ? 'clean' : sh.tpl;
    sh.bgId = extra.bg || (/^p/.test(x.cover || '') ? x.cover : '') || (x.photos[0] && x.photos[0].id) || ''; sh.bgImg = null;
    UI.open('dayShare'); paintOpts(); draw();
  };
  Days.refreshShare = () => { if (UI.isOpen('dayShare') && find(sh.id)) { paintOpts(); draw(); } };
  function paintOpts() {
    const x = find(sh.id); if (!x) return;
    const chips = (list, key, cur) => list.map(([v, l]) => `<button class="qchip${cur === v ? ' on' : ''}" data-${key}="${v}">${T(l)}</button>`).join('');
    let h = `<p class="cmp-label">${T('样式')}</p><div class="cmp-chips ds-row">${chips(TPLS, 'tpl', sh.tpl)}</div>
      <p class="cmp-label">${T('尺寸')}</p><div class="seg small ds-seg">${RATIOS.map(r => `<button data-ratio="${r[0]}" class="${sh.ratio === r[0] ? 'on' : ''}">${r[1]}</button>`).join('')}</div>
      <p class="cmp-label">${T('数字字体')}</p><div class="cmp-chips">${chips(FONT_NAMES, 'font', sh.font)}</div>`;
    if (sh.tpl === 'photo') h += `<p class="cmp-label">${T('背景照片')}</p><div class="ds-bgs">${[...(/^p/.test(x.cover || '') && !x.photos.some(p => p.id === x.cover) ? [{ id: x.cover }] : []), ...x.photos].map(p => `<button class="ds-bg${sh.bgId === p.id ? ' on' : ''}" data-bg="${p.id}"><img alt="" data-src="${p.id}"></button>`).join('')}<button class="ds-bg add" data-bgpick aria-label="${T('选择照片')}">${UI_IC.plus}</button></div>`;
    if (sh.tpl === 'note') h += x.notes.length ? `<p class="cmp-label">${T('小纸条')}</p><div class="cmp-chips">${[...x.notes].sort((a, b) => b.at - a.at).map((n, i) => `<button class="qchip${(sh.note ? sh.note === n.id : i === 0) ? ' on' : ''}" data-note="${n.id}"><span data-uc>${esc(n.text.slice(0, 12))}${n.text.length > 12 ? '…' : ''}</span></button>`).join('')}</div>` : `<p class="dd-hint">${T('还没有小纸条，先在详情里写一张吧。')}</p>`;
    opts.innerHTML = h;
    opts.querySelectorAll('img[data-src]').forEach(async i => { const u = await P.photoURL(i.dataset.src); if (u) i.src = u; });
  }
  let drawSeq = 0;
  async function draw() {
    const x = find(sh.id); if (!x) return;
    const seq = ++drawSeq;
    $('#dsStage').classList.add('busy');
    if (sh.tpl === 'photo' && sh.bgId && !sh.bgImg) { const u = await P.photoURL(sh.bgId); if (u) try { sh.bgImg = await P.loadImg(u); } catch (e) {} }
    const cv = await render(x, { tpl: sh.tpl, ratio: sh.ratio, font: sh.font, note: sh.note, bg: sh.bgImg });
    if (seq !== drawSeq) return;
    sh.cv = cv;
    cv.toBlob(b => { if (seq !== drawSeq || !b) return; if (sh.url) URL.revokeObjectURL(sh.url); sh.url = URL.createObjectURL(b); img.src = sh.url; $('#dsStage').classList.remove('busy'); $('#dsStage').dataset.ratio = sh.ratio; }, 'image/jpeg', .9);
  }
  opts.addEventListener('click', e => {
    const t = e.target, b = t.closest('button'); if (!b) return;
    if (b.dataset.tpl) { sh.tpl = b.dataset.tpl; if (sh.tpl === 'photo' && !sh.bgId) { $('#dayBgFile').value = ''; $('#dayBgFile').click(); } }
    else if (b.dataset.ratio) sh.ratio = b.dataset.ratio;
    else if (b.dataset.font) sh.font = b.dataset.font;
    else if (b.dataset.note) sh.note = b.dataset.note;
    else if (b.dataset.bg) { sh.bgId = b.dataset.bg; sh.bgImg = null; }
    else if (b.hasAttribute('data-bgpick')) { $('#dayBgFile').value = ''; $('#dayBgFile').click(); return; }
    else return;
    paintOpts(); draw();
  });
  // 背景照片：选一张，顺便存进这个日子的相册
  $('#dayBgFile').addEventListener('change', async () => {
    const f = $('#dayBgFile').files[0]; if (!f) return;
    if (camCtx) { camUseImage(f); return; }
    const x = find(sh.id); if (!x) return;
    await P.addPhotos(x, [f]);
    const nx = find(sh.id); sh.bgId = nx && nx.photos[0] ? nx.photos[0].id : ''; sh.bgImg = null; sh.tpl = 'photo';
    paintOpts(); draw();
  });
  $('#dsSave').onclick = async () => { const x = find(sh.id); if (x && sh.cv) await deliver(sh.cv, fileName(x) + (sh.tpl === 'photo' ? '.jpg' : '.png'), sh.tpl === 'photo' ? 'image/jpeg' : 'image/png'); };

  // ---------- 透明相机 ----------
  let camCtx = null; // { id, stream, facing, style, font, pos:{x,y}, scale, bgImg }
  const CAM_STYLES = [['glass', '玻璃'], ['clear', '透明'], ['light', '浅色'], ['dark', '深色']];
  function camCardHTML(x) {
    const inf = info(x), a = amount(x, inf);
    const head = a.today ? T('就是今天') : (zh ? x.title + stateWord(x, inf) : `${x.title} · ${stateWord(x, inf)}`);
    return `<small class="cc-head" data-uc>${esc(a.today ? x.title : head)}</small>
      <span class="cc-row"><b class="cc-num">${a.today ? T('今天') : a.num}</b>${a.unit ? `<i class="cc-unit">${a.unit}</i>` : ''}</span>
      <small class="cc-date">${esc(P.fmtDateTime(inf.occ, x.time))}</small>`;
  }
  Days.openCam = async x => {
    closeCam();
    const el = document.createElement('div');
    el.className = 'cam'; el.id = 'dayCam';
    el.innerHTML = `<div class="cam-view"><video playsinline muted autoplay></video><img class="cam-bg" alt="" hidden><div class="cam-msg" hidden></div>
        <div class="cam-card st-glass f-sans" role="img">${camCardHTML(x)}</div></div>
      <div class="cam-top"><button class="cam-btn" data-c="close" aria-label="${T('关闭')}">${UI_IC.close}</button>
        <div class="cam-chips" data-group="style">${CAM_STYLES.map(([v, l], i) => `<button data-style="${v}" class="${i === 0 ? 'on' : ''}">${T(l)}</button>`).join('')}</div></div>
      <div class="cam-fonts cam-chips" data-group="font">${FONT_NAMES.map(([v, l], i) => `<button data-font="${v}" class="${i === 0 ? 'on' : ''}">${T(l)}</button>`).join('')}</div>
      <div class="cam-bottom"><button class="cam-btn" data-c="album" aria-label="${T('从相册选择')}">${UI_IC.photo}</button>
        <button class="cam-shutter" data-c="shot" aria-label="${T('拍摄')}"><span></span></button>
        <button class="cam-btn" data-c="flip" aria-label="${T('切换镜头')}">${UI_IC.flip}</button></div>
      <p class="cam-tip">${T('拖动卡片调整位置，双指缩放大小')}</p>`;
    document.body.appendChild(el);
    camCtx = { id: x.id, el, stream: null, facing: 'environment', style: 'glass', font: 'sans', pos: null, scale: 1, bgImg: null, bgFile: null };
    requestAnimationFrame(() => el.classList.add('show'));
    bindCam(el);
    await startStream();
  };
  async function startStream() {
    const c = camCtx; if (!c) return;
    if (c.stream) c.stream.getTracks().forEach(t => t.stop());
    c.stream = null;
    const v = c.el.querySelector('video'), msg = c.el.querySelector('.cam-msg');
    if (c.bgImg) return;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('nocam');
      c.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: c.facing, width: { ideal: 1920 }, height: { ideal: 1920 } }, audio: false });
      if (camCtx !== c) { c.stream.getTracks().forEach(t => t.stop()); return; }
      v.srcObject = c.stream; v.hidden = false; msg.hidden = true;
      v.classList.toggle('mirror', c.facing === 'user');
      await v.play().catch(() => {});
    } catch (e) {
      v.hidden = true; msg.hidden = false;
      msg.innerHTML = `<b>${T('没法打开相机')}</b><span>${T('可以允许使用相机后再试，或者从相册选一张照片当背景。')}</span><button class="chip-btn glass" data-c="album">${T('从相册选择')}</button>`;
    }
  }
  function camUseImage(f) {
    const c = camCtx; if (!c) return;
    const u = URL.createObjectURL(f);
    P.loadImg(u).then(im => {
      c.bgImg = im; c.bgFile = f;
      if (c.stream) { c.stream.getTracks().forEach(t => t.stop()); c.stream = null; }
      const bg = c.el.querySelector('.cam-bg'); bg.src = u; bg.hidden = false;
      c.el.querySelector('video').hidden = true; c.el.querySelector('.cam-msg').hidden = true;
    }).catch(() => UI.toast(T('照片读取失败')));
  }
  function closeCam() {
    const c = camCtx; if (!c) return false;
    if (c.stream) c.stream.getTracks().forEach(t => t.stop());
    c.el.classList.remove('show'); setTimeout(() => c.el.remove(), 260);
    camCtx = null; return true;
  }
  function bindCam(el) {
    const card = el.querySelector('.cam-card'), view = el.querySelector('.cam-view');
    const place = () => { const c = camCtx; if (!c) return; const p = c.pos || { x: .5, y: .64 }; card.style.left = (p.x * 100) + '%'; card.style.top = (p.y * 100) + '%'; card.style.transform = `translate(-50%,-50%) scale(${c.scale})`; };
    place();
    el.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b || !camCtx) return;
      const c = camCtx;
      if (b.dataset.style) { c.style = b.dataset.style; card.className = card.className.replace(/st-\w+/, 'st-' + c.style); b.parentElement.querySelectorAll('button').forEach(y => y.classList.toggle('on', y === b)); return; }
      if (b.dataset.font) { c.font = b.dataset.font; card.className = card.className.replace(/f-\w+/, 'f-' + c.font); b.parentElement.querySelectorAll('button').forEach(y => y.classList.toggle('on', y === b)); return; }
      const a = b.dataset.c;
      if (a === 'close') closeCam();
      else if (a === 'flip') { if (c.bgImg) { c.bgImg = null; c.el.querySelector('.cam-bg').hidden = true; } else c.facing = c.facing === 'user' ? 'environment' : 'user'; startStream(); }
      else if (a === 'album') { $('#dayBgFile').value = ''; $('#dayBgFile').click(); }
      else if (a === 'shot') shoot();
      else if (a === 'retake') { el.querySelector('.cam-res').remove(); el.classList.remove('done'); }
      else if (a === 'keep') saveShot(true);
      else if (a === 'send') saveShot(false);
    });
    // 拖动、双指缩放
    const pts = new Map(); let start = null;
    card.addEventListener('pointerdown', e => {
      card.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
      const r = view.getBoundingClientRect(), c = camCtx, p = c.pos || { x: .5, y: .64 };
      start = { p: { ...p }, r, s: c.scale, pts: new Map(pts), d: pts.size > 1 ? dist() : 0 };
    });
    const dist = () => { const [a, b] = [...pts.values()]; return Math.hypot(a[0] - b[0], a[1] - b[1]); };
    card.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId) || !start || !camCtx) return;
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      const c = camCtx;
      if (pts.size > 1) { if (!start.d) { start.d = dist(); start.s = c.scale; } c.scale = Math.max(.55, Math.min(2.2, start.s * dist() / start.d)); }
      else { const o = start.pts.get(e.pointerId); if (!o) return; c.pos = { x: Math.max(.08, Math.min(.92, start.p.x + (e.clientX - o[0]) / start.r.width)), y: Math.max(.08, Math.min(.92, start.p.y + (e.clientY - o[1]) / start.r.height)) }; }
      place();
    });
    const up = e => { pts.delete(e.pointerId); if (camCtx) start = { p: { ...(camCtx.pos || { x: .5, y: .64 }) }, r: view.getBoundingClientRect(), s: camCtx.scale, pts: new Map(pts), d: pts.size > 1 ? dist() : 0 }; };
    card.addEventListener('pointerup', up); card.addEventListener('pointercancel', up);
  }
  // 拍摄：把屏幕上看到的画面（裁切后的相机画面或照片）和卡片一起画到画布上
  function shoot() {
    const c = camCtx; if (!c) return;
    const el = c.el, view = el.querySelector('.cam-view'), vr = view.getBoundingClientRect();
    const src = c.bgImg || el.querySelector('video');
    const iw = src.naturalWidth || src.videoWidth, ih = src.naturalHeight || src.videoHeight;
    if (!iw || !ih) { UI.toast(T('相机还没准备好')); return; }
    const k = Math.max(vr.width / iw, vr.height / ih), sw = vr.width / k, sh0 = vr.height / k;
    const s = Math.min(2560 / Math.max(sw, sh0), Math.max(1, 1440 / Math.min(sw, sh0)));
    const cv = document.createElement('canvas'); cv.width = Math.round(sw * s); cv.height = Math.round(sh0 * s);
    const ctx = cv.getContext('2d'), f = cv.width / vr.width;
    ctx.save();
    if (!c.bgImg && c.facing === 'user') { ctx.translate(cv.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(src, (iw - sw) / 2, (ih - sh0) / 2, sw, sh0, 0, 0, cv.width, cv.height);
    ctx.restore();
    const card = el.querySelector('.cam-card'), cr = card.getBoundingClientRect(), cs = getComputedStyle(card);
    const X = (cr.left - vr.left) * f, Y = (cr.top - vr.top) * f, W = cr.width * f, H = cr.height * f, rad = parseFloat(cs.borderTopLeftRadius) * c.scale * f;
    if (c.style === 'glass') frost(ctx, X, Y, W, H, rad, 'rgba(255,255,255,.14)');
    else if (c.style === 'light') { rr(ctx, X, Y, W, H, rad); ctx.fillStyle = 'rgba(255,255,255,.88)'; ctx.fill(); }
    else if (c.style === 'dark') { rr(ctx, X, Y, W, H, rad); ctx.fillStyle = 'rgba(12,12,16,.58)'; ctx.fill(); }
    card.querySelectorAll('.cc-head, .cc-num, .cc-unit, .cc-date').forEach(n => {
      const r = n.getBoundingClientRect(), st = getComputedStyle(n);
      const px = parseFloat(st.fontSize) * c.scale * f;
      ctx.save();
      ctx.font = `${st.fontWeight} ${px}px ${st.fontFamily}`; ctx.fillStyle = st.color; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      if (c.style === 'clear') { ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = px * .25; ctx.shadowOffsetY = px * .04; }
      const tx = TT(n.textContent.trim()), tw = ctx.measureText(tx).width, rw = r.width * f;
      ctx.fillText(tx, (r.left - vr.left) * f + Math.max(0, (rw - tw) / 2), (r.top - vr.top + r.height / 2) * f);
      ctx.restore();
    });
    c.shot = cv;
    const res = document.createElement('div'); res.className = 'cam-res';
    res.innerHTML = `<img alt="">
      <div class="cam-res-bar"><button class="chip-btn" data-c="retake">${T('重拍')}</button>
      <button class="chip-btn" data-c="keep">${UI_IC.photo}<span>${T('存进相册')}</span></button>
      <button class="chip-btn accent" data-c="send">${UI_IC.share}<span>${T('保存 / 分享')}</span></button></div>`;
    cv.toBlob(b => { if (b) res.querySelector('img').src = URL.createObjectURL(b); }, 'image/jpeg', .9);
    el.appendChild(res); el.classList.add('done');
    try { navigator.vibrate && navigator.vibrate(10); } catch (e) {}
  }
  async function saveShot(toAlbum) {
    const c = camCtx; if (!c || !c.shot) return;
    const x = find(c.id); if (!x) return;
    if (toAlbum) {
      const b = await new Promise(r => c.shot.toBlob(r, 'image/jpeg', .92));
      if (b) { await P.addPhotos(x, [new File([b], 'cadence.jpg', { type: 'image/jpeg' })]); }
      return;
    }
    await deliver(c.shot, fileName(x) + '.jpg', 'image/jpeg');
  }

  // ---------- 照片查看 ----------
  let vw = null;
  Days.openViewer = (x, i) => {
    closeViewer();
    const el = document.createElement('div'); el.className = 'pv'; el.id = 'dayViewer';
    el.innerHTML = `<div class="pv-top"><button class="cam-btn" data-v="close" aria-label="${T('关闭')}">${UI_IC.close}</button><span class="pv-count"></span><button class="cam-btn" data-v="more" aria-label="${T('更多')}">${UI_IC.more}</button></div>
      <div class="pv-track">${x.photos.map(p => `<div class="pv-slide"><img alt="" data-src="${p.id}"></div>`).join('')}</div>`;
    document.body.appendChild(el);
    vw = { el, id: x.id, i };
    const track = el.querySelector('.pv-track');
    const count = () => { const n = Math.round(track.scrollLeft / track.clientWidth); vw.i = n; el.querySelector('.pv-count').textContent = `${n + 1} / ${x.photos.length}`; };
    track.addEventListener('scroll', () => requestAnimationFrame(count), { passive: true });
    requestAnimationFrame(() => { track.scrollLeft = i * track.clientWidth; count(); el.classList.add('show'); });
    el.querySelectorAll('img[data-src]').forEach(async im => { const u = await P.photoURL(im.dataset.src); if (u) im.src = u; });
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-v]'); if (!b) return;
      const nx = find(vw.id); const p = nx && nx.photos[vw.i]; if (!p) { closeViewer(); return; }
      if (b.dataset.v === 'close') closeViewer();
      else UI.menu(b, [{ label: T('用它做分享图片'), value: 'bg' }, { label: T('保存 / 分享'), value: 'share' }, { label: T('删除照片'), value: 'del' }], async v => {
        if (v === 'bg') { closeViewer(); Days.openShare(nx, { bg: p.id }); }
        else if (v === 'share') {
          const u = await P.photoURL(p.id); if (!u) return;
          const im = await P.loadImg(u); const cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight; cv.getContext('2d').drawImage(im, 0, 0);
          deliver(cv, fileName(nx) + '.jpg', 'image/jpeg');
        } else if (confirm(T('删除这张照片？其他设备同步后也会删除。'))) { await P.removePhoto(nx, p.id); closeViewer(); }
      });
    });
  };
  function closeViewer() { if (!vw) return false; const el = vw.el; el.classList.remove('show'); setTimeout(() => el.remove(), 220); vw = null; return true; }
  Days.closeOverlay = () => (UI.menuOpen() ? (UI.closeMenu(), true) : false) || closeViewer() || closeCam();
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !UI.menuOpen() && (vw || camCtx)) { closeViewer() || closeCam(); } });
})();
