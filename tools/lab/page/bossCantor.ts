// `lab boss --parts cantorLook`: the Ossuary Cantor alone, standing, from its front, its back and both sides, and its
// skull close up, its triangles held to a phone's budget for one boss (as the Twins' and the Rootmother's). From play,
// its first model read as a dark cone with a box for a head ("this looks like same picture", "full rework"), and a
// picture taken in the fight's views was too far off to judge it by.
import * as THREE from 'three';
import { G } from '../../../src/state';
import type { Enemy } from '../../../src/entities/enemy';
import type { Lab, Pictured } from './lab';

/** the most triangles the Cantor's model may draw */
export const CANTOR_TRIANGLES = 45_000;
/** how far off the whole pictures are taken from (m) and the height they're framed on; the skull's distance */
const LOOK_FROM = 13;
const LOOK_Y = 3.3;
const SKULL_FROM = 3.2;
/** frames it's held still for before its pictures, facing the hero */
const SETTLE = 30;

/** The triangles a model draws, by its meshes' geometries (each drawn once). */
export function trianglesOf(root: THREE.Object3D): number {
  const seen = new Set<THREE.BufferGeometry>();
  let count = 0;
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || seen.has(mesh.geometry)) return;
    seen.add(mesh.geometry);
    const geometry = mesh.geometry;
    count += (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
  });
  return Math.round(count);
}

/** Where the Cantor's skull is drawn in the world: its model's skull joint (`userData.skull`), or under its top. */
function skullOf(cantor: Enemy): THREE.Vector3 {
  const joint = cantor.model.root.userData.skull as THREE.Object3D | undefined;
  if (joint) return joint.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.25, 0));
  return cantor.pos.clone().setY(cantor.height - 0.8);
}

/**
 * The Cantor's look: held still facing the hero (its casts held off), pictured whole from its front, back and sides
 * and its skull close from the front and both sides; its triangles counted against `CANTOR_TRIANGLES`.
 */
export async function cantorLook(lab: Lab, cantor: Enemy, lines: string[], problems: string[]): Promise<Pictured[]> {
  const spot = cantor.pos.clone();
  const toHero = Math.atan2(G.player.pos.x - spot.x, G.player.pos.z - spot.z);
  await lab.step(SETTLE, () => {
    cantor.cd = 99;
    cantor.pos.copy(spot);
    cantor.facing = cantor.targetFacing = toHero;
    G.player.life = G.player.stats.maxLife;
    return {};
  });
  G.player.facing = Math.atan2(spot.x - G.player.pos.x, spot.z - G.player.pos.z);
  const moments: Pictured[] = [];
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    // (views by the hero: he faces it, so `back` is its front and `front` its back)
    const whole = { at: spot.clone().setY(LOOK_Y), distance: LOOK_FROM };
    moments.push(lab.picture('Cantor front and back', ['back', 'front'], ['the Cantor from its front and its back'], whole));
    moments.push(lab.picture('Cantor sides', ['left', 'right'], ['the Cantor from both sides'], whole));
    moments.push(lab.picture('Cantor skull', ['back', 'left', 'right'], ['its skull close: its face and both sides'],
      { at: skullOf(cantor), distance: SKULL_FROM }));
  } finally {
    lab.drawing = drawing;
  }
  const count = trianglesOf(cantor.model.root);
  lines.push(`cantorLook: the Cantor draws ${count} triangles (at most ${CANTOR_TRIANGLES})`);
  if (count > CANTOR_TRIANGLES) problems.push(`cantorLook: the Cantor's model draws ${count} triangles, over ${CANTOR_TRIANGLES}`);
  return moments;
}
