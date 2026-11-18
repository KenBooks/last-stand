// The lab's server (tools/lab, `npm run lab:serve`): one session kept up between commands, answering the command
// line over HTTP on 127.0.0.1, one command at a time in the order they came, and booting the next command's page as
// each finishes and as the source changes, so a command finds one ready and takes seconds instead of a boot.
//
// It only answers the lab's own command line: a POST of JSON, addressed to 127.0.0.1 or localhost, from no web page.
// (A page in the user's browser can send a plain POST to any local port; the server would run its `eval` in the
// lab's page.)
import http from 'node:http';
import { rmSync, writeFileSync } from 'node:fs';
import { relative, sep } from 'node:path';
import { describeError } from './errors.mjs';
import { REPO, SERVER_NOTE, sameTree } from './paths.mjs';

/** how long the source must be left alone after a change before the next page boots, ms (edits come in bursts) */
const EDITS_SETTLE_MS = 800;
/** how long a `/changes` request is held open before it's answered "no change yet", ms */
const CHANGES_WAIT_MS = 60_000;
/** how many of the files changed last a `/changes` reply names */
const CHANGED_FILES_KEPT = 4;

/** Logs a line under the time it happened, the machine's own (hh:mm:ss). */
function log(message) {
  console.log(`[${new Date().toTimeString().slice(0, 8)}] ${message}`);
}

/** Work run one piece at a time, in the order it came: the commands, and the boots between them. */
export class Queue {
  tail = Promise.resolve();

  /** Runs `work` once everything added before it is done; resolves or rejects as it does. */
  add(work) {
    const job = this.tail.then(work);
    this.tail = job.catch(() => {});
    return job;
  }
}

/**
 * Why the server won't answer `request`, or null when it will: only a POST of JSON from the lab's command line. A
 * browser marks what a web page sends with an `Origin`, and a page that would send JSON elsewhere must ask first
 * (CORS), which the server never allows; the `Host` must be the server's own, so a name pointed at 127.0.0.1 by a
 * web page (DNS rebinding) is refused too.
 */
export function refusal(request, port) {
  if (request.method !== 'POST') return 'only POST';
  if (request.headers.origin !== undefined) return 'not from a web page';
  const host = request.headers.host ?? '';
  if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return `not for host ${host}`;
  const type = request.headers['content-type'] ?? '';
  if (!type.startsWith('application/json')) return 'only JSON';
  return null;
}

/** Sends `body` as JSON with `status`. */
function reply(response, body, status = 200) {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

/** Reads a request's body as JSON (an empty one as `{}`). */
function readJson(request) {
  return new Promise((resolveBody, reject) => {
    let text = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      text += chunk;
    });
    request.on('end', () => {
      try {
        resolveBody(text ? JSON.parse(text) : {});
      } catch {
        reject(new Error('the request is not JSON'));
      }
    });
    request.on('error', reject);
  });
}

/**
 * The source's changes as `--watch` waits for them: how many the watcher has seen, the files of the last few, and
 * whether the last burst has settled (its page booting).
 */
class Changes {
  count = 0;
  files = [];
  settling = null;
  waiting = new Set();

  /** `file` changed; `settled` runs once the source has been left alone for a moment */
  seen(file, settled) {
    this.count++;
    this.files = [...this.files.filter((other) => other !== file), file].slice(-CHANGED_FILES_KEPT);
    clearTimeout(this.settling);
    this.settling = setTimeout(() => {
      this.settling = null;
      settled();
      for (const check of [...this.waiting]) check();
    }, EDITS_SETTLE_MS);
  }

  /** resolves with whether the source changed since `since` (and settled) within `CHANGES_WAIT_MS` */
  after(since) {
    const ready = () => this.count > since && !this.settling;
    if (ready()) return Promise.resolve(true);
    return new Promise((resolveChange) => {
      const finish = (changed) => {
        this.waiting.delete(check);
        clearTimeout(timer);
        resolveChange(changed);
      };
      const check = () => {
        if (ready()) finish(true);
      };
      const timer = setTimeout(() => finish(false), CHANGES_WAIT_MS);
      this.waiting.add(check);
    });
  }
}

/**
 * Keeps a session up between commands, answering them on 127.0.0.1:`port`, and boots the next command's page
 * between them. `stamp` is the code it loaded (codeStamp.mjs): a command sent with another is refused, and the server
 * starts again under its supervisor (supervisor.mjs) to run it. Runs until stopped (Ctrl+C, `lab stop`, or its
 * supervisor gone).
 */
export async function serve(port, stamp) {
  // (imported here: the rest of this module is the server's plumbing, tested without a browser)
  const { LabSession } = await import('./session.mjs');
  const { LiveSession } = await import('./live.mjs');
  const session = await LabSession.open();
  const live = new LiveSession(session);
  const queue = new Queue();
  const changes = new Changes();
  const bootNext = () => queue.add(() => session.bootNext()).then(
    (message) => message && log(message),
    (error) => log(`booting the next page failed: ${describeError(error)}`),
  );
  bootNext();
  session.repoSide.onStale = (file) => changes.seen(relative(REPO, file).split(sep).join('/'), bootNext);

  let stopping = false;
  /**
   * Stops, closing the browser and the Vite servers, and tells the supervisor whether to start it again (`restart`,
   * the reason) or stop too. The note stays while it restarts, so the command line waits for it.
   */
  const stop = async ({ restart = null } = {}) => {
    if (stopping) return;
    stopping = true;
    log(restart ? `restarting: ${restart}` : 'stopping');
    if (!restart) rmSync(SERVER_NOTE, { force: true });
    if (process.connected) process.send(restart ? { restart } : { stop: true });
    await live.close();
    await session.close();
    process.exit(0);
  };
  process.on('SIGINT', () => stop());
  process.on('SIGTERM', () => stop());
  process.on('message', (message) => {
    if (message?.restart) stop({ restart: message.restart });
    if (message?.stop) stop();
  });
  // (the supervisor gone, killed with whatever started it: nothing would stop this process then)
  process.on('disconnect', () => stop());

  /** A command from a command line whose code isn't this server's: refused, and the server started again for it. */
  const otherCode = () => {
    if (!process.connected) {
      return { ok: false, text: 'lab: the lab server runs other code than this command line: start it again' };
    }
    setTimeout(() => stop({ restart: 'a command came from newer code' }), 50);
    return { ok: false, restarting: true, text: 'the lab server is restarting: its code changed' };
  };

  /**
   * A call from another tree's command line, refused: this server serves this tree's game, and restarted for it, it
   * came back on this tree's code, and the other's command waited for it in vain.
   */
  const otherTree = (call) => {
    if (!call.root || sameTree(call.root, REPO)) return null;
    return { ok: false, text: `lab: port ${port} serves the lab of ${REPO}, not ${call.root}: give LAB_PORT another` };
  };

  /** Runs a command once the ones before it are done; its reply carries the changes seen as it started. */
  const runCommand = (call) => queue.add(async () => {
    log(`${call.command} ${JSON.stringify(call.options ?? {})}`);
    const version = changes.count;
    const { text, problems } = await session.run(call);
    return { ok: problems.length === 0, text, problems, version };
  });

  /** A live session's step, once the commands before it are done: on its own page, so no page boots after it. */
  const runLive = (call) => queue.add(async () => {
    log(`live ${call.options._.join(' ')}`);
    const version = changes.count;
    try {
      const { text, problems } = await live.run(call.options, version);
      return { ok: problems.length === 0, text, version };
    } catch (error) {
      log(describeError(error));
      return { ok: false, text: describeError(error), version };
    }
  });

  const routes = {
    '/ping': async () => ({ ok: true, stamp, root: REPO }),
    '/stop': async (call) => {
      const refused = otherTree(call);
      if (refused) return refused;
      setTimeout(() => stop(), 50);
      return { ok: true, text: 'the lab server stopped' };
    },
    '/changes': async ({ since = 0 }) => {
      const changed = await changes.after(since);
      return { changed, version: changes.count, files: changes.files };
    },
    '/run': async (call) => {
      const refused = otherTree(call);
      if (refused) return refused;
      if (call.stamp && call.stamp !== stamp) return otherCode();
      if (call.command === 'live') return runLive(call);
      const job = runCommand(call);
      job.finally(bootNext).catch(() => {});
      try {
        return await job;
      } catch (error) {
        log(describeError(error));
        return { ok: false, text: describeError(error), version: changes.count };
      }
    },
  };

  const server = http.createServer(async (request, response) => {
    const refused = refusal(request, port);
    if (refused) {
      return reply(response, { ok: false, text: `the lab server only answers its own command line (${refused})` }, 403);
    }
    const route = routes[request.url];
    if (!route) return reply(response, { ok: false, text: `no ${request.url}` }, 404);
    try {
      reply(response, await route(await readJson(request)));
    } catch (error) {
      reply(response, { ok: false, text: describeError(error) }, 400);
    }
  });
  server.listen(port, '127.0.0.1', () => {
    writeFileSync(SERVER_NOTE, JSON.stringify({ pid: process.pid, watcher: process.ppid, port }));
    log(`the lab is serving on 127.0.0.1:${port}; Ctrl+C stops it`);
  });
}
