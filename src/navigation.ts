import { Scene, Mesh, Vector3 } from '@babylonjs/core';
type Box = { minX: number; maxX: number; minZ: number; maxZ: number };
export function createNavigation(scene: Scene, actor: Mesh) {
  const low = -39; const size = 79; const clearance = 0.48;
  let boxes: Box[] = []; let route: Vector3[] = []; let goal: Vector3 | null = null;
  let repath = 0; let stuck = 0; let previous = actor.position.clone();
  let status = 'Idle'; let replans = 0;
  function snapshot(): void {
    boxes = [];
    for (const mesh of scene.meshes) {
      if (!mesh.checkCollisions || mesh === actor || !mesh.isEnabled()) continue;
      mesh.computeWorldMatrix(true);
      const box = mesh.getBoundingInfo().boundingBox;
      if (box.maximumWorld.y <= 0.1 || box.minimumWorld.y >= 1.8) continue;
      boxes.push({ minX: box.minimumWorld.x - clearance, maxX: box.maximumWorld.x + clearance,
        minZ: box.minimumWorld.z - clearance, maxZ: box.maximumWorld.z + clearance });
    }
  }
  function free(x: number, z: number): boolean {
    return x >= low && z >= low && x <= 39 && z <= 39 &&
      !boxes.some(b => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ);
  }
  function clear(a: Vector3, b: Vector3): boolean {
    const dx = b.x - a.x; const dz = b.z - a.z;
    const count = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.18));
    for (let i = 0; i <= count; i++) if (!free(a.x + dx * i / count, a.z + dz * i / count)) return false;
    return true;
  }
  function point(id: number): Vector3 { return new Vector3(low + id % size, actor.position.y, low + Math.floor(id / size)); }
  function nearest(position: Vector3): number {
    const x = Math.max(0, Math.min(size - 1, Math.round(position.x - low)));
    const z = Math.max(0, Math.min(size - 1, Math.round(position.z - low)));
    for (let radius = 0; radius < 7; radius++) {
      let best = -1; let bestDistance = Infinity;
      for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) {
        const xx = x + dx; const zz = z + dz;
        if (xx < 0 || zz < 0 || xx >= size || zz >= size || !free(low + xx, low + zz)) continue;
        const distance = Math.hypot(low + xx - position.x, low + zz - position.z);
        if (distance < bestDistance) { best = zz * size + xx; bestDistance = distance; }
      }
      if (best >= 0) return best;
    }
    return -1;
  }
  function plan(destination: Vector3): void {
    snapshot(); replans++; route = []; goal = destination.clone(); repath = 1;
    const start = nearest(actor.position); const end = nearest(destination);
    if (start < 0 || end < 0 || !clear(actor.position, point(start))) { status = 'No route'; return; }
    const count = size * size; const g = new Float64Array(count); g.fill(Infinity);
    const parent = new Int32Array(count); parent.fill(-1);
    const closed = new Uint8Array(count); const queued = new Uint8Array(count);
    const open = [start]; queued[start] = 1; g[start] = 0;
    const endX = end % size; const endZ = Math.floor(end / size);
    const heuristic = (id: number) => Math.hypot(id % size - endX, Math.floor(id / size) - endZ);
    let found = false;
    while (open.length) {
      let best = 0;
      for (let i = 1; i < open.length; i++) if (g[open[i]] + heuristic(open[i]) < g[open[best]] + heuristic(open[best])) best = i;
      const current = open.splice(best, 1)[0]; queued[current] = 0;
      if (current === end) { found = true; break; }
      closed[current] = 1; const x = current % size; const z = Math.floor(current / size);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dz === 0) continue;
        const xx = x + dx; const zz = z + dz;
        if (xx < 0 || zz < 0 || xx >= size || zz >= size) continue;
        const next = zz * size + xx;
        if (closed[next] || !free(low + xx, low + zz)) continue;
        if (dx && dz && (!free(low + x + dx, low + z) || !free(low + x, low + z + dz))) continue;
        if (!clear(point(current), point(next))) continue;
        const cost = g[current] + Math.hypot(dx, dz);
        if (cost >= g[next]) continue;
        g[next] = cost; parent[next] = current;
        if (!queued[next]) { open.push(next); queued[next] = 1; }
      }
    }
    if (!found) { status = 'No route'; return; }
    for (let id = end; id !== -1; id = parent[id]) { route.push(point(id)); if (id === start) break; }
    route.reverse();
    if (free(destination.x, destination.z) && clear(point(end), destination)) route.push(destination.clone());
    status = 'Following route';
  }
  function face(direction: Vector3, dt: number): void {
    if (Math.hypot(direction.x, direction.z) < 0.001) return;
    const wanted = Math.atan2(direction.x, direction.z);
    const delta = Math.atan2(Math.sin(wanted - actor.rotation.y), Math.cos(wanted - actor.rotation.y));
    actor.rotation.y += Math.max(-4 * dt, Math.min(4 * dt, delta));
  }
  function move(destination: Vector3, dt: number): boolean {
    const distance = Math.hypot(destination.x - actor.position.x, destination.z - actor.position.z);
    if (distance < 0.65) { route = []; status = 'Arrived'; previous.copyFrom(actor.position); stuck = 0; return true; }
    repath = Math.max(0, repath - dt);
    const progress = Math.hypot(actor.position.x - previous.x, actor.position.z - previous.z);
    previous.copyFrom(actor.position);
    stuck = progress < 0.005 ? stuck + dt : 0;
    if (!goal || (repath === 0 && (!route.length || Vector3.DistanceSquared(goal, destination) > 2.25)) || stuck > 0.8) {
      plan(destination); stuck = 0;
    }
    while (route.length && Math.hypot(route[0].x - actor.position.x, route[0].z - actor.position.z) < 0.3) route.shift();
    for (let i = route.length - 1; i > 0; i--) if (clear(actor.position, route[i])) { route.splice(0, i); break; }
    if (!route.length) { status = 'No route'; return false; }
    const waypoint = route[0]; const delta = waypoint.subtract(actor.position); delta.y = 0;
    const length = delta.length();
    if (!clear(actor.position, waypoint)) { route = []; repath = 0; status = 'Replanning'; return false; }
    const direction = delta.scale(1 / Math.max(length, 0.001)); face(direction, dt);
    const movement = direction.scale(Math.min(2.2 * dt, length)); movement.y = -3 * dt;
    actor.moveWithCollisions(movement); actor.computeWorldMatrix(true); status = 'Following route'; return false;
  }
  function reset(): void { route = []; goal = null; repath = 0; stuck = 0; previous.copyFrom(actor.position); status = 'Idle'; replans = 0; }
  return { move, face, reset, info: () => `${status} · ${route.length} waypoints · ${replans} plans` };
}
