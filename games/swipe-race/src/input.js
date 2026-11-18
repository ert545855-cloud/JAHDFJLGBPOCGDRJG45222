// Giriş: klavye, dokunmatik tuşlar ve telefonu eğerek sürüş.
import { $, settings, view } from './core.js';
import { sfx } from './audio.js';

export const keys = Object.create(null);
export const touch = { steer: new Map(), gas: false, brake: false, nitro: false, drift: false, use: false };
export const keyActions = {}; // { KeyP: fn, ... } (main.js doldurur)

window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (!e.repeat && keyActions[e.code]) keyActions[e.code]();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; touch.steer.clear(); touch.gas = touch.brake = touch.nitro = touch.drift = touch.use = false; });

export function bindHold(el, prop) {
  const on = e => { e.preventDefault(); touch[prop] = true; el.classList.add('on'); try { el.setPointerCapture(e.pointerId); } catch (_) { /* */ } sfx.init(); };
  const off = () => { touch[prop] = false; el.classList.remove('on'); };
  el.addEventListener('pointerdown', on);
  el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('lostpointercapture', off);
}
export function bindSteer(el) {
  const upd = e => {
    const r = el.getBoundingClientRect();
    const left = view.rot ? e.clientY < r.top + r.height / 2 : e.clientX < r.left + r.width / 2;
    touch.steer.set(e.pointerId, left ? -1 : 1);
    refreshSteerUI();
  };
  el.addEventListener('pointerdown', e => { e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch (_) { /* */ } upd(e); sfx.init(); });
  el.addEventListener('pointermove', e => { if (touch.steer.has(e.pointerId)) upd(e); });
  const end = e => { touch.steer.delete(e.pointerId); refreshSteerUI(); };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); el.addEventListener('lostpointercapture', end);
}
function touchSteer() { let s = 0; for (const v of touch.steer.values()) s += v; return Math.max(-1, Math.min(1, s)); }
function refreshSteerUI() { const s = touchSteer(); $('sl').classList.toggle('on', s < 0); $('sr').classList.toggle('on', s > 0); }

// ---------- eğerek sürüş ----------
// Yerçekimi vektörü cihaz ekseninde okunur; içeriğin "yukarı" yönüne göre telefonun ne kadar
// döndürüldüğü direksiyon açısı olur (direksiyon gibi tutulan telefon).
const tilt = { on: false, value: 0, ok: false, gx: 0, gy: 0, ios: /iPhone|iPad|iPod/.test(navigator.userAgent) };
function onMotion(e) {
  const g = e.accelerationIncludingGravity; if (!g || g.x == null) return;
  const k = tilt.ios ? -1 : 1;
  tilt.gx = tilt.gx * 0.6 + g.x * k * 0.4; tilt.gy = tilt.gy * 0.6 + g.y * k * 0.4;
  let ang = 0;
  try { ang = (screen.orientation && screen.orientation.angle) || (typeof window.orientation === 'number' ? window.orientation : 0); } catch (_) { ang = 0; }
  const theta = ((ang + (view.rot ? 90 : 0)) * Math.PI) / 180;
  const ux = Math.sin(theta), uy = Math.cos(theta), rx = Math.cos(theta), ry = -Math.sin(theta);
  const up = tilt.gx * ux + tilt.gy * uy, side = tilt.gx * rx + tilt.gy * ry;
  const phi = Math.atan2(side, Math.max(0.5, Math.abs(up)));
  const dz = 0.05, max = 0.42;
  const v = Math.abs(phi) < dz ? 0 : (phi - Math.sign(phi) * dz) / (max - dz);
  tilt.value = Math.max(-1, Math.min(1, -v));
  tilt.ok = true;
}
export async function enableTilt(on) {
  if (!on) { tilt.on = false; window.removeEventListener('devicemotion', onMotion); return true; }
  try {
    if (window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function') {
      const r = await DeviceMotionEvent.requestPermission();
      if (r !== 'granted') return false;
    }
  } catch (e) { return false; }
  if (!window.DeviceMotionEvent) return false;
  window.addEventListener('devicemotion', onMotion);
  tilt.on = true;
  return true;
}
export const tiltState = tilt;

export function readPlayerInput(inp) {
  const k = keys;
  let str = 0;
  if (k.ArrowLeft || k.KeyA) str -= 1;
  if (k.ArrowRight || k.KeyD) str += 1;
  str += touchSteer();
  if (tilt.on && tilt.ok && str === 0) str = tilt.value;
  inp.str = Math.max(-1, Math.min(1, str));
  const brk = !!(k.ArrowDown || k.KeyS || touch.brake);
  const gas = !!(k.ArrowUp || k.KeyW || touch.gas || settings.autoGas);
  inp.brk = brk ? 1 : 0;
  inp.thr = gas && !brk ? 1 : 0;
  inp.hb = (k.Space || touch.drift) ? 1 : 0;
  inp.nitro = (k.ShiftLeft || k.ShiftRight || k.KeyN || touch.nitro) ? 1 : 0;
  inp.use = (k.KeyE || k.KeyQ || touch.use) ? 1 : 0;
}
