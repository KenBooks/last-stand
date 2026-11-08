// The hero's colour picker in the Play together dialog (ui/coop.ts): a swatch a colour (data/heroColours.ts) and
// Any, the pick kept for next time (net/heroColour.ts). Out of a room the hero wears it at once, solo too; in a room
// the host gave the colour, so the picker shows it and waits for the next room.
import { G } from '../state';
import { HERO_COLOURS, heroColour } from '../data/heroColours';
import { ownColour, saveColour, savedColour } from '../net/heroColour';
import { sfx } from '../core/audio';

/** The picker's markup: `inRoom` shows the room's colour, not to be changed there. */
export function colourPickerHtml(inRoom: boolean): string {
  const on = inRoom ? ownColour() : savedColour();
  const swatch = (id: string, name: string, colour: string): string =>
    `<button type="button" class="cc-swatch${id ? '' : ' cc-any'}" role="radio" aria-checked="${(on ?? '') === id}"`
    + ` data-colour="${id}" title="${name}" aria-label="${name}" style="--swatch:${colour}"`
    + `${inRoom ? ' disabled' : ''}>`
    + `${id ? '' : 'Any'}</button>`;
  const any = swatch('', 'Any: a room gives a colour no one there wears', 'transparent');
  return `<div class="coop-colour${inRoom ? ' off' : ''}"><span>Your colour</span>`
    + `<div class="cc-swatches" role="radiogroup" aria-label="Your hero's colour">`
    + `${HERO_COLOURS.map((c) => swatch(c.id, c.name, c.swatch)).join('')}${any}</div></div>`;
}

/** Picks a swatch as it's clicked or tapped: kept, and worn at once out of a room. */
export function bindColourPicker(root: HTMLElement, inRoom: boolean): void {
  if (inRoom) return;
  for (const b of root.querySelectorAll<HTMLButtonElement>('.cc-swatch')) {
    b.onclick = () => {
      sfx.click();
      const id = heroColour(b.dataset.colour)?.id ?? null;
      saveColour(id);
      G.player.setColour(ownColour());
      for (const other of root.querySelectorAll('.cc-swatch')) other.setAttribute('aria-checked', String(other === b));
    };
  }
}
