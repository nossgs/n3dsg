import { Color3, DynamicTexture, Mesh, PBRMaterial, Scene, StandardMaterial, Texture, Vector3 } from '@babylonjs/core';
import { createForestMaterial } from '../../../graphics/forestMaterials';
import { seededRandom } from '../../../world/generation/random';
import { generate, meshFrom, type Geometry, type PineBlueprint, type PineShoot, type PineTube, type Settings } from './generator';
export type PineLevel = { wood: Mesh; foliage: Mesh; triangles: number };
export type PineTemplates = { levels: PineLevel[]; blueprint: PineBlueprint };
export type PineMaterials = { bark: PBRMaterial; needles: StandardMaterial; cutouts: StandardMaterial; atlas: DynamicTexture };
const empty = (): Geometry => ({ positions: [], indices: [], normals: [], uvs: [], colors: [] });
export function createPineMaterials(scene: Scene): PineMaterials {
  const bark = createForestMaterial(scene, 'bark');
  const needles = new StandardMaterial('pine-near-needles', scene);
  needles.diffuseColor = Color3.White(); needles.specularColor = new Color3(0.025, 0.035, 0.02); needles.specularPower = 24;
  needles.backFaceCulling = false; needles.twoSidedLighting = true;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Cannot create pine shoot texture.');
  const random = seededRandom(9517);
  ctx.clearRect(0, 0, 256, 256); ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(74,59,37,1)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(128, 244); ctx.lineTo(128, 20); ctx.stroke();
  for (let node = 0; node < 34; node++) {
    const y = 28 + node * 6.2;
    for (const sign of [-1, 1]) for (let blade = 0; blade < 3; blade++) {
      const spread = (31 + random() * 53) * Math.sin((0.15 + node / 42) * Math.PI);
      const green = Math.round(64 + random() * 32);
      ctx.strokeStyle = `rgba(${Math.round(green * 0.61)},${green},${Math.round(green * 0.43)},1)`;
      ctx.lineWidth = 1.2 + random() * 1.1; ctx.beginPath(); ctx.moveTo(128 + sign * 2, y);
      ctx.lineTo(128 + sign * spread, y - 9 - random() * 23); ctx.stroke();
    }
  }
  const atlas = new DynamicTexture('generated-pine-shoot-cutout', canvas, scene, true);
  atlas.hasAlpha = true; atlas.gammaSpace = true; atlas.wrapU = atlas.wrapV = Texture.CLAMP_ADDRESSMODE; atlas.update(false);
  const cutouts = new StandardMaterial('pine-distance-cutouts', scene);
  cutouts.diffuseTexture = atlas; cutouts.useAlphaFromDiffuseTexture = true;
  cutouts.transparencyMode = StandardMaterial.MATERIAL_ALPHATEST; cutouts.alphaCutOff = 0.3;
  cutouts.specularColor = Color3.Black(); cutouts.backFaceCulling = false; cutouts.twoSidedLighting = true;
  return { bark, needles, cutouts, atlas };
}
function appendTube(data: Geometry, tube: PineTube, level: number): void {
  const maxRadius = Math.max(...tube.radii);
  if (maxRadius < (level === 0 ? 0.016 : level === 1 ? 0.028 : 0.045)) return;
  const selected = tube.points.map((_, i) => i).filter(i => level === 0 || i === 0 || i === tube.points.length - 1 || i % 2 === 0);
  const sides = maxRadius > 0.15 ? (level === 0 ? 8 : level === 1 ? 6 : 5) : level === 0 ? 5 : 3;
  const first = data.positions.length / 3; let distance = 0;
  for (let ring = 0; ring < selected.length; ring++) {
    const index = selected[ring], point = tube.points[index];
    if (ring) distance += Vector3.Distance(point, tube.points[selected[ring - 1]]);
    const axis = tube.points[selected[Math.min(selected.length - 1, ring + 1)]].subtract(tube.points[selected[Math.max(0, ring - 1)]]).normalize();
    const helper = Math.abs(axis.y) > 0.95 ? Vector3.Right() : Vector3.Up();
    const u = Vector3.Cross(axis, helper).normalize(), v = Vector3.Cross(axis, u).normalize();
    for (let vertex = 0; vertex <= sides; vertex++) {
      const angle = vertex / sides * Math.PI * 2, normal = u.scale(Math.cos(angle)).add(v.scale(Math.sin(angle))), p = point.add(normal.scale(tube.radii[index]));
      data.positions.push(p.x, p.y, p.z); data.normals.push(normal.x, normal.y, normal.z); data.colors.push(tube.shade, tube.shade, tube.shade, 1);
      data.uvs.push(vertex / sides * Math.PI * tube.radii[index] * 2 / 1.5, distance / 1.5);
      if (ring < selected.length - 1 && vertex < sides) {
        const a = first + ring * (sides + 1) + vertex, b = a + 1, c = a + sides + 1, d = c + 1;
        data.indices.push(a, b, c, b, d, c);
      }
    }
  }
}
function nearShoot(data: Geometry, shoot: PineShoot, seed: number): void {
  const random = seededRandom(seed), axis = shoot.direction;
  const helper = Math.abs(axis.y) > 0.95 ? Vector3.Right() : Vector3.Up();
  const u = Vector3.Cross(axis, helper).normalize(), v = Vector3.Cross(axis, u).normalize();
  // Fewer needle rings, not fewer supporting shoots.
  for (let node = 0; node < 4; node++) {
    const t = 0.08 + node / 4 * 0.84, center = shoot.start.add(axis.scale(shoot.length * t));
    const spiral = node * 2.399963 + random() * 0.45;
    for (let bundle = 0; bundle < 3; bundle++) for (let n = 0; n < 2; n++) {
      const angle = spiral + bundle * Math.PI * 2 / 3 + (n - 0.5) * 0.15;
      const outward = u.scale(Math.cos(angle)).add(v.scale(Math.sin(angle))), base = center.add(outward.scale(0.006));
      const length = 0.125 + random() * 0.07, tip = base.add(outward.scale(length * 0.78)).add(axis.scale(length * 0.65));
      const edge = Vector3.Cross(tip.subtract(base).normalize(), outward).normalize().scale(0.009);
      const first = data.positions.length / 3, tone = 0.78 + random() * 0.35;
      for (const p of [base.subtract(edge), base.add(edge), tip]) {
        data.positions.push(p.x, p.y, p.z); data.normals.push(outward.x, outward.y, outward.z); data.colors.push(0.18 * tone, 0.30 * tone, 0.13 * tone, 1);
      }
      data.uvs.push(0, 0, 1, 0, 0.5, 1); data.indices.push(first, first + 1, first + 2);
    }
  }
}
function card(data: Geometry, center: Vector3, axis: Vector3, width: number, length: number, angle: number): void {
  const helper = Math.abs(axis.y) > 0.95 ? Vector3.Right() : Vector3.Up();
  const u = Vector3.Cross(axis, helper).normalize(), v = Vector3.Cross(axis, u).normalize();
  const side = u.scale(Math.cos(angle)).add(v.scale(Math.sin(angle))), halfSide = side.scale(width / 2), along = axis.scale(length / 2);
  const first = data.positions.length / 3;
  for (const p of [center.subtract(along).subtract(halfSide), center.add(along).subtract(halfSide), center.add(along).add(halfSide), center.subtract(along).add(halfSide)]) {
    data.positions.push(p.x, p.y, p.z); data.normals.push(side.x, side.y, side.z); data.colors.push(1, 1, 1, 1);
  }
  data.uvs.push(0, 1, 0, 0, 1, 0, 1, 1); data.indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
}
function clusterShoots(shoots: PineShoot[]): PineShoot[] {
  const bins = new Map<string, { sum: Vector3; min: Vector3; max: Vector3; direction: Vector3; count: number }>();
  for (const shoot of shoots) {
    const center = shoot.start.add(shoot.direction.scale(shoot.length / 2));
    const key = `${Math.floor(center.x / 0.65)},${Math.floor(center.y / 0.65)},${Math.floor(center.z / 0.65)}`;
    let bin = bins.get(key);
    if (!bin) { bin = { sum: Vector3.Zero(), min: new Vector3(Infinity, Infinity, Infinity), max: new Vector3(-Infinity, -Infinity, -Infinity), direction: shoot.direction.clone(), count: 0 }; bins.set(key, bin); }
    bin.sum.addInPlace(center); bin.count++;
    bin.min.minimizeInPlace(center.subtract(new Vector3(0.2, 0.2, 0.2)));
    bin.max.maximizeInPlace(center.add(new Vector3(0.2, 0.2, 0.2)));
  }
  return [...bins.values()].map(bin => {
    const center = bin.sum.scale(1 / bin.count), length = Math.max(0.45, Vector3.Distance(bin.min, bin.max) * 0.75);
    return { start: center.subtract(bin.direction.scale(length / 2)), direction: bin.direction, length, fullness: 1 };
  });
}
export function buildPineTemplates(scene: Scene, settings: Settings, materials: PineMaterials, id: string): PineTemplates {
  const blueprint = generate(settings, true).blueprint;
  const farShoots = clusterShoots(blueprint.shoots);
  const levels = [0, 1, 2].map(level => {
    const woodData = empty(), foliageData = empty();
    blueprint.tubes.forEach(tube => appendTube(woodData, tube, level));
    if (level === 0) blueprint.shoots.forEach((shoot, index) => nearShoot(foliageData, shoot, settings.seed + index * 137));
    else (level === 1 ? blueprint.shoots : farShoots).forEach(shoot => {
      const axis = shoot.direction, center = shoot.start.add(axis.scale(shoot.length / 2 + 0.04));
      const planes = level === 1 ? 3 : 2;
      for (let plane = 0; plane < planes; plane++) card(foliageData, center, axis, level === 1 ? 0.38 : shoot.length * 0.65, shoot.length + 0.2, plane * Math.PI / planes);
    });
    const wood = meshFrom(scene, `${id}-wood-${level}`, woodData), foliage = meshFrom(scene, `${id}-foliage-${level}`, foliageData);
    wood.material = materials.bark; foliage.material = level === 0 ? materials.needles : materials.cutouts;
    wood.isVisible = foliage.isVisible = false;
    return { wood, foliage, triangles: (woodData.indices.length + foliageData.indices.length) / 3 };
  });
  return { blueprint, levels };
}
