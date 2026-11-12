// The game's performance report as its overlay copies it (`perfReport` in src/ui/perfHud.ts), read by `lab perf`:
// its histories, a value for each of its 0.5 s buckets, and its long frames. The owner's lobby fell from 144 frames a
// second to 28 while hovering items, its frames late by 20 to 46 ms where ours took 11 to 18, and nothing in the
// report said whether the page's main thread or something outside it held them up: the long frames (Chrome's Long
// Animation Frames API) say what the thread did in each. A long task of the page's must be listed with what ran it.
// (It's run by a message: a click's long frame ends at the page's next rendering, which the lab's held frames put off
// past the report, where the owner's game renders every frame.)
import * as perfHud from '../../../src/ui/perfHud';

/** the task planted (ms): over the browser's 50, a long frame it counts; the canary's, under it, which it can't */
const PLANTED_MS = 120;
const CANARY_MS = 30;
/** the report's histories, each a value a bucket */
const HISTORIES = ['FPS history', 'Ours history', 'Late history', 'GPU history'];
/** the buckets each history has: its 15 s window in 0.5 s */
const BUCKETS = 30;
/** how the browser names what ran the planted task */
const PLANTED_BY = 'MessagePort.onmessage';
/** how long the browser is given to hand its long frames over after the task (ms, its own clock) */
const HANDED_OVER_MS = 100;

/** Busy on the main thread for `ms` by the browser's clock (the page's stands still). */
function busyFor(ms: number): void {
  const start = window.__labClock.realNow();
  while (window.__labClock.realNow() - start < ms) {
    // (busy: a task the browser counts as long)
  }
}

/** A task of `ms` run by a message to the page, and whether it ran. */
function plantTask(ms: number): () => boolean {
  const channel = new MessageChannel();
  let ran = false;
  channel.port1.onmessage = () => {
    ran = true;
    busyFor(ms);
    channel.port1.close();
  };
  channel.port2.postMessage(null);
  return () => ran;
}

/** A real wait of `ms`, by the browser's timers. */
function waited(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The report's line that starts with `name`, its values after the name (none: not in the report). */
function historyOf(report: string, name: string): string[] | null {
  const line = report.split('\n').find((text) => text.startsWith(name));
  if (!line) return null;
  return line.slice(line.indexOf(')') + 1).trim().split(' ');
}

/** Whether a long frame's line is the planted task's: about as long, and run by its message. */
function isPlanted(frame: string, ms: number): boolean {
  const length = Number(frame.trim().split(' ')[0]);
  return Math.abs(length - ms) < ms / 4 && frame.includes(PLANTED_BY);
}

/** The report's long frames: its count line, and each frame's line under it. */
function longFramesOf(report: string): { head: string; frames: string[] } {
  const lines = report.split('\n');
  const at = lines.findIndex((text) => text.startsWith('Long frames'));
  if (at < 0) return { head: '', frames: [] };
  const frames = [];
  for (let index = at + 1; index < lines.length && lines[index].startsWith('  '); index++) frames.push(lines[index]);
  return { head: lines[at], frames };
}

/**
 * The report's boot: its long frames up to the loading screen's leaving, each named by the loading step it came in.
 * A lab boot compiles every program behind its loading screen, so it always has some: none listed is a problem.
 */
function bootRead(report: string): { lines: string[]; problems: string[] } {
  const lines = report.split('\n');
  const at = lines.findIndex((text) => text.startsWith('Boot\'s long frames'));
  if (at < 0) return { lines: ['the report\'s boot: none'], problems: ['the report has no boot\'s long frames'] };
  const frames = [];
  for (let index = at + 1; index < lines.length && lines[index].startsWith('  '); index++) frames.push(lines[index]);
  const named = frames.filter((frame) => / at [\d.]+s \(.+\):/.test(frame));
  const problems = [];
  if (!frames.length) problems.push('the report\'s boot lists no long frame');
  if (named.length < frames.length) problems.push('the report\'s boot has a frame without its time and step');
  return { lines: [`the report's boot: ${lines[at]}`, ...frames.slice(0, 2).map((frame) => `  ${frame.trim()}`)], problems };
}

/** Each history's count of buckets, and a problem for one that hasn't `BUCKETS`. */
function historiesRead(report: string): { lines: string[]; problems: string[] } {
  const lines: string[] = [];
  const problems: string[] = [];
  for (const name of HISTORIES) {
    const count = historyOf(report, name)?.length ?? 0;
    lines.push(`the report's ${name}: ${count} buckets`);
    if (count !== BUCKETS) problems.push(`the report's ${name} has ${count} buckets, not ${BUCKETS}`);
  }
  return { lines, problems };
}

/**
 * A task of `PLANTED_MS` run by a message to the page, then the report read: each history a value for each bucket,
 * and the task among the long frames, named by what ran it. `canary`: the task `CANARY_MS`, under the browser's 50,
 * which the report can't list: it must be found missing. A tree with no report to read says so.
 */
export async function reportRead(canary: boolean): Promise<{ lines: string[]; problems: string[] }> {
  const read = (perfHud as { perfReport?: () => string }).perfReport;
  if (!read) return { lines: ['the performance report: none for a harness to read in this tree'], problems: [] };
  const ms = canary ? CANARY_MS : PLANTED_MS;
  const ran = plantTask(ms);
  await waited(HANDED_OVER_MS);
  await window.__labClock.realFrame();
  const report = read();
  const { lines, problems } = historiesRead(report);
  const boot = bootRead(report);
  lines.push(...boot.lines);
  problems.push(...boot.problems);
  if (!ran()) problems.push('the report\'s long frames: the planted task never ran');
  const { head, frames } = longFramesOf(report);
  const listed = frames.find((frame) => isPlanted(frame, ms));
  lines.push(`the report's long frames: ${head || 'none'}`);
  lines.push(`  a task of ${ms} ms, run by a message: ${listed ? `listed as${listed}` : 'not listed'}`);
  if (!listed) lines.push(...frames.map((frame) => `  listed:${frame}`));
  if (!listed) problems.push(`the report's long frames: a task of ${ms} ms isn't listed`);
  if (!canary) return { lines, problems };
  const caught = problems.some((problem) => problem.includes('isn\'t listed'));
  lines.push(`the report's canary: a task under the browser's 50 ms ${caught ? 'found missing (caught)' : 'listed'}`);
  return { lines, problems: caught ? [] : ['the report\'s canary: a task of 30 ms was listed among the long frames'] };
}
