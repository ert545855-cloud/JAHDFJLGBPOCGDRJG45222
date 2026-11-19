package __PKG__;

import android.app.Activity;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.widget.Toast;

/**
 * Uygulamadaki "Ana ekrana ekle" düğmesi buraya gelir (swipeup-widget://burc?z=koc).
 * Android 8+ ana ekranı destekliyorsa sistemin "widget ekle" penceresini açar; burç eklenince widget'a yazılır.
 */
public class BurcPinActivity extends Activity {
    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        Uri d = getIntent().getData();
        String z = d != null ? d.getQueryParameter("z") : null;
        if (BurcWidget.info(z) == null) z = null;
        if (z != null) BurcWidget.prefs(this).edit().putString("last", z).apply();
        boolean asked = false;
        if (Build.VERSION.SDK_INT >= 26) {
            AppWidgetManager m = getSystemService(AppWidgetManager.class);
            if (m != null && m.isRequestPinAppWidgetSupported()) {
                Intent cb = new Intent(this, BurcWidget.class).setAction(BurcWidget.ACTION_PINNED);
                if (z != null) cb.putExtra("z", z);
                int fl = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0); // sistem widget kimliğini ekler
                asked = m.requestPinAppWidget(new ComponentName(this, BurcWidget.class), null, PendingIntent.getBroadcast(this, 1, cb, fl));
            }
        }
        if (!asked) Toast.makeText(this, "Ana ekranda boş bir yere basılı tut → Widget'lar → SwipeUp → Falcı Teyze", Toast.LENGTH_LONG).show();
        finish();
    }
}
