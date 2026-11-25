// `lab coop --scenarios tavern`: the tavern's keeper and his mugs as two games share them (src/world/tavern.ts,
// src/game/mugs.ts): the host's game runs the keeper and rules the mugs, a guest's asks of it and takes its word.
// Both heroes go into the tavern and stand at the bar. The guest asks for ale: the host's keeper must serve it, the
// mug wait on the bar until the guest takes it up by E and drinks it, and the host see him drink. Then both ask at once:
// each must take up and drink a mug of his own, never the same one. Then a mug served to the guest is pressed for by
// both, the host beside him: one alone has it, on both games (the host rules who took it first; any hero may take up
// any mug, from Kenneth's round 3: "make it possible for another player to drink it too"). Every look both games' mugs must add up to their count, and once settled (the guest's drink done, and at the
// end) agree mug for mug (between, the guest hears the host a ping late); in the end every mug must be back on the
// back counter on both. `--canary`: the host stops telling its guest of the mugs, so the guest's
// mug never reaches it, which must be found.

/** frames run between looks, and the most a serving, both servings and the clearing are given (two servings one after
 *  the other, about 10 s each, and the second drunk: 30 s was cut fine; each mug taken up and drunk in turn, the last
 *  of 50 s of clearing still in his hand) */
const STEP = 30, SERVED_IN = 900, BOTH_IN = 2700, CLEARED_IN = 4200;

/**
 * Plays it on `pair` (its room open already). Returns the problems found, its lines added to `lines`.
 */
export async function drinkTogether(pair, callPage, lines, { canary = false, pictures = false }) {
  const problems = [];
  const [host, guest] = pair.pages;
  const picture = async (name) => { if (pictures) lines.push(`pictured ${(await pair.picture(`tavern-${name}`)).join(', ')}`); };
  const seen = async () => [await callPage(host, 'coopTavernSeen'), await callPage(guest, 'coopTavernSeen')];
  /** frames run until `done(host, guest)` or `most` frames, each look's ledgers compared; the frames it took, or -1 */
  let disagreed = '', badSum = '';
  /** both games' mugs compared once settled (a second on) */
  const agree = async (when) => {
    await pair.run(60);
    const [h, g] = await seen();
    if (h.places !== g.places && !disagreed) disagreed = `${when}: host ${h.places} | guest ${g.places}`;
  };
  const until = async (done, most) => {
    for (let f = 0; f <= most; f += STEP) {
      const [h, g] = await seen();
      if (h.sum !== h.count || g.sum !== g.count) badSum ||= `host ${h.sum}/${h.count}, guest ${g.sum}/${g.count}`;
      if (done(h, g)) return f;
      await pair.run(STEP);
    }
    return -1;
  };
  for (const page of pair.pages) await callPage(page, 'coopEnterHouse', { id: 'tavern' });
  await pair.run(STEP);
  await callPage(host, 'coopTavernStand', { side: -0.9 });
  await callPage(guest, 'coopTavernStand', { side: 0.9 });
  if (canary) await callPage(host, 'coopTavernMute');
  await pair.run(STEP * 2);

  /** the mug waiting by `page`'s hero taken up by E and drunk by E, once it waits and once its choice shows: the mug
   *  he took (-1: none) */
  const takeAndDrink = async (page, which) => {
    const his = (h, g) => (which === 'host' ? h : g);
    if (await until((h, g) => his(h, g).waiting >= 0, SERVED_IN) < 0) return -1;
    await callPage(page, 'coopTavernTake');
    if (await until((h, g) => his(h, g).choosing, 120) < 0) return -1;
    const [h, g] = await seen();
    await callPage(page, 'coopTavernDrink');
    return his(h, g).myMug;
  };
  // --- the guest asks: the host's keeper serves him, the mug waits, he takes it up and drinks, the host sees it ---
  await callPage(guest, 'coopTavernAsk');
  let hostSaw = false;
  const took = await takeAndDrink(guest, 'guest');
  const served = took >= 0 ? await until((h, g) => { hostSaw ||= h.partnerDrinking; return g.drinking >= 0 && hostSaw; }, SERVED_IN) : -1;
  lines.push(`the guest asked: ${served < 0 ? 'never served' : `drinking ${(served / 60).toFixed(1)} s after, seen drinking on the host's game`}`);
  const found = [];
  if (served < 0) found.push('the guest asked for ale, and never drank (or the host never saw him drink)');
  await picture('guest-drinking');

  // --- both ask at once: a mug each, never the same one ---
  if (served >= 0) {
    await until((_, g) => g.drinking < 0, 600);
    await agree('after the guest drank');
    await callPage(host, 'coopTavernAsk');
    await callPage(guest, 'coopTavernAsk');
    const mugs = { host: new Set(), guest: new Set() };
    const hostTook = await takeAndDrink(host, 'host'), guestTook = await takeAndDrink(guest, 'guest');
    if (hostTook >= 0) mugs.host.add(hostTook);
    if (guestTook >= 0) mugs.guest.add(guestTook);
    const both = await until((h, g) => {
      if (h.myMug >= 0) mugs.host.add(h.myMug);
      if (g.myMug >= 0) mugs.guest.add(g.myMug);
      return mugs.host.size > 0 && mugs.guest.size > 0 && h.drinking < 0 && g.drinking < 0;
    }, BOTH_IN);
    const shared = [...mugs.host].filter((id) => mugs.guest.has(id));
    lines.push(`both asked: the host drank mug ${[...mugs.host].join(',') || 'none'}, the guest mug ${[...mugs.guest].join(',') || 'none'}${both < 0 ? ' (not both done)' : ''}`);
    if (both < 0) {
      const [h, g] = await seen();
      lines.push(`  then: host's mugs ${h.places}, keeper ${h.doing}; guest's ${g.places}, drinking ${g.drinking.toFixed(2)}`);
      found.push('both asked at once, and not both drank');
    }
    if (shared.length) found.push(`both heroes drank mug ${shared.join(', ')}`);
    // --- cleared: every mug back on the back counter on both games ---
    const cleared = await until((h, g) => h.clean === h.count && g.clean === g.count, CLEARED_IN);
    if (cleared < 0) {
      const [h, g] = await seen();
      lines.push(`  then: host's mugs ${h.places}, keeper ${h.doing}; guest's ${g.places}`);
    }
    lines.push(`cleared: ${cleared < 0 ? 'not every mug back' : `every mug back on the shelf on both in ${(cleared / 60).toFixed(1)} s`}`);
    if (cleared < 0) found.push('not every mug came back to the shelf on both games');
    await agree('at the end');
    // --- one mug, two takers: the host stood by the guest, both press E on the guest's mug; one alone has it ---
    await callPage(host, 'coopTavernStand', { side: 0.5 });
    await callPage(guest, 'coopTavernAsk');
    if (await until((h, g) => g.waiting >= 0 && h.waiting === g.waiting, SERVED_IN) >= 0) {
      const [, g] = await seen();
      await callPage(guest, 'coopTavernTake', { id: g.waiting });
      await callPage(host, 'coopTavernTake', { id: g.waiting });
      await pair.run(STEP * 2);
      const [h2, g2] = await seen();
      const holders = [h2.myMug === g.waiting ? 'host' : '', g2.myMug === g.waiting ? 'guest' : ''].filter(Boolean);
      lines.push(`one mug, two takers: mug ${g.waiting} taken by ${holders.join(' and ') || 'no one'}`);
      if (holders.length !== 1) found.push(`both heroes pressed for mug ${g.waiting}: ${holders.length ? 'both had it' : 'no one had it'}`);
      for (const [page, sawIt] of [[host, h2], [guest, g2]]) if (sawIt.choosing) await callPage(page, 'coopTavernDrink');
      await until((h, g) => h.drinking < 0 && g.drinking < 0, 600);
    } else found.push('the mug for the race never waited within both heroes\' reach');
    // --- carried and lost at the door (Kenneth's round 4): the guest takes one up, the host sees him hold it; he leaves
    // the tavern with it, and both games have it back on the bar, every mug counted ---
    await callPage(guest, 'coopTavernAsk');
    if (await until((h, g) => g.waiting >= 0, SERVED_IN) >= 0) {
      await callPage(guest, 'coopTavernTake');
      const held = await until((h, g) => g.choosing && h.partnerHolding, 240);
      lines.push(`carried: the host ${held < 0 ? 'NEVER saw' : 'saw'} the guest holding his mug`);
      if (held < 0) found.push('the host never saw the guest holding his mug');
      await callPage(guest, 'coopTavernLeave');
      const back = await until((h, g) => !g.choosing && !h.partnerHolding && h.places === g.places && h.sum === h.count, 300);
      const [h, g] = await seen();
      lines.push(`left with it: ${back < 0 ? `NOT agreed (host ${h.places} | guest ${g.places})` : 'the mug back off his hand on both games, every mug counted'}`);
      if (back < 0) found.push('the guest left the tavern with a mug, and the games didn\'t agree it was put back');
    } else found.push('the guest\'s mug to carry never waited');
  }
  lines.push(`the ledgers: ${disagreed ? `disagreed (${disagreed})` : 'agreed once settled'}, ${badSum ? `didn't add up (${badSum})` : 'added up at every look'}`);
  if (disagreed) found.push(`the two games' mugs disagreed: ${disagreed}`);
  if (badSum) found.push(`the mugs didn't add up: ${badSum}`);
  if (!canary) return [...problems, ...found.map((p) => `tavern: ${p}`)];
  const caught = found.some((p) => p.includes('never drank'));
  lines.push(`canary: the host's word of the mugs kept from the guest ${caught ? 'caught' : 'went unseen'}`);
  return caught ? problems : [...problems, 'tavern: canary: the host keeping the mugs to itself went unseen'];
}
