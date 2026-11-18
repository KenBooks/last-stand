// Where the lab lives and writes (tools/lab): everything it writes stays under tools/lab/out.
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** the repository's root: the tree the lab serves as "this tree" */
export const REPO = resolve(HERE, '../../..');

/** everything the lab writes: sheets, exported commits, Vite's cache, the browser's profile */
export const OUT = resolve(HERE, '../out');

/**
 * The server's note of itself while it runs: its process and the one watching it (`node --watch` in `lab:serve`),
 * so the command line can tell a server restarting from none at all.
 */
export const SERVER_NOTE = join(OUT, 'server.json');

/** the ports a tree's own server may take: from the first, as many as there are (clear of Vite's, 5173 and 5190) */
const TREE_PORTS = [5200, 800];

/** `root` as one tree is named whatever its spelling: Windows' paths are the same in any case */
export function treeName(root) {
  const name = resolve(root);
  return process.platform === 'win32' ? name.toLowerCase() : name;
}

/** Whether two roots name the same tree. */
export function sameTree(a, b) {
  return treeName(a) === treeName(b);
}

/**
 * The port of a tree's own server, from its root: every checkout and worktree has its own, so none sends its
 * commands to another's server (two sessions in two worktrees were given the same `LAB_PORT`: each one's command
 * found the other's server running other code, restarted it on that other code and waited in vain, and a `stop`
 * stopped the other's).
 */
export function treePort(root) {
  const hash = createHash('sha1').update(treeName(root)).digest();
  const [first, count] = TREE_PORTS;
  return first + (hash.readUInt32BE(0) % count);
}

/** the port the lab's server answers on (127.0.0.1 only): `LAB_PORT`, or this tree's own */
export const LAB_PORT = Number(process.env.LAB_PORT ?? treePort(REPO));
