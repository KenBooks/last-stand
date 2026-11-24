// The relay's agent rooms (#529): the owner's coding session let into the game he is playing on a PR preview, to look
// at it and run code in its page. A room kind and a protocol of their own, apart from co-op's: one game, one agent,
// no players. Running code in a page from outside is remote code execution, so every lock here holds at once:
//   - a game opens one only from a preview's or a commit build's origin (`agentOrigins`), never from production's,
//     whatever the page asks and whatever the settings say (`isProduction`);
//   - the relay makes the code itself: 24 random bytes, good for one join, gone unjoined after `AGENT_CODE_TTL`;
//   - wrong codes from one address are counted a minute, as a room's wrong passwords are (`AGENT_TRIES_PER_MINUTE`);
//   - nothing the agent sends reaches the game before the game has accepted it (the page asks its player);
//   - one agent a game: the code is spent as it joins, and a second join finds none.
//   ws(s)://host/agent/open   a game asks for an invitation (a browser's socket: its Origin is checked)
//   ws(s)://host/agent/join   an agent's socket (a command line's: one with an Origin, a page's, is turned away)
//   relay -> game  { t: 'invite', code, ttl }   the code to hand over, and how long it is good unjoined (ms)
//   agent -> relay { t: 'code', code }          first, within `CODE_WAIT`; never in the address, which is logged
//   relay -> agent { t: 'hi', v } then { t: 'accepted' }, or { t: 'denied', why }: 'code', 'tries'
//   relay -> game  { t: 'asks' }                an agent gave the code: the game answers { t: 'accept' } or closes
//   game <-> agent { d }                        anything, once accepted
//   either side closing ends both: a kick is the game's socket closed, and the game invites afresh for another.
import { randomBytes } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { addressOf, PerMinute } from './rooms.mjs';

/** what this relay's agent rooms speak, said in the agent's hi */
export const AGENT_VERSION = 1;
/** how long a code is good unjoined (ms) */
export const AGENT_CODE_TTL = 5 * 60_000;
/** wrong codes from one address a minute before it's turned away for the rest of it */
export const AGENT_TRIES_PER_MINUTE = 5;
/** invitations one address may ask for a minute */
export const INVITES_PER_MINUTE = 6;
/** the most invitations open at once */
export const INVITES_MOST = 50;
/** the most one message may be (bytes): a picture of the game's view goes in one */
export const AGENT_MSG_MAX = 4 * 1024 * 1024;
/** the pages a game may invite an agent from, by default: each PR's preview, each commit build, a dev build */
export const DEFAULT_AGENT_ORIGINS = 'https://pr-*.ls.wellscoped.dev,https://c-*.ls.wellscoped.dev,'
  + 'http://localhost:5173,http://localhost:5199';
/** how long an agent has to give its code (ms) */
const CODE_WAIT = 15_000;
const CODE_BYTES = 24;
/** each socket's budget a second, with a burst of two seconds' worth */
const RATE = { msgs: 60, bytes: 2 * AGENT_MSG_MAX };

/** Whether `origin` is the live game's: its domain, or the github.io address it moved from. No agent room is ever
 *  opened for one, whatever `agentOrigins` holds. */
export function isProduction(origin) {
  let host;
  try { host = new URL(origin).hostname; } catch { return true; }
  return host === 'last-stand.cc' || host.endsWith('.last-stand.cc') || host.endsWith('.github.io')
    || host === 'ls.wellscoped.dev';
}

/**
 * The agent rooms of a relay. `origins` the pages that may invite (something with `has(origin)`), `ttl` how long a
 * code is good unjoined. `faults` are the lab's canaries alone: `agentReuse` leaves a code good after its join (a
 * second agent then takes the first's place), `agentUngated` passes an agent's messages on before the game accepted
 * it (the game's own hold is then all that stands). Returns `upgrade` (an HTTP upgrade under /agent/), `tick` (dead sockets
 * closed, old counts let go) and `close`.
 */
export function agentRooms({ origins, ttl = AGENT_CODE_TTL, faults = {}, log = () => {} }) {
  /** code -> { code, game, agent, accepted, timer } */
  const invites = new Map();
  const tries = new PerMinute(AGENT_TRIES_PER_MINUTE), opens = new PerMinute(INVITES_PER_MINUTE);
  const wss = new WebSocketServer({ noServer: true, maxPayload: AGENT_MSG_MAX });

  const say = (ws, msg) => { if (ws?.readyState === 1) ws.send(JSON.stringify(msg)); };
  const refuse = (socket, status, text) => socket.end(`HTTP/1.1 ${status} ${text}\r\n\r\n`);
  function deny(ws, why) { say(ws, { t: 'denied', why }); ws.close(4003, why); }

  /** An HTTP upgrade for `/agent/<kind>`: a game opening an invitation, or an agent joining one. */
  function upgrade(req, socket, head, kind) {
    const origin = req.headers.origin ?? '', address = addressOf(req);
    if (kind === 'open') {
      if (!origin || isProduction(origin) || !origins.has(origin)) { refuse(socket, 403, 'Forbidden'); return; }
      if (invites.size >= INVITES_MOST) { refuse(socket, 503, 'Full'); return; }
      if (!opens.spend(address)) { refuse(socket, 429, 'Too Many Requests'); return; }
      wss.handleUpgrade(req, socket, head, (ws) => opened(ws, origin));
      return;
    }
    // (an agent is a command line: a browser always sends its Origin, so a page somewhere is never one)
    if (kind !== 'join' || origin) { refuse(socket, 403, 'Forbidden'); return; }
    wss.handleUpgrade(req, socket, head, (ws) => arrived(ws, address));
  }

  /** Each message of `ws` within its budget, parsed, to `take`. */
  function listen(ws, take) {
    const bucket = { msgs: RATE.msgs * 2, bytes: RATE.bytes * 2, at: Date.now() };
    ws.alive = true;
    ws.on('pong', () => { ws.alive = true; });
    ws.on('message', (raw, binary) => {
      const now = Date.now(), dt = (now - bucket.at) / 1000;
      bucket.at = now;
      bucket.msgs = Math.min(RATE.msgs * 2, bucket.msgs + dt * RATE.msgs) - 1;
      bucket.bytes = Math.min(RATE.bytes * 2, bucket.bytes + dt * RATE.bytes) - raw.length;
      if (binary || bucket.msgs < 0 || bucket.bytes < 0) return;
      let m;
      try { m = JSON.parse(raw.toString()); } catch { return; }
      if (m && typeof m === 'object') take(m);
    });
  }

  /** Both of an invitation's sockets closed, and its code gone. */
  function end(invite, why) {
    if (invites.get(invite.code) === invite) invites.delete(invite.code);
    clearTimeout(invite.timer);
    for (const ws of [invite.game, invite.agent]) {
      if (ws && ws.readyState <= 1) { say(ws, { t: 'end', why }); ws.close(4004, why); }
    }
  }

  /** A game's socket: its invitation made, the code handed to it. */
  function opened(ws, origin) {
    const code = randomBytes(CODE_BYTES).toString('base64url');
    const invite = { code, game: ws, agent: null, accepted: false, spent: false, timer: null };
    invites.set(code, invite);
    invite.timer = setTimeout(() => { if (!invite.agent) end(invite, 'expired'); }, ttl);
    log('agent invite', origin, `(${invites.size} open)`);
    say(ws, { t: 'invite', code, ttl });
    listen(ws, (m) => {
      if (m.t === 'accept') {
        if (!invite.agent || invite.accepted) return;
        invite.accepted = true;
        log('agent accepted', origin);
        say(invite.agent, { t: 'accepted' });
      } else if ('d' in m && invite.accepted) say(invite.agent, { d: m.d });
    });
    ws.on('close', () => end(invite, 'game'));
  }

  /** An agent's socket: its code asked for, and with a good one it waits for the game to accept it. */
  function arrived(ws, address) {
    if (tries.spent(address)) { deny(ws, 'tries'); return; }
    const timer = setTimeout(() => ws.close(4003, 'code'), CODE_WAIT);
    let invite = null;
    listen(ws, (m) => {
      if (invite) {
        // (nothing of the agent's reaches the game before the game has accepted it)
        const passes = invite.accepted || faults.agentUngated;
        if ('d' in m && passes && invite.agent === ws) say(invite.game, { d: m.d });
        return;
      }
      clearTimeout(timer);
      const found = m.t === 'code' && typeof m.code === 'string' ? invites.get(m.code) : null;
      const good = found && (!found.spent || faults.agentReuse);
      if (!good) {
        log('agent: wrong code from', address);
        deny(ws, tries.spend(address) ? 'code' : 'tries');
        return;
      }
      invite = found;
      // (spent as it joins: the code never lets a second agent in)
      const before = invite.agent;
      invite.spent = true;
      invite.agent = ws;
      invite.accepted = false;
      clearTimeout(invite.timer);
      if (before) before.close(4004, 'replaced');
      say(ws, { t: 'hi', v: AGENT_VERSION });
      say(invite.game, { t: 'asks' });
    });
    ws.on('close', () => {
      clearTimeout(timer);
      if (invite && invite.agent === ws) end(invite, 'agent');
    });
  }

  function tick() {
    for (const ws of wss.clients) {
      if (!ws.alive) { ws.terminate(); continue; }
      ws.alive = false;
      ws.ping();
    }
    tries.prune();
    opens.prune();
  }

  function close() {
    for (const invite of invites.values()) clearTimeout(invite.timer);
    for (const ws of wss.clients) ws.terminate();
  }

  return { upgrade, tick, close, open: () => invites.size };
}
