# Game asset organization

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
