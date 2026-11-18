// Enemy archetypes (data/biomes.ts says which appear where). `ai` selects a behavior in entities/enemyAI.ts,
// `model` selects a builder in entities/models/index.ts (registered by the foe's own file in entities/foes/).
// Stats are wave-1 values; see SCALING for per-wave growth. Each foe is a file of its own in data/foes/ (its stats, its
// guide note, its trophy), found here: a new foe adds its file and touches no list (each PR adding one appended to the
// same lists in enemies.ts, guide.ts and houses.ts, and conflicted with every other).
import type { EnemyDef } from '../types';
import type { FoeNote } from './guide';
import type { TrophyDef } from './houses';

/** Every foe's id, each added by its own file in data/foes/ (`declare module '../enemies'`), so none is a shared list. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface EnemyIds {}
export type EnemyId = keyof EnemyIds;

/** A foe as its file in data/foes/ gives it: its stats at wave 1, the guide's note on it (every foe a wave brings has
 *  one: the typecheck holds a file to it) and the trophy its fall hangs in the house of records (a boss's, if any). */
export type FoeEntry =
  | { def: EnemyDef & { dummy?: false }; note: FoeNote; trophy?: TrophyDef }
  | { def: EnemyDef & { dummy: true }; note?: undefined; trophy?: undefined };
/** what a file in data/foes/ exports as `FOES` */
export type FoeFile = Partial<Record<EnemyId, FoeEntry>>;

/** every foe's entry, file by file in the folder's order (a foe's kind is its place in it on the wire: the roster is
 *  part of net/protocol.ts) */
const FOE_FILES = import.meta.glob<FoeFile>('./foes/*.ts', { eager: true, import: 'FOES' });
export const FOE_ENTRIES = Object.assign({}, ...Object.values(FOE_FILES)) as Record<EnemyId, FoeEntry>;

/** each foe's file's name in data/foes/ (and in entities/foes/ or entities/bosses/: `twins` for both Twins) */
export const FOE_FILE = Object.fromEntries(Object.entries(FOE_FILES).flatMap(([path, file]) => {
  const name = path.slice('./foes/'.length, -'.ts'.length);
  return Object.keys(file).map((id) => [id, name]);
})) as Record<EnemyId, string>;

export const ENEMIES = Object.fromEntries(
  Object.entries(FOE_ENTRIES).map(([id, entry]) => [id, entry.def]),
) as Record<EnemyId, EnemyDef>;


/** How a boss fights (entities/enemyAI.ts `boss`): its first call for help `summonFirst` s in and then every
 *  `summonEvery` s, `summonCount` of its `summon` each time, while fewer than `crowd` foes stand; it slams when within its
 *  reach and `slamReach` m more; within `volleyReach` m, with a clear line, two volleys (`volleys`: the bolts in each,
 *  `apart` rad between them, the second aimed ahead of the hero), `volleyCooldown` times its cooldown before the next. */
export const BOSS_AI = {
  summonFirst: 6, summonEvery: 14, summonCount: 4, summonRing: 3.5, crowd: 14,
  slamReach: 1.5, volleyReach: 18, volleyCooldown: 1.3,
  volleys: [{ bolts: 7, apart: 0.14 }, { bolts: 5, apart: 0.2 }],
};


// Elite ("hero") modifiers applied on top of a base archetype.
export const HERO = {
  lifeMult: 3.2,
  damageMult: 1.5,
  scale: 1.22,
  score: 5,
  prefixes: ['Grim', 'Dread', 'Ashen', 'Wailing', 'Ruinous', 'Vile', 'Hungering', 'Pale'],
  auraColors: [0xff5030, 0xb050ff, 0x40c8ff, 0xffd040],
};

export const SCALING = {
  life: (w: number) => 1 + 0.24 * (w - 1) + 0.018 * (w - 1) ** 2,
  damage: (w: number) => 1 + 0.11 * (w - 1),
  speed: (w: number) => Math.min(1.25, 1 + 0.012 * (w - 1)),
};
