// meshoptimizer's builds in three's addons (r187), as much of them as core/meshlets.worker.ts uses: three ships them
// untyped.

declare module 'three/addons/libs/meshopt_clusterizer.module.js' {
  /** a level's clusters, packed */
  export interface Meshlets { meshletCount: number }
  /** a cluster's bounding sphere and normal cone */
  export interface MeshletBounds {
    centerX: number; centerY: number; centerZ: number; radius: number;
    coneAxisX: number; coneAxisY: number; coneAxisZ: number; coneCutoff: number;
  }
  export const MeshoptClusterizer: {
    ready: Promise<void>;
    buildMeshlets(indices: Uint32Array, positions: Float32Array, stride: number, maxVertices: number,
      maxTriangles: number, coneWeight: number): Meshlets;
    computeMeshletBounds(meshlets: Meshlets, positions: Float32Array, stride: number): MeshletBounds[];
    extractMeshlet(meshlets: Meshlets, index: number): { vertices: Uint32Array; triangles: Uint8Array };
  };
}

declare module 'three/addons/libs/meshopt_simplifier.module.js' {
  /** the indices kept and the error made */
  type Simplified = [Uint32Array, number];
  export const MeshoptSimplifier: {
    ready: Promise<void>;
    getScale(positions: Float32Array, stride: number): number;
    simplifyWithAttributes(indices: Uint32Array, positions: Float32Array, stride: number, attributes: Float32Array,
      attributeStride: number, weights: number[], locks: null, targetIndexCount: number, targetError: number,
      flags: string[]): Simplified;
    simplifySloppy(indices: Uint32Array, positions: Float32Array, stride: number, locks: null,
      targetIndexCount: number, targetError: number): Simplified;
  };
}
