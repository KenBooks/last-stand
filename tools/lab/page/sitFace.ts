// A held weapon's head by a hero's face as he sits or gets up (tools/lab `sit`). From review of a maul stood on its
// butt by a log: from a fifth of his way up until he lifts it to his shoulder, "the maul head is at his cheek", and no
// clip check saw it, as it never went in. `FaceClear` reads each frame the gap between the weapon's far end (a maul's
// or an axe's head, a blade's point: the last `HEAD_LONG` of it to its tip, a capsule `HEAD_R` round) and his head's
// skin (`bodyShape`'s ellipsoid), and fails a sit whose nearest is within `CLEAR_MOST`.

import * as THREE from 'three';
import { bodyShape, capsuleDepth, type Solid } from '../../../src/entities/models/anatomy';
import type { Lab } from './lab';

/** how long the weapon's far end is, back from its tip (m): a maul's head, 24 cm */
const HEAD_LONG = 0.24;
/** how far round its line the far end reaches (m): half a maul's head across */
const HEAD_R = 0.07;
/** how near his head the far end may come (m): a hand's breadth and more, clear */
const CLEAR_MOST = 0.12;
/** his face as a window seen from ahead of him, about his head's middle (m): half its width and half its height. A
 *  weapon ahead of him inside it is before his face from the front, however far off (from review, a maul stood
 *  between his knees: "the spiked head sits at face height and overlaps the right side of his face") */
const FACE_HALF_WIDE = 0.1;
const FACE_HALF_HIGH = 0.11;
/** how long a weapon may pass before his face (frames): a moment, as a hand passes it */
const BEFORE_MOMENT = 9;
/** how much of the weapon back from its tip is followed before his face (m), and how often along it (m) */
const BEFORE_LONG = 1.2;
const BEFORE_STEP = 0.04;

const _tip = new THREE.Vector3();
const _back = new THREE.Vector3();
const _way = new THREE.Vector3();
const _scale = new THREE.Vector3();

/** The gap between a capsule (world, m) and a head's solid (m: negative, how far into it). */
export function gapTo(head: Solid, from: THREE.Vector3, to: THREE.Vector3, radius: number): number {
  head.at.updateWorldMatrix(true, false);
  const scale = _scale.setFromMatrixScale(head.at.matrixWorld).y;
  return -capsuleDepth(from, to, radius / scale, head) * scale;
}

/** Whether a gap is a weapon by his face. */
export function byFace(gap: number): boolean {
  return gap < CLEAR_MOST;
}

/** The canary: a weapon's head laid at his head's middle is by his face; one two metres off isn't. */
export function faceCanary(head: Solid): boolean {
  const middle = head.at.localToWorld(head.c.clone());
  const off = middle.clone().add(new THREE.Vector3(2, 0, 0));
  const up = new THREE.Vector3(0, HEAD_LONG, 0);
  const near = gapTo(head, middle, middle.clone().add(up), HEAD_R);
  const far = gapTo(head, off, off.clone().add(up), HEAD_R);
  return byFace(near) && !byFace(far);
}

/** His frame as a camera ahead of him sees it: his face's middle, his right-to-left and his up, in the world. */
export interface FaceView {
  middle: THREE.Vector3;
  across: THREE.Vector3;
  up: THREE.Vector3;
  ahead: THREE.Vector3;
}

/** Whether a point is before his face from ahead of him: ahead of its middle and inside its window, widened by `round`
 *  (m: the weapon's own half thickness there). */
export function beforeFace(view: FaceView, point: THREE.Vector3, round: number): boolean {
  _off.subVectors(point, view.middle);
  if (_off.dot(view.ahead) <= 0) return false;
  const wide = Math.abs(_off.dot(view.across));
  const high = Math.abs(_off.dot(view.up));
  return wide < FACE_HALF_WIDE + round && high < FACE_HALF_HIGH + round;
}

/** Whether any of a weapon from its tip back `BEFORE_LONG` along `back` (a unit way, tip to grip) is before his face,
 *  its far end as round as a head (`HEAD_R`), its haft as a line. */
export function weaponBeforeFace(view: FaceView, tip: THREE.Vector3, back: THREE.Vector3): boolean {
  for (let along = 0; along <= BEFORE_LONG; along += BEFORE_STEP) {
    _point.copy(tip).addScaledVector(back, along);
    if (beforeFace(view, _point, along <= HEAD_LONG ? HEAD_R : 0)) return true;
  }
  return false;
}

/** The before-his-face canary: a weapon stood upright 30 cm ahead of his face is before it; one 40 cm out to his side
 *  isn't. */
export function beforeCanary(view: FaceView): boolean {
  const down = view.up.clone().negate();
  const ahead = view.middle.clone().addScaledVector(view.ahead, 0.3).addScaledVector(view.up, 0.2);
  const aside = ahead.clone().addScaledVector(view.across, 0.4);
  return weaponBeforeFace(view, ahead, down) && !weaponBeforeFace(view, aside, down);
}

const _off = new THREE.Vector3();
const _point = new THREE.Vector3();

/** The nearest a held weapon's far end came to his face over a sit, and how long it stood before his face from
 *  ahead. */
export class FaceClear {
  private head: Solid | null = null;
  private nearest = Infinity;
  private at = '';
  private frames = 0;
  private canaryCaught = true;
  private beforeCaught = true;
  private beforeRun = 0;
  private beforeLongest = 0;
  private beforeFrames = 0;
  private beforeAt = '';
  private readonly view: FaceView = {
    middle: new THREE.Vector3(),
    across: new THREE.Vector3(),
    up: new THREE.Vector3(),
    ahead: new THREE.Vector3(),
  };

  /** Notes this frame's gap, and whether the weapon is before his face, while he's posed by the sit. */
  observe(lab: Lab, frame: string): void {
    const tip = lab.model.tip;
    const grip = tip?.parent;
    if (!tip || !grip || !lab.player.sitting.pose) {
      this.beforeRun = 0;
      return;
    }
    lab.model.root.updateMatrixWorld(true);
    if (!this.head) {
      this.head = bodyShape(lab.joints).solids.find((solid) => solid.name === 'head') ?? null;
      if (!this.head) return;
      this.canaryCaught = faceCanary(this.head);
      this.beforeCaught = beforeCanary(this.viewOf(lab, this.head));
    }
    tip.getWorldPosition(_tip);
    _way.set(0, -1, 0).transformDirection(grip.matrixWorld);
    _back.copy(_way).multiplyScalar(HEAD_LONG).add(_tip);
    this.noteBefore(weaponBeforeFace(this.viewOf(lab, this.head), _tip, _way), frame);
    const gap = gapTo(this.head, _back, _tip, HEAD_R);
    if (byFace(gap)) this.frames++;
    if (gap >= this.nearest) return;
    this.nearest = gap;
    this.at = frame;
  }

  /** His face as a camera ahead of him sees it this frame. */
  private viewOf(lab: Lab, head: Solid): FaceView {
    const view = this.view;
    head.at.localToWorld(view.middle.copy(head.c));
    const matrix = lab.model.root.matrixWorld;
    view.across.setFromMatrixColumn(matrix, 0).normalize();
    view.up.setFromMatrixColumn(matrix, 1).normalize();
    view.ahead.setFromMatrixColumn(matrix, 2).normalize();
    return view;
  }

  /** Counts a frame before his face, and the longest run of them. */
  private noteBefore(before: boolean, frame: string): void {
    if (!before) {
      this.beforeRun = 0;
      return;
    }
    this.beforeFrames++;
    this.beforeRun++;
    if (this.beforeRun <= this.beforeLongest) return;
    this.beforeLongest = this.beforeRun;
    this.beforeAt = frame;
  }

  /** The weapon before his face from ahead for longer than a moment, as words, or none. */
  describeBefore(name: string): string {
    if (this.beforeLongest <= BEFORE_MOMENT) return '';
    return `sit: by the ${name}, his weapon before his face from ahead of him on ${this.beforeFrames} frames, `
      + `${this.beforeLongest} in a row (to ${this.beforeAt})`;
  }

  /** Whether the before-his-face canary was caught (true until a head is read). */
  caughtBefore(): boolean {
    return this.beforeCaught;
  }

  /** The nearest as a line of the report. */
  summary(name: string): string {
    if (!Number.isFinite(this.nearest)) return '';
    return `  by the ${name}, his weapon's far end ${(this.nearest * 100).toFixed(1)} cm from his face at the nearest `
      + `(${this.at})`;
  }

  /** A weapon by his face as words, or none. */
  describe(name: string): string {
    if (!byFace(this.nearest)) return '';
    return `sit: by the ${name}, his weapon's far end by his face on ${this.frames} frames, the nearest `
      + `${(this.nearest * 100).toFixed(1)} cm (${this.at})`;
  }

  /** Whether the canary was caught (true until a head is read). */
  caught(): boolean {
    return this.canaryCaught;
  }
}
