// `lab rustcheck`: what a first play of the Rust engine's preview found wrong, each held as a check, on the page a
// player gets (the plain address). The owner's reports, in the order they came: every foe of a fight hidden, the
// game stopped for 5 to 20 s at each change of place, a hero stood a pace off his own outline, the hall of heroes
// lit as the square at noon, its roof black from above, a dark rectangle on a battleground's floor, a skill's own
// effects not drawn, and the engine stopped for good by a canvas nothing had drawn on.
import * as THREE from 'three';
import type { Lab, Report } from './lab';
import type { BiomeId } from '../../../src/data/biomes';
import { G } from '../../../src/state';
import { RUST } from '../../../src/engine';
import type { Bridge } from '../../../src/engine/bridge';
import { RUNNING } from '../../../src/core/rendererChoice';
import { sceneSamples } from '../../../src/core/renderer';
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

/** The page is the one a player gets: the engine on the plain address, the pause menu offering it alone. */
function playersPage(): Checked {
  const asked = new URLSearchParams(location.search).get('renderer');
  if (asked) return failed(`the page was booted at ?renderer=${asked}, not the plain address players get`);
  if (!RUNNING.rust || !RUST.bridge) return failed(`the engine isn't drawing: ${RUST.failed || 'not booted'}`);
  const offered = [...document.querySelectorAll('#opt-renderer button')].map((button) => button.textContent);
  if (offered.length !== 1) return failed(`the pause menu offers ${offered.join(', ')}: the engine alone is supported`);
  return passed('the plain address draws by the engine, the pause menu offers it alone');
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
  const { samples, shadowSize } = bridge.qualityNow();
  const engineSamples = samples >= 4 ? 4 : 1;
  if (engineSamples !== asked) return failed(`the engine draws ${samples} samples a pixel, the level asks for ${sceneSamples()}`);
  const map = sun?.shadow.mapSize.x ?? shadowSize;
  if (shadowSize !== map) return failed(`the engine's shadow map is ${shadowSize} a side, the level's ${map}`);
  return passed(`the engine draws as the quality level asks: ${samples} samples a pixel, a shadow map of ${shadowSize}`);
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
      checks.push(await hallFromAbove(lab, bridge));
      checks.push(await house(lab, bridge, command.room as RoomId));
      checks.push(await blankCanvas(lab, bridge));
      await standIn(lab, { biome: command.biome, view: 'third', facing: 0, fresh: true });
      lab.drawing = true;
      await lab.step(5);
      checks.push(placedRight(`the ${command.biome}`));
      checks.push(shelter(bridge, `the ${command.biome}`, false));
      checks.push(await fight(lab, bridge, command.foes));
      checks.push(...await casts(lab, bridge));
    }
  } finally {
    console.error = consoleError;
    lab.drawing = false;
  }
  const problems = checks.flatMap((check) => check.problems);
  for (const line of new Set(said)) problems.push(`said while drawing: ${line.slice(0, 600)}`);
  const pictured = await lab.screen(`the ${G.player.cls.id}'s fight as the check left it`);
  const head = `the Rust engine's check, as the ${G.player.cls.id}: ${checks.length - problems.length} of ${checks.length} hold`;
  return { text: [head, ...checks.map((check) => check.line)].join('\n'), problems, moments: [pictured] };
}
