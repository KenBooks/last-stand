// tools/lab `hall`: the hero in focus in the hall of heroes (src/game/hall.ts) showing off his skill and standing after
// it, frame by frame: each hand, elbow and the weapon's tip in his own frame, and where one of them jerks, its move a
// frame changing by more than `JERK_FROM` from the frame before (a jump, a stop or a start in a frame), or by more
// than `JERK_FLYING` while the weapon flies (a blow speeding down and coming to rest). From play: "warrior arms jerk in
// various poses after he finishes power strike, in char selection screen ... like an introvert on public speech".
// The hall's heroes are remote copies, posed from what their game reports, beside the lobby's own hero, hidden but
// still posed, so the lobby hero's measures (`range`) never saw them. The canary turns his right shoulder for a frame.
// Then the hall is opened again and left as his showcase is under way, and any sound it leaves playing is a problem
// (from play: "if mage was attacking in hall of heroes, going back to lobby keeps the attack sound"); its canary
// starts Void Lance's hum there and never stops it.
import * as THREE from 'three';
import { G } from '../../../src/state';
import * as hall from '../../../src/game/hall';
import { sfx } from '../../../src/core/audio';
import { makeItem } from '../../../src/loot/items';
import type { WeaponStyle } from '../../../src/loot/loadout';
import type { Model } from '../../../src/types';
import { realWait, type Lab, type Report } from './lab';
import { ABANDON_HOLD_MS } from '../../../src/ui/menus';
import { OpenTones } from './soundsLeft';

/** What `lab hall` takes. */
export interface HallOptions {
  /** the way the hero holds his weapons in the hall (his profile's gear by default), and its base */
  gear?: WeaponStyle;
  weapon?: string;
  /** list every frame a point jerked */
  frames?: boolean;
  canary?: boolean;
}

/** the points followed: the joint (or the weapon's tip) each is */
const POINTS = ['handR', 'handL', 'elbowR', 'elbowL', 'tip'] as const;
type PointName = (typeof POINTS)[number];

/** a point's move a frame changing by this much from the frame before is a jerk (m): a quick reach's (Power Strike's
 *  left hand onto the haft, up to 11 cm a frame) is within it, the way back into the guard stopping dead (its tip 15 cm
 *  a frame to none) isn't */
const JERK_FROM = 0.12;
/** and while the weapon flies, its tip `FLYING` or more a frame this frame or either of the two before (m): a blow's
 *  own speeding down and coming to rest (Power Strike's tip 98 cm a frame, its hands' moves changing by up to 21 cm)
 *  within it, the first frame of its hold turned 65 degrees down about the shoulder (the hands 84 cm) not */
const JERK_FLYING = 0.4;
const FLYING = 0.25;
/** the weapon's tip, far out from the shoulder, turns its way as it swings round by about its speed squared over its
 *  reach: its bar is this share of its larger move of the two (and at least `TIP_FROM`, m: a greatsword's tip leaving
 *  the top of Power Strike's raise, 6 to 24 cm a frame, its hands smooth). Held to the hands', a swing's arc at 1 m a
 *  frame read as a 50 cm jerk on every frame of it */
const TIP_SHARE = 0.7;
const TIP_FROM = 0.2;
/** frames run once the hall is up: the camera's flight in, his showcase (due 0.8 s after) and 5 s after it */
const FRAMES = 480;
/** frames run for the run the set-up held to give way to the lobby, and for the lobby to settle */
const LOBBY_FRAMES = 300;
/** frames waited for the hall to open (it opens once its heroes are warm, `whenWarm`) */
const OPEN_FRAMES = 600;
/** the canary's frame (after the showcase's blow), and how far it turns the right shoulder (rad) */
const CANARY_FRAME = 260;
const CANARY_TURN = 0.5;
/** frames into his showcase the hall is left at (Void Lance's beam is out by then), and frames run in the lobby
 *  after, for what was stopped to have stopped */
const LEAVE_AT = 60;
const AFTER_LEAVING = 60;

/** One point's place over the last three frames, its jerks, the worst and where, and each, as words. */
interface Followed {
  name: PointName;
  places: THREE.Vector3[];
  frames: number;
  worst: number;
  worstAt: string;
  listed: string[];
}

/** A frame as the report names it: its number, the showcase's time, and the action the model was given. */
interface FrameName {
  frame: number;
  since: string;
  acting: string;
}

const cm = (metres: number): string => (metres * 100).toFixed(1);

/** The lobby's hero's weapon (as `--gear` and `--weapon` set it) in his profile, which the hall dresses him from: a
 *  two-hander with nothing in the other hand. */
function holdInProfile(): void {
  const base = G.player.gear.weapon;
  const equipped = { ...G.profile.equipped };
  if (base) equipped.weapon = { ...makeItem({ slot: 'weapon', cls: G.player.cls }), base, name: base };
  if (G.player.gear.twoHanded) delete equipped.offhand;
  G.profile.equipped = equipped;
}

/** The run the set-up held in its countdown abandoned from the pause menu, back to the lobby (Change hero is the
 *  lobby's): Abandon run held as a player holds it (a click alone only says to hold: `poses --lobby` clicked and never
 *  left the run), and the summary, if it shows, left by its button. */
export async function toLobby(lab: Lab): Promise<void> {
  await lab.step(1, () => ({ keys: ['escape'] }));
  const abandon = document.getElementById('btn-abandon');
  if (!abandon) throw new Error('lab: hall: no pause menu to leave the run by');
  await holdDown(lab, abandon, ABANDON_HOLD_MS + HOLD_SLACK_MS);
  const summary = document.getElementById('summary');
  if (summary && !summary.classList.contains('hidden')) await lab.clickOn(document.getElementById('btn-summary')!);
  await lab.until(() => G.mode === 'menu', LOBBY_FRAMES, 'hall: the run giving way to the lobby');
  await lab.step(LOBBY_FRAMES);
}

/** how much longer than its hold a held button is held (ms): its timer runs on the browser's clock */
const HOLD_SLACK_MS = 300;

/** `element` pressed at its middle with the mouse's left button and held for `ms` of the browser's clock. */
async function holdDown(lab: Lab, element: Element, ms: number): Promise<void> {
  const box = element.getBoundingClientRect();
  const at = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  await lab.mouseDown(at);
  await realWait(ms);
  await lab.mouseUp(at);
}

/** The hall opened from the lobby (Change hero), waited for until it's up. */
export async function openHall(lab: Lab): Promise<boolean> {
  const button = document.getElementById('btn-hero');
  if (!button) return false;
  await lab.clickOn(button);
  await lab.until(() => hall.hallOpen(), OPEN_FRAMES, 'hall: the hall to open');
  return true;
}

/** The hall left by its Back button, for the lobby. */
async function leaveHall(lab: Lab): Promise<void> {
  const back = document.querySelector<HTMLElement>('.hs-back');
  if (!back) throw new Error('lab: hall: no Back button to leave the hall by');
  await lab.clickOn(back);
  await lab.until(() => !hall.hallOpen(), OPEN_FRAMES, 'hall: the hall to close');
}

/** What leaving the hall as his showcase is under way left playing. */
interface Leaving {
  /** the tones sounding as it was left, and those still sounding after */
  sounding: number;
  left: number;
  canary: boolean;
}

/** The hall opened again (his showcase due again, its time since the last gone by), left `LEAVE_AT` frames into
 *  his showcase, and the tones it left sounding read `AFTER_LEAVING` frames on (`canary`: Void Lance's hum started
 *  as it's left, never stopped). */
async function leaveMidShowcase(lab: Lab, canary: boolean): Promise<Leaving> {
  await leaveHall(lab);
  // (a second in the lobby: his showcase is shown again once 6 s have gone by since the last)
  await lab.step(AFTER_LEAVING);
  const tones = new OpenTones();
  try {
    await openHall(lab);
    const hero = hall.hallHeroes()[hall.hallFocus()];
    await lab.until(() => !!hero?.cast, OPEN_FRAMES, 'hall: his showcase, again');
    await lab.step(LEAVE_AT);
    if (canary) sfx.lance();
    const sounding = tones.sounding();
    await leaveHall(lab);
    await lab.step(AFTER_LEAVING);
    return { sounding, left: tones.sounding(), canary };
  } finally {
    tones.remove();
  }
}

/** Where point `name` of `model` is, in his own frame. */
function placeOf(model: Model, name: PointName, out: THREE.Vector3): THREE.Vector3 {
  const object = name === 'tip' ? model.tip : model.joints?.[name];
  if (!object) return out.set(0, 0, 0);
  object.getWorldPosition(out);
  return model.root.worldToLocal(out);
}

/** How far `point` moved this frame, the frame before and the one before that (m), its places not yet moved on. */
function movesOf(point: Followed, now: THREE.Vector3): number[] {
  const [last, before, older] = point.places;
  return [now.distanceTo(last), last.distanceTo(before), before.distanceTo(older)];
}

/** Notes where `point` is this frame, and its jerk if it jerked (`judged`: the frame counts; `bar`: past it a jerk). */
function follow(
  point: Followed, now: THREE.Vector3, at: FrameName, judged: boolean, bar: number, listing: boolean,
): number {
  const [last, before, older] = point.places;
  const move = new THREE.Vector3().subVectors(now, last);
  const lastMove = new THREE.Vector3().subVectors(last, before);
  const jerk = move.distanceTo(lastMove);
  older.copy(before);
  before.copy(last);
  last.copy(now);
  if (!judged || jerk <= bar) return jerk;
  point.frames++;
  if (listing) {
    const moved = `moved ${cm(move.length())} cm, ${cm(lastMove.length())} the frame before`;
    point.listed.push(`  frame ${at.frame} (${at.since}, ${at.acting}): ${point.name} ${cm(jerk)} cm (${moved})`);
  }
  if (jerk > point.worst) {
    point.worst = jerk;
    point.worstAt = `frame ${at.frame}, ${at.since}`;
  }
  return jerk;
}

/** Runs `lab hall`. */
export async function hallMoves(lab: Lab, options: HallOptions): Promise<Report> {
  await lab.setup({ at: [14, 17], facing: 0, gear: options.gear, weapon: options.weapon });
  // (the hall shows the hero in his profile's gear, not the lobby's hero's: his weapon put in his hand there)
  if (options.gear) holdInProfile();
  await toLobby(lab);
  if (!(await openHall(lab))) return { text: 'no hero selection screen in this tree', problems: [] };
  const hero = hall.hallHeroes()[hall.hallFocus()];
  if (!hero) throw new Error('lab: hall: no hero in focus');
  const model = hero.player.model;
  // (each frame's action as the model is given it, for the frames listed)
  let acting = 'no action';
  const animate = model.animate;
  model.animate = (state) => {
    acting = state.action ? `${state.action.name} ${state.action.t.toFixed(2)}` : 'no action';
    animate(state);
  };
  const points: Followed[] = POINTS.map((name) => ({
    name, places: [0, 1, 2].map(() => new THREE.Vector3()), frames: 0, worst: 0, worstAt: '', listed: [],
  }));
  const now = new THREE.Vector3();
  let frame = 0;
  let shownAt = -1;
  let canaryJerk: number | null = null;
  await lab.step(FRAMES, undefined, () => {
    if (shownAt < 0 && hero.cast) shownAt = frame;
    const planted = !!options.canary && frame === CANARY_FRAME;
    if (planted) model.joints!.shoulderR.rotateX(CANARY_TURN);
    model.root.updateMatrixWorld(true);
    const since = shownAt < 0 ? 'before his showcase' : `${((frame - shownAt) / 60).toFixed(2)} s into his showcase`;
    // (the canary's frame and the two after it are its own: its point's move there is the canary's)
    const judged = frame >= 3 && !(options.canary && frame >= CANARY_FRAME && frame <= CANARY_FRAME + 2);
    const tip = points.find((point) => point.name === 'tip')!;
    const tipMoves = movesOf(tip, placeOf(model, 'tip', now));
    const flying = tipMoves.some((moved) => moved >= FLYING);
    const armBar = flying ? JERK_FLYING : JERK_FROM;
    // (and as the weapon flies, no less than the arms': its blow coming to rest on the floor stops it hard)
    const tipBar = Math.max(flying ? JERK_FLYING : TIP_FROM, TIP_SHARE * Math.max(tipMoves[0], tipMoves[1]));
    for (const point of points) {
      const named = { frame, since, acting };
      const bar = point === tip ? tipBar : armBar;
      const jerk = follow(point, placeOf(model, point.name, now), named, judged, bar, !!options.frames);
      if (planted && point.name === 'handR') canaryJerk = jerk;
    }
    if (planted) model.joints!.shoulderR.rotateX(-CANARY_TURN);
    frame++;
  });
  model.animate = animate;
  if (shownAt < 0) throw new Error('lab: hall: the hero never showed off his skill');
  const report = reportOf(hero.id, hero.player.gear.weapon, shownAt, points, canaryJerk);
  const leaving = leavingReport(await leaveMidShowcase(lab, !!options.canary));
  return { text: `${report.text}\n${leaving.text}`, problems: [...report.problems, ...leaving.problems] };
}

/** The lines and problems of leaving the hall mid-showcase. */
function leavingReport(leaving: Leaving): Report {
  const left = `${leaving.left} of the ${leaving.sounding} tones sounding as it was left still sounding`;
  const text = [`left ${(LEAVE_AT / 60).toFixed(2)} s into his showcase: ${left} ${AFTER_LEAVING} frames on`];
  const problems: string[] = [];
  if (leaving.canary) {
    const caught = leaving.left > 0;
    text.push(`canary, Void Lance's hum never stopped: ${caught ? 'caught' : 'MISSED'}`);
    if (!caught) problems.push('hall: the canary (a hum never stopped) was missed');
  } else if (leaving.left > 0) {
    problems.push(`hall: leaving it mid-showcase left ${leaving.left} tones sounding in the lobby`);
  }
  return { text: text.join('\n'), problems };
}

/** The report: each point's jerks, the frames listed, and the canary. */
function reportOf(
  id: string, weapon: string | null, shownAt: number, points: Followed[], canaryJerk: number | null,
): Report {
  const held = weapon ?? 'no weapon';
  const text = [`the ${id} in focus with ${held}, his showcase from frame ${shownAt}, ${FRAMES} frames`];
  const problems: string[] = [];
  for (const point of points) {
    if (!point.frames) {
      const bars = point.name === 'tip'
        ? `${cm(TIP_FROM)} cm, or ${TIP_SHARE} of its move`
        : `${cm(JERK_FROM)} cm, ${cm(JERK_FLYING)} as the weapon flies`;
      text.push(`  ${point.name}: no jerk over ${bars}`);
      continue;
    }
    const worst = `the worst ${cm(point.worst)} cm (${point.worstAt})`;
    text.push(`  ${point.name}: jerked on ${point.frames} frames, ${worst}`);
    problems.push(`hall: the ${point.name} jerked on ${point.frames} frames, ${worst}`);
  }
  for (const point of points) text.push(...point.listed);
  if (canaryJerk !== null) {
    const caught = canaryJerk > JERK_FROM;
    text.push(`canary, the right shoulder turned for a frame: ${caught ? 'caught' : 'MISSED'} (${cm(canaryJerk)} cm)`);
    if (!caught) problems.push('hall: the canary (the right shoulder turned for a frame) was missed');
  }
  return { text: text.join('\n'), problems };
}
