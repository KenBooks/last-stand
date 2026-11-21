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

/** The button a mouse key presses, lit on a drawn mouse: one cap's width as a digit's, where the words were three. */
function mouseGlyph(side: 'left' | 'right'): string {
  const lit = side === 'left' ? 'M7 1.5C3.7 1.5 1.5 3.9 1.5 7.2V8H7Z' : 'M7 1.5C10.3 1.5 12.5 3.9 12.5 7.2V8H7Z';
  return '<svg class="gd-mouse" viewBox="0 0 14 20" aria-hidden="true">'
    + `<path class="gd-mouse-lit" d="${lit}"/>`
    + '<path class="gd-mouse-body" d="M7 1.5C3.7 1.5 1.5 3.9 1.5 7.2v5.6c0 3.3 2.2 5.7 5.5 5.7s5.5-2.4 5.5-5.7V7.2C12.5 3.9 10.3 1.5 7 1.5ZM1.5 8h11M7 1.5V8"/></svg>';
}

/** What a key's cap shows: the mouse with its button lit, or the key's letter. */
export const keyFace = (k: SkillKey): string =>
  k === 'mouse0' ? mouseGlyph('left') : k === 'mouse2' ? mouseGlyph('right') : esc(keyName(k));

/** A key's cap, small, for a loadout's row, a skill's card and a table's: the guide's one way of showing a key. */
export const keyCap = (k: SkillKey): string =>
  `<kbd class="gd-key${k.startsWith('mouse') ? ' mouse' : ''}" title="${keyName(k)}" aria-label="${keyName(k)}">${keyFace(k)}</kbd>`;
