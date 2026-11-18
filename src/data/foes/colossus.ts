// The Hollow Colossus: the Crypt's boss.
// Its stats at wave 1 (`EnemyDef`), how to fight it (the guide's words, no figures) and any trophy its fall
// hangs in the house of records: read by data/enemies.ts with every other foe's file in this folder.
import type { FoeFile } from '../enemies';

declare module '../enemies' { interface EnemyIds { colossus: true } }

export const FOES: FoeFile = {
  colossus: {
    def: {
      name: 'The Hollow Colossus', model: 'colossus', ai: 'boss',
      life: 5200, damage: 110, damageType: 'fire', speed: 2.9, radius: 1.8,
      range: 4.2, slamRadius: 5.5, windup: 1.2, recover: 1.0, cooldown: 2.0,
      projectile: { speed: 12, radius: 0.5, color: 0xff6a2a, trail: 0x1a1210, core: 0.5, look: 'magma' },
      summon: 'imp',
      cost: 0, score: 60, knockbackResist: 1, freezeResist: 0.7, heft: 6, boss: true, accent: 0xb070ff,
    },
    note: {
      role: 'Boss of the Crypt',
      does: 'A towering lord of the crypt. Up close it slams the ground all around itself; at range it looses fans of burning magma bolts; and every so often it roars and calls Voidlings to its side.',
      strengths: ['An enormous amount of Health, growing with the wave and the party.', 'Its slam covers a wide circle round its whole body.', 'Two volleys of bolts in quick succession: the second one aims ahead of you.', 'Cannot be knocked back and shakes off freezes quickly.'],
      weaknesses: ['Every slam is marked by a ring first.', 'Its volleys need a clear line: a pillar blocks them.', 'Slow, and its summons come at a steady pace you can plan around.'],
      beat: ['Fight at medium range: close enough that it does not volley often, far enough to leave its ring.', 'When it roars, turn on the Voidlings at once before they surround you.', 'Strafe across its volleys; hide behind pillars when you need a breather.', 'Save your burst (cooldowns, the draught) for after a slam lands.'],
      vs: {
        warrior: 'Iron Bellow\'s ward soaks a volley; strike in the gap after each slam.',
        mage: 'Void Lance through it and its summons in one line.',
        ranger: 'Quarry Mark it: when it dies marked, your cooldowns come back for the next wave.',
      },
    },
    // (the Hollow Colossus's cracked face, its violet glow gone dim in the eyes)
    trophy: { name: "The Hollow Colossus's Mask", look: 'mask', colour: 0xd8d0c4, trim: 0xb070ff },
  },
};
