package io.github.salmangox.monthcalendar;

import android.content.ContentResolver;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;

import org.json.JSONObject;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * 自动备份到手机文件夹：用户在系统的文件夹选择器里选一次（App 一直保有写入权限），
 * 之后每天第一次有机会时（提醒引擎每次醒来都会看一眼）写一份「节律自动备份-日期.json」，只留最近 7 份。
 * 文件内容和「导出备份」一样，可以直接在「导入备份」里用。手动导出的文件名不同，不会被删。
 */
final class Backup {
    static final String KEY_TREE = "backupTree", KEY_LAST = "backupLast", KEY_AT = "backupAt";
    private static final String PREFIX = "节律自动备份-";
    private static final int KEEP = 7;

    private Backup() { }

    static boolean on(Context c) { return !Store.prefs(c).getString(KEY_TREE, "").isEmpty(); }

    /** 今天还没备份过就在后台备份一份（不阻塞提醒、小组件） */
    static void maybe(Context c) {
        SharedPreferences p = Store.prefs(c);
        if (p.getString(KEY_TREE, "").isEmpty()) return;
        if (LocalDate.now().toString().equals(p.getString(KEY_LAST, ""))) return;
        Context app = c.getApplicationContext();
        new Thread(() -> write(app), "mcal-backup").start();
    }

    /** 现在就备份一份（同一天再备份会覆盖当天那份） */
    static synchronized boolean write(Context c) {
        SharedPreferences p = Store.prefs(c);
        String u = p.getString(KEY_TREE, "");
        if (u.isEmpty()) return false;
        try {
            Uri tree = Uri.parse(u);
            ContentResolver r = c.getContentResolver();
            String root = DocumentsContract.getTreeDocumentId(tree);
            Uri dir = DocumentsContract.buildDocumentUriUsingTree(tree, root);
            String today = LocalDate.now().toString(), name = PREFIX + today + ".json";
            List<String[]> mine = list(r, tree, root);   // [文档 id, 文件名]
            Uri target = null;
            for (String[] f : mine) if (f[1].equals(name)) target = DocumentsContract.buildDocumentUriUsingTree(tree, f[0]);
            if (target == null) target = DocumentsContract.createDocument(r, dir, "application/json", name);
            if (target == null) return false;
            Store.data(c);
            String json = Store.json(c);
            if (json == null || json.isEmpty()) return false;
            try (OutputStream out = r.openOutputStream(target, "wt")) {
                if (out == null) return false;
                out.write(json.getBytes(StandardCharsets.UTF_8));
            }
            // 只留最近 KEEP 份自动备份
            List<String[]> again = list(r, tree, root);
            Collections.sort(again, (x, y) -> y[1].compareTo(x[1]));
            for (int i = KEEP; i < again.size(); i++) {
                try { DocumentsContract.deleteDocument(r, DocumentsContract.buildDocumentUriUsingTree(tree, again.get(i)[0])); } catch (Exception ignored) { }
            }
            p.edit().putString(KEY_LAST, today).putLong(KEY_AT, System.currentTimeMillis()).apply();
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /** 文件夹里自动备份的那些文件 */
    private static List<String[]> list(ContentResolver r, Uri tree, String root) {
        List<String[]> out = new ArrayList<>();
        Uri kids = DocumentsContract.buildChildDocumentsUriUsingTree(tree, root);
        try (Cursor cur = r.query(kids, new String[]{DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME}, null, null, null)) {
            if (cur == null) return out;
            while (cur.moveToNext()) {
                String id = cur.getString(0), n = cur.getString(1);
                if (n != null && n.startsWith(PREFIX) && n.endsWith(".json")) out.add(new String[]{id, n});
            }
        } catch (Exception ignored) { }
        return out;
    }

    /** 文件夹的名字（显示在设置里） */
    static String folderName(Context c) {
        String u = Store.prefs(c).getString(KEY_TREE, "");
        if (u.isEmpty()) return "";
        try {
            Uri tree = Uri.parse(u);
            Uri doc = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
            try (Cursor cur = c.getContentResolver().query(doc, new String[]{DocumentsContract.Document.COLUMN_DISPLAY_NAME}, null, null, null)) {
                if (cur != null && cur.moveToFirst()) return cur.getString(0);
            }
        } catch (Exception ignored) { }
        return "";
    }

    static JSONObject info(Context c) {
        JSONObject o = new JSONObject();
        SharedPreferences p = Store.prefs(c);
        try {
            o.put("on", on(c));
            o.put("folder", folderName(c));
            o.put("at", p.getLong(KEY_AT, 0));
        } catch (Exception ignored) { }
        return o;
    }

    static void off(Context c) {
        SharedPreferences p = Store.prefs(c);
        String u = p.getString(KEY_TREE, "");
        if (!u.isEmpty()) {
            try { c.getContentResolver().releasePersistableUriPermission(Uri.parse(u), android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION | android.content.Intent.FLAG_GRANT_WRITE_URI_PERMISSION); } catch (Exception ignored) { }
        }
        p.edit().remove(KEY_TREE).remove(KEY_LAST).remove(KEY_AT).apply();
    }
}
