// The colours a player's hero can wear: his cloth dyed (the mage's coat, the warrior's tunic and shield, the ranger's
// coat and hat), with the warrior's cuirass and lower torso tinted too; never legs, skin, weapons or other fittings.
// Each is the main cloth's colour (HSL, sRGB); the hero's other
// dyed cloths keep their shade against it (models/dye.ts). A class's own colour is its look as built, untouched.

/** A preset's id. */
export type PresetColourId = 'red' | 'blue' | 'green' | 'gold' | 'purple' | 'white'
  | 'orange' | 'teal' | 'cyan' | 'rose' | 'brown' | 'black';
/** A colour's id: a preset's, or a colour picked on the wheel as its hex (`#rrggbb`, lower case: `customColour`). */
export type HeroColourId = PresetColourId | `#${string}`;

export interface HeroColour {
  id: HeroColourId;
  name: string;
  /** the main cloth's hue, saturation and lightness (0..1) */
  hsl: readonly [number, number, number];
  /** the picker's swatch: the colour as the cloth reads lit */
  swatch: string;
  /** shown in the picker as a swatch of its own (#732, from the owner: "have main ones like red, blue, green, yellow,
   *  maybe a couple more. More niche colours can be selected using the colour wheel"); the others stay a pick's that
   *  was kept, and the wheel's way to them */
  main?: boolean;
}

export const HERO_COLOURS: readonly HeroColour[] = [
  // (judged in pictures at the lobby's camera, where partners see each other: blue held a little greyer than it'd read
  // on a page, as saturated it looked plastic beside the game's muted cloth; purple towards magenta and lit higher, or
  // from behind it read as blue, and at the lobby's size as the red; red lit a little over the mage's own; gold
  // between mustard (under the forest's green light it neared the green) and orange (on the warrior's shield); white
  // lit high, or it read as a dirty grey, and not so high it looks lit from within)
  { id: 'red', name: 'Red', hsl: [0.995, 0.6, 0.29], swatch: '#a8323a' , main: true },
  { id: 'blue', name: 'Blue', hsl: [0.61, 0.44, 0.27], swatch: '#3a5ba6' , main: true },
  { id: 'green', name: 'Green', hsl: [0.3, 0.42, 0.26], swatch: '#4d8a3a' , main: true },
  { id: 'gold', name: 'Gold', hsl: [0.112, 0.62, 0.4], swatch: '#c7942a' , main: true },
  { id: 'purple', name: 'Purple', hsl: [0.8, 0.36, 0.32], swatch: '#7a4aa0' , main: true },
  { id: 'white', name: 'White', hsl: [0.11, 0.12, 0.66], swatch: '#dcd5c6' , main: true },
  { id: 'orange', name: 'Orange', hsl: [0.055, 0.64, 0.35], swatch: '#b96429' },
  { id: 'teal', name: 'Teal', hsl: [0.46, 0.5, 0.26], swatch: '#318b79' },
  { id: 'cyan', name: 'Ice blue', hsl: [0.53, 0.43, 0.47], swatch: '#70b9c8' },
  { id: 'rose', name: 'Rose', hsl: [0.94, 0.43, 0.45], swatch: '#bc6d89' },
  { id: 'brown', name: 'Brown', hsl: [0.065, 0.35, 0.24], swatch: '#79543a' },
  { id: 'black', name: 'Black', hsl: [0.61, 0.1, 0.12], swatch: '#30333b' , main: true },
];

/** The colours the picker shows as swatches of their own. */
export const MAIN_COLOURS: readonly HeroColour[] = HERO_COLOURS.filter((c) => c.main);

/** How far a wheel's colour is let go as cloth: its saturation at most, and its lightness between (judged as the
 *  presets were: saturated past 0.65 the cloth looked plastic beside the game's muted cloth, and the presets' own
 *  lightness runs 0.12 to 0.66) */
export const CUSTOM_RANGE = { saturation: 0.65, light: [0.12, 0.66] as const };

/** A wheel's colour's id, as `#rrggbb` (lower case). */
const CUSTOM_ID = /^#[0-9a-f]{6}$/;

/** `hex` (`#rrggbb`) as hue, saturation and lightness (0..1), or null. */
export function hexToHsl(hex: string): [number, number, number] | null {
  if (!CUSTOM_ID.test(hex)) return null;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const most = Math.max(r, g, b);
  const least = Math.min(r, g, b);
  const l = (most + least) / 2;
  const d = most - least;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = most === r ? ((g - b) / d + 6) % 6 : most === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

/** Hue, saturation and lightness (0..1) as `#rrggbb`. */
export function hslToHex(h: number, s: number, l: number): string {
  const k = (n: number): number => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return `#${[f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`;
}

/** A colour picked on the wheel at hue `h`, saturation `s` and lightness `l` (0..1), held within the cloth's range
 *  (`CUSTOM_RANGE`): its id is its hex, so it's kept, sent and compared as a preset's id is. */
export function customColourId(h: number, s: number, l: number): HeroColourId {
  const [low, high] = CUSTOM_RANGE.light;
  return hslToHex(h, Math.min(s, CUSTOM_RANGE.saturation), Math.min(high, Math.max(low, l))) as HeroColourId;
}

/** The colour a `#rrggbb` id names, held within the cloth's range, or null. */
function customColour(id: string): HeroColour | null {
  const hsl = hexToHsl(id);
  if (!hsl) return null;
  const held = customColourId(...hsl);
  return { id: held, name: 'Custom', hsl: hexToHsl(held)!, swatch: held };
}

export const heroColour = (id: string | null | undefined): HeroColour | null =>
  HERO_COLOURS.find((c) => c.id === id) ?? (typeof id === 'string' ? customColour(id) : null);
