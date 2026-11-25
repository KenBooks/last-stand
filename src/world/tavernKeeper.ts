// The Ember & Oak's keeper at his day's work (world/rooms.ts builds the tavern and calls this; data/tavern.ts has where
// everything stands and how long each task takes; game/mugs.ts is the ledger of his mugs; his body is
// entities/models/keeper.ts, posed each frame from what this asks of it).
// From play: "Why is he holding the cup the entire time... if he did not pour beer into the cup yet then it should be
// empty... All cups should be accounted for. If he needs a cup, he has some standing on the side, he actually grabs one
// (and now there is one less from the bunch), he pours some beer, and gives it to you... you place it down on the table
// (when character is done drinking)... the bartender comes to wherever the cup was left, and washes it, and after
// places it back with the other cups... if you keep asking for drinks you could run out of cups. Give him more tasks to
// do. He is wiping the same place over and over, have him wipe all spots."
// - His mugs stand clean on the back counter. Asked for ale, he takes one (empty), fills it at the cask's tap, sets it
//   down and pushes it across the bar to the hero, who takes it up as it stops and drinks it (`Player.drinkAle`), and
//   sets it down empty on the bar before him (on the nearest table if he's walked off from the bar).
// - A mug left about is his to clear: he goes to it, takes it, washes it in the tub on the back counter, dries it and
//   stands it back with the rest. Asked for ale with none clean, he says so and washes one first; with none to wash
//   (every one in a hero's hand) he says so and serves as soon as one comes back.
// - Between times he works: wipes the bar in passes along its length, checks the cask, tidies the bottles, sweeps the
//   floor before the bar, wipes the tables, stokes the fire. A hero coming to the bar has him leave it (putting his
//   broom or poker back) and come to the tap.
// - In co-op the host's game runs him and the ledger (`tv`: the ledger as it changes and his body ten times a second),
//   and a guest's asks go to it (`tv?`: ale, a mug taken up, a mug set down): two heroes can't take one mug.
// Everything that comes and goes is drawn at no size when it isn't there, never hidden: the room's warm-up draws it.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G } from '../state';
import { createKit } from '../core/materials';
import { sfx } from '../core/audio';
import { anchorLabel, floatText, promptArt } from '../ui/floaters';
import { ORDER, type Label } from '../ui/overlay/layer';
import { particles, col } from '../fx/particles';
import { keeperSteps, KEEPER_HEAD, KEEPER_MADE, RAG_TUCKED, type HandGoal, type Keeper, type KeeperPose } from '../entities/models/keeper';
import { readyHead } from '../entities/models/head';
import { heroDetail } from '../entities/models/armor';
import { readyFace } from '../core/textures';
import { buildMug, setMugFill, MUG } from '../entities/models/flask';
import {
  ALE_BEATS, BACK, BAR, BAR_STOOL_HIGH, BAR_STOOL_X, BAR_STOOLS, BROOM_AT, COME_TO_BAR, PLACES, POKER_AT, SET_DOWN_WITHIN, SHELF_SLOTS,
  STEER, SWEEP, TABLES, TASK, TUB, TURN_ON_SPOT, WALK, WASH, type Spot,
} from '../data/tavern';
import { MugLedger, type Mug } from '../game/mugs';
import { isGuest, isHost } from '../net/role';
import { tavernLink } from '../net/tavernLink';
import { onMessages } from '../net/messages';
import { cursorRay, input, spendPress, wasPressed } from '../core/input';
import { outline } from '../ui/overlay/outline';
import { claimPointWhen, objectNearAt, objectPointed, takeClickWhen, takeKeyWhen } from '../game/keyTakers';
import { drinkChoice, type DrinkPick } from '../game/drinkChoice';
import { box, drum, type Build } from './rooms';
import { buildBroom } from './tavernBroom';
import { TavernNav, type NavBox, type Point } from './tavernNav';
import { edgeNear, keepOffTop, nearestTop, pastEdge, TABLE_TOPS, TOP_THINGS, type TableTop } from './tavernTables';
import { HOUSES } from '../data/houses';
import { stepVelocity } from '../entities/movement';
import type { Player } from '../entities/player';
import { clamp, lerp, smooth } from '../util';

/** how he walks his ways (`lab tavern --canary` plants each fault: ways planned straight through the furniture (the planned-way check's), a stop and a
 *  turn at each bend), which its checks must catch */
export const KEEPER_WAYS = { planned: true, stopToTurn: false };

/** the keeper talked to: he holds the hero in his eye (main.ts sets it as the talk card opens and closes) */
export const keeperTalk = { talking: false };

/** (switches for `lab tavern --canary`: his wipe reaching past the table's top, his broom's head swept 6 cm low) */
export const KEEPER_WIPES = { offTop: false, broomDip: false };
/** (switches for `lab tavern --canary`, round 5: his broom swept with both fists together before his belly, carried in
 *  the sweep's hold on his way to it, his rag shown flat on a top before his hand laid it there, his free hand held on
 *  the cask's hoop as he wipes it, a mug collected from the table's middle as he stood in its top) */
export const KEEPER_WAYS5 = { sweepTogether: false, carrySweeping: false, padEarly: false, caskSteady: false, intoTable: false, attendBunched: false, darkWater: false };
/** His watch on his own walks (round 5, "Got stuck while walking back"): a walk with no progress for `replanAfter` s
 *  is planned again round the heroes about, up to `replans` times, then given up for `resetAfter` s of no progress in
 *  all, when he's put back at his stand behind the bar, what he held put right (`resets` counts them, `lastReset` the
 *  last's cause). `wall`: the canary's wall dropped across the way in behind the bar's end. */
export const KEEPER_STUCK = { replanAfter: 2, replans: 3, resetAfter: 10, resets: 0, lastReset: '', wall: false };
/** (switches for `lab tavern --canary`: a mug never taken by standing close, nor by a click, nor lost at the door) */
export const KEEPER_TAKE = { near: true, click: true, door: true, toCounter: false, bothE: false };
/** a mug put down by a hero (round 5): how far past a top's edge his middle may be for it (m), how far in from the
 *  edge it's set (m), the shifts along the edge tried for a clear spot (m), how far from another mug or a candle it
 *  stands, and how long it takes from his hand to its place (s) */
const PUT_DOWN = { reach: 1.0, inset: 0.1, shifts: [0, 0.12, -0.12, 0.24, -0.24, 0.36, -0.36, 0.48, -0.48], apart: 0.12, takes: 0.3 };
/** how far along the broom from his upper hand its bristles' lowest tips reach (m: its head's foot and its splayed
 *  tufts, read by `lab tavern`), and how far into the floor they press as they sweep (m: the bristles bending) */
const BROOM_REACH = 1.41, BROOM_TOUCH = 0.002;
/** the broom carried upright at his side: his fist's place in his chest's frame (x to his left, y up, z ahead, m),
 *  the way its head hangs from it, and how far down the handle from its top he holds it (m: near its middle, its head
 *  just off the floor by his foot) */
// (his fist high enough that the broom hangs straight: tipped out from a lower fist, its handle's top tipped in at his
// head, `lab tavern`)
// (out past his thigh, its foot tipped a little further out: straight down by his side, his stride's thigh met it)
const BROOM_CARRY = { at: [0.36, -0.34, 0.1] as const, dir: [0.2, -1, 0.04] as const, along: 0.68 };
/** the broom as he sweeps with it: his top hand's place (m ahead of him, up, to his left), how far it's drawn across
 *  against the stroke, where the head sweeps from (ahead, to his left: below 0 his right) and how far across it swings
 *  either way, how far down the handle his lower hand is from his top one, and how far down from its end his top hand
 *  holds it (m) */
// (his top hand a little further out, the handle's end clear of his chest as he draws it across: at 0.3 it went 2.6 cm
// into it; his lower hand further down, his arm short of where it was sent: sent 42 cm down, it held 28, `lab tavern`)
export const SWEEP_HOLD = { top: [0.36, 1.2, 0.1] as const, draw: 0.05, head: [0.78, -0.3] as const, across: 0.24, apart: 0.5, grip: 0.06 };
/** how far over the floor a carried broom's lowest point is kept (m) */
const BROOM_CLEAR = 0.04;
/** how fast his fist slides along the broom's handle (m/s) */
const BROOM_SLIDE = 2.5;
/** how long he takes the broom from his carry into his sweeping hands before his first stroke (s) */
const BROOM_READY = 0.7;
/** how far he bends to the broom sweeping, and how much his knees give (keeper.ts `KeeperPose`) */
const SWEEP_BEND = 0.4, SWEEP_CROUCH = 0.12;
/** how far down its handle he takes the leaning broom (m: higher than he carries it, then let slide; reached for lower
 *  on it, his forearm crossed his belly) */
const BROOM_TAKEN_AT = 0.5;
/** how high a broom just taken up is lifted as he swings it to his side (m), and for how long (s) */
const BROOM_LIFT = 0.3, BROOM_LIFT_FOR = 0.6;
/** how far over a top the flat rag lies under his palm (m) */
const PAD_ON = 0.003;
/** a top he wipes: its height, and its edge (a disc's radius, or a box's half sizes), in the room */
interface Top { x: number; z: number; y: number; r?: number; hx?: number; hz?: number }
/** the bar's top as he wipes it */
const BAR_TOP: Top = { x: BAR.x, z: (BAR.from + BAR.to) / 2, y: BAR.top, hx: BAR.half, hz: (BAR.to - BAR.from) / 2 };
/** a table's top as he wipes it */
const tableTop = (name: keyof typeof TABLES): Top => ({ ...TABLES[name], y: TABLES[name].top });
/** how far inside a top's edge the rag's middle is kept (m: to its corners, so all of it lies on the top however it's
 *  turned) */
const PAD_INSIDE = 0.19;
/** `at` (room) brought within `top`, the rag's half width inside its edge */
function onTop(at: THREE.Vector3, top: Top): THREE.Vector3 {
  const out = at.clone();
  if (top.r !== undefined) {
    const dx = out.x - top.x, dz = out.z - top.z, d = Math.hypot(dx, dz), most = top.r - PAD_INSIDE;
    if (d > most) {
      out.x = top.x + (dx / d) * most;
      out.z = top.z + (dz / d) * most;
    }
  } else {
    out.x = clamp(out.x, top.x - top.hx! + PAD_INSIDE, top.x + top.hx! - PAD_INSIDE);
    out.z = clamp(out.z, top.z - top.hz! + PAD_INSIDE, top.z + top.hz! - PAD_INSIDE);
  }
  return out;
}
/** the way down a broom's handle from its upper hand at `grip` (world) so a point `reach` along it meets the floor,
 *  towards `toward` across the floor */
function broomDown(grip: THREE.Vector3, toward: THREE.Vector3, reach: number): THREE.Vector3 {
  const drop = Math.min(grip.y, reach * 0.999), out = Math.sqrt(reach * reach - drop * drop);
  const way = new THREE.Vector3(toward.x - grip.x, 0, toward.z - grip.z).normalize();
  return way.multiplyScalar(out).add(new THREE.Vector3(0, -drop, 0)).normalize();
}
/** how far under his palm the flat rag lies (m: the palm's place is 2.6 cm over the top, the cloth 4 mm on it) */
const PAD_UNDER = 0.022;
/** his rag laid on a top: how high over it his hand brings it from (m), how long his hand takes to come down (s), and
 *  how near the top his palm must be for the cloth to spread under it, and to stay spread (m) */
const RAG_LAY = { high: 0.14, takes: 0.4, lay: 0.045, keep: 0.05, across: 0.1 };
/** his rag spread on a top: a cloth twice a hand across, its edges round his fingers from any view, rumpled, one
 *  corner turned over (seeded) */
function padGeometry(): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(0.3, 0.22, 12, 9).rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const rumple = 0.003 * Math.sin(x * 61 + z * 23) + 0.002 * Math.sin(z * 83 - x * 17);
    const fold = x + z > 0.19 ? (x + z - 0.19) * 0.25 : 0;
    pos.setY(i, Math.max(0, rumple + 0.002) + fold);
  }
  geo.computeVertexNormals();
  return geo;
}
/** how long his hand is at his apron's pocket taking his rag out or putting it in (s) */
const RAG_FETCH = 0.35;
/** how near his apron's tie his right hand is for the rag to go in or come out with no reach for it (m) */
const RAG_NEAR = 0.25;
/** the wash tub's shape, its radius's shares: its outside at its rim and its foot, its inside at its rim and its foot,
 *  and its height (m) */
const TUB_SHAPE = { rim: 1, foot: 0.85, inRim: 0.9, inFoot: 0.78, high: 0.15 };
/** the share of the tub's radius its inside has at the water's level (`TUB.water` up its side) */
const TUB_INSIDE_AT_WATER = TUB_SHAPE.inFoot + (TUB_SHAPE.inRim - TUB_SHAPE.inFoot) * (TUB.water / TUB_SHAPE.high);

/** The wash tub of radius `r`, open (its foot at 0): its outside, its inside (facing in) and the ring of its rim. */
function tubGeometry(r: number): THREE.BufferGeometry[] {
  const { rim, foot, inRim, inFoot, high } = TUB_SHAPE;
  const outside = new THREE.CylinderGeometry(r * rim, r * foot, high, 18, 1, true).translate(0, high / 2, 0);
  const inside = facingIn(new THREE.CylinderGeometry(r * inRim, r * inFoot, high, 18, 1, true).translate(0, high / 2, 0));
  const top = new THREE.RingGeometry(r * inRim, r * rim, 18).rotateX(-Math.PI / 2).translate(0, high, 0);
  const floor = new THREE.CircleGeometry(r * inFoot, 18).rotateX(-Math.PI / 2).translate(0, 0.005, 0);
  return [outside, inside, top, floor];
}

/** `geo` turned inside out: its faces wound the other way and its normals reversed, so it's seen from within. */
function facingIn(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const index = geo.index!;
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i + 1);
    index.setX(i + 1, index.getX(i + 2));
    index.setX(i + 2, a);
  }
  const normal = geo.attributes.normal;
  for (let i = 0; i < normal.count; i++) normal.setXYZ(i, -normal.getX(i), -normal.getY(i), -normal.getZ(i));
  return geo;
}

/** the share of its soapy tint the tub's water gives of itself: a little, so it reads as water in the bar's dim light
 *  and not as a hole (the room's lamps are warm and low, and the counter's top shades it) */
const WATER_GLOW = 0.22;
/** the tub's water's colours: under the tub's wall, its open middle, and the sheen of the lamps laid across it */
const WATER_SHADE = new THREE.Color(0x56675f), WATER_OPEN = new THREE.Color(0x9fb3ab), WATER_SHEEN = new THREE.Color(0xdde8e2);

/** The tub's water, a disc of radius `r` (its middle at 0) in rings, coloured by them: darker toward its rim where
 *  the tub's wall shades it, paler in the open, and a soft sheen off-middle where a lamp catches it. */
function waterGeometry(r: number): THREE.BufferGeometry {
  const geo = new THREE.RingGeometry(r * 0.02, r, 28, 6).rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, colours: number[] = [], colour = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / r, z = pos.getZ(i) / r;
    const out = Math.hypot(x, z);
    colour.copy(WATER_OPEN).lerp(WATER_SHADE, Math.max(0, (out - 0.55) / 0.45) ** 1.5);
    const sheen = Math.exp(-(((x + 0.3) ** 2) + ((z - 0.15) ** 2)) / 0.08);
    colour.lerp(WATER_SHEEN, sheen * 0.8);
    colours.push(colour.r, colour.g, colour.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  return geo;
}

/** the suds on the tub's water: a ring of small heaps round its rim and a few clumps on it (its middle at 0, its
 *  radius `r`, seeded) */
function sudsGeometry(r: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  let seed = 11;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const heap = (x: number, z: number, size: number) => parts.push(new THREE.SphereGeometry(size, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 1).translate(x, 0, z));
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + random() * 0.2;
    heap(Math.cos(a) * r * (0.84 + random() * 0.1), Math.sin(a) * r * (0.84 + random() * 0.1), 0.014 + random() * 0.012);
  }
  for (let i = 0; i < 9; i++) {
    const a = random() * Math.PI * 2, at = r * Math.sqrt(random()) * 0.6;
    heap(Math.cos(a) * at, Math.sin(a) * at, 0.01 + random() * 0.016);
  }
  return mergeGeometries(parts);
}
/** how long the mug glides on across the bar after his hand lets it go (s) */
const GLIDE = 0.3;
/** how far in from the bar's front edge a mug stands, slid to a hero or set down by one (m) */
const REST_IN = 0.09;
/** how far his middle keeps from the bar's and the back counter's faces and a table's edge (m: his hips and belly
 *  clear of them as he leans over; from play, "when he leans in to grab the cup, he goes through the table") */
const BODY_CLEAR = 0.3;
/** how far in from his edge of the bar he draws a far mug before taking it up (m), and the draw's parts (shares of
 *  its step): his hand come behind the mug by the first, the mug drawn in by the second */
// (drawn to a forearm's length from his edge of the bar: drawn nearer, taken round its body, his forearm met his belly)
const DRAWN_IN = 0.22, DRAW_IN = [0.4, 0.95] as const;
/** how near his way's end he stops turning to his way as he walks (m) */
const HOLD_HEADING = 0.18;
/** how far along the bar from a mug he stands to take it in his left hand (m: facing west across the bar his left is
 *  towards +z, the room's front), and the furthest along the bar towards its back he can stand behind it (m, z: the
 *  floor's plan ends past it) */
const MUG_ASIDE = 0.14, BEHIND_BAR_FROM = BAR.from + 0.9;
/** how high over a mug his hand comes as it reaches for it, before it comes down round it (m) */
const REACH_OVER = 0.14;
/** how far his hips may turn past a planted foot before he slows his turn for it (rad) */
const FEET_LAG_MOST = 0.45;
/** how fast his turn gathers speed (rad/s²), and how near his heading it eases off (per s: its speed this times the
 *  angle left) */
const TURN_ACCEL = 10, TURN_EASE = 5;
/** how much nearer his way's end counts as progress (m), how often he looks for a hero on his way (s), and how far
 *  ahead along it (m) */
const STUCK_PROGRESS = 0.1, STUCK_LOOK_EVERY = 0.5, STUCK_AHEAD = 1.2;
/** his hips' half width (m): how far from a counter his middle may come at the closest */
const HIPS_HALF = 0.12;
/** how far out from a table's edge he stands to take up a mug at its side (m: his middle) */
const TABLE_STAND = 0.32;
/** how far his middle keeps off a table's top whatever his way (m: his thigh clear of its edge as he turns from it; at
 *  his hips' half width, his thigh went 3 cm into the small table's top walking off from it, `lab tavern`) */
const TABLE_KEEP = 0.3;
/** how far his middle keeps off a table's top as his ways pass it (m: his striding thigh clear of its edge) */
const TABLE_WALK = 0.3;
/** how far his middle keeps from a stool's or a bench's circle where he stands at a table (m: his way's room) */
const SEAT_ROOM = 0.4;
/** how far his middle keeps off a stool's or a bench's circle as he leans in to reach a mug (m: by his hips' half width,
 *  he stood 12 cm off the long table's bench and walked off from there, `lab tavern`) */
const SEAT_KEEP = 0.17;
/** the bar's and the back counter's footprints (room m), and how far his middle keeps from each: the bar's top is at
 *  his elbows' height, so his elbows' half width (walking by it at his hips' half width, his elbow brushed its top's
 *  corner, `lab tavern`); the back counter's is under them, so his hips' */
const COUNTERS = [
  { x0: BAR.x - BAR.half, x1: BAR.x + BAR.half, z0: BAR.from, z1: BAR.to, keep: 0.32 },
  { x0: BACK.front, x1: BACK.wall, z0: BACK.from, z1: BACK.to, keep: 0.14 },
] as const;
/** the share of the hero's drink at which his hand has the mug (models/flask.ts `ALE_KEYS.out`) */
const TAKEN = 0.085;
/** the share of the drink it's held at while he chooses to drink or put it down (the mug lifted off the top before
 *  him), and how far from a mug's middle he takes it up (m, from his feet) */
const HOLD_AT = 0.16, MUG_REACH = 1.3;
/** how far to his right (m, along the bar) his left hand follows a mug it pushes across */
const PUSH_ACROSS = 0.08;
/** how far off a mug the pointer is on may be to be outlined and walked to by a click (m), and how near he stands to
 *  one to take it by E with the pointer on nothing (m) */
const POINTED_MOST = 8, MUG_NEAR = 1;
/** how near the pointer a mug is drawn for it to be the one pointed at (a share of the window's height) */
const MUG_PICK = 0.035;
/** how much further back than `REACH_X` he stands to wipe the bar (m) */
const WIPE_BACK = 0.03;
/** how far behind the bar he stands to reach a mug at its front (m: leaning over it) */
const REACH_X = BAR.x + BAR.half + BODY_CLEAR;
/** how near his hand must come to a mug to take it up or let it go (m), and how long he leans and steps in for it
 *  before he does anyway (s) */
const HAND_AT = 0.04, REACH_LONGEST = 2.5;
/** how far he may have moved since his body was last posed before his feet are set under him afresh (m: posed every
 *  frame he goes under 2 cm a frame, so this is a move made while the tavern wasn't shown) */
const STEPPED_AWAY = 0.06;
/** how fast his look-ahead lengthens again past a corner (m/s) */
const LOOK_EASE = 1;
/** the most his walk goes off the way he faces (rad) */
const SIDE_MOST = 0.35;
/** how often the host tells its guests where his body is (s) */
const TOLD_EVERY = 0.1;

/** A step of his work: a walk to a place, or something done at one (or along a way, `along`), over `dur` s. */
interface Step {
  name: string;
  /** a walk's end, or where the work is done (his feet there, turned its way) */
  spot: Spot;
  /** work done walking slowly from `spot` to here (the bar wiped along its length, the floor swept) */
  along?: Spot;
  walk?: boolean;
  dur: number;
  /** his body over the step, at `k` (0..1) of it and `t` s in */
  pose?: (k: number, t: number) => Partial<KeeperPose>;
  /** what happens at a share of it (a mug taken, set down), each once */
  at?: [number, () => void][];
  /** where his left hand must be for what happens at its middle (a mug taken up or set down): held there, leaning
   *  and stepping in, till it is */
  reachFor?: () => THREE.Vector3;
}

/** The tavern's keeper as the room holds him. */
export interface TavernKeeper {
  /** him built and stood behind the bar (once) */
  /** him seated a piece at a time (models/steps.ts), as the tavern is first walked into (game/rooms.ts `folkComing`) */
  seatSteps(): Generator<void | PromiseLike<unknown>, void, undefined>;
  /** his work moved on, whether the tavern is shown or not (the host serves a guest in it from outside) */
  always(dt: number): void;
  /** the keeper, once seated (tools/lab `tavern`) */
  keeper(): Keeper | undefined;
  /** ale asked for by `hero` (this game's own): false if he isn't seated */
  serve(hero: Player): boolean;
  /** the mugs' ledger (tools/lab `tavern`) */
  readonly mugs: MugLedger;
  /** whether mug `id` is on its way down from a hero's hand to the top he set it on (the lab's mugs in the air) */
  settles(id: number): boolean;
  /** what he's doing (the lab: its step's name, and the job's) */
  doing(): { job: string; step: string; jumped: string; where: string; offered: string; broom: string; sweepPosed: boolean; walking: boolean; speed: number; goal: [number, number] | null; wayLeft: number; downSaid: string };
  /** what his body was last asked (the lab reads his hands against it) */
  body(): KeeperPose;
  /** where a mug is drawn now (world), and its mesh, for the lab */
  mugAt(id: number): THREE.Vector3;
  mugMesh(id: number): THREE.Object3D;
  /** the next of his idle tasks set (the lab's pictures of each) */
  setTask(name: string): void;
  /** the way he'd walk from `from` to `to` (room m: the lab's paths against the furniture) */
  way(from: Point, to: Point): Point[];
  /** the host's game tells its guests nothing more (the lab's canary: a guest's mug must then never reach it) */
  mute(): void;
}

/** The keeper, his mugs, his tub, his broom and poker added to the tavern being built (`b`). */
export function tavernKeeper(b: Build, talking: () => boolean): TavernKeeper {
  const { g, M } = b;
  const kit = createKit(0xffc27a);
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  /** a point of the room (its own metres) in the world */
  const W = (x: number, y: number, z: number) => g.localToWorld(new THREE.Vector3(x, y, z));
  const room = (v: THREE.Vector3) => g.worldToLocal(v.clone());

  // --- the cask on the bar at his left as he stands at the tap: lying across the bar, iron-hooped, its brass tap at his end ---
  const near = BAR.x + BAR.half, tap = V(near - 0.12, BAR.top + 0.22, PLACES.tap.z + 0.34);
  {
    const cask = drum(g, 0.15, 0.15, 0.4, 0, 0, 0, M.oak, 16);
    cask.rotation.z = Math.PI / 2;
    cask.position.set(near - 0.38, BAR.top + 0.17, tap.z);
    for (const dx of [0.25, 0.38, 0.51]) {
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.153, 0.006, 5, 24).rotateY(Math.PI / 2), M.iron);
      hoop.position.set(near - dx, BAR.top + 0.17, tap.z);
      g.add(hoop);
    }
    for (const dx of [0.26, 0.5]) box(g, 0.05, 0.05, 0.3, near - dx, BAR.top, tap.z, M.timber);
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.08, 10).rotateZ(Math.PI / 2), M.brass);
    spout.position.set(near - 0.16, tap.y + 0.012, tap.z);
    g.add(spout);
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.04, 8), M.brass);
    nozzle.position.set(tap.x, tap.y - 0.008, tap.z);
    g.add(nozzle);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.07, 0.016), M.brass);
    handle.position.set(tap.x + 0.01, tap.y + 0.05, tap.z);
    g.add(handle);
    b.obstacles.push({ x: near - 0.38, z: tap.z, r: 0.2, h: BAR.top + 0.33 });
  }
  // --- the back counter against the east wall under the bottles: his clean mugs in a row, the wash tub ---
  const backX = (BACK.front + BACK.wall) / 2;
  box(g, BACK.wall - BACK.front, BACK.top - 0.04, BACK.to - BACK.from, backX, 0, (BACK.from + BACK.to) / 2, M.panel);
  box(g, BACK.wall - BACK.front + 0.04, 0.04, BACK.to - BACK.from + 0.04, backX, BACK.top - 0.04, (BACK.from + BACK.to) / 2, M.oak);
  // (open: a closed drum's oak lid stood 5 cm over the water and was the dark disc seen in the tub, Kenneth's round 4)
  for (const wall of tubGeometry(TUB.r)) {
    const mesh = new THREE.Mesh(wall, M.oak);
    mesh.position.set(backX, BACK.top, TUB.z);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
  }
  for (const y of [0.03, 0.12]) {
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(TUB.r * (0.88 + y * 0.8), 0.005, 5, 24).rotateX(Math.PI / 2), M.iron);
    hoop.position.set(backX, BACK.top + y, TUB.z);
    g.add(hoop);
  }
  // (open, its soapy water seen a hand below the rim from every view, its suds round the rim and a few heaps on it,
  // rippling and bubbling as he scrubs: "lets just have the lid removed the entire time. Should be able to see water
  // there", Kenneth's round 4; round 3's lid he lifted to wash is gone)
  // (a pale soapy grey-green, shaded darker under the tub's wall and lit by a sheen off the bar's lamps: a glossy dark
  // disc mirrors nothing here, the engine giving the room no sky to mirror, and read as a hole in the tub)
  const water = new THREE.Mesh(waterGeometry(TUB.r * TUB_INSIDE_AT_WATER), kit.std({
    color: 0xffffff, vertexColors: true, roughness: 0.32, metalness: 0,
    emissive: 0x6f8c84, emissiveIntensity: WATER_GLOW,
  }));
  water.position.set(backX, BACK.top + TUB.water, TUB.z);
  const suds = new THREE.Mesh(sudsGeometry(TUB.r * TUB_INSIDE_AT_WATER), kit.std({ color: 0xe8ecea, roughness: 0.35 }));
  suds.position.copy(water.position);
  /** how stirred the water is (1 as he scrubs, settling after), and its clock */
  let stirred = 0, waterT = 0;
  /** the water rippling while it's stirred, calm once it settles: its surface rocked and its suds turned a little */
  const waterLook = water.material as THREE.MeshStandardMaterial, waterWas = waterLook.color.getHex();
  const rippleWater = (dt: number) => {
    // (the canary's: the water dark as it was, a disc read as the tub's lid)
    waterLook.color.setHex(KEEPER_WAYS5.darkWater ? 0x2a3230 : waterWas);
    waterLook.emissiveIntensity = KEEPER_WAYS5.darkWater ? 0 : WATER_GLOW;
    stirred = Math.max(0, stirred - dt * 0.8);
    waterT += dt;
    const lap = stirred * 0.004 * Math.sin(waterT * 11);
    water.position.y = BACK.top + TUB.water + lap;
    water.rotation.set(stirred * 0.03 * Math.sin(waterT * 7), 0, stirred * 0.03 * Math.cos(waterT * 9));
    suds.position.y = water.position.y;
    suds.rotation.y += dt * stirred * 0.6;
  };
  /** his rag flat on a top as he wipes it, shown where the frame's pose asked (`padAt`, world) */
  // (a pale linen against the dark wood, and drawn from the first: hidden by its size, as a mug in a hand is, so its
  // pipeline is made with the room's)
  const pad = new THREE.Mesh(padGeometry(), kit.std({ color: 0xf2eadb, roughness: 0.95, side: THREE.DoubleSide }));
  pad.name = 'keeper rag flat';
  pad.scale.setScalar(0.0001);
  let padAt: THREE.Vector3 | null = null, padTurn = 0;
  /** the top this frame's pose wipes and where its palm goes on it (world), how far his hand has come down to it (0 to
   *  1), and whether the cloth lay spread under it last frame */
  let padWanted: { top: Top; at: THREE.Vector3 } | null = null, layShare = 0, padLaid = false;
  const padHands: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(), new THREE.Vector3()];
  // --- the broom leaning by the bar's end, the poker against the hearth ---
  const wood = kit.std({ color: 0x6a4a2a, roughness: 0.75 });
  const straw = kit.std({ color: 0xb89a58, roughness: 1 });
  const iron = kit.std({ color: 0x2e2c2a, metalness: 0.8, roughness: 0.5 });
  /** the broom: its origin where his upper hand holds it, its bristles out along +y (world/tavernBroom.ts) */
  const broomBody = buildBroom({
    wood, straw, iron,
    worn: kit.std({ color: 0x8a6a44, roughness: 0.45 }),
    twine: kit.std({ color: 0x5a4430, roughness: 0.95 }),
  });
  /** the poker: its origin at its grip, its point out along +y */
  const poker = new THREE.Group();
  poker.name = 'poker';
  {
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.78, 6).translate(0, 0.36, 0), iron);
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.005, 5, 10, Math.PI).translate(0.03, 0.75, 0), iron);
    const grip = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.006, 5, 12).translate(0, -0.05, 0), iron);
    poker.add(rod, hook, grip);
  }
  const stand = (thing: THREE.Object3D, foot: { x: number; z: number }, top: THREE.Vector3, length: number) => {
    // (leaning: its far end on the floor at `foot`, its near end against `top`; its origin `length` back from its foot)
    const down = new THREE.Vector3(foot.x, 0, foot.z).sub(top).normalize();
    thing.quaternion.setFromUnitVectors(V(0, 1, 0), down);
    thing.position.set(foot.x, 0, foot.z).addScaledVector(down, -length);
  };
  /** the way a tool leans in its corner, its +y down to its foot (world) */
  const leanOf = (tool: 'broom' | 'poker'): THREE.Vector3 => {
    const [foot, top] = tool === 'broom' ? [V(BROOM_AT.x - 0.18, 0, BROOM_AT.z), V(BROOM_AT.x + 0.06, 1.42, BROOM_AT.z)] : [V(POKER_AT.x, 0, POKER_AT.z + 0.12), V(POKER_AT.x, 0.86, POKER_AT.z - 0.12)];
    return W(...foot.toArray()).sub(W(...top.toArray())).normalize();
  };
  /** the broom as his hand holds it: the broom itself within, slid along its handle so his fist is at its top as he
   *  sweeps and near its middle as he carries it (`broomGrip`, eased), and leaning in its corner at its top */
  const broom = new THREE.Group();
  broom.name = 'broom grip';
  broom.add(broomBody);
  let broomGrip = 0, broomHeldFor = 0;
  /** where along the broom his fist is (m from its top, eased towards `want` at a hand's slide) */
  const slideBroom = (want: number, dt: number) => {
    broomGrip += clamp(want - broomGrip, -BROOM_SLIDE * dt, BROOM_SLIDE * dt);
    broomBody.position.y = -broomGrip;
  };
  /** his hold moved along the broom to `along` from its top at once, the broom where it is (the holder moved with it):
   *  taken from its corner and put back there at its middle */
  const regripBroom = (along: number) => {
    broom.position.add(V(0, 1, 0).applyQuaternion(broom.quaternion).multiplyScalar(along - broomGrip));
    broomGrip = along;
    broomBody.position.y = -broomGrip;
  };
  /** the leaning broom's point `along` from its top (room) */
  const leaningAt = (along: number) => {
    const foot = V(BROOM_AT.x - 0.18, 0, BROOM_AT.z), down = foot.clone().sub(V(BROOM_AT.x + 0.06, 1.42, BROOM_AT.z)).normalize();
    return foot.addScaledVector(down, along - BROOM_REACH);
  };
  /** The broom held as a sweeper holds it, its head `swing` across (-1 to 1) a pace before him: his left hand at its top
   *  before his chest, his right a forearm's length down it, both well out before him (his right hand crossed his chest
   *  to reach it at 0.28 ahead, `lab tavern`); laid so its bristles' lowest tips just meet the floor from where his fist
   *  is (aimed at a point on the floor nearer than its length, its head went 17 cm into the boards, "too low to the
   *  ground", Kenneth's round 4; laid from where his fist was sent, it rose and sank 30 cm as his hand lagged). */
  // (as a man sweeps: his top hand near the handle's end before his chest to his left, his lower hand well down it, the
  // broom across him to its head on the floor before his right foot, the stroke from his arms swinging the head across
  // and his top hand drawn the other way a little: held with both fists a hand apart before his belly, one elbow out,
  // "That's not how you hold a broom during brooming", Kenneth's round 5)
  const sweepHold = (swing: number): Pick<KeeperPose, 'left' | 'right'> => {
    const [topAhead, topHigh, topAside] = SWEEP_HOLD.top, [headAhead, headAside] = SWEEP_HOLD.head;
    const together = KEEPER_WAYS5.sweepTogether;
    sweepPosed = true;
    const grip = together ? ahead(0.45, 1.12, 0.16) : ahead(topAhead, topHigh, topAside - SWEEP_HOLD.draw * swing);
    const head = together ? ahead(0.85, 0, 0.26 * swing) : ahead(headAhead, 0, headAside + SWEEP_HOLD.across * swing);
    const fist = holding === 'broom' ? broom.getWorldPosition(new THREE.Vector3()) : grip;
    const dir = broomDown(fist, head, BROOM_REACH - broomGrip);
    const floor = { reach: BROOM_REACH - broomGrip, level: W(0, 0, 0).y - BROOM_TOUCH - (KEEPER_WIPES.broomDip ? 0.06 : 0), touch: true };
    const apart = together ? 0.12 : SWEEP_HOLD.apart;
    return {
      left: { at: grip, held: broom, r: 0.016, dir, floor },
      right: { at: grip.clone().addScaledVector(dir, apart), r: 0.016, on: { thing: broom, along: apart } },
    };
  };
  const leanBroom = () => {
    broomGrip = 0;
    broomBody.position.y = 0;
    stand(broom, { x: BROOM_AT.x - 0.18, z: BROOM_AT.z }, V(BROOM_AT.x + 0.06, 1.42, BROOM_AT.z), BROOM_REACH);
  };
  const leanPoker = () => stand(poker, { x: POKER_AT.x, z: POKER_AT.z + 0.12 }, V(POKER_AT.x, 0.86, POKER_AT.z - 0.12), 0.78);
  // --- the ale running from the tap as he fills a mug: a thin amber stream ---
  const ale = kit.std({ color: 0xc07a18, emissive: 0x3a1c00, emissiveIntensity: 0.4, roughness: 0.2 });
  const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.006, 0.12, 8).translate(0, -0.06, 0), ale);
  stream.position.set(tap.x, tap.y - 0.025, tap.z);
  stream.scale.setScalar(0.001);
  // --- the mugs: one mesh each for the ledger's six ---
  const ledger = new MugLedger();
  const meshes = ledger.mugs.map(() => buildMug(kit));

  let keeper: Keeper | undefined;
  /** his place on the floor (the room's) and his turn, the frame's speed and what his body is asked */
  const me: { x: number; z: number; facing: number; speed: number } = { x: PLACES.tap.x, z: PLACES.tap.z, facing: PLACES.tap.facing, speed: 0 };
  let body: KeeperPose = { speed: 0, bend: 0, crouch: 0, look: null, left: null, right: null };
  /** the steps ahead of him, the one under way and how far in, and the job they make */
  /** his walk's watch: the least of its way left so far, how long it's gone without progress since its last plan and
   *  in all, the plans tried again, and how long since he last looked for a hero in his way (s) */
  const stuck = { bestLeft: Infinity, nearest: Infinity, still: 0, lost: 0, tries: 0, since: 0, left: 0, replanned: false };
  let jumped = '', reaching = 0, plan: Step[] = [], step: Step | null = null, stepT = 0, pace = 0, job = 'attend', route: [number, number][] = [], routeAt = 0, steppingOut = false, lookLength = 0.16, fired = new Set<number>();
  /** the asks for ale waiting (heroes' ids), the mug in his hand, the one he's sliding, the tools he holds */
  const asked: string[] = [];
  /** the velocity the brain is taking him to this frame (room m/s), told to his legs (`KeeperPose.goal`) */
  const goalV = { x: 0, z: 0 };
  /** his velocity over the floor (room m/s), moved on towards `goalV` as a hero's body is, pushing and braking
   *  against the ground (entities/movement.ts): the heroes' gait plans his strides by that same motion */
  const vel = { x: 0, z: 0 };
  /** a step's way along (sweeping, the bar wiped as he goes): its velocity this frame */
  const alongV = { x: 0, z: 0 };
  /** mugs a hero has just set down, carried from his hand (room m) to their place, and for how long so far (s) */
  const settling = new Map<number, { from: THREE.Vector3; t: number }>();
  let inHand = -1, sliding: { id: number; from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; for: string } | null = null;
  /** a mug on the bar drawn in across its top under his hand, where it is now (room m) */
  let drawing: { id: number; x: number; z: number } | null = null;
  let holding: 'broom' | 'poker' | null = null, attendFor = 0, saidAt = -99, clock = 0;
  /** whether he's swept a stroke since he took up the broom (his walks between strokes keep the sweep's hold) */
  let swept = false;
  /** whether this frame's pose held the broom as he sweeps (the lab reads it against his carry) */
  let sweepPosed = false;
  const forced: string[] = [];
  let toldAt = 0, guestFrame: Record<string, number[]> | null = null;

  // --- where things are drawn: each mug by the ledger (in his hand his own, in a hero's his model's) ---
  const shelfAt = (slot: number) => V(backX - 0.06, BACK.top + MUG.foot, SHELF_SLOTS[slot]);
  const tubAt = () => V(backX, BACK.top + 0.05, TUB.z);
  function drawMug(m: Mug): void {
    const mesh = meshes[m.id];
    setMugFill(mesh, m.full);
    if (m.id === inHand && keeper) return;
    if (sliding?.id === m.id) return;
    if (drawing?.id === m.id) {
      mesh.position.set(drawing.x, BAR.top + MUG.foot, drawing.z);
      return;
    }
    if (mesh.parent !== g) g.attach(mesh);
    mesh.quaternion.identity();
    const p = m.place;
    const shown = p.at !== 'hero' || stillReached(m);
    mesh.scale.setScalar(shown ? 1 : 0.0001);
    if (p.at === 'shelf') mesh.position.copy(shelfAt(p.slot));
    else if (p.at === 'bar') mesh.position.set(p.x, BAR.top + MUG.foot, p.z);
    else if (p.at === 'table') mesh.position.set(p.x, p.y + MUG.foot, p.z);
    else if (p.at === 'tub') mesh.position.copy(tubAt());
    // (set down from his hand: carried down to its place over a moment, never shown there at once)
    const settle = settling.get(m.id);
    if (settle && (p.at === 'bar' || p.at === 'table')) {
      const k = smooth(Math.min(1, settle.t / PUT_DOWN.takes));
      mesh.position.lerpVectors(settle.from, mesh.position.clone(), k);
      if (k >= 1) settling.delete(m.id);
    } else if (settle) settling.delete(m.id);
  }

  // --- a step's body: his hands and lean, his feet where the step has them ---
  /** a body at rest, a step's pose spread over it */
  const BODY0: KeeperPose = { speed: 0, bend: 0, crouch: 0, look: null, left: null, right: null };
  const ahead = (fwd: number, y: number, side = 0) => {
    const f = me.facing;
    return W(me.x + Math.sin(f) * fwd + Math.cos(f) * side, y, me.z + Math.cos(f) * fwd - Math.sin(f) * side);
  };
  const towards = (from: { x: number; z: number }, to: { x: number; z: number }) => Math.atan2(to.x - from.x, to.z - from.z);
  /** a way in the world from his own facing: `fwd` ahead, `up`, `side` to his left */
  const dirAhead = (fwd: number, up: number, side: number): THREE.Vector3 => {
    const f = me.facing;
    return W(Math.sin(f) * fwd + Math.cos(f) * side, up, Math.cos(f) * fwd - Math.sin(f) * side).sub(W(0, 0, 0)).normalize();
  };
  // (along the bar's whole length behind it: held to the back counter's, a mug near the bar's far end lay at his right
  // and his left hand crossed his belly for it, `lab tavern`)
  const behindBar = (z: number, x: number = PLACES.tap.x): Spot => ({ x, z: clamp(z, BEHIND_BAR_FROM, BAR.to + 0.1), facing: -Math.PI / 2 });
  const mugHold = (at: THREE.Vector3): HandGoal => ({ at, held: meshes[inHand], r: MUG.gripR });
  /** a hand closing round a mug it hasn't taken yet, as it will hold it (at its middle, world) */
  const mugGrip = (at: THREE.Vector3): HandGoal => ({ at, grip: true, r: MUG.gripR });
  const ragHold = (at: THREE.Vector3, dir?: THREE.Vector3): HandGoal => ({ at, held: keeper!.rag, r: 0.022, dir });
  /** his rag pressed under his palm, his fist over it knuckles forward (its axis across him): wiping */
  /** his rag laid flat under his palm on a top he wipes (`at`, world, the palm's place), its bunch in his fist hidden
   *  meanwhile: held bunched, it went into the top out of sight ("the cloth visible", Kenneth's round 3) */
  // (brought down onto the top from a hand over it as he begins, the cloth spread under his palm once his hand is down
  // on it, and lifted off with it as his hand leaves: shown flat at once where his hand was going, it was on the table
  // before he'd put it there, "he should be the one placing the cloth on the table, not it just appearing", Kenneth's
  // round 5)
  const wiping = (at: THREE.Vector3, top: Top): HandGoal => {
    // (the canary's wipe past the table left where it reaches)
    const on = KEEPER_WIPES.offTop ? room(at) : onTop(room(at), top);
    on.y = top.y + PAD_UNDER + PAD_ON;
    padWanted = { top, at: W(on.x, on.y, on.z) };
    const hand = W(on.x, on.y + RAG_LAY.high * (1 - smooth(layShare)), on.z);
    // (its bunch in his fist as it rests there, seen as he lays it and lifts it: turned to the top's way, it spun round
    // in his fist as he walked off, `lab tavern`)
    return ragHold(hand);
  };
  const say = (text: string) => {
    if (clock - saidAt < 1.5) return;
    saidAt = clock;
    const head = W(me.x, 2.15, me.z);
    floatText(head.x, head.y, head.z, text, 'info', '#ffe0a0');
  };

  /** his broom and poker carried as he walks: his hand at his side, the thing angled ahead and out past his leg, its
   *  end clear of the floor (the broom hung straight down before his thigh, its stick through his legs as he walked) */
  /** in his chest's frame (x to his left, y up, z ahead: keeper.ts `HandGoal.carried`), as a hero's weapon is held */
  const onChest = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const CARRY = {
    // (upright at his side, its handle's top in his fist by his shoulder and its head just off the floor beside his foot,
    // as a broom is carried: held out before him down to the floor it was a cane, "Thats not how you carry a broom",
    // Kenneth's round 4)
    broom: (): HandGoal => ({
      // (lifted as it's first taken up and swung to his side, then let down there: brought straight across before him,
      // its foot swept through his thigh, `lab tavern`)
      at: onChest(...BROOM_CARRY.at).add(V(0, BROOM_LIFT * Math.max(0, 1 - broomHeldFor / BROOM_LIFT_FOR), 0)),
      held: broom, r: 0.016, dir: onChest(...BROOM_CARRY.dir).normalize(), carried: true,
      // (straight down wherever its foot clears the floor, tipped out only as far as it must where it wouldn't)
      floor: { reach: BROOM_REACH - broomGrip, level: W(0, 0, 0).y + BROOM_CLEAR, touch: false },
    }),
    poker: (): HandGoal => ({ at: onChest(-0.3, -0.4, 0.12), held: poker, r: 0.012, dir: onChest(-0.15, -0.6, 0.78).normalize(), carried: true }),
    // (a mug at his left side, his forearm forward from the elbow: held before his belly, his forearm went through it,
    // "cup and arm goes through the body")
    // (before him a little to his left: at his side, his elbow brushed the bar walking behind it)
    // (carried a little higher, his elbow clear over the back counter's top walking the aisle: at 24 cm under his chest
    // joint his elbow hung at the top's height and went 3 cm into it, `lab tavern`)
    mug: (): HandGoal => ({ ...mugHold(onChest(0.17, -0.12, 0.3)), carried: true }),
  };

  // --- his steps ---
  const walkTo = (spot: Spot, name = 'walk'): Step => ({ name, spot, walk: true, dur: 0 });
  /** Mug `id` taken up in his left hand, if it's still where he went for it (`from`); else his job given up, to be
   *  thought again: handed to a hero or moved meanwhile, he took it from the hero's hand (`lab tavern`'s every mug
   *  out). */
  const takeUp = (id: number, from: readonly string[], set?: { full?: number; dirty?: boolean }): void => {
    if (!from.includes(ledger.get(id).place.at) || inHand >= 0) {
      plan = [];
      step = null;
      return;
    }
    inHand = id;
    keeper!.carry('left', meshes[id]);
    ledger.move(id, { at: 'keeper' }, set);
  };
  /** a mug taken from the back counter (empty) */
  const takeFromShelf = (id: number): Step[] => {
    const slot = (ledger.get(id).place as { slot: number }).slot;
    const spot: Spot = { x: PLACES.mugs.x, z: SHELF_SLOTS[slot], facing: Math.PI / 2 };
    return [walkTo(spot), {
      name: 'take', spot, dur: TASK.take,
      pose: (k) => ({ bend: 0.15, look: W(...shelfAt(slot).toArray()), left: inHand === id ? mugHold(shelfAt(slot).clone().setY(BACK.top + MUG.foot + 0.12 * smooth(k * 2 - 1)).applyMatrix4(g.matrixWorld)) : mugGrip(W(...shelfAt(slot).toArray())) }),
      at: [[0.5, () => takeUp(id, ['shelf'], { full: 0, dirty: false })]],
      reachFor: () => W(...shelfAt(slot).toArray()),
    }];
  };
  /** filled at the tap, set down and pushed across the bar to `hero` */
  /** where he stands to pour: the cask's tap just at his left before him, so his right hand meets its handle without
   *  crossing his body (stood at his serving spot, the tap at his side, his right forearm went through his chest) */
  const pourAt: Spot = { ...PLACES.tap, z: tap.z - 0.12 };
  const pourAndSlide = (id: number, hero: string): Step[] => [walkTo(pourAt), {
    name: 'pour', spot: pourAt, dur: TASK.pour,
    pose: (k) => {
      const filling = clamp((k - 0.15) / 0.7, 0, 1);
      ledger.fill(id, filling);
      stream.scale.setScalar(k > 0.15 && k < 0.85 ? 1 : 0.001);
      return { bend: 0.1, look: W(tap.x, tap.y - 0.1, tap.z), left: mugHold(W(tap.x, tap.y - 0.05 - MUG.up, tap.z)), right: { at: W(tap.x + 0.01, tap.y + 0.05, tap.z), grip: true, r: 0.009 } };
    },
    at: [[0.15, () => sfx.alePour(TASK.pour * 0.7)], [0.9, () => stream.scale.setScalar(0.001)]],
  }, {
    name: 'slide', spot: pourAt, dur: TASK.slide,
    pose: (k) => {
      const set = V(near - 0.1, BAR.top + MUG.foot, me.z);
      if (k < 0.35) return { bend: 0.2, look: W(...set.toArray()), left: mugHold(W(...set.toArray())) };
      const push = sliding ? sliding.from.clone().lerp(sliding.to, 0.45 * smooth((k - 0.35) / 0.4)) : set;
      // (his open hand behind it only as far across his front as his left arm reaches without crossing his chest, the
      // mug gliding on alone: followed all the way to a hero at his right, his forearm went into his chest, `lab tavern`)
      const hand = V(push.x + 0.1, push.y + 0.02, Math.max(push.z, me.z - PUSH_ACROSS));
      return { bend: 0.35 * smooth(Math.min(1, k * 2)), look: W(...push.toArray()), left: { at: W(...hand.toArray()) } };
    },
    at: [[0.35, () => {
      // (set down on the bar: from here his open hand pushes it, and it glides on to the bar's front before the hero)
      const towardsHero = heroById(hero), z = clamp(towardsHero?.pos.z ?? me.z, BAR.from + 0.2, BAR.to - 0.15);
      const to = V(BAR.x - BAR.half + REST_IN, BAR.top + MUG.foot, z);
      keeper!.drop(meshes[id], g);
      inHand = -1;
      ledger.move(id, { at: 'bar', x: to.x, z: to.z }, { full: 1, for: hero });
      sliding = { id, from: V(near - 0.1, BAR.top + MUG.foot, me.z), to, t: 0, dur: TASK.slide * 0.4 + GLIDE, for: hero };
      sfx.mugSlide(sliding.dur);
    }]],
  }];
  /** a left mug taken up from the bar or a table */
  const collect = (id: number): Step[] => {
    const p0 = ledger.get(id).place as { at: string; x: number; z: number; y?: number };
    const onBar = p0.at === 'bar';
    // (on the bar, stood a hand's width along it so the mug is at his left hand: square behind it, his left forearm
    // crossed his belly to take it, `lab tavern`)
    const spot: Spot = onBar ? behindBar(p0.z - MUG_ASIDE, REACH_X) : KEEPER_WAYS5.intoTable ? { ...PLACES.longTable, x: p0.x, z: p0.z } : tableStand(p0.x, p0.z);
    const live = () => ledger.get(id).place as { at: string; x: number; z: number; y?: number };
    const where = () => {
      const p = live();
      return V(p.x, (onBar ? BAR.top : p.y ?? 0.76) + MUG.foot, p.z);
    };
    return [...(onBar ? [] : walkOut(spot)), walkTo(spot), ...(onBar ? drawIn(id, spot) : []), {
      name: 'collect', spot, dur: TASK.collect,
      pose: (k) => ({ bend: onBar ? 0.2 : 0.6, look: W(...where().toArray()), left: inHand === id ? mugHold(W(...where().toArray()).add(V(0, 0.15 * smooth(k * 2 - 1), 0))) : mugGrip(W(...where().toArray())) }),
      at: [[0.5, () => takeUp(id, ['bar', 'table'])]],
      reachFor: () => W(...where().toArray()),
    }, ...(onBar ? [] : walkBack())];
  };
  /** A mug at the bar's far side drawn in across its top to his edge of it under his cupped hand, before he takes it
   *  up: reached for where it stood, his near-straight arm lay on the bar's edge (`lab tavern`), as no barkeep's does. */
  const drawIn = (id: number, spot: Spot): Step[] => {
    const p = ledger.get(id).place as { x: number; z: number };
    // (drawn in to his edge of the bar and along it to his left hand: a mug past where he can stand along the bar
    // comes along it to him)
    const to = BAR.x + BAR.half - DRAWN_IN, toZ = spot.z + MUG_ASIDE;
    if (p.x > to - 0.05 && Math.abs(p.z - toZ) < 0.05) return [];
    const [reached, drawn] = DRAW_IN;
    // (only while it still stands where it was planned: taken by a hero meanwhile, or moved, it's left be)
    const standing = () => {
      const now = ledger.get(id).place;
      return now.at === 'bar' && Math.abs(now.x - p.x) < 0.01 && Math.abs(now.z - p.z) < 0.01;
    };
    return [{
      name: 'draw in', spot, dur: TASK.drawIn,
      pose: (k) => {
        // (gone from where it stood meanwhile: his hand rests on the bar's edge before him for what's left of the
        // step; left with no goal there, his arm drifted into his belly, `lab tavern`)
        if (!standing()) {
          drawing = null;
          return { ...BODY0, left: { at: W(BAR.x + BAR.half - 0.05, BAR.top + 0.03, me.z + 0.12) } };
        }
        const drawnShare = smooth(clamp((k - reached) / (drawn - reached), 0, 1));
        const x = lerp(p.x, to, drawnShare), z = lerp(p.z, toZ, drawnShare);
        if (k >= reached) drawing = { id, x, z };
        // (taken round its body as he'll lift it, and drawn in so: a hand cupped over it turned over as it closed,
        // "no flipping", Kenneth's round 3)
        // (reached for over the bar's top, coming down onto it: sent straight to it from his side, his hand rose past
        // his belly and his forearm folded across it, `lab tavern`)
        const over = REACH_OVER * (1 - smooth(clamp(k / reached, 0, 1)));
        return { ...BODY0, bend: 0.1, look: W(x, BAR.top, z), left: mugGrip(W(x, BAR.top + MUG.foot + over, z)) };
      },
      at: [[1, () => {
        if (drawing?.id === id && standing()) ledger.move(id, { at: 'bar', x: to, z: toZ });
        drawing = null;
      }]],
    }];
  };
  /** washed in the tub and dried */
  const washAndDry = (id: number): Step[] => [walkTo(PLACES.tub), {
    name: 'wash', spot: PLACES.tub, dur: TASK.wash,
    pose: (k, t) => washPose(k, t),
    at: [[0.95, () => ledger.move(id, { at: 'keeper' }, { dirty: false, full: 0 })]],
  }, {
    name: 'dry', spot: PLACES.tub, dur: TASK.dry,
    pose: (_k, t) => {
      const held = ahead(0.36, 1.12, 0.05), rub = Math.sin(t * 5), side = -0.7 + 0.5 * rub, reach = MUG.rimR + 0.026;
      return { bend: 0.1, look: held, left: mugHold(held), right: ragHold(held.clone().add(new THREE.Vector3(Math.sin(side) * reach, 0.03 * Math.sin(t * 2.4), -Math.cos(side) * reach).applyAxisAngle(V(0, 1, 0), me.facing))) };
    },
  }];
  /** A mug washed in the tub (`k` the share of the step, `t` its time): lowered into the water, scrubbed inside with
   *  his rag, his wrist turning, while his other hand turns the mug; rinsed with two dips, and shaken off over the tub.
   *  From play: "the washing animation of the cup can be improved". */
  function washPose(k: number, t: number): KeeperPose {
    const over = tubAt().add(V(-0.04, 0.12, 0)), inWater = tubAt().add(V(-0.02, 0.0, 0));
    const look = W(...tubAt().toArray());
    const [dipIn, scrubTo, rinseTo] = WASH;
    if (k < dipIn) {
      const at = over.clone().lerp(inWater, smooth(k / dipIn));
      return { ...BODY0, bend: 0.35, look, left: mugHold(W(...at.toArray())), right: null };
    }
    stirred = 1;
    if (Math.random() < 0.3) bubble();
    if (k < scrubTo) {
      // (the mug held up out of the water, its mouth to him, turned in his hand; the rag worked round inside its rim)
      const held = inWater.clone().add(V(0, 0.05, 0)), spin = (k - dipIn) * 14, a = t * 9;
      const mouth = held.clone().add(V(0, MUG.up - 0.025, 0));
      const rag = mouth.add(V(0.014 * Math.cos(a), 0.006 * Math.sin(a * 2), 0.014 * Math.sin(a)));
      return { ...BODY0, bend: 0.35, look, left: { ...mugHold(W(...held.toArray())), spin }, right: ragHold(W(...rag.toArray()), V(0, -1, 0)) };
    }
    if (k < rinseTo) {
      const dips = Math.abs(Math.sin(((k - scrubTo) / (rinseTo - scrubTo)) * Math.PI * 2));
      const at = inWater.clone().add(V(0, 0.08 * (1 - dips), 0));
      if (dips < 0.5) drip(at, 0.25);
      return { ...BODY0, bend: 0.35, look, left: mugHold(W(...at.toArray())), right: null };
    }
    // (shaken off over the tub: short quick shakes, a few centimetres)
    const shake = 0.025 * Math.sin(t * 40) * (1 - smooth((k - rinseTo) / (1 - rinseTo)));
    const at = over.clone().add(V(0, shake, 0));
    drip(at, 0.5);
    return { ...BODY0, bend: 0.3, look, left: mugHold(W(...at.toArray())), right: null };
  }
  /** A soap bubble rising off the tub's water and bursting, as he scrubs: only while the tavern is shown. */
  function bubble(): void {
    if (G.arena.room !== 'tavern') return;
    const a = Math.random() * Math.PI * 2, r = Math.random() * TUB.r * 0.8;
    const w = W(backX + Math.cos(a) * r, BACK.top + TUB.water + 0.01, TUB.z + Math.sin(a) * r);
    particles.smoke.spawn({
      x: w.x, y: w.y, z: w.z, vx: (Math.random() - 0.5) * 0.05, vy: 0.08 + Math.random() * 0.08, vz: (Math.random() - 0.5) * 0.05,
      life: 0.7 + Math.random() * 0.5, size: 0.008 + Math.random() * 0.01, sizeEnd: 0.016, color: col(0xf0f6f8, 0.7), colorEnd: col(0xd8e8f0, 0.2), gravity: 0, drag: 0.5,
    });
  }
  /** A drop of water off the mug at `at` (room), falling back into the tub, now and then (`chance` a frame): only while
   *  the tavern is shown. */
  function drip(at: THREE.Vector3, chance: number): void {
    if (G.arena.room !== 'tavern' || Math.random() > chance) return;
    const w = W(at.x + (Math.random() - 0.5) * 0.06, at.y - 0.06, at.z + (Math.random() - 0.5) * 0.06);
    particles.smoke.spawn({
      x: w.x, y: w.y, z: w.z, vx: (Math.random() - 0.5) * 0.3, vy: 0.2 + Math.random() * 0.3, vz: (Math.random() - 0.5) * 0.3,
      life: 0.45, size: 0.012, sizeEnd: 0.008, color: col(0xb8d0e0, 0.9), colorEnd: col(0x90a8b8, 0.4), gravity: 6, drag: 0.1,
    });
  }
  /** stood back with the clean ones */
  const shelve = (id: number): Step[] => {
    const slot = Math.max(0, ledger.freeSlot());
    const spot: Spot = { x: PLACES.mugs.x, z: SHELF_SLOTS[slot], facing: Math.PI / 2 };
    return [walkTo(spot), {
      name: 'shelve', spot, dur: TASK.shelve,
      pose: (k) => ({ bend: 0.15, look: W(...shelfAt(slot).toArray()), left: inHand === id ? mugHold(W(...shelfAt(slot).toArray()).add(V(0, 0.1 * (1 - smooth(k * 2)), 0))) : { at: W(...shelfAt(slot).toArray()).add(V(-0.07, 0.04, 0)) } }),
      at: [[0.5, () => { keeper!.drop(meshes[id], g); inHand = -1; ledger.move(id, { at: 'shelf', slot }, { full: 0, dirty: false }); }]],
      reachFor: () => W(...shelfAt(slot).toArray()),
    }];
  };
  /** his way about the room: every walk is planned from wherever he is (tavernNav.ts), so there's nothing to walk out
   *  by or back by before it (his ways were fixed points joined by straight lines: "it seems like he is following just
   *  1 path") */
  const walkOut = (_to: Spot): Step[] => [];
  const walkBack = (): Step[] => [];
  /** the room as he may walk it: its stools, tables, benches and barrels, the bar and the back counter (made once,
   *  as he first walks: everything in the room is built by then) */
  let navMade: TavernNav | null = null;
  let navWall = false;
  const nav = (): TavernNav => {
    // (made again as the canary's wall comes or goes)
    if (navMade && navWall === KEEPER_STUCK.wall) return navMade;
    navWall = KEEPER_STUCK.wall;
    // (his middle further from the bar than `keepOut` holds it, as his elbows swing walking past its top's edge: 5 cm
    // into it at 0.28; the back counter is under them)
    const boxes: NavBox[] = COUNTERS.map((c, i) => ({ x0: c.x0, x1: c.x1, z0: c.z0, z1: c.z1, keep: i === 0 ? 0.35 : 0.11 }));
    // (the long table's top as a box, kept off a little further than `keepOut` keeps him: a way planned where he's
    // pushed back each frame is one he never walks to its end)
    for (const t of TABLE_TOPS) if (t.hx !== undefined) boxes.push({ x0: t.x - t.hx, x1: t.x + t.hx!, z0: t.z - t.hz!, z1: t.z + t.hz!, keep: TABLE_WALK });
    if (KEEPER_STUCK.wall) boxes.push({ ...stuckWall(), keep: HIPS_HALF + 0.03 });
    const inBox = (o: { x: number; z: number }) => boxes.some((bx) => o.x >= bx.x0 && o.x <= bx.x1 && o.z >= bx.z0 && o.z <= bx.z1);
    const circles = [
      ...b.obstacles.filter((o) => !inBox(o)),
      // (the round tables' tops, beside what the room's obstacles have of them)
      ...TABLE_TOPS.filter((t) => t.r !== undefined).map((t) => ({ x: t.x, z: t.z, r: t.r! + TABLE_WALK - 0.26, h: t.top })),
      ...b.seats.flatMap((seat) => seat.circles),
      ...BAR_STOOLS.map((z) => ({ x: BAR_STOOL_X, z, r: 0.17, h: BAR_STOOL_HIGH })),
    ];
    navMade = new TavernNav(HOUSES.tavern.half, circles, boxes);
    return navMade;
  };
  /** `p` pushed out of the bar, the back counter and the tables, grown by his hips' half width, to the nearest edge:
   *  whatever way he's sent, he never walks inside one (from Victor's review: "him walking inside the counter
   *  sometimes"; walked straight to the broom from the room, he went through the bar) */
  const keepOut = (p: { x: number; z: number }): void => {
    for (const b of COUNTERS) {
      const x0 = b.x0 - b.keep, x1 = b.x1 + b.keep, z0 = b.z0 - b.keep, z1 = b.z1 + b.keep;
      if (p.x <= x0 || p.x >= x1 || p.z <= z0 || p.z >= z1) continue;
      const out = [p.x - x0, x1 - p.x, p.z - z0, z1 - p.z], least = Math.min(...out);
      if (least === out[0]) p.x = x0; else if (least === out[1]) p.x = x1; else if (least === out[2]) p.z = z0; else p.z = z1;
    }
    // (each table's top as it's drawn: a circle of its reach round its middle, he stood in the long table's ends)
    // (the canary's walk into a table's top let be)
    if (!KEEPER_WAYS5.intoTable) for (const t of TABLE_TOPS) keepOffTop(t, p, TABLE_KEEP);
    if (KEEPER_STUCK.wall) {
      const w = stuckWall();
      if (p.x > w.x0 - HIPS_HALF && p.x < w.x1 + HIPS_HALF && p.z > w.z0 - HIPS_HALF && p.z < w.z1 + HIPS_HALF) p.z = p.z - w.z0 < w.z1 - p.z ? w.z0 - HIPS_HALF : w.z1 + HIPS_HALF;
    }
  };
  /** `spot` moved back out of the bar, the back counter and the tables to `BODY_CLEAR` from them, as he'd stand */
  const clearOf = (spot: Spot): Spot => {
    let { x, z } = spot;
    const behind = x > BAR.x && z < BAR.to + 0.3;
    if (behind) x = clamp(x, BAR.x + BAR.half + BODY_CLEAR, BACK.front - BODY_CLEAR);
    const at = { x, z };
    for (const t of TABLE_TOPS) keepOffTop(t, at, BODY_CLEAR);
    // (and off the stools and benches round them: stood at a table's side he leans over the bench, never into it)
    for (const c of seatCircles()) {
      const dx = at.x - c.x, dz = at.z - c.z, d = Math.hypot(dx, dz), least = c.r + SEAT_KEEP;
      if (d < least && d > 1e-3) { at.x = c.x + dx / d * least; at.z = c.z + dz / d * least; }
    }
    return { ...spot, x: at.x, z: at.z };
  };
  /** Where he stands to take up a mug at (x, z) on a table: at the side of its top nearest it, out past its edge, and
   *  out past the stools and benches there, facing it; reached from there by leaning over (one of the tables' own two
   *  spots, from the long table's end he reached for a mug at its middle and stepped in, through its top: "have him
   *  approach from the side", Kenneth's round 5). */
  const tableStand = (x: number, z: number): Spot => {
    const { top } = nearestTop(x, z), e = edgeNear(top, x, z);
    // (square to the table's side, stood a hand along it so the mug is at his left hand, as at the bar: square before
    // it, his left forearm crossed his belly to take it, `lab tavern`)
    const facing = Math.atan2(-e.nx, -e.nz), left = { x: Math.cos(facing), z: -Math.sin(facing) };
    const at = { x: e.x + e.nx * TABLE_STAND - left.x * MUG_ASIDE, z: e.z + e.nz * TABLE_STAND - left.z * MUG_ASIDE };
    // (out past the stools and benches by his walk's room: by his hips' alone, his way there brushed the bench)
    // (a little along the edge either way first, then further out: pushed straight out from a stool beside his spot, he
    // stood by its side 12 cm off it, `lab tavern`)
    const clear = (x: number, z: number) => !seatCircles().some((c) => Math.hypot(x - c.x, z - c.z) < c.r + SEAT_ROOM);
    for (let out = 0; out <= 0.8; out += 0.05) {
      for (const side of [0, 0.15, -0.15, 0.3, -0.3]) {
        const x = at.x + e.nx * out + left.x * side, z = at.z + e.nz * out + left.z * side;
        if (clear(x, z)) return { x, z, facing };
      }
    }
    return { x: at.x, z: at.z, facing };
  };
  /** the stools' and benches' circles about the room, and the bar's stools */
  const seatCircles = (): { x: number; z: number; r: number }[] => [
    ...b.seats.flatMap((seat) => seat.circles),
    ...BAR_STOOLS.map((z) => ({ x: BAR_STOOL_X, z, r: 0.17 })),
  ];
  /** a tool fetched from its corner (his rag tucked away) or put back (his rag taken out again) */
  const toolStep = (tool: 'broom' | 'poker', fetch: boolean): Step => {
    const spot = tool === 'broom' ? PLACES.broom : PLACES.poker, thing = tool === 'broom' ? broom : poker;
    // (the broom taken at its middle, where it's carried: at its top, his hand slid 60 cm down it as he walked and it
    // swung out into his chest and down into the floor meanwhile, `lab tavern`)
    const corner = tool === 'broom' ? leaningAt(BROOM_TAKEN_AT) : V(POKER_AT.x, 0.8, POKER_AT.z - 0.1);
    return {
      name: fetch ? `fetch ${tool}` : `put back ${tool}`, spot, dur: TASK.fetch,
      pose: (k) => {
        // (once in his hand, held as he carries it, angled ahead and out past his leg: stood straight down from his hand,
        // or leaning as it stood against the wall, its foot towards him, the stick ran through his leg)
        const hand = tool === 'broom' ? 'left' : 'right', goal: HandGoal = holding === tool ? CARRY[tool]() : { at: W(...corner.toArray()) };
        return { bend: 0.1 + 0.2 * Math.sin(Math.PI * k), look: W(...corner.toArray()), [hand]: goal };
      },
      at: [[0.5, () => {
        if (fetch) {
          holding = tool;
          if (tool === 'broom') regripBroom(BROOM_TAKEN_AT);
          keeper!.carry(tool === 'broom' ? 'left' : 'right', thing);
        } else { holding = null; keeper!.drop(thing, g); if (tool === 'broom') leanBroom(); else leanPoker(); }
      }]],
    };
  };

  // --- his idle tasks ---
  const TASKS: Record<string, () => Step[]> = {
    wipeBar: () => {
      // (stood a little further back than to reach a mug, his rag's circles as far out on the top as they were: at the
      // circle's near side his right elbow came down onto the bar's back edge, 1.4 to 3.2 cm into it, `lab tavern`)
      const x = REACH_X + WIPE_BACK;
      const back = me.z > -0.6, from = behindBar(back ? BAR.to - 0.15 : BACK.from + 0.2, x), to = behindBar(back ? BACK.from + 0.2 : BAR.to - 0.15, x);
      return [walkTo(from), {
        name: 'wipe bar', spot: from, along: to, dur: TASK.wipeBar,
        pose: (_k, t) => {
          // (wide circles, a forearm's sweep: "bigger circles", Kenneth's round 3; they were 10 by 12 cm)
          // (its sideways reach short of his elbow meeting the bar's edge: 18 cm across, his right elbow went into it)
          const a = t * 2.3, rag = ahead(0.55 + WIPE_BACK + 0.12 * Math.sin(a), BAR.top + 0.026, 0.14 * Math.cos(a));
          return { bend: 0.4, look: rag, right: wiping(rag, BAR_TOP), left: { at: ahead(0.32 + WIPE_BACK, BAR.top + 0.04, 0.3) } };
        },
      }];
    },
    cask: () => [walkTo(PLACES.cask), {
      name: 'check cask', spot: PLACES.cask, dur: TASK.cask,
      pose: (k, t) => {
        // (his knuckles knocked on its side to hear how full it is, then wiped over its top with the rag, palm down in
        // small strokes round its curve, his other hand on its hoop steadying it: his hand hung palm up over it, "Its
        // face up, place it face down at least, and resting on barrel", Kenneth's round 4)
        const cask = V(near - 0.38, BAR.top + 0.17, tap.z), r = 0.155;
        const knock = 0.025 * Math.max(0, Math.sin(t * 9));
        const side = W(cask.x + 0.05, cask.y + 0.02, cask.z + r + 0.02 + knock);
        const round = 0.55 * Math.sin(t * 2.4), along = 0.1 * Math.sin(t * 1.1);
        const over = W(cask.x + along, cask.y + (r + 0.028) * Math.cos(round), cask.z - (r + 0.028) * Math.sin(round));
        const steady = W(cask.x - 0.12, cask.y + r + 0.01, cask.z + 0.04);
        const wipingIt = k > 0.4;
        // (his wiping hand alone at work, the other hanging at his side: held on the hoop or knocking it, it floated stiff
        // over the cask beside the rag, "just have the cleaning hand do it, other hand just is rested by his side",
        // Kenneth's round 5; the rag on the bar by the cask until he wipes, his knuckles knocking with it in his fist)
        void side;
        const knockAt = W(cask.x + 0.03, cask.y + 0.02, cask.z - r - 0.03 - knock);
        return {
          bend: 0.25, look: W(...cask.toArray()),
          left: KEEPER_WAYS5.caskSteady ? (wipingIt ? { at: steady } : { at: side, grip: true, r: 0.02 }) : null,
          right: ragHold(wipingIt ? over : knockAt, V(Math.cos(me.facing), 0, -Math.sin(me.facing))),
        };
      },
    }],
    bottles: () => [walkTo(PLACES.bottles), {
      name: 'tidy bottles', spot: PLACES.bottles, dur: TASK.bottles,
      pose: (_k, t) => {
        // (the bottom shelf alone, within his reach: "clean only the bottom shelf", Kenneth's round 3)
        const shelf = 1.42, along = 0.3 * Math.sin(t * 0.9);
        const bottle = W(5.25, shelf + 0.1, me.z + along);
        return { bend: 0, look: bottle, left: { at: bottle.clone().add(V(-0.02, -0.04, 0.05)) }, right: ragHold(bottle.clone().add(V(-0.05, 0.02 * Math.sin(t * 8), -0.03))) };
      },
    }],
    sweep: () => {
      const steps: Step[] = [walkTo(PLACES.broom), toolStep('broom', true), ...walkOut({ x: SWEEP[0][0], z: SWEEP[0][1], facing: 0 })];
      for (let i = 0; i + 1 < SWEEP.length; i++) {
        const from = { x: SWEEP[i][0], z: SWEEP[i][1], facing: 0 }, to = { x: SWEEP[i + 1][0], z: SWEEP[i + 1][1], facing: 0 };
        from.facing = to.facing = towards(from, to);
        steps.push(walkTo(from));
        // (at his first stroke's place, the broom taken from his carry into his sweeping hands, his hold slid up its
        // handle: begun as he swept, its first strokes swept the air 12 cm over the floor, `lab tavern`)
        if (i === 0) {
          steps.push({
            name: 'ready broom', spot: from, dur: BROOM_READY,
            pose: () => ({ bend: SWEEP_BEND, crouch: SWEEP_CROUCH, look: ahead(0.85, 0, 0), ...sweepHold(0) }),
          });
        }
        steps.push({
          name: 'sweep', spot: from, along: to, dur: Math.hypot(to.x - from.x, to.z - from.z) * TASK.sweep,
          pose: (_k, t) => {
            const swing = Math.sin(t * 3.4);
            // (bent to the broom from his hips, his knees a little given: stood as he walks, his lower hand fell 20 cm
            // short of where it was sent down the handle, his arm at its length, `lab tavern`)
            return { bend: SWEEP_BEND, crouch: SWEEP_CROUCH, look: ahead(0.85, 0, 0.26 * swing), ...sweepHold(swing) };
          },
        });
      }
      steps.push(...walkBack(), walkTo(PLACES.broom), toolStep('broom', false));
      return steps;
    },
    stoke: () => [...walkOut(PLACES.poker), walkTo(PLACES.poker), toolStep('poker', true), walkTo(PLACES.hearth), {
      name: 'stoke fire', spot: PLACES.hearth, dur: TASK.stoke,
      pose: (_k, t) => {
        // (stood back from it, leaning in from his hips with his knees a little bent, the poker in his right hand at his
        // side angled down past his knee into the coals: crouched at it, his boots were in the fire and the poker ran
        // through his thigh, "it goes through his body again")
        const jab = 0.12 * Math.max(0, Math.sin(t * 2.6)) ** 2, grip = ahead(0.45 + jab, 0.95, -0.2), point = W(0.6 + 0.1 * Math.sin(t * 0.8), 0.28, -3.55);
        if (jab > 0.11 && Math.random() < 0.3) particles.glow.spawn({ x: point.x, y: point.y + 0.1, z: point.z, vx: (Math.random() - 0.5) * 0.4, vy: 1.2 + Math.random(), vz: (Math.random() - 0.5) * 0.4, life: 0.8, size: 0.03, sizeEnd: 0, color: col(0xffa040, 1.6), colorEnd: col(0x601000, 0.2), gravity: -0.5, drag: 0.6 });
        return { crouch: 0.2, bend: 0.45, look: point, right: { at: grip, held: poker, r: 0.012, dir: point.clone().sub(grip).normalize() } };
      },
    }, walkTo(PLACES.poker), toolStep('poker', false), ...walkBack()],
    smallTable: () => [...walkOut(PLACES.smallTable), walkTo(PLACES.smallTable), wipeTable('smallTable'), ...walkBack()],
    // (wiped from each of its ends in turn, a half each: from one end alone his reach was a third of its length, and
    // his rag went past its end into the air, "some just wipe the air", Kenneth's round 4)
    longTable: () => [...walkOut(PLACES.longTable), walkTo(PLACES.longTable), wipeTable('longTable', PLACES.longTable, 0.5),
      walkTo(PLACES.longTableFar), wipeTable('longTable', PLACES.longTableFar, 0.5), ...walkBack()],
  };
  function wipeTable(name: 'smallTable' | 'longTable', spot: Spot = PLACES[name], share = 1): Step {
    const t0 = TABLES[name], top = tableTop(name);
    return {
      name: 'wipe table', spot, dur: TASK.wipeTable * share,
      pose: (_k, t) => {
        const a = t * 2.2, across = Math.sin(t * 0.9), reachOut = 0.6 + 0.4 * Math.sin(t * 0.5);
        const rag = ahead(0.4 + 0.1 * reachOut + 0.12 * Math.sin(a) + (KEEPER_WIPES.offTop ? 0.6 : 0), t0.top + 0.026, 0.22 * across + 0.13 * Math.cos(a));
        // (bent well over the low table, his knees giving a little, his free hand on its edge)
        return { bend: 0.7, crouch: 0.3, look: rag, right: wiping(rag, top), left: { at: ahead(0.3, t0.top + 0.04, 0.28) } };
      },
    };
  }
  const IDLE = ['wipeBar', 'cask', 'sweep', 'bottles', 'smallTable', 'wipeBar', 'stoke', 'longTable'];
  let idleNext = 0;

  // --- who is about: the heroes in the tavern, by id (this game's own and, on the host, the partners in it) ---
  const myId = () => tavernLink.self() || 'me';
  function heroes(): { id: string; player: Player }[] {
    const list: { id: string; player: Player }[] = [];
    if (G.player && G.arena.room === 'tavern') list.push({ id: myId(), player: G.player });
    if (isHost()) list.push(...tavernLink.inTavern());
    return list;
  }
  const heroById = (id: string): Player | null => (id === myId() ? G.player ?? null : tavernLink.partner(id));
  /** a hero standing at the bar's front (within `COME_TO_BAR.near` of the stand before the tap) */
  const atBar = (p: Player) => p.pos.x < BAR.x - BAR.half + 0.2 && Math.hypot(p.pos.x - (BAR.x - 0.95), clamp(p.pos.z, BAR.from, BAR.to) - p.pos.z) < 0.01 + COME_TO_BAR.near && p.pos.x > BAR.x - 0.95 - COME_TO_BAR.near;

  // --- his day: what he does next ---
  function nextJob(): Step[] {
    // (asked for ale: a clean mug served; none clean, one washed first; none to wash, the ask waits)
    if (asked.length) {
      const hero = asked[0], clean = ledger.clean(), dirty = ledger.left()[0];
      if (inHand >= 0 && !ledger.get(inHand).dirty) {
        asked.shift();
        job = 'serve';
        return pourAndSlide(inHand, hero);
      }
      // (a dirty one in his hand washed before anything: never served, never left in the air for another)
      if (inHand >= 0) {
        job = 'wash for ale';
        return [...homeFirst(), ...washAndDry(inHand)];
      }
      if (clean) {
        asked.shift();
        job = 'serve';
        return [...homeFirst(), ...takeFromShelf(clean.id), ...pourAndSlide(clean.id, hero)];
      }
      if (dirty) {
        say('Out of clean mugs! Give me a moment.');
        job = 'wash for ale';
        return [...homeFirst(), ...collect(dirty.id), ...washAndDry(dirty.id)];
      }
      say('All my mugs are out! Wait for one to come back.');
    }
    // (a mug in his hand put away before another is taken up: taken up with one in his hand, the first was left in the
    // air where his hand had been, from play)
    if (inHand >= 0) {
      const dirty = ledger.get(inHand).dirty;
      job = dirty ? 'clear' : 'shelve';
      return [...homeFirst(), ...(dirty ? washAndDry(inHand) : []), ...shelve(inHand)];
    }
    // (a mug left about: cleared, washed, stood back)
    const left = ledger.left()[0];
    if (left) { job = 'clear'; return [...homeFirst(), ...collect(left.id), ...washAndDry(left.id), ...shelve(left.id)]; }
    // (a hero at the bar: he comes to the tap and minds it)
    const someone = heroes().find((h) => atBar(h.player));
    if (someone || attendFor > 0) {
      if (someone) attendFor = COME_TO_BAR.linger;
      job = 'attend';
      return [...homeFirst(), walkTo(PLACES.tap), attendStep()];
    }
    // (his broom or poker put back before anything else)
    if (holding) { job = 'put back'; return homeFirst(); }
    const name = forced.shift() ?? IDLE[idleNext++ % IDLE.length];
    job = name;
    return TASKS[name]();
  }
  /** back behind the bar first, from out in the room, his tool put back */
  function homeFirst(): Step[] {
    const steps: Step[] = [];
    if (holding) {
      const tool = holding;
      // (by the bar's end whichever side of it he and the tool's corner are: walked straight to the broom from the room,
      // he went through the bar, `lab tavern`)
      steps.push(walkTo(PLACES[tool]), toolStep(tool, false));
    }
    return steps;
  }
  function attendStep(): Step {
    return {
      name: 'attend', spot: PLACES.tap, dur: 1.5,
      pose: (_k, t) => {
        const near = heroes().map((h) => h.player).sort((a, b2) => a.pos.distanceTo(W(me.x, 0, me.z)) - b2.pos.distanceTo(W(me.x, 0, me.z)))[0];
        const rag = ahead(0.44 + 0.03 * Math.sin(t * 3), BAR.top + 0.026, -0.18 + 0.04 * Math.cos(t * 3));
        // (his rag laid flat under his palm on the bar, wiping it in slow small rounds as he waits: bunched in his fist on
        // the top, nothing was seen in it, "cant see the thing he is wiping with", Kenneth's round 5)
        return { bend: 0.15, look: near ? near.pos.clone().setY(near.pos.y + 1.55) : null, right: KEEPER_WAYS5.attendBunched ? ragHold(rag) : wiping(rag, BAR_TOP), left: { at: ahead(0.4, BAR.top + 0.04, 0.24) } };
      },
    };
  }
  const inBar = (p: { x: number; z: number }) => p.x > BAR.x + BAR.half && p.z < BAR.to + 0.5;

  // --- the step under way: walked along its route, or done at its spot ---
  function begin(s: Step): void {
    step = s;
    stepT = 0;
    fired = new Set();
    reaching = 0;
    stuck.bestLeft = Infinity;
    stuck.nearest = Infinity;
    stuck.still = 0;
    stuck.lost = 0;
    stuck.tries = 0;
    if (s.name === 'sweep' || s.name === 'ready broom') swept = true;
    // (a walk's way planned from where he stands round everything in the room; where there's none, straight there)
    route = [];
    routeAt = 0;
    if (s.walk) {
      // (from where he doesn't fit, by a counter he leaned over, his way's first point is the step out to where he does:
      // reached, not passed by)
      steppingOut = !nav().free(me.x, me.z);
      const way = nav().path([me.x, me.z], [s.spot.x, s.spot.z]);
      route = way.length ? way.map((p) => [p[0], p[1]] as [number, number]) : [[s.spot.x, s.spot.z]];
    }
  }
  /** A walk's frame along its planned way: steered at a point `STEER.look` ahead along it, turning as he goes, up to
   *  his pace and down from it for the way's end and for a sharp bend, never stopping on the way; turned on the spot
   *  first only where the way sets off well behind him; coming in, turned to the place's facing. True once he's there
   *  and faces its way. (Walked from point to point, he stopped at each and turned his whole body, "he does a bunch of
   *  these turns where he stops walking and looks left and right and then keep going".) */
  function walkOn(s: Step, dt: number): boolean {
    // (the points passed: each within reach of the next leg, or behind him along it)
    while (routeAt < route.length - 1 && Math.hypot(route[routeAt][0] - me.x, route[routeAt][1] - me.z) < (routeAt === 0 && steppingOut ? 0.12 : STEER.look * 0.6)) routeAt++;
    let left = Math.hypot(route[routeAt][0] - me.x, route[routeAt][1] - me.z);
    for (let i = routeAt + 1; i < route.length; i++) left += Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]);
    // (the look-ahead drawn in where the line to it would cut a corner through what blocks his way)
    // (eased between lengths, never jumped: its heading jumped as a corner came in and out of sight, and he turned left
    // and right on his way, `lab tavern`)
    let clearTo = 0.16;
    for (const length of [STEER.look, 0.28]) if (nav().sees([me.x, me.z], aheadOnRoute(length))) { clearTo = length; break; }
    lookLength = clearTo < lookLength ? clearTo : Math.min(clearTo, lookLength + LOOK_EASE * dt);
    const look = aheadOnRoute(lookLength);
    const way = Math.atan2(look[0] - me.x, look[1] - me.z), off = Math.abs(angleTo(way));
    const end = route[route.length - 1], toEnd = Math.hypot(end[0] - me.x, end[1] - me.z);
    if (watchWalk(s, left, toEnd, dt)) return false;
    if (toEnd < 0.03) {
      me.speed = 0;
      pace = 0;
      goalV.x = goalV.z = 0;
      vel.x = vel.z = 0;
      if (s.name === 'way') return true;
      turnTo(s.spot.facing, dt);
      return Math.abs(angleTo(s.spot.facing)) < 0.08;
    }
    // (his facing: along his way, and coming in over its last steps, round to the place's)
    // (facing his way all the way in, turned to the place's facing on the spot as he's there: turned to it coming in,
    // his last steps were sideways and the heroes' gait crossed his feet over, 31 cm, `lab tavern`)
    const arriving = 0;
    // (his heading held over the last steps in: there his way's point is the end itself, which swings round him as he
    // passes beside it, and he turned left and right as he came in, `lab tavern`)
    if (toEnd > HOLD_HEADING) turnTo(way + Math.atan2(Math.sin(s.spot.facing - way), Math.cos(s.spot.facing - way)) * arriving, dt, pace > 0.3);
    // (the last steps in sidestepped, turning to the place as he comes: turned to his way there first, he turned
    // away from the place and back for good)
    const startTurn = (pace < 0.15 && off > STEER.turnFirst && left > STEER.arrive) || (KEEPER_WAYS.stopToTurn && off > 0.25 && left > STEER.arrive);
    const bendSlow = 1 - 0.6 * clamp((off - 0.35) / 0.9, 0, 1);
    const aim = startTurn ? 0 : Math.min(WALK.speed * bendSlow, Math.sqrt(2 * WALK.accel * left) + 0.12);
    pace = aim > pace ? Math.min(aim, pace + WALK.accel * dt) : Math.max(aim, pace - WALK.accel * 1.5 * dt);
    const ahead = left < STEER.look ? Math.atan2(end[0] - me.x, end[1] - me.z) : way;
    // (never more than a little off the way he faces: in a tight bend his facing turned slower than his way, he walked
    // sideways, and the heroes' gait crossed his feet over as a strafing hero's, 36 cm, `lab tavern`)
    // (its last steps straight in, sidestepped as he turns to the place: held to his facing there, he circled it)
    const toward = left < STEER.arrive ? ahead : me.facing + clamp(angleTo(ahead), -SIDE_MOST, SIDE_MOST);
    goalV.x = Math.sin(toward) * aim;
    goalV.z = Math.cos(toward) * aim;
    // (moved as a hero's body moves itself, his feet pushing and braking it: the heroes' gait plans its strides by it)
    stepVelocity(vel, goalV, dt);
    let go = Math.hypot(vel.x, vel.z) * dt;
    if (go > toEnd) { vel.x *= toEnd / go; vel.z *= toEnd / go; go = toEnd; }
    me.x += vel.x * dt;
    me.z += vel.z * dt;
    // (and never into a counter's keep, whatever his way: walking from where he leaned over the bar, he went along it
    // inside its keep and his swinging elbow met its top)
    keepOut(me);
    me.speed = go / Math.max(dt, 1e-4);
    return false;
  }
  /** His walk watched for progress (`KEEPER_STUCK`): its way left shrinking, or a hero in his way ahead walked round.
   *  True where it put him back at his stand (the frame's walk is over). */
  function watchWalk(s: Step, left: number, toEnd: number, dt: number): boolean {
    stuck.left = left;
    // (a way planned again is measured from its own length: a straight line where no way was found is shorter than the
    // way round, and counted as progress it held his watch off for good, the canary's wall never caught)
    if (stuck.replanned) {
      stuck.replanned = false;
      stuck.bestLeft = left;
    }
    // (his plans tried again by his way's own length; his last resort by how near he's come to where he's going, which
    // no new plan or step aside resets: walking a step aside, his way left shrank, and he was never put back)
    if (toEnd < 0.03 || left < stuck.bestLeft - STUCK_PROGRESS) {
      stuck.bestLeft = Math.min(stuck.bestLeft, left);
      stuck.still = 0;
    } else stuck.still += dt;
    if (toEnd < 0.03 || toEnd < stuck.nearest - STUCK_PROGRESS) {
      stuck.nearest = Math.min(stuck.nearest, toEnd);
      stuck.lost = 0;
    } else stuck.lost += dt;
    // (a hero stood on his way ahead: walked round, planned again with the heroes about as what he keeps off)
    stuck.since += dt;
    if (stuck.since > STUCK_LOOK_EVERY && heroOnWay()) {
      stuck.since = 0;
      replan(s, true);
    }
    if (stuck.lost > KEEPER_STUCK.resetAfter) {
      resetToStand(`no way on to ${s.name} at ${s.spot.x.toFixed(2)}, ${s.spot.z.toFixed(2)} from ${me.x.toFixed(2)}, ${me.z.toFixed(2)} in ${KEEPER_STUCK.resetAfter} s, ${stuck.tries} ways tried`);
      return true;
    }
    if (stuck.still > KEEPER_STUCK.replanAfter && stuck.tries < KEEPER_STUCK.replans) {
      stuck.still = 0;
      stuck.tries++;
      // (planned again round the heroes; the second time stepped aside first, off where he stands, then on)
      replan(s, true, stuck.tries >= 2);
    }
    return false;
  }
  /** whether a hero stands on his way within `STUCK_AHEAD` m ahead of him */
  function heroOnWay(): boolean {
    const others = heroBodies();
    if (!others.length) return false;
    for (let d = 0.2; d <= STUCK_AHEAD; d += 0.2) {
      const [x, z] = aheadOnRoute(d);
      if (others.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + HIPS_HALF)) return true;
    }
    return false;
  }
  /** the heroes in the tavern as circles he keeps off (room m) */
  function heroBodies(): { x: number; z: number; r: number }[] {
    return heroes().map((h) => room(h.player.pos)).map((at) => ({ x: at.x, z: at.z, r: 0.3 }));
  }
  /** His way to `s` planned again from where he stands: round the heroes about (`round`), and stepped aside first. */
  function replan(s: Step, round: boolean, aside = false): void {
    const way = nav().pathAround([me.x, me.z], [s.spot.x, s.spot.z], round ? heroBodies() : []);
    if (!way.length) return;
    route = way.map((p) => [p[0], p[1]] as [number, number]);
    if (aside) {
      const side = me.facing + Math.PI / 2;
      for (const turn of [0, Math.PI]) {
        const x = me.x + Math.sin(side + turn) * 0.4, z = me.z + Math.cos(side + turn) * 0.4;
        if (nav().free(x, z)) { route.unshift([x, z]); break; }
      }
    }
    routeAt = 0;
    steppingOut = !nav().free(me.x, me.z);
    stuck.replanned = true;
  }
  /** His last resort: put back at his stand behind the bar, idle, what he held put right (the broom and the poker in
   *  their corners, his rag on him, a mug in his hand kept there), every game told by the host's next report. */
  function resetToStand(why: string): void {
    KEEPER_STUCK.resets++;
    KEEPER_STUCK.lastReset = why;
    if (import.meta.env.DEV) console.warn(`tavern keeper: put back at his stand: ${why}`);
    if (holding === 'broom') leanBroom();
    if (holding === 'poker') leanPoker();
    if (holding) keeper?.drop(holding === 'broom' ? broom : poker, g);
    holding = null;
    swept = false;
    keeper?.tuckRag(true);
    plan = [];
    step = null;
    job = 'attend';
    me.x = PLACES.tap.x;
    me.z = PLACES.tap.z;
    me.facing = PLACES.tap.facing;
    me.speed = pace = 0;
    vel.x = vel.z = 0;
    route = [];
    routeAt = 0;
    keeper?.placed();
  }
  /** the canary's wall across the way in behind the bar's end (room m) */
  function stuckWall(): { x0: number; x1: number; z0: number; z1: number } {
    return { x0: BAR.x - BAR.half, x1: BACK.wall, z0: BAR.to + 0.1, z1: BAR.to + 0.3 };
  }
  /** the point `dist` m ahead of him along his way (from his place, through the points not yet passed) */
  function aheadOnRoute(dist: number): Point {
    let fromX = me.x, fromZ = me.z, rest = dist;
    for (let i = routeAt; i < route.length; i++) {
      const [x, z] = route[i], leg = Math.hypot(x - fromX, z - fromZ);
      if (leg >= rest) return [fromX + (x - fromX) / leg * rest, fromZ + (z - fromZ) / leg * rest];
      rest -= leg;
      fromX = x;
      fromZ = z;
    }
    return route[route.length - 1];
  }
  function tick(dt: number): void {
    const wasX = me.x, wasZ = me.z;
    padAt = null;
    sweepPosed = false;
    tickOn(dt);
    showPad(dt);
    // (slid to its top on his way to where he sweeps, and back to its middle once he's done)
    // (over the last stroke's end already, his hand down to where he carries it before he walks off: slid as he walked,
    // his fist at its top before his chest, its handle's top passed his head, `lab tavern`)
    // (round 5: held as he sweeps to his last stroke's end, the carry's slide after it: slid over the last stroke, his
    // hold went up the handle as he still swept and the broom swept the air 12 cm over the floor, `lab tavern`)
    const toStroke = plan[0]?.name === 'sweep' || plan[0]?.name === 'ready broom';
    const sweepingNext = step?.name === 'sweep' || step?.name === 'ready broom' || (!!step?.walk && toStroke && (swept || KEEPER_WAYS5.carrySweeping));
    slideBroom(holding === 'broom' && !sweepingNext ? BROOM_CARRY.along : SWEEP_HOLD.grip, dt);
    if (holding !== 'broom') swept = false;
    // (lifted again as he walks off from sweeping, as when first taken up)
    broomHeldFor = holding === 'broom' && step?.name !== 'sweep' ? broomHeldFor + dt : 0;
    rippleWater(dt);
    const moved = Math.hypot(me.x - wasX, me.z - wasZ);
    if (moved > 0.05) jumped = `${job}: ${step?.name ?? '-'} moved ${(moved * 100).toFixed(1)} cm, from ${wasX.toFixed(2)},${wasZ.toFixed(2)}`;
  }
  /** the flat rag under his palm while he wipes (turning a little with his circles), his fist's bunch hidden then */
  function showPad(dt: number): void {
    layShare = clamp(layShare + (padWanted ? dt : -dt) / RAG_LAY.takes, 0, 1);
    padAt = null;
    if (padWanted && keeper) {
      // (spread under his palm while his hand is down on the top, its place his hand's: the canary's shown where his hand
      // was going, wherever his hand was)
      keeper.hands(padHands);
      const palm = room(padHands[1]), goal = room(padWanted.at);
      const over = palm.y - (padWanted.top.y + PAD_UNDER + PAD_ON), across = Math.hypot(palm.x - goal.x, palm.z - goal.z);
      const near = (padLaid ? RAG_LAY.keep : RAG_LAY.lay);
      const down = KEEPER_WAYS5.padEarly || (over < near && over > -near && across < RAG_LAY.across);
      if (down) {
        const on = KEEPER_WAYS5.padEarly ? goal : KEEPER_WIPES.offTop ? palm : onTop(palm, padWanted.top);
        padAt = W(on.x, padWanted.top.y + PAD_UNDER + PAD_ON, on.z);
      }
    }
    padLaid = padAt !== null;
    padWanted = null;
    pad.scale.setScalar(padAt ? 1 : 0.0001);
    if (keeper) keeper.rag.visible = padAt === null;
    if (!padAt) return;
    padTurn += dt * 0.6;
    const at = room(padAt);
    pad.position.set(at.x, at.y - PAD_UNDER, at.z);
    pad.rotation.y = me.facing + 0.25 * Math.sin(padTurn);
  }
  function tickOn(dt: number): void {
    clock += dt;
    attendFor = Math.max(0, attendFor - dt);
    if (heroes().some((h) => atBar(h.player))) attendFor = COME_TO_BAR.linger;
    // (a hero come to the bar takes him from his idle work, his tool put back on the way)
    if (step && job !== 'attend' && !['serve', 'clear', 'wash for ale', 'shelve'].includes(job) && (asked.length || heroes().some((h) => atBar(h.player))) && !step.name.startsWith('put back')) {
      plan = [];
      step = null;
    }
    if (step?.name === 'attend' && (asked.length || ledger.left().length) ) { plan = []; step = null; }
    // (asked for ale as he clears or shelves a mug: the motion in hand finished, a walk broken off at once, and the ale
    // served first, the mug in his hand washed for it or poured into: "an ask for beer comes before his side tasks",
    // Kenneth's round 3)
    if (asked.length && (job === 'clear' || job === 'shelve') && (!step || step.walk)) {
      plan = [];
      step = null;
    }
    if (!step) {
      if (!plan.length) plan = nextJob();
      const s = plan.shift();
      if (!s) return;
      begin(s);
    }
    const s = step!;
    me.speed = 0;
    if (s.walk) {
      if (walkOn(s, dt)) step = null;
      const walking = { x: goalV.x, z: goalV.z };
      // (walking to where he sweeps, the broom held as he sweeps with it, its head on the floor before him, as a sweeper
      // goes from one patch to the next: carried at his side, his hand slid up its handle as he went and its foot swung
      // out, its handle through his belly, `lab tavern`)
      // (between his strokes alone, the broom kept in his sweeping hands; to his first stroke from its corner it's carried
      // upright at his side as always, "That's how he should always carry the broom, when he first grabbed it, he was
      // carrying it in a different way (old way)", Kenneth's round 5)
      const toSweep = plan[0]?.name === 'sweep' || plan[0]?.name === 'ready broom';
      if (holding === 'broom' && toSweep && (swept || KEEPER_WAYS5.carrySweeping)) {
        body = { goal: walking, speed: me.speed, bend: 0.1, crouch: 0, look: null, ...sweepHold(0) };
        return;
      }
      body = { goal: walking, speed: me.speed, bend: 0, crouch: 0, look: null, left: holding === 'broom' ? CARRY.broom() : holding === 'poker' ? null : inHand >= 0 ? CARRY.mug() : null, right: holding === 'poker' ? CARRY.poker() : null };
      return;
    }
    pace = 0;
    vel.x = vel.z = 0;
    stepT += dt;
    // (what happens at its middle waits for his hand to be there: he leans in, and past a moment steps in towards it)
    if (s.reachFor && stepT >= s.dur / 2 && !fired.has(0) && keeper) {
      const target = s.reachFor(), hands: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(), new THREE.Vector3()];
      keeper.hands(hands);
      if (hands[0].distanceTo(target) > HAND_AT && reaching < REACH_LONGEST) {
        reaching += dt;
        stepT = s.dur / 2 - 1e-3;
        if (reaching > 0.3) {
          const to = room(target), dx = to.x - s.spot.x, dz = to.z - s.spot.z, d = Math.hypot(dx, dz);
          if (d > 0.35) s.spot = clearOf({ ...s.spot, x: s.spot.x + dx / d * 0.6 * dt, z: s.spot.z + dz / d * 0.6 * dt });
        }
      } else reaching = 0;
    }
    const k = Math.min(1, stepT / s.dur);
    if (s.along) {
      const x = lerp(s.spot.x, s.along.x, k), z = lerp(s.spot.z, s.along.z, k);
      me.speed = Math.hypot(x - me.x, z - me.z) / Math.max(dt, 1e-4);
      alongV.x = (x - me.x) / Math.max(dt, 1e-4);
      alongV.z = (z - me.z) / Math.max(dt, 1e-4);
      me.x = x; me.z = z;
    } else {
      // (eased into its place, his legs told the velocity: told he stood, they stepped late and set his feet together)
      const x = lerp(me.x, s.spot.x, Math.min(1, dt * 8)), z = lerp(me.z, s.spot.z, Math.min(1, dt * 8));
      alongV.x = (x - me.x) / Math.max(dt, 1e-4);
      alongV.z = (z - me.z) / Math.max(dt, 1e-4);
      me.x = x;
      me.z = z;
    }
    keepOut(me);
    turnTo(s.spot.facing, dt);
    (s.at ?? []).forEach(([share, fn], i) => { if (k >= share && !fired.has(i)) { fired.add(i); fn(); } });
    body = { goal: { ...alongV }, speed: me.speed, bend: 0, crouch: 0, look: null, left: null, right: null, ...(s.pose?.(k, stepT) ?? {}) };
    if (k >= 1) step = null;
  }
  const angleTo = (want: number) => Math.atan2(Math.sin(want - me.facing), Math.cos(want - me.facing));
  /** turned towards `want`: walking at his turn's pace, standing as fast as his feet step round */
  // (his turn gathering speed and easing off as it nears his heading: begun and ended at full speed in a frame, at the
  // brisker turn his hand held before him jolted, its speed snapping 5 cm a frame, `lab tavern`)
  let turnV = 0;
  const turnTo = (want: number, dt: number, walking = false) => {
    const rate = (walking ? WALK.turn : TURN_ON_SPOT * feetCaughtUp()), d = angleTo(want);
    const wantV = clamp(d * TURN_EASE, -rate, rate);
    turnV += clamp(wantV - turnV, -TURN_ACCEL * dt, TURN_ACCEL * dt);
    me.facing += clamp(turnV * dt, -Math.abs(d), Math.abs(d));
  };
  /** standing, how fast he may turn as a share of his turn's pace: slower while a planted foot is left turned well
   *  behind his hips, so his feet step round under him and never cross (turned on at a steady pace, his hips led his
   *  planted feet and they read crossed, `lab tavern`) */
  const feetCaughtUp = (): number => {
    if (!keeper) return 1;
    let lag = 0;
    for (const foot of keeper.legs.feet) {
      if (foot.state !== 'plant') continue;
      lag = Math.max(lag, Math.abs(Math.atan2(Math.sin(me.facing - foot.yaw), Math.cos(me.facing - foot.yaw))));
    }
    return lag > FEET_LAG_MOST ? 0.25 : 1;
  };

  // --- the mug slid across, and the hero's own hands: taken up, drunk, set down ---
  function slideOn(dt: number): void {
    if (!sliding) return;
    sliding.t += dt;
    const k = Math.min(1, sliding.t / sliding.dur), mesh = meshes[sliding.id];
    if (mesh.parent !== g) g.attach(mesh);
    mesh.quaternion.identity();
    mesh.scale.setScalar(1);
    mesh.position.lerpVectors(sliding.from, sliding.to, 1 - (1 - k) ** 2);
    if (k < 1) return;
    const s = sliding;
    sliding = null;
    // (come to rest before him, where it waits for a hero to take it up by E: never handed over by itself, "the mug
    // waits on the counter", Kenneth's round 3; any hero in the tavern may take it, `offerMug`)
    void s;
  }
  /** this game's own hero and the mug he's drinking from: taken off the bar as his hand reaches it, set down empty
   *  where his hand puts it at its end (on the bar, or the nearest table if he's walked off from it) */
  let drinking = -1, choosing = false;
  function myDrink(): void {
    const hero = G.player, c = hero?.casting, id = myId();
    if (!hero) return;
    const k = c?.skill.def.ale ? c.t / c.dur : -1;
    const mine = ledger.mugs.find((m) => m.place.at === 'hero' && m.place.who === id);
    // (a mug come into his hand by the host's word: his drink begun, held at the lift until he picks)
    if (k < 0 && drinking < 0 && mine && mine.full > 0.5) {
      if (hero.drinkAle(takenFrom ?? hero.pos.clone())) {
        drinking = mine.id;
        choosing = !!mine.held;
      }
      return;
    }
    if (k < 0) {
      // (his drink cut short with the mug still full in his hand, by a stagger or a run: put down where he is)
      if (drinking >= 0 && mine?.id === drinking && mine.full > 0.5) putDown(hero, false);
      drinking = -1;
      choosing = false;
      drinkChoice.shown = false;
      return;
    }
    // (gone from his hand as he leaves the tavern with it undrunk, back where he took it from for anyone to take: "once
    // you exit the tavern you lose the cup", Kenneth's round 4)
    if (choosing && G.arena.room !== 'tavern' && KEEPER_TAKE.door) {
      putDown(hero, true);
      return;
    }
    // (held at the lift while he chooses, walking about with it as he likes: drink it, or put it down, by E and F or
    // the buttons, `drinkChoice`)
    drinkChoice.shown = choosing;
    if (choosing) {
      if (k > HOLD_AT) c!.t = HOLD_AT * c!.dur;
      // (E the thing the pointer is on, a seat or a villager, and the drink's otherwise: both on E, he sat down and drank
      // at once, "if mouse is over seat and you press E, is instead has you sit down, if mouse is not over a Seat then
      // you drink the drink", Kenneth's round 5)
      const eElsewhere = ePointedElsewhere();
      drinkChoice.eDrinks = !eElsewhere || KEEPER_TAKE.bothE;
      drinkChoice.downable = !!putDownSpot(hero);
      if (wasPressed('e') && (!eElsewhere || KEEPER_TAKE.bothE)) pick('drink');
      else if (wasPressed('f')) pick('down');
      return;
    }
    if (drinking >= 0 && k >= ALE_BEATS.setDown && ledger.get(drinking).place.at === 'hero') {
      const mug = drinking, hand = hero!.model.root.getObjectByName('mug')?.getWorldPosition(new THREE.Vector3()) ?? hero!.pos.clone();
      const at = room(hand), down = setDownAt(at, room(hero!.pos));
      drinking = -2;
      tell({ t: 'tv?', a: 'down', id: mug, ...down }, () => ledger.move(mug, down.y === BAR.top ? { at: 'bar', x: down.x, z: down.z } : { at: 'table', ...down }, { full: 0.03, dirty: true }));
    } else if (drinking >= 0) ledger.fill(drinking, Math.max(0.03, 1 - Math.max(0, k - 0.26) / 0.42));
  }
  /** what he picks of his ale, held at the lift: drunk on from there, or put down full where he is */
  function pick(what: DrinkPick): void {
    if (!choosing || drinking < 0 || !G.player) return;
    if (what === 'down') {
      // (on a top in his reach alone: none near, F waits, its button greyed)
      if (!putDownSpot(G.player)) return;
      putDown(G.player, true);
      return;
    }
    choosing = false;
    drinkChoice.shown = false;
    const id = drinking;
    tell({ t: 'tv?', a: 'drink', id }, () => ledger.move(id, ledger.get(id).place, { held: false }));
  }
  drinkChoice.choose = pick;
  /** his mug put down full on the bar before him or the table he's by, for any hero to take up again; his drink
   *  given up (`stand`: by his choice, his hands let go of it; cut short, they already have) */
  function putDown(hero: Player, stand: boolean): void {
    const id = drinking, full = ledger.get(id).full;
    // (back where he took it from: he stands still holding it, so it's within his reach; set where his hand was, it
    // jumped half a metre along the bar in a frame, `lab tavern`)
    const hand = hero.model.root.getObjectByName('mug')?.getWorldPosition(new THREE.Vector3()) ?? hero.pos.clone();
    // (on the top nearest him, at his side of it, a hand's width in from its edge, set down from his hand: put back
    // where he took it, it went back on the counter across the room, "it should be placed not back on the counter but
    // at the nearest table (to the closest side you are to it)", Kenneth's round 5. Out of the door, where he took it:
    // "once you exit the tavern you lose the cup", round 4)
    const leaving = G.arena.room !== 'tavern';
    // (the canary's: back on the counter whatever's nearest, where he took it or before him across it)
    const counter = () => takenPlace ?? { x: BAR.x - 0.1, z: clamp(room(hero.pos).z, BAR.from + 0.2, BAR.to - 0.15), y: BAR.top };
    const down = (leaving ? takenPlace : KEEPER_TAKE.toCounter ? counter() : putDownSpot(hero)) ?? takenPlace ?? setDownAt(room(hand), room(hero.pos));
    if (!leaving) settling.set(id, { from: room(hand), t: 0 });
    drinking = -2;
    choosing = false;
    drinkChoice.shown = false;
    if (stand) hero.standDown();
    said(`mug ${id} put down ${leaving ? 'leaving' : ''} to ${down.x.toFixed(2)}, ${down.z.toFixed(2)} at ${down.y.toFixed(2)}${isGuest() ? ', asked of the host' : ''}`);
    tell({ t: 'tv?', a: 'down', id, ...down, full }, () => ledger.move(id, down.y === BAR.top ? { at: 'bar', x: down.x, z: down.z } : { at: 'table', ...down }, { full, dirty: false, held: false }));
  }
  /** the last few takes and put-downs on this game, as they went (the lab's co-op tavern reads them) */
  let downSaid = '';
  const said = (event: string) => { downSaid = [...downSaid.split(' / ').filter(Boolean).slice(-4), `${clock.toFixed(1)}s ${event}`].join(' / '); };

  // --- a full mug waiting on a top: outlined as the pointer is on it within his reach, taken up by E ---
  /** the mug E takes up now (-1: none), the one outlined, and where his hand took it from (world) */
  let offerSaid = '';
  let offered = -1, outlinedMug = -1, takenFrom: THREE.Vector3 | null = null;
  /** the top and spot he took it from (room m), where it's put down again */
  let takenPlace: { x: number; z: number; y: number } | null = null;
  const onScreen = new THREE.Vector3();
  /** how far from the pointer mug `id` is drawn (css px at its rim's height), or Infinity past `MUG_PICK` (a share of
   *  the window's height: a fingertip round the mug as drawn, which is a few px across from above) */
  const fromPointer = (id: number, px: number, py: number): number => {
    meshes[id].getWorldPosition(onScreen);
    onScreen.y += MUG.up;
    onScreen.project(G.camera);
    const x = ((onScreen.x + 1) / 2) * innerWidth, y = ((1 - onScreen.y) / 2) * innerHeight;
    const apart = Math.hypot(x - px, y - py);
    return onScreen.z < 1 && apart < MUG_PICK * innerHeight ? apart : Infinity;
  };
  /** the mug the pointer is on (-1: none), a click's walk to take one, and whether this frame's click was a mug's */
  let pointedAt = -1, goingFor = -1, clickTook = false;
  takeKeyWhen(() => offered >= 0 || (choosing && !ePointedElsewhere()));
  takeClickWhen(() => {
    const took = clickTook;
    clickTook = false;
    return took;
  });
  /** The mug this game's hero would take up by E: the one the pointer is on within his reach (by the keyboard and
   *  mouse, as a seat is pointed at: "chosen by what the pointer highlights", Kenneth's round 3), or with no pointer
   *  (touch, the close views' crosshair) the nearest within it; any hero's, never one already in a hand. */
  function offerMug(): void {
    const hero = G.player;
    offered = -1;
    pointedAt = -1;
    offerSaid = `none free (room ${G.arena.room}, casting ${!!hero?.casting}, drinking ${drinking})`;
    if (hero && takeFree()) {
      const at = room(hero.pos), point = pointerNow();
      const waiting = ledger.mugs.filter((m) => (m.place.at === 'bar' || m.place.at === 'table') && m.full > 0.5 && sliding?.id !== m.id);
      // (the one the pointer is on, the mouse's from above or the crosshair through the eyes and over the shoulder,
      // within a room's length; then within his reach it's his to take by E, and further off a click walks him to it)
      if (point) pointedAt = mugAt(point.x, point.y, waiting, POINTED_MOST);
      const apart = (id: number) => {
        const place = ledger.get(id).place as { x: number; z: number };
        return Math.hypot(place.x - at.x, place.z - at.z);
      };
      if (pointedAt >= 0 && apart(pointedAt) < MUG_REACH) offered = pointedAt;
      // (pointing at nothing, the one he stands very close to: "or if you are very low to it", Kenneth's round 4; the
      // pointer or crosshair on Bertram is his talk's)
      if (KEEPER_TAKE.near && pointedAt < 0 && !(point && objectPointed(point.x, point.y))) {
        let best = Math.min(MUG_NEAR, objectNearAt());
        for (const m of waiting) if (apart(m.id) < best) { best = apart(m.id); offered = m.id; }
      }
      offerSaid = `${waiting.length} waiting, pointed at ${pointedAt}, a pointer ${point ? 'there' : 'none'}`;
      // (a click's walk to it finished as he comes within reach; given up if he walked off by the keys)
      if (goingFor >= 0) {
        if (!waiting.some((m) => m.id === goingFor) || (!hero.walkTo && apart(goingFor) >= MUG_REACH)) goingFor = -1;
        else if (apart(goingFor) < MUG_REACH) {
          hero.walkTo = null;
          takeMug(goingFor);
          goingFor = -1;
        }
      }
    }
    const shown = offered >= 0 ? offered : pointedAt;
    if (shown !== outlinedMug) {
      outline(shown >= 0 ? meshes[shown] : null, 0xffffff);
      outlinedMug = shown;
    }
    takeHint(offered);
    if (offered < 0 || !wasPressed('e')) return;
    spendPress('e');
    takeMug(offered);
  }
  /** whether this game's hero is free to take a mug up: in the tavern, not drinking, none in his hand */
  const takeFree = (): boolean => !!G.player && G.arena.room === 'tavern' && !G.player.casting && drinking < 0
    && !ledger.mugs.some((m) => m.place.at === 'hero' && m.place.who === myId());
  /** mug `id` taken up: asked of the host, who rules who took it first (`takeFor`) */
  function takeMug(id: number): void {
    const who = myId();
    takenFrom = meshes[id].getWorldPosition(new THREE.Vector3());
    const was = ledger.get(id).place as { at: string; x: number; z: number; y?: number };
    takenPlace = { x: was.x, z: was.z, y: was.at === 'bar' ? BAR.top : was.y ?? TABLES.smallTable.top };
    tell({ t: 'tv?', a: 'took', id }, () => takeFor(id, who));
  }
  /** where the pointer is on the page (css px): the mouse's, or through the eyes and over the shoulder the crosshair's
   *  at the middle; none on touch, which takes a mug by a tap or by standing close */
  const pointerNow = (): { x: number; y: number } | null => {
    if (input.touchMode) return null;
    if (input.centerAim) return { x: innerWidth / 2, y: innerHeight / 2 };
    return cursorRay() ? { x: input.mouse.x, y: input.mouse.y } : null;
  };
  /** the mug of `among` drawn nearest (`x`, `y`) on the page, within a fingertip of it and `far` m of the hero, or -1 */
  function mugAt(x: number, y: number, among: readonly Mug[], far: number): number {
    G.camera.updateMatrixWorld();
    const at = room(G.player.pos);
    let best = Infinity, found = -1;
    for (const m of among) {
      const place = m.place as { x: number; z: number };
      if (Math.hypot(place.x - at.x, place.z - at.z) > far) continue;
      const d = fromPointer(m.id, x, y);
      if (d < best) { best = d; found = m.id; }
    }
    return found;
  }
  // (a click or a tap on a waiting mug takes it, within reach, or walks him to it to take it: "Or you can just click
  // on the cup to grab it", Kenneth's round 4; the press is the mug's, never his walk's or a blow's)
  const waitingNow = () => ledger.mugs.filter((m) => (m.place.at === 'bar' || m.place.at === 'table') && m.full > 0.5 && sliding?.id !== m.id);
  /** where a press is on the page: the crosshair's, the screen's middle, in the close views (the pointer locked) */
  const pressAt = (x: number, y: number) => (input.centerAim ? { x: innerWidth / 2, y: innerHeight / 2 } : { x, y });
  claimPointWhen((x, y) => {
    const at = pressAt(x, y);
    return !!keeper && takeFree() && mugAt(at.x, at.y, waitingNow(), POINTED_MOST) >= 0;
  });
  addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !keeper || !KEEPER_TAKE.click || !takeFree() || e.target !== G.renderer.domElement) return;
    const press = pressAt(e.clientX, e.clientY);
    const id = mugAt(press.x, press.y, waitingNow(), POINTED_MOST);
    if (id < 0) return;
    e.preventDefault();
    e.stopPropagation();
    clickTook = true;
    const place = ledger.get(id).place as { x: number; z: number }, at = room(G.player.pos);
    if (Math.hypot(place.x - at.x, place.z - at.z) < MUG_REACH) {
      takeMug(id);
      return;
    }
    // (walked to the bar's front or the table's side nearest him, within reach of it)
    const toward = V(at.x - place.x, 0, at.z - place.z).normalize().multiplyScalar(MUG_REACH * 0.6);
    goingFor = id;
    G.player.walkTo = W(place.x + toward.x, 0, place.z + toward.z).setY(0);
  }, true);
  /** the prompt to take the mug offered, over it: the village's objects' own (`promptArt`) */
  let hint: Label | null = null, hintFor = -1;
  function takeHint(id: number): void {
    hintFor = id;
    if (hint || id < 0) return;
    hint = anchorLabel(ORDER.tag, () => {
      if (hintFor < 0 || G.arena.room !== 'tavern') return null;
      const top = meshes[hintFor].getWorldPosition(new THREE.Vector3());
      return { x: top.x, y: top.y + 0.18, z: top.z };
    }, true);
    hint.ay = 0.5;
    hint.show(promptArt('E', 'Take', { face: 'display', size: 14, weight: 700, spacing: 0.5, color: '#ffe7b0' }));
  }
  /** mug `id` into hero `who`'s hand if it still waits full on a top (the host's word: the first to ask has it) */
  function takeFor(id: number, who: string): void {
    const m = ledger.get(id);
    if (!m || (m.place.at !== 'bar' && m.place.at !== 'table') || m.full <= 0.5) return;
    ledger.move(id, { at: 'hero', who }, { full: m.full, held: true, for: who });
  }
  /** a partner's drink as the host's ledger has it: held at the lift while his mug is held, let go once it's down */
  const holders = new Set<string>();
  function partnersDrink(): void {
    const now = new Set<string>();
    for (const mug of ledger.mugs) {
      if (mug.place.at !== 'hero' || mug.place.who === myId()) continue;
      now.add(mug.place.who);
      const c = heroById(mug.place.who)?.casting;
      if (mug.held && c?.skill.def.ale && c.t > HOLD_AT * c.dur) c.t = HOLD_AT * c.dur;
    }
    // (a partner's mug put down undrunk: his copy's drink given up too)
    for (const who of holders) {
      if (now.has(who)) continue;
      const hero = heroById(who), c = hero?.casting;
      if (c?.skill.def.ale && c.t < ALE_BEATS.setDown * c.dur) hero!.standDown();
    }
    holders.clear();
    for (const who of now) holders.add(who);
  }
  /** whether a mug in a hero's hand is still on its way there: shown where it stood until his hand takes it */
  function stillReached(m: Mug): boolean {
    if (m.place.at !== 'hero') return false;
    const c = heroById(m.place.who)?.casting;
    return !c?.skill.def.ale || c.t / c.dur < TAKEN;
  }
  /** Where `hero` puts a mug down: on the top nearest him (a table, or the bar) within `PUT_DOWN.reach` of his middle,
   *  at the point of its edge nearest him, `PUT_DOWN.inset` in from it, slid along the edge to the nearest spot clear
   *  of the mugs and the candles and tankards on it; none with no top in reach. */
  function putDownSpot(hero: Player): { x: number; z: number; y: number } | null {
    const at = room(hero.pos);
    const tops: TableTop[] = [...TABLE_TOPS, { name: 'bar', x: BAR.x, z: (BAR.from + BAR.to) / 2, top: BAR.top, hx: BAR.half, hz: (BAR.to - BAR.from) / 2 }];
    let best: TableTop | null = null, past = Infinity;
    for (const t of tops) {
      const d = pastEdge(t, at.x, at.z);
      if (d < past) { best = t; past = d; }
    }
    if (!best || past > PUT_DOWN.reach) return null;
    const e0 = edgeNear(best, at.x, at.z), along = { x: -e0.nz, z: e0.nx };
    for (const shift of PUT_DOWN.shifts) {
      const e = edgeNear(best, at.x + along.x * shift, at.z + along.z * shift);
      const x = e.x - e.nx * PUT_DOWN.inset, z = e.z - e.nz * PUT_DOWN.inset;
      if (pastEdge(best, x, z) > -PUT_DOWN.inset * 0.5) continue;
      const clear = ledger.mugs.every((m) => !('x' in m.place) || Math.hypot(m.place.x - x, m.place.z - z) > PUT_DOWN.apart)
        && TOP_THINGS.every((o) => Math.hypot(o.x - x, o.z - z) > PUT_DOWN.apart);
      if (clear) return { x, z, y: best.top };
    }
    return null;
  }
  /** Whether E is something else's now: a seat outlined under the pointer, or a village thing pointed at. */
  function ePointedElsewhere(): boolean {
    if (!G.player) return false;
    if (G.player.sitting.pointed) return true;
    const p = pointerNow();
    return !!p && objectPointed(p.x, p.y);
  }
  /** where an empty mug goes down: on the bar before him if he stands by it, else on the nearest table */
  function setDownAt(hand: THREE.Vector3, feet: THREE.Vector3): { x: number; z: number; y: number } {
    const fromBar = BAR.x - BAR.half - feet.x;
    if (fromBar < SET_DOWN_WITHIN && feet.z > BAR.from - 0.3 && feet.z < BAR.to + 0.3) {
      // (set over the bar's middle, as far as his arm puts it: the keeper reaches it from his side)
      return { x: BAR.x - 0.1, z: clamp(hand.z, BAR.from + 0.2, BAR.to - 0.15), y: BAR.top };
    }
    const t = Object.values(TABLES).sort((a, b2) => Math.hypot(a.x - feet.x, a.z - feet.z) - Math.hypot(b2.x - feet.x, b2.z - feet.z))[0];
    const d = Math.hypot(feet.x - t.x, feet.z - t.z) || 1;
    return { x: t.x + (feet.x - t.x) / d * t.reach * 0.6, z: t.z + (feet.z - t.z) / d * t.reach * 0.6, y: t.top };
  }
  /** a change to the ledger this game asks for: done here alone or as the host, else asked of the host */
  function tell(m: Record<string, unknown>, apply: () => void): void {
    if (isGuest()) tavernLink.send(m, tavernLink.host());
    else apply();
  }

  // --- co-op: the host tells, a guest takes the host's word ---
  onMessages(['tv', 'tv?'], (m, from) => {
    if (m.t === 'tv?' && !isGuest()) {
      const id = Number(m.id);
      if (m.a === 'ale') asked.push(from);
      else if (m.a === 'took') {
        said(`asked for mug ${id} by ${from}, it was at ${ledger.get(id)?.place.at}`);
        takeFor(id, from);
      }
      else if (m.a === 'drink' && ledger.get(id)?.place.at === 'hero') ledger.move(id, ledger.get(id).place, { held: false });
      else if (m.a === 'down') said(`asked to put mug ${id} down, it was at ${ledger.get(id)?.place.at}`);
      if (m.a === 'down' && ledger.get(id)?.place.at === 'hero') {
        const y = Number(m.y), place = y === BAR.top ? { at: 'bar' as const, x: Number(m.x), z: Number(m.z) } : { at: 'table' as const, x: Number(m.x), z: Number(m.z), y };
        // (put down undrunk: full and clean, for any hero to take up; drunk, empty and the keeper's to clear)
        const full = m.full === undefined ? 0.03 : Number(m.full);
        ledger.move(id, place, { full, dirty: full <= 0.5, held: false });
      }
      return;
    }
    if (m.t === 'tv' && isGuest()) {
      if (Array.isArray(m.mugs)) {
        ledger.restore(m.mugs as Mug[]);
      }
      if (m.k) guestFrame = m.k as Record<string, number[]>;
    }
  });
  let toldRev = -1, muted = false;
  function tellGuests(dt: number): void {
    if (!isHost() || muted) return;
    if (ledger.rev !== toldRev) { toldRev = ledger.rev; tavernLink.send({ t: 'tv', mugs: ledger.snapshot() }); }
    toldAt += dt;
    if (toldAt < TOLD_EVERY) return;
    toldAt = 0;
    tavernLink.send({ t: 'tv', k: { me: [me.x, me.z, me.facing, me.speed], b: [body.bend, body.crouch], h: [inHand, holding === 'broom' ? 1 : holding === 'poker' ? 2 : 0] } });
  }
  /** a guest's game: his place and turn eased towards the host's word */
  function followHost(dt: number): void {
    if (!guestFrame?.me) return;
    const [x, z, f, sp] = guestFrame.me, k = Math.min(1, dt * 10);
    me.x = lerp(me.x, x, k); me.z = lerp(me.z, z, k);
    me.facing += Math.atan2(Math.sin(f - me.facing), Math.cos(f - me.facing)) * k;
    me.speed = sp;
    const [bend, crouch] = guestFrame.b ?? [0, 0], [hand] = guestFrame.h ?? [-1];
    if (hand !== inHand) {
      if (inHand >= 0) keeper!.drop(meshes[inHand], g);
      inHand = hand;
      if (inHand >= 0) keeper!.carry('left', meshes[inHand]);
    }
    body = { speed: sp, bend, crouch, look: null, left: inHand >= 0 ? CARRY.mug() : null, right: null };
  }

  // --- each frame: the brain where it runs (alone, or the host), his body where he's seen ---
  /** where his body was last posed, and the time since: posed only while the tavern is seen, his root kept with the
   *  brain every frame (posed then from where it last stood, a frame unposed read as his body jumping and a planted
   *  foot sliding) */
  const posedAt = new THREE.Vector3();
  let unposed = 0, ragFetch = 0;
  const ragHands: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(), new THREE.Vector3()];
  /** His rag in his right hand only while the pose works with it, else tucked in his apron's tie at his hip, his hand
   *  putting it there or taking it out (from Kenneth's round 3: "no wipe in hand when pouring", "into his apron"; kept
   *  in his free hand, it was tucked as each pour began and his hand's way from his hip to the tap crossed his belly,
   *  `lab tavern`). */
  function keepRag(dt: number): void {
    const wants = body.right?.held === keeper!.rag;
    if (wants !== keeper!.ragTucked) {
      ragFetch = 0;
      return;
    }
    ragFetch += dt;
    const pocket = keeper!.joints.hips.localToWorld(RAG_TUCKED.clone());
    keeper!.hands(ragHands);
    // (his hand already by his hip, as it hangs walking: tucked or taken there and then, no reach for it)
    const there = ragHands[1].distanceTo(pocket) < RAG_NEAR;
    if (!there) body = { ...body, right: { at: pocket, cup: true } };
    if (!there && ragFetch < RAG_FETCH) return;
    keeper!.tuckRag(!wants);
    ragFetch = 0;
  }
  b.updaters.push(() => {
    // (no time gone since he was last posed, the pose stands: the leg IK skips a frame of no time, which would leave his
    // legs in the walk cycle's own stance)
    if (!keeper || unposed <= 0) return;
    if (!body.look && talking() && G.player) body.look = G.player.pos.clone().setY(G.player.pos.y + 1.55);
    if (Math.hypot(me.x - posedAt.x, me.z - posedAt.z) > STEPPED_AWAY) keeper.placed();
    keepRag(Math.min(unposed, 0.1));
    keeper.pose(Math.min(unposed, 0.1), body);
    posedAt.set(me.x, 0, me.z);
    unposed = 0;
  });

  return {
    *seatSteps() {
      if (keeper) return;
      // (his own head and face asked of the workers now, as he's first needed, and waited for a frame at a time: made
      // at the boot, they were the boot's to wait on for a house a visit may never open)
      // (handed to the slices to wait for, `builtInSlices`: spun on a flag, the lab's boot held its page in one task)
      yield Promise.all([readyHead(KEEPER_HEAD, heroDetail()), readyFace('keeper')]);
      KEEPER_MADE.head = true;
      const built = yield* keeperSteps();
      if (keeper) return;
      keeper = built;
      g.add(keeper.root);
      // (stood at the tap before he's first posed: his feet set under him there, not dragged from the room's corner)
      keeper.root.position.set(me.x, 0, me.z);
      keeper.root.rotation.y = me.facing;
      keeper.root.updateMatrixWorld(true);
      keeper.placed();
      posedAt.set(me.x, 0, me.z);
      // (what comes and goes, added with him once the room is built: out of its baked shadows and still meshes)
      // (his rag laid flat and the tub's water too: added with the room, the room's merge took the rag in and it was
      // never seen, "you cant see the towel", Kenneth's round 4)
      g.add(stream, broom, poker, pad, water, suds, ...meshes);
      leanBroom();
      leanPoker();
      for (const m of ledger.mugs) drawMug(m);
    },
    always(dt) {
      if (!keeper) return;
      if (isGuest()) followHost(dt);
      else tick(dt);
      keeper.root.position.set(me.x, 0, me.z);
      keeper.root.rotation.y = me.facing;
      unposed += dt;
      slideOn(dt);
      offerMug();
      myDrink();
      partnersDrink();
      for (const settle of settling.values()) settle.t += dt;
      for (const m of ledger.mugs) drawMug(m);
      tellGuests(dt);
    },
    keeper: () => keeper,
    serve(hero) {
      if (!keeper || hero !== G.player) return false;
      if (isGuest()) tavernLink.send({ t: 'tv?', a: 'ale' }, tavernLink.host());
      else asked.push(myId());
      return true;
    },
    mugs: ledger,
    settles: (id) => settling.has(id),
    doing: () => ({
      job, step: step?.name ?? '', jumped, offered: `${offered} (${offerSaid})`, sweepPosed, walking: !!step?.walk, speed: me.speed,
      goal: step?.walk ? [step.spot.x, step.spot.z] : null, wayLeft: stuck.left, downSaid,
      broom: `held ${broomGrip.toFixed(2)} m down from its top, his fist ${broom.getWorldPosition(new THREE.Vector3()).y.toFixed(2)} m up`,
      where: `at ${me.x.toFixed(2)}, ${me.z.toFixed(2)} facing ${me.facing.toFixed(2)}, pace ${pace.toFixed(2)}, step to ${step ? `${step.spot.x.toFixed(2)}, ${step.spot.z.toFixed(2)} facing ${step.spot.facing.toFixed(2)}` : '-'}, way ${route.map((p) => p.map((v) => v.toFixed(2)).join(',')).join(' ')} (at ${routeAt})`,
    }),
    body: () => body,
    mugAt: (id) => meshes[id].getWorldPosition(new THREE.Vector3()),
    mugMesh: (id) => meshes[id],
    mute() { muted = true; },
    setTask(name) { forced.push(name); plan = []; step = null; attendFor = 0; },
    way: (from, to) => (KEEPER_WAYS.planned ? nav().path(from, to) : [to]),
  };
}
