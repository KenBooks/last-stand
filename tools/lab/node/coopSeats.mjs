// `lab coop --scenarios seats`: a seat a partner sits on can't be used (`seatTaken` in `src/world/seats.ts`; from the
// owner: "need to check if another player is already sitting, if yes, then cannot use an object", "it should work in
// coop ofc (in village)"). In the village with no run, the guest sits on one of the campfire's logs by himself; the
// host, stood by it, points at it: it must not be outlined for him while the guest's game reports him sat on it, and
// another log, free, must be. The guest gets up, and the log must be outlined again. `--canary`: the host's copy of
// the guest's sit is cleared just before it points, which must read as the log free.

/** the log the guest sits on, and the free one the host points at too (the campfire's, in the order they're built) */
const TAKEN = 0;
const FREE = 1;
/** frames for the guest to walk to the log and sit (`SIT.after`'s 6 s idle, the walk, the way down and his hands) */
const SIT_FRAMES = 900;
/** frames for his sit to be heard on the host's game, and for him up again to be heard */
const HEARD_FRAMES = 90;
const UP_FRAMES = 240;

/**
 * Plays it on `pair` (its room open already). Returns the problems found, its lines added to `lines`.
 */
export async function partnerOnSeat(pair, callPage, lines, { canary = false, pictures = false }) {
  const problems = [];
  const [host, guest] = pair.pages;
  const picture = async (name) => {
    if (pictures) lines.push(`pictured ${(await pair.picture(`seats-${name}`)).join(', ')}`);
  };
  await callPage(host, 'coopStandBySeat', { index: TAKEN });
  await callPage(guest, 'coopStandBySeat', { index: TAKEN });
  await callPage(guest, 'coopSitOn', { index: TAKEN });
  await pair.run(SIT_FRAMES);
  const sat = await callPage(guest, 'coopSeatsSeen');
  if (!sat.sat) return [...problems, 'seats: the guest never sat on the log'];
  await pair.run(HEARD_FRAMES);
  const seen = await callPage(host, 'coopSeatsSeen');
  lines.push(`the guest sat on log ${TAKEN}; the host's copy of him ${percents(seen.partners)} down`);
  await picture('taken');
  const found = [];
  const takenLit = await callPage(host, 'coopPointAtSeat', { index: TAKEN, canary });
  const freeLit = await callPage(host, 'coopPointAtSeat', { index: FREE });
  lines.push(`the host pointing at the guest's log: ${takenLit ? 'outlined' : 'not outlined'}; `
    + `at a free one: ${freeLit ? 'outlined' : 'not outlined'}`);
  if (takenLit) found.push('the log the guest sits on was outlined for the host to sit on');
  if (!freeLit) problems.push('seats: a free log by the host wasn\'t outlined for him to sit on');
  await callPage(guest, 'coopStandUp');
  await pair.run(UP_FRAMES);
  const upLit = await callPage(host, 'coopPointAtSeat', { index: TAKEN });
  lines.push(`the guest up again: his log ${upLit ? 'outlined' : 'not outlined'} for the host`);
  if (!upLit) problems.push('seats: the log the guest got up from stayed taken for the host');
  if (!canary) return [...problems, ...found.map((p) => `seats: ${p}`)];
  const caught = found.length > 0;
  lines.push(`canary: the guest's sit cleared on the host's game ${caught ? 'caught' : 'went unseen'}`);
  return caught ? problems : [...problems, 'seats: canary: the guest\'s cleared sit went unseen'];
}

/** Shares as percents, said in a list. */
function percents(shares) {
  return shares.map((share) => `${Math.round(share * 100)}%`).join(', ') || 'none';
}
