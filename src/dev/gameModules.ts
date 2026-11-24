// The game's own modules by their paths, for what an invited agent builds into the scene (agentMakes.ts, #529): a
// made thing's `import { boxWithUV } from '../props'` is answered with the game's module as it runs here, the same
// instance the game uses, so a thing is written as the game's own code is (a place's module, world/places/<id>.ts,
// builds as it is). A built game has no modules to import by path, so this is what gives them names.
//
// A preview offers the kits listed here, each a static import of a module its main bundle already holds. A dev build
// (`npm run dev`, the lab) offers every module, by a loader each (`import.meta.glob`, not eager: one the game hasn't
// loaded yet, a foe's of another biome, a screen's, runs when first asked for, as at its first import). Not so in a
// preview: a loader for every module makes each a chunk of its own (a preview's 98 files became 514, its main
// bundle gone), and a preview is where a build's loading is judged, so it must load as production does.
import * as balance from '../data/balance';
import * as dataVillage from '../data/village';
import * as effects from '../fx/effects';
import * as fire from '../world/fire';
import * as ground from '../world/ground';
import * as lights from '../fx/lights';
import * as materials from '../core/materials';
import * as particles from '../fx/particles';
import * as pbr from '../core/pbr';
import * as props from '../world/props';
import * as state from '../state';
import * as textures from '../core/textures';
import * as util from '../util';
import * as villagePlan from '../world/villagePlan';

type GameModule = Record<string, unknown>;

/** the kits every build offers, by their paths from `src` */
// sorted
const KITS: Record<string, GameModule> = {
  'core/materials': materials,
  'core/pbr': pbr,
  'core/textures': textures,
  'data/balance': balance,
  'data/village': dataVillage,
  'fx/effects': effects,
  'fx/lights': lights,
  'fx/particles': particles,
  'state': state,
  'util': util,
  'world/fire': fire,
  'world/ground': ground,
  'world/props': props,
  'world/villagePlan': villagePlan,
};

/** every module's loader in a dev build (the entry, the workers, this mode and the engine's package left out: the
 *  entry would boot a second game); none in a preview, where the branch folds away with its chunks */
const LOADERS: Record<string, () => Promise<GameModule>> = import.meta.env.DEV
  ? import.meta.glob<GameModule>([
    '../**/*.ts', '!../main.ts', '!../**/*.worker.ts', '!../**/*.d.ts', '!../dev/**', '!../engine/pkg/**',
  ])
  : {};

/** Whether `id` names a module of the game's (`src/...`). */
export const isGameModule = (id: string): boolean => id.startsWith('src/');

/** The game's module `id` (`src/world/props`, with or without `.ts`), or undefined where this build offers none. */
async function gameModule(id: string): Promise<GameModule | undefined> {
  const path = id.replace(/^src\//, '').replace(/\.ts$/, '');
  if (KITS[path]) return KITS[path];
  const load = LOADERS[`../${path}.ts`] ?? LOADERS[`../${path}/index.ts`];
  return load?.();
}

/** The kits a preview offers, as a made thing imports them. */
export const gameKits = (): string[] => Object.keys(KITS).map((path) => `src/${path}`);

/** The game's modules named by `ids` (`src/...`), each by its id. Throws naming one this build doesn't offer. */
export async function gameModules(ids: readonly string[]): Promise<Map<string, GameModule>> {
  const loaded = new Map<string, GameModule>();
  for (const id of ids) {
    const found = await gameModule(id);
    if (!found) {
      const which = import.meta.env.DEV ? 'the game has no such module a made thing may import'
        : `a preview offers these alone (a dev build, every module): ${gameKits().join(', ')}`;
      throw new Error(`make: "${id}": ${which}`);
    }
    loaded.set(id, found);
  }
  return loaded;
}
