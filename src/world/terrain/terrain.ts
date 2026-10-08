import { Mesh, Scene, VertexData } from '@babylonjs/core';
import { createForestMaterial } from '../../graphics/forestMaterials';

export const WORLD_BOUNDARY = 189;

const SIZE = 384;
const CELLS = 96;
const STEP = 4;

function elevation(x: number, z: number): number {
  const t = Math.max(
    0,
    Math.min(1, (Math.hypot(x, z - 6) - 15) / 32)
  );

  return (
    Math.sin(x / 29) * 3 +
    Math.cos(z / 37) * 3 +
    Math.sin((x + z) / 13) * 0.6
  ) * t * t * (3 - 2 * t);
}

export function groundHeight(x: number, z: number): number {
  const gx = Math.max(
    0,
    Math.min(CELLS - 0.00001, (x + SIZE / 2) / STEP)
  );

  const gz = Math.max(
    0,
    Math.min(CELLS - 0.00001, (z + SIZE / 2) / STEP)
  );

  const col = Math.floor(gx);
  const row = Math.floor(gz);
  const u = gx - col;
  const v = gz - row;

  const px = col * STEP - SIZE / 2;
  const pz = row * STEP - SIZE / 2;

  const a = elevation(px, pz);
  const b = elevation(px + STEP, pz);
  const c = elevation(px, pz + STEP);
  const d = elevation(px + STEP, pz + STEP);

  return u + v <= 1
    ? a + u * (b - a) + v * (c - a)
    : d + (1 - v) * (b - d) + (1 - u) * (c - d);
}

export function buildTerrain(scene: Scene): void {
  const positions: number[] = [];
  const indices: number[] = [];
  const uvs: number[] = [];

  for (let row = 0; row <= CELLS; row++) {
    for (let col = 0; col <= CELLS; col++) {
      const x = col * STEP - SIZE / 2;
      const z = row * STEP - SIZE / 2;

      positions.push(x, elevation(x, z), z);
      uvs.push(x / 3, z / 3);

      if (row < CELLS && col < CELLS) {
        const a = row * (CELLS + 1) + col;
        const b = a + 1;
        const c = a + CELLS + 1;
        const d = c + 1;

        indices.push(a, c, b, b, c, d);
      }
    }
  }

  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);

  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.normals = normals;
  data.uvs = uvs;

  const ground = new Mesh('local-terrain', scene);
  data.applyToMesh(ground);

  ground.material = createForestMaterial(scene, 'soil');
  ground.receiveShadows = true;
}