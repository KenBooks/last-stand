// Each class's looks a player picks between (the hall of heroes' Look page, ui/heroLook.ts): a face and its hair,
// the first the hero as he was before there were looks, every player's until he picks another; and the hair colours
// a player may give any look's hair, brows and beard instead of its own. Kept in each class's profile per save slot
// (`Profile.look`), sent to a co-op room with the hero (net/session.ts `Look.hl`).
import type { FaceId } from '../entities/models/face';

/** how a head's hair is cut (models/head.ts `buildHead`) */
export type HairStyle = 'swept' | 'mane' | 'loose' | 'short';

export interface HeroLookDef {
  id: string;
  name: string;
  /** a line saying what sets him apart */
  blurb: string;
  /** his face (models/face.ts `FACES`, `LOOKS`) */
  face: FaceId;
  hair: HairStyle;
  /** short tufts at the back and sides below a hat's band (the mage's hood, the ranger's hat, the warrior's crop) */
  crop?: boolean;
}

/** each class's looks, by its model, the first his own */
export const HERO_LOOKS: Record<'warrior' | 'mage' | 'ranger', readonly HeroLookDef[]> = {
  warrior: [
    { id: 'sellsword', name: 'Sellsword', blurb: 'Long dark hair, a week of stubble', face: 'warrior', hair: 'loose' },
    { id: 'veteran', name: 'Veteran', blurb: 'Cropped hair, a broken nose, an old scar', face: 'warrior-veteran', hair: 'short', crop: true },
    { id: 'northman', name: 'Northman', blurb: 'A long mane and a full red beard', face: 'warrior-northman', hair: 'mane' },
    { id: 'old-soldier', name: 'Old Soldier', blurb: 'Greying, lined, his hair swept back', face: 'warrior-elder', hair: 'swept' },
  ],
  mage: [
    { id: 'scholar', name: 'Scholar', blurb: 'Clean-shaven, his hair kept short', face: 'mage', hair: 'short', crop: true },
    { id: 'wanderer', name: 'Wanderer', blurb: 'A short dark beard, his hair swept back', face: 'mage-wanderer', hair: 'swept', crop: true },
    { id: 'sage', name: 'Sage', blurb: 'Grey, a full beard and long hair', face: 'mage-sage', hair: 'mane', crop: true },
  ],
  ranger: [
    { id: 'woodsman', name: 'Woodsman', blurb: 'A short full beard, his hair swept back', face: 'ranger', hair: 'swept', crop: true },
    { id: 'tracker', name: 'Tracker', blurb: 'Younger, stubble, his hair cropped', face: 'ranger-tracker', hair: 'short', crop: true },
    { id: 'elder', name: 'Woods Elder', blurb: 'Greying, his beard grown long', face: 'ranger-elder', hair: 'swept', crop: true },
  ],
};

/** A hair colour a player may pick: its name, its colour as the face's paint holds hair (sRGB 0..1, as `FaceLook.hair`:
 *  a dark brown is 0.1, and the cards' material lifts it by 2.4, so none is over 0.41) and its swatch as it reads lit. */
export interface HairColour { id: string; name: string; rgb: readonly [number, number, number]; swatch: string }

export const HAIR_COLOURS: readonly HairColour[] = [
  { id: 'black', name: 'Black', rgb: [0.035, 0.03, 0.028], swatch: '#1b1816' },
  { id: 'dark-brown', name: 'Dark brown', rgb: [0.1, 0.066, 0.045], swatch: '#3d2a1d' },
  { id: 'brown', name: 'Brown', rgb: [0.19, 0.115, 0.065], swatch: '#6b4428' },
  { id: 'auburn', name: 'Auburn', rgb: [0.27, 0.1, 0.05], swatch: '#86351c' },
  { id: 'ginger', name: 'Ginger', rgb: [0.4, 0.17, 0.06], swatch: '#b85a24' },
  { id: 'blond', name: 'Blond', rgb: [0.4, 0.31, 0.17], swatch: '#c9a464' },
  { id: 'grey', name: 'Grey', rgb: [0.3, 0.29, 0.28], swatch: '#8e8a86' },
  { id: 'white', name: 'White', rgb: [0.41, 0.41, 0.4], swatch: '#d8d6d0' },
];

/** A hero's look as kept and sent: the look's id (`HeroLookDef.id`) and the hair colour picked (null: the look's own). */
export interface HeroLook { preset: string; hair: string | null }

/** the looks of class model `model` (none for a model without any) */
export const looksOf = (model: string): readonly HeroLookDef[] => HERO_LOOKS[model as keyof typeof HERO_LOOKS] ?? [];

/** Model `model`'s look `id`, or his first where it's none of his (a look renamed or taken out, a malformed message). */
export function lookDef(model: string, id: string | null | undefined): HeroLookDef | null {
  const looks = looksOf(model);
  return looks.find((l) => l.id === id) ?? looks[0] ?? null;
}

/** The hair colour `id` names, or null (the look's own). */
export const hairColour = (id: string | null | undefined): HairColour | null => HAIR_COLOURS.find((c) => c.id === id) ?? null;

/** `v` read as a look of model `model` (a profile's, a message's): a known look and a known colour, else his first and
 *  his own colour. */
export function lookOf(model: string, v: unknown): HeroLook {
  const o = (v && typeof v === 'object' ? v : {}) as { preset?: unknown; hair?: unknown };
  return {
    preset: lookDef(model, typeof o.preset === 'string' ? o.preset : null)?.id ?? '',
    hair: hairColour(typeof o.hair === 'string' ? o.hair : null)?.id ?? null,
  };
}
