import { Color3, Mesh, Scene, Vector3, VertexData } from '@babylonjs/core';
import { seededRandom } from '../../../world/generation/random';

export type Geometry = { positions: number[]; indices: number[]; normals: number[]; colors: number[]; uvs: number[]; recordOnly?: boolean; capture?: PineTube[] };
export type Settings = { seed: number; width: number; density: number; crownBase: number; groups: number; fill: number };
export type PineTube = {
  points: Vector3[];
  radii: number[];
  sides: number;
  shade: number;
};

export type PineShoot = {
  start: Vector3;
  direction: Vector3;
  length: number;
  fullness: number;
};

export type PineBlueprint = {
  settings: Settings;
  tubes: PineTube[];
  shoots: PineShoot[];
};

const empty = (): Geometry => ({ positions: [], indices: [], normals: [], colors: [], uvs: [] });
function tube(data: Geometry, points: Vector3[], radii: number[], sides: number, shade: number): void {
  data.capture?.push({
    points: points.map(point => point.clone()),
    radii: [...radii],
    sides,
    shade
  });

  if (data.recordOnly) return;
  const first = data.positions.length / 3; let distance = 0;
  for (let ring = 0; ring < points.length; ring++) {
    if (ring) distance += Vector3.Distance(points[ring], points[ring - 1]);
    const tangent = points[Math.min(points.length - 1, ring + 1)].subtract(points[Math.max(0, ring - 1)]).normalize();
    const helper = Math.abs(tangent.y) > 0.95 ? Vector3.Right() : Vector3.Up();
    const side = Vector3.Cross(tangent, helper).normalize(), other = Vector3.Cross(tangent, side).normalize();
    for (let vertex = 0; vertex <= sides; vertex++) {
      const angle = vertex / sides * Math.PI * 2, radial = side.scale(Math.cos(angle)).add(other.scale(Math.sin(angle)));
      const p = points[ring].add(radial.scale(radii[ring]));
      data.positions.push(p.x, p.y, p.z); data.normals.push(radial.x, radial.y, radial.z); data.colors.push(shade, shade, shade, 1);
      data.uvs.push(vertex / sides * Math.PI * radii[ring] * 2 / 1.5, distance / 1.5);
      if (ring < points.length - 1 && vertex < sides) {
        const a = first + ring * (sides + 1) + vertex, b = a + 1, c = a + sides + 1, d = c + 1;
        data.indices.push(a, b, c, b, d, c);
      }
    }
  }
}
function needle(data: Geometry, base: Vector3, tip: Vector3, width: number, outward: Vector3, color: Color3): void {
  if (data.recordOnly) return;
  const axis = tip.subtract(base).normalize(); let edge = Vector3.Cross(axis, outward);
  if (edge.lengthSquared() < 0.00001) edge = Vector3.Cross(axis, Vector3.Up());
  if (edge.lengthSquared() < 0.00001) edge = Vector3.Right();
  edge.normalize().scaleInPlace(width / 2); const first = data.positions.length / 3, normal = outward.normalize();
  for (const p of [base.subtract(edge), base.add(edge), tip]) {
    data.positions.push(p.x, p.y, p.z); data.normals.push(normal.x, normal.y, normal.z); data.colors.push(color.r, color.g, color.b, 1);
  }
  data.uvs.push(0, 0, 1, 0, 0.5, 1); data.indices.push(first, first + 1, first + 2);
}
export function meshFrom(scene: Scene, name: string, data: Geometry): Mesh {
  const vertex = new VertexData(); vertex.positions = data.positions; vertex.indices = data.indices; vertex.normals = data.normals; vertex.colors = data.colors; vertex.uvs = data.uvs;
  const mesh = new Mesh(name, scene); vertex.applyToMesh(mesh); mesh.isPickable = false; mesh.receiveShadows = true; return mesh;
}
export function generate(settings: Settings, recordOnly = false): {
  wood: Geometry;
  needles: Geometry;
  shoots: number;
  branchlets: number;
  majorBranches: number;
  blueprint: PineBlueprint;
} {
  const random = seededRandom(settings.seed), wood = empty(), needles = empty();

  const tubeRecords: PineTube[] = [];
  const shootRecords: PineShoot[] = [];

  wood.capture = tubeRecords;
  wood.recordOnly = recordOnly;
  needles.recordOnly = recordOnly;
  const height = 18, leanX = (random() - 0.5) * 0.65, leanZ = (random() - 0.5) * 0.45;
  const trunk = (y: number) => new Vector3(leanX * (y / height) ** 1.5, y, leanZ * (y / height) ** 1.7);
  const trunkPoints: Vector3[] = [], trunkRadii: number[] = [];
  for (let ring = 0; ring <= 14; ring++) {
    const t = ring / 14; trunkPoints.push(trunk(height * t)); trunkRadii.push(0.018 + 0.31 * (1 - t) ** 1.05 + (ring === 0 ? 0.13 : ring === 1 ? 0.035 : 0));
  }
  tube(wood, trunkPoints, trunkRadii, 10, 1);
  let shoots = 0, branchlets = 0;
  function shoot(start: Vector3, direction: Vector3, length: number, fullness = 1): void {
    const axis = direction.normalize(), end = start.add(axis.scale(length));

    shootRecords.push({
      start: start.clone(),
      direction: axis.clone(),
      length,
      fullness
    });
    tube(wood, [start, Vector3.Lerp(start, end, 0.5), end], [0.012, 0.008, 0.003], 4, 0.9);
    const helper = Math.abs(axis.y) > 0.95 ? Vector3.Right() : Vector3.Up();
    const side = Vector3.Cross(axis, helper).normalize(), other = Vector3.Cross(axis, side).normalize();
    const nodes = Math.max(5, Math.round(8 * settings.density * fullness));
    for (let node = 0; node < nodes; node++) {
      const t = 0.07 + node / nodes * 0.87, center = start.add(axis.scale(length * t)), spiral = node * 2.399963 + random() * 0.45;
      for (let bundle = 0; bundle < 3; bundle++) {
        const angle = spiral + bundle * Math.PI * 2 / 3, radial = side.scale(Math.cos(angle)).add(other.scale(Math.sin(angle)));
        const attachment = center.add(radial.scale(0.006));
        for (let n = 0; n < 2; n++) {
          const outward = radial.add(side.scale((n - 0.5) * 0.22)).normalize();
          const length = (0.115 + random() * 0.075) * (0.85 + Math.sin(t * Math.PI) * 0.2);
          const tip = attachment.add(outward.scale(length * 0.78)).add(axis.scale(length * 0.65)), tone = 0.78 + random() * 0.35;
          needle(needles, attachment, tip, 0.009 + random() * 0.005, outward, new Color3(0.18 * tone, 0.30 * tone, 0.13 * tone));
        }
      }
    }
    shoots++;
  }
  const sample = (path: Vector3[], t: number) => {
    const value = Math.max(0, Math.min(1, t)) * (path.length - 1), index = Math.min(path.length - 2, Math.floor(value));
    return Vector3.Lerp(path[index], path[index + 1], value - index);
  };
  // A single ordered sequence of branch attachments: no shared horizontal whorls.
  const majorBranches = settings.groups * 5;
  const gaps = Array.from({ length: majorBranches - 1 }, () => 0.65 + random() * 0.7);
  const gapTotal = gaps.reduce((sum, value) => sum + value, 0);
  let cumulative = 0;
  const startY = height * settings.crownBase, endY = height - 0.22;
  const phase = random() * Math.PI * 2;
  for (let branch = 0; branch < majorBranches; branch++) {
    if (branch) cumulative += gaps[branch - 1];
    const crownT = cumulative / gapTotal, y = startY + crownT * (endY - startY);
    const taper = Math.max(0.1, 1 - crownT * 0.76);
    const span = settings.width * (1 - crownT) ** 0.72 + 0.09;
    const angle = phase + branch * 2.399963 + (random() - 0.5) * 0.6;
    const radial = new Vector3(Math.cos(angle), 0, Math.sin(angle));
    const length = span * (0.78 + random() * 0.34), start = trunk(y);
    const droop = (0.3 + random() * 0.55) * (1 - crownT);
    const upturn = 0.20 + random() * 0.55;
    const sideways = new Vector3(-radial.z, 0, radial.x), limb: Vector3[] = [];
    for (let joint = 0; joint <= 5; joint++) {
      const t = joint / 5, p = start.add(radial.scale(length * t));
      p.y += (-droop * Math.sin(t * Math.PI * 0.8) + upturn * t ** 3) * taper;
      p.addInPlace(sideways.scale(Math.sin(t * Math.PI) * (random() - 0.5) * 0.13)); limb.push(p);
    }
    const radius = 0.055 * (1 - crownT * 0.75);
    tube(wood, limb, limb.map((_, i) => radius * (1 - i / 6) + 0.004), 5, 0.93);
    const pairs = crownT > 0.82 ? 1 : crownT > 0.65 ? 2 : settings.fill > 0.8 ? 4 : 3;
    for (let pair = 0; pair < pairs; pair++) {
      const attachment = sample(limb, 0.18 + pair / pairs * 0.65);
      for (const sign of [-1, 1]) {
        if (crownT < 0.08 && random() < 0.04) continue;
        const extension = (0.42 + length * 0.16) * (0.75 + random() * 0.4) * taper;
        const vertical = -0.32 + random() * 0.85;
        const direction = radial.scale(0.45).add(sideways.scale(sign * 0.8)).add(new Vector3(0, vertical, 0)).normalize();
        const end = attachment.add(direction.scale(extension));
        tube(wood, [attachment, Vector3.Lerp(attachment, end, 0.5), end], [0.018 * taper, 0.011 * taper, 0.003], 4, 0.88);
        if (settings.fill < 0.1) {
          const tufts = Math.max(2, Math.round(3 * settings.density));
          for (let tuft = 0; tuft < tufts; tuft++) {
            const t = 0.22 + tuft / tufts * 0.69;
            const direction2 = direction.add(radial.scale((tuft % 2 ? -1 : 1) * 0.35)).add(new Vector3(0, -0.10 + random() * 0.55, 0)).normalize();
            shoot(Vector3.Lerp(attachment, end, t), direction2, (0.34 + random() * 0.22) * taper);
          }
        } else {
          const count = Math.max(2, Math.round((2.1 + settings.fill) * (crownT > 0.8 ? 0.65 : 1)));
          for (let twig = 0; twig < count; twig++) {
            const t = 0.18 + twig / count * 0.68, joint = Vector3.Lerp(attachment, end, t);
            const twigSide = Vector3.Cross(direction, Vector3.Up()).normalize(), alternate = twig % 2 ? -1 : 1;
            const twigDirection = direction.scale(0.55).add(twigSide.scale(alternate * 0.75)).add(new Vector3(0, -0.25 + random() * 0.7, 0)).normalize();
            const twigLength = (0.28 + random() * 0.18) * (1 + settings.fill * 0.12) * taper, twigEnd = joint.add(twigDirection.scale(twigLength));
            tube(wood, [joint, twigEnd], [0.011 * taper, 0.003], 4, 0.87); branchlets++;
            shoot(joint, twigDirection, twigLength, 0.85);
            shoot(twigEnd, twigDirection.add(new Vector3(0, -0.08 + random() * 0.45, 0)), (0.36 + random() * 0.16) * taper);
            if (settings.fill > 1.35 && twig % 2 === 0) shoot(Vector3.Lerp(joint, twigEnd, 0.55), radial.add(twigSide.scale(-alternate * 0.6)).add(new Vector3(0, -0.12 + random() * 0.4, 0)), 0.32 * taper, 0.85);
          }
        }
        shoot(end, direction.add(new Vector3(0, 0.18, 0)), (0.44 + random() * 0.18) * taper);
      }
    }
    shoot(limb[5], radial.add(new Vector3(0, 0.20 + random() * 0.45, 0)), (0.52 + random() * 0.18) * taper);
  }
  // Continuous terminal foliage around the same leader, not a detached top tuft.
  for (let tip = 0; tip < 13; tip++) {
    const t = tip / 12, y = 16.65 + t * 1.35, angle = phase + tip * 2.399963;
    const lateral = 0.5 * (1 - t) + 0.08;
    shoot(trunk(y), new Vector3(Math.cos(angle) * lateral, 0.6 + t * 0.4, Math.sin(angle) * lateral), 0.42 - t * 0.18, 0.8);
  }
  for (let limb = 0; limb < 3; limb++) {
    const angle = limb * 2.4 + random() * 0.5, start = trunk(height * settings.crownBase * (0.5 + limb * 0.14));
    const end = start.add(new Vector3(Math.cos(angle) * (0.65 + random() * 0.35), -0.15, Math.sin(angle) * (0.65 + random() * 0.35)));
    tube(wood, [start, Vector3.Lerp(start, end, 0.55), end], [0.025, 0.014, 0.003], 5, 0.85);
  }
  return {
    wood,
    needles,
    shoots,
    branchlets,
    majorBranches,
    blueprint: { settings: { ...settings }, tubes: tubeRecords, shoots: shootRecords }
  };
}
