// `lab village --since <ref>`: the village's checks a change can touch, by the files changed since `ref`. The whole
// suite is half an hour of checks on one page (ten minutes as eight shards on a lent PC), run for a one-line change
// to the fog as for a new building: from the owner, "can we at least avoid running whole check for every change ?".
// A file this doesn't know runs them all, so a wrong guess costs time, never a fault unseen; the whole suite still
// runs before a push (`lab check --commands village`).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/** the page's module that lists the village's checks, from the repo's root */
const CHECKS_MODULE = 'tools/lab/page/village.ts';

/**
 * What a changed file can touch: the files (from the repo's root) and the checks whose names say they read it. The
 * first area a file is in decides; a source file in none runs every check.
 */
export const AREAS = [
  {
    name: 'the fog',
    files: /^src\/core\/sight\.ts$/,
    checks: /fog|sight|seen|leaves|fires|roofShows|doorCone|doorLine|hallEntry|hallWallsOne/i,
  },
  {
    name: 'what thins',
    files: /^src\/core\/(seeThrough|heroHidden|ghostLayers)\.ts$/,
    checks: /hall|wall|column|roof|ghost|behind|houses|dots|seen|fog|door|capital|props|portal/i,
  },
  {
    name: 'the lamps',
    files: /^src\/(core\/(lamps|lightBounds)|world\/lampAtlas)\.ts$/,
    checks: /lamp|light|shadow|lit|blind|crystal|compile|hours/i,
  },
  { name: 'the grass', files: /^src\/world\/meadow\.ts$/, checks: /grass|meadow/i },
  { name: 'the fires', files: /^src\/world\/fire(Nodes)?\.ts$/, checks: /fire/i },
  { name: 'the training', files: /^src\/(game|data|ui)\/training\.ts$/, checks: /training/i },
  { name: 'the hall\'s heroes', files: /^src\/(game\/hall|world\/heroHall)\.ts$/, checks: /hero|hall|dais|built/i },
  { name: 'the kept shadows', files: /^src\/world\/(shadowsOnMove|culling)\.ts$/, checks: /shadow/i },
];

/** files no check reads: notes, and the lab's own tests */
const READ_BY_NONE = /\.md$|^tools\/lab\/test\//;
/** a check's own module in the lab's page */
const CHECK_MODULE = /^tools\/lab\/page\/(village\w+)\.ts$/;

/** The village's checks' names, in their order, read off the module that lists them. */
export function checkNames(source) {
  const list = source.slice(source.indexOf('const all: Record<string'));
  return [...list.matchAll(/^ {4}(\w+): (?:async )?\(\) =>/gm)].map((match) => match[1]);
}

/** Each of the lab's village modules with the checks it holds, read off the imports of the module that lists them. */
export function checksByModule(source) {
  const held = new Map();
  const hold = (module, name) => held.set(module, [...(held.get(module) ?? []), name]);
  for (const [, names, module] of source.matchAll(/^import \{([^}]+)\} from '\.\/(village\w+)';/gm)) {
    for (const name of names.split(',')) hold(module, name.trim());
  }
  const loadedAsRun = /^ {4}(\w+): async \(\) => \(await import\('\.\/(village\w+)'\)\)/gm;
  for (const [, name, module] of source.matchAll(loadedAsRun)) hold(module, name);
  return held;
}

/**
 * The checks of `names` a change to `files` can touch: `all` when a file is one this can't place (every check runs),
 * else the names chosen, in `names`' order, and `why`, a line a file.
 */
export function checksSince(files, names, byModule = new Map()) {
  const chosen = new Set();
  const why = [];
  for (const file of files) {
    if (READ_BY_NONE.test(file)) continue;
    const own = CHECK_MODULE.exec(file);
    const area = AREAS.find((each) => each.files.test(file));
    if (own && byModule.has(own[1])) {
      const its = byModule.get(own[1]).filter((name) => names.includes(name));
      for (const name of its) chosen.add(name);
      why.push(`${file}: its own checks (${its.length})`);
    } else if (area) {
      const its = names.filter((name) => area.checks.test(name));
      for (const name of its) chosen.add(name);
      why.push(`${file}: ${area.name} (${its.length})`);
    } else if (file.startsWith('src/') || file.startsWith('tools/lab/')) {
      return { all: true, names, why: [`${file}: read by every check, as far as this knows`] };
    }
  }
  return { all: false, names: names.filter((name) => chosen.has(name)), why };
}

/** The files changed since `ref` in the repo at `root`: committed since they parted, and not yet committed. */
export function changedSince(ref, root) {
  const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
  const base = git(['merge-base', ref, 'HEAD'])[0];
  return [...new Set([...git(['diff', '--name-only', base]), ...git(['ls-files', '--others', '--exclude-standard'])])];
}

/** What `lab village --since ref` runs in the repo at `root`: `checksSince` of what changed there. */
export function villageSince(ref, root) {
  const source = readFileSync(path.join(root, CHECKS_MODULE), 'utf8');
  return checksSince(changedSince(ref, root), checkNames(source), checksByModule(source));
}
