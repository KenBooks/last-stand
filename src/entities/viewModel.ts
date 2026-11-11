// First person: the hero's own arms and weapon in view. The body animates as in every other view, so each
// attack moves the same; through the eyes everything but the arms goes on a layer the camera doesn't
// draw, and the model is placed so the camera sits just above its neck, turned and tilted with the view
// and tipped back a little so the hands and weapon sit in the frame. The placement holds until the next
// frame's pose, so skills cast in between leave from the weapon in view (`Player.castPoint`).
import * as THREE from 'three';
import type { Model } from '../types';
import { drawArms } from '../core/renderer';
import { ARMS_LAYER, HIDDEN_LAYER, WORLD_LAYER } from '../core/layers';

/** Where the camera sits against the neck, in the hero's space (x left, y up, z forward): just above
 *  it, so the shoulders stay below the view and the hands and weapon come into its lower part. */
const NECK_CAM = new THREE.Vector3(0, 0.25, 0.1);
/** tipped back about the camera, so what the hands hold low and ahead rises into the frame */
const TILT = -0.4;

const body = new WeakMap<Model, THREE.Object3D[]>(), arms = new WeakMap<Model, THREE.Object3D[]>();
const shown = new WeakSet<Model>();
const bodyHidden = new WeakSet<Model>();
const _neckWorld = new THREE.Vector3();
/** The pose's own placement of the root, and ours over it: a frame with no new pose (paused) starts again
 *  from the pose's, or the neck would be measured where we put the hero last time */
const placed = new WeakMap<Model, { pos: THREE.Vector3; quat: THREE.Quaternion; ourPos: THREE.Vector3; ourQuat: THREE.Quaternion }>();
const _eye = new THREE.Vector3(), _m = new THREE.Matrix4(), _t = new THREE.Matrix4(), _t2 = new THREE.Matrix4(), _s = new THREE.Vector3(), _flip = new THREE.Matrix4().makeRotationY(Math.PI).multiply(new THREE.Matrix4().makeRotationX(TILT));

/** The meshes that aren't the arms (with the hands and what they hold). Of what hangs on a shoulder, only
 *  its own meshes (the upper arm) and the elbow's show: a pauldron, on a joint of its own, would fill the
 *  view's edge. */
function bodyOf(m: Model): THREE.Object3D[] {
  let list = body.get(m);
  if (list) return list;
  const j = m.joints, shoulders: THREE.Object3D[] = j ? [j.shoulderL, j.shoulderR] : [], elbows: THREE.Object3D[] = j ? [j.elbowL, j.elbowR] : [];
  list = [];
  const walk = (o: THREE.Object3D, onArm: boolean): void => {
    if (elbows.includes(o)) return;
    if ((o as THREE.Mesh).isMesh) { if (!onArm) list!.push(o); }
    else if (onArm) { hideAll(o); return; }
    for (const c of o.children) walk(c, shoulders.includes(o));
  };
  const hideAll = (o: THREE.Object3D): void => o.traverse((c) => { if ((c as THREE.Mesh).isMesh) list!.push(c); });
  walk(m.root, false);
  body.set(m, list);
  return list;
}

/** The meshes that are the arms (with the hands and what they hold): every one of the model's not its body's. */
function armsOf(m: Model): THREE.Object3D[] {
  let list = arms.get(m);
  if (list) return list;
  const hidden = new Set(bodyOf(m));
  list = [];
  m.root.traverse((o) => { if ((o as THREE.Mesh).isMesh && !hidden.has(o)) list!.push(o); });
  arms.set(m, list);
  return list;
}

const _r = new THREE.Quaternion().setFromRotationMatrix(_flip).invert();

/**
 * Where a point of the eyes' view (camera space: x right, y up, looking down -z, in metres) will be once
 * `viewArms` has placed the model (`root`), in its world as posed so far: for a pose that puts the hands
 * where they are seen. Needs the model's world matrices up to date (where the neck is).
 */
export function fromEyes(root: THREE.Object3D, neck: THREE.Object3D, p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  root.worldToLocal(neck.getWorldPosition(_eye)).add(NECK_CAM);
  out.copy(p).applyQuaternion(_r).divideScalar(root.scale.x).add(_eye);
  return root.localToWorld(out);
}
/** A direction of the eyes' view in the model's world, as `fromEyes` */
export function dirFromEyes(root: THREE.Object3D, d: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  return out.copy(d).applyQuaternion(_r).transformDirection(root.matrixWorld);
}
const _rInv = _r.clone().invert(), _rootInv = new THREE.Matrix4();
/** Where a point of the model's world (as posed so far) will be in the eyes' view: `fromEyes` undone */
export function intoEyes(root: THREE.Object3D, neck: THREE.Object3D, p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  root.worldToLocal(neck.getWorldPosition(_eye)).add(NECK_CAM);
  return root.worldToLocal(out.copy(p)).sub(_eye).multiplyScalar(root.scale.x).applyQuaternion(_rInv);
}
/** A direction of the model's world in the eyes' view: `dirFromEyes` undone */
export function dirIntoEyes(root: THREE.Object3D, d: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  return out.copy(d).transformDirection(_rootInv.copy(root.matrixWorld).invert()).applyQuaternion(_rInv);
}

const _tx = new THREE.Vector3(), _tf = new THREE.Vector3();
const Y_UP = new THREE.Vector3(0, 1, 0), X_AXIS = new THREE.Vector3(1, 0, 0);

/** `from` turned towards `to` by `w` of the angle between them, into `out` (unit ways; the short way round, as a fist
 *  turns its handle: lerped, two flats facing apart passed through nothing halfway) */
export function turnTowards(from: THREE.Vector3, to: THREE.Vector3, w: number, out: THREE.Vector3): THREE.Vector3 {
  const angle = from.angleTo(to);
  _tx.crossVectors(from, to);
  if (_tx.lengthSq() < 1e-8) _tx.crossVectors(from, Math.abs(from.y) < 0.9 ? Y_UP : X_AXIS);
  return out.copy(_tf.copy(from).applyAxisAngle(_tx.normalize(), angle * w).normalize());
}

const _fm = new THREE.Matrix4(), _fq = [new THREE.Quaternion(), new THREE.Quaternion()];
const _fx = new THREE.Vector3(), _fy = new THREE.Vector3(), _fz = new THREE.Vector3();

/** The turn whose x is `dir` and whose y is `flat` square to it, into `out`. */
function frameOf(dir: THREE.Vector3, flat: THREE.Vector3, out: THREE.Quaternion): THREE.Quaternion {
  _fx.copy(dir).normalize();
  _fy.copy(flat).addScaledVector(_fx, -flat.dot(_fx)).normalize();
  _fz.crossVectors(_fx, _fy);
  return out.setFromRotationMatrix(_fm.makeBasis(_fx, _fy, _fz));
}

/** A weapon's way (`dir`) and its flat (`flat`) turned `w` of the way to `toDir`, `toFlat`, as one turn (slerped), in
 *  place. */
function slerpFrame(dir: THREE.Vector3, flat: THREE.Vector3, toDir: THREE.Vector3, toFlat: THREE.Vector3, w: number): void {
  const q = frameOf(dir, flat, _fq[0]).slerp(frameOf(toDir, toFlat, _fq[1]), w);
  dir.set(1, 0, 0).applyQuaternion(q);
  flat.set(0, 1, 0).applyQuaternion(q);
}

/** A fade through the eyes from where a weapon was last placed in the view, as `PoseFade` is for the joints: a
 *  placement made after the pose's fade (a two-hander held in the view, a cut keyed there) would leap from the end
 *  of a move to the next in a frame. */
export class ViewFade {
  private readonly at = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly flat = new THREE.Vector3();
  private readonly fromAt = new THREE.Vector3();
  private readonly fromDir = new THREE.Vector3();
  private readonly fromFlat = new THREE.Vector3();
  private readonly elbow = new THREE.Vector3();
  private readonly fromElbow = new THREE.Vector3();
  private hold = 0;
  private fromHold = 0;
  private w = 0;
  private dur = 0.2;
  private primed = false;

  /** start a fade from the place shown last frame, over `dur` seconds */
  cut(dur: number): void {
    if (!this.primed) return;
    this.fromAt.copy(this.at);
    this.fromDir.copy(this.dir);
    this.fromFlat.copy(this.flat);
    this.fromElbow.copy(this.elbow);
    this.fromHold = this.hold;
    this.w = 1;
    this.dur = dur;
  }

  /** this frame's place (`at`, the way `dir`, the way its flat faces `flat`), faded from the last cut's, and how far a
   *  swing holds its fist (models/warrior.ts `fitInView`'s `hold`), faded so too: the one to use (a swing's fist let
   *  go of at once as it ended, the weapon turned 60 degrees in a frame); and the way to its elbow (`swingAt`'s), if
   *  it's given, for an arm keyed from one swing to another, which no hold fades */
  apply(at: THREE.Vector3, dir: THREE.Vector3, dt: number, flat?: THREE.Vector3, hold = 0, elbow?: THREE.Vector3): number {
    if (this.w > 0) {
      this.w = Math.max(0, this.w - dt / this.dur);
      const e = this.w * this.w * (3 - 2 * this.w);
      at.lerp(this.fromAt, e);
      // (the weapon's way and its flat turned as one, the fist's whole turn slerped: each turned its own short way,
      // the fist between them was turned past what a forearm can, and the blade flipped in a frame, 113 m/s; lerped,
      // a blade turned over between two cuts spun four times as fast halfway)
      if (flat) slerpFrame(dir, flat, this.fromDir, this.fromFlat, e);
      else turnTowards(dir.normalize(), this.fromDir, e, dir);
      hold += (this.fromHold - hold) * e;
      if (elbow) elbow.lerp(this.fromElbow, e);
    }
    this.at.copy(at);
    this.dir.copy(dir).normalize();
    if (flat) this.flat.copy(flat);
    if (elbow) this.elbow.copy(elbow);
    this.hold = hold;
    this.primed = true;
    return hold;
  }

  /** where the weapon was drawn this frame (`at`, `dir`, `flat`, as `apply` takes them) when the view didn't hold it
   *  all the way (a move posed in the hero's own space took its arm over: Steel Tempest's spin), for the next cut to
   *  fade from: faded from where it was asked to be and never reached, as the spin ended a one-hander leapt 53 cm in a
   *  frame, a two-hander 2.7 m (#249) */
  shown(at: THREE.Vector3, dir: THREE.Vector3, flat: THREE.Vector3): void {
    this.at.copy(at);
    this.dir.copy(dir).normalize();
    this.flat.copy(flat);
    this.primed = true;
  }

  /** nothing placed this frame: the next cut does nothing */
  reset(): void { this.primed = false; this.w = 0; }

  /** how much of the last cut's place this frame's still holds (0 once the fade is over) */
  get fading(): number { return this.w * this.w * (3 - 2 * this.w); }
}

/** the camera's turn the last time a model was placed in view, undone */
const _camInv = new THREE.Quaternion();
/** and half its frame's height and width a metre ahead (the game's 66 degrees on a wide screen till then) */
let halfUp = Math.tan((66 * Math.PI) / 360), halfAcross = (halfUp * 16) / 9;

/** A place on the screen in the eyes' view (camera space, as `fromEyes`), from the camera as it was last placed: `on`
 *  is how far across and up from the middle to the frame's edges (-1..1) and how far ahead (m). A pose held so sits
 *  at the same place in the frame on any screen, wide or narrow. */
export function fromScreen(on: readonly number[], out: THREE.Vector3): THREE.Vector3 {
  const [across, up, ahead] = on;
  return out.set(across * ahead * halfAcross, up * ahead * halfUp, -ahead);
}
/** A direction of the world as the eyes see it (their frame, as `fromEyes`), from the camera as it was last placed: for
 *  a pose that lines something up with the world through the eyes (the arrow on the string along the shot's line). The
 *  crosshair's aim is taken from that camera too. */
export function toEyes(d: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  return out.copy(d).applyQuaternion(_camInv);
}

/** The layer `m`'s arms and what they hold are drawn on: their own through the eyes when their own camera draws
 *  them, else the world's. */
export function armsLayerOf(m: Model): number {
  return shown.has(m) && m.armsFov ? ARMS_LAYER : WORLD_LAYER;
}

/** Show `m` through the camera's eyes (`on`), or as a whole body. Call after the camera has moved. */
export function viewArms(m: Model, on: boolean, cam: THREE.Camera): void {
  // (a model that has its arms drawn by their own camera has them on its layer, `armsFov`)
  const ownCamera = on && !!m.armsFov;
  // Hide the body before the gliding camera enters the head, at any simulation speed.
  const nearHead = !!m.joints && m.joints.neck.getWorldPosition(_neckWorld).distanceTo(cam.position) < 0.8;
  const hideBody = on || nearHead;
  if (hideBody !== bodyHidden.has(m)) {
    for (const o of bodyOf(m)) o.layers.set(hideBody ? HIDDEN_LAYER : WORLD_LAYER);
    if (hideBody) bodyHidden.add(m); else bodyHidden.delete(m);
  }
  if (on !== shown.has(m)) {
    for (const o of armsOf(m)) o.layers.set(ownCamera ? ARMS_LAYER : WORLD_LAYER);
    if (on) shown.add(m); else shown.delete(m);
    m.firstPerson?.(on);
  }
  drawArms(ownCamera ? m.armsFov!() : null);
  const root = m.root, parent = root.parent;
  let p = placed.get(m);
  if (p && p.ourPos.equals(root.position) && p.ourQuat.equals(root.quaternion)) { root.position.copy(p.pos); root.quaternion.copy(p.quat); }
  if (!on || !parent) return;
  if (!p) placed.set(m, p = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), ourPos: new THREE.Vector3(), ourQuat: new THREE.Quaternion() });
  p.pos.copy(root.position); p.quat.copy(root.quaternion);
  root.updateWorldMatrix(true, false);
  cam.updateMatrixWorld();
  cam.getWorldQuaternion(_camInv).invert();
  if ((cam as THREE.PerspectiveCamera).isPerspectiveCamera) {
    const lens = cam as THREE.PerspectiveCamera;
    // (the view the arms are drawn with: their own camera's, or the world's)
    const fov = ownCamera ? m.armsFov!() : lens.fov;
    halfUp = Math.tan((fov * Math.PI) / 360) / lens.zoom;
    halfAcross = halfUp * lens.aspect;
  }
  // the camera sits just above the neck, wherever the pose has taken it: the head rides the spine, so a
  // lean or a crouch doesn't bring the shoulders up under the camera
  const neck = m.joints?.neck;
  if (neck) root.worldToLocal(neck.getWorldPosition(_eye)).add(NECK_CAM);
  else root.worldToLocal(_eye.setFromMatrixPosition(cam.matrixWorld));
  _m.copy(cam.matrixWorld).multiply(_flip);
  // (the model's own scale kept: the heroes are built a little over life size, and reach reads it)
  _m.multiply(_t.makeScale(root.scale.x, root.scale.y, root.scale.z)).multiply(_t2.makeTranslation(-_eye.x, -_eye.y, -_eye.z));
  _m.premultiply(_t.copy(parent.matrixWorld).invert());
  _m.decompose(root.position, root.quaternion, _s);
  p.ourPos.copy(root.position); p.ourQuat.copy(root.quaternion);
}
