// `lab odo`: Odo's day in his shop as a player meets it (`src/entities/models/odoLife.ts`, posed by `merchant.ts`, his
// shop `src/world/houses/merchant.ts`). The hero walks in with Odo dusting his shelves: he must set the duster down, walk to his
// desk and greet the hero, looking at him, within `GREET_WITHIN`. The hero stays by the door; Odo goes back to work
// within `BACK_WITHIN`, and each of his tasks is taken up in turn and pictured at its heart (a jar lifted and set on
// the shelf, the shelves dusted, the dagger turned in his hands, the coin held up to his eye, a line written), with a
// glance at the hero now and then. Throughout, a foot standing on the floor must stay where it stands (`SLIP`: he
// never slides), each ankle where his day puts it (`REACH`: a leg too short leaves its foot behind), no program may be
// compiled, and his update must cost no more than `COST` a frame by the browser's own clock (its figure is in the
// glance's notes: a line of the report must read the same on every run). `--canary` drags his standing feet along
// under him, which the slip must catch.
import * as THREE from 'three';
import type { Lab, Pictured, Report } from './lab';
import { G } from '../../../src/state';
import { RUST } from '../../../src/engine';
import { outsideOf } from '../../../src/data/houses';
import { enterRoom } from '../../../src/game/rooms';
import { groundHeight } from '../../../src/world/ground';
import type { Odo } from '../../../src/entities/models/merchant';
import type { OdoTask } from '../../../src/entities/models/odoLife';
import { bodyShape, overlaps } from '../../../src/entities/models/anatomy';
import { handCapsules, type Hand } from '../../../src/entities/models/hands';
import { segmentDistance } from './geometry';
import { toVillage } from './village';
import { PIPELINES } from '../../../src/engine/pipelinesAside';

/** `--canary`: his standing feet dragged along under him. */
export interface OdoOptions {
  canary: boolean;
}

/** the most a standing foot may move a frame, and an ankle stand off where it's put (m) */
const SLIP = 0.004;
const REACH = 0.01;
/** how soon he must greet the hero walking in, be back at work after, and come to each task's heart (s) */
const GREET_WITHIN = 9;
const BACK_WITHIN = 16;
const TASK_WITHIN = 40;
/** the most his update may cost a frame at its 90th percentile (ms) */
const COST = 0.5;
/** the lab's frames a second */
const FPS = 60;
/** where the hero stands in the shop, by its door, out of reach of the counter (its frame) */
const BY_DOOR = { x: 0.6, z: 2.9 };
/** his ankle over the floor (merchant.ts `ANKLE_H`), and how far each foot stands from his middle (odoLife.ts) */
const ANKLE_H = 0.086;
const STANCE = 0.105;

const programs = (): number => PIPELINES.made;
const realNow = (): number => (window as unknown as { __labClock: { realNow: () => number } }).__labClock.realNow();
const footName = (i: number): string => (i === 0 ? 'left' : 'right');
const mm = (m: number): string => (m * 1000).toFixed(1);
const secs = (frames: number): string => (frames / FPS).toFixed(1);

/** how far (m) his arm may go into the counter, his arms into his body, and the quill or the dagger's blade into a
 *  hand's capsules (a hand's surface, its fingers as their capsules: a pad pressed on a shaft is a millimetre or
 *  two) */
const INTO = { counter: 0.012, body: 0.02, held: 0.004 };
/** the counter's half length along x (shop.ts: 4.2 m and its top's overhang) */
const COUNTER_HALF = 2.15;

/** The deepest a check found, and where. */
interface Deepest { depth: number; at: string }

/** What is watched every frame he's posed: his feet, his ankles, his arms against the counter and his body, the quill
 *  and the dagger's blade against his hands; and his update's cost every frame. */
interface Watch {
  slip: number;
  slipAt: string;
  reach: number;
  reachAt: string;
  costs: number[];
  counter: Deepest;
  body: Deepest;
  quill: Deepest;
  blade: Deepest;
  /** the body's worst moment pictured, as it was found */
  bodyAt?: Pictured;
}

/** `found` kept in `deepest` if it's deeper */
function deeper(deepest: Deepest, depth: number, at: string): void {
  if (depth > deepest.depth) Object.assign(deepest, { depth, at });
}

/** How far the point `at` (the shop's frame) is inside the counter, or 0. */
function intoCounter(odo: Odo, at: THREE.Vector3): number {
  const { top, near, far } = odo.life.shop.counter;
  const depth = Math.min(at.x + COUNTER_HALF, COUNTER_HALF - at.x, at.z - near, far - at.z, top - at.y);
  return Math.max(0, depth);
}

/** His arms' points (the upper arm's middle, the elbow, the forearm's middle, the wrist) against the counter. */
function armsAgainstCounter(odo: Odo, seen: Watch): void {
  const j = odo.joints, shop = odo.root.parent!;
  const point = new THREE.Vector3();
  const elbow = new THREE.Vector3();
  const hand = new THREE.Vector3();
  const shoulder = new THREE.Vector3();
  const arms = [['left', j.shoulderL, j.elbowL, j.handL], ['right', j.shoulderR, j.elbowR, j.handR]] as const;
  for (const [name, s, e, h] of arms) {
    s.getWorldPosition(shoulder);
    e.getWorldPosition(elbow);
    h.getWorldPosition(hand);
    const points: [string, THREE.Vector3][] = [
      ['upper arm', shoulder.clone().lerp(elbow, 0.5)],
      ['elbow', elbow],
      ['forearm', elbow.clone().lerp(hand, 0.5)],
      ['wrist', hand],
    ];
    for (const [part, at] of points) {
      deeper(seen.counter, intoCounter(odo, shop.worldToLocal(point.copy(at))), `${odo.life.now}, his ${name} ${part}`);
    }
  }
}

/** where his hands are wanted this frame (his root's frame, and how far toward it), to say where a fault was */
function handsAimed(odo: Odo): string {
  const d = odo.life.doing;
  const at = (v: THREE.Vector3) => `${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)}`;
  const elbow = (joint: THREE.Object3D) => at(odo.root.worldToLocal(joint.getWorldPosition(new THREE.Vector3())));
  const w = odo.life.walker;
  const inHand = odo.life.things.filter((t) => t.held).map((t) => `${t.obj.name || t.obj.type} in ${t.held}`);
  const held = inHand.join(', ') || 'nothing';
  const stand = `at ${w.x.toFixed(2)},${w.z.toFixed(2)} facing ${w.yaw.toFixed(2)}, holding ${held}; `;
  return ` (${stand}left to ${at(d.L.at)} by ${d.L.w.toFixed(2)}, its elbow at ${elbow(odo.joints.elbowL)}; right to `
    + `${at(d.R.at)} by ${d.R.w.toFixed(2)}, its elbow at ${elbow(odo.joints.elbowR)})`;
}

/** The capsules of `hand` in the world: each its two ends and its radius. */
function capsulesOf(hand: Hand): [THREE.Vector3, THREE.Vector3, number][] {
  return handCapsules(hand).map(([[ja, pa], [jb, pb], r]) => {
    const capsule: [THREE.Vector3, THREE.Vector3, number] = [
      ja.localToWorld(pa.clone()), jb.localToWorld(pb.clone()), r,
    ];
    return capsule;
  });
}

/** How far the segment a to b (`r` thick) goes into any of `hands`' capsules. */
function intoHands(hands: Hand[], a: THREE.Vector3, b: THREE.Vector3, r: number): number {
  let depth = 0;
  for (const hand of hands) {
    for (const [ca, cb, cr] of capsulesOf(hand)) depth = Math.max(depth, cr + r - segmentDistance(a, b, ca, cb));
  }
  return depth;
}

/** The quill's shaft past his pinch (from 3.5 cm up from its nib), and the dagger's blade, against his hands. */
function heldAgainstHands(odo: Odo, seen: Watch): void {
  const quill = odo.root.getObjectByName('odo quill shaft')?.parent;
  if (quill && quill.getWorldScale(new THREE.Vector3()).x > 0.5) {
    const a = quill.localToWorld(new THREE.Vector3(0, 0.035, 0));
    const b = quill.localToWorld(new THREE.Vector3(0, 0.21, 0));
    deeper(seen.quill, intoHands([odo.hands.L], a, b, 0.002), `${odo.life.now}, the quill`);
  }
  const dagger = odo.life.shop.blade.dagger;
  if (dagger.held) {
    const a = dagger.obj.localToWorld(new THREE.Vector3(0, 0.13, 0));
    const b = dagger.obj.localToWorld(new THREE.Vector3(0, 0.3, 0));
    deeper(seen.blade, intoHands([odo.hands.L], a, b, 0.004), `${odo.life.now}, the blade into his left hand`);
    deeper(seen.blade, intoHands([odo.hands.R], a, b, 0.004), `${odo.life.now}, the blade into his right hand`);
  }
}

/** The hero put at (x, z) of the shop's frame, facing `facing`. */
function standInShop(x: number, z: number, facing: number): void {
  const room = G.arena.rooms!.merchant;
  room.group.updateMatrixWorld(true);
  const at = room.group.localToWorld(new THREE.Vector3(x, 0, z));
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(at.x, groundHeight(at.x, at.z), at.z), facing);
}

/** The canary's fault: his feet that stand on the floor kept under his moving body, which is what sliding is. */
function dragFeet(odo: Odo): void {
  const walker = odo.life.walker;
  const across = Math.cos(walker.yaw);
  const along = Math.sin(walker.yaw);
  walker.feet.forEach((foot, i) => {
    if (foot.step) return;
    const side = (i === 0 ? 1 : -1) * STANCE;
    foot.x = walker.x + side * across;
    foot.z = walker.z - side * along;
  });
}

/** His update wrapped: timed, and his feet read after it each frame he's posed (`canary`: his feet dragged first). */
function watch(lab: Lab, odo: Odo, seen: Watch, canary: boolean): void {
  const update = odo.update.bind(odo);
  const shape = bodyShape(odo.joints, { L: odo.hands.L.vis, R: odo.hands.R.vis });
  const life = odo.life;
  const ankles = [odo.root.getObjectByName('odo ankleL')!, odo.root.getObjectByName('odo ankleR')!];
  const before = [new THREE.Vector3(), new THREE.Vector3()];
  const stood = [false, false];
  const now = new THREE.Vector3();
  const want = new THREE.Vector3();
  odo.update = (dt, scene, far) => {
    if (canary) dragFeet(odo);
    const arrivals = life.arrivals;
    const start = realNow();
    update(dt, scene, far);
    seen.costs.push(realNow() - start);
    // (stood in his place as the shop opens: no step)
    if (life.arrivals !== arrivals) stood.fill(false);
    if (!odo.posed) return;
    const shop = odo.root.parent!;
    shop.updateMatrixWorld(true);
    armsAgainstCounter(odo, seen);
    heldAgainstHands(odo, seen);
    const into = overlaps(shape, 0)[0];
    if (into && into.depth > seen.body.depth + 0.01) {
      const notes = [`his ${into.limb} into his ${into.solid} by ${mm(into.depth)} mm, at ${life.now}`];
      seen.bodyAt = pictureOdo(lab, odo, 'odo-into-body', [FRONT, SIDE, BEHIND], notes, { distance: 2.2 });
    }
    if (into) deeper(seen.body, into.depth, `${life.now}, his ${into.limb} into his ${into.solid}${handsAimed(odo)}`);
    life.walker.feet.forEach((foot, i) => {
      ankles[i].getWorldPosition(now);
      const standing = !foot.step && foot.lift === 0;
      const where = `${life.now}, his ${footName(i)} foot`;
      if (standing && stood[i]) {
        const slip = Math.hypot(now.x - before[i].x, now.z - before[i].z);
        if (slip > seen.slip) Object.assign(seen, { slip, slipAt: where });
      }
      stood[i] = standing;
      before[i].copy(now);
      shop.localToWorld(want.set(foot.x, ANKLE_H + foot.lift, foot.z));
      const off = now.distanceTo(want);
      if (off > seen.reach) Object.assign(seen, { reach: off, reachAt: where });
    });
  };
}

/** Where a picture is taken from round Odo: an angle from his own front (rad, his left +), or (`room`) from the
 *  shop's door's way, or (`along`) along the way behind his counter from its further end; and its name. */
interface Side {
  angle: number;
  name: string;
  room?: boolean;
  along?: boolean;
  /** from above it at that angle (the lab's `above` view), not level with it */
  above?: boolean;
}
const FRONT: Side = { angle: 0.5, name: 'front, three-quarters' };
const SIDE: Side = { angle: 1.4, name: 'side' };
/** facing a wall (stocking, dusting): from over each shoulder and from each side, on the room's open side */
const OVER_RIGHT: Side = { angle: -2.3, name: 'over his right shoulder' };
const RIGHT: Side = { angle: -1.5, name: 'his right' };
const OVER_LEFT: Side = { angle: 2.3, name: 'over his left shoulder' };
const LEFT: Side = { angle: 1.5, name: 'his left' };
/** straight behind him, and straight on from the room */
const BEHIND: Side = { angle: Math.PI, name: 'behind' };
const ROOM_ON: Side = { angle: 0, name: 'the room from its door', room: true };
/** over his hand from above and in front, as the player looks down on him writing */
const ABOVE: Side = { angle: 0.3, name: 'from above', above: true };
/** how far round from the hero's facing the lab's `above` view looks from (lab.ts's close-ups) */
const ABOVE_TURN = Math.PI + 0.35;
/** walking or turning: from the room's side, wherever he faces (from its left the armour stand stood in the way) */
const ROOM: Side = { angle: -0.6, name: 'from the room', room: true };
/** his legs and steps, which the counter hides from the room */
const ALONG: Side = { angle: 0, name: 'along behind the counter', room: true, along: true };

/** The camera's way from Odo for `side`, as an angle in the shop's frame. */
function sideYaw(odo: Odo, side: Side): number {
  const walker = odo.life.walker;
  if (side.along) return walker.x < 0 ? Math.PI / 2 : -Math.PI / 2;
  return (side.room ? 0 : walker.yaw) + side.angle;
}

/** How a picture of him is framed: from how far, and on what (one of his joints by name, or a point of his root's
 *  frame; his middle by default). */
interface Framing {
  distance?: number;
  joint?: string;
  point?: THREE.Vector3;
  /** how far above the joint (m, the world's up) */
  lift?: number;
}

/** Where `framing` points in the world. */
function framedOn(odo: Odo, framing: Framing): THREE.Vector3 {
  odo.root.updateMatrixWorld(true);
  const joint = framing.joint ? odo.root.getObjectByName(framing.joint) : undefined;
  if (joint) return joint.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, framing.lift ?? 0, 0));
  return odo.root.localToWorld((framing.point ?? new THREE.Vector3(0, 1.0, 0.1)).clone());
}

/**
 * Odo pictured from each of `sides`, framed as `framing` says. The lab's views turn with the hero's facing, so the
 * hero (who is out of the picture) is turned for each to put the camera there, and turned back.
 */
function pictureOdo(
  lab: Lab, odo: Odo, label: string, sides: Side[], notes: string[], framing: Framing = {},
): Pictured {
  const shop = odo.root.parent!;
  const at = framedOn(odo, framing);
  const distance = framing.distance ?? 3.2;
  const turn = shop.getWorldQuaternion(new THREE.Quaternion());
  const keep = G.player.facing;
  const tiles: Pictured['tiles'] = [];
  for (const side of sides) {
    const yaw = sideYaw(odo, side);
    const way = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).applyQuaternion(turn);
    // (the 'front' view looks from the hero's facing; 'above' from half a turn and a little round from it, high)
    G.player.facing = Math.atan2(way.x, way.z) - (side.above ? ABOVE_TURN : 0);
    const shot = lab.picture(label, [side.above ? 'above' : 'front'], [], { at, distance });
    tiles.push(...shot.tiles.map((tile) => ({ ...tile, view: side.name })));
  }
  G.player.facing = keep;
  return { label, tiles, notes };
}

/** Frames stepped until `done` (at most `limit` s of them): the frames it took, or -1. */
async function stepUntil(lab: Lab, done: () => boolean, limit: number): Promise<number> {
  for (let frame = 0; frame < limit * FPS; frame++) {
    if (done()) return frame;
    await lab.step(1);
  }
  return done() ? limit * FPS : -1;
}

/** A close-up taken with a task's heart. */
interface CloseUp {
  label: string;
  sides: Side[];
  framing: Framing;
  notes: string;
}

/** A task's heart: the moment it's pictured at (once `at` holds, `wait` s after), from where, and its close-ups. */
interface Heart {
  task: OdoTask;
  at: (odo: Odo) => boolean;
  wait: number;
  sides: Side[];
  notes: string;
  closeUps?: CloseUp[];
}
const HEARTS: Heart[] = [
  {
    task: 'stock', at: (o) => o.life.shop.stock.jars[0].held === 'L', wait: 0.7, sides: [OVER_RIGHT, RIGHT],
    notes: 'stocking: a jar lifted from the crate, turned to the shelf',
    closeUps: [{
      label: 'odo-grip-jar', sides: [RIGHT, OVER_RIGHT], framing: { joint: 'odo handL', distance: 0.6 },
      notes: 'the jar in his hand',
    }],
  },
  {
    task: 'stock', at: (o) => o.life.shop.stock.jars[1].held === 'L', wait: 1.1, sides: [OVER_RIGHT, RIGHT],
    notes: 'stocking: the second jar set on the shelf',
  },
  {
    task: 'dust', at: (o) => !!o.life.doing.dusting, wait: 2.0, sides: [OVER_LEFT, LEFT],
    notes: 'dusting the shelves',
    closeUps: [{
      label: 'odo-grip-duster', sides: [LEFT, OVER_LEFT], framing: { joint: 'odo handR', distance: 0.7 },
      notes: 'the duster in his hand',
    }, {
      label: 'odo-shoulder', sides: [OVER_RIGHT, BEHIND], framing: { joint: 'odo shoulderR', distance: 1.0 },
      notes: 'his shoulder from above and behind: the sleeve closed at its top',
    }],
  },
  {
    task: 'inspect', at: (o) => o.life.shop.blade.dagger.held === 'R', wait: 2.2, sides: [FRONT, SIDE],
    notes: 'looking over the dagger, turning it in his hands',
    closeUps: [{
      label: 'odo-elbow', sides: [SIDE, FRONT], framing: { joint: 'odo elbowR', distance: 0.9 },
      notes: 'his elbow bent: the rolled sleeve and the forearm',
    }, {
      label: 'odo-grip-dagger', sides: [FRONT, SIDE, ABOVE], framing: { joint: 'odo handR', distance: 0.7 },
      notes: 'the dagger in his hands',
    }],
  },
  {
    task: 'weigh', at: (o) => o.life.doing.coin, wait: 2.6, sides: [FRONT, SIDE],
    notes: 'a coin from the scale held up to his eye',
    closeUps: [{
      label: 'odo-grip-coin', sides: [FRONT, SIDE], framing: { joint: 'odo coin', distance: 0.5 },
      notes: 'the coin pinched in his fingers',
    }, {
      label: 'odo-scale', sides: [FRONT, ABOVE], framing: { point: new THREE.Vector3(-0.5, 1.22, 0.6), distance: 1.0 },
      notes: 'his scale and the gems in their bowl',
    }],
  },
  {
    task: 'write', at: (o) => o.life.doing.quill, wait: 2.5, sides: [FRONT, SIDE],
    notes: 'writing in his ledger',
    closeUps: [{
      label: 'odo-pen', sides: [FRONT, SIDE, ABOVE], framing: { joint: 'odo handL', distance: 0.55 },
      notes: 'his hand on the pen, writing',
    }],
  },
];

/** How far (degrees) his head's way is off the hero's, flat. */
function headOffHero(odo: Odo): number {
  const head = odo.root.getObjectByName('odo head')!;
  const at = head.getWorldPosition(new THREE.Vector3());
  const ahead = new THREE.Vector3(0, 0, 1).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()));
  ahead.setY(0).normalize();
  const toHero = G.player.pos.clone().sub(at).setY(0).normalize();
  return THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(ahead.dot(toHero), -1, 1)));
}

/** Where the duster is: in his hand, in its pot, or set down on the counter. */
function dusterIs(odo: Odo): string {
  const duster = odo.life.shop.dust.duster;
  if (duster.held) return 'still in his hand';
  return duster.at.pos.distanceTo(duster.home.pos) < 0.02 ? 'in its pot' : 'set down on the counter';
}

/** The hero walks in on Odo dusting: the duster set down, his desk reached, the hero greeted and looked at. */
async function walkIn(lab: Lab, odo: Odo, lines: string[], problems: string[], moments: Pictured[]): Promise<void> {
  const life = odo.life;
  const out = outsideOf('merchant');
  G.player.place(new THREE.Vector3(out.x, groundHeight(out.x, out.z), out.z), out.facing + Math.PI);
  await lab.step(5);
  // (some way into his dusting as the shop is come into)
  life.asked = 'dust';
  enterRoom('merchant');
  await lab.until(() => G.arena.room === 'merchant', 600, 'the shop never opened');
  standInShop(BY_DOOR.x, BY_DOOR.z, Math.PI);
  await lab.step(2);
  lines.push(`walked in: he was ${life.now === 'serve' ? 'serving' : `at ${life.now}`}`);
  moments.push(pictureOdo(lab, odo, 'odo-greet-1-noticed', [ROOM, ALONG], ['the hero walks in: Odo stops dusting']));
  const walking = await stepUntil(lab, () => life.walker.speed > 0.3, 4);
  if (walking >= 0) {
    const notes = ['he walks to his desk, a step at a time'];
    moments.push(pictureOdo(lab, odo, 'odo-greet-2-walking', [ALONG, ROOM], notes));
    moments.push(await walkFrames(lab, odo));
  }
  const desk = life.shop.desk;
  const atDesk = () => Math.hypot(life.walker.x - desk.x, life.walker.z - desk.z) < 0.05 && life.walker.arrived;
  const reached = await stepUntil(lab, atDesk, GREET_WITHIN);
  if (reached < 0) problems.push(`walked in on, he wasn't at his desk within ${GREET_WITHIN} s (${life.now})`);
  await lab.step(Math.round(0.6 * FPS));
  const greets = ['at his desk he nods and raises a hand to the hero'];
  moments.push(pictureOdo(lab, odo, 'odo-greet-3-greets', [FRONT, SIDE], greets, { distance: 3 }));
  moments.push(await lab.screen('odo-greet-4-player', ['as the player sees him greet them']));
  // (what the frame the player sees takes to draw: the screen's render just drawn)
  // (the engine's counts: three's `info.render` is its own, the overlays' alone under the engine)
  const drawn = RUST.bridge?.stats;
  lines.push(`the shop as the player sees it: ${drawn?.draws ?? 0} draws, ${drawn?.triangles ?? 0} triangles`);
  const off = headOffHero(odo);
  lines.push(`greeting: at his desk ${reached >= 0 ? `after ${secs(reached)} s` : 'never'}, `
    + `his head ${off.toFixed(0)} deg off the hero`);
  if (off > 25) problems.push(`greeting, his head is ${off.toFixed(0)} deg off the hero`);
  lines.push(`the duster: ${dusterIs(odo)}`);
  if (odo.life.shop.dust.duster.held) problems.push('greeting, he still holds the duster');
  // (waiting at his desk for the hero, and the room round him)
  await lab.step(Math.round(2.5 * FPS));
  const waits = ['waiting at his desk while the hero looks round'];
  moments.push(pictureOdo(lab, odo, 'odo-waiting', [FRONT, SIDE], waits, { distance: 2.6 }));
  // (his face close, from the front, each side and behind: his ears against his head, under his hat's brim)
  const faceSides: Side[] = [
    { angle: 0, name: 'front' }, { angle: 1.5, name: 'his left' }, { angle: -1.5, name: 'his right' }, BEHIND,
  ];
  // (framed on his eyes, a hand over the head's joint: on the joint, it showed his beard and not his ears)
  const face = { joint: 'odo head', distance: 0.55, lift: 0.1 };
  moments.push(pictureOdo(lab, odo, 'odo-face', faceSides, ['his face and ears, close'], face));
  // (his elbow at the rolled sleeve, bent as his hands rest on the counter, from his side and behind)
  const elbowSides: Side[] = [{ angle: 1.6, name: 'his left' }, { angle: 2.4, name: 'behind his left' }];
  const elbowAt = { joint: 'odo elbowL', distance: 0.5 };
  moments.push(pictureOdo(lab, odo, 'odo-elbow-bent', elbowSides, ['his elbow bent, at the rolled sleeve'], elbowAt));
  const room = ['his shop round him: shelves, crate, counter, scale, ledger'];
  const roomFraming = { point: new THREE.Vector3(0, 1.2, 0.4), distance: 5 };
  moments.push(pictureOdo(lab, odo, 'odo-room', [ROOM_ON, ROOM], room, roomFraming));
  // (the showpieces: the sword on its velvet board behind his desk, and the circlet on its stand at the counter's end)
  const sword = { point: new THREE.Vector3(-0.1, 1.6, -0.8), distance: 1.9 };
  moments.push(pictureOdo(lab, odo, 'odo-showpiece-sword', [{ angle: 0.45, name: 'from the counter', room: true }],
    ['the showpiece behind his desk'], sword));
  const circlet = { point: new THREE.Vector3(-1.85, 1.2, 0.7), distance: 0.75 };
  moments.push(pictureOdo(lab, odo, 'odo-showpiece-circlet', [{ angle: 0.5, name: 'from the counter', room: true }],
    ['the circlet on its stand'], circlet));
  // (the display table by the door, from above as the player sees it and level with it; in his frame at his desk)
  const table = { point: new THREE.Vector3(-1.7, 0.85, 4.35), distance: 1.6 };
  const tableSides: Side[] = [
    { angle: 1.2, name: 'from above, as the player sees it', room: true, above: true },
    { angle: 0.9, name: 'level with it', room: true },
  ];
  moments.push(pictureOdo(lab, odo, 'odo-display-table', tableSides, ['the display table by the door'], table));
}

/** His walk in four frames a fifth of a second apart, from along behind the counter, framed on his legs. */
async function walkFrames(lab: Lab, odo: Odo): Promise<Pictured> {
  const tiles: Pictured['tiles'] = [];
  for (let frame = 0; frame < 4; frame++) {
    const legs = { point: new THREE.Vector3(0, 0.75, 0), distance: 2.6 };
    const shot = pictureOdo(lab, odo, 'odo-walk-frames', [ALONG], [], legs);
    tiles.push(...shot.tiles.map((tile) => ({ ...tile, view: `${(frame * 0.2).toFixed(1)} s` })));
    await lab.step(Math.round(0.2 * FPS));
  }
  // (from low behind as he walks along behind the counter, the one way nothing stands between: what he wears under
  // his waistcoat, which a low camera sees)
  const low = { point: new THREE.Vector3(0, 0.55, 0), distance: 1.7 };
  const behind = pictureOdo(lab, odo, 'odo-walk-frames', [BEHIND, SIDE], [], low);
  tiles.push(...behind.tiles.map((tile) => ({ ...tile, view: `low, ${tile.view}` })));
  return { label: 'odo-walk-frames', tiles, notes: ['his walk, a fifth of a second apart; then from low behind'] };
}

/** Each task taken up in turn and pictured at its heart. */
async function eachTask(lab: Lab, odo: Odo, lines: string[], problems: string[], moments: Pictured[]): Promise<void> {
  const life = odo.life;
  for (const heart of HEARTS) {
    if (life.now !== heart.task) {
      life.force(heart.task);
      await lab.step(1);
    }
    const found = await stepUntil(lab, () => life.now === heart.task && heart.at(odo), TASK_WITHIN);
    if (found < 0) {
      problems.push(`${heart.task}: never came to "${heart.notes}" (at ${life.now})`);
      continue;
    }
    await lab.step(Math.round(heart.wait * FPS));
    moments.push(pictureOdo(lab, odo, `odo-${heart.task}-${moments.length}`, heart.sides, [heart.notes]));
    for (const close of heart.closeUps ?? []) {
      moments.push(pictureOdo(lab, odo, close.label, close.sides, [close.notes], close.framing));
    }
    lines.push(`${heart.task}: "${heart.notes}" after ${secs(found)} s`);
    if (heart.task === 'weigh') coinInFingers(odo, lines, problems);
  }
}

/** how far the coin's middle may be from the nearest of his digits' last joints (m): its last segment (about 2 cm)
 *  and the coin's half (1.7 cm) held out past its pad; in his palm it was 4 cm off */
const COIN_NEAR = 0.045;

/** The coin as he holds it up: shown at its size, in his right hand, its middle within `COIN_NEAR` of his
 *  fingertips (from play: stuck to the middle of a flat palm, "never seen a person hold a coin
 *  like that"). */
function coinInFingers(odo: Odo, lines: string[], problems: string[]): void {
  const coin = odo.root.getObjectByName('odo coin');
  const hand = odo.root.getObjectByName('odo handR');
  if (!coin || !hand) {
    problems.push('weigh: no coin or right hand to read');
    return;
  }
  odo.root.updateMatrixWorld(true);
  const at = coin.getWorldPosition(new THREE.Vector3());
  // (the nearest of his digits' last joints, each a leaf of the hand's joints, its tip's segment)
  let near = Infinity;
  hand.traverse((joint) => {
    if (joint.children.length || !(joint as THREE.Group).isGroup) return;
    near = Math.min(near, joint.getWorldPosition(new THREE.Vector3()).distanceTo(at));
  });
  const size = coin.getWorldScale(new THREE.Vector3()).x;
  lines.push(`weigh: the coin at ${size > 0.5 ? 'its size' : 'no size'}, ${(near * 100).toFixed(1)} cm from his `
    + `nearest fingertip joint, in his ${coin.parent === hand ? 'right hand' : 'other place'}`);
  if (size < 0.5) problems.push('weigh: the coin is not shown as he holds it up');
  if (near > COIN_NEAR) {
    problems.push(`weigh: the coin is ${(near * 100).toFixed(1)} cm from his fingertips, not in them`);
  }
}

/** The watch's verdicts: his feet, the programs, his cost (its figure returned for a picture's notes). */
function judge(seen: Watch, compiled: number, lines: string[], problems: string[]): string {
  const sorted = [...seen.costs].sort((a, b) => a - b);
  const mean = sorted.reduce((sum, cost) => sum + cost, 0) / Math.max(1, sorted.length);
  const p90 = sorted[Math.floor(sorted.length * 0.9)] ?? 0;
  lines.push(`feet: a standing foot moved at most ${mm(seen.slip)} mm a frame (${seen.slipAt || 'none'}), `
    + `an ankle stood off its place by ${mm(seen.reach)} mm (${seen.reachAt || 'none'})`);
  lines.push(`programs compiled in the shop: ${compiled}`);
  const checks: [string, Deepest, number][] = [
    ['his arm into the counter', seen.counter, INTO.counter], ['his arm into his body', seen.body, INTO.body],
    ['the quill into his hand', seen.quill, INTO.held], ["the dagger's blade into his hands", seen.blade, INTO.held],
  ];
  for (const [what, deepest, most] of checks) {
    lines.push(`${what}: at most ${mm(deepest.depth)} mm (${deepest.at})`);
    if (deepest.depth > most) problems.push(`${what} by ${mm(deepest.depth)} mm (${deepest.at})`);
  }
  if (seen.slip > SLIP) problems.push(`a standing foot slid ${mm(seen.slip)} mm in a frame (${seen.slipAt})`);
  if (seen.reach > REACH) {
    problems.push(`an ankle stood ${mm(seen.reach)} mm off where his day put it (${seen.reachAt})`);
  }
  if (compiled) problems.push(`${compiled} programs compiled in the shop`);
  if (p90 > COST) problems.push(`his update took ${p90.toFixed(3)} ms a frame at its 90th percentile, over ${COST}`);
  return `his update: ${mean.toFixed(3)} ms a frame on average, ${p90.toFixed(3)} at the 90th percentile`;
}

export async function odo(lab: Lab, options: OdoOptions): Promise<Report> {
  const lines: string[] = [];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  await toVillage(lab);
  const odo = G.arena.rooms?.merchant?.odo?.();
  if (!odo) return { text: 'no Odo', problems: ['the shop or Odo is not built'], moments };
  lab.drawing = true;
  const none = (): Deepest => ({ depth: 0, at: 'none' });
  const seen: Watch = {
    slip: 0, slipAt: '', reach: 0, reachAt: '', costs: [], counter: none(), body: none(), quill: none(), blade: none(),
  };
  watch(lab, odo, seen, options.canary);
  const compiledBefore = programs();
  await walkIn(lab, odo, lines, problems, moments);
  // --- the hero stays by the door: back to work, each task, a glance ---
  const back = await stepUntil(lab, () => odo.life.now !== 'serve', BACK_WITHIN);
  lines.push(`back to work: ${back >= 0 ? `after ${secs(back)} s, at ${odo.life.now}` : 'never'}`);
  if (back < 0) problems.push(`with the hero by the door he didn't go back to work within ${BACK_WITHIN} s`);
  await eachTask(lab, odo, lines, problems, moments);
  // (at his ledger, facing the room: a glance up from it)
  odo.life.force('write');
  const glance = await stepUntil(lab, () => odo.life.glancing > 0.6 && odo.life.glancing < 1.4, 30);
  const cost = judge(seen, programs() - compiledBefore, lines, problems);
  if (glance >= 0) {
    const notes = ['now and then he glances over at the hero', cost];
    moments.push(pictureOdo(lab, odo, 'odo-glance', [FRONT, SIDE], notes));
    lines.push(`a glance at the hero while ${odo.life.now} after ${secs(glance)} s`);
  } else {
    problems.push('in 30 s at work he never glanced at the hero');
  }
  if (seen.bodyAt && seen.body.depth > INTO.body) moments.push(seen.bodyAt);
  if (!options.canary) return { text: lines.join('\n'), problems, moments };
  const caught = problems.some((line) => line.startsWith('a standing foot slid'));
  lines.push(`canary: ${caught ? 'caught' : 'missed'} (his standing feet dragged under him)`);
  return { text: lines.join('\n'), problems: caught ? [] : ['canary: a planted fault went unseen'], moments };
}
