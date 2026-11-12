// The village's two ways out, each a place of its own beyond a gap in the palisade (data/village.ts `ENTRANCES`): the
// crypt's, a walled court of old graves ending at a mausoleum whose door opens on a stair down into the dark, its
// portal in the crypt's stone arch before the door; the Thornwood's, a path into a grove of the forest's own trees,
// ferns and mossy rocks, its portal between two great roots. Each is laid out in its own frame: x across its way, z back
// toward the village (its far end at -z), and bounded by what's built (walls a body is kept off, world/wall.ts).
import * as THREE from 'three';
import { ENTRANCES, GAP_HALF, portalPlace } from '../data/village';
import type { BiomeId } from '../data/biomes';
import { ashlar, pbrMaterialMaps, rock } from '../core/textures';
import { seeThrough } from '../core/seeThrough';
import { mulberry, TAU } from '../util';
import { boulderGeo, boxWithUV, setInstance, type Portal, type Updater } from './props';
import { buildGate } from './crypt';
import { buildRootGate, rootGateMats } from './forest';
import { fernClumpGeo, fernTexture } from './foliage';
import { PODIUM, TOMB, WAY } from './villagePlan';
import type { Wall } from './wall';

/** what the ways are built of: the village's own materials */
export interface WayMats {
  flags: THREE.Material; coping: THREE.Material; column: THREE.Material; iron: THREE.Material;
  glass: THREE.Material;
}

/** the court's walls: their height, thickness, and how far in from the gap's edge they stand */
const COURT = { high: 1.3, thick: 0.5, inset: 0.3 };

/** A way's frame: a group at its gap, its -z leading out. */
function frameOf(id: BiomeId): THREE.Group {
  const { gap, out } = ENTRANCES[id];
  const g = new THREE.Group();
  g.position.set(gap[0], 0, gap[1]);
  g.rotation.y = Math.atan2(-out[0], -out[1]);
  g.updateMatrixWorld(true);
  return g;
}

/** A box in a way's frame, from its foot `y0`, casting and taking shadows. */
function box(g: THREE.Object3D, w: number, h: number, d: number, x: number, y0: number, z: number, m: THREE.Material,
  texel = 0.5): THREE.Mesh {
  const mesh = new THREE.Mesh(boxWithUV(w, h, d, texel), m);
  mesh.position.set(x, y0 + h / 2, z);
  mesh.castShadow = mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}

/** A box in a way's frame between two distances out along it (`out0` to `out1`, m), its middle `x` across. */
function boxOut(g: THREE.Object3D, w: number, y0: number, h: number, out0: number, out1: number, x: number,
  m: THREE.Material, texel = 0.5): THREE.Mesh {
  return box(g, w, h, out1 - out0, x, y0, -(out0 + out1) / 2, m, texel);
}

/** Walls a body is kept off along `points` (in the frame of `g`), each stretch a slab `high` m tall; drawn in `m`, or
 *  unseen (`m` null: the grove's edge, which its trees and rocks show). */
function keepOff(g: THREE.Object3D, wall: Wall, points: readonly [number, number][], high: number, thick: number,
  m: THREE.Material | null): THREE.Mesh[] {
  const slabs: THREE.Mesh[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const [x0, z0] = points[i], [x1, z1] = points[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const slab = box(g, thick, high, len + thick, (x0 + x1) / 2, 0, (z0 + z1) / 2, m ?? new THREE.MeshBasicMaterial(), 0.5);
    slab.rotation.y = Math.atan2(x1 - x0, z1 - z0);
    if (!m) {
      slab.visible = false;
      slab.castShadow = false;
    }
    slab.updateMatrixWorld(true);
    wall.add(slab, true, 'wall', true);
    slabs.push(slab);
  }
  return slabs;
}

/** An unseen wall across way `id` through its portal, `half` m either side: from play, "for village portals, I
 *  should not be able to walk past them" (round them, and through, he walked on to the court and grove behind). */
function barPast(g: THREE.Object3D, wall: Wall, id: BiomeId, half: number): void {
  const at = -ENTRANCES[id].portalOut;
  keepOff(g, wall, [[-half, at], [half, at]], 2.2, 0.4, null);
}

// --- the crypt's way ------------------------------------------------------------------------------------------------

/** The crypt's way: its court, graves, the mausoleum and its door down, the crypt's arch with its portal before it. */
export function buildCryptWay(scene: THREE.Object3D, wall: Wall, M: WayMats, updaters: Updater[]): Portal {
  const g = frameOf('crypt');
  const rng = mulberry(313);
  // the crypt's own dark stone, and its roof's darker slabs, both on the village's ashlar's maps and programs
  const maps = pbrMaterialMaps(ashlar(21, 6, 3), 1, 1.2);
  const stone = seeThrough(new THREE.MeshStandardMaterial({ ...maps, color: 0x77716c }), 'prop');
  const slate = seeThrough(new THREE.MeshStandardMaterial({ ...maps, color: 0x4a4744 }), 'prop');
  const dark = new THREE.MeshStandardMaterial({ color: 0x040405, roughness: 1 });
  const across = GAP_HALF - COURT.inset, court = PODIUM.front;
  // the court: paved, its walls running out from the gap to the mausoleum's podium, iron spikes along their tops
  const paving = new THREE.Mesh(new THREE.PlaneGeometry(across * 2, court + 1).rotateX(-Math.PI / 2), M.flags);
  const uv = paving.geometry.attributes.uv;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * across * 2 / 2.25, uv.getY(k) * (court + 1) / 2.25);
  paving.position.set(0, 0.014, -(court - 1) / 2);
  paving.receiveShadow = true;
  g.add(paving);
  for (const s of [-1, 1]) {
    keepOff(g, wall, [[s * across, 0.8], [s * (across + 0.3), -court - 0.2]], COURT.high, COURT.thick, stone);
    const spikes = new THREE.InstancedMesh(new THREE.ConeGeometry(0.03, 0.55, 4).translate(0, 0.27, 0), M.iron, 16);
    for (let k = 0; k < 16; k++) {
      const t = k / 15, z = 0.6 - t * (court + 0.6);
      setInstance(spikes, k, s * (across + 0.3 * t), COURT.high, z, 0, 0, 0, 1);
    }
    spikes.castShadow = true;
    g.add(spikes);
  }
  // old graves along the court's sides, leaning
  for (let k = 0; k < 4; k++) {
    const s = k % 2 ? 1 : -1, z = -1.6 - Math.floor(k / 2) * 2.2;
    const stoneSlab = box(g, 0.7, 0.9 + rng() * 0.3, 0.16, s * (across - 0.9), -0.05, z, stone, 0.4);
    stoneSlab.rotation.set((rng() - 0.5) * 0.25, (rng() - 0.5) * 0.4, (rng() - 0.5) * 0.2);
  }
  buildTomb(g, wall, M, stone, slate, dark);
  barPast(g, wall, 'crypt', across + 0.6);
  scene.add(g);
  return buildGate(scene, wall, 0, stone, M.iron, updaters, portalPlace('crypt'));
}

/** The mausoleum at the court's end: a stair up onto its podium, a porch of four columns under its pediment, a body of
 *  dark stone buttressed down its sides with slit windows between, a pitched roof of stone slabs, and its door, its
 *  iron leaves open, on a stair going down inside into the dark, a torch on its wall. Bodies meet all of it. */
function buildTomb(g: THREE.Object3D, wall: Wall, M: WayMats, stone: THREE.Material, slate: THREE.Material,
  dark: THREE.Material): void {
  const { door, back, w, eave, roof, doorHalf, doorHigh, well } = TOMB;
  const P = PODIUM.high, half = w / 2, podiumHalf = half + 0.7;
  const tomb = new THREE.Group();
  g.add(tomb);
  // the stair up from the court, its steps as wide as the porch's middle columns are apart
  for (let k = 0; k < TOMB.steps; k++) {
    const out0 = TOMB.stairFoot + k * TOMB.tread;
    boxOut(tomb, 5.4, 0, (k + 1) * TOMB.rise, out0, out0 + TOMB.tread + 0.02, 0, M.coping, 0.4);
  }
  // the podium: under the porch, and round the stair down (which it leaves open)
  boxOut(tomb, podiumHalf * 2, 0, P, PODIUM.front, door, 0, stone);
  for (const s of [-1, 1]) {
    const wide = podiumHalf - doorHalf;
    boxOut(tomb, wide, 0, P, door, back + 0.7, s * (doorHalf + wide / 2), stone);
  }
  boxOut(tomb, doorHalf * 2, 0, P, door + well, back + 0.7, 0, stone);
  // the body: its walls either side of the stair down, over it, and behind its foot (dark, where it goes on down)
  for (const s of [-1, 1]) boxOut(tomb, half - doorHalf, P, eave - P, door, back, s * (doorHalf + (half - doorHalf) / 2), stone);
  boxOut(tomb, doorHalf * 2, P + doorHigh, eave - P - doorHigh, door, back, 0, stone);
  boxOut(tomb, doorHalf * 2, 0, P + doorHigh, door + well, back, 0, dark);
  // the stair down: from the threshold to the floor at the ground's level, each step darker; the floor on to the dark
  const down = TOMB.steps - 1, tread = 0.62;
  for (let k = 0; k < down; k++) {
    const shade = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x5a5652).multiplyScalar(0.8 - k * 0.17), roughness: 0.95 });
    boxOut(tomb, doorHalf * 2, 0, P - (k + 1) * TOMB.rise, door + k * tread, door + (k + 1) * tread, 0, shade, 0.4);
  }
  boxOut(tomb, doorHalf * 2, 0, 0.02, door + down * tread, door + well, 0, dark);
  // its iron doors, swung in against the stair's walls
  for (const s of [-1, 1]) {
    const leaf = boxOut(tomb, 0.08, P, doorHigh - 0.1, door + 0.05, door + doorHalf - 0.05, s * (doorHalf - 0.08), M.iron, 0.4);
    leaf.rotation.y = s * 0.12;
  }
  // a torch on the stair's wall, half way down
  const torchAt = door + 1.7;
  boxOut(tomb, 0.18, P + 1.3, 0.1, torchAt - 0.04, torchAt + 0.04, -doorHalf + 0.09, M.iron, 0.4);
  const torch = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.4, 6), M.iron);
  torch.position.set(-doorHalf + 0.16, P + 1.55, -torchAt);
  torch.rotation.z = -0.35;
  tomb.add(torch);
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6).scale(1, 2, 1), M.glass);
  flame.position.set(-doorHalf + 0.24, P + 1.86, -torchAt);
  tomb.add(flame);
  // the doorway: jambs proud of the wall, a lintel stone, an epitaph's dark slab over it
  for (const s of [-1, 1]) boxOut(tomb, 0.32, P, doorHigh + 0.1, door - 0.18, door, s * (doorHalf + 0.16), M.coping, 0.4);
  boxOut(tomb, doorHalf * 2 + 1, P + doorHigh, 0.5, door - 0.22, door, 0, M.coping, 0.4);
  boxOut(tomb, 2.2, P + doorHigh + 0.75, 0.5, door - 0.04, door, 0, dark, 0.4);
  // buttresses down each side, slit windows between them
  for (const s of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      const at = door + 0.8 + k * 2.6;
      boxOut(tomb, 0.7, P, eave - P - 0.5, at - 0.4, at + 0.4, s * (half + 0.35), stone);
      if (k < 3) boxOut(tomb, 0.06, P + 1.6, 1.5, at + 1.15, at + 1.45, s * (half + 0.02), dark, 0.4);
    }
  }
  // the porch: four columns on the podium under a beam, the door's face behind them
  const colAt = PODIUM.front + 0.5, beam = 0.7;
  for (const x of [-3.6, -1.9, 1.9, 3.6]) {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, eave - beam - P, 14), M.column);
    shaft.position.set(x, P + (eave - beam - P) / 2, -colAt);
    shaft.castShadow = shaft.receiveShadow = true;
    tomb.add(shaft);
    boxOut(tomb, 0.8, P, 0.18, colAt - 0.4, colAt + 0.4, x, M.coping, 0.4);
  }
  boxOut(tomb, w + 0.6, eave - beam, beam, PODIUM.front + 0.1, door, 0, M.coping, 0.4);
  // the roof: two pitched slabs over the porch and the body, a ridge, and a pediment at each end
  const span = half + 0.6, slope = Math.atan2(roof, span), length = Math.hypot(span, roof);
  const from = PODIUM.front - 0.2, to = back + 0.5;
  for (const s of [-1, 1]) {
    const slab = boxOut(tomb, length, 0, 0.3, from, to, 0, slate, 0.5);
    slab.position.set(s * span / 2, eave + roof / 2 + 0.12, -(from + to) / 2);
    slab.rotation.z = -s * slope;
  }
  boxOut(tomb, 0.36, eave + roof, 0.3, from, to, 0, M.coping, 0.4);
  const gable = new THREE.Shape();
  gable.moveTo(-span + 0.15, 0);
  gable.lineTo(span - 0.15, 0);
  gable.lineTo(0, roof - 0.1);
  gable.lineTo(-span + 0.15, 0);
  for (const at of [from + 0.25, to - 0.25]) {
    const pediment = new THREE.Mesh(new THREE.ExtrudeGeometry(gable, { depth: 0.4, bevelEnabled: false }).translate(0, 0, -0.2), stone);
    pediment.position.set(0, eave, -at);
    pediment.castShadow = pediment.receiveShadow = true;
    tomb.add(pediment);
    const finial = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.9, 4).rotateY(Math.PI / 4), M.coping);
    finial.position.set(0, eave + roof + 0.5, -at);
    finial.castShadow = true;
    tomb.add(finial);
  }
  // candles burning on the porch, either side of the door
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const x = s * (doorHalf + 0.55 + k * 0.22), tall = 0.2 + ((k * 7) % 3) * 0.08;
      const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, tall, 8), M.coping);
      candle.position.set(x, P + tall / 2, -(door - 0.5));
      tomb.add(candle);
      const candleFlame = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6).scale(1, 2.2, 1), M.glass);
      candleFlame.position.set(x, P + tall + 0.06, -(door - 0.5));
      tomb.add(candleFlame);
    }
  }
  tomb.updateMatrixWorld(true);
  wall.add(tomb, true);
}

// --- the Thornwood's way --------------------------------------------------------------------------------------------

/** the grove's edge, a body kept off it: from the gap out round the portal and back (x across, z out as -z) */
const GROVE_EDGE: readonly [number, number][] = [
  [-(GAP_HALF - 0.3), 0.8], [-4.8, -3], [-5.2, -8], [-3.6, -WAY.forest.out + 0.6], [3.6, -WAY.forest.out + 0.6], [5.2, -8], [4.8, -3],
  [GAP_HALF - 0.3, 0.8],
];

/** The Thornwood's way: a grove round a path, its edge kept, rocks, ferns and its root gate with the portal; its trees
 *  are the village's (`groveTrees`). */
export function buildForestWay(scene: THREE.Object3D, wall: Wall, updaters: Updater[]): Portal {
  const g = frameOf('forest');
  const rng = mulberry(717);
  keepOff(g, wall, GROVE_EDGE, 2.2, 0.4, null);
  barPast(g, wall, 'forest', 5.6);
  const rockMat = seeThrough(new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(rock(17), 1, 1.6), color: 0x8a967a, roughness: 0.95 }), 'prop');
  // mossy rocks along the edge, half sunk
  const rocks = new THREE.InstancedMesh(boulderGeo(9, 1), rockMat, 9);
  for (let k = 0; k < 9; k++) {
    const s = k % 2 ? 1 : -1, z = -0.5 - k * 1.15;
    const size = 0.5 + rng() * 0.6;
    setInstance(rocks, k, s * (4.9 + rng() * 0.9), -0.15, z, 0, rng() * TAU, 0, size * 1.2, size * 0.8, size);
  }
  rocks.castShadow = rocks.receiveShadow = true;
  g.add(rocks);
  // ferns under the trees, either side of the path and round the gate
  const fernMat = seeThrough(new THREE.MeshStandardMaterial({ map: fernTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 }), 'prop');
  const ferns = new THREE.InstancedMesh(fernClumpGeo(rng), fernMat, 40);
  for (let k = 0; k < 40; k++) {
    const s = k % 2 ? 1 : -1, z = 0.4 - rng() * (WAY.forest.out + 1);
    const x = s * (3.4 + rng() * 2.6);
    const size = 0.7 + rng() * 0.6;
    setInstance(ferns, k, x, 0, z, 0, rng() * TAU, 0, size);
  }
  ferns.receiveShadow = true;
  g.add(ferns);
  scene.add(g);
  return buildRootGate(scene, wall, 0, rockMat, rootGateMats(), rng, updaters, portalPlace('forest'));
}

/** The grove's trees (x, z in the village's frame): close round the path either side and behind the gate. */
export function groveTrees(): [number, number][] {
  const rng = mulberry(4501);
  const { gap, out } = ENTRANCES.forest;
  const spots: [number, number][] = [];
  const place = (x: number, zOut: number): void => {
    // (the frame's x across: the way out turned a quarter to its right)
    const at: [number, number] = [gap[0] + out[0] * zOut + out[1] * x, gap[1] + out[1] * zOut - out[0] * x];
    // (none on the camera's side of the path near it: the top view looks north, and their trunks stood over the hero)
    if (at[1] > gap[1] + out[1] * zOut + 2 && zOut < WAY.forest.out) return;
    spots.push(at);
  };
  for (let k = 0; k < 12; k++) {
    const s = k % 2 ? 1 : -1;
    place(s * (6.2 + rng() * 3.2), 1 + k * 1.1 + rng() * 0.8);
  }
  for (let k = 0; k < 6; k++) place(-6 + k * 2.4 + rng() * 0.8, WAY.forest.out + 1.5 + rng() * 2.5);
  return spots;
}
