import { Color3, Material, Mesh, MeshBuilder, Quaternion, Scene, ShadowGenerator, StandardMaterial, Texture, Vector3, VertexBuffer, VertexData } from '@babylonjs/core';
import { createForestMaterial } from '../../graphics/forestMaterials';
import { seededRandom } from '../generation/random';
import { groundHeight } from '../terrain/terrain';
const base = (import.meta as ImportMeta & { env: { BASE_URL: string } }).env.BASE_URL;
type Template = { wood: Mesh; leaves: Mesh };

export function buildTrees(scene: Scene, shadows: ShadowGenerator): void {
  // Wait for actual foliage artwork before generating the visible trees.
  void loadFoliage(scene).then(foliage => {
    if (!scene.isDisposed) populate(scene, shadows, foliage);
  }).catch(error => {
    console.error(error);
    const notice = document.createElement('div');
    notice.style.cssText = 'position:fixed;top:48px;left:12px;z-index:50;background:#382014dd;color:white;padding:8px;font:12px monospace';
    notice.textContent = `Forest foliage failed: ${String(error)}`; document.body.appendChild(notice);
  });
}
async function loadFoliage(scene: Scene): Promise<StandardMaterial> {
  const response = await fetch(`${base}assets/forest/manifest.json`);
  if (!response.ok) throw new Error(`Asset manifest HTTP ${response.status}`);
  const data = await response.json() as { materials: Record<string, { maps: { albedo: string; alpha: string } }> };
  const maps = data.materials.foliage?.maps;
  if (!maps?.albedo || !maps.alpha) throw new Error('Run Import forest assets for the pine twig artwork.');
  const load = (path: string, gamma: boolean): Promise<Texture> => new Promise((resolve, reject) => {
    const texture = new Texture(`${base}assets/forest/${path}`, scene, false, false, Texture.TRILINEAR_SAMPLINGMODE,
      () => resolve(texture), message => reject(new Error(`${path}: ${message ?? 'texture failed'}`)));
    texture.gammaSpace = gamma; texture.anisotropicFilteringLevel = 2;
    texture.wrapU = texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  });
  const [color, alpha] = await Promise.all([load(maps.albedo, true), load(maps.alpha, false)]);
  const material = new StandardMaterial('pine-needle-cutouts', scene);
  material.diffuseTexture = color; material.opacityTexture = alpha; alpha.getAlphaFromRGB = true;
  material.diffuseColor = Color3.White(); material.specularColor = Color3.Black();
  material.backFaceCulling = false; material.twoSidedLighting = true;
  material.transparencyMode = Material.MATERIAL_ALPHATEST;
  material.alphaCutOff = 0.45;
  return material;
}
function populate(scene: Scene, shadows: ShadowGenerator, foliage: StandardMaterial): void {
  const bark = createForestMaterial(scene, 'bark');
  function branch(start: Vector3, end: Vector3, diameter: number, detail: number): Mesh {
    const delta = end.subtract(start), length = delta.length();
    const mesh = MeshBuilder.CreateCylinder('branch', { height: length, diameterBottom: diameter, diameterTop: diameter * 0.55, tessellation: detail }, scene);
    mesh.position.copyFrom(start.add(end).scale(0.5));
    const up = delta.normalize(), helper = Math.abs(up.y) > 0.95 ? Vector3.Right() : Vector3.Up();
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
  function makeTemplate(variant: number, distant: boolean): Template {
    const random = seededRandom(7619 + variant * 217);
    const height = 18 + variant * 2.2;
    const leanX = (random() - 0.5) * 1.8, leanZ = (random() - 0.5) * 1.2;
    const wood: Mesh[] = [];
    const positions: number[] = [], indices: number[] = [], uvs: number[] = [], colors: number[] = [];
    const axisPoint = (y: number) => new Vector3(leanX * (y / height) ** 1.6, y, leanZ * y / height);
    const broken = variant === 3;
    const trunkTop = broken ? height * 0.84 : height;
    const trunkSteps = distant ? 2 : 4;
    for (let segment = 0; segment < trunkSteps; segment++) {
      const y0 = trunkTop * segment / trunkSteps, y1 = trunkTop * (segment + 1) / trunkSteps;
      wood.push(branch(axisPoint(y0), axisPoint(y1), (0.78 + variant * 0.045) * (1 - y0 / height * 0.88), distant ? 5 : 7));
    }
    function card(center: Vector3, axis: Vector3, width: number, length: number, angle: number, shade: number): void {
      const helper = Math.abs(axis.y) > 0.95 ? Vector3.Right() : Vector3.Up();
      const side0 = Vector3.Cross(axis, helper).normalize(), side1 = Vector3.Cross(axis, side0).normalize();
      const side = side0.scale(Math.cos(angle)).add(side1.scale(Math.sin(angle))).scale(width / 2);
      const along = axis.scale(length / 2), offset = positions.length / 3;
      const points = [center.subtract(along).subtract(side), center.add(along).subtract(side), center.add(along).add(side), center.subtract(along).add(side)];
      for (const point of points) { positions.push(point.x, point.y, point.z); colors.push(shade, shade, shade, 1); }
      uvs.push(0, 0, 0, 1, 1, 1, 1, 0);
      indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
    }
    const levels = distant ? 5 : 8;
    const crownStart = variant === 1 ? 0.43 : variant === 2 ? 0.28 : 0.34;
    for (let level = 0; level < levels; level++) {
      const fraction = level / levels, y = height * (crownStart + fraction * (0.88 - crownStart));
      if (y > trunkTop - 0.4) continue;
      const spread = height * (0.17 + (variant === 2 ? 0.025 : 0)) * (1 - fraction * 0.82);
      const spokes = distant ? 3 : 4 + (level % 2);
      for (let spoke = 0; spoke < spokes; spoke++) {
        const angle = spoke * Math.PI * 2 / spokes + level * 2.399 + (random() - 0.5) * 0.7;
        const start = axisPoint(y + (random() - 0.5) * 0.65);
        const extent = spread * (0.76 + random() * 0.38);
        const end = start.add(new Vector3(Math.cos(angle) * extent, -0.28 + fraction * 1.0, Math.sin(angle) * extent));
        if (!distant) {
          const elbow = Vector3.Lerp(start, end, 0.55); elbow.y -= 0.18;
          wood.push(branch(start, elbow, 0.12 * (1 - fraction * 0.65), 5));
          wood.push(branch(elbow, end, 0.055 * (1 - fraction * 0.6), 5));
        }
        const axis = end.subtract(start).normalize();
        const groups = distant ? 1 : 3;
        const sparse = variant === 1 && level < 2;
        const missing = sparse && spoke % 3 === 0;
        for (let group = 0; group < groups; group++) {
          const shade = 0.82 + random() * 0.18;
          if (missing) continue;
          const along = distant ? 0.63 : 0.42 + group * 0.23;
          const center = Vector3.Lerp(start, end, along);
          const width = Math.max(0.42, extent * (distant ? 0.82 : 0.46));
          const length = Math.max(0.85, extent * (distant ? 1.2 : 0.65));
          card(center, axis, width, length, 0.18 + spoke * 0.37, shade);
          if (!distant) card(center, axis, width * 0.9, length, Math.PI / 2 + spoke * 0.37, shade);
        }
      }
    }
    if (!distant) {
      for (let limb = 0; limb < 3; limb++) {
        const angle = limb * 2.4 + variant, start = axisPoint(height * (0.19 + limb * 0.035));
        wood.push(branch(start, start.add(new Vector3(Math.cos(angle) * 1.5, -0.5, Math.sin(angle) * 1.5)), 0.08, 5));
      }
    }
    const normals: number[] = []; VertexData.ComputeNormals(positions, indices, normals);
    const data = new VertexData(); data.positions = positions; data.indices = indices; data.normals = normals; data.uvs = uvs; data.colors = colors;
    const leaves = new Mesh(`needle-source-${variant}-${distant}`, scene); data.applyToMesh(leaves); leaves.material = foliage;
    leaves.isVisible = false; leaves.isPickable = false;
    return { wood: merge(wood, `wood-source-${variant}-${distant}`), leaves };
  }
  const near = Array.from({ length: 4 }, (_, i) => makeTemplate(i, false));
  const far = Array.from({ length: 4 }, (_, i) => makeTemplate(i, true));
  for (let i = 0; i < 4; i++) {
    near[i].wood.addLODLevel(80, far[i].wood); near[i].leaves.addLODLevel(80, far[i].leaves);
  }
  const random = seededRandom(27491);
  for (let i = 0; i < 210; i++) {
    const x = (random() - 0.5) * 340, z = (random() - 0.5) * 340;
    if (Math.hypot(x, z - 6) < 21 || (Math.abs(x) < 4 && z < 2)) continue;
    const scale = 0.72 + random() * 0.48, rotation = random() * Math.PI * 2;
    const patch = Math.sin(x / 28) + Math.cos(z / 31);
    const variant = patch > 1.0 ? 1 : patch < -1.0 ? 2 : i % 4;
    for (const [label, source] of [['wood', near[variant].wood], ['needles', near[variant].leaves]] as const) {
      const instance = source.createInstance(`tree-${i}-${label}`);
      instance.position.set(x, groundHeight(x, z), z); instance.scaling.setAll(scale); instance.rotation.y = rotation;
      instance.isPickable = false;
      if (Math.hypot(x, z) < 55) shadows.addShadowCaster(instance);
    }
    if (Math.hypot(x, z) < 60) {
      const collider = MeshBuilder.CreateBox('trunk-collider', { width: 0.7 * scale, depth: 0.7 * scale, height: 10 * scale }, scene);
      collider.position.set(x, groundHeight(x, z) + 5 * scale, z); collider.isVisible = false;
      collider.isPickable = false; collider.checkCollisions = true; collider.computeWorldMatrix(true);
    }
  }
}
