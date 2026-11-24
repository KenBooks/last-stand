// `lab coop --scenarios houses`' side on each page (node/coopHouses.mjs): a partner gone into one of the village's
// houses shown to the others outside (`src/ui/houseMarks.ts`): his name over the house's door, a dot on the minimap and
// his name under the house's on the village's map; gone again as he comes out.
import * as THREE from 'three';
import { G } from '../../../src/state';
import { outsideOf, type RoomId } from '../../../src/data/houses';
import { enterRoom, holdVillageKept, leaveRoom } from '../../../src/game/rooms';
import { YARD } from '../../../src/data/village';
import { effectsGoing } from '../../../src/fx/effects';
import { spentStats } from '../../../src/fx/stuckArrows';
import { particles } from '../../../src/fx/particles';
import { pooledLights } from '../../../src/fx/lights';
import { floatersShown } from '../../../src/ui/floaters';
import { hostRoom, joinRoom, leaveRoom as leaveParty, session } from '../../../src/net/session';
import { houseMarkOf, partnersByHouse } from '../../../src/ui/houseMarks';
import { groundHeight } from '../../../src/world/ground';
import { faceCamera, settleCamera, zoomHeldTo } from '../../../src/core/renderer';
import { programsCompiledInGame } from '../../../src/core/shaders';
import { setVillageMap } from '../../../src/ui/villageMap';
import type { Lab } from './lab';

/** how far back from a house's door the host stands to look at it (m) */
const LOOK_FROM = 5;

/** This game's hero into house `id` (as its door held through takes him: `lab houses` holds it). */
export function coopEnterHouse(_lab: Lab, { id }: { id: RoomId }): void {
  enterRoom(id);
}

/** This game's hero out of the house he's in, before its door. */
export function coopLeaveHouse(): void {
  leaveRoom();
}

/** This game's hero stood before house `id`'s door, back from it, looking at it. */
export function coopFaceHouse(_lab: Lab, { id }: { id: RoomId }): void {
  const out = outsideOf(id);
  const x = out.x + Math.sin(out.facing) * LOOK_FROM, z = out.z + Math.cos(out.facing) * LOOK_FROM;
  const facing = out.facing + Math.PI;
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(x, groundHeight(x, z), z), facing);
  faceCamera(facing);
  settleCamera(G.player.pos);
}

/** What this game shows of the partners in house `id`: its door's marker drawn and what it says, the minimap's dot
 *  (who it's drawn for) and the village map's line under the house's name. */
export interface HouseSeen { drawn: boolean; says: string; minimap: string[]; map: string }

export function coopHouseSeen(_lab: Lab, { id }: { id: RoomId }): HouseSeen {
  const mark = houseMarkOf(id);
  const map = [...document.querySelectorAll<HTMLElement>('.vm-name.occupied .vm-inside')].map((e) => e.textContent).join(' | ');
  return {
    drawn: !!mark && mark.label.shown && !!mark.label.slot,
    says: mark?.says ?? '',
    minimap: [...(partnersByHouse().get(id) ?? [])],
    map,
  };
}

/** The canary: house `id`'s marker taken off the screen for good, as if it were never drawn. */
export function coopHouseMarkLost(_lab: Lab, { id }: { id: RoomId }): void {
  houseMarkOf(id)?.label.remove();
}

/** The village's map opened on this game (as M opens it), or folded away. */
export function coopVillageMap(_lab: Lab, { on }: { on: boolean }): void {
  setVillageMap(on);
}

/** Where this game's hero stands relative to the houses, and whether partners are visible with him. */
export interface HousePartyState {
  room: RoomId | null;
  pos: [number, number];
  zoomHeld: boolean;
  lateCompiles: number;
  partnersVisible: number;
  partnersAway: number;
  status: string;
}

export function coopHousePartyState(): HousePartyState {
  const partners = G.players.filter((player) => !player.local);
  return {
    room: G.arena.room,
    pos: [G.player.pos.x, G.player.pos.z],
    zoomHeld: zoomHeldTo() !== null,
    lateCompiles: programsCompiledInGame(),
    partnersVisible: partners.filter((player) => player.obj.visible).length,
    partnersAway: partners.filter((player) => player.away).length,
    status: session.status,
  };
}

/** Leave the current co-op party (keeps the lab's simulated link in place for the next room). */
export function coopPartyLeave(): void {
  leaveParty();
}

/** Host a new co-op party as `tag` from wherever the hero currently stands (e.g. inside a house). */
export async function coopPartyHost(_lab: Lab, { tag }: { tag: string }): Promise<string> {
  await hostRoom(tag);
  return session.code;
}

/** Join co-op party `code` as `tag` from wherever the hero currently stands. */
export async function coopPartyJoin(_lab: Lab, { code, tag }: { code: string; tag: string }): Promise<void> {
  await joinRoom(code, tag);
}

/** What of the village's training yard this game shows: its projectiles, effects, particles and pooled lights round
 *  the yard, the numbers floating, the spent arrows, and the heroes holding a channel or a cast. */
export interface YardSeen {
  room: RoomId | null;
  projectiles: number;
  effects: number;
  particles: number;
  lights: number;
  numbers: number;
  /** the heroes holding a channel or a cast under way */
  channels: number;
  /** the spent arrows lying about */
  spent: number;
}

/** how far round the yard's middle a particle or a light counts as the yard's (m): past its fence and over it */
const YARD_REACH = 12;

/** Whether (x, z) is the yard's, by `YARD_REACH` round its middle (the rooms stand at the world's middle, well off it). */
const byTheYard = (x: number, z: number): boolean => Math.hypot(x - YARD.x, z - YARD.z) < YARD_REACH;

/** How many of a particle pool's live particles are by the yard. */
function particlesByYard(pool: typeof particles.glow): number {
  let near = 0;
  for (let i = 0; i < pool.count; i++) if (byTheYard(pool.pos[i * 3], pool.pos[i * 3 + 2])) near++;
  return near;
}

export function coopYardSeen(): YardSeen {
  return {
    room: G.arena.room,
    projectiles: G.projectiles.filter((shot) => shot.alive).length,
    effects: effectsGoing(),
    particles: particlesByYard(particles.glow) + particlesByYard(particles.smoke),
    lights: pooledLights().filter((light) => light.intensity > 0 && byTheYard(light.position.x, light.position.z)).length,
    numbers: floatersShown(),
    channels: G.players.filter((player) => player.channel || player.casting).length,
    spent: spentStats().all,
  };
}

/** The canary: what the village has going kept as a room is shown, as it was. */
export function coopKeepVillage(_lab: Lab, { kept }: { kept: boolean }): void {
  holdVillageKept(kept);
}
