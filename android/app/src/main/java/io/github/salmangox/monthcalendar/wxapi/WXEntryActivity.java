package io.github.salmangox.monthcalendar.wxapi;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;

import com.tencent.mm.opensdk.modelbase.BaseReq;
import com.tencent.mm.opensdk.modelbase.BaseResp;
import com.tencent.mm.opensdk.openapi.IWXAPIEventHandler;

/** 微信分享完回到 App 时，微信要求有这个页面接收结果（包名.wxapi.WXEntryActivity）；这里只是收下就关掉 */
public class WXEntryActivity extends Activity implements IWXAPIEventHandler {
    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        handle(getIntent());
    }

    @Override protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        setIntent(i);
        handle(i);
    }

    private void handle(Intent i) {
        try { io.github.salmangox.monthcalendar.WeChatAccess.api(this).handleIntent(i, this); } catch (Throwable ignored) { }
        finish();
    }

    @Override public void onReq(BaseReq req) { }
    @Override public void onResp(BaseResp resp) { finish(); }
}
