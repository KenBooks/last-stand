// The village's signposts (world/signposts.ts builds them): a post by the road where the ways part, its arms pointing
// down them, each naming where its way leads. From the owner, of the houses' signs: "We need street signs too, not
// just house labels". Each stands in the grass beside the road, off its paving and its curb (`lab houses` checks it),
// and an arm points at a place: a road's way on, or a house's door.
import { houseDoor, type RoomId } from './houses';
import { YARD, yardToWorld, type Spot } from './village';

/** An arm of a signpost: the name it bears and the place it points at (x, z). */
export interface SignArm { name: string; to: Spot }
/** A signpost: where its post stands (x, z) and its arms, the top one first. */
export interface Signpost { at: Spot; arms: readonly SignArm[] }

/** An arm pointing at house `id`'s door, named `name` (a word for it: the sign over its door has its whole name). */
const toHouse = (id: RoomId, name: string): SignArm => {
  const door = houseDoor(id);
  return { name, to: [door.x, door.z] };
};

/** the ways out and the places a road leads to, as an arm names them */
const CRYPT: SignArm = { name: 'Crypt', to: [24.7, -14.1] };
const THORNWOOD: SignArm = { name: 'Thornwood', to: [-24.4, 13.3] };
const YARD_GATE: SignArm = { name: 'Yard', to: yardToWorld(YARD.gateAt, -YARD.halfZ) };

// Two posts, one each side of the square where its roads leave it, each arm a word (#752, from play: "Mainly length,
// it just looks ugly this long. You might bang your head on it while walking on the path", "signs just seemed very
// cluttered, too many": four posts stood in a stretch of 25 m, two of them repeating the Crypt, the tavern and the
// square, one by the terrace's stair pointing at the hall it stands under; an arm named "House of Records" reached
// 2.4 m out over the path, the longest now "Thornwood", 1.6 m).
export const SIGNPOSTS: readonly Signpost[] = [
  // (east of the square, between the Crypt's road and the yard's, where both leave it)
  { at: [8.0, 2.3], arms: [CRYPT, YARD_GATE, toHouse('tavern', 'Tavern')] },
  // (west of the square, beside the Thornwood's road as it leaves: the house of records up the path behind, the
  // library south past the campfire)
  { at: [-8.3, 4.5], arms: [THORNWOOD, toHouse('records', 'Records'), toHouse('library', 'Library')] },
];
