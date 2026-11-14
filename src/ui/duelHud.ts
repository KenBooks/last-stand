// A duel on the HUD (game/duel.ts; #406): the score over the round's badge at the top (each side by its fighters'
// names, the rounds each has, the round's time), and the match's result as it ends, standing until every game goes
// back to the village. The wave's badge counts the round and the objectives say the duel's turn (ui/hud.ts).
import { G } from '../state';
import { duelOn, fighters, sideName, sideOf, type DuelState } from '../game/duel';
import { readying } from '../net/role';

const $ = <T extends HTMLElement = HTMLElement>(s: string): T => document.querySelector<T>(s)!;

let shown = '';

/** The duel's bits shown as it stands, or put away when none is fought. */
export function updateDuelHud(): void {
  const d = duelOn();
  $('#hud').classList.toggle('duel', !!d);
  const bar = $('#duel-score');
  bar.classList.toggle('hidden', !d);
  if (!d) {
    if (shown) { shown = ''; $('#duel-result').classList.add('hidden'); $('.gem-label').textContent = 'Wave'; }
    return;
  }
  const left = Math.ceil(d.timer);
  const clock = d.phase === 'fight' ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : '';
  const now = [sideName(d, 0), d.score[0], d.score[1], sideName(d, 1), d.setup.wins, clock, d.round].join('|');
  if (now === shown) return;
  shown = now;
  $('.gem-label').textContent = 'Round';
  $('.gem-num').textContent = String(Math.max(1, d.round));
  $('#duel-score .ds-a').textContent = sideName(d, 0);
  $('#duel-score .ds-b').textContent = sideName(d, 1);
  $('#duel-score .ds-points').textContent = `${d.score[0]} : ${d.score[1]}`;
  $('#duel-score .ds-note').textContent = clock || `First to ${d.setup.wins}`;
}

/** The duel's turn in the objectives' line. */
export function duelObjective(d: DuelState): string {
  const mine = sideOf(G.player, d);
  if (d.phase === 'done') return 'The duel is over';
  if (d.round === 0) return readying.guests.length ? 'Waiting for players…' : 'The duel begins…';
  if (d.phase === 'count') return `Round ${d.round} begins in ${Math.ceil(d.timer)}…`;
  if (d.phase === 'between') return 'The next round is coming';
  if (mine === null) return 'You watch the duel';
  return G.player.alive ? (fighters(d, mine).length > 1 ? 'Bring the other side down' : 'Bring your rival down') : 'You are down until the round ends';
}

/** The match's result: who took it and by how much, and to the local player whether that was its side. */
export function showDuelResult(d: DuelState): void {
  if (d.winner === null) return;
  const mine = sideOf(G.player, d);
  const card = $('#duel-result');
  // (in the banner's place: the last round's is put away)
  $('#banner').classList.add('hidden');
  card.classList.remove('hidden');
  card.dataset.outcome = mine === null ? 'watched' : mine === d.winner ? 'won' : 'lost';
  $('#duel-result .dr-title').textContent = mine === null ? 'The duel is over' : mine === d.winner ? 'Victory' : 'Defeat';
  $('#duel-result .dr-who').textContent = `${sideName(d, d.winner)} ${fighters(d, d.winner).length > 1 ? 'take' : 'takes'} the duel`;
  $('#duel-result .dr-score').textContent = `${d.score[0]} : ${d.score[1]}`;
  $('#duel-result .dr-note').textContent = 'No rewards, nothing lost. Back to the village in a moment.';
}

export function hideDuelResult(): void { $('#duel-result').classList.add('hidden'); }
