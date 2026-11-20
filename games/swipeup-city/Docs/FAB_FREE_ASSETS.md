# Fab ve yerel varlıklar

## Unreal projesindeki eklentiler

- **Fab** isteğe bağlı Unreal Editor entegrasyonu olarak seçili. UE 5.5 kurulumunda Fab görünmüyorsa Epic Games Launcher'ın Fab Library bölümünden aynı motor sürümüne yükle. [Epic kurulum rehberi](https://dev.epicgames.com/documentation/en-us/fab/purchasing-and-downloading-assets-in-fab)
- **Interchange** ve **Interchange Editor** FBX, GLB ve glTF içe aktarımı için kullanılır. **Python Script** ve **Editor Scripting Utilities** hazırlık betiğini çalıştırır. [Epic Interchange rehberi](https://dev.epicgames.com/documentation/en-us/unreal-engine/importing-assets-using-interchange-in-unreal-engine)
- **glTF Exporter** Epic'in Fab'da listelediği ve Unreal 5.5 ile gelen dışa aktarma eklentisidir. Editörde özgün modelleri GLB veya glTF olarak dışa aktarmak için etkin. [Fab ilanı](https://www.fab.com/listings/ca4cc53a-8ff5-47b0-9715-b7cf4daa6a14)

## Seçilen ücretsiz Fab paketleri

| Paket | Şehirde kullanım |
| --- | --- |
| [Free Modular Roads Starter](https://www.fab.com/listings/a377c7c3-13a0-404a-bf8d-a34279b1e500) | Kısa yol parçaları, kavşak ve yaya geçidi |
| [City Sample Buildings](https://www.fab.com/listings/008fe959-5511-428e-93bd-f99b1179f6d5) | Birkaç seçili cephe. Mobil hedefte LOD ve malzeme sayısını ölç. |
| [City Sample Vehicles](https://www.fab.com/listings/2909157b-ddfa-4cef-a925-69dc2467021f) | Yerel park aracı modeli için seçenek |
| [Lower Sector Building Kit](https://www.fab.com/listings/709924e0-3128-4d23-9d36-fe35991d03c0) | CC0 çevre parçaları ve servis alanı detayları |

Fab paketleri ücretsiz listeleniyordu. Fab hesabı gerektiren indirmeler ve Unreal kurulumları bekliyor. Depoya eklenen yüzey dokuları ve bank modeli doğrudan [Poly Haven](https://polyhaven.com/license) kaynaklıdır.

Mercan Limanı'nın açılış haritası özgün Blender modellerini kullanır. Fab içe aktarma aracı yerel olarak alınmış paketleri editörde hazırlar. Bir Fab modelini limana yerleştirmek ayrı bir sahne düzenlemesidir.

## Yerel içe aktarma

1. FBX, GLB ve glTF arşivlerini proje içindeki `ExternalAssets/<paket>/` dizinine aç. glTF dosyasının yanındaki `.bin` ve doku dosyalarının dizin yapısını koru.
2. Unreal **Tools → Execute Python Script → Scripts/prepare_city.py** yoluyla hazırlığı çalıştır. FBX, GLB ve glTF dosyaları `/Game/SwipeUpCity/ImportedFab/` altına alınır. Unreal formatındaki Fab paketlerini Fab penceresinden ekle.
3. Content Browser'da istediğin **Static Mesh** için **Copy Reference** seçeneğini kullan. `Config/DefaultGame.ini` dosyasındaki `[SwipeUpCity.ImportedMeshes]` bölümüne yalnızca `/Game/.../Model.Model` nesne yolunu yaz. Desteklenen anahtarlar `Palm`, `StreetLamp`, `Bench`, `Car` ve `Boat`. Paketle gelen bankı değiştirmek için `Bench` satırını güncelle. Bu anahtarlar eski şehir şablonu için geçerlidir.
4. Bir paketli derlemede yerel içe aktarımları kullanacaksan **Project Settings → Packaging → Additional Asset Directories to Cook** listesine yalnızca seçili modellerin klasörlerini ekle. [Epic paketleme ayarları](https://dev.epicgames.com/documentation/en-us/unreal-engine/API/Developer/DeveloperToolSettings/Settings/UProjectPackagingSettings?application_version=5.5)

Fab Standard lisanslı model kaynaklarını proje dışında yeniden dağıtma. `ExternalAssets/` ve `ImportedFab/` Git dışında tutulur. [Fab lisansı](https://www.fab.com/eula)
