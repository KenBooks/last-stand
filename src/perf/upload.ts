// A slow stretch's trace made and sent (src/perf/AGENTS.md): the recorder's snapshot with the device, the settings and
// the build in its header (nothing of the player's: no names, rooms, items or address beyond the page's path),
// packed (`traceFormat.ts`), gzipped by the browser (`CompressionStream`) and posted to the traces service beside the
// co-op relay (server/traces). The service worker never sees it: it only answers GETs of the game's own files.
import { framesUncapped } from '../core/frameLoop';
import * as THREE from 'three';
import { G } from '../state';
import { WEBGPU } from '../core/webgpu';
import { RUNNING } from '../core/rendererChoice';
import { qualityBudget, qualityLevel, qualitySetting } from '../core/quality';
import { QUALITY } from '../data/quality';
import { sceneRatio, sceneSamples, sceneSize, viewMode } from '../core/renderer';
import { hdrActive } from '../core/hdr';
import { auditPrograms, lateCompiles, shaderErrors } from '../core/shaders';
import { isCoop } from '../net/role';
import { serverHttp } from '../net/transport';
import { bootStallSummary } from './bootStalls';
import { perfBundle, perfGpuName, perfJsBench } from '../ui/perfHud';
import { encodeTrace, TRACE_MAX_BYTES, type ColumnInfo } from './traceFormat.ts';
import { recorder, type Slow, type Snapshot } from './recorder';

declare const __BUILD__: { ref: string; time: string };

/** the query's switches that change how the game renders, kept in a trace's page (anything else is left out) */
const KEPT_SWITCHES = /^(renderer|meshlets|lights)/;

/** Whether this browser can make a trace's gzip (Safari before 16.4 can't). */
export const canSend = (): boolean => typeof CompressionStream === 'function' && typeof fetch === 'function';

function page(): string {
  const kept = [...new URLSearchParams(location.search)].filter(([k]) => KEPT_SWITCHES.test(k));
  return location.pathname + (kept.length ? '?' + new URLSearchParams(kept).toString() : '');
}

function device(): Record<string, number | string | boolean> {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    ua: navigator.userAgent,
    gpu: perfGpuName(),
    cores: navigator.hardwareConcurrency ?? 0,
    memoryGb: nav.deviceMemory ?? 0,
    screen: `${screen.width}x${screen.height}`,
    window: `${innerWidth}x${innerHeight}`,
    dpr: devicePixelRatio,
    touch: navigator.maxTouchPoints > 0,
    jsBenchMs: Math.round(perfJsBench() * 100) / 100,
    installed: matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches,
  };
}

function settings(): Record<string, number | string | boolean> {
  const level = qualityLevel();
  const scene = sceneSize(new THREE.Vector2());
  return {
    quality: level,
    setting: qualitySetting(),
    budgetPx: Number.isFinite(qualityBudget()) ? qualityBudget() : 0,
    msaa: sceneSamples(),
    shadowMap: QUALITY[level].shadowMap,
    scene: `${scene.x}x${scene.y}`,
    sceneRatio: Math.round(sceneRatio() * 100) / 100,
    pixelRatio: G.renderer.getPixelRatio(),
    view: viewMode(),
    vsync: framesUncapped() ? 'off' : 'on',
    renderer: WEBGPU ? ['webgpu', RUNNING.meshlets && 'meshlets', RUNNING.lightsEach && 'lights each'].filter(Boolean).join(' ') : 'webgl',
    hdr: hdrActive(),
  };
}

/** the most a report's shader audit holds the page (ms): the rest is asked by the next */
const AUDIT_MS = 40;
/** the most programs that failed named in a report */
const ERRORS_SENT = 6;

function game(): Record<string, number | string | boolean> {
  auditPrograms(G.renderer, AUDIT_MS);
  return {
    mode: G.mode,
    biome: G.arena.biome,
    hero: G.player.cls.id,
    coop: isCoop(),
    wave: G.run?.wave ?? 0,
    foes: G.enemies.length,
    compiledLate: lateCompiles.length,
    lateCompiles: lateCompiles.slice(-20).join(' || '),
    shaderErrors: shaderErrors.slice(0, ERRORS_SENT).join(' || '),
    shaderErrorCount: shaderErrors.length,
  };
}

/** The slow stretch's trace, packed. */
export function traceOf(slow: Slow): Uint8Array {
  const { snapshot } = slow;
  const columns: ColumnInfo[] = Object.keys(snapshot.columns).map((name) => ({ name, kind: snapshot.kinds[name] }));
  const reason: Record<string, number | string> = { scene: slow.scene, refreshHz: snapshot.refreshHz };
  if (slow.verdict) {
    const v = slow.verdict;
    Object.assign(reason, { why: v.why, meanFps: round(v.meanFps), lowFps: round(v.lowFps), missed: round(v.missed, 3),
      stalls: v.stalls, longestMs: round(v.longest), playMs: Math.round(v.playMs) });
  }
  // (a slow boot's, the play after it judged beside it: recorder.ts `bootTail`)
  if (slow.scene === 'boot') reason.why = 'boot';
  else if (slow.profile) {
    reason.why = 'profile';
    reason.profile = slow.profile.join('\n');
  } else if (!slow.verdict) reason.why = 'readying';
  if (slow.tookMs) reason.tookMs = Math.round(slow.tookMs);
  const b = snapshot.boot;
  Object.assign(reason, { bootMs: b.revealMs, bootDownloadMs: b.downloadMs, firstVisit: b.firstVisit });
  const [commit, pr] = parseRef(__BUILD__.ref);
  return encodeTrace({
    at: new Date().toISOString(),
    build: { bundle: perfBundle, commit, pr },
    page: page(),
    reason,
    device: device(),
    settings: settings(),
    game: { ...game(), scene: snapshot.scene ?? '', bootSteps: b.steps.map(([t, label]) => `${t} ${label}`).join(' | '),
      bootStalls: bootStallSummary(b.stalls ?? []) },
    columns,
    longFrames: snapshot.longFrames,
    marks: snapshot.marks,
  }, snapshot.frames, snapshot.columns);
}

const round = (v: number, digits = 1): number => (Number.isFinite(v) ? Math.round(v * 10 ** digits) / 10 ** digits : -1);

/** `__BUILD__.ref`, "PR #12 · abc1234" or "abc1234", as its commit and PR. */
function parseRef(ref: string): [string, number | null] {
  const m = /^(?:PR #(\d+) · )?(\S+)$/.exec(ref);
  return m ? [m[2], m[1] ? Number(m[1]) : null] : [ref, null];
}

/** `bytes` gzipped by the browser. */
export async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The slow stretch's trace, packed and gzipped, ready to send (its size shown when the player is asked). */
/** The trace of now, packed (not gzipped), as base64: a harness's (`window.__traceNow`, read by tools/stalls `--read`
 *  to keep the real game's traces, which the format is tuned on: `lab trace --file <read> --sizes`). Sends nothing. */
export function traceNow(): string {
  const slow: Slow = { scene: 'lobby', verdict: recorder.judged(), tookMs: 0, at: performance.now(), snapshot: recorder.snapshot() };
  const bytes = traceOf(slow);
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

/** A trace over the server's 1 MB is cut to its newest half until it fits (a minute at 240 frames a second of noisy
 *  values came to 0.8 MB: tools/lab/test/trace.test.mjs). */
export async function packTrace(slow: Slow): Promise<Uint8Array> {
  let body = await gzip(traceOf(slow));
  for (let s = slow; body.length > TRACE_MAX_BYTES && s.snapshot.frames > 1;) {
    s = { ...s, snapshot: newestHalf(s.snapshot) };
    body = await gzip(traceOf(s));
  }
  return body;
}

/** The snapshot's newer half: its frames, and its marks and long frames from then, timed from its new first frame. */
function newestHalf(snapshot: Snapshot): Snapshot {
  const from = Math.floor(snapshot.frames / 2);
  const columns: Record<string, Float64Array> = {};
  for (const name in snapshot.columns) columns[name] = snapshot.columns[name].slice(from);
  let t0 = 0;
  for (let i = 1; i <= from; i++) t0 += Math.max(0, snapshot.columns.interval[i]);
  const later = <T extends [number, ...unknown[]]>(rows: T[]): T[] =>
    rows.filter(([t]) => t >= t0).map(([t, ...rest]) => [Math.round((t - t0) * 10) / 10, ...rest] as T);
  return { ...snapshot, frames: snapshot.frames - from, columns, marks: later(snapshot.marks), longFrames: later(snapshot.longFrames) };
}

/** What a send came to: the report's code, or why it failed. */
export type Sent = { code: string; bytes: number } | { error: string };

/** A packed trace sent to the traces service (`base`: another's, the lab's own); its report's code back. */
export async function sendTrace(body: Uint8Array, base = serverHttp()): Promise<Sent> {
  if (body.length > TRACE_MAX_BYTES) return { error: `the trace came to ${Math.round(body.length / 1024)} KB, over the 1 MB the server takes` };
  try {
    // (no headers of its own: a plain request, no preflight; no cookies)
    const r = await fetch(`${base}/traces`, {
      method: 'POST', body: body as BodyInit, cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) return { error: r.status === 429 ? 'too many reports from here today' : `the server answered ${r.status}` };
    const { code } = (await r.json()) as { code: string };
    return { code, bytes: body.length };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
