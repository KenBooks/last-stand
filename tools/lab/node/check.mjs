// `lab check` (tools/lab): the measures a change to how the heroes move is checked by, every hero's, run side by side
// in sessions of their own, each against another commit (`--ab`) whose side is read back from the cache once it has
// run (sideCache.mjs). One command at a time, both sides run every time, the mage's cape stepped all along and each
// gait scenario run again for a film, the same check took 31 to 35 minutes a round; it is run hundreds of times.
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { cpus } from 'node:os';
import { CheckQueue, pageOf, planOf, taskName, tasksOf } from './checkQueue.mjs';
import { compareReports } from './checkReports.mjs';
import { isStopping } from './running.mjs';
import { exportCommit } from './commits.mjs';
import { describeError, labError } from './errors.mjs';
import { COMMANDS as HANDLERS, pageKind } from './commands.mjs';
import { COMMANDS } from './options.mjs';
import { OUT, REPO } from './paths.mjs';
import { LabSession } from './session.mjs';
import { Side, copyLabPage } from './side.mjs';
import { readKept, sideKey } from './sideCache.mjs';

/** where a check writes: each job's report, its pictures in a folder of its own, and the jobs' last durations */
export const CHECK_DIR = join(OUT, 'check');
const DURATIONS = join(CHECK_DIR, 'durations.json');
/** the heroes checked by default */
export const CHECK_CLASSES = ['warrior', 'mage', 'ranger'];
/**
 * The commands checked by default and the heroes each is for (all of `classes` when it names none): as
 * docs/agents/legs.md checks a change to the walk or the run (the gait, the stops, every joint's range and the run's
 * form for every hero, the ranger's feet and carried bow), the warrior's moves through the eyes, their light there
 * and the swings they're keyed as, the foes his charge sweeps up, the pace of Twin Fangs' blows, and every hero's hits
 * in the battle log.
 */
export const CHECK_PLAN = {
  gait: null, stops: null, range: null, form: null, feet: ['ranger'], carry: ['ranger'], eyes: ['warrior'],
  cast: ['warrior'], swing: ['warrior'], rush: ['warrior'], hits: ['warrior'], log: null,
};
/** each command's options in a check: the gait's steps listed, and no films nor pictures (a check reads the numbers:
 *  the form's of both sides, to compare, were more than the browser held, which closed); the basic attack through
 *  the eyes; a cast's light through the eyes in both biomes (its options in full: a check's aren't read from the
 *  command line, where their defaults are filled in); every swing of every weapon each way the hero holds them, the
 *  arm between the keys as the game lays it out, which the frames through the eyes read only where they see it (the
 *  backhand's way back, its lower grip within the other arm's reach at both its keys, went 13 cm past between them),
 *  with the canaries; Twin Fangs' blows quicker than a dual wielder's cleave and at most 0.2 s apart */
const CHECK_OPTIONS = {
  gait: { frames: true, films: false }, form: { pictures: false }, eyes: { _: ['cleave'], film: false },
  cast: { views: ['first'], biomes: ['crypt', 'forest'], times: [], pictures: false },
  // (every weapon each way on one page: a page for each, the check's ten jobs spent 547 s booting for 3 of stepping)
  swing: { _: ['all'], canary: true },
  rush: { pictures: false },
  hits: { _: ['twinFangs'], than: 'cleave', apart: 0.2, gear: 'dual' },
};
/**
 * the commands run a scenario a job, side by side, by whether each scenario runs from every start (`CHECK_OFFSETS`):
 * the gait's from every start on one page (each run sets a fresh hero up, so it comes out the same whatever ran
 * before it; set up again over the same hero, a scenario's gallops moved with the scenarios run before it, by as much
 * as a change being judged moved them, and a page booted for each run spent 11 of its 25 s booting); the stops', the
 * ranges' and the feet's once (whole, each was one job of 90 to 210 s, and the ranger's ended the check)
 */
export const CHECK_SPLIT = new Map([
  ['gait', { starts: true }],
  ['stops', { starts: false }],
  // (the cast's scenario runs only with a skill named, as the command whole leaves it out without one)
  ['range', { starts: false, without: ['cast'] }],
  ['feet', { starts: false }],
]);
/**
 * how many frames longer a split command's scenarios' first moves last (`--offsets`), as many of them as `--starts`
 * asks for, so every later change of way comes at another point of a stride: run so once alone, a frame's change
 * anywhere sent every later stride of a scenario elsewhere, and a change's gallops came out 2 or 3 either way over
 * a check's gait scenarios by chance; over several, the chance averages out
 */
export const CHECK_OFFSETS = [0, 7, 13, 19, 29, 3, 11, 23];
/** how many of `CHECK_OFFSETS` a check starts each split scenario from, by default */
const CHECK_STARTS = 5;
/**
 * the weapons a check swings through the eyes, by the ways the warrior holds them (src/data/classes/warrior.ts: the
 * one-handed bases with a shield and in both hands, one of them alone, the two-handed bases), each a job: a cut
 * chains with the cut before it, so a fault comes where one cut fades into the next, and it came on one weapon
 * and not another (a mace's shoulder raised past its plane, a greatsword's wrist bent past its range)
 */
export const EYES_WEAPONS = {
  shield: ['Sword', 'Axe', 'Mace'],
  dual: ['Sword', 'Axe', 'Mace'],
  oneHanded: ['Sword'],
  twoHanded: ['Greatsword', 'Greataxe', 'Maul'],
};
/** how each weapon is swung through the eyes: four cuts with the key held and the canaries, then three with a short
 *  and a long pause between them (the next cut from the guard where the last one waits, or from the rest) */
export const EYES_ROWS = {
  row: { times: 4, canary: true },
  pause: { times: 3, apart: 0.3 },
  rest: { times: 3, apart: 1.2 },
};
/**
 * the warrior's other skills a check casts through the eyes, each on every weapon of the ways of holding them it
 * takes (src/data/classes/warrior.ts `needs`; null: every way), once, with the canaries on each way's first weapon
 * (the rows above canary every weapon): with the basic attack's cuts alone checked, Power Strike, Bull Rush and
 * Thunder Crescent with a two-hander, Twin Fangs and Iron Bellow's two-hander were broken through the eyes and no
 * check said so (#252)
 */
export const EYES_SKILLS = {
  powerStrike: null, bullRush: null, tempest: null, ironBellow: null, potion: null,
  crescent: ['twoHanded'], twinFangs: ['dual'], raiseShield: ['shield'],
};
/**
 * Bull Rush's parts in a check, a job each: the sets of foes it sweeps up, and the skills cast with it with a shield
 * and with a weapon in each hand (each way's own among them: the charge cast with the shield raised, Twin Fangs in the
 * charge; with the weapons as rolled, a combo the way they were held left out was never checked)
 */
export const RUSH_PARTS = [
  { part: 'sets', options: { scenarios: ['sets'] } },
  { part: 'shield-casts', options: { scenarios: ['casts'], gear: 'shield' } },
  { part: 'dual-casts', options: { scenarios: ['casts'], gear: 'dual' } },
];
/**
 * the commands a check runs only when `--commands` names them, and the heroes each is for: the village's checks, the
 * hero `lab village` boots by default (the ranger: the fountain's arrows need his bow)
 */
export const CHECK_NAMED = { village: ['ranger'] };
/**
 * how many shards the village's checks are run in, a job each (`lab village --shard k/n`): one after another on one
 * page, the whole took over half an hour on the 4080. `--shards` asks for another count: each is about as long as
 * the others (page/villageCosts.ts), so more of them end sooner on a PC with the cores for them
 */
export const VILLAGE_SHARDS = 8;
/** the most shards `--shards` takes: past it a shard is shorter than its page's boot */
export const MOST_SHARDS = 24;
/** the most sessions side by side unasked: each is a browser and a Vite server or two, and a page's frames take a
 *  core (`--jobs` asks for more: a PC lent whole, its 32 threads idle at 8, from the owner "my 4080 laptop shows 10%
 *  CPU and 20% gpu usage, we should optimize lab checks to use up it in full") */
const MOST_WORKERS = 8;

/** The scenarios a command runs, by name, as its options list them. */
export function scenariosOf(command) {
  return COMMANDS[command]?.options.scenarios?.choices ?? [];
}

/** Each weapon's swings through the eyes and its skills cast through them, a part each: its name
 *  (`dual-Axe-pause`, `twoHanded-Maul-crescent`) and its options. */
export function eyesParts() {
  const parts = [];
  for (const [gear, weapons] of Object.entries(EYES_WEAPONS)) {
    for (const weapon of weapons) {
      for (const [row, options] of Object.entries(EYES_ROWS)) {
        parts.push({ part: `${gear}-${weapon}-${row}`, options: { gear, weapon, ...options } });
      }
      for (const skill of skillsHeld(gear)) {
        const canary = weapon === weapons[0];
        parts.push({ part: `${gear}-${weapon}-${skill}`, options: { gear, weapon, _: [skill], canary } });
      }
    }
  }
  return parts;
}

/**
 * The warrior's skills cast through the eyes for their light, a part each (`dual-powerStrike`): the basic attack and
 * `EYES_SKILLS`, by the ways of holding them, each on its way's first weapon, the frame's light and its flashes as
 * the player sees them. With the swings alone checked, a dual wielder's Power Strike flashed three times a second
 * where the left hand swept down, the ground glowed and the blade came back glinting, and Bull Rush stood the camera
 * inside the husk it threw ahead of it, half the frame its glow (#252).
 */
export function castParts() {
  const parts = [];
  for (const [gear, [weapon]] of Object.entries(EYES_WEAPONS)) {
    for (const skill of ['cleave', ...skillsHeld(gear)]) {
      parts.push({ part: `${gear}-${skill}`, options: { gear, weapon, _: [skill] } });
    }
  }
  return parts;
}

/** The skills of `EYES_SKILLS` cast with the weapons held `gear`'s way. */
function skillsHeld(gear) {
  return Object.entries(EYES_SKILLS).filter(([, gears]) => !gears || gears.includes(gear)).map(([skill]) => skill);
}

/**
 * A command's parts in a check, a job each, by name with their options: a split command's scenarios, each from
 * every start; the swings through the eyes, the casts' light, the charge's parts; or the command whole, in one job
 * (`[null]`).
 */
function partsOf(command, starts, shards) {
  if (CHECK_SPLIT.has(command)) {
    const split = CHECK_SPLIT.get(command);
    const offsets = split.starts ? { offsets: offsetsOf(starts) } : {};
    const scenarios = scenariosOf(command).filter((scenario) => !split.without?.includes(scenario));
    return scenarios.map((part) => ({ part, options: { scenarios: [part], ...offsets } }));
  }
  if (command === 'eyes') return eyesParts();
  if (command === 'cast') return castParts();
  if (command === 'rush') return RUSH_PARTS;
  if (command === 'village') return villageParts(shards);
  return [null];
}

/** The village's shards, a part each (`3of8`, `lab village --shard 3/8`). */
export function villageParts(shards = VILLAGE_SHARDS) {
  if (!Number.isInteger(shards) || shards < 1 || shards > MOST_SHARDS) {
    throw labError(`check --shards: 1 to ${MOST_SHARDS}, not ${shards}`);
  }
  return Array.from({ length: shards }, (_, index) => {
    const shard = `${index + 1}/${shards}`;
    return { part: `${index + 1}of${shards}`, options: { shard, times: true } };
  });
}

/**
 * One job: a command for a hero (or one of its parts, `of`: a scenario from each start, a weapon swung through the
 * eyes), its options, its name (where its report goes) and its group's (the command and hero, whose parts' reports
 * make one). A command a check may keep a page for (`keepsPage` in commands.mjs) builds the hero afresh at each of its
 * set-ups (`afresh`), its page kept or not, and its other side is kept under that option too: kept for a key without
 * it, a warm check found 156 of its 162 other sides missing and ran them again.
 */
function jobOf(command, heroClass, base, of = null) {
  const afresh = HANDLERS[command]?.keepsPage ? { afresh: true } : {};
  const options = { _: [], ...CHECK_OPTIONS[command], ...afresh, ...base, class: heroClass };
  const group = `${command}-${heroClass}`;
  if (!of) return { command, heroClass, options, name: group, group, page: pageKind(command, options) };
  const name = `${group}-${of.part}`;
  const partOptions = { ...options, ...of.options };
  const page = pageKind(command, partOptions);
  return { command, heroClass, options: partOptions, name, group, part: of.part, page };
}

/** The offsets a split command's scenarios start from, as many as `starts` asks (all there are at most). */
export function offsetsOf(starts = CHECK_STARTS) {
  return CHECK_OFFSETS.slice(0, Math.max(1, Math.min(CHECK_OFFSETS.length, starts)));
}

/** The jobs `options` asks for: each command of the plan (or `--commands`) for each of its heroes. */
export function jobsOf(options, plan = CHECK_PLAN) {
  const classes = options.classes ?? CHECK_CLASSES;
  const commands = options.commands ?? Object.keys(plan);
  const base = {};
  if (options.ab) base.ab = options.ab;
  const jobs = [];
  for (const command of commands) {
    const heroes = (plan[command] ?? CHECK_NAMED[command] ?? classes).filter((hero) => classes.includes(hero));
    const parts = partsOf(command, options.starts, options.shards);
    for (const heroClass of heroes) {
      for (const part of parts) jobs.push(jobOf(command, heroClass, base, part));
    }
  }
  const shared = sharedOut(jobs, options.share);
  if (!options.only) return shared;
  const wanted = options.only.split(',');
  return shared.filter((job) => wanted.some((text) => job.name.includes(text)));
}

/**
 * This PC's share of `jobs` (`--share k/n`: every n-th from the k-th, so each PC's are spread over the commands and
 * the shards alike), or all of them without one: one check run on two PCs at once, `--share 1/2` here and
 * `--share 2/2` on the lent one, each taking half; `1,2/3` takes two shares of three, for the faster PC.
 */
export function sharedOut(jobs, share) {
  if (!share) return jobs;
  const [which, of] = String(share).split('/');
  const n = Number(of);
  const taken = which.split(',').map(Number);
  const fine = Number.isInteger(n) && taken.every((k) => Number.isInteger(k) && k >= 1 && k <= n);
  if (!fine) throw labError(`check --share: k/n, the k-th of n shares (1/2; 1,2/3: two of three), not ${share}`);
  return jobs.filter((_, index) => taken.includes((index % n) + 1));
}

/** The jobs' durations as the last check found them (s, by name). */
function lastDurations() {
  if (!existsSync(DURATIONS)) return {};
  try {
    return JSON.parse(readFileSync(DURATIONS, 'utf8'));
  } catch {
    return {};
  }
}

/** `ab`'s commit resolved and exported once, its lab page copied in, before the sessions start side by side. */
function prepareOtherSide(ab) {
  if (!ab) return null;
  const { sha, dir } = exportCommit(REPO, OUT, ab === true ? 'origin/main' : ab);
  copyLabPage(REPO, dir);
  return { sha, dir };
}

/** the worker name of a check's servers: their Vite caches (`vite-check`, `.lab-vite-check`) */
const SERVING = 'check';

/**
 * The check's servers, one a side, which every session's pages are served by (each started as a page first needs it):
 * this tree's, and the other commit's. Their Vite caches are seeded from the lab server's, when they have none yet:
 * started empty, a first boot bundles the game's packages again.
 */
function servingSides(other) {
  const seeds = [[join(OUT, 'vite'), join(OUT, `vite-${SERVING}`)]];
  if (other) seeds.push([join(other.dir, '.lab-vite'), join(other.dir, `.lab-vite-${SERVING}`)]);
  for (const [from, to] of seeds) if (existsSync(from) && !existsSync(to)) cpSync(from, to, { recursive: true });
  const common = { repo: REPO, outDir: OUT, browser: null, worker: SERVING };
  const repo = new Side({ name: 'this tree', root: REPO, ...common });
  const otherSide = other ? new Side({ name: other.sha, root: other.dir, sha: other.sha, ...common }) : null;
  return { repo, other: otherSide };
}

/** A line of the check's log, under the time since it started (mm:ss). */
function logLine(started, text) {
  const seconds = Math.round((Date.now() - started) / 1000);
  const clock = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  console.log(`[${clock}] ${text}`);
}

/** Each side's counts added up over `results` (a job's, or a split command's parts): this tree's, the other's. */
export function countsOver(results) {
  const sums = { mine: {}, other: {} };
  for (const result of results) {
    for (const { mine, counts } of result.counts ?? []) {
      const sum = mine ? sums.mine : sums.other;
      for (const [name, count] of Object.entries(counts)) sum[name] = (sum[name] ?? 0) + count;
    }
  }
  return sums;
}

/** The counts in a line, each this tree's with the other side's after it (`other`, its name), or '' if none. */
export function countsLine(sums, other) {
  const names = Object.keys({ ...sums.mine, ...sums.other });
  const shown = names.map((name) => {
    const theirs = name in sums.other ? ` (${other} ${sums.other[name]})` : '';
    return `${name} ${sums.mine[name] ?? 0}${theirs}`;
  });
  return shown.join(', ');
}

/** The short name of a job's other side, as its counts are shown. */
function otherName(job) {
  return String(job.options.ab ?? 'the other').slice(0, 7);
}

/** the most of a failed job's first problem its line says (its report has the rest) */
const WHY_CHARS = 200;

/**
 * Why a failed job failed, for its line: its first problem, cut to `WHY_CHARS`, and how many more. A line that said
 * FAILED alone sent whoever watched it (a lent PC's console) to the report to learn anything (from the owner, "I think
 * we need better logging").
 */
export function whyFailed(problems) {
  if (!problems.length) return '';
  const first = problems[0].split('\n')[0];
  const cut = first.length > WHY_CHARS ? `${first.slice(0, WHY_CHARS - 1)}…` : first;
  const more = problems.length > 1 ? ` (and ${problems.length - 1} more)` : '';
  return `: ${cut}${more}`;
}

/** What a job's report says in one line: its time, the A/B's verdict, its counts, and whether it failed and why. */
function verdictOf(job, result) {
  const verdict = result.text.match(/^A\/B: .*$/m)?.[0] ?? '';
  const counts = countsLine(countsOver([result]), otherName(job));
  const state = result.ok ? 'ok' : 'FAILED';
  const tail = [verdict, counts].filter(Boolean).map((part) => `; ${part}`).join('');
  const why = result.ok ? '' : whyFailed(result.problems);
  return `${job.name}: ${state} in ${result.seconds.toFixed(0)} s${tail}${why}`;
}

/**
 * Runs the other side of `job` alone on `session`, kept for the job to read back (sideCache.mjs); logs it only if it
 * failed (the job, which runs it again then, says why).
 */
async function runOther(session, job, started) {
  const jobStarted = Date.now();
  session.outRoot = join(CHECK_DIR, job.name);
  let failed = null;
  let booting = 0;
  try {
    const ran = await session.run({ command: job.command, options: job.options, only: 'other' });
    if (ran.problems.length) failed = ran.problems.join('; ');
    booting = ran.booting;
  } catch (error) {
    failed = describeError(error).split('\n')[0];
  }
  if (failed) logLine(started, `${job.name}, its other side: ${failed}`);
  return { job, seconds: (Date.now() - jobStarted) / 1000, booting };
}

/** Runs `job` on `session`, its pictures in its own folder; writes a whole job's report, logs its line. */
async function runJob(session, job, started) {
  const jobStarted = Date.now();
  session.outRoot = join(CHECK_DIR, job.name);
  let text;
  let ok;
  let counts = [];
  let booting = 0;
  let problems = [];
  try {
    const ran = await session.run({ command: job.command, options: job.options });
    text = ran.text;
    problems = ran.problems;
    ok = ran.problems.length === 0;
    counts = ran.counts;
    booting = ran.booting;
  } catch (error) {
    text = describeError(error);
    problems = [text];
    ok = false;
  }
  const seconds = (Date.now() - jobStarted) / 1000;
  const result = { job, seconds, ok, text, counts, booting, problems };
  if (!job.part && !isStopping()) {
    writeFileSync(join(CHECK_DIR, `${job.name}.txt`), text);
    logLine(started, verdictOf(job, result));
  }
  return result;
}

/**
 * A joined report's head: its counts over all its parts, then each part's (a scenario's over the moments it started
 * from); none when nothing was counted.
 */
function countsHead(parts, other) {
  const counts = countsLine(countsOver(parts), other);
  if (!counts) return [];
  const each = parts.map((part) => `  ${part.job.part}: ${countsLine(countsOver([part]), other) || 'nothing'}`);
  const starts = parts[0].job.options.offsets?.length;
  const from = starts ? ` from ${starts} starts each` : '';
  return [[`over its ${parts.length} parts${from}: ${counts}`, ...each].join('\n')];
}

/** A part's heading in a joined report: its name (each of a scenario's runs says how much longer its first move
 *  lasted), and whether it failed. */
function partHeading(part) {
  return `=== ${part.job.part}${part.ok ? '' : ': FAILED'}`;
}

/** How many lines an A/B's verdict says differ (0 when the sides agree). */
function differing(text) {
  return Number(text.match(/^A\/B: (\d+) lines differ/m)?.[1] ?? 0);
}

/**
 * Each split command's parts put back together, a report a group (its counts over all its parts and each part's,
 * then the parts' reports in the scenarios' order, each under its scenario), and the group's line logged: its time in
 * all, the lines its A/Bs found differing, and its counts.
 */
function joinParts(done, order, started) {
  const groups = new Map();
  for (const result of done.filter((each) => each.job.part)) {
    const parts = groups.get(result.job.group) ?? [];
    parts.push(result);
    groups.set(result.job.group, parts);
  }
  for (const [group, parts] of groups) {
    parts.sort((a, b) => order.indexOf(a.job.name) - order.indexOf(b.job.name));
    const other = otherName(parts[0].job);
    const counts = countsLine(countsOver(parts), other);
    const head = countsHead(parts, other);
    const text = [...head, ...parts.map((part) => `${partHeading(part)}\n${part.text}`)].join('\n\n');
    writeFileSync(join(CHECK_DIR, `${group}.txt`), text);
    const seconds = parts.reduce((sum, part) => sum + part.seconds, 0);
    const failed = parts.filter((part) => !part.ok).map((part) => part.job.name.slice(group.length + 1));
    const state = failed.length ? `FAILED (${failed.join(', ')})` : 'ok';
    const lines = parts.reduce((sum, part) => sum + differing(part.text), 0);
    const tail = [`A/B: ${lines} lines differ`, counts].filter(Boolean).join('; ');
    const firstFailed = parts.find((part) => !part.ok);
    const why = firstFailed ? whyFailed(firstFailed.problems ?? []) : '';
    logLine(started, `${group}: ${state}, ${parts.length} runs in ${seconds.toFixed(0)} s; ${tail}${why}`);
  }
}

/**
 * A session working through the queue until it's empty, its pages served by `serving` (and kept from task to task,
 * `keepPages`): each task's time in `times`, each job's result in `done`.
 */
async function work({ worker, serving, queue, started, done, times, keepPages }) {
  const session = await LabSession.open({ worker, serving, keepPages });
  let page = null;
  try {
    for (let next = queue.next(page, worker); next; next = queue.next(page, worker)) {
      const { task, before } = next;
      const running = (async () => {
        await before;
        if (task.side === 'other') return runOther(session, task.job, started);
        return runJob(session, task.job, started);
      })();
      queue.started(task, running);
      const result = await running;
      times[taskName(task)] = timeOf(result, pageOf(task) === page);
      if (task.side === 'mine') done.push(result);
      page = pageOf(task);
    }
  } finally {
    await session.close();
  }
}

/** What a task took, as durations.json keeps it (s): its own work and its boot, and whether its page was booted
 *  again for it although the session had one of its side and hero up (`reboots`, checkQueue.mjs `lastRun`). */
function timeOf(result, samePage) {
  const boot = Math.round(result.booting * 10) / 10;
  const step = Math.round((result.seconds - result.booting) * 10) / 10;
  return { step, boot, reboots: samePage && boot > 0 };
}

/** The check `tasks` would make in `workers` sessions, by what each last took (`--plan`): logged, session by session,
 *  with its projected end. */
function logPlan(tasks, workers, durations) {
  const plan = planOf(tasks, workers, durations);
  const clock = (seconds) => {
    const whole = Math.round(seconds);
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
  };
  plan.sessions.forEach((session, index) => {
    console.log(`session ${index + 1}: ${session.tasks} tasks, ${session.boots} boots, done at ${clock(session.end)}`);
  });
  const work = plan.sessions.reduce((sum, session) => sum + session.end, 0);
  const boots = plan.sessions.reduce((sum, session) => sum + session.boots, 0);
  console.log(`projected: ${clock(plan.end)} (${Math.round(work)} s of sessions' time, ${boots} boots of ${plan.boot} s)`);
}

/** Whether `job`'s other side must run (an A/B's, not kept yet or `fresh`), its key as the session keeps it. */
function runsOtherOf(sha, fresh) {
  if (!sha) return () => false;
  return (job) => {
    if (fresh) return true;
    const key = sideKey({ sha, heroClass: job.options.class, command: job.command, options: job.options });
    return readKept(key) === null;
  };
}

/**
 * `lab check`: the jobs run side by side in `--jobs` sessions (as many as there are jobs, up to `MOST_WORKERS` and a
 * core in three), an A/B's other side first where it isn't kept, the longest first, each session's page kept for the
 * next task of its side and hero (`--reuse=false`: a page booted for each); each report in
 * out/check/<command>-<hero>.txt. Returns the exit status.
 */
export async function runCheck(options) {
  const started = Date.now();
  mkdirSync(CHECK_DIR, { recursive: true });
  const other = prepareOtherSide(options.ab);
  const sha = other?.sha;
  const jobs = jobsOf(sha ? { ...options, ab: sha } : options);
  const durations = lastDurations();
  const tasks = tasksOf(jobs, runsOtherOf(sha, options.fresh), durations);
  const queue = new CheckQueue(tasks);
  const workers = Math.min(options.jobs ?? Math.min(MOST_WORKERS, Math.ceil(cpus().length / 3)), tasks.length);
  if (options.plan) {
    logPlan(tasks, workers, durations);
    return 0;
  }
  const serving = servingSides(other);
  const others = tasks.length - jobs.length;
  const against = sha ? `, against ${sha.slice(0, 7)} (its side run for ${others}, kept for the rest)` : '';
  logLine(started, `${jobs.length} jobs in ${workers} sessions${against}`);
  const done = [];
  const times = {};
  const keepPages = options.reuse !== false;
  const each = { serving, queue, started, done, times, keepPages };
  try {
    await Promise.all(Array.from({ length: workers }, (_, index) => work({ worker: index + 1, ...each })));
  } finally {
    await Promise.allSettled([serving.repo.server?.close(), serving.other?.server?.close()]);
  }
  // (stopped: what failed as its browsers closed is no result, and its time no job's)
  if (isStopping()) return 1;
  joinParts(done, jobs.map((job) => job.name), started);
  writeFileSync(DURATIONS, JSON.stringify({ ...durations, ...times }, null, 2));
  const failed = done.filter((result) => !result.ok);
  const shown = relative(REPO, CHECK_DIR).split('\\').join('/');
  logLine(started, `done: ${done.length - failed.length} ok, ${failed.length} failed; the reports in ${shown}`);
  // (each failed job again with why, where the end of the log is all that's read)
  for (const result of failed) logLine(started, `  ${result.job.name}${whyFailed(result.problems ?? [])}`);
  const unlike = options.like ? logLikeness(jobs, options.like, started) : 0;
  return failed.length || unlike ? 1 : 0;
}

/** Each report this check wrote against `like`'s of the same name (`--like`), logged; how many differ. */
function logLikeness(jobs, like, started) {
  const names = [...new Set(jobs.map((job) => `${job.group}.txt`))];
  const compared = compareReports(CHECK_DIR, resolve(REPO, like), names);
  const unlike = compared.filter((report) => !report.same);
  for (const report of unlike) console.log(report.text);
  logLine(started, `like ${like}: ${compared.length - unlike.length} of ${compared.length} reports the same`);
  return unlike.length;
}
