// Biomes: each has its own arena (world/), enemy roster and ladder of bosses. The wave rules
// (budget, groups, loot) in waves.ts are shared.
import type { EnemyId } from './enemies';
import type { TrackId } from './music';
import { WAVES } from './waves';

export type BiomeId = 'crypt' | 'forest';
/** the player's choice in the lobby: a biome, or a random one each run */
export type BiomeSetting = BiomeId | 'random';

/** A boss on a biome's ladder: who, its short name for the Continue button, and the banner's line on its wave; and its
 *  guards, if it comes as an encounter: lesser bosses rising with it (`count` of `id`), each at the life and damage its
 *  own `EnemyDef.asGuard` gives, warding it while they stand (`BossKitDef.ward`). */
export interface BossRung {
  id: EnemyId;
  short: string;
  banner: string;
  /** an encounter's guards: who and how many, and where each rises (x, z in m), the same every time where given */
  guards?: { id: EnemyId; count: number; at?: [number, number][] };
  /** a second boss rising with it, its equal, the two sharing one life (`EnemyDef.shares`): the Ossuary Twins */
  twin?: EnemyId;
}

/** Where the Ossuary Cantor's two guards rise: on the crypt's ring walk (18.5 m out, world/crypt.ts `ringWalk`), across
 *  the arena from each other, 36 degrees off the nearest gates, where its props leave the most room round them (the
 *  diagonals hold its spirit beacons, a guard there 0.6 m off one), the same every time (from play: "the bells should
 *  spawn in the same spots, across from each other on the map, symmetrically, on a path"). */
const GUARD_RING = 18.5, GUARD_ANGLE = 0.8 * Math.PI;
const CANTOR_GUARDS: [number, number][] = [
  [GUARD_RING * Math.cos(GUARD_ANGLE), GUARD_RING * Math.sin(GUARD_ANGLE)],
  [-GUARD_RING * Math.cos(GUARD_ANGLE), -GUARD_RING * Math.sin(GUARD_ANGLE)],
];

export interface BiomeDef {
  /** short label for the lobby picker */
  label: string;
  /** full name, shown when a run starts */
  title: string;
  /** enemy pool unlocked at wave `w`, as [enemy, weight] */
  pool(w: number): [EnemyId, number][];
  /** its bosses in the order the boss waves meet them: the first on the first boss wave (`WAVES.bossEvery`), the
   *  second on the next, and round again from the first when the list runs out (each time harder, by `SCALING`) */
  bosses: BossRung[];
  /** minimap: shape of the boundary and colour of the spawn gates */
  minimap: { wall: 'octagon' | 'circle'; portal: string };
  /** what the floor (off the dais, which is stone) is made of: an arrow glances off stone and sticks in the rest (the wall's
   *  parts each say their own: `world/wall.ts`) */
  surface: { floor: 'stone' | 'earth' };
  /** its music (data/music.ts): in its lobby and between its runs' waves, and through each wave's fight */
  music: { lobby: TrackId; battle: TrackId };
}

export const BIOMES: Record<BiomeId, BiomeDef> = {
  crypt: {
    label: 'Crypt', title: 'The Crypt',
    pool: (w) => {
      const p: [EnemyId, number][] = [['imp', 3], ['husk', 4]];
      if (w >= 2) p.push(['witch', 2 + w * 0.2]);
      if (w >= 3) p.push(['brute', 0.6 + w * 0.12]);
      return p;
    },
    bosses: [
      { id: 'colossus', short: 'Colossus', banner: 'A colossal presence approaches…' },
      // (the second rung is an encounter: the Ossuary Cantor and two Bell-Wardens, its choir and its guards)
      { id: 'cantor', short: 'Ossuary Cantor', banner: 'The choir of the dead assembles…', guards: { id: 'bellwarden', count: 2, at: CANTOR_GUARDS } },
      // (the third: the Ossuary Twins, Slab and Reliquary, one life between them, a chain of bone between them)
      { id: 'twinslab', short: 'Ossuary Twins', banner: 'Two rise, bound in bone…', twin: 'twinreliquary' },
    ],
    minimap: { wall: 'octagon', portal: '#b050ff' },
    surface: { floor: 'stone' },
    music: { lobby: 'shadowed-dusk', battle: 'crypt-motif' },
  },
  forest: {
    label: 'Forest', title: 'The Thornwood',
    pool: (w) => {
      const p: [EnemyId, number][] = [['thornling', 3], ['mossback', 4]];
      if (w >= 2) p.push(['sporecaller', 2 + w * 0.2]);
      if (w >= 3) p.push(['barkhulk', 0.6 + w * 0.12]);
      return p;
    },
    bosses: [{ id: 'thornheart', short: 'Thornheart', banner: 'The old wood wakes…' }],
    minimap: { wall: 'circle', portal: '#70ff60' },
    surface: { floor: 'earth' },
    music: { lobby: 'quiet-beginnings', battle: 'sunlit-battle' },
  },
};

export const BIOME_IDS = Object.keys(BIOMES) as BiomeId[];

/** Whether wave `wave` is a boss wave. */
export const isBossWave = (wave: number): boolean => wave > 0 && wave % WAVES.bossEvery === 0;

/** The boss of `biome`'s boss wave `wave` (its ladder's rung for the wave, round again past its end), null on any other. */
export function bossOfWave(biome: BiomeId, wave: number): BossRung | null {
  if (!isBossWave(wave)) return null;
  const ladder = BIOMES[biome].bosses;
  return ladder[(wave / WAVES.bossEvery - 1) % ladder.length];
}

/** Every boss a run in `biome` can meet (its ladder's, their guards and twins, once each). */
export const bossesOf = (biome: BiomeId): EnemyId[] =>
  [...new Set(BIOMES[biome].bosses.flatMap((rung) => [rung.id, ...(rung.guards ? [rung.guards.id] : []), ...(rung.twin ? [rung.twin] : [])]))];

/** A rung's twin, `id`'s pair counts as its rung's boss (a record, a trophy): the rung's boss for a twin, else `id`. */
export const rungBoss = (id: EnemyId): EnemyId =>
  BIOME_IDS.flatMap((b) => BIOMES[b].bosses).find((rung) => rung.twin === id)?.id ?? id;

/** A place the arena shows: a biome a run is fought in, or the village the lobby stands in (data/village.ts). */
export type PlaceId = BiomeId | 'village';

/** The shape of a place's wall: the crypt's octagon, a ring (the thicket's), or none but what's built (the village's
 *  palisade and its entrances, `free`). */
export const wallShape = (place: PlaceId): 'octagon' | 'circle' | 'free' => (place === 'village' ? 'free' : BIOMES[place].minimap.wall);
