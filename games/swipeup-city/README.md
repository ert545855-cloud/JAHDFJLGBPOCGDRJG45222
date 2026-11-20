# SwipeUp City · Mercan Limanı

Unreal Engine 5.5 ile bağımsız Android ve iOS hedefleyen üçüncü şahıs açık dünya projesi. Mercan Limanı’nda çalış, kazandığın şehir kredileriyle kafe işlet veya garajını genişlet. Sahil pazarından parka, açık hava sahnesinden deniz fenerine kadar yürüyerek veya araçla gez.

[Yeni Mercan Kafe](Docs/mercan-kafe.webp) · [Altı otomobilin vitrin renderı](Docs/mercan-garaj.webp) · [Dünya haritası ve kurallar](Docs/CITY_MAP.md)

## Şehirde yapabileceklerin

| Sistem | Oynanış |
| --- | --- |
| Mercan Kafe | 850 krediye devral. Malzeme al, aç, bekleyen siparişleri servis et ve iki kez yükselt. Seviyeler yeni masa ve pergola ekler, kapasite ve sipariş geliri artar. |
| Barista | Mercan Kafe’de vardiyaya gir, kahveyi hazırla ve Sahil Sahnesi’ne götür. |
| Kurye | Paket Merkezi’nden gönderiyi al ve Yelken İskelesi’ne teslim et. |
| Taksici | Taksi Durağı’nda vardiyaya başla. İki duraktan yolcu al ve Paket Merkezi’nde indir. Araç durmuşken etkileşime gir. |
| Fotoğrafçı | Fener Terası’nda vardiyaya başla. İskele ve parkta çekim yap, albümü terasta teslim et. |
| Sosyal etkinlik | Sahil Sahnesi’nde dört vuruşlu ritim dansına katıl. Sahil Kulübü’nde grupla yoga yap veya üç duraklı süreli koşuya gir. |
| Garaj | Hatchback ve panelvan başlangıçta kullanılabilir. Açık tavan, SUV, pickup ve coupé şehir kredileriyle açılır. Her aracın gövdesi, hızlanması, azami hızı ve direksiyon tepkisi farklıdır. |

Yerel kayıt bakiyeyi, aktif vardiya adımını, kafe stok ve seviyesini, sosyal puanı ve araç anahtarlarını saklar. Şehir turunu baştan başlatmak bu ilerlemeyi korur. Etkinlikler şehirdeki NPC gruplarıyla tek oyunculu olarak gerçekleşir.

## Unreal Editor’de aç

1. Unreal Engine 5.5 ve C++ araç zinciriyle `SwipeUpCity.uproject` dosyasını aç ve proje modüllerini derle.
2. **Tools → Execute Python Script** ile `Scripts/prepare_city.py` dosyasını çalıştır. Güncel sürüm garaj için yeni parlak boya malzemesi üretir. Windows’ta `UE_EDITOR_CMD` yolunu ayarlayıp `Scripts/run_palette_windows.bat` ile de çalıştırabilirsin.
3. **Play → Standalone Game** ile yerel oyun penceresini aç. Native mobil paket için platformun SDK ve imzalama araçları gerekir.

| İşlem | Klavye ve fare | Telefon |
| --- | --- | --- |
| Hareket, kamera | WASD, fare | Sol ve sağ çubuk |
| Koş veya zıpla | Shift, Space | Koş, Zıpla |
| Araca bin veya in | E | Bin, İn |
| Araç kullan, fren | WASD, Space | Sol çubuk, Fren |
| Mekân, görev ve etkinlik | F ile aç ve onayla, ↑/↓ ile seç | Etkileş düğmesine, ardından bir satıra dokun |
| Dans | “Şimdi bas” anında F | “Şimdi bas” anında Ritim |
| Duraklat veya baştan başla | Esc, R | Duraklat, Baştan Başla |

## Doğrulama

C++17 kurallar testi dört mesleği, kafe alım ve yükseltmelerini, stok ve araç alımlarını, etkinlik ödülünü ve kayıt geri yüklemeyi kapsar. Proje dizininde `g++ -std=c++17 Tests/CityLifeRulesTest.cpp -o /tmp/city-life-test && /tmp/city-life-test` ile çalışır.

Görseller Blender’da, projedeki özgün model verisinden oluşturuldu. Garaj görünümü altı modeli aynı sırada gösteren bir vitrin kompozisyonudur. Unreal Editor derlemesi, oyun içi geçişler ve gerçek Android/iOS testleri bu ortamda bekliyor.

[Fab ve yerel varlık kurulumu](Docs/FAB_FREE_ASSETS.md)
