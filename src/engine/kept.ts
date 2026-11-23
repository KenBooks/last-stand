// What stands still, kept by the engine (Bulwark's kept.rs): a part of the world the game says never moves
// (`standStill` in world/props.ts, its `userData.standsStill`) is handed over once, a run of records a mesh, and
// drawn every frame after with no walk of it and no record written. What changes on it reaches the engine as it
// changes: an object shown or hidden (its `visible` is watched from then on), a material whose numbers, maps or
// thinning moved (asked once a frame a material, not a mesh), the part itself shown or left by the walk. What
// can't be kept is walked each frame as before (`rest`): a light, a mesh moved by bones or placed by its look, a
// set of instances. What nothing tells (a mesh given another material, a child added) is found by an audit that
// writes a few meshes' records again each frame and compares: counted (`stale`), and put right.
import * as THREE from 'three';
import { RECORD, type Core } from './core';
import { lookOf } from './custom';
import { TUNE, type Grade } from './globals';
import type { AnyMaterial, Materials } from './materials';

/** a kept record's flag where the game hides it (`HIDDEN` in the engine's kept.rs), and where a record's flags are */
const HIDDEN = 128, FLAGS = 6;
/** how many frames a part the walk no longer reaches is kept for (a place left for a run comes back) */
const LET_GO_AFTER = 1800;
/** how many meshes' records an audit writes again a frame */
const AUDITED = 2;
/** a mesh whose records were made again more often than this in `RESTLESS_FRAMES` is walked each frame instead */
const RESTLESS = 24, RESTLESS_FRAMES = 120;

/** A kept mesh: its run of records in the engine (none while it's hidden and was never shown), and those records
 *  as they were written. */
interface Entry {
  mesh: THREE.Mesh;
  root: Root;
  first: number;
  count: number;
  floats: Float32Array | null;
  hidden: boolean;
  materials: AnyMaterial[];
  /** how many of its records are see-through drawn solid, and how many cast from fewer triangles */
  solid: number;
  casters: number;
  /** how often its records were made again since `changesFrom`, and the frame they were last made in */
  changes: number;
  changesFrom: number;
  made: number;
}

/** A material of a part's kept meshes: what it was when their records were written, and whose they are. */
interface MaterialState { stamp: number; entries: Set<Entry> }

/** A part of the world that stands still: its kept meshes, what of it is walked each frame, and whether the
 *  engine shows it. */
interface Root {
  object: THREE.Object3D;
  entries: Entry[];
  rest: THREE.Object3D[];
  materials: Map<AnyMaterial, MaterialState>;
  shown: boolean;
  seen: number;
  /** how many objects it held when it was built */
  size: number;
  /** its records shown, and of them the solid and the casters': summed again when `summed` is false */
  records: number;
  solid: number;
  casters: number;
  summed: boolean;
}

/** Whether `object` and all over it up to `root` (not `root` itself: the walk's) are shown. */
function shownUnder(object: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let at: THREE.Object3D | null = object; at && at !== root; at = at.parent) {
    if (!at.visible) return false;
  }
  return true;
}

export class Kept {
  private roots = new Map<THREE.Object3D, Root>();
  private entries = new WeakMap<THREE.Object3D, Entry>();
  /** the part each watched object is under */
  private owner = new WeakMap<THREE.Object3D, Root>();
  /** objects shown or hidden since the last frame */
  private flipped: THREE.Object3D[] = [];
  /** what every record was written under: the camera's layers, the level's casters, the switches a record reads */
  private signature = '';
  private camera: THREE.Camera | null = null;
  /** where the audit is: the part, and the mesh within it */
  private auditRoot = 0;
  private auditEntry = 0;
  /** nothing is kept while a frame is written down as a tape */
  off = false;
  /** how many kept meshes the audits found changed with nothing to say so (a harness's: none is the aim) */
  stale = 0;
  /** what the engine shows of what's kept this frame: records, meshes, parts */
  readonly now = { records: 0, meshes: 0, parts: 0 };

  /**
   * @param add a mesh's records written at the frame's end (`Bridge.addMesh`)
   * @param visit an object taken as the walk takes one (`Bridge.visit`)
   */
  constructor(private core: Core, private materials: Materials, private add: (mesh: THREE.Mesh) => void,
    private visit: (object: THREE.Object3D) => void) {}

  /** Everything kept let go: the next walk keeps it again. */
  forget(): void {
    for (const root of this.roots.values()) this.letGo(root);
    this.roots.clear();
    this.flipped.length = 0;
  }

  /** A frame begun: its camera, and everything let go if what the records were written under has changed. */
  begin(camera: THREE.Camera, grade: Grade): void {
    this.camera = camera;
    const signature = `${camera.layers.mask}|${grade.casterLeast ?? 0}|${TUNE.castAll}|${TUNE.lowRes}`;
    if (signature !== this.signature || !TUNE.kept || this.off) {
      this.forget();
      this.signature = signature;
    }
  }

  /** Whether the walk leaves `object` and all under it to what's kept: a part that stands still, built the first
   *  time it's met; what of it can't be kept is taken here as the walk would take it. */
  takes(object: THREE.Object3D): boolean {
    if (!object.userData.standsStill || this.off || !TUNE.kept) return false;
    const root = this.roots.get(object) ?? this.build(object);
    root.seen = this.core.frame;
    for (const rest of root.rest) {
      if (shownUnder(rest, object)) this.visit(rest);
    }
    return true;
  }

  /** Whether a mesh's records can be written once: nothing of it is made each frame. */
  private keepable(mesh: THREE.Mesh): boolean {
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh || (mesh as unknown as THREE.InstancedMesh).isInstancedMesh) return false;
    if ((mesh.geometry as THREE.InstancedBufferGeometry).isInstancedBufferGeometry) return false;
    if (mesh.userData.particles || mesh.name === 'dazed stars') return false;
    if (!this.camera || !mesh.layers.test(this.camera.layers)) return false;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    // (a look that lists its own rows, or is run before its draw, is made each frame)
    return materials.every((material) => {
      const look = lookOf(material);
      return !look?.before && !look?.list;
    });
  }

  /** `object`'s `visible` watched from now on: a change is settled at the next frame's end. */
  private watch(object: THREE.Object3D, root: Root): void {
    const watched = this.owner.has(object);
    this.owner.set(object, root);
    if (watched) return;
    let visible = object.visible;
    const flipped = this.flipped;
    Object.defineProperty(object, 'visible', {
      configurable: true,
      enumerable: true,
      get: () => visible,
      set: (value: boolean) => {
        if (value === visible) return;
        visible = value;
        flipped.push(object);
      },
    });
  }

  private build(object: THREE.Object3D): Root {
    const root: Root = {
      object, entries: [], rest: [], materials: new Map(), shown: true, seen: this.core.frame, size: 0,
      records: 0, solid: 0, casters: 0, summed: false,
    };
    this.roots.set(object, root);
    object.traverse((part) => {
      root.size++;
      if (part !== object) this.watch(part, root);
      const mesh = part as THREE.Mesh;
      if (mesh.isMesh && this.keepable(mesh)) {
        const entry: Entry = {
          mesh, root, first: 0, count: 0, floats: null, hidden: false, materials: [], solid: 0, casters: 0,
          changes: 0, changesFrom: this.core.frame, made: 0,
        };
        root.entries.push(entry);
        this.entries.set(mesh, entry);
        this.settle(entry);
      } else if (mesh.isMesh || (part as THREE.Light).isLight || (part as THREE.Points).isPoints
        || (part as THREE.Line).isLine || (part as THREE.Sprite).isSprite) {
        root.rest.push(part);
      }
    });
    return root;
  }

  /** A material as a kept record reads it: its engine material, and how it's drawn now. */
  private stamp(material: AnyMaterial): number {
    return this.materials.materialId(material) * 8 + (material.visible ? 1 : 0)
      + (this.materials.solidNow(material) ? 2 : 0) + (this.materials.thinnedByBlending(material) ? 4 : 0);
  }

  /** A mesh's run of records let go, and its materials no longer its part's to ask. */
  private drop(entry: Entry): void {
    if (entry.first) this.core.engine.drop_kept(entry.first, entry.count);
    for (const material of entry.materials) {
      const state = entry.root.materials.get(material);
      state?.entries.delete(entry);
      if (state && !state.entries.size) entry.root.materials.delete(material);
    }
    entry.first = entry.count = entry.solid = entry.casters = 0;
    entry.floats = null;
    entry.materials = [];
    entry.root.summed = false;
  }

  /** A mesh's records written as the walk would write them, and taken back out of the frame's: the records, and
   *  how many of them are drawn solid and cast from fewer triangles. */
  private written(mesh: THREE.Mesh): { floats: Float32Array; solid: number; casters: number } {
    const core = this.core, stats = core.stats;
    const from = core.count, solid = stats.solid, casters = stats.casters;
    this.add(mesh);
    const floats = core.records.slice(from * RECORD, core.count * RECORD);
    const written = { floats, solid: stats.solid - solid, casters: stats.casters - casters };
    core.count = from;
    stats.solid = solid;
    stats.casters = casters;
    return written;
  }

  /** A mesh no longer kept: walked each frame with its part's rest. */
  private toRest(entry: Entry): void {
    this.drop(entry);
    const root = entry.root;
    root.entries.splice(root.entries.indexOf(entry), 1);
    this.entries.delete(entry.mesh);
    root.rest.push(entry.mesh);
  }

  /** A mesh's records made again and kept in the place of those it had. */
  private refresh(entry: Entry): void {
    const core = this.core, root = entry.root;
    this.drop(entry);
    entry.hidden = !shownUnder(entry.mesh, root.object);
    if (entry.hidden) return;
    if (core.frame - entry.changesFrom > RESTLESS_FRAMES) {
      entry.changes = 0;
      entry.changesFrom = core.frame;
    }
    // (one whose records keep changing, or that the engine draws nothing of, is the walk's)
    const { floats, solid, casters } = this.written(entry.mesh);
    if (++entry.changes > RESTLESS || !floats.length) {
      this.toRest(entry);
      return;
    }
    // (written again at the frame's end, where the walk's own records are)
    core.records.set(floats, core.count * RECORD);
    entry.count = floats.length / RECORD;
    entry.first = core.engine.keep(core.count, entry.count);
    core.freshViews();
    if (!root.shown) core.engine.show_kept(entry.first, entry.count, false);
    Object.assign(entry, { floats, solid, casters, made: core.frame });
    const materials = Array.isArray(entry.mesh.material) ? entry.mesh.material : [entry.mesh.material];
    entry.materials = materials as AnyMaterial[];
    for (const material of entry.materials) {
      let state = root.materials.get(material);
      if (!state) root.materials.set(material, state = { stamp: this.stamp(material), entries: new Set() });
      state.entries.add(entry);
    }
  }

  /** A mesh's records hidden or shown as it is now; made, if it's shown for the first time. */
  private settle(entry: Entry): void {
    const hidden = !shownUnder(entry.mesh, entry.root.object);
    if (!entry.first) {
      if (!hidden) this.refresh(entry);
      return;
    }
    if (hidden === entry.hidden || !entry.floats) return;
    entry.hidden = hidden;
    entry.root.summed = false;
    for (let record = 0; record < entry.count; record++) {
      const flags = entry.floats[record * RECORD + FLAGS];
      this.core.engine.set_kept_flags(entry.first + record, flags + (hidden ? HIDDEN : 0));
    }
  }

  private letGo(root: Root): void {
    for (const entry of root.entries) this.drop(entry);
  }

  /** What was shown or hidden since the last frame settled, each mesh under it. */
  private settleFlipped(): void {
    for (const object of this.flipped) {
      const root = this.owner.get(object);
      if (!root || this.roots.get(root.object) !== root) continue;
      object.traverse((part) => {
        const entry = this.entries.get(part);
        if (entry?.root === root) this.settle(entry);
      });
    }
    this.flipped.length = 0;
  }

  /** The materials of a part's kept meshes asked: the records of one that changed are made again. */
  private settleMaterials(root: Root): void {
    let changed: Entry[] | null = null;
    for (const [material, state] of root.materials) {
      const stamp = this.stamp(material);
      if (stamp === state.stamp) continue;
      state.stamp = stamp;
      for (const entry of state.entries) (changed ??= []).push(entry);
    }
    if (!changed) return;
    for (const entry of changed) {
      if (entry.made !== this.core.frame) this.refresh(entry);
    }
  }

  /** A few kept meshes' records written again and compared with what's kept: what changed with nothing to say so
   *  is counted and put right; a part with objects added or taken is built again. */
  private audit(): void {
    const roots = [...this.roots.values()].filter((root) => root.shown);
    if (!roots.length) return;
    for (let audited = 0; audited < AUDITED; audited++) {
      const root = roots[this.auditRoot % roots.length];
      const entry = root.entries[this.auditEntry++];
      if (!entry) {
        this.auditEntry = 0;
        this.auditRoot = (this.auditRoot + 1) % roots.length;
        let size = 0;
        root.object.traverse(() => { size++; });
        if (size !== root.size) {
          this.stale++;
          this.letGo(root);
          this.roots.delete(root.object);
        }
        return;
      }
      const hidden = !shownUnder(entry.mesh, root.object);
      let same = hidden === entry.hidden || (!entry.first && hidden);
      if (same && entry.first && entry.floats) {
        const { floats } = this.written(entry.mesh);
        const kept = entry.floats;
        same = floats.length === kept.length && floats.every((value, at) => value === kept[at]);
      }
      if (same) continue;
      this.stale++;
      if (entry.first) this.refresh(entry);
      else this.settle(entry);
    }
  }

  /** The frame's end: what changed settled, each part shown or not as the walk met it, one long unmet let go. */
  finish(): void {
    const frame = this.core.frame, engine = this.core.engine, now = this.now;
    now.records = now.meshes = now.parts = 0;
    if (this.off || !TUNE.kept) return;
    this.settleFlipped();
    for (const root of this.roots.values()) {
      const wanted = root.seen === frame && TUNE.scene > 0;
      if (wanted) this.settleMaterials(root);
      if (wanted !== root.shown) {
        root.shown = wanted;
        for (const entry of root.entries) {
          if (entry.first) engine.show_kept(entry.first, entry.count, wanted);
        }
      }
      if (!wanted) {
        if (frame - root.seen > LET_GO_AFTER) {
          this.letGo(root);
          this.roots.delete(root.object);
        }
        continue;
      }
      if (!root.summed) {
        root.records = root.solid = root.casters = 0;
        for (const entry of root.entries) {
          if (!entry.first || entry.hidden) continue;
          root.records += entry.count;
          root.solid += entry.solid;
          root.casters += entry.casters;
        }
        root.summed = true;
      }
      now.records += root.records;
      now.meshes += root.entries.length;
      now.parts++;
      this.core.stats.solid += root.solid;
      this.core.stats.casters += root.casters;
    }
    this.audit();
  }

  /** A harness's: each kept mesh the engine draws now. */
  eachDrawn(each: (mesh: THREE.Mesh) => void): void {
    for (const root of this.roots.values()) {
      if (!root.shown) continue;
      for (const entry of root.entries) {
        if (entry.first && !entry.hidden) each(entry.mesh);
      }
    }
  }
}
