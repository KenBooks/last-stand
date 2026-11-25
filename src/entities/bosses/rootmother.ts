// The Rootmother in the game (her data: data/foes/rootmother.ts; her fight: entities/rootmother.ts): her model and her
// seed pods', the attack effects every game plays (enemyAI.ts `fx`, which co-op guests replay), their ways of fighting
// and the attacks the battle log names. Loaded at her wave (entities/bosses.ts), her pods with her.
import { foeAI, foeFx, foeModels } from '../foeKit';
import { buildRootmother } from '../models/rootmother';
import { buildSeedPod } from '../models/seedpod';
import {
  branchAt, branchTorn, cracksAt, creeperPiece, eruptAt, heartOpened, podBurst, rootmotherAI, seedFlung, seedPodAI,
  sporesAt, thornsAt,
} from '../rootmother';
import { cageRootAt, cageShutAt, cageWarnAt, crushAt, crushRiseAt } from '../rootCage';
import { burrowAt } from '../rootBurrow';

declare module '../foeKit' {
  interface FoeFx {
    /** a piece of the Rootmother `id`'s creeping vine `vine` laid from (x, z) along `angle` for `length` m, each game's
     *  hero held by any of it he touches */
    creeper(id: number, vine: number, x: number, z: number, angle: number, length: number): void;
    /** the Rootmother `id` burrowing from (fx, fz) to rise at (tx, tz), `travel` s under the floor (her sink, the
     *  ridge, the warning and her rise played alike on every game: entities/rootBurrow.ts) */
    burrow(id: number, fx: number, fz: number, tx: number, tz: number, travel: number): void;
    /** the Rootmother `id`'s heart opened for `open` s (its banner, its beat, its light) */
    heartOpens(id: number, open: number): void;
    /** a seed pod flung from over (ox, oz) to land at (tx, tz) in `flight` s */
    seedFling(ox: number, oz: number, tx: number, tz: number, flight: number): void;
    /** a seed pod burst into Thornlings at (x, z) */
    podBurst(x: number, z: number): void;
    /** thorns risen round the Rootmother `id`'s trunk out to `radius` for `last` s, hurting whoever stands in them */
    thorns(id: number, x: number, z: number, radius: number, last: number, damage: number): void;
    /** the earth cracking in a ring at (x, z) for `warn` s before the Rootmother `id`'s root cage shuts there */
    cageWarn(id: number, x: number, z: number, warn: number): void;
    /** her root cage shut at (x, z): its roots burst up and arch over, each a prop a hero can't walk through */
    cageShut(id: number, x: number, z: number, damage: number): void;
    /** the life of her cage's root whose foot stands at (x, z), as the fight's owner deals it */
    cageRoot(x: number, z: number, life: number): void;
    /** her great root rising from its foot at (bx, bz) beside the cage at (x, z) over `warn` s, then falling across it */
    crushRise(id: number, x: number, z: number, bx: number, bz: number, warn: number): void;
    /** her great root landing across the cage at (x, z): each game's hero in it hurt hard */
    crush(id: number, x: number, z: number, bx: number, bz: number, damage: number): void;
    /** the earth cracking at (x, z) for `warn` s before an eruption */
    cracks(x: number, z: number, warn: number): void;
    /** roots bursting from the earth at (x, z), `radius` m round */
    erupt(id: number, x: number, z: number, radius: number, damage: number): void;
    /** a spore cloud from (x, z) drifting at (vx, vz) for `life` s, hurting whoever stands in it */
    spores(id: number, x: number, z: number, vx: number, vz: number, life: number, damage: number): void;
    /** a branch snapped off the Rootmother `id`'s crown (`hands` 2: both her hands, for a fan or a line) */
    branchTorn(id: number, hands: number): void;
    /** a branch thrown by the Rootmother `id` from (ox, oy, oz) to land at (tx, tz) after `flight` s: `hurt` of
     *  `damage` within `splash` m where it lands, and `stay` s of bramble there (0: none) */
    branch(id: number, ox: number, oy: number, oz: number, tx: number, tz: number, flight: number, damage: number,
      hurt: number, splash: number, stay: number): void;
  }
}
declare module '../../types' { interface EnemyAIKinds { rootmother: true; seedpod: true } }
declare module '../../combat/damage' { interface EnemyAttacks { thorns: true; roots: true; spores: true; branch: true; bramble: true; crush: true } }

foeModels({ rootmother: buildRootmother, seedpod: buildSeedPod });
foeAI({ rootmother: (e, dt) => rootmotherAI(e, dt), seedpod: (e, dt) => seedPodAI(e, dt) });
foeFx({
  creeper: (_id, vine, x, z, angle, length) => creeperPiece(vine, x, z, angle, length),
  burrow: (id, fx, fz, tx, tz, travel) => burrowAt(id, fx, fz, tx, tz, travel),
  heartOpens: (id, open) => heartOpened(id, open),
  seedFling: (ox, oz, tx, tz, flight) => seedFlung(ox, oz, tx, tz, flight),
  podBurst: (x, z) => podBurst(x, z),
  thorns: (id, x, z, radius, last, damage) => thornsAt(id, x, z, radius, last, damage),
  cracks: (x, z, warn) => cracksAt(x, z, warn),
  cageWarn: (id, x, z, warn) => cageWarnAt(id, x, z, warn),
  cageShut: (id, x, z, damage) => cageShutAt(id, x, z, damage),
  cageRoot: (x, z, life) => cageRootAt(x, z, life),
  crushRise: (id, x, z, bx, bz, warn) => crushRiseAt(id, x, z, bx, bz, warn),
  crush: (id, x, z, bx, bz, damage) => crushAt(id, x, z, bx, bz, damage),
  erupt: (id, x, z, radius, damage) => eruptAt(id, x, z, radius, damage),
  spores: (id, x, z, vx, vz, life, damage) => sporesAt(id, x, z, vx, vz, life, damage),
  branchTorn: (id, hands) => branchTorn(id, hands),
  branch: (id, ox, oy, oz, tx, tz, flight, damage, hurt, splash, stay) =>
    branchAt(id, ox, oy, oz, tx, tz, flight, damage, hurt, splash, stay),
});
