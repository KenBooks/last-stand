// The guide's small pieces: figures written the one way everywhere (a second, a metre, a share), a figure's tile, a
// list under a heading, a key's name.
import type { SkillKey } from '../../types';

/** `v` to `dec` places at most, its trailing zeros dropped */
export const num = (v: number, dec = 1): string => String(Number(v.toFixed(dec)));
export const whole = (v: number): string => String(Math.round(v));
export const secs = (v: number): string => `${num(v, 2)} s`;
export const metres = (v: number): string => `${num(v, 1)} m`;
/** a share (0..1) as a percentage */
export const pct = (share: number): string => `${num(share * 100, 1)}%`;
/** a colour of the game's data (0xrrggbb) as CSS */
export const css = (c: number): string => '#' + c.toString(16).padStart(6, '0');

/** Text made safe to lay into markup. */
export const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** A figure's tile: its name, its value, and a line under it. */
export const tile = (label: string, value: string, note = ''): string =>
  `<div class="gd-tile"><span class="gd-tl">${label}</span><b>${value}</b>${note ? `<small>${note}</small>` : ''}</div>`;

/** Tiles laid out in a grid. */
export const tiles = (items: string[]): string => `<div class="gd-tiles">${items.join('')}</div>`;

/** A heading over a section of a page. */
export const head = (title: string): string => `<h3 class="gd-h">${title}</h3>`;

/** A list of points under a heading (none: nothing), marked as good, bad or plain. */
export function points(title: string, items: string[], kind: 'good' | 'bad' | 'plain' = 'plain'): string {
  if (!items.length) return '';
  return `<div class="gd-points">${title ? head(title) : ''}<ul class="gd-list ${kind}">${items.map((t) => `<li>${t}</li>`).join('')}</ul></div>`;
}

/** A paragraph. */
export const para = (html: string): string => `<p class="gd-p">${html}</p>`;

/** A place for `id`'s picture (a foe's id, or `hero:` and a class's), of the class `cls`: its canvas filled once the
 *  picture is made (`fillPortraits` in index.ts), a spinner in it till then. */
export const pic = (id: string, cls: string): string =>
  `<span class="gd-pic ${cls} waiting" data-foe="${esc(id)}" role="img" aria-label="${id.startsWith('hero:') ? 'The hero' : 'The foe'}"><canvas width="320" height="320"></canvas></span>`;

/** A key as the keyboard and mouse name it. */
export function keyName(k: SkillKey): string {
  return k === 'mouse0' ? 'Left click' : k === 'mouse2' ? 'Right click' : k.toUpperCase();
}

/** A key's cap, small, for a combo's or a loadout's row. */
export const keyCap = (k: SkillKey): string => `<kbd class="gd-key">${keyName(k)}</kbd>`;
