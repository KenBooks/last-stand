// `lab roomwarm`: the warm-ups behind the lobby drawing their places while the hero stands in a house's room (Odo's
// shop). Each warm-up that draws another place draws it in the shown one's stead (`Swap` in `src/core/shaders.ts`)
// and must hide what's shown as it draws and put back what it found. Before #746 one put the village back on
// whatever it was, so a warm-up that ran on after the door was used left the village drawn under the room, its
// fountain in the middle of the shop. Every part the warm-ups draw a place by (`placeSwaps` in `src/game/warmup.ts`:
// each battleground built, the hall of heroes' room, each house's room) is built as the warm-ups build it and drawn
// by the game's own `warmUp`, with the hero inside: at its draw its own place must be the only one shown, and after
// it the arena's own check (`placesWrong` in `src/world/arena.ts`, which dev builds run every frame) must find the
// shop alone shown.
import type * as THREE from 'three';
import type { Lab, Pictured, Report } from './lab';
import { G } from '../../../src/state';
import { BIOME_IDS } from '../../../src/data/biomes';
import { outsideOf, type RoomId } from '../../../src/data/houses';
import { enterRoom } from '../../../src/game/rooms';
import { placeSwaps } from '../../../src/game/warmup';
import { warmUp, type Swap } from '../../../src/core/shaders';
import { sceneTarget } from '../../../src/core/renderer';
import { groundHeight } from '../../../src/world/ground';
import { toVillage } from './village';

/** `--canary`: the first part's swap hiding the village alone, as before #746 (the shop drawn with it), and the
 *  village left shown after it: both caught. */
export interface RoomWarmOptions {
  canary: boolean;
}

/** the room walked into */
const ROOM: RoomId = 'merchant';
/** the most frames the shop's door may take to open, and the frames a stand settles for */
const DOOR_FRAMES = 600;
const SETTLE = 15;

/** Every place that may stand where the player is, each with its name: the village, each battleground built, the
 *  hall of heroes' room, each house's room. */
function everyPlace(): { name: string; group: THREE.Object3D }[] {
  const biomes = BIOME_IDS.filter((id) => G.arena.biomeBuilt(id)).map((id) => ({ name: id, group: G.arena.groupOf(id) }));
  const rooms = Object.values(G.arena.rooms ?? {}).map((room) => ({ name: `room ${room.id}`, group: room.group }));
  return [{ name: 'village', group: G.arena.groupOf('village') }, ...biomes, { name: 'hall', group: G.arena.hallGroup },
    ...rooms];
}

/** The places shown now, by name. */
const shownPlaces = (): string[] => everyPlace().filter((place) => place.group.visible).map((place) => place.name);

/**
 * `swap` drawn by the game's own warm-up, the places shown at each of its renders read: the scene's
 * `onBeforeRender` wrapped for the draw (the cells' culling is hooked there, so it's called on as it was).
 */
async function drawnWith(swap: Swap | undefined): Promise<string[][]> {
  const seen: string[][] = [];
  const scene = G.scene;
  const before = scene.onBeforeRender;
  scene.onBeforeRender = function (...args) {
    seen.push(shownPlaces());
    before.apply(this, args);
  };
  try {
    await warmUp(G.renderer, G.scene, G.camera, sceneTarget(), { compile: [], drawn: [], swap });
  } finally {
    scene.onBeforeRender = before;
  }
  return seen;
}

/** The name of the place `group` is. */
const nameOf = (group: THREE.Object3D): string => everyPlace().find((place) => place.group === group)?.name ?? '?';

/** The hero into the shop by its door, as the door takes him in. */
async function intoTheShop(lab: Lab): Promise<boolean> {
  const out = outsideOf(ROOM);
  const door = G.player.pos.clone().set(out.x, groundHeight(out.x, out.z), out.z);
  G.player.walkTo = null;
  G.player.place(door, out.facing + Math.PI);
  await lab.step(SETTLE);
  enterRoom(ROOM);
  for (let frame = 0; frame < DOOR_FRAMES && G.arena.room !== ROOM; frame++) await lab.step(1);
  await lab.step(SETTLE);
  return G.arena.room === ROOM;
}

/** What's wrong with one part's draw: its own place not alone at a render, the shop not alone after. */
function wrongWith(swap: Swap, seen: string[][]): string[] {
  const wrong: string[] = [];
  const own = nameOf(swap.show);
  if (!seen.length) wrong.push('never drawn');
  for (const shown of new Set(seen.map((places) => places.join(', ')))) {
    if (shown !== own) wrong.push(`drawn with ${shown || 'nothing'} shown, where ${own} alone should be`);
  }
  wrong.push(...G.arena.placesWrong().map((place) => `after it, ${place}`));
  return wrong;
}

/** Each place's warm-up drawn with the hero in the shop, its lines and problems said: whether any was wrong. */
async function drawEach(lab: Lab, options: RoomWarmOptions, lines: string[], problems: string[]): Promise<boolean> {
  let caught = false;
  for (const [at, part] of placeSwaps().entries()) {
    const swap = part.swap();
    if (!swap) {
      problems.push(`${part.name}: no swap`);
      continue;
    }
    // (the canary: the village hidden alone, whatever's shown, as the parts' swaps had it before #746)
    const drawn = options.canary && at === 0 ? { ...swap, hide: G.arena.groupOf('village') } : swap;
    const seen = await drawnWith(drawn);
    // (and the village left shown after it, as #746 left it: found by the arena's own check, which dev builds run
    // every frame, and put back before a frame draws it, or that check's error would fail the canary's run)
    const village = G.arena.groupOf('village');
    if (options.canary && at === 0) village.visible = true;
    const wrong = wrongWith(drawn, seen);
    if (options.canary && at === 0) village.visible = false;
    lines.push(`${part.name} drawn in the shop's stead: ${wrong.join('; ') || 'alone, then the shop alone'}`);
    if (wrong.length) caught = true;
    if (!options.canary) problems.push(...wrong.map((what) => `${part.name}: ${what}`));
    await lab.step(1);
  }
  return caught;
}

export async function roomWarm(lab: Lab, options: RoomWarmOptions): Promise<Report> {
  const lines: string[] = [];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  await toVillage(lab);
  if (!(await intoTheShop(lab))) return { text: 'the shop never opened', problems: ['the shop never opened'], moments };
  const before = G.arena.placesWrong();
  lines.push(`in the shop: ${before.join(', ') || 'the shop alone'}`);
  problems.push(...before.map((wrong) => `before any warm-up: ${wrong}`));
  moments.push(await lab.screen('roomwarm-before', ['in the shop, before any warm-up']));
  // (the draws made: the lab skips them unless a measure asks, and a warm-up's draw is what's read here)
  const drawing = lab.drawing;
  lab.drawing = true;
  let caught = false;
  try {
    caught = await drawEach(lab, options, lines, problems);
  } finally {
    lab.drawing = drawing;
  }
  await lab.step(SETTLE);
  moments.push(await lab.screen('roomwarm-after', ['in the shop, after every place\'s warm-up drew behind it']));
  if (options.canary && !caught) problems.push('canary: a part drawn with the shop shown under it went unseen');
  return { text: lines.join('\n'), problems, moments };
}
