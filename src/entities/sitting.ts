// A hero sits down on a log, a stone, a bench or a chair, or on the floor by a fire (the owner's words: "should sit on
// the closest side", "when user presses any action, they should stand up first, then perform the action if user is
// still pressing it (do not queue)", "while seated, they should continue looking left/right like now"). Asked by E on
// the seat the cursor rests on (`ask`; by himself after `SIT.after` s idle with a seat within `SIT.within` m only
// with `SIT.auto`, off: "lets also disable automatic sitting"), with no foe about, he walks to where he'd stand to sit
// (`world/seats.ts`), turns his back to it and sits (`models/sit.ts` poses him); any key, a foe coming near or a hit
// gets him up again first, and only a key still held once he's up acts. His look round goes on throughout: sat, he
// stands idle.
import * as THREE from 'three';
import type { SitHands, SitState, SitTurn } from '../types';
import { G } from '../state';
import { angleDamp } from '../util';
import { nearOf, SEAT, seatPointed, seatSpot, seatSpotAt, seatStands, seatTaken, type Relaxed, type Seat, type SeatSpot } from '../world/seats';
import { outline } from '../ui/overlay/outline';
import { navTarget, steerClear } from '../world/navigation';
import type { Obstacle } from '../types';

/** A seat left to what stands at it while that holds (`leaveSeatsTo`): asked of the seat the cursor points at. */
let leftAlone: (seat: Seat) => boolean = () => false;

/** Tells which seats aren't the sit's to take while something else there takes E (`game/village.ts`: a fire the hero
 *  stands at to use, in a close view, where the crosshair rests on it as he faces it). */
export function leaveSeatsTo(left: (seat: Seat) => boolean): void {
  leftAlone = left;
}

/** Whether something he sits by takes E while he's sat (`useWhileSatBy`). */
let usedWhileSat: () => boolean = () => false;

/** Tells whether something he sits by takes E while he's sat (`game/village.ts`: an object within whose reach he sits,
 *  the campfire's Play together among them, #721: "No way to interact with campfire while sitting, can't start a
 *  party"). Sat there, E is that object's and doesn't get him up; anything else still does. */
export function useWhileSatBy(used: () => boolean): void {
  usedWhileSat = used;
}

export const SIT = {
  /** whether he goes to sit by himself once he's stood idle `after` (off: from the owner, "lets also disable automatic
   *  sitting"; E on the seat the cursor rests on sits him), how long he stands idle first (s), and how far off a seat
   *  may be (m, to where he'd sit) */
  auto: false, after: 6, within: 6,
  /** his walk there (a share of his speed), how near where he'd stand counts as there (m), how long he may stand
   *  held (s, pressed into a prop in his way: moving slower than `held`, m/s) and how long he may go on getting no
   *  nearer while he walks before he gives it up (s: going round a log took him further off for 1.5 s) */
  walk: 0.45, there: 0.1, stuck: 1.2, held: 0.15, lost: 4,
  /** how far ahead on his way to it he starts to go round what stands in it (m), and how near a waypoint of his way
   *  round the props he heads for the spot itself instead (m: the field ends a cell or two short of it) */
  steerAhead: 3, waypointNear: 0.6,
  /** going round the seat to its far side: how far out from as near as he may come he goes (m), and how far round he
   *  heads at a time once he's there (rad) */
  roundBy: 0.05, roundStep: 0.5,
  /** how far off the seat the way round the other props is found to (m: the field begins only from a clear line to
   *  it of 0.3 m, `world/navigation.ts`) */
  fieldOff: 0.4,
  /** how near the spot he goes the rest of the way straight but round the seat (m) */
  lastStraight: 1,
  /** how fast he turns his back to the seat (1/s), as fast as a person turns at most (rad/s), and how long it may take
   *  (s). (Eased alone, he spun about at up to 21 rad/s, a snap, and the axe in his hand went 42 cm in a frame) */
  turn: 7, turnFastest: 5, turnMost: 1.2,
  /** the way down and the way up (s), and his hands' getting up as a share of their sitting down, before he stands and
   *  after (`Model.sitHands`: asked to act, the whole slow reverse, the owner's choice: up and doing it in about
   *  2.3 s, a greatsword drawn out of the ground and onto his shoulder; at a third of the time, it was swung over the top 40 cm a frame), and how far
   *  down he still is as they begin again before he stands (`handsFrom`) */
  down: 1.1, up: 0.8, handsUp: [1, 0.7], handsFrom: 0.3,
  /** a foe this near gets him up (m) */
  foes: 14,
  /** how long E asking him to sit waits to be taken, as he comes free (s): taken on its frame alone, a press just
   *  after an attack, his aim still held, was lost */
  asked: 1,
  /** how long the cursor rests on a seat before it's outlined and E sits him on it (s: at once, from the owner, "point
   *  at item it highlights right away (no wait)"; it was 2), how far off it may be (m: "12m max distance"), and how high
   *  over where the cursor met it its prompt stands (m, `ui/sitHint.ts`) */
  look: 0, reach: 12, hintOver: 0.45,
  /** after one he can't reach or finds no seat, how long before he looks again (s) */
  retry: 3,
};

type Phase = 'walk' | 'turn' | 'down' | 'sat' | 'up';

/** the outline round the seat E would sit him on */
const POINTED = 0xffffff;

/** `facing` turned towards `yaw` over `dt` as he turns to his seat: eased, no faster than `SIT.turnFastest`. */
function turnedTo(facing: number, yaw: number, dt: number): number {
  const eased = angleDamp(facing, yaw, SIT.turn, dt);
  const step = Math.atan2(Math.sin(eased - facing), Math.cos(eased - facing));
  const most = SIT.turnFastest * dt;
  return facing + Math.max(-most, Math.min(most, step));
}

/** What the sit reads of the hero and moves. */
export interface Sitter {
  readonly pos: THREE.Vector3;
  facing: number;
  readonly radius: number;
  /** his co-op slot: the field he finds his way to a seat by is his own (`world/navigation.ts`) */
  readonly slot: number;
  /** how long his hands take before he goes down and once he's sat, on a seat or the floor (`Model.sitHands`) */
  sitHands(floor: boolean): SitHands;
}

export class Sitting {
  private phase: Phase | null = null;
  private spot: SeatSpot | null = null;
  private idleFor = 0;
  private retryIn = 0;
  /** asked to sit now (E, `ask`): for this long (s), the first frame free to, he goes to the seat pointed at
   *  (`askedSeat`, where the cursor met it) without his idle's wait */
  private asked = 0;
  private askedSeat: Seat | null = null;
  private readonly askedAt = new THREE.Vector3();
  /** the seat the cursor rests on, where it meets it and for how long (s), and whether it's outlined (`point`) */
  private pointedSeat: Seat | null = null;
  private readonly pointedAt = new THREE.Vector3();
  private pointedFor = 0;
  private lit = false;
  /** where the prompt to sit stands over the seat outlined (`hintAt`) */
  private readonly hintPoint = { x: 0, y: 0, z: 0 };
  /** walking there: the nearest he has come, for how long he's come no nearer, how long of it he's stood held, and
   *  where he was last frame */
  private best = Infinity;
  private noNearer = 0;
  private heldFor = 0;
  /** where he last headed for on his way (`walkGoal`) */
  private readonly towards = new THREE.Vector3();
  private readonly last = new THREE.Vector3();
  private turnFor = 0;
  /** how far down he is (0 standing, 1 sat), and where he stood as he began to sit */
  private u = 0;
  private readonly from = new THREE.Vector3();
  /** the seat he got up from, kept off it only as far as he has left it (`relaxed`) */
  private leaving: Relaxed | null = null;
  private readonly state: SitState = { w: 0, hip: 0, foot: 0, before: 0, after: 0 };
  /** getting up, his hands' stage held at this (the lab's `live hold`: a moment of it looked at as long as it's wanted),
   *  or none */
  holdHands: number | null = null;
  /** the one seat he goes to sit on by himself, or none for the nearest (the lab's `sit`: in a room of stools another
   *  stood nearer where it set him than the one it measures) */
  only: Seat | null = null;

  /** The pose's share of the sit this frame, or none. */
  get pose(): SitState | null {
    return this.state.w > 0 || this.state.before > 0 ? this.state : null;
  }

  /** Whether he's on his way to sit or up from it (walking there, turning, his body or his hands between their
   *  ends): he doesn't glance round then, as he watches what he does (`Player.lookAtFoe`). The sit poses his arms
   *  from his chest, and a glance turns it: a greataxe held as it rested swung round with his chest, its haft 15 cm
   *  into it on the low stone; only sat does he look round again. */
  get staged(): boolean {
    return this.phase !== null && this.phase !== 'sat';
  }

  /** Whether the sit places him this frame (going down, sat, getting up): nothing else moves him or keeps him off. */
  get placed(): boolean {
    return this.phase === 'turn' || this.phase === 'down' || this.phase === 'sat' || this.phase === 'up';
  }

  /** Whether he's walking to a seat: `walkGoal` is his way. */
  get walking(): boolean {
    return this.phase === 'walk';
  }

  /** The seat's circles he is let nearer, and how near. */
  get relaxed(): Relaxed | null {
    if (this.phase && this.spot) return { circles: this.spot.seat.circles, r: nearOf(this.spot.seat) };
    return this.leaving;
  }

  /** Whether the seat the cursor rests on is outlined, so E sits him on it (the hint to, `ui/sitHint.ts`). */
  get pointed(): boolean {
    return this.lit;
  }

  /** Where the prompt to sit stands, over where the cursor meets the seat outlined, or none. */
  get hintAt(): { x: number; y: number; z: number } | null {
    return this.lit ? this.hintPoint : null;
  }

  /** Whether E is the sit's this frame (a seat outlined to sit on, or on his way to sit, sat or getting up): a village
   *  object he stands by leaves it alone (the campfire's benches are in its reach, and E there opened Play together
   *  as he sat down or got up). */
  get takesKey(): boolean {
    return this.lit || (this.phase !== null && !this.keyLeft);
  }

  /** Whether E is left to what he sits by (`useWhileSatBy`): sat down whole, never on his way down or up (the
   *  campfire's benches are in its reach, and E there opened Play together as he sat down or got up). */
  get keyLeft(): boolean {
    return this.phase === 'sat' && usedWhileSat();
  }

  /** The seat the cursor points at, followed a frame (`ray`: the cursor's, none on touch; `peace`: no wave under way):
   *  outlined white once it has rested there `SIT.look`, when E sits him on it; not one with no spot left for him on
   *  it, nor one a partner sits on (from the owner: "need to check if another player is already sitting, if yes, then
   *  cannot use an object"). */
  point(me: Sitter, ray: THREE.Ray | null, dt: number, peace: boolean): void {
    // (none while asked and not yet off, `SIT.asked`: pointed at again, the seat stood outlined as he set off for it)
    const free = this.phase === null && this.asked <= 0;
    let hit = peace && ray && free ? seatPointed(ray, G.arena.seats, me.pos, SIT.reach) : null;
    if (hit) {
      const spot = seatSpotAt(hit.seat, hit.x, hit.z, me.pos, me.radius);
      if (!spot || seatTaken(spot, me) || leftAlone(hit.seat)) hit = null;
      else {
        this.hintPoint.x = hit.x;
        this.hintPoint.y = hit.y + SIT.hintOver;
        this.hintPoint.z = hit.z;
      }
    }
    const seat = hit?.seat ?? null;
    this.pointedFor = seat && seat === this.pointedSeat ? this.pointedFor + dt : 0;
    this.pointedSeat = seat;
    if (hit) this.pointedAt.set(hit.x, 0, hit.z);
    const ready = !!seat && this.pointedFor >= SIT.look;
    if (ready) outline(seat!.outline, POINTED, 1);
    else if (this.lit) outline(null);
    this.lit = ready;
  }

  /** Asked to sit now (E; from play: "to speed up the wait of 6 sec", "E sits only when pointed at a sittable object
   *  for more than 2 sec, any distance, at peace time"): on the seat outlined, there along it. Returns whether he
   *  wasn't sitting already (on his way, down or getting up: then it's a key that gets him up, as any other). */
  ask(): boolean {
    if (this.phase !== null) return false;
    if (!this.lit) return true;
    this.asked = SIT.asked;
    this.askedSeat = this.pointedSeat;
    this.askedAt.copy(this.pointedAt);
    // (its outline gone as he's asked: left lit, it stood round the seat the frame he set off for it)
    outline(null);
    this.lit = false;
    this.pointedFor = 0;
    return true;
  }

  /** Given up at once, standing (a respawn, a teleport, the hero placed). */
  clear(): void {
    this.asked = 0;
    this.pointedSeat = null;
    if (this.lit) outline(null);
    this.lit = false;
    this.phase = null;
    this.spot = null;
    this.leaving = null;
    this.idleFor = 0;
    this.u = 0;
    this.state.w = 0;
    this.state.before = 0;
    this.state.after = 0;
  }

  /**
   * A frame of it: `free` whether he could stand idle (nothing cast, aimed, held, no foe near), `acted` whether a key
   * or the stick asks anything of him. Returns whether the frame is the sit's: he takes no input while it is.
   */
  update(me: Sitter, dt: number, free: boolean, acted: boolean): boolean {
    this.leave(me);
    // (a partner sat down on it first as he walked or turned to it: given up, from the owner, "need to check if another
    // player is already sitting", in co-op too)
    const taken = (this.phase === 'walk' || this.phase === 'turn') && !!this.spot && seatTaken(this.spot, me);
    const go = free && !acted && !taken && (!this.spot || seatStands(this.spot.seat));
    switch (this.phase) {
      case null: this.wait(me, dt, free && !acted); return false;
      case 'walk': return this.walk(me, dt, go);
      case 'turn': return this.turnRound(me, dt, go);
      case 'down': case 'sat': return this.sit(me, dt, go);
      case 'up': return this.rise(me, dt);
    }
  }

  /** His walk's goal toward where he'd stand to sit, at `speed` (m/s, his own), easing in as he comes, round what
   *  stands in his way short of it: walked straight at a spot on the far side of a stone (his own side taken by
   *  another prop), he stood pressed into the stone until he gave up, "he runs up to the stone but does not sit". */
  walkGoal(me: Sitter, speed: number, goal: THREE.Vector3): void {
    const s = this.spot!;
    const d = Math.hypot(s.fx - me.pos.x, s.fz - me.pos.z) || 1;
    const v = Math.min(speed * SIT.walk, d * 2.5);
    // (round the seat itself to a spot on its far side along its circles, as near as he may come to them: bent round it
    // by the steering, which bent him back round another prop, he stood still 2 m off the spot, 7 of 231 starts round
    // the crypt's columns; round the other props by the way foes find theirs, then steered round what's left near)
    const seat = s.seat.circles;
    wayTo(me, s.fx, s.fz, seat, nearOf(s.seat), _to);
    this.towards.set(_to.x, 0, _to.z);
    const tx = _to.x - me.pos.x, tz = _to.z - me.pos.z, td = Math.hypot(tx, tz) || 1;
    const skip = (o: Obstacle, ahead: number) => ahead >= td || seat.includes(o);
    steerClear(me.pos.x, me.pos.z, me.radius, tx / td, tz / td, Math.min(td, SIT.steerAhead), _way, skip);
    goal.set(_way.x * v, 0, _way.z * v);
  }

  /** Standing idle: long enough, the nearest seat's spot taken to walk to. */
  private wait(me: Sitter, dt: number, idle: boolean): void {
    this.idleFor = idle ? this.idleFor + dt : 0;
    this.retryIn -= dt;
    const asked = this.asked > 0 && idle;
    this.asked = asked ? 0 : Math.max(0, this.asked - dt);
    if (!asked && (!SIT.auto || this.idleFor < SIT.after || this.retryIn > 0)) return;
    const at = this.askedAt;
    this.spot = asked ? seatSpotAt(this.askedSeat!, at.x, at.z, me.pos, me.radius)
      : nearestSpot(me, this.only ? [this.only] : G.arena.seats);
    if (this.spot && seatTaken(this.spot, me)) this.spot = null;
    if (!this.spot) {
      if (!asked) this.retryIn = SIT.retry;
      return;
    }
    this.phase = 'walk';
    this.best = Infinity;
    this.noNearer = 0;
    this.heldFor = 0;
    this.last.copy(me.pos);
  }

  private walk(me: Sitter, dt: number, go: boolean): boolean {
    const s = this.spot!;
    const d = Math.hypot(s.fx - me.pos.x, s.fz - me.pos.z);
    const moved = Math.hypot(me.pos.x - this.last.x, me.pos.z - this.last.z);
    this.last.copy(me.pos);
    if (d < this.best - 0.02) {
      this.best = d;
      this.noNearer = 0;
      this.heldFor = 0;
    } else {
      this.noNearer += dt;
      if (moved < SIT.held * dt) this.heldFor += dt;
    }
    if (!go || this.heldFor > SIT.stuck || this.noNearer > SIT.lost) {
      if (go) this.retryIn = SIT.retry;
      this.giveUp();
      return false;
    }
    if (d > SIT.there) return false;
    this.phase = 'turn';
    this.turnFor = 0;
    return true;
  }

  private turnRound(me: Sitter, dt: number, go: boolean): boolean {
    if (!go) {
      this.giveUp();
      return false;
    }
    const s = this.spot!;
    me.facing = turnedTo(me.facing, s.yaw, dt);
    this.turnFor += dt;
    const off = Math.abs(Math.atan2(Math.sin(s.yaw - me.facing), Math.cos(s.yaw - me.facing)));
    if (off < 0.05 || this.turnFor > SIT.turnMost) {
      this.phase = 'down';
      this.u = 0;
      this.from.copy(me.pos);
    }
    return true;
  }

  private sit(me: Sitter, dt: number, go: boolean): boolean {
    if (!go) {
      this.phase = 'up';
      return this.rise(me, dt);
    }
    // (his hands first, standing; then his body; then his hands again, sat: lowered as he went down, a greatsword
    // swept through the log behind him)
    const st = this.state, hands = me.sitHands(!!this.spot!.seat.ground);
    if (st.before < 1) st.before = hands.before > 0 ? Math.min(1, st.before + dt / hands.before) : 1;
    else if (this.u < 1) this.u = Math.min(1, this.u + dt / SIT.down);
    else st.after = hands.after > 0 ? Math.min(1, st.after + dt / hands.after) : 1;
    if (st.after >= 1) this.phase = 'sat';
    this.place(me, dt);
    return true;
  }

  private rise(me: Sitter, dt: number): boolean {
    // (each back in turn, his hands quicker, `handsUp`, and readied again near the end of the way up: in turn, a greatsword
    // swung back onto his shoulder in time went 45 cm a frame, and he took 2.6 s to be up)
    const st = this.state, hands = me.sitHands(!!this.spot!.seat.ground), [before, after] = SIT.handsUp;
    if (st.after > 0) st.after = hands.after > 0 ? Math.max(0, st.after - dt / (hands.after * after)) : 0;
    else {
      if (this.u > 0) this.u = Math.max(0, this.u - dt / (hands.up ?? SIT.up));
      const least = this.holdHands ?? 0;
      if (hands.last ? this.u <= 0 : this.u < SIT.handsFrom) st.before = hands.before > 0 ? Math.max(least, st.before - dt / (hands.before * before)) : 0;
    }
    const turn = this.inSeatFrame(hands.turn);
    this.place(me, dt, turnFor(turn, st.before), stepFor(turn, st.before));
    // Hands without a separate stage finish halfway up; the body must finish too, or its weapon jumps to standing.
    if (this.u > 0 || st.before > 0) return true;
    // (up: let go of the seat only as he leaves it, from as near as he stands, or its circles would throw him off it)
    this.leaving = { circles: this.spot!.seat.circles, r: nearOf(this.spot!.seat) };
    this.giveUp();
    return true;
  }

  /** A turn as the seat's own: its angle from the seat's facing, its step in the seat's frame from where he stood,
   *  from a facing and a place in the world if it gives them (`SitTurn.yaw`, `at`). */
  private inSeatFrame(turn: SitTurn | undefined): SitTurn | undefined {
    if (!turn || (turn.yaw === undefined && !turn.at)) return turn;
    const yaw = this.spot!.yaw;
    const angle = turn.yaw === undefined ? turn.angle : Math.atan2(Math.sin(turn.yaw - yaw), Math.cos(turn.yaw - yaw));
    if (!turn.at) return { ...turn, angle };
    const dx = turn.at[0] - this.from.x, dz = turn.at[1] - this.from.z;
    const left = Math.cos(yaw) * dx - Math.sin(yaw) * dz;
    const ahead = Math.sin(yaw) * dx + Math.cos(yaw) * dz;
    return { ...turn, angle, step: [left, ahead] };
  }

  /** Placed as far down as he is: his hips over the seat, his feet where he stood, his back to it. */
  private place(me: Sitter, dt: number, turn = 0, step: readonly [number, number] = NO_STEP): void {
    const s = this.spot!, w = smooth(this.u);
    // (the hips come back over the seat as he goes down, sooner than they drop: a body sits back onto a seat)
    const back = smooth(Math.min(1, this.u * 1.25));
    // (and where he stands stepped by `step`, in the seat's frame)
    const [left, ahead] = step;
    const fromX = this.from.x + Math.cos(s.yaw) * left + Math.sin(s.yaw) * ahead;
    const fromZ = this.from.z - Math.sin(s.yaw) * left + Math.cos(s.yaw) * ahead;
    me.pos.x = fromX + (s.x - fromX) * back;
    me.pos.z = fromZ + (s.z - fromZ) * back;
    me.facing = turnedTo(me.facing, s.yaw + turn, dt);
    this.state.w = w;
    this.state.hip = s.hip;
    // (his feet where he stood, from where his hips are now)
    this.state.foot = Math.hypot(fromX - me.pos.x, fromZ - me.pos.z);
  }

  /** Off the seat he got up from: kept off its circles only as far as he's gone from them. */
  private leave(me: Sitter): void {
    const l = this.leaving;
    if (!l) return;
    let gap = Infinity;
    for (const o of l.circles) gap = Math.min(gap, Math.hypot(me.pos.x - o.x, me.pos.z - o.z) - o.r);
    l.r = Math.max(l.r, Math.min(me.radius, gap));
    if (l.r >= me.radius - 1e-3) this.leaving = null;
  }

  private giveUp(): void {
    this.phase = null;
    this.spot = null;
    this.idleFor = 0;
    this.u = 0;
    this.state.w = 0;
    this.state.before = 0;
    this.state.after = 0;
  }
}

/** The spot of `seats` nearest him within `SIT.within`, or none. */
function nearestSpot(me: Sitter, seats: readonly Seat[]): SeatSpot | null {
  let best: SeatSpot | null = null, bd = SIT.within;
  for (const seat of seats) {
    const spot = seatSpot(seat, me.pos.x, me.pos.z, me.radius);
    if (!spot || seatTaken(spot, me)) continue;
    const d = Math.hypot(spot.x - me.pos.x, spot.z - me.pos.z);
    if (d < bd) {
      bd = d;
      best = spot;
    }
  }
  return best;
}

/** Whether a foe (not a training dummy) is up and about within `SIT.foes` of (`x`, `z`). */
export function foeNear(x: number, z: number): boolean {
  return G.enemies.some((e) => e.alive && !e.def.dummy && (e.pos.x - x) ** 2 + (e.pos.z - z) ** 2 < SIT.foes ** 2);
}

const smooth = (u: number) => u * u * (3 - 2 * u);
const _way = { x: 0, z: 0 }, _to = { x: 0, z: 0 }, _off = { x: 0, z: 0 };

/** Whether the line from (`ax`, `az`) to (`bx`, `bz`) is clear for a body of `radius` of every prop but `but`. */
function clearBut(ax: number, az: number, bx: number, bz: number, radius: number, but: readonly Obstacle[]): boolean {
  const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz;
  for (const o of G.arena.obstacles) {
    if (but.includes(o)) continue;
    const k = len2 > 1e-9 ? Math.min(1, Math.max(0, ((o.x - ax) * dx + (o.z - az) * dz) / len2)) : 0;
    const px = ax + dx * k - o.x, pz = az + dz * k - o.z, r = o.r + radius;
    if (px * px + pz * pz < r * r) return false;
  }
  return true;
}
/** the navigation's slots of the heroes' fields to their seats, past the players' and the lures' */
const SIT_SLOT = 32;

/** Where he heads for to reach (`x`, `z`): straight at it, round the seat's own circles as near as `SEAT.near` lets
 *  him (`roundSeat`), while nothing else his body can't pass stands across his way there or he's within
 *  `SIT.lastStraight` of it; else the next waypoint of a field of his own round the props. Tested by half his body, a
 *  gap between two drums too narrow for him read as clear, and he was held in it. */
function wayTo(me: Sitter, x: number, z: number, seat: readonly Obstacle[], near: number, out: { x: number; z: number })
  : void {
  out.x = x;
  out.z = z;
  roundSeat(me.pos.x, me.pos.z, seat, near, out);
  // (the last of the way straight: the field's cells, half a metre across, sent him back and forth there)
  if (Math.hypot(x - me.pos.x, z - me.pos.z) < SIT.lastStraight) return;
  if (clearBut(me.pos.x, me.pos.z, out.x, out.z, me.radius, seat)) return;
  // (the field's way to a point off the seat: it begins from cells with a clear line to its target, and none has one
  // to the spot, `SEAT.near` from the seat, so it had no way at all)
  offSeat(x, z, seat, _off);
  navTarget(me.pos.x, me.pos.z, me.radius, _off.x, _off.z, SIT_SLOT + me.slot, out);
  // (the field's end a cell or two short of the spot, or no way in it at all (it gives the spot back): round the seat)
  const close = Math.hypot(out.x - me.pos.x, out.z - me.pos.z) < SIT.waypointNear;
  if (close || (out.x === _off.x && out.z === _off.z)) roundSeat(me.pos.x, me.pos.z, seat, near, out, x, z);
}

/** (`x`, `z`) moved out from the seat's nearest circle until it's `SIT.fieldOff` off it. */
function offSeat(x: number, z: number, seat: readonly Obstacle[], out: { x: number; z: number }): void {
  out.x = x;
  out.z = z;
  let nearest: Obstacle | null = null, gap = Infinity;
  for (const o of seat) {
    const g = Math.hypot(x - o.x, z - o.z) - o.r;
    if (g < gap) {
      gap = g;
      nearest = o;
    }
  }
  if (!nearest || gap >= SIT.fieldOff) return;
  const d = Math.hypot(x - nearest.x, z - nearest.z) || 1e-3;
  const by = nearest.r + SIT.fieldOff;
  out.x = nearest.x + (x - nearest.x) / d * by;
  out.z = nearest.z + (z - nearest.z) / d * by;
}

/** Where he heads from (`x`, `z`) for `out` (the spot, or `tx`, `tz`) with the seat in his way: the point of the
 *  first of its circles his way crosses where he'd go round it, on the spot's side, as near as `SEAT.near` lets him
 *  (on it already, a little further round). `out` is left as it is when the seat isn't in his way. */
function roundSeat(x: number, z: number, seat: readonly Obstacle[], near: number, out: { x: number; z: number },
  tx = out.x, tz = out.z): void {
  out.x = tx;
  out.z = tz;
  const dx = tx - x, dz = tz - z, len2 = dx * dx + dz * dz;
  if (len2 < 1e-6) return;
  let first: Obstacle | null = null, firstK = Infinity;
  for (const o of seat) {
    const k = Math.min(1, Math.max(0, ((o.x - x) * dx + (o.z - z) * dz) / len2));
    const px = x + dx * k - o.x, pz = z + dz * k - o.z, r = o.r + near;
    if (px * px + pz * pz < r * r && k < firstK) {
      first = o;
      firstK = k;
    }
  }
  if (!first) return;
  const R = first.r + near + SIT.roundBy;
  const ox = x - first.x, oz = z - first.z, d = Math.hypot(ox, oz) || 1e-3;
  // (round on the spot's side: the way from him round the centre towards it)
  const side = Math.sign(ox * (tz - first.z) - oz * (tx - first.x)) || 1;
  const turn = side * (d > R ? Math.acos(R / d) : SIT.roundStep);
  const c = Math.cos(turn), sn = Math.sin(turn), ux = ox / d, uz = oz / d;
  out.x = first.x + (ux * c - uz * sn) * R;
  out.z = first.z + (ux * sn + uz * c) * R;
}

/** Of `t` from `a` to `b` (either way round), within 0 and 1. */
const ramp = (t: number, a: number, b: number): number => Math.min(1, Math.max(0, (t - a) / (b - a)));

const NO_STEP: readonly [number, number] = [0, 0];

/** How far he has stepped as he gets up, his hands' stage at `before` (`SitTurn.step`), in the seat's frame. */
function stepFor(turn: SitTurn | undefined, before: number): readonly [number, number] {
  if (!turn?.step) return NO_STEP;
  const stepped = turn.by ? turn.by(before) : smooth(ramp(before, 1, turn.inTo));
  return [turn.step[0] * stepped, turn.step[1] * stepped];
}

/** How far his facing is turned from the seat's as he gets up, his hands' stage at `before` (`SitHands.turn`). */
function turnFor(turn: SitTurn | undefined, before: number): number {
  if (!turn) return 0;
  if (turn.by) return turn.angle * turn.by(before);
  const turnedIn = smooth(ramp(before, 1, turn.inTo));
  const turnedBack = smooth(ramp(before, turn.backFrom, turn.backTo));
  return turn.angle * turnedIn * (1 - turnedBack);
}
