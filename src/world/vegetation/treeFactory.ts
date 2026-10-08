import { Color3, Mesh, MeshBuilder, Scene, ShadowGenerator, StandardMaterial, Vector3, VertexData } from '@babylonjs/core';
import { createForestMaterial } from '../../graphics/forestMaterials';
import { seededRandom } from '../generation/random';
import { groundHeight } from '../terrain/terrain';
type Geometry = { positions: number[]; indices: number[]; uvs: number[]; colors: number[]; normals: number[] };
type Settings = { seed: number; width: number; density: number; crownBase: number; levels: number };
const blank = (): Geometry => ({ positions: [], indices: [], uvs: [], colors: [], normals: [] });
function tube(data: Geometry, points: Vector3[], radii: number[], sides: number, shade: number): void {
  const first = data.positions.length / 3; let distance = 0;
  for (let ring = 0; ring < points.length; ring++) {
    if (ring) distance += Vector3.Distance(points[ring], points[ring - 1]);
    const tangent = points[Math.min(points.length - 1, ring + 1)].subtract(points[Math.max(0, ring - 1)]).normalize();
    const helper = Math.abs(tangent.y) > 0.95 ? Vector3.Right() : Vector3.Up();
    const side = Vector3.Cross(tangent, helper).normalize(), other = Vector3.Cross(tangent, side).normalize();
    for (let vertex = 0; vertex <= sides; vertex++) {
      const angle = vertex / sides * Math.PI * 2;
      const radial = side.scale(Math.cos(angle)).add(other.scale(Math.sin(angle)));
      const p = points[ring].add(radial.scale(radii[ring]));
      data.positions.push(p.x, p.y, p.z); data.normals.push(radial.x, radial.y, radial.z);
      data.uvs.push(vertex / sides * Math.PI * radii[ring] * 2 / 1.5, distance / 1.5); data.colors.push(shade, shade, shade, 1);
      if (ring < points.length - 1 && vertex < sides) {
        const a = first + ring * (sides + 1) + vertex, b = a + 1, c = a + sides + 1, d = c + 1;
        data.indices.push(a, b, c, b, d, c);
      }
    }
  }
}
function blade(data: Geometry, base: Vector3, tip: Vector3, width: number, outward: Vector3, color: Color3): void {
  const axis = tip.subtract(base).normalize(); let edge = Vector3.Cross(axis, outward);
  if (edge.lengthSquared() < 0.00001) edge = Vector3.Cross(axis, Vector3.Up());
  if (edge.lengthSquared() < 0.00001) edge = Vector3.Right();
  edge.normalize().scaleInPlace(width / 2);
  const first = data.positions.length / 3, normal = outward.normalize();
  for (const p of [base.subtract(edge), base.add(edge), tip]) {
    data.positions.push(p.x, p.y, p.z); data.normals.push(normal.x, normal.y, normal.z); data.colors.push(color.r, color.g, color.b, 1);
  }
  data.uvs.push(0, 0, 1, 0, 0.5, 1); data.indices.push(first, first + 1, first + 2);
}
function makeMesh(scene: Scene, name: string, data: Geometry): Mesh {
  const vertex = new VertexData(); vertex.positions = data.positions; vertex.indices = data.indices; vertex.normals = data.normals;
  vertex.uvs = data.uvs; vertex.colors = data.colors;
  const mesh = new Mesh(name, scene); vertex.applyToMesh(mesh); mesh.isPickable = false; mesh.receiveShadows = true; return mesh;
}
function buildPine(settings: Settings): { wood: Geometry; needles: Geometry; shoots: number } {
  const random = seededRandom(settings.seed), wood = blank(), needles = blank();
  const height = 18, leanX = (random() - 0.5) * 0.65, leanZ = (random() - 0.5) * 0.45;
  const trunk = (y: number) => new Vector3(leanX * (y / height) ** 1.5, y, leanZ * (y / height) ** 1.7);
  const trunkPoints: Vector3[] = [], trunkRadii: number[] = [];
  for (let ring = 0; ring <= 14; ring++) {
    const t = ring / 14; trunkPoints.push(trunk(height * t));
    trunkRadii.push(0.018 + 0.31 * (1 - t) ** 1.05 + (ring === 0 ? 0.13 : ring === 1 ? 0.035 : 0));
  }
  tube(wood, trunkPoints, trunkRadii, 10, 1);
  let shoots = 0;
  function shoot(start: Vector3, direction: Vector3, length: number, fullness: number): void {
    const axis = direction.normalize(), end = start.add(axis.scale(length));
    tube(wood, [start, Vector3.Lerp(start, end, 0.5), end], [0.012, 0.008, 0.003], 4, 0.9);
    const helper = Math.abs(axis.y) > 0.95 ? Vector3.Right() : Vector3.Up();
    const side = Vector3.Cross(axis, helper).normalize(), other = Vector3.Cross(axis, side).normalize();
    const nodes = Math.max(5, Math.round(8 * settings.density * fullness));
    for (let node = 0; node < nodes; node++) {
      const t = 0.07 + node / nodes * 0.87, center = start.add(axis.scale(length * t));
      const spiral = node * 2.399963 + random() * 0.45;
      for (let bundle = 0; bundle < 3; bundle++) {
        const angle = spiral + bundle * Math.PI * 2 / 3;
        const radial = side.scale(Math.cos(angle)).add(other.scale(Math.sin(angle)));
        const attachment = center.add(radial.scale(0.006));
        for (let needle = 0; needle < 2; needle++) {
          const outward = radial.add(side.scale((needle - 0.5) * 0.22)).normalize();
          const length = (0.115 + random() * 0.075) * (0.85 + Math.sin(t * Math.PI) * 0.2);
          const tip = attachment.add(outward.scale(length * 0.78)).add(axis.scale(length * 0.65));
          const tone = 0.78 + random() * 0.35;
          blade(needles, attachment, tip, 0.009 + random() * 0.005, outward, new Color3(0.18 * tone, 0.30 * tone, 0.13 * tone));
        }
      }
    }
    shoots++;
  }
  for (let level = 0; level < settings.levels; level++) {
    const crownT = level / settings.levels;
    const y = height * (settings.crownBase + crownT * (0.93 - settings.crownBase)) + (random() - 0.5) * 0.3;
    const span = settings.width * (1 - crownT) ** 0.72 + 0.18;
    const spokes = crownT > 0.73 ? 4 : 5 + level % 2;
    for (let spoke = 0; spoke < spokes; spoke++) {
      const angle = spoke * Math.PI * 2 / spokes + level * 2.399963 + (random() - 0.5) * 0.35;
      const radial = new Vector3(Math.cos(angle), 0, Math.sin(angle));
      const length = span * (0.78 + random() * 0.34), start = trunk(y + (random() - 0.5) * 0.35);
      const droop = 0.6 * (1 - crownT), upturn = 0.35 + crownT * 0.4, limb: Vector3[] = [];
      for (let joint = 0; joint <= 5; joint++) {
        const t = joint / 5, p = start.add(radial.scale(length * t));
        p.y += -droop * Math.sin(t * Math.PI * 0.8) + upturn * t ** 3; limb.push(p);
      }
      const radius = 0.055 * (1 - crownT * 0.75);
      tube(wood, limb, limb.map((_, i) => radius * (1 - i / 6) + 0.004), 5, 0.93);
      const sideways = new Vector3(-radial.z, 0, radial.x), pairs = crownT > 0.73 ? 2 : 3;
      for (let pair = 0; pair < pairs; pair++) {
        const attachment = limb[Math.min(4, pair + 2)];
        for (const sign of [-1, 1]) {
          // Keep a few gaps, but no longer strip the lowest tier so heavily.
          if (level === 0 && random() < 0.06) continue;
          const extension = (0.42 + length * 0.16) * (0.75 + random() * 0.4);
          const direction = radial.scale(0.45).add(sideways.scale(sign * 0.8)).add(new Vector3(0, 0.12 + crownT * 0.2, 0)).normalize();
          const end = attachment.add(direction.scale(extension));
          tube(wood, [attachment, Vector3.Lerp(attachment, end, 0.5), end], [0.018, 0.011, 0.004], 4, 0.88);
          const tuftCount = Math.max(2, Math.round(3 * settings.density));
          for (let tuft = 0; tuft < tuftCount; tuft++) {
            const t = 0.22 + tuft / tuftCount * 0.69;
            const shootStart = Vector3.Lerp(attachment, end, t);
            const twigDirection = direction.add(radial.scale((tuft % 2 ? -1 : 1) * 0.35)).add(new Vector3(0, 0.15, 0)).normalize();
            shoot(shootStart, twigDirection, 0.34 + random() * 0.22, 1);
          }
          shoot(end, direction.add(new Vector3(0, 0.2, 0)), 0.44 + random() * 0.18, 1);
        }
      }
      shoot(limb[5], radial.add(new Vector3(0, 0.35 + crownT * 0.3, 0)), 0.52 + random() * 0.18, 1);
    }
  }
  for (let tip = 0; tip < 7; tip++) {
    const angle = tip * 2.4;
    shoot(trunk(17.3 + tip * 0.08), new Vector3(Math.cos(angle) * 0.3, 1, Math.sin(angle) * 0.3), 0.5, 0.8);
  }
  // Dead limbs stay below the live crown rather than protruding through it.
  for (let limb = 0; limb < 3; limb++) {
    const angle = limb * 2.4 + random() * 0.5;
    const start = trunk(height * settings.crownBase * (0.5 + limb * 0.14));
    const end = start.add(new Vector3(Math.cos(angle) * (0.65 + random() * 0.35), -0.15, Math.sin(angle) * (0.65 + random() * 0.35)));
    tube(wood, [start, Vector3.Lerp(start, end, 0.55), end], [0.025, 0.014, 0.003], 5, 0.85);
  }
  return { wood, needles, shoots };
}
export function buildTrees(scene: Scene, shadows: ShadowGenerator): void {
  const woodMaterial = createForestMaterial(scene, 'bark');
  const needleMaterial = new StandardMaterial('procedural-pine-needles', scene);
  needleMaterial.diffuseColor = Color3.White(); needleMaterial.specularColor = new Color3(0.025, 0.035, 0.02);
  needleMaterial.specularPower = 24; needleMaterial.backFaceCulling = false; needleMaterial.twoSidedLighting = true;
  const settings: Settings = { seed: 7619, width: 3.25, density: 1.15, crownBase: 0.14, levels: 12 };
  let wood: Mesh | undefined, needles: Mesh | undefined, casts = false, visible = true;
  const x = -10, z = -1;
  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;left:12px;top:12px;z-index:60;width:330px;max-height:70vh;overflow:auto;background:#101914ee;color:#eef4e8;padding:12px;border:1px solid #748473;border-radius:5px;font:12px/1.5 monospace;pointer-events:auto';
  document.body.appendChild(panel);
  const title = document.createElement('div'); title.textContent = 'PROCEDURAL CONIFER — FULLER CROWN'; panel.appendChild(title);
  const info = document.createElement('div'); info.textContent = 'Tree x=-10 z=-1. Esc releases mouse. Single-tree visual test; not a forest LOD.'; panel.appendChild(info);
  const fps = document.createElement('div'), counts = document.createElement('div'); panel.append(fps, counts);
  function applyShadows(): void {
    for (const mesh of [wood, needles]) if (mesh) {
      if (casts && mesh.isEnabled()) shadows.addShadowCaster(mesh); else shadows.removeShadowCaster(mesh);
    }
  }
  function rebuild(): void {
    for (const mesh of [wood, needles]) if (mesh) { shadows.removeShadowCaster(mesh); mesh.dispose(); }
    const generated = buildPine(settings);
    wood = makeMesh(scene, 'generated-pine-wood', generated.wood); wood.material = woodMaterial;
    needles = makeMesh(scene, 'generated-pine-needles', generated.needles); needles.material = needleMaterial;
    for (const mesh of [wood, needles]) mesh.position.set(x, groundHeight(x, z), z);
    needles.setEnabled(visible); applyShadows();
    const woody = generated.wood.indices.length / 3, leafy = generated.needles.indices.length / 3;
    counts.style.whiteSpace = 'pre-line';
    counts.textContent = `Seed ${settings.seed} · ${generated.shoots} shoots\nLive crown starts ~${(18 * settings.crownBase).toFixed(1)} m · ${settings.levels} tiers\nWood ${woody.toLocaleString()} tris · needles ${leafy.toLocaleString()} tris\nTotal ${(woody + leafy).toLocaleString()} tris · 2 meshes`;
    console.info('Procedural conifer', { ...settings, shoots: generated.shoots, woodTriangles: woody, needleTriangles: leafy, totalTriangles: woody + leafy });
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const inputs: (() => void)[] = [];
  function slider(label: string, min: number, max: number, step: number, read: () => number, update: (value: number) => void): void {
    const row = document.createElement('label'); row.style.cssText = 'display:block;margin-top:10px';
    const text = document.createElement('span'), input = document.createElement('input');
    input.type = 'range'; input.min = String(min); input.max = String(max); input.step = String(step); input.style.width = '100%';
    const sync = () => { input.value = String(read()); text.textContent = `${label}: ${read().toFixed(2)}`; }; inputs.push(sync); sync();
    input.oninput = () => { update(Number(input.value)); sync(); if (timer) clearTimeout(timer); timer = setTimeout(rebuild, 180); };
    row.append(text, input); panel.appendChild(row);
  }
  slider('Crown width', 2, 4.5, 0.1, () => settings.width, value => settings.width = value);
  slider('Needle density', 0.5, 1.6, 0.05, () => settings.density, value => settings.density = value);
  slider('Live crown start (fraction of height)', 0.08, 0.4, 0.01, () => settings.crownBase, value => settings.crownBase = value);
  slider('Branch tiers', 8, 15, 1, () => settings.levels, value => settings.levels = Math.round(value));
  function button(label: string, click: (button: HTMLButtonElement) => void): void {
    const element = document.createElement('button'); element.textContent = label;
    element.style.cssText = 'display:block;width:100%;margin:8px 0;padding:7px;background:#314232;color:white;border:1px solid #71816e;cursor:pointer';
    element.onclick = () => { if (timer) clearTimeout(timer); click(element); }; panel.appendChild(element);
  }
  button('Generate next seed', () => { settings.seed++; rebuild(); });
  button('Airy baseline proportions', () => { settings.density = 1; settings.crownBase = 0.32; settings.levels = 9; inputs.forEach(sync => sync()); rebuild(); });
  button('Fuller, lower crown', () => { settings.density = 1.15; settings.crownBase = 0.14; settings.levels = 12; inputs.forEach(sync => sync()); rebuild(); });
  button('Needles: ON', element => { visible = !visible; needles?.setEnabled(visible); applyShadows(); element.textContent = `Needles: ${visible ? 'ON' : 'OFF'}`; });
  button('Tree casting shadows: OFF', element => { casts = !casts; applyShadows(); element.textContent = `Tree casting shadows: ${casts ? 'ON' : 'OFF'}`; });
  const marker = MeshBuilder.CreateBox('tree-ground-reference', { width: 2, depth: 2, height: 0.02 }, scene);
  marker.position.set(x, groundHeight(x, z) + 0.015, z); marker.isPickable = false;
  const markerMaterial = new StandardMaterial('tree-ground-reference-material', scene); markerMaterial.diffuseColor = new Color3(0.85, 0.2, 0.1); marker.material = markerMaterial;
  rebuild(); let elapsed = 0;
  scene.onAfterRenderObservable.add(() => {
    elapsed += scene.getEngine().getDeltaTime();
    if (elapsed > 500) { fps.textContent = `${Math.round(scene.getEngine().getFps())} FPS · ground/shelter unchanged`; elapsed = 0; }
  });
  scene.onDisposeObservable.add(() => { if (timer) clearTimeout(timer); panel.remove(); markerMaterial.dispose(); needleMaterial.dispose(); woodMaterial.dispose(); });
}
