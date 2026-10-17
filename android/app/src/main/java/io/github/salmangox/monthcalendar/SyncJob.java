package io.github.salmangox.monthcalendar;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;

/** 后台每 15 分钟（系统允许的最短间隔）从 Gist 拉一次数据，其他设备上的改动也能更新到小组件和提醒。 */
public class SyncJob extends JobService {
    private static final int PERIODIC = 100, NOW = 101;

    static void ensure(Context c) {
        JobScheduler js = c.getSystemService(JobScheduler.class);
        if (js.getPendingJob(PERIODIC) != null) return;
        js.schedule(new JobInfo.Builder(PERIODIC, new ComponentName(c, SyncJob.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPeriodic(15 * 60_000L)
                .setPersisted(true)
                .build());
    }

    static void now(Context c) {
        c.getSystemService(JobScheduler.class).schedule(new JobInfo.Builder(NOW, new ComponentName(c, SyncJob.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .build());
    }

    @Override
    public boolean onStartJob(JobParameters params) {
        Context c = getApplicationContext();
        new Thread(() -> {
            boolean ok = false;
            try { ok = Gist.pull(c); } finally { jobFinished(params, !ok && params.getJobId() == NOW); }
        }, "mcal-sync").start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return true;
    }
}
