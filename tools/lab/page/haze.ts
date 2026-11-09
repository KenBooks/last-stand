// tools/lab haze: what the hero's held weapons take from the frame round them through the eyes (lab haze). The frame
// is drawn as the player sees it, and again with the weapons hidden, each also with the grade's adaptation held off
// (core/renderer.ts `holdAdaptation`). Held off, the weapons change only their own pixels (themselves, their bloom,
// their shadows), which are left out. Anywhere else, a pixel the adaptation darkens more with the weapons shown than
// without them is darkened by their light: the eye's adaptation to a bright area spread out round them as a veil, its
// edges on the grid of areas it's measured over. (The owner, of the sword through the eyes: "weapons have a haze
// that darkens the area around them, I think it's a bug", "its pretty big", "when sword moves from left position
// (idle) back to right, haze moves too, but when its all the way left the haze is not there at all".)
//
// Their own pixels are parted into their surface (the `parts` look's) and their bloom. Held off, the share of their
// surface near white is glare, and the share of the frame past it their light brightens is its halo: the sun's
// highlight on a blade's flat held up by the eyes, blown out and bloomed round, its rougher grime left as dark blots
// across it (the owner, of each of a dual wielder's blades in the Thornwood: "this graphical issue seems lame",
// "right one too"). Seen through the adaptation, that blade was 0.6 of white and paled the hand under it.
//
// Any part of the hero can be measured so (`part`), in any view: the mage's glowing hand, its outline lit and a light
// of its own at the palm, blew out white over the back of it in third person (the owner: "his hands glows too
// bright", "we should never have blinding lights in our game").
import type * as THREE from 'three';
import type { Lab, Pictured, Report, Tile } from './lab';
import { G } from '../../../src/state';
import * as rendererCode from '../../../src/core/renderer';
import type { BiomeId } from '../../../src/data/biomes';
import type { WeaponStyle } from '../../../src/loot/loadout';
import type { RarityId } from '../../../src/types';
import { canvasSize, drawFrame, lookAlong, type Canvas } from './light';
import { drawLook, meshesOf, partAt } from './looks';
import { isWeapon } from './strike';

export interface HazeOptions {
  biome: BiomeId;
  /** what's measured: the held weapons (by default) or the hands */
  part?: PartName;
  /** the view it's seen from: through the eyes (by default) or over the shoulder */
  view?: 'first' | 'third';
  /** the ways the hero looks (degrees, 0 is +z) */
  facings: number[];
  gear?: WeaponStyle;
  weapon?: string;
  at?: [number, number];
  /** every item he wears of this rarity (Rare and up glow: #404) */
  rarity?: RarityId;
  pictures: boolean;
  canary: boolean;
}

/** The parts the measure can take, each a test of whether an object is one (or the top of one). */
const PARTS = {
  weapons: isWeapon,
  hands: (object: THREE.Object3D) => object.userData.drawnHand === true,
};
type PartName = keyof typeof PARTS;
type IsPart = (object: THREE.Object3D) => boolean;

/** The game's renderer as far as it goes: `--ab` runs this on main's game, which can't hold its adaptation off. */
const holdAdaptation = (rendererCode as Partial<typeof rendererCode>).holdAdaptation;

/** a pixel the weapons change by this much (a share of white) with the adaptation held off is theirs */
const OWN = 0.01;
/** a pixel the adaptation darkens by this much more with the weapons shown than without them is hazed */
const HAZED = 0.02;
/** the most of the frame (outside the weapons' own pixels) their light may haze */
const HAZE_MOST = 0.005;
/** the frames stood before the frame is drawn, once the view is set */
const SETTLE_FRAMES = 30;
/** a picture's width (px) */
const PICTURE_WIDTH = 640;
/** the canary draws the frame the player sees at this much of its exposure, a veil over all of it */
const CANARY_EXPOSURE = 0.8;
/** a pixel this bright (a share of white) is near white (light.ts's) */
const NEAR_WHITE = 0.75;
/** the most of the weapons' surface that may be near white with the adaptation held off */
const GLARE_MOST = 0.05;
/** a pixel past the weapons' surface their light brightens by this much (a share of white) is in their halo */
const HALO = 0.03;
/** the most of the frame their halo may cover */
const HALO_MOST = 0.005;
/** the most of the frame a part's halo may cover: `HALO_MOST`, or as much as the part's own surface when that's
 *  less (a hand over the shoulder covers a fifth of what a blade does through the eyes; lit white, its bloom covered
 *  0.3% of the frame) */
const haloMost = (found: Haze) => Math.min(HALO_MOST, found.surface);
/** the glare canary lights the weapons' materials white at this strength */
const CANARY_GLOW = 2;

/** What the weapons' light took from one frame. */
interface Haze {
  /** the share of the frame that's the weapons' own, their mean light there with the adaptation held off, and the
   *  share of it the adaptation took */
  own: number;
  ownLight: number;
  ownTaken: number;
  /** the share of the frame that's their surface, and the share of it near white with the adaptation held off */
  surface: number;
  glared: number;
  /** the share of the frame past their surface their light brightens: their halo */
  halo: number;
  /** the share of the frame they hazed, the mean light lost there and the most (shares of white) */
  hazed: number;
  loss: number;
  most: number;
}

/** A fault planted for a canary (what it changes on the page); returns the undoing. */
type Plant = (lab: Lab) => () => void;

/** the pixels' marks in a frame's losses: the weapons' own, their surface glared, their halo */
const OWN_MARK = -1;
const GLARE_MARK = -2;
const HALO_MARK = -3;

/** A frame drawn as the player sees it, and with the adaptation held off. */
interface Drawn {
  seen: Canvas;
  held: Canvas;
}

/** A pixel's light as an SDR screen shows it, a share of white (gamma 2.2, Rec. 709's weights). */
function lightAt(canvas: Canvas, at: number): number {
  const { pixels } = canvas;
  const red = Math.max(0, pixels[at]) ** 2.2;
  const green = Math.max(0, pixels[at + 1]) ** 2.2;
  const blue = Math.max(0, pixels[at + 2]) ** 2.2;
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** The frame drawn as the player sees it, then with the adaptation held off. */
function drawBoth(lab: Lab, exposure = 1): Drawn {
  const was = G.renderer.toneMappingExposure;
  G.renderer.toneMappingExposure = was * exposure;
  let seen: Canvas;
  try {
    seen = drawFrame(lab);
  } finally {
    G.renderer.toneMappingExposure = was;
  }
  holdAdaptation!(true);
  try {
    return { seen, held: drawFrame(lab) };
  } finally {
    holdAdaptation!(false);
  }
}

/** The hero's part hidden; returns the undoing. */
function hidePart(lab: Lab, isPart: IsPart): () => void {
  const hidden: { visible: boolean }[] = [];
  lab.model.root.traverse((object) => {
    if (object.visible && isPart(object)) hidden.push(object);
  });
  for (const object of hidden) object.visible = false;
  return () => {
    for (const object of hidden) object.visible = true;
  };
}

/** The hero's part's materials lit white (the glare canary); returns the undoing. */
function glowPart(lab: Lab, isPart: IsPart): () => void {
  const was = new Map<THREE.MeshStandardMaterial, { emissive: number; intensity: number }>();
  lab.model.root.traverse((object) => {
    if (!isPart(object)) return;
    object.traverse((part) => {
      const material = (part as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (!material?.emissive || was.has(material)) return;
      was.set(material, { emissive: material.emissive.getHex(), intensity: material.emissiveIntensity });
    });
  });
  for (const material of was.keys()) {
    material.emissive.setHex(0xffffff);
    material.emissiveIntensity = CANARY_GLOW;
  }
  return () => {
    for (const [material, { emissive, intensity }] of was) {
      material.emissive.setHex(emissive);
      material.emissiveIntensity = intensity;
    }
  };
}

/** Whether `object` is the measured part or within it. */
function within(object: THREE.Object3D, isPart: IsPart): boolean {
  for (let at: THREE.Object3D | null = object; at; at = at.parent) {
    if (isPart(at)) return true;
  }
  return false;
}

/** Which of the canvas's pixels (rows from the bottom, as a `Canvas` reads them) are the hero's part's surface as
 *  drawn now: its meshes' in the `parts` look. */
function surfaceOf(lab: Lab, isPart: IsPart): Uint8Array {
  const { width, height } = canvasSize();
  const meshes = meshesOf(lab.model.root);
  const area = { left: 0, top: 0, width: innerWidth, height: innerHeight };
  // (the lab draws nothing unless it's asked to)
  const drawing = lab.drawing;
  lab.drawing = true;
  let image: ImageData;
  try {
    image = drawLook('parts', lab.model.root, area, () => '').image;
  } finally {
    lab.drawing = drawing;
  }
  if (image.width !== width || image.height !== height) {
    throw new Error(`the parts look's ${image.width}x${image.height} isn't the canvas's ${width}x${height}`);
  }
  const parts = partAt(image, meshes);
  const weapon = meshes.map((mesh) => within(mesh, isPart));
  const surface = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const part = parts[y * width + x];
      if (part >= 0 && weapon[part]) surface[(height - 1 - y) * width + x] = 1;
    }
  }
  return surface;
}

/** What the weapons' light took from the frames `shown` (as they are) and `hidden` (without them), their surface's
 *  pixels `surface`, and each pixel's loss (or its mark: the weapons' own, their surface glared, their halo). */
function hazeOf(shown: Drawn, hidden: Drawn, surface: Uint8Array): { haze: Haze; losses: Float32Array } {
  const count = shown.seen.width * shown.seen.height;
  const losses = new Float32Array(count);
  let own = 0;
  let ownLight = 0;
  let ownTaken = 0;
  let surfaced = 0;
  let glared = 0;
  let haloed = 0;
  let hazed = 0;
  let lost = 0;
  let most = 0;
  for (let pixel = 0; pixel < count; pixel++) {
    const at = pixel * 4;
    const shownHeld = lightAt(shown.held, at);
    const hiddenHeld = lightAt(hidden.held, at);
    if (surface[pixel]) {
      surfaced++;
      if (shownHeld >= NEAR_WHITE) glared++;
    }
    if (Math.abs(shownHeld - hiddenHeld) > OWN) {
      own++;
      ownLight += shownHeld;
      ownTaken += shownHeld - lightAt(shown.seen, at);
      const halo = !surface[pixel] && shownHeld - hiddenHeld >= HALO;
      if (halo) haloed++;
      const glare = surface[pixel] && shownHeld >= NEAR_WHITE;
      losses[pixel] = glare ? GLARE_MARK : halo ? HALO_MARK : OWN_MARK;
      continue;
    }
    // (what the adaptation took with the weapons shown, past what it took without them)
    const loss = (shownHeld - lightAt(shown.seen, at)) - (hiddenHeld - lightAt(hidden.seen, at));
    losses[pixel] = Math.max(0, loss);
    if (loss < HAZED) continue;
    hazed++;
    lost += loss;
    most = Math.max(most, loss);
  }
  const haze = {
    own: own / count,
    ownLight: own ? ownLight / own : 0,
    ownTaken: ownLight > 0 ? ownTaken / ownLight : 0,
    surface: surfaced / count,
    glared: surfaced ? glared / surfaced : 0,
    halo: haloed / count,
    hazed: hazed / count,
    loss: hazed ? lost / hazed : 0,
    most,
  };
  return { haze, losses };
}

/** The hero standing in the biome, through the eyes, looking along `facing` (degrees), the frame settled. */
async function standIn(lab: Lab, options: HazeOptions, facing: number): Promise<void> {
  if (G.arena.biome !== options.biome) G.arena.setBiome(options.biome);
  const rad = facing * Math.PI / 180;
  const { gear, weapon, at, rarity } = options;
  await lab.setup({ view: options.view ?? 'first', facing: rad, gear, weapon, at, rarity });
  await lookAlong(lab, rad);
  await lab.step(SETTLE_FRAMES);
}

/** `canvas` (rows from the bottom) as a picture `PICTURE_WIDTH` wide, each pixel coloured by `colour`. */
function tileOf(view: string, canvas: Canvas, colour: (pixel: number) => [number, number, number]): Tile {
  const { width, height } = canvas;
  const image = new ImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [red, green, blue] = colour((height - 1 - y) * width + x);
      const at = (y * width + x) * 4;
      image.data[at] = red;
      image.data[at + 1] = green;
      image.data[at + 2] = blue;
      image.data[at + 3] = 255;
    }
  }
  const full = document.createElement('canvas');
  full.width = width;
  full.height = height;
  full.getContext('2d')!.putImageData(image, 0, 0);
  const small = document.createElement('canvas');
  small.width = PICTURE_WIDTH;
  small.height = Math.round(height * PICTURE_WIDTH / width);
  small.getContext('2d')!.drawImage(full, 0, 0, small.width, small.height);
  return { view, png: small.toDataURL('image/png'), width: small.width, height: small.height };
}

/** The frame as the player sees it, and its haze: the frame greyed, the weapons' own pixels blue (their surface
 *  yellow where it glares, their halo pink), each pixel their light darkened red by how much (fully red at a fifth
 *  of white). */
function pictureOf(label: string, shown: Drawn, losses: Float32Array, notes: string[]): Pictured {
  const { seen } = shown;
  const byte = (canvas: Canvas, pixel: number, channel: number) => Math.round(canvas.pixels[pixel * 4 + channel] * 255);
  const frame = tileOf('seen', seen, (pixel) => [byte(seen, pixel, 0), byte(seen, pixel, 1), byte(seen, pixel, 2)]);
  const map = tileOf('haze', seen, (pixel) => {
    const grey = Math.round(byte(seen, pixel, 1) * 0.5);
    if (losses[pixel] === GLARE_MARK) return [255, 220, 40];
    if (losses[pixel] === HALO_MARK) return [240, 120, 220];
    if (losses[pixel] === OWN_MARK) return [grey * 0.5, grey * 0.5, 160];
    const red = Math.min(1, losses[pixel] / 0.2);
    return [Math.round(grey + (255 - grey) * red), Math.round(grey * (1 - red)), Math.round(grey * (1 - red))];
  });
  return { label, tiles: [frame, map], notes };
}

const percent = (share: number) => `${(share * 100).toFixed(1)}%`;

/** A frame's haze as words, `noun` what's measured. */
function hazeLine(haze: Haze, noun: string): string {
  return `the ${noun} ${percent(haze.own)} of the frame, their light ${haze.ownLight.toFixed(2)} of white (the `
    + `adaptation took ${percent(haze.ownTaken)} of it); their surface ${percent(haze.surface)} of the frame, `
    + `${percent(haze.glared)} of it near white, their halo ${percent(haze.halo)} of the frame; round them `
    + `${percent(haze.hazed)} of the frame darkened by their light, by ${haze.loss.toFixed(3)} of white on average, `
    + `${haze.most.toFixed(3)} at most`;
}

/** Nothing planted. */
const asItIs: Plant = () => () => {};

/** The frame as it stands, with the weapons and without, measured; `exposure` the shown frame's and `plant` a fault
 *  planted in it (the canaries'). */
function measureNow(lab: Lab, isPart: IsPart, exposure = 1, plant = asItIs):
  { haze: Haze; losses: Float32Array; shown: Drawn } {
  const surface = surfaceOf(lab, isPart);
  const unplant = plant(lab);
  let shown: Drawn;
  try {
    shown = drawBoth(lab, exposure);
  } finally {
    unplant();
  }
  const show = hidePart(lab, isPart);
  let hidden: Drawn;
  try {
    hidden = drawBoth(lab);
  } finally {
    show();
  }
  return { ...hazeOf(shown, hidden, surface), shown };
}

/** `lab haze`: in each facing, what the hero's part's light (his weapons' by default) takes from the frame round it. */
export async function haze(lab: Lab, options: HazeOptions): Promise<Report> {
  if (!holdAdaptation) return { text: 'this game can\'t hold its adaptation off: no haze measured', problems: [] };
  const noun = options.part ?? 'weapons';
  const isPart = PARTS[noun];
  const lines: string[] = [];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  for (const facing of options.facings) {
    await standIn(lab, options, facing);
    const name = `${options.biome}, looking ${facing}°`;
    const { haze: found, losses, shown } = measureNow(lab, isPart);
    lines.push(`${name}: ${hazeLine(found, noun)}`);
    if (found.own === 0) problems.push(`${name}: no ${noun} in the frame`);
    if (found.hazed > HAZE_MOST) {
      problems.push(`${name}: the ${noun}' light hazes ${percent(found.hazed)} of the frame round them (at most `
        + `${percent(HAZE_MOST)})`);
    }
    if (found.glared > GLARE_MOST) {
      problems.push(`${name}: the ${noun} glare: ${percent(found.glared)} of their surface near white (at most `
        + `${percent(GLARE_MOST)})`);
    }
    if (found.halo > haloMost(found)) {
      problems.push(`${name}: the ${noun}' light blooms over ${percent(found.halo)} of the frame past them (at most `
        + `${percent(haloMost(found))})`);
    }
    if (options.pictures) moments.push(pictureOf(name, shown, losses, [hazeLine(found, noun)]));
    if (options.canary && facing === options.facings[0]) canaries(lab, isPart, noun, lines, problems);
  }
  return { text: lines.join('\n'), problems, moments };
}

/** The faults the measures must catch, planted in the frame as it stands: a veil over all of it, which hazes it,
 *  and the part lit white, which glares. */
function canaries(lab: Lab, isPart: IsPart, noun: string, lines: string[], problems: string[]): void {
  const veiled = measureNow(lab, isPart, CANARY_EXPOSURE).haze;
  const veilCaught = veiled.hazed > HAZE_MOST;
  lines.push(`canary, the frame with the ${noun} drawn at ${CANARY_EXPOSURE} of its exposure: `
    + `${veilCaught ? 'caught' : 'missed'}: ${percent(veiled.hazed)} of it darkened`);
  if (!veilCaught) problems.push('the haze\'s canary was missed');
  const glowing = measureNow(lab, isPart, 1, (planted) => glowPart(planted, isPart)).haze;
  const glareCaught = glowing.glared > GLARE_MOST && glowing.halo > haloMost(glowing);
  lines.push(`canary, the ${noun} lit white: ${glareCaught ? 'caught' : 'missed'}: ${percent(glowing.glared)} of `
    + `their surface near white, their halo ${percent(glowing.halo)} of the frame`);
  if (!glareCaught) problems.push('the glare\'s canary was missed');
}
