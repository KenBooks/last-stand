// The game's scene handed to the Rust engine (Bulwark, `pkg/`): the trial behind `?renderer=rust`. The game keeps its
// three.js scene; each frame this walks what's shown, hands over each geometry, texture and material the first time
// it's met (and again when its version moves on), and writes a record a mesh straight into the engine's memory, with
// the skinned meshes' bones and the frame's globals (camera, sun and its shadow's view, sky, point lights, fog).
// What it can't hand over is counted by its kind (`skipped`): shader materials, sprites, points, lines.
// Its parts, each a module beside it: what they share (`core.ts`), the maps (`maps.ts`), the materials
// (`materials.ts`), the geometry and bones (`geometry.ts`), the lights (`lights.ts`), the kinds of see-through
// (`seeKinds.ts`), the particles (`sprites.ts`) and the frame's globals (`globals.ts`). Here: the scene's matrices,
// the walk, a record a mesh, what's handed over ahead, and a frame drawn or written down.
import * as THREE from 'three';
import type { Engine, InitOutput } from './pkg/bulwark';
import { perfClock } from '../core/perfClock';
import { shownPlace, shownPointLights } from '../core/webgpu';
import { Core, MAX_MAP, RECORD } from './core';
import { casterGeometry } from '../entities/models/farDetail';
import { lookOf } from './custom';
import { Geometries } from './geometry';
import { Ahead } from './ahead';
import { LampShadows } from './lampShadows';
import { AHEAD } from './pipelinesAside';
import { G } from '../state';
import { lampShadowsAllowed } from '../core/lamps';
import { LightCache } from './lightCache';
import { GLOBALS, PLAIN_GRADE, TUNE, shadowSizeOf, writeGlobals, type Grade } from './globals';
import { Levels } from './levels';
import { FrameLook } from './frameLook';
import { Lights } from './lights';
import { Kept } from './kept';
import { Maps } from './maps';
import { Materials, type AnyMaterial } from './materials';
import { SeeKinds } from './seeKinds';
import { Sprites } from './sprites';
import { recording, Tape } from './tape';

export { TUNE, type Grade } from './globals';
export type { FrameStats } from './core';

/** a record's flags (plan.rs) */
/** how a record casts: as its mesh says, not at all (another record casts for it), or in the shadow alone */
type Cast = 'own' | 'none' | 'only';
const CASTS_SHADOW = 1, NEVER_CULLED = 2, SHADOW_ONLY = 4, ARMS = 8, SOLID = 16, LOW_RES = 32, THINNED = 64;
/** where a record says how many instances its mesh draws by itself (`RAW_INSTANCES` in plan.rs) */
const RAW_INSTANCES = 7;
/** how far under the scene a hidden object is a place left as it stands (the biomes' roots, the village's) */
const HIDDEN_PLACES = 2;
/** three's own update of an object's matrices: a kind with another is left to its own */
const PLAIN_UPDATE = THREE.Object3D.prototype.updateMatrixWorld;

const scratchMatrix = new THREE.Matrix4();

/** each still mesh's radius in the world (m), found once: it doesn't move */
const radii = new WeakMap<THREE.Mesh, number>();

/**
 * How far a still mesh reaches from its middle (m). A level keeps what's smaller than its least caster from
 * casting the sun's shadow (`minCasterRadius`: 9 cm at High, 30 at Very low), and the still things taken for casters
 * (`TUNE.castAll`) cast whatever their size.
 */
function radiusOf(mesh: THREE.Mesh): number {
  let radius = radii.get(mesh);
  if (radius === undefined) {
    if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
    radius = (mesh.geometry.boundingSphere?.radius ?? Infinity) * mesh.matrixWorld.getMaxScaleOnAxis();
    radii.set(mesh, radius);
  }
  return radius;
}

export class Bridge {
  private core: Core;
  private maps: Maps;
  private seeKinds: SeeKinds;
  private materials: Materials;
  private geometries: Geometries;
  private lit: Lights;
  private lampShadows: LampShadows;
  private lightCache: LightCache;
  /** what the quality level asks of the engine (`levels.ts`) */
  readonly levels: Levels;
  private readonly frameLook: FrameLook;
  private particles: Sprites;
  /** what stands still, kept by the engine (`kept.ts`) */
  readonly kept: Kept;
  /** what a frame handed over and drew */
  readonly stats: Core['stats'];
  /** what wasn't handed over, by its kind, on the last frame */
  readonly skipped: Core['skipped'];
  /** how many of each the engine holds */
  readonly held: Core['held'];

  private stack: THREE.Object3D[] = [];
  /** what's handed over ahead of its first frame (`ahead.ts`) */
  readonly ahead: Ahead;
  private grade: Grade = PLAIN_GRADE;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.Camera | null = null;

  constructor(engine: Engine, wasm: InitOutput) {
    const core = this.core = new Core(engine, wasm);
    this.maps = new Maps(core);
    this.seeKinds = new SeeKinds(core);
    this.materials = new Materials(core, this.maps, this.seeKinds);
    this.geometries = new Geometries(core);
    this.lit = new Lights(core);
    this.lampShadows = new LampShadows(core);
    this.lit.lampSlot = (lamp) => this.lampShadows.slot(lamp);
    this.lit.lampTaking = () => this.lampShadows.taking;
    this.lightCache = new LightCache(core);
    this.levels = new Levels(core);
    this.frameLook = new FrameLook(core, this.maps);
    this.ahead = new Ahead(core, this.geometries, this.materials);
    this.lit.lampReach = this.lampShadows.reachOf = (lamp, reach) => this.lightCache.reachOf(lamp, reach);
    this.lit.ownReach = this.lampShadows.ownReachOf = (light) => this.lightCache.ownReach(light);
    this.lit.ownSlot = (light) => this.lampShadows.ownSlot(light);
    this.particles = new Sprites(core);
    this.kept = new Kept(core, this.materials, (mesh) => this.addMesh(mesh), (object) => this.visit(object));
    this.stats = core.stats;
    this.skipped = core.skipped;
    this.held = core.held;
  }

  /** What's kept of what was handed over forgotten: the next frame hands everything over again. */
  private forget(): void {
    // (what's kept is written by the ids forgotten here)
    this.kept.forget();
    this.geometries.forget();
    this.maps.forget();
    this.materials.forget();
  }

  /**
   * A frame drawn and written down as a tape (`tape.ts`): everything handed over anew, its maps no larger than
   * `mostMap` a side, for the engine's own harness to draw with no browser. The engine keeps what was handed over
   * before and for the tape too (a harness's page, not a player's: nothing is dropped).
   */
  capture(width: number, height: number, mostMap: number, ...frame: Parameters<Bridge['draw']>): Blob {
    const core = this.core, engine = core.engine, tape = new Tape(width, height);
    core.engine = recording(engine, tape);
    core.tape = tape;
    core.mostMap = mostMap;
    this.forget();
    // (a tape's frame is its records alone: nothing kept while it's written)
    this.kept.off = true;
    try {
      this.draw(...frame);
    } finally {
      core.engine = engine;
      core.tape = null;
      core.mostMap = MAX_MAP;
      this.kept.off = false;
      this.forget();
    }
    return tape.blob();
  }

  private record(mesh: THREE.Mesh, geometryId: number, material: AnyMaterial, first: number, count: number, set: number,
    bones: number, raw = 0, cast: Cast = 'own'): void {
    const core = this.core;
    const materialId = this.materials.materialId(material);
    if (!materialId) { core.skip(material.type); return; }
    this.watched?.add(mesh);
    if (core.count === core.capacity) core.takeViews(core.capacity * 2, core.boneCapacity);
    const r = core.records, at = core.count * RECORD;
    r[at] = geometryId; r[at + 1] = materialId; r[at + 2] = first; r[at + 3] = count; r[at + 4] = set; r[at + 5] = bones;
    // (a material that writes no colour is in the frame for its shadow or its depth alone: the game's merged casters)
    // (a body moved by its bones casts only where the game says: a level keeps the heroes and the foes from
    // casting, and taken for the village's still things they cast at every level, 260 thousand triangles a frame)
    const still = !(mesh as THREE.SkinnedMesh).isSkinnedMesh;
    const casts = cast !== 'none' && (mesh.castShadow || (TUNE.castAll && mesh.receiveShadow && still
      && radiusOf(mesh) >= (this.grade.casterLeast ?? 0)));
    r[at + 6] = (casts ? CASTS_SHADOW : 0) | (mesh.frustumCulled ? 0 : NEVER_CULLED)
      | (material.colorWrite === false || cast === 'only' ? SHADOW_ONLY : 0)
      | (this.materials.solidNow(material) ? SOLID : 0)
      // (what the game thins by blending: before all else that blends, the larger first, Bulwark's `THINNED`)
      | (this.materials.thinnedByBlending(material) ? THINNED : 0)
      // (what a game marks as costing by its pixels, `userData.lowRes`, and the fires' flames: at a share of them)
      | (TUNE.lowRes && (mesh.userData.lowRes || mesh.userData.fireFlames) ? LOW_RES : 0);
    if (r[at + 6] & SOLID) core.stats.solid++;
    if (cast === 'only') core.stats.casters++;
    // (his arms through his eyes: by their own view, never culled by the world's, casting nothing)
    if (this.armsNow) {
      r[at + 6] = ARMS | NEVER_CULLED;
      core.stats.arms++;
    }
    r[at + RAW_INSTANCES] = raw;
    // (a mesh's bones: a look's list rides in their place, its mesh where it stands)
    if (bones >= 0 && (mesh as THREE.SkinnedMesh).isSkinnedMesh) {
      const skinned = mesh as THREE.SkinnedMesh;
      scratchMatrix.multiplyMatrices(mesh.matrixWorld, skinned.bindMatrixInverse).toArray(r, at + 8);
    } else {
      r.set(mesh.matrixWorld.elements, at + 8);
    }
    core.count++;
  }

  private addMesh(mesh: THREE.Mesh): void {
    // (the particles' pools are handed over whole: `sprites.ts`)
    if (mesh.userData.particles || mesh.name === 'dazed stars') return;
    const geometry = mesh.geometry;
    const look = Array.isArray(mesh.material) ? undefined : lookOf(mesh.material);
    if (look?.before && this.renderer) {
      mesh.onBeforeRender(this.renderer, this.scene!, this.camera!, geometry, mesh.material as THREE.Material,
        null as unknown as THREE.Group);
    }
    // (a geometry of instances it counts itself: each placed by its material's look, from its index)
    const counted = geometry as THREE.InstancedBufferGeometry;
    const raw = counted.isInstancedBufferGeometry ? counted.instanceCount : 0;
    if (counted.isInstancedBufferGeometry && (!look || !(raw > 0) || raw === Infinity)) {
      if (!look) this.core.skip('instanced geometry');
      return;
    }
    const geometryId = this.geometries.geometryId(geometry, look?.position);
    if (!geometryId) return;
    const instanced = mesh as unknown as THREE.InstancedMesh, skinned = mesh as THREE.SkinnedMesh;
    if (instanced.isInstancedMesh && instanced.count === 0) return;
    const set = instanced.isInstancedMesh ? this.geometries.setId(instanced) : 0;
    const bones = skinned.isSkinnedMesh && skinned.skeleton ? this.geometries.bonesOf(skinned)
      : look?.list ? this.geometries.listOf(look.list()) : -1;
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
    // (a hero's piece casts from fewer triangles, a record of its own for the shadow alone: `casterGeometry`)
    const whole = to === Infinity && from === 0 && !raw && !set && !this.armsNow && mesh.castShadow;
    const caster = whole ? casterGeometry(mesh) : null;
    const casterId = caster ? this.geometries.geometryId(caster, look?.position) : 0;
    this.record(mesh, geometryId, material, from, to === Infinity ? 0 : range.count, set, bones, raw,
      casterId ? 'none' : 'own');
    if (casterId) this.record(mesh, casterId, material, 0, 0, set, bones, 0, 'only');
  }

  /**
   * The scene's matrices made as three's `updateMatrixWorld` makes them, but for a whole place that isn't shown (a
   * battleground the hero isn't in, the village left for a run: a hidden object within `HIDDEN_PLACES` levels of the
   * scene), which is left as it stands until it's shown again and made whole then. Every biome is in the scene from
   * the boot, and three walks them all each frame: a third of the render's CPU with the engine drawing. What's shown
   * is three's own update, every object every frame: made only where a position, turn or scale had changed, a hero
   * the game had placed by his matrices alone stood a pace off his own outline in the hall of heroes (from play:
   * "bugs").
   */
  private placeShown(object: THREE.Object3D, moved: boolean, depth: number): void {
    const kept = object as unknown as { placedLate?: boolean };
    if (!object.visible && depth > 0) {
      kept.placedLate = true;
      return;
    }
    if (kept.placedLate) {
      kept.placedLate = false;
      moved = true;
    }
    if (depth === HIDDEN_PLACES || object.updateMatrixWorld !== PLAIN_UPDATE) { object.updateMatrixWorld(moved); return; }
    if (object.matrixAutoUpdate) object.updateMatrix();
    if (object.matrixWorldNeedsUpdate || moved) {
      if (object.matrixWorldAutoUpdate) {
        if (object.parent) object.matrixWorld.multiplyMatrices(object.parent.matrixWorld, object.matrix);
        else object.matrixWorld.copy(object.matrix);
      }
      object.matrixWorldNeedsUpdate = false;
      moved = true;
    }
    const children = object.children;
    for (let i = 0; i < children.length; i++) this.placeShown(children[i], moved, depth + 1);
  }

  /** the mesh being recorded is the hero's arms through his eyes */
  private armsNow = false;
  /** The first `lamps` lamps' shadows asked for, of `casters` (`lampShadows.ts`): drawn a lamp a frame. */
  bakeLamps(casters: THREE.Mesh[], lamps: number): void {
    this.lampShadows.ask(casters, lamps);
    this.lightCache.ask(casters);
  }
  /** A harness's: the lamps in the engine's light cache and its last bake (`lightCache.ts`). */
  lightCacheNow(): ReturnType<LightCache['now']> { return this.lightCache.now(); }
  /** A harness's: how many lamps' shadows are drawn, and how many wait. */
  lampShadowsNow(): ReturnType<LampShadows['now']> { return this.lampShadows.now(); }
  /** A harness's: the last frame's point lights, a line each (`Lights.pointLines`). */
  pointLines(): string[] { return this.lit.pointLines(); }

  /** A harness's: how many kinds of see-through the engine holds, and how many of them thin anything this frame (a
   *  hole, a share of the whole, a door open). */
  seeKindsNow(): { held: number; thinning: number } { return this.seeKinds.now(); }

  /** A harness's: the meshes handed to the engine since it was set (`lab rustcheck`: every foe of a fight drawn). */
  watched: Set<THREE.Object3D> | null = null;
  /** A harness's: how many point lights the last frame was lit by (a place's own, the effects', the lamps'). */
  pointsNow(): number { return this.lit.points; }

  /** A harness's: the shelter as the last frame had it (its box's least x and z and its most, the sky's share under
   *  it, its walls' tops). */
  shelterNow(): number[] { return this.lit.shelterNow(); }

  /** The lights the last frame was drawn under, as the globals hold them: for a report. */
  lights(): string { return this.lit.report(); }

  /** One object of the scene taken into the frame: a mesh's records, a light, what isn't drawn counted. */
  private visit(object: THREE.Object3D): void {
    const camera = this.camera!, arms = this.grade.arms ?? null;
    if ((object as THREE.Mesh).isMesh) {
      if (object.layers.test(camera.layers)) this.addMesh(object as THREE.Mesh);
      else if (arms && object.layers.test(arms.layers)) {
        // (on the arms' layer alone, seen through his eyes: the game draws them in a pass of their own, with
        // a camera of their own, which the engine's frame has in it. Left out, he held nothing: from play,
        // "no warrior weapon in first person")
        this.armsNow = true;
        this.addMesh(object as THREE.Mesh);
        this.armsNow = false;
      }
    } else if ((object as THREE.Light).isLight) {
      // (the rig's copies of the shown place's lights are three's: the place's own are added after the walk)
      if (!object.userData.rigged) this.lit.add(object as THREE.Light);
    } else if ((object as THREE.Points).isPoints || (object as THREE.Line).isLine || (object as THREE.Sprite).isSprite) {
      if (object.layers.test(camera.layers)) this.core.skip(object.type);
    }
  }

  private walk(scene: THREE.Scene): void {
    const stack = this.stack;
    stack.length = 0;
    stack.push(scene);
    while (stack.length) {
      const object = stack.pop()!;
      if (!object.visible) continue;
      // (a part that stands still is the engine's to draw, handed over once: `kept.ts`)
      if (this.kept.takes(object)) continue;
      this.visit(object);
      const children = object.children;
      for (let i = 0; i < children.length; i++) stack.push(children[i]);
    }
  }

  /** A frame of `scene` from `camera`, drawn by the engine. The scene's matrices are made here, as three's render would. */
  draw(scene: THREE.Scene, camera: THREE.PerspectiveCamera, time: number, renderer: THREE.WebGLRenderer | null = null,
    grade: Grade = PLAIN_GRADE): void {
    const began = perfClock.now();
    const core = this.core, stats = core.stats;
    this.grade = grade;
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    core.frame++;
    core.count = core.boneFloats = 0;
    this.lit.begin();
    // (a lamp's shadow drawn ahead of the frame, whose own records are written over its casters')
    if (this.lightCache.step((mesh) => this.addMesh(mesh))) this.lampShadows.again();
    // (the shown place's own casting lights: asked again as the place, its lights or its props change)
    this.lampShadows.keepOwn(shownPlace(), shownPointLights(), AHEAD.propsRev, camera.position);
    this.lampShadows.step((mesh) => this.addMesh(mesh));
    // (only where the level reads the lamps' shadows at all: drawn at Very low, where nothing read them, the
    // movers' faces were 12 passes a frame for nothing, a phone's GPU split from 15% outside the frame to 48%)
    const moving = TUNE.lampShadows > 0 && TUNE.points && lampShadowsAllowed();
    this.lampShadows.moved((mesh) => this.addMesh(mesh), moving ? G.players.map((player) => player.obj) : []);
    core.skipped.clear();
    stats.newMeshes = stats.movedMeshes = stats.newTextures = stats.newMaterials = stats.arms = stats.solid = stats.casters = 0;
    if (scene.matrixWorldAutoUpdate) {
      if (TUNE.still) this.placeShown(scene, false, 0);
      else scene.updateMatrixWorld();
    }
    if (!camera.parent && camera.matrixWorldAutoUpdate) camera.updateMatrixWorld();
    const placed = perfClock.now();
    core.freshViews();
    core.globals.fill(0, GLOBALS.camPos, GLOBALS.floats);
    this.kept.begin(camera, grade);
    this.walk(scene);
    this.kept.finish();
    if (this.watched) this.kept.eachDrawn((mesh) => this.watched!.add(mesh));
    for (const light of shownPointLights()) this.lit.add(light);
    this.lit.addLamps();
    this.lightCache.tell();
    this.seeKinds.write();
    const clear = writeGlobals(core.globals, scene, camera, time, this.lit, this.grade);
    this.levels.tell(this.grade, shadowSizeOf(this.lit.sun));
    this.frameLook.tell(this.grade);
    this.particles.send();
    core.freshViews();
    const walked = perfClock.now();
    core.tape?.frame(core.records.subarray(0, core.count * RECORD), core.bones.subarray(0, core.boneFloats), core.globals,
      clear);
    core.engine.render(TUNE.scene > 0 ? core.count : 0, core.boneFloats, clear[0], clear[1], clear[2]);
    const drawn = perfClock.now();
    const [draws, shadowDraws, objects, culled, triangles, gpuMs, gpuReads, gpuBusy, shadowTriangles, shadowsKept,
      lowDraws, lightsLeftOut, fieldKept, fieldCounted]
      = core.engine.stats();
    Object.assign(stats, {
      records: core.count + this.kept.now.records, draws, shadowDraws, objects, culled, triangles, gpuMs, gpuReads, gpuBusy, shadowTriangles, shadowsKept,
      lowDraws, lightsLeftOut, fieldKept, fieldCounted,
      placeMs: placed - began, walkMs: walked - placed, engineMs: drawn - walked,
    });
  }
}
