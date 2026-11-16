// The Bell-Warden's ghosts (models/bellWarden.ts): pale spirits circling the haunted bell, drifting round it and
// swooping low over its bearers, each a wisp of added light with two bright eyes and a tail of fading motes along the
// way it came. They rush into the bell as a toll's warning builds (a second warning beside the bell's swing) and
// burst out of it as it tolls; they scatter and fade while the bell lies dropped, and come back as the bearers rise;
// in the last phase a third joins them. A look alone: they touch nothing.
//
// Their meshes are the model's own, not its crowd's (models/crowd.ts draws solid kit materials alone): see-through
// added light, as an effect's, in `additive` materials (nearGlow, the shockwave's program: nothing new to compile),
// their own per body, made with the model and let go with it.
import * as THREE from 'three';
import { additive } from '../../core/materials';

/** what the ghosts are told each frame: how far a toll's rush into the bell has gone (0..1) and its burst out after
 *  (0..1), how scattered they are (0..1: the bell down, or its fall), how many show (2, 3 in the last phase), and
 *  where the bell's middle is (the model's space) */
export interface GhostCue {
  rush: number;
  burst: number;
  scatter: number;
  count: number;
  bell: THREE.Vector3;
}

/** how many ghosts there are at most, and the motes of a tail */
const MOST = 3;
const MOTES = 6;
/** frames of each ghost's way kept, and how many apart its tail's motes are taken */
const MOTE_EVERY = 4;
const KEPT = MOTES * MOTE_EVERY + 1;
/** the ring they circle in (m: its radius and how far it swells and shrinks), the heights they drift between, how
 *  fast they go round (rad/s) and swoop (rad/s) */
const RING = 3.6, RING_SWAY = 0.9, HIGH = 5.4, LOW = 1.9, TURN = 0.75, SWOOP = 0.9;
/**
 * the ghosts' light: their pale colour; the sheet's strength and how much of it shows; the halo round it, fainter;
 * the tail's motes; the eyes'. Seen through: drawn near-solid, a ghost read as a white dart.
 */
const PALE = 0xc4e2ff, BODY = 0.9, HEAD_SEE = 0.3, VEIL_SEE = 0.09, MOTE_SEE = 0.16, EYES = 3.2;

/** A ghost: its body, eyes and tail's motes, and its way so far (the model's space, newest first). */
interface Ghost {
  body: THREE.Group;
  motes: THREE.Mesh[];
  way: THREE.Vector3[];
  shown: number;
}

/**
 * A ghost's shape: a sheet hung from a round head, widening to a hem that waves (its profile lathed bottom to top,
 * so its faces point out). Drawn as a long teardrop along its flight it read as a white dart; a sheet's head and hem
 * read as a ghost from above and from the side.
 */
function sheetGeometry(): THREE.BufferGeometry {
  const profile = [[0.44, -0.95], [0.41, -0.62], [0.35, -0.28], [0.3, 0.02], [0.28, 0.22], [0.2, 0.4], [0.01, 0.47]];
  const geo = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 20);
  const at = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < at.count; i++) {
    const y = at.getY(i);
    // (its hem in five tongues, lifting and falling round it)
    if (y < -0.5) at.setY(i, y + Math.sin(Math.atan2(at.getX(i), at.getZ(i)) * 5) * 0.12 * (-0.5 - y) / 0.45);
  }
  geo.computeVertexNormals();
  return geo;
}

/** how far a ghost leans into the way it flies (rad), and how much larger its halo is than it */
const LEAN = 0.4, HALO = 1.3;

/** The ghosts of one Bell-Warden, hung on `root`: posed each frame by `update`, let go by `dispose`. */
export function bellGhosts(root: THREE.Object3D) {
  const sheet = sheetGeometry();
  const eyeGeo = new THREE.SphereGeometry(0.04, 8, 6);
  const moteGeo = new THREE.SphereGeometry(0.22, 10, 8);
  const headMat = additive(PALE, BODY, HEAD_SEE);
  const veilMat = additive(PALE, BODY, VEIL_SEE);
  const eyeMat = additive(0xeef4ff, EYES, 0.95);
  /** a mote's share of the tail's light, fading along it */
  const moteSee = (j: number): number => MOTE_SEE * (1 - j / MOTES) ** 1.5;
  // (a material a mote of the tail: every ghost's mote there shares it)
  const moteMats = Array.from({ length: MOTES }, (_, j) => additive(PALE, BODY, moteSee(j)));
  const ghosts: Ghost[] = [];
  for (let i = 0; i < MOST; i++) {
    const body = new THREE.Group();
    body.name = 'bell ghost';
    body.add(new THREE.Mesh(sheet, headMat));
    const halo = new THREE.Mesh(sheet, veilMat);
    halo.scale.setScalar(HALO);
    body.add(halo);
    for (const x of [-0.09, 0.09]) {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(x, 0.2, 0.25);
      body.add(eye);
    }
    root.add(body);
    const motes = moteMats.map((mat, j) => {
      const mote = new THREE.Mesh(moteGeo, mat);
      root.add(mote);
      return mote;
    });
    ghosts.push({ body, motes, way: [], shown: i < 2 ? 1 : 0 });
  }

  const _at = new THREE.Vector3(), _dir = new THREE.Vector3();

  /** Where ghost `i` drifts at time `t` with no toll or scatter: round the ring, swooping between its heights. */
  function drifting(i: number, t: number, out: THREE.Vector3): THREE.Vector3 {
    const a = t * TURN * (i % 2 ? -1 : 1) + (i * Math.PI * 2) / MOST;
    const r = RING + Math.sin(t * 0.55 + i * 1.7) * RING_SWAY;
    const k = 0.5 + 0.5 * Math.sin(t * SWOOP + i * 2.3);
    return out.set(Math.sin(a) * r, LOW + (HIGH - LOW) * k * k, Math.cos(a) * r);
  }

  /** The ghosts posed for the frame: drifting, rushing into the bell or bursting out, scattered, shown or faded. */
  function update(t: number, dt: number, cue: GhostCue): void {
    // (the whole light: brighter as they rush in and flare out, once a toll; faded as they scatter)
    const flare = 1 + cue.rush * 0.8 + cue.burst * (1 - cue.burst) * 2.4;
    const fade = 1 - cue.scatter;
    headMat.opacity = HEAD_SEE * flare * fade;
    veilMat.opacity = VEIL_SEE * flare * fade;
    eyeMat.opacity = 0.95 * fade;
    moteMats.forEach((mat, j) => { mat.opacity = moteSee(j) * flare * fade; });
    ghosts.forEach((g, i) => {
      g.shown += ((i < cue.count ? 1 : 0) - g.shown) * Math.min(1, dt * 1.5);
      drifting(i, t, _at);
      // (scattered: flung out wide and high; rushing: drawn into the bell's mouth; bursting: thrown out past the ring)
      _at.multiplyScalar(1 + cue.scatter * 1.6).add(_dir.set(0, cue.scatter * 2.5, 0));
      _at.lerp(cue.bell, cue.rush * cue.rush);
      if (cue.burst > 0) _at.addScaledVector(_dir.copy(_at).sub(cue.bell).setY(0).normalize(), cue.burst * (1 - cue.burst) * 3);
      const last = g.way[0];
      g.way.unshift((g.way.length >= KEPT ? g.way.pop()! : new THREE.Vector3()).copy(_at));
      // (facing the way it goes; its tail the motes along the way it came)
      // (upright, turned to the way it goes and leaning into it, nosing down as it swoops down)
      if (last && last.distanceToSquared(_at) > 1e-8) {
        _dir.copy(_at).sub(last);
        g.body.rotation.set(LEAN - Math.atan2(_dir.y, Math.hypot(_dir.x, _dir.z)) * 0.5, Math.atan2(_dir.x, _dir.z), 0, 'YXZ');
      }
      g.body.position.copy(_at);
      const size = g.shown * (1 - cue.rush * 0.55);
      g.body.scale.setScalar(Math.max(1e-3, size));
      g.body.visible = size > 0.02;
      g.motes.forEach((mote, j) => {
        const at = g.way[Math.min(g.way.length - 1, (j + 1) * MOTE_EVERY)];
        mote.position.copy(at);
        mote.visible = g.body.visible;
        mote.scale.setScalar(Math.max(1e-3, size * (1 - j / (MOTES + 1)) * (0.9 + 0.2 * Math.sin(t * 3 + j))));
      });
    });
  }

  /** Their ways forgotten (a model reset: they'd draw a tail across the arena). */
  function reset(): void { for (const g of ghosts) g.way.length = 0; }

  function dispose(): void {
    sheet.dispose();
    eyeGeo.dispose();
    moteGeo.dispose();
    for (const mat of [headMat, veilMat, eyeMat, ...moteMats]) mat.dispose();
  }

  return { update, reset, dispose };
}
