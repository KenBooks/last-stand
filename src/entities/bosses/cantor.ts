// The Ossuary Cantor in the game (its data: data/foes/cantor.ts; its fight: entities/cantor.ts): its model, the attack
// effects every game plays (enemyAI.ts `fx`, which co-op guests replay), its way of fighting and the attacks the
// battle log names. Loaded at its wave (entities/bosses.ts), its guards' (the Bell-Warden's) with it.
import { foeAI, foeFx, foeModels } from '../foeKit';
import { buildCantor } from '../models/cantor';
import { cantorAI, cantorChanted, dirgeFrom, graveHandsAt } from '../cantor';

declare module '../foeKit' {
  interface FoeFx {
    /** the Ossuary Cantor `id` chanting over a cast's `warn` s (entities/cantor.ts) */
    cantorChant(id: number, warn: number): void;
    /** the Cantor `id`'s grave hands bursting at (x, z), each game's hero judged as they do */
    graveHands(id: number, x: number, z: number, damage: number): void;
    /** the Cantor `id`'s dirge marching out from (ox, oz) along `angle`, its rings bursting in turn */
    dirge(id: number, ox: number, oz: number, angle: number, damage: number): void;
  }
}
declare module '../../types' { interface EnemyAIKinds { cantor: true } }
declare module '../../combat/damage' { interface EnemyAttacks { hands: true } }

foeModels({ cantor: buildCantor });
foeAI({ cantor: (e) => cantorAI(e) });
foeFx({
  cantorChant: (_id, warn) => cantorChanted(warn),
  graveHands: (id, x, z, damage) => graveHandsAt(id, x, z, damage),
  dirge: (id, ox, oz, angle, damage) => dirgeFrom(id, ox, oz, angle, damage),
});
