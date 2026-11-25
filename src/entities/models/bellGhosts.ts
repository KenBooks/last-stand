// The Bell-Warden's ghost (models/bellWarden.ts): a pale spirit circling the haunted bell it holds up in the air,
// drifting round it and swooping low under its lip (one, a guard's lesser bell's; built as a set, `MOST`). Each is a shroud of added light hooded over a head, its arms reaching out before it
// and its ragged hem swept back by its flight, a cold heart glowing in its chest, two bright eyes and a wailing mouth
// in its hood, a faint halo round it and a tail of fading motes along the way it came. They rush into the bell as a
// toll's warning builds (a second warning beside the bell's swing) and burst out of it as it tolls; they scatter and
// fade as the bell falls. A look
// alone: they touch nothing, and arrows and the aim pass through them (added light is no solid).
//
// Their meshes are the model's own, not its crowd's (models/crowd.ts draws solid kit materials alone): see-through
// added light, as an effect's, in `additive` materials (nearGlow: the shockwave's program, and its instanced twin for
// the motes, compiled with the boss's warm-up), their own per body, made with the model and let go with it. A ghost
// is four draws (shroud, halo, face, heart) and every ghost's motes one: a mesh a mote was 30 draws for three ghosts.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { additive } from '../../core/materials';
import { mulberry } from '../../util';

/** what the ghosts are told each frame: how far a toll's rush into the bell has gone (0..1) and its burst out after
 *  (0..1), how scattered they are (0..1: the bell's fall), and where the bell's middle is (the model's space) */
export interface GhostCue {
  rush: number;
  burst: number;
  scatter: number;
  bell: THREE.Vector3;
}

/** how many ghosts there are, and the motes of a tail */
const MOST = 1;
const MOTES = 7;
/** frames of each ghost's way kept, and how many apart its tail's motes are taken */
const MOTE_EVERY = 4;
const KEPT = MOTES * MOTE_EVERY + 1;
/** the ring they circle in (m: its radius and how far it swells and shrinks), the heights they drift between, how
 *  fast they go round (rad/s) and swoop (rad/s) */
const RING = 3.6, RING_SWAY = 0.9, HIGH = 5.4, LOW = 1.9, TURN = 0.75, SWOOP = 0.9;
/**
 * the ghosts' light: their pale colour; the shroud's strength and how much of it shows; the halo round it, fainter;
 * the heart's; the tail's motes; the face's (eyes and mouth). Seen through: drawn near-solid, a ghost read as a white
 * dart; drawn as one plain sheet, "a bit simple".
 */
const PALE = 0xc4e2ff, BODY = 0.9, SHROUD_SEE = 0.26, HALO_SEE = 0.07, HEART = 2.4, HEART_SEE = 0.5;
const MOTE_SEE = 0.5, FACE = 3.2;
/** how far a ghost leans into the way it flies (rad), how much larger its halo is than it, how fast its hem ripples
 *  (rad/s) */
const LEAN = 0.4, HALO = 1.28, RIPPLE = 3.2;

/**
 * A ghost's shroud: a hood over a round head, shoulders, and a robe widening to a ragged hem of tongues, each its own
 * length, swept back behind it (its profile lathed bottom to top, so its faces point out; its back is -z), and its two
 * arms, thin and tapering, reaching out before it and a little down.
 */
export function shroudGeometry(): THREE.BufferGeometry {
  const r = mulberry(17);
  const profile = [[0.42, -1.05], [0.4, -0.75], [0.35, -0.45], [0.33, -0.15], [0.36, 0.05], [0.3, 0.18], [0.26, 0.3],
    [0.25, 0.42], [0.18, 0.55], [0.01, 0.6]];
  const robe = new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), 30);
  // (nine tongues round the hem, each its own length, and the lower the robe the further its flight sweeps it back)
  const tongues = Array.from({ length: 9 }, () => 0.15 + r() * 0.3);
  const at = robe.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < at.count; i++) {
    const x = at.getX(i), y = at.getY(i), z = at.getZ(i);
    const below = Math.max(0, -0.35 - y) / 0.7;
    const a = (Math.atan2(x, z) / (Math.PI * 2) + 1) * tongues.length;
    const k = Math.floor(a) % tongues.length, f = a - Math.floor(a);
    // (a tongue's point at its middle, the cut between two tongues higher)
    const ragged = tongues[k] * Math.sin(f * Math.PI) - 0.12;
    at.setXYZ(i, x * (1 + below * 0.15), y - ragged * below * below, z - below ** 1.5 * 0.45);
  }
  const arms = [-1, 1].map((side) => {
    const arm = new THREE.ConeGeometry(0.075, 0.62, 8, 3, true).rotateX(Math.PI / 2 + 0.5);
    return arm.rotateY(-side * 0.25).translate(side * 0.27, 0.0, 0.3);
  });
  const shroud = mergeGeometries([robe.toNonIndexed(), ...arms.map((arm) => arm.toNonIndexed())])!;
  robe.dispose();
  for (const arm of arms) arm.dispose();
  shroud.computeVertexNormals();
  return shroud;
}

/** Its face, in the front of its hood: two eyes and a mouth opened in a wail. */
export function faceGeometry(): THREE.BufferGeometry {
  const eyes = [-0.085, 0.085].map((x) => new THREE.SphereGeometry(0.04, 8, 6).scale(1, 1.35, 0.6).translate(x, 0.33, 0.22));
  const mouth = new THREE.TorusGeometry(0.045, 0.015, 6, 12).scale(1, 1.5, 1).translate(0, 0.2, 0.235);
  const face = mergeGeometries([...eyes, mouth].map((g) => g.toNonIndexed()))!;
  for (const g of [...eyes, mouth]) g.dispose();
  return face;
}

/** What the game asks of a Bell-Warden's ghosts (entities/bellWarden.ts: a ghost seizes a hero who comes too near),
 *  kept on its model's root as `userData.ghosts`. */
export interface GhostsSeen {
  /** how many ghosts there can be */
  readonly most: number;
  /** ghost `i`'s place in the world into `out`, or null where it isn't free to seize anyone (not shown, rushing into
   *  the bell or bursting out of it, scattered) */
  freeAt(i: number, out: THREE.Vector3): THREE.Vector3 | null;
  /** ghost `i` held at a place in the world (carrying a hero over his head), or let go (null) */
  hold(i: number, at: THREE.Vector3 | null): void;
}

/** A ghost: its body (shroud, halo, face, heart), and its way so far (the model's space, newest first). */
interface Ghost {
  body: THREE.Group;
  halo: THREE.Mesh;
  heart: THREE.Mesh;
  way: THREE.Vector3[];
  /** where something holds it (the world), or null */
  held: THREE.Vector3 | null;
}

/** The ghosts of one Bell-Warden, hung on `root`: posed each frame by `update`, let go by `dispose`. */
export function bellGhosts(root: THREE.Object3D) {
  const shroud = shroudGeometry();
  const face = faceGeometry();
  const heartGeo = new THREE.SphereGeometry(0.07, 12, 8);
  const moteGeo = new THREE.SphereGeometry(0.2, 10, 8);
  const shroudMat = additive(PALE, BODY, SHROUD_SEE);
  const haloMat = additive(PALE, BODY, HALO_SEE);
  const heartMat = additive(0xdff0ff, HEART, HEART_SEE);
  const faceMat = additive(0xeef4ff, FACE, 0.95);
  const moteMat = additive(PALE, BODY, MOTE_SEE);
  // (every ghost's motes one instanced mesh, each mote fading along its tail by its colour: added light, so a darker
  // colour is a fainter mote)
  const motes = new THREE.InstancedMesh(moteGeo, moteMat, MOST * MOTES);
  motes.name = 'bell ghosts\' tails';
  motes.frustumCulled = false;
  const _c = new THREE.Color();
  for (let i = 0; i < MOST * MOTES; i++) motes.setColorAt(i, _c.setScalar(0));
  root.add(motes);
  const ghosts: Ghost[] = [];
  for (let i = 0; i < MOST; i++) {
    const body = new THREE.Group();
    body.name = 'bell ghost';
    body.add(new THREE.Mesh(shroud, shroudMat));
    const halo = new THREE.Mesh(shroud, haloMat);
    halo.scale.setScalar(HALO);
    const heart = new THREE.Mesh(heartGeo, heartMat);
    heart.position.set(0, -0.28, 0.04);
    body.add(halo, heart, new THREE.Mesh(face, faceMat));
    root.add(body);
    ghosts.push({ body, halo, heart, way: [], held: null });
  }

  const _at = new THREE.Vector3(), _dir = new THREE.Vector3(), _m = new THREE.Matrix4(), _s = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  /** the last frame's cue: whether a ghost is free to seize (no toll's rush or burst, not scattered) */
  let free = true;

  /** Where ghost `i` drifts at time `t` with no toll or scatter: round the ring, swooping between its heights. */
  function drifting(i: number, t: number, out: THREE.Vector3): THREE.Vector3 {
    const a = t * TURN * (i % 2 ? -1 : 1) + (i * Math.PI * 2) / MOST;
    const r = RING + Math.sin(t * 0.55 + i * 1.7) * RING_SWAY;
    const k = 0.5 + 0.5 * Math.sin(t * SWOOP + i * 2.3);
    return out.set(Math.sin(a) * r, LOW + (HIGH - LOW) * k * k, Math.cos(a) * r);
  }

  /** Ghost `g`'s tail: its motes along the way it came, each smaller and fainter, at instance `from` on. */
  function tail(g: Ghost, from: number, size: number, light: number, t: number): void {
    for (let j = 0; j < MOTES; j++) {
      const at = g.way[Math.min(g.way.length - 1, (j + 1) * MOTE_EVERY)] ?? g.body.position;
      const s = Math.max(1e-3, size * (1 - j / (MOTES + 1)) * (0.85 + 0.25 * Math.sin(t * 3 + j)));
      motes.setMatrixAt(from + j, _m.compose(at, _q, _s.setScalar(s)));
      motes.setColorAt(from + j, _c.setScalar(light * (1 - j / MOTES) ** 1.6));
    }
  }

  /** The ghosts posed for the frame: drifting, rushing into the bell or bursting out, scattered, shown or faded. */
  function update(t: number, cue: GhostCue): void {
    // (the whole light: brighter as they rush in and flare out, once a toll; faded as they scatter)
    const flare = 1 + cue.rush * 0.8 + cue.burst * (1 - cue.burst) * 2.4;
    const fade = 1 - cue.scatter;
    shroudMat.opacity = SHROUD_SEE * flare * fade;
    haloMat.opacity = HALO_SEE * flare * fade;
    heartMat.opacity = HEART_SEE * flare * fade;
    faceMat.opacity = 0.95 * fade;
    free = cue.rush === 0 && cue.burst === 0 && cue.scatter < 0.05;
    ghosts.forEach((g, i) => {
      drifting(i, t, _at);
      // (scattered: flung out wide and high; rushing: drawn into the bell's mouth; bursting: thrown out past the ring)
      _at.multiplyScalar(1 + cue.scatter * 1.6).add(_dir.set(0, cue.scatter * 2.5, 0));
      _at.lerp(cue.bell, cue.rush * cue.rush);
      if (cue.burst > 0) _at.addScaledVector(_dir.copy(_at).sub(cue.bell).setY(0).normalize(), cue.burst * (1 - cue.burst) * 3);
      // (held: where its hold has it, carrying a hero, in the model's space)
      if (g.held) root.worldToLocal(_at.copy(g.held));
      const last = g.way[0];
      g.way.unshift((g.way.length >= KEPT ? g.way.pop()! : new THREE.Vector3()).copy(_at));
      // (upright, turned to the way it goes and leaning into it, nosing down as it swoops down, rocking a little)
      if (last && last.distanceToSquared(_at) > 1e-8) {
        _dir.copy(_at).sub(last);
        const pitch = LEAN - Math.atan2(_dir.y, Math.hypot(_dir.x, _dir.z)) * 0.5;
        g.body.rotation.set(pitch, Math.atan2(_dir.x, _dir.z), Math.sin(t * 1.6 + i) * 0.12, 'YXZ');
      }
      g.body.position.copy(_at);
      const size = 1 - cue.rush * 0.55;
      g.body.scale.setScalar(Math.max(1e-3, size));
      g.body.visible = size > 0.02;
      // (its halo breathing and its heart beating slowly, each its own: no faster than the root's flash rule)
      g.halo.scale.set(HALO + Math.sin(t * RIPPLE + i) * 0.05, HALO + Math.sin(t * RIPPLE * 0.7 + i) * 0.04, HALO);
      g.heart.scale.setScalar(1 + 0.25 * Math.max(0, Math.sin(t * 2.2 + i * 1.3)) ** 3);
      tail(g, i * MOTES, g.body.visible ? size : 0, fade * flare, t);
    });
    motes.instanceMatrix.needsUpdate = true;
    motes.instanceColor!.needsUpdate = true;
  }

  /** Their ways forgotten (a model reset: they'd draw a tail across the arena), and every hold let go. */
  function reset(): void { for (const g of ghosts) { g.way.length = 0; g.held = null; } }

  const seen: GhostsSeen = {
    most: MOST,
    freeAt(i, out) {
      const g = ghosts[i];
      if (!free || !g || g.held || !g.body.visible) return null;
      return g.body.getWorldPosition(out);
    },
    hold(i, at) {
      const g = ghosts[i];
      if (g) g.held = at ? (g.held ?? new THREE.Vector3()).copy(at) : null;
    },
  };

  function dispose(): void {
    for (const geo of [shroud, face, heartGeo, moteGeo]) geo.dispose();
    for (const mat of [shroudMat, haloMat, heartMat, faceMat, moteMat]) mat.dispose();
    motes.dispose();
  }

  return { update, reset, dispose, seen };
}
