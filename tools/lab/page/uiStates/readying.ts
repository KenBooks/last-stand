// `lab ui`'s `readying` state (`../uiKit.ts` `Steps`): the fight's loading bar over the lobby.
import { readyingBar, barPlaced } from '../uiReadying';
import { plantsCaught, share } from '../uiKit';
import type { Found, Steps } from '../uiKit';

/** how far along the fight's loading bar is pictured, a share of its length */
const READYING_SHARE = 0.4;
/** how far the bar's fill may be off that, a share of its length */
const READYING_SLACK = 0.02;
/** the canary's plant: the label given the width of a letter, so it wraps */
const LETTER_WIDE = { name: 'runs onto', what: 'the label a letter wide' };

/**
 * The fight's loading bar over the lobby, as `ui/readying.ts` paints it while a press waits for the fight's programs
 * (the lab's boot warms them at once, so it never shows by itself), `READYING_SHARE` along.
 */
function openReadying(): void {
  const bar = readyingBar();
  if (!bar) return;
  bar.classList.add('on');
  bar.style.setProperty('--p', String(READYING_SHARE));
}

function closeReadying(): void {
  const bar = readyingBar();
  bar?.classList.remove('on');
  bar?.style.removeProperty('--p');
}

/**
 * The fight's loading bar within the window, its label on one line and its fill as far along as painted.
 * `canary`: the label given the width of a letter, so it wraps, which must be found.
 */
function readyingShown(canary: boolean): Found {
  const bar = readyingBar();
  if (!bar) return { lines: ['  no fight\'s loading bar in this tree'], problems: [] };
  const label = bar.querySelector<HTMLElement>('.rd-sub')!;
  if (canary) label.style.width = '1ch';
  const placed = barPlaced(bar, label, 'readying');
  const track = bar.querySelector('.rd-bar')!.getBoundingClientRect();
  const fill = bar.querySelector('.rd-fill')!.getBoundingClientRect();
  label.style.width = '';
  const along = track.width > 0 ? fill.width / track.width : 0;
  const rows = `${placed.rows} line${placed.rows === 1 ? '' : 's'}`;
  const lines = [`  the fight's loading bar: its label on ${rows}, ${share(along, 1)}% along`];
  const problems = [...placed.problems];
  if (Math.abs(along - READYING_SHARE) > READYING_SLACK) {
    problems.push(`readying: its fill is ${share(along, 1)}% along, painted ${share(READYING_SHARE, 1)}%`);
  }
  return { lines, problems };
}

/** The canary's label looked for, where the tree has the bar. */
function readyingCanary(found: Found, state: string): Found {
  if (!readyingBar()) return { lines: [], problems: [] };
  return plantsCaught(found, state, [LETTER_WIDE]);
}

const STATE: Steps = {
  order: 70,
  open: openReadying,
  close: closeReadying,
  check: readyingShown,
  canary: readyingCanary,
};
export default STATE;
