// `lab check --every`: every command that runs on a page as a job, bare and with each canary, the check's own
// commands and those an audit can't run left out with why.
import assert from 'node:assert/strict';
import test from 'node:test';
import { CHECK_PLAN, jobsOf } from '../node/check.mjs';
import { EVERY_HERO, EVERY_SKIPS, canariesOf, everyJobs } from '../node/checkEvery.mjs';
import { COMMANDS } from '../node/commands.mjs';

const PLANNED = Object.keys(CHECK_PLAN);

test('every command on a page is run or left out with why, none of the check\'s own', () => {
  const { jobs, left } = everyJobs(PLANNED);
  const run = new Set(jobs.map((job) => job.command));
  const leftOut = new Set(left.map((entry) => entry.command));
  for (const command of Object.keys(COMMANDS)) {
    if (PLANNED.includes(command) || command === 'check') {
      assert.ok(!run.has(command) && !leftOut.has(command), command);
      continue;
    }
    assert.ok(run.has(command) !== leftOut.has(command), `${command}: run or left out, once`);
  }
  for (const entry of left) assert.ok(entry.why, entry.command);
});

test('a command that needs its argument, or is skipped by name, is left out', () => {
  const { left } = everyJobs(PLANNED);
  const why = Object.fromEntries(left.map((entry) => [entry.command, entry.why]));
  assert.match(why.eval ?? '', /needs its/);
  for (const command of Object.keys(EVERY_SKIPS)) assert.equal(why[command], EVERY_SKIPS[command]);
});

test('each job is the bare command line as the ranger, or once a canary, its defaults filled in', () => {
  const { jobs } = everyJobs(PLANNED);
  const houses = jobs.filter((job) => job.command === 'houses');
  assert.deepEqual(houses.map((job) => job.name), [`houses-${EVERY_HERO}`, `houses-canary-${EVERY_HERO}`]);
  assert.equal(houses[1].options.canary, true);
  for (const job of jobs) assert.equal(job.options.class, job.heroClass);
});

test('a command runs as the hero it defaults to, and with what its module\'s audit adds', () => {
  const { jobs } = everyJobs(PLANNED);
  const named = (name) => jobs.find((job) => job.name === name);
  assert.ok(named('guard-warrior'), 'guard as its default hero, the warrior');
  const hood = named('hood-mage');
  assert.ok(hood, 'hood as its audit names, the mage');
  assert.deepEqual(hood.options.wear, ['helm']);
  assert.ok(named('perf-ranger').options.village, 'perf round the village');
});

test('a canary that\'s a choice is a job for each of its plants', () => {
  const choices = Object.keys(COMMANDS).find((command) => canariesOf(command).length > 1);
  assert.ok(choices, 'some command plants one of several canaries');
  const names = canariesOf(choices).map((canary) => canary.name);
  assert.ok(names.every((name) => name.startsWith('canary-')));
});

test('--every adds its jobs to the check\'s, and --only still picks among them', () => {
  const plain = jobsOf({ classes: ['ranger'] });
  const every = jobsOf({ classes: ['ranger'], every: true });
  assert.ok(every.length > plain.length);
  const village = jobsOf({ commands: ['village'], every: true });
  assert.ok(!village.some((job) => job.command === 'gait'), 'the plan\'s commands stay out with --commands');
  const only = jobsOf({ every: true, only: 'houses' });
  assert.deepEqual(only.map((job) => job.name), ['houses-ranger', 'houses-canary-ranger']);
});
