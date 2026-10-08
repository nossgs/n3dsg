import type { AssetCategory, AssetDescriptor } from './types';
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
