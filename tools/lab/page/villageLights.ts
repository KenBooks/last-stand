// `lab village`'s lights: every kind of light the village has, at midnight as the player meets it, a few metres off
// and looked at in each close view, its pixels read back from the frame drawn: a street lamp's lantern, a hall torch,
// a cottage's window, and each of the village's own point lights (the portals, the hall's braziers, the stair's
// lamps, the campfire, the chronicle's candle), and the chronicle's book, the palest thing in the porch torch's light
// and the candle's (it burned white, the lectern moved under the torch). A light mustn't blind: drawn in a lit,
// glowing material with its
// light a hand's breadth off the glass, the lanterns burned white and the bloom round them hid the lantern whole
// (from play: "lights too bright, can't see geometry even", "we should always check all lights for blinding").
// `canary` hangs a glaring orb in the first light, which must be caught.
import { theFlames } from './villageFire';
import * as THREE from 'three';
import { screenArea, type Lab, type Pictured } from './lab';
import { G } from '../../../src/state';
import { CHRONICLE, COTTAGES, TERRACE, VILLAGE_OBJECTS } from '../../../src/data/village';
import { COTTAGE } from '../../../src/world/villagePlan';
import { groundHeight } from '../../../src/world/ground';
import { holdHour } from '../../../src/game/clock';
import * as renderer from '../../../src/core/renderer';
import { drawFrame, topLight, type Canvas } from './light';

/** One check's lines, its problems, and whether its canary was caught (null: no canary ran). */
export interface LightsChecked { lines: string[]; problems: string[]; caught: boolean | null; moments: Pictured[] }

/** A light to read: its name, where it burns, how big it is (m across, the box its own pixels are counted over) and
 *  how far off it the hero stands (m, on the ground). */
interface LightCase { name: string; at: THREE.Vector3; span: number; off: number; noonToo?: boolean }

/** the frames the hero is given to settle and to look */
const SETTLE = 15;
const LOOK = 60;
/** the margin round a light's picture in the report (css px) */
const PICTURE_MARGIN = 160;
/** the ring round a light where a glare would spread (out to this many times its own box) */
const RING_OUT = 2.5;
/** a pixel blown out: its brightest channel's light at least this (1 is white) */
const BLOWN = 0.97;
/** the most of a light's own box, and of the ring round it, that may be blown out */
const OWN_MOST = 0.12;
const RING_MOST = 0.02;
/** the canary's orb: its radius (m) and its colour, far past white */
const ORB_RADIUS = 0.45;
const ORB_GLARE = 64;
/** a cottage's window as its builder places it, in the cottage's own frame (`buildCottage`): out from the middle
 *  along its face, its height, and how far out the face stands past half its depth */
const WINDOW = { across: 1.2, high: 1.7, out: 0.05 };
/** the hall's lights before its torches in `hallTorches`: the dais's */
const DAIS_LIGHTS = 2;
/** the chronicle's book: how high over the terrace it lies (m) */
const BOOK_UP = 1.14;
/** the hour a case is read at again that the day's light burns too (the sun on top of its lamps, the view adapted) */
const NOON = 12;

/** A box round a point on the canvas, in its pixels from its bottom left, as its half width and middle. */
interface ScreenBox { x: number; y: number; half: number }

/** Where `point` falls on the canvas and how many of its pixels `span` m across it covers there, or null behind. */
function boxOn(canvas: Canvas, point: THREE.Vector3, span: number): ScreenBox | null {
  const camera = G.camera;
  const middle = point.clone().project(camera);
  if (middle.z > 1) return null;
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const side = point.clone().addScaledVector(right, span / 2).project(camera);
  const x = ((middle.x + 1) / 2) * canvas.width;
  const y = ((middle.y + 1) / 2) * canvas.height;
  const half = Math.abs(((side.x - middle.x) / 2) * canvas.width);
  return { x, y, half };
}

/** Whether pixel (px, py) lies in `box`. */
function inBox(px: number, py: number, box: ScreenBox): boolean {
  return Math.abs(px - box.x) <= box.half && Math.abs(py - box.y) <= box.half;
}

/** The share of pixels blown out inside `inner` (or between it and `outer`, a ring, when one is given). */
function blownShare(canvas: Canvas, inner: ScreenBox, outer?: ScreenBox): number {
  const box = outer ?? inner;
  let counted = 0;
  let blown = 0;
  const left = Math.max(0, Math.floor(box.x - box.half));
  const right = Math.min(canvas.width - 1, Math.ceil(box.x + box.half));
  const bottom = Math.max(0, Math.floor(box.y - box.half));
  const top = Math.min(canvas.height - 1, Math.ceil(box.y + box.half));
  for (let py = bottom; py <= top; py++) {
    for (let px = left; px <= right; px++) {
      if (outer && inBox(px, py, inner)) continue;
      counted++;
      if (topLight(canvas, (py * canvas.width + px) * 4) >= BLOWN) blown++;
    }
  }
  return counted ? blown / counted : 0;
}

/** The hero stood `off` m from the light's foot on open ground, facing it; false if no spot round it holds him. */
async function standBy(lab: Lab, light: LightCase): Promise<boolean> {
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const x = light.at.x + Math.sin(a) * light.off;
    const z = light.at.z + Math.cos(a) * light.off;
    G.player.walkTo = null;
    G.player.place(new THREE.Vector3(x, groundHeight(x, z), z), a + Math.PI);
    await lab.step(SETTLE);
    if (Math.hypot(G.player.pos.x - x, G.player.pos.z - z) < 0.2) return true;
  }
  return false;
}

/** The village object nearest (x, z), for a light's name. */
function nearestObject(x: number, z: number): string {
  let best = 'light';
  let bestD = Infinity;
  for (const o of VILLAGE_OBJECTS) {
    const d = Math.hypot(o.at[0] - x, o.at[1] - z);
    if (d < bestD) {
      bestD = d;
      best = o.id;
    }
  }
  return best;
}

/** The village's own point lights (its ten), each named by the object it's nearest. */
function ownLights(): LightCase[] {
  const village = G.scene.getObjectByName('village');
  if (!village) throw new Error('lab: village: no village group in the scene');
  const found: LightCase[] = [];
  village.traverse((o) => {
    if (!(o as THREE.PointLight).isPointLight) return;
    const at = o.getWorldPosition(new THREE.Vector3());
    const where = [at.x, at.y, at.z].map((v) => v.toFixed(1)).join(', ');
    found.push({ name: `the light by the ${nearestObject(at.x, at.z)} (${where})`, at, span: 1, off: 3.5 });
  });
  return found;
}

/** A cottage's left window, where its builder puts it. */
function aWindow(): THREE.Vector3 {
  const c = COTTAGES[0];
  const local = new THREE.Vector3(-(COTTAGE.w / 2 - WINDOW.across), WINDOW.high, COTTAGE.d / 2 + WINDOW.out);
  local.multiplyScalar(c.size).applyAxisAngle(new THREE.Vector3(0, 1, 0), c.facing);
  return local.add(new THREE.Vector3(c.x, 0, c.z));
}

/** Every kind of light to read: a street lamp's lantern, a hall torch, a window, and the village's own lights. */
function lightCases(): LightCase[] {
  const lanterns = [...G.arena.village.lanterns];
  lanterns.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
  const torch = G.arena.village.hallTorches[DAIS_LIGHTS];
  const bookAt = new THREE.Vector3(CHRONICLE.x, TERRACE.high + BOOK_UP, CHRONICLE.z);
  return [
    { name: 'street lamp', at: lanterns[0], span: 0.6, off: 3 },
    // (from play, close under it looking up, "this light is blinding": its post burned white)
    { name: 'street lamp from under it', at: lanterns[0], span: 0.6, off: 1.2 },
    { name: 'hall torch', at: torch, span: 0.4, off: 2.5 },
    { name: 'window', at: aWindow(), span: 0.9, off: 3.5 },
    { name: "the chronicle's book", at: bookAt, span: 0.4, off: 1.6, noonToo: true },
    ...ownLights(),
  ];
}

/** The canary's orb, far past white, hung at `at`. */
function plantOrb(at: THREE.Vector3): () => void {
  const glare = new THREE.Color(ORB_GLARE, ORB_GLARE, ORB_GLARE);
  const material = new THREE.MeshBasicMaterial({ color: glare });
  const orb = new THREE.Mesh(new THREE.SphereGeometry(ORB_RADIUS, 12, 8), material);
  orb.position.copy(at);
  G.scene.add(orb);
  return () => {
    G.scene.remove(orb);
    orb.geometry.dispose();
    material.dispose();
  };
}

/** One close view's reading of a light: its line, and whether it blinds. */
function readView(view: string, light: LightCase, lab: Lab): { line: string; blinds: boolean } {
  // (a fire's flames stand taller than its light, and in the ring round it they read as what it burns: `lab fire` reads
  // them, and they're as bright as a flame is)
  const flames = theFlames();
  for (const mesh of flames) mesh.visible = false;
  const canvas = drawFrame(lab);
  for (const mesh of flames) mesh.visible = true;
  const own = boxOn(canvas, light.at, light.span);
  if (!own || own.half < 3) return { line: `lights: ${light.name}, ${view}: not in view`, blinds: false };
  const ring = { ...own, half: own.half * RING_OUT };
  const ownBlown = blownShare(canvas, own);
  const ringBlown = blownShare(canvas, own, ring);
  const blinds = ownBlown > OWN_MOST || ringBlown > RING_MOST;
  const percent = (v: number): string => `${(v * 100).toFixed(1)}%`;
  const line = `lights: ${light.name}, ${view}: ${percent(ownBlown)} blown out (${Math.round(own.half * 2)} px `
    + `across), round it ${percent(ringBlown)}${blinds ? ' (blinding)' : ''}`;
  return { line, blinds };
}

/** One light read in each close view, from where the hero stands by it: its lines and the views it blinds in. */
interface LightRead { lines: string[]; blinding: string[]; moments: Pictured[] }

/** One light read in each close view, from where the hero stands by it: its lines, the views it blinds in, and the
 *  close view's picture of it. */
async function readLight(lab: Lab, light: LightCase): Promise<LightRead> {
  if (!(await standBy(lab, light))) {
    return { lines: [`lights: ${light.name}: no open ground round it`], blinding: [], moments: [] };
  }
  const lines: string[] = [];
  const blinding: string[] = [];
  const moments: Pictured[] = [];
  try {
    for (let press = 0; press < 3; press++) {
      await lab.step(1, () => ({ keys: ['v'] }));
      const view = renderer.viewMode();
      if (view === 'top') break;
      await lab.step(LOOK, () => ({ sight: light.at }));
      const { line, blinds } = readView(view, light, lab);
      lines.push(line);
      if (blinds) blinding.push(line);
      if (press === 0) {
        const around = screenArea([light.at], PICTURE_MARGIN);
        moments.push(await lab.screen(`${light.name}, ${view}`, [line], around));
      }
    }
  } finally {
    while (renderer.viewMode() !== 'top') await lab.step(1, () => ({ keys: ['v'] }));
  }
  if (!lines.length) throw new Error('lab: village: V never took the village into a close view to see a light');
  return { lines, blinding, moments };
}

/** Every kind of light at midnight read in each close view: none of them, nor the ring round it, blown out. */
export async function lightsNotBlinding(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const lights = lightCases();
  holdHour(0);
  const lines: string[] = [];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  let caught = false;
  try {
    for (const [k, light] of lights.entries()) {
      const unplant = canary && k === 0 ? plantOrb(light.at) : () => {};
      try {
        const read = await readLight(lab, light);
        lines.push(...read.lines);
        moments.push(...read.moments);
        if (canary && k === 0) caught = read.blinding.length > 0;
        else problems.push(...read.blinding.map((line) => `${line}: a light blinds`));
      } finally {
        unplant();
      }
    }
    holdHour(NOON);
    for (const light of lights.filter((case_) => case_.noonToo)) {
      const read = await readLight(lab, { ...light, name: `${light.name} at noon` });
      lines.push(...read.lines);
      moments.push(...read.moments);
      problems.push(...read.blinding.map((line) => `${line}: a light blinds`));
    }
  } finally {
    holdHour(null);
    await lab.step(SETTLE);
  }
  return { lines, problems: canary ? [] : problems, caught: canary ? caught : null, moments };
}
