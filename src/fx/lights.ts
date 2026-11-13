// Fixed-size pool of dynamic point lights. The count never changes, so the
// renderer never recompiles shaders; unused lights sit at intensity 0.
import * as THREE from 'three';

const POOL = 8;

type Vec3Like = { x: number; y?: number; z: number };
/** Something the light tracks: an object with a position, or a function returning one. */
export type LightFollow = { position: THREE.Vector3 } | (() => THREE.Vector3);

export interface LightSlot {
  light: THREE.PointLight;
  life: number;
  maxLife: number;
  peak: number;
  hold: number;
  follow: LightFollow | null;
  born: number;
}

const lights: LightSlot[] = [];

export function initLights(scene: THREE.Scene): void {
  for (let i = 0; i < POOL; i++) {
    const l = new THREE.PointLight(0xffffff, 0, 10, 2);
    l.castShadow = false;
    scene.add(l);
    lights.push({ light: l, life: 0, maxLife: 1, peak: 0, follow: null, born: 0, hold: 0 });
  }
}

export interface FlashOpts {
  color?: THREE.ColorRepresentation;
  intensity?: number;
  distance?: number;
  life?: number;
  /** seconds to stay at full intensity before fading */
  hold?: number;
  pos?: Vec3Like | null;
  follow?: LightFollow | null;
  /** default height when `pos.y` is omitted */
  y?: number;
}

let counter = 0;
/** Flash a light; steals the oldest light if all are busy, never one held for good (`hold: Infinity`, the hall of
 *  heroes' key and rim: released by whoever took it). */
export function flash({ color = 0xffffff, intensity = 20, distance = 10, life = 0.3, hold = 0, pos = null, follow = null, y = 1 }: FlashOpts): LightSlot {
  let slot = lights.find((l) => l.life <= 0);
  if (!slot) slot = lights.filter((l) => l.hold !== Infinity).reduce((a, b) => (a.born < b.born ? a : b));
  slot.light.color.set(color);
  slot.light.distance = distance;
  slot.light.decay = 2;
  slot.peak = intensity;
  slot.life = slot.maxLife = life;
  slot.hold = hold;
  slot.follow = follow;
  slot.born = ++counter;
  if (pos) slot.light.position.set(pos.x, pos.y ?? y, pos.z);
  return slot;
}

/** Like flash, but only takes a free light (null when all are busy): for many small lights, like a volley's bolts. */
export function flashFree(o: FlashOpts): LightSlot | null {
  return lights.some((l) => l.life <= 0) ? flash(o) : null;
}

/** The pool's lights (tools/lab reads them: `lab village`'s steady lamps). */
export const pooledLights = (): readonly THREE.PointLight[] => lights.map((s) => s.light);

export function release(slot: LightSlot | null | undefined): void { if (slot) slot.life = 0; }

export function updateLights(dt: number): void {
  for (const s of lights) {
    if (s.life <= 0) { s.light.intensity = 0; continue; }
    if (s.hold > 0) s.hold -= dt; else s.life -= dt;
    const k = Math.max(0, s.life / s.maxLife);
    // (a flash flickers; a light held for good burns steady: the village's lamps shimmered at the frame rate, from
    // play "lamps have high frequency flicker")
    const flicker = s.hold === Infinity ? 1 : 0.9 + Math.random() * 0.1;
    s.light.intensity = s.peak * k * flicker;
    if (s.follow) {
      const p = typeof s.follow === 'function' ? s.follow() : s.follow.position;
      if (p) s.light.position.copy(p);
    }
  }
}

export function clearLights(): void { for (const s of lights) s.life = 0; }
