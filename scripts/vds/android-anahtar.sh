#!/usr/bin/env bash
# Android uygulamasının kalıcı imza anahtarı (bir kez, root olarak):
#   curl -fsSL https://raw.githubusercontent.com/ert545855-cloud/JAHDFJLGBPOCGDRJG45222/main/scripts/vds/android-anahtar.sh | bash
# Sunucuda anahtar yoksa yenisini üretir (PKCS12, takma ad "swipeup", 27 yıl geçerli) ve /etc/swipeup.env'e yazar:
#   ANDROID_KEYSTORE_B64, ANDROID_KEYSTORE_PASS, ANDROID_SHA256 (assetlinks.json için)
# GitHub derlemesi anahtarı sunucudan alır (/api/internal/android-key, yalnız bu deponun derlemesine verilir).
# Anahtarın bir kopyası /var/backups/swipeup/android/ altında tutulur; yönetim panelinden de indirilebilir.
# Anahtar zaten varsa hiçbir şeyi değiştirmez.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Bu komut root olarak çalıştırılmalı."; exit 1; }
ENVF=/etc/swipeup.env
[ -f "$ENVF" ] || { echo "$ENVF yok: önce kurulum betiğini çalıştır."; exit 1; }
val() { grep -E "^$1=" "$ENVF" | tail -1 | cut -d= -f2-; }
set_env() { grep -q "^$1=" "$ENVF" && sed -i "s#^$1=.*#$1=$2#" "$ENVF" || echo "$1=$2" >> "$ENVF"; }

if [ -n "$(val ANDROID_KEYSTORE_B64)" ] && [ -n "$(val ANDROID_KEYSTORE_PASS)" ]; then
  echo "✅ Sunucuda Android anahtarı zaten var; değiştirilmedi."
  echo "SHA-256: $(val ANDROID_SHA256)"
  exit 0
fi

D=/var/backups/swipeup/android
mkdir -p "$D"; chmod 750 "$D"; chgrp swipeup "$D" 2>/dev/null || true
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
PASS=$(openssl rand -hex 16)
openssl req -x509 -newkey rsa:2048 -sha256 -days 10000 -nodes -keyout "$T/key.pem" -out "$T/cert.pem" \
  -subj "/CN=SwipeUp/O=SwipeUp/C=TR" 2>/dev/null
openssl pkcs12 -export -inkey "$T/key.pem" -in "$T/cert.pem" -name swipeup -out "$T/android.keystore" -passout "pass:$PASS"
FP=$(openssl x509 -in "$T/cert.pem" -noout -fingerprint -sha256 | cut -d= -f2 | tr a-f A-F)
STAMP=$(date +%Y%m%d-%H%M)
cp "$T/android.keystore" "$D/swipeup-android-$STAMP.keystore"
printf 'Takma ad: swipeup\nŞifre: %s\nSHA-256: %s\nOluşturma: %s\n' "$PASS" "$FP" "$(date -Is)" > "$D/swipeup-android-$STAMP.txt"
chgrp swipeup "$D"/* 2>/dev/null || true; chmod 640 "$D"/*

set_env ANDROID_KEYSTORE_B64 "$(base64 -w0 "$T/android.keystore")"
set_env ANDROID_KEYSTORE_PASS "$PASS"
OLD=$(val ANDROID_SHA256)
set_env ANDROID_SHA256 "$FP${OLD:+,$OLD}"

systemctl restart swipeup
sleep 4
DOM=$(val CANONICAL_URL)
if curl -fsS -H "Host: ${DOM#https://}" http://127.0.0.1:3000/.well-known/assetlinks.json | grep -q "$FP"; then
  echo "✅ Android imza anahtarı hazır."
else
  echo "⚠️  Anahtar yazıldı ama assetlinks.json doğrulanamadı: journalctl -u swipeup -n 30"
fi
echo "SHA-256: $FP"
echo "Kopya: $D/swipeup-android-$STAMP.keystore (şifresi yanındaki .txt dosyasında). Yönetim → Sunucu'dan indirip güvenli bir yere sakla."
