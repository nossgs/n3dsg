import {
  Engine,
  Scene,
  Color3,
  Color4,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  TransformNode,
  UniversalCamera,
  Vector3,
  Matrix,
  Skeleton,
  Bone,
  Space,
  Ray,
} from '@babylonjs/core';

import './style.css';

// --------------------------------------------------
// Engine and scene
// --------------------------------------------------

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const hint = document.getElementById('hint');

const engine = new Engine(canvas, true);
const scene = new Scene(engine);

scene.clearColor = new Color4(0.14, 0.18, 0.23, 1);
scene.collisionsEnabled = true;

new HemisphericLight(
  'sky',
  new Vector3(0.3, 1, 0.2),
  scene
);

function material(name: string, color: Color3) {
  const result = new StandardMaterial(name, scene);

  result.diffuseColor = color;
  result.specularColor = Color3.Black();

  return result;
}

const concrete = material(
  'concrete',
  new Color3(0.35, 0.39, 0.43)
);

const shirt = material(
  'shirt',
  new Color3(0.24, 0.45, 0.54)
);

const skin = material(
  'skin',
  new Color3(0.7, 0.51, 0.37)
);

const pants = material(
  'pants',
  new Color3(0.17, 0.21, 0.27)
);

const shoes = material(
  'shoes',
  new Color3(0.1, 0.12, 0.15)
);

const debugMaterial = material(
  'skeleton-debug',
  new Color3(1, 0.75, 0.15)
);

debugMaterial.emissiveColor = new Color3(1, 0.55, 0.05);
debugMaterial.disableLighting = true;

// --------------------------------------------------
// Test arena
// --------------------------------------------------

const ground = MeshBuilder.CreateGround(
  'arena',
  { width: 60, height: 60 },
  scene
);

ground.material = concrete;
ground.checkCollisions = true;

const obstacles = [
  { x: 5, z: 5, width: 3, height: 3, depth: 3 },
  { x: -5, z: 7, width: 4, height: 2, depth: 2 },
  { x: 0, z: 12, width: 8, height: 3, depth: 1 },

  { x: 30, z: 0, width: 1, height: 4, depth: 60 },
  { x: -30, z: 0, width: 1, height: 4, depth: 60 },
  { x: 0, z: 30, width: 60, height: 4, depth: 1 },
  { x: 0, z: -30, width: 60, height: 4, depth: 1 },
];

for (const obstacle of obstacles) {
  const box = MeshBuilder.CreateBox(
    'obstacle',
    {
      width: obstacle.width,
      height: obstacle.height,
      depth: obstacle.depth,
    },
    scene
  );

  box.position.set(
    obstacle.x,
    obstacle.height / 2,
    obstacle.z
  );

  box.material = concrete;
  box.checkCollisions = true;
}

// --------------------------------------------------
// Player collision body and visual root
// --------------------------------------------------

const body = MeshBuilder.CreateBox(
  'player-collider',
  { size: 1 },
  scene
);

body.isVisible = false;
body.isPickable = false;
body.ellipsoid.set(0.32, 0.9, 0.32);
body.position.set(0, 0.92, 0);

const visual = new TransformNode('character-visual', scene);

// Supplies the world transform for bone attachments.
const rigAnchor = new Mesh('rig-anchor', scene);
rigAnchor.parent = visual;
rigAnchor.isPickable = false;

// --------------------------------------------------
// Skeleton
// --------------------------------------------------

const skeleton = new Skeleton(
  'humanoid-44',
  'humanoid-44',
  scene
);

const links: { parent: Bone; child: Bone }[] = [];

function addBone(
  name: string,
  parent: Bone | null,
  x: number,
  y: number,
  z: number
) {
  const bone = new Bone(
    name,
    skeleton,
    parent,
    Matrix.Translation(x, y, z)
  );

  if (parent) {
    links.push({ parent, child: bone });
  }

  return bone;
}

// Central body: 8 bones.

const root = addBone('root', null, 0, 0, 0);
const pelvis = addBone('pelvis', root, 0, 0.92, 0);

const spine = addBone('spine', pelvis, 0, 0.16, 0);
const chest = addBone('chest', spine, 0, 0.18, 0);
const upperChest = addBone('upperChest', chest, 0, 0.18, 0);
const neck = addBone('neck', upperChest, 0, 0.13, 0);
const head = addBone('head', neck, 0, 0.12, 0);
const jaw = addBone('jaw', head, 0, -0.06, 0.08);

type SideRig = {
  clavicle: Bone;
  upperArm: Bone;
  forearm: Bone;
  hand: Bone;
  thigh: Bone;
  shin: Bone;
  foot: Bone;
  toe: Bone;
};

function createSide(name: string, sign: number): SideRig {
  const clavicle = addBone(
    `${name}Clavicle`,
    upperChest,
    sign * 0.12,
    0,
    0
  );

  const upperArm = addBone(
    `${name}UpperArm`,
    clavicle,
    sign * 0.18,
    0,
    0
  );

  const forearm = addBone(
    `${name}Forearm`,
    upperArm,
    0,
    -0.29,
    0
  );

  const hand = addBone(
    `${name}Hand`,
    forearm,
    0,
    -0.27,
    0
  );

  const thigh = addBone(
    `${name}Thigh`,
    pelvis,
    sign * 0.14,
    -0.05,
    0
  );

  const shin = addBone(
    `${name}Shin`,
    thigh,
    0,
    -0.4,
    0
  );

  const foot = addBone(
    `${name}Foot`,
    shin,
    0,
    -0.39,
    0
  );

  const toe = addBone(
    `${name}Toe`,
    foot,
    0,
    -0.035,
    0.15
  );

  return {
    clavicle,
    upperArm,
    forearm,
    hand,
    thigh,
    shin,
    foot,
    toe,
  };
}

const left = createSide('left', -1);
const right = createSide('right', 1);

// --------------------------------------------------
// Rounded rigid geometry attached to bones
// --------------------------------------------------

function segment(
  name: string,
  bone: Bone,
  width: number,
  height: number,
  depth: number,
  x: number,
  y: number,
  z: number,
  mat: StandardMaterial
) {
  const isFinger =
    name.includes('-proximal-mesh') ||
    name.includes('-distal-mesh');

  const isLimb =
    name.includes('-upper-arm') ||
    name.includes('-forearm') ||
    name.includes('-thigh') ||
    name.includes('-shin');

  const isTorso =
    name === 'pelvis-mesh' ||
    name === 'abdomen-mesh' ||
    name === 'chest-mesh' ||
    name === 'upper-chest-mesh';

  const isFoot =
    name.endsWith('-foot') ||
    name.endsWith('-toe');

  let mesh: Mesh;

  if (isLimb || isFinger) {
    const diameter = Math.min(width, height * 0.8);

    mesh = MeshBuilder.CreateCapsule(
      name,
      {
        height,
        radius: diameter / 2,
        tessellation: isFinger ? 8 : 12,
        subdivisions: 2,
        capSubdivisions: 4,
      },
      scene
    );

    mesh.scaling.set(
      width / diameter,
      1,
      depth / diameter
    );
  } else if (isTorso) {
    const profiles: Record<
      string,
      { top: number; bottom: number }
    > = {
      'pelvis-mesh': {
        top: width * 0.88,
        bottom: width,
      },
      'abdomen-mesh': {
        top: width * 1.03,
        bottom: width * 0.85,
      },
      'chest-mesh': {
        top: width,
        bottom: width * 0.78,
      },
      'upper-chest-mesh': {
        top: width * 0.82,
        bottom: width,
      },
    };

    const profile = profiles[name];

    mesh = MeshBuilder.CreateCylinder(
      name,
      {
        height,
        diameterTop: profile.top,
        diameterBottom: profile.bottom,
        tessellation: 20,
        subdivisions: 1,
      },
      scene
    );

    mesh.scaling.z = depth / width;
  } else {
    mesh = MeshBuilder.CreateSphere(
      name,
      {
        diameter: 1,
        segments: isFoot ? 12 : 16,
      },
      scene
    );

    mesh.scaling.set(width, height, depth);

    if (name === 'head-mesh') {
      mesh.scaling.y = height * 1.12;
    }
  }

  mesh.material = mat;
  mesh.isPickable = false;

  mesh.attachToBone(bone, rigAnchor);
  mesh.position.set(x, y, z);

  if (isLimb) {
    const joint = MeshBuilder.CreateSphere(
      `${name}-joint-cover`,
      {
        diameter: 1,
        segments: 12,
      },
      scene
    );

    joint.scaling.set(
      width * 0.95,
      width * 0.95,
      depth * 0.95
    );

    joint.material = mat;
    joint.isPickable = false;

    joint.attachToBone(bone, rigAnchor);
    joint.position.set(0, 0, 0);
  }

  return mesh;
}

// Torso and head.

segment(
  'pelvis-mesh',
  pelvis,
  0.36, 0.18, 0.24,
  0, -0.02, 0,
  pants
);

segment(
  'abdomen-mesh',
  spine,
  0.35, 0.2, 0.24,
  0, 0.04, 0,
  shirt
);

segment(
  'chest-mesh',
  chest,
  0.46, 0.2, 0.27,
  0, 0.04, 0,
  shirt
);

segment(
  'upper-chest-mesh',
  upperChest,
  0.48, 0.14, 0.27,
  0, 0.015, 0,
  shirt
);

segment(
  'neck-mesh',
  neck,
  0.12, 0.13, 0.12,
  0, 0.02, 0,
  skin
);

segment(
  'head-mesh',
  head,
  0.25, 0.24, 0.24,
  0, 0.045, 0,
  skin
);

segment(
  'nose',
  head,
  0.06, 0.06, 0.07,
  0, 0.03, 0.145,
  skin
);

segment(
  'jaw-mesh',
  jaw,
  0.2, 0.07, 0.15,
  0, -0.015, -0.015,
  skin
);

// Arms and legs.

function buildSideMeshes(name: string, rig: SideRig) {
  segment(
    `${name}-upper-arm`,
    rig.upperArm,
    0.15, 0.29, 0.16,
    0, -0.145, 0,
    shirt
  );

  segment(
    `${name}-forearm`,
    rig.forearm,
    0.12, 0.27, 0.13,
    0, -0.135, 0,
    skin
  );

  segment(
    `${name}-palm`,
    rig.hand,
    0.12, 0.12, 0.065,
    0, -0.06, 0,
    skin
  );

  segment(
    `${name}-thigh`,
    rig.thigh,
    0.18, 0.4, 0.2,
    0, -0.2, 0,
    pants
  );

  segment(
    `${name}-shin`,
    rig.shin,
    0.15, 0.39, 0.17,
    0, -0.195, 0,
    pants
  );

  segment(
    `${name}-foot`,
    rig.foot,
    0.17, 0.1, 0.2,
    0, -0.025, 0.035,
    shoes
  );

  segment(
    `${name}-toe`,
    rig.toe,
    0.17, 0.07, 0.1,
    0, 0, 0.025,
    shoes
  );
}

buildSideMeshes('left', left);
buildSideMeshes('right', right);

// --------------------------------------------------
// Fingers: 20 bones
// --------------------------------------------------

function buildFingers(
  side: string,
  hand: Bone,
  sign: number
) {
  const fingerNames = [
    'thumb',
    'index',
    'middle',
    'ring',
    'little',
  ];

  const fingerLengths = [
    0.045,
    0.052,
    0.058,
    0.052,
    0.042,
  ];

  fingerNames.forEach((name, index) => {
    const thumb = index === 0;

    const x = thumb
      ? -sign * 0.075
      : sign * (-0.043 + (index - 1) * 0.029);

    const y = thumb ? -0.055 : -0.12;
    const length = fingerLengths[index];

    const proximal = addBone(
      `${side}-${name}-proximal`,
      hand,
      x,
      y,
      0
    );

    const distal = addBone(
      `${side}-${name}-distal`,
      proximal,
      0,
      -length,
      0
    );

    segment(
      `${side}-${name}-proximal-mesh`,
      proximal,
      0.022, length, 0.025,
      0, -length / 2, 0,
      skin
    );

    segment(
      `${side}-${name}-distal-mesh`,
      distal,
      0.02, length * 0.8, 0.023,
      0, -length * 0.4, 0,
      skin
    );

    proximal.setRotation(
      new Vector3(
        -0.12,
        0,
        thumb ? -sign * 0.5 : 0
      ),
      Space.LOCAL
    );

    distal.setRotation(
      new Vector3(-0.2, 0, 0),
      Space.LOCAL
    );
  });
}

buildFingers('left', left.hand, -1);
buildFingers('right', right.hand, 1);

console.assert(
  skeleton.bones.length === 44,
  `Expected 44 bones; found ${skeleton.bones.length}`
);

console.info(
  'Character skeleton:',
  skeleton.bones.length,
  'bones'
);

// --------------------------------------------------
// Skeleton overlay
// --------------------------------------------------

let debugVisible = false;

const jointMarkers = skeleton.bones.map((bone) => {
  const marker = MeshBuilder.CreateSphere(
    `${bone.name}-joint`,
    {
      diameter: 0.025,
      segments: 4,
    },
    scene
  );

  marker.material = debugMaterial;
  marker.isPickable = false;
  marker.renderingGroupId = 1;
  marker.setEnabled(false);

  return { bone, marker };
});

const debugLines = MeshBuilder.CreateLineSystem(
  'skeleton-lines',
  {
    lines: links.map(() => [
      Vector3.Zero(),
      new Vector3(0, 0.001, 0),
    ]),
    updatable: true,
  },
  scene
);

debugLines.color = new Color3(1, 0.75, 0.15);
debugLines.isPickable = false;
debugLines.renderingGroupId = 1;
debugLines.setEnabled(false);

scene.setRenderingAutoClearDepthStencil(
  1,
  true,
  true,
  true
);

function toggleSkeleton() {
  debugVisible = !debugVisible;

  debugLines.setEnabled(debugVisible);

  for (const { marker } of jointMarkers) {
    marker.setEnabled(debugVisible);
  }
}

function updateSkeletonOverlay() {
  if (!debugVisible) return;

  rigAnchor.computeWorldMatrix(true);
  skeleton.computeAbsoluteMatrices(true);

  for (const { bone, marker } of jointMarkers) {
    marker.position.copyFrom(
      bone.getAbsolutePosition(rigAnchor)
    );
  }

  MeshBuilder.CreateLineSystem(
    'skeleton-lines',
    {
      lines: links.map(({ parent, child }) => [
        parent.getAbsolutePosition(rigAnchor),
        child.getAbsolutePosition(rigAnchor),
      ]),
      instance: debugLines,
    },
    scene
  );
}

// --------------------------------------------------
// Camera and movement configuration
// --------------------------------------------------

const camera = new UniversalCamera(
  'third-person',
  new Vector3(0, 3, -5),
  scene
);

camera.inputs.clear();
camera.minZ = 0.05;
scene.activeCamera = camera;

const WALK_SPEED = 3;
const SPRINT_SPEED = 6;
const GRAVITY = 20;
const LOOK_SENSITIVITY = 0.002;
const CAMERA_DISTANCE = 5;

const keys = new Set<string>();

const movementKeys = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ShiftLeft',
  'ShiftRight',
]);

let yaw = 0;
let pitch = 0.25;
let verticalSpeed = 0;

// Animation state.

let gaitPhase = 0;
let movementBlend = 0;
let sprintBlend = 0;
let idleTime = 0;

// --------------------------------------------------
// Input
// --------------------------------------------------

const active = () => document.pointerLockElement === canvas;
const clearInput = () => keys.clear();

window.addEventListener('blur', clearInput);
document.addEventListener('pointerlockchange', clearInput);

canvas.addEventListener('click', () => {
  canvas.focus();

  try {
    const request = canvas.requestPointerLock();

    if (request) {
      void request.catch((error) => {
        console.warn('Pointer lock failed:', error);
      });
    }
  } catch (error) {
    console.warn('Pointer lock failed:', error);
  }
});

window.addEventListener('keydown', (event) => {
  if (!active()) return;

  if (event.code === 'KeyB') {
    event.preventDefault();

    if (!event.repeat) {
      toggleSkeleton();
    }

    return;
  }

  if (!movementKeys.has(event.code)) return;

  event.preventDefault();
  keys.add(event.code);
});

window.addEventListener('keyup', (event) => {
  keys.delete(event.code);
});

document.addEventListener('mousemove', (event) => {
  if (!active()) return;

  yaw += event.movementX * LOOK_SENSITIVITY;

  pitch = Math.max(
    -0.25,
    Math.min(
      1.1,
      pitch + event.movementY * LOOK_SENSITIVITY
    )
  );
});

// --------------------------------------------------
// Bone animation
// --------------------------------------------------

function rotate(
  bone: Bone,
  x = 0,
  y = 0,
  z = 0
) {
  bone.setRotation(
    new Vector3(x, y, z),
    Space.LOCAL
  );
}

function animateSide(
  rig: SideRig,
  phase: number,
  sign: number
) {
  const stride = Math.sin(phase);

  const forwardSwing = Math.max(0, stride);
  const backwardSwing = Math.max(0, -stride);

  const hipAmplitude =
    0.32 + sprintBlend * 0.2;

  const hipSwing =
    -stride * hipAmplitude * movementBlend;

  const kneeBend =
    0.045 +
    forwardSwing *
      (0.48 + sprintBlend * 0.5) *
      movementBlend;

  rotate(
    rig.thigh,
    hipSwing,
    0,
    sign * 0.012
  );

  rotate(rig.shin, kneeBend);

  const ankleCompensation =
    -(hipSwing + kneeBend);

  const toeOff =
    backwardSwing *
    (0.12 + sprintBlend * 0.1) *
    movementBlend;

  rotate(
    rig.foot,
    ankleCompensation + toeOff
  );

  rotate(
    rig.toe,
    -backwardSwing * 0.16 * movementBlend
  );

  rotate(
    rig.clavicle,
    0,
    -stride * 0.025 * movementBlend,
    0
  );

  const armSwing =
    stride *
    (0.24 + sprintBlend * 0.28) *
    movementBlend;

  rotate(
    rig.upperArm,
    armSwing - sprintBlend * 0.08,
    0,
    sign * (0.06 + sprintBlend * 0.03)
  );

  const elbowBend =
    0.16 +
    movementBlend * 0.08 +
    sprintBlend * 0.65 +
    backwardSwing * 0.12 * movementBlend;

  rotate(rig.forearm, -elbowBend);

  rotate(
    rig.hand,
    -0.025 - sprintBlend * 0.045,
    0,
    -sign * 0.025
  );
}

function animateCharacter(
  dt: number,
  actualSpeed: number
) {
  idleTime += dt;

  const response = 1 - Math.exp(-12 * dt);
  const poseResponse = 1 - Math.exp(-9 * dt);

  const targetMovement = Math.min(
    1,
    Math.max(0, (actualSpeed - 0.05) / WALK_SPEED)
  );

  movementBlend +=
    (targetMovement - movementBlend) * response;

  const targetSprint = Math.min(
    1,
    Math.max(
      0,
      (actualSpeed - WALK_SPEED) /
        (SPRINT_SPEED - WALK_SPEED)
    )
  );

  sprintBlend +=
    (targetSprint - sprintBlend) * poseResponse;

  // Actual displacement drives the gait clock.
  gaitPhase += actualSpeed * dt * 3.1;

  const idleWeight = 1 - movementBlend;
  const breathing = Math.sin(idleTime * 2.2);
  const sway = Math.sin(gaitPhase);

  rotate(
    pelvis,
    0,
    sway * 0.035 * movementBlend,
    sway * 0.015 * movementBlend
  );

  rotate(
    spine,
    0.035 * movementBlend + 0.09 * sprintBlend,
    -sway * 0.025 * movementBlend,
    0
  );

  rotate(
    chest,
    breathing * 0.012 * idleWeight +
      sprintBlend * 0.035,
    -sway * 0.035 * movementBlend,
    0
  );

  rotate(
    upperChest,
    breathing * 0.008 * idleWeight,
    0,
    0
  );

  rotate(neck, -sprintBlend * 0.045);
  rotate(head, breathing * 0.006 * idleWeight);
  rotate(jaw);

  animateSide(left, gaitPhase, -1);
  animateSide(right, gaitPhase + Math.PI, 1);

  const bounce =
    (1 - Math.cos(gaitPhase * 2)) * 0.5;

  visual.position.set(
    body.position.x,
    body.position.y - 0.9 - 0.008 +
      bounce *
        (0.008 + sprintBlend * 0.012) *
        movementBlend +
      breathing * 0.003 * idleWeight,
    body.position.z
  );
}

// --------------------------------------------------
// Frame update
// --------------------------------------------------

scene.onBeforeRenderObservable.add(() => {
  const dt = Math.min(
    engine.getDeltaTime() / 1000,
    0.033
  );

  const forward = active()
    ? Number(keys.has('KeyW')) - Number(keys.has('KeyS'))
    : 0;

  const rightInput = active()
    ? Number(keys.has('KeyD')) - Number(keys.has('KeyA'))
    : 0;

  const direction = new Vector3(
    Math.sin(yaw) * forward +
      Math.cos(yaw) * rightInput,
    0,
    Math.cos(yaw) * forward -
      Math.sin(yaw) * rightInput
  );

  if (direction.lengthSquared() > 0) {
    direction.normalize();
  }

  const sprinting =
    keys.has('ShiftLeft') || keys.has('ShiftRight');

  const speed = sprinting ? SPRINT_SPEED : WALK_SPEED;
  const previousPosition = body.position.clone();

  verticalSpeed -= GRAVITY * dt;

  body.moveWithCollisions(
    new Vector3(
      direction.x * speed * dt,
      verticalSpeed * dt,
      direction.z * speed * dt
    )
  );

  // Flat-arena safeguard.
  if (body.position.y < 0.9) {
    body.position.y = 0.9;
    verticalSpeed = 0;
  }

  if (
    Math.abs(body.position.y - previousPosition.y) < 0.0001 &&
    verticalSpeed < 0
  ) {
    verticalSpeed = 0;
  }

  const actualSpeed =
    Math.hypot(
      body.position.x - previousPosition.x,
      body.position.z - previousPosition.z
    ) / Math.max(dt, 0.0001);

  // Smoothly face the intended movement direction.
  if (direction.lengthSquared() > 0) {
    const targetYaw = Math.atan2(
      direction.x,
      direction.z
    );

    const difference = Math.atan2(
      Math.sin(targetYaw - visual.rotation.y),
      Math.cos(targetYaw - visual.rotation.y)
    );

    visual.rotation.y +=
      difference * (1 - Math.exp(-14 * dt));
  }

  animateCharacter(dt, actualSpeed);
  updateSkeletonOverlay();

  // Third-person camera obstruction handling.
  const cameraTarget = body.position.add(
    new Vector3(0, 0.55, 0)
  );

  const cameraDirection = new Vector3(
    -Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(yaw) * Math.cos(pitch)
  );

  const obstruction = scene.pickWithRay(
    new Ray(
      cameraTarget,
      cameraDirection,
      CAMERA_DISTANCE
    ),
    (mesh) => mesh.checkCollisions
  );

  const distance = obstruction?.hit
    ? Math.max(0.15, obstruction.distance - 0.25)
    : CAMERA_DISTANCE;

  camera.position.copyFrom(
    cameraTarget.add(cameraDirection.scale(distance))
  );

  camera.setTarget(cameraTarget);

  if (hint) {
    const state =
      actualSpeed < 0.1
        ? 'Idle'
        : actualSpeed > WALK_SPEED + 0.3
          ? 'Sprint'
          : 'Walk';

    hint.textContent =
      'Click to play · WASD move · Shift sprint · ' +
      'Mouse look · B skeleton · Esc release | ' +
      `${state} · ${skeleton.bones.length} bones`;
  }
});

// --------------------------------------------------
// Rendering
// --------------------------------------------------

engine.runRenderLoop(() => scene.render());

window.addEventListener('resize', () => {
  engine.resize();
});