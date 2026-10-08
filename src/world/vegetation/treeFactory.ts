import { InstancedMesh, Mesh, MeshBuilder, Scene, ShadowGenerator } from '@babylonjs/core';
import { createPineMaterials, buildPineTemplates, type PineTemplates } from '../../assets/trees/pine/lod';
import { pineShowcasePreset } from '../../assets/trees/pine/presets';
import { pineForestSettings as defaults } from '../../assets/trees/pine/forestSettings';
import { generate, meshFrom } from '../../assets/trees/pine/generator';
import { seededRandom } from '../generation/random';
import { groundHeight } from '../terrain/terrain';

type Pair = { wood: InstancedMesh; foliage: InstancedMesh };
type Tree = { pairs: Pair[]; x: number; z: number; variant: number; level: number; casts: boolean; collider?: Mesh };
type Mode = 'forest' | 'reference' | 'near' | 'mid' | 'far';

export function buildTrees(scene: Scene, shadows: ShadowGenerator): void {
  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;top:12px;left:12px;z-index:60;width:340px;max-height:75vh;overflow:auto;background:#101914ee;color:#eef4e8;padding:12px;border:1px solid #748473;font:12px/1.5 monospace;pointer-events:auto';
  panel.textContent = 'Preparing reusable pine assets…'; document.body.appendChild(panel);
  const timer = setTimeout(() => {
    if (scene.isDisposed) return;
    try { populate(scene, shadows, panel); }
    catch (error) { panel.textContent = `Pine forest failed: ${String(error)}`; console.error(error); }
  }, 40);
  scene.onDisposeObservable.add(() => { clearTimeout(timer); panel.remove(); });
}

function populate(scene: Scene, shadows: ShadowGenerator, panel: HTMLDivElement): void {
  const config = {
    maxTrees: Number(defaults.maxTrees), nearDistance: Number(defaults.nearDistance),
    farDistance: Number(defaults.farDistance), maxNearTrees: Number(defaults.maxNearTrees),
    visibleDistance: Number(defaults.visibleDistance)
  };
  const materials = createPineMaterials(scene), variants: PineTemplates[] = [];
  for (let variant = 0; variant < defaults.variants; variant++) {
    const settings = { ...pineShowcasePreset, seed: pineShowcasePreset.seed + variant * 71, width: pineShowcasePreset.width * (variant ? 0.97 : 1) };
    variants.push(buildPineTemplates(scene, settings, materials, `pine-v${variant}`));
  }
  const trees: Tree[] = [];
  let mode: Mode = 'forest', treeShadows = Boolean(defaults.treeShadows), elapsed = 1000;
  let rebuildTimer: ReturnType<typeof setTimeout> | undefined;
  let reference: { wood: Mesh; foliage: Mesh; triangles: number } | undefined;

  function place(x: number, z: number, variant: number, scale: number, rotation: number): void {
    const id = trees.length;
    const pairs = variants[variant].levels.map((level, lod) => {
      const wood = level.wood.createInstance(`pine-${id}-wood-${lod}`), foliage = level.foliage.createInstance(`pine-${id}-foliage-${lod}`);
      for (const instance of [wood, foliage]) {
        instance.position.set(x, groundHeight(x, z), z); instance.scaling.setAll(scale); instance.rotation.y = rotation;
        instance.isVisible = true; instance.isPickable = false; instance.setEnabled(false);
      }
      return { wood, foliage };
    });
    const tree: Tree = { pairs, x, z, variant, level: -1, casts: false };
    trees.push(tree);
    if (Math.hypot(x, z) < 65) {
      const collider = MeshBuilder.CreateBox('pine-trunk-collider', { width: 0.75 * scale, depth: 0.75 * scale, height: 10 * scale }, scene);
      collider.position.set(x, groundHeight(x, z) + 5 * scale, z); collider.isVisible = false; collider.isPickable = false;
      collider.checkCollisions = true; collider.computeWorldMatrix(true); tree.collider = collider;
    }
  }

  function rebuildForest(): void {
    for (const tree of trees) {
      for (const pair of tree.pairs) for (const mesh of [pair.wood, pair.foliage]) {
        shadows.removeShadowCaster(mesh); mesh.dispose();
      }
      tree.collider?.dispose();
    }
    trees.length = 0;
    if (config.maxTrees > 0) place(-10, -1, 0, 1, 0);
    const random = seededRandom(defaults.seed);
    for (let attempt = 0; attempt < Math.max(900, config.maxTrees * 40) && trees.length < config.maxTrees; attempt++) {
      const x = (random() - 0.5) * 230, z = (random() - 0.5) * 230;
      if (Math.hypot(x, z - 6) < 24 || (Math.abs(x) < 4 && z < 2)) continue;
      const density = 0.62 + 0.20 * Math.sin(x / 23) * Math.cos(z / 29);
      if (random() > density) continue;
      const slope = Math.hypot(groundHeight(x + 1, z) - groundHeight(x - 1, z), groundHeight(x, z + 1) - groundHeight(x, z - 1)) / 2;
      if (slope > 0.65 || trees.some(tree => (tree.x - x) ** 2 + (tree.z - z) ** 2 < 49)) continue;
      place(x, z, trees.length % variants.length, 0.83 + random() * 0.28, random() * Math.PI * 2);
    }
    elapsed = 1000;
  }
  rebuildForest();

  panel.textContent = '';
  const title = document.createElement('div'); title.textContent = 'PINE ASSET — LIVE FOREST SETTINGS'; panel.appendChild(title);
  const summary = document.createElement('div'); summary.style.whiteSpace = 'pre-line'; panel.appendChild(summary);
  const details = document.createElement('div'); details.style.whiteSpace = 'pre-line';
  details.textContent = variants.map((variant, index) => `Variant ${index}: near ${variant.levels[0].triangles.toLocaleString()} / mid ${variant.levels[1].triangles.toLocaleString()} / far ${variant.levels[2].triangles.toLocaleString()} tris`).join('\n'); panel.appendChild(details);
  const note = document.createElement('div');
  note.textContent = 'Esc releases mouse. Near is reduced geometry; mid/far are approximations. Reference is original full detail.'; panel.appendChild(note);

  function button(text: string, click: (element: HTMLButtonElement) => void): HTMLButtonElement {
    const element = document.createElement('button'); element.textContent = text;
    element.style.cssText = 'display:block;width:100%;margin:7px 0;padding:7px;background:#314232;color:white;border:1px solid #71816e;cursor:pointer';
    element.onclick = () => click(element); panel.appendChild(element); return element;
  }
  const refreshControls: (() => void)[] = [];
  function slider(label: string, min: number, max: number, step: number, read: () => number, write: (value: number) => void): void {
    const row = document.createElement('label'); row.style.cssText = 'display:block;margin-top:10px';
    const text = document.createElement('div'), input = document.createElement('input');
    input.type = 'range'; input.min = String(min); input.max = String(max); input.step = String(step); input.style.width = '100%';
    const refresh = () => { input.value = String(read()); text.textContent = `${label}: ${read()}`; };
    refreshControls.push(refresh); refresh();
    input.oninput = () => { write(Number(input.value)); refreshControls.forEach(sync => sync()); elapsed = 1000; };
    row.append(text, input); panel.appendChild(row);
  }
  function scheduleForestRebuild(): void {
    if (rebuildTimer) clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(() => { if (!scene.isDisposed) rebuildForest(); }, 200);
  }
  function normalizeVisibility(): void {
    config.visibleDistance = Math.max(Number(defaults.visibleDistance), config.farDistance + 20);
  }
  slider('Total trees (includes showcase tree)', 0, 160, 1, () => config.maxTrees, value => {
    config.maxTrees = Math.round(value); scheduleForestRebuild();
  });
  slider('Near detail distance (metres)', 5, 100, 1, () => config.nearDistance, value => {
    config.nearDistance = value; config.farDistance = Math.max(config.farDistance, value + 5); normalizeVisibility();
  });
  slider('Far detail begins (metres)', 10, 150, 1, () => config.farDistance, value => {
    config.farDistance = value; config.nearDistance = Math.min(config.nearDistance, value - 5); normalizeVisibility();
  });
  slider('Maximum Near-detail trees', 0, 16, 1, () => config.maxNearTrees, value => {
    config.maxNearTrees = Math.round(value);
  });
  button('Try wider detail: 28m / 70m / 4 Near trees', () => {
    config.nearDistance = 28; config.farDistance = 70; config.maxNearTrees = 4;
    normalizeVisibility(); refreshControls.forEach(sync => sync()); elapsed = 1000;
  });
  const settingsNote = document.createElement('div');
  settingsNote.textContent = 'Session-only settings. Reload restores forestSettings.ts defaults. Count is a placement target; terrain/spacing rules may reject locations.';
  panel.appendChild(settingsNote);

  function setLevel(tree: Tree, level: number, cast: boolean): void {
    if (tree.level === level && tree.casts === cast) return;
    for (let i = 0; i < tree.pairs.length; i++) for (const mesh of [tree.pairs[i].wood, tree.pairs[i].foliage]) {
      const active = i === level; mesh.setEnabled(active);
      if (active && cast) shadows.addShadowCaster(mesh); else shadows.removeShadowCaster(mesh);
    }
    tree.level = level; tree.casts = cast;
  }
  function createReference(): void {
    if (reference) return;
    const original = generate({ ...pineShowcasePreset });
    const wood = meshFrom(scene, 'pine-original-reference-wood', original.wood), foliage = meshFrom(scene, 'pine-original-reference-foliage', original.needles);
    wood.material = materials.bark; foliage.material = materials.needles;
    for (const mesh of [wood, foliage]) { mesh.position.set(-10, groundHeight(-10, -1), -1); mesh.setEnabled(false); }
    reference = { wood, foliage, triangles: (original.wood.indices.length + original.needles.indices.length) / 3 };
  }
  function select(next: Mode): void {
    try { if (next === 'reference') createReference(); mode = next; elapsed = 1000; }
    catch (error) { console.error(error); note.textContent = `Reference failed: ${String(error)}`; }
  }
  button('Forest: automatic detail', () => select('forest'));
  button('Reference: original high-detail tree only', () => select('reference'));
  button('Compare: near tree only', () => select('near'));
  button('Compare: mid tree only', () => select('mid'));
  button('Compare: far tree only', () => select('far'));
  const shadowButton = button(`Tree shadows: ${treeShadows ? 'ON' : 'OFF'}`, element => {
    treeShadows = !treeShadows; element.textContent = `Tree shadows: ${treeShadows ? 'ON' : 'OFF'}`; elapsed = 1000;
  });
  button('Reset forest settings', () => {
    if (rebuildTimer) clearTimeout(rebuildTimer);
    config.maxTrees = Number(defaults.maxTrees); config.nearDistance = Number(defaults.nearDistance);
    config.farDistance = Number(defaults.farDistance); config.maxNearTrees = Number(defaults.maxNearTrees);
    config.visibleDistance = Number(defaults.visibleDistance); treeShadows = Boolean(defaults.treeShadows);
    shadowButton.textContent = `Tree shadows: ${treeShadows ? 'ON' : 'OFF'}`;
    refreshControls.forEach(sync => sync()); rebuildForest();
  });

  scene.onBeforeRenderObservable.add(() => {
    elapsed += scene.getEngine().getDeltaTime();
    if (elapsed < 200 || !scene.activeCamera) return;
    elapsed = 0;
    const counts = [0, 0, 0]; let visibleTriangles = 0, nearCount = 0;
    const camera = scene.activeCamera.globalPosition;
    const sorted = trees.map(tree => ({ tree, distance: Math.hypot(tree.x - camera.x, tree.z - camera.z) })).sort((a, b) => a.distance - b.distance);
    for (const { tree, distance } of sorted) {
      let level = -1;
      if (mode === 'forest' && distance < config.visibleDistance) {
        if (distance < config.nearDistance && nearCount < config.maxNearTrees) { level = 0; nearCount++; }
        else level = distance < config.farDistance ? 1 : 2;
      } else if (mode !== 'forest' && mode !== 'reference' && tree === trees[0]) level = mode === 'near' ? 0 : mode === 'mid' ? 1 : 2;
      setLevel(tree, level, treeShadows && level >= 0 && distance < defaults.shadowDistance);
      if (level >= 0) { counts[level]++; visibleTriangles += variants[tree.variant].levels[level].triangles; }
    }
    if (reference) {
      for (const mesh of [reference.wood, reference.foliage]) {
        mesh.setEnabled(mode === 'reference');
        if (mode === 'reference' && treeShadows) shadows.addShadowCaster(mesh); else shadows.removeShadowCaster(mesh);
      }
      if (mode === 'reference') visibleTriangles = reference.triangles;
    }
    summary.textContent = `${Math.round(scene.getEngine().getFps())} FPS · mode ${mode}\n${trees.length}/${config.maxTrees} trees placed · near ${counts[0]} / mid ${counts[1]} / far ${counts[2]}\nEnabled-tree budget ${visibleTriangles.toLocaleString()} triangles`;
  });
  scene.onDisposeObservable.add(() => { if (rebuildTimer) clearTimeout(rebuildTimer); });
}
