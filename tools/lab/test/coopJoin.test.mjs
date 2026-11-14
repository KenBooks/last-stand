// The lab's co-op judge of a guest joining its host's run (node/coopJoin.mjs, #561).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JOIN_CANARY, JOIN_LABEL, judgeJoined, judgeReadying } from '../node/coopJoin.mjs';

/** A game's `JoinState` with only what a test sets. */
const join = (fields) => ({ shown: false, label: '', share: 0, onTop: false, line: '', cards: {}, ...fields });
/** A game's state with its join and whether its countdown is held. */
const state = (fields, held = false) => ({ held, join: join(fields) });

const readyingGuest = state({ shown: true, label: JOIN_LABEL, share: 0.5, onTop: true });
const waitingHost = state({ line: 'Waiting for Guest…', cards: { Guest: 'Readying 50%' } }, true);

test('a guest readying under its bar, named by the host, passes', () => {
  const { problems } = judgeReadying({ host: waitingHost, guest: readyingGuest, guestTag: 'Guest', share: 0.5 });
  assert.deepEqual(problems, []);
});

test('a guest with no bar while it readies is the canary\'s problem', () => {
  const guest = state({});
  const { problems } = judgeReadying({ host: waitingHost, guest, guestTag: 'Guest', share: 0.5 });
  assert.equal(problems.length, 1);
  assert.ok(problems[0].includes(JOIN_CANARY));
});

test('a bar under something, a host saying nothing of the guest, or the wrong share are each found', () => {
  const guest = state({ shown: true, label: JOIN_LABEL, share: 0.2, onTop: false });
  const host = state({ line: 'Waiting for players…', cards: { Guest: '' } }, true);
  const { problems } = judgeReadying({ host, guest, guestTag: 'Guest', share: 0.5 });
  assert.equal(problems.length, 4);
});

test('a host not holding its countdown is not asked to name the guest', () => {
  const host = state({ line: 'Wave 1 begins in 3…', cards: { Guest: 'Readying 50%' } });
  const { problems } = judgeReadying({ host, guest: readyingGuest, guestTag: 'Guest', share: 0.5 });
  assert.deepEqual(problems, []);
});

test('a guest in its run, its bar drawn as it began and gone now, passes', () => {
  const host = state({ line: 'Wave 1 begins in 3…', cards: { Guest: '' } });
  const seen = { frames: 3, asRunBegan: true };
  const { problems } = judgeJoined({ host, guest: state({}), guestTag: 'Guest', seen, what: 'warm' });
  assert.deepEqual(problems, []);
});

test('a bar never shown, not drawn as the run began, or left up are each found', () => {
  const host = state({ line: 'Waiting for Guest…', cards: { Guest: 'Readying 100%' } });
  const never = judgeJoined({ host, guest: state({}), guestTag: 'Guest', seen: { frames: 0, asRunBegan: false }, what: 'warm' });
  assert.ok(never.problems.some((problem) => problem.includes('never showed')));
  assert.equal(never.problems.length, 3);
  const late = judgeJoined({
    host: state({}), guest: state({ shown: true }), guestTag: 'Guest', seen: { frames: 2, asRunBegan: false }, what: 'cold',
  });
  assert.equal(late.problems.length, 2);
});
