// Beta features a player opts into (the pause menu's Beta tab, `ui/beta.ts`): each a choice kept in a cookie, read
// once as the page loads, so a build holds the feature and the game as it was side by side and a reload switches
// between them. The address may ask for one too (`?village=1`, `?village=0`): what the Beta tab's reload appends, and
// kept from then on, so the next visit opens the same way without it.
import { readCookie, writeCookie } from './cookies';

/** the cookie that keeps the village's choice, and the address's parameter that sets it */
const VILLAGE_COOKIE = 'last-stand-beta-village';
const VILLAGE_PARAM = 'village';

/** The village's choice as the page loads: what the page's own script settled before the game's (index.html: it takes
 *  the other lobby's markup out, by the address's `village`, kept, else the cookie's), read the same way where no
 *  such script ran; off where there's no page (a worker imports this with the modules it shares). */
function villageChosen(): boolean {
  if (typeof document === 'undefined') return false;
  const settled = document.documentElement.dataset.lobby;
  if (settled) return settled === 'village';
  const asked = new URLSearchParams(location.search).get(VILLAGE_PARAM);
  if (asked === '1' || asked === '0') writeCookie(VILLAGE_COOKIE, asked);
  return (asked === '1' || asked === '0' ? asked : readCookie(VILLAGE_COOKIE)) === '1';
}

/**
 * Whether the lobby is the village (from the owner: "we will release this under a beta flag, users who want to try
 * it will toggle it"): off, the game is as it was, the lobby its panels over the battleground, and nothing of the
 * village is built, lit or compiled. Fixed for the page's life: what it changes is decided as the game boots.
 */
export const VILLAGE = villageChosen();

/** The page loaded again with the village on or off, the choice kept (`villageChosen` reads the address's first);
 *  with `room`, as an invite to that co-op room (`net/session.ts` `invitedRoom`), joined again once it has loaded. */
export function reloadWithVillage(on: boolean, room?: string): void {
  writeCookie(VILLAGE_COOKIE, on ? '1' : '0');
  const address = new URL(location.href);
  address.searchParams.set(VILLAGE_PARAM, on ? '1' : '0');
  if (room) address.searchParams.set('room', room);
  location.replace(address.toString());
}
