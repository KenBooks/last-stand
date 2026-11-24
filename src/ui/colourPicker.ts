// The hero's colour picker in the Play together dialog (ui/coop.ts): a swatch a colour (data/heroColours.ts), Any,
// and the colour wheel, shared by Settings and Play together. The host reserves party colours; occupied swatches stay
// unavailable. Play together shows it compact (from the owner, of #682: "just one color and a dropdown to change"):
// the colour worn as one swatch with its name, the palette dropped down under it.
// The wheel (#732, from the owner: "More niche colours can be selected using the colour wheel", the wheel "opens from a
// button"; every swatch kept beside it, from review: "Lets keep the original colors, they were tested and look good"): a disc of hue round and
// saturation out, and a slider of lightness under it, held to what reads as cloth (`CUSTOM_RANGE`); picked as the
// finger or the mouse lifts off the disc, or as the slider is let go, so a party's host is asked once a pick.
import { CUSTOM_RANGE, HERO_COLOURS, customColourId, heroColour } from '../data/heroColours';
import { ownColour } from '../net/heroColour';
import { chooseColour, session } from '../net/session';
import { isCoop } from '../net/role';
import { sfx } from '../core/audio';

const ANY = 'Any: original colour solo, a free colour in a party';
const WHEEL = 'More colours: pick one on the wheel';
/** the dropdown left open: the dialog renders again as rooms and partners change, and it stays open through it */
let dropOpen = false;
/** the wheel left open, for the same reason */
let wheelOpen = false;
/** the wheel's disc drawn (css px across), and its picture made once */
const DISC = 132;
let discPicture: ImageData | null = null;
/** the colour being picked on the wheel: hue, saturation (the disc) and lightness (the slider), 0..1 */
const picking = { h: 0, s: 0.5, l: 0.4 };

/** The same picker works solo and in a party, including during a run; `compact` folds it into a dropdown. */
export function colourPickerHtml(compact = false): string {
  const on = ownColour();
  const swatch = (id: string, name: string, colour: string): string =>
    `<button type="button" class="cc-swatch${id ? '' : ' cc-any'}" role="radio" aria-checked="${(on ?? '') === id}"`
    + ` data-colour="${id}" title="${name}" aria-label="${name}" style="--swatch:${colour}"`
    + `>`
    + `${id ? '' : 'Any'}</button>`;
  const any = swatch('', ANY, 'transparent');
  const wheel = `<button type="button" class="cc-wheel-open" aria-expanded="${wheelOpen}" title="${WHEEL}"`
    + ` aria-label="${WHEEL}"></button>`;
  const row = (after: string): string => `<div class="cc-swatches" role="radiogroup" aria-label="Your hero's colour">`
    + `${HERO_COLOURS.map((c) => swatch(c.id, c.name, c.swatch)).join('')}${any}${after}</div>${wheelHtml()}`;
  // (in Settings the wheel's button stands by the label, in the room its line leaves: after Any, on a phone held
  // sideways the twelve swatches and Any filled their row at a finger's size and it took a row of its own, and the tab
  // scrolled)
  if (!compact) return `<div class="coop-colour"><span>Your colour</span>${wheel}${row('')}</div>`;
  return `<details class="coop-colour colour-drop"${dropOpen ? ' open' : ''}><summary><span class="cc-label">Your colour</span>`
    + `<span class="cc-now"></span><span class="cc-now-name"></span></summary>${row(wheel)}</details>`;
}

/** The wheel's panel: its disc, its marker, its lightness slider and the colour as picked. */
function wheelHtml(): string {
  const [low, high] = CUSTOM_RANGE.light;
  const value = Math.round(((picking.l - low) / (high - low)) * 100);
  return `<div class="cc-wheel"${wheelOpen ? '' : ' hidden'}>`
    + `<div class="cc-disc"><canvas width="${DISC * 2}" height="${DISC * 2}" aria-label="Hue and saturation"></canvas>`
    + `<span class="cc-mark"></span></div>`
    + `<label class="cc-light"><span>Light</span><input type="range" min="0" max="100" value="${value}"`
    + ` aria-label="Lightness"></label><span class="cc-picked"></span></div>`;
}

/** Picks a swatch as it's clicked or tapped; party changes wait for the host's allocation. */
export function bindColourPicker(root: HTMLElement): void {
  for (const drop of root.querySelectorAll<HTMLDetailsElement>('details.colour-drop')) drop.ontoggle = () => { dropOpen = drop.open; };
  for (const b of root.querySelectorAll<HTMLButtonElement>('.cc-swatch')) {
    b.onclick = () => {
      sfx.click();
      const id = heroColour(b.dataset.colour)?.id ?? null;
      chooseColour(id);
      // (the dropdown folds away once a colour is picked)
      dropOpen = false;
      b.closest<HTMLDetailsElement>('details.colour-drop')?.removeAttribute('open');
      refreshColourPickers();
    };
  }
  for (const open of root.querySelectorAll<HTMLButtonElement>('.cc-wheel-open')) {
    open.onclick = () => {
      sfx.click();
      wheelOpen = !wheelOpen;
      if (wheelOpen) startFromWorn();
      refreshColourPickers();
    };
  }
  for (const wheel of root.querySelectorAll<HTMLElement>('.cc-wheel')) bindWheel(wheel);
  refreshColourPickers();
}

/** The wheel begun at the colour worn (none: a mid red). */
function startFromWorn(): void {
  const worn = heroColour(ownColour());
  if (!worn) return;
  [picking.h, picking.s, picking.l] = worn.hsl;
}

/** The disc and the slider of one wheel bound: a press on the disc picks there and follows the pointer while it's
 *  held, the pick made as it lifts; the slider's pick made as it's let go. */
function bindWheel(wheel: HTMLElement): void {
  const canvas = wheel.querySelector('canvas')!;
  drawDisc(canvas);
  const pickAt = (event: PointerEvent): void => {
    const box = canvas.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * 2 - 1;
    const y = ((event.clientY - box.top) / box.height) * 2 - 1;
    picking.h = (Math.atan2(y, x) / (Math.PI * 2) + 1) % 1;
    picking.s = Math.min(1, Math.hypot(x, y));
    showPicking();
  };
  canvas.onpointerdown = (event) => {
    canvas.setPointerCapture(event.pointerId);
    pickAt(event);
  };
  canvas.onpointermove = (event) => {
    if (canvas.hasPointerCapture(event.pointerId)) pickAt(event);
  };
  canvas.onpointerup = (event) => {
    if (!canvas.hasPointerCapture(event.pointerId)) return;
    canvas.releasePointerCapture(event.pointerId);
    pickAt(event);
    choosePicked();
  };
  const slider = wheel.querySelector<HTMLInputElement>('input[type="range"]')!;
  const [low, high] = CUSTOM_RANGE.light;
  slider.oninput = () => {
    picking.l = low + (Number(slider.value) / 100) * (high - low);
    showPicking();
  };
  slider.onchange = () => choosePicked();
}

/** The colour picked on the wheel worn (and asked of the room's host, in a party). */
function choosePicked(): void {
  sfx.click();
  chooseColour(customColourId(picking.h, picking.s, picking.l));
  refreshColourPickers();
}

/** The wheel's disc: hue round it, saturation out from its middle, at a mid lightness (made once, then put). */
function drawDisc(canvas: HTMLCanvasElement): void {
  const g = canvas.getContext('2d');
  if (!g) return;
  const size = canvas.width;
  if (!discPicture || discPicture.width !== size) {
    discPicture = g.createImageData(size, size);
    const d = discPicture.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = (x + 0.5) / size * 2 - 1, dy = (y + 0.5) / size * 2 - 1, r = Math.hypot(dx, dy);
        const i = (y * size + x) * 4;
        if (r > 1) { d[i + 3] = 0; continue; }
        const hex = customColourId((Math.atan2(dy, dx) / (Math.PI * 2) + 1) % 1, r, 0.45);
        d[i] = parseInt(hex.slice(1, 3), 16);
        d[i + 1] = parseInt(hex.slice(3, 5), 16);
        d[i + 2] = parseInt(hex.slice(5, 7), 16);
        d[i + 3] = r > 0.985 ? Math.round((1 - r) / 0.015 * 255) : 255;
      }
    }
  }
  g.putImageData(discPicture, 0, 0);
}

/** The wheel's marker and the colour as it's being picked, on every wheel shown. */
function showPicking(): void {
  const colour = customColourId(picking.h, picking.s, picking.l);
  for (const wheel of document.querySelectorAll<HTMLElement>('.cc-wheel')) {
    const mark = wheel.querySelector<HTMLElement>('.cc-mark')!;
    const angle = picking.h * Math.PI * 2;
    mark.style.left = `${50 + Math.cos(angle) * picking.s * 50}%`;
    mark.style.top = `${50 + Math.sin(angle) * picking.s * 50}%`;
    const picked = wheel.querySelector<HTMLElement>('.cc-picked')!;
    picked.style.setProperty('--swatch', colour);
  }
}

/** Refresh in place: an arriving party update must not replace a focused Settings control. */
export function refreshColourPickers(): void {
  const taken = new Set(isCoop() ? [...session.peers.values()].map(p => p.colour) : []);
  for (const button of document.querySelectorAll<HTMLButtonElement>('.cc-swatch')) {
    const id = heroColour(button.dataset.colour)?.id ?? null;
    button.setAttribute('aria-checked', String(id === ownColour()));
    button.disabled = session.status === 'joining' || (id !== null && taken.has(id));
    const name = id ? heroColour(id)!.name : ANY;
    button.title = name + (id && taken.has(id) ? ' — already in use' : '');
    button.setAttribute('aria-label', button.title);
  }
  // the wheel's button: the colour worn where it's none of the swatches (one picked on the wheel), lit then; its panel
  // shown while open
  const worn = heroColour(ownColour());
  const offSwatches = !!worn && worn.id.startsWith('#');
  for (const open of document.querySelectorAll<HTMLButtonElement>('.cc-wheel-open')) {
    open.style.setProperty('--swatch', offSwatches ? worn.swatch : 'transparent');
    open.classList.toggle('cc-worn', offSwatches);
    open.setAttribute('aria-expanded', String(wheelOpen));
    open.disabled = session.status === 'joining';
  }
  for (const wheel of document.querySelectorAll<HTMLElement>('.cc-wheel')) wheel.hidden = !wheelOpen;
  if (wheelOpen) showPicking();
  // the dropdown's swatch: the colour worn now, and its name
  for (const now of document.querySelectorAll<HTMLElement>('.colour-drop .cc-now')) {
    now.style.setProperty('--swatch', worn?.swatch ?? 'transparent');
    now.classList.toggle('cc-any', !worn);
    now.textContent = worn ? '' : 'Any';
  }
  for (const name of document.querySelectorAll<HTMLElement>('.colour-drop .cc-now-name')) name.textContent = worn?.name ?? 'Any';
}
