// A tape: everything the bridge hands the engine for one frame, written down call by call, so the engine's own
// harness draws the same frame with no browser (the engine's `replay`, its tape.rs, which says the tape's layout).
import type { Engine } from './pkg/bulwark';

type TapeArg = number | boolean | string | Float32Array | Uint32Array | Uint16Array | Uint8Array | Uint8ClampedArray;

/** the engine's calls a tape keeps, by their op (tape.rs) */
const OPS: Record<string, number> = {
  add_mesh: 1, add_texture: 2, add_material: 3, add_shader: 4, add_custom_material: 5, set_instances: 6, set_sprites: 7,
};
const FRAME = 8;
const KIND = { number: 0, floats: 1, words: 2, shorts: 3, bytes: 4, text: 5 };

export class Tape {
  private parts: Uint8Array[] = [];

  constructor(width: number, height: number) {
    this.parts.push(new TextEncoder().encode('BWK1'), this.words(width, height));
  }

  private words(...values: number[]): Uint8Array {
    return new Uint8Array(Uint32Array.from(values).buffer);
  }

  /** An argument's kind and its bytes, copied (most are views of memory written again next frame). */
  private bytesOf(arg: TapeArg): [number, Uint8Array] {
    if (typeof arg === 'number' || typeof arg === 'boolean') return [KIND.number, new Uint8Array(Float64Array.of(Number(arg)).buffer)];
    if (typeof arg === 'string') return [KIND.text, new TextEncoder().encode(arg)];
    const kind = arg instanceof Float32Array ? KIND.floats : arg instanceof Uint32Array ? KIND.words
      : arg instanceof Uint16Array ? KIND.shorts : KIND.bytes;
    return [kind, new Uint8Array(arg.buffer, arg.byteOffset, arg.byteLength).slice()];
  }

  call(op: number, args: readonly TapeArg[]): void {
    this.parts.push(this.words(op, args.length));
    for (const arg of args) {
      const [kind, bytes] = this.bytesOf(arg);
      this.parts.push(this.words(kind, bytes.length), bytes);
      const pad = (4 - bytes.length % 4) % 4;
      if (pad) this.parts.push(new Uint8Array(pad));
    }
  }

  /** The frame itself: what the bridge wrote into the engine's memory, and the colour it's cleared to. */
  frame(records: Float32Array, bones: Float32Array, globals: Float32Array, clear: readonly number[]): void {
    this.call(FRAME, [records, bones, globals, Float32Array.from(clear)]);
  }

  /** The tape whole, as a file's parts. */
  blob(): Blob {
    return new Blob(this.parts as BlobPart[]);
  }
}

/** `engine`, each call a tape keeps written on `tape` with what it returned. */
export function recording(engine: Engine, tape: Tape): Engine {
  return new Proxy(engine, {
    get(target, name) {
      const value = Reflect.get(target, name) as unknown;
      if (typeof value !== 'function') return value;
      const op = OPS[name as string];
      return (...args: TapeArg[]) => {
        const result = (value as (...given: TapeArg[]) => unknown).apply(target, args);
        if (op) tape.call(op, typeof result === 'number' ? [...args, result] : args);
        return result;
      };
    },
  });
}
