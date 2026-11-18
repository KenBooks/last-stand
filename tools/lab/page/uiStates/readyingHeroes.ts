// `lab ui`'s `readyingHeroes` state (`../uiKit.ts` `Steps`): Change hero clicked with the heroes' programs cold: the
// bar says it readies the heroes.
import * as warm from '../../../../src/game/warm';
import * as readying from '../../../../src/ui/readying';
import type { Need } from '../../../../src/game/warm';
import type { Lab } from '../lab';
import { askForHeroes } from '../uiHeroes';
import { barPlaced, linesOf, readyingBar } from '../uiReadying';
import { plantsCaught } from '../uiKit';
import type { Found, Steps } from '../uiKit';

/** the canary's plant: the page's own text put back on the bar */
const FIGHT_SAID = { name: 'the loading bar says', what: '"Readying the fight" for Change hero' };

/** The lab's way to keep a need cold (game/warm.ts `chill`), or undefined in a tree from before it. */
const chillOf = (): ((need: Need) => void) | undefined => (warm as { chill?: (need: Need) => void }).chill;

/** Every label the fight's loading bar can show (ui/readying.ts `readyingLabels`), none in a tree from before it. */
const labelsOf = (): string[] => (readying as { readyingLabels?: () => string[] }).readyingLabels?.() ?? [];

/** Each label the bar can show laid out in its `label` on this screen: those that run onto more than one line. */
function labelsWrapped(label: HTMLElement): { text: string; rows: number }[] {
  const said = label.textContent;
  const laidOut = labelsOf().map((text) => {
    label.textContent = text;
    return { text, rows: linesOf(label) };
  });
  label.textContent = said;
  return laidOut.filter(({ rows }) => rows !== 1);
}

/** whether `readyingHeroes` asked for the hero selection screen with the heroes kept cold, while it waits */
let askedCold = false;

/**
 * The lobby's Change hero clicked with the mouse while the heroes' programs are cold (`chill`: the lab's boot warms
 * every need at once), as a first visit's lobby waits for them: under the fight's loading bar, which says what it
 * readies. No frame runs, here or as it closes: the states after it are pictured at the moment they'd be without it
 * (three frames moved the lobby's opening zoom, and every label after it with it).
 */
async function openReadyingHeroes(lab: Lab): Promise<void> {
  const chill = chillOf();
  if (!chill || !document.getElementById('heroes')) return;
  chill('heroes');
  askedCold = true;
  await askForHeroes(lab);
}

/**
 * The heroes warm again, so the screen asked for opens, and it's closed at once as Back closes it: the lobby's hero
 * is never rebuilt (rebuilt twice, he stood in another phase of his idle in every picture after it).
 */
async function closeReadyingHeroes(): Promise<void> {
  if (!askedCold) return;
  askedCold = false;
  warm.markWarm('heroes');
  // (the press goes ahead as its wait resolves)
  await new Promise((resolve) => setTimeout(resolve));
  document.querySelector<HTMLElement>('#heroes .hs-back')?.click();
}

/**
 * The fight's loading bar shown for the hero selection screen asked for (`openReadyingHeroes`), within the window,
 * its label on one line, saying it readies the heroes (a class pick once said "Readying the fight", the page's own
 * text, whatever was waiting). `canary`: that text put back, which must be found.
 */
function readyingHeroesShown(canary: boolean): Found {
  const bar = readyingBar();
  if (!bar || !askedCold) {
    return { lines: ['  no way to keep the heroes cold for a hero selection screen in this tree'], problems: [] };
  }
  const label = bar.querySelector<HTMLElement>('.rd-sub')!;
  const said = label.textContent ?? '';
  if (canary) label.textContent = 'Readying the fight';
  const text = label.textContent?.trim() ?? '';
  const placed = barPlaced(bar, label, 'readyingHeroes');
  label.textContent = said;
  const shown = bar.classList.contains('on');
  const rows = `${placed.rows} line${placed.rows === 1 ? '' : 's'}`;
  const wrapped = labelsWrapped(label);
  const lines = [
    `  Change hero clicked, the heroes cold: the fight's loading bar ${shown ? 'shown' : 'not shown'}, `
      + `saying "${text}" on ${rows}`,
    `  every label it can show (${labelsOf().length}) on one line: ${wrapped.length ? 'no' : 'yes'}`,
  ];
  const problems = [...placed.problems];
  for (const { text: wraps, rows: on } of wrapped) problems.push(`readyingHeroes: "${wraps}" runs onto ${on} lines`);
  if (!shown) problems.push('readyingHeroes: Change hero clicked with the heroes cold showed no loading bar');
  if (!text.includes('heroes')) problems.push(`readyingHeroes: Change hero clicked, the loading bar says "${text}"`);
  return { lines, problems };
}

/** The canary's text looked for, where the tree has the bar and a way to keep the heroes cold. */
function readyingHeroesCanary(found: Found, state: string): Found {
  if (!readyingBar() || !chillOf()) return { lines: [], problems: [] };
  return plantsCaught(found, state, [FIGHT_SAID]);
}

const STATE: Steps = {
  order: 80,
  open: openReadyingHeroes,
  close: closeReadyingHeroes,
  check: readyingHeroesShown,
  canary: readyingHeroesCanary,
};
export default STATE;
