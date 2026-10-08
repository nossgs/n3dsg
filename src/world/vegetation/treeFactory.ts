import { AbstractMesh, AssetContainer, Mesh, MeshBuilder, Scene, SceneLoader, ShadowGenerator, TransformNode, Vector3 } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { seededRandom } from '../generation/random';
import { groundHeight } from '../terrain/terrain';
const base = (import.meta as ImportMeta & { env: { BASE_URL: string } }).env.BASE_URL;
const MAX_TREES = 120;
const VISIBLE_RADIUS = 150;
const SHADOW_RADIUS = 40;
type Tree = { root: TransformNode; meshes: AbstractMesh[]; x: number; z: number; casts: boolean };

export function buildTrees(scene: Scene, shadows: ShadowGenerator): void {
  const notice = document.createElement('div');
  notice.style.cssText = 'position:fixed;top:48px;left:12px;z-index:50;background:#182218dd;color:white;padding:8px;font:12px monospace;pointer-events:none';
  notice.textContent = 'Loading authored pine asset…'; document.body.appendChild(notice);
  void loadTrees(scene, shadows).then(() => notice.remove()).catch(error => {
    notice.textContent = `Tree import failed: ${String(error)}`; console.error(error);
  });
}
async function loadTrees(scene: Scene, shadows: ShadowGenerator): Promise<void> {
  const response = await fetch(`${base}assets/trees/manifest.json`);
  if (!response.ok) throw new Error(`Tree manifest HTTP ${response.status}. Run Import forest assets first.`);
  const manifest = await response.json() as { trees: { pine: { file: string } } };
  const file = manifest.trees.pine.file;
  const slash = file.lastIndexOf('/');
  const container = await SceneLoader.LoadAssetContainerAsync(`${base}assets/trees/${file.slice(0, slash + 1)}`, file.slice(slash + 1), scene);
  if (scene.isDisposed) { container.dispose(); return; }
  populate(scene, shadows, container);
}
function populate(scene: Scene, shadows: ShadowGenerator, container: AssetContainer): void {
  const min = new Vector3(Infinity, Infinity, Infinity), max = new Vector3(-Infinity, -Infinity, -Infinity);
  let vertices = 0, triangles = 0;
  for (const mesh of container.meshes) {
    if (!mesh.getTotalVertices()) continue;
    mesh.computeWorldMatrix(true);
    const bounds = mesh.getBoundingInfo().boundingBox;
    min.minimizeInPlace(bounds.minimumWorld); max.maximizeInPlace(bounds.maximumWorld);
    vertices += mesh.getTotalVertices(); triangles += mesh.getTotalIndices() / 3;
    mesh.isPickable = false;
  }
  const sourceHeight = max.y - min.y;
  if (!Number.isFinite(sourceHeight) || sourceHeight <= 0) throw new Error('Imported tree has invalid bounds.');
  console.info('Authored pine source', { sourceHeight, vertices, triangles, materials: container.materials.length });
  const random = seededRandom(27491), trees: Tree[] = [];
  let accepted = 0;
  for (let attempt = 0; attempt < 320 && accepted < MAX_TREES; attempt++) {
    // Deterministic density patches, with trail and shelter exclusions.
    const x = (random() - 0.5) * 340, z = (random() - 0.5) * 340;
    if (Math.hypot(x, z - 6) < 21 || (Math.abs(x) < 4 && z < 2)) continue;
    const density = 0.58 + 0.22 * Math.sin(x / 31) * Math.cos(z / 37);
    if (random() > density) continue;
    const slope = Math.hypot(groundHeight(x + 1, z) - groundHeight(x - 1, z), groundHeight(x, z + 1) - groundHeight(x, z - 1)) / 2;
    if (slope > 0.65) continue;
    if (trees.some(tree => (tree.x - x) ** 2 + (tree.z - z) ** 2 < 16)) continue;
    const id = accepted++;
    const instances = container.instantiateModelsToScene(name => `pine-${id}-${name}`, false, { doNotInstantiate: false });
    const root = new TransformNode(`pine-placement-${id}`, scene);
    // Preserve source-space structure; normalize only the complete asset.
    const assetRoot = new TransformNode(`pine-origin-${id}`, scene);
    assetRoot.parent = root;
    assetRoot.position.set(-(min.x + max.x) / 2, -min.y, -(min.z + max.z) / 2);
    for (const node of instances.rootNodes) node.parent = assetRoot;
    const scale = (17 + random() * 7) / sourceHeight;
    root.scaling.setAll(scale); root.rotation.y = random() * Math.PI * 2;
    root.position.set(x, groundHeight(x, z), z);
    const meshes = root.getChildMeshes();
    for (const mesh of meshes) { mesh.isPickable = false; mesh.receiveShadows = true; }
    trees.push({ root, meshes, x, z, casts: false });
    if (Math.hypot(x, z) < 60) {
      const collider = MeshBuilder.CreateBox('trunk-collider', { width: 0.7, depth: 0.7, height: 10 }, scene);
      collider.position.set(x, groundHeight(x, z) + 5, z); collider.isVisible = false;
      collider.isPickable = false; collider.checkCollisions = true; collider.computeWorldMatrix(true);
    }
  }
  let elapsed = 1000;
  scene.onBeforeRenderObservable.add(() => {
    elapsed += scene.getEngine().getDeltaTime();
    if (elapsed < 250 || !scene.activeCamera) return;
    elapsed = 0;
    const position = scene.activeCamera.globalPosition;
    for (const tree of trees) {
      const distance2 = (tree.x - position.x) ** 2 + (tree.z - position.z) ** 2;
      tree.root.setEnabled(distance2 < VISIBLE_RADIUS ** 2);
      const casts = distance2 < SHADOW_RADIUS ** 2;
      if (casts !== tree.casts) {
        for (const mesh of tree.meshes) {
          if (!mesh.getTotalVertices()) continue;
          if (casts) shadows.addShadowCaster(mesh); else shadows.removeShadowCaster(mesh);
        }
        tree.casts = casts;
      }
    }
  });
  scene.onDisposeObservable.add(() => container.dispose());
  console.info(`Placed ${trees.length} authored pine instances. Distance culling is enabled; mesh LOD and impostors are not yet supplied.`);
}
