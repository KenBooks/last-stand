// Co-op relay: the games in a room talk through this one server over a WebSocket (JSON text frames), so co-op needs no
// peer-to-peer link, TURN server or public Nostr relays: a socket on 443 gets through any NAT a web page does.
//   ws(s)://host/room/<app>/<code>?id=<peer id>   a game joins a room (the app id keeps protocol versions apart);
//                                                 a host opens it with &host=1 and its flags (rooms.mjs)
//   game -> relay  { ch, d, to? }                 a message for every other peer, or one
//   relay -> game  { t: 'hi', self, peers, v } on joining (v: what this relay can do, 2 with rooms.mjs), { t: 'join', p },
//                  { t: 'leave', p }, { ch, d, from }
//   game <-> relay { t: 'ping', n } / { t: 'pong', n } the game's round trip
//   GET /health                                   200 "ok"
//   GET /rooms?app=<app>                          the public rooms of the page's site (rooms.mjs)
//   ws(s)://host/agent/open, /agent/join          an agent invited into a preview's game (agents.mjs): never co-op's
// A peer whose socket drops and comes back with the same id within GRACE is the same peer: the others never see it go.
// One whose game closed it on purpose (`LEFT`) is gone at once.
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';
import { agentRooms, DEFAULT_AGENT_ORIGINS } from './agents.mjs';
import {
  addressOf, cardOf, hashPassword, LISTS_PER_MINUTE, listRooms, openingOf, passwordFits, passwordOf, PerMinute, siteOf,
  TRIES_PER_MINUTE,
} from './rooms.mjs';

/** what this relay can do, said in its hi: 2 has hosts, public rooms and passwords (rooms.mjs) */
export const RELAY_VERSION = 2;

/** Origins from a comma-separated list, a `*` standing for one DNS label's worth (`https://pr-*.ls.wellscoped.dev`:
 *  each PR's preview, at a host of its own), as something with `has(origin)` and the list as `names`. */
export function originsFrom(list) {
  const exact = new Set(), patterns = [];
  for (const o of list.split(',').map((s) => s.trim()).filter(Boolean)) {
    if (!o.includes('*')) { exact.add(o); continue; }
    const parts = o.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'));
    patterns.push(new RegExp(`^${parts.join('[a-z0-9-]+')}$`));
  }
  return { names: [...exact, ...patterns.map(String)], has: (origin) => exact.has(origin) || patterns.some((p) => p.test(origin)) };
}
/** pages allowed to open a socket (a browser always sends its Origin; anything else is turned away) */
const DEFAULT_ORIGINS = 'https://last-stand.cc,https://www.last-stand.cc,https://victorzakharov.github.io,https://ls.wellscoped.dev,https://pr-*.ls.wellscoped.dev,https://c-*.ls.wellscoped.dev,http://localhost:5173,http://localhost:5199';
const ROOM_MAX = 4, ROOMS_MAX = 500, MSG_MAX = 64 * 1024, PING = 20000;
/** each socket's budget: messages and bytes a second, with a burst of two seconds' worth (a game sends ~60 a second) */
const RATE = { msgs: 400, bytes: 1 << 20 };
const NAME = /^[\w.-]{1,48}$/;
/** how long a joiner of a locked room has to give its password (ms) */
const PASS_WAIT = 15000;
/** the close codes of a socket its game closed on purpose, leaving its room for good (1000: the game's own leave, with
 *  its reason `left`; 1005: no code, as an older game's leave closed it): its place is let go at once, not held for
 *  the grace. A dropped socket (1006) or a page gone (1001: a reload comes back with a new id anyway) is held. */
const LEFT = new Set([1000, 1005]);

/**
 * Starts a relay on `port` (0: any free one). `origins` the pages it takes, `grace` how long a dropped peer is held
 * (ms). `faults` are the lab's canaries alone, never set by the deploy: `anyPassword` lets any password in,
 * `listPrivate` lists private rooms. `agentOrigins` the pages that may invite an agent (agents.mjs: previews and dev
 * builds, never production's), `agentTtl` how long an invitation's code is good unjoined (ms). Resolves to the HTTP
 * server once it listens.
 */
export function startRelay({
  port = 0, origins = DEFAULT_ORIGINS, grace = 8000, faults = {}, log = defaultLog,
  agentOrigins = DEFAULT_AGENT_ORIGINS, agentTtl,
} = {}) {
  const ORIGINS = originsFrom(origins);
  const agents = agentRooms({ origins: originsFrom(agentOrigins), ttl: agentTtl, faults, log });
  /** room key -> { peers: peer id -> peer, meta: the host's room (rooms.mjs) or null for a room opened by no host } */
  const rooms = new Map();
  const tries = new PerMinute(TRIES_PER_MINUTE), lists = new PerMinute(LISTS_PER_MINUTE);

  const http = createServer((req, res) => {
    // (readable by our pages, which check it before opening a room)
    const origin = req.headers.origin ?? '';
    const cors = ORIGINS.has(origin) ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {};
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname === '/health') {
      res.writeHead(200, { 'content-type': 'text/plain', 'cache-control': 'no-store', ...cors });
      res.end('ok');
      return;
    }
    if (url.pathname === '/rooms' && req.method === 'GET') {
      const app = url.searchParams.get('app') ?? '';
      if (!ORIGINS.has(origin) || !NAME.test(app)) { res.writeHead(403, cors); res.end(); return; }
      if (!lists.spend(addressOf(req))) { res.writeHead(429, { 'retry-after': '60', ...cors }); res.end(); return; }
      const body = JSON.stringify({ rooms: listRooms(rooms, siteOf(origin), app, Date.now(), faults) });
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors });
      res.end(body);
      return;
    }
    res.writeHead(404); res.end();
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: MSG_MAX });

  http.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://x'), [, path, app, code] = url.pathname.split('/');
    // (an agent's room is no co-op room: its own origins, codes and messages, agents.mjs)
    if (path === 'agent') { agents.upgrade(req, socket, head, app); return; }
    const id = url.searchParams.get('id') ?? '', origin = req.headers.origin ?? '';
    const bad = path !== 'room' || !NAME.test(app ?? '') || !NAME.test(code ?? '') || !NAME.test(id) || !ORIGINS.has(origin);
    const key = `${app}/${code}`, room = rooms.get(key);
    if (bad || (!room && rooms.size >= ROOMS_MAX)) {
      socket.end(`HTTP/1.1 ${bad ? 403 : 503} ${bad ? 'Forbidden' : 'Full'}\r\n\r\n`);
      return;
    }
    const asHost = url.searchParams.get('host') === '1';
    const opening = asHost ? openingOf(url.searchParams, ROOM_MAX) : null;
    wss.handleUpgrade(req, socket, head, (ws) => arrive(ws, key, id, { site: siteOf(origin), opening, address: addressOf(req) }));
  });

  function send(peer, msg) { if (peer.ws?.readyState === 1) peer.ws.send(msg); }
  function others(room, id, msg) { for (const [pid, p] of room.peers) if (pid !== id) send(p, msg); }
  function deny(ws, why) { ws.send(JSON.stringify({ t: 'denied', why })); ws.close(4003, why); }

  /** A socket for room `key`: a host opening (or taking back) its room, a peer back within the grace, a joiner asked
   *  for the room's password, or let straight in. */
  function arrive(ws, key, id, { site, opening, address }) {
    let room = rooms.get(key);
    const known = room?.peers.has(id);
    if (opening && !known) {
      // (a host takes a room nobody holds: its own, opened afresh after the relay restarted and a guest came back first)
      const owner = room?.meta ? room.peers.get(room.meta.owner) : null;
      if (owner?.ws) { deny(ws, 'taken'); return; }
      if (!room) rooms.set(key, (room = { peers: new Map(), meta: null }));
      room.meta = { site, owner: id, pub: opening.pub, max: opening.max, lock: opening.lock ? 'pending' : null,
        card: null, cardAt: 0, since: room.meta?.since ?? Date.now() };
    }
    if (!room) rooms.set(key, (room = { peers: new Map(), meta: null }));
    const max = room.meta?.max ?? ROOM_MAX;
    if (!known && room.peers.size >= max) { deny(ws, 'full'); dropIfEmpty(key, room); return; }
    const lock = room.meta?.lock;
    if (known || !lock || room.meta.owner === id) { enter(ws, key, room, id); return; }
    // a locked room: the joiner gives its password before it's in
    if (tries.spent(address)) { deny(ws, 'tries'); dropIfEmpty(key, room); return; }
    ws.send(JSON.stringify({ t: 'locked' }));
    const timer = setTimeout(() => ws.close(4003, 'password'), PASS_WAIT);
    ws.once('message', async (raw) => {
      clearTimeout(timer);
      let m;
      try { m = JSON.parse(raw.toString()); } catch { m = null; }
      const pw = m?.t === 'pass' ? passwordOf(m.pw) : null;
      const now = rooms.get(key);
      if (now !== room || ws.readyState !== 1) return;
      if (room.meta.lock === 'pending') { deny(ws, 'wait'); return; }
      const fits = pw !== null && (faults.anyPassword || await passwordFits(room.meta.lock, pw));
      if (!fits) {
        log('wrong password', key);
        if (!tries.spend(address)) { deny(ws, 'tries'); return; }
        deny(ws, 'password');
        return;
      }
      if (!room.peers.has(id) && room.peers.size >= room.meta.max) { deny(ws, 'full'); return; }
      enter(ws, key, room, id);
    });
  }

  function dropIfEmpty(key, room) { if (!room.peers.size && rooms.get(key) === room) rooms.delete(key); }

  /** What a room's host alone may say of it: its password (once, as it opens) and its card. */
  async function fromHost(room, id, m) {
    const meta = room.meta;
    if (!meta || meta.owner !== id) return;
    if (m.t === 'lock' && meta.lock === 'pending') {
      const pw = passwordOf(m.pw);
      if (pw) meta.lock = await hashPassword(pw);
    } else if (m.t === 'card' && (meta.pub || faults.listPrivate)) {
      const card = cardOf(m.c);
      if (card) { meta.card = card; meta.cardAt = Date.now(); }
    }
  }

  function enter(ws, key, room, id) {
    const peers = room.peers;
    let peer = peers.get(id);
    if (peer) {
      // back within the grace: the same peer, on a new socket
      clearTimeout(peer.gone); peer.gone = null;
      try { peer.ws?.terminate(); } catch { /* */ }
      peer.ws = ws;
    } else {
      peer = { ws, gone: null };
      peers.set(id, peer);
      others(room, id, JSON.stringify({ t: 'join', p: id }));
    }
    log('join', key, id, `(${peers.size} in the room)`);
    ws.send(JSON.stringify({ t: 'hi', self: id, peers: [...peers.keys()].filter((p) => p !== id), v: RELAY_VERSION }));
    const bucket = { msgs: RATE.msgs * 2, bytes: RATE.bytes * 2, at: Date.now() };
    ws.alive = true;
    ws.on('pong', () => { ws.alive = true; });
    ws.on('message', (raw, binary) => {
      const now = Date.now(), dt = (now - bucket.at) / 1000; bucket.at = now;
      bucket.msgs = Math.min(RATE.msgs * 2, bucket.msgs + dt * RATE.msgs) - 1;
      bucket.bytes = Math.min(RATE.bytes * 2, bucket.bytes + dt * RATE.bytes) - raw.length;
      if (binary || bucket.msgs < 0 || bucket.bytes < 0) return;
      let m;
      try { m = JSON.parse(raw.toString()); } catch { return; }
      // (the game's own ping, answered straight back for its round trip)
      if (m?.t === 'ping') { ws.send(JSON.stringify({ t: 'pong', n: m.n })); return; }
      if (m?.t === 'lock' || m?.t === 'card') { void fromHost(room, id, m); return; }
      if (typeof m?.ch !== 'string') return;
      const out = JSON.stringify({ ch: m.ch, d: m.d, from: id });
      if (typeof m.to === 'string') { const p = peers.get(m.to); if (p) send(p, out); } else others(room, id, out);
    });
    ws.on('close', (code) => {
      if (peer.ws !== ws) return;
      peer.ws = null;
      const leave = () => {
        peers.delete(id);
        log('leave', key, id, `(${peers.size} in the room)`);
        others(room, id, JSON.stringify({ t: 'leave', p: id }));
        dropIfEmpty(key, room);
      };
      // (closed by its game on purpose, it's gone at once: held for the grace, a joiner its host had turned away (a
      // name tag taken) kept its place, and its next try as another tag found the room full. A dropped socket is
      // held for the grace, to come back unseen)
      if (LEFT.has(code) && !faults.holdLeft) leave();
      else peer.gone = setTimeout(leave, grace);
    });
  }

  // a socket that stops answering pings is closed (and its peer leaves after the grace); old counts let go
  const pinger = setInterval(() => {
    for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; ws.ping(); }
    tries.prune();
    lists.prune();
    agents.tick();
  }, PING);
  // (closed, its sockets go too: an upgraded socket holds the HTTP server open, which would never close)
  const closeHttp = http.close.bind(http);
  http.close = (done) => {
    clearInterval(pinger);
    for (const ws of wss.clients) ws.terminate();
    agents.close();
    for (const room of rooms.values()) for (const peer of room.peers.values()) clearTimeout(peer.gone);
    return closeHttp(done);
  };

  return new Promise((resolve) => http.listen(port, () => {
    log(`co-op relay on :${http.address().port}, origins ${ORIGINS.names.join(' ')}`);
    resolve(http);
  }));
}

function defaultLog(...a) { console.log(new Date().toISOString(), ...a); }

// run as the deploy's process (not when the tests or the lab import it)
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  void startRelay({
    port: Number(process.env.PORT ?? 8080), origins: process.env.ORIGINS ?? DEFAULT_ORIGINS,
    agentOrigins: process.env.AGENT_ORIGINS ?? DEFAULT_AGENT_ORIGINS,
  });
  for (const s of ['SIGTERM', 'SIGINT']) process.on(s, () => { defaultLog('stopping'); process.exit(0); });
}
