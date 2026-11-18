// `lab range`: every joint of the hero against a body's ranges (`models/anatomy.ts`), frame by frame, as the game's dev
// builds watch them (`watchBody`), over standing, walking each way, shooting and walks that change direction while he
// shoots or runs. Each angle past its range: on how many frames, the worst and where (the scenario, the frame, and for
// a leg whether its foot was planted), and the worst moment of each scenario pictured. A two-hander let go of by the
// other hand is a problem in every scenario (held as it's raised, walked and swung with): the frames, how often and
// why. With `--skill`, a skill cast standing too, the weapons held `--gear`'s way (`--weapon` the base). A hand
// gripping a handle has its wrist judged against what a gripping wrist does (`GRIPPING`). A canary turns the head
// round past the neck's range on one frame, and bends the drawn fist on its forearm, which the measure must catch.
// `--trace` lists the leg IK frame by frame as the gait's does (`legTrace.ts`), each frame's joints past their ranges
// after it.
import * as THREE from 'three';
import type { Frame, Lab, Pictured } from './lab';
import {
  breaches, elevationLimit, measureBody, rotationRange, ROM, type BodyAngles, type Breach,
} from '../../../src/entities/models/anatomy';
import type { Joints } from '../../../src/entities/models/rig';
import type { LegIK } from '../../../src/entities/models/ik';
import type { WeaponStyle } from '../../../src/loot/loadout';
import type { LowerGrip } from '../../../src/types';
import { LegTrace, traceSpanOf } from './legTrace';
import { bindKnown, holdFor, pressing, skillNamed } from './cast';
import { TipMoves } from './tipMoves';
import { FlaskMoves } from './flaskMoves';
import { CANARY_CAUGHT as WEAPON_CAUGHT, EDGE_OFF_MOST, WeaponFloor, bladeCanary, weaponCanary } from './weaponFloor';
import { BODY_CANARY_CAUGHT, WeaponBody, bodyCanary } from './weaponBody';
import { WeaponOnFoe, foeCanary } from './weaponOnFoe';
import { WeaponPath } from './weaponPath';
import { POSE_MOST, POSE_ONCE_MOST, PoseCost } from './poseCost';
import { armsInBody, armsInCanary, deepestArm, describeArmsIn, type ArmsInSeen } from './armsIn';
import { armsInLegs, armsInLegsCanary, type ArmInLeg } from './armsInLegs';
import type { EnemyId } from '../../../src/data/enemies';
import type { BiomeId } from '../../../src/data/biomes';
import { G } from '../../../src/state';
import { ArmsPinned, describeStrain, pinnedCanary, type ArmLimits, type Ranges } from './armStrain';

/**
 * A hand as it's drawn, turned in its grip on the joint (`Hand.vis`), as `watchBody` measures it: marked so (models/
 * hands.ts), or on a game before the mark the group under the joint holding the hand's sculpted surface (its pieces
 * marked as its own, before that). Throws when there's none: read off the joint, which is only the wrist, a fist bent
 * 60 degrees off its forearm read as within its range (the meshes' mark went with the sculpted hands, and every
 * wrist the lab read after them was the joint's).
 */
export function drawnHand(hand: THREE.Object3D): THREE.Object3D {
  const marked = hand.children.find((child) => child.userData.drawnHand);
  if (marked) return marked;
  const drawn = (child: THREE.Object3D) => (child as THREE.SkinnedMesh).isSkinnedMesh || child.userData.own;
  const found = hand.children.find((child) => (child as THREE.Group).isGroup && child.children.some(drawn));
  if (!found) {
    throw new Error(`lab: no drawn hand on ${hand.name || 'a hand joint'}: its wrist would be read off the joint`);
  }
  return found;
}

/** The body's angles now, and the joints past their ranges, the worst first. */
interface BodyNow {
  angles: BodyAngles;
  found: Breach[];
}

type Side = 'L' | 'R';

/**
 * The wrist's range with a weapon gripped hard in the fist (degrees, as anatomy.ts `ROM`): flexed far, the fingers'
 * long flexors go slack and the fist can't stay closed on its handle (people grip hardest with the wrist about 35
 * degrees back and 7 to the little finger's side: O'Driscoll et al. 1992), so a held weapon's wrist works from cocked
 * back to a little flexed, and to each side as an empty hand's does. (Judged against the empty hand's 80, a fist
 * hung flexed off its forearm through a cut passed.)
 */
export const GRIPPING = { 'wrist.flexion': [-70, 30] } as const;

/** a fist with its fingers curled less than this (rad, their joints' mean bend) is open, gripping nothing: through
 *  the eyes the fingers stood straight out beside the handle */
export const FIST_OPEN = 0.5;

/** The sides whose hands hold a handle now (`Model.fists`, curled `FIST_OPEN` or more: none on a game without it). An
 *  open hand's wrist is an empty hand's: judged as gripping, the ranger's hand opened off his bow laid by a fire, on
 *  his knee, read 50 degrees past a gripping wrist's flexion. */
export function grippingSides(lab: Lab): Side[] {
  const gripping = (lab.model.fists ?? []).filter((fist) => fist.curl >= FIST_OPEN);
  return gripping.map((fist) => (fist.hand === 'right' ? 'R' : 'L'));
}

/** the body's limits for an arm, as anatomy.ts has them, for `ArmsPinned` */
export const ARM_LIMITS: ArmLimits = { ranges: ROM, elevationLimit, rotationRange };

/** The ranges each gripping hand's wrist is judged by (`GRIPPING`), for `ArmsPinned`. */
export function grippingRanges(lab: Lab): Partial<Record<Side, Ranges>> {
  return Object.fromEntries(grippingSides(lab).map((side) => [side, GRIPPING]));
}

/** a joint is past its range once it's this far past (degrees): a joint held at its limit read "0 past" by rounding */
const PAST_BY = 1;

/** The gripping hands' wrists past `GRIPPING`, named as `breaches` names them with "(gripping)" after. */
function grippingBreaches(angles: BodyAngles, gripping: readonly Side[]): Breach[] {
  const found: Breach[] = [];
  for (const side of gripping) {
    for (const [range, [min, max]] of Object.entries(GRIPPING)) {
      const value = angles[range.replace('.', `${side}.`)];
      const by = Math.max(min - value, value - max);
      if (by > PAST_BY) found.push({ name: `${range.replace('.', `${side}.`)} (gripping)`, value, min, max, by });
    }
  }
  return found;
}

/** The body's angles and the joints past their ranges now, measured as the game's dev builds measure them
 *  (`watchBody`; with the module's own exports alone, so an A/B's side on an older commit measures the same), the
 *  wrists of the hands `gripping` a handle against what a gripping wrist does. */
export function bodyBreaches(joints: Joints, gripping: readonly Side[] = []): BodyNow {
  joints.root.updateMatrixWorld(true);
  const angles = measureBody(joints, { L: drawnHand(joints.handL), R: drawnHand(joints.handR) });
  const held = grippingBreaches(angles, gripping);
  const judged = new Set(held.map((breach) => breach.name.replace(' (gripping)', '')));
  const found = [...breaches(angles, PAST_BY).filter((breach) => !judged.has(breach.name)), ...held];
  return { angles, found: found.sort((a, b) => b.by - a.by) };
}

/** the wrist canary: how far the drawn fist is bent on its forearm each way (degrees), and how near the measure must
 *  read it */
const WRIST_CANARY = [{ axis: new THREE.Vector3(1, 0, 0), angle: 60, reads: 'flexion' },
  { axis: new THREE.Vector3(0, 0, -1), angle: 60, reads: 'ulnar' }] as const;
const WRIST_CANARY_NEAR = 3;

/** The node the right hand's sculpted surface hangs on, found from the surface (not as `drawnHand` finds it): what a
 *  turn must turn to move the hand as it's drawn. */
function fistDrawn(hand: THREE.Object3D): THREE.Object3D {
  let surface: THREE.Object3D | null = null;
  hand.traverse((child) => {
    if (!surface && (child as THREE.SkinnedMesh).isSkinnedMesh) surface = child;
  });
  if (!surface) throw new Error('lab: the wrist canary found no sculpted hand to bend');
  return (surface as THREE.Object3D).parent!;
}

/**
 * The wrist canary: the right fist, as it's drawn, bent on its forearm 60 degrees towards its palm (flexion), then 60
 * to its little finger's side (ulnar), each read and put back. Each reading as words, `caught ...` or `missed ...`:
 * caught when the measure reads that bend within `WRIST_CANARY_NEAR` and the other way near none.
 */
export function wristCanary(lab: Lab): string[] {
  const fist = fistDrawn(lab.joints.handR);
  const was = fist.quaternion.clone();
  const verdicts = WRIST_CANARY.map(({ axis, angle, reads }) => {
    const forearm = lab.joints.elbowR.getWorldQuaternion(new THREE.Quaternion());
    const bent = forearm.multiply(new THREE.Quaternion().setFromAxisAngle(axis, THREE.MathUtils.degToRad(angle)));
    const parent = fist.parent!.getWorldQuaternion(new THREE.Quaternion());
    fist.quaternion.copy(parent.invert().multiply(bent));
    const { angles } = bodyBreaches(lab.joints);
    const flexion = angles['wristR.flexion'];
    const ulnar = -angles['wristR.radial'];
    const [wanted, other] = reads === 'flexion' ? [flexion, ulnar] : [ulnar, flexion];
    const near = Math.abs(wanted - angle) <= WRIST_CANARY_NEAR && Math.abs(other) <= WRIST_CANARY_NEAR;
    const read = `bent ${angle}° (${reads}), read flexion ${wholeDegrees(flexion)}°, ulnar ${wholeDegrees(ulnar)}°`;
    return `${near ? 'caught' : 'missed'}: ${read}`;
  });
  fist.quaternion.copy(was);
  lab.joints.root.updateMatrixWorld(true);
  return verdicts;
}

/** One leg of a scenario: the keys held, the attack (held, tapped or not), for how many frames. */
interface RangeLeg {
  keys: string[];
  attack: boolean | 'taps';
  frames: number;
  /** the skill asked for (`--skill`) cast on its first frame, its key held as long as the player would (`holdFor`: a
   *  channel through, a drawn shot to full), the leg's frames after that */
  cast?: boolean;
  /** stunned for this long as it starts (s: a Bull Rush that rammed a crowd, #560), reeling in the stagger's pose */
  stun?: number;
}

interface RangeScenario {
  name: string;
  /** what it is, as the report says it */
  what: string;
  legs: RangeLeg[];
}

/** how many frames the cast scenario runs from the press (4.5 s: a 1.5 s cast, its end held, and the stand after it
 *  until a two-hander goes onto his shoulder) */
const CAST_FRAMES = 270;

const legOf = (keys: string[], attack: RangeLeg['attack'], frames: number): RangeLeg => ({ keys, attack, frames });

/** a tapped attack: pressed this many frames, then let go this many (a bow's tap looses at its least draw) */
const TAP_DOWN = 6, TAP_UP = 12;

/** the zigzag a reversal makes: left, right, back and forth, and the diagonals */
const ZIGZAG = [['a'], ['d'], ['a'], ['d'], ['w'], ['s'], ['w'], ['s'], ['a', 'w'], ['d', 's'], ['a', 's'], ['d', 'w']];

const SCENARIOS: RangeScenario[] = [
  { name: 'stand', what: 'standing', legs: [legOf([], false, 120)] },
  {
    name: 'walk',
    what: 'walking forwards, back and to each side',
    legs: [['w'], ['s'], ['a'], ['d']].map((keys) => legOf(keys, false, 80)),
  },
  {
    name: 'shoot',
    what: 'attacking standing: held, let go, again',
    legs: [legOf([], true, 80), legOf([], false, 50), legOf([], true, 80), legOf([], false, 50)],
  },
  {
    name: 'reverse',
    what: 'attacking while the walk changes direction',
    legs: ZIGZAG.map((keys) => legOf(keys, true, 25)),
  },
  {
    name: 'taps',
    what: 'tapping attacks while the walk changes direction',
    legs: ZIGZAG.map((keys) => legOf(keys, 'taps', 30)),
  },
  {
    name: 'run',
    what: 'running reversals: left and right again',
    legs: [['a'], ['d'], ['a'], ['d']].map((keys) => legOf(keys, false, 40)),
  },
  {
    name: 'stagger',
    what: 'staggered by a charge into a crowd, walking and attacking held through it, and walking on after it',
    // (the longest stagger a one-hander's charge gives, 0.7 s, its keys held as a player trying to get away does)
    legs: [legOf([], false, 20), { ...legOf(['w'], true, 60), stun: 0.7 }, legOf(['w'], false, 40)],
  },
  {
    name: 'cast',
    what: 'casting the skill asked for, standing, its end held and the stand after it',
    // (on until a two-hander is back on his shoulder, 2 s after the last blow: ended 2.5 s after the press, a 1.5 s
    // cast's stand after it went unread, where the left hand let go, "stands holding it with just one hand")
    legs: [legOf([], false, 20), { ...legOf([], false, CAST_FRAMES), cast: true }],
  },
];

/** The scenarios `lab range` can run, by name (`cast` with `--skill` alone). */
export const RANGE_SCENARIOS = SCENARIOS.map((scenario) => scenario.name);

/** how far ahead of the hero a cast is aimed (m) */
const CAST_AIM = 6;

/** What `lab range` is asked for. */
export interface RangeOptions {
  /** the scenarios to run (all when empty) */
  scenarios?: string[];
  /** turn the head past the neck's range on one frame, which must be caught */
  canary?: boolean;
  /** list each frame with a joint past its range */
  frames?: boolean;
  /** list the leg IK frame by frame (`legTrace.ts`), with each frame's joints past their ranges */
  trace?: boolean;
  /** with `trace`, only the frames from the first to the second */
  span?: [number, number];
  /** the `cast` scenario's skill (its key, its behaviour or its name), and the way the weapons are held throughout,
   *  and the weapon held that way by its base */
  skill?: string;
  gear?: WeaponStyle;
  weapon?: string;
  /** the game's tunable values set before each scenario (`--tune`) */
  tune?: Record<string, number[]>;
  /** a foe stood ahead of him for the `cast` scenario, by its kind, and how far ahead (m) */
  foe?: string;
  foeAt?: number;
  /** the biome he stands in (the lobby's by default): the crypt's wall is stone, the forest's a thicket */
  biome?: BiomeId;
  /** where every scenario stands him (x, z: `START` by default) and the way he faces (rad, 0 is +z): at the dais's
   *  edge facing off it, the ground ahead lies lower than under his feet, as off a plinth in the hall of heroes; by
   *  the arena's wall facing out, a two-hander's blow comes down on it */
  at?: [number, number];
  facing?: number;
}

/** where every scenario starts: open ground, facing +z */
const START: [number, number] = [14, 17];
/** a scenario's worst moment is pictured once a joint is this far past its range (degrees) */
const PICTURE_FROM = 5;
/** the canary's frame, and how far it turns the head (rad) */
const CANARY_FRAME = 60;
const CANARY_TURN = 2.4;
/** the canary is caught when the neck reads at least this far past its range (degrees) */
const CANARY_CAUGHT = 40;

/** One angle past its range over the run: on how many frames, and its worst. */
interface AngleRecord {
  name: string;
  frames: number;
  worst: Breach;
  where: string;
}

/** Whether the attack is down on this frame of a leg. */
function attackDown(leg: RangeLeg, frame: number): boolean {
  if (leg.attack !== 'taps') return leg.attack;
  return frame % (TAP_DOWN + TAP_UP) < TAP_DOWN;
}

/** What `lab range` found: its lines, its pictured moments, and the canary. */
export interface RangeReport {
  lines: string[];
  moments: Pictured[];
  canary?: {
    caught: boolean; measured: number; weapon: number; body: number; wrist: string[]; pinned: boolean;
    /** with a foe ahead: whether the weapon read as over it while it stood aside (it must not) */
    foeAside?: boolean;
    /** in a cast: whether the tip's path, one fast point moved aside, read as off its line (it must) */
    pathAside?: boolean;
    /** in a cast with a flask out: whether its arm's elbow, moved far in a frame, read as its fastest move (it must) */
    flaskJump?: boolean;
    /** the right elbow moved into the chest, read as the arms in the body (`caught ...` or `missed ...`) */
    armsIn?: string;
    /** a hand at the left thigh's middle, read as an arm in the legs (`caught ...` or `missed ...`) */
    armsInLegs?: string;
    /** the weapon turned a quarter round its grip: how much further off the blow's line its blade read (degrees) */
    bladeTurned?: number;
    /** one frame's pose made 40 ms slower: whether it read as too slow (it must) */
    poseSlow?: boolean;
  };
  /** each scenario in which a two-hander was let go of by the other hand, as words */
  letGo: string[];
  /** each scenario whose blow met the floor with the blade's flat or side, as words */
  bladeAcross: string[];
  /** each scenario with a frame whose pose took longer than `POSE_MOST`, as words */
  slowPose: string[];
  /** each scenario in which a forearm or a hand passed into a leg, as words */
  armsInLegs: string[];
}

const degrees = (value: number) => value.toFixed(0);

/** For a leg's angle, whether that leg's foot was planted (as the leg IK has it), else nothing. */
function footOf(lab: Lab, name: string): string {
  const legs = lab.model.root.userData.legs as LegIK | undefined;
  const leg = /^(hip|knee|ankle)([LR])\./.exec(name);
  if (!legs || !leg) return '';
  const foot = legs.feet[leg[2] === 'L' ? 0 : 1];
  return foot.state === 'plant' ? ', its foot planted' : ', its foot in the air';
}

/** For a shoulder past its range, its raise, the plane it rises in and its turn, against what each allows (a raise
 *  or a turn can take it past), else nothing. */
export function armOf(angles: BodyAngles, name: string): string {
  const shoulder = /^shoulder([LR])\.excess$/.exec(name);
  if (!shoulder) return '';
  const side = shoulder[1];
  const raise = angles[`shoulder${side}.elevation`];
  const plane = angles[`shoulder${side}.plane`];
  const turn = angles[`shoulder${side}.rotation`];
  const [turnLeast, turnMost] = rotationRange(raise);
  return `, raised ${degrees(raise)}° (at most ${degrees(elevationLimit(plane))} in its plane ${degrees(plane)}°)`
    + `, turned ${degrees(turn)}° (${degrees(turnLeast)}..${degrees(turnMost)})`;
}

/** Where a breach is, past its scenario and frame: a leg's foot planted or not, a shoulder's raise and turn. */
function contextOf(lab: Lab, angles: BodyAngles, name: string): string {
  return footOf(lab, name) + armOf(angles, name);
}

/** Counts `breach` in its angle's record, keeping it (and `where`) if it's the worst yet. */
function keepBreach(records: Map<string, AngleRecord>, breach: Breach, where: string): void {
  const record = records.get(breach.name);
  if (!record) {
    records.set(breach.name, { name: breach.name, frames: 1, worst: breach, where });
    return;
  }
  record.frames++;
  if (breach.by > record.worst.by) {
    record.worst = breach;
    record.where = where;
  }
}

/** A joint past its range, as the report says it: its angle and how far past which range. */
export function describeBreach(breach: Breach): string {
  const range = breach.name.endsWith('.excess') ? 'the raise its plane allows' : `${breach.min}..${breach.max}`;
  return `${breach.name} ${degrees(breach.value)}° (${degrees(breach.by)} past ${range})`;
}

/** Turns the head past the neck's range for one measure, and back. Returns how far past the neck read. */
function measureCanary(lab: Lab): number {
  const neck = lab.joints.neck;
  neck.rotation.y += CANARY_TURN;
  const found = bodyBreaches(lab.joints).found.find((breach) => breach.name === 'neck.rotation');
  neck.rotation.y -= CANARY_TURN;
  lab.joints.root.updateMatrixWorld(true);
  return found?.by ?? 0;
}

/** What one scenario's run keeps as it goes. */
interface ScenarioRun {
  frame: number;
  framesPast: number;
  /** a two-hander's lower grip: the frames the other hand let go of it, how many times it did, and the worst frame's
   *  reason */
  grip: LetGo;
  worstHere: number;
  moment: Pictured | null;
  /** the frame an arm was pinned at the most stops, pictured */
  pinnedMoment: Pictured | null;
  /** the frame the weapon was deepest in the body, pictured */
  bodyMoment: Pictured | null;
  /** the weapon's tip's path through a cast, pictured as the cast ends */
  pathMoment?: Pictured | null;
  /** each frame's arms in the body, and the deepest of them pictured */
  armsIn?: ArmsInSeen[];
  armsInDeepest?: number;
  armsInMoment?: Pictured | null;
  /** the arms in the legs: the deepest, its frame, the frames any was, and the deepest pictured */
  legsDeepest?: ArmInLeg & { at: string };
  legsFrames?: number;
  legsPictured?: number;
  legsMoment?: Pictured | null;
  /** each ankle's fastest move in a frame (m) and where */
  fastest: number;
  fastestAt: string;
}

/** Runs one scenario, set up afresh where every scenario starts, counting what it finds into `records`. */
async function runScenario(
  lab: Lab, scenario: RangeScenario, options: RangeOptions, records: Map<string, AngleRecord>, report: RangeReport,
  listed: string[],
): Promise<void> {
  const at = options.at ?? START;
  const fixture = { at, facing: options.facing ?? 0, nocked: Boolean(lab.player.cls.quiver), fresh: true };
  if (options.biome && G.arena.biome !== options.biome) G.arena.setBiome(options.biome);
  await lab.setup({ ...fixture, gear: options.gear, weapon: options.weapon, tune: options.tune });
  const run: ScenarioRun = {
    frame: 0, framesPast: 0, grip: freshLetGo(), worstHere: PICTURE_FROM, moment: null, pinnedMoment: null,
    bodyMoment: null, fastest: 0, fastestAt: '',
  };
  const ankles = [lab.joints.ankleL, lab.joints.ankleR];
  const last = ankles.map((ankle) => ankle.getWorldPosition(new THREE.Vector3()));
  const tip = new TipMoves(scenario.name);
  const flask = new FlaskMoves(scenario.name);
  const floor = new WeaponFloor(scenario.name);
  const through = new WeaponBody(scenario.name);
  const pinned = new ArmsPinned(scenario.name, ARM_LIMITS);
  const tracer = traceOf(lab, options);
  const onFoe = await foeAhead(lab, scenario, options);
  const path = scenario.legs.some((leg) => leg.cast) ? new WeaponPath() : null;
  // (the pose's cost a frame by the browser's clock, `poseCost.ts`; the canary slows one frame's, in the first
  // scenario a canary runs in)
  const planted = options.canary && !report.canary;
  const cost = new PoseCost(lab.model, planted ? CANARY_FRAME : undefined);
  const measure = () => {
    cost.observe(`${run.frame}${momentIn(lab)}`);
    if (options.canary && !report.canary && run.frame === CANARY_FRAME) {
      const measured = measureCanary(lab);
      const wrist = wristCanary(lab);
      const atStops = pinnedCanary(bodyBreaches(lab.joints).angles, ARM_LIMITS);
      const caught = measured >= CANARY_CAUGHT;
      const body = bodyCanary(lab);
      report.canary = { caught, measured, weapon: weaponCanary(lab), body, wrist, pinned: atStops };
      report.canary.armsIn = armsInCanary(lab.joints);
      report.canary.armsInLegs = armsInLegsCanary(lab.joints);
      report.canary.bladeTurned = bladeCanary(lab);
    }
    const { angles, found } = bodyBreaches(lab.joints, grippingSides(lab));
    if (found.length) run.framesPast++;
    for (const breach of found) {
      keepBreach(records, breach, `${scenario.name} frame ${run.frame}${contextOf(lab, angles, breach.name)}`);
    }
    if (found.length && options.frames) {
      listed.push(`  ${scenario.name} frame ${run.frame}: ${found.map(describeBreach).join(', ')}`);
    }
    noteGrip(run.grip, lab.model.lowerGrip, `${run.frame}${momentIn(lab)}`);
    tip.observe(lab, `${run.frame}${momentIn(lab)}`);
    flask.observe(lab, `${run.frame}${momentIn(lab)}`);
    if (report.canary && report.canary.flaskJump !== true && flask.describe()) report.canary.flaskJump = flask.canary();
    floor.observe(lab, `${run.frame}${momentIn(lab)}`);
    onFoe?.observe(lab, `${run.frame}${momentIn(lab)}`);
    if (path?.observe(lab, `${run.frame}${momentIn(lab)}`)) {
      run.pathMoment = path.picture(lab, `${scenario.what}, the weapon's tip frame by frame`);
    }
    if (onFoe && report.canary && report.canary.foeAside === undefined) {
      report.canary.foeAside = foeCanary(lab, onFoe.foe);
    }
    // (an arm through the body: the hands and forearms against the trunk and head, as the eyes read it, `armsIn.ts`,
    // and against the legs, `armsInLegs.ts`: range read only the joints' angles and the weapon, and a fist in the
    // thigh at two-handed Power Strike's end went by. Each pictured at its deepest, again only once a centimetre
    // deeper: pictured at every deeper frame, a run's pictures closed the browser)
    const inBody = armsInBody(lab.joints);
    (run.armsIn ??= []).push({ frame: run.frame, inBody });
    const armDepth = deepestArm(inBody);
    if (armDepth > (run.armsInDeepest ?? ARM_PICTURED_FROM - PICTURE_STEP) + PICTURE_STEP) {
      run.armsInDeepest = armDepth;
      const parts = inBody.map((arm) => `${arm.limb} ${(arm.depth * 100).toFixed(1)} cm in the ${arm.solid}`);
      run.armsInMoment = lab.picture(`${scenario.what}, an arm in the body`, ['third', 'front', 'left'], [
        `frame ${run.frame}${momentIn(lab)}`, parts.join(', '),
      ]);
    }
    const inLegs = armsInLegs(lab.joints);
    if (inLegs.length) run.legsFrames = (run.legsFrames ?? 0) + 1;
    const deeperOf = (most: ArmInLeg | null, arm: ArmInLeg) => (most && most.depth >= arm.depth ? most : arm);
    const legWorst = inLegs.reduce<ArmInLeg | null>(deeperOf, null);
    if (legWorst && legWorst.depth > (run.legsDeepest?.depth ?? 0)) {
      run.legsDeepest = { ...legWorst, at: `${run.frame}${momentIn(lab)}` };
    }
    if (legWorst && legWorst.depth > (run.legsPictured ?? -PICTURE_STEP) + PICTURE_STEP) {
      run.legsPictured = legWorst.depth;
      run.legsMoment = lab.picture(`${scenario.what}, an arm in a leg`, ['third', 'front', 'left'], [
        `frame ${run.frame}${momentIn(lab)}`, describeArmInLeg(legWorst),
      ]);
    }
    const deeper = through.observe(lab, `${run.frame}${momentIn(lab)}`);
    if (deeper) run.bodyMoment = lab.picture(`${scenario.what}, the weapon in the body`, ['third', 'front', 'left'], [
      `frame ${run.frame}${momentIn(lab)}`, `the weapon ${deeper}`,
    ]);
    const worse = pinned.observe(angles, grippingRanges(lab), `${run.frame}${momentIn(lab)}`);
    if (worse) {
      const notes = [`frame ${run.frame}${momentIn(lab)}`, describeStrain(worse)];
      run.pinnedMoment = lab.picture(`${scenario.what}, pinned`, ['third', 'front', 'left'], notes);
    }
    tracer?.observe(run.frame);
    const traced = tracer?.frames.at(-1);
    if (found.length && traced?.frame === run.frame) traced.line += `  ${found.map(describeBreach).join(', ')}`;
    if (found.length && found[0].by > run.worstHere) {
      run.worstHere = found[0].by;
      const notes = [`frame ${run.frame}`, describeBreach(found[0]) + contextOf(lab, angles, found[0].name)];
      run.moment = lab.picture(`${scenario.what}, worst`, ['third', 'front', 'left'], notes);
    }
    ankles.forEach((ankle, side) => {
      const now = ankle.getWorldPosition(new THREE.Vector3());
      const moved = now.distanceTo(last[side]);
      last[side].copy(now);
      if (run.frame === 0 || moved <= run.fastest) return;
      run.fastest = moved;
      run.fastestAt = `frame ${run.frame}, ${side ? 'R' : 'L'}${footOf(lab, `ankle${side ? 'R' : 'L'}.`)}`;
    });
    run.frame++;
  };
  const press = scenario.legs.some((leg) => leg.cast) ? castPress(lab, options) : null;
  for (const leg of scenario.legs) {
    if (leg.stun) G.player.stun(leg.stun);
    const held = leg.cast && press ? press.frames : 0;
    const input = (f: number) => (press && f < held ? press.frame : { keys: leg.keys, m0: attackDown(leg, f) });
    await lab.step(leg.frames + Math.max(0, held - 1), input, measure);
  }
  cost.stop();
  if (planted && report.canary) report.canary.poseSlow = cost.tooSlow();
  if (!planted && cost.tooSlow()) report.slowPose.push(`${scenario.what}: ${cost.describe()}`);
  if (options.frames) listed.push(...tip.listed, ...flask.listed, ...floor.listed, ...through.listed, ...pinned.listed);
  const tipLine = tip.describe();
  const fastest = `fastest ankle ${(run.fastest * 100).toFixed(1)} cm a frame (${run.fastestAt})`
    + (tipLine ? `; ${tipLine}` : '');
  report.lines.push(`${scenario.what}: ${run.frame} frames, ${run.framesPast} with a joint past its range; ${fastest}`);
  report.lines.push(`  ${cost.describe()}`);
  if (run.grip.seen) report.lines.push(`  ${describeLetGo(run.grip)}`);
  const underFloor = floor.describe();
  if (underFloor) report.lines.push(`  ${underFloor}`);
  if (onFoe) report.lines.push(`  ${onFoe.describe()}`);
  const nearFloor = scenario.legs.some((leg) => leg.cast) ? floor.describeNearest() : '';
  if (nearFloor) report.lines.push(`  ${nearFloor}`);
  if (nearFloor && floor.bladeAcross()) report.bladeAcross.push(`${scenario.what}: ${nearFloor}`);
  const inBody = through.describe();
  if (inBody) report.lines.push(`  ${inBody}`);
  const flaskLine = flask.describe();
  if (flaskLine) report.lines.push(`  ${flaskLine}`);
  const pathLine = path?.describe();
  if (pathLine) report.lines.push(`  ${pathLine}`);
  if (run.pathMoment) report.moments.push(run.pathMoment);
  if (run.armsIn) report.lines.push(`  ${describeArmsIn(run.armsIn, 'the arms in the body')}`);
  if (run.armsInMoment) report.moments.push(run.armsInMoment);
  const legs = run.legsDeepest;
  const legsLine = legs
    ? `an arm in a leg on ${run.legsFrames} frames, the deepest ${describeArmInLeg(legs)} (frame ${legs.at})`
    : 'the arms clear of the legs';
  report.lines.push(`  ${legsLine}`);
  if (legs) report.armsInLegs.push(`${scenario.what}: ${legsLine}`);
  if (run.legsMoment) report.moments.push(run.legsMoment);
  if (path && report.canary) report.canary.pathAside = path.canary();
  const atStops = pinned.describe();
  if (atStops) report.lines.push(`  ${atStops}`, `    the stops: ${pinned.tally()}`);
  if (run.grip.frames > 0) report.letGo.push(`${scenario.what}: ${describeLetGo(run.grip)}`);
  report.lines.push(...(tracer?.frames ?? []).map((traced) => traced.line));
  if (run.moment) report.moments.push(run.moment);
  if (run.pinnedMoment) report.moments.push(run.pinnedMoment);
  if (run.bodyMoment) report.moments.push(run.bodyMoment);
}

/** The frame that casts the skill asked for (`--skill`) ahead of the hero, as the player would on its key, with its
 *  cooldown over (bound first, if the hero knows it but hasn't it on a key), and how many frames its key is held. */
function castPress(lab: Lab, options: RangeOptions): { frame: Frame; frames: number } {
  if (!options.skill) throw new Error('lab: range: the cast scenario needs --skill');
  bindKnown(options.skill);
  const { key, def } = skillNamed(options.skill);
  lab.player.cooldowns.clear();
  const facing = lab.player.facing;
  const ahead = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing));
  const aim = lab.player.pos.clone().addScaledVector(ahead, CAST_AIM);
  const frames = Math.max(1, Math.round(holdFor(def) / (window.__labClock.frame / 1000)));
  return { frame: pressing(key, aim, true), frames };
}

/** A two-hander's lower grip through a scenario, as the model held it (`Model.lowerGrip`). */
interface LetGo {
  /** whether the hero held a two-hander at all */
  seen: boolean;
  frames: number;
  times: number;
  held: boolean;
  /** the frame let go of furthest from holding (and the moment of the move then), and why */
  worst: { frame: string; grip: LowerGrip } | null;
  /** the frames it was let go of on (the first few), each with the moment of the move then */
  starts: string[];
  /** the frames the other hand let go of it on purpose: the weapon on the shoulder, or the flask in that hand */
  free: number;
}

/** how many of the frames a two-hander was let go of on are listed */
const STARTS_LISTED = 8;

const freshLetGo = (): LetGo => ({ seen: false, frames: 0, times: 0, held: true, worst: null, starts: [], free: 0 });

/** How far a lower grip let go of is from being held: the worst of its reasons, each against what the hold allows
 *  (models/warrior.ts: 7 cm short, its joints 15 degrees past, the arm 3 cm into the body). */
export const farFromHeld = (grip: LowerGrip) => Math.max(grip.short / 0.07, grip.past / 15, grip.into / 0.03);

/** Why a lower grip was let go of, as words: how far past the arm's reach, its joints past their ranges, the arm into
 *  the body. */
export function whyLetGo(grip: LowerGrip): string {
  const reach = grip.short > 0 ? `${(grip.short * 100).toFixed(0)} cm past the arm's reach` : "within the arm's reach";
  const why = [`the lower grip ${reach}`, `its joints ${grip.past.toFixed(0)}° past`,
    `the arm ${(grip.into * 100).toFixed(1)} cm into the body`];
  return why.join(', ');
}

/** The moment of the move the hero is in, as words after a frame's number: " (0.70 of Rending Cleave)", or none. */
function momentIn(lab: Lab): string {
  const cast = lab.player.casting;
  if (!cast || !(cast.dur > 0)) return '';
  return ` (${Math.min(1, cast.t / cast.dur).toFixed(2)} of ${cast.skill.def.name})`;
}

/** Counts a frame of the lower grip (`frame`, its number and the moment of the move then) into `letGo`. */
function noteGrip(letGo: LetGo, grip: LowerGrip | null | undefined, frame: string): void {
  if (!grip) return;
  letGo.seen = true;
  // (let go of on purpose: the game before this had no such grip, `free` unset)
  if (grip.free) {
    letGo.free++;
    letGo.held = true;
    return;
  }
  if (!grip.held) letGo.frames++;
  if (letGo.held && !grip.held && ++letGo.times <= STARTS_LISTED) letGo.starts.push(frame);
  letGo.held = grip.held;
  if (!grip.held && (!letGo.worst || farFromHeld(grip) > farFromHeld(letGo.worst.grip))) {
    letGo.worst = { frame, grip: { ...grip } };
  }
}

/** A scenario's lower grip as words: held throughout, or let go of how often, and why at the worst. */
function describeLetGo(letGo: LetGo): string {
  const free = letGo.free ? ` but on the ${letGo.free} frames it was on the shoulder or the flask in hand` : '';
  if (!letGo.worst) return `the two-hander held in both hands throughout${free}`;
  const { frame, grip } = letGo.worst;
  return `the two-hander let go of by the other hand on ${letGo.frames} frames, ${letGo.times} times (from frames `
    + `${letGo.starts.join(', ')}); the worst, frame ${frame}: ${whyLetGo(grip)}${free ? `; held${free}` : ''}`;
}

/** The scenario's trace of the leg IK, when the options ask for one. */
function traceOf(lab: Lab, options: RangeOptions): LegTrace | null {
  const span = traceSpanOf(options);
  if (!span) return null;
  const legs = lab.model.root.userData.legs as LegIK | undefined;
  if (!legs) throw new Error(`lab: range: the ${lab.player.cls.id} has no leg IK to trace`);
  return new LegTrace(lab, legs, span);
}

/**
 * Runs the scenarios asked for, one after another (each set up afresh where they start), and reports every angle the
 * body took past its range.
 */
export async function range(lab: Lab, options: RangeOptions): Promise<RangeReport> {
  const every = RANGE_SCENARIOS.filter((name) => name !== 'cast' || options.skill);
  const asked = options.scenarios?.length ? options.scenarios : every;
  const records = new Map<string, AngleRecord>();
  const report: RangeReport = { lines: [], moments: [], letGo: [], armsInLegs: [], bladeAcross: [], slowPose: [] };
  const listed: string[] = [];
  for (const scenario of SCENARIOS.filter((candidate) => asked.includes(candidate.name))) {
    await runScenario(lab, scenario, options, records, report, listed);
  }
  const worstFirst = [...records.values()].sort((a, b) => b.worst.by - a.worst.by);
  report.lines.push(worstFirst.length ? 'past their ranges, the worst first:' : 'every joint within its range');
  for (const record of worstFirst) {
    report.lines.push(`  ${describeBreach(record.worst)} on ${record.frames} frames, the worst in ${record.where}`);
  }
  report.lines.push(...listed);
  if (report.canary) {
    const verdict = report.canary.caught ? 'caught' : 'MISSED';
    const past = degrees(report.canary.measured);
    report.lines.push(`canary, the head turned past the neck's range: ${verdict} (${past} past)`);
    const weapon = report.canary.weapon;
    const under = `${weapon >= WEAPON_CAUGHT ? 'caught' : 'MISSED'} (${(weapon * 100).toFixed(0)} cm under)`;
    report.lines.push(`canary, the hero sunk under the floor: the weapon ${under}`);
    const body = report.canary.body;
    const into = `${body >= BODY_CANARY_CAUGHT ? 'caught' : 'MISSED'} (${(body * 100).toFixed(0)} cm into it)`;
    report.lines.push(`canary, the grip moved into the left thigh: the weapon ${into}`);
    report.lines.push(`canary, the right fist bent on its forearm: ${report.canary.wrist.join('; ')}`);
    report.lines.push(`canary, the right arm held at its stops: ${report.canary.pinned ? 'caught' : 'MISSED'}`);
    const aside = report.canary.foeAside;
    if (aside !== undefined) report.lines.push(`canary, the foe moved aside: ${aside ? 'MISSED' : 'caught'}`);
    if (report.canary.armsIn) report.lines.push(`canary, the right elbow in the chest: ${report.canary.armsIn}`);
    const inLegs = report.canary.armsInLegs;
    if (inLegs) report.lines.push(`canary, a hand in the left thigh: ${inLegs}`);
    const turned = report.canary.bladeTurned;
    if (turned !== undefined) {
      const verdict = turned > EDGE_OFF_MOST ? 'caught' : 'MISSED';
      const further = `${turned.toFixed(0)}° further`;
      report.lines.push(`canary, the weapon turned a quarter round its grip: ${verdict} (${further})`);
    }
    const poseSlow = report.canary.poseSlow;
    if (poseSlow !== undefined) {
      report.lines.push(`canary, one frame's pose made 40 ms slower: ${poseSlow ? 'caught' : 'MISSED'}`);
    }
    const flaskJump = report.canary.flaskJump;
    if (flaskJump !== undefined) {
      report.lines.push(`canary, the flask's arm's elbow moved far in a frame: ${flaskJump ? 'caught' : 'MISSED'}`);
    }
    const pathAside = report.canary.pathAside;
    if (pathAside !== undefined) {
      report.lines.push(`canary, a point of the tip's path moved aside: ${pathAside ? 'caught' : 'MISSED'}`);
    }
  }
  return report;
}

/** An arm in a leg as words: which arm, its part, how deep, in which leg. */
function describeArmInLeg(arm: ArmInLeg): string {
  const side = arm.side === 'L' ? 'left' : 'right';
  return `the ${side} ${arm.limb} ${(arm.depth * 100).toFixed(1)} cm into the ${arm.leg}`;
}

/** an arm this far into the body (the rig's units) is pictured, at its deepest: past what armour and cloth stand off;
 *  and again only this much deeper (m) */
const ARM_PICTURED_FROM = 0.03;
const PICTURE_STEP = 0.01;

/** how far ahead of him the foe of `--foe` stands by default (m: within a two-hander's blow) */
const FOE_AHEAD = 1.8;

/** The foe `--foe` asks for stood ahead of the hero for the `cast` scenario, once it has risen, and what's read of
 *  the weapon over it; none for any other scenario. */
async function foeAhead(lab: Lab, scenario: RangeScenario, options: RangeOptions): Promise<WeaponOnFoe | null> {
  if (!options.foe || scenario.name !== 'cast') return null;
  const ahead = options.foeAt ?? FOE_AHEAD;
  const facing = lab.player.facing;
  const at = lab.player.pos.clone().add(new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing)).multiplyScalar(ahead));
  const foe = lab.spawnFoe(options.foe as EnemyId, at);
  await lab.until(() => foe.spawning <= 0, 600, `the ${options.foe} ahead never rose`);
  return new WeaponOnFoe(foe);
}

/** The canary, if it ran and was missed, as a problem. */
export function missedRangeCanary(report: RangeReport): string[] {
  if (!report.canary) return [];
  const missed = report.canary.caught ? [] : ['range: the canary (the head turned past its range) was missed'];
  const sunk = report.canary.weapon >= WEAPON_CAUGHT;
  const weapon = sunk ? [] : ['range: the canary (the weapon under the floor) was missed'];
  const inThigh = report.canary.body >= BODY_CANARY_CAUGHT;
  const body = inThigh ? [] : ['range: the canary (the weapon through the thigh) was missed'];
  const bent = report.canary.wrist.some((verdict) => verdict.startsWith('missed'));
  const wrist = bent ? ['range: the canary (the fist bent on its forearm) was missed'] : [];
  const pinned = report.canary.pinned ? [] : ['range: the canary (the right arm held at its stops) was missed'];
  const aside = report.canary.foeAside ? ['range: the canary (the foe moved aside) was missed'] : [];
  const legMissed = report.canary.armsInLegs?.startsWith('missed');
  const leg = legMissed ? ['range: the canary (a hand in the left thigh) was missed'] : [];
  const armMissed = report.canary.armsIn?.startsWith('missed');
  const arm = armMissed ? ['range: the canary (the right elbow moved into the chest) was missed'] : [];
  const pathMissed = report.canary.pathAside === false;
  const path = pathMissed ? ["range: the canary (a point of the tip's path moved aside) was missed"] : [];
  const turned = report.canary.bladeTurned;
  const blade = turned !== undefined && turned <= EDGE_OFF_MOST
    ? ['range: the canary (the weapon turned a quarter round its grip) was missed']
    : [];
  const jumpMissed = report.canary.flaskJump === false;
  const jump = jumpMissed ? ["range: the canary (the flask's arm's elbow moved far in a frame) was missed"] : [];
  const slow = report.canary.poseSlow === false ? ["range: the canary (one frame's pose made slower) was missed"] : [];
  return [...missed, ...weapon, ...body, ...wrist, ...pinned, ...aside, ...path, ...arm, ...leg, ...blade, ...jump, ...slow];
}

/** Each scenario in which a two-hander was let go of, as a problem: nothing it runs flings the arms apart. */
export function lettingGo(report: RangeReport): string[] {
  return report.letGo.map((line) => `range: ${line}`);
}

/** Each scenario whose blow met the floor flat or sideways, as a problem ("nobody hits like this"). */
/** Each scenario with a frame whose pose took longer than `POSE_MOST`, as a problem. */
export function slowPose(report: RangeReport): string[] {
  const most = `over ${POSE_MOST} ms on two frames or more, or ${POSE_ONCE_MOST} on one`;
  return report.slowPose.map((line) => `range: the pose took ${most}: ${line}`);
}

export function bladeAcross(report: RangeReport): string[] {
  return report.bladeAcross.map((line) => `range: the blade met the floor off the blow's line: ${line}`);
}

/** An angle in whole degrees, a hair under nought said as 0 (`-0`, by the last bits of a float, came and went). */
function wholeDegrees(degrees: number): string {
  return Math.round(degrees) === 0 ? '0' : degrees.toFixed(0);
}
