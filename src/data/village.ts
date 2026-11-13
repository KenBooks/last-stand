// The village the lobby stands in (world/village.ts builds it, game/village.ts makes its objects work): where each of
// its places is, and what each object the hero uses does. x is east, z south (the top view looks north, -z, up the
// screen); heights are over the village's ground. It's laid out as a hamlet grows, not on a grid: its palisade wanders
// round it, its roads wind, its cottages stand each its own way, and its two ways out are places of their own, the
// crypt's sunken entrance north-east and a grove of the Thornwood south-west, each with its portal before it.
import type { BiomeId } from './biomes';

/** What an object does when the hero uses it (game/village.ts `use`). */
export type VillageUse = 'portal' | 'stash' | 'heroes' | 'coop' | 'chronicle' | 'help' | 'training' | 'pvp';

/** An object of the village the hero walks to and uses: where it stands (its middle, x and z), how near he must be
 *  to use it (m, from that middle), where he stands to use it (x, z), the height its name hangs at (m), its name and
 *  what using it says. */
export interface VillageObject {
  id: string;
  use: VillageUse;
  /** the portal's battleground (`use: 'portal'`) */
  biome?: BiomeId;
  at: [number, number];
  reach: number;
  stand: [number, number];
  /** where its name and E hint sit over its floor (m): on the thing itself, clear of what it's for (a chest's hoard and
   *  lock, a board's notices, a lectern's book) */
  label: number;
  /** how high a click or a tap on it counts over its floor (m) */
  tall: number;
  name: string;
  verb: string;
}

/** a point of the village's floor (x, z) */
export type Spot = [number, number];

/** The terrace the hall of heroes stands on: its middle across (x), its front edge (z), its back (z), its half width
 *  (x), how high it is; the stair up its middle (half width, and where its foot is, z) */
export const TERRACE = { x: -1.5, front: -11, back: -22, half: 10.5, high: 1.6, stairHalf: 2.4, stairFoot: -7.8 };
/** the steps of a stair: how high each rises (m), the same for every stair (a man's step) */
export const STEP_RISE = 0.16;

/** The hall of heroes on the terrace, a long hall walked into (the selection screen's room is world/heroHall.ts): its
 *  back wall's inner face (z: past the terrace's back, on a footing of its own), its front wall's face with the door
 *  (z), the door's half width and height, and its walls' outer half width (m); the dais across its far end (its front's
 *  z, height) and the plinths on it the other heroes stand on (each one's x from the hall's middle, z, half side,
 *  height over the dais); its columns in two rows (x either side, z of each pair); and its inside's half width and
 *  front (m, the walls' inner faces). From play: "I will be able to enter it and see the other 2 heroes, before I
 *  interact with it to choose anything, it should be a real building", and "hall of heroes need to be longer, like an
 *  actual hall, so you walk in, and see heroes in the distance, and can marvel at its architecture". */
export const HALL = {
  /** how high its walls stand over the terrace */
  wallHigh: 6.47,
  /** the portico's beam over its columns: its middle (z), how deep it is, and how high its foot stands */
  beamZ: -13.4, beamDeep: 1, beamFoot: 5.92,
  wall: -33.0, door: -14.7, doorHalf: 1.1, doorHigh: 3.4, half: 6.2,
  daisZ: -28.6, daisHigh: 0.32,
  plinths: [-3.3, 0, 3.3], plinthZ: -30.6, plinthHalf: 0.7, plinthHigh: 0.3,
  columnX: 3.7, columnZ: [-17.8, -21.2, -24.6, -28.0],
  inHalf: 5.6, inFront: -15.3,
};

/** Whether (x, z) is inside the hall of heroes (between its walls' inner faces). */
export const inHall = (x: number, z: number): boolean =>
  Math.abs(x - TERRACE.x) < HALL.inHalf && z > HALL.wall && z < HALL.inFront;


/** The training yard: a fenced field (its middle, half sides, turned `turn` rad about y), its gate's half width and
 *  where it opens along its north side (x in its own frame: toward the square, so its road comes straight in). Skills
 *  are cast here alone. */
export const YARD = { x: 9, z: 14.5, halfX: 6.5, halfZ: 5, gate: 1.6, gateAt: -3.4, turn: -0.3 };

/** A point of the yard's own frame (x across it, z from its gate side to the back) in the village's. */
export function yardToWorld(x: number, z: number): Spot {
  const c = Math.cos(YARD.turn), s = Math.sin(YARD.turn);
  return [YARD.x + x * c + z * s, YARD.z - x * s + z * c];
}

/** A point of the village's in the yard's own frame (`yardToWorld` undone). */
export function worldToYard(x: number, z: number): Spot {
  const dx = x - YARD.x, dz = z - YARD.z, c = Math.cos(YARD.turn), s = Math.sin(YARD.turn);
  return [dx * c - dz * s, dx * s + dz * c];
}

/** The ghost by the yard's gate, outside its fence (a foe of a first wave as the training grounds show one, game/ghost.ts):
 *  where it stands and the way it faces (rad about y: 0 faces +z), out of the yard toward the road that comes to the
 *  gate. Talked to, it opens the training grounds (from play: "lets add a ghost enemy near training place in village
 *  for that... it will be a random low level enemy, talk to him and enter the new training grounds"). */
export const GHOST = (() => {
  const [x, z] = yardToWorld(YARD.gateAt - 3.5, -YARD.halfZ - 1.5);
  const [ox, oz] = yardToWorld(YARD.gateAt - 3.5, -YARD.halfZ - 2.5);
  return { x, z, facing: Math.atan2(ox - x, oz - z) };
})();

/** The weapons rack before the yard's fence, east of its gate, its back to the fence and its swords toward the square
 *  (rad about y: 0 faces +z): where a party sets up a duel (from play: "Item you come up to to interact (open menu), is
 *  a weapons rack"). */
export const RACK = (() => {
  const [x, z] = yardToWorld(0.6, -YARD.halfZ - 1.0);
  return { x, z, facing: YARD.turn + Math.PI, half: 1.2 };
})();

/** where the yard's dummies stand */
export const YARD_DUMMIES: readonly Spot[] = [yardToWorld(-3, 1.7), yardToWorld(0, 2.9), yardToWorld(3, 1.7)];

/** The palisade's line round the village, a closed curve through these points (clockwise from the east), and where
 *  its two ways out open in it (the middles of the gaps) and how wide (m). */
export const PALISADE_LINE: readonly Spot[] = [
  [29.5, -3], [27, 7], [26, 15], [19, 22.5], [10, 24], [2, 27.5], [-6, 25.5], [-13, 23.5], [-20.5, 19],
  [-27.5, 8], [-26.5, -1], [-29.5, -9], [-25, -16.5], [-17.5, -21], [-11.5, -28], [-10.5, -36.5], [-1.5, -38.5], [7.5, -36.5], [9.5, -28.5],
  [16.5, -23.5],
  [22, -18], [27, -10],
];
export const GAP_HALF = 4.2;

/** A way out of the village: the gap in the palisade it opens from, the way it leads out (a unit vector), and where
 *  its portal stands along it (m out from the gap) facing back into the village. */
export interface Entrance { gap: Spot; out: Spot; portalOut: number }
const unit = (x: number, z: number): Spot => [x / Math.hypot(x, z), z / Math.hypot(x, z)];
export const ENTRANCES: Record<BiomeId, Entrance> = {
  // down into the crypt: a walled court, the portal at its far end before the crypt's sunken door
  crypt: { gap: [24.5, -14], out: unit(0.85, -0.53), portalOut: 5.2 },
  // into the Thornwood: a path into a grove, the portal between two of its roots
  forest: { gap: [-24.3, 13.2], out: unit(-0.85, 0.53), portalOut: 6.5 },
};

/** How far inside its gap a hero back through a way's portal comes out (m): at 3.3 m out of the portal, under its
 *  arch and between the gap's walls, the view from behind him looked down on the crypt's gate, the top half of the
 *  frame its dark stone, him in a hole cut through it (from play, "this is what I saw when lower end player returned
 *  to sanctuary"; `npm run lab -- village --only portalReturn`). */
export const EXIT_IN = 3.8;

/** Where a hero back through a way's portal comes out: inside its gap, facing into the village. */
export function exitPlace(id: BiomeId): { x: number; z: number; facing: number } {
  const e = ENTRANCES[id];
  return { x: e.gap[0] - e.out[0] * EXIT_IN, z: e.gap[1] - e.out[1] * EXIT_IN, facing: portalPlace(id).facing };
}

/** Where a way out's portal stands, and the way it faces (rad about y: 0 faces +z): back along its way. */
export function portalPlace(id: BiomeId): { x: number; z: number; facing: number } {
  const e = ENTRANCES[id];
  return {
    x: e.gap[0] + e.out[0] * e.portalOut, z: e.gap[1] + e.out[1] * e.portalOut,
    facing: Math.atan2(-e.out[0], -e.out[1]),
  };
}

/** The roads, cobbled, each a winding line from the square (its points) and its width (m): to each way out, to the
 *  hall's stair, to the yard's gate. */
export const ROADS: readonly { points: readonly Spot[]; width: number }[] = [
  { points: [[5.2, -0.8], [10.5, -2.4], [16, -5.6], [21, -10.6], [24.7, -14.1], [27.5, -15.8]], width: 3.2 },
  { points: [[-5.2, 0.9], [-10.5, 2.4], [-15.5, 5.1], [-20.5, 9.6], [-24.4, 13.3], [-27.5, 15.2]], width: 3.0 },
  // (straight out of the square up the stair's middle and on under it, as wide as the stair and a hair more, each curb
  // ending square against its cheek: narrower, the curbs ran on in front of the steps' ends, "curb would never
  // transition into stairs"; coming in aslant, one curb struck its cheek on a skew and the other lay along its foot)
  { points: [[-1.5, -4.6], [-1.5, -6.2], [-1.5, -8.6]], width: 4.9 },
  // (the yard's: out of its gate 1.5 m along its way, then round on a 3 m arc to the square; turned 60 degrees in its
  // last 1.6 m, its inner edge folded back and its curb doubled over into slivers, "lets fix curb near training area")
  { points: [[5.23, 3.52], [5.91, 3.98], [6.58, 4.43], [7.13, 5.01], [7.51, 5.71], [7.7, 6.49],
    yardToWorld(YARD.gateAt, -6.5), yardToWorld(YARD.gateAt, -5.0)], width: 2.6 },
];

/** The cottages: each one's middle, the way its door faces (rad about y: 0 faces +z) and its size (1 a cottage, under
 *  it a shed), and its footpath's way to a road from its door (worn into the grass), if it has one. */
export interface Cottage { x: number; z: number; facing: number; size: number; path?: readonly Spot[] }
export const COTTAGES: readonly Cottage[] = [
  { x: -14.2, z: -3.4, facing: 0.22, size: 1, path: [[-13.4, 0.2], [-12.8, 1.8], [-12.6, 3.0]] },
  { x: -21.6, z: -6.2, facing: 0.62, size: 0.85, path: [[-19.4, -3.4], [-18.2, 1.0], [-17.8, 5.6]] },
  { x: -16.5, z: -15.2, facing: 0.75, size: 0.7 },
  { x: -15.6, z: 15.6, facing: Math.PI - 0.35, size: 0.9, path: [[-14.8, 12.8], [-15.6, 9.8], [-17.0, 7.0]] },
  { x: -3.8, z: 17.2, facing: Math.PI + 0.42, size: 1, path: [[-2.6, 14.6], [-0.4, 11.0], [2.2, 7.4]] },
  { x: 19.2, z: 1.4, facing: Math.PI - 0.1, size: 1, path: [[19.0, -1.2], [18.6, -4.0], [18.0, -7.2]] },
  { x: 21.6, z: 9.6, facing: -2.3, size: 0.8, path: [[22.4, 6.4], [23.4, 1.5], [22.8, -3.6], [22.0, -7.4]] },
  { x: 14.6, z: -17.4, facing: -0.35, size: 0.9, path: [[13.6, -14.6], [15.8, -11.4], [17.6, -7.6]] },
];

/** the campfire's middle */
export const CAMPFIRE: Spot = [-9.2, 10.4];

/** A place a game may open at: where he stands, the way he and the camera face (rad about y: 0 faces +z). */
export interface StartSpot { name: string; at: Spot; facing: number }
/** Where a game opens, one at random (from play, "lets also choose a more scenic startup location, current one is
 *  boring, maybe several (3-5), and pick at random"): each with something to look at beyond him. */
export const START_SPOTS: readonly StartSpot[] = [
  { name: 'before the fountain, the hall beyond it', at: [-0.6, 7.2], facing: Math.PI },
  { name: 'by the campfire, the cottages over it', at: [CAMPFIRE[0] + 1.4, CAMPFIRE[1] - 3.4], facing: 0 },
  { name: 'at the training yard, its dummies before him', at: yardToWorld(YARD.gateAt, -YARD.halfZ - 1.6), facing: 0 },
];
/** the notice board's middle, and the way it faces (rad, about y: 0 faces +z): beside the Thornwood's road, facing it */
export const NOTICE = { x: -8.6, z: -1.6, facing: 0.25 };
/** how far either side of the door's middle the chest and the lectern stand, and their z: each in the corner of the
 *  door's frame and the portico's nearest column, its back to the wall's plinth course */
const PORCH_CORNER = { x: 2.1, z: -13.95 };
/** the chest at the hall's entrance, right of the door, facing the stair (rad about y: 0 faces +z) */
export const CHEST = { x: TERRACE.x + PORCH_CORNER.x, z: PORCH_CORNER.z, facing: 0 };
/** the chronicle's lectern left of the door, across it from the chest and facing the stair too. On a platform of its
 *  own east of the square it stood in the way: "lets remove this from here, and move the object near hall of heroes,
 *  to the left of chest/stash". */
export const CHRONICLE = { x: TERRACE.x - PORCH_CORNER.x, z: PORCH_CORNER.z, facing: 0 };

/** The portals' objects: each before its way out's portal, used from in front of it. */
function portalObject(id: BiomeId, name: string, verb: string): VillageObject {
  const p = portalPlace(id), front = [Math.sin(p.facing), Math.cos(p.facing)];
  return {
    id, use: 'portal', biome: id, at: [p.x, p.z], reach: 4.2, stand: [p.x + front[0] * 3.2, p.z + front[1] * 3.2],
    label: 2.6, tall: 5.6, name, verb,
  };
}

/** Every object the hero uses, in the order the touch Use button and the keys look for one. */
export const VILLAGE_OBJECTS: readonly VillageObject[] = [
  portalObject('crypt', 'Portal to the Crypt', 'Enter the Crypt'),
  portalObject('forest', 'Portal to the Thornwood', 'Enter the Thornwood'),
  {
    // (stood before it, on the porch)
    id: 'chest', use: 'stash', at: [CHEST.x, CHEST.z], reach: 2.2, stand: [CHEST.x, CHEST.z + 1.3], label: 0.03, tall: 1.4,
    name: 'Stash', verb: 'Open the stash',
  },
  {
    // (inside, before the plinths: walked in through its door)
    id: 'hall', use: 'heroes', at: [TERRACE.x, HALL.daisZ - 0.6], reach: 3.4, stand: [TERRACE.x, HALL.daisZ + 1.4],
    label: 1.4, tall: 3.0,
    name: 'Hall of Heroes', verb: 'Choose your hero',
  },
  {
    id: 'campfire', use: 'coop', at: CAMPFIRE, reach: 2.8, stand: [CAMPFIRE[0] + 1.9, CAMPFIRE[1] - 0.4], label: 0.6, tall: 1.8,
    name: 'Campfire', verb: 'Play together',
  },
  {
    // (stood before it on the porch, as the chest's on the other side)
    id: 'chronicle', use: 'chronicle', at: [CHRONICLE.x, CHRONICLE.z], reach: 2.2, stand: [CHRONICLE.x, CHRONICLE.z + 1.2],
    label: 0.85, tall: 1.9, name: 'Chronicle', verb: 'Save slots',
  },
  {
    // (stood before it, on the road's side)
    id: 'ghost', use: 'training', at: [GHOST.x, GHOST.z], reach: 2.4,
    stand: [GHOST.x + Math.sin(GHOST.facing) * 1.5, GHOST.z + Math.cos(GHOST.facing) * 1.5], label: 2.0, tall: 2.0,
    name: 'Sparring Shade', verb: 'Enter the training grounds',
  },
  {
    // (stood before its swords, on the square's side)
    id: 'rack', use: 'pvp', at: [RACK.x, RACK.z], reach: 2.2,
    stand: [RACK.x + Math.sin(RACK.facing) * 1.4, RACK.z + Math.cos(RACK.facing) * 1.4], label: 1.72, tall: 1.8,
    name: 'Weapons Rack', verb: 'Set up a duel',
  },
  {
    id: 'notice', use: 'help', at: [NOTICE.x, NOTICE.z], reach: 2.4,
    stand: [NOTICE.x + Math.sin(NOTICE.facing) * 1.4, NOTICE.z + Math.cos(NOTICE.facing) * 1.4], label: 0.95, tall: 2.6,
    name: 'Notice board', verb: 'How to play',
  },
];

/** The hours of the village's day: its light from the hour of the player's clock (a co-op guest's, the host's).
 *  `dawn` and `dusk` are when the sun is on the horizon. */
export const DAY = { dawn: 6.5, dusk: 19.5 };

/** The hours the village is the Thornwood's (its lobby music, the ghost by the yard a forest foe); the crypt's the
 *  rest, the dusk and the night (from play: "for ghost, during daytime should be a forest mob, during night should be
 *  a crypt mob"). */
export const FOREST_HOURS = { from: 7.5, to: 18.5 };
/** The battleground the village is given to at `hour` (`FOREST_HOURS`). */
export const biomeOfHour = (hour: number): BiomeId =>
  hour >= FOREST_HOURS.from && hour < FOREST_HOURS.to ? 'forest' : 'crypt';
