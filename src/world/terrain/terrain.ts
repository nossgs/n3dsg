import { Mesh, Scene, VertexData } from '@babylonjs/core';
import { createGroundMaterial } from '../../graphics/groundMaterial';
export const WORLD_BOUNDARY = 189;
const SIZE = 384, CELLS = 128, STEP = SIZE / CELLS;
function elevation(x: number, z: number): number {
  const t = Math.max(0, Math.min(1, (Math.hypot(x, z - 6) - 15) / 32));
  const base = Math.sin(x / 29) * 3 + Math.cos(z / 37) * 3 + Math.sin((x + z) / 13) * 0.6;
  const ridge = 7 * Math.exp(-(((x - 40) / 18) ** 2 + ((z - 20) / 42) ** 2));
  const hollow = -3 * Math.exp(-(((x + 28) / 17) ** 2 + ((z - 25) / 22) ** 2));
  const hummocks = Math.sin(x / 6.5) * Math.cos(z / 8) * 0.55;
  return (base + ridge + hollow + hummocks) * t * t * (3 - 2 * t);
}
export function groundHeight(x: number, z: number): number {
  const gx = Math.max(0, Math.min(CELLS - 0.00001, (x + SIZE / 2) / STEP));
  const gz = Math.max(0, Math.min(CELLS - 0.00001, (z + SIZE / 2) / STEP));
  const col = Math.floor(gx), row = Math.floor(gz), u = gx - col, v = gz - row;
  const px = col * STEP - SIZE / 2, pz = row * STEP - SIZE / 2;
  const a = elevation(px, pz), b = elevation(px + STEP, pz), c = elevation(px, pz + STEP), d = elevation(px + STEP, pz + STEP);
  return u + v <= 1 ? a + u * (b - a) + v * (c - a) : d + (1 - v) * (b - d) + (1 - u) * (c - d);
}
export function buildTerrain(scene: Scene): void {
  const positions: number[] = [], indices: number[] = [], uvs: number[] = [];
  for (let row = 0; row <= CELLS; row++) for (let col = 0; col <= CELLS; col++) {
    const x = col * STEP - SIZE / 2, z = row * STEP - SIZE / 2;
    positions.push(x, elevation(x, z), z); uvs.push(x / 3, z / 3);
    if (row < CELLS && col < CELLS) {
      const a = row * (CELLS + 1) + col, b = a + 1, c = a + CELLS + 1, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const normals: number[] = []; VertexData.ComputeNormals(positions, indices, normals);
  const data = new VertexData(); data.positions = positions; data.indices = indices; data.normals = normals; data.uvs = uvs;
  const ground = new Mesh('local-terrain', scene); data.applyToMesh(ground);
  ground.material = createGroundMaterial(scene); ground.receiveShadows = true;
}
