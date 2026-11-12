// The pause menu's Beta tab and the notice a beta shows as the game opens: the features a player opts into
// (`core/beta.ts`). The village lobby is the one there is: switched on the tab, taken up by a reload (the page loaded
// again with `?village=1`, kept in a cookie from then on), and while it's on a notice at the top says so and offers the
// lobby as it was.
import { VILLAGE, reloadWithVillage } from '../core/beta';
import { sfx } from '../core/audio';

/** how long the notice stays unless it's closed or pointed at (ms) */
const NOTICE_MS = 20000;

const $ = <T extends HTMLElement = HTMLElement>(s: string): T => document.querySelector<T>(s)!;

/** the village as the tab has it switched: taken up by Reload */
let wanted = VILLAGE;
let noticeTimer: ReturnType<typeof setTimeout> | undefined;

/** The tab's switch and its reload shown as they stand: Reload offered once the switch differs from the page's. */
export function renderBetaOptions(): void {
  document.querySelectorAll<HTMLElement>('#opt-village button').forEach((b) => {
    b.classList.toggle('active', (b.dataset.v === 'on') === wanted);
  });
  const changed = wanted !== VILLAGE;
  $('#beta-apply').classList.toggle('hidden', !changed);
  $('#beta-apply span').textContent = wanted ? 'Reload to open the village' : 'Reload to go back to the old lobby';
  $('#beta-state').textContent = VILLAGE ? 'On now' : 'Off now';
}

/** The Beta tab's controls and the notice's buttons bound. */
export function initBeta(): void {
  document.querySelectorAll<HTMLElement>('#opt-village button').forEach((b) => {
    b.onclick = () => {
      sfx.click();
      wanted = b.dataset.v === 'on';
      renderBetaOptions();
    };
  });
  $('#btn-beta-reload').onclick = () => reloadWithVillage(wanted);
  $('#btn-beta-back').onclick = () => reloadWithVillage(false);
  $('#btn-beta-close').onclick = () => {
    sfx.click();
    hideBetaNotice();
  };
  // (read or reached for, it stays)
  $('#beta-notice').addEventListener('pointerenter', () => clearTimeout(noticeTimer));
  renderBetaOptions();
}

/** The notice shown as the game opens with a beta on: what it is, and the way back. Gone after a while by itself. */
export function showBetaNotice(): void {
  if (!VILLAGE) return;
  $('#beta-notice').classList.remove('hidden');
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(hideBetaNotice, NOTICE_MS);
}

/** The notice put away (closed, timed out, a run begun). */
export function hideBetaNotice(): void {
  clearTimeout(noticeTimer);
  $('#beta-notice').classList.add('hidden');
}
