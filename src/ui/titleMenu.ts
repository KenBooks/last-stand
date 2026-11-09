// The title menu: once the game has loaded, the loading screen's logo waits over a menu, as a game's title screen does
// (Make your stand, Full screen, "Press any key"), for the player's first click, tap or key. That gesture is what
// lets a browser play sound (before it the effects' context stays suspended where no autoplay is allowed), so the
// logo's exit and its gust are heard every time, and the lobby's music starts with it.
import { audioReady, sfx } from '../core/audio';
import { recorder } from '../perf/recorder';

/** Whether this boot waits on the title menu: not under a harness (the lab and stalls drive the page by WebDriver and
 *  time its boot to the reveal), unless the address asks for it (`?title`). */
export function titleWanted(): boolean {
  return !navigator.webdriver || new URLSearchParams(location.search).has('title');
}

/** keys that never start the game: modifiers held for something else, the browser's own (F1 to F12), Tab, Esc */
const IGNORED = new Set(['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'NumLock', 'ScrollLock', 'Tab', 'Escape',
  'ContextMenu', 'OS', 'Fn', 'Unidentified', 'Dead']);
const ignored = (e: KeyboardEvent): boolean => IGNORED.has(e.key) || /^F\d{1,2}$/.test(e.key) || e.ctrlKey || e.metaKey || e.altKey;

/** the flare of the choice before the logo blows away (s): `#loading.chosen` in index.html */
const CHOSEN_MS = 380;

/**
 * Shows the title menu on the loading screen `l` and waits for the player: resolved once they've chosen to make their
 * stand (any key, a click or tap anywhere but Full screen), the start sound playing and the choice flared.
 */
export function titleMenu(l: HTMLElement): Promise<void> {
  const menu = l.querySelector<HTMLElement>('.ld-menu')!;
  const items = [...menu.querySelectorAll<HTMLButtonElement>('.ld-item')];
  const start = menu.querySelector<HTMLButtonElement>('.start')!, full = menu.querySelector<HTMLButtonElement>('.full')!;
  const hint = menu.querySelector<HTMLElement>('.ld-hint')!;
  const fullLabel = full.querySelector('span')!;
  full.hidden = !document.fullscreenEnabled;
  const touch = matchMedia('(pointer: coarse)').matches;
  hint.textContent = touch ? 'Tap to begin' : 'Press any key';
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) hint.classList.add('breathe');
  const shownAt = performance.now();
  recorder.bootStep('the title menu');

  // the loading screen stops announcing its steps: it's a menu now
  l.removeAttribute('aria-live');
  l.removeAttribute('role');
  l.classList.add('title');
  menu.hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => menu.classList.add('shown')));

  const shown = (): HTMLButtonElement[] => items.filter((b) => !b.hidden);
  let on = start;
  const select = (b: HTMLButtonElement, heard = true): void => {
    if (b === on && b.classList.contains('on')) return;
    for (const i of items) i.classList.toggle('on', i === b);
    on = b;
    b.focus({ preventScroll: true });
    if (heard) sfx.titleMove();
  };
  select(start, false);
  const syncFull = (): void => { fullLabel.textContent = document.fullscreenElement ? 'Leave full screen' : 'Full screen'; };
  syncFull();

  return new Promise<void>((resolve) => {
    let chosen = false;
    const toggleFull = (): void => {
      void audioReady();
      const done = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
      void done.catch(() => undefined);
    };
    const choose = (): void => {
      if (chosen) return;
      chosen = true;
      select(start, false);
      removeEventListener('keydown', onKey, true);
      l.removeEventListener('pointerdown', onPress);
      l.removeEventListener('pointerover', onOver);
      document.removeEventListener('fullscreenchange', syncFull);
      recorder.waitedOnTitle(performance.now() - shownAt);
      l.classList.add('chosen');
      void audioReady().then(() => sfx.titleStart());
      setTimeout(() => { start.blur(); resolve(); }, CHOSEN_MS);
    };
    const act = (b: HTMLButtonElement): void => { if (b === full) { select(full, false); toggleFull(); } else choose(); };
    // every key the menu takes is its alone: none reaches the game behind it (Space would stow the lobby's panels)
    const onKey = (e: KeyboardEvent): void => {
      if (ignored(e)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.repeat) return;
      const list = shown(), at = list.indexOf(on);
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') { void audioReady().then(() => select(list[(at + 1) % list.length])); return; }
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') { void audioReady().then(() => select(list[(at + list.length - 1) % list.length])); return; }
      if (e.key === 'Enter' || e.key === ' ') { act(on); return; }
      choose();
    };
    // a press anywhere starts, but on Full screen; the button's own click never follows (its press is taken here)
    const onPress = (e: PointerEvent): void => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const b = (e.target as Element).closest<HTMLButtonElement>('.ld-item');
      act(b ?? start);
    };
    const onOver = (e: PointerEvent): void => {
      const b = (e.target as Element).closest<HTMLButtonElement>('.ld-item');
      if (b && e.pointerType === 'mouse') select(b);
    };
    addEventListener('keydown', onKey, true);
    l.addEventListener('pointerdown', onPress);
    l.addEventListener('pointerover', onOver);
    document.addEventListener('fullscreenchange', syncFull);
  });
}
