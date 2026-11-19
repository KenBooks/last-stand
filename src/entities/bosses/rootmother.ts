// The Rootmother in the game (her data: data/foes/rootmother.ts; her fight: entities/rootmother.ts): her model and her
// seed pods', the attack effects every game plays (enemyAI.ts `fx`, which co-op guests replay), their ways of fighting
// and the attacks the battle log names. Loaded at her wave (entities/bosses.ts), her pods with her.
import { foeAI, foeFx, foeModels } from '../foeKit';
import { buildRootmother } from '../models/rootmother';
import { buildSeedPod } from '../models/seedpod';
import {
  cracksAt, creeperPiece, dragged, eruptAt, heartOpened, podBurst, rootmotherAI, seedFlung, seedPodAI, sporesAt, thornsAt,
} from '../rootmother';

declare module '../foeKit' {
  interface FoeFx {
    /** a piece of the Rootmother `id`'s creeping vine `vine` laid from (x, z) along `angle` for `length` m, each game's
     *  hero held by any of it he touches */
    creeper(id: number, vine: number, x: number, z: number, angle: number, length: number): void;
    /** the Rootmother `id` dragging herself on her roots (`on` 1) towards a hero her vine holds, or stopped (0) */
    drag(id: number, on: number): void;
    /** the Rootmother `id`'s heart opened for `open` s (its banner, its beat, its light) */
    heartOpens(id: number, open: number): void;
    /** a seed pod flung from over (ox, oz) to land at (tx, tz) in `flight` s */
    seedFling(ox: number, oz: number, tx: number, tz: number, flight: number): void;
    /** a seed pod burst into Thornlings at (x, z) */
    podBurst(x: number, z: number): void;
    /** thorns risen round the Rootmother `id`'s trunk out to `radius` for `last` s, hurting whoever stands in them */
    thorns(id: number, x: number, z: number, radius: number, last: number, damage: number): void;
    /** the earth cracking at (x, z) for `warn` s before an eruption */
    cracks(x: number, z: number, warn: number): void;
    /** roots bursting from the earth at (x, z), `radius` m round */
    erupt(id: number, x: number, z: number, radius: number, damage: number): void;
    /** a spore cloud from (x, z) drifting at (vx, vz) for `life` s, hurting whoever stands in it */
    spores(id: number, x: number, z: number, vx: number, vz: number, life: number, damage: number): void;
  }
}
declare module '../../types' { interface EnemyAIKinds { rootmother: true; seedpod: true } }
declare module '../../combat/damage' { interface EnemyAttacks { thorns: true; roots: true; spores: true } }

foeModels({ rootmother: buildRootmother, seedpod: buildSeedPod });
foeAI({ rootmother: (e, dt) => rootmotherAI(e, dt), seedpod: (e, dt) => seedPodAI(e, dt) });
foeFx({
  creeper: (_id, vine, x, z, angle, length) => creeperPiece(vine, x, z, angle, length),
  drag: (id, on) => dragged(id, on),
  heartOpens: (id, open) => heartOpened(id, open),
  seedFling: (ox, oz, tx, tz, flight) => seedFlung(ox, oz, tx, tz, flight),
  podBurst: (x, z) => podBurst(x, z),
  thorns: (id, x, z, radius, last, damage) => thornsAt(id, x, z, radius, last, damage),
  cracks: (x, z, warn) => cracksAt(x, z, warn),
  erupt: (id, x, z, radius, damage) => eruptAt(id, x, z, radius, damage),
  spores: (id, x, z, vx, vz, life, damage) => sporesAt(id, x, z, vx, vz, life, damage),
});
