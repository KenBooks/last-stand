// Optional painted portraits in the co-op dialog and the two party lists, never over heroes in the world. With none
// chosen a player's picture is their class's default one, in greys (classOutlines.ts), so every card is laid out alike.
import { G } from '../state';
import { portraitIds, portraitOf, savePortrait, PORTRAIT_COLORS } from '../net/portraits';
import { portraitUrl } from './portraitArt';
import { classOutline } from './classOutlines';
import { sfx } from '../core/audio';
import type { Player } from '../entities/player';

const shown = new WeakMap<HTMLElement, string>();

/** Decorative party-list picture: names remain text, and the None choice shows the class's default picture, inlined in the
 *  bundle, so it creates no image request. */
export function portraitHtml(player: Player): string {
  const id = portraitOf(player), url = id ? portraitUrl(id) : undefined;
  return url ? `<img class="party-portrait" src="${url}" width="36" height="36" alt="" decoding="async">` : classOutline(player.cls.id);
}

/** Refresh a fight's picture only when its choice changes, not on each HUD frame. */
export function syncPortrait(container: HTMLElement, player: Player): void {
  const id = `${player.cls.id}:${portraitOf(player) ?? ''}`;
  if (shown.get(container) === id) return;
  shown.set(container, id);
  container.innerHTML = portraitHtml(player);
  container.hidden = false;
  // (a picture that can't be had, offline say, gives way to the outline)
  const image = container.querySelector('img');
  if (image) image.onerror = () => { container.innerHTML = classOutline(player.cls.id); };
}

/** A closed picker contains no unchosen pictures; its current class is expanded on demand. */
export function portraitPickerHtml(): string {
  const current = portraitHtml(G.player);
  return `<details class="portrait-picker"><summary>${current}<span>Your portrait (optional)</span></summary>`
    + '<div class="portrait-clear"></div>'
    + '<div class="portrait-options" role="group" aria-label="Choose a portrait"></div></details>';
}

/** Populate only the current class when opened, and let a click or touch select a portrait or None. */
export function bindPortraitPicker(root: HTMLElement, changed: () => void): void {
  const picker = root.querySelector<HTMLDetailsElement>('.portrait-picker');
  if (!picker) return;
  const classId = G.player.cls.id;
  picker.ontoggle = () => {
    const options = picker.querySelector<HTMLElement>('.portrait-options')!;
    if (!picker.open || options.childElementCount || G.player.cls.id !== classId) return;
    const selected = portraitOf(G.player);
    const add = (id: string | null, index: number): void => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = id ? 'portrait-option' : 'btn portrait-none';
      button.setAttribute('aria-pressed', String(id === selected));
      button.setAttribute('aria-label', id ? `Portrait ${index + 1}` : 'No portrait');
      button.title = id ? `${PORTRAIT_COLORS[index]} portrait` : 'No portrait';
      const url = id ? portraitUrl(id) : undefined;
      if (url) {
        const image = document.createElement('img');
        image.src = url;
        image.alt = `Portrait ${index + 1}`;
        image.width = image.height = 48;
        image.decoding = 'async';
        button.appendChild(image);
      } else button.textContent = 'None';
      button.onclick = () => {
        if (G.player.cls.id !== classId) return;
        sfx.click();
        savePortrait(classId, id);
        changed();
      };
      if (id) options.appendChild(button);
      else picker.querySelector('.portrait-clear')!.appendChild(button);
    };
    add(null, -1);
    portraitIds(classId).forEach(add);
  };
}
