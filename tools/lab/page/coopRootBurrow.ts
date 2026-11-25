// The Rootmother's burrow in co-op (tools/lab `coop --scenarios rootburrow`; entities/rootBurrow.ts): both heroes
// stand far off her, her cage and heart held off, so she burrows to the one she goes for; what each game shows of it
// is read for the judge (`describeRootBurrow` in node/coopJudge.mjs). Loaded as the scenario starts (page/coop.ts), so
// a tree without the burrow still loads coop's module.
import { G } from '../../../src/state';
import { ROOTMOTHER } from '../../../src/data/foes/rootmother';
import { BURROW_LOG } from '../../../src/entities/rootBurrow';
import { FX } from '../../../src/entities/enemyAI';

/** What a game shows of her burrow in a frame: her place, how far under the floor her body is drawn and her roots'
 *  dive, whether she's struck-proof, and the burrow it has heard of last (where she rises, how long she travels). */
export interface BurrowSample {
  at: [number, number] | null;
  depth: number;
  dive: number;
  proof: boolean;
  to: [number, number] | null;
  travel: number;
}

/** The Rootmother on this game, or null. */
const her = () => G.enemies.find((e) => e.alive && e.type === 'rootmother') ?? null;

/** Her burrow as this game shows it now. */
export function burrowNow(): BurrowSample {
  const e = her();
  const bury = e?.model.root.userData.bury as { dive: number; depth: number } | undefined;
  const log = BURROW_LOG[BURROW_LOG.length - 1];
  return {
    at: e ? [e.pos.x, e.pos.z] : null,
    depth: bury?.depth ?? 0,
    dive: bury?.dive ?? 0,
    proof: e?.invulnerable ?? false,
    to: log ? [log.toX, log.toZ] : null,
    travel: log?.travel ?? 0,
  };
}

/** The host each frame: her cage and her heart held off (both heroes stand still), her wait to burrow given over. */
export function hostFrame(): void {
  const e = her();
  if (!e) return;
  e.dazed = 0;
  e.brain.cageT = 1e9;
  e.brain.heartT = 1e9;
  if (!e.brain.burrowing) e.brain.burrowT = Math.min(e.brain.burrowT ?? 0, 0);
  e.brain.farT = Math.max(e.brain.farT ?? 0, ROOTMOTHER.burrow.farFor);
}

/** this game's own `burrow` fx while the canary has it deaf (her burrow never shown here) */
let heard: typeof FX.burrow | null = null;

/** The canary set or cleared for this game: deaf to the host's word of her burrow. */
export function deafToBurrow(on: boolean): void {
  if (on && !heard) {
    heard = FX.burrow;
    FX.burrow = () => {};
  } else if (!on && heard) {
    FX.burrow = heard;
    heard = null;
  }
}
