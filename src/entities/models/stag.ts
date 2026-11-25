// The Stag of Ash (entities/stag.ts): a huge stag of charred wood, its shoulder over two men's height, as if a great
// stag of the old wood had burnt standing and walked on. Its hide is char, split into plates by cracks that glow with
// the embers still burning under it (the cracks' own glow, brighter in its second phase and as it charges); its mane
// and the ridge of its back are splinters of grey ash; its eyes and nostrils are coals. Its antlers are blackened
// branches, flames licking at every tine (their smoke and sparks are entities/stag.ts's frame hook).
// Its legs are chains of joints (hip, knee, fetlock): a lateral walk, a transverse gallop as it charges (its hinds
// then its fores a beat apart, then the leap, its back rocking), a hoof pawing the earth through a charge's warning
// (`ActionState.hit` from the data), its head lowered, antlers forward. Its hooves are planted (from Victor's bar for
// the bosses, "would not be possible irl": at a charge's 15 m/s its gallop on a clock of its own skated each hoof
// near a metre a stride): each leg's step cycle is keyed to the ground it covers, a hoof is held where it landed
// while it bears the stag, and the leg's joints are solved to reach it (`stepLegs`; `lab boss --parts stagStride`). Through its weak-spot window it has crashed: it reels, its head hung
// and shaking. Killed, its legs fold and it sinks, its embers going out.
// Drawn in its crowd (models/crowd.ts): every change is a joint's place or a glow's strength, nothing hidden.
import * as THREE from 'three';
import { createKit } from '../../core/materials';
import { bark, grunge, pbrMaterialMaps, veins } from '../../core/textures';
import { joint, ramp } from './rig';
import { STAG } from '../../data/foes/stag';
import { groundHeight, groundUnder } from '../../world/ground';
import { Sculpt, branches, leaf, limb, organic, skipping, taperTube } from './shapes';
import { mulberry } from '../../util';
import type { AnimState, Model } from '../../types';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const NONE = new THREE.BufferGeometry();
/** a geometry made only where the kind's pieces aren't replayed (models/shapes.ts) */
const made = (f: () => THREE.BufferGeometry): THREE.BufferGeometry => (skipping() ? NONE : f());

/** its back's height over the floor at rest (m: its body's joint): its hooves on the floor, each pair's two long
 *  bones reaching 0.92 of their length from hip to cannon, alike, room to reach a stance's ends before and behind it.
 *  At 3.3, posed at their rest angles, its fores reached 0.37 m into the earth (planted, they folded to a crouch); at
 *  3.6 its hinds stood near straight and couldn't reach before or behind */
const BODY_Y = 3.42;
/** a leg's three bones (m, top down) and how each is set at rest (rad about x: + back), fore and hind; the hind's
 *  stifle forward and hock back, as a deer's */
const FORE = { bones: [1.38, 1.36, 0.42], rest: [0.08, -0.12, 0.04], r: [0.3, 0.17, 0.13] };
const HIND = { bones: [1.32, 1.28, 0.72], rest: [-0.32, 0.72, -0.4], r: [0.38, 0.19, 0.13] };
/** where its legs hang from its body (m: across, down, along) */
const LEGS: { at: [number, number, number]; hind: boolean; side: number; walk: number }[] = [
  { at: [0.48, -0.3, 1.35], hind: false, side: 1, walk: 0.25 },
  { at: [-0.48, -0.3, 1.35], hind: false, side: -1, walk: 0.75 },
  { at: [0.52, -0.1, -1.4], hind: true, side: 1, walk: 0 },
  { at: [-0.52, -0.1, -1.4], hind: true, side: -1, walk: 0.5 },
];
/** Its gallop (a deer's transverse gallop): when each leg lands in the stride (`LEGS`' order, fore left, fore right,
 *  hind left, hind right: the hind right, the hind left a beat on, then the fore right and the fore left, then the
 *  stride's leap with its legs gathered under it), and how far its back rises and pitches over a stride. Its posed legs
 *  where its hooves aren't planted (the lab's canary, `stride.carried`; folding as it dies) take its old clock (`hz`
 *  strides a second), the share each hoof is down, and how far a leg reaches forward and drives back (rad). */
const GALLOP = { hz: 2.1, duty: 0.3, lands: [0.52, 0.42, 0.1, 0], reach: 0.5, drive: 0.5, rise: 0.2, pitch: 0.08 };
/** Its strides on planted hooves, keyed to the ground it covers: a stride every `stride` m (the gallop's 2.1 a second
 *  at a charge's 15 m/s), each hoof on the earth `duty` of it (a deer's gallop under a quarter, its walk well over
 *  half), lifted `lift` m at the top of its swing, its cannon tucked back `tuck` rad (fore, hind) as it comes
 *  through; each leg's landing in the stride (`LEGS`' order: the gallop's `GALLOP.lands`, the walk's `walk`). */
const STRIDES = {
  walk: { stride: 2.2, duty: 0.65, lift: 0.32, tuck: [0.6, 0.35] },
  gallop: { stride: 7.2, duty: 0.2, lift: 0.75, tuck: [1.3, 0.8] },
};
/** how much lower its body goes walking (m), its legs reaching out before and behind it (the gallop's own `-0.12`):
 *  at 0.07 its hind legs stood at 0.97 of their length with a hoof 16 cm behind the hip, and a long walk at its full
 *  pace (after a breath, a hero far off) landed one hind hoof already out of reach as the other came to its end, both
 *  stepping as a fore one swung and one hoof bearing it (`lab boss --parts stagStride`); now they reach 0.90 at most */
const WALK_LOW = 0.2;
/** a planted hoof steps once its leg reaches out past this share of its two long bones' length (a moment before
 *  it locks out: stretched, it couldn't hold its hoof as it lifted, and dragged it 3 cm along the floor) */
const NEAR_REACH = 0.985;
/** a planted hoof its leg can't reach steps in this (s), lifted and set down under it */
const QUICK_STEP = 0.22;
/** a stride's swing this far through as its gait puts it on the earth has landed (else it was cut short) */
const SWUNG = 0.9;
/** a swing whose turn is this far through as it would begin waits for the next (too short to be a step) */
const LATE_SWING = 0.8;
/** a hoof stood off its rest by more than this as it stands (m) steps back under it, and that step's time (s); under
 *  this speed it stands (m/s) */
const STAND_OFF = 0.3, STAND_STEP = 0.45, STANDS_UNDER = 0.4;
/** what of a step lifts the hoof before it moves and sets it down after (a share at each end) */
const LIFT_FIRST = 0.12;
/** a move in one frame past this is a placing (a spawn, a set-up), not a stride (m) */
const PLACED_MOVE = 2.5;
/** how far under the floor its body must be for its feet to sink with it (m): rising out of the earth as it comes it
 *  is, not a frame or two behind a step up onto the dais (0.35 m), which sank every planted foot */
const RISING = 0.4;
const _w = new THREE.Vector3(), _l = new THREE.Vector3(), _f = new THREE.Vector3();

/** How far along its way a hoof is `s` of the way through its step: still as it lifts and as it sets down. */
function along(s: number): number {
  const k = Math.min(1, Math.max(0, (s - LIFT_FIRST) / (1 - 2 * LIFT_FIRST)));
  return k * k * (3 - 2 * k);
}

/** One leg's hoof as it strides: where it's planted in the world (null till it first is), where its step set off
 *  from, its step's share done (-1 planted) and whether that step is a stand's (timed) or a stride's (by the ground),
 *  and the height it set off at. */
interface Hoof {
  at: THREE.Vector3 | null; from: THREE.Vector3; step: number; timed: boolean; up: number; now: THREE.Vector3;
  /** a timed step's time (s), and the share of its turn in the stride a stride's swing began at */
  takes: number;
  began: number;
  /** how far its leg reaches to it, a share of its two long bones' length, and how far its ankle is before (+) or
   *  behind (-) its hip (m), as last solved (the lab says them: `lab boss --parts stagStride`) */
  stretch?: number;
  ankle?: number;
}
/** how far under its hoof's joint the sole meets the floor, and how far ahead of it (m), and how far round the sole's
 *  middle the hoof meets the floor (m: it rests on the highest floor under that, as a body overhanging a step does) */
const HOOF_SOLE = 0.21, SOLE_AHEAD = 0.05, HOOF_FOOT = 0.14;
/** its gore: how far its neck and head turn down as its antlers come down (rad), so its tines reach the earth at its
 *  feet (`lab boss --parts stagGore` reads them as drawn) */
export const GORE = { neck: 1.25, head: 0.55 };
/** its rear for a stamp: how far its front pitches up (rad) and its body rises (m), how high its fore hooves lift (m)
 *  and how far ahead of where they stood they come down (m) */
export const REAR = { pitch: 0.42, rise: 0.55, lift: 1.3, ahead: 0.9 };
/** its kick: how far back off where they stood its hind hooves are driven (m), how high (m), and how far its fore end
 *  pitches down as they go (rad) (`lab boss --parts stagReach` reads them as drawn) */
export const KICK = { back: 1.6, lift: 1.1, pitch: 0.24 };
/** how many stakes its shed antlers break into, kept in its model, and the scale a part is kept at while it's not
 *  shown (never 0: a zero scale's inverse is NaN, black lines) */
export const STAKES = STAG.shed.stakes;
export const NO_SIZE = 1e-4;
/** a stake's length from its butt (in the floor) to its top (m) */
export const STAKE_LENGTH = 2.6;
/** its hoof strike after the shed: its rear's share of the stamp's, and how far ahead its fore hooves come down (m) */
export const STRIKE = { rear: 0.5, ahead: 1.7 };
/** the leg that paws the earth through a charge's warning (its fore right) */
const PAWING = 1;
/** its barrel's half sizes (m: across, up, along) and middle's height on its body's joint: a deer's, deep and narrow */
const BARREL = { x: 0.8, y: 0.92, z: 2.0, y0: 0.1 };

/** A point on its barrel's surface `along` m from its middle, `a` round from its top (to its left), `off` m out. */
function onBarrel(along: number, a: number, off = 0): THREE.Vector3 {
  const k = Math.sqrt(Math.max(0.05, 1 - (along / BARREL.z) ** 2));
  return V(Math.sin(a) * (BARREL.x * k + off), BARREL.y0 + Math.cos(a) * (BARREL.y * k + off), along);
}

/** A stake of its shed antlers on joint `j`, its butt at the joint, along +y: a charred beam broken off at its foot,
 *  two tines off it, a flame at each tip. */
function stakeOn(S: Sculpt, made: (f: () => THREE.BufferGeometry) => THREE.BufferGeometry, char: THREE.Material,
  flame: THREE.Material, core: THREE.Material, j: THREE.Object3D, i: number): void {
  const L = STAKE_LENGTH, lean = i % 2 ? 1 : -1;
  S.add(made(() => taperTube([V(0, 0, 0), V(0.05 * lean, L * 0.4, 0.03), V(-0.04 * lean, L * 0.75, 0), V(0.02, L, 0.02)],
    (t) => 0.13 * (1 - t * 0.75), 8, 6)), char, j);
  const tops: THREE.Vector3[] = [V(0.02, L, 0.02)];
  for (const [y, side] of [[0.5, 1], [0.72, -1]] as const) {
    const from = V(0, L * y, 0), to = from.clone().add(V(side * 0.42, 0.55, 0.05));
    S.add(made(() => taperTube([from, from.clone().add(V(side * 0.22, 0.25, 0.04)), to], (t) => 0.05 * (1 - t * 0.8), 6, 4)),
      char, j);
    tops.push(to);
  }
  for (const top of tops) {
    S.add(made(() => new THREE.ConeGeometry(0.05, 0.3, 6).translate(0, 0.14, 0)), flame, j, [top.x, top.y, top.z]);
    S.add(made(() => new THREE.SphereGeometry(0.05, 6, 5)), core, j, [top.x, top.y + 0.02, top.z]);
  }
}

export function buildStag(): Model {
  // (its edge as it dissolves a deep ember red: an orange edge over its whole fall blew it out)
  const kit = createKit(0x7a2a08);
  const b = pbrMaterialMaps(bark(), 1.4, 2);
  const g = pbrMaterialMaps(grunge(), 2, 1);
  // (fissures branching through the char, a few at a time: a crack map's even cells read as a turtle's shell at its
  // size and as scales at a third of it)
  const fine = veins(73, 14).clone();
  fine.wrapS = fine.wrapT = THREE.RepeatWrapping;
  fine.repeat.set(2, 1.5);
  // its hide: wood burnt to char, split into plates, the embers under it glowing through every crack
  const char = kit.rim({
    color: 0x2a211b, roughness: 0.96, map: b.map, normalMap: b.normalMap, normalScale: new THREE.Vector2(2.4, 2.4),
    emissive: 0xff5a14, emissiveMap: fine, emissiveIntensity: 1.2,
  }, 0x8a5a3a, 0.2);
  // the ash on it: grey and dry, its mane's splinters, the ridge of its back, the char flaking off its haunches
  const ash = kit.rim({ color: 0x4e4740, roughness: 1, map: g.map, normalMap: g.normalMap, normalScale: new THREE.Vector2(2, 2) }, 0xa09080, 0.2);
  // its hooves and its muzzle: burnt black through
  const coal = kit.std({ color: 0x0c0a09, roughness: 0.9, map: g.map });
  // its eyes and nostrils, coals; its antlers' flames; the cracks that run deepest, burning bright
  const eye = kit.glow(0xffc070, 5);
  const flame = kit.glow(0xff7a20, 2.4);
  const core = kit.glow(0xffd890, 3);
  const crack = kit.glow(0xff6a20, 1.2);

  const root = new THREE.Group();
  const S = new Sculpt('stag').glow(eye).glow(flame).glow(core).glow(crack);
  const r = mulberry(61);

  // --- its body ----------------------------------------------------------------------------------------------
  const body = joint(root, 0, BODY_Y, 0);
  // (barrel, chest and haunches: three swells of char, the chest deep, the belly drawn up between)
  S.add(made(() => organic(new THREE.SphereGeometry(1, 28, 18), 0.06, 3, 1)), char, body, [0, BARREL.y0, 0], [0, 0, 0], [BARREL.x, BARREL.y, BARREL.z]);
  // (the chest deep and forward, the shoulders over it; the haunches round and high; the belly drawn up between)
  S.add(made(() => organic(new THREE.SphereGeometry(1, 24, 16), 0.07, 3, 2)), char, body, [0, 0.02, 1.32], [0.3, 0, 0], [0.84, 1.12, 0.95]);
  S.add(made(() => organic(new THREE.SphereGeometry(1, 20, 14), 0.08, 3, 4)), char, body, [0, 0.55, 1.15], [0.2, 0, 0], [0.72, 0.6, 0.8]);
  S.add(made(() => organic(new THREE.SphereGeometry(1, 24, 16), 0.07, 3, 3)), char, body, [0, 0.18, -1.38], [-0.15, 0, 0], [0.86, 0.98, 0.92]);
  // (plates of char lifting off the hide along its flanks and back, laid on it, the embers glowing under their edges)
  for (let i = 0; i < 20; i++) {
    const along = -1.7 + r() * 3.4, a = (r() < 0.5 ? 1 : -1) * (0.5 + r() * 1.1), size = 0.3 + r() * 0.2, turn = (r() - 0.5) * 0.8;
    const at = onBarrel(along, a, 0.01);
    S.add(made(() => organic(new THREE.SphereGeometry(1, 8, 6), 0.2, 3, 10 + i)), char, body, [at.x, at.y, at.z],
      [turn, 0, -a], [size, 0.06, size * 1.3]);
    S.add(made(() => new THREE.SphereGeometry(1, 8, 4)), crack, body, [at.x, at.y, at.z], [turn, 0, -a], [size * 0.85, 0.035, size * 1.1]);
  }
  // (a ridge of charred splinters down its spine, ragged, leaning back, a few gone grey with ash)
  for (let i = 0; i < 16; i++) {
    const along = 1.5 - i * 0.2 + (r() - 0.5) * 0.1, lean = (r() - 0.5) * 0.5, h = 0.12 + r() * 0.3 * (1 - i / 22);
    const base = onBarrel(along, (r() - 0.5) * 0.15, -0.03);
    S.add(made(() => taperTube([base, base.clone().add(V(lean * 0.2, h * 0.6, -0.08)), base.clone().add(V(lean * 0.35, h, -0.2 - h * 0.3))],
      (t) => 0.05 * (1 - t * 0.9), 5, 4)), r() < 0.3 ? ash : char, body);
  }
  for (let i = 0; i < 6; i++) {
    const spread = (i - 2.5) * 0.06, len = 0.6 + r() * 0.3;
    S.add(made(() => taperTube([V(spread, 0.6, -2.15), V(spread * 1.5, 0.88, -2.32), V(spread * 2, 0.92 + len * 0.3, -2.42 - len * 0.4)],
      (t) => 0.07 * (1 - t * 0.85), 6, 4)), ash, body);
  }

  // --- its legs ----------------------------------------------------------------------------------------------
  /** each leg's joints, top down, and its hoof's joint */
  const legs: THREE.Group[][] = [];
  const hooves: THREE.Group[] = [];
  for (const leg of LEGS) {
    const def = leg.hind ? HIND : FORE;
    const chain: THREE.Group[] = [joint(body, ...leg.at)];
    // (swung out about its body's long axis first, then about its own across: `stepLegs` turns it out for a turn)
    chain[0].rotation.order = 'ZXY';
    for (let k = 1; k < 3; k++) chain.push(joint(chain[k - 1], 0, -def.bones[k - 1], 0));
    def.bones.forEach((len, k) => {
      const r0 = def.r[k], r1 = k === 2 ? def.r[2] * 0.85 : def.r[k + 1];
      // (the thigh and the shoulder swell into the body, its muscle burnt hard)
      S.add(made(() => organic(limb(len, r0, r1, k === 0 ? 0.35 : 0.12, 0.3, 12), 0.04, 4, 30 + k)), char, chain[k]);
      // (a knot of char at each joint)
      if (k > 0) S.add(made(() => organic(new THREE.SphereGeometry(r0 * 1.15, 10, 8), 0.08, 4, 40 + k)), char, chain[k]);
    });
    // its hoof: cloven, burnt black, a coal's glow in the cleft
    const hoof = joint(chain[2], 0, -def.bones[2], 0);
    for (const s of [-1, 1]) {
      S.add(made(() => new THREE.CylinderGeometry(0.07, 0.12, 0.26, 8)), coal, hoof, [s * 0.065, -0.08, 0.05], [0.2, 0, 0], [1, 1, 1.25]);
    }
    S.add(made(() => new THREE.SphereGeometry(0.035, 6, 5)), crack, hoof, [0, -0.12, 0.13]);
    legs.push(chain);
    hooves.push(hoof);
  }

  // --- its neck and head -------------------------------------------------------------------------------------
  const neck = joint(body, 0, 0.6, 1.8);
  const NECK_TOP = V(0, 1.35, 0.85);
  S.add(made(() => organic(taperTube([V(0, -0.5, -0.35), V(0, 0.5, 0.2), NECK_TOP], (t) => 0.56 - t * 0.22, 12, 14), 0.05, 4, 50)), char, neck);
  // (a mane of charred strands hanging down the back of its neck, and a ruff of them under its throat, a few grey
  // with ash: bristling straight out, they read as quills)
  for (let i = 0; i < 30; i++) {
    const throat = i % 3 === 0, k = 0.15 + r() * 0.75, a = (r() - 0.5) * 1.6 + (throat ? 0 : Math.PI);
    const at = V(0, -0.5, -0.35).lerp(NECK_TOP, k), rad = 0.56 - k * 0.22;
    const base = at.clone().add(V(Math.sin(a) * rad * 0.92, 0, Math.cos(a) * rad * 0.92));
    const len = (throat ? 0.5 : 0.65) + r() * 0.3, sway = (r() - 0.5) * 0.2;
    const mid = base.clone().add(V(Math.sin(a) * 0.1 + sway, -len * 0.5, Math.cos(a) * 0.1));
    const end = base.clone().add(V(Math.sin(a) * 0.12 + sway * 1.6, -len, Math.cos(a) * 0.14));
    S.add(made(() => taperTube([base, mid, end], (t) => 0.045 * (1 - t * 0.85), 6, 4)), r() < 0.25 ? ash : char, neck);
  }
  const head = joint(neck, NECK_TOP.x, NECK_TOP.y, NECK_TOP.z);
  // its skull, long and narrow, the muzzle tapering to a burnt-black nose
  S.add(made(() => organic(new THREE.SphereGeometry(1, 20, 14), 0.05, 4, 60)), char, head, [0, 0.08, 0.15], [0.2, 0, 0], [0.42, 0.42, 0.6]);
  S.add(made(() => organic(taperTube([V(0, 0.05, 0.35), V(0, -0.08, 0.8), V(0, -0.2, 1.15)], (t) => 0.3 - t * 0.13, 10, 12), 0.04, 5, 61)), char, head);
  S.add(made(() => organic(new THREE.SphereGeometry(1, 12, 10), 0.05, 4, 62)), coal, head, [0, -0.2, 1.14], [0.3, 0, 0], [0.16, 0.12, 0.13]);
  for (const s of [-1, 1]) {
    // (its eyes: coals deep under a heavy brow)
    S.add(made(() => organic(new THREE.SphereGeometry(1, 10, 8), 0.1, 4, 63 + s)), char, head, [s * 0.27, 0.27, 0.36], [0, s * 0.3, 0], [0.13, 0.07, 0.15]);
    S.add(made(() => new THREE.SphereGeometry(0.075, 10, 8)), eye, head, [s * 0.3, 0.17, 0.4]);
    // (nostrils, burnt black and deep)
    S.add(made(() => new THREE.SphereGeometry(0.03, 6, 5)), coal, head, [s * 0.06, -0.19, 1.25], [0, 0, 0], [1, 0.7, 0.6]);
    // (its ears, laid back, ragged at the edge)
    S.add(made(() => leaf(0.48, 0.18, 0.5, 0.2, 5)), char, head, [s * 0.32, 0.4, -0.05], [-0.6, s * 0.9, s * 1.2]);
  }
  // (a crack burning down its brow)
  S.add(made(() => taperTube([V(0, 0.45, 0.25), V(0.02, 0.32, 0.55), V(-0.01, 0.12, 0.85)], (t) => 0.025 * (1 - t * 0.5), 8, 4)), crack, head);

  // its antlers: blackened branches, a flame at every tine, on a joint of their own (shed at half its life: the joint
  // at no size, the stubs left burning on its brow)
  const antlers = joint(head, 0, 0, 0);
  for (const s_ of [1, -1]) {
    S.add(made(() => organic(taperTube([V(0, 0, 0), V(0, 0.16, 0.02)], (t) => 0.1 - t * 0.03, 8, 3), 0.04, 3, 70 + s_)), char,
      head, [s_ * 0.21, 0.42, 0.1]);
    S.add(made(() => new THREE.SphereGeometry(0.07, 8, 6)), crack, head, [s_ * 0.21, 0.58, 0.12], [0, 0, 0], [1, 0.35, 1]);
  }
  const out: THREE.BufferGeometry[] = [], tips: THREE.Vector3[] = [];
  // (grown every build, a replay too: they draw their random numbers as they grow, and every draw after must match)
  for (const s of [1, -1]) {
    // (the brow tine, low and forward over its face, then the beam sweeping up, out and back)
    branches(r, V(s * 0.22, 0.42, 0.18), V(s * 0.5, 0.6, 0.9), 0.55, 0.075, 0, out, tips, 0.5, 6);
    branches(r, V(s * 0.2, 0.46, 0.05), V(s * 0.65, 1, -0.3), 1.5, 0.12, 3, out, tips, 0.5, 6);
  }
  for (const geo of out) S.add(skipping() ? NONE : geo, char, antlers);
  // (at every tine three thin tongues of flame leaning apart over a white-hot heart: one cone read as a traffic cone)
  for (const tip of tips) {
    for (let f = 0; f < 3; f++) {
      const lean = [r() * 0.8 - 0.4, 0, r() * 0.8 - 0.4] as [number, number, number], tall = 0.16 + r() * 0.14;
      S.add(made(() => new THREE.ConeGeometry(0.032, tall, 6).translate(0, tall * 0.45, 0)), flame, antlers, [tip.x, tip.y, tip.z], lean);
    }
    S.add(made(() => new THREE.SphereGeometry(0.04, 6, 5)), core, antlers, [tip.x, tip.y + 0.02, tip.z]);
  }
  // the stakes its shed antlers break into, kept at no size under its root till the shed places each in the world
  // (entities/stag.ts `shedAt`): warmed with it, no mesh of their own made in the fight
  const stakes: THREE.Object3D[] = [];
  for (let i = 0; i < STAKES; i++) {
    const j = joint(root, 0, 0, 0);
    stakeOn(S, made, char, flame, core, j, i);
    j.scale.setScalar(NO_SIZE);
    stakes.push(j);
  }
  root.userData.stakes = stakes;
  S.build();
  // (whether its antlers are shed: set on every game by the shed's effect, its joint at no size from then)
  const shed = { done: false };
  root.userData.shed = shed;
  // (its tines' tips, where a gore is judged as drawn: entities/stag.ts `antlerGoreAt`)
  root.userData.antlerTips = tips.map((tip) => {
    const at = new THREE.Object3D();
    at.position.copy(tip);
    head.add(at);
    return at;
  });
  // (its fore hooves, where a stamp is judged as drawn: `stampAt`; its hind hooves, where a kick is: `kickAt`)
  root.userData.foreHooves = LEGS.flatMap((l, i) => (l.hind ? [] : [hooves[i]]));
  root.userData.hindHooves = LEGS.flatMap((l, i) => (l.hind ? [hooves[i]] : []));
  // (its muzzle, where its breath leaves it: entities/stag.ts `breathAt`)
  const mouth = new THREE.Object3D();
  mouth.position.set(0, -0.2, 1.3);
  head.add(mouth);
  root.userData.mouth = mouth;
  // (how far round its breath has turned its head off its body's facing (rad), set by every game's effect as it
  // sweeps, so each copy turns as its own effect does)
  const breathing = { turn: 0 };
  root.userData.breath = breathing;
  // (where a hero it tosses rides, between its antlers over its brow: entities/stag.ts carries him there)
  const tines = new THREE.Object3D();
  tines.position.set(0, 0.95, 0.35);
  head.add(tines);
  root.userData.tines = tines;

  /** for the lab: each hoof's joint and the point under it that meets the floor, in its joint's frame */
  root.userData.stride = { hooves: hooves.map((joint) => ({ joint, foot: V(0, -HOOF_SOLE, SOLE_AHEAD) })), carried: false };

  // (eased: its gallop, its paw's head lowered, its crash's reeling, its fall)
  let galloping = 0, lowered = 0, reeling = 0, sag = 0;
  // its rear for a stamp: how high its fore hooves are lifted (0..1 of `REAR.lift`), how far ahead of where they stood
  // they come down (m), and whether they have landed there (each planted on where it came down, once)
  const rear = { lift: 0, ahead: 0, landed: false };
  // its kick: how far its hind hooves are driven back off where they stood and up (0..1 of `KICK`)
  const kick = { out: 0 };
  // its strides: the share of a stride covered at each gait (each its own count, so neither jumps as it changes gait),
  // where it stood last frame, which way it goes, and each hoof
  const covered = { walk: 0, gallop: 0 };
  let last: THREE.Vector3 | null = null;
  const way = new THREE.Vector3(0, 0, 1);
  const hoofs: Hoof[] = LEGS.map(() => ({
    at: null, from: new THREE.Vector3(), step: -1, timed: false, up: 0, now: new THREE.Vector3(), takes: STAND_STEP,
    began: 0,
  }));
  /** each hoof's joint at rest in its root's frame (its legs at their rest angles, its sole on the floor) */
  const rests = LEGS.map((l) => {
    const def = l.hind ? HIND : FORE;
    let angle = 0, z = l.at[2];
    def.bones.forEach((len, k) => { angle += def.rest[k]; z -= Math.sin(angle) * len; });
    return V(l.at[0], HOOF_SOLE, z);
  });

  function animate(st: AnimState): void {
    const { t, dt } = st, look = st.boss, a = st.action;
    const dead = st.dead >= 0 ? st.dead : 0;
    const k = 1 - Math.exp(-dt * 6);
    const late = (look?.phase ?? 0) >= 1;
    const isGallop = a?.name === 'gallop', isPaw = a?.name === 'charge' || a?.name === 'again';
    galloping += ((isGallop && dead === 0 ? 1 : 0) - galloping) * (1 - Math.exp(-dt * 8));
    lowered += ((isPaw || isGallop ? 1 : 0) - lowered) * k;
    reeling += ((look && look.weak > 0 && dead === 0 ? 1 : 0) - reeling) * k;
    sag += (dead - sag) * (1 - Math.exp(-dt * 3));
    const walk = Math.min(1, st.move) * (1 - galloping);
    const ph = covered.walk * Math.PI * 2, stride = covered.gallop % 1;

    // at rest: its breath, its head turning slowly, an ear's flick
    let bodyY = BODY_Y + Math.sin(t * 1.1) * 0.02, bodyX = 0, bodyZ = 0;
    let neckX = Math.sin(t * 0.4) * 0.04, neckY = Math.sin(t * 0.23) * 0.18, headX = Math.sin(t * 0.31) * 0.05, headZ = 0;
    const leg = LEGS.map(() => [0, 0, 0]);

    // walking: a lateral walk, one leg after another, its back swaying a little
    LEGS.forEach((l, i) => {
      const c = ph + l.walk * Math.PI * 2;
      leg[i][0] += 0.32 * walk * Math.sin(c);
      leg[i][1] += (l.hind ? -0.5 : 0.55) * walk * Math.max(0, Math.sin(c + Math.PI / 2));
    });
    bodyZ += Math.sin(ph) * 0.025 * walk;
    bodyY += (Math.abs(Math.sin(ph * 2)) * 0.04 - WALK_LOW) * walk;

    // galloping: each hoof planted forward and driven back under it, then lifted, folded and swung through to land
    // again; the hinds landing a beat apart, then the fores, then a leap with every leg gathered; its back lowest
    // as the fores take it and highest in the leap, its nose dipping onto the fores and lifting as the hinds drive;
    // its neck stretched out low into the charge, its antlers forward
    const G2 = GALLOP, TAU = Math.PI * 2;
    if (galloping > 0.001) {
      LEGS.forEach((l, i) => {
        const u = (stride - G2.lands[i] + 1) % 1;
        let swing: number, fold: number, give: number;
        if (u < G2.duty) {
          // (on the earth: carried from reaching forward to driving back, giving a little under the weight)
          const s = u / G2.duty;
          swing = -G2.reach + (G2.reach + G2.drive) * s;
          fold = 0;
          give = Math.sin(s * Math.PI);
        } else {
          // (in the air: folded up tight as it comes through, then opened out reaching forward to land)
          const w = (u - G2.duty) / (1 - G2.duty);
          swing = G2.drive - (G2.drive + G2.reach * 1.25) * (0.5 - 0.5 * Math.cos(Math.min(1, w * 1.15) * Math.PI)) + G2.reach * 0.25 * ramp(w, 0.85, 1);
          fold = Math.sin(Math.min(1, w * 1.25) * Math.PI);
          give = 0;
        }
        leg[i][0] += swing * galloping;
        if (l.hind) {
          leg[i][1] += (0.75 * fold + 0.18 * give) * galloping;
          leg[i][2] += (-1.15 * fold - 0.22 * give) * galloping;
        } else {
          leg[i][1] += (1.7 * fold - 0.06 * give) * galloping;
          leg[i][2] += (0.7 * fold + 0.2 * give) * galloping;
        }
      });
    }
    bodyY += (G2.rise * Math.cos(TAU * (stride - 0.9)) - 0.12) * galloping;
    bodyX += G2.pitch * Math.cos(TAU * (stride - 0.62)) * galloping;
    // (its neck stretched out low before it, its antlers pointed forward: held up, it read as a horse trotting)
    neckX += (0.12 * Math.cos(TAU * (stride - 0.7)) + 0.4) * galloping;
    headX += 0.12 * galloping;

    // pawing the earth through a charge's warning: its fore right lifted and stamped down, three times, its head low
    if (isPaw && a) {
      const lift = pawLift(a);
      leg[PAWING][0] += -0.75 * lift;
      leg[PAWING][1] += 1.3 * lift;
      leg[PAWING][2] += -0.5 * lift;
      bodyX += 0.05 * lift;
    }
    neckX += 0.62 * lowered;
    headX += 0.28 * lowered;
    neckY *= 1 - lowered;

    // its breath: its head raised and its chest swelling as it draws breath, its head turning to where its fire will
    // begin; then its neck stretched out low before it and swept round with the fire (`breath.turn`, its effect's)
    if (a?.name === 'breath') {
      const h = a.hit ?? 0.4, w = a.t;
      const draw = ramp(w, 0, h * 0.85) * (1 - ramp(w, h * 0.85, h));
      const blow = ramp(w, h * 0.85, h) * (1 - ramp(w, 0.9, 1));
      neckX += -0.5 * draw + 0.3 * blow;
      headX += -0.35 * draw + 0.2 * blow;
      neckY = neckY * (1 - Math.max(draw, blow)) + breathing.turn * (0.6 * draw + blow);
      bodyY += 0.07 * draw - 0.08 * blow;
      bodyX += -0.05 * draw + 0.06 * blow;
    }
    // its shed: reared up and back through its warning, its head high, then its whole front brought down and its
    // antlers driven into the earth before it as the warning ends (they break off there: entities/stag.ts `shedAt`)
    let shedRear = 0;
    if (a?.name === 'shed') {
      const h = a.hit ?? 0.57, w = a.t;
      const up = ramp(w, 0, h * 0.8) * (1 - ramp(w, h * 0.8, h));
      const down = ramp(w, h * 0.8, h) * (1 - ramp(w, h + 0.15, Math.min(1, h + 0.4)));
      bodyX += -REAR.pitch * 0.8 * up + 0.2 * down;
      bodyY += REAR.rise * 0.7 * up - 0.35 * down;
      neckX += -0.5 * up + GORE.neck * 1.05 * down;
      headX += -0.3 * up + GORE.head * down;
      neckY *= 1 - Math.max(up, down);
      leg[0][0] += -0.3 * down;
      leg[1][0] += -0.3 * down;
      shedRear = up * 0.6;
    }
    // its kick: its weight thrown onto its fore legs, its head going down and its haunches gathering under it; then
    // both hind legs driven back and up, its rump lifted, its fore end down (`kick.out`: `stepLegs` takes the hooves)
    kick.out = 0;
    if (a?.name === 'kick') {
      const h = a.hit ?? 0.45, w = a.t;
      const gather = ramp(w, 0, h * 0.8) * (1 - ramp(w, h * 0.8, h));
      const strike = ramp(w, h * 0.75, h) * (1 - ramp(w, h + 0.15, Math.min(1, h + 0.45)));
      bodyX += 0.1 * gather + KICK.pitch * strike;
      bodyY += -0.12 * gather + 0.08 * strike;
      neckX += 0.3 * gather + 0.45 * strike;
      headX += 0.1 * gather + 0.15 * strike;
      leg[0][0] += -0.15 * gather - 0.25 * strike;
      leg[1][0] += -0.15 * gather - 0.25 * strike;
      kick.out = strike;
    }
    // its gore: its head drawn up and back, its fore legs braced, its weight on its haunches; then its neck dropped and
    // its head driven down and forward, its antlers raking the earth at its feet and on up through whoever stands
    // there (from Kenneth: "have him actually bend down to reach you, he is just attacking the air instead")
    if (a?.name === 'gore') {
      const h = a.hit ?? 0.57, w = a.t;
      const up = ramp(w, 0, h * 0.75) * (1 - ramp(w, h * 0.8, h * 0.95));
      const down = ramp(w, h * 0.8, h) * (1 - ramp(w, h + 0.12, Math.min(1, h + 0.35)));
      const rake = ramp(w, h, h + 0.12) * (1 - ramp(w, h + 0.2, Math.min(1, h + 0.4)));
      neckX += -0.45 * up + GORE.neck * down - 0.5 * rake;
      headX += -0.3 * up + GORE.head * down - 0.4 * rake;
      neckY *= 1 - Math.max(up, down);
      bodyX += -0.06 * up + 0.14 * down;
      bodyY += -0.1 * up - 0.3 * down;
      leg[0][0] += -0.2 * up - 0.3 * down;
      leg[1][0] += -0.2 * up - 0.3 * down;
    }
    // its stamp: its weight sitting back, its front rising onto its haunches, its fore legs lifted and folded, its head
    // up; then brought down hard, both fore hooves driven onto the earth ahead of where they stood
    // (its fore hooves lifted as it rears for its shed, set down where they stood)
    rear.lift = shedRear;
    if (a?.name === 'stamp' || a?.name === 'strike') {
      const h = a.hit ?? 0.58, w = a.t, k = a.name === 'strike' ? STRIKE.rear : 1;
      const up = ramp(w, 0, h * 0.75) * (1 - ramp(w, h * 0.8, h));
      const strike = ramp(w, h * 0.8, h) * (1 - ramp(w, h + 0.15, 1));
      bodyX += -REAR.pitch * k * up + 0.06 * strike;
      bodyY += REAR.rise * k * up - 0.15 * strike;
      neckX += -0.35 * up + 0.45 * strike;
      headX += -0.15 * up + 0.2 * strike;
      rear.lift = up * k;
      rear.ahead = (a.name === 'strike' ? STRIKE.ahead : REAR.ahead) * ramp(w, h * 0.4, h);
      if (w < h) rear.landed = false;
    } else if (!rear.lift) rear.ahead = 0;
    // its toss: its head dropped to the earth, its antlers scraping it, fore legs braced; then flung up and back, its
    // fore end rising with it, the hero thrown off its tines
    if (a?.name === 'toss') {
      const h = a.hit ?? 0.57, w = a.t;
      const down = ramp(w, 0, h * 0.6) * (1 - ramp(w, h * 0.92, h)), up = ramp(w, h * 0.92, h + 0.06) * (1 - ramp(w, h + 0.2, 1));
      const scrape = w < h ? Math.sin(w * 30) * 0.06 * ramp(w, h * 0.5, h * 0.6) : 0;
      // (its neck thrown up with its nose kept down, its antlers forward under the hero: its head thrown back with
      // it, they pointed back over it)
      neckX += 1.3 * down - 0.6 * up;
      headX += 0.35 * down + 0.5 * up + scrape;
      neckY *= 1 - down;
      bodyX += 0.1 * down - 0.2 * up;
      bodyY += -0.2 * down + 0.15 * up;
      leg[0][0] += -0.25 * down;
      leg[1][0] += -0.25 * down;
      leg[2][0] += 0.12 * up;
      leg[3][0] += 0.12 * up;
    }
    // crashed and reeling: its head hung and shaking slowly, its fore legs splayed, its back sunk
    if (reeling > 0.01) {
      neckX += 0.75 * reeling;
      neckY += Math.sin(t * 2.6) * 0.3 * reeling;
      headZ += Math.sin(t * 2.6 + 0.5) * 0.18 * reeling;
      bodyY -= 0.25 * reeling;
      bodyX += 0.08 * reeling;
      leg[0][0] += -0.18 * reeling;
      leg[1][0] += -0.18 * reeling;
    }
    if (st.hit > 0) neckX += 0.05 * st.hit;
    // killed: its legs fold under it and it sinks onto its side a little, its head down
    bodyY -= 2.2 * sag;
    bodyZ += 0.25 * sag;
    neckX += 0.5 * sag;
    LEGS.forEach((l, i) => {
      leg[i][0] += (l.hind ? 0.9 : -0.9) * sag;
      leg[i][1] += (l.hind ? -1.8 : 1.9) * sag;
    });

    antlers.scale.setScalar(shed.done ? NO_SIZE : 1);
    body.position.y = bodyY;
    body.rotation.set(bodyX, 0, bodyZ);
    neck.rotation.set(neckX, neckY, 0);
    head.rotation.set(headX, 0, headZ);
    // its legs: solved to its planted hooves and their steps, or posed as before where carried (`stride.carried`,
    // the lab's canary) and folding into that pose as it dies
    const solved = stride_.carried ? null : stepLegs(dt, bodyX, bodyZ, isPaw && a ? pawLift(a) : 0);
    const fold = solved ? Math.min(1, sag * 4) : 1;
    LEGS.forEach((l, i) => {
      const rest = l.hind ? HIND.rest : FORE.rest;
      const posed = [rest[0] + leg[i][0] - bodyX, rest[1] + leg[i][1], rest[2] + leg[i][2]];
      const ik = solved ? solved[i] : [posed[0], posed[1], posed[2], 0];
      for (let k = 0; k < 3; k++) legs[i][k].rotation.x = ik[k] * (1 - fold) + posed[k] * fold;
      legs[i][0].rotation.z = ik[3] * (1 - fold);
      // (its cannon kept upright in the world, against the hip's swing out: as it dies it folds as before)
      if (solved && fold === 0) uprightCannon(i, ik[5], ik[3], ik[6], ik[7]);
    });

    // its embers: breathing slowly (well under a beat a second), brighter in its second phase and as it charges;
    // its antlers' flames licking (small and soft); all going out as it dies
    const breath = 0.5 + 0.5 * Math.sin(t * 1.4);
    const heat = (late ? 1.5 : 1) + 0.6 * galloping + 0.4 * lowered;
    char.emissiveIntensity = (0.75 + 0.25 * breath) * heat * (1 - sag);
    crack.emissiveIntensity = (1.0 + 0.35 * breath) * heat * (1 - sag);
    flame.emissiveIntensity = (2.2 + 0.4 * Math.sin(t * 5.3) + 0.3 * Math.sin(t * 8.1)) * (late ? 1.25 : 1) * (1 - sag);
    core.emissiveIntensity = (3 + 0.4 * Math.sin(t * 4.1)) * (late ? 1.2 : 1) * (1 - sag);
    eye.emissiveIntensity = (late ? 6.5 : 5) * (1 - sag);
  }

  /** Its pawing hoof's lift through a charge's warning (0 down, 1 up): three stamps. */
  function pawLift(a: NonNullable<AnimState['action']>): number {
    const w = a.t / Math.max(0.05, a.hit ?? 0.85), stamp = Math.min(1, w) * 3;
    return w < 1 ? Math.sin((stamp % 1) * Math.PI) ** 2 : 0;
  }

  /** `at` set down on the floor under it, its hoof's joint its sole's height over it (relative to the floor under
   *  the stag, so a studio's floor is its own; under the floor as it rises out of the earth); the highest floor
   *  under its footprint (by the floor under its middle alone, a hoof by the dais's step stood 9 cm into the riser) */
  const onFloor = (at: THREE.Vector3, under: THREE.Vector3): THREE.Vector3 => {
    const floor = groundUnder(at.x, at.z, HOOF_FOOT);
    at.y = floor + HOOF_SOLE + Math.min(0, under.y - groundHeight(under.x, under.z) + RISING);
    return at;
  };

  /**
   * Its hooves this frame and its legs solved to them: the ground it covered moves each gait's stride on; a leg whose
   * turn it is in the stride lifts its hoof from where it stood and swings it to land a half stance ahead of where it
   * will rest, the others hold theirs where they landed; standing, a hoof stood off its rest steps back under it, one
   * at a time; the pawing hoof (`paw`, its lift) lifted off its own spot. Each leg's angles (hip, knee, cannon about
   * its across, and its hip swung out about the body's long axis), in its body's frame (`bodyX` its pitch).
   */
  function stepLegs(dt: number, bodyX: number, bodyZ: number, paw: number): number[][] {
    root.updateWorldMatrix(true, false);
    body.updateWorldMatrix(false, false);
    const here = root.getWorldPosition(new THREE.Vector3());
    let moved = last ? Math.hypot(here.x - last.x, here.z - last.z) : 0;
    // (placed afresh: its hooves set down under it again)
    if (!last || moved > PLACED_MOVE) {
      moved = 0;
      for (const h of hoofs) { h.at = null; h.step = -1; }
    }
    if (moved > 1e-5 && last) way.set(here.x - last.x, 0, here.z - last.z).normalize();
    last = (last ?? new THREE.Vector3()).copy(here);
    covered.walk += moved / STRIDES.walk.stride;
    covered.gallop += moved / STRIDES.gallop.stride;
    const gait = galloping > 0.5 ? STRIDES.gallop : STRIDES.walk;
    const cycle = (galloping > 0.5 ? covered.gallop : covered.walk) % 1;
    const speed = moved / Math.max(dt, 1e-4), standing = speed < STANDS_UNDER;
    // (its facing in the world: a hoof's joint stands behind its sole along it)
    const facing = _f.set(0, 0, 1).transformDirection(root.matrixWorld).setY(0).normalize();
    // (standing: one hoof stood off its rest steps back under it, the furthest first, when none is stepping)
    if (standing && hoofs.every((h) => h.step < 0)) {
      let worst = -1, most = STAND_OFF;
      hoofs.forEach((h, i) => {
        if (!h.at || i === PAWING && paw > 0) return;
        const rest = root.localToWorld(_w.copy(rests[i]));
        const off = Math.hypot(h.at.x - rest.x, h.at.z - rest.z);
        if (off > most) { most = off; worst = i; }
      });
      if (worst >= 0) {
        const h = hoofs[worst];
        h.from.copy(h.at!);
        h.up = 0;
        h.step = 0;
        h.timed = true;
        h.takes = STAND_STEP;
      }
    }
    let landedNow = false;
    // (rearing, its fore hooves are off the earth, whatever their steps say: a hind hoof that counted them as down took
    // a quick step mid-rear, and one hoof bore the stag, `lab boss --parts stagStride`)
    const reared = rear.lift > 0 || (rear.ahead > 0 && !rear.landed);
    // (and kicking, its hind hooves are)
    const off = (j: number): boolean => (reared && !LEGS[j].hind) || (kick.out > 0 && LEGS[j].hind);
    const down = (other: typeof hoofs[number], j: number): boolean => other.step < 0 && !off(j);
    const solved = LEGS.map((l, i) => {
      const h = hoofs[i];
      const rest = onFloor(root.localToWorld(_w.copy(rests[i])), here);
      const land = galloping > 0.5 ? GALLOP.lands[i] : l.walk;
      const u = ((cycle - land) % 1 + 1) % 1;
      const share = (u - gait.duty) / (1 - gait.duty);
      // (a swing that would begin this late in its turn waits for the next; walking, one waits to begin while fewer
      // than two others are down: begun as another swung and a third took a quick step, one hoof bore it)
      const others = hoofs.filter((other, j) => other !== h && down(other, j)).length;
      const waits = h.step < 0 && (share > LATE_SWING || (galloping <= 0.5 && others < 2));
      const swinging = !standing && u >= gait.duty && !waits;
      let foot: THREE.Vector3;
      if (!h.at) {
        h.at = rest.clone();
        foot = rest.clone();
      } else if (swinging) {
        // its turn in the stride: lifted from where it stood, swung to land a half stance ahead of where it will
        // rest as it lands (the stag goes on the rest of its swing meanwhile)
        // (begun from where it stands, over what's left of its turn: begun late, it goes faster, never leaps)
        if (h.step < 0 || h.timed) {
          h.from.copy(h.step < 0 ? h.at : h.now);
          h.up = h.step < 0 ? 0 : h.now.y - onFloor(_l.copy(h.now), here).y;
          h.timed = false;
          h.began = share;
          h.step = 0;
        }
        h.step = Math.max(h.step, Math.min(1, (share - h.began) / Math.max(1e-3, 1 - h.began)));
        const ahead = (1 - h.step) * (1 - gait.duty) * gait.stride + gait.duty * gait.stride * 0.5;
        // (aimed until it comes down: then held where it will land)
        const target = h.step < 1 - LIFT_FIRST ? onFloor(rest.clone().addScaledVector(way, ahead), here) : h.at.clone();
        foot = onFloor(h.from.clone().lerp(target, along(h.step)), here);
        foot.y += Math.max(gait.lift * Math.sin(Math.PI * h.step), h.up * (1 - h.step));
        h.at.copy(target);
      } else if (h.step >= 0 && (h.timed || h.step < SWUNG)) {
        // a stand's step back under it, or a stride's swing cut short (it stopped, or its gait changed under it and
        // has it on the earth now): finished, timed, from where it is
        if (!h.timed) {
          h.from.copy(h.now);
          h.up = h.now.y - onFloor(_l.copy(h.now), here).y;
          h.step = 0;
          h.timed = true;
          h.takes = standing ? STAND_STEP : QUICK_STEP;
        }
        h.step = Math.min(1, h.step + dt / h.takes);
        // (set down where it will rest as it lands, the stag going on meanwhile: aimed until it comes down, then held)
        const landing = h.step < 1 - LIFT_FIRST
          ? onFloor(rest.clone().addScaledVector(way, speed * h.takes * (1 - h.step)), here) : onFloor(h.at.clone(), here);
        h.at.copy(landing);
        foot = onFloor(h.from.clone().lerp(landing, along(h.step)), here);
        foot.y += Math.max(STRIDES.walk.lift * Math.sin(Math.PI * h.step), h.up * (1 - h.step));
        if (h.step >= 1) { h.at.copy(landing); h.step = -1; h.timed = false; }
      } else {
        // planted where it landed, bearing the stag
        h.step = -1;
        foot = onFloor(h.at.clone(), here);
      }
      if (i === PAWING && paw > 0) foot = onFloor(h.at.clone(), here).addScaledVector(way, 0.15 * paw).setY(foot.y + 0.45 * paw);
      // (rearing for a stamp: each fore hoof lifted off its spot and brought down ahead of it, planted where it lands)
      const rearing = !l.hind && (rear.lift > 0 || (rear.ahead > 0 && !rear.landed));
      if (rearing) {
        foot = onFloor(h.at.clone().addScaledVector(facing, rear.ahead), here);
        foot.y += REAR.lift * rear.lift;
        h.step = -1;
        // (come down all the way ahead: planted there)
        if (rear.lift === 0 && rear.ahead >= REAR.ahead - 1e-3) {
          h.at.copy(foot);
          landedNow = true;
        }
      }
      // (kicking: each hind hoof driven back and up off its spot, and back onto it after)
      const kicking = l.hind && kick.out > 0;
      if (kicking) {
        foot = onFloor(h.at.clone().addScaledVector(facing, -KICK.back * kick.out), here);
        foot.y += KICK.lift * kick.out;
        h.step = -1;
      }
      h.now.copy(foot);
      walk_.targets[i].copy(foot);
      // (tucked once it's off the floor, never as it lifts or lands)
      const tuck = swinging ? gait.tuck[l.hind ? 1 : 0] * Math.sin(Math.PI * along(Math.max(0, h.step))) : 0;
      // (its place is its sole's: its joint set behind it, so it pivots about where it meets the earth)
      const angles = reach(i, foot.addScaledVector(facing, -SOLE_AHEAD), bodyX, bodyZ, tuck);
      // (planted near where its leg can reach no further: it steps, quickly, rather than be dragged; walking, early
      // while two others stay planted, and locked out regardless; galloping, at once: a gallop leaps)
      const planted = hoofs.filter((other, j) => other !== h && down(other, j)).length;
      h.stretch = angles[8];
      h.ankle = angles[9];
      const may = angles[4] > 1 || planted >= 2 || galloping > 0.5;
      if (angles[4] && may && h.step < 0 && !(i === PAWING && paw > 0) && !rearing && !kicking) {
        h.from.copy(h.at);
        h.up = 0;
        h.step = 0;
        h.timed = true;
        h.takes = QUICK_STEP;
        walk_.stretched[i]++;
      }
      return angles;
    });
    if (landedNow) rear.landed = true;
    return solved;
  }

  /**
   * Leg `i`'s angles to set its hoof's joint at `foot` (the world; its sole under it): its hip swung out about the
   * body's long axis to the plane its hoof is in, its cannon upright in the world (tucked back `tuck` rad), and its
   * hip and knee from the two bones' reach to the cannon's top, the knee bent the deer's way (the fore's back, the
   * hind's stifle forward). Out of reach, the leg is stretched straight towards it.
   */
  function reach(i: number, foot: THREE.Vector3, bodyX: number, bodyZ: number, tuck: number): number[] {
    const l = LEGS[i], def = l.hind ? HIND : FORE;
    const [b0, b1, b2] = def.bones;
    const p = body.worldToLocal(_l.copy(foot)).sub(_w.set(l.at[0], l.at[1], l.at[2]));
    // (the cannon upright in the world: in the body's frame, against its pitch; tucked back as it swings. The ankle
    // is up it from the hoof's joint, and the long bones' plane is swung out to the ankle)
    // (and against its roll: in the body's frame the cannon leans the other way about its long axis)
    const c = -bodyX + tuck;
    const down = Math.cos(c) * b2;
    const ankleX = p.x + Math.sin(bodyZ) * down, ankleY = p.y + Math.cos(bodyZ) * down, ankleZ = p.z + Math.sin(c) * b2;
    const out = Math.atan2(ankleX, -ankleY);
    const ax = ankleZ, ay = Math.hypot(ankleX, ankleY);
    const wanted = Math.hypot(ax, ay);
    const d = Math.min(b0 + b1 - 1e-3, Math.max(Math.abs(b0 - b1) + 1e-2, wanted));
    const line = Math.atan2(-ax, ay);
    const bend = Math.acos(Math.min(1, Math.max(-1, (b0 * b0 + d * d - b1 * b1) / (2 * b0 * d))));
    const hip = line + (l.hind ? -bend : bend);
    const kx = -Math.sin(hip) * b0, ky = Math.cos(hip) * b0;
    const knee = Math.atan2(-(ax - kx), ay - ky);
    const near = wanted > (b0 + b1) * NEAR_REACH ? (wanted > b0 + b1 ? 2 : 1) : 0;
    return [hip, knee - hip, c - knee, out, near, knee, c, bodyZ, wanted / (b0 + b1), ax];
  }

  /** Leg `i`'s cannon set upright against its hip's swing out (`out`): turned back from the knee's pitch, out of the
   *  swing, and to its own pitch `c`, all in the body's frame. */
  const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion();
  const X = V(1, 0, 0), ZAXIS = V(0, 0, 1);
  function uprightCannon(i: number, knee: number, out: number, c: number, roll: number): void {
    _qa.setFromAxisAngle(X, -knee);
    _qb.setFromAxisAngle(ZAXIS, -out - roll);
    _qc.setFromAxisAngle(X, c);
    legs[i][2].quaternion.copy(_qa).multiply(_qb).multiply(_qc);
  }

  const stride_ = root.userData.stride as { carried: boolean };
  /** for the lab: the steps each leg took because its planted hoof was out of its reach */
  const walk_ = { stretched: LEGS.map(() => 0), targets: LEGS.map(() => new THREE.Vector3()) };
  root.userData.stride.stretched = walk_.stretched;
  /** for the lab: where each hoof's joint was aimed this frame, in the world */
  root.userData.stride.targets = walk_.targets;
  /** for the lab: each hoof's own state (where it's planted, its step's share, timed or not) */
  root.userData.stride.hoofs = hoofs;

  return {
    root, kit, animate, height: 7.2,
    reset() {
      galloping = lowered = reeling = sag = covered.walk = covered.gallop = 0;
      last = null;
      for (const h of hoofs) { h.at = null; h.step = -1; }
    },
    dispose() { kit.dispose(); },
  };
}
