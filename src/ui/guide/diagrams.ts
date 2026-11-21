// The guide's diagrams, drawn from the game's data as a page opens, never pictures: bars of a figure against the
// largest of its kind, a boss's calls for help along a fight's first minute, and a combo as the game's key caps with
// arrows (a run's loop as a flowchart and a boss's moves seen from above were taken out from play). Their colours are
// the theme's custom properties, so they follow it.
import { BOSS_AI } from '../../data/enemies';
import { esc, secs } from './parts';

/** One bar: what it is, its value as a share of the largest of its kind, the figure written beside it, and a mark
 *  along it (the hero's own speed on a foe's). */
export interface Bar { label: string; share: number; text: string; colour?: string; mark?: { share: number; label: string } }

/** Bars, one a row: its name, the bar filled to its share, its figure. */
export function bars(rows: Bar[]): string {
  return `<div class="gd-bars">${rows.map((r) => {
    const fill = Math.max(0.02, Math.min(1, r.share));
    const mark = r.mark ? `<i class="gd-mark" style="--at:${Math.min(1, r.mark.share) * 100}%" title="${esc(r.mark.label)}"><span>${esc(r.mark.label)}</span></i>` : '';
    return `<div class="gd-bar"><span class="gd-bl">${r.label}</span><span class="gd-track"><b style="--v:${fill * 100}%${r.colour ? `;--c:${r.colour}` : ''}"></b>${mark}</span><span class="gd-bv">${r.text}</span></div>`;
  }).join('')}</div>`;
}

/** A boss's calls for help over a fight's first `span` seconds: a tick each time, while few foes stand. */
export function summonTimeline(summonName: string, span = 60): string {
  const times: number[] = [];
  for (let t = BOSS_AI.summonFirst; t <= span; t += BOSS_AI.summonEvery) times.push(t);
  const x = (t: number): number => 20 + (t / span) * 560;
  const ticks = Array.from({ length: span / 10 + 1 }, (_, i) => i * 10)
    .map((t) => `<line class="gd-tl-tick" x1="${x(t)}" y1="44" x2="${x(t)}" y2="50"/><text x="${x(t)}" y="64" text-anchor="middle">${t} s</text>`).join('');
  const calls = times.map((t) => `<g class="gd-tl-call"><circle cx="${x(t)}" cy="30" r="9"/><text x="${x(t)}" y="34" text-anchor="middle">${BOSS_AI.summonCount}</text></g>`).join('');
  return `<figure class="gd-fig gd-timeline"><svg viewBox="0 0 600 72" role="img" aria-label="When it calls for help">`
    + `<line class="gd-tl-axis" x1="20" y1="44" x2="580" y2="44"/>${ticks}${calls}</svg>`
    + `<figcaption>Its calls for help in a fight's first minute: ${BOSS_AI.summonCount} ${esc(summonName)}s each time, every ${secs(BOSS_AI.summonEvery)} from ${secs(BOSS_AI.summonFirst)} in, while fewer than ${BOSS_AI.crowd} foes stand.</figcaption></figure>`;
}

/** A boss's Health for each size of party, as bars. */
export function partyBars(lives: number[]): string {
  const most = Math.max(...lives);
  return bars(lives.map((v, i) => ({ label: `${i + 1} hero${i ? 'es' : ''}`, share: v / most, text: String(Math.round(v)), colour: 'var(--life-bar)' })));
}

// --- combos ---------------------------------------------------------------------------------------------------------

/** A step of a combo: its key cap's face (markup: `keyFace` in parts.ts) and the key's name, the skill's icon and
 *  name, its colour. */
export interface Step { key: string; label: string; icon: string; name: string; colour: string }

/** A combo as the game's key caps in order, an arrow between each, each cap's skill under it. */
export function keySequence(steps: Step[]): string {
  return `<div class="gd-seq">${steps.map((s, i) => `${i ? '<svg class="gd-seq-arrow" viewBox="0 0 40 20" aria-hidden="true"><path d="M2 10H32M24 3L34 10L24 17"/></svg>' : ''}`
    + `<div class="gd-cap-step" style="--c:${s.colour}"><kbd class="gd-cap" title="${esc(s.label)}" aria-label="${esc(s.label)}">${s.key}</kbd><span class="gd-cap-skill"><span class="gd-ic">${s.icon}</span>${esc(s.name)}</span></div>`).join('')}</div>`;
}
