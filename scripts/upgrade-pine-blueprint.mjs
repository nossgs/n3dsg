import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..'
);

const generatorPath = resolve(
  root,
  'src/assets/trees/pine/generator.ts'
);

let source = await readFile(generatorPath, 'utf8');

if (source.includes('export type PineBlueprint')) {
  if (
    !source.includes('recordOnly = false') ||
    !source.includes('shootRecords.push') ||
    !source.includes('blueprint: { settings:')
  ) {
    throw new Error(
      'Generator contains an incomplete blueprint upgrade. ' +
      'Stopping instead of silently skipping it.'
    );
  }

  console.log('Blueprint upgrade is already applied.');
  process.exit(0);
}

function replaceOnce(before, after) {
  const index = source.indexOf(before);

  if (index < 0) {
    throw new Error(
      'Expected generator code not found:\n' +
      before.slice(0, 160) +
      '\nNo generator changes have been written.'
    );
  }

  source =
    source.slice(0, index) +
    after +
    source.slice(index + before.length);
}

replaceOnce(
  'uvs: number[] };',
  'uvs: number[]; recordOnly?: boolean; capture?: PineTube[] };'
);

replaceOnce(
  'const empty =',
  `export type PineTube = {
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

const empty =`
);

replaceOnce(
  'function tube(data: Geometry, points: Vector3[], radii: number[], sides: number, shade: number): void {',
  `function tube(data: Geometry, points: Vector3[], radii: number[], sides: number, shade: number): void {
  data.capture?.push({
    points: points.map(point => point.clone()),
    radii: [...radii],
    sides,
    shade
  });

  if (data.recordOnly) return;`
);

replaceOnce(
  'function needle(data: Geometry, base: Vector3, tip: Vector3, width: number, outward: Vector3, color: Color3): void {',
  `function needle(data: Geometry, base: Vector3, tip: Vector3, width: number, outward: Vector3, color: Color3): void {
  if (data.recordOnly) return;`
);

replaceOnce(
  'export function generate(settings: Settings): { wood: Geometry; needles: Geometry; shoots: number; branchlets: number; majorBranches: number } {',
  `export function generate(settings: Settings, recordOnly = false): {
  wood: Geometry;
  needles: Geometry;
  shoots: number;
  branchlets: number;
  majorBranches: number;
  blueprint: PineBlueprint;
} {`
);

replaceOnce(
  'const random = seededRandom(settings.seed), wood = empty(), needles = empty();',
  `const random = seededRandom(settings.seed), wood = empty(), needles = empty();

  const tubeRecords: PineTube[] = [];
  const shootRecords: PineShoot[] = [];

  wood.capture = tubeRecords;
  wood.recordOnly = recordOnly;
  needles.recordOnly = recordOnly;`
);

replaceOnce(
  'const axis = direction.normalize(), end = start.add(axis.scale(length));',
  `const axis = direction.normalize(), end = start.add(axis.scale(length));

    shootRecords.push({
      start: start.clone(),
      direction: axis.clone(),
      length,
      fullness
    });`
);

replaceOnce(
  'return { wood, needles, shoots, branchlets, majorBranches };',
  `return {
    wood,
    needles,
    shoots,
    branchlets,
    majorBranches,
    blueprint: { settings: { ...settings }, tubes: tubeRecords, shoots: shootRecords }
  };`
);

const metadataPath = resolve(
  root,
  'src/assets/trees/pine/metadata.ts'
);

let metadata = await readFile(metadataPath, 'utf8');

metadata = metadata
  .replace(
    "status: 'visual-reference'",
    "status: 'forest-test'"
  )
  .replace(
    'lods: []',
    "lods: ['near-geometry', 'mid-cutout-shoots', 'far-cutout-clusters']"
  )
  .replace(
    "performanceNote: 'Detailed near-view reference. Forest LOD and batching not yet supplied.'",
    "performanceNote: 'Shared blueprint with approximate foliage LODs. Browser appearance and forest performance require validation.'"
  );

await writeFile(generatorPath, source);
await writeFile(metadataPath, metadata);

console.log(
  'Blueprint upgrade applied: ' +
  'PineTube, PineShoot, PineBlueprint exported; ' +
  'generate(settings, recordOnly) now returns a blueprint.'
);