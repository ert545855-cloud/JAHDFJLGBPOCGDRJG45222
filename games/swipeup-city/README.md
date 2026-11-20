# SwipeUp City — Unreal Engine 5 mobil prototipi

SwipeUp uygulamasinin Oyunlar ekraninda duyurulan, iOS/Android icin planlanan ozgun sosyal sehir oyununun kaynak prototipi.

## Neler eklendi?
- Unreal Engine 5.5 C++ projesi ve game mode
- Klavye, gamepad, sanal mobil joystick eksenleriyle ucuncu sahis karakter hareketi
- Yurume, kosma, ziplama, fare / sag joystick kamera kontrolu
- Mobil dokunmatik KOS ve ZIPLA tuslari icin HUD + dokunma algilama
- Unreal'in kendi Cube ve Cone modellerini kullanan kod tabanli mini sehir: yol, bina, meydan, park, agac
- Mobil odakli render ve input ayarlari

## Calistirma
1. Windows/Mac uzerinde Unreal Engine 5.5 ve uygun C++ derleyicisi kurulu olmali.
2. SwipeUpCity.uproject dosyasini Unreal ile acip C++ modullerini derleyin.
3. Play ile motorun Entry haritasinda karakter ve kodla uretilen sehir prototipini deneyin.
4. iOS/Android icin gercek cihazda paketleme, SDK ve grafik profil testleri yapin.

## Sinirlar (onemli)
- Proje Unreal Engine'de bu ortamda derlenmedi veya mobil cihazda test edilmedi.
- Harita su an yalnizca Unreal'in icindeki basit geometrilerle prototip; Fab 3D asseti yok.
- Cok oyunculu sunucu, kalici karakter ekonomisi, arac surme, magazalar ve kimlik girisi henuz kodlanmadi.
- SwipeUp'in var olan iOS Capacitor / Android TWA mobil kabuklari Unreal oyunu dogrudan gommez.
- iOS ve Android native Unreal birlestirmesi icin once teknik POC, yeniden paketleme ve cihaz testi gerekli.

Belgeler: Docs/MOBILE_INTEGRATION.md, Docs/MILESTONES.md, Assets/FabManifest.json.
