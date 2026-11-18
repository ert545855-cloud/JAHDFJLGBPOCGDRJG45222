// Parti Kupası araç modları için ortak hesaplar: sunucu (server/kupa-veh.js) ve istemci (k3veh.js) aynı dosyayı kullanır.
// Araba Yarışı: kapalı pist, orta çizgi ve hız haritası. Gemi Savaşı: deniz, adalar, daralan fırtına halkası.

// ---- Araba Yarışı ----
export const CAR = { W: 11, laps: 2, vmax: 23, turbo: 31, acc: 12, brake: 22, off: 12, wall: 3.2, tcd: 6, tlen: 1.4, lat: 13, r: 1.25 };
// Kontrol noktaları (m). Saat yönünün tersine; başlangıç çizgisi ilk noktada.
const SHAPES = [
  [[0, -40], [30, -42], [50, -30], [55, -8], [44, 8], [28, 16], [21, 31], [18, 46], [4, 57], [-16, 52], [-30, 40], [-46, 34], [-57, 15], [-51, -14], [-28, -35]],
  [[0, -38], [32, -38], [52, -24], [56, 0], [42, 16], [26, 24], [22, 40], [20, 54], [10, 66], [-8, 64], [-22, 54], [-32, 38], [-52, 26], [-56, -6], [-30, -33]],
];
export const TRACKS = SHAPES.length;
const cache = new Map();
export function carTrack(k = 0) {
  k = ((k % SHAPES.length) + SHAPES.length) % SHAPES.length; if (cache.has(k)) return cache.get(k);
  const P = SHAPES[k]; const n = P.length; const raw = [];
  for (let i = 0; i < n; i++) { // kapalı Catmull-Rom eğrisi
    const p0 = P[(i - 1 + n) % n]; const p1 = P[i]; const p2 = P[(i + 1) % n]; const p3 = P[(i + 2) % n];
    for (let u = 0; u < 1; u += 1 / 40) {
      const u2 = u * u; const u3 = u2 * u;
      raw.push([0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * u + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * u2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * u3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * u + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * u2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * u3)]);
    }
  }
  // eşit aralıklı yeniden örnekleme (1 m)
  const cum = [0]; for (let i = 1; i <= raw.length; i++) { const a = raw[i - 1]; const b = raw[i % raw.length]; cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const L0 = cum[raw.length]; const N = Math.round(L0); const ds = L0 / N;
  const x = new Float32Array(N); const z = new Float32Array(N); let j = 0;
  for (let i = 0; i < N; i++) { const s = i * ds; while (cum[j + 1] < s) j++; const a = raw[j]; const b = raw[(j + 1) % raw.length]; const f = (s - cum[j]) / (cum[j + 1] - cum[j] || 1); x[i] = a[0] + (b[0] - a[0]) * f; z[i] = a[1] + (b[1] - a[1]) * f; }
  const tx = new Float32Array(N); const tz = new Float32Array(N); const cv = new Float32Array(N);
  for (let i = 0; i < N; i++) { const a = (i - 1 + N) % N; const b = (i + 1) % N; const dx = x[b] - x[a]; const dz = z[b] - z[a]; const l = Math.hypot(dx, dz) || 1; tx[i] = dx / l; tz[i] = dz / l; }
  for (let i = 0; i < N; i++) { const a = (i - 3 + N) % N; const b = (i + 3) % N; let d = Math.atan2(tx[b], tz[b]) - Math.atan2(tx[a], tz[a]); d = Math.atan2(Math.sin(d), Math.cos(d)); cv[i] = d / (6 * ds); } // eğrilik (işaretli)
  // hız haritası: virajda yanal ivme sınırı, önden fren payı
  const sp = new Float32Array(N); for (let i = 0; i < N; i++) sp[i] = Math.min(CAR.vmax, Math.sqrt(CAR.lat / Math.max(1e-4, Math.abs(cv[i]))));
  for (let pass = 0; pass < 2; pass++) for (let i = N - 1; i >= 0; i--) { const nx = sp[(i + 1) % N]; sp[i] = Math.min(sp[i], Math.sqrt(nx * nx + 2 * 16 * ds)); }
  let minx = 1e9; let maxx = -1e9; let minz = 1e9; let maxz = -1e9; for (let i = 0; i < N; i++) { minx = Math.min(minx, x[i]); maxx = Math.max(maxx, x[i]); minz = Math.min(minz, z[i]); maxz = Math.max(maxz, z[i]); }
  const t = { k, N, ds, L: N * ds, x, z, tx, tz, cv, sp, W: CAR.W, box: { minx, maxx, minz, maxz } }; cache.set(k, t); return t;
}
// Noktayı orta çizgiye izdüşür: s (pist boyunca), lat (sola artı). hint: önceki indeks (yakın arama)
export function project(t, px, pz, hint = -1) {
  const { N, x, z, tx, tz, ds } = t; let best = -1; let bd = 1e18;
  const scan = (i) => { const dx = px - x[i]; const dz = pz - z[i]; const d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } };
  if (hint >= 0) for (let k = -30; k <= 30; k++) scan((hint + k + N) % N);
  if (hint < 0 || bd > 15 * 15) for (let i = 0; i < N; i++) scan(i);
  const i = best; const dx = px - x[i]; const dz = pz - z[i]; const al = dx * tx[i] + dz * tz[i];
  let s = i * ds + al; s = ((s % t.L) + t.L) % t.L;
  return { i, s, lat: dx * -tz[i] + dz * tx[i] }; // sol normal: (-tz, tx)
}
export const atS = (t, s) => { const L = t.L; s = ((s % L) + L) % L; const f = s / t.ds; const i = Math.floor(f) % t.N; const j = (i + 1) % t.N; const u = f - Math.floor(f); return { i, x: t.x[i] + (t.x[j] - t.x[i]) * u, z: t.z[i] + (t.z[j] - t.z[i]) * u, tx: t.tx[i], tz: t.tz[i] }; };
// Başlangıç dizilişi: ikişerli sıra, çizginin gerisinde
export function grid(t, k) { const row = Math.floor(k / 2); const s = t.L - 7 - row * 6.5; const p = atS(t, s); const lat = (k % 2 ? -1 : 1) * 2.6; return { x: p.x - p.tz * lat, z: p.z + p.tx * lat, ry: Math.atan2(p.tx, p.tz), s, prog: s - t.L, lat }; }
// Sürüş (oyuncunun kendi arabası): c = { x, z, ry, v, st, ci, prog, turbo, tcd, hit }
export function carStep(c, t, inp, dt) {
  c.st += ((inp.x || 0) - c.st) * Math.min(1, dt * 9);
  const pr = project(t, c.x, c.z, c.ci); const off = Math.abs(pr.lat) > t.W / 2; c.off = off;
  const top = c.turbo > 0 ? CAR.turbo : off ? CAR.off : CAR.vmax; const gas = inp.gas ?? 1;
  if (gas < 0) c.v = Math.max(-7, c.v - CAR.brake * dt);
  else if (c.v < top) c.v = Math.min(top, c.v + (c.turbo > 0 ? CAR.acc * 2.2 : CAR.acc) * gas * dt * (1 - Math.max(0, c.v) / (top * 1.25)));
  else c.v = Math.max(top, c.v - (off ? 26 : 8) * dt);
  if (!gas) c.v *= 1 - Math.min(1, dt * 0.6);
  const grip = Math.min(1, Math.abs(c.v) / 7) * (1 - 0.3 * Math.min(1, Math.abs(c.v) / 30));
  c.ry -= c.st * 2.3 * grip * Math.sign(c.v || 1) * dt;
  c.x += Math.sin(c.ry) * c.v * dt; c.z += Math.cos(c.ry) * c.v * dt;
  // bariyer: pist kenarından biraz ötede
  const p2 = project(t, c.x, c.z, pr.i); const lim = t.W / 2 + CAR.wall;
  if (Math.abs(p2.lat) > lim) {
    const sg = Math.sign(p2.lat); const nx = -t.tz[p2.i] * sg; const nz = t.tx[p2.i] * sg; const over = Math.abs(p2.lat) - lim;
    c.x -= nx * over; c.z -= nz * over; const into = Math.sin(c.ry) * nx + Math.cos(c.ry) * nz;
    if (into > 0) { c.v *= 1 - Math.min(0.5, into * 0.6); const a = Math.atan2(t.tx[p2.i], t.tz[p2.i]); let d = a - c.ry; d = Math.atan2(Math.sin(d), Math.cos(d)); if (Math.abs(d) > Math.PI / 2) d = Math.atan2(Math.sin(d + Math.PI), Math.cos(d + Math.PI)); c.ry += d * 0.35; c.hit = (c.hit || 0) + into; }
  }
  // ilerleme: orta çizgi boyunca, çizgiyi geçerken sarar
  const p3 = project(t, c.x, c.z, p2.i); let d = p3.s - ((c.prog % t.L) + t.L) % t.L; if (d > t.L / 2) d -= t.L; if (d < -t.L / 2) d += t.L; c.prog += d; c.ci = p3.i; c.lat = p3.lat;
  c.turbo = Math.max(0, c.turbo - dt); c.tcd = Math.max(0, c.tcd - dt);
}

// ---- Gemi Savaşı ----
export const SHIP = { A: 30, R: 1.25, hp: 3, sp: 6.8, min: 2.2, turn: 2.1, ball: 17, range: 14, cd: 1.2, hit: 1.2, storm: { r0: 31, r1: 8, from: 14, rate: 0.36, every: 2.2 } };
export const stormR = (t) => Math.max(SHIP.storm.r1, SHIP.storm.r0 - SHIP.storm.rate * Math.max(0, t - SHIP.storm.from));
function rng(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// Adalar: [x, z, çarpışma yarıçapı, tür (0 büyük ada, 1 kum adası, 2 kaya), dönüş]; doğuş halkasından (21 m) uzak
export function seaIslands(seed) {
  const R = rng(seed); const out = []; const tries = [[0, 4.3, 2], [1, 3.2, 3], [2, 1.05, 5]];
  for (const [kind, r, n] of tries) for (let k = 0, got = 0; k < 80 && got < n; k++) {
    const a = R() * Math.PI * 2; const d = kind === 2 ? 5 + R() * 20 : 6 + R() * 11; const x = Math.cos(a) * d; const z = Math.sin(a) * d;
    if (Math.abs(d - 21) < r + 3.5) continue; if (out.some((o) => Math.hypot(o[0] - x, o[1] - z) < o[2] + r + 4.5)) continue;
    out.push([+x.toFixed(2), +z.toFixed(2), r, kind, Math.floor(R() * 4)]); got++;
  }
  return out;
}
// Gemi sürüşü (oyuncunun kendi gemisi): s = { x, z, ry, v }; w: dünya yönünde istek (uzunluk 0..1)
export function shipStep(s, isl, wx, wz, dt) {
  const m = Math.min(1, Math.hypot(wx, wz));
  if (m > 0.2) { const want = Math.atan2(wx, wz); let d = want - s.ry; d = Math.atan2(Math.sin(d), Math.cos(d)); const tr = SHIP.turn * dt * (0.55 + 0.45 * Math.min(1, s.v / SHIP.sp)); s.ry += Math.max(-tr, Math.min(tr, d)); }
  const top = SHIP.min + (SHIP.sp - SHIP.min) * (m > 0.2 ? m : 0); s.v += (top - s.v) * Math.min(1, dt * (top > s.v ? 1.6 : 1.1));
  s.x += Math.sin(s.ry) * s.v * dt; s.z += Math.cos(s.ry) * s.v * dt;
  for (const [x, z, r] of isl) { const dx = s.x - x; const dz = s.z - z; const d = Math.hypot(dx, dz); const lim = r + 1.0; if (d < lim && d > 1e-4) { s.x = x + (dx / d) * lim; s.z = z + (dz / d) * lim; s.v *= 0.92; } }
  const A = SHIP.A - 1; s.x = Math.max(-A, Math.min(A, s.x)); s.z = Math.max(-A, Math.min(A, s.z));
}
// Gülle bir adaya çarpıyor mu? (a → b doğru parçası)
export function segHit(ax, az, bx, bz, cx, cz, r) { const dx = bx - ax; const dz = bz - az; const l2 = dx * dx + dz * dz || 1e-9; const u = Math.max(0, Math.min(1, ((cx - ax) * dx + (cz - az) * dz) / l2)); return Math.hypot(ax + dx * u - cx, az + dz * u - cz) < r; }
