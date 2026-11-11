// The cursor drawn while Alt is held in the close views, the game's own (its art in index.html). Mouse look keeps the
// pointer locked, so the browser shows no cursor and sends every click to the game's canvas: the HUD's buttons (the
// battle log's Pause, Copy, Clear) couldn't be pressed. Held Alt stills the view, the lock kept, and the mouse moves
// this cursor instead; what it does over the page goes to what lies under it, as the browser's own would: hover (the
// hotbar's tooltips), clicks and the wheel (the log's list scrolled). The world under it takes none of it: a click
// missing a button doesn't attack.
import { input, isDown, pointerLocked } from '../core/input';
import { altSelectKey, beginAltRange, closeAltSelect, dragAltRange, endAltRange, openAltSelect, outsideAltSelect } from './altForms';

const el = (): HTMLElement => document.getElementById('alt-cursor')!;
let canvas: HTMLCanvasElement;
let shown = false;
/** where it points, css px */
const at = { x: 0, y: 0 };
/** what it's over (null: the world), and what its press went down on */
let hovered: Element | null = null, pressedOn: Element | null = null;
let hoverChain: Element[] = [];
/** the events it sent the page: its own listeners let them through */
const sent = new WeakSet<Event>();
/** Native activation may dispatch another click (a label activates its checkbox). Let that click through too. */
let activating = false;

/** Alt held while the pointer is locked for mouse look: the mouse moves the drawn cursor. */
export const altCursorOn = (): boolean => !input.touchMode && pointerLocked() && (isDown('altleft') || isDown('altright'));

/** What the cursor is over: an element of the page, or null over the world (the canvas, where nothing else is). */
function under(): Element | null {
  const found = document.elementFromPoint(at.x, at.y);
  return found && found !== canvas && found !== document.body && found !== document.documentElement ? found : null;
}

function send(target: Element, type: string, init: MouseEventInit = {}): void {
  const make = type.startsWith('pointer') ? PointerEvent : MouseEvent;
  const bubbles = type !== 'mouseenter' && type !== 'mouseleave';
  const event = new make(type, { bubbles, cancelable: bubbles, composed: true, view: window, clientX: at.x, clientY: at.y,
    ...(make === PointerEvent ? { pointerType: 'mouse', pointerId: 1, isPrimary: true } : {}), ...init });
  sent.add(event);
  target.dispatchEvent(event);
}

/** The elements from `from` up that don't hold `other`, outermost last. */
function outside(from: Element | null, other: Element | null): Element[] {
  const chain: Element[] = [];
  for (let e = from; e && !e.contains(other); e = e.parentElement) chain.push(e);
  return chain;
}

/** Hover moved onto what the cursor is over now: out of the last, into this one, as the browser's mouse moves; lit
 *  over what takes a click, as the page's own cursor is. */
function hover(): void {
  const now = shown ? under() : null;
  if (now === hovered) { if (now) send(now, 'mousemove'); return; }
  const was = hovered;
  hovered = now;
  const chain = outside(now, null);
  for (const e of hoverChain) if (!chain.includes(e)) e.classList.remove('alt-hover');
  for (const e of chain) if (!hoverChain.includes(e)) e.classList.add('alt-hover');
  hoverChain = chain;
  el().classList.toggle('lit', !!now && getComputedStyle(now).cursor.endsWith('pointer'));
  if (was) { send(was, 'mouseout', { relatedTarget: now }); for (const e of outside(was, now)) send(e, 'mouseleave', { relatedTarget: now }); }
  if (now) { send(now, 'mouseover', { relatedTarget: was }); for (const e of outside(now, was).reverse()) send(e, 'mouseenter', { relatedTarget: was }); send(now, 'mousemove'); }
}

function show(on: boolean): void {
  if (on === shown) return;
  shown = on;
  // (from the crosshair each time)
  if (on) { at.x = innerWidth / 2; at.y = innerHeight / 2; place(); }
  else { pressedOn = null; endAltRange(); closeAltSelect(); }
  el().classList.toggle('hidden', !on);
  hover();
}

function place(): void {
  at.x = Math.min(Math.max(at.x, 0), innerWidth - 1);
  at.y = Math.min(Math.max(at.y, 0), innerHeight - 1);
  el().style.transform = `translate(${at.x}px, ${at.y}px)`;
}

/** The nearest box from `from` up that scrolls. */
function scroller(from: Element | null): Element | null {
  for (let e = from; e; e = e.parentElement) if (e.scrollHeight > e.clientHeight && /auto|scroll/.test(getComputedStyle(e).overflowY)) return e;
  return null;
}

/** Called every frame: shown while Alt is held over mouse look, hidden as either ends. */
export function updateAltCursor(): void { show(altCursorOn()); }

export function initAltCursor(gameCanvas: HTMLCanvasElement): void {
  canvas = gameCanvas;
  // (on the window as it captures, before the game's own: mouse look and the canvas's attacks never hear them)
  const mine = (e: Event): boolean => { if (sent.has(e) || activating) return false; show(altCursorOn()); return shown; };
  window.addEventListener('pointermove', (e) => {
    if (!mine(e)) return;
    e.stopPropagation();
    at.x += e.movementX; at.y += e.movementY;
    place();
    dragAltRange(at);
    hover();
  }, true);
  for (const type of ['mousedown', 'mousemove', 'click', 'auxclick', 'dblclick', 'contextmenu']) {
    window.addEventListener(type, (e) => { if (mine(e)) { e.stopPropagation(); e.preventDefault(); } }, true);
  }
  // (pressed on the pointer's own events: the down cancelled holds back the mouse's down and up after it, so the
  // canvas never hears the press as an attack)
  window.addEventListener('pointerdown', (e) => {
    if (!mine(e)) return;
    e.stopPropagation(); e.preventDefault();
    if (e.button !== 0) return;
    pressedOn = under();
    outsideAltSelect(pressedOn);
    if (beginAltRange(pressedOn, at)) return;
    if (pressedOn) { send(pressedOn, 'pointerdown', { button: 0, buttons: 1 }); send(pressedOn, 'mousedown', { button: 0, buttons: 1, detail: 1 }); }
  }, true);
  // (the release goes on to the game too: an attack held as Alt went down lets go)
  window.addEventListener('pointerup', (e) => {
    if (sent.has(e) || e.button !== 0 || !pressedOn) return;
    dragAltRange(at);
    if (endAltRange()) { pressedOn = null; return; }
    const down = pressedOn, up = under();
    pressedOn = null;
    if (!up) return;
    send(up, 'pointerup', { button: 0 }); send(up, 'mouseup', { button: 0, detail: 1 });
    // (a click lands on what both went down and came up on)
    let both: Element | null = down;
    while (both && !both.contains(up)) both = both.parentElement;
    const select = both?.closest('select');
    if (select instanceof HTMLSelectElement && !select.disabled) {
      openAltSelect(select);
      return;
    }
    if (both && both !== document.body && both !== document.documentElement) {
      activating = true;
      try { send(both, 'click', { button: 0, detail: 1 }); }
      finally { activating = false; }
    }
  }, true);
  window.addEventListener('wheel', (e) => {
    if (!mine(e)) return;
    // (the view keeps its zoom)
    e.stopPropagation(); e.preventDefault();
    scroller(under())?.scrollBy({ top: e.deltaY });
  }, { capture: true, passive: false });
  window.addEventListener('keydown', altSelectKey, true);
  window.addEventListener('keyup', (event) => {
    if (event.key === 'Alt') show(false);
  });
  window.addEventListener('resize', closeAltSelect);
  window.addEventListener('blur', () => { endAltRange(); closeAltSelect(); });
}
