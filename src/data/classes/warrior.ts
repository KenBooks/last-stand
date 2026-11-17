// Warrior: armoured blade and shield, fighting up close.
// Same shape as mage.ts: base stats, a skill loadout, a model id and starter gear.
import type { ClassDef } from '../../types';

const warrior: ClassDef = {
  id: 'warrior',
  name: 'Warrior',
  tagline: 'Plate, steel and the will to stand where others fall.',
  model: 'warrior',
  accent: '#ffc27a',
  book: 'Arsenal',
  hall: {
    role: 'Vanguard · Close combat',
    traits: [{ label: 'Toughness', value: 5 }, { label: 'Damage', value: 4 }, { label: 'Range', value: 1 }, { label: 'Ease', value: 5 }],
    showcase: { skill: 'powerStrike', at: [2.6, 0] },
    banner: [112, 22, 18],
  },
  aura: { light: 0xff9a4a, intensity: 0.8 },

  base: {
    life: 1300,
    energy: 320,
    lifeRegen: 6,
    energyRegen: 16,
    moveSpeed: 6.2,
    crit: 5,
    critDmg: 60,
    armor: 12,
    resist: 6,
  },

  // Right click raises the shield; with a two-hander instead it looses the crescent (Thunder Crescent), with a weapon in
  // each hand it strikes with both (Twin Fangs), and with a lone one-hander it is empty until the player
  // binds something. A key's default is the last skill listing it.
  // With both hands empty (no weapon, no shield) he fights as a berserker, a style with a bar of its own (#400): the
  // weapons' skills give way to the fists' on their keys (`fallback.bare`), and the fists' need empty hands. His blows
  // build Frenzy (combat/frenzy.ts, `FRENZY` in data/balance.ts): each stack quicker and hungrier, and easier to hurt,
  // spent all at once by Wrath. The numbers are first takes, the owner's to tune in play.
  skills: [
    {
      key: 'mouse0', impl: 'savageFists', name: 'Savage Fists',
      desc: 'Punch left and right at what stands close before you. Each hit restores Energy and builds a stack of Frenzy. At 10 Frenzy every third blow is a two-fisted hammer. With a shield and no weapon, your free hand punches alone, a little lighter, and builds no Frenzy.',
      tags: ['physical'], cost: 0, cooldown: 0, castTime: 0.24, fireAt: 0.5,
      damage: 30, range: 2.4, arc: 1.3, knock: 1.2, gain: 4, frenzy: 1,
      // (a shield on the other arm: the right hand alone, each punch a cross, lighter; from play, "have it punch as
      // well like if there was no sword, but not as much damage though")
      styles: { shield: { damage: 22, gain: 3, frenzy: 0 } },
      needs: 'fist',
      color: 0xd8c8b0,
      icon: { glyph: '✊︎', color: '#ffb85a' },
    },
    {
      key: 'mouse2', impl: 'pounce', name: 'Pounce',
      desc: 'Leap onto the foe you aim at, up to 8 metres off, and pin it under four quick blows. Elites and bosses are too strong to pin: they take the blows standing. Builds a stack of Frenzy.',
      tags: ['physical'], cost: 20, cooldown: 3, castTime: 0,
      damage: 35, blows: 4, range: 8, frenzy: 1,
      needs: 'bare',
      color: 0xd8b890,
      icon: { glyph: '⤵', color: '#ffcf70' },
    },
    {
      key: '1', impl: 'rampage', name: 'Rampage',
      desc: 'Hold to throw a flurry of punches as you walk, striking every foe close before you. Each blow that lands builds Frenzy, and none decays while you hold it. Quicker with Frenzy, as all your attacks are. Drains Energy while held.',
      tags: ['physical'], cost: 25, cooldown: 0, castTime: 0, channel: true,
      damage: 140, range: 2.6, arc: 1.6, knock: 0.8, moveMult: 0.75, frenzy: 1, frenzyHolds: true,
      needs: 'bare',
      icon: { glyph: '≋', color: '#ff8a4a' },
    },
    {
      key: '2', impl: 'bloodrush', name: 'Bloodrush',
      desc: 'Dash recklessly along your aim through a line of foes, striking each you pass. It carries none of them. Each foe struck builds a stack of Frenzy, up to 5.',
      tags: ['physical'], cost: 22, cooldown: 6, castTime: 0,
      damage: 80, range: 7, speed: 26, frenzy: 1, frenzyMost: 5,
      needs: 'bare',
      color: 0xff5a2a,
      icon: { glyph: '➶', color: '#ff5a3a' },
    },
    {
      key: '3', impl: 'wrath', name: 'Wrath',
      desc: 'Spend all your Frenzy in one blow, harder for every stack. Under 5 stacks it is a single hook; from 5 a two-fisted slam that also strikes every foe round where it lands; at 10 or more it cracks the ground and throws them back. The damage you take goes back to normal. Needs a stack of Frenzy.',
      tags: ['physical'], cost: 15, cooldown: 4, castTime: 0.4, fireAt: 0.65,
      damage: 60, perStack: 70, range: 2.6, arc: 1.2, radius: 3, knock: 8,
      needs: 'bare',
      color: 0xff6a30,
      icon: { glyph: '✹', color: '#ff3a2a' },
    },
    {
      key: '4', impl: 'unchained', name: 'Unchained',
      desc: 'Let your fury loose: for 8 seconds your Frenzy doesn\'t decay and can build to 15 stacks.',
      tags: ['buff'], cost: 30, cooldown: 30, castTime: 0,
      duration: 8,
      needs: 'bare',
      icon: { glyph: '⛓', color: '#ff7040' },
    },
    {
      key: 'mouse0', impl: 'cleave', name: 'Rending Cleave',
      desc: 'A wide sweep of the weapon that strikes every foe in front of you. Each hit restores Energy. A two-handed weapon swings slower and hits harder, a blade in each hand quicker and lighter.',
      tags: ['physical'], cost: 0, cooldown: 0, castTime: 0.42,
      damage: 62, range: 3.3, arc: 2.2, knock: 2.2, gain: 4,
      needs: 'weapon', fallback: { bare: 'savageFists' },
      // (each about as much damage and energy a second: a great weapon's weight in each blow, two blades' pace)
      styles: { twoHanded: { castTime: 0.6, damage: 92, gain: 6 }, dual: { castTime: 0.3, damage: 45, gain: 3 } },
      color: 0xffd9a0,
      icon: { glyph: '⚔', color: '#ffd9a0' },
    },
    {
      key: 'mouse2', impl: 'crescent', name: 'Thunder Crescent',
      desc: 'Drive your weapon into the ground and loose a crescent of lightning along it, tearing through every foe in its path.',
      tags: ['lightning'], cost: 24, cooldown: 4, castTime: 0.6, fireAt: 0.55,
      damage: 280, speed: 17, range: 15, width: 2.1,
      needs: 'twoHanded',   // a swing of a great weapon
      color: 0x5a8cff,   // a deep blue: pale colours bloom to white
      icon: { glyph: '☾', color: '#9fc8ff' },
    },
    {
      key: 'mouse2', impl: 'twinFangs', name: 'Twin Fangs',
      desc: 'Lunge towards your aim and strike with both blades in quick succession, right then left. Instant.',
      tags: ['physical'], cost: 24, cooldown: 3, castTime: 0,
      damage: 150, range: 3.2, arc: 1.3,
      needs: 'dual',
      color: 0xbfe0ff,
      icon: { glyph: '✕', color: '#bfe0ff' },
    },
    {
      key: 'mouse2', impl: 'raiseShield', name: 'Raise Shield',
      desc: 'Hold your shield up: every blow from the front is blocked, for three times your Block Amount. A bigger blow breaks your guard and staggers you: for a moment you can only move. Drains Energy while held.',
      tags: ['defense'], cost: 6, cooldown: 0, castTime: 0, channel: true,
      block: 3, moveMult: 0.45,
      needs: 'shield', fallback: { twoHanded: 'crescent', dual: 'twinFangs', bare: 'pounce' },
      icon: { glyph: '⛉', color: '#e8d2a0' },
    },
    {
      key: '1', impl: 'tempest', name: 'Steel Tempest',
      desc: 'Spin with your weapon outstretched, shredding everything around you. Drains Energy while held. A two-handed weapon spins slower and hits harder.',
      tags: ['physical'], cost: 30, cooldown: 0, castTime: 0, channel: true,
      damage: 150, radius: 2.9, moveMult: 0.8, spin: 15,
      needs: 'armed', fallback: { bare: 'rampage' },
      // (as Rending Cleave's swings: a great weapon's weight slows it as much, the same damage a second)
      styles: { twoHanded: { spin: 10.5 } },
      icon: { glyph: '✺', color: '#e8eef8' },
    },
    {
      key: '2', impl: 'bullRush', name: 'Bull Rush',
      desc: 'Charge forward, sweeping up foes in your way and hurling them on ahead as you stop. Elites are driven back instead, and a boss stops you. The more you carry the slower you go, and a great pack stops you, stunned for a moment. Your other skills can be used as you charge, and the charge as they wind up or while you hold them. With a shield borne before you, it strikes a quarter harder and the stun is shorter.',
      tags: ['physical'], cost: 28, cooldown: 5, castTime: 0, overCast: true,
      damage: 120, range: 9, speed: 26,
      // (#397: the foes it carries weigh on it, each its kind's heft, an elite twice that: each weight carried takes
      // `slow` of its speed, and at `most` it stops; gear's All Damage % lightens the load by `gear` of its share,
      // so the most it goes is the same whatever the gear. A boss is never carried: it stops the charge)
      push: { most: 6, slow: 0.07, gear: 0.5 },
      needs: 'armed', fallback: { bare: 'bloodrush' },
      // (#560, the weight of the foes it met, a kill half: 5 common foes, two slammers, an elite slammer or a boss
      // stagger him for 0.4 s at its stop, up to 0.7 s at 9, a pack it was stopped by and the dead it ploughed)
      ram: { at: 5, full: 9, least: 0.4, most: 0.7, elite: 2, killed: 0.5 },
      // (a shield's weight behind the charge, #398: its blows a quarter harder, as a shield's hero gives up a great
      // weapon's weight and a second blade's pace for his block; braced behind it, the stun a quarter shorter)
      styles: {
        shield: {
          damage: 150, styleNote: '+25% with a shield',
          ram: { at: 5, full: 9, least: 0.3, most: 0.5, elite: 2, killed: 0.5 },
        },
      },
      icon: { glyph: '➹', color: '#ffb46a' },
    },
    {
      key: '3', impl: 'powerStrike', name: 'Power Strike',
      desc: 'Gather your strength for a moment and a half, then bring your weapon down in a crushing overhead blow.',
      tags: ['physical'], cost: 35, cooldown: 5, castTime: 1.5, fireAt: 0.9,
      damage: 520, range: 3.9, arc: 1.2, knock: 9,
      needs: 'armed', fallback: { bare: 'wrath' },
      color: 0xffc070,
      icon: { glyph: '⚒', color: '#ffc070' },
    },
    {
      key: '4', impl: 'ironBellow', name: 'Iron Bellow',
      desc: 'A war cry that hurls back nearby foes and raises spectral shields round you for 6 seconds. They absorb the blows you take, up to 30% of your maximum Health.',
      tags: ['defense'], cost: 30, cooldown: 14, castTime: 0.65,
      damage: 40, radius: 6, knock: 8, absorbPct: 0.3, duration: 6,
      needs: 'armed', fallback: { bare: 'unchained' },
      icon: { glyph: '⛨', color: '#ffd36a' },
    },
    {
      key: 'q', impl: 'potion', name: 'Healing Draught',
      desc: 'Restore 190 Health and 30% of your maximum Health.',
      tags: ['consumable'], cost: 0, cooldown: 25, castTime: 1.4, fireAt: 0.5, freeMove: true,
      heal: 190, healPct: 0.3,
      icon: { glyph: '⚗', color: '#ff5b5b' },
    },
  ],

  starterGear: [
    { slot: 'weapon', rarity: 'common', ilvl: 1 },
    { slot: 'offhand', rarity: 'common', ilvl: 1 },
  ],
  // (a two-hander of each kind in his stash, so its style can be tried from the first: he starts with a one-hander and
  // a shield, and found one only by luck)
  starterStash: [
    { slot: 'weapon', rarity: 'common', ilvl: 1, base: 'Greataxe' },
    { slot: 'weapon', rarity: 'common', ilvl: 1, base: 'Greatsword' },
    { slot: 'weapon', rarity: 'common', ilvl: 1, base: 'Maul' },
  ],

  // Health, cast speed, cooldowns and so on still roll; arcane damage has no warrior skill to feed
  bases: {
    weapon: ['Sword', 'Axe', 'Mace', 'Greatsword', 'Greataxe', 'Maul'],
    offhand: ['Shield', 'Buckler'],
    head: ['Helm', 'Greathelm'],
    chest: ['Cuirass', 'Hauberk'],
    hands: ['Gauntlets', 'Grips', 'Handguards'],
  },
  excludeStats: ['arcanePct'],
  twoHanded: ['Greatsword', 'Greataxe', 'Maul'],
  dualWield: true,   // a one-hander in each hand
  // shields block (see Player.tryBlock) instead of feeding energy
  implicits: { offhand: [['block', 1], ['blockAmount', 1], ['armor', 0.5]] },
  // (the most Health from gear, as he has the most of his own)
  gearLife: 1.6,
};

export default warrior;
