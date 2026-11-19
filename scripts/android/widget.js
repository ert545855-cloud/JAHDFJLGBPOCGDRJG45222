// Falcı Teyze burç widget'ını Bubblewrap'in ürettiği Android projesine ekler (generate.js çağırır).
// Kaynaklar: store/android/widget (java + res). __PKG__ paket adıyla, __HOST__ site adresiyle değiştirilir.
const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../store/android/widget');

function copyTree(from, to, map) {
  fs.mkdirSync(to, { recursive: true });
  for (const f of fs.readdirSync(from)) {
    const a = path.join(from, f); const b = path.join(to, f);
    if (fs.statSync(a).isDirectory()) copyTree(a, b, map);
    else fs.writeFileSync(b, map(fs.readFileSync(a, 'utf8')));
  }
}

module.exports = function addWidget(out, { packageId, host }) {
  const map = (s) => s.split('__PKG__').join(packageId).split('__HOST__').join(host);
  copyTree(path.join(SRC, 'java'), path.join(out, 'app/src/main/java', ...packageId.split('.')), map);
  copyTree(path.join(SRC, 'res'), path.join(out, 'app/src/main/res'), map);
  const mf = path.join(out, 'app/src/main/AndroidManifest.xml');
  let x = fs.readFileSync(mf, 'utf8');
  if (x.includes('BurcWidget')) return;
  const add = `
        <!-- Falcı Teyze burç widget'ı (scripts/android/widget.js) -->
        <receiver android:name=".BurcWidget" android:exported="false" android:label="@string/burc_widget_label">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
                <action android:name="android.intent.action.DATE_CHANGED" />
            </intent-filter>
            <meta-data android:name="android.appwidget.provider" android:resource="@xml/burc_widget_info" />
        </receiver>
        <activity android:name=".BurcWidgetConfig" android:exported="true" android:label="Burcunu seç"
            android:theme="@android:style/Theme.DeviceDefault.Dialog.NoActionBar" android:excludeFromRecents="true">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_CONFIGURE" />
            </intent-filter>
        </activity>
        <activity android:name=".BurcPinActivity" android:exported="true" android:noHistory="true" android:excludeFromRecents="true"
            android:theme="@android:style/Theme.Translucent.NoTitleBar">
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="swipeup-widget" android:host="burc" />
            </intent-filter>
        </activity>
    </application>`;
  const i = x.lastIndexOf('</application>'); if (i < 0) throw new Error('AndroidManifest.xml içinde </application> yok');
  x = x.slice(0, i) + add.trimStart().replace(/^/, '') + x.slice(i + '</application>'.length);
  fs.writeFileSync(mf, x);
  console.log('Burç widget\'ı eklendi');
};
