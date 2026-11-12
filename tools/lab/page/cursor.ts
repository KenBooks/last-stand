// The cursor drawn over mouse look while Alt is held (tools/lab `cursor`). In each close view the pointer is locked
// for mouse look as the player's click takes it (the lab's browser plays the lock: tools/lab/node/browser.mjs, every
// event of the mouse sent to the game's canvas while it's held, as Chrome sends them), and the mouse moved with
// nothing held must turn the view. Then Alt is held: the mouse moved onto the battle log's Pause (the view held still,
// the cursor drawn there, lit over a button), clicked (the log paused, no attack), moved onto a slot of the hotbar (its
// tooltip shown), its wheel turned over the log's lines (they scroll, the view keeps its zoom), and the world clicked
// (no attack). Alt let go, the cursor is gone and the mouse turns the view again; a click on the world attacks, which
// shows the measure sees an attack. The lock is held and the run goes on throughout. With the canary, Ctrl is held
// instead, a key that frees nothing: the checks must find the view turned, no cursor and the click on Pause attacking.
// (The owner, through the eyes: "in 3rd and 1st person user cannot press on those battle log buttons".)
import { middleOf } from './lab';
import type { Clip, Fixture, Lab, PagePoint, Pictured, Report } from './lab';
import type { ViewMode } from '../../../src/core/renderer';
import { G } from '../../../src/state';
import { input } from '../../../src/core/input';
import { cameraYaw } from '../../../src/core/renderer';
import { hurtPlayer } from '../../../src/combat/damage';
import { battleLog } from './battleLog';

export interface CursorOptions {
  fixture: Fixture;
  /** the close views measured: over the shoulder, through the eyes */
  views: ViewMode[];
  /** hold Ctrl instead of Alt, a key that frees nothing: the checks must catch what that leaves */
  canary: boolean;
}

type BattleLog = NonNullable<Awaited<ReturnType<typeof battleLog>>>;

/** A key held: its code as the keyboard sends it, the game's name for it (`Frame.keys`), and the player's. */
interface Held {
  code: string;
  name: string;
  label: string;
}

/** the key held for the cursor, and the canary's in its place */
const ALT: Held = { code: 'AltLeft', name: 'altleft', label: 'Alt' };
const CTRL: Held = { code: 'ControlLeft', name: 'controlleft', label: 'Ctrl' };
/** how far the mouse moves for mouse look to turn the view (css px) */
const LOOK_MOVE = 60;
/** a turn of the view smaller than this is none (rad) */
const STILL = 1e-6;
/** the blows listed for the log's lines to scroll, each this long after the last (s: past the log's join gap, so
 *  each is a line of its own) */
const BLOWS = 24;
const APART = 2;
/** the wheel's turn over the log's lines (px: up) */
const WHEEL = -120;
/** the frames run for the log's panel to draw (it draws every 0.1 s at most) */
const DRAW_FRAMES = 12;
/** the frames the lock has to be taken in, after the click that asks for it */
const LOCK_FRAMES = 4;
/** how far the drawn cursor may point from where the mouse took it (css px: the mouse's events come in whole px, from
 *  the window's middle, a half px off at an odd width, to a button's, which needn't be on one) */
const TIP_SLACK = 1.5;

/** What the drawn cursor shows, if it's shown: where it points and whether it's lit (the art over what's clicked). */
interface Drawn {
  at: PagePoint;
  lit: boolean;
}

/** One close view's round: what each step found. */
interface Round {
  /** the view's turn as the mouse moved with nothing held, and with the key held (rad) */
  lookTurn: number;
  heldTurn: number;
  /** the drawn cursor over Pause (null: none drawn) */
  overPause: Drawn | null;
  /** the click on Pause: whether the log paused and whether the hero attacked */
  paused: boolean;
  pauseAttacked: boolean;
  /** the hotbar's tooltip shown over its slot, and gone once the cursor left it */
  tooltip: boolean;
  tooltipGone: boolean;
  /** how far the wheel scrolled the log's lines (px: less than 0 up), and its turns the game took as a zoom */
  scrolled: number;
  zoomed: number;
  /** the click on the world with the key held */
  worldAttacked: boolean;
  /** with the key let go: the cursor still drawn, the view's turn as the mouse moved, a click on the world attacking */
  drawnAfter: boolean;
  afterTurn: number;
  afterAttacked: boolean;
  /** the lock held and the run going on at every frame */
  lockedThroughout: boolean;
  pausedRun: boolean;
  /** the screen round the cursor over Pause and over the hotbar's slot */
  moments: Pictured[];
}

/** how much of the screen is pictured round the cursor (css px: a picture at the screen's pixels) */
const PICTURED = { width: 280, height: 160 };

/** The area `PICTURED` round `point`, within the window. */
function clipAround(point: PagePoint): Clip {
  const x = Math.min(Math.max(point.x - PICTURED.width / 2, 0), innerWidth - PICTURED.width);
  const y = Math.min(Math.max(point.y - PICTURED.height / 2, 0), innerHeight - PICTURED.height);
  return { x, y, ...PICTURED };
}

/** The middle of the window, where the crosshair is and the drawn cursor starts. */
function centre(): PagePoint {
  return { x: innerWidth / 2, y: innerHeight / 2 };
}

/** The element `selector` names, shown; throws, naming it, if there's none. */
function shown(selector: string): HTMLElement {
  const found = document.querySelector<HTMLElement>(selector);
  if (!found?.checkVisibility()) throw new Error(`lab: cursor: ${selector} isn't shown`);
  return found;
}

/** The view's turn about the upright from `from` (rad, the short way round). */
function turnFrom(from: number): number {
  return Math.abs(Math.atan2(Math.sin(cameraYaw() - from), Math.cos(cameraYaw() - from)));
}

/** The art `name` (a custom property of the page's, as `url(...)`) as a computed background shows it. */
function artOf(name: string): string {
  const probe = document.createElement('div');
  probe.style.backgroundImage = `var(${name})`;
  document.body.append(probe);
  const art = getComputedStyle(probe).backgroundImage;
  probe.remove();
  return art;
}

/** The cursor the game draws over mouse look, if it's shown: where it points (its move) and whether it's lit. */
function drawnCursor(): Drawn | null {
  const cursor = document.getElementById('alt-cursor');
  if (!cursor?.checkVisibility()) return null;
  const style = getComputedStyle(cursor);
  const moved = new DOMMatrix(style.transform);
  return { at: { x: moved.e, y: moved.f }, lit: style.backgroundImage === artOf('--cursor-hand-art') };
}

/** Whether the hero was given an attack since the last frame: the basic attack's key pressed in the game. */
function attacked(): boolean {
  return input.pressed.has('mouse0');
}

/** The battle log shown, cleared and given `BLOWS` lines, each a blow on the hero from no foe, then drawn. */
async function fillLog(lab: Lab, log: BattleLog): Promise<void> {
  log.setBattleLog(true, false);
  log.pauseBattleLog?.(false);
  log.clearBattleLog();
  for (let blow = 0; blow < BLOWS; blow++) {
    G.time += APART;
    hurtPlayer(G.player, 1, 'physical', G.player.pos, null);
  }
  await lab.step(DRAW_FRAMES);
}

/** The pointer locked for mouse look, as the player's click takes it (none if a key or click before took it). */
async function takeLock(lab: Lab): Promise<void> {
  lab.pointerLock(true);
  const canvas = G.renderer.domElement;
  if (document.pointerLockElement !== canvas) await lab.click(centre());
  await lab.until(() => document.pointerLockElement === canvas, LOCK_FRAMES, 'the click never took the pointer');
}

/**
 * One close view's round, `held` held for the cursor. Frames run with `held` held in the game too while the keyboard
 * holds it, each watched for the lock and the run's pause.
 */
async function round(lab: Lab, log: BattleLog, view: ViewMode, held: Held): Promise<Round> {
  let lockedThroughout = true;
  let pausedRun = false;
  const watch = () => {
    lockedThroughout &&= document.pointerLockElement === G.renderer.domElement;
    pausedRun ||= G.menuOpen;
  };
  let holding = false;
  const step = (count = 1) => lab.step(count, () => ({ keys: holding ? [held.name] : [] }), watch);
  const middle = centre();
  const aside = { x: middle.x + LOOK_MOVE, y: middle.y };
  // (mouse look: the view turns with the mouse, nothing held)
  let yaw = cameraYaw();
  await lab.mouseTo(aside);
  await step();
  const lookTurn = turnFrom(yaw);
  if (lookTurn <= STILL) throw new Error('lab: cursor: the mouse never turned the view (no mouse look to measure)');
  await lab.mouseTo(middle);
  await step();
  // (held: onto Pause, clicked)
  await lab.keyDown(held.code);
  holding = true;
  await step();
  const pause = middleOf(shown('#blog [data-bl="pause"]'));
  yaw = cameraYaw();
  await lab.mouseTo(pause);
  await step();
  const heldTurn = turnFrom(yaw);
  const overPause = drawnCursor();
  const moments = [await lab.screen(`${view}: ${held.label} held over the log's Pause`, [], clipAround(pause))];
  await lab.click(pause);
  const pauseAttacked = attacked();
  await step();
  const paused = log.battleLogPaused?.() ?? false;
  // (onto the hotbar's first slot, its tooltip)
  const slot = middleOf(shown('#hotbar .slot'));
  await lab.mouseTo(slot);
  await step();
  const tooltip = !!document.getElementById('tooltip')?.checkVisibility();
  moments.push(await lab.screen(`${view}: ${held.label} held over the hotbar's slot`, [], clipAround(slot)));
  // (the wheel over the log's lines)
  const lines = shown('#blog .bl-lines');
  const overLines = middleOf(lines);
  await lab.mouseTo(overLines);
  await step();
  const top = lines.scrollTop;
  await lab.wheel(overLines, WHEEL);
  const zoomed = input.wheel;
  await step();
  const scrolled = lines.scrollTop - top;
  // (the world clicked)
  await lab.mouseTo(middle);
  await step();
  const tooltipGone = !document.getElementById('tooltip')?.checkVisibility();
  await lab.click(middle);
  const worldAttacked = attacked();
  await step();
  // (let go: mouse look again, and a click on the world attacks)
  await lab.keyUp(held.code);
  holding = false;
  await step();
  const drawnAfter = drawnCursor() !== null;
  yaw = cameraYaw();
  await lab.mouseTo(aside);
  await step();
  const afterTurn = turnFrom(yaw);
  await lab.mouseTo(middle);
  await step();
  await lab.click(middle);
  const afterAttacked = attacked();
  await step();
  return {
    lookTurn, heldTurn, overPause, paused, pauseAttacked, tooltip, tooltipGone, scrolled, zoomed, worldAttacked,
    drawnAfter, afterTurn, afterAttacked, lockedThroughout, pausedRun, moments,
  };
}

const yes = (value: boolean): string => (value ? 'yes' : 'no');

/** A round's lines for the report, and its problems. */
function judged(view: ViewMode, held: Held, found: Round, pause: PagePoint): { lines: string[]; problems: string[] } {
  const key = held.label;
  const problems: string[] = [];
  const problem = (wrong: boolean, what: string) => {
    if (wrong) problems.push(`${view}: ${what}`);
  };
  const drawn = found.overPause;
  const off = drawn ? Math.hypot(drawn.at.x - pause.x, drawn.at.y - pause.y) : 0;
  const where = drawn ? `drawn ${off.toFixed(1)} px from Pause, ${drawn.lit ? 'lit' : 'not lit'}` : 'none drawn';
  problem(found.heldTurn > STILL, `the view turned ${found.heldTurn.toFixed(3)} rad as the mouse moved, ${key} held`);
  problem(!drawn, `no cursor drawn with ${key} held`);
  problem(!!drawn && off > TIP_SLACK, `the cursor is drawn ${off.toFixed(1)} px from where the mouse took it`);
  problem(!!drawn && !drawn.lit, 'the cursor over Pause isn\'t lit');
  problem(!found.paused, 'the click on the log\'s Pause didn\'t pause it');
  problem(found.pauseAttacked, 'the click on the log\'s Pause attacked');
  problem(!found.tooltip, 'no tooltip over the hotbar\'s slot');
  problem(!found.tooltipGone, 'the hotbar\'s tooltip stayed once the cursor left its slot');
  problem(found.scrolled >= 0, 'the wheel over the log\'s lines didn\'t scroll them up');
  problem(found.zoomed !== 0, 'the wheel over the log zoomed the view');
  problem(found.worldAttacked, `the click on the world attacked, ${key} held`);
  problem(found.drawnAfter, `the cursor stayed drawn once ${key} was let go`);
  problem(found.afterTurn <= STILL, `the mouse didn't turn the view once ${key} was let go`);
  problem(!found.lockedThroughout, 'the pointer lock was let go');
  problem(found.pausedRun, 'the run paused');
  if (!found.afterAttacked) throw new Error('lab: cursor: a click on the world never attacked (no attack to see)');
  const lines = [
    view,
    `  mouse look: the view turned ${found.lookTurn.toFixed(3)} rad for ${LOOK_MOVE} px`,
    `  held: the view turned ${found.heldTurn.toFixed(3)} rad as the mouse went to Pause; the cursor ${where}`,
    `  click on Pause: the log paused ${yes(found.paused)}, attacked ${yes(found.pauseAttacked)}`,
    `  over the hotbar's slot: its tooltip ${yes(found.tooltip)}, gone as the cursor left ${yes(found.tooltipGone)}`,
    `  wheel over the log: its lines scrolled ${found.scrolled.toFixed(0)} px, the view zoomed ${found.zoomed}`,
    `  click on the world: attacked ${yes(found.worldAttacked)}`,
    `  let go: the cursor drawn ${yes(found.drawnAfter)}, the view turned ${found.afterTurn.toFixed(3)} rad, `
      + `a click attacked ${yes(found.afterAttacked)}`,
    `  the lock held throughout ${yes(found.lockedThroughout)}, the run paused ${yes(found.pausedRun)}`,
  ];
  return { lines, problems };
}

/** Whether the canary's held Ctrl was caught: the view turning under it, and its click on Pause not landing. */
function canaryProblems(problems: string[]): string[] {
  const missed: string[] = [];
  if (!problems.some((problem) => problem.includes('the view turned'))) {
    missed.push('the canary\'s view turning with Ctrl held went unseen');
  }
  if (!problems.some((problem) => problem.includes('didn\'t pause it'))) {
    missed.push('the canary\'s click on Pause going to the world went unseen');
  }
  if (!problems.some((problem) => problem.includes(STACKED))) {
    missed.push('the canary\'s layer planted over the cursor went unseen');
  }
  return missed;
}

/** the page's covers: over everything, the cursor too, with nothing of the game shown under them to click (the loading
 *  screen, an upright phone's "turn your phone") */
const COVERS = ['loading', 'rotate'];
/** what the layers' problem says, which the canary's planted layer must raise */
const STACKED = 'stacked over the cursor';

/** An element as a report names it. */
const named = (element: Element): string => `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}`;

/**
 * The page's layers that would be drawn over the cursor (from play, of the beta's notice: "mouse appears under it,
 * need to be on top, otherwise cannot click"): every element whose z-index is the cursor's or more, shown now or
 * not, the covers aside. With the canary, a layer planted over it, which must be found.
 */
function layersOverCursor(canary: boolean): { lines: string[]; problems: string[] } {
  const drawn = document.getElementById('alt-cursor');
  if (!drawn) return { lines: [], problems: ['no cursor element on the page'] };
  const planted = canary ? document.body.appendChild(document.createElement('div')) : null;
  if (planted) planted.style.cssText = 'position: fixed; z-index: 100000;';
  const own = Number(getComputedStyle(drawn).zIndex);
  const over = [...document.querySelectorAll('body *')].filter((element) => {
    if (element === drawn || COVERS.includes(element.id)) return false;
    return Number(getComputedStyle(element).zIndex) >= own;
  });
  planted?.remove();
  const real = over.filter((element) => element !== planted);
  const lines = [`the cursor's layer (z-index ${own}): ${real.length} of the page's layers over it`];
  return { lines, problems: over.map((element) => `${named(element)} is ${STACKED}`) };
}

/** `lab cursor`: the cursor drawn over mouse look while Alt is held, in each close view. */
export async function cursor(lab: Lab, options: CursorOptions): Promise<Report> {
  const log = await battleLog();
  if (!log) return { text: 'no battle log in this tree (its Pause is what the cursor clicks)', problems: [] };
  const held = options.canary ? CTRL : ALT;
  const lines: string[] = [`held: ${held.code}`];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  for (const view of options.views) {
    await lab.setup({ ...options.fixture, view });
    await fillLog(lab, log);
    await takeLock(lab);
    const pause = middleOf(shown('#blog [data-bl="pause"]'));
    const played = await round(lab, log, view, held);
    const found = judged(view, held, played, pause);
    lines.push(...found.lines);
    problems.push(...found.problems);
    moments.push(...played.moments);
    log.pauseBattleLog?.(false);
  }
  // (the top-down view first: the game lets go of the lock itself, and the run isn't paused as it goes)
  await lab.setup({ ...options.fixture, view: 'top' });
  lab.pointerLock(false);
  log.setBattleLog(false, false);
  const layers = layersOverCursor(options.canary);
  lines.push(...layers.lines);
  problems.push(...layers.problems);
  lines.push(...problems.map((problem) => `! ${problem}`));
  if (!options.canary) return { text: lines.join('\n'), problems, moments };
  const missed = canaryProblems(problems);
  lines.push(`canary: ${missed.length ? missed.join('; ') : 'every plant caught'}`);
  return { text: lines.join('\n'), problems: missed, moments };
}
