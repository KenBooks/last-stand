// `lab coop --scenarios trade`: two players trading banked gear in the lobby (net/trade.ts), played through the
// window's own controls (page/coopTrade.ts) over the lab's link. Each stash is stocked with items named for the check;
// the host asks from Play together's list and the guest takes it up from the ask at the top of its screen; each puts
// an item in, the host accepts, and the guest's offer changed after it must take the host's accept back on both
// screens; then both accept and the items must have moved on both games, each stash exactly the other's items and
// what it kept, none twice and none lost, nothing left locked. Then a second trade the other way round, by taps (the
// guest asks, the host takes it up), both offers in and the host's accept given, and the guest's link lost as a
// closed tab's is: nothing may move on either game, and the host's window must close, its items free again.
// `--canary`: the guest's changes to its offer are lost on their way to the host, which the reset must find.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { labError } from './errors.mjs';
import { OUT } from './paths.mjs';

/** where `--pictures` puts the window fitted on each screen */
const FIT_PICTURES = join(OUT, 'coop');

/** the items each stash is stocked with: the host's three, the guest's two, and the items besides them (a stash as
 *  a player's, for the pictures): the host's 59, full once the first trade has given it one more than it gave */
const STOCK = { host: 3, guest: 2 };
const FILLER = { host: 56, guest: 12 };
/** the most frames a step is given: the link's round trip and the window's word across it */
const STEP_FRAMES = 300;

/** A list of names as a line says it. */
const listed = (names) => (names.length ? names.join(', ') : 'nothing');
/** Whether two lists of names hold the same names, in any order. */
const sameNames = (a, b) => a.length === b.length && [...a].sort().every((name, i) => name === [...b].sort()[i]);

/**
 * Plays the trade on `pair` (its room open already, `callPage` the page's functions by name). Returns the problems
 * found, its lines added to `lines`.
 */
export async function tradeTogether(pair, callPage, lines, { canary = false, pictures = false } = {}) {
  const problems = [];
  const picture = async (name) => {
    if (pictures) lines.push(`pictured ${(await pair.picture(`trade-${name}`)).join(', ')}`);
  };
  /** Runs frames until `done(host, guest)` on the two games' trades, at most `STEP_FRAMES`; null if it never is. */
  const waitFor = async (done) => {
    for (let frames = 0; frames < STEP_FRAMES; frames += pair.turnFrames) {
      const [host, guest] = await pair.turn(pair.turnFrames);
      if (done(host.trade, guest.trade)) return [host.trade, guest.trade];
    }
    return null;
  };
  const now = async () => (await pair.run(1)).map((state) => state.trade);

  const [first] = await now();
  if (!first.present) return ['no trading in this tree'];
  const hostItems = await callPage(pair.host, 'coopTradeStock', { tag: 'Host', count: STOCK.host, filler: FILLER.host });
  const guestItems = await callPage(pair.guest, 'coopTradeStock', { tag: 'Guest', count: STOCK.guest, filler: FILLER.guest });
  lines.push(`stocked: the host's stash ${listed(hostItems)}; the guest's ${listed(guestItems)}`);

  // --- asked and opened -------------------------------------------------------------------------------
  if (pictures) {
    await callPage(pair.host, 'coopTradeList');
    await picture('list');
  }
  await callPage(pair.host, 'coopTradeAsk');
  const asked = await waitFor((host, guest) => guest.phase === 'asked' && guest.ask !== null);
  if (!asked) throw labError('coop: the guest was never asked to trade');
  lines.push(`the guest asked: "${asked[1].ask}"`);
  await picture('asked');
  await callPage(pair.guest, 'coopTradeAnswer', { yes: true });
  if (!await waitFor((host, guest) => host.window && guest.window)) throw labError('coop: the trade window never opened on both');

  // --- offers, the host's accept, and the guest's change taking it back -------------------------------------
  await callPage(pair.host, 'coopTradeOffer', { names: [hostItems[0]] });
  await callPage(pair.guest, 'coopTradeOffer', { names: [guestItems[0]] });
  const offered = await waitFor((host, guest) => sameNames(host.theirs, [guestItems[0]]) && sameNames(guest.theirs, [hostItems[0]]));
  if (!offered) throw labError('coop: the two offers never showed on the other\'s screen');
  await callPage(pair.host, 'coopTradeAccept');
  const accepted = await waitFor((host, guest) => host.accepted && guest.theirAccept);
  if (!accepted) problems.push('the host\'s accept never showed on the guest\'s screen');
  lines.push(`offers: the host's ${listed(offered[0].mine)}, the guest's ${listed(offered[1].mine)}; the host accepts`);
  await picture('accepted');
  if (!canary) problems.push(...await tradeFits(pair.host, callPage, lines, { pictures, input: 'mouse' }));
  if (canary) await callPage(pair.host, 'coopTradeLoseChanges', { on: true });
  await callPage(pair.guest, 'coopTradeOffer', { names: [guestItems[1]] });
  const changed = [guestItems[0], guestItems[1]];
  const reset = await waitFor((host, guest) => sameNames(host.theirs, changed) && !host.accepted && !guest.theirAccept);
  if (!reset) {
    const [host, guest] = await now();
    problems.push(`the guest's changed offer didn't take the host's accept back on both screens (the host shows `
      + `${listed(host.theirs)}, accepting: ${host.accepted}; the guest shows the host accepting: ${guest.theirAccept})`);
  } else lines.push(`the guest adds ${guestItems[1]}: the host shows ${listed(reset[0].theirs)}, both accepts taken back`);
  if (canary) {
    const caught = problems.some((problem) => problem.includes('take the host\'s accept back'));
    lines.push(`canary: the guest's change lost on its way to the host ${caught ? 'caught' : 'missed'}`);
    return caught ? [] : ['canary missed: the host kept its accept over an offer it never saw change'];
  }

  // --- both accept: the swap on both games ---------------------------------------------------------------
  await callPage(pair.host, 'coopTradeAccept');
  await callPage(pair.guest, 'coopTradeAccept');
  const hostAfter = [hostItems[1], hostItems[2], ...changed];
  const guestAfter = [hostItems[0]];
  const traded = await waitFor((host, guest) => !host.window && !guest.window && host.done && guest.done);
  const [hostDone, guestDone] = traded ?? await now();
  lines.push(`both accept: the host's stash ${listed(hostDone.stash)}; the guest's ${listed(guestDone.stash)}`);
  if (!traded) problems.push('the trade both accepted never ended in a trade done on both games');
  if (!sameNames(hostDone.stash, hostAfter)) problems.push(`the host's stash after the trade isn't ${listed(hostAfter)}`);
  if (!sameNames(guestDone.stash, guestAfter)) problems.push(`the guest's stash after the trade isn't ${listed(guestAfter)}`);
  problems.push(...countProblems([...hostItems, ...guestItems], [...hostDone.stash, ...guestDone.stash]));
  if (hostDone.locked || guestDone.locked) problems.push('items stayed locked after the trade was done');
  lines.push(`the word on each: "${hostDone.note}" / "${guestDone.note}"`);
  await picture('done');

  // --- the other way round, by taps, and the guest's link lost mid-trade -------------------------------------
  await callPage(pair.guest, 'coopTradeAsk', { by: 'tap' });
  if (!await waitFor((host) => host.phase === 'asked')) throw labError('coop: the host was never asked to trade');
  await callPage(pair.host, 'coopTradeAnswer', { yes: true, by: 'tap' });
  if (!await waitFor((host, guest) => host.window && guest.window)) throw labError('coop: the second trade never opened');
  await callPage(pair.guest, 'coopTradeOffer', { names: [hostItems[0]], by: 'tap' });
  // (the host's stash full: taking the guest's item with nothing given back must be refused, and say why)
  const full = await waitFor((host) => sameNames(host.theirs, [hostItems[0]]));
  if (!full || !full[0].acceptOff || !/stash would hold/.test(full[0].problem ?? '')) {
    problems.push(`a trade past the host's full stash wasn't refused (Accept ${full?.[0].acceptOff ? 'off' : 'on'}, `
      + `"${full?.[0].problem ?? ''}")`);
  } else lines.push(`the host's stash full: Accept off, "${full[0].problem}"`);
  problems.push(...await tradeFits(pair.host, callPage, lines, { pictures, input: 'touch' }));
  await callPage(pair.host, 'coopTradeOffer', { names: [hostItems[1]], by: 'tap' });
  // (the host accepts once the guest's offer has reached it: one arriving after it takes the accept back)
  const across = (host, guest) => sameNames(host.theirs, [hostItems[0]]) && sameNames(guest.theirs, [hostItems[1]]);
  if (!await waitFor(across)) problems.push('the second trade\'s offers, made by taps, never showed across');
  await callPage(pair.host, 'coopTradeAccept', { by: 'tap' });
  const ready = await waitFor((host, guest) => guest.theirAccept && host.accepted);
  if (!ready) problems.push('the second trade\'s offers and the host\'s accept never showed across');
  await callPage(pair.guest, 'coopTradeDrop');
  const dropped = await waitFor((host) => !host.window && host.phase === null);
  const [hostLeft, guestLeft] = dropped ?? await now();
  lines.push(`the guest's link lost mid-trade: the host's stash ${listed(hostLeft.stash)}, "${hostLeft.note}"; `
    + `the guest's ${listed(guestLeft.stash)}`);
  if (!dropped) problems.push('the host\'s trade window stayed open with its partner gone');
  if (!sameNames(hostLeft.stash, hostAfter)) problems.push('the host\'s stash changed with the guest gone mid-trade');
  if (!sameNames(guestLeft.stash, guestAfter)) problems.push('the guest\'s stash changed as its link went mid-trade');
  if (hostLeft.locked || guestLeft.locked) problems.push('items stayed locked after the trade broke off');
  return problems;
}

/** The trade window on `page` fitted on each screen of page/coopTrade.ts `TRADE_SCREENS`, and with `pictures` the
 *  screen pictured on each (`trade-fit-<input>-<n>.png`). Returns the problems, its lines added to `lines`. */
async function tradeFits(page, call, lines, { pictures, input }) {
  const problems = [];
  const screens = await call(page, 'coopTradeScreens');
  for (let index = 0; index < screens; index++) {
    const fit = await call(page, 'coopTradeFit', { index });
    lines.push(`the window on ${fit.line}`);
    problems.push(...fit.problems);
    if (pictures) await pictureFit(page, call, `trade-fit-${input}-${index}`);
  }
  await call(page, 'coopTradeBack');
  return problems;
}

/** `page`'s screen as it stands, at the screen's own pixels (Playwright's own put the page back on its screen). */
async function pictureFit(page, call, name) {
  await call(page, 'coopDrawing', { on: true });
  await page.evaluate(() => window.__labClock.realFrame());
  const png = await page.evaluate(() => window.__labScreenshot());
  mkdirSync(FIT_PICTURES, { recursive: true });
  writeFileSync(join(FIT_PICTURES, `${name}.png`), Buffer.from(png.replace(/^data:image\/png;base64,/, ''), 'base64'));
  await call(page, 'coopDrawing', { on: false });
}

/** Every item the check stocked must be in exactly one stash after the trade: none lost, none twice. */
function countProblems(stocked, after) {
  const problems = [];
  for (const name of stocked) {
    const count = after.filter((held) => held === name).length;
    if (count === 0) problems.push(`${name} was lost in the trade`);
    if (count > 1) problems.push(`${name} is in ${count} stashes after the trade`);
  }
  return problems;
}
