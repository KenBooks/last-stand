// Co-op: a partner gone into one of the village's houses (game/rooms.ts) is shown to the others outside, as he isn't
// drawn there (`syncAway`): his name over the house's door, as the partners' name tags look (a label in the world's
// overlay, ui/overlay), a dot at its door on the minimap, and his name under the house's on the village's map
// (ui/villageMap.ts reads `partnersByHouse`). Read from the room each partner's state says (net/session.ts
// `partnersInHouses`): nothing new is sent.
import { G } from '../state';
import { HOUSES, ROOM_IDS, houseDoor, type RoomId } from '../data/houses';
import { COTTAGES } from '../data/village';
import { partnersInHouses } from '../net/session';
import { isCoop } from '../net/role';
import { groundHeight } from '../world/ground';
import { anchorLabel, textArt } from './floaters';
import { ORDER, type Label } from './overlay/layer';
import { ALLY_NAME } from './overlay/bars';
import { onMinimap } from './hud';
import { nameOf } from './coop';
import { showWhoIsInside } from './villageMap';

/** how high over the door's foot the marker stands (m): over the sign on its head */
const MARK_HIGH = 4.5;
/** the minimap's dot for a house a partner is in (px), its ring's */
const DOT = { r: 4, ring: 6.5 };

/** each house's marker over its door, and what it last said */
const marks = new Map<RoomId, { label: Label; says: string }>();
/** the partners in each house this frame, by name */
let byHouse = new Map<RoomId, string[]>();

/** Whether the village outside is what this game shows now (not a house's room, the hall, nor a run). */
const outside = (): boolean => G.mode === 'menu' && G.arena?.place === 'village' && !G.arena.hallShown && !G.arena.room;

/** The partners in each house now, by name (the village's map). */
export const partnersByHouse = (): ReadonlyMap<RoomId, readonly string[]> => byHouse;

/** House `id`'s marker as drawn, and what it says (tools/lab `coop --scenarios houses`). */
export const houseMarkOf = (id: RoomId): { label: Label; says: string } | undefined => marks.get(id);

/** The marker over house `id`'s door, made as it's first wanted. */
function markOf(id: RoomId): { label: Label; says: string } {
  let m = marks.get(id);
  if (m) return m;
  const door = houseDoor(id);
  const label = anchorLabel(ORDER.tag, () => (byHouse.has(id) && outside()
    ? { x: door.x, y: groundHeight(door.x, door.z) + MARK_HIGH * COTTAGES[HOUSES[id].cottage].size, z: door.z } : null), true);
  m = { label, says: '' };
  marks.set(id, m);
  return m;
}

/** Every frame: who's in which house, each house's marker painted again as what it says changes. */
export function updateHouseMarks(): void {
  const next = new Map<RoomId, string[]>();
  if (isCoop()) {
    for (const { player, room } of partnersInHouses()) next.set(room, [...(next.get(room) ?? []), nameOf(player)]);
  }
  byHouse = next;
  showWhoIsInside(byHouse);
  for (const id of ROOM_IDS) {
    const names = byHouse.get(id);
    if (!names && !marks.has(id)) continue;
    const m = markOf(id);
    const says = names ? `${names.join(', ')} · inside` : '';
    if (says === m.says) continue;
    m.says = says;
    if (says) m.label.show(textArt(says, { ...ALLY_NAME, size: 14, weight: 700 }));
  }
}

/** The minimap's dot at each house a partner is in, in the partners' blue, ringed. */
onMinimap((c, S) => {
  if (G.mode === 'run') return;
  for (const id of byHouse.keys()) {
    const d = houseDoor(id);
    c.beginPath();
    c.arc(d.x * S, d.z * S, DOT.ring, 0, Math.PI * 2);
    c.strokeStyle = 'rgba(106,184,255,.9)';
    c.lineWidth = 2;
    c.stroke();
    c.beginPath();
    c.arc(d.x * S, d.z * S, DOT.r, 0, Math.PI * 2);
    c.fillStyle = '#6ab8ff';
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,.85)';
    c.lineWidth = 1;
    c.stroke();
  }
});
