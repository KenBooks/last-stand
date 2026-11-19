// Biomes: each has its own arena (world/), enemy roster and ladder of bosses. The wave rules
// (budget, groups, loot) in waves.ts are shared.
import { WAVES } from './waves';
import type { EnemyId } from './enemies';
import type { TrackId } from './music';

export type BiomeId = 'crypt' | 'forest';
/** the player's choice in the lobby: a biome, or a random one each run */
export type BiomeSetting = BiomeId | 'random';

/** A boss on a biome's ladder: who, its short name for the Continue button, and the banner's line on its wave. */
export interface BossRung {
  id: EnemyId;
  short: string;
  banner: string;
}

export interface BiomeDef {
  /** short label for the lobby picker */
  label: string;
  /** full name, shown when a run starts */
  title: string;
  /** enemy pool unlocked at wave `w`, as [enemy, weight] */
  pool(w: number): [EnemyId, number][];
  /** its bosses in the order the boss waves meet them: the first on the first boss wave (`WAVES.bossEvery`) no exception
   *  holds, the second on the next, and round again from the first when the list runs out (each time harder, by
   *  `SCALING`) */
  bosses: BossRung[];
  /** boss waves another boss holds over the ladder (`bossOfWave`): from wave `wave` and every `every` after; the ladder
   *  goes on at the next boss wave none holds */
  bossWaves?: BossWave[];
  /** minimap: shape of the boundary and colour of the spawn gates */
  minimap: { wall: 'octagon' | 'circle'; portal: string };
  /** what the floor (off the dais, which is stone) is made of: an arrow glances off stone and sticks in the rest (the wall's
   *  parts each say their own: `world/wall.ts`) */
  surface: { floor: 'stone' | 'earth' };
  /** its music (data/music.ts): in its lobby and between its runs' waves, and through each wave's fight */
  music: { lobby: TrackId; battle: TrackId };
}

/** A boss wave held by another boss than the biome's own: from wave `wave` (a boss wave) and every `every` waves after
 *  (a multiple of `WAVES.bossEvery`). `twin`: a second boss rising with it, sharing its life (`EnemyDef.shares`).
 *  `short` names it on the Continue button, `banner` under the wave's. */
export interface BossWave {
  wave: number;
  every: number;
  id: EnemyId;
  twin?: EnemyId;
  short: string;
  banner: string;
}

/** A boss wave's boss: who rises, and what the Continue button and the banner say. */
export interface WaveBoss { id: EnemyId; twin?: EnemyId; short: string; banner: string }

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
      { id: 'bellwarden', short: 'Bell-Warden', banner: 'A bell tolls in the dark…' },
    ],
    // (the Ossuary Twins at wave 15, 35, 55...: the ladder holds every other boss wave)
    bossWaves: [{ wave: 15, every: 20, id: 'twinslab', twin: 'twinreliquary', short: 'Ossuary Twins', banner: 'Two rise, bound in bone…' }],
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

/** The exception of `biome`'s that holds boss wave `wave`, if one does. */
const exceptionAt = (biome: BiomeId, wave: number): BossWave | undefined =>
  BIOMES[biome].bossWaves?.find((s) => wave >= s.wave && (wave - s.wave) % s.every === 0);

/**
 * Wave `wave`'s boss in `biome`, or null on a wave that has none: an exception's where one holds it (`bossWaves`), else
 * its ladder's next rung, the ladder going on only at the boss waves it holds (round again past its end).
 */
export function bossOfWave(biome: BiomeId, wave: number): WaveBoss | null {
  if (!isBossWave(wave)) return null;
  const special = exceptionAt(biome, wave);
  if (special) return { id: special.id, twin: special.twin, short: special.short, banner: special.banner };
  let held = 0;
  for (let w = WAVES.bossEvery; w < wave; w += WAVES.bossEvery) if (!exceptionAt(biome, w)) held++;
  const ladder = BIOMES[biome].bosses;
  return ladder[held % ladder.length];
}

/** Every boss a run in `biome` can meet: its ladder's and its exceptions', a twin too, once each. */
export function bossesOf(biome: BiomeId): EnemyId[] {
  const b = BIOMES[biome];
  const ids: EnemyId[] = b.bosses.map((rung) => rung.id);
  for (const s of b.bossWaves ?? []) ids.push(s.id, ...(s.twin ? [s.twin] : []));
  return [...new Set(ids)];
}

/** The boss a fight is counted under (records, trophies): a twin under the boss it rises with. */
export function rungBoss(id: EnemyId): EnemyId {
  for (const b of BIOME_IDS) for (const s of BIOMES[b].bossWaves ?? []) if (s.twin === id) return s.id;
  return id;
}

/** A place the arena shows: a biome a run is fought in, or the village the lobby stands in (data/village.ts). */
export type PlaceId = BiomeId | 'village';

/** The shape of a place's wall: the crypt's octagon, a ring (the thicket's), or none but what's built (the village's
 *  palisade and its entrances, `free`). */
export const wallShape = (place: PlaceId): 'octagon' | 'circle' | 'free' => (place === 'village' ? 'free' : BIOMES[place].minimap.wall);
