// `lab friends`'s side of a page (tools/lab/node/friends.mjs): Play together's Friends tab driven as a player drives
// it, against a saves service and a co-op relay the Node side starts on localhost: a cloud save account made by the
// page's own passkey (a virtual authenticator the Node side gives the browser), a friend's code typed and sent, a
// request accepted from its row, a friend's room joined from the list, a friend invited from the room and the invite
// joined from its toast. Every press is the browser's own click or typing; what the tab shows is read off the page.
import { openCoop, coopOpen } from '../../../src/ui/coop';
import { session } from '../../../src/net/session';
import { refreshFriends, friendsView } from '../../../src/net/friends';
import { signUpWithPasskey, signedIn } from '../../../src/loot/cloud';
import type { Lab } from './lab';

/** A person's row in the Friends tab (or a room's invite list), as it shows. */
export interface FriendRow {
  /** the section it's under: Invites, Requests, Online, Offline, Sent, Invite friends */
  section: string; name: string; line: string; acts: string[];
}

/** What a page's Friends tab says, and the session under it. */
export interface FriendsState {
  signedIn: boolean;
  /** the code the tab shows ('' where it shows none) */
  code: string;
  /** the number on the Friends tab's badge (0: none) */
  badge: number;
  rows: FriendRow[];
  /** what the tab said of the last change */
  note: string;
  /** the invite's toast as it shows ('' hidden) */
  toast: string;
  /** the friends as the service last said them, by name: online, and their room's code */
  service: { name: string; online: boolean; room: string; busy: boolean }[];
  session: string; roomCode: string; partners: number;
  status: string;
}

const text = (element: Element | null): string => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const inDialog = <T extends Element = HTMLElement>(selector: string): T | null =>
  document.querySelector<T>(`#coop ${selector}`);

/** The page's relay and saves service put in its address (`?server=`, `?saves=`), which the game reads at each call;
 *  its name tag kept, and slow-game reports off (their prompt lay over the dialogs on a loaded machine). */
export function friendsUse(_lab: Lab, { server, saves, tag }: { server: string; saves: string; tag: string }): string {
  const address = new URL(location.href);
  address.searchParams.set('server', server);
  address.searchParams.set('saves', saves);
  history.replaceState(history.state, '', `${address.pathname}${address.search}`);
  localStorage.setItem('last-stand.name.v1', tag);
  localStorage.setItem('last-stand-perf-traces', JSON.stringify({ consent: 'off', refusals: 0, sent: [] }));
  return location.search;
}

/** A cloud save account made by this browser's passkey, and the friends read for the first time. */
export async function friendsSignUp(): Promise<string> {
  await signUpWithPasskey();
  await refreshFriends(true);
  return friendsView()?.code ?? '';
}

/** The friends asked for now (as the half minute's call does). */
export async function friendsRefresh(): Promise<void> {
  await refreshFriends(true);
}

/** What the Friends tab and the room's invite list show now. */
export function friendsState(): FriendsState {
  const rows: FriendRow[] = [];
  let section = '';
  for (const element of document.querySelectorAll<HTMLElement>('#coop .coop-friends-head, #coop .coop-friend')) {
    if (element.classList.contains('coop-friends-head')) {
      section = text(element).replace(/\s*·.*$/, '');
      continue;
    }
    rows.push({
      section, name: text(element.querySelector('.coop-friend-who b')), line: text(element.querySelector('.coop-friend-who small')),
      acts: [...element.querySelectorAll<HTMLElement>('.coop-friend-act')].map((b) => b.dataset.act ?? ''),
    });
  }
  const toast = document.getElementById('friend-invite');
  const view = friendsView();
  return {
    signedIn: signedIn(),
    code: text(inDialog('.coop-friend-code')).replace(/-/g, ''),
    badge: Number(text(inDialog('.coop-tab-friends .coop-badge')) || 0),
    rows,
    note: text(inDialog('.coop-friend-note:not(.hidden)')),
    toast: toast && !toast.classList.contains('hidden') ? text(toast) : '',
    service: (view?.friends ?? []).map((f) => ({ name: f.name, online: f.online, room: f.room?.code ?? '', busy: f.busy })),
    session: session.status, roomCode: session.code, partners: session.peers.size,
    status: text(inDialog('.coop-checking')) || text(inDialog('.coop-error')),
  };
}

/** `element` clicked by the mouse; throws naming `what` where there's none. */
async function click(lab: Lab, element: HTMLElement | null, what: string): Promise<void> {
  if (!element) {
    const rows = friendsState().rows.map((r) => `${r.section}/${r.name}[${r.acts.join(',')}]`).join(' ') || 'none';
    throw new Error(`lab: friends: no ${what} (rows ${rows})`);
  }
  await lab.clickOn(element);
}

/** Play together opened on its Friends tab (out of a room; in one, the room's view with its invite list). */
export async function friendsOpenTab(lab: Lab): Promise<void> {
  if (!coopOpen()) openCoop(true);
  // (the server checked first: its answer writes the dialog afresh, and a click across it was lost on a phone's screen)
  // (it answers in the browser's own time, not the lab's frames: waited for by real timeouts)
  for (let waited = 0; inDialog('.coop-checking'); waited += 100) {
    if (waited > 15_000) throw new Error('lab: friends: the dialog never found the server');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  for (let tries = 0; tries < 3; tries++) {
    const tab = inDialog<HTMLElement>('.coop-tab[data-pane="friends"]');
    if (!tab || tab.classList.contains('on')) return;
    await click(lab, tab, 'Friends tab');
  }
  if (!inDialog('.coop-tab[data-pane="friends"].on')) throw new Error('lab: friends: the Friends tab never opened');
}

/** A friend's code typed into the tab's field, and Send request pressed. */
export async function friendsAdd(lab: Lab, { code }: { code: string }): Promise<void> {
  await friendsOpenTab(lab);
  const field = inDialog<HTMLInputElement>('#coop-friend-code');
  await click(lab, field, 'friend code field');
  field!.select();
  await lab.type(`${code.slice(0, 4)}-${code.slice(4)}`);
  await click(lab, inDialog('.coop-friend-add button'), 'Send request');
}

/** The button `act` on `name`'s row pressed (Accept, Join, Invite...). */
export async function friendsAct(lab: Lab, { name, act }: { name: string; act: string }): Promise<void> {
  const rows = [...document.querySelectorAll<HTMLElement>('#coop .coop-friend')];
  const row = rows.find((r) => text(r.querySelector('.coop-friend-who b')) === name);
  await click(lab, row?.querySelector<HTMLElement>(`.coop-friend-act[data-act="${act}"]`) ?? null, `${act} on ${name}'s row`);
}

/** Play together put away, as a player walks off into the village. */
export function friendsClose(): void {
  if (coopOpen()) openCoop(false);
}

/** The invite's toast's Join pressed. */
export async function friendsToastJoin(lab: Lab): Promise<void> {
  await click(lab, document.querySelector<HTMLElement>('#friend-invite:not(.hidden) .fi-join'), 'the invite\'s Join');
}

/** The create page's "Friends can see and join it" set, as a player ticks it. */
export async function friendsRoomTick(lab: Lab, { on }: { on: boolean }): Promise<void> {
  if (!coopOpen()) openCoop(true);
  const tab = inDialog<HTMLElement>('.coop-tab[data-pane="create"]');
  if (tab && !tab.classList.contains('on')) await click(lab, tab, 'Create room tab');
  const box = inDialog<HTMLInputElement>('#coop-room-friends');
  if (!box) throw new Error('lab: friends: no "Friends can see and join it" on the create page');
  if (box.checked !== on) await click(lab, box, 'the friends tick');
}
