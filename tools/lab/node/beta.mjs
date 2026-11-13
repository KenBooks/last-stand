// `lab beta`: the village beta as a player opts into it and out again (src/core/beta.ts, src/ui/beta.ts), on a page
// of its own beside the command's, every step the browser's own click and the page's own load. From the lobby
// without it: the pause menu's Beta tab says Off, its switch offers Reload, and Reload loads the page again with
// `?village=1`, in the village, the choice kept in its cookie; there a notice says so as the game opens; the next
// visit, with no parameter, opens the village too; the notice's Back to the old lobby loads the lobby without it, kept
// likewise; left alone the notice goes by itself, and pointed at it stays. Then co-op: a room is in its host's
// lobby, so the command's own page opens one and the visitor, in the other lobby, must be refused, told which lobby
// the room is in and offered the switch, whose click loads it again in the room's lobby as an invite to that room,
// which it then joins. `--canary` plants a fault for each part: the notice kept by the pointer past its time, put
// away before it's read, the cookie lost before the next visit, the lobby the room refused it for forgotten.
import { labError } from './errors.mjs';
import { callPage, DEFAULT_JITTER, DEFAULT_PING, JOIN_FRAMES, judgeRoom, Pair, PARTY_TAGS } from './coop.mjs';
import { bootAddress, LAB_BOOT } from './side.mjs';

/** how long a click is given to start the page's load (ms) */
const LOAD_STARTS_MS = 15000;
/** how long the notice is given to go by itself (ms; the game's is 20 s, src/ui/beta.ts), and how often it's read */
const NOTICE_GOES_MS = 26000;
const NOTICE_READ_MS = 500;
/** the visitor's errors, as a partner's are said */
const PREFIX = 'partner: ';
/** what the Beta tab and the dialog say, by whether the village is meant */
const SAYS = { true: 'On now', false: 'Off now' };
const OFFERS = { true: 'Reload to open the village', false: 'Reload to go back to the old lobby' };
const SWITCHES = { true: 'Switch to the village and join', false: 'Switch to the old lobby and join' };
const LOBBIES = { true: 'village', false: 'panels' };

/** Calls `fn` of page/beta.ts in `page` with `args`; a failure names the call. */
async function callBeta(page, fn, args = {}) {
  try {
    return await page.evaluate(async ([fn, args]) => {
      const beta = await import('/tools/lab/page/beta.ts');
      return beta[fn](window.__lab, args);
    }, [fn, args]);
  } catch (error) {
    throw labError(`beta: ${fn} on ${page.url()}: ${error.message}`);
  }
}

/** The visitor: its page, the side that boots it, and what the command has found so far. */
class Visitor {
  constructor(side, page) {
    this.side = side;
    this.page = page;
    this.lines = [];
    this.problems = [];
  }

  /** `problem` noted unless `fine`. */
  expect(fine, problem) {
    if (!fine) this.problems.push(problem);
  }

  /** The page loaded again by `act` and booted (cold: what it warms behind the lobby isn't this command's); returns
   *  the address it loaded. */
  async loadedBy(act) {
    let address = '';
    await this.side.bootBy(this.page, async () => {
      const asked = this.page.waitForRequest((request) => request.isNavigationRequest(), { timeout: LOAD_STARTS_MS });
      const landed = this.page.waitForNavigation({ timeout: LOAD_STARTS_MS, waitUntil: 'domcontentloaded' });
      await act();
      address = (await asked).url();
      await landed;
    }, PREFIX, true);
    return address;
  }

  /** The mouse clicked on `selector` where the page says a mouse finds it; throws where it doesn't. */
  async click(selector) {
    const at = await callBeta(this.page, 'betaPoint', { selector });
    if (!at) throw labError(`beta: ${selector} isn't shown where a mouse finds it`);
    await this.page.mouse.click(at.x, at.y);
  }

  /** The page loaded again by a click on `selector`; returns the address it loaded. */
  loadedByClick(selector) {
    return this.loadedBy(() => this.click(selector));
  }

  /** The page loaded at the game's own address with `query` set on it (none: as a next visit, no parameter). */
  visit(query = {}) {
    const address = new URL(bootAddress(this.side.url, this.side.bootedAs ?? LAB_BOOT));
    for (const [name, value] of Object.entries(query)) address.searchParams.set(name, value);
    return this.loadedBy(() => this.page.goto(address.toString(), { waitUntil: 'domcontentloaded' }));
  }

  /** The page's state read and held to `village` (the lobby, the game's own reading, the cookie if `kept`) and to the
   *  notice shown with the village alone (`noticed`: or not, under a screen); `when` says the step in the lines.
   *  Returns the state. */
  async stands(village, when, kept = true, noticed = village) {
    const state = await callBeta(this.page, 'betaState');
    const notice = state.notice ? 'the notice shown' : 'no notice';
    this.lines.push(`${when}: the ${state.lobby} lobby, cookie ${state.cookie ?? 'none'}, ${notice}`);
    this.expect(state.lobby === LOBBIES[village], `${when}: the page loaded the ${state.lobby} lobby`);
    this.expect(state.village === village, `${when}: the game reads the village ${state.village ? 'on' : 'off'}`);
    if (kept) this.expect(state.cookie === (village ? '1' : '0'), `${when}: the cookie keeps ${state.cookie}`);
    this.expect(state.notice === noticed, `${when}: ${notice}`);
    this.problems.push(...state.noticeProblems.map((problem) => `${when}: ${problem}`));
    return state;
  }

  /** The Beta tab read and held to the village `now` and its switch at `switched`; returns the tab. */
  async tabStands(now, switched, when) {
    const tab = await callBeta(this.page, 'betaTab');
    const offer = tab.offered ? `"${tab.offer}"` : 'no reload offered';
    this.lines.push(`${when}: the Beta tab says "${tab.says}", its switch ${tab.switched}, ${offer}`);
    this.expect(tab.says === SAYS[now], `${when}: the Beta tab says "${tab.says}"`);
    this.expect(tab.switched === (switched ? 'on' : 'off'), `${when}: the Beta tab's switch stands ${tab.switched}`);
    this.expect(tab.offered === (now !== switched), `${when}: the Beta tab has ${offer}`);
    if (tab.offered) this.expect(tab.offer === OFFERS[switched], `${when}: the Beta tab offers ${offer}`);
    this.problems.push(...tab.problems.map((problem) => `${when}: ${problem}`));
    return tab;
  }
}

/** A canary's verdict as a line, and as a problem where the fault went unseen. */
function canaryCaught(visitor, caught, what) {
  visitor.lines.push(`canary: ${what} ${caught ? 'caught' : 'went unseen'}`);
  if (!caught) visitor.problems.push(`beta: the canary's ${what} went unseen`);
}

/** Opting in from the lobby without the village: the Beta tab, its Reload and what the page loads. */
async function optIn(visitor) {
  await visitor.stands(false, 'the lobby without the village', false);
  await visitor.tabStands(false, false, 'before the switch');
  await visitor.click('#opt-village button[data-v="on"]');
  await visitor.tabStands(false, true, 'the switch clicked On');
  const address = await visitor.loadedByClick('#btn-beta-reload');
  const asked = new URL(address).searchParams.get('village');
  visitor.lines.push(`Reload loaded the page with village=${asked}`);
  visitor.expect(asked === '1', `Reload loaded ${address}, without village=1`);
  await visitor.stands(true, 'after Reload');
  await screenPutsAway(visitor);
  await visitor.tabStands(true, true, 'in the village');
}

/** The village's frames run under the notice, then a screen opened over it: the notice must outlast the village's
 *  own frames and go with the screen. */
async function screenPutsAway(visitor) {
  await visitor.side.installLab(visitor.page);
  const { alone, under } = await callBeta(visitor.page, 'betaScreenOver');
  const stayed = alone ? 'stays' : 'is gone';
  const went = under ? 'still shown' : 'put away';
  visitor.lines.push(`the notice through the village's frames ${stayed}; the inventory opened over it: ${went}`);
  visitor.expect(alone, 'the notice is gone after frames of the village with nothing over it');
  visitor.expect(!under, 'the notice is still shown with the inventory open over the village');
}

/** Whether the notice is gone from the page within its time, by the browser's own clock (its timer's). */
async function noticeGone(visitor) {
  const until = Date.now() + NOTICE_GOES_MS;
  while (Date.now() < until) {
    const state = await callBeta(visitor.page, 'betaState');
    if (!state.notice) return true;
    await new Promise((resolve) => setTimeout(resolve, NOTICE_READ_MS));
  }
  return false;
}

/** The notice left alone, the mouse away from it: gone by itself within its time. */
async function noticeGoes(visitor) {
  await visitor.page.mouse.move(2, visitor.page.viewportSize().height - 2);
  const gone = await noticeGone(visitor);
  visitor.lines.push(`the notice left alone: ${gone ? 'gone by itself' : 'still shown'}`);
  visitor.expect(gone, `the notice left alone is still shown after ${NOTICE_GOES_MS / 1000} s`);
}

/** The notice pointed at, which keeps it: it must be found still shown past its time. */
async function noticeHeldCanary(visitor) {
  // (a visit of its own: the screen opened over the last one's put its notice away)
  await visitor.visit();
  const at = await callBeta(visitor.page, 'betaPoint', { selector: '#btn-beta-close' });
  if (!at) throw labError('beta: the Close of the notice is not shown where a mouse finds it');
  await visitor.page.mouse.move(at.x, at.y);
  canaryCaught(visitor, !(await noticeGone(visitor)), 'notice kept by the pointer');
}

/** The notice put away before it's read: the page in the village must be found without it. */
async function noticeCanary(visitor) {
  await callBeta(visitor.page, 'betaHideNotice');
  const state = await callBeta(visitor.page, 'betaState');
  canaryCaught(visitor, state.village && !state.notice, 'notice put away before it was read');
}

/** The next visit, no parameter on the address: the village by its cookie; with `canary` the cookie lost first, and
 *  the visit must be found in the lobby without it. */
async function nextVisit(visitor, canary) {
  if (!canary) {
    await visitor.visit();
    await visitor.stands(true, 'the next visit, no parameter');
    await noticeGoes(visitor);
    await visitor.visit();
    await visitor.stands(true, 'the visit after it');
    return;
  }
  await callBeta(visitor.page, 'betaLoseCookie');
  await visitor.visit();
  const state = await callBeta(visitor.page, 'betaState');
  canaryCaught(visitor, state.lobby === LOBBIES.false, 'cookie lost before the next visit');
}

/** Opting out by the notice's Back to the old lobby, and the visit after it. */
async function optOut(visitor) {
  const address = await visitor.loadedByClick('#btn-beta-back');
  const asked = new URL(address).searchParams.get('village');
  visitor.lines.push(`Back to the old lobby loaded the page with village=${asked}`);
  visitor.expect(asked === '0', `Back to the old lobby loaded ${address}, without village=0`);
  await visitor.stands(false, 'after Back to the old lobby');
  await visitor.visit();
  await visitor.stands(false, 'the next visit, no parameter');
}

/** The room the host's page opens, and the visitor asking to join it from the other lobby; returns the room's code
 *  and what the visitor's game made of the answer (page/beta.ts `BetaRefusal`). */
async function refusedByRoom(visitor, host, link, forget) {
  await visitor.side.installLab(visitor.page);
  const frameMs = await host.evaluate(() => window.__labClock.frame);
  const pair = new Pair({ pages: [host, visitor.page], ...link, frameMs });
  await pair.reseed();
  const code = await callPage(host, 'coopOpen', { role: 'host', tag: PARTY_TAGS[0], colour: null, ...link });
  await callBeta(visitor.page, 'betaOpenCoop');
  await callPage(visitor.page, 'coopOpen', { role: 'guest', code, tag: PARTY_TAGS[1], colour: null, ...link });
  const answered = (hostState, guestState) => guestState.status !== 'joining';
  await pair.until(answered, JOIN_FRAMES, 'the room never answered the game in the other lobby');
  return { code, refusal: await callBeta(visitor.page, 'betaRefusal', { forget }) };
}

/** A refusal held to the room's lobby: refused, told which lobby, and the switch offered in the dialog. */
function judgeRefusal(visitor, refusal, hostVillage) {
  const offer = refusal.offer ? `offered "${refusal.offer}"` : 'no switch offered';
  visitor.lines.push(`a room in the ${LOBBIES[hostVillage]} lobby asked from the other: ${refusal.status}, ${offer}`);
  visitor.lines.push(`  it says: ${refusal.error}`);
  const problems = [];
  if (refusal.status === 'joined') problems.push('co-op: a game in the other lobby was let into the room');
  else if (refusal.status !== 'failed') problems.push(`co-op: the game in the other lobby is left ${refusal.status}`);
  if (refusal.asked !== hostVillage) problems.push('co-op: the refusal didn\'t say which lobby the room is in');
  if (refusal.offer !== SWITCHES[hostVillage]) problems.push(`co-op: the dialog has ${offer}`);
  return problems;
}

/** The switch clicked: the page loaded in the room's lobby as an invite to the room, and the room joined. */
async function switchAndJoin(visitor, host, link, code, hostVillage) {
  const address = new URL(await visitor.loadedByClick('#btn-coop-lobby'));
  const asked = { village: address.searchParams.get('village'), room: address.searchParams.get('room') };
  // (the code is rolled afresh for each room: said as the room's or not, never itself)
  const room = asked.room === code ? 'the room' : 'another room or none';
  visitor.lines.push(`the switch loaded the page with village=${asked.village}, as an invite to ${room}`);
  visitor.expect(asked.village === (hostVillage ? '1' : '0'), `the switch loaded ${address}: not the room's lobby`);
  visitor.expect(asked.room === code, `the switch loaded ${address}: not as an invite to room ${code}`);
  // (the invite's dialog is over the village as it opens: its notice waits it out)
  await visitor.stands(hostVillage, 'after the switch, under the dialog', true, false);
  const invited = await callBeta(visitor.page, 'betaInvited');
  const field = invited.code === code ? 'the code of the room' : 'another code or none';
  visitor.lines.push(`the invite: the dialog ${invited.dialog ? 'shown' : 'not shown'}, ${field} in its field`);
  visitor.expect(invited.dialog && invited.code === code, 'the switch\'s invite wasn\'t taken up as the page loaded');
  await visitor.side.installLab(visitor.page);
  const frameMs = await host.evaluate(() => window.__labClock.frame);
  const pair = new Pair({ pages: [host, visitor.page], ...link, frameMs });
  await callPage(visitor.page, 'coopOpen', { role: 'guest', code, tag: PARTY_TAGS[1], colour: null, ...link });
  const joined = (hostState, guestState) => guestState.status === 'joined' && hostState.partners > 0;
  const states = await pair.until(joined, JOIN_FRAMES, 'the game never joined the room after the switch');
  visitor.problems.push(...judgeRoom(states, PARTY_TAGS.slice(0, 2)));
  visitor.lines.push('after the switch: joined, each game with the other in a slot of its own');
}

/**
 * Runs `lab beta` on `side`: a visitor's page through opting in and out, then against a room the side's own page
 * hosts. Returns the report.
 */
export async function runBeta(side, options) {
  const { canary = false, ping = DEFAULT_PING, jitter = DEFAULT_JITTER } = options;
  const hostBoot = side.bootedAs ?? LAB_BOOT;
  const hostVillage = !hostBoot.panels;
  const page = await side.openPartner(side.heroClass, { ...hostBoot, panels: true, cold: true });
  const visitor = new Visitor(side, page);
  try {
    await optIn(visitor);
    if (canary) await noticeHeldCanary(visitor);
    if (canary) await noticeCanary(visitor);
    await nextVisit(visitor, canary);
    if (!canary) await optOut(visitor);
    // (the visitor stands in the lobby without the village: a host there has it cross to the village first)
    if (!hostVillage) await visitor.visit({ village: '1' });
    const link = { ping, jitter };
    const { code, refusal } = await refusedByRoom(visitor, side.page, link, false);
    visitor.problems.push(...judgeRefusal(visitor, refusal, hostVillage));
    if (canary) {
      const forgotten = await callBeta(page, 'betaRefusal', { forget: true });
      const caught = judgeRefusal(visitor, forgotten, hostVillage).length > 0;
      canaryCaught(visitor, caught, 'lobby the room refused it for forgotten');
    } else await switchAndJoin(visitor, side.page, link, code, hostVillage);
    return { text: visitor.lines.join('\n'), problems: visitor.problems };
  } finally {
    await side.closePartner();
  }
}
