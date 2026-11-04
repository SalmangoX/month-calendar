package io.github.salmangox.monthcalendar;

import android.content.Context;

import com.tencent.mm.opensdk.openapi.IWXAPI;

/** 给 wxapi 包里的页面用（WeChat 类不公开） */
public final class WeChatAccess {
    private WeChatAccess() { }
    public static IWXAPI api(Context c) { return WeChat.api(c); }
}
