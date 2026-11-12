// The colours a player's hero can wear: his cloth dyed (the mage's coat, the warrior's tunic and shield, the ranger's
// coat and hat), with the warrior's cuirass tinted too; never legs, skin, weapons or other fittings.
// Each is the main cloth's colour (HSL, sRGB); the hero's other
// dyed cloths keep their shade against it (models/dye.ts). A class's own colour is its look as built, untouched.

export type HeroColourId = 'red' | 'blue' | 'green' | 'gold' | 'purple' | 'white'
  | 'orange' | 'teal' | 'cyan' | 'rose' | 'brown' | 'black';

export interface HeroColour {
  id: HeroColourId;
  name: string;
  /** the main cloth's hue, saturation and lightness (0..1) */
  hsl: readonly [number, number, number];
  /** the picker's swatch: the colour as the cloth reads lit */
  swatch: string;
}

export const HERO_COLOURS: readonly HeroColour[] = [
  // (judged in pictures at the lobby's camera, where partners see each other: blue held a little greyer than it'd read
  // on a page, as saturated it looked plastic beside the game's muted cloth; purple towards magenta and lit higher, or
  // from behind it read as blue, and at the lobby's size as the red; red lit a little over the mage's own; gold
  // between mustard (under the forest's green light it neared the green) and orange (on the warrior's shield); white
  // lit high, or it read as a dirty grey, and not so high it looks lit from within)
  { id: 'red', name: 'Red', hsl: [0.995, 0.6, 0.29], swatch: '#a8323a' },
  { id: 'blue', name: 'Blue', hsl: [0.61, 0.44, 0.27], swatch: '#3a5ba6' },
  { id: 'green', name: 'Green', hsl: [0.3, 0.42, 0.26], swatch: '#4d8a3a' },
  { id: 'gold', name: 'Gold', hsl: [0.112, 0.62, 0.4], swatch: '#c7942a' },
  { id: 'purple', name: 'Purple', hsl: [0.8, 0.36, 0.32], swatch: '#7a4aa0' },
  { id: 'white', name: 'White', hsl: [0.11, 0.12, 0.66], swatch: '#dcd5c6' },
  { id: 'orange', name: 'Orange', hsl: [0.055, 0.64, 0.35], swatch: '#b96429' },
  { id: 'teal', name: 'Teal', hsl: [0.46, 0.5, 0.26], swatch: '#318b79' },
  { id: 'cyan', name: 'Ice blue', hsl: [0.53, 0.43, 0.47], swatch: '#70b9c8' },
  { id: 'rose', name: 'Rose', hsl: [0.94, 0.43, 0.45], swatch: '#bc6d89' },
  { id: 'brown', name: 'Brown', hsl: [0.065, 0.35, 0.24], swatch: '#79543a' },
  { id: 'black', name: 'Black', hsl: [0.61, 0.1, 0.12], swatch: '#30333b' },
];

export const heroColour = (id: string | null | undefined): HeroColour | null =>
  HERO_COLOURS.find((c) => c.id === id) ?? null;
