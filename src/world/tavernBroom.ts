// The tavern keeper's broom (world/tavernKeeper.ts): a besom as one is made, from Kenneth's round 3 ("a real broom":
// a bound bristle head, a ferrule, a worn handle). An ash handle, darker and polished where hands have worn it, an iron
// ferrule where it goes into the head, the straw bound round in three courses of twine and splayed at its foot, its
// tips ragged. Its origin is where his upper hand holds it, its bristles out along +y (as `CARRY.broom` and the sweep
// hold it). Each material is one mesh, its pieces merged: four draws.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry } from '../util';

/** where along the broom (m from his upper hand, +y) each part runs */
const HANDLE = { from: -0.24, to: 1.04, r: 0.0145 }, WORN = [{ at: -0.12, len: 0.22 }, { at: 0.34, len: 0.2 }];
const FERRULE = { from: 1.0, to: 1.07, r: 0.019 };
const HEAD = { from: 1.03, to: 1.38, neck: 0.03, foot: 0.12, flat: 0.42 };
const BINDINGS = [1.06, 1.13, 1.21];

/** The materials the broom is drawn in (the room's kit's, so its pipelines are the room's). */
export interface BroomLook { wood: THREE.Material; worn: THREE.Material; straw: THREE.Material; iron: THREE.Material; twine: THREE.Material }

/** the broom, its origin at his upper hand's grip, its bristles out along +y */
export function buildBroom(look: BroomLook): THREE.Group {
  const broom = new THREE.Group();
  broom.name = 'broom';
  const along = (geo: THREE.BufferGeometry, from: number, to: number) => geo.translate(0, (from + to) / 2, 0);
  const handle = along(new THREE.CylinderGeometry(HANDLE.r, HANDLE.r * 1.08, HANDLE.to - HANDLE.from, 10), HANDLE.from, HANDLE.to);
  const knob = new THREE.SphereGeometry(HANDLE.r * 1.15, 10, 6).translate(0, HANDLE.from, 0);
  const worn = WORN.map((w) => along(new THREE.CylinderGeometry(HANDLE.r * 1.012, HANDLE.r * 1.012, w.len, 10), w.at - w.len / 2, w.at + w.len / 2));
  const ferrule = along(new THREE.CylinderGeometry(FERRULE.r, FERRULE.r * 1.1, FERRULE.to - FERRULE.from, 12), FERRULE.from, FERRULE.to);
  const lip = new THREE.TorusGeometry(FERRULE.r * 1.1, 0.0025, 4, 12).rotateX(Math.PI / 2).translate(0, FERRULE.to, 0);
  const twine = BINDINGS.map((y) => {
    const r = radiusAt(y) * 1.02;
    return new THREE.TorusGeometry(r, 0.004, 4, 16).rotateX(Math.PI / 2).scale(1, 1, HEAD.flat).translate(0, y, 0);
  });
  broom.add(
    meshOf('broom handle', mergeGeometries([handle, knob]), look.wood),
    meshOf('broom worn', mergeGeometries(worn), look.worn),
    meshOf('broom ferrule', mergeGeometries([ferrule, lip]), look.iron),
    meshOf('broom straw', strawGeometry(), look.straw),
    meshOf('broom twine', mergeGeometries(twine), look.twine),
  );
  return broom;
}

/** the head's radius (across its width) at `y` along the broom: narrow at the neck, splayed to the foot */
function radiusAt(y: number): number {
  const share = THREE.MathUtils.clamp((y - HEAD.from) / (HEAD.to - HEAD.from), 0, 1);
  return HEAD.neck + (HEAD.foot - HEAD.neck) * Math.pow(share, 1.4);
}

/** the straw: a flattened bundle swelling from the neck, and tufts splayed past its foot, their tips ragged (seeded) */
function strawGeometry(): THREE.BufferGeometry {
  const rows = 8, round = 14;
  const body = new THREE.CylinderGeometry(1, 1, 1, round, rows, true);
  const pos = body.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = HEAD.from + (pos.getY(i) + 0.5) * (HEAD.to - HEAD.from - 0.06), r = radiusAt(y);
    pos.setXYZ(i, pos.getX(i) * r, y, pos.getZ(i) * r * HEAD.flat);
  }
  body.computeVertexNormals();
  const random = mulberry(7);
  const tufts: THREE.BufferGeometry[] = [body];
  for (let k = 0; k < 22; k++) {
    const across = (k / 21) * 2 - 1, len = 0.07 + random() * 0.05, r = 0.012 + random() * 0.006;
    const tuft = new THREE.ConeGeometry(r, len, 4, 1).rotateX(Math.PI).translate(0, len / 2, 0);
    tuft.rotateZ(-across * 0.35 - (random() - 0.5) * 0.1);
    tuft.rotateX((random() - 0.5) * 0.25);
    tuft.translate(across * HEAD.foot * 0.9, HEAD.to - 0.07, (random() - 0.5) * HEAD.foot * HEAD.flat);
    tufts.push(tuft.toNonIndexed());
  }
  return mergeGeometries(tufts.map((t) => (t.index ? t.toNonIndexed() : t)));
}

/** a mesh of the broom's, named, casting */
function meshOf(name: string, geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  return mesh;
}
