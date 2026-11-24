// The Elder Thornheart: the Thornwood's boss.
// Its stats at wave 1 (`EnemyDef`), how to fight it (the guide's words, no figures) and any trophy its fall
// hangs in the house of records: read by data/enemies.ts with every other foe's file in this folder.
import type { FoeFile } from '../enemies';

declare module '../enemies' { interface EnemyIds { thornheart: true } }

export const FOES: FoeFile = {
  thornheart: {
    def: {
      name: 'The Elder Thornheart', model: 'thornheart', ai: 'boss',
      life: 5400, damage: 105, damageType: 'vitality', speed: 2.7, radius: 1.8,
      range: 4.2, slamRadius: 5.5, windup: 1.2, recover: 1.0, cooldown: 2.0,
      projectile: { speed: 12, radius: 0.5, color: 0x6fd82a, trail: 0x2c4a1c, core: 0.55, look: 'spore' },
      summon: 'thornling',
      cost: 0, score: 60, knockbackResist: 1, freezeResist: 0.7, heft: 6, boss: true, accent: 0x7aff50,
    },
    note: {
      role: 'Boss of the Thornwood',
      does: 'The ancient heart of the forest. Up close it slams the earth around itself; at range it looses fans of spore bolts; and it roars to call Thornlings from the undergrowth.',
      strengths: ['A vast amount of Health, growing with the wave and the party.', 'A wide slam round its whole body.', 'Two volleys of bolts, the second aimed ahead of you.', 'Cannot be knocked back; shakes off freezes quickly.'],
      weaknesses: ['Every slam is marked first.', 'Its volleys need a clear line: break it with a tree or a stone.', 'Slow, with summons on a steady clock.'],
      beat: ['Keep to medium range and leave the ring when it appears.', 'Turn on the Thornlings the moment it roars.', 'Strafe across volleys rather than running from them.', 'Spend your cooldowns in the gap after a slam.'],
      vs: { ranger: 'Strawman pulls its Thornlings off you while you keep shooting the boss.' },
    },
    // (the Elder Thornheart's crown of branching antlers in blossom over its heart in its cage of roots, mounted;
    // world/trophies/thornheart.ts)
    trophy: { name: "The Elder Thornheart's Crown", kind: 'wall', place: 'wall-inner-right', colour: 0x9a846a, trim: 0xb8ff4a },
  },
};
