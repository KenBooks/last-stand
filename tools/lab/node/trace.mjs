// `lab trace`: a performance trace a slow game sent, fetched from the traces service (server/traces) and read as the
// perf overlay's report reads (src/perf/traceReport.ts). The token comes from `tools/lab/traces.env` (never in the
// repo; the owner keeps it, as Dokci's LS_TRACES_TOKEN), or TRACES_TOKEN in the environment. Each trace fetched is
// kept in tools/lab/out/traces/<code>.lspt.gz, read again from there without the server.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { decodeTrace } from '../../../src/perf/traceFormat.ts';
import { traceReport } from '../../../src/perf/traceReport.ts';
import { labError } from './errors.mjs';
import { OUT } from './paths.mjs';

const ENV_FILE = resolve(import.meta.dirname, '../traces.env');
const DEFAULT_SERVER = 'https://ls.wellscoped.dev';
const KEPT = join(OUT, 'traces');

/** `KEY=value` lines of the env file (none: an empty object). */
export function readEnvFile(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trimStart().startsWith('#')) values[m[1]] = m[2].replace(/^(["'])(.*)\1$/, '$2');
  }
  return values;
}

function settings(options) {
  const file = existsSync(ENV_FILE) ? readEnvFile(readFileSync(ENV_FILE, 'utf8')) : {};
  const server = (options.server ?? process.env.TRACES_SERVER ?? file.TRACES_SERVER ?? DEFAULT_SERVER).replace(/\/+$/, '');
  const token = process.env.TRACES_TOKEN ?? file.TRACES_TOKEN ?? '';
  return { server, token };
}

/** A GET of the service with the token; the response, or a lab error that says what to do. */
async function get(path, { server, token }) {
  if (!token) throw labError(`lab trace needs the token: TRACES_TOKEN=... in ${ENV_FILE} (ask the owner)`);
  const response = await fetch(`${server}${path}`, { headers: { authorization: `Bearer ${token}` } });
  if (response.status === 401) throw labError('the traces service turned the token away');
  if (!response.ok) throw labError(`the traces service answered ${response.status}: ${await response.text()}`);
  return response;
}

/** A trace's bytes unpacked: gzipped (as sent) or not (as packed). */
export function unpacked(bytes) {
  return bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes;
}

/** The trace's report, from its bytes as sent. */
export function reportOf(bytes, code = '') {
  const raw = unpacked(bytes);
  return traceReport(decodeTrace(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)), code).join('\n');
}

const listLine = (t) =>
  `${t.code}  ${t.at}  ${t.commit}${t.pr ? ` PR #${t.pr}` : ''}  ${t.scene}/${t.why}  ${t.frames} frames  `
  + `${Math.round(t.bytes / 1024)} KB  ${t.quality}  ${t.gpu}`;

/** Runs `lab trace`; its exit code. */
export async function runTrace(options) {
  if (options.file) {
    console.log(reportOf(readFileSync(resolve(options.file))));
    return 0;
  }
  const where = settings(options);
  if (options.list) {
    const query = new URLSearchParams({ limit: '100', ...(options.build ? { build: options.build } : {}) });
    const { traces, total } = await (await get(`/traces?${query}`, where)).json();
    console.log(`${total} traces kept${options.build ? ` from ${options.build}` : ''}, newest first:`);
    for (const t of traces) console.log(`  ${listLine(t)}`);
    return 0;
  }
  let code = options._[0]?.toUpperCase();
  if (!code && options.build) {
    const { traces } = await (await get(`/traces?${new URLSearchParams({ build: options.build, limit: '1' })}`, where)).json();
    if (!traces.length) throw labError(`no trace kept from ${options.build}`);
    code = traces[0].code;
  }
  if (!code && !options.latest) throw labError('lab trace needs a code, --latest, --build <sha>, --list or --file');
  const cached = code && join(KEPT, `${code}.lspt.gz`);
  let bytes;
  if (cached && existsSync(cached)) bytes = readFileSync(cached);
  else {
    const response = await get(code ? `/traces/${encodeURIComponent(code)}` : '/traces/latest', where);
    code ??= response.headers.get('x-trace-code') ?? 'latest';
    bytes = Buffer.from(await response.arrayBuffer());
    mkdirSync(KEPT, { recursive: true });
    writeFileSync(join(KEPT, `${code}.lspt.gz`), bytes);
  }
  console.log(reportOf(bytes, code));
  console.log(`(kept in ${join(KEPT, `${code}.lspt.gz`)}: --file reads it again without the server)`);
  return 0;
}
