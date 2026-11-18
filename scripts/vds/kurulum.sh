#!/usr/bin/env bash
# SwipeUp VDS kurulumu (Ubuntu 22.04 / 24.04, root olarak).
# Kullanım:  curl -fsSL https://raw.githubusercontent.com/ert545855-cloud/JAHDFJLGBPOCGDRJG45222/main/scripts/vds/kurulum.sh | bash -s -- alanadin.com
# Kurduğu şeyler: Node.js 22, Caddy (HTTPS sertifikası kendiliğinden alınır ve yenilenir), SwipeUp servisi (çökerse ve
# sunucu yeniden başlarsa kendiliğinden açılır), GitHub'dan 5 dakikada bir otomatik güncelleme, günlük veritabanı yedeği
# (7 gün), güvenlik duvarı, otomatik güvenlik güncellemeleri ve küçük sunucular için takas alanı.
# Gizli ayarlar /etc/swipeup.env dosyasında durur; depoya yazılmaz. Betik tekrar çalıştırılabilir, mevcut ayarları silmez.
set -euo pipefail

DOMAIN="${1:-}"
REPO="https://github.com/ert545855-cloud/JAHDFJLGBPOCGDRJG45222.git"
APP=/opt/swipeup
ENVF=/etc/swipeup.env
DATA=/var/lib/swipeup
say() { printf '\n\033[1;35m▶ %s\033[0m\n' "$*"; }

[ "$(id -u)" = 0 ] || { echo "Root olarak çalıştır (sudo -i)."; exit 1; }
[ -n "$DOMAIN" ] || { echo "Alan adını yaz:  ... | bash -s -- alanadin.com"; exit 1; }
DOMAIN="${DOMAIN#https://}"; DOMAIN="${DOMAIN#http://}"; DOMAIN="${DOMAIN#www.}"; DOMAIN="${DOMAIN%%/*}"
export DEBIAN_FRONTEND=noninteractive

say "Sistem güncelleniyor"
apt-get update -y
apt-get upgrade -y
apt-get install -y curl git ufw ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https unattended-upgrades postgresql-common
dpkg-reconfigure -f noninteractive unattended-upgrades || true

say "Takas alanı (bellek yetmezse uygulama kapanmasın)"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

say "Node.js 22"
if ! node -v 2>/dev/null | grep -q '^v22'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

say "Veritabanı yedeği için PostgreSQL 17 istemcisi"
/usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y >/dev/null
apt-get install -y postgresql-client-17

say "Caddy (HTTPS)"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y && apt-get install -y caddy
fi
cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3000
}
www.$DOMAIN {
	redir https://$DOMAIN{uri} permanent
}
EOF

say "Uygulama"
id swipeup >/dev/null 2>&1 || useradd --system --home "$APP" --shell /usr/sbin/nologin swipeup
mkdir -p "$DATA" /var/backups/swipeup
if [ ! -d "$APP/.git" ]; then git clone --depth 50 "$REPO" "$APP"; else git -C "$APP" fetch -q origin main && git -C "$APP" reset -q --hard origin/main; fi
chown -R swipeup:swipeup "$APP" "$DATA"
sudo -u swipeup -H bash -c "cd $APP && npm ci --omit=dev --no-audit --no-fund"

say "Ayarlar ($ENVF)"
if [ ! -f "$ENVF" ]; then
  DBURL=""
  if [ -r /dev/tty ]; then
    printf 'Veritabanı adresi (DATABASE_URL, Claude verecek; boş bırakırsan sonra eklersin): ' > /dev/tty
    read -r DBURL < /dev/tty || true
  fi
  umask 077
  cat > "$ENVF" <<EOF
# SwipeUp ayarları. Değiştirdikten sonra: systemctl restart swipeup
PORT=3000
NODE_ENV=production
CANONICAL_URL=https://$DOMAIN
DATA_DIR=$DATA
PG_SCHEMA=swipeup
ADMIN_PATH=k-uUQLCHKEUd9Xra87fG
DATABASE_URL=$DBURL
# Aşağıdakileri eski Render ayarlarından doldur (boş olanlar kapalı kalır):
GEMINI_API_KEY=
SIGHTENGINE_USER=
SIGHTENGINE_SECRET=
GIPHY_API_KEY=
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
GMAIL_USER=
GMAIL_APP_PASSWORD=
GOOGLE_CLIENT_ID=
HOSTINGER_API_TOKEN=
MEDIA_STORE=disk
MEDIA_BACKUP_DIR=/var/backups/swipeup/medya
BACKUP_DIR=/var/backups/swipeup/anlik
ANDROID_KEYSTORE_B64=
ANDROID_KEYSTORE_PASS=
ANDROID_SHA256=
EOF
  chmod 600 "$ENVF"
  umask 022 # yalnız ayar dosyası gizli; sonrakiler (gitconfig, birimler) herkesçe okunur olmalı
else
  sed -i "s#^CANONICAL_URL=.*#CANONICAL_URL=https://$DOMAIN#" "$ENVF"
fi

say "Servis"
cat > /etc/systemd/system/swipeup.service <<EOF
[Unit]
Description=SwipeUp
After=network-online.target
Wants=network-online.target

[Service]
User=swipeup
WorkingDirectory=$APP
EnvironmentFile=$ENVF
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF

# Otomatik güncelleme: depodaki betik root olarak çalıştırılmaz; bu sabit betik çalışır
cat > /usr/local/bin/swipeup-guncelle <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd $APP
old=\$(git rev-parse HEAD)
sudo -u swipeup git fetch -q origin main
new=\$(git rev-parse origin/main)
[ "\$old" = "\$new" ] && exit 0
sudo -u swipeup git reset -q --hard origin/main
if ! git diff --quiet "\$old" "\$new" -- package.json package-lock.json; then sudo -u swipeup -H npm ci --omit=dev --no-audit --no-fund; fi
systemctl restart swipeup
logger -t swipeup "güncellendi: \${old:0:7} → \${new:0:7}"
EOF
chmod 755 /usr/local/bin/swipeup-guncelle
git config --system --get-all safe.directory | grep -qx "$APP" || git config --system --add safe.directory "$APP" || true
chmod 644 /etc/gitconfig 2>/dev/null || true

# Günlük veritabanı yedeği (yalnız swipeup şeması, 7 gün saklanır)
cat > /usr/local/bin/swipeup-yedek <<'EOF'
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
EOF
chmod 700 /usr/local/bin/swipeup-yedek

cat > /etc/systemd/system/swipeup-guncelle.service <<'EOF'
[Unit]
Description=SwipeUp otomatik güncelleme
[Service]
Type=oneshot
ExecStart=/usr/local/bin/swipeup-guncelle
EOF
cat > /etc/systemd/system/swipeup-guncelle.timer <<'EOF'
[Unit]
Description=SwipeUp güncellemesini 5 dakikada bir kontrol et
[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
[Install]
WantedBy=timers.target
EOF
cat > /etc/systemd/system/swipeup-yedek.service <<'EOF'
[Unit]
Description=SwipeUp veritabanı yedeği
[Service]
Type=oneshot
ExecStart=/usr/local/bin/swipeup-yedek
EOF
cat > /etc/systemd/system/swipeup-yedek.timer <<'EOF'
[Unit]
Description=SwipeUp günlük yedek (gece 04:10)
[Timer]
OnCalendar=*-*-* 04:10:00
Persistent=true
[Install]
WantedBy=timers.target
EOF

say "Güvenlik duvarı"
ufw allow OpenSSH >/dev/null
for p in $(ss -tlnpH 2>/dev/null | awk '/sshd/ {n=split($4,a,":"); print a[n]}' | sort -u); do ufw allow "$p/tcp" >/dev/null; done # SSH farklı porttaysa kilitlenme
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw allow 443/udp >/dev/null
ufw --force enable >/dev/null

say "Panel izinleri"
# Yönetim → Sunucu sekmesi: uygulama yalnız bu sabit komutları root olarak çalıştırabilir
cat > /etc/sudoers.d/swipeup-panel <<'S'
swipeup ALL=(root) NOPASSWD: /usr/bin/systemctl start --no-block swipeup-guncelle.service, /usr/bin/systemctl start --no-block swipeup-yedek.service, /usr/bin/systemctl restart --no-block swipeup.service, /usr/bin/systemctl reboot
S
chmod 440 /etc/sudoers.d/swipeup-panel
visudo -cf /etc/sudoers.d/swipeup-panel >/dev/null || rm -f /etc/sudoers.d/swipeup-panel
usermod -aG systemd-journal swipeup
chgrp swipeup /var/backups/swipeup && chmod 750 /var/backups/swipeup
mkdir -p /var/backups/swipeup/anlik /var/backups/swipeup/medya && chown swipeup:swipeup /var/backups/swipeup/anlik /var/backups/swipeup/medya && chmod 750 /var/backups/swipeup/anlik /var/backups/swipeup/medya

say "Başlatılıyor"
timedatectl set-timezone Europe/Istanbul || true
systemctl daemon-reload
systemctl enable --now swipeup swipeup-guncelle.timer swipeup-yedek.timer
systemctl restart caddy
sleep 5

IP=$(curl -fsS4 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')
echo
if systemctl is-active --quiet swipeup; then echo "✅ SwipeUp çalışıyor."; else echo "❌ SwipeUp başlamadı. Kayıtlar: journalctl -u swipeup -n 50"; fi
grep -q '^DATABASE_URL=.\+' "$ENVF" || echo "⚠️  DATABASE_URL boş: nano $ENVF ile ekle, sonra: systemctl restart swipeup"
cat <<EOF

Sunucu IP adresi: $IP
Alan adı firmasının DNS panelinde:
  A kaydı   @    → $IP
  A kaydı   www  → $IP
(Varsa eski A / AAAA kayıtlarını sil.) DNS yayılınca HTTPS sertifikası kendiliğinden alınır:
  https://$DOMAIN

Faydalı komutlar:
  Ayarları düzenle:   nano $ENVF   sonra   systemctl restart swipeup
  Kayıtları izle:     journalctl -u swipeup -f
  Hemen güncelle:     swipeup-guncelle
  Hemen yedek al:     swipeup-yedek   (yedekler: /var/backups/swipeup)
EOF
