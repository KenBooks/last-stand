// Friends (#676, part 2; the service is server/saves/friends.mjs): a cloud save account's friends on this site, who of
// them is online and in which room, the requests both ways and the invites. Signed in, the game says where it is
// every half minute (online, its room if it's in one and its host lets friends see it), and the answer is the
// friends as they stand; Play together's Friends tab asks more often while it shows. Signed out, there are none:
// friends are an account's, so they follow it to every device.
import { G } from '../state';
import * as api from '../loot/cloudApi';
import { signedIn } from '../loot/cloud';
import { session, partners } from './session';
import { savedTag } from './nameTag';

/** how often the game says where it is (ms): the service counts a friend online for 75 s after */
const EVERY = 30_000;
/** how often while the Friends tab or an invite waiting asks to know sooner */
const SOON = 8_000;
/** where appearing offline is kept (local storage): the device's choice */
const HIDDEN_KEY = 'last-stand.friends.hidden.v1';

/** the friends as the service last said (null: not asked yet, or signed out) */
let view: api.FriendsView | null = null;
/** the last call's problem, said in the Friends tab ('' when it answered) */
let problem = '';
let timer: ReturnType<typeof setTimeout> | undefined;
let soon = false;
let asking: Promise<void> | null = null;
const listeners = new Set<() => void>();
/** the invites already told of (a toast once each) */
const told = new Set<string>();
let onInvite: (invite: api.FriendInvite) => void = () => {};

/** The friends as last read (null signed out or before the first answer). */
export const friendsView = (): api.FriendsView | null => (signedIn() ? view : null);
/** What went wrong with the last call ('' if nothing). */
export const friendsProblem = (): string => problem;
/** Whether this device shows its player offline to friends. */
export function appearOffline(): boolean {
  try { return localStorage.getItem(HIDDEN_KEY) === '1'; } catch { return false; }
}
/** Shows this player offline to friends, or online again; said at once. */
export function setAppearOffline(on: boolean): void {
  try { localStorage.setItem(HIDDEN_KEY, on ? '1' : '0'); } catch { /* kept for this visit alone */ }
  void refreshFriends(true);
}
/** Calls `fn` whenever the friends change. */
export function onFriends(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
/** `fn` hears each new invite once (the lobby's toast). */
export function onFriendInvite(fn: (invite: api.FriendInvite) => void): void { onInvite = fn; }

/** The room this game is in as its friends may see it, or null (none, or its host keeps it from friends). */
export function presenceRoom(): api.Presence['room'] {
  if (session.status !== 'hosting' && session.status !== 'joined') return null;
  if (session.opening) return null;
  return {
    code: session.code, name: session.roomName, map: G.arena.biome,
    wave: G.run && !G.run.duel ? G.run.wave : session.wave,
    players: partners().length + 1, size: session.max, kind: session.kind, friends: session.friends,
  };
}

function presence(): api.Presence {
  return { name: session.tag || savedTag(), cls: G.profile.classId, room: presenceRoom(), hidden: appearOffline() };
}

/** The view taken in: listeners told, each new invite heard once. */
function took(next: api.FriendsView): void {
  view = next;
  problem = '';
  for (const invite of next.invites) {
    const key = `${invite.id} ${invite.room.code} ${invite.when}`;
    if (told.has(key)) continue;
    told.add(key);
    onInvite(invite);
  }
  for (const fn of listeners) fn();
}

/** Says where this game is now and takes the answer (`now`: at once, not waiting its turn). */
export function refreshFriends(now = false): Promise<void> {
  if (!signedIn()) {
    view = null;
    return Promise.resolve();
  }
  if (asking && !now) return asking;
  asking = api.sayPresence(presence()).then(took, (e: unknown) => {
    problem = e instanceof api.CloudError && e.status ? e.message : 'The friends list could not be reached.';
    for (const fn of listeners) fn();
  }).finally(() => {
    asking = null;
    schedule();
  });
  return asking;
}

function schedule(): void {
  clearTimeout(timer);
  timer = setTimeout(() => void refreshFriends(), soon ? SOON : EVERY);
}

/** Asked more often while the Friends tab shows (`on`), back to every half minute otherwise. */
export function watchFriends(on: boolean): void {
  if (soon === on) return;
  soon = on;
  if (on) void refreshFriends(true);
  else schedule();
}

/** Starts saying where the game is, every half minute while signed in, and as soon as its room changes. */
export function initFriends(): void {
  let roomSaid = '';
  setInterval(() => {
    const room = JSON.stringify(presenceRoom());
    if (room === roomSaid) return;
    roomSaid = room;
    if (signedIn()) void refreshFriends(true);
  }, 2_000);
  void refreshFriends(true);
}

/** Runs a change to the friends (a request, an accept, a removal...), takes the view it answers, and resolves to
 *  what went wrong ('' when nothing did). */
export async function changeFriends(change: () => Promise<api.FriendsView>): Promise<string> {
  try {
    took(await change());
    return '';
  } catch (e) {
    return e instanceof api.CloudError && e.status ? e.message : 'The friends list could not be reached.';
  }
}

/** Invites friend `id` into this game's room; resolves to what went wrong ('' when nothing did). */
export async function invite(id: string): Promise<string> {
  const room = presenceRoom();
  if (!room) return 'Open or join a room first.';
  if (!room.friends && session.status !== 'hosting') return 'The host keeps this room from friends.';
  try {
    await api.inviteFriend(id, { ...room, friends: true });
    return '';
  } catch (e) {
    return e instanceof api.CloudError && e.status ? e.message : 'The invite could not be sent.';
  }
}
