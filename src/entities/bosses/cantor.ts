// The Ossuary Cantor in the game (its data: data/foes/cantor.ts; its fight: entities/cantor.ts): its model, the attack
// effects every game plays (enemyAI.ts `fx`, which co-op guests replay), its way of fighting and the attacks the battle
// log names. Loaded at its wave (entities/bosses.ts), with its guards' (the Bell-Warden's file).
import { foeAI, foeFx, foeModels } from '../foeKit';
import { buildCantor } from '../models/cantor';
import { cantorAI, cantorChanted, choirRingAt, dirgeFrom, graveHandsAt, graveLifeAt, graveRingAt, graveStoneAt } from '../cantor';

declare module '../foeKit' {
  interface FoeFx {
    /** the Ossuary Cantor `id` chanting over a cast's `warn` s */
    cantorChant(id: number, warn: number): void;
    /** a warning of the Cantor `id`'s at (x, z), `radius` m, for `dur` s: a soft ring of grave light */
    graveRing(id: number, x: number, z: number, radius: number, dur: number): void;
    /** the Cantor `id`'s grave hands bursting at (x, z), each game's hero judged as they do */
    graveHands(id: number, x: number, z: number, damage: number): void;
    /** the Cantor `id`'s dirge marching out from (ox, oz) along `angle`, its rings bursting in turn */
    dirge(id: number, ox: number, oz: number, angle: number, damage: number): void;
    /** the Cantor `id`'s choir's ring round (x, z), its singers rising over `warn` s, the ground outside it hurting after */
    choirRing(id: number, x: number, z: number, warn: number): void;
    /** a gravestone of the Cantor `id`'s warned at (x, z) for `warn` s, then risen there, turned `yaw`, leaning `lean` */
    graveStone(id: number, x: number, z: number, yaw: number, lean: number, warn: number): void;
    /** a risen gravestone's health as the fight's owner deals it, found by where it stands */
    graveLife(x: number, z: number, life: number): void;
  }
}
declare module '../../types' { interface EnemyAIKinds { cantor: true } }
declare module '../../combat/damage' { interface EnemyAttacks { hands: true; choir: true } }

foeModels({ cantor: buildCantor });
foeAI({ cantor: (e) => cantorAI(e) });
foeFx({
  cantorChant: (_id, warn) => cantorChanted(warn),
  graveHands: (id, x, z, damage) => graveHandsAt(id, x, z, damage),
  graveRing: (id, x, z, radius, dur) => graveRingAt(id, x, z, radius, dur),
  dirge: (id, ox, oz, angle, damage) => dirgeFrom(id, ox, oz, angle, damage),
  choirRing: (id, x, z, warn) => choirRingAt(id, x, z, warn),
  graveStone: (id, x, z, yaw, lean, warn) => graveStoneAt(id, x, z, yaw, lean, warn),
  graveLife: (x, z, life) => graveLifeAt(x, z, life),
});
