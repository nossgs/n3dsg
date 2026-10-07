import './style.css';
import { createCombat } from './combat';
import {
  Engine, Scene, UniversalCamera, Vector3, HemisphericLight,
  DirectionalLight, MeshBuilder, StandardMaterial, Color3, Color4, Ray,
} from '@babylonjs/core';

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const errorPanel = document.querySelector<HTMLPreElement>('#error')!;
const pauseScreen = document.querySelector<HTMLElement>('#pause-screen')!;
const pauseMessage = document.querySelector<HTMLElement>('#pause-message')!;
const playButton = document.querySelector<HTMLButtonElement>('#play')!;
const crosshair = document.querySelector<HTMLElement>('#crosshair')!;
const viewLabel = document.querySelector<HTMLElement>('#view-label')!;
document.querySelector<HTMLElement>('#title')!.textContent = document.title;

function reportError(error: unknown): void {
  errorPanel.hidden = false;
  errorPanel.textContent = error instanceof Error
    ? error.stack ?? error.message : String(error);
  console.error(error);
}
window.addEventListener('error', event => reportError(event.error ?? event.message));
window.addEventListener('unhandledrejection', event => reportError(event.reason));

try {
  const engine = new Engine(canvas, true);
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.48, 0.62, 0.76, 1);
  scene.collisionsEnabled = true;

  const camera = new UniversalCamera('camera', new Vector3(0, 1.65, -12), scene);
  camera.inputs.clear();
  camera.minZ = 0.05;
  camera.fov = 1.05;
  scene.activeCamera = camera;

  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene);
  ambient.intensity = 0.75;
  const sun = new DirectionalLight('sun', new Vector3(-1, -2, 1), scene);
  sun.intensity = 0.65;

  function material(name: string, color: Color3): StandardMaterial {
    const result = new StandardMaterial(name, scene);
    result.diffuseColor = color;
    result.specularColor = new Color3(0.05, 0.05, 0.05);
    return result;
  }

  const ground = MeshBuilder.CreateGround('ground', { width: 80, height: 80 }, scene);
  ground.material = material('groundMaterial', new Color3(0.28, 0.32, 0.26));
  ground.checkCollisions = true;
  const concrete = material('concrete', new Color3(0.53, 0.54, 0.52));

  function obstacle(
    name: string, x: number, z: number,
    width: number, height: number, depth: number,
  ): void {
    const mesh = MeshBuilder.CreateBox(name, { width, height, depth }, scene);
    mesh.position.set(x, height / 2, z);
    mesh.material = concrete;
    mesh.checkCollisions = true;
  }
  obstacle('block0', -4, 0, 3, 2, 3);
  obstacle('block1', 4, 3, 3, 3, 3);
  obstacle('block2', 0, 9, 3, 4, 3);
  obstacle('wallLeft', -3, -7, 1, 3, 6);
  obstacle('wallRight', 3, -7, 1, 3, 6);
  const boundary = 40;
  obstacle('northBoundary', 0, boundary, 81, 4, 1);
  obstacle('southBoundary', 0, -boundary, 81, 4, 1);
  obstacle('eastBoundary', boundary, 0, 1, 4, 81);
  obstacle('westBoundary', -boundary, 0, 1, 4, 81);

  const body = MeshBuilder.CreateCapsule('player', { height: 1.8, radius: 0.35 }, scene);
  body.position.set(0, 0.92, -15);
  body.material = material('playerMaterial', new Color3(0.18, 0.27, 0.34));
  body.ellipsoid = new Vector3(0.35, 0.9, 0.35);
  body.ellipsoidOffset = Vector3.Zero();
  body.isPickable = false;

  const marker = MeshBuilder.CreateBox('facingMarker', {
    width: 0.15, height: 0.12, depth: 0.15,
  }, scene);
  marker.parent = body;
  marker.position.set(0, 0.55, 0.34);
  marker.material = material('markerMaterial', new Color3(0.85, 0.6, 0.2));
  marker.isPickable = false;

  const keys = new Set<string>();
  let paused = true;
  let thirdPerson = false;
  let yaw = 0;
  let pitch = 0;
  let verticalVelocity = 0;
  const mouseSensitivity = 0.002;
  const walkSpeed = 3.5;
  const sprintSpeed = 6;
  const gravity = 18;
  const maxPitch = 1.35;
  const thirdPersonDistance = 3.5;

  function updateViewLabel(): void {
    viewLabel.textContent = thirdPerson ? 'Third person' : 'First person';
  }
  function pause(message: string): void {
    paused = true;
    keys.clear();
    pauseMessage.textContent = message;
    pauseScreen.hidden = false;
    crosshair.hidden = true;
    if (document.pointerLockElement === canvas) document.exitPointerLock();
  }
  async function requestPlay(): Promise<void> {
    pauseMessage.textContent = 'Requesting mouse control…';
    try {
      await canvas.requestPointerLock();
    } catch (error) {
      pauseMessage.textContent = 'Mouse control was not granted. Click Play to try again.';
      console.warn(error);
    }
  }
  playButton.addEventListener('click', () => { void requestPlay(); });
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === canvas) {
      paused = false;
      keys.clear();
      pauseScreen.hidden = true;
      crosshair.hidden = false;
    } else pause('Paused. Click Play to resume.');
  });
  document.addEventListener('pointerlockerror', () => {
    pause('Mouse control was not granted. Click Play to try again.');
  });
  window.addEventListener('blur', () => pause('Paused because the game lost focus.'));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause('Paused because the game was hidden.');
  });
  window.addEventListener('keydown', event => {
    if (event.code === 'Escape') {
      pause('Paused. Click Play to resume.');
      return;
    }
    if (paused) return;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'KeyV'].includes(event.code)) {
      event.preventDefault();
    }
    keys.add(event.code);
    if (event.code === 'KeyV' && !event.repeat) {
      thirdPerson = !thirdPerson;
      updateViewLabel();
    }
  });
  window.addEventListener('keyup', event => { keys.delete(event.code); });
  document.addEventListener('mousemove', event => {
    if (paused || document.pointerLockElement !== canvas) return;
    yaw += event.movementX * mouseSensitivity;
    pitch += event.movementY * mouseSensitivity;
    pitch = Math.max(-maxPitch, Math.min(maxPitch, pitch));
  });

  function updatePlayer(dt: number): void {
    const forward = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const right = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const movement = Vector3.Zero();
    if (keys.has('KeyW')) movement.addInPlace(forward);
    if (keys.has('KeyS')) movement.subtractInPlace(forward);
    if (keys.has('KeyD')) movement.addInPlace(right);
    if (keys.has('KeyA')) movement.subtractInPlace(right);
    if (movement.lengthSquared() > 0) movement.normalize();
    const sprinting = keys.has('ShiftLeft') || keys.has('ShiftRight');
    movement.scaleInPlace((sprinting ? sprintSpeed : walkSpeed) * dt);
    verticalVelocity = Math.max(verticalVelocity - gravity * dt, -30);
    movement.y = verticalVelocity * dt;
    const previousY = body.position.y;
    body.moveWithCollisions(movement);
    if (verticalVelocity < 0 && Math.abs(body.position.y - previousY) < 0.0001) {
      verticalVelocity = 0;
    }
    body.rotation.y = yaw;
  }

  function updateCamera(): void {
    const eye = body.position.add(new Vector3(0, 0.75, 0));
    const direction = new Vector3(
      Math.sin(yaw) * Math.cos(pitch),
      -Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch),
    );
    let cameraPosition = eye.clone();
    if (thirdPerson) {
      const desiredPosition = eye.subtract(direction.scale(thirdPersonDistance))
        .add(new Vector3(0, 0.25, 0));
      const offset = desiredPosition.subtract(eye);
      const distance = offset.length();
      const rayDirection = offset.scale(1 / distance);
      const hit = scene.pickWithRay(
        new Ray(eye, rayDirection, distance),
        mesh => mesh.checkCollisions && mesh !== body,
      );
      const allowedDistance = hit?.hit ? Math.max(0, hit.distance - 0.25) : distance;
      cameraPosition = eye.add(rayDirection.scale(allowedDistance));
      body.isVisible = allowedDistance > 0.8;
      marker.isVisible = allowedDistance > 0.8;
    } else {
      body.isVisible = false;
      marker.isVisible = false;
    }
    camera.position.copyFrom(cameraPosition);
    camera.setTarget(cameraPosition.add(direction.scale(20)));
  }

  const combat = createCombat(
    scene,
    camera,
    body,
    () => paused,
    amount => { pitch = Math.max(-maxPitch, pitch - amount); },
  );

  updateViewLabel();
  updateCamera();
  engine.runRenderLoop(() => {
    const dt = Math.min(engine.getDeltaTime() / 1000, 0.05);
    if (!paused) updatePlayer(dt);
    updateCamera();
    combat.update(dt);
    scene.render();
  });
  window.addEventListener('resize', () => engine.resize());
} catch (error) {
  reportError(error);
}
