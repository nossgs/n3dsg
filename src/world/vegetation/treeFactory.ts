import { AbstractMesh, BaseTexture, Color3, Material, MeshBuilder, MultiMaterial, PBRMaterial, Scene, SceneLoader, ShadowGenerator, StandardMaterial, Texture, TransformNode, Vector3 } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { groundHeight } from '../terrain/terrain';
const base = (import.meta as ImportMeta & { env: { BASE_URL: string } }).env.BASE_URL;
type SavedMaterial = {
  material: Material;
  transparency: number | null;
  alpha: number;
  opacity: BaseTexture | null;
  fromAlbedo?: boolean;
  fromDiffuse?: boolean;
};
export function buildTrees(scene: Scene, shadows: ShadowGenerator): void {
  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;left:12px;top:12px;z-index:60;width:350px;max-height:70vh;overflow:auto;background:#101914ee;color:#eef4e8;padding:12px;border:1px solid #748473;border-radius:5px;font:12px/1.5 monospace;pointer-events:auto';
  panel.textContent = 'Loading one diagnostic tree…'; document.body.appendChild(panel);
  void loadDiagnostic(scene, shadows, panel).catch(error => {
    panel.textContent = `Tree diagnostic failed: ${String(error)}`; console.error(error);
  });
  scene.onDisposeObservable.add(() => panel.remove());
}
async function loadDiagnostic(scene: Scene, shadows: ShadowGenerator, panel: HTMLDivElement): Promise<void> {
  const response = await fetch(`${base}assets/trees/manifest.json`);
  if (!response.ok) throw new Error(`Tree manifest HTTP ${response.status}`);
  const manifest = await response.json() as { trees: { pine: { file: string; triangles?: number } } };
  const entry = manifest.trees.pine, slash = entry.file.lastIndexOf('/');
  const container = await SceneLoader.LoadAssetContainerAsync(`${base}assets/trees/${entry.file.slice(0, slash + 1)}`, entry.file.slice(slash + 1), scene);
  if (scene.isDisposed) { container.dispose(); return; }
  const importedRoots = [...container.rootNodes];
  container.addAllToScene();
  const placement = new TransformNode('diagnostic-tree-placement', scene);
  const origin = new TransformNode('diagnostic-tree-origin', scene); origin.parent = placement;
  for (const node of importedRoots) node.parent = origin;
  const meshes = placement.getChildMeshes().filter(mesh => mesh.getTotalVertices() > 0);
  if (!meshes.length) throw new Error('Tree has no renderable meshes.');
  const bounds = () => {
    const min = new Vector3(Infinity, Infinity, Infinity), max = new Vector3(-Infinity, -Infinity, -Infinity);
    for (const mesh of meshes) {
      mesh.computeWorldMatrix(true);
      const box = mesh.getBoundingInfo().boundingBox;
      min.minimizeInPlace(box.minimumWorld); max.maximizeInPlace(box.maximumWorld);
    }
    return { min, max };
  };
  const initial = bounds(), height = initial.max.y - initial.min.y;
  if (!Number.isFinite(height) || height <= 0) throw new Error('Invalid tree bounds.');
  origin.position.set(-(initial.min.x + initial.max.x) / 2, -initial.min.y, -(initial.min.z + initial.max.z) / 2);
  placement.scaling.setAll(18 / height);
  const x = -10, z = -1;
  placement.position.set(x, groundHeight(x, z), z);
  const planted = bounds(); placement.position.y += groundHeight(x, z) - planted.min.y;
  bounds();
  for (const mesh of meshes) { mesh.isPickable = false; mesh.receiveShadows = true; }
  const materialSet = new Set<Material>();
  for (const mesh of meshes) {
    if (mesh.material instanceof MultiMaterial) {
      for (const sub of mesh.material.subMaterials) if (sub) materialSet.add(sub);
    } else if (mesh.material) materialSet.add(mesh.material);
  }
  const materialHasCutout = (material: Material | null): boolean => {
    if (!material) return false;
    if (material.transparencyMode === Material.MATERIAL_ALPHATEST || material.transparencyMode === Material.MATERIAL_ALPHATESTANDBLEND) return true;
    if (material instanceof PBRMaterial) return Boolean(material.opacityTexture || (material.useAlphaFromAlbedoTexture && material.albedoTexture?.hasAlpha));
    if (material instanceof StandardMaterial) return Boolean(material.opacityTexture || (material.useAlphaFromDiffuseTexture && material.diffuseTexture?.hasAlpha));
    return false;
  };
  const isFoliage = (mesh: AbstractMesh): boolean => {
    const names = `${mesh.name} ${mesh.material?.name ?? ''}`.toLowerCase();
    if (/twig|foliage|leaf|leaves|needle/.test(names)) return true;
    if (mesh.material instanceof MultiMaterial) return mesh.material.subMaterials.some(materialHasCutout);
    return materialHasCutout(mesh.material);
  };
  const foliage = meshes.filter(isFoliage);
  const textures = new Map<Texture, boolean>();
  const saved: SavedMaterial[] = [];
  for (const material of materialSet) {
    if (material instanceof PBRMaterial) {
      saved.push({ material, transparency: material.transparencyMode, alpha: material.alpha, opacity: material.opacityTexture, fromAlbedo: material.useAlphaFromAlbedoTexture });
      if (material.albedoTexture instanceof Texture && !textures.has(material.albedoTexture)) textures.set(material.albedoTexture, material.albedoTexture.hasAlpha);
    } else if (material instanceof StandardMaterial) {
      saved.push({ material, transparency: material.transparencyMode, alpha: material.alpha, opacity: material.opacityTexture, fromDiffuse: material.useAlphaFromDiffuseTexture });
      if (material.diffuseTexture instanceof Texture && !textures.has(material.diffuseTexture)) textures.set(material.diffuseTexture, material.diffuseTexture.hasAlpha);
    }
  }
  let cutouts = true, foliageVisible = true, treeShadows = false;
  const applyCutouts = () => {
    for (const [texture, hasAlpha] of textures) texture.hasAlpha = cutouts ? hasAlpha : false;
    for (const snapshot of saved) {
      const material = snapshot.material;
      material.transparencyMode = cutouts ? snapshot.transparency : Material.MATERIAL_OPAQUE;
      material.alpha = cutouts ? snapshot.alpha : 1;
      if (material instanceof PBRMaterial) {
        material.opacityTexture = cutouts ? snapshot.opacity : null;
        material.useAlphaFromAlbedoTexture = cutouts ? Boolean(snapshot.fromAlbedo) : false;
      } else if (material instanceof StandardMaterial) {
        material.opacityTexture = cutouts ? snapshot.opacity : null;
        material.useAlphaFromDiffuseTexture = cutouts ? Boolean(snapshot.fromDiffuse) : false;
      }
      material.markAsDirty(63);
    }
  };
  const applyShadows = () => {
    for (const mesh of meshes) {
      if (treeShadows) shadows.addShadowCaster(mesh); else shadows.removeShadowCaster(mesh);
    }
  };
  const marker = MeshBuilder.CreateBox('tree-ground-reference', { width: 2, depth: 2, height: 0.02 }, scene);
  marker.position.set(x, groundHeight(x, z) + 0.015, z); marker.isPickable = false;
  const markerMaterial = new StandardMaterial('ground-reference', scene);
  markerMaterial.diffuseColor = new Color3(0.9, 0.22, 0.12); markerMaterial.emissiveColor = new Color3(0.3, 0.04, 0.01); marker.material = markerMaterial;
  panel.textContent = '';
  const heading = document.createElement('div'); heading.textContent = 'SINGLE TREE DIAGNOSTIC'; panel.appendChild(heading);
  const instructions = document.createElement('div'); instructions.textContent = 'Tree: left of shelter, x=-10 z=-1. Red square marks ground. Esc releases mouse for controls.'; panel.appendChild(instructions);
  const fps = document.createElement('div'); panel.appendChild(fps);
  const counts = document.createElement('div'); panel.appendChild(counts);
  const triangleCount = (mesh: AbstractMesh) => mesh.getTotalIndices() ? mesh.getTotalIndices() / 3 : mesh.getTotalVertices() / 3;
  const rows = meshes.map(mesh => ({ mesh: mesh.name, material: mesh.material?.name ?? '(none)', triangles: Math.round(triangleCount(mesh)), vertices: mesh.getTotalVertices(), foliage: isFoliage(mesh) }));
  const total = rows.reduce((sum, row) => sum + row.triangles, 0);
  counts.textContent = `${total.toLocaleString()} triangles · ${meshes.length} meshes · ${materialSet.size} materials · ${foliage.length} foliage meshes detected`;
  console.table(rows);
  console.info('Tree diagnostic', { importedHeight: height, plantedBounds: bounds(), manifestTriangles: entry.triangles, runtimeTriangles: total });
  function button(): HTMLButtonElement {
    const element = document.createElement('button');
    element.style.cssText = 'display:block;width:100%;margin:7px 0;padding:7px;background:#314232;color:white;border:1px solid #71816e;cursor:pointer';
    panel.appendChild(element); return element;
  }
  const opacityButton = button(), foliageButton = button(), shadowsButton = button();
  const refresh = () => {
    opacityButton.textContent = `Opacity cutouts: ${cutouts ? 'ON (original)' : 'OFF (solid geometry)'}`;
    foliageButton.textContent = `Foliage visibility: ${foliageVisible ? 'ON' : 'OFF'}`;
    shadowsButton.textContent = `Tree casting shadows: ${treeShadows ? 'ON' : 'OFF'}`;
  };
  opacityButton.onclick = () => { cutouts = !cutouts; applyCutouts(); refresh(); };
  foliageButton.onclick = () => { foliageVisible = !foliageVisible; for (const mesh of foliage) mesh.setEnabled(foliageVisible); refresh(); };
  shadowsButton.onclick = () => { treeShadows = !treeShadows; applyShadows(); refresh(); };
  refresh(); applyShadows();
  if (!foliage.length) {
    const warning = document.createElement('div'); warning.textContent = 'No foliage meshes identified: inspect mesh names below; visibility button will have no effect.'; panel.appendChild(warning);
  }
  const report = document.createElement('pre'); report.style.cssText = 'white-space:pre-wrap;word-break:break-word;font:11px/1.4 monospace';
  report.textContent = rows.map(row => `${row.foliage ? '[F]' : '[W]'} ${row.mesh}\n  ${row.material} · ${row.triangles.toLocaleString()} tris`).join('\n'); panel.appendChild(report);
  let elapsed = 0;
  scene.onAfterRenderObservable.add(() => {
    elapsed += scene.getEngine().getDeltaTime();
    if (elapsed > 500) { fps.textContent = `${Math.round(scene.getEngine().getFps())} FPS · one tree; ground/shelter unchanged`; elapsed = 0; }
  });
  scene.onDisposeObservable.add(() => { marker.dispose(); markerMaterial.dispose(); container.dispose(); });
}
