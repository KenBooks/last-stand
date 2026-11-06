// Co-op relay: the games in a room talk through this one server over a WebSocket (JSON text frames), so co-op needs no
// peer-to-peer link, TURN server or public Nostr relays: a socket on 443 gets through any NAT a web page does.
//   ws(s)://host/room/<app>/<code>?id=<peer id>   a game joins a room (the app id keeps protocol versions apart)
//   game -> relay  { ch, d, to? }                 a message for every other peer, or one
//   relay -> game  { t: 'hi', self, peers } on joining, { t: 'join', p }, { t: 'leave', p }, { ch, d, from }
//   game <-> relay { t: 'ping', n } / { t: 'pong', n } the game's round trip
//   GET /health                                   200 "ok"
// A peer whose socket drops and comes back with the same id within GRACE is the same peer: the others never see it go.
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT ?? 8080);
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
const ORIGINS = originsFrom(process.env.ORIGINS ?? 'https://last-stand.cc,https://www.last-stand.cc,https://victorzakharov.github.io,https://ls.wellscoped.dev,https://pr-*.ls.wellscoped.dev,http://localhost:5173,http://localhost:5199');
const ROOM_MAX = 4, ROOMS_MAX = 500, MSG_MAX = 64 * 1024, GRACE = 8000, PING = 20000;
/** each socket's budget: messages and bytes a second, with a burst of two seconds' worth (a game sends ~60 a second) */
const RATE = { msgs: 400, bytes: 1 << 20 };
const NAME = /^[\w.-]{1,48}$/;

/** room key -> peer id -> peer */
const rooms = new Map();
const log = (...a) => console.log(new Date().toISOString(), ...a);

const http = createServer((req, res) => {
  // (readable by our pages, which check it before opening a room)
  const origin = req.headers.origin ?? '';
  if (req.url === '/health') { res.writeHead(200, { 'content-type': 'text/plain', 'cache-control': 'no-store', ...(ORIGINS.has(origin) ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {}) }); res.end('ok'); return; }
  res.writeHead(404); res.end();
});
const wss = new WebSocketServer({ noServer: true, maxPayload: MSG_MAX });

http.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', 'http://x'), [, room, app, code] = url.pathname.split('/'), id = url.searchParams.get('id') ?? '';
  const bad = room !== 'room' || !NAME.test(app ?? '') || !NAME.test(code ?? '') || !NAME.test(id) || !ORIGINS.has(req.headers.origin ?? '');
  const key = `${app}/${code}`, peers = rooms.get(key);
  const full = peers ? peers.size >= ROOM_MAX && !peers.has(id) : rooms.size >= ROOMS_MAX;
  if (bad || full) { socket.end(`HTTP/1.1 ${bad ? 403 : 503} ${bad ? 'Forbidden' : 'Full'}\r\n\r\n`); return; }
  wss.handleUpgrade(req, socket, head, (ws) => enter(ws, key, id));
});

function send(peer, msg) { if (peer.ws?.readyState === 1) peer.ws.send(msg); }
function others(key, id, msg) { for (const [pid, p] of rooms.get(key) ?? []) if (pid !== id) send(p, msg); }

function enter(ws, key, id) {
  let peers = rooms.get(key);
  if (!peers) rooms.set(key, (peers = new Map()));
  let peer = peers.get(id);
  if (peer) {
    // back within the grace: the same peer, on a new socket
    clearTimeout(peer.gone); peer.gone = null;
    try { peer.ws?.terminate(); } catch { /* */ }
    peer.ws = ws;
  } else {
    peer = { ws, gone: null };
    peers.set(id, peer);
    others(key, id, JSON.stringify({ t: 'join', p: id }));
  }
  log('join', key, id, `(${peers.size} in the room)`);
  ws.send(JSON.stringify({ t: 'hi', self: id, peers: [...peers.keys()].filter((p) => p !== id) }));
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
    if (typeof m?.ch !== 'string') return;
    const out = JSON.stringify({ ch: m.ch, d: m.d, from: id });
    if (typeof m.to === 'string') { const p = peers.get(m.to); if (p) send(p, out); } else others(key, id, out);
  });
  ws.on('close', () => {
    if (peer.ws !== ws) return;
    peer.ws = null;
    peer.gone = setTimeout(() => {
      peers.delete(id);
      log('leave', key, id, `(${peers.size} in the room)`);
      others(key, id, JSON.stringify({ t: 'leave', p: id }));
      if (!peers.size) rooms.delete(key);
    }, GRACE);
  });
}

// a socket that stops answering pings is closed (and its peer leaves after the grace)
setInterval(() => {
  for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; ws.ping(); }
}, PING);

http.listen(PORT, () => log(`co-op relay on :${PORT}, origins ${ORIGINS.names.join(' ')}`));
for (const s of ['SIGTERM', 'SIGINT']) process.on(s, () => { log('stopping'); process.exit(0); });
