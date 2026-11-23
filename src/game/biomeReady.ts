// A fight's biome readied as a run first needs it: built (world/arena.ts `buildBiome`) and its programs warmed
// (game/warmup.ts `warmBiome`) under the fight's loading bar, so the boot builds none of the battlegrounds the
// village never shows (on a phone their builds and seals were tasks of 2 to 5 s each before the lobby showed, traces
// S307-J274, HHKG-FKD9). A run in it waits for it (`beginRun` in main.ts), a co-op guest's too before it joins.
import { G } from '../state';
import { BIOME_IDS, type BiomeId } from '../data/biomes';
import { biomeWarm, warmBiome } from './warmup';
import { isWarm, needShare, readyingWhile, want } from './warm';

/** the next frame (the fight's warm-up's share read once a frame meanwhile) */
const nextFrame = (): Promise<void> => new Promise((resolve) => { requestAnimationFrame(() => resolve()); });
import { READYING } from '../ui/readying';

/** how much of the bar the fight's own warm-up takes, where it's cold as the run's biome is first needed (a first
 *  visit's Start): one bar from the press to the run, where the fight's filled and then the biome's began again */
const FIGHT_SHARE = 0.4;
/** how far along the rest building a biome takes its readying (0 to 1): its warm-up the rest */
const BUILT_SHARE = 0.6;

/** Whether a run can begin in biome `id` with nothing of it to build or warm. */
export const biomeReady = (id: BiomeId): boolean => G.arena.biomeBuilt(id) && biomeWarm(id);

/** the readyings under way, by biome */
const readying = new Map<BiomeId, Promise<void>>();

/** Biome `id` built and warmed, under the fight's loading bar ("Readying the Crypt"). */
export function readyBiome(id: BiomeId): Promise<void> {
  if (biomeReady(id)) return Promise.resolve();
  let ready = readying.get(id);
  if (!ready) {
    ready = readyingWhile(READYING.biome(id), async (progress) => {
      // (the fight's programs first, where they're still cold: its warm-up runs under this bar)
      const fight = isWarm('fight') ? 0 : FIGHT_SHARE;
      if (fight) want('fight');
      while (!isWarm('fight')) {
        progress(fight * needShare('fight'));
        await nextFrame();
      }
      const rest = (share: number): number => fight + (1 - fight) * share;
      progress(rest(0));
      await G.arena.buildBiome(id, (share, glideMs) => progress(rest(BUILT_SHARE * share), glideMs));
      await warmBiome(id, (share) => progress(rest(BUILT_SHARE + (1 - BUILT_SHARE) * share)));
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
