// The command line's side of the lab's server (tools/lab): a command sent to `npm run lab:serve` and its reply, a
// server restarting waited for, and a source change waited for (`--watch`).
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { codeStamp } from './codeStamp.mjs';
import { labError } from './errors.mjs';
import { LAB_PORT, REPO, SERVER_NOTE } from './paths.mjs';

/** how long a restarting server is waited for, ms */
const RESTART_WAIT_MS = 60_000;
/** how often a restarting server is asked whether it's back, ms */
const RESTART_POLL_MS = 300;

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

/**
 * POSTs `body` to the server's `path` as JSON; resolves with its reply, or null when no server is up. Rejects with
 * the server's refusal when it refused the request.
 */
export function request(path, body = {}) {
  return new Promise((resolvePromise, reject) => {
    const headers = { 'content-type': 'application/json' };
    const options = { host: '127.0.0.1', port: LAB_PORT, path, method: 'POST', headers };
    const call = http.request(options, (response) => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        text += chunk;
      });
      response.on('end', () => {
        try {
          resolvePromise(JSON.parse(text));
        } catch {
          reject(new Error(`the lab server answered ${response.statusCode}: ${text.slice(0, 200)}`));
        }
      });
    });
    call.on('error', (error) => {
      if (error.code === 'ECONNREFUSED') resolvePromise(null);
      else reject(error);
    });
    call.end(JSON.stringify(body));
  });
}

/** Whether a process is alive. */
function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether a server is restarting: none answers, but the last one's supervisor (supervisor.mjs) is still alive and
 * will start it again.
 */
function serverRestarting() {
  try {
    const note = JSON.parse(readFileSync(SERVER_NOTE, 'utf8'));
    return note.port === LAB_PORT && isAlive(note.watcher);
  } catch {
    return false;
  }
}

/** Waits for the server to answer again, running the code `stamp` names when given; resolves with whether it did. */
async function waitForServer(stamp = null) {
  const deadline = Date.now() + RESTART_WAIT_MS;
  while (Date.now() < deadline) {
    const reply = await request('/ping').catch(() => null);
    if (reply && (!stamp || reply.stamp === stamp)) return true;
    await sleep(RESTART_POLL_MS);
  }
  return false;
}

/** how many times a command is sent to a server that keeps restarting before it gives up */
const SEND_ATTEMPTS = 3;

/**
 * Sends a command to the server with the stamp of this command line's code; resolves with its reply (`{ ok, text,
 * version }`), or null when no server is up. A server restarting, before the command or under it, or for it (its
 * code isn't this command line's), is waited for and the command sent again.
 */
export async function sendToServer(call) {
  const stamped = { ...call, stamp: codeStamp(), root: REPO };
  for (let attempt = 0; attempt < SEND_ATTEMPTS; attempt++) {
    let reply;
    try {
      reply = await request('/run', stamped);
    } catch (error) {
      if (error.code !== 'ECONNRESET') throw error;
      console.log('(the lab server restarted while it ran the command: sending it again)');
    }
    if (reply && !reply.restarting) return reply;
    if (reply === null && !serverRestarting()) return null;
    if (reply) console.log(`(${reply.text}: waiting for it)`);
    else if (reply === null) console.log('(the lab server is restarting: waiting for it)');
    if (!(await waitForServer(stamped.stamp))) return null;
  }
  throw labError('the lab server kept restarting');
}

/**
 * Waits until the source has changed since `version` (a reply's) and settled; resolves with the new version and the
 * files changed last. A server restarting meanwhile is waited for; one gone for good rejects.
 */
export async function waitForChange(version) {
  for (;;) {
    let reply;
    try {
      reply = await request('/changes', { since: version });
    } catch (error) {
      if (error.code !== 'ECONNRESET') throw error;
    }
    if (reply?.changed) return { version: reply.version, files: reply.files ?? [] };
    if (reply) continue;
    if (!serverRestarting() || !(await waitForServer())) throw labError('the lab server stopped');
    // (a restarted server counts its versions from 0 again: its own code changed, so the command runs again)
    return { version: 0, files: ['the lab server (restarted)'] };
  }
}
