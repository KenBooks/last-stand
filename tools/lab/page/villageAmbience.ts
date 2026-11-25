// `lab village --only ambienceHeard` (#745, "Add Day and Night Ambient Sound Effects (Birds, Crickets, Rustling
// Leaves, Fire Crackling)"): the levels the ambience asks of its layers (`ambienceNow` in `core/ambience.ts`, as
// `main.ts` asks them each frame) read at noon and at midnight on the square, at noon beside the campfire and the
// fountain, and inside the library beside its hearth: the day's forest by day alone and the night's by night alone,
// muffled indoors, a fire louder beside it than on the square, the fountain's water beside it than by the campfire,
// and a house's hearth heard inside it. Every place's fires are counted too (`FIRES` in `world/fire.ts`), as what
// `firesHeard` hears from (from Kenneth: "include all the fire sounds for all fire objects in the game, in rounds,
// village houses, etc."). What they sound like is `lab sound ambienceDay,ambienceNight,ambienceFire,
// ambienceFountain`; their loops' seams are `ambienceSeams`. `canary` holds noon for the midnight read too (the hour
// never reaching the ambience): its night must be missed.
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { groundHeight } from '../../../src/world/ground';
import { holdHour, heldHour } from '../../../src/game/clock';
import { ambienceNow } from '../../../src/core/ambience';
import { FIRES } from '../../../src/world/fire';
import { enterRoom, leaveRoom } from '../../../src/game/rooms';
import { CAMPFIRE } from '../../../src/data/village';
import type { LightsChecked } from './villageLights';

/** the frames each stand is held before it's read */
const SETTLE = 30;
/** where he stands on the square, and beside the campfire (m off its middle, along x) */
const SQUARE: [number, number] = [0, 4.5];
const BY_FIRE = 2;
/** where he stands by the fountain (it stands at the square's middle, its basin 2.2 m across) */
const BY_FOUNTAIN: [number, number] = [0, 3];
/** the house with a hearth he goes into, and how far from the hearth's middle he stands, towards the room's */
const HEARTH_ROOM = 'library';
const BY_HEARTH = 2;
/** a layer under this is silent, over it heard */
const HEARD = 0.001;

/** The layers' levels as asked at a stand. */
type Levels = ReturnType<typeof ambienceNow>;

/** He stands at (x, z) at `hour`, settled; the levels the ambience asks then. */
async function readAt(lab: Lab, [x, z]: [number, number], hour: number): Promise<Levels> {
  holdHour(hour);
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(x, groundHeight(x, z), z), 0);
  await lab.step(SETTLE);
  const now = ambienceNow();
  return { ...now, fires: [...now.fires], firePans: [...now.firePans] };
}

/** A stand's levels said in a line. */
function said(where: string, levels: Levels): string {
  const forest = `day ${levels.day.toFixed(3)}, night ${levels.night.toFixed(3)}`;
  const water = `water ${levels.water.toFixed(3)} (pan ${levels.waterPan.toFixed(2)})`;
  const fires = levels.fires.map((level, i) => `${level.toFixed(3)} (pan ${levels.firePans[i].toFixed(2)})`);
  return `ambience ${where}: ${forest}, ${water}, fires ${fires.join(', ')}`;
}

/** The nearest fire's level. */
const fireOf = (levels: Levels): number => levels.fires[0];

/** The top of what `object` is under, short of the scene (a place's group, the hall's, a room's). */
function placeOf(object: THREE.Object3D): THREE.Object3D {
  let o = object;
  while (o.parent && o.parent !== G.scene) o = o.parent;
  return o;
}

/** Every fire built, counted by the place it was built into (by the place's group's name). */
function firesByPlace(): Map<string, number> {
  const counts = new Map<string, number>();
  for (const fire of FIRES) {
    const name = placeOf(fire.of).name || 'unnamed';
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return counts;
}

/** Inside the library at noon, `BY_HEARTH` m off its hearth towards the room's middle: the levels then. */
async function readByHearth(lab: Lab): Promise<Levels | null> {
  await enterRoom(HEARTH_ROOM);
  await lab.until(() => G.arena.room === HEARTH_ROOM, 600, `the ${HEARTH_ROOM}'s room shown`);
  await lab.step(SETTLE);
  // (the room's alone is shown: every place's group but its is hidden)
  const hearth = FIRES.find((fire) => isShown(fire.of));
  if (!hearth) return null;
  const at = hearth.at.clone().applyMatrix4(hearth.of.matrixWorld);
  const middle = new THREE.Vector3();
  new THREE.Box3().setFromObject(placeOf(hearth.of)).getCenter(middle);
  const way = Math.atan2(middle.x - at.x, middle.z - at.z);
  const stand: [number, number] = [at.x + Math.sin(way) * BY_HEARTH, at.z + Math.cos(way) * BY_HEARTH];
  return readAt(lab, stand, 12);
}

/** Whether `object` and all it's under are shown. */
function isShown(object: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = object; o; o = o.parent) if (!o.visible) return false;
  return true;
}

/** The problems with the levels read: each layer where it belongs. */
function problemsOf(noon: Levels, night: Levels, fire: Levels, fountain: Levels, hearth: Levels | null): string[] {
  const problems: string[] = [];
  if (noon.day < HEARD) problems.push('ambience: no day\'s forest at noon');
  if (noon.night >= HEARD) problems.push('ambience: the night\'s forest at noon');
  if (night.night < HEARD) problems.push('ambience: no night\'s forest at midnight');
  if (night.day >= HEARD) problems.push('ambience: the day\'s forest at midnight');
  if (fireOf(fire) <= fireOf(noon) * 2 || fireOf(fire) < HEARD) {
    problems.push('ambience: the campfire no louder beside it than on the square');
  }
  if (fountain.water <= fire.water * 2 || fountain.water < HEARD) {
    problems.push('ambience: the fountain no louder beside it than by the campfire');
  }
  if (!hearth) problems.push(`ambience: no fire shown in the ${HEARTH_ROOM}`);
  else {
    if (fireOf(hearth) < HEARD) problems.push(`ambience: the ${HEARTH_ROOM}'s hearth not heard beside it`);
    if (hearth.day >= noon.day) problems.push(`ambience: the forest no softer inside the ${HEARTH_ROOM}`);
    if (hearth.water >= HEARD) problems.push(`ambience: the fountain heard inside the ${HEARTH_ROOM}`);
  }
  return problems;
}

/** The problems with the fires counted: the village's campfire, a house's hearth, the hall's torches and each
 *  battleground built has some. */
function fireCountProblems(counts: Map<string, number>): string[] {
  const problems: string[] = [];
  const has = (name: string): boolean => (counts.get(name) ?? 0) > 0;
  if (!has('village') && !has('campfire')) problems.push('ambience: no fire counted in the village');
  if (!has('hall')) problems.push('ambience: no fire counted in the hall of heroes');
  for (const biome of ['crypt', 'forest']) {
    const built = G.scene.children.some((child) => child.name === biome);
    if (built && !has(biome)) problems.push(`ambience: no fire counted in the ${biome}, built`);
  }
  return problems;
}

/** The ambience by day, by night, by the campfire, the fountain and a hearth, each layer where it belongs, and every
 *  place's fires counted. */
export async function ambienceHeard(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const was = heldHour();
  try {
    const noon = await readAt(lab, SQUARE, 12);
    const night = await readAt(lab, SQUARE, canary ? 12 : 0);
    const fire = await readAt(lab, [CAMPFIRE[0] + BY_FIRE, CAMPFIRE[1]], 12);
    const fountain = await readAt(lab, BY_FOUNTAIN, 12);
    const hearth = await readByHearth(lab);
    leaveRoom(true);
    await lab.until(() => G.arena.room === null, 600, 'the village shown again');
    const counts = firesByPlace();
    const lines = [
      said('at noon on the square', noon),
      said('at midnight on the square', night),
      said('at noon by the campfire', fire),
      said('at noon by the fountain', fountain),
      hearth ? said(`at noon inside the ${HEARTH_ROOM} by its hearth`, hearth) : `no fire in the ${HEARTH_ROOM}`,
      `fires built, by place: ${[...counts].map(([name, n]) => `${name} ${n}`).join(', ')}`,
    ];
    const problems = [...problemsOf(noon, night, fire, fountain, hearth), ...fireCountProblems(counts)];
    const missedNight = problems.some((problem) => problem.includes('night\'s forest at midnight'));
    if (canary) return { lines, problems: [], caught: missedNight, moments: [] };
    return { lines, problems, caught: null, moments: [] };
  } finally {
    holdHour(was);
    await lab.step(SETTLE);
  }
}
