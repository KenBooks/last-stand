// `lab coop --scenarios duel`: a duel between two games (#406), from the weapons rack's menu to the village again.
// The host sets it up in the menu and the guest's must show the same; the guest readies, the host begins; then the
// rounds are fought (page/coopDuel.ts): each round one hero, down to a little life, is struck by the other until he
// falls, turn about. Judged: every game has the same duel at every turn of it (its round, who took it, the score), a
// blow struck on one screen takes life on the other's own, the fallen is down on both, no foe stands but the rivals,
// nothing is cast through the count, the result names the same winner on both, and both come back to the village.
// `--canary`: the struck hero's life is put back every frame on its own game, so no round is ever won, which must be
// found.
import { labError } from './errors.mjs';

/** the duel the check sets up: not the menu's own choices, so the guest's menu is seen to follow the host's */
const SET_UP = { ground: 'forest', wins: 3, gear: false };
/** who takes each round (the other is down to a little life): the guest takes the match 3 : 1 */
const ROUNDS = ['guest', 'host', 'guest', 'guest'];
/** frames each step is given at the most: the menu's word across the link, the start, a round's count, its blows,
 *  the pause after it, the result and the way back */
const MENU_FRAMES = 240;
const START_FRAMES = 1800;
const COUNT_FRAMES = 900;
const BLOWS_FRAMES = 900;
const BACK_FRAMES = 900;
/** the canary's round: this long with no fall is a round that can't be won */
const CANARY_FRAMES = 420;

const ROLES = ['host', 'guest'];
const scoreOf = (state) => (state.duel ? state.duel.score.join(' : ') : 'no duel');

/**
 * Plays the duel on `pair` (its room open already, `callPage` the page's functions by name). Returns the problems
 * found, its lines added to `lines`.
 */
export async function fightDuel(pair, callPage, lines, { canary = false, pictures = false } = {}) {
  const problems = [];
  const both = (fn, args) => Promise.all(ROLES.map((role, index) => callPage(pair.pages[index], fn, args?.(role))));
  const picture = async (name) => { if (pictures) lines.push(`pictured ${(await pair.picture(`duel-${name}`)).join(', ')}`); };

  // --- the menu -----------------------------------------------------------------------------------
  await callPage(pair.host, 'coopDuelSetUp', SET_UP);
  await pair.run(MENU_FRAMES);
  let [hostMenu, guestMenu] = await both('coopDuelMenu');
  const rows = (menu) => [menu.ground, menu.size, menu.wins, menu.gear, JSON.stringify(menu.sides.map((side) => side.map((name) => name.replace(' (ready)', ''))))].join(' ');
  lines.push(`the menu on the host's: ${rows(hostMenu)}; its button "${hostMenu.button}"${hostMenu.disabled ? ', dead' : ''} ("${hostMenu.note}")`);
  if (rows(hostMenu) !== rows(guestMenu)) problems.push(`the guest's menu doesn't show the host's duel (${rows(guestMenu)})`);
  if (hostMenu.gear !== 'none' || hostMenu.wins !== String(SET_UP.wins)) problems.push('the host\'s menu didn\'t take its choices');
  if (!hostMenu.disabled) problems.push('the host could begin before the guest was ready');
  if (guestMenu.button !== 'Ready') problems.push(`the guest's button says "${guestMenu.button}", not Ready`);
  await callPage(pair.guest, 'coopDuelGo');
  await pair.run(MENU_FRAMES);
  [hostMenu, guestMenu] = await both('coopDuelMenu');
  lines.push(`the guest ready: the host's button ${hostMenu.disabled ? 'still dead' : 'live'} ("${hostMenu.note}")`);
  if (hostMenu.disabled) problems.push('the host\'s Begin stayed dead once the guest was ready');
  await picture('menu');

  // --- the start ----------------------------------------------------------------------------------
  const before = await pair.run(1);
  await callPage(pair.host, 'coopDuelGo');
  const counting = (host, guest) => [host, guest].every((state) => state.duel?.round === 1);
  let states = await pair.until(counting, START_FRAMES, 'the duel\'s first round was never called on both games');
  const sides = states.slice(0, 2).map((state) => state.duel.side);
  lines.push(`begun on both: the host on side ${sides[0]}, the guest on side ${sides[1]}; each game's rivals ${states.slice(0, 2).map((s) => s.duel.rivals).join(' and ')}, other foes ${states.slice(0, 2).map((s) => s.duel.foes).join(' and ')}`);
  if (sides[0] === sides[1] || sides.includes(null)) problems.push(`the two fighters aren't on opposite sides (${sides.join(', ')})`);
  for (const [index, state] of states.slice(0, 2).entries()) {
    if (state.duel.rivals !== 1) problems.push(`the ${ROLES[index]}'s game has ${state.duel.rivals} rivals among its foes, not 1`);
    if (state.duel.foes) problems.push(`the ${ROLES[index]}'s game has ${state.duel.foes} foes in the duel`);
    if (!state.duel.truce) problems.push(`the ${ROLES[index]}'s hero may cast through the count`);
  }
  await picture('count');

  // --- the rounds ---------------------------------------------------------------------------------
  for (const [index, winner] of ROUNDS.entries()) {
    const n = index + 1;
    const fought = (host, guest) => [host, guest].every((state) => state.duel?.round === n && state.duel.phase === 'fight');
    await pair.until(fought, COUNT_FRAMES, `round ${n} was never fought on both games`);
    const loser = winner === 'host' ? 'guest' : 'host';
    await both('coopDuelRound', (role) => ({ role, strikes: role === winner, weak: role === loser, heldWhole: canary && role === loser }));
    if (canary) {
      states = await pair.run(CANARY_FRAMES);
      const caught = states.slice(0, 2).every((state) => state.duel?.phase === 'fight');
      lines.push(`canary: the struck hero's life put back every frame ${caught ? 'caught (no round won)' : 'went unseen'}`);
      if (!caught) problems.push('duel: the canary\'s hero that takes no hit went unseen');
      return problems;
    }
    if (n === 2) { await pair.run(40); await picture('fight'); }
    const over = (host, guest) => [host, guest].every((state) => state.duel && (state.duel.phase !== 'fight' || state.duel.round !== n));
    states = await pair.until(over, BLOWS_FRAMES, `round ${n}'s struck hero never fell on both games`);
    const [host, guest] = states;
    const own = loser === 'host' ? host : guest, seen = loser === 'host' ? guest : host;
    lines.push(`round ${n}: the ${winner} strikes; the ${loser} ${own.duel.alive ? 'stands' : 'down'} on its own game and ${seen.duel.rivalAlive ? 'stands' : 'down'} on the ${winner}'s; the score ${scoreOf(host)} on the host's, ${scoreOf(guest)} on the guest's`);
    if (own.duel.alive) problems.push(`round ${n}: the ${loser} never fell on its own game`);
    if (seen.duel.rivalAlive) problems.push(`round ${n}: the ${loser} fell on its own game and stands on the ${winner}'s`);
    if (scoreOf(host) !== scoreOf(guest)) problems.push(`round ${n}: the games disagree on the score (${scoreOf(host)}, ${scoreOf(guest)})`);
    if (host.duel.scoreShown !== `${host.duel.score[0]} : ${host.duel.score[1]}`) problems.push(`round ${n}: the host's HUD shows "${host.duel.scoreShown}"`);
  }

  // --- the result and the way back ----------------------------------------------------------------
  const done = (host, guest) => [host, guest].every((state) => state.duel?.phase === 'done');
  states = await pair.until(done, BACK_FRAMES, 'the match never ended on both games');
  const [host, guest] = states;
  lines.push(`the match: ${scoreOf(host)}, side ${host.duel.winner} wins on the host's and side ${guest.duel.winner} on the guest's; the host is shown "${host.duel.resultShown}", the guest "${guest.duel.resultShown}"`);
  if (host.duel.winner !== guest.duel.winner) problems.push('the games disagree on who won the match');
  if (guest.duel.winner !== guest.duel.side) problems.push('the guest took three rounds and didn\'t win the match');
  if (host.duel.resultShown !== 'Defeat' || guest.duel.resultShown !== 'Victory') problems.push('the result isn\'t shown as each player\'s own (Defeat, Victory)');
  const bare = states.slice(0, 2).map((state) => Math.round(state.duel.maxLife));
  await picture('result');
  const back = (h, g) => [h, g].every((state) => state.mode === 'menu' && !state.duel);
  states = await pair.until(back, BACK_FRAMES, 'the games never came back to the village after the match');
  const life = (list) => list.slice(0, 2).map((state) => Math.round(state.maxLife));
  lines.push(`back in the village on both; each hero's most life ${life(before).join(' and ')} before, ${bare.join(' and ')} in the duel with no gear, ${life(states).join(' and ')} after`);
  if (life(before).join() !== life(states).join()) problems.push('a hero\'s gear didn\'t count again after a duel fought without it');
  if (bare.some((most, index) => most > life(before)[index])) problems.push('a hero had more life without his gear than with it');
  await picture('back');
  if (states.some((state) => state.mode !== 'menu')) throw labError('duel: a game left the village again');
  return problems;
}
