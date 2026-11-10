// Each skill's tooltip held to the hits it deals (tools/lab `tooltips`). The hero is given modifiers of every kind
// (all damage, arcane, elemental, a crit's chance and share, casting speed: his stats set, which the tooltip and the
// damage roll both read), each skill's tooltip is read as the player reads it, and the skill is cast at foes stood
// where it strikes (as `hits` casts it, a drawn shot at full draw). Every hit that lands must be within a figure the
// tooltip states per hit (a crit within it raised by the crit's share; down to the least share it says a hit of it
// can deal, and one of them at its full figure), a crit's chance must be the hero's, and a hit dealt over time must
// come as often as it says. First, the hotbar's tooltip is hovered, the weapon's all damage raised and the hero's
// stats made again from his gear, and hovered again: its figure must follow. Last, each skill whose tooltip states
// what it gives the hero (the draught's Health, Iron Bellow's ward) is cast: what it gave must be the figure. With the
// canary, all damage and the hero's most Health are raised once the tooltip is read, as a tooltip behind a change
// would be: the hits must be found above it, and what was given off it. (Issue #256: the tooltips showed the base
// damage alone, not what the hero deals.)
import { middleOf } from './lab';
import type { Fixture, Lab, Report } from './lab';
import type { DerivedStats, HeldStyle, SkillDef } from '../../../src/types';
import { G } from '../../../src/state';
import { skillTooltip } from '../../../src/ui/tooltip';
import { holdFor } from './cast';
import { castAt, type Cast, type Hit } from './hits';
import { gearsOf } from './gears';

export interface TooltipsOptions {
  fixture: Fixture;
  /** the skills cast: their keys, behaviours or names (every one dealing damage the hero can use when none) */
  skills: string[];
  /** raise all damage once each tooltip is read: the hits must be found above what it states */
  canary: boolean;
}

/** the hero's modifiers while measured, one of every kind, so a tooltip leaving one out is caught */
const MODIFIERS: Partial<DerivedStats> = {
  damagePct: 40, arcanePct: 30, elementalPct: 25, crit: 35, critDmg: 70, castSpeed: 20,
};
/** the canary's raise of all damage once a tooltip is read (%) */
const CANARY_PCT = 50;
/** the raise of the weapon's all damage for the hotbar's tooltip to follow (%) */
const GEAR_PCT = 30;
/** how far a hit may be off a figure shown, which is whole (half a point each way), and a followed figure (a point) */
const ROUNDING = 0.5;
const FOLLOW_SLACK = 1;
/** how far a stated pace may be off the hits' own, as a share: they fall on whole frames */
const PACE_SLACK = 0.06;
/** the hits on a foe its pace is taken after (a spin coming up to speed) */
const PACE_FROM = 3;
/** the hits outside what's stated listed of a skill at most */
const LISTED = 3;
/** the elemental tags (combat/damage) */
const ELEMENTAL = ['cold', 'fire', 'lightning'];

/** A kind of hit as the tooltip states it: what one is, its figure per hit as it rolls, the least share of it a hit
 *  can deal, and how often one comes, for one dealt over time (s). */
interface Stated {
  per: string;
  low: number;
  high: number;
  least: number;
  every?: number;
}

/** A skill's tooltip as read: its kinds of hit, a crit's chance and share (%), and its damage block's lines. */
interface Read {
  kinds: Stated[];
  crit: number;
  critDmg: number;
  lines: string[];
}

const frameTime = (): number => window.__labClock.frame / 1000;
const whole = (v: number): string => String(Math.round(v));

/** `low–high` as two numbers, or null. */
function rangeOf(text: string | null | undefined): [number, number] | null {
  const found = /(\d+)–(\d+)/.exec(text ?? '');
  return found ? [Number(found[1]), Number(found[2])] : null;
}

/** The kind of hit a line of the tooltip states, or null if it states none. */
function statedIn(line: Element): Stated | null {
  const range = rangeOf(line.querySelector('.tt-each')?.textContent);
  if (!range) return null;
  const text = line.textContent ?? '';
  const per = /per ([a-z ]+?)(,|$)/.exec(text)?.[1] ?? '?';
  const every = /every ([\d.]+) s/.exec(text)?.[1];
  const least = Number((line as HTMLElement).dataset.least ?? 1);
  return { per, low: range[0], high: range[1], least, ...(every ? { every: Number(every) } : {}) };
}

/** `def`'s tooltip as the hero's hotbar shows it, read as the player reads it. */
function readTooltip(def: SkillDef): Read {
  const card = document.createElement('div');
  card.innerHTML = skillTooltip(def)().html;
  const kinds = [...card.querySelectorAll('.tt-hit')].map(statedIn).filter((kind) => kind !== null);
  const crit = /([\d.]+)% chance for \+([\d.]+)%/.exec(card.querySelector('.tt-crit')?.textContent ?? '');
  const block = card.querySelectorAll('.tt-dmg > *');
  const lines = [...block].map((part) => part.textContent?.trim() ?? '').filter(Boolean);
  return { kinds, crit: Number(crit?.[1] ?? 0), critDmg: Number(crit?.[2] ?? 0), lines };
}

/** Whether `hit` is within what `kind` states: its figure (raised by a crit's share for a crit), down to its least. */
function within(hit: Hit, kind: Stated, critDmg: number): boolean {
  const raise = hit.crit ? 1 + critDmg / 100 : 1;
  const top = (kind.high + ROUNDING) * raise;
  const bottom = (kind.low - ROUNDING) * raise * kind.least;
  return hit.amount <= top && hit.amount >= bottom;
}

/** Whether `hit` reaches `kind`'s full figure (its least share aside). */
function full(hit: Hit, kind: Stated, critDmg: number): boolean {
  const raise = hit.crit ? 1 + critDmg / 100 : 1;
  return hit.amount >= (kind.low - ROUNDING) * raise;
}

/** The hits' amounts as `count low–high` (none: `none`). */
function spread(hits: Hit[], what: string): string {
  if (!hits.length) return `no ${what}s`;
  const amounts = hits.map((hit) => hit.amount);
  const counted = `${hits.length} ${what}${hits.length === 1 ? '' : 's'}`;
  return `${counted} ${whole(Math.min(...amounts))}–${whole(Math.max(...amounts))}`;
}

/** The time between hits on the foe struck most, past its first `PACE_FROM` (s), or null with too few. */
function paceOf(hits: Hit[]): number | null {
  const counts = new Map<number, Hit[]>();
  for (const hit of hits) counts.set(hit.foe, [...(counts.get(hit.foe) ?? []), hit]);
  const most = [...counts.values()].sort((a, b) => b.length - a.length)[0] ?? [];
  if (most.length < PACE_FROM + 2) return null;
  const from = most[PACE_FROM];
  const last = most[most.length - 1];
  return ((last.frame - from.frame) * frameTime()) / (most.length - 1 - PACE_FROM);
}

/** A cast's lines and problems: each hit against what the tooltip states, a crit's chance, the pace over time. */
function judged(name: string, read: Read, cast: Cast): { lines: string[]; problems: string[] } {
  const problems: string[] = [];
  const lines = [`    ${read.lines.join(' | ')}`];
  if (!read.kinds.length) return { lines, problems: [`${name}: its tooltip states no damage it deals`] };
  const crits = cast.hits.filter((hit) => hit.crit);
  const plain = cast.hits.filter((hit) => !hit.crit);
  const outside = cast.hits.filter((hit) => !read.kinds.some((kind) => within(hit, kind, read.critDmg)));
  lines.push(`    landed ${spread(plain, 'hit')}, ${spread(crits, 'crit')}: ${outside.length} outside what it states`);
  if (!cast.hits.length) problems.push(`${name}: no hit landed`);
  if (outside.length) {
    const listed = outside.slice(0, LISTED).map((hit) => `${whole(hit.amount)}${hit.crit ? ' (crit)' : ''}`);
    const of = `${outside.length} of ${cast.hits.length} hits`;
    problems.push(`${name}: ${of} outside what it states (${listed.join(', ')})`);
  }
  for (const kind of read.kinds.filter((stated) => stated.least < 1)) {
    if (cast.hits.length && !cast.hits.some((hit) => full(hit, kind, read.critDmg))) {
      problems.push(`${name}: no hit at its full figure per ${kind.per} (${kind.low}–${kind.high})`);
    }
  }
  if (Math.abs(read.crit - G.player.stats.crit) > 0.05) {
    problems.push(`${name}: its crit chance is ${read.crit}%, the hero's ${G.player.stats.crit}%`);
  }
  const timed = read.kinds.find((kind) => kind.every);
  const pace = timed ? paceOf(cast.hits) : null;
  if (timed?.every && pace !== null) {
    lines.push(`    a hit every ${pace.toFixed(3)} s on a foe, as it states every ${timed.every} s`);
    if (Math.abs(pace - timed.every) > timed.every * PACE_SLACK) {
      problems.push(`${name}: a hit every ${pace.toFixed(3)} s on a foe, not every ${timed.every} s as it states`);
    }
  }
  return { lines, problems };
}

/** The hero's damage modifiers set to `MODIFIERS`. */
function setModifiers(): void {
  Object.assign(G.player.stats, MODIFIERS);
}

/** The canary's plant: all damage raised as the cast begins, its tooltip read before. */
function raiseDamage(): boolean {
  G.player.stats.damagePct += CANARY_PCT;
  return true;
}

/** The damage skills cast held that way: those asked for, or every one he knows, can use and that deals damage. */
function skillsOf(options: TooltipsOptions): SkillDef[] {
  const usable = [...G.player.known.values()].map((known) => known.def).filter((def) => G.player.usable(def));
  if (!options.skills.length) return usable.filter((def) => (def.damage ?? 0) > 0);
  const named = (def: SkillDef, wanted: string) => [def.key, def.impl, def.name].includes(wanted);
  return usable.filter((def) => options.skills.some((wanted) => named(def, wanted)));
}

/** Each damage skill held `gear`'s way, its tooltip read and cast at its foes. */
async function gearRound(lab: Lab, options: TooltipsOptions, gear: HeldStyle | undefined): Promise<Found> {
  const fixture: Fixture = { ...options.fixture, gear };
  await lab.setup(fixture);
  const found: Found = { lines: [gear ?? G.player.cls.id], problems: [] };
  for (const def of skillsOf(options)) {
    setModifiers();
    const read = readTooltip(def);
    const lasting = read.kinds.some((kind) => kind.every) && !def.channel ? def.duration ?? 0 : 0;
    const plant = options.canary ? raiseDamage : null;
    const cast = await castAt(lab, fixture, def.name, (skill) => holdFor(skill.def), plant, undefined, lasting);
    const name = gear ? `${def.name} (${gear})` : def.name;
    const judgedCast = judged(name, read, cast);
    found.lines.push(`  ${def.name}`, ...judgedCast.lines);
    found.problems.push(...judgedCast.problems);
  }
  return found;
}

/** What a round found: lines for the report, and its problems. */
interface Found {
  lines: string[];
  problems: string[];
}

/** What a tooltip states its skill gives the hero (Health restored, a ward's blows absorbed), and its figure. */
interface Given {
  what: 'heal' | 'ward';
  figure: number;
}

/** What `def`'s tooltip states it gives the hero, or null if it states nothing given. */
function givenIn(def: SkillDef): Given | null {
  const card = document.createElement('div');
  card.innerHTML = skillTooltip(def)().html;
  for (const what of ['heal', 'ward'] as const) {
    const figure = card.querySelector(`.tt-${what}`)?.textContent;
    if (figure) return { what, figure: Number(figure) };
  }
  return null;
}

/** the Health the hero was asked to restore since `catchHeals` (`Player.heal`'s amounts, before his most caps them) */
let healed: number[] = [];
/** the heroes whose heals are caught (a set-up keeps the hero: caught twice, each heal counted twice) */
const catching = new WeakSet<object>();

/** A plant: every heal asked of the hero caught from now on (with the canary, his most Health raised first, as a
 *  tooltip behind a change would be). */
function catchHeals(canary: boolean): () => boolean {
  return () => {
    const hero = G.player;
    if (canary) hero.stats.maxLife *= 1 + CANARY_PCT / 100;
    healed = [];
    if (catching.has(hero)) return true;
    catching.add(hero);
    const heal = hero.heal.bind(hero);
    hero.heal = (amount, silent) => {
      healed.push(amount);
      heal(amount, silent);
    };
    return true;
  };
}

/** What a skill gave the hero as its `what` once cast: the Health it restored, or the ward it raised. */
function gaveOf(what: Given['what']): number {
  if (what === 'heal') return healed.reduce((sum, amount) => sum + amount, 0);
  return G.player.ward?.amount ?? 0;
}

/**
 * Each skill whose tooltip states what it gives the hero (the draught's Health, Iron Bellow's ward), cast as the
 * player casts it: what it gave must be the figure stated.
 */
async function givenRound(lab: Lab, options: TooltipsOptions): Promise<Found> {
  const fixture: Fixture = { ...options.fixture, gear: undefined, weapon: undefined };
  await lab.setup(fixture);
  const found: Found = { lines: ['given'], problems: [] };
  const usable = [...G.player.known.values()].map((known) => known.def).filter((def) => G.player.usable(def));
  const named = (def: SkillDef) => [def.key, def.impl, def.name].some((name) => options.skills.includes(name));
  for (const def of usable.filter((each) => !options.skills.length || named(each))) {
    setModifiers();
    const given = givenIn(def);
    if (!given) continue;
    await castAt(lab, fixture, def.name, (skill) => holdFor(skill.def), catchHeals(options.canary));
    const gave = gaveOf(given.what);
    found.lines.push(`  ${def.name}: states a ${given.what} of ${given.figure}, gave ${whole(gave)}`);
    if (Math.abs(gave - given.figure) > ROUNDING) {
      found.problems.push(`${def.name}: gave a ${given.what} of ${whole(gave)}, not the ${given.figure} it states`);
    }
  }
  return found;
}

/** The share the hero's modifiers make `def`'s hits of their base, by the rule the issue sets out (#256). */
function scaleOf(def: SkillDef, stats: DerivedStats): number {
  let pct = stats.damagePct;
  if (def.tags.includes('arcane')) pct += stats.arcanePct;
  if (def.tags.some((tag) => ELEMENTAL.includes(tag))) pct += stats.elementalPct;
  return 1 + pct / 100;
}

/** The hotbar's first slot hovered afresh (the mouse off it and back), and its tooltip's first figure per hit. */
async function hovered(lab: Lab, slot: Element): Promise<[number, number] | null> {
  await lab.mouseTo({ x: 1, y: 1 });
  await lab.mouseTo(middleOf(slot));
  return rangeOf(document.querySelector('#tooltip .tt-each')?.textContent);
}

/**
 * The hotbar's first skill hovered, the weapon's all damage raised by `GEAR_PCT` and the hero's stats made again from
 * his gear (as equipping it does), and hovered again: its figure must follow his stats. His stats made again after.
 */
async function followsGear(lab: Lab, options: TooltipsOptions): Promise<Found> {
  // (his own weapons, as his profile has them: stats made again from it hold its weapons again, and a style `--gear`
  // set ahead of them went back to the profile's, its skills with it)
  await lab.setup({ ...options.fixture, gear: undefined, weapon: undefined });
  const slot = document.querySelector('#hotbar .slot');
  const def = G.player.skillAt('mouse0')?.def;
  const weapon = G.profile.equipped.weapon;
  if (!slot || !def || !weapon) throw new Error('lab: tooltips: no hotbar slot, basic attack or weapon to follow');
  const before = await hovered(lab, slot);
  const scaleBefore = scaleOf(def, G.player.stats);
  const had = weapon.stats.damagePct;
  weapon.stats.damagePct = (had ?? 0) + GEAR_PCT;
  G.player.recomputeStats(G.profile.equipped);
  const after = await hovered(lab, slot);
  const ratio = scaleOf(def, G.player.stats) / scaleBefore;
  if (had === undefined) delete weapon.stats.damagePct;
  else weapon.stats.damagePct = had;
  G.player.recomputeStats(G.profile.equipped);
  await lab.mouseTo({ x: 1, y: 1 });
  const shown = (range: [number, number] | null) => (range ? `${range[0]}–${range[1]}` : 'no figure');
  const lines = [
    `gear: the hotbar's ${def.name}: ${shown(before)}; the weapon's all damage +${GEAR_PCT}%: ${shown(after)} `
      + `(the hero's stats ×${ratio.toFixed(3)})`,
  ];
  if (!before || !after) return { lines, problems: ['gear: the hotbar\'s tooltip states no damage per hit'] };
  const wanted = before[1] * ratio;
  if (Math.abs(after[1] - wanted) > FOLLOW_SLACK + ROUNDING * ratio) {
    return { lines, problems: [`gear: the hotbar's tooltip says ${after[1]} at most, not ${whole(wanted)}`] };
  }
  return { lines, problems: [] };
}

/** `lab tooltips`: each damage skill's tooltip held to the hits it deals, and the hotbar's to the gear. */
export async function tooltips(lab: Lab, options: TooltipsOptions): Promise<Report> {
  const gear = await followsGear(lab, options);
  const lines = [...gear.lines];
  const problems = [...gear.problems];
  for (const style of gearsOf(options.fixture)) {
    const round = await gearRound(lab, options, style);
    lines.push(...round.lines);
    problems.push(...round.problems);
  }
  const given = await givenRound(lab, options);
  lines.push(...given.lines);
  problems.push(...given.problems);
  lines.push(...problems.map((problem) => `! ${problem}`));
  if (!options.canary) return { text: lines.join('\n'), problems };
  const missed: string[] = [];
  const caught = problems.some((problem) => problem.includes('outside what it states'));
  lines.push(`canary: ${caught ? 'the raised damage caught' : 'the raised damage went unseen'}`);
  if (!caught) missed.push('the canary\'s raised damage went unseen');
  if (given.lines.length > 1) {
    const raised = problems.some((problem) => / gave a .* not the /.test(problem));
    lines.push(`canary: ${raised ? 'the raised Health caught' : 'the raised Health went unseen'}`);
    if (!raised) missed.push('the canary\'s raised Health went unseen');
  }
  return { text: lines.join('\n'), problems: missed };
}
