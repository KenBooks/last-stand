// The light budget `cast` holds an effect's frames to (tools/lab `cast`): the measures of a frame's light (its mean,
// its brightest sixteenth, its bright share: page/screenCells.ts), the most each may be, and the frames' worst on
// each.
import { cellName, type FrameCells } from './screenCells';

/** the budget for a frame's light (page/screenCells.ts), from the owner's screenshots of effects that read well: how
 *  far an effect may raise the frame's mean over the scene's own, and its brightest cell's mean (as stored, 0 to 255)
 *  and the share of it that's bright, at most. (The screenshots' mean of 75 was over crypt scenes of 20 to 25: the
 *  forest's daylight is 55 to 77 with nothing cast, where 75 left an effect no room at all.) */
const MEAN_RISE_MOST = 50;
const CELL_MOST = 150;
const BRIGHT_MOST = 0.05;

export const seconds = (at: number): string => `${at.toFixed(2)} s`;
export const percent = (share: number): string => `${(share * 100).toFixed(1)}%`;
export const whole = (value: number): string => value.toFixed(0);
const brightestCell = (frame: FrameCells): number => Math.max(...frame.cellMeans);
const brightestIndex = (frame: FrameCells): number => frame.cellMeans.indexOf(brightestCell(frame));

/** One of the budget's measures of a frame's light: its name, a frame's on it and that as words, and its most. */
export interface Measure {
  name: string;
  /** the most an effect's frame may be, after a scene that was `before` */
  most: (before: FrameCells) => number;
  /** whether the scene itself may be past it: no measure is judged on a scene already past its most */
  absolute: boolean;
  of: (frame: FrameCells) => number;
  shown: (value: number) => string;
  /** where in the frame it was, as words (the cell's place), for one that's of a part of it */
  where?: (frame: FrameCells) => string;
  /** a frame's value at the place `worst` was worst (its brightest cell), for one that's of a part of it */
  readAt?: (worst: FrameCells) => (frame: FrameCells) => number;
}

export const MEASURES: Measure[] = [
  {
    name: 'the frame\'s mean',
    most: (before) => before.mean + MEAN_RISE_MOST,
    absolute: false,
    of: (frame) => frame.mean,
    shown: whole,
  },
  {
    name: 'its brightest sixteenth',
    most: () => CELL_MOST,
    absolute: true,
    of: brightestCell,
    shown: whole,
    where: (frame) => cellName(brightestIndex(frame)),
    readAt: (worst) => {
      const cell = brightestIndex(worst);
      return (frame) => frame.cellMeans[cell];
    },
  },
  {
    name: 'its bright share',
    most: () => BRIGHT_MOST,
    absolute: true,
    of: (frame) => frame.brightShare,
    shown: percent,
  },
];

/** the measure of a part of the frame, its brightest sixteenth: the canary's plant is looked for on it */
export const BRIGHTEST_SIXTEENTH = MEASURES[1];

/** The frame of `frames` that's worst on `measure`, its value, which of them it was and when (s from the press). */
export interface WorstFrame {
  frame: FrameCells;
  value: number;
  index: number;
  at: number;
}

/** The worst of `frames` on `measure`, the frames `frameTime` s apart. */
export function worstOn(measure: Measure, frames: FrameCells[], frameTime: number): WorstFrame {
  let worst: WorstFrame = { frame: frames[0], value: measure.of(frames[0]), index: 0, at: 0 };
  frames.forEach((frame, index) => {
    const value = measure.of(frame);
    if (value > worst.value) worst = { frame, value, index, at: index * frameTime };
  });
  return worst;
}

/** Each measure's worst of `frames` as words. */
export function worstLine(frames: FrameCells[], frameTime: number): string {
  const parts = MEASURES.map((measure) => {
    const worst = worstOn(measure, frames, frameTime);
    return `${measure.name} ${measure.shown(worst.value)} at ${seconds(worst.at)}`;
  });
  return `  its worst: ${parts.join(', ')}`;
}

/** A measure the frames went past the budget on, and their worst on it. */
export interface Failed {
  measure: Measure;
  worst: WorstFrame;
}

/** What the frames came to against the budget: the problems, the measures failed, and notes on what wasn't judged. */
export interface Judged {
  problems: string[];
  failed: Failed[];
  notes: string[];
}

/**
 * What the effect took past the budget: a problem for each measure the scene before it was within, and a note for
 * each of the absolute ones it was already past, which isn't judged.
 */
export function budgetJudged(frames: FrameCells[], frameTime: number, before: FrameCells): Judged {
  const problems: string[] = [];
  const failed: Failed[] = [];
  const notes: string[] = [];
  for (const measure of MEASURES) {
    const scene = measure.of(before);
    const most = measure.most(before);
    if (measure.absolute && scene > most) {
      notes.push(`  (the scene alone is past the budget on ${measure.name}, ${measure.shown(scene)}: not judged)`);
      continue;
    }
    const worst = worstOn(measure, frames, frameTime);
    if (worst.value <= most) continue;
    failed.push({ measure, worst });
    const where = measure.where ? `, ${measure.where(worst.frame)}` : '';
    problems.push(`${measure.name} at ${measure.shown(worst.value)} at ${seconds(worst.at)}${where} `
      + `(at most ${measure.shown(most)})`);
  }
  return { problems, failed, notes };
}

/** A frame's light as a line: its mean, its brightest sixteenth and its bright share. */
export function lightLine(frame: FrameCells): string {
  const cell = Math.max(...frame.cellMeans);
  return `mean ${frame.mean.toFixed(0)}, brightest sixteenth ${cell.toFixed(0)}, bright ${percent(frame.brightShare)}`;
}
