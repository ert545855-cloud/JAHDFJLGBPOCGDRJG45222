// Küçük fotoğraf (thumbnail) üretimi ayrı iş parçacığında: ana sunucu bloklanmaz
const { parentPort } = require('worker_threads');
const jpeg = require('jpeg-js');
const { downscale } = require('./imagefix');

parentPort.on('message', ({ id, buf, w }) => {
  try {
    const img = jpeg.decode(Buffer.from(buf), { useTArray: true, maxMemoryUsageInMB: 320, formatAsRGBA: true });
    if (Math.max(img.width, img.height) <= w * 1.15) return parentPort.postMessage({ id, ok: true, data: null }); // zaten küçük
    const small = downscale({ width: img.width, height: img.height, data: Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength) }, w);
    const out = jpeg.encode(small, 80).data;
    const ab = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
    parentPort.postMessage({ id, ok: true, data: ab }, [ab]);
  } catch (e) { parentPort.postMessage({ id, ok: false, error: e.message }); }
});
