// The bosses' code, each a chunk of its own (entities/bosses/<file>.ts: its model, its fx, its way of fighting, its
// sounds), loaded at its wave and no sooner (from the owner: "we should lazy load mobs too, if its not boss wave, why
// load the boss info"): game/bossReady.ts loads and warms one under the fight's loading bar as Continue leads into its
// wave. The plain foes are loaded with the game (entities/allFoes.ts) and warmed behind the lobby.
import { FOE_FILE, type EnemyId } from '../data/enemies';

/** each boss's file, to load */
const CHUNKS = import.meta.glob('./bosses/*.ts');
const chunkOf = (id: EnemyId): string => `./bosses/${FOE_FILE[id]}.ts`;

/** the boss files loaded (or loading) */
const loading = new Map<string, Promise<void>>();
const loaded = new Set<string>();

/** Whether `id` is a boss loaded at its wave (its file in entities/bosses/). */
export const isLazyFoe = (id: EnemyId): boolean => chunkOf(id) in CHUNKS;

/** Whether `id`'s code is here: a plain foe always, a boss once its file has loaded. */
export const foeLoaded = (id: EnemyId): boolean => !isLazyFoe(id) || loaded.has(chunkOf(id));

/** `id`'s code loaded (at once for a plain foe). */
export function loadFoe(id: EnemyId): Promise<void> {
  if (foeLoaded(id)) return Promise.resolve();
  const chunk = chunkOf(id);
  let load = loading.get(chunk);
  if (!load) {
    load = CHUNKS[chunk]().then(() => { loaded.add(chunk); });
    loading.set(chunk, load);
  }
  return load;
}

/** every boss that has a file of its own (the lab's boot loads them all, as it warms every need) */
export const lazyFoes = (ids: EnemyId[]): EnemyId[] => ids.filter(isLazyFoe);
