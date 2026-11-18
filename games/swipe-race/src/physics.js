// Arcade car physics + AI. Pure JS (no three.js) so it can run headless.
import { project, TILE } from './track.js';

export const ROAD_HALF = 0.41 * TILE;
export const WALL = 0.74 * TILE;
export const CAR_R = 1.5;
const WB = 2.65;

export const CAR_DEFS = [
  { id: 'vehicle-racer', name: 'Racer', top: 44, acc: 16, grip: 1.0, handling: 1.0, offroad: 0.55, mass: 1.0 },
  { id: 'vehicle-speedster', name: 'Speedster', top: 47.5, acc: 14.5, grip: 0.95, handling: 0.96, offroad: 0.5, mass: 0.95 },
  { id: 'vehicle-racer-low', name: 'Low Racer', top: 43, acc: 15.5, grip: 1.12, handling: 1.1, offroad: 0.45, mass: 0.95 },
  { id: 'vehicle-vintage-racer', name: 'Vintage', top: 42, acc: 18.5, grip: 1.03, handling: 1.05, offroad: 0.55, mass: 0.9 },
  { id: 'vehicle-drag-racer', name: 'Drag Racer', top: 51, acc: 17, grip: 0.86, handling: 0.86, offroad: 0.45, mass: 1.0 },
  { id: 'vehicle-suv', name: 'SUV', top: 40, acc: 14, grip: 0.99, handling: 0.93, offroad: 0.82, mass: 1.35 },
  { id: 'vehicle-truck', name: 'Kamyonet', top: 38.5, acc: 13.5, grip: 0.97, handling: 0.9, offroad: 0.82, mass: 1.5 },
  { id: 'vehicle-monster-truck', name: 'Monster', top: 39, acc: 15, grip: 0.93, handling: 0.9, offroad: 0.95, mass: 1.6 },
];

const Q = { s: 0, lat: 0, nx: 0, nz: 0, tx: 0, tz: 0 };

export class CarSim {
  constructor(def) {
    this.def = def;
    this.x = 0; this.z = 0; this.yaw = 0; this.vx = 0; this.vz = 0;
    this.px = 0; this.pz = 0; this.pyaw = 0; // previous (for interpolation)
    this.steer = 0; this.vf = 0; this.vr = 0; this.yawRate = 0;
    this.in = { thr: 0, brk: 0, str: 0, hb: 0, nitro: 0 };
    this.idx = 0; this.s = 0; this.lat = 0; this.tx = 0; this.tz = -1;
    this.raceDist = 0; this.finished = false; this.finishTime = 0;
    this.nitro = 0.35; this.nitroOn = false; this.topMul = 1;
    this.offroad = false; this.impact = 0; this.wrongWayT = 0;
    // ai
    this.ai = false; this.skill = 1; this.lane = 0; this.laneTarget = 0; this.laneTimer = 0;
    this.stuckT = 0; this.recoverT = 0;
  }
  placeAt(cl, i, lat, back = 0) {
    const N = cl.N; i = ((i % N) + N) % N;
    const tx = cl.tx[i], tz = cl.tz[i];
    this.x = cl.px[i] + (-tz) * lat - tx * back;
    this.z = cl.pz[i] + tx * lat - tz * back;
    this.yaw = Math.atan2(-tx, -tz);
    this.vx = this.vz = 0; this.steer = 0; this.vf = 0; this.vr = 0;
    this.px = this.x; this.pz = this.z; this.pyaw = this.yaw;
    this.idx = i; this.idx = project(cl, this.x, this.z, i, Q);
    this.s = Q.s; this.lat = Q.lat;
  }
  step(dt, cl) {
    const d = this.def, inp = this.in;
    this.px = this.x; this.pz = this.z; this.pyaw = this.yaw;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const fx = -sy, fz = -cy, rx = cy, rz = -sy;
    let vf = this.vx * fx + this.vz * fz, vr = this.vx * rx + this.vz * rz;
    const off = Math.abs(this.lat) > ROAD_HALF;
    this.offroad = off;
    this.nitroOn = inp.nitro > 0 && this.nitro > 0.01 && inp.thr > 0;
    if (this.nitroOn) this.nitro = Math.max(0, this.nitro - 0.42 * dt);
    let top = d.top * this.topMul * (off ? d.offroad : 1) * (this.nitroOn ? 1.22 : 1);
    const acc = d.acc * (this.nitroOn ? 1.7 : 1) * (off ? 0.8 : 1);
    if (inp.brk > 0 && vf > 0.5) {
      vf = Math.max(0, vf - 32 * inp.brk * dt);
    } else if (inp.brk > 0) {
      if (vf > -11) vf -= 9 * inp.brk * dt;
    } else if (inp.thr > 0) {
      if (vf < 0) vf += 30 * dt;
      else if (vf < top) { const r = vf / top; vf += acc * inp.thr * Math.max(0.05, 1 - r * r) * dt; }
    } else {
      const roll = 2.2 * dt; vf = vf > roll ? vf - roll : vf < -roll ? vf + roll : 0;
    }
    if (vf > top) vf -= (vf - top) * (off ? 2.2 : 0.9) * dt;
    vf -= vf * (0.035 + (off ? 0.35 : 0)) * dt;
    if (inp.hb) vf -= vf * 0.55 * dt;
    // steering
    const sr = Math.min(1, Math.abs(vf) / d.top);
    const maxSteer = (0.6 - 0.43 * sr) * d.handling;
    const target = inp.str * maxSteer;
    const rate = (Math.abs(target) < Math.abs(this.steer) ? 5 : 2.6) * dt;
    this.steer += Math.max(-rate, Math.min(rate, target - this.steer));
    let yr = vf * Math.tan(this.steer) / WB;
    const aMax = 26 * d.grip * (off ? 0.72 : 1) * (inp.hb ? 1.25 : 1);
    if (Math.abs(vf * yr) > aMax) yr = Math.sign(yr) * aMax / Math.max(1, Math.abs(vf));
    this.yawRate = yr;
    // lateral grip
    const k = 9 * d.grip * (off ? 0.55 : 1) * (inp.hb ? 0.16 : 1);
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
    this.lat = Q.lat; this.s = Q.s; this.tx = Q.tx; this.tz = Q.tz;
    if (Math.abs(this.lat) > WALL) {
      const sg = Math.sign(this.lat), push = Math.abs(this.lat) - WALL;
      this.x -= Q.nx * push * sg; this.z -= Q.nz * push * sg;
      const vn = (this.vx * Q.nx + this.vz * Q.nz) * sg;
      if (vn > 0) {
        this.vx -= Q.nx * sg * vn * 1.35; this.vz -= Q.nz * sg * vn * 1.35;
        this.vx *= 0.97; this.vz *= 0.97;
        if (vn > this.impact) this.impact = vn;
      }
      this.lat = sg * WALL;
    }
    let dd = this.s - prevS;
    if (dd > cl.L / 2) dd -= cl.L; else if (dd < -cl.L / 2) dd += cl.L;
    this.raceDist += dd;
    // wrong way detection
    const along = this.vx * this.tx + this.vz * this.tz;
    if (along < -3) this.wrongWayT += dt; else this.wrongWayT = Math.max(0, this.wrongWayT - dt * 2);
  }
  speed() { return Math.hypot(this.vx, this.vz); }
}

export function collideCars(cars) {
  const R2 = CAR_R * 2;
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j];
      const dx = b.x - a.x, dz = b.z - a.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= R2 * R2 || d2 < 1e-6) continue;
      const d = Math.sqrt(d2), nx = dx / d, nz = dz / d;
      const ma = a.def.mass, mb = b.def.mass, mt = ma + mb;
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

// AI driver: writes car.in
export function aiDrive(car, cl, prof, cars, leaderDist, playerDist, dt, rnd) {
  const { N, ds, px, pz } = cl;
  const v = car.vf;
  const inp = car.in;
  // stuck recovery
  if (car.recoverT > 0) {
    car.recoverT -= dt;
    inp.thr = 0; inp.brk = 1; inp.str = -Math.sign(car.lat || 1); inp.hb = 0; inp.nitro = 0;
    return;
  }
  if (Math.abs(v) < 2) car.stuckT += dt; else car.stuckT = 0;
  if (car.stuckT > 1.6) { car.stuckT = 0; car.recoverT = 0.9; }
  // lane
  car.laneTimer -= dt;
  if (car.laneTimer <= 0) { car.laneTarget = (rnd() * 2 - 1) * 2.6; car.laneTimer = 2 + rnd() * 3; }
  for (let k = 0; k < cars.length; k++) {
    const o = cars[k]; if (o === car) continue;
    const gap = o.raceDist - car.raceDist;
    if (gap > 0 && gap < 12 + v * 0.3 && Math.abs(o.lat - car.lat) < 3.4) {
      car.laneTarget = o.lat > car.lat ? Math.max(-4.3, o.lat - 3.8) : Math.min(4.3, o.lat + 3.8);
      car.laneTimer = 1.2;
    }
  }
  const lr = 3 * dt;
  car.lane += Math.max(-lr, Math.min(lr, car.laneTarget - car.lane));
  // steering to a look-ahead point
  const ahead = (car.idx + Math.round((5 + Math.abs(v) * 0.42) / ds)) % N;
  const tx = px[ahead] + (-cl.tz[ahead]) * car.lane, tz = pz[ahead] + cl.tx[ahead] * car.lane;
  const sy = Math.sin(car.yaw), cy = Math.cos(car.yaw);
  const dx = tx - car.x, dz = tz - car.z;
  const fwd = dx * -sy + dz * -cy, rgt = dx * cy + dz * -sy;
  const ang = Math.atan2(rgt, Math.max(0.1, fwd));
  inp.str = Math.max(-1, Math.min(1, ang * 2.6));
  // speed
  const rub = Math.max(0.93, Math.min(1.08, 1 + (playerDist - car.raceDist) * 0.0016));
  car.topMul = rub;
  const look = (car.idx + Math.round(Math.max(3, v * 0.3) / ds)) % N;
  const vt = Math.min(prof[look] * car.skill, car.def.top * rub * 1.05);
  inp.thr = v < vt ? 1 : 0;
  inp.brk = v > vt + 1.0 ? Math.min(1, (v - vt) / 4) : 0;
  inp.hb = 0;
  inp.nitro = (car.nitro > 0.25 && prof[look] > car.def.top * 1.05 && Math.abs(inp.str) < 0.3) ? 1 : 0;
}

export function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
