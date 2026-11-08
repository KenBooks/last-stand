// `lab coop`'s run's end, played on every page of a party as players play it (page/coopEnd.ts): the run's end and the
// lobby it leads back to, then a second run watched by a hero out of it. Each step waits for what it plays to have
// happened, and says a problem where a game didn't do what a player would see it do.
//
// - The first run's end: the wave cleared, the guest banks, then holds its bow's draw and an aimed skill's key (a
//   banked ranger drew and aimed on, his sight drawn, as another played on); the host leaves, and every game must be
//   back in the lobby by itself (from play: "once the run ends and no one is playing any wave it should automatically
//   spawn you back with the others"), the guest's summary, shown before the run ended, gone with it ("You Have
//   Fallen" stayed up).
// - The second run: the guest falls first and watches the others: it follows the first partner by slot, LMB the next,
//   RMB the one before, the watching bar's buttons tapped likewise, F a free camera that WASD flies, Q/E and a middle
//   drag turning the view, two fingers twisted turning it with them; then the host leaves, and every game is back in
//   the lobby again by itself; its watching bar fitted on a desktop's, phones' and tablets' screens.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { OUT } from './paths.mjs';

/** where `--pictures` puts the watching bar on each screen it's fitted on */
const BAR_PICTURES = join(OUT, 'coop');

/** the frames a step waits for what it plays (the run's end takes the fall's 2.6 s and the 2.5 s it's said) */
const STEP_FRAMES = 600;
/** how long an older tree may take to send a game back once its summary is closed (ms, the browser's clock) */
const OLD_BACK_MS = 6000;
/** the frames the camera has to come to what it follows */
const SETTLE_FRAMES = 60;
/** the frames a key is held to turn the view, and the least it must turn (rad: Q/E turn 2.2 rad a second) */
const TURN_FRAMES = 30;
const LEAST_TURN = 0.5;
/** the middle drag's px, and the least it must turn the view (rad: 0.006 a px) */
const DRAG_PX = 200;
const LEAST_DRAG_TURN = 0.6;
/** how far the fingers twist (rad, clockwise on the screen) */
const TWIST_RAD = 0.9;
/** the frames the free camera is flown forward, and the least it must have gone (m: it flies 11 m a second) */
const FLY_FRAMES = 60;
const LEAST_FLIGHT = 3;
/** the frames an out hero holds his bow's draw, then an aimed skill's key */
const DRAW_FRAMES = 90;
const AIM_FRAMES = 30;
/** the aimed skill's key held out of the run (the ranger's Quarry Mark) */
const AIM_KEY = '3';

/**
 * Runs frames on every page until `done(states)` (each page's state, the host's first), at most `limit`. Returns the
 * last states and whether it came, never throwing: a game that doesn't is a problem to say, not a failed command.
 */
async function waitFor(pair, done, limit) {
  let states = [];
  for (let frames = 0; frames < limit; frames += pair.turnFrames) {
    states = await pair.turn(pair.turnFrames);
    if (done(states)) return { states, met: true };
  }
  return { states, met: false };
}

/** Holds `frame`'s input on `page` for `frames` frames (every page stepped), then lets it go. */
async function holdFor(pair, call, page, frame, frames) {
  await call(page, 'coopHold', { frame });
  await pair.run(frames);
  await call(page, 'coopHold', { frame: null });
}

/**
 * The first run's end: the wave cleared, the guest banked and holding his attack and an aimed skill out of the run,
 * then the host leaving it. Every game must go back to the lobby by itself, the guest's summary gone with the run.
 * Returns the problems (with `canary`: the guest made to cast out of the run and its summary shown again over the
 * lobby, each to be caught). Leaves every game in the lobby, its summary closed.
 */
export async function firstRunsEnd(pair, call, lines, { canary, tags }) {
  const problems = [];
  const [host, guest] = pair.pages;
  for (const page of pair.pages) await call(page, 'coopClearWave');
  const cleared = await waitFor(pair, (states) => states.every((state) => state.phase === 'cleared'), STEP_FRAMES);
  if (!cleared.met) return [`the host's wave never came to the choice on every game`];
  await holdFor(pair, call, guest, { keys: ['b'] }, pair.turnFrames);
  const banked = await waitFor(pair, (states) => states[1].out, STEP_FRAMES);
  if (!banked.met) return ['the guest pressed B at the choice, and never banked'];
  problems.push(...await heldOut(pair, call, lines, canary));
  problems.push(...await theRestLeave(pair, call, tags));
  await call(host, 'coopLeaveRun');
  problems.push(...await backByItself(pair, call, lines, { tags, canary }));
  return problems;
}

/** The party's others (the third, the fourth) leave the run before the host, each its summary shown: watchers like
 *  the guest when the host's leaving ends the run. Returns the problems. */
async function theRestLeave(pair, call, tags) {
  const rest = pair.pages.slice(2);
  if (!rest.length) return [];
  for (const page of rest) await call(page, 'coopLeaveRun');
  const shown = await waitFor(pair, (states) => states.slice(2).every((state) => state.summary), STEP_FRAMES);
  return shown.met ? [] : [`${tags.slice(2).join(' and ')} left the run, and no summary came`];
}

/** The guest, banked, holding his attack and then an aimed skill's key: he must do nothing and show no sight. */
async function heldOut(pair, call, lines, canary) {
  const guest = pair.pages[1];
  await call(guest, 'coopOutWatch');
  if (canary) await call(guest, 'coopOutCanary');
  await holdFor(pair, call, guest, { m0: true }, DRAW_FRAMES);
  await holdFor(pair, call, guest, { keys: [AIM_KEY] }, AIM_FRAMES);
  const seen = await call(guest, 'coopOutSeen');
  const did = `acting in ${seen.acting} of ${seen.frames} frames${seen.first ? ` (${seen.first})` : ''}`;
  lines.push(`the guest banked, holding his attack and key ${AIM_KEY}: ${did}, his sight drawn in ${seen.sight}`);
  const problems = [];
  if (!seen.frames) problems.push('the guest was never out of the run as he held his keys');
  if (seen.acting) problems.push(`the guest, banked, still acted on his keys (${did})`);
  if (seen.sight) problems.push(`the guest, banked, still had his bow's sight drawn in ${seen.sight} frames`);
  if (!canary) return problems;
  // (the planted cast is a drawn shot's for a ranger: its sight is drawn too)
  const planted = (problem) => problem.includes('still acted') || problem.includes('sight drawn');
  const caught = problems.some((problem) => problem.includes('still acted'));
  lines.push(`canary: a cast begun out of the run ${caught ? 'caught' : 'missed'}`);
  const rest = problems.filter((problem) => !planted(problem));
  return caught ? rest : [...rest, 'canary missed: a cast begun out of the run went unseen'];
}

/**
 * The host, last in the run, has left it: every game must be back in the lobby by itself, a summary shown before the
 * run ended (every other page's: they left first) gone with it. Returns the problems; leaves every game in the lobby,
 * its summary closed.
 */
async function backByItself(pair, call, lines, { tags, canary }) {
  const problems = [];
  const watchers = pair.pages.map((_, index) => index).slice(1);
  const inLobby = (states) => states.every((state) => state.mode === 'menu');
  let back = await waitFor(pair, inLobby, STEP_FRAMES);
  const said = back.states.map((state, index) => `${tags[index]} ${state.mode === 'menu' ? 'lobby' : 'run'}`);
  lines.push(`the run over, with nothing clicked: ${said.join(', ')}`);
  for (const watcher of watchers) {
    const now = back.states[watcher];
    if (now.mode === 'run' && now.runOver && now.summary) {
      problems.push(`${tags[watcher]}'s summary, shown before the run ended, stayed up after it ended`);
    }
  }
  if (!back.met) {
    const left = back.states.flatMap((state, index) => (state.mode === 'menu' ? [] : [tags[index]]));
    problems.push(`the run over, ${left.join(' and ')} never went back to the lobby by itself`);
    back = await clickedBack(pair, call, tags);
  }
  if (canary) {
    await call(pair.pages[watchers[0]], 'coopSummaryCanary');
    back = await waitFor(pair, () => true, 1);
  }
  for (const watcher of watchers) {
    const stayed = back.states[watcher].summary;
    lines.push(`${tags[watcher]}'s summary, shown before the run ended, ${stayed ? 'up' : 'gone'} in the lobby`);
    if (stayed) problems.push(`${tags[watcher]}'s summary, shown before the run ended, stayed up over the lobby`);
  }
  for (const [index, state] of back.states.entries()) {
    if (state.summary) await call(pair.pages[index], 'coopSummaryDone');
  }
  await pair.run(pair.turnFrames);
  if (!canary) return problems;
  const caught = problems.some((problem) => problem.includes('stayed up over the lobby'));
  lines.push(`canary: a summary left up over the lobby ${caught ? 'caught' : 'missed'}`);
  const rest = problems.filter((problem) => !problem.includes('stayed up over the lobby'));
  return caught ? rest : [...rest, 'canary missed: a summary left up over the lobby went unseen'];
}

/**
 * Every game still in the run sent back as a player would send it (an older tree's way): its summary's button
 * clicked, as each shows one, until all are in the lobby. Returns the last states; throws, saying where each game
 * stood, if they never are.
 */
async function clickedBack(pair, call, tags) {
  let states = [];
  const began = Date.now();
  // (an older tree sends a game back on the browser's own clock, 2.5 s after its run's end: the lab's frames outrun it)
  const waiting = (frames) => frames < STEP_FRAMES || Date.now() - began < OLD_BACK_MS;
  for (let frames = 0; waiting(frames); frames += pair.turnFrames) {
    states = await pair.turn(pair.turnFrames);
    if (states.every((state) => state.mode === 'menu')) return { states, met: true };
    for (const [index, state] of states.entries()) {
      if (state.mode === 'run' && state.summary) await call(pair.pages[index], 'coopSummaryDone');
    }
  }
  const where = (state, index) => `${tags[index]}: ${state.mode}, ${state.phase || 'no run'}, `
    + `${state.out ? 'out' : 'in'}, summary ${state.summary ? 'up' : 'down'}`;
  const stood = states.map(where).join('; ');
  throw new Error(`lab: coop: not every game went back to the lobby, its summary clicked (${stood})`);
}

/**
 * The second run, watched: every game starts it from the lobby, the guest falls (Leave the run held) and closes its
 * summary to watch the rest, its controls are played, then the host leaves. Returns the problems.
 */
export async function watchedRun(pair, call, lines, { tags, picture = null, canary = false }) {
  const [host, guest] = pair.pages;
  await call(host, 'coopHoldRun');
  await call(host, 'coopStart');
  const started = await waitFor(pair, (states) => states.every((state) => state.mode === 'run'), STEP_FRAMES);
  if (!started.met) return ['the second run never started on every game'];
  await call(guest, 'coopLeaveRun');
  const fallen = await waitFor(pair, (states) => states[1].summary, STEP_FRAMES);
  if (!fallen.met) return ['the guest left the second run, and no summary came'];
  await call(guest, 'coopSummaryDone');
  const watching = await waitFor(pair, (states) => !states[1].summary, STEP_FRAMES);
  if (!watching.met) return ['the guest\'s summary never closed for it to watch the rest'];
  const order = watching.states[1].partnerSlots;
  const problems = await watchControls(pair, call, lines, order);
  problems.push(...await barFits(guest, call, lines, { canary, pictures: picture !== null }));
  if (picture) await pictureWatching(pair, call, lines, picture);
  problems.push(...await theRestLeave(pair, call, tags));
  await call(host, 'coopLeaveRun');
  problems.push(...await backByItself(pair, call, lines, { tags, canary: false }));
  return problems;
}

/**
 * The guest's watching bar fitted on a desktop's, phones' and tablets' screens (page/coopEnd.ts `BAR_SCREENS`), in
 * touch mode as its bar's buttons were tapped: within the window, its buttons a finger's size, over no other part of
 * the HUD. With `canary`, a bar a window tall, whose run past the window must be found.
 */
async function barFits(guest, call, lines, { canary, pictures }) {
  const problems = [];
  const screens = await call(guest, 'coopBarScreens');
  for (let index = 0; index < screens; index++) {
    const fit = await call(guest, 'coopBarFit', { index, canary });
    lines.push(`watching bar on ${fit.line}`);
    problems.push(...fit.problems);
    if (pictures) await pictureBar(guest, call, index);
  }
  await call(guest, 'coopBarBack');
  if (!canary) return problems;
  const caught = problems.some((problem) => problem.includes('runs past the window'));
  lines.push(`canary: a watching bar a window tall ${caught ? 'caught' : 'missed'}`);
  return caught ? [] : ['canary: a watching bar a window tall was never found past the window'];
}

/** The guest's screen as its watching bar is fitted on screen `index` (`--pictures`). */
async function pictureBar(guest, call, index) {
  await call(guest, 'coopDrawing', { on: true });
  await guest.evaluate(() => window.__labClock.realFrame());
  // (through the DevTools protocol, at the screen's own pixels: Playwright's own put the page back on its screen)
  const png = await guest.evaluate(() => window.__labScreenshot());
  mkdirSync(BAR_PICTURES, { recursive: true });
  const file = join(BAR_PICTURES, `watching-bar-${index}.png`);
  writeFileSync(file, Buffer.from(png.replace(/^data:image\/png;base64,/, ''), 'base64'));
  await call(guest, 'coopDrawing', { on: false });
}

/** The guest's screen as it watches (`--pictures`): its watching bar over the run, drawn as the game draws it. */
async function pictureWatching(pair, call, lines, picture) {
  const guest = pair.pages[1];
  await call(guest, 'coopDrawing', { on: true });
  await pair.run(1);
  await guest.screenshot({ path: picture });
  await call(guest, 'coopDrawing', { on: false });
  lines.push(`watching: the guest's screen pictured in ${picture}`);
}

/** The partner after `slot` in `order` (the partners' slots in the run, in order) by `step`, round the end. */
export function nextInOrder(order, slot, step) {
  const at = order.indexOf(slot);
  return order[(at + step + order.length) % order.length];
}

/** The guest's camera settled after a step: what it shows. */
async function settled(pair, call) {
  await pair.run(SETTLE_FRAMES);
  return call(pair.pages[1], 'coopWatching');
}

/** The guest followed `want` (its spectating's choice and the hero at the screen's middle), or the problem. */
function following(seen, want, step) {
  if (seen.watched !== want) return [`${step}: the guest watched slot ${seen.watched}, not ${want}`];
  if (seen.centred !== want) {
    return [`${step}: the guest's camera showed slot ${seen.centred} in its middle, not ${want}`];
  }
  return [];
}

/** The angle from `a` to `b` round the shorter way (rad). */
const turned = (a, b) => Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)));

/** Each control of the watching played on the guest's game, by the mouse and keys and by a finger on its bar. */
async function watchControls(pair, call, lines, order) {
  const guest = pair.pages[1];
  const problems = [];
  const start = await settled(pair, call);
  lines.push(`watching: the bar ${start.bar ? `says "${start.said}"` : 'never shown'}`);
  if (!start.spectating) problems.push('the guest, out of the run, is not watching it');
  if (!start.bar) problems.push('the guest, out of the run, has no watching bar');
  if (start.downNote) problems.push('the guest, out of the run, is told it is down and bleeding out');
  problems.push(...following(start, order[0], 'watching'));
  const clicks = [['left', 1, 'LMB'], ['right', -1, 'RMB']];
  let slot = start.watched;
  for (const [button, step, name] of clicks) {
    await call(guest, 'coopClick', { button });
    const seen = await settled(pair, call);
    const want = nextInOrder(order, slot, step);
    problems.push(...following(seen, want, name));
    slot = seen.watched;
  }
  for (const [name, step] of [['next', 1], ['prev', -1]]) {
    const had = await call(guest, 'coopTapBar', { name });
    const seen = await settled(pair, call);
    if (!had) problems.push(`the watching bar has no ${name} button to tap`);
    else problems.push(...following(seen, nextInOrder(order, slot, step), `${name} tapped`));
    slot = seen.watched;
  }
  lines.push(`watching ${order.length} partner(s) by slot (${order.join(', ')}): clicked and tapped each way`);
  problems.push(...await flyFree(pair, call, lines, slot));
  problems.push(...await turnings(pair, call, lines));
  return problems;
}

/** F, the free camera flown forward, F back to following; the bar's button likewise by a finger. */
async function flyFree(pair, call, lines, slot) {
  const guest = pair.pages[1];
  const problems = [];
  await holdFor(pair, call, guest, { keys: ['f'] }, 1);
  const before = await settled(pair, call);
  await holdFor(pair, call, guest, { keys: ['w'] }, FLY_FRAMES);
  const after = await call(guest, 'coopWatching');
  const flown = Math.hypot(after.camera[0] - before.camera[0], after.camera[1] - before.camera[1]);
  lines.push(`F: flying free ${before.free}, W flew the camera ${flown.toFixed(2)} m in ${FLY_FRAMES} frames`);
  if (!before.free) problems.push('F: the guest\'s camera never flew free');
  if (flown < LEAST_FLIGHT) problems.push(`F: W flew the free camera ${flown.toFixed(2)} m in ${FLY_FRAMES} frames`);
  await holdFor(pair, call, guest, { keys: ['f'] }, 1);
  const back = await settled(pair, call);
  if (back.free) problems.push('F again: the guest\'s camera still flew free');
  problems.push(...following(back, slot, 'F again'));
  const had = await call(guest, 'coopTapBar', { name: 'free' });
  const tapped = await settled(pair, call);
  await call(guest, 'coopTapBar', { name: 'free' });
  const untapped = await settled(pair, call);
  if (!had) problems.push('the watching bar has no free camera button to tap');
  else if (!tapped.free || untapped.free) {
    problems.push('the bar\'s free camera button, tapped twice, never flew and came back');
  }
  return problems;
}

/** The view turned by E held, a middle drag and two fingers twisted: each must turn it, the twist the world with
 *  the fingers. */
async function turnings(pair, call, lines) {
  const guest = pair.pages[1];
  const ways = [];
  const turn = async (name, play) => {
    const before = await call(guest, 'coopWatching');
    await play();
    const after = await settled(pair, call);
    ways.push({ name, by: turned(before.yaw, after.yaw), after });
  };
  await turn('E held', () => holdFor(pair, call, guest, { keys: ['e'] }, TURN_FRAMES));
  await turn('a middle drag', async () => {
    await call(guest, 'coopDrag', { px: DRAG_PX });
    await pair.run(pair.turnFrames);
    await call(guest, 'coopDragEnd');
  });
  let worldTurned = 0;
  await turn('two fingers twisted', async () => {
    const before = await call(guest, 'coopWorldAngle');
    await call(guest, 'coopTwist', { rad: TWIST_RAD });
    await pair.run(SETTLE_FRAMES);
    const after = await call(guest, 'coopWorldAngle');
    worldTurned = Math.atan2(Math.sin(after - before), Math.cos(after - before));
  });
  lines.push(`turning while watching: ${ways.map((way) => `${way.name} ${way.by.toFixed(2)} rad`).join(', ')}`);
  const twist = TWIST_RAD.toFixed(2);
  lines.push(`fingers twisted ${twist} rad clockwise: the world on the screen ${worldTurned.toFixed(2)}`);
  const least = { 'E held': LEAST_TURN, 'a middle drag': LEAST_DRAG_TURN };
  const problems = ways.filter((way) => way.by < (least[way.name] ?? LEAST_TURN))
    .map((way) => `${way.name} turned the watching camera ${way.by.toFixed(2)} rad`);
  for (const way of ways) problems.push(...following(way.after, way.after.watched, `after ${way.name}`));
  if (worldTurned * TWIST_RAD <= 0) problems.push('two fingers twisted turned the world against them on the screen');
  return problems;
}

/** What lies over `page`'s canvas in its lobby, where a middle press turns nothing (page/coopEnd.ts
 *  `coopCanvasCover`), in a line. */
async function coverLine(page, call, tag) {
  const cover = await call(page, 'coopCanvasCover');
  const parts = cover.map((part) => `${part.name} ${(part.share * 100).toFixed(0)}%`);
  return `${tag}'s lobby: over its canvas ${parts.length ? parts.join(', ') : 'nothing'}`;
}

/**
 * The lobby's camera turned by a middle drag on every game, as a player turns it in a co-op lobby's top-down view
 * (from play, four in a lobby: a player couldn't turn it). Returns the problems.
 */
export async function lobbyTurns(pair, call, lines, { tags, when, onName = false, pages = pair.pages }) {
  const turns = [];
  for (const page of pages) {
    const before = await call(page, 'coopWatching');
    if (!await call(page, 'coopDrag', { px: DRAG_PX, onName })) {
      return [`${tags[pair.pages.indexOf(page)]}'s lobby showed no name on its floor to drag from`];
    }
    await pair.run(pair.turnFrames);
    await call(page, 'coopDragEnd');
    await pair.run(SETTLE_FRAMES);
    const after = await call(page, 'coopWatching');
    turns.push(turned(before.yaw, after.yaw));
  }
  const said = turns.map((by, index) => `${tags[index]} ${by.toFixed(2)} rad`);
  lines.push(`a middle drag in the lobby (${when}): ${said.join(', ')}`);
  lines.push(await coverLine(pages[0], call, tags[pair.pages.indexOf(pages[0])]));
  return turns.flatMap((by, index) => (by < LEAST_DRAG_TURN
    ? [`${tags[index]}'s middle drag in the lobby (${when}) turned its camera ${by.toFixed(2)} rad`]
    : []));
}

/**
 * The host throws an item on the lobby's floor and opens the hall of heroes over it: the floor must show in the lobby
 * and none of it in the hall (a Greataxe's shaft and name showed among the heroes). `during` plays the hall's frames
 * (the partners cast meanwhile). Returns the problems.
 */
export async function floorInHall(pair, call, lines, during) {
  const host = pair.pages[0];
  await call(host, 'coopThrowItem');
  await pair.run(SETTLE_FRAMES);
  const lobby = await call(host, 'coopFloor');
  const hall = await during(() => call(host, 'coopFloor'));
  lines.push(`the floor, an item thrown: in the lobby ${lobby.meshes} pieces and ${lobby.labels} names drawn, `
    + `in the hall ${hall.meshes} and ${hall.labels}`);
  const problems = [];
  if (!lobby.meshes || !lobby.labels) problems.push('the item thrown on the lobby\'s floor never showed there');
  if (hall.meshes || hall.labels) {
    problems.push(`the hall of heroes showed the lobby's floor (${hall.meshes} pieces, ${hall.labels} names)`);
  }
  return problems;
}
