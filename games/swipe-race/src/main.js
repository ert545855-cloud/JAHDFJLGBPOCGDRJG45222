// Swipe Race: 3D yarış. Modlar: yarış (5 bot), kupa (3 pist), zamana karşı (hayaletle), arkadaşlarla (çok oyunculu).
// Derleme: games/swipe-race/README.md
import * as THREE from 'three';
import { $, isTouch, store, settings, QUALITY, renderer, scene, camera, sun, view, resize, baseFov, lockLandscape, setDpr, warmup, applyQuality, qualityHooks } from './core.js';
import { TILE, TRACKS, project, nearestGlobal } from './track.js';
import { CarSim, CAR_DEFS, aiDrive, collideCars, mulberry32, carIndex, ITEMS } from './physics.js';
import { loadAll } from './assets.js';
import { World } from './world.js';
import { Smoke, Skids, Pickups } from './fx.js';
import { CarView } from './cars.js';
import { sfx } from './audio.js';
import { keys, touch, keyActions, bindHold, bindSteer, readPlayerInput, enableTilt, tiltState } from './input.js';
import { api, online, socket, serverNow, encodeGhost, decodeGhost } from './net.js';

const LAPS = 3;
const STEP = 1 / 120;
const NCARS = 6;
const TOY_SCALE = 0.33 * TILE, RACING_SCALE = 3.3;
const DIFFS = [{ name: 'Kolay', skill: 0.86 }, { name: 'Normal', skill: 0.95 }, { name: 'Zor', skill: 1.03 }];
const CUP_PTS = [10, 8, 6, 5, 4, 3];
const ITEM_ICON = { turbo: '🚀', banana: '🍌', shield: '🛡️' };
const MODES = {
  race: { start: 'YARIŞA BAŞLA', note: '5 rakibe karşı 3 tur. Kutulardan eşya, altınlardan nitro topla.' },
  cup: { start: 'KUPAYA BAŞLA', note: 'Üç pistte üç yarış. Her yarışta sıraya göre puan: 10 · 8 · 6 · 5 · 4 · 3.' },
  ghost: { start: 'TURA BAŞLA', note: 'Tek başına 3 tur. En iyi turun hayalet olarak kaydedilir, sıralamaya girer.' },
  mp: { start: 'ODA KUR', note: 'Oda kur, arkadaşlarını çağır, aynı pistte yarışın (2–6 kişi).' },
};

// ---------- durum ----------
const G = {
  state: 'loading', mode: 'race', cars: [], player: null, t: 0, acc: 0, countdown: 0, lastCount: 0,
  lapNo: -1, lapStart: 0, lapTimes: [], bestRace: 0, resetCd: 0, finishShown: 0, rnd: mulberry32(Date.now() & 0xffff),
  me: null, cup: null, ghost: null, ghostTarget: null, room: null, remotes: new Map(), sendT: 0, items: 0, coins: 0, clean: 0,
  rec: null, bestGhost: null, mpStartLocal: 0, submitted: false,
};
view.raceMode = () => ['countdown', 'race', 'paused', 'results'].includes(G.state);
let world = null, pickups = null, smoke = null, skids = null;
const views = [];
let menuView = null;
let mode = store.get('mode', 'race'); if (!MODES[mode]) mode = 'race';
settings.track = Math.min(TRACKS.length - 1, Math.max(0, settings.track | 0));
settings.car = Math.min(CAR_DEFS.length - 1, Math.max(0, settings.car | 0));
const variantOf = (i) => Math.min(CAR_DEFS[i].variants - 1, settings.variants[CAR_DEFS[i].id] | 0);

// ---------- yardımcılar ----------
function fmt(t) {
  if (!(t > 0)) return '--:--.--';
  const m = Math.floor(t / 60), s = t - m * 60;
  return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2);
}
function setText(el, txt) { if (el._t !== txt) { el._t = txt; el.textContent = txt; } }
let flashTimer = 0;
function flash(txt, ms) {
  const el = $('msg'); el.textContent = txt; el.classList.remove('hide', 'pop'); void el.offsetWidth; el.classList.add('pop');
  clearTimeout(flashTimer); flashTimer = setTimeout(() => el.classList.add('hide'), ms);
}
let toastT = 0;
function toast(txt, ms = 2600) { const el = $('toast'); el.textContent = txt; el.classList.remove('hide'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.add('hide'), ms); }
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function owned(i) {
  const d = CAR_DEFS[i];
  if (!G.me) return d.price === 0;
  const c = G.me.cars.find(x => x.id === d.id); return c ? c.owned : d.price === 0;
}
function lerpAngle(a, b, t) { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * t; }
const wrapPi = a => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };

// ---------- dünya ----------
async function loadWorld(trackIdx, night) {
  if (world && world.trackIdx === trackIdx && world.night === !!night) return;
  $('busy').classList.remove('hide');
  await new Promise(r => setTimeout(r, 30));
  // yeni dünya ayrı kurulur, hazır olunca eskisinin yerine geçer (yarım kurulmuş dünya hiç çizilmez)
  const w = new World(trackIdx, night); w.trackIdx = trackIdx;
  await w.build();
  if (world) world.dispose();
  world = w; world.show();
  pickups.setup(world);
  skids.clear(); smoke.clear();
  buildMinimap();
  for (const v of views) v.setNight(world.night);
  if (menuView) placeMenuCar();
  applyQualityExtras();
  warmup();
  $('busy').classList.add('hide');
}
function applyQualityExtras() {
  const q = QUALITY[settings.quality];
  for (const v of views) v.setBlob(!q.shadows);
  if (menuView) menuView.setBlob(!q.shadows);
}
qualityHooks.push(() => applyQualityExtras());

// ---------- arabalar ----------
function clearCars() {
  for (const v of views) v.dispose();
  views.length = 0; G.cars.length = 0; G.player = null;
  if (G.ghost) { G.ghost.view.dispose(); G.ghost = null; }
  for (const r of G.remotes.values()) r.view.dispose();
  G.remotes.clear();
}
function gridSlot(k) { return { back: 7 + Math.floor(k / 2) * 7, lat: k % 2 ? 2.6 : -2.6 }; }
function makeCar(def, variant, slot, opts = {}) {
  const car = new CarSim(def);
  const g = gridSlot(slot);
  car.placeAt(world.cl, world.iFinish, g.lat, g.back);
  let rd = car.s - world.sFinish; if (rd > world.cl.L / 2) rd -= world.cl.L; car.raceDist = rd;
  car.view = new CarView(def, variant, { night: world.night, blob: !QUALITY[settings.quality].shadows, name: opts.name, tagColor: opts.tagColor });
  car.variant = variant; car.name = opts.name || def.name; car.items = 0;
  views.push(car.view);
  return car;
}
function aiField() {
  const pdef = CAR_DEFS[settings.car];
  const others = CAR_DEFS.filter(d => d !== pdef);
  for (let i = others.length - 1; i > 0; i--) { const j = Math.floor(G.rnd() * (i + 1)); [others[i], others[j]] = [others[j], others[i]]; }
  const skill = DIFFS[settings.diff].skill;
  return others.slice(0, NCARS - 1).map((d, k) => ({ def: d, variant: Math.floor(G.rnd() * d.variants), skill: skill * (0.97 + G.rnd() * 0.06) * (1 - k * 0.004) }));
}

// ---------- yarış kurulumu ----------
function resetRaceState() {
  G.t = 0; G.acc = 0; G.lapNo = -1; G.lapTimes = []; G.lapStart = 0; G.finishShown = 0; G.bestRace = 0;
  G.items = 0; G.coins = 0; G.clean = 0; G.rec = null; G.bestGhost = null; G.submitted = false; G.resetCd = 0;
  pickups.reset(); skids.clear(); smoke.clear();
}
async function startRace(opts = {}) {
  if (!owned(settings.car)) { toast('Bu araç kilitli. Garajdan aç ya da başka araç seç.'); openTab('garage'); return; }
  G.mode = opts.mode || mode;
  if (G.mode === 'cup' && !opts.next) G.cup = { round: 0, tracks: [0, 1, 2], field: aiField(), pts: new Array(NCARS).fill(0) };
  const trackIdx = G.mode === 'cup' ? G.cup.tracks[G.cup.round] : settings.track;
  await loadWorld(trackIdx, settings.night);
  clearCars(); if (menuView) { menuView.dispose(); menuView = null; }
  resetRaceState();
  const pdef = CAR_DEFS[settings.car], pvar = variantOf(settings.car);
  if (G.mode === 'ghost') {
    G.player = makeCar(pdef, pvar, 0); G.cars.push(G.player);
    await setupGhost(opts.ghostUid);
  } else {
    const field = G.mode === 'cup' ? G.cup.field : aiField();
    G.field = field;
    const playerSlot = NCARS - 2; let fi = 0;
    for (let k = 0; k < NCARS; k++) {
      if (k === playerSlot) { G.player = makeCar(pdef, pvar, k); G.cars.push(G.player); continue; }
      const f = field[fi++]; const car = makeCar(f.def, f.variant, k);
      car.ai = true; car.skill = f.skill; car.lane = gridSlot(k).lat; car.laneTarget = car.lane; car.fieldIdx = fi - 1;
      G.cars.push(car);
    }
  }
  G.player.isPlayer = true;
  G.countdown = 3.5; G.lastCount = 4;
  G.state = 'countdown';
  camYaw = G.player.yaw; camInit = true;
  if (isTouch) lockLandscape(true);
  showScreen('hud');
  prepHud();
  sfx.init();
  warmup();
}
function prepHud() {
  const others = G.mode === 'mp' ? G.remotes.size : G.mode === 'ghost' ? 0 : NCARS - 1;
  setText($('hTot'), '/' + (others + 1));
  $('bGas').classList.toggle('hide', !!settings.autoGas); $('pedals').classList.toggle('auto', !!settings.autoGas);
  document.body.classList.toggle('tilt', !!(settings.tilt && tiltState.on));
  $('itemSlot').classList.toggle('hide', G.mode === 'ghost' || isTouch);
  $('bItem').classList.toggle('hide', G.mode === 'ghost');
  $('itemKey').classList.toggle('hide', isTouch);
  $('resetBtn').classList.toggle('hide', false);
  updateItemUI();
}
async function setupGhost(uid) {
  G.ghostTarget = null;
  $('ghostTag').classList.add('hide');
  if (!online()) return;
  const track = TRACKS[world.trackIdx].id;
  try {
    const target = uid || 'me';
    const d = await api('/ghost?track=' + encodeURIComponent(track) + '&uid=' + encodeURIComponent(target === 'me' ? meId() : target));
    if (!d || !d.ghost) return;
    const data = decodeGhost(d.ghost);
    const di = carIndex(d.car);
    const v = new CarView(CAR_DEFS[di], Math.min(CAR_DEFS[di].variants - 1, d.variant | 0), { ghost: true, name: d.user ? d.user.username : 'Hayalet', tagColor: '#bfe3ff' });
    G.ghost = { view: v, data, ms: d.ms, name: d.user ? d.user.username : '' };
    G.ghostTarget = { uid: d.user ? d.user.id : null, ms: d.ms };
    const tag = $('ghostTag'); tag.textContent = '👻 ' + (d.user ? d.user.username : 'Hayalet') + ' · ' + fmt(d.ms / 1000); tag.classList.remove('hide');
  } catch (e) { if (uid) toast(e.message); }
}
let myId = null;
function meId() {
  if (myId) return myId;
  try { const t = localStorage.getItem('su_token'); const p = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); myId = p.id; } catch (e) { myId = null; }
  return myId;
}

function resetPlayer() {
  const p = G.player;
  if (!p || G.state !== 'race' || G.resetCd > 0 || p.finished) return;
  const rd = p.raceDist; p.placeAt(world.cl, p.idx, 0, 0); p.raceDist = rd;
  G.resetCd = 2; flash('Piste dönüldü', 900);
}
function togglePause() {
  if (G.mode === 'mp' && (G.state === 'race' || G.state === 'countdown')) { toast('Çok oyunculu yarışta duraklatılamaz.'); return; }
  if (G.state === 'race' || G.state === 'countdown') { G.prevState = G.state; G.state = 'paused'; showScreen('pause'); sfx.engine(0, 0, false); sfx.skid(0); sfx.suspend(); }
  else if (G.state === 'paused') resume();
}
function resume() { G.state = G.prevState || 'race'; showScreen('hud'); sfx.resume(); lastT = performance.now(); }
function toMenu() {
  leaveRoom();
  clearCars(); G.cup = null; G.state = 'menu'; lockLandscape(false);
  showScreen('menu'); refreshMenu(); sfx.engine(0, 0, false); sfx.skid(0);
  if (location.hash) history.replaceState(null, '', location.pathname);
}
keyActions.Escape = togglePause; keyActions.KeyP = togglePause; keyActions.KeyR = resetPlayer;
keyActions.KeyF = () => { settings.fps = !settings.fps; store.set('fps', settings.fps); $('fps').classList.toggle('hide', !settings.fps); };

// ---------- eşyalar ----------
function rankOf(c) {
  let r = 1; for (const o of G.cars) if (o !== c && o.raceDist > c.raceDist) r++;
  for (const o of G.remotes.values()) if (o.raceDist > c.raceDist) r++;
  return r;
}
function rollItem(c) {
  const n = G.cars.length + G.remotes.size, r = rankOf(c), x = G.rnd();
  if (r === 1) return x < 0.5 ? 'banana' : x < 0.9 ? 'shield' : 'turbo';
  if (r >= n - 1) return x < 0.6 ? 'turbo' : x < 0.85 ? 'shield' : 'banana';
  return ITEMS[Math.floor(x * 3)];
}
function giveItem(c) {
  if (c.item || c.rolling > 0) return;
  c.rolling = 0.9;
  if (c === G.player) { sfx.beep(660, 0.05, 'square', 0.08); updateItemUI(); }
  if (c.ai) c.itemDelay = 0.8 + G.rnd() * 2.5;
}
function useItem(c) {
  const it = c.item; if (!it) return;
  c.item = null; c.items = (c.items || 0) + 1;
  if (it === 'turbo') { c.boostT = 1.6; if (c === G.player) { sfx.whoosh(); shake = 0.35; } }
  else if (it === 'shield') { c.shieldT = 8; if (c === G.player) sfx.beep(880, 0.2, 'sine', 0.15); }
  else if (it === 'banana') {
    const sy = Math.sin(c.yaw), cy = Math.cos(c.yaw);
    const x = c.x + sy * 3.4, z = c.z + cy * 3.4;
    pickups.dropBanana(x, z, c.y, c);
    if (c === G.player && G.mode === 'mp') { const s = socket(); if (s) s.emit('race:item', { k: 'banana', x, z, y: c.y }); }
    if (c === G.player) sfx.beep(330, 0.1, 'triangle', 0.14);
  }
  if (c === G.player) { G.items++; updateItemUI(); }
}
function updateItemUI() {
  const p = G.player;
  const it = p ? p.item : null, rolling = p && p.rolling > 0;
  const icon = rolling ? ITEM_ICON[ITEMS[Math.floor(performance.now() / 90) % 3]] : it ? ITEM_ICON[it] : '';
  setText($('itemIcon'), icon); setText($('bItem'), icon || '·');
  $('itemSlot').classList.toggle('has', !!it); $('itemSlot').classList.toggle('roll', !!rolling);
}
function itemTick(dt) {
  for (const c of G.cars) {
    if (c.rolling > 0) { c.rolling -= dt; if (c.rolling <= 0) { c.item = rollItem(c); if (c === G.player) { sfx.item(); updateItemUI(); } } }
    if (c.in.use && c.item && (!c.ai || c.itemDelay <= 0)) useItem(c);
  }
  // kutular, altınlar, muzlar
  for (const c of G.cars) {
    if (c.ghost) continue;
    for (const b of pickups.boxes) {
      if (b.t > 0) continue;
      const dx = b.x - c.x, dz = b.z - c.z;
      if (dx * dx + dz * dz < 7 && Math.abs(b.y - c.y) < 2.5) { b.t = 4; giveItem(c); }
    }
    for (const k of pickups.coins) {
      if (k.t > 0) continue;
      const dx = k.x - c.x, dz = k.z - c.z;
      if (dx * dx + dz * dz < 7.3 && Math.abs(k.y - c.y) < 2.5) {
        k.t = 7; c.nitro = Math.min(1, c.nitro + 0.2);
        if (c === G.player) { G.coins++; sfx.coin(); $('nitro').classList.add('pulse'); setTimeout(() => $('nitro').classList.remove('pulse'), 300); }
      }
    }
    for (const b of pickups.bananas) {
      if (!b.on || (b.owner === c && b.arm > 0)) continue;
      const dx = b.x - c.x, dz = b.z - c.z;
      if (dx * dx + dz * dz < 3.6 && Math.abs(b.y - c.y) < 1.5) {
        b.on = false;
        const hit = c.spinOut();
        if (c === G.player) { if (hit) { sfx.thud(0.5); flash('Kaydın!', 900); shake = 0.6; } else sfx.beep(700, 0.15, 'sine', 0.12); }
      }
    }
  }
}

// ---------- benzetim ----------
function simStep(dt) {
  const cars = G.cars, p = G.player, cl = world.cl;
  const hazards = pickups.bananas;
  for (const c of cars) {
    if (c.ai || c.finished) aiDrive(c, cl, world.prof, cars, p.raceDist, dt, G.rnd, hazards);
    else readPlayerInput(c.in);
  }
  for (const c of cars) c.step(dt, cl);
  collideCars(cars);
  if (G.remotes.size) collideRemotes(p);
  for (const c of cars) c.track(cl, 0);
  itemTick(dt);
  const totalD = LAPS * cl.L;
  for (const c of cars) {
    if (!c.finished && c.raceDist >= totalD) {
      c.finished = true; c.finishTime = G.t;
      if (c === p) onPlayerFinish();
    }
  }
  if (!p.finished) lapLogic(p);
}
function lapLogic(p) {
  const cl = world.cl;
  const lap = Math.floor(p.raceDist / cl.L);
  if (lap > G.lapNo) {
    if (G.lapNo >= 0) {
      const lt = G.t - G.lapStart; G.lapTimes.push(lt);
      recSample(p, true);
      if (p.lapWall === 0) G.clean++;
      if (!G.bestRace || lt < G.bestRace) {
        G.bestRace = lt;
        if (G.rec) G.bestGhost = { ms: Math.round(lt * 1000), ghost: encodeGhost(G.rec.buf) };
      }
      if (G.ghost && G.mode === 'ghost') { const d = lt - G.ghost.ms / 1000; flash((d < 0 ? '−' : '+') + Math.abs(d).toFixed(2) + ' sn', 1400); }
      else if (lap < LAPS) flash(lap === LAPS - 1 ? 'SON TUR!' : 'TUR ' + (lap + 1) + '/' + LAPS, 1300);
      sfx.beep(880, 0.12, 'triangle', 0.2);
    }
    G.lapNo = lap; G.lapStart = G.t; p.lapWall = 0;
    G.rec = { buf: [], start: G.t, next: 0 };
    recSample(p, false);
  }
  p.lapWall = (p.lapWall || 0) + p.wallHit; p.wallHit = 0;
  if (G.rec && G.t - G.rec.start >= G.rec.next * 0.1 + 0.1 - 1e-6) recSample(p, false);
}
function recSample(p, final) {
  if (!G.rec) return;
  G.rec.buf.push(p.x * 10, p.z * 10, wrapPi(p.yaw) * 10000 / Math.PI);
  if (!final) G.rec.next = Math.round((G.t - G.rec.start) / 0.1);
}
function onPlayerFinish() {
  const p = G.player;
  if (!G.bestRace) G.bestRace = G.lapTimes.length ? Math.min(...G.lapTimes) : 0;
  const bestLapAll = store.get('best_' + TRACKS[world.trackIdx].id, 0);
  if (G.bestRace && (!bestLapAll || G.bestRace < bestLapAll)) store.set('best_' + TRACKS[world.trackIdx].id, G.bestRace);
  p.ai = true; p.skill = 0.85; p.lane = p.lat; p.laneTarget = p.lat;
  flash('BİTİŞ!', 1800);
  G.finishShown = 2.2;
  sfx.beep(660, 0.15, 'triangle'); setTimeout(() => sfx.beep(990, 0.3, 'triangle'), 160);
  if (G.mode === 'mp') { const s = socket(); if (s) s.emit('race:finish', { ms: Math.round(p.finishTime * 1000) }); }
}
function standings() {
  const list = G.cars.map(c => ({ c, name: c.isPlayer ? 'SEN' : c.name, finished: c.finished, t: c.finishTime, d: c.raceDist, me: c === G.player }));
  if (G.mode === 'mp' && G.room) {
    for (const r of G.remotes.values()) {
      const pl = G.room.players.find(x => x.uid === r.uid);
      list.push({ c: r, name: r.name, finished: !!(pl && pl.finished), t: pl ? pl.ms / 1000 : 0, d: r.raceDist, me: false, place: pl && pl.place });
    }
    const mine = G.room.players.find(x => x.uid === meId());
    if (mine) list[0].place = mine.place;
  }
  return list.sort((a, b) => {
    if (a.finished && b.finished) return a.t - b.t;
    if (a.finished) return -1; if (b.finished) return 1;
    return b.d - a.d;
  });
}

// ---------- çok oyunculu: uzak arabalar ----------
function collideRemotes(p) {
  for (const r of G.remotes.values()) {
    if (Math.abs(r.y - p.y) > 2.5 || !r.seen) continue;
    const dx = p.x - r.x, dz = p.z - r.z, d2 = dx * dx + dz * dz, R = 3.0;
    if (d2 >= R * R || d2 < 1e-6) continue;
    const d = Math.sqrt(d2), nx = dx / d, nz = dz / d;
    p.x += nx * (R - d) * 0.6; p.z += nz * (R - d) * 0.6;
    const vn = p.vx * nx + p.vz * nz;
    if (vn < 0) { p.vx -= nx * vn * 1.3; p.vz -= nz * vn * 1.3; if (-vn > p.impact) p.impact = -vn; }
  }
}
const REMOTE_DELAY = 120;
function updateRemotes() {
  const now = performance.now() - REMOTE_DELAY;
  for (const r of G.remotes.values()) {
    const s = r.snaps; if (!s.length) continue;
    while (s.length > 2 && s[1].t <= now) s.shift();
    let a = s[0], b = s[1] || s[0];
    const f = b.t > a.t ? Math.max(0, Math.min(1.5, (now - a.t) / (b.t - a.t))) : 0;
    r.x = a.x + (b.x - a.x) * f; r.z = a.z + (b.z - a.z) * f; r.y = a.y + (b.y - a.y) * f;
    r.yaw = lerpAngle(a.yaw, b.yaw, Math.min(1, f));
    r.vf = b.vf; r.steer = b.str; r.raceDist = a.dist + (b.dist - a.dist) * f; r.flags = b.flags; r.seen = true;
    const v = r.view;
    v.root.position.set(r.x, r.y + 0.12, r.z); v.root.rotation.y = r.yaw;
    v.spin -= r.vf * 0.016;
    for (const w of v.wheels) { w.o.rotation.x = v.spin / w.r; if (w.front) w.o.rotation.y = -r.steer * 0.9; }
    v.shield.visible = !!(r.flags & 1);
  }
}

// ---------- görüntü ----------
let camYaw = 0, camInit = true, shake = 0, curFov = 60;
const _v1 = new THREE.Vector3(), _focus = new THREE.Vector3(), _m4 = new THREE.Matrix4(), _p3 = new THREE.Vector3(), _s3 = new THREE.Vector3(1, 1, 1);
function updateViews(alpha, dt) {
  const camX = camera.position.x, camZ = camera.position.z;
  for (const c of G.cars) {
    const v = c.view; if (!v) continue;
    const x = c.px + (c.x - c.px) * alpha, z = c.pz + (c.z - c.pz) * alpha, y = c.pyy + (c.y - c.pyy) * alpha;
    const yaw = lerpAngle(c.pyaw, c.yaw, alpha);
    v.root.position.set(x, y + 0.12, z); v.root.rotation.y = yaw;
    const k = 1 - Math.exp(-dt * 8);
    const latAcc = c.vf * c.yawRate;
    v.roll += (Math.max(-0.09, Math.min(0.09, latAcc * 0.0035)) - v.roll) * k;
    const thr = c.in.thr - c.in.brk;
    v.pitch += ((c.vf > 1 ? thr * 0.025 : 0) + Math.atan(c.slope) - v.pitch) * k;
    v.tilt.rotation.set(v.pitch, 0, v.roll);
    v.spin -= c.vf * dt;
    for (const w of v.wheels) { w.o.rotation.x = v.spin / w.r; if (w.front) w.o.rotation.y = -c.steer * 0.9; }
    v.shield.visible = c.shieldT > 0;
    const dx = x - camX, dz = z - camZ, near = dx * dx + dz * dz < 6400;
    const slip = Math.abs(c.vr), sp = Math.abs(c.vf);
    const sy = Math.sin(yaw), cy = Math.cos(yaw);
    // lastik izi
    const skid = near && !c.offroad && ((slip > 3.4 && sp > 6) || (c.in.hb && sp > 6) || c.spinT > 0);
    if (skid) {
      const bx = x + sy * 1.4, bz = z + cy * 1.4;
      const lx = bx - cy * 1.0, lz = bz + sy * 1.0, rx = bx + cy * 1.0, rz = bz - sy * 1.0;
      if (v.skidPrev) { skids.add(v.skidPrev[0], v.skidPrev[1], lx, lz, y); skids.add(v.skidPrev[2], v.skidPrev[3], rx, rz, y); }
      v.skidPrev = v.skidPrev || [0, 0, 0, 0];
      v.skidPrev[0] = lx; v.skidPrev[1] = lz; v.skidPrev[2] = rx; v.skidPrev[3] = rz;
    } else v.skidPrev = null;
    if (near) {
      v.smokeT -= dt;
      const emit = (slip > 3.2 && sp > 6) || (c.offroad && sp > 9) || (c.in.hb && sp > 6) || c.nitroOn || c.boostT > 0 || c.spinT > 0;
      if (emit && v.smokeT <= 0) {
        v.smokeT = c.nitroOn || c.boostT > 0 ? 0.03 : 0.05;
        const bx = x + sy * 2.2, bz = z + cy * 2.2;
        const side = (Math.random() < 0.5 ? -1 : 1) * 1.1;
        smoke.spawn(bx + cy * side, y + 0.4, bz - sy * side, c.vx * 0.3 + (Math.random() - 0.5) * 2, c.vz * 0.3 + (Math.random() - 0.5) * 2, c.nitroOn || c.boostT > 0 ? 0.9 : c.offroad ? 1.3 : 1.1, c.nitroOn || c.boostT > 0 ? 0.35 : 0.7);
      }
    }
  }
  if (G.ghost) updateGhost();
  skids.update();
}
const GQ = {};
function updateGhost() {
  const g = G.ghost, d = g.data, v = g.view;
  const t = G.lapNo >= 0 && !G.player.finished ? (G.t - G.lapStart) / 0.1 : 0;
  const i = Math.max(0, Math.min(d.n - 1, Math.floor(t))), j = Math.min(d.n - 1, i + 1), f = Math.min(1, Math.max(0, t - i));
  const x = d.x[i] + (d.x[j] - d.x[i]) * f, z = d.z[i] + (d.z[j] - d.z[i]) * f, yaw = lerpAngle(d.yaw[i], d.yaw[j], f);
  g.hint = g.hint == null ? nearestGlobal(world.cl, x, z, 0) : project(world.cl, x, z, g.hint, GQ);
  const y = GQ.y || 0;
  v.root.position.set(x, y + 0.12, z); v.root.rotation.y = yaw;
  v.spin -= 0.5; for (const w of v.wheels) w.o.rotation.x = v.spin / w.r;
}
function updateCamera(dt) {
  const p = G.player; if (!p) return;
  const v = p.view.root;
  const sp = p.speed();
  const yaw = v.rotation.y;
  if (camInit) camYaw = yaw;
  camYaw = lerpAngle(camYaw, yaw, 1 - Math.exp(-dt * 4.5));
  const dist = 9.5 + Math.min(sp, 50) * 0.04;
  const h = 3.4 + Math.min(sp, 50) * 0.014;
  _v1.set(v.position.x + Math.sin(camYaw) * dist, v.position.y + h, v.position.z + Math.cos(camYaw) * dist);
  if (camInit) { camera.position.copy(_v1); camInit = false; }
  else camera.position.lerp(_v1, 1 - Math.exp(-dt * 12));
  if (shake > 0) {
    shake = Math.max(0, shake - dt * 2.5);
    camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake * 0.6;
  }
  _focus.set(v.position.x - Math.sin(yaw) * 5, v.position.y + 1.3, v.position.z - Math.cos(yaw) * 5);
  camera.lookAt(_focus);
  const fov = baseFov() + Math.min(1, sp / 45) * 9 + (p.nitroOn || p.boostT > 0 ? 7 : 0);
  curFov += (fov - curFov) * (1 - Math.exp(-dt * 4));
  if (Math.abs(camera.fov - curFov) > 0.05) { camera.fov = curFov; camera.updateProjectionMatrix(); }
}
let orbitA = 0.6;
function updateMenuCamera(dt) {
  if (!menuView) return;
  orbitA += dt * 0.22;
  const c = menuView.root.position;
  const port = camera.aspect < 1, r = port ? 10.5 : 9;
  camera.position.set(c.x + Math.sin(orbitA) * r, c.y + (port ? 4.2 : 3.4), c.z + Math.cos(orbitA) * r);
  _focus.set(c.x, c.y + (port ? -4.2 : 1.0), c.z); camera.lookAt(_focus);
  if (Math.abs(camera.fov - baseFov()) > 0.05) { camera.fov = baseFov(); camera.updateProjectionMatrix(); }
  curFov = baseFov();
}
function updateSun() {
  const f = G.player && G.player.view ? G.player.view.root.position : menuView ? menuView.root.position : _focus;
  const snap = 100 / sun.shadow.mapSize.x;
  const tx = Math.round(f.x / snap) * snap, tz = Math.round(f.z / snap) * snap;
  const off = world.lightOff;
  sun.target.position.set(tx, 0, tz);
  sun.position.set(tx + off.x, off.y, tz + off.z);
  sun.target.updateMatrixWorld();
}
function envTick(dt) {
  if (world.clouds) world.clouds.rotation.y += dt * 0.004;
  if (world.sky) world.sky.position.copy(camera.position);
  if (world.glow) {
    const q = camera.quaternion;
    for (let i = 0; i < world.lamps.length; i++) { const l = world.lamps[i]; _p3.set(l.x, l.y, l.z); _m4.compose(_p3, q, _s3); world.glow.setMatrixAt(i, _m4); }
    world.glow.instanceMatrix.needsUpdate = true;
  }
}

// ---------- HUD ----------
const hud = {};
let hudT = 0, mapT = 0;
function updateHUD(dt) {
  hudT -= dt; mapT -= dt;
  const p = G.player;
  if (hudT <= 0) {
    hudT = 0.1;
    const st = standings();
    setText(hud.pos, (st.findIndex(x => x.me) + 1) + '');
    setText(hud.lap, Math.min(LAPS, Math.max(1, Math.floor(p.raceDist / world.cl.L) + 1)) + '/' + LAPS);
    setText(hud.time, fmt(G.state === 'countdown' ? 0 : p.finished ? p.finishTime : G.t));
    setText(hud.lapT, fmt(p.finished || G.lapNo < 0 ? 0 : G.t - G.lapStart));
    setText(hud.best, fmt(G.bestRace || store.get('best_' + TRACKS[world.trackIdx].id, 0)));
    setText(hud.spd, Math.round(p.speed() * 3.6) + '');
    hud.nitroFill.style.transform = 'scaleX(' + p.nitro.toFixed(3) + ')';
    $('nitro').classList.toggle('active', p.nitroOn);
    $('wrong').classList.toggle('hide', !(p.wrongWayT > 1.2 && !p.finished));
    if (p.rolling > 0) updateItemUI();
    if (settings.fps) setText(hud.fps, Math.round(fpsAvg) + ' fps · ' + view.dpr.toFixed(2) + 'x · ' + renderer.info.render.calls + ' dc');
  }
  if (mapT <= 0) { mapT = 1 / 30; drawMinimap(); }
}
const minimap = { bg: null, sx: 1, ox: 0, oz: 0 };
function buildMinimap() {
  const cv = $('map'); const size = 132; const r = Math.min(2, window.devicePixelRatio || 1);
  cv.width = cv.height = size * r;
  const { minX, maxX, minZ, maxZ } = world.bounds; const cl = world.cl;
  const pad = 12 * r, sc = (size * r - pad * 2) / Math.max(maxX - minX, maxZ - minZ);
  minimap.sx = sc; minimap.ox = pad + ((size * r - pad * 2) - (maxX - minX) * sc) / 2 - minX * sc; minimap.oz = pad + ((size * r - pad * 2) - (maxZ - minZ) * sc) / 2 - minZ * sc;
  const bg = document.createElement('canvas'); bg.width = bg.height = size * r;
  const g = bg.getContext('2d'); g.lineJoin = 'round'; g.lineCap = 'round';
  const path = (from, to, filter) => { g.beginPath(); let started = false; for (let i = from; i <= to; i++) { const j = i % cl.N; if (filter && !filter(j)) { started = false; continue; } const X = cl.px[j] * sc + minimap.ox, Y = cl.pz[j] * sc + minimap.oz; if (started) g.lineTo(X, Y); else { g.moveTo(X, Y); started = true; } } };
  path(0, cl.N); g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 9 * r; g.stroke();
  path(0, cl.N); g.strokeStyle = '#3c4048'; g.lineWidth = 5 * r; g.stroke();
  path(0, cl.N, j => cl.py[j] > 1); g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 11 * r; g.stroke();
  path(0, cl.N, j => cl.py[j] > 1); g.strokeStyle = '#6b7385'; g.lineWidth = 6 * r; g.stroke();
  const fx = cl.px[world.iFinish] * sc + minimap.ox, fy = cl.pz[world.iFinish] * sc + minimap.oz;
  g.fillStyle = '#fff'; g.fillRect(fx - 6 * r, fy - 1.5 * r, 12 * r, 3 * r);
  minimap.bg = bg; minimap.ctx = cv.getContext('2d'); minimap.r = r;
}
const DOT_COLORS = ['#f6c33f', '#5cc2ff', '#ff7a59', '#9fe36b', '#c48bff', '#ff9ad5'];
function drawMinimap() {
  const g = minimap.ctx; if (!g) return;
  g.clearRect(0, 0, g.canvas.width, g.canvas.height);
  g.drawImage(minimap.bg, 0, 0);
  const r = minimap.r, dot = (x, z, col, rad) => { g.fillStyle = col; g.beginPath(); g.arc(x * minimap.sx + minimap.ox, z * minimap.sx + minimap.oz, rad * r, 0, 6.283); g.fill(); };
  G.cars.forEach((c, k) => { if (c !== G.player) dot(c.x, c.z, DOT_COLORS[(k + 1) % DOT_COLORS.length], 3.5); });
  let k = 0; for (const rc of G.remotes.values()) dot(rc.x, rc.z, DOT_COLORS[(k++ + 2) % DOT_COLORS.length], 3.8);
  if (G.ghost) { const p = G.ghost.view.root.position; dot(p.x, p.z, 'rgba(191,227,255,0.9)', 3.5); }
  const p = G.player;
  if (p) { g.fillStyle = '#fff'; g.strokeStyle = '#e8473d'; g.lineWidth = 2.5 * r; g.beginPath(); g.arc(p.x * minimap.sx + minimap.ox, p.z * minimap.sx + minimap.oz, 5 * r, 0, 6.283); g.fill(); g.stroke(); }
}

// ---------- sonuçlar ----------
function renderResultRows() {
  const st = standings();
  const tb = $('resRows'); tb.innerHTML = '';
  const avg = world.cl.L / 30;
  st.forEach((x, i) => {
    const tr = document.createElement('tr'); if (x.me) tr.className = 'me';
    const time = x.finished ? fmt(x.t) : G.mode === 'mp' ? (G.room && G.room.status === 'done' ? 'bitiremedi' : 'yarışıyor…') : '~' + fmt(G.t + (LAPS * world.cl.L - x.d) / Math.max(15, avg));
    tr.innerHTML = '<td>' + (i + 1) + '</td><td>' + esc(x.me ? 'SEN · ' + G.player.def.name : x.name) + '</td><td>' + time + '</td>';
    tb.appendChild(tr);
  });
  return st;
}
function showResults() {
  G.state = 'results';
  const st = renderResultRows();
  const myPlace = st.findIndex(x => x.me) + 1;
  const n = st.length;
  let title = G.mode === 'ghost' ? 'Tur tamamlandı' : myPlace === 1 ? '🏆 Birincisin!' : myPlace <= 3 ? myPlace + '. oldun, podyum!' : myPlace + '. bitirdin';
  $('resLaps').textContent = 'Turların: ' + G.lapTimes.map(fmt).join(' · ') + '  |  En iyi: ' + fmt(G.bestRace);
  // kupa
  $('cupBox').classList.add('hide'); $('nextBtn').classList.add('hide');
  let cupDone = false;
  if (G.mode === 'cup' && G.cup) {
    const c = G.cup;
    if (!c.scored) {
      st.forEach((x, i) => { const key = x.me ? NCARS - 1 : x.c.fieldIdx; c.pts[key] += CUP_PTS[i] || 0; });
      c.scored = true;
    }
    const rows = c.field.map((f, i) => ({ name: f.def.name, pts: c.pts[i], me: false })).concat([{ name: 'SEN', pts: c.pts[NCARS - 1], me: true }]).sort((a, b) => b.pts - a.pts);
    $('cupRows').innerHTML = rows.map((r, i) => '<tr class="' + (r.me ? 'me' : '') + '"><td>' + (i + 1) + '</td><td>' + esc(r.name) + '</td><td>' + r.pts + ' puan</td></tr>').join('');
    $('cupBox').classList.remove('hide');
    if (c.round < c.tracks.length - 1) { $('nextBtn').classList.remove('hide'); $('nextBtn').textContent = 'SONRAKİ YARIŞ (' + (c.round + 2) + '/3)'; title = 'Kupa ' + (c.round + 1) + '/3 · ' + title; }
    else { cupDone = true; const cp = rows.findIndex(r => r.me) + 1; title = cp === 1 ? '🏆 Kupayı kazandın!' : 'Kupayı ' + cp + '. bitirdin'; }
  }
  $('resTitle').textContent = title;
  $('againBtn').textContent = G.mode === 'cup' ? 'KUPAYI BAŞTAN' : G.mode === 'mp' ? 'YENİ ODA' : 'TEKRAR';
  $('challengeBtn').classList.add('hide');
  const info = $('resInfo'); info.innerHTML = '';
  if (G.ghostTarget && G.mode === 'ghost') {
    const d = G.bestRace - G.ghostTarget.ms / 1000;
    info.insertAdjacentHTML('beforeend', '<div class="chip ' + (d < 0 ? 'gold' : '') + '">' + (d < 0 ? '👻 Hayaleti ' + Math.abs(d).toFixed(2) + ' sn geçtin!' : '👻 Hayalet ' + d.toFixed(2) + ' sn önde') + '</div>');
  }
  showScreen('results');
  submitResult(myPlace, n, cupDone);
}
async function submitResult(place, n, cupDone) {
  if (G.submitted) return; G.submitted = true;
  const info = $('resInfo');
  if (!online()) { info.insertAdjacentHTML('beforeend', '<div class="chip">Sıralama, görev ve araç açma için SwipeUp\'a giriş yap.</div>'); return; }
  const track = TRACKS[world.trackIdx].id;
  const body = {
    mode: G.mode, track, diff: settings.diff, night: !!world.night, place, n, laps: G.lapTimes.map(t => Math.round(t * 1000)),
    coins: G.coins, items: G.items, clean: G.clean, car: G.player.def.id, variant: G.player.variant, cupDone, room: G.room ? G.room.id : undefined,
    lap: G.bestGhost || undefined,
  };
  try {
    const r = await api('/finish', body);
    G.me = r;
    const chips = [];
    chips.push('<div class="chip blue">+' + r.gained + ' XP · Seviye ' + r.level + '</div>');
    if (r.leveledUp) chips.push('<div class="chip gold">⬆️ Seviye atladın: ' + r.level + '</div>');
    if (r.unlocked && r.unlocked.length) chips.push('<div class="chip gold">🔓 Yeni araç: ' + esc(r.unlocked.join(', ')) + '</div>');
    if (r.record) chips.push('<div class="chip gold">⏱️ Yeni rekor: ' + fmt(r.record.ms / 1000) + (r.record.prev ? ' (önceki ' + fmt(r.record.prev / 1000) + ')' : '') + ' · hayaletin kaydedildi</div>');
    if (r.weekRank) chips.push('<div class="chip">🏁 Haftalık turnuvada ' + r.weekRank + '. sıradasın</div>');
    const ready = r.quests.list.filter(q => q.got >= q.n && !q.claimed).length;
    if (ready) chips.push('<div class="chip">🎯 ' + ready + ' görev tamamlandı, ödülünü Görevler sekmesinden al</div>');
    info.insertAdjacentHTML('beforeend', chips.join(''));
    if (r.best && r.best[track]) $('challengeBtn').classList.remove('hide');
    refreshLevel();
  } catch (e) { info.insertAdjacentHTML('beforeend', '<div class="chip">Sonuç kaydedilemedi: ' + esc(e.message) + '</div>'); }
}

// ---------- ekranlar / menü ----------
function showScreen(name) {
  for (const id of ['menu', 'hud', 'pause', 'results', 'lobby', 'friendPick']) $(id).classList.toggle('hide', id !== name);
  $('touch').classList.toggle('hide', !(name === 'hud' && isTouch));
  resize();
}
function statBar(v) { return '<i style="transform:scaleX(' + Math.max(0.08, Math.min(1, v)).toFixed(2) + ')"></i>'; }
function placeMenuCar() {
  const tmp = new CarSim(CAR_DEFS[settings.car]); tmp.placeAt(world.cl, world.iFinish, 0, 22);
  menuView.root.position.set(tmp.x, tmp.y + 0.12, tmp.z); menuView.root.rotation.y = tmp.yaw + 0.5;
}
function refreshPreview() {
  if (menuView) menuView.dispose();
  const d = CAR_DEFS[settings.car];
  menuView = new CarView(d, variantOf(settings.car), { night: world.night, blob: !QUALITY[settings.quality].shadows });
  placeMenuCar();
}
let tab = 'race';
function openTab(t) {
  tab = t;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('sel', b.dataset.t === t));
  for (const id of ['race', 'garage', 'quests', 'board', 'opts']) $('t-' + id).classList.toggle('hide', id !== t);
  if (t === 'quests') renderQuests();
  if (t === 'board') loadBoard();
}
function refreshLevel() {
  const me = G.me;
  if (!me) { setText($('lvlText'), online() ? 'Yükleniyor…' : 'Misafir'); $('lvlBar').style.transform = 'scaleX(0)'; $('qDot').classList.add('hide'); return; }
  setText($('lvlText'), 'Seviye ' + me.level + ' · ' + (me.xp % me.lvlXp) + '/' + me.lvlXp + ' XP');
  $('lvlBar').style.transform = 'scaleX(' + ((me.xp % me.lvlXp) / me.lvlXp).toFixed(3) + ')';
  $('qDot').classList.toggle('hide', !me.quests.list.some(q => q.got >= q.n && !q.claimed));
}
function refreshMenu() {
  const d = CAR_DEFS[settings.car];
  setText($('carName'), d.name);
  setText($('carVar'), d.colors[variantOf(settings.car)]);
  $('raceCar').textContent = d.name + ' · ' + d.colors[variantOf(settings.car)] + (owned(settings.car) ? '' : ' 🔒');
  $('stTop').innerHTML = statBar((d.top - 34) / 18);
  $('stAcc').innerHTML = statBar((d.acc - 11) / 8.5);
  $('stGrip').innerHTML = statBar((d.grip * d.handling - 0.6) / 0.72);
  $('stOff').innerHTML = statBar(d.offroad);
  const sw = $('swatches');
  sw.innerHTML = d.swatches.map((c, i) => '<button class="swatch' + (i === variantOf(settings.car) ? ' sel' : '') + '" style="background:' + c + '" aria-label="' + esc(d.colors[i]) + '"></button>').join('');
  sw.querySelectorAll('.swatch').forEach((b, i) => b.addEventListener('click', () => { settings.variants[d.id] = i; store.set('variants', settings.variants); refreshMenu(); refreshPreview(); }));
  const lock = $('lockBox');
  if (owned(settings.car)) lock.classList.add('hide');
  else {
    lock.classList.remove('hide');
    $('lockText').textContent = online() ? 'Seviye ' + d.lvl + '’de açılır' : 'Giriş yapınca açılabilir';
    $('unlockBtn').textContent = d.price + ' jetonla aç';
    $('unlockBtn').classList.toggle('hide', !online());
  }
  document.querySelectorAll('#mode button').forEach(b => b.classList.toggle('sel', b.dataset.m === mode));
  $('diffRow').classList.toggle('hide', mode === 'ghost' || mode === 'mp');
  document.querySelectorAll('#diff button').forEach((b, i) => b.classList.toggle('sel', i === settings.diff));
  const weekTrack = G.me && G.me.week ? G.me.week.track : null;
  $('trackSel').innerHTML = TRACKS.map((t, i) => '<button data-i="' + i + '" class="' + (i === settings.track ? 'sel' : '') + '">' + esc(t.name) + (t.id === weekTrack ? '<span class="badge">🏆</span>' : '') + '</button>').join('');
  $('trackSel').querySelectorAll('button').forEach(b => b.addEventListener('click', async () => { settings.track = +b.dataset.i; store.set('track', settings.track); refreshMenu(); await loadWorld(settings.track, settings.night); }));
  $('trackSel').parentElement.classList.toggle('hide', mode === 'cup');
  $('startBtn').textContent = owned(settings.car) ? MODES[mode].start : '🔒 ARAÇ KİLİTLİ';
  $('modeNote').textContent = MODES[mode].note + (mode === 'mp' && !online() ? ' (Giriş gerekli)' : '');
  document.querySelectorAll('#qual button').forEach(b => b.classList.toggle('sel', b.dataset.q === settings.quality));
  for (const [a, b] of [['optGas', 'pGas'], ['optSnd', 'pSnd'], ['optTilt', 'pTilt']]) {
    const v = a === 'optGas' ? !!settings.autoGas : a === 'optSnd' ? !settings.mute : !!settings.tilt;
    $(a).checked = v; $(b).checked = v;
  }
  $('optNight').checked = !!settings.night;
  $('optTilt').parentElement.classList.toggle('hide', !isTouch); $('pTilt').parentElement.classList.toggle('hide', !isTouch);
  $('keysHelp').classList.toggle('hide', isTouch);
  refreshLevel();
}
function renderQuests() {
  const box = $('questList');
  if (!online()) { box.innerHTML = '<div class="empty">Günlük görevler için SwipeUp\'a giriş yap.</div>'; $('questNote').textContent = ''; return; }
  if (!G.me) { box.innerHTML = '<div class="empty">Yükleniyor…</div>'; return; }
  const q = G.me.quests;
  box.innerHTML = q.list.map(x => {
    const done = x.got >= x.n;
    return '<div class="qi' + (x.claimed ? ' done' : '') + '"><span>' + esc(x.name) + '</span>' +
      (x.claimed ? '<small>Alındı ✓</small>' : done ? '<button class="btn sm" data-k="' + x.k + '">+' + q.xp + ' XP al</button>' : '<small>' + x.got + '/' + x.n + '</small>') +
      '<div class="pb"><i style="transform:scaleX(' + Math.min(1, x.got / x.n).toFixed(2) + ')"></i></div><span></span></div>';
  }).join('');
  $('questNote').textContent = q.bonus ? 'Günün bonusu alındı. Yarın yeni görevler gelir.' : 'Üçünü de bitirirsen +' + q.bonusXp + ' XP bonus. Seviye atladıkça yeni araçlar açılır.';
  box.querySelectorAll('button[data-k]').forEach(b => b.addEventListener('click', async () => {
    b.disabled = true;
    try { const r = await api('/quests/' + b.dataset.k + '/claim', {}); G.me = r; toast('+' + r.gained + ' XP' + (r.bonus ? ' · günün bonusu!' : '')); renderQuests(); refreshMenu(); }
    catch (e) { toast(e.message); b.disabled = false; }
  }));
}
let boardScope = 'friends', boardTrack = null;
async function loadBoard() {
  if (boardTrack == null) boardTrack = settings.track;
  document.querySelectorAll('#scope button').forEach(b => b.classList.toggle('sel', b.dataset.s === boardScope));
  $('boardTrack').innerHTML = TRACKS.map((t, i) => '<button data-i="' + i + '" class="' + (i === boardTrack ? 'sel' : '') + '">' + esc(t.name) + '</button>').join('');
  $('boardTrack').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { boardTrack = +b.dataset.i; loadBoard(); }));
  const list = $('boardList'), wk = $('weekBox');
  if (!online()) { list.innerHTML = '<div class="empty">Sıralamalar için SwipeUp\'a giriş yap.</div>'; wk.classList.add('hide'); return; }
  list.innerHTML = '<div class="empty">Yükleniyor…</div>';
  const track = TRACKS[boardTrack].id;
  try {
    const r = await api('/board?track=' + track + '&scope=' + boardScope);
    const wt = TRACKS.find(t => t.id === r.week.track);
    const left = Math.max(0, r.week.endsAt - Date.now()), days = Math.floor(left / 86400000), hrs = Math.floor((left % 86400000) / 3600000);
    wk.innerHTML = '<b>🏆 Haftalık turnuva: ' + esc(wt ? wt.name : '') + '</b><br>Bu pistteki en iyi turuna göre sıralanır. İlk üçe ' + r.week.prize.join(' / ') + ' jeton. Bitişe ' + days + ' gün ' + hrs + ' saat.';
    wk.classList.toggle('hide', boardScope !== 'week');
    if (boardScope === 'week' && r.week.track !== track) { list.innerHTML = '<div class="empty">Bu haftanın turnuva pisti ' + esc(wt ? wt.name : '') + '.</div>'; return; }
    if (!r.rows.length) { list.innerHTML = '<div class="empty">' + (boardScope === 'friends' ? 'Arkadaşlarından henüz kimse bu pistte tur atmamış. İlk rekoru sen kır, sonra meydan oku!' : 'Henüz kayıt yok.') + '</div>'; return; }
    list.innerHTML = r.rows.map(x => '<div class="lb' + (x.me ? ' me' : '') + '"><b>' + x.rank + '</b><span class="nm">' + esc(x.user.username) + '</span><span class="t">' + fmt(x.ms / 1000) + '</span>' +
      (x.me ? (boardScope === 'friends' ? '<button class="btn sm alt" data-ch="1">Meydan oku</button>' : '<span></span>') : x.ghost ? '<button class="btn sm" data-g="' + esc(x.user.id) + '">👻 Yarış</button>' : '<span></span>') + '</div>').join('');
    list.querySelectorAll('button[data-g]').forEach(b => b.addEventListener('click', () => { settings.track = boardTrack; mode = 'ghost'; startRace({ mode: 'ghost', ghostUid: b.dataset.g }); }));
    list.querySelectorAll('button[data-ch]').forEach(b => b.addEventListener('click', () => openFriendPick(track)));
  } catch (e) { list.innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; }
}
async function openFriendPick(track) {
  const prev = G.state === 'results' ? 'results' : 'menu';
  showScreen('friendPick');
  const box = $('pickList'); box.innerHTML = '<div class="empty">Yükleniyor…</div>';
  $('pickClose').onclick = () => showScreen(prev);
  try {
    const fr = await api('/friends');
    if (!fr.length) { box.innerHTML = '<div class="empty">Karşılıklı takipleştiğin ya da eşleştiğin biri yok.</div>'; return; }
    box.innerHTML = fr.map(f => '<div class="fr"><span class="' + (f.online ? 'on' : 'off') + '"></span><span class="nm">' + esc(f.username) + '</span><button class="btn sm" data-u="' + esc(f.id) + '">Gönder</button></div>').join('');
    box.querySelectorAll('button[data-u]').forEach(b => b.addEventListener('click', async () => {
      b.disabled = true;
      try { const r = await api('/challenge', { uid: b.dataset.u, track }); b.textContent = '✓'; toast(r.chat ? 'Meydan okuma sohbetine gönderildi.' : 'Meydan okuma bildirim olarak gönderildi.'); }
      catch (e) { toast(e.message); b.disabled = false; }
    }));
  } catch (e) { box.innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; }
}

// ---------- çok oyunculu ----------
async function createRoom() {
  if (!online()) { toast('Arkadaşlarla yarış için SwipeUp\'a giriş yap.'); return; }
  if (!owned(settings.car)) { toast('Bu araç kilitli.'); openTab('garage'); return; }
  try { const r = await api('/room', { track: TRACKS[settings.track].id, night: !!settings.night }); await openLobby(r); }
  catch (e) { toast(e.message); }
}
async function joinRoom(id) {
  if (!online()) { toast('Odaya katılmak için SwipeUp\'a giriş yap.'); return; }
  try { const r = await api('/room/' + encodeURIComponent(id) + '/join', {}); await openLobby(r); }
  catch (e) { toast(e.message); }
}
let sockBound = false;
async function openLobby(room) {
  G.room = room; G.state = 'lobby'; G.mode = 'mp';
  history.replaceState(null, '', '#room-' + room.id);
  const s = socket();
  if (!s) { toast('Canlı bağlantı kurulamadı.'); return; }
  if (!sockBound) { bindSocket(s); sockBound = true; }
  s.emit('race:join', { id: room.id });
  if (!owned(settings.car)) settings.car = 0;
  api('/room/' + room.id + '/car', { car: CAR_DEFS[settings.car].id, variant: variantOf(settings.car) }).catch(() => {});
  showScreen('lobby');
  renderLobby();
  const ti = TRACKS.findIndex(t => t.id === room.track);
  loadWorld(ti < 0 ? 0 : ti, room.night);
  try {
    const fr = await api('/friends');
    const box = $('friendList');
    box.innerHTML = fr.length ? fr.map(f => '<div class="fr"><span class="' + (f.online ? 'on' : 'off') + '"></span><span class="nm">' + esc(f.username) + '</span><button class="btn sm alt" data-u="' + esc(f.id) + '">Çağır</button></div>').join('') : '<div class="empty">Karşılıklı takipleştiğin biri yok. Bağlantıyı kopyalayıp gönderebilirsin.</div>';
    box.querySelectorAll('button[data-u]').forEach(b => b.addEventListener('click', async () => {
      b.disabled = true; try { await api('/room/' + G.room.id + '/invite', { userId: b.dataset.u }); b.textContent = '✓'; } catch (e) { toast(e.message); b.disabled = false; }
    }));
  } catch (e) { $('friendList').innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; }
}
function renderLobby() {
  const r = G.room; if (!r) return;
  const link = location.origin + '/race/#room-' + r.id;
  $('roomLink').textContent = link;
  const me = meId(), host = r.host === me;
  $('roomPlayers').innerHTML = r.players.filter(p => !p.left).map(p => {
    const d = CAR_DEFS[carIndex(p.car)];
    const av = p.avatar ? ' style="background-image:url(' + esc(p.avatar) + ')"' : '';
    return '<div class="pl"><span class="av"' + av + '>' + (p.avatar ? '' : esc((p.name || '?')[0].toUpperCase())) + '</span>' + esc(p.name) + (p.uid === r.host ? ' 👑' : '') + (p.uid === me ? ' (sen)' : '') + '<span class="c">' + esc(d.name) + '</span></div>';
  }).join('');
  $('hostOpts').classList.toggle('hide', !host);
  $('roomTrack').innerHTML = TRACKS.map((t, i) => '<button data-i="' + i + '" class="' + (t.id === r.track ? 'sel' : '') + '">' + esc(t.name) + '</button>').join('');
  $('roomTrack').querySelectorAll('button').forEach(b => b.addEventListener('click', () => api('/room/' + r.id + '/opts', { track: TRACKS[+b.dataset.i].id }).catch(e => toast(e.message))));
  $('roomNight').checked = !!r.night;
  const n = r.players.filter(p => !p.left).length;
  $('roomStart').classList.toggle('hide', !host);
  $('roomStart').disabled = n < 2;
  $('lobbyNote').textContent = host ? (n < 2 ? 'Başlatmak için en az bir arkadaşın daha odaya girmeli.' : n + ' oyuncu hazır.') : 'Oda sahibinin yarışı başlatması bekleniyor…';
}
function bindSocket(s) {
  s.on('race:room', async (r) => {
    if (!G.room || r.id !== G.room.id) return;
    const prev = G.room; G.room = r;
    if (G.state === 'lobby') {
      renderLobby();
      const ti = TRACKS.findIndex(t => t.id === r.track);
      if (world.trackIdx !== ti || world.night !== !!r.night) loadWorld(ti, r.night);
      if (r.status === 'racing' && prev.status !== 'racing') beginMpRace(r);
    } else if ((G.state === 'race' || G.state === 'results' || G.state === 'countdown') && G.mode === 'mp') {
      if (r.status === 'done' && G.state === 'results') renderResultRows();
      else if (r.status === 'done' && G.player && !G.player.finished) { G.finishShown = 0.01; }
    }
  });
  s.on('race:s', ({ u, d }) => {
    const r = G.remotes.get(u); if (!r) return;
    r.snaps.push({ t: performance.now(), x: d[0], z: d[1], yaw: d[2], vf: d[3], str: d[4], dist: d[5], y: d[6], flags: d[7] });
    if (r.snaps.length > 30) r.snaps.splice(0, r.snaps.length - 30);
  });
  s.on('race:item', (d) => { if (d.k === 'banana' && G.state === 'race') pickups.dropBanana(d.x, d.z, d.y, 'remote'); });
  s.on('connect', () => { if (G.room) s.emit('race:join', { id: G.room.id }); });
}
async function beginMpRace(r) {
  const ti = TRACKS.findIndex(t => t.id === r.track);
  await loadWorld(ti < 0 ? 0 : ti, r.night);
  clearCars(); if (menuView) { menuView.dispose(); menuView = null; }
  resetRaceState();
  const me = meId();
  const mine = r.players.find(p => p.uid === me);
  if (!mine) return;
  const pi = carIndex(mine.car);
  G.player = makeCar(CAR_DEFS[pi], mine.variant | 0, mine.slot); G.player.isPlayer = true; G.cars.push(G.player);
  for (const p of r.players) {
    if (p.uid === me || p.left) continue;
    const di = carIndex(p.car);
    const v = new CarView(CAR_DEFS[di], Math.min(CAR_DEFS[di].variants - 1, p.variant | 0), { night: world.night, blob: !QUALITY[settings.quality].shadows, name: p.name });
    views.push(v);
    const tmp = new CarSim(CAR_DEFS[di]); const g = gridSlot(p.slot); tmp.placeAt(world.cl, world.iFinish, g.lat, g.back);
    let rd = tmp.s - world.sFinish; if (rd > world.cl.L / 2) rd -= world.cl.L;
    v.root.position.set(tmp.x, tmp.y + 0.12, tmp.z); v.root.rotation.y = tmp.yaw;
    G.remotes.set(p.uid, { uid: p.uid, name: p.name, view: v, snaps: [{ t: performance.now(), x: tmp.x, z: tmp.z, yaw: tmp.yaw, vf: 0, str: 0, dist: rd, y: tmp.y, flags: 0 }], x: tmp.x, z: tmp.z, y: tmp.y, yaw: tmp.yaw, raceDist: rd, seen: true, vf: 0, steer: 0 });
  }
  G.mpStartLocal = r.startAt - (serverNow() - Date.now());
  G.countdown = Math.max(0.5, (G.mpStartLocal - Date.now()) / 1000); G.lastCount = 4;
  G.state = 'countdown';
  camYaw = G.player.yaw; camInit = true;
  if (isTouch) lockLandscape(true);
  showScreen('hud'); prepHud(); sfx.init(); warmup();
}
function sendState(dt) {
  G.sendT -= dt; if (G.sendT > 0) return; G.sendT = 1 / 15;
  const s = socket(); const p = G.player; if (!s || !p) return;
  const flags = (p.shieldT > 0 ? 1 : 0) | (p.nitroOn ? 2 : 0) | (p.spinT > 0 ? 4 : 0) | (p.boostT > 0 ? 8 : 0);
  s.volatile.emit('race:s', [+p.x.toFixed(2), +p.z.toFixed(2), +p.yaw.toFixed(3), +p.vf.toFixed(1), +p.steer.toFixed(2), +p.raceDist.toFixed(1), +p.y.toFixed(2), flags, G.lapNo]);
}
function leaveRoom() {
  if (!G.room) return;
  const id = G.room.id; G.room = null;
  const s = socket(); if (s) s.emit('race:leave');
  api('/room/' + id + '/leave', {}).catch(() => {});
}

// ---------- arayüz bağlama ----------
function bindUI() {
  hud.pos = $('hPos'); hud.lap = $('hLap'); hud.time = $('hTime'); hud.lapT = $('hLapT'); hud.best = $('hBest');
  hud.spd = $('hSpd'); hud.nitroFill = $('nitroFill'); hud.fps = $('fps');
  $('fps').classList.toggle('hide', !settings.fps);
  const click = (id, fn) => $(id).addEventListener('click', e => { e.preventDefault(); sfx.init(); fn(e); });
  document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => openTab(b.dataset.t)));
  click('toGarage', () => openTab('garage'));
  click('prevCar', () => { settings.car = (settings.car + CAR_DEFS.length - 1) % CAR_DEFS.length; store.set('car', settings.car); refreshMenu(); refreshPreview(); });
  click('nextCar', () => { settings.car = (settings.car + 1) % CAR_DEFS.length; store.set('car', settings.car); refreshMenu(); refreshPreview(); });
  click('unlockBtn', async () => {
    const d = CAR_DEFS[settings.car];
    try { G.me = await api('/unlock', { car: d.id }); toast('🔓 ' + d.name + ' açıldı!'); refreshMenu(); }
    catch (e) { toast(e.status === 402 ? e.message + ' Jeton almak için SwipeUp mağazasına git.' : e.message, 3600); }
  });
  document.querySelectorAll('#mode button').forEach(b => b.addEventListener('click', () => { mode = b.dataset.m; store.set('mode', mode); refreshMenu(); }));
  document.querySelectorAll('#diff button').forEach((b, i) => b.addEventListener('click', () => { settings.diff = i; store.set('diff', i); refreshMenu(); }));
  document.querySelectorAll('#scope button').forEach(b => b.addEventListener('click', () => { boardScope = b.dataset.s; loadBoard(); }));
  document.querySelectorAll('#qual button').forEach(b => b.addEventListener('click', () => { if (settings.quality === b.dataset.q) return; settings.quality = b.dataset.q; store.set('quality', settings.quality); applyQuality(false); refreshMenu(); }));
  $('optNight').addEventListener('change', async e => { settings.night = e.target.checked; store.set('night', settings.night); await loadWorld(settings.track, settings.night); });
  const gasT = e => { settings.autoGas = e.target.checked; store.set('autoGas', settings.autoGas); $('bGas').classList.toggle('hide', settings.autoGas); $('pedals').classList.toggle('auto', !!settings.autoGas); refreshMenu(); };
  const sndT = e => { settings.mute = !e.target.checked; store.set('mute', settings.mute); sfx.setMute(settings.mute); refreshMenu(); };
  const tiltT = async e => {
    const on = e.target.checked;
    const ok = await enableTilt(on);
    if (on && !ok) { toast('Hareket sensörüne izin verilmedi.'); e.target.checked = false; settings.tilt = false; }
    else settings.tilt = on;
    store.set('tilt', settings.tilt); document.body.classList.toggle('tilt', !!(settings.tilt && tiltState.on)); refreshMenu();
  };
  $('optGas').addEventListener('change', gasT); $('pGas').addEventListener('change', gasT);
  $('optSnd').addEventListener('change', sndT); $('pSnd').addEventListener('change', sndT);
  $('optTilt').addEventListener('change', tiltT); $('pTilt').addEventListener('change', tiltT);
  click('startBtn', () => { if (mode === 'mp') createRoom(); else startRace({ mode }); });
  click('pauseBtn', togglePause);
  click('resumeBtn', resume);
  click('restartBtn', () => startRace({ mode: G.mode === 'mp' ? 'race' : G.mode, ghostUid: G.ghostTarget ? G.ghostTarget.uid : undefined }));
  click('menuBtn', toMenu);
  click('againBtn', () => { if (G.mode === 'mp') { leaveRoom(); createRoom(); } else startRace({ mode: G.mode, ghostUid: G.ghostTarget ? G.ghostTarget.uid : undefined }); });
  click('nextBtn', () => { if (G.cup) { G.cup.round++; G.cup.scored = false; startRace({ mode: 'cup', next: true }); } });
  click('challengeBtn', () => openFriendPick(TRACKS[world.trackIdx].id));
  click('resMenuBtn', toMenu);
  click('resetBtn', resetPlayer);
  click('copyBtn', async () => { try { await navigator.clipboard.writeText($('roomLink').textContent); toast('Bağlantı kopyalandı.'); } catch (e) { toast('Kopyalanamadı, bağlantıyı elle seç.'); } });
  click('roomStart', () => api('/room/' + G.room.id + '/start', {}).catch(e => toast(e.message)));
  click('roomLeave', () => toMenu());
  $('roomNight').addEventListener('change', e => api('/room/' + G.room.id + '/opts', { night: e.target.checked }).catch(er => toast(er.message)));
  $('itemSlot').addEventListener('pointerdown', e => { e.preventDefault(); if (G.player && G.state === 'race') useItem(G.player); });
  bindSteer($('steer'));
  bindHold($('bGas'), 'gas'); bindHold($('bBrake'), 'brake'); bindHold($('bNitro'), 'nitro'); bindHold($('bDrift'), 'drift'); bindHold($('bItem'), 'use');
  for (const id of ['touch', 'hud']) $(id).addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if ((G.state === 'race' || G.state === 'countdown') && G.mode !== 'mp') togglePause(); sfx.suspend(); }
    else { lastT = performance.now(); if (G.state !== 'paused') sfx.resume(); }
  });
}

// ---------- performans: uyarlanır çözünürlük ----------
let fpsAvg = 60, perfT = 0, perfBad = 0, perfGood = 0, frameMsAvg = 16.7;
function perfTick(dtMs) {
  frameMsAvg += (dtMs - frameMsAvg) * 0.05;
  fpsAvg = 1000 / frameMsAvg;
  perfT += dtMs;
  if (perfT < 500) return;
  perfT = 0;
  if (!['race', 'countdown', 'menu'].includes(G.state)) return;
  if (frameMsAvg > 21) { perfBad++; perfGood = 0; } else if (frameMsAvg < 17.8) { perfGood++; perfBad = 0; } else { perfBad = 0; perfGood = 0; }
  if (perfBad >= 3 && view.dpr > view.minDpr + 0.01) { setDpr(Math.max(view.minDpr, view.dpr - 0.15)); perfBad = 0; }
  else if (perfGood >= 12 && view.dpr < view.maxDpr - 0.01) { setDpr(Math.min(view.maxDpr, view.dpr + 0.1)); perfGood = 0; }
}

// ---------- ana döngü ----------
let lastT = performance.now(), time = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dtMs = now - lastT; lastT = now;
  if (dtMs < 0) dtMs = 0;
  perfTick(Math.min(dtMs, 100));
  const dt = Math.min(dtMs / 1000, 0.1);
  time += dt;
  if (G.state === 'loading' || !world) return;
  if (G.state === 'paused') { renderer.render(scene, camera); return; }
  pickups.update(time, dt);
  smoke.update(dt);
  envTick(dt);
  if (G.state === 'menu' || G.state === 'lobby' || G.state === 'pick') {
    updateMenuCamera(dt); updateSun();
    renderer.render(scene, camera);
    return;
  }
  const p = G.player;
  if (!p) { renderer.render(scene, camera); return; }
  let alpha = 1;
  if (G.state === 'countdown') {
    if (G.mode === 'mp') G.countdown = (G.mpStartLocal - Date.now()) / 1000; else G.countdown -= dt;
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
    if (G.resetCd > 0) G.resetCd -= dt;
    if (G.finishShown > 0) { G.finishShown -= dt; if (G.finishShown <= 0 && G.state === 'race') showResults(); }
    if (G.state === 'race') {
      sfx.engine(Math.min(1.25, p.vf / p.def.top), p.in.thr, true);
      sfx.skid(p.offroad ? 0 : Math.max(0, Math.abs(p.vr) - 3) * 0.05 + (p.in.hb && p.speed() > 5 ? 0.08 : 0));
    } else { sfx.engine(0, 0, false); sfx.skid(0); }
    if (G.mode === 'mp' && G.state === 'race') sendState(dt);
  }
  if (G.remotes.size) updateRemotes();
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

// ---------- açılış ----------
async function boot() {
  const bar = $('loadBar');
  const setP = p => { bar.style.transform = 'scaleX(' + p.toFixed(3) + ')'; };
  if (online()) api('/me').then(r => { G.me = r; if (G.state === 'menu') refreshMenu(); }).catch(() => {});
  await loadAll(p => setP(p * 0.9), CAR_DEFS, TOY_SCALE, RACING_SCALE);
  $('loadText').textContent = 'Pist kuruluyor…';
  smoke = new Smoke(64); skids = new Skids(360); pickups = new Pickups();
  bindUI();
  applyQuality(true);
  if (settings.tilt && isTouch) { settings.tilt = false; } // izin her açılışta kullanıcı dokunuşuyla istenir
  await loadWorld(settings.track, settings.night);
  refreshPreview();
  refreshMenu();
  setP(1);
  await new Promise(r => requestAnimationFrame(r));
  updateMenuCamera(0); updateSun();
  warmup();
  renderer.render(scene, camera);
  G.state = 'menu';
  showScreen('menu');
  $('loader').classList.add('hide');
  window.__game = { G, get world() { return world; }, renderer, scene, camera, startRace, settings, keys, touch };
  // bağlantıyla gelinmişse: #room-<id> ya da #ghost-<pist>-<kullanıcı>
  const h = location.hash.slice(1);
  if (h.startsWith('room-')) joinRoom(h.slice(5));
  else if (h.startsWith('ghost-')) {
    const rest = h.slice(6), ti = TRACKS.findIndex(t => rest.startsWith(t.id + '-'));
    if (ti >= 0) { settings.track = ti; mode = 'ghost'; refreshMenu(); startRace({ mode: 'ghost', ghostUid: rest.slice(TRACKS[ti].id.length + 1) }); }
  }
}
boot().catch(e => { console.error(e); $('loadText').textContent = 'Yükleme hatası: ' + (e && e.message || e); });
requestAnimationFrame(frame);
