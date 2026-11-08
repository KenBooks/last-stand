// The lab's co-op (`npm run lab -- coop`): the host's game in the side's page and the guest's in a partner page beside
// it (`--party 3` or `4`: the party's other heroes in pages of their own), stepped together a turn of frames at a time
// on the lab's clock, the messages each sends carried to every other as a link of `--ping` and `--jitter` delivers
// them: each way half the ping and up to the jitter later, in the order sent (a WebSocket's TCP never reorders, so a
// late message holds up the ones behind it), and every couple of seconds on average a stall of several times the
// jitter (a mobile network's). The pages play each scenario (page/coop.ts), and what the host and the guest showed is
// judged against each other (coopJudge.mjs); a party's room is judged as it fills (`judgeRoom`).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { labError } from './errors.mjs';
import { judgeScenario } from './coopJudge.mjs';
import { OUT } from './paths.mjs';

/** where `--pictures` puts each scenario's pictures of the two screens */
const PICTURES = join(OUT, 'coop');

/** the round trip's least and how much later each way may be, ms, unless the command says */
export const DEFAULT_PING = 300;
export const DEFAULT_JITTER = 60;
/** how often on average the link stalls, ms (by time: a message's chance of one is its share of that since the one
 *  before), and how many jitters late a stalled message comes */
const STALL_EVERY = 2000;
const STALL_JITTERS = 3;
/** the most frames a turn runs (a turn can't be longer than the quickest message takes, or it would come late) */
const MOST_TURN = 8;
/** the frames the guest has to join, and the run to start on both, before the command gives up */
const JOIN_FRAMES = 1800;
/** the frames the guest's lobby has to become practice */
const PRACTICE_FRAMES = 60;
const START_FRAMES = 900;
/** the seed the link's delays are drawn from */
const LINK_SEED = 0x9e3779b9;
/** each page's name tag: the host's, the guest's, the party's others' (the third first joins as the guest's) */
export const PARTY_TAGS = ['Host', 'Guest', 'Third', 'Fourth'];
/** the most heroes a party has (the game's `COOP.maxPlayers`) */
export const PARTY_MOST = 4;

/** Random numbers in [0, 1) from `seed`, the same every time (mulberry32). */
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** One way of the link: each message sent (page/coop.ts `Sent`) given the time it arrives, in the order sent. */
export class Way {
  constructor({ delay, jitter, random }) {
    this.delay = delay;
    this.jitter = jitter;
    this.random = random;
    this.last = 0;
    this.lastSent = 0;
  }

  /** The messages `sent`, as they arrive (page/coop.ts `Arriving`). */
  carry(sent) {
    return sent.map((message) => {
      const stalled = this.random() < (message.at - this.lastSent) / STALL_EVERY;
      this.lastSent = message.at;
      const late = this.jitter * this.random() * (stalled ? STALL_JITTERS : 1);
      const due = Math.max(this.last, message.at + this.delay + late);
      this.last = due;
      return { due, name: message.name, data: message.data };
    });
  }
}

/** Calls `fn` of page/coop.ts in `page` with the page's lab and `args`. */
function callPage(page, fn, args = {}) {
  return page.evaluate(async ([fn, args]) => {
    const coop = await import('/tools/lab/page/coop.ts');
    return coop[fn](window.__lab, args);
  }, [fn, args]);
}

/**
 * The room as each of a party's pages knows it (page/coop.ts `CoopState`, the host's first): the problems with it.
 * Every page must have every other as a partner, each in a slot of its own, and know each by its name tag.
 */
export function judgeRoom(states, tags) {
  const problems = [];
  const slots = states.map((state) => state.slot);
  if (new Set(slots).size !== slots.length) problems.push(`two players share a slot (${slots.join(', ')})`);
  states.forEach((state, index) => {
    const others = states.filter((_, other) => other !== index);
    if (state.partners !== others.length) {
      problems.push(`${tags[index]}'s game has ${state.partners} partners, not ${others.length}`);
      return;
    }
    const expected = others.slice().sort((a, b) => a.slot - b.slot);
    const wantTags = expected.map((other) => other.tag).join(', ');
    if (state.partnerTags.join(', ') !== wantTags) {
      problems.push(`${tags[index]}'s game names its partners ${state.partnerTags.join(', ')}, not ${wantTags}`);
    }
    const wantSlots = expected.map((other) => other.slot).join(', ');
    if (state.partnerSlots.join(', ') !== wantSlots) {
      const slots = state.partnerSlots.join(', ');
      problems.push(`${tags[index]}'s game has its partners in slots ${slots}, not ${wantSlots}`);
    }
  });
  return problems;
}

/**
 * The heroes' colours as each of a party's pages shows them (page/coop.ts `CoopState`, the host's first), each
 * player having picked `picked` (null: none): the problems with them, or null for an older tree that has none.
 * Every player wears a colour, none the same as another's, its pick where no one before it had it; every page
 * knows each partner's colour as that partner's own game has it, and draws its cloth as that game draws it.
 */
export function judgeColours(states, tags, picked) {
  if (states[0].colour === undefined) return null;
  const problems = [];
  const colours = states.map((state) => state.colour);
  colours.forEach((colour, index) => { if (!colour) problems.push(`${tags[index]} wears no colour`); });
  if (new Set(colours).size !== colours.length) problems.push(`two players wear one colour (${colours.join(', ')})`);
  states.forEach((state, index) => {
    const free = !picked.slice(0, index).includes(picked[index]);
    if (picked[index] && free && state.colour !== picked[index]) {
      problems.push(`${tags[index]} picked ${picked[index]}, free, and wears ${state.colour}`);
    }
    const others = states.filter((_, other) => other !== index).sort((a, b) => a.slot - b.slot);
    const want = others.map((other) => other.colour).join(', ');
    if ((state.partnerColours ?? []).join(', ') !== want) {
      problems.push(`${tags[index]}'s game has its partners in ${state.partnerColours.join(', ')}, not ${want}`);
    }
    const drawn = others.map((other) => other.worn).join(', ');
    if ((state.partnerWorn ?? []).join(', ') !== drawn) {
      problems.push(`${tags[index]}'s game draws its partners' cloth otherwise than their own games do`);
    }
  });
  return problems;
}

/** The colours line and problems of a room (`judgeColours`), pushed onto `lines` and returned. */
function colourLines(states, picked, lines) {
  const tags = PARTY_TAGS.slice(0, states.length);
  const problems = judgeColours(states, tags, picked);
  if (!problems) {
    lines.push('colours: none (an older tree)');
    return [];
  }
  const wore = (state, index) => `${tags[index]} ${state.colour} (picked ${picked[index] ?? 'none'})`;
  lines.push(`colours: ${states.map(wore).join(', ')}`);
  return problems;
}

/** The canary's verdict, its line pushed onto `lines`: the guest in the host's colour must have been caught. */
function canaryLines(problems, lines) {
  const caught = problems.some((problem) => problem.includes('wear one colour'));
  lines.push(`canary: the guest dressed in the host's colour ${caught ? 'caught' : 'missed'}`);
  return caught ? [] : ['canary missed: the guest in the host\'s colour went unseen'];
}

/** each party page's pick, by place: the host's honoured, the guest's none (one at random, not the host's), the
 *  third's the host's (taken: one at random), the fourth's none */
export const PARTY_PICKS = ['red', null, 'red', null];

/** Where each page stood when a wait gave up: its status, slot and the partners it had. */
function describeStates(states) {
  const described = states.map((state, index) => {
    const partners = state.partnerTags?.length ? state.partnerTags.join(', ') : `${state.partners} partners`;
    return `${PARTY_TAGS[index]}: ${state.status} in slot ${state.slot} with ${partners}`;
  });
  return described.join('; ');
}

/** The party's games (the host's, the guest's, any others') and the links between them, stepped together. */
class Pair {
  constructor({ pages, ping, jitter, frameMs }) {
    this.pages = pages;
    const random = seededRandom(LINK_SEED);
    // (one way from each page to each other, all drawing from one stream: with two, the host's way to the guest
    // and back, as a pair has always had them)
    this.ways = pages.map((_, from) => pages.map((__, to) => (
      from === to ? null : new Way({ delay: ping / 2, jitter, random }))));
    this.inboxes = pages.map(() => []);
    // (a turn's messages are handed over after it, so none may be due before the next turn ends)
    this.turnFrames = Math.max(1, Math.min(MOST_TURN, Math.floor(ping / 2 / frameMs)));
  }

  get host() {
    return this.pages[0];
  }

  get guest() {
    return this.pages[1];
  }

  /** Runs `frames` frames on both games, a turn at a time, playing `scenario` (none: standing). */
  async run(frames, scenario) {
    let states = null;
    for (let done = 0; done < frames; done += this.turnFrames) {
      states = await this.turn(Math.min(this.turnFrames, frames - done), scenario);
    }
    return states;
  }

  /**
   * Runs frames until `done(hostState, guestState, states)` (`states`: every page's, the host's first), at most
   * `limit`, and returns every page's states; throws, saying `what` failed, if it never is.
   */
  async until(done, limit, what) {
    let states = [];
    for (let frames = 0; frames < limit; frames += this.turnFrames) {
      states = await this.turn(this.turnFrames);
      if (done(states[0], states[1], states)) return states;
    }
    throw labError(`coop: ${what} (not within ${limit} frames; ${describeStates(states)})`);
  }

  /** Runs `frames` frames on every page, then carries what each sent to every other. Returns every page's state. */
  async turn(frames, scenario) {
    const turns = await Promise.all(this.pages.map((page, index) => {
      const arriving = this.inboxes[index].splice(0);
      return callPage(page, 'coopFrames', { arriving, frames, scenario });
    }));
    turns.forEach((turn, from) => {
      this.ways[from].forEach((way, to) => {
        if (way) this.inboxes[to].push(...way.carry(turn.sent));
      });
    });
    return turns.map((turn) => turn.state);
  }

  /**
   * Runs `frames` frames playing `scenario`, picturing both screens at each of `at` (frames from the start, as drawn:
   * the frame before is drawn as the game draws it) into `PICTURES`. Returns the pictures' files.
   */
  async runPicturing(frames, scenario, at) {
    mkdirSync(PICTURES, { recursive: true });
    const files = [];
    let done = 0;
    for (const frame of [...at].sort((a, b) => a - b)) {
      if (frame <= done || frame > frames) continue;
      await this.run(frame - 1 - done, scenario);
      await Promise.all([this.host, this.guest].map((page) => callPage(page, 'coopDrawing', { on: true })));
      await this.turn(1, scenario);
      for (const [role, page] of [['host', this.host], ['guest', this.guest]]) {
        const file = join(PICTURES, `${scenario}-${frame}-${role}.png`);
        await page.screenshot({ path: file });
        files.push(file);
      }
      await Promise.all([this.host, this.guest].map((page) => callPage(page, 'coopDrawing', { on: false })));
      done = frame;
    }
    await this.run(frames - done, scenario);
    return files;
  }

  /** Readies every page's random numbers again, as a command does. */
  async reseed() {
    await Promise.all(this.pages.map((page) => page.evaluate(() => window.__lab.begin())));
  }
}

/**
 * The room opened on the host, the guest in it practising in its lobby while it waits (as a player does), and the
 * run started on both. Returns the problems of the start: a game whose hero casts freely in the run, as the guest's
 * did, begun in practice.
 */
async function startTogether(pair, link, lines, canary) {
  await pair.reseed();
  const opening = (index) => ({ tag: PARTY_TAGS[index], colour: PARTY_PICKS[index], ...link });
  const code = await callPage(pair.host, 'coopOpen', { role: 'host', ...opening(0) });
  await callPage(pair.guest, 'coopOpen', { role: 'guest', code, ...opening(1) });
  const joined = (host, guest) => guest.status === 'joined' && host.partners > 0 && guest.partners > 0;
  let pairStates = await pair.until(joined, JOIN_FRAMES, 'the guest never joined the room');
  if (canary && pairStates[0].colour !== undefined) {
    await callPage(pair.guest, 'coopWearColour', { colour: pairStates[0].colour });
    pairStates = await pair.until(() => true, 1, 'no frame ran');
  }
  let problems;
  if (pair.pages.length > 2) problems = await fillTheRoom(pair, code, link, lines);
  else {
    const colours = colourLines(pairStates, PARTY_PICKS.slice(0, 2), lines);
    problems = canary ? canaryLines(colours, lines) : colours;
  }
  await callPage(pair.guest, 'coopPractise');
  const practising = (host, guest) => guest.stowed && !guest.free;
  await pair.until(practising, PRACTICE_FRAMES, 'the guest\'s lobby never became practice');
  await pair.reseed();
  await callPage(pair.host, 'coopStart');
  const inRun = (host, guest, states) => states.every((state) => state.mode === 'run');
  const states = await pair.until(inRun, START_FRAMES, 'the run never started on every game');
  const free = states.flatMap((state, index) => (state.free ? [PARTY_TAGS[index]] : []));
  problems.push(...free.map((tag) => `${tag}'s run kept the lobby's free casting (no costs or cooldowns)`));
  return problems;
}

/** the frames each step of the way back to the lobby has (a player out heard by the others, the run's end, the
 *  lobby) */
const LOBBY_FRAMES = 600;
/** the frames the lobby's practice has to show its bar */
const SETTLE_LOBBY_FRAMES = 30;

/**
 * Every hero leaves the run as a player does, the guest first (Leave the run held in the pause menu), every game back
 * in the lobby from its summary once the run is over, and practising there (its panels stowed). Returns the problems:
 * a game whose lobby's practice shows no skill bar (after a co-op run, the run's watching look hid it in the lobby,
 * through the hero selection screen too).
 */
async function backToLobby(pair, lines) {
  const order = [1, ...pair.pages.map((_, index) => index).filter((index) => index !== 1)];
  for (const index of order) {
    await callPage(pair.pages[index], 'coopLeaveRun');
    await pair.run(pair.turnFrames);
  }
  const over = (host, guest, states) => states.every((state) => state.out && state.runOver && state.summary);
  await pair.until(over, LOBBY_FRAMES, 'the run never ended with every game on its summary');
  for (const page of pair.pages) await callPage(page, 'coopSummaryDone');
  const inLobby = (host, guest, states) => states.every((state) => state.mode === 'menu');
  await pair.until(inLobby, LOBBY_FRAMES, 'not every game went back to the lobby');
  for (const page of pair.pages) await callPage(page, 'coopPractiseAgain');
  await pair.run(SETTLE_LOBBY_FRAMES);
  const bars = await Promise.all(pair.pages.map((page) => callPage(page, 'coopLobbyBar')));
  const problems = [];
  const said = bars.map((bar, index) => {
    const shown = bar.bar && bar.skills > 0;
    if (!bar.practising) problems.push(`${PARTY_TAGS[index]}'s lobby never became practice after the run`);
    else if (!shown) {
      problems.push(`${PARTY_TAGS[index]}'s lobby practice after the run shows no skill bar (#hud.${bar.hud})`);
    }
    return `${PARTY_TAGS[index]} ${shown ? `${bar.skills} skills` : 'no skill bar'}`;
  });
  lines.push(`back in the lobby after leaving the run, practising: ${said.join(', ')}`);
  problems.push(...await hallWithPartners(pair, lines));
  problems.push(...await tagsShown(pair, lines));
  return problems;
}

/**
 * Every game's name tags over the whole of it (the scenarios, the lobby after them): each hero it showed in its
 * camera's view, its own too, must have had its tag drawn over it every frame. Returns the problems.
 */
async function tagsShown(pair, lines) {
  const problems = [];
  const seen = await Promise.all(pair.pages.map((page) => callPage(page, 'coopTagsSeen')));
  const said = seen.map((tags, index) => {
    const who = PARTY_TAGS[index];
    if (!tags.lobbyFrames || !tags.runFrames) problems.push(`${who}'s game never showed both a lobby and a run`);
    if (tags.untagged) {
      problems.push(`${who}'s game showed ${tags.untagged} of ${tags.heroes} heroes without a tag (${tags.first})`);
    }
    const own = tags.ownUntagged ? `, ${tags.ownUntagged} of them its own` : '';
    return `${who} ${tags.untagged} of ${tags.heroes}${own}`;
  });
  const frames = `${seen[0].runFrames} frames in a run, ${seen[0].lobbyFrames} in the lobby`;
  lines.push(`heroes shown without their name tag (${frames}): ${said.join(', ')}`);
  return problems;
}

/** how long the host's hall stays open as its partners cast in their lobbies (frames) */
const HALL_FRAMES = 180;

/**
 * The host opens the hall of heroes (Change hero) as every partner casts in its lobby: the hall must show none of
 * them and play none of their casts. Returns the problems.
 */
async function hallWithPartners(pair, lines) {
  const [host, ...partners] = pair.pages;
  for (const page of partners) await callPage(page, 'coopCastInLobby', { on: true });
  await callPage(host, 'coopOpenHall');
  await pair.run(HALL_FRAMES);
  const seen = await callPage(host, 'coopHallSeen');
  await callPage(host, 'coopCloseHall');
  for (const page of partners) await callPage(page, 'coopCastInLobby', { on: false });
  await pair.run(SETTLE_LOBBY_FRAMES);
  const problems = [];
  if (!seen.frames) problems.push('the host\'s hall of heroes never opened');
  if (seen.shown) {
    problems.push(`the host's hall of heroes showed a partner in ${seen.shown} of its ${seen.frames} frames`);
  }
  if (seen.casting) problems.push(`the host's hall of heroes played a partner's casts in ${seen.casting} frames`);
  const said = `a partner shown in ${seen.shown}, casting in ${seen.casting}`;
  lines.push(`the host's hall of heroes open ${seen.frames} frames as the others cast in their lobbies: ${said}`);
  return problems;
}

/**
 * In a party of more, the others join the room the host and the guest are in: the third first as the guest's name
 * tag, which the host must refuse and ask it to rename, then as its own, and the fourth. Returns the problems: a tag
 * taken twice let in, or the room as any game knows it wrong (`judgeRoom`).
 */
async function fillTheRoom(pair, code, link, lines) {
  const problems = [];
  if (pair.pages.length < 3) return problems;
  const third = pair.pages[2];
  const asTheGuest = { role: 'guest', code, tag: PARTY_TAGS[1], colour: PARTY_PICKS[2], extra: 0, ...link };
  await callPage(third, 'coopOpen', asTheGuest);
  const answered = (host, guest, states) => states[2].status !== 'joining';
  let states = await pair.until(answered, JOIN_FRAMES, 'the third never heard from the host');
  const taken = states[2];
  if (taken.status === 'joined') problems.push(`the third joined as ${PARTY_TAGS[1]}, the guest's name tag`);
  else if (!taken.renameAsked) problems.push(`the third, refused as ${PARTY_TAGS[1]}, wasn't asked to rename`);
  lines.push(`the third joining as the guest's name tag: ${taken.renameAsked ? 'asked to rename' : taken.status}`);
  await callPage(third, 'coopRejoin', { code, tag: PARTY_TAGS[2] });
  for (let index = 3; index < pair.pages.length; index++) {
    const picked = PARTY_PICKS[index];
    const opening = { role: 'guest', code, tag: PARTY_TAGS[index], colour: picked, extra: index - 2, ...link };
    await callPage(pair.pages[index], 'coopOpen', opening);
  }
  const everyone = pair.pages.length - 1;
  const full = (host, guest, all) => all.every((state) => state.status !== 'joining' && state.partners === everyone);
  states = await pair.until(full, JOIN_FRAMES, `the room never held all ${pair.pages.length}`);
  const tags = PARTY_TAGS.slice(0, pair.pages.length);
  problems.push(...judgeRoom(states, tags));
  problems.push(...colourLines(states, PARTY_PICKS.slice(0, states.length), lines));
  const seenBy = (state, index) => `${tags[index]} in slot ${state.slot} sees ${state.partnerTags.join(', ')}`;
  const seen = states.map(seenBy);
  lines.push(`a room of ${pair.pages.length}: ${seen.join('; ')}`);
  return problems;
}

/**
 * Runs `scenarios` (names of page/coop.ts's) on a side as host, a partner page as guest, over a link of `ping` and
 * `jitter` (ms). Returns the report: each scenario judged, and the problems found.
 */
export async function runCoop(side, options) {
  const { scenarios, ping = DEFAULT_PING, jitter = DEFAULT_JITTER, pictures = false, party = 2, canary } = options;
  if (canary && party !== 2) throw labError('coop: --canary is a pair\'s alone (no --party)');
  if (party < 2 || party > PARTY_MOST) throw labError(`coop: --party is 2 to ${PARTY_MOST}`);
  const partners = [];
  for (let index = 1; index < party; index++) partners.push(await side.openPartner(side.heroClass));
  const guest = partners[0];
  try {
    const frameMs = await side.page.evaluate(() => window.__labClock.frame);
    const about = await side.page.evaluate(async () => (await import('/tools/lab/page/coop.ts')).COOP_SCENARIOS);
    const settle = await side.page.evaluate(async () => (await import('/tools/lab/page/coop.ts')).SETTLE_FRAMES);
    const pair = new Pair({ pages: [side.page, ...partners], ping, jitter, frameMs });
    const lines = [`a link of ${ping} ms round trip, each way up to ${jitter} ms later`];
    const problems = await startTogether(pair, { ping, jitter }, lines, canary);
    const casting = problems.length ? 'free casting' : 'a run\'s costs and cooldowns';
    lines.push(`the guest practising in its lobby as the host started; in the run: ${casting}`);
    for (const name of scenarios ?? Object.keys(about)) {
      if (!about[name]) throw labError(`coop: no scenario ${name} (there are ${Object.keys(about).join(', ')})`);
      const unplayable = await callPage(guest, 'coopUnplayable', { name });
      if (unplayable && scenarios) throw labError(`coop: ${name}: ${unplayable} (--class picks a hero that has)`);
      if (unplayable) {
        lines.push(`${name}: not played (${unplayable})`);
        continue;
      }
      await Promise.all(pair.pages.map((page) => callPage(page, 'coopScenario', { name })));
      const { frames, pictures: at } = await callPage(side.page, 'coopScenarioFrames', { name });
      if (pictures && at.length) {
        const files = await pair.runPicturing(settle + frames, name, at.map((frame) => settle + frame));
        lines.push(`${name}: pictured ${files.length} screens in ${PICTURES}`);
      } else await pair.run(settle + frames, name);
      const samplesOf = (page) => callPage(page, 'coopSamples');
      const [hostSamples, guestSamples] = await Promise.all([side.page, guest].map(samplesOf));
      const judged = judgeScenario({ name, about: about[name], host: hostSamples, guest: guestSamples, frameMs });
      lines.push(...judged.lines);
      problems.push(...judged.problems);
    }
    problems.push(...await backToLobby(pair, lines));
    return { text: lines.join('\n'), problems };
  } finally {
    await side.closePartner();
  }
}
