import { Color3, Mesh, MeshBuilder, Scene, ShadowGenerator, StandardMaterial } from '@babylonjs/core';
import { createForestMaterial } from '../../graphics/forestMaterials';
import { groundHeight } from '../terrain/terrain';
import { generate, meshFrom, type Settings } from '../../assets/trees/pine/generator';
import { pineAuthoringDefaults } from '../../assets/trees/pine/presets';

export function buildTrees(scene: Scene, shadows: ShadowGenerator): void {
  const bark = createForestMaterial(scene, 'bark'), foliage = new StandardMaterial('procedural-pine-needles', scene);
  foliage.diffuseColor = Color3.White(); foliage.specularColor = new Color3(0.025, 0.035, 0.02); foliage.specularPower = 24; foliage.backFaceCulling = false; foliage.twoSidedLighting = true;
  const settings: Settings = { ...pineAuthoringDefaults };
  let wood: Mesh | undefined, needles: Mesh | undefined, casts = false, visible = true;
  const x = -10, z = -1;
  const panel = document.createElement('div'); panel.style.cssText = 'position:fixed;left:12px;top:12px;z-index:60;width:330px;max-height:70vh;overflow:auto;background:#101914ee;color:#eef4e8;padding:12px;border:1px solid #748473;border-radius:5px;font:12px/1.5 monospace;pointer-events:auto'; document.body.appendChild(panel);
  const title = document.createElement('div'); title.textContent = 'PROCEDURAL CONIFER — CONTINUOUS CROWN'; panel.appendChild(title);
  const info = document.createElement('div'); info.textContent = 'x=-10 z=-1. Esc releases mouse. Staggered branch attachments; single-tree test.'; panel.appendChild(info);
  const fps = document.createElement('div'), counts = document.createElement('div'); panel.append(fps, counts); counts.style.whiteSpace = 'pre-line';
  function applyShadows(): void {
    for (const mesh of [wood, needles]) if (mesh) { if (casts && mesh.isEnabled()) shadows.addShadowCaster(mesh); else shadows.removeShadowCaster(mesh); }
  }
  function rebuild(): void {
    for (const mesh of [wood, needles]) if (mesh) { shadows.removeShadowCaster(mesh); mesh.dispose(); }
    const result = generate(settings);
    wood = meshFrom(scene, 'generated-pine-wood', result.wood); wood.material = bark;
    needles = meshFrom(scene, 'generated-pine-needles', result.needles); needles.material = foliage;
    for (const mesh of [wood, needles]) mesh.position.set(x, groundHeight(x, z), z);
    needles.setEnabled(visible); applyShadows();
    const wt = result.wood.indices.length / 3, nt = result.needles.indices.length / 3;
    counts.textContent = `Seed ${settings.seed} · ${result.majorBranches} staggered limbs\n${result.branchlets} branchlets · ${result.shoots} shoots\nWood ${wt.toLocaleString()} tris · needles ${nt.toLocaleString()} tris\nTotal ${(wt + nt).toLocaleString()} tris · 2 meshes`;
    console.info('Continuous procedural crown', { ...settings, majorBranches: result.majorBranches, branchlets: result.branchlets, shoots: result.shoots, woodTriangles: wt, needleTriangles: nt });
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const syncs: (() => void)[] = [];
  function slider(label: string, min: number, max: number, step: number, read: () => number, write: (value: number) => void): void {
    const row = document.createElement('label'); row.style.cssText = 'display:block;margin-top:10px';
    const text = document.createElement('span'), input = document.createElement('input'); input.type = 'range'; input.min = String(min); input.max = String(max); input.step = String(step); input.style.width = '100%';
    const sync = () => { input.value = String(read()); text.textContent = `${label}: ${read().toFixed(2)}`; }; syncs.push(sync); sync();
    input.oninput = () => { write(Number(input.value)); sync(); if (timer) clearTimeout(timer); timer = setTimeout(rebuild, 180); };
    row.append(text, input); panel.appendChild(row);
  }
  slider('Crown width', 2, 4.5, 0.1, () => settings.width, value => settings.width = value);
  slider('Needle density', 0.5, 1.6, 0.05, () => settings.density, value => settings.density = value);
  slider('Branchlet fill', 0, 1.8, 0.1, () => settings.fill, value => settings.fill = value);
  slider('Live crown start (height fraction)', 0.08, 0.4, 0.01, () => settings.crownBase, value => settings.crownBase = value);
  slider('Branch budget (x5 limbs, not tiers)', 8, 15, 1, () => settings.groups, value => settings.groups = Math.round(value));
  function button(label: string, click: (button: HTMLButtonElement) => void): void {
    const element = document.createElement('button'); element.textContent = label; element.style.cssText = 'display:block;width:100%;margin:8px 0;padding:7px;background:#314232;color:white;border:1px solid #71816e;cursor:pointer';
    element.onclick = () => { if (timer) clearTimeout(timer); click(element); }; panel.appendChild(element);
  }
  button('Generate next seed', () => { settings.seed++; rebuild(); });
  button('Sparse branchlet comparison', () => { settings.fill = 0; syncs.forEach(sync => sync()); rebuild(); });
  button('Filled continuous crown', () => { settings.fill = 1.1; settings.density = 1.15; settings.crownBase = 0.14; settings.groups = 12; syncs.forEach(sync => sync()); rebuild(); });
  button('Needles: ON', element => { visible = !visible; needles?.setEnabled(visible); applyShadows(); element.textContent = `Needles: ${visible ? 'ON' : 'OFF'}`; });
  button('Tree casting shadows: OFF', element => { casts = !casts; applyShadows(); element.textContent = `Tree casting shadows: ${casts ? 'ON' : 'OFF'}`; });
  const marker = MeshBuilder.CreateBox('tree-ground-reference', { width: 2, depth: 2, height: 0.02 }, scene); marker.position.set(x, groundHeight(x, z) + 0.015, z); marker.isPickable = false;
  const markerMaterial = new StandardMaterial('tree-ground-reference-material', scene); markerMaterial.diffuseColor = new Color3(0.85, 0.2, 0.1); marker.material = markerMaterial;
  rebuild(); let elapsed = 0;
  scene.onAfterRenderObservable.add(() => { elapsed += scene.getEngine().getDeltaTime(); if (elapsed > 500) { fps.textContent = `${Math.round(scene.getEngine().getFps())} FPS · ground/shelter unchanged`; elapsed = 0; } });
  scene.onDisposeObservable.add(() => { if (timer) clearTimeout(timer); panel.remove(); markerMaterial.dispose(); foliage.dispose(); bark.dispose(); });
}
