// A hero sat, every way he can hold his gear on every seat (tools/lab `sit --poses`): a numbered picture from each of three
// sides, for the owner to name what's wrong by its number without playing his way to each. From the owner: "send me each
// sitting combination pose of warrior, as screenshot, with each weapon type, from 3 different angles", "label each image
// with a unique number so its easier to reference".

import type { WeaponStyle } from '../../../src/types';
import type { Fixture, Lab, Pictured, Report, ViewName } from './lab';
import { CASES, PLANTS, sitOn, withHidden, type SeatCase } from './sit';

/** A way of holding his gear, and what it's called on the sheet. */
interface Holding {
  gear: WeaponStyle;
  weapon: string;
  name: string;
}

const HOLDINGS: Holding[] = [
  { gear: 'twoHanded', weapon: 'Greatsword', name: 'Greatsword' },
  { gear: 'twoHanded', weapon: 'Maul', name: 'Maul' },
  { gear: 'twoHanded', weapon: 'Greataxe', name: 'Greataxe' },
  { gear: 'oneHanded', weapon: 'Sword', name: 'Sword' },
  { gear: 'oneHanded', weapon: 'Axe', name: 'Axe' },
  { gear: 'oneHanded', weapon: 'Mace', name: 'Mace' },
  { gear: 'shield', weapon: 'Sword', name: 'Sword and shield' },
  { gear: 'dual', weapon: 'Sword', name: 'Two swords' },
];

/** The sides he's pictured from: his weapon's side each time; by a fire none from ahead, through its flames. */
const SEAT_ANGLES: ViewName[] = ['front', 'right', 'third'];
const FLOOR_ANGLES: ViewName[] = ['right', 'above', 'third'];
/** in a house's room: his left in place of his right (from his right the camera stood past the bar's counter and the
 *  library's shelves, and from above past the ceiling, its pictures black) */
const ROOM_ANGLES: ViewName[] = ['front', 'left', 'third'];

/** Every holding on every seat asked for, sat and pictured, each picture numbered. */
export async function sitPoses(lab: Lab, seats: readonly string[] | undefined, asked?: Fixture): Promise<Report> {
  const moments: Pictured[] = [];
  const text: string[] = [];
  const problems: string[] = [];
  const cases = CASES.filter((each) => !seats?.length || seats.includes(each.name));
  let next = 1;
  for (const holding of HOLDINGS) {
    for (const seatCase of cases) {
      const fixture = { ...asked, gear: holding.gear, weapon: holding.weapon, fresh: true };
      const sat = await sitOn(lab, seatCase, fixture);
      const name = `${holding.name} by the ${seatCase.name}`;
      if (!sat) {
        problems.push(`sit --poses: ${name}: he never sat`);
        continue;
      }
      const moment = numbered(lab, name, seatCase, next);
      text.push(`  ${moment.tiles.map((tile) => tile.view).join(', ')}: ${name}`);
      next += moment.tiles.length;
      moments.push(moment);
    }
  }
  return { text: text.join('\n'), problems, moments };
}

/** Him as he sits now, his picture from each side numbered from `first`, the plants that would hide him left out. */
function numbered(lab: Lab, name: string, seatCase: SeatCase, first: number): Pictured {
  const angles = seatCase.room ? ROOM_ANGLES : seatCase.hangs || !isFloor(seatCase) ? SEAT_ANGLES : FLOOR_ANGLES;
  const pictured = withHidden((part) => PLANTS.test(part), () => lab.picture(name, angles));
  const tiles = pictured.tiles.map((tile, i) => ({ ...tile, view: `#${first + i} ${tile.view}` }));
  return { ...pictured, tiles };
}

/** Whether he sits on the floor on this seat. */
function isFloor(seatCase: SeatCase): boolean {
  return seatCase.name === 'fire' || seatCase.name === 'brazier';
}
