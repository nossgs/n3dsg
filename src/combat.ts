import {
  Scene, UniversalCamera, Mesh, MeshBuilder, StandardMaterial,
  Color3, Vector3, Ray,
} from '@babylonjs/core';

type Magazine = { id: number; rounds: number; capacity: number };
type Projectile = { position: Vector3; velocity: Vector3; life: number };

export function createCombat(
  scene: Scene,
  camera: UniversalCamera,
  player: Mesh,
  isPaused: () => boolean,
  kick: (amount: number) => void,
): { update: (dt: number) => void } {
  const panel = document.createElement('div');
  Object.assign(panel.style, {
    position: 'absolute', bottom: '20px', right: '20px',
    padding: '12px 16px', background: '#111c', color: '#eee',
    font: '13px system-ui', pointerEvents: 'none', whiteSpace: 'pre-line',
  });
  document.body.append(panel);

  const weaponMaterial = new StandardMaterial('weaponMaterial', scene);
  weaponMaterial.diffuseColor = new Color3(0.12, 0.14, 0.16);
  const weapon = MeshBuilder.CreateBox('weaponPlaceholder', {
    width: 0.10, height: 0.12, depth: 0.55,
  }, scene);
  weapon.parent = camera;
  weapon.material = weaponMaterial;
  weapon.isPickable = false;
  weapon.position.set(0.23, -0.2, 0.65);

  const targetMaterial = new StandardMaterial('targetMaterial', scene);
  targetMaterial.diffuseColor = new Color3(0.7, 0.23, 0.16);
  const targets = new Map<Mesh, number>();
  for (const [index, x, z] of [[0, -8, 7], [1, 8, 10], [2, 0, 20]]) {
    const target = MeshBuilder.CreateBox(`target${index}`, {
      width: 0.8, height: 1.6, depth: 0.25,
    }, scene);
    target.position.set(x, 0.8, z);
    target.material = targetMaterial;
    targets.set(target, 100);
  }

  let loaded: Magazine = { id: 1, rounds: 30, capacity: 30 };
  const spare: Magazine[] = [
    { id: 2, rounds: 30, capacity: 30 },
    { id: 3, rounds: 30, capacity: 30 },
  ];
  const projectiles: Projectile[] = [];
  let aiming = false;
  let reloadRemaining = 0;
  let cooldown = 0;
  let recoil = 0;
  let message = 'Targets: red panels. No enemy AI yet.';
  let shotQueued = false;

  function reload(): void {
    if (reloadRemaining > 0 || loaded.rounds === loaded.capacity) return;
    if (!spare.some(m => m.rounds > loaded.rounds)) {
      message = 'No spare magazine with more ammunition.';
      return;
    }
    reloadRemaining = 2.2;
    message = 'Reloading…';
  }

  window.addEventListener('keydown', event => {
    if (!isPaused() && event.code === 'KeyR' && !event.repeat) reload();
  });
  document.addEventListener('mousedown', event => {
    if (isPaused() || document.pointerLockElement === null) return;
    if (event.button === 0) shotQueued = true;
    if (event.button === 2) aiming = true;
  });
  document.addEventListener('mouseup', event => {
    if (event.button === 2) aiming = false;
  });
  document.addEventListener('contextmenu', event => {
    if (document.pointerLockElement !== null) event.preventDefault();
  });
  window.addEventListener('blur', () => { aiming = false; shotQueued = false; });

  function shoot(): void {
    if (reloadRemaining > 0 || cooldown > 0) return;
    if (loaded.rounds === 0) {
      message = 'Empty magazine. Press R.';
      cooldown = 0.15;
      return;
    }
    const eye = player.position.add(new Vector3(0, 0.75, 0));
    const forward = camera.getForwardRay().direction.normalize();
    const intended = scene.pickWithRay(new Ray(eye, forward, 500),
      mesh => mesh !== player && (mesh.checkCollisions || targets.has(mesh as Mesh)));
    const aimPoint = intended?.hit && intended.pickedPoint
      ? intended.pickedPoint : eye.add(forward.scale(500));

    // Muzzle anchored to the character, never the third-person camera.
    const right = new Vector3(forward.z, 0, -forward.x).normalize();
    const muzzle = eye.add(forward.scale(0.45))
      .add(right.scale(aiming ? 0.04 : 0.18))
      .add(new Vector3(0, aiming ? -0.08 : -0.18, 0));
    const direction = aimPoint.subtract(muzzle).normalize();
    const spread = aiming ? 0.001 : 0.008;
    direction.x += (Math.random() - 0.5) * spread;
    direction.y += (Math.random() - 0.5) * spread;
    direction.z += (Math.random() - 0.5) * spread;
    direction.normalize();

    loaded.rounds--;
    cooldown = 0.12;
    recoil = Math.min(recoil + 0.07, 0.15);
    kick(aiming ? 0.014 : 0.025);

    const muzzleOffset = muzzle.subtract(eye);
    const obstruction = scene.pickWithRay(
      new Ray(eye, muzzleOffset.scale(1 / muzzleOffset.length()), muzzleOffset.length()),
      mesh => mesh !== player && mesh.checkCollisions,
    );
    if (obstruction?.hit) {
      message = 'Muzzle obstructed.';
      return;
    }
    projectiles.push({ position: muzzle, velocity: direction.scale(700), life: 3 });
    message = 'Fired.';
  }

  function update(dt: number): void {
    const paused = isPaused();
    if (paused) {
      aiming = false;
      shotQueued = false;
    } else {
      cooldown = Math.max(0, cooldown - dt);
      recoil = Math.max(0, recoil - dt * 0.35);
      if (reloadRemaining > 0) {
        reloadRemaining = Math.max(0, reloadRemaining - dt);
        if (reloadRemaining === 0) {
          let best = 0;
          for (let i = 1; i < spare.length; i++) {
            if (spare[i].rounds > spare[best].rounds) best = i;
          }
          const replacement = spare.splice(best, 1)[0];
          spare.push(loaded);
          loaded = replacement;
          message = 'Magazine replaced; removed rounds preserved.';
        }
      }
      if (shotQueued) shoot();
      shotQueued = false;

      for (let i = projectiles.length - 1; i >= 0; i--) {
        const projectile = projectiles[i];
        projectile.velocity.y -= 9.81 * dt;
        const segment = projectile.velocity.scale(dt);
        const distance = segment.length();
        const hit = scene.pickWithRay(
          new Ray(projectile.position, segment.scale(1 / distance), distance),
          mesh => mesh !== player && (mesh.checkCollisions || targets.has(mesh as Mesh)),
        );
        projectile.life -= dt;
        if (hit?.hit) {
          const target = hit.pickedMesh as Mesh;
          const health = targets.get(target);
          if (health !== undefined) {
            const remaining = health - 50;
            message = `Target hit: ${Math.max(0, remaining)} health.`;
            if (remaining <= 0) {
              targets.delete(target);
              target.dispose();
              message = 'Target destroyed.';
            } else targets.set(target, remaining);
          } else message = 'Shot struck terrain or cover.';
          projectiles.splice(i, 1);
        } else if (projectile.life <= 0) projectiles.splice(i, 1);
        else projectile.position.addInPlace(segment);
      }
    }
    camera.fov = aiming ? 0.7 : 1.05;
    weapon.position.set(aiming ? 0 : 0.23, aiming ? -0.13 : -0.2, 0.65 - recoil);
    panel.textContent = [
      `Magazine ${loaded.id}: ${loaded.rounds}/${loaded.capacity}`,
      `Spare magazines: ${spare.map(m => `${m.id}: ${m.rounds}`).join(' | ')}`,
      reloadRemaining > 0 ? `Reload: ${reloadRemaining.toFixed(1)}s` : message,
      'Left click: fire · Hold right click: aim · R: reload',
    ].join('\n');
  }
  return { update };
}
