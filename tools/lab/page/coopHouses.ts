// `lab coop --scenarios houses`' side on each page (node/coopHouses.mjs): a partner gone into one of the village's
// houses shown to the others outside (`src/ui/houseMarks.ts`): his name over the house's door, a dot on the minimap and
// his name under the house's on the village's map; gone again as he comes out.
import * as THREE from 'three';
import { G } from '../../../src/state';
import { outsideOf, type RoomId } from '../../../src/data/houses';
import { enterRoom, leaveRoom } from '../../../src/game/rooms';
import { houseMarkOf, partnersByHouse } from '../../../src/ui/houseMarks';
import { groundHeight } from '../../../src/world/ground';
import { faceCamera, settleCamera } from '../../../src/core/renderer';
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
