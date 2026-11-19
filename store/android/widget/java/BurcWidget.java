package __PKG__;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Falcı Teyze burç widget'ı: seçilen burcun günlük yorumunu ana ekranda gösterir.
 * Yorum sitedeki herkese açık uç noktadan (/api/burc/widget) gelir; 3 saatte bir ve gece yarısından sonra yenilenir.
 * Dokununca uygulama burç sayfasında açılır; "Değiştir" ile burç seçilir. Çevrimdışıyken son yorum gösterilir.
 */
public class BurcWidget extends AppWidgetProvider {
    static final String PREFS = "burc_widget";
    static final String ACTION_PINNED = "__PKG__.BURC_PINNED";
    static final String ACTION_REFRESH = "__PKG__.BURC_REFRESH";
    static final String BASE = "https://__HOST__";
    static final String[][] Z = {
        {"koc", "Koç", "♈"}, {"boga", "Boğa", "♉"}, {"ikizler", "İkizler", "♊"}, {"yengec", "Yengeç", "♋"},
        {"aslan", "Aslan", "♌"}, {"basak", "Başak", "♍"}, {"terazi", "Terazi", "♎"}, {"akrep", "Akrep", "♏"},
        {"yay", "Yay", "♐"}, {"oglak", "Oğlak", "♑"}, {"kova", "Kova", "♒"}, {"balik", "Balık", "♓"}
    };

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
    static String[] info(String z) { for (String[] r : Z) if (r[0].equals(z)) return r; return null; }
    static String signOf(Context c, int id) { SharedPreferences p = prefs(c); return p.getString("z" + id, p.getString("last", null)); }

    @Override
    public void onUpdate(final Context ctx, final AppWidgetManager m, final int[] ids) { refreshAsync(ctx, ids, goAsync()); }

    @Override
    public void onDeleted(Context ctx, int[] ids) {
        SharedPreferences.Editor e = prefs(ctx).edit();
        for (int id : ids) e.remove("z" + id);
        e.apply();
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        super.onReceive(ctx, intent);
        String a = intent.getAction();
        if (ACTION_PINNED.equals(a)) { // ana ekrana ekle düğmesiyle eklendi: burç uygulamadan geldi
            int id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
            String z = intent.getStringExtra("z");
            if (id != AppWidgetManager.INVALID_APPWIDGET_ID && info(z) != null) prefs(ctx).edit().putString("z" + id, z).apply();
            if (id != AppWidgetManager.INVALID_APPWIDGET_ID) refreshAsync(ctx, new int[] {id}, goAsync());
        } else if (ACTION_REFRESH.equals(a) || Intent.ACTION_DATE_CHANGED.equals(a)) {
            AppWidgetManager m = AppWidgetManager.getInstance(ctx);
            refreshAsync(ctx, m.getAppWidgetIds(new ComponentName(ctx, BurcWidget.class)), goAsync());
        }
    }

    static void refreshAsync(final Context ctx, final int[] ids, final PendingResult pr) {
        final Context app = ctx.getApplicationContext();
        new Thread(new Runnable() {
            @Override public void run() {
                try {
                    AppWidgetManager m = AppWidgetManager.getInstance(app);
                    for (int id : ids) update(app, m, id, true);
                } finally { if (pr != null) pr.finish(); }
            }
        }).start();
    }

    static PendingIntent configIntent(Context ctx, int id) {
        Intent i = new Intent(ctx, BurcWidgetConfig.class);
        i.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
        i.setData(Uri.parse("swipeup-widget://config/" + id)); // her widget için ayrı PendingIntent
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        return PendingIntent.getActivity(ctx, 1000 + id, i, PendingIntent.FLAG_UPDATE_CURRENT | immutable());
    }

    static int immutable() { return Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0; }

    static void update(Context ctx, AppWidgetManager m, int id, boolean fetch) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.burc_widget);
        String z = signOf(ctx, id);
        String[] zi = info(z);
        v.setOnClickPendingIntent(R.id.bw_change, configIntent(ctx, id));
        if (zi == null) {
            v.setTextViewText(R.id.bw_sym, "✨");
            v.setTextViewText(R.id.bw_name, "Burcunu seç");
            v.setTextViewText(R.id.bw_day, "Falcı Teyze");
            v.setTextViewText(R.id.bw_text, "Dokun ve burcunu seç; Falcı Teyze her gün yorumunu buraya getirsin.");
            v.setOnClickPendingIntent(R.id.bw_root, configIntent(ctx, id));
            m.updateAppWidget(id, v);
            return;
        }
        SharedPreferences p = prefs(ctx);
        String text = p.getString("t_" + z, null);
        String day = p.getString("d_" + z, "");
        if (fetch) {
            try {
                JSONObject j = get(BASE + "/api/burc/widget?z=" + z);
                String t = j.optString("text", "");
                if (t.length() > 0) {
                    text = t; day = j.optString("dayLabel", "");
                    p.edit().putString("t_" + z, text).putString("d_" + z, day).apply();
                }
            } catch (Exception ignored) { /* çevrimdışı: son yorum kalır */ }
        }
        v.setTextViewText(R.id.bw_sym, zi[2]);
        v.setTextViewText(R.id.bw_name, zi[1]);
        v.setTextViewText(R.id.bw_day, day.length() > 0 ? day : "Falcı Teyze");
        v.setTextViewText(R.id.bw_text, text != null ? text : "Yorum yükleniyor… İnternete bağlanınca gelecek.");
        Intent open = new Intent(ctx, LauncherActivity.class);
        open.setAction(Intent.ACTION_VIEW);
        open.setData(Uri.parse(BASE + "/#/burc?z=" + z));
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        v.setOnClickPendingIntent(R.id.bw_root, PendingIntent.getActivity(ctx, 2000 + id, open, PendingIntent.FLAG_UPDATE_CURRENT | immutable()));
        m.updateAppWidget(id, v);
    }

    static JSONObject get(String url) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(8000);
        c.setReadTimeout(10000);
        c.setRequestProperty("Accept", "application/json");
        c.setRequestProperty("User-Agent", "SwipeUp-Widget");
        try {
            if (c.getResponseCode() != 200) throw new Exception("HTTP " + c.getResponseCode());
            BufferedReader r = new BufferedReader(new InputStreamReader(c.getInputStream(), "UTF-8"));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = r.readLine()) != null) sb.append(line);
            r.close();
            return new JSONObject(sb.toString());
        } finally { c.disconnect(); }
    }
}
