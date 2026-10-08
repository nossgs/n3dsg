import { Color3, DynamicTexture, Material, Mesh, Scene, StandardMaterial, Texture, Vector3, VertexData } from '@babylonjs/core';
import { createForestMaterial } from '../../graphics/forestMaterials';
import { seededRandom } from '../../world/generation/random';
import { generate } from '../trees/pine/generator';
import { pineShowcasePreset } from '../trees/pine/presets';

type Geo = { positions: number[]; indices: number[]; colors: number[]; uvs: number[] };
export type WoodlandAsset = { id: string; label: string; meshes: Mesh[]; triangles: number; trunkRadius?: number };
const empty = (): Geo => ({ positions: [], indices: [], colors: [], uvs: [] });
function vertex(g: Geo, p: Vector3, color: Color3, u = 0, v = 0): void {
  g.positions.push(p.x, p.y, p.z); g.colors.push(color.r, color.g, color.b, 1); g.uvs.push(u, v);
}
function mesh(scene: Scene, name: string, g: Geo, material: Material): Mesh {
  const data = new VertexData(), normals: number[] = [];
  VertexData.ComputeNormals(g.positions, g.indices, normals);
  data.positions = g.positions; data.indices = g.indices; data.normals = normals; data.colors = g.colors; data.uvs = g.uvs;
  const result = new Mesh(name, scene); data.applyToMesh(result);
  result.material = material; result.isPickable = false; result.receiveShadows = true; result.setEnabled(false); return result;
}
function tube(g: Geo, points: Vector3[], radii: number[], color: Color3, sides = 5): void {
  const first = g.positions.length / 3; let distance = 0;
  points.forEach((point, ring) => {
    if (ring) distance += Vector3.Distance(point, points[ring - 1]);
    const axis = points[Math.min(points.length - 1, ring + 1)].subtract(points[Math.max(0, ring - 1)]).normalize();
    const helper = Math.abs(axis.y) > 0.95 ? Vector3.Right() : Vector3.Up();
    const u = Vector3.Cross(axis, helper).normalize(), v = Vector3.Cross(axis, u).normalize();
    for (let side = 0; side <= sides; side++) {
      const angle = side / sides * Math.PI * 2;
      vertex(g, point.add(u.scale(Math.cos(angle) * radii[ring])).add(v.scale(Math.sin(angle) * radii[ring])), color, side / sides, distance / 1.5);
      if (ring < points.length - 1 && side < sides) {
        const a = first + ring * (sides + 1) + side, b = a + 1, c = a + sides + 1;
        g.indices.push(a, b, c, b, c + 1, c);
      }
    }
  });
}
function crossCards(g: Geo, center: Vector3, width: number, height: number, color: Color3, phase = 0): void {
  for (let plane = 0; plane < 3; plane++) {
    const angle = phase + plane * Math.PI / 3, side = new Vector3(Math.cos(angle) * width / 2, 0, Math.sin(angle) * width / 2);
    const up = new Vector3(0, height / 2, 0), first = g.positions.length / 3;
    vertex(g, center.subtract(side).subtract(up), color, 0, 1);
    vertex(g, center.subtract(side).add(up), color, 0, 0);
    vertex(g, center.add(side).add(up), color, 1, 0);
    vertex(g, center.add(side).subtract(up), color, 1, 1);
    g.indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
  }
}
function foliageMaterial(scene: Scene, name: string, needles: boolean): StandardMaterial {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Cannot create foliage atlas.');
  const random = seededRandom(needles ? 311 : 912);
  for (let i = 0; i < (needles ? 900 : 420); i++) {
    const angle = random() * Math.PI * 2, radius = Math.sqrt(random()) * 103;
    const x = 128 + Math.cos(angle) * radius, y = 128 + Math.sin(angle) * radius;
    const green = Math.round(63 + random() * 39);
    ctx.fillStyle = ctx.strokeStyle = `rgb(${Math.round(green * 0.62)},${green},${Math.round(green * 0.43)})`;
    if (needles) {
      ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(angle) * 13, y + Math.sin(angle) * 13); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.ellipse(x, y, 4 + random() * 5, 2 + random() * 3, angle, 0, Math.PI * 2); ctx.fill();
    }
  }
  const texture = new DynamicTexture(name + '-atlas', canvas, scene, true);
  texture.hasAlpha = true; texture.wrapU = texture.wrapV = Texture.CLAMP_ADDRESSMODE; texture.update(false);
  const material = new StandardMaterial(name, scene); material.diffuseTexture = texture; material.useAlphaFromDiffuseTexture = true;
  material.transparencyMode = Material.MATERIAL_ALPHATEST; material.alphaCutOff = 0.3;
  material.specularColor = Color3.Black(); material.backFaceCulling = false; material.twoSidedLighting = true; return material;
}
function solid(scene: Scene, name: string, color: Color3): StandardMaterial {
  const material = new StandardMaterial(name, scene); material.diffuseColor = color; material.specularColor = Color3.Black();
  material.backFaceCulling = false; material.twoSidedLighting = true; return material;
}
export function createWoodlandAssets(scene: Scene): { trees: WoodlandAsset[]; brush: WoodlandAsset[]; grass: WoodlandAsset[]; details: WoodlandAsset[] } {
  const bark = createForestMaterial(scene, 'bark');
  const leaf = foliageMaterial(scene, 'woodland-leaf-prototype', false), needle = foliageMaterial(scene, 'woodland-needle-prototype', true);
  const pale = solid(scene, 'pale-prototype-bark', Color3.White());
  const green = solid(scene, 'grass-prototype', Color3.White()), stone = solid(scene, 'stone-prototype', new Color3(0.43, 0.42, 0.38));
  function asset(id: string, label: string, wood: Geo, foliage: Geo, woodMaterial: Material, foliageMaterial: Material, trunkRadius?: number): WoodlandAsset {
    const meshes: Mesh[] = [];
    if (wood.indices.length) meshes.push(mesh(scene, id + '-wood', wood, woodMaterial));
    if (foliage.indices.length) meshes.push(mesh(scene, id + '-foliage', foliage, foliageMaterial));
    return { id, label, meshes, triangles: (wood.indices.length + foliage.indices.length) / 3, trunkRadius };
  }
  const blueprint = generate({ ...pineShowcasePreset }, true).blueprint;
  const pineWood = empty(), pineLeaves = empty();
  for (const part of blueprint.tubes) if (Math.max(...part.radii) >= 0.032) tube(pineWood, part.points, part.radii, new Color3(part.shade, part.shade, part.shade), Math.max(...part.radii) > 0.15 ? 7 : 4);
  const bins = new Map<string, { sum: Vector3; min: Vector3; max: Vector3; count: number }>();
  for (const shoot of blueprint.shoots) {
    const end = shoot.start.add(shoot.direction.scale(shoot.length)), center = Vector3.Lerp(shoot.start, end, 0.5);
    const key = `${Math.floor(center.x / 1.15)},${Math.floor(center.y / 1.15)},${Math.floor(center.z / 1.15)}`;
    let bin = bins.get(key);
    if (!bin) { bin = { sum: Vector3.Zero(), min: new Vector3(Infinity, Infinity, Infinity), max: new Vector3(-Infinity, -Infinity, -Infinity), count: 0 }; bins.set(key, bin); }
    bin.sum.addInPlace(center); bin.count++;
    for (const point of [shoot.start, end]) { bin.min.minimizeInPlace(point); bin.max.maximizeInPlace(point); }
  }
  for (const bin of bins.values()) {
    const size = bin.max.subtract(bin.min), center = bin.sum.scale(1 / bin.count);
    crossCards(pineLeaves, center, Math.max(0.45, Math.hypot(size.x, size.z) + 0.35), Math.max(0.45, size.y + 0.35), Color3.White(), center.y * 0.7);
  }
  const trees = [asset('tree.pine.cluster.prototype', 'Pine cluster proxy', pineWood, pineLeaves, bark, needle, 0.36)];
  for (let kind = 0; kind < 2; kind++) {
    const wood = empty(), foliage = empty(), random = seededRandom(217 + kind * 81), height = kind ? 13 : 17, radius = kind ? 4.1 : 2.6;
    const trunkPoints = Array.from({ length: 7 }, (_, i) => new Vector3(Math.sin(i * 0.6) * 0.15, height * i / 6, 0));
    tube(wood, trunkPoints, trunkPoints.map((_, i) => 0.035 + (kind ? 0.36 : 0.2) * (1 - i / 7)), kind ? Color3.White() : new Color3(0.74, 0.75, 0.69), 7);
    for (let branch = 0; branch < 12; branch++) {
      const t = branch / 12, angle = branch * 2.399963, y = height * (0.42 + t * 0.48), span = radius * (0.72 + random() * 0.35) * (1 - t * 0.42);
      const start = new Vector3(0, y, 0), end = new Vector3(Math.cos(angle) * span, y + 0.8, Math.sin(angle) * span);
      tube(wood, [start, Vector3.Lerp(start, end, 0.6), end], [0.065 * (1 - t * 0.55), 0.032, 0.006], Color3.White(), 4);
      crossCards(foliage, end, kind ? 3.9 : 2.5, kind ? 3.2 : 3.6, new Color3(0.9 + random() * 0.1, 1, 0.9), angle);
    }
    crossCards(foliage, new Vector3(0, height, 0), radius * 1.2, 2.8, Color3.White());
    trees.push(asset(kind ? 'tree.spreading-broadleaf.prototype' : 'tree.slender-broadleaf.prototype', kind ? 'Spreading broadleaf' : 'Slender broadleaf', wood, foliage, kind ? bark : pale, leaf, kind ? 0.38 : 0.22));
  }
  const brush: WoodlandAsset[] = [];
  for (let kind = 0; kind < 2; kind++) {
    const wood = empty(), foliage = empty();
    for (let branch = 0; branch < 6; branch++) {
      const angle = branch * 2.4, end = new Vector3(Math.cos(angle) * 0.65, 0.65 + branch % 3 * 0.3, Math.sin(angle) * 0.65);
      tube(wood, [Vector3.Zero(), end], [0.02, 0.005], Color3.White(), 3);
      crossCards(foliage, end, kind ? 1.1 : 0.9, kind ? 1.4 : 0.75, new Color3(0.9, 0.95, 0.8), angle);
    }
    brush.push(asset('brush.prototype.' + kind, kind ? 'Tall brush' : 'Low shrub', wood, foliage, bark, leaf));
  }
  const grass: WoodlandAsset[] = [];
  for (let kind = 0; kind < 3; kind++) {
    const g = empty(), random = seededRandom(71 + kind);
    for (let blade = 0; blade < 7; blade++) {
      const angle = random() * Math.PI * 2, width = 0.025 + random() * 0.035, height = 0.3 + random() * 0.45;
      const base = new Vector3((random() - 0.5) * 0.45, 0, (random() - 0.5) * 0.45), side = new Vector3(Math.cos(angle) * width, 0, Math.sin(angle) * width);
      const first = g.positions.length / 3;
      vertex(g, base.subtract(side), new Color3(0.18, 0.24, 0.08)); vertex(g, base.add(side), new Color3(0.18, 0.24, 0.08));
      vertex(g, base.add(new Vector3(Math.sin(angle) * 0.2, height, Math.cos(angle) * 0.2)), new Color3(0.32, 0.4, 0.16));
      g.indices.push(first, first + 1, first + 2);
    }
    grass.push(asset('grass.clump.prototype.' + kind, 'Grass clump', empty(), g, bark, green));
  }
  const rock = empty();
  const rockPoints = [new Vector3(-0.6, 0, -0.45), new Vector3(0.55, 0, -0.4), new Vector3(0.5, 0, 0.5), new Vector3(-0.45, 0, 0.55), new Vector3(0.1, 0.7, 0)];
  rockPoints.forEach(point => vertex(rock, point, Color3.White())); rock.indices.push(0, 4, 1, 1, 4, 2, 2, 4, 3, 3, 4, 0, 0, 1, 2, 0, 2, 3);
  const log = empty(); tube(log, [new Vector3(-1.8, 0.25, 0), new Vector3(1.8, 0.25, 0.15)], [0.22, 0.16], Color3.White(), 7);
  const stump = empty(); tube(stump, [Vector3.Zero(), new Vector3(0.03, 0.6, 0)], [0.28, 0.23], Color3.White(), 7);
  const details = [asset('rock.prototype', 'Rock', rock, empty(), stone, green), asset('log.prototype', 'Fallen log', log, empty(), bark, green), asset('stump.prototype', 'Stump', stump, empty(), bark, green)];
  return { trees, brush, grass, details };
}
