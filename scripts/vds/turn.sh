#!/usr/bin/env bash
# SwipeUp görüntülü görüşme aktarıcısı (TURN, coturn) kurulumu. VDS'de root olarak bir kez çalıştır:
#   curl -fsSL https://raw.githubusercontent.com/ert545855-cloud/JAHDFJLGBPOCGDRJG45222/main/scripts/vds/turn.sh | bash
# Ne yapar: coturn'ü kurar; geçici şifreli (paylaşılan gizli anahtarla, 24 saatlik) girişi açar; Caddy'nin aldığı HTTPS
# sertifikasını TURN'ün şifreli bağlantısına (5349) kopyalar ve her gün yeniler; yerel ağlara aktarmayı kapatır;
# güvenlik duvarında gereken portları açar; TURN_HOST ve TURN_SECRET'ı /etc/swipeup.env'e yazıp uygulamayı yeniden başlatır.
# Tekrar çalıştırılabilir; mevcut gizli anahtar korunur.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a NEEDRESTART_SUSPEND=1
main() {
ENVF=/etc/swipeup.env
say() { printf '\n\033[1;35m▶ %s\033[0m\n' "$*"; }
[ "$(id -u)" = 0 ] || { echo "Root olarak çalıştır (sudo -i)."; exit 1; }
[ -f "$ENVF" ] || { echo "$ENVF yok: önce kurulum betiğini çalıştır."; exit 1; }
val() { { grep -E "^$1=" "$ENVF" || true; } | tail -1 | cut -d= -f2-; }
setv() { if grep -qE "^$1=" "$ENVF"; then sed -i "s#^$1=.*#$1=$2#" "$ENVF"; else echo "$1=$2" >> "$ENVF"; fi; }
DOMAIN=$(val CANONICAL_URL); DOMAIN="${DOMAIN#https://}"; DOMAIN="${DOMAIN%%/*}"
[ -n "$DOMAIN" ] || { echo "CANONICAL_URL ayarı boş."; exit 1; }

say "coturn kuruluyor"
apt-get update -y >/dev/null </dev/null
apt-get install -y coturn >/dev/null </dev/null
sed -i 's/^#\?TURNSERVER_ENABLED=.*/TURNSERVER_ENABLED=1/' /etc/default/coturn 2>/dev/null || echo 'TURNSERVER_ENABLED=1' > /etc/default/coturn

SECRET=$(val TURN_SECRET); [ -n "$SECRET" ] || SECRET=$(openssl rand -hex 32)
PUBIP=$(curl -fsS4 --max-time 8 https://api.ipify.org 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || true)
LOCALIP=$({ ip -4 route get 1.1.1.1 2>/dev/null || true; } | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}')
EXT="external-ip=$PUBIP"; [ -n "$LOCALIP" ] && [ "$LOCALIP" != "$PUBIP" ] && EXT="external-ip=$PUBIP/$LOCALIP"

say "Sertifika (Caddy'nin aldığı)"
mkdir -p /etc/turn
cat > /usr/local/bin/swipeup-turn-sertifika <<EOF
#!/usr/bin/env bash
# Caddy'nin $DOMAIN sertifikasını TURN'e kopyalar (Caddy yenileyince günlük görev günceller)
set -e
crt=\$(find /var/lib/caddy -type f -name '$DOMAIN.crt' 2>/dev/null | head -1)
[ -n "\$crt" ] || exit 0
install -m 644 -o turnserver -g turnserver "\$crt" /etc/turn/cert.pem
install -m 600 -o turnserver -g turnserver "\${crt%.crt}.key" /etc/turn/key.pem
systemctl is-active --quiet coturn && systemctl kill -s USR2 coturn 2>/dev/null || true
EOF
chmod 755 /usr/local/bin/swipeup-turn-sertifika
/usr/local/bin/swipeup-turn-sertifika || true
cat > /etc/systemd/system/swipeup-turn-sertifika.service <<'EOF'
[Unit]
Description=SwipeUp TURN sertifikasını yenile
[Service]
Type=oneshot
ExecStart=/usr/local/bin/swipeup-turn-sertifika
EOF
cat > /etc/systemd/system/swipeup-turn-sertifika.timer <<'EOF'
[Unit]
Description=SwipeUp TURN sertifikası (günlük)
[Timer]
OnCalendar=*-*-* 05:20:00
Persistent=true
[Install]
WantedBy=timers.target
EOF

say "Ayarlar"
TLS=$'cert=/etc/turn/cert.pem\npkey=/etc/turn/key.pem' # sertifika henüz yoksa coturn şifresiz portlarla açılır; günlük görev kopyalayınca şifreli bağlantı da açılır
cat > /etc/turnserver.conf <<EOF
# SwipeUp TURN (scripts/vds/turn.sh üretti)
listening-port=3478
tls-listening-port=5349
$EXT
realm=$DOMAIN
server-name=$DOMAIN
use-auth-secret
static-auth-secret=$SECRET
fingerprint
min-port=49160
max-port=49999
total-quota=400
user-quota=12
stale-nonce=600
no-cli
no-multicast-peers
no-tlsv1
no-tlsv1_1
$TLS
# Yerel ağlara ve sunucunun kendisine aktarma yapılmaz
denied-peer-ip=0.0.0.0-0.255.255.255
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=100.64.0.0-100.127.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
denied-peer-ip=169.254.0.0-169.254.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=::1
log-file=syslog
simple-log
EOF
chmod 640 /etc/turnserver.conf; chgrp turnserver /etc/turnserver.conf 2>/dev/null || true

say "Güvenlik duvarı"
ufw allow 3478/udp >/dev/null; ufw allow 3478/tcp >/dev/null; ufw allow 5349/tcp >/dev/null; ufw allow 5349/udp >/dev/null; ufw allow 49160:49999/udp >/dev/null

say "Servisler"
systemctl daemon-reload
systemctl enable --now swipeup-turn-sertifika.timer >/dev/null
systemctl enable coturn >/dev/null; systemctl restart coturn
setv TURN_HOST "$DOMAIN"
setv TURN_SECRET "$SECRET"
systemctl restart swipeup
sleep 2
systemctl is-active --quiet coturn && echo "TURN çalışıyor: turn:$DOMAIN:3478 · turns:$DOMAIN:5349$([ -f /etc/turn/cert.pem ] || echo ' (sertifika bulunamadı; şifreli bağlantı sertifika kopyalanınca açılır)')" || { echo "coturn başlamadı:"; journalctl -u coturn -n 20 --no-pager; exit 1; }
}
main "$@" </dev/null
