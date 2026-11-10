// A hero's looks drawn from palettes: the kit's materials that differ only in what a table can hold (colour,
// roughness, metalness, the normal map's depth, the maps' repeat, their glow, rim, hood's shade and an item's glow)
// share one material, each mesh's vertices naming their look's row. What a hero costs three is the materials he
// draws in: a draw in another material than the one before has every uniform sent again, 13 to 24 us on a desktop
// where a draw in the same takes 2 to 4, and the mage drew in 40 (`lab draws`, `src/entities/models/AGENTS.md`).
//
// The kit's materials stay what the game writes to (`Dye` their colours, `ItemGlows` their glow, a model's `animate`
// a gem's pulse): once a frame each palette reads its rows off them, so nothing that sets a look knows of it. A
// palette's shader is the kit's own (`createKit`'s patch) reading those looks off its rows, a program of its own a
// kind of material (`customProgramCacheKey`), compiled at load with the hero. A mesh's geometry is wrapped: its
// attributes shared, with the row's index beside them (`aLook`). WebGL only: on WebGPU a hero's parts are merged
// and drawn from a bundle (`drawAsOne.ts`), where a material more costs nothing a frame. A hand's looks, whose
// shader wraps the kit's, share palettes of their own (`wrapsKit`), and a mesh of several materials takes its
// vertices' rows by their group. `?palette=0` draws each
// look in its own material, for A/B.
import * as THREE from 'three';
import { isKitMaterial, type KitLooks } from '../../core/materials';
import { isDualQuaternionSkinned } from './dualQuaternion';
import { WEBGPU } from '../../core/webgpu';
import type { Model } from '../../types';

/** Whether the heroes' looks are drawn from palettes (WebGL; `?palette=0`: each in its own material). */
export const PALETTES = !WEBGPU && (typeof location === 'undefined' || !/[?&]palette=0/.test(location.search));

/** how many looks a palette holds: its tables' size in the shader, so every palette's alike (one more is another
 *  palette) */
const ROWS = 16;

/** the maps a look may have: of one palette, each is the same picture, repeated as the look repeats it */
const MAPS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap', 'bumpMap'] as const;
/** what a row holds of a look, so what two looks of one palette may differ in */
const IN_ROWS = new Set(['color', 'roughness', 'metalness', 'normalScale', 'emissive', 'emissiveIntensity']);
/** what says nothing of how a material draws */
const NOT_LOOKS = new Set(['uuid', 'name', 'userData', 'version', '_listeners', 'kitLooks', 'onBeforeCompile',
  'customProgramCacheKey']);

type Look = THREE.MeshStandardMaterial & { kitLooks: KitLooks };

/** A palette's tables, as its shader reads them. */
interface Tables {
  uPalColor: { value: Float32Array };
  /** roughness, metalness, the normal map's depth, whether its glow dims near the camera */
  uPalPbr: { value: Float32Array };
  uPalEmissive: { value: Float32Array };
  uPalRim: { value: Float32Array };
  uPalAura: { value: Float32Array };
  uPalShade: { value: Float32Array };
  uPalRepeat: { value: Float32Array };
}

/** One palette: the material its looks draw in, the looks by row, whether their shader is a wrapper's of the kit's
 *  (a hand's: `wrapsKit`), and the frame its rows were last read in. */
interface Palette {
  material: THREE.Material;
  looks: Look[];
  tables: Tables;
  wrapper: boolean;
  read: number;
}

/** Whether `look`'s shader is a wrapper's of the kit's that a palette can still hold: a hand's, skinned by dual
 *  quaternions with its maps read triplanar (`hands.ts` `ownCopy`). It reads its maps its own way, so its looks
 *  must share their normal map's depth and repeat, and each hand's own looks (its glowing outline, its glove's
 *  glow) are the kit's, which the rows hold. Any other wrapper may keep a state of its own a material (the fur's
 *  lag), and stays out. */
const wrapsKit = (look: THREE.Material): boolean => isDualQuaternionSkinned(look) && !isKitMaterial(look);

const tablesOf = (): Tables => ({
  uPalColor: { value: new Float32Array(ROWS * 3) },
  uPalPbr: { value: new Float32Array(ROWS * 4) },
  uPalEmissive: { value: new Float32Array(ROWS * 3) },
  uPalRim: { value: new Float32Array(ROWS * 3) },
  uPalAura: { value: new Float32Array(ROWS * 3) },
  uPalShade: { value: new Float32Array(ROWS * 4) },
  uPalRepeat: { value: new Float32Array(ROWS * 2) },
});

/** The map whose repeat is a look's (its maps repeat alike: `signatureOf`). */
function firstMap(look: THREE.Material): THREE.Texture | null {
  const maps = look as unknown as Record<string, THREE.Texture | null>;
  for (const name of MAPS) if (maps[name]) return maps[name];
  return null;
}

/** A map as far as a palette cares: its picture and how it's sampled, not how often it repeats. */
function mapKey(map: THREE.Texture): string {
  return [map.source.uuid, map.wrapS, map.wrapT, map.magFilter, map.minFilter, map.anisotropy, map.colorSpace,
    map.flipY, map.channel].join(':');
}

/** Whether a look's maps are laid as a palette lays them: all repeated alike, none moved or turned. */
function mapsFit(look: THREE.Material): boolean {
  const maps = look as unknown as Record<string, THREE.Texture | null>;
  const first = firstMap(look);
  for (const name of MAPS) {
    const map = maps[name];
    if (!map) continue;
    if (!map.repeat.equals(first!.repeat) || map.offset.lengthSq() > 0 || map.rotation !== 0) return false;
  }
  return true;
}

/** What two looks must share to draw in one material: everything of them a row doesn't hold. Null for a look no
 *  palette can hold (its maps laid otherwise, a normal map deeper one way than the other). */
function signatureOf(look: Look, mesh: THREE.Mesh): string | null {
  if (!mapsFit(look) || (look.normalScale && look.normalScale.x !== look.normalScale.y)) return null;
  const values = look as unknown as Record<string, unknown>;
  const wrapper = wrapsKit(look);
  const skinned = (mesh as THREE.SkinnedMesh).isSkinnedMesh === true;
  // (three keeps a material's program by whether its mesh receives shadows, and works it out again at each draw of
  // the other kind: made to receive them all, the ranger's arrows shadowed themselves, darker along their length)
  const parts: string[] = [look.type, String(skinned), look.customProgramCacheKey(), String(mesh.receiveShadow)];
  if (wrapper) parts.push(`repeat=${JSON.stringify(firstMap(look)?.repeat ?? null)}`);
  for (const key of Object.keys(look).sort()) {
    if (NOT_LOOKS.has(key) || (IN_ROWS.has(key) && !(wrapper && key === 'normalScale'))) continue;
    const value = values[key];
    if ((value as THREE.Texture | null)?.isTexture) parts.push(`${key}=${mapKey(value as THREE.Texture)}`);
    else if (value && typeof value === 'object') parts.push(`${key}=${JSON.stringify(value)}`);
    else parts.push(`${key}=${String(value)}`);
  }
  return parts.join('|');
}

/** each picture's map as a palette samples it: repeated once, the looks' repeats in their rows */
const unrepeated = new WeakMap<THREE.Texture['source'], Map<string, THREE.Texture>>();
function unrepeatedOf(map: THREE.Texture): THREE.Texture {
  const alike = unrepeated.get(map.source) ?? new Map<string, THREE.Texture>();
  unrepeated.set(map.source, alike);
  const key = mapKey(map);
  let once = alike.get(key);
  if (!once) {
    once = map.clone();
    once.repeat.set(1, 1);
    once.updateMatrix();
    alike.set(key, once);
  }
  return once;
}

const NORMAL_DEPTH = 'mapN.xy *= normalScale;';
const VERTEX_ROWS = /* glsl */ `
attribute float aLook;
varying float vLook;
uniform vec2 uPalRepeat[${ROWS}];`;
const VERTEX_LOOK = /* glsl */ `
  vLook = aLook;
  vec2 palRepeat = uPalRepeat[int(aLook + 0.5)];
  #ifdef USE_MAP
    vMapUv *= palRepeat;
  #endif
  #ifdef USE_NORMALMAP
    vNormalMapUv *= palRepeat;
  #endif
  #ifdef USE_ROUGHNESSMAP
    vRoughnessMapUv *= palRepeat;
  #endif
  #ifdef USE_METALNESSMAP
    vMetalnessMapUv *= palRepeat;
  #endif
  #ifdef USE_EMISSIVEMAP
    vEmissiveMapUv *= palRepeat;
  #endif
  #ifdef USE_AOMAP
    vAoMapUv *= palRepeat;
  #endif
  #ifdef USE_ALPHAMAP
    vAlphaMapUv *= palRepeat;
  #endif
  #ifdef USE_BUMPMAP
    vBumpMapUv *= palRepeat;
  #endif`;
/** the kit's own looks (`createKit`'s patch declares them as uniforms) read off the rows */
const FRAGMENT_ROWS = /* glsl */ `
varying float vLook;
uniform vec3 uPalColor[${ROWS}];
uniform vec4 uPalPbr[${ROWS}];
uniform vec3 uPalEmissive[${ROWS}];
uniform vec3 uPalRim[${ROWS}];
uniform vec3 uPalAura[${ROWS}];
uniform vec4 uPalShade[${ROWS}];
#define PAL_ROW int(vLook + 0.5)
#define uAura uPalAura[PAL_ROW]
#define uRim uPalRim[PAL_ROW]
#define uNear uPalPbr[PAL_ROW].w
#define uShade uPalShade[PAL_ROW]
`;

/** `source` with `find` made `put`: every look the kit's shader reads must be found, or a palette would draw it as
 *  the kit's own material does and no look would tell. */
function swap(source: string, find: string, put: string): string {
  if (!source.includes(find)) throw new Error(`palette: the kit's shader has no "${find}"`);
  return source.replace(find, put);
}

/** The kit's shader (already patched by its own hook, and by a wrapper's) made to read its looks off the palette's
 *  rows; a wrapper's reads its normal map its own way, its depth every look's alike. */
function readRows(shader: { vertexShader: string; fragmentShader: string; uniforms: Record<string, unknown> },
  tables: Tables, wrapper: boolean): void {
  Object.assign(shader.uniforms, tables);
  let vertex = swap(shader.vertexShader, '#include <common>', `#include <common>${VERTEX_ROWS}`);
  vertex = swap(vertex, '#include <uv_vertex>', `#include <uv_vertex>${VERTEX_LOOK}`);
  shader.vertexShader = vertex;
  let fragment = shader.fragmentShader;
  for (const own of ['uniform vec3 uAura;', 'uniform float uNear;', 'uniform vec3 uRim;', 'uniform vec4 uShade;']) {
    fragment = swap(fragment, own, '');
  }
  fragment = swap(fragment, '#include <common>', `#include <common>${FRAGMENT_ROWS}`);
  fragment = swap(fragment, '#include <color_fragment>',
    '#include <color_fragment>\ndiffuseColor.rgb *= uPalColor[PAL_ROW];');
  // (before the lights read them: a wrapper reads the roughness map its own way, and leaves the factor)
  fragment = swap(fragment, '#include <lights_physical_fragment>',
    'roughnessFactor *= uPalPbr[PAL_ROW].x;\nmetalnessFactor *= uPalPbr[PAL_ROW].y;\n'
    + '#include <lights_physical_fragment>');
  fragment = swap(fragment, '#include <emissivemap_fragment>',
    '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uPalEmissive[PAL_ROW];');
  if (!wrapper) {
    const normals = swap(THREE.ShaderChunk.normal_fragment_maps, NORMAL_DEPTH,
      'mapN.xy *= normalScale * uPalPbr[PAL_ROW].z;');
    fragment = swap(fragment, '#include <normal_fragment_maps>', normals);
  }
  shader.fragmentShader = fragment;
}

/** The material a palette's looks draw in: `first`'s but for what the rows hold, which it leaves at one (or none)
 *  for the rows to scale. */
function materialOf(first: Look, tables: Tables, wrapper: boolean): THREE.Material {
  const material = first.clone() as THREE.MeshStandardMaterial;
  material.name = 'palette';
  material.color.setRGB(1, 1, 1);
  material.roughness = 1;
  material.metalness = 1;
  material.emissive.setRGB(0, 0, 0);
  material.emissiveIntensity = 1;
  const maps = material as unknown as Record<string, THREE.Texture | null>;
  if (!wrapper) {
    material.normalScale?.set(1, 1);
    for (const name of MAPS) if (maps[name]) maps[name] = unrepeatedOf(maps[name]);
  }
  const kitHook = first.onBeforeCompile;
  material.onBeforeCompile = function (shader, renderer) {
    kitHook.call(first, shader, renderer);
    readRows(shader, tables, wrapper);
  };
  material.customProgramCacheKey = () => `${first.customProgramCacheKey()}|palette`;
  return material;
}

/** A palette's rows read off its looks as they are now. */
function readLooks({ looks, tables, wrapper }: Palette): void {
  const { uPalColor, uPalPbr, uPalEmissive, uPalRim, uPalAura, uPalShade, uPalRepeat } = tables;
  looks.forEach((look, row) => {
    look.color.toArray(uPalColor.value, row * 3);
    uPalPbr.value[row * 4] = look.roughness;
    uPalPbr.value[row * 4 + 1] = look.metalness;
    uPalPbr.value[row * 4 + 2] = wrapper ? 1 : look.normalScale?.x ?? 1;
    uPalPbr.value[row * 4 + 3] = look.kitLooks.near.value;
    const glow = look.emissiveIntensity;
    uPalEmissive.value[row * 3] = look.emissive.r * glow;
    uPalEmissive.value[row * 3 + 1] = look.emissive.g * glow;
    uPalEmissive.value[row * 3 + 2] = look.emissive.b * glow;
    look.kitLooks.rim.value.toArray(uPalRim.value, row * 3);
    look.kitLooks.aura.value.toArray(uPalAura.value, row * 3);
    look.kitLooks.shade.value.toArray(uPalShade.value, row * 4);
    const repeat = wrapper ? null : firstMap(look)?.repeat;
    uPalRepeat.value[row * 2] = repeat?.x ?? 1;
    uPalRepeat.value[row * 2 + 1] = repeat?.y ?? 1;
  });
}

/** each model's palettes, by its root: what its looks share and how many looks each holds (the lab's `draws`) */
const made = new WeakMap<THREE.Object3D, { shared: string; looks: number }[]>();

/** The palettes `root`'s model draws from: what each one's looks share (every part of a material a row doesn't
 *  hold, `key=value` joined by `|`) and how many looks it holds. */
export const palettesOf = (root: THREE.Object3D): { shared: string; looks: number }[] => made.get(root) ?? [];

/** each mesh drawn from palettes, by the looks it draws: the kit's materials it was built in */
const looksOf = new WeakMap<THREE.Object3D, THREE.Material[]>();

/** The materials `mesh` shows: the kit's it was built in where it draws from palettes, else its own. What sets a
 *  hero's look by his meshes (a hood's shade, a dye's copies) reads them here, never `mesh.material`. */
export function looksOn(mesh: THREE.Mesh): THREE.Material[] {
  return looksOf.get(mesh) ?? [mesh.material].flat();
}

/** each geometry as a mesh of a row draws it: its attributes, and the row's index at every vertex */
const wrapped = new WeakMap<THREE.BufferGeometry, Map<number, THREE.BufferGeometry>>();
const wraps = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();

/** The geometry `geometry` wraps for a palette's row, or itself. */
export const wrappedFrom = (geometry: THREE.BufferGeometry): THREE.BufferGeometry => wraps.get(geometry) ?? geometry;
function geometryOf(geometry: THREE.BufferGeometry, row: number): THREE.BufferGeometry {
  const rows = wrapped.get(geometry) ?? new Map<number, THREE.BufferGeometry>();
  wrapped.set(geometry, rows);
  let own = rows.get(row);
  if (!own) {
    own = new THREE.BufferGeometry();
    own.name = geometry.name;
    for (const [name, attribute] of Object.entries(geometry.attributes)) own.setAttribute(name, attribute);
    own.setIndex(geometry.index);
    own.boundingSphere = geometry.boundingSphere;
    own.boundingBox = geometry.boundingBox;
    own.userData = geometry.userData;
    const looks = new Float32Array(geometry.attributes.position.count).fill(row);
    own.setAttribute('aLook', new THREE.BufferAttribute(looks, 1));
    rows.set(row, own);
    wraps.set(own, geometry);
  }
  return own;
}

/** Whether a palette can hold `look`: the kit's own patch of it, or a hand's wrapper of that (`wrapsKit`). */
const held = (look: THREE.Material): boolean => isKitMaterial(look) || wrapsKit(look);

/** Whether `mesh` can draw from palettes: its materials each one a palette can hold, its geometry drawn whole. */
function fits(mesh: THREE.Mesh): boolean {
  if (!mesh.isMesh || ![mesh.material].flat().every(held)) return false;
  const geometry = mesh.geometry;
  if (geometry.drawRange.start !== 0 || geometry.drawRange.count !== Infinity) return false;
  return !Object.keys(geometry.morphAttributes).length && Boolean(geometry.attributes.position);
}

/** Whether a geometry's shape changes as the game runs (a cloth's, a skirt's, a bowstring's: `DynamicDrawUsage`):
 *  what moves it holds the geometry itself, so it takes its rows in place, and is one mesh's alone. */
const reshaped = (geometry: THREE.BufferGeometry): boolean =>
  (geometry.attributes.position as THREE.BufferAttribute).usage !== THREE.StaticDrawUsage;

/** `geometry` itself given `rows`, one a vertex; false where it already holds others (two meshes' looks). */
function rowsInPlace(geometry: THREE.BufferGeometry, rows: Float32Array): boolean {
  const kept = geometry.attributes.aLook as THREE.BufferAttribute | undefined;
  if (kept) return rows.every((row, vertex) => kept.getX(vertex) === row);
  geometry.setAttribute('aLook', new THREE.BufferAttribute(rows, 1));
  return true;
}

/** The row of each vertex of a geometry drawn in several materials, a group each (`rowOf` a group's material's);
 *  null where a vertex is two groups' of different rows. */
function rowsByGroup(geometry: THREE.BufferGeometry, rowOf: (material: number) => number): Float32Array | null {
  const rows = new Float32Array(geometry.attributes.position.count).fill(-1);
  const index = geometry.index;
  for (const group of geometry.groups) {
    const row = rowOf(group.materialIndex ?? 0);
    const end = Math.min(group.start + group.count, index ? index.count : rows.length);
    for (let corner = group.start; corner < end; corner++) {
      const vertex = index ? index.getX(corner) : corner;
      if (rows[vertex] >= 0 && rows[vertex] !== row) return null;
      rows[vertex] = row;
    }
  }
  return rows.map((row) => Math.max(row, 0));
}

/**
 * `model`'s looks drawn from palettes (a hero's): every mesh under it that `fits` put in the palette of the looks
 * it can share a material with, its geometry wrapped with its row. Call once the model is built, with all it can
 * wear under it, before it's first drawn; a second call for a model does nothing. The palettes' materials join
 * the kit's, disposed with them.
 */
export function drawFromPalettes(model: Model): void {
  if (!PALETTES || made.has(model.root)) return;
  const palettes = new Map<string, Palette[]>();
  const kit = model.kit.mats as THREE.Material[];
  const paletteFor = (look: Look, signature: string): Palette => {
    const alike = palettes.get(signature) ?? [];
    palettes.set(signature, alike);
    let palette = alike.find((p) => p.looks.includes(look)) ?? alike.find((p) => p.looks.length < ROWS);
    if (!palette) {
      const tables = tablesOf();
      const wrapper = wrapsKit(look);
      palette = { material: materialOf(look, tables, wrapper), looks: [], tables, wrapper, read: -1 };
      const made = palette;
      // (its rows read off its looks once a frame, as the first of its draws comes up)
      palette.material.onBeforeRender = (renderer) => {
        const frame = renderer.info.render.frame;
        if (made.read === frame) return;
        made.read = frame;
        readLooks(made);
      };
      alike.push(palette);
      kit.push(palette.material);
    }
    if (!palette.looks.includes(look)) palette.looks.push(look);
    return palette;
  };
  /** A mesh of one material, in its look's palette. */
  const one = (mesh: THREE.Mesh, look: Look): void => {
    const signature = signatureOf(look, mesh);
    if (signature === null) return;
    const palette = paletteFor(look, signature);
    const row = palette.looks.indexOf(look);
    if (!reshaped(mesh.geometry)) mesh.geometry = geometryOf(mesh.geometry, row);
    else if (mesh.geometry.userData.shared) return;
    else if (!rowsInPlace(mesh.geometry, new Float32Array(mesh.geometry.attributes.position.count).fill(row))) return;
    mesh.material = palette.material;
    looksOf.set(mesh, [look]);
  };
  /** A mesh of several materials, a group of its geometry each (a coat and its lining): each in its look's palette,
   *  its vertices' rows by their group, in the geometry itself (it's the mesh's alone). */
  const several = (mesh: THREE.Mesh, looks: Look[]): void => {
    const signatures = looks.map((look) => signatureOf(look, mesh));
    if (signatures.includes(null) || mesh.geometry.userData.shared) return;
    const found = looks.map((look, i) => paletteFor(look, signatures[i]!));
    const rows = rowsByGroup(mesh.geometry, (material) => found[material].looks.indexOf(looks[material]));
    if (!rows || !rowsInPlace(mesh.geometry, rows)) return;
    mesh.material = found.map((palette) => palette.material);
    looksOf.set(mesh, looks);
  };
  model.root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!fits(mesh)) return;
    if (Array.isArray(mesh.material)) several(mesh, mesh.material as Look[]);
    else one(mesh, mesh.material as Look);
  });
  const all = [...palettes].flatMap(([shared, alike]) => alike.map((p) => ({ shared, looks: p.looks.length })));
  made.set(model.root, all);
}
