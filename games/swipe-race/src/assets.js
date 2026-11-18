// Varlıklar: tek paket (assets.json) içindeki GLB'ler ve dokular.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const models = {};    // statik model adı -> { parts:[{geo, mat}], center, box }
export const templates = {}; // araç modeli adı -> { root, wheels }
export const geos = {};      // tek geometriye indirilmiş küçük modeller (altın, kutu, muz, duman, ağaç)
export const tex = [];       // oyuncak kiti dokuları (renk çeşitleri)

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
  const bin = atob(JSON.parse(text)[0]), n = bin.length, out = new Uint8Array(n);
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
  let img = null;
  if (window.createImageBitmap) { try { img = await createImageBitmap(blob, { imageOrientation: 'none', premultiplyAlpha: 'none' }); } catch (e) { img = null; } }
  if (!img) img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(blob); });
  const t = new THREE.Texture(img);
  t.colorSpace = THREE.SRGBColorSpace; t.flipY = false;
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

// Statik model: parçalar model uzayında; renk ya köşe rengi (Racing Kit) ya da UV (Toy Kit)
function extractModel(name, gltf, textured) {
  const root = gltf.scene; root.updateMatrixWorld(true);
  const parts = []; const box = new THREE.Box3();
  root.traverse(o => {
    if (!o.isMesh) return;
    const g = o.geometry, geo = new THREE.BufferGeometry();
    geo.setAttribute('position', g.attributes.position.clone());
    if (g.attributes.normal) geo.setAttribute('normal', g.attributes.normal.clone());
    if (textured && g.attributes.uv) geo.setAttribute('uv', g.attributes.uv.clone());
    if (g.index) geo.setIndex(g.index.clone());
    else { const n = g.attributes.position.count, idx = new Uint32Array(n); for (let i = 0; i < n; i++) idx[i] = i; geo.setIndex(new THREE.BufferAttribute(idx, 1)); }
    geo.applyMatrix4(o.matrixWorld);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (!textured) {
      const c = o.material.color || new THREE.Color(1, 1, 1);
      const n = geo.attributes.position.count, col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    geo.computeBoundingBox(); box.union(geo.boundingBox);
    parts.push({ geo, mat: o.material.name, textured });
  });
  models[name] = { parts, center: box.getCenter(new THREE.Vector3()), box };
}
export function matColor(model, matName) {
  const m = models[model]; if (!m) return null;
  for (const p of m.parts) if (p.mat === matName && p.geo.attributes.color) { const a = p.geo.attributes.color.array; return new THREE.Color(a[0], a[1], a[2]); }
  return null;
}

// Küçük modelleri tek geometriye indir, ortala ve en uzun kenarı `size` olacak şekilde ölçekle
function flatGeo(gltf, size, keepColor) {
  const parts = []; gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(o => {
    if (!o.isMesh) return;
    const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld);
    if (keepColor) {
      const c = o.material.color || new THREE.Color(1, 1, 1), n = g.attributes.position.count, col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.deleteAttribute('uv');
    }
    parts.push(g);
  });
  const geo = parts.length > 1 ? mergeGeometries(parts, false) : parts[0];
  geo.computeBoundingBox();
  const c = geo.boundingBox.getCenter(new THREE.Vector3()), sz = geo.boundingBox.getSize(new THREE.Vector3());
  geo.translate(-c.x, -geo.boundingBox.min.y, -c.z);
  const s = size / Math.max(sz.x, sz.y, sz.z); geo.scale(s, s, s);
  geo.computeBoundingSphere();
  return geo;
}

// Araç şablonu: iki kitte yön, tekerlek adları ve ölçek farklı; hepsi -z'ye bakan, zemine oturan,
// tekerlekleri kendi merkezinde dönen tek biçime getirilir.
const WHEEL = /^wheel(-[fb][lr]|(Front|Back)(Left|Right))$/;
const isFront = n => /-f[lr]$|Front/.test(n);
const lambertCache = new Map();
// Tekerlekleri kendi merkezlerine al (orijinal sahnede bir kez; kopyalar bunu devralır)
function centerWheels(scene) {
  if (scene.userData.wheelsCentered) return;
  scene.userData.wheelsCentered = true;
  scene.updateMatrixWorld(true);
  scene.traverse(o => {
    if (!WHEEL.test(o.name)) return;
    const box = new THREE.Box3(); const inv = new THREE.Matrix4().copy(o.matrixWorld).invert();
    o.traverse(m => { if (m.isMesh) { m.geometry.computeBoundingBox(); box.union(m.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld))); } });
    const c = box.getCenter(new THREE.Vector3());
    if (c.length() > 1e-3) {
      o.traverse(m => { if (m.isMesh) m.geometry.translate(-c.x, -c.y, -c.z); });
      o.position.add(c.clone().multiply(o.scale).applyQuaternion(o.quaternion));
    }
    o.userData.radius = (box.max.y - box.min.y) / 2;
  });
  scene.updateMatrixWorld(true);
}
function prepTemplate(gltf, scale, toyMat) {
  const src = gltf.scene; src.updateMatrixWorld(true);
  let fz = 0, bz = 0, nf = 0, nb = 0;
  src.traverse(o => {
    if (!WHEEL.test(o.name)) return;
    const wz = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld).z;
    if (isFront(o.name)) { fz += wz; nf++; } else { bz += wz; nb++; }
  });
  src.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(src);
  const c = box.getCenter(new THREE.Vector3());
  src.position.set(-c.x, -box.min.y, -c.z);
  const holder = new THREE.Group(); holder.add(src);
  if (nf && nb && fz / nf > bz / nb) holder.rotation.y = Math.PI; // önü +z'de: çevir
  holder.scale.setScalar(scale);
  src.traverse(o => {
    if (!o.isMesh) return;
    if (toyMat) o.material = toyMat;
    else {
      const k = o.material.color.getHexString();
      if (!lambertCache.has(k)) lambertCache.set(k, new THREE.MeshLambertMaterial({ color: o.material.color.clone() }));
      o.material = lambertCache.get(k);
    }
    o.castShadow = true; o.receiveShadow = true;
  });
  const root = new THREE.Group(); root.add(holder);
  return { root, scale, length: (box.max.z - box.min.z) * scale, width: (box.max.x - box.min.x) * scale };
}
export function carMaterials() { return [...lambertCache.values()]; }
export const isWheelName = n => WHEEL.test(n);
export const isFrontWheel = isFront;

export async function loadAll(onProg, carDefs, toyScale, racingScale) {
  const ab = await fetchPack(p => onProg(p * 0.7));
  const files = unpack(ab);
  const loader = new GLTFLoader();
  const parse = buf => new Promise((res, rej) => loader.parse(buf, '', res, rej));
  for (const k of ['tex0', 'tex1', 'tex2']) tex.push(await loadTexture(files[k]));
  const toyMats = tex.map(t => new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide }));
  const names = Object.keys(files).filter(n => !n.startsWith('tex'));
  const gltfs = {}; let done = 0;
  await Promise.all(names.map(async n => { gltfs[n] = await parse(files[n]); onProg(0.7 + 0.25 * (++done / names.length)); }));
  const carModels = new Set(carDefs.flatMap(d => d.models));
  for (const n of names) {
    if (carModels.has(n)) continue;
    if (n === 'item-coin-gold') geos.coin = flatGeo(gltfs[n], 1.9);
    else if (n === 'item-box') geos.box = flatGeo(gltfs[n], 2.2);
    else if (n === 'item-banana') geos.banana = flatGeo(gltfs[n], 1.6);
    else if (n === 'smoke') geos.smoke = flatGeo(gltfs[n], 1.4);
    else if (n === 'tree' || n === 'tree-pine') extractModel(n, gltfs[n], true);
    else extractModel(n, gltfs[n], false);
  }
  // araçlar: oyuncak kitinde renk = doku (her doku için ayrı şablon), yarış kitinde renk = ayrı model
  for (const d of carDefs) {
    d.models.forEach((m, v) => {
      const key = d.kit === 'toy' ? m + '#' + v : m;
      if (templates[key]) return;
      const g = gltfs[m];
      centerWheels(g.scene);
      // her şablon için ayrı sahne kopyası (geometriler paylaşılır)
      const clone = { scene: g.scene.clone(true) };
      templates[key] = prepTemplate(clone, d.kit === 'toy' ? toyScale : racingScale, d.kit === 'toy' ? toyMats[v] : null);
    });
  }
  return { toyMats };
}
export function templateKey(def, variant) { return def.kit === 'toy' ? def.models[variant] + '#' + variant : def.models[variant]; }
