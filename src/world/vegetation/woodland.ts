import { EngineInstrumentation, Matrix, Mesh, MeshBuilder, Quaternion, Scene, SceneInstrumentation, ShadowGenerator, Vector3 } from '@babylonjs/core';
import '@babylonjs/core/Engines/Extensions/engine.query';
import { createWoodlandAssets, type WoodlandAsset } from '../../assets/woodland/woodlandAssets';
import { woodlandSettings as settings } from '../../assets/woodland/woodlandSettings';
import { createForestMaterial } from '../../graphics/forestMaterials';
import { createPineMaterials } from '../../assets/trees/pine/lod';
import { pineShowcasePreset } from '../../assets/trees/pine/presets';
import { generate, meshFrom } from '../../assets/trees/pine/generator';
import { seededRandom } from '../generation/random';
import { groundHeight } from '../terrain/terrain';

type Category = 'trees' | 'brush' | 'grass' | 'details';
type Placement = { asset: WoodlandAsset; x: number; z: number; scale: number; angle: number };
type Batch = { mesh: Mesh; category: Category; triangles: number; count: number };

export function buildWoodland(scene: Scene, shadows: ShadowGenerator): void {
  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;left:12px;top:12px;z-index:60;width:350px;max-height:75vh;overflow:auto;background:#101914ee;color:#eef4e8;padding:12px;border:1px solid #748473;font:12px/1.5 monospace;pointer-events:auto';
  panel.textContent = 'Preparing woodland test patch…'; document.body.appendChild(panel);
  const timer = setTimeout(() => {
    if (scene.isDisposed) return;
    try { populate(scene, shadows, panel); }
    catch (error) { panel.textContent = `Woodland setup failed: ${String(error)}`; console.error(error); }
  }, 40);
  scene.onDisposeObservable.add(() => { clearTimeout(timer); panel.remove(); });
}

function populate(scene: Scene, shadows: ShadowGenerator, panel: HTMLDivElement): void {
  const assets = createWoodlandAssets(scene), batches: Batch[] = [], colliders: Mesh[] = [];
  const enabled: Record<Category, boolean> = { trees: true, brush: true, grass: true, details: true };
  const counts: Record<Category, number> = { trees: 0, brush: 0, grass: 0, details: 0 };
  let target = Number(settings.treeTarget), timer: ReturnType<typeof setTimeout> | undefined;
  let reference: Mesh[] | undefined, referenceVisible = false, treeShadows = false, pendingStats = 0;
  const allAssets = [...assets.trees, ...assets.brush, ...assets.grass, ...assets.details];
  const engine = scene.getEngine();
  const sceneStats = new SceneInstrumentation(scene), gpuStats = new EngineInstrumentation(engine);
  sceneStats.captureFrameTime = true; sceneStats.captureRenderTime = true; sceneStats.captureActiveMeshesEvaluationTime = true;
  if (engine.getCaps().timerQuery) { try { gpuStats.captureGPUFrameTime = true; } catch (error) { console.warn('GPU timing unavailable', error); } }

  function available(x: number, z: number): boolean {
    return Math.hypot(x, z - 6) > settings.clearingRadius && !(Math.abs(x) < 3.1 && z < 2);
  }
  function slope(x: number, z: number): number {
    return Math.hypot(groundHeight(x + 1, z) - groundHeight(x - 1, z), groundHeight(x, z + 1) - groundHeight(x, z - 1)) / 2;
  }
  function standDensity(x: number, z: number): number {
    return 0.60 + Math.sin(x / 13) * Math.cos(z / 17) * 0.24;
  }
  function buildBatches(category: Category, placements: Placement[]): void {
    const buckets = new Map<string, { asset: WoodlandAsset; placements: Placement[] }>();
    placements.forEach(placement => {
      const key = `${placement.asset.id}/${Math.floor(placement.x / settings.cellSize)}/${Math.floor(placement.z / settings.cellSize)}`;
      let bucket = buckets.get(key); if (!bucket) { bucket = { asset: placement.asset, placements: [] }; buckets.set(key, bucket); }
      bucket.placements.push(placement);
    });
    for (const [key, bucket] of buckets) {
      const matrices = new Float32Array(bucket.placements.length * 16);
      bucket.placements.forEach((placement, index) => {
        Matrix.Compose(new Vector3(placement.scale, placement.scale, placement.scale), Quaternion.RotationYawPitchRoll(placement.angle, 0, 0), new Vector3(placement.x, groundHeight(placement.x, placement.z), placement.z)).copyToArray(matrices, index * 16);
      });
      for (const source of bucket.asset.meshes) {
        const mesh = source.clone('woodland-batch/' + key, null, true); if (!mesh) throw new Error('Cannot clone woodland template.');
        // Thin-instance buffers must not overwrite another chunk's geometry buffers.
        mesh.makeGeometryUnique(); mesh.isPickable = false; mesh.isVisible = true;
        mesh.thinInstanceSetBuffer('matrix', matrices, 16, true); mesh.thinInstanceRefreshBoundingInfo();
        mesh.setEnabled(enabled[category] && !referenceVisible);
        const triangles = mesh.getTotalIndices() / 3 * bucket.placements.length;
        batches.push({ mesh, category, triangles, count: bucket.placements.length });
      }
    }
    counts[category] = placements.length;
  }
  function clearTrees(): void {
    for (let i = batches.length - 1; i >= 0; i--) if (batches[i].category === 'trees') {
      shadows.removeShadowCaster(batches[i].mesh); batches[i].mesh.dispose(); batches.splice(i, 1);
    }
    colliders.splice(0).forEach(mesh => mesh.dispose());
  }
  function buildTrees(): void {
    clearTrees();
    const random = seededRandom(settings.seed), placements: Placement[] = [];
    for (let attempt = 0; attempt < 18000 && placements.length < target; attempt++) {
      const x = (random() - 0.5) * settings.halfExtent * 2, z = 6 + (random() - 0.5) * settings.halfExtent * 2;
      if (!available(x, z) || slope(x, z) > 0.72 || random() > standDensity(x, z)) continue;
      if (placements.some(tree => (tree.x - x) ** 2 + (tree.z - z) ** 2 < settings.minimumTreeSpacing ** 2)) continue;
      const species = random() < 0.4 ? 0 : random() < 0.48 ? 1 : 2;
      const placement = { asset: assets.trees[species], x, z, scale: 0.8 + random() * 0.32, angle: random() * Math.PI * 2 };
      placements.push(placement);
      const radius = (placement.asset.trunkRadius ?? 0.3) * placement.scale;
      const collider = MeshBuilder.CreateBox('woodland-trunk-collider', { width: radius * 2, depth: radius * 2, height: 7 * placement.scale }, scene);
      collider.position.set(x, groundHeight(x, z) + 3.5 * placement.scale, z); collider.isVisible = false; collider.isPickable = false; collider.checkCollisions = true;
      colliders.push(collider);
    }
    buildBatches('trees', placements); pendingStats = 1000;
  }
  buildTrees();
  for (const category of ['brush', 'grass', 'details'] as const) {
    const random = seededRandom(settings.seed + (category === 'grass' ? 71 : category === 'brush' ? 23 : 139));
    const placements: Placement[] = [], categoryAssets = assets[category];
    const wanted = category === 'grass' ? settings.grassTarget : category === 'brush' ? settings.brushTarget : settings.detailTarget;
    for (let attempt = 0; attempt < wanted * 30 && placements.length < wanted; attempt++) {
      const x = (random() - 0.5) * settings.halfExtent * 2, z = 6 + (random() - 0.5) * settings.halfExtent * 2;
      if (!available(x, z) || slope(x, z) > (category === 'details' ? 1.1 : 0.55)) continue;
      const patch = 0.5 + 0.5 * Math.sin(x / 5.4) * Math.cos(z / 6.1);
      if (category !== 'details' && random() > patch * (category === 'grass' ? 1 - standDensity(x, z) * 0.5 : 0.8)) continue;
      placements.push({ asset: categoryAssets[Math.floor(random() * categoryAssets.length)], x, z, scale: 0.7 + random() * 0.65, angle: random() * Math.PI * 2 });
    }
    buildBatches(category, placements);
  }

  panel.textContent = '';
  const title = document.createElement('div'); title.textContent = 'WOODLAND TEST — PROTOTYPE ASSETS'; panel.appendChild(title);
  const stats = document.createElement('div'); stats.style.whiteSpace = 'pre-line'; panel.appendChild(stats);
  const budgets = document.createElement('div'); budgets.style.whiteSpace = 'pre-line';
  budgets.textContent = assets.trees.map(asset => `${asset.label}: ${asset.triangles.toLocaleString()} triangles`).join('\n'); panel.appendChild(budgets);
  const description = document.createElement('div');
  description.textContent = '96m patch. Three tree silhouettes, brush, grass, rocks/logs/stumps. Prototype cards, not final baked art. No tree LOD swaps in this bounded test. Esc releases mouse.'; panel.appendChild(description);
  function button(text: string, click: (element: HTMLButtonElement) => void): HTMLButtonElement {
    const element = document.createElement('button'); element.textContent = text;
    element.style.cssText = 'display:block;width:100%;margin:7px 0;padding:7px;background:#314232;color:white;border:1px solid #71816e;cursor:pointer';
    element.onclick = () => click(element); panel.appendChild(element); return element;
  }
  const treeLabel = document.createElement('div'), treeInput = document.createElement('input'); treeInput.type = 'range'; treeInput.min = '0'; treeInput.max = '320'; treeInput.step = '10'; treeInput.value = String(target); treeInput.style.width = '100%';
  const syncCount = () => { treeLabel.textContent = `Tree placement target: ${target}`; }; syncCount(); panel.append(treeLabel, treeInput);
  treeInput.oninput = () => {
    target = Number(treeInput.value); syncCount(); if (timer) clearTimeout(timer);
    timer = setTimeout(() => { if (!scene.isDisposed) buildTrees(); }, 220);
  };
  for (const category of ['trees', 'brush', 'grass', 'details'] as const) button(`${category}: ON`, element => {
    enabled[category] = !enabled[category]; element.textContent = `${category}: ${enabled[category] ? 'ON' : 'OFF'}`; applyVisibility();
  });
  function applyVisibility(): void {
    for (const batch of batches) {
      const active = enabled[batch.category] && !referenceVisible; batch.mesh.setEnabled(active);
      if (active && treeShadows && batch.category === 'trees') shadows.addShadowCaster(batch.mesh); else shadows.removeShadowCaster(batch.mesh);
    }
    reference?.forEach(mesh => mesh.setEnabled(referenceVisible)); pendingStats = 1000;
  }
  button('Tree shadows: OFF', element => { treeShadows = !treeShadows; element.textContent = `Tree shadows: ${treeShadows ? 'ON' : 'OFF'}`; applyVisibility(); });
  button('Vegetation baseline: hide all / restore', () => {
    const hide = Object.values(enabled).some(Boolean); for (const category of ['trees', 'brush', 'grass', 'details'] as const) enabled[category] = !hide;
    referenceVisible = false; applyVisibility();
    // Keep layer button labels aligned with the baseline toggle.
    for (const element of Array.from(panel.querySelectorAll('button'))) {
      for (const category of ['trees', 'brush', 'grass', 'details'] as const) if (element.textContent?.startsWith(category + ':')) element.textContent = `${category}: ${enabled[category] ? 'ON' : 'OFF'}`;
    }
  });
  button('Original pine reference / return to woodland', () => {
    if (!reference) {
      const original = generate({ ...pineShowcasePreset }), materials = createPineMaterials(scene);
      const wood = meshFrom(scene, 'woodland-reference-wood', original.wood), leaves = meshFrom(scene, 'woodland-reference-leaves', original.needles);
      wood.material = materials.bark; leaves.material = materials.needles;
      reference = [wood, leaves]; reference.forEach(mesh => mesh.position.set(-10, groundHeight(-10, -1), -1));
    }
    referenceVisible = !referenceVisible; applyVisibility();
  });
  const note = document.createElement('div'); note.textContent = 'Layer toggles isolate rendering cost, not physics. Trunk colliders stay active. Brush and floor objects are visual only. Reload resets settings. Placement may not reach the target.'; panel.appendChild(note);
  scene.onAfterRenderObservable.add(() => {
    pendingStats += engine.getDeltaTime(); if (pendingStats < 500) return; pendingStats = 0;
    const gpu = gpuStats.gpuFrameTimeCounter.current / 1e6;
    const triangles = batches.filter(batch => batch.mesh.isEnabled()).reduce((sum, batch) => sum + batch.triangles, 0);
    stats.textContent = `${Math.round(engine.getFps())} FPS · interval ${engine.getDeltaTime().toFixed(1)} ms\nCPU render-loop ${sceneStats.frameTimeCounter.current.toFixed(2)} ms · mesh evaluation ${sceneStats.activeMeshesEvaluationTimeCounter.current.toFixed(2)} ms\nGPU ${gpu > 0 ? gpu.toFixed(2) + ' ms' : 'unavailable'}\nTrees ${counts.trees}/${target} · brush ${counts.brush} · grass ${counts.grass} · floor ${counts.details}\nActive meshes ${scene.getActiveMeshes().length} · enabled batch budget ${triangles.toLocaleString()} triangles${referenceVisible ? '\nReference mode: batch budget excludes reference tree.' : ''}`;
  });
  console.info('Woodland asset budgets', allAssets.map(asset => ({ id: asset.id, triangles: asset.triangles })));
  scene.onDisposeObservable.add(() => { if (timer) clearTimeout(timer); sceneStats.dispose(); gpuStats.dispose(); });
}
