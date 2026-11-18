// A held weapon moving through a hero's fist by itself as he sits or stands (tools/lab `sit`). From play, of a maul he
// stood on its butt by a log: "maul cannot slide up without jedi force he doesn't have", and "maul slides up with jedi
// force, still". A fist may slide along a haft that stays where it is (its butt on the floor, his hand going up it),
// and a haft may slide through a loosened fist that another hand is moving; it may not move along itself through his
// right fist with no other hand on it. It may slip down through his loosened fists under its own weight, his left
// closed round it guiding it (from the owner, of a maul set down sat: "let it slide down"; lowered in his fist as he
// carries it, his fist went past his reach), but never rise so. `HaftSlide` reads each frame the weapon's move in the
// world along its length, the right fist's slide along it, whether his left fist is closed on it and moving with it
// (a left fist sliding along it too, kept by the right one, read as holding it, and the old jedi rise read 4 cm),
// and whether it went down and his left fist was closed on it at all.

import * as THREE from 'three';
import type { Fist } from '../../../src/types';
import type { Lab } from './lab';
import { FIST_OPEN } from './range';

/** how far a frame's move counts as moving (m): a float's wobble below it */
const MOVES_FROM = 0.002;
/** how far a weapon may move by itself over a sit before it's a fault (m) */
const BY_ITSELF_MOST = 0.02;
/** how much of the right fist's slide along the weapon the left's may be for it to move the weapon: its joint drifts
 *  a millimetre or two a frame on a haft moving 15 (a fixed line read it as sliding), and kept by the right fist it
 *  slid as far */
const LEFT_SLIDES_MOST = 0.5;
/** how far a closed left fist may be off the handle for it to hold it (m) */
const LEFT_OFF_MOST = 0.03;

const _grip = new THREE.Vector3();
const _hand = new THREE.Vector3();
const _left = new THREE.Vector3();
const _way = new THREE.Vector3();

/** A frame's moves (m): the weapon's along its length in the world, the right fist's along it, whether the left
 *  holds it and moves with it, whether the weapon went down, and whether the left was closed on it. */
export interface SlideFrame {
  moved: number;
  slid: number;
  left: boolean;
  falls: boolean;
  guided: boolean;
}

/** Whether a frame so read is the weapon moving through his right fist by itself. */
export function byItself(frame: SlideFrame): boolean {
  const slips = frame.falls && frame.guided;
  return Math.abs(frame.moved) > MOVES_FROM && Math.abs(frame.slid) > MOVES_FROM && !frame.left && !slips;
}

/** The canary: risen through his fist with no left hand, even with it closed on it, it's by itself, and so is slipped
 *  down with no hand on it; planted, lifted by his left, or slipped down his left round it, it isn't. */
export function slideCanary(): boolean {
  const risen: SlideFrame = { moved: 0.01, slid: -0.01, left: false, falls: false, guided: false };
  const risenGuided: SlideFrame = { ...risen, guided: true };
  const dropped: SlideFrame = { ...risen, moved: -0.01, slid: 0.01, falls: true };
  const planted: SlideFrame = { ...risen, moved: 0 };
  const lifted: SlideFrame = { ...risen, left: true };
  const slipped: SlideFrame = { ...dropped, guided: true };
  const caught = byItself(risen) && byItself(risenGuided) && byItself(dropped);
  return caught && !byItself(planted) && !byItself(lifted) && !byItself(slipped);
}

/** A held weapon's moves along itself through his right fist with no other hand on it. */
export class HaftSlide {
  private was: { grip: THREE.Vector3; hand: THREE.Vector3; left: THREE.Vector3 } | null = null;
  private frames = 0;
  private total = 0;
  private at = '';
  private most = 0;
  private mostAt = '';

  /** Notes this frame's weapon, whatever part of the sit it's in. */
  observe(lab: Lab, frame: string): void {
    const grip = lab.model.tip?.parent;
    if (!grip || !lab.player.sitting.pose) {
      this.was = null;
      return;
    }
    lab.model.root.updateMatrixWorld(true);
    grip.getWorldPosition(_grip);
    const hand = grip.worldToLocal(lab.joints.handR.getWorldPosition(_hand));
    const left = grip.worldToLocal(lab.joints.handL.getWorldPosition(_left));
    if (!this.was) {
      this.was = { grip: _grip.clone(), hand: hand.clone(), left: left.clone() };
      return;
    }
    _way.set(0, 1, 0).transformDirection(grip.matrixWorld);
    const scale = new THREE.Vector3().setFromMatrixScale(grip.matrixWorld).y;
    const leftSlid = Math.abs(left.y - this.was.left.y) * scale;
    const moved = _grip.clone().sub(this.was.grip).dot(_way);
    const guided = leftOn(lab.model.fists ?? []);
    const read: SlideFrame = {
      moved,
      slid: (hand.y - this.was.hand.y) * scale,
      left: guided && leftSlid <= LEFT_SLIDES_MOST * Math.abs(hand.y - this.was.hand.y) * scale,
      falls: moved * _way.y < 0,
      guided,
    };
    this.was.grip.copy(_grip);
    this.was.hand.copy(hand);
    this.was.left.copy(left);
    if (!byItself(read)) return;
    this.frames++;
    this.total += Math.abs(read.slid);
    if (!this.at) this.at = frame;
    if (Math.abs(read.slid) <= this.most) return;
    this.most = Math.abs(read.slid);
    this.mostAt = frame;
  }

  /** The moves by itself as words, or none if it never moved so far. */
  describe(name: string): string {
    if (this.total <= BY_ITSELF_MOST) return '';
    const total = (this.total * 100).toFixed(0);
    return `sit: by the ${name}, his weapon slid ${total} cm through his fist as it moved, with no hand moving it, `
      + `on ${this.frames} frames (from ${this.at}; the most, ${(this.most * 100).toFixed(1)} cm, ${this.mostAt})`;
  }
}

/** Whether his left fist is closed on its handle. */
function leftOn(fists: readonly Fist[]): boolean {
  const left = fists.find((fist) => fist.hand === 'left');
  return !!left && left.curl >= FIST_OPEN && left.off <= LEFT_OFF_MOST;
}
