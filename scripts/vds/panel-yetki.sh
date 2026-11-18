#!/usr/bin/env bash
# SwipeUp yönetim paneli → Sunucu sekmesi için gereken izinler (bir kez, root olarak):
#   curl -fsSL https://raw.githubusercontent.com/ert545855-cloud/JAHDFJLGBPOCGDRJG45222/main/scripts/vds/panel-yetki.sh | bash
# Hostinger API anahtarını da eklemek için sonuna:  | bash -s -- ANAHTAR
# Uygulama (swipeup kullanıcısı) yalnız aşağıdaki sabit komutları çalıştırabilir; başka hiçbir root yetkisi almaz.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Bu komut root olarak çalıştırılmalı."; exit 1; }
ENVF=/etc/swipeup.env
[ -f "$ENVF" ] || { echo "$ENVF yok: önce kurulum betiğini çalıştır."; exit 1; }

cat > /etc/sudoers.d/swipeup-panel <<'S'
# SwipeUp yönetim paneli (Sunucu sekmesi): yalnız bu sabit komutlar
swipeup ALL=(root) NOPASSWD: /usr/bin/systemctl start --no-block swipeup-guncelle.service, /usr/bin/systemctl start --no-block swipeup-yedek.service, /usr/bin/systemctl restart --no-block swipeup.service, /usr/bin/systemctl reboot
S
chmod 440 /etc/sudoers.d/swipeup-panel
visudo -cf /etc/sudoers.d/swipeup-panel >/dev/null || { rm -f /etc/sudoers.d/swipeup-panel; echo "sudoers dosyası hatalı, geri alındı."; exit 1; }

# Eski kurulumdaki izin hatası: /etc/gitconfig ve birim dosyaları yalnız root'a açıktı (otomatik güncelleme çalışmıyordu)
[ -f /etc/gitconfig ] && chmod 644 /etc/gitconfig
chmod 644 /etc/systemd/system/swipeup*.service /etc/systemd/system/swipeup*.timer 2>/dev/null || true
systemctl daemon-reload

# Kayıtları (journalctl) okuyabilsin
usermod -aG systemd-journal swipeup
# Yedek klasörü: yalnız root ve uygulama
mkdir -p /var/backups/swipeup && chgrp swipeup /var/backups/swipeup && chmod 750 /var/backups/swipeup

# Hostinger API anahtarı (isteğe bağlı)
grep -q '^HOSTINGER_API_TOKEN=' "$ENVF" || echo 'HOSTINGER_API_TOKEN=' >> "$ENVF"
if [ -n "${1:-}" ]; then
  TOKEN=$(printf '%s' "$1" | tr -cd 'A-Za-z0-9._|=-')
  sed -i "s#^HOSTINGER_API_TOKEN=.*#HOSTINGER_API_TOKEN=$TOKEN#" "$ENVF"
  code=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN" https://developers.hostinger.com/api/domains/v1/portfolio || true)
  [ "$code" = 200 ] && echo "✅ Hostinger bağlandı" || echo "⚠️  Hostinger anahtarı denendi, cevap: $code (401 ise anahtar yanlış)"
fi

# Güncel koda geç (izin düzeltmesinden sonra ilk güncelleme)
/usr/local/bin/swipeup-guncelle || echo "⚠️  Güncelleme çalışmadı: journalctl -u swipeup-guncelle -n 20"
systemctl restart swipeup
sleep 3
systemctl is-active --quiet swipeup && echo "✅ Panel izinleri kuruldu. Yönetim → Sunucu ve alan adı sekmesini yenile." || echo "❌ Uygulama başlamadı: journalctl -u swipeup -n 30"
