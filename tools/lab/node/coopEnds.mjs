// `lab coop --scenarios ends`: the ways a co-op run ends that left a player apart from the party, played on a pair as
// players play them (page/coopEnds.ts; from play: "once the run ends and no one is playing any wave it should
// automatically spawn you back with the others"). `coopEnd.mjs` plays the usual ends after every `coop` (a bank, each
// leaving in turn); these are the others.
//
// - The host out, leaving again: the host leaves the run and watches the guest play on, then opens the pause menu to
//   leave once more. His game is the one that runs the fight, so it must stay in the run until the guest is out of it
//   too (it went to the lobby: the guest's fight stopped where it stood, with no wave to come and no end to send him
//   back). Then the guest leaves, and every game must be back in the lobby by itself, the heroes together.
// - The party falls: a second run, the guest struck down and then the host, with nobody left to raise them. Every
//   game must be back in the lobby by itself, the heroes together.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { waitFor } from './coopEnd.mjs';
import { OUT } from './paths.mjs';

/** where `--pictures` puts both screens at each end's moments */
const PICTURES = join(OUT, 'coop');

/** the frames a step waits for what it plays (the run's end takes the fall's 2.6 s and the 2.5 s it's said) */
const STEP_FRAMES = 600;
/** the frames the host's game is watched after he leaves the run again: over the 2.5 s a run's end takes to send a
 *  game back */
const LEFT_AGAIN_FRAMES = 240;
/** the frames each hero's place has to reach the other's game, back in the lobby (the link and its timeline) */
const SETTLE_FRAMES = 120;
/** how far apart two heroes back from a run may stand, m: each comes out by the way the party went in (the panels'
 *  lobby's spots are 1.6 m apart, a party of four's ends 4.8) */
const TOGETHER_M = 6;
/** the least two heroes back from a run stand apart, m: over a body's radius (in the village each game put its hero on
 *  the portal's one spot, 0.0 m from the other, one standing in another) */
const LEAST_APART_M = 0.6;

/** the canary's problem: the host's game out of the run while the guest plays on */
const HOST_GONE = 'went back to the lobby while';

/** Both screens pictured as the game draws them, into `ends-<name>-<host|guest>.png` (`--pictures`). */
async function picture(pair, call, lines, name) {
  mkdirSync(PICTURES, { recursive: true });
  for (const page of pair.pages) await call(page, 'coopDrawing', { on: true });
  await pair.run(1);
  for (const [index, page] of pair.pages.entries()) {
    await page.screenshot({ path: join(PICTURES, `ends-${name}-${index ? 'guest' : 'host'}.png`) });
  }
  for (const page of pair.pages) await call(page, 'coopDrawing', { on: false });
  lines.push(`pictured both screens, ${name}, in ${PICTURES}`);
}

/**
 * Every game back in the lobby by itself after `what`, the heroes together on every screen. Returns the problems;
 * leaves every game in the lobby, its summary closed.
 */
async function backTogether(pair, call, lines, { tags, what, shot = null }) {
  const problems = [];
  const back = await waitFor(pair, (states) => states.every((state) => state.mode === 'menu'), STEP_FRAMES);
  if (!back.met) {
    const left = back.states.flatMap((state, index) => (state.mode === 'menu' ? [] : [tags[index]]));
    problems.push(`${what}: ${left.join(' and ')} never went back to the lobby by itself`);
  }
  const states = await pair.run(SETTLE_FRAMES);
  const said = states.map((state, index) => {
    if (state.mode !== 'menu') return `${tags[index]} still in the run`;
    const summary = state.summary ? ', its summary to read' : '';
    return `${tags[index]} in the lobby ${state.apart.toFixed(1)} m from its partner${summary}`;
  });
  lines.push(`${what}, with nothing clicked: ${said.join('; ')}`);
  for (const [index, state] of states.entries()) {
    if (state.mode !== 'menu') continue;
    if (state.hidden) problems.push(`${what}: ${tags[index]}'s lobby doesn't show its partner`);
    else if (state.apart > TOGETHER_M) {
      problems.push(`${what}: on ${tags[index]}'s screen the heroes stand ${state.apart.toFixed(1)} m apart in the lobby`);
    } else if (state.apart < LEAST_APART_M) {
      problems.push(`${what}: on ${tags[index]}'s screen the heroes stand in one another in the lobby (${state.apart.toFixed(1)} m)`);
    }
  }
  for (const [index, state] of states.entries()) {
    if (state.summary) await call(pair.pages[index], 'coopSummaryDone');
    else if (state.mode === 'run') await call(pair.pages[index], 'coopQuitCanary');
  }
  await pair.run(pair.turnFrames);
  if (shot) await picture(pair, call, lines, shot);
  return problems;
}

/**
 * The host out of the run and watching, leaving it again from the pause menu as the guest plays on. Returns the
 * problems (with `canary`: the host's game dropped out of the run behind its back, to be caught).
 */
async function hostLeavesAgain(pair, call, lines, { tags, canary, pictures }) {
  const [host, guest] = pair.pages;
  await call(host, 'coopHoldRun');
  await call(host, 'coopLeaveRun');
  const fallen = await waitFor(pair, (states) => states[0].summary, STEP_FRAMES);
  if (!fallen.met) return ['the host left the run, and no summary came'];
  await call(host, 'coopSummaryDone');
  const watching = await waitFor(pair, (states) => !states[0].summary, STEP_FRAMES);
  if (!watching.met) return ['the host\'s summary never closed for him to watch the guest'];
  const offered = await call(host, 'coopLeaveAgain');
  if (canary) await call(host, 'coopQuitCanary');
  const [hostNow, guestNow] = await pair.run(LEFT_AGAIN_FRAMES);
  if (pictures) await picture(pair, call, lines, 'host-left-again');
  const hostIs = hostNow.mode === 'run' ? 'still runs the fight' : 'went to the lobby';
  const guestIs = guestNow.mode === 'run' && !guestNow.out ? 'plays on' : 'is out of the run';
  const menu = offered ? 'Leave the run held again' : 'no Leave the run in his pause menu';
  lines.push(`the host out and watching, ${menu}: his game ${hostIs}, the guest ${guestIs}`);
  const problems = [];
  if (guestNow.mode !== 'run' || guestNow.out) problems.push('the guest was put out of the run by the host leaving it');
  if (hostNow.mode !== 'run') {
    problems.push(`the host's game ${HOST_GONE} the guest played on: his fight stopped, no wave or end to come`);
  }
  if (canary) return problems;
  await call(guest, 'coopLeaveRun');
  const shot = pictures ? 'back-together' : null;
  problems.push(...await backTogether(pair, call, lines, { tags, what: 'the host out first, then the guest', shot }));
  return problems;
}

/** A second run in which the whole party falls: the guest struck down, then the host. Returns the problems. */
async function partyFalls(pair, call, lines, { tags, pictures }) {
  const [host, guest] = pair.pages;
  await call(host, 'coopHoldRun');
  await call(host, 'coopStart');
  const started = await waitFor(pair, (states) => states.every((state) => state.mode === 'run'), STEP_FRAMES);
  if (!started.met) return ['the run in which the party falls never started on every game'];
  await call(guest, 'coopFall');
  const down = await waitFor(pair, (states) => states[1].down && states[0].partnersDown === 1, STEP_FRAMES);
  if (!down.met) return ['the guest struck down was never down on both games'];
  await call(host, 'coopFall');
  return backTogether(pair, call, lines, { tags, what: 'the whole party fallen', shot: pictures ? 'party-fallen' : null });
}

/**
 * The ends of a run that left a player apart, on a pair already in a run. Returns the problems (with `canary`, the
 * first end's alone: the host's game dropped out of the run as the guest plays on, which must be caught).
 */
export async function runsEnds(pair, call, lines, { tags, canary, pictures = false }) {
  const problems = await hostLeavesAgain(pair, call, lines, { tags, canary, pictures });
  if (!canary) return [...problems, ...await partyFalls(pair, call, lines, { tags, pictures })];
  const caught = problems.some((problem) => problem.includes(HOST_GONE));
  lines.push(`canary: the host's game out of the run as the guest plays on ${caught ? 'caught' : 'missed'}`);
  const rest = problems.filter((problem) => !problem.includes(HOST_GONE));
  return caught ? rest : [...rest, 'canary missed: the host\'s game out of the run went unseen'];
}
