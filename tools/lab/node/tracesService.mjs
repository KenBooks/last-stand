// A traces service of the lab's own (server/traces), for `lab recorder`, `lab profile` and `lab ui`'s bug report: started
// on a free port for the page's origin alone, with a token made for it, what it's sent kept in
// tools/lab/out/traces-service. The page sends the trace it packed there as the game sends one (src/perf/upload.ts: a
// plain cross-origin POST), or the bug report's form its report (src/ui/bugReportSend.ts), and the lab reads it back
// with the token: the whole way a report goes, without the production service.
import { randomBytes } from 'node:crypto';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { decodeTrace } from '../../../src/perf/traceFormat.ts';
import { traceReport } from '../../../src/perf/traceReport.ts';
import { OUT } from './paths.mjs';

/** where the service keeps what it's sent (emptied as it starts: it holds nothing but the lab's own traces) */
const DATA = join(OUT, 'traces-service');
/** a code in the page's report, as the service makes them */
const CODE_LINE = /sent to the traces service: ([0-9A-Z]{4}-[0-9A-Z]{4})/;

/** the one service this process runs, shared by its commands, and how many of them hold it */
let shared = null;
let holders = 0;

/** The pages a service takes from: `origin`'s host on any port, and the lab's own hosts (each session's page is on a
 *  port of its own). */
function originsFor(origin) {
  const { protocol, hostname } = new URL(origin);
  const hosts = new Set([hostname, 'localhost', '127.0.0.1']);
  return [...hosts].map((host) => `${protocol}//${host}:*`).join(',');
}

/** The service started: one a process (server/traces keeps its settings, its token among them, and what it holds in
 *  its module: started again for a second command beside the first, as `lab check` runs them, it took the second's
 *  token, and the first's read back answered 401). */
async function startShared(origin) {
  const { start } = await import('../../../server/traces/traces.mjs');
  rmSync(DATA, { recursive: true, force: true });
  const token = randomBytes(16).toString('hex');
  const server = await start(0, {
    DATA, ORIGINS: originsFor(origin), TRACES_TOKEN: token, PER_DAY: '100', REPORT_PER_HOUR: '100',
    REPORT_PER_DAY: '100',
  });
  return { server, token, url: `http://127.0.0.1:${server.address().port}` };
}

/**
 * The service for `origin`, started for this process's first command and shared by any beside it; resolves to its
 * address (`url`), a way to read a trace back (`readBack`) and to let it go (`close`: closed once every holder has).
 */
export async function startTracesService(origin) {
  holders++;
  shared ??= startShared(origin);
  const { server, token, url } = await shared;
  const headers = { authorization: `Bearer ${token}` };
  let held = true;
  return {
    url,
    /** The trace the service kept under `code`, read back as `lab trace` reads one. */
    async readBack(code) {
      const response = await fetch(`${url}/traces/${code}`, { headers });
      if (!response.ok) throw new Error(`the local traces service answered ${response.status} for ${code}`);
      const raw = gunzipSync(Buffer.from(await response.arrayBuffer()));
      return decodeTrace(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength));
    },
    /** The bug report the service kept under `code` (its JSON), and its picture's bytes (null if it has none). */
    async readReport(code) {
      const response = await fetch(`${url}/traces/reports/${code}`, { headers });
      if (!response.ok) throw new Error(`the local traces service answered ${response.status} for report ${code}`);
      const report = await response.json();
      const picture = await fetch(`${url}/traces/reports/${code}.jpg`, { headers });
      return { report, picture: picture.ok ? Buffer.from(await picture.arrayBuffer()) : null };
    },
    /** This holder let go; the service closed once none holds it. */
    async close() {
      if (!held) return;
      held = false;
      holders--;
      if (holders > 0) return;
      shared = null;
      await new Promise((resolve) => server.close(resolve));
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
  let text = `${result.text.replace(CODE_LINE, 'sent to the traces service: a code')}\n${line}`;
  const problems = whole ? [...result.problems] : [...result.problems, 'the trace came back changed'];
  const manualLine = /manual recording sent to the traces service: ([0-9A-Z]{4}-[0-9A-Z]{4})/;
  const manualCode = manualLine.exec(result.text)?.[1];
  if (manualCode) {
    const manual = await service.readBack(manualCode);
    const marks = manual.header.marks.map(([, label]) => label);
    if (manual.header.reason.why !== 'manual' || !marks.includes('resolution 50%')
      || !marks.some(label => label.startsWith('keyboard delivery delayed 5000 ms'))) {
      problems.push('the manual recording or its diagnostic marks came back changed');
    }
    text = text.replace(manualLine, 'manual recording sent to the traces service: a code')
      + '\n  manual recording read back from the service: manual reason, resolution and keyboard-delay marks kept';
  }
  return { ...result, text, problems };
}

/** the profile's lines in the page's report: indented under its place's name, before the line saying it was sent */
const PROFILE_LINES = /^ {2}(the frame [^\n]*(?:\n {2}(?!sent to)[^\n]*)*)/m;

/**
 * The page's profile with the trace it sent read back as `lab trace` reports it: its Profile section must hold the
 * profile's lines as the page had them, and its settings the renderer that drew it. A line on what came back (its code
 * taken out, as it differs from run to run), and a problem where it didn't.
 */
export async function checkProfileSent(result, service) {
  const code = CODE_LINE.exec(result.text)?.[1];
  if (!code) return { ...result, problems: [...result.problems, 'the profile was never sent to the traces service'] };
  const report = traceReport(await service.readBack(code));
  const at = report.indexOf('Profile:');
  const sent = PROFILE_LINES.exec(result.text)?.[1].split('\n').map((line) => line.trim()) ?? [];
  const read = at < 0 ? [] : report.slice(at + 1, at + 1 + sent.length).map((line) => line.trim());
  const whole = sent.length > 0 && read.join('\n') === sent.join('\n');
  const settings = report.find((line) => line.startsWith('Quality ')) ?? '';
  const renderer = /renderer ([^ |]+)/.exec(settings)?.[1] ?? '?';
  const asSent = whole ? 'as sent' : 'not as sent';
  const line = `  read back as lab trace reports it: Profile, ${read.length} lines ${asSent}; renderer ${renderer}`;
  const text = `${result.text.replace(CODE_LINE, 'sent to the traces service: a code')}\n${line}`;
  const problems = whole ? result.problems : [...result.problems, 'the profile came back changed'];
  return { ...result, text, problems };
}

/** the line the bug report's state writes as it sends (tools/lab/page/uiBugReport.ts) */
const REPORT_LINE = new RegExp('sent to the reports service: ([0-9A-Z]{4}-[0-9A-Z]{4}), kind (\\w+), '
  + 'what happened (\\d+) characters, picture (\\d+) bytes');
/** the problem the report's canary (its picture dropped on its way) must raise */
const PICTURE_LOST = 'the report came back without its picture';

/** What came back of a report against what the page said it sent: the problems. */
function reportProblems(sent, kept) {
  const problems = [];
  if (kept.report.kind !== sent.kind) problems.push(`the report came back as ${kept.report.kind}, not ${sent.kind}`);
  if (kept.report.text.length !== sent.textLength) problems.push('the report came back with other text');
  if (!kept.report.facts.some((fact) => fact.startsWith('Build: '))) problems.push('the report came back without its facts');
  if (sent.pictureBytes && !kept.picture) problems.push(PICTURE_LOST);
  else if (kept.picture && kept.picture.length !== sent.pictureBytes) problems.push('the report\'s picture came back changed');
  return problems;
}

/**
 * The `ui` command's bug report state with the report it sent read back from the service (its code taken out of the
 * text, as it differs from run to run): a problem where it didn't come back as sent. With the canary its picture was
 * dropped on the way, which must be found.
 */
export async function checkReportSent(result, service, canary) {
  const match = REPORT_LINE.exec(result.text);
  if (!match) return { ...result, problems: [...result.problems, 'the bug report was never sent to the reports service'] };
  const [, code, kind, textLength, pictureBytes] = match;
  const sent = { kind, textLength: Number(textLength), pictureBytes: Number(pictureBytes) };
  const kept = await service.readReport(code);
  const problems = reportProblems(sent, kept);
  const pictured = kept.picture ? `the picture's ${kept.picture.length} bytes` : 'no picture';
  const lines = [`  read back from the reports service with its token: ${kept.report.kind}, `
    + `${kept.report.text.length} characters, ${kept.report.facts.length} facts, ${pictured}`];
  if (canary) {
    const caught = problems.includes(PICTURE_LOST);
    lines.push(`  canary: the report's picture dropped on its way ${caught ? 'caught' : 'went unseen'}`);
    problems.length = 0;
    if (!caught) problems.push('bugReport: the canary\'s picture dropped on its way went unseen');
  }
  const text = [result.text.replace(code, 'a code'), ...lines].join('\n');
  return { ...result, text, problems: [...result.problems, ...problems] };
}
