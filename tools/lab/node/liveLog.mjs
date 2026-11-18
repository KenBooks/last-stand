// The steps of a live session (tools/lab, `lab live`) as they're kept: what it started with (the hero and his set-up)
// and each step since that changed its page (an expression evaluated, frames run), so a page booted again (the source
// changed, the server started again) is brought back to where those steps left it. Kept in a file, as a server
// started again for new lab code has nothing of the last one's.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** the kinds of step a page is brought back by, in the order they ran */
export const REPLAYED = ['eval', 'frames', 'command'];

export class LiveLog {
  /** what the session started with (`{ heroClass, fixture }`), null before it starts */
  start = null;
  /** the steps that changed the page since (`{ kind: 'eval', expression }`, `{ kind: 'frames', count }`) */
  steps = [];
  /** how many pictures the session has taken, so each one's file has a name of its own */
  pictures = 0;

  /** The log kept in `file`, as it was left there (none yet: empty). */
  constructor(file) {
    this.file = file;
    if (!existsSync(file)) return;
    const kept = JSON.parse(readFileSync(file, 'utf8'));
    this.start = kept.start ?? null;
    this.steps = kept.steps ?? [];
    this.pictures = kept.pictures ?? 0;
  }

  /** whether the session has started */
  get started() {
    return this.start !== null;
  }

  /** Starts the log again from `start`, no steps after it. */
  begin(start) {
    this.start = start;
    this.steps = [];
    this.write();
  }

  /** Adds a step that changed the page (`REPLAYED`'s kinds). */
  add(step) {
    if (!REPLAYED.includes(step.kind)) throw new Error(`lab: live: a ${step.kind} step changes nothing to replay`);
    this.steps.push(step);
    this.write();
  }

  /** The next picture's number, counted. */
  nextPicture() {
    this.pictures++;
    this.write();
    return this.pictures;
  }

  /** Forgets the session: nothing started, the file gone. */
  clear() {
    this.start = null;
    this.steps = [];
    this.pictures = 0;
    rmSync(this.file, { force: true });
  }

  /** The session as lines: what it started with, then each step. */
  describe() {
    if (!this.started) return ['no live session (lab live start)'];
    const { heroClass, fixture, screen } = this.start;
    const on = screen ? ` on ${screen.width}x${screen.height}@${screen.ratio}` : '';
    const lines = [`started: the ${heroClass}${on}, set up as ${JSON.stringify(fixture)}`];
    this.steps.forEach((step, i) => lines.push(`${i + 1}. ${describeStep(step)}`));
    return lines;
  }

  write() {
    mkdirSync(dirname(this.file), { recursive: true });
    const kept = { start: this.start, steps: this.steps, pictures: this.pictures };
    writeFileSync(this.file, JSON.stringify(kept, null, 2));
  }
}

/** A step as a line. */
export function describeStep(step) {
  if (step.kind === 'eval') return `eval ${step.expression}`;
  if (step.kind === 'frames') return `frames ${step.count}`;
  if (step.kind === 'command') return step.said;
  return step.kind;
}

/** The file a picture of the session is written to: its number, its view and its look (none for the lit one). */
export function pictureName(number, view, look) {
  const shown = look && look !== 'lit' ? `-${look}` : '';
  return `${String(number).padStart(3, '0')}-${view}${shown}.png`;
}
