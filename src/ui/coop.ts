// Co-op UI: the "Play together" room dialog, the lobby's room bar, and in a run the partners'
// frames and nameplates, the downed state and the revive prompt.
import { G } from '../state';
import { COOP } from '../data/balance';
import {
  session, hostRoom, joinRoom, leaveRoom, inviteLink, partners, peerIdOf, readyingOf, lookOf, PROTOCOL, ROOM_NAME_MAX, type Look,
  type RoomKind,
  type RoomPlan,
} from '../net/session';
import { askProblem, askTrade } from '../net/trade';
import { reloadWithVillage, VILLAGE } from '../core/beta';
import { whenWarm } from '../game/warm';
import { READYING } from './readying';
import { listRooms, serverUp, SERVER_DOWN, type RoomListing } from '../net/transport';
import { BIOMES, BIOME_IDS, type BiomeId } from '../data/biomes';
import { CLASSES } from '../data/classes/index';
import { isCoop } from '../net/role';
import { cleanTag, savedTag, tagProblem, TAG_MAX } from '../net/nameTag';
import { anchorLabel, removeLabel, onLayout, onScreenOrEdge } from './floaters';
import { Label, ORDER } from './overlay/layer';
import { ALLY_BAR, ALLY_NAME, barArt, barStep } from './overlay/bars';
import { drawText, measure, OUTLINE, type TextStyle } from './overlay/paint';
import { renderLobbyOptions } from './menus';
import { openSaves } from './saves';
import { isTouch } from './touch';
import { sfx } from '../core/audio';
import { lookFacing, viewSettled } from '../core/renderer';
import { reportLinks, bindReportLinks } from './netHud';
import { bindColourPicker, colourPickerHtml } from './colourPicker';
import { portraitPickerHtml, bindPortraitPicker, portraitHtml, syncPortrait } from './portraitPicker';
import { heroColour } from '../data/heroColours';
import type { Player } from '../entities/player';
import { flyingFree, toggleFree, watchedPlayer, watchNext } from '../game/spectate';

const $ = <T extends Element = HTMLElement>(s: string, root: ParentNode = document): T => root.querySelector<T>(s)!;
const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** The switch offered where a room refused us for its lobby (`session.lobbyAsked`): this game loaded again in the
 *  room's lobby (the village beta on or off) and joined to it. */
function lobbySwitchHtml(): string {
  if (session.lobbyAsked === null) return '';
  const says = session.lobbyAsked ? 'Switch to the village and join' : 'Switch to the old lobby and join';
  return `<div class="coop-offline" role="status"><p>The game reloads to switch. You can switch back in Settings, `
    + `under Beta.</p><button class="btn primary" id="btn-coop-lobby">${says}</button></div>`;
}

/** What a player is called in co-op: its name tag (the hero's class where it has none, solo). */
export function nameOf(p: Player): string {
  if (p.local) return isCoop() && session.tag ? session.tag : p.cls.name;
  return p.tag || p.cls.name;
}

/** a partner's dot in the room's list, in its hero's colour */
const dotColour = (p: Player): string => {
  const c = heroColour(p.colour);
  return c ? ` style="--dot:${c.swatch}"` : '';
};

const who = (p: Player): string => `${nameOf(p)} · ${p.slot === 0 ? 'host' : 'partner'} · ${p.cls.name}`;

let touchRevive = false;
/** Open a room or Join pressed and waiting for the heroes' programs (`whenWarm`) before the room is asked for: the
 *  button pressed says so, and the dialog's choices wait with it (pressed, nothing showed it was taken) */
let pressed: 'host' | 'join' | null = null;
/** What's typed in the dialog's fields (null: untouched), kept through its renders: a colour or portrait picked, the
 *  server's check answered and the session's changes render it again, and each rebuilt the name tag from the one
 *  kept, so a name typed was gone by the time the code was (#555). `for`: the form it was typed in (`formFor`), so a
 *  fresh refusal or invite shows its own tag and code. */
let typed: { for: string; tag: string | null; code: string | null } = { for: '', tag: null, code: null };
/** The press answered: the room asked for, and what was typed for it done with (the session says what came of it). */
function asked(): void {
  pressed = null;
  invited = '';
  typed = { for: '', tag: null, code: null };
}
/** a room hosted or joined: before the programs are warm, once they are (a partner's hero is any class) */
const host = whenWarm(['heroes'], (tag: string, plan: RoomPlan) => { asked(); void hostRoom(tag, plan); }, READYING.coop);
const join = whenWarm(['heroes'], (code: string, tag: string, password: string) => {
  asked();
  void joinRoom(code, tag, password);
}, READYING.coop);

/** The dialog's page out of a room: the public rooms, a room of one's own to open, or (on a small screen, where it
 *  has no column beside them) the player's hero: name tag, colour, portrait. */
type Pane = 'browse' | 'create' | 'hero';
let pane: Pane = 'browse';
/** what the dialog's own fields hold, kept through its renders as `typed` is (the browser's filters, the room to
 *  create, a password) */
const form = {
  search: '', map: '' as BiomeId | '', notFull: false,
  kind: 'public' as RoomKind, name: '', password: '', max: COOP.maxPlayers,
  /** the room picked in the list, and the password typed for it or for the room that asked for one */
  picked: '', joinPassword: '',
};
/** the public rooms as last read (null: they couldn't be read; 'loading' before the first answer) */
let rooms: RoomListing[] | null | 'loading' = 'loading';
let roomsNo = 0;
/** how often the list is read again while it's shown (ms) */
const ROOMS_EVERY = 10_000;
let roomsTimer: ReturnType<typeof setInterval> | undefined;
async function readRooms(): Promise<void> {
  const n = ++roomsNo;
  const read = await listRooms();
  if (n !== roomsNo) return;
  rooms = read;
  if (coopOpen() && pane === 'browse' && (session.status === 'off' || session.status === 'failed')) renderCoop();
}
/** The list read now and every `ROOMS_EVERY` while the dialog is up and the server answers; stopped otherwise. */
function watchRooms(on: boolean): void {
  clearInterval(roomsTimer);
  roomsTimer = undefined;
  if (!on) return;
  void readRooms();
  roomsTimer = setInterval(() => {
    if (!coopOpen() || (session.status !== 'off' && session.status !== 'failed')) { watchRooms(false); return; }
    if (pane === 'browse') void readRooms();
  }, ROOMS_EVERY);
}

/** the rooms this game can join and the filters let through, as the list shows them */
function shownRooms(): RoomListing[] {
  if (!Array.isArray(rooms)) return [];
  const q = form.search.trim().toLowerCase();
  return rooms.filter((r) => r.v === PROTOCOL
    && (!form.map || r.map === form.map)
    && (!form.notFull || r.players < r.max)
    && (!q || `${r.tag} ${r.name} ${biomeLabel(r.map)}`.toLowerCase().includes(q)));
}
/** a room Quick join may take: open, unlocked, in this lobby; the fullest first, as the relay lists them */
const quickRoom = (): RoomListing | undefined => (Array.isArray(rooms) ? rooms : [])
  .find((r) => r.v === PROTOCOL && !r.locked && r.players < r.max && r.lobby === (VILLAGE ? 'village' : 'panels'));

const biomeLabel = (id: string): string => (BIOMES as Record<string, { title: string } | undefined>)[id]?.title ?? id;
const classOf = (id: string): { name: string; accent: string } | null => CLASSES[id] ?? null;
/** a room code from an invite link, waiting in the dialog for a name tag */
let invited = '';
/** what's wrong with the name tag as last tried, said under it */
let tagNote = '';
/** Whether the touch revive button is held. */
export const touchReviving = (): boolean => touchRevive;

export function initCoop(): void {
  // (the panels' link: the village's way in is its campfire)
  if (!VILLAGE) $('#btn-coop').onclick = () => { sfx.click(); openCoop(true); };
  $('#btn-coop-close').onclick = () => { sfx.click(); openCoop(false); };
  $('#coop').onclick = (e) => { if (e.target === $('#coop')) openCoop(false); };
  const rv = $('#btn-revive');
  const hold = (on: boolean) => (e: Event) => { e.preventDefault(); touchRevive = on; };
  rv.addEventListener('pointerdown', hold(true));
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) rv.addEventListener(ev, hold(false));
  bindSpectate();
  renderCoop();
}

/** The watching bar's buttons (`game/spectate.ts`), each a key's touch path: the next and previous partner and free
 *  flight (the camera turns by two fingers twisted, `ui/touch.ts`, as it does everywhere on touch). */
function bindSpectate(): void {
  const bar = $('#spectate');
  $('.sp-prev', bar).onclick = () => watchNext(-1);
  $('.sp-next', bar).onclick = () => watchNext(1);
  $('.sp-free', bar).onclick = () => toggleFree();
}

/** what the watching bar last said: its words changed only as they do */
let barSaid = '';
/** The watching bar: who is watched (or the free camera), and the keys for each of its buttons. */
function sayWatching(bar: HTMLElement): void {
  const free = flyingFree();
  const p = watchedPlayer();
  const name = free ? 'Free camera' : p ? `Watching ${nameOf(p)}` : 'Watching';
  const keys = free ? 'WASD fly · Q / E turn · F follow' : 'LMB next · RMB previous · Q / E turn · F free camera';
  const said = `${name}|${keys}|${free}`;
  if (said === barSaid) return;
  barSaid = said;
  $('.sp-name', bar).textContent = name;
  $('.sp-keys', bar).textContent = keys;
  $('.sp-free', bar).textContent = free ? 'Follow' : 'Free camera';
}

/** the co-op server as last checked: asked each time the dialog opens with no room */
let server: 'checking' | 'up' | 'down' = 'checking';
let checkNo = 0;
async function checkServer(): Promise<void> {
  const n = ++checkNo;
  server = 'checking';
  renderCoop();
  const up = await serverUp();
  if (n !== checkNo) return;
  server = up ? 'up' : 'down';
  watchRooms(up);
  renderCoop();
}

/** an invite's join asked without the dialog (a name tag was kept) and not yet answered: refused, the dialog opens
 *  to say why, with the way on (another name tag, the room's lobby) */
let invitedJoin = false;

/** An invite's own join answered: joined, nothing to say; refused (the name tag taken, the room in the other lobby,
 *  gone or full), the dialog opened on it, where it went unsaid before: the game just stood in its lobby. Returns
 *  whether it opened the dialog (which renders it). */
function invitedRefused(): boolean {
  // (off: still readying, the join not yet asked)
  if (!invitedJoin || session.status === 'joining' || session.status === 'off') return false;
  invitedJoin = false;
  if (session.status !== 'failed' || coopOpen()) return false;
  openCoop(true);
  return true;
}

/**
 * An invite link: straight into the friend's room as the name tag kept from last time, or with none kept, the room
 * dialog asking for one, the room's code filled in.
 */
export function joinInvited(code: string): void {
  const tag = savedTag();
  if (!tagProblem(tag)) {
    invitedJoin = true;
    join(code, tag, '');
    return;
  }
  invited = code;
  typed = { for: '', tag: null, code: null };
  openCoop(true);
}

/** The name tag typed in the dialog, or null (said under it, and the field focused) if it can't be used. */
function typedTag(body: HTMLElement): string | null {
  const field = $<HTMLInputElement>('#coop-tag', body);
  const tag = cleanTag(field.value);
  const problem = tagProblem(tag);
  if (problem) {
    tagNote = problem;
    const note = $('.coop-tag-note', body);
    note.textContent = problem;
    note.classList.remove('hidden');
    field.focus();
    return null;
  }
  tagNote = '';
  return tag;
}

/** Which form the dialog shows, for what's typed in it: asked to rename (for which room and tag), an invite's, or
 *  a fresh one. */
const formFor = (rename: boolean): string =>
  rename ? `rename ${session.code} ${session.tag}` : invited ? `invite ${invited}` : 'fresh';

/** The dialog's field being typed in and its caret, to put back once the dialog is rendered again (null: none). */
function fieldTypedIn(body: HTMLElement): { id: string; from: number | null; to: number | null } | null {
  const field = document.activeElement;
  if (!(field instanceof HTMLInputElement) || !field.id || !body.contains(field)) return null;
  return { id: field.id, from: field.selectionStart, to: field.selectionEnd };
}

/** The room dialog laid out under the loading screen as the server leaves it (`look`: nothing asked of it here, the
 *  campfire asks as it opens it), or put away (null): first rastered at the campfire, a first visit's held Chrome
 *  0.5 to 0.7 s; rehearsed as it is once the server's up alone, its look while it's checked (the choices dimmed)
 *  still held it 0.26 to 1.06 s. The boot lays out each look in turn. */
export function layOutCoopAhead(look: typeof server | null): void {
  const was = server;
  if (look) {
    server = look;
    renderCoop();
  }
  server = was;
  $('#coop').classList.toggle('hidden', !look);
}

/** Whether the room dialog is up. */
export const coopOpen = (): boolean => !$('#coop').classList.contains('hidden');

export function openCoop(open: boolean): void {
  $('#coop').classList.toggle('hidden', !open);
  if (!open) { watchRooms(false); return; }
  if (session.status === 'off' || session.status === 'failed') void checkServer();
  else renderCoop();
}

/** The room dialog and the lobby's room bar, for the session as it stands. */
export function renderCoop(): void {
  if (invitedRefused()) return;
  renderLobbyOptions();
  renderBar();
  const body = $('#coop .coop-body');
  // (the dialog's Close lives in its foot: taken out before the body is written afresh, put back in its slot after)
  const close = $('#btn-coop-close');
  body.parentElement!.append(close);
  renderBody(body);
  body.querySelector('.coop-close-slot')?.append(close);
}

/** The dialog's title and, beside it, its tabs or its room (one row: the owner's "more compact... a single line"). */
const headHtml = (beside: string): string => `<div class="coop-head"><h2 class="coop-title">Play together</h2>${beside}</div>`;
/** The dialog's foot in one row: its own controls first, the network log's line, then `after` and Close. */
const footHtml = (first: string, after = '', cls = '', attrs = ''): string =>
  `<div class="coop-foot coop-choice${cls}"${attrs}>${first}${reportLinks()}${after}<span class="coop-close-slot"></span></div>`;

/** What kind of room it is, as its room view says it. */
function roomKindLine(s: string): string {
  const kind = session.kind === 'public' ? 'Public: listed for anyone'
    : session.kind === 'password' ? 'Locked with a password' : 'Private: joined by its code';
  if (s === 'hosting') return `${esc(session.roomName)} · ${kind} · up to ${session.max}`;
  return session.kind === 'password' ? 'Locked with a password' : '';
}

/** A player's card in the room: portrait, colour, name tag, class in its accent, the host's mark; an empty place. */
/** The level of a player's gear: the mean of what it wears' item levels, 0 with nothing worn. */
function gearLevel(look: Look | null): number {
  const levels = Object.values(look?.eq ?? {}).map((item) => item?.ilvl).filter((l): l is number => Number.isFinite(l));
  return levels.length ? Math.round(levels.reduce((a, b) => a + b, 0) / levels.length) : 0;
}
/** a partner's best wave as its look says it, held to a whole number a wave could be (none: unsaid) */
const bestOf = (look: Look | null): number | null =>
  Number.isInteger(look?.best) && look!.best! >= 0 && look!.best! < 10000 ? look!.best! : null;
/** one figure of a card: its number over its name */
const statHtml = (value: string, name: string): string => `<span class="coop-stat"><b>${value}</b><small>${name}</small></span>`;

/** A player's card in the room: portrait, colour, name tag, class in its accent, the gear's level and best wave, the
 *  host's mark; an empty place. Every card is one size (from Victor's review of #682: "Card need to be same size,
 *  host or guest"): the host's mark has its column on every card, empty but for the host's. */
function partyCardHtml(p: Player | null): string {
  if (!p) {
    return `<li class="coop-card empty"><span class="coop-card-face"></span><span class="coop-card-who"><b>Open place</b>
      <small>Waiting for a friend to join…</small></span><span class="coop-card-stats"></span><span class="coop-card-mark"></span></li>`;
  }
  const accent = CLASSES[p.cls.id]?.accent;
  const look = lookOf(p);
  const best = bestOf(look);
  const host = p.slot === 0 ? '<span class="coop-card-host" title="Host">Host</span>' : '';
  return `<li class="coop-card${p.local ? ' own' : ''}"><span class="coop-card-face">${portraitHtml(p)}</span>
    <span class="coop-card-who"><b><span class="coop-dot"${dotColour(p)}></span>${esc(nameOf(p))}</b>
      <small${accent ? ` style="color:${accent}"` : ''}>${esc(p.cls.name)}</small></span>
    <span class="coop-card-stats">${statHtml(String(gearLevel(look)), 'Gear level')}${statHtml(best === null ? '–' : String(best), 'Best wave')}</span>
    <span class="coop-card-mark">${host}${tradeButton(p)}</span></li>`;
}

function renderBody(body: HTMLElement): void {
  const others = partners();
  const s = session.status;
  if (s === 'off' || s === 'failed') {
    renderOutOfRoom(body, s);
    return;
  }
  if (s === 'joining') {
    body.innerHTML = `${headHtml('')}
      <div class="coop-main coop-in-room joining"><section class="coop-pane coop-party">
        <p class="coop-wait">Joining room <b class="coop-code">${esc(session.code)}</b>…</p>
        <p class="coop-intro">Finding the host on the co-op server.</p></section></div>
      ${footHtml('<button class="btn" id="btn-coop-leave">Cancel</button>')}`;
  } else {
    const max = s === 'hosting' ? session.max : Math.max(2, Math.min(COOP.maxPlayers, others.length + 1));
    const players: (Player | null)[] = [G.player, ...others];
    while (players.length < max) players.push(null);
    const link = s === 'hosting' && session.opening ? '<p class="coop-wait" role="status">Opening the room on the co-op server…</p>'
      : s === 'hosting' ? `<div class="coop-link"><input readonly value="${esc(inviteLink())}" aria-label="Invite link"><button class="btn" id="btn-coop-copy">Copy link</button></div>` : '';
    const line = roomKindLine(s);
    body.innerHTML = `${headHtml(`<div class="coop-room">Room <b class="coop-code">${esc(session.code)}</b></div>`)}
      ${line ? `<p class="coop-room-kind">${line}</p>` : ''}
      <div class="coop-main coop-in-room">
        <section class="coop-pane coop-party">
          ${link}
          <ul class="coop-list">${players.map(partyCardHtml).join('')}</ul>
          <p class="coop-intro">${s === 'hosting' ? 'You pick the battleground and start the run; your friends come along.' : 'The host picks the battleground and starts the run.'}
            After each wave everyone decides: bank and leave, or continue together.</p>
        </section>
        <aside class="coop-pane coop-hero">${colourPickerHtml(true)}${portraitPickerHtml()}</aside>
      </div>
      ${footHtml('<button class="btn danger" id="btn-coop-leave">Leave room</button>')}`;
    const copy = $('#btn-coop-copy', body) as HTMLElement | null;
    if (copy) copy.onclick = () => {
      sfx.click();
      navigator.clipboard?.writeText(inviteLink()).then(() => { copy.textContent = 'Copied'; }, () => $<HTMLInputElement>('.coop-link input', body).select());
    };
  }
  bindColourPicker(body);
  bindPortraitPicker(body, renderCoop);
  bindReportLinks(body);
  $('#btn-coop-leave', body).onclick = () => { sfx.click(); leaveRoom(); };
  body.querySelectorAll<HTMLButtonElement>('.coop-trade').forEach((b) => {
    b.onclick = () => {
      const id = b.dataset.peer!;
      if (askProblem(id)) return;
      sfx.click();
      askTrade(id);
      openCoop(false);
    };
  });
}

/** A partner's Trade button in the room's list (ui/trade.ts): in the lobby alone, off with why where it can't be
 *  asked now (in a run, a trade under way). */
function tradeButton(p: Player): string {
  const id = p.local ? null : peerIdOf(p);
  if (!id || G.mode !== 'menu') return '';
  const why = askProblem(id);
  return `<button class="btn coop-trade" data-peer="${esc(id)}"${why ? ` disabled title="${esc(why)}"` : ''}>Trade</button>`;
}


// --- out of a room: the rooms browser, a room of one's own, the hero -------------------------------------------
/** what each kind of room is, as the create page's choices say it */
const KINDS: { kind: RoomKind; label: string; says: string }[] = [
  { kind: 'public', label: 'Public', says: 'Listed, anyone can join' },
  { kind: 'private', label: 'Private', says: 'Hidden, joined by code or link' },
  { kind: 'password', label: 'Password', says: 'Listed, needs a password to join' },
];
const PANES: { pane: Pane; label: string }[] = [
  { pane: 'browse', label: 'Browse rooms' }, { pane: 'create', label: 'Create room' }, { pane: 'hero', label: 'Your hero' },
];

/** a room's players as pips, filled for each one in it */
const pipsHtml = (r: RoomListing): string => `<span class="coop-pips" aria-hidden="true">${
  Array.from({ length: r.max }, (_, i) => `<i${i < r.players ? ' class="on"' : ''}></i>`).join('')}</span>`;

/** A room's row in the list: its host and hero, its name, map and wave, how full, locked or not, and its Join; the
 *  room picked opens under its row, with a password field where it's locked. */
function roomRowHtml(r: RoomListing, open: boolean): string {
  const cls = classOf(r.cls);
  const picked = form.picked === r.code;
  const full = r.players >= r.max;
  const otherLobby = r.lobby !== (VILLAGE ? 'village' : 'panels');
  const where = r.run ? `Wave ${r.wave}` : 'In the lobby';
  const dot = cls ? ` style="--dot:${cls.accent}"` : '';
  const join = `<button class="btn primary coop-room-join" data-code="${esc(r.code)}"${open && !full ? '' : ' disabled'}>${
    full ? 'Full' : 'Join'}</button>`;
  const detail = !picked ? '' : `<div class="coop-room-more">
      <span>${esc(cls ? `${cls.name} host` : 'Host')} · ${r.locked ? 'Password room' : 'Public room'} · ${
        otherLobby ? (r.lobby === 'village' ? 'In the village beta' : 'In the old lobby') : 'Your lobby'}</span>
      ${r.locked ? `<input id="coop-room-pass" type="password" maxlength="64" placeholder="Password" autocomplete="off"
        aria-label="The room's password" value="${esc(form.joinPassword)}"${open ? '' : ' disabled'}>` : ''}
    </div>`;
  return `<li class="coop-room-row${picked ? ' picked' : ''}${full ? ' full' : ''}" data-code="${esc(r.code)}">
    <button class="coop-room-pick" data-code="${esc(r.code)}" aria-expanded="${picked}">
      <span class="coop-room-host"><span class="coop-cls"${dot}>${esc((cls?.name ?? '?').slice(0, 1))}</span>
        <span class="coop-room-names"><b>${esc(r.tag)}</b><small>${esc(r.name)}</small></span>${
        r.locked ? '<span class="coop-lock" title="Needs a password" aria-label="Needs a password">&#128274;</span>' : ''}</span>
      <span class="coop-room-map">${esc(biomeLabel(r.map))}<small>${esc(where)}</small></span>
      <span class="coop-room-size">${pipsHtml(r)}<span>${r.players}/${r.max}</span></span>
    </button>${join}${detail}</li>`;
}

/** The browser's page: its filters and the public rooms, or why there are none. */
function browseHtml(open: boolean): string {
  const shown = shownRooms();
  const maps = [['', 'All maps'], ...BIOME_IDS.map((id) => [id, BIOMES[id].label])]
    .map(([id, label]) => `<button class="coop-chip${form.map === id ? ' on' : ''}" data-map="${id}" aria-pressed="${form.map === id}">${esc(label)}</button>`)
    .join('');
  const empty = rooms === 'loading' ? 'Looking for rooms…'
    : rooms === null ? 'The list of rooms couldn\'t be read. Join a friend by their code below.'
    : Array.isArray(rooms) && rooms.length && !shown.length ? 'No rooms match. Clear the search or the filters.'
    : 'No public rooms right now. Create one, and it shows here for anyone.';
  return `<div class="coop-tools">
      <input id="coop-search" type="search" placeholder="Search host, room or map" value="${esc(form.search)}" aria-label="Search the rooms" autocomplete="off" spellcheck="false">
      <div class="coop-chips">${maps}<button class="coop-chip${form.notFull ? ' on' : ''}" data-notfull aria-pressed="${form.notFull}">Not full</button>
      <button class="coop-chip coop-refresh" aria-label="Refresh the list" title="Refresh">&#8635;</button></div>
    </div>
    <div class="coop-rooms-head" aria-hidden="true"><span>Host</span><span>Map</span><span>Players</span><span></span></div>
    <ul class="coop-rooms">${shown.length ? shown.map((r) => roomRowHtml(r, open)).join('') : `<li class="coop-rooms-empty">${esc(empty)}</li>`}</ul>`;
}

/** The create page: what kind of room, its name, its password, how many it holds, and Open the room. */
function createHtml(open: boolean, tag: string): string {
  const kinds = KINDS.map((k) => `<button class="coop-kind${form.kind === k.kind ? ' on' : ''}" data-kind="${k.kind}" role="radio" aria-checked="${form.kind === k.kind}">
      <b>${k.label}</b><small>${k.says}</small></button>`).join('');
  const sizes = [2, 3, 4].map((n) => `<button class="coop-size${form.max === n ? ' on' : ''}" data-max="${n}" role="radio" aria-checked="${form.max === n}">${n}</button>`).join('');
  return `<div class="coop-kinds" role="radiogroup" aria-label="Kind of room">${kinds}</div>
    <label class="coop-field"><span>Room name</span>
      <input id="coop-room-name" maxlength="${ROOM_NAME_MAX}" placeholder="${esc(tag ? `${tag}'s room` : 'Your room')}" value="${esc(form.name)}" autocomplete="off" spellcheck="false"${open ? '' : ' disabled'}></label>
    ${form.kind === 'password' ? `<label class="coop-field"><span>Password</span>
      <input id="coop-room-password" type="password" maxlength="64" placeholder="What your friends type to join" value="${esc(form.password)}" autocomplete="new-password"${open ? '' : ' disabled'}></label>
      <p class="coop-pass-note hidden" role="alert"></p>` : ''}
    <div class="coop-sizes-row"><span>Players</span><div class="coop-sizes" role="radiogroup" aria-label="Players">${sizes}</div></div>
    <p class="coop-intro">${form.kind === 'public' ? 'Anyone can find it in Browse rooms and join.'
      : form.kind === 'private' ? 'Only someone with its code or invite link can join.'
      : 'Listed for anyone, but only those with the password can join.'}</p>
    <button class="btn primary${pressed === 'host' ? ' pressed' : ''}" id="btn-coop-host"${open ? '' : ' disabled'}>${pressed === 'host' ? 'Opening a room…' : 'Open the room'}</button>`;
}

/** The dialog's status line over its pages: the server's state, the press waiting, or what went wrong (a password
 *  asked for, with its field; the room's lobby, with the switch). */
function statusHtml(s: string, code: string): string {
  if (server === 'down') return `<div class="coop-offline" role="status"><p>${esc(SERVER_DOWN)}</p><button class="btn" id="btn-coop-retry">Try again</button></div>`;
  if (server === 'checking') return '<p class="coop-checking" role="status">Checking the co-op server…</p>';
  if (pressed) {
    return `<p class="coop-checking" role="status">Getting co-op ready, then ${pressed === 'host' ? 'opening a room'
      : `joining room <b>${esc(code.trim().toUpperCase())}</b>`}…</p>`;
  }
  if (s !== 'failed') return '';
  const pass = session.passwordAsked ? `<form class="coop-pass-ask"><input id="coop-pass" type="password" maxlength="64"
      placeholder="Room ${esc(session.code)}'s password" aria-label="The room's password" autocomplete="off">
      <button class="btn primary" type="submit">Join</button></form>` : '';
  return `<p class="coop-error" role="alert">${esc(session.error)}</p>${pass}${lobbySwitchHtml()}`;
}

/** The dialog out of a room: tabs over the rooms browser and the create page, the player's hero beside them (a tab
 *  of its own on a small screen), and Quick join and Join by code along its foot. */
function renderOutOfRoom(body: HTMLElement, s: string): void {
  const up = server === 'up';
  const busy = pressed !== null;
  const open = up && !busy;
  // (asked to rename: the tag that was taken, picked for retyping, and the room's code kept to join again)
  const rename = s === 'failed' && session.renameAsked;
  const formKey = formFor(rename);
  if (typed.for !== formKey) {
    typed = { for: formKey, tag: null, code: null };
    // (asked to rename: the hero's page is where the tag is retyped, shown once as the refusal comes, then left to
    // the player's tabs)
    if (rename && window.matchMedia(SMALL).matches) pane = 'hero';
  }
  const code = typed.code ?? (invited || (rename || session.passwordAsked ? session.code : ''));
  const tagValue = typed.tag ?? (rename ? session.tag : savedTag());
  const typingIn = fieldTypedIn(body);
  const tabs = PANES.map((p) => `<button class="coop-tab coop-tab-${p.pane}${pane === p.pane ? ' on' : ''}" data-pane="${p.pane}" role="tab" aria-selected="${pane === p.pane}">${p.label}</button>`).join('');
  const quick = quickRoom();
  body.innerHTML = `
    ${headHtml(`<div class="coop-tabs" role="tablist">${tabs}</div>`)}
    ${statusHtml(s, code)}
    <div class="coop-main" data-pane="${pane}">
      <section class="coop-pane coop-browse${up ? '' : ' off'}">${browseHtml(open)}</section>
      <section class="coop-pane coop-create${up ? '' : ' off'}">${createHtml(open, cleanTag(tagValue))}</section>
      <aside class="coop-pane coop-hero">
        <label class="coop-tag${rename ? ' taken' : ''}${up ? '' : ' off'}"><span>Your name tag</span>
          <input id="coop-tag" maxlength="${TAG_MAX}" value="${esc(tagValue)}" placeholder="Name" autocomplete="nickname" spellcheck="false" enterkeyhint="done"${open ? '' : ' disabled'}></label>
        <p class="coop-tag-note${tagNote ? '' : ' hidden'}" role="alert">${esc(tagNote)}</p>
        ${colourPickerHtml(true)}
        ${portraitPickerHtml()}
        <p class="coop-intro">Up to ${COOP.maxPlayers} heroes, each with their own gear and spoils. Starting over together? <button class="link coop-saves">Pick an empty save slot</button> first.</p>
      </aside>
    </div>
    ${footHtml(`<button class="btn coop-quick"${open && quick ? '' : ' disabled'} title="${quick ? 'Join the fullest open public room' : 'No open public room to join'}">Quick join</button>`,
      `<form class="coop-join"><input id="coop-code" maxlength="8" placeholder="ROOM CODE" value="${esc(code)}" autocomplete="off" spellcheck="false" aria-label="Room code"${open ? '' : ' disabled'}><button class="btn${pressed === 'join' ? ' pressed' : ''}" type="submit"${open ? '' : ' disabled'}>${pressed === 'join' ? 'Joining…' : 'Join'}</button></form>`,
      `${up ? '' : ' off'}${busy ? ' busy' : ''}`, busy ? ' aria-busy="true"' : '')}`;
  bindOutOfRoom(body, { open, rename, typingIn });
}

/** the screens where the hero has a tab of its own, not a column beside the rooms (as `_coop.scss` lays it out) */
const SMALL = '(max-width: 760px), (max-height: 520px)';

/** The room asked for by name tag (said under it and its page shown if it can't be used): hosted with `plan`, or
 *  joined at `code` with `password`. */
function ask(body: HTMLElement, which: 'host' | 'join', go: (tag: string) => void): void {
  if (server !== 'up' || pressed) return;
  const tag = typedTag(body);
  if (tag === null) {
    // (the tag's field is on the hero's page on a small screen: shown, so the note under it is seen)
    if (window.matchMedia(SMALL).matches && pane !== 'hero') { pane = 'hero'; renderCoop(); typedTag($('#coop .coop-body')); }
    return;
  }
  sfx.click();
  pressed = which;
  go(tag);
  // (still cold: the room is asked for once the heroes are warm, and the dialog says it's waiting meanwhile)
  if (pressed) renderCoop();
}

function bindOutOfRoom(body: HTMLElement, { open, rename, typingIn }: {
  open: boolean; rename: boolean; typingIn: ReturnType<typeof fieldTypedIn>;
}): void {
  bindReportLinks(body);
  bindColourPicker(body);
  bindPortraitPicker(body, renderCoop);
  const field = <T extends HTMLElement = HTMLInputElement>(id: string): T | null => body.querySelector<T>(`#${id}`);
  for (const tab of body.querySelectorAll<HTMLElement>('.coop-tab')) {
    tab.onclick = () => { sfx.click(); pane = tab.dataset.pane as Pane; renderCoop(); };
  }
  // the browser: its filters, a room picked, its Join
  const search = field('coop-search');
  if (search) search.oninput = () => { form.search = search.value; renderCoop(); };
  for (const chip of body.querySelectorAll<HTMLElement>('.coop-chip[data-map]')) {
    chip.onclick = () => { sfx.click(); form.map = chip.dataset.map as BiomeId | ''; renderCoop(); };
  }
  const notFull = body.querySelector<HTMLElement>('.coop-chip[data-notfull]');
  if (notFull) notFull.onclick = () => { sfx.click(); form.notFull = !form.notFull; renderCoop(); };
  const refresh = body.querySelector<HTMLElement>('.coop-refresh');
  if (refresh) refresh.onclick = () => { sfx.click(); void readRooms(); };
  for (const row of body.querySelectorAll<HTMLElement>('.coop-room-pick')) {
    row.onclick = () => {
      sfx.click();
      const code = row.dataset.code!;
      if (form.picked !== code) form.joinPassword = '';
      form.picked = form.picked === code ? '' : code;
      renderCoop();
      body.querySelector<HTMLInputElement>('#coop-room-pass')?.focus();
    };
  }
  const roomPass = field('coop-room-pass');
  if (roomPass) {
    roomPass.oninput = () => { form.joinPassword = roomPass.value; };
    roomPass.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); joinListed(body, form.picked); } };
  }
  for (const button of body.querySelectorAll<HTMLElement>('.coop-room-join')) {
    button.onclick = () => joinListed(body, button.dataset.code!);
  }
  const quick = body.querySelector<HTMLElement>('.coop-quick');
  if (quick) quick.onclick = () => { const r = quickRoom(); if (r) ask(body, 'join', (tag) => join(r.code, tag, '')); };
  // the create page
  for (const kind of body.querySelectorAll<HTMLElement>('.coop-kind')) {
    kind.onclick = () => { sfx.click(); form.kind = kind.dataset.kind as RoomKind; renderCoop(); };
  }
  for (const size of body.querySelectorAll<HTMLElement>('.coop-size')) {
    size.onclick = () => { sfx.click(); form.max = Number(size.dataset.max); renderCoop(); };
  }
  const name = field('coop-room-name');
  if (name) name.oninput = () => { form.name = name.value; };
  const password = field('coop-room-password');
  if (password) password.oninput = () => { form.password = password.value; };
  const hostButton = field<HTMLElement>('btn-coop-host');
  if (hostButton) hostButton.onclick = () => {
    if (form.kind === 'password' && !form.password) {
      const note = body.querySelector<HTMLElement>('.coop-pass-note');
      if (note) { note.textContent = 'Type a password for the room.'; note.classList.remove('hidden'); }
      password?.focus();
      return;
    }
    ask(body, 'host', (tag) => host(tag, { kind: form.kind, name: form.name, max: form.max, password: form.password }));
  };
  // the hero: the name tag
  const tagField = field('coop-tag');
  const codeField = field('coop-code')!;
  if (tagField) {
    // (what's typed kept for the dialog's next render)
    tagField.oninput = () => { typed.tag = tagField.value; };
    // (Enter in the name tag: join with the code if there is one, else just done typing)
    tagField.onkeydown = (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (codeField.value.trim().length >= 4) $<HTMLFormElement>('.coop-join', body).requestSubmit();
      else tagField.blur();
    };
  }
  codeField.oninput = () => { typed.code = codeField.value; };
  // the field typed in still typed in, its caret where it was; else asked to rename, its taken tag picked to retype
  const typingBack = typingIn && body.querySelector<HTMLInputElement>(`#${typingIn.id}`);
  if (typingBack && !typingBack.disabled) {
    typingBack.focus();
    if (typingIn.from !== null && typingBack.type !== 'search') typingBack.setSelectionRange(typingIn.from, typingIn.to);
  } else if (rename && open && typed.tag === null && tagField) {
    tagField.focus();
    tagField.select();
  } else if (session.passwordAsked && open) field('coop-pass')?.focus();
  const retry = field<HTMLElement>('btn-coop-retry');
  if (retry) retry.onclick = () => { sfx.click(); void checkServer(); };
  const toLobby = field<HTMLElement>('btn-coop-lobby');
  if (toLobby) toLobby.onclick = () => reloadWithVillage(session.lobbyAsked === true, session.code);
  const saves = body.querySelector<HTMLElement>('.coop-saves');
  if (saves) saves.onclick = () => { sfx.click(); openCoop(false); openSaves(true); };
  $<HTMLFormElement>('.coop-join', body).onsubmit = (e) => {
    e.preventDefault();
    const room = codeField.value.trim();
    if (room.length < 4) return;
    ask(body, 'join', (tag) => join(room, tag, ''));
  };
  const passAsk = body.querySelector<HTMLFormElement>('.coop-pass-ask');
  if (passAsk) passAsk.onsubmit = (e) => {
    e.preventDefault();
    const pw = field('coop-pass')!.value;
    if (!pw) return;
    ask(body, 'join', (tag) => join(session.code, tag, pw));
  };
}

/** A listed room joined from its row, with the password typed under it where it's locked (asked for if none is). */
function joinListed(body: HTMLElement, code: string): void {
  const room = Array.isArray(rooms) ? rooms.find((r) => r.code === code) : undefined;
  if (!room) return;
  if (room.locked && form.picked === code && !form.joinPassword) {
    body.querySelector<HTMLInputElement>('#coop-room-pass')?.focus();
    return;
  }
  if (room.locked && form.picked !== code) {
    form.picked = code;
    form.joinPassword = '';
    renderCoop();
    body.querySelector<HTMLInputElement>('#coop-room-pass')?.focus();
    return;
  }
  ask(body, 'join', (tag) => join(code, tag, room.locked ? form.joinPassword : ''));
}

/** The lobby's line about the room (hidden solo). */
function renderBar(): void {
  const bar = $('#coop-bar');
  bar.classList.toggle('hidden', session.status === 'off' || session.status === 'failed');
  const others = partners();
  const text = session.status === 'joining' ? `Joining room ${session.code}…`
    : session.opening ? 'Opening the room…'
    : others.length ? `With ${others.map(nameOf).join(', ')}` : 'Waiting for a friend…';
  bar.innerHTML = `<span class="cb-room">Room <b>${esc(session.code)}</b></span><span class="cb-who">${esc(text)}</span>`;
  bar.onclick = () => { sfx.click(); openCoop(true); };
  if (!VILLAGE) $('#btn-coop').textContent = isCoop() ? 'Room' : 'Play together';
}

// --- name tags over the heroes ----------------------------------------------------------------
/** A player's name tag over their head (their life under it), and the step of its bar it was last painted at. */
interface NameTag { label: Label; shown: number }
const nameTags = new Map<Player, NameTag>();

/**
 * Whether a player's tag shows: in a room, in the lobby and in a run, every player's, our own too ("name tags should
 * be visible above other players in lobby, and above me as well"); not over one away in the other place, hidden (the
 * hall of heroes hides them), fallen, or our own through our eyes once the camera is there (as it glides in, the
 * hero is still in sight: hidden from the glide's start, its tag was gone over him for 16 frames, `lab coop`'s `ping`).
 */
const tagShows = (p: Player): boolean => isCoop() && G.players.includes(p) && !p.away && p.obj.visible && p.alive
  && !(p.local && lookFacing() !== null && viewSettled());

function nameTagFor(p: Player): NameTag {
  let t = nameTags.get(p);
  if (t) return t;
  const label = anchorLabel(ORDER.tag, () => (tagShows(p)
    ? { x: p.pos.x, y: p.obj.position.y + p.model.height + 0.45, z: p.pos.z } : null));
  t = { label, shown: -1 };
  nameTags.set(p, t);
  return t;
}

/** Every frame: each player's name tag in a room, painted again when its name or its bar's step changes. */
export function updateNameTags(): void {
  for (const [p, t] of nameTags) {
    if (isCoop() && G.players.includes(p)) continue;
    removeLabel(t.label);
    nameTags.delete(p);
  }
  if (!isCoop()) return;
  for (const p of G.players) {
    const t = nameTagFor(p);
    const share = Math.max(0, p.life / p.stats.maxLife);
    const look = { ...ALLY_BAR, name: nameOf(p), nameStyle: ALLY_NAME };
    const step = barStep(look, share);
    if (step !== t.shown) {
      t.shown = step;
      t.label.show(barArt(look, share));
    }
  }
}

/** The players' name tags as drawn this frame (`lab coop` holds them to every hero shown). */
export function nameTagLabels(): { player: Player; label: Label }[] {
  return [...nameTags].map(([player, t]) => ({ player, label: t.label }));
}

// --- in a run ------------------------------------------------------------------------------
/** A partner's frame in the corner. */
interface Tag {
  frame: HTMLElement; frameFill: HTMLElement; state: HTMLElement; portrait: HTMLElement;
  /** the player's Health at the last sample and when (game time), and until when the frame shows them healed */
  life: number; lifeAt: number; healedUntil: number;
}
/** A player is shown being healed (a green + over their portrait, or their frame's corner with none, and their bar
 *  lit) once their Health has risen by this share of their most within `over` s, for `shown` s after: a draught's
 *  jump and a healing beam's flow both pass it, their own regeneration never does (from play: "overlay + on the
 *  portrait and some healing animation while they are healed, should apply to both potion heal and mage staff
 *  heal"). Read off the Health each game is told, so it needs nothing sent. */
const HEALED = { share: 0.02, over: 0.5, shown: 1.2 };
const tags = new Map<Player, Tag>();
/** the marker on a downed partner (over them, or at the screen's edge pointing the way to them), and in reach of
 *  them, the prompt to raise them */
let downMark: Label | null = null;
let raisePrompt: HTMLElement | null = null;
/** the downed partner the marker is placed for this frame, and whether we're in reach of them */
let marked: { downed: Player; near: boolean } | null = null;
/** the whole seconds the marker last showed, so it beats as each one goes */
let shownSecond = -1;
/** how high over a downed body its marker floats, m (lower, it hid the body from the top-down view) */
const MARK_HEIGHT = 2.1;
/** the seconds left from which the marker beats harder */
const HURRY = 8;

/** how far in from the screen's edges a downed partner's marker's ring stays (px, at the HUD's scale): its arrow clear
 *  of the hotbar and the wave's badge */
const EDGE = { side: 80, top: 120, bottom: 185 };
/** the ring's radius (px, at the HUD's scale): the marker is placed by its ring's middle */
const RING = 38;

function markFor(): Label {
  if (downMark) return downMark;
  downMark = new Label(ORDER.marker);
  downMark.shown = false;
  // (placed after the camera has moved, with the rest of the labels)
  onLayout(placeMark);
  return downMark;
}

function promptFor(): HTMLElement {
  if (raisePrompt) return raisePrompt;
  const el = document.createElement('div');
  el.className = 'rvprompt hidden';
  el.innerHTML = '<div class="rp-line"><kbd>E</kbd><span>Hold to revive</span></div><div class="rp-bar"><div></div></div>';
  $('#hud').appendChild(el);
  raisePrompt = el;
  return el;
}

/** In reach of a downed partner (keyboard and mouse: touch has its button), the prompt to hold E, and the revive. */
function promptRaise(downed: Player | undefined, near: boolean): void {
  const el = promptFor();
  const shown = !!downed && near && !isTouch();
  el.classList.toggle('hidden', !shown);
  if (!shown) return;
  $('span', el).textContent = downed.revive > 0 ? `Reviving ${nameOf(downed)}…` : `Hold to revive ${nameOf(downed)}`;
  $('.rp-bar div', el).style.width = `${(downed.revive * 100).toFixed(0)}%`;
}

/** when the marker last beat (s, the page's clock: CSS's animation ran on it), and whether that beat was a hurried one */
let beatAt = -Infinity, hurried = false;
/** a beat's length (s) */
const BEAT = 0.8;
const reduceMotion = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

/** The marker beats once as each second of a downed partner's clock goes, harder near its end (a heartbeat). */
function beat(second: number): void {
  if (second === shownSecond) return;
  const first = shownSecond < 0;
  shownSecond = second;
  if (first) return;
  beatAt = performance.now() / 1000;
  hurried = second <= HURRY;
}

/** A heartbeat's swell at `k` (0 to 1) through it, peaking at `big`: two pulses, the second smaller. */
function heartbeat(k: number, big: number): number {
  const keys: [number, number][] = [[0, 1], [0.12, big], [0.26, 1], [0.4, 1 + (big - 1) * 0.6], [0.6, 1], [1, 1]];
  for (let i = 1; i < keys.length; i++) {
    const [k0, s0] = keys[i - 1], [k1, s1] = keys[i];
    if (k <= k1) {
      const t = (k - k0) / (k1 - k0), eased = 1 - (1 - t) * (1 - t);
      return s0 + (s1 - s0) * eased;
    }
  }
  return 1;
}

/** Which partner is down for the marker, and whether we're in reach (its look and place are set with the labels). */
function markDowned(downed: Player | undefined, near: boolean): void {
  markFor();
  marked = downed ? { downed, near } : null;
  if (!downed) shownSecond = -1;
}

const DOWN_RED = '#ff2a1e';
const WHAT: TextStyle = { face: 'display', size: 18, color: '#ff6a5a', spacing: 0.5, shadows: OUTLINE };
const FAR: TextStyle = { face: 'body', size: 15, color: '#ffd8d0', shadows: OUTLINE };
const SECONDS: TextStyle = { face: 'display', size: 32, color: '#fff0ec', shadows: OUTLINE };

/**
 * A downed partner's marker, every frame: over them where the view shows them, else at the screen's edge on the way to
 * them with an arrow pointing there; their clock running out round its ring, the revive filling it, how far they are.
 * (A small ring over the body alone was lost from sight as soon as the body was off screen.)
 */
function placeMark(): void {
  const mark = downMark!;
  mark.shown = !!marked;
  if (!marked) return;
  const { downed, near } = marked;
  const me = G.player;
  const { x, y, inView, turn, bottom } = onScreenOrEdge(downed.pos.x, downed.obj.position.y + MARK_HEIGHT, downed.pos.z, EDGE);
  // (pointing down, its words go above the ring, out of the arrow's way)
  const above = !inView && Math.abs(y - bottom) < 1;
  const bleedLeft = Math.max(0, downed.bleed);
  const second = Math.ceil(bleedLeft);
  // (while someone raises them their clock stops, and so does the beat)
  if (downed.revive <= 0) beat(second);
  const what = near ? (isTouch() ? 'Hold Revive' : 'Hold E') : downed.revive > 0 ? 'Being raised' : `${nameOf(downed)} is down`;
  const far = `${Math.round(Math.hypot(downed.pos.x - me.pos.x, downed.pos.z - me.pos.z))} m`;
  const since = performance.now() / 1000 - beatAt;
  const beating = downed.revive <= 0 && since < BEAT;
  const big = hurried ? 1.3 : 1.16, swell = beating ? heartbeat(since / BEAT, big) : 1;
  const art = markArt({
    left: bleedLeft / COOP.bleedOut, raised: downed.revive, second, what, far, above, edge: !inView, turn,
    // (with reduced motion, the glow alone beats)
    scale: reduceMotion?.matches ? 1 : swell, glow: (swell - 1) / (big - 1),
  });
  mark.show(art);
  mark.x = x;
  mark.y = y;
  mark.ax = 0.5;
  mark.ay = art.ringY / art.h;
}

/** What the marker shows: the share of the clock left and of the revive done, its words, and how it's placed
 *  (`above`: its words over the ring; `edge`: the arrow turned `turn` towards them), its beat's swell. */
interface MarkLook {
  left: number; raised: number; second: number; what: string; far: string;
  above: boolean; edge: boolean; turn: number; scale: number; glow: number;
}

/** The marker's art, and where its ring's middle is down it (px of the UI's reference layout: the labels are drawn
 *  at the HUD's scale). */
function markArt(m: MarkLook): { w: number; h: number; ringY: number; paint(c: CanvasRenderingContext2D, s: number): void } {
  const R = RING, reach = 68 + 8;
  const what = measure(m.what, WHAT), far = measure(m.far, FAR);
  const gap = 2, words = what.h + far.h + gap, pad = 8;
  const box = reach * 2, w = Math.max(box, what.w + pad * 2, far.w + pad * 2);
  const h = box + words + pad;
  const ringY = m.above ? h - box / 2 : box / 2;
  return {
    w, h, ringY,
    paint(c, s) {
      const cx = w / 2, cy = ringY;
      if (m.edge) {
        // the arrow: out past the ring towards them
        c.save();
        c.translate(cx, cy);
        c.rotate(m.turn);
        c.shadowColor = 'rgba(0,0,0,.85)';
        c.shadowBlur = 5 * s;
        c.fillStyle = DOWN_RED;
        c.beginPath();
        c.moveTo(46, -14);
        c.lineTo(68, 0);
        c.lineTo(46, 14);
        c.closePath();
        c.fill();
        c.restore();
      }
      c.save();
      c.translate(cx, cy);
      c.scale(m.scale, m.scale);
      // its glow, stronger at the beat's peak, and a dark rim round it
      c.fillStyle = 'rgba(40,0,0,.6)';
      c.shadowColor = `rgba(255,42,30,${0.7 + 0.3 * m.glow})`;
      c.shadowBlur = (18 + 12 * m.glow) * s;
      c.beginPath();
      c.arc(0, 0, R, 0, Math.PI * 2);
      c.fill();
      c.shadowColor = '#000';
      c.shadowBlur = 4 * s;
      c.fill();
      c.shadowColor = 'transparent';
      c.shadowBlur = 0;
      // the clock: red from the top round as much as is left
      if (m.left > 0) {
        c.fillStyle = DOWN_RED;
        c.beginPath();
        c.moveTo(0, 0);
        c.arc(0, 0, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, m.left));
        c.closePath();
        c.fill();
      }
      // the dark face inside it
      const r = R - 7, face = c.createRadialGradient(0, 0, 0, 0, 0, r * Math.SQRT2);
      face.addColorStop(0, '#5a0a06');
      face.addColorStop(0.75, '#1c0403');
      c.fillStyle = face;
      c.beginPath();
      c.arc(0, 0, r, 0, Math.PI * 2);
      c.fill();
      // the revive filling a gold band round the face's edge
      if (m.raised > 0) {
        const inner = r * 0.86;
        c.strokeStyle = '#ffe6a0';
        c.lineWidth = r - inner;
        c.beginPath();
        c.arc(0, 0, (r + inner) / 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, m.raised));
        c.stroke();
      }
      c.restore();
      // the seconds in the middle, and the words under the ring (over it at the bottom edge)
      const sec = measure(String(m.second), SECONDS);
      drawText(c, sec, cx - sec.w / 2, cy - sec.h / 2, SECONDS, s);
      // (over it, the column turned round as the page's was: the distance on top, the words next to the ring)
      const top = m.above ? cy - R - gap - words : cy + R + gap;
      const whatY = m.above ? top + far.h + gap : top, farY = m.above ? top : top + what.h + gap;
      drawText(c, what, cx - what.w / 2, whatY, WHAT, s);
      drawText(c, far, cx - far.w / 2, farY, FAR, s);
    },
  };
}

function tagFor(p: Player): Tag {
  let t = tags.get(p);
  if (t) return t;
  const frame = document.createElement('div');
  frame.className = p.local ? 'pf self' : 'pf';
  frame.setAttribute('aria-label', who(p));
  frame.style.setProperty('--class-colour', p.cls.accent);
  frame.innerHTML = `<span class="pf-portrait${p.slot === 0 ? ' host' : ''}"${p.slot === 0 ? ' role="img" aria-label="Host" title="Host"' : ''} hidden></span><div class="pf-content"><div class="pf-heading"><span class="pf-name">${esc(nameOf(p))}</span><span class="pf-class">${esc(p.cls.name)}</span></div><div class="pf-bar"><div class="pf-fill"></div><div class="pf-mend"></div></div><div class="pf-state"></div></div><div class="pf-plus">+</div>`;
  if (p.local) $('#party').prepend(frame);
  else $('#party').appendChild(frame);
  t = { frame, frameFill: $('.pf-fill', frame), state: $('.pf-state', frame), portrait: $('.pf-portrait', frame), life: p.life, lifeAt: G.time, healedUntil: -1 };
  tags.set(p, t);
  return t;
}

/** Every frame of a co-op run: the party frame, nameplates, the downed note and the revive prompt. */
export function updateCoopHud(): void {
  // partners gone from the room take their nameplate and frame with them
  for (const [p, t] of tags) if (!G.players.includes(p)) { t.frame.remove(); tags.delete(p); }
  if (!isCoop()) {
    for (const tag of tags.values()) tag.frame.remove();
    tags.clear();
    hideRunBits();
    return;
  }
  // out of the run and watching: our bars, skills and spoils have nothing more to show
  $('#hud').classList.toggle('watching', !!G.player.out);
  const others = G.players.filter((p) => !p.local);
  for (const p of [G.player, ...others]) {
    const t = tagFor(p);
    syncPortrait(t.portrait, p);
    const share = Math.max(0, p.life / p.stats.maxLife);
    t.frameFill.style.width = `${(share * 100).toFixed(1)}%`;
    // (on the host, a guest still readying the run it started: how far along, from its `rdy` reports)
    const ready = readyingOf(p);
    const state = ready !== null ? `Readying ${Math.round(ready * 100)}%` : p.away ? 'In the lobby' : p.out === 'banked' ? (G.run?.duel ? 'Watching' : G.run?.training ? 'Left training' : 'Banked') : p.out === 'dead' ? 'Fallen'
      : p.downed ? (p.revive > 0 ? 'Being revived…' : `Down · ${Math.ceil(p.bleed)}s`) : '';
    if (t.state.textContent !== state) t.state.textContent = state;
    t.frame.classList.toggle('down', p.downed);
    t.frame.classList.toggle('out', !!p.out || p.away || ready !== null);
    t.frame.classList.toggle('readying', ready !== null);
    if (p.life - t.life > p.stats.maxLife * HEALED.share) t.healedUntil = G.time + HEALED.shown;
    if (G.time - t.lifeAt > HEALED.over || p.life < t.life) { t.life = p.life; t.lifeAt = G.time; }
    t.frame.classList.toggle('healed', G.time < t.healedUntil && p.inRun && !p.downed);
  }


  // down: how long is left, and that a teammate can help
  const me = G.player;
  const note = $('#down-note');
  const down = me.downed && !me.out;
  note.classList.toggle('hidden', !down);
  if (down) {
    const raiser = others.find((p) => p.reviving && Math.hypot(p.pos.x - me.pos.x, p.pos.z - me.pos.z) < COOP.reviveRange);
    note.innerHTML = `<b>You are down</b><span>${me.revive > 0 ? `${esc(raiser ? nameOf(raiser) : 'A teammate')} is raising you…` : `Bleeding out in ${Math.ceil(me.bleed)}s. A teammate can revive you.`}</span>
      <div class="dn-bar"><div style="width:${(me.revive * 100).toFixed(0)}%"></div></div>`;
  }

  // watching the rest of the run: who, and the controls (game/spectate.ts)
  const watching = !!me.out && !!G.run && G.run.phase !== 'over' && others.some((p) => p.inRun);
  const spec = $('#spectate');
  spec.classList.toggle('hidden', !watching || !$('#summary').classList.contains('hidden'));
  if (watching) sayWatching(spec);

  // a downed partner: the marker on the nearest (or at the screen's edge), and on touch the button to hold
  const downed = me.active ? nearestDowned(others) : undefined;
  const near = !!downed && Math.hypot(downed.pos.x - me.pos.x, downed.pos.z - me.pos.z) < COOP.reviveRange;
  markDowned(downed, near);
  promptRaise(downed, near);
  const rv = $('#btn-revive');
  rv.classList.toggle('hidden', !(near && isTouch()));
  if (!near) touchRevive = false;
}

/** The nearest partner down in the run (a party of four may have more than one). */
function nearestDowned(others: Player[]): Player | undefined {
  const me = G.player;
  const far = (p: Player): number => Math.hypot(p.pos.x - me.pos.x, p.pos.z - me.pos.z);
  return others.filter((p) => p.downed && p.inRun).sort((a, b) => far(a) - far(b))[0];
}

/** The run's co-op bits taken off as the lobby is entered: `updateCoopHud` runs in a run alone, and the HUD kept its
 *  watching look (its bars and skills hidden) through the lobby's practice after a run the player left. */
export function hideRunBits(): void {
  $('#hud').classList.remove('watching');

  $('#down-note').classList.add('hidden');
  $('#spectate').classList.add('hidden');
  $('#btn-revive').classList.add('hidden');
  marked = null;
  raisePrompt?.classList.add('hidden');
  shownSecond = -1;
}

/** The decision panel's line about the partners: who is still deciding, who continues, who left. */
export function partyDecision(): string {
  if (!isCoop() || !G.run) return '';
  const r = G.run;
  const rows = G.players.filter((p) => !p.local && !p.away).map((p) => {
    const s = p.out === 'banked' ? (r.training ? 'left training' : 'banked and left') : p.out === 'dead' ? 'fell' : r.votes.has(p.slot) ? 'continues' : 'is deciding…';
    return `${nameOf(p)} (${p.slot === 0 ? 'host, ' : ''}${p.cls.name}) ${s}`;
  });
  return rows.join(' · ');
}

/** Waiting on the others after choosing Continue. */
export const waitingForParty = (): boolean => !!G.run && isCoop() && G.run.votes.has(G.player.slot);

