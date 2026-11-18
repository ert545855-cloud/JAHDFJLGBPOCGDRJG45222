// Araç görünümü: şablon kopyası + tekerlek animasyonu + far, kalkan, gölge lekesi, hayalet, isim etiketi.
import * as THREE from 'three';
import { scene, allMats } from './core.js';
import { templates, templateKey, isWheelName, isFrontWheel } from './assets.js';

let shared = null;
function sharedRes() {
  if (shared) return shared;
  const blob = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 4, 32, 32, 31);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
  })();
  const pool = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,245,215,0.9)'); gr.addColorStop(1, 'rgba(255,240,200,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
  })();
  shared = {
    blobGeo: new THREE.PlaneGeometry(3.2, 5.0).rotateX(-Math.PI / 2),
    blobMat: new THREE.MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false }),
    beamGeo: (() => { const g = new THREE.ConeGeometry(2.4, 16, 16, 1, true); g.rotateX(Math.PI / 2); g.translate(0, 0, -8); return g; })(),
    beamMat: new THREE.MeshBasicMaterial({ color: 0xfff1c8, transparent: true, opacity: 0.09, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }),
    poolGeo: new THREE.PlaneGeometry(9, 15).rotateX(-Math.PI / 2),
    poolMat: new THREE.MeshBasicMaterial({ map: pool, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }),
    shieldGeo: new THREE.SphereGeometry(3.1, 20, 12),
    shieldMat: new THREE.MeshBasicMaterial({ color: 0x6fd3ff, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }),
  };
  allMats.push(shared.blobMat, shared.beamMat, shared.poolMat, shared.shieldMat);
  return shared;
}

const ghostMats = new Map();
function ghostMat(m) {
  if (!ghostMats.has(m)) { const g = m.clone(); g.transparent = true; g.opacity = 0.42; g.depthWrite = false; ghostMats.set(m, g); allMats.push(g); }
  return ghostMats.get(m);
}

export class CarView {
  constructor(def, variant, opts = {}) {
    const R = sharedRes();
    this.root = new THREE.Group(); this.tilt = new THREE.Group(); this.root.add(this.tilt);
    const tpl = templates[templateKey(def, variant)];
    const m = tpl.root.clone(true);
    this.tilt.add(m);
    this.wheels = [];
    m.traverse(o => {
      if (isWheelName(o.name)) { o.rotation.order = 'YXZ'; this.wheels.push({ o, front: isFrontWheel(o.name), r: (o.userData.radius || 0.125) * tpl.scale, baseY: o.rotation.y }); }
      if (o.isMesh && opts.ghost) { o.material = ghostMat(o.material); o.castShadow = false; }
    });
    this.length = tpl.length;
    this.blob = new THREE.Mesh(R.blobGeo, R.blobMat); this.blob.position.y = 0.05; this.blob.renderOrder = 1;
    this.blob.visible = !!opts.blob && !opts.ghost;
    this.root.add(this.blob);
    // farlar (gece)
    this.lights = new THREE.Group();
    for (const sx of [-0.7, 0.7]) { const b = new THREE.Mesh(R.beamGeo, R.beamMat); b.position.set(sx, 0.75, -tpl.length / 2 + 0.2); this.lights.add(b); }
    const pool = new THREE.Mesh(R.poolGeo, R.poolMat); pool.position.set(0, 0.08, -tpl.length / 2 - 8); this.lights.add(pool);
    this.lights.visible = !!opts.night && !opts.ghost;
    this.root.add(this.lights);
    this.shield = new THREE.Mesh(R.shieldGeo, R.shieldMat); this.shield.position.y = 1.0; this.shield.visible = false;
    this.root.add(this.shield);
    this.roll = 0; this.pitch = 0; this.spin = 0; this.smokeT = 0; this.skidPrev = null;
    this.tag = null;
    if (opts.name) this.setName(opts.name, opts.tagColor);
    scene.add(this.root);
  }
  setName(text, color = '#ffffff') {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    g.font = '700 30px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const w = Math.min(240, g.measureText(text).width + 28);
    g.fillStyle = 'rgba(20,26,40,0.7)'; g.beginPath(); g.roundRect ? g.roundRect(128 - w / 2, 8, w, 48, 22) : g.rect(128 - w / 2, 8, w, 48); g.fill();
    g.fillStyle = color; g.fillText(text.slice(0, 14), 128, 33);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true });
    this.tag = new THREE.Sprite(mat); this.tag.scale.set(6, 1.5, 1); this.tag.position.y = 3.6;
    this.root.add(this.tag);
  }
  setNight(on) { this.lights.visible = on; }
  setBlob(on) { this.blob.visible = on; }
  dispose() {
    scene.remove(this.root);
    if (this.tag) { this.tag.material.map.dispose(); this.tag.material.dispose(); }
  }
}
