// Co-op sessions: hosting or joining a room, the shared lobby, and the players' own state.
// Every game reports its own player (position, aim, life, casts, the hits it took) to the others,
// in the lobby and in a run, each message stamped with its clock; the host's game also reports the
// fight (net/sync). Each partner's reports are played out on its own timeline (net/timeline), a
// little behind the freshest, so its character moves smoothly and casts in step with its body
// whatever the link's jitter. The host hands out the party slots (0 is the host) and starts the
// runs. Built for up to COOP.maxPlayers.
import { G } from '../state';
import { COOP } from '../data/balance';
import { CLASSES } from '../data/classes/index';
import { BIOME_IDS, type BiomeId } from '../data/biomes';
import { Player, setActionSink, type PlayerAction } from '../entities/player';
import { openLink, ServerDown, SERVER_DOWN, type Link } from './transport';
import { netLog, serverPings } from './netlog';
import { mine, freshNumbers, type RunNumbers } from '../game/stats';
import { readying, role } from './role';
import { VILLAGE } from '../core/beta';
import { ownOffset, setHostOffset } from '../game/clock';
import { hostSync, stopSync, onWorld, onGuestControl, sendWorld, playWorld, onGuestHits, takeHits, foesAsked, foesTold, setFoeAsk, type HitReport, type SpawnEvent, type WorldMessage } from './sync';
import { Playout, Smoother, Timeline, Track, type Pose } from './timeline';
import { portraitOf, receivePortrait } from './portraits';
import { cleanTag, sameTag, saveTag, tagProblem } from './nameTag';
import { changedColour, colourOf, freeColour, ownColour, saveColour, savedColour, setRoomColour, roomColoursOf } from './heroColour';
import type { HeroColourId } from '../data/heroColours';
import { setGroundNet, addDrop, removeDrop, receiveItem, groundDrops, clearGround, type GroundDrop } from '../game/groundItems';
import { setPingNet, pingHeard, clearPings } from '../game/ping';
import { showBiomeSetting } from '../game/biome';

import { setChatNet, chatHeard, chatNote, clearChat } from './chat';

import type { Profile } from '../types';

/** bumped when messages or the playable roster change: incompatible games don't play together */
const PROTOCOL = 31;
/** how long a guest waits for the host before giving up (s) */
const JOIN_TIMEOUT = 25;
/** the most foes a guest may ask about at once (the arena never holds more than this many) */
const ASKED_MOST = 64;
/** room codes: no look-alike letters or digits */
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** A player's class and gear, which is all another game needs to show them. */
export interface Look { cls: string; eq: Profile['equipped']; av?: string | null }

export type SessionStatus = 'off' | 'hosting' | 'joining' | 'joined' | 'failed';

/** A partner: its slot and character, and its reports as they're played out (its clock, where its character is, what
 *  it did). */
interface Peer {
  id: string; slot: number; player: Player | null; look: Look | null; inRun: boolean;
  /** its player's name tag (net/nameTag) */
  tag: string;
  /** the colour its hero wears (net/heroColour: the host gave it) */
  colour: HeroColourId | null;
  /** sent the start of a run and not yet in it: readying it (the host's countdown holds for it) */
  readying: boolean;
  /** its run in numbers and its round trips to the server, as it reports them (the scoreboard) */
  numbers: RunNumbers; rtt: number | null; pings: number[];
  clock: Timeline; track: Track<StateMsg>; smooth: Smoother; actions: Playout<PlayerAction>;
}

/** What the rest of the game does when the session changes (set by main). */
export interface SessionHooks {
  /** the host started a run: a guest starts its side of it */
  startRun(biome: BiomeId, wave: number, seed: number, training: boolean): void;
  /** the host left, or the room broke up */
  hostGone(): void;
  /** anything the lobby shows changed (status, partner, roster) */
  changed(): void;
}

export const session = {
  status: 'off' as SessionStatus,
  code: '',
  /** why joining failed */
  error: '',
  /** joining failed as the room already has our name tag: we're asked for another */
  renameAsked: false,
  /** joining failed as the room is in the other lobby (the village beta on there and off here, or the other way):
   *  whether the room's is the village, for the switch offered; null otherwise */
  lobbyAsked: null as boolean | null,
  /** the local player's name tag in the room (net/nameTag) */
  tag: '',
  /** the host's peer id, on a guest */
  hostId: '',
  /** the host's lobby choice, shown on a guest */
  biome: null as BiomeId | null,
  wave: 1,
  training: false,
  peers: new Map<string, Peer>(),
};

let link: Link | null = null;
let hooks: SessionHooks;
let joinTimer: ReturnType<typeof setTimeout> | undefined;
let sendT = 0;
/** when the local player's numbers go out next (s) */
let numbersT = 0;
/** the local player's actions since the last send, in order */
let actions: PlayerAction[] = [];
/** Host allocations can arrive before another guest's hello; keep them by slot until its body exists. */
let roomColours = new Map<number, HeroColourId>();
let colourRequest = 0;
let pendingColour: { id: HeroColourId | null; request: number } | null = null;

/** Change solo immediately, or ask the host to reserve an available party colour without leaving the room. */
export function chooseColour(id: HeroColourId | null): void {
  if (id !== null && !colourOf(id)) return;
  if (role.current === 'solo') {
    saveColour(id);
    G.player.setColour(ownColour());
    hooks.changed();
  } else if (role.current === 'host') {
    const current = ownColour()!;
    const next = changedColour([...session.peers.values()].map(p => p.colour), id, current);
    if (id === null || next === id) saveColour(id);
    wearRoomColour(next);
    publishColours();
    hooks.changed();
  } else if (session.status === 'joined') {
    pendingColour = { id, request: ++colourRequest };
    send('ctl', { t: 'colour?', col: id ?? '', request: colourRequest }, session.hostId);
  }
}

function publishColours(ack?: { slot: number; request: number }): void {
  const list = [{ slot: G.player.slot, col: ownColour()! },
    ...[...session.peers.values()].map(p => ({ slot: p.slot, col: p.colour! }))];
  roomColours = new Map(list.map(p => [p.slot, p.col]));
  send('ctl', { t: 'colours', list, ack });
}

function receiveColours(m: Record<string, unknown>): void {
  const next = roomColoursOf(m.list, COOP.maxPlayers);
  const mine = next?.get(G.player.slot);
  if (!next || !mine) return;
  roomColours = next;
  wearRoomColour(mine);
  for (const peer of session.peers.values()) {
    const colour = next.get(peer.slot);
    if (colour) {
      peer.colour = colour;
      if (peer.player) peer.player.setColour(colour);
      else makePlayer(peer);
    }
  }
  const ack = m.ack as { slot?: number; request?: number } | undefined;
  if (pendingColour && ack?.slot === G.player.slot && ack.request === pendingColour.request) {
    if (pendingColour.id === null || pendingColour.id === mine) saveColour(pendingColour.id);
    pendingColour = null;
  }
  hooks.changed();
}

export function initSession(h: SessionHooks): void {
  hooks = h;
  setFoeAsk((ids) => { if (session.hostId) send('ctl', { t: 'foes?', ids }, session.hostId); });
  setActionSink((a) => { if (link) actions.push(a); });
  window.addEventListener('pagehide', () => leaveRoom());
}

const newCode = (): string => Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

/** The invite link: this page with the room in it. */
export const inviteLink = (): string => {
  const u = new URL(location.href);
  u.search = '';
  u.searchParams.set('room', session.code);
  // (how this game links, so the guest's links the same way: `?net=local`, another relay server)
  const own = new URLSearchParams(location.search);
  for (const k of ['net', 'server']) { const v = own.get(k); if (v) u.searchParams.set(k, v); }
  return u.toString();
};

/** This page's address without an invite's room. */
function addressWithoutRoom(): string {
  const address = new URL(location.href);
  address.searchParams.delete('room');
  return `${address.pathname}${address.search}`;
}

/** A room code from the address bar (an invite link), if any. */
export function invitedRoom(): string | null {
  const c = new URLSearchParams(location.search).get('room');
  return c && /^[A-Z0-9]{4,8}$/i.test(c) ? c.toUpperCase() : null;
}

export const myLook = (): Look => ({ cls: G.profile.classId, eq: G.profile.equipped, av: portraitOf(G.player) });

/** Takes the local player's name tag for a room, kept for next time; false (the session failed, saying why) if it
 *  can't be used. */
function takeTag(typed: string): boolean {
  const tag = cleanTag(typed);
  const problem = tagProblem(tag);
  if (problem) {
    session.status = 'failed';
    session.error = problem;
    session.renameAsked = false;
    hooks.changed();
    return false;
  }
  session.tag = tag;
  saveTag(tag);
  return true;
}

// --- rooms -------------------------------------------------------------------------------
/** Opens a room with the local player as its host, named `tag`. */
export async function hostRoom(tag: string): Promise<void> {
  if (link) return;
  if (!takeTag(tag)) return;
  session.code = newCode();
  session.status = 'hosting';
  netLog(`hosting room ${session.code}`);
  session.error = '';
  session.renameAsked = false;
  session.lobbyAsked = null;
  role.current = 'host';
  G.player.slot = 0;
  wearRoomColour(freeColour([], savedColour()));
  placeSpawns();
  hooks.changed();
  try {
    link = await openLink(session.code);
  } catch (e) {
    netLog((e as Error).message);
    fail(e instanceof ServerDown ? SERVER_DOWN : `Couldn't open a room (${(e as Error).message})`);
    return;
  }
  wire(link);
  hostSync();
}

/** Joins room `code` as `tag` (the host refuses a tag the room already has: `session.renameAsked`). */
export async function joinRoom(code: string, tag: string): Promise<void> {
  if (link) leaveRoom();
  session.code = code.toUpperCase();
  if (!takeTag(tag)) return;
  session.status = 'joining';
  netLog(`joining room ${session.code}`);
  session.error = '';
  session.renameAsked = false;
  session.lobbyAsked = null;
  hooks.changed();
  try {
    link = await openLink(session.code);
  } catch (e) {
    netLog((e as Error).message);
    fail(e instanceof ServerDown ? SERVER_DOWN : `Couldn't reach the room (${(e as Error).message})`);
    return;
  }
  wire(link);
  clearTimeout(joinTimer);
  joinTimer = setTimeout(() => {
    if (session.status !== 'joining') return;
    fail('Nobody answered: check the code, or ask the host to open the room again.');
  }, JOIN_TIMEOUT * 1000);
}

/** Leave the room (the partners' characters go with it). */
export function leaveRoom(): void {
  clearTimeout(joinTimer);
  if (link) { link.send('ctl', { t: 'bye' }); link.leave(); }
  link = null;
  // the lobby floor is the host's: a guest leaving it leaves what's there (the host keeps it)
  if (session.status === 'joined') clearGround();
  setGroundNet(null);
  setChatNet(null);
  clearChat();
  for (const peer of session.peers.values()) dropPlayer(peer);
  session.peers.clear();
  roomColours.clear();
  pendingColour = null;
  syncReadying();
  session.status = 'off';
  session.hostId = '';
  session.biome = null;
  role.current = 'solo';
  setPingNet(null);
  clearPings();
  // (back in the colour picked, or the hero's own)
  wearRoomColour(null);
  stopSync();
  actions = [];
  G.player.slot = 0;
  placeSpawns();
  // (the village lit by our own clock again)
  setHostOffset(null);
  // (the panels' lobby back on its own battleground: a guest stood on the host's)
  if (!VILLAGE) showBiomeSetting();
  // an invite link in the address bar would join again on reload (the room alone taken off it: the rest is how
  // this game was opened, the relay tried by `?server=` among it, which the dialog's check of the server reads)
  if (invitedRoom()) history.replaceState(null, '', addressWithoutRoom());
  hooks?.changed();
}

function fail(why: string, rename = false): void {
  netLog(`failed: ${why}`);
  leaveRoom();
  session.status = 'failed';
  session.error = why;
  session.renameAsked = rename;
  session.lobbyAsked = null;
  hooks.changed();
}

function wire(l: Link): void {
  l.onJoin((peer) => {
    // a guest introduces itself to everyone it meets; the host answers with a slot
    if (role.current === 'guest' || session.status === 'joining') send('hello', hello(), peer);
  });
  l.onLeave((peer) => peerLeft(peer));
  l.onMessage((ch, data, from) => {
    const m = data as Record<string, unknown>;
    if (ch === 'hello') onHello(from, m);
    else if (ch === 'look') onLook(from, m as unknown as Look);
    else if (ch === 'pl') onState(from, m as unknown as StateMsg);
    else if (ch === 'ev') onActions(from, m as unknown as ActionsMsg);
    else if (ch === 'w') onFight(from, m as unknown as WorldMessage);
    else if (ch === 'dmg') onHits(from, m as unknown as HitReport[]);
    else if (ch === 'st') onNumbers(from, m as unknown as NumbersMsg);
    else if (ch === 'ctl') onControl(from, m);
  });
  if (session.status === 'joining') role.current = 'guest';
  // items on the lobby floor: every game shows them, the host says who got one first
  setGroundNet({
    dropped: (d) => send('ctl', { t: 'gdrop', d }),
    ask: (id) => {
      if (role.current !== 'guest' || !session.hostId) return false;
      send('ctl', { t: 'gtake', id }, session.hostId);
      return true;
    },
    taken: (id) => send('ctl', { t: 'gtaken', id, to: l.self }),
  });
  // a ping has no gameplay effect: every game sends its own to every other (game/ping.ts)
  setPingNet((m) => send('ctl', { t: 'ping', ...m }));
  // chat has no gameplay effect: every game sends its own to every other (net/chat.ts)
  setChatNet((text) => send('ctl', { t: 'chat', text }));
}

/** Who we are, to a game we meet: our slot is -1 until the host has given us one (another guest would take our 0 as
 *  the host's slot). */
const hello = () => ({
  v: PROTOCOL, look: myLook(), tag: session.tag, host: role.current === 'host', col: ownColour() ?? '',
  // (the lobby this game stands in: a room is its host's, the village beta's or the panels', core/beta.ts)
  village: VILLAGE,
  slot: session.status === 'joining' ? -1 : G.player.slot,
});

/** Whether `tag` is already someone else's in the room (the host's own, or a guest's), `from` aside. */
function tagTaken(tag: string, from: string): boolean {
  if (sameTag(tag, session.tag)) return true;
  return [...session.peers.values()].some((p) => p.id !== from && sameTag(tag, p.tag));
}

function send(ch: Parameters<Link['send']>[0], data: unknown, to?: string): void { link?.send(ch, data, to); }

function onHello(from: string, m: Record<string, unknown>): void {
  netLog(`hello from ${from.slice(0, 6)} (protocol ${String(m.v)}${m.host ? ', host' : ''})`);
  if (m.v !== PROTOCOL) {
    if (role.current === 'host') send('ctl', { t: 'refuse', why: 'version' }, from);
    return;
  }
  // (a game in the other lobby: the two would stand in different places, each walking the other's hero through its
  // own; refused, and told which lobby the room is in)
  if (Boolean(m.village) !== VILLAGE) {
    if (role.current === 'host') send('ctl', { t: 'refuse', why: 'lobby', village: VILLAGE }, from);
    return;
  }
  const look = m.look as Look;
  const tag = cleanTag(typeof m.tag === 'string' ? m.tag : '');
  if (role.current === 'host') {
    // a new guest: a free slot, if the party has room (and no run is on: joining mid-run waits)
    if (session.peers.has(from)) return;
    // its name tag must be one the room hasn't got: the host decides, and the guest is asked for another
    if (tagProblem(tag) || tagTaken(tag, from)) { send('ctl', { t: 'refuse', why: 'name', tag }, from); return; }
    const used = new Set([0, ...[...session.peers.values()].map((p) => p.slot)]);
    let slot = 1;
    while (used.has(slot)) slot++;
    if (slot >= COOP.maxPlayers) { send('ctl', { t: 'refuse', why: 'full' }, from); return; }
    // its colour: its pick if no one in the room wears it, else one no one does (the host decides, as for the slots)
    const colour = freeColour([ownColour(), ...[...session.peers.values()].map((p) => p.colour)], colourOf(m.col));
    addPeer(from, slot, look, tag, colour);
    const welcome = {
      t: 'welcome', slot, col: colour, biome: G.arena.biome, wave: session.wave, training: session.training,
      inRun: G.mode === 'run', tz: ownOffset(),
    };
    send('ctl', welcome, from);
    send('ctl', { t: 'gall', list: groundDrops() }, from);
    send('hello', hello(), from);
    publishColours();
    hooks.changed();
    return;
  }
  // a guest meets the host (or another guest)
  const slot = m.slot as number;
  if (m.host) session.hostId = from;
  const known = session.peers.get(from);
  if (!known && slot >= 0) {
    addPeer(from, slot, look, tag, roomColours.get(slot) ?? (m.host ? colourOf(m.col) : null));
    // (greeted back once, as our own hello may have reached it before its link knew us, and been dropped: a guest
    // joining a room of three never knew one of the others)
    if (session.status === 'joined') send('hello', hello(), from);
  } else if (known && slot >= 0 && known.slot !== slot) {
    // (met before the host gave it its slot)
    known.slot = slot;
    if (known.player) known.player.slot = slot;
    placeSpawns();
  }
  // (the colour the host gave it, said once it's in)
  if (known && slot >= 0 && roomColours.has(slot) && roomColours.get(slot) !== known.colour) {
    known.colour = roomColours.get(slot)!;
    known.player?.setColour(known.colour);
  }
  hooks.changed();
}

function onControl(from: string, m: Record<string, unknown>): void {
  if (m.t === 'colours') {
    if (role.current === 'guest' && from === session.hostId) receiveColours(m);
    return;
  }
  if (m.t === 'colour?') {
    const peer = session.peers.get(from);
    const wanted = colourOf(m.col);
    if (role.current !== 'host' || !peer?.colour || (m.col !== '' && !wanted)
      || !Number.isSafeInteger(m.request) || (m.request as number) < 1) return;
    const taken = [ownColour(), ...[...session.peers.values()].filter(p => p !== peer).map(p => p.colour)];
    peer.colour = changedColour(taken, wanted, peer.colour);
    peer.player?.setColour(peer.colour);
    publishColours({ slot: peer.slot, request: m.request as number });
    hooks.changed();
    return;
  }
  if (m.t === 'bye') { peerLeft(from); return; }
  if (m.t === 'chat') {
    const by = session.peers.get(from)?.player;
    if (by) chatHeard(by, m);
    return;
  }
  if (onGround(from, m)) return;
  if (m.t === 'ping') {
    const by = session.peers.get(from)?.player;
    if (by) pingHeard(by, m);
    return;
  }
  if (role.current === 'guest') {
    if (m.t === 'welcome') {
      netLog(`welcomed into slot ${String(m.slot)}`);
      clearTimeout(joinTimer);
      session.status = 'joined';
      session.hostId = from;
      G.player.slot = m.slot as number;
      wearRoomColour(colourOf(m.col));
      session.biome = m.biome as BiomeId;
      session.wave = m.wave as number;
      session.training = m.training === true;
      if (G.mode === 'menu' && BIOME_IDS.includes(session.biome)) G.arena.setBiome(session.biome);
      // (the village lit by the host's clock: the party stands in the same light)
      if (typeof m.tz === 'number') setHostOffset(m.tz);
      placeSpawns();
      // step over to our side of the spawn
      if (G.mode === 'menu') G.player.place(G.player.spawn, G.player.facing);
      send('hello', hello());   // our slot, to everyone
      // what we threw on the floor before joining is on the host's floor now
      for (const d of groundDrops()) send('ctl', { t: 'gdrop', d, still: 1 });
      hooks.changed();
    } else if (m.t === 'refuse') {
      netLog(`refused: ${String(m.why)}`);
      if (m.why === 'lobby') {
        const village = Boolean(m.village);
        fail(village ? 'That room is in the village, a beta lobby you have switched off.'
          : 'That room is in the old lobby: its host has the village beta switched off.');
        session.lobbyAsked = village;
        hooks.changed();
      } else if (m.why === 'name') fail(`Someone in that room is already called ${session.tag}: pick another name tag to join.`, true);
      else fail(m.why === 'full' ? 'That room is full.' : 'That game is on another version: both reload the page to play together.');
    } else if (m.t === 'lobby') {
      session.biome = m.biome as BiomeId;
      session.wave = m.wave as number;
      session.training = m.training === true;
      if (G.mode === 'menu') G.arena.setBiome(session.biome);
      if (typeof m.tz === 'number') setHostOffset(m.tz);
      hooks.changed();
    } else if (m.t === 'foes' && from === session.hostId) {
      foesTold(m.list as SpawnEvent[]);
    } else if (m.t === 'start' && G.mode === 'menu') {
      const host = session.peers.get(from);
      if (host) host.inRun = true;
      hooks.startRun(m.biome as BiomeId, m.wave as number, m.seed as number, m.training === true);
    }
    return;
  }
  // host: a guest asking about foes it has no copy of (it missed their spawns), answered with them
  if (m.t === 'foes?') {
    const list = foesAsked((m.ids as number[]).slice(0, ASKED_MOST));
    if (list.length) send('ctl', { t: 'foes', list }, from);
    return;
  }
  // host: a guest in the run it was sent (its countdown held till then), or its choices in the run
  const peer = session.peers.get(from);
  if (m.t === 'inrun') {
    if (peer) peer.readying = false;
    syncReadying();
    return;
  }
  if (peer?.player) onGuestControl(peer.player, m);
}

/** Items on the lobby floor: thrown, asked for (the host decides) and taken. Returns whether `m` was one. */
function onGround(from: string, m: Record<string, unknown>): boolean {
  if (m.t === 'gdrop') addDrop(m.d as GroundDrop, !m.still);
  else if (m.t === 'gall') for (const d of m.list as GroundDrop[]) addDrop(d, false);
  else if (m.t === 'gtake') {
    // first come, first served: whoever asks for a drop still on the floor gets it
    if (role.current === 'host' && removeDrop(m.id as string)) send('ctl', { t: 'gtaken', id: m.id, to: from });
  } else if (m.t === 'gtaken') {
    const d = removeDrop(m.id as string);
    if (d && m.to === link?.self) receiveItem(d.item);
  } else return false;
  return true;
}

function onLook(from: string, look: Look): void {
  const peer = session.peers.get(from);
  if (!peer || !CLASSES[look.cls]) return;
  peer.look = look;
  // a new class is a new character; new gear re-dresses the one there
  if (peer.player && peer.player.cls.id === look.cls) {
    peer.player.recomputeStats(look.eq);
    receivePortrait(peer.player, look.av ?? null);
  } else {
    const at = peer.player?.pos.clone(), facing = peer.player?.facing ?? Math.PI;
    dropPlayer(peer);
    makePlayer(peer);
    if (at) peer.player!.place(at, facing);
  }
  hooks.changed();
}

/** A player's own state: its clock (ms), where it is, the way it goes and faces, its aim, whether it's in the run and
 *  holding the revive key, its energy's share and its life. */
interface StateMsg { t: number; x: number; z: number; vx: number; vz: number; f: number; ax: number; az: number; run: 0 | 1; rv: 0 | 1; e: number; l: number; av?: string | null }
/** A player's actions since its last frame, stamped with its clock (ms). */
interface ActionsMsg { t: number; a: PlayerAction[] }

function onState(from: string, m: StateMsg): void {
  const peer = session.peers.get(from);
  if (!peer?.player) return;
  if (receivePortrait(peer.player, m.av)) {
    if (peer.look) peer.look.av = portraitOf(peer.player);
    hooks.changed();
  }
  peer.clock.heard(m.t);
  peer.track.add(m.t, { x: m.x, z: m.z, vx: m.vx, vz: m.vz, f: m.f }, m);
  const inRun = m.run === 1;
  if (inRun !== peer.inRun) { peer.inRun = inRun; syncAway(); hooks.changed(); }
}

function onActions(from: string, m: ActionsMsg): void {
  const peer = session.peers.get(from);
  if (!peer?.player) return;
  peer.clock.heard(m.t);
  for (const a of m.a) peer.actions.push(m.t, a);
}

function onFight(from: string, m: WorldMessage): void {
  const peer = session.peers.get(from);
  if (!peer || from !== session.hostId) return;
  peer.clock.heard(m.t);
  onWorld(m);
}

/** A player's run in numbers ([dealt, taken, mitigated, healed, kills, downs, revives, seconds of the run]) and its
 *  round trip to the server (ms, -1: none), once a second. */
interface NumbersMsg { n: number[]; p: number }
/** how many round trips a partner's graph keeps (one a second) */
const PINGS_KEPT = 60;

function onNumbers(from: string, m: NumbersMsg): void {
  const peer = session.peers.get(from);
  if (!peer) return;
  const [dealt, taken, mitigated, healed, kills, downs, revives, secs] = m.n;
  peer.numbers = { dealt, taken, mitigated, healed, kills, downs, revives, since: G.time - secs };
  peer.rtt = m.p >= 0 ? m.p : null;
  if (peer.rtt !== null) peer.pings.push(peer.rtt);
  if (peer.pings.length > PINGS_KEPT) peer.pings.shift();
}

/** A partner as the scoreboard shows it: its character, its numbers, its round trips to the server, and how far
 *  behind its own game this one shows it (ms: half of both round trips to the server, and the play-out's wait). */
export interface PartnerBoard { player: Player; tag: string; numbers: RunNumbers; rtt: number | null; pings: number[]; behind: number | null }

export function partnerBoards(): PartnerBoard[] {
  const own = serverPings().rtt;
  return [...session.peers.values()].flatMap((peer) => {
    if (!peer.player) return [];
    const wait = peer.clock.started && !Number.isNaN(peer.clock.behind) ? peer.clock.behind : null;
    const behind = wait === null ? null : wait + ((own ?? 0) + (peer.rtt ?? 0)) / 2;
    return [{ player: peer.player, tag: peer.tag, numbers: peer.numbers, rtt: peer.rtt, pings: peer.pings, behind }];
  });
}

function onHits(from: string, hits: HitReport[]): void {
  const p = session.peers.get(from)?.player;
  if (p) onGuestHits(p, hits);
}

const _pose: Pose = { x: 0, z: 0, vx: 0, vz: 0, f: 0 };
const _shown: Pose = { x: 0, z: 0, vx: 0, vz: 0, f: 0 };

/**
 * Every frame (`dt` s), before anything moves: each partner's reports played out to the moment its timeline shows
 * (its character where its reports have it then, its actions whose time has come), and on a guest the host's fight.
 */
export function playSession(dt: number): void {
  if (!link) return;
  for (const peer of session.peers.values()) {
    const p = peer.player;
    if (!p || !peer.clock.started) continue;
    const at = peer.clock.advance();
    if (peer.id === session.hostId) playWorld(at, dt);
    if (peer.track.at(at, _pose)) playState(p, peer.smooth.follow(_pose, peer.track, dt, _shown), peer.track.dataAt(at)!);
    for (const a of peer.actions.due(at)) if (!p.away) p.replay(a);
  }
}

function playState(p: Player, pose: Pose, m: StateMsg): void {
  const r = p.remote;
  r.x = pose.x; r.z = pose.z; r.vx = pose.vx; r.vz = pose.vz; r.f = pose.f; r.ax = m.ax; r.az = m.az;
  p.reviving = m.rv === 1;
  p.energy = m.e * p.stats.maxEnergy;
  if (p.alive) p.life = m.l;
}

// --- players -------------------------------------------------------------------------------
function addPeer(id: string, slot: number, look: Look, tag: string, colour: HeroColourId | null): void {
  const spacing = 1000 / COOP.sendRate;
  const peer: Peer = {
    id, slot, tag, colour, player: null, look, inRun: false, readying: false, clock: new Timeline(spacing), track: new Track(), smooth: new Smoother(), actions: new Playout(),
    numbers: freshNumbers(), rtt: null, pings: [],
  };
  session.peers.set(id, peer);
  makePlayer(peer);
  if (tag) chatNote(`${tag} is in the room`);
}

function makePlayer(peer: Peer): void {
  if (!peer.look || !CLASSES[peer.look.cls]) return;
  if (role.current === 'guest' && !peer.colour) return; // wait for the host's allocation, not another guest's claim
  const p = new Player(peer.look.cls, peer.look.eq, false);
  p.slot = peer.slot;
  p.tag = peer.tag;
  receivePortrait(p, peer.look.av ?? null);
  p.setColour(peer.colour);
  peer.player = p;
  G.players.push(p);
  placeSpawns();
  p.reset();
  syncAway();
}

function dropPlayer(peer: Peer): void {
  const p = peer.player;
  if (!p) return;
  p.dispose();
  G.players.splice(G.players.indexOf(p), 1);
  for (const e of G.enemies) if (e.target === p) e.target = null;
  peer.player = null;
}

function peerLeft(id: string): void {
  const peer = session.peers.get(id);
  if (!peer) return;
  const wasHost = id === session.hostId;
  if (peer.tag) chatNote(`${peer.tag} left`);
  dropPlayer(peer);
  session.peers.delete(id);
  if (role.current === 'host') publishColours();
  // (a guest gone while it readied the run isn't waited for)
  syncReadying();
  if (wasHost) { hooks.hostGone(); leaveRoom(); return; }
  hooks.changed();
}

/** The local player's hero in the colour the room gave it (null: out of a room, the pick or his own). */
function wearRoomColour(colour: HeroColourId | null): void {
  setRoomColour(colour);
  G.player.setColour(ownColour());
}

/** how far apart the party's spawn points are (m) */
const SPAWN_APART = 1.6;

/** Spawn points side by side, by slot, the row of every slot the party can have centred (solo: the middle). */
function placeSpawns(): void {
  const n = role.current === 'solo' ? 1 : COOP.maxPlayers;
  for (const p of G.players) p.spawn.set((p.slot - (n - 1) / 2) * SPAWN_APART, 0, 3);
}

/** A partner in the other place (the lobby while we're in a run, or the other way round) isn't shown. */
export function syncAway(): void {
  for (const peer of session.peers.values()) {
    const p = peer.player;
    if (!p) continue;
    p.away = peer.inRun !== (G.mode === 'run');
    p.show(!p.away && p.out !== 'banked');
  }
}

/** The local player's class or gear changed: show the others. */
export function sendLook(): void { send('look', myLook()); }

/** The host's lobby choices (battleground, starting wave), shown to the guests. */
export function sendLobby(biome: BiomeId, wave: number, training = false): void {
  session.wave = wave;
  session.training = training;
  if (role.current === 'host') send('ctl', { t: 'lobby', biome, wave, training, tz: ownOffset() });
}

/** The host starts a run: the guests in the lobby come along, its props shaped by the same `seed`. */
export function sendStart(biome: BiomeId, wave: number, seed: number, training = false): void {
  if (role.current !== 'host') return;
  for (const peer of session.peers.values()) {
    if (peer.inRun) continue;
    send('ctl', { t: 'start', biome, wave, seed, training }, peer.id);
    peer.readying = true;
  }
  // they're in from now on (their reports will say so too)
  for (const peer of session.peers.values()) peer.inRun = true;
  syncAway();
  syncReadying();
}

/** A guest: our run begun as the host's start asked (its fight's programs warm): the host's countdown goes on. */
export function sendInRun(): void { sendControl({ t: 'inrun' }); }

/** The guests still readying the run the host started, for its countdown (net/role.ts `readying`). */
function syncReadying(): void {
  readying.guests = [...session.peers.values()]
    .filter((peer) => peer.readying)
    .map((peer) => peer.player?.cls.name ?? 'a partner');
}

/** A guest's choice in the run, for the host. */
export function sendControl(m: Record<string, unknown>): void { if (session.hostId) send('ctl', m, session.hostId); }

/** The partners in the room, whether or not they're in the arena with us. */
export const partners = (): Player[] => [...session.peers.values()].flatMap((p) => (p.player ? [p.player] : []));

/** A partner still in a run (finishing one, or one we're not in). */
export const partnerInRun = (): boolean => [...session.peers.values()].some((p) => p.inRun);


/** Every frame: report the local player (and the fight, on the host) at the send rate. */
export function updateSession(dt: number, reviving: boolean): void {
  if (!link) return;
  const t = Math.round(performance.now() * 10) / 10;
  if (actions.length) { send('ev', { t, a: actions } satisfies ActionsMsg); actions = []; }
  const hits = takeHits();
  if (hits && session.hostId) send('dmg', hits, session.hostId);
  numbersT -= dt;
  if (numbersT <= 0) {
    numbersT = 1;
    const n = mine;
    const run = [n.dealt, n.taken, n.mitigated, n.healed].map(Math.round);
    send('st', { n: [...run, n.kills, n.downs, n.revives, Math.round(G.time - n.since)], p: Math.round(serverPings().rtt ?? -1) } satisfies NumbersMsg);
  }
  sendT -= dt;
  const due = sendT <= 0;
  if (due) {
    sendT = 1 / COOP.sendRate;
    const p = G.player, s = p.stats;
    const r2 = (v: number) => Math.round(v * 100) / 100;
    send('pl', {
      t, x: r2(p.pos.x), z: r2(p.pos.z), vx: r2(p.vel.x), vz: r2(p.vel.z), f: r2(p.facing), ax: r2(p.aim.x), az: r2(p.aim.z),
      run: G.mode === 'run' ? 1 : 0, rv: reviving ? 1 : 0, e: r2(p.energy / s.maxEnergy), l: r2(p.life), av: portraitOf(p),
    } satisfies StateMsg);
  }
  // the fight's events go out every frame, its snapshot at the send rate
  if (role.current === 'host' && G.mode === 'run') sendWorld((m) => send('w', m), due);
}
