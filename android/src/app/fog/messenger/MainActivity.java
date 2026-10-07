package app.fog.messenger;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Wraps the fog web app. Files are served from assets/www on a secure https origin so camera and mic work. */
public class MainActivity extends Activity {
    static final String HOST = "appassets.androidplatform.net";
    WebView web;
    PermissionRequest pending;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().setStatusBarColor(0xFF0D0F12);
        getWindow().setNavigationBarColor(0xFF0D0F12);
        web = new WebView(this);
        web.setBackgroundColor(0xFF0D0F12);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setUserAgentString(s.getUserAgentString() + " FogApp/0.1");
        web.addJavascriptInterface(new Bridge(this), "FogAndroid");

        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (!HOST.equals(u.getHost())) return null;
                String p = u.getPath();
                if (p == null || p.isEmpty() || p.equals("/")) p = "/index.html";
                try {
                    InputStream in = getAssets().open("www" + p);
                    String m = mime(p);
                    WebResourceResponse res = new WebResourceResponse(m, m.startsWith("image/") ? null : "utf-8", in);
                    Map<String, String> h = new HashMap<>();
                    h.put("Cache-Control", "no-cache");
                    res.setResponseHeaders(h);
                    return res;
                } catch (Exception e) {
                    return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", null, null);
                }
            }
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (HOST.equals(u.getHost())) return false;
                startActivity(new Intent(Intent.ACTION_VIEW, u));
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(final PermissionRequest req) {
                runOnUiThread(new Runnable() { public void run() {
                    pending = req;
                    List<String> need = new ArrayList<>();
                    for (String res : req.getResources()) {
                        if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(res) && !has(Manifest.permission.CAMERA)) need.add(Manifest.permission.CAMERA);
                        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(res) && !has(Manifest.permission.RECORD_AUDIO)) need.add(Manifest.permission.RECORD_AUDIO);
                    }
                    if (need.isEmpty()) grantPending();
                    else requestPermissions(need.toArray(new String[0]), 1);
                }});
            }
            @Override public boolean onConsoleMessage(ConsoleMessage m) {
                android.util.Log.d("fog", m.message() + " (" + m.sourceId() + ":" + m.lineNumber() + ")");
                return true;
            }
        });

        Uri data = getIntent().getData();
        String q = (data != null && data.getQuery() != null) ? "?" + data.getQuery() : "";
        web.loadUrl("https://" + HOST + "/index.html" + q);
    }

    boolean has(String perm) { return checkSelfPermission(perm) == PackageManager.PERMISSION_GRANTED; }

    void grantPending() {
        if (pending == null) return;
        List<String> ok = new ArrayList<>();
        for (String res : pending.getResources()) {
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(res) && has(Manifest.permission.CAMERA)) ok.add(res);
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(res) && has(Manifest.permission.RECORD_AUDIO)) ok.add(res);
        }
        if (ok.isEmpty()) pending.deny(); else pending.grant(ok.toArray(new String[0]));
        pending = null;
    }

    @Override public void onRequestPermissionsResult(int code, String[] perms, int[] results) { grantPending(); }

    @Override public void onBackPressed() {
        web.evaluateJavascript("window.fogBack ? window.fogBack() : false", new ValueCallback<String>() {
            public void onReceiveValue(String v) { if (!"true".equals(v)) MainActivity.super.onBackPressed(); }
        });
    }

    @Override protected void onPause() { super.onPause(); web.onPause(); }
    @Override protected void onResume() { super.onResume(); web.onResume(); }

    static String mime(String p) {
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js")) return "text/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".json") || p.endsWith(".webmanifest")) return "application/json";
        return "application/octet-stream";
    }
}
