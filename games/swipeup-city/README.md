# SwipeUp City · Mercan Limanı

Unreal Engine 5.5 ile bağımsız Android ve iOS hedefleyen, üçüncü şahıs kameralı bir açık dünya prototipi. Mercan Limanı, kıyı pazarı, palmiyeli meydanı, çeşmeli parkı ve deniz feneriyle özgün bir semt. Oyuncu yürüyerek veya otomobille dolaşır. Dört durak ziyaret edildiğinde tur tamamlanır ve şehir serbest keşfe açık kalır.

[Meydan renderı](Docs/mercan-limani-meydan.webp) · [İskele renderı](Docs/mercan-limani-iskele.webp)

## Unreal Editor'de aç

1. Unreal Engine 5.5 ve C++ araç zinciriyle `SwipeUpCity.uproject` dosyasını aç ve proje modüllerini derle.
2. **Tools → Execute Python Script** ile `Scripts/prepare_city.py` dosyasını çalıştır. Betik, güneşli liman sahnesinin çizim malzemelerini üretir. Windows'ta `UE_EDITOR_CMD` yolunu ayarlayıp `Scripts/run_palette_windows.bat` ile de çalıştırabilirsin.
3. **Play → Standalone Game** ile yerel oyun penceresini aç. Harita, araçlar ve yayalar oyun başladığında oluşturulur. Native mobil paket için uygun Android SDK veya iOS araç zinciri gerekir.

| İşlem | Klavye ve fare | Telefon |
| --- | --- | --- |
| Yürü ve kamerayı çevir | WASD ve fare | Sol ve sağ çubuk |
| Koş veya zıpla | Shift veya Space | Koş veya Zıpla |
| Araca bin veya in | Araç yanındayken E. İnmek için yavaşla. | Bin veya İn |
| Araç kullan | WASD, Space ile fren | Sol çubuk, Fren düğmesi |
| Duraklat veya baştan başla | Esc veya R | Duraklat veya Baştan Başla |

Denize düşmek oyuncuyu meydan girişine geri getirir, tur ilerlemesi korunur. Araç şasisi binalar ve zeminle çarpışır. Dört araç farklı renklerle park halinde başlar. Meydan, park, kafe ve kıyıda 12 yaya kendi yürüyüş döngüsünü izler.

[Dünya tasarımı ve kaynak üretimi](Docs/CITY_MAP.md) · [Fab ve yerel varlık kurulumu](Docs/FAB_FREE_ASSETS.md)

## Doğrulama durumu

Harita parçaları, otomobiller, insanlar ve çarpışma hacimleri Blender üretiminden doğrulandı. Görsel Blender'da, Unreal kaynak dosyalarındaki aynı modellerden alındı. Unreal 5.5 derlemesi, editör içe aktarma ve Android/iOS cihaz testleri bekliyor.
