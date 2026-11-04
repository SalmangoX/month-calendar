package io.github.salmangox.monthcalendar;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;

/**
 * 把要分享的图片交给别的 App（微信）：只开放缓存里 share 文件夹下的图片，只读，
 * 而且只有被单独授权（grantUriPermission）的 App 才能读。不用 androidx 的 FileProvider，免得多一个依赖。
 */
public final class ShareProvider extends ContentProvider {
    static final String AUTH = BuildConfig.APPLICATION_ID + ".share";

    static File dir(android.content.Context c) {
        File d = new File(c.getCacheDir(), "share");
        //noinspection ResultOfMethodCallIgnored
        d.mkdirs();
        return d;
    }

    static Uri uri(File f) { return new Uri.Builder().scheme("content").authority(AUTH).appendPath(f.getName()).build(); }

    private File file(Uri u) throws FileNotFoundException {
        String n = u.getLastPathSegment();
        if (n == null || n.contains("/") || n.contains("..")) throw new FileNotFoundException();
        File f = new File(dir(getContext()), n);
        if (!f.isFile()) throw new FileNotFoundException();
        return f;
    }

    @Override public boolean onCreate() { return true; }

    @Override public ParcelFileDescriptor openFile(Uri u, String mode) throws FileNotFoundException {
        return ParcelFileDescriptor.open(file(u), ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override public String getType(Uri u) {
        String n = u.getLastPathSegment();
        return n != null && n.endsWith(".png") ? "image/png" : "image/jpeg";
    }

    @Override public Cursor query(Uri u, String[] proj, String sel, String[] args, String sort) {
        try {
            File f = file(u);
            MatrixCursor c = new MatrixCursor(new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE});
            c.addRow(new Object[]{f.getName(), f.length()});
            return c;
        } catch (FileNotFoundException e) { return null; }
    }

    @Override public Uri insert(Uri u, ContentValues v) { return null; }
    @Override public int delete(Uri u, String s, String[] a) { return 0; }
    @Override public int update(Uri u, ContentValues v, String s, String[] a) { return 0; }
}
