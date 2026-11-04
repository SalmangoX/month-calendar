package io.github.salmangox.monthcalendar;

import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;

import com.tencent.mm.opensdk.modelmsg.SendMessageToWX;
import com.tencent.mm.opensdk.modelmsg.WXImageObject;
import com.tencent.mm.opensdk.modelmsg.WXMediaMessage;
import com.tencent.mm.opensdk.openapi.IWXAPI;
import com.tencent.mm.opensdk.openapi.WXAPIFactory;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;

/**
 * 分享到微信（好友 / 朋友圈）：走微信开放平台的 SDK，微信里会显示「来自 节律」和图标。
 * 只用 AppID（公开的，写在这里没关系）；AppSecret 只给服务器用，App 里不放。
 */
final class WeChat {
    static final String APP_ID = "wx59c23ed2a963a305";
    private static IWXAPI api;

    static IWXAPI api(Context c) {
        if (api == null) {
            api = WXAPIFactory.createWXAPI(c.getApplicationContext(), APP_ID, true);
            api.registerApp(APP_ID);
        }
        return api;
    }

    static boolean ready(Context c) {
        try { return api(c).isWXAppInstalled(); } catch (Throwable t) { return false; }
    }

    /** bytes：图片文件的内容；moments=true 发朋友圈，否则发给好友（微信里自己选人） */
    static boolean shareImage(Context c, byte[] bytes, boolean png, boolean moments) {
        try {
            IWXAPI a = api(c);
            if (!a.isWXAppInstalled()) return false;
            WXImageObject img = new WXImageObject();
            // 新版微信（Android 11 起）：图片先存成文件，用只读的 content:// 地址交给微信（大图也不会超过系统的传输上限）
            if (a.getWXAppSupportAPI() >= 0x27000D00) {
                File d = ShareProvider.dir(c);
                File[] old = d.listFiles();
                if (old != null) for (File f : old) if (System.currentTimeMillis() - f.lastModified() > 3600_000) //noinspection ResultOfMethodCallIgnored
                    f.delete();
                File f = new File(d, "cadence-" + System.currentTimeMillis() + (png ? ".png" : ".jpg"));
                try (FileOutputStream out = new FileOutputStream(f)) { out.write(bytes); }
                Uri u = ShareProvider.uri(f);
                c.grantUriPermission("com.tencent.mm", u, Intent.FLAG_GRANT_READ_URI_PERMISSION);
                img.imagePath = u.toString();
            } else {
                img.imageData = bytes;
            }
            WXMediaMessage msg = new WXMediaMessage(img);
            msg.thumbData = thumb(bytes);
            SendMessageToWX.Req req = new SendMessageToWX.Req();
            req.transaction = "img" + System.currentTimeMillis();
            req.message = msg;
            req.scene = moments ? SendMessageToWX.Req.WXSceneTimeline : SendMessageToWX.Req.WXSceneSession;
            return a.sendReq(req);
        } catch (Throwable t) {
            return false;
        }
    }

    /** 缩略图：微信要求不超过 64KB */
    private static byte[] thumb(byte[] bytes) {
        BitmapFactory.Options o = new BitmapFactory.Options();
        o.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(bytes, 0, bytes.length, o);
        int s = 1;
        while (Math.max(o.outWidth, o.outHeight) / s > 480) s *= 2;
        o = new BitmapFactory.Options();
        o.inSampleSize = s;
        Bitmap b = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, o);
        if (b == null) return null;
        float k = 180f / Math.max(b.getWidth(), b.getHeight());
        Bitmap t = Bitmap.createScaledBitmap(b, Math.max(1, Math.round(b.getWidth() * k)), Math.max(1, Math.round(b.getHeight() * k)), true);
        for (int q = 85; q >= 30; q -= 15) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            t.compress(Bitmap.CompressFormat.JPEG, q, out);
            if (out.size() < 60 * 1024) return out.toByteArray();
        }
        return null;
    }
}
