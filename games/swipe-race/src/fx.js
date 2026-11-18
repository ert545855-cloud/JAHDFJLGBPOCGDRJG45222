// Efektler ve toplanabilirler. Hepsi tek InstancedMesh; karede yeni bellek ayrılmaz.
import * as THREE from 'three';
import { scene, allMats } from './core.js';
import { geos, tex } from './assets.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const _e = new THREE.Euler();

function writeTRS(arr, o, x, y, z, yaw, sx, sy, sz) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  arr[o] = c * sx; arr[o + 1] = 0; arr[o + 2] = -s * sx; arr[o + 3] = 0;
  arr[o + 4] = 0; arr[o + 5] = sy; arr[o + 6] = 0; arr[o + 7] = 0;
  arr[o + 8] = s * sz; arr[o + 9] = 0; arr[o + 10] = c * sz; arr[o + 11] = 0;
  arr[o + 12] = x; arr[o + 13] = y; arr[o + 14] = z; arr[o + 15] = 1;
}
function zero(arr, o) { for (let k = 0; k < 16; k++) arr[o + k] = 0; }

export class Smoke {
  constructor(n = 64) {
    this.n = n; this.i = 0;
    this.x = new Float32Array(n); this.y = new Float32Array(n); this.z = new Float32Array(n);
    this.vx = new Float32Array(n); this.vz = new Float32Array(n);
    this.life = new Float32Array(n); this.max = new Float32Array(n); this.size = new Float32Array(n);
    this.mat = new THREE.MeshLambertMaterial({ color: 0xf2f2f2, emissive: 0x555555 }); allMats.push(this.mat);
    const g = geos.smoke.clone(); if (g.attributes.uv) g.deleteAttribute('uv');
    this.mesh = new THREE.InstancedMesh(g, this.mat, n);
    this.mesh.frustumCulled = false; this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceMatrix.array.fill(0);
    scene.add(this.mesh);
  }
  spawn(x, y, z, vx, vz, size, life) {
    const i = this.i; this.i = (i + 1) % this.n;
    this.x[i] = x; this.y[i] = y; this.z[i] = z; this.vx[i] = vx; this.vz[i] = vz;
    this.life[i] = life; this.max[i] = life; this.size[i] = size;
  }
  clear() { this.life.fill(0); }
  update(dt) {
    const a = this.mesh.instanceMatrix.array; let dirty = false;
    for (let i = 0; i < this.n; i++) {
      const o = i * 16;
      if (this.life[i] <= 0) { if (a[o] !== 0 || a[o + 15] !== 0) { zero(a, o); dirty = true; } continue; }
      dirty = true;
      this.life[i] -= dt;
      const t = Math.max(0, this.life[i] / this.max[i]);
      this.x[i] += this.vx[i] * dt; this.z[i] += this.vz[i] * dt; this.y[i] += 1.6 * dt;
      this.vx[i] *= 0.96; this.vz[i] *= 0.96;
      const s = this.size[i] * (0.5 + (1 - t) * 1.1) * Math.min(1, t * 3);
      writeTRS(a, o, this.x[i], this.y[i], this.z[i], 0, s, s, s);
    }
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// Lastik izleri: yere yapışık koyu şeritler, halka tampon (en eskisi yenisiyle değişir)
export class Skids {
  constructor(n = 360) {
    this.n = n; this.i = 0;
    const g = new THREE.PlaneGeometry(0.42, 1).rotateX(-Math.PI / 2);
    this.mat = new THREE.MeshBasicMaterial({ color: 0x15171c, transparent: true, opacity: 0.42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.mesh = new THREE.InstancedMesh(g, this.mat, n);
    this.mesh.frustumCulled = false; this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceMatrix.array.fill(0); this.mesh.renderOrder = 1;
    this.dirty = false;
    scene.add(this.mesh);
  }
  // iki nokta arasına şerit
  add(x0, z0, x1, z1, y) {
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
    if (len < 0.05 || len > 6) return;
    const i = this.i; this.i = (i + 1) % this.n;
    writeTRS(this.mesh.instanceMatrix.array, i * 16, (x0 + x1) / 2, y + 0.06, (z0 + z1) / 2, Math.atan2(dx, dz), 1, 1, len);
    this.dirty = true;
  }
  clear() { this.mesh.instanceMatrix.array.fill(0); this.mesh.instanceMatrix.needsUpdate = true; }
  update() { if (this.dirty) { this.mesh.instanceMatrix.needsUpdate = true; this.dirty = false; } }
}

// Altınlar, eşya kutuları, muzlar
export class Pickups {
  constructor() {
    this.coinMat = new THREE.MeshLambertMaterial({ map: tex[0], emissive: 0x3a2a00 });
    this.boxMat = new THREE.MeshLambertMaterial({ map: tex[0], emissive: 0x220a33 });
    this.banMat = new THREE.MeshLambertMaterial({ map: tex[0] });
    allMats.push(this.coinMat, this.boxMat, this.banMat);
    this.coinMesh = null; this.boxMesh = null;
    this.bananas = []; this.banMesh = new THREE.InstancedMesh(geos.banana, this.banMat, 16);
    for (let i = 0; i < 16; i++) this.bananas.push({ x: 0, z: 0, y: 0, on: false, t: 0, owner: null, yaw: 0 });
    this.banMesh.frustumCulled = false; this.banMesh.castShadow = true; this.banMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.banMesh.instanceMatrix.array.fill(0);
    scene.add(this.banMesh);
  }
  setup(world) {
    for (const m of [this.coinMesh, this.boxMesh]) if (m) { scene.remove(m); }
    this.coins = world.coins.map(p => ({ x: p[0], z: p[1], y: p[2], t: 0 }));
    this.boxes = world.boxes.map(p => ({ x: p[0], z: p[1], y: p[2], t: 0 }));
    this.coinMesh = new THREE.InstancedMesh(geos.coin, this.coinMat, Math.max(1, this.coins.length));
    this.boxMesh = new THREE.InstancedMesh(geos.box, this.boxMat, Math.max(1, this.boxes.length));
    for (const m of [this.coinMesh, this.boxMesh]) { m.frustumCulled = false; m.castShadow = true; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); }
    this.reset();
  }
  reset() {
    if (this.coins) { for (const c of this.coins) c.t = 0; for (const b of this.boxes) b.t = 0; }
    for (const b of this.bananas) b.on = false;
  }
  dropBanana(x, z, y, owner) {
    let slot = this.bananas.find(b => !b.on);
    if (!slot) slot = this.bananas.reduce((a, b) => (a.t < b.t ? a : b));
    Object.assign(slot, { x, z, y, on: true, t: 30, owner, yaw: Math.random() * 6.28, arm: 0.6 });
  }
  update(time, dt) {
    const ca = this.coinMesh.instanceMatrix.array;
    const spin = time * 3;
    for (let i = 0; i < this.coins.length; i++) {
      const c = this.coins[i];
      if (c.t > 0) c.t -= dt;
      if (c.t > 0) zero(ca, i * 16); else writeTRS(ca, i * 16, c.x, c.y + 1.0 + Math.sin(time * 2.4 + i) * 0.25, c.z, spin, 1, 1, 1);
    }
    this.coinMesh.instanceMatrix.needsUpdate = true;
    const ba = this.boxMesh.instanceMatrix.array;
    for (let i = 0; i < this.boxes.length; i++) {
      const b = this.boxes[i];
      if (b.t > 0) b.t -= dt;
      const grow = b.t > 0 ? 0 : 1;
      _e.set(0.35, time * 1.6 + i, 0.2); _q.setFromEuler(_e);
      _p.set(b.x, b.y + 1.1 + Math.sin(time * 2 + i) * 0.2, b.z); _s.setScalar(grow);
      _m.compose(_p, _q, _s).toArray(ba, i * 16);
    }
    this.boxMesh.instanceMatrix.needsUpdate = true;
    const na = this.banMesh.instanceMatrix.array;
    for (let i = 0; i < this.bananas.length; i++) {
      const b = this.bananas[i];
      if (b.on) { b.t -= dt; if (b.arm > 0) b.arm -= dt; if (b.t <= 0) b.on = false; }
      if (b.on) writeTRS(na, i * 16, b.x, b.y + 0.05, b.z, b.yaw, 1, 1, 1); else zero(na, i * 16);
    }
    this.banMesh.instanceMatrix.needsUpdate = true;
  }
}
