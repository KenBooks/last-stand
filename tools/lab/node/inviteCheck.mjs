// `lab invite`: the agent invited into a game end to end (#529), the command's page the owner's game and this
// process the agent, against a relay of the lab's own (server/relay, started on localhost for the page's origin).
// Every step of the game's side is the player's own click, and what it shows is read off the page:
//   Invite agent pressed, the command with its code read off the panel;
//   an agent joined with the code: the question up, and a step sent before its answer never run;
//   a second agent on the same code refused;
//   Let it in: the badge up; look, set, eval and picture answered, each checked against the page's own state;
//   Kick on the badge: the link ended, the badge gone; the used code refused;
//   a new invitation joined by the command a session runs, `lab join <code>` in a process of its own, and its steps
//     run as command lines (joinCommandCheck.mjs);
//   a new invitation, joined and let in, then a co-op room opened: the agent sent away, and none offered in the room.
// `--canary` starts the relay with the fault it must catch, a used code left good, so a second agent gets in; and
// with its hold on an unaccepted agent's messages off, so the step sent before the answer reaches the page, whose own
// hold must then be what stops it.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { joinGame } from './agentLink.mjs';
import { joinCommandChecked } from './joinCommandCheck.mjs';
import { labError } from './errors.mjs';
import { OUT } from './paths.mjs';

/** how long a step is given to come about (ms of the browser's own time: the relay's answers come in it) */
const STEP_MS = 20_000;
/** how often a waited-for step is read again (ms), and the game's frames run between reads */
const READ_MS = 100;
const FRAMES_A_READ = 2;
/** how long a step sent before the player's answer is given to (wrongly) be answered, ms */
const EARLY_MS = 600;
/** the relay holds a dropped co-op peer this long here (ms) */
const GRACE_MS = 400;
/** the co-op room the last part opens */
const ROOM = { tag: 'Brannoch', kind: 'private', name: 'Quiet room', password: '', max: 2 };
/** a picture's side asked for (px), and the least its pixels' brightness must range for it to show the game */
const SIDE = 480;
const RANGE_LEAST = 24;

/** Calls `fn` of the page module `module` (under tools/lab/page) with `args`; a failure names the call. */
async function callPage(page, module, fn, args = {}) {
  try {
    return await page.evaluate(async ([module, fn, args]) => {
      const loaded = await import(`/tools/lab/page/${module}.ts`);
      return loaded[fn](window.__lab, args);
    }, [module, fn, args]);
  } catch (error) {
    throw labError(`invite: ${fn}: ${error.message}`);
  }
}

/** The run's findings: lines, problems, and whether the canary's fault was seen. */
class Findings {
  constructor(canary) {
    this.canary = canary;
    this.lines = [];
    this.problems = [];
    this.faultSeen = false;
  }

  say(line) {
    this.lines.push(line);
  }

  /** `problem` noted unless `fine`; with the canary, a problem of its fault is the fault seen. */
  expect(fine, problem, ofFault = false) {
    if (fine) return;
    if (this.canary && ofFault) this.faultSeen = true;
    else this.problems.push(`invite: ${problem}`);
  }
}

/** The owner's game: its page, driven and read through page/invite.ts. */
class Game {
  constructor(page) {
    this.page = page;
  }

  state() {
    return callPage(this.page, 'invite', 'inviteState');
  }

  press(what) {
    return callPage(this.page, 'invite', 'invitePress', { what });
  }

  step(frames, drawn = false) {
    return callPage(this.page, 'invite', 'inviteStep', { frames, drawn });
  }

  /** The page read, frames run between reads, until `done(state)`; throws saying `what` if it never comes. */
  async until(done, what, drawn = false) {
    const start = Date.now();
    for (;;) {
      const state = await this.state();
      if (await done(state)) return state;
      if (Date.now() - start > STEP_MS) {
        throw labError(`invite: ${what} (the panel says "${state.note}", co-op ${state.session})`);
      }
      await new Promise((resolve) => setTimeout(resolve, READ_MS));
      await this.step(FRAMES_A_READ, drawn);
    }
  }

  /** `promise` awaited with the game's frames run meanwhile (drawn, for a picture's). */
  async whileStepping(promise, drawn = false) {
    let settled = false;
    const done = promise.finally(() => {
      settled = true;
    });
    done.catch(() => {});
    await this.until(() => settled, 'a step was never answered', drawn);
    return done;
  }

  /** The page's screen as the player sees it, kept under `dir`. */
  async picture(dir, name) {
    await this.step(3, true);
    const cdp = await this.page.context().newCDPSession(this.page);
    try {
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(dir, `${name}.png`), Buffer.from(data, 'base64'));
    } finally {
      await cdp.detach();
    }
  }
}

/** Why `join` was refused, or null if it got in (its link then left). */
async function refusal(server, code) {
  try {
    const link = await joinGame({ server, code });
    link.close();
    return null;
  } catch (error) {
    return error.message;
  }
}

/** Invite agent pressed and its command read off the panel; returns the code in it. */
async function invited(game, found, server) {
  await game.press('invite');
  const state = await game.until((s) => s.command !== '', 'the panel never showed a code');
  const code = /join (\S+)/.exec(state.command)?.[1] ?? '';
  found.say(`invited: the panel shows "${state.command.replace(code, '<code>')}"`);
  found.expect(/^[\w-]{32}$/.test(code), `the code shown isn't 24 random bytes: "${code}"`);
  found.expect(state.command.includes(`--server ${server}`), 'the command doesn\'t name the relay the page was pointed at');
  return code;
}

/** An agent joined with `code` and held at the question: a step sent early never runs, a second agent is refused. */
async function heldAtTheQuestion(game, found, server, code, dir) {
  let link = await joinGame({ server, code });
  const asked = await game.until((s) => s.asked, 'the game never asked whether to let the agent in');
  found.say(`joined with the code: the game asks, the badge ${asked.badge ? 'up already' : 'not up yet'}`);
  found.expect(!asked.badge, 'the badge is up before the player answered');
  await game.picture(dir, '1-asked');
  // (a step before the answer: sent past the link's own guard, as a hostile agent would)
  link.sendRaw({ d: { id: 9001, step: 'eval', code: '(window.__invite = [...(window.__invite ?? []), "early"]).length' } });
  await new Promise((resolve) => setTimeout(resolve, EARLY_MS));
  await game.step(FRAMES_A_READ);
  const early = (await game.state()).marks.includes('early');
  found.say(`a step sent before the answer: ${early ? 'RAN' : 'not run'}`);
  found.expect(!early, 'code ran in the page before the player let the agent in');
  // (a second agent on the same code, while the first waits)
  let second = null;
  try {
    second = await joinGame({ server, code });
  } catch (error) {
    found.say(`a second agent on the same code: refused (${error.message})`);
  }
  if (second) {
    found.say('a second agent on the same code: let in');
    found.expect(false, 'a second agent got in on a code already used', true);
    // (the fault's second agent took the first's place: the rest runs with it)
    link = second;
    await game.until((s) => s.asked, 'the game never asked for the second agent');
  }
  return link;
}

/** The steps an agent runs once let in, each against the page's own state. */
async function stepsAnswered(game, found, link, dir) {
  const before = await game.state();
  const seen = await game.whileStepping(link.step('look'));
  const controls = seen.settings?.panel ?? [];
  found.say(`look: a ${seen.hero?.class} in ${seen.biome} (${seen.mode}), the ${seen.camera?.view} view, `
    + `${controls.length} controls, ${seen.frame?.parts?.length ?? 0} parts of the frame, the crosshair on `
    + `${seen.crosshair ? 'something' : 'nothing'}`);
  found.expect(seen.hero?.class === before.heroClass, `look says the hero is a ${seen.hero?.class}, the page a ${before.heroClass}`);
  found.expect(Array.isArray(seen.camera?.at) && seen.camera.at.length === 3, 'look gives no camera');
  found.expect('crosshair' in seen, 'look says nothing of the crosshair');
  found.expect(controls.some((c) => c.name === 'god') && controls.some((c) => c.name.startsWith('part:')),
    'look lists neither the panel\'s god mode nor a part of the frame');
  found.expect((seen.frame?.parts?.length ?? 0) > 0, 'look lists no parts of the frame');
  // (the engine's counts: read off three's renderer, a real game's look said 0 triangles)
  found.say(`look's frame: ${seen.frame?.draws} draws, ${seen.frame?.triangles} triangles`);
  found.expect(seen.frame?.triangles > 1000 && seen.frame?.draws > 10 && seen.frame.draws < 20_000,
    `look counts a frame of ${seen.frame?.draws} draws and ${seen.frame?.triangles} triangles`);

  await game.whileStepping(link.step('set', { values: { god: true, wave: 7 } }));
  const set = await game.state();
  found.say(`set god=true wave=7: the page has god mode ${set.god ? 'on' : 'off'}, the wave field at ${set.wave}`);
  found.expect(set.god === true && set.wave === '7', 'set didn\'t reach the panel\'s god mode and wave');
  await game.whileStepping(link.step('set', { values: { god: false } }));
  found.expect((await game.state()).god === false, 'set left god mode on');
  const wrong = await game.whileStepping(link.step('set', { values: { nonesuch: 1 } })).catch((error) => error.message);
  found.expect(/no "nonesuch"/.test(String(wrong)), `a control the panel hasn't was answered "${wrong}"`);

  const cls = await game.whileStepping(link.step('eval', { code: 'G.player.cls.id' }));
  const sum = await game.whileStepping(link.step('eval', { code: 'const a = 2; await dev.frames(1); return a * 21;' }));
  const thrown = await game.whileStepping(link.step('eval', { code: 'nope.nope' })).catch((error) => error.message);
  found.say(`eval: the hero's class ${JSON.stringify(cls)}, statements with an await ${sum}, an error "${thrown}"`);
  found.expect(cls === before.heroClass, `eval read the class as ${JSON.stringify(cls)}`);
  found.expect(sum === 42, `eval's statements gave ${sum}`);
  found.expect(/ReferenceError/.test(String(thrown)), 'eval\'s error didn\'t come back as one');

  const view = await game.whileStepping(link.step('picture', { side: SIDE }), true);
  const hero = seen.hero.at;
  const camera = { at: [hero[0] + 6, hero[1] + 5, hero[2] + 6], to: [hero[0], hero[1] + 1, hero[2]] };
  const placed = await game.whileStepping(link.step('picture', { side: SIDE, camera, format: 'png' }), true);
  for (const [name, shot] of [['2-view', view], ['3-placed', placed]]) {
    const stats = await callPage(game.page, 'invite', 'invitePictureStats', { type: shot.type, data: shot.data });
    writeFileSync(join(dir, `${name}.${shot.type === 'image/png' ? 'png' : 'jpg'}`), Buffer.from(shot.data, 'base64'));
    found.say(`picture (${shot.view}): ${stats.width}x${stats.height} ${shot.type}, its brightness ranging ${stats.range}`);
    found.expect(Math.max(stats.width, stats.height) === SIDE, `the ${shot.view} picture is ${stats.width}x${stats.height}`);
    found.expect(stats.range >= RANGE_LEAST, `the ${shot.view} picture is blank (its brightness ranges ${stats.range})`);
  }
  found.expect(view.data !== placed.data, 'the placed camera\'s picture is the player\'s view');
  await game.step(FRAMES_A_READ);
  found.expect(!(await game.state()).flying, 'the placed camera was left flying after its picture');
}

/** Kicked by the badge: the link ended, the badge gone, and the used code good for nothing. */
async function kicked(game, found, server, link, code, dir) {
  await game.picture(dir, '4-connected');
  await game.press('kick');
  const why = await game.whileStepping(link.ended);
  const state = await game.state();
  found.say(`kicked: the agent's link ended (${why}), the badge ${state.badge ? 'still up' : 'gone'}, "${state.note}"`);
  found.expect(why === 'game', `the kick ended the agent's link as "${why}"`);
  found.expect(!state.badge, 'the badge stayed up after the kick');
  const refused = await refusal(server, code);
  found.say(`the used code: ${refused ? 'refused' : 'let in'}`);
  found.expect(refused !== null, 'the used code let an agent in');
}

/** A new invitation, joined and let in, then a co-op room opened: the agent sent away, none offered in the room. */
async function coopSendsAway(game, found, server) {
  const code = await invited(game, found, server);
  const link = await joinGame({ server, code });
  await game.until((s) => s.asked, 'the game never asked for the second invitation\'s agent');
  await game.press('accept');
  await game.whileStepping(link.accepted);
  // (the panel put away: it lies over Play together's left side, where a click on Leave room would land)
  await callPage(game.page, 'invite', 'invitePanelAway');
  // (Play together checks its server as it opens, and offers no room until it has answered: on a page just booted
  // the room's button was pressed while it still checked, and no room opened)
  await callPage(game.page, 'rooms', 'roomsOpen');
  await game.until(async () => !/Checking/.test((await callPage(game.page, 'rooms', 'roomsState')).status),
    'Play together never found the relay');
  await callPage(game.page, 'rooms', 'roomsCreate', ROOM);
  const why = await game.whileStepping(link.ended);
  const state = await game.until((s) => s.session === 'hosting', 'the co-op room never opened');
  found.say(`a co-op room opened: the agent's link ended (${why}), the badge ${state.badge ? 'still up' : 'gone'}, `
    + `Invite agent ${state.canInvite ? 'offered' : 'not offered'}, "${state.note}"`);
  found.expect(why === 'game', `co-op ended the agent's link as "${why}"`);
  found.expect(!state.badge, 'the badge stayed up in a co-op room');
  found.expect(!state.canInvite, 'an agent can be invited in a co-op room');
  await callPage(game.page, 'rooms', 'roomsLeave');
  await game.until((s) => s.session === 'off', 'the co-op room was never left');
  // (offered again as the game's next frame reads the room gone)
  await game.until((s) => s.canInvite, 'out of the room again, no agent could be invited');
  found.say('the room left: Invite agent offered again');
}

/**
 * Runs `lab invite` on `side`: its page the owner's game, this process the agent, against a relay of the lab's own.
 * Returns the report.
 */
export async function runInvite(side, { canary = false } = {}) {
  const { startRelay } = await import('../../../server/relay/relay.mjs');
  const origin = new URL(side.url).origin;
  const relayLog = [];
  const log = (...words) => relayLog.push(`${new Date().toISOString()} ${words.join(' ')}`);
  const relay = await startRelay({
    port: 0, origins: origin, agentOrigins: origin, grace: GRACE_MS, faults: canary ? { agentReuse: true, agentUngated: true } : {}, log,
  });
  const server = `ws://127.0.0.1:${relay.address().port}`;
  const screen = await side.page.evaluate(() => `${innerWidth}x${innerHeight}`);
  const dir = join(OUT, 'invite', screen);
  mkdirSync(dir, { recursive: true });
  const game = new Game(side.page);
  const found = new Findings(canary);
  try {
    await callPage(side.page, 'rooms', 'roomsUse', { server });
    const code = await invited(game, found, server);
    const link = await heldAtTheQuestion(game, found, server, code, dir);
    await game.press('accept');
    await game.whileStepping(link.accepted);
    const inside = await game.state();
    found.say(`let in: the badge ${inside.badge ? 'up' : 'NOT up'}, the question ${inside.asked ? 'still up' : 'gone'}`);
    found.expect(inside.badge && !inside.asked,'let in, the badge isn\'t up or the question still is');
    found.expect(!(await game.state()).marks.includes('early'), 'the step sent before the answer ran once the agent was let in');
    await stepsAnswered(game, found, link, dir);
    await kicked(game, found, server, link, code, dir);
    await joinCommandChecked(game, found, server, await invited(game, found, server));
    await coopSendsAway(game, found, server);
    if (canary) {
      found.say(`canary: a used code left good ${found.faultSeen ? 'caught' : 'went unseen'}`);
      if (!found.faultSeen) found.problems.push('invite: the canary\'s used code left good went unseen');
    }
    found.say(`pictures: ${dir}`);
    return { text: found.lines.join('\n'), problems: found.problems };
  } catch (error) {
    // (what was found before it stopped says where)
    throw labError([error.message, 'before it stopped:', ...found.lines].join('\n'));
  } finally {
    await new Promise((resolve) => relay.close(resolve));
    writeFileSync(join(OUT, 'invite', 'relay.log'), `${relayLog.join('\n')}\n`);
  }
}
