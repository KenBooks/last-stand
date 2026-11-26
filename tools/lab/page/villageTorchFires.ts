// `lab village --only hallTorchesBurn`: the hall of heroes' torches burn, and their light flickers with their fires
// (from play, "hall lights are completely broken and static", "these lights are super lame": each was a lit tongue in
// a cup, the same every frame, its lamp steady). Stood in the hall at midnight: every column's and door's torch has a
// fire's flames by it (a mesh `buildFire` marks, `fireFlames`), and over two seconds each torch's lamp, as the lit
// shaders' list holds it (`lampList`), moves by at least `LEAST_SWAY` of its middle. And from above in the hall the
// porch torches' fires, outside its front wall, change no pixel: their baskets go with the wall as it opens over him,
// and shown they hung in the air past the room (from play). And from below a torch its flames change none of its
// basket's pixels: only their box is depth-tested, and with no bowl told them the flames were drawn over the basket.
// `canary` holds every torch's flicker still (a light of its own in each one's place that no fire moves), shows the
// porch's fires from above and takes the torch's bowl away.
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { holdHour } from '../../../src/game/clock';
import { lampList } from '../../../src/core/lamps';
import { viewMode } from '../../../src/core/renderer';
import { TERRACE } from '../../../src/data/village';
import { drawFrame } from './light';
import { changedShare, viewBy } from './villageHallCull';
import type { LightsChecked } from './villageLights';

/** the most of the frame the porch's fires may change from above in the hall, where he stands for it and his way */
const MOST_PORCH = 0.0002;
const FROM_ABOVE = new THREE.Vector3(TERRACE.x, TERRACE.high, -20);
const DAIS_WAY = Math.PI;

/** The porch's fires, where this commit has them apart (an A/B's other side may not). */
const porchFires = (): THREE.Object3D | undefined =>
  (G.arena.village as { porchFires?: THREE.Object3D }).porchFires;

/** The share of the frame from above in the hall that the porch's fires change (shown in the canary), or null where
 *  this commit has them in no group of their own. */
async function porchFromAbove(lab: Lab, canary: boolean): Promise<number | null> {
  const fires = porchFires();
  if (!fires) return null;
  const view = viewMode();
  try {
    // (turned to the dais, the door behind him at the frame's foot, where the porch's fires showed)
    G.player.place(FROM_ABOVE, DAIS_WAY);
    await viewBy(lab, 'top');
    await lab.step(SETTLE);
    if (canary) fires.visible = true;
    const asShown = drawFrame(lab);
    const shown = fires.visible;
    fires.visible = false;
    const without = drawFrame(lab);
    fires.visible = shown;
    return changedShare(asShown, without);
  } finally {
    await viewBy(lab, view);
  }
}

/** from below a torch: the close-up's camera's distance and how far under the fire's bed it's framed on (m), how much
 *  a channel must change for a pixel to count, and the most of the basket's pixels its flames may change */
const BELOW = { distance: 1.8, under: 0.15 };
const CHANGED = 8;
const MOST_OVER_BASKET = 0.02;
/** a bowl the flames' shader knows as none (its rim under its foot), as `noBowl` in world/fire.ts */
const NO_BOWL = (): THREE.Vector2[] => [new THREE.Vector2(0, 0), new THREE.Vector2(0, 0), new THREE.Vector2(-1, 0)];

/** A canvas's pixels. */
function pixelsOf(canvas: HTMLCanvasElement): Uint8ClampedArray {
  return canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
}

/** Whether pixel `i` differs between two pictures by more than `CHANGED` in a channel. */
function differs(a: Uint8ClampedArray, b: Uint8ClampedArray, i: number): boolean {
  const most = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
  return most > CHANGED;
}

/** how far under a fire's bed its basket's middle is (m: `BASKET_BELOW` in world/torchFire.ts, about half) */
const BASKET_MIDDLE = 0.13;

/** The mesh drawing the torch's basket under a fire's flames: the first a ray meets from the aisle (`from`, the
 *  torch's light) in to the basket's middle. Its own mesh or the still meshes' merge that took it, with whatever else
 *  of the hall's iron that merge holds (the arms and bands under it: flames drawn over those are as wrong). */
function basketUnder(flames: THREE.Object3D, from: THREE.Vector3): THREE.Object3D | undefined {
  const middle = flames.getWorldPosition(new THREE.Vector3());
  middle.y -= BASKET_MIDDLE;
  const start = new THREE.Vector3(from.x, middle.y, from.z);
  const ray = new THREE.Raycaster(start, middle.clone().sub(start).normalize(), 0, start.distanceTo(middle) + 0.2);
  const shown = (object: THREE.Object3D): boolean => object.visible && (object.parent ? shown(object.parent) : true);
  const hit = ray.intersectObject(G.scene, true).find((met) => met.object !== flames && shown(met.object));
  return hit?.object;
}

/** The first column torch's flames (by its lamp's place) and that place, or none. */
function firstTorchFlames(): { flames: THREE.Object3D; light: THREE.Vector3 } | undefined {
  const light = torches()[0].at;
  let flames: THREE.Object3D | undefined;
  G.scene.traverse((object) => {
    if (!object.userData.fireFlames) return;
    if (object.getWorldPosition(new THREE.Vector3()).distanceTo(light) < FIRE_NEAR) flames ??= object;
  });
  return flames && { flames, light };
}

/** From below a column torch, the share of its basket's pixels its flames change (the canary takes the basket away
 *  from what the flames' march stops at, as before: from play, "looks like draw order... fire ignores geometry"), or
 *  null where no torch has a basket. */
function flamesOverBasket(lab: Lab, canary: boolean): number | null {
  const torch = firstTorchFlames();
  const basket = torch && basketUnder(torch.flames, torch.light);
  if (!torch || !basket) return null;
  const flames = torch.flames;
  const uniforms = flames.userData.flames as { uBowl: { value: THREE.Vector2[] } };
  const bowl = uniforms.uBowl.value;
  if (canary) uniforms.uBowl.value = NO_BOWL();
  const at = flames.getWorldPosition(new THREE.Vector3());
  at.y -= BELOW.under;
  const below = (): Uint8ClampedArray => pixelsOf(lab.drawn(['below'], { at, distance: BELOW.distance })[0].canvas);
  try {
    const whole = below();
    flames.visible = false;
    const noFlames = below();
    basket.visible = false;
    const neither = below();
    let basketPixels = 0;
    let over = 0;
    for (let i = 0; i < whole.length; i += 4) {
      if (!differs(noFlames, neither, i)) continue;
      basketPixels++;
      if (differs(whole, noFlames, i)) over++;
    }
    return basketPixels > 0 ? over / basketPixels : null;
  } finally {
    flames.visible = true;
    basket.visible = true;
    uniforms.uBowl.value = bowl;
  }
}

/** where he stands (the hall's middle), the frames given to settle and read over */
const STAND = new THREE.Vector3(TERRACE.x, TERRACE.high, -22);
const SETTLE = 30;
const FRAMES = 120;
/** how near a torch's light its fire must burn (m: the light stands out from the torch, `wallTorch`'s `out`) */
const FIRE_NEAR = 1.4;
/** the least a torch's lamp must move by over the frames read, of its middle */
const LEAST_SWAY = 0.08;
/** the dais's lights ahead of the torches among the hall's (`TORCHLIGHT.dais` in game/village.ts) */
const DAIS_LIGHTS = 2;

/** The fires' flames in the scene, where each stands in the world. */
function flamesAt(): THREE.Vector3[] {
  const at: THREE.Vector3[] = [];
  G.scene.traverse((object) => {
    if (object.userData.fireFlames) at.push(object.getWorldPosition(new THREE.Vector3()));
  });
  return at;
}

/** Lamp `i`'s strength in the lit shaders' list: its colour's brightest channel. */
function lampStrength(i: number): number {
  const light = (1 + i * 2) * 4 + 4;
  return Math.max(lampList[light], lampList[light + 1], lampList[light + 2]);
}

/** The torches' places (the columns' and the door's) and their lamps' indices in the list. */
function torches(): { at: THREE.Vector3; lamp: number }[] {
  const village = G.arena.village;
  const first = village.lanterns.length;
  const columns = village.hallTorches.slice(DAIS_LIGHTS).map((at, k) => ({ at, lamp: first + DAIS_LIGHTS + k }));
  const porchFirst = first + village.hallTorches.length;
  const porch = village.porchTorches.map((at, k) => ({ at, lamp: porchFirst + k }));
  return [...columns, ...porch];
}

/** Every torch's flicker swapped for a light no fire moves; returns what puts them back. */
function flickersHeld(): () => void {
  const flickers = G.arena.village.torchFlickers as THREE.PointLight[];
  const kept = [...flickers];
  for (let k = 0; k < flickers.length; k++) flickers[k] = new THREE.PointLight(0xffffff, 1);
  return () => {
    for (let k = 0; k < kept.length; k++) flickers[k] = kept[k];
  };
}

/** The hall's torches burn, their light flickering. */
export async function hallTorchesBurn(lab: Lab, canary: boolean): Promise<LightsChecked> {
  holdHour(0);
  const putBack = canary ? flickersHeld() : null;
  try {
    G.player.walkTo = null;
    G.player.place(STAND, Math.PI);
    await lab.step(SETTLE);
    const list = torches();
    const lowest = list.map(() => Infinity);
    const highest = list.map(() => -Infinity);
    for (let frame = 0; frame < FRAMES; frame++) {
      await lab.step(1);
      list.forEach((torch, k) => {
        const strength = lampStrength(torch.lamp);
        lowest[k] = Math.min(lowest[k], strength);
        highest[k] = Math.max(highest[k], strength);
      });
    }
    const flames = flamesAt();
    const unlit = list.filter((torch) => !flames.some((flame) => flame.distanceTo(torch.at) < FIRE_NEAR));
    const sways = list.map((_, k) => (highest[k] - lowest[k]) / Math.max((highest[k] + lowest[k]) / 2, 1e-6));
    const still = sways.filter((sway) => sway < LEAST_SWAY).length;
    const least = Math.min(...sways);
    const over = flamesOverBasket(lab, canary);
    const porch = await porchFromAbove(lab, canary);
    const lines = [
      over === null ? 'from below a torch: no basket under its fire'
        : `from below a torch its flames change ${(over * 100).toFixed(1)}% of its basket's pixels`,
      `hall's torches: ${list.length - unlit.length} of ${list.length} with a fire by them`,
      `their lamps over ${FRAMES} frames: the least moved by ${(least * 100).toFixed(1)}% of its middle,`
        + ` ${still} under ${LEAST_SWAY * 100}%`,
      porch === null ? 'the porch\'s fires: none apart in this commit'
        : `from above in the hall the porch's fires change ${(porch * 100).toFixed(3)}% of the frame`,
    ];
    const problems: string[] = [];
    if (list.length === 0) problems.push('no torch in the hall');
    if (unlit.length > 0) problems.push(`${unlit.length} torches with no fire by them`);
    if (still > 0) problems.push(`${still} torches' light steady, no flicker`);
    if (porch !== null && porch > MOST_PORCH) problems.push('the porch\'s fires hang in the air from above in the hall');
    if (over !== null && over > MOST_OVER_BASKET) problems.push('from below a torch its flames are drawn over its basket');
    if (canary) {
      const caught = still > 0 && (porch ?? 1) > MOST_PORCH && (over ?? 1) > MOST_OVER_BASKET;
      return { lines, problems: [], caught, moments: [] };
    }
    return { lines, problems, caught: null, moments: [] };
  } finally {
    putBack?.();
    holdHour(null);
  }
}
