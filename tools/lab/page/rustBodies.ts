// The scene's bodies for `lab rust`: everything that stands on a skeleton (a hero, the ghost, a training dummy, a
// foe drawn alone), counted by what a frame's walk meets of it, and hidden whole for `--nobody`, so what the bodies
// cost a frame is the difference of two runs. Counted before anything is built for them: the scene the engine keeps
// (last-stand#828) was built before its share of the frame was known, and moved nothing.
import * as THREE from 'three';

/** A body's root: the first thing above its skeleton's first bone that isn't a bone (its rigid pieces hang on its
 *  bones, so they're under it too). */
function rootOf(skeleton: THREE.Skeleton): THREE.Object3D | null {
  let above: THREE.Object3D | null = skeleton.bones[0] ?? null;
  while (above && (above as THREE.Bone).isBone) above = above.parent;
  return above;
}

/** Every shown body's root in the scene. */
function bodies(scene: THREE.Scene): Set<THREE.Object3D> {
  const roots = new Set<THREE.Object3D>();
  scene.traverseVisible((object) => {
    const skinned = object as THREE.SkinnedMesh;
    const root = skinned.isSkinnedMesh && skinned.skeleton ? rootOf(skinned.skeleton) : null;
    if (root) roots.add(root);
  });
  // (a body inside another's root is that one's: a hero's hands have a skeleton of their own)
  for (const root of [...roots]) {
    for (let above = root.parent; above; above = above.parent) {
      if (roots.has(above)) roots.delete(root);
    }
  }
  return roots;
}

/** What a frame's walk meets of the bodies: how many, their shown meshes (those moved by bones, those hung on a
 *  joint), their materials, their joints. */
export function bodiesSaid(scene: THREE.Scene): string {
  const roots = bodies(scene);
  const materials = new Set<THREE.Material>();
  const joints = new Set<THREE.Object3D>();
  let skinned = 0;
  let hung = 0;
  for (const root of roots) {
    root.traverseVisible((object) => {
      const mesh = object as THREE.SkinnedMesh;
      if (!mesh.isMesh) return;
      for (const material of [mesh.material].flat()) materials.add(material);
      if (mesh.isSkinnedMesh) {
        skinned++;
        for (const bone of mesh.skeleton.bones) joints.add(bone);
      } else {
        hung++;
        if (mesh.parent) joints.add(mesh.parent);
      }
    });
  }
  return `the bodies on skeletons: ${roots.size}, their shown meshes ${skinned + hung} (${skinned} moved by bones, `
    + `${hung} hung on a joint), ${materials.size} materials, ${joints.size} joints`;
}

/** Every body hidden, and how many. */
export function hideBodies(scene: THREE.Scene): number {
  const roots = bodies(scene);
  for (const root of roots) root.visible = false;
  return roots.size;
}
