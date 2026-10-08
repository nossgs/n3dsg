import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const worldPath = 'src/world/vegetation/treeFactory.ts';
const source = await readFile(resolve(root, worldPath), 'utf8');
const generatorPath = 'src/assets/trees/pine/generator.ts';
if (source.includes("from '../../assets/trees/pine/generator'")) {
  await access(resolve(root, generatorPath));
  console.log('Asset organization is already applied.');
  process.exit(0);
}
const start = source.indexOf('type Geometry =');
const end = source.indexOf('export function buildTrees(');
if (start < 0 || end < start) throw new Error('Expected current procedural-tree layout not found. No files changed.');
const defaultMatch = source.slice(end).match(/const settings: Settings =\s*({[^;]+});/);
if (!defaultMatch) throw new Error('Cannot locate procedural tree defaults. No files changed.');
const defaults = JSON.parse(defaultMatch[1].replace(/\b([a-zA-Z_]\w*)\s*:/g, '"$1":'));
if (typeof defaults.groups !== 'number' || typeof defaults.fill !== 'number') throw new Error('Expected continuous-crown settings. No files changed.');
let definitions = source.slice(start, end);
for (const text of ['type Geometry =', 'type Settings =', 'function meshFrom(', 'function generate(']) {
  if (!definitions.includes(text)) throw new Error(`Missing expected definition: ${text}. No files changed.`);
}
definitions = definitions.replace('type Geometry =', 'export type Geometry =').replace('type Settings =', 'export type Settings =').replace('function meshFrom(', 'export function meshFrom(').replace('function generate(', 'export function generate(');
const generator = "import { Color3, Mesh, Scene, Vector3, VertexData } from '@babylonjs/core';\n" +
  "import { seededRandom } from '../../../world/generation/random';\n\n" + definitions;
let world = source.slice(end);
world = world.replace(defaultMatch[0], 'const settings: Settings = { ...pineAuthoringDefaults };');
world = "import { Color3, Mesh, MeshBuilder, Scene, ShadowGenerator, StandardMaterial } from '@babylonjs/core';\n" +
  "import { createForestMaterial } from '../../graphics/forestMaterials';\n" +
  "import { groundHeight } from '../terrain/terrain';\n" +
  "import { generate, meshFrom, type Settings } from '../../assets/trees/pine/generator';\n" +
  "import { pineAuthoringDefaults } from '../../assets/trees/pine/presets';\n\n" + world;
const showcase = { ...defaults, width: 3.4, density: 1.55, fill: 1.8, crownBase: 0.18, groups: 15 };
const presets = "import type { Settings } from './generator';\n\n" +
  `export const pineAuthoringDefaults: Readonly<Settings> = Object.freeze(${JSON.stringify(defaults, null, 2)});\n\n` +
  '// Screenshot shape settings; the exact screenshot seed was not recorded.\n' +
  `export const pineShowcasePreset: Readonly<Settings> = Object.freeze(${JSON.stringify(showcase, null, 2)});\n`;
const metadata = `export const pineAsset = {
  id: 'tree.pine.procedural.v1',
  category: 'trees',
  kind: 'procedural',
  displayName: 'Procedural Pine',
  generatorModule: 'src/assets/trees/pine/generator.ts',
  presetsModule: 'src/assets/trees/pine/presets.ts',
  dependencies: ['public/assets/forest/manifest.json'],
  geometryRights: 'Project-generated; project license not specified here.',
  textureRights: 'Poly Haven CC0; see public/assets/forest/ASSET-SOURCES.txt.',
  units: 'meters',
  nominalTrunkHeight: 18,
  anchor: 'trunk base at local origin',
  status: 'visual-reference',
  lods: [],
  performanceNote: 'Detailed near-view reference. Forest LOD and batching not yet supplied.'
} as const;
`;
const types = `export type AssetCategory = 'trees' | 'items' | 'guns' | 'clothes' | 'structures' | 'rocks' | 'textures' | 'audio';
export type AssetDescriptor = {
  readonly id: string;
  readonly category: AssetCategory;
  readonly kind: 'procedural' | 'model' | 'texture' | 'audio';
  readonly displayName: string;
  readonly status: string;
};
`;
const registry = `import type { AssetCategory, AssetDescriptor } from './types';
import { pineAsset } from './trees/pine/metadata';
export const assetRegistry: Readonly<Record<string, AssetDescriptor>> = Object.freeze({
  [pineAsset.id]: pineAsset
});
export function getAsset(id: string): AssetDescriptor {
  const asset = assetRegistry[id];
  if (!asset) throw new Error('Unknown asset: ' + id);
  return asset;
}
export function listAssets(category?: AssetCategory): AssetDescriptor[] {
  return Object.values(assetRegistry).filter(asset => !category || asset.category === category);
}
`;
const docs = `# Game asset organization

## Source definitions
src/assets contains procedural generators, settings, metadata and the asset catalog.
Each reusable asset gets its own folder and stable ID. World code decides where it is placed;
asset code decides what it is. The pine is tree.pine.procedural.v1.

## Static payloads
public/assets contains deployable textures, models and audio. Existing forest and tree imports
remain at their current paths to avoid breaking URLs. The generated pine uses the forest bark
material; it does not depend on the imported pine-runtime.glb.

## Adding an asset
1. Add its definition and metadata under src/assets/<category>/<asset-name>/.
2. Add binary payloads under public/assets/<category>/<asset-name>/ where necessary.
3. Record source, licensing, units, anchor and status.
4. Register a stable ID in src/assets/registry.ts once it is usable.
5. Keep authoring/high-poly source payloads outside the deployable public folder.
6. Record LOD and performance budgets before large-scale placement.

Reserved folders contain no in-game placeholder assets. Gun/item/clothing schemas, gameplay
behavior, loaders and inventory integration are not implemented by creating these folders.

## Pine
The generator is copied from the current working tree without changing its geometry logic.
pineAuthoringDefaults preserves the committed defaults. pineShowcasePreset records the observed
width=3.40, density=1.55, fill=1.80, crownBase=0.18 and groups=15. Its seed inherits the committed
seed because the screenshot seed was not recorded. Existing diagnostic controls remain in
src/world/vegetation/treeFactory.ts. That scene builder still uses pineAuthoringDefaults.

No geometry is baked and no performance improvement is claimed by this refactor.
The asset catalog is organizational; a universal lazy asset loader is not implemented yet.
The earlier high-detail imported GLB remains in public/assets/trees and therefore in deployment
until separately removed. This refactor does not delete it or any other existing payload.
`;
const files = new Map([
  [generatorPath, generator],
  ['src/assets/trees/pine/presets.ts', presets],
  ['src/assets/trees/pine/metadata.ts', metadata],
  ['src/assets/types.ts', types],
  ['src/assets/registry.ts', registry],
  ['src/assets/README.md', docs],
  [worldPath, world]
]);
for (const category of ['items', 'guns', 'clothes', 'structures', 'rocks', 'textures', 'audio']) {
  files.set(`src/assets/${category}/.gitkeep`, '');
  files.set(`public/assets/${category}/.gitkeep`, '');
}
for (const path of files.keys()) {
  if (path === worldPath || path.endsWith('/.gitkeep')) continue;
  try { await access(resolve(root, path)); throw new Error(`Refusing to overwrite existing asset file: ${path}`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
for (const [path, content] of files) {
  const target = resolve(root, path); await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content); console.log(`Wrote ${path}`);
}
console.log('Generator moved unchanged; validate with npm run build before committing.');
