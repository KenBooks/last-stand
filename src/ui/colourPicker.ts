// The hero's colour picker in the Play together dialog (ui/coop.ts): a swatch a colour (data/heroColours.ts) and
// Any, shared by Settings and Play together. The host reserves party colours; occupied swatches stay unavailable.
// Play together shows it compact (from the owner, of #682: "just one color and a dropdown to change"): the colour worn
// as one swatch with its name, the palette dropped down under it.
import { HERO_COLOURS, heroColour } from '../data/heroColours';
import { ownColour } from '../net/heroColour';
import { chooseColour, session } from '../net/session';
import { isCoop } from '../net/role';
import { sfx } from '../core/audio';

const ANY = 'Any: original colour solo, a free colour in a party';
/** the dropdown left open: the dialog renders again as rooms and partners change, and it stays open through it */
let dropOpen = false;

/** The same picker works solo and in a party, including during a run; `compact` folds it into a dropdown. */
export function colourPickerHtml(compact = false): string {
  const on = ownColour();
  const swatch = (id: string, name: string, colour: string): string =>
    `<button type="button" class="cc-swatch${id ? '' : ' cc-any'}" role="radio" aria-checked="${(on ?? '') === id}"`
    + ` data-colour="${id}" title="${name}" aria-label="${name}" style="--swatch:${colour}"`
    + `>`
    + `${id ? '' : 'Any'}</button>`;
  const any = swatch('', ANY, 'transparent');
  const swatches = `<div class="cc-swatches" role="radiogroup" aria-label="Your hero's colour">`
    + `${HERO_COLOURS.map((c) => swatch(c.id, c.name, c.swatch)).join('')}${any}</div>`;
  if (!compact) return `<div class="coop-colour"><span>Your colour</span>${swatches}</div>`;
  return `<details class="coop-colour colour-drop"${dropOpen ? ' open' : ''}><summary><span class="cc-label">Your colour</span>`
    + `<span class="cc-now"></span><span class="cc-now-name"></span></summary>${swatches}</details>`;
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
  refreshColourPickers();
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
  // the dropdown's swatch: the colour worn now, and its name
  const worn = heroColour(ownColour());
  for (const now of document.querySelectorAll<HTMLElement>('.colour-drop .cc-now')) {
    now.style.setProperty('--swatch', worn?.swatch ?? 'transparent');
    now.classList.toggle('cc-any', !worn);
    now.textContent = worn ? '' : 'Any';
  }
  for (const name of document.querySelectorAll<HTMLElement>('.colour-drop .cc-now-name')) name.textContent = worn?.name ?? 'Any';
}
