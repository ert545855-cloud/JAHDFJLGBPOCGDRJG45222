# Mercan Limanı dünya tasarımı

Mercan Limanı, yaklaşık 280 × 208 metre kara alanı ile güneye uzanan iskelesi olan sürekli bir 3D semt. Yürünebilir sahil, kuzeydeki mahallelerle açık yollar üzerinden birleşir. Araçlar kıyı bulvarında ve otoparkta bulunur. NPC'lerin yürüyüşü meydan, kafe, park ve iskeleye dağıtılmıştır.

| Durak | Görsel kimlik ve işlev |
| --- | --- |
| Mercan Parkı | Çapraz taş yollar, palmiye gölgeleri ve dairesel çeşme |
| Sahil Kahvesi | Kumaş tenteler, kahve masaları ve terakota kemerli pazar |
| Liman Otoparkı | Sahil bulvarına bağlanan sürüş başlangıcı |
| Yelken İskelesi | Ahşap iskele, yelkenliler ve çizgili deniz feneri |

## Renk ve hareket

Oyun, animasyon filmi hissi için yumuşak köşeli modeller, mercan ve su yeşili cepheler, somon tenteler, krem taş ve turkuaz su kullanır. İnsanlar farklı kıyafet renklerine ve saç silüetlerine sahip. Yürürken kollar ve bacaklar ritmik hareket eder. Arabalarda ön teker yönü ve teker dönüşü hıza bağlıdır. Güneş, gökyüzü ve deniz malzemeleri Unreal'da çizilir.

## Kurallar

Park, kafe, otopark ve iskelenin her biri 3,6 metre içinde bir kez sayılır. Dördüncü durak turu tamamlar. Serbest gezide can, süre veya puan cezası yoktur. Iskele dışındaki deniz sınırından geçince meydana dönülür. Mobil kontrol alanları ekran ölçüsüne göre hesaplanır.

Game brief score 69/100. Otomatik metin kontrolü serbest gezi bitişini klasik kazanma ve kaybetme akışına, duraklatma ekranını da ayrı bir sonuç ekranına eşleyemedi. Buradaki dört durak, sıfırlama ve serbest dolaşım açık senaryo kurallarıdır.

## Modelleri yeniden üret

Blender 4.3 ile `blender -b -P Scripts/build_harbor_art.py` çalıştır. Betik `Content/SwipeUpCity/Meshes` içindeki üretim modellerini ve eşleşen C++ çarpışma tablosunu oluşturur. Render almak için komutun sonuna `-- --render /mutlak/yol/mercan-limani.png` ekle.

`ProceduralMeshComponent` bir Unreal motor eklentisidir. Sahne modelleri, üçgenler ve renklerle paketlenen dosyalardan yüklenir. Sokak geometrisi ve çarpışma hacimleri aynı üretim betiğinden gelir. Yakın karakterler ve araçlar kendi hareketli bileşenlerini kullanır.
