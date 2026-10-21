import Foundation

/// 小组件、菜单栏和原生通知的多语言（和网页一致：同步数据 profile.lang；auto = 跟随系统语言）。
/// 原文用简体中文作键，{0} 是占位。
enum I18n {
    private(set) static var lang = "zh-Hans"
    static var zh: Bool { lang.hasPrefix("zh") }

    /// 原文 → [繁體, English, Français]
    private static let T: [String: [String]] = [
        "讲座": ["講座", "Lecture", "Cours magistral"],
        "实验": ["實驗", "Lab", "TP"],
        "辅导": ["輔導", "Tutorial", "TD"],
        "讨论课": ["討論課", "Discussion", "Discussion"],
        "研讨": ["研討", "Seminar", "Séminaire"],
        "（无标题）": ["（無標題）", "(No title)", "(Sans titre)"],
        "今天 · {0}": ["今天 · {0}", "Today · {0}", "Aujourd’hui · {0}"],
        "明天 · {0}": ["明天 · {0}", "Tomorrow · {0}", "Demain · {0}"],
        "后天 · {0}": ["後天 · {0}", "In 2 days · {0}", "Après-demain · {0}"],
        "今天": ["今天", "Today", "Aujourd’hui"],
        "明天": ["明天", "Tomorrow", "Demain"],
        "昨天": ["昨天", "Yesterday", "Hier"],
        "{0} 天后": ["{0} 天後", "In {0} days", "Dans {0} jours"],
        "{0} 天前": ["{0} 天前", "{0} days ago", "Il y a {0} jours"],
        "已逾期": ["已逾期", "Overdue", "En retard"],
        "今天没有事件\n接下来一周也很空闲": ["今天沒有事件\n接下來一週也很空閒", "Nothing today\nand a quiet week ahead", "Rien aujourd’hui\net une semaine calme"],
        "打开节律 App\n同步一次后这里会显示事件": ["開啟節律 App\n同步一次後這裡會顯示事件", "Open Cadence\nand sync once to see events here", "Ouvrez Cadence\net synchronisez une fois pour voir vos événements"],
        "全天": ["全天", "All day", "Toute la journée"],
        "{0} 天": ["{0} 天", "{0} days", "{0} jours"],
        "本周课表": ["本週課表", "This week", "Cette semaine"],
        "还没有导入课表": ["還沒有匯入課表", "No timetable imported yet", "Aucun horaire importé"],
        "课表": ["課表", "Timetable", "Horaire"],
        "这周没有课": ["這周沒有課", "No classes this week", "Aucun cours cette semaine"],
        "上课中": ["上課中", "In class", "En cours"],
        "下一节": ["下一節", "Next class", "Cours suivant"],
        "第一节": ["第一節", "First class", "Premier cours"],
        "查看今日未完成事件": ["檢視今日未完成事件", "Check today’s open events", "Voir les tâches du jour"],
        "今日事件已完成": ["今日事件已完成", "All done today", "Tout est fait aujourd’hui"],
        "今天还有 {0} 件事未完成，点开查看。": ["今天還有 {0} 件事未完成，點開檢視。", "{0} things are still open today — click to see them.", "Encore {0} choses à faire aujourd’hui — cliquez pour les voir."],
        "今天的事件都完成了。": ["今天的事件都完成了。", "Everything for today is done.", "Tout est fait pour aujourd’hui."],
        "节律 · 后台提醒测试": ["節律 · 後臺提醒測試", "Cadence · Background reminder test", "Cadence · Test de rappel en arrière-plan"],
        "节律 · 测试通知": ["節律 · 測試通知", "Cadence · Test notification", "Cadence · Notification test"],
        "App 关着也能准时收到提醒。": ["App 關著也能準時收到提醒。", "Reminders arrive on time even when the app is closed.", "Les rappels arrivent à l’heure même app fermée."],
        "通知可以正常显示了": ["通知可以正常顯示了", "Notifications are working", "Les notifications fonctionnent"],
        "连不上网络": ["連不上網路", "No connection", "Pas de connexion"],
        "第一次打开需要联网下载节律，之后断网也能用。": ["第一次開啟需要聯網下載節律，之後斷網也能用。", "Cadence needs a connection the first time it opens; after that it works offline.", "Cadence a besoin d’une connexion à la première ouverture ; ensuite, il fonctionne hors ligne."],
        "重试": ["重試", "Retry", "Réessayer"],
        // ---- Mac 专用 ----
        "本月": ["本月", "Today", "Auj."],
        "好": ["好", "OK", "OK"],
        "取消": ["取消", "Cancel", "Annuler"],
        "打开节律": ["開啟節律", "Open Cadence", "Ouvrir Cadence"],
        "立即同步": ["立即同步", "Sync now", "Synchroniser"],
        "开机时自动启动": ["開機時自動啟動", "Open at login", "Ouvrir à la connexion"],
        "退出节律": ["退出節律", "Quit Cadence", "Quitter Cadence"],
        "关于节律": ["關於節律", "About Cadence", "À propos de Cadence"],
        "隐藏节律": ["隱藏節律", "Hide Cadence", "Masquer Cadence"],
        "隐藏其他": ["隱藏其他", "Hide Others", "Masquer les autres"],
        "全部显示": ["全部顯示", "Show All", "Tout afficher"],
        "编辑": ["編輯", "Edit", "Édition"],
        "文件": ["檔案", "File", "Fichier"],
        "新建事件": ["新增事件", "New Event", "Nouvel événement"],
        "撤销": ["撤銷", "Undo", "Annuler"],
        "重做": ["重做", "Redo", "Rétablir"],
        "剪切": ["剪下", "Cut", "Couper"],
        "拷贝": ["拷貝", "Copy", "Copier"],
        "粘贴": ["貼上", "Paste", "Coller"],
        "全选": ["全選", "Select All", "Tout sélectionner"],
        "显示": ["顯示", "View", "Présentation"],
        "重新载入": ["重新載入", "Reload", "Recharger"],
        "窗口": ["視窗", "Window", "Fenêtre"],
        "最小化": ["最小化", "Minimize", "Réduire"],
        "缩放": ["縮放", "Zoom", "Réduire/agrandir"],
        "关闭窗口": ["關閉視窗", "Close Window", "Fermer la fenêtre"],
        "节律主窗口": ["節律主視窗", "Cadence Window", "Fenêtre Cadence"],
        "没有事件": ["沒有事件", "No events", "Aucun événement"],
        "未连接 GitHub": ["未連接 GitHub", "GitHub not connected", "GitHub non connecté"],
        "上次同步 {0}": ["上次同步 {0}", "Last synced {0}", "Dernière synchro {0}"],
        "同步中…": ["同步中…", "Syncing…", "Synchronisation…"],
        "令牌无效或已过期": ["令牌無效或已過期", "Token invalid or expired", "Jeton invalide ou expiré"],
        "找不到同步数据": ["找不到同步資料", "Sync data not found", "Données de synchro introuvables"],
        "网络错误": ["網路錯誤", "Network error", "Erreur réseau"],
        "GitHub 返回 {0}": ["GitHub 返回 {0}", "GitHub returned {0}", "GitHub a répondu {0}"],
        "{0} 件未完成": ["{0} 件未完成", "{0} open", "{0} à faire"],
        "整月": ["整月", "Month", "Mois"],
        "检查更新…": ["檢查更新…", "Check for Updates…", "Rechercher les mises à jour…"],
        "检查更新失败": ["檢查更新失敗", "Couldn’t check for updates", "Impossible de vérifier les mises à jour"],
        "连不上 GitHub，稍后再试。": ["連不上 GitHub，稍後再試。", "Couldn’t reach GitHub. Try again later.", "GitHub est injoignable. Réessayez plus tard."],
        "已经是最新版本": ["已經是最新版本", "You’re up to date", "Vous êtes à jour"],
        "Mac 版 {0}（{1}）": ["Mac 版 {0}（{1}）", "Mac app {0} ({1})", "App Mac {0} ({1})"],
        "节律 Mac 版有新版本 {0}": ["節律 Mac 版有新版本 {0}", "Cadence for Mac {0} is available", "Cadence pour Mac {0} est disponible"],
        "点菜单栏的日历图标更新。": ["點選單列的日曆圖示更新。", "Click the calendar icon in the menu bar to update.", "Cliquez sur l’icône de calendrier dans la barre des menus pour mettre à jour."],
        "Mac 版有新版本 {0}": ["Mac 版有新版本 {0}", "Update available: {0}", "Mise à jour : {0}"],
        "更新…": ["更新…", "Update…", "Mettre à jour…"],
        "更新命令已复制": ["更新指令已拷貝", "Update command copied", "Commande de mise à jour copiée"],
        "在打开的终端窗口里按 ⌘V 粘贴，再按回车。编译大约一两分钟，完成后节律会自动重新打开。": ["在打開的終端機視窗裡按 ⌘V 貼上，再按 return。編譯大約一兩分鐘，完成後節律會自動重新打開。", "In the Terminal window that opens, press ⌘V to paste, then Return. The build takes a minute or two, and Cadence reopens when it’s done.", "Dans la fenêtre Terminal qui s’ouvre, appuyez sur ⌘V pour coller, puis sur Retour. La compilation prend une ou deux minutes, puis Cadence se rouvre."],
        "备份到 iCloud 云盘…": ["備份到 iCloud 雲碟…", "Back Up to iCloud Drive…", "Sauvegarder dans iCloud Drive…"],
        "iCloud 备份：{0}": ["iCloud 備份：{0}", "iCloud backup: {0}", "Sauvegarde iCloud : {0}"],
        "上次备份 {0}": ["上次備份 {0}", "Last backup {0}", "Dernière sauvegarde {0}"],
        "在访达中显示": ["在 Finder 中顯示", "Show in Finder", "Afficher dans le Finder"],
        "更换备份文件夹…": ["更換備份檔案夾…", "Change Backup Folder…", "Changer de dossier…"],
        "停止备份": ["停止備份", "Stop Backing Up", "Arrêter la sauvegarde"],
        "选择 iCloud 云盘里的一个文件夹，节律会把数据自动备份到这里": ["選擇 iCloud 雲碟裡的一個檔案夾，節律會把資料自動備份到這裡", "Choose a folder in iCloud Drive. Cadence will back up your data there automatically.", "Choisissez un dossier dans iCloud Drive. Cadence y sauvegardera vos données automatiquement."],
        "选择": ["選擇", "Choose", "Choisir"],
        "备份失败：{0}": ["備份失敗：{0}", "Backup failed: {0}", "Échec de la sauvegarde : {0}"],
        "找不到备份文件夹，请重新选择": ["找不到備份檔案夾，請重新選擇", "Backup folder not found — please choose it again", "Dossier de sauvegarde introuvable — choisissez-le à nouveau"],
        "整月日历，右上角可以翻月": ["整月日曆，右上角可以翻月", "The whole month; flip months at the top right", "Le mois entier ; changez de mois en haut à droite"],
        "今日": ["今日", "Today", "Aujourd’hui"],
        "今天、已逾期和接下来一周": ["今天、已逾期和接下來一週", "Today, overdue and the week ahead", "Aujourd’hui, en retard et la semaine à venir"],
        "小尺寸：今天的课；中尺寸：本周；大尺寸：本周课表": ["小尺寸：今天的課；中尺寸：本週；大尺寸：本週課表", "Small: today’s classes · Medium: this week · Large: weekly timetable", "Petit : cours du jour · Moyen : cette semaine · Grand : horaire de la semaine"],
    ]

    static func set(_ pref: String) {
        var l = pref == "auto" ? "" : pref
        if l.isEmpty {
            let p = (Locale.preferredLanguages.first ?? "en").lowercased()
            if p.hasPrefix("zh") { l = p.contains("hant") || p.contains("-tw") || p.contains("-hk") || p.contains("-mo") ? "zh-Hant" : "zh-Hans" }
            else { l = p.hasPrefix("fr") ? "fr" : "en" }
        }
        lang = ["zh-Hant", "en", "fr"].contains(l) ? l : "zh-Hans"
    }

    static func t(_ zhHans: String, _ args: Any...) -> String {
        var s = zhHans
        if lang != "zh-Hans", let v = T[zhHans] { s = v[lang == "zh-Hant" ? 0 : lang == "en" ? 1 : 2] }
        for (i, a) in args.enumerated() { s = s.replacingOccurrences(of: "{\(i)}", with: "\(a)") }
        return s
    }

    private static let MON_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    private static let MON_FR = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."]
    private static let WD_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    private static let WD_FR = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."]
    private static let WD_ZH = Array("日一二三四五六")

    /// 月份标题：「10月」/ Oct / oct.（m：1–12）
    static func mon(_ m: Int) -> String { lang == "en" ? MON_EN[m - 1] : lang == "fr" ? MON_FR[m - 1] : "\(m)月" }
    /// 日期：「10月20日」/ Oct 20 / 20 oct.
    static func md(_ m: Int, _ d: Int) -> String { lang == "en" ? "\(MON_EN[m - 1]) \(d)" : lang == "fr" ? "\(d) \(MON_FR[m - 1])" : "\(m)月\(d)日" }
    /// 星期表头（0 = 周日）：「日」/ S / D
    static func wdHead(_ i: Int) -> String { lang == "en" ? String(Array("SMTWTFS")[i]) : lang == "fr" ? String(Array("DLMMJVS")[i]) : String(WD_ZH[i]) }
    /// 星期名（0 = 周日）：「周三」/ Wed / mer.
    static func wk(_ i: Int) -> String { lang == "en" ? WD_EN[i] : lang == "fr" ? WD_FR[i] : "周" + String(WD_ZH[i]) }
    /// 「10月课表」/ Oct timetable
    static func monthSched(_ m: Int) -> String { zh ? "\(m)月课表" : lang == "fr" ? "Horaire · " + mon(m) : mon(m) + " timetable" }
    /// 「10月20日 周二」/ Tue, Oct 20
    static func full(_ d: YMD) -> String { zh ? "\(d.m)月\(d.d)日 " + wk(d.jsDay) : wk(d.jsDay) + ", " + md(d.m, d.d) }
}
