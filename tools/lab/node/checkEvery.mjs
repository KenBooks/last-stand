// `lab check --every`: every command of the lab that runs on a page, run once as a check's job, and once more with
// its canary where it has one, side by side with the rest: an audit of the whole lab in one run, each command as
// its own command line would run it (its options' defaults filled in), so a command left failing, or a canary no
// longer caught, shows in a check instead of waiting for the next agent to run it.
import { COMMANDS as HANDLERS, pageKind } from './commands.mjs';
import { parseCommandLine } from './options.mjs';

/** the hero a job of `--every` runs as where its command names none: the lab's own boot's */
export const EVERY_HERO = 'ranger';

/**
 * The commands `--every` leaves out, each with why: they need what an audit can't give them, run another way, or
 * are already a check's own jobs.
 */
export const EVERY_SKIPS = {
  // sorted
  parity: 'a run on two renderers, WebGPU too: an audit runs the default renderer alone',
  village: 'a check\'s own jobs in shards (--commands village)',
};

/**
 * The command line an audit runs `command` with: its name and what its module's `audit` adds (`hood`: the mage, in
 * his helm), a canary's argument after them.
 * @param {string} command
 * @param {{ argument: string } | null} canary
 */
function auditLine(command, canary) {
  const line = [command, ...(HANDLERS[command].audit ?? [])];
  return canary ? [...line, canary.argument] : line;
}

/** Why `command` can't run in an audit as its audit's command line runs it, or nothing when it can. */
function skipped(command) {
  if (EVERY_SKIPS[command]) return EVERY_SKIPS[command];
  try {
    const { options } = parseCommandLine(auditLine(command, null));
    HANDLERS[command].check?.({ ...options });
  } catch (error) {
    return error.message;
  }
  return undefined;
}

/**
 * The canaries a command takes, each as its command line gives it: `--canary` alone for a switch, or one for each
 * of a choice's plants (`--canary=stall`, `--canary=slow`); none without one.
 * @param {string} command
 */
export function canariesOf(command) {
  const spec = HANDLERS[command].options?.canary;
  if (!spec) return [];
  if (spec.kind === 'switch') return [{ argument: '--canary', name: 'canary' }];
  const plants = spec.choices ?? String(spec.usage ?? '').split('|').filter(Boolean);
  return plants.map((plant) => ({ argument: `--canary=${plant}`, name: `canary-${plant}` }));
}

/**
 * One job of `--every`: the command as its audit's command line runs it (or with one of its canaries), as the hero it
 * names or its default (`guard`'s warrior), else the ranger, named for what it is.
 * @param {string} command
 * @param {{ argument: string, name: string } | null} canary
 */
function everyJob(command, canary) {
  const parsed = parseCommandLine(auditLine(command, canary)).options;
  const hero = parsed.class ?? EVERY_HERO;
  const afresh = HANDLERS[command]?.keepsPage ? { afresh: true } : {};
  const options = { ...parsed, ...afresh, class: hero };
  const group = canary ? `${command}-${canary.name}-${hero}` : `${command}-${hero}`;
  return { command, heroClass: hero, options, name: group, group, page: pageKind(command, options) };
}

/**
 * The jobs `--every` adds to a check's: every command that runs on a page and isn't one of `planned` (the check's
 * own commands, run their own way), once bare and once with its canary; and what it left out, with why.
 * @param {string[]} planned
 */
export function everyJobs(planned) {
  const jobs = [];
  const left = [];
  for (const command of Object.keys(HANDLERS).sort()) {
    if (planned.includes(command) || command === 'check') continue;
    const why = skipped(command);
    if (why) {
      left.push({ command, why });
      continue;
    }
    jobs.push(everyJob(command, null));
    for (const canary of canariesOf(command)) jobs.push(everyJob(command, canary));
  }
  return { jobs, left };
}
