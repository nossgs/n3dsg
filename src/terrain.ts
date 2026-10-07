import { Color3, Mesh, MeshBuilder, Scene, StandardMaterial, VertexData } from '@babylonjs/core';

export const WORLD_SEED = 18427;
const WORLD_SIZE = 2048;
const SEGMENTS = 256;
const SEA_LEVEL = -2;

function smooth(t: number): number { return t * t * (3 - 2 * t); }
function hash(x: number, z: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ WORLD_SEED;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function noise(x: number, z: number): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = smooth(x - ix), fz = smooth(z - iz);
  const a = hash(ix, iz), b = hash(ix + 1, iz);
  const c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz;
}
export function terrainHeight(x: number, z: number): number {
  const coast = 460 + (noise(z / 450, 12) - 0.5) * 200;
  const inland = coast - x;
  let height: number;
  if (inland < 0) {
    height = SEA_LEVEL - 0.4 - Math.min(60, -inland * 0.1);
  } else {
    const rise = smooth(Math.min(1, inland / 180));
    const hills = 8 + noise(x / 600, z / 600) * 55 + noise(x / 180, z / 180) * 12;
    height = SEA_LEVEL - 0.4 + rise * hills;
  }
  // Temporary level starting clearing, keeping the existing player's spawn compatible.
  const radius = Math.hypot(x, z - 3);
  const blend = smooth(Math.max(0, Math.min(1, (radius - 30) / 140)));
  return height * blend;
}
export function createTerrain(scene: Scene): void {
  const positions: number[] = [], indices: number[] = [], colors: number[] = [];
  const stride = SEGMENTS + 1;
  for (let row = 0; row <= SEGMENTS; row++) {
    const z = -WORLD_SIZE / 2 + row * WORLD_SIZE / SEGMENTS;
    for (let col = 0; col <= SEGMENTS; col++) {
      const x = -WORLD_SIZE / 2 + col * WORLD_SIZE / SEGMENTS;
      const y = terrainHeight(x, z);
      positions.push(x, y, z);
      const variation = (noise(x / 40, z / 40) - 0.5) * 0.05;
      const color = y < SEA_LEVEL + 3
        ? new Color3(0.55, 0.49, 0.35)
        : new Color3(0.29 + variation, 0.36 + variation, 0.23 + variation);
      colors.push(color.r, color.g, color.b, 1);
      if (row < SEGMENTS && col < SEGMENTS) {
        const a = row * stride + col, b = a + 1, c = a + stride, d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
  }
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const data = new VertexData();
  data.positions = positions; data.indices = indices; data.normals = normals; data.colors = colors;
  const ground = new Mesh('terrain', scene);
  data.applyToMesh(ground);
  const material = new StandardMaterial('terrain-material', scene);
  material.diffuseColor = Color3.White(); material.specularColor = Color3.Black();
  ground.material = material; ground.checkCollisions = true; ground.receiveShadows = true;
  const water = MeshBuilder.CreateGround('ocean', { width: WORLD_SIZE, height: WORLD_SIZE }, scene);
  water.position.y = SEA_LEVEL;
  const waterMaterial = new StandardMaterial('ocean-material', scene);
  waterMaterial.diffuseColor = new Color3(0.12, 0.28, 0.34);
  waterMaterial.specularColor = new Color3(0.2, 0.25, 0.28);
  water.material = waterMaterial;
  water.isPickable = false;
}
