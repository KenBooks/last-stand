// `lab roomwarm`: a warm-up behind the lobby finishing while the hero stands in a house's room (Odo's shop). Each
// warm-up that draws another place draws it in the village's stead (`Swap` in `src/core/shaders.ts`; the parts in
// `src/game/warmup.ts`: the other biomes, the hall of heroes, the houses' rooms) and must put back what it found. On
// main it put the village back on whatever it was, so a warm-up that ran on after the door was used left the village
// drawn under the room, its fountain in the middle of the shop. Each swap the warm-ups make is drawn here by the game's
// own `warmUp`, as `warmBuilt` draws a part's later swaps, with the hero inside; after each, what the next frame draws:
// the village hidden, the shop shown, no biome, other room or the hall with it.
import type * as THREE from 'three';
import type { Lab, Pictured, Report } from './lab';
import { G } from '../../../src/state';
import { BIOME_IDS } from '../../../src/data/biomes';
import { ROOM_IDS, outsideOf, type RoomId } from '../../../src/data/houses';
import { enterRoom } from '../../../src/game/rooms';
import { warmUp, type Swap } from '../../../src/core/shaders';
import { sceneTarget } from '../../../src/core/renderer';
import { groundHeight } from '../../../src/world/ground';
import { toVillage } from './village';

/** `--canary`: the village shown under the room after the first swap, which must be caught. */
export interface RoomWarmOptions {
  canary: boolean;
}

/** the room walked into */
const ROOM: RoomId = 'merchant';
/** the most frames the shop's door may take to open, and the frames a stand settles for */
const DOOR_FRAMES = 600;
const SETTLE = 15;

/** A swap a warm-up makes, named as the report says it. */
interface Drawing {
  name: string;
  swap: () => Swap;
}

const village = (): THREE.Object3D => G.arena.groupOf('village');
const roomGroup = (id: RoomId): THREE.Object3D | undefined => G.arena.rooms?.[id]?.group;

/** Each kind of swap the warm-ups make, drawn in the village's place as main's parts had it. */
function drawings(): Drawing[] {
  const biome = BIOME_IDS[0];
  return [
    { name: `the ${biome} (the fight's warm-up)`, swap: () => ({ show: G.arena.groupOf(biome), hide: village() }) },
    { name: 'the hall of heroes (the heroes\')', swap: () => ({ show: G.arena.hallGroup, hide: village() }) },
    { name: 'the shop itself (the rooms\')', swap: () => ({ show: roomGroup(ROOM)!, hide: village() }) },
  ];
}

/** What's wrong with what the next frame draws round the hero in the shop: none where it alone shows. */
function wrongNow(): string[] {
  const wrong: string[] = [];
  if (village().visible) wrong.push('the village drawn under the shop');
  if (!roomGroup(ROOM)?.visible) wrong.push('the shop hidden');
  const others = ROOM_IDS.filter((id) => id !== ROOM && roomGroup(id)?.visible);
  if (others.length) wrong.push(`another room drawn with it (${others.join(', ')})`);
  const biomes = BIOME_IDS.filter((id) => G.arena.groupOf(id).visible);
  if (biomes.length) wrong.push(`a battleground drawn with it (${biomes.join(', ')})`);
  if (G.arena.hallGroup.visible) wrong.push('the hall of heroes drawn with it');
  return wrong;
}

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

export async function roomWarm(lab: Lab, options: RoomWarmOptions): Promise<Report> {
  const lines: string[] = [];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  await toVillage(lab);
  if (!(await intoTheShop(lab))) return { text: 'the shop never opened', problems: ['the shop never opened'], moments };
  const before = wrongNow();
  lines.push(`in the shop: ${before.join(', ') || 'the shop alone'}`);
  problems.push(...before.map((wrong) => `before any warm-up: ${wrong}`));
  moments.push(await lab.screen('roomwarm-before', ['in the shop, before any warm-up']));
  let caught = false;
  for (const [at, drawing] of drawings().entries()) {
    await warmUp(G.renderer, G.scene, G.camera, sceneTarget(), { compile: [], drawn: [], swap: drawing.swap() });
    if (options.canary && at === 0) village().visible = true;
    await lab.step(1);
    const wrong = wrongNow();
    lines.push(`after ${drawing.name} drawn in the village's stead: ${wrong.join(', ') || 'the shop alone'}`);
    if (wrong.length) caught = true;
    if (!options.canary) problems.push(...wrong.map((what) => `after ${drawing.name}: ${what}`));
    if (options.canary) village().visible = false;
  }
  await lab.step(SETTLE);
  moments.push(await lab.screen('roomwarm-after', ['in the shop, after a warm-up of each kind drew behind it']));
  if (options.canary && !caught) problems.push('canary: the village shown under the shop went unseen');
  return { text: lines.join('\n'), problems, moments };
}
