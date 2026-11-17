// Links for co-op. Players meet in a room named by a short code, on our own relay server (`server/relay`), and every
// message goes through it over one WebSocket: no public relays, STUN or TURN servers, and it gets through any network a
// web page does (peer to peer, a player behind a mobile carrier's NAT met the host and then never connected). With the
// server down there's no co-op. `?server=wss://host` picks another relay server, and `?net=local` a BroadcastChannel
// between tabs of one browser, for testing with no server at all.
import { netLog, countMsg, watchServer, serverState, serverRtt } from './netlog';

export type Channel = 'hello' | 'look' | 'pl' | 'ev' | 'w' | 'dmg' | 'st' | 'ctl';

export interface Link {
  /** this peer's id in the room */
  readonly self: string;
  /** a public room's card, sent to the relay by its host for the list (`server/relay/rooms.mjs`) */
  card(c: RoomCard): void;
  send(ch: Channel, data: unknown, to?: string): void;
  onMessage(fn: (ch: Channel, data: unknown, from: string) => void): void;
  onJoin(fn: (peer: string) => void): void;
  onLeave(fn: (peer: string) => void): void;
  leave(): void;
}

/** the protocol changes with the game: a room only ever holds one version (the server keeps them apart) */
const APP = 'last-stand-coop-1';
/** the relay server every game meets on (`VITE_COOP_SERVER` at build time, `?server=` to try another) */
const SERVER: string = import.meta.env.VITE_COOP_SERVER ?? 'wss://ls.wellscoped.dev';

/** The server's address over HTTP(S), as `?server=` or the build names it (its health check, the traces it takes:
 *  `src/perf/upload.ts`). */
export const serverHttp = (): string =>
  (new URLSearchParams(location.search).get('server') ?? SERVER).replace(/^ws/, 'http').replace(/\/+$/, '');

/** What a public room's host tells the relay of it, for the list (the relay counts its players itself). */
export interface RoomCard {
  /** the room's name, as its host typed it */
  name: string;
  /** the host's name tag and hero's class */
  tag: string; cls: string;
  /** the battleground, and the wave: the one fought in a run, else the one it starts at */
  map: string; wave: number; run: boolean;
  /** the lobby it's in (a room is in its host's), and the game's protocol */
  lobby: 'village' | 'panels'; v: number;
}

/** A public room as the relay lists it. */
export interface RoomListing extends RoomCard {
  code: string; players: number; max: number; locked: boolean; since: number;
}

/** How a host opens its room: listed for anyone or not, how many it holds, its password ('' for none). */
export interface RoomOpening { pub: boolean; max: number; password: string }

/** Why the relay turned a link to a room away: the password missing or wrong, too many wrong ones, the room's
 *  password not set yet, its code held by another host, full, or a relay too old for public and password rooms. */
export type RefusedWhy = 'needs-password' | 'password' | 'tries' | 'wait' | 'taken' | 'full' | 'old-server';
export class RoomRefused extends Error {
  constructor(readonly why: RefusedWhy) { super(`the room turned us away (${why})`); }
}

/** what a relay must be (its hi's `v`) to have hosts, public rooms and passwords (`server/relay/rooms.mjs`) */
const ROOMS_RELAY = 2;
/** the relay's own words for why it turned a link away */
const WHYS: readonly RefusedWhy[] = ['password', 'tries', 'wait', 'taken', 'full'];

/**
 * The public rooms of this site and game, as the relay lists them (`GET /rooms`), or null where it couldn't be read
 * (the server down, or too old to list them). `?net=local` lists none.
 */
export async function listRooms(): Promise<RoomListing[] | null> {
  if (new URLSearchParams(location.search).get('net') === 'local') return [];
  try {
    const url = `${serverHttp()}/rooms?app=${APP}`;
    const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(CHECK_TIMEOUT * 1000) });
    if (!r.ok) return null;
    const body = await r.json() as { rooms?: unknown };
    return Array.isArray(body.rooms) ? body.rooms.filter(isListing) : null;
  } catch { return null; }
}
const isListing = (r: unknown): r is RoomListing => {
  const l = r as RoomListing;
  return typeof l?.code === 'string' && /^[A-Z0-9]{4,8}$/.test(l.code) && typeof l.name === 'string'
    && typeof l.tag === 'string' && typeof l.map === 'string' && Number.isFinite(l.players) && Number.isFinite(l.max);
};

/** The server didn't answer: co-op isn't available (said so plainly, not as an error). */
export class ServerDown extends Error {}
/** what a player is told when the co-op server doesn't answer */
export const SERVER_DOWN = "The co-op server is offline, so playing together isn't available right now. Try again in a while.";

/**
 * Whether the co-op server answers its health check (`/health`, within `CHECK_TIMEOUT`): the co-op dialog asks as it
 * opens, so a player is told the server is down before trying (and waiting) to open a room.
 */
export async function serverUp(): Promise<boolean> {
  const q = new URLSearchParams(location.search);
  if (q.get('net') === 'local') return true;
  const url = serverHttp() + '/health';
  try {
    const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(CHECK_TIMEOUT * 1000) });
    return r.ok && (await r.text()).trim() === 'ok';
  } catch { return false; }
}
const CHECK_TIMEOUT = 5;

/** What a link is opened as: a host opening its room (how), or a joiner with the room's password if it has one. */
export interface LinkAs { host?: RoomOpening; password?: string }

export async function openLink(code: string, as: LinkAs = {}): Promise<Link> {
  const q = new URLSearchParams(location.search);
  if (q.get('net') === 'local') return localLink(code);
  return serverLink(code, q.get('server') ?? SERVER, as);
}

/**
 * Through our relay server: one WebSocket, JSON text frames (`server/relay/relay.mjs`). A dropped socket reconnects
 * with the same id, and the server holds the peer for a few seconds meanwhile, so a blip doesn't end a run.
 */
const OPEN_TIMEOUT = 6;
/** how long a peer missing after a reconnect has to come back (ms, as long as the server holds a dropped one) */
const GRACE = 8000;
/** how long a dropped link keeps trying to reach the server again (ms) */
const RECONNECT = 30_000;
/** a ping to the server every so often, for the round trip (the scoreboard graphs it) */
const PING_MS = 1000;
function serverLink(code: string, server: string, as: LinkAs): Promise<Link> {
  const self = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => (b % 36).toString(36)).join('');
  const opening = as.host;
  // (a host's flags; never its password, which goes in a message over the encrypted socket, not in an address)
  const flags = opening
    ? `&host=1&max=${opening.max}${opening.pub ? '&pub=1' : ''}${opening.password ? '&lock=1' : ''}` : '';
  const url = `${server.replace(/\/+$/, '')}/room/${APP}/${code}?id=${self}${flags}`;
  /** why the relay turned this link away, as it said before closing the socket */
  let refused: RefusedWhy | null = null;
  let onMsg: (ch: Channel, data: unknown, from: string) => void = () => {};
  let join: (peer: string) => void = () => {}, gone: (peer: string) => void = () => {};
  const peers = new Set<string>();
  let ws: WebSocket | null = null, left = false, tries = 0, opened = false, lostAt = 0;
  const host = new URL(server).host;
  let pinger: ReturnType<typeof setInterval> | undefined;
  watchServer(host);
  netLog(`opening the link to room ${code} as ${self.slice(0, 6)} through ${host}`);
  return new Promise((resolve, reject) => {
    const link: Link = {
      self,
      send(ch, data, to) {
        countMsg('out');
        if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(to ? { ch, d: data, to } : { ch, d: data }));
      },
      card(c) { toServer({ t: 'card', c }); },
      onMessage(fn) { onMsg = fn; },
      onJoin(fn) { join = fn; },
      onLeave(fn) { gone = fn; },
      leave() { left = true; clearInterval(pinger); for (const t of missing.values()) clearTimeout(t); missing.clear(); netLog('left the room'); ws?.close(); },
    };
    /** a message for the relay itself (a host's password and card, a joiner's password) */
    const toServer = (m: unknown) => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); };
    /** peers not back after a reconnect, and when they're given up */
    const missing = new Map<string, ReturnType<typeof setTimeout>>();
    const lose = (p: string) => { missing.delete(p); if (peers.delete(p)) { netLog(`peer ${p.slice(0, 6)} left`); gone(p); } };
    const arrive = (p: string) => {
      const t = missing.get(p);
      if (t !== undefined) { clearTimeout(t); missing.delete(p); netLog(`peer ${p.slice(0, 6)} back`); return; }
      if (!peers.has(p)) { peers.add(p); netLog(`peer ${p.slice(0, 6)} joined`); join(p); }
    };
    const connect = () => {
      const t0 = performance.now(), sock = new WebSocket(url);
      ws = sock;
      serverState('connecting');
      sock.onopen = () => { tries = 0; serverState('open'); netLog(`server ${host} open after ${((performance.now() - t0) / 1000).toFixed(1)}s`); };
      sock.onmessage = (e) => {
        let m: {
          t?: string; p?: string; peers?: string[]; ch?: Channel; d?: unknown; from?: string; n?: number; v?: number; why?: string;
        };
        try { m = JSON.parse(e.data as string); } catch { return; }
        if (m.t === 'pong') { if (typeof m.n === 'number') serverRtt(performance.now() - m.n); return; }
        // a locked room asks for its password (again after a reconnect: the relay may have restarted)
        if (m.t === 'locked') {
          if (as.password) toServer({ t: 'pass', pw: as.password });
          else { refused = 'needs-password'; sock.close(); }
          return;
        }
        if (m.t === 'denied') {
          refused = WHYS.find((w) => w === m.why) ?? 'password';
          netLog(`the room turned us away (${refused})`);
          return;
        }
        if (m.t === 'hi') {
          // (a public or password room needs a relay that lists and locks rooms: an older one would let anyone in)
          if (opening && (opening.pub || opening.password) && !((m.v ?? 0) >= ROOMS_RELAY)) {
            refused = 'old-server';
            sock.close();
            return;
          }
          // (a host's password, set on every hi: a restarted relay has forgotten it)
          if (opening?.password) toServer({ t: 'lock', pw: opening.password });
          // (the peers already there are met once the session has its handlers on the link, after it's resolved)
          if (!opened) {
            opened = true; resolve(link); setTimeout(() => sock.onmessage?.(e), 0);
            pinger = setInterval(() => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'ping', n: performance.now() })); }, PING_MS);
            return;
          }
          // (after a reconnect: whoever came meanwhile is new, and whoever isn't there yet has GRACE to come back, as a
          // restarted server, a deploy, loses its rooms and every game reconnects on its own: told at once, the guest
          // took the host as gone and left the room before the host was back)
          const now = new Set(m.peers ?? []);
          for (const p of peers) if (!now.has(p) && !missing.has(p)) missing.set(p, setTimeout(() => lose(p), GRACE));
          for (const p of now) arrive(p);
        } else if (m.t === 'join' && m.p) arrive(m.p);
        else if (m.t === 'leave' && m.p && peers.delete(m.p)) { netLog(`peer ${m.p.slice(0, 6)} left`); gone(m.p); }
        else if (m.ch && m.from && peers.has(m.from)) { countMsg('in'); onMsg(m.ch, m.d, m.from); }
      };
      sock.onclose = (e) => {
        if (ws !== sock || left) return;
        serverState('closed');
        netLog(`server ${host} closed (${e.code}${e.reason ? ' ' + e.reason : ''})`);
        // (turned away by the room: said why, and not tried again)
        if (refused) {
          left = true;
          clearInterval(pinger);
          if (!opened) reject(new RoomRefused(refused));
          else for (const p of [...peers]) { peers.delete(p); gone(p); }
          return;
        }
        // (never opened: the server is down or turned us away; open, it has RECONNECT to come back: a deploy restarts it)
        if (!opened) { reject(new ServerDown(`the co-op server ${host} didn't answer`)); return; }
        if (!tries++) lostAt = performance.now();
        if (performance.now() - lostAt > RECONNECT) { clearInterval(pinger); netLog(`server ${host} lost`); for (const p of [...peers]) { peers.delete(p); gone(p); } return; }
        setTimeout(connect, Math.min(4000, 500 * tries));
      };
    };
    connect();
    setTimeout(() => { if (!opened && !refused) { left = true; ws?.close(); serverState('closed'); reject(new ServerDown(`the co-op server ${host} didn't answer`)); } }, OPEN_TIMEOUT * 1000);
  });
}

/** Tabs of one browser, over a BroadcastChannel: the same messages, no server. */
function localLink(code: string): Link {
  const self = Math.random().toString(36).slice(2, 10);
  const bc = new BroadcastChannel(`${APP}:${code}`);
  const peers = new Set<string>();
  let onMsg: (ch: Channel, data: unknown, from: string) => void = () => {};
  let join: (peer: string) => void = () => {}, gone: (peer: string) => void = () => {};
  type Packet = { from: string; to?: string; ch?: Channel; data?: unknown; sys?: 'here' | 'bye' | 'ack' };
  let left = false;
  // (left before its first word went out, 50 ms in: a closed channel throws)
  const post = (p: Omit<Packet, 'from'>) => { if (!left) bc.postMessage({ from: self, ...p }); };
  bc.onmessage = (e: MessageEvent<Packet>) => {
    const p = e.data;
    if (p.to && p.to !== self) return;
    if (p.sys === 'bye') { if (peers.delete(p.from)) gone(p.from); return; }
    if (p.sys) {
      if (!peers.has(p.from)) { peers.add(p.from); join(p.from); }
      if (p.sys === 'here') post({ sys: 'ack', to: p.from });
      return;
    }
    if (peers.has(p.from) && p.ch) onMsg(p.ch, p.data, p.from);
  };
  const bye = () => post({ sys: 'bye' });
  window.addEventListener('pagehide', bye);
  setTimeout(() => post({ sys: 'here' }), 50);
  return {
    self,
    card() { /* (no relay: nothing lists a room) */ },
    send(ch, data, to) { post({ ch, data, to }); },
    onMessage(fn) { onMsg = fn; },
    onJoin(fn) { join = fn; },
    onLeave(fn) { gone = fn; },
    leave() { bye(); left = true; window.removeEventListener('pagehide', bye); bc.close(); },
  };
}
