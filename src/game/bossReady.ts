// A boss readied at its wave: its code loaded (entities/bosses.ts) and its programs warmed (game/warmup.ts
// `warmFoes`) as Continue leads into the wave it holds, under the fight's loading bar, so nothing of a boss is loaded
// or compiled before a run reaches it (from the owner: "if its not boss wave, why load the boss info"), and nothing
// compiles in the fight. Every game readies its own: each player's Continue waits for it before its vote counts, and a
// game whose player isn't voting (out of the run, watching) readies it as the wave's countdown begins, the boss's spawn
// held until it's warm (game/run.ts) and a guest's copy made once it is (net/sync.ts).
import { G } from '../state';
import { bossOfWave, type BiomeId } from '../data/biomes';
import { ENEMIES, type EnemyId } from '../data/enemies';
import { isLazyFoe } from '../entities/bosses';
import { foeWarm, warmFoes } from './warmup';
import { readyingWhile } from './warm';
import { READYING } from '../ui/readying';

/** The foes wave `wave` of `biome` brings that are loaded at their wave: its boss, its twin and what they bring into
 *  their fight (`EnemyDef.broughtBy`: the Rootmother's seed pods). */
export function bossesOf(biome: BiomeId, wave: number): EnemyId[] {
  const boss = bossOfWave(biome, wave);
  if (!boss) return [];
  const bosses: EnemyId[] = [boss.id, ...(boss.twin ? [boss.twin] : [])];
  const brought = (Object.keys(ENEMIES) as EnemyId[]).filter((id) => bosses.includes(ENEMIES[id].broughtBy as EnemyId));
  return [...bosses, ...brought].filter(isLazyFoe);
}

/** Whether wave `wave` of `biome` can begin with nothing of its boss to load or warm. */
export const bossReady = (biome: BiomeId, wave: number): boolean => bossesOf(biome, wave).every(foeWarm);

/** the readyings under way, by the bosses they ready */
const readying = new Map<string, Promise<void>>();

/** Wave `wave`'s bosses in `biome` loaded and warmed, under the fight's loading bar ("Readying the Ossuary Twins"). */
export function readyBoss(biome: BiomeId, wave: number): Promise<void> {
  const ids = bossesOf(biome, wave).filter((id) => !foeWarm(id));
  if (!ids.length) return Promise.resolve();
  const key = ids.join(',');
  let ready = readying.get(key);
  if (!ready) {
    const name = bossOfWave(biome, wave)?.short ?? ENEMIES[ids[0]].name;
    ready = readyingWhile(READYING.boss(name), (progress) => warmFoes(ids, progress))
      .finally(() => readying.delete(key));
    readying.set(key, ready);
  }
  return ready;
}

/** The run's next wave's bosses readied (`readyBoss`), where they come in the battleground it's fought in. */
export const readyNextBoss = (wave: number): Promise<void> => readyBoss(G.arena.biome, wave);

/** Every boss's code loaded and warmed, no bar (the lab's boot, which warms everything at once). */
export function readyEveryBoss(): Promise<void> {
  const ids = (Object.keys(ENEMIES) as EnemyId[]).filter(isLazyFoe);
  return warmFoes(ids, () => undefined);
}

/** Whether every boss is warm (the lab's boot waits for it with every need). */
export const everyBossWarm = (): boolean => (Object.keys(ENEMIES) as EnemyId[]).filter(isLazyFoe).every(foeWarm);
