# SwipeUp iOS uygulaması — proje notu

Bu klasör SwipeUp'ın iPhone uygulamasıdır. Xcode'daki yapay zekâ asistanı ve geliştiriciler için yazıldı.

## Yapı

- Uygulama bir Capacitor 8 kabuğudur: açılınca `https://swipeup.live` adresini tam ekran bir web görünümünde (WKWebView) açar.
  Uygulamanın asıl arayüzü ve sunucusu web tarafındadır (depo kökü: `public/`, `server/`); onlara bu klasörden dokunma.
- Yerel (Swift) kod: `ios/App/App/` (`AppDelegate.swift`, `SceneDelegate.swift`, `Info.plist`, `Assets.xcassets`).
- Uygulama UIScene yaşam döngüsünü kullanır (iOS 27 / Xcode 27 bunu zorunlu tutar; olmadan uygulama açılışta çöker).
  Pencere `SceneDelegate` içinde kurulur; URL ve evrensel bağlantı olayları `SceneDelegateProxy`'ye iletilir, bunları bozma.
- Bağımlılıklar Swift Package Manager ile gelir (`ios/App/CapApp-SPM/Package.swift`). Bu dosyayı elle değiştirme;
  `npm run sync` her çalıştığında yeniden yazılır. CocoaPods kullanılmıyor.
- Uygulama içi satın alma: `@capgo/native-purchases` eklentisi. Web tarafı `window.Capacitor.Plugins.NativePurchases` ile çağırır
  (bkz. depo kökünde `public/js/iap.js`). Ürün kimlikleri `swipeup.<ürün>` biçimindedir, hepsi tüketilebilir (consumable).

## Sabitler

| Ne | Değer |
| --- | --- |
| Paket kimliği (Bundle ID) | `app.swipeup.ios` |
| En düşük iOS | 15.0 |
| Alan adı | `swipeup.live` |
| Associated Domains | Henüz eklenmedi: ücretsiz (Personal Team) hesap desteklemiyor. Ücretli Apple Developer ekibi seçilince + Capability → Associated Domains → `applinks:swipeup.live` |
| Uygulamanın açtığı adres | `https://swipeup.live` (`capacitor.config.json` → `server.url`) |
| Burç kartı verisi (widget için) | `GET https://swipeup.live/api/burc/widget?z=<burç>` — giriş gerektirmez, 15 dk önbelleklenebilir |

## Çalıştırma

```bash
cd ios-app
npm install          # ilk seferde ve package.json değişince
npm run sync         # capacitor.config.json ya da eklentiler değişince
npm run open         # Xcode'da açar (ios/App/App.xcodeproj)
```

## Kurallar

- Uygulamanın dili Türkçe (`CFBundleDevelopmentRegion` = tr, `CFBundleLocalizations` = [tr]); iOS'un kendi menüleri
  (yazı seçince Kopyala / Çevir, izin pencereleri) bu yüzden Türkçe çıkar. Arayüz metinleri Türkçe. Kullanıcıya görünen hiçbir yerde yapay zekâ ya da sağlayıcı/marka adı geçmez.
- Gizli anahtar, şifre, token koda yazılmaz.
- `ios/App/App/PrivacyInfo.xcprivacy` Apple'ın gizlilik bildirimidir (App Store zorunlu tutar). Yeni veri türü toplanırsa ya da
  yeni izin eklenirse bu dosyayı da güncelle. Uygulama izleme (tracking) yapmaz; ATS açık, yalnız HTTPS.
- Web tarafı iOS kabuğunu `iosShell()` (public/js/core.js) ile tanır. Kabukta: ödeme yalnız App Store (havale/EFT akışı
  gösterilmez, kural 3.1.1); Google ile giriş gizli (gömülü web görünümünde çalışmaz); Apple ile giriş yerel pencereyle.
- Apple ile giriş: yerel eklenti `ios/App/App/AppleSignInPlugin.swift` (web'den `Capacitor.Plugins.AppleSignIn.authorize`).
  `AppViewController` (aynı dosyada) eklentiyi köprüye kaydeder; `SceneDelegate` bu denetleyiciyi kullanır. Çalışması için
  ücretli ekip seçiliyken Signing & Capabilities → + Capability → **Sign in with Apple** eklenmeli (ücretsiz ekipte yok).
  Sunucu kimlik belgesini paket kimliği (`app.swipeup.ios`) ve tek kullanımlık nonce ile doğrular (`server/oidc.js`).
- Pencere storyboard'suz, `SceneDelegate` içinde kurulur; iPad'de bölünmüş ekran kapalıdır (`UIRequiresFullScreen`).
- Web görünümünde yalnızca `swipeup.live` açılır (`WKAppBoundDomains`); yeni bir alan adı gerekiyorsa hem `Info.plist`'e hem
  `capacitor.config.json` → `server.allowNavigation`'a ekle.
- Yeni izin (kamera, konum vb.) istenirse `Info.plist`'e Türkçe açıklamasını yaz; Apple açıklamasız izni reddeder.
- Widget gibi yeni bir hedef (target) eklenirse en düşük iOS 15 (widget için 17 önerilir) ve aynı ekip seçilmeli; paket kimliği
  `app.swipeup.ios.<ad>` biçiminde olmalı.
- Her App Store yüklemesinde Build numarası (CURRENT_PROJECT_VERSION) bir öncekinden büyük olmalı.
- İş bitince değişiklikleri GitHub'a gönder (Commit + Push). Web/sunucu tarafını başka biri geliştiriyor; başlamadan önce Pull yap.

## GitHub derlemesi

`.github/workflows/ios.yml` her `ios-app/` değişikliğinde bu projeyi imzasız derler (kontrol amaçlı). App Store'a yükleme
Xcode'dan yapılır: Product → Archive → Distribute App → App Store Connect.
