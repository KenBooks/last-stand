// Item generation data: slots, rarities, stats and affixes.
import type { RarityId, Slot, StatKey } from '../types';

export const SLOTS: Slot[] = ['weapon', 'offhand', 'head', 'chest', 'hands', 'amulet', 'ring'];

export interface SlotInfo { label: string; bases: string[]; implicit: [StatKey, number][]; glyph: string }
export interface RarityInfo { id: RarityId; name: string; color: string; affixes: [number, number]; power: number }
/** implicitOnly: never rolls as an affix, only as an item's implicit (shield block stats) */
export interface StatInfo { base: number; grow: number; fmt: string; cap?: number; dec?: number; implicitOnly?: boolean }

export const SLOT_INFO: Record<Slot, SlotInfo> = {
  weapon:  { label: 'Weapon',  bases: ['Staff', 'Scepter', 'Wand', 'Rod', 'Spire'],        implicit: [['damagePct', 1.4]], glyph: '/' },
  offhand: { label: 'Off-hand', bases: ['Tome', 'Orb', 'Focus', 'Codex', 'Lantern'],       implicit: [['energy', 1], ['energyRegen', 0.6]], glyph: '◉' },
  head:    { label: 'Head',    bases: ['Hood', 'Circlet', 'Cowl', 'Crown', 'Mask'],         implicit: [['life', 0.8]], glyph: '⌓' },
  chest:   { label: 'Chest',   bases: ['Robes', 'Vestments', 'Mantle', 'Raiment', 'Garb'],  implicit: [['life', 1.2], ['armor', 0.8]], glyph: '♜' },
  hands:   { label: 'Hands',   bases: ['Gloves', 'Wraps', 'Grips', 'Handguards'],           implicit: [['castSpeed', 0.8]], glyph: '✋' },
  amulet:  { label: 'Amulet',  bases: ['Amulet', 'Pendant', 'Talisman', 'Choker'],          implicit: [['energy', 0.8]], glyph: '♁' },
  ring:    { label: 'Ring',    bases: ['Ring', 'Band', 'Signet', 'Loop'],                   implicit: [['crit', 0.8]], glyph: '○' },
};

export const RARITIES: RarityInfo[] = [
  { id: 'common',    name: 'Common',    color: '#d8d4cc', affixes: [0, 1], power: 1.0 },
  { id: 'magic',     name: 'Magic',     color: '#f2da55', affixes: [1, 2], power: 1.2 },
  { id: 'rare',      name: 'Rare',      color: '#46de5c', affixes: [2, 3], power: 1.45 },
  { id: 'epic',      name: 'Epic',      color: '#3f9fff', affixes: [3, 4], power: 1.75 },
  { id: 'legendary', name: 'Legendary', color: '#b35cff', affixes: [4, 5], power: 2.1 },
  // (#403, from play: "orange rarity, more rare than purple": a deep orange, well off Magic's yellow and the Gold a
  // co-op hero can be dyed)
  { id: 'ascendant', name: 'Ascendant', color: '#ff7417', affixes: [5, 6], power: 2.5 },
];

// base: value at item level 1 (before rarity), grow: fractional growth per ilvl,
// fmt: display template, cap: hard cap per item.
export const STATS: Record<StatKey, StatInfo> = {
  damagePct:   { base: 8,   grow: 0.10, fmt: '+{v}% All Damage', cap: 250 },
  arcanePct:   { base: 10,  grow: 0.10, fmt: '+{v}% Arcane Damage', cap: 250 },
  elementalPct:{ base: 10,  grow: 0.10, fmt: '+{v}% Elemental Damage', cap: 250 },
  life:        { base: 60,  grow: 0.12, fmt: '+{v} Health' },
  energy:      { base: 40,  grow: 0.10, fmt: '+{v} Energy' },
  // (a share of the class's own regeneration, so the classes that regenerate most gain most: a roll gives the
  // warrior what the flat Health a second it replaced did)
  lifeRegen:   { base: 50,  grow: 0.10, fmt: '+{v}% Health Regeneration' },
  energyRegen: { base: 3,   grow: 0.08, fmt: '+{v} Energy Regenerated per Second', dec: 1 },
  castSpeed:   { base: 5,   grow: 0.04, fmt: '+{v}% Casting Speed', cap: 30 },
  cdr:         { base: 4,   grow: 0.03, fmt: '-{v}% Skill Cooldowns', cap: 25 },
  crit:        { base: 2,   grow: 0.04, fmt: '+{v}% Critical Chance', cap: 15, dec: 1 },
  critDmg:     { base: 8,   grow: 0.06, fmt: '+{v}% Critical Damage', cap: 100 },
  moveSpeed:   { base: 4,   grow: 0.03, fmt: '+{v}% Movement Speed', cap: 20 },
  leech:       { base: 1,   grow: 0.03, fmt: '{v}% of Damage Leeched as Health', cap: 8, dec: 1 },
  armor:       { base: 3,   grow: 0.04, fmt: '+{v}% Physical Damage Reduction', cap: 30 },
  resist:      { base: 4,   grow: 0.04, fmt: '+{v}% Magic Resistance', cap: 35 },
  block:       { base: 12,  grow: 0.02, fmt: '{v}% Chance to Block', cap: 30, implicitOnly: true },
  blockAmount: { base: 45,  grow: 0.12, fmt: '{v} Damage Blocked', implicitOnly: true },
};

// General stats that also count toward a specific one when filtering the stash
// (All Damage applies to arcane and elemental skills too).
export const STAT_INCLUDES: Partial<Record<StatKey, StatKey[]>> = {
  arcanePct: ['damagePct'],
  elementalPct: ['damagePct'],
};

// Affix name parts per stat (prefix or suffix is chosen at random).
export const AFFIX_NAMES: Record<StatKey, [prefix: string, suffix: string]> = {
  damagePct:    ['Ruinous', 'of Devastation'],
  arcanePct:    ['Arcane', 'of the Void'],
  elementalPct: ['Tempestuous', 'of the Elements'],
  life:         ['Stalwart', 'of Vigor'],
  energy:       ['Scholarly', 'of the Mind'],
  lifeRegen:    ['Mending', 'of Renewal'],
  energyRegen:  ['Tranquil', 'of Clarity'],
  castSpeed:    ['Swift', 'of Haste'],
  cdr:          ['Timeless', 'of Recurrence'],
  crit:         ['Keen', 'of Precision'],
  critDmg:      ['Savage', 'of Ruin'],
  moveSpeed:    ['Fleet', 'of the Wind'],
  leech:        ['Vampiric', 'of the Leech'],
  armor:        ['Warded', 'of the Bastion'],
  resist:       ['Runed', 'of Warding'],
  block:        ['Bulwark', 'of the Wall'],
  blockAmount:  ['Bulwark', 'of the Wall'],
};

export const LEGENDARY_NAMES = [
  'Starfall Covenant', 'Whisper of the Rift', 'Emberheart', 'The Last Candle', 'Oathbreaker',
  'Veil of Nine Moons', 'Stormcaller\'s Due', 'Hollow Crown', 'Ashen Requiem', 'The Unbound Eye',
];

/** an Ascendant item's name: one of these, its base after it ("Dawnbearer's Staff") */
export const ASCENDANT_NAMES = [
  'Dawnbearer\'s', 'Sunwrought', 'Pyrelight', 'Kindled Sovereign\'s', 'Emberthrone',
  'Solstice-Forged', 'Phoenix-Sworn', 'Heliarch\'s', 'Cinderborn', 'Lastlight',
];
