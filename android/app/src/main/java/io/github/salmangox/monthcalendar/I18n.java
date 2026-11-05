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
        // ---------- 原生界面（MainActivity：日历、今日、新建 / 编辑）；大部分译文取自网页 js/i18n.js ----------
        put("低", "低", "Low", "Basse");
        ja("低", "低");
        put("中", "中", "Medium", "Moyenne");
        ja("中", "中");
        put("高", "高", "High", "Haute");
        ja("高", "高");
        put("不重复", "不重複", "Doesn’t repeat", "Ne se répète pas");
        ja("不重复", "繰り返さない");
        put("每天", "每天", "Daily", "Chaque jour");
        ja("每天", "毎日");
        put("每周", "每週", "Weekly", "Chaque semaine");
        ja("每周", "毎週");
        put("每两周", "每兩週", "Every 2 weeks", "Toutes les 2 semaines");
        ja("每两周", "2 週ごと");
        put("每月", "每月", "Monthly", "Chaque mois");
        ja("每月", "毎月");
        put("每年", "每年", "Yearly", "Chaque année");
        ja("每年", "毎年");
        put("{0} 天", "{0} 天", "{0} days", "{0} jours");
        ja("{0} 天", "{0} 日");
        put("{0} 天前", "{0} 天前", "{0} days ago", "Il y a {0} jours");
        ja("{0} 天前", "{0} 日前");
        put("{0} 天后", "{0} 天後", "In {0} days", "Dans {0} jours");
        ja("{0} 天后", "{0} 日後");
        put("{0} 项，已完成 {1}", "{0} 項，已完成 {1}", "{0} items, {1} done", "{0} éléments, {1} terminés");
        ja("{0} 项，已完成 {1}", "{0} 件、完了 {1}");
        put("一直重复", "一直重複", "Forever", "Toujours");
        ja("一直重复", "ずっと");
        put("下周一", "下週一", "Next Monday", "Lundi prochain");
        ja("下周一", "来週の月曜");
        put("不同意", "不同意", "Disagree", "Refuser");
        ja("不同意", "同意しない");
        put("不同意将无法使用节律。我们不会收集任何数据，日程只存在你这台设备上。", "不同意將無法使用節律。我們不會收集任何資料，日程只存在你這台裝置上。", "Cadence can’t be used without agreeing. We collect no data; your events stay on this device.", "Sans accord, Cadence ne peut pas être utilisé. Nous ne collectons aucune donnée ; vos événements restent sur cet appareil.");
        ja("不同意将无法使用节律。我们不会收集任何数据，日程只存在你这台设备上。", "同意しない場合は Cadence を使えません。データは収集せず、予定はこの端末にのみ保存されます。");
        put("不需要注册，不收集你的个人信息", "不需要註冊，不收集你的個人資訊", "No sign-up, no personal information collected", "Pas d’inscription, aucune donnée personnelle collectée");
        ja("不需要注册，不收集你的个人信息", "登録不要、個人情報は収集しません");
        put("仅删除这一个", "僅刪除這一個", "Delete only this one", "Supprimer seulement celui-ci");
        ja("仅删除这一个", "この予定のみ削除");
        put("今天", "今天", "Today", "Aujourd’hui");
        ja("今天", "今日");
        put("今天没有安排", "今天沒有安排", "Nothing planned today", "Rien de prévu aujourd’hui");
        ja("今天没有安排", "今日は予定がありません");
        put("今日", "今日", "Today", "Aujourd’hui");
        ja("今日", "今日");
        put("优先级", "優先順序", "Priority", "Priorité");
        ja("优先级", "優先度");
        put("保存", "儲存", "Save", "Enregistrer");
        ja("保存", "保存");
        put("修改已自动保存", "修改已自動儲存", "Changes saved", "Modifications enregistrées");
        ja("修改已自动保存", "変更を自動保存しました");
        put("全天", "全天", "All day", "Toute la journée");
        ja("全天", "終日");
        put("全部移到今天", "全部移到今天", "Move all to today", "Tout à aujourd’hui");
        ja("全部移到今天", "すべて今日へ");
        put("共 {0} 天", "共 {0} 天", "{0} days", "{0} jours");
        ja("共 {0} 天", "{0} 日間");
        put("其他日期", "其他日期", "Other date", "Autre date");
        ja("其他日期", "ほかの日付");
        put("准备做什么？", "準備做什麼？", "What’s next?", "Que prévoyez-vous ?");
        ja("准备做什么？", "何をしますか？");
        put("准时", "準時", "At time of event", "À l’heure");
        ja("准时", "予定の時刻");
        put("删除事件", "刪除事件", "Delete event", "Supprimer l’événement");
        ja("删除事件", "予定を削除");
        put("删除这个及之后的重复（{0} 个）", "刪除這個及之後的重複（{0} 個）", "Delete this and later repeats ({0})", "Supprimer celui-ci et les suivants ({0})");
        ja("删除这个及之后的重复（{0} 个）", "これ以降の繰り返しを削除（{0} 件）");
        put("同意并继续", "同意並繼續", "Agree and continue", "Accepter et continuer");
        ja("同意并继续", "同意して続ける");
        put("名称为空，修改没有保存", "名稱為空，修改沒有儲存", "The name is empty — changes weren’t saved", "Le nom est vide — modifications non enregistrées");
        ja("名称为空，修改没有保存", "名前が空なので変更は保存されていません");
        put("后天", "後天", "In 2 days", "Après-demain");
        ja("后天", "明後日");
        put("回到今天", "回到今天", "Go to today", "Aller à aujourd’hui");
        ja("回到今天", "今日に戻る");
        put("备注", "備註", "Notes", "Notes");
        ja("备注", "メモ");
        put("完成", "完成", "Done", "Terminé");
        ja("完成", "完了");
        put("已保存", "已儲存", "Saved", "Enregistré");
        ja("已保存", "保存しました");
        put("已删除 {0} 个事件", "已刪除 {0} 個事件", "Deleted {0} events", "{0} événements supprimés");
        ja("已删除 {0} 个事件", "{0} 件の予定を削除しました");
        put("已删除「{0}」", "已刪除「{0}」", "Deleted “{0}”", "« {0} » supprimé");
        ja("已删除「{0}」", "「{0}」を削除しました");
        put("已存为草稿，下次点 ＋ 接着写", "已存為草稿，下次點 ＋ 接著寫", "Saved as a draft — tap ＋ next time to continue", "Enregistré en brouillon — touchez ＋ pour continuer");
        ja("已存为草稿，下次点 ＋ 接着写", "下書きとして保存しました。次に ＋ をタップすると続きから書けます");
        put("已完成", "已完成", "Done", "Terminé");
        ja("已完成", "完了");
        put("已把 {0} 个事件移到今天", "已把 {0} 個事件移到今天", "Moved {0} events to today", "{0} événements déplacés à aujourd’hui");
        ja("已把 {0} 个事件移到今天", "{0} 件の予定を今日に移動しました");
        put("已添加 {0} 个重复事件", "已新增 {0} 個重複事件", "Added {0} repeating events", "{0} événements récurrents ajoutés");
        ja("已添加 {0} 个重复事件", "繰り返しの予定を {0} 件追加しました");
        put("已添加到 {0}", "已新增到 {0}", "Added to {0}", "Ajouté au {0}");
        ja("已添加到 {0}", "{0} に追加しました");
        put("已添加到今天", "已新增到今天", "Added to today", "Ajouté à aujourd’hui");
        ja("已添加到今天", "今日に追加しました");
        put("已添加，{0}重复", "已新增，{0}重複", "Added — repeats {0}", "Ajouté — se répète {0}");
        ja("已添加，{0}重复", "追加しました。{0}繰り返します");
        put("已逾期", "已逾期", "Overdue", "En retard");
        ja("已逾期", "期限切れ");
        put("开始", "開始", "Start", "Début");
        ja("开始", "開始");
        put("开始使用前，请花一分钟了解节律如何处理你的数据：", "開始使用前，請花一分鐘了解節律如何處理你的資料：", "Before you start, take a minute to see how Cadence handles your data:", "Avant de commencer, prenez une minute pour voir comment Cadence traite vos données :");
        ja("开始使用前，请花一分钟了解节律如何处理你的数据：", "ご利用の前に、Cadence がデータをどう扱うかご確認ください：");
        put("当天 {0}", "當天 {0}", "Same day {0}", "Le jour même à {0}");
        ja("当天 {0}", "当日 {0}");
        put("持续", "持續", "Lasts", "Durée");
        ja("持续", "期間");
        put("提前 1 周 {0}", "提前 1 週 {0}", "1 week before, {0}", "1 semaine avant à {0}");
        ja("提前 1 周 {0}", "1 週間前 {0}");
        put("提前 1 天", "提前 1 天", "1 day before", "1 jour avant");
        ja("提前 1 天", "1 日前");
        put("提前 1 天 {0}", "提前 1 天 {0}", "1 day before, {0}", "La veille à {0}");
        ja("提前 1 天 {0}", "1 日前 {0}");
        put("提前 1 小时", "提前 1 小時", "1 hour before", "1 h avant");
        ja("提前 1 小时", "1 時間前");
        put("提前 15 分钟", "提前 15 分鐘", "15 min before", "15 min avant");
        ja("提前 15 分钟", "15 分前");
        put("提前 2 天 {0}", "提前 2 天 {0}", "2 days before, {0}", "2 jours avant à {0}");
        ja("提前 2 天 {0}", "2 日前 {0}");
        put("提前 30 分钟", "提前 30 分鐘", "30 min before", "30 min avant");
        ja("提前 30 分钟", "30 分前");
        put("提前 5 分钟", "提前 5 分鐘", "5 min before", "5 min avant");
        ja("提前 5 分钟", "5 分前");
        put("提前 {0} 分钟", "提前 {0} 分鐘", "{0} min before", "{0} min avant");
        ja("提前 {0} 分钟", "{0} 分前");
        put("提醒", "提醒", "Reminders", "Rappels");
        ja("提醒", "リマインダー");
        put("撤销", "復原", "Undo", "Annuler");
        ja("撤销", "取り消す");
        put("收起", "收起", "Show less", "Réduire");
        ja("收起", "閉じる");
        put("新建", "新建", "Create", "Créer");
        ja("新建", "作成");
        put("新建事件", "新建事件", "New event", "Nouvel événement");
        ja("新建事件", "新しい予定");
        put("无", "無", "None", "Aucun");
        ja("无", "なし");
        put("日历", "日曆", "Calendar", "Calendrier");
        ja("日历", "カレンダー");
        put("日历与纪念日…", "日曆與紀念日…", "Calendars & anniversaries…", "Calendriers et anniversaires…");
        ja("日历与纪念日…", "カレンダーと記念日…");
        put("日程", "日程", "Schedule", "Agenda");
        ja("日程", "スケジュール");
        put("日程、课程、纪念日全部保存在本机", "日程、課程、紀念日全部儲存在本機", "Events, classes and anniversaries stay on your device", "Événements, cours et anniversaires restent sur votre appareil");
        ja("日程、课程、纪念日全部保存在本机", "予定・授業・記念日はすべて端末内に保存");
        put("时间", "時間", "Time", "Heure");
        ja("时间", "時刻");
        put("时间段", "時間段", "Time range", "Plage horaire");
        ja("时间段", "時間帯");
        put("明天", "明天", "Tomorrow", "Demain");
        ja("明天", "明日");
        put("昨天", "昨天", "Yesterday", "Hier");
        ja("昨天", "昨日");
        put("暂无安排", "暫無安排", "Nothing planned", "Rien de prévu");
        ja("暂无安排", "予定はありません");
        put("更多", "更多", "More", "Plus");
        ja("更多", "その他");
        put("标为完成", "標為完成", "Mark as done", "Marquer comme terminé");
        ja("标为完成", "完了にする");
        put("标为未完成", "標為未完成", "Mark as not done", "Marquer comme non terminé");
        ja("标为未完成", "未完了に戻す");
        put("没有广告，没有统计分析 SDK", "沒有廣告，沒有統計分析 SDK", "No ads, no analytics SDK", "Pas de publicité, aucun SDK d’analyse");
        ja("没有广告，没有统计分析 SDK", "広告なし、解析 SDK なし");
        put("添加", "新增", "Add", "Ajouter");
        ja("添加", "追加");
        put("添加事件", "新增事件", "Add event", "Ajouter un événement");
        ja("添加事件", "予定を追加");
        put("清空", "清空", "Clear", "Effacer");
        ja("清空", "クリア");
        put("相册只在你选择封面、导入课表、保存分享图时使用", "相簿只在你選擇封面、匯入課表、儲存分享圖時使用", "Photos are used only when you pick a cover, import a timetable or save a share image", "Les photos ne servent que pour une couverture, un import d’horaire ou une image à partager");
        ja("相册只在你选择封面、导入课表、保存分享图时使用", "写真はカバー選択・時間割の読み込み・共有画像の保存時のみ使用");
        put("等级", "等級", "Level", "Niveau");
        ja("等级", "レベル");
        put("结束", "結束", "End", "Fin");
        ja("结束", "終了");
        put("结束重复", "結束重複", "End repeat", "Fin de la répétition");
        ja("结束重复", "繰り返しの終了");
        put("编辑事件", "編輯事件", "Edit event", "Modifier l’événement");
        ja("编辑事件", "予定を編集");
        put("草稿", "草稿", "Draft", "Brouillon");
        ja("草稿", "下書き");
        put("设置", "設定", "Settings", "Réglages");
        ja("设置", "設定");
        put("请先填写名称", "請先填寫名稱", "Enter a name first", "Saisissez d’abord un nom");
        ja("请先填写名称", "先に名前を入力してください");
        put("这一天没有安排", "這一天沒有安排", "Nothing planned this day", "Rien de prévu ce jour-là");
        ja("这一天没有安排", "この日は予定がありません");
        put("选择", "選擇", "Choose", "Choisir");
        ja("选择", "選択");
        put("选择日期…", "選擇日期…", "Choose a date…", "Choisir une date…");
        ja("选择日期…", "日付を選択…");
        put("重复", "重複", "Repeat", "Répétition");
        ja("重复", "繰り返し");
        put("长按日期或点 ＋ 添加", "長按日期或點 ＋ 新增", "Long-press a date or tap ＋ to add", "Appuyez longuement sur une date ou touchez ＋");
        ja("长按日期或点 ＋ 添加", "日付を長押しするか ＋ で追加");
        put("隐私政策", "隱私權政策", "Privacy Policy", "Politique de confidentialité");
        ja("隐私政策", "プライバシーポリシー");
        put("隐私政策全文", "隱私權政策全文", "Full privacy policy", "Politique complète");
        ja("隐私政策全文", "プライバシーポリシー全文");
        put("（无标题）", "（無標題）", "(No title)", "(Sans titre)");
        ja("（无标题）", "（タイトルなし）");
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
