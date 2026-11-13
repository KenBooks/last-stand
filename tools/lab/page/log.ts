// The battle log held to the hits as they land (tools/lab `log`): each skill the hero can use, in each way of holding
// weapons his class has, cast at foes stood where it strikes (as `hits` casts it), every hit caught as the foe takes it
// and the log's list read back: each hit listed once and in turn, under the skill cast, on the foe it struck by its
// name, for what it dealt, of its type, a crit and a kill as they were. The basic attack is cast once more at foes it
// kills. Then a foe of each way of attacking (a blow, a bolt, a slam) comes at the hero, and each blow he takes is
// listed under the foe's name and its attack, for the life it took and what his shield and ward stopped. Each cast's
// lines are listed as the panel shows them, and the panel must show them all. (The owner, testing #255, a Bull Rush
// cast over a charging Power Strike: "there is 0 damage on dummies from bull rush itself". It had hit, its number
// shown a moment after Power Strike's.)
import * as THREE from 'three';
import type { Fixture, Lab, Report } from './lab';
import type { Enemy } from '../../../src/entities/enemy';
import type { HitResult } from '../../../src/entities/player';
import type { EnemyId } from '../../../src/data/enemies';
import type { LogEntry } from '../../../src/ui/battleLog';
import type { SkillDef } from '../../../src/types';
import { G } from '../../../src/state';
import { hitEnemy, hurtPlayer, type EnemyAttack } from '../../../src/combat/damage';
import { holdFor } from './cast';
import { castAt, type Cast, type Hit } from './hits';
import { battleLog } from './battleLog';
import { gearsOf } from './gears';

export interface LogOptions {
  fixture: Fixture;
  /** the skills: their keys, behaviours or names (every one the hero can use when none are given) */
  skills: string[];
  /** plant the faults the checks must catch: a hit in each cast listed under another skill, and a blow on the hero
   *  from no foe */
  canary: boolean;
}

type BattleLog = NonNullable<Awaited<ReturnType<typeof battleLog>>>;

/** Foes that come at the hero: their kind, the attack the log names it by, how many come and how far ahead of him
 *  they start (m). */
interface Attacker {
  kind: EnemyId;
  attack: EnemyAttack;
  count: number;
  ahead: number;
}

/** foes of each way of attacking: three striking at once, whose blows join a line counting them (it counted the
 *  hero instead: "Mossback strike ▸ You ×3") */
const ATTACKERS: Attacker[] = [
  { kind: 'husk', attack: 'strike', count: 3, ahead: 3 },
  { kind: 'witch', attack: 'bolt', count: 1, ahead: 9 },
  { kind: 'brute', attack: 'slam', count: 1, ahead: 4 },
];
/** the blows waited for from each foe, the frames they have to land them in, and how far apart across the hero's
 *  way several start (m) */
const BLOWS = 2;
const BLOW_FRAMES = 1200;
const APART = 1.5;
/** the frames run after the last blow waited for, for the panel to draw it (it draws every 0.1 s at most) */
const DRAW_FRAMES = 12;
/** a foe's life for the basic attack to kill it */
const DYING = 1;
/** the mismatches listed of a cast at most */
const SHOWN = 3;
/** how the log names the hero */
const HERO = 'You';

const counted = (n: number, what: string): string => `${n} ${what}${n === 1 ? '' : 's'}`;

/** What a listed hit says that the hit caught as it landed doesn't (none: it says the same). */
function dealtMismatch(entry: LogEntry, hit: Hit, cast: Cast): string | null {
  const foe = cast.foes[hit.foe];
  const differs: string[] = [];
  if (!entry.dealt || entry.by !== HERO) differs.push(`as ${entry.by}'s`);
  if (entry.how !== cast.skill.def.name) differs.push(`under ${entry.how}`);
  if (entry.to !== foe.name || entry.foe !== foe.id) differs.push(`on ${entry.to} (${entry.foe})`);
  if (entry.amount !== hit.amount) differs.push(`for ${entry.amount.toFixed(1)} (dealt ${hit.amount.toFixed(1)})`);
  if (entry.type !== hit.type) differs.push(`as ${entry.type} (${hit.type})`);
  if (entry.crit !== hit.crit) differs.push(entry.crit ? 'as a crit' : 'not as a crit');
  if (entry.kill !== hit.kill) differs.push(entry.kill ? 'as a kill' : 'not as a kill');
  return differs.length ? differs.join(', ') : null;
}

/** What a listed blow on the hero says that the blow as he took it doesn't, from one of `foes` (none: it says the
 *  same). */
function takenMismatch(entry: LogEntry, taken: HitResult, foes: Enemy[], attack: EnemyAttack): string | null {
  const foe = foes[0];
  const differs: string[] = [];
  if (entry.dealt || entry.to !== HERO) differs.push(`as dealt to ${entry.to}`);
  const struck = foes.some((one) => one.id === entry.foe);
  if (entry.by !== foe.name || !struck) differs.push(`under ${entry.by} (${entry.foe})`);
  if (entry.how !== attack) differs.push(`as a ${entry.how}`);
  if (entry.type !== foe.def.damageType) differs.push(`as ${entry.type} (${foe.def.damageType})`);
  if (entry.amount !== taken.taken) differs.push(`for ${entry.amount.toFixed(1)} (took ${taken.taken.toFixed(1)})`);
  if (entry.blocked !== taken.blocked) {
    differs.push(`${entry.blocked.toFixed(1)} blocked (${taken.blocked.toFixed(1)})`);
  }
  if (entry.absorbed !== taken.absorbed) {
    differs.push(`${entry.absorbed.toFixed(1)} warded (${taken.absorbed.toFixed(1)})`);
  }
  return differs.length ? differs.join(', ') : null;
}

/** `what`'s problems: as many hits listed as landed, and each listed as it was (`mismatch` of the i-th). */
function listProblems(what: string, landed: number, listed: number, mismatch: (i: number) => string | null): string[] {
  const problems: string[] = [];
  if (listed !== landed) problems.push(`${what}: ${landed} hits landed, ${listed} listed`);
  const wrong: string[] = [];
  for (let i = 0; i < Math.min(landed, listed); i++) {
    const differs = mismatch(i);
    if (differs) wrong.push(`hit ${i + 1} listed ${differs}`);
  }
  if (wrong.length) {
    const more = wrong.length > SHOWN ? ` (and ${wrong.length - SHOWN} more)` : '';
    problems.push(`${what}: ${wrong.slice(0, SHOWN).join('; ')}${more}`);
  }
  return problems;
}

/** The canary's plant in a cast: a hit at the press listed under another skill's name. */
function misnamedHit(_frame: number, cast: Cast): boolean {
  const def = cast.skill.def;
  const misnamed: SkillDef = { ...def, name: `${def.name} (misnamed)` };
  hitEnemy(cast.foes[0], 1, { by: G.player, skill: misnamed, tags: ['physical'], type: 'physical' });
  return true;
}

/** `text` without its spaces and dots, as the panel's rows and the log's lines both have its words. */
const words = (text: string): string => text.replace(/[\s·]+/g, '');

/** The log's lines now against the panel's rows, once it has drawn: a problem if it shows fewer or more, or a row
 *  says other than its line. */
function panelProblems(what: string, lines: string[]): string[] {
  const rows = [...document.querySelectorAll('#blog .bl-line')].map((row) => row.textContent ?? '');
  if (rows.length !== lines.length) {
    return [`${what}: the panel shows ${rows.length} lines of the log's ${lines.length}`];
  }
  const wrong = rows.findIndex((row, i) => words(row) !== words(lines[i]));
  return wrong < 0 ? [] : [`${what}: the panel's line ${wrong + 1} says "${rows[wrong]}", not "${lines[wrong]}"`];
}

/** The words of each of the panel's rows on either side of its arrow: who dealt its hits and who took them. */
function rowSides(): { by: string; to: string }[] {
  return [...document.querySelectorAll('#blog .bl-what')].map((row) => {
    const [by = '', to = ''] = (row.textContent ?? '').split(' ▸ ');
    return { by, to };
  });
}

/** The panel's rows' sides: the hero named alone on his (before the arrow for his hits, after it for a foe's, its
 *  damage straight after), and no more of a kind of foe counted on the foes' than there were (`foes`). */
function sidesProblems(what: string, dealt: boolean, foes: number): string[] {
  const problems: string[] = [];
  for (const { by, to } of rowSides()) {
    const hero = dealt ? by : to;
    const alone = dealt ? /^You [^×]+$/.test(hero) : /^You [\d,]+ /.test(hero);
    if (!alone) problems.push(`${what}: a line's hero's side reads "${hero}", not him alone`);
    const most = Math.max(0, ...[...(dealt ? to : by).matchAll(/×(\d+)/g)].map((match) => Number(match[1])));
    if (most > foes) problems.push(`${what}: a line counts ${most} of a foe, of the ${foes} there were`);
  }
  return problems;
}

/** The canary's plant in the panel: the hero's side of its first row counted, as the log once counted him. */
function countHero(): void {
  const hero = document.querySelector('#blog .bl-line b.you');
  if (hero) hero.textContent = `${hero.textContent} ×2`;
}

/** What a round found: lines for the report and problems. */
interface Found {
  lines: string[];
  problems: string[];
}

/** `wanted` cast at its foes (each with `lives` of life, `hits`' own by default) with the log cleared first, and
 *  the log's list of what it dealt held to the hits caught as they landed. */
async function castRound(
  lab: Lab, log: BattleLog, fixture: Fixture, wanted: string, canary: boolean, lives?: number,
): Promise<Found> {
  log.clearBattleLog();
  const cast = await castAt(lab, fixture, wanted, (skill) => holdFor(skill.def), canary ? misnamedHit : null, lives);
  const name = cast.skill.def.name;
  const landed = cast.hits.slice();
  const listed = log.battleLogHits().filter((entry) => entry.dealt);
  const lines = log.battleLogLines();
  const what = lives === DYING ? `${name}, killing` : name;
  if (canary) countHero();
  const problems = [
    ...listProblems(what, landed.length, listed.length, (i) => dealtMismatch(listed[i], landed[i], cast)),
    ...panelProblems(what, lines),
    ...sidesProblems(what, true, cast.foes.length),
  ];
  const tally = `${counted(landed.length, 'hit')} landed, ${listed.length} listed`;
  const head = `  ${what}: ${tally}, in ${counted(lines.length, 'line')}`;
  return { lines: [head, ...lines.map((line) => `    ${line}`)], problems };
}

/** The skills cast held that way: those asked for, or every one he knows and can use with it. */
function skillsOf(options: LogOptions): string[] {
  if (options.skills.length) return options.skills;
  const usable = [...G.player.known.values()].filter((known) => G.player.usable(known.def));
  return usable.map((known) => known.def.name);
}

/** Every skill cast in each way of holding weapons, and the basic attack once at foes it kills. */
async function dealtRounds(lab: Lab, log: BattleLog, options: LogOptions): Promise<Found> {
  const found: Found = { lines: [], problems: [] };
  let killed = false;
  for (const gear of gearsOf(options.fixture)) {
    const fixture: Fixture = { ...options.fixture, gear };
    await lab.setup(fixture);
    found.lines.push(gear ?? G.player.cls.id);
    const skills = skillsOf(options);
    const basic = G.player.skillAt('mouse0')?.def.name;
    for (const wanted of skills) {
      const round = await castRound(lab, log, fixture, wanted, options.canary);
      found.lines.push(...round.lines);
      found.problems.push(...round.problems);
    }
    if (killed || !basic) continue;
    killed = true;
    for (const round of [
      await castRound(lab, log, fixture, basic, options.canary, DYING),
      await pauseRound(lab, log, fixture, basic, options.canary),
    ]) {
      found.lines.push(...round.lines);
      found.problems.push(...round.problems);
    }
  }
  return found;
}

/** The log paused from its panel's Pause button as the player pauses it, and `basic` cast at foes meanwhile: none of
 *  its hits listed, the panel's head saying so; then going on again and cast again, its hits listed (`castRound`).
 *  With the canary, the log goes on again at the press. */
async function pauseRound(
  lab: Lab, log: BattleLog, fixture: Fixture, basic: string, canary: boolean,
): Promise<Found> {
  const what = `${basic}, paused`;
  log.clearBattleLog();
  document.querySelector<HTMLElement>('#blog [data-bl="pause"]')!.click();
  const goOn = () => {
    log.pauseBattleLog(false);
    return true;
  };
  const cast = await castAt(lab, fixture, basic, (skill) => holdFor(skill.def), canary ? goOn : null);
  const listed = log.battleLogHits().length;
  const head = [...document.querySelectorAll('#blog .bl-head > *')].map((part) => part.textContent).join(' | ');
  log.pauseBattleLog(false);
  const problems: string[] = [];
  if (!cast.hits.length) problems.push(`${what}: struck nothing (${whereStood(cast)})`);
  if (listed) problems.push(`${what}: ${listed} of its ${cast.hits.length} hits listed while paused`);
  if (!head.includes('paused') || !head.includes('Resume')) {
    problems.push(`${what}: the panel's head reads "${head}"`);
  }
  const again = await castRound(lab, log, fixture, basic, false);
  const lines = [`  ${what}: ${counted(cast.hits.length, 'hit')} landed, ${listed} listed; its head "${head}"`];
  return { lines: [...lines, ...again.lines], problems: [...problems, ...again.problems] };
}

/** Where the hero and a cast's foes stood as it ended, and in which place: what a cast that struck nothing needs
 *  said to be looked into. */
function whereStood(cast: Cast): string {
  const at = (pos: THREE.Vector3): string => `${pos.x.toFixed(1)},${pos.z.toFixed(1)}`;
  const foes = cast.foes.map((foe) => `${at(foe.pos)}${foe.alive ? '' : ' dead'}`).join('; ');
  const hero = `the hero at ${at(G.player.pos)} facing ${G.player.facing.toFixed(2)}`;
  return `in the ${G.arena.place}, ${hero}, foes at ${foes}`;
}

/** The blows the hero takes from now on, as he took them, until `stop` is called. */
function catchBlows(): { blows: HitResult[]; stop: () => void } {
  const hero = G.player;
  const blows: HitResult[] = [];
  const takeDamage = hero.takeDamage.bind(hero);
  hero.takeDamage = (amount, type, from) => {
    const result = takeDamage(amount, type, from);
    if (result) blows.push({ ...result });
    return result;
  };
  return { blows, stop: () => Reflect.deleteProperty(hero, 'takeDamage') };
}

/** `attacker` set on the hero with the log cleared first, `BLOWS` of its blows waited for (with the canary, a blow
 *  from no foe struck after its first), and the log's list of what he took held to them. */
async function takenRound(lab: Lab, log: BattleLog, options: LogOptions, attacker: Attacker): Promise<Found> {
  await lab.setup(options.fixture);
  log.clearBattleLog();
  const hero = G.player;
  const ahead = new THREE.Vector3(Math.sin(hero.facing), 0, Math.cos(hero.facing));
  const across = new THREE.Vector3(ahead.z, 0, -ahead.x);
  const foes = Array.from({ length: attacker.count }, (_, i) => {
    const aside = (i - (attacker.count - 1) / 2) * APART;
    const at = hero.pos.clone().addScaledVector(ahead, attacker.ahead).addScaledVector(across, aside);
    return lab.spawnFoe(attacker.kind, at);
  });
  const caught = catchBlows();
  let planted = !options.canary;
  const wanted = BLOWS * attacker.count + (options.canary ? 1 : 0);
  const struck = () => {
    if (!planted && caught.blows.length) {
      hurtPlayer(hero, 1, 'physical');
      planted = true;
    }
    return caught.blows.length >= wanted;
  };
  const name = foes[0].name;
  const what = attacker.count > 1 ? `${attacker.count} ${name}s' ${attacker.attack}` : `${name}'s ${attacker.attack}`;
  try {
    await lab.until(struck, BLOW_FRAMES, `lab: log: ${what} never struck the hero ${wanted} times`);
    await lab.step(DRAW_FRAMES);
  } finally {
    caught.stop();
  }
  const listed = log.battleLogHits().filter((entry) => !entry.dealt);
  const mismatch = (i: number) => takenMismatch(listed[i], caught.blows[i], foes, attacker.attack);
  const lines = log.battleLogLines();
  if (options.canary) countHero();
  const problems = [
    ...listProblems(what, caught.blows.length, listed.length, mismatch),
    ...panelProblems(what, lines),
    ...sidesProblems(what, false, attacker.count),
  ];
  const taken = `${caught.blows.length} blows taken, ${listed.length} listed`;
  const head = `  ${what}: ${taken}, in ${counted(lines.length, 'line')}`;
  return { lines: [head, ...lines.map((line) => `    ${line}`)], problems };
}

/** Whether the canary's plants were caught: a hit listed under a misnamed skill, a blow from no foe. */
function canaryProblems(problems: string[]): string[] {
  const missed: string[] = [];
  if (!problems.some((problem) => problem.includes('(misnamed)'))) {
    missed.push('the canary\'s misnamed hits went unseen');
  }
  if (!problems.some((problem) => problem.includes('under A foe'))) {
    missed.push('the canary\'s blow from no foe went unseen');
  }
  if (!problems.some((problem) => problem.includes('not him alone'))) {
    missed.push('the canary\'s hero counted in the panel went unseen');
  }
  if (!problems.some((problem) => problem.includes('listed while paused'))) {
    missed.push('the canary\'s pause let go of went unseen');
  }
  return missed;
}

/** `lab log`: the battle log held to every hit the hero deals and takes. */
export async function log(lab: Lab, options: LogOptions): Promise<Report> {
  const game = await battleLog();
  if (!game) return { text: 'no battle log in this tree', problems: [] };
  game.setBattleLog(true, false);
  const dealt = await dealtRounds(lab, game, options);
  const taken: Found = { lines: ['taken'], problems: [] };
  for (const attacker of ATTACKERS) {
    const round = await takenRound(lab, game, options, attacker);
    taken.lines.push(...round.lines);
    taken.problems.push(...round.problems);
  }
  game.setBattleLog(false, false);
  const problems = [...dealt.problems, ...taken.problems];
  const lines = [...dealt.lines, ...taken.lines, ...problems.map((problem) => `! ${problem}`)];
  if (!options.canary) return { text: lines.join('\n'), problems };
  const missed = canaryProblems(problems);
  lines.push(`canary: ${missed.length ? missed.join('; ') : 'every plant caught'}`);
  return { text: lines.join('\n'), problems: missed };
}
