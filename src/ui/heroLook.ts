// The hero selection screen's Look page (`.hs-look`, ui/heroSelect.ts): the hero in focus's looks (data/heroLooks.ts),
// a button each with what sets him apart, and the hair colours, a swatch each and his look's own first. A pick is kept
// in his profile in the save slot in play (`pickLook`, game/looks.ts) and shown on him at once: a hair colour by a
// uniform, another look built again behind its button's "Readying" while the old one stands (`restyleHallHero`). The
// lobby's own hero takes it as the screen closes (main.ts `restyleHero`). Buttons alone, so a tap is a click on touch.
import { CLASSES } from '../data/classes/index';
import { HAIR_COLOURS, looksOf, type HeroLook } from '../data/heroLooks';
import { LOOKS } from '../entities/models/face';
import { headOfPreset } from '../entities/models/head';
import { hallHeroes, hallFocus, hallHeroRestyling, restyleHallHero } from '../game/hall';
import { pickLook, profileLook } from '../game/looks';
import { sfx } from '../core/audio';

/** the page's root */
const page = (): HTMLElement => document.querySelector<HTMLElement>('#heroes .hs-look')!;

/** A hair colour as a swatch shows it: the paint's, lifted as the hair's cards lift it (models/head.ts `hk`). */
const swatchOf = (rgb: readonly number[]): string => `rgb(${rgb.map((c) => Math.round(Math.min(1, c * 2.3) * 255)).join(' ')})`;

/** The page drawn for the hero in focus (his looks, his hair, which are picked, whether he's being built again). */
export function renderHeroLook(): void {
  const root = page();
  const hero = hallHeroes()[hallFocus()];
  if (!root || !hero) return;
  const { id, profile } = hero, model = CLASSES[id].model, look = profileLook(profile);
  const own = LOOKS[headOfPreset(model, look.preset)!.who].hair;
  const busy = hallHeroRestyling(id);
  const presets = looksOf(model).map((def) => {
    const on = def.id === look.preset;
    return `<button type="button" class="hl-preset${on ? ' on' : ''}${on && busy ? ' busy' : ''}" role="radio" aria-checked="${on}" data-look="${def.id}">`
      + `<b>${def.name}</b><span>${on && busy ? 'Readying…' : def.blurb}</span></button>`;
  }).join('');
  const swatch = (hair: string | null, name: string, rgb: readonly number[]) =>
    `<button type="button" class="hl-swatch${hair ? '' : ' hl-own'}" role="radio" aria-checked="${look.hair === hair}" data-hair="${hair ?? ''}"`
    + ` title="${name}" aria-label="${name}" style="--swatch:${swatchOf(rgb)}"></button>`;
  root.innerHTML = '<div class="hs-label">Look</div>'
    + `<div class="hl-presets" role="radiogroup" aria-label="Look">${presets}</div>`
    + '<div class="hs-label">Hair colour</div>'
    + `<div class="hl-hairs" role="radiogroup" aria-label="Hair colour">${swatch(null, 'His own', own)}${HAIR_COLOURS.map((c) => swatch(c.id, c.name, c.rgb)).join('')}</div>`
    + `<p class="hl-note">${hairName(look)} hair, brows and beard</p>`;
  for (const b of root.querySelectorAll<HTMLButtonElement>('.hl-preset')) b.onclick = () => pick({ ...look, preset: b.dataset.look! });
  for (const b of root.querySelectorAll<HTMLButtonElement>('.hl-swatch')) b.onclick = () => pick({ ...look, hair: b.dataset.hair || null });
}

/** What the hair colour picked is called. */
const hairName = (look: HeroLook): string => (look.hair ? HAIR_COLOURS.find((c) => c.id === look.hair)!.name : 'His own');

/** `look` picked for the hero in focus: kept, shown on him, the page drawn again now and once he stands in it. */
function pick(look: HeroLook): void {
  const hero = hallHeroes()[hallFocus()];
  if (!hero) return;
  const was = profileLook(hero.profile);
  if (was.preset === look.preset && was.hair === look.hair) return;
  sfx.click();
  pickLook(hero.profile, look);
  const done = restyleHallHero(hero.id);
  renderHeroLook();
  void done.then(() => { if (hallHeroes()[hallFocus()]?.id === hero.id) renderHeroLook(); });
}
