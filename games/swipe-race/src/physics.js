// Arcade araç fiziği + bot sürücü. three.js'siz saf JS (Node'da da çalışır).
import { project, TILE } from './track.js';

export const ROAD_HALF = 0.41 * TILE;
export const CAR_R = 1.5;
const WB = 2.65;

// kit: toy (Toy Car Kit, renk = doku) | racing (Racing Kit, renk = ayrı model)
// lvl: açılan seviye, price: jetonla hemen açma fiyatı (0 = baştan açık)
export const CAR_DEFS = [
  { id: 'vehicle-racer', name: 'Racer', kit: 'toy', top: 44, acc: 16, grip: 1.0, handling: 1.0, offroad: 0.55, mass: 1.0, lvl: 1, price: 0 },
  { id: 'vehicle-vintage-racer', name: 'Vintage', kit: 'toy', top: 42, acc: 18.5, grip: 1.03, handling: 1.05, offroad: 0.55, mass: 0.9, lvl: 1, price: 0 },
  { id: 'vehicle-suv', name: 'SUV', kit: 'toy', top: 40, acc: 14, grip: 0.99, handling: 0.93, offroad: 0.82, mass: 1.35, lvl: 1, price: 0 },
  { id: 'vehicle-speedster', name: 'Speedster', kit: 'toy', top: 47.5, acc: 14.5, grip: 0.95, handling: 0.96, offroad: 0.5, mass: 0.95, lvl: 3, price: 25 },
  { id: 'vehicle-truck', name: 'Kamyonet', kit: 'toy', top: 38.5, acc: 13.5, grip: 0.97, handling: 0.9, offroad: 0.85, mass: 1.5, lvl: 4, price: 20 },
  { id: 'vehicle-racer-low', name: 'Low Racer', kit: 'toy', top: 43, acc: 15.5, grip: 1.12, handling: 1.1, offroad: 0.45, mass: 0.95, lvl: 5, price: 35 },
  { id: 'vehicle-monster-truck', name: 'Monster', kit: 'toy', top: 39, acc: 15, grip: 0.93, handling: 0.9, offroad: 0.98, mass: 1.6, lvl: 7, price: 40 },
  { id: 'vehicle-drag-racer', name: 'Drag Racer', kit: 'toy', top: 51, acc: 17, grip: 0.86, handling: 0.86, offroad: 0.45, mass: 1.0, lvl: 9, price: 55 },
  {
    id: 'formula', name: 'Formula', kit: 'racing', models: ['raceCarRed', 'raceCarGreen', 'raceCarOrange', 'raceCarWhite'],
    colors: ['Kırmızı', 'Yeşil', 'Turuncu', 'Beyaz'], swatches: ['#e8554f', '#4d8f6e', '#f2a541', '#f1f2f6'],
    top: 50, acc: 18, grip: 1.16, handling: 1.08, offroad: 0.35, mass: 0.85, lvl: 12, price: 90,
  },
];
const TOY_COLORS = ['Klasik', 'Turuncu', 'Beyaz'];
const TOY_SW = ['linear-gradient(135deg,#e8473d,#5cc2ff)', 'linear-gradient(135deg,#ff9a3d,#3db36a)', 'linear-gradient(135deg,#ffffff,#9aa4b8)'];
for (const d of CAR_DEFS) {
  if (d.kit === 'toy') { d.models = [d.id, d.id, d.id]; d.colors = TOY_COLORS; d.swatches = TOY_SW; }
  d.variants = d.models.length;
}
export const carIndex = id => Math.max(0, CAR_DEFS.findIndex(d => d.id === id));

export const ITEMS = ['turbo', 'banana', 'shield'];

const Q = { s: 0, lat: 0, nx: 0, nz: 0, tx: 0, tz: 0, y: 0, wall: 10, slope: 0, elev: 0 };

export class CarSim {
  constructor(def) {
    this.def = def;
    this.x = 0; this.z = 0; this.y = 0; this.yaw = 0; this.vx = 0; this.vz = 0;
    this.px = 0; this.pz = 0; this.pyy = 0; this.pyaw = 0; // önceki adım (ara değer için)
    this.steer = 0; this.vf = 0; this.vr = 0; this.yawRate = 0; this.slope = 0;
    this.in = { thr: 0, brk: 0, str: 0, hb: 0, nitro: 0, use: 0 };
    this.idx = 0; this.s = 0; this.lat = 0; this.tx = 0; this.tz = -1; this.wall = 10;
    this.raceDist = 0; this.finished = false; this.finishTime = 0;
    this.nitro = 0.35; this.nitroOn = false; this.topMul = 1;
    this.offroad = false; this.impact = 0; this.wallHit = 0; this.wrongWayT = 0;
    this.item = null; this.spinT = 0; this.shieldT = 0; this.boostT = 0; this.useT = 0;
    // bot
    this.ai = false; this.skill = 1; this.lane = 0; this.laneTarget = 0; this.laneTimer = 0;
    this.stuckT = 0; this.recoverT = 0; this.itemDelay = 0;
  }
  placeAt(cl, i, lat, back = 0) {
    const N = cl.N; i = ((i % N) + N) % N;
    const tx = cl.tx[i], tz = cl.tz[i];
    this.x = cl.px[i] + (-tz) * lat - tx * back;
    this.z = cl.pz[i] + tx * lat - tz * back;
    this.yaw = Math.atan2(-tx, -tz);
    this.vx = this.vz = 0; this.steer = 0; this.vf = 0; this.vr = 0; this.spinT = 0; this.boostT = 0;
    this.idx = i; this.idx = project(cl, this.x, this.z, i, Q);
    this.s = Q.s; this.lat = Q.lat; this.y = Q.y; this.wall = Q.wall;
    this.px = this.x; this.pz = this.z; this.pyy = this.y; this.pyaw = this.yaw;
  }
  spinOut() {
    if (this.shieldT > 0) { this.shieldT = 0; return false; }
    if (this.spinT > 0) return false;
    this.spinT = 1.1; return true;
  }
  step(dt, cl) {
    const d = this.def, inp = this.in;
    this.px = this.x; this.pz = this.z; this.pyy = this.y; this.pyaw = this.yaw;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const fx = -sy, fz = -cy, rx = cy, rz = -sy;
    let vf = this.vx * fx + this.vz * fz, vr = this.vx * rx + this.vz * rz;
    const off = Math.abs(this.lat) > ROAD_HALF;
    this.offroad = off;
    if (this.shieldT > 0) this.shieldT -= dt;
    if (this.boostT > 0) this.boostT -= dt;
    const spinning = this.spinT > 0;
    if (spinning) this.spinT -= dt;
    const thr = spinning ? 0 : inp.thr, brk = spinning ? 0 : inp.brk;
    this.nitroOn = !spinning && inp.nitro > 0 && this.nitro > 0.01 && thr > 0;
    if (this.nitroOn) this.nitro = Math.max(0, this.nitro - 0.42 * dt);
    const boost = this.boostT > 0;
    const top = d.top * this.topMul * (off ? d.offroad : 1) * (this.nitroOn ? 1.22 : 1) * (boost ? 1.3 : 1);
    const acc = d.acc * (this.nitroOn ? 1.7 : 1) * (boost ? 2.2 : 1) * (off ? 0.8 : 1);
    if (brk > 0 && vf > 0.5) {
      vf = Math.max(0, vf - 32 * brk * dt);
    } else if (brk > 0) {
      if (vf > -11) vf -= 9 * brk * dt;
    } else if (thr > 0 || boost) {
      if (vf < 0) vf += 30 * dt;
      else if (vf < top) { const r = vf / top; vf += acc * Math.max(thr, boost ? 1 : 0) * Math.max(0.05, 1 - r * r) * dt; }
    } else {
      const roll = 2.2 * dt; vf = vf > roll ? vf - roll : vf < -roll ? vf + roll : 0;
    }
    if (vf > top) vf -= (vf - top) * (off ? 2.2 : 0.9) * dt;
    vf -= vf * (0.035 + (off ? 0.35 : 0)) * dt;
    vf -= 9.81 * this.slope * 0.55 * dt; // yokuş
    if (spinning) vf -= vf * 1.6 * dt;
    if (inp.hb && !spinning) vf -= vf * 0.55 * dt;
    // direksiyon
    const sr = Math.min(1, Math.abs(vf) / d.top);
    const maxSteer = (0.6 - 0.43 * sr) * d.handling;
    const target = spinning ? 0 : inp.str * maxSteer;
    const rate = (Math.abs(target) < Math.abs(this.steer) ? 5 : 2.6) * dt;
    this.steer += Math.max(-rate, Math.min(rate, target - this.steer));
    let yr = vf * Math.tan(this.steer) / WB;
    const aMax = 26 * d.grip * (off ? 0.72 : 1) * (inp.hb ? 1.25 : 1);
    if (Math.abs(vf * yr) > aMax) yr = Math.sign(yr) * aMax / Math.max(1, Math.abs(vf));
    if (spinning) yr = 7.5;
    this.yawRate = yr;
    const k = 9 * d.grip * (off ? 0.55 : 1) * (inp.hb ? 0.16 : 1) * (spinning ? 0.15 : 1);
    vr *= Math.exp(-k * dt);
    this.vf = vf; this.vr = vr;
    this.vx = fx * vf + rx * vr; this.vz = fz * vf + rz * vr;
    this.yaw -= yr * dt;
    this.x += this.vx * dt; this.z += this.vz * dt;
    this.track(cl, dt);
  }
  track(cl, dt) {
    const prevS = this.s;
    this.idx = project(cl, this.x, this.z, this.idx, Q);
    this.lat = Q.lat; this.s = Q.s; this.tx = Q.tx; this.tz = Q.tz; this.y = Q.y; this.slope = Q.slope; this.wall = Q.wall;
    const W = Q.wall;
    if (Math.abs(this.lat) > W) {
      const sg = Math.sign(this.lat), push = Math.abs(this.lat) - W;
      this.x -= Q.nx * push * sg; this.z -= Q.nz * push * sg;
      const vn = (this.vx * Q.nx + this.vz * Q.nz) * sg;
      if (vn > 0) {
        this.vx -= Q.nx * sg * vn * 1.35; this.vz -= Q.nz * sg * vn * 1.35;
        this.vx *= 0.97; this.vz *= 0.97;
        if (vn > this.impact) this.impact = vn;
        if (vn > 3) this.wallHit++;
      }
      this.lat = sg * W;
    }
    let dd = this.s - prevS;
    if (dd > cl.L / 2) dd -= cl.L; else if (dd < -cl.L / 2) dd += cl.L;
    this.raceDist += dd;
    const along = this.vx * this.tx + this.vz * this.tz;
    if (along < -3) this.wrongWayT += dt; else this.wrongWayT = Math.max(0, this.wrongWayT - dt * 2);
  }
  speed() { return Math.hypot(this.vx, this.vz); }
}

export function collideCars(cars) {
  const R2 = CAR_R * 2;
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i]; if (a.ghost) continue;
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j]; if (b.ghost) continue;
      if (Math.abs(a.y - b.y) > 2.5) continue;
      const dx = b.x - a.x, dz = b.z - a.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= R2 * R2 || d2 < 1e-6) continue;
      const d = Math.sqrt(d2), nx = dx / d, nz = dz / d;
      const ma = a.def.mass * (a.boostT > 0 ? 2 : 1), mb = b.def.mass * (b.boostT > 0 ? 2 : 1), mt = ma + mb;
      const pen = R2 - d;
      a.x -= nx * pen * (mb / mt); a.z -= nz * pen * (mb / mt);
      b.x += nx * pen * (ma / mt); b.z += nz * pen * (ma / mt);
      const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
      if (rv < 0) {
        const j2 = -(1 + 0.25) * rv / (1 / ma + 1 / mb);
        a.vx -= j2 * nx / ma; a.vz -= j2 * nz / ma;
        b.vx += j2 * nx / mb; b.vz += j2 * nz / mb;
        const imp = -rv;
        if (imp > a.impact) a.impact = imp;
        if (imp > b.impact) b.impact = imp;
      }
    }
  }
}

// Bot sürücü: car.in'i doldurur. hazards: [{x,z,on}] (muzlar)
export function aiDrive(car, cl, prof, cars, playerDist, dt, rnd, hazards) {
  const { N, ds, px, pz } = cl;
  const v = car.vf;
  const inp = car.in;
  inp.use = 0;
  if (car.recoverT > 0) {
    car.recoverT -= dt;
    inp.thr = 0; inp.brk = 1; inp.str = -Math.sign(car.lat || 1); inp.hb = 0; inp.nitro = 0;
    return;
  }
  if (Math.abs(v) < 2 && car.spinT <= 0) car.stuckT += dt; else car.stuckT = 0;
  if (car.stuckT > 1.6) { car.stuckT = 0; car.recoverT = 0.9; }
  const W = Math.max(1, car.wall - 1.6);
  car.laneTimer -= dt;
  if (car.laneTimer <= 0) { car.laneTarget = (rnd() * 2 - 1) * Math.min(2.6, W); car.laneTimer = 2 + rnd() * 3; }
  for (let k = 0; k < cars.length; k++) {
    const o = cars[k]; if (o === car || o.ghost) continue;
    const gap = o.raceDist - car.raceDist;
    if (gap > 0 && gap < 12 + v * 0.3 && Math.abs(o.lat - car.lat) < 3.4 && Math.abs(o.y - car.y) < 2.5) {
      car.laneTarget = o.lat > car.lat ? o.lat - 3.8 : o.lat + 3.8;
      car.laneTimer = 1.2;
    }
  }
  if (hazards) {
    const sy0 = Math.sin(car.yaw), cy0 = Math.cos(car.yaw);
    for (const h of hazards) {
      if (!h.on) continue;
      const dx = h.x - car.x, dz = h.z - car.z;
      const fwd = dx * -sy0 + dz * -cy0;
      if (fwd < 2 || fwd > 30) continue;
      const side = dx * cy0 + dz * -sy0;
      if (Math.abs(side) < 2.6) { car.laneTarget = car.lane + (side > 0 ? -3.4 : 3.4); car.laneTimer = 0.8; }
    }
  }
  car.laneTarget = Math.max(-W, Math.min(W, car.laneTarget));
  const lr = 3 * dt;
  car.lane += Math.max(-lr, Math.min(lr, car.laneTarget - car.lane));
  car.lane = Math.max(-W, Math.min(W, car.lane));
  const ahead = (car.idx + Math.round((5 + Math.abs(v) * 0.42) / ds)) % N;
  const tx = px[ahead] + (-cl.tz[ahead]) * car.lane, tz = pz[ahead] + cl.tx[ahead] * car.lane;
  const sy = Math.sin(car.yaw), cy = Math.cos(car.yaw);
  const dx = tx - car.x, dz = tz - car.z;
  const fwd = dx * -sy + dz * -cy, rgt = dx * cy + dz * -sy;
  const ang = Math.atan2(rgt, Math.max(0.1, fwd));
  inp.str = Math.max(-1, Math.min(1, ang * 2.6));
  const rub = Math.max(0.93, Math.min(1.08, 1 + (playerDist - car.raceDist) * 0.0016));
  car.topMul = rub;
  const look = (car.idx + Math.round(Math.max(3, v * 0.3) / ds)) % N;
  const vt = Math.min(prof[look] * car.skill, car.def.top * rub * 1.05);
  inp.thr = v < vt ? 1 : 0;
  inp.brk = v > vt + 1.0 ? Math.min(1, (v - vt) / 4) : 0;
  inp.hb = 0;
  const straight = prof[look] > car.def.top * 1.05 && Math.abs(inp.str) < 0.3;
  inp.nitro = (car.nitro > 0.25 && straight) ? 1 : 0;
  // eşya
  if (car.item) {
    car.itemDelay -= dt;
    if (car.itemDelay <= 0) {
      if (car.item === 'turbo') inp.use = straight ? 1 : 0;
      else if (car.item === 'banana') {
        let behind = false;
        for (const o of cars) { if (o === car || o.ghost) continue; const g = car.raceDist - o.raceDist; if (g > 3 && g < 25) behind = true; }
        inp.use = behind || car.itemDelay < -6 ? 1 : 0;
      } else inp.use = 1;
    }
  }
}

export function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
