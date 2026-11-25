// `lab scholar`: Brother Hollis at his table and his chair (`src/world/scholarRounds.ts` `getUp`, `sitDown`, `CHAIR_OUT`;
// his table and chair built in `src/world/houses/library.ts` `scholarDesk`). From play: "when he sits, he overlaps the
// table lots, I think he needs to pull the chair, sit and then fix the chair position": risen where he sat, his lap
// and his sleeves came up through the table's top. Read here: his body against the table's top whenever he's sat or
// half sat, his chair's feet on the floor and clear of the table and the cases, and his hands on it while it moves.

import * as THREE from 'three';
import type { Scholar } from '../../../src/entities/models/scholar';
import type { Obstacle } from '../../../src/types';

/** how far into his table's top any of him may go (m), as Bertram's 2 cm at his counter */
export const TABLE_INTO_MOST = 0.02;
/** how far off the floor his chair's feet may be, or into it (m), how far into his table or a case it may go (m), and
 *  how far a hand holding it may be from where it's put on it while it moves (m) */
export const CHAIR = { floor: 0.005, into: 0.01, hand: 0.05 };
/** his table's top in its group's frame (`scholarDesk`'s `TABLE`: 1.2 by 0.72 at 0.62 ahead, its top 6 cm thick at 0.76) */
const TOP = new THREE.Box3(new THREE.Vector3(-0.6, 0.7, 0.26), new THREE.Vector3(0.6, 0.76, 0.98));
/** of him, what's never read against the table: what he reads on it and turns */
const NOT_HIM = /book|page|quill/;

/** his table's group: his root's parent, the frame its things are built in */
const deskOf = (s: Scholar): THREE.Object3D => s.root.parent!;

/** How far into his table's top any part of him is (m), and which: each of his meshes near it, every few of its points. */
export function intoTable(s: Scholar): { into: number; what: string } {
  const desk = deskOf(s);
  s.root.updateMatrixWorld(true);
  const toDesk = desk.matrixWorld.clone().invert(), m = new THREE.Matrix4(), p = new THREE.Vector3(), near = TOP.clone().expandByScalar(0.05);
  const bounds = new THREE.Box3();
  let into = 0, what = '';
  s.root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible || NOT_HIM.test(mesh.name)) return;
    const pos = mesh.geometry.attributes.position;
    if (!pos) return;
    m.multiplyMatrices(toDesk, mesh.matrixWorld);
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    if (!bounds.copy(mesh.geometry.boundingBox!).applyMatrix4(m).intersectsBox(near)) return;
    for (let i = 0; i < pos.count; i += 2) {
      p.fromBufferAttribute(pos, i).applyMatrix4(m);
      if (!TOP.containsPoint(p)) continue;
      const d = Math.min(p.x - TOP.min.x, TOP.max.x - p.x, p.y - TOP.min.y, TOP.max.y - p.y, p.z - TOP.min.z, TOP.max.z - p.z);
      if (d > into) { into = d; what = mesh.name.replace('scholar ', 'his '); }
    }
  });
  return { into, what };
}

/** His chair as it stands now: how far its feet are off the floor (or into it, m), how far it goes into his table's top
 *  or a case's circle (m, and which), and how far out from the table it is (m). */
export function chairRead(s: Scholar, cases: readonly Obstacle[]): { floor: number; into: number; intoWhat: string; out: number } {
  const desk = deskOf(s), chair = desk.getObjectByName('scholar chair')!;
  chair.updateMatrixWorld(true);
  const toDesk = desk.matrixWorld.clone().invert(), p = new THREE.Vector3(), m = new THREE.Matrix4();
  let lowest = Infinity, into = 0, intoWhat = '';
  chair.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const pos = mesh.geometry.attributes.position;
    m.multiplyMatrices(toDesk, mesh.matrixWorld);
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).applyMatrix4(m);
      if (mesh.name === 'scholar chair leg') lowest = Math.min(lowest, p.y);
      if (TOP.containsPoint(p)) {
        const d = Math.min(p.x - TOP.min.x, TOP.max.x - p.x, p.y - TOP.min.y, TOP.max.y - p.y, p.z - TOP.min.z, TOP.max.z - p.z);
        if (d > into) { into = d; intoWhat = 'his table'; }
      }
      // (and the cases, by their circles on the floor)
      const w = p.clone().applyMatrix4(desk.matrixWorld);
      for (const c of cases) {
        if (w.y > c.h) continue;
        const d = c.r - Math.hypot(w.x - c.x, w.z - c.z);
        if (d > into) { into = d; intoWhat = 'a case'; }
      }
    }
  });
  return { floor: Math.abs(lowest), into, intoWhat, out: -chair.position.z };
}

/** While his chair moves: how far each hand holding it (its reach most of the way) is from where it's put on it (m, the
 *  nearer's), or Infinity with none holding it. */
export function chairHandOff(s: Scholar): number {
  let off = Infinity;
  for (const [aim, reach, name] of [[s.act.handL, s.act.reachL, 'scholar handL'], [s.act.handR, s.act.reachR, 'scholar handR']] as const) {
    if (!aim || reach < 0.5) continue;
    off = Math.min(off, s.root.getObjectByName(name)!.getWorldPosition(new THREE.Vector3()).distanceTo(aim.at));
  }
  return off;
}
