// The frame's parts the developer panel takes out and times (panel.ts's checkboxes): a short list of what's in the
// scene and what the frame does with it, each a checkbox. The profiler's own list (`perf/sceneParts.ts`, the pause
// menu's Profile this spot) holds every switch of the engine's, its old ways against its new among them, some 35
// parts; shown here whole it was too many to reason about (from the owner: "its hard to reason about it if its 50
// categories... most of them probably 0ms anyway"). Here each checkbox is one or more of the profiler's parts at once
// (the sun's and the lamps' shadows are Shadows), or a mark of the panel's own (`marked.ts`: Trees, Leaves, Grass).
import { frameParts, type ScenePart } from '../perf/sceneParts';
import { costKnown } from '../perf/profileReport';
import type { PartCost } from '../perf/profiler';
import { setMarkedShown, type Mark } from './marked';

/** A part's name without the count it's given (`the particles (3)`), which changes as the scene does. */
export const partKey = (name: string): string => name.replace(/ \(\d+\)$/, '');

/** A checkbox of the panel: its key (the profiler's part's name where it's one, kept so `join set part:<key>` and the
 *  lab name it as before), its label, and the profiler's parts it takes out together, or the mark it hides. */
interface Checkbox { key: string; label: string; parts?: string[]; mark?: Mark }

/** the panel's parts, in its order (two to a row) */
const PANEL_PARTS: Checkbox[] = [
  { key: 'half the scene\'s pixels', label: 'Full resolution', parts: ['half the scene\'s pixels'] },
  { key: 'the point lights and the lamps', label: 'Point lights', parts: ['the point lights and the lamps'] },
  {
    key: 'the shadows', label: 'Shadows',
    parts: ['the sun\'s shadow: its map drawn and read', 'the lamps\' shadows read'],
  },
  { key: 'the bloom\'s passes', label: 'Bloom', parts: ['the bloom\'s passes'] },
  { key: 'the particles', label: 'Particles', parts: ['the particles'] },
  { key: 'the hero', label: 'Hero', parts: ['the hero'] },
  { key: 'the trees', label: 'Trees', mark: 'tree' },
  { key: 'the leaves', label: 'Leaves', mark: 'leaves' },
  { key: 'the grass', label: 'Grass', mark: 'grass' },
  {
    key: 'what\'s blended: smoke, glows, effects', label: 'Smoke & effects',
    parts: ['what\'s blended: smoke, glows, effects'],
  },
  { key: 'the fires\' flames', label: 'Fire', parts: ['the fires\' flames'] },
  { key: 'the spent arrows', label: 'Arrows on ground', parts: ['the spent arrows'] },
];

/** The mark of the part `key`, if it's one of the panel's own (held through a biome change: panel.ts). */
export const markOf = (key: string): Mark | undefined => PANEL_PARTS.find((part) => part.key === key)?.mark;

/** The label of the part `key`. */
export const partLabel = (key: string): string => PANEL_PARTS.find((part) => part.key === key)?.label ?? key;

/** A checkbox's part, and whether there's nothing of it in the scene here (its profiler's parts each hide none: the
 *  spent arrows with no arrow down), which the panel doesn't time: timed, nothing read 0.4 ms of a 1.2 ms frame. */
export interface PanelPart extends ScenePart { empty?: boolean }

/** A profiler's part holds no object (`the spent arrows (0)`: `shownPart` counts what it shows and hides). */
const holdsNone = (part: ScenePart): boolean => / \(0\)$/.test(part.name);

/** One checkbox's part: its profiler's parts changed together, each put back as it found it (`restore`). */
function joined(key: string, parts: ScenePart[]): PanelPart {
  return {
    name: key,
    empty: parts.every(holdsNone),
    change: (on) => {
      for (const part of parts) part.change(on);
    },
    restore: () => {
      for (const part of parts) (part.restore ?? (() => part.change(true)))();
    },
  };
}

/** The parts the panel takes out and times, in its order, as the scene stands now: a checkbox whose parts the
 *  profiler can't time here (`untimed`) or doesn't have is left out. */
export function panelParts(): PanelPart[] {
  const found = new Map(frameParts().map((part) => [partKey(part.name), part]));
  const parts: PanelPart[] = [];
  for (const { key, parts: names, mark } of PANEL_PARTS) {
    if (mark) {
      parts.push({ name: key, change: (on) => setMarkedShown(mark, on) });
      continue;
    }
    const own = (names ?? []).map((name) => found.get(name));
    if (own.some((part) => !part || part.untimed)) continue;
    parts.push(joined(key, own as ScenePart[]));
  }
  return parts;
}

/** A part's time as the panel shows it beside its checkbox: what it takes (ms), or `≈0` where its rounds can't tell
 *  it apart from nothing (under twice its `±`, `costKnown`), and in full in its title. On an idle desktop GPU the
 *  frame's own time wanders from round to round, and a part that draws nothing read 0.4 ms with nothing said of it. */
export function shownCost(cost: PartCost): { text: string; title: string; faint: boolean } {
  const takes = cost.on - cost.off;
  const known = cost.error === undefined ? '' : ` ±${cost.error.toFixed(1)}`;
  const frames = `the frame ${cost.on.toFixed(2)} ms with it, ${cost.off.toFixed(2)} without`;
  const title = `${takes.toFixed(2)}${known} ms: ${frames}`;
  if (costKnown(cost) && takes > 0) return { text: `${takes.toFixed(1)} ms`, title, faint: false };
  // (a part of the panel's is a thing drawn, never another way of drawing: one that reads the frame faster with it
  // than without, past its ±, read the GPU's wander: Fire's -0.4 ms on 3 rounds)
  const why = takes > 0 ? 'not told apart from nothing' : 'the frame no slower with it';
  return { text: '≈0', title: `${title}, ${why}`, faint: true };
}
