package io.github.salmangox.monthcalendar;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** 精确闹钟到点：弹出到期的提醒、刷新小组件，并预约下一次。 */
public class AlarmReceiver extends BroadcastReceiver {
    static final String TICK = "io.github.salmangox.monthcalendar.TICK";
    static final String TEST = "io.github.salmangox.monthcalendar.TEST";

    @Override
    public void onReceive(Context context, Intent intent) {
        Context c = context.getApplicationContext();
        if (TEST.equals(intent.getAction())) {
            Engine.showTest(c, true);
            return;
        }
        PendingResult pr = goAsync();
        Engine.BG.execute(() -> {
            try { Engine.refresh(c); } finally { pr.finish(); }
        });
    }
}
