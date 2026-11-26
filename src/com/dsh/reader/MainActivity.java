package com.dsh.reader;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.pdf.PdfRenderer;
import android.net.Uri;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

public class MainActivity extends Activity {

    private static final int REQ_PICK = 1001;
    private WebView web;
    private String pickKind = "novel";
    private final Map<String, PdfRenderer> pdfRenderers = new HashMap<String, PdfRenderer>();
    private final Map<String, ParcelFileDescriptor> pdfFds = new HashMap<String, ParcelFileDescriptor>();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window w = getWindow();
        w.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
        w.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        w.setStatusBarColor(Color.parseColor("#F5F6F8"));
        w.setNavigationBarColor(Color.parseColor("#F5F6F8"));
        if (android.os.Build.VERSION.SDK_INT >= 23) {
            View dv = w.getDecorView();
            dv.setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        }

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setBuiltInZoomControls(false);
        s.setSupportZoom(false);
        s.setTextZoom(100);
        try {
            s.setAllowFileAccessFromFileURLs(true);
            s.setAllowUniversalAccessFromFileURLs(true);
        } catch (Throwable ignored) { }
        if (android.os.Build.VERSION.SDK_INT >= 21) {
            web.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        }
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient());
        web.setBackgroundColor(Color.parseColor("#F5F6F8"));
        web.addJavascriptInterface(this, "Native");

        setContentView(web);
        web.loadUrl("file:///android_asset/www/index.html");
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.handleBack&&window.handleBack()", null);
    }

    // ---------------- 文件选择 ----------------

    @JavascriptInterface
    public void pickFiles(final String kind) {
        runOnUiThread(new Runnable() {
            public void run() {
                pickKind = kind;
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
                        | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
                try {
                    startActivityForResult(i, REQ_PICK);
                } catch (Throwable t) {
                    toast("无法打开文件选择器");
                }
            }
        });
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req != REQ_PICK || res != RESULT_OK || data == null) return;

        JSONArray arr = new JSONArray();
        try {
            if (data.getClipData() != null) {
                int n = data.getClipData().getItemCount();
                for (int k = 0; k < n; k++) {
                    arr.put(describe(data.getClipData().getItemAt(k).getUri()));
                }
            } else if (data.getData() != null) {
                arr.put(describe(data.getData()));
            }
        } catch (Exception e) {
            toast("读取文件信息失败: " + e.getMessage());
        }
        final String json = arr.toString();
        final String kind = pickKind;
        runOnUiThread(new Runnable() {
            public void run() {
                web.evaluateJavascript("window.onPicked&&window.onPicked('" + kind + "'," + json + ")", null);
            }
        });
    }

    private JSONObject describe(Uri uri) throws Exception {
        try {
            getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } catch (Throwable ignored) { }
        String name = null;
        long size = -1;
        Cursor c = getContentResolver().query(uri, null, null, null, null);
        if (c != null) {
            try {
                int ni = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                int si = c.getColumnIndex(OpenableColumns.SIZE);
                if (c.moveToFirst()) {
                    if (ni >= 0) name = c.getString(ni);
                    if (si >= 0) size = c.getLong(si);
                }
            } finally {
                c.close();
            }
        }
        if (name == null) name = uri.getLastPathSegment();
        JSONObject o = new JSONObject();
        o.put("uri", uri.toString());
        o.put("name", name == null ? "未知文件" : name);
        o.put("size", size);
        return o;
    }

    // ---------------- 读文件 ----------------

    @JavascriptInterface
    public String readBase64(String uriStr) {
        try {
            InputStream in = getContentResolver().openInputStream(Uri.parse(uriStr));
            if (in == null) return "";
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[65536];
            int r;
            while ((r = in.read(buf)) > 0) bo.write(buf, 0, r);
            in.close();
            return Base64.encodeToString(bo.toByteArray(), Base64.NO_WRAP);
        } catch (Throwable t) {
            return "";
        }
    }

    // ---------------- PDF ----------------

    @JavascriptInterface
    public int pdfPages(String uriStr) {
        try {
            PdfRenderer r = renderer(uriStr);
            return r == null ? 0 : r.getPageCount();
        } catch (Throwable t) {
            return 0;
        }
    }

    @JavascriptInterface
    public String pdfPage(String uriStr, int index, int targetW) {
        try {
            PdfRenderer r = renderer(uriStr);
            if (r == null) return "";
            synchronized (r) {
                if (index < 0 || index >= r.getPageCount()) return "";
                PdfRenderer.Page p = r.openPage(index);
                float scale = targetW / (float) p.getWidth();
                int w = Math.max(1, Math.round(p.getWidth() * scale));
                int h = Math.max(1, Math.round(p.getHeight() * scale));
                Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
                bmp.eraseColor(Color.WHITE);
                p.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
                p.close();
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                bmp.compress(Bitmap.CompressFormat.JPEG, 82, bo);
                bmp.recycle();
                return "data:image/jpeg;base64," + Base64.encodeToString(bo.toByteArray(), Base64.NO_WRAP);
            }
        } catch (Throwable t) {
            return "";
        }
    }

    private PdfRenderer renderer(String uriStr) {
        try {
            PdfRenderer r = pdfRenderers.get(uriStr);
            if (r != null) return r;
            ParcelFileDescriptor fd = getContentResolver().openFileDescriptor(Uri.parse(uriStr), "r");
            if (fd == null) return null;
            r = new PdfRenderer(fd);
            pdfRenderers.put(uriStr, r);
            pdfFds.put(uriStr, fd);
            return r;
        } catch (Throwable t) {
            return null;
        }
    }

    // ---------------- 书架存储 ----------------

    private File libFile() {
        return new File(getFilesDir(), "library.json");
    }

    @JavascriptInterface
    public String loadLibrary() {
        try {
            File f = libFile();
            if (!f.exists()) return "[]";
            FileInputStream in = new FileInputStream(f);
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int r;
            while ((r = in.read(buf)) > 0) bo.write(buf, 0, r);
            in.close();
            return new String(bo.toByteArray(), "UTF-8");
        } catch (Throwable t) {
            return "[]";
        }
    }

    @JavascriptInterface
    public boolean saveLibrary(String json) {
        try {
            FileOutputStream out = new FileOutputStream(libFile());
            out.write(json.getBytes("UTF-8"));
            out.close();
            return true;
        } catch (Throwable t) {
            return false;
        }
    }

    @JavascriptInterface
    public void toast(final String msg) {
        runOnUiThread(new Runnable() {
            public void run() {
                Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show();
            }
        });
    }
}
