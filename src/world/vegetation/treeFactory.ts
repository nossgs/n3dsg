import { Scene, ShadowGenerator } from '@babylonjs/core';
import { buildWoodland } from './woodland';
export function buildTrees(scene: Scene, shadows: ShadowGenerator): void {
  buildWoodland(scene, shadows);
}
