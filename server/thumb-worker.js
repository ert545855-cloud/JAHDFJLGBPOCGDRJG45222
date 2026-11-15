// Küçük fotoğraf (thumbnail) üretimi ayrı iş parçacığında: ana sunucu bloklanmaz
const { parentPort } = require('worker_threads');
const jpeg = require('jpeg-js');
const { downscale } = require('./imagefix');

// 64 bitlik fark özeti (dHash): aynı fotoğrafın küçültülmüş / yeniden kaydedilmiş hâli de aynı ya da çok yakın çıkar
function dhash(img) {
  const g = downscaleGray(img, 9, 8); let h = 0n;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) h = (h << 1n) | (g[y * 9 + x] > g[y * 9 + x + 1] ? 1n : 0n);
  return h.toString(16).padStart(16, '0');
}
function downscaleGray({ width, height, data }, w, h) {
  const out = new Float64Array(w * h); const fx = width / w; const fy = height / h;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0; let n = 0;
    for (let yy = Math.floor(y * fy); yy < Math.floor((y + 1) * fy); yy += 2) for (let xx = Math.floor(x * fx); xx < Math.floor((x + 1) * fx); xx += 2) { const i = (yy * width + xx) * 4; s += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114; n++; }
    out[y * w + x] = n ? s / n : 0;
  }
  return out;
}
parentPort.on('message', ({ id, buf, w, op }) => {
  if (op === 'hash') {
    try { const img = jpeg.decode(Buffer.from(buf), { useTArray: true, maxMemoryUsageInMB: 320, formatAsRGBA: true }); return parentPort.postMessage({ id, ok: true, hash: dhash(img) }); } catch (e) { return parentPort.postMessage({ id, ok: false, error: e.message }); }
  }
  try {
    const img = jpeg.decode(Buffer.from(buf), { useTArray: true, maxMemoryUsageInMB: 320, formatAsRGBA: true });
    if (Math.max(img.width, img.height) <= w * 1.15) return parentPort.postMessage({ id, ok: true, data: null }); // zaten küçük
    const small = downscale({ width: img.width, height: img.height, data: Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength) }, w);
    const out = jpeg.encode(small, 80).data;
    const ab = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
    parentPort.postMessage({ id, ok: true, data: ab }, [ab]);
  } catch (e) { parentPort.postMessage({ id, ok: false, error: e.message }); }
});
