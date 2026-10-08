import { Color3, PBRMaterial, Scene, Texture } from '@babylonjs/core';
type Maps = { albedo: string; normal: string; roughness: string };
type Manifest = { materials: Record<string, { maps: Maps }> };
const base = (import.meta as ImportMeta & { env: { BASE_URL: string } }).env.BASE_URL;
let manifest: Promise<Manifest> | undefined;
const pending = new Set<string>();
let failed = false;
function status(): HTMLElement {
  let element = document.getElementById('forest-assets');
  if (!element) {
    element = document.createElement('div'); element.id = 'forest-assets';
    element.style.cssText = 'position:fixed;bottom:50px;left:12px;z-index:50;padding:8px;color:white;background:#382014dd;font:12px monospace;pointer-events:none';
    document.body.appendChild(element);
  }
  return element;
}
function loadManifest(): Promise<Manifest> {
  return manifest ??= fetch(`${base}assets/forest/manifest.json`).then(async response => {
    if (!response.ok) throw new Error(`Forest manifest: HTTP ${response.status}`);
    return response.json() as Promise<Manifest>;
  });
}
export function createForestMaterial(scene: Scene, key: 'soil' | 'bark'): PBRMaterial {
  const material = new PBRMaterial(`forest-${key}`, scene);
  material.albedoColor = Color3.White(); material.metallic = 0; material.roughness = 1;
  material.backFaceCulling = key !== 'soil';
  pending.add(key); status().hidden = false; status().textContent = 'Loading forest textures…';
  const failure = (error: unknown) => {
    failed = true; status().hidden = false;
    status().textContent = `Forest assets failed: ${String(error)}`; console.error(error);
  };
  loadManifest().then(async data => {
    if (scene.isDisposed) return;
    const maps = data.materials[key]?.maps;
    if (!maps) throw new Error(`Missing material: ${key}`);
    const load = (path: string, gamma: boolean): Promise<Texture> => new Promise((resolve, reject) => {
      const tex = new Texture(`${base}assets/forest/${path}`, scene, false, false, Texture.TRILINEAR_SAMPLINGMODE,
        () => resolve(tex), message => reject(new Error(`${path}: ${message ?? 'texture error'}`)));
      tex.gammaSpace = gamma; tex.wrapU = tex.wrapV = Texture.WRAP_ADDRESSMODE; tex.anisotropicFilteringLevel = 4;
    });
    const [albedo, normal, roughness] = await Promise.all([load(maps.albedo, true), load(maps.normal, false), load(maps.roughness, false)]);
    if (scene.isDisposed) { albedo.dispose(); normal.dispose(); roughness.dispose(); return; }
    material.albedoTexture = albedo; material.bumpTexture = normal; material.metallicTexture = roughness;
    material.useRoughnessFromMetallicTextureAlpha = false;
    material.useRoughnessFromMetallicTextureGreen = true;
    material.useMetallnessFromMetallicTextureBlue = false;
    material.invertNormalMapX = false; material.invertNormalMapY = false;
    pending.delete(key); if (!pending.size && !failed) status().hidden = true;
  }).catch(failure);
  return material;
}
