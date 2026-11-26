// What gear does for each class (tools/lab `gear`): full sets rolled for every class as its loot rolls them (its bases,
// implicits, excluded stats and slots), at each rarity and item level asked for, a seed each, and what a set gives on
// average: his Health (his own and gear's), his regeneration a second, the healing draught's heal, and how much the
// set multiplies his damage (each damage skill's share of All, Arcane and Elemental damage it takes, his critical
// hits against his own, and his casting speed, averaged over his damage skills). The classes' Health from gear must
// stand in the order of their own (the mage's least, the warrior's most), and so must the Health a second gear's
// regeneration gives them.
import type { Report } from './lab';
import type { ClassDef, DerivedStats, Item, Profile, RarityId, Slot } from '../../../src/types';
import { CLASSES } from '../../../src/data/classes/index';
import { SLOTS } from '../../../src/data/items';
import { computeStats, isTwoHanded, makeItem } from '../../../src/loot/items';

/** One tier of loot: a rarity at an item level. */
export interface GearTier {
  rarity: RarityId;
  ilvl: number;
}

export interface GearOptions {
  tiers: GearTier[];
  /** the sets rolled for each class at each tier */
  sets: number;
  /** plant a fault the order's check must catch: the ranger's Health from gear rolled as the mage's */
  canary: boolean;
}

/** the seed of each class's sets at a tier: the same sets each run */
const SEED = 2027;
/** the elemental tags (combat/damage.ts) */
const ELEMENTAL = new Set(['cold', 'fire', 'lightning']);

/** What a class's sets gave on average at a tier. */
interface ClassGear {
  cls: ClassDef;
  life: number;
  gearLife: number;
  regen: number;
  gearRegen: number;
  draught: number;
  damage: number;
  /** his All Damage (%), on average: what the healing beam's flat part is raised by (skills/lifethread.ts) */
  allDamage: number;
}

/** One full set for `cls`: every slot its loot rolls, an off-hand left empty by a two-handed weapon. */
function rollSet(cls: ClassDef, tier: GearTier): Profile['equipped'] {
  const equipped: Partial<Record<Slot, Item>> = {};
  for (const slot of SLOTS) {
    if (cls.excludeSlots?.includes(slot)) continue;
    if (slot === 'offhand' && isTwoHanded(equipped.weapon, cls)) continue;
    equipped[slot] = makeItem({ slot, rarity: tier.rarity, ilvl: tier.ilvl, cls });
  }
  return equipped as Profile['equipped'];
}

/** How much `stats` multiply the class's damage against his own stats: over his damage skills, on average. */
function damageMultiple(cls: ClassDef, stats: DerivedStats, bare: DerivedStats): number {
  const skills = cls.skills.filter((skill) => (skill.damage ?? 0) > 0);
  const critical = (of: DerivedStats) => 1 + (of.crit / 100) * (of.critDmg / 100);
  const pace = (of: DerivedStats) => 1 + of.castSpeed / 100;
  const shares = skills.map((skill) => {
    let percent = stats.damagePct;
    if (skill.tags.includes('arcane')) percent += stats.arcanePct;
    if (skill.tags.some((tag) => ELEMENTAL.has(tag))) percent += stats.elementalPct;
    return 1 + percent / 100;
  });
  const share = shares.reduce((sum, value) => sum + value, 0) / Math.max(1, shares.length);
  return share * (critical(stats) / critical(bare)) * (pace(stats) / pace(bare));
}

/** The draught's heal for `stats` (its fixed amount and its share of his most Health). */
function draughtOf(cls: ClassDef, stats: DerivedStats): number {
  const draught = cls.skills.find((skill) => skill.impl === 'potion');
  return (draught?.heal ?? 0) + stats.maxLife * (draught?.healPct ?? 0);
}

/** A class's sets at a tier, on average. */
function classGear(cls: ClassDef, tier: GearTier, sets: number, seed: number): ClassGear {
  window.__labSeed(seed);
  const bare = computeStats(cls.base, {} as Profile['equipped']);
  const sum = { life: 0, regen: 0, draught: 0, damage: 0, allDamage: 0 };
  for (let set = 0; set < sets; set++) {
    const stats = computeStats(cls.base, rollSet(cls, tier));
    sum.life += stats.maxLife;
    sum.regen += stats.lifeRegen;
    sum.draught += draughtOf(cls, stats);
    sum.damage += damageMultiple(cls, stats, bare);
    sum.allDamage += stats.damagePct;
  }
  const life = sum.life / sets;
  const regen = sum.regen / sets;
  return {
    cls, life, gearLife: life - cls.base.life, regen, gearRegen: regen - cls.base.lifeRegen,
    draught: sum.draught / sets, damage: sum.damage / sets, allDamage: sum.allDamage / sets,
  };
}

/** A class's line at a tier, its Health from gear against the first class's. */
function classLine(gear: ClassGear, first: ClassGear): string {
  const base = gear.cls.base;
  const against = (gear.gearLife / first.gearLife).toFixed(2);
  return `  ${gear.cls.id}: Health ${base.life} + ${gear.gearLife.toFixed(0)} = ${gear.life.toFixed(0)} `
    + `(gear's ${against} times the ${first.cls.id}'s), regeneration ${base.lifeRegen.toFixed(1)} + `
    + `${gear.gearRegen.toFixed(1)} = ${gear.regen.toFixed(1)} a second, draught ${gear.draught.toFixed(0)}, `
    + `damage ${gear.damage.toFixed(2)} times (All Damage +${gear.allDamage.toFixed(0)}%)`;
}

/** The classes out of their own Health's order in `measure`, as a problem, or null. */
function orderProblem(tier: string, gears: ClassGear[], what: string, measure: (gear: ClassGear) => number,
  own: (cls: ClassDef) => number): string | null {
  const byOwn = [...gears].sort((a, b) => own(a.cls) - own(b.cls));
  for (let index = 1; index < byOwn.length; index++) {
    if (measure(byOwn[index]) <= measure(byOwn[index - 1])) {
      return `${tier}: ${what}: the ${byOwn[index].cls.id}'s isn't above the ${byOwn[index - 1].cls.id}'s`;
    }
  }
  return null;
}

/** A tier's name: `epic 30`. */
const tierName = (tier: GearTier): string => `${tier.rarity} ${tier.ilvl}`;

/** Every class's sets at one tier: its lines, and its order's problems. */
function tierRound(tier: GearTier, options: GearOptions, classes: ClassDef[]): { lines: string[]; problems: string[] } {
  const gears = classes.map((cls, index) => classGear(cls, tier, options.sets, SEED + index * 101 + tier.ilvl));
  const name = tierName(tier);
  const lines = [`${name} (${options.sets} sets each)`, ...gears.map((gear) => classLine(gear, gears[0]))];
  const problems = [
    orderProblem(name, gears, 'Health from gear', (gear) => gear.gearLife, (cls) => cls.base.life),
    orderProblem(name, gears, 'Health a second from gear', (gear) => gear.gearRegen, (cls) => cls.base.lifeRegen),
  ].filter((problem): problem is string => problem !== null);
  return { lines, problems };
}

/**
 * `lab gear`: every class's sets at each tier; a problem for a class whose Health, or Health a second, from gear is out
 * of its own Health's order. With a canary, the ranger's sets rolled again with his Health as the mage's, which the
 * order's check must find.
 */
export function gear(options: GearOptions): Report {
  const classes = Object.values(CLASSES).sort((a, b) => a.base.life - b.base.life);
  const lines: string[] = [];
  const problems: string[] = [];
  for (const tier of options.tiers) {
    const round = tierRound(tier, options, classes);
    lines.push(...round.lines);
    problems.push(...round.problems);
  }
  if (options.canary) {
    const ranger = CLASSES.ranger as ClassDef;
    const kept = ranger.gearLife;
    ranger.gearLife = undefined;
    try {
      const round = tierRound(options.tiers[0], options, classes);
      const caught = round.problems.some((problem) => problem.includes('Health from gear'));
      lines.push(`canary, the ranger's Health from gear rolled as the mage's: ${caught ? 'caught' : 'missed'}`);
      if (!caught) problems.push('the canary\'s ranger with the mage\'s Health from gear went unseen');
    } finally {
      ranger.gearLife = kept;
    }
  }
  return { text: lines.join('\n'), problems };
}
