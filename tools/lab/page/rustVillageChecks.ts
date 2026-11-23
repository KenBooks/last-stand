// `lab rustcheck`'s checks of the village under the Rust engine: its lamps' shadows drawn, its light cache, the
// hall's shelter and its roof from above, the sun's shadow in turns, a house walked into lit by its own lights.
import { heroLights } from '../../../src/entities/player';
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { RUST } from '../../../src/engine';
import type { Bridge } from '../../../src/engine/bridge';
import { setShadowInTurns, shadowInTurnsNow } from '../../../src/core/renderer';
import { HALL, TERRACE } from '../../../src/data/village';
import { enterRoom, leaveRoom, roomHere } from '../../../src/game/rooms';
import type { RoomId } from '../../../src/data/houses';
import { frames, THREE_DRAWS_MOST } from './rustFrames';
import { type Checked, failed, passed } from './rustPixels';

/** a cell of the light cache on the GPU, bytes, and the most its volume may take, MB */
const CACHE_CELL_BYTES = 16;
const CACHE_MOST_MB = 12;
/** the fewest lamps of the village with a shadow drawn (it has over twenty) */
const LAMPS_SHADOWED_LEAST = 12;
/** the frames the lamps' shadows are given to be drawn in, a lamp a frame (24 lamps at the most) */
const LAMP_FRAMES = 40;
/** the least of the scene's own still lights the village's volume holds (two braziers, the portals), how far one of
 *  them reaches in the frame's loop once baked (m), and the most lights of the scene's own left whole there (the
 *  campfire, which dims by the hour on its own) */
const OWN_BAKED_LEAST = 4;
const OWN_NEAR = 3;
const OWN_WIDE_MOST = 1;
/** the longest a frame may take at a change of place, on a page whose places are warm (ms): from play, 20 s */
const PLACE_CHANGE_MOST = 1500;
/** the frames the sun's shadow is watched over, drawn in turns, and those of its canary */
const TURN_FRAMES = 40, TURN_CANARY_FRAMES = 12;
/** the fewest point lights a house is lit by inside (each has ten: its candles, lanterns, hearth, chandelier) */
const ROOM_LIGHTS_LEAST = 4;

/** The village's lamps each with a shadow of what stands round it: none, they shone through every wall and post
 *  (from play: "and lights have no shadows"). */
export async function lampShadows(lab: Lab, bridge: Bridge): Promise<Checked> {
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    for (let frame = 0; frame < LAMP_FRAMES && bridge.lampShadowsNow().waiting > 0; frame++) await lab.step(1);
  } finally {
    lab.drawing = drawing;
  }
  const { drawn, waiting } = bridge.lampShadowsNow();
  if (waiting) return failed(`the lamps' shadows: ${waiting} lamps still wait after ${LAMP_FRAMES} frames`);
  if (drawn < LAMPS_SHADOWED_LEAST) return failed(`the lamps' shadows: ${drawn} lamps' drawn: they shine through walls`);
  return passed(`the lamps' shadows drawn for ${drawn} lamps`);
}

/** The village's still lamps in the engine's light cache (`src/engine/lightCache.ts`): most of them baked, within
 *  what its volume may take of the GPU's memory, and each left to the frame's own loop near itself alone. */
export function lightCache(bridge: Bridge): Checked {
  const cache = bridge.lightCacheNow();
  const megabytes = cache.cells * CACHE_CELL_BYTES / 1e6;
  if (cache.lamps < LAMPS_SHADOWED_LEAST) return failed(`the light cache: ${cache.lamps} lamps baked`);
  if (megabytes > CACHE_MOST_MB) return failed(`the light cache: ${megabytes.toFixed(1)} MB, ${CACHE_MOST_MB} at the most`);
  // (and the scene's own still lights with them, the hall's braziers and the portals: left to the frame's loop each
  // reached its whole place at every pixel, 5.8 ms of a phone's 25 ms frame in the hall)
  if (cache.own < OWN_BAKED_LEAST) {
    return failed(`the light cache: ${cache.own} of the scene's own still lights baked, ${OWN_BAKED_LEAST} at the least`);
  }
  const wide = bridge.pointLines().filter((line) => /the scene's own/.test(line) && Number(/reaching ([\d.]+)/.exec(line)?.[1]) > OWN_NEAR);
  // (the hero's own two move with him and are never baked: a mage's staff and hand are lit as he stands)
  const heros = Object.values(heroLights()).filter((light) => light.visible && light.intensity > 0).length;
  if (wide.length > OWN_WIDE_MOST + heros) {
    return failed(`the frame's loop: ${wide.length} lights of the scene's own reach past ${OWN_NEAR} m, ${heros} of them `
      + `the hero's (${wide.join('; ')})`);
  }
  return passed(`the light cache: ${cache.lamps} lamps and ${cache.own} of the scene's own lights baked in `
    + `${megabytes.toFixed(1)} MB (cells of ${cache.cell.toFixed(2)} m)`);
}

/** The hall's shelter as the engine has it: set in the village with its walls' height, none in a fight. */
export function shelter(bridge: Bridge, where: string, wanted: boolean): Checked {
  const [minX, minZ, maxX, , , top] = bridge.shelterNow();
  const set = maxX > minX;
  if (set !== wanted) return failed(`${where}: the hall's shelter is ${set ? 'set' : 'not set'} (a sunless box on the floor)`);
  if (!wanted) return passed(`${where}: no shelter left over from the village`);
  const high = TERRACE.high + HALL.wallHigh;
  if (Math.abs(top - high) > 0.01) return failed(`${where}: the shelter reaches ${top.toFixed(1)} m up, over the hall's roof`);
  // (its walls' inner faces well inside it: on its edge, a face was lit as the inside and as the square in stripes)
  const clear = Math.min(TERRACE.x - HALL.inHalf - minX, maxX - (TERRACE.x + HALL.inHalf), HALL.wall - minZ);
  if (clear < 0.1) return failed(`${where}: the hall's inner walls lie ${clear.toFixed(2)} m inside the shelter's edge: striped`);
  return passed(`${where}: the hall's inside sheltered up to its walls' tops (${high.toFixed(1)} m)`);
}

/** The meshes standing inside the hall's walls, under its ceiling, that are hidden (they or what holds them): each
 *  by its material and place. From play's pictures: its columns' iron bands and its torches' brackets weren't drawn
 *  from above, where WebGL draws them. */
function hiddenInHall(): string[] {
  const at = new THREE.Vector3();
  const unseen: string[] = [];
  const shown = (object: THREE.Object3D): boolean => {
    for (let o: THREE.Object3D | null = object; o && o !== G.scene; o = o.parent) if (!o.visible) return false;
    return true;
  };
  G.arena.shownGroup().traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || shown(mesh)) return;
    mesh.getWorldPosition(at);
    const inside = Math.abs(at.x - TERRACE.x) < HALL.inHalf && at.z < HALL.inFront - 1 && at.z > HALL.columnZ[3]
      && at.y > TERRACE.high && at.y < TERRACE.high + HALL.wallHigh - 0.5;
    if (!inside) return;
    const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
    const place = `${at.x.toFixed(1)}, ${at.y.toFixed(1)}, ${at.z.toFixed(1)}`;
    unseen.push(`${mesh.name || mesh.geometry.type} in #${material.color?.getHexString() ?? '?'} at ${place}`);
  });
  return unseen;
}

/** Stood inside the hall, seen from above: what stands over him thins, by the game's own kinds, none left out. */
export async function hallFromAbove(lab: Lab, bridge: Bridge): Promise<Checked> {
  G.player.place(new THREE.Vector3(TERRACE.x, TERRACE.high, HALL.columnZ[1]), Math.PI);
  await lab.step(90);
  const { held, thinning } = bridge.seeKindsNow();
  const past = [...bridge.skipped].filter(([kind]) => kind.startsWith('see-through'));
  if (past.length) return failed(`in the hall from above: ${past[0][1]} things of a see-through kind the engine has no room for`);
  if (!thinning) return failed(`in the hall from above nothing thins over him (${held} kinds held): its roof hides him`);
  const unseen = hiddenInHall();
  if (unseen.length) {
    return failed(`in the hall from above ${unseen.length} of its own things are hidden: ${unseen.slice(0, 4).join('; ')}`);
  }
  return passed(`in the hall from above ${thinning} of the engine's ${held} kinds of see-through thin over him`);
}

/** How many of `frames` frames the game left the sun's shadow out of, and in how many of those the engine drew
 *  its map all the same. */
async function shadowTurns(lab: Lab, bridge: Bridge, frames: number): Promise<{ held: number; drawn: number }> {
  let held = 0;
  let drawn = 0;
  for (let frame = 0; frame < frames; frame++) {
    await lab.step(1);
    if (!bridge.levels.shadowHeld) continue;
    held++;
    if (bridge.stats.shadowDraws > 0) drawn++;
  }
  return { held, drawn };
}

/**
 * The sun's shadow drawn in turns (Very low's every other frame, `shadowInTurns`): on the frames the game leaves
 * it out of, the engine keeps its map and draws no caster again (it drew them every frame at every level). The
 * canary: with the switch off it draws on those frames too.
 */
export async function sunShadowInTurns(lab: Lab, bridge: Bridge): Promise<Checked> {
  const drawing = lab.drawing;
  const asked = shadowInTurnsNow();
  lab.drawing = true;
  setShadowInTurns(true);
  try {
    await lab.step(4);
    const turns = await shadowTurns(lab, bridge, TURN_FRAMES);
    RUST.tune.shadowTurns = 0;
    const every = await shadowTurns(lab, bridge, TURN_CANARY_FRAMES);
    if (!turns.held) return failed('drawn in turns, the game left the sun\'s shadow out of no frame');
    if (turns.drawn) return failed(`the sun's shadow was drawn again in ${turns.drawn} of the ${turns.held} frames left out`);
    if (every.held && !every.drawn) return failed('with the switch off the sun\'s shadow is still kept in its turns');
    return passed(`in turns, the sun's shadow kept in ${turns.held} of ${TURN_FRAMES} frames, no caster drawn in them`);
  } finally {
    RUST.tune.shadowTurns = 1;
    setShadowInTurns(asked);
    lab.drawing = drawing;
  }
}

/** A house walked into, out of and into again: no frame held, three drawing no scene of its own, and inside it
 *  lit by its own lights (its candles, hearth and chandelier: from play, "loads this (broken)", a room in the
 *  dark). */
export async function house(lab: Lab, bridge: Bridge, room: RoomId): Promise<Checked> {
  const drawing = lab.drawing;
  lab.drawing = true;
  const steps: [string, () => void][] = [['in', () => enterRoom(room)], ['out', () => leaveRoom()], ['in again', () => enterRoom(room)]];
  const took: string[] = [];
  const wrong: string[] = [];
  let lights = 0;
  try {
    for (const [name, change] of steps) {
      change();
      const { longest, three } = await frames(lab, 6);
      took.push(`${name} ${longest.toFixed(0)} ms`);
      if (longest > PLACE_CHANGE_MOST) wrong.push(`going ${name} held a frame ${longest.toFixed(0)} ms`);
      if (three > THREE_DRAWS_MOST) wrong.push(`going ${name}, three drew ${three} things of its own in a frame`);
    }
    if (roomHere() !== room) wrong.push(`he never went into the ${room}`);
    lights = bridge.pointsNow();
    if (lights < ROOM_LIGHTS_LEAST) wrong.push(`inside, the engine is lit by ${lights} point lights: its own are missing`);
  } finally {
    leaveRoom();
    lab.drawing = drawing;
  }
  if (wrong.length) return failed(`the ${room}: ${wrong.join('; ')}`);
  return passed(`the ${room}: the longest frame going ${took.join(', ')}; lit by ${lights} point lights inside`);
}
