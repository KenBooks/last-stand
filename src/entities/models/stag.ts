// The Stag of Ash (entities/stag.ts): a huge stag of charred wood, its shoulder over two men's height, as if a great
// stag of the old wood had burnt standing and walked on. Its hide is char, split into plates by cracks that glow with
// the embers still burning under it (the cracks' own glow, brighter in its second phase and as it charges); its mane
// and the ridge of its back are splinters of grey ash; its eyes and nostrils are coals. Its antlers are blackened
// branches, flames licking at every tine (their smoke and sparks are entities/stag.ts's frame hook).
// Its legs are chains of joints (hip, knee, fetlock): a walk at its own pace, a gallop as it charges (its fore and hind
// pairs a beat apart, its back rocking), a hoof pawing the earth through a charge's warning (`ActionState.hit` from
// the data), its head lowered, antlers forward. Through its weak-spot window it has crashed: it reels, its head hung
// and shaking. Killed, its legs fold and it sinks, its embers going out.
// Drawn in its crowd (models/crowd.ts): every change is a joint's place or a glow's strength, nothing hidden.
import * as THREE from 'three';
import { createKit } from '../../core/materials';
import { bark, grunge, pbrMaterialMaps, veins } from '../../core/textures';
import { joint, ramp } from './rig';
import { Sculpt, branches, leaf, limb, organic, skipping, taperTube } from './shapes';
import { mulberry } from '../../util';
import type { AnimState, Model } from '../../types';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const NONE = new THREE.BufferGeometry();
/** a geometry made only where the kind's pieces aren't replayed (models/shapes.ts) */
const made = (f: () => THREE.BufferGeometry): THREE.BufferGeometry => (skipping() ? NONE : f());

/** its back's height over the floor at rest (m: its body's joint) */
const BODY_Y = 3.3;
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
/** Its gallop (a deer's transverse gallop): strides a second (on its own clock: the walk's cycle, set by its speed,
 *  turned over 4 times a second at a charge's and read as scurrying), the share of a stride each hoof is on the earth,
 *  when each lands in the stride (`LEGS`' order, fore left, fore right, hind left, hind right: the hind right, the hind
 *  left a beat on, then the fore right and the fore left, then the stride's leap with its legs gathered under it), how far a leg reaches forward as it lands
 *  and drives back as it leaves (rad), and how far its back rises and pitches over a stride. */
const GALLOP = { hz: 2.1, duty: 0.3, lands: [0.52, 0.42, 0.1, 0], reach: 0.5, drive: 0.5, rise: 0.2, pitch: 0.08 };
/** the leg that paws the earth through a charge's warning (its fore right) */
const PAWING = 1;
/** its barrel's half sizes (m: across, up, along) and middle's height on its body's joint: a deer's, deep and narrow */
const BARREL = { x: 0.8, y: 0.92, z: 2.0, y0: 0.1 };

/** A point on its barrel's surface `along` m from its middle, `a` round from its top (to its left), `off` m out. */
function onBarrel(along: number, a: number, off = 0): THREE.Vector3 {
  const k = Math.sqrt(Math.max(0.05, 1 - (along / BARREL.z) ** 2));
  return V(Math.sin(a) * (BARREL.x * k + off), BARREL.y0 + Math.cos(a) * (BARREL.y * k + off), along);
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
  /** each leg's joints, top down */
  const legs: THREE.Group[][] = [];
  for (const leg of LEGS) {
    const def = leg.hind ? HIND : FORE;
    const chain: THREE.Group[] = [joint(body, ...leg.at)];
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

  // its antlers: blackened branches, a flame at every tine
  const out: THREE.BufferGeometry[] = [], tips: THREE.Vector3[] = [];
  // (grown every build, a replay too: they draw their random numbers as they grow, and every draw after must match)
  for (const s of [1, -1]) {
    // (the brow tine, low and forward over its face, then the beam sweeping up, out and back)
    branches(r, V(s * 0.22, 0.42, 0.18), V(s * 0.5, 0.6, 0.9), 0.55, 0.075, 0, out, tips, 0.5, 6);
    branches(r, V(s * 0.2, 0.46, 0.05), V(s * 0.65, 1, -0.3), 1.5, 0.12, 3, out, tips, 0.5, 6);
  }
  for (const geo of out) S.add(skipping() ? NONE : geo, char, head);
  // (at every tine three thin tongues of flame leaning apart over a white-hot heart: one cone read as a traffic cone)
  for (const tip of tips) {
    for (let f = 0; f < 3; f++) {
      const lean = [r() * 0.8 - 0.4, 0, r() * 0.8 - 0.4] as [number, number, number], tall = 0.16 + r() * 0.14;
      S.add(made(() => new THREE.ConeGeometry(0.032, tall, 6).translate(0, tall * 0.45, 0)), flame, head, [tip.x, tip.y, tip.z], lean);
    }
    S.add(made(() => new THREE.SphereGeometry(0.04, 6, 5)), core, head, [tip.x, tip.y + 0.02, tip.z]);
  }
  S.build();
  // (where a hero it tosses rides, between its antlers over its brow: entities/stag.ts carries him there)
  const tines = new THREE.Object3D();
  tines.position.set(0, 0.95, 0.35);
  head.add(tines);
  root.userData.tines = tines;

  // (eased: its gallop, its paw's head lowered, its crash's reeling, its fall)
  let galloping = 0, lowered = 0, reeling = 0, sag = 0, stride = 0;

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
    const walk = Math.min(1, st.move) * (1 - galloping), ph = st.phase;

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
    bodyY += Math.abs(Math.sin(ph * 2)) * 0.04 * walk;

    // galloping: each hoof planted forward and driven back under it, then lifted, folded and swung through to land
    // again; the hinds landing a beat apart, then the fores, then a leap with every leg gathered; its back lowest
    // as the fores take it and highest in the leap, its nose dipping onto the fores and lifting as the hinds drive;
    // its neck stretched out low into the charge, its antlers forward
    stride = (stride + dt * GALLOP.hz) % 1;
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
      const w = a.t / Math.max(0.05, a.hit ?? 0.85), stamp = Math.min(1, w) * 3;
      const lift = w < 1 ? Math.sin((stamp % 1) * Math.PI) ** 2 : 0;
      leg[PAWING][0] += -0.75 * lift;
      leg[PAWING][1] += 1.3 * lift;
      leg[PAWING][2] += -0.5 * lift;
      bodyX += 0.05 * lift;
    }
    neckX += 0.62 * lowered;
    headX += 0.28 * lowered;
    neckY *= 1 - lowered;

    // its antlers' sweep: its head drawn back and low to one side, then swept round before it
    if (a?.name === 'sweep') {
      const h = a.hit ?? 0.5, w = a.t;
      const back = ramp(w, 0, h * 0.85) * (1 - ramp(w, h * 0.85, h)), swept = ramp(w, h * 0.85, h) * (1 - ramp(w, h + 0.15, 1));
      neckY += -0.7 * back + 0.8 * swept;
      neckX += 0.45 * back + 0.25 * swept;
      headZ += 0.3 * back - 0.35 * swept;
      bodyZ += 0.05 * back - 0.06 * swept;
    }
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

    body.position.y = bodyY;
    body.rotation.set(bodyX, 0, bodyZ);
    neck.rotation.set(neckX, neckY, 0);
    head.rotation.set(headX, 0, headZ);
    LEGS.forEach((l, i) => {
      const rest = l.hind ? HIND.rest : FORE.rest;
      legs[i][0].rotation.x = rest[0] + leg[i][0] - bodyX;
      legs[i][1].rotation.x = rest[1] + leg[i][1];
      legs[i][2].rotation.x = rest[2] + leg[i][2];
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

  return {
    root, kit, animate, height: 7.2,
    reset() { galloping = lowered = reeling = sag = stride = 0; },
    dispose() { kit.dispose(); },
  };
}
