// Where a shot strikes a foe: its body as it's drawn, met along the shot's step (its rigid meshes and its skinned
// limbs, fx/stuckArrows.ts `castSolid`). Struck only within its circle and under its height, an arrow aimed at a boss's
// arms or crown flew on through it, and one aimed past a small foe's shoulder at the boss behind struck the small foe
// it went by. (A column within its circle as well struck imps where nothing of them is drawn.) What it met tells a
// headshot from a body's hit (`Struck`, `onHead`).
import * as THREE from 'three';
import type { Enemy } from '../entities/enemy';
import type { HullHit } from '../entities/models/hulls';
import { castSolid } from '../fx/stuckArrows';

const ray = new THREE.Raycaster(), _dir = new THREE.Vector3();

/** What a shot met of a body, filled in by `strikesBody` as it finds where: whether it was the head. */
export interface Struck { head: boolean }

/**
 * Whether `hit`, met on `e`'s body, is on its head: what it met rides the model's head joint (its skull and all on
 * it, a horn, a hood, a cap, a jaw), a rigid mesh under that joint or a skinned one's triangle that joint moves the
 * most. Read off the part, not the height: the Brute's, the Mossback's and the Hulks' heads hang low and forward
 * between their shoulders, under a hump or horns that a share of the height would have taken for one.
 */
export function onHead(e: Enemy, hit: THREE.Intersection): boolean {
  const head = e.model.joints?.head ?? e.model.head;
  if (!head) return false;
  for (let o: THREE.Object3D | null = (hit as Partial<HullHit>).joint ?? hit.object; o && o !== e.obj; o = o.parent) {
    if (o === head) return true;
  }
  return false;
}

/** Where along the step from (ax, az) by (dx, dz) it first comes within `r` of (cx, cz): 0..1, or -1 if it doesn't. */
export function entry(ax: number, az: number, dx: number, dz: number, cx: number, cz: number, r: number): number {
  const fx = ax - cx, fz = az - cz, a = dx * dx + dz * dz, b = 2 * (fx * dx + fz * dz), c = fx * fx + fz * fz - r * r;
  if (c <= 0) return 0;
  if (a < 1e-9) return -1;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : -1;
}

/**
 * Where along the step from `a` to `b` (0..1) a shot first meets `e`'s body, its meshes as drawn, or -1 if it doesn't.
 * They're met only when the step comes within the body's reach (`Enemy.reach`). A ducked foe is met within `around`
 * (m) of what's left of it (the shot's own size). `struck` is told what it met: its head or not (a ducked foe's cap
 * is no head).
 */
export function strikesBody(e: Enemy, a: THREE.Vector3, b: THREE.Vector3, around = 0, struck?: Struck): number {
  if (struck) struck.head = false;
  const top = e.duckedTop;
  if (top !== null) return strikesDucked(e, top, a, b, around);
  const dx = b.x - a.x, dz = b.z - a.z, base = e.obj.position.y;
  if (Math.min(a.y, b.y) > base + Math.max(e.height, e.reach.top) || Math.max(a.y, b.y) < base) return -1;
  if (entry(a.x, a.z, dx, dz, e.pos.x, e.pos.z, Math.max(e.radius, e.reach.out)) < 0) return -1;
  const length = a.distanceTo(b);
  if (length < 1e-6) return -1;
  ray.set(a, _dir.subVectors(b, a).divideScalar(length));
  ray.far = length;
  const hit = castSolid(e.obj, ray);
  if (!hit) return -1;
  if (struck) struck.head = onHead(e, hit);
  return hit.distance / length;
}

/**
 * Where along the step from `a` to `b` a shot meets a ducked foe (entities/evade.ts), or -1: within its circle and
 * under `top`, what's left of it over the ground (a cap over its body). Its body is met by the hulls of its skinned
 * limbs, which leave a cap's top out: aimed at a ducked Sporecaller's cap, at its feet, an arrow flew on through it.
 */
function strikesDucked(e: Enemy, top: number, a: THREE.Vector3, b: THREE.Vector3, around: number): number {
  const t = entry(a.x, a.z, b.x - a.x, b.z - a.z, e.pos.x, e.pos.z, e.radius + around);
  if (t < 0) return -1;
  return a.y + (b.y - a.y) * t < top + around ? t : -1;
}
