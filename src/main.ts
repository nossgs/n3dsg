import {
  Engine,
  Scene,
  Color3,
  Color4,
  HemisphericLight,
  MeshBuilder,
  StandardMaterial,
  TransformNode,
  UniversalCamera,
  Vector3,
  Ray,
} from '@babylonjs/core';

import './style.css';

// Engine and scene

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

function createMaterial(name: string, color: Color3) {
  const material = new StandardMaterial(name, scene);

  material.diffuseColor = color;
  material.specularColor = Color3.Black();

  return material;
}

// Test arena

const concrete = createMaterial(
  'concrete',
  new Color3(0.35, 0.39, 0.43)
);

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

  // Arena boundary walls
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

// Player collision body

const body = MeshBuilder.CreateBox(
  'player-collider',
  { size: 1 },
  scene
);

body.isVisible = false;
body.isPickable = false;
body.ellipsoid.set(0.32, 0.9, 0.32);
body.position.set(0, 0.92, 0);

// Placeholder character

const visual = new TransformNode('character-visual', scene);

const shirt = createMaterial(
  'shirt',
  new Color3(0.24, 0.45, 0.54)
);

const skin = createMaterial(
  'skin',
  new Color3(0.7, 0.51, 0.37)
);

const pants = createMaterial(
  'pants',
  new Color3(0.17, 0.21, 0.27)
);

function createPart(
  name: string,
  width: number,
  height: number,
  depth: number,
  x: number,
  y: number,
  z: number,
  material: StandardMaterial,
  parent: TransformNode
) {
  const mesh = MeshBuilder.CreateBox(
    name,
    { width, height, depth },
    scene
  );

  mesh.position.set(x, y, z);
  mesh.material = material;
  mesh.parent = parent;
  mesh.isPickable = false;

  return mesh;
}

const torso = createPart(
  'torso',
  0.5, 0.65, 0.28,
  0, 1.13, 0,
  shirt,
  visual
);

createPart(
  'head',
  0.28, 0.3, 0.28,
  0, 1.62, 0,
  skin,
  visual
);

// Marks the character's forward direction.
createPart(
  'nose',
  0.07, 0.07, 0.08,
  0, 1.6, 0.17,
  skin,
  visual
);

function createLimb(
  name: string,
  x: number,
  y: number,
  length: number,
  material: StandardMaterial
) {
  const pivot = new TransformNode(`${name}-pivot`, scene);

  pivot.parent = visual;
  pivot.position.set(x, y, 0);

  createPart(
    name,
    0.16, length, 0.18,
    0, -length / 2, 0,
    material,
    pivot
  );

  return pivot;
}

const leftArm = createLimb(
  'left-arm', -0.35, 1.42, 0.6, shirt
);

const rightArm = createLimb(
  'right-arm', 0.35, 1.42, 0.6, shirt
);

const leftLeg = createLimb(
  'left-leg', -0.15, 0.8, 0.8, pants
);

const rightLeg = createLimb(
  'right-leg', 0.15, 0.8, 0.8, pants
);

// Third-person camera

const camera = new UniversalCamera(
  'third-person',
  new Vector3(0, 3, -5),
  scene
);

camera.inputs.clear();
camera.minZ = 0.05;
scene.activeCamera = camera;

// Input and movement configuration

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

// Animation state

let animationPhase = 0;
let animationBlend = 0;
let sprintBlend = 0;
let idleTime = 0;
let smoothedAnimationSpeed = 0;

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
  if (!active() || !movementKeys.has(event.code)) return;

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

// Update loop

scene.onBeforeRenderObservable.add(() => {
  const dt = Math.min(engine.getDeltaTime() / 1000, 0.033);

  // Camera-relative movement input

  const forward = active()
    ? Number(keys.has('KeyW')) - Number(keys.has('KeyS'))
    : 0;

  const right = active()
    ? Number(keys.has('KeyD')) - Number(keys.has('KeyA'))
    : 0;

  const direction = new Vector3(
    Math.sin(yaw) * forward + Math.cos(yaw) * right,
    0,
    Math.cos(yaw) * forward - Math.sin(yaw) * right
  );

  if (direction.lengthSquared() > 0) {
    direction.normalize();
  }

  const sprinting =
    keys.has('ShiftLeft') || keys.has('ShiftRight');

  const speed = sprinting ? SPRINT_SPEED : WALK_SPEED;
  const previousPosition = body.position.clone();

  // Gravity and collision movement

  verticalSpeed -= GRAVITY * dt;

  body.moveWithCollisions(
    new Vector3(
      direction.x * speed * dt,
      verticalSpeed * dt,
      direction.z * speed * dt
    )
  );

  // Flat-arena ground safeguard.
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

  // Smooth character facing

  if (direction.lengthSquared() > 0) {
    const targetYaw = Math.atan2(direction.x, direction.z);

    const difference = Math.atan2(
      Math.sin(targetYaw - visual.rotation.y),
      Math.cos(targetYaw - visual.rotation.y)
    );

    visual.rotation.y +=
      difference * (1 - Math.exp(-14 * dt));
  }

  // Procedural idle, walk, and sprint animation

  idleTime += dt;

  const movementResponse = 1 - Math.exp(-12 * dt);
  const poseResponse = 1 - Math.exp(-9 * dt);

  smoothedAnimationSpeed +=
    (actualSpeed - smoothedAnimationSpeed) *
    movementResponse;

  const targetMovementBlend = Math.min(
    1,
    Math.max(0, (actualSpeed - 0.05) / WALK_SPEED)
  );

  animationBlend +=
    (targetMovementBlend - animationBlend) *
    movementResponse;

  // Actual speed controls the sprint pose.
  const targetSprintBlend = Math.min(
    1,
    Math.max(
      0,
      (actualSpeed - WALK_SPEED) /
        (SPRINT_SPEED - WALK_SPEED)
    )
  );

  sprintBlend +=
    (targetSprintBlend - sprintBlend) *
    poseResponse;

  animationPhase +=
    smoothedAnimationSpeed * dt * 2.5;

  const idleWeight = 1 - animationBlend;
  const stride = Math.sin(animationPhase);
  const oppositeStride = -stride;

  const bounce =
    (1 - Math.cos(animationPhase * 2)) * 0.5;

  const breathing = Math.sin(idleTime * 2.2);
  const idleSway = Math.sin(idleTime * 1.4);

  const legAmplitude = 0.48 + sprintBlend * 0.32;
  const armAmplitude = 0.34 + sprintBlend * 0.38;

  const idleArmMotion =
    breathing * 0.018 * idleWeight;

  leftLeg.rotation.x =
    stride * legAmplitude * animationBlend;

  rightLeg.rotation.x =
    oppositeStride * legAmplitude * animationBlend;

  leftArm.rotation.x =
    oppositeStride * armAmplitude * animationBlend +
    idleArmMotion;

  rightArm.rotation.x =
    stride * armAmplitude * animationBlend +
    idleArmMotion;

  leftArm.rotation.z =
    -0.06 - sprintBlend * 0.05;

  rightArm.rotation.z =
    0.06 + sprintBlend * 0.05;

  // Idle breathing affects the torso only.
  torso.scaling.y =
    1 + breathing * 0.012 * idleWeight;

  // Local positive Z is the character's forward direction.
  visual.rotation.x =
    0.035 * animationBlend +
    0.13 * sprintBlend;

  visual.rotation.z =
    idleSway * 0.008 * idleWeight +
    stride * 0.018 * animationBlend;

  const movementBob =
    bounce *
    (0.022 + sprintBlend * 0.025) *
    animationBlend;

  const idleBob =
    breathing * 0.004 * idleWeight;

  const sprintLowering = sprintBlend * 0.015;

  // Animation offsets do not move the collision body.
  visual.position.set(
    body.position.x,
    body.position.y - 0.9 +
      movementBob +
      idleBob -
      sprintLowering,
    body.position.z
  );

  // Third-person camera obstruction handling

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

  // Controls and animation state display

  if (hint) {
    const state =
      actualSpeed > 0.1
        ? sprinting ? 'Sprint' : 'Walk'
        : 'Idle';

    hint.textContent =
      'Click to play · WASD move · Shift sprint · ' +
      `Mouse look · Esc release | ${state}`;
  }
});

// Rendering

engine.runRenderLoop(() => scene.render());

window.addEventListener('resize', () => {
  engine.resize();
});