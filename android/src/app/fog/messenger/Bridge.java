package app.fog.messenger;

import android.app.Activity;
import android.content.Intent;
import android.webkit.JavascriptInterface;

/** window.FogAndroid in the web app. */
public final class Bridge {
    private final Activity activity;
    public Bridge(Activity activity) { this.activity = activity; }

    @JavascriptInterface public void share(String text) {
        Intent i = new Intent(Intent.ACTION_SEND);
        i.setType("text/plain");
        i.putExtra(Intent.EXTRA_TEXT, text);
        activity.startActivity(Intent.createChooser(i, "\uCD08\uB300 \uB9C1\uD06C \uBCF4\uB0B4\uAE30"));
    }
}
