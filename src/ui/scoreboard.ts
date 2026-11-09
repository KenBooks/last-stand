// The party's scores, as a shooter shows them: held on Tab (on touch, a button by the pause button toggles it), in a
// run and in a co-op lobby. Each player's run in numbers (game/stats: the local player's counted as its own game
// judges its hits, a partner's as its game reports them once a second), its round trip to the co-op server with the
// minute before it as a graph, and for a partner how far behind its own game it's shown here.
import { G } from '../state';
import { isDown } from '../core/input';
import { sfx } from '../core/audio';
import { isCoop } from '../net/role';
import { partnerBoards, session } from '../net/session';
import { serverPings } from '../net/netlog';
import { mine, type RunNumbers } from '../game/stats';
import { isTouch } from './touch';
import { nameOf } from './coop';
import type { Player } from '../entities/player';

/** how often the numbers are written again while it shows, s */
const REFRESH = 0.25;
/** round trips under these are good and fair, ms (over: poor) */
const GOOD_PING = 120;
const FAIR_PING = 250;
/** the graph's size (px, before the HUD's scale), how many seconds it spans and the least round trip at its top */
const GRAPH_W = 96;
const GRAPH_H = 26;
const GRAPH_SPAN = 60;
const GRAPH_TOP = 300;

let board: HTMLElement | null = null;
let button: HTMLButtonElement | null = null;
/** on touch: shown until tapped again */
let pinned = false;
let refreshT = 0;

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document): T => root.querySelector(sel) as T;
const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** A row: a player, what it is to us, its numbers, its round trips, how far behind it's shown (partners). */
interface Row { player: Player; who: string; numbers: RunNumbers; rtt: number | null; pings: number[]; behind: number | null }

function rows(): Row[] {
  const own = serverPings();
  const me: Row = { player: G.player, who: G.player.slot === 0 && isCoop() ? 'You · host' : 'You', numbers: mine, rtt: own.rtt, pings: own.pings, behind: null };
  const others = partnerBoards().map((b) => ({ ...b, who: b.player.slot === 0 ? 'Host' : 'Partner' }));
  return [me, ...others.sort((a, b) => a.player.slot - b.player.slot)];
}

/** A number as it fits a cell: whole under a thousand, then thousands (12.4k) and millions. */
function short(v: number): string {
  const n = Math.max(0, v);
  if (n < 1000) return String(Math.round(n));
  if (n < 1e6) return `${(n / 1000).toFixed(n < 1e4 ? 1 : 0)}k`;
  return `${(n / 1e6).toFixed(1)}M`;
}

const quality = (ms: number | null): string => (ms === null ? 'none' : ms < GOOD_PING ? 'good' : ms < FAIR_PING ? 'fair' : 'poor');

/** The last minute of round trips as a line, the latest at the right. */
function graph(pings: number[], latest: number | null): string {
  const shown = pings.slice(-GRAPH_SPAN);
  if (shown.length < 2) return `<svg class="sb-graph" viewBox="0 0 ${GRAPH_W} ${GRAPH_H}" aria-hidden="true"></svg>`;
  const top = Math.max(GRAPH_TOP, ...shown);
  const step = GRAPH_W / (GRAPH_SPAN - 1);
  const x0 = GRAPH_W - (shown.length - 1) * step;
  const points = shown.map((ms, i) => `${(x0 + i * step).toFixed(1)},${(GRAPH_H - 1 - (ms / top) * (GRAPH_H - 3)).toFixed(1)}`);
  const area = `${x0.toFixed(1)},${GRAPH_H} ${points.join(' ')} ${GRAPH_W},${GRAPH_H}`;
  const fair = (GRAPH_H - 1 - (FAIR_PING / top) * (GRAPH_H - 3)).toFixed(1);
  return `<svg class="sb-graph q-${quality(latest)}" viewBox="0 0 ${GRAPH_W} ${GRAPH_H}" aria-hidden="true">` +
    `<line class="sb-fair" x1="0" x2="${GRAPH_W}" y1="${fair}" y2="${fair}"/>` +
    `<polygon points="${area}"/><polyline points="${points.join(' ')}"/></svg>`;
}

function stateOf(p: Player): string {
  if (p.away) return 'in the lobby';
  if (p.out === 'banked') return G.run?.training ? 'left training' : 'banked';
  if (p.out === 'dead') return 'fallen';
  if (p.downed) return 'down';
  return '';
}

/** What a row's player is to us, and in co-op (its name tag in bold) its hero's class. */
const whoOf = (r: Row): string => (isCoop() ? `${r.who} · ${esc(r.player.cls.name)}` : r.who);

function rowHtml(r: Row): string {
  const n = r.numbers, p = r.player, state = stateOf(p);
  const ping = r.rtt === null ? '—' : `${Math.round(r.rtt)} ms`;
  const behind = r.behind === null ? '' : `<small>shown ${Math.round(r.behind)} ms behind</small>`;
  const blocked = n.mitigated >= 1 ? `<small>${short(n.mitigated)} blocked</small>` : '';
  return `<tr class="${p.local ? 'me' : ''}${state ? ` st-${state.split(' ')[0]}` : ''}">` +
    `<td class="sb-who"><b>${esc(nameOf(p))}</b><small>${whoOf(r)}${state ? ` · ${state}` : ''}</small></td>` +
    `<td class="sb-ping"><div><span class="q-${quality(r.rtt)}">${ping}</span>${graph(r.pings, r.rtt)}</div>${behind}</td>` +
    `<td>${short(n.dealt)}</td>` +
    `<td>${short(n.taken)}${blocked}</td><td class="sb-minor">${short(n.healed)}</td>` +
    `<td>${n.kills}</td><td>${n.downs}</td><td>${n.revives}</td></tr>`;
}

function headline(): string {
  const r = G.run;
  if (G.mode === 'run' && r) {
    const secs = Math.max(0, Math.floor(G.time - mine.since));
    return `Wave ${r.wave} · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  }
  return session.code ? `Lobby · room ${esc(session.code)}` : 'Lobby';
}

function render(el: HTMLElement): void {
  el.innerHTML = `<div class="sb-head">${headline()}</div><table><thead><tr>` +
    '<th class="sb-who">Player</th><th class="sb-ping">Ping</th><th>Damage</th>' +
    '<th>Taken</th><th class="sb-minor">Healed</th><th>Kills</th><th>Downs</th><th>Revives</th>' +
    `</tr></thead><tbody>${rows().map(rowHtml).join('')}</tbody></table>` +
    '<div class="sb-foot">Ping: each player\'s round trip to the co-op server. A partner is shown on your screen a little behind its own game.</div>';
}

function boardFor(): HTMLElement {
  if (board) return board;
  board = document.createElement('div');
  board.id = 'scoreboard';
  board.className = 'hidden';
  document.body.appendChild(board);
  return board;
}

function buttonFor(): HTMLButtonElement {
  if (button) return button;
  button = document.createElement('button');
  button.id = 'btn-scores';
  button.className = 'hidden';
  button.setAttribute('aria-label', 'Scores');
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="6" width="16" height="2.4" rx="1"/><rect x="4" y="11" width="16" height="2.4" rx="1"/><rect x="4" y="16" width="16" height="2.4" rx="1"/></svg>';
  button.addEventListener('click', () => { sfx.click(); pinned = !pinned; });
  document.getElementById('hud')?.appendChild(button);
  return button;
}

/** Every frame: shown while Tab is held (or pinned on touch), in a run or a co-op lobby, its numbers kept fresh. */
export function updateScoreboard(dt: number): void {
  const el = boardFor();
  const can = (G.mode === 'run' || isCoop()) && !G.menuOpen;
  buttonFor().classList.toggle('hidden', !(can && isTouch() && G.mode === 'run'));
  if (!isTouch()) pinned = false;
  const shown = can && (isDown('tab') || pinned);
  const was = !el.classList.contains('hidden');
  el.classList.toggle('hidden', !shown);
  if (!shown) return;
  refreshT -= dt;
  if (was && refreshT > 0) return;
  refreshT = REFRESH;
  render(el);
}
