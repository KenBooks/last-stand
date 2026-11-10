// `lab ui`'s `perfParty`: the run's party frames (a co-op run's, two partners' frames made with the game's own markup,
// ui/coop.ts `tagFor`) with the mini performance overlay shown, as a player with it on meets them (#492: it lay over a
// partner's frame, both in the top left corner). The overlay must stand clear of every frame and within the window.
// Its canary pins the overlays back to the corner, which must be caught.
import type { Lab } from './lab';
import * as perfHud from '../../../src/ui/perfHud';

/** What the state found besides its boxes: lines for its report, and its problems. */
export interface PerfPartyFound {
  lines: string[];
  problems: string[];
}

/** the problem the canary must raise */
export const PERF_PARTY_CANARY = { name: 'over a partner', what: 'the overlays pinned to the corner, over the frames' };
/** frames run for the overlay to draw (it draws every 250 ms) and the overlays to move clear */
const DRAW_FRAMES = 40;
/** the partners' frames made, as a party of three's */
const PARTNERS = ['Partner · partner · Warrior', 'Second · partner · Mage'];

const party = (): HTMLElement => document.querySelector<HTMLElement>('#party')!;
const overlay = (): HTMLElement => document.querySelector<HTMLElement>('#perf')!;
const diag = (): HTMLElement => document.querySelector<HTMLElement>('#diag')!;

/** Two partners' frames in the party's corner, the mini overlay shown (with the canary, the overlays pinned there). */
export async function openPerfParty(lab: Lab, canary: boolean): Promise<void> {
  for (const name of PARTNERS) {
    const frame = document.createElement('div');
    frame.className = 'pf lab-party';
    frame.innerHTML = `<div class="pf-name">${name}</div><div class="pf-bar"><div class="pf-fill" style="width:70%"></div></div><div class="pf-state"></div>`;
    party().appendChild(frame);
  }
  perfHud.setPerfHudSize('mini', false);
  if (canary) diag().style.setProperty('translate', '0px 0px', 'important');
  await lab.step(DRAW_FRAMES);
}

export function closePerfParty(): void {
  for (const frame of party().querySelectorAll('.lab-party')) frame.remove();
  perfHud.setPerfHudSize('off', false);
  diag().style.removeProperty('translate');
}

/** The overlay against the party's frames: clear of each, within the window. */
export function perfPartyChecked(): PerfPartyFound {
  const problems: string[] = [];
  const panel = overlay().getBoundingClientRect();
  const frames = [...party().querySelectorAll<HTMLElement>('.pf')].filter((frame) => frame.checkVisibility());
  if (frames.length < PARTNERS.length) problems.push(`perfParty: ${frames.length} party frames shown, not ${PARTNERS.length}`);
  if (!overlay().checkVisibility()) problems.push('perfParty: the overlay isn\'t shown');
  let gap = Infinity;
  for (const frame of frames) {
    const box = frame.getBoundingClientRect();
    const apart = Math.max(box.left - panel.right, panel.left - box.right, box.top - panel.bottom, panel.top - box.bottom);
    gap = Math.min(gap, apart);
    if (apart < 0) problems.push(`perfParty: the overlay lies over a partner's frame (${Math.round(-apart)} px into it)`);
  }
  const outside = panel.left < 0 || panel.top < 0 || panel.right > innerWidth || panel.bottom > innerHeight;
  if (outside) problems.push('perfParty: the overlay reaches past the window');
  const at = `${Math.round(panel.left)}, ${Math.round(panel.top)}`;
  return { lines: [`  the overlay at ${at}, ${Math.round(gap)} px from the nearest party frame`], problems };
}
