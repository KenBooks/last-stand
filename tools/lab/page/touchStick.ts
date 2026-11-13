// The touch controls' move stick pushed by a finger (tools/lab `touch`): a touch put down on the move pad and slid out
// to the right, within the stick's dead zone, through its travel, to its edge and far past it, half the window's
// width as a thumb swept across the screen, and what the game made of each push: the stick's push (0 to 1), the
// knob's place and the hero's speed against his full. A finger past the stick's edge is the stick at its fullest, so
// a push further out may never be a slower one: held to the edge and then divided by the finger's whole distance,
// half a screen out walked the hero at a seventh of his speed. He's put where the push walks him in towards the
// arena's middle: from the lab's own spot (12, 22) a push to the right walked him into the wall, which brakes him as
// he nears it (`Player.slowForWall`), and every push past the stick's edge read 6.55 of his 7 m/s.
import { middleOf } from './lab';
import type { Fixture, Lab, PagePoint, Report } from './lab';
import { input } from '../../../src/core/input';
import { cameraYaw } from '../../../src/core/renderer';
import { G } from '../../../src/state';

export interface TouchOptions {
  fixture: Fixture;
  canary?: boolean;
}

/** how far the finger is slid out from where it went down (css px), besides half the window's width */
const PUSHES = [4, 15, 25, 34, 45, 56, 100, 200, 400];
/** the finger's start inside the pad's left edge (css px), and the most it slides between two moves (a finger's
 *  slide makes many) */
const MARGIN = 24;
const SLIDE_STEP = 20;
/** the frames a push is held before its speed is read (the body speeds up as its feet push it on) */
const HOLD_FRAMES = 60;
/** the frames after the finger is lifted, before the next push sets the hero up again */
const LIFT_FRAMES = 2;
/** how much less a push further out may give than a nearer one before it counts as slower: of the push, and as a
 *  share of the speed */
const PUSH_SLACK = 0.001;
const SPEED_SLACK = 0.02;
/** how far the knob may stand off the finger within the stick's travel (css px) */
const KNOB_SLACK = 1;
/** past the stick's edge: the least push and share of his full speed */
const FULL_PUSH = 0.999;
const FULL_SPEED = 0.97;
/** how far from the arena's middle the hero is put, against the push's way (m): a push walks him in towards it, and
 *  in 60 frames at his full 7 m/s he stops short of the dais's middle */
const PUSH_FROM = 10;
/** the least room he may have to the wall as a push's speed is read (m): nearer, the wall's brake slows him */
const WALL_ROOM = 3;
/** with --canary: the furthest push's finger slid back to this far out (css px) before it's read, a slower push
 *  further out that the measure must catch */
const CANARY_BACK = 20;
/** the most a push's walk may rise or fall (m): further, it left the level ground its speed is read on (from the
 *  set-ups' spot the walk stepped down off the dais's ground and was read at 6.69 of 7 m/s) */
const LEVEL_SLACK = 0.02;

/** What one push gave. */
interface Push {
  /** how far the finger was slid out (css px) */
  out: number;
  /** the stick's push the game read (0 to 1) */
  push: number;
  /** how far the knob stood from where the finger went down (css px) */
  knob: number;
  /** the hero's speed once it was held (m/s) */
  speed: number;
  /** where he was then (m), and how far he had risen or fallen since setting off */
  end: [number, number];
  climb: number;
  /** the canary's: its finger slid back */
  planted: boolean;
  /** his room to the wall as it was read (m) */
  room: number;
}

/** An element of the page by its selector, or an error naming it. */
export function element(selector: string): HTMLElement {
  const found = document.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`lab: touch: the page has no ${selector}`);
  return found;
}

/** The pushes slid this time: `PUSHES` and half the window's width, each that fits on the window from `start`. */
function pushesFrom(start: PagePoint): number[] {
  const all = [...PUSHES, Math.round(innerWidth / 2)].sort((a, b) => a - b);
  const fits = all.filter((out) => start.x + out <= innerWidth - MARGIN);
  return [...new Set(fits)];
}

/** Slides the finger `finger` (the first down by default) from `from` to `to`, in steps no longer than `SLIDE_STEP`. */
export async function slide(lab: Lab, from: PagePoint, to: PagePoint, finger = 0): Promise<void> {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(length / SLIDE_STEP));
  for (let step = 1; step <= steps; step++) {
    const along = step / steps;
    await lab.touchMove({ x: from.x + (to.x - from.x) * along, y: from.y + (to.y - from.y) * along }, finger);
  }
}

/**
 * The touch controls shown: they show once the game is in touch mode, which a first tap puts it in (on the run's
 * canvas, where touch mode leaves it alone).
 */
export async function showTouchControls(lab: Lab): Promise<void> {
  const pad = element('#touch-pad');
  if (pad.getBoundingClientRect().width >= 1) return;
  const tap = { x: MARGIN, y: innerHeight / 2 };
  await lab.touchDown(tap);
  await lab.touchUp();
  await lab.step(1);
}

/**
 * The set-up for every push: the hero put `PUSH_FROM` m from the arena's middle against the way a push to the right
 * of the screen walks him (the camera's right on the ground, as `Player.handleInput` turns the stick), so he walks in
 * across open ground, the wall's brake far behind him.
 */
function openGround(fixture: Fixture): Fixture {
  const yaw = cameraYaw();
  const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
  return { ...fixture, at: [-right.x * PUSH_FROM, -right.z * PUSH_FROM] };
}

/** Where a push starts: on the move pad, `MARGIN` in from its left edge and halfway down. */
async function padStart(lab: Lab): Promise<PagePoint> {
  await showTouchControls(lab);
  const pad = element('#touch-pad');
  const box = pad.getBoundingClientRect();
  const start = { x: box.left + MARGIN, y: box.top + box.height / 2 };
  if (document.elementFromPoint(start.x, start.y) !== pad) {
    throw new Error(`lab: touch: the move pad isn't under ${start.x},${start.y} (it shows in touch mode, in a run)`);
  }
  return start;
}

/** One push: the hero set up afresh, the finger put down at `start`, slid `out` px right and held; then lifted. */
async function pushOut(lab: Lab, fixture: Fixture, start: PagePoint, out: number, planted: boolean): Promise<Push> {
  await lab.setup(fixture);
  const startY = lab.player.pos.y;
  const knob = element('#touch-stick .knob');
  await lab.touchDown(start);
  const end = { x: start.x + out, y: start.y };
  await slide(lab, start, end);
  if (planted) await slide(lab, end, { x: start.x + CANARY_BACK, y: start.y });
  await lab.step(HOLD_FRAMES);
  const knobAt = middleOf(knob);
  const push: Push = {
    out,
    push: Math.hypot(input.stick.x, input.stick.y),
    knob: Math.hypot(knobAt.x - start.x, knobAt.y - start.y),
    speed: Math.hypot(lab.player.vel.x, lab.player.vel.z),
    end: [lab.player.pos.x, lab.player.pos.z],
    climb: lab.player.pos.y - startY,
    planted,
    room: G.arena.wall.roomOut(lab.player.pos.x, lab.player.pos.z, lab.player.radius),
  };
  await lab.touchUp();
  await lab.step(LIFT_FRAMES);
  return push;
}

/**
 * What's wrong with `push` against the nearer ones before it: the knob off the finger within the stick's travel,
 * slower, or short of full past the stick's edge.
 */
function faultsOf(push: Push, nearer: Push[], travel: number, full: number): string[] {
  const faults: string[] = [];
  if (push.room < WALL_ROOM) {
    faults.push(`${push.out} px out was read ${push.room.toFixed(1)} m from the wall, which brakes him`);
  }
  if (push.out < travel - KNOB_SLACK && Math.abs(push.knob - push.out) > KNOB_SLACK) {
    faults.push(`${push.out} px out, the knob is ${push.knob.toFixed(1)} px out: not under the finger`);
  }
  const most = nearer.reduce((best, other) => (other.push > best.push ? other : best), nearer[0]);
  const fastest = nearer.reduce((best, other) => (other.speed > best.speed ? other : best), nearer[0]);
  if (most && push.push < most.push - PUSH_SLACK) {
    faults.push(`${push.out} px out pushes less than ${most.out} px did: ${push.push.toFixed(2)} against `
      + `${most.push.toFixed(2)}`);
  }
  if (fastest && push.speed < fastest.speed * (1 - SPEED_SLACK)) {
    faults.push(`${push.out} px out is slower than ${fastest.out} px: ${push.speed.toFixed(2)} against `
      + `${fastest.speed.toFixed(2)} m/s`);
  }
  if (push.out >= travel && (push.push < FULL_PUSH || push.speed < full * FULL_SPEED)) {
    faults.push(`${push.out} px out, past the stick's edge, pushes ${push.push.toFixed(2)} and goes `
      + `${push.speed.toFixed(2)} of his ${full} m/s`);
  }
  return faults;
}

/**
 * The wall's canary: the furthest push from the set-up's own spot (the lab's 12, 22 by default), where a push to the
 * right walks him into the wall's brake, which the measure must catch. Its line, its problem added if it went unseen.
 */
async function wallCanary(lab: Lab, fixture: Fixture, start: PagePoint, outs: number[], problems: string[]) {
  const out = outs[outs.length - 1];
  const push = await pushOut(lab, fixture, start, out, false);
  if (push.room < WALL_ROOM) {
    return `canary: caught (${out} px out from the set-up's spot, read ${push.room.toFixed(1)} m from the wall)`;
  }
  problems.push(`the wall's canary went unseen: ${out} px out from the set-up's spot, ${push.room.toFixed(1)} m `
    + 'from the wall');
  return `canary: unseen (${out} px out from the set-up's spot)`;
}

/** A push as a line of the report. */
function pushLine(push: Push, full: number): string {
  const out = `${push.out} px out`.padStart(11);
  const canary = push.planted ? ` (canary: slid back to ${CANARY_BACK} px)` : '';
  const end = push.end.map((metres) => metres.toFixed(1)).join(', ');
  return `${out}: push ${push.push.toFixed(2)}, knob ${push.knob.toFixed(1)} px out, `
    + `${push.speed.toFixed(2)} of ${full} m/s, at ${end}${canary}`;
}

/**
 * `lab touch`: the move stick pushed by a finger near and far, each push from a fresh set-up; a push further out that
 * gives less, or one past the stick's edge short of full speed, is a problem, and so is a canary it missed.
 */
export async function touchStick(lab: Lab, options: TouchOptions): Promise<Report> {
  await lab.setup(options.fixture);
  const start = await padStart(lab);
  const fixture = openGround(options.fixture);
  const outs = pushesFrom(start);
  const pushes: Push[] = [];
  for (const out of outs) {
    const planted = options.canary === true && out === outs[outs.length - 1];
    pushes.push(await pushOut(lab, fixture, start, out, planted));
  }
  const full = lab.player.stats.moveSpeed;
  const measured = pushes.filter((push) => !push.planted);
  // (the stick's travel: as far out as the knob went)
  const travel = Math.round(Math.max(...measured.map((push) => push.knob)));
  const problems: string[] = [];
  if (measured.every((push) => push.push === 0 && push.knob < 1)) problems.push('the touches never moved the stick');
  const lines = [`a finger down at ${start.x},${start.y} on the move pad, slid right; the knob's travel ${travel} px; `
    + `the hero walked in from ${fixture.at?.map((metres) => metres.toFixed(1)).join(', ')}`];
  for (const push of pushes) {
    lines.push(pushLine(push, full));
    if (Math.abs(push.climb) > LEVEL_SLACK) {
      problems.push(`lab: touch: ${push.out} px out walked off level ground (${push.climb.toFixed(2)} m)`);
    }
    const faults = faultsOf(push, measured.filter((other) => other.out < push.out), travel, full);
    if (!push.planted) {
      problems.push(...faults);
      continue;
    }
    if (faults.length > 0) lines.push(`canary: caught (${faults[0]})`);
    else problems.push(`the canary went unseen: ${push.out} px out slid back to ${CANARY_BACK} px`);
  }
  if (options.canary) lines.push(await wallCanary(lab, options.fixture, start, outs, problems));
  return { text: lines.join('\n'), problems };
}
