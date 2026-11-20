import * as T from '/vendor/three/three.module.js';
import { cloneSkeleton, GLTFLoader } from './vendor/gltf.js';
import { BEACH_CLASS } from './layout.js';

const models = ['Women-Casual', 'Men-Casual', 'Men-Casual2', 'Men-Beach', 'Men-Punk'];
const shadowShape = new T.CircleGeometry(.44, 20);
const shadowMaterial = new T.MeshBasicMaterial({
  color: 0x244b46, transparent: true, opacity: .27, depthWrite: false,
});
const rotationA = new T.Quaternion();
const rotationB = new T.Quaternion();

export async function loadAvatars() {
  const loader = new GLTFLoader();
  return Promise.all(models.map(async name => {
    const model = (await loader.loadAsync(new URL('./assets/avatars/' + name + '.glb', import.meta.url).href)).scene;
    model.updateMatrixWorld(true);
    const bounds = new T.Box3().setFromObject(model, true);
    const scale = 1.77 / (bounds.max.y - bounds.min.y);
    model.scale.setScalar(scale);
    model.position.y = -bounds.min.y * scale;
    return model;
  }));
}

function bonePose(model, name) {
  const bone = model.getObjectByName(T.PropertyBinding.sanitizeNodeName(name));
  const inverse = bone.getWorldQuaternion(new T.Quaternion()).invert();
  return {
    bone,
    rest: bone.quaternion.clone(),
    x: new T.Vector3(1, 0, 0).applyQuaternion(inverse),
    y: new T.Vector3(0, 1, 0).applyQuaternion(inverse),
    z: new T.Vector3(0, 0, 1).applyQuaternion(inverse),
  };
}

function makeAvatar(source) {
  const root = new T.Group();
  const model = cloneSkeleton(source);
  root.add(model);
  model.updateMatrixWorld(true);
  const limbs = ['L', 'R'].map(suffix => {
    const shoulder = bonePose(model, 'UpperArm.' + suffix);
    const elbow = bonePose(model, 'LowerArm.' + suffix);
    const thigh = bonePose(model, 'UpperLeg.' + suffix);
    const knee = bonePose(model, 'LowerLeg.' + suffix);
    const delta = elbow.bone.getWorldPosition(new T.Vector3())
      .sub(shoulder.bone.getWorldPosition(new T.Vector3()));
    const side = Math.sign(delta.x);
    const down = Math.atan2(-1, side * .15);
    const angle = down - Math.atan2(delta.y, delta.x);
    return { shoulder, elbow, thigh, knee, side, lowered: Math.atan2(Math.sin(angle), Math.cos(angle)) };
  });
  const torso = bonePose(model, 'Chest');
  model.rotation.y = Math.PI;

  const shadow = new T.Mesh(shadowShape, shadowMaterial);
  shadow.rotation.x = -Math.PI / 2;

  function pose(time, stride, exercise = false) {
    const lift = exercise ? (Math.sin(time * 2.5) + 1) * .5 : 0;
    const twist = stride > 0 ? Math.sin(time) * .082 * stride : 0;
    torso.bone.quaternion.copy(torso.rest).multiply(rotationA.setFromAxisAngle(torso.y, twist));
    model.position.y = groundOffset + (exercise ? -.06 - lift * .04 : Math.abs(Math.sin(time)) * .025 * stride);
    for (const limb of limbs) {
      const { shoulder, elbow, thigh, knee, side, lowered } = limb;
      const gait = Math.sin(time + (side > 0 ? Math.PI : 0));
      shoulder.bone.quaternion.copy(shoulder.rest)
        .multiply(rotationA.setFromAxisAngle(shoulder.x, exercise ? -.14 : .52 * gait * stride))
        .multiply(rotationB.setFromAxisAngle(shoulder.z, lowered + side * (exercise ? .38 + 1.94 * lift : 0)));
      elbow.bone.quaternion.copy(elbow.rest)
        .multiply(rotationA.setFromAxisAngle(elbow.y, side * (exercise ? .23 + .28 * lift : .15 + .53 * stride)));
      thigh.bone.quaternion.copy(thigh.rest)
        .multiply(rotationA.setFromAxisAngle(thigh.x, exercise ? -.30 : -.58 * gait * stride));
      knee.bone.quaternion.copy(knee.rest)
        .multiply(rotationA.setFromAxisAngle(knee.x, exercise ? .42 + .14 * lift : Math.max(0, -gait) * .64 * stride));
    }
  }

  const groundOffset = model.position.y;
  pose(0, 0);
  return { root, shadow, pose };
}

export function makePlayer(avatars) {
  return makeAvatar(avatars[0]);
}

export function addNeighbors(scene, ground, avatars) {
  const walkers = [
    [-4.5, 3.4, 3.6, .65], [4.6, 4.3, 6.5, 1.6], [-5.1, -3.5, 5.7, 2.6],
    [4.8, -8.0, 4.2, 4.7], [-1.6, -13, 7.1, .85], [7.9, 19, 5.3, 2.7],
    [-8.4, 21, 4.0, 4], [2.5, 23, 4.7, 5.2], [12, -15.8, 3.2, .03],
    [35, 75.7, 6.1, 1.8], [30, 82.7, 3.3, 5.5],
  ];
  const fitness = [
    [BEACH_CLASS.x - 2.0, BEACH_CLASS.z - 2.25], [BEACH_CLASS.x + 1.1, BEACH_CLASS.z - 3],
    [BEACH_CLASS.x + 3.8, BEACH_CLASS.z - 1.8], [BEACH_CLASS.x + 1.3, BEACH_CLASS.z + 2.3],
  ];
  const people = [...walkers, ...fitness].map(([x, z, distance, phase], i) => {
    const avatar = makeAvatar(avatars[(i + 2) % avatars.length]);
    avatar.root.scale.setScalar(.91 + i % 3 * .043);
    scene.add(avatar.root, avatar.shadow);
    return { avatar, x, z, distance, phase, index: i };
  });

  return (time, viewer) => {
    for (const { avatar, x, z, distance, phase, index } of people) {
      const close = (viewer.x - x) ** 2 + (viewer.z - z) ** 2 < 57 ** 2;
      avatar.root.visible = avatar.shadow.visible = close;
      if (!close) continue;
      let px = x, pz = z;
      if (distance !== undefined) {
        const angle = time * .34 + phase;
        px += Math.sin(angle) * 1.15;
        pz += Math.cos(angle) * distance;
        avatar.root.rotation.y = Math.atan2(-Math.cos(angle) * 1.15, Math.sin(angle) * distance);
        avatar.pose(time * 6.8 + index, .59);
      } else {
        avatar.root.rotation.y = Math.PI * .36;
        avatar.pose(time + index * .23, 0, true);
      }
      const y = ground(px, pz);
      avatar.root.position.set(px, y, pz);
      avatar.shadow.position.set(px, y + .013, pz);
    }
  };
}
