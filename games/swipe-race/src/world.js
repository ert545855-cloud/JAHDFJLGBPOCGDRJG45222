// Dünya: pist modelleri, süsleme, gökyüzü, bulutlar, tepeler, zemin, göl, gece ışıkları.
// Statik her şey 56 m'lik bölgelerde tek ağa birleştirilir (az çizim çağrısı, görünmeyen bölge çizilmez).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { models, matColor, geos, tex } from './assets.js';
import { TILE, TRACKS, HEADING_ROT, buildLayout, buildCenterline, speedProfile, nearestGlobal } from './track.js';
import { scene, staticMat, allMats, hemi, sun, nextFrame } from './core.js';
import { mulberry32 } from './physics.js';

const CH = 4 * TILE;
let texMat = null;
const SUN_DIR = new THREE.Vector3(70, 120, 45).normalize();
export const SUN_OFF = new THREE.Vector3(70, 120, 45);
const MOON_OFF = new THREE.Vector3(-60, 110, -50);

const THEMES = {
  park: { ground: null, hills: [0x6fae6a, 0x5c9a5f, 0x7fbf74], snow: false, trees: ['treeLarge', 'treeSmall', 'tree'], treeP: [0.18, 0.34, 0.5], pits: true, lake: 0.35 },
  lake: { ground: 0x79bd6d, hills: [0x67a86a, 0x4f9466, 0x86c27a], snow: false, trees: ['tree', 'treeLarge', 'treeSmall', 'tree-pine'], treeP: [0.14, 0.3, 0.5], pits: false, lake: 1 },
  forest: { ground: 0x5f9e5a, hills: [0x5d8a63, 0x6f8f86, 0x7a9a8c], snow: true, trees: ['tree-pine', 'treeSmall', 'tree-pine', 'treeLarge'], treeP: [0.3, 0.55, 0.75], pits: false, lake: 0 },
};
const DAY = { top: 0x4f9ee8, hor: 0xcfe9ff, bot: 0xb9dcf2, fog: 0xc4e3fb, fogN: 230, fogF: 720, hemiS: 0xffffff, hemiG: 0x9cbf8a, hemiI: 1.8, sunC: 0xfff1dc, sunI: 2.3 };
const NIGHT = { top: 0x050b1d, hor: 0x1b2d55, bot: 0x0e1730, fog: 0x13213f, fogN: 120, fogF: 560, hemiS: 0x8fa8ff, hemiG: 0x1c2638, hemiI: 0.55, sunC: 0xbcd2ff, sunI: 0.6 };

export class World {
  constructor(trackIndex, night) {
    this.def = TRACKS[trackIndex] || TRACKS[0];
    this.theme = THEMES[this.def.theme] || THEMES.park;
    this.night = !!night;
    this.group = new THREE.Group();
    this.buckets = new Map();
    this.reserved = [];
    this.lamps = [];
    this.disposables = [];
  }
  async build(step = () => {}) {
    const lay = this.layout = buildLayout(this.def.seq);
    const cl = this.cl = buildCenterline(lay.pieces);
    this.prof = speedProfile(cl, 60, 22, 18);
    this.sFinish = TILE; this.iFinish = Math.round(TILE / cl.ds) % cl.N;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < cl.N; i++) { minX = Math.min(minX, cl.px[i]); maxX = Math.max(maxX, cl.px[i]); minZ = Math.min(minZ, cl.pz[i]); maxZ = Math.max(maxZ, cl.pz[i]); }
    this.bounds = { minX, maxX, minZ, maxZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, r: Math.hypot(maxX - minX, maxZ - minZ) / 2 };
    this.rnd = mulberry32(this.def.id.length * 977 + 13);
    this.placeTrack(); step();
    if (this.theme.lake) this.buildLake();
    this.decorate(); step(); await nextFrame();
    this.flush();
    this.buildGround(); this.buildHills(); this.buildSky(); this.buildClouds();
    if (this.night) this.buildNightLights();
    this.pickupSpots();
    this.lightOff = this.night ? MOON_OFF : SUN_OFF;
    return this;
  }
  // sahneye ekle ve ışıkları ayarla (eski dünya kaldırıldıktan sonra çağrılır)
  show() {
    scene.add(this.group);
    this.applyLighting();
  }
  dispose() {
    scene.remove(this.group);
    this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    for (const d of this.disposables) d.dispose();
  }
  clearance(x, z) { const i = nearestGlobal(this.cl, x, z, 0); return Math.hypot(this.cl.px[i] - x, this.cl.pz[i] - z); }

  // ---------- statik birleştirme ----------
  add(name, matrix, cat, wx, wz) {
    const m = models[name]; if (!m) return;
    for (const p of m.parts) {
      const c = p.textured ? 'tex' : cat;
      const key = Math.floor(wx / CH) + ',' + Math.floor(wz / CH) + '|' + c;
      let b = this.buckets.get(key); if (!b) { b = []; this.buckets.set(key, b); }
      const g = p.geo.clone(); g.applyMatrix4(matrix); b.push(g);
    }
  }
  pieceMatrix(ax, az, h, lift = 0) {
    const m = new THREE.Matrix4().makeTranslation(ax * TILE, lift, az * TILE);
    m.multiply(new THREE.Matrix4().makeRotationY(HEADING_ROT[h])).multiply(new THREE.Matrix4().makeScale(TILE, TILE, TILE));
    return m.multiply(new THREE.Matrix4().makeTranslation(-0.15, 0, 1.15));
  }
  decor(name, wx, wz, yaw, scale = TILE, cat = 'solid', y = 0) {
    const md = models[name]; if (!md) return;
    const c = md.center;
    const m = new THREE.Matrix4().makeTranslation(wx, y, wz);
    m.multiply(new THREE.Matrix4().makeRotationY(yaw)).multiply(new THREE.Matrix4().makeScale(scale, scale, scale));
    m.multiply(new THREE.Matrix4().makeTranslation(-c.x, 0, -c.z));
    this.add(name, m, cat, wx, wz);
  }
  flush() {
    if (!texMat) { texMat = new THREE.MeshLambertMaterial({ map: tex[0] }); allMats.push(texMat); }
    for (const [key, list] of this.buckets) {
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      const cat = key.split('|')[1];
      const mesh = new THREE.Mesh(merged, cat === 'tex' ? texMat : staticMat);
      mesh.castShadow = cat !== 'flat'; mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      this.group.add(mesh);
    }
    this.buckets.clear();
  }

  placeTrack() {
    const lift = 0.004 * TILE;
    for (const m of this.layout.models) {
      const wx = m.ax * TILE, wz = m.az * TILE;
      const flat = !m.solid && !/Bridge|Ramp/.test(m.name);
      this.add(m.name, this.pieceMatrix(m.ax, m.az, m.h, m.lift ? lift : 0), flat ? 'flat' : 'solid', wx, wz);
    }
  }

  // ---------- süsleme ----------
  ok(x, z, clr, rr = 9) {
    if (this.clearance(x, z) < clr) return false;
    for (const r of this.reserved) if ((r[0] - x) ** 2 + (r[1] - z) ** 2 < (r[2] + rr) ** 2) return false;
    return true;
  }
  decorate() {
    const cl = this.cl, N = cl.N, rnd = this.rnd, th = this.theme;
    const faceYaw = (dx, dz) => Math.atan2(dx, dz);
    const alongYaw = (dx, dz) => Math.atan2(-dz, dx);
    const W0 = 0.74 * TILE;
    // korkuluk ve lastik bariyerler (yalnız yerde ve duvar daralmamışsa)
    for (let i = 0; i < N; i++) {
      if (cl.elev[i]) continue;
      const w = cl.wall[i]; if (w < W0 - 0.5) continue;
      const lat = w + 1.35;
      const x = cl.px[i], z = cl.pz[i], tx = cl.tx[i], tz = cl.tz[i], nx = -tz, nz = tx;
      if (cl.curv[i] < 0.002) {
        if (i % 14 === 7) for (const sg of [-1, 1]) {
          const px = x + nx * lat * sg, pz = z + nz * lat * sg;
          if (this.clearance(px, pz) > w + 0.2) this.decor('rail', px, pz, alongYaw(tx, tz) + (sg > 0 ? Math.PI : 0));
        }
      } else if (i % 4 === 0) {
        for (const sg of [-1, 1]) {
          const px = x + nx * lat * sg, pz = z + nz * lat * sg;
          if (this.clearance(px, pz) > w + 0.2) this.decor((i / 4) % 2 ? 'barrierRed' : 'barrierWhite', px, pz, alongYaw(tx, tz));
        }
      }
    }
    // başlangıç düzlüğü: tribünler (dış), pitler ya da çadırlar (iç)
    const standX = -1.45 * TILE, pitX = 1.45 * TILE;
    let zMin = 0, zMax = 0;
    const straightAt = z => this.layout.models.some(m => m.ax === 0 && m.az === z && /roadStr|roadStart/.test(m.name));
    while (straightAt(zMin - 1) && zMin > -6) zMin--;
    while (straightAt(zMax + 1) && zMax < 6) zMax++;
    for (let z = zMin; z <= zMax; z++) {
      if (this.ok(standX, z * TILE, 9, 0)) { this.decor(z === zMin || z === zMax ? 'grandStand' : 'grandStandCovered', standX, z * TILE, faceYaw(1, 0)); this.reserved.push([standX, z * TILE, 8]); }
      if (th.pits && this.ok(pitX, z * TILE, 9, 0)) {
        this.decor(z === zMax ? 'pitsOffice' : z === zMin ? 'pitsOfficeRoof' : (z % 2 ? 'pitsGarage' : 'pitsGarageClosed'), pitX, z * TILE, faceYaw(-1, 0));
        this.reserved.push([pitX, z * TILE, 8]);
      } else if (!th.pits && z % 2 === 0 && this.ok(pitX, z * TILE, 9, 0)) {
        this.decor(z % 4 ? 'tentRoof' : 'tentLong', pitX, z * TILE, faceYaw(-1, 0)); this.reserved.push([pitX, z * TILE, 9]);
      }
    }
    if (th.pits) for (let z = zMin; z <= zMax; z += 2) {
      if (this.ok(pitX + TILE * 1.1, z * TILE, 9, 0)) { this.decor(z % 4 ? 'tent' : 'tentLong', pitX + TILE * 1.1, z * TILE, faceYaw(-1, 0)); this.reserved.push([pitX + TILE * 1.1, z * TILE, 12]); }
    }
    const fz = -0.5 * TILE, W = cl.wall[this.iFinish];
    this.decor('flagCheckers', -(W + 2.2), fz - 3, faceYaw(1, 0));
    this.decor('flagCheckers', W + 2.2, fz - 3, faceYaw(-1, 0));
    this.decor('lightRedDouble', W + 2.0, fz + 6, faceYaw(-1, 0));
    this.decor('camera_exclusive', -(W + 3), fz + 12, faceYaw(1, 0));
    // virajların dışı: tribün, reklam panosu, kule
    const cornerSet = ['grandStandRound', 'billboardDouble_exclusive', 'bannerTowerRed', 'billboard', 'bannerTowerGreen', 'grandStandCoveredRound', 'billboardLow'];
    let ci = 0;
    for (let i = 0; i < N; i++) {
      const a = cl.curv[(i - 1 + N) % N], b = cl.curv[i], c = cl.curv[(i + 1) % N];
      if (!(b > 0.012 && b >= a && b > c) || cl.elev[i]) continue;
      const j = (i + 3) % N, k = (i - 3 + N) % N;
      const cross = cl.tx[k] * cl.tz[j] - cl.tz[k] * cl.tx[j];
      const out = cross > 0 ? -1 : 1;
      const nx = -cl.tz[i] * out, nz = cl.tx[i] * out;
      const name = cornerSet[ci++ % cornerSet.length];
      const d = cl.wall[i] + (/grand/.test(name) ? 10 : 6);
      const x = cl.px[i] + nx * d, z = cl.pz[i] + nz * d;
      if (this.ok(x, z, cl.wall[i] + 4, 6)) { this.decor(name, x, z, faceYaw(-nx, -nz)); this.reserved.push([x, z, 9]); }
    }
    // uzun düzlüklerde kemerler
    let run = 0;
    for (let i = 0; i < N; i++) {
      run = cl.curv[i] < 0.002 && !cl.elev[i] ? run + 1 : 0;
      if (run === 60 && Math.abs(i - this.iFinish) > 40) {
        const k = i - 25;
        this.decor(this.def.id === 'park' ? 'overheadLights' : 'overheadRoundColored', cl.px[k], cl.pz[k], alongYaw(-cl.tz[k], cl.tx[k]), TILE * 1.1);
        run = -80;
      }
    }
    // ışık direkleri (gece yanar)
    for (let i = 10; i < N; i += 38) {
      if (cl.elev[i] || cl.wall[i] < W0 - 0.5) continue;
      const sg = Math.floor(i / 38) % 2 ? 1 : -1;
      const nx = -cl.tz[i] * sg, nz = cl.tx[i] * sg;
      const d = cl.wall[i] + 3;
      const x = cl.px[i] + nx * d, z = cl.pz[i] + nz * d;
      if (!this.ok(x, z, cl.wall[i] + 2, 2)) continue;
      this.decor('lightPostModern', x, z, faceYaw(-nx, -nz), TILE);
      const h = (models.lightPostModern ? models.lightPostModern.box.max.y : 0.6) * TILE;
      this.lamps.push({ x: x - nx * 2.2, z: z - nz * 2.2, y: h - 0.3, rx: cl.px[i] + nx * (d - 7), rz: cl.pz[i] + nz * (d - 7), ry: cl.py[i] });
      this.reserved.push([x, z, 3]);
    }
    // ağaçlar
    const { minX, maxX, minZ, maxZ } = this.bounds;
    const pad = 130, step = 9;
    for (let x = minX - pad; x <= maxX + pad; x += step) {
      for (let z = minZ - pad; z <= maxZ + pad; z += step) {
        const jx = x + (rnd() - 0.5) * step * 0.9, jz = z + (rnd() - 0.5) * step * 0.9;
        const r = rnd();
        const cd = this.clearance(jx, jz);
        if (cd < 0.74 * TILE + 8) continue;
        const p = cd < 40 ? th.treeP[0] : cd < 80 ? th.treeP[1] : th.treeP[2];
        if (r > p) continue;
        if (!this.ok(jx, jz, 0.74 * TILE + 8, 3)) continue;
        const name = th.trees[Math.floor(rnd() * th.trees.length)];
        const toy = name === 'tree' || name === 'tree-pine';
        this.decor(name, jx, jz, rnd() * Math.PI * 2, (toy ? 19 : TILE) * (0.8 + rnd() * 0.55));
      }
    }
  }

  // ---------- çevre ----------
  buildGround() {
    const base = new THREE.Color(this.theme.ground || (matColor('roadStraight', 'grass') || new THREE.Color(0x5fa060)).getHex());
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const g = cv.getContext('2d');
    const a = base.clone().offsetHSL(0, 0.02, 0.025), b = base.clone().offsetHSL(0, -0.01, -0.02);
    g.fillStyle = '#' + a.getHexString(); g.fillRect(0, 0, 256, 128);
    g.fillStyle = '#' + b.getHexString(); g.fillRect(0, 128, 256, 128);
    const rnd = mulberry32(5);
    for (let i = 0; i < 2200; i++) {
      const c = base.clone().offsetHSL((rnd() - 0.5) * 0.02, 0, (rnd() - 0.5) * 0.08);
      g.fillStyle = '#' + c.getHexString(); g.fillRect(rnd() * 256, rnd() * 256, 2, 2);
    }
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2000 / 22, 2000 / 22);
    t.anisotropy = 4;
    const mat = new THREE.MeshLambertMaterial({ map: t });
    this.disposables.push(t, mat); allMats.push(mat);
    const geo = new THREE.PlaneGeometry(2000, 2000); geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(this.bounds.cx, -0.2, this.bounds.cz);
    m.receiveShadow = true; m.matrixAutoUpdate = false; m.updateMatrix();
    this.group.add(m);
  }
  buildLake() {
    // pistten en uzak iç nokta: göl merkezi
    const { minX, maxX, minZ, maxZ } = this.bounds;
    let best = null, bd = 0;
    for (let x = minX; x <= maxX; x += 6) for (let z = minZ; z <= maxZ; z += 6) {
      const d = this.clearance(x, z);
      let ok = true; for (const r of this.reserved) if ((r[0] - x) ** 2 + (r[1] - z) ** 2 < (r[2] + 20) ** 2) ok = false;
      if (ok && d > bd) { bd = d; best = [x, z]; }
    }
    const R = Math.min(60, bd - 0.74 * TILE - 9) * this.theme.lake;
    if (!best || R < 12) return;
    const rnd = mulberry32(21), seg = 40;
    const shape = new THREE.Shape(), sand = new THREE.Shape();
    const radii = []; for (let i = 0; i < seg; i++) radii.push(R * (0.82 + rnd() * 0.18));
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2, r = radii[i % seg];
      const f = i ? 'lineTo' : 'moveTo';
      shape[f](Math.cos(a) * r, Math.sin(a) * r); sand[f](Math.cos(a) * (r + 3.5), Math.sin(a) * (r + 3.5));
    }
    const wg = new THREE.ShapeGeometry(shape); wg.rotateX(-Math.PI / 2);
    const sg = new THREE.ShapeGeometry(sand); sg.rotateX(-Math.PI / 2);
    const wm = new THREE.MeshLambertMaterial({ color: this.night ? 0x2a4d7a : 0x56b3e8, emissive: this.night ? 0x0a1a33 : 0x0b3a5a });
    const sm = new THREE.MeshLambertMaterial({ color: 0xe8d6a8 });
    this.disposables.push(wm, sm); allMats.push(wm, sm);
    const water = new THREE.Mesh(wg, wm), beach = new THREE.Mesh(sg, sm);
    water.position.set(best[0], -0.05, best[1]); beach.position.set(best[0], -0.12, best[1]);
    water.receiveShadow = beach.receiveShadow = true;
    for (const o of [water, beach]) { o.matrixAutoUpdate = false; o.updateMatrix(); this.group.add(o); }
    this.reserved.push([best[0], best[1], R + 6]);
    // kıyıda birkaç çadır
    for (let k = 0; k < 3; k++) {
      const a = rnd() * Math.PI * 2, x = best[0] + Math.cos(a) * (R + 10), z = best[1] + Math.sin(a) * (R + 10);
      if (this.ok(x, z, 0.74 * TILE + 6, 0)) { this.decor(k % 2 ? 'tent' : 'tentClosed', x, z, Math.atan2(best[0] - x, best[1] - z)); this.reserved.push([x, z, 8]); }
    }
  }
  buildHills() {
    const th = this.theme, rnd = mulberry32(77), parts = [];
    const n = 46, base = this.bounds.r + 150;
    const cols = th.hills.map(c => new THREE.Color(c));
    const snow = new THREE.Color(0xf4f7fb);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.12;
      const dist = base + rnd() * 260;
      const r = 45 + rnd() * 70, h = (th.snow ? 70 : 32) + rnd() * (th.snow ? 110 : 55);
      const g = new THREE.IcosahedronGeometry(1, 1);
      const p = g.attributes.position;
      for (let k = 0; k < p.count; k++) {
        let y = p.getY(k); const s = 1 + (rnd() - 0.5) * 0.25;
        p.setXYZ(k, p.getX(k) * r * s, Math.max(-0.3, y) * h, p.getZ(k) * r * s);
      }
      const c0 = cols[i % cols.length], col = new Float32Array(p.count * 3);
      for (let k = 0; k < p.count; k += 3) {
        const yAvg = (p.getY(k) + p.getY(k + 1) + p.getY(k + 2)) / 3 / h;
        const c = th.snow && yAvg > 0.62 ? snow : c0.clone().offsetHSL(0, 0, (yAvg - 0.3) * 0.12 + (rnd() - 0.5) * 0.03);
        for (let q = 0; q < 3; q++) { col[(k + q) * 3] = c.r; col[(k + q) * 3 + 1] = c.g; col[(k + q) * 3 + 2] = c.b; }
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.computeVertexNormals();
      g.translate(this.bounds.cx + Math.cos(a) * dist, -h * 0.12, this.bounds.cz + Math.sin(a) * dist);
      parts.push(g);
    }
    const geo = mergeGeometries(parts, false); parts.forEach(g => g.dispose());
    const m = new THREE.Mesh(geo, staticMat); m.matrixAutoUpdate = false; m.updateMatrix();
    this.group.add(m);
  }
  buildSky() {
    const P = this.night ? NIGHT : DAY;
    const geo = new THREE.SphereGeometry(840, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(P.top) }, hor: { value: new THREE.Color(P.hor) }, bot: { value: new THREE.Color(P.bot) }, sunDir: { value: (this.night ? MOON_OFF.clone().normalize() : SUN_DIR) }, sunCol: { value: new THREE.Color(this.night ? 0xdfe8ff : 0xfff2c8) }, glow: { value: this.night ? 0.6 : 1.0 } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; }',
      fragmentShader: `uniform vec3 top; uniform vec3 hor; uniform vec3 bot; uniform vec3 sunDir; uniform vec3 sunCol; uniform float glow; varying vec3 vDir;
        void main(){ float y = vDir.y; vec3 c = y > 0.0 ? mix(hor, top, pow(min(1.0, y * 1.6), 0.7)) : mix(hor, bot, min(1.0, -y * 6.0));
        float s = max(0.0, dot(vDir, sunDir)); c += sunCol * (pow(s, 600.0) * 1.6 + pow(s, 12.0) * 0.18) * glow; gl_FragColor = vec4(c, 1.0); }`,
    });
    this.disposables.push(mat);
    const sky = new THREE.Mesh(geo, mat); sky.frustumCulled = false; sky.renderOrder = -10;
    this.sky = sky; this.group.add(sky);
    if (this.night) {
      const rnd = mulberry32(9), n = 900, pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const u = rnd(), v = rnd() * 0.85 + 0.12, th = u * Math.PI * 2, ph = Math.acos(v);
        pos[i * 3] = Math.sin(ph) * Math.cos(th) * 800; pos[i * 3 + 1] = Math.cos(ph) * 800; pos[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * 800;
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const sm = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85, depthWrite: false });
      this.disposables.push(sm);
      const stars = new THREE.Points(g, sm); stars.frustumCulled = false; stars.renderOrder = -9;
      this.sky.add(stars);
    }
  }
  buildClouds() {
    if (!geos.smoke) return;
    const rnd = mulberry32(31), parts = [];
    for (let i = 0; i < 18; i++) {
      const a = rnd() * Math.PI * 2, d = 160 + rnd() * 420, h = 150 + rnd() * 70;
      const cx = this.bounds.cx + Math.cos(a) * d, cz = this.bounds.cz + Math.sin(a) * d;
      const puffs = 4 + Math.floor(rnd() * 3);
      for (let k = 0; k < puffs; k++) {
        const g = geos.smoke.clone(); const s = 14 + rnd() * 16;
        g.scale(s * 1.5, s * 0.8, s); g.rotateY(rnd() * 6.28);
        g.translate(cx + (k - puffs / 2) * 14 + rnd() * 6, h + rnd() * 6, cz + (rnd() - 0.5) * 16);
        if (g.attributes.uv) g.deleteAttribute('uv');
        parts.push(g);
      }
    }
    const geo = mergeGeometries(parts, false); parts.forEach(g => g.dispose());
    const mat = new THREE.MeshLambertMaterial({ color: this.night ? 0x3a4766 : 0xffffff, emissive: this.night ? 0x0b1222 : 0x6b7d8f, fog: false });
    this.disposables.push(mat); allMats.push(mat);
    this.clouds = new THREE.Mesh(geo, mat);
    this.clouds.position.set(0, 0, 0);
    this.group.add(this.clouds);
  }
  buildNightLights() {
    // fener tepelerinde parıltı, yolda ışık havuzu (gerçek ışık yerine ucuz eklemeli yüzeyler)
    const n = this.lamps.length; if (!n) return;
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const g = cv.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(0.35, 'rgba(255,210,140,0.45)'); gr.addColorStop(1, 'rgba(255,200,120,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(cv);
    const glowMat = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const poolMat = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 });
    this.disposables.push(t, glowMat, poolMat);
    const glow = new THREE.InstancedMesh(new THREE.PlaneGeometry(7, 7), glowMat, n);
    const pool = new THREE.InstancedMesh(new THREE.PlaneGeometry(20, 20).rotateX(-Math.PI / 2), poolMat, n);
    const m = new THREE.Matrix4();
    this.lamps.forEach((l, i) => {
      m.makeTranslation(l.x, l.y, l.z); glow.setMatrixAt(i, m);
      m.makeTranslation(l.rx, l.ry + 0.2, l.rz); pool.setMatrixAt(i, m);
    });
    glow.frustumCulled = pool.frustumCulled = false;
    pool.renderOrder = 2; glow.renderOrder = 3;
    this.glow = glow; // kameraya dönük olsun diye her karede döndürülür (tek matris: grup dönüşü)
    this.group.add(glow, pool);
  }
  pickupSpots() {
    const cl = this.cl, N = cl.N;
    // altınlar: üçlü sıralar
    const rnd = mulberry32(99); this.coins = [];
    for (let i = 40; i < N - 30; i += 70) {
      const W = Math.max(0, cl.wall[i] - 2.5);
      const lane = (rnd() * 2 - 1) * Math.min(3.2, W);
      for (let k = 0; k < 3; k++) { const j = (i + k * 6) % N; this.coins.push([cl.px[j] - cl.tz[j] * lane, cl.pz[j] + cl.tx[j] * lane, cl.py[j]]); }
    }
    // eşya kutuları: yolun enine dizili 4'lü sıralar, düz ve yerdeki yerlerde
    this.boxes = [];
    for (const f of [0.2, 0.52, 0.8]) {
      let i = Math.floor(N * f);
      for (let t = 0; t < 80 && (cl.curv[i] > 0.004 || cl.elev[i]); t++) i = (i + 3) % N;
      const W = Math.min(4.6, cl.wall[i] - 1.5);
      for (const lane of [-1, -0.33, 0.33, 1]) this.boxes.push([cl.px[i] - cl.tz[i] * lane * W, cl.pz[i] + cl.tx[i] * lane * W, cl.py[i]]);
    }
  }
  applyLighting() {
    const P = this.night ? NIGHT : DAY;
    scene.background = new THREE.Color(P.fog);
    scene.fog = new THREE.Fog(P.fog, P.fogN, P.fogF);
    hemi.color.setHex(P.hemiS); hemi.groundColor.setHex(P.hemiG); hemi.intensity = P.hemiI;
    sun.color.setHex(P.sunC); sun.intensity = P.sunI;
    this.lightOff = this.night ? MOON_OFF : SUN_OFF;
  }
}
