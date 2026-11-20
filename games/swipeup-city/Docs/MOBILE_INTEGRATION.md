# SwipeUp City: mobil entegrasyon karari

## Depoda dogrulanan mevcut teknoloji
- SwipeUp ana istemcisi public/ altinda ES modul tabanli web uygulamasi.
- iOS kabugu ios-app/ klasorundeki Capacitor projesidir, swipeup.live web gorunumunu acar.
- Android dagitimi README'ye gore Trusted Web Activity (TWA) kullanir.
- Sunucu Express + Socket.IO uzerinde server.js ve server/ modulleri ile calisir.

## Teknik gerceklik
Bu C++ Unreal projesi iOS WKWebView icinde bir HTML sayfasi gibi calistirilamaz.
Android TWA da Unreal'in native runtime'i icin bir yuva degildir.
Tek uygulama deneyimi hedefini korumak icin her iki platformda native oyun entegrasyonunun
fizibilitesi dogrulanmali; kaynak kodu kopyalamak yeterli degildir.

## Onerilen guvenli asamalar
1. Unreal prototipini once bagimsiz test derlemesiyle gercek Android ve iPhone cihazda ac.
2. iOS icin Capacitor + Unreal native birlesme ve App Store paketleme POC'sini ayri dalda dene.
3. Android TWA yerine oyun runtime'ini barindirabilecek native uygulama yapisini test et.
4. POC basarili olduktan sonra oyunlar menusundeki City kartini gercek native baslaticiya bagla.
5. Giris akisinda mevcut SwipeUp oturumundan yalniz sunucu tarafinda tek kullanimlik oyun bileti uret.
6. Oyun sunucusunda bu bileti bir kez tuket, kullanici ID ve yetkilerini dogrula.
7. Kimlik anahtarlarini, JWT'leri veya sifreleri uygulama URL'sine ya da deep link parametresine koyma.

## API taslagi (henüz devre disi, endpoint eklenmedi)
POST /api/city/launch -> authenticated; server issues 30-60 saniyelik tek kullanımlık ticket
POST /internal/city/redeem -> private game gateway; ticket'i dogrular ve tek seferlik tuketir

Ticket sunucu tarafinda TTL, nonce, oyuncu ID, oturum, bolge ve tekrar kullanim korumasiyla
islenmelidir. HTTPS + rate limit + hata kaydi zorunludur.

## Mevcut oyun girişi

- Oyun, Unreal Engine 5.5 ile bağımsız bir native uygulama hedefler.
- SwipeUp menüsündeki bilgi kartı proje durumunu gösterir.
- Android ve iOS paketleme, imzalama ve gerçek cihaz testleri bekliyor.
