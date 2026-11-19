// The Stag of Ash in the game (its data: data/foes/stag.ts; its fight: entities/stag.ts): its model, the attack effects
// every game plays (enemyAI.ts `fx`, which co-op guests replay), its way of fighting and the attacks the battle log
// names. Loaded at its wave (entities/bosses.ts).
import { foeAI, foeFx, foeModels } from '../foeKit';
import { buildStag } from '../models/stag';
import { chargeLane, emberAt, fireAt, goreAt, stagAI, stagCrashed, stagRun, sweepAt, tossAt } from '../stag';

declare module '../foeKit' {
  interface FoeFx {
    /** the lane the Stag of Ash `id`'s charge will run burning onto the floor from (x, z) along `angle` for `length` m,
     *  over its `warn` s of pawing the earth */
    chargeLane(id: number, x: number, z: number, angle: number, length: number, warn: number): void;
    /** the Stag of Ash `id` set off on its charge (its gallop's drumming) */
    stagRun(id: number): void;
    /** its fire left burning from (x0, z0) to (x1, z1) for `life` s, each game's hero burnt in it */
    fire(id: number, x0: number, z0: number, x1: number, z1: number, life: number, damage: number): void;
    /** hero `slot` gored by its charge going along (dx, dz), hurt and thrown by his own game */
    gore(id: number, slot: number, damage: number, dx: number, dz: number): void;
    /** its charge stopped dead at (x, z) by a prop, the wall or hero `slot`'s raised shield (`how`), stunned `stun` s */
    stagCrash(id: number, x: number, z: number, how: number, slot: number, stun: number): void;
    /** its antlers swept round before it from (x, z) facing `facing`, each game's hero hurt if he's in it */
    sweep(id: number, x: number, z: number, facing: number, damage: number): void;
    /** its antlers flung up from (x, z) facing `facing`: each game's hero before it tossed far across the arena */
    antlerToss(id: number, x: number, z: number, facing: number, damage: number): void;
    /** an ember falling onto (x, z) in `fall` s, each game's hero hurt if he's in it */
    ember(id: number, x: number, z: number, fall: number, damage: number): void;
  }
}
declare module '../../types' { interface EnemyAIKinds { stag: true } }
declare module '../../combat/damage' { interface EnemyAttacks { charge: true; fire: true; antlers: true; embers: true; toss: true } }

foeModels({ stag: buildStag });
foeAI({ stag: (e, dt) => stagAI(e, dt) });
foeFx({
  chargeLane: (id, x, z, angle, length, warn) => chargeLane(id, x, z, angle, length, warn),
  stagRun: (id) => stagRun(id),
  fire: (id, x0, z0, x1, z1, life, damage) => fireAt(id, x0, z0, x1, z1, life, damage),
  gore: (id, slot, damage, dx, dz) => goreAt(id, slot, damage, dx, dz),
  stagCrash: (id, x, z, how, slot, stun) => stagCrashed(id, x, z, how, slot, stun),
  sweep: (id, x, z, facing, damage) => sweepAt(id, x, z, facing, damage),
  antlerToss: (id, x, z, facing, damage) => tossAt(id, x, z, facing, damage),
  ember: (id, x, z, fall, damage) => emberAt(id, x, z, fall, damage),
});
