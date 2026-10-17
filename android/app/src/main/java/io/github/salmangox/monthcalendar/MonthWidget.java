package io.github.salmangox.monthcalendar;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;

/** 整月小组件：彩色事件，左右翻月，点日期区域打开 App。 */
public class MonthWidget extends AppWidgetProvider {
    @Override
    public void onReceive(Context context, Intent intent) {
        String a = intent.getAction();
        int id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        if (id != AppWidgetManager.INVALID_APPWIDGET_ID
                && (Widgets.ACT_PREV.equals(a) || Widgets.ACT_NEXT.equals(a) || Widgets.ACT_HOME.equals(a))) {
            int off = Widgets.ACT_HOME.equals(a) ? 0 : Widgets.offset(context, id) + (Widgets.ACT_PREV.equals(a) ? -1 : 1);
            Widgets.setOffset(context, id, off);
            AppWidgetManager m = AppWidgetManager.getInstance(context);
            m.updateAppWidget(id, Widgets.month(context, id, m.getAppWidgetOptions(id)));
            return;
        }
        super.onReceive(context, intent);
    }

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) m.updateAppWidget(id, Widgets.month(c, id, m.getAppWidgetOptions(id)));
    }

    @Override
    public void onAppWidgetOptionsChanged(Context c, AppWidgetManager m, int id, Bundle opts) {
        m.updateAppWidget(id, Widgets.month(c, id, opts));
    }

    @Override
    public void onEnabled(Context c) {
        SyncJob.ensure(c);
        Engine.refreshAsync(c);
    }

    @Override
    public void onDeleted(Context c, int[] ids) {
        android.content.SharedPreferences.Editor e = Store.prefs(c).edit();
        for (int id : ids) e.remove("moff_" + id).remove("moffAt_" + id);
        e.apply();
    }
}
