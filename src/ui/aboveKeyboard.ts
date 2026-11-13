// A dialog typed into on a phone kept where the keyboard leaves it in view (the cloud saves' sign-in code, the bug
// report's form).
import { isTouch } from './touch';

/** Once `field` has the focus on a touch screen, the dialog `box` keeps to the part of the screen a keyboard leaves
 *  until it closes (`.typing`, its `--seen-top` and `--seen` the visual viewport's): at its top (in full screen a
 *  phone's keyboard lies over the page and may shrink nothing), and no taller than the visual viewport, which the
 *  keyboard shrinks otherwise. It stays there when the field loses the focus: a tap on a button takes the focus
 *  first, and the dialog moving back under the finger made the tap miss. A mouse's dialog stays centred. */
export function aboveKeyboard(box: HTMLElement, field: HTMLElement): void {
  const seen = window.visualViewport;
  const fit = (): void => {
    if (box.classList.contains('hidden') || !box.contains(field)) { stop(); return; }
    box.style.setProperty('--seen-top', `${seen?.offsetTop ?? 0}px`);
    box.style.setProperty('--seen', `${seen?.height ?? innerHeight}px`);
    if (document.activeElement === field) field.scrollIntoView({ block: 'nearest' });
  };
  const start = (): void => {
    if (!isTouch()) return;
    box.classList.add('typing');
    seen?.addEventListener('resize', fit);
    seen?.addEventListener('scroll', fit);
    fit();
  };
  const stop = (): void => {
    box.classList.remove('typing');
    seen?.removeEventListener('resize', fit);
    seen?.removeEventListener('scroll', fit);
  };
  field.addEventListener('focus', start);
}
