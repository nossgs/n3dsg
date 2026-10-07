import { Scene, UniversalCamera, Mesh, MeshBuilder, StandardMaterial, Color3, Vector3, Ray } from '@babylonjs/core';
import { createNavigation } from './navigation';
type AmmoId = 'standard' | 'heavy';
type Magazine = { id: number; rounds: number; capacity: number; ammo: AmmoId };
type Projectile = { position: Vector3; velocity: Vector3; life: number; damage: number; owner: 'player' | 'hostile' };
type Effect = { mesh: Mesh; remaining: number; duration: number };
const ammunition = {
  standard: { label: 'Standard', speed: 700, damage: 50, recoil: 1 },
  heavy: { label: 'Heavy', speed: 600, damage: 70, recoil: 1.3 },
} satisfies Record<AmmoId, { label: string; speed: number; damage: number; recoil: number }>;
export function createCombat(scene: Scene, camera: UniversalCamera, player: Mesh,
  isPaused: () => boolean, kick: (amount: number) => void
): { update: (dt: number) => void; isDead: () => boolean; reset: () => void } {
  const panel = document.createElement('div');
  Object.assign(panel.style, { position: 'absolute', bottom: '20px', right: '20px', padding: '12px 16px',
    background: '#111c', color: '#eee', font: '13px system-ui', pointerEvents: 'none', whiteSpace: 'pre-line' });
  document.body.append(panel);
  const damageIndicator = document.createElement('div'); damageIndicator.textContent = '▲';
  Object.assign(damageIndicator.style, { position: 'absolute', left: '50%', top: '50%', width: '160px', height: '160px',
    marginLeft: '-80px', marginTop: '-80px', textAlign: 'center', color: '#ff493b', font: '28px system-ui',
    pointerEvents: 'none', opacity: '0', zIndex: '2' });
  document.body.append(damageIndicator);
  function material(name: string, color: Color3, emissive = false): StandardMaterial {
    const result = new StandardMaterial(name, scene); result.diffuseColor = color;
    if (emissive) { result.emissiveColor = color; result.disableLighting = true; } return result;
  }
  const weaponMaterial = material('weaponMaterial', new Color3(0.12, 0.14, 0.16));
  const weapon = MeshBuilder.CreateBox('weaponPlaceholder', { width: 0.10, height: 0.12, depth: 0.55 }, scene);
  weapon.parent = camera; weapon.material = weaponMaterial; weapon.isPickable = false;
  const flashMaterial = material('combatFlash', new Color3(1, 0.75, 0.15), true);
  const impactMaterial = material('combatImpact', new Color3(1, 0.65, 0.25), true);
  const hitMaterial = material('combatHit', new Color3(1, 0.25, 0.1), true);
  const corpseMaterial = material('hostileDefeated', new Color3(0.25, 0.2, 0.17));
  const firstPersonFlash = MeshBuilder.CreateSphere('weaponFlash', { diameter: 0.14, segments: 6 }, scene);
  firstPersonFlash.parent = weapon; firstPersonFlash.position.z = 0.32; firstPersonFlash.material = flashMaterial;
  firstPersonFlash.isPickable = false; firstPersonFlash.setEnabled(false);
  const effects: Effect[] = []; let flashRemaining = 0; let damageRemaining = 0;
  let damageSource: Vector3 | null = null; let hostileHitRemaining = 0;
  function effect(position: Vector3, diameter: number, duration: number, mat: StandardMaterial): void {
    const mesh = MeshBuilder.CreateSphere('combatEffect', { diameter, segments: 6 }, scene);
    mesh.position.copyFrom(position); mesh.material = mat; mesh.isPickable = false; effects.push({ mesh, remaining: duration, duration });
  }
  function updateFeedback(dt: number): void {
    flashRemaining = Math.max(0, flashRemaining - dt); firstPersonFlash.setEnabled(flashRemaining > 0);
    damageRemaining = Math.max(0, damageRemaining - dt); damageIndicator.style.opacity = String(Math.min(1, damageRemaining / 0.25));
    if (damageSource && damageRemaining > 0) {
      const offset = damageSource.subtract(player.position); offset.y = 0;
      const forward = camera.getForwardRay().direction;
      damageIndicator.style.transform = `rotate(${Math.atan2(offset.x, offset.z) - Math.atan2(forward.x, forward.z)}rad)`;
    }
    hostileHitRemaining = Math.max(0, hostileHitRemaining - dt);
    hostileMaterial.emissiveColor = hostileHitRemaining > 0 ? new Color3(0.65, 0.2, 0.05) : Color3.Black();
    for (let i = effects.length - 1; i >= 0; i--) {
      const item = effects[i]; item.remaining -= dt;
      if (item.remaining <= 0) { item.mesh.dispose(); effects.splice(i, 1); } else item.mesh.visibility = item.remaining / item.duration;
    }
  }
  const targetMaterial = material('targetMaterial', new Color3(0.7, 0.23, 0.16)); const targets = new Map<Mesh, number>();
  function spawnTargets(): void {
    for (const target of targets.keys()) target.dispose(); targets.clear();
    for (const [index, x, z] of [[0, -8, 7], [1, 8, 10], [2, 0, 20]]) {
      const target = MeshBuilder.CreateBox(`target${index}`, { width: 0.8, height: 1.6, depth: 0.25 }, scene);
      target.position.set(x, 0.8, z); target.material = targetMaterial; targets.set(target, 120);
    }
  }
  spawnTargets();
  const hostileMaterial = material('hostileMaterial', new Color3(0.85, 0.32, 0.08));
  const hostile = MeshBuilder.CreateCapsule('hostile', { height: 1.8, radius: 0.35 }, scene);
  hostile.material = hostileMaterial; hostile.position.set(8, 0.92, 15); hostile.rotation.y = Math.PI;
  hostile.ellipsoid = new Vector3(0.35, 0.9, 0.35); hostile.ellipsoidOffset = Vector3.Zero();
  const navigation = createNavigation(scene, hostile);
  const hostileMarker = MeshBuilder.CreateBox('hostileFacing', { width: 0.18, height: 0.15, depth: 0.2 }, scene);
  hostileMarker.parent = hostile; hostileMarker.position.set(0, 0.55, 0.35); hostileMarker.material = weaponMaterial; hostileMarker.isPickable = false;
  const playerHitbox = MeshBuilder.CreateCapsule('playerCombatHitbox', { height: 1.8, radius: 0.35 }, scene);
  playerHitbox.visibility = 0; playerHitbox.isPickable = true; playerHitbox.position.copyFrom(player.position);
  let playerHealth = 100; let hostileHealth = 150; let reaction = 0; let hostileCooldown = 0; let hostileStatus = 'Searching';
  let lastSeen: Vector3 | null = null; let memoryRemaining = 0;
  let loaded: Magazine = { id: 1, rounds: 29, capacity: 30, ammo: 'standard' }; let chamber: AmmoId | null = 'standard';
  const spare: Magazine[] = [{ id: 2, rounds: 30, capacity: 30, ammo: 'standard' }, { id: 3, rounds: 30, capacity: 30, ammo: 'heavy' }];
  let selectedId = 2; let proficiency = 0.5; let aiming = false; let reloadRemaining = 0; let reloadTargetId: number | null = null;
  let cooldown = 0; let recoil = 0; let shotQueued = false; let shotsConsumed = 0;
  let message = 'Navigation build. Orange capsule: hostile. Ammo values are fictional.';
  const initialTotal = 90; const projectiles: Projectile[] = [];
  function reset(): void {
    playerHealth = 100; hostileHealth = 150; reaction = 0; hostileCooldown = 0; hostileStatus = 'Searching'; lastSeen = null; memoryRemaining = 0;
    hostile.setEnabled(true); hostile.isPickable = true; hostile.rotation.set(0, Math.PI, 0);
    hostile.position.set(8, 0.92, 15); hostile.material = hostileMaterial; hostileMarker.setEnabled(true); hostile.computeWorldMatrix(true);
    navigation.reset(); projectiles.length = 0; shotQueued = false; aiming = false; reloadRemaining = 0; reloadTargetId = null; cooldown = 0; recoil = 0;
    for (const item of effects) item.mesh.dispose(); effects.length = 0;
    flashRemaining = 0; damageRemaining = 0; damageSource = null; hostileHitRemaining = 0;
    firstPersonFlash.setEnabled(false); damageIndicator.style.opacity = '0'; hostileMaterial.emissiveColor = Color3.Black();
    message = 'Development reset. Ammunition unchanged.';
  }
  function feedChamber(): void { if (chamber === null && loaded.rounds > 0) { loaded.rounds--; chamber = loaded.ammo; } }
  function reload(): void {
    if (reloadRemaining > 0) return; const replacement = spare.find(m => m.id === selectedId);
    if (!replacement || replacement.rounds === 0) { message = 'Selected magazine is empty.'; return; }
    reloadTargetId = replacement.id; reloadRemaining = chamber === null ? 2.8 : 2.2; message = chamber === null ? 'Empty reload…' : 'Magazine swap…';
  }
  window.addEventListener('keydown', event => {
    if (isPaused() || playerHealth <= 0 || event.repeat) return;
    if (event.code === 'KeyR') reload();
    if (event.code === 'KeyB' && reloadRemaining === 0) { const index = spare.findIndex(m => m.id === selectedId); selectedId = spare[(index + 1) % spare.length].id; }
    if (event.code === 'BracketLeft') proficiency = Math.max(0, proficiency - 0.25);
    if (event.code === 'BracketRight') proficiency = Math.min(1, proficiency + 0.25); if (event.code === 'KeyT') spawnTargets();
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
    const ammo = ammunition[chamber]; chamber = null; shotsConsumed++; feedChamber(); cooldown = 0.12; flashRemaining = 0.065;
    const recoilScale = (1.4 - proficiency * 0.7) * ammo.recoil; recoil = Math.min(recoil + 0.07 * recoilScale, 0.18);
    const eye = player.position.add(new Vector3(0, 0.75, 0)); const forward = camera.getForwardRay().direction.normalize();
    const intended = scene.pickWithRay(new Ray(eye, forward, 500), mesh => mesh !== player && mesh !== playerHitbox &&
      (mesh.checkCollisions || targets.has(mesh as Mesh) || (mesh === hostile && hostileHealth > 0)));
    const aimPoint = intended?.hit && intended.pickedPoint ? intended.pickedPoint : eye.add(forward.scale(500));
    const right = new Vector3(forward.z, 0, -forward.x).normalize();
    const muzzle = eye.add(forward.scale(0.45)).add(right.scale(aiming ? 0.04 : 0.18)).add(new Vector3(0, aiming ? -0.08 : -0.18, 0));
    const direction = aimPoint.subtract(muzzle).normalize(); const spread = (aiming ? 0.001 : 0.008) * (1.7 - proficiency);
    direction.x += (Math.random() - 0.5) * spread; direction.y += (Math.random() - 0.5) * spread; direction.z += (Math.random() - 0.5) * spread;
    direction.normalize(); kick((aiming ? 0.014 : 0.025) * recoilScale);
    const offset = muzzle.subtract(eye); const length = offset.length();
    const obstruction = scene.pickWithRay(new Ray(eye, offset.scale(1 / length), length), mesh => mesh !== player && mesh !== playerHitbox && mesh.checkCollisions);
    if (obstruction?.hit) { if (obstruction.pickedPoint) effect(obstruction.pickedPoint, 0.10, 0.18, impactMaterial); message = 'Muzzle obstructed; round expended.'; return; }
    projectiles.push({ position: muzzle, velocity: direction.scale(ammo.speed), life: 3, damage: ammo.damage, owner: 'player' }); message = `Fired ${ammo.label}.`;
  }
  function updateHostile(dt: number): void {
    if (hostileHealth <= 0) return; hostileCooldown = Math.max(0, hostileCooldown - dt);
    const eye = hostile.position.add(new Vector3(0, 0.65, 0)); const target = player.position.add(new Vector3(0, 0.4, 0));
    const offset = target.subtract(eye); const distance = offset.length(); if (distance < 0.001) return;
    const direction = offset.scale(1 / distance); const flat = new Vector3(direction.x, 0, direction.z).normalize();
    const facing = new Vector3(Math.sin(hostile.rotation.y), 0, Math.cos(hostile.rotation.y));
    const blocked = scene.pickWithRay(new Ray(eye, direction, distance), mesh => mesh !== player && mesh !== playerHitbox && mesh !== hostile && mesh.checkCollisions);
    const visible = distance <= 35 && Vector3.Dot(flat, facing) >= 0.5 && !blocked?.hit;
    if (!visible) {
      reaction = 0; memoryRemaining = Math.max(0, memoryRemaining - dt);
      if (lastSeen && memoryRemaining > 0) {
        const arrived = navigation.move(lastSeen, dt); hostileStatus = arrived ? 'Searching last seen position' : 'Investigating';
        if (arrived) hostile.rotation.y += dt * 0.8;
      } else { lastSeen = null; hostileStatus = 'Searching'; hostile.rotation.y += dt * 0.45; }
      return;
    }
    lastSeen = player.position.clone(); memoryRemaining = 8; reaction += dt;
    if (reaction < 0.9) { navigation.face(direction, dt); hostileStatus = 'Reacting'; return; }
    if (new Vector3(offset.x, 0, offset.z).length() > 14) { hostileStatus = 'Approaching'; navigation.move(lastSeen, dt); return; }
    navigation.face(direction, dt); hostileStatus = 'Engaging'; if (hostileCooldown > 0) return;
    hostileCooldown = 0.75; const shotDirection = direction.clone();
    shotDirection.x += (Math.random() - 0.5) * 0.025; shotDirection.y += (Math.random() - 0.5) * 0.025;
    shotDirection.z += (Math.random() - 0.5) * 0.025; shotDirection.normalize();
    const muzzle = eye.add(shotDirection.scale(0.45));
    const muzzleBlocked = scene.pickWithRay(new Ray(eye, shotDirection, 0.45), mesh => mesh !== hostile && mesh !== player && mesh !== playerHitbox && mesh.checkCollisions);
    if (!muzzleBlocked?.hit) { effect(muzzle, 0.18, 0.09, flashMaterial); projectiles.push({ position: muzzle, velocity: shotDirection.scale(180), life: 2, damage: 20, owner: 'hostile' }); }
  }
  function update(dt: number): void {
    playerHitbox.position.copyFrom(player.position); playerHitbox.computeWorldMatrix(true);
    if (isPaused() || playerHealth <= 0) { aiming = false; shotQueued = false; }
    else {
      cooldown = Math.max(0, cooldown - dt); recoil = Math.max(0, recoil - dt * 0.35); updateFeedback(dt);
      if (reloadRemaining > 0) {
        reloadRemaining = Math.max(0, reloadRemaining - dt);
        if (reloadRemaining === 0) {
          const index = spare.findIndex(m => m.id === reloadTargetId);
          if (index >= 0) { const replacement = spare.splice(index, 1)[0]; spare.push(loaded); loaded = replacement; feedChamber(); selectedId = spare[0].id; message = 'Reload complete; ammunition preserved.'; }
          reloadTargetId = null;
        }
      }
      if (shotQueued) shoot(); shotQueued = false; updateHostile(dt);
      for (let i = projectiles.length - 1; i >= 0; i--) {
        const projectile = projectiles[i]; projectile.velocity.y -= 9.81 * dt;
        const segment = projectile.velocity.scale(dt); const distance = segment.length(); if (distance <= 0) continue;
        const hit = scene.pickWithRay(new Ray(projectile.position, segment.scale(1 / distance), distance), mesh => {
          if (mesh === player) return false; if (mesh === playerHitbox) return projectile.owner === 'hostile';
          if (mesh === hostile) return projectile.owner === 'player' && hostileHealth > 0; return mesh.checkCollisions || targets.has(mesh as Mesh);
        });
        projectile.life -= dt;
        if (hit?.hit) {
          const target = hit.pickedMesh as Mesh;
          if (hit.pickedPoint) effect(hit.pickedPoint, target === hostile || target === playerHitbox ? 0.13 : 0.10, 0.22,
            target === hostile || target === playerHitbox ? hitMaterial : impactMaterial);
          if (target === playerHitbox) {
            damageRemaining = 0.8; damageSource = projectile.position.subtract(projectile.velocity.normalizeToNew().scale(10));
            damageIndicator.style.opacity = '1'; playerHealth = Math.max(0, playerHealth - projectile.damage);
            message = playerHealth === 0 ? 'You died. Y: development reset.' : 'Hostile hit you.';
          } else if (target === hostile) {
            hostileHitRemaining = 0.16; hostileHealth = Math.max(0, hostileHealth - projectile.damage); message = `Hostile health: ${hostileHealth}`;
            if (hostileHealth === 0) { hostileStatus = 'Dead'; hostile.isPickable = false; hostile.material = corpseMaterial;
              hostile.rotation.z = Math.PI / 2; hostile.position.y = 0.36; hostileMarker.setEnabled(false); hostile.computeWorldMatrix(true); message = 'Hostile defeated.'; }
          } else {
            const health = targets.get(target);
            if (health !== undefined) { const remaining = health - projectile.damage; message = `Target hit: ${Math.max(0, remaining)} health.`;
              if (remaining <= 0) { targets.delete(target); target.dispose(); message = 'Target destroyed.'; } else targets.set(target, remaining);
            } else if (projectile.owner === 'player') message = 'Shot struck terrain or cover.';
          }
          projectiles.splice(i, 1); if (playerHealth <= 0) { projectiles.length = 0; aiming = false; break; }
        } else if (projectile.life <= 0) projectiles.splice(i, 1); else projectile.position.addInPlace(segment);
      }
      firstPersonFlash.setEnabled(flashRemaining > 0);
    }
    camera.fov = aiming ? 0.7 : 1.05; weapon.position.set(aiming ? 0 : 0.23, aiming ? -0.13 : -0.2, 0.65 - recoil);
    const total = loaded.rounds + spare.reduce((sum, m) => sum + m.rounds, 0) + (chamber === null ? 0 : 1);
    panel.textContent = ['Build: NPC navigation', `Player: ${playerHealth}/100 ${playerHealth === 0 ? 'DEAD' : ''}`,
      `Hostile: ${hostileHealth}/150 · ${hostileStatus}`, `Navigation: ${navigation.info()}`,
      `Chamber: ${chamber === null ? 'empty' : ammunition[chamber].label}`,
      `Loaded #${loaded.id}: ${loaded.rounds}/${loaded.capacity} ${ammunition[loaded.ammo].label}`,
      `Spare: ${spare.map(m => `${m.id === selectedId ? '>' : ''}#${m.id} ${m.rounds} ${ammunition[m.ammo].label}`).join(' | ')}`,
      `Proficiency: ${Math.round(proficiency * 100)}% (test control)`,
      `Remaining: ${total} | Expended: ${shotsConsumed} | Audit: ${total + shotsConsumed === initialTotal ? 'OK' : 'ERROR'}`,
      reloadRemaining > 0 && playerHealth > 0 ? `Reload: ${reloadRemaining.toFixed(1)}s` : message,
      'LMB: fire · RMB: aim · R: reload · B: select spare', '[ / ]: proficiency · T: targets · Y: development encounter reset'].join('\n');
  }
  return { update, isDead: () => playerHealth <= 0, reset };
}
