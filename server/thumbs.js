// /media/:id?w=320 → küçültülmüş JPEG. Üretilen küçükler bellekte tutulur (diskte/veritabanında yer kaplamaz);
// tarayıcı ve ara önbellekler bir yıl saklar, sunucu yeniden başlarsa ilk istekte yeniden üretilir.
const path = require('path');
const SIZES = [160, 320, 480, 720, 1080];
const MAX_BYTES = 48 * 1024 * 1024;
const cache = new Map(); let bytes = 0;
const inflight = new Map();
let worker = null; let seq = 0; const pend = new Map();

function getWorker() {
  if (worker) return worker;
  const { Worker } = require('worker_threads');
  worker = new Worker(path.join(__dirname, 'thumb-worker.js'));
  worker.on('message', ({ id, ok, data, error, hash }) => { const p = pend.get(id); if (!p) return; pend.delete(id); clearTimeout(p.t); if (ok) p.res(hash || (data ? Buffer.from(data) : null)); else p.rej(new Error(error)); });
  const dead = (e) => { for (const p of pend.values()) { clearTimeout(p.t); p.rej(e || new Error('çalışan durdu')); } pend.clear(); worker = null; };
  worker.on('error', dead); worker.on('exit', () => dead());
  worker.unref();
  return worker;
}
function make(buf, w, op) {
  return new Promise((res, rej) => {
    const id = ++seq;
    const t = setTimeout(() => { pend.delete(id); rej(new Error('zaman aşımı')); }, 20000);
    pend.set(id, { res, rej, t });
    const copy = new Uint8Array(buf); // aktarım için kopya (önbellekteki asıl dosya bozulmasın)
    getWorker().postMessage({ id, buf: copy, w, op }, [copy.buffer]);
  });
}
// Fotoğrafın benzerlik özeti (yalnız JPEG); yapılamazsa null
const hash = (item) => (item?.mime === 'image/jpeg' ? make(item.data, 0, 'hash').catch(() => null) : Promise.resolve(null));
const hamming = (a, b) => { let x = BigInt('0x' + a) ^ BigInt('0x' + b); let n = 0; while (x) { n += Number(x & 1n); x >>= 1n; } return n; };
const snap = (w) => { w = parseInt(w, 10); if (!w || w < 1) return 0; return SIZES.find((s) => s >= w) || SIZES[SIZES.length - 1]; };

// Küçüğü döndürür; gerek yoksa / yapılamazsa null (asıl dosya gönderilir)
async function thumb(id, w, item) {
  if (!item || item.mime !== 'image/jpeg' || item.data.length < 40000) return null;
  const key = `${id}_${w}`;
  if (cache.has(key)) { const v = cache.get(key); cache.delete(key); cache.set(key, v); return v; }
  if (inflight.has(key)) return inflight.get(key);
  if (pend.size >= 6) return null; // yoğunlukta asıl dosyayı ver
  const p = make(item.data, w).then((buf) => {
    const v = buf && buf.length < item.data.length * 0.9 ? buf : false; // kazanç yoksa asıl dosya
    cache.set(key, v); bytes += v ? v.length : 0;
    while (bytes > MAX_BYTES && cache.size > 1) { const [k, x] = cache.entries().next().value; cache.delete(k); bytes -= x ? x.length : 0; }
    return v || null;
  }).catch(() => null).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
const drop = (id) => { for (const k of [...cache.keys()]) if (k.startsWith(id + '_')) { const x = cache.get(k); bytes -= x ? x.length : 0; cache.delete(k); } };
module.exports = { thumb, snap, drop, hash, hamming, SIZES, stats: () => ({ items: cache.size, mb: +(bytes / 1048576).toFixed(1) }) };
