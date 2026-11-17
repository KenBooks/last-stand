// The village's signposts (world/signposts.ts builds them): a post by the road where the ways part, its arms pointing
// down them, each naming where its way leads. From the owner, of the houses' signs: "We need street signs too, not
// just house labels". Each stands in the grass beside the road, off its paving and its curb (`lab houses` checks it),
// and an arm points at a place: a road's way on, or a house's door.
import { HOUSES, houseDoor, type RoomId } from './houses';
import { YARD, yardToWorld, type Spot } from './village';

/** An arm of a signpost: the name it bears and the place it points at (x, z). */
export interface SignArm { name: string; to: Spot }
/** A signpost: where its post stands (x, z) and its arms, the top one first. */
export interface Signpost { at: Spot; arms: readonly SignArm[] }

/** An arm pointing at house `id`'s door, named as its sign over the door is. */
const toHouse = (id: RoomId): SignArm => {
  const door = houseDoor(id);
  return { name: HOUSES[id].name, to: [door.x, door.z] };
};

/** the ways out and the places a road leads to, as an arm names them */
const CRYPT: SignArm = { name: 'The Crypt', to: [24.7, -14.1] };
const THORNWOOD: SignArm = { name: 'The Thornwood', to: [-24.4, 13.3] };
const HALL_OF_HEROES: SignArm = { name: 'Hall of Heroes', to: [-1.5, -9.4] };
const SQUARE: SignArm = { name: 'The Square', to: [0, 0] };
const YARD_GATE: SignArm = { name: 'Training Yard', to: yardToWorld(YARD.gateAt, -YARD.halfZ) };

export const SIGNPOSTS: readonly Signpost[] = [
  // (east of the square, between the Crypt's road and the yard's, where both leave it)
  { at: [8.0, 2.3], arms: [CRYPT, YARD_GATE, toHouse('tavern')] },
  // (west of the square, beside the Thornwood's road as it leaves: the house of records up the path behind, the
  // library south past the campfire)
  { at: [-8.3, 4.5], arms: [THORNWOOD, toHouse('records'), toHouse('library')] },
  // (north of the square, beside the stair up to the terrace)
  { at: [-5.6, -6.2], arms: [HALL_OF_HEROES, SQUARE] },
  // (on the Crypt's road where the tavern's path joins it, beside the path: across the road, the southern cottage's
  // path comes in)
  { at: [17.6, -3.9], arms: [CRYPT, toHouse('tavern'), SQUARE] },
];
