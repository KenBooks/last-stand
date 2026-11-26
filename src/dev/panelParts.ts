// The frame's parts the developer panel takes out and times (panel.ts's checkboxes): a short list of what's in the
// scene and what the frame does with it, each a checkbox. The profiler's own list (`perf/sceneParts.ts`, the pause
// menu's Profile this spot) holds every switch of the engine's, its old ways against its new among them, some 35
// parts; shown here whole it was too many to reason about (from the owner: "its hard to reason about it if its 50
// categories... most of them probably 0ms anyway"). Here each checkbox is one or more of the profiler's parts at once
// (the sun's and the lamps' shadows are Shadows), or a mark of the panel's own (`marked.ts`: Trees, Leaves, Grass).
import { frameParts, type ScenePart } from '../perf/sceneParts';
import { setMarkedShown, type Mark } from './marked';

/** A part's name without the count it's given (`the particles (3)`), which changes as the scene does. */
export const partKey = (name: string): string => name.replace(/ \(\d+\)$/, '');

/** A checkbox of the panel: its key (the profiler's part's name where it's one, kept so `join set part:<key>` and the
 *  lab name it as before), its label, and the profiler's parts it takes out together, or the mark it hides. */
interface PanelPart { key: string; label: string; parts?: string[]; mark?: Mark }

/** the panel's parts, in its order (two to a row) */
const PANEL_PARTS: PanelPart[] = [
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

/** One checkbox's part: its profiler's parts changed together, each put back as it found it (`restore`). */
function joined(key: string, parts: ScenePart[]): ScenePart {
  return {
    name: key,
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
export function panelParts(): ScenePart[] {
  const found = new Map(frameParts().map((part) => [partKey(part.name), part]));
  const parts: ScenePart[] = [];
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
