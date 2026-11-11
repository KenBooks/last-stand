// Item generation and stat aggregation.
import { SLOTS, SLOT_INFO, RARITIES, STATS, AFFIX_NAMES, LEGENDARY_NAMES, ASCENDANT_NAMES, type RarityInfo } from '../data/items';
import { LOOT } from '../data/waves';
import { pick, rand, randInt, weighted } from '../util';
import type { BaseStats, ClassDef, DerivedStats, Gear, Item, Profile, RarityId, Slot, StatBlock, StatKey } from '../types';

let uid = Date.now() % 1e6;
/** A fresh item id (an item from a co-op host gets one here, so it can't clash with the stash). */
export const newItemId = (): string => `i${(uid++).toString(36)}`;

const STAT_KEYS = Object.keys(STATS) as StatKey[];
/** Typed Object.entries for a stat block. */
export const statEntries = (s: StatBlock) => Object.entries(s) as [StatKey, number][];

export const rarityOf = (id: RarityId): RarityInfo => RARITIES.find((r) => r.id === id) ?? RARITIES[0];
/** How many items of each rarity, best first (rarities with none left out). */
export const rarityCounts = (items: Item[]): { rarity: RarityInfo; n: number }[] =>
  RARITIES.map((rarity) => ({ rarity, n: items.filter((it) => it.rarity === rarity.id).length })).filter((c) => c.n).reverse();
export const rarityIndex = (id: RarityId): number => RARITIES.findIndex((r) => r.id === id);

function rollStat(stat: StatKey, ilvl: number, power: number, weight = 1): number {
  const s = STATS[stat];
  let v = s.base * (1 + s.grow * (ilvl - 1)) * power * weight * rand(0.75, 1.05);
  if (s.cap) v = Math.min(v, s.cap);
  const dec = s.dec || 0;
  const f = 10 ** dec;
  return Math.max(dec ? 0.1 : 1, Math.round(v * f) / f);
}

export function rollRarity(wave: number, bonus = 0): RarityId {
  const w = LOOT.rarityWeights(wave, bonus);
  return weighted(RARITIES.map((r, i) => [r.id, w[i]] as const));
}

/** Implicit stats of a slot for a class (its own, or the defaults). */
export const implicitsFor = (slot: Slot, cls?: ClassDef): [StatKey, number][] => cls?.implicits?.[slot] ?? SLOT_INFO[slot].implicit;
/** A weapon held in both hands (no off-hand with it). */
export const isTwoHanded = (it: Item | undefined, cls?: ClassDef): boolean => !!it && it.slot === 'weapon' && !!cls?.twoHanded?.includes(it.base);
/** A one-handed weapon of a class that dual-wields: it can go in the off-hand. */
export const fitsOffhand = (it: Item | undefined, cls?: ClassDef): boolean => !!it && it.slot === 'weapon' && !!cls?.dualWield && !isTwoHanded(it, cls);
/** A weapon in the off-hand counts its implicit (the weapon's damage) at this much: two one-handers
 *  come to a little less than a two-hander's 1.8x, and pay for the second set of affixes with the block. */
export const OFFHAND_WEAPON = 0.6;

/** What a hero holds, from the equipped items (drives the model and the skills). */
export function gearOf(cls: ClassDef, equipped: Profile['equipped']): Gear {
  const weapon = equipped.weapon, off = equipped.offhand;
  return {
    weapon: weapon?.base ?? null, twoHanded: isTwoHanded(weapon, cls),
    shield: (off?.stats.blockAmount ?? 0) > 0,   // shields are the off-hands that block
    offWeapon: off?.slot === 'weapon' ? off.base : null,
    helm: !!equipped.head, chest: !!equipped.chest, hands: !!equipped.hands,
    rarity: {
      weapon: weapon?.rarity, offhand: off?.rarity, head: equipped.head?.rarity,
      chest: equipped.chest?.rarity, hands: equipped.hands?.rarity,
    },
  };
}

/** How much of `stat` the class's items roll, against the default: its Health (`ClassDef.gearLife`). */
const classWeight = (stat: StatKey, cls?: ClassDef): number => (stat === 'life' ? cls?.gearLife ?? 1 : 1);

/** Item base names of a slot for a class (its own, or the defaults). */
export const basesFor = (slot: Slot, cls?: ClassDef): string[] => cls?.bases?.[slot] ?? SLOT_INFO[slot].bases;

/** Create an item for `cls` (its base names and stats), of `base` if given (else one of the slot's). Everything is
 *  plain JSON so it can be saved directly. */
export function makeItem({ slot, rarity = 'common', ilvl = 1, cls, base: given }: { slot?: Slot; rarity?: RarityId; ilvl?: number; cls?: ClassDef; base?: string } = {}): Item {
  slot ??= pick(SLOTS.filter((s) => !cls?.excludeSlots?.includes(s)));
  const r = rarityOf(rarity);
  const base = given ?? pick(basesFor(slot, cls));
  const stats: StatBlock = {};
  // a two-handed weapon makes up for the missing off-hand with a much bigger implicit
  const hands = cls?.twoHanded?.includes(base) ? 1.8 : 1;
  for (const [stat, weight] of implicitsFor(slot, cls)) stats[stat] = rollStat(stat, ilvl, r.power, weight * hands * classWeight(stat, cls));

  const pool = STAT_KEYS.filter((s) => !(s in stats) && !STATS[s].implicitOnly && !cls?.excludeStats?.includes(s));
  const count = randInt(r.affixes[0], r.affixes[1]);
  const affixes: StatKey[] = [];
  for (let i = 0; i < count && pool.length; i++) {
    const stat = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    stats[stat] = rollStat(stat, ilvl, r.power, 0.8 * classWeight(stat, cls));
    affixes.push(stat);
  }

  let name = base;
  if (rarity === 'ascendant') name = `${pick(ASCENDANT_NAMES)} ${base}`;
  else if (rarity === 'legendary') name = pick(LEGENDARY_NAMES);
  else if (affixes.length) {
    const pre = AFFIX_NAMES[affixes[0]][0];
    const suf = affixes[1] ? AFFIX_NAMES[affixes[1]][1] : '';
    name = `${pre} ${base}${suf ? ' ' + suf : ''}`;
  }

  return { id: newItemId(), slot, rarity, ilvl, name, base, stats };
}

export function rollDrop(cls: ClassDef, wave: number, bonus = 0): Item {
  return makeItem({ rarity: rollRarity(wave, bonus), ilvl: wave + randInt(0, 1), cls });
}

export function formatStat(stat: StatKey, v: number): string {
  return STATS[stat].fmt.replace('{v}', String(v));
}

/** Rough single-number score to make comparisons readable. */
export function itemPower(item: Item): number {
  let p = 0;
  for (const [k, v] of statEntries(item.stats)) p += v / STATS[k].base;
  return Math.round(p * 10);
}

/** Sort comparator: best first (rarity, then power). */
export const byValue = (a: Item, b: Item): number => rarityIndex(b.rarity) - rarityIndex(a.rarity) || itemPower(b) - itemPower(a);

/** Combine class base stats with equipped items into final derived stats. */
const WEAPON_IMPLICIT = new Set(SLOT_INFO.weapon.implicit.map(([k]) => k));

export function computeStats(base: BaseStats, equipped: Profile['equipped']): DerivedStats {
  const add = Object.fromEntries(STAT_KEYS.map((k) => [k, 0])) as Record<StatKey, number>;
  for (const slot of SLOTS) {
    const it = equipped[slot];
    if (!it) continue;
    const offWeapon = slot === 'offhand' && it.slot === 'weapon';
    for (const [k, v] of statEntries(it.stats)) add[k] += offWeapon && WEAPON_IMPLICIT.has(k) ? v * OFFHAND_WEAPON : v;
  }
  const capped = (k: StatKey, cap: number) => Math.min(cap, add[k]);
  return {
    maxLife: base.life + add.life,
    maxEnergy: base.energy + add.energy,
    lifeRegen: base.lifeRegen * (1 + add.lifeRegen / 100),
    energyRegen: base.energyRegen + add.energyRegen,
    moveSpeed: base.moveSpeed * (1 + capped('moveSpeed', 40) / 100),
    crit: Math.min(75, base.crit + add.crit),
    critDmg: base.critDmg + add.critDmg,
    armor: Math.min(70, base.armor + add.armor),
    resist: Math.min(75, base.resist + add.resist),
    damagePct: add.damagePct,
    arcanePct: add.arcanePct,
    elementalPct: add.elementalPct,
    castSpeed: capped('castSpeed', 60),
    cdr: capped('cdr', 40),
    leech: capped('leech', 15),
    block: capped('block', 60),
    blockAmount: add.blockAmount,
  };
}
