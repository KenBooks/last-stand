// What a hero does with his weapon by a fire (tools/lab `sit`): the owner's "he briefly puts his two handed sword in fire",
// and of what he's laid down, "floating parallel to ground, also moving as he moves".
// `FireClear` reads his weapon against the fire every frame. `LaidStill` reads a weapon the game says he's let go of
// (`userData.laid`) against where it first lay.

import * as THREE from 'three';
import type { Seat } from '../../../src/world/seats';
import type { Lab } from './lab';

/** the flames' reach as a share of the fire's circle, which takes in its ring of stones */
const FLAMES_OF_CIRCLE = 0.7;
/** the points read along the weapon, from the end of its handle behind his fist to the far end (from his fist on, a
 *  greataxe's 78 cm of haft behind it swept through his legs into the fire as he took it up, unread) */
const WEAPON_POINTS = 12;
/** how far a weapon lying on the floor may be off where it first lay (m): a float's rounding */
const LAID_MOST = 0.002;
/** how far the canaries put a weapon wrong (m) */
const CANARY_BY = 0.2;

/** how far outside the fire's ring of stones what he lays down must lie at least (m): from review, of a maul whose head
 *  lay on the stones, lit by the flames, "on screen it reads as the weapon put in or against the fire" */
const RING_CLEAR = 0.15;

/** how high over the floor the fire's ring of stones reaches, with room for the weapon's own width (m): a point of it
 *  lower than this over the ring touches the stones. From play, of a two-hander laid by a fire: "it should not touch
 *  rocks/fire" */
const STONES_TOP = 0.3;
/** how far outside the ring the weapon's line must keep, low by it, for its sides to keep off the stones (m): half a
 *  maul's head across */
const TOUCH_CLEAR = 0.08;

/** how far a shield resting on the floor may be off it (m) */
const RIM_MOST = 0.03;

const _box = new THREE.Box3();
const _butt = new THREE.Vector3();
const _inverse = new THREE.Matrix4();
/** how far each weapon reaches behind its grip, along its grip's down (m, in the grip's space), read once */
const behindOf = new WeakMap<THREE.Object3D, number>();
const _tip = new THREE.Vector3();
const _point = new THREE.Vector3();

/** Where the weapon whose far end is `tip` ends behind the fist that holds it, its handle's butt, into `out`. */
function buttOf(tip: THREE.Object3D, out: THREE.Vector3): THREE.Vector3 {
  const grip = tip.parent!;
  grip.updateWorldMatrix(true, true);
  let behind = behindOf.get(grip);
  if (behind === undefined) {
    behind = reachBehind(grip);
    behindOf.set(grip, behind);
  }
  return out.set(0, behind, 0).applyMatrix4(grip.matrixWorld);
}

/** How far the meshes hung from `grip` reach behind it along its down (m, in its space, 0 or less). */
function reachBehind(grip: THREE.Object3D): number {
  _inverse.copy(grip.matrixWorld).invert();
  let behind = 0;
  grip.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    mesh.geometry.computeBoundingBox();
    _box.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrixWorld).applyMatrix4(_inverse);
    behind = Math.min(behind, _box.min.y);
  });
  return behind;
}

/** How far `point` is inside a circle round (`x`, `z`) on the floor (m, up to its radius), or 0. */
export function insideCircle(point: THREE.Vector3, x: number, z: number, radius: number): number {
  return Math.max(0, radius - Math.hypot(point.x - x, point.z - z));
}

/** How far the lowest of what's named `shield` on him is over the floor under his feet (m), or null with none shown. */
export function shieldRimOver(lab: Lab): number | null {
  const shield = lab.model.root.getObjectByName('shield');
  if (!shield?.visible) return null;
  lab.model.root.updateMatrixWorld(true);
  return _box.setFromObject(shield, true).min.y - lab.player.pos.y;
}

/** A shield's rim sat by a fire as words, or none if it rests on the floor (from play: a shield in mid-air beside him). */
export function describeShieldRim(rim: number | null, name: string): string {
  if (rim === null || Math.abs(rim) <= RIM_MOST) return '';
  const where = rim > 0 ? 'over' : 'under';
  return `sit: by the ${name}, his shield's rim ${(Math.abs(rim) * 100).toFixed(1)} cm ${where} the floor`;
}

/** A weapon's points against a fire: its deepest into the flames, frame by frame, and how near what he's laid down
 *  lies to the fire's ring of stones. */
export class FireClear {
  private frames = 0;
  private deepest = 0;
  private at = '';
  /** the nearest a point of it lay to the ring while let go of on the floor (m, less than 0 inside it), and where */
  private laidGap = Infinity;
  private laidAt = '';
  /** the nearest a point of it low over the floor came to the ring at any moment (m, less than 0 inside it), and where */
  private lowGap = Infinity;
  private lowAt = '';

  constructor(private readonly seat: Seat) {}

  /** Notes this frame's weapon, whatever part of the sit it's in. */
  observe(lab: Lab, frame: string): void {
    if (this.seat.ground) this.noteLaid(lab, frame);
    if (this.seat.ground) this.noteLow(lab, frame);
    const depth = this.seat.ground ? this.depthOf(lab) : 0;
    if (depth <= 0) return;
    this.frames++;
    if (depth <= this.deepest) return;
    this.deepest = depth;
    this.at = frame;
  }

  /** The canary: the weapon's far end put at the fire's middle must read as in it. */
  caught(): boolean {
    // (a seat with no fire has no flames to put it in: a stool's circle is smaller than the canary's step from it)
    if (!this.seat.ground) return true;
    const radius = this.flames();
    if (radius <= 0) return true;
    _point.set(this.seat.ax + CANARY_BY, 0, this.seat.az);
    return insideCircle(_point, this.seat.ax, this.seat.az, radius) > 0;
  }

  /** Notes how near what he's laid down lies to the ring of stones this frame, if he's let go of it. */
  private noteLaid(lab: Lab, frame: string): void {
    const tip = lab.model.tip;
    const circle = this.seat.circles[0];
    if (!tip || !circle || !isLaid(tip)) return;
    const gap = this.gapOf(tip, circle.r);
    if (gap >= this.laidGap) return;
    this.laidGap = gap;
    this.laidAt = frame;
  }

  /** Notes how near the weapon's points low over the floor came to the ring of stones this frame, held or not. */
  private noteLow(lab: Lab, frame: string): void {
    const tip = lab.model.tip;
    const circle = this.seat.circles[0];
    if (!tip || !circle) return;
    const gap = this.lowGapOf(tip, circle.r, lab.player.pos.y);
    if (gap >= this.lowGap) return;
    this.lowGap = gap;
    this.lowAt = frame;
  }

  /** The nearest a point of the weapon under `STONES_TOP` over the floor at `floorY` is to a circle round the fire of
   *  `radius` (m), or Infinity with none so low. */
  private lowGapOf(tip: THREE.Object3D, radius: number, floorY: number): number {
    buttOf(tip, _butt);
    tip.getWorldPosition(_tip);
    let nearest = Infinity;
    for (let i = 0; i <= WEAPON_POINTS; i++) {
      _point.lerpVectors(_butt, _tip, i / WEAPON_POINTS);
      if (_point.y - floorY > STONES_TOP) continue;
      nearest = Math.min(nearest, Math.hypot(_point.x - this.seat.ax, _point.z - this.seat.az) - radius);
    }
    return nearest;
  }

  /** The touch canary: low over the stones it must read as touching, and low well clear of them, not. */
  caughtTouch(): boolean {
    const on = new FireClear(this.seat);
    on.lowGap = 0;
    const clear = new FireClear(this.seat);
    clear.lowGap = TOUCH_CLEAR + CANARY_BY;
    return on.describeTouch('canary') !== '' && clear.describeTouch('canary') === '';
  }

  /** How near the weapon came to the ring low over the floor, as words, or none if it never came low by a fire. */
  summaryTouch(name: string): string {
    if (this.lowGap === Infinity) return '';
    const gap = (this.lowGap * 100).toFixed(0);
    return `    by the ${name}, his weapon low over the floor ${gap} cm outside the fire's ring of stones at the nearest`;
  }

  /** The weapon touching the ring of stones (or within them) as a fault, or none. */
  describeTouch(name: string): string {
    if (this.lowGap >= TOUCH_CLEAR) return '';
    const gap = (this.lowGap * 100).toFixed(0);
    return `sit: by the ${name}, his weapon touched the fire's ring of stones, low over the floor ${gap} cm outside it `
      + `(at least ${TOUCH_CLEAR * 100}; ${this.lowAt})`;
  }

  /** The nearest a point of the weapon from its grip to `tip` is to a circle round the fire of `radius` (m). */
  private gapOf(tip: THREE.Object3D, radius: number): number {
    buttOf(tip, _butt);
    tip.getWorldPosition(_tip);
    let nearest = Infinity;
    for (let i = 0; i <= WEAPON_POINTS; i++) {
      _point.lerpVectors(_butt, _tip, i / WEAPON_POINTS);
      nearest = Math.min(nearest, Math.hypot(_point.x - this.seat.ax, _point.z - this.seat.az) - radius);
    }
    return nearest;
  }

  /** The ring canary: laid on the stones it must read as too near, and laid well clear of them, not. */
  caughtRing(): boolean {
    const on = new FireClear(this.seat);
    on.laidGap = -CANARY_BY;
    const clear = new FireClear(this.seat);
    clear.laidGap = RING_CLEAR + CANARY_BY;
    return on.describeRing('canary') !== '' && clear.describeRing('canary') === '';
  }

  /** How near what he laid down lay to the ring, as words, or none if he laid nothing down there. */
  summaryRing(name: string): string {
    if (this.laidGap === Infinity) return '';
    return `    by the ${name}, what he laid down ${(this.laidGap * 100).toFixed(0)} cm outside the fire's ring of stones`;
  }

  /** What he laid down on or by the ring of stones as a fault, or none. */
  describeRing(name: string): string {
    if (this.laidGap >= RING_CLEAR) return '';
    const gap = (this.laidGap * 100).toFixed(0);
    return `sit: by the ${name}, what he laid down lay ${gap} cm outside the fire's ring of stones `
      + `(at least ${RING_CLEAR * 100}; ${this.laidAt})`;
  }

  /** The frames in the flames as words, or none if it never was. */
  describe(name: string): string {
    if (this.frames === 0) return '';
    const deepest = (this.deepest * 100).toFixed(0);
    return `sit: by the ${name}, his weapon in the flames on ${this.frames} frames, ${deepest} cm into them (${this.at})`;
  }

  private flames(): number {
    const circle = this.seat.circles[0];
    return circle ? circle.r * FLAMES_OF_CIRCLE : 0;
  }

  private depthOf(lab: Lab): number {
    const tip = lab.model.tip;
    const grip = tip?.parent;
    if (!tip || !grip) return 0;
    buttOf(tip, _butt);
    tip.getWorldPosition(_tip);
    let deepest = 0;
    for (let i = 0; i <= WEAPON_POINTS; i++) {
      _point.lerpVectors(_butt, _tip, i / WEAPON_POINTS);
      deepest = Math.max(deepest, insideCircle(_point, this.seat.ax, this.seat.az, this.flames()));
    }
    return deepest;
  }
}

/** A weapon let go of on the floor: how far it has stirred from where it first lay, and that it was ever let go of. */
export class LaidStill {
  private first: THREE.Vector3 | null = null;
  private frames = 0;
  private most = 0;
  private at = '';

  /** Notes this frame's weapon, if it's lying let go of. */
  observe(lab: Lab, frame: string): void {
    const tip = lab.model.tip;
    if (!tip || !isLaid(tip)) {
      this.first = null;
      return;
    }
    tip.getWorldPosition(_tip);
    this.frames++;
    if (!this.first) {
      this.first = _tip.clone();
      return;
    }
    this.note(_tip.distanceTo(this.first), frame);
  }

  /** Notes how far it has stirred. */
  private note(moved: number, frame: string): void {
    if (moved <= this.most) return;
    this.most = moved;
    this.at = frame;
  }

  /** The canary: moved by a hand's stir, it must read as stirred. */
  caught(): boolean {
    const was = new LaidStill();
    was.note(CANARY_BY, 'canary');
    return was.describe('canary', true).length > 0;
  }

  /** Stirred as words, or that it was never let go of where it should have been, or none. */
  describe(name: string, shouldLie: boolean): string {
    if (shouldLie && this.frames === 0 && this.most === 0) {
      return `sit: by the ${name}, his two-hander never let go of on the floor`;
    }
    if (this.most <= LAID_MOST) return '';
    const stirred = (this.most * 100).toFixed(1);
    return `sit: by the ${name}, what he laid down stirred ${stirred} cm with no hand on it (${this.at})`;
  }
}

/** Whether what `tip` belongs to says it's lying let go of: said on the weapon's group, which shares the tip's grip. */
function isLaid(tip: THREE.Object3D): boolean {
  let laid = false;
  tip.parent?.traverse((object) => {
    laid ||= !!object.userData.laid;
  });
  return laid;
}
