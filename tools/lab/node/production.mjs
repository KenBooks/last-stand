// Production's services kept away from the lab's pages (#595). The game's build names production's host for the saves
// service, the co-op relay and the traces service (src/loot/cloudApi.ts, src/net/transport.ts: `VITE_COOP_SERVER`,
// else `ls.wellscoped.dev`), and a page of the lab's is a dev build of it on localhost: whatever it asks of that host
// never leaves the browser. The save slots' health is answered by the lab in production's place (no Google sign-in,
// as a service with no Google client says), and so is a slow-game report (nothing: a lab page's report belongs nowhere,
// and one sent as a slow stretch is met is no fault of the command's); every other request, and every WebSocket, is refused and kept as an ask,
// which fails the command that made it (session.mjs, and `ui` state by state: commands.mjs). A command with services
// of its own (`cloud`, `recorder`, `profile`) points the page at them on localhost, which this never touches.

/** production's host, as the game's build names it */
export const PRODUCTION_HOST = 'ls.wellscoped.dev';
/** any address on production's host, over HTTP(S) or a WebSocket (a port or none) */
const ON_PRODUCTION = /^(?:https?|wss?):\/\/ls\.wellscoped\.dev(?::\d+)?(?:[/?#]|$)/i;
/** production's saves service asked what it has on (src/loot/cloudApi.ts `serviceHealth`: the save slots screen asks
 *  as it opens) */
export const SAVES_HEALTH = `https://${PRODUCTION_HOST}/saves/health`;
/** the lab's answer in its place: no Google sign-in */
const NO_GOOGLE = { google: false };
/** where the game sends a slow-game report (src/perf/upload.ts, server/traces) */
export const SLOW_REPORTS = `https://${PRODUCTION_HOST}/traces`;
/** what the browser logs for a request the guard refused (the ask is reported in its place) */
const REFUSED = 'net::ERR_BLOCKED_BY_CLIENT';

/** Whether `url` is on production's host. */
export function isProduction(url) {
  return ON_PRODUCTION.test(String(url));
}

/** Whether a console error is the browser's line for a request the guard refused (the ask says it instead). */
export function isRefusedLine(text, url) {
  return String(text).includes(REFUSED) && isProduction(url);
}

/**
 * The guard of a side's pages: attached to each browser context it opens, it answers the saves service's health,
 * refuses the rest, and keeps what was asked (`take`).
 */
export class ProductionGuard {
  constructor() {
    /** what the pages asked of production since it was last taken: `GET https://...`, `WebSocket wss://...` */
    this.asks = [];
    /** whether the lab answers the saves service's health; the `ui` canary lets it go to production's host again */
    this.answersHealth = true;
  }

  /** Guards every page of `context` from now on. */
  async attach(context) {
    await context.route(ON_PRODUCTION, (route) => this.onRequest(route));
    await context.routeWebSocket(ON_PRODUCTION, (socket) => this.onSocket(socket));
  }

  /**
   * A request to production: the health answered while the lab answers it, a slow-game report answered with nothing,
   * anything else refused and kept.
   */
  onRequest(route) {
    const request = route.request();
    if (this.answersHealth && request.url() === SAVES_HEALTH) return answerHealth(route);
    if (request.url() === SLOW_REPORTS) return answerReport(route);
    this.asks.push(`${request.method()} ${request.url()}`);
    return route.abort('blockedbyclient');
  }

  /** A WebSocket to production: kept, and closed before it reaches the server. */
  onSocket(socket) {
    this.asks.push(`WebSocket ${socket.url()}`);
    return socket.close();
  }

  /** What was asked since the last call, each ask once, in the order first asked. */
  take() {
    const asks = [...new Set(this.asks)];
    this.asks = [];
    return asks;
  }
}

/** the `ui` state the canary is judged at: the save slots screen asks the saves service's health as it opens */
export const CANARY_STATE = 'saves';

/**
 * A `ui` state's report with what it asked of production (`asks`, refused): a line, and each ask a problem of the
 * state's; with `canary`, the asks are the canary's plant reaching the guard, kept for its verdict (`asked`).
 */
export function withAsks(report, state, asks, canary) {
  const said = asks.length ? `${asks.length} refused: ${asks.join(', ')}` : 'nothing';
  const text = `${report.text}\n  asked of production: ${said}`;
  if (canary) return { ...report, text, asked: asks.length };
  const problems = [...report.problems, ...asks.map((ask) => `${state}: asked production: ${ask}`)];
  return { ...report, text, problems, asked: asks.length };
}

/**
 * The `ui` canary's verdict, with its line: the lab's answer to the saves service's health lifted for the run, the
 * save slots must ask production's host for it and be refused. Judged at `CANARY_STATE` alone, which always asks;
 * a run without it says the canary wasn't planted where it's judged.
 */
export function canaryVerdict(states, reports) {
  const at = states.indexOf(CANARY_STATE);
  if (at < 0) return { line: `  canary: the save slots' health sent to production: not judged (no ${CANARY_STATE})` };
  const caught = reports[at].asked > 0;
  const line = `  canary: the save slots' health sent to production: ${caught ? 'caught' : 'went unseen'}`;
  return caught ? { line } : { line, problem: `${CANARY_STATE}: the canary's request to production went unseen` };
}

/**
 * The lab's answer to a slow-game report, readable from the page's origin: nothing (204: the game reads no code in it
 * and counts the report not sent). Sent by the game itself as a co-op run or a `ui` state meets a slow stretch, it was
 * refused by production's CORS before the guard, a page error in the command (from Victor on #635: "we don't want any
 * fake page errors"), and refused by the guard it would fail the command as an ask: neither is the command's fault. A
 * bug report, sent only when the player asks, goes to /traces/reports and is still refused and kept.
 */
function answerReport(route) {
  return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
}

/** The lab's answer to the saves service's health, readable from the page's origin. */
function answerHealth(route) {
  const headers = { 'access-control-allow-origin': '*' };
  return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(NO_GOOGLE) });
}
