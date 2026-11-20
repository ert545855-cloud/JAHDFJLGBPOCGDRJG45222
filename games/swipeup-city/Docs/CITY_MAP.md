# SwipeUp City haritası

| Durak | Yerleşim ve oynanış |
| --- | --- |
| Merkez Park | Kıyı Meydanı'nın doğusunda kaldırım, palmiye, bank ve çeşme |
| Kafe Meydanı | Meydanın batısında açık hava masaları ve gölgelikler |
| Otopark | Doğu mahallesinin güneyinde çizgili park alanı ve sergilenen araçlar |
| Marina | Sahil yürüyüş yolundan denizin üzerindeki iskeleye uzanan son durak |

Meydan oyunun başlangıç noktasıdır. Her durak 3,6 metreye yaklaşınca kaydedilir. Dört durağın sırası serbesttir. Oyuncu çalışma alanının dışına çıktığında veya denize düştüğünde meydana döner. Bu dönüş tur ilerlemesini korur.

## Tarayıcı

Yaya meydanında dalga desenli taş zemin, vitrinler, hareketli karakterler, ışık ve gölgeler bulunur. **Sahil Kulübü**'ndeki açık hava egzersizi ayrı bir etkileşimdir. Harita ve kalan en yakın durak oyun sırasında üstte görünür.

## Unreal

`SwipeUpCityBlockout.cpp` yerleşimi sahne başlamadan oluşturur. Parçalar materyal bazında gruplandırılmış instanced mesh bileşenleri kullanır. Islak kıyı ve iskele arasında yürüme alanı ayrıdır. `SwipeUpCityGameMode.cpp` başlatmayı, dört durak ilerlemesini ve meydana dönüşü yönetir.

`Scripts/prepare_city.py` editörde doku malzemelerini ve yerel varlıkları hazırlar. Import edilen props için [Fab ve yerel varlıklar](FAB_FREE_ASSETS.md).
