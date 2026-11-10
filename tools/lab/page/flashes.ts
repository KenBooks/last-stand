// The flashes in a run of frames (tools/lab `cast`), as WCAG 2 counts a general flash: a pair of opposing changes
// of at least a tenth of white in an area's relative luminance, the darker of the two under 0.8 of white. Counted
// for each cell of the frame's grid (page/screenCells.ts: a sixteenth of the frame each), and judged by the most in
// any one second: three or more is a hazard (AGENTS.md: nothing large flashes faster than about 1.5 times a second).

/** the change in an area's light (a share of white) that counts as one of a flash's two */
const CHANGE = 0.1;
/** a change counts only where its darker end is under this */
const DARK_UNDER = 0.8;

/** A change in an area's light that counts as one of a flash's two: the frame it was reached at and its way. */
export interface FlashChange {
  frame: number;
  rising: boolean;
}

/** The most flashes a cell had in any one second, when that second started (s, from the first frame), and the
 *  changes counted in it. */
export interface FlashCount {
  cell: number;
  most: number;
  at: number;
  changes: FlashChange[];
}

/** A counted change with the frame it came from: the area's darkest frame before a rise, its brightest before a
 *  fall, since the change before it. */
export interface ChangeSpan {
  from: number;
  to: number;
  rising: boolean;
}

/** how far back a run's first change is looked for its start (frames) */
const FIRST_BACK = 30;

/** Each of `changes` with the frame it came from (`lights`: the area's light frame by frame). */
export function changeSpans(changes: FlashChange[], lights: number[]): ChangeSpan[] {
  return changes.map(({ frame, rising }, index) => {
    const since = index ? changes[index - 1].frame : Math.max(0, frame - FIRST_BACK);
    let from = since;
    for (let f = since; f < frame; f++) {
      const further = rising ? lights[f] < lights[from] : lights[f] > lights[from];
      if (further) from = f;
    }
    return { from, to: frame, rising };
  });
}

/** Where an area's light (each frame a share of white) changed by `CHANGE` against the way it last went. */
function changesOf(lights: number[]): FlashChange[] {
  const changes: FlashChange[] = [];
  // (the darkest and brightest it was since the last change: a rise is from the one, a fall from the other)
  let low = lights[0];
  let high = lights[0];
  let rising: boolean | null = null;
  for (let frame = 1; frame < lights.length; frame++) {
    const light = lights[frame];
    low = Math.min(low, light);
    high = Math.max(high, light);
    const rose = light - low >= CHANGE && low < DARK_UNDER;
    const fell = high - light >= CHANGE && light < DARK_UNDER;
    const risen: boolean = rose && rising !== true;
    const fallen: boolean = fell && rising !== false;
    if (!risen && !fallen) continue;
    changes.push({ frame, rising: risen });
    rising = risen;
    low = light;
    high = light;
  }
  return changes;
}

/** The most flashes (pairs of changes) within any `perSecond` frames of `changes`, and the changes counted. */
function mostInASecond(changes: FlashChange[], perSecond: number): { most: number; counted: FlashChange[] } {
  let most = 0;
  let counted: FlashChange[] = [];
  let first = 0;
  for (let last = 0; last < changes.length; last++) {
    while (changes[last].frame - changes[first].frame >= perSecond) first++;
    const flashes = Math.floor((last - first + 1) / 2);
    if (flashes > most) {
      most = flashes;
      counted = changes.slice(first, last + 1);
    }
  }
  return { most, counted };
}

/**
 * The cell with the most flashes in any one second, of `cellLights` (a frame's cells' lights, frame by frame), the
 * frames `frameTime` s apart.
 */
export function worstFlashing(cellLights: number[][], frameTime: number): FlashCount {
  const perSecond = Math.round(1 / frameTime);
  const cells = cellLights[0]?.length ?? 0;
  let worst: FlashCount = { cell: 0, most: 0, at: 0, changes: [] };
  for (let cell = 0; cell < cells; cell++) {
    const lights = cellLights.map((frame) => frame[cell]);
    const { most, counted } = mostInASecond(changesOf(lights), perSecond);
    if (most > worst.most) worst = { cell, most, at: counted[0].frame * frameTime, changes: counted };
  }
  return worst;
}
