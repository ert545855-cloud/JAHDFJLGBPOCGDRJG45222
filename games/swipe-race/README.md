# Swipe Race

3D yarış oyunu. Oyunlar sayfasındaki Swipe Race kartından `/race/` adresinde açılır.

## Modlar

- **Yarış:** 5 bota karşı 3 tur, üç zorluk.
- **Kupa:** Üç pistte üç yarış, sıraya göre puan (10 · 8 · 6 · 5 · 4 · 3).
- **Zamana karşı:** Tek başına 3 tur. En iyi tur hayalet olarak kaydedilir; kendi ya da arkadaşının hayaletine karşı yarışılır.
- **Arkadaşlarla:** Gerçek zamanlı oda (2–6 kişi). Bağlantı `/race/#room-<id>`, arkadaşlara bildirimle çağrı.

Pistler: Park Pisti, Köprü Sekizi (rampa + köprü, 8 şeklinde), Dağ Virajları (firketeli). Her pist gece de oynanabilir.
Araçlar: Toy Car Kit'ten 8 araç (3 renk) ve Racing Kit'ten Formula (4 renk). Kutulardan turbo, muz, kalkan; altınlardan nitro.
Telefonda yarış her zaman yatay çizilir; eğerek sürüş isteğe bağlı.

## İlerleme ve sosyal (sunucu: `server/race.js`)

- XP ve seviye (150 XP/seviye, günlük üst sınır 2500). Araçlar seviyeyle ya da jetonla açılır.
- Her gün 3 görev (12'lik havuzdan), görev başı 80 XP, üçü bitince +150 XP.
- Tur rekoru + hayalet: 100 ms'de bir konum. Sunucu her rekoru pistin geometrisine göre denetler (pist dışına çıkma, ışınlanma, tam tur).
- Sıralamalar: arkadaşlar (karşılıklı takip ya da eşleşme), haftalık, genel.
- Haftalık turnuva: her hafta bir pist (dönüşümlü). Haftanın ilk üçüne 50 / 30 / 15 jeton.
- Meydan okuma: rekorunu arkadaşına sohbet mesajı + bildirim olarak gönderir (`/race/#ghost-<pist>-<kullanıcı>`).
- Çok oyunculu: konumlar 15 Hz soketle aktarılır, 120 ms geriden yumuşatılarak çizilir. Bitiş süresi sunucu saatiyle denetlenir.

Veriler: `race_profile`, `race_laps`, `race_week`, `race_meta`, `race_chal` koleksiyonları.

## Klasörler

- `src/track.js`: Pist yerleşimi (ızgara parçaları, rampa/köprü), orta çizgi, yükseklik, duvar mesafesi. Sunucu da bunu kullanır.
- `src/physics.js`: Araç fiziği, botlar, araç çarpışmaları, araç tanımları. Sunucu da bunu kullanır.
- `src/core.js`: Ayarlar, ekran kartı, sahne, ekran düzeni, grafik kalitesi.
- `src/assets.js`: Model paketi, dokular, araç şablonları.
- `src/world.js`: Pist modelleri, süsleme, gökyüzü, bulutlar, tepeler, göl, gece ışıkları.
- `src/cars.js`: Araç görünümü (far, kalkan, hayalet, isim etiketi).
- `src/fx.js`: Duman, lastik izi, altın, eşya kutusu, muz.
- `src/input.js`: Klavye, dokunmatik, eğerek sürüş.
- `src/audio.js`: Motor ve efekt sesleri.
- `src/net.js`: API, soket, hayalet kodlama.
- `src/main.js`: Oyun akışı, menü, HUD, çok oyunculu.
- `tools/pack.py`: Modelleri tek bir `assets.json` paketine koyar.
- `build.sh`: Derleme betiği, çıktıyı `public/race/` içine yazar.

## Derleme

```bash
npm ci                      # three.js depo kökündeki node_modules'tan gelir
games/swipe-race/build.sh   # yalnız kod; public/race/assets.json hazır durur
```

Modelleri değiştirmek için iki model kitinin açılmış klasörlerini verin:

```bash
games/swipe-race/build.sh /yol/kenney_racing-kit /yol/kenney_toy-car-kit
```

## Performans

- Bütün modeller yarıştan önce yüklenir ve gölgelendiriciler derlenir. Pist değişirken yeni dünya ayrı kurulur, hazır olunca eskisinin yerine geçer.
- Pist ve çevre 56 m'lik bölgelerde birleştirilir; ekranda olmayan bölge çizilmez.
- Altın, kutu, muz, duman, lastik izi ve gece parıltıları tek çizimlik örnekli ağlardır; karede yeni bellek ayrılmaz.
- Kare süresi uzarsa çözünürlük kendiliğinden düşer. Fizik sabit 120 Hz adımla çalışır.

## Lisans notu

Araç, pist ve çevre modelleri Kenney'in Toy Car Kit ve Racing Kit paketlerindendir (CC0, www.kenney.nl).
Kullanıcıya görünen yerlerde marka adı geçmez.
