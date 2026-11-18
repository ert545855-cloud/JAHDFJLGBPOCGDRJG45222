// Sunucu bağlantısı: SwipeUp oturumu (su_token) ile /api/race/* ve socket.io.
// Giriş yoksa oyun çevrimdışı çalışır (sıralama, görev, kilit, çok oyunculu kapalı).
let token = null;
try { token = localStorage.getItem('su_token'); } catch (e) { token = null; }
export const online = () => !!token;

export async function api(path, body, method) {
  if (!token) throw new Error('Bu özellik için SwipeUp hesabınla giriş yapmalısın.');
  const res = await fetch('/api/race' + path, {
    method: method || (body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null; try { data = await res.json(); } catch (e) { data = null; }
  if (res.status === 401) { token = null; throw new Error('Oturumun kapanmış. SwipeUp\'a yeniden giriş yap.'); }
  if (!res.ok) { const e = new Error((data && data.error) || 'Bağlantı hatası.'); e.status = res.status; e.data = data; throw e; }
  return data;
}

let sock = null;
export const clock = { offset: 0 }; // sunucu saati - yerel saat
export function socket() {
  if (sock) return sock;
  if (!token || typeof window.io !== 'function') return null;
  sock = window.io({ auth: { token, device: 'race' }, transports: ['websocket', 'polling'] });
  sock.on('connect', syncClock);
  return sock;
}
export function syncClock() {
  if (!sock) return;
  let best = Infinity, n = 0;
  const one = () => {
    const t0 = Date.now();
    sock.timeout(3000).emit('race:clock', 0, (err, st) => {
      if (!err && typeof st === 'number') {
        const t1 = Date.now(), rtt = t1 - t0;
        if (rtt < best) { best = rtt; clock.offset = st - (t0 + t1) / 2; }
      }
      if (++n < 5) setTimeout(one, 120);
    });
  };
  one();
}
export const serverNow = () => Date.now() + clock.offset;

// Hayalet kaydı: 100 ms'de bir [x*10, z*10, yön*10000/π] int16
export function encodeGhost(samples) {
  const a = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) a[i] = Math.max(-32768, Math.min(32767, Math.round(samples[i])));
  const b = new Uint8Array(a.buffer); let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
}
export function decodeGhost(str) {
  const bin = atob(str), b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  const a = new Int16Array(b.buffer, 0, Math.floor(b.length / 2));
  const n = Math.floor(a.length / 3), x = new Float32Array(n), z = new Float32Array(n), yaw = new Float32Array(n);
  for (let i = 0; i < n; i++) { x[i] = a[i * 3] / 10; z[i] = a[i * 3 + 1] / 10; yaw[i] = a[i * 3 + 2] * Math.PI / 10000; }
  return { n, x, z, yaw };
}
