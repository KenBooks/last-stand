// The game's materials handed to the engine: each described by its numbers, maps and key, look-alikes sharing one
// engine material so their meshes batch, and a material with a look of its own (`custom.ts`) by its shader's numbers.
import * as THREE from 'three';
import type { SeeThrough } from '../core/seeThrough';
import type { Core } from './core';
import { lookOf, LOOK_FLOATS, type RustLook } from './custom';
import { TUNE } from './globals';
import { kitLookOf } from './looks/kit';
import type { Maps } from './maps';
import type { SeeKinds } from './seeKinds';

/** a material key's bit: its shader leaves its vertices where they are, so it casts (`CASTS_AS_PLACED` in plan.rs) */
const CASTS_AS_PLACED = 32;
/** how many times a material's numbers may move before it stops sharing the engine's materials */
const SHARED_CHANGES = 8;
const WHITE = new THREE.Color(1, 1, 1);

interface MaterialEntry {
  id: number; params: Float32Array; maps: Uint32Array; key: number; seen: number;
  /** how often its numbers moved, and whether the engine's material is its own by now */
  changes: number; own: boolean;
  /** its own shader's numbers as last sent, and its volume */
  custom?: Float32Array;
  volume?: number;
}

export type AnyMaterial = THREE.Material & Partial<{
  color: THREE.Color; map: THREE.Texture | null; roughness: number; metalness: number; emissive: THREE.Color;
  emissiveIntensity: number; emissiveMap: THREE.Texture | null; normalMap: THREE.Texture | null;
  normalScale: THREE.Vector2; roughnessMap: THREE.Texture | null; metalnessMap: THREE.Texture | null;
  isMeshBasicMaterial: boolean; isMeshBasicNodeMaterial: boolean; isShaderMaterial: boolean;
  isMeshPhongMaterial: boolean; alphaMap: THREE.Texture | null;
  positionNode: unknown; colorNode: unknown; fragmentNode: unknown; vertexNode: unknown; seeThrough: unknown;
}>;

export class Materials {
  private materials = new WeakMap<THREE.Material, MaterialEntry>();
  /** the engine's materials by what they hold: two of the game's that look alike are one there, and their meshes
   *  one draw call (each foe's pieces have materials of their own) */
  private shared = new Map<string, number>();
  private shaders = new Map<string, number>();
  private volumes = new WeakMap<THREE.Data3DTexture, { id: number; version: number; cells: number }>();
  private scratchParams = new Float32Array(20);
  private scratchMaps = new Uint32Array(4);
  private scratchLook = new Float32Array(LOOK_FLOATS);
  /** a look's two maps, then its volume */
  private scratchExtra = new Uint32Array(5);

  constructor(private core: Core, private maps: Maps, private seeKinds: SeeKinds) {}

  /** What's kept of the materials handed over forgotten: the next frame hands each over again. */
  forget(): void {
    this.materials = new WeakMap();
    this.shared = new Map();
    this.shaders = new Map();
    this.volumes = new WeakMap();
  }

  /** A material's numbers, maps and key written to the scratch arrays; false for one the engine can't draw. */
  private describe(material: AnyMaterial, look?: RustLook): number {
    // (a shader material is drawn by its look alone: unlit, white under whatever its look writes)
    if (!look && (!material.color || material.isShaderMaterial)) return -1;
    // (moved or cut by three's nodes: grass grown from a texture, a flame's own fragment)
    // (placed by its nodes: the village's blades, grown from their cells. A position node alone is the wind's sway,
    // which the engine leaves out: the Thornwood's grass stands still. One with a look of its own for the engine
    // is drawn by that)
    const placedByNodes = (material.positionNode && material.colorNode) || material.fragmentNode || material.vertexNode;
    if (!look && placedByNodes) return -1;
    const p = this.scratchParams, maps = this.scratchMaps, held = this.maps;
    const unlit = !!(material.isMeshBasicMaterial || material.isMeshBasicNodeMaterial || material.isShaderMaterial);
    const map = material.map ?? null;
    const tint = material.color ?? WHITE;
    p[0] = tint.r; p[1] = tint.g; p[2] = tint.b; p[3] = material.opacity;
    const glow = material.emissive, glowBy = material.emissiveIntensity ?? 1;
    p[4] = glow ? glow.r * glowBy : 0; p[5] = glow ? glow.g * glowBy : 0; p[6] = glow ? glow.b * glowBy : 0;
    p[7] = material.alphaTest;
    p[8] = material.roughness ?? (material.isMeshPhongMaterial ? 0.5 : 1);
    p[9] = material.metalness ?? 0;
    p[10] = material.normalScale?.x ?? 1;
    // (what the game dissolves where it hides the hero: core/seeThrough.ts marks it)
    p[11] = this.seeKinds.kindOf(material.seeThrough as SeeThrough | undefined);
    const placed = map ?? material.alphaMap ?? material.normalMap ?? null;
    p[12] = placed ? placed.repeat.x : 1; p[13] = placed ? placed.repeat.y : 1;
    p[14] = placed ? placed.offset.x : 0; p[15] = placed ? placed.offset.y : 0;
    const rough = material.roughnessMap ?? material.metalnessMap ?? null;
    // (an alpha map alone is handed over as it is and read as one by the shader, `flags.w`: every one the game
    // has. With a base map the two are joined on the page, their bytes read back, `cutOutId`)
    const alphaAlone = !!material.alphaMap && !map;
    if (alphaAlone) maps[0] = held.textureId(material.alphaMap);
    else maps[0] = material.alphaMap ? held.cutOutId(map, material.alphaMap) : held.textureId(map);
    maps[1] = held.textureId(material.normalMap);
    maps[2] = held.textureId(rough);
    maps[3] = held.textureId(material.emissiveMap);
    p[16] = unlit ? 1 : 0;
    p[17] = material.vertexColors ? 1 : 0;
    p[18] = maps[1] ? 1 : 0;
    p[19] = (maps[2] ? 1 : 0) + (alphaAlone && maps[0] ? 2 : 0);
    // (3: its colour already multiplied by its alpha, the flames' light over what they hide)
    const multiplied = material.blending === THREE.CustomBlending && material.blendSrc === THREE.OneFactor;
    const blend = multiplied ? 3 : material.blending === THREE.AdditiveBlending ? 2 : material.transparent ? 1 : 0;
    const side = material.side === THREE.DoubleSide ? 1 : material.side === THREE.BackSide ? 2 : 0;
    return blend | (side << 2) | (material.depthWrite ? 16 : 0);
  }

  /** Whether `material` blends only where the game thins it and is thinned nowhere this frame: drawn solid, with
   *  what's opaque (the engine's `SOLID`). One the game made see-through to thin it (a wall, a roof's beams) is
   *  whole otherwise; a roof that tells its share in its alpha (custom blending) and what writes no depth stay
   *  blended. */
  solidNow(material: AnyMaterial): boolean {
    if (!TUNE.solidSee || !material.transparent || !material.depthWrite || material.opacity < 1) return false;
    if (material.blending !== THREE.NormalBlending) return false;
    return this.seeKinds.solid(material.seeThrough as SeeThrough | undefined);
  }

  /** The engine's material for the numbers, maps and key in the scratch arrays: one for every material alike. */
  private sharedId(key: number): number {
    const core = this.core;
    const signature = `${key}|${this.scratchMaps.join(',')}|${this.scratchParams.join(',')}`;
    let id = this.shared.get(signature);
    if (id === undefined) {
      id = core.engine.add_material(this.scratchParams, this.scratchMaps, key);
      this.shared.set(signature, id);
      core.held.materials++;
      core.stats.newMaterials++;
      core.freshViews();
    }
    return id;
  }

  /** A material's id, its numbers sent again if they moved since the last frame it was drawn in; 0: not drawn.
   *  A material alike another shares its engine material; one whose numbers keep moving (a glow that pulses) is
   *  given one of its own after `SHARED_CHANGES` moves, and written in place from then on. */
  materialId(material: AnyMaterial): number {
    const core = this.core, frame = core.frame;
    let entry = this.materials.get(material);
    if (entry && entry.seen === frame) return entry.id;
    const look = lookOf(material) ?? kitLookOf(material);
    if (TUNE.still && look?.moved && entry?.id && !look.moved()) {
      entry.seen = frame;
      return entry.id;
    }
    if (look) return look.shared ? this.sharedLookId(material, look, entry) : this.lookId(material, look, entry);
    const key = this.describe(material);
    if (key < 0) {
      if (!entry) {
        entry = { id: 0, params: new Float32Array(0), maps: new Uint32Array(0), key: -1, seen: 0, changes: 0, own: false };
        this.materials.set(material, entry);
      }
      entry.seen = frame;
      return 0;
    }
    const p = this.scratchParams, maps = this.scratchMaps;
    if (!entry || !entry.id) {
      entry = { id: this.sharedId(key), params: p.slice(), maps: maps.slice(), key, seen: frame, changes: 0, own: false };
      this.materials.set(material, entry);
      return entry.id;
    }
    entry.seen = frame;
    const kept = entry;
    const sameMaps = kept.key === key && maps.every((map, slot) => map === kept.maps[slot]);
    if (sameMaps && !p.some((value, index) => value !== kept.params[index])) return kept.id;
    kept.changes++;
    if (!kept.own && kept.changes > SHARED_CHANGES) {
      kept.own = true;
      kept.id = core.engine.add_material(p, maps, key);
      core.held.materials++;
      core.freshViews();
    } else if (!kept.own) {
      kept.id = this.sharedId(key);
    } else if (sameMaps) {
      core.engine.set_material_params(kept.id, p);
    } else {
      core.engine.replace_material(kept.id, p, maps, key);
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
      id = this.core.engine.add_shader(look.shader.hooks);
      this.shaders.set(look.shader.name, id);
      this.core.freshViews();
    }
    return id;
  }

  /** A volume's id, its cells sent again as its version moves on (a new one made when its size does). */
  private volumeId(volume: THREE.Data3DTexture | undefined): number {
    if (!volume) return 0;
    const core = this.core;
    const { data, width, height, depth } = volume.image as { data: Uint8Array; width: number; height: number; depth: number };
    const entry = this.volumes.get(volume);
    if (entry && entry.version === volume.version) return entry.id;
    if (!(data instanceof Uint8Array) || data.length !== width * height * depth) return 0;
    if (entry && entry.cells === data.length) {
      core.engine.set_volume(entry.id, data);
      entry.version = volume.version;
      return entry.id;
    }
    const id = core.engine.add_volume(width, height, depth, data);
    this.volumes.set(volume, { id, version: volume.version, cells: data.length });
    core.freshViews();
    return id;
  }

  /** The engine's material for a look's shader, the numbers, maps and key in the scratch arrays: made the first time
   *  they're met, one for every material alike. */
  private sharedLook(look: RustLook, key: number): number {
    const core = this.core, p = this.scratchParams, maps = this.scratchMaps;
    const numbers = this.scratchLook.subarray(0, look.shared);
    const signature = `${look.shader.name}|${key}|${maps.join(',')}|${p.join(',')}|${numbers.join(',')}`;
    let id = this.shared.get(signature);
    if (id === undefined) {
      this.scratchExtra.fill(0);
      id = core.engine.add_custom_material(this.shaderId(look), p, maps, key, this.scratchLook, this.scratchExtra);
      this.shared.set(signature, id);
      core.held.materials++;
      core.stats.newMaterials++;
      core.freshViews();
    }
    return id;
  }

  /** A material whose look is shared (`RustLook.shared`): the engine's material for what it holds now, as a plain
   *  material's is (`materialId`); one whose numbers keep moving (a foe dissolving) gets its own after
   *  `SHARED_CHANGES` moves, written in place from then on. Such a look has no maps or volume of its own. */
  private sharedLookId(material: AnyMaterial, look: RustLook, entry: MaterialEntry | undefined): number {
    const core = this.core, frame = core.frame;
    const described = this.describe(material, look);
    if (described < 0) return 0;
    const key = described | (look.casts ? CASTS_AS_PLACED : 0);
    const p = this.scratchParams, maps = this.scratchMaps, numbers = this.scratchLook;
    // (only the numbers that tell two apart are written and read: a foe's every piece comes through here a frame)
    const count = look.shared!;
    numbers.fill(0, 0, count);
    look.numbers(numbers);
    if (!entry) {
      entry = {
        id: this.sharedLook(look, key), params: p.slice(), maps: maps.slice(), key, seen: frame, changes: 0, own: false,
        custom: numbers.slice(0, count),
      };
      this.materials.set(material, entry);
      return entry.id;
    }
    entry.seen = frame;
    const kept = entry, sent = entry.custom!;
    const sameMaps = kept.key === key && maps.every((map, slot) => map === kept.maps[slot]);
    const sameParams = !p.some((value, index) => value !== kept.params[index]);
    let sameNumbers = true;
    for (let index = 0; index < count; index++) {
      if (numbers[index] !== sent[index]) { sameNumbers = false; break; }
    }
    if (sameMaps && sameParams && sameNumbers) return kept.id;
    kept.changes++;
    if (!kept.own && kept.changes > SHARED_CHANGES && sameMaps) {
      kept.own = true;
      this.scratchExtra.fill(0);
      kept.id = core.engine.add_custom_material(this.shaderId(look), p, maps, key, numbers, this.scratchExtra);
      core.held.materials++;
      core.freshViews();
    } else if (!kept.own || !sameMaps) {
      kept.own = false;
      kept.id = this.sharedLook(look, key);
    } else {
      if (!sameParams) core.engine.set_material_params(kept.id, p);
      if (!sameNumbers) core.engine.set_material_custom(kept.id, numbers);
    }
    kept.maps.set(maps);
    kept.params.set(p);
    sent.set(numbers.subarray(0, count));
    kept.key = key;
    return kept.id;
  }

  /** A material with a look of its own: an engine material to itself, its shader's numbers sent as they move. */
  private lookId(material: AnyMaterial, look: RustLook, entry: MaterialEntry | undefined): number {
    const core = this.core, held = this.maps;
    const described = this.describe(material, look);
    if (described < 0) return 0;
    const key = described | (look.casts ? CASTS_AS_PLACED : 0);
    const p = this.scratchParams, maps = this.scratchMaps, numbers = this.scratchLook;
    numbers.fill(0);
    look.numbers(numbers);
    const volume = this.volumeId(look.volume?.());
    // (a volume made anew, a loop baked since: the material made again round it)
    if (entry && entry.volume !== volume) {
      core.engine.drop_material(entry.id);
      core.held.materials--;
      entry = undefined;
    }
    if (!entry) {
      const extra = this.scratchExtra;
      extra[0] = held.textureId(look.maps?.[0]);
      extra[1] = held.textureId(look.maps?.[1]);
      extra[2] = volume;
      extra[3] = held.textureId(look.maps?.[2]);
      extra[4] = held.textureId(look.maps?.[3]);
      const id = core.engine.add_custom_material(this.shaderId(look), p, maps, key, numbers, extra);
      entry = {
        id, params: p.slice(), maps: maps.slice(), key, seen: core.frame, changes: 0, own: true, custom: numbers.slice(),
        volume,
      };
      this.materials.set(material, entry);
      core.held.materials++;
      core.stats.newMaterials++;
      core.freshViews();
      return id;
    }
    entry.seen = core.frame;
    const kept = entry, sent = entry.custom!;
    if (p.some((value, index) => value !== kept.params[index])) {
      core.engine.set_material_params(kept.id, p);
      kept.params.set(p);
    }
    if (numbers.some((value, index) => value !== sent[index])) {
      core.engine.set_material_custom(kept.id, numbers);
      sent.set(numbers);
    }
    return kept.id;
  }
}
