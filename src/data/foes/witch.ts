// The Rift Witch: the Crypt's caster.
// Its stats at wave 1 (`EnemyDef`), how to fight it (the guide's words, no figures) and any trophy its fall
// hangs in the house of records: read by data/enemies.ts with every other foe's file in this folder.
import type { FoeFile } from '../enemies';

declare module '../enemies' { interface EnemyIds { witch: true } }

export const FOES: FoeFile = {
  witch: {
    def: {
      name: 'Rift Witch', model: 'witch', ai: 'ranged',
      life: 105, damage: 34, damageType: 'vitality', speed: 4.3, radius: 0.5,
      range: 13, keepAway: 8.5, windup: 0.75, recover: 0.4, cooldown: 2.2,
      projectile: { speed: 13, radius: 0.35, color: 0xc050ff, trail: 0x1a0428, core: 0.7, look: 'void' },
      evade: { how: 'blink', chance: 0.5, from: ['shot', 'wave', 'rush', 'beam', 'area'], sees: Math.PI / 4, reach: [3, 5.5] },
      cost: 2, score: 2,
    },
    note: {
      role: 'Caster',
      does: 'Keeps its distance and hurls dark void orbs at you, backing off when you close in. It sees attacks coming and may blink out of their way.',
      strengths: ['Hits hard from range, and its orbs are aimed ahead of where you are running.', 'Blinks aside from many attacks it sees coming at it.', 'Backs away and strafes, hiding behind the melee foes.'],
      weaknesses: ['Little Health for its threat.', 'Its blink only dodges what comes at it from the front: attacks from the side or while it is busy land.', 'It must stop to cast: the wind-up is your warning.'],
      beat: ['Move sideways when it raises its arms: the orb flies where you were heading.', 'Put a pillar between you to stop its shots, then close in.', 'Use attacks it cannot blink from, or hit it while it is mid-cast.'],
      vs: {
        warrior: 'Bull Rush closes the gap; dragged along, it cannot blink away.',
        mage: 'Veilstep next to it, or catch it in Maelstrom\'s pull.',
        ranger: 'Quarry Mark it and finish it with a drawn Nockshot from the side.',
      },
    },
  },
};
