package io.github.salmangox.monthcalendar;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import android.util.Base64;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** 本机存储：日历数据（JSON 文件）、偏好设置、用安卓 Keystore 加密保存的 GitHub 令牌。 */
final class Store {
    private static final String FILE = "calendar.json";
    private static final String KEY_ALIAS = "mcal_token";
    private static Data cache;
    private static String cacheJson;

    private Store() { }

    static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences("mcal", Context.MODE_PRIVATE);
    }

    // ---------- 日历数据 ----------
    static synchronized Data data(Context c) {
        if (cache == null) {
            cacheJson = read(c);
            cache = Data.parse(cacheJson);
        }
        return cache;
    }

    static synchronized boolean hasData(Context c) {
        data(c);
        return cacheJson != null && !cacheJson.isEmpty();
    }

    /** 把新数据合并进本机（replace=true 时直接替换），返回内容是否有变化 */
    static synchronized boolean put(Context c, String json, boolean replace) {
        JSONObject incoming = Data.obj(json);
        if (incoming == null) return false;
        data(c);
        JSONObject cur = Data.obj(cacheJson);
        JSONObject next = replace || cur == null ? incoming : Data.merge(cur, incoming);
        String out = next.toString();
        if (out.equals(cacheJson)) return false;
        write(c, out);
        cacheJson = out;
        cache = Data.parse(out);
        return true;
    }

    static synchronized void clearData(Context c) {
        new AtomicFile(new File(c.getFilesDir(), FILE)).delete();
        cacheJson = "";
        cache = new Data();
    }

    private static String read(Context c) {
        try {
            byte[] b = new AtomicFile(new File(c.getFilesDir(), FILE)).readFully();
            return new String(b, StandardCharsets.UTF_8);
        } catch (IOException e) {
            return "";
        }
    }

    private static void write(Context c, String s) {
        AtomicFile f = new AtomicFile(new File(c.getFilesDir(), FILE));
        FileOutputStream out = null;
        try {
            out = f.startWrite();
            out.write(s.getBytes(StandardCharsets.UTF_8));
            f.finishWrite(out);
        } catch (IOException e) {
            if (out != null) f.failWrite(out);
        }
    }

    // ---------- 令牌（Keystore AES-GCM 加密，密钥不离开手机的安全芯片） ----------
    private static SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (ks.containsAlias(KEY_ALIAS)) return (SecretKey) ks.getKey(KEY_ALIAS, null);
        KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        kg.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build());
        return kg.generateKey();
    }

    static synchronized void setToken(Context c, String token) {
        SharedPreferences.Editor e = prefs(c).edit();
        if (token == null || token.isEmpty()) {
            e.remove("tok").remove("tokIv");
        } else {
            try {
                Cipher ci = Cipher.getInstance("AES/GCM/NoPadding");
                ci.init(Cipher.ENCRYPT_MODE, key());
                byte[] ct = ci.doFinal(token.getBytes(StandardCharsets.UTF_8));
                e.putString("tok", Base64.encodeToString(ct, Base64.NO_WRAP))
                        .putString("tokIv", Base64.encodeToString(ci.getIV(), Base64.NO_WRAP));
            } catch (Exception ex) {
                e.remove("tok").remove("tokIv");
            }
        }
        e.apply();
    }

    static synchronized String token(Context c) {
        SharedPreferences p = prefs(c);
        String ct = p.getString("tok", ""), iv = p.getString("tokIv", "");
        if (ct.isEmpty() || iv.isEmpty()) return "";
        try {
            Cipher ci = Cipher.getInstance("AES/GCM/NoPadding");
            ci.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)));
            return new String(ci.doFinal(Base64.decode(ct, Base64.NO_WRAP)), StandardCharsets.UTF_8);
        } catch (Exception ex) {
            return "";
        }
    }
}
