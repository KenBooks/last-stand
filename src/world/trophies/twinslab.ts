// The Ossuary Twins' trophy (data/foes/twins.ts, keyed by Slab's id as the pair is counted; a cabinet trophy): their two skulls on a velvet cushion, bound together
// by a length of their chain of bone, its gold light still in a few links. The skulls are the crypt's (world/skull.ts:
// a distance field meshed with surface nets, its hollows darkened in its vertex colours, as the Twins' own are made
// from), Slab's broad with an ember in its sockets, Reliquary's drawn long with a cold light and the third eye in its
// brow; the links are the Twins' chain's (entities/models/twins.ts). Nothing of the Twins' own chunk is loaded for it.
import * as THREE from 'three';
import { skullGeometry } from '../skull';
import { organic } from '../../entities/models/shapes';
import type { TrophyDef } from '../../data/houses';
import type { Mats } from '../rooms';
import { glowOf, part, type TrophyModel } from '../trophyKit';

/** the grid a skull is meshed on (m), the crypt's own: 4.4k triangles each (at 11 mm its sockets were lost) */
const SKULL_CELL = 0.008;
/** the skulls' size against the crypt's, how far apart their middles stand, and how they turn in to each other */
const SKULL = 0.82;
const APART = 0.115;
const TURN = 0.22;
/** the cushion's top (m), and the link's size and spacing along the chain */
const CUSHION_TOP = 0.055;
const LINK = 0.019;
const STEP = 0.031;
/** each skull's eyes, in the skull's own space (its lowest point at 0, facing +z), and Reliquary's third eye */
const EYE: [number, number, number] = [0.034, 0.093, 0.088];
const THIRD_EYE: [number, number, number] = [0, 0.14, 0.104];

/** The chain's path: from behind Slab's skull round the front of both at their cheeks' height, then a tail hanging
 *  over the cushion's front edge (`t` from 0 to 1). */
function chainAt(t: number): THREE.Vector3 {
  if (t < 0.78) {
    const a = Math.PI * (-0.12 + (t / 0.78) * 1.24);
    return new THREE.Vector3(-Math.cos(a) * 0.235, CUSHION_TOP + 0.05 - Math.sin(a) * 0.02, Math.sin(a) * 0.13);
  }
  const s = (t - 0.78) / 0.22;
  return new THREE.Vector3(0.235 - s * 0.03, CUSHION_TOP + 0.03 - s * s * 0.08, 0.02 + s * 0.15);
}

/** The Twins' skulls on their cushion, bound by their chain. */
export const model: TrophyModel = (g: THREE.Group, def: TrophyDef, M: Mats) => {
  // (a bone a shade darker than the pair's colour: in the room's firelight it burned to a peach)
  const bone = new THREE.MeshStandardMaterial({ color: new THREE.Color(def.colour).multiplyScalar(0.78), roughness: 0.8,
    vertexColors: true });
  const link = new THREE.MeshStandardMaterial({ color: def.colour, roughness: 0.7 });
  const lit = new THREE.MeshStandardMaterial({ color: def.colour, roughness: 0.6, emissive: def.trim, emissiveIntensity: 0.6 });
  const velvet = new THREE.MeshStandardMaterial({ color: 0x4a0e16, roughness: 0.95 });
  // (the cushion: a soft block of velvet, a brass tassel at each corner)
  const cushion = new THREE.BoxGeometry(0.48, CUSHION_TOP, 0.3, 8, 2, 6).translate(0, CUSHION_TOP / 2, 0);
  part(g, organic(cushion, 0.006, 14, 7), velvet);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      part(g, new THREE.SphereGeometry(0.013, 8, 6), M.brass, [sx * 0.235, CUSHION_TOP * 0.6, sz * 0.145]);
      part(g, new THREE.ConeGeometry(0.01, 0.04, 6), M.brass, [sx * 0.24, CUSHION_TOP * 0.6 - 0.025, sz * 0.15], [Math.PI, 0, 0]);
    }
  }
  // (the skulls, sunk a little into the cushion: Slab's broad, Reliquary's long, each turned in to the other)
  const geo = skullGeometry(SKULL_CELL);
  const twins: { x: number; turn: number; scale: [number, number, number]; eyes: number; third: boolean }[] = [
    { x: -APART, turn: TURN, scale: [SKULL * 1.06, SKULL, SKULL], eyes: 0xffb060, third: false },
    { x: APART, turn: -TURN, scale: [SKULL * 0.96, SKULL * 1.02, SKULL * 1.12], eyes: 0x8fe8ff, third: true },
  ];
  for (const twin of twins) {
    const skull = new THREE.Group();
    skull.position.set(twin.x, CUSHION_TOP - 0.01, -0.01);
    skull.rotation.y = twin.turn;
    skull.scale.set(...twin.scale);
    g.add(skull);
    part(skull, geo, bone);
    const ember = glowOf(twin.eyes, 0.9);
    for (const sx of [-1, 1]) {
      part(skull, new THREE.SphereGeometry(0.011, 8, 6), ember, [sx * EYE[0], EYE[1], EYE[2]]).castShadow = false;
    }
    if (twin.third) part(skull, new THREE.OctahedronGeometry(0.009), glowOf(def.trim, 1.2), THIRD_EYE).castShadow = false;
  }
  // (the chain of bone: links turned a quarter to each other along its path, every fifth still lit gold)
  const links = Math.floor(1 / (STEP / 0.75));
  const ring = new THREE.TorusGeometry(LINK, LINK * 0.34, 6, 12).scale(1, 1.45, 1);
  for (let i = 0; i <= links; i++) {
    const t = i / links;
    const at = chainAt(t);
    const ahead = chainAt(Math.min(1, t + 0.01)).sub(chainAt(Math.max(0, t - 0.01))).normalize();
    const mesh = part(g, ring, i % 5 === 2 ? lit : link, [at.x, at.y, at.z]);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), ahead);
    mesh.rotateY(i % 2 ? Math.PI / 2 : 0);
    mesh.castShadow = false;
  }
};
