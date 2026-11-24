// The relay's agent rooms (agents.mjs) through its real sockets: who may open one, the code's one use and its expiry,
// nothing passed before the game accepts, wrong codes counted, and either side's leaving ending both. Each check was
// shown to fail with what it guards switched off (the `agentReuse` fault, or the line taken out).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { startRelay } from '../relay.mjs';
import { AGENT_TRIES_PER_MINUTE, AGENT_VERSION, isProduction } from '../agents.mjs';

const PRODUCTION = 'https://last-stand.cc', PREVIEW = 'https://pr-7.ls.wellscoped.dev';
const COMMIT_BUILD = 'https://c-0123456789ab.ls.wellscoped.dev';
const ORIGINS = `${PRODUCTION},https://pr-*.ls.wellscoped.dev,https://c-*.ls.wellscoped.dev`;
const TTL = 400;

let server, base, addressNo = 0;
const quiet = () => {};
before(async () => {
  server = await startRelay({ port: 0, origins: ORIGINS, log: quiet, agentTtl: TTL });
  base = `127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** an address of its own, as Traefik would name it: the wrong codes of one test never count against another's */
const newAddress = () => `10.9.0.${++addressNo}`;

/** A socket on the relay at `path`: its messages kept in order, with a wait for the next of a kind. */
function connect(path, { origin, address = newAddress(), at = base } = {}) {
  const headers = { 'x-forwarded-for': address };
  const ws = new WebSocket(`ws://${at}${path}`, origin ? { origin, headers } : { headers });
  const got = [], waiting = [];
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    const i = waiting.findIndex((w) => w.kind(m));
    if (i >= 0) waiting.splice(i, 1)[0].resolve(m); else got.push(m);
  });
  const closed = new Promise((resolve) => ws.on('close', (code) => resolve(code)));
  const refused = new Promise((resolve) => {
    ws.on('unexpected-response', (request, response) => resolve(response.statusCode));
    ws.on('open', () => resolve(0));
    ws.on('error', () => {});
  });
  const next = (kind) => {
    const i = got.findIndex(kind);
    if (i >= 0) return Promise.resolve(got.splice(i, 1)[0]);
    return new Promise((resolve, reject) => {
      waiting.push({ kind, resolve });
      setTimeout(() => reject(new Error('no such message came')), 3000);
    });
  };
  const none = async (kind, ms = 150) => { await sleep(ms); return !got.some(kind); };
  return { ws, next, none, closed, refused, send: (m) => ws.send(JSON.stringify(m)), t: (t) => next((m) => m.t === t) };
}

/** A game's invitation opened from `origin`; its code. */
async function invite(origin = PREVIEW, at = base) {
  const game = connect('/agent/open', { origin, at });
  const { code, ttl } = await game.t('invite');
  return { game, code, ttl };
}

/** An agent joined with `code`, up to the relay's hi. */
async function join(code, options = {}) {
  const agent = connect('/agent/join', options);
  await agent.refused;
  agent.send({ t: 'code', code });
  return agent;
}

test('only a preview, a commit build or a dev build opens an agent room, never production', async () => {
  for (const origin of [PREVIEW, COMMIT_BUILD]) {
    const { game, code } = await invite(origin);
    assert.match(code, /^[\w-]{32}$/, 'the code is 24 random bytes');
    game.ws.close();
  }
  assert.equal(await connect('/agent/open', { origin: PRODUCTION }).refused, 403, 'production opened an agent room');
  assert.equal(await connect('/agent/open', { origin: 'https://evil.example' }).refused, 403);
  assert.equal(await connect('/agent/open', {}).refused, 403, 'no Origin opened one');
});

test('production is refused whatever the relay is set to take', async () => {
  const lax = await startRelay({ port: 0, origins: ORIGINS, log: quiet, agentOrigins: `${PRODUCTION},https://victorzakharov.github.io,${PREVIEW}` });
  const at = `127.0.0.1:${lax.address().port}`;
  assert.equal(await connect('/agent/open', { origin: PRODUCTION, at }).refused, 403);
  assert.equal(await connect('/agent/open', { origin: 'https://victorzakharov.github.io', at }).refused, 403);
  assert.equal(await connect('/agent/open', { origin: PREVIEW, at }).refused, 0, 'the preview it takes was refused');
  for (const origin of [PRODUCTION, 'https://www.last-stand.cc', 'https://victorzakharov.github.io', 'not an origin']) {
    assert.ok(isProduction(origin), `${origin} isn't counted as production`);
  }
  assert.ok(!isProduction(PREVIEW) && !isProduction(COMMIT_BUILD) && !isProduction('http://localhost:5173'));
  await new Promise((resolve) => lax.close(resolve));
});

test('an agent with the code waits for the game to accept it, and nothing passes before', async () => {
  const { game, code } = await invite();
  const agent = await join(code);
  assert.equal((await agent.t('hi')).v, AGENT_VERSION);
  await game.t('asks');
  agent.send({ d: { id: 1, step: 'eval', code: '1' } });
  game.send({ d: 'early' });
  assert.ok(await game.none((m) => 'd' in m), 'the agent\'s message reached the game before it accepted');
  assert.ok(await agent.none((m) => 'd' in m, 20), 'the game\'s message reached an agent it hadn\'t accepted');
  game.send({ t: 'accept' });
  await agent.t('accepted');
  agent.send({ d: { id: 2, step: 'look' } });
  assert.deepEqual(await game.next((m) => 'd' in m), { d: { id: 2, step: 'look' } });
  game.send({ d: { id: 2, ok: true } });
  assert.deepEqual(await agent.next((m) => 'd' in m), { d: { id: 2, ok: true } });
  game.ws.close();
  assert.equal((await agent.t('end')).why, 'game', 'the game\'s leaving (a kick) didn\'t end the agent');
  assert.equal(await agent.closed, 4004);
});

test('a code is good once: a second agent is refused while the first is in, and after it left', async () => {
  const { game, code } = await invite();
  const first = await join(code);
  await first.t('hi');
  const second = await join(code);
  assert.equal((await second.t('denied')).why, 'code', 'a second agent got in on the same code');
  assert.equal(await second.closed, 4003);
  game.send({ t: 'accept' });
  await first.t('accepted');
  first.ws.close();
  assert.equal((await game.t('end')).why, 'agent');
  const late = await join(code);
  assert.equal((await late.t('denied')).why, 'code', 'a used code let an agent in');
});

test('a code no agent joined with expires', async () => {
  const { game, code, ttl } = await invite();
  assert.equal(ttl, TTL);
  assert.equal((await game.t('end')).why, 'expired');
  assert.equal(await game.closed, 4004);
  const agent = await join(code);
  assert.equal((await agent.t('denied')).why, 'code', 'an expired code let an agent in');
});

test('a joined agent\'s invitation does not expire under it', async () => {
  const { game, code } = await invite();
  const agent = await join(code);
  await agent.t('hi');
  await sleep(TTL + 150);
  game.send({ t: 'accept' });
  await agent.t('accepted');
  game.ws.close();
});

test('wrong codes from one address are counted a minute', async () => {
  const address = newAddress(), whys = [];
  for (let i = 0; i < AGENT_TRIES_PER_MINUTE + 2; i++) {
    const agent = await join(`wrong-${i}`, { address });
    whys.push((await agent.t('denied')).why);
  }
  const expected = [...Array(AGENT_TRIES_PER_MINUTE).fill('code'), 'tries', 'tries'];
  assert.deepEqual(whys, expected);
  // (and the right code is no use to that address for the rest of its minute, nor a wrong one to another's)
  const { game, code } = await invite();
  const blocked = await join(code, { address });
  assert.equal((await blocked.t('denied')).why, 'tries');
  const other = await join(code);
  await other.t('hi');
  game.ws.close();
});

test('an agent is a command line: a page\'s socket, with an Origin, is turned away', async () => {
  assert.equal(await connect('/agent/join', { origin: PREVIEW }).refused, 403);
  assert.equal(await connect('/agent/join', { origin: 'https://evil.example' }).refused, 403);
  assert.equal(await connect('/agent/elsewhere', {}).refused, 403);
});

test('an agent that gives no code, or anything else first, is turned away', async () => {
  const agent = connect('/agent/join');
  await agent.refused;
  agent.send({ d: { step: 'eval', code: '1' } });
  assert.equal((await agent.t('denied')).why, 'code');
});

test('co-op\'s rooms are as they were beside the agent rooms', async () => {
  const a = new WebSocket(`ws://${base}/room/last-stand-coop-1/AGENTS?id=a`, { origin: PRODUCTION });
  const hi = await new Promise((resolve) => a.on('message', (raw) => resolve(JSON.parse(raw.toString()))));
  assert.equal(hi.t, 'hi');
  a.close();
  // (and a co-op room named "agent" is no way into one)
  assert.equal(await connect('/room/agent/open?id=x', { origin: 'https://evil.example' }).refused, 403);
});

test('the canaries\' faults are caught: a used code left good, messages passed before the game accepted', async () => {
  const faults = { agentReuse: true, agentUngated: true };
  const faulty = await startRelay({ port: 0, origins: ORIGINS, log: quiet, faults });
  const at = `127.0.0.1:${faulty.address().port}`;
  const { game, code } = await invite(PREVIEW, at);
  const first = await join(code, { at });
  await first.t('hi');
  const second = await join(code, { at });
  assert.equal((await second.t('hi')).v, AGENT_VERSION, 'the fault turned the second agent away');
  second.send({ d: 'early' });
  assert.deepEqual(await game.next((m) => 'd' in m), { d: 'early' }, 'the fault held the early message back');
  game.ws.close();
  await new Promise((resolve) => faulty.close(resolve));
});
