// Pistler: Racing Kit karolarıyla ızgara üzerinde kurulur.
// Hücre koordinatları: x sağa (+x), z aşağı (+z). Yön N = -z.
// Jetonlar: S<n> düz, R<n>/L<n> sağ/sol viraj (n = 1 küçük, 2 büyük, 3 daha büyük),
//           U rampa çıkışı (2 hücre), B<n> köprü (n hücre), D rampa inişi (2 hücre).
export const TILE = 14; // bir karo kaç metre
export const LEVEL_H = 0.5 * TILE; // köprü yüksekliği
export const ROAD_Y = 0.01 * TILE; // yol yüzeyi

export const TRACKS = [
  { id: 'park', name: 'Park Pisti', seq: 'S5 R3 S3 R2 L2 S2 L2 R2 S2 R3 S9 R3 S13 R3 S4', theme: 'park' },
  { id: 'kopru', name: 'Köprü Sekizi', seq: 'S2 U B3 D S1 R3 S1 R3 S2 R3 S7 L3 S4 L3 S1 L3 S1', theme: 'lake' },
  { id: 'dag', name: 'Dağ Virajları', seq: 'S5 R3 R1 L2 R2 L1 L1 S2 R1 R3 S4 R3 S5 R3', theme: 'forest' },
];

const DIRS = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
const ORDER = 'NESW';
const right = h => ORDER[(ORDER.indexOf(h) + 1) % 4];
const left = h => ORDER[(ORDER.indexOf(h) + 3) % 4];
const opposite = h => ORDER[(ORDER.indexOf(h) + 2) % 4];
export const HEADING_ROT = { N: 0, E: -Math.PI / 2, S: Math.PI, W: Math.PI / 2 };

// kanonik (N yönlü) vektörü h yönüne çevir
export function rotH(h, x, z) {
  switch (h) {
    case 'N': return [x, z];
    case 'E': return [-z, x];
    case 'S': return [-x, -z];
    default: return [z, -x];
  }
}

// Izgara yerleşimi: gidiş sırasıyla parçalar + yerleştirilecek modeller
export function buildLayout(seq) {
  let c = [0, 0], h = 'N';
  const pieces = [], models = [];
  const ground = new Set(), bridge = new Set();
  const key = (x, z) => x + ',' + z;
  for (const t of seq.trim().split(/\s+/)) {
    const kind = t[0], n = parseInt(t.slice(1) || '1', 10);
    if (kind === 'S' || kind === 'B') {
      for (let k = 0; k < n; k++) {
        const lvl = kind === 'B' ? 1 : 0;
        pieces.push({ kind: 'S', entry: c.slice(), h, len: 1, y0: lvl, y1: lvl });
        (lvl ? bridge : ground).add(key(c[0], c[1]));
        models.push({ name: lvl ? 'bridge' : 'roadStraight', ax: c[0], az: c[1], h, cell: key(c[0], c[1]) });
        c = [c[0] + DIRS[h][0], c[1] + DIRS[h][1]];
      }
    } else if (kind === 'U' || kind === 'D') {
      const up = kind === 'U';
      const c1 = [c[0] + DIRS[h][0], c[1] + DIRS[h][1]];
      pieces.push({ kind: 'S', entry: c.slice(), h, len: 2, y0: up ? 0 : 1, y1: up ? 1 : 0 });
      ground.add(key(c[0], c[1])); ground.add(key(c1[0], c1[1]));
      if (up) models.push({ name: 'roadRampLong', ax: c[0], az: c[1], h });
      else models.push({ name: 'roadRampLong', ax: c1[0], az: c1[1], h: opposite(h) });
      c = [c1[0] + DIRS[h][0], c1[1] + DIRS[h][1]];
    } else {
      let hp, anchor, exitc, nh, rev;
      if (kind === 'R') {
        hp = h; anchor = c.slice(); const e = rotH(hp, n - 1, -(n - 1));
        exitc = [anchor[0] + e[0], anchor[1] + e[1]]; nh = right(h); rev = false;
      } else {
        hp = right(h); const e = rotH(hp, n - 1, -(n - 1));
        anchor = [c[0] - e[0], c[1] - e[1]]; exitc = anchor; nh = left(h); rev = true;
      }
      pieces.push({ kind: 'C', n, anchor, h: hp, rev });
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const v = rotH(hp, i, -j); ground.add(key(anchor[0] + v[0], anchor[1] + v[1])); }
      const base = n === 1 ? 'roadCornerSmall' : n === 2 ? 'roadCornerLarge' : 'roadCornerLarger';
      models.push({ name: base, ax: anchor[0], az: anchor[1], h: hp, corner: n });
      models.push({ name: base + 'Border', ax: anchor[0], az: anchor[1], h: hp, lift: 1, corner: n });
      if (n > 1) models.push({ name: base + 'BorderInner', ax: anchor[0], az: anchor[1], h: hp, lift: 1, corner: n });
      h = nh; c = [exitc[0] + DIRS[h][0], exitc[1] + DIRS[h][1]];
    }
  }
  // köprü altından yol geçiyorsa ayaksız köprü parçası
  for (const m of models) if (m.name === 'bridge') m.name = ground.has(m.cell) ? 'roadStraightBridgeMid' : 'roadStraightBridge';
  // başlangıç: (0,0)-(0,-1) bitiş kapısı, arkadaki düz hücre çiftlerine grid çizgileri
  const isStraight = (x, z) => models.some(m => m.name === 'roadStraight' && m.ax === x && m.az === z && m.h === 'N');
  const skip = new Set(['0,0', '0,-1']);
  const start = [{ name: 'roadStart', ax: 0, az: 0, h: 'N', solid: true }];
  for (const z of [2, 4]) if (isStraight(0, z) && isStraight(0, z - 1)) { start.push({ name: 'roadStartPositions', ax: 0, az: z, h: 'N' }); skip.add('0,' + z); skip.add('0,' + (z - 1)); }
  const out = models.filter(m => !(m.name === 'roadStraight' && skip.has(m.ax + ',' + m.az))).concat(start);
  return { pieces, models: out, cells: new Set([...ground, ...bridge]) };
}

function toWorld(p, x, z) {
  const v = rotH(p.h, x, z);
  return [(p.anchor[0] + v[0]) * TILE, (p.anchor[1] + v[1]) * TILE];
}

export function buildCenterline(pieces, spacing = 1.0) {
  const dense = [];
  for (const p of pieces) {
    const pts = [];
    if (p.kind === 'S') {
      const m = 28 * p.len;
      for (let i = 0; i <= m; i++) {
        const t = i / m;
        const v = rotH(p.h, 0, 0.5 - t * p.len);
        const y = (p.y0 + (p.y1 - p.y0) * t) * LEVEL_H;
        pts.push([(p.entry[0] + v[0]) * TILE, (p.entry[1] + v[1]) * TILE, y]);
      }
    } else {
      const r = p.n - 0.5, cx = p.n - 0.5, cz = 0.5;
      const m = Math.ceil(r * TILE * Math.PI / 2 / 0.25);
      for (let i = 0; i <= m; i++) {
        const a = Math.PI + (Math.PI / 2) * (i / m);
        const w = toWorld(p, cx + r * Math.cos(a), cz + r * Math.sin(a));
        pts.push([w[0], w[1], 0]);
      }
      if (p.rev) pts.reverse();
    }
    if (dense.length) pts.shift();
    for (const q of pts) dense.push(q);
  }
  dense.pop();
  const cum = [0];
  for (let i = 1; i <= dense.length; i++) {
    const a = dense[i - 1], b = dense[i % dense.length];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const L = cum[dense.length];
  const N = Math.round(L / spacing);
  const ds = L / N;
  const px = new Float32Array(N), pz = new Float32Array(N), py = new Float32Array(N);
  let j = 0;
  for (let i = 0; i < N; i++) {
    const s = i * ds;
    while (cum[j + 1] < s) j++;
    const a = dense[j], b = dense[(j + 1) % dense.length];
    const t = (s - cum[j]) / (cum[j + 1] - cum[j] || 1);
    px[i] = a[0] + (b[0] - a[0]) * t; pz[i] = a[1] + (b[1] - a[1]) * t; py[i] = a[2] + (b[2] - a[2]) * t;
  }
  const tx = new Float32Array(N), tz = new Float32Array(N), curv = new Float32Array(N), slope = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = (i - 1 + N) % N, b = (i + 1) % N;
    const dx = px[b] - px[a], dz = pz[b] - pz[a]; const l = Math.hypot(dx, dz) || 1;
    tx[i] = dx / l; tz[i] = dz / l;
    slope[i] = (py[b] - py[a]) / (2 * ds);
  }
  for (let i = 0; i < N; i++) {
    const a = (i - 2 + N) % N, b = (i + 2) % N;
    let ang = Math.atan2(tz[b], tx[b]) - Math.atan2(tz[a], tx[a]);
    while (ang > Math.PI) ang -= 2 * Math.PI; while (ang < -Math.PI) ang += 2 * Math.PI;
    curv[i] = Math.abs(ang) / (4 * ds);
  }
  const c2 = new Float32Array(N);
  for (let i = 0; i < N; i++) { let s = 0; for (let k = -3; k <= 3; k++) s += curv[(i + k + N) % N]; c2[i] = s / 7; }
  // Duvar mesafesi: yerde 0,74 karo; rampa/köprüde korkuluk içi; başka bir yol bölümü yakınsa ikisinin ortası
  const wall = new Float32Array(N), elev = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const up = py[i] > 0.3 || Math.abs(slope[i]) > 0.01;
    elev[i] = up ? 1 : 0;
    let w = up ? 0.4 * TILE - 1.3 : 0.74 * TILE;
    for (let k = 0; k < N; k += 2) {
      let d = Math.abs(k - i); d = Math.min(d, N - d);
      if (Math.abs(py[k] - py[i]) > 3) continue;
      const dist = Math.hypot(px[k] - px[i], pz[k] - pz[i]);
      // aynı bölüm değil: yol boyunca uzaklık, kuş uçuşunun iki katından fazla (firkete, paralel yollar)
      if (d * ds < Math.max(20, 2.0 * dist)) continue;
      const lim = dist / 2 - 0.4;
      if (lim < w) w = lim;
    }
    wall[i] = Math.max(3.2, w);
  }
  const w2 = new Float32Array(N);
  for (let i = 0; i < N; i++) { let m = wall[i]; for (let k = -6; k <= 6; k++) m = Math.min(m, wall[(i + k + N) % N]); w2[i] = m; }
  return { N, ds, L, px, pz, py, tx, tz, curv: c2, slope, wall: w2, elev };
}

export function speedProfile(cl, top, aLat, aBrake) {
  const { N, ds, curv } = cl;
  const v = new Float32Array(N);
  for (let i = 0; i < N; i++) v[i] = Math.min(top, Math.sqrt(aLat / Math.max(curv[i], 1e-5)));
  for (let pass = 0; pass < 2; pass++)
    for (let i = N - 1; i >= 0; i--) {
      const nx = v[(i + 1) % N];
      const lim = Math.sqrt(nx * nx + 2 * aBrake * ds);
      if (v[i] > lim) v[i] = lim;
    }
  return v;
}

// Yerel en yakın nokta araması. Dizini döndürür; s, lat, y ve yönleri out'a yazar.
export function project(cl, x, z, hint, out) {
  const { N, px, pz } = cl;
  let best = hint, c = hint;
  for (let iter = 0; iter < 6; iter++) {
    let bd = Infinity;
    for (let k = -8; k <= 8; k++) {
      const i = (c + k + N) % N;
      const dx = px[i] - x, dz = pz[i] - z, d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = i; }
    }
    let off = best - c; if (off > N / 2) off -= N; else if (off < -N / 2) off += N;
    if (off > -8 && off < 8) break;
    c = best;
  }
  // en yakın noktanın önündeki ya da arkasındaki parça: araba hangisinin üstündeyse (süreklilik için)
  let i = best, n = (i + 1) % N;
  let sx = px[n] - px[i], sz = pz[n] - pz[i];
  let sl = Math.hypot(sx, sz) || 1;
  let t = ((x - px[i]) * sx + (z - pz[i]) * sz) / (sl * sl);
  if (t < 0) {
    i = (best - 1 + N) % N; n = best;
    sx = px[n] - px[i]; sz = pz[n] - pz[i]; sl = Math.hypot(sx, sz) || 1;
    t = ((x - px[i]) * sx + (z - pz[i]) * sz) / (sl * sl);
  }
  if (t < 0) t = 0; else if (t > 1) t = 1;
  out.s = (i + t) * cl.ds;
  const ux = sx / sl, uz = sz / sl;
  out.lat = (x - px[i]) * (-uz) + (z - pz[i]) * ux; // + = gidişin sağı
  out.nx = -uz; out.nz = ux; out.tx = ux; out.tz = uz;
  out.y = cl.py[i] + (cl.py[n] - cl.py[i]) * t;
  out.wall = cl.wall[i];
  out.slope = cl.slope[i];
  out.elev = cl.elev[i];
  return best;
}

export function nearestGlobal(cl, x, z, y = 0) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < cl.N; i++) {
    const dx = cl.px[i] - x, dz = cl.pz[i] - z, dy = (cl.py[i] - y) * 3, d = dx * dx + dz * dz + dy * dy;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
