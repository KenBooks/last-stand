// What a boss's trophy model (world/trophies/<boss id>.ts) is built of, and the frame it's built in: the house of
// records (world/houses/records.ts) sets each on its place, a shield on the back wall or a stand in the trophy cabinet.
// A trophy is its own small mesh, its boss's look taken from its model's shapes and colours (entities/models/), never
// the boss's own chunk (entities/bosses/, loaded at its wave alone): the village draws it from the boot.
import * as THREE from 'three';
import type { TrophyDef } from '../data/houses';
import type { Mats } from './rooms';

/**
 * A trophy's model built into `g`. A wall trophy is built facing +z, its back on its shield's face at z = 0, its middle
 * at the origin, within about 1.0 m across, 0.9 m high and 0.45 m out from the shield; a cabinet trophy facing +z, its
 * foot at y = 0 on its stand, its middle over the origin, within 0.5 m across, 0.5 m high and 0.34 m deep (its shelf's
 * place). `M` is the room's materials (brass, iron, timber...), for the parts a trophy shares with it.
 */
export type TrophyModel = (g: THREE.Group, def: TrophyDef, M: Mats) => void;

type P3 = [number, number, number];

/** A mesh of `geo` in `mat` added to `g` at `at`, turned by `rot` and scaled by `scale`, casting and taking shadows. */
export function part(g: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, at: P3 = [0, 0, 0],
  rot: P3 = [0, 0, 0], scale: number | P3 = 1): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(...at);
  mesh.rotation.set(...rot);
  if (typeof scale === 'number') mesh.scale.setScalar(scale);
  else mesh.scale.set(...scale);
  mesh.castShadow = mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}

/** A glow: a material lit by its own colour alone, as the bosses' eyes and crystals are, held under the bloom's
 *  glare (`strength` about 1 to 2). */
export function glowOf(colour: number, strength: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: 0x0a0a0a, emissive: colour, emissiveIntensity: strength, roughness: 0.4 });
}
