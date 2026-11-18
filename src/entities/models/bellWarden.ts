// The Bell-Warden (entities/bellWarden.ts): a cracked bronze bell taller than a house, hung in a wooden frame on two
// carrying poles, borne by four ghouls, one at each end of each pole, each chained by an iron collar to the frame. A pale
// light swings inside the bell as its clapper, and ghosts circle it (models/bellGhosts.ts). A guard that stands where it
// rises (`userData.planted`) has no bearers: its frame stands on its poles on the ground, its chains hanging to it. It shuffles, swaying; for
// a toll the bell swings back on its headstock,
// its cracks and its clapper glowing, and comes down through the warning (`ActionState.hit`). What its fight shows
// (`AnimState.boss`): a chain broken hangs loose from the frame, all four broken the frame sinks and the bell rests on
// the ground (its weak-spot window, the clapper beating at a pulse a second), in the last phase the bearers kneel.
// Drawn in its crowd (models/crowd.ts): every change is a joint's place or a glow's strength, nothing hidden.
import * as THREE from 'three';
import { createKit } from '../../core/materials';
import { grunge, pbrMaterialMaps, veins } from '../../core/textures';
import { joint, ramp } from './rig';
import { Sculpt, lathe, limb, organic, skipping, taperTube } from './shapes';
import { mulberry } from '../../util';
import { bellGhosts, type GhostCue } from './bellGhosts';
import type { AnimState, Model } from '../../types';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const NONE = new THREE.BufferGeometry();
/** a geometry made only where the kind's pieces aren't replayed (models/shapes.ts) */
const made = (f: () => THREE.BufferGeometry): THREE.BufferGeometry => (skipping() ? NONE : f());

/** the frame's measures (m): the poles' height and half their spread, the posts' half spread, the beam's height, where
 *  the bearers stand along the poles, and where each chain is fixed on the frame */
const POLE_Y = 1.62, POLE_X = 1.7, POST_X = 2.1, BEAM_Y = 6.7, BEARER_Z = 2.8, ANCHOR = V(2.1, 3.4, 0.35);
/** the bell: its lip's radius, its height, and its headstock's drop under the beam */
const LIP = 1.62, BELL_H = 4.6, HEAD_DROP = 0.35;
/** how far the frame sinks with the bell down, and with the bearers kneeling (m) */
const SINK_DOWN = 1.05, SINK_KNEEL = 0.45;
/** how far a standing guard's frame is set down (m): its poles on the ground, its bell's lip a hand over it */
const SINK_PLANTED = POLE_Y - 0.12;

/** A bearer's joints, posed by the walk. */
interface Bearer {
  hips: THREE.Group; chest: THREE.Group; head: THREE.Group;
  thigh: [THREE.Group, THREE.Group]; knee: [THREE.Group, THREE.Group];
  shoulder: [THREE.Group, THREE.Group]; elbow: [THREE.Group, THREE.Group];
  /** its place in the walk, and which side of the frame it stands on */
  lag: number; side: number;
}

export function buildBellWarden(): Model {
  // (its edge as it dissolves a deep blue: the pale toll's light at three times strength blew its fall out white)
  const kit = createKit(0x3a5cff);
  const g = pbrMaterialMaps(grunge(), 2, 1);
  // cast bronze gone brown and green, its cracks glowing pale from within (bright as it tolls)
  const bronze = kit.std({
    color: 0xa0702e, metalness: 0.5, roughness: 0.5, map: g.map, roughnessMap: g.roughnessMap, normalMap: g.normalMap,
    normalScale: new THREE.Vector2(0.9, 0.9), emissive: new THREE.Color(0xc8d8ff), emissiveMap: veins(23, 6), emissiveIntensity: 0.12,
  });
  const verdigris = kit.std({ color: 0x2f5446, metalness: 0.3, roughness: 0.7, map: g.map, normalMap: g.normalMap });
  const wood = kit.std({ color: 0x3a2818, roughness: 0.85, map: g.map, normalMap: g.normalMap, normalScale: new THREE.Vector2(1.8, 1.8) });
  const iron = kit.std({ color: 0x3e3b38, metalness: 0.85, roughness: 0.55, roughnessMap: g.roughnessMap, normalMap: g.normalMap });
  // the ghouls: grey-green dead skin, pale veins where the bell's light got into them
  const flesh = kit.rim({
    color: 0x6a6a58, roughness: 0.8, map: g.map, normalMap: g.normalMap, normalScale: new THREE.Vector2(1.5, 1.5),
    emissive: 0xb8ccff, emissiveMap: veins(19), emissiveIntensity: 0.35,
  }, 0x6a7a90, 0.3);
  const rag = kit.std({ color: 0x2e2620, roughness: 0.95, map: g.map, normalMap: g.normalMap, side: THREE.DoubleSide });
  const clapper = kit.glow(0xdce8ff, 5);
  const eye = kit.glow(0xc8d8ff, 7);

  const root = new THREE.Group();
  const S = new Sculpt('bellwarden').glow(clapper).glow(eye);
  const r = mulberry(31);

  // --- the frame: two carrying poles, two posts braced to them, a beam across their tops ----------------------
  const frame = joint(root, 0, 0, 0);
  for (const s of [1, -1]) {
    S.add(made(() => new THREE.CylinderGeometry(0.13, 0.13, BEARER_Z * 2 + 0.9, 10).rotateX(Math.PI / 2)), wood, frame, [s * POLE_X, POLE_Y, 0]);
    for (const z of [-1, 1]) S.add(made(() => new THREE.CylinderGeometry(0.15, 0.15, 0.08, 10).rotateX(Math.PI / 2)), iron, frame, [s * POLE_X, POLE_Y, z * (BEARER_Z + 0.4)]);
    // the post, standing on a cross-piece over the pole, braced fore and aft
    S.add(made(() => new THREE.BoxGeometry(0.34, 0.3, 0.9)), wood, frame, [s * (POLE_X + 0.2), POLE_Y + 0.2, 0]);
    S.add(made(() => new THREE.BoxGeometry(0.26, BEAM_Y - POLE_Y + 0.2, 0.26)), wood, frame, [s * POST_X, (POLE_Y + BEAM_Y) / 2 + 0.1, 0]);
    for (const z of [-1, 1]) {
      S.add(made(() => taperTube([V(s * POLE_X, POLE_Y + 0.1, z * 1.5), V(s * POST_X, POLE_Y + 2.1, z * 0.12)], () => 0.08, 3, 6)), wood, frame);
    }
    S.add(made(() => new THREE.TorusGeometry(0.14, 0.035, 6, 12)), iron, frame, [s * POST_X, ANCHOR.y, ANCHOR.z], [0, Math.PI / 2, 0]);
  }
  S.add(made(() => new THREE.BoxGeometry(POST_X * 2 + 0.7, 0.36, 0.42)), wood, frame, [0, BEAM_Y, 0]);
  S.add(made(() => new THREE.BoxGeometry(POST_X * 2 + 0.9, 0.08, 0.5)), iron, frame, [0, BEAM_Y + 0.21, 0]);
  for (const x of [-1.2, 1.2]) S.add(made(() => new THREE.TorusGeometry(0.2, 0.05, 6, 14)), iron, frame, [x, BEAM_Y - 0.15, 0], [0, 0, 0]);

  // --- the bell on its headstock, swinging about the beam ----------------------------------------------------
  const swing = joint(frame, 0, BEAM_Y - HEAD_DROP, 0);
  S.add(made(() => new THREE.BoxGeometry(2.6, 0.42, 0.5)), wood, swing, [0, 0.05, 0]);
  for (const x of [-1, 1]) S.add(made(() => new THREE.BoxGeometry(0.1, 0.7, 0.56)), iron, swing, [x * 0.9, -0.2, 0]);
  // its profile bottom to top (faces out): the lip's flare, the sound bow, the waist, the shoulder, the crown
  // (a bell's: the lip flared out over a thick sound bow, a long narrow waist, a rounded shoulder; as shares of the
  // lip's radius and the bell's height, from the lip up)
  const shape: [number, number][] = [
    [0.93, 0], [1, 0.015], [0.99, 0.05], [0.9, 0.1], [0.76, 0.17], [0.64, 0.27], [0.57, 0.42], [0.54, 0.6],
    [0.53, 0.76], [0.52, 0.84], [0.47, 0.9], [0.35, 0.95], [0.18, 0.98], [0.01, 0.99],
  ];
  const profile = shape.map(([rr, h]) => [LIP * rr, -BELL_H + BELL_H * h] as [number, number]);
  /** the bell's outside radius `h` of its height up from the lip */
  const radiusAt = (h: number): number => {
    for (let i = 1; i < shape.length; i++) {
      if (shape[i][1] >= h) {
        const [r0, h0] = shape[i - 1], [r1, h1] = shape[i];
        return LIP * (r0 + (r1 - r0) * (h - h0) / (h1 - h0));
      }
    }
    return 0;
  };
  S.add(made(() => organic(lathe(profile, 40), 0.012, 3, 5)), bronze, swing);
  // its inside, a little in from the outside (top to bottom: its faces point in, where they're seen from)
  S.add(made(() => lathe(profile.map(([rr, y]) => [Math.max(0.01, rr - 0.1), y] as [number, number]).reverse(), 32)), bronze, swing);
  // bands round the sound bow and the shoulder, a verdigris crust under them, the crown's loops
  for (const [y, rr] of [0.07, 0.8, 0.84].map((h) => [-BELL_H + BELL_H * h, radiusAt(h) + 0.02] as const)) {
    S.add(made(() => new THREE.TorusGeometry(rr, 0.045, 6, 48).rotateX(Math.PI / 2)), bronze, swing, [0, y, 0]);
  }
  S.add(made(() => new THREE.TorusGeometry(radiusAt(0.14), 0.05, 6, 40).rotateX(Math.PI / 2)), verdigris, swing, [0, -BELL_H + BELL_H * 0.14, 0], [0, 0, 0], [1, 1, 0.6]);
  for (let i = 0; i < 9; i++) {
    // (streaks of verdigris run down from the shoulder's band: thin, where the rain ran off it)
    const a = r() * Math.PI * 2, h = 0.55 + r() * 0.25, y = -BELL_H + BELL_H * h, rr = radiusAt(h) - 0.005;
    S.add(made(() => organic(new THREE.SphereGeometry(1, 8, 6), 0.25, 3, i)), verdigris, swing, [Math.sin(a) * rr, y, Math.cos(a) * rr], [0, a, 0], [0.07 + r() * 0.06, 0.25 + r() * 0.35, 0.025]);
  }
  for (const x of [-0.35, 0, 0.35]) S.add(made(() => new THREE.TorusGeometry(0.16, 0.05, 6, 12)), bronze, swing, [x, -0.18, 0], [0, Math.PI / 2, 0]);
  // the crack: a split up from the lip, its edges standing proud
  S.add(made(() => taperTube([V(0, 0, 0), V(0.05, 0.6, 0.02), V(-0.04, 1.2, 0.05), V(0.03, 1.9, 0.08)], (t) => 0.05 * (1 - t * 0.6), 8, 5)),
    iron, swing, [LIP * 0.2, -BELL_H + 0.05, LIP * 0.96], [-0.18, 0, 0]);

  // the clapper: an iron rod hung from the crown inside, a pale light at its foot
  const clap = joint(swing, 0, -0.3, 0);
  S.add(made(() => new THREE.CylinderGeometry(0.05, 0.05, BELL_H - 1.3, 6).translate(0, -(BELL_H - 1.3) / 2, 0)), iron, clap);
  S.add(made(() => new THREE.SphereGeometry(0.3, 16, 12)), clapper, clap, [0, -(BELL_H - 1.1), 0]);

  // --- the bearers: four ghouls under the poles' ends, collared ---------------------------------------------
  const bearers: Bearer[] = [];
  for (const [sx, sz, lag] of [[1, 1, 0], [-1, 1, 0.5], [1, -1, 0.5], [-1, -1, 0]] as const) {
    bearers.push(bearer(S, root, sx * POLE_X, sz * BEARER_Z, sx, lag, { flesh, rag, iron, eye }, r));
  }

  // --- the chains: from each bearer's collar up to its ring on the frame -------------------------------------
  // (each a joint of its own at the frame's ring, its links laid along its local -y; aimed at the collar each frame,
  // broken it hangs straight down, shortened: a joint's place, which its crowd draws per body)
  const chains: { j: THREE.Group; to: Bearer }[] = [];
  const LINKS = 16, LINK = 0.19;
  bearers.forEach((b) => {
    const j = joint(frame, Math.sign(b.hips.position.x) * ANCHOR.x, ANCHOR.y, Math.sign(b.hips.position.z) * ANCHOR.z);
    for (let i = 0; i < LINKS; i++) {
      S.add(made(() => new THREE.TorusGeometry(0.06, 0.018, 5, 10)), iron, j, [0, -(i + 0.5) * LINK, 0], [0, i % 2 ? Math.PI / 2 : 0, 0], [0.75, 1.5, 1]);
    }
    chains.push({ j, to: b });
  });
  S.build();
  // the ghosts haunting it (models/bellGhosts.ts): its own meshes, not its crowd's
  const ghosts = bellGhosts(root);
  // (where the game finds them: a ghost seizes a hero who comes too near, entities/bellWarden.ts)
  root.userData.ghosts = ghosts.seen;
  // (its bearers' bodies, each from its hips: `lab boss` reads that a planted bell draws none)
  root.userData.bearers = bearers.map((b) => b.hips);
  const cue: GhostCue = { rush: 0, burst: 0, scatter: 0, count: 2, bell: new THREE.Vector3() };

  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3(0, -1, 0), _q = new THREE.Quaternion();
  const _inv = new THREE.Matrix4();
  let sink = 0, kneel = 0, down = 0, hang = [0, 0, 0, 0];

  function animate(st: AnimState): void {
    const { t, dt } = st, look = st.boss, a = st.action;
    const dead = st.dead >= 0 ? st.dead : 0;
    const allBroken = !!look && look.broken === 0b1111;
    // (eased: the frame sinks as the chains go and rises as they're whole, the bearers kneel in the last phase)
    const k = 1 - Math.exp(-dt * 3);
    down += ((allBroken || dead > 0 ? 1 : 0) - down) * k;
    kneel += (((look?.phase ?? 0) >= 2 ? 1 : 0) - kneel) * k;
    // (a guard that stands where it rose has no bearers: its frame stands on its poles, and sinks no further)
    const planted = !!root.userData.planted;
    sink = planted ? SINK_PLANTED : Math.max(down * SINK_DOWN, kneel * SINK_KNEEL);
    frame.position.y = -sink;
    // the shuffle's sway, the frame rocking over the bearers' steps
    const walk = st.move * (1 - down), ph = st.phase;
    frame.rotation.z = Math.sin(ph) * 0.035 * walk + Math.sin(t * 0.7) * 0.01;
    frame.rotation.x = Math.sin(ph * 2) * 0.012 * walk + down * 0.06 * (dead > 0 ? 2 : 1);
    frame.position.y += Math.abs(Math.sin(ph)) * 0.05 * walk;

    // the bell: swinging gently as it goes; for a toll swung back through the warning and brought through on the hit
    let swingX = Math.sin(t * 1.1) * 0.04 + Math.sin(ph) * 0.06 * walk, glow = 0.12;
    cue.rush = 0;
    cue.burst = 0;
    if (a && (a.name === 'toll' || a.name === 'doubleToll')) {
      const h = a.hit ?? 0.5, back = ramp(a.t, 0, h * 0.85), through = ramp(a.t, h * 0.85, h);
      const after = ramp(a.t, h, 1);
      // (the ghosts drawn into the bell over the warning's second half, thrown out of it as it tolls)
      cue.rush = ramp(a.t, h * 0.35, h * 0.95) * (a.t < h ? 1 : 0);
      cue.burst = a.t >= h ? Math.min(1, ramp(a.t, h, Math.min(1, h + 0.3)) + 1e-3) : 0;
      swingX = -0.55 * back * (1 - through) + 0.32 * through * (1 - after) + Math.sin(a.t * 18) * 0.04 * after * (1 - after) * 4;
      // (its cracks brighten over the warning and fade after: once a toll, no faster than the root's flash rule)
      glow = 0.12 + 3.2 * back * (1 - after) ** 2;
      if (a.name === 'doubleToll') swingX += 0.18 * Math.sin(Math.min(1, after * 1.4) * Math.PI) * (1 - after);
    }
    if (look && look.weak > 0) glow = Math.max(glow, 1.2 + 0.8 * Math.sin(t * Math.PI * 2));
    swing.rotation.x = swingX * (1 - down);
    bronze.emissiveIntensity = glow;
    // the clapper hangs behind the bell's swing, its light brighter as it tolls
    clap.rotation.x = -swingX * 0.6 + Math.sin(t * 1.7) * 0.08;
    clap.rotation.z = Math.sin(t * 1.3) * 0.06;
    clapper.emissiveIntensity = 3 + glow * 1.4;
    eye.emissiveIntensity = 5 + glow;
    flesh.emissiveIntensity = 0.3 + glow * 0.12;

    // the bearers: a hunched shuffle under the poles, kneeling in the last phase and slumped with the bell down
    bearers.forEach((b, i) => poseBearer(b, t, ph + b.lag * Math.PI * 2, walk, Math.max(kneel, down), dead, i));
    // (none under a planted bell: drawn at no size, as its crowd draws each joint as placed)
    for (const b of bearers) b.hips.scale.setScalar(planted ? 0 : 1);

    // the ghosts: round the bell, into it for a toll, scattered while it's down or as it falls, three in the last phase
    cue.scatter = Math.max(down, dead);
    // (a guard's lesser bell has one: `Enemy` tells its model, `userData.guard`)
    cue.count = root.userData.guard ? 1 : (look?.phase ?? 0) >= 2 ? 3 : 2;
    cue.bell.set(0, frame.position.y + BEAM_Y - HEAD_DROP - BELL_H * 0.6, 0);
    ghosts.update(t, dt, cue);

    // the chains: aimed from the frame's ring at the collar, or hanging loose once broken
    root.updateMatrixWorld(true);
    _inv.copy(frame.matrixWorld).invert();
    chains.forEach((c, i) => {
      const broken = !!look && (look.broken & (1 << i)) !== 0;
      // (a planted bell's chains hang from their rings to the floor, no collar to reach)
      hang[i] += ((broken || planted ? 1 : 0) - hang[i]) * (1 - Math.exp(-dt * 6));
      c.to.chest.getWorldPosition(_a).applyMatrix4(_inv);
      _b.copy(_a).sub(c.j.position);
      const len = planted ? (c.j.position.y - sink) / (broken ? 1 : 1 - 0.55) : _b.length();
      _b.normalize();
      // (from taut towards the collar to hanging straight down, swinging a little)
      _b.lerp(_up.set(Math.sin(t * 2 + i) * 0.08, -1, 0), hang[i]).normalize();
      _q.setFromUnitVectors(_up.set(0, -1, 0), _b);
      c.j.quaternion.copy(_q);
      c.j.scale.set(1, (len / (LINKS * LINK)) * (1 - hang[i] * 0.55), 1);
    });
  }

  return {
    root, kit, animate, height: 3.2,
    reset() { sink = kneel = down = 0; hang = [0, 0, 0, 0]; ghosts.reset(); },
    dispose() { kit.dispose(); ghosts.dispose(); },
  };
}

/** A ghoul bearer at (x, z) under a pole's end, on side `side` of the frame: gaunt, hunched, its arms up to the pole,
 *  an iron collar round its neck. */
function bearer(S: Sculpt, root: THREE.Object3D, x: number, z: number, side: number, lag: number,
  m: { flesh: THREE.Material; rag: THREE.Material; iron: THREE.Material; eye: THREE.Material }, r: () => number): Bearer {
  const hips = joint(root, x, 0.92, z);
  const lim = (len: number, r0: number, r1: number, seed: number) => made(() => organic(limb(len, r0, r1, 0.2, 0.3, 10), r0 * 0.12, 20, seed));
  S.add(made(() => organic(new THREE.SphereGeometry(1, 12, 8), 0.1, 3, 1)), m.flesh, hips, [0, 0.02, 0], [0, 0, 0], [0.16, 0.1, 0.11]);
  S.add(made(() => new THREE.CylinderGeometry(0.19, 0.24, 0.32, 10, 1, true).translate(0, -0.12, 0)), m.rag, hips);
  const thigh: [THREE.Group, THREE.Group] = [joint(hips, 0.1, -0.02, 0), joint(hips, -0.1, -0.02, 0)];
  const knee: [THREE.Group, THREE.Group] = [joint(thigh[0], 0, -0.44, 0), joint(thigh[1], 0, -0.44, 0)];
  for (let i = 0; i < 2; i++) {
    S.add(lim(0.46, 0.07, 0.05, 3 + i), m.flesh, thigh[i]);
    S.add(lim(0.44, 0.05, 0.035, 5 + i), m.flesh, knee[i]);
    S.add(made(() => organic(new THREE.SphereGeometry(1, 8, 6), 0.12, 3, 7 + i)), m.flesh, knee[i], [0, -0.47, 0.05], [0, 0, 0], [0.05, 0.03, 0.12]);
  }
  const chest = joint(hips, 0, 0.16, 0);
  S.add(made(() => organic(new THREE.SphereGeometry(1, 14, 10), 0.09, 3, 9)), m.flesh, chest, [0, 0.24, 0], [0, 0, 0], [0.2, 0.26, 0.14]);
  for (let i = 0; i < 5; i++) S.add(made(() => new THREE.SphereGeometry(0.025, 6, 4)), m.flesh, chest, [0, 0.12 + i * 0.07, -0.13]);
  S.add(made(() => new THREE.TorusGeometry(0.11, 0.035, 6, 14).rotateX(Math.PI / 2)), m.iron, chest, [0, 0.52, 0.02]);
  const head = joint(chest, 0, 0.58, 0.08);
  S.add(made(() => organic(new THREE.SphereGeometry(1, 12, 10), 0.12, 3, 11 + r() * 4)), m.flesh, head, [0, 0.08, 0.02], [0, 0, 0], [0.1, 0.12, 0.12]);
  S.add(made(() => organic(new THREE.SphereGeometry(1, 10, 6), 0.1, 3, 13)), m.flesh, head, [0, 0.0, 0.08], [0.3, 0, 0], [0.08, 0.05, 0.07]);
  for (const ex of [-0.04, 0.04]) S.add(made(() => new THREE.SphereGeometry(0.016, 8, 6)), m.eye, head, [ex, 0.1, 0.11]);
  // its arms raised to the pole over its shoulder: the near one under it, the far one across to it
  const shoulder: [THREE.Group, THREE.Group] = [joint(chest, 0.2, 0.44, 0), joint(chest, -0.2, 0.44, 0)];
  const elbow: [THREE.Group, THREE.Group] = [joint(shoulder[0], 0, -0.32, 0), joint(shoulder[1], 0, -0.32, 0)];
  for (let i = 0; i < 2; i++) {
    S.add(lim(0.34, 0.05, 0.04, 15 + i), m.flesh, shoulder[i]);
    S.add(lim(0.33, 0.04, 0.03, 17 + i), m.flesh, elbow[i]);
    S.add(made(() => organic(new THREE.SphereGeometry(1, 8, 6), 0.15, 3, 19 + i)), m.flesh, elbow[i], [0, -0.37, 0], [0, 0, 0], [0.05, 0.08, 0.035]);
  }
  return { hips, chest, head, thigh, knee, shoulder, elbow, lag, side };
}

/** A bearer posed: its shuffle at walk cycle `ph` (`walk` how much it walks), its arms up to the pole, `kneel` how far
 *  it's down on its knees, `dead` how far its fall is through. */
function poseBearer(b: Bearer, t: number, ph: number, walk: number, kneel: number, dead: number, i: number): void {
  const bob = Math.sin(t * 1.3 + i) * 0.015;
  const step = Math.sin(ph) * 0.4 * walk;
  // (kneeling: the thighs forward, the shins back under them, the hips down by as much)
  b.hips.position.y = 0.92 - kneel * 0.45 - dead * 0.5 + bob + Math.abs(Math.sin(ph)) * 0.03 * walk;
  for (let s = 0; s < 2; s++) {
    const sw = s === 0 ? step : -step;
    b.thigh[s].rotation.x = -sw - kneel * 1.3 - 0.15;
    b.knee[s].rotation.x = Math.max(0, sw) * 0.8 + kneel * 2.2 + 0.25;
  }
  b.chest.rotation.x = 0.35 + kneel * 0.25 + dead * 0.6 + Math.sin(ph * 2) * 0.04 * walk;
  b.chest.rotation.z = Math.sin(ph) * 0.06 * walk;
  b.head.rotation.x = -0.25 + Math.sin(t * 0.9 + i) * 0.08;
  // the arms up to the pole on its outer side (`side`): its near arm under the pole, its far arm reaching across
  const out = b.side;
  b.shoulder[0].rotation.set(-2.5 + kneel * 0.3, 0, out > 0 ? -0.35 : 0.55);
  b.shoulder[1].rotation.set(-2.5 + kneel * 0.3, 0, out > 0 ? -0.55 : 0.35);
  b.elbow[0].rotation.x = -0.9 - dead;
  b.elbow[1].rotation.x = -0.9 - dead;
}
