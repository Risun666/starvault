package com.starvault.app;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.DownloadListener;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * StarVault Android shell.
 *
 * The web app is shipped in assets/www and served from a virtual HTTPS origin
 * (https://starvault.app/) via shouldInterceptRequest. A real https origin is
 * important: file:// origins do not get a stable, persistent localStorage, and
 * cross-origin fetch to api.github.com would be blocked.
 */
public class MainActivity extends Activity {

    private static final String HOST = "starvault.app";
    private static final String BASE = "https://" + HOST;
    private static final int REQ_FILE = 1001;

    private WebView web;
    private ValueCallback<Uri[]> filePathCallback;
    private long lastBackAt = 0L;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        web = new WebView(this);
        web.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        web.setBackgroundColor(Color.WHITE);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // localStorage: username + classification records
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);         // file chooser -> content:// URIs
        s.setUseWideViewPort(true);            // honour <meta name="viewport">
        s.setLoadWithOverviewMode(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setMediaPlaybackRequiresUserGesture(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        }
        s.setUserAgentString(s.getUserAgentString() + " StarVaultAndroid/1.0");

        web.addJavascriptInterface(new Bridge(), "StarVaultAndroid");
        web.setWebViewClient(new LocalClient());
        web.setWebChromeClient(new LocalChrome());
        web.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition,
                                        String mimeType, long contentLength) {
                if (url != null && url.startsWith("blob:")) {
                    showToast("请使用应用内的导出按钮保存文件");
                    return;
                }
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                } catch (Exception e) {
                    showToast("无法打开下载链接：" + e.getMessage());
                }
            }
        });

        // Always load the local entry point. The activity declares configChanges,
        // so rotations do not recreate it; if the process was killed, the
        // persisted localStorage is restored from disk automatically.
        web.loadUrl(BASE + "/index.html");
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) {
            web.goBack();
            return;
        }
        long now = System.currentTimeMillis();
        if (now - lastBackAt < 2000L) {
            super.onBackPressed();
        } else {
            lastBackAt = now;
            showToast("再按一次退出星仓");
        }
    }

    private void showToast(final String msg) {
        runOnUiThread(new Runnable() {
            @Override public void run() {
                Toast.makeText(MainActivity.this, msg, Toast.LENGTH_LONG).show();
            }
        });
    }

    /* ------------------------------------------------------------------ */
    /* Local asset serving                                                 */
    /* ------------------------------------------------------------------ */

    private class LocalClient extends WebViewClient {

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                return serve(request.getUrl().toString());
            }
            return null;
        }

        // Legacy overload kept for older WebView implementations.
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
            return serve(url);
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                return handleExternal(request.getUrl().toString());
            }
            return false;
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return handleExternal(url);
        }

        private boolean handleExternal(String url) {
            Uri u = Uri.parse(url);
            String scheme = u.getScheme();
            String host = u.getHost();
            if (HOST.equalsIgnoreCase(host) &&
                    ("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme))) {
                return false; // served from assets
            }
            if ("blob".equalsIgnoreCase(scheme) || "data".equalsIgnoreCase(scheme)) {
                return true;  // handled by DownloadListener / JS bridge
            }
            try {
                Intent i = new Intent(Intent.ACTION_VIEW, u);
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(i);
            } catch (Exception e) {
                showToast("没有可用的应用打开此链接");
            }
            return true; // open GitHub links in the real browser, never inside the WebView
        }

        private WebResourceResponse serve(String url) {
            Uri u = Uri.parse(url);
            String scheme = u.getScheme();
            if (!HOST.equalsIgnoreCase(u.getHost()) ||
                    !("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme))) {
                return null; // let WebView do the real network request (GitHub API, DoH, AI ...)
            }
            String path = u.getPath();
            if (path == null || path.length() == 0 || "/".equals(path)) path = "/index.html";
            if (path.contains("..")) return notFound();

            Map<String, String> headers = new HashMap<String, String>();
            headers.put("Cache-Control", "no-cache");
            headers.put("Access-Control-Allow-Origin", "*");
            try {
                InputStream in = getAssets().open("www" + path);
                return new WebResourceResponse(mimeOf(path), "UTF-8", 200, "OK", headers, in);
            } catch (IOException e) {
                return notFound();
            }
        }

        private WebResourceResponse notFound() {
            Map<String, String> headers = new HashMap<String, String>();
            headers.put("Cache-Control", "no-store");
            InputStream body = new ByteArrayInputStream("Not found".getBytes());
            return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", headers, body);
        }
    }

    /* ------------------------------------------------------------------ */
    /* File chooser (used by "import backup")                              */
    /* ------------------------------------------------------------------ */

    private class LocalChrome extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                         FileChooserParams params) {
            if (filePathCallback != null) filePathCallback.onReceiveValue(null);
            filePathCallback = callback;
            try {
                Intent chooser = Intent.createChooser(params.createIntent(), "选择备份文件");
                startActivityForResult(chooser, REQ_FILE);
                return true;
            } catch (Exception e) {
                filePathCallback = null;
                showToast("无法打开文件选择器：" + e.getMessage());
                return false;
            }
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE) {
            if (filePathCallback != null) {
                Uri[] result = null;
                if (resultCode == RESULT_OK && data != null) {
                    if (data.getData() != null) {
                        result = new Uri[]{data.getData()};
                    } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN
                            && data.getClipData() != null) {
                        int n = data.getClipData().getItemCount();
                        result = new Uri[n];
                        for (int i = 0; i < n; i++) {
                            result[i] = data.getClipData().getItemAt(i).getUri();
                        }
                    }
                }
                filePathCallback.onReceiveValue(result);
                filePathCallback = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    /* ------------------------------------------------------------------ */
    /* Javascript bridge                                                   */
    /* ------------------------------------------------------------------ */

    private class Bridge {

        /** Export JSON / Markdown backups to the public Downloads folder. */
        @android.webkit.JavascriptInterface
        public void saveFile(String name, String content) {
            try {
                final String safe = (name == null ? "starvault-export.txt" : name)
                        .replaceAll("[^A-Za-z0-9._\\-]", "_");
                final String where;
                byte[] bytes = (content == null ? "" : content).getBytes("UTF-8");

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues cv = new ContentValues();
                    cv.put(MediaStore.Downloads.DISPLAY_NAME, safe);
                    cv.put(MediaStore.Downloads.MIME_TYPE, mimeOf(safe));
                    cv.put(MediaStore.Downloads.RELATIVE_PATH,
                            Environment.DIRECTORY_DOWNLOADS + "/StarVault");
                    cv.put(MediaStore.Downloads.IS_PENDING, 1);
                    Uri uri = getContentResolver().insert(
                            MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                    if (uri == null) throw new IOException("MediaStore insert failed");
                    OutputStream os = getContentResolver().openOutputStream(uri);
                    if (os == null) throw new IOException("openOutputStream failed");
                    os.write(bytes);
                    os.flush();
                    os.close();
                    ContentValues done = new ContentValues();
                    done.put(MediaStore.Downloads.IS_PENDING, 0);
                    getContentResolver().update(uri, done, null, null);
                    where = "下载 / StarVault / " + safe;
                } else {
                    File dir = new File(Environment.getExternalStoragePublicDirectory(
                            Environment.DIRECTORY_DOWNLOADS), "StarVault");
                    if (!dir.exists() && !dir.mkdirs()) throw new IOException("mkdirs failed");
                    File f = new File(dir, safe);
                    FileOutputStream fos = new FileOutputStream(f);
                    fos.write(bytes);
                    fos.flush();
                    fos.close();
                    where = f.getAbsolutePath();
                }
                showToast("已保存：" + where);
            } catch (Exception e) {
                showToast("保存失败：" + e.getMessage());
            }
        }

        /** Keep the Android status bar in sync with the in-app light/dark theme. */
        @android.webkit.JavascriptInterface
        public void setStatusBar(final String color, final boolean darkIcons) {
            runOnUiThread(new Runnable() {
                @Override public void run() {
                    try {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                            getWindow().setStatusBarColor(Color.parseColor(color));
                        }
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                            View decor = getWindow().getDecorView();
                            int flags = decor.getSystemUiVisibility();
                            if (darkIcons) {
                                flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                            } else {
                                flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                            }
                            decor.setSystemUiVisibility(flags);
                        }
                    } catch (Exception ignored) {
                    }
                }
            });
        }

        @android.webkit.JavascriptInterface
        public String appVersion() {
            return "1.0.0";
        }
    }

    /* ------------------------------------------------------------------ */

    private static String mimeOf(String path) {
        String p = path.toLowerCase();
        int q = p.indexOf('?');
        if (q >= 0) p = p.substring(0, q);
        if (p.endsWith(".html") || p.endsWith(".htm")) return "text/html";
        if (p.endsWith(".js") || p.endsWith(".mjs")) return "application/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".json")) return "application/json";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".webp")) return "image/webp";
        if (p.endsWith(".ico")) return "image/x-icon";
        if (p.endsWith(".woff")) return "font/woff";
        if (p.endsWith(".woff2")) return "font/woff2";
        if (p.endsWith(".ttf")) return "font/ttf";
        if (p.endsWith(".md")) return "text/markdown";
        return "application/octet-stream";
    }
}
