// `lab friends`: co-op's friends end to end (#676, part 2), three games against a saves service and a co-op relay of
// the lab's own (server/saves, server/relay, started on localhost for the page's origin), every step the pages' own
// clicks and typing. The command's page is Brannoch, two partners' pages Ysolde and Pell; each makes a cloud save
// account with its own passkey (a virtual authenticator in its browser), then:
//   Ysolde types Brannoch's friend code and sends a request: Brannoch's tab shows it (its badge too) and Ysolde isn't
//     his friend until he accepts it from its row; then both list each other. Pell asks Brannoch, accepted.
//   Brannoch opens a private room, friends allowed: Ysolde's list shows him online in it with Join, which takes her in.
//   From the room, Brannoch invites Pell: Pell's game shows the invite's toast, whose Join takes him in.
//   All leave; Brannoch opens a private room kept from friends: Ysolde's list shows him in a room with no Join.
// `--canary` starts the saves service with the faults it must catch: a request counted as a friendship before it's
// accepted, and a room kept from friends shown to them; and each page lays a room's cards out as they were before
// Victor's review of #700 (a narrow card's class name run on over the stats' labels), which the text check of each
// picture must find. Pictures of each step in `out/friends/<screen>/`, each checked for text over other text.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { labError } from './errors.mjs';
import { OUT } from './paths.mjs';
import { startSavesService } from './savesService.mjs';

/** how long a step is given to come about (ms of the browser's own time: the services' answers come in it) */
const STEP_MS = 30000;
/** how often a waited-for step is read again (ms), and the game frames run between reads */
const READ_MS = 400;
const FRAMES_A_READ = 2;
/** the relay holds a dropped peer this long here (ms) */
const GRACE_MS = 400;
/** how long a picture waits for the dialog's fade in to end (ms of the browser's clock) */
const FADE_MS = 500;
const NAMES = ['Brannoch', 'Ysolde', 'Pell'];
const ROOM = { kind: 'private', name: 'Crypt run', password: '', max: 4 };
/** the virtual passkey each page's browser has (as `lab cloud`'s devices: cloudDevice.mjs) */
const AUTHENTICATOR = {
  protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true,
  automaticPresenceSimulation: true,
};

/** One of the games: its page, its player's name, and its calls into page/friends.ts and page/rooms.ts. */
class Game {
  constructor(page, name) {
    this.page = page;
    this.name = name;
  }

  async call(fn, args = {}) {
    const module = fn.startsWith('rooms') ? 'rooms' : 'friends';
    try {
      return await this.page.evaluate(async ([module, fn, args]) => {
        const page = await import(`/tools/lab/page/${module}.ts`);
        return page[fn](window.__lab, args);
      }, [module, fn, args]);
    } catch (error) {
      throw labError(`friends: ${this.name}: ${fn}: ${error.message}`);
    }
  }

  state() {
    return this.call('friendsState');
  }
}

/** The run's findings: lines, problems, and the canary's faults seen. */
class Findings {
  constructor(canary) {
    this.canary = canary;
    this.lines = [];
    this.problems = [];
    this.faultsSeen = new Set();
    /** the pictures whose text was checked */
    this.checked = new Set();
  }

  say(line) {
    this.lines.push(line);
  }

  /** `problem` noted unless `fine`; with a canary, a problem of one of its faults is the fault seen. */
  expect(fine, problem, fault = null) {
    if (fine) return;
    if (this.canary && fault) this.faultsSeen.add(fault);
    else this.problems.push(`friends: ${problem}`);
  }
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Every game read, frames run and the friends asked for between reads, until `done(...states)`; throws saying `what`
 *  if it never comes. Returns the last states. */
async function until(games, done, what) {
  const start = Date.now();
  for (;;) {
    const states = await Promise.all(games.map((game) => game.state()));
    if (done(...states)) return states;
    if (Date.now() - start > STEP_MS) {
      const said = states.map((s, i) => `${games[i].name}: ${s.session}${s.open ? ', dialog open' : ''}, invites ${
        s.invites.join(', ') || 'none'}, rows ${
        s.rows.map((r) => `${r.section}/${r.name}[${r.acts.join(',')}]`).join(' ') || 'none'}${s.note ? `, "${s.note}"` : ''}`);
      throw labError(`friends: ${what} (${said.join('; ')})`);
    }
    await pause(READ_MS);
    await Promise.all(games.map(async (game) => {
      await game.call('roomsStep', { frames: FRAMES_A_READ });
      await game.call('friendsRefresh');
    }));
  }
}

/** A row of `state` by its section and name. */
const rowOf = (state, section, name) => state.rows.find((r) => r.section === section && r.name === name);

/** A picture of a game's screen, as the player sees it, kept under `dir`, and its text checked: none drawn over other
 *  text in a room's cards, the friends' rows or the invite's banner (`textOverlap` the canary's fault). */
async function picture(game, dir, name, found) {
  await game.call('roomsStep', { frames: 3 });
  await pause(FADE_MS);
  const over = await game.call('friendsTextOver', { where: `${game.name}'s ${name}` });
  if (over.length) found.say(`text over text: ${over.join('; ')}`);
  for (const problem of over) found.expect(false, problem, 'textOverlap');
  found.checked.add(name);
  const cdp = await game.page.context().newCDPSession(game.page);
  try {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(dir, `${name}.png`), Buffer.from(data, 'base64'));
  } finally {
    await cdp.detach();
  }
}

/** `page` given the virtual passkey and put on `screen`, through the DevTools protocol (the session kept open: what
 *  it sets lasts as long as it does). */
async function prepare(page, screen) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: AUTHENTICATOR });
  if (screen) {
    await cdp.send('Emulation.setDeviceMetricsOverride',
      { width: screen.width, height: screen.height, deviceScaleFactor: screen.ratio, mobile: false });
  }
  page.once('close', () => cdp.detach().catch(() => {}));
}

/** Each game pointed at the services, its name tag kept, signed up: their friend codes by name. */
async function signUpAll(games, relayUrl, savesUrl) {
  const codes = {};
  for (const game of games) {
    await game.call('friendsUse', { server: relayUrl.replace(/^http/, 'ws'), saves: savesUrl, tag: game.name });
    codes[game.name] = await game.call('friendsSignUp');
    if (!/^[0-9A-Z]{8}$/.test(codes[game.name])) throw labError(`friends: ${game.name} has no friend code after signing up`);
  }
  return codes;
}

/** Ysolde asks Brannoch by his code; he sees it and accepts it; Pell asks too and is accepted. */
async function befriend(games, codes, found, dir) {
  const [brannoch, ysolde, pell] = games;
  for (const game of games) await game.call('friendsOpenTab');
  await picture(brannoch, dir, '1-friends', found);
  await ysolde.call('friendsAdd', { code: codes.Brannoch });
  const [asked, asking] = await until([brannoch, ysolde], (b) => rowOf(b, 'Requests', 'Ysolde'),
    'Brannoch never saw Ysolde\'s request');
  found.say(`Ysolde asked by code: Brannoch's tab shows her request (badge ${asked.badge}); her note "${asking.note}"`);
  found.expect(asked.badge === 1, `Brannoch's Friends tab's badge says ${asked.badge} with a request waiting`);
  found.expect(Boolean(rowOf(asking, 'Sent', 'Brannoch')), 'Ysolde\'s tab doesn\'t list her request as sent');
  const early = asking.service.some((f) => f.name === 'Brannoch');
  found.expect(!early, 'Ysolde lists Brannoch as a friend before he accepted', 'oneWay');
  await picture(brannoch, dir, '2-request', found);
  await brannoch.call('friendsAct', { name: 'Ysolde', act: 'accept' });
  await until([brannoch, ysolde], (b, y) => rowOf(b, 'Online', 'Ysolde') && rowOf(y, 'Online', 'Brannoch'),
    'Brannoch and Ysolde never listed each other online');
  found.say('accepted: both list each other, online');
  await pell.call('friendsAdd', { code: codes.Brannoch });
  await until([brannoch], (b) => rowOf(b, 'Requests', 'Pell'), 'Brannoch never saw Pell\'s request');
  await brannoch.call('friendsAct', { name: 'Pell', act: 'accept' });
  await until([brannoch, pell], (b, p) => rowOf(b, 'Online', 'Pell') && rowOf(p, 'Online', 'Brannoch'),
    'Brannoch and Pell never listed each other');
  found.say('Pell asked and was accepted');
}

/** Brannoch opens a private room for friends; Ysolde sees it in her list and joins from it. */
async function joinFromList(games, found, dir) {
  const [brannoch, ysolde] = games;
  await brannoch.call('friendsRoomTick', { on: true });
  await brannoch.call('roomsCreate', { tag: 'Brannoch', ...ROOM });
  const [hosting] = await until([brannoch], (b) => b.session === 'hosting' && b.roomCode, 'Brannoch\'s room never opened');
  const code = hosting.roomCode;
  const [seen] = await until([ysolde], (y) => rowOf(y, 'Online', 'Brannoch')?.acts.includes('join'),
    'Ysolde\'s list never showed Brannoch\'s room with Join');
  const row = rowOf(seen, 'Online', 'Brannoch');
  found.say(`Brannoch hosting ${code}: Ysolde's list says "${row.line}"`);
  found.expect(/In a room/.test(row.line), `Ysolde's list says "${row.line}" of Brannoch in a room`);
  await picture(ysolde, dir, '3-friend-in-room', found);
  await ysolde.call('friendsAct', { name: 'Brannoch', act: 'join' });
  await until([brannoch, ysolde], (b, y) => y.session === 'joined' && y.roomCode === code && b.partners === 1,
    'Ysolde never joined Brannoch\'s room from her list');
  found.say('Ysolde joined from her list');
  return code;
}

/** From the room, Brannoch invites Pell; Pell's toast shows it, and its Join takes him in. */
async function inviteToRoom(games, code, found, dir) {
  const [brannoch, , pell] = games;
  const [inRoom] = await until([brannoch], (b) => rowOf(b, 'Invite friends', 'Pell'), 'the room never offered to invite Pell');
  found.say(`the room's invite list: ${inRoom.rows.filter((r) => r.section === 'Invite friends').map((r) => r.name).join(', ')}`);
  await picture(brannoch, dir, '4-room-invite', found);
  // (Pell out in the village: with Play together open the invite waits in its Friends tab, not a toast)
  await pell.call('friendsClose');
  await brannoch.call('friendsAct', { name: 'Pell', act: 'invite' });
  await until([pell], (p) => p.invites.includes('Brannoch'), 'the service never held Brannoch\'s invite for Pell');
  const [invited] = await until([pell], (p) => p.toast !== '', 'Pell\'s game held the invite and never showed it');
  found.say(`Pell's toast: "${invited.toast}"`);
  found.expect(/Brannoch/.test(invited.toast), `Pell's invite doesn't name Brannoch: "${invited.toast}"`);
  await picture(pell, dir, '5-invite', found);
  await pell.call('friendsToastJoin');
  await until([brannoch, pell], (b, p) => p.session === 'joined' && p.roomCode === code && b.partners === 2,
    'Pell never joined from the invite');
  found.say('Pell joined from the invite: three in the room');
  await picture(brannoch, dir, '6-party', found);
}

/** Everyone out; Brannoch opens a room kept from friends: Ysolde sees him in a room, with no Join. */
async function hiddenRoom(games, code, found) {
  const [brannoch, ysolde, pell] = games;
  for (const game of [pell, ysolde, brannoch]) await game.call('roomsLeave');
  await until(games, (...states) => states.every((s) => s.session === 'off'), 'the room was never left');
  await brannoch.call('friendsRoomTick', { on: false });
  await brannoch.call('roomsCreate', { tag: 'Brannoch', ...ROOM, name: 'Just us' });
  await until([brannoch], (b) => b.session === 'hosting' && b.roomCode, 'the hidden room never opened');
  await ysolde.call('friendsOpenTab');
  const [seen] = await until([ysolde], (y) => {
    const friend = y.service.find((f) => f.name === 'Brannoch');
    return friend?.busy || (friend?.room && friend.room !== code);
  }, 'Ysolde never heard Brannoch was in another room');
  const row = rowOf(seen, 'Online', 'Brannoch');
  found.say(`a room kept from friends: Ysolde's list says "${row?.line}"${row?.acts.includes('join') ? ' with Join' : ''}`);
  found.expect(!row?.acts.includes('join') && !seen.service.find((f) => f.name === 'Brannoch').room,
    'a room kept from friends is shown to them with its code', 'hiddenRooms');
  await brannoch.call('roomsLeave');
}

/**
 * Runs `lab friends` on `side`: its page and two partners' against services of the lab's own. Returns the report.
 */
export async function runFriends(side, { canary = false } = {}) {
  const { startRelay } = await import('../../../server/relay/relay.mjs');
  const origin = new URL(side.url).origin;
  const faults = canary ? { oneWay: true, hiddenRooms: true } : {};
  const relayServer = await startRelay({ port: 0, origins: origin, grace: GRACE_MS, log: () => {} });
  const relayUrl = `http://127.0.0.1:${relayServer.address().port}`;
  const saves = await startSavesService(origin, faults);
  const screen = await side.page.evaluate(() => ({ width: innerWidth, height: innerHeight, ratio: devicePixelRatio }));
  const dir = join(OUT, 'friends', `${screen.width}x${screen.height}`);
  mkdirSync(dir, { recursive: true });
  const found = new Findings(canary);
  try {
    await prepare(side.page, null);
    const partners = [await side.openPartner(side.heroClass), await side.openPartner(side.heroClass)];
    for (const partner of partners) await prepare(partner, screen);
    const games = [new Game(side.page, NAMES[0]), new Game(partners[0], NAMES[1]), new Game(partners[1], NAMES[2])];
    const codes = await signUpAll(games, relayUrl, saves.url);
    if (canary) for (const game of games) await game.call('friendsPlantOverlap');
    found.say(`signed up: ${games.map((g) => g.name).join(', ')}, each with a friend code`);
    await befriend(games, codes, found, dir);
    const code = await joinFromList(games, found, dir);
    await inviteToRoom(games, code, found, dir);
    await hiddenRoom(games, code, found);
    if (canary) {
      for (const fault of ['oneWay', 'hiddenRooms', 'textOverlap']) {
        const seen = found.faultsSeen.has(fault);
        found.say(`canary: ${fault} ${seen ? 'caught' : 'went unseen'}`);
        if (!seen) found.problems.push(`friends: the canary's ${fault} went unseen`);
      }
    }
    found.say(`pictures: ${dir}`);
    return { text: found.lines.join('\n'), problems: found.problems };
  } finally {
    await side.closePartner();
    await new Promise((resolve) => relayServer.close(resolve));
    await saves.close();
  }
}
