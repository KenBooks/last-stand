// A profile as its report reads (`profiler.ts`'s result): each part's cost with how far it's known, its share of
// the frame it was timed in, and how far the frame's own time moved from part to part.
import { gpuPartsLines } from './gpuParts';
import type { PartCost, Profile } from './profiler';

/** Whether a part's cost is told apart from nothing: over twice how far it's known. */
export const costKnown = (part: PartCost): boolean => Math.abs(part.on - part.off) > 2 * (part.error ?? 0);

/** A part's share of the frame it was timed in, its own "with it" (%): the frame's time moves from part to part
 *  with the GPU's clock, and by the frame alone a phone's parts read 64% and 59% of it, 135% all told. */
export function shareOf(part: PartCost): number {
  return part.on > 0 ? (100 * (part.on - part.off)) / part.on : 0;
}

/** A part's cost as a line: what it takes, its share of the frame, the frame with it and without; on WebGPU, the
 *  pipelines made while it was timed (WebGL's line as it was). */
function partLine(part: PartCost, onWebGPU = false): string {
  const takes = part.on - part.off;
  const made = onWebGPU && part.compiled ? `, ${part.compiled} pipelines made` : '';
  const known = part.error === undefined ? '' : ` ±${part.error.toFixed(1)}`;
  const faint = costKnown(part) ? '' : ', not told apart from nothing';
  return `${part.name}: ${takes.toFixed(1)}${known} ms, ${shareOf(part).toFixed(0)}% of its frame `
    + `(${part.on.toFixed(1)} with it, ${part.off.toFixed(1)} without${made}${faint})`;
}

/** How far the frame's own time moved from part to part, said where it's by over a fifth: the GPU's clock moving
 *  under the profile, each part's share then of the frame it was timed in. */
function driftLine(parts: PartCost[]): string[] {
  const frames = parts.map((part) => part.on).filter((on) => on > 0);
  if (frames.length < 2) return [];
  const [least, most] = [Math.min(...frames), Math.max(...frames)];
  if (most < least * 1.2) return [];
  return [`the frame itself read ${least.toFixed(1)} to ${most.toFixed(1)} ms from part to part (the GPU's clock `
    + 'moving, or a part whose "with it" is another way of drawing): each part\'s share is of the frame it was timed in'];
}

/** A profile as lines: the frame, then each part's cost, the costliest first. */
export function profileLines(found: Profile): string[] {
  const fps = found.frame > 0 ? Math.round(1000 / found.frame) : 0;
  // (WebGL's lines as they were, the traces before WebGPU's read alike; WebGPU's says so, and counts its pipelines)
  const onWebGPU = found.renderer.startsWith('WebGPU') || found.renderer.startsWith('the Rust engine');
  const made = onWebGPU
    ? `${found.compiled} pipelines made (${found.compiledAtDraw ?? 0} at a draw), on ${found.renderer}`
    : `${found.compiled} programs compiled`;
  const timed = found.gpuTimed ? 'timed by the GPU\'s timestamps' : 'drawn and waited for';
  const frame = `the frame ${found.frame.toFixed(1)} ms (${fps} fps), each frame ${timed}; `
    + `profiled in ${found.seconds.toFixed(1)} s, ${made}`
    + (found.idle === undefined ? '' : `, the GPU kept drawing in ${((1 - found.idle) * 100).toFixed(0)}% of the frames between`);
  const lines = [frame];
  if (found.byParts) lines.push(...gpuPartsLines(found.byParts, found.frame));
  if (found.byParts) lines.push('each part taken out and put back in turns (these overlap, and don\'t add up):');
  lines.push(...driftLine(found.parts), ...found.parts.map((part) => partLine(part, onWebGPU)));
  lines.push(...(found.untimed ?? []).map((part) => `${part.name}: ${part.why}`));
  if (!found.shown) return lines;
  const shownFps = found.shown.frame > 0 ? Math.round(1000 / found.shown.frame) : 0;
  lines.push(`the frame as the browser shows it, frame to frame: ${found.shown.frame.toFixed(1)} ms (${shownFps} fps), `
    + 'the page\'s parts hidden');
  lines.push(...found.shown.parts.map((part) => partLine(part)));
  return lines;
}
