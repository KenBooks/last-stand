// Ranger: physical bow shots, a hunter's tricks (a wall of stakes and bramble to shelter behind, a scarecrow to draw foes
// off), a separate gear pool. Quarry Mark (`combat/skills/quarryMark.ts`) is kept, off his bar, for its future (#401, #564).
import type { ClassDef } from '../../types';

const ranger: ClassDef = {
  id: 'ranger', name: 'Ranger', model: 'ranger',
  tagline: 'A patient hunter who holds his ground and rains arrows on the pack.',
  accent: '#c9d993', book: 'Fieldcraft',
  hall: {
    role: 'Marksman · Ranged bow',
    traits: [{ label: 'Toughness', value: 3 }, { label: 'Damage', value: 4 }, { label: 'Range', value: 5 }, { label: 'Ease', value: 2 }],
    // (loosed off to his right, past the camera's side, not at it)
    showcase: { skill: 'fanShot', at: [8, 6] },
    banner: [44, 64, 22],
  },
  // (lit at full draw alone: lit always, his bow shone at rest, "why ranger emits light from bow on idle")
  aura: { light: 0xc9d993, intensity: 0.45, drawn: true },
  // (an arrow nocked between shots, back in the quiver after 3 s without one; the next shot takes one out first)
  quiver: { fetch: 0.8, idle: 3 },
  base: { life: 1050, energy: 360, lifeRegen: 5, energyRegen: 20, moveSpeed: 7, crit: 8, critDmg: 60, armor: 6, resist: 0 },
  skills: [
    {
      key: 'mouse0', impl: 'nockShot', name: 'Nockshot',
      desc: 'Hold to draw an arrow, release to loose it: the further it is drawn, the faster and harder it flies. Costs no Energy.', tags: ['physical'],
      // (drawn to full in `draw` s, loosed no sooner than `minDraw` of that; then the follow-through and the next arrow, `castTime`:
      // an archer's pace, about a second each; drawn in 0.7 s and reloaded in 0.45, it was a blur)
      cost: 0, cooldown: 0, castTime: 0.9, draw: 1.1, minDraw: 0.5,
      damage: 340, missiles: 1, spread: 0, speed: 60, range: 26, knock: 0.8,
      icon: { glyph: '➶', color: '#dfce99' },
    },
    {
      key: 'mouse2', impl: 'fanShot', name: 'Briarflight',
      desc: 'Hold to draw five arrows at once, release to loose them in a broad fan. Each arrow can strike a foe.', tags: ['physical'],
      cost: 32, cooldown: 3, castTime: 0.95, draw: 1.3, minDraw: 0.5,
      damage: 150, missiles: 5, spread: 0.1, speed: 55, range: 24, knock: 1.2,
      icon: { glyph: '⋔', color: '#c9d993' },
    },
    {
      key: '1', impl: 'piercingShot', name: 'Lancewood Shot',
      desc: 'Hold to draw a heavy lancewood arrow, release to drive it through every foe in its line. Each foe it passes through takes less (100%, 80%, 60%, then 40%); drawn to full, it strikes half again as hard.', tags: ['physical'],
      cost: 30, cooldown: 4, castTime: 0.95, draw: 1.5, minDraw: 0.4,
      damage: 410, missiles: 1, spread: 0, speed: 80, range: 30, knock: 1.2, falloff: [1, 0.8, 0.6, 0.4], fullBonus: 0.5,
      icon: { glyph: '➳', color: '#ff6a55' },
    },
    {
      key: '2', impl: 'arrowRain', name: 'Hailfletch',
      desc: 'Hold to stand and shoot arrow after arrow high over the target area, each splitting into a shower of 24 that comes down at random across it: each arrow strikes the foe it falls on. The area follows your aim at a walk. You cannot move while you shoot.', tags: ['physical'],
      // (energy a second, and damage an arrow; the volleys are an archer's, drawn, loosed and the next taken from the quiver)
      cost: 22, cooldown: 0, castTime: 0, channel: true, moveMult: 0,
      damage: 170, missiles: 24, radius: 4.2, range: 18,
      icon: { glyph: '⇊', color: '#6f9bff' },
    },
    {
      key: '3', impl: 'hedgeward', name: 'Hedgeward',
      desc: 'Hold to choose where, release to drive a low wall of sharpened stakes and bramble into the ground across your aim, close by and clear of foes and props, facing away from you. It is a breakable prop like any other: foes go round it, striking it only when no way round is left, big foes walk straight through it, and arrows, blows and spells break it. It stands until broken or the wave is cleared.', tags: ['physical'],
      // (waist high and standing until the wave is cleared, from play: "make it shorter, so projectiles go through",
      // "make disappear after each wave"; an ordinary breakable prop, from the owner: "its just another prop, lets not
      // introduce new game mechanics per object"; no cap on how many stand: "dont see why we need a limit")
      // (its reach close before him, from the owner: "Reduce cast range to near player"; it was 6 m)
      cost: 35, cooldown: 14, castTime: 0.45, range: 3, aimed: true,
      // (a prop's health, in the props' own hits: an arrow or a blow 1, a blast 2, a nova 4; from the owner, it
      // "should break easily when struck by enemies")
      wall: { width: 3.6, height: 1, life: 8 },
      icon: { glyph: 'ᚦ', color: '#3fd17a' },
    },
    {
      key: '4', impl: 'strawman', name: 'Strawman',
      desc: 'Raise a scarecrow at the target spot. For 3 seconds every nearby foe but elites and bosses leaves you for it and gathers round it, striking at it. It takes no harm and does none.', tags: ['physical'],
      cost: 35, cooldown: 12, castTime: 0.45, duration: 3, radius: 9, range: 14, aimed: true,
      icon: { glyph: 'ᛉ', color: '#d9b878' },
    },
    {
      key: 'q', impl: 'potion', name: 'Healing Draught',
      desc: 'Restore 190 Health and 30% of your maximum Health.', tags: ['consumable'],
      cost: 0, cooldown: 25, castTime: 1.4, fireAt: 0.5, freeMove: true, heal: 190, healPct: 0.3,
      icon: { glyph: '⚗', color: '#ff5b5b' },
    },
  ],
  bases: {
    weapon: ['Hunting Bow', 'Recurve Bow', 'Longbow'],
    offhand: ['Trail Charm'], head: ['Scout Cap'], chest: ['Trailcoat'], hands: ['Bowguards'],
  },
  twoHanded: ['Hunting Bow', 'Recurve Bow', 'Longbow'],
  excludeStats: ['arcanePct', 'elementalPct', 'block', 'blockAmount'],
  excludeSlots: ['offhand'],
  implicits: { weapon: [['damagePct', 1]], offhand: [['crit', 1]], chest: [['life', 1], ['armor', 1]] },
  // (Health from gear between the mage's and the warrior's, as his own is: more than his own's share, as he has no off-hand
  // and his coat is light)
  gearLife: 1.45,
  starterGear: [{ slot: 'weapon', rarity: 'common', ilvl: 1 }, { slot: 'chest', rarity: 'common', ilvl: 1 }],
};

export default ranger;
