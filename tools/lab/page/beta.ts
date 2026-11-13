// `lab beta`'s side of a page (tools/lab/node/beta.mjs): what a game says of the village beta as it stands (the lobby
// the page loaded with, the choice its cookie keeps, the pause menu's Beta tab, the notice shown as the game opens),
// where its controls are for the mouse, and its co-op dialog once a room in the other lobby refused it (the switch
// offered there). Its clicks are the browser's own, sent by the Node side: each loads the page again, which a call
// into the page wouldn't outlive.
import { VILLAGE } from '../../../src/core/beta';
import { readCookie } from '../../../src/core/cookies';
import { openPanels, pauseTab, showPause } from '../../../src/ui/menus';
import { openCoop, renderCoop } from '../../../src/ui/coop';
import { session } from '../../../src/net/session';
import { pauseShown } from './uiPause';
import type { Lab } from './lab';

/** the cookie the choice is kept in (src/core/beta.ts) */
const VILLAGE_COOKIE = 'last-stand-beta-village';

/** A point of the page, css px. */
export interface PagePoint { x: number; y: number }

/** What a page says of the beta. */
export interface BetaState {
  /** the lobby the page loaded with, as its own script settled it, and as the game reads it */
  lobby: string;
  village: boolean;
  /** the choice kept ('1', '0', or none) */
  cookie: string | null;
  /** the address's query as it stands */
  query: string;
  /** the notice: shown, and with it what's wrong with it (past the window, a button nothing reaches) */
  notice: boolean;
  noticeProblems: string[];
}

/** The Beta tab as it stands. */
export interface BetaTab {
  /** what it says the village is now, and which way its switch stands ('on', 'off') */
  says: string;
  switched: string;
  /** Reload offered, and its words */
  offered: boolean;
  offer: string;
  /** what's wrong with the menu on this tab (`uiPause.ts`: scrolling, past the window, another tab shown) */
  problems: string[];
}

const element = (selector: string): HTMLElement | null => document.querySelector<HTMLElement>(selector);

/** `selector`'s middle if a mouse there finds it (shown, inside the window, nothing over it), else null. */
export function betaPoint(_lab: Lab | undefined, { selector }: { selector: string }): PagePoint | null {
  const found = element(selector);
  if (!found?.checkVisibility()) return null;
  const box = found.getBoundingClientRect();
  const middle = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  const hit = document.elementFromPoint(middle.x, middle.y);
  return hit && found.contains(hit) ? middle : null;
}

/** What's wrong with the notice as shown: past the window, or a button of its a mouse can't find. */
function noticeProblems(notice: HTMLElement): string[] {
  const problems: string[] = [];
  const box = notice.getBoundingClientRect();
  const past = box.left < 0 || box.top < 0 || box.right > innerWidth || box.bottom > innerHeight;
  if (past || box.width === 0) problems.push('the notice reaches past the window');
  for (const [selector, name] of [['#btn-beta-back', 'Back to the old lobby'], ['#btn-beta-close', 'Close']]) {
    if (!betaPoint(undefined, { selector })) problems.push(`the notice's ${name} isn't found by the mouse`);
  }
  return problems;
}

/** The beta as this page has it. */
export function betaState(): BetaState {
  const notice = element('#beta-notice');
  const shown = Boolean(notice) && !notice!.classList.contains('hidden');
  return {
    lobby: document.documentElement.dataset.lobby ?? '',
    village: VILLAGE,
    cookie: readCookie(VILLAGE_COOKIE) ?? null,
    query: location.search,
    notice: shown,
    noticeProblems: shown ? noticeProblems(notice!) : [],
  };
}

/** The pause menu opened on its Beta tab, and the tab as it stands (after a click on its switch too). */
export function betaTab(): BetaTab {
  showPause(true);
  pauseTab('beta');
  const active = element('#opt-village button.active');
  const apply = element('#beta-apply');
  return {
    says: element('#beta-state')?.textContent ?? '',
    switched: active?.dataset.v ?? '',
    offered: Boolean(apply) && !apply!.classList.contains('hidden'),
    offer: element('#beta-apply span')?.textContent ?? '',
    problems: pauseShown('beta').problems,
  };
}

/** The notice through frames of the village alone, then through frames with a screen opened over it. */
export interface BetaScreenOver {
  /** shown still after the frames with nothing over the village */
  alone: boolean;
  /** shown still after the frames with the inventory open */
  under: boolean;
}

/** how many frames each is given */
const SCREEN_FRAMES = 3;

/** The village's frames run with nothing over it, then with the inventory opened (and put away again): the notice
 *  must outlast the first and go with the second, as with any screen over the village (`villageClear`, main.ts). */
export async function betaScreenOver(lab: Lab): Promise<BetaScreenOver> {
  const shown = (): boolean => !element('#beta-notice')!.classList.contains('hidden');
  await lab.step(SCREEN_FRAMES);
  const alone = shown();
  openPanels('inventory');
  await lab.step(SCREEN_FRAMES);
  const under = shown();
  openPanels(null);
  return { alone, under };
}

/** The canary's: the notice put away before it's read, which must be found missing. */
export function betaHideNotice(): void {
  element('#beta-notice')?.classList.add('hidden');
}

/** The canary's: the choice's cookie lost, as a browser that kept none: the next visit must be found in the lobby
 *  without the village. */
export function betaLoseCookie(): void {
  document.cookie = `${VILLAGE_COOKIE}=; max-age=0; path=/`;
}

/** The co-op dialog opened, as the campfire or Play together opens it, before a room is joined: what the room
 *  answers is said in it. */
export async function betaOpenCoop(): Promise<void> {
  history.replaceState(null, '', `${location.pathname}?net=local`);
  openCoop(true);
  // (the server's check is a promise, answered at once for the local link)
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** What a game refused by a room says. */
export interface BetaRefusal {
  status: string;
  error: string;
  /** the lobby the room is in, as the refusal said (null: not refused for its lobby) */
  asked: boolean | null;
  /** the switch's words in the dialog ('' with none offered) */
  offer: string;
}

/** The session and the dialog after a room's answer; with `forget` (the canary's), the lobby it was refused for
 *  forgotten first, so no switch is offered. */
export function betaRefusal(_lab: Lab, { forget }: { forget?: boolean }): BetaRefusal {
  if (forget) {
    session.lobbyAsked = null;
    renderCoop();
  }
  const button = element('#btn-coop-lobby');
  return {
    status: session.status,
    error: session.error,
    asked: session.lobbyAsked,
    offer: button?.checkVisibility() ? button.textContent ?? '' : '',
  };
}

/** A room an invite brought this game to, as the dialog shows it after the page loaded: the dialog shown, and the
 *  code in its field ('' with none). */
export function betaInvited(): { dialog: boolean; code: string } {
  const dialog = element('#coop');
  const field = document.querySelector<HTMLInputElement>('#coop-code');
  return { dialog: Boolean(dialog) && !dialog!.classList.contains('hidden'), code: field?.value ?? '' };
}
