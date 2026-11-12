// `lab village`'s lamps through the hall's door: the street lamps' light summed frame by frame at midnight, the lit
// shaders' list's and the pool's casting lights' together, as the hero stands at the hall's door, walks in and stands
// inside. The street lamps light what's outside the hall whoever stands where: switched over to the torches at its
// door, they went out as he walked in and came back as he left (from play: "lights turn off when I enter the hall and
// turn back on when I leave the hall, it should not happen"). `canary` puts a street lamp out as he goes in, which
// must be found.
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { holdHour } from '../../../src/game/clock';
import { groundHeight } from '../../../src/world/ground';
import { HALL, TERRACE } from '../../../src/data/village';
import { pooledLights } from '../../../src/fx/lights';
import type { LightsChecked } from './villageLights';

/** the frames he stands at the door, and inside */
const SETTLE = 90;
const INSIDE = 120;
/** how far before the door he stands, and how far in (m) */
const OUT = 3;
const IN = 4;
/** the most the street lamps' light may change from the first frame read, as a share of it */
const MOST_CHANGE = 0.01;
/** how near a pooled light must be to a street lamp to be its (m) */
const AT_LAMP = 0.05;

/** The lit shaders' list, reached through three's own uniforms it's shared from (`core/lamps.ts`), or none. */
function lampList(): Float32Array | undefined {
  return THREE.ShaderLib.standard.uniforms.lamps?.value as Float32Array | undefined;
}

/** The street lamps' light now: each lamp's red in the list, and each pooled light's at a street lamp. */
function streetLight(list: Float32Array): number {
  const lanterns = G.arena.village.lanterns;
  let sum = 0;
  for (let i = 0; i < lanterns.length; i++) sum += list[(2 + i * 2) * 4];
  for (const light of pooledLights()) {
    if (lanterns.some((lantern) => lantern.distanceTo(light.position) < AT_LAMP)) {
      sum += light.color.r * light.intensity;
    }
  }
  return sum;
}

/** The hero stood at (x, z) on the terrace, his walk let go. */
function standAt(x: number, z: number): void {
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(x, groundHeight(x, z), z), Math.PI);
}

/** The street lamps at midnight as the hero goes into the hall: their light the same every frame. */
export async function lampsThroughTheDoor(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const list = lampList();
  if (!list) {
    return { lines: ['lamps through the door: no lamps\' list in this tree'], problems: [], caught: null, moments: [] };
  }
  holdHour(0);
  try {
    standAt(TERRACE.x, HALL.door + OUT);
    await lab.step(SETTLE);
    const first = streetLight(list);
    if (first <= 0) throw new Error('lab: village: no street lamp lit at midnight');
    let most = 0;
    let mostAt = 0;
    const read = (frame: number): void => {
      const change = Math.abs(streetLight(list) - first) / first;
      if (change > most) {
        most = change;
        mostAt = frame;
      }
    };
    standAt(TERRACE.x, HALL.door - IN);
    if (canary) list[(2 + 0) * 4 + 3] = 0;
    await lab.step(INSIDE, undefined, (frame) => {
      if (canary) list[(2 + 0) * 4] = 0;
      read(frame);
    });
    const inHall = G.player.pos.z < HALL.inFront;
    if (!inHall) throw new Error('lab: village: the hero never stood inside the hall');
    const line = `lamps through the door: the street lamps' light changed at most ${(most * 100).toFixed(1)}% `
      + `(frame ${mostAt} inside)`;
    const changes = most > MOST_CHANGE;
    const problems = changes && !canary ? [`${line}: the street lamps change as he goes into the hall`] : [];
    return { lines: [line], problems, caught: canary ? changes : null, moments: [] };
  } finally {
    holdHour(null);
  }
}
