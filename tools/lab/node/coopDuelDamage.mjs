// Known hits through the ordinary duel link, read on the hero who took them.

const RAW_HIT = 100;
const HALF_DAMAGE = 0.5;
const SINGLE_HIT_CAP = 0.6;
const ROUNDING = 0.02;

/** Wait for the receiving page's applied-damage total, across different page clocks and link delays. */
async function waitForHit(pair, read, before) {
  const maxDelay = pair.link.delay + pair.link.jitter;
  const limit = Math.ceil(maxDelay / pair.frameMs) + 60;
  let after = before;
  for (let frames = 0; frames < limit; frames += pair.turnFrames) {
    await pair.turn(Math.min(pair.turnFrames, limit - frames));
    after = await read();
    if (after.taken !== before.taken) return after;
  }
  return after;
}

/** Check the shipped balance and the receiver's single-hit cap in both directions. */
export async function checkDuelDamage(pair, callPage, lines, { canary }) {
  const problems = [];
  const roles = ['host', 'guest'];
  for (const [index, sender] of pair.pages.entries()) {
    const target = pair.pages[1 - index];
    const read = () => callPage(target, 'coopDuelTaken');
    const direction = `${roles[index]} to ${roles[1 - index]}`;
    const before = await read();
    const mitigation = 1 - before.resist / 100;
    const expected = RAW_HIT * HALF_DAMAGE * mitigation;
    const oldRate = canary && index === 0;
    await callPage(sender, 'coopDuelDeal', { amount: RAW_HIT, oldRate });
    const after = await waitForHit(pair, read, before);
    const dealt = after.taken - before.taken;
    const line = `${direction}: ${RAW_HIT} raw damage took ${dealt.toFixed(2)} health`;
    if (oldRate) {
      const caught = Math.abs(dealt - expected / 2) <= ROUNDING && Math.abs(dealt - expected) > ROUNDING;
      lines.push(`${line}; canary: the old 25% rate ${caught ? 'caught' : 'went unseen'}`);
      if (!caught) problems.push('duel damage: the quarter-rate canary was not measured');
    } else {
      lines.push(`${line} (${expected.toFixed(2)} expected)`);
      if (Math.abs(dealt - expected) > ROUNDING) problems.push(`duel damage: ${direction} missed the 50% rate`);
    }

    const large = before.maxLife * 2;
    const capped = before.maxLife * SINGLE_HIT_CAP * mitigation;
    await callPage(sender, 'coopDuelDeal', { amount: large });
    const cappedAfter = await waitForHit(pair, read, after);
    const capDamage = cappedAfter.taken - after.taken;
    lines.push(`${direction}: large hit took ${capDamage.toFixed(2)} health (${capped.toFixed(2)} expected)`);
    if (!cappedAfter.alive || Math.abs(capDamage - capped) > ROUNDING) {
      problems.push(`duel damage: ${direction} missed the 60%-of-max-health single-hit cap`);
    }
  }
  return problems;
}
