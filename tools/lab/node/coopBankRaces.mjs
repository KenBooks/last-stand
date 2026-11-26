// `lab coop --scenarios banks`'s races: the last guest pressing Bank with its Continue still on its way, in each order
// the two may reach the host (from the owner: "will the host know if player does that ? the race condition I mean...
// we need lab for all those"). Every game must show him banked, the rest go on to the next wave without him, then bank
// and every game go back to the lobby by itself.
//
// - His Continue lost every time, his Bank pressed while it spins: a Continue reaching the host after the Bank (held
//   up on the way) must not count him in.
// - His Continue reaching the host first, then his Bank.
// - His Continue the last vote the wave waited for: the host's countdown begins, and his Bank comes in it (main's host
//   took a Bank at the choice alone, and counted him in the run for good).
import {
  STEP_FRAMES, beginRun, leaveForLobby, pressTogether, toTheChoice, untilButton, untilSeen,
} from './coopChoiceKit.mjs';
import { waitFor } from './coopEnd.mjs';

/** the frames the host has to count a Continue, or to begin the next wave's countdown */
const COUNT_FRAMES = 120;
/** the frames a Continue held up on the way has to reach the host after the Bank */
const LATE_FRAMES = 60;

/** The races, each played by the last guest against the rest of the party. */
const RACES = [
  { what: 'the last guest banking with every Continue of his lost, its key spinning', race: 'continueLost' },
  { what: 'the last guest\'s Continue reaching the host, then his Bank', race: 'continueFirst' },
  { what: 'the last guest\'s Continue the last vote, his Bank coming in the next countdown', race: 'lastVote' },
];

/**
 * The rest of the party pressing C, and the host counting each: in its votes, or the next wave's countdown begun
 * (which clears them, where theirs were the votes it waited for). Returns a problem, or null.
 */
async function restContinue(pair, call, { rest, what }) {
  const { wave } = await call(pair.host, 'coopBanksSeen');
  await pressTogether(pair, call, rest, 'c');
  const restSlots = (seen) => rest.map((index) => seen[index].slot);
  const voted = (seen) => restSlots(seen).every((slot) => seen[0].votes.includes(slot));
  const goneOn = (seen) => seen[0].wave === wave + 1;
  const counted = (seen) => voted(seen) || goneOn(seen);
  const seen = await untilSeen(pair, call, counted, COUNT_FRAMES);
  return seen.met ? null : `${what}: the rest pressed C, and the host never counted them`;
}

/**
 * The last guest presses C, then B a turn later, his Continue lost every time where `lostEvery`. Returns whether his
 * key was spinning as he pressed B.
 */
async function continueThenBank(pair, call, { by, lostEvery }) {
  const page = pair.pages[by];
  if (lostEvery) await call(page, 'coopDropChoice', { choice: 'vote', lose: 'every' });
  await pressTogether(pair, call, [by], 'c');
  const shown = await untilButton(pair, call, page, (button) => button.spinning, pair.turnFrames);
  await pressTogether(pair, call, [by], 'b');
  return shown.met;
}

/** Whether every game shows the last guest banked: out on his own, and on every other the one partner banked. */
function shownBanked(seen, by) {
  return seen.every((each, index) => (index === by ? each.own === 'banked' : each.partnersBanked === 1));
}

/** What each game shows of him, in a line. */
function shownLine(seen, tags, by) {
  return seen.map((each, index) => (index === by
    ? `${tags[index]} ${each.own || 'still in'}`
    : `${tags[index]} shows ${each.partnersBanked} banked`)).join('; ');
}

/**
 * A Continue of his reaching the host after his Bank, as one held up on the way would: the host must not count him
 * in. Returns a problem, or null.
 */
async function lateContinue(pair, call, { by, what, lines }) {
  await call(pair.pages[by], 'coopLateContinue');
  await pair.run(LATE_FRAMES);
  const host = await call(pair.host, 'coopBanksSeen');
  const slot = (await call(pair.pages[by], 'coopBanksSeen')).slot;
  const counted = host.votes.includes(slot);
  lines.push(`${what}: a Continue of his after his Bank ${counted ? 'counted him in' : 'passed over'} on the host`);
  return counted ? `${what}: a Continue reaching the host after his Bank counted him in` : null;
}

/**
 * One race: a run begun and cleared to the choice, played as `race` says, then the rest on into the next wave
 * without him, and every player out by Bank, every game back in the lobby by itself. Returns the problems.
 */
async function playRace(pair, call, lines, { what, race, tags }) {
  const began = await beginRun(pair, call);
  if (began) return [`${what}: ${began}`];
  const choice = await toTheChoice(pair, call, what);
  if (choice) return [choice];
  const by = pair.pages.length - 1;
  const rest = [...pair.pages.keys()].filter((index) => index !== by);
  const before = (await call(pair.host, 'coopBanksSeen')).wave;
  const problems = [];
  if (race === 'lastVote') {
    const counted = await restContinue(pair, call, { rest, what });
    if (counted) return [counted];
  }
  const spinning = await continueThenBank(pair, call, { by, lostEvery: race === 'continueLost' });
  const banked = await untilSeen(pair, call, (seen) => shownBanked(seen, by), STEP_FRAMES);
  const key = spinning ? 'his key spinning' : 'his key not spinning';
  const took = `the host took it in its ${banked.seen[0].phase}`;
  lines.push(`${what}: pressed B with ${key}, ${took}; ${shownLine(banked.seen, tags, by)}`);
  if (race === 'lastVote' && banked.seen[0].phase !== 'countdown') {
    problems.push(`${what}: his Bank came before the countdown, so the race was never played`);
  }
  if (!banked.met) problems.push(`${what}: not every game shows him banked`);
  if (race === 'continueLost') {
    const late = await lateContinue(pair, call, { by, what, lines });
    if (late) problems.push(late);
  }
  if (race !== 'lastVote') {
    const counted = await restContinue(pair, call, { rest, what });
    if (counted) problems.push(counted);
  }
  const next = (seen) => seen[0].phase === 'countdown' && seen[0].wave === before + 1;
  const went = await untilSeen(pair, call, next, COUNT_FRAMES);
  lines.push(`${what}: the rest ${went.met ? 'went on to' : 'never reached'} wave ${before + 1}`);
  if (!went.met) problems.push(`${what}: the rest continued, and the next wave never came`);
  problems.push(...await restBank(pair, call, { rest, what, lines }));
  return problems;
}

/** The rest's next wave cleared to the choice and banked: every game back in the lobby by itself. Returns problems. */
async function restBank(pair, call, { rest, what, lines }) {
  await call(pair.host, 'coopHoldRun');
  const choice = await toTheChoice(pair, call, what);
  if (choice) {
    await leaveForLobby(pair, call);
    return [choice];
  }
  await pressTogether(pair, call, rest, 'b');
  const back = await waitFor(pair, (states) => states.every((state) => state.mode === 'menu'), STEP_FRAMES);
  const where = back.met ? 'every game back in the lobby by itself' : 'not every game back';
  lines.push(`${what}: the rest banked, ${where}`);
  await leaveForLobby(pair, call);
  return back.met ? [] : [`${what}: the rest banked, and not every game went back to the lobby by itself`];
}

/** Every race, on a party in the lobby. Returns the problems. */
export async function everyRace(pair, call, lines, { tags }) {
  const problems = [];
  for (const { what, race } of RACES) problems.push(...await playRace(pair, call, lines, { what, race, tags }));
  return problems;
}
