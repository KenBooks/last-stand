// tools/lab in the game's page: the clock, the input, the set-ups and the pictures, so a measure is a few lines run on
// the game's own modules. They are imported as the game imports them (one copy of each module, never a stale one)
// and typechecked with the game, so a renamed joint breaks the build rather than a probe's numbers.
//
// The game's frames run on the lab's clock: each a hair over a 60th of a second, run as fast as the page can, nothing
// drawn unless asked (measures need no pixels; the scene's matrices are still updated, as a draw would). A set-up is
// checked once it's made and throws if it didn't take. A measure of a state that never happened reads as clean: a
// probe that scripted the game before its run began twice reported no clips at full draw, because it never drew.
import * as THREE from 'three';
import { G } from '../../../src/state';
import { input } from '../../../src/core/input';
import { CAMERA } from '../../../src/data/balance';
import { spawnEnemy } from '../../../src/entities/spawner';
import type { Enemy, EnemyOpts } from '../../../src/entities/enemy';
import type { EnemyId } from '../../../src/data/enemies';
import * as renderer from '../../../src/core/renderer';
import { updateSeeThrough } from '../../../src/core/seeThrough';
import { CLASSES } from '../../../src/data/classes';
import type { Joints } from '../../../src/entities/models/rig';
import type { ClassDef, Gear, GlowSlot, RarityId } from '../../../src/types';
import { weaponStyle, type WeaponStyle } from '../../../src/loot/loadout';
import { Player } from '../../../src/entities/player';
import { clearProjectiles } from '../../../src/combat/projectiles';
import { clearEffects } from '../../../src/fx/effects';
import { clearLights } from '../../../src/fx/lights';
import { particles } from '../../../src/fx/particles';
type RunPhaseModule = typeof import('../../../src/world/runPhase');
import { buildHotbar } from '../../../src/ui/hud';
import * as culling from '../../../src/world/culling';
import { loadProfile } from '../../../src/loot/profile';
import * as textures from '../../../src/core/textures';
import * as anatomy from '../../../src/entities/models/anatomy';
import { drawLook, jointsByObject, partName, withBones, type Look, type PartOnScreen } from './looks';
import type { Area } from './pixels';

/**
 * The clock the session installs before the page's own scripts (`tools/lab/node/browser.mjs`). While its mode is
 * `manual`, the game's animation frames are queued for the lab to run instead of the browser.
 */
interface LabClock {
  mode: 'real' | 'manual';
  /** the time handed to the frames, ms (on the clock's grid, so the game's frame time is exact) */
  t: number;
  /** a frame's length, ms: a hair over a 60th of a second, a whole number of the grid's steps */
  frame: number;
  queue: FrameRequestCallback[];
  /** the browser's own clock, ms: the page's `performance.now` is the lab's, which stands still within a frame */
  realNow: () => number;
  /** resolves after a frame the browser draws, the game's own frames left queued */
  realFrame: () => Promise<void>;
}

declare global {
  interface Window {
    __labClock: LabClock;
    /** starts the page's seeded `Math.random` again (`tools/lab/node/browser.mjs`) */
    __labSeed: (seed: number) => void;
    /** starts it again for the next frame, from the last seed and the frames since */
    __labFrame: () => void;
    __lab?: Lab;
    /** the page pictured by the browser as it shows, within `clip` (`tools/lab/node/side.mjs`), as a PNG data URL */
    __labScreenshot?: (clip?: Clip) => Promise<string>;
    /** a finger's touch sent by the browser as a touch screen's (`tools/lab/node/side.mjs`) */
    __labTouch?: (type: TouchType, points: Finger[]) => Promise<void>;
    /** the mouse sent by the browser as a mouse's (`tools/lab/node/side.mjs`), at css px (its wheel `deltaY` px) */
    __labMouse?: (type: MouseType, x: number, y: number, deltaY?: number, button?: MouseButton, buttons?: number) =>
      Promise<void>;
    /** the pointer lock the page plays in the lab's browser, while `on` (`tools/lab/node/browser.mjs` `noCapture`) */
    __labLock?: { on: boolean };
    /** a key sent by the browser as a keyboard's (`tools/lab/node/side.mjs`), by its code */
    __labKey?: (type: KeyType, code: string) => Promise<void>;
    /** the page's `prefers-reduced-motion` as the browser emulates it (`tools/lab/node/side.mjs`) */
    __labMotion?: (reduced: boolean) => Promise<void>;
    /** the page's CPU slowed `rate` times, as the browser emulates a slower device's (`tools/lab/node/side.mjs`) */
    __labThrottle?: (rate: number) => Promise<void>;
    /** the page put on another screen, as the browser emulates one (`tools/lab/node/side.mjs`) */
    __labScreen?: (screen: Screen) => Promise<void>;
  }
}

/** A touch as the browser gets one from a touch screen: a finger put down, moved, or lifted. */
type TouchType = 'touchStart' | 'touchMove' | 'touchEnd';

/** The mouse as the browser gets it: moved, its left button pressed or let go, or its wheel turned. */
type MouseType = 'mouseMoved' | 'mousePressed' | 'mouseReleased' | 'mouseWheel';

/** A mouse button, as the DevTools protocol names it. */
export type MouseButton = 'left' | 'middle' | 'right';
/** each button's bit in the mask of those held (the DOM's `buttons`) */
const BUTTON_BITS: Record<MouseButton, number> = { left: 1, right: 2, middle: 4 };

/** A key as the browser gets it: pressed or let go. */
type KeyType = 'keyDown' | 'keyUp';

/** A finger on the screen as the DevTools protocol takes it: where it is (css px) and which finger. */
interface Finger {
  x: number;
  y: number;
  id: number;
}

/** A point on the page, css px. */
export interface PagePoint {
  x: number;
  y: number;
}

/** Resolves after `ms` of the browser's own time (the lab's clock stands still meanwhile: no frame runs). The page's
 *  timers run on it, a debounce's among them. */
export function realWait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Whether `animation` runs on the browser's clock: one driven by a scroll is at rest while its scroll is, and
 *  brought to its end it was held there (the stash's fade, shown while a row is cut, held hidden). */
export const onTheClock = (animation: Animation): boolean => animation.timeline === document.timeline;

/** The middle of `element`'s box, css px: where a measure puts the mouse or a finger to point at it. */
export function middleOf(element: Element): PagePoint {
  const box = element.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

/** the pointer events a touch makes, any of which says the page has handled it */
const TOUCH_POINTER_EVENTS: Record<TouchType, string[]> = {
  touchStart: ['pointerdown'],
  // (or cancelled: a touch where the page lets the browser pan, `touch-action` other than none, is taken by the
  // browser as it moves, and makes no pointer event after)
  touchMove: ['pointermove', 'pointercancel'],
  touchEnd: ['pointerup', 'pointercancel'],
};
/** the events the mouse makes, which say the page has handled it: its pointer events, and the wheel's own */
const MOUSE_EVENTS: Record<MouseType, string[]> = {
  mouseMoved: ['pointermove'],
  mousePressed: ['pointerdown'],
  mouseReleased: ['pointerup'],
  mouseWheel: ['wheel'],
};
/** the key events a key makes, which say the page has handled it */
const KEY_EVENTS: Record<KeyType, string[]> = {
  keyDown: ['keydown'],
  keyUp: ['keyup'],
};
/** how long an input's event may take to reach the page, ms of the browser's own clock (2 s failed a click now and
 *  then as a check's eight sessions booted at once, the machine at full load) */
const INPUT_WAIT_MS = 10000;

/** An input's events as the page gets them: their names, which of them are this input's, and what it is (`touch`). */
interface InputEvents {
  names: string[];
  ours(event: Event): boolean;
  what: string;
}

/**
 * Waits for `handled` once `sending` has gone (its wait given up quietly if the input never went); resolves with the
 * event that said it was handled.
 */
async function sent(handled: Promise<Event>, sending: Promise<void>): Promise<Event> {
  try {
    await sending;
  } catch (error) {
    handled.catch(() => {});
    throw error;
  }
  return handled;
}

/** Resolves once the page has handled one of the pointer events `names` from a touch (`inputHandled`). */
function touchHandled(names: string[]): Promise<Event> {
  const ours = (event: Event) => (event as PointerEvent).pointerType === 'touch';
  return inputHandled({ names, ours, what: 'touch' });
}

/**
 * Resolves once the page has handled one of an input's events, with it: once the whole dispatch is over (heard
 * first, on the window as it captures, and resolved in the task after it, so every listener has run, whatever one
 * stopped). Rejects after `INPUT_WAIT_MS`.
 */
function inputHandled({ names, ours, what }: InputEvents): Promise<Event> {
  return new Promise((resolve, reject) => {
    const heard = (event: Event) => {
      if (!ours(event)) return;
      done();
      setTimeout(() => resolve(event), 0);
    };
    const timeout = setTimeout(() => {
      done();
      reject(new Error(`lab: ${what}: the page never got its ${names.join(' or ')}`));
    }, INPUT_WAIT_MS);
    const done = () => {
      clearTimeout(timeout);
      for (const name of names) window.removeEventListener(name, heard, true);
    };
    for (const name of names) window.addEventListener(name, heard, true);
  });
}

/** the seed each set-up starts the page's random numbers from */
const SETUP_SEED = 0x2545f491;
/** the seed each command starts them from */
const COMMAND_SEED = 0x1b873593;
/** the game's clock at a set-up on a page booted for it, s (the idle's sway runs on it): past any moment the run's
 *  start reaches (at 5 s it never applied: the start had taken the clock past it, by as many frames as it took); a
 *  later set-up takes it on to the next whole multiple of it, so the idle is at the same moment whatever ran before
 *  (taken to it only once, a gait scenario's numbers moved with the scenarios before it) */
const SETUP_TIME = 60;
/** the frames a set-up stands still once the hero is on his spot */
const SETTLE_FRAMES = 90;

/** the game's emitters' phases (src/world/runPhase.ts), where the tree has them: an A/B's older commit has none */
const RUN_PHASES = Object.values(import.meta.glob<RunPhaseModule>('../../../src/world/runPhase.ts', { eager: true }));

/**
 * The biomes' emitters started again at a set-up, their particles cleared: kept from the commands before, they
 * spawned on other frames, and the random numbers the foes drew after them in each frame were others (a cast on a page
 * a check kept walked its foes a fraction of a millimetre elsewhere from their first step).
 */
function restartEmitters(): void {
  particles.clear();
  for (const phases of RUN_PHASES) phases.restartPhases();
}
/** the most presses of V a view takes (it cycles top-down, over the shoulder, through the eyes) */
const VIEW_PRESSES = 3;

/** The way the close views' camera turns (rad) to look along `ahead`: about the upright (0 looks to -z), and down. */
function turnOf(ahead: THREE.Vector3): { yaw: number; down: number } {
  return { yaw: Math.atan2(-ahead.x, -ahead.z), down: -Math.asin(THREE.MathUtils.clamp(ahead.y, -1, 1)) };
}

/**
 * The mouse-look move that turns the close views' camera to look at `point`, made: the crosshair in the screen's
 * middle comes over it, in a frame or two (over the shoulder, the camera swings round the hero as it turns, and
 * through the eyes the hero turns with it). Nothing in the top-down view, which aims with the mouse.
 */
function lookToward(point: THREE.Vector3): void {
  const now = turnOf(G.camera.getWorldDirection(new THREE.Vector3()));
  const wanted = turnOf(point.clone().sub(G.camera.position).normalize());
  const yaw = Math.atan2(Math.sin(now.yaw - wanted.yaw), Math.cos(now.yaw - wanted.yaw));
  renderer.lookBy(yaw / CAMERA.lookSpeed, (wanted.down - now.down) / CAMERA.lookSpeed);
}

/**
 * The close views' camera turned about the upright to look along `facing` (rad, as the hero's: 0 along +z), its tilt
 * kept, as a mouse-look move turns it: through the eyes the hero faces where it looks, so a set-up's facing holds
 * there too (left as the last view had it, he turned to it as he settled: a charge set up at 120° went at 180°; the
 * light's, the haze's and the trail's measures each turned it after the set-up, `lookAlong` in `page/light.ts`).
 * Nothing in the top-down view.
 */
function lookAlong(facing: number): void {
  // (the camera looks along its yaw and a half turn)
  const yaw = facing - Math.PI;
  const turn = Math.atan2(Math.sin(yaw - renderer.cameraYaw()), Math.cos(yaw - renderer.cameraYaw()));
  renderer.lookBy(-turn / CAMERA.lookSpeed, 0);
}

/** One frame's input, as a player would give it. */
export interface Frame {
  /** keys held down this frame (`w`, `1`...) */
  keys?: string[];
  /** the left and right mouse buttons held */
  m0?: boolean;
  m2?: boolean;
  /** a mouse-look move, px */
  look?: [number, number];
  /** the point in the world the mouse is over (the lab's `aim` when not given) */
  aim?: THREE.Vector3;
  /** the point in the world the crosshair of the close views is turned towards, by a mouse-look move (`lookToward`) */
  sight?: THREE.Vector3;
  /** the touch stick pushed this far (x right, y down the screen, its length up to 1); left as it was when not given */
  stick?: [number, number];
}

/** The state a measure or a picture starts from. */
export interface Fixture {
  /** where the hero stands, x and z (12, 22 by default: off the dais, clear of props) */
  at?: [number, number];
  /** the way he faces, rad (0 is +z) */
  facing?: number;
  /** the game's view: top-down (the default), over the shoulder, or through the eyes */
  view?: renderer.ViewMode;
  /** a bow's hero with an arrow on the string: he shoots one and waits out its reload, as he walks between shots */
  nocked?: boolean;
  /** the hero holding his weapons this way (his class's first weapons of it, his armour as it is), for a class with
   *  more than one; as the boot rolled them by default */
  gear?: WeaponStyle;
  /** with `gear`, the weapon he holds that way, by its base (Maul: a two-hander's grips are its own); the class's first
   *  of the style by default */
  weapon?: string;
  /** the hero built afresh first, as the lobby's class switch builds him, so the run comes out the same whatever ran
   *  before it on the page (set up again over the same hero, a gait scenario's every line moved with the scenarios
   *  run before it: his walk cycle, his leg IK's smoothed speed, turn and twist, his aim's hold all carried over) */
  fresh?: boolean;
  /** tunable values set before the run, by their paths (`name.field`: src/core/tuning.ts) */
  tune?: Record<string, number[]>;
  /** the armour he wears, every piece not named left off (none: bare hands and head, his clothes); as the boot rolled
   *  it by default */
  wear?: Armour[];
  /** every item he wears of this rarity, as its look shows it (Rare and up glow: models/itemGlow.ts); as the boot
   *  rolled them by default */
  rarity?: RarityId;
}

/** the armour a hero can be seen wearing (`Gear`'s flags) */
const ARMOUR = ['helm', 'chest', 'hands'] as const;
type Armour = (typeof ARMOUR)[number];

/** The pictures the lab can take: the game's own views, or a close-up from round the hero. */
export const VIEW_NAMES = ['lobby', 'top', 'third', 'eyes', 'front', 'left', 'right', 'back', 'above'] as const;
export type ViewName = (typeof VIEW_NAMES)[number];

/** A moment pictured (`Lab.picture`): its label, its pictures, and notes to read beside them. */
export interface Pictured {
  label: string;
  tiles: Tile[];
  notes: string[];
}

/**
 * What a command or a probe may return to say what it found: its text, the problems that fail the command (a canary
 * the measure missed, a state that never came), and moments pictured, which the lab writes as a sheet
 * (`tools/lab/out/probes/<probe>/sheet.png`) and compares in an A/B, and what it counted by name (a check adds a
 * hero's up over its jobs). A probe may return plain text or JSON instead.
 */
export interface Report {
  text: string;
  problems: string[];
  moments?: Pictured[];
  counts?: Record<string, number>;
}

/** A close-up's camera: how far round from the hero's front (rad, positive to his left), and how high (m). */
interface CloseUp {
  turn: number;
  rise: number;
}

const CLOSE_UPS: Partial<Record<ViewName, CloseUp>> = {
  front: { turn: 0, rise: 0.25 },
  left: { turn: Math.PI / 2, rise: 0.25 },
  right: { turn: -Math.PI / 2, rise: 0.25 },
  back: { turn: Math.PI, rise: 0.25 },
  above: { turn: Math.PI + 0.35, rise: 1.6 },
};

/** a close-up's distance from the whole body, and from a joint it's focused on (m) */
const BODY_DISTANCE = 4.3;
const JOINT_DISTANCE = 1.7;
const CLOSE_UP_FOV = 30;
/** the top of the hat over the head joint, for the hero's height on screen (m) */
const ABOVE_HEAD = new THREE.Vector3(0, 0.3, 0);
/** px: how far round the element a screen picture is clipped round (`Lab.screen`'s `around`) reaches */
const SCREEN_MARGIN = 24;

/** An area of the page, css px. */
export interface Clip {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A screen: its size (css px) and its pixel ratio, as `--screen` names one. */
export interface Screen {
  width: number;
  height: number;
  ratio: number;
}

/** One picture, as a PNG data URL: of a view of the game, or of the screen with the page's UI (`Lab.screen`). */
export interface Tile {
  /** the view: the game's, the screen, or a command's own (`lab weapons`' studio) */
  view: ViewName | 'screen' | (string & {});
  png: string;
  width: number;
  height: number;
  /** in the `parts` look, the hero's parts in it, the most first */
  parts?: PartOnScreen[];
}

/** A picture as `Lab.drawn` gives it: its view, drawn on a canvas, and in the `parts` look the hero's parts in it. */
export interface Drawn {
  view: ViewName;
  canvas: HTMLCanvasElement;
  parts?: PartOnScreen[];
}

export interface CaptureOptions {
  /** the joint a close-up is framed on (the whole body by default) */
  focus?: keyof Joints;
  /** a place in the world a close-up is framed on instead of the hero (a foe's body fallen there), from `distance` m
   *  (its turn still the hero's facing's) */
  at?: THREE.Vector3;
  distance?: number;
  /** how the frame is drawn (looks.ts): as the player sees it (`lit`, the default), or the hero's wireframe, his
   *  faces' orientation, his parts each a colour, or his skeleton over the frame */
  look?: Look;
}

const SPOT: [number, number] = [12, 22];
/** the mouse is put this far ahead of the hero: a shot goes off into the distance, out of the pictures */
const AIM_AHEAD = 20;

/** The lab's hold on the game in this page. */
export class Lab {
  /** three.js as the game uses it, for probe modules */
  readonly THREE = THREE;
  /** the anatomy warnings the page logged, since the session last read them (its errors the session sees itself) */
  readonly warnings: string[] = [];
  /** draw each frame as the game does (off: only the scene's matrices are updated) */
  drawing = false;
  /** every set-up of this command builds the hero afresh (`Fixture.fresh`): a check's, on a page its jobs before ran on */
  afresh = false;
  /** the page's cookies and storage as the boot left them, put back as a command that builds its heroes afresh begins
   *  (`storeAgain`) */
  private booted: Stored = { cookies: [], storage: [] };
  /** whether a set-up has run on this page */
  private setUpBefore = false;
  /** the game's clock as the page's first run started (`runAfresh` starts its own at the same moment) */
  private firstRunAt: number | null = null;
  /** the point the mouse is over unless a frame says otherwise */
  aim = new THREE.Vector3();
  /** the share of his most Health the hero is kept at every frame, until the next set-up (whole: 1) */
  lifeShare = 1;
  /** what every frame of the current set-up needs before its input (the foes kept away, the hero unhurt) */
  private keepUp: (() => void)[] = [];
  /** the foes a measure spawned (`spawnFoe`), which the set-up's hold of the wave keeps */
  private readonly foes = new Set<Enemy>();
  /** what a command runs before every frame, ahead of the set-up's (co-op: the messages that arrived by then) */
  readonly beforeFrame: (() => void)[] = [];
  /** the fingers on the page, by their id, where each is (css px): every touch sent says where all of them are */
  private readonly fingers = new Map<number, PagePoint>();
  /** each finger's pointer id, as its pointerdown gave it */
  private readonly pointerOf = new Map<number, number>();
  /** the touches' pointers the browser cancelled (it took them as a pan, `touchPanned`), by id: heard at any time, as
   *  a cancel may come after the move that started the pan was handled */
  private readonly cancelled = new Set<number>();
  /** whether the pointer cancels are listened for yet */
  private hearingCancels = false;
  /** where the mouse is on the page (css px), once the lab has moved it */
  private mouseAt: PagePoint | null = null;
  /** the mouse's buttons held (the DOM's `buttons` mask), as `mouseDown` and `mouseUp` leave them */
  private buttonsHeld = 0;

  get player() {
    return G.player;
  }

  get model() {
    return G.player.model;
  }

  get joints(): Joints {
    return G.player.model.joints!;
  }

  /**
   * Readies the page for a command: the random numbers started again. A booted page waits for its command while the
   * textures made in workers land, and every three.js object made draws a random number for its id, so one command
   * in four started at another point of the sequence, and the haze and pollen spawned before its set-up (alive up to
   * 10 s) lay elsewhere in its pictures. And every joint past its range told of again, as on a page booted for the
   * command (a check's page runs one command after another; an older commit has no `forgetReported`).
   */
  begin(afresh = false): void {
    this.afresh = afresh;
    if (afresh) storeAgain(this.booted);
    window.__labSeed(COMMAND_SEED);
    (anatomy as { forgetReported?: () => void }).forgetReported?.();
  }

  /** The hero the page booted, and the heroes the game has: the session checks it booted the one it asked for. */
  heroes(): { hero: string; heroes: string[] } {
    return { hero: this.player.cls.id, heroes: Object.keys(CLASSES) };
  }

  /** Takes the game's clock over, makes its draws skippable, and starts keeping its anatomy warnings. */
  install(): void {
    this.booted = storedNow();
    const gl = G.renderer;
    const draw = gl.render.bind(gl);
    gl.render = (scene, camera) => {
      // (a biome's still shadows are drawn once, as it's shown: skipped, the first frame drawn drew them of everything,
      // the hero's shadow with them, and compiled a program then)
      // (an older commit has no `isDrawingStill`)
      const still = (culling as { isDrawingStill?: () => boolean }).isDrawingStill?.() ?? false;
      if (this.drawing || still) return draw(scene, camera);
      // (what a draw would have done that the game reads back: the world matrices)
      if (scene === G.scene) {
        scene.updateMatrixWorld();
        camera.updateMatrixWorld();
      }
    };
    const warn = console.warn.bind(console);
    console.warn = (...args: unknown[]) => {
      if (String(args[0]).includes('anatomy')) this.warnings.push(String(args[0]));
      warn(...args);
    };
    window.__labClock.mode = 'manual';
    // (one frame with the game held still, so its timer counts from a lab frame: the first frame after the reveal
    // was measured from the game's last frame in real time, a browser frame earlier on some boots, and each emitter's
    // accumulated time started that much apart, its bursts a frame early or late)
    const paused = G.paused;
    G.paused = true;
    this.runGameFrame();
    G.paused = paused;
    // (the game's clock from 0: the idle's sway runs on it, so a boot's first set-up is always at the same moment)
    G.time = 0;
    window.__lab = this;
  }

  /**
   * A foe of `type` spawned at `at` for a measure that needs one (a mark, a lure), kept by the set-up while every other
   * is cleared (no wave comes) until the next set-up. It rises as a spawned foe does first (`Enemy.spawning`), and
   * thinks as one does: a training dummy (`dummy`) stands still. `options` as a wave's spawns take them (a hero foe,
   * its name).
   */
  spawnFoe(type: EnemyId, at: THREE.Vector3, options: Omit<EnemyOpts, 'pos'> = {}): Enemy {
    const foe = spawnEnemy(type, at, { wave: 1, ...options });
    this.foes.add(foe);
    return foe;
  }

  /**
   * The run's waves let come from here on, until the next set-up: its countdown, its spawns and its foes as the game
   * plays them, the hero still kept whole. A measure of a wave sets one off itself (the run's wave and its timer).
   */
  letWavesCome(): void {
    this.keepUp = [this.keepHeroUp];
  }

  /** Puts the mouse over a point in the world, as the player would. */
  pointAt(point: THREE.Vector3): void {
    const ndc = point.clone().project(G.camera);
    input.mouse.x = (ndc.x + 1) / 2 * innerWidth;
    input.mouse.y = (1 - ndc.y) / 2 * innerHeight;
    input.mouse.overUI = false;
  }

  /**
   * Runs `count` frames: each frame's input from `frame`, then the game's frame, then `measure` on the frame as it
   * would be drawn. Returns what `measure` returned, a row a frame.
   */
  async step<T = void>(count: number, frame?: (f: number) => Frame, measure?: (f: number) => T): Promise<T[]> {
    const rows: T[] = [];
    for (let f = 0; f < count; f++) {
      for (const before of this.beforeFrame) before();
      for (const keep of this.keepUp) keep();
      this.applyInput(frame?.(f) ?? {});
      this.runGameFrame();
      if (measure) rows.push(measure(f));
    }
    return rows;
  }

  /**
   * Runs frames until `done` is true (checked after each frame), at most `limit` of them. Throws, saying `what` failed,
   * if it never is. Returns how many frames it took.
   */
  async until(done: () => boolean, limit: number, what: string, frame?: (f: number) => Frame): Promise<number> {
    for (let f = 0; f < limit; f++) {
      await this.step(1, frame && (() => frame(f)));
      if (done()) return f + 1;
    }
    throw new Error(`lab: ${what} (not within ${limit} frames)`);
  }

  /** The hero's Health held at `lifeShare` of his most: no blow a measure lets land changes it. */
  private readonly keepHeroUp = (): void => {
    G.player.life = G.player.stats.maxLife * this.lifeShare;
  };

  private runGameFrame(): void {
    window.__labFrame();
    const clock = window.__labClock;
    const callbacks = clock.queue;
    clock.queue = [];
    clock.t += clock.frame;
    for (const callback of callbacks) callback(clock.t);
  }

  private applyInput(frame: Frame): void {
    this.pointAt(frame.aim ?? this.aim);
    if (frame.look) renderer.lookBy(frame.look[0], frame.look[1]);
    if (frame.sight) lookToward(frame.sight);
    const keys = frame.keys ?? [];
    for (const key of [...input.down]) {
      if (!keys.includes(key)) input.down.delete(key);
    }
    for (const key of keys) {
      if (!input.down.has(key)) input.pressed.add(key);
      input.down.add(key);
    }
    if (frame.m0 && !input.mouse.left) input.pressed.add('mouse0');
    if (frame.m2 && !input.mouse.right) input.pressed.add('mouse2');
    input.mouse.left = !!frame.m0;
    input.mouse.right = !!frame.m2;
    if (frame.stick) [input.stick.x, input.stick.y] = frame.stick;
  }

  /** Sets the run up as `fixture` says and checks that it took (throws if not). Returns what it is, for the report. */
  async setup(given: Fixture = {}): Promise<Record<string, unknown>> {
    const fixture = this.afresh ? { ...given, fresh: true } : given;
    // (a page's first set-up starts its run from the lobby the boot showed; afresh, a later one starts its own)
    if (this.afresh && this.setUpBefore) await this.runAfresh();
    else await this.enterRun();
    this.setUpBefore = true;
    this.foes.clear();
    this.lifeShare = 1;
    this.keepUp = [() => holdTheWave(this.foes), this.keepHeroUp];
    await this.until(() => !this.player.casting && !this.player.channel, 400, 'the hero is still busy with a cast');
    if (fixture.fresh) {
      // (the view taken from the top down, as a booted page's first set-up takes it: a view kept from before held
      // what it had followed, and a two-hander's cleaves through the eyes came out otherwise on a page a check kept;
      // taken before the hero is built, as the frames that take it would run his legs before he's placed, and a gait
      // after a job through the eyes started its settle from another drop of the hips)
      await this.useView('top');
      this.buildHeroAgain();
    }
    setTunes(fixture.tune ?? {});
    await this.useView(fixture.view ?? 'top');
    const [x, z] = fixture.at ?? SPOT;
    const facing = fixture.facing ?? 0;
    const spot = new THREE.Vector3(x, 0, z);
    if (fixture.gear) this.hold(fixture.gear, fixture.weapon);
    if (fixture.wear) this.dress(fixture.wear);
    if (fixture.rarity) this.glowAs(fixture.rarity);
    this.player.place(spot, facing);
    // (the camera too, for a hero built afresh: a commit from before it has none, and its camera glides)
    if (fixture.fresh) renderer.settleCamera?.(spot);
    // (standing still: an older tree's `place` kept the velocity, and the hero glided on from his spot)
    this.player.vel.set(0, 0, 0);
    this.player.facing = facing;
    lookAlong(facing);
    this.model.reset?.();
    this.aim = new THREE.Vector3(x + Math.sin(facing) * AIM_AHEAD, 0, z + Math.cos(facing) * AIM_AHEAD);
    // (the same moment and the same random numbers from here on, however long the run took to start: the clock is
    // only ever moved forward, so nothing the game stamped with it is left in the future; but a hero built afresh
    // has stamped nothing, and starts at the same moment exactly: at the next multiple, the idle's sway came out a
    // fraction of a millimetre elsewhere, and a run's every number in its last decimal)
    const later = Math.max(SETUP_TIME, Math.ceil(G.time / SETUP_TIME) * SETUP_TIME);
    G.time = fixture.fresh ? SETUP_TIME : later;
    window.__labSeed(SETUP_SEED);
    restartEmitters();
    // (standing a moment: what was still moving as the run started, the camera gliding in and the hero settling on
    // his spot, comes to rest, so it reaches the measure the same however many frames the start took)
    await this.step(SETTLE_FRAMES);
    if (fixture.nocked) await this.nockAnArrow();
    if (this.player.pos.distanceTo(spot) > 0.3) throw new Error('lab: the hero moved off his spot during the set-up');
    return {
      class: this.player.cls.id,
      view: renderer.viewMode(),
      at: [x, z],
      facing,
      nocked: this.player.nocked,
      wears: ARMOUR.filter((piece) => this.player.gear[piece]),
      time: Number(G.time.toFixed(2)),
    };
  }

  /**
   * The hero built again in the old one's place, as the lobby's class switch builds him (`swapHero` in main.ts): the
   * old one taken out of the scene, his skills' visuals with him, and a new one of his class in his gear as the
   * profile has it.
   */
  private buildHeroAgain(): void {
    const old = G.player;
    const at = old.pos.clone();
    const facing = old.facing;
    old.dispose();
    clearProjectiles();
    clearEffects();
    clearLights();
    particles.clear();
    const hero = new Player(old.cls.id, G.profile.equipped);
    hero.slot = old.slot;
    hero.spawn.copy(old.spawn);
    G.players[G.players.indexOf(old)] = hero;
    G.player = hero;
    hero.sandbox = false;
    hero.place(at, facing);
    buildHotbar(hero);
  }

  /** The hero holding his weapons `style`'s way (`weapon` the base in hand), as equipping them from the stash would
   *  show it. */
  private hold(style: WeaponStyle, weapon?: string): void {
    const gear = gearFor(this.player.cls, this.player.gear, style, weapon);
    this.player.gear = gear;
    // (its loadout and its skills tuned to the style too: set by the gear alone, a two-hander swung at a one-hander's
    // pace; an older commit's hero has none of that)
    this.player.fitToGear?.();
    this.model.setGear?.(gear);
  }

  /** The hero wearing `armour` and nothing else of it, as the player sees him dressed. */
  private dress(armour: Armour[]): void {
    const worn = (piece: Armour) => armour.includes(piece);
    const gear = { ...this.player.gear, helm: worn('helm'), chest: worn('chest'), hands: worn('hands') };
    this.player.gear = gear;
    this.model.setGear?.(gear);
  }

  /** Every item the hero wears of `rarity`, as its look shows it (`Gear.rarity`: Rare and up glow in its colour). */
  glowAs(rarity: RarityId): void {
    const slots: GlowSlot[] = ['weapon', 'offhand', 'head', 'chest', 'hands'];
    const gear = { ...this.player.gear, rarity: Object.fromEntries(slots.map((slot) => [slot, rarity])) };
    this.player.gear = gear;
    this.model.setGear?.(gear);
  }

  /**
   * A run started anew from the lobby, as a booted page's first set-up starts one, for a set-up afresh on a page kept
   * from a command before (`begin`): the run left by the pause menu, the profile read again as the boot read it, and
   * the random numbers started again for the run's start. Kept, a run carried the commands' leavings into the next:
   * the game's timers still pending, the wave's state, the props broken and the run's rolled columns.
   */
  private async runAfresh(): Promise<void> {
    if (G.mode === 'run') {
      await this.step(1, () => ({ keys: ['escape'] }));
      const abandon = document.getElementById('btn-abandon');
      if (!abandon) throw new Error('lab: no pause menu to leave the run by');
      // (clicked as the run is started, by the element: clicked by the mouse, a set-up waited for the menu's slide in
      // by the browser's clock, 60 ms of its 300)
      abandon.click();
      await this.until(() => G.mode === 'menu', 600, 'the run never gave way to the lobby');
    }
    G.profile = loadProfile(G.profile.classId);
    window.__labSeed(COMMAND_SEED);
    // (the run stamps what it starts with the game's clock, before a set-up moves it: at the moment the boot's own
    // started, as a fresh page's first set-up starts it)
    if (this.firstRunAt !== null) G.time = this.firstRunAt;
    await this.enterRun();
  }

  private async enterRun(): Promise<void> {
    if (G.mode === 'run') return;
    this.firstRunAt ??= G.time;
    document.getElementById('btn-start')?.click();
    await this.until(() => G.mode === 'run' && !this.player.sandbox, 600, 'the run never started');
  }

  /**
   * The run's view made `view` as the player makes it, pressing V until it is (the game sets the camera's view from its
   * own every frame: set on the camera alone, it was back top-down a frame later).
   */
  private async useView(view: renderer.ViewMode): Promise<void> {
    // (the glide between views cut to a frame: it isn't what's measured)
    const camera = CAMERA as { switchTime: number };
    const glide = camera.switchTime;
    camera.switchTime = 1e-4;
    try {
      for (let press = 0; press < VIEW_PRESSES && renderer.viewMode() !== view; press++) {
        await this.step(1, () => ({ keys: ['v'] }));
        await this.step(2);
      }
      // (in the view already, still gliding into it: from the hero selection screen's shot, as it closed)
      if (!renderer.viewSettled()) await this.step(2);
    } finally {
      camera.switchTime = glide;
    }
    if (renderer.viewMode() !== view || !renderer.viewSettled()) {
      throw new Error(`lab: the view is ${renderer.viewMode()}, not ${view}`);
    }
  }

  private async nockAnArrow(): Promise<void> {
    if (!this.player.cls.quiver) throw new Error(`lab: nocked: the ${this.player.cls.id} carries no quiver`);
    await this.step(6, () => ({ m0: true }));
    await this.until(() => !this.player.casting, 300, "the shot's reload never ended");
    if (this.player.nocked < 1) throw new Error('lab: nocked: no arrow on the string after a shot and its reload');
    await this.step(20);
    if (this.player.nocked < 1) throw new Error('lab: nocked: the arrow went back in the quiver at once');
  }

  /**
   * Throws, saying why, unless `capture` can take each of `views` (framed on `focus`) in the game's view `mode`: so a
   * command can check its pictures before it sets anything up.
   */
  checkCapture(views: string[], mode: renderer.ViewMode, focus?: string): asserts views is ViewName[] {
    const throughEyes = mode === 'first';
    for (const view of views) {
      if (!(VIEW_NAMES as readonly string[]).includes(view)) {
        throw new Error(`lab: no view ${view} (the views: ${VIEW_NAMES.join(', ')})`);
      }
      if (throughEyes && view !== 'eyes' && !CLOSE_UPS[view as ViewName]) {
        throw new Error(`lab: ${view}: through the eyes the eyes' view and the close-ups of the arms alone are shown`);
      }
      if (!throughEyes && view === 'eyes') throw new Error('lab: eyes: needs the view through the eyes (--view first)');
    }
    if (focus !== undefined && !this.jointNames().includes(focus)) {
      throw new Error(`lab: --focus ${focus}: no such joint (the joints: ${this.jointNames().join(', ')})`);
    }
  }

  /** The names of the hero's joints (`hips`, `handL`...). */
  jointNames(): string[] {
    const joints = this.joints as unknown as Record<string, unknown>;
    return Object.keys(joints).filter((name) => joints[name] instanceof THREE.Object3D);
  }

  /** This moment pictured from `views`, under `label`, with `notes` beside it: for a report's `moments`. */
  picture(label: string, views: ViewName[], notes: string[] = [], options: CaptureOptions = {}): Pictured {
    this.model.root.updateMatrixWorld(true);
    return { label, tiles: this.capture(views, options), notes };
  }

  /**
   * This moment as the player sees it, under `label` with `notes` beside it: the frame drawn by the game's own camera
   * with the page's UI over it (the HUD, a menu, a tooltip), pictured by the browser, whole or clipped round the
   * element `around` names (a CSS selector) or to an area of the page (`around` a `Clip`, as `screenArea` makes one
   * round points of the world). For a report's `moments`, as `picture`'s, whose views show the game alone. The
   * page's running animations are settled first (`settleRunning`), the browser drawing a frame after, for their
   * ends to reach the page and its layers to fall as they do with none running.
   */
  async screen(label: string, notes: string[] = [], around?: string | Clip): Promise<Pictured> {
    if (!window.__labScreenshot) throw new Error('lab: screen: this page has no screenshots (opened by an older lab)');
    const clip = around === undefined ? undefined : clipOf(around);
    const drawing = this.drawing;
    this.drawing = true;
    try {
      renderer.render();
    } finally {
      this.drawing = drawing;
    }
    // (after the frame: it may start one; and after each round of them ended, a frame of the browser's own, which
    // sends their ends to the page and lays its layers out without them: the wave's banner, taken off the page by a
    // timer of its own then, was on it one boot in two, the HUD's layers laid out another way and the hotbar's frame
    // lines rastered 20% brighter or dimmer)
    for (let round = 0; round < SETTLE_ROUNDS; round++) {
      const ran = settleRunning();
      await window.__labClock.realFrame();
      if (!ran) break;
    }
    const png = await window.__labScreenshot(clip);
    const size = clip ?? { width: innerWidth, height: innerHeight };
    return { label, tiles: [{ view: 'screen', png, width: size.width, height: size.height }], notes };
  }

  /**
   * A finger put down on the page at `at` as a touch screen has it, its pointer events and all, handled by the page as
   * a player's (no frame runs). The game's first touch puts it in touch mode (`ui/touch.ts`), as a player's does: its
   * controls show from the next frame, and a touch before then lands on whatever lies under them. `finger` tells two
   * fingers down at once apart (a thumb on the move stick, the other on a skill), each moved and lifted by its own.
   */
  touchDown(at: PagePoint, finger = 0): Promise<void> {
    if (this.fingers.has(finger)) throw new Error(`lab: touch: finger ${finger} is already down`);
    this.fingers.set(finger, at);
    return this.sendTouch('touchStart', finger);
  }

  /** The finger `finger` moved to `at` (somewhere new: a touch that doesn't move makes no pointer event). */
  touchMove(at: PagePoint, finger = 0): Promise<void> {
    this.fingerDown(finger);
    this.fingers.set(finger, at);
    return this.sendTouch('touchMove', finger);
  }

  /** The finger `finger` lifted, where it was. */
  touchUp(finger = 0): Promise<void> {
    this.fingerDown(finger);
    const done = this.sendTouch('touchEnd', finger);
    this.fingers.delete(finger);
    return done;
  }

  /**
   * A finger's tap at `at` as a touch screen has it: put down, lifted where it was, and the click the browser makes of
   * it handled (it comes in a task after the lift, which `touchUp` returns before: a button tapped hadn't heard it
   * yet). No frame runs.
   */
  async tap(at: PagePoint, finger = 0): Promise<void> {
    const clicked = touchHandled(['click']);
    await this.touchDown(at, finger);
    await this.touchUp(finger);
    await clicked;
  }

  /** An error unless `finger` is down. */
  private fingerDown(finger: number): void {
    if (!this.fingers.has(finger)) throw new Error(`lab: touch: finger ${finger} isn't down`);
  }

  /**
   * A click of the mouse's left button at `at` (css px) as a mouse gives it: moved there, pressed and let go, sent
   * through the DevTools protocol, so the browser handles it as a player's click (its mouse and pointer events, the
   * focus it moves to what was clicked). No frame runs; it returns once the page has handled the release.
   */
  async click(at: PagePoint): Promise<void> {
    await this.mouseTo(at);
    await this.sendMouse('mousePressed', at);
    await this.sendMouse('mouseReleased', at);
  }

  /**
   * `element` clicked at its middle as a mouse clicks it (`click`), scrolled to first as the player scrolls to it (a
   * phone's pause menu has its Abandon below the screen's edge) and once the page's transitions are over: the lab's
   * frames outrun the browser's clock, which they run on, and a lobby's panel was still sliding back in from the
   * stowed lobby, its tab 31 px off. Throws if its middle is off the screen even so. No frame runs.
   */
  async clickOn(element: Element): Promise<void> {
    element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const sliding = document.getAnimations().filter((animation) => animation instanceof CSSTransition);
    await Promise.all(sliding.map((animation) => animation.finished.catch(() => undefined)));
    const at = middleOf(element);
    if (at.x < 0 || at.y < 0 || at.x > innerWidth || at.y > innerHeight) {
      const name = element.id ? `#${element.id}` : element.tagName.toLowerCase();
      throw new Error(`lab: clickOn: ${name} lies off the screen, at ${Math.round(at.x)}, ${Math.round(at.y)}`);
    }
    await this.click(at);
  }

  /**
   * The mouse's `button` (the left by default) pressed at `at` (css px) and held there until `mouseUp`, as a mouse
   * holds it (a button held to act: the pause menu's Abandon run; the middle one dragged: `mouseTo` moves it held).
   * No frame runs.
   */
  async mouseDown(at: PagePoint, button: MouseButton = 'left'): Promise<void> {
    await this.mouseTo(at);
    this.buttonsHeld |= BUTTON_BITS[button];
    await this.sendMouse('mousePressed', at, 0, button);
  }

  /** The mouse's `button` (the left by default) let go at `at` (css px). No frame runs. */
  async mouseUp(at: PagePoint, button: MouseButton = 'left'): Promise<void> {
    this.buttonsHeld &= ~BUTTON_BITS[button];
    await this.sendMouse('mouseReleased', at, 0, button);
  }

  /** A click of the mouse's `button` at `at` (css px), as `click` gives the left one's. No frame runs. */
  async clickWith(at: PagePoint, button: MouseButton): Promise<void> {
    await this.mouseDown(at, button);
    await this.mouseUp(at, button);
  }

  /** The mouse moved to `at` (css px) as a mouse moves, its events and all. No frame runs. */
  async mouseTo(at: PagePoint): Promise<void> {
    // (the browser makes no pointer move of a move to where the mouse is: a second click there waited for one)
    if (this.mouseAt?.x === at.x && this.mouseAt.y === at.y) return;
    await this.sendMouse('mouseMoved', at);
  }

  /** The mouse's wheel turned `deltaY` px down (up when less than 0) with the mouse at `at`. No frame runs. */
  async wheel(at: PagePoint, deltaY: number): Promise<void> {
    await this.sendMouse('mouseWheel', at, deltaY);
  }

  /**
   * The key whose code is `code` (`KeyW`, `Space`) pressed and let go as a keyboard gives it, so the browser handles
   * it as a player's key, what it does to the focused element with it (a focus ring shown, a button pressed). No
   * frame runs; it returns once the page has handled the key's release.
   */
  async press(code: string): Promise<void> {
    await this.keyDown(code);
    await this.keyUp(code);
  }

  /**
   * The key whose code is `code` held down as a keyboard holds it, until `keyUp`. No frame runs. The game holds it
   * through the frames the lab runs only if their input holds it too (`Frame.keys`, by the game's name for it,
   * `altleft`): a frame's keys are all the game has down.
   */
  async keyDown(code: string): Promise<void> {
    await this.sendKey('keyDown', code);
  }

  /** The key whose code is `code` let go, as a keyboard lets it go. No frame runs. */
  async keyUp(code: string): Promise<void> {
    await this.sendKey('keyUp', code);
  }

  /**
   * The pointer lock played by the page from here on, while `on`, as the browser takes and holds it (the lab never
   * takes the real one): asked for after a click or a key it's taken, and while it's held the mouse's every event
   * goes to the locked element. Off, it's let go; the game hears that as a lock lost, and a run's is paused, so a
   * measure lets the game let go of it first (the top-down view).
   */
  pointerLock(on: boolean): void {
    const lock = window.__labLock;
    if (!lock) throw new Error('lab: pointerLock: this page has no lock of its own (opened by an older lab)');
    lock.on = on;
    if (!on) document.exitPointerLock();
  }

  /**
   * The page's `prefers-reduced-motion` as the browser emulates it. The lab opens every page with it reduced (the
   * page's decorative animation left out, the loading screen's exit with it); a measure of such an animation lets it
   * run, and puts it back as it ends.
   */
  async reduceMotion(reduced: boolean): Promise<void> {
    if (!window.__labMotion) throw new Error('lab: reduceMotion: this page can\'t change it (opened by an older lab)');
    await window.__labMotion(reduced);
  }

  /**
   * The page's CPU slowed `rate` times (1: as it is), as the browser emulates a slower device's: what the page's work
   * costs a low-end phone's or laptop's (DevTools' presets: 4 a mid-range phone's, 6 a low-end one's). Times read by
   * the browser's own clock (`__labClock.realNow`) take that much longer; the lab's frames stay as long as ever.
   */
  async throttle(rate: number): Promise<void> {
    if (!window.__labThrottle) throw new Error('lab: throttle: this page can\'t slow its CPU (opened by an older lab)');
    await window.__labThrottle(rate);
  }

  /**
   * The page put on a screen of `screen`'s size (css px) and pixel ratio as the command runs, as the player's window is
   * taken to full screen or onto another monitor (`--screen`'s, sent through the DevTools protocol): the page lays
   * itself out again and hears a resize, and the browser draws a frame of its own after it, the game's left queued.
   */
  async showOn(screen: Screen): Promise<void> {
    if (!window.__labScreen) throw new Error('lab: showOn: this page can\'t change screens (opened by an older lab)');
    await window.__labScreen(screen);
    await window.__labClock.realFrame();
  }

  private async sendMouse(type: MouseType, at: PagePoint, deltaY = 0, button: MouseButton = 'left'): Promise<void> {
    if (!window.__labMouse) throw new Error('lab: click: this page has no mouse (opened by an older lab)');
    const ours = (event: Event) => event instanceof WheelEvent || (event as PointerEvent).pointerType === 'mouse';
    const handled = inputHandled({ names: MOUSE_EVENTS[type], ours, what: 'click' });
    await sent(handled, window.__labMouse(type, at.x, at.y, deltaY, button, this.buttonsHeld));
    this.mouseAt = { x: at.x, y: at.y };
  }

  private async sendKey(type: KeyType, code: string): Promise<void> {
    if (!window.__labKey) throw new Error('lab: press: this page has no keyboard (opened by an older lab)');
    const ours = (event: Event) => (event as KeyboardEvent).code === code;
    const handled = inputHandled({ names: KEY_EVENTS[type], ours, what: 'press' });
    await sent(handled, window.__labKey(type, code));
  }

  /**
   * A touch of the finger `finger` alone, by its id, as Puppeteer sends one: the browser puts it down, moves it or
   * lifts it, and leaves the other fingers where they are. (Sent as the protocol's docs say, every finger down in each
   * touch and the one lifted left out, the finger left out was never lifted.)
   */
  private async sendTouch(type: TouchType, finger: number): Promise<void> {
    if (!window.__labTouch) throw new Error('lab: touch: this page has no touches (opened by an older lab)');
    const at = this.fingers.get(finger)!;
    const touch: Finger = { x: at.x, y: at.y, id: finger };
    this.hearCancels();
    if (type !== 'touchStart' && this.touchPanned(finger)) {
      // (the browser took it as a pan: the page hears nothing more of it)
      await window.__labTouch(type, [touch]);
      if (type === 'touchEnd') this.forgetPointer(finger);
      return;
    }
    const heard = await sent(touchHandled(TOUCH_POINTER_EVENTS[type]), window.__labTouch(type, [touch]));
    if (type === 'touchStart') this.pointerOf.set(finger, (heard as PointerEvent).pointerId);
    if (type === 'touchEnd') this.forgetPointer(finger);
  }

  /** The touches' pointer cancels listened for, from the first touch on. */
  private hearCancels(): void {
    if (this.hearingCancels) return;
    this.hearingCancels = true;
    window.addEventListener('pointercancel', (event) => {
      if (event.pointerType === 'touch') this.cancelled.add(event.pointerId);
    }, true);
  }

  /** The finger `finger`'s pointer forgotten, as it's lifted. */
  private forgetPointer(finger: number): void {
    const pointer = this.pointerOf.get(finger);
    if (pointer !== undefined) this.cancelled.delete(pointer);
    this.pointerOf.delete(finger);
  }

  /** Whether the browser took the finger `finger`'s touch as a pan (its pointer cancelled): the page hears no more. */
  touchPanned(finger = 0): boolean {
    const pointer = this.pointerOf.get(finger);
    return pointer !== undefined && this.cancelled.has(pointer);
  }

  /** Pictures of the game as it is now, nothing advanced; the game's camera is put back as it was. */
  capture(views: ViewName[], options: CaptureOptions = {}): Tile[] {
    return this.drawn(views, options).map(({ view, canvas, parts }) => ({
      ...tileOf(canvas, view),
      ...(parts ? { parts } : {}),
    }));
  }

  /**
   * `capture`'s pictures as canvases, for page code that draws them on (a film's frames, shown small): encoded as a
   * tile's picture and decoded again, a frame took a quarter of a second.
   */
  drawn(views: ViewName[], options: CaptureOptions = {}): Drawn[] {
    this.checkCapture(views, renderer.viewMode(), options.focus);
    const restore = this.saveCamera();
    const drawing = this.drawing;
    this.drawing = true;
    try {
      return views.map((view) => {
        const drawn = this.drawOne(view, options);
        restore();
        return drawn;
      });
    } finally {
      this.drawing = drawing;
      restore();
    }
  }

  private drawOne(view: ViewName, options: CaptureOptions): Drawn {
    const closeUp = CLOSE_UPS[view];
    let crop: Crop;
    if (closeUp) crop = this.aimCloseUp(closeUp, options);
    else if (view === 'eyes') crop = wholeFrame();
    else crop = this.aimGameView(view);
    const area = areaOf(crop);
    const look = options.look ?? 'lit';
    if (look === 'lit' || look === 'bones') {
      if (closeUp && renderer.viewMode() === 'first') this.renderArmsFromOutside();
      else renderer.render();
      const canvas = cropOf(G.renderer.domElement, area);
      return { view, canvas: look === 'bones' ? withBones(canvas, this.joints, area) : canvas };
    }
    const joints = jointsByObject(this.joints);
    const named = (mesh: THREE.Mesh) => partName(mesh, joints);
    const { image, parts } = drawLook(look, this.model.root, area, named);
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext('2d')!.putImageData(image, 0, 0);
    return { view, canvas, ...(look === 'parts' ? { parts } : {}) };
  }

  /**
   * Through the eyes, the frame drawn from the game's camera where a close-up put it, the arms and what they hold drawn
   * by it too (not by their own camera from the eyes: renderer.ts `drawArms`): the arms as the eyes place them, seen
   * from outside, their shoulders under the camera and the rest of the body unseen (a wrist seen bent from the eyes
   * alone was read three ways).
   */
  private renderArmsFromOutside(): void {
    const fov = this.model.armsFov?.() ?? null;
    const layers = G.camera.layers.mask;
    // (the arms' layer, as their own camera draws it)
    const arms = renderer.armsCamera().layers.mask;
    renderer.drawArms(null);
    G.camera.layers.mask = layers | arms;
    try {
      renderer.render();
    } finally {
      G.camera.layers.mask = layers;
      renderer.drawArms(fov);
    }
  }

  /** the game's camera set for a close-up; the crop is the frame's middle */
  private aimCloseUp(closeUp: CloseUp, options: CaptureOptions): Crop {
    const camera = G.camera;
    const focus = options.focus;
    const target = (focus ? this.joints[focus] : this.joints.hips) as THREE.Object3D;
    const centre = options.at?.clone() ?? target.getWorldPosition(new THREE.Vector3());
    const distance = options.distance ?? (focus ? JOINT_DISTANCE : BODY_DISTANCE);
    const angle = this.player.facing + closeUp.turn;
    camera.position.set(
      centre.x + Math.sin(angle) * distance,
      centre.y + closeUp.rise * distance / BODY_DISTANCE,
      centre.z + Math.cos(angle) * distance,
    );
    camera.fov = CLOSE_UP_FOV;
    camera.near = 0.05;
    camera.updateProjectionMatrix();
    camera.lookAt(centre);
    camera.updateMatrixWorld();
    // (the props stand whole: their dissolve round the hero is the game views')
    updateSeeThrough(centre.x, centre.y, centre.z, 0, 0);
    return { centreX: innerWidth / 2, centreY: innerHeight / 2, width: innerHeight * 0.6, height: innerHeight };
  }

  /** the game's camera in one of its own views; the crop is round the hero, as large as the player sees him */
  private aimGameView(view: ViewName): Crop {
    renderer.setView(view === 'third' ? 'third' : 'top');
    if (view !== 'third') renderer.setZoom(view === 'lobby' ? CAMERA.lobbyZoom : 1);
    // (a long step: every glide and ease of the camera at its end)
    for (let i = 0; i < 3; i++) renderer.updateCamera(10, this.player.pos, this.model.height);
    const camera = G.camera;
    camera.updateMatrixWorld();
    const hips = this.joints.hips.getWorldPosition(new THREE.Vector3()).project(camera);
    const headTop = this.joints.head.getWorldPosition(new THREE.Vector3()).add(ABOVE_HEAD);
    const top = headTop.project(camera);
    const foot = this.player.pos.clone().project(camera);
    const heroHeight = Math.abs(top.y - foot.y) / 2 * innerHeight;
    const height = THREE.MathUtils.clamp(heroHeight * 1.5, 160, innerHeight);
    return {
      centreX: (hips.x + 1) / 2 * innerWidth,
      centreY: (1 - hips.y) / 2 * innerHeight,
      width: height * 0.6,
      height,
    };
  }

  /** The game's camera and its rig as they are now, and a function that puts them back. */
  private saveCamera(): () => void {
    const camera = G.camera;
    const position = camera.position.clone();
    const quaternion = camera.quaternion.clone();
    const { fov, near } = camera;
    const view = renderer.viewMode();
    // (`saveCamera` restores the rig exactly; a tree without it goes back to its view at zoom 1, as a run starts)
    const restoreRig = (renderer as { saveCamera?: () => () => void }).saveCamera?.();
    return () => {
      if (restoreRig) {
        restoreRig();
      } else {
        renderer.setView(view);
        renderer.setZoom(1);
        for (let i = 0; i < 3; i++) renderer.updateCamera(10, this.player.pos, this.model.height);
      }
      // (an update with no time passing: the camera and the props' dissolve back as the rig has them)
      renderer.updateCamera(0, this.player.pos, this.model.height);
      camera.position.copy(position);
      camera.quaternion.copy(quaternion);
      camera.fov = fov;
      camera.near = near;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
    };
  }
}

/** a region of the frame to keep, px */
interface Crop {
  centreX: number;
  centreY: number;
  width: number;
  height: number;
}

/** The page `around` names: round the element a CSS selector names, or an area of it. */
/** the most rounds a picture ends the page's animations in, a frame of the browser's after each (`screen`) */
const SETTLE_ROUNDS = 4;

/**
 * The page's running animations brought to their end (an endless one held at its start): they run on the browser's
 * clock, not the lab's, so a picture caught each at another moment (the wave's banner fading, in one side of an A/B
 * and not the other). One a command holds paused, at the moment it pictures, is left as it is, and so is one driven by
 * a scroll (`onTheClock`). Whether any ran.
 */
function settleRunning(): boolean {
  let settled = false;
  for (const animation of document.getAnimations()) {
    if (animation.playState !== 'running' || !onTheClock(animation)) continue;
    settled = true;
    if (animation.effect?.getComputedTiming().iterations !== Infinity) {
      animation.finish();
      continue;
    }
    animation.pause();
    animation.currentTime = 0;
  }
  return settled;
}

function clipOf(around: string | Clip): Clip {
  return typeof around === 'string' ? clipRound(around) : withinWindow(around);
}

/** The page round the element `selector` names, `SCREEN_MARGIN` out from it on every side, within the window. */
function clipRound(selector: string): Clip {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`lab: screen: nothing on the page is ${selector}`);
  const box = element.getBoundingClientRect();
  if (box.width === 0 || box.height === 0) throw new Error(`lab: screen: ${selector} isn't shown`);
  return withinWindow({ x: box.left, y: box.top, width: box.width, height: box.height }, SCREEN_MARGIN);
}

/** `area` grown by `margin` on every side, in whole pixels within the window. */
function withinWindow(area: Clip, margin = 0): Clip {
  const x = Math.max(0, Math.floor(area.x - margin));
  const y = Math.max(0, Math.floor(area.y - margin));
  const right = Math.min(innerWidth, Math.ceil(area.x + area.width + margin));
  const bottom = Math.min(innerHeight, Math.ceil(area.y + area.height + margin));
  if (right <= x || bottom <= y) throw new Error('lab: screen: the area is off the window');
  return { x, y, width: right - x, height: bottom - y };
}

/**
 * The gear of a hero of `cls` holding his weapons `style`'s way, his armour as `worn` has it: `base` in hand, or the
 * class's first one-hander (or two-hander), with a shield or a second one-hander (of the same base) as the style
 * says. Throws for a style the class can't hold, or a base that isn't of it.
 */
export function gearFor(cls: ClassDef, worn: Gear, style: WeaponStyle, base?: string): Gear {
  const { twoHanders, oneHanders } = handedBases(cls);
  const ofStyle = style === 'twoHanded' ? twoHanders : oneHanders;
  if (base && !ofStyle.includes(base)) {
    throw new Error(`lab: --weapon ${base}: not a ${style} weapon of the ${cls.id}'s (${ofStyle.join(', ')})`);
  }
  const oneHander = oneHanders[0] ?? null;
  const weapon = base ?? ofStyle[0] ?? null;
  const gear: Gear = {
    ...worn,
    weapon,
    twoHanded: style === 'twoHanded',
    shield: style === 'shield',
    offWeapon: style === 'dual' ? (base ?? oneHander) : null,
  };
  const holdsOff = style !== 'shield' || Boolean(cls.bases?.offhand?.length);
  const can = weapon !== null && (style !== 'dual' || cls.dualWield) && holdsOff;
  if (!can || weaponStyle(cls, gear) !== style) throw new Error(`lab: --gear ${style}: the ${cls.id} can't hold that`);
  return gear;
}

/** A class's weapon bases, its two-handers and the rest. */
function handedBases(cls: ClassDef): { twoHanders: string[]; oneHanders: string[] } {
  const twoHanders = cls.twoHanded ?? [];
  const oneHanders = cls.bases?.weapon?.filter((each) => !twoHanders.includes(each)) ?? [];
  return { twoHanders, oneHanders };
}

/** The bases a hero of `cls` holds his weapons `style`'s way with (as `gearFor` gives them): none for a way he can't
 *  hold them. */
export function basesHeld(cls: ClassDef, style: WeaponStyle): string[] {
  if (style === 'dual' && !cls.dualWield) return [];
  if (style === 'shield' && !cls.bases?.offhand?.length) return [];
  const { twoHanders, oneHanders } = handedBases(cls);
  return style === 'twoHanded' ? twoHanders : oneHanders;
}

/**
 * The area of the page the game's camera shows `points` of the world in, `margin` px out from them on every side: a
 * screen picture (`Lab.screen`) of what's round them, the UI over it included.
 */
export function screenArea(points: THREE.Vector3[], margin = SCREEN_MARGIN): Clip {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const point of points) {
    const ndc = point.clone().project(G.camera);
    xs.push((ndc.x + 1) / 2 * innerWidth);
    ys.push((1 - ndc.y) / 2 * innerHeight);
  }
  const x = Math.min(...xs) - margin;
  const y = Math.min(...ys) - margin;
  return { x, y, width: Math.max(...xs) + margin - x, height: Math.max(...ys) + margin - y };
}

function wholeFrame(): Crop {
  return { centreX: innerWidth / 2, centreY: innerHeight / 2, width: innerWidth, height: innerHeight };
}

/** The region of the canvas just drawn, as a PNG (read in the same task as the draw, before the browser shows it). */
/** The area of the window `crop` keeps, in whole px within it. */
function areaOf(crop: Crop): Area {
  const width = Math.round(Math.min(crop.width, innerWidth));
  const height = Math.round(Math.min(crop.height, innerHeight));
  const left = Math.round(THREE.MathUtils.clamp(crop.centreX - width / 2, 0, innerWidth - width));
  const top = Math.round(THREE.MathUtils.clamp(crop.centreY - height / 2, 0, innerHeight - height));
  return { left, top, width, height };
}

/** `area` of the game's canvas (as its own chain drew it) on a canvas of its own. */
function cropOf(source: HTMLCanvasElement, area: Area): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = area.width;
  canvas.height = area.height;
  const { left, top, width, height } = area;
  canvas.getContext('2d')!.drawImage(source, left, top, width, height, 0, 0, width, height);
  return canvas;
}

/** `canvas` as a picture of `view`. */
function tileOf(canvas: HTMLCanvasElement, view: ViewName): Tile {
  return { view, png: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
}

/**
 * The run held in its countdown before the first wave: no foes and none coming, so a set-up's state is the hero's
 * alone. (Foes parked far off still thought, drew random numbers and turned the hero's head towards them.)
 */
function holdTheWave(kept: Set<Enemy>): void {
  const run = G.run;
  if (!run) return;
  const others = G.enemies.filter((enemy) => !kept.has(enemy));
  for (const enemy of others) enemy.dispose();
  if (others.length) G.enemies.splice(0, G.enemies.length, ...G.enemies.filter((enemy) => kept.has(enemy)));
  run.queue = [];
  run.phase = 'countdown';
  run.timer = Infinity;
}

/** Sets the game's tunable values (`Fixture.tune`; src/core/tuning.ts), each by its path: whole lists first, then
 *  some of a list's numbers (`path[i,j]`, each to its one value) over what's set then. */
function setTunes(tunes: Record<string, number[]>): void {
  const paths = Object.keys(tunes);
  if (!paths.length) return;
  if (!window.__tune) throw new Error('lab: --tune: this game has no tunable values');
  const some = paths.filter((path) => path.endsWith(']'));
  for (const path of paths.filter((path) => !path.endsWith(']'))) window.__tune(path, tunes[path]);
  for (const path of some) setSomeOf(path, tunes[path][0]);
}

/** Some of a tunable list's numbers set to `value` (`path[i,j]`: the list's path and the numbers' places). */
function setSomeOf(path: string, value: number): void {
  const [, list, places] = /^(.+)\[([\d,]+)\]$/.exec(path)!;
  if (!window.__tuned) throw new Error('lab: --tune: this game reads no tunable value back to set some of one');
  const numbers = [...window.__tuned(list)];
  for (const place of places.split(',').map(Number)) {
    if (place >= numbers.length) throw new Error(`lab: --tune: ${list} has ${numbers.length} numbers, no ${place}`);
    numbers[place] = value;
  }
  window.__tune!(list, numbers);
}

/**
 * Resolved once every map the loading workers make has come, before the lab installs (`everyMapCome` in
 * src/core/textures.ts; an older commit has none): landing mid-command, later as the machine was loaded, a map drew
 * the crypt's foes otherwise in some of a check's casts. No frame runs meanwhile: the clock is the lab's from the
 * reveal.
 */
export async function mapsCome(): Promise<void> {
  await (textures as { everyMapCome?: () => Promise<void> }).everyMapCome?.();
  const fire = await import('../../../src/world/fire');
  await (fire as { flamesCome?: () => Promise<void> }).flamesCome?.();
}

/** The session's entry: the lab installed on this page. */
export function install(): Lab {
  const lab = new Lab();
  lab.install();
  return lab;
}

/** The page's cookies and local storage, by name. */
interface Stored {
  cookies: [string, string][];
  storage: [string, string][];
}

/** The page's cookies and local storage as they are now. */
function storedNow(): Stored {
  const cookies = document.cookie
    .split('; ')
    .filter(Boolean)
    .map((pair): [string, string] => {
      const at = pair.indexOf('=');
      return [pair.slice(0, at), pair.slice(at + 1)];
    });
  const storage = Object.keys(localStorage).map((name): [string, string] => [name, localStorage.getItem(name) ?? '']);
  return { cookies, storage };
}

/**
 * The page's cookies and local storage put back as `stored` had them, as a command begins whose heroes are built
 * afresh, for them to read what the boot's read (a skill bound to a key by a command before, `bindKnown`, saved its
 * loadout, which the next command's heroes loaded). Not at each set-up: a command's own bindings hold for its own
 * set-ups after them, as on a page booted for it (put back at each, the eyes' canaries cast another skill).
 */
function storeAgain(stored: Stored): void {
  for (const [name] of storedNow().cookies) document.cookie = `${name}=; max-age=0; path=/`;
  for (const [name, value] of stored.cookies) document.cookie = `${name}=${value}; path=/; SameSite=Lax`;
  localStorage.clear();
  for (const [name, value] of stored.storage) localStorage.setItem(name, value);
}
