// The guide's diagrams, drawn from the game's data as a page opens, never pictures: bars of a figure against the
// largest of its kind, a foe's attacks seen from above (its reach, its slam's ring, its throws, a boss's volleys and
// summons) to scale, a boss's calls for help along a fight's first minute, a combo as the game's key caps with arrows,
// and a run's loop (a wave, then Bank or Continue). Their colours are the theme's custom properties, so they follow it.
import { BOSS_AI } from '../../data/enemies';
import { WAVES } from '../../data/waves';
import { RUN } from '../../data/balance';
import type { EnemyDef } from '../../types';
import { esc, metres, pct, secs } from './parts';

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

// --- a foe's attacks from above -------------------------------------------------------------------------------------

/** an SVG number: to two places, as short as it goes */
const f = (v: number): string => String(Number(v.toFixed(2)));

/**
 * A foe's attacks seen from above, to scale: the foe at the middle facing up, and round it what it does (its blow's
 * reach, where it keeps away, its slam's ring, how far it throws and what lands, a boss's volleys and summons), a
 * hero's body for its size, and a scale bar. Each is labelled; the viewBox is sized to the furthest of them.
 */
export function telegraph(def: EnemyDef, summonName = ''): string {
  const parts: string[] = [], labels: { x: number; y: number; text: string; cls: string }[] = [];
  const hero = 0.5;   // a hero's body's radius (m): for the scale of things
  let far = def.radius + def.range + 1;
  const ring = (r: number, cls: string, x = 0, y = 0): void => { parts.push(`<circle class="${cls}" cx="${f(x)}" cy="${f(y)}" r="${f(r)}"/>`); };
  const line = (x1: number, y1: number, x2: number, y2: number, cls: string): void => {
    parts.push(`<line class="${cls}" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"/>`);
  };
  const say = (x: number, y: number, text: string, cls = ''): void => { labels.push({ x, y, text, cls }); };

  if (def.ai === 'melee') {
    const reach = def.radius + def.range;
    ring(reach, 'gd-t-reach');
    say(0, -reach, `blow ${metres(def.range)}`, 'up');
    far = reach + hero * 2 + 1.2;
  }
  if (def.ai === 'ranged') {
    const keep = def.keepAway ?? 8;
    ring(def.range, 'gd-t-far');
    ring(keep, 'gd-t-keep');
    line(0, 0, 0, -def.range + 0.6, 'gd-t-shot');
    say(0, -def.range, `throws up to ${metres(def.range)}`, 'up');
    say(keep * 0.72, keep * 0.72, `backs off inside ${metres(keep)}`, 'side');
    far = def.range + 1.5;
  }
  if (def.ai === 'slam') {
    const at = def.range * 0.6, r = def.slamRadius ?? 3;
    ring(r, 'gd-t-slam', 0, -at);
    say(0, -at, `slam ${metres(r)}`, 'mid');
    const th = def.throws;
    if (th) {
      parts.push(`<circle class="gd-t-band" cx="0" cy="0" r="${f((th.from + th.reach) / 2)}" stroke-width="${f(th.reach - th.from)}"/>`);
      if (th.what === 'lava' && th.splash && th.pool) {
        const y = -(th.from + th.reach) / 2;
        ring(th.pool[0], 'gd-t-pool', -th.reach * 0.35, y);
        ring(th.splash[0], 'gd-t-slam', -th.reach * 0.35, y);
        say(-th.reach * 0.35, y + th.splash[0] + 1.2, 'lava lands, a pool burns', 'down');
      } else if (th.what === 'vine') {
        line(def.radius * 0.8, 0, th.reach * 0.55, -th.reach * 0.83, 'gd-t-vine');
        say(th.reach * 0.55, -th.reach * 0.83, 'vine creeps', 'up');
      }
      say(-th.reach, 0, `throws ${metres(th.from)}–${metres(th.reach)}`, 'leftward');
      far = th.reach + 1.5;
    } else far = at + r + 1.5;
  }
  if (def.ai === 'boss') {
    const r = def.slamRadius ?? 5;
    for (const [i, v] of BOSS_AI.volleys.entries()) {
      const mid = (v.bolts - 1) / 2;
      for (let b = 0; b < v.bolts; b++) {
        const a = (b - mid) * v.apart + (i ? 0.07 : 0), len = BOSS_AI.volleyReach * (i ? 0.88 : 1);
        line(0, 0, Math.sin(a) * len, -Math.cos(a) * len, i ? 'gd-t-shot two' : 'gd-t-shot');
      }
    }
    ring(r, 'gd-t-slam');
    for (let s = 0; s < BOSS_AI.summonCount; s++) {
      const a = (s / BOSS_AI.summonCount) * Math.PI * 2 + Math.PI / 4;
      ring(0.45, 'gd-t-summon', Math.cos(a) * BOSS_AI.summonRing, Math.sin(a) * BOSS_AI.summonRing);
    }
    say(0, -BOSS_AI.volleyReach, `volleys up to ${metres(BOSS_AI.volleyReach)}`, 'up');
    say(r + 0.6, 0, `slam ${metres(r)}`, 'side');
    if (summonName) say(0, r + 2.2, `${BOSS_AI.summonCount} ${summonName}s called round it`, 'down');
    far = BOSS_AI.volleyReach + 1.5;
  }
  // (the foe itself, facing up, and a hero beside it for scale)
  ring(def.radius, 'gd-t-foe');
  line(0, -def.radius * 0.2, 0, -def.radius * 0.95, 'gd-t-face');
  const hx = Math.max(def.radius + hero + 0.4, (def.ai === 'melee' ? def.radius + def.range * 0.75 : 0));
  if (def.ai === 'boss') ring(hero, 'gd-t-hero', -(def.slamRadius ?? 5) - 2.5, (def.slamRadius ?? 5) * 0.4);
  else if (def.ai === 'slam') ring(hero, 'gd-t-hero', (def.slamRadius ?? 3) + hero + 0.6, -def.range * 0.6);
  else ring(hero, 'gd-t-hero', def.ai === 'melee' ? 0 : hx * 0.9, def.ai === 'melee' ? -hx : hx * 0.25);
  // (a scale bar of a round length, a fifth of the drawing or so)
  const unit = [1, 2, 5, 10][[1, 2, 5, 10].findIndex((u) => u >= far * 0.3)] ?? 10;
  const sx = -far + far * 0.08, sy = far - far * 0.08;
  parts.push(`<path class="gd-t-scale" d="M${f(sx)} ${f(sy - far * 0.025)}V${f(sy)}H${f(sx + unit)}V${f(sy - far * 0.025)}"/>`);
  say(sx + unit / 2, sy - far * 0.05, `${unit} m`, 'scale');
  const fs = far * 0.065;
  const text = labels.map((l) => {
    const dy = l.cls === 'up' ? -fs * 0.5 : l.cls === 'down' ? fs * 0.4 : l.cls === 'mid' ? fs * 0.35 : 0;
    const anchor = l.cls === 'side' ? 'start' : l.cls === 'leftward' ? 'start' : 'middle';
    return `<text x="${f(l.x)}" y="${f(l.y + dy)}" text-anchor="${anchor}" font-size="${f(l.cls === 'scale' ? fs * 0.8 : fs)}">${esc(l.text)}</text>`;
  }).join('');
  return `<figure class="gd-fig gd-tele"><svg viewBox="${f(-far)} ${f(-far)} ${f(far * 2)} ${f(far * 2)}" role="img" aria-label="${esc(def.name)}'s attacks seen from above">`
    + `<circle class="gd-t-ground" r="${f(far)}"/>${parts.join('')}${text}</svg>`
    + `<figcaption>Seen from above, to scale: <i class="k foe"></i>${esc(def.name)} <i class="k hero"></i>a hero <i class="k slam"></i>where a blow lands</figcaption></figure>`;
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

// --- a run's loop ---------------------------------------------------------------------------------------------------

/** A run's loop: a wave fought, then Bank (keep the loot, leave) or Continue (a harder wave), and death's cost. */
export function runLoop(): string {
  const box = (x: number, y: number, w: number, h: number, cls: string, lines: string[]): string =>
    `<g class="gd-fl ${cls}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6"/>`
    + lines.map((l, i) => `<text x="${x + w / 2}" y="${y + h / 2 + (i - (lines.length - 1) / 2) * 17 + 5}" text-anchor="middle"${i ? ' class="sub"' : ''}>${esc(l)}</text>`).join('') + '</g>';
  const arrow = (d: string, cls = ''): string => `<path class="gd-fl-arrow ${cls}" d="${d}" marker-end="url(#gd-arrowhead)"/>`;
  return `<figure class="gd-fig gd-flow"><svg viewBox="0 0 640 250" role="img" aria-label="A run's loop">`
    + `<defs><marker id="gd-arrowhead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z"/></marker></defs>`
    + box(20, 95, 140, 60, 'wave', ['Fight a wave', `a boss every ${WAVES.bossEvery}th`])
    + `<g class="gd-fl choice"><path d="M250 75L310 125L250 175L190 125Z"/><text x="250" y="122" text-anchor="middle">Cleared:</text><text x="250" y="140" text-anchor="middle" class="sub">choose</text></g>`
    + box(400, 20, 220, 62, 'bank', ['Bank (B)', 'keep every item, back to the village'])
    + box(400, 168, 220, 62, 'cont', ['Continue (C)', `+${pct(RUN.healOnContinue)} Health, harder wave, better loot`])
    + box(20, 10, 140, 50, 'die', ['Fall', 'unbanked loot is lost'])
    + arrow('M160 125H186') + arrow('M290 108L396 56', 'good') + arrow('M290 142L396 196')
    + arrow('M400 222C300 250 120 250 92 158', 'loop')
    + arrow('M90 95V64', 'bad')
    + '</svg><figcaption>Every wave ends in the same choice. Loot stays sealed in your bag until you bank.</figcaption></figure>';
}

// --- combos ---------------------------------------------------------------------------------------------------------

/** A step of a combo: its key cap's text, the skill's icon and name, its colour. */
export interface Step { key: string; icon: string; name: string; colour: string }

/** A combo as the game's key caps in order, an arrow between each, each cap's skill under it. */
export function keySequence(steps: Step[]): string {
  return `<div class="gd-seq">${steps.map((s, i) => `${i ? '<svg class="gd-seq-arrow" viewBox="0 0 40 20" aria-hidden="true"><path d="M2 10H32M24 3L34 10L24 17"/></svg>' : ''}`
    + `<div class="gd-cap-step" style="--c:${s.colour}"><kbd class="gd-cap">${esc(s.key)}</kbd><span class="gd-cap-skill"><span class="gd-ic">${s.icon}</span>${esc(s.name)}</span></div>`).join('')}</div>`;
}
