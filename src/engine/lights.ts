// The frame's lights written to the engine's globals: the sky's and the flat light summed, the sun chosen, each point
// light of the scene and of the shown place, and the village's lamps with the shelter they light their own side of.
import * as THREE from 'three';
import { lampList, lampShadowsAllowed, LAMPS_MOST } from '../core/lamps';
import type { Taking } from './lampShadows';
import { HALL, TERRACE } from '../data/village';
import type { Core } from './core';
import { GLOBALS, TUNE, type Lit } from './globals';

const MAX_POINTS = 32;
/** the lights that take away what a lamp lit behind a mover (the engine's `takers`) */
const TAKERS = 2;
const v3 = new THREE.Vector3();

/** how far into the hall's walls the shelter reaches past their inner faces (m; the walls are 0.6 thick) */
export const SHELTER_INTO_WALLS = 0.3;

/** The shelter as the engine reads it: the hall's box (its least x and z, its most) reaching `SHELTER_INTO_WALLS`
 *  into its walls, and its walls' tops. */
export function shelterBox(): [number, number, number, number, number] {
  // (its box is the walls' inner faces: a pixel of a face fell inside it or out by the rounding of where it
  // lies, lit row by row as the hall's inside and as the square, the back wall striped grey. From play: "hall
  // walls are z-fighting or smth like that". It reaches half way into the walls)
  // (its walls' tops: over them is the hall's roof from outside, which stood black from above, sheltered from
  // the sun it's under. From play: "top down view wall/roof thinning is broken")
  return [lampList[0] - SHELTER_INTO_WALLS, lampList[1] - SHELTER_INTO_WALLS, lampList[2] + SHELTER_INTO_WALLS,
    lampList[3] + SHELTER_INTO_WALLS, TERRACE.high + HALL.wallHigh];
}

export class Lights implements Lit {
  /** the point lights written this frame */
  points = 0;
  /** the frame's sun: the strongest directional light met */
  sun: THREE.DirectionalLight | null = null;

  /** a lamp's place among the maps of the lamps' shadows, -1 for none (`lampShadows.ts`; set by the bridge) */
  lampSlot: (lamp: number) => number = () => -1;
  /** how far a lamp reaches in the frame's own loop: all its reach, or as near as its baked light leaves it
   *  (`lightCache.ts`; set by the bridge) */
  lampReach: (lamp: number, reach: number) => number = (_lamp, reach) => reach;
  /** the lamps a mover stands by, each with its map of the movers (`lampShadows.ts` `taking`; set by the bridge) */
  lampTaking: () => readonly Taking[] = () => [];
  /** how far a light of the scene's own reaches in the frame's loop: its own reach, or as near as its baked light
   *  leaves it (`lightCache.ts`; set by the bridge) */
  ownReach: (light: THREE.PointLight) => number = (light) => light.distance;
  /** one of the place's own lights' place among the maps of the lamps' shadows, -1 for none (`lampShadows.ts`
   *  `ownSlot`; set by the bridge) */
  ownSlot: (light: THREE.PointLight) => number = () => -1;

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
      if (!TUNE.points || !TUNE.ownPoints) return;
      if (this.points === MAX_POINTS) { this.core.skip('point light past 32'); return; }
      const point = light as THREE.PointLight, at = GLOBALS.points + this.points * 8;
      // (asked of the light itself: one the game hides from three, `shownPointLights`, has its matrices left as
      // they stood when it was hidden)
      point.getWorldPosition(v3);
      g[at] = v3.x; g[at + 1] = v3.y; g[at + 2] = v3.z; g[at + 3] = this.ownReach(point);
      // (its decay, and a hundred for each place up to its own among the lamps' maps where it casts the shadow of
      // what stands still round it: the engine's lit shader takes the two apart)
      const slot = lampShadowsAllowed() && TUNE.lampShadows > 0 ? this.ownSlot(point) : -1;
      g[at + 4] = c.r * by; g[at + 5] = c.g * by; g[at + 6] = c.b * by;
      g[at + 7] = Math.min(point.decay, 99) + (slot >= 0 ? 100 * (slot + 1) : 0);
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
    const shelter = shelterBox();
    g.set(shelter.slice(0, 4), GLOBALS.shelter);
    g[GLOBALS.shelter + 4] = TUNE.shelterSky;
    g[GLOBALS.shelter + 5] = shelter[4];
    let lit = 0;
    const shadowed = lampShadowsAllowed() && TUNE.lampShadows > 0;
    for (let lamp = 0; TUNE.points && lamp < LAMPS_MOST && this.points < MAX_POINTS; lamp++) {
      const place = (1 + lamp * 2) * 4, light = place + 4;
      if (lampList[light + 3] === 0) continue;
      const at = GLOBALS.points + this.points * 8;
      // (a profile's: a baked lamp's light near it left out, what the loop still works out of it)
      if (!TUNE.nearLamps && this.lampReach(lamp, lampList[place + 3]) < lampList[place + 3]) continue;
      g.set(lampList.subarray(place, place + 4), at);
      g[at + 3] = this.lampReach(lamp, g[at + 3]);
      g.set(lampList.subarray(light, light + 3), at + 4);
      // (a code: which side of the shelter it lights, 2 what's under it and 1 what isn't, and four times one
      // more than its place among the maps of the lamps' shadows, none while they aren't drawn)
      // (none either where the quality level reads no lamp's shadow: read at every level, a phone at Very low went
      // from 15 ms a frame on its GPU to 50 to 69 as he walked into the hall, its lamps' sixteen reads a pixel each;
      // a report from play, DGAP-G8SJ)
      const slot = shadowed ? this.lampSlot(lamp) : -1;
      g[at + 7] = -((lampList[light + 3] > 0 ? 2 : 1) + 4 * (slot + 1));
      this.points++;
      lit++;
    }
    // (and for each lamp a mover stands by, a light that lights nothing: where a mover stands between it takes away
    // what the lamp lit, the loop's light or the baked. Its lamp whole: its place, its full reach, its colour now)
    // (in a place of their own after the frame's 32, which the village's lamps and its places' lights fill)
    g.fill(0, GLOBALS.takers, GLOBALS.takers + TAKERS * 8);
    for (const [k, { lamp, slot }] of (shadowed && TUNE.points ? this.lampTaking() : []).slice(0, TAKERS).entries()) {
      const place = (1 + lamp * 2) * 4, light = place + 4;
      const at = GLOBALS.takers + k * 8;
      g.set(lampList.subarray(place, place + 4), at);
      g.set(lampList.subarray(light, light + 3), at + 4);
      g[at + 7] = -((lampList[light + 3] > 0 ? 2 : 1) + 4 * (slot + 1));
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

  /** A harness's: the last frame's point lights as the globals hold them, a line each: where, how far it
   *  reaches (m; 0 as far as it's seen), its light at its brightest channel, and its kind (a lamp's code under 0,
   *  else the decay of a light of the scene's own). */
  pointLines(): string[] {
    const g = this.core.globals;
    const lines: string[] = [];
    for (let k = 0; k < this.points; k++) {
      const at = GLOBALS.points + k * 8;
      const where = [g[at], g[at + 1], g[at + 2]].map((v) => v.toFixed(1)).join(' ');
      const bright = Math.max(g[at + 4], g[at + 5], g[at + 6]).toFixed(1);
      const kind = g[at + 7] < 0 ? `a lamp (code ${-g[at + 7]})` : `the scene's own, decay ${g[at + 7]}`;
      lines.push(`at ${where}, reaching ${g[at + 3].toFixed(1)} m, ${bright} bright, ${kind}`);
    }
    return lines;
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
