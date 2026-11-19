// Ortak çekirdek: ayarlar, ekran kartı, sahne, kamera, ışıklar, ekran düzeni ve grafik kalitesi.
import * as THREE from 'three';

export const $ = id => document.getElementById(id);
export const isTouch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
export const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));

export const store = {
  get(k, d) { try { const v = localStorage.getItem('swiperace_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('swiperace_' + k, JSON.stringify(v)); } catch (e) { /* yok */ } },
};
// Zayıf cihaz: az çekirdek ya da az bellek → ilk açılışta düşük kalite (akıcılık önce)
export const lowEnd = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 3;
export const settings = {
  quality: store.get('quality', lowEnd ? 'low' : isTouch ? 'mid' : 'high'),
  qualityUser: store.get('qualityUser', false),
  autoGas: store.get('autoGas', isTouch),
  mute: store.get('mute', false),
  car: store.get('car', 0),
  variants: store.get('variants', {}),
  diff: store.get('diff', 1) % 3,
  track: store.get('track', 0),
  night: store.get('night', false),
  tilt: store.get('tilt', false),
  fps: store.get('fps', false),
};
export const QUALITY = {
  high: { dpr: 2, map: 2048, shadows: true, soft: true, minDpr: 1, label: 'Yüksek' },
  mid: { dpr: 1.5, map: 1024, shadows: true, soft: false, minDpr: 0.75, label: 'Orta' },
  low: { dpr: 1, map: 512, shadows: false, soft: false, minDpr: 0.6, label: 'Düşük' },
};

export const canvas = $('c');
export let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas, antialias: (window.devicePixelRatio || 1) < 1.9 && settings.quality !== 'low',
    powerPreference: 'high-performance', stencil: false, alpha: false,
  });
} catch (e) {
  $('loadText').textContent = 'WebGL başlatılamadı. Tarayıcın 3D grafik desteklemiyor olabilir.';
  throw e;
}
renderer.shadowMap.autoUpdate = true;
canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); $('loadText').textContent = 'Grafik bağlamı kayboldu, yeniden yükleniyor…'; $('loader').classList.remove('hide'); }, false);
canvas.addEventListener('webglcontextrestored', () => location.reload(), false);

export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(60, 1, 0.5, 900);
export const hemi = new THREE.HemisphereLight(0xffffff, 0x9cbf8a, 1.9);
export const sun = new THREE.DirectionalLight(0xfff3e0, 2.2);
sun.shadow.camera.left = -50; sun.shadow.camera.right = 50;
sun.shadow.camera.top = 50; sun.shadow.camera.bottom = -50;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 320;
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.06;
scene.add(hemi, sun, sun.target);

// paylaşılan malzemeler (kalite değişince yeniden derlenir)
export const staticMat = new THREE.MeshLambertMaterial({ vertexColors: true });
export const allMats = [staticMat];

// ---------- ekran düzeni: yarış her zaman yatay ----------
export const stage = $('stage');
export const view = { rot: false, w: 1, h: 1, dpr: 1, maxDpr: 1, minDpr: 0.6, raceMode: () => false };
let lastSize = '';
function fitStage() {
  const W = window.innerWidth, H = window.innerHeight;
  view.rot = isTouch && H > W && view.raceMode();
  document.body.classList.toggle('rot', view.rot);
  const w = view.rot ? H : W, h = view.rot ? W : H;
  if (view.rot) { stage.style.width = w + 'px'; stage.style.height = h + 'px'; stage.style.left = W + 'px'; }
  else { stage.style.width = stage.style.height = stage.style.left = ''; }
  stage.style.setProperty('--vw', (w / 100) + 'px'); stage.style.setProperty('--vh', (h / 100) + 'px');
  document.body.classList.toggle('port', w < h);
  document.body.classList.toggle('short', h <= 500);
  view.w = w; view.h = h;
  return [w, h];
}
export function baseFov() { return camera.aspect < 1 ? 72 : 60; }
export function resize() {
  const [w, h] = fitStage();
  const key = w + 'x' + h + '@' + renderer.getPixelRatio();
  if (key !== lastSize) { lastSize = key; renderer.setSize(w, h, false); }
  camera.aspect = w / h;
  camera.fov = baseFov();
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
export function lockLandscape(on) {
  try {
    const o = screen.orientation;
    if (!o) return;
    if (on && o.lock) { const p = o.lock('landscape'); if (p && p.catch) p.catch(() => {}); }
    else if (!on && o.unlock) o.unlock();
  } catch (e) { /* desteklenmiyorsa döndürülmüş sahne yeterli */ }
}
export function setDpr(v) { view.dpr = v; renderer.setPixelRatio(v); resize(); }

export function warmup() { try { renderer.compile(scene, camera); } catch (e) { /* yok say */ } }

export const qualityHooks = [];
export function applyQuality(first) {
  const q = QUALITY[settings.quality];
  view.maxDpr = Math.min(window.devicePixelRatio || 1, q.dpr);
  view.minDpr = Math.min(view.maxDpr, q.minDpr);
  view.dpr = view.maxDpr;
  renderer.setPixelRatio(view.dpr);
  resize();
  renderer.shadowMap.enabled = q.shadows;
  renderer.shadowMap.type = q.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  sun.castShadow = q.shadows;
  if (sun.shadow.mapSize.x !== q.map) {
    sun.shadow.mapSize.set(q.map, q.map);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  }
  for (const f of qualityHooks) f(q);
  if (!first) { for (const m of allMats) m.needsUpdate = true; warmup(); }
}
