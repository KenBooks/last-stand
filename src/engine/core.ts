// What every part of the bridge shares (`bridge.ts`): the engine's handle, the views of its memory the frame is
// written into, the counts of what it holds and of what a frame handed over, and what wasn't handed over by its kind.
import type { Engine, InitOutput } from './pkg/bulwark';
import type { Tape } from './tape';
import { GLOBALS } from './globals';

/** how many floats a record is (`RECORD_FLOATS` in the engine's plan.rs) */
export const RECORD = 24;
/** the largest side a map is handed over at */
export const MAX_MAP = 2048;

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
  /** the scene's matrices made */
  placeMs: number;
  walkMs: number;
  engineMs: number;
  /** handed over this frame */
  newMeshes: number;
  /** meshes whose vertices moved, written into the buffers they had */
  movedMeshes: number;
  newTextures: number;
  newMaterials: number;
}

export class Core {
  readonly stats: FrameStats = {
    records: 0, draws: 0, shadowDraws: 0, objects: 0, culled: 0, triangles: 0, gpuMs: 0, placeMs: 0, walkMs: 0,
    engineMs: 0, newMeshes: 0, movedMeshes: 0, newTextures: 0, newMaterials: 0,
  };
  /** what wasn't handed over, by its kind, on the last frame */
  readonly skipped = new Map<string, number>();
  /** how many of each the engine holds */
  readonly held = { meshes: 0, textures: 0, materials: 0, sets: 0 };

  /** the frame being handed over, counted from the first */
  frame = 0;
  records!: Float32Array;
  bones!: Float32Array;
  globals!: Float32Array;
  capacity = 0;
  boneCapacity = 0;
  /** the records and the bones' floats written this frame */
  count = 0;
  boneFloats = 0;
  /** the largest side a map is handed over at (a tape's maps are smaller: its file is mostly maps) */
  mostMap = MAX_MAP;
  /** the tape a frame is being written down as (`Bridge.capture`); the engine is its recorder meanwhile */
  tape: Tape | null = null;

  constructor(public engine: Engine, private wasm: InitOutput) {
    this.takeViews(4096, 16 * 256);
  }

  /** The engine's memory viewed again, with room for `records` and `boneFloats`: growing either moves it. */
  takeViews(records: number, boneFloats: number): void {
    const recordsAt = this.engine.records(records), bonesAt = this.engine.bones(boneFloats);
    const globalsAt = this.engine.globals(), memory = this.wasm.memory.buffer;
    this.records = new Float32Array(memory, recordsAt, records * RECORD);
    this.bones = new Float32Array(memory, bonesAt, boneFloats);
    this.globals = new Float32Array(memory, globalsAt, GLOBALS.floats);
    this.capacity = records;
    this.boneCapacity = boneFloats;
  }

  /** The views taken again if a call into the engine grew its memory under them. */
  freshViews(): void {
    if (this.records.buffer !== this.wasm.memory.buffer) this.takeViews(this.capacity, this.boneCapacity);
  }

  skip(kind: string): void {
    this.skipped.set(kind, (this.skipped.get(kind) ?? 0) + 1);
  }
}
