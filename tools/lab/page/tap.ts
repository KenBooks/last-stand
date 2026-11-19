// The touch controls' skill buttons tapped and dragged (tools/lab `tap`, src/ui/touch.ts): every skill of the hero's
// class aimed by holding (`SkillDef.aimed`: Veilstep, Starfall, Quarry Mark, Strawman), its button pressed by a
// finger as a touch screen sends it, the other thumb on the move stick. Tapped, a movement skill (Veilstep) goes the
// way the move stick points, or the way the hero faces while he stands, never at a foe; any other is cast at the
// nearest foe. Each is tapped standing, tapped down and up between two frames (a slow phone's quick tap) and tapped
// while he walks. Pressed and dragged while the stick is held and moved between the drag's stops, the skill's own
// preview (its ring and column of light, its area, the foe it outlines) shows where the drag points and follows it,
// and let go, it is cast where the preview last showed, the hero walking on. No tap may open a tooltip. On main a
// tapped Veilstep went at the nearest foe, landing the mage among the foes, a held skill showed a plain ring where it
// aimed, not its preview, and a tap's click opened the skill's tooltip pinned over the buttons.
import * as THREE from 'three';
import { middleOf } from './lab';
import type { Fixture, Lab, PagePoint, Report } from './lab';
import type { Enemy } from '../../../src/entities/enemy';
import type { SkillKey } from '../../../src/types';
import type { InstantSkill } from '../../../src/combat/skills/types';
import { G } from '../../../src/state';
import { input } from '../../../src/core/input';
import { SKILL_KEYS } from '../../../src/loot/loadout';
import { outlinedLook } from '../../../src/ui/overlay/outline';
import { hideTooltip } from '../../../src/ui/tooltip';
import { inObstacle } from '../../../src/world/collision';
import { element, showTouchControls, slide } from './touchStick';

export interface TapOptions {
  fixture: Fixture;
  /** plant faults the checks must catch: a movement skill tapped with the stick let go and the hero turned to the
   *  foe, another skill tapped with its foe carried out of reach, each drag's last preview read before a frame showed
   *  it, its cast held against the stop before's preview, and the plain aim ring shown beside a skill's preview */
  canary: boolean;
}

/** where the hero stands, facing the arena's middle: off the dais, 15 m out, room on every side of him for a drag's
 *  aim (on the lab's own spot, 25 m out, a drag across the screen ran along the wall and its preview was held to it) */
const SPOT: [number, number] = [7, 13];
/** the fingers: a thumb on the move stick, the other on a skill's button */
const MOVE_FINGER = 0;
const SKILL_FINGER = 1;
/** how far the move stick's finger is slid (css px): past the stick's travel, a full push */
const PUSH = 90;
/** the frames the hero walks before a skill is tapped, a tap is held, and the frames after a finger is lifted */
const WALK_FRAMES = 10;
const TAP_FRAMES = 4;
const LIFT_FRAMES = 2;
/** the most frames a cast may take to come once let go, a dummy to rise; the frames walked on after a drag's cast */
const CAST_FRAMES = 120;
const RISE_FRAMES = 300;
const AFTER_FRAMES = 30;
/** how far from the hero a tap's foe may stand at his side, and a drag's foes along each stop's way, the nearest to
 *  the first that stands clear (m) */
const SIDE_FOES = [9, 8, 10, 7, 11];
const STOP_FOES = [12, 11, 13, 10, 14];
/** how far inside the arena's edge a foe stands, and clear of the props (m) */
const EDGE_BY = 1.5;
const FOE_ROOM = 1.2;
/** how far a canary carries a tap's foe on from his side (m): past every skill's reach */
const CARRIED = 40;
/** the drag's stops from the button (css px), and where the move stick's finger is slid from the pad's middle for
 *  each (it walks him left, then down and left, then down) */
const STOPS: PagePoint[] = [{ x: -70, y: -70 }, { x: -120, y: 10 }, { x: -20, y: -110 }];
const STOP_PUSHES: PagePoint[] = [{ x: -PUSH, y: 0 }, { x: -64, y: 64 }, { x: 0, y: PUSH }];
/** the frames each stop is held before its preview is read */
const STOP_FRAMES = 4;
/** how far a cast or a preview may point off its way (deg), and stand off its foe or spot (m) */
const WAY_SLACK = 3;
const FOE_SLACK = 0.5;
const SPOT_SLACK = 0.25;
/** a preview or a cast this near the hero has no way to read (m) */
const NO_WAY = 0.3;
/** the least push of a stick still held, and speed of a hero walking on (m/s) */
const HELD_PUSH = 0.9;
const WALKING = 1;
/** the plain ring the touch controls show where a skill cast on release is dragged to aim */
const PLAIN_RING = 'touch-aim-ring';
/** how long the browser may take to click a tapped button, ms of its own clock */
const CLICK_WAIT_MS = 500;

/** A skill aimed by holding, on the hero's bar. */
interface Aimed {
  key: SkillKey;
  name: string;
  impl: string;
  /** a movement skill (Veilstep): tapped, it goes the way the hero moves */
  movement: boolean;
}

/** A cast as the skill was given it: where the hero was and the point, on the floor, and the frame it came in (of
 *  those run since its finger lifted). */
interface Cast {
  from: THREE.Vector3;
  at: THREE.Vector3;
  frame: number;
  /** where the round's foe stood as it was cast (none: a round with no foe) */
  foe: THREE.Vector3 | null;
}

/** How a skill is tapped: the hero standing, down and up between two frames, or walking. */
type TapHow = 'standing' | 'at once' | 'moving';

/** A canary's fault planted in a tap: the stick let go and the hero turned to the foe just before it (a movement
 *  skill's), or the foe carried out of reach (any other's). */
type Planted = 'turned' | 'carried';

/** What a tap gave. */
interface Tapped {
  how: TapHow;
  planted: Planted | null;
  cast: Cast | null;
  /** the way it should go (a movement skill's: the stick's walking, his facing standing) */
  way: THREE.Vector3;
  /** where the foe stood as the finger lifted, which any other skill should be cast at, and how far it had come from
   *  where it rose (m) */
  foe: THREE.Vector3;
  drift: number;
  /** how far his facing was off the stick's way as it was tapped (walking; deg) */
  facingOff: number | null;
  /** a tooltip showed after the tap (the skill's, opened by the tap's click) */
  tooltip: boolean;
}

/** A drag's stop as it showed. */
interface Stop {
  /** the way the drag points on the floor */
  way: THREE.Vector3;
  /** where the preview showed (none: not shown), and how far off the drag's way from the hero (deg) */
  spot: THREE.Vector3 | null;
  off: number | null;
  /** how far the outlined foe stood from the one the drag points at (Quarry Mark's; m) */
  foeMiss: number | null;
  /** the plain aim ring shown too */
  ring: boolean;
  /** the hero's speed (m/s), and where he stood */
  speed: number;
  hero: THREE.Vector3;
}

/** What a drag gave: its stops, the cast as the finger lifted, and the stick and the hero after it. */
interface Dragged {
  stops: Stop[];
  /** with --canary: the last stop read before a frame showed it */
  stale: Stop | null;
  cast: Cast | null;
  push: number;
  speed: number;
}

/** A point's place on the floor (its height dropped). */
function flat(point: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3(point.x, 0, point.z);
}

/**
 * Where the preview mesh named `name` lies on the floor, or null while it isn't shown: the one drawn, every group
 * over it shown too. (The first of its name, shown itself, was another's in a hidden group once the village's rooms
 * came: Strawman's preview read 35 to 76° off the drag's way, and its cast 11.9 m from it, the game's as it was.)
 */
function meshSpot(name: string): () => THREE.Vector3 | null {
  return () => {
    let shown: THREE.Object3D | null = null;
    G.scene.traverseVisible((object) => {
      if (!shown && object.name === name) shown = object;
    });
    return shown ? flat((shown as THREE.Object3D).getWorldPosition(new THREE.Vector3())) : null;
  };
}

/** Where the foe Quarry Mark's preview outlines stands, or null while it outlines none. */
function outlinedSpot(): THREE.Vector3 | null {
  const look = outlinedLook();
  return look ? flat(look.root.getWorldPosition(new THREE.Vector3())) : null;
}

/** where each held skill's preview shows, by its `impl` */
const SPOTS: Record<string, () => THREE.Vector3 | null> = {
  blink: meshSpot('blink-preview'),
  starfall: meshSpot('starfall-preview'),
  strawman: meshSpot('strawman-preview-spot'),
  quarryMark: outlinedSpot,
};
/** the held skills whose preview is the foe they'd strike, outlined */
const OUTLINING = new Set(['quarryMark']);

/** The hero's skills aimed by holding, in his bar's order. */
function aimedSkills(): Aimed[] {
  const skills: Aimed[] = [];
  for (const key of SKILL_KEYS) {
    const def = G.player.skillAt(key)?.def;
    if (!def?.aimed) continue;
    skills.push({ key, name: def.name, impl: def.impl, movement: def.tags.includes('movement') });
  }
  return skills;
}

/** The camera's right along the floor (unit). */
function cameraRight(): THREE.Vector3 {
  return new THREE.Vector3().setFromMatrixColumn(G.camera.matrixWorld, 0).setY(0).normalize();
}

/** The screen's down laid on the floor, towards the camera (unit), from its right. */
function cameraDown(right: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3(-right.z, 0, right.x);
}

/** The way on the floor a move across the screen by `move` (css px) points, as the camera looks at the floor. */
function groundWay(move: PagePoint): THREE.Vector3 {
  const right = cameraRight();
  const down = cameraDown(right);
  return right.multiplyScalar(move.x).addScaledVector(down, move.y).normalize();
}

/** The move across the screen, `length` css px long, that points the way `way` on the floor. */
function screenMove(way: THREE.Vector3, length: number): PagePoint {
  const right = cameraRight();
  const down = cameraDown(right);
  const x = way.dot(right);
  const y = way.dot(down);
  const k = length / Math.hypot(x, y);
  return { x: x * k, y: y * k };
}

/** The way from `from` to `to` on the floor (unit), or null if they're too near for one. */
function wayTo(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3 | null {
  const way = flat(to).sub(flat(from));
  return way.length() < NO_WAY ? null : way.normalize();
}

/** The angle between two ways on the floor (deg). */
function degreesOff(a: THREE.Vector3, b: THREE.Vector3): number {
  return THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1)));
}

/** The way a facing points on the floor (unit). */
function facingWay(facing: number): THREE.Vector3 {
  return new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing));
}

/** When a cast came, as the report says it. */
function afterLift(cast: Cast): string {
  return `${cast.frame} frame${cast.frame === 1 ? '' : 's'} after the lift`;
}

/** A length as the report says it. */
function metres(length: number): string {
  return `${length.toFixed(2)} m`;
}

/** An angle as the report says it. */
function degrees(angle: number): string {
  return `${angle.toFixed(1)}°`;
}

/** The hero's speed over the floor (m/s). */
function heroSpeed(): number {
  return Math.hypot(G.player.vel.x, G.player.vel.z);
}

/** The hero's cooldowns over and his energy full: each cast as if it were the first. */
function ready(): void {
  G.player.cooldowns.clear();
  G.player.energy = G.player.stats.maxEnergy;
}

/** The hero set up on `SPOT` facing the arena's middle (as the fixture says, if it does), the touch controls shown. */
async function setUp(lab: Lab, fixture: Fixture): Promise<void> {
  const at = fixture.at ?? SPOT;
  const facing = fixture.facing ?? Math.atan2(-at[0], -at[1]);
  // (the top-down camera looking the way he faces, the arena's middle up the screen: turned as the boot left it, the
  // village's houses turned it, and the drags up the screen pointed out at the wall 2 m behind him, Strawman's preview
  // pushed along it 35 to 76° off their way; the camera looks along its yaw and a half turn)
  const yaw = fixture.yaw ?? facing - Math.PI;
  await lab.setup({ ...fixture, at, facing, yaw });
  await showTouchControls(lab);
  // (a tooltip a tap before opened, closed as the next tap anywhere closes it: left, it lay over the buttons)
  hideTooltip();
  ready();
}

/** Whether a foe would stand still on `spot`: inside the arena and clear of every prop. (Risen on one outside it or in
 *  a prop, a dummy was pushed in metres over its first frames: Quarry Mark, cast at it where it then stood, went
 *  8 m from where it stood as the finger lifted.) */
function standsClear(spot: THREE.Vector3): boolean {
  return Math.hypot(spot.x, spot.z) < G.arena.radius - EDGE_BY && !inObstacle(spot, FOE_ROOM);
}

/** The first spot along `way` from `from`, at each of `distances` in turn, that a foe stands clear on (else the
 *  first). */
function clearAlong(from: THREE.Vector3, way: THREE.Vector3, distances: number[]): THREE.Vector3 {
  const spots = distances.map((distance) => from.clone().addScaledVector(way, distance));
  return spots.find(standsClear) ?? spots[0];
}

/** The hero's side, his right or else his left, where a foe at his side stands clear (his right if neither). */
function sideClear(at: THREE.Vector3, facing: number): THREE.Vector3 {
  const right = new THREE.Vector3(Math.cos(facing), 0, -Math.sin(facing));
  const sides = [right, right.clone().negate()];
  return sides.find((side) => standsClear(clearAlong(flat(at), side, SIDE_FOES))) ?? right;
}

/** Training dummies risen on `spots` (they stand still). */
async function dummiesAt(lab: Lab, spots: THREE.Vector3[]): Promise<Enemy[]> {
  const foes = spots.map((spot) => lab.spawnFoe('dummy', spot));
  await lab.until(() => foes.every((foe) => foe.spawning <= 0), RISE_FRAMES, 'the dummies never rose');
  return foes;
}

/** The middle of the move pad. */
function padMiddle(): PagePoint {
  return middleOf(element('#touch-pad'));
}

/** The middle of the button of the skill on `key`, checked to be what a finger there touches. */
function buttonAt(key: SkillKey): PagePoint {
  const at = middleOf(element(`#touch-skills .tk-${key}`));
  const there = document.elementFromPoint(at.x, at.y);
  if (!there?.closest(`.tk-${key}`)) {
    const what = there ? `${there.tagName.toLowerCase()}#${there.id}.${[...there.classList].join('.')}` : 'nothing';
    throw new Error(`lab: tap: the ${key} button isn't under ${Math.round(at.x)},${Math.round(at.y)}, ${what} is `
      + '(the touch controls show in a run)');
  }
  return at;
}

/** A point moved by `move` (css px). */
function moved(at: PagePoint, move: PagePoint): PagePoint {
  return { x: at.x + move.x, y: at.y + move.y };
}

/** The casts of a skill watched: each as it came, the frames run since its finger lifted, and the watch's end. */
interface Watch {
  casts: Cast[];
  frames: number;
  stop: () => void;
}

/** Every cast of the skill on `key` by the hero from now on, until `stop` (the skill's `cast` wrapped); `foe` the
 *  round's foe, if it has one. */
function watchCasts(key: SkillKey, foe: Enemy | null = null): Watch {
  const impl = G.player.skillAt(key)!.impl as InstantSkill;
  const cast = impl.cast;
  const watch: Watch = {
    casts: [],
    frames: 0,
    stop: () => {
      impl.cast = cast;
    },
  };
  impl.cast = (player, def, target, power) => {
    if (player === G.player) {
      const at = { from: flat(player.pos), at: flat(target), frame: watch.frames, foe: foe && flat(foe.pos) };
      watch.casts.push(at);
    }
    cast.call(impl, player, def, target, power);
  };
  return watch;
}

/**
 * Frames run, from the finger's lift, until the first cast `watch` sees comes, at most `CAST_FRAMES`, and then until
 * the hero is free again (a blink's dash over: set up while he crossed, he was carried off his spot); the cast, or
 * null if none came.
 */
async function firstCast(lab: Lab, watch: Watch): Promise<Cast | null> {
  for (watch.frames = 0; watch.frames < CAST_FRAMES && watch.casts.length === 0;) {
    watch.frames++;
    await lab.step(1);
  }
  const free = () => !G.player.dash && !G.player.casting;
  await lab.until(free, CAST_FRAMES, 'the hero never came free of the cast');
  return watch.casts[0] ?? null;
}

/**
 * Whether the browser clicks the element `selector` names within `CLICK_WAIT_MS` (a tap's click, which it sends after
 * the finger's lift), resolved once every listener of it has run.
 */
function clickOn(selector: string): Promise<boolean> {
  return new Promise((resolve) => {
    const heard = (event: Event) => {
      if ((event.target as Element).closest?.(selector)) finish(true);
    };
    const timer = setTimeout(() => finish(false), CLICK_WAIT_MS);
    const finish = (clicked: boolean) => {
      clearTimeout(timer);
      window.removeEventListener('click', heard, true);
      setTimeout(() => resolve(clicked), 0);
    };
    window.addEventListener('click', heard, true);
  });
}

/** Whether a tooltip shows. */
function tooltipShown(): boolean {
  return !element('#tooltip').classList.contains('hidden');
}

/**
 * The finger on the skill's button: put down, held `TAP_FRAMES` (none: down and up between two frames), lifted, and
 * the browser's click of it waited for; whether a tooltip showed after it.
 */
async function tapButton(lab: Lab, key: SkillKey, how: TapHow): Promise<boolean> {
  const button = buttonAt(key);
  const clicked = clickOn(`.tk-${key}`);
  await lab.touchDown(button, SKILL_FINGER);
  if (how !== 'at once') await lab.step(TAP_FRAMES);
  await lab.touchUp(SKILL_FINGER);
  await clicked;
  return tooltipShown();
}

/**
 * One tap of `skill`, from a fresh set-up with a dummy at the hero's side: standing, at once, or walking away from
 * the dummy across the way he faces (so the stick's way, his facing and the foe all lie apart).
 */
async function tapped(lab: Lab, fixture: Fixture, skill: Aimed, how: TapHow, planted: Planted | null):
  Promise<Tapped> {
  await setUp(lab, fixture);
  const hero = G.player;
  const side = sideClear(hero.pos, hero.facing);
  const [dummy] = await dummiesAt(lab, [clearAlong(flat(hero.pos), side, SIDE_FOES)]);
  const risen = flat(dummy.pos);
  ready();
  const walking = how === 'moving';
  let way = facingWay(hero.facing);
  if (walking) {
    const start = padMiddle();
    const push = screenMove(side.clone().negate(), PUSH);
    await lab.touchDown(start, MOVE_FINGER);
    await slide(lab, start, moved(start, push), MOVE_FINGER);
    await lab.step(WALK_FRAMES);
    way = groundWay(push);
  }
  const facingOff = walking ? degreesOff(facingWay(hero.facing), way) : null;
  if (planted === 'turned') {
    if (walking) await lab.touchUp(MOVE_FINGER);
    hero.facing = Math.atan2(dummy.pos.x - hero.pos.x, dummy.pos.z - hero.pos.z);
  }
  // (where it stood as the finger lifted, which the tap aims at: the canary's, before it was carried off)
  let foe = flat(dummy.pos);
  const watch = watchCasts(skill.key, dummy);
  let cast: Cast | null;
  let tooltip: boolean;
  try {
    if (planted === 'carried') dummy.pos.addScaledVector(side, CARRIED);
    tooltip = await tapButton(lab, skill.key, how);
    if (planted !== 'carried') foe = flat(dummy.pos);
    cast = await firstCast(lab, watch);
  } finally {
    watch.stop();
  }
  if (walking && planted !== 'turned') await lab.touchUp(MOVE_FINGER);
  await lab.step(LIFT_FRAMES);
  return { how, planted, cast, way, foe, drift: risen.distanceTo(foe), facingOff, tooltip };
}

/** What's wrong with a tap: its tooltip opened, never cast, a movement skill off its way, any other off its foe. */
function tapFaults(skill: Aimed, tap: Tapped): string[] {
  const faults = tap.tooltip ? ['its tooltip opened over the buttons'] : [];
  return [...faults, ...castOffFaults(skill, tap)];
}

/** What's wrong with a tap's cast: none, a movement skill's off its way, any other's off its foe. */
function castOffFaults(skill: Aimed, tap: Tapped): string[] {
  if (!tap.cast) return ['never cast'];
  if (!skill.movement) {
    const miss = tap.cast.at.distanceTo(tap.foe);
    return miss > FOE_SLACK ? [`cast ${metres(miss)} from the foe`] : [];
  }
  const way = wayTo(tap.cast.from, tap.cast.at);
  if (!way) return ['cast at his feet'];
  const off = degreesOff(way, tap.way);
  return off > WAY_SLACK ? [`went ${degrees(off)} off ${wayName(tap.how)}`] : [];
}

/** The way a movement skill tapped `how` should go, as the report names it. */
function wayName(how: TapHow): string {
  return how === 'moving' ? 'the stick\'s way' : 'the way he faces';
}

/** A tap as a line of the report. */
function tapLine(skill: Aimed, tap: Tapped): string {
  const name = `${tap.how}${tap.planted ? ` (canary: ${tap.planted})` : ''}`;
  if (!tap.cast) return `  tapped ${name}: never cast`;
  const way = wayTo(tap.cast.from, tap.cast.at);
  const far = metres(tap.cast.from.distanceTo(tap.cast.at));
  const toFoe = metres(tap.cast.at.distanceTo(tap.foe));
  const off = way ? `${degrees(degreesOff(way, tap.way))} off ${wayName(tap.how)}` : 'at his feet';
  const facing = tap.facingOff === null ? '' : `, he faced ${degrees(tap.facingOff)} off the stick's way`;
  const what = skill.movement ? `${far} out, ${off}, ${toFoe} from the foe` : `${toFoe} from the foe, ${far} out`;
  const tooltip = tap.tooltip ? ', its tooltip opened' : '';
  const later = tap.cast.foe ? tap.cast.foe.distanceTo(tap.foe) : 0;
  const moving = later > FOE_SLACK ? ` (as it was cast, the foe ${metres(later)} on from where it was)` : '';
  const drift = tap.drift > FOE_SLACK ? ` (the foe came ${metres(tap.drift)} from where it rose)` : '';
  const after = afterLift(tap.cast);
  return `  tapped ${name}: cast ${what}, ${after}${facing}${tooltip}${drift}${moving}`;
}

/** The drag's stop as it shows now: the preview against the way the drag points (and Quarry Mark's foe there). */
function readStop(skill: Aimed, way: THREE.Vector3, foe: Enemy | undefined): Stop {
  const spot = SPOTS[skill.impl]?.() ?? null;
  const shown = spot && wayTo(G.player.pos, spot);
  return {
    way,
    spot,
    off: shown ? degreesOff(shown, way) : null,
    foeMiss: spot && foe ? spot.distanceTo(flat(foe.pos)) : null,
    ring: G.scene.getObjectByName(PLAIN_RING)?.visible ?? false,
    speed: heroSpeed(),
    hero: flat(G.player.pos),
  };
}

/**
 * One drag of `skill`, from a fresh set-up: the stick held and slid to a new way at each stop, the skill's finger
 * dragged from its button to each stop and held there, each stop's preview read; then the skill's finger lifted with
 * the stick still held. Quarry Mark's drag has a dummy along each stop's way, which its outline must be round.
 */
async function dragged(lab: Lab, fixture: Fixture, skill: Aimed, canary: boolean): Promise<Dragged> {
  await setUp(lab, fixture);
  const start = flat(G.player.pos);
  const ways = STOPS.map(groundWay);
  const spots = ways.map((way) => clearAlong(start, way, STOP_FOES));
  const foes = OUTLINING.has(skill.impl) ? await dummiesAt(lab, spots) : [];
  ready();
  const pad = padMiddle();
  const button = buttonAt(skill.key);
  const watch = watchCasts(skill.key);
  const stops: Stop[] = [];
  let stale: Stop | null = null;
  let cast: Cast | null;
  try {
    await lab.touchDown(pad, MOVE_FINGER);
    await lab.touchDown(button, SKILL_FINGER);
    let stick = pad;
    let finger = button;
    for (let index = 0; index < STOPS.length; index++) {
      await slide(lab, stick, moved(pad, STOP_PUSHES[index]), MOVE_FINGER);
      stick = moved(pad, STOP_PUSHES[index]);
      await slide(lab, finger, moved(button, STOPS[index]), SKILL_FINGER);
      finger = moved(button, STOPS[index]);
      if (canary && index === STOPS.length - 1) stale = readStop(skill, ways[index], foes[index]);
      await lab.step(STOP_FRAMES);
      stops.push(readStop(skill, ways[index], foes[index]));
    }
    await lab.touchUp(SKILL_FINGER);
    cast = await firstCast(lab, watch);
  } finally {
    watch.stop();
  }
  await lab.step(AFTER_FRAMES);
  const push = Math.hypot(input.stick.x, input.stick.y);
  const speed = heroSpeed();
  await lab.touchUp(MOVE_FINGER);
  await lab.step(LIFT_FRAMES);
  return { stops, stale, cast, push, speed };
}

/** What's wrong with a stop: no preview, Quarry Mark's outline off the foe the drag points at, a spot off its way,
 *  the plain ring shown beside it. */
function stopFaults(skill: Aimed, stop: Stop): string[] {
  const faults: string[] = [];
  if (stop.ring) faults.push('the plain aim ring shown beside its own preview');
  if (!stop.spot) return [...faults, 'no preview'];
  if (OUTLINING.has(skill.impl)) {
    if (stop.foeMiss === null || stop.foeMiss > FOE_SLACK) {
      faults.push(`outlined a foe ${metres(stop.foeMiss ?? Infinity)} from the one the drag points at`);
    }
  } else if (stop.off === null) faults.push('the preview at his feet');
  else if (stop.off > WAY_SLACK) faults.push(`the preview ${degrees(stop.off)} off the drag's way`);
  return faults;
}

/** What's wrong with a drag's cast against the preview `last` showed, and the stick and the hero after it. */
function castFaults(drag: Dragged, last: Stop | undefined): string[] {
  const faults: string[] = [];
  if (!drag.cast) faults.push('never cast as the finger lifted');
  else if (!last?.spot) faults.push('cast with no preview to cast at');
  else {
    const miss = drag.cast.at.distanceTo(last.spot);
    if (miss > SPOT_SLACK) faults.push(`cast ${metres(miss)} from where the preview last showed`);
  }
  if (drag.push < HELD_PUSH) faults.push(`the move stick let go with it (pushed ${drag.push.toFixed(2)})`);
  if (drag.speed < WALKING) faults.push(`the hero stopped walking (${drag.speed.toFixed(2)} m/s)`);
  return faults;
}

/** A stop as a line of the report. */
function stopLine(index: number, stop: Stop): string {
  const drag = STOPS[index];
  const where = `  dragged to ${drag.x},${drag.y} px`;
  const walking = `walking ${stop.speed.toFixed(2)} m/s`;
  if (!stop.spot) return `${where}: no preview, ${walking}`;
  const at = (point: THREE.Vector3): string => `${point.x.toFixed(2)},${point.z.toFixed(2)}`;
  // (off its way, where it and he stood: a prop it was pushed out of is read off the arena's)
  const where2 = stop.off !== null && stop.off > WAY_SLACK ? ` (at ${at(stop.spot)}, he at ${at(stop.hero)})` : '';
  const off = stop.off === null ? 'at his feet' : `${degrees(stop.off)} off the drag's way${where2}`;
  const foe = stop.foeMiss === null ? '' : `, ${metres(stop.foeMiss)} from the foe there`;
  const ring = stop.ring ? ', the plain ring shown too' : '';
  return `${where}: previewed ${off}${foe}${ring}, ${walking}`;
}

/** The drag's cast as a line of the report. */
function castLine(drag: Dragged, last: Stop | undefined): string {
  const after = `then the stick pushed ${drag.push.toFixed(2)}, walking ${drag.speed.toFixed(2)} m/s`;
  if (!drag.cast) return `  let go: never cast, ${after}`;
  const from = last?.spot ? `${metres(drag.cast.at.distanceTo(last.spot))} from where the preview last showed`
    : 'no preview before it';
  return `  let go: cast ${from}, ${afterLift(drag.cast)}, ${after}`;
}

/** The checks' report: its lines, its problems, and the canaries each caught or missed. */
interface Checks {
  lines: string[];
  problems: string[];
}

/** The round `run`, its error (if it throws) saying which round it was. */
async function named<T>(round: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw new Error(`${round}: ${(error as Error).message}`);
  }
}

/** A canary's faults: caught if there are any, a problem if there are none. */
function canary(checks: Checks, what: string, faults: string[]): void {
  if (faults.length > 0) checks.lines.push(`  canary, ${what}: caught (${faults[0]})`);
  else checks.problems.push(`the canary went unseen: ${what}`);
}

/** Every tap of `skill` and its drag, with --canary the faults planted in them. */
async function skillRounds(lab: Lab, options: TapOptions, skill: Aimed, checks: Checks, planted: Planted | null):
  Promise<void> {
  const say = (what: string) => checks.problems.push(`${skill.name}: ${what}`);
  const kind = skill.movement ? 'a movement skill: tapped, the way he moves' : 'tapped, at the nearest foe';
  checks.lines.push(`${skill.name} (${skill.key}), ${kind}:`);
  for (const how of ['standing', 'at once', 'moving'] as TapHow[]) {
    const tap = await named(`${skill.name} tapped ${how}`, () => tapped(lab, options.fixture, skill, how, null));
    checks.lines.push(tapLine(skill, tap));
    for (const fault of tapFaults(skill, tap)) say(`tapped ${how}: ${fault}`);
  }
  if (planted) {
    const how = planted === 'turned' ? 'moving' : 'standing';
    const tap = await named(`${skill.name}'s canary`, () => tapped(lab, options.fixture, skill, how, planted));
    checks.lines.push(tapLine(skill, tap));
    const what = planted === 'turned' ? 'the stick let go and the hero turned to the foe before a tap'
      : 'the foe carried out of reach before a tap';
    canary(checks, what, castOffFaults(skill, tap));
  }
  const drag = await named(`${skill.name} dragged`, () => dragged(lab, options.fixture, skill, options.canary));
  drag.stops.forEach((stop, index) => {
    checks.lines.push(stopLine(index, stop));
    for (const fault of stopFaults(skill, stop)) say(`dragged, stop ${index + 1}: ${fault}`);
  });
  const last = drag.stops[drag.stops.length - 1];
  checks.lines.push(castLine(drag, last));
  for (const fault of castFaults(drag, last)) say(`dragged: ${fault}`);
  if (!options.canary) return;
  if (drag.stale) {
    canary(checks, `${skill.name}'s last stop read before a frame showed it`, stopFaults(skill, drag.stale));
  }
  const before = drag.stops[drag.stops.length - 2];
  canary(checks, `${skill.name}'s cast held against the stop before's preview`, castFaults(drag, before));
  canary(checks, `the plain aim ring read as shown beside ${skill.name}'s preview`,
    stopFaults(skill, { ...drag.stops[0], ring: true }));
}

/**
 * `lab tap`: every skill of the hero's class aimed by holding, tapped and dragged on the touch controls; a problem for
 * each check failed and each canary missed. A class with none (the warrior) is a problem.
 */
export async function tap(lab: Lab, options: TapOptions): Promise<Report> {
  await setUp(lab, options.fixture);
  const skills = aimedSkills();
  if (skills.length === 0) {
    return { text: '', problems: [`the ${G.player.cls.id} has no skill aimed by holding (--class mage, ranger)`] };
  }
  const checks: Checks = { lines: [], problems: [] };
  const firstMovement = skills.find((skill) => skill.movement);
  const firstOther = skills.find((skill) => !skill.movement);
  for (const skill of skills) {
    let planted: Planted | null = null;
    if (options.canary && skill === firstMovement) planted = 'turned';
    if (options.canary && skill === firstOther) planted = 'carried';
    await skillRounds(lab, options, skill, checks, planted);
  }
  return { text: checks.lines.join('\n'), problems: checks.problems };
}
