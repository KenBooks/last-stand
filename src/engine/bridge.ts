// The game's scene handed to the Rust engine (Bulwark, `pkg/`): the trial behind `?renderer=rust`. The game keeps its
// three.js scene; each frame this walks what's shown, hands over each geometry, texture and material the first time
// it's met (and again when its version moves on), and writes a record a mesh straight into the engine's memory, with
// the skinned meshes' bones and the frame's globals (camera, sun and its shadow's view, sky, point lights, fog).
// What it can't hand over is counted by its kind (`skipped`): shader materials, sprites, points, lines.
import * as THREE from 'three';
import type { Engine, InitOutput } from './pkg/bulwark';
import { perfClock } from '../core/perfClock';
import { tunable } from '../core/tuning';
import { holeNow } from '../core/seeThrough';
import { lampList, LAMPS_MOST } from '../core/lamps';
import { particles } from '../fx/particles';
import { lookOf, LOOK_FLOATS, type RustLook } from './custom';
import { recording, Tape } from './tape';

/** how many floats a record is (`RECORD_FLOATS` in the engine's plan.rs) */
const RECORD = 24;
/** a record's flags (plan.rs) */
const CASTS_SHADOW = 1, NEVER_CULLED = 2, SHADOW_ONLY = 4;
/** where a record says how many instances its mesh draws by itself (`RAW_INSTANCES` in plan.rs) */
const RAW_INSTANCES = 7;
/** where the globals' parts begin, in floats (`Globals` in the engine's common.wgsl) */
const GLOBALS = {
  viewProj: 0, camPos: 16, sunDir: 20, sunColor: 24, ambient: 28, hemiSky: 32, hemiGround: 36, fogColor: 40, misc: 44,
  shadowView: 48, points: 64, camRight: 320, camUp: 324, seeFocus: 328, seeHole: 332, grade: 336, floats: 344,
};
const MAX_POINTS = 32;
/** the sun's shadow map, a side (`SHADOW_SIZE` in the engine's gpu.rs) */
const SHADOW_SIZE = 2048;
/** the largest side a map is handed over at */
const MAX_MAP = 2048;

/** What's tuned by hand against three's picture (`window.__rust.tune`). */
export const TUNE = tunable('rust', {
  exposure: 1.05,
  /** how strongly the sky is mirrored by smooth surfaces */
  environment: 1,
  /** the sky's light where three reads an environment map the engine doesn't have */
  skyFill: 0.35,
  shadows: 1,
  /** how far along its normal a surface is moved before the shadow map is read, world units */
  shadowBias: 0.06,
  /** a look to debug by: 1 how much of the sun reaches each pixel, 2 the normals */
  debug: 0,
  /** every opaque mesh casts the sun's shadow, not only those three is told to draw into its own map (the
   *  village's still things are in maps three keeps, which the engine doesn't have) */
  castAll: 1,
});

/** What a frame handed over and drew. */
export interface FrameStats {
  records: number;
  draws: number;
  shadowDraws: number;
  objects: number;
  culled: number;
  triangles: number;
  gpuMs: number;
  /** the walk of the scene, then the engine's own work, ms */
  walkMs: number;
  engineMs: number;
  /** handed over this frame */
  newMeshes: number;
  newTextures: number;
  newMaterials: number;
}

interface MaterialEntry {
  id: number; params: Float32Array; maps: Uint32Array; key: number; seen: number;
  /** how often its numbers moved, and whether the engine's material is its own by now */
  changes: number; own: boolean;
  /** its own shader's numbers as last sent, and its volume */
  custom?: Float32Array;
  volume?: number;
}
/** how many times a material's numbers may move before it stops sharing the engine's materials */
const SHARED_CHANGES = 8;
interface GeometryEntry { id: number; version: number }
interface TextureEntry { id: number; version: number }
interface SetEntry { id: number; version: number; count: number }

type AnyMaterial = THREE.Material & Partial<{
  color: THREE.Color; map: THREE.Texture | null; roughness: number; metalness: number; emissive: THREE.Color;
  emissiveIntensity: number; emissiveMap: THREE.Texture | null; normalMap: THREE.Texture | null;
  normalScale: THREE.Vector2; roughnessMap: THREE.Texture | null; metalnessMap: THREE.Texture | null;
  isMeshBasicMaterial: boolean; isMeshBasicNodeMaterial: boolean; isShaderMaterial: boolean;
  isMeshPhongMaterial: boolean; alphaMap: THREE.Texture | null;
  positionNode: unknown; colorNode: unknown; fragmentNode: unknown; vertexNode: unknown; seeThrough: unknown;
}>;

const scratchMatrix = new THREE.Matrix4(), viewProj = new THREE.Matrix4(), projection = new THREE.Matrix4();
const v3 = new THREE.Vector3(), target3 = new THREE.Vector3();
const IDENTITY = new THREE.Matrix4();

/** A perspective camera's projection with clip depth from 0 to 1, whatever convention three keeps its own in. */
function projectionOf(camera: THREE.PerspectiveCamera | THREE.OrthographicCamera, out: THREE.Matrix4): THREE.Matrix4 {
  const { near, far } = camera;
  if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
    const c = camera as THREE.PerspectiveCamera;
    const f = 1 / Math.tan(THREE.MathUtils.degToRad(c.fov) / 2) * c.zoom;
    return out.set(
      f / c.aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, far / (near - far), near * far / (near - far),
      0, 0, -1, 0);
  }
  const c = camera as THREE.OrthographicCamera;
  const w = (c.right - c.left) / c.zoom, h = (c.top - c.bottom) / c.zoom;
  const cx = (c.right + c.left) / 2, cy = (c.top + c.bottom) / 2;
  return out.set(
    2 / w, 0, 0, -2 * cx / w,
    0, 2 / h, 0, -2 * cy / h,
    0, 0, 1 / (near - far), near / (near - far),
    0, 0, 0, 1);
}

/** The game's grade as the engine's passes after the scene read it (`fs_grade` in the engine's post.wgsl). */
export interface Grade {
  /** the light the small and the large areas adapt to */
  small: number; large: number;
  /** the highlights' room over their knee */
  cap: number;
  vignette: number;
  /** a blow taken, and how low the health is (0 to 1 each) */
  hurt: number; low: number;
}
const PLAIN_GRADE: Grade = { small: 1e4, large: 1e4, cap: 1, vignette: 1.05, hurt: 0, low: 0 };

export class Bridge {
  readonly stats: FrameStats = {
    records: 0, draws: 0, shadowDraws: 0, objects: 0, culled: 0, triangles: 0, gpuMs: 0, walkMs: 0, engineMs: 0,
    newMeshes: 0, newTextures: 0, newMaterials: 0,
  };
  /** what wasn't handed over, by its kind, on the last frame */
  readonly skipped = new Map<string, number>();
  /** how many of each the engine holds */
  readonly held = { meshes: 0, textures: 0, materials: 0, sets: 0 };

  private geometries = new WeakMap<THREE.BufferGeometry, GeometryEntry>();
  private textures = new WeakMap<THREE.Texture, TextureEntry>();
  private materials = new WeakMap<THREE.Material, MaterialEntry>();
  private sets = new WeakMap<THREE.InstancedMesh, SetEntry>();
  private skeletons = new WeakMap<THREE.Skeleton, number>();
  private frame = 0;
  private records!: Float32Array;
  private bones!: Float32Array;
  private globals!: Float32Array;
  private capacity = 0;
  private boneCapacity = 0;
  private count = 0;
  private boneFloats = 0;
  private points = 0;
  private sun: THREE.DirectionalLight | null = null;
  private stack: THREE.Object3D[] = [];
  private scratchParams = new Float32Array(20);
  private scratchMaps = new Uint32Array(4);
  private canvas2d: CanvasRenderingContext2D | null = null;

  constructor(private engine: Engine, private wasm: InitOutput) {
    this.takeViews(4096, 16 * 256);
  }

  /** The engine's memory viewed again, with room for `records` and `boneFloats`: growing either moves it. */
  private takeViews(records: number, boneFloats: number): void {
    const recordsAt = this.engine.records(records), bonesAt = this.engine.bones(boneFloats);
    const globalsAt = this.engine.globals(), memory = this.wasm.memory.buffer;
    this.records = new Float32Array(memory, recordsAt, records * RECORD);
    this.bones = new Float32Array(memory, bonesAt, boneFloats);
    this.globals = new Float32Array(memory, globalsAt, GLOBALS.floats);
    this.capacity = records;
    this.boneCapacity = boneFloats;
  }

  /** The views taken again if a call into the engine grew its memory under them. */
  private freshViews(): void {
    if (this.records.buffer !== this.wasm.memory.buffer) this.takeViews(this.capacity, this.boneCapacity);
  }

  /** the largest side a map is handed over at (a tape's maps are smaller: its file is mostly maps) */
  private mostMap = MAX_MAP;
  private tape: Tape | null = null;

  /** What's kept of what was handed over forgotten: the next frame hands everything over again. */
  private forget(): void {
    this.geometries = new WeakMap();
    this.textures = new WeakMap();
    this.materials = new WeakMap();
    this.sets = new WeakMap();
    this.cutOuts = new Map();
    this.shared = new Map();
    this.shaders = new Map();
    this.volumes = new WeakMap();
  }

  /**
   * A frame drawn and written down as a tape (`tape.ts`): everything handed over anew, its maps no larger than
   * `mostMap` a side, for the engine's own harness to draw with no browser. The engine keeps what was handed over
   * before and for the tape too (a harness's page, not a player's: nothing is dropped).
   */
  capture(width: number, height: number, mostMap: number, ...frame: Parameters<Bridge['draw']>): Blob {
    const engine = this.engine, tape = new Tape(width, height);
    this.engine = recording(engine, tape);
    this.tape = tape;
    this.mostMap = mostMap;
    this.forget();
    try {
      this.draw(...frame);
    } finally {
      this.engine = engine;
      this.tape = null;
      this.mostMap = MAX_MAP;
      this.forget();
    }
    return tape.blob();
  }

  private skip(kind: string): void {
    this.skipped.set(kind, (this.skipped.get(kind) ?? 0) + 1);
  }

  /** A map's RGBA bytes, row 0 where v is 0, no larger than `MAX_MAP` a side. */
  private pixelsOf(texture: THREE.Texture): { width: number; height: number; data: Uint8Array } | null {
    const image = texture.image as {
      data?: ArrayBufferView | null; width?: number; height?: number;
    } & CanvasImageSource | null;
    if (!image) return null;
    if ((texture as THREE.DataTexture).isDataTexture) {
      const { data, width = 0, height = 0 } = image;
      if (!(data instanceof Uint8Array || data instanceof Uint8ClampedArray)) return null;
      if (texture.format !== THREE.RGBAFormat || data.length !== width * height * 4) return null;
      return { width, height, data: data instanceof Uint8Array ? data : new Uint8Array(data.buffer, data.byteOffset, data.length) };
    }
    if ((texture as THREE.CompressedTexture).isCompressedTexture || (texture as THREE.CubeTexture).isCubeTexture) return null;
    const fullWidth = (image as { naturalWidth?: number }).naturalWidth || (image as { videoWidth?: number }).videoWidth || image.width || 0;
    const fullHeight = (image as { naturalHeight?: number }).naturalHeight || (image as { videoHeight?: number }).videoHeight || image.height || 0;
    if (!fullWidth || !fullHeight) return null;
    const scale = Math.min(1, this.mostMap / Math.max(fullWidth, fullHeight));
    const width = Math.max(1, Math.round(fullWidth * scale)), height = Math.max(1, Math.round(fullHeight * scale));
    this.canvas2d ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    const context = this.canvas2d;
    if (!context) return null;
    context.canvas.width = width;
    context.canvas.height = height;
    context.save();
    // (three's `flipY` puts the picture's foot at v 0)
    if (texture.flipY) { context.translate(0, height); context.scale(1, -1); }
    try {
      context.drawImage(image as CanvasImageSource, 0, 0, width, height);
    } catch {
      context.restore();
      return null;
    }
    context.restore();
    const { data } = context.getImageData(0, 0, width, height);
    return { width, height, data: new Uint8Array(data.buffer) };
  }

  private textureId(texture: THREE.Texture | null | undefined): number {
    if (!texture) return 0;
    const entry = this.textures.get(texture);
    if (entry && entry.version === texture.version) return entry.id;
    const pixels = this.pixelsOf(texture);
    if (entry?.id) { this.engine.drop_texture(entry.id); this.held.textures--; }
    const id = pixels ? this.engine.add_texture(pixels.width, pixels.height, pixels.data, texture.colorSpace === THREE.SRGBColorSpace) : 0;
    if (!pixels) this.skip('texture not readable');
    if (id) { this.held.textures++; this.stats.newTextures++; }
    this.textures.set(texture, { id, version: texture.version });
    this.freshViews();
    return id;
  }

  /** A base map with an alpha map's green as its alpha (three reads the two apart; the engine has one base map). */
  private cutOutId(map: THREE.Texture | null, alpha: THREE.Texture): number {
    const key = `${map?.id ?? 0}:${map?.version ?? 0}:${alpha.id}:${alpha.version}`;
    const kept = this.cutOuts.get(key);
    if (kept !== undefined) return kept;
    const cut = this.pixelsOf(alpha);
    if (!cut) { this.skip('alpha map not readable'); return this.textureId(map); }
    const data = new Uint8Array(cut.data.length).fill(255);
    const base = map ? this.pixelsOf(map) : null;
    if (base && base.width === cut.width && base.height === cut.height) data.set(base.data);
    for (let i = 0; i < data.length; i += 4) data[i + 3] = cut.data[i + 1];
    const id = this.engine.add_texture(cut.width, cut.height, data, map?.colorSpace === THREE.SRGBColorSpace);
    this.cutOuts.set(key, id);
    this.held.textures++;
    this.freshViews();
    return id;
  }
  private cutOuts = new Map<string, number>();

  /** A material's numbers, maps and key written to the scratch arrays; false for one the engine can't draw. */
  private describe(material: AnyMaterial, look?: RustLook): number {
    if (!material.color || material.isShaderMaterial) return -1;
    // (moved or cut by three's nodes: grass grown from a texture, a flame's own fragment)
    // (placed by its nodes: the village's blades, grown from their cells. A position node alone is the wind's sway,
    // which the engine leaves out: the Thornwood's grass stands still. One with a look of its own for the engine
    // is drawn by that)
    if (!look && ((material.positionNode && material.colorNode) || material.fragmentNode || material.vertexNode)) return -1;
    const p = this.scratchParams, maps = this.scratchMaps;
    const unlit = !!(material.isMeshBasicMaterial || material.isMeshBasicNodeMaterial);
    const map = material.map ?? null;
    p[0] = material.color.r; p[1] = material.color.g; p[2] = material.color.b; p[3] = material.opacity;
    const glow = material.emissive, glowBy = material.emissiveIntensity ?? 1;
    p[4] = glow ? glow.r * glowBy : 0; p[5] = glow ? glow.g * glowBy : 0; p[6] = glow ? glow.b * glowBy : 0;
    p[7] = material.alphaTest;
    p[8] = material.roughness ?? (material.isMeshPhongMaterial ? 0.5 : 1);
    p[9] = material.metalness ?? 0;
    p[10] = material.normalScale?.x ?? 1;
    // (what the game dissolves where it hides the hero: core/seeThrough.ts marks it)
    p[11] = material.seeThrough ? 1 : 0;
    const placed = map ?? material.normalMap ?? null;
    p[12] = placed ? placed.repeat.x : 1; p[13] = placed ? placed.repeat.y : 1;
    p[14] = placed ? placed.offset.x : 0; p[15] = placed ? placed.offset.y : 0;
    const rough = material.roughnessMap ?? material.metalnessMap ?? null;
    maps[0] = material.alphaMap ? this.cutOutId(map, material.alphaMap) : this.textureId(map);
    maps[1] = this.textureId(material.normalMap);
    maps[2] = this.textureId(rough);
    maps[3] = this.textureId(material.emissiveMap);
    p[16] = unlit ? 1 : 0;
    p[17] = material.vertexColors ? 1 : 0;
    p[18] = maps[1] ? 1 : 0;
    p[19] = maps[2] ? 1 : 0;
    // (3: its colour already multiplied by its alpha, the flames' light over what they hide)
    const multiplied = material.blending === THREE.CustomBlending && material.blendSrc === THREE.OneFactor;
    const blend = multiplied ? 3 : material.blending === THREE.AdditiveBlending ? 2 : material.transparent ? 1 : 0;
    const side = material.side === THREE.DoubleSide ? 1 : material.side === THREE.BackSide ? 2 : 0;
    return blend | (side << 2) | (material.depthWrite ? 16 : 0);
  }

  /** The engine's material for the numbers, maps and key in the scratch arrays: one for every material alike. */
  private sharedId(key: number): number {
    const signature = `${key}|${this.scratchMaps.join(',')}|${this.scratchParams.join(',')}`;
    let id = this.shared.get(signature);
    if (id === undefined) {
      id = this.engine.add_material(this.scratchParams, this.scratchMaps, key);
      this.shared.set(signature, id);
      this.held.materials++;
      this.stats.newMaterials++;
      this.freshViews();
    }
    return id;
  }
  /** the engine's materials by what they hold: two of the game's that look alike are one there, and their meshes
   *  one draw call (each foe's pieces have materials of their own) */
  private shared = new Map<string, number>();

  /** A material's id, its numbers sent again if they moved since the last frame it was drawn in; 0: not drawn.
   *  A material alike another shares its engine material; one whose numbers keep moving (a glow that pulses) is
   *  given one of its own after `SHARED_CHANGES` moves, and written in place from then on. */
  private materialId(material: AnyMaterial): number {
    let entry = this.materials.get(material);
    if (entry && entry.seen === this.frame) return entry.id;
    const look = lookOf(material);
    if (look) return this.lookId(material, look, entry);
    const key = this.describe(material);
    if (key < 0) {
      if (!entry) {
        entry = { id: 0, params: new Float32Array(0), maps: new Uint32Array(0), key: -1, seen: 0, changes: 0, own: false };
        this.materials.set(material, entry);
      }
      entry.seen = this.frame;
      return 0;
    }
    const p = this.scratchParams, maps = this.scratchMaps;
    if (!entry || !entry.id) {
      entry = { id: this.sharedId(key), params: p.slice(), maps: maps.slice(), key, seen: this.frame, changes: 0, own: false };
      this.materials.set(material, entry);
      return entry.id;
    }
    entry.seen = this.frame;
    const kept = entry;
    const sameMaps = kept.key === key && maps.every((map, slot) => map === kept.maps[slot]);
    if (sameMaps && !p.some((value, index) => value !== kept.params[index])) return kept.id;
    kept.changes++;
    if (!kept.own && kept.changes > SHARED_CHANGES) {
      kept.own = true;
      kept.id = this.engine.add_material(p, maps, key);
      this.held.materials++;
      this.freshViews();
    } else if (!kept.own) {
      kept.id = this.sharedId(key);
    } else if (sameMaps) {
      this.engine.set_material_params(kept.id, p);
    } else {
      this.engine.replace_material(kept.id, p, maps, key);
    }
    kept.maps.set(maps);
    kept.params.set(p);
    kept.key = key;
    return kept.id;
  }

  /** A shader of the page's by its name, handed over the first time it's asked for. */
  private shaderId(look: RustLook): number {
    let id = this.shaders.get(look.shader.name);
    if (id === undefined) {
      id = this.engine.add_shader(look.shader.hooks);
      this.shaders.set(look.shader.name, id);
      this.freshViews();
    }
    return id;
  }
  private shaders = new Map<string, number>();
  private scratchLook = new Float32Array(LOOK_FLOATS);
  /** a look's two maps, then its volume */
  private scratchExtra = new Uint32Array(3);
  private volumes = new WeakMap<THREE.Data3DTexture, { id: number; version: number; cells: number }>();

  /** A volume's id, its cells sent again as its version moves on (a new one made when its size does). */
  private volumeId(volume: THREE.Data3DTexture | undefined): number {
    if (!volume) return 0;
    const { data, width, height, depth } = volume.image as { data: Uint8Array; width: number; height: number; depth: number };
    const entry = this.volumes.get(volume);
    if (entry && entry.version === volume.version) return entry.id;
    if (!(data instanceof Uint8Array) || data.length !== width * height * depth) return 0;
    if (entry && entry.cells === data.length) {
      this.engine.set_volume(entry.id, data);
      entry.version = volume.version;
      return entry.id;
    }
    const id = this.engine.add_volume(width, height, depth, data);
    this.volumes.set(volume, { id, version: volume.version, cells: data.length });
    this.freshViews();
    return id;
  }

  /** A material with a look of its own: an engine material to itself, its shader's numbers sent as they move. */
  private lookId(material: AnyMaterial, look: RustLook, entry: MaterialEntry | undefined): number {
    const key = this.describe(material, look);
    if (key < 0) return 0;
    const p = this.scratchParams, maps = this.scratchMaps, numbers = this.scratchLook;
    look.numbers(numbers);
    const volume = this.volumeId(look.volume?.());
    // (a volume made anew, a loop baked since: the material made again round it)
    if (entry && entry.volume !== volume) {
      this.engine.drop_material(entry.id);
      this.held.materials--;
      entry = undefined;
    }
    if (!entry) {
      this.scratchExtra[0] = this.textureId(look.maps?.[0]);
      this.scratchExtra[1] = this.textureId(look.maps?.[1]);
      this.scratchExtra[2] = volume;
      const id = this.engine.add_custom_material(this.shaderId(look), p, maps, key, numbers, this.scratchExtra);
      entry = {
        id, params: p.slice(), maps: maps.slice(), key, seen: this.frame, changes: 0, own: true, custom: numbers.slice(), volume,
      };
      this.materials.set(material, entry);
      this.held.materials++;
      this.stats.newMaterials++;
      this.freshViews();
      return id;
    }
    entry.seen = this.frame;
    const kept = entry, sent = entry.custom!;
    if (p.some((value, index) => value !== kept.params[index])) {
      this.engine.set_material_params(kept.id, p);
      kept.params.set(p);
    }
    if (numbers.some((value, index) => value !== sent[index])) {
      this.engine.set_material_custom(kept.id, numbers);
      sent.set(numbers);
    }
    return kept.id;
  }

  /** An attribute's values as floats, whatever array holds them (interleaved, normalized bytes...). */
  private floatsOf(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined): Float32Array {
    if (!attribute) return EMPTY_FLOATS;
    const plain = attribute as THREE.BufferAttribute;
    if (!(attribute as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute && plain.array instanceof Float32Array) {
      return plain.array.length === attribute.count * attribute.itemSize ? plain.array
        : plain.array.subarray(0, attribute.count * attribute.itemSize);
    }
    const size = attribute.itemSize, out = new Float32Array(attribute.count * size);
    for (let i = 0; i < attribute.count; i++) {
      for (let c = 0; c < size; c++) out[i * size + c] = attribute.getComponent(i, c);
    }
    return out;
  }

  private geometryId(geometry: THREE.BufferGeometry, positions = 'position'): number {
    const position = geometry.attributes[positions] as THREE.BufferAttribute | undefined;
    if (!position) return 0;
    const index = geometry.index;
    // (a geometry rewritten in place says so by its attributes' versions)
    const version = position.version + (index?.version ?? 0) * 4096 + ((geometry.attributes.color as THREE.BufferAttribute | undefined)?.version ?? 0) * 16777216;
    const entry = this.geometries.get(geometry);
    if (entry && entry.version === version) return entry.id;
    if (entry?.id) { this.engine.drop_mesh(entry.id); this.held.meshes--; }
    const skinIndex = geometry.attributes.skinIndex as THREE.BufferAttribute | undefined;
    const joints = !skinIndex ? EMPTY_SHORTS : skinIndex.array instanceof Uint16Array ? skinIndex.array : Uint16Array.from(skinIndex.array);
    const indices = !index ? EMPTY_INDICES : index.array instanceof Uint32Array ? index.array : Uint32Array.from(index.array);
    const color = geometry.attributes.color;
    const id = this.engine.add_mesh(
      this.floatsOf(position), this.floatsOf(geometry.attributes.normal), this.floatsOf(geometry.attributes.uv),
      this.floatsOf(color), color?.itemSize ?? 3, indices, joints, this.floatsOf(geometry.attributes.skinWeight));
    this.geometries.set(geometry, { id, version });
    this.held.meshes++;
    this.stats.newMeshes++;
    this.freshViews();
    return id;
  }

  private setId(mesh: THREE.InstancedMesh): number {
    const matrices = mesh.instanceMatrix, tints = mesh.instanceColor;
    const version = matrices.version + (tints?.version ?? 0) * 65536;
    const entry = this.sets.get(mesh);
    if (entry && entry.version === version && entry.count === mesh.count) return entry.id;
    let colours = EMPTY_FLOATS;
    if (tints) {
      colours = new Float32Array(mesh.count * 4);
      for (let i = 0; i < mesh.count; i++) {
        colours[i * 4] = tints.getX(i); colours[i * 4 + 1] = tints.getY(i); colours[i * 4 + 2] = tints.getZ(i); colours[i * 4 + 3] = 1;
      }
    }
    const id = this.engine.set_instances(entry?.id ?? 0, (matrices.array as Float32Array).subarray(0, mesh.count * 16), colours);
    if (!entry) this.held.sets++;
    this.sets.set(mesh, { id, version, count: mesh.count });
    this.freshViews();
    return id;
  }

  /** A skinned mesh's bones written after the frame's others, and where they begin (in matrices). */
  private bonesOf(mesh: THREE.SkinnedMesh): number {
    const skeleton = mesh.skeleton;
    const kept = this.skeletons.get(skeleton);
    // (a skeleton shared by several meshes is written once, if they're bound alike: the game's are)
    if (kept !== undefined && kept >= 0 && this.skeletonFrame.get(skeleton) === this.frame) return kept;
    skeleton.update();
    const from = this.boneFloats, floats = skeleton.boneMatrices?.length ?? skeleton.bones.length * 16;
    if (from + floats > this.boneCapacity) this.takeViews(this.capacity, (from + floats) * 2);
    const matrices = skeleton.boneMatrices as Float32Array;
    if (mesh.bindMatrix.equals(IDENTITY)) {
      this.bones.set(matrices, from);
    } else {
      for (let bone = 0; bone < floats; bone += 16) {
        scratchMatrix.fromArray(matrices, bone).multiply(mesh.bindMatrix).toArray(this.bones, from + bone);
      }
    }
    this.boneFloats = from + floats;
    this.skeletons.set(skeleton, from / 16);
    this.skeletonFrame.set(skeleton, this.frame);
    return from / 16;
  }
  private skeletonFrame = new WeakMap<THREE.Skeleton, number>();

  private record(mesh: THREE.Mesh, geometryId: number, material: AnyMaterial, first: number, count: number, set: number, bones: number, raw = 0): void {
    const materialId = this.materialId(material);
    if (!materialId) { this.skip(material.type); return; }
    if (this.count === this.capacity) this.takeViews(this.capacity * 2, this.boneCapacity);
    const r = this.records, at = this.count * RECORD;
    r[at] = geometryId; r[at + 1] = materialId; r[at + 2] = first; r[at + 3] = count; r[at + 4] = set; r[at + 5] = bones;
    // (a material that writes no colour is in the frame for its shadow or its depth alone: the game's merged casters)
    r[at + 6] = (mesh.castShadow || (TUNE.castAll && mesh.receiveShadow) ? CASTS_SHADOW : 0) | (mesh.frustumCulled ? 0 : NEVER_CULLED)
      | (material.colorWrite === false ? SHADOW_ONLY : 0);
    r[at + RAW_INSTANCES] = raw;
    if (bones >= 0) {
      const skinned = mesh as THREE.SkinnedMesh;
      scratchMatrix.multiplyMatrices(mesh.matrixWorld, skinned.bindMatrixInverse).toArray(r, at + 8);
    } else {
      r.set(mesh.matrixWorld.elements, at + 8);
    }
    this.count++;
  }

  private addMesh(mesh: THREE.Mesh): void {
    // (the particles' pools are handed over whole: `sprites`)
    if (mesh.userData.particles) return;
    const geometry = mesh.geometry;
    const look = Array.isArray(mesh.material) ? undefined : lookOf(mesh.material);
    if (look?.before && this.renderer) {
      mesh.onBeforeRender(this.renderer, this.scene!, this.camera!, geometry, mesh.material as THREE.Material, null as unknown as THREE.Group);
    }
    // (a geometry of instances it counts itself: each placed by its material's look, from its index)
    const counted = geometry as THREE.InstancedBufferGeometry;
    const raw = counted.isInstancedBufferGeometry ? counted.instanceCount : 0;
    if (counted.isInstancedBufferGeometry && (!look || !(raw > 0) || raw === Infinity)) {
      if (!look) this.skip('instanced geometry');
      return;
    }
    const geometryId = this.geometryId(geometry, look?.position);
    if (!geometryId) return;
    const instanced = mesh as unknown as THREE.InstancedMesh, skinned = mesh as THREE.SkinnedMesh;
    if (instanced.isInstancedMesh && instanced.count === 0) return;
    const set = instanced.isInstancedMesh ? this.setId(instanced) : 0;
    const bones = skinned.isSkinnedMesh && skinned.skeleton ? this.bonesOf(skinned) : -1;
    const range = geometry.drawRange;
    const from = range.start, to = range.count === Infinity ? Infinity : range.start + range.count;
    if (Array.isArray(mesh.material)) {
      for (const group of geometry.groups) {
        const material = mesh.material[group.materialIndex ?? 0] as AnyMaterial | undefined;
        if (!material || !material.visible) continue;
        const first = Math.max(group.start, from), end = Math.min(group.start + group.count, to);
        if (end > first) this.record(mesh, geometryId, material, first, end - first, set, bones);
      }
      return;
    }
    const material = mesh.material as AnyMaterial;
    if (!material.visible) return;
    this.record(mesh, geometryId, material, from, to === Infinity ? 0 : range.count, set, bones, raw);
  }
  private grade: Grade = PLAIN_GRADE;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.Camera | null = null;

  private addLight(light: THREE.Light): void {
    const g = this.globals, by = light.intensity, c = light.color;
    if (by <= 0) return;
    if ((light as THREE.AmbientLight).isAmbientLight) {
      g[GLOBALS.ambient] += c.r * by; g[GLOBALS.ambient + 1] += c.g * by; g[GLOBALS.ambient + 2] += c.b * by;
    } else if ((light as THREE.HemisphereLight).isHemisphereLight) {
      const ground = (light as THREE.HemisphereLight).groundColor;
      g[GLOBALS.hemiSky] += c.r * by; g[GLOBALS.hemiSky + 1] += c.g * by; g[GLOBALS.hemiSky + 2] += c.b * by;
      g[GLOBALS.hemiGround] += ground.r * by; g[GLOBALS.hemiGround + 1] += ground.g * by; g[GLOBALS.hemiGround + 2] += ground.b * by;
    } else if ((light as THREE.DirectionalLight).isDirectionalLight) {
      // (the strongest is the sun; the engine has one)
      if (!this.sun || by > this.sun.intensity) this.sun = light as THREE.DirectionalLight;
    } else if ((light as THREE.PointLight).isPointLight) {
      if (this.points === MAX_POINTS) { this.skip('point light past 32'); return; }
      const point = light as THREE.PointLight, at = GLOBALS.points + this.points * 8;
      v3.setFromMatrixPosition(point.matrixWorld);
      g[at] = v3.x; g[at + 1] = v3.y; g[at + 2] = v3.z; g[at + 3] = point.distance;
      g[at + 4] = c.r * by; g[at + 5] = c.g * by; g[at + 6] = c.b * by; g[at + 7] = point.decay;
      this.points++;
    } else {
      this.skip(light.type);
    }
  }

  /** The village's lamps (core/lamps.ts `lampList`: a place and a light each, after its shelter) as point lights,
   *  soft close to as the game's are. They shine through walls here: the engine has none of their shadows. */
  private addLamps(): void {
    const g = this.globals;
    for (let lamp = 0; lamp < LAMPS_MOST && this.points < MAX_POINTS; lamp++) {
      const place = (1 + lamp * 2) * 4, light = place + 4;
      if (lampList[light + 3] === 0) continue;
      const at = GLOBALS.points + this.points * 8;
      g.set(lampList.subarray(place, place + 4), at);
      g.set(lampList.subarray(light, light + 3), at + 4);
      g[at + 7] = -1;
      this.points++;
    }
  }

  private walk(scene: THREE.Scene, camera: THREE.Camera): void {
    const stack = this.stack;
    stack.length = 0;
    stack.push(scene);
    while (stack.length) {
      const object = stack.pop()!;
      if (!object.visible) continue;
      if ((object as THREE.Mesh).isMesh) {
        if (object.layers.test(camera.layers)) this.addMesh(object as THREE.Mesh);
      } else if ((object as THREE.Light).isLight) {
        this.addLight(object as THREE.Light);
      } else if ((object as THREE.Points).isPoints || (object as THREE.Line).isLine || (object as THREE.Sprite).isSprite) {
        if (object.layers.test(camera.layers)) this.skip(object.type);
      }
      const children = object.children;
      for (let i = 0; i < children.length; i++) stack.push(children[i]);
    }
  }

  private writeGlobals(scene: THREE.Scene, camera: THREE.PerspectiveCamera, time: number): [number, number, number] {
    const g = this.globals;
    viewProj.multiplyMatrices(projectionOf(camera, projection), camera.matrixWorldInverse).toArray(g, GLOBALS.viewProj);
    v3.setFromMatrixPosition(camera.matrixWorld).toArray(g, GLOBALS.camPos);
    g[GLOBALS.camPos + 3] = time;
    g[GLOBALS.sunDir + 3] = this.points;
    g[GLOBALS.sunColor + 3] = TUNE.exposure;
    // (three lights a surface by an environment map too; the engine has the sky's two halves alone)
    g[GLOBALS.hemiSky] += TUNE.skyFill * (scene.environmentIntensity ?? 1) * (scene.environment ? 1 : 0);
    g[GLOBALS.hemiSky + 1] += TUNE.skyFill * (scene.environmentIntensity ?? 1) * (scene.environment ? 1 : 0);
    g[GLOBALS.hemiSky + 2] += TUNE.skyFill * (scene.environmentIntensity ?? 1) * (scene.environment ? 1 : 0);
    g[GLOBALS.misc] = 1 / SHADOW_SIZE;
    g[GLOBALS.misc + 1] = TUNE.shadowBias;
    g[GLOBALS.misc + 2] = TUNE.environment;
    g[GLOBALS.misc + 3] = TUNE.debug;
    g[GLOBALS.fogColor + 3] = 0;
    const e = camera.matrixWorld.elements;
    g[GLOBALS.camRight] = e[0]; g[GLOBALS.camRight + 1] = e[1]; g[GLOBALS.camRight + 2] = e[2];
    g[GLOBALS.camUp] = e[4]; g[GLOBALS.camUp + 1] = e[5]; g[GLOBALS.camUp + 2] = e[6];
    const hole = holeNow();
    hole.focus.toArray(g, GLOBALS.seeFocus);
    g[GLOBALS.seeFocus + 3] = hole.minY;
    hole.k.toArray(g, GLOBALS.seeHole);
    const sun = this.sun;
    if (sun) {
      v3.setFromMatrixPosition(sun.matrixWorld).sub(target3.setFromMatrixPosition(sun.target.matrixWorld)).normalize();
      v3.toArray(g, GLOBALS.sunDir);
      g[GLOBALS.sunColor] = sun.color.r * sun.intensity; g[GLOBALS.sunColor + 1] = sun.color.g * sun.intensity;
      g[GLOBALS.sunColor + 2] = sun.color.b * sun.intensity;
      if (sun.castShadow && TUNE.shadows) {
        const shadowCamera = sun.shadow.camera;
        sun.shadow.updateMatrices(sun);
        scratchMatrix.multiplyMatrices(projectionOf(shadowCamera, projection), shadowCamera.matrixWorldInverse)
          .toArray(g, GLOBALS.shadowView);
        g[GLOBALS.fogColor + 3] = 1;
      }
    }
    const fog = scene.fog as (THREE.Fog & THREE.FogExp2) | null;
    let clear: THREE.Color | null = (scene.background as THREE.Color | null)?.isColor ? scene.background as THREE.Color : null;
    if (fog) {
      g[GLOBALS.ambient + 3] = fog.isFogExp2 ? 2 : 1;
      g[GLOBALS.hemiSky + 3] = fog.isFogExp2 ? fog.density : fog.near;
      g[GLOBALS.hemiGround + 3] = fog.isFogExp2 ? 0 : fog.far;
      fog.color.toArray(g, GLOBALS.fogColor);
      clear ??= fog.color;
    }
    const grade = this.grade;
    g[GLOBALS.grade] = grade.small; g[GLOBALS.grade + 1] = grade.large; g[GLOBALS.grade + 2] = grade.cap;
    g[GLOBALS.grade + 3] = grade.vignette; g[GLOBALS.grade + 4] = grade.hurt; g[GLOBALS.grade + 5] = grade.low;
    g[GLOBALS.grade + 6] = time % 1000; g[GLOBALS.grade + 7] = TUNE.exposure;
    return clear ? [clear.r, clear.g, clear.b] : [0, 0, 0];
  }

  /** The particles' pools as the engine's sprites: those blended by their alpha, then those added. */
  private sprites(): void {
    const pools = [particles.smoke, particles.glow];
    const runs = pools.map((pool, slot) => {
      const count = pool?.count ?? 0;
      if (this.spriteRuns[slot].length < count * 8) this.spriteRuns[slot] = new Float32Array(count * 16);
      const run = this.spriteRuns[slot];
      for (let i = 0; i < count; i++) {
        const at = i * 8;
        run[at] = pool.pos[i * 3]; run[at + 1] = pool.pos[i * 3 + 1]; run[at + 2] = pool.pos[i * 3 + 2];
        run[at + 3] = pool.size[i];
        run[at + 4] = pool.col[i * 4]; run[at + 5] = pool.col[i * 4 + 1]; run[at + 6] = pool.col[i * 4 + 2];
        run[at + 7] = pool.col[i * 4 + 3];
      }
      return run.subarray(0, count * 8);
    });
    this.engine.set_sprites(runs[0], runs[1]);
    this.freshViews();
  }
  private spriteRuns = [new Float32Array(0), new Float32Array(0)];

  /** The lights the last frame was drawn under, as the globals hold them: for a report. */
  lights(): string {
    const g = this.globals, three = (at: number): string => [g[at], g[at + 1], g[at + 2]].map((v) => v.toFixed(2)).join(' ');
    const shadow = this.sun?.shadow.camera;
    const box = shadow ? `; the sun's view ${shadow.left}..${shadow.right} by ${shadow.bottom}..${shadow.top}, ${shadow.near}..${shadow.far}, zoom ${shadow.zoom}, from ${shadow.position.toArray().map((v) => v.toFixed(1)).join(' ')}, map ${this.sun!.shadow.mapSize.x}, auto ${this.sun!.shadow.autoUpdate}` : '';
    return box + `sun from ${three(GLOBALS.sunDir)} colour ${three(GLOBALS.sunColor)}${g[GLOBALS.fogColor + 3] ? ', shadowed' : ''}; `
      + `flat ${three(GLOBALS.ambient)}; sky ${three(GLOBALS.hemiSky)} over ground ${three(GLOBALS.hemiGround)}; `
      + `${g[GLOBALS.sunDir + 3]} point lights; fog ${g[GLOBALS.ambient + 3]} (${g[GLOBALS.hemiSky + 3].toFixed(4)}, ${g[GLOBALS.hemiGround + 3].toFixed(1)}) colour ${three(GLOBALS.fogColor)}`;
  }

  /** A frame of `scene` from `camera`, drawn by the engine. The scene's matrices are made here, as three's render would. */
  draw(scene: THREE.Scene, camera: THREE.PerspectiveCamera, time: number, renderer: THREE.WebGLRenderer | null = null,
    grade: Grade = PLAIN_GRADE): void {
    const began = perfClock.now();
    this.grade = grade;
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    const stats = this.stats;
    this.frame++;
    this.count = this.boneFloats = this.points = 0;
    this.sun = null;
    this.skipped.clear();
    stats.newMeshes = stats.newTextures = stats.newMaterials = 0;
    if (scene.matrixWorldAutoUpdate) scene.updateMatrixWorld();
    if (!camera.parent && camera.matrixWorldAutoUpdate) camera.updateMatrixWorld();
    this.freshViews();
    this.globals.fill(0, GLOBALS.camPos, GLOBALS.floats);
    this.walk(scene, camera);
    this.addLamps();
    const clear = this.writeGlobals(scene, camera, time);
    this.sprites();
    this.freshViews();
    const walked = perfClock.now();
    this.tape?.frame(this.records.subarray(0, this.count * RECORD), this.bones.subarray(0, this.boneFloats), this.globals, clear);
    this.engine.render(this.count, this.boneFloats, clear[0], clear[1], clear[2]);
    const drawn = perfClock.now();
    const [draws, shadowDraws, objects, culled, triangles, gpuMs] = this.engine.stats();
    Object.assign(stats, {
      records: this.count, draws, shadowDraws, objects, culled, triangles, gpuMs,
      walkMs: walked - began, engineMs: drawn - walked,
    });
  }
}

const EMPTY_FLOATS = new Float32Array(0), EMPTY_SHORTS = new Uint16Array(0), EMPTY_INDICES = new Uint32Array(0);
