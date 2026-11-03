// The breakable props' shadows cast as one: a biome's standing breakables (`userData.noBake`, `world/destructible.ts`)
// merged into one mesh for each way their faces cast (a material's side), which the shadow maps alone draw, as
// `bakeStaticShadows` merges the props that never go. Each cast for itself, the sun's shadow map drew every one each
// frame: 32 of the forest lobby's 93 shadow draws, about 11 µs of the frame's JS a draw on WebGPU. A prop that breaks
// or comes back has its stretches of the casters put away or back (`refresh`, by the props' revision); props built
// again or moved make the casters again.
import * as THREE from 'three';
import { inShadowsOnly, outOfShadowsOnly } from './culling';

/** a stretch of one caster: a piece of a breakable mesh (a material's group of it), its vertices from `start` */
interface Stretch {
  caster: THREE.Mesh;
  start: number;
  /** its vertices where its mesh stands, put back as it's shown again */
  positions: Float32Array;
}

/** a breakable mesh within the casters: what it was made from, and its stretches */
interface Held {
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  placed: THREE.Matrix4;
  stretches: Stretch[];
  shown: boolean;
}

/** The breakable props' shadows of one biome cast as one: `refresh` as its props' revision changes. */
export interface BreakableShadows {
  /** each prop's stretches put away or back as it's shown, the casters made again if the props changed */
  refresh(): void;
}

/** a piece of a mesh to cast: its material's sides, and its vertices where it stands */
export interface Piece {
  side: THREE.Side;
  shadowSide: THREE.Side | null;
  positions: Float32Array;
}

/** Whether `mesh` can cast within the casters: a breakable's plain mesh casting a solid shadow (an instanced one
 *  hides an instance, a skinned one moves, an alpha-tested or custom-depth one casts a shape of its own). */
function castsWithin(mesh: THREE.Mesh): boolean {
  if (!mesh.isMesh || !mesh.userData.noBake) return false;
  if (!mesh.castShadow && !mesh.userData.castsWithin) return false;
  if ((mesh as THREE.InstancedMesh).isInstancedMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh) return false;
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return materials.every((material) => material.alphaTest === 0) && !mesh.customDepthMaterial;
}

/** Whether `object` is shown within `group`: it and every parent up to the group. */
function shownIn(object: THREE.Object3D, group: THREE.Object3D): boolean {
  for (let at: THREE.Object3D | null = object; at && at !== group; at = at.parent) {
    if (!at.visible) return false;
  }
  return true;
}

/** The breakable meshes of `group` that cast within the casters, their world matrices up to date. */
function castersIn(group: THREE.Group): THREE.Mesh[] {
  group.updateMatrixWorld(true);
  const found: THREE.Mesh[] = [];
  group.traverse((object) => {
    if (castsWithin(object as THREE.Mesh)) found.push(object as THREE.Mesh);
  });
  return found;
}

/** `mesh`'s pieces: each material's group of it (or the whole), unindexed, where it stands in the world. */
export function piecesOf(mesh: THREE.Mesh): Piece[] {
  const positions = new THREE.BufferGeometry().setAttribute('position', mesh.geometry.getAttribute('position'));
  positions.setIndex(mesh.geometry.getIndex());
  const placed = (positions.index ? positions.toNonIndexed() : positions.clone()).applyMatrix4(mesh.matrixWorld);
  const all = placed.getAttribute('position').array as Float32Array;
  placed.dispose();
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const groups = Array.isArray(mesh.material) && mesh.geometry.groups.length
    ? mesh.geometry.groups
    : [{ start: 0, count: all.length / 3, materialIndex: 0 }];
  return groups.map((group) => {
    const material = materials[group.materialIndex ?? 0];
    // (a group's start and count are its index's, which the unindexed copy keeps in order)
    const positions = all.slice(group.start * 3, (group.start + Math.min(group.count, all.length / 3)) * 3);
    return { side: material.side, shadowSide: material.shadowSide, positions };
  });
}

/** Whether `held` still hold `casters` as they stand: the same meshes, geometries and places. */
function stillHeld(held: Held[], casters: THREE.Mesh[]): boolean {
  if (held.length !== casters.length) return false;
  return held.every((one, i) => one.mesh === casters[i] && one.geometry === casters[i].geometry
    && one.placed.equals(casters[i].matrixWorld));
}

/** `pieces` sorted by the way their faces cast (`side`, `shadowSide`): what each caster of them draws. */
export function bySide(pieces: Piece[]): { side: THREE.Side; shadowSide: THREE.Side | null; pieces: Piece[] }[] {
  const sides = new Map<string, { side: THREE.Side; shadowSide: THREE.Side | null; pieces: Piece[] }>();
  for (const piece of pieces) {
    const key = `${piece.side} ${piece.shadowSide}`;
    if (!sides.has(key)) sides.set(key, { side: piece.side, shadowSide: piece.shadowSide, pieces: [] });
    sides.get(key)!.pieces.push(piece);
  }
  return [...sides.values()];
}

/** What a caster of pieces of `side` draws with: depth alone, its faces cast as theirs. */
export function casterMaterial(side: THREE.Side, shadowSide: THREE.Side | null): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side });
  material.shadowSide = shadowSide;
  return material;
}

/** The breakable props' shadows of `group` (a biome's) cast as one mesh a side, made as it's built. */
export function castBreakablesAsOne(group: THREE.Group): BreakableShadows {
  let casters: THREE.Mesh[] = [];
  let held: Held[] = [];

  const letGo = (): void => {
    for (const caster of casters) {
      group.remove(caster);
      outOfShadowsOnly(caster);
      caster.geometry.dispose();
      (caster.material as THREE.Material).dispose();
    }
    casters = [];
    held = [];
  };

  const make = (meshes: THREE.Mesh[]): void => {
    letGo();
    const piecesByMesh = meshes.map(piecesOf);
    const where = new Map<Piece, Stretch>();
    for (const { side, shadowSide, pieces } of bySide(piecesByMesh.flat())) {
      const length = pieces.reduce((sum, piece) => sum + piece.positions.length, 0);
      const values = new Float32Array(length);
      const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(values, 3));
      const caster = new THREE.Mesh(geometry, casterMaterial(side, shadowSide));
      let at = 0;
      for (const piece of pieces) {
        values.set(piece.positions, at);
        where.set(piece, { caster, start: at, positions: piece.positions });
        at += piece.positions.length;
      }
      geometry.computeBoundingSphere();
      caster.castShadow = true;
      caster.name = `${group.name} breakables' shadow caster`;
      caster.matrixAutoUpdate = false;
      inShadowsOnly(caster);
      group.add(caster);
      casters.push(caster);
    }
    meshes.forEach((mesh, i) => {
      const stretches = piecesByMesh[i].map((piece) => where.get(piece)!);
      held.push({ mesh, geometry: mesh.geometry, placed: mesh.matrixWorld.clone(), stretches, shown: true });
      // (its own shadow left to the casters; `castsWithin` finds it again by this)
      mesh.castShadow = false;
      mesh.userData.castsWithin = true;
    });
  };

  /** each mesh's stretches put away (on one point) or back as it's shown */
  const showStretches = (): void => {
    for (const one of held) {
      const shown = shownIn(one.mesh, group);
      if (shown === one.shown) continue;
      one.shown = shown;
      for (const stretch of one.stretches) {
        const position = stretch.caster.geometry.getAttribute('position') as THREE.BufferAttribute;
        const values = position.array as Float32Array;
        if (shown) values.set(stretch.positions, stretch.start);
        else values.fill(0, stretch.start, stretch.start + stretch.positions.length);
        position.addUpdateRange(stretch.start, stretch.positions.length);
        position.needsUpdate = true;
      }
    }
  };

  make(castersIn(group));
  return {
    refresh() {
      const meshes = castersIn(group);
      if (!stillHeld(held, meshes)) make(meshes);
      showStretches();
    },
  };
}
