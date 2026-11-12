// The hero's colour picker in the Play together dialog (ui/coop.ts): a swatch a colour (data/heroColours.ts) and
// Any, shared by Settings and Play together. The host reserves party colours; occupied swatches stay unavailable.
import { HERO_COLOURS, heroColour } from '../data/heroColours';
import { ownColour } from '../net/heroColour';
import { chooseColour, session } from '../net/session';
import { isCoop } from '../net/role';
import { sfx } from '../core/audio';

/** The same picker works solo and in a party, including during a run. */
export function colourPickerHtml(): string {
  const on = ownColour();
  const swatch = (id: string, name: string, colour: string): string =>
    `<button type="button" class="cc-swatch${id ? '' : ' cc-any'}" role="radio" aria-checked="${(on ?? '') === id}"`
    + ` data-colour="${id}" title="${name}" aria-label="${name}" style="--swatch:${colour}"`
    + `>`
    + `${id ? '' : 'Any'}</button>`;
  const any = swatch('', 'Any: original colour solo, a free colour in a party', 'transparent');
  return `<div class="coop-colour"><span>Your colour</span>`
    + `<div class="cc-swatches" role="radiogroup" aria-label="Your hero's colour">`
    + `${HERO_COLOURS.map((c) => swatch(c.id, c.name, c.swatch)).join('')}${any}</div></div>`;
}

/** Picks a swatch as it's clicked or tapped; party changes wait for the host's allocation. */
export function bindColourPicker(root: HTMLElement): void {
  for (const b of root.querySelectorAll<HTMLButtonElement>('.cc-swatch')) {
    b.onclick = () => {
      sfx.click();
      const id = heroColour(b.dataset.colour)?.id ?? null;
      chooseColour(id);
      refreshColourPickers();
    };
  }
  refreshColourPickers();
}

/** Refresh in place: an arriving party update must not replace a focused Settings control. */
export function refreshColourPickers(): void {
  const taken = new Set(isCoop() ? [...session.peers.values()].map(p => p.colour) : []);
  for (const button of document.querySelectorAll<HTMLButtonElement>('.cc-swatch')) {
    const id = heroColour(button.dataset.colour)?.id ?? null;
    button.setAttribute('aria-checked', String(id === ownColour()));
    button.disabled = session.status === 'joining' || (id !== null && taken.has(id));
    const name = id ? heroColour(id)!.name : 'Any: original colour solo, a free colour in a party';
    button.title = name + (id && taken.has(id) ? ' — already in use' : '');
    button.setAttribute('aria-label', button.title);
  }
}
