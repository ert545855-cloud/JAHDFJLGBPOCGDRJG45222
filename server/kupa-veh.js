// Parti Kupası: araç modları (Araba Yarışı, Gemi Savaşı). Botlar, ilerleme, gülleler ve elemeler burada.
// Pist, deniz ve fizik sabitleri istemciyle ortak dosyadan gelir (public/js/k3veh-core.mjs).
const path = require('path');
const { pathToFileURL } = require('url');

let C = null; // ortak hesaplar: modül yüklenene kadar bu modlar kupaya çekilmez
const ready = import(pathToFileURL(path.join(__dirname, '..', 'public', 'js', 'k3veh-core.mjs')).href).then((m) => { C = m; return m; }).catch((e) => { console.error('[kupa] araç modları yüklenemedi', e); });

const rnd = (a, b) => a + Math.random() * (b - a);
const r2 = (n) => Math.round(n * 100) / 100;
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));

module.exports = function vehModes(h) { // h: kupa.js iç yardımcıları
  const { cast, elim, drop, endRound, alive, now } = h;
  const isVeh = (m) => m === 'araba' || m === 'gemi';
  const ok = () => !!C;

  // ---- tur başı dizilişi ----
  function setup(r, cont, m) {
    if (m === 'araba') {
      const tk = Math.floor(Math.random() * C.TRACKS); const t = C.carTrack(tk); r.car = { t, tk };
      r.st = { laps: C.CAR.laps, fin: [] };
      const order = cont.slice().sort(() => Math.random() - 0.5); // dizilişte sıra rastgele
      order.forEach((p, k) => { const g = C.grid(t, k); Object.assign(p, { x: g.x, z: g.z, y: 0, ry: g.ry, prog: g.prog, ci: -1, done: 0 });
        if (p.bot) p.b = { s: g.s, lat: g.lat, lane: g.lat, v: 0, sk: rnd(0.82, 0.95), tb: 0, tcd: rnd(3, 7), next: rnd(1.5, 4) }; });
    } else if (m === 'gemi') {
      const seed = Math.floor(Math.random() * 1e9); r.sea = { seed, isl: C.seaIslands(seed), balls: [], id: 0 }; r.st = { hp: {} }; const n = cont.length;
      cont.forEach((p, k) => { const a = (k / n) * Math.PI * 2 + 0.3; const x = Math.cos(a) * 21; const z = Math.sin(a) * 21; const ry = Math.atan2(-x, -z) + 0.8;
        Object.assign(p, { x, z, y: 0, ry, hp: C.SHIP.hp, fcd: 0, sd: 0 }); r.st.hp[r.players.indexOf(p)] = C.SHIP.hp;
        if (p.bot) p.b = { ry, v: 2, next: rnd(2, 4), sk: rnd(0.45, 0.85), wob: rnd(0, 6), turnAt: 0, dir: Math.random() < 0.5 ? 1 : -1 }; });
    }
  }
  const conf = (r, m, cap) => (m === 'araba' ? { tk: r.car.tk, laps: C.CAR.laps, len: cap / 1000 } : { ...C.SHIP, isl: r.sea.isl, len: cap / 1000 });

  // ---- Araba Yarışı ----
  function botCar(r, p, b, t, dt) {
    const T = r.car.t; if (t < 0) return;
    if (p.done) b.v = Math.max(0, b.v - 9 * dt);
    else {
      const i = Math.floor((((b.s % T.L) + T.L) % T.L) / T.ds) % T.N; let vt = T.sp[(i + 7) % T.N] * b.sk;
      const hum = alive(r).filter((q) => !q.bot); const lead = hum.length ? Math.max(...hum.map((q) => q.prog || 0)) : p.prog;
      if (p.prog > lead + 25) vt *= 0.88; else if (p.prog < lead - 60) vt *= 1.06; // lastik bant: yarış hep çekişmeli kalsın
      b.tcd -= dt; if (b.tcd <= 0 && T.sp[(i + 12) % T.N] >= C.CAR.vmax - 0.5 && T.sp[(i + 25) % T.N] >= C.CAR.vmax - 0.5) { b.tb = C.CAR.tlen; b.tcd = rnd(7, 12); }
      if (b.tb > 0) { b.tb -= dt; vt = Math.max(vt, Math.min(C.CAR.turbo * b.sk, T.sp[(i + 15) % T.N] + 6)); }
      b.v += Math.max(-18 * dt, Math.min(11 * dt, vt - b.v));
      b.next -= dt; if (b.next <= 0) { b.next = rnd(1.5, 4); b.lane = rnd(-3.4, 3.4); }
      for (const q of alive(r)) { if (q === p) continue; let ds = (q.prog || 0) - p.prog; if (ds > 0 && ds < 9) { const ql = q.bot ? q.b?.lat ?? 0 : C.project(T, q.x, q.z, q.ci ?? -1).lat; if (Math.abs(ql - b.lat) < 2.4) { b.lane = ql > b.lat ? Math.max(-4, ql - 2.9) : Math.min(4, ql + 2.9); if (ds < 4) b.v = Math.min(b.v, (q.bot ? q.b?.v : 20) ?? 20); } } }
    }
    const lat0 = b.lat; b.lat += (b.lane - b.lat) * Math.min(1, dt * 1.4);
    b.s += b.v * dt; p.prog += b.v * dt; const a = C.atS(T, b.s);
    p.x = a.x - a.tz * b.lat; p.z = a.z + a.tx * b.lat; p.ry = Math.atan2(a.tx, a.tz) - Math.atan2(b.lat - lat0, Math.max(0.5, b.v * dt)) * 0.6; p.y = 0; p.fl = b.tb > 0 ? 3 : 0;
  }
  // İnsan oyuncunun konumundan ilerleme (sıçrama ve ışınlanma sayılmaz)
  function carSeen(r, p, x, z) {
    if (!r.car) return; const T = r.car.t; const pr = C.project(T, x, z, p.ci ?? -1);
    let d = pr.s - (((p.prog || 0) % T.L) + T.L) % T.L; if (d > T.L / 2) d -= T.L; if (d < -T.L / 2) d += T.L;
    if (Math.abs(d) < 9) p.prog = (p.prog || 0) + d; p.ci = pr.i;
  }
  function carTick(r) {
    const T = r.car.t; const goal = C.CAR.laps * T.L;
    for (const p of alive(r)) if (!p.done && p.prog >= goal) {
      p.done = r.st.fin.length + 1; r.st.fin.push(r.players.indexOf(p)); cast(r, 'k3:ev', { t: 'cfin', i: r.players.indexOf(p), n: p.done });
      if (r.st.fin.length >= r.keep) { drop(r, alive(r).filter((q) => !q.done)); return endRound(r); }
    }
  }
  function carTimeUp(r) { const al = alive(r).sort((a, b) => (a.done || 99) - (b.done || 99) || (b.prog || 0) - (a.prog || 0)); drop(r, al.slice(r.keep)); endRound(r); }

  // ---- Gemi Savaşı ----
  function fire(r, p, x, z, ry) {
    const n = now(); if (n - (p.fcd || 0) < C.SHIP.cd * 900 || !p.alive) return; p.fcd = n; const i = r.players.indexOf(p); const out = [];
    for (const s of [1, -1]) { const dx = Math.cos(ry) * s; const dz = -Math.sin(ry) * s; const b = { id: ++r.sea.id, x: x + dx * 1.1, z: z + dz * 1.1, dx, dz, by: i, d: 0 }; r.sea.balls.push(b); out.push([b.id, r2(b.x), r2(b.z), r2(dx), r2(dz)]); }
    cast(r, 'k3:ev', { t: 'fire', i, b: out });
  }
  function hurt(r, p, by, id) {
    p.hp = Math.max(0, p.hp - 1); const i = r.players.indexOf(p); r.st.hp[i] = p.hp;
    cast(r, 'k3:ev', { t: 'shit', i, hp: p.hp, by, id, x: r2(p.x), z: r2(p.z) });
    if (p.hp <= 0) { cast(r, 'k3:ev', { t: 'sink', i, x: r2(p.x), z: r2(p.z), ry: r2(p.ry) }); elim(r, p); }
  }
  function botShip(r, p, b, t, dt) {
    if (t < 0) return; const S = C.SHIP; const R = C.stormR(t); const isl = r.sea.isl; const n = now();
    const foes = alive(r).filter((q) => q !== p); let tg = null; let td = 1e9; for (const q of foes) { const d = Math.hypot(q.x - p.x, q.z - p.z) - (q.hp || 3) * 1.5; if (d < td) { td = d; tg = q; } }
    let want = b.ry; const rc = Math.hypot(p.x, p.z);
    if (rc > R - 5) want = Math.atan2(-p.x, -p.z) + 0.5 * b.dir; // fırtınadan kaç
    else if (tg) {
      const d = Math.hypot(tg.x - p.x, tg.z - p.z); const brg = Math.atan2(tg.x - p.x, tg.z - p.z);
      if (d > 11) want = brg + 0.25 * Math.sin(t * 0.7 + b.wob);
      else if (d < 4.5) want = brg + Math.PI - 0.7 * b.dir;
      else { const a1 = brg + Math.PI / 2; const a2 = brg - Math.PI / 2; want = Math.abs(wrapA(a1 - b.ry)) < Math.abs(wrapA(a2 - b.ry)) ? a1 : a2; } // bordayı döndür
      if (n >= b.turnAt) { b.turnAt = n + rnd(5000, 9000); b.dir = -b.dir; }
    }
    const lx = p.x + Math.sin(b.ry) * 5; const lz = p.z + Math.cos(b.ry) * 5; // ileride ada var mı?
    for (const [x, z, rr] of isl) if (Math.hypot(lx - x, lz - z) < rr + 2.2) { const away = Math.atan2(p.x - x, p.z - z); want = away + (wrapA(away - b.ry) > 0 ? 0.9 : -0.9); break; }
    if (Math.abs(p.x) > S.A - 4 || Math.abs(p.z) > S.A - 4) want = Math.atan2(-p.x, -p.z);
    const tr = S.turn * 0.9 * dt; const d = wrapA(want - b.ry); b.ry += Math.max(-tr, Math.min(tr, d));
    b.v += (S.sp * 0.82 - b.v) * Math.min(1, dt * 1.4);
    p.x += Math.sin(b.ry) * b.v * dt; p.z += Math.cos(b.ry) * b.v * dt;
    for (const [x, z, rr] of isl) { const dx = p.x - x; const dz = p.z - z; const dd = Math.hypot(dx, dz); if (dd < rr + 1 && dd > 1e-4) { p.x = x + (dx / dd) * (rr + 1); p.z = z + (dz / dd) * (rr + 1); } }
    p.x = Math.max(-S.A + 1, Math.min(S.A - 1, p.x)); p.z = Math.max(-S.A + 1, Math.min(S.A - 1, p.z)); p.ry = b.ry; p.y = 0; p.fl = 0;
    if (tg && n >= b.next) { // borda hizasındaysa ateş
      const d = Math.hypot(tg.x - p.x, tg.z - p.z); const ux = (tg.x - p.x) / (d || 1); const uz = (tg.z - p.z) / (d || 1); const side = Math.abs(ux * Math.cos(b.ry) - uz * Math.sin(b.ry));
      if (d < S.range - 1.5 && side > 0.93 - (1 - b.sk) * 0.12) { fire(r, p, p.x, p.z, b.ry + rnd(-0.22, 0.22) * (1.15 - b.sk)); b.next = n + S.cd * 1000 * rnd(1.4, 2.6); }
    }
  }
  function seaTick(r, t, dt) {
    const S = C.SHIP; const isl = r.sea.isl; const step = S.ball * dt;
    r.sea.balls = r.sea.balls.filter((b) => {
      const ax = b.x; const az = b.z; b.x += b.dx * step; b.z += b.dz * step; b.d += step;
      if (isl.some(([x, z, rr]) => C.segHit(ax, az, b.x, b.z, x, z, rr * 0.85))) return false;
      for (const q of alive(r)) { if (r.players.indexOf(q) === b.by) continue; if (C.segHit(ax, az, b.x, b.z, q.x, q.z, S.hit)) { hurt(r, q, b.by, b.id); return false; } }
      return b.d < S.range;
    });
    if (r.phase !== 'play') return;
    const R = C.stormR(t); const n = now();
    for (const p of alive(r)) if (Math.hypot(p.x, p.z) > R + 0.6 && n - (p.sd || 0) > S.storm.every * 1000) { p.sd = n; hurt(r, p, -1, 0); if (r.phase !== 'play') return; }
  }
  function seaTimeUp(r) { const al = alive(r).sort((a, b) => (b.hp || 0) - (a.hp || 0) || Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z)); drop(r, al.slice(r.keep)); endRound(r); }

  return {
    ready, ok, isVeh, setup, conf, carSeen, fire,
    bot: { araba: botCar, gemi: botShip },
    tick: { araba: (r) => carTick(r), gemi: (r, t, dt) => seaTick(r, t, dt) },
    timeUp: { araba: carTimeUp, gemi: seaTimeUp },
  };
};
