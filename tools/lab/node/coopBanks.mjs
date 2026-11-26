// `lab coop --scenarios banks`: the choice after a wave as a whole party makes it, every player banking
// (page/coopBanks.ts; from play, a party of three at wave 38: "bug here, everyone pressed bank, it instead went into spectate mode": the
// host banked and watched, his game showing the others still deciding though they had pressed Bank too).
//
// Each round is a run of its own, its wave cleared to the choice, and every player presses B in an order of the
// round's: all in one frame, the host first and each guest after him, the guests first and the host last, and all at
// once after a wave the party chose to continue (a count left from the wave before), and last all at once with the
// last guest's first Bank lost on its way to the host, as a link may lose it (main's host counted him in the run for
// good, and the party waited on him). Every game must show every player banked and go back to the lobby by itself.
// `--canary` loses every guest's every Bank on its way to the host: his game must be caught still waiting on them.
import { waitFor } from './coopEnd.mjs';

/** the frames a step waits for what it plays (the run's end takes the 2.5 s it's said in) */
const STEP_FRAMES = 600;
/** the frames between one player's press and the next one's in a staggered order: half a second */
const STAGGER_FRAMES = 30;

/**
 * The rounds: who presses B together (pages by index, the host 0), group by group, and whether the party first
 * continues a wave. Built for the party's size.
 */
function roundsFor(size) {
  const everyone = [...Array(size).keys()];
  const guests = everyone.slice(1);
  return [
    { what: 'all in one frame', groups: [everyone] },
    { what: 'the host first, then each guest', groups: everyone.map((index) => [index]) },
    { what: 'the guests first, the host last', groups: [...guests.map((index) => [index]), [0]] },
    { what: 'all in one frame, after a wave continued', groups: [everyone], continued: true },
    { what: 'all in one frame, the last guest\'s first Bank lost on the way', groups: [everyone], lostBy: size - 1 },
  ];
}

/** Every page in `group` holds `key` for a turn of frames (every page stepped), then lets it go. */
async function pressTogether(pair, call, group, key) {
  for (const index of group) await call(pair.pages[index], 'coopHold', { frame: { keys: [key] } });
  await pair.run(pair.turnFrames);
  for (const index of group) await call(pair.pages[index], 'coopHold', { frame: null });
}

/** A run of the round's own begun from the lobby, held in its countdown. Returns a problem, or null. */
async function beginRun(pair, call) {
  const [host, ...guests] = pair.pages;
  await call(host, 'coopHoldRun');
  for (const guest of guests) await call(guest, 'coopJoinAfresh');
  await call(host, 'coopStart');
  const started = await waitFor(pair, (states) => states.every((state) => state.mode === 'run'), STEP_FRAMES);
  return started.met ? null : 'the run never started on every game';
}

/** The host's wave cleared to the choice on every game. Returns a problem, or null. */
async function toTheChoice(pair, call, what) {
  for (const page of pair.pages) await call(page, 'coopClearWave');
  const cleared = await waitFor(pair, (states) => states.every((state) => state.phase === 'cleared'), STEP_FRAMES);
  return cleared.met ? null : `${what}: the wave never came to the choice on every game`;
}

/** Every player presses C, and the next wave comes to its choice too. Returns a problem, or null. */
async function continueAWave(pair, call, what) {
  const before = await call(pair.host, 'coopBanksSeen');
  await pressTogether(pair, call, [...pair.pages.keys()], 'c');
  const next = (states) => states.every((state) => state.phase === 'countdown');
  const counted = await waitFor(pair, next, STEP_FRAMES);
  if (!counted.met) return `${what}: every player pressed C, and the next wave never came on every game`;
  await call(pair.host, 'coopHoldRun');
  const problem = await toTheChoice(pair, call, what);
  if (problem) return problem;
  const after = await call(pair.host, 'coopBanksSeen');
  return after.wave === before.wave + 1 ? null : `${what}: continued from wave ${before.wave} to ${after.wave}`;
}

/** What each game shows of the choice, in a line: its own player and the partners it shows banked. */
function shownLine(seen, tags) {
  return seen.map((each, index) => {
    const own = each.own || 'still in';
    return `${tags[index]} ${own}, ${each.partnersBanked} of ${each.partners} partners banked`;
  }).join('; ');
}

/**
 * One round: a run begun (but the first, under way already), its wave cleared to the choice, every player pressing B
 * in the round's order. Every game must show every player banked and go back to the lobby by itself. Returns the
 * problems; leaves every game in the lobby, its summary closed.
 */
async function bankRound(pair, call, lines, { round, first, tags, canary }) {
  const { what, groups, continued, lostBy } = round;
  const began = first ? null : await beginRun(pair, call);
  if (began) return [`${what}: ${began}`];
  const choice = await toTheChoice(pair, call, what);
  if (choice) return [choice];
  if (continued) {
    const problem = await continueAWave(pair, call, what);
    if (problem) return [problem];
  }
  if (canary) for (const guest of pair.pages.slice(1)) await call(guest, 'coopDropBanks', { lose: 'every' });
  if (lostBy) await call(pair.pages[lostBy], 'coopDropBanks', { lose: 'first' });
  for (const [step, group] of groups.entries()) {
    if (step) await pair.run(STAGGER_FRAMES);
    await pressTogether(pair, call, group, 'b');
  }
  const pressed = await waitFor(pair, (states) => states.every((state) => state.out), STEP_FRAMES);
  const problems = [];
  if (!pressed.met) problems.push(`${what}: not every player pressed B was out of the run on his own game`);
  const back = await waitFor(pair, (states) => states.every((state) => state.mode === 'menu'), STEP_FRAMES);
  if (!back.met) {
    const seen = await Promise.all(pair.pages.map((page) => call(page, 'coopBanksSeen')));
    const stuck = back.states.flatMap((state, index) => (state.mode === 'menu' ? [] : [tags[index]]));
    lines.push(`${what}: every player pressed B; ${shownLine(seen, tags)}`);
    problems.push(`${what}: everyone banked, and ${stuck.join(' and ')} stayed in the run waiting on the others`);
  } else lines.push(`${what}: every player pressed B, and every game went back to the lobby by itself`);
  // (the canary's run is left as it stands: the host's game still waits on guests out of it on their own)
  if (!canary) await leaveForLobby(pair, call);
  return problems;
}

/** Every game sent back to the lobby as players would (a game still in the run leaves it), its summary closed. */
async function leaveForLobby(pair, call) {
  for (let tries = 0; tries < 3; tries++) {
    const states = await pair.run(pair.turnFrames);
    for (const [index, state] of states.entries()) {
      if (state.summary) await call(pair.pages[index], 'coopSummaryDone');
      else if (state.mode === 'run' && !state.out) await call(pair.pages[index], 'coopLeaveRun');
    }
    const home = await waitFor(pair, (all) => all.every((state) => state.mode === 'menu'), STEP_FRAMES);
    if (home.met) break;
  }
  const settled = await pair.run(pair.turnFrames);
  for (const [index, state] of settled.entries()) {
    if (state.summary) await call(pair.pages[index], 'coopSummaryDone');
  }
  await pair.run(pair.turnFrames);
}

/**
 * The party banks together, round by round, on a party already in a run. Returns the problems (with `canary`, the
 * first round alone: each guest's Bank lost on its way to the host, which must be caught).
 */
export async function everyoneBanks(pair, call, lines, { tags, canary }) {
  const rounds = roundsFor(pair.pages.length);
  const problems = [];
  for (const [index, round] of rounds.entries()) {
    problems.push(...await bankRound(pair, call, lines, { round, first: index === 0, tags, canary }));
    if (canary) break;
  }
  if (!canary) return problems;
  const caught = problems.some((problem) => problem.includes('waiting on the others'));
  lines.push(`canary: the guests' Bank lost on the way to the host ${caught ? 'caught' : 'missed'}`);
  const rest = problems.filter((problem) => !problem.includes('waiting on the others'));
  return caught ? rest : [...rest, 'canary missed: the guests\' Bank lost on the way to the host went unseen'];
}
