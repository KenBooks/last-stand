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
/** the notice up, and the notice still owed: the game opened under a screen, which it waits out */
let noticeUp = false;
let noticeOwed = false;

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
  noticeOwed = false;
  noticeUp = true;
  $('#beta-notice').classList.remove('hidden');
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(hideBetaNotice, NOTICE_MS);
}

/** The notice owed as the game opens: shown by `betaNoticeWhile` once the village stands clear. */
export function oweBetaNotice(): void {
  noticeOwed = VILLAGE;
}

/** Called as the game opens and each frame after, `clear` while the village is up with no screen over it: the
 *  notice owed is shown once it's clear (a first visit opens on the hero selection screen, an invite on its dialog),
 *  and one shown is put away for good by the first screen opened over it (the hall of heroes, the inventory, a
 *  card, the pause menu), as a run puts it away. */
export function betaNoticeWhile(clear: boolean): void {
  if (noticeOwed && clear) showBetaNotice();
  else if (noticeUp && !clear) hideBetaNotice();
}

/** The notice put away (closed, timed out, a screen opened over the village, a run begun). */
export function hideBetaNotice(): void {
  noticeOwed = false;
  noticeUp = false;
  clearTimeout(noticeTimer);
  $('#beta-notice').classList.add('hidden');
}
