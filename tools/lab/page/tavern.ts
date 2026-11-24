// The tavern's keeper, his mugs and his ale (tools/lab `tavern`; src/world/tavern.ts, src/game/mugs.ts,
// src/entities/models/keeper.ts, src/combat/skills/ale.ts, src/entities/models/flask.ts). Into the Ember & Oak by its
// door, the hero stood by the door while the keeper goes about his tasks (wiping the bar along its length, sweeping,
// stoking the fire, wiping a table), each pictured; then at the bar, where he must come to the tap. Talked to by E, the
// card within the window and a free beer its first reply; asked, he must take a clean mug off the back counter (empty
// as he takes it), fill it at the tap and slide it across, and the hero take it up and drink it for its 5 s, standing
// still through it whatever is pressed (W held), the mug in his hand in the flask's place, the rim's nearest point on
// his lower lip at each swallow, tipped no more than 70° and further at each, the mug gone from the bar once taken. At
// its end the hero sets the mug down on the bar, and the keeper must clear it, wash it, dry it and stand it back with
// the clean ones. Then every mug left dirty on the bar and another asked for: he must wash one first and serve it; and
// every mug out in heroes' hands: he serves none until one comes back. Every frame, the mugs must add up to their count,
// none may jump or go from sight but into a hero's hand, and his planted feet must not slide. No program may compile
// from the room's coming in to the end. `--canary`: the ale made a cast he may walk through, which must be caught.
import * as THREE from 'three';
import type { Frame, Lab, Pictured, Report, ViewName } from './lab';
import { G } from '../../../src/state';
import { villageObject } from '../../../src/game/village';
import { enterRoom } from '../../../src/game/rooms';
import { ALE, ALE_BEATS, BAR, BAR_STOOL_X, BAR_STOOLS, KEEPER_SPOT, MUG_COUNT } from '../../../src/data/tavern';
import { SIT } from '../../../src/entities/sitting';
import { satWhole } from './sit';
import { MUG } from '../../../src/entities/models/flask';
import type { TavernKeeper } from '../../../src/world/tavernKeeper';
import type { HandGoal } from '../../../src/entities/models/keeper';
import { toVillage } from './village';
import { stand, useByE, viewAs } from './houses';
import { slipOf } from './feet';
import { BodyClear, HandsSmooth, LimbsClear, MugsHeld } from './keeperWatch';
import { KEEPER_ARMS, KEEPER_GAIT } from '../../../src/entities/models/keeper';
import { KEEPER_WAYS } from '../../../src/world/tavernKeeper';
import { GaitWatch, plannedWays } from './keeperGait';
import { ShirtSeams, shiftBelly } from './keeperShirt';
import { choosingAle, lastOffer, pickAle, takeMug, waitingMug } from './takeAle';
import { boostRead } from './keeperBoost';
import { drawsSaid, PoseTimes } from './keeperCost';
import { aleBoost, ALE_STACKS } from '../../../src/game/aleBoost';
import { throughTheEyes } from './tavernEyes';
import { keeperLooks } from './keeperLooks';
import { solePoints } from './soles';
import { talkAnswerable } from '../../../src/ui/screens/talk/talk';
import { footShape, type FootShape } from '../../../src/entities/models/ik';

/** `--canary`: the ale made a cast he may walk through; `--looks`: him pictured from Kenneth's angles alone. */
export interface TavernOptions {
  canary: boolean;
  looks?: boolean;
}

/** the frames a stand or a press settles for */
/** how long a served mug is watched waiting on the bar, how long a choice may take to show (frames), how long the
 *  drink is watched held while it shows, and the share it's held at (world/tavernKeeper.ts's `HOLD_AT`) */
const WAITS_FOR = 120, CHOICE_IN = 90, HELD_FOR = 60, HELD_AT = 0.16;
/** how long he's given to walk up to a bar stool and sit (frames) */
const SIT_IN = 900;
const SETTLE = 12;
/** the most frames the keeper's lines are given to show, all of them, before his replies are read */
const TALK_READ = 10 * 60;
/** the drink's beats pictured (shares of its time), and the frames W is held over its start */
const PICTURED = [0.15, 0.3, 0.46, 0.62, 0.8, 0.95];
const HELD_W = 40;
/** how far the rim's nearest point may stand from his lower lip at a swallow's middle (m), the most the mug may tip
 *  from upright (degrees: a mug is never drunk upside down), and how far he may move while drinking */
const RIM_NEAR = 0.015, MOST_TILT = 70, STILL_WITHIN = 0.02;
/** the steps of a mug's round pictured once each, this many frames into it, and what each is */
const STEP_SHOT_AT = 25;
const STEP_SHOTS: Record<string, string> = {
  take: 'he takes a clean mug off the back counter', pour: 'he fills it at the tap', slide: 'he slides it across',
  collect: 'he collects a mug set down', wash: 'he washes it in the tub', dry: 'he dries it',
  shelve: 'he stands it back with the clean ones',
};
/** the steps filmed a frame at a time for a look at how he moves (Kenneth's: the table wiped, a mug taken and washed,
 *  his walk): from which frame of the step, every how many, how many pictures, from where (by his own facing) */
interface Film { from: number; every: number; count: number; views: ViewName[] }
const FILMS: Record<string, Film> = {
  'wipe table': { from: 60, every: 6, count: 4, views: ['left', 'above'] },
  take: { from: 0, every: 8, count: 4, views: ['left', 'above'] },
  wash: { from: 20, every: 50, count: 4, views: ['left', 'above'] },
  walk: { from: 20, every: 7, count: 4, views: ['left', 'front'] },
};
/** how far a mug may move in a frame (m: slid across the bar, about 3 m/s), and a planted foot */
// (a planted foot's slip a frame no worse than the heroes' own gait's: `lab feet --class ranger --scenarios level`
// read 5.2 cm at its worst frame, and no stance slid 10 cm all told)
const MUG_JUMP = 0.12, FOOT_SLIDE = 0.055;
/** how far his body may move in a frame (m: his walk is 1.05 m/s, under 2 cm a frame) */
const BODY_STEP = 0.03;
/** an ankle this near the floor is planted (m) */
const PLANTED = 0.13;
/** where the hero waits by the door while the keeper works (the room's m), out of his reach of the bar */
const BY_DOOR: [number, number] = [0.3, 2.9];
/** his tasks pictured, each by the step he's on at its height */
const TASKS: [string, string][] = [['wipeBar', 'wipe bar'], ['sweep', 'sweep'], ['stoke', 'stoke fire'], ['smallTable', 'wipe table']];
/** the frames a task, a serving or a clearing is given before it's called stuck */
const TASK_IN = 1500, SERVE_IN = 900, CLEAR_IN = 2400;
/** how far under the head's `mouth` point the lower lip is (m: models/flask.ts `ALE_DRINK.lowerLip`) */
const LOWER_LIP = 0.006;

const programs = (): number => G.renderer.info.programs?.length ?? 0;
const _lips = new THREE.Vector3(), _rim = new THREE.Vector3(), _foot = new THREE.Vector3(), _axis = new THREE.Vector3();
const _turn = new THREE.Quaternion();

/** How far into his drink the hero is (0..1), or -1 while he isn't drinking the ale. */
function drinkShare(): number {
  const c = G.player.casting;
  return c?.skill.def.ale ? c.t / c.dur : -1;
}

/** The mug in his hand as drawn: shown in the flask's place, how far its rim's nearest point is from his lower lip
 *  (m: the head's `mouth` point, under it by the drink's `lowerLip`), and how far it's tipped from upright in the world
 *  (degrees). (Read off the rim's middle against the mouth point, a mug stood upside down past his brow read 3.7 cm.) */
function mugInHand(): { shown: boolean; flaskHidden: boolean; rimOff: number; tilt: number } {
  const root = G.player.model.root;
  const flask = root.getObjectByName('flask'), mouth = root.getObjectByName('mouth'), head = mouth?.parent;
  const mug = flask?.getObjectByName('mug');
  if (!flask || !mouth || !mug || !head) return { shown: false, flaskHidden: false, rimOff: Infinity, tilt: 0 };
  root.updateWorldMatrix(true, true);
  const scale = root.getWorldScale(_foot).x;
  mouth.getWorldPosition(_lips).add(_axis.set(0, -LOWER_LIP * scale, 0).applyQuaternion(head.getWorldQuaternion(_turn)));
  const axis = _axis.set(0, 1, 0).applyQuaternion(mug.getWorldQuaternion(_turn)).normalize();
  const middle = mug.getWorldPosition(_rim).addScaledVector(axis, MUG.up * scale);
  const toLip = _foot.subVectors(_lips, middle);
  toLip.addScaledVector(axis, -toLip.dot(axis));
  const edge = middle.clone().addScaledVector(toLip.normalize(), MUG.rimR * scale);
  const parts = (flask.userData.flaskParts as THREE.Object3D[] | undefined) ?? [];
  return {
    shown: flask.visible && mug.visible, flaskHidden: parts.every((o) => !o.visible),
    rimOff: edge.distanceTo(_lips), tilt: Math.acos(THREE.MathUtils.clamp(axis.y, -1, 1)) * 180 / Math.PI,
  };
}

/** What every frame must keep: the mugs adding up, none jumping or gone from sight but into a hero's hand, his planted
 *  feet still. */
class Watch {
  worstSum = '';
  worstJump = 0;
  jumpAt = '';
  unseen = 0;
  worstSlide = 0;
  worstStep = 0;
  stepAt = '';
  private wasDoing = '';
  slideAt = '';
  private readonly last: (THREE.Vector3 | null)[] = [];
  private readonly lastPlace: string[] = [];
  private readonly feet: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(), new THREE.Vector3()];
  private feetSeen = false;
  private plantedWas: [boolean, boolean] = [false, false];
  private readonly footYawWas = [0, 0];
  private readonly footSpotWas = [new THREE.Vector3(), new THREE.Vector3()];
  private placings = 0;
  private readonly root = new THREE.Vector3();
  private readonly rootWas = new THREE.Vector3();
  private yawWas = 0;
  /** each foot's shape, and its sole's points this frame and the last: a slip is the least any point on the floor
   *  moved (`slipOf`, as `feet` reads the heroes': by the ankle, a foot turning on its ball read as a slide) */
  private shapes: FootShape[] | null = null;
  private readonly soles: [THREE.Vector3[], THREE.Vector3[]] = [[], []];
  private readonly solesWas: [THREE.Vector3[], THREE.Vector3[]] = [[], []];
  private stepWas = '';
  private timeWas = 0;
  private readonly at = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  /** his hands' smoothness, his body against the counters, the mugs never in the air (keeperWatch.ts) */
  readonly hands = new HandsSmooth();
  readonly body = new BodyClear();
  readonly held = new MugsHeld();
  readonly limbs = new LimbsClear();
  readonly gait = new GaitWatch();
  readonly shirt = new ShirtSeams();

  constructor(private readonly tv: TavernKeeper) {}

  /** what it last saw forgotten: the lab moved the mugs itself, or stepped frames it didn't read (a stand, a press),
   *  whose moves would read as one frame's */
  forget(): void {
    this.last.length = 0;
    this.feetSeen = false;
    this.hands.forget();
    this.gait.forget();
  }

  read(): void {
    const ledger = this.tv.mugs, c = ledger.counts();
    if (c.total !== MUG_COUNT || c.clean + c.out + c.dirty !== MUG_COUNT) this.worstSum ||= `${c.clean} clean, ${c.out} out, ${c.dirty} dirty`;
    for (const m of ledger.mugs) {
      const place = m.place.at, was = this.lastPlace[m.id];
      this.lastPlace[m.id] = place;
      if (place === 'hero') { this.last[m.id] = null; continue; }
      const mesh = this.tv.mugAt(m.id);
      const shown = this.tv.mugMesh(m.id).getWorldScale(this.scale).x > 0.5;
      if (!shown) this.unseen++;
      const last = this.last[m.id];
      if (last && was !== 'hero') {
        const jump = mesh.distanceTo(last);
        if (jump > this.worstJump) { this.worstJump = jump; this.jumpAt = `mug ${m.id} ${was}->${place}`; }
      }
      this.last[m.id] = mesh.clone();
    }
    const keeper = this.tv.keeper();
    if (!keeper) return;
    const now = `${this.tv.doing().job}: ${this.tv.doing().step}`;
    // (his feet and arms set afresh under him this frame, as he was put somewhere at once: not a slide, not a jump)
    if (keeper.placings !== this.placings) {
      this.placings = keeper.placings;
      this.feetSeen = false;
      this.hands.forget();
    }
    this.hands.read(keeper, now, this.tv.body());
    this.body.read(keeper, now);
    this.held.read(this.tv, keeper, now);
    this.limbs.read(keeper, keeper.root.parent!, now);
    this.gait.read(this.tv, keeper, G.arena.rooms!.tavern.seats, now);
    this.shirt.read(keeper, now);
    const planted = keeper.feet(this.feet);
    this.shapes ??= keeper.ankles.map((ankle) => footShape(ankle, keeper.root));
    for (let i = 0; i < 2; i++) {
      this.solesWas[i] = this.soles[i].map((point) => point.clone());
      solePoints(keeper.ankles[i], this.shapes[i], this.soles[i]);
    }
    // (his feet set afresh under him this frame, as the tavern came into view: not a slide)
    if (this.feetSeen) {
      for (let i = 0; i < 2; i++) {
        const now = this.feet[i];
        const slide = slipOf(this.soles[i], this.solesWas[i]);
        // (planted by the leg IK both frames: a foot swung low past the floor isn't one)
        if (planted[i] && this.plantedWas[i] && now.y < PLANTED && slide > this.worstSlide) {
          this.worstSlide = slide;
          this.root.copy(keeper.root.getWorldPosition(this.at));
          const foot = keeper.legs.feet[i];
          this.slideAt = `${this.tv.doing().job}: ${this.tv.doing().step}, foot ${i} at ${now.y.toFixed(2)} m (${foot.state}, its spot ${foot.P.x.toFixed(2)}, ${foot.P.z.toFixed(2)}, planted ${foot.stance.toFixed(2)} s, its heading ${this.footYawWas[i].toFixed(2)} to ${foot.yaw.toFixed(2)}, its spot moved ${Math.hypot(foot.P.x - this.footSpotWas[i].x, foot.P.z - this.footSpotWas[i].z).toFixed(3)} m${foot.over ? ', out of reach' : ''}${foot.dragged ? ', dragged' : ''}), his body moved ${(this.root.distanceTo(this.rootWas) * 100).toFixed(1)} cm and turned ${(Math.abs(keeper.root.rotation.y - this.yawWas) * 180 / Math.PI).toFixed(0)}° that frame, from ${this.stepWas}`;
        }
      }
    }
    this.plantedWas = planted;
    for (let i = 0; i < 2; i++) { this.footYawWas[i] = keeper.legs.feet[i].yaw; this.footSpotWas[i].copy(keeper.legs.feet[i].P); }
    const doing = `${this.tv.doing().job}: ${this.tv.doing().step}`;
    // (his move scaled to a 60th of a second by the frame's own time: now and then the game is stepped two frames'
    // time in one, and his walk went twice as far in it)
    const frameTime = G.time - this.timeWas;
    this.timeWas = G.time;
    if (this.feetSeen && frameTime > 0) {
      keeper.root.getWorldPosition(this.root);
      const moved = Math.hypot(this.root.x - this.rootWas.x, this.root.z - this.rootWas.z) / (frameTime * 60);
      if (moved > this.worstStep) { this.worstStep = moved; this.stepAt = `${this.wasDoing} -> ${doing}, from ${this.rootWas.x.toFixed(2)}, ${this.rootWas.z.toFixed(2)} to ${this.root.x.toFixed(2)}, ${this.root.z.toFixed(2)}`; }
    }
    this.wasDoing = doing;
    keeper.root.getWorldPosition(this.rootWas);
    this.yawWas = keeper.root.rotation.y;
    this.stepWas = doing;
    this.feetSeen = true;
  }
}

/** `--canary`'s plants, each with what its problem must say: walking while drinking, his arms let through his body */
const CANARIES: readonly [string, string][] = [
  ['walking while drinking', 'while drinking'], ['his arms through his body', 'into his body'], ['his ways straight through the furniture', 'a way planned passes'],
  ['a stop at each bend', 'stopped on his way'], ['his feet set on each other', 'his feet '], ['his walk with straight legs', 'knee'],
  ['the belly of his shirt shifted round', 'stripes stepped'], ['a second ale stacked on the first', '(stacked)'],
];
/** each of the canary's plants set (`on`) or taken away */
function plant(on: boolean): void {
  KEEPER_ARMS.offBody = !on;
  KEEPER_WAYS.planned = !on;
  KEEPER_WAYS.stopToTurn = on;
  KEEPER_GAIT.cross = on;
  KEEPER_GAIT.flat = on;
  ALE_STACKS.canary = on;
}

export async function tavern(lab: Lab, options: TavernOptions): Promise<Report> {
  const lines: string[] = [];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  await toVillage(lab);
  await viewAs(lab, 'third');
  enterRoom('tavern');
  await lab.until(() => G.arena.room === 'tavern', 600, 'the tavern never opened');
  const room = G.arena.rooms!.tavern, tv = room.tavern?.(), keeper = tv?.keeper();
  if (!tv || !keeper) return { text: 'no keeper', problems: ['the tavern has no keeper seated'], moments };
  if (options.looks) {
    const looks = await keeperLooks(lab, tv, keeper);
    return { text: `looks: ${looks.moments.length} pictured`, problems: looks.problems, moments: looks.moments };
  }
  const before = programs();
  const watch = new Watch(tv);
  const poseTimes = new PoseTimes(keeper);
  // (no boost of an ale before this one's: his life's most as his gear has it)
  aleBoost.waiting = false;
  aleBoost.waves = 0;
  G.player.recomputeStats(G.player.equipped);
  const lifeBase = G.player.stats.maxLife;
  if (options.canary) { plant(true); shiftBelly(keeper, 0.3); }
  /** frames stepped, each read by the watch; until `done` or `most` frames, which it returns (-1: never done) */
  /** the mug waiting taken up by E and drunk by E, as a player does (`takeAle.ts`); whether his drink began */
  const takeAndDrink = async (): Promise<boolean> => {
    if (!(await takeMug(lab, tv, waitingMug(tv), watched))) return false;
    if (await frames(CHOICE_IN, choosingAle) < 0) return false;
    await pickAle(lab, 'drink', watched);
    return (await frames(CHOICE_IN, () => drinkShare() > HELD_AT + 0.02)) >= 0;
  };
  /** The served mug waits on the bar, never handed over by itself; taken up by E it's held at the lift while the choice
   *  shows; put down, it's back on the bar full and clean; taken up again and drunk (Kenneth's round 3, notes 18, 24). */
  const mugWaitsAndIsChosen = async (): Promise<void> => {
    await frames(WAITS_FOR);
    const waiting = waitingMug(tv);
    lines.push(`the mug waits: ${waiting >= 0 && drinkShare() < 0 ? `on the bar ${(WAITS_FOR / 60).toFixed(0)} s on, not drunk` : 'NOT waiting'}`);
    if (waiting < 0 || drinkShare() >= 0) problems.push('the mug served was handed over by itself, not left waiting on the bar');
    if (!(await takeMug(lab, tv, waiting, watched))) return;
    const chosen = await frames(CHOICE_IN, choosingAle);
    await frames(HELD_FOR);
    const held = drinkShare();
    const mugAt = tv.mugs.get(waiting).place as { x: number; z: number }, feet = room.group.worldToLocal(G.player.pos.clone());
    if (chosen < 0) lines.push(`  (${lastOffer})`);
    if (chosen < 0) lines.push(`  (offered ${tv.doing().offered}, mug ${waiting} at ${tv.mugs.get(waiting).place.at}, ${Math.hypot(mugAt.x - feet.x, mugAt.z - feet.z).toFixed(2)} m from his feet, casting ${G.player.casting?.skill.def.name ?? 'nothing'}, mode ${G.mode})`);
    lines.push(`taken up by E: the choice ${chosen < 0 ? 'NEVER shown' : `shown, his drink held at ${(held * 100).toFixed(0)}%`}`);
    if (chosen < 0) problems.push('the mug taken up by E, its choice (drink or put down) never showed');
    if (held > HELD_AT + 0.02) problems.push(`with the choice up, his drink went on to ${(held * 100).toFixed(0)}%`);
    await pickAle(lab, 'down', watched);
    await frames(CHOICE_IN);
    const back = tv.mugs.get(waiting);
    const down = back.place.at === 'bar' && back.full > 0.5 && !back.dirty && drinkShare() < 0;
    lines.push(`put down: ${down ? 'back on the bar, full and clean' : `NOT (${back.place.at}, full ${back.full.toFixed(2)}, ${back.dirty ? 'dirty' : 'clean'})`}`);
    if (!down) problems.push('put down, the mug wasn\'t back on the bar full for anyone to take');
    if (!(await takeAndDrink())) problems.push('the mug put down, taken up again and drunk, never drunk');
  };
  /** `count` frames of `input`, the watch reading each (a take's steps: stepped round it, its frames went unread and the
   *  keeper's walk over them read as one frame's jump) */
  const watched = async (count: number, input: () => Frame): Promise<void> => {
    await frames(count, undefined, input);
  };
  /** Sat on the bar stool nearest the keeper's stand (as `lab sit` lets him sit idle), ale asked for from it, its mug
   *  taken up by E and drunk there: sat down whole from the ask to the drink's end (Kenneth's round 3: "the hero can
   *  sit on the bar stools and drink while seated"). */
  const drinkSeated = async (): Promise<void> => {
    const seats = G.arena.rooms!.tavern.seats;
    const stoolAt = BAR_STOOLS.reduce((a, b) => (Math.abs(b - KEEPER_SPOT.z) < Math.abs(a - KEEPER_SPOT.z) ? b : a));
    const seat = seats.find((s) => Math.abs(s.ax - BAR_STOOL_X) < 0.01 && Math.abs(s.az - stoolAt) < 0.01);
    if (!seat) {
      problems.push('the bar stools are no seats');
      return;
    }
    const before = SIT.auto;
    G.player.walkTo = null;
    G.player.place(room.group.localToWorld(new THREE.Vector3(BAR_STOOL_X - 0.6, 0, stoolAt)), Math.PI / 2);
    SIT.auto = true;
    G.player.sitting.only = seat;
    G.player.sits = true;
    const sat = await frames(SIT_IN, () => satWhole(G.player.sitting.pose));
    try {
      lines.push(`sat on a bar stool: ${sat < 0 ? 'NEVER' : `in ${(sat / 60).toFixed(1)} s`}`);
      if (sat < 0) {
        problems.push('he never sat on the bar stool');
        return;
      }
      room.serveAle?.(G.player);
      const waited = await frames(SERVE_IN, () => waitingMug(tv) >= 0);
      let stood = 0, most = 0;
      const drank = waited >= 0 && await takeAndDrink();
      await frames(ALE.castTime * 60 + 60, () => {
        if (!satWhole(G.player.sitting.pose)) stood++;
        most = Math.max(most, drinkShare());
        return drinkShare() < 0;
      });
      lines.push(`drunk sat: ${!drank ? 'NOT taken up and drunk' : `drunk to ${(most * 100).toFixed(0)}%, ${stood ? `up for ${stood} frames` : 'sat all the while'}`}`);
      if (!drank || most < ALE_BEATS.setDown) problems.push('sat on a bar stool, his ale was never drunk');
      if (stood) problems.push(`sat on a bar stool, his drink got him up (${stood} frames)`);
    } finally {
      SIT.auto = before;
      G.player.sits = false;
      G.player.sitting.only = null;
      G.player.sitting.clear();
      await frames(30);
    }
  };
  const frames = async (most: number, done: () => boolean = () => false, input?: () => Frame): Promise<number> => {
    for (let f = 0; f < most; f++) {
      if (done()) return f;
      await lab.step(1, input);
      watch.read();
      shootStep();
      if (watch.gait.newWorst) crossedShot = shootFeet(`feet-crossed`, watch.gait.across.at);
    }
    return done() ? most : -1;
  };
  /** each step of a mug's round pictured once, a little into it */
  let stepNow = '', stepFor = 0;
  const shot = new Set<string>();
  const filmed = new Map<string, number>();
  const shootStep = () => {
    const name = tv.doing().step;
    stepFor = name === stepNow ? stepFor + 1 : 0;
    stepNow = name;
    filmStep(name);
    if (stepFor !== STEP_SHOT_AT || !(name in STEP_SHOTS) || shot.has(name)) return;
    shot.add(name);
    // (from his sides along the aisle behind the bar, whichever way he faces: from the bar's front, what he does at the
    // back counter is behind him; the views go by the hero's facing, so the hero, hidden for it, is turned as he is and
    // turned back after)
    const at = keeper.root.getWorldPosition(new THREE.Vector3()).setY(1.0), facing = G.player.facing;
    G.player.facing = keeper.root.rotation.y;
    lab.model.root.visible = false;
    moments.push(lab.picture(`step-${name}`, ['left', 'right'], [STEP_SHOTS[name]], { at, distance: 2.8 }));
    lab.model.root.visible = true;
    G.player.facing = facing;
  };
  /** a filmed step's next frame, from his own facing's sides, the hero hidden (a walk's only while he's under way) */
  const filmStep = (name: string) => {
    const film = FILMS[name], done = filmed.get(name) ?? 0;
    if (!film || done >= film.count || stepFor < film.from || (stepFor - film.from) % film.every) return;
    if (name === 'walk' && tv.body().speed < 0.5) return;
    filmed.set(name, done + 1);
    const at = keeper.root.getWorldPosition(new THREE.Vector3()).setY(1.0), facing = G.player.facing;
    G.player.facing = keeper.root.rotation.y;
    lab.model.root.visible = false;
    const label = `film-${name.replace(' ', '-')}-${done + 1}`;
    moments.push(lab.picture(label, film.views, [`${name}, frame ${stepFor}`], { at, distance: 2.6 }));
    lab.model.root.visible = true;
    G.player.facing = facing;
  };
  /** his legs pictured from behind and above as he is now (the worst crossing of his feet, kept to the run's end) */
  let crossedShot: Pictured | null = null;
  const shootFeet = (label: string, note: string): Pictured => {
    const at = keeper.root.getWorldPosition(new THREE.Vector3()).setY(0.35), facing = G.player.facing;
    G.player.facing = keeper.root.rotation.y;
    lab.model.root.visible = false;
    const shot = lab.picture(label, ['back', 'above'], [note], { at, distance: 1.5 });
    lab.model.root.visible = true;
    G.player.facing = facing;
    return shot;
  };
  const keeperAt = (y = 1.2) => keeper.root.getWorldPosition(new THREE.Vector3()).setY(y);
  /** the keeper pictured from the hero's side, the hero turned to him where he stands */
  const picture = async (label: string, note: string, distance = 2.4) => {
    const at = keeperAt(), me = G.player.pos;
    G.player.facing = Math.atan2(at.x - me.x, at.z - me.z);
    moments.push(lab.picture(label, ['back', 'left'], [note], { at, distance }));
  };

  /** how far each of his hands is from where it was sent (cm), or 'free' */
  const handsOff = (): string => {
    const at: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(), new THREE.Vector3()], b = tv.body();
    keeper.hands(at);
    // (a hand gripping what the other holds is sent to where that thing is, not where it was asked to be)
    const goalOf = (goal: HandGoal) => (goal.on ? goal.on.thing.localToWorld(new THREE.Vector3(0, goal.on.along, 0)) : goal.at);
    // (a fist round a thing seats that thing's grip on its goal: the thing measured there, not the fist's point)
    const handAt = (goal: HandGoal, i: number) => (goal.held ? goal.held.getWorldPosition(new THREE.Vector3()) : at[i]);
    const off = (goal: HandGoal | null, i: number) => (goal ? `${(handAt(goal, i).distanceTo(goalOf(goal)) * 100).toFixed(1)} cm` : 'free');
    return `left hand ${off(b.left, 0)} from its goal, right ${off(b.right, 1)}`;
  };

  // --- his tasks, the hero by the door ---
  await stand(lab, BY_DOOR, Math.PI / 2);
  watch.forget();
  for (const [task, work] of TASKS) {
    tv.setTask(task);
    const took = await frames(TASK_IN, () => tv.doing().step === work);
    lines.push(`task ${task}: at its work in ${took < 0 ? 'never' : `${(took / 60).toFixed(1)} s`}`);
    if (took < 0) { problems.push(`he never got to ${work} (doing ${tv.doing().job}: ${tv.doing().step}, ${tv.doing().where})`); continue; }
    await frames(90);
    lines.push(`  ${work}: ${handsOff()}`);
    await picture(`task-${task}`, `the keeper, ${work}`, task === 'stoke' ? 3 : 2.6);
  }

  // --- the hero at the bar: he comes to the tap ---
  const him = villageObject('keeper')!;
  await stand(lab, him.stand, Math.atan2(him.at[0] - him.stand[0], him.at[1] - him.stand[1]));
  watch.forget();
  const came = await frames(TASK_IN, () => tv.doing().step === 'attend');
  lines.push(`a hero at the bar: he came to the tap in ${came < 0 ? 'never' : `${(came / 60).toFixed(1)} s`}`);
  if (came < 0) problems.push(`a hero at the bar, he never came to the tap (doing ${tv.doing().job}: ${tv.doing().step})`);

  // --- talked to by E: the card up within the window, a free beer its first reply ---
  await useByE(lab, him, problems);
  watch.forget();
  await frames(SETTLE);
  // (his lines come one at a time, the replies once they're all shown: ui/screens/talk/talk.ts)
  if (await frames(TALK_READ, () => talkAnswerable()) < 0) problems.push('the keeper\'s lines never all showed');
  const card = document.getElementById('talk')!;
  if (card.classList.contains('hidden')) problems.push('E at the keeper opened no talk');
  const box = card.querySelector('.tk-box')!.getBoundingClientRect();
  if (box.left < -1 || box.top < -1 || box.right > innerWidth + 1 || box.bottom > innerHeight + 1) problems.push('the talk card leaves the window');
  const first = card.querySelector('.tk-reply')?.textContent ?? '';
  if (!/beer/i.test(first)) problems.push(`the keeper's first reply offers no beer: "${first}"`);
  moments.push(await lab.screen('tavern-talk'));

  // --- the beer asked for: a clean mug taken (empty), filled, slid across; the hero takes it up ---
  const still = ALE.still;
  if (options.canary) ALE.still = false;
  try {
    const clean = tv.mugs.counts().clean;
    await lab.step(1, () => ({ keys: ['1'] }));
    watch.forget();
    let taken = -1, emptyTaken = true;
    const pictured = new Set<string>();
    const served = await frames(SERVE_IN, () => {
      const inHand = tv.mugs.mugs.find((m) => m.place.at === 'keeper');
      if (inHand && taken < 0) { taken = inHand.id; emptyTaken = inHand.full === 0; }
      const s = tv.doing().step;
      if (['take', 'pour', 'slide'].includes(s) && !pictured.has(s)) pictured.add(s);
      return waitingMug(tv) >= 0;
    });
    lines.push(`served: a mug of ${clean} clean taken (${taken}, ${emptyTaken ? 'empty' : 'NOT empty'}), waiting on the bar ${served < 0 ? 'never' : `${(served / 60).toFixed(2)} s`} after he asked`);
    if (served >= 0) await mugWaitsAndIsChosen();
    if (taken < 0) problems.push('the beer asked for, he took no mug off the back counter');
    if (!emptyTaken) problems.push('the mug he took was full before he poured');
    if (served < 0) return { text: lines.join('\n'), problems: [...problems, `the hero never drank (doing ${tv.doing().job}: ${tv.doing().step})`], moments };

    // --- the drink: still whatever's pressed, the mug at his lips through each swallow ---
    const from = G.player.pos.clone();
    // (timed from where his choice let it go on: the drink's share before it was held at the lift)
    const startShare = Math.max(0, drinkShare()), drinkLong = ALE.castTime * (1 - startShare);
    let moved = 0, worstRim = 0, mostTilt = 0, f = 0;
    const tilts: number[] = [], gulps = [0.3, 0.46, 0.62], shots = [...PICTURED];
    while (drinkShare() >= 0 && f < 600) {
      await lab.step(1, () => (f < HELD_W ? { keys: ['w'] } : { keys: [] }));
      watch.read();
      f++;
      const k = drinkShare();
      if (k < 0) break;
      moved = Math.max(moved, G.player.pos.distanceTo(from));
      const mug = mugInHand();
      if (mug.shown && k > 0.2 && k < 0.75) mostTilt = Math.max(mostTilt, mug.tilt);
      if (gulps.length && k >= gulps[0]) {
        gulps.shift();
        worstRim = Math.max(worstRim, mug.rimOff);
        tilts.push(mug.tilt);
        lines.push(`swallow at ${(k * 100).toFixed(0)}%: the rim ${(mug.rimOff * 100).toFixed(1)} cm from his lower lip, tipped ${mug.tilt.toFixed(0)}° from upright`);
      }
      if (shots.length && k >= shots[0]) {
        const share = shots.shift()!;
        moments.push(lab.picture(`drink-${Math.round(share * 100)}`, ['left', 'front'], [`${Math.round(share * 100)}% of the drink`], { focus: 'head', distance: 2.1 }));
      }
    }
    lines.push(`drink: ${(f / 60).toFixed(2)} s, moved ${(moved * 100).toFixed(1)} cm with W held, the mug tipped at most ${mostTilt.toFixed(0)}°`);
    if (Math.abs(f / 60 - drinkLong) > 0.1) problems.push(`the drink took ${(f / 60).toFixed(2)} s from its choice, not ${drinkLong.toFixed(2)}`);
    if (moved > STILL_WITHIN) problems.push(`he moved ${(moved * 100).toFixed(1)} cm while drinking, W held`);
    if (worstRim > RIM_NEAR) problems.push(`the rim stood ${(worstRim * 100).toFixed(1)} cm from his lower lip at a swallow`);
    if (mostTilt > MOST_TILT) problems.push(`the mug tipped ${mostTilt.toFixed(0)}° from upright, past ${MOST_TILT}`);
    if (tilts.some((t, i) => i > 0 && t <= tilts[i - 1])) problems.push(`the swallows' tilts don't grow: ${tilts.map((t) => t.toFixed(0)).join(', ')}`);

    // --- set down on the bar; cleared, washed, dried, stood back with the clean ones ---
    await frames(3);
    const down = taken >= 0 ? tv.mugs.get(taken) : undefined;
    lines.push(`set down: mug ${taken} ${down?.place.at ?? 'nowhere'}${down?.dirty ? ', dirty' : ''}`);
    if (!down || down.place.at !== 'bar' || !down.dirty) problems.push(`the empty mug wasn't set down dirty on the bar (${down?.place.at})`);
    moments.push(lab.picture('set-down', ['left'], ['the empty mug set down on the bar'], { at: tv.mugAt(taken), distance: 1.6 }));
    const seen = new Set<string>();
    const back = await frames(CLEAR_IN, () => {
      const s = tv.doing().step;
      if (['collect', 'wash', 'dry', 'shelve'].includes(s)) seen.add(s);
      return tv.mugs.get(taken).place.at === 'shelf' && !tv.mugs.get(taken).dirty;
    });
    lines.push(`cleared: ${[...seen].join(', ')}; back on the shelf ${back < 0 ? 'never' : `in ${(back / 60).toFixed(1)} s`}`);
    if (back < 0) problems.push(`the mug never came back to the shelf (doing ${tv.doing().job}: ${tv.doing().step})`);
    for (const s of ['collect', 'wash', 'dry', 'shelve']) if (!seen.has(s)) problems.push(`clearing it, he never did ${s}`);

    // --- running out: every mug left dirty, another asked for: one washed first, then served ---
    // (spread along the bar's length, its ends kept clear, however many mugs there are)
    const apart = (BAR.to - BAR.from - 0.6) / (MUG_COUNT - 1);
    for (const m of tv.mugs.mugs) tv.mugs.move(m.id, { at: 'bar', x: 4.0, z: BAR.from + 0.3 + m.id * apart }, { full: 0.03, dirty: true });
    watch.forget();
    const order: string[] = [];
    room.serveAle?.(G.player);
    const waited = await frames(CLEAR_IN, () => {
      const s = tv.doing().step;
      if (order[order.length - 1] !== s && ['collect', 'wash', 'dry', 'pour', 'slide'].includes(s)) order.push(s);
      return waitingMug(tv) >= 0;
    });
    const again = waited >= 0 && await takeAndDrink() ? waited : -1;
    lines.push(`out of clean mugs: ${order.join(' > ')}; served ${again < 0 ? 'never' : `in ${(again / 60).toFixed(1)} s`}`);
    if (again < 0) problems.push('with every mug dirty, he never served');
    if (order.indexOf('wash') < 0 || order.indexOf('pour') < order.indexOf('wash')) problems.push(`with every mug dirty he didn't wash one before pouring: ${order.join(' > ')}`);
    await frames(600, () => drinkShare() < 0);
    // (his mugs all back on the shelf first: he clears what's left about)
    // (every dirty mug drawn in, washed, dried and shelved one after another, about 15 s each)
    const cleared = await frames(CLEAR_IN * MUG_COUNT, () => tv.mugs.counts().clean === MUG_COUNT && !tv.mugs.mugs.some((m) => m.place.at === 'keeper'));
    const where = tv.mugs.mugs.map((m) => `${m.id}:${m.place.at}${m.dirty ? '*' : ''}`).join(' ');
    if (cleared < 0) problems.push(`his mugs never all came back to the shelf (${where}; he was at ${tv.doing().job}: ${tv.doing().step})`);

    // --- sat on a bar stool: asked from it, the mug taken up by E and drunk, sat all the while (note 11) ---
    await drinkSeated();

    // --- every mug out in heroes' hands: none served until one comes back ---
    for (const m of tv.mugs.mugs) tv.mugs.move(m.id, { at: 'hero', who: 'elsewhere' }, { full: 1, dirty: false });
    watch.forget();
    room.serveAle?.(G.player);
    const none = await frames(240, () => tv.mugs.mugs.some((m) => m.place.at === 'keeper'));
    lines.push(`every mug out: ${none < 0 ? 'none taken in 4 s' : `one taken at ${none} frames`}`);
    if (none >= 0) problems.push('with every mug out, he took one anyway');
    tv.mugs.move(0, { at: 'bar', x: 4.0, z: -1.2 }, { full: 0.03, dirty: true });
    watch.forget();
    const fetched = await frames(TASK_IN, () => tv.mugs.get(0).place.at === 'keeper');
    lines.push(`one come back: ${fetched < 0 ? 'never taken up' : `taken up in ${(fetched / 60).toFixed(1)} s`}`);
    if (fetched < 0) problems.push('a mug come back, he never went for it');
  } finally {
    ALE.still = still;
  }

  // --- through the eyes: the talk, the slide, the drink and the set-down as a player in first person sees them
  // (tavernEyes.ts), every mug not in his hand stood back on the shelf first ---
  for (const m of tv.mugs.mugs) if (m.place.at !== 'keeper') tv.mugs.move(m.id, { at: 'shelf', slot: m.id }, { full: 0, dirty: false });
  await stand(lab, him.stand, Math.atan2(him.at[0] - him.stand[0], him.at[1] - him.stand[1]));
  watch.forget();
  moments.push(...await throughTheEyes(lab, { frames, drinkShare, serve: () => room.serveAle?.(G.player), take: takeAndDrink, tv, keeper: him }, lines, problems));
  watch.forget();

  // --- what held every frame ---
  lines.push(`every frame: the mugs ${watch.worstSum ? `didn't add up (${watch.worstSum})` : `added up to ${MUG_COUNT}`}, the most a mug moved in a frame ${(watch.worstJump * 100).toFixed(1)} cm (${watch.jumpAt}), ${watch.unseen} mug-frames unseen, the most a planted foot slid ${(watch.worstSlide * 100).toFixed(1)} cm (${watch.slideAt}), the most his body moved in a frame ${(watch.worstStep * 100).toFixed(1)} cm (${watch.stepAt})`);
  if (watch.worstSum) problems.push(`the mugs didn't add up: ${watch.worstSum}`);
  lines.push(watch.hands.said(), watch.body.said(), watch.held.said(), watch.limbs.said(), watch.gait.said(), watch.shirt.said());
  problems.push(...watch.hands.problems(), ...watch.body.problems(), ...watch.held.problems(), ...watch.limbs.problems(), ...watch.gait.problems(), ...watch.shirt.problems());
  const ways = plannedWays(tv, room.seats);
  lines.push(...ways.lines);
  problems.push(...ways.problems);
  lines.push(poseTimes.said(), drawsSaid(lab, tv, keeper));
  const boost = boostRead(lifeBase);
  lines.push(...boost.lines);
  problems.push(...boost.problems);
  if (watch.worstJump > MUG_JUMP) problems.push(`a mug jumped ${(watch.worstJump * 100).toFixed(0)} cm in a frame (${watch.jumpAt})`);
  if (watch.unseen) problems.push(`a mug out of a hero's hand went unseen for ${watch.unseen} frames`);
  if (tv.doing().jumped) lines.push(`his place jumped: ${tv.doing().jumped}`);
  if (watch.worstStep > BODY_STEP) problems.push(`his body jumped ${(watch.worstStep * 100).toFixed(1)} cm in a frame (${watch.stepAt})`);
  if (watch.worstSlide > FOOT_SLIDE) problems.push(`a planted foot slid ${(watch.worstSlide * 100).toFixed(1)} cm in a frame`);
  if (crossedShot) moments.push(crossedShot);
  const compiled = programs() - before;
  lines.push(`programs compiled from the room to the end: ${compiled}`);
  if (compiled) problems.push(`${compiled} programs compiled meanwhile`);
  if (options.canary) {
    plant(false);
    shiftBelly(keeper, -0.3);
    const missed = CANARIES.filter(([, said]) => !problems.some((p) => p.includes(said))).map(([plant]) => `canary: ${plant} went unseen`);
    return { text: lines.join('\n'), problems: missed, moments };
  }
  return { text: lines.join('\n'), problems, moments };
}
