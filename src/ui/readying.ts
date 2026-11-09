// The fight's loading bar. The lobby shows before the fight's and the other heroes' programs are compiled
// (game/warmup.ts warmTheRest): pressed before they are, Start (or a class, save slot, biome or co-op pick) shows how
// far along their warm-up is, in the middle of the dimmed lobby, and goes ahead once it's done (game/warm.ts). It says
// what it readies, the latest press's: the fight, the hero picked, the save slot, the battleground, co-op.
import { isReadying, onReadying, readyingLabel, readyingShare } from '../game/warm';
import { BIOMES, BIOME_IDS, type BiomeSetting } from '../data/biomes';
import { SAVE_SLOTS } from '../loot/saveSlots';

/** What each press readies, as the bar says it (each `whenWarm`'s label): Start the fight (a guest's start too), the
 *  hero selection screen the heroes, a battleground pick its battleground, a save slot pick its slot, a co-op room co-op. */
export const READYING = {
  fight: 'Readying the fight',
  heroes: 'Readying the heroes',
  biome: (setting: BiomeSetting): string => {
    return setting === 'random' ? 'Readying the battlegrounds' : `Readying ${BIOMES[setting].title}`;
  },
  slot: (slot: number): string => `Readying slot ${slot}`,
  coop: 'Readying co-op',
};

/** Every label the bar can show (tools/lab `ui --states readyingHeroes` lays each out on its screen). */
export const readyingLabels = (): string[] => [
  READYING.fight,
  READYING.heroes,
  ...(['random', ...BIOME_IDS] as BiomeSetting[]).map(READYING.biome),
  ...SAVE_SLOTS.map(READYING.slot),
  READYING.coop,
];

const el = (): HTMLElement => document.getElementById('readying')!;

function paint(): void {
  const bar = el();
  const on = isReadying();
  bar.classList.toggle('on', on);
  bar.style.setProperty('--p', String(readyingShare()));
  // (a class pick said "Readying the fight": the text was the page's own, whatever was waiting)
  if (on) bar.querySelector('.rd-sub')!.textContent = readyingLabel();
}

export function initReadying(): void { onReadying(paint); }

/** The bar shown under the loading screen, full, its label set (hidden again as the lobby is entered, `paint`): its
 *  first raster builds Chrome's own programs for its shadows, gradient and text on the GPU's process, and as a first
 *  visit's Start showed it they were built with ANGLE's threads busy compiling the fight's, one of them waiting 121 ms
 *  for a thread, the bar's first frames held 132 ms (`npm run stalls -- --scenario boot --angle`). */
export function layOutReadyingAhead(): void {
  const bar = el();
  bar.classList.add('on');
  bar.style.setProperty('--p', '1');
  bar.querySelector('.rd-sub')!.textContent = READYING.fight;
}

/** The bar as the warm-ups have it: hidden but while something waits for them. */
export const settleReadying = (): void => paint();
