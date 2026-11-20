import * as T from '/vendor/three/three.module.js';
import { BEACH_CLASS, GRID, START, STOPS, VISIT_RADIUS } from './layout.js';
import { makeWorld } from './world.js';
import { addNeighbors, loadAvatars, makePlayer } from './people.js';
import { createSea, loadArt } from './art.js';

const byId = id => document.getElementById(id);
const view = byId('scene');
const intro = byId('intro');
const start = byId('start');
const touchDevice = matchMedia('(pointer: coarse)').matches;

async function init() {
  let renderer;
  try {
    renderer = new T.WebGLRenderer({ antialias: !touchDevice, powerPreference: 'high-performance' });
  } catch {
    byId('how').textContent = 'Şehri açmak için WebGL 2 destekli bir tarayıcı gerekiyor.';
    return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, touchDevice ? 1.25 : 1.6));
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.23;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  view.append(renderer.domElement);

  const [art, avatars] = await Promise.all([
    loadArt(Math.min(renderer.capabilities.getMaxAnisotropy(), touchDevice ? 2 : 8)),
    loadAvatars(),
  ]);
  const scene = new T.Scene();
  scene.fog = new T.FogExp2(0x9cc4c2, .0030);
  scene.background = art.sky ?? new T.Color(0x9eb9c1);
  scene.environment = art.sky;
  scene.environmentIntensity = .48;
  scene.backgroundRotation.y = -.45;
  scene.environmentRotation.y = -.45;
  const camera = new T.PerspectiveCamera(57, 1, .1, 630);
  const ambient = new T.HemisphereLight(0xe0f0f6, 0xc6b589, 1.78);
  const sun = new T.DirectionalLight(0xffe6bd, 2.62);
  sun.position.set(-95, 108, 65);
  sun.castShadow = true;
  sun.shadow.autoUpdate = false;
  sun.shadow.needsUpdate = true;
  sun.shadow.mapSize.setScalar(touchDevice ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -125, right: 125, top: 118, bottom: -118, near: 15, far: 310 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.normalBias = .055;
  sun.shadow.bias = -.00014;
  sun.shadow.radius = 2.1;
  scene.add(ambient, sun);
  const sea = createSea(scene);
  const { walls, markerGroups } = makeWorld(scene, art);
  const player = makePlayer(avatars);
  const { root, shadow } = player;
  const updateNeighbors = addNeighbors(scene, ground, avatars);
  scene.add(root, shadow);
  const keys = new Set();
  const joystick = document.querySelector('.joystick');
  const stick = new T.Vector2();
  const pressed = new T.Vector2();
  const lookRay = new T.Ray();
  const intersection = new T.Vector3();
  const focus = new T.Vector3();
  const cameraTarget = new T.Vector3();
  const eye = new T.Vector3();
  const map = byId('minimap').getContext('2d');
  const visited = new Set();
  let yaw = 0, pitch = .26, vertical = 0, walkPhase = 0, airborne = false;
  let playing = false, running = false, recovering = false, exercising = false, previous = 0, uiTime = 1;
  let stickPointer, orbitPointer, orbitX, orbitY;

  const activity = byId('activity');

  const stopLabels = STOPS.map(stop => {
    const label = document.createElement('li');
    label.textContent = stop.name;
    byId('stops').append(label);
    return label;
  });

  function resize() {
    const width = view.clientWidth, height = view.clientHeight;
    camera.aspect = width / Math.max(1, height);
    camera.fov = width < 530 && height > width ? 68 : 57;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }
  addEventListener('resize', resize);
  resize();

  function ground(x, z) {
    if (Math.abs(x) < 11.7 && z > -33 && z < 35) return .18;
    if (Math.abs(x - BEACH_CLASS.x) < 4.8 && Math.abs(z - BEACH_CLASS.z) < 4.7) return .16;
    if (Math.abs(x - 45) < 2.1 && z >= 83 && z <= 139) return .26;
    if (Math.abs(x) < 91.5 && Math.abs(z - 80.8) < 2.6) return .28;
    if (Math.abs(x) < 120 && z >= 80.6 && z <= 97.2) return .095;
    if (Math.abs(x) < 120 && z > -110 && z < 97) return .10;
    return -Infinity;
  }
  function returnToPlaza() {
    root.position.set(START.x, ground(START.x, START.z), START.z);
    root.rotation.y = yaw = vertical = 0;
    pitch = .26;
    airborne = exercising = false;
    stick.set(0, 0);
    joystick.style.removeProperty('--jx');
    joystick.style.removeProperty('--jy');
    focus.set(START.x, 1.75, START.z);
    camera.position.set(START.x, 3.1, START.z + 5.6);
    camera.lookAt(focus);
  }
  function reset() {
    visited.clear();
    STOPS.forEach((stop, i) => {
      markerGroups[i].material.color.setHex(stop.color);
      stopLabels[i].classList.remove('visited');
    });
    running = recovering = false;
    byId('run').setAttribute('aria-pressed', 'false');
    keys.clear();
    returnToPlaza();
    updateHud();
  }
  function jump() {
    if (playing && !airborne) { vertical = 5.1; airborne = true; exercising = false; }
  }
  function atBeachClass() {
    return Math.hypot(root.position.x - BEACH_CLASS.x, root.position.z - BEACH_CLASS.z) < 5.4;
  }
  function toggleClass() {
    if (!playing || !atBeachClass()) return;
    exercising = !exercising;
    if (exercising) {
      root.position.set(BEACH_CLASS.x, ground(BEACH_CLASS.x, BEACH_CLASS.z), BEACH_CLASS.z);
      root.rotation.y = Math.PI * .36;
      keys.clear();
    }
    updateActivity();
  }
  function updateActivity() {
    activity.hidden = !atBeachClass();
    activity.textContent = exercising ? 'Egzersizi bitir' : touchDevice ? 'Egzersize katıl' : 'E · Egzersize katıl';
    activity.setAttribute('aria-pressed', String(exercising));
  }

  function blocked(x, z) {
    const radius = .32;
    return walls.some(wall => x + radius > wall.min.x && x - radius < wall.max.x &&
      z + radius > wall.min.z && z - radius < wall.max.z && root.position.y < wall.max.y);
  }

  function drawMap(nearest) {
    const offset = 92, origin = 89, unit = .77;
    const mx = x => offset + x * unit, mz = z => origin + z * unit;
    map.fillStyle = '#214653';
    map.fillRect(0, 0, 200, 200);
    map.fillStyle = '#526657';
    map.fillRect(mx(-94), mz(-88), 188 * unit, 168 * unit);
    map.fillStyle = '#ac9870';
    map.fillRect(mx(-94), mz(80), 188 * unit, 17 * unit);
    map.fillStyle = '#c78f62';
    map.fillRect(mx(43), mz(87), 4 * unit, 51 * unit);
    map.strokeStyle = '#809193';
    map.lineWidth = 3;
    map.beginPath();
    for (let i = -3; i <= 3; i++) {
      const p = i * GRID;
      map.moveTo(mx(p), mz(-84)); map.lineTo(mx(p), mz(83));
      map.moveTo(mx(-84), mz(p)); map.lineTo(mx(84), mz(p));
    }
    map.stroke();
    for (const stop of STOPS) {
      map.beginPath();
      map.fillStyle = visited.has(stop) ? '#85c69b' : '#edbd71';
      map.arc(mx(stop.x), mz(stop.z), stop === nearest ? 5.4 : 3.4, 0, Math.PI * 2);
      map.fill();
    }
    map.save();
    map.translate(mx(root.position.x), mz(root.position.z));
    map.rotate(-yaw);
    map.beginPath();
    map.moveTo(0, -8); map.lineTo(5, 4); map.lineTo(-5, 4); map.closePath();
    map.fillStyle = '#fff';
    map.fill();
    map.restore();
    map.fillStyle = '#f5f2e9';
    map.font = 'bold 11px system-ui';
    map.fillText('K', 185, 15);
  }

  function updateHud() {
    let nearest, distance = Infinity;
    for (const stop of STOPS) {
      if (visited.has(stop)) continue;
      const d = Math.hypot(stop.x - root.position.x, stop.z - root.position.z);
      if (d < distance) { nearest = stop; distance = d; }
    }
    byId('count').textContent = visited.size + ' / ' + STOPS.length;
    const hint = recovering ? 'Meydana döndün. Ziyaretlerin kaydedildi.' : nearest
      ? nearest.name + ' · ' + Math.round(distance) + ' m'
      : 'Tur tamamlandı. Şehri keşfetmeye devam edebilirsin.';
    if (byId('hint').textContent !== hint) byId('hint').textContent = hint;
    const { x, z } = root.position;
    byId('district').textContent = z > 96 ? 'Marina' : z > 74 ? 'Sahil'
      : x > 26 ? 'Doğu Mahallesi' : x < -24 ? 'Batı Mahallesi' : 'Şehir Merkezi';
    drawMap(nearest);
    updateActivity();
  }

  function simulate(dt, time) {
    const { position } = root;
    const walk = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) -
      (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - stick.y;
    const strafe = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) -
      (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + stick.x;
    pressed.set(strafe, walk).clampLength(0, 1);
    const speed = running || keys.has('ShiftLeft') || keys.has('ShiftRight') ? 7.2 : 4.2;
    if (pressed.lengthSq() > .01) {
      recovering = exercising = false;
      const sin = Math.sin(yaw), cos = Math.cos(yaw);
      const dx = (pressed.x * cos - pressed.y * sin) * speed * dt;
      const dz = (-pressed.x * sin - pressed.y * cos) * speed * dt;
      if (!blocked(position.x + dx, position.z)) position.x += dx;
      if (!blocked(position.x, position.z + dz)) position.z += dz;
      root.rotation.y = Math.atan2(-dx, -dz);
      walkPhase += dt * speed * 2.45;
    }

    const floor = ground(position.x, position.z);
    vertical -= 14 * dt;
    position.y += vertical * dt;
    if (vertical <= 0 && position.y <= floor) {
      position.y = floor;
      vertical = 0;
      airborne = false;
    } else {
      airborne = true;
    }

    if (position.y < -1.4 || Math.abs(position.x) > 119 || position.z < -109 || position.z > 140) {
      returnToPlaza();
      recovering = true;
    }

    const stride = exercising ? 0 : pressed.length() * (airborne ? .23 : speed > 5 ? 1 : .73);
    player.pose(exercising || stride < .01 ? time : walkPhase, stride, exercising);
    shadow.visible = Number.isFinite(floor);
    shadow.position.set(position.x, (shadow.visible ? floor : 0) + .016, position.z);

    STOPS.forEach((stop, i) => {
      const marker = markerGroups[i];
      marker.pin.position.y = 2.9 + Math.sin(time * 3.2 + i) * .23;
      if (!visited.has(stop) && position.y < 3 &&
          Math.hypot(stop.x - position.x, stop.z - position.z) < VISIT_RADIUS) {
        visited.add(stop);
        stopLabels[i].classList.add('visited');
        marker.material.color.setHex(0x81d6a0);
        updateHud();
      }
    });

    focus.set(position.x, position.y + 1.63, position.z);
    const length = camera.aspect < .8 ? 6.2 : 5.8;
    const horizontal = Math.cos(pitch) * length;
    eye.set(Math.sin(yaw) * horizontal, Math.sin(pitch) * length, Math.cos(yaw) * horizontal);
    lookRay.set(focus, eye.normalize());
    let range = length;
    for (const wall of walls) {
      if (lookRay.intersectBox(wall, intersection)) {
        range = Math.min(range, Math.max(.35, intersection.distanceTo(focus) - .18));
      }
    }
    cameraTarget.copy(focus).addScaledVector(lookRay.direction, range);
    camera.position.lerp(cameraTarget, Math.min(dt * 17, 1));
    if (camera.position.distanceTo(focus) > range + .16) camera.position.copy(cameraTarget);
    camera.lookAt(focus);

    uiTime += dt;
    if (uiTime >= .22) { updateHud(); uiTime = 0; }
  }

  const movement = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft',
    'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Space', 'KeyE', 'KeyR']);
  addEventListener('keydown', event => {
    if (!playing || !movement.has(event.code) || event.ctrlKey || event.metaKey) return;
    if (event.code === 'Space' && event.target instanceof HTMLButtonElement) return;
    event.preventDefault();
    keys.add(event.code);
    if (event.code === 'Space' && !event.repeat) jump();
    if (event.code === 'KeyR' && !event.repeat) reset();
    if (event.code === 'KeyE' && !event.repeat) toggleClass();
  });
  addEventListener('keyup', event => keys.delete(event.code));
  addEventListener('blur', () => keys.clear());

  view.addEventListener('pointerdown', event => {
    if (!playing || orbitPointer !== undefined || (event.pointerType === 'mouse' && event.button !== 0)) return;
    orbitPointer = event.pointerId;
    orbitX = event.clientX;
    orbitY = event.clientY;
    view.setPointerCapture(orbitPointer);
  });
  view.addEventListener('pointermove', event => {
    if (event.pointerId !== orbitPointer) return;
    yaw -= (event.clientX - orbitX) * .006;
    pitch = T.MathUtils.clamp(pitch + (event.clientY - orbitY) * .006, .08, 1.02);
    orbitX = event.clientX;
    orbitY = event.clientY;
  });
  view.addEventListener('lostpointercapture', event => {
    if (orbitPointer === event.pointerId) orbitPointer = undefined;
  });
  function moveStick(event) {
    if (event.pointerId !== stickPointer) return;
    const rect = joystick.getBoundingClientRect();
    stick.set((event.clientX - rect.left - rect.width / 2) / 30,
      (event.clientY - rect.top - rect.height / 2) / 30).clampLength(0, 1);
    joystick.style.setProperty('--jx', stick.x * 26 + 'px');
    joystick.style.setProperty('--jy', stick.y * 26 + 'px');
  }
  joystick.addEventListener('pointerdown', event => {
    if (stickPointer !== undefined) return;
    stickPointer = event.pointerId;
    joystick.setPointerCapture(stickPointer);
    moveStick(event);
  });
  joystick.addEventListener('pointermove', moveStick);
  joystick.addEventListener('lostpointercapture', event => {
    if (stickPointer !== event.pointerId) return;
    stickPointer = undefined;
    stick.set(0, 0);
    joystick.style.removeProperty('--jx');
    joystick.style.removeProperty('--jy');
  });
  byId('run').addEventListener('click', event => {
    running = !running;
    event.currentTarget.setAttribute('aria-pressed', String(running));
  });
  byId('jump').addEventListener('click', jump);
  byId('reset').addEventListener('click', reset);
  activity.addEventListener('click', toggleClass);
  if (touchDevice) byId('how').textContent = 'Sol çubukla hareket et. Kamerayı çevirmek için sahneyi kaydır.';
  start.disabled = false;
  start.addEventListener('click', () => {
    playing = true;
    intro.hidden = true;
    for (const id of ['reset', 'tour', 'map', touchDevice ? 'touch' : 'keys']) byId(id).hidden = false;
    reset();
  });
  scene.add(camera);
  returnToPlaza();
  renderer.setAnimationLoop(ms => {
    let elapsed = Math.min((ms - previous) / 1000, .18);
    previous = ms;
    const time = ms / 1000;
    sea.value = time;
    if (playing) {
      // Keep movement and collision stable when rendering drops below 30 fps.
      while (elapsed > 0) {
        const step = Math.min(elapsed, 1 / 30);
        simulate(step, time - elapsed);
        elapsed -= step;
      }
    } else {
      camera.position.set(18 + Math.sin(ms / 22000) * 4, 8.6, 108.4);
      camera.lookAt(32, 2.9, 79);
    }
    updateNeighbors(time, playing ? root.position : camera.position);
    renderer.render(scene, camera);
  });
}

init().catch(error => {
  byId('how').textContent = 'Şehir dosyaları yüklenemedi. Sayfayı yenileyip tekrar dene.';
  console.error('SwipeUp City could not load:', error);
});
