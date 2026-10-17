package io.github.salmangox.monthcalendar;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;

/** 课表小组件：今天还没上完的课（今天没课就显示下一个有课的日子），正在上和下一节会突出显示。 */
public class SchedWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) m.updateAppWidget(id, Widgets.sched(c));
    }

    @Override
    public void onAppWidgetOptionsChanged(Context c, AppWidgetManager m, int id, Bundle opts) {
        m.updateAppWidget(id, Widgets.sched(c));
    }

    @Override
    public void onEnabled(Context c) {
        SyncJob.ensure(c);
        Engine.refreshAsync(c);
    }
}
