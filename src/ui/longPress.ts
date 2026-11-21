// A finger held on the game never opens the browser's own menu. Holding is how touch play aims, channels and holds a
// skill, and Android Chrome took a long press on a skill button for the page's (Back, Forward, Reload, Download, Print,
// Share: from play, "holding a skill button on mobile gives this"). The page's `-webkit-touch-callout: none` and
// `user-select: none` (`_base.scss`) stop the callout and the text selection, not the `contextmenu` a long press
// fires: only the canvas and a few buttons prevented theirs. So every long press is prevented here, once, wherever it
// lands, but on text kept to be selected or typed in (a field, a code shown to copy: `user-select: text`).

/** Whether a long press on `target` is the player's to select or edit text. */
function keepsText(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return true;
  const style = getComputedStyle(target);
  const select = style.userSelect || style.webkitUserSelect;
  return select === 'text' || select === 'all';
}

/** Whether `event` is a finger's long press (or a pen's): a mouse's right button keeps its own handling. */
function byFinger(event: MouseEvent): boolean {
  const type = (event as PointerEvent).pointerType;
  // (a browser whose `contextmenu` is no pointer event: as the game's input was last used)
  if (type === undefined || type === '') return document.body.classList.contains('touch');
  return type !== 'mouse';
}

/** Prevents the browser's menu on a long press anywhere on the page but on text kept selectable. */
export function holdWithoutMenu(): void {
  window.addEventListener('contextmenu', (event) => {
    if (byFinger(event) && !keepsText(event.target)) event.preventDefault();
  }, true);
  // (an image or a link a finger holds starts a drag on some browsers, not a menu: none of the touch controls is one)
  window.addEventListener('dragstart', (event) => {
    if (document.body.classList.contains('touch') && !keepsText(event.target)) event.preventDefault();
  }, true);
}
