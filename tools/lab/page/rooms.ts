// `lab rooms`'s side of a page (tools/lab/node/rooms.mjs): Play together driven as a player drives it, against a co-op
// relay the Node side starts on localhost: a room opened from the create page (public, locked with a password or
// private), the public rooms read in the browser and one joined from its row, a password typed under its row or where
// the room asked for it, a room joined by its code. Every press is the browser's own click or typing (`lab.clickOn`,
// `lab.type`); what the dialog shows is read off the page, never off the game's own state alone.
import { openCoop, coopOpen } from '../../../src/ui/coop';
import { session } from '../../../src/net/session';
import type { Lab } from './lab';

/** A room's row as the browser shows it. */
export interface RoomRow {
  code: string; tag: string; name: string; map: string; players: string; locked: boolean; join: string;
}

/** What a page's Play together says, and the session under it. */
export interface RoomsState {
  /** the dialog up, and the page it shows ('browse', 'create', 'hero'; '' in a room) */
  open: boolean; pane: string;
  /** what its status line says (the server checked, an error) and whether a password is asked for there */
  status: string; passwordAsked: boolean;
  /** the rooms its browser lists, as their rows show them, or its empty line */
  rows: RoomRow[]; empty: string;
  /** the session: its status, room code, kind, and how many partners it has */
  session: string; code: string; kind: string; partners: number;
  /** the room view's line saying what kind of room it is */
  kindLine: string;
}

const text = (element: Element | null): string => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const inDialog = <T extends Element = HTMLElement>(selector: string): T | null =>
  document.querySelector<T>(`#coop ${selector}`);

/** The page's relay: `server` put in its address (as `?server=` tries another), which the game reads at each call. */
export function roomsUse(_lab: Lab, { server }: { server: string }): string {
  const address = new URL(location.href);
  address.searchParams.set('server', server);
  history.replaceState(null, '', `${address.pathname}${address.search}`);
  return location.search;
}

/** Play together opened (it checks the server and reads the list as it opens). */
export function roomsOpen(): void {
  if (!coopOpen()) openCoop(true);
}

/** What the dialog shows now. */
export function roomsState(): RoomsState {
  const rows = [...document.querySelectorAll<HTMLElement>('#coop .coop-room-row')].map((row) => ({
    code: row.dataset.code ?? '',
    tag: text(row.querySelector('.coop-room-names b')),
    name: text(row.querySelector('.coop-room-names small')),
    map: text(row.querySelector('.coop-room-map')),
    players: text(row.querySelector('.coop-room-size > span:last-child')),
    locked: Boolean(row.querySelector('.coop-lock')),
    join: text(row.querySelector('.coop-room-join')),
  }));
  // (the server's check is said where the rooms are listed, no longer in a line of its own over the pages)
  const checking = text(inDialog('.coop-rooms-empty')).startsWith('Checking') ? 'Checking the co-op server…' : '';
  const status = text(inDialog('.coop-checking')) || checking || text(inDialog('.coop-error'))
    || text(inDialog('.coop-offline p'));
  return {
    open: coopOpen(), pane: inDialog<HTMLElement>('.coop-main')?.dataset.pane ?? '',
    status, passwordAsked: Boolean(inDialog('.coop-pass-ask')),
    rows, empty: text(inDialog('.coop-rooms-empty')),
    session: session.status, code: session.code, kind: session.kind, partners: session.peers.size,
    kindLine: text(inDialog('.coop-room-kind')),
  };
}

/** `selector` in the dialog clicked by the mouse; throws where there's none. */
async function click(lab: Lab, selector: string): Promise<void> {
  const element = inDialog(selector);
  if (!element) {
    const state = roomsState();
    const rows = state.rows.map((r) => r.code).join(', ') || `none, "${state.empty}"`;
    throw new Error(`lab: rooms: no ${selector} in Play together (its ${state.pane} page, rows ${rows}, "${state.status}")`);
  }
  await lab.clickOn(element);
}

/** `value` typed into the dialog's field `id`, as a player types it: clicked into, emptied, typed. */
async function typeInto(lab: Lab, id: string, value: string): Promise<void> {
  const field = inDialog<HTMLInputElement>(`#${id}`);
  if (!field) throw new Error(`lab: rooms: no #${id} in Play together`);
  await lab.clickOn(field);
  field.select();
  await lab.type(value);
}

/** A page of the dialog shown by its tab (the hero's only where it has one: a small screen). */
async function showPane(lab: Lab, pane: string): Promise<void> {
  if (inDialog<HTMLElement>('.coop-main')?.dataset.pane === pane) return;
  await click(lab, `.coop-tab[data-pane="${pane}"]`);
}

/** The name tag typed on the hero's page (or its column beside the rooms). */
async function nameTag(lab: Lab, tag: string): Promise<void> {
  const field = inDialog<HTMLInputElement>('#coop-tag');
  if (!field || field.getClientRects().length === 0) await showPane(lab, 'hero');
  await typeInto(lab, 'coop-tag', tag);
}

/** A room opened from the create page: its kind, name, password and size picked, then Open the room. */
export async function roomsCreate(lab: Lab, plan: { tag: string; kind: string; name: string; password: string; max: number }): Promise<void> {
  roomsOpen();
  await nameTag(lab, plan.tag);
  await showPane(lab, 'create');
  await click(lab, `.coop-kind[data-kind="${plan.kind}"]`);
  await click(lab, `.coop-size[data-max="${plan.max}"]`);
  await typeInto(lab, 'coop-room-name', plan.name);
  if (plan.kind === 'password') await typeInto(lab, 'coop-room-password', plan.password);
  await click(lab, '#btn-coop-host');
}

/** The browser shown and its Refresh pressed. */
export async function roomsRefresh(lab: Lab): Promise<void> {
  roomsOpen();
  await showPane(lab, 'browse');
  await click(lab, '.coop-refresh');
}

/** A listed room joined from its row: picked, its password typed under it if it's locked, its Join pressed. */
export async function roomsJoinListed(lab: Lab, { tag, code, password }: { tag: string; code: string; password: string }): Promise<void> {
  roomsOpen();
  await nameTag(lab, tag);
  await showPane(lab, 'browse');
  await click(lab, `.coop-room-pick[data-code="${code}"]`);
  if (password) await typeInto(lab, 'coop-room-pass', password);
  await click(lab, `.coop-room-join[data-code="${code}"]`);
}

/** The password the room asked for typed where the dialog asks for it, and its Join pressed. */
export async function roomsGivePassword(lab: Lab, { password }: { password: string }): Promise<void> {
  await typeInto(lab, 'coop-pass', password);
  await click(lab, '.coop-pass-ask button');
}

/** A room joined by its code, typed along the dialog's foot. */
export async function roomsJoinCode(lab: Lab, { tag, code }: { tag: string; code: string }): Promise<void> {
  roomsOpen();
  await nameTag(lab, tag);
  await typeInto(lab, 'coop-code', code);
  await click(lab, '.coop-join button');
}

/** The room left by its Leave room, and the dialog opened again on its browser. */
export async function roomsLeave(lab: Lab): Promise<void> {
  roomsOpen();
  await click(lab, '#btn-coop-leave');
}

/** Frames run, for what the game does on its own clock (its reports, the dialog's renders on the session's
 *  changes come at once). */
export async function roomsStep(lab: Lab, { frames }: { frames: number }): Promise<void> {
  await lab.step(frames);
}
