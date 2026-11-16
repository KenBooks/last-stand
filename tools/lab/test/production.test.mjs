// Production kept away from the lab's pages (#595): which addresses are production's, what the guard answers, refuses
// and keeps, and the `ui` command's verdicts on a state's asks and on its canary.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canaryVerdict, isProduction, isRefusedLine, ProductionGuard, SAVES_HEALTH, SLOW_REPORTS, withAsks,
} from '../node/production.mjs';

/** A route as Playwright hands one over, keeping what was done with it. */
function fakeRoute(url, method = 'GET') {
  const done = [];
  return {
    done,
    request: () => ({ url: () => url, method: () => method }),
    fulfill: (answer) => done.push({ fulfilled: answer }),
    abort: (why) => done.push({ aborted: why }),
  };
}

/** A WebSocket route as Playwright hands one over, keeping whether it was closed. */
function fakeSocket(url) {
  const socket = { closed: false, url: () => url };
  socket.close = () => {
    socket.closed = true;
  };
  return socket;
}

test('production is its host alone, over HTTP(S) and WebSockets', () => {
  for (const url of ['https://ls.wellscoped.dev/saves/health', 'wss://ls.wellscoped.dev',
    'http://LS.wellscoped.dev:443/x', 'https://ls.wellscoped.dev?x=1']) {
    assert.equal(isProduction(url), true, url);
  }
  for (const url of ['https://pr-12.ls.wellscoped.dev/', 'http://127.0.0.1:5198/saves/health',
    'https://ls.wellscoped.dev.example/', 'http://localhost:5198/?server=https://ls.wellscoped.dev']) {
    assert.equal(isProduction(url), false, url);
  }
});

test('the browser\'s line for a refused request is the guard\'s alone', () => {
  const line = 'Failed to load resource: net::ERR_BLOCKED_BY_CLIENT';
  assert.equal(isRefusedLine(line, SAVES_HEALTH), true);
  assert.equal(isRefusedLine(line, 'http://localhost:5198/x.png'), false);
  assert.equal(isRefusedLine('TypeError: x is undefined', SAVES_HEALTH), false);
});

test('the guard answers the saves service\'s health and refuses and keeps the rest', async () => {
  const guard = new ProductionGuard();
  const health = fakeRoute(SAVES_HEALTH);
  await guard.onRequest(health);
  assert.equal(health.done[0].fulfilled.status, 200);
  assert.deepEqual(JSON.parse(health.done[0].fulfilled.body), { google: false });
  const account = fakeRoute('https://ls.wellscoped.dev/saves/account', 'POST');
  await guard.onRequest(account);
  assert.deepEqual(account.done, [{ aborted: 'blockedbyclient' }]);
  const socket = fakeSocket('wss://ls.wellscoped.dev/room');
  await guard.onSocket(socket);
  assert.equal(socket.closed, true);
  await guard.onRequest(fakeRoute('https://ls.wellscoped.dev/saves/account', 'POST'));
  const asks = ['POST https://ls.wellscoped.dev/saves/account', 'WebSocket wss://ls.wellscoped.dev/room'];
  assert.deepEqual(guard.take(), asks);
  assert.deepEqual(guard.take(), []);
});

test('a slow-game report is answered with nothing and kept as no ask; a bug report is refused', async () => {
  const guard = new ProductionGuard();
  const report = fakeRoute(SLOW_REPORTS, 'POST');
  await guard.onRequest(report);
  assert.equal(report.done[0].fulfilled.status, 204);
  assert.equal(report.done[0].fulfilled.headers['access-control-allow-origin'], '*');
  const bug = fakeRoute(`${SLOW_REPORTS}/reports`, 'POST');
  await guard.onRequest(bug);
  assert.deepEqual(bug.done, [{ aborted: 'blockedbyclient' }]);
  assert.deepEqual(guard.take(), [`POST ${SLOW_REPORTS}/reports`]);
});

test('with the lab\'s answer lifted (the canary), the health is refused and kept too', async () => {
  const guard = new ProductionGuard();
  guard.answersHealth = false;
  const health = fakeRoute(SAVES_HEALTH);
  await guard.onRequest(health);
  assert.deepEqual(health.done, [{ aborted: 'blockedbyclient' }]);
  assert.deepEqual(guard.take(), [`GET ${SAVES_HEALTH}`]);
});

test('a state\'s asks are its problems, but the canary\'s plant when it runs', () => {
  const report = { text: 'saves', problems: [], moments: [] };
  const clean = withAsks(report, 'saves', [], false);
  assert.equal(clean.text, 'saves\n  asked of production: nothing');
  assert.deepEqual(clean.problems, []);
  const asked = withAsks(report, 'saves', [`GET ${SAVES_HEALTH}`], false);
  assert.deepEqual(asked.problems, [`saves: asked production: GET ${SAVES_HEALTH}`]);
  const planted = withAsks(report, 'saves', [`GET ${SAVES_HEALTH}`], true);
  assert.deepEqual(planted.problems, []);
  assert.equal(planted.asked, 1);
});

test('the canary is caught at the save slots, missed there a problem, and unjudged without them', () => {
  const caught = canaryVerdict(['lobby', 'saves'], [{ asked: 0 }, { asked: 1 }]);
  assert.match(caught.line, /caught/);
  assert.equal(caught.problem, undefined);
  const missed = canaryVerdict(['lobby', 'saves'], [{ asked: 1 }, { asked: 0 }]);
  assert.match(missed.line, /went unseen/);
  assert.ok(missed.problem);
  const unjudged = canaryVerdict(['lobby'], [{ asked: 0 }]);
  assert.match(unjudged.line, /not judged/);
  assert.equal(unjudged.problem, undefined);
});
