package io.github.salmangox.monthcalendar;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** 开机、App 更新后、改时间或时区、精确闹钟权限变化：重新预约所有提醒并刷新小组件。 */
public class SystemReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        Context c = context.getApplicationContext();
        PendingResult pr = goAsync();
        Engine.BG.execute(() -> {
            try {
                SyncJob.ensure(c);
                Engine.refresh(c);
            } finally {
                pr.finish();
            }
        });
    }
}
