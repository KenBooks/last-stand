// Brother Hollis's rounds through the library (world/library.ts sets them going once he's seated): he reads at his
// table a while, then gets up and goes about the room. He browses: walks to a case, runs his eye along its shelves,
// takes a book out (its own book, which leaves the shelf: its instance hidden while it's in his hands), looks it over,
// opens it and reads a little standing, and puts it back in its gap, or now and then keeps it and lays it on the stack
// on his table. Or he restocks: takes the top book off that stack and shelves it in a gap. Then back to his table.
// (At table height: bent over to the floor's stacks, his habit's rigid pieces came apart at his waist.) From play: "have him walking around as well... an actual book from a shelf that actually leaves the shelf".
// He walks a path round the room's obstacles (a grid, `route`), waits if the hero stands in his way, and is a body the
// hero can't walk through. A hero coming near is glanced up at (his model's glance) and he carries on; only being
// talked to stops him, wherever he is, turned to the hero, and he takes up his task again after. The spot he's talked
// to at follows him. Each frame sets his model's `act` (what he's doing) and places his root.
import * as THREE from 'three';
import type { Obstacle } from '../types';
import type { VillageObject } from '../data/village';
import { WALK, type HandAim, type Scholar } from '../entities/models/scholar';
import { clamp, lerp, mulberry, smooth } from '../util';

/** The room as his rounds need it, every place in the room's frame (`g`'s). */
export interface RoundsRoom {
  g: THREE.Object3D;
  /** his table's group (his root's parent), and where his root is as he sits (its frame) */
  desk: THREE.Object3D;
  sat: THREE.Vector3;
  /** the room's half width and depth (m) */
  half: readonly [number, number];
  obstacles: Obstacle[];
  /** which of them are the cases' fronts: he stands nearer them to take a book than his ways keep */
  cases: readonly Obstacle[];
  /** each spine's books on the shelves: its covers' instanced mesh, every book's pages' mesh and where this spine's begin
   *  in it, and each book's matrix and colour */
  shelves: { mesh: THREE.InstancedMesh; pages: THREE.InstancedMesh; offset: number; matrices: THREE.Matrix4[]; colours: THREE.Color[] }[];
  /** the stack of books on his table, bottom first, in its frame (each book's box size in its `userData.size`) */
  stack: THREE.Mesh[];
  /** a book for his hands, one of the shelves' (its material's map and colour set to the book's), and an open one */
  held: THREE.Mesh;
  openHeld: THREE.Object3D;
  /** where he's talked to (data/houses.ts), moved with him while he's up */
  talk: VillageObject;
  /** his dusting cloth (shown in his hand while he dusts), a puff of dust let off at a place, and the room's globe (its
   *  ball, turned on its own tilted axis) */
  cloth: THREE.Object3D;
  puff(at: THREE.Vector3): void;
  globe: THREE.Object3D;
  /** the open book made the book he took, opened (its size: thick, tall, deep; its colour) */
  openAs(size: THREE.Vector3, colour: THREE.Color): void;
  /** where the room's ladder's foot stands: its footprint is among the obstacles (a harness's canary sends him there) */
  ladder: THREE.Vector3;
}

/** a book of the shelves' out of its place: its covers' mesh and instance, its pages' mesh and instance, and its place */
export interface ShelfBookOut { mesh: THREE.InstancedMesh; index: number; pages: THREE.InstancedMesh; page: number; matrix: THREE.Matrix4 }

/** a harness's planted faults (`lab scholar --canary`): the book in his hands another than the one off the shelf, his
 *  spot under the ladder, the end of his rise cut as he sets off; and for a picture, the book by the ladder he may take (`byLadder`) */
export const roundsPlant = { otherBook: false, underLadder: false, cut: false, byLadder: false };

/** what he does when he gets up from his table */
export type Task = 'browse' | 'keep' | 'restock' | 'dust' | 'tidy' | 'globe';

export interface Rounds {
  /** a frame of his rounds: `heroAt` the local hero's place (world) or null; `talking` while he's talked to */
  update(dt: number, heroAt: THREE.Vector3 | null, talking: boolean, said: number): void;
  /** held at his table, reading (a harness's: `lab scholar`, `lab talk`) */
  hold: boolean;
  /** what he's doing now, in words (a harness reads it) */
  readonly doing: string;
  /** his body's circle among the room's obstacles */
  readonly body: Obstacle;
  /** the book in his hands now (or null), the books in their gaps, and a slot's book shown on its shelf (a harness's) */
  readonly carried: THREE.Object3D | null;
  readonly gaps: number;
  /** the shelf's book he has out now (taken, read, carried): its covers' mesh and instance, its pages' and where it
   *  stood; null once it's back or laid on his table (a harness's: the book in his hand the shelf's own) */
  readonly out: ShelfBookOut | null;
  /** a task begun now, whatever he's doing (a harness's) */
  begin(task: Task): void;
  /** where he stands at the cases (the room's frame): each spot, whether a clear way from his table reaches it, and how
   *  often he's gone to it this visit (a harness's) */
  readonly spots: readonly SpotSeen[];
}
/** a spot at the cases as a harness sees it: where he stands, the way he faces there, whether he can walk to it, how
 *  often he's gone to it */
export interface SpotSeen { readonly stand: THREE.Vector2; readonly out: THREE.Vector3; readonly reachable: boolean; readonly used: number }

/** the floor's grid his paths are found on (m a cell), and how far his body keeps from what's in the room (m) */
const CELL = 0.2;
const BODY = 0.3;
/** how far from a case he stands to take a book (m from its spine), the heights a book is taken from (m: from his
 *  chest to over his head; the row under, a metre up, pushed back in, was 0.76 m from his shoulder, past his reach, as
 *  he doesn't stoop), and where he holds one: ahead of him and its height (m) */
const SHELF = { stand: 0.5, low: 1.1, high: 1.6 };
const HOLD = { ahead: 0.3, high: 1.24, tilt: 0.55 };
/** how far back from upright the open book is held to read (rad from horizontal of its pages' facing: 55 degrees,
 *  the book 35 from upright) */
const READ_TILT = 0.96;
/** how long he reads at his table between rounds (s), and how long each beat of a round takes (s) */
const READ = { least: 10, most: 12, first: 10 };
const BEAT = { release: 1.4, rise: 2.8, reach: 1.0, tip: 0.5, grasp: 0.8, pull: 0.6, lift: 1.2, inspect: 2.6, scan: [2.5, 4.5], read: [6, 12], open: 0.8, put: 1.3, push: 0.6, cradle: 1.0 };
/** how long a hand's aim takes to go over to a new one that jumped from the last (s): from holding a book before him to
 *  holding it to his chest, the hand turned 21 degrees in a frame */
const AIM_BLEND = 0.35;
/** how far a hand's aim may move in a frame, and turn (m, rad), before it's taken as a jump to blend over */
const AIM_JUMP = { at: 0.03, turn: 0.25 };
/** how he turns: how fast at most (rad/s), and the least a turn takes (s): each turn eased in and out */
const TURN = { rate: 1.9, least: 0.35 };
/** one motion each way: how far through his rise he sets off on his way, the rest of it as he takes his first steps and
 *  turns to it, and how far through his sitting down he's turned his back to his chair (from play: "it snaps ... there
 *  are two separate ones instead": risen whole, he stood still and only then turned; turned whole, he only then sat) */
const RISE = { setOff: 0.7, turned: 0.45 };
/** how quickly his turning walking eases to the turn he wants (1/s): turned at once at each corner of his way, and
 *  moved straight along it, his body and his heading jumped there a frame */
const STEER = 9;
/** how far short of a corner of his way he takes the next leg (m: he walks round it), and how far from its end he
 *  slows from his pace, to how much of it (walked to the end at a third of it, he stopped dead) */
const CORNER = 0.2, SLOWS = { from: 0.6, least: 0.08 };
/** his dusting (a case's spines wiped a row at a time: each row's height (m over the floor, within his reach: a row
 *  over his head left his cloth in the air), from where to where along it (m, his right +: his right hand wipes it, and
 *  across to his left it fell short), the strokes a row and how long each takes (s), and how much closer to the case
 *  than for a book he stands (m)), and the globe set turning (rad/s, and how fast it slows: 1/s) */
const DUST = { rows: [1.45, 1.18, 0.92], along: [-0.1, 0.34], strokes: 2, stroke: 1.7, closer: 0.17 };
const SPIN = { speed: 2.4, slows: 0.35 };
/** the most he waits at his table for his loop to come to rest before he gets up (s: a beat lasts 8 at most) */
const CALM_MOST = 12;
/** where he looks as he walks: ahead along his way (m), and down to (m over the floor) */
const LOOK_AHEAD = { far: 2.6, high: 1.25 };
/** where his dusting cloth is in his right hand (its frame: his fingers down -y, his palm facing -z) */
const CLOTH_IN_HAND = new THREE.Vector3(0, -0.07, -0.022);
/** how near the hero may stand to the way ahead of him (m) before he waits for him, how long he waits before he goes
 *  round him (s), how wide a berth he gives him then (m), and how near the end of his way he settles for, when the hero
 *  stands on it (m) */
const IN_THE_WAY = 0.55;
const WAIT_MOST = 2;
const BERTH = 0.55;
const NEAR_ENOUGH = 0.7;
/** the most books his table's stack holds, the fewest it keeps, and where he may stand to reach it (his table's frame:
 *  beyond its end on his right, by the stack, or round its corner) */
const STACK = { most: 8, fewest: 1, stands: [new THREE.Vector3(1.02, 0, 0.72), new THREE.Vector3(0.95, 0, 1.08), new THREE.Vector3(1.08, 0, 0.42), new THREE.Vector3(0.6, 0, 1.15)] };

/** A book on a shelf he can take: its spine's mesh and instance, where it stands, how it's turned, its size, the way
 *  its spine faces (out of the case) and where he stands for it. */
interface Slot { shelf: number; index: number; at: THREE.Vector3; turn: THREE.Quaternion; size: THREE.Vector3; out: THREE.Vector3; stand: THREE.Vector2 }
/** a stretch of a case's front he stands at: its first book's stand, the way out of the case, its books, whether a clear
 *  way from his table reaches it, how often he's gone to it */
interface Spot { stand: THREE.Vector2; out: THREE.Vector3; slots: Slot[]; reachable: boolean; used: number }
/** how wide a spot is along its case (m: a step either way reaches its books), and how near facing its books are (the
 *  cosine of the angle between their ways out: a corner's two cases are two spots) */
const SPOT = { wide: 0.7, facing: 0.9 };
/** how near a case's front he stands at it (m past its circle: his body's front, a forearm off its shelves), and how far
 *  off the walls (m): kept a body's width off the cases as his ways are, he stood at 4 stretches of the room's 33 */
const AT_CASE = { near: 0.25, walls: 0.3 };

/** a hand's aim as a turn: its fingers +y, its palm +z (made square to the fingers), and back */
function aimTurn(fingers: THREE.Vector3, palm: THREE.Vector3): THREE.Quaternion {
  const y = fingers.clone().normalize(), z = palm.clone().addScaledVector(y, -palm.dot(y)).normalize(), x = new THREE.Vector3().crossVectors(y, z);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}
/** `t` of the way from aim `a` to aim `b`: its place mixed, its turn turned round the shortest way (mixed as two
 *  directions, a palm turned far round swung through their middle, and the hand spun 33 degrees in a frame) */
export function mixAim(a: HandAim, b: HandAim, t: number): HandAim {
  const q = aimTurn(a.fingers, a.palm).slerp(aimTurn(b.fingers, b.palm), t);
  return { at: a.at.clone().lerp(b.at, t), fingers: new THREE.Vector3(0, 1, 0).applyQuaternion(q), palm: new THREE.Vector3(0, 0, 1).applyQuaternion(q) };
}

export function scholarRounds(s: Scholar, room: RoundsRoom): Rounds {
  const { g, desk, act } = { ...room, act: s.act };
  // (each visit its own: seeded the same every visit, he went to the same cases in the same order, from play: "add more
  // spots for him to stand/pick books, not just two". A harness's runs fix the page's randomness, so its are the same)
  const rng = mulberry((Math.random() * 0x7fffffff) | 0);
  desk.updateMatrix();
  const deskInv = desk.matrix.clone().invert(), deskYaw = desk.rotation.y;
  const seat = room.sat.clone().applyMatrix4(desk.matrix);
  // (beside his chair, where he steps out to as he gets up)
  const exit = new THREE.Vector3(0.72, 0, room.sat.z - 0.02).applyMatrix4(desk.matrix);
  const body: Obstacle = { x: seat.x, z: seat.z, r: 0, h: 1.8 };
  room.obstacles.push(body);
  const talkAt: [number, number] = [room.talk.at[0], room.talk.at[1]], talkStand: [number, number] = [room.talk.stand[0], room.talk.stand[1]];

  // --- the floor's grid: each cell free of the walls and of what stands in the room, as far as his body keeps ---
  const [hx, hz] = room.half, nx = Math.floor((hx * 2) / CELL), nz = Math.floor((hz * 2) / CELL);
  const free = new Uint8Array(nx * nz);
  const cellOf = (x: number, z: number): [number, number] => [Math.floor((x + hx) / CELL), Math.floor((z + hz) / CELL)];
  const centre = (i: number, k: number) => new THREE.Vector2(-hx + (i + 0.5) * CELL, -hz + (k + 0.5) * CELL);
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    const c = centre(i, k);
    let ok = Math.abs(c.x) < hx - 0.4 && Math.abs(c.y) < hz - 0.4;
    for (const o of room.obstacles) if (ok && o !== body && Math.hypot(c.x - o.x, c.y - o.z) < o.r + BODY) ok = false;
    free[k * nx + i] = ok ? 1 : 0;
  }
  const isFree = (x: number, z: number) => {
    const [i, k] = cellOf(x, z);
    return i >= 0 && k >= 0 && i < nx && k < nz && free[k * nx + i] === 1;
  };
  const clear = (a: THREE.Vector2, b: THREE.Vector2) => {
    const n = Math.ceil(a.distanceTo(b) / 0.08);
    for (let t = 1; t < n; t++) if (!isFree(lerp(a.x, b.x, t / n), lerp(a.y, b.y, t / n))) return false;
    return true;
  };
  /** the free cell nearest (x, z) */
  const nearestFree = (p: THREE.Vector2): THREE.Vector2 => {
    if (isFree(p.x, p.y)) return p.clone();
    let best = p.clone(), bestD = Infinity;
    for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
      if (!free[k * nx + i]) continue;
      const c = centre(i, k), d = c.distanceTo(p);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  };
  /** A path from `a` to `b` over the free cells (A*, eight ways), pulled straight where he can see along it; `round`,
   *  a place (the hero's) kept `BERTH` clear of as well. */
  function route(a: THREE.Vector2, b: THREE.Vector2, round?: THREE.Vector2): THREE.Vector2[] {
    const blocked: number[] = [];
    if (round) {
      for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
        if (free[k * nx + i] && centre(i, k).distanceTo(round) < BERTH + BODY) { free[k * nx + i] = 0; blocked.push(k * nx + i); }
      }
    }
    try { return routeOver(a, b); } finally { for (const c of blocked) free[c] = 1; }
  }
  /** whether a path found reaches its end over the free cells (`routeOver` gives the end alone where none does) */
  const found = (path: THREE.Vector2[], a: THREE.Vector2) => path.length > 1 || clear(nearestFree(a), path[0]);
  function routeOver(a: THREE.Vector2, b: THREE.Vector2): THREE.Vector2[] {
    const s0 = nearestFree(a), s1 = nearestFree(b);
    const [si, sk] = cellOf(s0.x, s0.y), [ti, tk] = cellOf(s1.x, s1.y);
    const start = sk * nx + si, goal = tk * nx + ti;
    const cost = new Float32Array(nx * nz).fill(Infinity), from = new Int32Array(nx * nz).fill(-1), done = new Uint8Array(nx * nz);
    cost[start] = 0;
    const open = [start];
    const h = (c: number) => Math.hypot((c % nx) - ti, Math.floor(c / nx) - tk);
    while (open.length) {
      let bi = 0;
      for (let q = 1; q < open.length; q++) if (cost[open[q]] + h(open[q]) < cost[open[bi]] + h(open[bi])) bi = q;
      const c = open.splice(bi, 1)[0];
      if (c === goal) break;
      if (done[c]) continue;
      done[c] = 1;
      const ci = c % nx, ck = Math.floor(c / nx);
      for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) {
        if (!di && !dk) continue;
        const i = ci + di, k = ck + dk;
        if (i < 0 || k < 0 || i >= nx || k >= nz || !free[k * nx + i]) continue;
        // (no corner cut between two blocked cells)
        if (di && dk && (!free[ck * nx + i] || !free[k * nx + ci])) continue;
        const n = k * nx + i, d = cost[c] + (di && dk ? Math.SQRT2 : 1);
        if (d < cost[n]) { cost[n] = d; from[n] = c; open.push(n); }
      }
    }
    if (from[goal] < 0 && goal !== start) return [b.clone()];
    const cells: THREE.Vector2[] = [];
    for (let c = goal; c !== start && c >= 0; c = from[c]) cells.push(centre(c % nx, Math.floor(c / nx)));
    cells.reverse();
    cells.push(b.clone());
    // (pulled straight: each point the furthest on he can walk to in a line)
    const path: THREE.Vector2[] = [];
    let at = a.clone();
    for (let q = 0; q < cells.length;) {
      let far = q;
      for (let r = cells.length - 1; r > q; r--) if (clear(at, cells[r])) { far = r; break; }
      path.push(cells[far]);
      at = cells[far];
      q = far + 1;
    }
    return path;
  }

  /** whether he can stand at `p` to take a book: off the walls, near the cases' fronts, and a body's width off all else
   *  (the ladder, the tables and chairs, the globe, the hearth) */
  const standFree = (p: THREE.Vector2) => Math.abs(p.x) < hx - AT_CASE.walls && Math.abs(p.y) < hz - AT_CASE.walls
    && room.obstacles.every((o) => o === body || Math.hypot(p.x - o.x, p.y - o.z) >= o.r + (room.cases.includes(o) ? AT_CASE.near : BODY));
  // --- the books he can take: standing on a shelf at a hand's height, with room before their case ---
  const slots: Slot[] = [], everySlot: Slot[] = [];
  /** the ladder's foot (the room's frame, on the floor) */
  const foot = new THREE.Vector2(room.ladder.x, room.ladder.z);
  room.shelves.forEach(({ matrices }, shelf) => matrices.forEach((m, index) => {
    const at = new THREE.Vector3(), turn = new THREE.Quaternion(), size = new THREE.Vector3();
    m.decompose(at, turn, size);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(turn), out = new THREE.Vector3(0, 0, 1).applyQuaternion(turn).setY(0).normalize();
    if (up.y < 0.95 || at.y < SHELF.low || at.y > SHELF.high) return;
    const stand = new THREE.Vector2(at.x + out.x * (SHELF.stand + size.z / 2), at.z + out.z * (SHELF.stand + size.z / 2));
    everySlot.push({ shelf, index, at, turn, size, out, stand });
    if (standFree(stand)) slots.push(everySlot[everySlot.length - 1]);
  }));
  // (the stretches of the cases' fronts he stands at, from the room's own books: those he can walk to from his table)
  const spots: Spot[] = [];
  for (const slot of slots) {
    let spot = spots.find((sp) => sp.out.dot(slot.out) > SPOT.facing && sp.stand.distanceTo(slot.stand) < SPOT.wide);
    if (!spot) spots.push(spot = { stand: slot.stand.clone(), out: slot.out.clone(), slots: [], reachable: false, used: 0 });
    spot.slots.push(slot);
  }
  {
    const from = new THREE.Vector2(exit.x, exit.z);
    for (const spot of spots) spot.reachable = found(route(from, spot.stand), from);
  }
  /** the slots whose books are off their shelves now: in his hands, or kept on a stack (their gaps) */
  const gaps: Slot[] = [];
  /** A book's slot to go to (`can` it be one), at the spot he's gone to least this visit he can walk to: round the cases,
   *  not the same two again and again. */
  const pickSlot = (can: (slot: Slot) => boolean = () => true): Slot | undefined => {
    const open = spots.filter((sp) => sp.reachable && sp.slots.some((sl) => !gaps.includes(sl) && can(sl)));
    if (!open.length) return undefined;
    const least = Math.min(...open.map((sp) => sp.used)), fewest = open.filter((sp) => sp.used === least);
    const spot = fewest[(rng() * fewest.length) | 0];
    spot.used++;
    const books = spot.slots.filter((sl) => !gaps.includes(sl) && can(sl));
    return books[(rng() * books.length) | 0];
  };
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  const showSlot = (slot: Slot, on: boolean) => {
    const { mesh, pages, offset, matrices } = room.shelves[slot.shelf];
    mesh.setMatrixAt(slot.index, on ? matrices[slot.index] : hidden);
    pages.setMatrixAt(offset + slot.index, on ? matrices[slot.index] : hidden);
    mesh.instanceMatrix.needsUpdate = pages.instanceMatrix.needsUpdate = true;
  };

  // --- where he is: his place and the way he faces (yaw, the room's frame) ---
  const me = { p: new THREE.Vector2(seat.x, seat.z), yaw: deskYaw };
  const fwd = () => new THREE.Vector3(Math.sin(me.yaw), 0, Math.cos(me.yaw));
  /** his right hand, and where his cloth is in it (its frame: down his fingers to his palm's middle, out from his palm) */
  const handR = s.root.getObjectByName('scholar handR')!;
  /** a stack's book (lying: its long side x, its thickness y) turned to stand as a shelf's does, and back */
  const STOOD = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2)), STOOD_BACK = STOOD.clone().invert();
  /** his left (his model's +x) */
  const left = () => new THREE.Vector3(Math.cos(me.yaw), 0, -Math.sin(me.yaw));
  const place = () => {
    const local = new THREE.Vector3(me.p.x, 0, me.p.y).applyMatrix4(deskInv);
    s.root.position.copy(local);
    s.root.rotation.set(0, me.yaw - deskYaw, 0);
  };
  const toWorld = (p: THREE.Vector3) => g.localToWorld(p.clone());
  const dirWorld = (d: THREE.Vector3) => d.clone().transformDirection(g.matrixWorld);
  const aim = (at: THREE.Vector3, palm: THREE.Vector3, fingers: THREE.Vector3): HandAim =>
    ({ at: toWorld(at), palm: dirWorld(palm), fingers: dirWorld(fingers) });
  const angleTo = (a: number, b: number) => ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;

  // --- what he carries, and how he holds it ---
  let carried: THREE.Object3D | null = null;
  /** which of the books for his hands shows: put on them each frame, as the room's warm-up shows both for its draw */
  const shown = { held: false, openHeld: false, cloth: false };
  let out: ShelfBookOut | null = null;
  const pose = { at: new THREE.Vector3(), turn: new THREE.Quaternion() };
  /** what keeps what he carries in his hands as he walks and turns, each frame (null: he carries nothing that way) */
  let carry: (() => void) | null = null;
  /** where a book is held before him to look it over: its cover to him, its top tilted from him */
  const holdPose = (out: typeof pose, wobble = 0) => {
    const f = fwd();
    out.at.set(me.p.x, HOLD.high, me.p.y).addScaledVector(f, HOLD.ahead);
    const y = new THREE.Vector3(0, Math.cos(HOLD.tilt), 0).addScaledVector(f, Math.sin(HOLD.tilt)).applyAxisAngle(f, wobble).normalize();
    const x = f.clone().negate().addScaledVector(y, f.dot(y)).normalize();
    const z = new THREE.Vector3().crossVectors(x, y);
    out.turn.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    return out;
  };
  /** where the open book is held to read: at his mid-chest, near him, its pages to his face, tilted back from upright
   *  by `READ_TILT` (its spine up and down his front). Held 44 degrees from flat, it read from the front as a plank
   *  edge-on, from play: "I never seen someone hold a book like that" */
  const readPose = (out: typeof pose) => {
    const f = fwd(), l = left();
    out.at.set(me.p.x, HOLD.high + 0.03, me.p.y).addScaledVector(f, HOLD.ahead - 0.04);
    const y = f.clone().negate().multiplyScalar(Math.cos(READ_TILT)).add(new THREE.Vector3(0, Math.sin(READ_TILT), 0)).normalize();
    const x = l.clone();
    const z = new THREE.Vector3().crossVectors(x, y);
    out.turn.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    return out;
  };
  /** his hands on the book at `p` (its sides, palms in, fingers up its cover; `size` its box) */
  const handsOn = (p: typeof pose, size: THREE.Vector3, k: number, kL = k) => {
    const z = new THREE.Vector3(0, 0, 1).applyQuaternion(p.turn), y = new THREE.Vector3(0, 1, 0).applyQuaternion(p.turn);
    const side = z.dot(left()) > 0 ? 1 : -1;
    act.handL = aim(p.at.clone().addScaledVector(z, side * size.z / 2).addScaledVector(y, -size.y * 0.15), z.clone().multiplyScalar(-side), y);
    act.handR = aim(p.at.clone().addScaledVector(z, -side * size.z / 2).addScaledVector(y, -size.y * 0.15), z.clone().multiplyScalar(side), y);
    act.reachL = kL; act.reachR = k;
    act.grip = 1;
  };
  const putCarried = (p: typeof pose) => {
    if (!carried) return;
    carried.position.copy(p.at);
    carried.quaternion.copy(p.turn);
  };

  // --- his rounds, a beat at a time: each step a generator run a frame a `next` ---
  let dt = 0, doing = 'reading at his table';
  const wait = function* (seconds: number): Generator<void, void, void> { for (let t = 0; t < seconds; t += dt) yield; };
  /** `fn` over `seconds`, given how far through it is (0 to 1), a frame at a time */
  /** what goes on alongside his beats a frame at a time, till it says it's done (the end of his rise as he sets off) */
  let alongside: (() => boolean) | null = null;
  const over = function* (seconds: number, fn: (k: number) => void): Generator<void, void, void> {
    for (let t = 0; t < seconds; t += dt) { fn(clamp(t / seconds, 0, 1)); yield; }
    fn(1);
  };
  const look = (p: THREE.Vector3 | null) => { act.look = p ? toWorld(p) : null; };
  const hands = (k: number) => { act.reachL = Math.min(act.reachL, k); act.reachR = Math.min(act.reachR, k); };

  /** Turned to `yaw`, eased in and out, his feet stepping round (`each` a frame, given how far through: what he holds
   *  kept in his hands). Turned at one speed and stopped dead, he turned as a turret does. */
  function* turnTo(yaw: number, each: ((k: number) => void) | null = null): Generator<void, void, void> {
    const from = me.yaw, by = angleTo(from, yaw);
    if (Math.abs(by) < 0.02) return;
    // (his head leading the turn, to where he turns to, unless what he holds has his eyes)
    const to = new THREE.Vector3(me.p.x + Math.sin(yaw) * LOOK_AHEAD.far, LOOK_AHEAD.high, me.p.y + Math.cos(yaw) * LOOK_AHEAD.far);
    yield* over(TURN.least + Math.abs(by) / TURN.rate, (k) => {
      me.yaw = from + by * smooth(k);
      look(to);
      act.walk = 0.06 + 0.12 * Math.sin(Math.PI * k);
      carry?.();
      each?.(k);
    });
    me.yaw = from + by;
    act.walk = 0;
  }
  let heroAt: THREE.Vector3 | null = null;
  function* walkTo(to: THREE.Vector2): Generator<void, void, void> {
    let path = route(me.p, to), speed = 0, waited = 0, spin = 0, onWay = 1;
    for (let q = 0; q < path.length; q++) {
      const target = path[q], last = q === path.length - 1;
      for (;;) {
        const d = target.clone().sub(me.p), dist = d.length();
        if (dist < (last ? 0.05 : CORNER)) break;
        // (the hero stood on the end of his way: as near as he can come does)
        const hero2 = heroAt ? new THREE.Vector2(heroAt.x, heroAt.z) : null;
        if (hero2 && hero2.distanceTo(to) < BERTH && me.p.distanceTo(to) < NEAR_ENOUGH + BERTH) { act.walk = 0; return; }
        const yaw = Math.atan2(d.x, d.y), off = angleTo(me.yaw, yaw);
        // (looking where he goes, ahead along his way: from play, "looking sideways when walking forwards")
        // (the way he's walking: his way's was off it as he steered round to it)
        look(new THREE.Vector3(me.p.x + Math.sin(me.yaw) * LOOK_AHEAD.far, LOOK_AHEAD.high, me.p.y + Math.cos(me.yaw) * LOOK_AHEAD.far));
        spin = lerp(spin, Math.sign(off) * Math.min(Math.abs(off) / Math.max(dt, 1e-3), 1 + 2 * Math.abs(off)), clamp(dt * STEER, 0, 1));
        me.yaw += spin * dt;
        // (slowed as the way turns, near still for a sharp turn, and to the end of the way: stopped dead for each turn
        // and set off again, he moved as a machine does)
        let want = WALK.speed * clamp(1.15 - Math.abs(off) / 1.1, 0, 1) * (last ? clamp(dist / SLOWS.from, SLOWS.least, 1) : 1);
        // (the hero in his way: he waits for him a moment, then goes round him; waiting on, he stood there for good while
        // a hero stood in his way)
        if (hero2) {
          const ahead = new THREE.Vector2(me.p.x + Math.sin(me.yaw) * 0.6, me.p.y + Math.cos(me.yaw) * 0.6);
          if (ahead.distanceTo(hero2) < IN_THE_WAY) {
            want = 0;
            waited += dt;
            if (waited > WAIT_MOST) {
              waited = 0;
              // (round him if there's a way; else he waits on and tries again: with no way round, a straight line to
              // the end of his way went through what stood between)
              const round = route(me.p, to, hero2);
              if (found(round, me.p)) { path = round; q = -1; break; }
            }
          } else waited = 0;
        }
        speed = lerp(speed, want, clamp(dt * 4, 0, 1));
        // (along the way he faces, slowed as he faces off his way's: near its end, eased to straight at it, as he'd never
        // come to it turning round it)
        const step = Math.min(dist, speed * dt), ahead = new THREE.Vector2(Math.sin(me.yaw), Math.cos(me.yaw));
        onWay = lerp(onWay, Math.max(0, Math.cos(off)), clamp(dt * STEER, 0, 1));
        const home = last ? smooth(clamp((0.25 - dist) / 0.2, 0, 1)) : 0;
        me.p.addScaledVector(ahead.lerp(d.normalize(), home).normalize(), step * onWay);
        act.walk = Math.max(speed, Math.abs(off) > 0.5 ? 0.12 : 0);
        // (what he carries with him: left where he picked it up, a book stayed in the air across the room)
        carry?.();
        yield;
      }
    }
    act.walk = 0;
  }

  function* getUp(): Generator<void, void, void> {
    doing = 'getting up from his table';
    const from = new THREE.Vector2(seat.x, seat.z), way = new THREE.Vector2(exit.x, exit.z).sub(from);
    // (out from between his chair and his table as he rises, as a man gets up from one: risen in his place first, he
    // stood in his chair)
    const out = (k: number) => smooth(clamp(k * 1.2 - 0.1, 0, 1));
    yield* over(BEAT.rise * RISE.setOff, (k) => {
      act.sit = 1 - smooth(k * RISE.setOff);
      me.p.copy(from).addScaledVector(way, out(k * RISE.setOff));
    });
    // (the rest of it as he sets off: added to where his steps take him)
    let k = RISE.setOff, was = out(k);
    // (the canary: the rest of it cut, there in a frame)
    if (roundsPlant.cut) { act.sit = 0; me.p.addScaledVector(way, 1 - was); return; }
    alongside = () => {
      k = Math.min(1, k + dt / BEAT.rise);
      act.sit = 1 - smooth(k);
      me.p.addScaledVector(way, out(k) - was);
      was = out(k);
      return k < 1;
    };
  }
  function* sitDown(): Generator<void, void, void> {
    doing = 'going back to his table';
    yield* walkTo(new THREE.Vector2(exit.x, exit.z));
    // (turned to his table as he starts down: his back to his chair, a step or two round with it)
    const from = me.p.clone(), to = new THREE.Vector2(seat.x, seat.z), yaw = me.yaw, by = angleTo(yaw, deskYaw);
    look(new THREE.Vector3(me.p.x + Math.sin(deskYaw) * LOOK_AHEAD.far, LOOK_AHEAD.high, me.p.y + Math.cos(deskYaw) * LOOK_AHEAD.far));
    yield* over(BEAT.rise, (k) => {
      const turning = clamp(k / RISE.turned, 0, 1);
      me.yaw = yaw + by * smooth(turning);
      act.walk = Math.abs(by) > 0.05 ? 0.12 * Math.sin(Math.PI * turning) : 0;
      act.sit = smooth(k);
      me.p.copy(from).lerp(to, smooth(clamp(k * 1.2 - 0.1, 0, 1)));
    });
    act.walk = 0;
    act.sit = 1;
    me.p.copy(to);
    me.yaw = deskYaw;
    look(null);
  }

  /** His eye along a case's shelves: from one end of what he can reach to the other, a row and the next. */
  function* scan(slot: Slot, seconds: number): Generator<void, void, void> {
    doing = 'looking for a book';
    const along = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), slot.out).normalize();
    yield* over(seconds, (k) => {
      const row = Math.floor(k * 3), u = (k * 3) % 1;
      look(slot.at.clone().addScaledVector(along, lerp(-0.6, 0.6, row % 2 ? 1 - u : u)).setY(lerp(1.55, 1.0, row / 2)));
    });
  }

  /** The spine he takes it by: its middle, a hair out of the shelf. */
  const spine = (slot: Slot, outBy: number) => slot.at.clone().addScaledVector(slot.out, slot.size.z / 2 + outBy);
  /** a book's way out of its spine (its +z), its way up (+y), and its spine's middle */
  const spineOf = (p: typeof pose, size: THREE.Vector3) => {
    const out = new THREE.Vector3(0, 0, 1).applyQuaternion(p.turn), up = new THREE.Vector3(0, 1, 0).applyQuaternion(p.turn);
    return { out, up, at: p.at.clone().addScaledVector(out, size.z / 2) };
  };
  /** his right hand's finger hooked over a book's top just behind its spine: his palm down, his fingers into the case */
  const onTop = (p: typeof pose, size: THREE.Vector3) => {
    const { out, up, at } = spineOf(p, size);
    return aim(at.addScaledVector(up, size.y / 2 + 0.03).addScaledVector(out, 0.05), up.clone().negate(), out.clone().negate().addScaledVector(up, -0.5));
  };
  /** his right hand round a book's spine: his palm on it, his fingers round to its far cover (his left), his thumb on
   *  the near; as a book is held by its spine */
  const bySpine = (p: typeof pose, size: THREE.Vector3) => {
    const { out, up, at } = spineOf(p, size), l = left();
    // (his fingers round to the cover on his left; with the spine itself to his left or right, as the book is held
    // before him, round the book's own way across: there his left left nothing across it, and his hand spun)
    const across = l.clone().addScaledVector(out, -l.dot(out)).addScaledVector(up, -l.dot(up));
    const own = new THREE.Vector3().crossVectors(up, out);
    if (own.dot(l) < 0) own.negate();
    across.lerp(own.normalize(), 1 - smooth(clamp(across.length() / 0.6, 0, 1))).normalize();
    return aim(at.addScaledVector(out, 0.03).addScaledVector(across, -0.03).addScaledVector(up, -size.y * 0.05), out.clone().negate(), across);
  };
  /** his right hand on a shelf's book's spine, the book a hair out of its gap (`outBy`) */
  const onSpine = (slot: Slot, outBy: number) =>
    bySpine({ at: slot.at.clone().addScaledVector(slot.out, outBy), turn: slot.turn }, slot.size);

  /** The book in `slot` taken off its shelf as a reader takes one: a finger hooked over its top tips it out of the row,
   *  his hand goes round its spine, it's drawn out and brought before him in both hands. Taken by its top alone and slid
   *  out flat, from play: "that's not how you grab a book". */
  function* take(slot: Slot): Generator<void, void, void> {
    doing = 'taking a book from the shelf';
    look(spine(slot, 0));
    act.grip = 0.3;
    const p = { at: slot.at.clone(), turn: slot.turn.clone() };
    yield* over(BEAT.reach, (k) => { act.handR = onTop(p, slot.size); act.reachR = smooth(k); });
    // (the book itself: its look the shelf's, in his hand where it stood)
    const { mesh, colours } = room.shelves[slot.shelf];
    const mat = (room.held.material as THREE.Material[])[0] as THREE.MeshStandardMaterial;
    mat.map = (mesh.material as THREE.MeshStandardMaterial).map;
    mat.color.copy(colours[slot.index]);
    if (roundsPlant.otherBook) mat.color.setRGB(1, 1, 1);
    room.held.scale.copy(slot.size);
    shown.held = true;
    carried = room.held;
    showSlot(slot, false);
    gaps.push(slot);
    out = { mesh: room.shelves[slot.shelf].mesh, pages: room.shelves[slot.shelf].pages, index: slot.index, page: room.shelves[slot.shelf].offset + slot.index, matrix: room.shelves[slot.shelf].matrices[slot.index].clone() };
    putCarried(p);
    // (tipped out: turned on its bottom's front edge, its top coming out of the row)
    const up = new THREE.Vector3(0, 1, 0), axis = new THREE.Vector3().crossVectors(up, slot.out).normalize();
    const pivot = slot.at.clone().addScaledVector(slot.out, slot.size.z / 2).addScaledVector(up, -slot.size.y / 2);
    const tipped = (angle: number, outBy: number) => {
      const q = new THREE.Quaternion().setFromAxisAngle(axis, angle);
      p.turn.copy(q).multiply(slot.turn);
      p.at.copy(slot.at).sub(pivot).applyQuaternion(q).add(pivot).addScaledVector(slot.out, outBy);
      putCarried(p);
    };
    const TIP = 0.32;
    yield* over(BEAT.tip, (k) => { tipped(TIP * smooth(k), 0); act.handR = onTop(p, slot.size); });
    // (his hand round its spine as it leans out)
    act.grip = 0.85;
    yield* over(BEAT.grasp, (k) => {
      tipped(TIP, 0);
      act.handR = mixAim(onTop(p, slot.size), bySpine(p, slot.size), smooth(k));
    });
    // (drawn out, straightened as it comes)
    yield* over(BEAT.pull, (k) => {
      tipped(TIP * (1 - smooth(k)), smooth(k) * (slot.size.z + 0.06));
      act.handR = bySpine(p, slot.size);
    });
    act.grip = 1;
    const from = { at: p.at.clone(), turn: p.turn.clone() }, to = { at: new THREE.Vector3(), turn: new THREE.Quaternion() };
    yield* over(BEAT.lift, (k) => {
      holdPose(to);
      p.at.copy(from.at).lerp(to.at, smooth(k));
      p.turn.copy(from.turn).slerp(to.turn, smooth(k));
      putCarried(p);
      const spineHold = bySpine(p, slot.size);
      handsOn(p, slot.size, 1, smooth(clamp(k * 1.3 - 0.2, 0, 1)));
      act.handR = mixAim(spineHold, act.handR!, smooth(clamp(k * 2, 0, 1)));
      look(p.at);
    });
  }

  /** a closed book carried against his chest: upright, its spine to his right, its bottom in his right palm, his left
   *  hand over its front holding it to him (`size` a shelf's book's: thick, tall, deep; `turned` a stack's book stood
   *  up). Held out before him flat in both hands as he walked, it looked carried on a tray, from play. */
  const cradlePose = (out: typeof pose, size: THREE.Vector3, turned = false) => {
    const f = fwd(), l = left();
    out.at.set(me.p.x, 1.0 + size.y / 2, me.p.y).addScaledVector(f, 0.16 + size.x / 2).addScaledVector(l, -0.03);
    const y = new THREE.Vector3(0, 1, 0).addScaledVector(f, -0.22).normalize();
    const x = f.clone().addScaledVector(y, -f.dot(y)).normalize();
    out.turn.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, new THREE.Vector3().crossVectors(x, y)));
    if (turned) out.turn.multiply(STOOD);
    return out;
  };
  /** his hands on a book carried against his chest (`size` as `cradlePose` has it) */
  const cradleHands = (p: typeof pose, size: THREE.Vector3, turned = false) => {
    const turn = turned ? p.turn.clone().multiply(STOOD_BACK) : p.turn;
    const x = new THREE.Vector3(1, 0, 0).applyQuaternion(turn), y = new THREE.Vector3(0, 1, 0).applyQuaternion(turn), l = left();
    act.handR = aim(p.at.clone().addScaledVector(y, -size.y / 2 - 0.035).addScaledVector(l, -0.02), y, l);
    act.handL = aim(p.at.clone().addScaledVector(x, size.x / 2 + 0.035).addScaledVector(y, size.y * 0.12).addScaledVector(l, -0.04),
      x.clone().negate(), y.clone().multiplyScalar(0.5).addScaledVector(l, -0.8).normalize());
    act.reachL = act.reachR = 1;
    act.grip = 0.7;
  };
  /** each hand's aim taken `t` of the way from `from`'s to the one it has now */
  const blendHands = (from: { L: HandAim; R: HandAim }, t: number) => {
    act.handL = mixAim(from.L, act.handL!, t);
    act.handR = mixAim(from.R, act.handR!, t);
  };
  /** A book in his hands brought from where it is (`p`, moved) to against his chest. */
  function* toCradle(p: typeof pose, size: THREE.Vector3, turned = false): Generator<void, void, void> {
    const from = { at: p.at.clone(), turn: p.turn.clone() }, to = { at: new THREE.Vector3(), turn: new THREE.Quaternion() };
    // (his hands from where they held it, mixed over to holding it to him: set there at once, his left turned 30 degrees
    // in a frame)
    const held = { L: act.handL, R: act.handR };
    yield* over(BEAT.cradle, (k) => {
      cradlePose(to, size, turned);
      p.at.copy(from.at).lerp(to.at, smooth(k));
      p.turn.copy(from.turn).slerp(to.turn, smooth(k));
      putCarried(p);
      cradleHands(p, size, turned);
      if (held.L && held.R) blendHands({ L: held.L, R: held.R }, smooth(k));
    });
  }

  /** Turned to `yaw` with the book held before him. */
  function* turnHolding(slot: Slot, yaw: number): Generator<void, void, void> {
    const p = { at: new THREE.Vector3(), turn: new THREE.Quaternion() };
    yield* turnTo(yaw, () => {
      holdPose(p);
      putCarried(p);
      handsOn(p, slot.size, 1);
      look(p.at);
    });
  }

  /** The book in his hands looked over (turned this way and that), then opened and read a while, and closed. */
  function* inspectAndRead(slot: Slot): Generator<void, void, void> {
    doing = 'looking a book over';
    const p = { at: new THREE.Vector3(), turn: new THREE.Quaternion() };
    yield* over(BEAT.inspect, (k) => {
      holdPose(p, 0.35 * Math.sin(k * Math.PI * 2));
      putCarried(p);
      handsOn(p, slot.size, 1);
      look(p.at);
    });
    doing = 'opening a book';
    const r = { at: new THREE.Vector3(), turn: new THREE.Quaternion() };
    // (the open book the very book he took, opened, and his hands on it as it's sized)
    room.openAs(slot.size, room.shelves[slot.shelf].colours[slot.index]);
    const open = new THREE.Vector3(0.26, 0.04, 0.2).multiply(room.openHeld.scale);
    /** his hands under the open book at `r`: his left palm behind its spine low down, his right behind its right
     *  board, his fingers straight up the boards (curled, they came through its pages, from play) */
    const readHands = (q: typeof r, behind: number) => {
      const y = new THREE.Vector3(0, 1, 0).applyQuaternion(q.turn), x = new THREE.Vector3(1, 0, 0).applyQuaternion(q.turn);
      const upPage = new THREE.Vector3(0, 1, 0).addScaledVector(y, -y.y).normalize();
      act.handL = aim(q.at.clone().addScaledVector(x, open.x * 0.05).addScaledVector(upPage, -open.z * 0.42).addScaledVector(y, -behind),
        y, upPage.clone().addScaledVector(x, 0.08));
      act.handR = aim(q.at.clone().addScaledVector(x, -open.x * 0.3).addScaledVector(upPage, -open.z * 0.38).addScaledVector(y, -behind),
        y, upPage.clone().addScaledVector(x, -0.15));
      act.reachL = act.reachR = 1;
      act.grip = 0.05;
    };
    // (opened: his hands round behind the closed book first, then it's open in them and brought up to read)
    const shut = holdPose({ at: new THREE.Vector3(), turn: new THREE.Quaternion() });
    yield* over(BEAT.open * 0.5, (k) => {
      holdPose(shut);
      putCarried(shut);
      readHands(shut, 0.03);
      if (k < 0.3) handsOn(shut, slot.size, 1);
      look(shut.at);
    });
    shown.held = false;
    shown.openHeld = true;
    const from = { at: shut.at.clone(), turn: shut.turn.clone() };
    yield* over(BEAT.open, (k) => {
      readPose(r);
      r.at.lerp(from.at, 1 - smooth(k));
      r.turn.slerp(from.turn, 1 - smooth(k));
      room.openHeld.position.copy(r.at);
      room.openHeld.quaternion.copy(r.turn);
      readHands(r, lerp(0.03, 0.017, k));
      look(r.at);
    });
    doing = 'reading a book standing';
    yield* over(lerp(BEAT.read[0], BEAT.read[1], rng()), () => {
      readPose(r);
      room.openHeld.position.copy(r.at);
      room.openHeld.quaternion.copy(r.turn);
      readHands(r, 0.017);
      look(r.at);
    });
    shown.openHeld = false;
    shown.held = true;
    act.grip = 1;
  }

  /** The book in his hands put back in its gap: brought to it, pushed in, his hand let go of it. */
  function* putBack(slot: Slot): Generator<void, void, void> {
    doing = 'putting a book back';
    const p = holdPose({ at: new THREE.Vector3(), turn: new THREE.Quaternion() }), from = { at: p.at.clone(), turn: p.turn.clone() };
    const front = slot.at.clone().addScaledVector(slot.out, slot.size.z + 0.05);
    look(slot.at);
    yield* over(BEAT.put, (k) => {
      p.at.copy(from.at).lerp(front, smooth(k));
      p.turn.copy(from.turn).slerp(slot.turn, smooth(k));
      putCarried(p);
      // (from its side, where he held it, to its spine as it goes to the shelf)
      handsOn(p, slot.size, 1);
      act.handR = mixAim(act.handR!, bySpine(p, slot.size), smooth(k));
      act.reachR = 1;
      act.reachL = 1 - smooth(k);
    });
    yield* over(BEAT.push, (k) => {
      p.at.copy(front).lerp(slot.at, smooth(k));
      putCarried(p);
      act.handR = bySpine(p, slot.size);
    });
    showSlot(slot, true);
    gaps.splice(gaps.indexOf(slot), 1);
    out = null;
    shown.held = false;
    carried = null;
    act.grip = 0;
    yield* over(BEAT.release, (k) => hands(1 - smooth(k)));
    act.handL = act.handR = null;
  }

  /** a mesh's place and turn in the room's frame (his table's stack is in the table's) */
  const inRoom = (m: THREE.Object3D) => {
    m.updateWorldMatrix(true, false);
    const at = g.worldToLocal(m.getWorldPosition(new THREE.Vector3()));
    const turn = g.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(m.getWorldQuaternion(new THREE.Quaternion()));
    return { at, turn };
  };
  const stack = room.stack;
  /** where he stands to reach the stack, and its top */
  /** the first of his spots by the stack that's clear (the ladder's footprint leans by his table), else the nearest
   *  clear place to the first */
  const stackStand = () => {
    for (const stand of STACK.stands) {
      const at = stand.clone().applyMatrix4(desk.matrix);
      if (isFree(at.x, at.z)) return new THREE.Vector2(at.x, at.z);
    }
    const at = STACK.stands[0].clone().applyMatrix4(desk.matrix);
    return nearestFree(new THREE.Vector2(at.x, at.z));
  };
  const stackTop = () => {
    const top = stack[stack.length - 1], size = top.userData.size as THREE.Vector3;
    return inRoom(top).at.add(new THREE.Vector3(0, size.y / 2, 0));
  };
  const faceStack = () => { const base = inRoom(stack[0]).at; return Math.atan2(base.x - me.p.x, base.z - me.p.y); };

  /** The book in his hands kept: laid on top of his table's stack (a book of its own there now), its gap left. */
  function* keep(slot: Slot): Generator<void, void, void> {
    doing = 'carrying a book to a stack';
    const held = holdPose({ at: new THREE.Vector3(), turn: new THREE.Quaternion() });
    yield* toCradle(held, slot.size);
    carry = () => { cradlePose(held, slot.size); putCarried(held); cradleHands(held, slot.size); };
    yield* walkTo(stackStand());
    yield* turnTo(faceStack());
    carry = null;
    doing = 'laying a book on a stack';
    // (lying flat on the stack's top, its spine out a little turned)
    const size = slot.size, laid = new THREE.Vector3(size.y, size.x, size.z);
    const top = stackTop().add(new THREE.Vector3(0, laid.y / 2, 0));
    // (across his front, its sides to his hands, a little turned: turned anyhow, one hand reached round to its far side)
    const flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), me.yaw + Math.PI / 2 + (rng() - 0.5) * 0.4)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2));
    const p = cradlePose({ at: new THREE.Vector3(), turn: new THREE.Quaternion() }, slot.size), from = { at: p.at.clone(), turn: p.turn.clone() };
    look(top);
    yield* over(BEAT.put * 1.8, (k) => {
      p.at.copy(from.at).lerp(top, smooth(k));
      p.turn.copy(from.turn).slerp(flat, smooth(k));
      putCarried(p);
      // (held to him as it comes off his chest, then by its sides as it goes down)
      cradleHands(p, slot.size);
      const toHim = { L: act.handL!, R: act.handR! };
      handsOn(p, size, 1);
      blendHands(toHim, smooth(clamp((k - 0.1) / 0.6, 0, 1)));
    });
    // (a book of its own on the stack: the held one's mesh and look copied)
    const [leather, paper] = room.held.material as THREE.Material[];
    const kept = new THREE.Mesh(room.held.geometry, [leather.clone(), paper]);
    kept.position.copy(top);
    kept.quaternion.copy(flat);
    kept.scale.copy(size);
    kept.castShadow = kept.receiveShadow = true;
    kept.userData.size = laid;
    kept.name = 'scholar desk books';
    g.add(kept);
    // (in his table's frame, as the stack is)
    desk.attach(kept);
    stack.push(kept);
    out = null;
    shown.held = false;
    carried = null;
    act.grip = 0;
    yield* over(BEAT.release, (k) => hands(1 - smooth(k)));
    act.handL = act.handR = null;
  }

  /** The top book of his table's stack shelved in a gap: picked up, carried, stood in the gap. */
  function* restock(): Generator<void, void, void> {
    const slot = gaps[(rng() * gaps.length) | 0];
    if (stack.length <= STACK.fewest || !slot) return;
    doing = 'fetching a book from a stack';
    yield* walkTo(stackStand());
    yield* turnTo(faceStack());
    doing = 'picking a book up off a stack';
    const book = stack[stack.length - 1], size = book.userData.size as THREE.Vector3;
    const p = inRoom(book);
    // (his hands to its sides, as it lies: bent down to it)
    /** his hands on it: by its two ends as it lies (`covers` 0), or on its two covers, the fingers up its length
     *  (`covers` 1: as he carries it stood up; by its ends, the one at its top was out of his reach at a high shelf) */
    const sides = (q: typeof p, k: number, covers = 0) => {
      const x = new THREE.Vector3(1, 0, 0).applyQuaternion(q.turn), y = new THREE.Vector3(0, 1, 0).applyQuaternion(q.turn);
      const down = new THREE.Vector3(0, -1, 0).add(fwd());
      for (const [sd, hand] of [[1, 'L'], [-1, 'R']] as const) {
        // (his left on the cover on his left)
        const face = y.dot(left()) > 0 ? sd : -sd;
        const end = q.at.clone().addScaledVector(x, sd * size.x / 2), cover = q.at.clone().addScaledVector(y, face * size.y / 2).addScaledVector(x, -size.x * 0.1);
        const held = aim(end.lerp(cover, covers), x.clone().multiplyScalar(-sd).lerp(y.clone().multiplyScalar(-face), covers).normalize(),
          down.clone().lerp(x.clone().multiplyScalar(x.y >= 0 ? 1 : -1), covers).normalize());
        if (hand === 'L') act.handL = held; else act.handR = held;
      }
      act.reachL = act.reachR = k;
    };
    look(p.at);
    act.grip = 0.4;
    yield* over(BEAT.reach * 1.3, (k) => sides(p, smooth(k)));
    stack.pop();
    // (in his hands: in the room's frame now, as he carries it)
    g.attach(book);
    carried = book;
    act.grip = 1;
    // (stood up in his hands: its long side up, as it'll stand on the shelf)
    const from = { at: p.at.clone(), turn: p.turn.clone() };
    const shelfSize = new THREE.Vector3(size.y, size.x, size.z);
    yield* over(BEAT.lift * 1.3, (k) => {
      const to = cradlePose({ at: new THREE.Vector3(), turn: new THREE.Quaternion() }, shelfSize, true);
      p.at.copy(from.at).lerp(to.at, smooth(k));
      p.turn.copy(from.turn).slerp(to.turn, smooth(k));
      putCarried(p);
      if (k < 0.5) sides(p, 1, smooth(clamp(k * 2, 0, 1)));
      else cradleHands(p, shelfSize, true);
      look(p.at);
    });
    doing = 'carrying a book to its shelf';
    carry = () => {
      cradlePose(p, shelfSize, true);
      putCarried(p);
      cradleHands(p, shelfSize, true);
    };
    yield* walkTo(slot.stand);
    yield* turnTo(Math.atan2(-slot.out.x, -slot.out.z));
    carry = null;
    doing = 'shelving a book';
    // (in the gap, standing: its long side up, on the shelf)
    const into = slot.at.clone().setY(slot.at.y - slot.size.y / 2 + size.x / 2);
    const upright = slot.turn.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2)));
    const front = into.clone().addScaledVector(slot.out, slot.size.z + 0.05), start = { at: p.at.clone(), turn: p.turn.clone() };
    look(slot.at);
    const stood = new THREE.Vector3(size.y, size.x, size.z);
    yield* over(BEAT.put, (k) => {
      p.at.copy(start.at).lerp(front, smooth(k));
      p.turn.copy(start.turn).slerp(upright, smooth(k));
      putCarried(p);
      // (to the shelf as he puts a book back: his right hand on its spine, his left letting go; held by its two ends,
      // the end at the top was out of his reach at a high shelf)
      act.handR = bySpine(p, stood);
      act.reachR = 1;
      act.reachL = 1 - smooth(k);
    });
    yield* over(BEAT.push, (k) => {
      p.at.copy(front).lerp(into, smooth(k));
      putCarried(p);
      // (on the spine of the book he carries, stood up: on the shelf's own book's, his hand pushed 13 cm off it)
      act.handR = bySpine(p, stood);
      act.reachL = 0;
    });
    // (it stands in the gap now: the gap's gone)
    gaps.splice(gaps.indexOf(slot), 1);
    room.shelves[slot.shelf].matrices[slot.index] = new THREE.Matrix4().compose(into, upright, new THREE.Vector3(1, 1, 1));
    slots.splice(slots.indexOf(slot), 1);
    for (const spot of spots) if (spot.slots.includes(slot)) spot.slots.splice(spot.slots.indexOf(slot), 1);
    carried = null;
    act.grip = 0;
    yield* over(BEAT.release, (k) => hands(1 - smooth(k)));
    act.handL = act.handR = null;
  }

  /** A browse: to a case, his eye along it, a book taken, looked over and read, put back (or kept). */
  function* browse(kept: boolean): Generator<void, void, void> {
    // (the canary: the book where the ladder leans, its spot under the ladder)
    // (and for a picture, the book nearest it he may take: `byLadder`)
    const nearest = (of: Slot[]) => of.reduce((a, b) => (b.stand.distanceTo(foot) < a.stand.distanceTo(foot) ? b : a));
    const slot = roundsPlant.underLadder ? nearest(everySlot) : roundsPlant.byLadder ? nearest(slots) : pickSlot();
    if (!slot) return;
    doing = 'walking to a case';
    yield* walkTo(slot.stand);
    // (the canary: on, straight in between its rails, as the grid he walks would never take him)
    if (roundsPlant.underLadder) {
      const from = me.p.clone(), into = foot.clone().addScaledVector(new THREE.Vector2(slot.out.x, slot.out.z), -0.3);
      yield* over(1, (k) => { me.p.copy(from).lerp(into, smooth(k)); act.walk = 0.3; });
      act.walk = 0;
    }
    yield* turnTo(Math.atan2(-slot.out.x, -slot.out.z));
    yield* scan(slot, lerp(BEAT.scan[0], BEAT.scan[1], rng()));
    yield* take(slot);
    // (turned half round to the room to look it over and read it, as a man steps back from a case with a book; and back
    // to the case to put it away)
    const atCase = me.yaw, side = rng() < 0.5 ? 1 : -1;
    yield* turnHolding(slot, atCase + side * 1.9);
    yield* inspectAndRead(slot);
    if (kept && stack.length < STACK.most) yield* keep(slot);
    else {
      yield* turnHolding(slot, atCase);
      yield* putBack(slot);
    }
  }

  /** a case faced from where he stands for its book in `slot` */
  function* toCase(slot: Slot): Generator<void, void, void> {
    yield* walkTo(slot.stand);
    yield* turnTo(Math.atan2(-slot.out.x, -slot.out.z));
  }
  /** a place on a case's front: `along` it (m) from `slot`'s book and `up` (m), `out` from its spines (m) */
  const onCase = (slot: Slot, along: number, up: number, out: number) => {
    const side = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), slot.out).normalize();
    return spine(slot, out).addScaledVector(side, along).add(new THREE.Vector3(0, up, 0));
  };

  /** A case dusted: his cloth from his belt, its spines wiped along a row at a time from the top, a puff of dust off
   *  each stroke, and the cloth put away. */
  function* dust(): Generator<void, void, void> {
    const slot = pickSlot();
    if (!slot) return;
    doing = 'walking to a case to dust it';
    yield* toCase(slot);
    // (a step nearer, within an arm of its spines: nearer than his ways keep to a case, which keep his body's width off
    // it, his robe still clear of it; and back after)
    const near = slot.stand.clone().add(new THREE.Vector2(-slot.out.x, -slot.out.z).multiplyScalar(DUST.closer)), back = me.p.clone();
    const step = function* (to: THREE.Vector2): Generator<void, void, void> {
      const from = me.p.clone();
      yield* over(0.6, (k) => { me.p.copy(from).lerp(to, smooth(k)); act.walk = 0.15 * Math.sin(Math.PI * k); });
      act.walk = 0;
    };
    yield* step(near);
    doing = 'dusting a case';
    const into = slot.out.clone().negate(), cloth = room.cloth;
    const fingers = new THREE.Vector3(0, 1, 0).addScaledVector(into, 0.3).normalize();
    const wipe = (along: number, up: number) => {
      const at = onCase(slot, along, up, 0.045);
      act.handR = aim(at, into, fingers);
    };
    const rows = DUST.rows.map((y) => y - slot.at.y);
    act.grip = 0.5;
    yield* over(BEAT.reach, (k) => { wipe(DUST.along[0], rows[0]); act.reachR = smooth(k); look(onCase(slot, 0, rows[0], 0)); });
    shown.cloth = true;
    for (let row = 0; row < rows.length; row++) {
      const up = rows[row];
      if (row) yield* over(0.5, (k) => wipe(DUST.along[0], lerp(rows[row - 1], up, smooth(k))));
      for (let n = 0; n < DUST.strokes * 2; n++) {
        const [a, b] = n % 2 ? [DUST.along[1], DUST.along[0]] : DUST.along;
        let puffed = 0;
        yield* over(DUST.stroke, (k) => {
          const along = lerp(a, b, smooth(k));
          wipe(along, up + 0.008 * Math.sin(k * Math.PI * 4));
          look(onCase(slot, along * 0.6, up, 0));
          if (k > puffed) { puffed += 0.25; room.puff(onCase(slot, along, up, 0.06)); }
        });
      }
    }
    shown.cloth = false;
    yield* over(BEAT.release, (k) => hands(1 - smooth(k)));
    act.handR = null;
    act.grip = 0;
    yield* step(back);
  }

  /** A row of books squared: his hands flat on their spines, pressing them back in line along the shelf. */
  function* tidy(): Generator<void, void, void> {
    const slot = pickSlot();
    if (!slot) return;
    doing = 'walking to a case';
    yield* toCase(slot);
    doing = 'squaring the books on a shelf';
    const into = slot.out.clone().negate();
    const press = (along: number, inBy: number, k: number) => {
      for (const [sd, hand] of [[1, 'L'], [-1, 'R']] as const) {
        const held = aim(onCase(slot, along + sd * 0.16, 0, 0.05 - inBy), into, new THREE.Vector3(0, 1, 0).addScaledVector(into, 0.2));
        if (hand === 'L') act.handL = held; else act.handR = held;
      }
      act.reachL = act.reachR = k;
    };
    act.grip = 0.1;
    look(onCase(slot, 0, 0, 0));
    yield* over(BEAT.reach, (k) => press(-0.3, 0, smooth(k)));
    for (let n = 0; n < 3; n++) {
      const from = -0.3 + n * 0.3;
      yield* over(1.0, (k) => { press(from + 0.3 * smooth(k), 0.012 * Math.sin(Math.PI * k), 1); look(onCase(slot, from, 0, 0)); });
    }
    yield* over(BEAT.release, (k) => hands(1 - smooth(k)));
    act.handL = act.handR = null;
  }

  /** The globe set turning: walked up to, a hand swept over it, watched as it slows. */
  let spin = 0;
  function* turnGlobe(): Generator<void, void, void> {
    const ball = room.globe, centre = ball.position.clone();
    const stand = nearestFree(new THREE.Vector2(centre.x + 0.75, centre.z));
    doing = 'walking to the globe';
    yield* walkTo(stand);
    yield* turnTo(Math.atan2(centre.x - me.p.x, centre.z - me.p.y));
    doing = 'turning the globe';
    look(centre);
    const l = left(), f = fwd(), R = 0.29;
    const on = (k: number) => centre.clone().addScaledVector(l, lerp(0.22, -0.22, k)).addScaledVector(f, -R * 0.75).add(new THREE.Vector3(0, 0.08, 0));
    act.grip = 0.1;
    yield* over(BEAT.reach, (k) => { act.handR = aim(on(0), f, l.clone().negate()); act.reachR = smooth(k); });
    yield* over(0.45, (k) => {
      act.handR = aim(on(smooth(k)), f, l.clone().negate());
      if (k > 0.2) spin = SPIN.speed;
    });
    yield* over(BEAT.release, (k) => hands(1 - smooth(k)));
    act.handR = null;
    act.grip = 0;
    yield* over(4, () => look(centre));
  }

  let asked: Task | null = null;
  /** what he does next when he gets up (weights: browsing most) */
  const nextTask = (): Task => {
    const can: [Task, number][] = [['browse', 3], ['keep', 1], ['dust', 2], ['tidy', 1.5], ['globe', 1]];
    if (gaps.length && stack.length > STACK.fewest) can.push(['restock', 2]);
    let r = rng() * can.reduce((t, [, w]) => t + w, 0);
    for (const [task, w] of can) if ((r -= w) <= 0) return task;
    return 'browse';
  };
  function* day(): Generator<void, void, void> {
    let reading = READ.first;
    for (;;) {
      doing = 'reading at his table';
      for (let t = 0; t < reading && !asked; t += dt) yield;
      reading = lerp(READ.least, READ.most, rng());
      const task = asked ?? nextTask(), alone = asked !== null;
      asked = null;
      // (the page he's turning turned and his hand back on the book, or his hand back from his face, before he gets up:
      // from play, "he is in the middle of slipping a page at a desk, then suddenly he stands up")
      doing = 'finishing at his table';
      for (let t = 0; !s.calm && t < CALM_MOST; t += dt) yield;
      yield* getUp();
      if (task === 'restock') yield* restock();
      else if (task === 'dust') yield* dust();
      else if (task === 'tidy') yield* tidy();
      else if (task === 'globe') yield* turnGlobe();
      else yield* browse(task === 'keep');
      // (now and then a second book before he sits again; never when a harness asked for one task)
      if (!alone && rng() < 0.35) yield* browse(false);
      yield* sitDown();
    }
  }
  /** each hand's aim, in his body's frame (his place and facing: a blend in it keeps up with him as he walks), the last
   *  frame's, and the one it's blending over from with how far through */
  type Local = { at: THREE.Vector3; palm: THREE.Vector3; fingers: THREE.Vector3 };
  const aims = {
    L: { last: null as Local | null, shown: null as Local | null, from: null as Local | null, t: 1 },
    R: { last: null as Local | null, shown: null as Local | null, from: null as Local | null, t: 1 },
  };
  const toLocal = (a: HandAim): Local => {
    const inv = new THREE.Matrix4().makeRotationY(me.yaw).setPosition(me.p.x, 0, me.p.y).premultiply(g.matrixWorld).invert();
    const rot = new THREE.Matrix4().extractRotation(inv);
    return { at: a.at.clone().applyMatrix4(inv), palm: a.palm.clone().applyMatrix4(rot), fingers: a.fingers.clone().applyMatrix4(rot) };
  };
  const toWorldAim = (l: Local): HandAim => {
    const m = new THREE.Matrix4().makeRotationY(me.yaw).setPosition(me.p.x, 0, me.p.y).premultiply(g.matrixWorld);
    const rot = new THREE.Matrix4().extractRotation(m);
    return { at: l.at.clone().applyMatrix4(m), palm: l.palm.clone().applyMatrix4(rot).normalize(), fingers: l.fingers.clone().applyMatrix4(rot).normalize() };
  };
  /** Each hand's aim this frame, where it jumped from the last, blended over from the last (`AIM_BLEND`): a beat that
   *  hands on to another holding a thing otherwise, its aims set anew, turned the hand at once. */
  function blendAims(): void {
    for (const side of ['L', 'R'] as const) {
      const aim = side === 'L' ? act.handL : act.handR, b = aims[side];
      if (!aim) { b.last = b.shown = b.from = null; b.t = 1; continue; }
      // (a jump told by this frame's aim against the last frame's as the beat set it, not as it was shown: against the
      // shown one, a blend under way read as a jump each frame and began again, and the hand crept 40 cm behind)
      const raw = toLocal(aim), now = toLocal(aim);
      if (b.last && b.shown && (raw.at.distanceTo(b.last.at) > AIM_JUMP.at || raw.palm.angleTo(b.last.palm) > AIM_JUMP.turn || raw.fingers.angleTo(b.last.fingers) > AIM_JUMP.turn)) {
        b.from = b.shown;
        b.t = 0;
      }
      if (b.from && b.t < 1) {
        b.t = Math.min(1, b.t + dt / AIM_BLEND);
        const k = smooth(b.t), f = b.from, q = aimTurn(f.fingers, f.palm).slerp(aimTurn(raw.fingers, raw.palm), k);
        now.at.copy(f.at).lerp(raw.at, k);
        now.fingers.set(0, 1, 0).applyQuaternion(q);
        now.palm.set(0, 0, 1).applyQuaternion(q);
        if (side === 'L') act.handL = toWorldAim(now); else act.handR = toWorldAim(now);
      }
      b.last = raw;
      b.shown = now;
    }
  }
  let rounds = day();
  let started = false;

  const rounds$: Rounds = {
    hold: false,
    get doing() { return doing; },
    body,
    get carried() { return carried; },
    get gaps() { return gaps.length; },
    get out() { return out; },
    get spots() { return spots; },
    begin(task) {
      if (act.sit < 1 || carried) return;
      asked = task;
    },
    update(frameDt, hero, talking, said) {
      dt = frameDt;
      heroAt = hero ? g.worldToLocal(hero.clone()) : null;
      if (!started) { started = true; place(); }
      // (held at his table: a harness's)
      if (rounds$.hold && act.sit >= 1 && !carried) {
        rounds = day();
        doing = 'reading at his table';
      } else if (talking) {
        // (talked to: still, turned to the hero if he's up)
        act.walk = 0;
        if (act.sit <= 0 && heroAt) {
          const off = angleTo(me.yaw, Math.atan2(heroAt.x - me.p.x, heroAt.z - me.p.y));
          me.yaw += Math.sign(off) * Math.min(Math.abs(off), 2 * dt);
          act.walk = Math.abs(off) > 0.05 ? 0.1 : 0;
        }
      } else {
        if (alongside && !alongside()) alongside = null;
        rounds.next();
      }
      blendAims();
      place();
      room.held.visible = shown.held;
      room.openHeld.visible = shown.openHeld;
      room.cloth.visible = shown.cloth;
      // (the globe turning on, slowing)
      if (spin > 0.01) { room.globe.rotateY(spin * frameDt); spin *= Math.exp(-SPIN.slows * frameDt); }
      // (his body among the room's obstacles while he's up, and where he's talked to)
      const up = act.sit < 0.5;
      body.x = me.p.x; body.z = me.p.y; body.r = up ? BODY : 0;
      const f = fwd();
      if (up) {
        room.talk.at[0] = me.p.x; room.talk.at[1] = me.p.y;
        room.talk.stand[0] = me.p.x + f.x * 1.2; room.talk.stand[1] = me.p.y + f.z * 1.2;
      } else {
        room.talk.at[0] = talkAt[0]; room.talk.at[1] = talkAt[1];
        room.talk.stand[0] = talkStand[0]; room.talk.stand[1] = talkStand[1];
      }
      s.update(frameDt, hero, talking, said);
      // (his cloth in his right hand as his pose has it, under his palm: put where his hand was aimed, it stayed by the
      // spines as his arm fell short of them and as his pose followed, 11 cm off his palm)
      if (shown.cloth) {
        handR.updateWorldMatrix(true, false);
        room.cloth.position.copy(g.worldToLocal(handR.localToWorld(CLOTH_IN_HAND.clone())));
        room.cloth.quaternion.copy(g.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(handR.getWorldQuaternion(new THREE.Quaternion())));
      }
    },
  };
  return rounds$;
}
