// What took a frame past the light budget, as `cast` says it (page/budgetSources.ts reads it): the things whose
// taking out lowered a measure most, and the line it makes. Pure, so it's tested as it is (test/budgetLines.test.mjs).
import type { FrameCells } from './screenCells';

/** A budget's measure as the breakdown reads it: its name, a frame's value on it, and that as words. */
export interface BudgetRead {
  name: string;
  read: (frame: FrameCells) => number;
  shown: (value: number) => string;
}

/** A thing taken out and the measure without it. */
export interface Without {
  name: string;
  value: number;
}

/** The measure on the frame whole, without each thing, and without the cast's own things together. */
export interface Breakdown {
  whole: number;
  without: Without[];
  /** the measure without everything the cast brought into the scene, and how many things that was */
  castsOwn: { value: number; count: number };
}

/** the things listed for a breakdown, at most */
const LISTED_MOST = 5;

/** A thing's name without the count of its things (a crowd's "(4)"), which a foe's death changes: the key it's known
 *  by from before the press to the frame read. */
export function keyOf(name: string): string {
  return name.replace(/ \(\d+\)$/, '');
}

/** A change of the measure as words, in its own terms: `-23` where taking a thing out lowered it by 23. */
function drop(measure: BudgetRead, whole: number, value: number): string {
  const sign = value <= whole ? '-' : '+';
  return `${sign}${measure.shown(Math.abs(whole - value))}`;
}

/** The things whose taking out lowered the measure, the most first, at most `LISTED_MOST` of them. */
export function mostLowering(breakdown: Breakdown): Without[] {
  return breakdown.without
    .filter((thing) => thing.value < breakdown.whole)
    .sort((a, b) => a.value - b.value)
    .slice(0, LISTED_MOST);
}

/** A breakdown as a line: the measure whole, what it reads without each thing that lowered it most, without the
 *  cast's own things together, and before the press. */
export function breakdownLine(measure: BudgetRead, breakdown: Breakdown, before: number): string {
  const { whole, castsOwn } = breakdown;
  const things = mostLowering(breakdown)
    .map((thing) => `${thing.name} ${measure.shown(thing.value)} (${drop(measure, whole, thing.value)})`);
  const own = `the cast's ${castsOwn.count} things together ${measure.shown(castsOwn.value)} `
    + `(${drop(measure, whole, castsOwn.value)})`;
  const listed = things.length ? things.join('; ') : 'no one thing lowers it';
  return `      ${measure.name} ${measure.shown(whole)}; without ${listed}; without ${own}; `
    + `before the press ${measure.shown(before)}`;
}
