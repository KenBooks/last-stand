// A backup written back (server/saves/AGENTS.md, Restoring): `node server/saves/restore.mjs <snapshot.json.gz>
// <data folder>`, the snapshot downloaded from the owner's Drive (`Last Stand backups/`), the folder the service's
// DATA (the `saves-data` volume's, with the service stopped). It refuses a folder that already holds accounts unless
// `--replace` is given, which empties `accounts/` and `saves/` first. Nothing else in the folder is touched.
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { dirname, join, normalize, sep } from 'node:path';
import { SNAPSHOT_VERSION } from './backups.mjs';

/** A snapshot's path inside the data folder, checked: `accounts/<id>.json` or `saves/<id>/<site>.json`. */
const SAFE_PATH = /^(accounts\/[A-Za-z0-9_-]+\.json|saves\/[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+\.json)$/;

/** Writes the snapshot's files into `root`; resolves to how many. */
export async function restore(snapshotGz, root, { replace = false } = {}) {
  const snapshot = JSON.parse(gunzipSync(snapshotGz).toString('utf8'));
  if (snapshot?.version !== SNAPSHOT_VERSION) throw new Error(`not a snapshot of version ${SNAPSHOT_VERSION}`);
  if (!snapshot.files || typeof snapshot.files !== 'object' || Array.isArray(snapshot.files)) {
    throw new Error('snapshot has no files');
  }
  // Check the entire archive before --replace can remove a working data folder.
  for (const [path, text] of Object.entries(snapshot.files)) {
    if (!SAFE_PATH.test(path) || normalize(path).split(sep).includes('..') || typeof text !== 'string') {
      throw new Error(`a file out of place: ${path}`);
    }
  }
  const held = await countAccounts(root);
  if (held && !replace) throw new Error(`${root} holds ${held} accounts already: --replace empties it first`);
  if (replace) {
    await rm(join(root, 'accounts'), { recursive: true, force: true });
    await rm(join(root, 'saves'), { recursive: true, force: true });
  }
  await mkdir(join(root, 'accounts'), { recursive: true });
  await mkdir(join(root, 'saves'), { recursive: true });
  let written = 0;
  for (const [path, text] of Object.entries(snapshot.files)) {
    const file = join(root, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, text);
    written++;
  }
  return written;
}

async function countAccounts(root) {
  try {
    return (await readdir(join(root, 'accounts'))).filter((name) => name.endsWith('.json')).length;
  } catch {
    return 0;
  }
}

if (import.meta.main) {
  const [file, root] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  if (!file || !root) {
    console.error('usage: node server/saves/restore.mjs <snapshot.json.gz> <data folder> [--replace]');
    process.exit(2);
  }
  const written = await restore(await readFile(file), root, { replace: process.argv.includes('--replace') });
  console.log(`restored ${written} files into ${root}`);
}
