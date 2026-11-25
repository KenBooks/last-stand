// What `lab tavern` reads of Kenneth's round 5 on the keeper (#704): his broom swept as a man sweeps (his hands well
// apart along its handle, the handle tipped across him) and carried one way at all other times (upright at his side in
// one hand, from its corner to his first stroke and back); his rag laid on a top by his hand, spread under his palm
// only while his hand is down on it, and seen under it as he waits at the bar; his free hand hanging as he wipes the
// cask; every frame. Then fixtures: a mug left at the sides of every table, collected from outside its top; a hero
// putting his mug down by every table and the bar, on the nearest top at his side of it; E with a mug in hand on a
// stool's top (he sits, nothing drunk) and off it (he drinks), never two E prompts at once; and his day with a hero
// stood in each of his narrow ways and his tasks broken into, never standing still on a walk for long, never put back
// at his stand (the canary's wall across his way in must be caught, and put him back).
import * as THREE from 'three';
import { G } from '../../../src/state';
import { BAR, BAR_STOOL_X, BAR_STOOLS, KEEPER_SPOT, MUG_COUNT } from '../../../src/data/tavern';
import { seatSpotAt } from '../../../src/world/seats';
import { edgeNear, pastEdge, TABLE_TOPS, type TableTop } from '../../../src/world/tavernTables';
import { KEEPER_STUCK, type TavernKeeper } from '../../../src/world/tavernKeeper';
import type { Keeper } from '../../../src/entities/models/keeper';
import { drinkChoice } from '../../../src/game/drinkChoice';
import { mulberry } from '../../../src/util';
import type { Frame } from './lab';
import type { Stepper } from './takeAle';
import { satWhole } from './sit';

/** the sweep: his hands at least this far apart (m), the handle tipped at least this far from upright (degrees), and
 *  his top hand and the broom's head at least this far apart across him (m) */
export const SWEEP_APART_LEAST = 0.33, SWEEP_TILT_LEAST = 20, SWEEP_ACROSS_LEAST = 0.15;
/** and never nearer together than this (m) */
export const SWEEP_APART_MOST_CLOSE = 0.2;
/** the carry: the handle within this of upright (degrees), his other hand at least this far off it (m) */
export const CARRY_TILT_MOST = 25, CARRY_OTHER_OFF = 0.1;
/** the flat rag spread under his palm: his grip within this of its middle across (m) and over it (m) */
export const PAD_UNDER_HAND = 0.08, PAD_HAND_OVER = 0.06;
/** waiting at the bar, the least share of the frames his rag lies spread under his palm (after his hand's first
 *  `ATTEND_LAY` s there) */
export const ATTEND_SEEN_LEAST = 0.6;
const ATTEND_LAY = 0.6;
/** wiping the cask, the most his free hand may be over his hips (m): hanging, it's about at them; on the cask's hoop,
 *  as it was, 40 cm over */
export const CASK_HAND_MOST = 0.15;
/** a mug collected from a table: his middle at least this far past its top's edge all the while (m) */
export const STAND_OFF_LEAST = 0.15;
/** a mug put down: on its top within this of its edge (m), and within this along it of the edge nearest the hero (m) */
export const DOWN_IN_MOST = 0.18, DOWN_ALONG_MOST = 0.6;
/** his walks: the longest he may stand still on one (s) */
export const STILL_MOST = 3;

const RATE = 60;
/** how long a hand takes from one hold to the next (s: keeper.ts `ARM_BLEND` and the grip's slide along the handle) */
const BLEND = 0.7;
const DEG = 180 / Math.PI;

/** The worst of something, and where. */
class Worst {
  value = -Infinity;
  at = '';
  see(value: number, at: () => string): void {
    if (value <= this.value) return;
    this.value = value;
    this.at = at();
  }
}

/** What every frame of his day must keep (round 5). */
export class Round5Watch {
  private readonly hands: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(), new THREE.Vector3()];
  private readonly v = new THREE.Vector3();
  readonly apart = new Worst();
  private readonly aparts: number[] = [];
  readonly flat = new Worst();
  readonly narrow = new Worst();
  readonly carryTilt = new Worst();
  readonly carryOther = new Worst();
  readonly padOff = new Worst();
  readonly caskHand = new Worst();
  sweepFrames = 0;
  carriedFrames = 0;
  sweptEarly = 0;
  padFrames = 0;
  bothShown = 0;
  caskFrames = 0;
  attendFrames = 0;
  attendSpread = 0;
  private stroked = false;
  private attendFor = 0;
  /** how long the sweep's hold has been posed, and how long since it last was (s): his hands' blend between it and his
   *  carry left out (a hand eases from one hold to the other over `BLEND` s) */
  private sweepFor = 0;
  private sinceSweep = Infinity;
  private carriedFor = 0;

  read(tv: TavernKeeper, keeper: Keeper, room: THREE.Object3D, doing: string): void {
    const step = tv.doing().step;
    keeper.hands(this.hands);
    this.readBroom(tv, keeper, room, step, doing);
    this.readRag(keeper, room, doing);
    if (step === 'check cask') this.readCask(keeper, doing);
    this.readAttend(step, room);
  }

  private readBroom(tv: TavernKeeper, keeper: Keeper, room: THREE.Object3D, step: string, doing: string): void {
    const body = room.getObjectByName('broom'), holder = body?.parent;
    const carried = !!holder && holder.parent !== room;
    const posed = tv.doing().sweepPosed;
    this.sweepFor = posed ? this.sweepFor + 1 / RATE : 0;
    this.sinceSweep = posed ? 0 : this.sinceSweep + 1 / RATE;
    this.carriedFor = carried ? this.carriedFor + 1 / RATE : 0;
    if (!carried) {
      this.stroked = false;
      return;
    }
    // (taken into his sweeping hands at the first stroke's place: his sweep begun)
    if (step === 'sweep' || step === 'ready broom') this.stroked = true;
    // (the handle's way, down from his top hand to the bristles: the broom's +y)
    const down = new THREE.Vector3(0, 1, 0).applyQuaternion(body!.getWorldQuaternion(new THREE.Quaternion())).normalize();
    const tilt = Math.acos(THREE.MathUtils.clamp(-down.y, -1, 1)) * DEG;
    const top = holder!.getWorldPosition(new THREE.Vector3());
    if (posed) {
      if (!this.stroked) this.sweptEarly++;
      if (step !== 'sweep' || this.sweepFor < BLEND) return;
      this.sweepFrames++;
      // (apart along the handle, as a sweeper's hands are told apart: his grips' own points sit at different places
      // on a fist turned palm down and up)
      const along = (hand: THREE.Vector3) => this.v.subVectors(hand, top).dot(down);
      const apart = Math.abs(along(this.hands[1]) - along(this.hands[0]));
      this.apart.see(-apart, () => `his hands ${(apart * 100).toFixed(0)} cm apart along the handle, ${doing}`);
      this.aparts.push(apart);
      this.flat.see(-tilt, () => `its handle ${tilt.toFixed(0)}° from upright, ${doing}`);
      const head = top.clone().addScaledVector(down, 1.3);
      const across = Math.abs(keeper.root.worldToLocal(top.clone()).x - keeper.root.worldToLocal(head).x);
      this.narrow.see(-across, () => `his top hand and its head ${(across * 100).toFixed(0)} cm apart across him, ${doing}`);
      return;
    }
    if (this.sinceSweep < BLEND || this.carriedFor < BLEND) return;
    this.carriedFrames++;
    this.carryTilt.see(tilt, () => `its handle ${tilt.toFixed(0)}° from upright, ${doing}`);
    // (his other hand, the right: off the handle)
    const line = new THREE.Line3(top, top.clone().addScaledVector(down, 1.4));
    const off = line.closestPointToPoint(this.hands[1], true, this.v).distanceTo(this.hands[1]);
    this.carryOther.see(-off, () => `his other hand ${(off * 100).toFixed(0)} cm off its handle, ${doing}`);
  }

  private readRag(keeper: Keeper, room: THREE.Object3D, doing: string): void {
    const pad = room.getObjectByName('keeper rag flat');
    const spread = !!pad && pad.scale.x > 0.5;
    if (!spread) return;
    this.padFrames++;
    if (keeper.rag.visible) this.bothShown++;
    const middle = pad!.getWorldPosition(new THREE.Vector3()), grip = this.hands[1];
    const across = Math.hypot(grip.x - middle.x, grip.z - middle.z), over = grip.y - middle.y;
    const off = Math.max(across / PAD_UNDER_HAND, over / PAD_HAND_OVER);
    this.padOff.see(off, () => `his grip ${(across * 100).toFixed(1)} cm across and ${(over * 100).toFixed(1)} cm over the spread rag's middle, ${doing}`);
  }

  private readCask(keeper: Keeper, doing: string): void {
    this.caskFrames++;
    const hips = keeper.joints.hips.getWorldPosition(this.v).y, up = this.hands[0].y - hips;
    this.caskHand.see(up, () => `his free hand ${(up * 100).toFixed(0)} cm over his hips, ${doing}`);
  }

  private readAttend(step: string, room: THREE.Object3D): void {
    if (step !== 'attend') {
      this.attendFor = 0;
      return;
    }
    this.attendFor += 1 / RATE;
    if (this.attendFor < ATTEND_LAY) return;
    this.attendFrames++;
    const pad = room.getObjectByName('keeper rag flat');
    if (pad && pad.scale.x > 0.5) this.attendSpread++;
  }

  problems(): string[] {
    const out: string[] = [];
    if (!this.sweepFrames) out.push('round 5: his sweep was never read');
    // (most of the stroke well apart, and never together: at the stroke's ends his lower hand comes up the handle a little)
    if (this.apartMedian() < SWEEP_APART_LEAST) out.push(`round 5: he swept with his hands together: ${(this.apartMedian() * 100).toFixed(0)} cm apart along the handle at the median`);
    if (-this.apart.value < SWEEP_APART_MOST_CLOSE) out.push(`round 5: he swept with his hands together: ${this.apart.at}`);
    if (-this.flat.value < SWEEP_TILT_LEAST) out.push(`round 5: he swept with the broom upright: ${this.flat.at}`);
    if (-this.narrow.value < SWEEP_ACROSS_LEAST) out.push(`round 5: his broom wasn't across him sweeping: ${this.narrow.at}`);
    if (!this.carriedFrames) out.push('round 5: his broom was never read carried');
    if (this.carryTilt.value > CARRY_TILT_MOST) out.push(`round 5: his broom was carried tipped: ${this.carryTilt.at}`);
    if (-this.carryOther.value < CARRY_OTHER_OFF) out.push(`round 5: his broom was carried in both hands: ${this.carryOther.at}`);
    if (this.sweptEarly) out.push(`round 5: his broom was carried in the sweep's hold before his first stroke (${this.sweptEarly} frames)`);
    if (!this.padFrames) out.push('round 5: his rag was never read spread');
    if (this.padOff.value > 1) out.push(`round 5: his rag lay spread with his hand not on it: ${this.padOff.at}`);
    if (this.bothShown) out.push(`round 5: his rag in his fist and spread on a top at once (${this.bothShown} frames)`);
    if (!this.caskFrames) out.push('round 5: the cask was never read wiped');
    if (this.caskHand.value > CASK_HAND_MOST) out.push(`round 5: his free hand was held up as he wiped the cask: ${this.caskHand.at}`);
    const seen = this.attendFrames ? this.attendSpread / this.attendFrames : 0;
    if (!this.attendFrames) out.push('round 5: he was never read waiting at the bar');
    else if (seen < ATTEND_SEEN_LEAST) out.push(`round 5: his rag wasn't seen spread as he waited at the bar (${(seen * 100).toFixed(0)}% of the frames)`);
    return out;
  }

  /** his hands' distance apart along the handle sweeping, at the median (m) */
  private apartMedian(): number {
    const sorted = [...this.aparts].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] ?? 0;
  }

  said(): string {
    const cm = (w: Worst) => (w.value === -Infinity ? '-' : `${(-w.value * 100).toFixed(0)} cm`);
    const seen = this.attendFrames ? `${(this.attendSpread / this.attendFrames * 100).toFixed(0)}%` : '-';
    return `round 5: sweeping (${this.sweepFrames} frames) his hands ${(this.apartMedian() * 100).toFixed(0)} cm apart along the handle at the median, at least ${cm(this.apart)}, its handle at least `
      + `${this.flat.value === -Infinity ? '-' : (-this.flat.value).toFixed(0)}° from upright, across him at least ${cm(this.narrow)}; `
      + `carried (${this.carriedFrames} frames) at most ${this.carryTilt.value === -Infinity ? '-' : this.carryTilt.value.toFixed(0)}° `
      + `from upright, his other hand at least ${cm(this.carryOther)} off it, ${this.sweptEarly} frames in the sweep's hold `
      + `before a stroke; his rag spread (${this.padFrames} frames) at most ${this.padOff.value === -Infinity ? '-' : this.padOff.value.toFixed(2)} `
      + `of its reach from his hand (${this.padOff.at}), ${this.bothShown} frames shown twice; the cask (${this.caskFrames} frames) `
      + `his free hand at most ${this.caskHand.value === -Infinity ? '-' : (this.caskHand.value * 100).toFixed(0)} cm over his hips; `
      + `waiting at the bar his rag spread ${seen} of the frames`;
  }
}

/** What a fixture gives `lab tavern`. */
export interface Found { lines: string[]; problems: string[] }

/** A spot a hand's width in from a top's edge, on its side `side` (a point beyond the edge it's nearest). */
function sideSpot(t: TableTop, toward: { x: number; z: number }): { x: number; z: number; e: ReturnType<typeof edgeNear> } {
  const e = edgeNear(t, toward.x, toward.z);
  return { x: e.x - e.nx * 0.1, z: e.z - e.nz * 0.1, e };
}

/** the points round each table a mug is left at, or a hero stands by: a long top's two long sides at its middle and
 *  an end, a round one's two ways round */
function aroundTables(): { top: TableTop; toward: { x: number; z: number } }[] {
  const out: { top: TableTop; toward: { x: number; z: number } }[] = [];
  for (const t of TABLE_TOPS) {
    if (t.hx !== undefined) {
      out.push({ top: t, toward: { x: t.x + 2, z: t.z } }, { top: t, toward: { x: t.x - 2, z: t.z + 0.3 } });
      out.push({ top: t, toward: { x: t.x, z: t.z + 3 } });
    } else out.push({ top: t, toward: { x: t.x + 2, z: t.z + 1 } }, { top: t, toward: { x: t.x - 1, z: t.z - 2 } });
  }
  return out;
}

/** A mug left dirty at the sides of every table in turn: each collected, his middle past the top's edge all the
 *  while (his body against the tops is the watch's, `BodyClear`). `forget` has the watch forget the lab's move. */
export async function tablePickups(tv: TavernKeeper, frames: (most: number, done?: () => boolean) => Promise<number>,
  forget: () => void, wait: number): Promise<Found> {
  const lines: string[] = [], problems: string[] = [];
  for (const { top, toward } of aroundTables()) {
    const spot = sideSpot(top, toward);
    const id = tv.mugs.mugs.find((m) => m.place.at === 'shelf')?.id;
    if (id === undefined) { problems.push('round 5: no clean mug on the shelf to leave on a table'); break; }
    tv.mugs.move(id, { at: 'table', x: spot.x, z: spot.z, y: top.top }, { full: 0.03, dirty: true });
    forget();
    // (one at a time: each washed, dried and shelved before the next is left)
    let nearest = Infinity;
    const keeper = tv.keeper()!, room = keeper.root.parent!, at = new THREE.Vector3();
    const took = await frames(wait, () => {
      if (tv.doing().step === 'collect' && tv.doing().job === 'clear') {
        room.worldToLocal(keeper.root.getWorldPosition(at));
        nearest = Math.min(nearest, pastEdge(top, at.x, at.z));
      }
      return tv.mugs.get(id).place.at === 'keeper';
    });
    const where = `the ${top.name} at ${spot.x.toFixed(2)}, ${spot.z.toFixed(2)}`;
    lines.push(`round 5: a mug at ${where}: ${took < 0 ? 'NEVER collected' : `collected in ${(took / RATE).toFixed(1)} s, his middle at least ${(nearest * 100).toFixed(0)} cm past its edge`}`);
    await frames(wait, () => tv.mugs.get(id).place.at === 'shelf');
    if (took < 0) problems.push(`round 5: a mug at ${where} was never collected (${tv.doing().job}: ${tv.doing().step})`);
    else if (nearest < STAND_OFF_LEAST) problems.push(`round 5: he stood in the ${top.name}'s top collecting a mug: his middle ${(nearest * 100).toFixed(0)} cm past its edge at ${where}`);
  }
  return { lines, problems };
}

/** The cask wiped once, the hero away by the door: read by the watch (his free hand at his side). */
export async function caskWiped(tv: TavernKeeper, frames: (most: number, done?: () => boolean) => Promise<number>, wait: number): Promise<Found> {
  tv.setTask('cask');
  const came = await frames(wait, () => tv.doing().step === 'check cask');
  if (came >= 0) await frames(wait, () => tv.doing().step !== 'check cask');
  return { lines: [], problems: came < 0 ? [`round 5: he never came to wipe the cask (${tv.doing().job}: ${tv.doing().step})`] : [] };
}

/** A hero putting his mug down (F) by every table's sides and the bar's front: on the nearest top, its edge on his side,
 *  a hand's width in. `myId`: this game's hero's id in the ledger. */
export async function putDowns(tv: TavernKeeper, run: Stepper, frames: (most: number, done?: () => boolean) => Promise<number>,
  forget: () => void, roomOf: () => THREE.Object3D, myId: string): Promise<Found> {
  const lines: string[] = [], problems: string[] = [];
  const bar: TableTop = { name: 'bar', x: BAR.x, z: (BAR.from + BAR.to) / 2, top: BAR.top, hx: BAR.half, hz: (BAR.to - BAR.from) / 2 };
  const stands = [...aroundTables(), { top: bar, toward: { x: BAR.x - 3, z: -1.5 } }];
  const putBack: number[] = [];
  for (const { top, toward } of stands) {
    const e = edgeNear(top, toward.x, toward.z);
    // (where a hero stands to put it down: out from that side by his body and a bench's room)
    const out = top.hx !== undefined && top.name !== 'bar' && Math.abs(e.nx) > 0.5 ? 0.6 : 0.4;
    const standAt = { x: e.x + e.nx * out, z: e.z + e.nz * out };
    G.player.walkTo = null;
    G.player.place(roomOf().localToWorld(new THREE.Vector3(standAt.x, 0, standAt.z)), Math.atan2(-e.nx, -e.nz));
    await run(20, () => ({}));
    const id = tv.mugs.mugs.find((m) => m.place.at === 'shelf')?.id;
    if (id === undefined) { problems.push('round 5: no mug to put down'); break; }
    tv.mugs.move(id, { at: 'hero', who: myId }, { full: 1, dirty: false, held: true });
    forget();
    if (await frames(60, () => drinkChoice.shown) < 0) { problems.push(`round 5: by the ${top.name}, the mug in his hand never offered its choice`); continue; }
    const from = roomOf().worldToLocal(G.player.pos.clone());
    await run(1, () => ({ keys: ['f'] }));
    await frames(30, () => tv.mugs.get(id).place.at !== 'hero');
    forget();
    const place = tv.mugs.get(id).place;
    // (each put back on the shelf after: left on the tops, the next fixtures had no mug)
    putBack.push(id);
    if (place.at === 'hero') {
      G.player.standDown();
      await run(10, () => ({}));
    }
    const where = `by the ${top.name} at ${from.x.toFixed(2)}, ${from.z.toFixed(2)}`;
    if (place.at !== 'table' && place.at !== 'bar') {
      problems.push(`round 5: put down ${where}, the mug went to ${place.at}`);
      lines.push(`round 5: put down ${where}: NOT on a top (${place.at})`);
      continue;
    }
    const onTop = place.at === 'bar' ? bar : TABLE_TOPS.reduce((a, b) => (pastEdge(b, place.x, place.z) < pastEdge(a, place.x, place.z) ? b : a));
    const inside = -pastEdge(onTop, place.x, place.z);
    const heroEdge = edgeNear(onTop, from.x, from.z), mugEdge = edgeNear(onTop, place.x, place.z);
    const along = Math.hypot(heroEdge.x - mugEdge.x, heroEdge.z - mugEdge.z);
    lines.push(`round 5: put down ${where}: on the ${onTop.name}, ${(inside * 100).toFixed(0)} cm in from its edge, ${(along * 100).toFixed(0)} cm along it from his side's nearest point`);
    if (onTop.name !== top.name) problems.push(`round 5: put down ${where}, it went on the ${onTop.name}`);
    if (inside < 0 || inside > DOWN_IN_MOST) problems.push(`round 5: put down ${where}, it stood ${(inside * 100).toFixed(0)} cm in from the ${onTop.name}'s edge`);
    if (along > DOWN_ALONG_MOST) problems.push(`round 5: put down ${where}, it went ${(along * 100).toFixed(0)} cm round the ${onTop.name} from his side`);
  }
  const counts = tv.mugs.counts();
  if (counts.total !== MUG_COUNT) problems.push(`round 5: after the put-downs, ${counts.total} of ${MUG_COUNT} mugs counted`);
  for (const id of putBack) tv.mugs.move(id, { at: 'shelf', slot: id }, { full: 0, dirty: false, held: false });
  forget();
  return { lines, problems };
}

/** E with a mug in hand: the pointer on a bar stool's top, he sits and nothing is drunk; sat, E drinks; never two E
 *  prompts in a frame (a seat's E Sit with the drink's E). Driven from above, where the lab's mouse is the pointer:
 *  over the shoulder and through the eyes the crosshair is, which the lab doesn't turn. */
export async function ePriority(tv: TavernKeeper, run: Stepper, frames: (most: number, done?: () => boolean, input?: () => Frame) => Promise<number>,
  forget: () => void, roomOf: () => THREE.Object3D, myId: string, drinkShare: () => number): Promise<Found> {
  const lines: string[] = [], problems: string[] = [];
  // (the stool before the keeper's stand, as a hero comes to be served)
  const stoolZ = BAR_STOOLS.reduce((a, b) => (Math.abs(b - KEEPER_SPOT.z) < Math.abs(a - KEEPER_SPOT.z) ? b : a));
  const stoolTop = () => roomOf().localToWorld(new THREE.Vector3(BAR_STOOL_X, 0.72, stoolZ));
  G.player.walkTo = null;
  G.player.place(roomOf().localToWorld(new THREE.Vector3(BAR_STOOL_X - 0.9, 0, stoolZ + 0.6)), Math.PI / 2);
  await run(20, () => ({ aim: stoolTop() }));
  const id = tv.mugs.mugs.find((m) => m.place.at === 'shelf')?.id;
  if (id === undefined) return { lines, problems: ['round 5: no mug for E'] };
  // (sitting let be, as a player's game has it: the lab's set-ups hold it off, `Player.sits`)
  G.player.sits = true;
  tv.mugs.move(id, { at: 'hero', who: myId }, { full: 1, dirty: false, held: true });
  forget();
  let twice = 0;
  // (the seat's E Sit and the drink's E both on offer: the game's own states for the two prompts, its foot's button
  // drawn from `drinkChoice` a frame on)
  let most = -1;
  const twoE = () => {
    most = Math.max(most, drinkShare());
    if (G.player.sitting.pointed && drinkChoice.shown && drinkChoice.eDrinks) twice++;
  };
  await frames(60, () => { twoE(); return drinkChoice.shown; }, () => ({ aim: stoolTop() }));
  const lit = await frames(60, () => { twoE(); return G.player.sitting.pointed; }, () => ({ aim: stoolTop() }));
  if (lit < 0) problems.push('round 5: with a mug in hand, the stool pointed at was never outlined');
  // (held at the lift while he chooses: what's drunk past it is drunk)
  const before = Math.max(drinkShare(), HELD_AT);
  await run(1, () => ({ keys: ['e'], aim: stoolTop() }));
  most = -1;
  const sat = await frames(600, () => { twoE(); return satWhole(G.player.sitting.pose); }, () => ({ aim: stoolTop() }));
  // (the most drunk while he went to sit: drunk to its end meanwhile, its share then reads none)
  const drunkSitting = most - before;
  lines.push(`round 5: E on a stool with a mug in hand: ${sat < 0 ? 'NOT sat' : `sat in ${(sat / RATE).toFixed(1)} s`}, the drink ${drunkSitting > 0.05 ? `taken on ${(drunkSitting * 100).toFixed(0)}%` : 'not taken'}`);
  if (sat < 0) problems.push(`round 5: E with the pointer on a stool and a mug in hand never sat him (${whyNotSat()})`);
  if (drunkSitting > 0.05) problems.push(`round 5: E with the pointer on a stool drank his ale too (${(drunkSitting * 100).toFixed(0)}%)`);
  // (sat, the pointer off the seats: E drinks)
  const away = roomOf().localToWorld(new THREE.Vector3(BAR_STOOL_X - 2, 0, stoolZ - 1.5));
  await run(10, () => ({ aim: away }));
  await run(1, () => ({ keys: ['e'], aim: away }));
  const drank = await frames(240, () => { twoE(); return drinkShare() > 0.3 || drinkShare() < 0; }, () => ({ aim: away }));
  lines.push(`round 5: sat, E with the pointer off the seats: ${drank < 0 ? 'NOT drunk' : 'drunk'}; ${twice} frames with two E prompts`);
  if (drank < 0) problems.push('round 5: sat with his ale, E never drank it');
  if (twice) problems.push(`round 5: two E prompts on the screen at once (${twice} frames)`);
  await frames(ALE_LONGEST, () => drinkShare() < 0);
  G.player.sits = false;
  G.player.sitting.clear();
  await run(30, () => ({}));
  forget();
  return { lines, problems };
}
const ALE_LONGEST = 8 * RATE;
/** the drink's share held at the lift while he chooses (world/tavernKeeper.ts `HOLD_AT`) */
const HELD_AT = 0.16;

/** What holds the hero from sitting now, as `Player.freeToSit` and his sit's state have it (its private parts read). */
function whyNotSat(): string {
  const p = G.player as unknown as Record<string, unknown> & { casting?: { skill: { def: { ale?: boolean } } } };
  const sitting = p.sitting as Record<string, unknown>;
  const said = ['sits', 'glances', 'idle', 'aiming', 'aimHold', 'staggered', 'rooted', 'hitT', 'dash', 'channel']
    .map((key) => `${key} ${String(p[key])}`);
  const seat = sitting.pointedSeat as Parameters<typeof seatSpotAt>[0] | null;
  const at = sitting.pointedAt as THREE.Vector3;
  const spot = seat ? seatSpotAt(seat, at.x, at.z, G.player.pos, G.player.radius) : null;
  return [...said, `casting ${p.casting ? (p.casting.skill.def.ale ? 'ale' : 'other') : 'none'}`,
    `phase ${String(sitting.phase)}`, `asked ${String(sitting.asked)}`, `lit ${String(sitting.lit)}`,
    `a spot to sit from ${spot ? `at ${spot.fx.toFixed(2)}, ${spot.fz.toFixed(2)}` : 'NONE'}`].join(', ');
}

/** His day with a hero stood in each of his narrow ways in turn, and his tasks broken into at seeded random frames
 *  (ale asked, a task set): the longest he stood still on a walk, and how often he was put back at his stand. With the
 *  canary's wall across his way in behind the bar, both must show it. */
export async function stuckRuns(tv: TavernKeeper, run: Stepper, roomOf: () => THREE.Object3D, forget: () => void,
  wall: boolean): Promise<Found> {
  const lines: string[] = [], problems: string[] = [];
  const random = mulberry(704);
  const resetsWere = KEEPER_STUCK.resets;
  const parks: { name: string; at: [number, number] }[] = wall ? [{ name: 'by the door', at: [-4.6, 3.3] }] : [
    { name: "at the bar's end, in the room", at: [BAR.x - 0.2, BAR.to + 0.55] },
    { name: "at the bar's end, behind it", at: [BAR.x + 0.75, BAR.to + 0.6] },
    { name: 'between the tables', at: [-1.6, 0.7] },
    { name: 'by the door', at: [-4.6, 3.3] },
    ...BAR_STOOLS.map((z, i) => ({ name: `on bar stool ${i + 1}'s spot`, at: [BAR_STOOL_X, z] as [number, number] })),
  ];
  let longest = 0, longestAt = '';
  /** the walks he was sent on, in turn (said with the canary's wall: what came after his stall) */
  const walks: string[] = [];
  // (the cask's with the hero by the door, away from the bar: stood by it, he attends him and wipes nothing)
  const tasks = ['smallTable', 'longTable', 'sweep', 'cask', 'stoke', 'wipeBar'];
  KEEPER_STUCK.wall = wall;
  try {
    for (const park of parks) {
      G.player.walkTo = null;
      G.player.place(roomOf().localToWorld(new THREE.Vector3(park.at[0], 0, park.at[1])), 0);
      // (each task in turn, so every one is walked to with a hero in a way: the cask's among them)
      tv.setTask(tasks[parks.indexOf(park) % tasks.length]);
      forget();
      // (no progress on a walk: his way's end come no nearer, whether he stands or walks to and fro)
      let still = 0, best = Infinity, goalWas = '';
      for (let f = 0; f < (wall ? WALL_PARK : PARK_FOR); f++) {
        // (his work broken into now and then: ale asked, or another task set; not against the canary's wall, where each
        // new walk would start his watch again before it put him back)
        const roll = random();
        if (!wall && roll < 0.002) tv.serve(G.player);
        else if (!wall && roll < 0.004) tv.setTask(tasks[Math.floor(random() * tasks.length)]);
        await run(1, () => ({}));
        const d = tv.doing();
        const goalNow = d.goal ? d.goal.join(',') : '';
        if (goalNow !== goalWas) {
          goalWas = goalNow;
          best = Infinity;
          still = 0;
          walks.push(`${(f / RATE).toFixed(1)} s ${d.job}: ${d.step}${d.goal ? ` to ${d.goal.map((v) => v.toFixed(2)).join(', ')}` : ''}`);
        }
        if (d.goal) {
          // (along his way, as his own watch reads it: round the bar's end it leads away from where it ends a while)
          const left = d.wayLeft;
          if (left < best - 0.1 || left < 0.1) { best = Math.min(best, left); still = 0; } else still++;
        } else still = 0;
        if (still > longest) { longest = still; longestAt = `${park.name}: ${d.job}: ${d.step}, ${d.where}`; }
      }
    }
  } finally {
    KEEPER_STUCK.wall = false;
  }
  const resets = KEEPER_STUCK.resets - resetsWere;
  lines.push(`round 5: a hero in his way (${parks.length} places${wall ? ', the canary\'s wall' : ''}): the longest he got no nearer on a walk ${(longest / RATE).toFixed(1)} s (${longestAt}), put back at his stand ${resets} times${resets ? ` (the last: ${KEEPER_STUCK.lastReset})` : ''}`);
  if (wall) lines.push(`round 5: with the canary's wall his walks were: ${walks.slice(-8).join('; ')}`);
  if (longest / RATE > STILL_MOST) problems.push(`round 5: he was stuck: no nearer on a walk for ${(longest / RATE).toFixed(1)} s (${longestAt})`);
  if (resets) problems.push(`round 5: he was put back at his stand ${resets} times (${KEEPER_STUCK.lastReset})`);
  // (put back, every mug still counted and none in the air: the room left as it should be)
  const counts = tv.mugs.counts();
  if (counts.total !== MUG_COUNT) problems.push(`round 5: after his walks with a hero in his way, ${counts.total} of ${MUG_COUNT} mugs counted`);
  forget();
  return { lines, problems };
}
const PARK_FOR = 12 * RATE;
/** with the canary's wall, long enough for his watch to put him back at his stand (`KEEPER_STUCK.resetAfter`) */
const WALL_PARK = 30 * RATE;

/** A frame's input with nothing pressed (the steppers' default). */
export const none = (): Frame => ({});
