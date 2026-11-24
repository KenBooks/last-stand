// The Hollow Colossus's trophy (data/foes/colossus.ts, a wall trophy): its head mounted on a shield, as a hunter
// mounts one. Its pieces are the boss's own head's (entities/models/brute.ts, the Colossus's variant), each at its own
// place on the head and in its colours, grown 1.65 times: the low skull of pale cracked stone, violet light in its
// cracks gone dim, the heavy brow over burning eyes, the jaw with its tusks, the ridged horns sweeping out and up, and
// its crown of violet crystal, dimmed; a stump of its neck into the shield behind it.
import * as THREE from 'three';
import { grunge, pbrMaterialMaps, cracks } from '../../core/textures';
import { horn, organic } from '../../entities/models/shapes';
import type { TrophyDef } from '../../data/houses';
import { glowOf, part, type TrophyModel } from '../trophyKit';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** how much larger than on the boss's own head its pieces are, and their horns' length (m, in the head's units) */
const K = 1.65;
const HORN = 0.3;

/** A lump of rock: a sphere pushed in and out by noise, then scaled (the boss's own `boulder`). */
const boulder = (sx: number, sy: number, sz: number, seed: number): THREE.BufferGeometry =>
  organic(new THREE.IcosahedronGeometry(1, 2), 0.18, 1.6, seed).scale(sx, sy, sz);

/** The Colossus's head on its mount. */
export const model: TrophyModel = (g: THREE.Group, def: TrophyDef) => {
  const maps = pbrMaterialMaps(grunge(), 2, 1);
  const skin = new THREE.MeshStandardMaterial({
    color: def.colour, roughness: 0.82, map: maps.map, normalMap: maps.normalMap, normalScale: new THREE.Vector2(2.2, 2.2),
    emissive: new THREE.Color(0x9a40ff), emissiveMap: cracks(8), emissiveIntensity: 0.9,
  });
  const rock = new THREE.MeshStandardMaterial({
    color: def.colour, roughness: 0.9, map: maps.map, normalMap: maps.normalMap, normalScale: new THREE.Vector2(2.5, 2.5),
    flatShading: true,
  });
  const horny = new THREE.MeshStandardMaterial({ color: 0xcfc6b0, roughness: 0.45, metalness: 0.1, normalMap: maps.normalMap });
  const crystal = new THREE.MeshStandardMaterial({
    color: 0x5a3a80, emissive: def.trim, emissiveIntensity: 0.45, roughness: 0.15, flatShading: true,
  });
  const eye = glowOf(0x9a40ff, 1.6);
  // (the head in the boss's own head's units, its skull's middle at the mount's, its neck's stump against the shield)
  const head = new THREE.Group();
  head.scale.setScalar(K);
  head.position.set(0, -0.07 * K, 0.22 * K);
  g.add(head);
  part(head, organic(new THREE.CylinderGeometry(0.11, 0.13, 0.16, 14, 2).rotateX(Math.PI / 2), 0.012, 9, 3), skin,
    [0, 0.02, -0.12]);
  part(head, boulder(0.15, 0.14, 0.15, 11), skin, [0, 0.07, 0.05]);
  part(head, boulder(0.16, 0.05, 0.08, 12), rock, [0, 0.13, 0.15], [0.3, 0, 0]);
  for (const sx of [-1, 1]) {
    part(head, new THREE.SphereGeometry(0.024, 10, 8), eye, [sx * 0.055, 0.095, 0.195], [0, 0, 0], [1.3, 0.7, 0.8]);
    // (its sockets' rims of rock round the eyes)
    part(head, boulder(0.045, 0.03, 0.03, 20 + sx), rock, [sx * 0.06, 0.07, 0.19]);
  }
  // (the jaw, hung open a little, a dim fire in the maw, its tusks)
  part(head, boulder(0.12, 0.05, 0.12, 13), skin, [0, -0.01, 0.13], [0.12, 0, 0]);
  part(head, new THREE.SphereGeometry(1, 10, 6), eye, [0, 0.02, 0.18], [0, 0, 0], [0.07, 0.015, 0.05]);
  for (const sx of [-1, 1]) {
    part(head, horn(0.16, 0.024, 1.4, V(1, 0, 0), V(sx * 0.15, 1, 0.3)), horny, [sx * 0.075, 0.01, 0.21]);
    // (its great horns, ridged, sweeping out from its temples and curling up)
    part(head, horn(HORN, 0.05, 1.9, V(0, 0, -sx), V(sx, 0.35, 0.15), 6), horny, [sx * 0.13, 0.12, 0.02]);
  }
  // (its crown of violet crystal across its brow, the middle one the tallest)
  for (let i = 0; i < 7; i++) {
    const a = (i / 6) * Math.PI - Math.PI / 2;
    const tall = i === 3 ? 3.4 : 2.5 - Math.abs(i - 3) * 0.3;
    part(head, new THREE.OctahedronGeometry(0.05, 0).scale(0.6, tall, 0.6), crystal,
      [Math.sin(a) * 0.15, 0.2, Math.cos(a) * 0.06 + 0.02], [0, 0, -Math.sin(a) * 0.5]).castShadow = false;
  }
};
