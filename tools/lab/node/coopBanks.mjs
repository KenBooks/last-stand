// `lab coop --scenarios banks`: the choice after a wave as a whole party makes it, every player banking
// (page/coopBanks.ts; from play, a party of three at wave 38: "bug here, everyone pressed bank, it instead went into
// spectate mode": the host banked and watched, his game showing the others still deciding though they had pressed
// Bank too).
//
// Each round is a run of its own, its wave cleared to the choice, and every player presses B in an order of the
// round's: all in one frame, the host first and each guest after him, the guests first and the host last, and all at
// once after a wave the party chose to continue (a count left from the wave before), and last all at once with the
// last guest's first Bank lost on its way to the host, as a link may lose it (main's host counted him in the run for
// good, and the party waited on him). Every game must show every player banked and go back to the lobby by itself.
// Two rounds continue a wave first with the last guest's Continue lost on the way (from play: "when trying to
// continue the wave... the continuing button did not work"): the first alone, which must still bring the next wave,
// and every one, its button spinning while it's sent and back to be pressed again once it's given up (from the owner:
// "show a spinner on the button, while its being sent to host... and if it failed, just show the button again without
// spinner, so player can retry"), pressed again then.
// `--canary` loses every guest's every Bank on its way to the host: his game must be caught still waiting on them.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { waitFor } from './coopEnd.mjs';
import { OUT } from './paths.mjs';

/** where `--pictures` puts the guest's screen with its Continue spinning, and given back */
const PICTURES = join(OUT, 'coop');

/** the frames a step waits for what it plays (the run's end takes the 2.5 s it's said in) */
const STEP_FRAMES = 600;
/** the frames between one player's press and the next one's in a staggered order: half a second */
const STAGGER_FRAMES = 30;
/** the frames a Continue lost every time has to be given up in, its button back (the game gives up after 4 s) */
const GIVE_UP_FRAMES = 420;

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
    { what: 'all in one frame, after a wave continued', groups: [everyone], continued: {} },
    { what: 'all in one frame, the last guest\'s first Bank lost on the way', groups: [everyone], lostBy: size - 1 },
    {
      what: 'all in one frame, after a wave continued with the last guest\'s first Continue lost',
      groups: [everyone],
      continued: { by: size - 1, lose: 'first' },
    },
    {
      what: 'all in one frame, after a wave continued with every Continue of the last guest lost till it gave up',
      groups: [everyone],
      continued: { by: size - 1, lose: 'every' },
    },
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

/**
 * Steps every page a turn at a time until `done` holds of `page`'s Continue button as drawn, at most `limit` frames.
 * Returns the button as last drawn and whether it came.
 */
async function untilButton(pair, call, page, done, limit) {
  let shown = await call(page, 'coopContinueShown');
  for (let frames = 0; !done(shown) && frames < limit; frames += pair.turnFrames) {
    await pair.run(pair.turnFrames);
    shown = await call(page, 'coopContinueShown');
  }
  return { shown, met: done(shown) };
}

/**
 * The last guest's Continue lost every time: its button must spin while it's sent, and come back to be pressed again
 * once given up; the link then lets it through and it's pressed again. Returns the problems.
 */
async function continueGivenUp(pair, call, lines, { what, by, pictures }) {
  const page = pair.pages[by];
  const spun = await untilButton(pair, call, page, (shown) => shown.spinning, pair.turnFrames * 2);
  if (pictures) await picture(pair, call, page, lines, 'continue-sending');
  const back = await untilButton(pair, call, page, (shown) => shown.pressable && !shown.spinning, GIVE_UP_FRAMES);
  if (pictures) await picture(pair, call, page, lines, 'continue-given-back');
  const spinning = spun.met ? `spinning ("${spun.shown.label}")` : 'never spinning';
  const after = back.met ? `back to be pressed ("${back.shown.label}")` : `never back ("${back.shown.label}")`;
  lines.push(`${what}: its button ${spinning} as it was sent, then ${after}`);
  const problems = [];
  if (!spun.met) problems.push(`${what}: the guest's Continue on its way showed no spinner`);
  if (!back.met) problems.push(`${what}: the guest's Continue, never counted, never gave its button back`);
  await call(page, 'coopDropChoice', { choice: 'vote', lose: false });
  await pressTogether(pair, call, [by], 'c');
  return problems;
}

/** `page`'s screen as the game draws it, into `<name>-guest.png` (`--pictures`). */
async function picture(pair, call, page, lines, name) {
  mkdirSync(PICTURES, { recursive: true });
  await call(page, 'coopDrawing', { on: true });
  await pair.run(1);
  const file = join(PICTURES, `${name}-guest.png`);
  await page.screenshot({ path: file });
  await call(page, 'coopDrawing', { on: false });
  lines.push(`pictured the guest's screen, ${name}, in ${file}`);
}

/**
 * Every player presses C, and the next wave comes to its choice too; `lost`: the guest `by`'s Continue lost on the
 * way, the first alone or every one (pressed again once given up). Returns a problem, or null.
 */
async function continueAWave(pair, call, lines, { what, lost, pictures }) {
  const before = await call(pair.host, 'coopBanksSeen');
  if (lost.lose) await call(pair.pages[lost.by], 'coopDropChoice', { choice: 'vote', lose: lost.lose });
  await pressTogether(pair, call, [...pair.pages.keys()], 'c');
  if (lost.lose === 'every') {
    const problems = await continueGivenUp(pair, call, lines, { what, by: lost.by, pictures });
    if (problems.length) return problems.join('; ');
  }
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
async function bankRound(pair, call, lines, { round, first, tags, canary, pictures }) {
  const { what, groups, continued, lostBy } = round;
  const began = first ? null : await beginRun(pair, call);
  if (began) return [`${what}: ${began}`];
  const choice = await toTheChoice(pair, call, what);
  if (choice) return [choice];
  if (continued) {
    const problem = await continueAWave(pair, call, lines, { what, lost: continued, pictures });
    if (problem) return [problem];
  }
  for (const guest of canary ? pair.pages.slice(1) : []) {
    await call(guest, 'coopDropChoice', { choice: 'bank', lose: 'every' });
  }
  if (lostBy) await call(pair.pages[lostBy], 'coopDropChoice', { choice: 'bank', lose: 'first' });
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
export async function everyoneBanks(pair, call, lines, { tags, canary, pictures = false }) {
  const rounds = roundsFor(pair.pages.length);
  const problems = [];
  for (const [index, round] of rounds.entries()) {
    const first = index === 0;
    problems.push(...await bankRound(pair, call, lines, { round, first, tags, canary, pictures }));
    if (canary) break;
  }
  if (!canary) return problems;
  const caught = problems.some((problem) => problem.includes('waiting on the others'));
  lines.push(`canary: the guests' Bank lost on the way to the host ${caught ? 'caught' : 'missed'}`);
  const rest = problems.filter((problem) => !problem.includes('waiting on the others'));
  return caught ? rest : [...rest, 'canary missed: the guests\' Bank lost on the way to the host went unseen'];
}
