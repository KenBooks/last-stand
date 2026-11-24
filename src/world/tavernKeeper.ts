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
import { G } from '../state';
import { createKit } from '../core/materials';
import { sfx } from '../core/audio';
import { floatText } from '../ui/floaters';
import { particles, col } from '../fx/particles';
import { keeperSteps, KEEPER_HEAD, type HandGoal, type Keeper, type KeeperPose } from '../entities/models/keeper';
import { readyHead } from '../entities/models/head';
import { heroDetail } from '../entities/models/armor';
import { readyFace } from '../core/textures';
import { buildMug, setMugFill, MUG } from '../entities/models/flask';
import {
  ALE_BEATS, BACK, BAR, BAR_END, BROOM_AT, COME_TO_BAR, PLACES, POKER_AT, ROOM_WAYS, SET_DOWN_WITHIN, SHELF_SLOTS, SWEEP,
  TABLES, TASK, TUB, WALK, WASH, type Spot,
} from '../data/tavern';
import { MugLedger, type Mug } from '../game/mugs';
import { isGuest, isHost } from '../net/role';
import { tavernLink } from '../net/tavernLink';
import { onMessages } from '../net/messages';
import { box, drum, type Build } from './rooms';
import type { Player } from '../entities/player';
import { clamp, lerp, smooth } from '../util';

/** the keeper talked to: he holds the hero in his eye (main.ts sets it as the talk card opens and closes) */
export const keeperTalk = { talking: false };

/** how long the mug glides on across the bar after his hand lets it go (s) */
const GLIDE = 0.3;
/** how far in from the bar's front edge a mug stands, slid to a hero or set down by one (m) */
const REST_IN = 0.09;
/** how far his middle keeps from the bar's and the back counter's faces and a table's edge (m: his hips and belly
 *  clear of them as he leans over; from play, "when he leans in to grab the cup, he goes through the table") */
const BODY_CLEAR = 0.3;
/** how far in from his edge of the bar he draws a far mug before taking it up (m), and the draw's parts (shares of
 *  its step): his hand come behind the mug by the first, the mug drawn in by the second */
const DRAWN_IN = 0.14, DRAW_IN = [0.35, 0.85] as const;
/** his hips' half width (m): how far from a counter his middle may come at the closest */
const HIPS_HALF = 0.12;
/** the bar's and the back counter's footprints (room m), and how far his middle keeps from each: the bar's top is at
 *  his elbows' height, so his elbows' half width (walking by it at his hips' half width, his elbow brushed its top's
 *  corner, `lab tavern`); the back counter's is under them, so his hips' */
const COUNTERS = [
  { x0: BAR.x - BAR.half, x1: BAR.x + BAR.half, z0: BAR.from, z1: BAR.to, keep: 0.28 },
  { x0: BACK.front, x1: BACK.wall, z0: BACK.from, z1: BACK.to, keep: 0.14 },
] as const;
/** the share of the hero's drink at which his hand has the mug (models/flask.ts `ALE_KEYS.out`) */
const TAKEN = 0.085;
/** how far behind the bar he stands to reach a mug at its front (m: leaning over it) */
const REACH_X = BAR.x + BAR.half + BODY_CLEAR;
/** how near his hand must come to a mug to take it up or let it go (m), and how long he leans and steps in for it
 *  before he does anyway (s) */
const HAND_AT = 0.04, REACH_LONGEST = 2.5;
/** how far he may have moved since his body was last posed before his feet are set under him afresh (m: posed every
 *  frame he goes under 2 cm a frame, so this is a move made while the tavern wasn't shown) */
const STEPPED_AWAY = 0.06;
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
  doing(): { job: string; step: string; jumped: string };
  /** what his body was last asked (the lab reads his hands against it) */
  body(): KeeperPose;
  /** where a mug is drawn now (world), and its mesh, for the lab */
  mugAt(id: number): THREE.Vector3;
  mugMesh(id: number): THREE.Object3D;
  /** the next of his idle tasks set (the lab's pictures of each) */
  setTask(name: string): void;
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
  const water = new THREE.Mesh(new THREE.CircleGeometry(TUB.r * 0.97, 24).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x4a5a58, roughness: 0.08, metalness: 0.1 }));
  water.position.set(backX, BACK.top + TUB.water, TUB.z);
  g.add(water);
  // --- the broom leaning by the bar's end, the poker against the hearth ---
  const wood = kit.std({ color: 0x6a4a2a, roughness: 0.75 });
  const straw = kit.std({ color: 0xb89a58, roughness: 1 });
  const iron = kit.std({ color: 0x2e2c2a, metalness: 0.8, roughness: 0.5 });
  /** the broom: its origin where his upper hand holds it, its bristles out along +y */
  const broom = new THREE.Group();
  broom.name = 'broom';
  {
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 1.3, 8).translate(0, 0.42, 0), wood);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.11, 0.32, 10).scale(1, 1, 0.45).translate(0, 1.2, 0), straw);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.006, 5, 12).rotateX(Math.PI / 2).translate(0, 1.06, 0), iron);
    broom.add(stick, head, band);
  }
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
  let jumped = '', reaching = 0, plan: Step[] = [], step: Step | null = null, stepT = 0, pace = 0, job = 'attend', route: [number, number][] = [], fired = new Set<number>();
  /** the asks for ale waiting (heroes' ids), the mug in his hand, the one he's sliding, the tools he holds */
  const asked: string[] = [];
  let inHand = -1, sliding: { id: number; from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; for: string } | null = null;
  /** a mug on the bar drawn in across its top under his hand, where it is now (room m) */
  let drawing: { id: number; x: number; z: number } | null = null;
  let holding: 'broom' | 'poker' | null = null, attendFor = 0, saidAt = -99, clock = 0;
  const forced: string[] = [];
  /** the mugs a guest's game was told it may take or set down, so it asks the host once each */
  const toldTaken = new Set<number>(), toldDown = new Set<number>();
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
    const shown = p.at !== 'hero';
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
  const behindBar = (z: number, x: number = PLACES.tap.x): Spot => ({ x, z: clamp(z, BACK.from + 0.1, BAR.to + 0.1), facing: -Math.PI / 2 });
  const mugHold = (at: THREE.Vector3): HandGoal => ({ at, held: meshes[inHand], r: MUG.gripR });
  const ragHold = (at: THREE.Vector3, dir?: THREE.Vector3): HandGoal => ({ at, held: keeper!.rag, r: 0.022, dir });
  /** his rag pressed under his palm, his fist over it knuckles forward (its axis across him): wiping */
  const wiping = (at: THREE.Vector3): HandGoal => ragHold(at, V(Math.cos(me.facing), 0, -Math.sin(me.facing)));
  const say = (text: string) => {
    if (clock - saidAt < 1.5) return;
    saidAt = clock;
    const head = W(me.x, 2.15, me.z);
    floatText(head.x, head.y, head.z, text, 'info', '#ffe0a0');
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
      pose: (k) => ({ bend: 0.15, look: W(...shelfAt(slot).toArray()), left: inHand === id ? mugHold(shelfAt(slot).clone().setY(BACK.top + MUG.foot + 0.12 * smooth(k * 2 - 1)).applyMatrix4(g.matrixWorld)) : { at: W(...shelfAt(slot).toArray()).add(V(-0.06, 0.02, 0)), cup: true } }),
      at: [[0.5, () => takeUp(id, ['shelf'], { full: 0, dirty: false })]],
      reachFor: () => W(...shelfAt(slot).toArray()),
    }];
  };
  /** filled at the tap, set down and pushed across the bar to `hero` */
  const pourAndSlide = (id: number, hero: string): Step[] => [walkTo(PLACES.tap), {
    name: 'pour', spot: PLACES.tap, dur: TASK.pour,
    pose: (k) => {
      const filling = clamp((k - 0.15) / 0.7, 0, 1);
      ledger.fill(id, filling);
      stream.scale.setScalar(k > 0.15 && k < 0.85 ? 1 : 0.001);
      return { bend: 0.1, look: W(tap.x, tap.y - 0.1, tap.z), left: mugHold(W(tap.x, tap.y - 0.05 - MUG.up, tap.z)), right: { at: W(tap.x + 0.01, tap.y + 0.05, tap.z), grip: true, r: 0.009 } };
    },
    at: [[0.15, () => sfx.alePour(TASK.pour * 0.7)], [0.9, () => stream.scale.setScalar(0.001)]],
  }, {
    name: 'slide', spot: PLACES.tap, dur: TASK.slide,
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
    const spot: Spot = onBar ? behindBar(p0.z, REACH_X) : tableSpot(p0.x, p0.z);
    const live = () => ledger.get(id).place as { at: string; x: number; z: number; y?: number };
    const where = () => {
      const p = live();
      return V(p.x, (onBar ? BAR.top : p.y ?? 0.76) + MUG.foot, p.z);
    };
    return [...(onBar ? [] : walkOut(spot)), walkTo(spot), ...(onBar ? drawIn(id, spot) : []), {
      name: 'collect', spot, dur: TASK.collect,
      pose: (k) => ({ bend: onBar ? 0.2 : 0.6, look: W(...where().toArray()), left: inHand === id ? mugHold(W(...where().toArray()).add(V(0, 0.15 * smooth(k * 2 - 1), 0))) : { at: W(...where().toArray()).add(V(0.05, 0.02, 0)), cup: true } }),
      at: [[0.5, () => takeUp(id, ['bar', 'table'])]],
      reachFor: () => W(...where().toArray()),
    }, ...(onBar ? [] : walkBack())];
  };
  /** A mug at the bar's far side drawn in across its top to his edge of it under his cupped hand, before he takes it
   *  up: reached for where it stood, his near-straight arm lay on the bar's edge (`lab tavern`), as no barkeep's does. */
  const drawIn = (id: number, spot: Spot): Step[] => {
    const p = ledger.get(id).place as { x: number; z: number };
    const to = BAR.x + BAR.half - DRAWN_IN;
    if (p.x > to - 0.05) return [];
    const [reached, drawn] = DRAW_IN;
    // (only while it still stands where it was planned: taken by a hero meanwhile, or moved, it's left be)
    const standing = () => {
      const now = ledger.get(id).place;
      return now.at === 'bar' && Math.abs(now.x - p.x) < 0.01 && Math.abs(now.z - p.z) < 0.01;
    };
    return [{
      name: 'draw in', spot, dur: TASK.drawIn,
      pose: (k) => {
        if (!standing()) {
          drawing = null;
          return { ...BODY0 };
        }
        const x = lerp(p.x, to, smooth(clamp((k - reached) / (drawn - reached), 0, 1)));
        if (k >= reached) drawing = { id, x, z: p.z };
        return { ...BODY0, bend: 0.1, look: W(x, BAR.top, p.z), left: { at: W(x - 0.06, BAR.top + 0.07, p.z), cup: true } };
      },
      at: [[1, () => {
        if (drawing?.id === id && standing()) ledger.move(id, { at: 'bar', x: to, z: p.z });
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
  /** the bar's end and back, out into the room and in */
  const walkOut = (to: Spot): Step[] => (inBar(me) ? [...BAR_END.map(([x, z]) => walkTo({ x, z, facing: 0 }, 'way')), ...roomWay(BAR_END[1], to)] : roomWay([me.x, me.z], to));
  const walkBack = (): Step[] => [...roomWay([me.x, me.z], { x: BAR_END[1][0], z: BAR_END[1][1], facing: 0 }), ...[...BAR_END].reverse().map(([x, z]) => walkTo({ x, z, facing: 0 }, 'way'))];
  /** the room's ways from `from` to `to`: through the aisle before the bar, then on (the tables and the hearth off it) */
  const roomWay = (from: readonly [number, number], to: Spot): Step[] => {
    const ways: Step[] = [];
    const via = (name: keyof typeof ROOM_WAYS) => ways.push(walkTo({ x: ROOM_WAYS[name][0], z: ROOM_WAYS[name][1], facing: 0 }, 'way'));
    const fromAisle = from[0] > 2.3;
    if (!fromAisle && to.x > 2.3) via('aisle');
    if (fromAisle && (to.z < -1.8 || to.x < 1.0)) { via('aisle'); if (to.z < -1.8) via('back'); else if (to.x < -1) via('door'); }
    if (to.z < -2.4 && to.x < 2) via('hearth');
    return ways;
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
        const hand = tool === 'broom' ? 'left' : 'right', goal: HandGoal = holding === tool ? { at: W(...corner.toArray()), held: thing, r: 0.016, dir: thing.getWorldDirection(new THREE.Vector3()).set(0, -1, 0) } : { at: W(...corner.toArray()) };
        return { bend: 0.1 + 0.2 * Math.sin(Math.PI * k), look: W(...corner.toArray()), [hand]: goal };
      },
      at: [[0.15, () => keeper!.tuckRag(true)], [0.5, () => {
        if (fetch) { holding = tool; keeper!.carry(tool === 'broom' ? 'left' : 'right', thing); }
        else { holding = null; keeper!.drop(thing, g); if (tool === 'broom') leanBroom(); else leanPoker(); }
      }], [0.85, () => { if (!fetch) keeper!.tuckRag(false); }]],
    };
  };

  // --- his idle tasks ---
  const TASKS: Record<string, () => Step[]> = {
    wipeBar: () => {
      const back = me.z > -0.6, from = behindBar(back ? BAR.to - 0.15 : BACK.from + 0.2, REACH_X), to = behindBar(back ? BACK.from + 0.2 : BAR.to - 0.15, REACH_X);
      return [walkTo(from), {
        name: 'wipe bar', spot: from, along: to, dur: TASK.wipeBar,
        pose: (_k, t) => {
          const a = t * 3.2, rag = ahead(0.48 + 0.1 * Math.sin(a), BAR.top + 0.026, 0.12 * Math.cos(a));
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
        const shelf = Math.sin(t * 0.7) > 0 ? 1.92 : 1.42, along = 0.3 * Math.sin(t * 0.9);
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
            const swing = Math.sin(t * 3.4), head = ahead(0.7, 0.02, 0.26 * swing), grip = ahead(0.28, 1.18, 0.06);
            const dir = head.clone().sub(grip).normalize();
            return { bend: 0.2, look: head, left: { at: grip, held: broom, r: 0.016, dir }, right: { at: grip.clone().addScaledVector(dir, 0.24), r: 0.016, on: { thing: broom, along: 0.24 } } };
          },
        });
      }
      steps.push(...walkBack(), walkTo(PLACES.broom), toolStep('broom', false));
      return steps;
    },
    stoke: () => [...walkOut(PLACES.poker), walkTo(PLACES.poker), toolStep('poker', true), walkTo(PLACES.hearth), {
      name: 'stoke fire', spot: PLACES.hearth, dur: TASK.stoke,
      pose: (_k, t) => {
        const jab = 0.12 * Math.max(0, Math.sin(t * 2.6)) ** 2, grip = ahead(0.3 + jab, 0.62, -0.12), point = W(0.6 + 0.1 * Math.sin(t * 0.8), 0.28, -3.55);
        if (jab > 0.11 && Math.random() < 0.3) particles.glow.spawn({ x: point.x, y: point.y + 0.1, z: point.z, vx: (Math.random() - 0.5) * 0.4, vy: 1.2 + Math.random(), vz: (Math.random() - 0.5) * 0.4, life: 0.8, size: 0.03, sizeEnd: 0, color: col(0xffa040, 1.6), colorEnd: col(0x601000, 0.2), gravity: -0.5, drag: 0.6 });
        return { crouch: 0.75, bend: 0.3, look: point, right: { at: grip, held: poker, r: 0.012, dir: point.clone().sub(grip).normalize() } };
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
        const a = t * 2.8, across = Math.sin(t * 0.9), reachOut = t0.reach * (0.6 + 0.4 * Math.sin(t * 0.5));
        const rag = ahead(0.36 + 0.14 * (reachOut / t0.reach) + 0.06 * Math.sin(a), t0.top + 0.026, 0.24 * across + 0.06 * Math.cos(a));
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
      const toolIn = inBar(PLACES[tool]), meIn = inBar(me);
      const way = toolIn ? (meIn ? [] : walkBack()) : meIn ? walkOut(PLACES[tool]) : roomWay([me.x, me.z], PLACES[tool]);
      steps.push(...way, walkTo(PLACES[tool]), toolStep(tool, false));
      if (!inBar(PLACES[tool])) steps.push(...walkBack());
    } else if (!inBar(me)) steps.push(...walkBack());
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
    // (a walk's goal kept where he may stand: held off one inside a counter's keep, he walked on the spot for good)
    const goal = { x: s.spot.x, z: s.spot.z };
    keepOut(goal);
    route = s.walk ? [[goal.x, goal.z]] : [];
  }
  function tick(dt: number): void {
    const wasX = me.x, wasZ = me.z;
    tickOn(dt);
    const moved = Math.hypot(me.x - wasX, me.z - wasZ);
    if (moved > 0.05) jumped = `${job}: ${step?.name ?? '-'} moved ${(moved * 100).toFixed(1)} cm, from ${wasX.toFixed(2)},${wasZ.toFixed(2)}`;
  }
  function tickOn(dt: number): void {
    clock += dt;
    attendFor = Math.max(0, attendFor - dt);
    if (heroes().some((h) => atBar(h.player))) attendFor = COME_TO_BAR.linger;
    // (a hero come to the bar takes him from his idle work, his tool put back on the way)
    if (step && job !== 'attend' && !['serve', 'clear', 'wash for ale', 'shelve'].includes(job) && heroes().some((h) => atBar(h.player)) && !step.name.startsWith('put back')) {
      plan = [];
      step = null;
    }
    if (step?.name === 'attend' && (asked.length || ledger.left().length) ) { plan = []; step = null; }
    if (!step) {
      if (!plan.length) plan = nextJob();
      const s = plan.shift();
      if (!s) return;
      begin(s);
    }
    const s = step!;
    me.speed = 0;
    if (s.walk) {
      // (walked at his pace, turned towards where he goes; turned to the step's way as he stops)
      const [tx, tz] = route[0];
      const dx = tx - me.x, dz = tz - me.z, d = Math.hypot(dx, dz);
      const want = d > 0.05 ? Math.atan2(dx, dz) : s.spot.facing;
      turnTo(want, dt);
      const facingOk = Math.abs(angleTo(want)) < 0.6;
      let aim = 0;
      if (d > 0.02) {
        // (turned on the spot before he sets off, as a person turns, not crept on wheeling round; and up to his pace
        // and down from it as a walker comes, slowing for the end of his way, not each corner)
        let left = d;
        for (let i = 1; i < route.length; i++) left += Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]);
        const most = Math.min(WALK.speed, Math.sqrt(2 * WALK.accel * left) + 0.15);
        aim = facingOk ? most : 0;
        pace = Math.min(aim, pace + WALK.accel * dt);
        const go = Math.min(d, pace * dt);
        me.x += dx / d * go;
        me.z += dz / d * go;
        keepOut(me);
        me.speed = go / Math.max(dt, 1e-4);
      } else if (s.name === 'way' || Math.abs(angleTo(s.spot.facing)) < 0.08) step = null;
      body = { speed: me.speed, bend: 0, crouch: 0, look: null, left: holding === 'broom' ? { at: ahead(0.08, 1.0, 0.1), held: broom, r: 0.016, dir: V(0, -1, 0) } : holding === 'poker' ? null : inHand >= 0 ? mugHold(ahead(0.3, 1.0, 0.12)) : null, right: holding === 'poker' ? { at: ahead(0.2, 0.9, -0.15), held: poker, r: 0.012, dir: V(0.2, -1, 0.3).normalize() } : null };
      return;
    }
    pace = 0;
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
      me.x = x; me.z = z;
    } else {
      me.x = lerp(me.x, s.spot.x, Math.min(1, dt * 8));
      me.z = lerp(me.z, s.spot.z, Math.min(1, dt * 8));
    }
    keepOut(me);
    turnTo(s.spot.facing, dt);
    (s.at ?? []).forEach(([share, fn], i) => { if (k >= share && !fired.has(i)) { fired.add(i); fn(); } });
    body = { speed: me.speed, bend: 0, crouch: 0, look: null, left: null, right: null, ...(s.pose?.(k, stepT) ?? {}) };
    if (k >= 1) step = null;
  }
  const angleTo = (want: number) => Math.atan2(Math.sin(want - me.facing), Math.cos(want - me.facing));
  const turnTo = (want: number, dt: number) => { const d = angleTo(want); me.facing += clamp(d, -WALK.turn * dt, WALK.turn * dt); };

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
    // (come to rest before him: this game's own hero takes it up; a partner's game sees it waiting for him and does)
    if (s.for === myId()) heroById(s.for)?.drinkAle(W(...s.to.toArray()));
  }
  /** this game's own hero and the mug he's drinking from: taken off the bar as his hand reaches it, set down empty
   *  where his hand puts it at its end (on the bar, or the nearest table if he's walked off from it) */
  let drinking = -1;
  function myDrink(): void {
    const hero = G.player, c = hero?.casting;
    const k = c?.skill.def.ale ? c.t / c.dur : -1, id = myId();
    if (k < 0) { drinking = -1; return; }
    if (drinking < 0 && k >= TAKEN) {
      const mug = ledger.mugs.find((m) => m.place.at === 'bar' && m.for === id && m.full > 0.5);
      if (!mug) return;
      drinking = mug.id;
      tell({ t: 'tv?', a: 'took', id: mug.id }, () => ledger.move(mug.id, { at: 'hero', who: id }, { full: 1 }));
    }
    if (drinking >= 0 && k >= ALE_BEATS.setDown && ledger.get(drinking).place.at === 'hero') {
      const mug = drinking, hand = hero!.model.root.getObjectByName('mug')?.getWorldPosition(new THREE.Vector3()) ?? hero!.pos.clone();
      const at = room(hand), down = setDownAt(at, room(hero!.pos));
      drinking = -2;
      tell({ t: 'tv?', a: 'down', id: mug, ...down }, () => ledger.move(mug, down.y === BAR.top ? { at: 'bar', x: down.x, z: down.z } : { at: 'table', ...down }, { full: 0.03, dirty: true }));
    } else if (drinking >= 0) ledger.fill(drinking, Math.max(0.03, 1 - Math.max(0, k - 0.26) / 0.42));
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
      else if (m.a === 'took' && ledger.get(id)?.place.at === 'bar' && ledger.get(id).for === from) ledger.move(id, { at: 'hero', who: from }, { full: 1 });
      else if (m.a === 'down' && ledger.get(id)?.place.at === 'hero') {
        const y = Number(m.y), place = y === BAR.top ? { at: 'bar' as const, x: Number(m.x), z: Number(m.z) } : { at: 'table' as const, x: Number(m.x), z: Number(m.z), y };
        ledger.move(id, place, { full: 0.03, dirty: true });
      }
      return;
    }
    if (m.t === 'tv' && isGuest()) {
      if (Array.isArray(m.mugs)) {
        ledger.restore(m.mugs as Mug[]);
        // (a mug taken up and gone from the bar may come back washed and be slid here again: its id told again then; kept
        // for good, the same mug served a second time was never taken up, `lab coop --scenarios tavern`)
        for (const id of toldTaken) if (ledger.get(id)?.place.at !== 'bar' || ledger.get(id)?.for !== myId()) toldTaken.delete(id);
        // (a mug the host slid to this game's hero, come to rest: taken up)
        const mine = ledger.mugs.find((x) => x.place.at === 'bar' && x.for === myId() && x.full > 0.5);
        if (mine && !toldTaken.has(mine.id) && G.player) { toldTaken.add(mine.id); G.player.drinkAle(W(mine.place.at === 'bar' ? mine.place.x : 0, BAR.top, mine.place.at === 'bar' ? mine.place.z : 0)); }
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
    body = { speed: sp, bend, crouch, look: null, left: inHand >= 0 ? mugHold(ahead(0.32, 1.02, 0.12)) : null, right: null };
  }

  // --- each frame: the brain where it runs (alone, or the host), his body where he's seen ---
  /** where his body was last posed, and the time since: posed only while the tavern is seen, his root kept with the
   *  brain every frame (posed then from where it last stood, a frame unposed read as his body jumping and a planted
   *  foot sliding) */
  const posedAt = new THREE.Vector3();
  let unposed = 0;
  b.updaters.push(() => {
    // (no time gone since he was last posed, the pose stands: the leg IK skips a frame of no time, which would leave his
    // legs in the walk cycle's own stance)
    if (!keeper || unposed <= 0) return;
    if (!body.look && talking() && G.player) body.look = G.player.pos.clone().setY(G.player.pos.y + 1.55);
    if (Math.hypot(me.x - posedAt.x, me.z - posedAt.z) > STEPPED_AWAY) keeper.placed();
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
      myDrink();
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
    doing: () => ({ job, step: step?.name ?? '', jumped }),
    body: () => body,
    mugAt: (id) => meshes[id].getWorldPosition(new THREE.Vector3()),
    mugMesh: (id) => meshes[id],
    mute() { muted = true; },
    setTask(name) { forced.push(name); plan = []; step = null; attendFor = 0; },
  };
}
