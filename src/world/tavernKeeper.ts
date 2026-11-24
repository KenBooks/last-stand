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
import { floatText } from '../ui/floaters';
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
import { takeKeyWhen } from '../game/keyTakers';
import { drinkChoice, type DrinkPick } from '../game/drinkChoice';
import { box, drum, type Build } from './rooms';
import { buildBroom } from './tavernBroom';
import { TavernNav, type Point } from './tavernNav';
import { HOUSES } from '../data/houses';
import { stepVelocity } from '../entities/movement';
import type { Player } from '../entities/player';
import { clamp, lerp, smooth } from '../util';

/** how he walks his ways (`lab tavern --canary` plants each fault: ways planned straight through the furniture (the planned-way check's), a stop and a
 *  turn at each bend), which its checks must catch */
export const KEEPER_WAYS = { planned: true, stopToTurn: false };

/** the keeper talked to: he holds the hero in his eye (main.ts sets it as the talk card opens and closes) */
export const keeperTalk = { talking: false };

/** how far the tub's lid opens back on its hinge (rad, short of upright), and the share of the dry he lets it down
 *  from */
const LID_OPEN = 1.45, LID_CLOSE = 0.82;
/** how far under his palm the flat rag lies (m: the palm's place is 2.6 cm over the top, the cloth 4 mm on it) */
const PAD_UNDER = 0.022;
/** his rag spread on a top: a cloth about a hand and a half across, rumpled, one corner turned over (seeded) */
function padGeometry(): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(0.24, 0.18, 10, 8).rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const rumple = 0.003 * Math.sin(x * 61 + z * 23) + 0.002 * Math.sin(z * 83 - x * 17);
    const fold = x + z > 0.15 ? (x + z - 0.15) * 0.25 : 0;
    pos.setY(i, Math.max(0, rumple + 0.002) + fold);
  }
  geo.computeVertexNormals();
  return geo;
}
/** how long his hand is at his apron's pocket taking his rag out or putting it in (s) */
const RAG_FETCH = 0.35;
/** how near his apron's tie his right hand is for the rag to go in or come out with no reach for it (m) */
const RAG_NEAR = 0.25;
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
/** his hips' half width (m): how far from a counter his middle may come at the closest */
const HIPS_HALF = 0.12;
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
/** how near the pointer a mug is drawn for it to be the one pointed at (a share of the window's height) */
const MUG_PICK = 0.035;
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
  /** what he's doing (the lab: its step's name, and the job's) */
  doing(): { job: string; step: string; jumped: string; where: string; offered: string };
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
  drum(g, TUB.r, TUB.r * 0.85, 0.15, backX, BACK.top, TUB.z, M.oak, 18);
  for (const y of [0.03, 0.12]) {
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(TUB.r * (0.88 + y * 0.8), 0.005, 5, 24).rotateX(Math.PI / 2), M.iron);
    hoop.position.set(backX, BACK.top + y, TUB.z);
    g.add(hoop);
  }
  // (soapy water, its suds round the rim and a few heaps on it, under a lid he lifts to wash: "open the tub's lid,
  // bubbly water", Kenneth's round 3)
  const water = new THREE.Mesh(new THREE.CircleGeometry(TUB.r * 0.97, 24).rotateX(-Math.PI / 2),
    kit.std({ color: 0x7f8f88, roughness: 0.12, metalness: 0.05 }));
  water.position.set(backX, BACK.top + TUB.water, TUB.z);
  g.add(water);
  const suds = new THREE.Mesh(sudsGeometry(TUB.r * 0.95), kit.std({ color: 0xe8ecea, roughness: 0.35 }));
  suds.position.copy(water.position);
  g.add(suds);
  /** the lid: hinged at its back edge by the wall, opened (rotation about z) as far as `lidOpen` (rad) */
  const lid = new THREE.Group();
  lid.position.set(backX + TUB.r, BACK.top + 0.15, TUB.z);
  {
    const lidWood = kit.std({ color: 0x6a4e30, roughness: 0.8 });
    const board = new THREE.Mesh(new THREE.CylinderGeometry(TUB.r * 1.04, TUB.r * 1.04, 0.018, 24).translate(-TUB.r, 0.009, 0), lidWood);
    const batten = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, TUB.r * 1.6).translate(-TUB.r * 1.55, 0.028, 0), lidWood);
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, 0.03, 8).translate(-TUB.r * 1.7, 0.033, 0), M.iron);
    for (const mesh of [board, batten, knob]) mesh.castShadow = true;
    lid.add(board, batten, knob);
  }
  g.add(lid);
  let lidOpen = 0, lidWant = 0;
  /** his rag flat on a top as he wipes it, shown where the frame's pose asked (`padAt`, world) */
  const pad = new THREE.Mesh(padGeometry(), kit.std({ color: 0xd8cdb8, roughness: 1, side: THREE.DoubleSide }));
  pad.name = 'keeper rag flat';
  pad.visible = false;
  g.add(pad);
  let padAt: THREE.Vector3 | null = null, padTurn = 0;
  /** where his hand takes the lid by its knob, open by `open` (rad; room m) */
  const lidKnob = (open: number) => V(lid.position.x - TUB.r * 1.7 * Math.cos(open), lid.position.y + 0.04 + TUB.r * 1.7 * Math.sin(open), TUB.z);
  // --- the broom leaning by the bar's end, the poker against the hearth ---
  const wood = kit.std({ color: 0x6a4a2a, roughness: 0.75 });
  const straw = kit.std({ color: 0xb89a58, roughness: 1 });
  const iron = kit.std({ color: 0x2e2c2a, metalness: 0.8, roughness: 0.5 });
  /** the broom: its origin where his upper hand holds it, its bristles out along +y (world/tavernBroom.ts) */
  const broom = buildBroom({
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
  const leanBroom = () => stand(broom, { x: BROOM_AT.x - 0.18, z: BROOM_AT.z }, V(BROOM_AT.x + 0.06, 1.42, BROOM_AT.z), 1.36);
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
  let inHand = -1, sliding: { id: number; from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; for: string } | null = null;
  /** a mug on the bar drawn in across its top under his hand, where it is now (room m) */
  let drawing: { id: number; x: number; z: number } | null = null;
  let holding: 'broom' | 'poker' | null = null, attendFor = 0, saidAt = -99, clock = 0;
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
  const wiping = (at: THREE.Vector3): HandGoal => {
    padAt = at;
    return ragHold(at, V(Math.cos(me.facing), 0, -Math.sin(me.facing)));
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
    broom: (): HandGoal => ({ at: onChest(0.33, -0.36, 0.46), held: broom, r: 0.016, dir: onChest(0.2, -0.55, 0.81).normalize(), carried: true }),
    poker: (): HandGoal => ({ at: onChest(-0.3, -0.4, 0.12), held: poker, r: 0.012, dir: onChest(-0.15, -0.6, 0.78).normalize(), carried: true }),
    // (a mug at his left side, his forearm forward from the elbow: held before his belly, his forearm went through it,
    // "cup and arm goes through the body")
    // (before him a little to his left: at his side, his elbow brushed the bar walking behind it)
    // (carried a little higher, his elbow clear over the back counter's top walking the aisle: at 24 cm under his chest
    // joint his elbow hung at the top's height and went 3 cm into it, `lab tavern`)
    mug: (): HandGoal => ({ ...mugHold(onChest(0.17, -0.18, 0.3)), carried: true }),
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
      return { bend: 0.35 * smooth(Math.min(1, k * 2)), look: W(...push.toArray()), left: { at: W(push.x + 0.1, push.y + 0.02, push.z) } };
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
    const spot: Spot = onBar ? behindBar(p0.z - MUG_ASIDE, REACH_X) : tableSpot(p0.x, p0.z);
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
    pose: (k, t) => {
      const held = ahead(0.36, 1.12, 0.05), rub = Math.sin(t * 5), side = -0.7 + 0.5 * rub, reach = MUG.rimR + 0.026;
      // (the lid let down again over its last share, by its knob, his rag in the same hand)
      if (k > LID_CLOSE) {
        lidWant = lidOpen = LID_OPEN * (1 - smooth((k - LID_CLOSE) / (1 - LID_CLOSE)));
        return { bend: 0.15, look: W(...lidKnob(lidOpen).toArray()), left: mugHold(held), right: ragHold(W(...lidKnob(lidOpen).toArray())) };
      }
      lidWant = LID_OPEN;
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
      // (the lid lifted back by its knob first, then the mug lowered in)
      const lift = smooth(Math.min(1, k / (dipIn * 0.6)));
      lidWant = lidOpen = LID_OPEN * lift;
      const at = over.clone().lerp(inWater, smooth(Math.max(0, k / dipIn - 0.4) / 0.6));
      return { ...BODY0, bend: 0.35, look, left: mugHold(W(...at.toArray())), right: lift < 1 ? { at: W(...lidKnob(lidOpen).toArray()), grip: true, r: 0.012 } : null };
    }
    lidWant = LID_OPEN;
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
  const nav = (): TavernNav => {
    if (navMade) return navMade;
    // (his middle further from the bar than `keepOut` holds it, as his elbows swing walking past its top's edge: 5 cm
    // into it at 0.28; the back counter is under them)
    const boxes = COUNTERS.map((c, i) => ({ x0: c.x0, x1: c.x1, z0: c.z0, z1: c.z1, keep: i === 0 ? 0.35 : 0.11 }));
    const inBox = (o: { x: number; z: number }) => boxes.some((bx) => o.x >= bx.x0 && o.x <= bx.x1 && o.z >= bx.z0 && o.z <= bx.z1);
    const circles = [
      ...b.obstacles.filter((o) => !inBox(o)),
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
    for (const t of Object.values(TABLES)) {
      const dx = p.x - t.x, dz = p.z - t.z, d = Math.hypot(dx, dz), least = t.reach + HIPS_HALF;
      if (d < least && d > 1e-3) { p.x = t.x + dx / d * least; p.z = t.z + dz / d * least; }
    }
  };
  /** `spot` moved back out of the bar, the back counter and the tables to `BODY_CLEAR` from them, as he'd stand */
  const clearOf = (spot: Spot): Spot => {
    let { x, z } = spot;
    const behind = x > BAR.x && z < BAR.to + 0.3;
    if (behind) x = clamp(x, BAR.x + BAR.half + BODY_CLEAR, BACK.front - BODY_CLEAR);
    for (const t of Object.values(TABLES)) {
      const dx = x - t.x, dz = z - t.z, d = Math.hypot(dx, dz), least = t.reach + BODY_CLEAR;
      if (d < least && d > 1e-3) { x = t.x + dx / d * least; z = t.z + dz / d * least; }
    }
    return { ...spot, x, z };
  };
  const tableSpot = (x: number, z: number): Spot => {
    // (the nearest of the tables' own spots)
    const near = Math.hypot(x - TABLES.smallTable.x, z - TABLES.smallTable.z) < Math.hypot(x - TABLES.longTable.x, z - TABLES.longTable.z);
    return near ? PLACES.smallTable : PLACES.longTable;
  };
  /** a tool fetched from its corner (his rag tucked away) or put back (his rag taken out again) */
  const toolStep = (tool: 'broom' | 'poker', fetch: boolean): Step => {
    const spot = tool === 'broom' ? PLACES.broom : PLACES.poker, thing = tool === 'broom' ? broom : poker;
    const corner = tool === 'broom' ? V(BROOM_AT.x + 0.04, 1.2, BROOM_AT.z) : V(POKER_AT.x, 0.8, POKER_AT.z - 0.1);
    return {
      name: fetch ? `fetch ${tool}` : `put back ${tool}`, spot, dur: TASK.fetch,
      pose: (k) => {
        // (once in his hand, held as he carries it, angled ahead and out past his leg: stood straight down from his hand,
        // or leaning as it stood against the wall, its foot towards him, the stick ran through his leg)
        const hand = tool === 'broom' ? 'left' : 'right', goal: HandGoal = holding === tool ? CARRY[tool]() : { at: W(...corner.toArray()) };
        return { bend: 0.1 + 0.2 * Math.sin(Math.PI * k), look: W(...corner.toArray()), [hand]: goal };
      },
      at: [[0.5, () => {
        if (fetch) { holding = tool; keeper!.carry(tool === 'broom' ? 'left' : 'right', thing); }
        else { holding = null; keeper!.drop(thing, g); if (tool === 'broom') leanBroom(); else leanPoker(); }
      }]],
    };
  };

  // --- his idle tasks ---
  const TASKS: Record<string, () => Step[]> = {
    wipeBar: () => {
      const back = me.z > -0.6, from = behindBar(back ? BAR.to - 0.15 : BACK.from + 0.2, REACH_X), to = behindBar(back ? BACK.from + 0.2 : BAR.to - 0.15, REACH_X);
      return [walkTo(from), {
        name: 'wipe bar', spot: from, along: to, dur: TASK.wipeBar,
        pose: (_k, t) => {
          // (wide circles, a forearm's sweep: "bigger circles", Kenneth's round 3; they were 10 by 12 cm)
          // (its sideways reach short of his elbow meeting the bar's edge: 18 cm across, his right elbow went into it)
          const a = t * 2.3, rag = ahead(0.55 + 0.12 * Math.sin(a), BAR.top + 0.026, 0.14 * Math.cos(a));
          return { bend: 0.4, look: rag, right: wiping(rag), left: { at: ahead(0.32, BAR.top + 0.04, 0.3) } };
        },
      }];
    },
    cask: () => [walkTo(PLACES.cask), {
      name: 'check cask', spot: PLACES.cask, dur: TASK.cask,
      pose: (k, t) => {
        const knock = k < 0.45 ? 0.03 * Math.max(0, Math.sin(t * 9)) : 0, top = W(near - 0.38, BAR.top + 0.33 + knock, tap.z);
        const rag = W(tap.x - 0.02 + 0.01 * Math.sin(t * 6), tap.y - 0.01, tap.z + 0.015 * Math.cos(t * 6));
        return { bend: 0.25, look: k < 0.45 ? top : rag, left: k < 0.5 ? { at: top } : null, right: k > 0.4 ? ragHold(rag) : null };
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
        steps.push(walkTo(from), {
          name: 'sweep', spot: from, along: to, dur: Math.hypot(to.x - from.x, to.z - from.z) * TASK.sweep,
          pose: (_k, t) => {
            // (the broom held as a sweeper holds it: his left hand at its top before his chest, his right a forearm's
            // length down it, the bristles swept side to side a pace ahead)
            // (both hands well out before him, the lower a long hand down the stick: his right hand crossed his chest to
            // reach it at 0.28 ahead, `lab tavern`)
            const swing = Math.sin(t * 3.4), head = ahead(0.85, 0.02, 0.26 * swing), grip = ahead(0.42, 1.12, 0.12);
            const dir = head.clone().sub(grip).normalize();
            return { bend: 0.2, look: head, left: { at: grip, held: broom, r: 0.016, dir }, right: { at: grip.clone().addScaledVector(dir, 0.34), r: 0.016, on: { thing: broom, along: 0.34 } } };
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
    longTable: () => [...walkOut(PLACES.longTable), walkTo(PLACES.longTable), wipeTable('longTable'), ...walkBack()],
  };
  function wipeTable(name: keyof typeof TABLES): Step {
    const t0 = TABLES[name], spot = PLACES[name];
    return {
      name: 'wipe table', spot, dur: TASK.wipeTable,
      pose: (_k, t) => {
        const a = t * 2.2, across = Math.sin(t * 0.9), reachOut = t0.reach * (0.6 + 0.4 * Math.sin(t * 0.5));
        const rag = ahead(0.43 + 0.1 * (reachOut / t0.reach) + 0.12 * Math.sin(a), t0.top + 0.026, 0.22 * across + 0.13 * Math.cos(a));
        // (bent well over the low table, his knees giving a little, his free hand on its edge)
        return { bend: 0.7, crouch: 0.3, look: rag, right: wiping(rag), left: { at: ahead(0.32, t0.top + 0.04, 0.28) } };
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
        return { bend: 0.15, look: near ? near.pos.clone().setY(near.pos.y + 1.55) : null, right: ragHold(rag), left: { at: ahead(0.4, BAR.top + 0.04, 0.24) } };
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
    lidWant = 0;
    padAt = null;
    tickOn(dt);
    showPad(dt);
    // (left open by a wash broken off, it falls shut over a moment)
    if (lidWant < lidOpen) lidOpen = Math.max(lidWant, lidOpen - dt * LID_OPEN * 2);
    lid.rotation.z = -lidOpen;
    const moved = Math.hypot(me.x - wasX, me.z - wasZ);
    if (moved > 0.05) jumped = `${job}: ${step?.name ?? '-'} moved ${(moved * 100).toFixed(1)} cm, from ${wasX.toFixed(2)},${wasZ.toFixed(2)}`;
  }
  /** the flat rag under his palm while he wipes (turning a little with his circles), his fist's bunch hidden then */
  function showPad(dt: number): void {
    pad.visible = padAt !== null;
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
  const turnTo = (want: number, dt: number, walking = false) => {
    const rate = (walking ? WALK.turn : TURN_ON_SPOT * feetCaughtUp()), d = angleTo(want);
    me.facing += clamp(d, -rate * dt, rate * dt);
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
    // (held at the lift while he chooses: drink it, or put it down, by E and F or the buttons, `drinkChoice`)
    drinkChoice.shown = choosing;
    if (choosing) {
      if (k > HOLD_AT) c!.t = HOLD_AT * c!.dur;
      if (wasPressed('e')) pick('drink');
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
    const down = takenPlace ?? setDownAt(room(hand), room(hero.pos));
    drinking = -2;
    choosing = false;
    drinkChoice.shown = false;
    if (stand) hero.standDown();
    tell({ t: 'tv?', a: 'down', id, ...down, full }, () => ledger.move(id, down.y === BAR.top ? { at: 'bar', x: down.x, z: down.z } : { at: 'table', ...down }, { full, dirty: false, held: false }));
  }

  // --- a full mug waiting on a top: outlined as the pointer is on it within his reach, taken up by E ---
  /** the mug E takes up now (-1: none), the one outlined, and where his hand took it from (world) */
  let offerSaid = '';
  let offered = -1, outlinedMug = -1, takenFrom: THREE.Vector3 | null = null;
  /** the top and spot he took it from (room m), where it's put down again */
  let takenPlace: { x: number; z: number; y: number } | null = null;
  const onScreen = new THREE.Vector3();
  /** how far from the pointer mug `id` is drawn (css px at its rim's height), or Infinity past `MUG_PICK` (a share of
   *  the window's height: a fingertip round the mug as drawn, which is a few px across from above) */
  const fromPointer = (id: number): number => {
    meshes[id].getWorldPosition(onScreen);
    onScreen.y += MUG.up;
    onScreen.project(G.camera);
    const x = ((onScreen.x + 1) / 2) * innerWidth, y = ((1 - onScreen.y) / 2) * innerHeight;
    const apart = Math.hypot(x - input.mouse.x, y - input.mouse.y);
    return onScreen.z < 1 && apart < MUG_PICK * innerHeight ? apart : Infinity;
  };
  takeKeyWhen(() => offered >= 0 || choosing);
  /** The mug this game's hero would take up by E: the one the pointer is on within his reach (by the keyboard and
   *  mouse, as a seat is pointed at: "chosen by what the pointer highlights", Kenneth's round 3), or with no pointer
   *  (touch, the close views' crosshair) the nearest within it; any hero's, never one already in a hand. */
  function offerMug(): void {
    const hero = G.player;
    offered = -1;
    offerSaid = `none free (room ${G.arena.room}, casting ${!!hero?.casting}, drinking ${drinking})`;
    const free = hero && G.arena.room === 'tavern' && !hero.casting && drinking < 0
      && !ledger.mugs.some((m) => m.place.at === 'hero' && m.place.who === myId());
    if (free) {
      const at = room(hero.pos);
      const near = ledger.mugs.filter((m) => (m.place.at === 'bar' || m.place.at === 'table') && m.full > 0.5
        && sliding?.id !== m.id && Math.hypot(m.place.x - at.x, m.place.z - at.z) < MUG_REACH);
      // (no pointer to point with: touch, and the close views' crosshair, which a mug on the bar lies far below)
      const ray = input.centerAim ? null : cursorRay();
      offerSaid = `${near.length} near, a ray ${ray ? 'cast' : 'none'}`;
      let best = Infinity;
      if (ray) G.camera.updateMatrixWorld();
      for (const m of near) {
        const p = m.place as { x: number; z: number };
        const d = ray ? fromPointer(m.id) : Math.hypot(p.x - at.x, p.z - at.z);
        if (d < best) {
          best = d;
          offered = m.id;
        }
      }
    }
    if (offered !== outlinedMug) {
      outline(offered >= 0 ? meshes[offered] : null, 0xffffff);
      outlinedMug = offered;
    }
    if (offered < 0 || !wasPressed('e')) return;
    // (taken up: asked of the host, who rules who took it first, `takeFor`)
    spendPress('e');
    const id = offered, who = myId();
    takenFrom = meshes[id].getWorldPosition(new THREE.Vector3());
    const was = ledger.get(id).place as { at: string; x: number; z: number; y?: number };
    takenPlace = { x: was.x, z: was.z, y: was.at === 'bar' ? BAR.top : was.y ?? TABLES.smallTable.top };
    tell({ t: 'tv?', a: 'took', id }, () => takeFor(id, who));
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
      else if (m.a === 'took') takeFor(id, from);
      else if (m.a === 'drink' && ledger.get(id)?.place.at === 'hero') ledger.move(id, ledger.get(id).place, { held: false });
      else if (m.a === 'down' && ledger.get(id)?.place.at === 'hero') {
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
      g.add(stream, broom, poker, ...meshes);
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
    doing: () => ({
      job, step: step?.name ?? '', jumped, offered: `${offered} (${offerSaid})`,
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
