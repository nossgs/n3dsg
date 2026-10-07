import { Scene, UniversalCamera, Mesh, MeshBuilder, StandardMaterial, Color3, Vector3, Ray } from '@babylonjs/core';
type AmmoId = 'standard' | 'heavy';
type Magazine = { id: number; rounds: number; capacity: number; ammo: AmmoId };
type Projectile = { position: Vector3; velocity: Vector3; life: number; damage: number; owner: 'player' | 'hostile' };
const ammunition = {
  standard: { label: 'Standard', speed: 700, damage: 50, recoil: 1 },
  heavy: { label: 'Heavy', speed: 600, damage: 70, recoil: 1.3 },
} satisfies Record<AmmoId, { label: string; speed: number; damage: number; recoil: number }>;

export function createCombat(scene: Scene, camera: UniversalCamera, player: Mesh,
  isPaused: () => boolean, kick: (amount: number) => void
): { update: (dt: number) => void; isDead: () => boolean; reset: () => void } {
  const panel = document.createElement('div');
  Object.assign(panel.style, { position: 'absolute', bottom: '20px', right: '20px',
    padding: '12px 16px', background: '#111c', color: '#eee', font: '13px system-ui',
    pointerEvents: 'none', whiteSpace: 'pre-line' });
  document.body.append(panel);
  const weaponMaterial = new StandardMaterial('weaponMaterial', scene);
  weaponMaterial.diffuseColor = new Color3(0.12, 0.14, 0.16);
  const weapon = MeshBuilder.CreateBox('weaponPlaceholder', { width: 0.10, height: 0.12, depth: 0.55 }, scene);
  weapon.parent = camera; weapon.material = weaponMaterial; weapon.isPickable = false;
  const targetMaterial = new StandardMaterial('targetMaterial', scene);
  targetMaterial.diffuseColor = new Color3(0.7, 0.23, 0.16);
  const targets = new Map<Mesh, number>();
  function spawnTargets(): void {
    for (const target of targets.keys()) target.dispose();
    targets.clear();
    for (const [index, x, z] of [[0, -8, 7], [1, 8, 10], [2, 0, 20]]) {
      const target = MeshBuilder.CreateBox(`target${index}`, { width: 0.8, height: 1.6, depth: 0.25 }, scene);
      target.position.set(x, 0.8, z); target.material = targetMaterial; targets.set(target, 120);
    }
  }
  spawnTargets();
  const hostileMaterial = new StandardMaterial('hostileMaterial', scene);
  hostileMaterial.diffuseColor = new Color3(0.85, 0.32, 0.08);
  const hostile = MeshBuilder.CreateCapsule('hostile', { height: 1.8, radius: 0.35 }, scene);
  hostile.material = hostileMaterial; hostile.position.set(8, 0.92, 15); hostile.rotation.y = Math.PI;
  hostile.ellipsoid = new Vector3(0.35, 0.9, 0.35); hostile.ellipsoidOffset = Vector3.Zero();
  const hostileMarker = MeshBuilder.CreateBox('hostileFacing', { width: 0.18, height: 0.15, depth: 0.2 }, scene);
  hostileMarker.parent = hostile; hostileMarker.position.set(0, 0.55, 0.35);
  hostileMarker.material = weaponMaterial; hostileMarker.isPickable = false;
  // Keep damage independent of the visible body in either camera perspective.
  const playerHitbox = MeshBuilder.CreateCapsule('playerCombatHitbox', { height: 1.8, radius: 0.35 }, scene);
  playerHitbox.visibility = 0; playerHitbox.isPickable = true;
  playerHitbox.position.copyFrom(player.position);
  let playerHealth = 100; let hostileHealth = 150;
  let reaction = 0; let hostileCooldown = 0; let hostileStatus = 'Searching';
  let lastSeen: Vector3 | null = null; let memoryRemaining = 8;
  let blockedTime = 0; let turnPreference = 1;
  let loaded: Magazine = { id: 1, rounds: 29, capacity: 30, ammo: 'standard' };
  let chamber: AmmoId | null = 'standard';
  const spare: Magazine[] = [
    { id: 2, rounds: 30, capacity: 30, ammo: 'standard' },
    { id: 3, rounds: 30, capacity: 30, ammo: 'heavy' },
  ];
  let selectedId = 2; let proficiency = 0.5; let aiming = false;
  let reloadRemaining = 0; let reloadTargetId: number | null = null;
  let cooldown = 0; let recoil = 0; let shotQueued = false; let shotsConsumed = 0;
  let message = 'Orange capsule: mobile hostile. Ammo values are fictional.';
  const initialTotal = 90; const projectiles: Projectile[] = [];
  function reset(): void {
    playerHealth = 100; hostileHealth = 150; reaction = 0; hostileCooldown = 0;
    hostileStatus = 'Searching'; lastSeen = null; memoryRemaining = 0; blockedTime = 0; turnPreference = 1;
    hostile.setEnabled(true); hostile.rotation.y = Math.PI; hostile.position.set(8, 0.92, 15);
    hostile.computeWorldMatrix(true); projectiles.length = 0;
    shotQueued = false; aiming = false; reloadRemaining = 0; reloadTargetId = null; cooldown = 0; recoil = 0;
    message = 'Development reset. Ammunition unchanged.';
  }
  function feedChamber(): void {
    if (chamber === null && loaded.rounds > 0) { loaded.rounds--; chamber = loaded.ammo; }
  }
  function reload(): void {
    if (reloadRemaining > 0) return;
    const replacement = spare.find(m => m.id === selectedId);
    if (!replacement || replacement.rounds === 0) { message = 'Selected magazine is empty.'; return; }
    reloadTargetId = replacement.id; reloadRemaining = chamber === null ? 2.8 : 2.2;
    message = chamber === null ? 'Empty reload…' : 'Magazine swap…';
  }
  window.addEventListener('keydown', event => {
    if (isPaused() || playerHealth <= 0 || event.repeat) return;
    if (event.code === 'KeyR') reload();
    if (event.code === 'KeyB' && reloadRemaining === 0) {
      const index = spare.findIndex(m => m.id === selectedId); selectedId = spare[(index + 1) % spare.length].id;
    }
    if (event.code === 'BracketLeft') proficiency = Math.max(0, proficiency - 0.25);
    if (event.code === 'BracketRight') proficiency = Math.min(1, proficiency + 0.25);
    if (event.code === 'KeyT') spawnTargets();
  });
  document.addEventListener('mousedown', event => {
    if (isPaused() || playerHealth <= 0 || document.pointerLockElement === null) return;
    if (event.button === 0) shotQueued = true; if (event.button === 2) aiming = true;
  });
  document.addEventListener('mouseup', event => { if (event.button === 2) aiming = false; });
  document.addEventListener('contextmenu', event => { if (document.pointerLockElement !== null) event.preventDefault(); });
  window.addEventListener('blur', () => { aiming = false; shotQueued = false; });
  function shoot(): void {
    if (reloadRemaining > 0 || cooldown > 0 || playerHealth <= 0) return;
    if (chamber === null) { message = 'Empty chamber. Press R.'; cooldown = 0.15; return; }
    const ammo = ammunition[chamber]; chamber = null; shotsConsumed++; feedChamber(); cooldown = 0.12;
    const recoilScale = (1.4 - proficiency * 0.7) * ammo.recoil;
    recoil = Math.min(recoil + 0.07 * recoilScale, 0.18);
    const eye = player.position.add(new Vector3(0, 0.75, 0));
    const forward = camera.getForwardRay().direction.normalize();
    const intended = scene.pickWithRay(new Ray(eye, forward, 500), mesh => mesh !== player && mesh !== playerHitbox &&
      (mesh.checkCollisions || targets.has(mesh as Mesh) || mesh === hostile));
    const aimPoint = intended?.hit && intended.pickedPoint ? intended.pickedPoint : eye.add(forward.scale(500));
    const right = new Vector3(forward.z, 0, -forward.x).normalize();
    const muzzle = eye.add(forward.scale(0.45)).add(right.scale(aiming ? 0.04 : 0.18))
      .add(new Vector3(0, aiming ? -0.08 : -0.18, 0));
    const direction = aimPoint.subtract(muzzle).normalize();
    const spread = (aiming ? 0.001 : 0.008) * (1.7 - proficiency);
    direction.x += (Math.random() - 0.5) * spread; direction.y += (Math.random() - 0.5) * spread;
    direction.z += (Math.random() - 0.5) * spread; direction.normalize();
    kick((aiming ? 0.014 : 0.025) * recoilScale);
    const offset = muzzle.subtract(eye); const length = offset.length();
    const obstruction = scene.pickWithRay(new Ray(eye, offset.scale(1 / length), length),
      mesh => mesh !== player && mesh !== playerHitbox && mesh.checkCollisions);
    if (obstruction?.hit) { message = 'Muzzle obstructed; round expended.'; return; }
    projectiles.push({ position: muzzle, velocity: direction.scale(ammo.speed), life: 3, damage: ammo.damage, owner: 'player' });
    message = `Fired ${ammo.label}.`;
  }
  function moveHostile(destination: Vector3, dt: number): boolean {
    const delta = destination.subtract(hostile.position); delta.y = 0;
    const distance = delta.length(); if (distance < 0.65) return true;
    const desired = delta.scale(1 / distance); const step = Math.min(2.2 * dt, distance);
    const origin = hostile.position.clone();
    // Local avoidance, not a navmesh or a guarantee of finding a route.
    const angles = [0, turnPreference * 0.65, -turnPreference * 0.65,
      turnPreference * 1.2, -turnPreference * 1.2, turnPreference * 1.7];
    let steering: Vector3 | null = null;
    for (const angle of angles) {
      const direction = new Vector3(desired.x * Math.cos(angle) + desired.z * Math.sin(angle), 0,
        desired.z * Math.cos(angle) - desired.x * Math.sin(angle));
      const right = new Vector3(direction.z, 0, -direction.x); let clear = true;
      for (const side of [-0.34, 0, 0.34]) {
        const start = origin.add(right.scale(side));
        const hit = scene.pickWithRay(new Ray(start, direction, 0.7 + step),
          mesh => mesh !== hostile && mesh !== player && mesh !== playerHitbox && mesh.checkCollisions);
        if (hit?.hit) { clear = false; break; }
      }
      if (clear) { steering = direction; break; }
    }
    const before = hostile.position.clone();
    if (steering) {
      hostile.rotation.y = Math.atan2(steering.x, steering.z);
      const movement = steering.scale(step); movement.y = -3 * dt;
      hostile.moveWithCollisions(movement);
    } else hostile.moveWithCollisions(new Vector3(0, -3 * dt, 0));
    const moved = new Vector3(hostile.position.x - before.x, 0, hostile.position.z - before.z).length();
    blockedTime = moved < step * 0.15 ? blockedTime + dt : 0;
    if (blockedTime > 1) { turnPreference *= -1; blockedTime = 0; }
    hostile.computeWorldMatrix(true); return false;
  }
  function updateHostile(dt: number): void {
    if (hostileHealth <= 0) return;
    hostileCooldown = Math.max(0, hostileCooldown - dt);
    const eye = hostile.position.add(new Vector3(0, 0.65, 0));
    const target = player.position.add(new Vector3(0, 0.4, 0));
    const offset = target.subtract(eye); const distance = offset.length(); if (distance < 0.001) return;
    const direction = offset.scale(1 / distance);
    const flat = new Vector3(direction.x, 0, direction.z).normalize();
    const facing = new Vector3(Math.sin(hostile.rotation.y), 0, Math.cos(hostile.rotation.y));
    const blocked = scene.pickWithRay(new Ray(eye, direction, distance),
      mesh => mesh !== player && mesh !== playerHitbox && mesh !== hostile && mesh.checkCollisions);
    const visible = distance <= 35 && Vector3.Dot(flat, facing) >= 0.5 && !blocked?.hit;
    if (!visible) {
      reaction = 0; memoryRemaining = Math.max(0, memoryRemaining - dt);
      if (lastSeen && memoryRemaining > 0) {
        const arrived = moveHostile(lastSeen, dt);
        hostileStatus = arrived ? 'Searching last seen position' : 'Investigating';
        if (arrived) hostile.rotation.y += dt * 0.8;
      } else { lastSeen = null; hostileStatus = 'Searching'; hostile.rotation.y += dt * 0.45; }
      return;
    }
    lastSeen = player.position.clone(); memoryRemaining = 8;
    hostile.rotation.y = Math.atan2(direction.x, direction.z); reaction += dt;
    if (reaction < 0.9) { hostileStatus = 'Reacting'; return; }
    const horizontalDistance = new Vector3(offset.x, 0, offset.z).length();
    if (horizontalDistance > 14) { hostileStatus = 'Approaching'; moveHostile(lastSeen, dt); return; }
    hostileStatus = 'Engaging'; if (hostileCooldown > 0) return;
    hostileCooldown = 0.75; const shotDirection = direction.clone();
    shotDirection.x += (Math.random() - 0.5) * 0.025; shotDirection.y += (Math.random() - 0.5) * 0.025;
    shotDirection.z += (Math.random() - 0.5) * 0.025; shotDirection.normalize();
    const muzzle = eye.add(shotDirection.scale(0.45));
    const muzzleBlocked = scene.pickWithRay(new Ray(eye, shotDirection, 0.45),
      mesh => mesh !== hostile && mesh !== player && mesh !== playerHitbox && mesh.checkCollisions);
    if (!muzzleBlocked?.hit) projectiles.push({ position: muzzle, velocity: shotDirection.scale(180), life: 2, damage: 20, owner: 'hostile' });
  }
  function update(dt: number): void {
    playerHitbox.position.copyFrom(player.position); playerHitbox.computeWorldMatrix(true);
    if (isPaused() || playerHealth <= 0) { aiming = false; shotQueued = false; }
    else {
      cooldown = Math.max(0, cooldown - dt); recoil = Math.max(0, recoil - dt * 0.35);
      if (reloadRemaining > 0) {
        reloadRemaining = Math.max(0, reloadRemaining - dt);
        if (reloadRemaining === 0) {
          const index = spare.findIndex(m => m.id === reloadTargetId);
          if (index >= 0) {
            const replacement = spare.splice(index, 1)[0]; spare.push(loaded); loaded = replacement;
            feedChamber(); selectedId = spare[0].id; message = 'Reload complete; ammunition preserved.';
          }
          reloadTargetId = null;
        }
      }
      if (shotQueued) shoot(); shotQueued = false; updateHostile(dt);
      for (let i = projectiles.length - 1; i >= 0; i--) {
        const projectile = projectiles[i]; projectile.velocity.y -= 9.81 * dt;
        const segment = projectile.velocity.scale(dt); const distance = segment.length(); if (distance <= 0) continue;
        const hit = scene.pickWithRay(new Ray(projectile.position, segment.scale(1 / distance), distance), mesh => {
          if (mesh === player) return false;
          if (mesh === playerHitbox) return projectile.owner === 'hostile';
          if (mesh === hostile) return projectile.owner === 'player' && hostileHealth > 0;
          return mesh.checkCollisions || targets.has(mesh as Mesh);
        });
        projectile.life -= dt;
        if (hit?.hit) {
          const target = hit.pickedMesh as Mesh;
          if (target === playerHitbox) {
            playerHealth = Math.max(0, playerHealth - projectile.damage);
            message = playerHealth === 0 ? 'You died. Y: development reset.' : 'Hostile hit you.';
          } else if (target === hostile) {
            hostileHealth = Math.max(0, hostileHealth - projectile.damage); message = `Hostile health: ${hostileHealth}`;
            if (hostileHealth === 0) { hostile.setEnabled(false); hostileStatus = 'Dead'; message = 'Hostile defeated.'; }
          } else {
            const health = targets.get(target);
            if (health !== undefined) {
              const remaining = health - projectile.damage; message = `Target hit: ${Math.max(0, remaining)} health.`;
              if (remaining <= 0) { targets.delete(target); target.dispose(); message = 'Target destroyed.'; }
              else targets.set(target, remaining);
            } else if (projectile.owner === 'player') message = 'Shot struck terrain or cover.';
          }
          projectiles.splice(i, 1);
          if (playerHealth <= 0) { projectiles.length = 0; aiming = false; break; }
        } else if (projectile.life <= 0) projectiles.splice(i, 1);
        else projectile.position.addInPlace(segment);
      }
    }
    camera.fov = aiming ? 0.7 : 1.05;
    weapon.position.set(aiming ? 0 : 0.23, aiming ? -0.13 : -0.2, 0.65 - recoil);
    const total = loaded.rounds + spare.reduce((sum, m) => sum + m.rounds, 0) + (chamber === null ? 0 : 1);
    panel.textContent = [
      `Player: ${playerHealth}/100 ${playerHealth === 0 ? 'DEAD' : ''}`,
      `Hostile: ${hostileHealth}/150 · ${hostileStatus}`,
      `Chamber: ${chamber === null ? 'empty' : ammunition[chamber].label}`,
      `Loaded #${loaded.id}: ${loaded.rounds}/${loaded.capacity} ${ammunition[loaded.ammo].label}`,
      `Spare: ${spare.map(m => `${m.id === selectedId ? '>' : ''}#${m.id} ${m.rounds} ${ammunition[m.ammo].label}`).join(' | ')}`,
      `Proficiency: ${Math.round(proficiency * 100)}% (test control)`,
      `Remaining: ${total} | Expended: ${shotsConsumed} | Audit: ${total + shotsConsumed === initialTotal ? 'OK' : 'ERROR'}`,
      reloadRemaining > 0 && playerHealth > 0 ? `Reload: ${reloadRemaining.toFixed(1)}s` : message,
      'LMB: fire · RMB: aim · R: reload · B: select spare',
      '[ / ]: proficiency · T: targets · Y: development encounter reset',
    ].join('\n');
  }
  return { update, isDead: () => playerHealth <= 0, reset };
}
