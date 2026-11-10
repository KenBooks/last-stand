// The lab's co-op: the link carrying the two games' messages (node/coop.mjs) and the judge of what each showed
// (node/coopJudge.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Way, judgeColours, judgeRoom, seededRandom } from '../node/coop.mjs';
import { drops, follow, judgeBlows, judgeRush, judgeShots, judgeStrike } from '../node/coopJudge.mjs';

/** A path along x at `speed` m a frame, `frames` long. */
const along = (frames, speed, from = 0) => Array.from({ length: frames }, (_, f) => [from + f * speed, 0]);

/** A guest's sample with only what a test sets. */
const sample = (fields) => ({ self: [0, 0], life: 100, partner: null, foes: [], struck: [], loosed: 0, ...fields });

test('a way delays every message, never reorders them, and is the same every time', () => {
  const sent = Array.from({ length: 200 }, (_, i) => ({ at: i * 16, name: 'room', data: i }));
  const carry = () => new Way({ delay: 150, jitter: 60, random: seededRandom(7) }).carry(sent);
  const arriving = carry();
  arriving.forEach((message, i) => {
    assert.ok(message.due >= sent[i].at + 150, 'no message comes sooner than the delay');
    if (i) assert.ok(message.due >= arriving[i - 1].due, 'none overtakes the one sent before it');
  });
  assert.deepEqual(carry(), arriving);
});

test('a copy a few frames behind its source is found that far behind, on its path', () => {
  const source = along(120, 0.1);
  const shown = source.map((_, f) => (f >= 9 ? source[f - 9] : null));
  const followed = follow(shown, source);
  assert.equal(followed.delay, 9);
  assert.ok(followed.off < 1e-9);
  assert.ok(followed.rough < 1e-9);
});

test('a copy that jumps is rough and its jump is seen', () => {
  const source = along(120, 0.1);
  const shown = source.map((point, f) => (f === 60 ? [point[0] + 0.3, 0] : point));
  const followed = follow(shown, source);
  assert.ok(followed.jump > 0.35);
  assert.ok(followed.rough > 0.03);
});

test('a source standing has no delay to find', () => {
  const source = along(60, 0);
  assert.equal(follow(source, source).still, true);
});

test('a life falling is a drop, its regeneration rounding up and down is not', () => {
  assert.deepEqual(drops([100, 100.2, 100, 90, 90.5, 85.5]), [{ frame: 3, amount: 10 }, { frame: 5, amount: 5 }]);
});

test('an arrow struck on the guest\'s screen counts if the host\'s foe loses life soon after', () => {
  const foe = (life) => ({ id: 1, x: 0, z: 0, life, blow: false, inReach: false });
  const lives = [100, 100, 100, 100, 80, 80, 80, 80];
  const host = lives.map((life) => sample({ foes: [foe(life)] }));
  const guest = lives.map((_, f) => sample({ foes: [foe(f >= 2 ? 80 : 100)], struck: f === 2 ? [1, 1] : [] }));
  const shots = judgeShots(host, guest);
  assert.equal(shots.struck, 2);
  assert.equal(shots.counted, 1, 'one fall of its life counts for one arrow');
  assert.deepEqual(shots.shownAfter, [0]);
});

test('a blow dodged on the guest\'s screen that hurt it is told apart from one that landed', () => {
  const foe = (blow, inReach) => ({ id: 1, x: 0, z: 0, life: 100, blow, inReach });
  const guest = Array.from({ length: 200 }, (_, f) => sample({
    life: f >= 12 ? (f >= 112 ? 80 : 90) : 100,
    foes: [foe(f === 10 || f === 110, f === 10)],
  }));
  const blows = judgeBlows(guest);
  assert.equal(blows.blows, 2);
  assert.equal(blows.inReachHurt, 1);
  assert.equal(blows.dodgedHurt, 1);
  assert.equal(blows.unexplained, 0);
});

test('a foe the guest\'s charge carried is judged on both screens, where it ended against its stop', () => {
  // (the guest charges 9 m along x over 30 frames; foe 1 rides before it and is thrown on, foe 2 is left behind on
  // the host's screen, foe 3 is never met)
  const frames = 60;
  const guestAt = (f) => [Math.min(f, 30) * 0.3, 0];
  const foe = (id, x, carried, up) => ({ id, x, z: 0, life: 100, blow: false, inReach: false, carried, up });
  const guest = Array.from({ length: frames }, (_, f) => sample({
    self: guestAt(f),
    foes: [foe(1, guestAt(f)[0] + 1 + Math.max(0, f - 30) * 0.1, f >= 10 && f < 30, f > 30 && f < 40 ? 0.5 : 0),
      foe(2, f < 20 ? 6 : guestAt(f)[0] + 1, f >= 20 && f < 30, f > 30 && f < 40 ? 0.5 : 0), foe(3, 20, false, 0)],
  }));
  const host = guest.map((one, f) => sample({
    partner: one.self,
    foes: [one.foes[0], foe(2, 6 - f * 0.05, false, 0), one.foes[2]],
  }));
  const met = judgeRush(host, guest);
  assert.deepEqual(met.map((one) => one.id), [1, 2], 'the foes carried on the guest\'s screen');
  assert.ok(met[0].here.thrown && met[0].there.carried && met[0].there.thrown);
  assert.ok(met[0].here.ended > 0.45 && met[0].there.ended > 0.45, 'foe 1 ended before the guest on both');
  assert.equal(met[1].there.carried, false);
  assert.ok(met[1].there.ended < 0, 'foe 2 ended behind the guest on the host\'s screen');
});

test('a Power Strike landed in the charge cast over it is judged on each screen, its build-up cut short found', () => {
  // (the strike is cast from frame 0 and lands at 30, the charge running from 20 to 45; on the host's screen its
  // copy stopped building as the charge landed, at 20, and was posed as the charge from 40)
  const act = (f, shownAsCharge, builtTo) => ({
    shown: f >= 20 && f < 45 && shownAsCharge(f) ? 'charge' : 'chop',
    under: f >= 20 && f < 45,
    dashing: f >= 20 && f < 45,
    casting: f < 36 ? 'powerStrike' : null,
    charging: f < builtTo,
    landed: [f === 20 ? 'bullRush' : null, f === 30 ? 'powerStrike' : null].filter(Boolean),
  });
  const frames = (acts) => Array.from({ length: 60 }, (_, f) => sample({ acts: acts(f) }));
  const guest = frames((f) => ({ self: act(f, () => false, 30), partner: null }));
  const host = frames((f) => ({ self: null, partner: act(f, (g) => g >= 40, 20) }));
  const own = judgeStrike(guest, 'self');
  assert.deepEqual(own, { together: 16, asCharge: 0, landed: 30, inCharge: true, builtTo: 30 });
  const copy = judgeStrike(host, 'partner');
  assert.equal(copy.builtTo, 20, 'the copy stopped building as the charge landed');
  assert.ok(copy.builtTo < copy.landed);
  assert.equal(copy.asCharge, 0, 'posed as the charge only once the strike was over');
  const unseen = judgeStrike(host.map((one) => ({ ...one, acts: undefined })), 'partner');
  assert.equal(unseen.landed, -1, 'a tree with no acts recorded never lands it');
});

/** A party's page state as page/coop.ts reports it, the room as `everyone` (slot and tag each) known to it. */
function roomState(self, everyone) {
  const partners = everyone.filter((other) => other.slot !== self.slot).sort((a, b) => a.slot - b.slot);
  return {
    slot: self.slot, tag: self.tag, partners: partners.length,
    partnerTags: partners.map((other) => other.tag), partnerSlots: partners.map((other) => other.slot),
  };
}

test('a room of four where every game knows every other by slot and tag is judged sound', () => {
  const everyone = ['Host', 'Guest', 'Third', 'Fourth'].map((tag, slot) => ({ slot, tag }));
  const states = everyone.map((self) => roomState(self, everyone));
  assert.deepEqual(judgeRoom(states, everyone.map((one) => one.tag)), []);
});

test('a room where two share a slot, or a game misses or misnames a partner, is caught', () => {
  const everyone = ['Host', 'Guest', 'Third'].map((tag, slot) => ({ slot, tag }));
  const tags = everyone.map((one) => one.tag);
  const shared = everyone.map((self) => roomState(self, everyone));
  shared[2] = { ...shared[2], slot: 0 };
  assert.ok(judgeRoom(shared, tags).some((problem) => problem.includes('share a slot')));
  const missing = everyone.map((self) => roomState(self, everyone));
  missing[1] = { ...missing[1], partners: 1, partnerTags: ['Host'], partnerSlots: [0] };
  assert.ok(judgeRoom(missing, tags).some((problem) => problem.includes('1 partners, not 2')));
  const misnamed = everyone.map((self) => roomState(self, everyone));
  misnamed[2] = { ...misnamed[2], partnerTags: ['Host', 'Third'] };
  assert.ok(judgeRoom(misnamed, tags).some((problem) => problem.includes('names its partners')));
});

/** A party's page state with colours: `everyone` (slot, tag, colour, worn each) as known to `self`. */
function colourState(self, everyone) {
  const partners = everyone.filter((other) => other.slot !== self.slot).sort((a, b) => a.slot - b.slot);
  return {
    ...roomState(self, everyone), colour: self.colour, worn: self.worn,
    partnerColours: partners.map((other) => other.colour), partnerWorn: partners.map((other) => other.worn),
  };
}

const PARTY = [['Host', 'red', 1], ['Guest', 'gold', 2], ['Third', 'blue', 3]];
const party = () => PARTY.map(([tag, colour, worn], slot) => ({ slot, tag, colour, worn }));

test('a party in colours of their own, each drawn as its own game draws it, is judged sound', () => {
  const everyone = party();
  const states = everyone.map((self) => colourState(self, everyone));
  const picked = ['red', null, 'red'];
  assert.deepEqual(judgeColours(states, everyone.map((one) => one.tag), picked), []);
});

test('two in one colour, a free pick passed over, or a partner shown otherwise, is caught', () => {
  const tags = PARTY.map(([tag]) => tag);
  const judged = (everyone, picked, change = (states) => states) =>
    judgeColours(change(everyone.map((self) => colourState(self, everyone))), tags, picked);
  const twice = party();
  twice[2].colour = 'red';
  assert.ok(judged(twice, [null, null, null]).some((problem) => problem.includes('two players wear one colour')));
  assert.ok(judged(party(), [null, 'purple', null]).some((problem) => problem.includes('picked purple, free')));
  const misdrawn = (states) => states.map((state, index) => (index ? state : { ...state, partnerWorn: [9, 9] }));
  assert.ok(judged(party(), [null, null, null], misdrawn).some((problem) => problem.includes('draws its partners')));
  const older = party().map((self) => ({ ...roomState(self, party()) }));
  assert.equal(judgeColours(older, tags, [null, null, null]), null);
});

test('a ping previewed while held, made as meant and shown on both screens passes; one unpreviewed, lost or drawn off the minimap is caught', async () => {
  const { judgePings } = await import('../node/coopPings.mjs');
  const planned = [{ by: 'guest', kind: 'spot', at: [4, 2], how: 'Left Shift let go on the floor', frame: 0, near: 0.3 }];
  const ping = (age, map = [4, 2]) => ({ slot: 1, kind: 'spot', x: 4, z: 2, r: 0.9, foe: null, age, pin: true, ring: true, map });
  const frames = 90, let_go = 20;
  const preview = { kind: 'spot', x: 4, z: 2, pin: true, ring: true };
  const guestOf = (previewed) => Array.from({ length: frames }, (_, f) => ({
    slot: 1, pings: f >= let_go ? [ping((f - let_go) / 60)] : [], preview: f < let_go && previewed ? preview : null, ...(f ? {} : { planned }),
  }));
  const guest = guestOf(true);
  const shown = (from, map) => Array.from({ length: frames }, (_, f) => ({ slot: 0, pings: f >= from ? [ping((f - from) / 60, map)] : [] }));
  const good = judgePings({ host: shown(40), guest, frameMs: 1000 / 60 });
  assert.deepEqual(good.problems, []);
  const unpreviewed = judgePings({ host: shown(40), guest: guestOf(false), frameMs: 1000 / 60 });
  assert.ok(unpreviewed.problems.some((p) => p.includes('previewed in 0')));
  const early = judgePings({ host: shown(10), guest, frameMs: 1000 / 60 });
  assert.ok(early.problems.some((p) => p.includes('before it was let go')));
  const lost = judgePings({ host: shown(frames), guest, frameMs: 1000 / 60 });
  assert.ok(lost.problems.some((p) => p.includes("never on the host's screen")));
  const off = judgePings({ host: shown(40, [6, 2]), guest, frameMs: 1000 / 60 });
  assert.ok(off.problems.some((p) => p.includes("the host's minimap drew it")));
});

test('a partner\'s ping held at the screen\'s edge in first person is found there, one in the middle or over the minimap is not', async () => {
  const { firstPersonEdge } = await import('../node/coopPings.mjs');
  const view = { mode: 'first', settled: true, screen: [1920, 1080], minimap: [1640, 40, 1900, 300] };
  const frames = (head) => Array.from({ length: 40 }, () => ({ view, pings: [{ slot: 0, pin: true, edge: true, head }] }));
  const atEdge = firstPersonEdge(frames([60, 540]), 1);
  assert.equal(atEdge.frames, 40);
  assert.ok(atEdge.farthest < 0.16);
  assert.ok(firstPersonEdge(frames([960, 540]), 1).farthest > 0.16);
  assert.equal(firstPersonEdge(frames([1800, 200]), 1).overMap, 40);
  assert.equal(firstPersonEdge(frames([60, 540]), 0).frames, 0, 'its own pings are not its partner\'s');
});
