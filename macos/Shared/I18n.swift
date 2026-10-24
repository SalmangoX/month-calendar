import Foundation

/// 小组件、菜单栏和原生通知的多语言（和网页一致：同步数据 profile.lang；auto = 跟随系统语言）。
/// 原文用简体中文作键，{0} 是占位。
enum I18n {
    private(set) static var lang = "zh-Hans"
    static var zh: Bool { lang.hasPrefix("zh") }
    /// 中文或日文：日期用「年 / 月 / 日」写法
    static var cjk: Bool { zh || lang == "ja" }

    /// 原文 → [繁體, English, Français]
    private static let T: [String: [String]] = [
        "讲座": ["講座", "Lecture", "Cours magistral"],
        "纪念日": ["紀念日", "Days", "Jours"],
        "还有": ["還有", "Coming up in", "Dans"],
        "已经": ["已經", "It’s been", "Depuis"],
        "第": ["第", "Day", "Jour"],
        "就是今天": ["就是今天", "It’s today", "C’est aujourd’hui"],
        "天": ["天", "days", "jours"],
        "周": ["週", "weeks", "semaines"],
        "个月": ["個月", "months", "mois"],
        "年": ["年", "years", "ans"],
        "每周": ["每週", "Weekly", "Chaque semaine"],
        "每月": ["每月", "Monthly", "Chaque mois"],
        "每年": ["每年", "Yearly", "Chaque année"],
        "还没有日子\n打开节律添加纪念日": ["還沒有日子\n打開節律新增紀念日", "No days yet\nOpen Cadence to add one", "Aucun jour\nOuvrez Cadence pour en ajouter"],
        "置顶或最近的日子，以及接下来的几个": ["置頂或最近的日子，以及接下來的幾個", "Your pinned or next day, plus the ones after it", "Votre jour épinglé ou le prochain, puis les suivants"],
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

    /// 原文 → 日本語
    private static let JA: [String: String] = [
        "讲座": "講義",
        "纪念日": "記念日",
        "还有": "あと",
        "已经": "経過",
        "第": "",
        "就是今天": "今日です",
        "天": "日",
        "周": "週",
        "个月": "か月",
        "年": "年",
        "每周": "毎週",
        "每月": "毎月",
        "每年": "毎年",
        "还没有日子\n打开节律添加纪念日": "まだ記念日がありません\nCadence を開いて追加してください",
        "置顶或最近的日子，以及接下来的几个": "ピン留めした日か次の日と、その後の記念日",
        "实验": "実験",
        "辅导": "演習",
        "讨论课": "ディスカッション",
        "研讨": "セミナー",
        "（无标题）": "（タイトルなし）",
        "今天 · {0}": "今日 · {0}",
        "明天 · {0}": "明日 · {0}",
        "后天 · {0}": "明後日 · {0}",
        "今天": "今日",
        "明天": "明日",
        "昨天": "昨日",
        "{0} 天后": "{0} 日後",
        "{0} 天前": "{0} 日前",
        "已逾期": "期限切れ",
        "今天没有事件\n接下来一周也很空闲": "今日は予定がありません\nこの先 1 週間も空いています",
        "打开节律 App\n同步一次后这里会显示事件": "Cadence を開いて\n一度同期すると予定が表示されます",
        "全天": "終日",
        "{0} 天": "{0} 日",
        "本周课表": "今週の時間割",
        "还没有导入课表": "まだ時間割を読み込んでいません",
        "课表": "時間割",
        "这周没有课": "今週は授業がありません",
        "上课中": "授業中",
        "下一节": "次の授業",
        "第一节": "最初の授業",
        "查看今日未完成事件": "今日の未完了の予定を確認",
        "今日事件已完成": "今日の予定はすべて完了",
        "今天还有 {0} 件事未完成，点开查看。": "今日はまだ {0} 件が未完了です。タップして確認。",
        "今天的事件都完成了。": "今日の予定はすべて完了しました。",
        "节律 · 后台提醒测试": "Cadence · バックグラウンド通知のテスト",
        "节律 · 测试通知": "Cadence · テスト通知",
        "App 关着也能准时收到提醒。": "アプリを閉じていても時間どおりに通知が届きます。",
        "通知可以正常显示了": "通知は正常に表示されます",
        "连不上网络": "ネットワークに接続できません",
        "第一次打开需要联网下载节律，之后断网也能用。": "初回起動時は Cadence のダウンロードに接続が必要です。以降はオフラインでも使えます。",
        "重试": "再試行",
        "本月": "今日",
        "好": "OK",
        "取消": "キャンセル",
        "打开节律": "Cadence を開く",
        "立即同步": "今すぐ同期",
        "开机时自动启动": "ログイン時に開く",
        "退出节律": "Cadence を終了",
        "关于节律": "Cadence について",
        "隐藏节律": "Cadence を隠す",
        "隐藏其他": "ほかを隠す",
        "全部显示": "すべてを表示",
        "编辑": "編集",
        "文件": "ファイル",
        "新建事件": "新しい予定",
        "撤销": "取り消す",
        "重做": "やり直す",
        "剪切": "カット",
        "拷贝": "コピー",
        "粘贴": "ペースト",
        "全选": "すべてを選択",
        "显示": "表示",
        "重新载入": "再読み込み",
        "窗口": "ウインドウ",
        "最小化": "しまう",
        "缩放": "拡大/縮小",
        "关闭窗口": "ウインドウを閉じる",
        "节律主窗口": "Cadence ウインドウ",
        "没有事件": "予定はありません",
        "未连接 GitHub": "GitHub 未接続",
        "上次同步 {0}": "前回の同期 {0}",
        "同步中…": "同期中…",
        "令牌无效或已过期": "トークンが無効か期限切れです",
        "找不到同步数据": "同期データが見つかりません",
        "网络错误": "ネットワークエラー",
        "GitHub 返回 {0}": "GitHub の応答：{0}",
        "{0} 件未完成": "未完了 {0} 件",
        "整月": "月",
        "检查更新…": "アップデートを確認…",
        "检查更新失败": "アップデートを確認できませんでした",
        "连不上 GitHub，稍后再试。": "GitHub に接続できません。しばらくしてから再試行してください。",
        "已经是最新版本": "最新バージョンです",
        "Mac 版 {0}（{1}）": "Mac 版 {0}（{1}）",
        "节律 Mac 版有新版本 {0}": "Cadence for Mac の新しいバージョン {0} があります",
        "点菜单栏的日历图标更新。": "メニューバーのカレンダーアイコンから更新してください。",
        "Mac 版有新版本 {0}": "新しいバージョン {0} があります",
        "更新…": "アップデート…",
        "更新命令已复制": "更新コマンドをコピーしました",
        "在打开的终端窗口里按 ⌘V 粘贴，再按回车。编译大约一两分钟，完成后节律会自动重新打开。": "開いたターミナルで ⌘V を押して貼り付け、Return を押してください。ビルドには 1〜2 分かかり、完了すると Cadence が自動で再び開きます。",
        "备份到 iCloud 云盘…": "iCloud Drive にバックアップ…",
        "iCloud 备份：{0}": "iCloud バックアップ：{0}",
        "上次备份 {0}": "前回のバックアップ {0}",
        "在访达中显示": "Finder に表示",
        "更换备份文件夹…": "バックアップフォルダを変更…",
        "停止备份": "バックアップを停止",
        "选择 iCloud 云盘里的一个文件夹，节律会把数据自动备份到这里": "iCloud Drive のフォルダを選んでください。Cadence がデータを自動でバックアップします",
        "选择": "選択",
        "备份失败：{0}": "バックアップに失敗しました：{0}",
        "找不到备份文件夹，请重新选择": "バックアップフォルダが見つかりません。もう一度選んでください",
        "整月日历，右上角可以翻月": "1 か月のカレンダー。右上で月を切り替え",
        "今日": "今日",
        "今天、已逾期和接下来一周": "今日・期限切れ・この先 1 週間",
        "小尺寸：今天的课；中尺寸：本周；大尺寸：本周课表": "小：今日の授業 · 中：今週 · 大：今週の時間割",
    ]

    static func set(_ pref: String) {
        var l = pref == "auto" ? "" : pref
        if l.isEmpty {
            let p = (Locale.preferredLanguages.first ?? "en").lowercased()
            if p.hasPrefix("zh") { l = p.contains("hant") || p.contains("-tw") || p.contains("-hk") || p.contains("-mo") ? "zh-Hant" : "zh-Hans" }
            else { l = p.hasPrefix("fr") ? "fr" : p.hasPrefix("ja") ? "ja" : "en" }
        }
        let v = ["zh-Hant", "en", "fr", "ja"].contains(l) ? l : "zh-Hans"
        // 小组件里好几个线程同时在画、同时在读 lang；没变就不写，避免读到写了一半的字符串而崩溃
        if v != lang { lang = v }
    }

    static func t(_ zhHans: String, _ args: Any...) -> String {
        var s = zhHans
        if lang == "ja" { s = JA[zhHans] ?? T[zhHans]?[1] ?? zhHans }
        else if lang != "zh-Hans", let v = T[zhHans] { s = v[lang == "zh-Hant" ? 0 : lang == "en" ? 1 : 2] }
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
    static func wdHead(_ i: Int) -> String { lang == "en" ? String(Array("SMTWTFS")[i]) : lang == "fr" ? String(Array("DLMMJVS")[i]) : lang == "ja" ? String(Array("日月火水木金土")[i]) : String(WD_ZH[i]) }
    /// 星期名（0 = 周日）：「周三」/ Wed / mer.
    static func wk(_ i: Int) -> String { lang == "en" ? WD_EN[i] : lang == "fr" ? WD_FR[i] : lang == "ja" ? "(" + String(Array("日月火水木金土")[i]) + ")" : (lang == "zh-Hant" ? "週" : "周") + String(WD_ZH[i]) }
    /// 「10月课表」/ Oct timetable
    static func monthSched(_ m: Int) -> String { lang == "ja" ? "\(m)月の時間割" : zh ? (lang == "zh-Hant" ? "\(m)月課表" : "\(m)月课表") : lang == "fr" ? "Horaire · " + mon(m) : mon(m) + " timetable" }
    /// 「10月20日 周二」/ Tue, Oct 20
    static func full(_ d: YMD) -> String { zh ? "\(d.m)月\(d.d)日 " + wk(d.jsDay) : wk(d.jsDay) + ", " + md(d.m, d.d) }
}
