// The Bell-Warden in the game, the Ossuary Cantor's guard (its data: data/foes/bellwarden.ts; its fight:
// entities/bellWarden.ts): its model, the attack effects every game plays (enemyAI.ts `fx`, which co-op guests replay),
// its way of fighting and the attacks the battle log names. Loaded at its wave with its Cantor (entities/bosses.ts).
import { foeAI, foeFx, foeModels } from '../foeKit';
import { buildBellWarden } from '../models/bellWarden';
import { bellSwung, bellWardenAI, tollAt } from '../bellWarden';

declare module '../foeKit' {
  interface FoeFx {
    /** the Bell-Warden's bell swung back over the first `warn` s of a toll */
    bellSwing(id: number, warn: number): void;
    /** the Bell-Warden `id`'s toll from (x, z): its ring, each game's hero judged as it reaches him */
    toll(id: number, x: number, z: number, damage: number): void;
  }
}
declare module '../../types' { interface EnemyAIKinds { bellWarden: true } }
declare module '../../combat/damage' { interface EnemyAttacks { toll: true; grab: true } }

foeModels({ bellwarden: buildBellWarden });
foeAI({ bellWarden: (e) => bellWardenAI(e) });
foeFx({
  bellSwing: (_id, warn) => bellSwung(warn),
  toll: (id, x, z, damage) => tollAt(id, x, z, damage),
});
