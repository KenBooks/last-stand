// The lamps' shadows drawn once (`core/lamps.ts` reads them): for each lamp in the list, six faces round it, the
// distance from it to the nearest thing that stands still in each texel, as a point light's cube holds it. Lamps and
// what stands round them never move, so it's drawn at boot, as the village is built, and never again: two lamps cast
// by the pool's casting lights, and lit by the list alone the rest lit through all that stood round them (from play,
// "your light test for each light need to test SHADOW, it was missing for half of them"). What's drawn is what casts
// as the world is built (the merged caster the shadow maps alone draw, the instanced posts and trunks); a leaf card,
// which casts by its picture's alpha, is left out (drawn whole, it would cast a square).
import * as THREE from 'three';
import { lampAtlasTexture, lampShadowMap, setLampShadows, SHADOW_COLUMNS, SHADOW_TILE, type LampPlace } from '../core/lamps';
import { lampDistanceMaterial } from '../core/lampNodes';
import { pipelinesAtOnce, WEBGPU } from '../core/webgpu';
import { drawnInShadowsOnly } from './culling';

/** what's nearer a lamp than this casts nothing (m): its own lantern's frame and panes round its flame */
const NEAR = 0.3;

/** A face's camera at the lamp looks along its axis, up the world's up or, for the faces up and down, its z (as
 *  `lampFaceAxis` in `core/lamps.ts` finds a face). */
const FACES: { axis: THREE.Vector3; up: THREE.Vector3 }[] = [
  { axis: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0) },
  { axis: new THREE.Vector3(-1, 0, 0), up: new THREE.Vector3(0, 1, 0) },
  { axis: new THREE.Vector3(0, 1, 0), up: new THREE.Vector3(0, 0, 1) },
  { axis: new THREE.Vector3(0, -1, 0), up: new THREE.Vector3(0, 0, 1) },
  { axis: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0) },
  { axis: new THREE.Vector3(0, 0, -1), up: new THREE.Vector3(0, 1, 0) },
];

/** Each texel the distance from the lamp (m) to what it meets nearest. */
const distanceMaterial = (): THREE.ShaderMaterial => new THREE.ShaderMaterial({
  uniforms: { lampAt: { value: new THREE.Vector3() } },
  vertexShader: `
    varying vec3 vWorld;
    void main() {
      vec4 local = vec4( position, 1.0 );
      #ifdef USE_INSTANCING
        local = instanceMatrix * local;
      #endif
      vec4 world = modelMatrix * local;
      vWorld = world.xyz;
      gl_Position = projectionMatrix * viewMatrix * world;
    }`,
  fragmentShader: `
    uniform vec3 lampAt;
    varying vec3 vWorld;
    void main() {
      gl_FragColor = vec4( length( vWorld - lampAt ), 0.0, 0.0, 1.0 );
    }`,
  // (a wall a single sheet thick casts from either side)
  side: THREE.DoubleSide,
});

/** One face's picture copied into its tile of the map. */
const copyMaterial = (): THREE.ShaderMaterial => new THREE.ShaderMaterial({
  uniforms: { face: { value: null } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
  fragmentShader: `
    uniform sampler2D face;
    varying vec2 vUv;
    void main() { gl_FragColor = vec4( texture2D( face, vUv ).r, 0.0, 0.0, 1.0 ); }`,
  depthTest: false,
  depthWrite: false,
});

/** Whether `mesh` casts into the lamps' shadows: a mesh that casts (the merged caster the shadow maps alone draw, an
 *  instanced one such as the lamps' own posts, which three's shadow pass draws as they stand), never a body's, nor a
 *  leaf card's (it casts by its picture's alpha). */
function casts(mesh: THREE.Mesh): boolean {
  if (!mesh.isMesh || !mesh.castShadow || (mesh as THREE.SkinnedMesh).isSkinnedMesh) return false;
  if (!mesh.visible && !drawnInShadowsOnly(mesh)) return false;
  const own = mesh.material;
  return Array.isArray(own) || own.alphaTest === 0;
}

/** What the lamps' shadows are drawn of: a stand-in for each mesh under `place` that casts (sharing its geometry and
 *  instances, where it stands), in a scene of their own, drawn in `material`. */
function castersOf(place: THREE.Object3D, material: THREE.Material): THREE.Scene {
  const scene = new THREE.Scene();
  place.updateMatrixWorld(true);
  place.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!casts(mesh)) return;
    const instanced = mesh as THREE.InstancedMesh;
    let stand: THREE.Mesh;
    if (instanced.isInstancedMesh) {
      const many = new THREE.InstancedMesh(mesh.geometry, material, instanced.count);
      many.instanceMatrix = instanced.instanceMatrix;
      stand = many;
    } else {
      stand = new THREE.Mesh(mesh.geometry, material);
    }
    // (where it stands as built: its own matrix the world's, made again by nothing)
    stand.matrixAutoUpdate = false;
    stand.matrixWorldAutoUpdate = false;
    stand.matrix.copy(mesh.matrixWorld);
    stand.matrixWorld.copy(mesh.matrixWorld);
    stand.frustumCulled = false;
    scene.add(stand);
  });
  return scene;
}

/** Whether the renderer can draw into a map of half floats. */
const drawsHalfFloats = (renderer: THREE.WebGLRenderer): boolean =>
  renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');

/** The renderer's target, viewport and scissor as they stand, and what puts them back. */
function keptState(renderer: THREE.WebGLRenderer): () => void {
  const target = renderer.getRenderTarget();
  const viewport = renderer.getViewport(new THREE.Vector4());
  const scissor = renderer.getScissor(new THREE.Vector4());
  const scissorTest = renderer.getScissorTest();
  const autoClear = renderer.autoClear;
  const clear = renderer.getClearColor(new THREE.Color());
  const clearAlpha = renderer.getClearAlpha();
  return () => {
    renderer.setRenderTarget(target);
    renderer.setViewport(viewport);
    renderer.setScissor(scissor);
    renderer.setScissorTest(scissorTest);
    renderer.autoClear = autoClear;
    renderer.setClearColor(clear, clearAlpha);
  };
}

/** The map drawn on WebGPU: each face copied into its tile of the texture its materials read, whose rows run from the
 *  top as a face's do, where WebGL's run from the foot: the materials flip the row they read (`core/lampNodes.ts`). */
function bakeOnWebGPU(renderer: THREE.WebGLRenderer, place: THREE.Object3D, lamps: readonly LampPlace[]): void {
  const lampAt = new THREE.Vector3();
  const distance = lampDistanceMaterial(lampAt);
  const casters = castersOf(place, distance);
  const atlas = lampAtlasTexture();
  const face = new THREE.RenderTarget(SHADOW_TILE, SHADOW_TILE, {
    type: THREE.HalfFloatType, format: THREE.RedFormat, minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter, generateMipmaps: false,
  });
  const camera = new THREE.PerspectiveCamera(90, 1, NEAR, 1);
  const putBack = keptState(renderer);
  const ahead = new THREE.Vector3();
  const corner = new THREE.Vector2();
  try {
    renderer.autoClear = true;
    renderer.initTexture(atlas);
    pipelinesAtOnce(() => {
      for (const [lamp, { at, reach }] of lamps.entries()) {
        lampAt.copy(at);
        camera.far = reach;
        camera.updateProjectionMatrix();
        camera.position.copy(at);
        for (const [k, { axis, up }] of FACES.entries()) {
          camera.up.copy(up);
          camera.lookAt(ahead.copy(at).add(axis));
          camera.updateMatrixWorld();
          renderer.setClearColor(new THREE.Color(reach, 0, 0), 1);
          renderer.setRenderTarget(face as THREE.WebGLRenderTarget);
          renderer.render(casters, camera);
          const tile = lamp * 6 + k;
          const row = Math.floor(tile / SHADOW_COLUMNS);
          corner.set((tile % SHADOW_COLUMNS) * SHADOW_TILE, atlas.image.height - (row + 1) * SHADOW_TILE);
          renderer.copyTextureToTexture(face.texture, atlas, null, corner);
        }
      }
    });
  } finally {
    putBack();
    face.dispose();
    distance.dispose();
  }
  setLampShadows(true);
}

/** Each of `lamps`' shadows of what stands still under `place` drawn into the lamps' map, and the map put to use. */
export function bakeLampShadows(renderer: THREE.WebGLRenderer, place: THREE.Object3D, lamps: readonly LampPlace[]): void {
  if (WEBGPU) {
    bakeOnWebGPU(renderer, place, lamps);
    return;
  }
  if (!drawsHalfFloats(renderer)) return;
  const distance = distanceMaterial();
  const copy = copyMaterial();
  const casters = castersOf(place, distance);
  const face = new THREE.WebGLRenderTarget(SHADOW_TILE, SHADOW_TILE, {
    type: THREE.HalfFloatType, format: THREE.RedFormat, minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter, generateMipmaps: false,
  });
  const { width, height } = lampShadowMap.image;
  const atlas = new THREE.WebGLRenderTarget(width, height, {
    type: THREE.HalfFloatType, format: THREE.RedFormat, depthBuffer: false, minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter, generateMipmaps: false,
  });
  const camera = new THREE.PerspectiveCamera(90, 1, NEAR, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), copy);
  quad.frustumCulled = false;
  const copying = new THREE.Scene().add(quad);
  const putBack = keptState(renderer);
  const ahead = new THREE.Vector3();
  try {
    renderer.autoClear = true;
    for (const [lamp, { at, reach }] of lamps.entries()) {
      distance.uniforms.lampAt.value.copy(at);
      camera.far = reach;
      camera.updateProjectionMatrix();
      camera.position.copy(at);
      for (const [k, { axis, up }] of FACES.entries()) {
        camera.up.copy(up);
        camera.lookAt(ahead.copy(at).add(axis));
        camera.updateMatrixWorld();
        // (nothing met: as far as it reaches)
        renderer.setClearColor(new THREE.Color(reach, 0, 0), 1);
        renderer.setRenderTarget(face);
        renderer.render(casters, camera);
        const tile = lamp * 6 + k;
        const x = (tile % SHADOW_COLUMNS) * SHADOW_TILE;
        const y = Math.floor(tile / SHADOW_COLUMNS) * SHADOW_TILE;
        copy.uniforms.face.value = face.texture;
        atlas.viewport.set(x, y, SHADOW_TILE, SHADOW_TILE);
        atlas.scissor.set(x, y, SHADOW_TILE, SHADOW_TILE);
        atlas.scissorTest = true;
        renderer.setRenderTarget(atlas);
        renderer.autoClear = false;
        renderer.render(copying, camera);
        renderer.autoClear = true;
      }
    }
    // (into the texture every material holds, on the GPU)
    renderer.copyTextureToTexture(atlas.texture, lampShadowMap);
  } finally {
    putBack();
    atlas.dispose();
    face.dispose();
    distance.dispose();
    copy.dispose();
    quad.geometry.dispose();
  }
  setLampShadows(true);
}
