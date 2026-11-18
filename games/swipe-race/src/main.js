// Swipe Race: tek kişilik 3D yarış (5 bot rakip). Derleme: games/swipe-race/README.md
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TILE, buildLayout, buildCenterline, speedProfile, HEADING_ROT, rotH, nearestGlobal } from './track.js';
import { CarSim, CAR_DEFS, aiDrive, collideCars, mulberry32, ROAD_HALF, WALL } from './physics.js';

const $ = id => document.getElementById(id);
const LAPS = 3;
const STEP = 1 / 120;
const CAR_SCALE = 0.33 * TILE;
const CAR_Y = 0.12;
const NCARS = 6;
const isTouch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
const DIFFS = [{ name: 'Kolay', skill: 0.86 }, { name: 'Normal', skill: 0.95 }, { name: 'Zor', skill: 1.03 }];
const VARIANT_NAMES = ['Klasik', 'Turuncu', 'Beyaz'];

// ---------- settings ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('swiperace_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('swiperace_' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
};
const settings = {
  quality: store.get('quality', isTouch ? 'mid' : 'high'),
  autoGas: store.get('autoGas', isTouch),
  mute: store.get('mute', false),
  car: store.get('car', 0) % CAR_DEFS.length,
  variant: store.get('variant', 0) % 3,
  diff: store.get('diff', 1) % 3,
  fps: store.get('fps', false),
};
let bestLap = store.get('best', 0);
const QUALITY = {
  high: { dpr: 2, map: 2048, shadows: true, minDpr: 1, label: 'Yüksek' },
  mid: { dpr: 1.5, map: 1024, shadows: true, minDpr: 0.75, label: 'Orta' },
  low: { dpr: 1, map: 512, shadows: false, minDpr: 0.6, label: 'Düşük' },
};

// ---------- renderer / scene ----------
const canvas = $('c');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas, antialias: (window.devicePixelRatio || 1) < 1.9 && settings.quality !== 'low',
    powerPreference: 'high-performance', stencil: false, alpha: false,
  });
} catch (e) {
  $('loadText').textContent = 'WebGL başlatılamadı. Tarayıcın 3D grafik desteklemiyor olabilir.';
  throw e;
}
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = true;
canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); $('loadText').textContent = 'Grafik bağlamı kayboldu, yeniden yükleniyor…'; $('loader').classList.remove('hide'); }, false);
canvas.addEventListener('webglcontextrestored', () => location.reload(), false);

const scene = new THREE.Scene();
const SKY = new THREE.Color(0xa8dcff);
scene.background = SKY;
scene.fog = new THREE.Fog(SKY, 170, 470);
const camera = new THREE.PerspectiveCamera(60, 1, 0.5, 520);
const hemi = new THREE.HemisphereLight(0xffffff, 0x9cbf8a, 1.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff6e8, 2.1);
sun.shadow.camera.left = -48; sun.shadow.camera.right = 48;
sun.shadow.camera.top = 48; sun.shadow.camera.bottom = -48;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 300;
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.06;
scene.add(sun, sun.target);
const SUN_OFF = new THREE.Vector3(70, 120, 45);

let dpr = 1, maxDpr = 1, minDpr = 0.6;
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = baseFov();
  camera.updateProjectionMatrix();
}
function baseFov() { return camera.aspect < 1 ? 72 : 60; }
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));

const staticMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const allMats = [staticMat];
function applyQuality(first) {
  const q = QUALITY[settings.quality];
  maxDpr = Math.min(window.devicePixelRatio || 1, q.dpr);
  minDpr = Math.min(maxDpr, q.minDpr);
  dpr = maxDpr;
  renderer.setPixelRatio(dpr);
  resize();
  renderer.shadowMap.enabled = q.shadows;
  sun.castShadow = q.shadows;
  if (sun.shadow.mapSize.x !== q.map) {
    sun.shadow.mapSize.set(q.map, q.map);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  }
  for (const v of views) v.blob.visible = !q.shadows;
  if (!first) { for (const m of allMats) m.needsUpdate = true; warmup(); }
}

// ---------- asset loading ----------
async function fetchPack(onProg) {
  const res = await fetch('assets.json');
  if (!res.ok) throw new Error('assets ' + res.status);
  const total = +res.headers.get('content-length') || 0;
  let text;
  if (!res.body || !total || res.headers.get('content-encoding')) {
    let fake = 0; const tm = setInterval(() => { fake = Math.min(0.9, fake + 0.04); onProg(fake); }, 100);
    try { text = await res.text(); } finally { clearInterval(tm); }
  } else {
    const reader = res.body.getReader(); const chunks = []; let got = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); got += value.length; onProg(Math.min(1, got / total)); }
    const buf = new Uint8Array(got); let o = 0; for (const c of chunks) { buf.set(c, o); o += c.length; }
    text = new TextDecoder().decode(buf);
  }
  onProg(1);
  const b64 = JSON.parse(text)[0];
  const bin = atob(b64), n = bin.length, out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}
function unpack(ab) {
  const dv = new DataView(ab);
  const hl = dv.getUint32(0, true);
  const hdr = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 4, hl)));
  const base = 4 + hl, out = {};
  for (const [n, o, l] of hdr) out[n] = ab.slice(base + o, base + o + l);
  return out;
}
async function loadTexture(buf) {
  const blob = new Blob([buf], { type: 'image/png' });
  let img;
  if (window.createImageBitmap) {
    try { img = await createImageBitmap(blob, { imageOrientation: 'none', premultiplyAlpha: 'none' }); } catch (e) { img = null; }
  }
  if (!img) {
    img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(blob); });
  }
  const t = new THREE.Texture(img);
  t.colorSpace = THREE.SRGBColorSpace; t.flipY = false;
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));

// ---------- static geometry helpers ----------
const models = {}; // name -> { parts:[{geo}], center:{x,z}, size }
function extractModel(name, gltf, keepUv) {
  const root = gltf.scene; root.updateMatrixWorld(true);
  const parts = []; const box = new THREE.Box3();
  root.traverse(o => {
    if (!o.isMesh) return;
    const g = o.geometry;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', g.attributes.position.clone());
    if (g.attributes.normal) geo.setAttribute('normal', g.attributes.normal.clone());
    if (keepUv && g.attributes.uv) geo.setAttribute('uv', g.attributes.uv.clone());
    if (g.index) geo.setIndex(g.index.clone());
    else { const n = g.attributes.position.count, idx = new Uint32Array(n); for (let i = 0; i < n; i++) idx[i] = i; geo.setIndex(new THREE.BufferAttribute(idx, 1)); }
    geo.applyMatrix4(o.matrixWorld);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (!keepUv) {
      const c = o.material.color || new THREE.Color(1, 1, 1);
      const n = geo.attributes.position.count, col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    geo.computeBoundingBox(); box.union(geo.boundingBox);
    parts.push({ geo, mat: o.material.name });
  });
  const center = box.getCenter(new THREE.Vector3());
  models[name] = { parts, center, box };
  return models[name];
}
function matName(name) { // colour of a named material within a model
  for (const p of models.roadStraight.parts) if (p.mat === name) return p.geo.attributes.color.array;
  return null;
}

const CH = 4 * TILE;
const buckets = new Map();
function addPlaced(name, matrix, cat, wx, wz) {
  const m = models[name]; if (!m) return;
  const key = Math.floor(wx / CH) + ',' + Math.floor(wz / CH) + '|' + cat;
  let b = buckets.get(key); if (!b) { b = []; buckets.set(key, b); }
  for (const p of m.parts) { const g = p.geo.clone(); g.applyMatrix4(matrix); b.push(g); }
}
const _ma = new THREE.Matrix4(), _mb = new THREE.Matrix4();
function pieceMatrix(ax, az, h, lift = 0) {
  const m = new THREE.Matrix4().makeTranslation(ax * TILE, lift, az * TILE);
  m.multiply(_ma.makeRotationY(HEADING_ROT[h])).multiply(_mb.makeScale(TILE, TILE, TILE));
  return m.multiply(_ma.makeTranslation(-0.15, 0, 1.15));
}
function decorMatrix(name, wx, wz, yaw, scale = TILE, y = 0) {
  const c = models[name].center;
  const m = new THREE.Matrix4().makeTranslation(wx, y, wz);
  m.multiply(_ma.makeRotationY(yaw)).multiply(_mb.makeScale(scale, scale, scale));
  return m.multiply(_ma.makeTranslation(-c.x, 0, -c.z));
}
function placeDecor(name, wx, wz, yaw, scale, cat = 'solid') { addPlaced(name, decorMatrix(name, wx, wz, yaw, scale), cat, wx, wz); }
function flushBuckets() {
  for (const [key, list] of buckets) {
    const merged = mergeGeometries(list, false);
    for (const g of list) g.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, staticMat);
    const flat = key.endsWith('|flat');
    mesh.castShadow = !flat; mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    scene.add(mesh);
  }
  buckets.clear();
}

// ---------- world ----------
let layout, cl, prof, sFinish, iFinish;
const coins = { n: 0, x: null, z: null, t: null, mesh: null };
const minimap = { bg: null, sx: 1, ox: 0, oz: 0 };
let carTemplates = {}, carMats = [], smoke;

function clearance(x, z) { // distance to centerline
  const i = nearestGlobal(cl, x, z);
  return Math.hypot(cl.px[i] - x, cl.pz[i] - z);
}

function buildTrack() {
  const lift = 0.004 * TILE;
  const startCells = new Set(['0,0', '0,-1', '0,1', '0,2', '0,3', '0,4']);
  for (const p of layout.pieces) {
    const [ax, az] = p.anchor;
    const wx = ax * TILE, wz = az * TILE;
    if (p.kind === 'S') {
      if (startCells.has(ax + ',' + az)) continue;
      addPlaced('roadStraight', pieceMatrix(ax, az, p.h), 'flat', wx, wz);
    } else {
      const base = p.n === 2 ? 'roadCornerLarge' : 'roadCornerLarger';
      const m = pieceMatrix(ax, az, p.h);
      const off = rotH(p.h, (p.n - 1) / 2, -(p.n - 1) / 2);
      const cx = (ax + off[0]) * TILE, cz = (az + off[1]) * TILE;
      addPlaced(base, m, 'flat', cx, cz);
      addPlaced(base + 'Border', pieceMatrix(ax, az, p.h, lift), 'flat', cx, cz);
      addPlaced(base + 'BorderInner', pieceMatrix(ax, az, p.h, lift), 'flat', cx, cz);
    }
  }
  addPlaced('roadStart', pieceMatrix(0, 0, 'N'), 'solid', 0, 0);
  addPlaced('roadStartPositions', pieceMatrix(0, 2, 'N'), 'flat', 0, 2 * TILE);
  addPlaced('roadStartPositions', pieceMatrix(0, 4, 'N'), 'flat', 0, 4 * TILE);
}

function decorate() {
  const rnd = mulberry32(1337);
  const reserved = [];
  const faceYaw = (dx, dz) => Math.atan2(dx, dz); // local +z faces (dx,dz)
  const alongYaw = (dx, dz) => Math.atan2(-dz, dx); // local +x along (dx,dz)
  const ok = (x, z, clr, rr = 9) => {
    if (clearance(x, z) < clr) return false;
    for (const r of reserved) if ((r[0] - x) ** 2 + (r[1] - z) ** 2 < (r[2] + rr) ** 2) return false;
    return true;
  };
  const N = cl.N;
  // rails along straights, tyre barriers along corners
  const railLat = WALL + 1.35;
  for (let i = 0; i < N; i += 1) {
    const c = cl.curv[i];
    const x = cl.px[i], z = cl.pz[i], tx = cl.tx[i], tz = cl.tz[i];
    const nx = -tz, nz = tx;
    if (c < 0.002) {
      if (i % 14 === 7) for (const sg of [-1, 1]) {
        const px = x + nx * railLat * sg, pz = z + nz * railLat * sg;
        if (clearance(px, pz) > WALL + 0.2) placeDecor('rail', px, pz, alongYaw(tx, tz) + (sg > 0 ? Math.PI : 0), TILE);
      }
    } else if (i % 4 === 0) {
      for (const sg of [-1, 1]) {
        const px = x + nx * railLat * sg, pz = z + nz * railLat * sg;
        if (clearance(px, pz) > WALL + 0.2) placeDecor((i / 4) % 2 ? 'barrierRed' : 'barrierWhite', px, pz, alongYaw(tx, tz), TILE);
      }
    }
  }
  // start straight: grandstands (outside, -x) and pits (inside, +x)
  const standX = -1.45 * TILE, pitX = 1.45 * TILE;
  for (let z = -3; z <= 3; z++) {
    placeDecor('grandStandCovered', standX, z * TILE, faceYaw(1, 0) + FRONT.grandStandCovered, TILE);
    reserved.push([standX, z * TILE, 8]);
    placeDecor(z === 3 ? 'pitsOffice' : z === -3 ? 'pitsOfficeRoof' : (z % 2 ? 'pitsGarage' : 'pitsGarageClosed'), pitX, z * TILE, faceYaw(-1, 0) + FRONT.pits, TILE);
    reserved.push([pitX, z * TILE, 8]);
  }
  for (let z = -3; z <= 3; z += 2) {
    placeDecor(z % 4 ? 'tent' : 'tentLong', pitX + TILE * 1.1, z * TILE, faceYaw(-1, 0), TILE);
    reserved.push([pitX + TILE * 1.1, z * TILE, 12]);
  }
  placeDecor('radarEquipment', pitX + TILE * 2.2, 0, 0.6, TILE); reserved.push([pitX + TILE * 2.2, 0, 6]);
  // finish flags
  const fz = -0.5 * TILE;
  placeDecor('flagCheckers', -(WALL + 2.2), fz - 3, faceYaw(1, 0), TILE);
  placeDecor('flagCheckers', WALL + 2.2, fz - 3, faceYaw(-1, 0), TILE);
  placeDecor('lightRedDouble', WALL + 2.0, fz + 6, faceYaw(-1, 0), TILE);
  // corner decorations
  const cornerSet = ['grandStand', 'billboard', 'bannerTowerRed', 'billboardLow', 'bannerTowerGreen', 'grandStand'];
  let ci = 0;
  for (let i = 0; i < N; i++) {
    const a = cl.curv[(i - 1 + N) % N], b = cl.curv[i], c = cl.curv[(i + 1) % N];
    if (!(b > 0.012 && b >= a && b > c)) continue;
    // find outward side: sign of turn
    const j = (i + 3) % N, k = (i - 3 + N) % N;
    const cross = cl.tx[k] * cl.tz[j] - cl.tz[k] * cl.tx[j];
    const out = cross > 0 ? -1 : 1; // + => right side outward
    const nx = -cl.tz[i] * out, nz = cl.tx[i] * out;
    const name = cornerSet[ci++ % cornerSet.length];
    const d = WALL + (name.startsWith('grand') ? 9 : 6);
    const x = cl.px[i] + nx * d, z = cl.pz[i] + nz * d;
    if (ok(x, z, WALL + 3, 6)) {
      placeDecor(name, x, z, faceYaw(-nx, -nz) + (FRONT[name] || 0), TILE);
      reserved.push([x, z, 8]);
    }
  }
  // overhead gantries on long straights
  for (const s of [0.42, 0.7]) {
    const i = Math.floor(N * s);
    const x = cl.px[i], z = cl.pz[i];
    if (cl.curv[i] < 0.002) placeDecor('overheadLights', x, z, alongYaw(-cl.tz[i], cl.tx[i]), TILE * 1.1);
  }
  // light posts on straights
  for (let i = 0; i < N; i += 42) {
    if (cl.curv[i] > 0.002) continue;
    const sg = (i / 42) % 2 ? 1 : -1;
    const nx = -cl.tz[i] * sg, nz = cl.tx[i] * sg;
    const x = cl.px[i] + nx * (WALL + 3), z = cl.pz[i] + nz * (WALL + 3);
    if (ok(x, z, WALL + 2, 2)) placeDecor('lightPostLarge', x, z, faceYaw(-nx, -nz) + FRONT.lightPostLarge, TILE);
  }
  // trees
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < N; i++) { minX = Math.min(minX, cl.px[i]); maxX = Math.max(maxX, cl.px[i]); minZ = Math.min(minZ, cl.pz[i]); maxZ = Math.max(maxZ, cl.pz[i]); }
  const pad = 110, step = 9;
  for (let x = minX - pad; x <= maxX + pad; x += step) {
    for (let z = minZ - pad; z <= maxZ + pad; z += step) {
      const jx = x + (rnd() - 0.5) * step * 0.9, jz = z + (rnd() - 0.5) * step * 0.9;
      const r = rnd();
      const cd = clearance(jx, jz);
      if (cd < WALL + 8) continue;
      const p = cd < 40 ? 0.16 : cd < 80 ? 0.32 : 0.5;
      if (r > p) continue;
      if (!ok(jx, jz, WALL + 8, 3)) continue;
      const big = rnd() < 0.55;
      placeDecor(big ? 'treeLarge' : 'treeSmall', jx, jz, rnd() * Math.PI * 2, TILE * (0.8 + rnd() * 0.5));
    }
  }
}
const FRONT = { grandStandCovered: 0, grandStand: 0, pits: 0, lightPostLarge: 0, billboard: 0, billboardLow: 0 };

function buildGround() {
  const grass = matName('grass');
  const col = grass ? new THREE.Color(grass[0], grass[1], grass[2]) : new THREE.Color(0x5fa060);
  const g = new THREE.PlaneGeometry(1400, 1400); g.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshLambertMaterial({ color: col });
  allMats.push(mat);
  const m = new THREE.Mesh(g, mat);
  m.position.set(cl.px.reduce((a, b) => a + b, 0) / cl.N, -0.2, cl.pz.reduce((a, b) => a + b, 0) / cl.N);
  m.receiveShadow = true; m.matrixAutoUpdate = false; m.updateMatrix();
  scene.add(m);
}

function buildCoins(gltf, tex) {
  const parts = [];
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(o => { if (o.isMesh) { const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); parts.push(g); } });
  const geo = parts.length > 1 ? mergeGeometries(parts, false) : parts[0];
  geo.computeBoundingBox(); const c = geo.boundingBox.getCenter(new THREE.Vector3());
  geo.translate(-c.x, -c.y, -c.z); geo.scale(7, 7, 7);
  const mat = new THREE.MeshLambertMaterial({ map: tex, emissive: 0x332200 }); allMats.push(mat);
  const list = [];
  const rnd = mulberry32(99);
  for (let i = 0; i < cl.N; i += 1) {
    if (i < 40 || i > cl.N - 30) continue;
    if (i % 70 !== 0) continue;
    const lane = (rnd() * 2 - 1) * 3.2;
    for (let k = 0; k < 3; k++) {
      const j = (i + k * 6) % cl.N;
      list.push([cl.px[j] - cl.tz[j] * lane, cl.pz[j] + cl.tx[j] * lane]);
    }
  }
  coins.n = list.length;
  coins.x = new Float32Array(list.map(p => p[0])); coins.z = new Float32Array(list.map(p => p[1]));
  coins.t = new Float32Array(coins.n);
  coins.mesh = new THREE.InstancedMesh(geo, mat, coins.n);
  coins.mesh.castShadow = true; coins.mesh.frustumCulled = false;
  coins.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(coins.mesh);
}
const _cm = new THREE.Matrix4(), _cq = new THREE.Quaternion(), _cp = new THREE.Vector3(), _cs = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
function updateCoins(time, dt) {
  const arr = coins.mesh.instanceMatrix.array;
  _cq.setFromAxisAngle(_up, time * 3);
  for (let i = 0; i < coins.n; i++) {
    let sc = 1;
    if (coins.t[i] > 0) { coins.t[i] -= dt; sc = coins.t[i] > 0 ? 0 : 1; }
    _cp.set(coins.x[i], 1.6 + Math.sin(time * 2.4 + i) * 0.25, coins.z[i]);
    _cs.setScalar(sc);
    _cm.compose(_cp, _cq, _cs).toArray(arr, i * 16);
  }
  coins.mesh.instanceMatrix.needsUpdate = true;
}

class Smoke {
  constructor(geo, mat, n) {
    this.n = n; this.i = 0;
    this.x = new Float32Array(n); this.y = new Float32Array(n); this.z = new Float32Array(n);
    this.vx = new Float32Array(n); this.vz = new Float32Array(n);
    this.life = new Float32Array(n); this.max = new Float32Array(n); this.size = new Float32Array(n);
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.frustumCulled = false; this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceMatrix.array.fill(0);
    this.alive = 0;
    scene.add(this.mesh);
  }
  spawn(x, y, z, vx, vz, size, life) {
    const i = this.i; this.i = (i + 1) % this.n;
    this.x[i] = x; this.y[i] = y; this.z[i] = z; this.vx[i] = vx; this.vz[i] = vz;
    this.life[i] = life; this.max[i] = life; this.size[i] = size;
  }
  update(dt) {
    const a = this.mesh.instanceMatrix.array; let alive = 0;
    for (let i = 0; i < this.n; i++) {
      const o = i * 16;
      if (this.life[i] <= 0) { if (a[o] !== 0 || a[o + 15] !== 0) { for (let k = 0; k < 16; k++) a[o + k] = 0; alive++; } continue; }
      alive++;
      this.life[i] -= dt;
      const t = Math.max(0, this.life[i] / this.max[i]);
      this.x[i] += this.vx[i] * dt; this.z[i] += this.vz[i] * dt; this.y[i] += 1.6 * dt;
      this.vx[i] *= 0.96; this.vz[i] *= 0.96;
      const s = this.size[i] * (0.5 + (1 - t) * 1.1) * Math.min(1, t * 3);
      a[o] = s; a[o + 1] = 0; a[o + 2] = 0; a[o + 3] = 0;
      a[o + 4] = 0; a[o + 5] = s; a[o + 6] = 0; a[o + 7] = 0;
      a[o + 8] = 0; a[o + 9] = 0; a[o + 10] = s; a[o + 11] = 0;
      a[o + 12] = this.x[i]; a[o + 13] = this.y[i]; a[o + 14] = this.z[i]; a[o + 15] = 1;
    }
    if (alive) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------- cars ----------
function prepCarTemplate(gltf) {
  const root = gltf.scene; root.updateMatrixWorld(true);
  root.traverse(o => {
    if (!/^wheel-[fb][lr]$/.test(o.name)) return;
    const box = new THREE.Box3(); const inv = new THREE.Matrix4().copy(o.matrixWorld).invert();
    o.traverse(m => { if (m.isMesh) { m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld)); box.union(b); } });
    const c = box.getCenter(new THREE.Vector3());
    if (c.length() > 1e-3) {
      o.traverse(m => { if (m.isMesh) m.geometry.translate(-c.x, -c.y, -c.z); });
      o.position.add(c.clone().multiply(o.scale).applyQuaternion(o.quaternion));
    }
    o.userData.radius = (box.max.y - box.min.y) / 2;
  });
  return root;
}
let blobTex = null;
function makeBlobTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 4, 32, 32, 31);
  gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); return t;
}
const blobGeo = new THREE.PlaneGeometry(3.2, 5.0).rotateX(-Math.PI / 2);
let blobMat;
class CarView {
  constructor(def, variant) {
    this.root = new THREE.Group(); this.tilt = new THREE.Group(); this.root.add(this.tilt);
    const m = carTemplates[def.id].clone(true);
    m.scale.setScalar(CAR_SCALE);
    m.traverse(o => { if (o.isMesh) { o.material = carMats[variant]; o.castShadow = true; o.receiveShadow = true; } });
    this.tilt.add(m);
    this.wheels = [];
    m.traverse(o => { if (/^wheel-[fb][lr]$/.test(o.name)) { o.rotation.order = 'YXZ'; this.wheels.push({ o, front: o.name[6] === 'f', r: (o.userData.radius || 0.125) * CAR_SCALE }); } });
    this.blob = new THREE.Mesh(blobGeo, blobMat); this.blob.position.y = 0.05; this.blob.renderOrder = 1;
    this.blob.visible = !QUALITY[settings.quality].shadows;
    this.root.add(this.blob);
    this.roll = 0; this.pitch = 0; this.spin = 0; this.smokeT = 0;
    scene.add(this.root);
  }
  dispose() { scene.remove(this.root); }
}

// ---------- audio ----------
class Sfx {
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    try { this.ctx = new AC(); } catch (e) { return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = settings.mute ? 0 : 0.55; this.master.connect(c.destination);
    this.eGain = c.createGain(); this.eGain.gain.value = 0;
    this.filt = c.createBiquadFilter(); this.filt.type = 'lowpass'; this.filt.frequency.value = 800; this.filt.Q.value = 2;
    this.o1 = c.createOscillator(); this.o1.type = 'sawtooth';
    this.o2 = c.createOscillator(); this.o2.type = 'square';
    const g2 = c.createGain(); g2.gain.value = 0.35;
    this.o1.connect(this.filt); this.o2.connect(g2); g2.connect(this.filt);
    this.filt.connect(this.eGain); this.eGain.connect(this.master);
    this.o1.start(); this.o2.start();
    const len = c.sampleRate, nb = c.createBuffer(1, len, c.sampleRate), d = nb.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = nb;
    this.sk = c.createBufferSource(); this.sk.buffer = nb; this.sk.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 1.2;
    this.skGain = c.createGain(); this.skGain.gain.value = 0;
    this.sk.connect(bp); bp.connect(this.skGain); this.skGain.connect(this.master); this.sk.start();
  }
  engine(ratio, thr, active) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const gears = [0, 0.16, 0.33, 0.52, 0.74, 1.3];
    let g = 0; while (g < 4 && ratio > gears[g + 1]) g++;
    const rpm = 0.3 + 0.7 * Math.min(1, (ratio - gears[g]) / (gears[g + 1] - gears[g]));
    const f = 48 + rpm * 115 + g * 9;
    this.o1.frequency.setTargetAtTime(f, t, 0.05);
    this.o2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
    this.filt.frequency.setTargetAtTime(350 + rpm * 1400 + thr * 700, t, 0.06);
    this.eGain.gain.setTargetAtTime(active ? 0.07 + thr * 0.07 : 0, t, 0.08);
  }
  skid(a) { if (this.ctx) this.skGain.gain.setTargetAtTime(Math.min(0.22, a), this.ctx.currentTime, 0.05); }
  beep(freq, dur = 0.15, type = 'sine', vol = 0.25) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  coin() { this.beep(988, 0.08, 'square', 0.12); setTimeout(() => this.beep(1319, 0.14, 'square', 0.12), 70); }
  thud(v) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime, s = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
    s.buffer = this.noise; f.type = 'lowpass'; f.frequency.value = 380;
    g.gain.setValueAtTime(Math.min(0.6, v), t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random() * 0.5, 0.3);
  }
  setMute(m) { if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.02); }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); }
}
const sfx = new Sfx();

// ---------- input ----------
const keys = Object.create(null);
const touch = { steer: new Map(), gas: false, brake: false, nitro: false, drift: false };
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat) togglePause();
  if (e.code === 'KeyR' && !e.repeat) resetPlayer();
  if (e.code === 'KeyF' && !e.repeat) { settings.fps = !settings.fps; store.set('fps', settings.fps); $('fps').classList.toggle('hide', !settings.fps); }
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; touch.steer.clear(); touch.gas = touch.brake = touch.nitro = touch.drift = false; });

function bindHold(el, prop) {
  const on = e => { e.preventDefault(); touch[prop] = true; el.classList.add('on'); try { el.setPointerCapture(e.pointerId); } catch (_) { /* */ } sfx.init(); };
  const off = e => { touch[prop] = false; el.classList.remove('on'); };
  el.addEventListener('pointerdown', on);
  el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('lostpointercapture', off);
}
function bindSteer(el) {
  const upd = e => {
    const r = el.getBoundingClientRect();
    touch.steer.set(e.pointerId, e.clientX < r.left + r.width / 2 ? -1 : 1);
    refreshSteerUI();
  };
  el.addEventListener('pointerdown', e => { e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch (_) { /* */ } upd(e); sfx.init(); });
  el.addEventListener('pointermove', e => { if (touch.steer.has(e.pointerId)) upd(e); });
  const end = e => { touch.steer.delete(e.pointerId); refreshSteerUI(); };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); el.addEventListener('lostpointercapture', end);
}
function touchSteer() { let s = 0; for (const v of touch.steer.values()) s += v; return Math.max(-1, Math.min(1, s)); }
function refreshSteerUI() { const s = touchSteer(); $('sl').classList.toggle('on', s < 0); $('sr').classList.toggle('on', s > 0); }

function readPlayerInput(inp) {
  const k = keys;
  let str = 0;
  if (k.ArrowLeft || k.KeyA) str -= 1;
  if (k.ArrowRight || k.KeyD) str += 1;
  str += touchSteer();
  inp.str = Math.max(-1, Math.min(1, str));
  const brk = !!(k.ArrowDown || k.KeyS || touch.brake);
  const gas = !!(k.ArrowUp || k.KeyW || touch.gas || settings.autoGas);
  inp.brk = brk ? 1 : 0;
  inp.thr = gas && !brk ? 1 : 0;
  inp.hb = (k.Space || touch.drift) ? 1 : 0;
  inp.nitro = (k.ShiftLeft || k.ShiftRight || k.KeyN || touch.nitro) ? 1 : 0;
}

// ---------- game state ----------
const G = {
  state: 'loading', cars: [], player: null, t: 0, acc: 0, countdown: 0, lastCount: 0,
  lapStart: 0, lapNo: 0, lapTimes: [], bestRace: 0, resetCd: 0, finishShown: 0, rnd: mulberry32(Date.now() & 0xffff),
};
const views = [];
let menuView = null;

function clearCars() {
  for (const v of views) v.dispose();
  views.length = 0; G.cars.length = 0;
}
function gridSlot(k) { return { back: 7 + Math.floor(k / 2) * 7, lat: k % 2 ? 2.6 : -2.6 }; }
function startRace() {
  clearCars(); if (menuView) { menuView.dispose(); menuView = null; }
  const pdef = CAR_DEFS[settings.car];
  const others = CAR_DEFS.filter(d => d !== pdef);
  for (let i = others.length - 1; i > 0; i--) { const j = Math.floor(G.rnd() * (i + 1)); [others[i], others[j]] = [others[j], others[i]]; }
  const playerSlot = 4;
  const skill = DIFFS[settings.diff].skill;
  let oi = 0;
  for (let k = 0; k < NCARS; k++) {
    const isP = k === playerSlot;
    const def = isP ? pdef : others[oi++ % others.length];
    const variant = isP ? settings.variant : Math.floor(G.rnd() * 3);
    const car = new CarSim(def);
    const g = gridSlot(k);
    car.placeAt(cl, iFinish, g.lat, g.back);
    let rd = car.s - sFinish; if (rd > cl.L / 2) rd -= cl.L; car.raceDist = rd;
    if (!isP) { car.ai = true; car.skill = skill * (0.97 + G.rnd() * 0.06) * (1 - (NCARS - 1 - k) * 0.004); car.lane = g.lat; car.laneTarget = g.lat; }
    car.view = new CarView(def, variant); views.push(car.view);
    car.isPlayer = isP;
    G.cars.push(car);
    if (isP) G.player = car;
  }
  for (let i = 0; i < coins.n; i++) coins.t[i] = 0;
  G.t = 0; G.acc = 0; G.countdown = 3.5; G.lastCount = 4; G.lapNo = 0; G.lapTimes = []; G.lapStart = 0; G.finishShown = 0;
  G.state = 'countdown';
  camYaw = G.player.yaw; camInit = true;
  showScreen('hud');
  $('touch').classList.toggle('hide', !isTouch);
  $('bGas').classList.toggle('hide', settings.autoGas); $('pedals').classList.toggle('auto', !!settings.autoGas);
  sfx.init();
  warmup();
}
function resetPlayer() {
  const p = G.player;
  if (!p || G.state !== 'race' || G.resetCd > 0 || p.finished) return;
  const rd = p.raceDist; p.placeAt(cl, p.idx, 0, 0); p.raceDist = rd;
  G.resetCd = 2; flash('Piste dönüldü', 900);
}
function togglePause() {
  if (G.state === 'race' || G.state === 'countdown') { G.prevState = G.state; G.state = 'paused'; showScreen('pause'); sfx.engine(0, 0, false); sfx.skid(0); sfx.suspend(); }
  else if (G.state === 'paused') resume();
}
function resume() { G.state = G.prevState || 'race'; showScreen('hud'); sfx.resume(); lastT = performance.now(); }
function toMenu() {
  clearCars(); G.state = 'menu'; showScreen('menu'); refreshMenu(); sfx.engine(0, 0, false); sfx.skid(0);
}

// ---------- simulation ----------
function simStep(dt) {
  const cars = G.cars, p = G.player;
  let lead = -1e9; for (const c of cars) if (c.raceDist > lead) lead = c.raceDist;
  for (const c of cars) {
    if (c.ai || c.finished) aiDrive(c, cl, prof, cars, lead, p.raceDist, dt, G.rnd);
    else readPlayerInput(c.in);
  }
  for (const c of cars) c.step(dt, cl);
  collideCars(cars);
  for (const c of cars) c.track(cl, 0);
  // laps / finish
  const totalD = LAPS * cl.L;
  for (const c of cars) {
    if (!c.finished && c.raceDist >= totalD) {
      c.finished = true; c.finishTime = G.t;
      if (c === p) onPlayerFinish();
    }
  }
  if (!p.finished) {
    const lap = Math.floor(p.raceDist / cl.L);
    if (lap > G.lapNo && lap >= 1) {
      const lt = G.t - G.lapStart; G.lapTimes.push(lt); G.lapStart = G.t; G.lapNo = lap;
      if (!G.bestRace || lt < G.bestRace) G.bestRace = lt;
      if (lap < LAPS) flash(lap === LAPS - 1 ? 'SON TUR!' : 'TUR ' + (lap + 1) + '/' + LAPS, 1300);
      sfx.beep(880, 0.12, 'triangle', 0.2);
    }
  }
}
function onPlayerFinish() {
  const p = G.player;
  const lt = G.t - G.lapStart; G.lapTimes.push(lt); if (!G.bestRace || lt < G.bestRace) G.bestRace = lt;
  if (!bestLap || G.bestRace < bestLap) { bestLap = G.bestRace; store.set('best', bestLap); }
  p.ai = true; p.skill = 0.85; p.lane = p.lat; p.laneTarget = p.lat;
  flash('BİTİŞ!', 1800);
  G.finishShown = 2.2;
  sfx.beep(660, 0.15, 'triangle'); setTimeout(() => sfx.beep(990, 0.3, 'triangle'), 160);
}
function standings() {
  return G.cars.slice().sort((a, b) => {
    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    if (a.finished) return -1; if (b.finished) return 1;
    return b.raceDist - a.raceDist;
  });
}

function collectCoins() {
  for (const c of G.cars) {
    for (let i = 0; i < coins.n; i++) {
      if (coins.t[i] > 0) continue;
      const dx = coins.x[i] - c.x, dz = coins.z[i] - c.z;
      if (dx * dx + dz * dz < 7.3) {
        coins.t[i] = 7;
        c.nitro = Math.min(1, c.nitro + 0.2);
        if (c === G.player) { sfx.coin(); $('nitro').classList.add('pulse'); setTimeout(() => $('nitro').classList.remove('pulse'), 300); }
      }
    }
  }
}

// ---------- visuals ----------
let camYaw = 0, camInit = true, shake = 0, curFov = 60;
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _focus = new THREE.Vector3();
function lerpAngle(a, b, t) { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * t; }

function updateViews(alpha, dt) {
  const camX = camera.position.x, camZ = camera.position.z;
  for (const c of G.cars) {
    const v = c.view; if (!v) continue;
    const x = c.px + (c.x - c.px) * alpha, z = c.pz + (c.z - c.pz) * alpha;
    const yaw = lerpAngle(c.pyaw, c.yaw, alpha);
    v.root.position.set(x, CAR_Y, z); v.root.rotation.y = yaw;
    const k = 1 - Math.exp(-dt * 8);
    const latAcc = c.vf * c.yawRate;
    v.roll += (Math.max(-0.09, Math.min(0.09, latAcc * 0.0035)) - v.roll) * k;
    const thr = c.in.thr - c.in.brk;
    v.pitch += ((c.vf > 1 ? thr * 0.025 : 0) - v.pitch) * k;
    v.tilt.rotation.set(v.pitch, 0, v.roll);
    v.spin -= c.vf * dt;
    for (const w of v.wheels) {
      w.o.rotation.x = v.spin / w.r;
      if (w.front) w.o.rotation.y = -c.steer * 0.9;
    }
    // smoke
    const dx = x - camX, dz = z - camZ;
    if (dx * dx + dz * dz < 6400) {
      v.smokeT -= dt;
      const slip = Math.abs(c.vr), sp = Math.abs(c.vf);
      const emit = (slip > 3.2 && sp > 6) || (c.offroad && sp > 9) || (c.in.hb && sp > 6) || c.nitroOn;
      if (emit && v.smokeT <= 0) {
        v.smokeT = c.nitroOn ? 0.03 : 0.05;
        const sy = Math.sin(yaw), cy = Math.cos(yaw);
        const bx = x + sy * 2.2, bz = z + cy * 2.2;
        const side = (Math.random() < 0.5 ? -1 : 1) * 1.1;
        smoke.spawn(bx + cy * side, 0.4, bz - sy * side, c.vx * 0.3 + (Math.random() - 0.5) * 2, c.vz * 0.3 + (Math.random() - 0.5) * 2, c.nitroOn ? 0.9 : c.offroad ? 1.3 : 1.1, c.nitroOn ? 0.35 : 0.7);
      }
    }
  }
}

function updateCamera(dt) {
  const p = G.player; if (!p) return;
  const v = p.view.root;
  const sp = p.speed();
  const yaw = v.rotation.y;
  if (camInit) { camYaw = yaw; }
  camYaw = lerpAngle(camYaw, yaw, 1 - Math.exp(-dt * 4.5));
  const dist = 9.5 + Math.min(sp, 50) * 0.04;
  const h = 3.4 + Math.min(sp, 50) * 0.014;
  _v1.set(v.position.x + Math.sin(camYaw) * dist, h, v.position.z + Math.cos(camYaw) * dist);
  if (camInit) { camera.position.copy(_v1); camInit = false; }
  else camera.position.lerp(_v1, 1 - Math.exp(-dt * 12));
  if (shake > 0) {
    shake = Math.max(0, shake - dt * 2.5);
    camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake * 0.6;
  }
  _focus.set(v.position.x - Math.sin(yaw) * 5, 1.3, v.position.z - Math.cos(yaw) * 5);
  camera.lookAt(_focus);
  const fov = baseFov() + Math.min(1, sp / 45) * 9 + (p.nitroOn ? 7 : 0);
  curFov += (fov - curFov) * (1 - Math.exp(-dt * 4));
  if (Math.abs(camera.fov - curFov) > 0.05) { camera.fov = curFov; camera.updateProjectionMatrix(); }
}
let orbitA = 0.6;
function updateMenuCamera(dt) {
  orbitA += dt * 0.22;
  const c = menuView.root.position;
  const port = camera.aspect < 1, r = port ? 10.5 : 9;
  camera.position.set(c.x + Math.sin(orbitA) * r, port ? 4.2 : 3.4, c.z + Math.cos(orbitA) * r);
  _focus.set(c.x, port ? -4.2 : 1.0, c.z); camera.lookAt(_focus);
  if (Math.abs(camera.fov - baseFov()) > 0.05) { camera.fov = baseFov(); camera.updateProjectionMatrix(); }
  curFov = baseFov();
}
function updateSun() {
  const f = G.player && G.player.view ? G.player.view.root.position : menuView ? menuView.root.position : _focus;
  const snap = 96 / sun.shadow.mapSize.x;
  const tx = Math.round(f.x / snap) * snap, tz = Math.round(f.z / snap) * snap;
  sun.target.position.set(tx, 0, tz);
  sun.position.set(tx + SUN_OFF.x, SUN_OFF.y, tz + SUN_OFF.z);
  sun.target.updateMatrixWorld();
}

// ---------- HUD ----------
const hud = {};
let hudT = 0, mapT = 0;
function fmt(t) {
  if (!(t > 0)) return '--:--.--';
  const m = Math.floor(t / 60), s = t - m * 60;
  return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2);
}
function setText(el, txt) { if (el._t !== txt) { el._t = txt; el.textContent = txt; } }
let flashTimer = 0;
function flash(txt, ms) {
  const el = $('msg'); el.textContent = txt; el.classList.remove('hide'); el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  clearTimeout(flashTimer); flashTimer = setTimeout(() => el.classList.add('hide'), ms);
}
function updateHUD(dt) {
  hudT -= dt; mapT -= dt;
  const p = G.player;
  if (hudT <= 0) {
    hudT = 0.1;
    const st = standings();
    setText(hud.pos, (st.indexOf(p) + 1) + '');
    setText(hud.lap, Math.min(LAPS, Math.max(1, Math.floor(p.raceDist / cl.L) + 1)) + '/' + LAPS);
    setText(hud.time, fmt(G.state === 'countdown' ? 0 : p.finished ? p.finishTime : G.t));
    setText(hud.lapT, fmt(p.finished ? 0 : G.t - G.lapStart));
    setText(hud.best, fmt(G.bestRace || bestLap));
    setText(hud.spd, Math.round(p.speed() * 3.6) + '');
    hud.nitroFill.style.transform = 'scaleX(' + p.nitro.toFixed(3) + ')';
    $('nitro').classList.toggle('active', p.nitroOn);
    $('wrong').classList.toggle('hide', !(p.wrongWayT > 1.2 && !p.finished));
    if (settings.fps) setText(hud.fps, Math.round(fpsAvg) + ' fps · ' + dpr.toFixed(2) + 'x · ' + renderer.info.render.calls + ' dc');
  }
  if (mapT <= 0) { mapT = 1 / 30; drawMinimap(); }
}
function buildMinimap() {
  const cv = $('map'); const size = 132; const r = Math.min(2, window.devicePixelRatio || 1);
  cv.width = cv.height = size * r;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < cl.N; i++) { minX = Math.min(minX, cl.px[i]); maxX = Math.max(maxX, cl.px[i]); minZ = Math.min(minZ, cl.pz[i]); maxZ = Math.max(maxZ, cl.pz[i]); }
  const pad = 12 * r, sc = (size * r - pad * 2) / Math.max(maxX - minX, maxZ - minZ);
  minimap.sx = sc; minimap.ox = pad + ((size * r - pad * 2) - (maxX - minX) * sc) / 2 - minX * sc; minimap.oz = pad + ((size * r - pad * 2) - (maxZ - minZ) * sc) / 2 - minZ * sc;
  const bg = document.createElement('canvas'); bg.width = bg.height = size * r;
  const g = bg.getContext('2d');
  g.lineJoin = 'round'; g.lineCap = 'round';
  const path = () => { g.beginPath(); for (let i = 0; i <= cl.N; i += 2) { const j = i % cl.N; const X = cl.px[j] * sc + minimap.ox, Y = cl.pz[j] * sc + minimap.oz; if (i) g.lineTo(X, Y); else g.moveTo(X, Y); } g.closePath(); };
  path(); g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 9 * r; g.stroke();
  path(); g.strokeStyle = '#3c4048'; g.lineWidth = 5 * r; g.stroke();
  const fx = cl.px[iFinish] * sc + minimap.ox, fy = cl.pz[iFinish] * sc + minimap.oz;
  g.fillStyle = '#fff'; g.fillRect(fx - 6 * r, fy - 1.5 * r, 12 * r, 3 * r);
  minimap.bg = bg; minimap.ctx = cv.getContext('2d'); minimap.r = r;
}
const DOT_COLORS = ['#f6c33f', '#5cc2ff', '#ff7a59', '#9fe36b', '#c48bff', '#ff9ad5'];
function drawMinimap() {
  const g = minimap.ctx; if (!g) return;
  g.clearRect(0, 0, g.canvas.width, g.canvas.height);
  g.drawImage(minimap.bg, 0, 0);
  const r = minimap.r;
  for (let k = 0; k < G.cars.length; k++) {
    const c = G.cars[k]; if (c === G.player) continue;
    g.fillStyle = DOT_COLORS[(k + 1) % DOT_COLORS.length];
    g.beginPath(); g.arc(c.x * minimap.sx + minimap.ox, c.z * minimap.sx + minimap.oz, 3.5 * r, 0, 6.283); g.fill();
  }
  const p = G.player;
  if (p) {
    g.fillStyle = '#fff'; g.strokeStyle = '#e8473d'; g.lineWidth = 2.5 * r;
    g.beginPath(); g.arc(p.x * minimap.sx + minimap.ox, p.z * minimap.sx + minimap.oz, 5 * r, 0, 6.283); g.fill(); g.stroke();
  }
}

function showResults() {
  G.state = 'results';
  const st = standings();
  const tb = $('resRows'); tb.innerHTML = '';
  const avg = cl.L / 30;
  st.forEach((c, i) => {
    const tr = document.createElement('tr');
    if (c === G.player) tr.className = 'me';
    let time;
    if (c.finished) time = fmt(c.finishTime);
    else time = '~' + fmt(G.t + (LAPS * cl.L - c.raceDist) / Math.max(15, avg));
    tr.innerHTML = '<td>' + (i + 1) + '</td><td>' + (c === G.player ? 'SEN · ' : '') + c.def.name + '</td><td>' + time + '</td>';
    tb.appendChild(tr);
  });
  const pos = st.indexOf(G.player) + 1;
  $('resTitle').textContent = pos === 1 ? '🏆 Birincisin!' : pos <= 3 ? pos + '. oldun, podyum!' : pos + '. bitirdin';
  $('resLaps').textContent = 'Turların: ' + G.lapTimes.map(fmt).join(' · ') + '  |  En iyi: ' + fmt(G.bestRace);
  showScreen('results');
}

// ---------- screens / menu ----------
function showScreen(name) {
  for (const id of ['menu', 'hud', 'pause', 'results']) $(id).classList.toggle('hide', id !== name);
  $('touch').classList.toggle('hide', !(name === 'hud' && isTouch));
}
function statBar(v) { return '<i style="transform:scaleX(' + Math.max(0.08, Math.min(1, v)).toFixed(2) + ')"></i>'; }
function refreshMenu() {
  const d = CAR_DEFS[settings.car];
  $('carName').textContent = d.name;
  $('carVar').textContent = VARIANT_NAMES[settings.variant];
  $('stTop').innerHTML = statBar((d.top - 34) / 18);
  $('stAcc').innerHTML = statBar((d.acc - 11) / 8.5);
  $('stGrip').innerHTML = statBar((d.grip * d.handling - 0.6) / 0.66);
  $('stOff').innerHTML = statBar(d.offroad);
  document.querySelectorAll('#diff button').forEach((b, i) => b.classList.toggle('sel', i === settings.diff));
  document.querySelectorAll('#qual button').forEach(b => b.classList.toggle('sel', b.dataset.q === settings.quality));
  document.querySelectorAll('.swatch').forEach((b, i) => b.classList.toggle('sel', i === settings.variant));
  $('optGas').checked = !!settings.autoGas; $('optSnd').checked = !settings.mute;
  $('pGas').checked = !!settings.autoGas; $('pSnd').checked = !settings.mute;
  $('menuBest').textContent = bestLap ? 'Rekor tur: ' + fmt(bestLap) : '';
  // preview car on grid
  if (menuView) menuView.dispose();
  menuView = new CarView(d, settings.variant);
  const tmp = new CarSim(d); tmp.placeAt(cl, iFinish, 0, 22);
  menuView.root.position.set(tmp.x, CAR_Y, tmp.z); menuView.root.rotation.y = tmp.yaw + 0.5;
}
function bindUI() {
  hud.pos = $('hPos'); hud.lap = $('hLap'); hud.time = $('hTime'); hud.lapT = $('hLapT'); hud.best = $('hBest');
  hud.spd = $('hSpd'); hud.nitroFill = $('nitroFill'); hud.fps = $('fps');
  $('fps').classList.toggle('hide', !settings.fps);
  const click = (id, fn) => $(id).addEventListener('click', e => { e.preventDefault(); sfx.init(); fn(e); });
  click('prevCar', () => { settings.car = (settings.car + CAR_DEFS.length - 1) % CAR_DEFS.length; store.set('car', settings.car); refreshMenu(); });
  click('nextCar', () => { settings.car = (settings.car + 1) % CAR_DEFS.length; store.set('car', settings.car); refreshMenu(); });
  document.querySelectorAll('.swatch').forEach((b, i) => b.addEventListener('click', () => { settings.variant = i; store.set('variant', i); refreshMenu(); }));
  document.querySelectorAll('#diff button').forEach((b, i) => b.addEventListener('click', () => { settings.diff = i; store.set('diff', i); refreshMenu(); }));
  document.querySelectorAll('#qual button').forEach(b => b.addEventListener('click', () => { if (settings.quality === b.dataset.q) return; settings.quality = b.dataset.q; store.set('quality', settings.quality); applyQuality(false); refreshMenu(); }));
  const gasT = e => { settings.autoGas = e.target.checked; store.set('autoGas', settings.autoGas); $('bGas').classList.toggle('hide', settings.autoGas); $('pedals').classList.toggle('auto', !!settings.autoGas); refreshMenu(); };
  const sndT = e => { settings.mute = !e.target.checked; store.set('mute', settings.mute); sfx.setMute(settings.mute); refreshMenu(); };
  $('optGas').addEventListener('change', gasT); $('pGas').addEventListener('change', gasT);
  $('optSnd').addEventListener('change', sndT); $('pSnd').addEventListener('change', sndT);
  click('startBtn', startRace);
  click('pauseBtn', togglePause);
  click('resumeBtn', resume);
  click('restartBtn', startRace);
  click('menuBtn', toMenu);
  click('againBtn', startRace);
  click('resMenuBtn', toMenu);
  click('resetBtn', resetPlayer);
  bindSteer($('steer'));
  bindHold($('bGas'), 'gas'); bindHold($('bBrake'), 'brake'); bindHold($('bNitro'), 'nitro'); bindHold($('bDrift'), 'drift');
  for (const id of ['touch', 'hud']) $(id).addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('gesturestart', e => e.preventDefault());
  if (!isTouch) $('keysHelp').classList.remove('hide');
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (G.state === 'race' || G.state === 'countdown') togglePause(); sfx.suspend(); }
    else { lastT = performance.now(); if (G.state !== 'paused') sfx.resume(); }
  });
}

// ---------- perf: adaptive resolution ----------
let fpsAvg = 60, perfT = 0, perfBad = 0, perfGood = 0, frameMsAvg = 16.7;
function perfTick(dtMs) {
  frameMsAvg += (dtMs - frameMsAvg) * 0.05;
  fpsAvg = 1000 / frameMsAvg;
  perfT += dtMs;
  if (perfT < 500) return;
  perfT = 0;
  if (G.state !== 'race' && G.state !== 'countdown' && G.state !== 'menu') return;
  if (frameMsAvg > 21) { perfBad++; perfGood = 0; } else if (frameMsAvg < 17.8) { perfGood++; perfBad = 0; } else { perfBad = 0; perfGood = 0; }
  if (perfBad >= 3 && dpr > minDpr + 0.01) {
    dpr = Math.max(minDpr, dpr - 0.15); renderer.setPixelRatio(dpr); resize(); perfBad = 0;
  } else if (perfGood >= 12 && dpr < maxDpr - 0.01) {
    dpr = Math.min(maxDpr, dpr + 0.1); renderer.setPixelRatio(dpr); resize(); perfGood = 0;
  }
}
function warmup() {
  try { renderer.compile(scene, camera); } catch (e) { /* ignore */ }
}

// ---------- main loop ----------
let lastT = performance.now(), time = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dtMs = now - lastT; lastT = now;
  if (dtMs < 0) dtMs = 0;
  perfTick(Math.min(dtMs, 100));
  let dt = Math.min(dtMs / 1000, 0.1);
  time += dt;
  if (G.state === 'loading') return;
  if (G.state === 'paused') { renderer.render(scene, camera); return; }
  updateCoins(time, dt);
  smoke.update(dt);
  if (G.state === 'menu') {
    updateMenuCamera(dt); updateSun();
    renderer.render(scene, camera);
    return;
  }
  const p = G.player;
  let alpha = 1;
  if (G.state === 'countdown') {
    G.countdown -= dt;
    const n = Math.ceil(G.countdown);
    if (n !== G.lastCount && n >= 1 && n <= 3) { G.lastCount = n; setCount(n + ''); sfx.beep(520, 0.18, 'square', 0.18); }
    readPlayerInput(p.in);
    sfx.engine(p.in.thr ? 0.5 : 0.05, p.in.thr, true);
    if (G.countdown <= 0) { G.state = 'race'; setCount('GO!'); sfx.beep(1040, 0.4, 'square', 0.2); G.t = 0; G.lapStart = 0; }
  }
  if (G.state === 'race' || G.state === 'results') {
    G.acc += dt; let n = 0;
    while (G.acc >= STEP && n < 12) {
      for (const c of G.cars) c.impact = 0;
      simStep(STEP); G.t += STEP; G.acc -= STEP; n++;
      if (p.impact > 5 && G.state === 'race') { shake = Math.min(1.2, p.impact * 0.08); sfx.thud(p.impact * 0.04); }
    }
    if (n === 12) G.acc = 0;
    alpha = G.acc / STEP;
    collectCoins();
    if (G.resetCd > 0) G.resetCd -= dt;
    if (G.finishShown > 0) { G.finishShown -= dt; if (G.finishShown <= 0 && G.state === 'race') showResults(); }
    if (G.state === 'race') {
      sfx.engine(Math.min(1.25, p.vf / p.def.top), p.in.thr, true);
      sfx.skid(p.offroad ? 0 : Math.max(0, Math.abs(p.vr) - 3) * 0.05 + (p.in.hb && p.speed() > 5 ? 0.08 : 0));
    } else { sfx.engine(0, 0, false); sfx.skid(0); }
  }
  updateViews(alpha, dt);
  updateCamera(dt);
  updateSun();
  if (G.state !== 'results') updateHUD(dt);
  renderer.render(scene, camera);
}
function setCount(t) {
  const el = $('count'); el.textContent = t; el.classList.remove('hide', 'pop'); void el.offsetWidth; el.classList.add('pop');
  clearTimeout(setCount.tm); setCount.tm = setTimeout(() => el.classList.add('hide'), t === 'GO!' ? 700 : 900);
}

// ---------- boot ----------
async function boot() {
  const bar = $('loadBar');
  const setP = p => { bar.style.transform = 'scaleX(' + p.toFixed(3) + ')'; };
  const ab = await fetchPack(p => setP(p * 0.7));
  const files = unpack(ab);
  $('loadText').textContent = 'Modeller hazırlanıyor…';
  const loader = new GLTFLoader();
  const parse = buf => new Promise((res, rej) => loader.parse(buf, '', res, rej));
  const texs = await Promise.all([loadTexture(files.tex0), loadTexture(files.tex1), loadTexture(files.tex2)]);
  carMats = texs.map(t => new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide }));
  allMats.push(...carMats);
  const names = Object.keys(files).filter(n => !n.startsWith('tex'));
  const gltfs = {};
  let done = 0;
  await Promise.all(names.map(async n => { gltfs[n] = await parse(files[n]); setP(0.7 + 0.2 * (++done / names.length)); }));
  for (const n of names) {
    if (n.startsWith('vehicle-')) carTemplates[n] = prepCarTemplate(gltfs[n]);
    else if (n === 'item-coin-gold' || n === 'smoke') continue;
    else extractModel(n, gltfs[n], false);
  }
  await nextFrame();
  $('loadText').textContent = 'Pist kuruluyor…';
  layout = buildLayout();
  cl = buildCenterline(layout.pieces);
  prof = speedProfile(cl, 60, 22, 18);
  sFinish = TILE; iFinish = Math.round(sFinish / cl.ds) % cl.N;
  buildTrack(); await nextFrame();
  decorate(); await nextFrame();
  flushBuckets(); buildGround();
  buildCoins(gltfs['item-coin-gold'], texs[0]);
  {
    const parts = []; gltfs.smoke.scene.updateMatrixWorld(true);
    gltfs.smoke.scene.traverse(o => { if (o.isMesh) { const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); parts.push(g); } });
    const geo = parts.length > 1 ? mergeGeometries(parts, false) : parts[0];
    geo.computeBoundingBox(); const c = geo.boundingBox.getCenter(new THREE.Vector3()); geo.translate(-c.x, -c.y, -c.z);
    const sz = geo.boundingBox.getSize(new THREE.Vector3()); const s = 1.4 / Math.max(sz.x, sz.y, sz.z); geo.scale(s, s, s);
    const mat = new THREE.MeshLambertMaterial({ color: 0xf2f2f2, emissive: 0x555555 }); allMats.push(mat);
    smoke = new Smoke(geo, mat, 64);
  }
  blobMat = new THREE.MeshBasicMaterial({ map: makeBlobTex(), transparent: true, depthWrite: false });
  allMats.push(blobMat);
  buildMinimap();
  bindUI();
  applyQuality(true);
  refreshMenu();
  setP(1);
  await nextFrame();
  updateMenuCamera(0); updateSun();
  warmup();
  renderer.render(scene, camera);
  G.state = 'menu';
  showScreen('menu');
  $('loader').classList.add('hide');
  window.__game = { G, cl, renderer, scene, camera, startRace, settings, keys, touch };
}
boot().catch(e => { console.error(e); $('loadText').textContent = 'Yükleme hatası: ' + (e && e.message || e); });
requestAnimationFrame(frame);
