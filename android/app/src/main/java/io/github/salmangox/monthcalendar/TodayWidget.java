package io.github.salmangox.monthcalendar;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;

/** 今日小组件：今天、已逾期和接下来一周的事件，点一下打开今日列表。 */
public class TodayWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) m.updateAppWidget(id, Widgets.today(c));
    }

    @Override
    public void onAppWidgetOptionsChanged(Context c, AppWidgetManager m, int id, Bundle opts) {
        m.updateAppWidget(id, Widgets.today(c));
    }

    @Override
    public void onEnabled(Context c) {
        SyncJob.ensure(c);
        Engine.refreshAsync(c);
    }
}
