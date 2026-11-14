// A hero's shadow cast in one draw. Each of his pieces drew itself again into the shadow map, its program and
// uniforms set anew for each (the warrior's 31 rigid casters, of the lobby's 153 shadow draws a frame, #270), though
// the shadow map draws them all with one depth material. Here the pieces that never change their shape are merged
// into one skinned mesh the shadow map alone draws, each piece bound to a bone of its own that is the piece itself:
// its vertices put where its mesh's world matrix puts them, as it would draw them, and none on a layer the camera
// doesn't see (the first person's hidden body). It draws with the skinned pieces' own depth material (`SKIN_DEPTH`),
// so it compiles nothing. Made again only when a piece is shown or hidden (the gear's) or the quality cuts it from
// casting or gives it back; a piece whose shape changes after all is let go of to cast on its own. `?castAsOne=0`
// casts each piece on its own, for A/B.
import * as THREE from 'three';
import { aroundShadows, inShadowsOnly, outOfShadowsOnly } from '../../world/culling';
import { SKIN_DEPTH } from './shapes';
import { coarseIndex, holdShadowsWhole, shadowDetailVersion } from './shadowDetail';

/** Whether the hero's pieces are cast as one (`?castAsOne=0`: each on its own; the lab's `shadows` flips it). */
export const castingAsOne = {
  on: typeof location === 'undefined' || !/[?&]castAsOne=0/.test(location.search),
  /** for a harness: every triangle cast, as it was (`shadowDetail.ts`); set here, as a commit from before it has
   *  this object and takes the property as nothing */
  set whole(held: boolean) { holdShadowsWhole(held); },
};

/** One hero's shadow cast as one: its mesh, and how many pieces it casts. */
export interface OneShadow {
  /** the mesh the shadow map draws in their place (none until the first shadow is drawn) */
  readonly mesh: THREE.SkinnedMesh | null;
  /** the pieces it casts, as shown now */
  readonly pieces: readonly THREE.Mesh[];
  /** how many times its mesh has been made (once, and again as a piece is shown or hidden) */
  readonly made: number;
  dispose(): void;
}

const NOTHING = (): void => {};

/** How many times a piece's positions have been marked changed (`castsAsOne` takes plain attributes alone). */
const versionOf = (piece: THREE.Mesh): number => (piece.geometry.attributes.position as THREE.BufferAttribute).version;

/** Whether `mesh` can be cast as one with the rest: a rigid mesh of one front-sided material, cast by the shadow map's
 *  own depth material, whose shape never changes (a cloth's, a bowstring's mark their positions as drawn anew). */
function castsAsOne(mesh: THREE.Mesh): boolean {
  const skinned = (mesh as THREE.SkinnedMesh).isSkinnedMesh;
  const instanced = (mesh as THREE.InstancedMesh).isInstancedMesh;
  if (!mesh.isMesh || skinned || instanced || mesh.morphTargetInfluences?.length) return false;
  if (!(mesh.userData.casts ?? mesh.castShadow)) return false;
  if (mesh.customDepthMaterial || mesh.customDistanceMaterial) return false;
  const material = mesh.material;
  if (Array.isArray(material) || material.side !== THREE.FrontSide || material.shadowSide !== null) return false;
  if (material.alphaTest > 0 || material.clipShadows) return false;
  const position = mesh.geometry.attributes.position;
  return position instanceof THREE.BufferAttribute && position.usage === THREE.StaticDrawUsage;
}

/** Whether `object` is shown as far up as `root` (and is under it). */
function shownUnder(object: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let at: THREE.Object3D | null = object; at; at = at.parent) {
    if (!at.visible) return false;
    if (at === root) return true;
  }
  return false;
}

/** The pieces' geometries in one, each piece's vertices bound wholly to its own bone (its place in `pieces`). */
function mergedOf(pieces: THREE.Mesh[]): THREE.BufferGeometry {
  let vertices = 0;
  let corners = 0;
  // (each piece's triangles as its shadow is cast from: fewer than it's drawn with, `shadowDetail.ts`)
  const coarse = pieces.map((piece) => coarseIndex(piece.geometry));
  pieces.forEach((piece, at) => {
    const geometry = piece.geometry;
    vertices += geometry.attributes.position.count;
    corners += coarse[at]?.length ?? (geometry.index ? geometry.index.count : geometry.attributes.position.count);
  });
  const positions = new Float32Array(vertices * 3);
  // (the bones' indices as floats: integers read by a float attribute make ANGLE compile a shader at the first draw)
  const bones = new Float32Array(vertices * 4);
  const weights = new Float32Array(vertices * 4);
  const index = new Uint32Array(corners);
  let vertex = 0;
  let corner = 0;
  pieces.forEach((piece, bone) => {
    const geometry = piece.geometry;
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      positions[(vertex + i) * 3] = position.getX(i);
      positions[(vertex + i) * 3 + 1] = position.getY(i);
      positions[(vertex + i) * 3 + 2] = position.getZ(i);
      bones[(vertex + i) * 4] = bone;
      weights[(vertex + i) * 4] = 1;
    }
    const own = geometry.index;
    const fewer = coarse[bone];
    const count = fewer ? fewer.length : own ? own.count : position.count;
    for (let i = 0; i < count; i++) index[corner + i] = vertex + (fewer ? fewer[i] : own ? own.getX(i) : i);
    vertex += position.count;
    corner += count;
  });
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('skinIndex', new THREE.BufferAttribute(bones, 4));
  merged.setAttribute('skinWeight', new THREE.BufferAttribute(weights, 4));
  merged.setIndex(new THREE.BufferAttribute(index, 1));
  return merged;
}

/** Whether `mesh` casts alone and can cast from fewer triangles: a mesh of one material that tests no alpha (a card
 *  cut by its picture has no triangles to spare), with no morphs. */
function castsCoarse(mesh: THREE.Mesh): boolean {
  if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || mesh.morphTargetInfluences?.length) return false;
  if (Array.isArray(mesh.material) || mesh.material.alphaTest > 0 || mesh.userData.shadowTwin) return false;
  return Boolean(mesh.userData.casts ?? mesh.castShadow);
}

/**
 * A twin of `mesh` the shadow map alone draws, of `index`'s triangles over the mesh's own vertices (its attributes are
 * the mesh's, so a cloth's moving points are its too), hung from it; a skinned one bound to the mesh's skeleton.
 */
function coarseTwin(mesh: THREE.Mesh, index: Uint32Array): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  for (const name of Object.keys(mesh.geometry.attributes)) geometry.setAttribute(name, mesh.geometry.attributes[name]);
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.boundingSphere = mesh.geometry.boundingSphere;
  geometry.boundingBox = mesh.geometry.boundingBox;
  const skinned = mesh as THREE.SkinnedMesh;
  let twin: THREE.Mesh;
  if (skinned.isSkinnedMesh) {
    const bound = new THREE.SkinnedMesh(geometry, mesh.material);
    bound.bindMode = skinned.bindMode;
    bound.bind(skinned.skeleton, skinned.bindMatrix);
    twin = bound;
  } else {
    twin = new THREE.Mesh(geometry, mesh.material);
  }
  twin.name = 'shadow cast coarse';
  twin.userData.shadowTwin = true;
  twin.customDepthMaterial = mesh.customDepthMaterial;
  twin.customDistanceMaterial = mesh.customDistanceMaterial;
  twin.castShadow = true;
  twin.receiveShadow = false;
  twin.frustumCulled = mesh.frustumCulled;
  twin.raycast = NOTHING;
  mesh.add(twin);
  inShadowsOnly(twin);
  return twin;
}

/**
 * `root`'s pieces cast as one (a hero's model): those `castsAsOne` takes, found now (gear is built whole and shown or
 * hidden: a piece added later casts on its own). Its mesh hangs from `holder`, out of the model: the first person
 * sorts the model's meshes into the body it hides and the arms it shows once, as it first shows them
 * (`entities/viewModel.ts`), and the mesh would be put on their layers.
 */
export function castAsOne(root: THREE.Object3D, holder: THREE.Object3D): OneShadow {
  const candidates: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (castsAsOne(object as THREE.Mesh)) candidates.push(object as THREE.Mesh);
  });
  const shown = candidates.map(() => false);
  /** each candidate's positions' version as it was merged: one that changes is let go of */
  const versions = new Map<THREE.Mesh, number>();
  let pieces: THREE.Mesh[] = [];
  let mesh: THREE.SkinnedMesh | null = null;
  let made = 0;
  /** the shadows' detail the mesh was made at (`shadowDetailVersion`): made again when it changes */
  let detail = -1;
  /** what casts alone and from fewer triangles, each with its twin (`coarseTwin`) */
  const twins = new Map<THREE.Mesh, THREE.Mesh>();

  const letTwinsGo = (): void => {
    for (const twin of twins.values()) {
      outOfShadowsOnly(twin);
      twin.removeFromParent();
    }
    twins.clear();
  };

  /** A twin for each mesh under `root` that casts alone and has triangles to spare. */
  const twin = (): void => {
    letTwinsGo();
    root.traverse((object) => {
      const alone = object as THREE.Mesh;
      if (!castsCoarse(alone) || pieces.includes(alone)) return;
      const index = coarseIndex(alone.geometry);
      if (index) twins.set(alone, coarseTwin(alone, index));
    });
  };

  const letGo = (): void => {
    if (!mesh) return;
    outOfShadowsOnly(mesh);
    holder.remove(mesh);
    mesh.geometry.dispose();
    mesh.skeleton.dispose();
    (mesh.material as THREE.Material).dispose();
    mesh = null;
  };

  /** Merged again of the candidates shown now. */
  const make = (): void => {
    letGo();
    pieces = candidates.filter((_, i) => shown[i]);
    versions.clear();
    for (const piece of pieces) versions.set(piece, versionOf(piece));
    detail = shadowDetailVersion();
    made++;
    twin();
    if (!pieces.length) return;
    // (each piece its own bone, its inverse none: a vertex goes where the piece's world matrix puts it)
    const skeleton = new THREE.Skeleton(pieces as unknown as THREE.Bone[], pieces.map(() => new THREE.Matrix4()));
    mesh = new THREE.SkinnedMesh(mergedOf(pieces), new THREE.MeshBasicMaterial());
    mesh.name = 'shadow cast as one';
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    mesh.customDepthMaterial = SKIN_DEPTH;
    // (nothing aims at it: three's own test would pose every vertex)
    mesh.raycast = NOTHING;
    holder.add(mesh);
    mesh.bind(skeleton, new THREE.Matrix4());
    inShadowsOnly(mesh);
    // (made as the shadow map draws, after it showed what it alone draws: shown for this draw too, or the gear's swap
    // left the hero without a shadow for a frame)
    mesh.visible = true;
  };

  /** Whether a piece shown has changed its shape since it was merged (it then casts on its own from now on). */
  const reshaped = (): boolean => {
    for (const piece of pieces) {
      if (versionOf(piece) === versions.get(piece)) continue;
      const name = piece.name || piece.uuid;
      if (import.meta.env.DEV) console.error(`castAsOne: ${name} changed its shape; it casts alone`);
      const at = candidates.indexOf(piece);
      candidates.splice(at, 1);
      shown.splice(at, 1);
      return true;
    }
    return false;
  };

  const around = (camera: THREE.Camera): (() => void) => {
    if (!castingAsOne.on || !shownUnder(root, holder)) {
      if (mesh) mesh.castShadow = castingAsOne.on;
      return NOTHING;
    }
    let changed = reshaped() || detail !== shadowDetailVersion();
    candidates.forEach((piece, i) => {
      // (a piece the quality cuts from casting is left out as one hidden: `applyShadowDetail`)
      const now = piece.castShadow && shownUnder(piece, root);
      if (now !== shown[i]) changed = true;
      shown[i] = now;
    });
    if (changed) make();
    // (each mesh cast alone gives way to its twin for the draw, on the layers it's on itself)
    const stoodIn: THREE.Mesh[] = [];
    for (const [alone, coarse] of twins) {
      coarse.castShadow = alone.castShadow && shownUnder(alone, root);
      coarse.layers.mask = alone.layers.mask;
      if (!coarse.castShadow) continue;
      alone.castShadow = false;
      stoodIn.push(alone);
    }
    const giveBack = (): void => {
      for (const alone of stoodIn) alone.castShadow = true;
    };
    if (!mesh) return giveBack;
    mesh.castShadow = true;
    // (each piece where its world matrix puts it, as drawn; one on a layer the camera doesn't see, the body through the
    // eyes, shrunk to its origin. Through its bone's inverse: three makes the bones' matrices again as it draws)
    const inverses = mesh.skeleton.boneInverses;
    pieces.forEach((piece, bone) => {
      if (piece.layers.test(camera.layers)) inverses[bone].identity();
      else inverses[bone].makeScale(0, 0, 0);
      piece.castShadow = false;
    });
    return () => {
      giveBack();
      for (const piece of pieces) piece.castShadow = true;
    };
  };
  const stop = aroundShadows(around);

  return {
    get mesh() { return mesh; },
    get pieces() { return pieces; },
    get made() { return made; },
    dispose() {
      stop();
      letTwinsGo();
      letGo();
    },
  };
}
