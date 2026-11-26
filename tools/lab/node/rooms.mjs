// `lab rooms`: Play together's rooms end to end (#676), two games against a co-op relay of the lab's own
// (server/relay, started on localhost for the page's origin), every step the page's own clicks and typing. The
// command's page hosts and a partner's page joins:
//   a public room opened from the create page, listed in the partner's browser with its host, name, map and size,
//     joined from its row (the list then counting two), left, and gone from the list once its host has left;
//   a password room, listed as locked, its password never in the list; joined with a wrong password (turned away,
//     the dialog asking for it), then with the right one where the dialog asks;
//   a private room for two, never listed: its invite link opened in the partner's page while a bare socket fills
//     the room, then with the host's own name tag (as a second tab of one browser keeps it), each turned away with
//     Join's field keeping the room's code, then Join pressed with its own tag alone, which must let it in at once.
// The relay's own list is read beside the browser's (as a page of the game's origin reads it). `--canary` starts the
// relay with the faults it must catch: any password let in, private rooms listed, and a joiner that left on purpose
// held for the grace. Pictures of each step in
// `out/rooms/<screen>/`.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { labError } from './errors.mjs';
import { OUT } from './paths.mjs';

/** the protocol's app id the game's rooms are kept under (src/net/transport.ts `APP`) */
const APP = 'last-stand-coop-1';
/** how long a step is given to come about (ms of the browser's own time: the relay's answers come in it) */
const STEP_MS = 20000;
/** how often a waited-for step is read again (ms), and the game frames run between reads */
const READ_MS = 150;
const FRAMES_A_READ = 2;
/** the relay holds a dropped peer this long here (ms), the deploy's: a joiner turned away and back at once comes well
 *  within it, as a player's does */
const GRACE_MS = 8000;
const TAGS = { host: 'Brannoch', guest: 'Ysolde' };
/** frames the refused joiner's dialog runs before its code is read (its renders after the refusal) */
const KEPT_FRAMES = 60;
const PUBLIC = { kind: 'public', name: 'Crypt crawl, all welcome', password: '', max: 3 };
const LOCKED = { kind: 'password', name: 'Friends only', password: 'ember-gate', max: 4 };
const PRIVATE = { kind: 'private', name: 'Quiet room', password: '', max: 2 };
const WRONG = 'ember-gat';
/** how long a picture waits for the dialog's fade in to end (ms of the browser's clock) */
const FADE_MS = 500;

/** Calls `fn` of page/rooms.ts in `page` with `args`; a failure names the call. */
async function callRooms(page, fn, args = {}) {
  try {
    return await page.evaluate(async ([fn, args]) => {
      const rooms = await import('/tools/lab/page/rooms.ts');
      return rooms[fn](window.__lab, args);
    }, [fn, args]);
  } catch (error) {
    throw labError(`rooms: ${fn}: ${error.message}`);
  }
}

/** One of the two games: its page, its name in the lines, and its state read. */
class Game {
  constructor(page, name) {
    this.page = page;
    this.name = name;
  }

  call(fn, args) {
    return callRooms(this.page, fn, args);
  }

  state() {
    return this.call('roomsState');
  }
}

/** The run's findings: lines, problems, and the canary's faults seen. */
class Findings {
  constructor(canary) {
    this.canary = canary;
    this.lines = [];
    this.problems = [];
    this.faultsSeen = new Set();
  }

  say(line) {
    this.lines.push(line);
  }

  /** `problem` noted unless `fine`; with a canary, a problem of one of its faults is the fault seen. */
  expect(fine, problem, fault = null) {
    if (fine) return;
    if (this.canary && fault) this.faultsSeen.add(fault);
    else this.problems.push(`rooms: ${problem}`);
  }
}

/**
 * Both games read, frames run between reads, until `done(host, guest)`; throws saying `what` if it never comes.
 * Returns the last states.
 */
async function until(games, done, what) {
  const start = Date.now();
  for (;;) {
    const states = await Promise.all(games.map((game) => game.state()));
    if (done(...states)) return states;
    if (Date.now() - start > STEP_MS) {
      const said = states.map((s, i) => `${games[i].name} ${s.session} "${s.status}"`).join(', ');
      throw labError(`rooms: ${what} (${said})`);
    }
    await new Promise((resolve) => setTimeout(resolve, READ_MS));
    await Promise.all(games.map((game) => game.call('roomsStep', { frames: FRAMES_A_READ })));
  }
}

/** The relay's own list as a page of `origin` reads it, and its text whole. */
async function relayList(relayUrl, origin) {
  const answer = await fetch(`${relayUrl}/rooms?app=${APP}`, { headers: { origin } });
  const text = await answer.text();
  if (!answer.ok) throw labError(`rooms: the relay's list answered ${answer.status}`);
  return { rooms: JSON.parse(text).rooms, text };
}

/** Pictures of a game's screen, as the player sees it, kept under `dir`. */
async function picture(game, dir, name) {
  // (a few of the game's frames first: what it puts away by its frames under a dialog is gone)
  await game.call('roomsStep', { frames: 3 });
  // (and the dialog's own fade in let end: it runs on the browser's clock, and the create page was caught half see-through)
  await new Promise((resolve) => setTimeout(resolve, FADE_MS));
  const cdp = await game.page.context().newCDPSession(game.page);
  try {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(dir, `${name}.png`), Buffer.from(data, 'base64'));
  } finally {
    await cdp.detach();
  }
}

/** `page` put on a screen of `screen`'s size and pixel ratio, through the DevTools protocol (the lab's own `showOn`
 *  waits for a frame the partner's page, behind the command's, never draws). */
async function onScreen(page, screen) {
  const cdp = await page.context().newCDPSession(page);
  const { width, height, ratio } = screen;
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: ratio, mobile: false });
  // (the session kept open: the override lasts as long as it does)
  page.once('close', () => cdp.detach().catch(() => {}));
}

/** Both games open Play together on the lab's relay, and its server is found up. */
async function openBoth(games, relayUrl) {
  const server = relayUrl.replace(/^http/, 'ws');
  for (const game of games) {
    await game.call('roomsUse', { server });
    await game.call('roomsOpen');
  }
  await until(games, (h, g) => !/Checking/.test(h.status) && !/Checking/.test(g.status), 'the dialogs never found the server');
}

/** A room opened by the host from the create page; returns its code. */
async function hostOpens(games, plan) {
  const [host] = games;
  await host.call('roomsCreate', { tag: TAGS.host, ...plan });
  const [state] = await until(games, (h) => h.session === 'hosting' && h.kindLine !== '', `the ${plan.kind} room never opened`);
  return state.code;
}

/** The guest's browser refreshed until `listed(rows)`; returns its last state. */
async function guestLists(games, listed, what) {
  const [, guest] = games;
  const start = Date.now();
  for (;;) {
    await guest.call('roomsRefresh');
    const [, state] = await until(games, (h, g) => g.empty !== 'Looking for rooms…', 'the list was never read');
    if (listed(state.rows)) return state;
    if (Date.now() - start > STEP_MS) return state;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

/** Both games out of their room, the host's gone from the relay's list. */
async function bothLeave(games, relayUrl, origin, code) {
  for (const game of games) {
    const state = await game.state();
    if (state.session === 'hosting' || state.session === 'joined') await game.call('roomsLeave');
  }
  await until(games, (h, g) => h.session !== 'hosting' && g.session !== 'joined', 'the room was never left');
  const start = Date.now();
  while (Date.now() - start < STEP_MS) {
    const { rooms } = await relayList(relayUrl, origin);
    if (!rooms.some((r) => r.code === code)) return true;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

/** A public room: listed in the browser as its host opened it, joined from its row, gone once its host left. */
async function publicRoom(games, found, relay, dir) {
  const code = await hostOpens(games, PUBLIC);
  const shown = await guestLists(games, (rows) => rows.some((r) => r.code === code), 'the public room');
  const row = shown.rows.find((r) => r.code === code);
  found.say(`public room ${row ? 'listed' : 'never listed'}: ${row ? `${row.tag}, "${row.name}", ${row.map}, ${row.players}` : ''}`);
  if (!row) {
    const rows = shown.rows.map((r) => r.code).join(', ') || 'none';
    throw labError(`rooms: the public room ${code} never showed in the browser (rows ${rows}; "${shown.empty}", "${shown.status}")`);
  }
  if (row) {
    found.expect(row.tag === TAGS.host, `the public room's row names its host "${row.tag}"`);
    found.expect(row.name === PUBLIC.name, `the public room's row names it "${row.name}"`);
    found.expect(row.players === `1/${PUBLIC.max}`, `the public room's row says ${row.players} players`);
    found.expect(!row.locked, 'the public room is shown locked');
  }
  await picture(games[1], dir, '1-browse');
  await picture(games[0], dir, '2-hosting-public');
  await games[1].call('roomsJoinListed', { tag: TAGS.guest, code, password: '' });
  await until(games, (h, g) => g.session === 'joined' && h.partners === 1, 'the guest never joined the public room from its row');
  const { rooms } = await relayList(relay.url, relay.origin);
  const listed = rooms.find((r) => r.code === code);
  found.say(`joined from its row; the relay lists it with ${listed?.players ?? 'no'} players`);
  found.expect(listed?.players === 2, `the relay lists the joined room with ${listed?.players} players`);
  const gone = await bothLeave(games, relay.url, relay.origin, code);
  found.say(`left: ${gone ? 'gone from the list' : 'still listed'}`);
  found.expect(gone, 'the public room stayed listed after its host left');
}

/** A password room: listed locked, its password nowhere in the list; a wrong one turned away, the right one in. */
async function lockedRoom(games, found, relay, dir) {
  const code = await hostOpens(games, LOCKED);
  const { rooms, text } = await relayList(relay.url, relay.origin);
  found.say(`password room: the relay lists it ${rooms.find((r) => r.code === code)?.locked ? 'locked' : 'unlocked'}`);
  found.expect(rooms.find((r) => r.code === code)?.locked === true, 'the password room isn\'t listed locked');
  found.expect(!text.includes(LOCKED.password), 'the relay\'s list holds the room\'s password');
  const shown = await guestLists(games, (rows) => rows.some((r) => r.code === code), 'the password room');
  found.expect(shown.rows.find((r) => r.code === code)?.locked === true, 'the browser doesn\'t show the password room locked');
  await games[1].call('roomsJoinListed', { tag: TAGS.guest, code, password: WRONG });
  const [, refused] = await until(games, (h, g) => g.session === 'failed' || g.session === 'joined',
    'the wrong password was never answered');
  found.say(`a wrong password: ${refused.session}, "${refused.status}", ${refused.passwordAsked ? 'asked again' : 'not asked again'}`);
  found.expect(refused.session === 'failed', 'a wrong password was let into the room', 'anyPassword');
  if (refused.session === 'failed') {
    found.expect(/password/i.test(refused.status), `a wrong password is told "${refused.status}"`);
    found.expect(refused.passwordAsked, 'the dialog doesn\'t ask for the password again');
    await picture(games[1], dir, '3-wrong-password');
    await games[1].call('roomsGivePassword', { password: LOCKED.password });
  }
  await until(games, (h, g) => g.session === 'joined' && h.partners === 1, 'the right password never joined the room');
  found.say('the right password: joined');
  await picture(games[1], dir, '4-joined');
  await bothLeave(games, relay.url, relay.origin, code);
}

/** A private room: never listed, joined by its code. */
async function privateRoom(games, found, relay, dir) {
  const code = await hostOpens(games, PRIVATE);
  await picture(games[0], dir, '5-hosting-private');
  const { rooms } = await relayList(relay.url, relay.origin);
  const listed = rooms.some((r) => r.code === code);
  found.say(`private room: ${listed ? 'listed' : 'not listed'}`);
  found.expect(!listed, 'the private room is listed', 'listPrivate');
  // (the invite link opened in a second tab of one browser while the room is full: turned away, Join's field must
  // keep the room's code to try again. From play: "it cleared the room code... it should not")
  const server = relay.url.replace(/^http/, 'ws');
  await games[0].call('roomsFill', { server, code, on: true });
  await games[1].call('roomsInvited', { tag: TAGS.host, code });
  const [, full] = await until(games, (h, g) => g.session === 'failed', 'a join of the full room was let in');
  await codeKept(games, found, code, `the room full ("${full.status}")`);
  await games[0].call('roomsFill', { server, code, on: false });
  // (again, the tag the second tab keeps, the host's own: turned away, its place must go with it, and the code kept
  // to join as another: a player types the tag alone and presses Join)
  await games[1].call('roomsRetag', { tag: TAGS.host });
  const [, refused] = await until(games, (h, g) => g.session === 'failed', 'a join as the host\'s own tag was let in');
  await codeKept(games, found, code, `the host's own tag ("${refused.status}")`);
  const turned = Date.now();
  await games[1].call('roomsRetag', { tag: TAGS.guest });
  const settled = (h, g) => (g.session === 'joined' && h.partners === 1) || g.session === 'failed';
  const [, joined] = await until(games, settled, 'the private room was never joined by its code');
  const after = ((Date.now() - turned) / 1000).toFixed(1);
  found.say(joined.session === 'joined' ? `joined by its code as its own tag, ${after} s after it was turned away`
    : `joined by its code as its own tag ${after} s after it was turned away: "${joined.status}"`);
  const fullAgain = 'a joiner turned away for its tag found the room full trying again';
  found.expect(joined.session === 'joined', fullAgain, 'holdLeft');
  await bothLeave(games, relay.url, relay.origin, code);
}

/** The guest's Join field read once its dialog has rendered the refusal: it must hold the room's `code`. */
async function codeKept(games, found, code, why) {
  await games[1].call('roomsStep', { frames: KEPT_FRAMES });
  const { codeTyped } = await games[1].state();
  found.say(`turned away for ${why}: Join's field holds "${codeTyped}"`);
  found.expect(codeTyped === code, `the room's code was cleared from Join's field when turned away for ${why}`);
}

/** The create page pictured on the host's screen, each kind picked. */
async function createPictures(games, dir) {
  await games[0].page.evaluate(async () => {
    const coop = await import('/src/ui/coop.ts');
    coop.openCoop(true);
  });
  await games[0].call('roomsOpen');
  await games[0].page.evaluate(() => document.querySelector('#coop .coop-tab[data-pane="create"]')?.click());
  await games[0].page.evaluate(() => document.querySelector('#coop .coop-kind[data-kind="password"]')?.click());
  await picture(games[0], dir, '0-create');
}

/**
 * Runs `lab rooms` on `side`: its page the host, a partner's page the guest, against a relay of the lab's own.
 * Returns the report.
 */
export async function runRooms(side, { canary = false } = {}) {
  const { startRelay } = await import('../../../server/relay/relay.mjs');
  const origin = new URL(side.url).origin;
  const faults = canary ? { anyPassword: true, listPrivate: true, holdLeft: true } : {};
  const relayLog = [];
  const log = (...words) => relayLog.push(`${new Date().toISOString()} ${words.join(' ')}`);
  const server = await startRelay({ port: 0, origins: origin, grace: GRACE_MS, faults, log });
  const relay = { url: `http://127.0.0.1:${server.address().port}`, origin };
  const screen = await side.page.evaluate(() => `${innerWidth}x${innerHeight}`);
  const dir = join(OUT, 'rooms', screen);
  mkdirSync(dir, { recursive: true });
  const partner = await side.openPartner(side.heroClass);
  // (the partner on the command's screen too, so the joiner's pictures are of it: a partner opens on the lab's own)
  const shown = await side.page.evaluate(() => ({ width: innerWidth, height: innerHeight, ratio: devicePixelRatio }));
  await onScreen(partner, shown);
  const games = [new Game(side.page, 'host'), new Game(partner, 'guest')];
  const found = new Findings(canary);
  try {
    await openBoth(games, relay.url);
    await createPictures(games, dir);
    await publicRoom(games, found, relay, dir);
    await lockedRoom(games, found, relay, dir);
    await privateRoom(games, found, relay, dir);
    if (canary) {
      for (const fault of ['anyPassword', 'listPrivate', 'holdLeft']) {
        const seen = found.faultsSeen.has(fault);
        found.say(`canary: ${fault} ${seen ? 'caught' : 'went unseen'}`);
        if (!seen) found.problems.push(`rooms: the canary's ${fault} went unseen`);
      }
    }
    found.say(`pictures: ${dir}`);
    return { text: found.lines.join('\n'), problems: found.problems };
  } finally {
    await side.closePartner();
    await new Promise((resolve) => server.close(resolve));
    writeFileSync(join(OUT, 'rooms', 'relay.log'), `${relayLog.join('\n')}\n`);
  }
}
