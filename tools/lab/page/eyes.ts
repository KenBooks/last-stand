// tools/lab eyes: a move as the eyes see it. A skill cast through the eyes (`times` in a row, its key held as the
// player would), stepped frame by frame from the press until the arms are back at rest, with the weapon's blade (its
// middle: a long blade's tip is out of the frame's top as often as not) and both hands placed on the screen each
// frame: where the blade goes across the view (at rest, wound up, through the blow, where it ends), how fast, where it
// is as the skill fires, and whether a two-hander stays in both hands, both seen.
// A film of the frames goes with it. (Through the eyes the warrior's strikes read as weak, #224; the owner: "first
// person view should at least in spirit match common sense, two handed, heavy".)
import * as THREE from 'three';
import { G } from '../../../src/state';
import type { Lab, Fixture, Pictured, Report, ViewName } from './lab';
import { bindKnown, holdFor, pressing, skillNamed, type BoundSkill } from './cast';
import {
  armOf, bodyBreaches, describeBreach, drawnHand, FIST_OPEN, grippingSides, whyLetGo, wristCanary,
} from './range';
import type { Fist, LowerGrip } from '../../../src/types';
import { SKILL_IMPLS } from '../../../src/combat/skills';
import type { Breach } from '../../../src/entities/models/anatomy';
import { viewArms } from '../../../src/entities/viewModel';
import { armsLens } from './inFrame';
import { headCanary } from './heads';
import {
  describeStrike, floorLowered, plantLead, plantSlide, SLID_WHIP, stoppedByFloor, StrikeTracker, strikeIn,
  strikeProblems,
} from './strike';
import type { Strike, StrikeFrame } from './strike';
import {
  aimCrossing, describeLanding, landingProblems, restBlades, restInView, sweptOver, tipAtEnd, weaponsAlong,
  weaponsInView,
} from './cuts';
import type { AlongView, InView, Landing } from './cuts';
import { atRest, rowOfCuts } from './cutRows';
import type { CutFrame, RestBlades, RowCast } from './cutRows';
import { swingDiagram } from './swingDiagram';
import {
  describeMomentum, momentumCanary, momentumOf, momentumProblems, rowCanary, rowOfSwings,
} from './momentum';
import type { Momentum, SwingFrame } from './momentum';
import { describeKeyed, describeKeyedFrame, keyedAway, triple, type KeyedFrame } from './keyed';
import { keyedNow } from './keyedNow';
import { armsInBody, armsInCanary, describeArmsIn, type ArmIn } from './armsIn';
import type { ArmAt, ArmsAt, Lens, Phase } from './swingDiagram';
import { JUMP_SIDE, JUMP_TIMES, jumpsOf, stillestFrame, type FrameJump, type JumpFrame } from './jumps';

export interface EyesOptions {
  fixture: Fixture;
  /** the skill cast (its key, its behaviour or its name) */
  skill: string;
  /** how many casts in a row, the key held through them (a basic attack's chain of swings) */
  times: number;
  /** each cast after the first pressed this long after the last one ended (s), the key let go between them (null:
   *  held through) */
  apart: number | null;
  /** a frame pictured into the film every this many, of one cast of the row (its index from 1) or of all */
  every: number;
  cast: number | null;
  /** the close-ups each cast's firing frame is pictured from too, the arms and the weapon seen from outside */
  close: ViewName[];
  /** the film taken (off: the numbers alone) */
  film: boolean;
  /** every frame listed: the grip, the weapon's way and the other hand in the eyes' frame */
  frames: boolean;
  /** and only those from the first to the second, if given (a key tuned is read off a few frames) */
  span: [number, number] | null;
  canary: boolean;
}

/** A point of the hero's as the eyes see it: across the screen (0 its left edge, 1 its right) and down it (0 its top,
 *  1 its bottom), whether it's in the frame, where it is in the camera's space (m: x right, y up, -z ahead, as the
 *  moves through the eyes are keyed) and the way to it from the camera (which holds behind the camera too, where the
 *  screen's places don't). */
interface Spot {
  x: number;
  y: number;
  on: boolean;
  ahead: boolean;
  /** in the frame or near its edge (`NEAR_FRAME`) */
  near: boolean;
  at: THREE.Vector3;
  way: THREE.Vector3;
}

/** A frame as the eyes saw it. */
interface Seen {
  frame: number;
  /** the cast of the row it's in (0 on, -1 before the first), and how far through it (null outside a cast) */
  cast: number;
  share: number | null;
  /** the skill fired on this frame */
  fires: boolean;
  /** the weapon's tip, and its blade: the middle of the weapon from its grip to its tip */
  tip: Spot;
  blade: Spot;
  /** the hand holding the weapon (its grip), and the other hand (its fist) */
  grip: Spot;
  other: Spot;
  /** a two-hander's lower grip, where the other hand holds it (`Model.offGrip`: none for any other weapon, nor on a
   *  game without it) */
  lower: Spot | null;
  /** a two-hander's lower grip held by the other hand (`Model.lowerGrip`): null for any other weapon; and as it was
   *  when let go of, for why */
  held: boolean | null;
  grasp: LowerGrip | null;
  /** how far the other hand's fist is from a two-hander's lower grip (m, at the hero's own size; null for any other
   *  weapon): read off the hands as drawn, not the game's word (`held`), so a hand planted off it reads off it */
  lowerOff: number | null;
  /** how far the blade moved across the eyes' view since the frame before (degrees), and as seen: only while it's in
   *  or near the frame (passing close beside the eyes out of the view, it swept 90 degrees of their view in a frame,
   *  and that read as the blow) */
  moved: number;
  seenMoved: number;
  /** the arms' joints past their ranges, the worst first (what the eyes see of the body), and each as words, a
   *  shoulder's with its raise, plane and turn (its excess alone didn't say which took it past) */
  armsPast: Breach[];
  armsPastWords: string[];
  /** each hand's wrist as it bends its weapon against the forearm (the owner: "direction of the hands vs forearm") */
  wrists: Wrist[];
  /** each hand holding a handle: how it holds it, and whether its fist is in the frame */
  fists: SeenFist[];
  /** how the weapon the tip is on strikes (page/strike.ts), and where its blow lands as the eyes see it (page/
   *  momentum.ts): null when it's on none */
  strike: StrikeFrame | null;
  swing: SwingFrame | null;
  /** whether the game swings a weapon in a strike this frame (`Model.swung`, which the swing's trail follows; on a
   *  game without it, every frame): a strike is looked for over these alone (a war cry's, a drink's, a raised
   *  shield's weapon strikes nothing, and was failed as led by its flat and never crossing the aim) */
  striking: boolean;
  /** the arms and the weapon in the eyes' space, for the swing diagram */
  pose: ArmsAt;
  /** which way a swing goes (`Model.swing`: 1 the forehand; null on a game without it), and the hand whose weapon
   *  the tip is on */
  side: number | null;
  hand: 'right' | 'left';
  /** that weapon in the frame (page/cuts.ts `weaponsAlong`: its share along its length, and how long it looks, a share
   *  of the frame's height; 0 with none held) */
  shown: number;
  looks: number;
  /** the arm a swing keyed this frame against the arm drawn (page/keyed.ts): null when none keyed one */
  keyed: KeyedFrame | null;
  /** each arm's deepest part in the body the view hides (page/armsIn.ts): none for an arm clear of it */
  inBody: ArmIn[];
  /** each arm (the right's, the left's) in or near the frame anywhere from its shoulder to its fist */
  armsNear: [boolean, boolean];
}

/** What `follow` saw: every frame, the frame before the first press (the arms at rest) and each held weapon's blade
 *  then, each one's share in the frame then, and whether the hero's tip is at its weapon's end (problems if not). */
interface Followed {
  seen: Seen[];
  rest: Seen;
  blades: RestBlades;
  views: InView[];
  tip: string[];
}

interface SeenFist extends Fist {
  on: boolean;
}

/** A hand's wrist (degrees, anatomy.ts `measureBody`): the forearm's turn, and the wrist's bend each way. */
interface Wrist {
  side: 'R' | 'L';
  pronation: number;
  flexion: number;
  radial: number;
}

/** idle frames before the press, so the arms are at rest */
const SETTLE_FRAMES = 30;
/** after the last cast: at rest once the blade moves less than this a frame (degrees) for `REST_FRAMES` */
const REST_MOVE = 0.1;
const REST_FRAMES = 10;
/** the most frames followed after the last cast is over */
const AFTER_FRAMES = 240;
/** the most frames a row of casts is followed */
const MOST_FRAMES = 900;
/** a two-hander's other hand out of the frame for longer than this (ms) has it seen in one hand: the frame is too
 *  narrow to hold both fists, a quarter of a metre apart up the handle, through a wind-up beside the head (where a
 *  person's own eyes lose them too) */
const ONE_HAND_SPELL = 200;
/** a spot this far out from the frame's middle is near it (its edge is 1 each way) */
const NEAR_FRAME = 1.3;
/** the blow: the frames round the fastest that move at least this share of it */
const BLOW_SHARE = 0.4;
/** a move whose fastest frame is under this (degrees a frame) has no blow (the canary's frozen arms) */
const NO_BLOW = 1;
/** how far ahead of the hero the skill is aimed (m) */
const AIM_AHEAD = 6;
/** the film: frames across a row, and each frame's width (px) */
const FILM_COLUMNS = 5;
const FILM_WIDTH = 384;
/** a strike strip's frames before its fastest, and after it */
const STRIP_ROUND = 4;
/** where a fist closes, along the hand from its wrist (m, before the model's scale): the other hand is seen there
 *  (read at the wrist, a fist on a two-hander's lower grip at the bottom of the frame read as out of it) */
const FIST_ALONG = 0.08;
/** the other hand's fist this far from a two-hander's lower grip (m) has let go of it: held, the fist's point
 *  (`FIST_ALONG` down the hand) reads about 7 cm from it, and let go, 50 cm and more within four frames */
const LOWER_LET_GO = 0.15;
/** the canary turns the other arm down this far (rad), out of the frame */
const CANARY_DROP = 1.6;
/** a fist this far off its handle's axis (m), or with its fingers curled less than this (rad, their joints' mean
 *  bend), holds it as an open hand: through the eyes the fingers stood straight out beside the handle */
const FIST_OFF = 0.012;
/** and one this far along its handle from where it holds it (m) has slid off its grip: measured square to the handle
 *  alone, a weapon lifted 15 cm along its own length out of both fists read as held */
const FIST_SLID = 0.02;
/** the canary lifts the weapon this far up the view (m), out of the fists, its lower grip into the frame */
const CANARY_LIFT = 0.15;
/** a jump between frames moves the weapon's tip at least this fast (m/s; page/jumps.ts) */
const JUMP_SPEED = 6;
/** the jump canary lifts the weapon this far up the view (m) on one frame alone */
const CANARY_JUMP = 0.3;
/** an elbow moving at least this fast into a frame (m/s) has jumped, by the weapon's rule of the moves round it
 *  (page/jumps.ts): one swung with a blow moves a third as fast as a blade's tip */
const ELBOW_JUMP_SPEED = 3;
/** the elbow canary moves the right elbow this far up the view (m) on one frame alone */
const CANARY_ELBOW = 0.3;

/** the strike's canaries: how far the weapon is turned off the way its blow moves (degrees: its edge leading, then
 *  its flat), and how far off that its strike may be read */
const CANARY_TURNS = [0, 90];
const CANARY_LEAD = 10;
/** the floor's canary reads the floor this far under where it is (m): a blow it stopped then stops in the air */
const CANARY_FLOOR = 0.3;

/** the ranges of the arms' joints, by their names in `breaches` */
const ARM_RANGE = /^(shoulder|elbow|forearm|wrist)[LR]\./;
/** and those a run fails on: not the shoulders', which the eyes place by hand under the camera and never see
 *  (models/warrior.ts `armsFromBelow`; the owner: "in 1st person mode we dont care about shoulder anatomy much, as
 *  long as overall strike looks plausible"), still described */
const SEEN_RANGE = /^(elbow|forearm|wrist)[LR]\./;

/** the joints the canary holds as they were at the press: the arms, and the body and trunk they hang from, the hips up
 *  (frozen alone, the arms swung with the trunk's turn, and with Steel Tempest's spin, which turns the body and the
 *  hips, and that read as a blow) */
const FROZEN_JOINTS = [
  'body', 'hips', 'spine', 'chest', 'shoulderR', 'elbowR', 'handR', 'shoulderL', 'elbowL', 'handL',
] as const;

/** Casts the skill through the eyes and reports what the eyes saw; with the canary, again with its faults planted. */
export async function eyes(lab: Lab, options: EyesOptions): Promise<Report> {
  const setup = await lab.setup({ ...options.fixture, view: 'first' });
  bindKnown(options.skill);
  const skill = skillNamed(options.skill);
  const film = options.film ? new Film(options.every, options.cast, options.close) : null;
  const followed = await follow(lab, skill, options, film);
  const { seen } = followed;
  const lines = [`set up as ${JSON.stringify(setup)}`, shouldersSeen(lab), ...describeCasts(seen, skill.def.name)];
  lines.push(describeArmsPast(seen));
  if (options.frames) lines.push(...describeFrames(inSpan(seen, options.span)));
  lines.push(describeFists(seen));
  const struck = describeStrikes(seen, skill.def);
  lines.push(...struck.lines);
  const keyed = describeKeyed(seen);
  lines.push(...keyed.lines);
  lines.push(describeArmsIn(seen));
  const atRest = restInView(followed.views);
  lines.push(atRest.line);
  const row = cutsOf(followed, struck.strikes, skill);
  if (row) lines.push(...row.lines);
  const swings = swingsOf(seen, struck.strikes, skill);
  lines.push(...swings.lines);
  const jumps = describeJumps(followed);
  lines.push(jumps.line);
  const elbows = describeElbowJumps(followed);
  lines.push(elbows.line);
  const found = [...oneHanded(seen), ...openFists(seen), ...struck.problems, ...atRest.problems, ...followed.tip];
  found.push(...(row?.problems ?? []), ...keyed.problems, ...swings.problems, ...jumps.problems);
  found.push(...elbows.problems);
  // (listed and not counted, a fist hung flexed 57 degrees off its forearm through a cut was called done; counted
  // where the arm is out of the frame, a two-hander's backhand failed on a forearm no one sees, below the frame from
  // the shoulder to the fist through the whole row)
  const seenPast = (breach: Breach, now: Seen) => SEEN_RANGE.test(breach.name) && breachShown(breach, now);
  if (seen.some((now) => now.armsPast.some((breach) => seenPast(breach, now)))) {
    found.push(describeArmsPast(seen, seenPast, 'the arms past their ranges in or near the frame'));
  }
  const problems = found.map((line) => `${skill.def.name}: ${line}`);
  if (options.canary) {
    await lab.setup({ ...options.fixture, view: 'first' });
    const bent = wristCanary(lab);
    lines.push(`canary, the right fist bent on its forearm: ${bent.join('; ')}`);
    const pushed = armsInCanary(lab.joints);
    lines.push(`canary, the right elbow moved into the chest: ${pushed}`);
    const planted = await follow(lab, skill, options, null, plantFaults(lab));
    const caught = canaryCaught(planted, followed, skill);
    // (a canary missed is read off its own frames)
    if (options.frames) {
      lines.push('the canary\'s frames, its faults planted:', ...describeFrames(inSpan(planted.seen, options.span)));
    }
    lines.push(`canary, the arms held as they were at the press and the other arm dropped: ${caught.join('; ')}`);
    const leads = struckIn(seen) ? await strikeCanaries(lab, options, skill) : ['skipped: no weapon struck'];
    lines.push(`canary, the weapon turned about its length each frame: ${leads.join('; ')}`);
    const slid = struckIn(seen) ? await slideCanary(lab, options, skill) : 'skipped: no weapon struck';
    lines.push(`canary, the weapon held at its first turn, sliding with the hand: ${slid}`);
    const lifted = await liftCanary(lab, options, skill, followed);
    lines.push(`canary, the weapon lifted out of the fists each frame: ${lifted}`);
    const jumped = await jumpCanary(lab, options, skill, followed);
    lines.push(`canary, the weapon lifted ${CANARY_JUMP * 100} cm on its stillest frame alone: ${jumped}`);
    const elbowJumped = await elbowCanary(lab, options, skill, followed);
    lines.push(`canary, the right elbow moved ${CANARY_ELBOW * 100} cm on its stillest frame alone: ${elbowJumped}`);
    const swung = swings.canary();
    if (swung.length) lines.push(`canary, faults planted in the first cut's swing: ${swung.join('; ')}`);
    const floored = floorCanary(seen);
    lines.push(`canary, the floor read ${CANARY_FLOOR * 100} cm under where it is: ${floored}`);
    const verdicts = [...bent, pushed, ...caught, ...leads, slid, lifted, jumped, elbowJumped, ...swung, floored];
    if (verdicts.some((verdict) => verdict.startsWith('missed'))) problems.push('the canary was missed');
  }
  const moments: Pictured[] = film ? [film.moment(`${skill.def.name} through the eyes`), ...film.closeUps] : [];
  if (film) moments.push(...strips(film, seen, struck.strikes, skill.def.name));
  const drawn = film ? diagrams(seen, struck.strikes, skill.def.name) : [];
  moments.push(...drawn.filter((_, i) => options.cast === null || i === options.cast - 1));
  return { text: lines.join('\n'), problems, moments };
}

/** Each cast's strike as a strip of the film's frames round it, one after another. */
function strips(film: Film, seen: Seen[], strikes: (Strike | null)[], name: string): Pictured[] {
  return castFrames(seen).flatMap((frames, i) => {
    const strike = strikes[i];
    if (!strike) return [];
    const strip = film.strip(`${name} ${i + 1}: the strike`, frames[strike.fastest].frame);
    return strip ? [strip] : [];
  });
}

/** Each cast's swing diagram (page/swingDiagram.ts): its frames' arms and weapon, coloured by where each falls round
 *  its strike. */
function diagrams(seen: Seen[], strikes: (Strike | null)[], name: string): Pictured[] {
  const lens = lensNow();
  return castFrames(seen).map((frames, i) => {
    const strike = strikes[i];
    const phaseOf = (index: number): Phase => {
      if (!strike || index < strike.from) return 'before';
      return index <= strike.to ? 'strike' : 'after';
    };
    const before = strike ? strike.from : frames.length;
    const diagramFrames = frames.map((frame, index) => ({
      pose: frame.pose,
      phase: phaseOf(index),
      through: before > 1 ? Math.min(1, index / (before - 1)) : 1,
      fires: frame.fires,
    }));
    // (the cast's own frames: the way back to rest after it buried its swing)
    const own = diagramFrames.filter((_, index) => index === 0 || frames[index].share !== null);
    return swingDiagram(`${name} ${i + 1}: the swing`, own, lens);
  });
}

/** How wide the arms' lens sees (inFrame.ts `armsLens`: their own camera's, or the game's). */
function lensNow(): Lens {
  const lens = armsLens() as THREE.PerspectiveCamera;
  const halfUp = Math.tan(THREE.MathUtils.degToRad(lens.fov) / 2) / lens.zoom;
  return { halfUp, halfAcross: halfUp * lens.aspect };
}

/** The arms and the held weapon in the eyes' space (the camera's), for the swing diagram. */
function armsAt(lab: Lab): ArmsAt {
  const { joints } = lab;
  const inEyes = (object: THREE.Object3D) => G.camera.worldToLocal(object.getWorldPosition(new THREE.Vector3()));
  const arm = (side: 'R' | 'L'): ArmAt => [
    inEyes(joints[`shoulder${side}`]),
    inEyes(joints[`elbow${side}`]),
    inEyes(joints[`hand${side}`]),
  ];
  const tip = lab.model.tip;
  const grip = tip?.parent;
  return { arms: [arm('R'), arm('L')], weapon: tip && grip ? [inEyes(grip), inEyes(tip)] : null };
}

/**
 * The frames from the press of `skill`'s key (held through `times` casts, or as long as the player would; or let go
 * between casts and pressed again `apart` s after each ended) until the arms are at rest again, each as the eyes saw
 * it, and the arms at rest before the press; `plant`, if given, changes each frame (and the rest) before it's read,
 * and `unplant` takes the change back once it's read, so the next frame is posed from the game's own.
 */
async function follow(
  lab: Lab, skill: BoundSkill, row: { times: number; apart: number | null }, film: Film | null, plant?: () => void,
  unplant?: () => void,
): Promise<Followed> {
  // (every run of the cast from the same state, the canaries' as the first: Steel Tempest drains energy while held,
  // and the runs after the first ended their spin 11 frames sooner, the jump canary's lift planted past their end)
  G.player.energy = G.player.stats.maxEnergy;
  G.player.cooldowns.clear();
  await lab.step(SETTLE_FRAMES);
  const aim = aheadOf(lab, AIM_AHEAD);
  const casts = new CastCount(lab);
  const strikes = new StrikeTracker(lab, Boolean(skill.def.spin));
  plant?.();
  const rest = seeFrame(lab, -1, casts, undefined, strikes);
  unplant?.();
  const blades = restBlades(lab, G.camera);
  const views = weaponsInView(lab);
  const tip = tipAtEnd(lab);
  const presses = new Presses(skill, row);
  const seen: Seen[] = [];
  let resting = 0;
  let after = 0;
  for (let frame = 0; frame < MOST_FRAMES; frame++) {
    const down = presses.down(frame, casts.started, Boolean(actionNow(lab)));
    await lab.step(1, () => pressing(skill.key, aim, down));
    casts.read();
    plant?.();
    const now = seeFrame(lab, frame, casts, seen[seen.length - 1] ?? rest, strikes);
    seen.push(now);
    film?.take(lab, now);
    unplant?.();
    if (casts.started === 0) {
      if (frame > SETTLE_FRAMES) throw new Error(`lab: eyes: ${skill.def.name} was never cast`);
      continue;
    }
    if (actionNow(lab) || casts.started < row.times) continue;
    // (still, and back where it rested: a cut's end held still for the next attack read as the rest, and its hold
    // was cut off after 167 ms)
    resting = now.moved < REST_MOVE && atRest(cutOf(now), blades) ? resting + 1 : 0;
    after++;
    if (resting >= REST_FRAMES || after >= AFTER_FRAMES) break;
  }
  const name = skill.def.name;
  if (casts.started < row.times) throw new Error(`lab: eyes: ${name} was cast ${casts.started} times of ${row.times}`);
  return { seen, rest, blades, views, tip };
}

/** When the skill's key is down: held through the casts of a row (or as long as the player would hold it), or let go
 *  as each cast begins and pressed again `apart` s after it ended. */
class Presses {
  private readonly holdFrames: number;
  private readonly apartFrames: number | null;
  private idle = 0;

  constructor(skill: BoundSkill, private readonly row: { times: number; apart: number | null }) {
    const frameS = window.__labClock.frame / 1000;
    this.holdFrames = Math.round(holdFor(skill.def) / frameS);
    this.apartFrames = row.apart === null ? null : Math.round(row.apart / frameS);
  }

  /** Whether the key is down on `frame`, `started` casts begun so far and one going on now or not (`acting`). */
  down(frame: number, started: number, acting: boolean): boolean {
    if (this.apartFrames === null) return started < this.row.times || frame < this.holdFrames;
    if (started >= this.row.times || acting) {
      this.idle = 0;
      return false;
    }
    if (started === 0) return true;
    this.idle++;
    return this.idle > this.apartFrames;
  }
}

/** Where the shoulders are in the eyes' frame (m: right, up, ahead of the camera), and how far an arm reaches from
 *  one to the middle of its fist: where a pose through the eyes can put the hands. */
function shouldersSeen(lab: Lab): string {
  lab.model.root.updateWorldMatrix(true, true);
  G.camera.updateMatrixWorld();
  const inEyes = (joint: THREE.Object3D) => {
    const at = G.camera.worldToLocal(joint.getWorldPosition(new THREE.Vector3()));
    return `(${at.x.toFixed(2)}, ${at.y.toFixed(2)}, ${(-at.z).toFixed(2)})`;
  };
  const P = lab.joints.P;
  const reach = (P.upperL + P.foreL + P.handR) * lab.model.root.scale.x;
  const shoulders = `left ${inEyes(lab.joints.shoulderL)}, right ${inEyes(lab.joints.shoulderR)}`;
  const frame = 'the eyes\' frame (m: right, up, ahead)';
  return `at rest, the shoulders in ${frame}: ${shoulders}; an arm reaches ${reach.toFixed(2)}`;
}

/** The point `distance` m ahead of the hero, the way he faces. */
function aheadOf(lab: Lab, distance: number): THREE.Vector3 {
  const facing = lab.player.facing;
  const way = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing));
  return lab.player.pos.clone().addScaledVector(way, distance);
}

/** The casts begun since the press, told apart by the hero's cast state, and whether the current one has fired. */
class CastCount {
  started = 0;
  fires = false;
  private current: object | null = null;
  private fired = false;

  constructor(private readonly lab: Lab) {}

  /** Reads this frame's cast: a new one counted, and whether it fired on this frame. */
  read(): void {
    const now = actionNow(this.lab);
    if (now && now.action !== this.current) {
      this.started++;
      this.fired = false;
    }
    this.current = now?.action ?? null;
    this.fires = Boolean(now?.fired) && !this.fired;
    if (now?.fired) this.fired = true;
  }
}

/** What the hero does this frame, as his model is posed by it (`Player.animateBody`): a dash (a lunge, a charge), a
 *  cast or a channel; how far through it (none for a channel, held as long as its key), and whether it has fired.
 *  (Counted by its casts alone, an instant skill that lunges and a channel were never cast.) */
function actionNow(lab: Lab): { action: object; share: number | null; fired: boolean } | null {
  const { dash, casting, channel } = lab.player;
  if (dash) return { action: dash, share: Math.min(1, dash.t / (dash.dur + dash.hold)), fired: false };
  if (casting) {
    const share = Number.isFinite(casting.dur) ? casting.t / casting.dur : null;
    return { action: casting, share, fired: Boolean(casting.fired) };
  }
  if (channel) return { action: channel, share: null, fired: false };
  return null;
}

/** This frame as the eyes see it. */
function seeFrame(lab: Lab, frame: number, casts: CastCount, last: Seen | undefined, strikes: StrikeTracker): Seen {
  lab.model.root.updateWorldMatrix(true, true);
  G.camera.updateMatrixWorld();
  const action = actionNow(lab);
  const tipObject = lab.model.tip ?? lab.joints.handR;
  const gripObject = lab.model.tip?.parent ?? lab.joints.handR;
  const tip = spotOf(tipObject);
  const grip = spotOf(gripObject);
  const tipAt = tipObject.getWorldPosition(new THREE.Vector3());
  const blade = spotOf(tipAt.lerp(gripObject.getWorldPosition(new THREE.Vector3()), 0.5));
  const lower = lab.model.lowerGrip;
  const hand = lab.model.tip?.parent?.parent === lab.joints.handL ? 'left' : 'right';
  const body = bodyBreaches(lab.joints, grippingSides(lab));
  const armsPast = body.found.filter((breach) => ARM_RANGE.test(breach.name));
  const strike = strikes.next(window.__labClock.frame / 1000);
  return {
    frame,
    cast: casts.started - 1,
    share: action?.share ?? null,
    fires: casts.fires,
    tip,
    blade,
    grip,
    other: spotOf(fistOf(lab, lab.joints.handL)),
    lower: lab.model.offGrip ? spotOf(lab.model.offGrip) : null,
    held: lower ? lower.held || lower.free : null,
    grasp: lower ? { ...lower } : null,
    lowerOff: lab.model.offGrip ? lowerOffOf(lab, lab.model.offGrip) : null,
    moved: last ? THREE.MathUtils.radToDeg(last.blade.way.angleTo(blade.way)) : 0,
    seenMoved: last?.blade.near && blade.near ? THREE.MathUtils.radToDeg(last.blade.way.angleTo(blade.way)) : 0,
    armsPast,
    armsPastWords: armsPast.map((breach) => describeBreach(breach) + armOf(body.angles, breach.name)),
    wrists: wristsOf(body.angles),
    fists: fistsSeen(lab),
    strike,
    swing: strike ? swingOf(strike) : null,
    striking: lab.model.swung ? lab.model.swung.length > 0 : true,
    pose: armsAt(lab),
    side: lab.model.swing ?? null,
    hand,
    ...shownOf(weaponsAlong(lab).find((view) => view.hand === hand)),
    keyed: keyedNow(lab),
    inBody: armsInBody(lab.joints),
    armsNear: [armNear(lab, 'R'), armNear(lab, 'L')],
  };
}

/** points along each bone of an arm looked at for whether it's in or near the frame */
const ARM_SAMPLES = 4;

/** Whether an arm is in or near the frame anywhere from its shoulder to its fist (`Spot.near`). */
function armNear(lab: Lab, side: 'R' | 'L'): boolean {
  const joints = [lab.joints[`shoulder${side}`], lab.joints[`elbow${side}`], lab.joints[`hand${side}`]];
  const [shoulder, elbow, wrist] = joints.map((joint) => joint.getWorldPosition(new THREE.Vector3()));
  const fist = fistOf(lab, lab.joints[`hand${side}`]);
  for (const [from, to] of [[shoulder, elbow], [elbow, wrist], [wrist, fist]]) {
    for (let i = 0; i <= ARM_SAMPLES; i++) {
      if (spotOf(from.clone().lerp(to, i / ARM_SAMPLES)).near) return true;
    }
  }
  return false;
}

/** Where a strike's blow lands as the eyes see it, with the weapon's way (page/momentum.ts). */
function swingOf(strike: StrikeFrame): SwingFrame {
  const spot = spotOf(strike.point);
  return { point: strike.point, axis: strike.axis, x: spot.x, y: spot.y, on: spot.on };
}

/** A frame as the cut measures read it (page/cuts.ts). */
const cutOf = (now: Seen): CutFrame => ({
  grip: now.grip.at, tip: now.tip.at, hand: now.hand, side: now.side, inCast: now.share !== null, frame: now.frame,
  shown: now.shown, looks: now.looks,
});

/** A weapon in the frame as a frame keeps it (`Seen.shown`, `Seen.looks`). */
const shownOf = (view: AlongView | undefined) => ({ shown: view?.share ?? 0, looks: view?.length ?? 0 });

/** Each wrist's angles as `measureBody` has them. */
function wristsOf(angles: Record<string, number>): Wrist[] {
  return (['R', 'L'] as const).map((side) => ({
    side,
    pronation: angles[`forearm${side}.pronation`],
    flexion: angles[`wrist${side}.flexion`],
    radial: angles[`wrist${side}.radial`],
  }));
}

/** The wrists of the hands holding a handle this frame. */
const holdingWrists = (now: Seen) =>
  now.wrists.filter((wrist) => now.fists.some((fist) => (fist.hand === 'right' ? 'R' : 'L') === wrist.side));

/** A wrist as words. */
const describeWrist = (wrist: Wrist) => `${wrist.side === 'R' ? 'right' : 'left'} wrist: the forearm turned `
  + `${wrist.pronation.toFixed(0)}°, ${wristBend(wrist)}`;

/** A wrist's bend as words: towards the palm or its back, and to the thumb's side or the little finger's. */
function wristBend(wrist: Wrist): string {
  const back = wrist.flexion < 0;
  const flexion = `${back ? 'back' : 'towards the palm'} ${Math.abs(wrist.flexion).toFixed(0)}°`;
  const ulnar = wrist.radial < 0;
  const side = `to the ${ulnar ? 'little finger' : 'thumb'} ${Math.abs(wrist.radial).toFixed(0)}°`;
  return `bent ${flexion} (${back ? 'extension' : 'flexion'}), ${side} (${ulnar ? 'ulnar' : 'radial'})`;
}

/** A frame's gripping wrists as a film frame's label: "R palm 57 ulnar 12" (back, thumb the other ways). */
function wristLabel(now: Seen): string {
  return holdingWrists(now).map((wrist) => {
    const flexion = `${wrist.flexion < 0 ? 'back' : 'palm'} ${Math.abs(wrist.flexion).toFixed(0)}`;
    const side = `${wrist.radial < 0 ? 'ulnar' : 'thumb'} ${Math.abs(wrist.radial).toFixed(0)}`;
    return `${wrist.side} ${flexion} ${side} turned ${wrist.pronation.toFixed(0)}`;
  }).join('  ');
}

/** Each hand holding a handle, how it holds it (`Model.fists`: none on a game without it) and whether its fist is in
 *  the frame. */
function fistsSeen(lab: Lab): SeenFist[] {
  return (lab.model.fists ?? []).map((fist) => {
    const hand = fist.hand === 'right' ? lab.joints.handR : lab.joints.handL;
    return { ...fist, on: spotOf(fistOf(lab, hand)).on };
  });
}

/** Where a hand's fist closes (world): along the hand as it's drawn from its wrist (its -y, as the rig hangs the hand;
 *  along the joint's, which a fist round a handle is turned off by about 90 degrees, a point beside the fist was
 *  read, out of the frame while the fist was in it). */
function fistOf(lab: Lab, hand: THREE.Object3D): THREE.Vector3 {
  const along = new THREE.Vector3(0, -1, 0).transformDirection(drawnHand(hand).matrixWorld);
  const wrist = hand.getWorldPosition(new THREE.Vector3());
  return wrist.addScaledVector(along, FIST_ALONG * lab.model.root.scale.x);
}

/** How far the other hand's fist is from a two-hander's lower grip, `lower` (m, the hero's scale taken out). */
function lowerOffOf(lab: Lab, lower: THREE.Object3D): number {
  const fist = fistOf(lab, lab.joints.handL);
  return fist.distanceTo(lower.getWorldPosition(new THREE.Vector3())) / lab.model.root.scale.x;
}

/** Where `object` (or a point of the world) is as the game's camera shows it. */
function spotOf(object: THREE.Object3D | THREE.Vector3): Spot {
  const world = object instanceof THREE.Vector3 ? object.clone() : object.getWorldPosition(new THREE.Vector3());
  const at = G.camera.worldToLocal(world.clone());
  const way = at.clone().normalize();
  // (where it's drawn: through the arms' own camera, if they have one)
  const ndc = world.project(armsLens());
  const ahead = way.z < 0;
  const on = ahead && Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1;
  const near = ahead && Math.abs(ndc.x) <= NEAR_FRAME && Math.abs(ndc.y) <= NEAR_FRAME;
  return { x: (ndc.x + 1) / 2, y: (1 - ndc.y) / 2, on, ahead, near, at, way };
}

/** The frames of a blow: the fastest frame's index, and the frames round it moving at least `BLOW_SHARE` of it. */
interface Blow {
  from: number;
  to: number;
  fastest: number;
}

/** The blow among `frames` (indices into them), or null when nothing moved. */
function blowIn(frames: Seen[]): Blow | null {
  let fastest = -1;
  for (let i = 1; i < frames.length; i++) {
    if (fastest < 0 || frames[i].seenMoved > frames[fastest].seenMoved) fastest = i;
  }
  if (fastest < 0) return null;
  const least = frames[fastest].seenMoved * BLOW_SHARE;
  let from = fastest;
  while (from > 1 && frames[from - 1].seenMoved >= least) from--;
  let to = fastest;
  while (to < frames.length - 1 && frames[to + 1].seenMoved >= least) to++;
  return { from, to, fastest };
}

/** Each cast's frames, from the frame before it began (the arms as they were) to the next cast's start or the end. */
function castFrames(seen: Seen[]): Seen[][] {
  const casts: Seen[][] = [];
  for (const [i, now] of seen.entries()) {
    if (now.cast < 0) continue;
    if (!casts[now.cast]) casts[now.cast] = i > 0 ? [seen[i - 1]] : [];
    casts[now.cast].push(now);
  }
  return casts;
}

/** Each cast of the row as words. */
function describeCasts(seen: Seen[], name: string): string[] {
  return castFrames(seen).map((frames, i) => `${name} ${i + 1}: ${describeCast(frames)}`);
}

/** Each cast's strike (page/strike.ts) as a line, and its problems (led by its flat, outrun by another motion); with
 *  the strikes. */
function describeStrikes(seen: Seen[], skill: { name: string; arc?: number; spin?: number }):
  { lines: string[]; problems: string[]; strikes: (Strike | null)[] } {
  const lines: string[] = [];
  const problems: string[] = [];
  const strikes = castFrames(seen).map((frames, i) => {
    const runs = handRuns(frames);
    const blows = runs.map((run) => {
      const whose = runs.length > 1 ? `, the ${run.frames[0].hand} hand's blow` : '';
      const blow = describeBlow(run.frames, skill);
      lines.push(`${skill.name} ${i + 1}${whose}: ${blow.line}`);
      for (const problem of blow.problems) problems.push(`cast ${i + 1}${whose}: ${problem}`);
      return blow.strike && shifted(blow.strike, run.from);
    });
    return blows.find((strike) => strike) ?? null;
  });
  return { lines, problems, strikes };
}

/** One blow's strike among `frames` (a cast's, or one hand's run of it), as a line and its problems. */
function describeBlow(frames: Seen[], skill: { arc?: number; spin?: number }):
  { strike: Strike | null; line: string; problems: string[] } {
  const strike = strikeOf(frames);
  const at = (index: number) => `frame ${frames[index].frame} (${shareOf(frames[index])})`;
  const none = struckIn(frames) ? 'no weapon struck' : 'no weapon struck (none swung in a strike: `Model.swung`)';
  if (!strike) return { strike, line: none, problems: [] };
  const holding = holdingWrists(frames[strike.fastest]);
  const wrists = holding.map((wrist) => `; at its fastest the ${describeWrist(wrist)}`).join('');
  const landing = landingOf(frames, strike, skill);
  const line = `${describeStrike(strike, at)}; ${describeLanding(landing)}${wrists}`;
  return { strike, line, problems: [...strikeProblems(strike, at), ...landingProblems(landing, strike.weapon)] };
}

/** the fewest frames of a cast its tip is on one hand's weapon for to be judged as that hand's blow (the frame or
 *  two it passes from one hand's to the other's as a cast begins left out, and a run that strikes nothing, the rest
 *  after a cast) */
const HAND_RUN_LEAST = 4;

/** A cast's frames in runs by the hand whose weapon the tip is on, each that hand's blow, with where each starts
 *  among them: Twin Fangs' right blade, then its left (judged as one, the left's blow was never looked at); a cast
 *  of one hand's weapon is one run. */
function handRuns(frames: Seen[]): { from: number; frames: Seen[] }[] {
  const runs: { from: number; frames: Seen[] }[] = [];
  frames.forEach((frame, i) => {
    const last = runs[runs.length - 1];
    if (last && last.frames[0].hand === frame.hand) last.frames.push(frame);
    else runs.push({ from: i, frames: [frame] });
  });
  const blows = runs.filter((run) => run.frames.length >= HAND_RUN_LEAST && struckIn(run.frames));
  return blows.length > 1 ? blows : [{ from: 0, frames }];
}

/** `strike`, found among the frames of a run starting `from` frames into its cast, by the cast's own frames. */
const shifted = (strike: Strike, from: number): Strike => ({
  ...strike,
  fastest: strike.fastest + from,
  from: strike.from + from,
  to: strike.to + from,
  outrun: strike.outrun && { ...strike.outrun, at: strike.outrun.at + from },
});

/** How a cast's strike landed through the eyes (page/cuts.ts): where its blade crossed the aim, nearest the frame it
 *  fired on, how wide it swept against the skill's `arc` (rad), and how often it comes round, a `spin`'s (rad/s). */
function landingOf(frames: Seen[], strike: Strike, skill: { arc?: number; spin?: number }): Landing {
  const cut = frames.map(cutOf);
  const fired = frames.findIndex((frame) => frame.fires);
  const meets = aimCrossing(cut, strike.from - 1, strike.to + 1, fired >= 0 ? fired : strike.fastest);
  const arc = skill.arc ? THREE.MathUtils.radToDeg(skill.arc) : null;
  const turns = skill.spin ? skill.spin / (2 * Math.PI) : null;
  return { meets, swept: sweptOver(cut, strike.from, strike.to), arc, turns };
}

/** A cast's strike: the blow round the frame it fires on (page/strike.ts `strikeIn`). */
const strikeOf = (frames: Seen[]) => strikeReadAs(frames, (strikes) => strikes);
/** and with its frames as `read` reads them; none for a cast that swings no weapon in a strike (`Seen.striking`) */
const strikeReadAs = (frames: Seen[], read: (strikes: (StrikeFrame | null)[]) => (StrikeFrame | null)[]) => (
  struckIn(frames)
    ? strikeIn(read(frames.map((frame) => frame.strike)), frames.findIndex((f) => f.fires), window.__labClock.frame)
    : null
);
/** Whether any of `frames` swings a weapon in a strike. */
const struckIn = (frames: Seen[]) => frames.some((frame) => frame.striking);

/** The floor's canary: each cast whose blow the floor stopped judged again with the floor read `CANARY_FLOOR` under
 *  where it is, which must find it stopped dead in the air. As words, `caught ...`, `missed ...` or `skipped ...`
 *  (no blow stopped by the floor). */
function floorCanary(seen: Seen[]): string {
  const floored = castFrames(seen).filter((frames) => {
    const strike = strikeOf(frames);
    return strike !== null && stoppedByFloor(strike);
  });
  if (!floored.length) return 'skipped: no blow stopped by the floor';
  const dead = floored.filter((frames) => {
    const strike = strikeReadAs(frames, (strikes) => floorLowered(strikes, CANARY_FLOOR))!;
    return strikeProblems(strike, String).some((problem) => problem.includes('stops dead'));
  });
  const read = `${dead.length} of the ${floored.length} blows the floor stopped read as stopped dead in the air`;
  return dead.length === floored.length ? `caught: ${read}` : `missed: ${read}`;
}

/** A row of a basic attack's cuts against how a body chains them (page/cuts.ts `rowOfCuts`); none for another
 *  skill. */
function cutsOf(followed: Followed, strikes: (Strike | null)[], skill: BoundSkill):
  { lines: string[]; problems: string[] } | null {
  if (SKILL_IMPLS[skill.def.impl]?.anim !== 'swing') return null;
  const casts: RowCast[] = castFrames(followed.seen).map((frames, i) => ({
    frames: frames.map(cutOf),
    strikeFrom: strikes[i]?.from ?? frames.length,
  }));
  return rowOfCuts(casts, followed.blades, window.__labClock.frame);
}

/** Whether a cast follows on from the one before it as the next cut of a row: begun as the same hand's other cut
 *  (`Model.swing`), not a forehand again from the rest after a pause, nor the other hand's. */
function chained(frames: Seen[]): boolean {
  const before = frames[0];
  const now = frames[frames.length - 1];
  return before.hand === now.hand && before.side !== null && now.side !== null && before.side !== now.side;
}

/** A cast's frames as its swing's: each frame's (one without a weapon held as the frame before it, or the first held
 *  after it). */
function swingFrames(frames: Seen[]): SwingFrame[] | null {
  const first = frames.find((frame) => frame.swing)?.swing;
  if (!first) return null;
  let last = first;
  return frames.map((frame) => {
    last = frame.swing ?? last;
    return last;
  });
}

/**
 * Each cast's swing measured whole, a basic attack's (page/momentum.ts): its lines and problems, and the canary that
 * plants faults in the first cast's swing (none for another skill).
 */
function swingsOf(seen: Seen[], strikes: (Strike | null)[], skill: BoundSkill):
  { lines: string[]; problems: string[]; canary: () => string[] } {
  const none = { lines: [], problems: [], canary: () => [] };
  if (SKILL_IMPLS[skill.def.impl]?.anim !== 'swing') return none;
  const lines: string[] = [];
  const problems: string[] = [];
  const measured: { frames: SwingFrame[]; fastest: number; heavy: boolean }[] = [];
  // (the last cast's swing, while the next follows on from it: a row's, the key held or let go for less than the
  // hold of a cut's end)
  let last: Momentum | null = null;
  for (const [i, frames] of castFrames(seen).entries()) {
    const swing = swingFrames(frames);
    const strike = strikes[i];
    if (!swing || !strike) continue;
    const heavy = frames[strike.fastest].lower !== null;
    const whole = momentumOf(swing, strike.fastest, window.__labClock.frame, heavy);
    if (!whole) continue;
    const at = (index: number) => `frame ${frames[index].frame} (${shareOf(frames[index])})`;
    lines.push(`${skill.def.name} ${i + 1}: ${describeMomentum(whole, at)}`);
    for (const problem of momentumProblems(whole, at)) problems.push(`cast ${i + 1}: ${problem}`);
    if (last && chained(frames)) {
      const row = rowOfSwings(last, whole, i + 1);
      lines.push(`${skill.def.name}: ${row.line}`);
      problems.push(...row.problems);
    }
    last = whole;
    measured.push({ frames: swing, fastest: whole.fastest, heavy });
  }
  const canary = () => {
    const first = measured[0];
    if (!first) return [];
    const frameMs = window.__labClock.frame;
    const faults = momentumCanary(first.frames, first.fastest, frameMs, first.heavy);
    return [...faults, rowCanary(first.frames, first.fastest, frameMs, first.heavy)];
  };
  return { lines, problems, canary };
}

/** One cast as words: where the blade began, the wind-up, the blow, where the skill fired and where the blade ended. */
function describeCast(frames: Seen[]): string {
  const start = frames[0];
  const blow = blowIn(frames);
  const parts = [`${frames.length - 1} frames; the blade from ${describeSpot(start.blade)}`];
  if (!blow || frames[blow.fastest].seenMoved < NO_BLOW) {
    return `${parts[0]}; no blow (at most ${speedOf(blow, frames)})`;
  }
  const into = frames[blow.from - 1];
  const out = frames[blow.to];
  const wound = hidden(frames, 1, blow.from);
  parts.push(`wound up to ${describeSpot(into.blade)} by frame ${into.frame} (${shareOf(into)})${wound}`);
  const count = blow.to - blow.from + 1;
  const ms = Math.round(count * window.__labClock.frame);
  const span = `${shareOf(frames[blow.from])} to ${shareOf(out)}`;
  const fastest = `the fastest ${speedOf(blow, frames)} on frame ${frames[blow.fastest].frame}`;
  parts.push(`the blow over ${count} frames (${ms} ms, ${span}) to ${describeSpot(out.blade)}, ${fastest}`);
  const fired = frames.find((frame) => frame.fires);
  if (fired) parts.push(`it fired on frame ${fired.frame} (${shareOf(fired)}, ${firedAgainst(fired, frames, blow)})`);
  const end = frames[frames.length - 1];
  parts.push(`ending at ${describeSpot(end.blade)}${hidden(frames, blow.to + 1, frames.length)}`);
  return parts.join('; ');
}

/** The fastest frame of a blow, as words (degrees of the view a frame). */
function speedOf(blow: Blow | null, frames: Seen[]): string {
  const fastest = blow ? frames[blow.fastest].seenMoved : 0;
  return `${fastest.toFixed(1)}° of the view a frame`;
}

/** Where the skill fired against the blow: before it, in it, or after it, by frames. */
function firedAgainst(fired: Seen, frames: Seen[], blow: Blow): string {
  const at = frames.indexOf(fired);
  if (at < blow.from) return `${blow.from - at} frames before the blow, the blade at ${describeSpot(fired.blade)}`;
  if (at > blow.to) return `${at - blow.to} frames after the blow, the blade at ${describeSpot(fired.blade)}`;
  return `in the blow, the blade at ${describeSpot(fired.blade)}`;
}

/** How many of `frames` from `from` up to `to` had the blade out of the frame, as words (none: nothing). */
function hidden(frames: Seen[], from: number, to: number): string {
  const out = frames.slice(from, to).filter((frame) => !frame.blade.on).length;
  return out ? `, out of the frame on ${out}` : '';
}

/** A spot as words. */
function describeSpot(spot: Spot): string {
  if (!spot.ahead) return 'behind the eyes';
  const at = `${Math.round(spot.x * 100)}% across, ${Math.round(spot.y * 100)}% down`;
  return spot.on ? at : `${at} (out of the frame)`;
}

/** A frame's share of its cast, as words. */
function shareOf(frame: Seen): string {
  return frame.share === null ? 'after the cast' : `${frame.share.toFixed(2)} of the cast`;
}

/** The frames a two-hander was held in one hand: let go of by the other hand, its fist off the lower grip as drawn
 *  (`LOWER_LET_GO`), in the frame or out of it, but where the game lets that hand go (`LowerGrip.free`: drinking,
 *  the weapon on the shoulder, the hand coming onto the grip); or its lower grip in the frame with that hand out of it
 *  for longer than `ONE_HAND_SPELL`; as problems (none for any other weapon). (Let go of below the frame, it was only
 *  listed: the owner, of the two-hander through the eyes, "one handed with two handed weapon", #198. A fist below the
 *  frame on a handle that runs out of it is lost to a person's own eyes too: counted as soon as the weapon's hand was
 *  seen, the middle guard read as one-handed.) */
function oneHanded(seen: Seen[]): string[] {
  const two = seen.filter((frame) => frame.held !== null);
  const letGo = two.filter((frame) => frame.lowerOff! > LOWER_LET_GO && !frame.grasp!.free);
  const lowerSeen = (frame: Seen) => frame.lower?.on ?? (Boolean(frame.held) && frame.grip.on);
  const unseen = longSpells(seen, (frame) => !frame.other.on && lowerSeen(frame));
  const problems: string[] = [];
  if (letGo.length) {
    const worst = letGo.reduce((most, frame) => (frame.lowerOff! > most.lowerOff! ? frame : most));
    const inFrame = letGo.filter((frame) => frame.other.on).length;
    const off = `the fist ${(worst.lowerOff! * 100).toFixed(0)} cm off it`;
    const why = `the worst, frame ${worst.frame} (${shareOf(worst)}): ${off}, ${whyLetGo(worst.grasp!)}`;
    problems.push(`the two-hander let go of by the other hand on ${framesOf(letGo)}, ${inFrame} in the frame; ${why}`);
  }
  if (unseen.length) problems.push(`the two-hander seen in one hand, its lower grip bare: ${framesOf(unseen)}`);
  return problems;
}

/** Whether a fist holds its handle as an open hand: off it, or its fingers barely curled. */
function isOpen(fist: Fist): boolean {
  return fist.off > FIST_OFF || slidOf(fist) > FIST_SLID || fist.curl < FIST_OPEN;
}

/** How far a fist is along its handle from where it holds it (m; 0 on a game that doesn't say). */
const slidOf = (fist: Fist) => Math.abs(fist.along ?? 0);

/** A fist on its handle, as words. */
function describeFist(fist: Fist): string {
  const off = `the handle ${(fist.off * 100).toFixed(1)} cm from where the fist closes`;
  const along = `${(slidOf(fist) * 100).toFixed(1)} cm along it from its grip`;
  return `${off}, ${along}, the fingers curled ${THREE.MathUtils.radToDeg(fist.curl).toFixed(0)}°`;
}

/** Each hand's fist on its handle over every frame: the furthest off it and the least curled, seen or not; and the
 *  frames it was in the frame (Steel Tempest's two-hander held low, both fists came round into the view's bottom once
 *  a turn, a flash each time, which no line said). */
function describeFists(seen: Seen[]): string {
  const hands = (['right', 'left'] as const).flatMap((hand) => {
    const fists = seen.flatMap((frame) => frame.fists.filter((fist) => fist.hand === hand));
    if (!fists.length) return [];
    const off = Math.max(...fists.map((fist) => fist.off));
    const slid = Math.max(...fists.map(slidOf));
    const curl = Math.min(...fists.map((fist) => fist.curl));
    const curled = THREE.MathUtils.radToDeg(curl).toFixed(0);
    const along = `${(slid * 100).toFixed(1)} cm along it from its grip`;
    const shown = seen.filter((frame) => frame.fists.some((fist) => fist.hand === hand && fist.on));
    const where = shown.length ? `in the frame on frames ${spansOf(shown.map((frame) => frame.frame))}` : 'never seen';
    return [`${hand}, at most ${(off * 100).toFixed(1)} cm off and ${along}, curled ${curled}° at least, ${where}`];
  });
  return `the fists on their handles: ${hands.join('; ') || 'none'}`;
}

/** Frame numbers (rising) as the runs of them in a row: "38-54, 76-90". */
function spansOf(frames: number[]): string {
  const runs: number[][] = [];
  for (const frame of frames) {
    const run = runs.at(-1);
    if (run && frame === run.at(-1)! + 1) run.push(frame);
    else runs.push([frame]);
  }
  return runs.map((run) => (run.length === 1 ? `${run[0]}` : `${run[0]}-${run.at(-1)}`)).join(', ');
}

/** The frames a hand was seen holding its handle as an open hand, each hand's as a problem. */
function openFists(seen: Seen[]): string[] {
  const problems: string[] = [];
  for (const hand of ['right', 'left'] as const) {
    const fistIn = (frame: Seen) => frame.fists.find((fist) => fist.hand === hand);
    const open = seen.filter((frame) => {
      const fist = fistIn(frame);
      return fist !== undefined && fist.on && isOpen(fist);
    });
    if (!open.length) continue;
    const offOf = (frame: Seen) => Math.max(fistIn(frame)!.off, slidOf(fistIn(frame)!));
    const worst = open.reduce((most, frame) => (offOf(frame) > offOf(most) ? frame : most));
    const why = `the worst, frame ${worst.frame}: ${describeFist(fistIn(worst)!)}`;
    problems.push(`the ${hand} hand open on its handle, seen: ${framesOf(open)}; ${why}`);
  }
  return problems;
}

/** The frames from `span`'s first to its second (every one without it). */
function inSpan(seen: Seen[], span: [number, number] | null): Seen[] {
  if (!span) return seen;
  const [from, to] = span;
  return seen.filter((now) => now.frame >= from && now.frame <= to);
}

/** A two-hander's lower grip held, as words: and how far past their ranges the arm's joints would go to hold it as
 *  it's posed, the fist turned off it by that much (`LowerGrip.past`). */
function heldWords(grasp: LowerGrip | null): string {
  if (!grasp || grasp.past <= 0.5) return 'held';
  return `held, its joints ${grasp.past.toFixed(0)}° past, the fist turned off it`;
}

/** Every frame as a line: its share of the cast, where the grip and the other hand are and the weapon's way, in the
 *  camera's space as the moves through the eyes are keyed, and whether a two-hander's lower grip is held. */
function describeFrames(seen: Seen[]): string[] {
  const lines = ['each frame, in the camera\'s space (m: x right, y up, -z ahead):'];
  for (const now of seen) {
    const share = now.share === null ? '' : ` (${now.share.toFixed(2)})`;
    const weapon = now.tip.at.clone().sub(now.grip.at).normalize();
    const held = now.held === null ? '' : `, ${now.held ? heldWords(now.grasp) : `let go: ${whyLetGo(now.grasp!)}`}`
      + `, the left fist ${(now.lowerOff! * 100).toFixed(1)} cm from the lower grip`;
    const past = now.armsPast.length ? `; past: ${now.armsPastWords.join(', ')}` : '';
    const fists = now.fists
      .map((fist) => `; the ${fist.hand} fist${fist.on ? '' : ' (out of the frame)'}: ${describeFist(fist)}`)
      .join('');
    const wrists = holdingWrists(now).map((wrist) => `; the ${describeWrist(wrist)}`).join('');
    const parts = [
      `the grip ${triple(now.grip.at)}`,
      `the weapon ${triple(weapon)}`,
      `the other hand ${triple(now.other.at)}${now.other.on ? '' : ' (out of the frame)'}`,
      ...(now.lower ? [`the lower grip ${now.lower.on ? 'in' : 'out of'} the frame`] : []),
      `the right shoulder ${triple(now.pose.arms[0][0])}`,
      `the right elbow ${triple(now.pose.arms[0][1])}`,
      ...(now.strike ? [speedsOf(now.strike)] : []),
    ];
    const fires = now.fires ? ' fires' : '';
    const keyed = now.keyed ? `; ${describeKeyedFrame(now.keyed)}` : '';
    lines.push(`  ${now.frame}${share}${fires}: ${parts.join(', ')}${held}${fists}${wrists}${keyed}${past}`);
  }
  return lines;
}

/** How fast a frame's weapon moves, as words: its striking part and its hilt (the world's m/s). */
function speedsOf(strike: StrikeFrame): string {
  return `its striking part ${strike.speed.toFixed(1)} m/s, the hilt ${strike.gripSpeed.toFixed(1)}`;
}

/** A joint past its range on one frame, by how much (degrees). */
interface PastOn { frame: number; by: number }

/** The arms' joints past their ranges over every frame (those `counted` on it), the worst first: each one's worst, on
 *  how many frames, and the runs of frames it's past on, each with its worst (so a fix's effect on each part of a move
 *  reads at once). */
function describeArmsPast(
  seen: Seen[], counted: (breach: Breach, now: Seen) => boolean = () => true, head = 'the arms past their ranges',
): string {
  const worst = new Map<string, { breach: Breach; words: string; frame: number; on: PastOn[] }>();
  for (const now of seen) {
    now.armsPast.forEach((breach, i) => {
      if (!counted(breach, now)) return;
      const record = worst.get(breach.name);
      const on = { frame: now.frame, by: breach.by };
      const words = now.armsPastWords[i];
      if (!record) worst.set(breach.name, { breach, words, frame: now.frame, on: [on] });
      else {
        record.on.push(on);
        if (breach.by > record.breach.by) Object.assign(record, { breach, words, frame: now.frame });
      }
    });
  }
  if (worst.size === 0) return `${head}: none`;
  const records = [...worst.values()].sort((a, b) => b.breach.by - a.breach.by);
  const words = records.map((r) => {
    const runs = runsOf(r.on).join(', ');
    return `${r.words} on ${r.on.length} frames, the worst on ${r.frame} (frames ${runs})`;
  });
  return `${head}, the worst first: ${words.join('; ')}`;
}

/** Whether the arm a breach of the arms' ranges is in (`forearmR.pronation`: the right) was in or near the frame. */
function breachShown(breach: Breach, now: Seen): boolean {
  return now.armsNear[/^[a-z]+L\./.test(breach.name) ? 1 : 0];
}

/** Frames in a row as runs, each with its worst: "6-20 up to 30°". */
function runsOf(on: PastOn[]): string[] {
  const runs: PastOn[][] = [];
  for (const one of on) {
    const run = runs.at(-1);
    if (run && one.frame === run.at(-1)!.frame + 1) run.push(one);
    else runs.push([one]);
  }
  return runs.map((run) => {
    const first = run[0].frame;
    const last = run.at(-1)!.frame;
    const most = Math.max(...run.map((one) => one.by));
    const frames = first === last ? `${first}` : `${first}-${last}`;
    return `${frames} up to ${most.toFixed(0)}°`;
  });
}

/** The frames of each run of frames in a row that `holds` for longer than `ONE_HAND_SPELL`. */
function longSpells(seen: Seen[], holds: (frame: Seen) => boolean): Seen[] {
  const longest = ONE_HAND_SPELL / window.__labClock.frame;
  const found: Seen[] = [];
  let spell: Seen[] = [];
  for (const frame of [...seen, null]) {
    if (frame && holds(frame)) {
      spell.push(frame);
      continue;
    }
    if (spell.length > longest) found.push(...spell);
    spell = [];
  }
  return found;
}

/** Frames as words: how many, and the first few. */
function framesOf(frames: Seen[]): string {
  const first = frames.slice(0, 6).map((frame) => frame.frame).join(', ');
  return `${frames.length} frames (${first}${frames.length > 6 ? '...' : ''})`;
}

/** The canary's faults, planted after each frame: the arms held as they were at the press (no blow), the other arm
 *  turned down out of the frame, and the weapon lifted up the view out of the fists (open hands; a two-hander's lower
 *  grip in the frame with no hand on it). */
function plantFaults(lab: Lab): () => void {
  // (each joint's place too: a swing through the eyes brings its shoulder forward, and the arms frozen by their turns
  // alone still swung)
  let held: { turn: THREE.Quaternion; at: THREE.Vector3 }[] | null = null;
  return () => {
    const joints = FROZEN_JOINTS.map((name) => lab.joints[name]);
    held ??= joints.map((joint) => ({ turn: joint.quaternion.clone(), at: joint.position.clone() }));
    joints.forEach((joint, i) => {
      joint.quaternion.copy(held![i].turn);
      joint.position.copy(held![i].at);
    });
    lab.joints.shoulderL.rotateX(CANARY_DROP);
    // (and the hero put under the camera again by his neck as it's held, as the game puts him by the neck it posed:
    // placed by the neck Steel Tempest's turn had carried round, the frozen arms went round the eyes with each turn)
    viewArms(lab.model, true, G.camera);
    lab.model.root.updateWorldMatrix(true, true);
    const grip = lab.model.tip?.parent;
    if (grip?.parent) liftInView(grip, liftFor(lab));
    lab.model.root.updateWorldMatrix(true, true);
  };
}

/** The lift alone, planted after each frame of a cast played as it is: its fists seen as it swings (frozen at a
 *  two-hander's rest, both were below the frame, and no fist was seen open), and taken back once the frame is read
 *  (kept, the next frame was posed from the lifted grip, and no fist was seen at all). Lifted `by` that far, on the
 *  frames `when` says, the weapon in `hand` (the right's, the cast's own, by default). */
function plantLift(
  lab: Lab, by = () => liftFor(lab), when = () => true, hand: Fist['hand'] = 'right',
): { plant: () => void; unplant: () => void } {
  let lifted: { grip: THREE.Object3D; at: THREE.Vector3 } | null = null;
  const plant = () => {
    if (!when()) return;
    lab.model.root.updateWorldMatrix(true, true);
    const grip = (hand === 'left' ? lab.model.offTip : lab.model.tip)?.parent;
    if (!grip?.parent) return;
    lifted = { grip, at: grip.position.clone() };
    liftInView(grip, by());
    lab.model.root.updateWorldMatrix(true, true);
  };
  const unplant = () => {
    lifted?.grip.position.copy(lifted.at);
    lifted = null;
    lab.model.root.updateWorldMatrix(true, true);
  };
  return { plant, unplant };
}

/** How far the canary lifts the weapon: `CANARY_LIFT`, or as far as brings a two-hander's lower grip up to the middle
 *  of the view (held at rest below the frame, lifted 15 cm it stayed out of it, and the hand let go of it unseen). */
function liftFor(lab: Lab): number {
  const lower = lab.model.offGrip;
  if (!lower) return CANARY_LIFT;
  const below = -G.camera.worldToLocal(lower.getWorldPosition(new THREE.Vector3())).y;
  return Math.max(CANARY_LIFT, below);
}

/** Moves `object` up the eyes' view by `by` (m). */
function liftInView(object: THREE.Object3D, by: number): void {
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(G.camera.getWorldQuaternion(new THREE.Quaternion()));
  const lifted = object.getWorldPosition(new THREE.Vector3()).addScaledVector(up, by);
  object.position.copy(object.parent!.worldToLocal(lifted));
}

/**
 * The strike's canaries: the weapon turned about its length each frame so its striking side leads the way its blow's
 * point moves, then so its flat does; the measure must read each strike within `CANARY_LEAD` of that. Each as words,
 * `caught ...` or `missed ...` (skipped for a weapon struck all round).
 */
async function strikeCanaries(lab: Lab, options: EyesOptions, skill: BoundSkill): Promise<string[]> {
  const verdicts: string[] = [];
  for (const angle of CANARY_TURNS) {
    await lab.setup({ ...options.fixture, view: 'first' });
    const { plant, restore } = plantLead(lab, angle);
    let planted: Seen[];
    try {
      planted = (await follow(lab, skill, options, null, plant)).seen;
    } finally {
      restore();
    }
    const strikes = castFrames(planted).map(strikeOf);
    const leads = strikes.flatMap((strike) => (strike?.lead === null || !strike ? [] : [strike.lead]));
    if (!leads.length) {
      verdicts.push(`skipped at ${angle}°: no side of the weapon leads (it strikes all round)`);
      continue;
    }
    const off = Math.max(...leads.map((lead) => Math.abs(lead - angle)));
    const readings = leads.map((lead) => `${lead.toFixed(0)}°`).join(', ');
    const read = `turned ${angle}° off the way it moves, read ${readings}`;
    verdicts.push(off <= CANARY_LEAD ? `caught: ${read}` : `missed: ${read}`);
  }
  return verdicts;
}

/** the most a frozen blade may read as sweeping (degrees: the trunk's turn still moves it a little) */
const FROZEN_SWEEP = 5;

/** Whether the canary's faults were caught, each as words: `caught ...` or `missed ...`. */
function canaryCaught(plantedRun: Followed, followed: Followed, skill: BoundSkill): string[] {
  const planted = plantedRun.seen;
  const seen = followed.seen;
  const casts = castFrames(planted);
  const still = casts.every((frames) => {
    const blow = blowIn(frames);
    return !blow || frames[blow.fastest].seenMoved < NO_BLOW;
  });
  const verdicts = [still ? 'caught: no blow' : 'missed: the frozen arms still read as a blow'];
  const swept = Math.max(...casts.map((frames) => sweptOver(frames.map(cutOf), 0, frames.length - 1)));
  const sweep = `${swept.toFixed(0)}°`;
  verdicts.push(swept <= FROZEN_SWEEP ? `caught: no sweep (${sweep})` : `missed: the frozen arms swept ${sweep}`);
  if (seen.some((frame) => frame.held !== null)) {
    // (by the hand as drawn, off the lower grip: the game's word, its own pose's, says it holds)
    const caught = oneHanded(planted).some((problem) => problem.includes('let go of by the other hand'));
    verdicts.push(caught ? 'caught: the two-hander let go of' : 'missed: the dropped arm read as holding');
  }
  for (const view of followed.views) verdicts.push(`the ${view.weapon}'s head: ${headCanary(view.headAt, armsLens())}`);
  if (followed.views.some((view) => view.hand === 'left')) {
    const caught = restInView(plantedRun.views).problems.some((problem) => problem.includes('left hand'));
    verdicts.push(caught ? 'caught: the left weapon out of the frame' : 'missed: the dropped left weapon read in view');
  }
  // (the arms frozen at the press while the swing keys its arm on: the drawn arm off its keys; not where the keys
  // hold it where it was at the press: a two-hander's guard after Steel Tempest's spin, keyed as its rest)
  if (describeKeyed(seen).lines.length && !keyedAway(seen, followed.rest.grip.at)) {
    verdicts.push('skipped: the keys hold the arm where it was at the press');
  } else if (describeKeyed(seen).lines.length) {
    const caught = describeKeyed(planted).problems.length > 0;
    verdicts.push(caught ? 'caught: the arm drawn off its keys' : 'missed: the frozen arm read as keyed');
  }
  // (every cut begun at rest, a one-hander's chained one, its backhand, reads as one from the rest with a backhand; a
  // blade in each hand begins each hand's from its own rest, its forehand, so there's none to read)
  const row = cutsOf(plantedRun, casts.map(strikeOf), skill);
  const oneHand = planted.every((frame) => frame.hand === 'right');
  if (row && casts.length > 1 && oneHand) {
    const caught = row.problems.some((problem) => problem.includes('from the rest with a backhand'));
    verdicts.push(caught ? 'caught: a backhand from the rest' : 'missed: no backhand from the rest');
  }
  return verdicts;
}

/** The lift canary: the cast again with its weapon lifted out of the fists each frame (`plantLift`), a fist seen off
 *  its handle; skipped when no fist was seen in the cast as it is. The weapon lifted is the right's, or the left's
 *  where only the left fist is seen (a dual wielder's Bull Rush holds the right at its rest under the frame: lifted,
 *  the right blade stayed unseen, and the canary was missed). As words, `caught ...`, `missed ...` or `skipped`. */
async function liftCanary(lab: Lab, options: EyesOptions, skill: BoundSkill, followed: Followed): Promise<string> {
  const onIn = (hand: Fist['hand']) => (frame: Seen) => frame.fists.some((fist) => fist.on && fist.hand === hand);
  const seenOn = (hand: Fist['hand']) => followed.seen.some(onIn(hand));
  if (!seenOn('right') && !seenOn('left')) return 'skipped: no fist seen';
  await lab.setup({ ...options.fixture, view: 'first' });
  const hand = !seenOn('right') && lab.model.offTip ? 'left' : 'right';
  const { plant, unplant } = plantLift(lab, undefined, undefined, hand);
  const lifted = await follow(lab, skill, options, null, plant, unplant);
  if (openFists(lifted.seen).length > 0) return 'caught: a fist off its handle';
  const seenFists = lifted.seen.flatMap((frame) => frame.fists.filter((fist) => fist.on));
  if (!seenFists.length) {
    const fists = lifted.seen.reduce((count, frame) => count + frame.fists.length, 0);
    return `missed: no fist seen with the weapon lifted (${fists} on their handles over ${lifted.seen.length} frames)`;
  }
  const off = Math.max(...seenFists.map((fist) => Math.max(fist.off, slidOf(fist))));
  const read = `${seenFists.length} fists seen, at most ${(off * 100).toFixed(1)} cm off`;
  return `missed: the lifted weapon read as held, ${read}`;
}

/** A frame as its jumps are read (page/jumps.ts): the tip's place in the camera's space, the hand whose weapon it's on,
 *  and that weapon in or near the frame. */
function jumpFrame(now: Seen): JumpFrame {
  return { frame: now.frame, tip: now.tip.at, weapon: now.hand, near: now.tip.near || now.blade.near };
}

/** How long a frame lasts on the lab's clock (s). */
const frameSeconds = (): number => window.__labClock.frame / 1000;

/** The weapon's jumps between frames from the rest before the press: those seen, and those out of the frame. */
function jumpsSeen(followed: Followed): { seen: FrameJump[]; unseen: FrameJump[] } {
  return jumpsOf(followed.seen.map(jumpFrame), jumpFrame(followed.rest), JUMP_SPEED * frameSeconds());
}

/** A jump as words: its frame, how far and how fast its tip moved, and the median move round it. */
function describeJump(jump: FrameJump): string {
  const speed = (jump.moved / frameSeconds()).toFixed(0);
  const cm = (m: number) => (m * 100).toFixed(0);
  return `frame ${jump.frame}: ${cm(jump.moved)} cm (${speed} m/s) against ${cm(jump.round)}`;
}

/** The weapon's jumps between frames as a line, and those seen as a problem (#249: Steel Tempest's blade leapt a metre
 *  in a frame each turn of the spin, its elbow flipping over as the shoulder came round under the camera). */
function describeJumps(followed: Followed): { line: string; problems: string[] } {
  const { seen, unseen } = jumpsSeen(followed);
  const words = (jumps: FrameJump[]) => jumps.map(describeJump).join('; ');
  const parts = [seen.length ? `seen on ${words(seen)}` : 'none seen'];
  if (unseen.length) parts.push(`out of the frame on ${words(unseen)}`);
  const head = `the weapon's jumps between frames (its tip moving at least ${JUMP_SPEED} m/s, ${JUMP_TIMES} times `
    + `the median of the moves round it, ${JUMP_SIDE} times the slower frame either side and as far as the faster, `
    + 'in cm)';
  const problems = seen.length ? [`the weapon jumps between frames, seen on ${words(seen)}`] : [];
  return { line: `${head}: ${parts.join('; ')}`, problems };
}

/** An arm's elbow through the frames as the weapon's jumps read a tip (page/jumps.ts): its place in the eyes' space,
 *  near when any of that arm is in or near the frame (an elbow beside the eyes is out of the frame, its forearm in it:
 *  flipped over there, the forearm swings round across the frame's edge; and a two-hander's right elbow flipped out to
 *  the shoulder's height below the frame, the arm out of the frame from the shoulder to the fist, was never seen). */
function elbowFrame(now: Seen, side: 0 | 1): JumpFrame {
  return { frame: now.frame, tip: now.pose.arms[side][1], weapon: 'elbow', near: now.armsNear[side] };
}

/** Each elbow's jumps between frames from the rest before the press as a line, and each seen as a problem (a jump
 *  read on the weapon alone misses an arm flipped over round a hand held still). */
function describeElbowJumps(followed: Followed): { line: string; problems: string[] } {
  const words: string[] = [];
  const problems: string[] = [];
  ([[0, 'right'], [1, 'left']] as const).forEach(([side, name]) => {
    const frames = followed.seen.map((now) => elbowFrame(now, side));
    const { seen, unseen } = jumpsOf(frames, elbowFrame(followed.rest, side), ELBOW_JUMP_SPEED * frameSeconds());
    if (unseen.length) words.push(`the ${name} elbow out of the frame on ${unseen.map(describeJump).join('; ')}`);
    if (!seen.length) return;
    const said = `the ${name} elbow on ${seen.map(describeJump).join('; ')}`;
    words.push(said);
    problems.push(`an elbow jumps between frames: ${said}`);
  });
  const head = `the elbows' jumps between frames (moving at least ${ELBOW_JUMP_SPEED} m/s, as the weapon's are read)`;
  return { line: `${head}: ${words.length ? words.join('; ') : 'none'}`, problems };
}

/** The elbow canary: the cast again with the right elbow moved `CANARY_ELBOW` up the view on one frame alone, its
 *  stillest in the frame or out of it, which must read as a jump there, seen where the arm was in or near the frame
 *  and out of the frame where it wasn't (a two-hander's row of cuts holds the right arm below the frame throughout).
 *  As words, `caught ...`, `missed ...` or `skipped ...`. */
async function elbowCanary(lab: Lab, options: EyesOptions, skill: BoundSkill, followed: Followed): Promise<string> {
  const anywhere = (now: Seen): JumpFrame => ({ ...elbowFrame(now, 0), near: true });
  const at = stillestFrame(followed.seen.map(anywhere), anywhere(followed.rest));
  if (at < 0) return 'skipped: too few frames';
  const frame = followed.seen[at].frame;
  await lab.setup({ ...options.fixture, view: 'first' });
  // (the first plant is the rest's, read before the press)
  let planted = -2;
  const elbow = lab.joints.elbowR;
  let was: THREE.Vector3 | null = null;
  const plant = () => {
    if (++planted !== frame) return;
    was = elbow.position.clone();
    liftInView(elbow, CANARY_ELBOW);
    lab.model.root.updateWorldMatrix(true, true);
  };
  const unplant = () => {
    if (was) elbow.position.copy(was);
    was = null;
    lab.model.root.updateWorldMatrix(true, true);
  };
  const again = await follow(lab, skill, options, null, plant, unplant);
  const { seen, unseen } = jumpsOf(again.seen.map((now) => elbowFrame(now, 0)), elbowFrame(again.rest, 0),
    ELBOW_JUMP_SPEED * frameSeconds());
  const shown = again.seen.find((now) => now.frame === frame)?.armsNear[0] ?? false;
  const jumps = shown ? seen : unseen;
  const where = shown ? 'seen' : 'out of the frame';
  const read = jumps.length ? jumps.map(describeJump).join('; ') : 'none';
  if (jumps.some((jump) => plantedAt(jump, frame))) return `caught on frame ${frame} (${where})`;
  return `missed on frame ${frame} (${where}): ${read}`;
}

/** The jump canary: the cast again with its weapon lifted `CANARY_JUMP` up the view on one frame alone, the stillest
 *  in the frame of the cast as it is, which must read as a jump there. As words, `caught ...`, `missed ...` or
 *  `skipped ...`. */
async function jumpCanary(lab: Lab, options: EyesOptions, skill: BoundSkill, followed: Followed): Promise<string> {
  const at = stillestFrame(followed.seen.map(jumpFrame), jumpFrame(followed.rest));
  if (at < 0) return 'skipped: the weapon never in the frame';
  const frame = followed.seen[at].frame;
  await lab.setup({ ...options.fixture, view: 'first' });
  // (the first plant is the rest's, read before the press)
  let planted = -2;
  const { plant, unplant } = plantLift(lab, () => CANARY_JUMP, () => ++planted === frame);
  const jumps = jumpsSeen(await follow(lab, skill, options, null, plant, unplant)).seen;
  const read = jumps.length ? jumps.map(describeJump).join('; ') : 'none';
  if (jumps.some((jump) => plantedAt(jump, frame))) return `caught on frame ${frame}`;
  return `missed on frame ${frame}: ${read}`;
}

/** Whether a jump read is one a canary planted on `frame` alone: out to it or back from it, whichever moved further
 *  (page/jumps.ts: a jump is a peak; read both ways, a blade lifted at a swing's end read on its way back alone). */
const plantedAt = (jump: FrameJump, frame: number): boolean => jump.frame === frame || jump.frame === frame + 1;

/** The slide canary: the cast again with its weapon held at its first turn each frame (strike.ts `plantSlide`), its
 *  strikes' whip read under `SLID_WHIP`. As words, `caught ...` or `missed ...`. */
async function slideCanary(lab: Lab, options: EyesOptions, skill: BoundSkill): Promise<string> {
  await lab.setup({ ...options.fixture, view: 'first' });
  const { plant, restore } = plantSlide(lab);
  let planted: Seen[];
  try {
    planted = (await follow(lab, skill, options, null, plant)).seen;
  } finally {
    restore();
  }
  const whips = castFrames(planted).flatMap((frames) => {
    const strike = strikeOf(frames);
    return strike ? [strike.whip] : [];
  });
  if (!whips.length) return 'missed: no strike read';
  const read = whips.map((whip) => whip.toFixed(1)).join(', ');
  return whips.every((whip) => whip < SLID_WHIP) ? `caught: whip ${read}` : `missed: whip ${read}`;
}

/** The film: every `every`th frame pictured through the eyes, small, in rows, each with its frame and share. */
class Film {
  /** every frame taken, small and labelled, by its frame number (the film shows every `every`th; a strike strip the
   *  frames round a strike, one after another) */
  private readonly frames = new Map<number, HTMLCanvasElement>();

  /** each cast's firing frame from the close-ups asked for, the arms and the weapon seen from outside */
  readonly closeUps: Pictured[] = [];

  constructor(
    private readonly every: number,
    private readonly cast: number | null,
    private readonly close: ViewName[],
  ) {}

  /** Pictures `now`'s frame, if it's of a cast the film takes (and from the close-ups, if it fires). */
  take(lab: Lab, now: Seen): void {
    if (this.cast !== null && now.cast !== this.cast - 1) return;
    if (now.fires && this.close.length) this.closeUps.push(firingFromOutside(lab, now, this.close));
    const [{ canvas: frame }] = lab.drawn(['eyes']);
    const canvas = document.createElement('canvas');
    canvas.width = FILM_WIDTH;
    canvas.height = Math.round(FILM_WIDTH * frame.height / frame.width);
    const context = canvas.getContext('2d')!;
    context.drawImage(frame, 0, 0, canvas.width, canvas.height);
    const share = now.share === null ? '' : now.share.toFixed(2);
    label(context, [`${now.frame}  ${share}${now.fires ? '  fires' : ''}`, wristLabel(now)]);
    this.frames.set(now.frame, canvas);
  }

  /** The film (every `every`th frame, in rows) as one picture, a moment of the report. */
  moment(name: string): Pictured {
    const shown = [...this.frames.entries()].filter(([frame]) => frame % this.every === 0).map(([, canvas]) => canvas);
    return sheetOf(name, shown, FILM_COLUMNS);
  }

  /** A cast's strike frame by frame in a row, from `STRIP_ROUND` frames before its fastest (`seen`'s frame number) to
   *  as many after, a moment of the report; none when the film took none of it. (Its frames from where it began to
   *  where it ended were a row 18 frames long for a slow one) */
  strip(name: string, fastest: number): Pictured | null {
    const shown: HTMLCanvasElement[] = [];
    for (let frame = fastest - STRIP_ROUND; frame <= fastest + STRIP_ROUND; frame++) {
      const canvas = this.frames.get(frame);
      if (canvas) shown.push(canvas);
    }
    return shown.length ? sheetOf(name, shown, shown.length) : null;
  }
}

/** `frames` (each `FILM_WIDTH` wide, as high as the first) in rows of `columns`, as a moment named `name`. */
function sheetOf(name: string, frames: HTMLCanvasElement[], columns: number): Pictured {
  const rows = Math.ceil(frames.length / columns);
  const height = frames[0]?.height ?? 0;
  const sheet = document.createElement('canvas');
  sheet.width = FILM_WIDTH * Math.min(columns, frames.length);
  sheet.height = height * rows;
  const context = sheet.getContext('2d')!;
  frames.forEach((frame, i) => {
    context.drawImage(frame, (i % columns) * FILM_WIDTH, Math.floor(i / columns) * height);
  });
  const png = sheet.toDataURL('image/png');
  return { label: name, tiles: [{ view: 'eyes', png, width: sheet.width, height: sheet.height }], notes: [] };
}

/** A cast's firing frame from `views` (close-ups), framed on the hand holding the weapon the tip is on. */
function firingFromOutside(lab: Lab, now: Seen, views: ViewName[]): Pictured {
  const left = lab.model.tip?.parent?.parent === lab.joints.handL;
  const label = `cast ${now.cast + 1} as it fires (frame ${now.frame}), from outside`;
  const notes = [...holdingWrists(now).map(describeWrist), ...now.armsPastWords];
  return lab.picture(label, views, notes, { focus: left ? 'handL' : 'handR' });
}

/** `lines` written on a film frame's top left, one under another. */
function label(context: CanvasRenderingContext2D, lines: string[]): void {
  context.font = 'bold 15px system-ui, sans-serif';
  context.lineWidth = 3;
  context.strokeStyle = '#000';
  context.fillStyle = '#fff';
  lines.forEach((text, i) => {
    context.strokeText(text, 6, 18 + i * 18);
    context.fillText(text, 6, 18 + i * 18);
  });
}
