import {
  Scene, UniversalCamera, Mesh, MeshBuilder, StandardMaterial,
  Color3, Vector3, Ray,
} from '@babylonjs/core';

type AmmoId = 'standard' | 'heavy';
type Magazine = { id: number; rounds: number; capacity: number; ammo: AmmoId };
type Projectile = { position: Vector3; velocity: Vector3; life: number; damage: number };

// Fictional balancing values, not specifications for real cartridges.
const ammunition = {
  standard: { label: 'Standard', speed: 700, damage: 50, recoil: 1 },
  heavy: { label: 'Heavy', speed: 600, damage: 70, recoil: 1.3 },
} satisfies Record<AmmoId, { label: string; speed: number; damage: number; recoil: number }>;

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

  const targetMaterial = new StandardMaterial('targetMaterial', scene);
  targetMaterial.diffuseColor = new Color3(0.7, 0.23, 0.16);
  const targets = new Map<Mesh, number>();
  function spawnTargets(): void {
    for (const target of targets.keys()) target.dispose();
    targets.clear();
    for (const [index, x, z] of [[0, -8, 7], [1, 8, 10], [2, 0, 20]]) {
      const target = MeshBuilder.CreateBox(`target${index}`, {
        width: 0.8, height: 1.6, depth: 0.25,
      }, scene);
      target.position.set(x, 0.8, z);
      target.material = targetMaterial;
      targets.set(target, 120);
    }
  }
  spawnTargets();

  let loaded: Magazine = { id: 1, rounds: 29, capacity: 30, ammo: 'standard' };
  let chamber: AmmoId | null = 'standard';
  const spare: Magazine[] = [
    { id: 2, rounds: 30, capacity: 30, ammo: 'standard' },
    { id: 3, rounds: 30, capacity: 30, ammo: 'heavy' },
  ];
  let selectedId = 2;
  let proficiency = 0.5;
  let aiming = false;
  let reloadRemaining = 0;
  let reloadTargetId: number | null = null;
  let cooldown = 0;
  let recoil = 0;
  let shotQueued = false;
  let message = 'Prototype range. Ammo values are fictional.';
  let shotsConsumed = 0;
  const initialTotal = 90;
  const projectiles: Projectile[] = [];

  function selectNext(): void {
    if (reloadRemaining > 0) return;
    const index = spare.findIndex(m => m.id === selectedId);
    selectedId = spare[(index + 1) % spare.length].id;
  }
  function reload(): void {
    if (reloadRemaining > 0) return;
    const replacement = spare.find(m => m.id === selectedId);
    if (!replacement || replacement.rounds === 0) {
      message = 'Selected magazine is empty.';
      return;
    }
    reloadTargetId = replacement.id;
    reloadRemaining = chamber === null ? 2.8 : 2.2;
    message = chamber === null ? 'Empty reload…' : 'Magazine swap…';
  }
  window.addEventListener('keydown', event => {
    if (isPaused() || event.repeat) return;
    if (event.code === 'KeyR') reload();
    if (event.code === 'KeyB') selectNext();
    if (event.code === 'BracketLeft') proficiency = Math.max(0, proficiency - 0.25);
    if (event.code === 'BracketRight') proficiency = Math.min(1, proficiency + 0.25);
    if (event.code === 'KeyT') spawnTargets();
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

  function feedChamber(): void {
    if (chamber === null && loaded.rounds > 0) {
      loaded.rounds--;
      chamber = loaded.ammo;
    }
  }
  function shoot(): void {
    if (reloadRemaining > 0 || cooldown > 0) return;
    if (chamber === null) {
      message = 'Empty chamber. Press R.';
      cooldown = 0.15;
      return;
    }
    const ammo = ammunition[chamber];
    chamber = null;
    shotsConsumed++;
    feedChamber();
    cooldown = 0.12;
    const recoilScale = (1.4 - proficiency * 0.7) * ammo.recoil;
    recoil = Math.min(recoil + 0.07 * recoilScale, 0.18);

    const eye = player.position.add(new Vector3(0, 0.75, 0));
    const forward = camera.getForwardRay().direction.normalize();
    const intended = scene.pickWithRay(new Ray(eye, forward, 500),
      mesh => mesh !== player && (mesh.checkCollisions || targets.has(mesh as Mesh)));
    const aimPoint = intended?.hit && intended.pickedPoint
      ? intended.pickedPoint : eye.add(forward.scale(500));
    const right = new Vector3(forward.z, 0, -forward.x).normalize();
    const muzzle = eye.add(forward.scale(0.45))
      .add(right.scale(aiming ? 0.04 : 0.18))
      .add(new Vector3(0, aiming ? -0.08 : -0.18, 0));
    const direction = aimPoint.subtract(muzzle).normalize();
    const spread = (aiming ? 0.001 : 0.008) * (1.7 - proficiency);
    direction.x += (Math.random() - 0.5) * spread;
    direction.y += (Math.random() - 0.5) * spread;
    direction.z += (Math.random() - 0.5) * spread;
    direction.normalize();
    kick((aiming ? 0.014 : 0.025) * recoilScale);

    const offset = muzzle.subtract(eye);
    const length = offset.length();
    const obstruction = scene.pickWithRay(
      new Ray(eye, offset.scale(1 / length), length),
      mesh => mesh !== player && mesh.checkCollisions,
    );
    if (obstruction?.hit) {
      message = 'Muzzle obstructed; round expended.';
      return;
    }
    projectiles.push({
      position: muzzle, velocity: direction.scale(ammo.speed),
      life: 3, damage: ammo.damage,
    });
    message = `Fired ${ammo.label}.`;
  }

  function update(dt: number): void {
    if (isPaused()) {
      aiming = false;
      shotQueued = false;
    } else {
      cooldown = Math.max(0, cooldown - dt);
      recoil = Math.max(0, recoil - dt * 0.35);
      if (reloadRemaining > 0) {
        reloadRemaining = Math.max(0, reloadRemaining - dt);
        if (reloadRemaining === 0) {
          const index = spare.findIndex(m => m.id === reloadTargetId);
          if (index >= 0) {
            const replacement = spare.splice(index, 1)[0];
            spare.push(loaded);
            loaded = replacement;
            // A tactical swap preserves the existing chambered cartridge.
            feedChamber();
            selectedId = spare[0].id;
            message = 'Reload complete; ammunition preserved.';
          }
          reloadTargetId = null;
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
            const remaining = health - projectile.damage;
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
    const total = loaded.rounds + spare.reduce((sum, m) => sum + m.rounds, 0)
      + (chamber === null ? 0 : 1);
    panel.textContent = [
      `Chamber: ${chamber === null ? 'empty' : ammunition[chamber].label}`,
      `Loaded #${loaded.id}: ${loaded.rounds}/${loaded.capacity} ${ammunition[loaded.ammo].label}`,
      `Spare: ${spare.map(m => `${m.id === selectedId ? '>' : ''}#${m.id} ${m.rounds} ${ammunition[m.ammo].label}`).join(' | ')}`,
      `Proficiency: ${Math.round(proficiency * 100)}% (test control)`,
      `Remaining: ${total} | Expended: ${shotsConsumed} | Audit: ${total + shotsConsumed === initialTotal ? 'OK' : 'ERROR'}`,
      reloadRemaining > 0 ? `Reload: ${reloadRemaining.toFixed(1)}s` : message,
      'LMB: fire · RMB: aim · R: reload · B: select spare',
      '[ / ]: test proficiency · T: reset targets only',
    ].join('\n');
  }
  return { update };
}
