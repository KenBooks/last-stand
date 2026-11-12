// tools/lab `hall --glow`: the light of the weapon's head of the hero in focus in the hall of heroes (src/game/hall.ts)
// frame by frame through his showcase and after it, read back from the frame drawn as the player sees it. A box round
// the weapon's tip (`Model.tip`: the mage's staff's crystal) as wide as `BOX` m there: how much of it is near white,
// its brightest and its mean light, the brightest frame's against the median's, and the flashes of its mean in any
// second (page/flashes.ts). From the owner, of the mage's staff in the hall: "the staff's light is too bright when its
// flickering, pls lower". Its canary lights the crystal's colour as main lit it. `--lobby`: the hero as he stands in
// the lobby instead, the run's camera on him ("staff still flickers at its brightest peak", the tip of it), its
// canary the gem's glow three times over for a second.
import * as THREE from 'three';
import { G } from '../../../src/state';
import * as hall from '../../../src/game/hall';
import type { Lab, Pictured, Report, Tile } from './lab';
import type { Model } from '../../../src/types';
import { drawFrame, pixelLight, topLight, canvasSize, type Canvas, type CanvasBox } from './light';
import { openHall, toLobby } from './hallMoves';
import { worstFlashing } from './flashes';

/** What `lab hall --glow` takes. */
export interface HallGlowOptions {
  pictures: boolean;
  canary?: boolean;
  /** the hero as he stands in the lobby, not in the hall */
  lobby?: boolean;
}

/** frames run once the hall is up: the camera's flight in, his showcase (due 0.8 s after) and some 6 s after it */
const FRAMES = 540;
/** the frame pictured as he stands after his showcase, as the screen shows him most of the time */
const STANDING_FRAME = 420;
/** frames before this are the camera's flight in, not judged */
const JUDGED_FROM = 60;
/** the box measured round the tip, and the one pictured round it (m across, at the tip's distance) */
const BOX = 0.5;
const PICTURED_BOX = 1.6;
/** a pixel this bright (a share of white) is near white (light.ts's) */
const NEAR_WHITE = 0.75;
/** the most of the box that may be near white on any frame */
const NEAR_WHITE_MOST = 0.06;
/** the most any frame's mean light in the box may be (a share of white: main's glint 0.34; a steady magenta glow
 *  round the crystal holds about 0.17, nothing of it near white), and the brightest against the median (a facet's
 *  glint flaring over the glow) */
const MEAN_MOST = 0.25;
const PEAK_MOST = 3;
/** the most flashes in any second (AGENTS.md: about 1.5 a second; three a hazard) */
const FLASHES_MOST = 2;

/** a pixel whose brightest channel is this bright (a share of white) glows: the crypt's lit stone round it is under
 *  0.05. By its brightest channel, not its luminance: a saturated pink's luminance is a third of its red, and the
 *  crystal's flare as a facet turned to the key light (its glowing area half as big again) moved the box's
 *  luminance by a few hundredths */
const GLOWING = 0.1;
/** the most any frame's glowing area may be against the median frame's: a facet's flare */
const FLARE_MOST = 1.25;
/** the least the median frame's glowing area may be (a share of the box): under it the crystal is a flat stone, its
 *  glow not reaching past its own faces ("most of the time its completely boring") */
const GLOWING_LEAST = 0.3;

/** One frame's light in the box. */
export interface FrameGlow {
  frame: number;
  nearWhite: number;
  mean: number;
  max: number;
  /** the share of it that glows (`GLOWING`): the crystal and the halo round it */
  glowing: number;
}

/** The light of a box of the canvas: its near white share, its mean and its brightest, and how much of it glows. */
export function glowOf(canvas: Canvas, frame: number): FrameGlow {
  const pixels = canvas.width * canvas.height;
  let nearWhite = 0;
  let glowing = 0;
  let sum = 0;
  let max = 0;
  for (let pixel = 0; pixel < pixels; pixel++) {
    const light = pixelLight(canvas, pixel * 4);
    sum += light;
    max = Math.max(max, light);
    if (light >= NEAR_WHITE) nearWhite++;
    if (topLight(canvas, pixel * 4) >= GLOWING) glowing++;
  }
  return { frame, nearWhite: nearWhite / pixels, mean: sum / pixels, max, glowing: glowing / pixels };
}

/** The canvas's box `across` m wide round `point` as the game's camera sees it (drawing buffer pixels, from its
 *  bottom left), kept inside the canvas. */
export function boxRound(point: THREE.Vector3, across: number): CanvasBox {
  const camera = G.camera as THREE.PerspectiveCamera;
  const { width, height } = canvasSize();
  const distance = point.distanceTo(camera.position);
  const perMetre = height / (2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  const side = Math.min(width, height, Math.max(8, Math.round(across * perMetre)));
  const ndc = point.clone().project(camera);
  const middleX = (ndc.x + 1) / 2 * width;
  const middleY = (ndc.y + 1) / 2 * height;
  const left = THREE.MathUtils.clamp(Math.round(middleX - side / 2), 0, width - side);
  const bottom = THREE.MathUtils.clamp(Math.round(middleY - side / 2), 0, height - side);
  return { left, bottom, width: side, height: side };
}

/** `canvas` (rows from the bottom, encoded channels) as a picture. */
export function tileOf(view: string, canvas: Canvas): Tile {
  const { width, height, pixels } = canvas;
  const image = new ImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const from = ((height - 1 - y) * width + x) * 4;
      const to = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        image.data[to + channel] = Math.round(Math.min(1, pixels[from + channel]) * 255);
      }
      image.data[to + 3] = 255;
    }
  }
  const picture = document.createElement('canvas');
  picture.width = width;
  picture.height = height;
  picture.getContext('2d')!.putImageData(image, 0, 0);
  return { view, png: picture.toDataURL('image/png'), width, height };
}

/** The gems under `tip` that glow (a physical material with a glow of its own, not a glow alone as the crystal's
 *  rings are): the staff's crystal. */
export function glowingGemsUnder(tip: THREE.Object3D): THREE.MeshPhysicalMaterial[] {
  const found = new Set<THREE.MeshPhysicalMaterial>();
  tip.traverse((object) => {
    const material = (object as THREE.Mesh).material as THREE.MeshPhysicalMaterial | undefined;
    const glows = !!material?.emissive && material.emissive.getHex() !== 0 && material.emissiveIntensity > 0;
    if (glows && material!.isMeshPhysicalMaterial) found.add(material!);
  });
  return [...found];
}

/** the lobby's canary: the gem's glow this many times over, these frames (a second) */
const CANARY_GLOW = 3;
const CANARY_FRAMES = [240, 300];

/** How main's crystal took the light: polished, its coat full and as polished, its highlight full. */
const MAINS_POLISH = { roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0, specularIntensity: 1 };

/** Each of `gems` lit as main lit the crystal: its colour its glow's hue, its brightest channel full (main's crystal
 *  was 0xff4fd8 both ways), and polished as main's; returns a way to put them back. */
export function lightAsMain(gems: THREE.MeshPhysicalMaterial[]): () => void {
  const kept = gems.map((gem) => ({
    colour: gem.color.clone(),
    roughness: gem.roughness,
    clearcoat: gem.clearcoat,
    clearcoatRoughness: gem.clearcoatRoughness,
    specularIntensity: gem.specularIntensity,
  }));
  for (const gem of gems) {
    const { r, g, b } = gem.emissive;
    gem.color.copy(gem.emissive).multiplyScalar(1 / Math.max(r, g, b));
    Object.assign(gem, MAINS_POLISH);
  }
  return () => gems.forEach((gem, at) => {
    const { colour, ...polish } = kept[at];
    gem.color.copy(colour);
    Object.assign(gem, polish);
  });
}

/** The frame of `glows` with the most of `key`. */
function mostOf(glows: FrameGlow[], key: 'nearWhite' | 'mean' | 'glowing'): FrameGlow {
  return glows.reduce((most, glow) => (glow[key] > most[key] ? glow : most));
}

const percent = (share: number): string => `${(share * 100).toFixed(1)}%`;

/** the frames between the means the report traces */
const TRACE_EVERY = 15;

/** The box's `key` every `TRACE_EVERY` frames, as hundredths. */
function traceOf(glows: FrameGlow[], key: 'mean' | 'glowing'): string {
  const values: string[] = [];
  for (let at = 0; at < glows.length; at += TRACE_EVERY) values.push(String(Math.round(glows[at][key] * 100)));
  return values.join(' ');
}

/** The moments pictured: the box at its brightest mean, its largest glowing area and its dimmest. */
interface Pictures {
  peak?: Tile;
  flare?: Tile;
  standing?: Tile;
  least?: Tile;
}

/** The hero whose tip is read: the hall's in focus, or the lobby's own. */
interface Read {
  id: string;
  model: Model;
  tip: THREE.Object3D;
  /** whether his showcase has begun (the lobby's: from the start) */
  shown: () => boolean;
}

/** The lobby's hero as he stands. */
function lobbyHero(lab: Lab): Read {
  const tip = lab.model.tip;
  if (!tip) throw new Error('lab: hall --glow --lobby: the hero has no weapon\'s tip');
  return { id: lab.player.cls.id, model: lab.model, tip, shown: () => true };
}

/** The hall's hero in focus, the hall opened (null: no hall in this tree). */
async function hallHero(lab: Lab): Promise<Read | null> {
  await toLobby(lab);
  if (!(await openHall(lab))) return null;
  const hero = hall.hallHeroes()[hall.hallFocus()];
  const tip = hero?.player.model.tip;
  if (!hero || !tip) throw new Error('lab: hall --glow: no hero in focus with a weapon\'s tip');
  return { id: hero.id, model: hero.player.model, tip, shown: () => !!hero.cast };
}

/** Each of `gems` glowing `times` over its own (the lobby's canary), set after the hero's animation set it. */
function brighten(gems: THREE.MeshPhysicalMaterial[], times: number): void {
  for (const gem of gems) gem.emissiveIntensity *= times;
}

/** Runs `lab hall --glow`. */
export async function hallGlow(lab: Lab, options: HallGlowOptions): Promise<Report> {
  await lab.setup({ at: [14, 17], facing: 0 });
  const hero = options.lobby ? lobbyHero(lab) : await hallHero(lab);
  if (!hero) return { text: 'no hero selection screen in this tree', problems: [] };
  const { model, tip } = hero;
  const gems = options.canary ? glowingGemsUnder(tip) : [];
  if (options.canary && !gems.length) throw new Error('lab: hall --glow: no glowing gem at the weapon\'s tip to light');
  const putBack = options.lobby ? () => {} : lightAsMain(gems);
  let frame = 0;
  const glows: FrameGlow[] = [];
  const pictures: Pictures = {};
  let peakSoFar = -1;
  let leastSoFar = Infinity;
  let flareSoFar = -1;
  let shownAt = -1;
  const point = new THREE.Vector3();
  const pictured = (view: string, at: THREE.Vector3): Tile => tileOf(view, drawFrame(lab, boxRound(at, PICTURED_BOX)));
  try {
    await lab.step(FRAMES, undefined, () => {
      if (shownAt < 0 && hero.shown()) shownAt = frame;
      const planted = options.lobby && options.canary && frame >= CANARY_FRAMES[0] && frame < CANARY_FRAMES[1];
      if (planted) brighten(gems, CANARY_GLOW);
      model.root.updateMatrixWorld(true);
      tip.getWorldPosition(point);
      const glow = glowOf(drawFrame(lab, boxRound(point, BOX)), frame);
      if (frame >= JUDGED_FROM) {
        glows.push(glow);
        if (options.pictures && glow.mean > peakSoFar) pictures.peak = pictured('peak', point);
        if (options.pictures && glow.mean < leastSoFar) pictures.least = pictured('least', point);
        if (options.pictures && glow.glowing > flareSoFar) pictures.flare = pictured('flare', point);
        if (options.pictures && frame === STANDING_FRAME) pictures.standing = pictured('standing', point);
        peakSoFar = Math.max(peakSoFar, glow.mean);
        flareSoFar = Math.max(flareSoFar, glow.glowing);
        leastSoFar = Math.min(leastSoFar, glow.mean);
      }
      frame++;
    });
  } finally {
    putBack();
  }
  if (shownAt < 0) throw new Error('lab: hall --glow: the hero never showed off his skill');
  return reportOf(hero.id, glows, shownAt, pictures, !!options.canary, !!options.lobby);
}

/** The middle of `values`. */
export function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** The report: the box's light over the run, its brightest against its median, its flashes, and the canary. */
function reportOf(
  id: string, glows: FrameGlow[], shownAt: number, pictures: Pictures, canary: boolean, lobby: boolean,
): Report {
  const runMean = glows.reduce((sum, glow) => sum + glow.mean, 0) / glows.length;
  const median = medianOf(glows.map((glow) => glow.mean));
  const whitest = mostOf(glows, 'nearWhite');
  const brightest = mostOf(glows, 'mean');
  const peak = brightest.mean / median;
  const flashing = worstFlashing(glows.map((glow) => [glow.mean]), 1 / 60);
  const from = lobby ? 'the start' : 'his showcase';
  const second = (frame: number): string => `${((frame - shownAt) / 60).toFixed(2)} s from ${from}`;
  const medianGlowing = medianOf(glows.map((glow) => glow.glowing));
  const mostGlowing = mostOf(glows, 'glowing');
  const flare = mostGlowing.glowing / medianGlowing;
  const flaring = glows.filter((glow) => glow.glowing > FLARE_MOST * medianGlowing).length;
  const text = [
    `the ${id} ${lobby ? 'standing in the lobby' : 'in focus'}, the box ${BOX} m across round his weapon's tip, `
      + `frames ${JUDGED_FROM} to ${FRAMES}`,
    `  its mean light ${runMean.toFixed(3)} of white over the run, its median frame's ${median.toFixed(3)}`,
    `  near white: ${percent(whitest.nearWhite)} of it at most (frame ${whitest.frame}, ${second(whitest.frame)})`,
    `  brightest: ${brightest.mean.toFixed(3)} mean, ${peak.toFixed(2)}x the median's (frame ${brightest.frame}, `
      + `${second(brightest.frame)}), its brightest pixel ${brightest.max.toFixed(2)}`,
    `  flashes: ${flashing.most} in its worst second`,
    `  its mean every ${TRACE_EVERY / 60} s from frame ${JUDGED_FROM}: ${traceOf(glows, 'mean')}`,
    `  glowing (its brightest channel ${GLOWING} of white or more): ${percent(medianGlowing)} of it the median `
      + `frame, ${percent(mostGlowing.glowing)} at most (frame ${mostGlowing.frame}, ${flare.toFixed(2)}x), over `
      + `${FLARE_MOST}x the median on ${flaring} frames; every ${TRACE_EVERY / 60} s, in hundredths: `
      + `${traceOf(glows, 'glowing')}`,
  ];
  const caught: string[] = [];
  if (whitest.nearWhite > NEAR_WHITE_MOST) caught.push(`${percent(whitest.nearWhite)} of it near white`);
  if (brightest.mean > MEAN_MOST) caught.push(`its brightest frame ${brightest.mean.toFixed(3)} of white`);
  if (peak > PEAK_MOST) caught.push(`its brightest ${peak.toFixed(2)}x its median`);
  // (in the lobby, seen from above, the crystal's rings turning face-on swell its glow 1.4 times, slowly: not judged)
  if (flare > FLARE_MOST && !lobby) caught.push(`its glow flaring ${flare.toFixed(2)}x its median`);
  if (medianGlowing < GLOWING_LEAST) caught.push(`its glow ${percent(medianGlowing)} of it the median frame`);
  if (flashing.most > FLASHES_MOST) caught.push(`${flashing.most} flashes in a second`);
  const problems: string[] = [];
  if (canary) {
    const found = caught.length > 0;
    const planted = lobby ? `its glow ${CANARY_GLOW} times over for a second` : 'lit as main lit it';
    text.push(`canary, the tip's gem ${planted}: ${found ? 'caught' : 'MISSED'}`);
    if (!found) problems.push('hall --glow: the canary (the tip\'s lit glow brightened as main had it) was missed');
  } else {
    const bars = `${percent(NEAR_WHITE_MOST)} near white, ${MEAN_MOST} of white `
      + `any, ${PEAK_MOST}x its median, ${FLASHES_MOST} flashes a second, its glow ${FLARE_MOST}x its median and `
      + `${percent(GLOWING_LEAST)} of it at least`;
    if (caught.length) problems.push(`hall --glow: the weapon's head: ${caught.join(', ')} (at most ${bars})`);
  }
  const moments: Pictured[] = [];
  if (pictures.peak) moments.push({ label: 'tip at its brightest', tiles: [pictures.peak], notes: [text[3]] });
  if (pictures.standing) moments.push({ label: 'tip as he stands', tiles: [pictures.standing], notes: [] });
  if (pictures.flare) moments.push({ label: 'tip at its largest glow', tiles: [pictures.flare], notes: [] });
  if (pictures.least) moments.push({ label: 'tip at its dimmest', tiles: [pictures.least], notes: [] });
  return { text: text.join('\n'), problems, moments };
}
