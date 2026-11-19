// The Bell-Warden in the game (its data: data/foes/bellwarden.ts; its fight: entities/bellWarden.ts): its model, the
// attack effects every game plays (enemyAI.ts `fx`, which co-op guests replay), its way of fighting and the attacks
// the battle log names. Loaded at its wave (entities/bosses.ts).
import { foeAI, foeFx, foeModels } from '../foeKit';
import { buildBellWarden } from '../models/bellWarden';
import { bellDropped, bellSwung, bellWardenAI, shardAt, tollAt } from '../bellWarden';

declare module '../foeKit' {
  interface FoeFx {
    /** the Bell-Warden's bell swung back over the first `warn` s of a toll */
    bellSwing(id: number, warn: number): void;
    /** the Bell-Warden `id`'s toll from (x, z): its ring (two for a double), each game's hero judged as it reaches him */
    toll(id: number, x: number, z: number, double: number, damage: number): void;
    /** a shard broken off the Bell-Warden `id` over (ox, oz), lying at (tx, tz), hurting whoever stands on it */
    shard(id: number, ox: number, oz: number, tx: number, tz: number, damage: number): void;
    /** the Bell-Warden's bell dropped at (x, z), its chains all broken */
    bellDown(x: number, z: number): void;
  }
}
declare module '../../types' { interface EnemyAIKinds { bellWarden: true } }
declare module '../../combat/damage' { interface EnemyAttacks { toll: true; shard: true; grab: true } }

foeModels({ bellwarden: buildBellWarden });
foeAI({ bellWarden: (e) => bellWardenAI(e) });
foeFx({
  bellSwing: (_id, warn) => bellSwung(warn),
  toll: (id, x, z, double, damage) => tollAt(id, x, z, double, damage),
  shard: (id, ox, oz, tx, tz, damage) => shardAt(ox, oz, tx, tz, damage, id),
  bellDown: (x, z) => bellDropped(x, z),
});
