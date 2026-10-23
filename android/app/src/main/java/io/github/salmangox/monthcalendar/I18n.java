package io.github.salmangox.monthcalendar;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * 小组件和原生通知的多语言（和网页一致：同步数据 profile.lang；auto = 跟随系统语言）。
 * 原文用简体中文作键，{0} 是占位；繁体由 OpenCC（台湾用语）生成。
 */
final class I18n {
    static volatile String lang = "zh-Hans";
    private static final Map<String, String[]> T = new HashMap<>(); // 原文 → {繁體, English, Français}

    private static void put(String k, String hant, String en, String fr) { T.put(k, new String[]{hant, en, fr}); }
    private static final Map<String, String> JA = new HashMap<>(); // 原文 → 日本語
    private static void ja(String k, String v) { JA.put(k, v); }

    static {
        ja("讲座", "講義");
        ja("实验", "実験");
        ja("辅导", "演習");
        ja("讨论课", "ディスカッション");
        ja("研讨", "セミナー");
        ja("（无标题）", "（タイトルなし）");
        ja("今天 · {0}", "今日 · {0}");
        ja("明天 · {0}", "明日 · {0}");
        ja("后天 · {0}", "明後日 · {0}");
        ja("今天", "今日");
        ja("明天", "明日");
        ja("昨天", "昨日");
        ja("{0} 天后", "{0} 日後");
        ja("{0} 天前", "{0} 日前");
        ja("已逾期", "期限切れ");
        ja("今天没有事件\n接下来一周也很空闲", "今日は予定がありません\nこの先 1 週間も空いています");
        ja("打开节律 App\n同步一次后这里会显示事件", "Cadence を開いて\n一度同期すると予定が表示されます");
        ja("全天", "終日");
        ja("{0} 天", "{0} 日");
        ja("本周课表", "今週の時間割");
        ja("还没有导入课表", "まだ時間割を読み込んでいません");
        ja("课表", "時間割");
        ja("这周没有课", "今週は授業がありません");
        ja("上课中", "授業中");
        ja("下一节", "次の授業");
        ja("第一节", "最初の授業");
        ja("事件提醒", "予定のリマインダー");
        ja("设置了提醒的事件到点通知", "リマインダー付きの予定を時間どおりに通知");
        ja("每日未完成提醒", "毎日の未完了リマインダー");
        ja("每天在设定的时间提醒查看当天未完成的事件", "毎日設定した時刻に、その日に残っている予定をお知らせ");
        ja("测试通知", "テスト通知");
        ja("查看今日未完成事件", "今日の未完了の予定を確認");
        ja("今日事件已完成", "今日の予定はすべて完了");
        ja("今天还有 {0} 件事未完成，点开查看。", "今日はまだ {0} 件が未完了です。タップして確認。");
        ja("今天的事件都完成了。", "今日の予定はすべて完了しました。");
        ja("节律 · 后台提醒测试", "Cadence · バックグラウンド通知のテスト");
        ja("节律 · 测试通知", "Cadence · テスト通知");
        ja("App 关着也能准时收到提醒。", "アプリを閉じていても時間どおりに通知が届きます。");
        ja("通知可以正常显示了", "通知は正常に表示されます");
        ja("没有可以打开这个链接的应用", "このリンクを開けるアプリがありません");
        ja("连不上网络", "ネットワークに接続できません");
        ja("第一次打开需要联网下载节律，之后断网也能用。", "初回起動時は Cadence のダウンロードに接続が必要です。以降はオフラインでも使えます。");
        ja("重试", "再試行");
        ja("纪念日", "記念日");
        ja("还有", "あと");
        ja("已经", "経過");
        ja("第", "");
        ja("就是今天", "今日です");
        ja("天", "日");
        ja("周", "週");
        ja("个月", "か月");
        ja("年", "年");
        ja("每周", "毎週");
        ja("每月", "毎月");
        ja("每年", "毎年");
        ja("还没有日子\n打开节律添加纪念日", "まだ記念日がありません\nCadence を開いて追加してください");
        put("讲座", "講座", "Lecture", "Cours magistral");
        put("实验", "實驗", "Lab", "TP");
        put("辅导", "輔導", "Tutorial", "TD");
        put("讨论课", "討論課", "Discussion", "Discussion");
        put("研讨", "研討", "Seminar", "Séminaire");
        put("（无标题）", "（無標題）", "(No title)", "(Sans titre)");
        put("今天 · {0}", "今天 · {0}", "Today · {0}", "Aujourd’hui · {0}");
        put("明天 · {0}", "明天 · {0}", "Tomorrow · {0}", "Demain · {0}");
        put("后天 · {0}", "後天 · {0}", "In 2 days · {0}", "Après-demain · {0}");
        put("今天", "今天", "Today", "Aujourd’hui");
        put("明天", "明天", "Tomorrow", "Demain");
        put("昨天", "昨天", "Yesterday", "Hier");
        put("{0} 天后", "{0} 天后", "In {0} days", "Dans {0} jours");
        put("{0} 天前", "{0} 天前", "{0} days ago", "Il y a {0} jours");
        put("已逾期", "已逾期", "Overdue", "En retard");
        put("今天没有事件\n接下来一周也很空闲", "今天沒有事件\n接下來一週也很空閒", "Nothing today\nand a quiet week ahead", "Rien aujourd’hui\net une semaine calme");
        put("打开节律 App\n同步一次后这里会显示事件", "開啟節律 App\n同步一次後這裡會顯示事件", "Open Cadence\nand sync once to see events here", "Ouvrez Cadence\net synchronisez une fois pour voir vos événements");
        put("全天", "全天", "All day", "Toute la journée");
        put("{0} 天", "{0} 天", "{0} days", "{0} jours");
        put("本周课表", "本週課表", "This week", "Cette semaine");
        put("还没有导入课表", "還沒有匯入課表", "No timetable imported yet", "Aucun horaire importé");
        put("课表", "課表", "Timetable", "Horaire");
        put("这周没有课", "這周沒有課", "No classes this week", "Aucun cours cette semaine");
        put("上课中", "上課中", "In class", "En cours");
        put("下一节", "下一節", "Next class", "Cours suivant");
        put("第一节", "第一節", "First class", "Premier cours");
        put("事件提醒", "事件提醒", "Event reminders", "Rappels d’événements");
        put("设置了提醒的事件到点通知", "設定了提醒的事件到點通知", "Notifies you on time for events with reminders", "Vous prévient à l’heure pour les événements avec rappel");
        put("每日未完成提醒", "每日未完成提醒", "Daily to-do reminder", "Rappel quotidien des tâches");
        put("每天在设定的时间提醒查看当天未完成的事件", "每天在設定的時間提醒檢視當天未完成的事件", "A daily nudge at your chosen time to check what’s left", "Un rappel quotidien à l’heure choisie pour voir ce qui reste");
        put("测试通知", "測試通知", "Test notifications", "Notifications test");
        put("查看今日未完成事件", "檢視今日未完成事件", "Check today’s open events", "Voir les tâches du jour");
        put("今日事件已完成", "今日事件已完成", "All done today", "Tout est fait aujourd’hui");
        put("今天还有 {0} 件事未完成，点开查看。", "今天還有 {0} 件事未完成，點開檢視。", "{0} things are still open today — tap to see them.", "Encore {0} choses à faire aujourd’hui — touchez pour les voir.");
        put("今天的事件都完成了。", "今天的事件都完成了。", "Everything for today is done.", "Tout est fait pour aujourd’hui.");
        put("节律 · 后台提醒测试", "節律 · 後臺提醒測試", "Cadence · Background reminder test", "Cadence · Test de rappel en arrière-plan");
        put("节律 · 测试通知", "節律 · 測試通知", "Cadence · Test notification", "Cadence · Notification test");
        put("App 关着也能准时收到提醒。", "App 關著也能準時收到提醒。", "Reminders arrive on time even when the app is closed.", "Les rappels arrivent à l’heure même app fermée.");
        put("通知可以正常显示了", "通知可以正常顯示了", "Notifications are working", "Les notifications fonctionnent");
        put("没有可以打开这个链接的应用", "沒有可以開啟這個連結的應用", "No app can open this link", "Aucune app ne peut ouvrir ce lien");
        put("连不上网络", "連不上網路", "No connection", "Pas de connexion");
        put("第一次打开需要联网下载节律，之后断网也能用。", "第一次開啟需要聯網下載節律，之後斷網也能用。", "Cadence needs a connection the first time it opens; after that it works offline.", "Cadence a besoin d’une connexion à la première ouverture ; ensuite, il fonctionne hors ligne.");
        put("重试", "重試", "Retry", "Réessayer");
        put("纪念日", "紀念日", "Days", "Jours");
        put("还有", "還有", "Coming up in", "Dans");
        put("已经", "已經", "It’s been", "Depuis");
        put("第", "第", "Day", "Jour");
        put("就是今天", "就是今天", "It’s today", "C’est aujourd’hui");
        put("天", "天", "days", "jours");
        put("周", "週", "weeks", "semaines");
        put("个月", "個月", "months", "mois");
        put("年", "年", "years", "ans");
        put("每周", "每週", "Weekly", "Chaque semaine");
        put("每月", "每月", "Monthly", "Chaque mois");
        put("每年", "每年", "Yearly", "Chaque année");
        put("还没有日子\n打开节律添加纪念日", "還沒有日子\n打開節律新增紀念日", "No days yet\nOpen Cadence to add one", "Aucun jour\nOuvrez Cadence pour en ajouter");
    }

    static void set(String pref) {
        String l = pref == null || pref.isEmpty() || "auto".equals(pref) ? "" : pref;
        if (l.isEmpty()) {
            Locale loc = Locale.getDefault();
            String lg = loc.getLanguage(), sc = loc.getScript(), co = loc.getCountry();
            l = "zh".equals(lg) ? ("Hant".equals(sc) || "TW".equals(co) || "HK".equals(co) || "MO".equals(co) ? "zh-Hant" : "zh-Hans") : "fr".equals(lg) ? "fr" : "ja".equals(lg) ? "ja" : "en";
        }
        lang = l.equals("zh-Hant") || l.equals("en") || l.equals("fr") || l.equals("ja") ? l : "zh-Hans";
    }

    static boolean zh() { return lang.startsWith("zh"); }
    /** 中文或日文：日期用「年 / 月 / 日」写法 */
    static boolean cjk() { return zh() || lang.equals("ja"); }

    static String t(String zhHans, Object... a) {
        String[] v = T.get(zhHans);
        String s = lang.equals("ja") ? (JA.containsKey(zhHans) ? JA.get(zhHans) : v != null ? v[1] : zhHans)
            : v == null || lang.equals("zh-Hans") ? zhHans : v[lang.equals("zh-Hant") ? 0 : lang.equals("en") ? 1 : 2];
        for (int i = 0; i < a.length; i++) s = s.replace("{" + i + "}", String.valueOf(a[i]));
        return s;
    }

    private static final String[] MON_EN = {"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"};
    private static final String[] MON_FR = {"janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."};
    private static final String[] WD_EN = {"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"};
    private static final String[] WD_FR = {"dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."};
    private static final String WD_ZH = "日一二三四五六", WD_JA = "日月火水木金土";

    /** 月份标题：「10月」/ Oct / oct.（m：1–12） */
    static String mon(int m) { return lang.equals("en") ? MON_EN[m - 1] : lang.equals("fr") ? MON_FR[m - 1] : m + "月"; }
    /** 日期：「10月20日」/ Oct 20 / 20 oct. */
    static String md(int m, int d) { return lang.equals("en") ? MON_EN[m - 1] + " " + d : lang.equals("fr") ? d + " " + MON_FR[m - 1] : m + "月" + d + "日"; }
    /** 星期表头（0 = 周日）：「日」/ S / D */
    static String wdHead(int i) { return lang.equals("en") ? "SMTWTFS".substring(i, i + 1) : lang.equals("fr") ? "DLMMJVS".substring(i, i + 1) : lang.equals("ja") ? WD_JA.substring(i, i + 1) : WD_ZH.substring(i, i + 1); }
    /** 星期名（0 = 周日）：「周三」/ Wed / mer. */
    static String wk(int i) { return lang.equals("en") ? WD_EN[i] : lang.equals("fr") ? WD_FR[i] : lang.equals("ja") ? "(" + WD_JA.charAt(i) + ")" : (lang.equals("zh-Hant") ? "週" : "周") + WD_ZH.charAt(i); }
    /** 「10月课表」/ Oct timetable */
    static String monthSched(int m) { return lang.equals("ja") ? m + "月の時間割" : zh() ? m + (lang.equals("zh-Hant") ? "月課表" : "月课表") : (lang.equals("fr") ? "Horaire · " + mon(m) : mon(m) + " timetable"); }
}
