// An agent's link to a game it was invited into (#529): a socket on our relay's agent room (server/relay/agents.mjs),
// joined with the one-time code the game's developer panel showed, then the steps the game's side answers
// (src/dev/agentSteps.ts: look, picture, set, eval). `lab join` holds one for a coding session; `lab invite` checks
// the whole path with one. A command line's socket: Node's own WebSocket, which sends no Origin (the relay turns a
// page's away).
import { labError } from './errors.mjs';

/** the relay the game's builds meet on */
export const AGENT_SERVER = 'wss://ls.wellscoped.dev';
/** how long the relay is given to answer a code, and a step its answer by default (ms) */
const HI_MS = 20_000;
export const STEP_MS = 30_000;

/** why the relay turned a join away, in words */
const DENIED = {
  code: 'that code is wrong, used already or expired: ask for a new one (F8, Invite agent)',
  tries: 'too many wrong codes from this address: wait a minute',
};
/** why a link ended, in words */
const ENDED = {
  game: 'the game ended it (kicked, co-op opened, or its tab closed)',
  agent: 'this side left',
  expired: 'the code expired',
  replaced: 'another agent took its place',
};

/** Why a link ended, in words. */
export const endedText = (why) => ENDED[why] ?? `the link to the relay was lost (${why || 'no reason given'})`;

/** A joined game: whether its player has let the agent in, its steps, and its end. */
export class AgentLink {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.isAccepted = false;
    this.endedWhy = null;
    /** why the relay said it ends, before the socket closes */
    this.why = null;
    /** resolves once the game's player has let the agent in; rejects if the link ends first */
    this.accepted = new Promise((resolve, reject) => {
      this.onAccepted = resolve;
      this.onRefused = reject;
    });
    this.accepted.catch(() => {});
    /** resolves, with why, once the link has ended */
    this.ended = new Promise((resolve) => {
      this.onEnded = resolve;
    });
  }

  /** A message of the relay's or the game's. */
  take(message) {
    if (message.t === 'accepted') {
      this.isAccepted = true;
      this.onAccepted();
    } else if (message.t === 'end') {
      this.why = message.why;
    } else if (message.d && typeof message.d === 'object') {
      this.answered(message.d);
    }
  }

  answered(reply) {
    const waiting = this.pending.get(reply.id);
    if (!waiting) return;
    this.pending.delete(reply.id);
    clearTimeout(waiting.timer);
    if (reply.ok) waiting.resolve(reply.result);
    else waiting.reject(labError(`the game answered ${waiting.step} with an error: ${reply.error}`));
  }

  closed(reason) {
    if (this.endedWhy !== null) return;
    this.endedWhy = this.why ?? reason ?? '';
    const error = labError(`the link ended: ${endedText(this.endedWhy)}`);
    this.onRefused(error);
    for (const waiting of this.pending.values()) {
      clearTimeout(waiting.timer);
      waiting.reject(error);
    }
    this.pending.clear();
    this.onEnded(this.endedWhy);
  }

  /**
   * A step sent to the game (`look`, `picture`, `set`, `eval`, with its `args`), and its result; throws if the game
   * answers with an error, the link ends, or no answer comes in `ms`.
   */
  step(step, args = {}, ms = STEP_MS) {
    if (this.endedWhy !== null) return Promise.reject(labError(`the link ended: ${endedText(this.endedWhy)}`));
    if (!this.isAccepted) return Promise.reject(labError('the game\'s player hasn\'t let the agent in yet'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(labError(`the game didn't answer ${step} in ${ms / 1000} s (is its tab in view?)`));
      }, ms);
      this.pending.set(id, { step, resolve, reject, timer });
      this.ws.send(JSON.stringify({ d: { id, step, ...args } }));
    });
  }

  /** A message sent as it is, whatever the link's state (a check's: what the relay must hold back). */
  sendRaw(message) {
    this.ws.send(JSON.stringify(message));
  }

  /** The link left. */
  close() {
    this.why = this.why ?? 'agent';
    this.ws.close();
  }
}

/**
 * Joins the game that showed `code`, on the relay at `server` (ws:// or wss://). Resolves to its link once the relay
 * has taken the code: the game then asks its player, and `link.accepted` resolves as he lets it in. Throws, saying
 * why, at a code the relay turns away or a relay that doesn't answer.
 */
export function joinGame({ server = AGENT_SERVER, code }) {
  const address = `${server.replace(/^http/, 'ws').replace(/\/+$/, '')}/agent/join`;
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(address);
    const link = new AgentLink(ws);
    let joined = false;
    const timer = setTimeout(() => {
      ws.close();
      reject(labError(`the relay at ${server} didn't answer in ${HI_MS / 1000} s`));
    }, HI_MS);
    ws.addEventListener('open', () => ws.send(JSON.stringify({ t: 'code', code })));
    ws.addEventListener('message', (event) => {
      let message;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (joined) {
        link.take(message);
      } else if (message.t === 'hi') {
        joined = true;
        clearTimeout(timer);
        resolve(link);
      } else if (message.t === 'denied') {
        clearTimeout(timer);
        reject(labError(`the relay refused the join: ${DENIED[message.why] ?? message.why}`));
      }
    });
    ws.addEventListener('close', (event) => {
      clearTimeout(timer);
      if (joined) link.closed(event.reason);
      else reject(labError(`no agent room at ${address} (is the relay up, and new enough to have them?)`));
    });
    ws.addEventListener('error', () => {});
  });
}
