// The Ossuary Twins in the game (their data: data/foes/twins.ts; their fight: entities/twins.ts): their models, the
// attack effects every game plays (enemyAI.ts `fx`, which co-op guests replay), their way of fighting and the attacks
// the battle log names.
import { foeAI, foeFx, foeModels } from '../foeKit';
import { buildTwinReliquary, buildTwinSlab } from '../models/twins';
import { chainSnapped, chargeRan, mendBegun, mendDone, skullsLoosed, twinFell, twinsAI } from '../twins';

declare module '../foeKit' {
  interface FoeFx {
    /** the Ossuary Twins' Slab `id` charging from (ox, oz) to (tx, tz), each game's hero judged as it passes */
    twinCharge(id: number, ox: number, oz: number, tx: number, tz: number, damage: number): void;
    /** `n` skulls from the twin `id` at (ox, oz) curving in on (tx, tz) */
    skullVolley(id: number, ox: number, oz: number, tx: number, tz: number, n: number, damage: number): void;
    /** the Twins' chain snapping tight between (ax, az) and (bx, bz), each game's hero judged against its line */
    chainSnap(id: number, ax: number, az: number, bx: number, bz: number, damage: number): void;
    /** Reliquary `id` mending the pair over `warn` s, and done */
    twinMend(id: number, slab: number, warn: number): void;
    twinMended(id: number, slab: number): void;
    /** twin `id` collapsing at half, paying nothing */
    twinFall(id: number): void;
  }
}
declare module '../../types' { interface EnemyAIKinds { twins: true } }
declare module '../../combat/damage' { interface EnemyAttacks { charge: true; skull: true; chain: true } }

foeModels({ twinslab: buildTwinSlab, twinreliquary: buildTwinReliquary });
foeAI({ twins: (e) => twinsAI(e) });
foeFx({
  twinCharge: (id, ox, oz, tx, tz, damage) => chargeRan(id, ox, oz, tx, tz, damage),
  skullVolley: (id, ox, oz, tx, tz, n, damage) => skullsLoosed(id, ox, oz, tx, tz, n, damage),
  chainSnap: (id, ax, az, bx, bz, damage) => chainSnapped(id, ax, az, bx, bz, damage),
  twinMend: (_id, _slab, warn) => mendBegun(warn),
  twinMended: (id, slab) => mendDone(id, slab),
  twinFall: (id) => twinFell(id),
});
