# SwipeUp

Kaydır, eşleş, sohbet et, yayın aç, oyun oyna: gerçek zamanlı sosyal uygulama (PWA). Android uygulaması siteyi Trusted Web Activity ile, iOS uygulaması Capacitor kabuğuyla açar; sitedeki her güncelleme mağaza güncellemesi gerekmeden telefonlara gelir.

## Çalıştırma

```bash
npm ci
JWT_SECRET=... ADMIN_PATH=en-az-12-karakter ADMIN_PASSWORD=... node server.js   # http://localhost:3000
npm test                                                                         # otomatik testler
```

Veri: `DATABASE_URL` (PostgreSQL) > `REDIS_URL` > yerel JSON dosyası (`DATA_DIR`). Tüm koleksiyonlar bellekte tutulur, her değişiklik kalıcı depoya yazılır (tek süreç).

## Klasörler

| Yer | Ne |
| --- | --- |
| `server.js` | Express + Socket.IO; kimlik, akış, kaydırma, sohbet, medya, bildirim |
| `server/` | Özellik modülleri (her biri `featureCtx` alır): ekonomi, yönetim, oyunlar, Parti Kupası (`kupa.js`, `kupa-veh.js`), Swipe Race (`race.js`), uygulama içi satın alma (`iap.js`), hatırlatmalar ve haftalık özet (`nudge.js`), fotoğraf denetimi, hukuk ve uyum… |
| `public/` | İstemci (derleme gerektirmeyen ES modülleri), `public/admin` yönetim paneli (yalnız giriş yapmış yöneticiye verilir) |
| `games/swipe-race`, `games/kupa` | Oyun kaynakları ve varlık paketleyicileri |
| `store/` | Android (`twa-manifest.json`) ve iOS (`capacitor.config.json`) kabuk ayarları, mağaza metinleri |
| `scripts/vds` | Sunucu kurulumu (`kurulum.sh`), görüntülü görüşme aktarıcısı (`turn.sh`), yardımcı betikler |
| `test/` | Otomatik testler (`node --test`); her gönderimde GitHub Actions’ta çalışır |

## Sunucu (VDS)

- Kurulum: `scripts/vds/kurulum.sh` (Node, Caddy/HTTPS, servis, 5 dakikada bir otomatik güncelleme, gece yedeği).
- Görüntülü görüşme aktarıcısı: VDS’de root olarak bir kez `curl -fsSL https://raw.githubusercontent.com/ert545855-cloud/JAHDFJLGBPOCGDRJG45222/main/scripts/vds/turn.sh | bash`. Kendi TURN sunucusunu kurar, `TURN_HOST` ve `TURN_SECRET`’ı ayar dosyasına yazar; uygulama önce onu kullanır.
- Gizli ayarlar `/etc/swipeup.env` dosyasında ve yönetim panelinde (e-posta hesabı, mağaza anahtarları) durur; depoya yazılmaz.

## Uygulama içi satın alma

Android ve iOS uygulamasında jeton ve SwipeUp+ mağazanın kendi ödemesiyle satılır; tarayıcıda havale akışı sürer. Ürün kimlikleri `swipeup.<ürün>` (ör. `swipeup.j100`, `swipeup.p30`); hepsi tüketilebilir ürün olarak açılır. Google Play hizmet hesabı ve App Store uygulama içi satın alma anahtarı yönetim panelinde Siparişler → Mağaza içi satın alma bölümünden girilir. Sunucu her satın almayı doğrudan Google / Apple’a sorar, bir kez tanımlar; iade edilen Google satın almaları geri alınır.
