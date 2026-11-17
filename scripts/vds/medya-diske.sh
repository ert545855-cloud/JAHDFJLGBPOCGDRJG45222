#!/usr/bin/env bash
# Fotoğraf / video / sesleri Supabase veritabanından sunucu diskine taşır ve 5 dakikalık yedekleri açar (bir kez, root olarak):
#   curl -fsSL https://raw.githubusercontent.com/ert545855-cloud/sweep-up2/main/scripts/vds/medya-diske.sh | bash
# Önce veritabanının tam yedeği (medya dahil) alınır; taşıma uygulama açılırken yapılır ve her dosya diske yazılıp
# doğrulanmadan veritabanından silinmez. Kayıtlar Supabase'de kalır.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Bu komut root olarak çalıştırılmalı."; exit 1; }
ENVF=/etc/swipeup.env
[ -f "$ENVF" ] || { echo "$ENVF yok: önce kurulum betiğini çalıştır."; exit 1; }
DATA=$(grep -E '^DATA_DIR=' "$ENVF" | cut -d= -f2-); DATA=${DATA:-/var/lib/swipeup}
BK=/var/backups/swipeup

echo "▶ Taşımadan önce tam veritabanı yedeği (fotoğraflar dahil)"
val() { grep -E "^$1=" "$ENVF" | tail -1 | cut -d= -f2-; } # ayar dosyası source edilmez (MAIL_FROM'daki < >)
DBURL=$(val DATABASE_URL); SCHEMA=$(val PG_SCHEMA); SCHEMA=${SCHEMA:-swipeup}
if [ -n "$DBURL" ] && [ ! -f "$BK/tasima-oncesi-tam.dump" ]; then
  pg_dump --no-owner --format=custom --schema="$SCHEMA" --file="$BK/tasima-oncesi-tam.dump.tmp" "$DBURL"
  mv "$BK/tasima-oncesi-tam.dump.tmp" "$BK/tasima-oncesi-tam.dump"
  chgrp swipeup "$BK/tasima-oncesi-tam.dump"; chmod 640 "$BK/tasima-oncesi-tam.dump"
  echo "  $(du -h "$BK/tasima-oncesi-tam.dump" | cut -f1) → $BK/tasima-oncesi-tam.dump"
else
  echo "  (zaten var ya da veritabanı yok, atlandı)"
fi

echo "▶ Gece yedeği betiği (ayar dosyasını güvenli okuyan sürüm)"
cat > /usr/local/bin/swipeup-yedek <<'Y'
#!/usr/bin/env bash
# Ayar dosyası "source" edilmez (MAIL_FROM gibi değerlerdeki < > işaretleri kabukta yönlendirme sayılır); yalnız gereken satırlar okunur
set -euo pipefail
val() { grep -E "^$1=" /etc/swipeup.env | tail -1 | cut -d= -f2-; }
DBURL=$(val DATABASE_URL); SCHEMA=$(val PG_SCHEMA); SCHEMA=${SCHEMA:-swipeup}
[ -n "$DBURL" ] || exit 0
f=/var/backups/swipeup/swipeup-$(date +%F).dump
pg_dump --no-owner --format=custom --schema="$SCHEMA" --file="$f.tmp" "$DBURL" && mv "$f.tmp" "$f"
chgrp swipeup "$f" 2>/dev/null; chmod 640 "$f"
find /var/backups/swipeup -maxdepth 1 -name 'swipeup-*.dump' -mtime +7 -delete
Y
chmod 700 /usr/local/bin/swipeup-yedek

echo "▶ Klasörler"
mkdir -p "$DATA/media" "$BK/anlik" "$BK/medya"
chown -R swipeup:swipeup "$DATA" "$BK/anlik" "$BK/medya"
chmod 750 "$BK/anlik" "$BK/medya"
chgrp swipeup "$BK" && chmod 750 "$BK"

echo "▶ Ayarlar"
set_env() { grep -q "^$1=" "$ENVF" && sed -i "s#^$1=.*#$1=$2#" "$ENVF" || echo "$1=$2" >> "$ENVF"; }
set_env MEDIA_STORE disk
set_env MEDIA_BACKUP_DIR "$BK/medya"
set_env BACKUP_DIR "$BK/anlik"

systemctl restart swipeup
echo "▶ Taşıma başladı, bekleniyor…"
for i in $(seq 1 60); do
  sleep 3
  if journalctl -u swipeup --since "-4min" --no-pager -q | grep -q "sunucu diskine taşındı"; then break; fi
done
journalctl -u swipeup --since "-4min" --no-pager -q | grep -E "taşındı|taşınamadı|PostgreSQL|hazır" | tail -5
echo
echo "Diskte: $(find "$DATA/media" -type f ! -name '*.mime' | wc -l) dosya, $(du -sh "$DATA/media" | cut -f1)"
systemctl is-active --quiet swipeup && echo "✅ Fotoğraflar sunucu diskinde, 5 dakikalık yedekler açık." || echo "❌ Uygulama başlamadı: journalctl -u swipeup -n 30"
