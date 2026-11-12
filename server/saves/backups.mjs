// The saves service's nightly backups to the owner's Google Drive (server/saves/AGENTS.md, #503), as TimeInvoices
// keeps its own (G:\Git\TimeInvoices\BACKUP.md): every account and save in one gzipped JSON snapshot, uploaded into a
// folder of its own (`Last Stand backups`, under the `drive.file` scope: Drive shows this app only what it made), its
// upload checked by Drive's MD5 against ours, and those older than BACKUP_KEEP_DAYS deleted. The refresh token is
// the owner's (`npm run saves:drive-token`), a Dokci setting, never in the repo. Off while it, or Google's client, is
// unset. `restore.mjs` writes a snapshot back into a data folder.
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const FOLDER_TYPE = 'application/vnd.google-apps.folder';
/** a snapshot's format, for `restore.mjs` */
export const SNAPSHOT_VERSION = 1;

/** The backups' settings: on when Google's client and the owner's Drive refresh token are all set. */
export function backupSettingsFrom(vars) {
  const clientId = vars.GOOGLE_CLIENT_ID ?? '';
  const clientSecret = vars.GOOGLE_CLIENT_SECRET ?? '';
  const refreshToken = vars.DRIVE_REFRESH_TOKEN ?? '';
  return {
    on: Boolean(clientId && clientSecret && refreshToken),
    clientId,
    clientSecret,
    refreshToken,
    folder: vars.DRIVE_FOLDER ?? 'Last Stand backups',
    keepDays: Number(vars.BACKUP_KEEP_DAYS ?? 14),
    every: Number(vars.BACKUP_EVERY_MS ?? 24 * 60 * 60_000),
    /** the first after a start (a deploy restarts the service more often than daily) */
    first: Number(vars.BACKUP_FIRST_MS ?? 5 * 60_000),
    /** a backup younger than this in Drive makes a run skip: restarts don't upload one each */
    minAge: Number(vars.BACKUP_MIN_AGE_MS ?? 20 * 60 * 60_000),
    tokenUrl: vars.GOOGLE_TOKEN_URL ?? 'https://oauth2.googleapis.com/token',
    driveApi: vars.DRIVE_API ?? 'https://www.googleapis.com',
  };
}

/** How the backups stand, for the health: `off`, `pending` (none run since the start), `ok` or `failing`. */
const status = { state: 'off', last: 0, file: '', error: '' };
export const backupStatus = () => ({ ...status });

/** The health's view: no error text (the health is public), the state and when the last one worked. */
export const backupHealth = () => ({ state: status.state, last: status.last });

/** Resets the status at a start. */
export function resetBackups(backups) {
  Object.assign(status, { state: backups.on ? 'pending' : 'off', last: 0, file: '', error: '' });
}

/** Every file of the data folder a restore needs, as text by its path inside it (temporary files left out). */
export async function snapshot(root, now = Date.now()) {
  const files = {};
  for (const name of await names(join(root, 'accounts'))) {
    files[`accounts/${name}`] = await readFile(join(root, 'accounts', name), 'utf8');
  }
  for (const id of await names(join(root, 'saves'), false)) {
    for (const name of await names(join(root, 'saves', id))) {
      files[`saves/${id}/${name}`] = await readFile(join(root, 'saves', id, name), 'utf8');
    }
  }
  return { version: SNAPSHOT_VERSION, made: now, files };
}

/** A folder's `.json` files (or, `json` false, its entries), none if it doesn't exist. */
async function names(dir, json = true) {
  try {
    const entries = await readdir(dir);
    return entries.filter((name) => !json || name.endsWith('.json'));
  } catch {
    return [];
  }
}

/**
 * One backup run: skipped while Drive holds one younger than `minAge`; else the snapshot uploaded, checked and the
 * old ones deleted. Resolves to what it did; the status says how it went.
 */
export async function runBackup(backups, root, now = Date.now()) {
  if (!backups.on) return { skipped: 'off' };
  try {
    const drive = await driveOf(backups);
    const folder = await folderId(drive, backups.folder);
    const kept = await filesIn(drive, folder);
    const newest = kept.reduce((most, file) => Math.max(most, Date.parse(file.createdTime) || 0), 0);
    if (now - newest < backups.minAge) {
      if (status.state === 'pending') Object.assign(status, { state: 'ok', last: newest });
      return { skipped: 'recent' };
    }
    const packed = gzipSync(JSON.stringify(await snapshot(root, now)));
    const name = `last-stand-saves-${new Date(now).toISOString().replace(/[:.]/g, '-')}.json.gz`;
    const uploaded = await upload(drive, folder, name, packed);
    const md5 = createHash('md5').update(packed).digest('hex');
    if (uploaded.md5Checksum !== md5) throw new Error(`the upload's MD5 ${uploaded.md5Checksum} isn't ours, ${md5}`);
    const old = kept.filter((file) => now - (Date.parse(file.createdTime) || now) > backups.keepDays * 86_400_000);
    for (const file of old) await drive('DELETE', `/drive/v3/files/${encodeURIComponent(file.id)}`);
    Object.assign(status, { state: 'ok', last: now, file: name, error: '' });
    return { uploaded: name, bytes: packed.length, deleted: old.length };
  } catch (e) {
    Object.assign(status, { state: 'failing', error: String(e?.message ?? e) });
    return { failed: status.error };
  }
}

/** A call of Drive's API with an access token the owner's refresh token gets: `drive(method, path, init)`. */
async function driveOf(backups) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: backups.refreshToken,
    client_id: backups.clientId,
    client_secret: backups.clientSecret,
  });
  const answer = await fetch(backups.tokenUrl, { method: 'POST', body, signal: AbortSignal.timeout(15_000) });
  // (`invalid_grant` most often: the OAuth app left in Testing, whose Drive tokens last 7 days, BACKUP.md)
  if (!answer.ok) throw new Error(`Google refused the refresh token: ${answer.status} ${await answer.text()}`);
  const { access_token: accessToken } = await answer.json();
  return async (method, path, init = {}) => {
    const reply = await fetch(`${backups.driveApi}${path}`, {
      method,
      ...init,
      headers: { authorization: `Bearer ${accessToken}`, ...init.headers },
      signal: AbortSignal.timeout(60_000),
    });
    if (!reply.ok) throw new Error(`Drive ${method} ${path.split('?')[0]}: ${reply.status} ${await reply.text()}`);
    return reply.status === 204 ? null : reply.json();
  };
}

/** A Drive query's text with its quotes escaped. */
const quoted = (text) => `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/** The backups' folder's id, made if this app has none yet. */
async function folderId(drive, name) {
  const q = `name = ${quoted(name)} and mimeType = '${FOLDER_TYPE}' and trashed = false`;
  const found = await drive('GET', `/drive/v3/files?${new URLSearchParams({ q, fields: 'files(id)', spaces: 'drive' })}`);
  if (found.files?.length) return found.files[0].id;
  const made = await drive('POST', '/drive/v3/files?fields=id', {
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_TYPE }),
  });
  return made.id;
}

/** The files in the folder: id, name and when each was made. */
async function filesIn(drive, folder) {
  const files = [];
  let pageToken;
  do {
    const query = new URLSearchParams({
      q: `${quoted(folder)} in parents and trashed = false`,
      fields: 'nextPageToken,files(id,name,createdTime)',
      pageSize: '200',
    });
    if (pageToken) query.set('pageToken', pageToken);
    const listed = await drive('GET', `/drive/v3/files?${query}`);
    files.push(...(listed.files ?? []));
    pageToken = listed.nextPageToken;
  } while (pageToken);
  return files;
}

/** The file uploaded into the folder whole (multipart: its name and its bytes): its id, MD5 and size as Drive has them. */
function upload(drive, folder, name, bytes) {
  const boundary = `saves-${Date.now().toString(36)}`;
  const metadata = JSON.stringify({ name, parents: [folder], mimeType: 'application/gzip' });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
    Buffer.from(`--${boundary}\r\ncontent-type: application/gzip\r\n\r\n`),
    bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return drive('POST', '/upload/drive/v3/files?uploadType=multipart&fields=id,md5Checksum,size', {
    headers: { 'content-type': `multipart/related; boundary=${boundary}` },
    body,
  });
}
