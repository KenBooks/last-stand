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
import { firstRunsEnd, floorInHall, lobbyTurns, watchedRun } from './coopEnd.mjs';
import { HERO_COLOURS } from '../../../src/data/heroColours.ts';
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
export const JOIN_FRAMES = 1800;
/** the frames the guest's lobby has to become practice */
const PRACTICE_FRAMES = 60;
const START_FRAMES = 900;
/** how long the guest is kept readying the run after the host's is under way (frames): past the countdown's 3.5 s */
const READYING_FRAMES = 360;
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

/** Calls `fn` of page/coop.ts in `page` with the page's lab and `args`; a failure names the call and its page's
 *  address (a page that navigated away said only "Execution context was destroyed"). */
export async function callPage(page, fn, args = {}) {
  try {
    return await page.evaluate(async ([fn, args]) => {
      const coop = await import('/tools/lab/page/coop.ts');
      return coop[fn](window.__lab, args);
    }, [fn, args]);
  } catch (error) {
    throw labError(`coop: ${fn} on ${page.url()}: ${error.message}`);
  }
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
export class Pair {
  constructor({ pages, ping, jitter, frameMs }) {
    this.pages = pages;
    this.frameMs = frameMs;
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
 * The host's run under way while the guest readies it, slow to (its fight's programs cold, `READYING_FRAMES` past the
 * host's start): the host's countdown must hold, no wave coming, until the guest is in, and then go on. From play,
 * "readying the fight for slower device takes forever, and first wave already launched, we should display waiting for
 * player instead.. and dont deploy the wave". Returns its lines and problems; `canary`: the host told no guest is
 * readying, whose wave must be found coming.
 */
async function slowGuestStart(pair, canary) {
  await callPage(pair.guest, 'coopSlowToReady');
  if (canary) await callPage(pair.host, 'coopForgetReadying');
  await callPage(pair.host, 'coopStart');
  const hostInRun = (host) => host.mode === 'run';
  await pair.until(hostInRun, START_FRAMES, 'the host\'s run never started');
  const [host, guest] = await pair.run(READYING_FRAMES);
  if (canary) await callPage(pair.host, 'coopRememberReadying');
  const seconds = (READYING_FRAMES / 60).toFixed(1);
  const held = host.held ? ', held, "Waiting for players"' : '';
  const guestIs = guest.mode === 'run' ? 'in it' : 'still readying';
  const lines = [`the guest readying for ${seconds} s past the host's start: the host's run ${host.phase}`
    + `${held}, the guest ${guestIs}`];
  const problems = [];
  if (guest.mode === 'run') problems.push('coop: the guest kept readying was in the run already (nothing measured)');
  if (host.phase !== 'countdown') {
    problems.push(`coop: the host's wave came while the guest readied the run (${host.phase})`);
  }
  else if (!host.held) problems.push('coop: the host\'s countdown wasn\'t held for the guest readying the run');
  await callPage(pair.guest, 'coopReady');
  const inRun = (h, g) => h.mode === 'run' && g.mode === 'run';
  await pair.until(inRun, START_FRAMES, 'the guest never joined the run once ready');
  const goesOn = (h) => h.phase === 'fighting' || (h.phase === 'countdown' && !h.held);
  const [after] = await pair.until(goesOn, START_FRAMES, 'the host\'s countdown never went on once the guest was in');
  lines.push(`the guest in: the host's countdown ${after.held ? 'still held' : 'goes on'}`);
  return { lines, problems };
}

/**
 * The room opened on the host, the guest in it practising in its lobby while it waits (as a player does), and the
 * run started on both, the guest slow to ready it (`slowGuestStart`). Returns the lines and problems of the start: a
 * game whose hero casts freely in the run, as the guest's did, begun in practice; a wave that came without the guest.
 */
async function startTogether(pair, link, lines, canary) {
  const { problems } = await openTogether(pair, link, lines, canary);
  await callPage(pair.guest, 'coopPractise');
  const practising = (host, guest) => guest.stowed && !guest.free;
  await pair.until(practising, PRACTICE_FRAMES, 'the guest\'s lobby never became practice');
  await pair.reseed();
  const slow = await slowGuestStart(pair, canary);
  lines.push(...slow.lines);
  const inRun = (host, guest, states) => states.every((state) => state.mode === 'run');
  const states = await pair.until(inRun, START_FRAMES, 'the run never started on every game');
  const free = states.flatMap((state, index) => (state.free ? [PARTY_TAGS[index]] : []));
  problems.push(...free.map((tag) => `${tag}'s run kept the lobby's free casting (no costs or cooldowns)`));
  return { problems: [...problems, ...slow.problems], free: free.length > 0 };
}

/** Open the party without starting a fight, so colour checks need no combat scenarios. */
async function openTogether(pair, link, lines, canary) {
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
  return { problems, code };
}

/** Real picker changes plus conflicting requests over the same delayed link as combat. */
async function changeColours(pair, link, lines, canary) {
  const { problems, code } = await openTogether(pair, link, lines, false);
  const tags = PARTY_TAGS.slice(0, pair.pages.length);
  const settled = async () => {
    const states = await pair.run(Math.ceil((link.ping + link.jitter * 8 + 1000) / pair.frameMs));
    problems.push(...(judgeColours(states, tags, states.map(state => state.colour)) ?? []));
    return states;
  };
  let states = await pair.run(1);
  const available = () => HERO_COLOURS.slice(6).find(colour => !states.some(state => state.colour === colour.id)).id;
  const hostColour = available();
  await callPage(pair.host, 'coopPickColour', { colour: hostColour });
  states = await settled();
  if (states[0].colour !== hostColour) problems.push('the host could not change colour without leaving');
  const guestColour = available();
  await callPage(pair.guest, 'coopPickColour', { colour: guestColour });
  states = await settled();
  if (states[1].colour !== guestColour) problems.push('the guest could not change colour without leaving');
  const contested = available();
  const ask = page => callPage(page, 'coopPickColour', { colour: contested, request: true });
  await Promise.all(pair.pages.slice(0, 2).map(ask));
  states = await settled();
  if (states.filter(state => state.colour === contested).length !== 1) {
    problems.push('competing requests did not reserve exactly one colour');
  }
  if (states[1].colour !== guestColour) problems.push('a rejected request replaced the guest\'s existing colour');
  if (pair.pages.length > 2) {
    const previous = states.map(state => state.colour);
    const contested = available();
    const ask = page => callPage(page, 'coopPickColour', { colour: contested, request: true });
    await Promise.all(pair.pages.slice(1, 3).map(ask));
    states = await settled();
    if (states.slice(1, 3).filter(state => state.colour === contested).length !== 1) {
      problems.push('two guests did not resolve their colour race');
    }
    for (const index of [1, 2]) {
      if (states[index].colour !== contested && states[index].colour !== previous[index]) {
        problems.push('a losing guest lost its previous colour');
      }
    }
    await callPage(pair.pages[2], 'coopRejoin', { code, tag: PARTY_TAGS[2] });
    const rejoined = (host, guest, all) => all.every(state =>
      state.status !== 'joining' && state.partners === pair.pages.length - 1);
    await pair.until(rejoined, JOIN_FRAMES, 'rejoining after live colour changes lost a party member');
    states = await settled();
    lines.push('two guests racing resolved uniquely; rejoining after changes preserved the authoritative roster');
  }
  await callPage(pair.guest, 'coopPickColour', { colour: null });
  states = await settled();
  if (states.some(state => state.status !== 'hosting' && state.status !== 'joined')) {
    problems.push('a colour change left the party');
  }
  lines.push('live colours: picker changes, competing requests and Any stayed unique and agreed on every game');
  await callPage(pair.host, 'coopStart');
  const inRun = (host, guest, all) => all.every(state => state.mode === 'run');
  await pair.until(inRun, START_FRAMES, 'the colour test run never started');
  const runColour = available();
  await callPage(pair.guest, 'coopPickColour', { colour: runColour });
  states = await settled();
  if (states[1].colour !== runColour || states.some(state => state.mode !== 'run')) {
    problems.push('a live Settings colour change failed during a run');
  }
  lines.push('during the run: Settings changed the guest\'s colour without leaving the party or interrupting the run');
  if (canary) {
    await callPage(pair.guest, 'coopWearColour', { colour: states[0].colour });
    const broken = await pair.until(() => true, 1, 'no canary frame ran');
    const found = judgeColours(broken, tags, broken.map(state => state.colour)) ?? [];
    if (!found.some(problem => problem.includes('two players wear one colour'))) {
      problems.push('canary: duplicate live colour went undetected');
    }
    lines.push('canary: an unannounced duplicate colour was detected');
  }
  return { text: lines.join('\n'), problems };
}

/** the frames the lobby's practice has to show its bar */
const SETTLE_LOBBY_FRAMES = 30;

/**
 * The run's end (`firstRunsEnd`: the guest banks, the host leaves, every game back in the lobby by itself), every
 * game's camera turned there by a middle drag, and practising there (its panels stowed). Returns the problems: a game
 * whose lobby's practice shows no skill bar (after a co-op run, the run's watching look hid it in the lobby, through
 * the hero selection screen too), the hall of heroes showing a partner or the lobby's floor, a hero shown without its
 * name tag; then the second run, watched (`watchedRun`).
 */
async function backToLobby(pair, lines, canary, pictures) {
  const tags = PARTY_TAGS.slice(0, pair.pages.length);
  const problems = await firstRunsEnd(pair, callPage, lines, { canary, tags });
  problems.push(...await lobbyTurns(pair, callPage, lines, { tags, when: 'its panels shown' }));
  for (const page of pair.pages) await callPage(page, 'coopPractiseAgain');
  problems.push(...await lobbyTurns(pair, callPage, lines, { tags, when: 'practising' }));
  await pair.run(SETTLE_LOBBY_FRAMES);
  const bars = await Promise.all(pair.pages.map((page) => callPage(page, 'coopLobbyBar')));
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
  const picture = pictures ? join(PICTURES, 'watching-guest.png') : null;
  if (picture) mkdirSync(PICTURES, { recursive: true });
  problems.push(...await watchedRun(pair, callPage, lines, { tags, picture, canary }));
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
 * The host throws an item on the lobby's floor and opens the hall of heroes (Change hero) as every partner casts in
 * its lobby: the hall must show none of them, play none of their casts and show none of the floor. Returns the
 * problems.
 */
async function hallWithPartners(pair, lines) {
  const [host, ...partners] = pair.pages;
  let seen = null;
  const floor = await floorInHall(pair, callPage, lines, async (floorNow) => {
    for (const page of partners) await callPage(page, 'coopCastInLobby', { on: true });
    await callPage(host, 'coopOpenHall');
    await pair.run(HALL_FRAMES);
    seen = await callPage(host, 'coopHallSeen');
    const shown = await floorNow();
    await callPage(host, 'coopCloseHall');
    for (const page of partners) await callPage(page, 'coopCastInLobby', { on: false });
    await pair.run(SETTLE_LOBBY_FRAMES);
    return shown;
  });
  const problems = [...floor];
  // (the host's, which threw it before itself: a press on a drop's name is the floor's, which took every button)
  const fromName = { tags: PARTY_TAGS, when: 'from a name on the floor', onName: true, pages: [host] };
  problems.push(...await lobbyTurns(pair, callPage, lines, fromName));
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

/** ms, to a tenth */
const tenth = (ms) => ms.toFixed(2);

/**
 * What every hero's update cost each game a frame (`page/coopCost.ts`), in a run and in the lobby: lines that differ
 * from run to run, as the browser's clock does.
 */
async function heroCostLines(pair) {
  const costs = await Promise.all(pair.pages.map((page) => callPage(page, 'coopHeroCost')));
  return costs.map((cost, index) => {
    const place = (name) => {
      const { frames, own, perCopy } = cost[name];
      if (!frames) return `${name} none`;
      return `${name} its own ${tenth(own)} ms, a partner's ${tenth(perCopy)} (${frames} frames)`;
    };
    const places = ['run', 'lobby', 'hall'].map(place).join('; ');
    return `the heroes' update a frame on ${PARTY_TAGS[index]}'s game: ${places}`;
  });
}
/** the canary's problem: the wave came while the guest readied */
const SLOW_GUEST_CANARY = 'the host\'s wave came while the guest readied the run';

/**
 * Runs `scenarios` (names of page/coop.ts's) on a side as host, a partner page as guest, over a link of `ping` and
 * `jitter` (ms). Returns the report: each scenario judged, and the problems found.
 */
export async function runCoop(side, options) {
  const { scenarios, ping = DEFAULT_PING, jitter = DEFAULT_JITTER, pictures = false, party = 2, canary } = options;
  if (scenarios?.includes('colours') && scenarios.length !== 1) {
    throw labError('coop: colours runs alone, without combat');
  }
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
    if (scenarios?.length === 1 && scenarios[0] === 'colours') {
      return await changeColours(pair, { ping, jitter }, lines, canary);
    }
    const start = await startTogether(pair, { ping, jitter }, lines, canary);
    const casting = start.free ? 'free casting' : 'a run\'s costs and cooldowns';
    lines.push(`the guest practising in its lobby as the host started; in the run: ${casting}`);
    const problems = [...start.problems];
    if (canary) {
      const caught = problems.some((problem) => problem.includes(SLOW_GUEST_CANARY));
      lines.push(`canary: the host told no guest readies ${caught ? 'caught' : 'went unseen'}`);
      if (!caught) problems.push('coop: the canary\'s wave without the guest went unseen');
      else problems.splice(0, problems.length, ...problems.filter((p) => !p.includes(SLOW_GUEST_CANARY)));
    }
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
    problems.push(...await backToLobby(pair, lines, canary, pictures));
    lines.push(...await heroCostLines(pair));
    return { text: lines.join('\n'), problems };
  } finally {
    await side.closePartner();
  }
}
