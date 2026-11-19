// The ranger's Hedgeward in co-op (tools/lab `coop --scenarios wall`): the wall each game shows, read for the judge.
// Loaded as the scenario starts (page/coop.ts), so a tree without the wall still loads coop's module.
import { wards } from '../../../src/world/wards';

/** The wall a game shows in a frame: its line's middle, its life and its most. */
export interface WallSample {
  x: number;
  z: number;
  life: number;
  max: number;
}

/** The first wall standing on this game, or null. */
export function wallNow(): WallSample | null {
  const ward = wards[0];
  if (!ward) return null;
  return { x: (ward.ax + ward.bx) / 2, z: (ward.az + ward.bz) / 2, life: ward.prop.life, max: ward.prop.max };
}
