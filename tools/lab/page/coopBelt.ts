// The Ossuary Twins' belt skulls in co-op (tools/lab `coop --scenarios belt`; entities/twinSkulls.ts): what each game
// shows of them, read for the judge. Loaded as the scenario starts (page/coop.ts), so a tree without the belt skulls
// still loads coop's module.
import { G } from '../../../src/state';
import type { Player } from '../../../src/entities/player';
import { SKULLS_THROWN, type SkullThrown } from '../../../src/entities/twinSkulls';

/** the twins' speed while the lab holds them where they stand (m/s): a foe's seek divides by its reach, and at none
 *  its velocity, its walk's phase and every joint of its model came out NaN, the whole twin drawn nowhere */
const STILL = 1e-3;

/** A belt skull come down on this game this frame: its kind and where. */
export interface SkullLanded { kind: string; x: number; z: number }

/** What a game shows of the belt skulls in a frame: those come down, those lying on its floor (a skull's mesh laid
 *  where it landed), each twin's belt as this game keeps it, and the hurts they dealt this game's own hero. */
export interface BeltSample {
  landed: SkullLanded[];
  lying: SkullLanded[];
  belts: Record<string, { bomb: number; poison: number }>;
  hurts: number;
  /** whether this game's own hero is stunned, and whether its copy of a partner is */
  stunned: boolean;
  partnerStunned: boolean;
  /** the hurts this game's own hero took this frame while a stun already held him */
  heldHurts: number;
}

/** the skulls already sampled as landed, and the hurts already counted */
const seen = new Set<SkullThrown>();
const counted = new Map<SkullThrown, number>();

/** the canary's: this game's skulls taken off its floor as they land, as a game that never laid them */
let unlaid = false;

/** The canary set or cleared for this game. */
export function unlayOnThisGame(on: boolean): void {
  unlaid = on;
}

/** The skull meshes lying on this game's floor, each by its kind (its mesh's name, `belt skull <kind>`), the
 *  canary's taken off it first. */
function lyingNow(): SkullLanded[] {
  const lying = G.scene.children.filter((o) => o.userData.lying);
  if (unlaid) {
    for (const skull of lying) G.scene.remove(skull);
    return [];
  }
  return lying.map((skull) => ({ kind: skull.name.split(' ').pop() ?? '', x: skull.position.x, z: skull.position.z }));
}

/** the heroes whose hurts are watched, and the hurts each took while a stun already held him since last read */
const watched = new WeakMap<Player, { held: number }>();

/** `hero`'s hurts watched: each landing while a stun begun before it holds him counted (the blast's own hurt comes
 *  before its stun). */
function watchHeld(hero: Player): { held: number } {
  const known = watched.get(hero);
  if (known) return known;
  const tally = { held: 0 };
  const takeDamage = hero.takeDamage;
  hero.takeDamage = (...args: Parameters<Player['takeDamage']>) => {
    const result = takeDamage.apply(hero, args);
    if (result && result.taken > 0 && hero.stunned) tally.held++;
    return result;
  };
  watched.set(hero, tally);
  return tally;
}

/** This frame's belt skulls on this game. */
export function beltNow(): BeltSample {
  const landed: SkullLanded[] = [];
  let hurts = 0;
  for (const thrown of SKULLS_THROWN) {
    if (thrown.landed && !seen.has(thrown)) {
      seen.add(thrown);
      landed.push({ kind: thrown.kind, x: thrown.landed.x, z: thrown.landed.z });
    }
    const before = counted.get(thrown) ?? 0;
    hurts += thrown.struck.length - before;
    counted.set(thrown, thrown.struck.length);
  }
  const belts: BeltSample['belts'] = {};
  for (const foe of G.enemies) {
    if (foe.type !== 'twinslab' && foe.type !== 'twinreliquary') continue;
    belts[foe.type] = { bomb: foe.brain.bomb ?? 0, poison: foe.brain.poison ?? 0 };
  }
  const held = watchHeld(G.player);
  const heldHurts = held.held;
  held.held = 0;
  const partnerStunned = G.players.some((hero) => hero !== G.player && hero.stunned);
  return { landed, lying: lyingNow(), belts, hurts, stunned: G.player.stunned, partnerStunned, heldHurts };
}

/**
 * The host's input in the scenario: the twins standing where they rose (out of the slam's and charge's reach of the
 * guest, so their belts are what they throw), their first throws due a second in.
 */
export function holdTwins(frame: number): void {
  for (const foe of G.enemies) {
    if (foe.type !== 'twinslab' && foe.type !== 'twinreliquary') continue;
    (foe as { speed: number }).speed = STILL;
    if (frame === 0) foe.brain.beltT = G.time + 1;
  }
}
