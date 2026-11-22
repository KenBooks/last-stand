// `lab rustcheck`: what a first play of the Rust engine's preview found wrong, each held as a check, on the page a
// player gets (the plain address). The owner's reports, in the order they came: every foe of a fight hidden, the
// game stopped for 5 to 20 s at each change of place, a hero stood a pace off his own outline, the hall of heroes
// lit as the square at noon, its roof black from above, a dark rectangle on a battleground's floor, a skill's own
// effects not drawn, and the engine stopped for good by a canvas nothing had drawn on.
import { plantedFaults } from './rustFaults';
import { glowGoneInTheFog } from './rustSight';
import * as THREE from 'three';
import type { Lab, Report } from './lab';
import type { BiomeId } from '../../../src/data/biomes';
import { G } from '../../../src/state';
import { RUST } from '../../../src/engine';
import type { Bridge } from '../../../src/engine/bridge';
import { RUNNING } from '../../../src/core/rendererChoice';
import {
  bloomShareNow, overCanvasLeftOut, sceneSamples, sceneSize, setShadowInTurns, shadowInTurnsNow, showOverlays,
} from '../../../src/core/renderer';
import { drawnLabels } from '../../../src/ui/overlay/layer';
import { outlineShown } from '../../../src/ui/overlay/outline';
import { projectionOf } from '../../../src/engine/globals';
import { HALL, TERRACE } from '../../../src/data/village';
import { enterRoom, leaveRoom, roomHere } from '../../../src/game/rooms';
import type { RoomId } from '../../../src/data/houses';
import { SKILL_KEYS } from '../../../src/loot/loadout';
import { standAt } from './draws';
import { standIn } from './light';
import { foesAt } from './death';
import { crowdPlaces } from './crowd';
import { pressing } from './cast';

export interface RustCheckCommand {
  biome: BiomeId;
  /** the house walked into and out of */
  room: string;
  /** foes stood before the hero in the fight */
  foes: number;
}

/** A check's outcome: a line for the report, and what it found wrong. */
interface Checked {
  line: string;
  problems: string[];
}

/** the longest a frame may take at a change of place, on a page whose places are warm (ms): from play, 20 s */
const PLACE_CHANGE_MOST = 1500;
/** the most draws three's own renderer may make a frame under the engine: the overlays over the frame, not a scene */
const THREE_DRAWS_MOST = 40;
/** how far a shown object's place in the world may be from where its own position puts it (m) */
const PLACED_WITHIN = 1e-3;
/** the fewest point lights a house is lit by inside (each has ten: its candles, lanterns, hearth, chandelier) */
const ROOM_LIGHTS_LEAST = 4;
/** how long each skill is held (frames), and how far ahead it's aimed (m) */
const CAST_FRAMES = 50;
const CAST_AHEAD = 8;

const passed = (line: string): Checked => ({ line: `  ok: ${line}`, problems: [] });
const failed = (line: string): Checked => ({ line: `  WRONG: ${line}`, problems: [line] });

/** three's own draws in the frame just drawn (the overlays' alone, under the engine). */
function threeDraws(): number {
  const info = G.renderer.info.render as unknown as { drawCalls?: number; calls: number };
  return info.drawCalls ?? info.calls;
}

/** The next `frames` frames stepped: the longest by the browser's clock (ms), and the most draws three made in one. */
async function frames(lab: Lab, count: number): Promise<{ longest: number; three: number }> {
  const clock = (window as unknown as { __labClock: { realNow: () => number } }).__labClock;
  let longest = 0;
  let three = 0;
  for (let frame = 0; frame < count; frame++) {
    const began = clock.realNow();
    await lab.step(1);
    longest = Math.max(longest, clock.realNow() - began);
    three = Math.max(three, threeDraws());
  }
  return { longest, three };
}

/** The page is the one a player gets: the engine on the plain address, the pause menu with no renderer to
 *  choose (from the owner: "since we only have 1 renderer, we dont need to display an option for it"). */
function playersPage(): Checked {
  const asked = new URLSearchParams(location.search).get('renderer');
  if (asked) return failed(`the page was booted at ?renderer=${asked}, not the plain address players get`);
  if (!RUNNING.rust || !RUST.bridge) return failed(`the engine isn't drawing: ${RUST.failed || 'not booted'}`);
  const offered = [...document.querySelectorAll('#opt-renderer button')].map((button) => button.textContent);
  if (offered.length) return failed(`the pause menu offers ${offered.join(', ')}: there's one renderer, none to choose`);
  // (on the loading screen alone, which is gone from the page by now: from the owner, off the lobby's logo "so that users dont need to stare at it all the time")
  if (document.querySelector('.logo-powered')) return failed('the logo of the lobby says Powered by Bulwark');
  return passed('the plain address draws by the engine, the pause menu has no renderer to choose');
}

/** Every shown object stands where its own position, turn and scale put it under its parent. */
function placedRight(where: string): Checked {
  const expected = new THREE.Matrix4();
  const local = new THREE.Matrix4();
  const off: string[] = [];
  let checked = 0;
  const visit = (object: THREE.Object3D): void => {
    if (!object.visible) return;
    if (object.parent && object.matrixAutoUpdate && object.matrixWorldAutoUpdate) {
      local.compose(object.position, object.quaternion, object.scale);
      expected.multiplyMatrices(object.parent.matrixWorld, local);
      const now = object.matrixWorld.elements;
      const apart = Math.max(...expected.elements.map((value, index) => Math.abs(value - now[index])));
      checked++;
      if (apart > PLACED_WITHIN) off.push(`${object.name || object.type} ${apart.toFixed(3)} m`);
    }
    object.children.forEach(visit);
  };
  visit(G.scene);
  if (off.length) return failed(`${where}: ${off.length} of ${checked} shown objects off their place: ${off.slice(0, 4).join(', ')}`);
  return passed(`${where}: all ${checked} shown objects where their positions put them`);
}

/** The engine drawing with the samples and the sun's shadow map the game's quality level asks for: at its own 4
 *  samples and 2048 whatever the level, a phone at Very low held 35 to 40 frames a second (from play). */
function quality(bridge: Bridge): Checked {
  const asked = sceneSamples() >= 4 ? 4 : 1;
  const sun = G.scene.getObjectByProperty('isDirectionalLight', true) as THREE.DirectionalLight | undefined;
  const { samples, shadowSize, bloomShare } = bridge.levels.now();
  // (and its bloom at the level's share of the pixels: whole at every level, Very low drew a bloom the game
  // draws none of, 4 ms of a phone's 47 ms frame)
  if (bloomShare !== bloomShareNow()) {
    return failed(`the engine's bloom is at ${bloomShare} of the pixels each way, the level's at ${bloomShareNow()}`);
  }
  const engineSamples = samples >= 4 ? 4 : 1;
  if (engineSamples !== asked) return failed(`the engine draws ${samples} samples a pixel, the level asks for ${sceneSamples()}`);
  // (and at the level's pixels: sized by three's own target, it drew the screen's every pixel at every level)
  const canvas = document.getElementById('rust-canvas') as HTMLCanvasElement;
  const wanted = sceneSize(new THREE.Vector2());
  if (canvas.width !== wanted.x || canvas.height !== wanted.y) {
    return failed(`the engine draws ${canvas.width}x${canvas.height}, the level's scene is ${wanted.x}x${wanted.y}`);
  }
  const map = sun?.shadow.mapSize.x ?? shadowSize;
  if (shadowSize !== map) return failed(`the engine's shadow map is ${shadowSize} a side, the level's ${map}`);
  return passed(`the engine draws as the quality level asks: ${samples} samples a pixel, a shadow map of ${shadowSize}`);
}

/** the frames the lamps' shadows are given to be drawn in, a lamp a frame (24 lamps at the most) */
const LAMP_FRAMES = 40;

/** The village's lamps each with a shadow of what stands round it: none, they shone through every wall and post
 *  (from play: "and lights have no shadows"). */
async function lampShadows(lab: Lab, bridge: Bridge): Promise<Checked> {
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
function lightCache(bridge: Bridge): Checked {
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
  if (wide.length > OWN_WIDE_MOST) {
    return failed(`the frame's loop: ${wide.length} lights of the scene's own reach past ${OWN_NEAR} m (${wide.join('; ')})`);
  }
  return passed(`the light cache: ${cache.lamps} lamps and ${cache.own} of the scene's own lights baked in `
    + `${megabytes.toFixed(1)} MB (cells of ${cache.cell.toFixed(2)} m)`);
}
/** the least of the scene's own still lights the village's volume holds (two braziers, the portals), how far one of
 *  them reaches in the frame's loop once baked (m), and the most lights of the scene's own left whole there (the
 *  campfire, which dims by the hour on its own) */
const OWN_BAKED_LEAST = 4;
const OWN_NEAR = 3;
const OWN_WIDE_MOST = 1;
/** a cell of the light cache on the GPU, bytes, and the most its volume may take, MB */
const CACHE_CELL_BYTES = 16;
const CACHE_MOST_MB = 12;
/** the fewest lamps of the village with a shadow drawn (it has over twenty) */
const LAMPS_SHADOWED_LEAST = 12;

/** The engine's view is the camera's own, with what the game sets on it beside its field of view: the hero
 *  selection screen draws the hall to one side of its panel (a view offset), and worked out from the field of
 *  view alone the engine's heroes stood a hero's width off the outline drawn round the one in focus. */
function viewOffsetKept(): Checked {
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 100);
  camera.setViewOffset(1600, 900, 300, 0, 1600, 900);
  camera.updateProjectionMatrix();
  const offset = projectionOf(camera, new THREE.Matrix4()).elements[8];
  if (Math.abs(offset) < 0.1) return failed('a camera\'s view offset is lost on the engine: its frame stands off three\'s overlays');
  return passed('the engine\'s view keeps a camera\'s view offset (the hero selection screen\'s)');
}

/** Seen through his eyes, the hero's arms and what they hold are drawn (the game's pass of their own: from play,
 *  "no warrior weapon in first person"). */
async function armsThroughTheEyes(lab: Lab, bridge: Bridge, biome: BiomeId): Promise<Checked> {
  // (stood through his eyes as the lab stands a hero in a view: the view switched alone, his arms kept the world's)
  await standIn(lab, { biome, view: 'first', facing: 0, fresh: true });
  lab.drawing = true;
  await lab.step(10);
  const arms = bridge.stats.arms;
  // (a hero with no lens of his arms' own, the mage, has them drawn among the world's: nothing to hold here)
  if (!G.player.model.armsFov) return passed('through his eyes his arms are drawn among the world, with no lens of their own');
  if (!arms) return failed('through his eyes none of his arms or what they hold is drawn by the engine');
  return passed(`through his eyes ${arms} meshes of his arms and what they hold drawn by their own view`);
}

/** The hall's shelter as the engine has it: set in the village with its walls' height, none in a fight. */
function shelter(bridge: Bridge, where: string, wanted: boolean): Checked {
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

/** Stood inside the hall, seen from above: what stands over him thins, by the game's own kinds, none left out. */
async function hallFromAbove(lab: Lab, bridge: Bridge): Promise<Checked> {
  G.player.place(new THREE.Vector3(TERRACE.x, TERRACE.high, HALL.columnZ[1]), Math.PI);
  await lab.step(90);
  const { held, thinning } = bridge.seeKindsNow();
  const past = [...bridge.skipped].filter(([kind]) => kind.startsWith('see-through'));
  if (past.length) return failed(`in the hall from above: ${past[0][1]} things of a see-through kind the engine has no room for`);
  if (!thinning) return failed(`in the hall from above nothing thins over him (${held} kinds held): its roof hides him`);
  return passed(`in the hall from above ${thinning} of the engine's ${held} kinds of see-through thin over him`);
}

/**
 * In the hall from above: what's see-through and thinned by nothing is drawn solid, with what's opaque (the
 * village's walls were drawn blended, after everything, the farthest first: 2.6 ms of the square's 19 ms frame at
 * High as a phone), and the heroes' pieces cast their shadows from fewer triangles. The canary: with the switch
 * off none is drawn solid.
 */
async function solidAndCoarse(lab: Lab, bridge: Bridge): Promise<Checked> {
  await lab.step(2);
  const { solid } = bridge.stats;
  let casters = bridge.stats.casters;
  // (the shadow's fewer triangles are made a slice a frame: waited for)
  for (let frame = 0; frame < 600 && !casters; frame++) {
    await lab.step(1);
    casters = bridge.stats.casters;
  }
  RUST.tune.solidSee = 0;
  await lab.step(2);
  const blended = bridge.stats.solid;
  RUST.tune.solidSee = 1;
  await lab.step(2);
  if (!solid) return failed('nothing see-through is drawn solid: the village\'s walls blended, after everything');
  if (blended) return failed(`with the switch off ${blended} see-through records are still drawn solid`);
  if (!casters) return failed('no piece of a hero\'s casts from fewer triangles: every triangle in the shadow');
  return passed(`${solid} see-through records drawn solid, ${casters} of the heroes' pieces cast from fewer triangles`);
}

/**
 * three's canvas lies over the engine's for the world's labels and the outline alone: with none to draw it's left
 * out of the page's frame (no opacity: the browser lays no second canvas of the screen's pixels over the first),
 * and it's back the frame one is. The overlays hidden, as the profiler hides them, stand for none to draw.
 */
async function overCanvas(lab: Lab): Promise<Checked> {
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    await lab.step(3);
    const none = drawnLabels().length === 0 && !outlineShown();
    const shown = `${drawnLabels().length} labels${outlineShown() ? ' and an outline' : ''}`;
    if (overCanvasLeftOut() !== none) {
      return failed(`with ${shown} to draw, three's canvas is ${overCanvasLeftOut() ? 'left out' : 'laid over the frame'}`);
    }
    showOverlays(false);
    await lab.step(2);
    const hidden = overCanvasLeftOut() && G.renderer.domElement.style.opacity === '0';
    showOverlays(true);
    await lab.step(2);
    if (!hidden) return failed('with no overlay to draw three\'s canvas is still laid over the engine\'s each frame');
    if (overCanvasLeftOut() !== none) return failed('three\'s canvas didn\'t come back as the overlays did');
    return passed(`three's canvas left out of the page's frame with no overlay to draw, back with one (${shown} now)`);
  } finally {
    showOverlays(true);
    lab.drawing = drawing;
  }
}

/**
 * In the hall, its braziers' flames in view: drawn by the engine's pass at a quarter of the scene's pixels
 * (what costs by its pixels, a volume marched at each: 7 ms of a phone's frame at full size). The canary: with
 * the switch off they're drawn with the scene.
 */
async function flamesAtFewerPixels(lab: Lab, bridge: Bridge): Promise<Checked> {
  if (bridge.levels.now().samples >= 4) return passed('at four samples a pixel the flames are drawn with the scene');
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    await lab.step(3);
    const low = bridge.stats.lowDraws;
    RUST.tune.lowRes = 0;
    await lab.step(2);
    const whole = bridge.stats.lowDraws;
    if (!low) return failed('no flame is drawn at fewer pixels: each marched at every pixel of the scene\'s it covers');
    if (whole) return failed(`with the switch off ${whole} draws are still at fewer pixels`);
    return passed(`${low} draws of the flames at a quarter of the scene's pixels, laid over it`);
  } finally {
    RUST.tune.lowRes = 1;
    lab.drawing = drawing;
  }
}

/** the frames the sun's shadow is watched over, drawn in turns, and those of its canary */
const TURN_FRAMES = 40, TURN_CANARY_FRAMES = 12;

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
async function sunShadowInTurns(lab: Lab, bridge: Bridge): Promise<Checked> {
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
async function house(lab: Lab, bridge: Bridge, room: RoomId): Promise<Checked> {
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

/** A canvas nothing has drawn on, shown as a map: the engine draws on after it. */
async function blankCanvas(lab: Lab, bridge: Bridge): Promise<Checked> {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const map = new THREE.CanvasTexture(canvas);
  const card = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ map }));
  card.position.copy(G.player.pos).add(new THREE.Vector3(0, 3, 0));
  G.scene.add(card);
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    await lab.step(3);
  } catch (error) {
    return failed(`a blank canvas as a map stopped the engine: ${String(error).slice(0, 200)}`);
  } finally {
    lab.drawing = drawing;
    G.scene.remove(card);
    map.dispose();
  }
  if (bridge.stats.draws < 10) return failed(`after a blank canvas as a map the engine drew ${bridge.stats.draws} things`);
  return passed('a canvas nothing has drawn on is taken as a map');
}

/** Every foe of the fight is handed to the engine, and three draws none of the scene. */
async function fight(lab: Lab, bridge: Bridge, foes: number): Promise<Checked> {
  const spots = crowdPlaces(foes, G.player.pos, G.player.facing);
  const standing = await foesAt(lab, spots, spots.map(() => 1));
  const drawing = lab.drawing;
  lab.drawing = true;
  bridge.watched = new Set();
  let three = 0;
  try {
    three = (await frames(lab, 4)).three;
  } finally {
    lab.drawing = drawing;
  }
  const watched = bridge.watched;
  bridge.watched = null;
  const hidden = standing.filter((foe) => {
    let drawn = false;
    foe.obj.traverse((part) => { drawn ||= watched.has(part); });
    return !drawn;
  });
  if (hidden.length) return failed(`${hidden.length} of ${standing.length} foes aren't drawn by the engine (${hidden[0].type})`);
  if (three > THREE_DRAWS_MOST) return failed(`in the fight three drew ${three} things of its own in a frame`);
  return passed(`all ${standing.length} foes drawn by the engine, ${bridge.stats.draws} draws; three's own ${three}`);
}

/** Each skill on the hero's keys held in turn: nothing of it left undrawn. */
async function casts(lab: Lab, bridge: Bridge): Promise<Checked[]> {
  const hero = G.player;
  const drawing = lab.drawing;
  const checked: Checked[] = [];
  lab.drawing = true;
  try {
    for (const key of SKILL_KEYS) {
      const def = hero.skillAt(key)?.def;
      if (!def) continue;
      const ahead = new THREE.Vector3(Math.sin(hero.facing), 0, Math.cos(hero.facing)).multiplyScalar(CAST_AHEAD);
      const aim = hero.pos.clone().add(ahead);
      const undrawn = new Map<string, number>();
      const made = RUST.pipelines.made;
      for (let frame = 0; frame < CAST_FRAMES; frame++) {
        hero.cooldowns.clear();
        hero.energy = hero.stats.maxEnergy;
        hero.life = hero.stats.maxLife;
        // (let go for the last third: a drawn shot's arrow and an aimed skill's cast come as its key lifts)
        await lab.step(1, () => pressing(key, aim, frame < CAST_FRAMES * 2 / 3));
        for (const [kind, count] of bridge.skipped) undrawn.set(kind, Math.max(undrawn.get(kind) ?? 0, count));
      }
      const left = [...undrawn].map(([kind, count]) => `${kind} ${count}`).join(', ');
      // (a pipeline first asked for as a skill is cast was a hold of 2 to 4 s in play: all are to be made by
      // the warm-ups, under a loading bar)
      const late = RUST.pipelines.made - made;
      const name = `${hero.cls.id}'s ${def.name} (${key})`;
      if (left) checked.push(failed(`${name}: not drawn by the engine: ${left}`));
      else if (late) checked.push(failed(`${name}: ${late} pipelines first asked for as it was cast, not warmed`));
      else checked.push(passed(`${name} drawn whole, with pipelines made before it`));
      await lab.step(20, () => ({ aim }));
    }
  } finally {
    lab.drawing = drawing;
  }
  return checked;
}

export async function rustCheck(lab: Lab, command: RustCheckCommand): Promise<Report> {
  const bridge = RUST.bridge;
  const said: string[] = [];
  const consoleError = console.error;
  console.error = (...parts: unknown[]) => {
    said.push(parts.map(String).join(' '));
    consoleError(...parts);
  };
  const checks: Checked[] = [playersPage()];
  try {
    if (bridge) {
      await standAt(lab, { biome: command.biome, view: 'top', village: true, hour: 12 });
      lab.drawing = true;
      await lab.step(5);
      checks.push(placedRight('the village'));
      checks.push(shelter(bridge, 'the village', true));
      checks.push(quality(bridge));
      checks.push(viewOffsetKept());
      checks.push(await lampShadows(lab, bridge));
      checks.push(lightCache(bridge));
      checks.push(await glowGoneInTheFog(lab));
      checks.push(await hallFromAbove(lab, bridge));
      checks.push(await solidAndCoarse(lab, bridge));
      checks.push(await flamesAtFewerPixels(lab, bridge));
      checks.push(await sunShadowInTurns(lab, bridge));
      checks.push(await overCanvas(lab));
      checks.push(await house(lab, bridge, command.room as RoomId));
      checks.push(await blankCanvas(lab, bridge));
      await standIn(lab, { biome: command.biome, view: 'third', facing: 0, fresh: true });
      lab.drawing = true;
      await lab.step(5);
      checks.push(placedRight(`the ${command.biome}`));
      checks.push(shelter(bridge, `the ${command.biome}`, false));
      checks.push(await fight(lab, bridge, command.foes));
      checks.push(...await casts(lab, bridge));
      checks.push(await armsThroughTheEyes(lab, bridge, command.biome));
    }
  } finally {
    console.error = consoleError;
    lab.drawing = false;
  }
  // (last, with the checks' own ear off the console: a plant says a panic there)
  if (bridge) {
    lab.drawing = true;
    const faults = await plantedFaults(lab);
    lab.drawing = false;
    checks.push(faults.problems.length ? { line: `  WRONG: ${faults.line}`, problems: faults.problems } : passed(faults.line));
  }
  const problems = checks.flatMap((check) => check.problems);
  for (const line of new Set(said)) problems.push(`said while drawing: ${line.slice(0, 600)}`);
  const pictured = await lab.screen(`the ${G.player.cls.id}'s fight as the check left it`);
  const head = `the Rust engine's check, as the ${G.player.cls.id}: ${checks.length - problems.length} of ${checks.length} hold`;
  return { text: [head, ...checks.map((check) => check.line)].join('\n'), problems, moments: [pictured] };
}
