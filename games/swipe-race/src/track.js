// Grid-based track layout built from Kenney Racing Kit tiles.
// Cell coords: x to the right (+x), z "down" (+z). Heading N = -z.
export const TILE = 14; // metres per tile

export const TRACK_SEQ = 'S5 R3 S3 R2 L2 S2 L2 R2 S2 R3 S9 R3 S13 R3 S4';

const DIRS = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
const ORDER = 'NESW';
const right = h => ORDER[(ORDER.indexOf(h) + 1) % 4];
const left = h => ORDER[(ORDER.indexOf(h) + 3) % 4];
export const HEADING_ROT = { N: 0, E: -Math.PI / 2, S: Math.PI, W: Math.PI / 2 };

// rotate canonical (heading N) vector to heading h
export function rotH(h, x, z) {
  switch (h) {
    case 'N': return [x, z];
    case 'E': return [-z, x];
    case 'S': return [-x, -z];
    default: return [z, -x];
  }
}

export function buildLayout(seq = TRACK_SEQ) {
  let c = [0, 0], h = 'N';
  const pieces = [];
  const occ = new Map();
  const mark = (cells, i) => { for (const cc of cells) occ.set(cc[0] + ',' + cc[1], i); };
  for (const t of seq.trim().split(/\s+/)) {
    const kind = t[0], n = parseInt(t.slice(1) || '1', 10);
    if (kind === 'S') {
      for (let k = 0; k < n; k++) {
        pieces.push({ kind: 'S', n: 1, anchor: c.slice(), h, rev: false });
        mark([c], pieces.length - 1);
        c = [c[0] + DIRS[h][0], c[1] + DIRS[h][1]];
      }
    } else {
      let hp, anchor, exitc, nh, rev;
      const cellsOf = (a, hh) => {
        const out = [];
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
          const v = rotH(hh, i, -j); out.push([a[0] + v[0], a[1] + v[1]]);
        }
        return out;
      };
      if (kind === 'R') {
        hp = h; anchor = c.slice(); const e = rotH(hp, n - 1, -(n - 1));
        exitc = [anchor[0] + e[0], anchor[1] + e[1]]; nh = right(h); rev = false;
      } else {
        hp = right(h); const e = rotH(hp, n - 1, -(n - 1));
        anchor = [c[0] - e[0], c[1] - e[1]]; exitc = anchor; nh = left(h); rev = true;
      }
      pieces.push({ kind: 'C', n, anchor, h: hp, rev });
      mark(cellsOf(anchor, hp), pieces.length - 1);
      h = nh; c = [exitc[0] + DIRS[h][0], exitc[1] + DIRS[h][1]];
    }
  }
  return { pieces, occ };
}

// canonical piece-space point -> world metres
function toWorld(p, x, z) {
  const v = rotH(p.h, x, z);
  return [(p.anchor[0] + v[0]) * TILE, (p.anchor[1] + v[1]) * TILE];
}

export function buildCenterline(pieces, spacing = 1.0) {
  const dense = [];
  for (const p of pieces) {
    const pts = [];
    if (p.kind === 'S') {
      const m = 28;
      for (let i = 0; i <= m; i++) pts.push(toWorld(p, 0, 0.5 - i / m));
    } else {
      const r = p.n - 0.5, cx = p.n - 0.5, cz = 0.5;
      const m = Math.ceil(r * TILE * Math.PI / 2 / 0.25);
      for (let i = 0; i <= m; i++) {
        const a = Math.PI + (Math.PI / 2) * (i / m);
        pts.push(toWorld(p, cx + r * Math.cos(a), cz + r * Math.sin(a)));
      }
      if (p.rev) pts.reverse();
    }
    if (dense.length) pts.shift();
    for (const q of pts) dense.push(q);
  }
  dense.pop(); // last == first
  // resample uniformly
  const cum = [0];
  for (let i = 1; i <= dense.length; i++) {
    const a = dense[i - 1], b = dense[i % dense.length];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const L = cum[dense.length];
  const N = Math.round(L / spacing);
  const ds = L / N;
  const px = new Float32Array(N), pz = new Float32Array(N);
  let j = 0;
  for (let i = 0; i < N; i++) {
    const s = i * ds;
    while (cum[j + 1] < s) j++;
    const a = dense[j], b = dense[(j + 1) % dense.length];
    const t = (s - cum[j]) / (cum[j + 1] - cum[j] || 1);
    px[i] = a[0] + (b[0] - a[0]) * t; pz[i] = a[1] + (b[1] - a[1]) * t;
  }
  const tx = new Float32Array(N), tz = new Float32Array(N), curv = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = (i - 1 + N) % N, b = (i + 1) % N;
    let dx = px[b] - px[a], dz = pz[b] - pz[a]; const l = Math.hypot(dx, dz) || 1;
    tx[i] = dx / l; tz[i] = dz / l;
  }
  for (let i = 0; i < N; i++) {
    const a = (i - 2 + N) % N, b = (i + 2) % N;
    let ang = Math.atan2(tz[b], tx[b]) - Math.atan2(tz[a], tx[a]);
    while (ang > Math.PI) ang -= 2 * Math.PI; while (ang < -Math.PI) ang += 2 * Math.PI;
    curv[i] = Math.abs(ang) / (4 * ds);
  }
  // smooth curvature a bit
  const c2 = new Float32Array(N);
  for (let i = 0; i < N; i++) { let s = 0; for (let k = -3; k <= 3; k++) s += curv[(i + k + N) % N]; c2[i] = s / 7; }
  return { N, ds, L, px, pz, tx, tz, curv: c2 };
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

// Local nearest search. Returns index; writes s & lat into out.
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
  // project on segment best -> best+1
  const i = best, n = (i + 1) % N;
  const sx = px[n] - px[i], sz = pz[n] - pz[i];
  const sl = Math.hypot(sx, sz) || 1;
  let t = ((x - px[i]) * sx + (z - pz[i]) * sz) / (sl * sl);
  if (t < 0) t = 0; else if (t > 1) t = 1;
  out.s = (i + t) * cl.ds;
  const ux = sx / sl, uz = sz / sl;
  out.lat = (x - px[i]) * (-uz) + (z - pz[i]) * ux; // + = right of travel
  out.nx = -uz; out.nz = ux; out.tx = ux; out.tz = uz;
  return best;
}

// full search (for spawning / resets)
export function nearestGlobal(cl, x, z) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < cl.N; i++) {
    const dx = cl.px[i] - x, dz = cl.pz[i] - z, d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
