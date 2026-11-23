// `lab rust --census` and its heaviest meshes: the shown materials by their kind and by what each asks beyond the
// engine's reach, and the meshes that cost the frame most of its triangles.
import * as THREE from 'three';

/** how many of the meshes in view the census lists by their triangles */
const HEAVIEST = 16;

/** what a material may carry that the engine doesn't read: three's nodes, a shader patched as it compiles */
const BEYOND = [
  'colorNode', 'opacityNode', 'positionNode', 'normalNode', 'emissiveNode', 'roughnessNode', 'fragmentNode',
  'outputNode', 'alphaTestNode', 'maskNode', 'vertexNode', 'alphaMap', 'aoMap', 'lightMap', 'envMap',
];

/** The shown meshes' materials by kind and by what they carry beyond the engine's reach, the most first. */
export function census(scene: THREE.Object3D, camera: THREE.Camera): string[] {
  const kinds = new Map<string, { meshes: number; names: Set<string> }>();
  const visit = (object: THREE.Object3D): void => {
    if (!object.visible) return;
    const mesh = object as THREE.Mesh;
    if ((mesh.isMesh || (object as THREE.Points).isPoints || (object as THREE.Sprite).isSprite) && object.layers.test(camera.layers)) {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        const carried = BEYOND.filter((name) => (material as unknown as Record<string, unknown>)[name]);
        const patched = Object.hasOwn(material, 'onBeforeCompile') ? ['onBeforeCompile'] : [];
        const blends = material.transparent ? [`transparent${material.blending === 2 ? ' additive' : ''}`] : [];
        const kind = `${object.type} ${material.type} [${[...blends, ...patched, ...carried].join(', ')}]`;
        const entry = kinds.get(kind) ?? { meshes: 0, names: new Set<string>() };
        entry.meshes++;
        if (entry.names.size < 4) entry.names.add(material.name || object.name || object.parent?.name || '?');
        kinds.set(kind, entry);
      }
    }
    object.children.forEach(visit);
  };
  visit(scene);
  const rows = [...kinds].sort((a, b) => b[1].meshes - a[1].meshes);
  const row = ([kind, entry]: (typeof rows)[number]): string =>
    `    ${entry.meshes} x ${kind} (${[...entry.names].join(', ')})`;
  return ['  the materials of the meshes shown:', ...rows.map(row)];
}

/** What a mesh's material asks that a clustered mesh can't give yet: none, it could be drawn as clusters. */
function unclustered(mesh: THREE.Mesh): string {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const asks: string[] = [];
  if ((mesh as unknown as THREE.SkinnedMesh).isSkinnedMesh) asks.push('skinned');
  if (materials.some((material) => material.transparent)) asks.push('blended');
  if (materials.some((material) => material.alphaTest > 0 || (material as THREE.MeshStandardMaterial).alphaMap)) asks.push('cut out');
  if (materials.some((material) => (material as unknown as Record<string, unknown>).positionNode)) asks.push('moved by its look');
  return asks.join(', ');
}

/**
 * The meshes in the camera's view by their triangles (an instanced mesh's, all its instances'), the heaviest
 * first, each with what keeps it from being drawn as clusters; and how many triangles nothing keeps.
 */
export function heaviest(scene: THREE.Object3D, camera: THREE.Camera): string[] {
  const view = new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  const found: { name: string; triangles: number; asks: string }[] = [];
  const visit = (object: THREE.Object3D): void => {
    if (!object.visible) return;
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && object.layers.test(camera.layers) && mesh.geometry?.attributes.position) {
      const instances = (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh).count : 1;
      const inView = instances > 1 || !mesh.frustumCulled || view.intersectsObject(mesh);
      const corners = mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count;
      const name = mesh.name || mesh.parent?.name || mesh.parent?.parent?.name || '?';
      if (inView) found.push({ name: instances > 1 ? `${name} x${instances}` : name, triangles: corners / 3 * instances, asks: unclustered(mesh) });
    }
    object.children.forEach(visit);
  };
  visit(scene);
  found.sort((a, b) => b.triangles - a.triangles);
  const sum = (some: typeof found): number => Math.round(some.reduce((total, one) => total + one.triangles, 0));
  const free = found.filter((one) => !one.asks);
  const rows = found.slice(0, HEAVIEST).map((one) => `    ${Math.round(one.triangles)} ${one.name}${one.asks ? ` (${one.asks})` : ''}`);
  return [
    `  the meshes in view by their triangles: ${found.length} meshes, ${sum(found)} triangles; ${free.length} meshes of ${sum(free)} `
      + 'triangles could be drawn as clusters (not skinned, blended, cut out or moved by their look)',
    ...rows,
  ];
}
