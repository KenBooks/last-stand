// Values a dev build can change while it runs (the lab's `--tune`): a part of the game registers an object of numbers
// by name, reads its fields where it uses them, and the lab sets them before a command runs, so a pose or a camera is
// compared across values without editing the source and booting again each time. A production build registers nothing.

/** a tunable value: a number, or a list of them (a point, a way) */
type Value = number | number[];

/** a registered object of values, and its lists of keys: each one's field, and the numbers a key takes in it */
interface Registered { values: Record<string, Value>; keyed: Record<string, number> }

const registry = new Map<string, Registered>();

/** Registers `values` under `name` (dev builds) and returns them: read their fields where they're used, each frame.
 *  `keyed`: the fields that are lists of keys, by the numbers a key takes (a key can be added or taken out as they're
 *  tuned; every other list keeps its length, a point's three numbers). */
export function tunable<T extends Record<string, Value>>(
  name: string, values: T, keyed: Partial<Record<keyof T, number>> = {},
): T {
  if (import.meta.env.DEV) registry.set(name, { values, keyed: keyed as Record<string, number> });
  return values;
}

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
  const { values, field, now, key } = fieldOf(path);
  if (typeof now === 'number') {
    if (value.length !== 1) throw new Error(`${path} is one number`);
    values[field] = value[0];
    return;
  }
  if (key !== undefined) {
    if (value.length === 0 || value.length % key !== 0) throw new Error(`${path} is keys of ${key} numbers`);
  } else if (value.length !== now.length) throw new Error(`${path} is ${now.length} numbers`);
  now.splice(0, now.length, ...value);
}

declare global {
  interface Window {
    /** dev builds: sets a tunable value (`tunable`), and reads one */
    __tune?: (path: string, value: number[]) => void;
    __tuned?: (path: string) => number[];
  }
}

// (not in a worker: the head workers import the models, which read tunables)
if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__tune = tune;
  window.__tuned = tuned;
}
