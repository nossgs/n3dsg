export const pineAsset = {
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
