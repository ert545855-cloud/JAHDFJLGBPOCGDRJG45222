// Parti Kupası araç modları (istemci): Araba Yarışı (Car Kit arabaları, kovalayan kamera) ve Gemi Savaşı (korsan gemileri, yukarıdan bakış).
// Kendi aracın cihazında sürülür; botlar, gülleler, isabetler ve elemeler sunucudan gelir. Ortak hesaplar: k3veh-core.mjs
import { CAR, carTrack, project, atS, carStep, SHIP, stormR, shipStep, segHit } from './k3veh-core.mjs';

const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
// Lokum rengine göre araba (Car Kit) ve gemi yelkeni (1 beyaz, 2 siyah, 3 kırmızı, 4 yeşil, 5 mavi, 6 sarı)
const CAR_OF = { gul: ['sedan-sports', 'kart-oopi'], nar: ['sedan-sports', 'race'], limon: ['taxi', 'kart-oozi'], altin: ['suv-luxury', 'taxi'], fistik: ['hatchback-sports', 'kart-oozi'], nane: ['hatchback-sports', 'race-future'],
  portakal: ['race', 'sedan-sports'], bogurtlen: ['kart-oopi', 'race-future'], lavanta: ['kart-oopi', 'kart-oobi'], deniz: ['kart-oobi', 'race-future'], gece: ['police', 'race-future'], cikolata: ['suv-luxury', 'police'] };
const CAR_ALL = ['sedan-sports', 'hatchback-sports', 'taxi', 'police', 'race', 'race-future', 'kart-oopi', 'kart-oobi', 'kart-oozi', 'suv-luxury'];
const SAIL_OF = { gul: [3, 1], nar: [3, 2], limon: [6, 1], altin: [6, 3], fistik: [4, 6], nane: [4, 5], portakal: [6, 3], bogurtlen: [2, 5], lavanta: [5, 1], deniz: [5, 4], gece: [2, 5], cikolata: [1, 2] };
const PX = 0.034; // korsan çizimlerinde 1 piksel = 3,4 cm (gemi ~3,8 m)
const RO = { sea: 0, isle: 2, wake: 3, ring: 4, ship: 5, ball: 6, fx: 7, storm: 8 }; // saydam katmanların çizim sırası
const b64 = (s) => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };

export function makeVeh(T, K) { // K: { scene, emit, sfx, feel, buzz, banner, feed, puff, srv }
  const st = { mode: null, c: null, trk: null, arena: null, balls: [], wakes: null, wk: [], wn: 0, fx: [], storm: null, camF: [0, -1], prog: new Map(), fin: [], cars: null, carMat: null, sea: null, seaTex: null, rects: null, shipTex: null, adaTex: null, tAt: 0, fireAt: 0 };
  const lam = (c, o = {}) => new T.MeshLambertMaterial({ color: c, ...o });
  const basic = (o = {}) => new T.MeshBasicMaterial(o);
  const is = (m) => m === 'araba' || m === 'gemi';
  const at = (o, x, y, z, rx = 0) => { o.position.set(x, y, z); o.rotation.x = rx; return o; };
  let shadowTex = null; const shadowMat = () => { if (!shadowTex) { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 4, 32, 32, 31); gr.addColorStop(0, 'rgba(0,0,0,.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); shadowTex = new T.CanvasTexture(c); } return basic({ map: shadowTex, transparent: true, depthWrite: false }); };
  let loading = null; let loadingS = null;

  // ---- Varlıklar ----
  function loadCars() {
    if (!loading) loading = (async () => {
      const [pack, tex] = await Promise.all([fetch('/kupa/araclar.json').then((r) => r.json()), new T.TextureLoader().loadAsync('/kupa/arac-doku.png')]);
      tex.flipY = false; tex.colorSpace = T.SRGBColorSpace; tex.magFilter = T.NearestFilter; st.carMat = new T.MeshLambertMaterial({ map: tex });
      const geo = (g, S) => { const G = new T.BufferGeometry(); const p = new Int16Array(b64(g.p)); const n = new Int8Array(b64(g.n)); const u = new Uint16Array(b64(g.u)); const P = new Float32Array(p.length); const N = new Float32Array(n.length); const U = new Float32Array(u.length);
        for (let i = 0; i < p.length; i++) P[i] = (p[i] / 32767) * S; for (let i = 0; i < n.length; i++) N[i] = n[i] / 127; for (let i = 0; i < u.length; i++) U[i] = u[i] / 65535;
        G.setAttribute('position', new T.BufferAttribute(P, 3)); G.setAttribute('normal', new T.BufferAttribute(N, 3)); G.setAttribute('uv', new T.BufferAttribute(U, 2)); G.setIndex(new T.BufferAttribute(new Uint16Array(b64(g.i)), 1)); G.computeBoundingSphere(); return G; };
      st.cars = {}; st.props = {};
      for (const [k, c] of Object.entries(pack.cars)) { const wg = (c.wg || []).map((g) => geo(g, c.s)); st.cars[k] = { body: geo(c.body, c.s), wheels: (c.wheels || []).map((w) => ({ c: w.c, f: w.f, g: wg[w.g] })), len: c.len, sc: clamp(3.3 / c.len, 1.15, 1.65) }; }
      for (const [k, c] of Object.entries(pack.props)) st.props[k] = geo(c.body, c.s);
    })();
    return loading;
  }
  function loadSea() {
    if (!loadingS) loadingS = (async () => {
      const L = new T.TextureLoader(); const [j, a, b] = await Promise.all([fetch('/kupa/korsan.json').then((r) => r.json()), L.loadAsync('/kupa/korsan.png'), L.loadAsync('/kupa/ada.png')]);
      [a, b].forEach((t) => { t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; }); st.rects = j.r; st.shipTex = a; st.adaTex = b;
    })();
    return loadingS;
  }
  const preload = (m) => (m === 'araba' ? loadCars() : m === 'gemi' ? loadSea() : Promise.resolve());
  const ready = (m) => (m === 'araba' ? !!st.cars : m === 'gemi' ? !!st.rects : false);
  // Atlas parçası: düz yatan dikdörtgen (görüntünün üstü -z yönüne bakar)
  function sprite(tex, W, H, r, w, h, mat) {
    const g = new T.PlaneGeometry(w, h); setUV(g, W, H, r);
    const m = new T.Mesh(g, mat || basic({ map: tex, transparent: true, alphaTest: 0.35, depthWrite: false })); m.rotation.x = -Math.PI / 2; return m;
  }
  function setUV(g, W, H, [x, y, w, h]) { const u0 = x / W; const u1 = (x + w) / W; const v0 = 1 - (y + h) / H; const v1 = 1 - y / H; const uv = g.attributes.uv; uv.setXY(0, u0, v1); uv.setXY(1, u1, v1); uv.setXY(2, u0, v0); uv.setXY(3, u1, v0); uv.needsUpdate = true; }
  const R = (name) => st.rects[name];
  const WD = new T.Object3D(); WD.rotation.x = -Math.PI / 2;

  // ---- Sahne ----
  function bounds(m, c) {
    if (m === 'araba') { const b = carTrack(c.tk).box; return { cx: (b.minx + b.maxx) / 2, cz: (b.minz + b.maxz) / 2, rx: (b.maxx - b.minx) / 2 + 16, rz: (b.maxz - b.minz) / 2 + 16 }; }
    return { cx: 0, cz: 0, rx: c.A + 10, rz: c.A + 10 };
  }
  function build(m, arena, c) {
    st.mode = m; st.c = c; st.arena = arena; st.balls = []; st.fx = []; st.fin = []; st.prog.clear(); st.wk = []; st.storm = null; st.sea = null; st.tAt = 0;
    if (m === 'araba') buildTrack(arena, c); else buildSea(arena, c);
  }
  function buildTrack(arena, c) {
    const t = carTrack(c.tk); st.trk = t; const { N, x, z, tx, tz, W } = t; const b = t.box; const d = new T.Object3D();
    const cx = (b.minx + b.maxx) / 2; const cz = (b.minz + b.maxz) / 2; const gw = b.maxx - b.minx + 30; const gd = b.maxz - b.minz + 30;
    arena.add(at(new T.Mesh(new T.BoxGeometry(gw, 2.4, gd), lam(0x8fdc7a)), cx, -1.21, cz));
    arena.add(at(new T.Mesh(new T.BoxGeometry(gw + 1.2, 2.2, gd + 1.2), lam(0xf4dba8)), cx, -1.45, cz)); // kum kenar
    const ribbon = (o0, o1, y, mat) => { // orta çizgiye paralel şerit (o: sola uzaklık)
      const P = new Float32Array((N + 1) * 6); const I = []; for (let k = 0; k <= N; k++) { const i = k % N; const nx = -tz[i]; const nz = tx[i]; P.set([x[i] + nx * o0, y, z[i] + nz * o0, x[i] + nx * o1, y, z[i] + nz * o1], k * 6); if (k < N) { const a = k * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
      const G = new T.BufferGeometry(); G.setAttribute('position', new T.BufferAttribute(P, 3)); G.setIndex(I); G.computeVertexNormals(); const mm = new T.Mesh(G, mat); arena.add(mm); return mm; };
    const dash = new T.PlaneGeometry(0.22, 3); const dashMat = basic({ color: 0xfff1a8 });
    const fixUp = (mm) => { const n = mm.geometry.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0); return mm; };
    fixUp(ribbon(-W / 2 - 0.6, W / 2 + 0.6, 0.015, lam(0x6a6f84)));
    [W / 2 - 0.45, -W / 2 + 0.2].forEach((o) => fixUp(ribbon(o, o + 0.25, 0.03, basic({ color: 0xfffaf2 }))));
    for (let i = 0; i < N; i += 8) { const m = new T.Mesh(dash, dashMat); m.position.set(x[i], 0.028, z[i]); m.rotation.set(-Math.PI / 2, 0, -Math.atan2(tx[i], tz[i])); arena.add(m); } // orta kesik çizgi
    // virajlarda dış kenara kırmızı-beyaz bordür
    const curbs = []; for (let i = 0; i < N; i += 2) { if (Math.abs(t.cv[i]) < 1 / 30) continue; const sg = t.cv[i] > 0 ? -1 : 1; const o = sg * (W / 2 + 0.35); curbs.push({ x: x[i] - tz[i] * o, z: z[i] + tx[i] * o, ry: Math.atan2(tx[i], tz[i]), c: (i / 2) % 2 ? 0xe23e3e : 0xffffff }); }
    if (curbs.length) { const im = new T.InstancedMesh(new T.BoxGeometry(0.8, 0.1, 2.05), lam(0xffffff), curbs.length); curbs.forEach((q, k) => { d.position.set(q.x, 0.04, q.z); d.rotation.set(0, q.ry, 0); d.updateMatrix(); im.setMatrixAt(k, d.matrix); im.setColorAt(k, new T.Color(q.c)); }); arena.add(im); }
    // bariyer: iki yanda alçak, renkli bloklar
    const wall = []; const wo = W / 2 + CAR.wall + 0.5; for (let i = 0; i < N; i += 2) for (const sg of [1, -1]) wall.push({ x: x[i] - tz[i] * sg * wo, z: z[i] + tx[i] * sg * wo, ry: Math.atan2(tx[i], tz[i]), c: Math.floor(i / 4) % 2 ? 0xff6fa5 : 0xfff1dc });
    const wim = new T.InstancedMesh(new T.BoxGeometry(0.7, 0.75, 2.1), lam(0xffffff), wall.length); wall.forEach((q, k) => { d.position.set(q.x, 0.37, q.z); d.rotation.set(0, q.ry, 0); d.updateMatrix(); wim.setMatrixAt(k, d.matrix); wim.setColorAt(k, new T.Color(q.c)); }); arena.add(wim);
    // başlangıç çizgisi ve kapı
    const sx = x[0]; const sz = z[0]; const ry0 = Math.atan2(tx[0], tz[0]); const chk = new T.InstancedMesh(new T.BoxGeometry(W / 10, 0.02, 0.6), lam(0xffffff), 20);
    for (let k = 0; k < 20; k++) { const col = k % 10; const row = Math.floor(k / 10); const o = -W / 2 + (col + 0.5) * (W / 10); d.position.set(sx - tz[0] * o + tx[0] * (row - 0.5) * 0.6, 0.035, sz + tx[0] * o + tz[0] * (row - 0.5) * 0.6); d.rotation.set(0, ry0, 0); d.updateMatrix(); chk.setMatrixAt(k, d.matrix); chk.setColorAt(k, new T.Color((col + row) % 2 ? 0x22222c : 0xffffff)); } arena.add(chk);
    const gate = new T.Group(); gate.position.set(sx, 0, sz); gate.rotation.y = ry0; const post = lam(0x8a63d2);
    [-1, 1].forEach((sg) => gate.add(at(new T.Mesh(new T.CylinderGeometry(0.3, 0.35, 6, 12), post), sg * (W / 2 + 1.2), 3, 0)));
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 96; const g2 = cv.getContext('2d'); g2.fillStyle = '#ff4f9a'; g2.fillRect(0, 0, 512, 96); g2.fillStyle = '#fff'; g2.font = '800 54px system-ui, sans-serif'; g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.fillText('BAŞLANGIÇ', 256, 50);
    const ban = new T.Mesh(new T.BoxGeometry(W + 3.4, 1.3, 0.3), [lam(0xff4f9a), lam(0xff4f9a), lam(0xff4f9a), lam(0xff4f9a), lam(0xffffff, { map: new T.CanvasTexture(cv) }), lam(0xffffff, { map: new T.CanvasTexture(cv) })]); ban.position.y = 6; gate.add(ban); arena.add(gate);
    // ağaçlar, koniler, kasalar: pistin dışında kalır
    const R0 = (() => { let a = (c.tk + 1) * 9301; return () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; }; })(); const trees = []; const props = [];
    const far = (px, pz, m) => project(t, px, pz).lat; for (let k = 0; k < 140 && trees.length < 46; k++) { const px = b.minx - 10 + R0() * (gw - 10); const pz = b.minz - 10 + R0() * (gd - 10); if (Math.abs(far(px, pz)) > W / 2 + CAR.wall + 3) trees.push([px, pz, 0.8 + R0() * 0.7, R0()]); }
    for (let i = 0; i < N; i += 9) { if (Math.abs(t.cv[i]) < 1 / 22) continue; const sg = t.cv[i] > 0 ? 1 : -1; const o = sg * (W / 2 + CAR.wall + 1.8); props.push([x[i] - tz[i] * o, z[i] + tx[i] * o, Math.atan2(tx[i], tz[i])]); }
    const trunk = new T.InstancedMesh(new T.CylinderGeometry(0.22, 0.3, 1.4, 6), lam(0x9b6b43), trees.length); const crown = new T.InstancedMesh(new T.ConeGeometry(1.4, 3, 7), lam(0xffffff), trees.length); const LEAF = [0x3fae5a, 0x57c26b, 0x2f9a52, 0x7bd66f, 0xff9ec4];
    trees.forEach(([px, pz, s, cc], k) => { d.rotation.set(0, cc * 6, 0); d.scale.setScalar(s); d.position.set(px, 0.7 * s, pz); d.updateMatrix(); trunk.setMatrixAt(k, d.matrix); d.position.set(px, 2.6 * s, pz); d.updateMatrix(); crown.setMatrixAt(k, d.matrix); crown.setColorAt(k, new T.Color(LEAF[Math.floor(cc * LEAF.length)])); d.scale.setScalar(1); });
    arena.add(trunk, crown);
    st.propSpots = props; st.propGroup = new T.Group(); arena.add(st.propGroup); addProps();
  }
  function addProps() { // koni ve kasalar paket yüklenince eklenir
    if (!st.cars || !st.propGroup || st.propGroup.children.length || st.mode !== 'araba') return;
    st.propSpots.forEach(([px, pz, ry], k) => { const m = new T.Mesh(k % 3 ? st.props.cone : st.props.box, st.carMat); m.position.set(px, 0, pz); m.rotation.y = ry + k; m.scale.setScalar(k % 3 ? 1.6 : 1.3); st.propGroup.add(m); });
  }
  function buildSea(arena, c) {
    st.sea = { isl: c.isl }; const A = c.A;
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256; const g = cv.getContext('2d'); g.fillStyle = '#62c6ee'; g.fillRect(0, 0, 256, 256);
    let a = 7; const r = () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 3; g.lineCap = 'round';
    for (let k = 0; k < 26; k++) { const x0 = r() * 256; const y0 = r() * 256; const w = 14 + r() * 22; g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(x0 + w / 2, y0 - 5, x0 + w, y0); g.stroke(); }
    const tex = new T.CanvasTexture(cv); tex.wrapS = tex.wrapT = T.RepeatWrapping; tex.repeat.set(26, 26); tex.colorSpace = T.SRGBColorSpace; st.seaTex = tex;
    const sea = new T.Mesh(new T.PlaneGeometry(320, 320), basic({ map: tex })); sea.rotation.x = -Math.PI / 2; sea.renderOrder = RO.sea; arena.add(sea);
    const shallow = new T.Mesh(new T.PlaneGeometry(A * 2, A * 2), basic({ color: 0x9fe3f7, transparent: true, opacity: 0.35, depthWrite: false })); shallow.rotation.x = -Math.PI / 2; shallow.position.y = 0.005; shallow.renderOrder = 1; arena.add(shallow);
    // sınır şamandıraları
    const bu = []; for (let k = -A; k <= A; k += 4) bu.push([k, -A], [k, A], [-A, k], [A, k]); const bim = new T.InstancedMesh(new T.CylinderGeometry(0.28, 0.34, 0.5, 10), lam(0xffffff), bu.length); const d = new T.Object3D();
    bu.forEach(([px, pz], k) => { d.position.set(px, 0.2, pz); d.updateMatrix(); bim.setMatrixAt(k, d.matrix); bim.setColorAt(k, new T.Color(k % 2 ? 0xff4f6d : 0xffffff)); }); arena.add(bim);
    // fırtına halkası: dışı koyu, kenarı beyaz
    const sg = new T.Group(); sg.add(at(new T.Mesh(new T.RingGeometry(1, 9, 96), basic({ color: 0x24305a, transparent: true, opacity: 0.5, depthWrite: false })), 0, 0, 0, -Math.PI / 2));
    sg.add(at(new T.Mesh(new T.RingGeometry(0.985, 1.0, 96), basic({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false })), 0, 0.001, 0, -Math.PI / 2)); sg.position.y = 0.09; sg.children.forEach((o) => { o.renderOrder = RO.storm; }); arena.add(sg); st.storm = sg;
    st.isleGroup = new T.Group(); arena.add(st.isleGroup); addIsles();
    // dümen suyu: tek çizimde 140 köpük
    const wk = new T.InstancedMesh(new T.CircleGeometry(0.5, 10), basic({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false }), 140); wk.renderOrder = RO.wake; wk.frustumCulled = false; const z0 = new T.Object3D(); z0.scale.setScalar(0); z0.updateMatrix(); for (let k = 0; k < 140; k++) wk.setMatrixAt(k, z0.matrix); arena.add(wk); st.wakes = wk; st.wk = Array.from({ length: 140 }, () => null); st.wn = 0;
  }
  function addIsles() {
    if (!st.adaTex || !st.isleGroup || st.isleGroup.children.length || st.mode !== 'gemi') return; const AW = 1024; const AH = 384;
    const BIG = [320, 0, 256, 256]; const SAND = [0, 0, 192, 192]; const ROCKS = [[0, 192, 64, 64], [64, 192, 64, 64], [128, 192, 64, 64], [0, 256, 64, 64], [64, 256, 64, 64], [128, 256, 64, 64]]; const PALMS = [[320, 256, 64, 64], [384, 256, 64, 64], [448, 256, 64, 64]];
    const mat = basic({ map: st.adaTex, transparent: true, alphaTest: 0.3, depthWrite: false });
    st.sea.isl.forEach(([x, z, r, kind, rot], k) => {
      const rect = kind === 0 ? BIG : kind === 1 ? SAND : ROCKS[k % ROCKS.length]; const size = kind === 2 ? r * 2.5 : (r * 2) / 0.8;
      const m = sprite(st.adaTex, AW, AH, rect, size, size, mat); m.position.set(x, 0.02 + k * 0.001, z); m.rotation.z = (rot * Math.PI) / 2; m.renderOrder = RO.isle; st.isleGroup.add(m);
      if (kind === 0) for (let p = 0; p < 2; p++) { const pm = sprite(st.adaTex, AW, AH, PALMS[(k + p) % 3], 2.6, 2.6, mat); pm.position.set(x + (p ? 1.6 : -1.3), 0.06, z + (p ? -1.1 : 1.4)); pm.renderOrder = RO.isle + 0.5; st.isleGroup.add(pm); }
    });
  }

  // ---- Araçlar (karakterlerin yerine) ----
  function carModel(name) {
    const tp = st.cars[name] || st.cars['sedan-sports']; const g = new T.Group(); const body = new T.Mesh(tp.body, st.carMat); g.add(body); const wheels = [];
    tp.wheels.forEach((w) => { const piv = new T.Group(); piv.position.set(w.c[0], w.c[1], w.c[2]); const m = new T.Mesh(w.g, st.carMat); piv.add(m); g.add(piv); wheels.push({ piv, m, f: w.f, r: Math.max(0.15, w.c[1]) }); });
    g.scale.setScalar(tp.sc); const sh = new T.Mesh(new T.PlaneGeometry(1.9, tp.len + 0.9), shadowMat()); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.025; g.add(sh);
    const fl = new T.Mesh(new T.ConeGeometry(0.13, 0.6, 10), basic({ color: 0xffb030, transparent: true, opacity: 0.9 })); fl.rotation.x = -Math.PI / 2; fl.position.set(0, 0.3, -tp.len / 2 - 0.25); fl.visible = false; g.add(fl);
    return { g, wheels, fl, sc: tp.sc };
  }
  function shipModel(col) {
    const W = 1024; const H = 512; const r = R(`ship${col}`); const m = sprite(st.shipTex, W, H, r, r[2] * PX, r[3] * PX); m.position.y = 0.08; m.renderOrder = RO.ship;
    const ring = new T.Mesh(new T.RingGeometry(1.75, 1.95, 32), basic({ color: 0xffd45e, transparent: true, opacity: 0.85, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; ring.visible = false; ring.renderOrder = RO.ring;
    const fire = sprite(st.shipTex, W, H, R('fire1'), 0.75, 0.75); fire.position.set(0.35, 0.2, -0.6); fire.visible = false; fire.renderOrder = RO.ship + 0.5;
    const g = new T.Group(); g.add(m, ring, fire); return { g, spr: m, ring, fire, col, hp: -1 };
  }
  function shipLook(o, hp) { // hasar: 3 sağlam, 2 ve 1 hasarlı, 0 enkaz
    if (o.hp === hp) return; o.hp = hp; const k = hp >= 3 ? 0 : hp === 2 ? 6 : hp === 1 ? 12 : 18; setUV(o.spr.geometry, 1024, 512, R(`ship${o.col + k}`)); o.fire.visible = hp === 1;
  }
  function pickFor(players, want) { // her oyuncuya rengine en yakın, mümkünse farklı araç
    const used = new Set(); return players.map((p) => {
      if (want === 'gemi') { const pref = SAIL_OF[p.look?.color] || [1, 2]; const c = pref.find((x) => !used.has(x)) || [1, 2, 3, 4, 5, 6].find((x) => !used.has(x)) || pref[0]; used.add(c); return c; }
      const pref = CAR_OF[p.look?.color] || []; const c = pref.find((x) => !used.has(x)) || CAR_ALL.find((x) => !used.has(x)) || CAR_ALL[0]; used.add(c); return c;
    });
  }
  let dressKey = '';
  function dress(m, chars, players, me) { // karakterleri araçla değiştir (araç modu değilse geri al)
    const want = is(m) && ready(m) ? m : null; const key = `${want}|${[...chars.values()].map((c) => c.g.uuid).join(',')}|${players.map((p) => p.look?.color).join(',')}`; if (key === dressKey) return; dressKey = key;
    const picks = want ? pickFor(players, want) : [];
    chars.forEach((c, i) => {
      if (c.veh) { c.g.remove(c.veh.g); c.veh = null; }
      const on = !!want; c.body.visible = !on; c.feet.forEach((f) => { f.visible = !on; }); if (c.trail0 === undefined) c.trail0 = c.trail; c.trail = on ? null : c.trail0;
      if (!on) return; c.veh = want === 'araba' ? carModel(picks[i]) : shipModel(picks[i]); c.g.add(c.veh.g); if (want === 'gemi') { c.veh.ring.visible = i === me; shipLook(c.veh, 3); }
    });
    if (want === 'araba') addProps(); if (want === 'gemi') addIsles();
  }

  // ---- Tur başı: kendi aracım ----
  function place(me, c, at) {
    if (st.mode === 'araba') { const t = st.trk; const pr = project(t, me.x, me.z); me.car = { x: me.x, z: me.z, ry: Math.atan2(t.tx[pr.i], t.tz[pr.i]), v: 0, st: 0, ci: pr.i, prog: pr.s > t.L / 2 ? pr.s - t.L : pr.s, turbo: 0, tcd: 2, hit: 0, done: 0 }; me.ry = me.car.ry; st.camF = [Math.sin(me.ry), Math.cos(me.ry)]; }
    else { me.ship = { x: me.x, z: me.z, ry: at ? me.ry : Math.atan2(-me.x, -me.z) + 0.8, v: 1.5 }; me.ry = me.ship.ry; me.hp = SHIP.hp; st.camF = [0, -1]; }
    me.ground = true; me.y = 0;
  }
  // Tur başında herkes doğru yöne baksın: sunucu tur başlayana dek konum göndermez, yön de dizilişten hesaplanır
  function spawnProg(chars, spawn) {
    const t = st.trk; Object.entries(spawn || {}).forEach(([i, p]) => { let ry;
      if (st.mode === 'araba') { const pr = project(t, p[0], p[2]); st.prog.set(+i, { p: pr.s > t.L / 2 ? pr.s - t.L : pr.s, ci: pr.i }); ry = Math.atan2(t.tx[pr.i], t.tz[pr.i]); }
      else ry = Math.atan2(-p[0], -p[2]) + 0.8;
      const ch = chars.get(+i); if (ch) { ch.t[3] = ry; ch.g.rotation.y = ry; } });
  }

  // ---- Sürüş ----
  function autoCar(c, sk = 1) { const t = st.trk; const pr = project(t, c.x, c.z, c.ci); const a = atS(t, pr.s + 7 + Math.max(0, c.v) * 0.35); const w = wrapA(Math.atan2(a.x - c.x, a.z - c.z) - c.ry); return { x: clamp(-w * 2.2, -1, 1), gas: c.v > t.sp[(pr.i + 6) % t.N] * sk + 1 ? -1 : 1 }; }
  function step(me, inp, act, dt, t, nowMs, chars, v) {
    if (st.mode === 'araba') {
      const c = me.car; if (!c) return; let ip = c.done ? { ...autoCar(c, 0.55) } : { x: clamp(inp.x, -1, 1), gas: inp.z > 0.55 ? -1 : 1 };
      if (inp.auto) ip = autoCar(c);
      if (act && !c.done && c.tcd <= 0 && t > 0) { c.turbo = CAR.tlen; c.tcd = CAR.tcd; K.sfx.play('dash'); K.feel(0.12, 30); }
      carStep(c, st.trk, ip, dt);
      if (c.hit > 0.4) { K.feel(0.18, 25, 'bump', Math.min(1, c.hit)); c.hit = 0; } else c.hit = 0;
      chars.forEach((ch, i) => { if (i === v.me || !ch.g.visible || !v.players[i]?.alive) return; const p = ch.g.position; const dx = c.x - p.x; const dz = c.z - p.z; const d = Math.hypot(dx, dz); const lim = CAR.r * 2;
        if (d < lim && d > 1e-3) { c.x = p.x + (dx / d) * lim; c.z = p.z + (dz / d) * lim; const into = -(Math.sin(c.ry) * dx + Math.cos(c.ry) * dz) / d; if (into > 0.3) { c.v *= 0.9; if (nowMs - (st.bumpAt || 0) > 400) { st.bumpAt = nowMs; K.feel(0.12, 15, 'bump', 0.7); } } } });
      Object.assign(me, { x: c.x, z: c.z, y: 0, ry: c.ry, vx: Math.sin(c.ry) * c.v, vz: Math.cos(c.ry) * c.v, ground: true, dfl: c.turbo > 0 ? 0.1 : 0 });
      st.prog.set(v.me, { p: c.prog, ci: c.ci });
      if (!c.done && c.prog >= CAR.laps * st.trk.L && !c.sentFin) { c.sentFin = 1; }
    } else if (st.mode === 'gemi') {
      const s = me.ship; if (!s) return; let wx = inp.x; let wz = inp.z; if (inp.auto) [wx, wz] = autoShip(s, v, chars, t);
      shipStep(s, st.sea.isl, wx, wz, dt);
      chars.forEach((ch, i) => { if (i === v.me || !ch.g.visible || !v.players[i]?.alive) return; const p = ch.g.position; const dx = s.x - p.x; const dz = s.z - p.z; const d = Math.hypot(dx, dz); if (d < 2.3 && d > 1e-3) { s.x = p.x + (dx / d) * 2.3; s.z = p.z + (dz / d) * 2.3; s.v *= 0.97; } });
      if ((act || inp.fire) && t > 0 && nowMs - st.fireAt > SHIP.cd * 1000) { st.fireAt = nowMs; K.emit('k3:fire', [+s.x.toFixed(2), +s.z.toFixed(2), +s.ry.toFixed(3)]); shoot(v.me, s.x, s.z, s.ry, null); K.sfx.play('boom', 0.45, 120); K.feel(0.12, 20); }
      Object.assign(me, { x: s.x, z: s.z, y: 0, ry: s.ry, vx: Math.sin(s.ry) * s.v, vz: Math.cos(s.ry) * s.v, ground: true, dfl: 0 });
    }
  }
  function autoShip(s, v, chars, t) { // yalnızca yerel deneme
    let best = null; let bd = 1e9; chars.forEach((ch, i) => { if (i === v.me || !v.players[i]?.alive || !ch.g.visible) return; const d = Math.hypot(ch.g.position.x - s.x, ch.g.position.z - s.z); if (d < bd) { bd = d; best = ch.g.position; } });
    const Rr = stormR(t); if (Math.hypot(s.x, s.z) > Rr - 4 || !best) { const l = Math.hypot(s.x, s.z) || 1; return [-s.x / l, -s.z / l]; }
    const brg = Math.atan2(best.x - s.x, best.z - s.z); const a = bd > 10 ? brg : brg + Math.PI / 2; const side = Math.abs(Math.cos(brg - s.ry - Math.PI / 2)); if (side > 0.92 && bd < 13) st.autoFire = true; return [Math.sin(a), Math.cos(a)];
  }
  // Gülle/duman/patlama: her kare yeni nesne üretmemek için havuz (geometri parça başına bir kez, malzeme ağ başına bir kez)
  const gC = new Map(); const pool = []; let ballMat = null;
  const rgeo = (name) => { let g = gC.get(name); if (!g) { g = new T.PlaneGeometry(1, 1); setUV(g, 1024, 512, R(name)); gC.set(name, g); } return g; };
  function grab(name, size, shared) {
    const m = pool.pop() || new T.Mesh(rgeo(name), basic({ map: st.shipTex, transparent: true, alphaTest: 0.35, depthWrite: false }));
    if (!m.userData.own) { m.userData.own = m.material; m.rotation.x = -Math.PI / 2; }
    m.geometry = rgeo(name); m.material = shared || m.userData.own; m.material.map = st.shipTex; if (!shared) m.material.opacity = 1;
    m.userData.sz = size; m.scale.setScalar(size); st.arena.add(m); return m;
  }
  function drop(m) { m.parent?.remove(m); if (pool.length < 64) pool.push(m); }
  function shoot(i, x, z, ry, ids) { // iki bordadan gülle (görsel)
    if (!ballMat) ballMat = basic({ map: st.shipTex, transparent: true, alphaTest: 0.35, depthWrite: false });
    [1, -1].forEach((sg, k) => { const dx = Math.cos(ry) * sg; const dz = -Math.sin(ry) * sg; const m = grab('cannonBall', 0.5, ballMat); m.position.set(x + dx * 1.1, 0.3, z + dz * 1.1); m.renderOrder = RO.ball;
      st.balls.push({ id: ids ? ids[k] : `L${k}`, by: i, x: x + dx * 1.1, z: z + dz * 1.1, dx, dz, d: 0, m }); const sm = smoke(x + dx * 1.3, z + dz * 1.3); if (sm) st.fx.push(sm); });
  }
  function smoke(x, z) { if (!st.shipTex || st.fx.length > 40) return null; const m = grab('explosion3', 1.1); m.position.set(x, 0.35, z); m.renderOrder = RO.fx; return { m, t0: performance.now(), d: 380, s0: 0.6, s1: 1.4 }; }
  function blast(x, z, big) { if (!st.shipTex) return; const m = grab(big ? 'explosion1' : 'explosion2', big ? 3.2 : 2.1); m.position.set(x, 0.4, z); m.renderOrder = RO.fx; st.fx.push({ m, t0: performance.now(), d: big ? 900 : 520, s0: 0.5, s1: 1.3 }); }

  // ---- Diğer araçlar: son konum + hız ile tahmin, yumuşak geçiş ----
  function others(ch, i, dt, nowMs, players) {
    const p = ch.g.position; const age = clamp((performance.now() - ch.seen) / 1000, 0, 0.25); const k = Math.min(1, dt * 11);
    const px = ch.t[0] + (ch.v?.[0] || 0) * age; const pz = ch.t[2] + (ch.v?.[1] || 0) * age;
    if (Math.hypot(px - p.x, pz - p.z) > 12) { p.x = px; p.z = pz; } else { p.x += (px - p.x) * k; p.z += (pz - p.z) * k; } p.y = 0;
    const d = wrapA(ch.t[3] - ch.g.rotation.y); ch.g.rotation.y += d * k; ch.sh.visible = false;
    if (!players[i]?.alive && nowMs - ch.seen > (st.mode === 'gemi' ? 2600 : 900)) ch.g.visible = false;
    const sp = Math.hypot(ch.v?.[0] || 0, ch.v?.[1] || 0);
    if (ch.veh?.wheels) spin(ch.veh, sp, d * 3, dt); if (ch.veh?.fl) ch.veh.fl.visible = ch.fl === 3;
    if (st.mode === 'araba') { const o = st.prog.get(i) || { p: 0, ci: -1 }; const pr = project(st.trk, p.x, p.z, o.ci); let dd = pr.s - (((o.p % st.trk.L) + st.trk.L) % st.trk.L); if (dd > st.trk.L / 2) dd -= st.trk.L; if (dd < -st.trk.L / 2) dd += st.trk.L; if (Math.abs(dd) < 15) o.p += dd; o.ci = pr.i; st.prog.set(i, o); }
    return true;
  }
  function spin(o, sp, steer, dt) { o.wheels.forEach((w) => { w.m.rotation.x += (sp * dt) / (w.r * o.sc); if (w.f) w.piv.rotation.y = clamp(steer, -0.5, 0.5); }); }

  // ---- Her kare ----
  function frame(dt, t, nowMs, chars, v, me, playing) {
    if (!playing || !is(v.mode)) return;
    const mc = chars.get(v.me); if (mc) { mc.sh.visible = false; mc.g.position.y = 0; }
    if (st.mode === 'araba' && mc?.veh?.wheels && me.car) { spin(mc.veh, me.car.v, me.car.st * 0.45, dt); mc.veh.fl.visible = me.car.turbo > 0; }
    if (st.mode === 'gemi') {
      const tt = Math.max(0, t); st.seaTex.offset.set((nowMs / 60000) % 1, (nowMs / 90000) % 1);
      if (st.storm) { const Rr = stormR(tt); st.storm.scale.set(Rr, 1, Rr); }
      chars.forEach((ch, i) => { if (!ch.veh?.spr) return; const hp = i === v.me ? me.hp ?? 3 : v.st?.hp?.[i] ?? 3; shipLook(ch.veh, v.players[i]?.alive ? hp : 0); if (ch.veh.fire.visible) { const fk = Math.floor(nowMs / 140) % 2; if (ch.veh.fk !== fk) { ch.veh.fk = fk; setUV(ch.veh.fire.geometry, 1024, 512, R(fk ? 'fire1' : 'fire2')); } }
        // dümen suyu
        if (ch.g.visible && v.players[i]?.alive && nowMs - (ch.wkAt || 0) > 140) { ch.wkAt = nowMs; const ry = ch.g.rotation.y; st.wk[st.wn] = { x: ch.g.position.x - Math.sin(ry) * 1.6, z: ch.g.position.z - Math.cos(ry) * 1.6, t0: nowMs }; st.wn = (st.wn + 1) % st.wk.length; } });
      const d = WD; let dirty = false; st.wk.forEach((w, k) => { if (!w) return; dirty = true; const e = (nowMs - w.t0) / 1300; d.position.set(w.x, 0.03, w.z); d.scale.setScalar(e >= 1 ? 0 : 0.35 + e * 1.1); if (e >= 1) st.wk[k] = null; d.updateMatrix(); st.wakes.setMatrixAt(k, d.matrix); }); if (dirty) st.wakes.instanceMatrix.needsUpdate = true;
      const step = SHIP.ball * dt; st.balls = st.balls.filter((b) => { const ax = b.x; const az = b.z; b.x += b.dx * step; b.z += b.dz * step; b.d += step; b.m.position.set(b.x, 0.3 + Math.sin((b.d / SHIP.range) * Math.PI) * 0.6, b.z);
        const hitIsle = st.sea.isl.some(([x, z, r]) => segHit(ax, az, b.x, b.z, x, z, r * 0.85)); if (b.dead || hitIsle || b.d > SHIP.range) { drop(b.m); if (hitIsle || b.d > SHIP.range) { const s = smoke(b.x, b.z); if (s) st.fx.push(s); } return false; } return true; });
    }
    st.fx = st.fx.filter((f) => { const e = (nowMs - f.t0) / f.d; if (e >= 1) { drop(f.m); return false; } f.m.scale.setScalar((f.s0 + (f.s1 - f.s0) * e) * f.m.userData.sz); f.m.material.opacity = 1 - e * e; return true; });
  }

  // ---- Kamera ----
  function cam(me, inPlay, chars, v, dt) {
    if (st.mode === 'araba') {
      let tg = inPlay && me.car ? { x: me.car.x, z: me.car.z, ry: me.car.ry } : null;
      if (!tg) { let best = -1e9; chars.forEach((ch, i) => { if (!v.players[i]?.alive || !ch.g.visible) return; const p = st.prog.get(i)?.p ?? 0; if (p > best) { best = p; tg = { x: ch.g.position.x, z: ch.g.position.z, ry: ch.g.rotation.y }; } }); }
      if (!tg) tg = { x: 0, z: 0, ry: 0 };
      const k = Math.min(1, dt * 3.2); st.camF[0] += (Math.sin(tg.ry) - st.camF[0]) * k; st.camF[1] += (Math.cos(tg.ry) - st.camF[1]) * k; const l = Math.hypot(...st.camF) || 1;
      const f = [st.camF[0] / l, st.camF[1] / l]; return { tx: tg.x + f[0] * 3, ty: 0, tz: tg.z + f[1] * 3, oy: 4.6, oz: 9.2, f, ck: 12 };
    }
    let tx = 0; let tz = 0; let oy = 34; if (inPlay) { tx = me.x; tz = me.z; oy = 18; } else { let best = null; chars.forEach((ch, i) => { if (!best && v.players[i]?.alive && ch.g.visible) best = ch.g.position; }); if (best) { tx = best.x; tz = best.z; oy = 24; } }
    return { tx, ty: 0, tz, oy, oz: oy * 0.3, f: [0, -1] };
  }

  // ---- Arayüz ----
  const hearts = (n) => '❤️'.repeat(Math.max(0, n)) + '🤍'.repeat(Math.max(0, SHIP.hp - n));
  function rank(v) { let n = 1; const mine = st.prog.get(v.me)?.p ?? 0; v.players.forEach((p, i) => { if (i === v.me || !p.alive) return; if (st.fin.includes(i) || (st.prog.get(i)?.p ?? -1e9) > mine) n++; }); return st.fin.includes(v.me) ? st.fin.indexOf(v.me) + 1 : n; }
  function left(t, v, me, iAmIn) {
    if (st.mode === 'araba') {
      const L = st.trk.L; const laps = v.conf.laps; const p = me.car?.prog ?? 0; const lap = clamp(Math.floor(p / L) + 1, 1, laps); const goal = v.keep > 1 ? `ilk ${v.keep} tur atlar` : 'ilk bitiren kazanır';
      if (!iAmIn) return `${st.fin.length ? `${st.fin.length} araç bitirdi · ` : ''}${goal}`;
      if (me.car?.done) return `${st.fin.indexOf(v.me) + 1}. bitirdin · ${goal}`;
      return `Tur ${lap}/${laps} · ${rank(v)}. sıradasın · ${me.car && me.car.tcd <= 0 ? 'Turbo hazır' : goal}`;
    }
    const n = v.players.filter((p) => p.alive).length; const tt = Math.max(0, t);
    return `${iAmIn ? `${hearts(me.hp ?? 3)} · ` : ''}Kalan ${n}${v.keep > 1 ? ` · ${v.keep} gemi tur atlar` : ''}${tt > SHIP.storm.from - 4 && tt < SHIP.storm.from + 2 ? ' · Fırtına yaklaşıyor' : ''}`;
  }
  const btn = (m) => (m === 'araba' ? 'Turbo' : 'Ateş');
  const cooling = (me, nowMs) => (st.mode === 'araba' ? (me.car?.tcd ?? 0) > 0 : nowMs - st.fireAt < SHIP.cd * 1000);

  // ---- Sunucu olayları ----
  function ev(e, v, me, chars, iAmIn) {
    if (e.t === 'cfin') { st.fin.push(e.i); if (e.i === v.me) { if (me.car) me.car.done = e.n; K.banner(e.n === 1 ? 'Birinci geldin! 🏁' : `${e.n}. geldin! 🏁`, v.keep > 1 && e.n <= v.keep ? 'Tur atladın.' : '', 2200); K.sfx.play(e.n <= v.keep ? 'win' : 'good'); K.buzz(60); } else K.feed(`${(v.players[e.i]?.name || '').replace(' (bot)', '')} ${e.n}. bitirdi`); return true; }
    if (e.t === 'fire') { if (e.i !== v.me && st.mode === 'gemi' && st.shipTex) { const b = e.b; const ry = Math.atan2(-b[0][4], b[0][3]); const x = (b[0][1] + b[1][1]) / 2; const z = (b[0][2] + b[1][2]) / 2; shoot(e.i, x, z, ry, b.map((q) => q[0])); const pp = chars.get(v.me)?.g.position; const far = pp ? Math.hypot(x - pp.x, z - pp.z) : 20; if (far < 22) K.sfx.play('boom', Math.max(0.15, 0.5 - far * 0.02), 140); } return true; }
    if (e.t === 'shit') {
      if (v.st?.hp) v.st.hp[e.i] = e.hp; const ball = e.by === v.me ? st.balls.filter((b) => b.by === v.me).sort((a, b) => Math.hypot(a.x - e.x, a.z - e.z) - Math.hypot(b.x - e.x, b.z - e.z))[0] : st.balls.find((b) => b.id === e.id); if (ball) ball.dead = true;
      blast(e.x, e.z, false);
      if (e.i === v.me) { me.hp = e.hp; K.feel(0.35, [60, 30, 60], 'hit'); if (e.by < 0) K.banner('Fırtınadasın!', 'Halkanın içine dön.', 1400); else if (e.hp > 0) K.banner(e.hp === 1 ? 'Son canın!' : 'Vuruldun!', '', 1000); }
      else if (e.by === v.me) { K.sfx.play('good', 0.8); K.buzz(25); } else K.sfx.play('thud', 0.5, 100);
      return true;
    }
    if (e.t === 'sink') { blast(e.x, e.z, true); const nm = (v.players[e.i]?.name || '').replace(' (bot)', '');
      if (e.i === v.me) { me.hp = 0; me.gone = true; me.hideAt = performance.now() + 2600; K.banner('Gemin battı!', v.players.some((p, j) => j !== v.me && !p.bot && p.alive) ? 'Kalanları izleyebilirsin.' : '', 2600); K.feel(0.45, [80, 40, 80], 'out'); }
      else { K.feed(`${nm} battı ⚓`); K.sfx.play('boom', 0.6, 100); } return false; }
    return false;
  }

  // ---- Yerel deneme otomatik pilotu ----
  function auto(me, inp, t) { inp.x = 0; inp.z = 0; inp.auto = true; inp.fire = false; if (st.mode === 'gemi' && st.autoFire) { inp.fire = true; st.autoFire = false; } if (st.mode === 'araba' && me.car && t > 3 && me.car.tcd <= 0 && st.trk.sp[(me.car.ci + 15) % st.trk.N] >= CAR.vmax - 0.5) inp.jump = true; }
  function reset() { st.mode = null; st.balls = []; st.fx = []; dressKey = ''; }

  return { is, preload, ready, bounds, build, dress, place, spawnProg, step, others, frame, cam, left, btn, cooling, ev, auto, reset, get mode() { return st.mode; } };
}
