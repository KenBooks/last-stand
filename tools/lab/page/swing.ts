// tools/lab swing: a swing through the eyes keyed from a pose (src/entities/viewSwing.ts). A pose is decided as a
// person holds it, the grip's place and the weapon's way as the eyes see them, and this gives the swing's key that
// holds it and what of it an arm swung in that swing's plane can't hold: the grip off the plane, the weapon's way off
// it, a wrist bent past its range, a grip past the arm's reach. Each key of the swing, or one given, is placed too: the
// grip, the weapon, the elbow and the wrist, and a two-hander's lower grip with how far it is from the other shoulder.
// (Keyed by its numbers alone, by trying them in a cast and reading the frames, a two-handed forehand took an hour of
// tries and its wind-up still put the lower grip 12 cm past the left arm's reach.) The canary keys the swing's blow
// from where its own key places it, which must come back as that key, and a grip moved 10 cm off the plane, which
// must be read 10 cm off. `--turn` turns it all with the trunk, as a cut turns it, and `--trunk` each key as far as
// the cut turns it at its share, to see a key as the eyes do (a two-handed cut's end read 64% in the frame by its key
// alone, and 0% as the eyes saw it turned 40 degrees left). Each of a swing's keys is placed in the plane the swing has
// at its share, a cut in a row's first ones in the plane it turns from (placed in its own, a backhand's first key read
// its lower grip 0.98 m from the left shoulder where the game drew it at the forehand's end, 0.39), and a cut taken on
// from another's end is placed at its start where that one left the arm, or said not to be. A two-hander's grips are
// measured from the hero's own shoulders, a held swing's (`ViewSwing.holds`) from those its guard puts, not the point
// its plane turns about. `all` steps every swing the hero's weapons are swung with as he holds them, each turned as
// the game turns it, so a check reads them all.
import * as THREE from 'three';
import { basesHeld, type Lab, type Fixture, type Report } from './lab';
import { armsLens } from './inFrame';
import { triple } from './keyed';
import { seenAlong, weaponSpan } from './cuts';
import { describePath, pathJumps, pathShares, plantedFlip, PATH_STEPS, type PathStep } from './swingPath';
import * as viewSwing from '../../../src/entities/viewSwing';
import {
  swingAt, swingKeyAt, swingKeyFor, swingShoulder, swingShoulderAt, turnWithTrunk, type ArmBones, type SwingKey,
  type SwingKeyFit, type ViewSwing,
} from '../../../src/entities/viewSwing';
import {
  CUT_TURN, DUAL_CUT_TURN, SWINGS_NAMED, TWO_CUT_TURN, TWO_REST, twoRestOf,
} from '../../../src/entities/models/warriorEyes';
import { weaponStyle } from '../../../src/loot/loadout';
import type { WeaponStyle } from '../../../src/types';

/** A cut the trunk turns: a forehand from rest, one in a row, or a backhand (in a row, turned the other way); or the
 *  way back to the guard after a forehand or a backhand. */
type Trunk = 'rest' | 'row' | 'back' | 'foreOut' | 'backOut';

export interface SwingOptions {
  fixture: Fixture;
  /** the swing, by its name in `SWINGS_NAMED` (oneFore, oneBack, twoRest, twoFore, twoBack...), or `all` */
  swing: string;
  /** poses to key: the grip's place and the weapon's way in the view (camera space: m, x right, y up, -z ahead), three
   *  numbers a pose each */
  at: number[] | null;
  dir: number[] | null;
  /** keys to place: their numbers after their shares (the striking part's way, the reach, the bend, the drop, the
   *  roll), five a key */
  key: number[] | null;
  /** the left hand's swing, the right's mirrored (`swingAt`'s `mirror`: a dual wielder's off hand) */
  left: boolean;
  /** how far the trunk is turned to the left (rad, `turnWithTrunk`): the keys placed turned with it, and the poses
   *  keyed taken as the eyes see them so turned */
  turn: number;
  /** each of the swing's keys turned as the trunk turns a cut of the hero's weapons at its share, one from rest or one
   *  in a row (`cutTurnAt`), instead */
  trunk: Trunk | null;
  canary: boolean;
}

/** how near a key keyed back from its own place must come (degrees, m), and how far the canary's grip is moved */
const ROUND_TRIP_TURN = 0.5, ROUND_TRIP_REACH = 0.005, CANARY_OFF = 0.1;
/** how near a cut taken on from another's end starts to where that one left the arm (m, degrees) */
const JUNCTION_NEAR = 0.01, JUNCTION_TURN = 1;

/** What one key puts where in the view (camera space). */
interface Placed { grip: THREE.Vector3; dir: THREE.Vector3; elbow: THREE.Vector3; wrist: THREE.Vector3 }

/** `lab swing`: the key of a swing that holds a pose, and where its keys (or one given) put the arm. */
export async function swing(lab: Lab, options: SwingOptions): Promise<Report> {
  if (options.swing === EVERY_SWING) return everySwing(lab, options);
  await lab.setup({ view: 'first', ...options.fixture });
  const swing = SWINGS_NAMED[options.swing];
  if (!swing) throw new Error(`lab: swing: no swing ${options.swing} (${Object.keys(SWINGS_NAMED).join(', ')})`);
  const mirror = options.left;
  const keyed = { swing, bones: bonesOf(lab, mirror), mirror, turn: options.turn };
  const lines = [planeWords(options.swing, keyed)];
  const problems: string[] = [];
  for (let i = 0; options.at && options.dir && i < options.at.length; i += 3) {
    const at = new THREE.Vector3().fromArray(options.at, i);
    const dir = new THREE.Vector3().fromArray(options.dir, i).normalize();
    // (keyed in the swing's plane as it is before the trunk turns it)
    const unturned = turned(keyed, -keyed.turn, { grip: at.clone(), dir: dir.clone() });
    const fit = swingKeyFor(swing, keyed.bones, unturned.grip, unturned.dir, mirror);
    lines.push(`the grip at ${triple(at)}, the weapon along ${triple(dir)}: ${fitWords(fit)}`);
    lines.push(`  that key: ${placedWords(lab, keyed, placeKey(keyed, fit.key), OWN_PLANE)}`);
  }
  for (let i = 0; options.key && i < options.key.length; i += 5) {
    const key = keyFrom(options.key.slice(i, i + 5));
    lines.push(`the key ${keyWords(key)}: ${placedWords(lab, keyed, placeKey(keyed, key), OWN_PLANE)}`);
  }
  if (!options.at && !options.key) {
    lines.push(...eachKey(lab, keyed, options.trunk));
    const between = stepped(lab, options.swing, keyed, options.trunk);
    lines.push(...between.lines);
    problems.push(...between.problems);
  }
  if (options.canary) problems.push(...canaryMissed(keyed), ...pathCanaryMissed(lab, keyed));
  return { text: lines.join('\n'), problems };
}

/** What a swing does between its keys: where it starts against where the swing before left the arm, and its path
 *  stepped, turned as `trunk` turns it. */
function stepped(lab: Lab, name: string, keyed: Keyed, trunk: Trunk | null): { lines: string[]; problems: string[] } {
  // (a game that places every key in its swing's own plane has nothing between its keys to step: read as if it had,
  // its every step was its first key, and a cut in a row 97 cm from the last one's end)
  if (!placesShares(keyed)) {
    return { lines: [`${name}: this game places no swing at its shares, nothing stepped`], problems: [] };
  }
  const lines: string[] = [];
  const problems: string[] = [];
  const junction = junctionOf(lab, name, keyed, trunk);
  if (junction) lines.push(junction.line);
  if (junction?.problem) problems.push(junction.problem);
  const path = describePath(name, pathOf(lab, keyed, trunk), LOWER_LET_GO * lab.model.root.scale.x);
  lines.push(...path.lines);
  problems.push(...path.problems);
  return { lines, problems };
}

/** Whether the game places a swing at a share of it in the plane it has there (its `swingAt` gives the wrist), or
 *  every key in the swing's own plane. */
function placesShares({ swing, bones, mirror }: Keyed): boolean {
  const at = () => new THREE.Vector3();
  const wrist = new THREE.Vector3(NaN, NaN, NaN);
  swingAt(swing, 0, bones, at(), at(), at(), at(), mirror, wrist);
  return !Number.isNaN(wrist.x);
}

/** the name `lab swing` takes for every swing of the weapons held */
const EVERY_SWING = 'all';

/** A swing the hero's weapons are swung with: its name in `SWINGS_NAMED`, the trunk the game turns it by (none: a
 *  skill's, which turns none), whether the left hand swings it, mirrored, and whether it's one from a two-hander's
 *  guard, which each guard has its own of. */
interface HeldSwing { name: string; trunk: Trunk | null; left?: boolean; guarded?: boolean }

const ONE_HANDED: readonly HeldSwing[] = [
  { name: 'oneFore', trunk: 'rest' },
  { name: 'oneForeRow', trunk: 'row' },
  { name: 'oneBack', trunk: 'back' },
  { name: 'oneOutBack', trunk: 'backOut' },
  { name: 'onePower', trunk: null },
];

/**
 * The swings through the eyes of each way of holding the weapons (models/warrior.ts): the basic attack's cuts, turned
 * by the trunk at their shares, from rest or in a row, its ways back unwinding the turn, and the skills' (Power
 * Strike, Steel Tempest's way into its hold and out, Thunder Crescent), which turn none. A dual wielder's left hand
 * cuts in a row after the right, the other way.
 */
const SWINGS_HELD: Readonly<Record<WeaponStyle, readonly HeldSwing[]>> = {
  shield: ONE_HANDED,
  oneHanded: ONE_HANDED,
  dual: [
    { name: 'dual', trunk: 'rest' },
    { name: 'dual', trunk: 'row' },
    { name: 'dual', trunk: 'back', left: true },
    { name: 'onePower', trunk: null },
    { name: 'onePower', trunk: null, left: true },
  ],
  twoHanded: [
    { name: 'twoRest', trunk: null, guarded: true },
    { name: 'twoFore', trunk: 'rest' },
    { name: 'twoForeRow', trunk: 'row' },
    { name: 'twoBack', trunk: 'back' },
    { name: 'twoOutFore', trunk: 'foreOut', guarded: true },
    { name: 'twoOutBack', trunk: 'backOut', guarded: true },
    { name: 'twoSpinIn', trunk: null, guarded: true },
    { name: 'twoSpin', trunk: null },
    { name: 'twoSpinOut', trunk: null, guarded: true },
    { name: 'twoPower', trunk: null, guarded: true },
    { name: 'twoPowerBack', trunk: null, guarded: true },
    { name: 'twoSmite', trunk: null, guarded: true },
    { name: 'twoSmiteBack', trunk: null, guarded: true },
  ],
};

/** A held swing's name for the weapon in hand: one from a two-hander's guard, a headed one's guard's own
 *  (`twoPowerHead`: a greataxe's, a maul's). */
function heldName(held: HeldSwing, weapon: string | null): string {
  const headed = held.guarded && twoRestOf(weapon ?? '') !== TWO_REST;
  return headed ? `${held.name}Head` : held.name;
}

/**
 * `lab swing all`: every swing of each weapon the hero holds each way he holds them (`--gear`'s and `--weapon`'s
 * alone, if given), a set-up each on one page (a page booted for each, a check's ten took 547 s for 3 of stepping).
 */
async function everySwing(lab: Lab, options: SwingOptions): Promise<Report> {
  const { fixture } = options;
  await lab.setup({ view: 'first', ...fixture });
  const { cls } = lab.player;
  if (!weaponStyle(cls, lab.player.gear)) {
    throw new Error(`lab: swing all: the ${cls.id} holds no weapons a swing keys (--class warrior)`);
  }
  // (a game from before the turn was the eyes' own steps every swing unturned)
  const turns = Boolean((viewSwing as Partial<typeof viewSwing>).cutTurnAt);
  const lines = turns ? [] : ['this game has no `cutTurnAt` (viewSwing.ts): every swing stepped unturned'];
  const problems: string[] = [];
  const ways = (fixture.gear ? [fixture.gear] : Object.keys(SWINGS_HELD)) as WeaponStyle[];
  let holds = 0;
  for (const gear of ways) {
    const bases = basesHeld(cls, gear).filter((base) => !fixture.weapon || base === fixture.weapon);
    for (const weapon of bases) {
      await lab.setup({ view: 'first', ...fixture, gear, weapon });
      const held = heldSwings(lab, options.canary, turns);
      lines.push(`${gear}, the ${weapon}:`, ...held.lines.map((line) => `  ${line}`));
      problems.push(...held.problems.map((problem) => `${gear}, the ${weapon}: ${problem}`));
      holds += 1;
    }
  }
  if (holds === 0) {
    throw new Error(`lab: swing all: the ${cls.id} holds no ${fixture.weapon} ${ways.join(' or ')}'s way`);
  }
  return { text: lines.join('\n'), problems };
}

/** Every swing of the weapons as the hero holds them (`SWINGS_HELD`), its plane and what it does between its keys
 *  (`stepped`; each key's own lines are `lab swing <name>`'s), turned with the trunk if the game `turns` it, the
 *  canaries on the cut from rest. */
function heldSwings(lab: Lab, canary: boolean, turns: boolean): { lines: string[]; problems: string[] } {
  const { cls, gear } = lab.player;
  const style = weaponStyle(cls, gear) as WeaponStyle;
  const lines: string[] = [];
  const problems: string[] = [];
  for (const held of SWINGS_HELD[style]) {
    const name = heldName(held, gear.weapon);
    const swing = SWINGS_NAMED[name];
    // (a game from before every guard's swings were named)
    if (!swing) {
      lines.push(`${name}: not named in this game`);
      continue;
    }
    const mirror = Boolean(held.left);
    const keyed = { swing, bones: bonesOf(lab, mirror), mirror, turn: 0 };
    const trunk = turns ? held.trunk : null;
    const turning = trunk ? `; each step turned as the trunk turns it (--trunk ${trunk})` : '';
    lines.push(planeWords(name, keyed) + turning);
    const between = stepped(lab, name, keyed, trunk);
    lines.push(...between.lines.map((line) => `  ${line}`));
    problems.push(...between.problems);
    if (canary && held.trunk === 'rest') problems.push(...canaryMissed(keyed), ...pathCanaryMissed(lab, keyed));
  }
  return { lines, problems };
}

/** A swing, the bones of the arm it keys, whether that's the left, its places mirrored, and how far the trunk turns
 *  it (rad, to the left). */
interface Keyed { swing: ViewSwing; bones: ArmBones; mirror: boolean; turn: number }

/** The held weapon's arm as a swing lays it out, the right's or the left's (`Model.swingBones`). */
function bonesOf(lab: Lab, left: boolean): ArmBones {
  const bones = lab.model.swingBones?.(left);
  if (!bones || bones.strike === 0) {
    const hand = left ? ' in his left hand (--gear dual)' : '';
    throw new Error(`lab: swing: the hero holds no weapon a swing keys${hand} (--class warrior)`);
  }
  return bones;
}

/** A key's numbers after its share as its values. */
function keyFrom(numbers: number[]): SwingKey {
  if (numbers.length !== 5) {
    throw new Error('lab: swing --key: five numbers: the way, the reach, the bend, the drop, the roll');
  }
  const [way, reach, bend, drop, roll] = numbers;
  return { way, reach, bend, drop, roll };
}

/** A key placed with nothing in it yet. */
function unplaced(): Placed {
  const at = () => new THREE.Vector3();
  return { grip: at(), dir: at(), elbow: at(), wrist: at() };
}

/** Where `key` puts the arm in its swing's own plane (as the swing has it once any `turning` is over), turned with
 *  the trunk. */
function placeKey(keyed: Keyed, key: SwingKey): Placed {
  const { swing, bones, mirror } = keyed;
  const placed = unplaced();
  swingKeyAt(swing, key, bones, placed.grip, placed.dir, new THREE.Vector3(), placed.elbow, placed.wrist, mirror);
  const shoulder = swingShoulder(swing, new THREE.Vector3(), mirror);
  placed.elbow.add(shoulder);
  placed.wrist.add(shoulder);
  return turned(keyed, keyed.turn, placed);
}
/** the share a key placed in its swing's own plane is read at (past any `turning`) */
const OWN_PLANE = 1;

/** Where the swing puts the arm at `share` of it (its key there, `key`), turned with the trunk: in the plane it has
 *  then (`swingAt`), a cut in a row's first keys in the plane it turns from the last one's, about the point that plane
 *  turns about there (`swingShoulderAt`). */
function placeAt(keyed: Keyed, share: number, key: SwingKey): Placed {
  const { swing, bones, mirror } = keyed;
  const placed = unplaced();
  // (a game whose `swingAt` gives no wrist placed every key in its swing's own plane)
  placed.wrist.set(NaN, NaN, NaN);
  swingAt(swing, share, bones, placed.grip, placed.dir, new THREE.Vector3(), placed.elbow, mirror, placed.wrist);
  if (Number.isNaN(placed.wrist.x)) return placeKey(keyed, key);
  const pivot = swingShoulderAt(swing, share, new THREE.Vector3(), mirror);
  placed.elbow.add(pivot);
  placed.wrist.add(pivot);
  return turned(keyed, keyed.turn, placed);
}

/** a two-hander's lower grip further than this past the left arm's reach is let go of (the rig's units:
 *  models/warrior.ts) */
const LOWER_LET_GO = 0.07;

/** The swing laid out at each share of its path (`pathShares`) as the game places it there (`placeAt`), turned as
 *  `trunk` turns it there, with the point its plane turns about and how far a two-hander's lower grip is past the
 *  left arm's reach. */
function pathOf(lab: Lab, turnedKeyed: Keyed, trunk: Trunk | null = null): PathStep[] {
  const { swing, mirror } = turnedKeyed;
  const turnAt = trunk ? cutTurnOf(lab, trunk) : null;
  const up = upHandleOf(lab);
  // (only a game from before keys were placed at their shares reads this key, each step alike)
  const first = keyNumbered(swing, 0).key;
  return pathShares().map((share) => {
    const keyed = turnAt ? { ...turnedKeyed, turn: turnAt(share) } : turnedKeyed;
    const placed = placeAt(keyed, share, first);
    const pivot = turnedPoint(keyed, swingShoulderAt(swing, share, new THREE.Vector3(), mirror));
    const lower = up === null ? null : placed.grip.clone().addScaledVector(placed.dir, -up);
    const lowerPast = lower ? lower.distanceTo(ownShoulders(keyed, share).left) - reachOf(lab) : null;
    return { share, pivot, grip: placed.grip, elbow: placed.elbow, lowerPast };
  });
}

/** The path's canary: one step's elbow turned over round the line to its grip (`plantedFlip`), which must read as a
 *  jump into that step or out of it. */
function pathCanaryMissed(lab: Lab, keyed: Keyed): string[] {
  const planted = plantedFlip(pathOf(lab, keyed));
  const step = 1 / PATH_STEPS;
  const near = (share: number, at: number) => Math.abs(share - at) < step / 2;
  const caught = pathJumps(planted.steps)
    .some((jump) => near(jump.share, planted.share) || near(jump.share, planted.share + step));
  return caught ? [] : [`canary: the elbow turned over at ${planted.share.toFixed(2)} wasn't read as a jump`];
}

/** A swing's key `index` (from 0): its share and its numbers. */
function keyNumbered(swing: ViewSwing, index: number): { share: number; key: SwingKey } {
  const [share, ...numbers] = swing.keys.slice(index * 6, index * 6 + 6);
  return { share, key: keyFrom(numbers) };
}

/** How many keys a swing has. */
const keysOf = (swing: ViewSwing) => Math.floor(swing.keys.length / 6);

/** The spine under a swing's shoulder, which the trunk turns about (models/warrior.ts `spineUnder`). */
function spineOf(swing: ViewSwing): THREE.Vector3 {
  const shoulder = swingShoulder(swing, new THREE.Vector3());
  return new THREE.Vector3(0, shoulder.y, shoulder.z);
}

/** A placed arm's grip, elbow and wrist (those it has) and its weapon's way turned `turn` (rad, to the left) about the
 *  view's up through the spine, as the trunk carries a cut round (`turnWithTrunk`), in place. */
function turned<T extends { grip: THREE.Vector3; dir: THREE.Vector3; elbow?: THREE.Vector3; wrist?: THREE.Vector3 }>(
  { swing }: Keyed, turn: number, placed: T,
): T {
  if (turn === 0) return placed;
  const spine = spineOf(swing);
  turnWithTrunk(turn, spine, placed.grip, placed.dir, new THREE.Vector3(), new THREE.Vector3());
  for (const point of [placed.elbow, placed.wrist]) point?.sub(spine).applyAxisAngle(UP, turn).add(spine);
  return placed;
}
const UP = new THREE.Vector3(0, 1, 0);

/** A point turned with the trunk as a placed arm is (`turned`), in place. */
function turnedPoint(keyed: Keyed, point: THREE.Vector3): THREE.Vector3 {
  if (keyed.turn === 0) return point;
  const spine = spineOf(keyed.swing);
  return point.sub(spine).applyAxisAngle(UP, keyed.turn).add(spine);
}

/** Each key of a swing placed at its share, a line each: turned as far as `trunk` turns a cut there, if it's
 *  given. */
function eachKey(lab: Lab, keyed: Keyed, trunk: Trunk | null): string[] {
  const lines: string[] = [];
  const turnAt = trunk ? cutTurnOf(lab, trunk) : null;
  for (let i = 0; i < keysOf(keyed.swing); i++) {
    const { share, key } = keyNumbered(keyed.swing, i);
    const at = turnAt ? { ...keyed, turn: turnAt(share) } : keyed;
    const turned = turnAt ? ` (turned ${at.turn.toFixed(2)})` : '';
    lines.push(`  ${share}${turned}: ${keyWords(key)}: ${placedWords(lab, at, placeAt(at, share, key), share)}`);
  }
  return lines;
}

/** Where a cut taken on from another's end (`ViewSwing.from`) starts against where that one leaves the arm, both
 *  turned as the trunk is between them: a line, and a problem past `JUNCTION_NEAR` or `JUNCTION_TURN` (the arm drawn
 *  jumps there, or a fade hides that it would). Null for a swing taken on from none. */
function junctionOf(
  lab: Lab, name: string, keyed: Keyed, trunk: Trunk | null,
): { line: string; problem: string | null } | null {
  const from = keyed.swing.from;
  if (!from) return null;
  const at = trunk ? { ...keyed, turn: cutTurnOf(lab, trunk)(0) } : keyed;
  const start = placeAt(at, 0, keyNumbered(keyed.swing, 0).key);
  const end = placeAt({ ...at, swing: from }, 1, keyNumbered(from, keysOf(from) - 1).key);
  const off = start.grip.distanceTo(end.grip);
  const turned = THREE.MathUtils.radToDeg(start.dir.angleTo(end.dir));
  const fromName = Object.keys(SWINGS_NAMED).find((named) => SWINGS_NAMED[named] === from) ?? 'the swing before';
  const line = `${name} starts ${(off * 100).toFixed(1)} cm and ${turned.toFixed(1)}° from where ${fromName} `
    + 'leaves the arm';
  const jumps = off > JUNCTION_NEAR || turned > JUNCTION_TURN;
  return { line, problem: jumps ? `${line} (at most ${JUNCTION_NEAR * 100} cm, ${JUNCTION_TURN}°)` : null };
}

/** How far the trunk turns a cut of the hero's weapons at a share of it (rad, to the left: `cutTurnAt`), a
 *  two-hander's, a dual wielder's or a one-hander's: a forehand from rest, one in a row, or a backhand. */
function cutTurnOf(lab: Lab, trunk: Trunk): (share: number) => number {
  // (a game from before the turn was the eyes' own has none to read)
  const cutTurnAt = (viewSwing as Partial<typeof viewSwing>).cutTurnAt;
  if (!cutTurnAt) throw new Error('lab: swing --trunk: this game has no `cutTurnAt` (viewSwing.ts) to turn keys by');
  const turn = lab.model.offGrip ? TWO_CUT_TURN : lab.model.offTip ? DUAL_CUT_TURN : CUT_TURN;
  // (a way back unwinds the turn the cut's end left, as models/warrior.ts turns it)
  if (trunk === 'foreOut' || trunk === 'backOut') {
    const side = trunk === 'foreOut' ? 1 : -1;
    return (share) => side * turn[1] * (1 - smooth(share));
  }
  return (share) => cutTurnAt(turn, share, trunk !== 'rest', trunk === 'back' ? -1 : 1);
}

/** Eased in and out (0..1), as viewSwing.ts eases. */
const smooth = (t: number) => t * t * (3 - 2 * t);

/** A swing's plane as words: its shoulder (or the point its hands turn about, a held swing's), the way it crosses the
 *  view, and its bones. */
function planeWords(name: string, { swing, bones, mirror, turn }: Keyed): string {
  const shoulder = swingShoulder(swing, new THREE.Vector3(), mirror);
  const pivot = swing.holds ? 'the point its hands turn about (held)' : 'its shoulder';
  const arm = `the arm ${bones.upper.toFixed(2)} + ${bones.fore.toFixed(2)} + ${bones.hand.toFixed(2)} m`;
  const hand = mirror ? ', the left hand\'s, mirrored' : '';
  const trunk = turn === 0 ? '' : `; the trunk turned ${turn} rad to the left, the places with it`;
  return `${name}: ${pivot} ${triple(shoulder)}, crossing the view at ${swing.plane[3]}°${hand}; ${arm}, `
    + `the striking part ${bones.strike.toFixed(2)} m from the grip; the fist's slant ${swing.slant}°${trunk}`;
}

/** A key's numbers as words. */
function keyWords(key: SwingKey): string {
  const numbers = [key.way, key.reach, key.bend, key.drop, key.roll].map((value) => round(value, 2));
  return numbers.join(', ');
}

const round = (value: number, places: number) => Number(value.toFixed(places));

/** A fit as words: its key, and what of the pose it can't hold. */
function fitWords(fit: SwingKeyFit): string {
  const misses = [
    ...(Math.abs(fit.gripOff) > 0.005 ? [`the grip ${(Math.abs(fit.gripOff) * 100).toFixed(1)} cm off the plane`] : []),
    ...(Math.abs(fit.weaponOff) > 0.5 ? [`the weapon's way ${Math.abs(fit.weaponOff).toFixed(1)}° off it`] : []),
    ...(fit.bend !== fit.key.bend ? [`the wrist would bend ${fit.bend.toFixed(1)}° (held at ${fit.key.bend}°)`] : []),
    ...(fit.weaponMiss > 0.5 ? [`the weapon ${fit.weaponMiss.toFixed(1)}° off its way`] : []),
    ...(fit.key.reach >= fit.most - 0.001 ? [`the grip past the arm's reach, ${fit.most.toFixed(2)} m`] : []),
  ];
  const held = misses.length ? `; not held: ${misses.join(', ')}` : '; held as it is';
  return `the key ${keyWords(fit.key)}${held}`;
}

/** Where a key puts the arm at `share` of its swing as words: the grip (in the frame or not), the weapon, the elbow,
 *  the wrist, and a two-hander's lower grip and its distance from the left shoulder (`ownShoulders`), and a held
 *  swing's upper grip's from the right. */
function placedWords(lab: Lab, keyed: Keyed, placed: Placed, share: number): string {
  const words = [
    `the grip ${triple(placed.grip)}${seen(placed.grip) ? '' : ' (out of the frame)'}`,
    `the weapon ${triple(placed.dir)}, ${shownWords(shownOf(lab, keyed, placed))}`,
    `the elbow ${triple(placed.elbow)}`,
    `the wrist ${triple(placed.wrist)}`,
  ];
  const up = upHandleOf(lab);
  if (up !== null) {
    const lower = placed.grip.clone().addScaledVector(placed.dir, -up);
    const own = ownShoulders(keyed, share);
    words.push(`the lower grip ${triple(lower)}, ${lower.distanceTo(own.left).toFixed(2)} m `
      + `from the left shoulder (an arm reaches ${reachOf(lab).toFixed(2)})`);
    if (own.held) words.push(`the grip ${placed.grip.distanceTo(own.right).toFixed(2)} m from the right shoulder`);
  }
  return words.join(', ');
}

/** The hero's own shoulders under a two-hander's swing at `share` (camera space), turned as the trunk turns its
 *  keys: the right where the swing's plane turns about there (`swingShoulderAt`), but where the hands place the
 *  weapon (a held swing, or one turned from a held one: `ViewSwing.holds`) where its guard puts it, whose shoulders
 *  the arms are drawn from (models/warrior.ts `driver`); the left across the spine from the right. */
function ownShoulders(keyed: Keyed, share: number): { right: THREE.Vector3; left: THREE.Vector3; held: boolean } {
  const { swing } = keyed;
  const held = Boolean(swing.holds || swing.from?.holds);
  const right = new THREE.Vector3();
  if (held) swingShoulder(TWO_REST, right);
  else swingShoulderAt(swing, share, right);
  const left = new THREE.Vector3(-right.x, right.y, right.z);
  const spine = spineOf(swing);
  for (const shoulder of [right, left]) shoulder.sub(spine).applyAxisAngle(UP, keyed.turn).add(spine);
  return { right, left, held };
}

/** How far an arm reaches from its shoulder to the middle of its fist (m, as `lab eyes` says: a two-hander's lower
 *  grip further than a few cm past it is let go of, models/warrior.ts). */
function reachOf(lab: Lab): number {
  const P = lab.joints.P;
  return (P.upperL + P.foreL + P.handR) * lab.model.root.scale.x;
}

/** How far a two-hander's upper grip is up the handle from its lower one (m; null for a one-hander). */
function upHandleOf(lab: Lab): number | null {
  const lower = lab.model.offGrip;
  return lower ? -lower.position.y * lab.model.root.scale.x : null;
}

/** the points along a weapon its share in the frame is counted at (as page/cuts.ts `weaponsInView`'s, which a cut's
 *  end and the rest are judged by) */
const ALONG_POINTS = 11;

/** The held weapon as a key places it in the frame, as the eyes read a rest and a cut's end (page/cuts.ts
 *  `seenAlong`): `ALONG_POINTS` points along its length from its butt to its far end (`weaponSpan`: counted from the
 *  grip alone, a cut's end read 45% in the frame where the eyes' 27%). */
function shownOf(lab: Lab, { mirror }: Keyed, placed: Placed): { share: number; length: number } {
  const span = weaponSpan(lab, mirror ? 'left' : 'right');
  if (!span) return { share: 0, length: 0 };
  const lens = armsLens();
  const points = Array.from({ length: ALONG_POINTS }, (_, i) => {
    const along = span.from + ((span.to - span.from) * i) / (ALONG_POINTS - 1);
    return lens.localToWorld(placed.grip.clone().addScaledVector(placed.dir, along));
  });
  return seenAlong(points);
}

/** A weapon in the frame as words: its share in it, and how long it looks. */
function shownWords({ share, length }: { share: number; length: number }): string {
  return `${(share * 100).toFixed(0)}% of it in the frame, looking ${(length * 100).toFixed(0)}% of its height long`;
}

/** Whether a point in the eyes' frame is in the frame the arms are drawn in. */
function seen(point: THREE.Vector3): boolean {
  if (point.z >= 0) return false;
  const ndc = point.clone().applyMatrix4(armsLens().projectionMatrix);
  return Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1;
}

/** The canary: the swing's blow keyed back from where its own key puts it, and a grip moved off the plane. */
function canaryMissed(turnedKeyed: Keyed): string[] {
  // (keyed back in the swing's own plane, as the trunk leaves it)
  const keyed = { ...turnedKeyed, turn: 0 };
  const { swing, bones, mirror } = keyed;
  const missed: string[] = [];
  // (the key at the blow, or the first)
  const at = Math.max(0, swing.keys.findIndex((value, index) => index % 6 === 0 && value === swing.hit));
  const key = keyFrom(swing.keys.slice(at + 1, at + 6));
  key.drop = 0;
  key.roll = 0;
  const placed = placeKey(keyed, key);
  const back = swingKeyFor(swing, bones, placed.grip, placed.dir, mirror).key;
  const turned = Math.max(Math.abs(back.way - key.way), Math.abs(back.bend - key.bend));
  if (turned > ROUND_TRIP_TURN || Math.abs(back.reach - key.reach) > ROUND_TRIP_REACH) {
    missed.push(`canary: the key ${keyWords(key)} placed and keyed back came out ${keyWords(back)}`);
  }
  const moved = placed.grip.clone().add(normalOf(keyed, placed));
  const off = swingKeyFor(swing, bones, moved, placed.dir, mirror);
  if (Math.abs(Math.abs(off.gripOff) - CANARY_OFF) > 0.002) {
    const read = (off.gripOff * 100).toFixed(1);
    missed.push(`canary: a grip moved ${CANARY_OFF * 100} cm off the plane read ${read} cm off`);
  }
  return missed;
}

/** `CANARY_OFF` along the plane's normal at a placed key: square to the grip's way from the shoulder and the
 *  weapon's. */
function normalOf({ swing, bones, mirror }: Keyed, placed: Placed): THREE.Vector3 {
  const shoulder = swingShoulder(swing, new THREE.Vector3(), mirror);
  const toGrip = placed.grip.clone().sub(shoulder);
  const striking = placed.grip.clone().addScaledVector(placed.dir, bones.strike).sub(shoulder);
  return toGrip.cross(striking).normalize().multiplyScalar(CANARY_OFF);
}
