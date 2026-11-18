// Values a dev build can change while it runs (the lab's `--tune`): a part of the game registers an object of numbers
// by name, reads its fields where it uses them, and the lab sets them before a command runs, so a pose or a camera is
// compared across values without editing the source and booting again each time. A production build registers nothing.

/** a tunable value: a number, or a list of them (a point, a way) */
type Value = number | number[];

/** a registered object of values, and its lists of keys: each one's field, and the numbers a key takes in it; every
 *  copy registered under its name since (one a hero's build declares is made again by each build), and the fields set
 *  so far, which a copy registered later takes */
interface Registered {
  values: Record<string, Value>; keyed: Record<string, number>;
  copies: WeakRef<Record<string, Value>>[]; set: Map<string, Value>;
  /** the names of a key's numbers, for the lists of keys that give them (a keyed move's columns) */
  named: Record<string, readonly string[]>;
}

const registry = new Map<string, Registered>();

/** Registers `values` under `name` (dev builds) and returns them: read their fields where they're used, each frame.
 *  `keyed`: the fields that are lists of keys, by the numbers a key takes (a key can be added or taken out as they're
 *  tuned; every other list keeps its length, a point's three numbers). Registered again under the same name (declared
 *  in a hero's build, made again by each build), every copy is tuned, and a new one takes what was set: tuned on the
 *  last copy alone, the warrior's `warriorLay` set a hall's or a warm-up's build and the hero in the scene kept his. */
export function tunable<T extends Record<string, Value>>(
  name: string, values: T, keyed: Partial<Record<keyof T, number>> = {},
  named: Partial<Record<keyof T, readonly string[]>> = {},
): T {
  if (!import.meta.env.DEV) return values;
  const had = registry.get(name);
  const copies = had ? had.copies.filter((copy) => copy.deref()) : [];
  const set = had?.set ?? new Map<string, Value>();
  for (const [field, value] of set) values[field as keyof T] = copyOf(value) as T[keyof T];
  copies.push(new WeakRef(values));
  registry.set(name, {
    values, keyed: keyed as Record<string, number>, copies, set, named: named as Record<string, readonly string[]>,
  });
  return values;
}

/** A value as a new number or list, so no two copies share a list. */
const copyOf = (value: Value): Value => typeof value === 'number' ? value : [...value];

/** The tunable object and field `path` (`name.field`) names, the field's value now, and the numbers a key takes in it
 *  if it's a list of keys. */
function fieldOf(path: string): { values: Record<string, Value>; field: string; now: Value; key?: number } {
  const [name, field] = path.split('.');
  const registered = registry.get(name);
  if (!registered) throw new Error(`no tunable ${name} (there are: ${[...registry.keys()].join(', ') || 'none'})`);
  const { values, keyed } = registered;
  const now = values[field];
  if (now === undefined) throw new Error(`${name} has no ${field} (it has: ${Object.keys(values).join(', ')})`);
  return { values, field, now, key: keyed[field] };
}

/** The value of `path` (`name.field`) now, as a list (the lab's `match --fit` starts from it). */
function tuned(path: string): number[] {
  const { now } = fieldOf(path);
  return typeof now === 'number' ? [now] : [...now];
}

/** Sets `path` (`name.field`) to `value`, a number or a list of as many as the field holds (a list of keys: any number
 *  of whole keys). */
function tune(path: string, value: number[]): void {
  const { field, now, key } = fieldOf(path);
  if (typeof now === 'number') {
    if (value.length !== 1) throw new Error(`${path} is one number`);
  } else if (key !== undefined) {
    if (value.length === 0 || value.length % key !== 0) throw new Error(`${path} is keys of ${key} numbers`);
  } else if (value.length !== now.length) throw new Error(`${path} is ${now.length} numbers`);
  const registered = registry.get(path.split('.')[0])!;
  const set: Value = typeof now === 'number' ? value[0] : [...value];
  registered.set.set(field, set);
  for (const copy of registered.copies) {
    const values = copy.deref();
    if (!values) continue;
    // (a list set in place: a pose may hold the list itself)
    const was = values[field];
    if (typeof was === 'number' || typeof set === 'number') values[field] = copyOf(set);
    else was.splice(0, was.length, ...set);
  }
}

/** A list of keys whose numbers are named (`tunable`'s `named`): its names, the numbers a key takes, its keys now. */
function namedKeys(path: string): { names: readonly string[]; key: number; now: number[] } {
  const { now, key } = fieldOf(path);
  const names = registry.get(path.split('.')[0])!.named[path.split('.')[1]];
  if (key === undefined || !names) throw new Error(`${path} is no list of keys with named numbers`);
  return { names, key, now: typeof now === 'number' ? [now] : [...now] };
}

/** A list of keys with named numbers as a table: a line of the names, then a line a key, numbered from 1. */
function keyTable(path: string): string {
  const { names, key, now } = namedKeys(path);
  const width = Math.max(...names.map((name) => name.length), 6);
  const cell = (text: string) => text.padStart(width);
  const lines = [`    ${names.map(cell).join(' ')}`];
  for (let row = 0; row * key < now.length; row++) {
    const numbers = now.slice(row * key, (row + 1) * key).map((value) => cell(String(+value.toFixed(3))));
    lines.push(`${String(row + 1).padStart(3)} ${numbers.join(' ')}`);
  }
  return lines.join('\n');
}

/** Sets some of key `row`'s numbers (from 1) of a list of keys with named numbers, each by its name. */
function tuneKey(path: string, row: number, set: Record<string, number>): void {
  const { names, key, now } = namedKeys(path);
  const rows = now.length / key;
  if (!Number.isInteger(row) || row < 1 || row > rows) throw new Error(`${path} has keys 1 to ${rows}, no ${row}`);
  for (const [name, value] of Object.entries(set)) {
    const column = names.indexOf(name);
    if (column < 0) throw new Error(`${path}'s keys have no ${name} (they have: ${names.join(', ')})`);
    now[(row - 1) * key + column] = value;
  }
  tune(path, now);
}

declare global {
  interface Window {
    /** dev builds: sets a tunable value (`tunable`), and reads one */
    __tune?: (path: string, value: number[]) => void;
    __tuned?: (path: string) => number[];
    /** dev builds: a list of keys with named numbers as a table, and some of a key's numbers set by name */
    __keyTable?: (path: string) => string;
    __tuneKey?: (path: string, row: number, set: Record<string, number>) => void;
  }
}

// (not in a worker: the head workers import the models, which read tunables)
if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__tune = tune;
  window.__tuned = tuned;
  window.__keyTable = keyTable;
  window.__tuneKey = tuneKey;
}
