package io.github.salmangox.monthcalendar;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;

/** 纪念日小组件：置顶（或最近的）日子大字显示；够高时下面列出其他日子。点一下打开纪念日历。 */
public class DaysWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) m.updateAppWidget(id, Widgets.days(c, m.getAppWidgetOptions(id)));
    }

    @Override
    public void onAppWidgetOptionsChanged(Context c, AppWidgetManager m, int id, Bundle opts) {
        m.updateAppWidget(id, Widgets.days(c, opts));
    }

    @Override
    public void onEnabled(Context c) {
        SyncJob.ensure(c);
        Engine.refreshAsync(c);
    }
}
