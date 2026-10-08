import { Color3, Mesh, MeshBuilder, Quaternion, Scene, ShadowGenerator, StandardMaterial, Vector3, VertexBuffer } from '@babylonjs/core';
import { createForestMaterial } from '../../graphics/forestMaterials';
import { seededRandom } from '../generation/random';
import { groundHeight } from '../terrain/terrain';
export function buildTrees(scene: Scene, shadows: ShadowGenerator): void {
  const random = seededRandom(27491), bark = createForestMaterial(scene, 'bark');
  const foliage = new StandardMaterial('tree-foliage', scene);
  foliage.diffuseColor = new Color3(0.13, 0.24, 0.12); foliage.specularColor = Color3.Black();
  const sources: { wood: Mesh; leaves: Mesh }[] = [];
  function branch(start: Vector3, end: Vector3, diameter: number): Mesh {
    const delta = end.subtract(start), length = delta.length();
    const mesh = MeshBuilder.CreateCylinder('branch', { height: length, diameterBottom: diameter, diameterTop: diameter * 0.35, tessellation: 7 }, scene);
    mesh.position.copyFrom(start.add(end).scale(0.5));
    const up = delta.normalize(), helper = Math.abs(Vector3.Dot(up, Vector3.Up())) > 0.95 ? Vector3.Right() : Vector3.Up();
    const right = Vector3.Cross(helper, up).normalize(), forward = Vector3.Cross(right, up).normalize();
    mesh.rotationQuaternion = Quaternion.RotationQuaternionFromAxis(right, up, forward); mesh.material = bark;
    const uv = mesh.getVerticesData(VertexBuffer.UVKind);
    if (uv) {
      for (let i = 0; i < uv.length; i += 2) { uv[i] *= Math.PI * diameter / 2; uv[i + 1] *= length / 2; }
      mesh.setVerticesData(VertexBuffer.UVKind, uv);
    }
    return mesh;
  }
  function merge(parts: Mesh[], name: string): Mesh {
    const mesh = Mesh.MergeMeshes(parts, true, true, undefined, false, false);
    if (!mesh) throw new Error(`Cannot merge ${name}`);
    mesh.name = name; mesh.isVisible = false; mesh.isPickable = false; return mesh;
  }
  for (let variant = 0; variant < 4; variant++) {
    const wood: Mesh[] = [], leaves: Mesh[] = [];
    const height = 18 + variant * 3, lean = (random() - 0.5) * 1.1;
    wood.push(branch(Vector3.Zero(), new Vector3(lean, height, 0), 0.8 + variant * 0.13));
    for (let level = 0; level < 6; level++) {
      const y = height * (0.3 + level * 0.105), spread = height * (0.19 - level * 0.02);
      for (let spoke = 0; spoke < 3; spoke++) {
        const angle = spoke * Math.PI * 2 / 3 + level * 1.4 + random() * 0.6;
        const start = new Vector3(lean * y / height, y, 0);
        const end = start.add(new Vector3(Math.cos(angle) * spread, y * 0.025, Math.sin(angle) * spread));
        wood.push(branch(start, end, 0.14 - level * 0.012));
        const cluster = MeshBuilder.CreateIcoSphere('foliage-cluster', { radius: 1, subdivisions: 2 }, scene);
        cluster.position.copyFrom(start.add(end).scale(0.6));
        cluster.scaling.set(spread * 0.65, 0.9 + random() * 0.8, spread * 0.5);
        cluster.rotation.y = angle; cluster.material = foliage; leaves.push(cluster);
      }
    }
    const top = MeshBuilder.CreateIcoSphere('tree-top', { radius: 1, subdivisions: 2 }, scene);
    top.position.set(lean, height * 0.92, 0); top.scaling.set(1.5, 2.2, 1.5); top.material = foliage; leaves.push(top);
    sources.push({ wood: merge(wood, `tree-wood-${variant}`), leaves: merge(leaves, `tree-leaves-${variant}`) });
  }
  for (let i = 0; i < 210; i++) {
    const x = (random() - 0.5) * 340, z = (random() - 0.5) * 340;
    if (Math.hypot(x, z - 6) < 21 || (Math.abs(x) < 4 && z < 2)) continue;
    const scale = 0.72 + random() * 0.48, rotation = random() * Math.PI * 2, source = sources[i % 4];
    for (const [label, mesh] of [['wood', source.wood], ['leaves', source.leaves]] as const) {
      const tree = mesh.createInstance(`tree-${i}-${label}`);
      tree.position.set(x, groundHeight(x, z), z); tree.scaling.setAll(scale); tree.rotation.y = rotation; tree.isPickable = false;
      if (Math.hypot(x, z) < 60) shadows.addShadowCaster(tree);
    }
    if (Math.hypot(x, z) < 60) {
      const collider = MeshBuilder.CreateBox('trunk-collider', { width: 0.7 * scale, depth: 0.7 * scale, height: 10 * scale }, scene);
      collider.position.set(x, groundHeight(x, z) + 5 * scale, z);
      collider.isVisible = false; collider.isPickable = false; collider.checkCollisions = true; collider.computeWorldMatrix(true);
    }
  }
}
