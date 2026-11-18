// A hero's wrist: a flattened tube from the forearm onto the heel of the hand, bent through joints turned part of the way
// from the forearm to the hand as it's drawn. Round, with the hand's bend blended into it over a few centimetres, it stood
// out of the palm by its rim wherever the wrist bent, and the hand looked apart from the arm.
import * as THREE from 'three';
import { clamp, smooth } from '../../util';
import { joint } from './rig';
import { lathe } from './shapes';

/**
 * `share` of the turn `q` from rest into `out`, taken the way round that is nearer `middle` (the middle of the turns
 * it takes). Taken the shorter way (a slerp from rest), a turn near half round went one way and then the other as it
 * crossed it, and the joints blended through it jumped between two places: the bow hand is turned 90 to 180 degrees
 * on its forearm (through the eyes 140 to 180, and past it), and its cuff flickered between two shapes with the hand still (#161).
 * Measured from the middle, the way round flips only half a turn from it, where the hand never goes.
 */
function blendTurn(out: THREE.Quaternion, q: THREE.Quaternion, share: number, middle: THREE.Quaternion): THREE.Quaternion {
  // (q and -q are one turn, each the other way round: the one nearer the middle)
  const sign = q.dot(middle) < 0 ? -1 : 1;
  const w = clamp(q.w * sign, -1, 1), half = Math.acos(w), s = Math.sin(half);
  if (s < 1e-6) return out.identity();
  const k = Math.sin(half * share) / s * sign;
  return out.set(q.x * k, q.y * k, q.z * k, Math.cos(half * share));
}

/** a tube round the forearm joint's bone (along -y, its space), flattened: rings of [y, half across, half through] from
 *  the bottom up (the wrist wider across the back of the hand than through it, as the forearm is towards it) */
export function ovalTube(rings: [number, number, number][], segs: number): THREE.BufferGeometry {
  const g = lathe(rings.map(([y, rx]) => [rx, y] as [number, number]), segs), p = g.attributes.position;
  if (!p) return g;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i); let k = 0;
    while (k < rings.length - 2 && y > rings[k + 1][0]) k++;
    const [y0, x0, z0] = rings[k], [y1, x1, z1] = rings[k + 1], t = clamp((y - y0) / (y1 - y0), 0, 1);
    p.setZ(i, p.getZ(i) * (z0 + (z1 - z0) * t) / (x0 + (x1 - x0) * t));
  }
  g.computeVertexNormals();
  return g;
}

/** how far along a forearm of length `foreL` a wrist's piece starts to bend (m, up it from the wrist), and over how far */
const BEND_FROM = 0.03, BEND_OVER = 0.058;

/** `tube` (in the forearm's space) told how far along a wrist's joints each of its points is, for `Sculpt.skinChain` */
export function wristBent(tube: THREE.BufferGeometry, foreL: number): THREE.BufferGeometry {
  const p = tube.attributes.position;
  if (!p) return tube;
  const shares = Float32Array.from({ length: p.count }, (_, i) => smooth(clamp((-p.getY(i) - (foreL - BEND_FROM)) / BEND_OVER, 0, 1)));
  tube.setAttribute('skinK', new THREE.BufferAttribute(shares, 1));
  return tube;
}

/** A wrist's joints on the forearm: a quarter, half, three quarters and all of the turn of the hand as it's drawn. */
export interface Wrist {
  /** the forearm's joint and those after it, a piece's chain for `Sculpt.skinChain` */
  chain: THREE.Object3D[];
  /** turned as the hand and its drawn hand are this frame: after the pose and whatever closes the hand */
  bend(vis: THREE.Object3D): void;
}

/** the part-turned joints of a hand's wrist (`left`, its side; `middle` of its turns about its length, deg: `blendTurn`) */
export function wristOf(hand: THREE.Object3D, left: boolean, middleDeg = left ? -135 : 135): Wrist {
  const forearm = hand.parent!;
  const axis = hand.position.clone().normalize();
  const middle = new THREE.Quaternion().setFromAxisAngle(axis, THREE.MathUtils.degToRad(middleDeg));
  const SHARES = [0.25, 0.5, 0.75, 1];
  const joints = SHARES.map((_, i) => {
    const part = joint(forearm, hand.position.x, hand.position.y, hand.position.z);
    part.name = `wrist${left ? 'L' : 'R'}${i + 1}`;
    return part;
  });
  const whole = new THREE.Quaternion();
  return {
    chain: [forearm, ...joints],
    bend(vis) {
      // (the hand as it's drawn: `hold` turns it on the joint, and a tube bent as the joint alone left the palm turned
      // out from its end)
      whole.copy(hand.quaternion).multiply(vis.quaternion);
      joints.forEach((part, i) => {
        blendTurn(part.quaternion, whole, SHARES[i], middle);
        part.position.copy(hand.position);
      });
    },
  };
}
