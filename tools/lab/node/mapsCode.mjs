// The name a tree's procedural maps are kept under in the lab's pages (src/core/kept.ts `keepAs`): a hash of the code
// the maps' worker runs (src/core/pbr.worker.ts and every module it imports, in turn) and of the photos its recipes
// take their colours from, so a recipe changed, or a photo, makes them again. Kept under it, a boot reads its maps
// back in a few ms: made anew, they were 10 s of the workers' time a boot, and a check booted a hundred pages.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { runtimeImports } from './labCode.mjs';

/** the workers whose work is kept (the maps', the fire's simulation), from a tree's root */
const WORKERS = ['src/core/pbr.worker.ts', 'src/world/fireBake.worker.ts'];
/** the photos the recipes read, from a tree's root */
const PHOTOS = 'src/core/photos';

/** A module's path from an import of it in `from` (both from the tree's root), or null where none is there. */
function moduleAt(root, from, specifier) {
  const path = posix.normalize(posix.join(posix.dirname(from), specifier));
  const candidates = [path, `${path}.ts`, `${path}/index.ts`];
  return candidates.find((candidate) => candidate.endsWith('.ts') && existsSync(join(root, candidate))) ?? null;
}

/** `entry` and every module it imports, in turn, from `root` (paths from it, sorted). */
export function moduleClosure(root, entry) {
  const seen = new Set([entry]);
  const queue = [entry];
  while (queue.length) {
    const from = queue.shift();
    for (const specifier of runtimeImports(readFileSync(join(root, from), 'utf8'))) {
      const path = moduleAt(root, from, specifier);
      if (!path || seen.has(path)) continue;
      seen.add(path);
      queue.push(path);
    }
  }
  return [...seen].sort();
}

/** The name the maps of the tree at `root` are kept under: its maps' code and photos hashed. */
export function mapsCodeOf(root) {
  const hash = createHash('sha256');
  const photos = existsSync(join(root, PHOTOS)) ? readdirSync(join(root, PHOTOS)).sort() : [];
  const workers = WORKERS.filter((worker) => existsSync(join(root, worker)));
  const code = workers.flatMap((worker) => moduleClosure(root, worker));
  const files = [...new Set(code), ...photos.map((name) => `${PHOTOS}/${name}`)];
  for (const file of files) {
    hash.update(file);
    hash.update(readFileSync(join(root, file)));
  }
  return `lab maps ${hash.digest('hex').slice(0, 16)}`;
}
