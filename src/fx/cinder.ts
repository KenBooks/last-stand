// The fire staff's orb and its burst (Cinderburst, #402; from play: "now fire staff is not fancy, it needs to match
// lightning in effect quality").
// - The orb: a white-hot core inside two shells of flame turning against each other and breathing, shedding embers
//   that fall behind it and a wake of dark fire under its bright trail.
// - The burst: a pop of white-hot light at the strike and billows of flame rolling out of it, two rings racing out
//   over the floor, embers thrown high and falling, the floor cracked and glowing, and fire left burning over the
//   blast's whole area for a second or so, dying from its edge in. It stays long enough to be seen, and eases out:
//   nothing of it blinks.
// Additive meshes of the kit's plain glow material (the same program as a shockwave's) and the particle pools:
// nothing new to compile.
import * as THREE from 'three';
import { additive } from '../core/materials';
import { addEffect, shockwave, decal, crackDecal } from './effects';
import { particles, col, smokePuff, debris } from './particles';
import { rand } from '../util';
import type { Effect } from '../types';

const ball = new THREE.SphereGeometry(1, 14, 10);
const shellA = new THREE.IcosahedronGeometry(1, 1), shellB = new THREE.IcosahedronGeometry(1, 0);
const WHITE_HOT = 0xfff0c0;

/** The orb in flight: its mesh (the projectile's own, sized here), what turns it each frame, and its end. */
export interface CinderOrb {
  mesh: THREE.Mesh;
  tick(pos: THREE.Vector3, vel: THREE.Vector3, dt: number): void;
  dispose(): void;
}

/** the orb's core's radius (m), and its shells' as multiples of it */
const ORB = { core: 0.17, inner: 1.7, outer: 2.3 };

export function cinderOrb(color: number, colorEnd: number): CinderOrb {
  const coreMat = additive(WHITE_HOT, 3), innerMat = additive(color, 1.5, 0.6), outerMat = additive(colorEnd, 1.1, 0.4);
  for (const m of [coreMat, innerMat, outerMat]) m.depthWrite = false;
  const mesh = new THREE.Mesh(ball, coreMat);
  mesh.scale.setScalar(ORB.core);
  const inner = new THREE.Mesh(shellA, innerMat), outer = new THREE.Mesh(shellB, outerMat);
  mesh.add(inner, outer);
  const ember = col(color, 3), emberEnd = col(colorEnd, 0.6), wake = col(colorEnd, 1.4), wakeEnd = col(0x501000, 0.3);
  let t = rand(0, 10);
  return {
    mesh,
    tick(pos, vel, dt) {
      t += dt;
      inner.rotation.set(t * 5.1, t * 3.7, 0);
      outer.rotation.set(-t * 2.9, 0, t * 4.3);
      inner.scale.setScalar(ORB.inner * (1 + 0.12 * Math.sin(t * 17)));
      outer.scale.setScalar(ORB.outer * (1 + 0.16 * Math.sin(t * 11 + 1.3)));
      // embers shed behind it, falling away; and a wake of darker fire, slower to die than its trail
      const want = 70 * dt, n = Math.floor(want) + (Math.random() < want % 1 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        particles.glow.spawn({
          x: pos.x + rand(-0.12, 0.12), y: pos.y + rand(-0.12, 0.12), z: pos.z + rand(-0.12, 0.12),
          vx: -vel.x * 0.12 + rand(-1.2, 1.2), vy: rand(0.2, 1.8), vz: -vel.z * 0.12 + rand(-1.2, 1.2),
          life: rand(0.35, 0.8), size: rand(0.05, 0.11), sizeEnd: 0.01, color: ember, colorEnd: emberEnd, drag: 1.2, gravity: 5,
        });
      }
      const wakes = 26 * dt, m = Math.floor(wakes) + (Math.random() < wakes % 1 ? 1 : 0);
      for (let i = 0; i < m; i++) {
        particles.glow.spawn({
          x: pos.x, y: pos.y, z: pos.z, vx: rand(-0.3, 0.3), vy: rand(0.2, 0.7), vz: rand(-0.3, 0.3),
          life: rand(0.5, 0.9), size: rand(0.3, 0.45), sizeEnd: 0.05, color: wake, colorEnd: wakeEnd, drag: 2, gravity: -0.6,
        });
      }
    },
    dispose() {
      coreMat.dispose(); innerMat.dispose(); outerMat.dispose();
    },
  };
}

/** how long the fire the burst leaves on the floor burns (s) */
const BLAST = { burns: 1.3 };

/** The orb bursting at `at`, over `radius`. */
export function cinderBlast(at: THREE.Vector3, radius: number, color: number, colorEnd: number): Effect {
  const floor = new THREE.Vector3(at.x, 0, at.z);
    // the flash: a pop of white-hot light at the strike, gone in a moment (a sphere swelling out of it read as a pale
  // bubble over the blast, as the shell of flame after it read as a dome: nothing here has a hard edge)
  const pop = col(WHITE_HOT, 2.4), popEnd = col(color, 0.8);
  for (let i = 0; i < 9; i++) {
    particles.glow.spawn({
      x: at.x + rand(-0.15, 0.15), y: at.y + rand(0, 0.3), z: at.z + rand(-0.15, 0.15),
      vx: rand(-1.5, 1.5), vy: rand(0, 2), vz: rand(-1.5, 1.5),
      life: rand(0.12, 0.2), size: rand(0.7, 1.1), sizeEnd: 0.25, color: pop, colorEnd: popEnd, drag: 4, gravity: 0,
    });
  }
  // the ball of flame after the flash: billows rolling out and up from the strike (a shell of flame as a mesh, its
  // few flat faces read as a yellow glass dome over the blast, through the eyes above all)
  const billow = col(color, 1.6), billowEnd = col(colorEnd, 0.35);
  for (let i = 0; i < 34; i++) {
    const a = Math.random() * Math.PI * 2, up = rand(-0.2, 1), out = Math.sqrt(1 - Math.min(1, up * up)) * radius * rand(1.2, 2.6);
    particles.glow.spawn({
      x: at.x, y: at.y + 0.1, z: at.z, vx: Math.cos(a) * out, vy: up * radius * 1.6 + 0.6, vz: Math.sin(a) * out,
      life: rand(0.35, 0.6), size: rand(0.45, 0.8), sizeEnd: 0.12, color: billow, colorEnd: billowEnd, drag: 3.5, gravity: -1,
    });
  }
  // the rings over the floor, the cracks and the scorch under them
  shockwave(floor, { color, intensity: 2.4, from: 0.3, to: radius, life: 0.32 });
  crackDecal(floor, { size: radius * 1.5, color: colorEnd, intensity: 2.2, life: 2.6 });
  decal(floor, { type: 'scorch', size: radius * 1.1, life: 7, opacity: 0.75 });
  debris(floor, { count: 8, speed: 5, size: 0.12 });
  smokePuff(at, { count: 6, color: 0x241812, alpha: 0.4, size: 1, sizeEnd: 3, life: 1.8, rise: 1.4 });
  // embers thrown up and out, falling back
  const ember = col(color, 3), emberEnd = col(colorEnd, 0.5);
  for (let i = 0; i < 46; i++) {
    const a = Math.random() * Math.PI * 2, out = rand(2, 7);
    particles.glow.spawn({
      x: at.x, y: at.y + 0.1, z: at.z, vx: Math.cos(a) * out, vy: rand(3, 8), vz: Math.sin(a) * out,
      life: rand(0.6, 1.2), size: rand(0.06, 0.13), sizeEnd: 0.01, color: ember, colorEnd: emberEnd, drag: 0.8, gravity: 11,
    });
  }
  const lick = col(color, 1.7), lickEnd = col(colorEnd, 0.4);
  let t = 0, ringed = false;
  return addEffect({
    update(dt: number) {
      t += dt;
      // (a second ring a moment after the first)
      if (!ringed && t > 0.09) { ringed = true; shockwave(floor, { color: colorEnd, intensity: 1.6, from: 0.2, to: radius * 0.8, life: 0.4, thickness: 0.7 }); }
      // fire left on the floor over the blast's area, dying from its edge in
      const left = Math.max(0, 1 - t / BLAST.burns);
      const want = 110 * left * left * dt * Math.min(2, radius / 2.5), n = Math.floor(want) + (Math.random() < want % 1 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, r = radius * 0.85 * Math.sqrt(Math.random()) * (0.35 + 0.65 * left);
        particles.glow.spawn({
          x: at.x + Math.cos(a) * r, y: rand(0.05, 0.3), z: at.z + Math.sin(a) * r,
          vx: rand(-0.3, 0.3), vy: rand(1.4, 3.2), vz: rand(-0.3, 0.3),
          life: rand(0.3, 0.6), size: rand(0.2, 0.42), sizeEnd: 0.03, color: lick, colorEnd: lickEnd, drag: 1, gravity: -1.5,
        });
      }
      return t < BLAST.burns;
    },
  });
}
