// `lab village`'s hall's windows letting the sun in: at mid-morning, from the middle of the hall over the shoulder,
// turned to the dais (its door behind the camera), the frame drawn with the sun and without it in one frame, the hero
// hidden: the share of the frame the sun lights, through the east windows alone (from play, "windows need to be real,
// and let sun/moonlight through": a pane's picture on a whole wall let none in). Read at the spots where the sun
// lands through each window's middle it lit nothing at 8:30, the palisade 5 to 10 m east of the hall shading its east
// wall from a low sun, and the morning sun, south of east, lands each window's light some 5 m past it toward the dais.
// `canary` draws both frames without the sun.
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { holdHour } from '../../../src/game/clock';
import { faceCamera, viewMode } from '../../../src/core/renderer';
import { TERRACE } from '../../../src/data/village';
import { drawFrame, type Canvas } from './light';
import { viewBy } from './villageHallCull';
import type { LightsChecked } from './villageLights';

/** the hour read (the sun east of south, over the palisade), where the hero stands and the way he faces */
const HOUR = 9.5;
const STAND = new THREE.Vector3(TERRACE.x, TERRACE.high, -24);
const FACING = Math.PI;
const SETTLE = 60;
/** a pixel the sun lights: at least this share of its light the sun's (and not black) */
const SUNLIT = 0.3;
const NOT_BLACK = 0.02;
/** the least share of the frame the sun lights (with the windows shut, the sun through the door and over the walls lit
 *  0.58% of it; open, 1.38% with the panes 8 cm in from each face, 2.0 to 2.2% set back to its middle) */
const LEAST_LIT = 0.009;

/** The sun's light. */
function sunLight(): THREE.DirectionalLight {
  let sun: THREE.DirectionalLight | null = null;
  G.scene.traverse((o) => {
    if (!sun && (o as THREE.DirectionalLight).isDirectionalLight) sun = o as THREE.DirectionalLight;
  });
  if (!sun) throw new Error('lab: no sun in the scene');
  return sun;
}

/** The share of the pixels whose light is at least `SUNLIT` the sun's: `lit` drawn with it, `unlit` without. */
function sunlitShare(lit: Canvas, unlit: Canvas): number {
  let sunlit = 0;
  for (let i = 0; i < lit.pixels.length; i += 4) {
    const withSun = lit.pixels[i] + lit.pixels[i + 1] + lit.pixels[i + 2];
    const without = unlit.pixels[i] + unlit.pixels[i + 1] + unlit.pixels[i + 2];
    if (withSun > NOT_BLACK && 1 - without / withSun >= SUNLIT) sunlit++;
  }
  return sunlit / (lit.pixels.length / 4);
}

/** The frame drawn with the sun and without it (both without, with `dark`), the hero hidden. */
function withAndWithout(lab: Lab, dark: boolean): [Canvas, Canvas] {
  const sun = sunLight();
  const strength = sun.intensity;
  G.player.obj.visible = false;
  try {
    if (dark) sun.intensity = 0;
    const lit = drawFrame(lab);
    sun.intensity = 0;
    return [lit, drawFrame(lab)];
  } finally {
    sun.intensity = strength;
    G.player.obj.visible = true;
  }
}

/** The share of the hall's frame the morning sun lights through its windows. */
export async function windowsLetSunIn(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const kept = viewMode();
  holdHour(HOUR);
  try {
    await viewBy(lab, 'third');
    G.player.walkTo = null;
    G.player.place(STAND, FACING);
    faceCamera(FACING);
    await lab.step(SETTLE);
    const share = sunlitShare(...withAndWithout(lab, canary));
    const line = `hall's windows at ${HOUR} h: ${(share * 100).toFixed(2)}% of the frame inside the hall lit by the sun`
      + ` (at least ${LEAST_LIT * 100}%)`;
    const dark = share < LEAST_LIT;
    if (canary) return { lines: [line], problems: [], caught: dark, moments: [] };
    return { lines: [line], problems: dark ? [`${line}: the windows let no sun in`] : [], caught: null, moments: [] };
  } finally {
    holdHour(null);
    await viewBy(lab, kept);
  }
}
