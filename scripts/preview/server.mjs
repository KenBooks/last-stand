// The previews service (server/previews) as the workflow talks to it: a build sent with the secret token, the
// stable page and latest.json put beside it, a closed PR's previews removed, and what's kept read back. Reading a
// build back goes through its public address, as a visitor's browser does (trusted TLS, the route, the service).
import fs from 'node:fs';

/** An error for a reply that wasn't a success, its status and the service's own words in it. */
async function failure(what, reply) {
  const words = (await reply.text().catch(() => '')).slice(0, 200);
  return Object.assign(new Error(`${what}: ${reply.status} ${words}`.trim()), { status: reply.status });
}

/** The service at `origin` (`https://ls.wellscoped.dev`), written to with `token`, through `fetch`. */
export function previewServer({ origin, token, fetch }) {
  const api = (path) => `${origin}/pr-preview/api/${path}`;
  const auth = { authorization: `Bearer ${token}` };
  const send = async (what, path, init) => {
    const reply = await fetch(api(path), { ...init, headers: { ...auth, ...init.headers } });
    if (!reply.ok) throw await failure(what, reply);
    return reply.json();
  };
  return {
    origin,
    /** PR `number`'s stable page's address. */
    stableUrl: (number) => `${origin}/pr-preview/pr-${number}/`,
    /** Build `sha`'s folder's address. */
    folderUrl: (number, sha) => `${origin}/pr-preview/pr-${number}/${sha.slice(0, 7)}/`,

    /** Everything kept: [{ number, folders: [{ folder, headSha, publishedAt }], latest }]. */
    async previews() {
      return (await send('the previews kept', 'previews', { method: 'GET' })).previews;
    },
    /** PR `number`'s latest.json as the stable page reads it, or null. */
    async latest(number) {
      const reply = await fetch(`${origin}/pr-preview/pr-${number}/latest.json`, { cache: 'no-store' });
      if (reply.status === 404) return null;
      if (!reply.ok) throw await failure(`PR #${number}'s latest.json`, reply);
      return reply.json();
    },
    /** Build `sha` of PR `number` sent from `archive` (a .tar.gz of its folder): { files, bytes, ms }. */
    async putBuild(number, sha, archive) {
      const body = await fs.openAsBlob(archive);
      const path = `pr-${number}/${sha.slice(0, 7)}?sha=${sha}`;
      return send(`PR #${number}'s build`, path, { method: 'PUT', body, headers: { 'content-type': 'application/gzip' } });
    },
    async putLatest(number, latest) {
      const body = JSON.stringify(latest);
      return send(`PR #${number}'s latest.json`, `pr-${number}/latest.json`, { method: 'PUT', body });
    },
    async putPage(number, html) {
      return send(`PR #${number}'s stable page`, `pr-${number}/index.html`, { method: 'PUT', body: html });
    },
    async remove(number) {
      return send(`PR #${number}'s previews`, `pr-${number}`, { method: 'DELETE' });
    },
    /** Whether build `sha` is served at its public address: its metadata names it. */
    async served(number, sha) {
      try {
        const reply = await fetch(`${this.folderUrl(number, sha)}preview-metadata.json`, { cache: 'no-store' });
        return reply.ok && (await reply.json()).headSha === sha;
      } catch {
        return false;
      }
    },
  };
}
