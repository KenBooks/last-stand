// A traces service of the lab's own (server/traces), for `lab recorder`: started on a free port for the page's
// origin alone, with a token made for it, its traces kept in tools/lab/out/traces-service. The page sends the trace it
// packed there as the game sends one (src/perf/upload.ts: a plain cross-origin POST), and the lab reads it back with
// the token: the whole way a report goes, without the production service.
import { randomBytes } from 'node:crypto';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { decodeTrace } from '../../../src/perf/traceFormat.ts';
import { OUT } from './paths.mjs';

/** where the service keeps what it's sent (emptied as it starts: it holds nothing but the lab's own traces) */
const DATA = join(OUT, 'traces-service');
/** a code in the page's report, as the service makes them */
const CODE_LINE = /sent to the traces service: ([0-9A-Z]{4}-[0-9A-Z]{4})/;

/**
 * Starts the service for `origin`; resolves to its address (`url`), a way to read a trace back (`readBack`) and to
 * close it.
 */
export async function startTracesService(origin) {
  const { start } = await import('../../../server/traces/traces.mjs');
  rmSync(DATA, { recursive: true, force: true });
  const token = randomBytes(16).toString('hex');
  const server = await start(0, { DATA, ORIGINS: origin, TRACES_TOKEN: token, PER_HOUR: '100', PER_DAY: '100' });
  const url = `http://127.0.0.1:${server.address().port}`;
  return {
    url,
    /** The trace the service kept under `code`, read back as `lab trace` reads one. */
    async readBack(code) {
      const response = await fetch(`${url}/traces/${code}`, { headers: { authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error(`the local traces service answered ${response.status} for ${code}`);
      const raw = gunzipSync(Buffer.from(await response.arrayBuffer()));
      return decodeTrace(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength));
    },
    close() {
      return new Promise((resolve) => server.close(resolve));
    },
  };
}

/**
 * The page's report with the trace it sent read back: a line on what came back (its code taken out, as it differs
 * from run to run), and a problem if nothing was sent or it didn't come back whole.
 */
export async function checkSent(result, service) {
  const code = CODE_LINE.exec(result.text)?.[1];
  if (!code) return { ...result, problems: [...result.problems, 'the trace was never sent to the traces service'] };
  const trace = await service.readBack(code);
  const sentFrames = Number(/the trace: (\d+) frames/.exec(result.text)?.[1]);
  const whole = trace.header.frames === sentFrames;
  const line = `  read back from the service with its token: ${trace.header.frames} frames, `
    + `${Object.keys(trace.columns).length} columns, ${whole ? 'as sent' : `not the ${sentFrames} sent`}`;
  const text = `${result.text.replace(CODE_LINE, 'sent to the traces service: a code')}\n${line}`;
  return { ...result, text, problems: whole ? result.problems : [...result.problems, 'the trace came back changed'] };
}
