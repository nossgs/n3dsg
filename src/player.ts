import { MeshBuilder, Ray, Scene, UniversalCamera, Vector3 } from '@babylonjs/core';

export function createPlayer(scene: Scene, canvas: HTMLCanvasElement) {
  const WALK_SPEED = 5;
  const SPRINT_SPEED = 8;
  const GRAVITY = 20;
  const JUMP_SPEED = 7;
  const LOOK_SENSITIVITY = 0.002;
  const body = MeshBuilder.CreateBox('player-collider', { size: 1 }, scene);
  body.isVisible = false;
  body.isPickable = false;
  body.position.set(0, 0.92, -8);
  body.ellipsoid = new Vector3(0.35, 0.9, 0.35);
  const camera = new UniversalCamera('player', body.position.add(new Vector3(0, 0.8, 0)), scene);
  camera.inputs.clear();
  camera.minZ = 0.05;
  scene.activeCamera = camera;
  const keys = new Set<string>();
  let enabled = false;
  let verticalSpeed = 0;
  let jumpRequested = false;
  const active = () => enabled && document.pointerLockElement === canvas;
  const reset = () => { keys.clear(); jumpRequested = false; };
  document.addEventListener('pointerlockchange', reset);
  window.addEventListener('blur', reset);
  window.addEventListener('keydown', event => {
    if (!active()) return;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight'].includes(event.code)) {
      event.preventDefault();
      keys.add(event.code);
      if (event.code === 'Space' && !event.repeat) jumpRequested = true;
    }
  });
  window.addEventListener('keyup', event => keys.delete(event.code));
  document.addEventListener('mousemove', event => {
    if (!active()) return;
    camera.rotation.y += event.movementX * LOOK_SENSITIVITY;
    camera.rotation.x = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01,
      camera.rotation.x + event.movementY * LOOK_SENSITIVITY));
  });
  function grounded(): boolean {
    const feet = body.position.add(new Vector3(0, -0.9 + 0.08, 0));
    const hit = scene.pickWithRay(new Ray(feet, Vector3.Down(), 0.16),
      mesh => mesh !== body && mesh.checkCollisions && mesh.isEnabled());
    return !!hit?.hit;
  }
  scene.onBeforeRenderObservable.add(() => {
    if (active()) {
      const elapsed = Math.min(scene.getEngine().getDeltaTime() / 1000, 0.05);
      const steps = Math.max(1, Math.ceil(elapsed / (1 / 120)));
      const dt = elapsed / steps;
      const forward = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
      const right = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
      const direction = new Vector3(
        Math.sin(camera.rotation.y) * forward + Math.cos(camera.rotation.y) * right,
        0,
        Math.cos(camera.rotation.y) * forward - Math.sin(camera.rotation.y) * right
      );
      if (direction.lengthSquared() > 0) direction.normalize();
      const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? SPRINT_SPEED : WALK_SPEED;
      for (let i = 0; i < steps; i++) {
        const onGround = grounded();
        if (onGround && verticalSpeed < 0) verticalSpeed = 0;
        if (jumpRequested && onGround && verticalSpeed <= 0) verticalSpeed = JUMP_SPEED;
        jumpRequested = false;
        verticalSpeed -= GRAVITY * dt;
        const previousY = body.position.y;
        body.moveWithCollisions(new Vector3(direction.x * speed * dt, verticalSpeed * dt, direction.z * speed * dt));
        if (verticalSpeed > 0 && body.position.y - previousY < verticalSpeed * dt * 0.5) verticalSpeed = 0;
      }
    }
    camera.position.copyFrom(body.position);
    camera.position.y += 0.8;
  });
  canvas.addEventListener('click', () => {
    if (enabled) void canvas.requestPointerLock();
  });
  return {
    start() {
      enabled = true;
      canvas.tabIndex = 0;
      canvas.focus();
      void canvas.requestPointerLock();
    }
  };
}
