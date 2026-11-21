// The frame's lights written to the engine's globals: the sky's and the flat light summed, the sun chosen, each point
// light of the scene and of the shown place, and the village's lamps with the shelter they light their own side of.
import * as THREE from 'three';
import { lampList, LAMPS_MOST } from '../core/lamps';
import { HALL, TERRACE } from '../data/village';
import type { Core } from './core';
import { GLOBALS, TUNE, type Lit } from './globals';

const MAX_POINTS = 32;
const v3 = new THREE.Vector3();

/** how far into the hall's walls the shelter reaches past their inner faces (m; the walls are 0.6 thick) */
export const SHELTER_INTO_WALLS = 0.3;

export class Lights implements Lit {
  /** the point lights written this frame */
  points = 0;
  /** the frame's sun: the strongest directional light met */
  sun: THREE.DirectionalLight | null = null;

  /** a lamp's place among the maps of the lamps' shadows, -1 for none (`lampShadows.ts`; set by the bridge) */
  lampSlot: (lamp: number) => number = () => -1;

  constructor(private core: Core) {}

  /** A new frame: no light met yet. */
  begin(): void {
    this.points = 0;
    this.sun = null;
  }

  add(light: THREE.Light): void {
    const g = this.core.globals, by = light.intensity, c = light.color;
    if (by <= 0) return;
    if ((light as THREE.AmbientLight).isAmbientLight) {
      g[GLOBALS.ambient] += c.r * by; g[GLOBALS.ambient + 1] += c.g * by; g[GLOBALS.ambient + 2] += c.b * by;
    } else if ((light as THREE.HemisphereLight).isHemisphereLight) {
      const ground = (light as THREE.HemisphereLight).groundColor;
      g[GLOBALS.hemiSky] += c.r * by; g[GLOBALS.hemiSky + 1] += c.g * by; g[GLOBALS.hemiSky + 2] += c.b * by;
      g[GLOBALS.hemiGround] += ground.r * by; g[GLOBALS.hemiGround + 1] += ground.g * by;
      g[GLOBALS.hemiGround + 2] += ground.b * by;
    } else if ((light as THREE.DirectionalLight).isDirectionalLight) {
      // (the strongest is the sun; the engine has one)
      if (!this.sun || by > this.sun.intensity) this.sun = light as THREE.DirectionalLight;
    } else if ((light as THREE.PointLight).isPointLight) {
      if (this.points === MAX_POINTS) { this.core.skip('point light past 32'); return; }
      const point = light as THREE.PointLight, at = GLOBALS.points + this.points * 8;
      // (asked of the light itself: one the game hides from three, `shownPointLights`, has its matrices left as
      // they stood when it was hidden)
      point.getWorldPosition(v3);
      g[at] = v3.x; g[at + 1] = v3.y; g[at + 2] = v3.z; g[at + 3] = point.distance;
      g[at + 4] = c.r * by; g[at + 5] = c.g * by; g[at + 6] = c.b * by; g[at + 7] = point.decay;
      this.points++;
    } else {
      this.core.skip(light.type);
    }
  }

  /** The village's lamps (core/lamps.ts `lampList`: a place and a light each, after its shelter) as point lights,
   *  soft close to as the game's are, each with its place among the maps of their shadows once drawn. */
  addLamps(): void {
    const g = this.core.globals;
    // (the list's first entry: the shelter, the hall of heroes' inside)
    g.set(lampList.subarray(0, 4), GLOBALS.shelter);
    // (its box is the walls' inner faces: a pixel of a face fell inside it or out by the rounding of where it
    // lies, lit row by row as the hall's inside and as the square, the back wall striped grey. From play: "hall
    // walls are z-fighting or smth like that". It reaches half way into the walls)
    g[GLOBALS.shelter] -= SHELTER_INTO_WALLS;
    g[GLOBALS.shelter + 1] -= SHELTER_INTO_WALLS;
    g[GLOBALS.shelter + 2] += SHELTER_INTO_WALLS;
    g[GLOBALS.shelter + 3] += SHELTER_INTO_WALLS;
    g[GLOBALS.shelter + 4] = TUNE.shelterSky;
    // (its walls' tops: over them is the hall's roof from outside, which stood black from above, sheltered from
    // the sun it's under. From play: "top down view wall/roof thinning is broken")
    g[GLOBALS.shelter + 5] = TERRACE.high + HALL.wallHigh;
    let lit = 0;
    for (let lamp = 0; lamp < LAMPS_MOST && this.points < MAX_POINTS; lamp++) {
      const place = (1 + lamp * 2) * 4, light = place + 4;
      if (lampList[light + 3] === 0) continue;
      const at = GLOBALS.points + this.points * 8;
      g.set(lampList.subarray(place, place + 4), at);
      g.set(lampList.subarray(light, light + 3), at + 4);
      // (a code: which side of the shelter it lights, 2 what's under it and 1 what isn't, and four times one
      // more than its place among the maps of the lamps' shadows, none while they aren't drawn)
      g[at + 7] = -((lampList[light + 3] > 0 ? 2 : 1) + 4 * (this.lampSlot(lamp) + 1));
      this.points++;
      lit++;
    }
    // (the village's lamps are lit while it's shown and out in a run: left set there, the hall's box of ground lay
    // sunless on the battleground's floor, a dark rectangle. From play: "also weird shadow")
    if (!lit) g.fill(0, GLOBALS.shelter, GLOBALS.shelter + 4);
  }

  /** A harness's: the shelter as the last frame had it (its box's least x and z and its most, the sky's share under
   *  it, its walls' tops). */
  shelterNow(): number[] {
    return Array.from(this.core.globals.subarray(GLOBALS.shelter, GLOBALS.shelter + 6));
  }

  /** The lights the last frame was drawn under, as the globals hold them: for a report. */
  report(): string {
    const g = this.core.globals;
    const three = (at: number): string => [g[at], g[at + 1], g[at + 2]].map((v) => v.toFixed(2)).join(' ');
    const sun = this.sun, shadow = sun?.shadow.camera;
    const from = shadow ? shadow.position.toArray().map((v) => v.toFixed(1)).join(' ') : '';
    const box = shadow && sun ? `; the sun's view ${shadow.left}..${shadow.right} by ${shadow.bottom}..${shadow.top}, `
      + `${shadow.near}..${shadow.far}, zoom ${shadow.zoom}, from ${from}, map ${sun.shadow.mapSize.x}, `
      + `auto ${sun.shadow.autoUpdate}` : '';
    const fog = `fog ${g[GLOBALS.ambient + 3]} (${g[GLOBALS.hemiSky + 3].toFixed(4)}, ${g[GLOBALS.hemiGround + 3].toFixed(1)})`;
    return box + `sun from ${three(GLOBALS.sunDir)} colour ${three(GLOBALS.sunColor)}`
      + `${g[GLOBALS.fogColor + 3] ? ', shadowed' : ''}; `
      + `flat ${three(GLOBALS.ambient)}; sky ${three(GLOBALS.hemiSky)} over ground ${three(GLOBALS.hemiGround)}; `
      + `${g[GLOBALS.sunDir + 3]} point lights; ${fog} colour ${three(GLOBALS.fogColor)}`;
  }
}
