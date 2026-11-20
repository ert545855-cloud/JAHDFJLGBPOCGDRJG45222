import * as T from '/vendor/three/three.module.js';
import { BEACH_CLASS, GRID, STOPS } from './layout.js';
import { tiledSurface } from './art.js';

const box = new T.BoxGeometry();
const cylinder = new T.CylinderGeometry(0.5, 0.5, 1, 10);
const cone = new T.ConeGeometry(0.5, 1, 12);
const tileCylinder = new T.CylinderGeometry(0.5, 0.5, 1, 20);
const sphere = new T.IcosahedronGeometry(0.5, 1);
const leaf = new T.BufferGeometry();
leaf.setAttribute('position', new T.Float32BufferAttribute([
  0, 0, 0, -.46, .2, .32, 0, .34, .36, .46, .2, .32,
  -.30, .097, .73, 0, .22, .73, .30, .097, .73, 0, -.22, 1
], 3));
leaf.setIndex([0, 1, 2, 0, 2, 3, 1, 4, 5, 1, 5, 2, 2, 5, 6, 2, 6, 3, 4, 7, 5, 5, 7, 6]);
leaf.computeVertexNormals();
const ring = new T.TorusGeometry(0.5, 0.032, 6, 36);
const q = new T.Quaternion();
const transform = new T.Matrix4();
const point = new T.Vector3();
const scale = new T.Vector3();
const yAxis = new T.Vector3(0, 1, 0);
const colors = {
  ground: 0x99b279, asphalt: 0x424851, sidewalk: 0xc7b49b, sand: 0xe2bc86,
  cream: 0xf3d6ad, salmon: 0xd78677, sage: 0x9cb9a0, blue: 0x588f9c,
  roof: 0x4b5757, glass: 0x233946, litGlass: 0x839d99, trim: 0xe4d5bf,
  iron: 0x34484f, wood: 0xbf8a62, lawn: 0x70a77b, trunk: 0x88674f,
  gold: 0xf2b758, white: 0xfbf0dc, water: 0x50b8c3,
};
export function makeWorld(scene, art) {
  const batches = new Map();
  const walls = [];
  let seed = 6137;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  function add(shape, tint, x, y, z, w, h, d, yaw = 0, pitch = 0, castShadow = false) {
    const key = shape.id + ':' + tint + ':' + castShadow;
    if (!batches.has(key)) batches.set(key, { shape, tint, matrices: [], castShadow });
    q.setFromEuler(new T.Euler(pitch, yaw, 0, 'YXZ'));
    transform.compose(point.set(x, y, z), q, scale.set(w, h, d));
    batches.get(key).matrices.push(transform.clone());
  }
  function block(tint, x, y, z, w, h, d, solid = false) {
    add(box, tint, x, y, z, w, h, d, 0, 0, solid);
    if (solid) {
      walls.push(new T.Box3(new T.Vector3(x - w / 2, y - h / 2, z - d / 2),
        new T.Vector3(x + w / 2, y + h / 2, z + d / 2)));
    }
  }
  function palm(x, z, s = 1) {
    add(cylinder, colors.trunk, x, 2.4 * s, z, .33 * s, 4.8 * s, .33 * s, 0, .035, true);
    for (let tier = 0; tier < 2; tier++) {
      for (let i = 0; i < 7; i++) {
        const angle = i * Math.PI * 2 / 7 + tier * .38;
        add(leaf, i % 2 ? 0x4b7541 : 0x66864f, x, (4.72 + tier * .18) * s, z,
          (1.25 - tier * .18) * s, (1.5 + tier * .4) * s, (2.35 - tier * .52) * s,
          angle, -.16 - tier * .23, true);
      }
    }
    add(sphere, 0x55432c, x, 4.65 * s, z, .52 * s, .35 * s, .52 * s);
  }
  function bench(x, z, angle = 0) {
    if (art.props.bench) {
      add(art.props.bench.geometry, art.props.bench.material, x, .08, z,
        1.5, 1.34, 1.5, angle, 0, true);
      return;
    }
    block(colors.wood, x, .48, z, 1.55, .13, .48);
    block(colors.wood, x, .86, z + .21, 1.55, .39, .11);
    for (const dx of [-.57, .57]) block(colors.iron, x + dx, .25, z, .09, .51, .42);
  }
  function planter(x, z, size = 1) {
    if (art.props.planter) {
      add(art.props.planter.geometry, art.props.planter.material, x, .1, z,
        size * 3.1, size * 3.1, size * 3.1, 0, 0, true);
    } else {
      add(tileCylinder, colors.cream, x, .4 * size, z, .84 * size, .65 * size, .84 * size);
    }
    for (let i = 0; i < 5; i++) {
      const angle = i * Math.PI * 2 / 5;
      add(leaf, i % 2 ? 0x799358 : 0x537749, x, .69 * size, z,
        .5 * size, .79 * size, .55 * size, angle, -.51);
    }
  }
  function lamp(x, z) {
    add(cylinder, colors.iron, x, 2, z, .115, 4, .115);
    block(colors.iron, x + .29, 3.91, z, .64, .09, .13);
    block(colors.gold, x + .57, 3.84, z, .38, .095, .26);
  }
  function table(x, z, tint) {
    add(cylinder, colors.iron, x, .68, z, .11, 1.36, .11);
    add(cylinder, colors.wood, x, .89, z, 1.05, .11, 1.05);
    add(cylinder, colors.iron, x, 1.52, z, .08, 1.5, .08);
    add(cone, tint, x, 2.29, z, 2.32, .49, 2.32);
    for (const dx of [-.89, .89]) {
      block(colors.wood, x + dx, .43, z, .39, .12, .46);
      block(colors.iron, x + dx, .22, z, .12, .44, .12);
    }
  }
  function building(x, z, w, d, floors, tint) {
    const modern = tint === colors.blue;
    const interval = modern ? 3.38 : 2.95;
    const height = floors * interval;
    block(tint, x, height / 2, z, w, height, d, true);
    block(colors.trim, x, height - .18, z, w + .3, .21, d + .3);
    block(colors.roof, x, height + .12, z, w + .48, .28, d + .48);
    if (modern) {
      block(colors.roof, x, height + .8, z - d * .12, w * .72, 1.4, d * .66);
      block(colors.iron, x + w * .24, height + 2.16, z - d * .24, .07, 2.74, .07);
    } else {
      block(colors.roof, x + w * .2, height + .53, z - d * .2, 1.74, .7, 1.46);
      if (floors < 4) add(cone, 0x7f4e42, x, height + .59, z, w * 1.5, 1.14, d * 1.5, Math.PI / 4);
    }
    const front = z + d / 2;
    block(colors.trim, x, .2, front + .08, w, .39, .18);
    for (const dx of [-w * .32, 0, w * .32]) {
      block(colors.iron, x + dx, 1.29, front + .06, w * .27, 2.45, .12);
      block(colors.glass, x + dx, 1.34, front + .13, w * .25, 2.26, .06);
      block(colors.litGlass, x + dx, 2.03, front + .169, w * .22, .42, .025);
      block(colors.iron, x + dx, 1.28, front + .169, .055, 2.3, .068);
    }
    block(colors.trim, x, 2.61, front + .14, w + .06, .13, .3);
    if (!modern) {
      const canopy = tint === colors.salmon ? 0x934438 : 0x436763;
      for (let stripe = 0; stripe < 11; stripe++) {
        const dx = (stripe - 5) * (w * .87 / 11);
        add(box, stripe % 2 ? colors.cream : canopy, x + dx, 2.46, front + .48,
          w * .87 / 11 + .004, .045, .93, 0, -.21);
      }
      planter(x - w * .35, front + 1.25, .76);
      planter(x + w * .35, front + 1.25, .76);
    }
    for (let i = 1; i < floors; i++) {
      const y = i * interval + interval * .53;
      if (modern) {
        for (const side of [-1, 1]) {
          const face = z + side * (d / 2 + .035);
          block(colors.glass, x, y, face, w - .36, 2.03, .105);
          block(colors.litGlass, x, y + .68, face + side * .065, w - .43, .52, .024);
          for (const pos of [-.34, -.17, 0, .17, .34]) {
            block(colors.iron, x + pos * w, y, face + side * .07, .055, 2.08, .08);
          }
        }
      } else {
        const sill = tint === colors.salmon || i % 2 === 0 || floors === 3;
        for (const dx of [-w * .32, 0, w * .32]) {
          const glass = random() < .21 ? colors.litGlass : colors.glass;
          block(colors.trim, x + dx, y, front + .042, 1.36, 1.54, .091);
          block(glass, x + dx, y, front + .093, 1.10, 1.24, .032);
          block(colors.iron, x + dx, y, front + .117, .044, 1.24, .045);
          block(glass, x + dx, y, z - d / 2 - .045, 1.05, 1.23, .095);
          if (sill) block(colors.trim, x + dx, y - .76, front + .12, 1.49, .12, .44);
        }
      }
      for (const dz of [-d * .29, 0, d * .29]) {
        block(colors.glass, x - w / 2 - .042, y, z + dz, .11, 1.32, 1.24);
        block(colors.glass, x + w / 2 + .042, y, z + dz, .11, 1.32, 1.24);
      }
    }
  }

  function park(x, z) {
    block(colors.lawn, x, .055, z, 17.8, .11, 17.8);
    block(colors.sidewalk, x, .105, z, 2.1, .04, 17.95);
    block(colors.sidewalk, x, .104, z, 17.95, .04, 2.1);
    add(tileCylinder, colors.trim, x, .42, z, 4.4, .84, 4.4, 0, 0, true);
    add(tileCylinder, colors.water, x, .849, z, 3.91, .03, 3.91);
    add(cylinder, colors.cream, x, 1.11, z, .33, .69, .33);
    add(sphere, colors.litGlass, x, 1.53, z, .54, .27, .54);
    for (const dx of [-3.2, 3.2]) {
      for (const dz of [-3.2, 3.2]) planter(x + dx, z + dz);
    }
    for (const dx of [-6.7, 6.7]) {
      for (const dz of [-6.7, 6.7]) { palm(x + dx, z + dz); bench(x + dx, z + dz * .62); }
    }
  }
  function sign(words, x, y, z, width, height, background, rotation = 0) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    context.fillStyle = background;
    context.fillRect(0, 0, 512, 128);
    context.strokeStyle = '#f0e3be';
    context.lineWidth = 5;
    context.strokeRect(9, 9, 494, 110);
    context.fillStyle = '#fff3d5';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = 'bold 49px system-ui, sans-serif';
    context.fillText(words, 256, 64, 468);
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    const face = new T.Mesh(new T.PlaneGeometry(width, height),
      new T.MeshStandardMaterial({ map: texture, roughness: .73 }));
    face.position.set(x, y, z);
    face.rotation.y = rotation;
    face.receiveShadow = true;
    scene.add(face);
  }
  function plaza() {
    // The shopping street is pedestrianized. Its pale stone and teal bands continue to the coast.
    block(0xe0c9a7, 0, .138, 1, 23.4, .045, 68);
    const pavement = document.createElement('canvas');
    pavement.width = 512;
    pavement.height = 1536;
    const paint = pavement.getContext('2d');
    paint.fillStyle = '#e8d3ac';
    paint.fillRect(0, 0, 512, 1536);
    const ribbons = ['#87bcbc', '#b0cfc5', '#cec9ac', '#8cb9b6'];
    for (let i = 0; i < ribbons.length; i++) {
      const x = 155 + i * 59;
      paint.beginPath();
      paint.moveTo(x + 32, -30);
      paint.bezierCurveTo(x - 100, 350, x + 85, 470, x - 12, 820);
      paint.bezierCurveTo(x - 65, 1035, x + 99, 1215, x + 28, 1560);
      paint.lineWidth = i % 2 ? 28 : 66;
      paint.strokeStyle = ribbons[i];
      paint.stroke();
    }
    for (let row = 0; row < 96; row++) {
      for (let col = -1; col < 32; col++) {
        const x = col * 16 + (row % 2) * 8;
        const value = random() * .082;
        paint.fillStyle = (random() < .52 ? 'rgba(52,72,67,' : 'rgba(255,247,224,') + value + ')';
        paint.fillRect(x, row * 16, 15.1, 15.1);
      }
    }
    const plazaTexture = new T.CanvasTexture(pavement);
    plazaTexture.colorSpace = T.SRGBColorSpace;
    plazaTexture.anisotropy = 4;
    const tiles = new T.Mesh(new T.PlaneGeometry(23.4, 68),
      new T.MeshStandardMaterial({ map: plazaTexture, roughness: .92 }));
    tiles.rotation.x = -Math.PI / 2;
    tiles.position.set(0, .17, 1);
    tiles.receiveShadow = true;
    scene.add(tiles);
    for (const x of [-8.4, 8.4]) {
      block(0xd0a88f, x, .165, .5, .54, .013, 67);
      for (const z of [-27.8, -15.9, -4.8, 5.8, 18.2, 29.3]) {
        if (z === 5.8 && x > 0) continue;
        palm(x, z, 1.12 + random() * .13);
        planter(x + (x < 0 ? 1.1 : -1.1), z + 1.38, 1.2);
        lamp(x + (x < 0 ? -.72 : .72), z - 1.1);
        if (z > -25) bench(x + (x < 0 ? -.7 : .7), z - 1.9, x < 0 ? Math.PI / 2 : -Math.PI / 2);
      }
    }

    // A shaded promenade pavilion and an in-world sign identify the meeting point.
    for (const x of [-6.0, 6.0]) {
      add(tileCylinder, colors.trim, x, 1.99, 32, .29, 3.77, .29, 0, 0, true);
      add(tileCylinder, 0x448e8f, x, .55, 32, .48, .84, .48);
      add(tileCylinder, colors.gold, x, 3.43, 32, .36, .16, .36);
    }
    block(0x448e8f, 0, 3.68, 32, 12.4, .3, .46);
    block(colors.trim, 0, 4.02, 32, 6.9, .93, .23);
    sign('KIYI MEYDANI', 0, 4.05, 32.14, 6.7, .88, '#376d71');
    sign('KIYI MEYDANI', 0, 4.05, 31.86, 6.7, .88, '#376d71', Math.PI);
  }
  function beachClub() {
    const { x, z } = BEACH_CLASS;
    block(0xe4bd8e, x + 1, .122, z - .55, 9.6, .045, 9.4);
    for (const [dx, dz, tint] of [
      [0, 0, 0x62b8ad], [-2, -2.25, 0xd37f98], [1.1, -3, 0x6e9ec5],
      [3.8, -1.8, 0xf0ae6c], [1.3, 2.3, 0x9b8dcb],
    ]) {
      block(tint, x + dx, .157, z + dz, .88, .025, 1.81);
      add(cylinder, 0x4c9ea0, x + dx + .64, .29, z + dz - .6, .12, .26, .12);
    }
    for (let i = 0; i < 4; i++) {
      const px = x - 12.75 + i * 3.35;
      add(cylinder, colors.wood, px, 1.08, z + 2.7, .1, 2.16, .1);
      add(cone, i % 2 ? 0xf2a976 : 0x578eaa, px, 2.19, z + 2.7, 2.8, .74, 2.8);
      add(box, colors.trim, px - .35, .38, z + 2.96, .63, .13, 1.52, -.2, -.21);
      add(box, colors.trim, px + .57, .38, z + 3, .63, .13, 1.52, -.2, -.21);
    }
    block(colors.wood, x - 2.8, 1.38, z + 2.8, .12, 2.51, .12);
    block(colors.wood, x - 5.6, 1.38, z + 2.8, .12, 2.51, .12);
    block(0x407e81, x - 4.2, 2.31, z + 2.8, 2.94, .74, .15);
    sign('SAHİL KULÜBÜ', x - 4.2, 2.32, z + 2.71, 2.82, .64, '#407e81', Math.PI);
  }

  function parking(x, z) {
    block(colors.asphalt, x, .045, z, 17.2, .09, 17.2);
    for (let i = -2; i <= 2; i++) {
      const bx = x + i * 2.95;
      block(colors.white, bx - 1.43, .1, z - 4.2, .08, .025, 5.1);
      if (i % 2) continue;
      const cz = z - 4.2;
      block(i < 0 ? 0xdb7354 : i > 0 ? 0x5999b6 : colors.gold, bx, .66, cz, 1.82, .67, 4.12);
      block(colors.glass, bx, 1.11, cz + .08, 1.56, .66, 2.23);
      for (const dx of [-.87, .87]) {
        for (const dz of [-1.23, 1.23]) {
          add(cylinder, colors.iron, bx + dx, .34, cz + dz, .67, .26, .67, Math.PI / 2, Math.PI / 2);
        }
      }
      for (const dx of [-.57, .57]) block(colors.white, bx + dx, .68, cz + 2.066, .32, .2, .035);
    }
    lamp(x - 7.2, z - 7); lamp(x + 7.2, z - 7);
  }

  block(colors.ground, 0, -.35, -6.5, 240, .7, 207);
  block(colors.sand, 0, .015, 88.9, 240, .16, 16.6);

  block(colors.wood, 0, .14, 80.8, 183, .28, 5.2);
  block(colors.wood, 45, .13, 111, 4.2, .26, 56);
  for (let i = 0; i < 53; i++) {
    block(0xa97152, 45, .265, 84.4 + i * 1.02, 4.16, .017, .04);
  }
  for (let i = 0; i < 6; i++) {
    const z = 92 + i * 7.5;
    for (const x of [43.1, 46.9]) block(colors.iron, x, .46, z, .16, 1.7, .16);
    const tint = [0xf1e6ce, 0xd57954, 0x6e9ca0][i % 3];
    add(sphere, tint, 53.8, .07, z, 7.4, 1.45, 2.55);
    block(colors.white, 53.7, .62, z, 3.1, .26, 1.75);
    block(colors.glass, 53.3, .93, z, 1.55, .53, 1.36);
  }
  for (let i = -10; i <= 10; i++) {
    const x = i * 7.7;
    palm(x, 77.3, .88 + random() * .23);
    if (i % 3 === 0) { bench(x + 2.2, 80.6, Math.PI); lamp(x, 79.1); planter(x + 3.5, 80.6); }
    if (i % 4 === 0) table(x + 1.9, 84.6, colors.salmon);
  }
  for (let street = -3; street <= 3; street++) {
    const p = street * GRID;
    if (street !== 0) block(colors.asphalt, p, .045, 0, 6.9, .09, 174);
    block(colors.asphalt, 0, .041, p, 174, .086, 6.9);
    for (const side of [-1, 1]) {
      for (let segment = -3; segment < 3; segment++) {
        const pos = (segment + .5) * GRID;
        if (street !== 0) block(colors.sidewalk, p + side * 4.35, .07, pos, 1.8, .15, GRID - 6.9);
        block(colors.sidewalk, pos, .07, p + side * 4.35, GRID - 6.9, .15, 1.8);
      }
    }
    for (let segment = -14; segment <= 14; segment++) {
      const pos = segment * 5.7;
      if (Math.abs(pos - Math.round(pos / GRID) * GRID) < 4.5) continue;
      if (street !== 0) block(colors.gold, p, .095, pos, .11, .018, 2.3);
      block(colors.gold, pos, .095, p, 2.3, .018, .11);
    }
    for (let j = -3; j <= 3; j++) {
      const cross = j * GRID;
      if ((j + street) % 2 === 0) {
        lamp(p + 4.81, cross + 5.1);
        add(tileCylinder, 0x4d514c, p + 2.05, .095, cross + 6.7, .56, .015, .56);
      }
      for (let strip = -3; strip <= 3; strip++) {
        block(colors.white, p + strip * .87, .12, cross + 3.05, .52, .02, 1.1);
        block(colors.white, p + 3.05, .12, cross + strip * .87, 1.1, .02, .52);
      }
    }
  }
  plaza();
  beachClub();
  for (let col = -3; col < 3; col++) {
    for (let row = -3; row < 3; row++) {
      const x = (col + .5) * GRID, z = -(row + .5) * GRID;
      if (col === 0 && row === 0) { park(x, z); continue; }
      if (col === 2 && row === -2) { parking(x, z); continue; }
      if ((col === -1 && row === -1) || (row === -3 && [0, 1].includes(col))) {
        block(colors.sidewalk, x, .045, z, 17, .09, 17);
        for (const dz of [-2.5, 2.5]) {
          for (const dx of [-4.4, 0, 4.4]) {
            table(x + dx, z + dz, dz > 0 ? 0xb45948 : 0x4d7771);
          }
        }
        palm(x - 6.7, z + 6.2); palm(x + 6.7, z - 6.2);
        for (const dx of [-5, 0, 5]) planter(x + dx, z + 7.05);
        continue;
      }
      if ((col === 0 || col === -1) && row >= -2 && row <= 1) {
        const side = col < 0 ? -1 : 1;
        const names = side < 0 ? ['SAHİL STÜDYO', 'MAVİ FİNCAN', 'ATÖLYE 12', 'RENK PAZARI']
          : ['DENİZ KİTAP', 'PORTAKAL', 'GÜNEŞ EVİ', 'MERCAN'];
        building(side * 17.8, z, 9.8, 14.4, row === -1 ? 3 : 4, side < 0 ? colors.sage : colors.salmon);
        const faceX = side * 12.84;
        block(0x315b61, faceX, 2.66, z + 1.5, .08, .86, 5.9);
        block(colors.glass, faceX, 1.22, z + 1.5, .12, 2.0, 5.2);
        for (const divide of [-2.1, -.65, .65, 2.1]) {
          block(colors.trim, faceX - side * .07, 1.23, z + 1.5 + divide, .08, 2.02, .065);
        }
        sign(names[row + 2], faceX - side * .1, 2.67, z + 1.5, 5.8, .76,
          side < 0 ? '#4d8291' : '#b65d64', -side * Math.PI / 2);
        const stripColor = side < 0 ? 0x42778a : 0xbb667b;
        for (let strip = -5; strip <= 5; strip++) {
          add(box, strip % 2 ? colors.trim : stripColor, faceX - side * .67, 2.27, z + 1.5 + strip * .43,
            1.32, .052, .432, 0, 0);
        }
        planter(side * 11.7, z - 1.36);
        planter(side * 11.7, z + 4.72);
        continue;
      }
      block(colors.sidewalk, x, .037, z, 17.8, .074, 17.8);
      const modern = col >= 1, north = row > 0;
      const palette = modern ? [colors.blue, colors.sage] : north
        ? [colors.cream, colors.sage] : [colors.salmon, colors.cream];
      for (let i = 0; i < 2; i++) {
        const floors = (modern ? 4 : 2) + Math.floor(random() * 4);
        building(x - 4 + 8 * i, z - .75 + random() * 1.5, 6.75 + random() * .6,
          11 + random() * 2.6, floors, palette[i]);
      }
      if (random() > .35) bench(x, z + 7.6);
      if (random() > .45) palm(x - 7.8, z - 6.6, .78);
    }
  }
  for (let i = -11; i <= 11; i++) {
    add(sphere, i % 2 ? 0x5d927c : 0x7da688, i * 29, -10, -132 - random() * 25,
      49 + random() * 25, 33 + random() * 35, 68);
    if (i >= -7 && i <= 7) palm(i * 11.4, -87.3, .9 + random() * .31);
  }
  for (let i = -5; i <= 5; i++) {
    palm(-88.1, i * 14.2, .95 + random() * .22);
    palm(87.3, i * 14.2, .95 + random() * .22);
  }
  for (let i = 0; i < 48; i++) {
    const x = 67 + i * .69;
    add(sphere, i % 2 ? 0xa69b83 : 0xbab199, x, .12 + random() * .42, 100 + random() * 1.45,
      1.05 + random() * 1.8, .98 + random() * 1.42, 1.2 + random() * 1.2, random() * 2);
  }
  const materialCache = new Map();
  const tiled = new Map([
    [colors.asphalt, ['asphalt', .37, 0xb7b9c1]],
    [colors.sidewalk, ['pavers', .52, 0xf4e8d0]],
    [colors.cream, ['plaster', .47, 0xffe9bd]],
    [colors.salmon, ['plaster', .54, 0xf9a18d]],
    [colors.sage, ['plaster', .5, 0xb4d4c1]],
    [colors.wood, ['deck', .63, 0xeed3ab]],
    [colors.sand, ['sand', .27, 0xffdb9d]],
  ]);
  function materialFor(shape, tint) {
    if (typeof tint !== 'number') return tint;
    const key = tint + ':' + shape.id;
    if (materialCache.has(key)) return materialCache.get(key);
    const surface = shape === box ? tiled.get(tint) : null;
    const settings = surface && art.surfaces[surface[0]];
    const glazing = tint === colors.glass || tint === colors.litGlass;
    const material = settings
      ? tiledSurface({ color: surface[2], roughness: .92, ...settings }, surface[1])
      : new T.MeshStandardMaterial({
        color: tint, roughness: glazing ? .29 : .85, metalness: glazing ? .36 : 0,
        envMapIntensity: glazing ? 1.5 : .31, side: shape === leaf ? T.DoubleSide : T.FrontSide,
      });
    materialCache.set(key, material);
    return material;
  }
  for (const { shape, tint, matrices, castShadow } of batches.values()) {
    const batch = new T.InstancedMesh(shape, materialFor(shape, tint), matrices.length);
    matrices.forEach((matrix, i) => batch.setMatrixAt(i, matrix));
    batch.computeBoundingSphere();
    batch.castShadow = castShadow;
    batch.receiveShadow = true;
    scene.add(batch);
  }

  const markerGroups = STOPS.map(stop => {
    const group = new T.Group();
    group.position.set(stop.x, stop.name === 'Marina' ? .29 : .18, stop.z);
    const material = new T.MeshBasicMaterial({ color: stop.color });
    const circle = new T.Mesh(ring, material);
    circle.scale.setScalar(5.25);
    circle.rotation.x = Math.PI / 2;
    group.add(circle);
    const pin = new T.Mesh(sphere, material);
    pin.position.y = 2.9;
    pin.scale.set(.48, .82, .48);
    group.add(pin);
    scene.add(group);
    return { material, pin };
  });

  return { walls, markerGroups };
}
