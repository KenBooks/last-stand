// Mage: arcane + elemental caster.
// A class = base stats + a skill loadout + a model id + starter gear.
// Each skill's `impl` names a behavior registered in src/combat/skills/index.ts;
// every other field is tuning data read by that behavior.
import type { ClassDef } from '../../types';

const mage: ClassDef = {
  id: 'mage',
  name: 'Mage',
  tagline: 'Wielder of raw arcana and the fury of the heavens.',
  model: 'mage',
  accent: '#9fffd0',
  book: 'Spellbook',
  hall: {
    role: 'Arcanist · Ranged spells',
    traits: [{ label: 'Toughness', value: 1 }, { label: 'Damage', value: 5 }, { label: 'Range', value: 4 }, { label: 'Ease', value: 3 }],
    // (a beam across the frame: Starfall's crystals fell from above the hall's camera, unseen; "can he do a void
    // lance attack instead")
    showcase: { skill: 'voidLance', at: [2, 4], hold: 2.2 },
    banner: [16, 62, 92],
  },
  // (the staff's light in its crystal's colour, the bolts')
  // (no motes: his free hand's outline glows instead, models/mage.ts)
  aura: { light: 0xff4fd8, intensity: 1.8, hand: { light: 0x5dffa8, intensity: 0.5 } },

  base: {
    life: 800,
    energy: 480,
    lifeRegen: 4,        // per second
    energyRegen: 22,     // per second
    moveSpeed: 6.4,      // units per second
    crit: 5,             // %
    critDmg: 50,         // bonus %
    armor: 0,            // % damage reduction vs physical
    resist: 0,           // % damage reduction vs elemental / arcane
  },

  // Key bindings: 'mouse0', 'mouse2', '1'..'4', 'q'
  skills: [
    {
      key: 'mouse0', impl: 'splinterBolt', name: 'Splintering Bolt',
      desc: 'Launch a seeking arcane bolt that shatters on impact into two smaller bolts, which seek out other foes. Costs no Energy.',
      tags: ['arcane'], cost: 0, cooldown: 0, castTime: 0.34,
      damage: 36, missiles: 1, spread: 0.22, speed: 24, splitCount: 2, splitDamage: 0.6, range: 22,
      color: 0xff4fd8, trailEnd: 0x6a1cff,   // VFX colors
      icon: { glyph: '✧', color: '#ff6fe0' },
    },
    {
      key: '1', impl: 'starfall', name: 'Starfall',
      desc: 'Call down three arcane crystals from the heavens on the target area. Each strikes hardest where it lands, and chills the foes it leaves alive.',
      tags: ['arcane', 'cold'], cost: 38, cooldown: 3, castTime: 0.75,
      damage: 150, shards: 3, radius: 2.5, edge: 0.35, scatter: 1.9, chill: 2.0, aimed: true,
      icon: { glyph: '☄', color: '#8fd8ff' },
    },
    {
      key: 'mouse2', impl: 'voidLance', name: 'Void Lance',
      desc: 'Draw a portal in the air, then channel a lance of raw arcana through it, piercing every foe in its line. You move slowly as you hold it, and it drains Energy.',
      tags: ['arcane'], cost: 34, cooldown: 0, castTime: 0, channel: true, opening: 0.75,
      damage: 210, length: 17, width: 0.75, moveMult: 0.35,
      icon: { glyph: '⟿', color: '#5dffa8' },
    },
    {
      key: '2', impl: 'glacialNova', name: 'Glacial Nova',
      desc: 'A burst of absolute cold around you freezes every nearby foe solid for 2.4 seconds. Bosses shake it off sooner.',
      tags: ['cold'], cost: 55, cooldown: 7, castTime: 0.6,
      damage: 150, radius: 7, freeze: 2.4,
      icon: { glyph: '❄', color: '#8fd8ff' },
    },
    {
      key: '3', impl: 'maelstrom', name: 'Maelstrom',
      desc: 'Conjure a firestorm that rolls slowly towards your aim for 4.5 seconds, dragging foes into it and lashing them with lightning.',
      tags: ['lightning', 'fire'], cost: 60, cooldown: 5, castTime: 0.75,
      damage: 95, radius: 3.6, duration: 4.5, speed: 3.5, pull: 5,
      icon: { glyph: '༄', color: '#ff8f3a' },
    },
    {
      key: '4', impl: 'blink', name: 'Veilstep',
      desc: 'Hold to choose where to go, up to 15 metres away; let go to cross there as a streak of arcane light, through whatever stands between. Nothing can strike you on the way, and the foes close by as you vanish are left dazed for a second.',
      tags: ['movement'], cost: 30, cooldown: 7, castTime: 0, aimed: true,
      // (radius: the foes it dazes round where he vanishes, for duration s)
      range: 15, radius: 5, duration: 1,
      icon: { glyph: '⤳', color: '#c9b8ff' },
    },
    {
      key: 'q', impl: 'potion', name: 'Healing Draught',
      desc: 'Restore 190 Health and 30% of your maximum Health.',
      tags: ['consumable'], cost: 0, cooldown: 25, castTime: 1.4, fireAt: 0.5, freeMove: true,
      heal: 190, healPct: 0.3,
      icon: { glyph: '⚗', color: '#ff5b5b' },
    },
  ],

  // Common items granted to a brand-new profile (see loot/items.ts makeItem).
  // the block stats only come on warrior shields
  excludeStats: ['block', 'blockAmount'],

  starterGear: [
    { slot: 'weapon', rarity: 'common', ilvl: 1 },
    { slot: 'chest', rarity: 'common', ilvl: 1 },
  ],
};

export default mage;
