# SwipeUp City

SwipeUp City, sahil meydanı, park, kafe, otopark ve marinadan oluşan tek oyunculu bir 3D keşif oyunudur. Dört durak dilediğin sırayla ziyaret edilebilir. Turun ardından serbestçe dolaşmaya devam edebilirsin.

## Tarayıcıda

Deponun kökünde `npm ci` ve `npm start` çalıştır. `http://localhost:3000/city-preview/` adresini aç ya da SwipeUp oyun menüsünden **SwipeUp City → 3D şehir turunu oyna** seçeneğini kullan.

- **WASD** veya yön tuşlarıyla hareket et. **Shift** ile koş, **Space** ile zıpla ve kamerayı çevirmek için fareyi sürükle.
- Dokunmatik ekranda hareket için sol çubuğu, kamera için sahnenin üzerindeki kaydırma hareketini kullan. **Koş** ve **Zıpla** ayrı düğmelerdir.
- Sahilde matlara yaklaşınca **E** veya **Egzersize katıl** düğmesiyle gruba katıl. Yürümek veya zıplamak egzersizden çıkar.
- Suya düşersen meydandan devam edersin ve ziyaretlerin o oturumda korunur. Baştan başlamak için **R** veya **Yeniden başla** düğmesini kullan.

Tarayıcı sürümü Three.js ve WebGL 2 kullanır. Işık, gölgeler, yüzey dokuları, 3D karakter animasyonları ve deniz yerelde çizilir. Üçüncü taraf görsel kaynaklar için [varlık listesi](Docs/ART_SOURCES.md).

## Unreal Engine 5.5

1. `SwipeUpCity.uproject` dosyasını Unreal Engine 5.5 ve platforma uygun C++ araç zinciriyle aç.
2. Editörde **Tools → Execute Python Script** ile `Scripts/prepare_city.py` dosyasını çalıştır. Windows'ta `UE_EDITOR_CMD` yolunu ayarlayıp `Scripts/run_palette_windows.bat` da kullanılabilir.
3. **Play** ile giriş haritasını başlat. Şehir ve dört durak GameMode tarafından oluşturulur. `WASD`, fare, `Shift`, `Space` ve `R` ile turu dene.
4. Yerel test paketinde oyuncunun meydanda doğduğunu, kaldırımlar ve iskelenin çarpışmalarını, dört durağın sayıldığını ve suya düşüşten dönüşü doğrula.

Hazırlık betiği renk ve doku malzemelerini, paketle gelen bankı ve varsa yerel FBX, GLB veya glTF dosyalarını içe aktarır. [Fab ve yerel dosya kurulumu](Docs/FAB_FREE_ASSETS.md).

Unreal kaynağı ayrı bir native prototiptir. Animasyonlu mahalle sakinleri ve plaj egzersizi bu sürümde tarayıcıda çalışır. UE 5.5 C++ derlemesi, Unreal Editor içe aktarma testi ve gerçek Android/iOS cihaz testi bu değişiklik için henüz bekliyor.
