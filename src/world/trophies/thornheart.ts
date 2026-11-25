// The Elder Thornheart's trophy (data/foes/thornheart.ts, a wall trophy): its crown, mounted. Its pieces are the boss's
// own (entities/models/treant.ts, the Thornheart's variant) in its colours: a burl of heartwood split open over its
// glowing heart in a cage of roots, the crown of branches in blossom rising from it, two great branching antlers
// thorned along their limbs, a few leaves, and a beard of moss and hanging roots under it.
import * as THREE from 'three';
import { bark, pbrMaterialMaps } from '../../core/textures';
import { branches, leaf, organic, taperTube } from '../../entities/models/shapes';
import { mulberry } from '../../util';
import type { TrophyDef } from '../../data/houses';
import { glowOf, part, type TrophyModel } from '../trophyKit';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** where the heart sits out from the shield (m) */
const HEART: [number, number, number] = [0, -0.08, 0.2];

/** A burl: a sphere of wood pushed in and out by noise, then scaled (the boss's own `burl`). */
const burl = (sx: number, sy: number, sz: number, seed: number, amp = 0.14): THREE.BufferGeometry =>
  organic(new THREE.IcosahedronGeometry(1, 2), amp, 1.6, seed).scale(sx, sy, sz);

/** The Thornheart's crown on its mount. */
export const model: TrophyModel = (g: THREE.Group, def: TrophyDef) => {
  const maps = pbrMaterialMaps(bark(), 1, 1.8);
  // (a shade lighter than the boss's own bark: on the shield's oak in the room's light its limbs were lost)
  const skin = new THREE.MeshStandardMaterial({
    color: new THREE.Color(def.colour).multiplyScalar(1.55), roughness: 0.9, map: maps.map, normalMap: maps.normalMap, normalScale: new THREE.Vector2(1.8, 1.8),
  });
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.85, normalMap: maps.normalMap });
  const moss = new THREE.MeshStandardMaterial({ color: 0x3a5a28, roughness: 1 });
  const leafy = new THREE.MeshStandardMaterial({ color: 0x2a5a2e, roughness: 0.8, side: THREE.DoubleSide });
  const dark = new THREE.MeshStandardMaterial({ color: 0x0a0806, roughness: 1 });
  const heart = glowOf(def.trim, 1.2);
  const blossom = glowOf(def.trim, 0.55);
  const rng = mulberry(73);
  // (the burl of heartwood against the shield, split open over the heart, the hollow dark behind it)
  part(g, burl(0.22, 0.2, 0.1, 5), skin, [0, -0.06, 0.07]);
  part(g, new THREE.SphereGeometry(1, 14, 10), dark, [HEART[0], HEART[1], HEART[2] - 0.05], [0, 0, 0], [0.11, 0.12, 0.05]);
  part(g, new THREE.IcosahedronGeometry(0.07, 2), heart, HEART).castShadow = false;
  // (its cage of roots, closing over the heart from round it)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3, c = Math.cos(a), s = Math.sin(a);
    const pts = [V(c * 0.14, s * 0.15, -0.06), V(c * 0.13, s * 0.14, 0.02), V(c * 0.07, s * 0.08, 0.08), V(c * 0.01, s * 0.01, 0.1)];
    part(g, taperTube(pts, (t) => 0.02 * (1 - t * 0.6), 10, 6), wood, HEART);
  }
  // (the crown: five boughs rising from the burl's top, blossom at their tips)
  const boughs: THREE.BufferGeometry[] = [], tips: THREE.Vector3[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 4 - 0.5) * 1.6;
    branches(rng, V(Math.sin(a) * 0.09, 0.1, 0.08), V(Math.sin(a) * 0.8, 1, 0.15), 0.26, 0.038, 1, boughs, tips, 0.5);
  }
  // (two great antlers out to the sides, forking twice, thorns along them)
  const antlers: THREE.BufferGeometry[] = [], ends: THREE.Vector3[] = [];
  for (const sx of [-1, 1]) {
    branches(rng, V(sx * 0.16, 0.02, 0.07), V(sx * 1, 0.75, 0.12), 0.32, 0.05, 2, antlers, ends, 0.6, 7);
  }
  for (const geo of [...boughs, ...antlers]) part(g, geo, skin);
  for (const [i, tip] of tips.entries()) {
    part(g, organic(new THREE.IcosahedronGeometry(1, 1), 0.2, 6, i), blossom, [tip.x, tip.y, tip.z], [0, 0, 0], 0.03)
      .castShadow = false;
  }
  for (const [i, end] of ends.entries()) {
    // (a thorn at each antler's tip, and a leaf on every other)
    const out = end.clone().normalize();
    const thorn = part(g, new THREE.ConeGeometry(0.012, 0.07, 5), wood, [end.x, end.y, end.z]);
    thorn.quaternion.setFromUnitVectors(V(0, 1, 0), out);
    if (i % 2 === 0) {
      const leafMesh = part(g, leaf(0.11, 0.05), leafy, [end.x, end.y - 0.02, end.z + 0.02], [0.4, 0, end.x > 0 ? -0.9 : 0.9]);
      leafMesh.castShadow = false;
    }
  }
  // (moss over the burl's brow, and a beard of moss and hanging roots under it)
  part(g, burl(0.18, 0.06, 0.08, 9, 0.2), moss, [0, 0.07, 0.09]);
  part(g, burl(0.14, 0.07, 0.07, 11, 0.2), moss, [0, -0.22, 0.08]);
  for (let i = 0; i < 6; i++) {
    const x = (i - 2.5) * 0.04, len = 0.16 + rng() * 0.12;
    const pts = [V(0, 0, 0), V(x * 0.3, -len * 0.4, 0.02), V(x * 0.6, -len * 0.8, 0.01), V(x, -len, 0.03)];
    part(g, taperTube(pts, (t) => 0.012 * (1 - t * 0.8), 8, 5), wood, [x, -0.24, 0.08]);
  }
};
