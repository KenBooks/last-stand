// A fight's biome readied as a run first needs it, where the lobby is the village: built (world/arena.ts
// `buildBiome`) and its programs warmed (game/warmup.ts `warmBiome`) under the fight's loading bar, so the boot builds
// none of the battlegrounds a lobby in the village never shows (on a phone their builds and seals were tasks of 2 to
// 5 s each before the lobby showed, traces S307-J274, HHKG-FKD9). A run in it waits for it (`beginRun` in main.ts), a
// co-op guest's too before it joins; without the village the boot builds them all, as before.
import { G } from '../state';
import { BIOME_IDS, type BiomeId } from '../data/biomes';
import { biomeWarm, warmBiome } from './warmup';
import { readyingWhile } from './warm';
import { READYING } from '../ui/readying';
import { VILLAGE } from '../core/beta';

/** how far along building a biome takes its readying (0 to 1): its warm-up the rest */
const BUILT_SHARE = 0.6;

/** Whether a run can begin in biome `id` with nothing of it to build or warm (without the village the boot built
 *  every biome, and the fight's need warms them). */
export const biomeReady = (id: BiomeId): boolean => !VILLAGE || (G.arena.biomeBuilt(id) && biomeWarm(id));

/** the readyings under way, by biome */
const readying = new Map<BiomeId, Promise<void>>();

/** Biome `id` built and warmed, under the fight's loading bar ("Readying the Crypt"). */
export function readyBiome(id: BiomeId): Promise<void> {
  if (biomeReady(id)) return Promise.resolve();
  let ready = readying.get(id);
  if (!ready) {
    ready = readyingWhile(READYING.biome(id), async (progress) => {
      await G.arena.buildBiome(id);
      progress(BUILT_SHARE);
      await warmBiome(id, (share) => progress(BUILT_SHARE + (1 - BUILT_SHARE) * share));
    }).finally(() => readying.delete(id));
    readying.set(id, ready);
  }
  return ready;
}

/** `act` done once biome `id` is ready: at once if it is, else after `readyBiome`. */
export function afterBiome(id: BiomeId, act: () => void): void {
  if (biomeReady(id)) act();
  else void readyBiome(id).then(act);
}

/** Every biome built and warmed, one after another (the lab's boot, which readies everything at once). */
export async function readyEveryBiome(): Promise<void> {
  for (const id of BIOME_IDS) await readyBiome(id);
}

/** Whether every biome is ready (the lab's boot waits for it with every need). */
export const everyBiomeReady = (): boolean => BIOME_IDS.every(biomeReady);
