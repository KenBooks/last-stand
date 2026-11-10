// A saves service of the lab's own (server/saves), for `lab cloud`: started on a free port for the page's origin alone,
// its files kept in tools/lab/out/saves-service (emptied as it starts: it holds nothing but the lab's own accounts).
// The page is the one trusted site there (`PRODUCTION`), so its sessions may make sign-in codes as production's do.
// The lab reads a site's save back as the service keeps it, with a session's token and the page's origin, as the
// game's own calls send them (src/loot/cloudApi.ts), each part gunzipped as the service stored it.
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { OUT } from './paths.mjs';

/** where the service keeps its accounts and saves */
const DATA = join(OUT, 'saves-service');

/**
 * Starts the service for `origin`; resolves to its address (`url`), a way to read a site's save back (`readSave`) and
 * to close it.
 */
export async function startSavesService(origin) {
  const { start } = await import('../../../server/saves/saves.mjs');
  rmSync(DATA, { recursive: true, force: true });
  const settings = { DATA, ORIGINS: origin, PRODUCTION: origin, RP_IDS: 'localhost', GITHUB_REPO: '' };
  const server = await start(0, settings);
  const url = `http://127.0.0.1:${server.address().port}`;
  return {
    url,
    /** The site's save as `token` reaches it: each part's version and its content (an entry's name to its value). */
    async readSave(token) {
      const headers = { authorization: `Bearer ${token}`, origin };
      const listed = await answerOf(await fetch(`${url}/saves/save`, { headers }), 'the save\'s parts');
      const { parts } = await listed.json();
      const save = {};
      for (const [name, info] of Object.entries(parts)) {
        const answer = await answerOf(await fetch(`${url}/saves/save/${name}`, { headers }), `the part ${name}`);
        const value = JSON.parse(gunzipSync(Buffer.from(await answer.arrayBuffer())).toString('utf8'));
        save[name] = { version: info.version, value };
      }
      return save;
    },
    close() {
      return new Promise((resolve) => server.close(resolve));
    },
  };
}

/** The answer if it's ok; throws saying what was asked for otherwise. */
async function answerOf(answer, what) {
  if (answer.ok) return answer;
  throw new Error(`lab: cloud: the local saves service answered ${answer.status} for ${what}: ${await answer.text()}`);
}
