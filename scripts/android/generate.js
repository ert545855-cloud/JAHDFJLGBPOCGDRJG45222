// store/android/twa-manifest.json dosyasından Android (TWA) projesini üretir.
// Kullanım: node scripts/android/generate.js <hedef-klasör> <sürüm-numarası>
const fs = require('fs');
const path = require('path');
const { TwaGenerator, TwaManifest, ConsoleLog } = require('@bubblewrap/core');

async function main() {
  const out = path.resolve(process.argv[2] || 'android-build');
  const code = parseInt(process.argv[3] || '1', 10);
  const src = path.resolve(__dirname, '../../store/android/twa-manifest.json');
  const json = JSON.parse(fs.readFileSync(src, 'utf8'));
  json.appVersionCode = code;
  json.appVersionName = `1.0.${code}`;
  json.signingKey = { path: path.join(out, 'android.keystore'), alias: 'swipeup' };
  fs.mkdirSync(out, { recursive: true });
  const tmp = path.join(out, 'twa-manifest.json');
  fs.writeFileSync(tmp, JSON.stringify(json, null, 2));
  const manifest = await TwaManifest.fromFile(tmp);
  const err = manifest.validate && manifest.validate();
  if (err) throw new Error('twa-manifest geçersiz: ' + err);
  await new TwaGenerator().createTwaProject(out, manifest, new ConsoleLog('twa'));
  // Şablon dosyalarının bir kısmı arka planda yazılıyor; bitmelerini bekle.
  await new Promise((r) => setTimeout(r, 3000));
  for (const f of ['gradlew', 'app/build.gradle', 'app/src/main/AndroidManifest.xml']) {
    if (!fs.existsSync(path.join(out, f))) throw new Error('Eksik dosya: ' + f);
  }
  // Şablon kapanan JCenter deposunu kullanıyor: Maven Central ile değiştir (yoksa bağımlılıklar bulunamıyor)
  for (const f of ['build.gradle', 'app/build.gradle']) {
    const g = path.join(out, f); if (!fs.existsSync(g)) continue;
    let t = fs.readFileSync(g, 'utf8'); t = t.replace(/jcenter\(\)/g, 'mavenCentral()'); fs.writeFileSync(g, t);
  }
  require('./widget')(out, { packageId: json.packageId, host: json.host }); // Falcı Teyze burç widget'ı
  console.log('Android projesi hazır:', out, 'sürüm', json.appVersionName, '(' + code + ')');
}

main().catch((e) => { console.error(e); process.exit(1); });
