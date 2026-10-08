import type { Settings } from './generator';

export const pineAuthoringDefaults: Readonly<Settings> = Object.freeze({
  "seed": 7619,
  "width": 3.25,
  "density": 1.15,
  "crownBase": 0.14,
  "groups": 12,
  "fill": 1.1
});

// Screenshot shape settings; the exact screenshot seed was not recorded.
export const pineShowcasePreset: Readonly<Settings> = Object.freeze({
  "seed": 7619,
  "width": 3.4,
  "density": 1.55,
  "crownBase": 0.18,
  "groups": 15,
  "fill": 1.8
});
