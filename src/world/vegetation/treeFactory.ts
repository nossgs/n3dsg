import { InstancedMesh, Mesh, MeshBuilder, Scene, ShadowGenerator } from '@babylonjs/core';
import { createPineMaterials, buildPineTemplates, type PineTemplates } from '../../assets/trees/pine/lod';
import { pineShowcasePreset } from '../../assets/trees/pine/presets';
import { pineForestSettings as config } from '../../assets/trees/pine/forestSettings';
import { generate, meshFrom } from '../../assets/trees/pine/generator';
import { seededRandom } from '../generation/random';
import { groundHeight } from '../terrain/terrain';
type Tree = { pairs: { wood: InstancedMesh; foliage: InstancedMesh }[]; x: number; z: number; variant: number; scale: number; level: number; casts: boolean };
type Mode = 'forest' | 'reference' | 'near' | 'mid' | 'far';
export function buildTrees(scene: Scene, shadows: ShadowGenerator): void {
  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;top:12px;left:12px;z-index:60;width:330px;max-height:65vh;overflow:auto;background:#101914ee;color:#eef4e8;padding:12px;border:1px solid #748473;font:12px/1.5 monospace;pointer-events:auto';
  panel.textContent = 'Preparing reusable pine assets…'; document.body.appendChild(panel);
  const timer = setTimeout(() => {
    if (scene.isDisposed) return;
    try { populate(scene, shadows, panel); }
    catch (error) { panel.textContent = `Pine forest failed: ${String(error)}`; console.error(error); }
  }, 40);
  scene.onDisposeObservable.add(() => { clearTimeout(timer); panel.remove(); });
}
function populate(scene: Scene, shadows: ShadowGenerator, panel: HTMLDivElement): void {
  const materials = createPineMaterials(scene), variants: PineTemplates[] = [];
  for (let variant = 0; variant < config.variants; variant++) {
    const settings = { ...pineShowcasePreset, seed: pineShowcasePreset.seed + variant * 71, width: pineShowcasePreset.width * (variant ? 0.97 : 1) };
    variants.push(buildPineTemplates(scene, settings, materials, `pine-v${variant}`));
  }
  const trees: Tree[] = [];
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
    trees.push({ pairs, x, z, variant, scale, level: -1, casts: false });
    if (Math.hypot(x, z) < 65) {
      const collider = MeshBuilder.CreateBox('pine-trunk-collider', { width: 0.75 * scale, depth: 0.75 * scale, height: 10 * scale }, scene);
      collider.position.set(x, groundHeight(x, z) + 5 * scale, z); collider.isVisible = false; collider.isPickable = false;
      collider.checkCollisions = true; collider.computeWorldMatrix(true);
    }
  }
  // Fixed showcase placement plus a modest deterministic stand.
  place(-10, -1, 0, 1, 0);
  const random = seededRandom(config.seed);
  for (let attempt = 0; attempt < 900 && trees.length < config.maxTrees; attempt++) {
    const x = (random() - 0.5) * 230, z = (random() - 0.5) * 230;
    if (Math.hypot(x, z - 6) < 24 || (Math.abs(x) < 4 && z < 2)) continue;
    const density = 0.62 + 0.20 * Math.sin(x / 23) * Math.cos(z / 29);
    if (random() > density) continue;
    const slope = Math.hypot(groundHeight(x + 1, z) - groundHeight(x - 1, z), groundHeight(x, z + 1) - groundHeight(x, z - 1)) / 2;
    if (slope > 0.65 || trees.some(tree => (tree.x - x) ** 2 + (tree.z - z) ** 2 < 49)) continue;
    place(x, z, trees.length % variants.length, 0.83 + random() * 0.28, random() * Math.PI * 2);
  }
  let mode: Mode = 'forest', treeShadows = Boolean(config.treeShadows), elapsed = 1000;
  let reference: { wood: Mesh; foliage: Mesh; triangles: number } | undefined;
  let visibleTriangles = 0, counts = [0, 0, 0];
  panel.textContent = '';
  const title = document.createElement('div'); title.textContent = 'PINE ASSET — FOREST TEST'; panel.appendChild(title);
  const summary = document.createElement('div'); summary.style.whiteSpace = 'pre-line'; panel.appendChild(summary);
  const details = document.createElement('div'); details.style.whiteSpace = 'pre-line';
  details.textContent = variants.map((variant, index) => `Variant ${index}: near ${variant.levels[0].triangles.toLocaleString()} / mid ${variant.levels[1].triangles.toLocaleString()} / far ${variant.levels[2].triangles.toLocaleString()} tris`).join('\n'); panel.appendChild(details);
  const note = document.createElement('div'); note.textContent = 'Esc releases mouse. Mid/far foliage is approximate: compare against Reference before increasing forest density.'; panel.appendChild(note);
  function setLevel(tree: Tree, level: number, cast: boolean): void {
    if (tree.level !== level || tree.casts !== cast) {
      for (let i = 0; i < tree.pairs.length; i++) {
        const active = i === level;
        for (const mesh of [tree.pairs[i].wood, tree.pairs[i].foliage]) {
          mesh.setEnabled(active);
          if (active && cast) shadows.addShadowCaster(mesh); else shadows.removeShadowCaster(mesh);
        }
      }
      tree.level = level; tree.casts = cast;
    }
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
  function button(text: string, click: (element: HTMLButtonElement) => void): void {
    const element = document.createElement('button'); element.textContent = text;
    element.style.cssText = 'display:block;width:100%;margin:7px 0;padding:7px;background:#314232;color:white;border:1px solid #71816e;cursor:pointer';
    element.onclick = () => click(element); panel.appendChild(element);
  }
  button('Forest: automatic detail', () => select('forest'));
  button('Reference: approved high-detail tree only', () => select('reference'));
  button('Compare: near tree only', () => select('near'));
  button('Compare: mid tree only', () => select('mid'));
  button('Compare: far tree only', () => select('far'));
  button('Tree shadows: OFF', element => { treeShadows = !treeShadows; element.textContent = `Tree shadows: ${treeShadows ? 'ON' : 'OFF'}`; elapsed = 1000; });
  scene.onBeforeRenderObservable.add(() => {
    elapsed += scene.getEngine().getDeltaTime();
    if (elapsed < 200 || !scene.activeCamera) return;
    elapsed = 0; counts = [0, 0, 0]; visibleTriangles = 0;
    const camera = scene.activeCamera.globalPosition;
    const sorted = trees.map(tree => ({ tree, distance: Math.hypot(tree.x - camera.x, tree.z - camera.z) })).sort((a, b) => a.distance - b.distance);
    let nearCount = 0;
    for (const { tree, distance } of sorted) {
      let level = -1;
      if (mode === 'forest' && distance < config.visibleDistance) {
        if (distance < config.nearDistance && nearCount < config.maxNearTrees) { level = 0; nearCount++; }
        else level = distance < config.farDistance ? 1 : 2;
      } else if (mode !== 'forest' && mode !== 'reference' && tree === trees[0]) level = mode === 'near' ? 0 : mode === 'mid' ? 1 : 2;
      const cast = treeShadows && level >= 0 && distance < config.shadowDistance;
      setLevel(tree, level, cast);
      if (level >= 0) { counts[level]++; visibleTriangles += variants[tree.variant].levels[level].triangles; }
    }
    if (reference) {
      for (const mesh of [reference.wood, reference.foliage]) {
        mesh.setEnabled(mode === 'reference');
        if (mode === 'reference' && treeShadows) shadows.addShadowCaster(mesh); else shadows.removeShadowCaster(mesh);
      }
      if (mode === 'reference') visibleTriangles = reference.triangles;
    }
    summary.textContent = `${Math.round(scene.getEngine().getFps())} FPS · mode ${mode}\n${trees.length} placed · near ${counts[0]} / mid ${counts[1]} / far ${counts[2]}\nEnabled-tree budget ${visibleTriangles.toLocaleString()} triangles`;
  });
  console.info('Pine forest asset budgets', variants.map((variant, index) => ({ variant: index, shoots: variant.blueprint.shoots.length, near: variant.levels[0].triangles, mid: variant.levels[1].triangles, far: variant.levels[2].triangles })));
}
