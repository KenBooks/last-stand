// `lab village --only campfireBurns`: the village's campfire as the player meets it (from play, "we need better fire
// effects, more professional (lobby and main game, especially camp fire"), by night and by day, over the shoulder and
// from above: its picture from each, and how much of the frame its flames draw against the frame with them hidden, its
// flames found by their material; and what its own light adds to the frame by night (from play, "in our case, there is
// no light from fire, its a mistake"). `lab fire` reads the same flames in the biomes. `canary` hides them and puts
// its light out first.
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import { G } from '../../../src/state';
import { CAMPFIRE, VILLAGE_OBJECTS } from '../../../src/data/village';
import { holdHour } from '../../../src/game/clock';
import { faceCamera, viewMode, type ViewMode } from '../../../src/core/renderer';
import { groundHeight } from '../../../src/world/ground';
import { drawFrame, type Canvas } from './light';
import { boxRound, glowOf } from './hallGlow';
import { changedShare, viewBy } from './villageHallCull';
import type { LightsChecked } from './villageLights';

/** the hours and views read, how far before it he stands (m), the frames given to settle */
const HOURS = [0, 12];
const VIEWS: ViewMode[] = ['third', 'top'];
const BEFORE = 2.4;
/** how far to its side he stands (m): in line with it, he stood before it over the shoulder */
const ASIDE = 3;
const SETTLE = 60;
/** the least of the frame its flames must draw from each view (a share of its pixels) */
const LEAST_DRAWN = 0.0003;
/** a fire's own colour, how near it its light stands (m), and the least its light must add to the red of what it
 *  changes by night, levels of 255 on average: what it changed a little, over much of the frame, read as no light
 *  at all */
const FIRE_LIGHT_COLOUR = 0xff9a48;
const FIRE_LIGHT_NEAR = 2.5;
const LEAST_ADDED = 24;
/** a change of red too small to see (levels of 255) */
const LEAST_SEEN = 2;

/** The flames over the campfire: the shader with a box over its place. */
function campfireFlames(): THREE.Mesh {
  let found: THREE.Mesh | null = null;
  G.scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    const uniforms = (mesh.material as THREE.ShaderMaterial | undefined)?.uniforms;
    if (!uniforms?.uPuff || !uniforms.uCentre) return;
    const centre = uniforms.uCentre.value as THREE.Vector3;
    if (Math.hypot(centre.x - CAMPFIRE[0], centre.z - CAMPFIRE[1]) < 0.5) found = mesh;
  });
  if (!found) throw new Error('lab: village: no flames over the campfire');
  return found;
}

/** What `lit` adds over `unlit` to the red of the pixels it changes, in levels of 255 on average. */
function redAdded(lit: Canvas, unlit: Canvas): number {
  let added = 0;
  let changed = 0;
  for (let at = 0; at < lit.pixels.length; at += 4) {
    // (a canvas's pixels run from 0 to 1)
    const red = (lit.pixels[at] - unlit.pixels[at]) * 255;
    if (red <= LEAST_SEEN) continue;
    added += red;
    changed++;
  }
  return changed ? added / changed : 0;
}

/** his head's height (m), how near the campfire's middle he can stand (m: its obstacle's edge and his body's), the
 *  frames given to settle; a pixel's lightest channel past this is burned out, the most of his figure that may be,
 *  his figure's half width against its height on the screen and the least it's read (px) */
const HEAD_UP = 1.7;
const NEAREST = 1.35;
const FIGURE_BURNED = 0.9;
const FIGURE_MOST = 0.06;
const FIGURE_WIDE = 0.22;
const FIGURE_LEAST_PX = 12;

/** The campfire's own light: the point light of a fire's colour nearest it. */
function campfireLight(): THREE.PointLight {
  let found: THREE.PointLight | null = null;
  G.scene.traverse((object) => {
    const light = object as THREE.PointLight;
    if (!light.isPointLight || light.color.getHex() !== FIRE_LIGHT_COLOUR) return;
    if (Math.hypot(light.position.x - CAMPFIRE[0], light.position.z - CAMPFIRE[1]) < FIRE_LIGHT_NEAR) found = light;
  });
  if (!found) throw new Error('lab: village: no light over the campfire');
  return found;
}

/** The share of his figure as `canvas` shows it (a box from his feet to his head) burned past `FIGURE_BURNED`. */
function figureBurned(canvas: Canvas, at: THREE.Vector3): number {
  const place = (height: number): THREE.Vector3 => at.clone().setY(at.y + height).project(G.camera);
  const foot = place(0);
  const head = place(HEAD_UP);
  const across = (foot.x + head.x) / 2;
  const wide = Math.abs(head.y - foot.y) * FIGURE_WIDE * canvas.height / canvas.width;
  const half = Math.max(FIGURE_LEAST_PX / canvas.width, wide);
  const left = Math.floor((across - half + 1) / 2 * canvas.width);
  const right = Math.ceil((across + half + 1) / 2 * canvas.width);
  const bottom = Math.floor((Math.min(foot.y, head.y) + 1) / 2 * canvas.height);
  const top = Math.ceil((Math.max(foot.y, head.y) + 1) / 2 * canvas.height);
  let burned = 0;
  let read = 0;
  for (let y = bottom; y < top; y++) {
    for (let x = left; x < right; x++) {
      const pixel = (y * canvas.width + x) * 4;
      const lightest = Math.max(canvas.pixels[pixel], canvas.pixels[pixel + 1], canvas.pixels[pixel + 2]);
      read++;
      if (lightest > FIGURE_BURNED) burned++;
    }
  }
  return read ? burned / read : 0;
}

/** the box read round a quiver's mouth (m across), how far along it its mouth is from its joint (m), how far from the
 *  fire he's read and how many ways round it, facing it with the camera on the fire's side of him (from play, "arrows
 *  still blinding reflection near fire": beyond the fire from the camera), and the most of the box that may be near
 *  white */
const QUIVER_BOX = 0.4;
const QUIVER_UP = 0.3;
const ROUND_FIRE = [1.6, 2.6];
const WAYS_ROUND = 4;
const QUIVER_MOST = 0.005;
const QUIVER_SETTLE = 20;

/** A place round the fire and what his quiver's mouth read there. */
interface QuiverRead {
  share: number;
  brightest: number;
  angle: number;
  away: number;
}

/** His quiver's mouth from the fire's side, all round it: the place where the most of it is near white. */
async function quiverBurned(lab: Lab): Promise<QuiverRead | null> {
  const quiver = G.player.model.root.getObjectByName('quiver');
  if (!quiver) return null;
  let worst: QuiverRead = { share: -1, brightest: 0, angle: 0, away: 0 };
  for (const away of ROUND_FIRE) {
    for (let way = 0; way < WAYS_ROUND; way++) {
      const angle = way / WAYS_ROUND * Math.PI * 2;
      const x = CAMPFIRE[0] + Math.sin(angle) * away;
      const z = CAMPFIRE[1] + Math.cos(angle) * away;
      G.player.place(new THREE.Vector3(x, groundHeight(x, z), z), angle + Math.PI);
      faceCamera(angle);
      await lab.step(QUIVER_SETTLE);
      G.player.model.root.updateMatrixWorld(true);
      const mouth = quiver.localToWorld(new THREE.Vector3(0, QUIVER_UP, 0));
      const glow = glowOf(drawFrame(lab, boxRound(mouth, QUIVER_BOX)), 0);
      if (glow.nearWhite > worst.share) worst = { share: glow.nearWhite, brightest: glow.max, angle, away };
    }
  }
  return worst;
}

/** the hours the skin's read at (from play, by day, "fire blinding skin issue again"), and the most of his figure that
 *  may be burned, read all round the fire from its side */
const SKIN_HOURS = [12, 0];
const SKIN_MOST = 0.009;

/** His figure round the fire by day and night, the camera on its side: the worst burned of it, pictured. */
async function skinRoundTheFire(lab: Lab, lines: string[], problems: string[], moments: Pictured[]): Promise<void> {
  await viewBy(lab, 'top');
  let worst = { share: -1, angle: 0, away: 0, hour: 0 };
  for (const hour of SKIN_HOURS) {
    holdHour(hour);
    for (const away of ROUND_FIRE) {
      for (let way = 0; way < WAYS_ROUND; way++) {
        const angle = way / WAYS_ROUND * Math.PI * 2;
        const x = CAMPFIRE[0] + Math.sin(angle) * away;
        const z = CAMPFIRE[1] + Math.cos(angle) * away;
        G.player.place(new THREE.Vector3(x, groundHeight(x, z), z), angle + Math.PI);
        faceCamera(angle);
        await lab.step(QUIVER_SETTLE);
        const share = bodyBurned(lab);
        if (share > worst.share) worst = { share, angle, away, hour };
      }
    }
  }
  const said = `${(worst.share * 100).toFixed(2)}% burned, ${worst.away} m out at ${worst.angle.toFixed(2)} rad, `
    + `at ${worst.hour} h`;
  lines.push(`his skin round the fire at worst: ${said}`);
  if (worst.share > SKIN_MOST) problems.push(`his skin beside the campfire: ${said}`);
  holdHour(worst.hour);
  const x = CAMPFIRE[0] + Math.sin(worst.angle) * worst.away;
  const z = CAMPFIRE[1] + Math.cos(worst.angle) * worst.away;
  G.player.place(new THREE.Vector3(x, groundHeight(x, z), z), worst.angle + Math.PI);
  faceCamera(worst.angle);
  await lab.step(QUIVER_SETTLE);
  moments.push(await lab.screen('his skin at its worst beside the fire', []));
  holdHour(0);
}

/** how far a pixel must change with him hidden to be one of him (of the screen's white), and the fewest such pixels
 *  that say he was drawn at all */
const HIS_PIXEL = 0.04;
const HIS_FEWEST = 200;

/** Every fire's flames, their light left on: drawn over him, they count as his in a frame with him and without. */
export function theFlames(): THREE.Object3D[] {
  const flames: THREE.Object3D[] = [];
  G.scene.traverse((object) => {
    const uniforms = ((object as THREE.Mesh).material as THREE.ShaderMaterial | undefined)?.uniforms;
    if (uniforms?.uFrame && object.visible) flames.push(object);
  });
  return flames;
}

/** The share of his own pixels that's burned out: the frame drawn with him and without, for the grass in the sun and
 *  the flames round him (in his box, they read 1.3% burned with no skin burned in the picture). */
function bodyBurned(lab: Lab): number {
  const flames = theFlames();
  for (const mesh of flames) mesh.visible = false;
  const withHim = drawFrame(lab).pixels.slice();
  const light = campfireLight();
  const lit = light.intensity;
  light.intensity = 0;
  const unlit = drawFrame(lab).pixels.slice();
  light.intensity = lit;
  G.player.obj.visible = false;
  const without = drawFrame(lab).pixels;
  G.player.obj.visible = true;
  for (const mesh of flames) mesh.visible = true;
  let burned = 0;
  let his = 0;
  for (let pixel = 0; pixel < withHim.length; pixel += 4) {
    const moved = Math.abs(withHim[pixel] - without[pixel]) + Math.abs(withHim[pixel + 1] - without[pixel + 1]);
    if (moved < HIS_PIXEL) continue;
    his++;
    // (what's burned with its light off is the sun's or a lamp's on his steel, none of the fire's doing)
    const burnedUnlit = Math.max(unlit[pixel], unlit[pixel + 1], unlit[pixel + 2]) > FIGURE_BURNED;
    if (!burnedUnlit && Math.max(withHim[pixel], withHim[pixel + 1], withHim[pixel + 2]) > FIGURE_BURNED) burned++;
  }
  if (his < HIS_FEWEST) throw new Error(`lab: village: only ${his} pixels of him drawn beside the fire`);
  return burned / his;
}

/** Stood as near the campfire as he can, and at its own stand, by midnight, in each view: his figure not burned out. */
export async function heroBesideFire(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const kept = viewMode();
  const light = campfireLight();
  const lines: string[] = [];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  const stand = VILLAGE_OBJECTS.find((object) => object.id === 'campfire')?.stand;
  if (!stand) throw new Error('lab: village: the campfire has no stand');
  const spots: [string, number, number][] = [
    ['at its stand', stand[0], stand[1]],
    ['as near as he can', CAMPFIRE[0] + NEAREST, CAMPFIRE[1]],
  ];
  const held = light.position.y;
  const heldDecay = light.decay;
  // (as the fault was: a light at his head's height, not soft close to)
  if (canary) {
    light.position.y = HEAD_UP;
    light.decay = 2;
  }
  holdHour(0);
  try {
    for (const view of VIEWS) {
      await viewBy(lab, view);
      for (const [name, x, z] of spots) {
        const at = new THREE.Vector3(x, 0, z);
        at.y = groundHeight(x, z);
        G.player.walkTo = null;
        G.player.place(at, Math.atan2(CAMPFIRE[0] - x, CAMPFIRE[1] - z));
        await lab.step(SETTLE);
        const body = G.player.obj.position.clone();
        const share = figureBurned(drawFrame(lab), body);
        lines.push(`his figure ${name}, ${view}: ${(share * 100).toFixed(1)}% burned out`);
        if (share > FIGURE_MOST) {
          problems.push(`beside the campfire ${name}, ${view}: ${(share * 100).toFixed(1)}% burned out`);
        }
        moments.push(await lab.screen(`beside it ${name} ${view}`, []));
      }
    }
    await skinRoundTheFire(lab, lines, problems, moments);
    await viewBy(lab, 'third');
    const quiver = await quiverBurned(lab);
    if (quiver) {
      const said = `${(quiver.share * 100).toFixed(1)}% near white, its brightest ${quiver.brightest.toFixed(2)}, `
        + `${quiver.away} m out at ${quiver.angle.toFixed(2)} rad`;
      lines.push(`his quiver round it at worst: ${said}`);
      if (quiver.share > QUIVER_MOST) problems.push(`his quiver beside the campfire: ${said}`);
      G.player.place(new THREE.Vector3(CAMPFIRE[0] + Math.sin(quiver.angle) * quiver.away, 0,
        CAMPFIRE[1] + Math.cos(quiver.angle) * quiver.away), quiver.angle + Math.PI);
      faceCamera(quiver.angle);
      await lab.step(QUIVER_SETTLE);
      moments.push(await lab.screen('his quiver at its worst', []));
    }
  } finally {
    light.position.y = held;
    light.decay = heldDecay;
    holdHour(null);
    await viewBy(lab, kept);
  }
  if (canary) return { lines, problems: [], caught: problems.length > 0, moments: [] };
  return { lines, problems, caught: null, moments };
}

/** The campfire at each hour from each view. */
export async function campfireBurns(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const kept = viewMode();
  const flames = campfireFlames();
  const light = campfireLight();
  const at = new THREE.Vector3(CAMPFIRE[0] + BEFORE, 0, CAMPFIRE[1] + ASIDE);
  at.y = groundHeight(at.x, at.z);
  G.player.walkTo = null;
  G.player.place(at, -Math.PI / 2);
  if (canary) {
    flames.visible = false;
    light.visible = false;
  }
  const said: string[] = [];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  try {
    for (const hour of HOURS) {
      holdHour(hour);
      for (const view of VIEWS) {
        await viewBy(lab, view);
        if (view !== 'top') faceCamera(Math.atan2(CAMPFIRE[0] - at.x, CAMPFIRE[1] - at.z));
        await lab.step(SETTLE);
        const shown = drawFrame(lab);
        const was = flames.visible;
        flames.visible = false;
        const hidden = drawFrame(lab);
        flames.visible = was;
        const drawn = changedShare(shown, hidden);
        if (hour === 0 && view === 'third') {
          const held = light.intensity;
          const stays = light.visible;
          light.intensity = 0;
          const unlit = drawFrame(lab);
          light.intensity = held;
          light.visible = stays;
          const share = changedShare(shown, unlit);
          const added = redAdded(shown, unlit);
          // (read off its matrix as three's lights read it: `getWorldPosition` would make it again first)
          const place = new THREE.Vector3().setFromMatrixPosition(light.matrixWorld);
          const off = Math.hypot(place.x - CAMPFIRE[0], place.z - CAMPFIRE[1]);
          if (off > FIRE_LIGHT_NEAR) problems.push(`the campfire's light stands ${off.toFixed(1)} m from it`);
          said.push(`its light ${held.toFixed(1)} cd at ${place.toArray().map((part) => part.toFixed(1))}, `
            + `${light.visible ? 'on' : 'off'}, changes ${(share * 100).toFixed(1)}%, adds ${added.toFixed(1)} of red`);
          if (added < LEAST_ADDED) problems.push(`the campfire's light adds ${added.toFixed(1)} of red by night`);
        }
        said.push(`${hour}:00 ${view} ${(drawn * 100).toFixed(2)}%`);
        if (drawn < LEAST_DRAWN) problems.push(`the campfire's flames drew nothing at ${hour}:00 ${view}`);
        moments.push(await lab.screen(`campfire ${hour}h ${view}`, []));
      }
    }
  } finally {
    flames.visible = true;
    holdHour(null);
    await viewBy(lab, kept);
  }
  const line = `the campfire's flames, of the frame: ${said.join(', ')}`;
  if (canary) return { lines: [line], problems: [], caught: problems.length > 0, moments: [] };
  return { lines: [line], problems, caught: null, moments };
}
