// The heroes' hands: one sculpted surface (models/handShape.ts: the palm with its mounds, knuckles and pads, the webs,
// three-jointed fingers and thumb with pads at their tips, and nails) skinned to the hand's joints, under a glove over
// the palm and first knuckles (the fingertips bare), or bare (`bare`: no hands item worn). A hand holding something
// stays on its wrist and turns so the handle runs across the palm, the weapon seated in it (`seat`), whatever angle
// it is held at, and wraps its fingers round the handle's actual radius (`hold`).
import * as THREE from 'three';
import { joint } from './rig';
import { dualQuaternionSkinned } from './dualQuaternion';
import { triplanar } from './triplanar';
import { handNodes } from './handNodes';
import { sameLooks, type KitLooks } from '../../core/materials';
import type { OwnLooks } from '../../core/shaderPorts';
import { setHandsCoarse, slimOf, sculptHand, unpackHand, type HandGeometries, type PackedHand } from './handShape';
import { clamp } from '../../util';
import { HAND_BUILDS, PLAIN, type HandBuild } from './build';
import { tunable } from '../../core/tuning';
import { pbrMaterialMaps, skin as skinMaps } from '../../core/textures';
import type { JointPoint } from './armor';

export interface Digit { j: THREE.Group[]; len: number[]; /** its radius (half its depth, which a grip wraps) */ r: number }
export interface Hand {
  /** the posed hand, a child of the rig's hand joint (turned into a grip by `hold`) */
  vis: THREE.Group;
  f: Digit[]; thumb: Digit;
  /** +1 the left hand, -1 the right */
  s: number;
  /** its build (`build.ts`): its digits' widths, its palm's breadth and depth */
  build: HandBuild;
  /** what it was built of (`buildHand`'s), for a copy of it (`handLike`) */
  made: { glove: THREE.Material; skin: THREE.Material; bareSkin?: THREE.Material; k: number };
  /** its meshes, each with a copy of its material of its own (skinned): the skin the glove leaves bare (all of it for
   *  `bare` when the hand was built without a bare skin), the skin bare (shown for `bare`, when the hand was built
   *  with a bare skin), the glove, the nails */
  skin: THREE.SkinnedMesh;
  bareSkin: THREE.SkinnedMesh | null;
  glove: THREE.SkinnedMesh;
  nails: THREE.SkinnedMesh;
  /** a fighter's hand's bare skin and nails sculpted shut in its fist (`HandBuild.fist`), shown in place of the open
   *  ones while its fist is (`on`: `closeFist` shuts it, any other pose opens it) */
  shut?: { skin: THREE.SkinnedMesh; nails: THREE.SkinnedMesh; on: boolean };
}

/** A digit's place and size: its root joint's place in the hand (u across towards the thumb, y down the hand, z out of
 *  its back), its segments' lengths, and its half-width at its root. */
interface DigitSpec {
  u: number;
  y: number;
  z: number;
  len: [number, number, number];
  width: number;
}

/** the fingers, index (next to the thumb) to little: their knuckles a little apart across the hand (as close as their
 *  roots' widths, the hand was a third narrower than a man's for its length), the middle's furthest down; the index
 *  as stout as the middle finger, as a man's is (from play: "index finger should be thicker"), the ring finger and
 *  the little one each thinner, by a man's joint breadths (about 21.6, 21.9, 20.3 and 17.9 mm at the middle joint) */
// (the knuckles in an arch, the little finger's 14 mm nearer the wrist than the middle's: within 10 mm of a line,
// the hand ended in a straight edge, #425)
const FINGERS: DigitSpec[] = [
  { u: 0.0345, y: -0.1, z: 0.001, len: [0.043, 0.026, 0.021], width: 0.0118 },
  { u: 0.0115, y: -0.103, z: 0.001, len: [0.047, 0.029, 0.022], width: 0.0119 },
  { u: -0.0115, y: -0.099, z: 0.001, len: [0.044, 0.027, 0.021], width: 0.0108 },
  { u: -0.033, y: -0.089, z: 0.001, len: [0.035, 0.021, 0.019], width: 0.0092 },
];
/** the thumb: rooted low on the inner side of the palm, its first segment its bone in the palm's mound; its bones a
 *  man's by X-ray (about 44, 30 and 20 mm, the last under 5 mm of fingertip), to the scale of the fingers here (at
 *  38, 30 and 25 mm, from play: "thumb too short") */
const THUMB: DigitSpec = { u: 0.028, y: -0.022, z: -0.007, len: [0.046, 0.033, 0.027], width: 0.0136 };
/** a digit's depth over its width at its root (a grip wraps its half-depth) */
const DEPTH = 0.86;
/** how far apart the fingers are fanned in the pose the hand is sculpted in (`poseHand`'s spread): apart, so the
 *  field joins them only in the webs at their roots */
const SCULPT_SPREAD = 0.6;
/** the hand's skin, glove and nails, sculpted once for each side and build (a hero built again shares them), by
 *  `handKey` */
const SCULPTED = new Map<string, HandGeometries>();
/** what a side's (`s`) hand of `build` is kept under, and the name its worker is given (`hands.worker.ts` reads it) */
const handKey = (s: number, build: HandBuild, closed = false) => `${s} ${build.name}${closed ? SHUT_NAMED : ''}`;
/** what a sculpt's key (and its worker's name) has in it where its hand is sculpted shut */
const SHUT_NAMED = ' shut';
/** the nails: the fingertip's own skin (its colour times `NAIL_SKIN`, the warmth the sculpt shades a fingertip
 *  with), a little towards the pink of the bed under a nail (`NAIL_PINK` of the way to `NAIL_TINT`), and a little
 *  smoother, and as dark as the skin's map draws it (a nail has none). Nearly half way to a light pink and glossy,
 *  they read as
 *  painted: from play, "he should not have painted nails" (#425) */
const NAIL_TINT = new THREE.Color(0xd8a39c);
const NAIL_SKIN = new THREE.Color(0.72, 0.6, 0.57);
const NAIL_PINK = 0.14;
const NAIL_ROUGH = 0.5;

/** A digit's joints on the hand (`s` its side), as `spec` places and sizes them, its width by `build`'s. */
function digitOn(vis: THREE.Object3D, s: number, spec: DigitSpec, build: HandBuild): Digit {
  const j: THREE.Group[] = [];
  // (across the hand by its breadth: narrower than its digits are wide, they'd press into each other)
  let at = joint(vis, -s * spec.u * build.wide, spec.y, spec.z);
  j.push(at);
  // (the thumb as long as the palm is broad: a plain thumb on the heavy hand's broad, deep fist couldn't reach round
  // onto the fingers' backs, and its end stopped 20 mm short of the middle finger)
  const len = spec.len.map((l) => (spec === THUMB ? l * build.wide : l));
  len.forEach((l, n) => {
    if (n < 2) {
      at = joint(at, 0, -l, 0);
      j.push(at);
    }
  });
  return { j, len, r: spec.width * build.digits * slimOf(spec === THUMB) * DEPTH };
}

/** A copy of `material` of its own, for a skinned mesh (one shared with rigid meshes makes three rebuild its
 *  program's parameters at every switch between them; models/shapes.ts `Sculpt.build`), its maps read triplanar
 *  (the sculpt has no texture places) and skinned by dual quaternions (models/dualQuaternion.ts: the thumb's half
 *  turn round a handle folded the web). */
function ownCopy(material: THREE.Material): THREE.Material {
  const copy = material.clone();
  copy.onBeforeCompile = material.onBeforeCompile;
  copy.customProgramCacheKey = material.customProgramCacheKey;
  sameLooks(copy, material);
  (copy as unknown as OwnLooks).webgpuLooks = handNodes(GRAIN_TILE);
  return dualQuaternionSkinned(triplanar(copy, GRAIN_TILE));
}

/** Light `h`'s outline with `rim`, a colour the model may change each frame: the kit's light at glancing angles
 *  (`uRim`) on the hand's own copies of its materials, the same program as every hand's, a uniform of their own (the
 *  mage's arcana in his free hand: motes drifting off it read as a stray particle effect, not a hand that glows). Call
 *  before the hand is first drawn. `body`, if given, is the glow over the whole of it, its emissive (seen face on, the
 *  outline alone lit almost nothing: a plain hand). */
export function glowOutline(h: Hand, rim: THREE.Color, body?: THREE.Color): void {
  // (not the nails: thin and turned every way, each glowed nearly whole, five hot dots like lamps at the fingertips)
  for (const mesh of [h.skin, h.bareSkin, h.glove]) {
    if (!mesh) continue;
    const material = mesh.material as THREE.MeshStandardMaterial;
    if (body) material.emissive = body;
    // (on WebGPU the kit's rim is read off its looks, these copies' own: core/shaderPorts.ts `kitNodes`)
    const { kitLooks } = material as THREE.MeshStandardMaterial & { kitLooks?: KitLooks };
    if (kitLooks) (material as unknown as { kitLooks: KitLooks }).kitLooks = { ...kitLooks, rim: { value: rim } };
    const before = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      before.call(material, shader, renderer);
      shader.uniforms.uRim = { value: rim };
    };
  }
}

/** how deep the bare skin's wrinkles read (its normal map's scale: at 0.6, beside the smooth forearm it's on, from
 *  play "hand has too many wrinkles compared to his forearm", #425) */
const SKIN_RELIEF = 0.25;

/** `material` (a hand's own copy of its skin) in the bare skin's wrinkles and pores (core/pbr.ts `skin`, made once,
 *  shared by every hand), read across it as the glove's grain is: smooth and even, the fingers read as plastic (#425) */
function wrinkled(material: THREE.MeshStandardMaterial): void {
  const maps = pbrMaterialMaps(skinMaps(), 1, SKIN_RELIEF);
  material.map = maps.map;
  material.normalMap = maps.normalMap;
  material.roughnessMap = maps.roughnessMap;
  material.normalScale.copy(maps.normalScale);
}

/** a map's tile across the hand (m): the glove's leather grain at about the size it had on the old palm */
const GRAIN_TILE = 0.12;

/** the hands' shadows, skinned as they are (a depth material of their own, as models/shapes.ts gives its skinned
 *  meshes one) */
const HAND_DEPTH = dualQuaternionSkinned(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }));

/** `geometry` in a copy of `material`, on `vis`, skinned to `skeleton`. */
function skinnedOn(vis: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material,
  skeleton: THREE.Skeleton, shadow: boolean): THREE.SkinnedMesh {
  const mesh = new THREE.SkinnedMesh(geometry, ownCopy(material));
  // (its sphere the sculpt's: three would pose every vertex for it at its first draw)
  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  mesh.boundingSphere = geometry.boundingSphere!.clone();
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  // (its bounds are the pose it was sculpted in)
  mesh.frustumCulled = false;
  mesh.customDepthMaterial = HAND_DEPTH;
  // (its bones blended and its maps read as it alone is: models/drawAsOne.ts would merge it skinned as the rest)
  mesh.userData.drawsAlone = true;
  vis.add(mesh);
  mesh.bind(skeleton);
  return mesh;
}

/** The hand's joints turned as it's sculpted and bound: open, its fingers a little spread, or `closed` in its fist. */
function poseToSculpt(h: Hand, closed: boolean): void {
  if (!closed) {
    poseHand(h, 0, SCULPT_SPREAD);
    return;
  }
  const turns = closedFistPose(h);
  [...h.f, h.thumb].forEach((digit, i) => digit.j.forEach((j, n) => j.quaternion.copy(turns[i][n])));
}

/** The hand's shape sculpted afresh on its joints, posed as it's sculpted (the lab's `hands` times it). */
export function sculptAfresh(h: Hand, closed = false): HandGeometries {
  poseToSculpt(h, closed);
  const { digits } = h.build;
  const fingers = h.f.map((d, i) => ({ j: d.j, len: d.len, width: FINGERS[i].width * digits }));
  const thumb = { j: h.thumb.j, len: h.thumb.len, width: THUMB.width * digits };
  return sculptHand(h.vis, fingers, thumb, -h.s, h.build, closed);
}

/** A side's hand (`s`) of `build` sculpted on joints of its own, as `buildHand` places them: what a worker sculpts. */
export function sculptSide(s: number, build: HandBuild = PLAIN, closed = false): HandGeometries {
  const vis = new THREE.Group();
  const f = FINGERS.map((spec) => digitOn(vis, s, spec, build));
  const thumb = digitOn(vis, s, THUMB, build);
  return sculptAfresh({ vis, f, thumb, s, build } as Hand, closed);
}

/** The side and build a worker named by `handKey` sculpts. */
export function sideNamed(name: string): { s: number; build: HandBuild; closed: boolean } {
  const [side, build] = name.split(' ');
  return { s: parseInt(side, 10), build: HAND_BUILDS[build] ?? PLAIN, closed: name.includes(SHUT_NAMED) };
}

/** Where each side's hand of each build was sculpted (by `handKey`): by a worker as the game loaded, or on the page
 *  (its worker failed, or the hand was built before it was done). The lab's `hands` reads it. */
export const SCULPTED_BY = new Map<string, 'worker' | 'page'>();

/** `made` kept as the shape of `key`'s hands, shared by every hand of that side and build (a model's dispose keeps
 *  it). */
function keep(key: string, made: HandGeometries, by: 'worker' | 'page'): HandGeometries {
  for (const geometry of Object.values(made)) geometry.userData.shared = true;
  SCULPTED.set(key, made);
  SCULPTED_BY.set(key, by);
  return made;
}

/** The hand's shape, sculpted once for its side and build (by a worker while the game loads, `preloadHands`; here, if
 *  it wasn't) and shared by every hand of it after. */
function sculpted(h: Hand, closed = false): HandGeometries {
  const key = handKey(h.s, h.build, closed);
  return SCULPTED.get(key) ?? keep(key, sculptAfresh(h, closed), 'page');
}

/** what a worker's name ends in where its hand is sculpted coarse (`hands.worker.ts` reads it) */
export const COARSE_NAMED = ' coarse';

/** Both hands sculpted in workers of their own while the game loads (a side took a quarter of a second on the main
 *  thread); a worker that fails leaves its side to the first hand built. Its side is its name, read as it starts: a
 *  message waits for the page's main thread to pass it on (core/textures.ts `preloadTextures`). */
export async function preloadHands(coarse = false): Promise<void> {
  // (the page's own sculpts too: a side whose worker fails, or built before it's done; a coarse one is simplified once
  // its simplifier has loaded, which this waits for too)
  const simplifier = setHandsCoarse(coarse).catch(() => undefined);
  if (typeof Worker === 'undefined') return simplifier;
  const side = (s: number, build: HandBuild, closed = false) => new Promise<void>((resolve) => {
    const key = handKey(s, build, closed);
    let worker: Worker;
    try {
      const name = `${key}${coarse ? COARSE_NAMED : ''}`;
      worker = new Worker(new URL('./hands.worker.ts', import.meta.url), { type: 'module', name });
    } catch {
      resolve();
      return;
    }
    worker.onmessage = (e: MessageEvent<PackedHand>) => {
      if (!SCULPTED.has(key)) keep(key, unpackHand(e.data), 'worker');
      worker.terminate();
      resolve();
    };
    worker.onerror = () => {
      worker.terminate();
      resolve();
    };
  });
  // (every build's: each hero is built at boot, `game/warmup.ts`)
  const builds = Object.values(HAND_BUILDS);
  const sides = builds.flatMap((build) => [1, -1].flatMap((s) => [
    side(s, build),
    ...(build.fist ? [side(s, build, true)] : []),
  ]));
  await Promise.all([...sides, simplifier]);
}

/**
 * Build a hand on the rig's hand joint (forearm along -Y; the palm faces -Z, so a finger curls with +X
 * rotation; `s` +1 left, -1 right, the thumb on the inner side). `glove` covers the palm and first
 * knuckles, `skin` the rest; `k` scales it. With `bareSkin`, the hand can be bare (`bare`). `build` sizes its digits
 * and palm (`build.ts`).
 */
export function buildHand(hand: THREE.Object3D, s: number, glove: THREE.Material, skin: THREE.Material, k = 1,
  bareSkin?: THREE.Material, build: HandBuild = PLAIN): Hand {
  const vis = joint(hand);
  vis.scale.setScalar(k);
  // (the hand as it's drawn, which the body's measures read: `hold` turns it on the joint, which is only the wrist.
  // Found by its meshes' mark, the wrist was read off the joint once they were sculpted: anatomy.ts `drawnHand`)
  vis.userData.drawnHand = true;
  const f = FINGERS.map((spec) => digitOn(vis, s, spec, build));
  const thumb = digitOn(vis, s, THUMB, build);
  const h = { vis, f, thumb, s, build, made: { glove, skin, bareSkin, k } } as Hand;
  // bound to its joints as it was sculpted
  poseToSculpt(h, false);
  const shape = sculpted(h);
  let top: THREE.Object3D = vis;
  while (top.parent) top = top.parent;
  top.updateMatrixWorld(true);
  const bones = [vis, ...f.flatMap((d) => d.j), ...thumb.j] as unknown as THREE.Bone[];
  const skeleton = new THREE.Skeleton(bones);
  h.skin = skinnedOn(vis, shape.tips, skin, skeleton, true);
  h.bareSkin = bareSkin ? skinnedOn(vis, shape.skin, bareSkin, skeleton, true) : null;
  h.glove = skinnedOn(vis, shape.glove, glove, skeleton, true);
  // (the skin shaded by the colours its sculpt gave it, `shadeSkin`: each mesh's own copy of the material, which other
  // skin without them shares)
  for (const m of [h.skin, h.bareSkin]) if (m) (m.material as THREE.MeshStandardMaterial).vertexColors = true;
  for (const m of [h.skin, h.bareSkin]) if (m) wrinkled(m.material as THREE.MeshStandardMaterial);
  h.nails = skinnedOn(vis, shape.nails, skin, skeleton, false);
  const nail = h.nails.material as THREE.MeshStandardMaterial;
  nail.color.multiply(NAIL_SKIN).lerp(NAIL_TINT, NAIL_PINK);
  nail.roughness = NAIL_ROUGH;
  if (build.fist && bareSkin) shutOf(h, bones, bareSkin, skin);
  bare(h, false);
  // (unposed, as its joints were before it was sculpted)
  for (const d of [...f, thumb]) for (const j of d.j) j.rotation.set(0, 0, 0);
  return h;
}

/** `h`'s bare skin and nails sculpted shut, bound to its joints closed in its fist (a skeleton of their own: the
 *  open meshes' is bound open), hidden until it's shut. */
function shutOf(h: Hand, bones: THREE.Bone[], bareSkin: THREE.Material, skin: THREE.Material): void {
  poseToSculpt(h, true);
  const shape = sculpted(h, true);
  h.vis.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  const fist = skinnedOn(h.vis, shape.skin, bareSkin, skeleton, true);
  const material = fist.material as THREE.MeshStandardMaterial;
  material.vertexColors = true;
  wrinkled(material);
  const nails = skinnedOn(h.vis, shape.nails, skin, skeleton, false);
  const nail = nails.material as THREE.MeshStandardMaterial;
  nail.color.multiply(NAIL_SKIN).lerp(NAIL_TINT, NAIL_PINK);
  nail.roughness = NAIL_ROUGH;
  fist.visible = false;
  nails.visible = false;
  h.shut = { skin: fist, nails, on: false };
}

/** The hand's skin as it's drawn bare (or what the glove leaves bare): a fighter's sculpted shut while his fist is. */
export function drawnSkin(h: Hand): THREE.SkinnedMesh {
  return h.shut?.on ? h.shut.skin : h.bareSkin ?? h.skin;
}

/** A fighter's bare hand shown shut in its fist (`on`), or open: its sculpt shut in place of its open one. A gloved
 *  hand, or one with no sculpt shut, keeps its own. */
export function shut(h: Hand, on: boolean): void {
  const closed = h.shut;
  if (!closed || !h.bareSkin) return;
  const want = on && !h.glove.visible;
  if (closed.on === want) return;
  closed.on = want;
  closed.skin.visible = want;
  closed.nails.visible = want;
  h.bareSkin.visible = !want && !h.glove.visible;
  h.nails.visible = !want;
}

/** A hand built as `h` was (its side, its materials and its scale) on `joint`, bare as `h` is: the lab's `hands`
 *  pictures one alone. */
export function handLike(h: Hand, on: THREE.Object3D): Hand {
  const { glove, skin, bareSkin, k } = h.made;
  const copy = buildHand(on, h.s, glove, skin, k, bareSkin, h.build);
  bare(copy, !h.glove.visible);
  return copy;
}

/** the hand bare (no hands item worn: no glove, in its bare skin when it was built with one, else its skin whole), or
 *  in its glove */
export function bare(h: Hand, on: boolean): void {
  shut(h, false);
  h.glove.visible = !on;
  if (!h.bareSkin) {
    const shape = SCULPTED.get(handKey(h.s, h.build))!;
    h.skin.geometry = on ? shape.skin : shape.tips;
    return;
  }
  h.bareSkin.visible = on;
  h.skin.visible = !on;
}

/** The hand as capsules from its own joints, each `[from, to, radius]` (what a skirt keeps clear of, `SkirtLimbs`): its palm's
 *  two edges, its index, middle and little fingers and its thumb (one capsule down the wrist missed the palm and the curled
 *  fingers; without the middle finger, the longest, a relaxed hand's fingertips went into the robe beside it) */
export function handCapsules(h: Hand): [JointPoint, JointPoint, number][] {
  const end = (o: THREE.Object3D, x = 0, y = 0): JointPoint => [o, new THREE.Vector3(x, y, 0)], tip = (d: Digit): JointPoint => end(d.j[d.j.length - 1], 0, -d.len[d.len.length - 1]);
  const [ix, md, , lt] = h.f, edge = (d: Digit): [JointPoint, JointPoint, number] => [end(h.vis, d.j[0].position.x * 0.9, -0.025), end(d.j[0]), 0.02];
  return [edge(ix), edge(lt), ...[ix, md, lt, h.thumb].flatMap((d) => [[end(d.j[0]), end(d.j[1]), d.r], [end(d.j[1]), tip(d), d.r]] as [JointPoint, JointPoint, number][])];
}

/**
 * Pose an open or gesturing hand: `curl` bends every finger into the palm (0 flat, ~1.4 a fist),
 * `spread` fans them, `point` straightens the index and middle fingers (the other two stay curled),
 * `twitch` a tremor. Also lets go of anything held.
 */
/** how far the open hand's thumb is turned about its own length from the fingers' way (rad): a thumb lies about a
 *  quarter turn round from the fingers, its pad towards the palm and the index finger, its nail up and out from
 *  the hand. Unturned, its nail faced the fingers and it bent away from the palm (from play, of the nail: "should
 *  be positioned differently", #425) */
const THUMB_ROLL = -1.3;
export function poseHand(h: Hand, curl: number, spread: number, point = 0, t = 0, twitch = 0): void {
  shut(h, false);
  h.vis.position.set(0, 0, 0); h.vis.quaternion.identity();
  const s = h.s;
  h.f.forEach((f, i) => {
    const c = (i < 2 ? curl * (1 - point) : curl + point * 1.1) * (0.9 + i * 0.07) + Math.sin(t * 23 + i * 1.7) * twitch;
    f.j[0].rotation.set(c * 0.8, 0, s * (i - 1.5) * spread * 0.3);
    f.j[1].rotation.set(c * 1.1, 0, 0);
    f.j[2].rotation.set(c * 0.75, 0, 0);
  });
  thumbAcross(h, curl * 0.6 + point * 0.5, spread);
}

/** The thumb swung across the palm by `tc` as the hand closes, and in from the side (held out at the open hand's 43
 *  degrees, a fist's thumb stood off the fingers, a loop in the air). */
function thumbAcross(h: Hand, tc: number, spread: number): void {
  const s = h.s;
  h.thumb.j[0].rotation.set(0.25 + tc * 0.45, s * (0.3 + tc * 0.5), -s * (0.75 - spread * 0.45 - tc * 0.4));
  h.thumb.j[0].rotateY(s * THUMB_ROLL);
  h.thumb.j[1].rotation.set(tc * 0.5, 0, 0);
  h.thumb.j[2].rotation.set(tc * 0.6, 0, 0);
}

/**
 * A fist clenched after `hold` has turned the hand onto its knuckles' line: each finger folded at its knuckle, its
 * middle joint and its last (`bends`, rad: about a real fist's 90, 100 and 55 degrees), each a little more than the
 * one before it from the index, close together, the tips in the palm; the thumb left as `hold` wrapped it round its
 * handle (over the index finger round a thin one), or swung across by `thumb` as `poseHand`'s is; the hand's turn left
 * as `hold` set it. `lab hands --poses clenched` pictures the warrior's from six sides. Wrapped round a handle the fingers hooked round an
 * empty space before the palm, a claw (from play, "like someone with arthritis"); with the thumb left on the handle
 * it stood off the fingers (an adversarial review); `poseHand`'s fist bends the knuckles 0.8 of its curl alone, the
 * fingers hooked from the side.
 */
export function clench(h: Hand, bends: readonly number[], thumb: number): void {
  shut(h, false);
  h.f.forEach((f, i) => {
    const more = 1 + 0.04 * i;
    for (let n = 0; n < 3; n++) f.j[n].rotation.set(bends[n] * more, 0, 0);
  });
  if (thumb > 0) thumbAcross(h, thumb, 0);
}

// Keep the index and middle striking face square to the forearm. The old 117 degree fold left a ring under it.
const STRIKE_BEND = THREE.MathUtils.degToRad(96);
// Tip centres at the middle crease (y, z in metres), with room for the pads. The little finger has less reach.
const FIST_CREASE = [[-0.086, -0.011], [-0.088, -0.011], [-0.086, -0.011], [-0.08, -0.011]];
// Fan the shafts inward. The index seats inside the thenar mound and the little finger closes the outer slit.
const FIST_FAN = [5, 2, -2, -8.7];
// The thumb laid over the closed fingers as a boxer's lies: its bone in the palm aimed at the fist's corner beside
// the index (`corner` of the way down the index's first phalanx, off its side), so its knuckle and the mound under it
// fill the side of the fist; its middle bone from there onto the front of the index's middle phalanx, at whatever
// point of it the bone reaches; its last bone on across to the middle finger's at the same share; each off the
// finger's bone by their radii summed (`press`, a little under: skin pressed on skin). Aimed at one point on the middle
// finger with its bone in the palm held down the mound, it took up its spare length in an arch, a loop standing off the
// fingers with a hole under it (from play: "he still has sperm in his fist"); with its last joint placed first and its
// knuckle wherever its bones met, the joint stood near the end of its reach, the thumb a straight stick standing off
// the fist from the wrist with the web open under it (from play: "this is not a natural fist shape").
const THUMB_ON = { corner: 1, front: 0.5, round: Math.PI / 4, press: 0.9 };
/** the shares along the index's middle phalanx and the turns round its front its middle bone's end is tried at */
const THUMB_TRIES = { shares: 20, turns: 9 };
// A fingertip's pad's half-depth over its finger's half-width at its root: a thicker finger's tip sits further off
// the palm by the difference (`HandBuild.digits`).
const PAD_DEPTH = 0.58;
// The rest joints and lengths are the same for every hand of a side and build. Solve once, outside the animation
// loop.
const CLOSED_FISTS = new Map<string, THREE.Quaternion[][]>();

/** Solve two bent links from their lengths and the distance to their endpoint. */
function linkBend(a: number, b: number, distance: number): number {
  return Math.acos(clamp((distance ** 2 - a ** 2 - b ** 2) / (2 * a * b), -1, 1));
}

/** The warrior's bare fist, solved from the rest joints with the fingertips seated at the palm's crease. */
function closedFistPose(h: Hand): THREE.Quaternion[][] {
  const rotations = h.f.map((digit, i) => {
    const root = digit.j[0].position;
    const [a, b, c] = digit.len;
    const yaw = THREE.MathUtils.degToRad(-h.s * FIST_FAN[i]);
    // (the crease on a deeper palm deeper, and the tip off it by its pad: the plain hand's numbers for its build)
    const [y, plainZ] = FIST_CREASE[i];
    const { deep, digits } = h.build;
    const z = plainZ * deep - PAD_DEPTH * FINGERS[i].width * (digits - 1);
    // In the finger's plane, start at the end of the proximal phalanx and solve backwards from the tip.
    const dy = y - root.y + a * Math.cos(STRIKE_BEND);
    const dz = (z - root.z) / Math.cos(yaw) + a * Math.sin(STRIKE_BEND);
    const last = Math.min(THREE.MathUtils.degToRad(80), linkBend(b, c, Math.hypot(dy, dz)));
    const angle = Math.atan2(-dz, -dy) + 2 * Math.PI - Math.atan2(c * Math.sin(last), b + c * Math.cos(last));
    const pip = clamp(angle - STRIKE_BEND, 0, THREE.MathUtils.degToRad(110));
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(STRIKE_BEND, yaw, 0, 'YXZ'));
    const bend = (r: number) => new THREE.Quaternion().setFromEuler(new THREE.Euler(r, 0, 0));
    return [q, bend(pip), bend(last)];
  });

  rotations.push(thumbOver(h, rotations));
  return rotations;
}

/** A digit's joints in the hand's frame, its tip last, and each segment's turn there. */
type Chain = { points: THREE.Vector3[]; frames: THREE.Quaternion[] };

/** A digit's joints placed by its joints' turns (in the hand's frame, from `root`), with its tip, and each segment's
 *  turn in the hand's frame. */
function chainOf(root: THREE.Vector3, lengths: number[], turns: THREE.Quaternion[]): Chain {
  const points = [root.clone()];
  const frames: THREE.Quaternion[] = [];
  let frame = new THREE.Quaternion();
  turns.forEach((turn, n) => {
    frame = frame.clone().multiply(turn);
    frames.push(frame);
    points.push(new THREE.Vector3(0, -lengths[n], 0).applyQuaternion(frame).add(points[n]));
  });
  return { points, frames };
}

/** The turn (in the hand's frame) of a segment running along `along`, its back (its nail's side, +z) as near `back`
 *  as it can be. */
function segmentTurn(along: THREE.Vector3, back: THREE.Vector3): THREE.Quaternion {
  const y = along.clone().normalize().negate();
  const z = back.clone().addScaledVector(y, -back.dot(y)).normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

/**
 * The thumb laid over the closed fingers (`fingers`, their joints' turns) as `THUMB_ON` says. Its joints' turns, each
 * in its parent's frame.
 */
function thumbOver(h: Hand, fingers: THREE.Quaternion[][]): THREE.Quaternion[] {
  const [a, b, c] = h.thumb.len;
  const lift = (i: number) => (h.f[i].r + h.thumb.r) * THUMB_ON.press;
  const index = chainOf(h.f[0].j[0].position, h.f[0].len, fingers[0]);
  const middle = chainOf(h.f[1].j[0].position, h.f[1].len, fingers[1]);
  // the middle phalanges' points and their fronts (their nails' side, +z: out of the fist), and the index's outer
  // side, away from the middle finger
  const along = (chain: Chain, share: number) => chain.points[1].clone().lerp(chain.points[2], share);
  const frontOf = (chain: Chain) => new THREE.Vector3(0, 0, 1).applyQuaternion(chain.frames[1]);
  const indexFront = frontOf(index);
  const middleFront = frontOf(middle);
  const outer = index.points[1].clone().sub(middle.points[1]);
  outer.addScaledVector(indexFront, -outer.dot(indexFront)).normalize();
  const root = h.thumb.j[0].position;
  // its knuckle: its bone in the palm aimed at the corner
  const corner = along(index, THUMB_ON.corner).addScaledVector(outer, lift(0)).addScaledVector(indexFront, THUMB_ON.front * lift(0));
  const knuckle = corner.sub(root).setLength(a).add(root);
  // its last joint on the index's front where its middle bone reaches it, as near the front's middle as it can
  let joint = along(index, 1).addScaledVector(indexFront, lift(0));
  let share = 1;
  let best = Infinity;
  for (let s = 0; s <= THUMB_TRIES.shares; s++) {
    for (let r = 0; r < THUMB_TRIES.turns; r++) {
      const turn = (Math.PI / 2) * (r / (THUMB_TRIES.turns - 1));
      const round = indexFront.clone().multiplyScalar(Math.cos(turn)).addScaledVector(outer, Math.sin(turn));
      const at = along(index, s / THUMB_TRIES.shares).addScaledVector(round, lift(0));
      const miss = Math.abs(at.distanceTo(knuckle) - b) + Math.abs(turn - THUMB_ON.round) * 0.004;
      if (miss < best) {
        best = miss;
        joint = at;
        share = s / THUMB_TRIES.shares;
      }
    }
  }
  joint.sub(knuckle).setLength(b).add(knuckle);
  // its last bone across to the middle finger's front at the same share
  const pad = along(middle, share).addScaledVector(middleFront, lift(1));
  const tip = pad.sub(joint).setLength(c).add(joint);
  const back = indexFront.clone().add(middleFront).normalize();
  const turns = [
    segmentTurn(knuckle.clone().sub(root), back),
    segmentTurn(joint.clone().sub(knuckle), back),
    segmentTurn(tip.clone().sub(joint), back),
  ];
  return [turns[0], turns[0].clone().invert().multiply(turns[1]), turns[1].clone().invert().multiply(turns[2])];
}

/** The ways a bare hand is held that a wrap round it is laid over (`fighterWrap`'s `poses`), each putting it so with
 *  its own turn on the wrist kept: at rest, and closed in a fist (`closeFist`'s fingers). The last leaves it at rest. */
export function wrapPoses(h: Hand): (() => void)[] {
  const rest = () => {
    for (const d of [...h.f, h.thumb]) for (const j of d.j) j.rotation.set(0, 0, 0);
  };
  const clenched = () => {
    const turn = h.vis.quaternion.clone(), at = h.vis.position.clone();
    closeFist(h, new THREE.Vector3(1, 0, 0));
    h.vis.quaternion.copy(turn);
    h.vis.position.copy(at);
  };
  return [clenched, rest];
}

/** Close from rest and aim the knuckle row along `line` (world), keeping the hand along the forearm. */
export function closeFist(h: Hand, line: THREE.Vector3): void {
  shut(h, true);
  const key = handKey(h.s, h.build);
  let pose = CLOSED_FISTS.get(key);
  if (!pose) {
    pose = closedFistPose(h);
    CLOSED_FISTS.set(key, pose);
  }
  const wrist = h.vis.parent!;
  wrist.updateWorldMatrix(true, false);
  _q2.setFromRotationMatrix(_m.extractRotation(wrist.matrixWorld));
  _u.set(0, 1, 0).applyQuaternion(_q2);
  _d.copy(line).addScaledVector(_u, -line.dot(_u)).normalize();
  if (_d.lengthSq() < 1e-6) _d.set(-h.s, 0, 0).applyQuaternion(_q2);
  fist(h, _d, _u, _q);
  h.vis.position.set(0, 0, 0);
  if (wrist.parent) {
    // Keep the pose's roll but take out its bend. Projecting the line onto the elbow's plane moved the pronation.
    _q.premultiply(wrist.parent.getWorldQuaternion(_q2).invert());
    _q.set(0, _q.y, 0, _q.w).normalize();
    h.vis.quaternion.copy(wrist.quaternion).invert().multiply(_q);
  } else {
    h.vis.quaternion.copy(_q2.invert()).multiply(_q);
  }
  for (let i = 0; i < pose.length; i++) {
    const digit = i < h.f.length ? h.f[i] : h.thumb;
    for (let n = 0; n < digit.j.length; n++) digit.j[n].quaternion.copy(pose[i][n]);
  }
}

/** each finger's bends in a strained, spread hand (rad: the knuckle, the middle joint, the last), the index's first:
 *  a claw, as reference photographs of a hand straining against a force hold it (#425), the knuckle nearly straight
 *  and the middle joint bent hard, graded from the index, nearly straight, to the little finger, most; bent gently
 *  at every joint, the fingers read as hoses, and curled alike, through the eyes every tip pointed at the camera and
 *  the fingers read as stubs (an adversarial review); so every finger is held back at its knuckle, the index most,
 *  as a hand pushed open against a force is, and they fan out long across the view) */
const STRAIN = [[-0.3, 0.45, 0.3], [-0.24, 0.9, 0.55], [-0.14, 1.18, 0.72], [-0.04, 1.38, 0.86]];
/** how far each finger leans out from the middle of the hand as it spreads (the index furthest, the ring and the
 *  little finger close together: an adversarial review read an even fan as fake) */
const STRAIN_FAN = [-1.5, -0.4, 0.6, 1.6];
/** the thumb's turn at its root in a strained hand (rad about x, y and z, z less the spread's share), and its bends at
 *  its two outer joints, back the other way (below 0: a tense thumb's tip curls back, away from the palm), further
 *  back as the hand hooks, within what a thumb's joints allow: its last joint bends back 10 to 25 degrees, its middle
 *  one hardly at all (52 degrees, taken from a generated "photograph", was a bend no thumb makes: from play, "this is
 *  NOT a real hand"; lab `--tune strainThumb.root=...`) */
const STRAIN_THUMB = tunable('strainThumb', { root: [0.2, -0.9, 1.2], spreadShare: 0.65, bends: [-0.05, -0.3],
  hooked: [0, -0.1] });

/**
 * A hand strained open against a force, as a caster's holding a spell back (#425; from play, through the eyes, an open
 * palm with its fingers straight and parallel "looks lame"): the fingers splayed (`spread`, as `poseHand`'s), each
 * bent at its own joints, the little finger most, and hooked further at the tips by `hook` (0 to 1); the thumb out and
 * a little bent. `t` and `twitch` tremble the fingers as `poseHand`'s do.
 */
export function strainHand(h: Hand, spread: number, hook: number, t = 0, twitch = 0): void {
  h.vis.position.set(0, 0, 0); h.vis.quaternion.identity();
  const s = h.s;
  h.f.forEach((f, i) => {
    const [knuckle, middle, last] = STRAIN[i];
    const shake = Math.sin(t * 23 + i * 1.7) * twitch;
    // (fanned a little wider than `poseHand` spreads them, the outer fingers furthest)
    f.j[0].rotation.set(knuckle + shake, 0, s * STRAIN_FAN[i] * spread * 0.42);
    f.j[1].rotation.set(middle * (1 + 0.15 * hook) + shake, 0, 0);
    f.j[2].rotation.set(last * (1 + 0.25 * hook), 0, 0);
  });
  // (the thumb out from the side and pointing down along the fingers, as reference photographs of a braced hand hold
  // it, and tense as the fingers are, its tip bent back: straight out sideways and curled in, it read as a peg, and
  // curled in at all, as a limp thumb on a tense hand, the owner's "it should be bent the other way")
  const [rootX, rootY, rootZ] = STRAIN_THUMB.root;
  const [middle, last] = STRAIN_THUMB.bends;
  const [middleHooked, lastHooked] = STRAIN_THUMB.hooked;
  h.thumb.j[0].rotation.set(rootX, s * rootY, -s * (rootZ - spread * STRAIN_THUMB.spreadShare));
  h.thumb.j[1].rotation.set(middle + middleHooked * hook, 0, 0);
  h.thumb.j[2].rotation.set(last + lastHooked * hook, 0, 0);
}

const _d = new THREE.Vector3(), _u = new THREE.Vector3(), _s = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _fa = new THREE.Vector3(), _fb = new THREE.Vector3(), _fc = new THREE.Vector3();
/** how far a hand may hold a handle diagonally across its palm (rad, either way: `hold`'s slant) */
export const SLANT = 0.44;
/** where a held handle's axis runs across the hand (its own space): against the lower palm and the knuckles */
const GRIP_Y = -0.092, GRIP_GAP = 0.011;
/** how far down the hand from its wrist a handle it holds runs across it (the hand joint's units) */
export const fistLength = (h: Hand) => -GRIP_Y * h.vis.scale.x;
/** how far a finger joint bends at most */
const BEND = 1.65;
/** the thumb wraps a little clear of the handle, over the fingers' ends */
const THUMB_OVER = 0.006;

/**
 * Curl a digit round a handle running across the hand (along x) through (cy, cz) in the hand's space,
 * its centre-line on a circle of radius `rho`: each segment bends just enough for its end to land on
 * the circle, so it hugs the handle however thick that is. The fingers curl one way round from the
 * knuckles (`sense` 1); the thumb (-1) comes the other way, over the top from its root, which turns freely.
 */
function wrap(f: Digit, cy: number, cz: number, rho: number, sense = 1): void {
  let py = f.j[0].position.y, pz = f.j[0].position.z, phi = 0;   // phi: the curl so far (0 hangs down -y)
  for (let n = 0; n < 3; n++) {
    const l = f.len[n], wy = py - cy, wz = pz - cz, M = Math.max(1e-6, Math.hypot(wy, wz));
    // the segment's direction (-cos φ, -sin φ) points at the handle's axis at φ0; its end lands on the
    // circle at φ0 ∓ acos(K / M), and the one short of φ0 keeps it outside the handle. A segment too
    // short to reach the circle runs along the tangent to it, so the next can go on round.
    let a0 = Math.atan2(wz, wy) - phi;
    a0 -= Math.round(a0 / (2 * Math.PI)) * 2 * Math.PI;
    const K = (M * M + l * l - rho * rho) / (2 * l);
    const off = l * l < M * M - rho * rho ? Math.asin(clamp(rho / M, -1, 1)) : Math.acos(clamp(K / M, -1, 1));
    const to = a0 - sense * off;
    // (turned round its length, the thumb's joints bend it the other way)
    if (sense < 0 && n === 0) { phi = to; f.j[0].rotation.set(phi, Math.PI, 0); }
    else { const bend = clamp(sense * to, 0, BEND); f.j[n].rotation.set(bend, 0, 0); phi += sense * bend; }
    py -= l * Math.cos(phi); pz -= l * Math.sin(phi);
  }
}

/**
 * The fist's turn for a handle along `d` (normalized): the handle runs across the palm with the thumb
 * towards +d (the blade, the staff's head), and the hand's length keeps to `up` (towards the wrist) as
 * far as that allows, the wrist bending only as the handle needs. `d` and `up` in one space, the turn in it.
 * `slant` turns the hand about its palm on the handle (rad): the handle runs diagonally across the palm, as a
 * real hand can hold it, which spares the wrist that much of its bend.
 */
function fist(h: Hand, d: THREE.Vector3, up: THREE.Vector3, out: THREE.Quaternion, slant = 0): THREE.Quaternion {
  // across the palm: the handle (the thumb is on -s x); up the hand (+y): `up`, square to the handle
  _x.copy(d).multiplyScalar(-h.s);
  _y.copy(up).addScaledVector(_x, -_x.dot(up));
  if (_y.lengthSq() < 1e-6) _y.set(0, 0, 1).addScaledVector(_x, -_x.z);
  _y.normalize();
  _z.crossVectors(_x, _y);
  out.setFromRotationMatrix(_m.makeBasis(_x, _y, _z));
  return slant ? out.multiply(_q3.setFromAxisAngle(Z, slant)) : out;
}
const Z = new THREE.Vector3(0, 0, 1), _q3 = new THREE.Quaternion();

/** the turn `hold` gives the hand (`vis`, on its joint) round what `grip` holds (a child of the hand's joint, its +Y along the handle) with the hand's length along the forearm: known before the arm is posed */
export function gripTurn(h: Hand, grip: THREE.Object3D, out: THREE.Quaternion, slant = 0): THREE.Quaternion {
  return fist(h, _d.set(0, 1, 0).applyQuaternion(grip.quaternion), _u.set(0, 1, 0), out, slant);
}

/** the fist's turn round a handle along `dir` with the hand's length towards `up` (both world), as `hold` turns it (world) */
export function fistTurn(h: Hand, dir: THREE.Vector3, up: THREE.Vector3, out: THREE.Quaternion, slant = 0): THREE.Quaternion {
  return fist(h, _d.copy(dir).normalize(), _u.copy(up).normalize(), out, slant);
}

/**
 * How a hand holds a handle (the lab reads it, `Model.fists`): how far the handle's axis passes from where the fist
 * closes round it (m, world: a fist closed on thin air reads as an open hand beside the handle), how far along the
 * handle that is from where it holds it (m, up the handle positive: a fist slid off its grip, or past the handle's end,
 * is as far off it as one beside it), and how far its fingers are curled (their joints' mean bend, rad: 0 straight).
 * `handle` as `seat`'s grip, its +Y along the handle, its origin where the fist holds it.
 */
/** A hand's fingers let go of what they're wrapped round by `by` (0 to 1: open), their bends eased towards straight:
 *  a fist loosened for a blade to swing round in it. */
export function loosen(h: Hand, by: number, index = by): void {
  h.f.forEach((f, i) => {
    for (const j of f.j) j.rotation.x *= 1 - (i === 0 ? index : by);
  });
}

export function fistOn(h: Hand, handle: THREE.Object3D, r: number): { off: number; along: number; curl: number; across: number } {
  h.vis.updateWorldMatrix(true, false);
  const from = h.vis.localToWorld(_fa.set(0, GRIP_Y, -(r / h.vis.scale.x + GRIP_GAP))).sub(handle.getWorldPosition(_fc));
  const axis = _fb.set(0, 1, 0).transformDirection(handle.matrixWorld);
  let bend = 0, joints = 0;
  for (const f of h.f) for (const j of f.j) { bend += j.rotation.x; joints++; }
  const along = from.dot(axis);
  // (the handle's way against the way across the palm: a fist closed on another way than its handle has it between
  // its fingers, however curled they are)
  const palm = _fc.set(1, 0, 0).transformDirection(h.vis.matrixWorld);
  const across = Math.acos(Math.min(1, Math.abs(palm.dot(axis))));
  return { off: from.addScaledVector(axis, -along).length(), along, curl: bend / joints, across };
}

/** where the handle's axis runs through that fist, from its wrist (unscaled: the hand joint's own units) */
function fistAxis(h: Hand, q: THREE.Quaternion, r: number, out: THREE.Vector3): THREE.Vector3 {
  const k = h.vis.scale.x;
  return out.set(0, GRIP_Y, -(r / k + GRIP_GAP)).multiplyScalar(k).applyQuaternion(q);
}

/**
 * Seat a held thing in the fist: `grip` (a child of the hand's joint, turned so its +Y runs along the
 * handle, its origin where the hand holds it) moves so the handle runs through the palm of the hand on
 * the wrist, its length along the forearm. Call whenever the grip's turn changes.
 */
export function seat(h: Hand, grip: THREE.Object3D, r: number, slant = 0): void {
  fistAxis(h, fist(h, _d.set(0, 1, 0).applyQuaternion(grip.quaternion), _u.set(0, 1, 0), _q, slant), r, grip.position);
}

/** Seat a held thing in the fist as `hold` last closed it (after it): `grip`, a child of the hand's joint, on the fist's axis */
export function seatHeld(h: Hand, grip: THREE.Object3D, r: number): void {
  fistAxis(h, h.vis.quaternion, r, grip.position);
}

/**
 * For a hand reaching a grip it doesn't carry (a two-hander's lower grip): from its wrist to where a
 * handle of radius `r` along `dir` runs through the fist, the hand's length along `up` (world, towards
 * the wrist; the line from the grip to the shoulder, say). Put the wrist there and `hold` with the same `up` (and `slant`).
 */
export function fistReach(h: Hand, dir: THREE.Vector3, up: THREE.Vector3, r: number, out: THREE.Vector3, slant = 0): THREE.Vector3 {
  const hand = h.vis.parent!;
  hand.updateWorldMatrix(true, false);
  return fistAxis(h, fist(h, _d.copy(dir).normalize(), _u.copy(up).normalize(), _q, slant), r, out).multiplyScalar(_s.setFromMatrixScale(hand.matrixWorld).x);
}

/**
 * Close the hand round a handle of radius `r` running along `dir` (world): the hand stays on its wrist and
 * turns so the handle lies across its palm (where `seat` or `fistReach` put it), its length along the
 * forearm (or `up`, world), and the fingers and thumb wrap round it. Call after the arm is posed and the
 * model's world matrices are up to date.
 */
export function hold(h: Hand, dir: THREE.Vector3, r: number, up?: THREE.Vector3, slant = 0): void {
  shut(h, false);
  const hand = h.vis.parent!;
  hand.updateWorldMatrix(true, false);
  _q2.setFromRotationMatrix(_m.extractRotation(hand.matrixWorld));
  if (up) _u.copy(up).normalize(); else _u.set(0, 1, 0).applyQuaternion(_q2);
  fist(h, _d.copy(dir).normalize(), _u, _q, slant);
  h.vis.position.set(0, 0, 0);
  h.vis.quaternion.copy(_q2.invert()).multiply(_q);
  // (the handle's radius in the hand's own units, which its scale `k` scales)
  const rh = r / h.vis.scale.x, cz = -(rh + GRIP_GAP);
  // the fingers close snugly round it
  // (across a slanted grip each finger meets the handle a little higher or lower)
  const tan = Math.tan(slant);
  for (const f of h.f) wrap(f, GRIP_Y - f.j[0].position.x * tan, cz, rh + f.r);
  // the thumb closes over them from the other side
  wrap(h.thumb, GRIP_Y - h.thumb.j[0].position.x * tan, cz, rh + h.thumb.r + THUMB_OVER, -1);
}
