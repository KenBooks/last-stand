// Where a finger put down starts the touch controls' move stick (tools/lab `touchpad`, src/ui/touch.ts): a grid of
// points over the screen in a run, each touched by a finger as a touch screen sends it (`lab.touchDown`) and slid a
// little, and what the game made of it: the stick pushed, or the touch taken by a button (never touched: a tap there
// would act), or by nothing. Every point of the move area (the screen's left half below its top corner) that isn't a
// button must start the stick, with the overlays down the left put away and shown (the performance overlay, the
// battle log): from play on the owner's phone, "they only activate in a small area now, used to be better", where the
// performance overlay, moved down under the touch HUD's corner and onto the stick's pad, took its touches.
import { G } from '../../../src/state';
import { input } from '../../../src/core/input';
import { setPerfHud } from '../../../src/ui/perfHud';
import { setBattleLog } from '../../../src/ui/battleLog';
import type { Fixture, Lab, PagePoint, Pictured, Report } from './lab';
import { showTouchControls, slide } from './touchStick';

export interface TouchPadOptions {
  fixture: Fixture;
  /** plant a fault the measure must catch: a clear sheet laid over the move area's lower left quarter */
  canary?: boolean;
}

/** the grid's columns and rows over the screen, each point in its cell's middle */
const COLUMNS = 16;
const ROWS = 8;
/** the move area, as shares of the screen: its left half, below the top corner's buttons and bars */
const AREA_RIGHT = 0.5;
const AREA_TOP = 0.25;
/** how far the finger slides from where it went down (css px): past the dead zone */
const NUDGE = 30;
/** the least push that counts as the stick started */
const STARTED = 0.05;
/** the frames after a finger is lifted, before the next goes down, and after the overlays are shown or put away */
const LIFT_FRAMES = 2;
const OVERLAY_FRAMES = 4;
/** what a finger may never be put on: it would act (pause, open a page, cast) */
const BUTTONS = 'button, a, input, select, .slot, [role="button"], #btn-pause, #btn-full, #btn-scores';
/** the most room a button in the move area may take, as a square's side (css px): a finger's button and some (the
 *  touch HUD's are 44); a larger one (the performance overlay, a button the whole panel round) takes the stick's room */
const BUTTON_MOST = 72;

/** What a point of the grid gave. */
type Outcome = 'stick' | 'button' | 'none';

/** One point of the grid. */
interface Point {
  at: PagePoint;
  /** in the move area: it must start the stick unless it's a button */
  inArea: boolean;
  outcome: Outcome;
  /** what lay on top there, named (`#touch-pad`, `canvas`, `div.bars`...) */
  top: string;
}

/** An element named as a selector reads: its tag, id and first class. */
function nameOf(element: Element | null): string {
  if (!element) return 'nothing';
  if (element.id) return `#${element.id}`;
  const first = element.classList[0];
  return first ? `${element.tagName.toLowerCase()}.${first}` : element.tagName.toLowerCase();
}

/** The grid's points over the window, row by row from the top. */
function gridPoints(): PagePoint[] {
  const points: PagePoint[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let column = 0; column < COLUMNS; column++) {
      const x = Math.round(((column + 0.5) / COLUMNS) * innerWidth);
      const y = Math.round(((row + 0.5) / ROWS) * innerHeight);
      points.push({ x, y });
    }
  }
  return points;
}

/** Whether `at` lies in the move area. */
function inMoveArea(at: PagePoint): boolean {
  return at.x < innerWidth * AREA_RIGHT && at.y > innerHeight * AREA_TOP;
}

/** A finger put down at `at`, slid `NUDGE` px right and read: whether it pushed the stick; then lifted. */
async function startsStick(lab: Lab, at: PagePoint): Promise<boolean> {
  await lab.touchDown(at);
  await slide(lab, at, { x: at.x + NUDGE, y: at.y });
  await lab.step(1);
  const pushed = Math.hypot(input.stick.x, input.stick.y) >= STARTED;
  await lab.touchUp();
  await lab.step(LIFT_FRAMES);
  return pushed;
}

/**
 * The part of `control` that takes touches at a point whose topmost element is `topmost`: the outermost element from
 * it up to the control that the page hit-tests (a control that lets touches through, `pointer-events: none`, but for a
 * part of it takes them on that part alone).
 */
function touchTarget(topmost: Element, control: Element): Element {
  let target = topmost;
  while (target !== control && target.parentElement) {
    const parent = target.parentElement;
    if (getComputedStyle(parent).pointerEvents === 'none') break;
    target = parent;
  }
  return target;
}

/** Whether `target` is larger than a finger's button: then it takes the move area's room. */
function tooLarge(target: Element): boolean {
  const box = target.getBoundingClientRect();
  return box.width * box.height > BUTTON_MOST * BUTTON_MOST;
}

/**
 * The point at `at` tried: a button left alone (one in the move area larger than a finger's button counted as taking
 * it), anything else touched.
 */
async function tryPoint(lab: Lab, at: PagePoint): Promise<Point> {
  const topmost = document.elementFromPoint(at.x, at.y);
  const point: Point = { at, inArea: inMoveArea(at), outcome: 'none', top: nameOf(topmost) };
  const control = topmost?.closest(BUTTONS);
  const target = topmost && control ? touchTarget(topmost, control) : null;
  if (target && point.inArea && tooLarge(target)) {
    const box = target.getBoundingClientRect();
    point.top = `${nameOf(target)}, a control of ${Math.round(box.width)}x${Math.round(box.height)} px,`;
    return point;
  }
  if (control) {
    point.outcome = 'button';
    return point;
  }
  point.outcome = (await startsStick(lab, at)) ? 'stick' : 'none';
  return point;
}

/** The canary's clear sheet over the move area's lower left quarter, taking every touch there. */
function plantSheet(): HTMLElement {
  const sheet = document.createElement('div');
  sheet.id = 'lab-canary-sheet';
  const style = sheet.style;
  style.position = 'fixed';
  style.left = '0';
  style.bottom = '0';
  style.width = `${innerWidth * AREA_RIGHT * 0.5}px`;
  style.height = `${innerHeight * (1 - AREA_TOP) * 0.5}px`;
  style.zIndex = '1000';
  style.pointerEvents = 'auto';
  document.body.append(sheet);
  return sheet;
}

/** The colour a point is marked in on the picture. */
function markColour(point: Point): string {
  if (point.outcome === 'stick') return '#3ad06a';
  if (point.outcome === 'button') return '#4aa3ff';
  return point.inArea ? '#ff3b3b' : '#9a9a9a';
}

/** Dots over the page where the grid was touched, each coloured by what it gave; and the move area's outline. */
function markPoints(points: Point[]): HTMLElement {
  const layer = document.createElement('div');
  layer.style.cssText = 'position:fixed;inset:0;z-index:2000;pointer-events:none';
  const area = document.createElement('div');
  area.style.cssText = `position:absolute;left:0;top:${AREA_TOP * 100}%;width:${AREA_RIGHT * 100}%;bottom:0;`
    + 'outline:2px dashed rgba(255,255,255,.7);outline-offset:-2px';
  layer.append(area);
  for (const point of points) {
    const dot = document.createElement('div');
    dot.style.cssText = `position:absolute;left:${point.at.x - 6}px;top:${point.at.y - 6}px;width:12px;height:12px;`
      + `border-radius:50%;background:${markColour(point)};border:1px solid #000`;
    layer.append(dot);
  }
  document.body.append(layer);
  return layer;
}

/** The grid as text, a row a line: `S` the stick, `b` a button, `x` the move area's points that started nothing. */
function gridText(points: Point[]): string[] {
  const lines: string[] = [];
  for (let row = 0; row < ROWS; row++) {
    const cells = points.slice(row * COLUMNS, (row + 1) * COLUMNS).map((point) => {
      if (point.outcome === 'stick') return 'S';
      if (point.outcome === 'button') return 'b';
      return point.inArea ? 'x' : '.';
    });
    lines.push(`  ${cells.join(' ')}`);
  }
  return lines;
}

/** The share of the move area's points, buttons left out, that started the stick, as a line. */
function areaLine(points: Point[], place: string): string {
  const open = points.filter((point) => point.inArea && point.outcome !== 'button');
  const started = open.filter((point) => point.outcome === 'stick').length;
  const everywhere = points.filter((point) => point.outcome === 'stick').length;
  const area = `the move area (left ${AREA_RIGHT * 100}%, below the top ${AREA_TOP * 100}%)`;
  return `${place}: ${area}: ${started} of ${open.length} points start the stick; ${everywhere} of ${points.length} `
    + 'over the whole screen';
}

/** The move area's points that started nothing, each with what lay on top there. */
function missedIn(points: Point[]): Point[] {
  return points.filter((point) => point.inArea && point.outcome === 'none');
}

/** The grid tried over the page as it stands. */
async function tryGrid(lab: Lab): Promise<Point[]> {
  const points: Point[] = [];
  for (const at of gridPoints()) points.push(await tryPoint(lab, at));
  return points;
}

/** The page pictured with the grid's points marked on it. */
async function pictureGrid(lab: Lab, label: string, points: Point[]): Promise<Pictured> {
  const layer = markPoints(points);
  try {
    return await lab.screen(label, [areaLine(points, label)]);
  } finally {
    layer.remove();
  }
}

/** The overlays down the left (the performance overlay, the battle log) shown or put away, as the pause menu does. */
async function showOverlays(lab: Lab, shown: boolean): Promise<void> {
  setPerfHud(shown, false);
  setBattleLog(shown, false);
  await lab.step(OVERLAY_FRAMES);
}

/** the parts of the performance overlay a tap must copy a report from: its frame rate (a button) and its graph (let
 *  through to the move stick's pad, which takes a quick still tap over the overlay for a copy) */
const COPY_TAPPED = ['.pf-head', '.pf-graph'];

/** Whether a finger's quick tap on a part of the performance overlay asks for a report to be copied: the overlay says
 *  so (`said`: "Copied", or "Copy failed" where the lab's browser keeps the clipboard). On the owner's phone a tap on
 *  the panel copied nothing once it let touches through to the stick (`body.touch #perf`), its frame rate alone a
 *  button. Put down and lifted as a touch screen sends them (a tap that wants a click waits for one the pad never
 *  lets come). */
async function copiesOnTap(lab: Lab, part: string): Promise<boolean> {
  const overlay = document.querySelector('#perf');
  const element = overlay?.querySelector(part);
  if (!overlay || !element) throw new Error(`lab: touchpad: the performance overlay has no ${part}`);
  overlay.classList.remove('said');
  const box = element.getBoundingClientRect();
  const at = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  await lab.touchDown(at);
  await lab.touchUp();
  // (the click a tap on the frame rate makes comes in a task after the lift, and the clipboard answers in its time)
  await new Promise((done) => setTimeout(done, 200));
  await lab.step(LIFT_FRAMES);
  return overlay.classList.contains('said');
}

/** Each part of the performance overlay tapped (`COPY_TAPPED`), with the touch controls shown and hidden (as a menu
 *  open hides them, the lobby's panels too: the panel takes its own taps there): its lines, and a problem where no
 *  report was copied. */
async function tapsToCopy(lab: Lab): Promise<{ lines: string[]; problems: string[] }> {
  await showOverlays(lab, true);
  const lines: string[] = [];
  const problems: string[] = [];
  for (const menuOpen of [false, true]) {
    G.menuOpen = menuOpen;
    await lab.step(LIFT_FRAMES);
    const controls = menuOpen ? 'the touch controls hidden (a menu open)' : 'the touch controls shown';
    for (const part of COPY_TAPPED) {
      const copied = await copiesOnTap(lab, part);
      lines.push(`${controls}: the performance overlay's ${part} tapped: ${copied ? 'a report copied' : 'nothing'}`);
      if (!copied) problems.push(`${controls}: a tap on the performance overlay's ${part} copied no report`);
    }
  }
  G.menuOpen = false;
  await showOverlays(lab, false);
  return { lines, problems };
}

/** What one round of the grid gave: its lines, problems and picture. */
interface Round {
  lines: string[];
  problems: string[];
  moment: Pictured;
}

/** The grid tried with the overlays down the left shown or not: its map, the points it missed, its picture. */
async function gridRound(lab: Lab, overlays: boolean): Promise<Round> {
  await showOverlays(lab, overlays);
  const place = overlays ? 'the overlays shown' : 'the overlays put away';
  const points = await tryGrid(lab);
  const problems: string[] = [];
  if (!points.some((point) => point.outcome === 'stick')) problems.push(`${place}: no point started the stick`);
  for (const point of missedIn(points)) {
    problems.push(`${place}: a finger at ${point.at.x},${point.at.y} started no stick: ${point.top} took it`);
  }
  const lines = [`${place}:`, ...gridText(points), areaLine(points, place)];
  const moment = await pictureGrid(lab, place, points);
  return { lines, problems, moment };
}

/**
 * `lab touchpad`: a grid of fingers put down over the screen in a run, each slid a little: every point of the move
 * area that isn't a button must start the move stick; with `--canary`, a clear sheet over part of it must be caught.
 */
export async function touchPad(lab: Lab, options: TouchPadOptions): Promise<Report> {
  await lab.setup(options.fixture);
  await showTouchControls(lab);
  if (!G.run) throw new Error('lab: touchpad: no run set up (the touch HUD shows in a run)');
  const lines = [`a ${COLUMNS}x${ROWS} grid over ${innerWidth}x${innerHeight}: S the stick, b a button (left alone), `
    + 'x in the move area and nothing, . elsewhere and nothing'];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  for (const overlays of [false, true]) {
    const round = await gridRound(lab, overlays);
    lines.push(...round.lines);
    problems.push(...round.problems);
    moments.push(round.moment);
  }
  const copies = await tapsToCopy(lab);
  lines.push(...copies.lines);
  problems.push(...copies.problems);
  await showOverlays(lab, false);
  if (options.canary) {
    const sheet = plantSheet();
    try {
      const planted = await tryGrid(lab);
      const caught = missedIn(planted).some((point) => point.top === '#lab-canary-sheet');
      lines.push(caught ? 'canary: caught (a clear sheet over the move area\'s lower left)' : '');
      if (!caught) problems.push('the canary went unseen: a clear sheet over the move area\'s lower left');
    } finally {
      sheet.remove();
    }
  }
  return { text: lines.filter(Boolean).join('\n'), problems, moments };
}
