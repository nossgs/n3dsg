import { BaseTexture, Color3, MaterialDefines, MaterialPluginBase, PBRMaterial, Scene, ShaderLanguage, Texture, UniformBuffer } from '@babylonjs/core';

type GroundMaps = { albedo: string; normal: string };
type Manifest = { materials: Record<string, { maps: GroundMaps }> };
const base = (import.meta as ImportMeta & { env: { BASE_URL: string } }).env.BASE_URL;
const samplerNames = ['fgSoilColor', 'fgDirtColor', 'fgSoilNormal', 'fgDirtNormal'];

class ForestGroundPlugin extends MaterialPluginBase {
  private readonly textures: Texture[];
  constructor(material: PBRMaterial, textures: Texture[]) {
    super(material, 'ForestGround', 200, { FOREST_GROUND: false });
    this.textures = textures;
    this._enable(true);
  }
  isCompatible(language: ShaderLanguage): boolean { return language === ShaderLanguage.GLSL; }
  prepareDefines(defines: MaterialDefines): void {
    (defines as MaterialDefines & { FOREST_GROUND: boolean }).FOREST_GROUND = true;
  }
  isReadyForSubMesh(): boolean { return this.textures.every(texture => texture.isReady()); }
  getSamplers(samplers: string[]): void { samplers.push(...samplerNames); }
  getActiveTextures(textures: BaseTexture[]): void { textures.push(...this.textures); }
  hasTexture(texture: BaseTexture): boolean { return this.textures.includes(texture as Texture); }
  bindForSubMesh(buffer: UniformBuffer): void {
    for (let i = 0; i < samplerNames.length; i++) buffer.setTexture(samplerNames[i], this.textures[i]);
  }
  dispose(): void { for (const texture of this.textures) texture.dispose(); }
  getCustomCode(shaderType: string): { [point: string]: string } | null {
    if (shaderType !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `
#ifdef FOREST_GROUND
uniform sampler2D fgSoilColor;
uniform sampler2D fgDirtColor;
uniform sampler2D fgSoilNormal;
uniform sampler2D fgDirtNormal;
vec2 fgHash(vec2 p) {
  return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
}
float fgNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(fgHash(i).x, fgHash(i + vec2(1.0, 0.0)).x, f.x),
             mix(fgHash(i + vec2(0.0, 1.0)).x, fgHash(i + vec2(1.0, 1.0)).x, f.x), f.y);
}
vec3 fgSample(sampler2D source, vec2 world, float scale, float linearize) {
  vec2 cells = world / 8.0;
  vec2 i = floor(cells), f = fract(cells);
  f = f * f * (3.0 - 2.0 * f);
  vec2 uv = world / scale;
  vec3 a = texture2D(source, uv + fgHash(i) * 7.0).rgb;
  vec3 b = texture2D(source, uv + fgHash(i + vec2(1.0, 0.0)) * 7.0).rgb;
  vec3 c = texture2D(source, uv + fgHash(i + vec2(0.0, 1.0)) * 7.0).rgb;
  vec3 d = texture2D(source, uv + fgHash(i + vec2(1.0, 1.0)) * 7.0).rgb;
  if (linearize > 0.5) {
    a = pow(a, vec3(2.2)); b = pow(b, vec3(2.2));
    c = pow(c, vec3(2.2)); d = pow(d, vec3(2.2));
  }
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
#endif
`,
      CUSTOM_FRAGMENT_BEFORE_LIGHTS: `
#ifdef FOREST_GROUND
vec2 fgWorld = vPositionW.xz;
float fgPatch = fgNoise(fgWorld / 11.0);
float fgMacro = fgNoise(fgWorld / 43.0);
float fgEdge = (fgNoise(fgWorld / 2.8) - 0.5) * 1.4;
float fgTrail = (1.0 - smoothstep(1.1, 3.6, abs(fgWorld.x + fgEdge)))
                * (1.0 - smoothstep(-1.0, 3.0, fgWorld.y));
float fgClearing = 1.0 - smoothstep(8.0, 16.0, length(fgWorld - vec2(0.0, 6.0)) + fgEdge);
float fgDirtWeight = clamp(max(fgTrail * 0.92, fgClearing * 0.7) + smoothstep(0.63, 0.86, fgPatch) * 0.5, 0.0, 1.0);
vec3 fgSoil = fgSample(fgSoilColor, fgWorld, 2.5, 1.0);
vec3 fgDirt = fgSample(fgDirtColor, fgWorld, 1.8, 1.0);
surfaceAlbedo = mix(fgSoil, fgDirt, fgDirtWeight) * mix(0.86, 1.1, fgMacro);
vec3 fgN0 = fgSample(fgSoilNormal, fgWorld, 2.5, 0.0) * 2.0 - 1.0;
vec3 fgN1 = fgSample(fgDirtNormal, fgWorld, 1.8, 0.0) * 2.0 - 1.0;
vec3 fgTangentNormal = normalize(mix(fgN0, fgN1, fgDirtWeight));
fgTangentNormal.xy *= 0.6;
fgTangentNormal = normalize(fgTangentNormal);
vec3 fgN = normalize(normalW);
vec3 fgT = normalize(vec3(fgN.y, -fgN.x, 0.0));
vec3 fgB = normalize(cross(fgT, fgN));
normalW = normalize(fgT * fgTangentNormal.x + fgB * fgTangentNormal.y + fgN * fgTangentNormal.z);
#endif
`
    };
  }
}

export function createGroundMaterial(scene: Scene): PBRMaterial {
  const material = new PBRMaterial('irregular-forest-ground', scene);
  material.albedoColor = new Color3(0.24, 0.21, 0.16);
  material.metallic = 0; material.roughness = 0.95;
  material.backFaceCulling = false;
  const notice = document.createElement('div');
  notice.style.cssText = 'position:fixed;bottom:76px;left:12px;z-index:50;color:white;background:#382014dd;padding:8px;font:12px monospace;pointer-events:none';
  notice.textContent = 'Loading layered ground…'; document.body.appendChild(notice);
  const load = (path: string, gamma: boolean): Promise<Texture> => new Promise((resolve, reject) => {
    const texture = new Texture(`${base}assets/forest/${path}`, scene, false, false, Texture.TRILINEAR_SAMPLINGMODE,
      () => resolve(texture), message => reject(new Error(`${path}: ${message ?? 'texture failed'}`)));
    texture.gammaSpace = gamma; texture.wrapU = texture.wrapV = Texture.WRAP_ADDRESSMODE;
    texture.anisotropicFilteringLevel = 4;
  });
  void fetch(`${base}assets/forest/manifest.json`).then(async response => {
    if (!response.ok) throw new Error(`Asset manifest HTTP ${response.status}`);
    const data = await response.json() as Manifest;
    const soil = data.materials.soil?.maps, dirt = data.materials.dirt?.maps;
    if (!soil || !dirt) throw new Error('Run Import forest assets to add soil and dirt.');
    const textures = await Promise.all([load(soil.albedo, true), load(dirt.albedo, true), load(soil.normal, false), load(dirt.normal, false)]);
    if (scene.isDisposed) { textures.forEach(texture => texture.dispose()); return; }
    new ForestGroundPlugin(material, textures);
    material.albedoColor = Color3.White();
    material.markAsDirty(63);
    notice.remove();
  }).catch(error => { notice.textContent = `Ground loading failed: ${String(error)}`; console.error(error); });
  return material;
}
