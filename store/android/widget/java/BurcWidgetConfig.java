package __PKG__;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/** Widget eklenirken ya da "Değiştir"e dokununca burç seçimi (12 burç, 3 sütun). */
public class BurcWidgetConfig extends Activity {
    int id = AppWidgetManager.INVALID_APPWIDGET_ID;

    int dp(int v) { return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()); }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        setResult(RESULT_CANCELED);
        Bundle ex = getIntent().getExtras();
        if (ex != null) id = ex.getInt(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        if (id == AppWidgetManager.INVALID_APPWIDGET_ID) { finish(); return; }

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(20), dp(20), dp(20), dp(16));
        GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[] {0xFF7A3CFF, 0xFFFF4F8B});
        bg.setCornerRadius(dp(24));
        root.setBackground(bg);

        TextView t = new TextView(this);
        t.setText("Burcunu seç");
        t.setTextColor(Color.WHITE);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
        t.setTypeface(t.getTypeface(), android.graphics.Typeface.BOLD);
        root.addView(t);
        TextView s = new TextView(this);
        s.setText("Falcı Teyze her gün bu burcun yorumunu ana ekranına getirir.");
        s.setTextColor(0xE6FFFFFF);
        s.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        s.setPadding(0, dp(4), 0, dp(12));
        root.addView(s);

        String cur = BurcWidget.signOf(this, id);
        LinearLayout row = null;
        for (int i = 0; i < BurcWidget.Z.length; i++) {
            if (i % 3 == 0) {
                row = new LinearLayout(this);
                row.setOrientation(LinearLayout.HORIZONTAL);
                root.addView(row, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
            }
            final String[] z = BurcWidget.Z[i];
            Button btn = new Button(this);
            btn.setText(z[2] + "\n" + z[1]);
            btn.setAllCaps(false);
            btn.setTextColor(Color.WHITE);
            btn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
            btn.setGravity(Gravity.CENTER);
            GradientDrawable bb = new GradientDrawable();
            bb.setCornerRadius(dp(14));
            bb.setColor(z[0].equals(cur) ? 0x66FFFFFF : 0x26FFFFFF);
            btn.setBackground(bb);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, dp(64), 1f);
            lp.setMargins(dp(4), dp(4), dp(4), dp(4));
            btn.setOnClickListener(new View.OnClickListener() {
                @Override public void onClick(View v) { choose(z[0]); }
            });
            row.addView(btn, lp);
        }
        ScrollView sv = new ScrollView(this);
        sv.addView(root);
        setContentView(sv);
    }

    void choose(String z) {
        BurcWidget.prefs(this).edit().putString("z" + id, z).putString("last", z).apply();
        AppWidgetManager m = AppWidgetManager.getInstance(this);
        BurcWidget.update(this, m, id, false); // önbellekteki yorumla hemen göster, sonra yenile
        BurcWidget.refreshAsync(this, new int[] {id}, null);
        setResult(RESULT_OK, new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id));
        finish();
    }
}
