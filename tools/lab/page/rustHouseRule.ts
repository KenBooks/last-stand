// `lab houserule` and `lab rustcheck`'s check of a house seen from above, as the Rust engine draws it. The owner's
// three rules, from play: "he needs to see the ground, so we thin"; "he only sees the ground he sees, so if the wall
// hides anything extra, we dont thin it"; "we should thin enough regardless of how many walls between camera and
// ground". Each view is pictured three times with the lighting off (no shadow moves between them): as played, with
// nothing thinned, and with the houses' parts hidden. Where a house covers ground, how much of its cover is left
// over each block of the frame is read from the three, and set against whether he sees the ground the sight
// through that block ends on (`seenShareAt`, the fog's own answer, a door he sees in through too).
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import { type Checked, failed, passed } from './rustPixels';
import { STRIP_MOST, type StripRead, stripsPastRoom } from './rustRoomStrips';
import { standAt } from './draws';
import { faceCamera } from '../../../src/core/renderer';
import { seeValue, type SeeThrough } from '../../../src/core/seeThrough';
import { DOOR_WHOLE, seenShareAt, seesIntoRoom } from '../../../src/core/sight';
import { COTTAGES, HALL, TERRACE, inHall } from '../../../src/data/village';
import { RUST } from '../../../src/engine';
import { ROOMS } from '../../../src/engine/ahead';
import { G } from '../../../src/state';
import { groundHeight } from '../../../src/world/ground';
import { COTTAGE } from '../../../src/world/villagePlan';

/** A place the rule is held from: where he stands (x, z), the camera's turn (degrees) and its zoom. */
export interface RuleView {
  name: string;
  at: [number, number];
  turned: number;
  zoom: number;
}

/** the places round the hall of heroes and two cottages the rule is held from */
export const RULE_VIEWS: readonly RuleView[] = [
  { name: 'terrace, camera over the hall', at: [-1.7, -12.4], turned: 164, zoom: 0.71 },
  { name: 'terrace end, from the side', at: [-8.5, -12.5], turned: 90, zoom: 0.71 },
  { name: 'other terrace end', at: [5.5, -12.5], turned: 270, zoom: 0.71 },
  { name: 'terrace, facing the hall', at: [-1.7, -12.4], turned: 0, zoom: 0.71 },
  // (the portico case, `docs/agents/sight.md`: on the portico by the hall's door, the camera from each side)
  { name: 'the portico case, camera before the hall', at: [-1.5, -13.6], turned: 0, zoom: 0.5 },
  { name: 'the portico case, camera from the east', at: [-1.5, -13.6], turned: 90, zoom: 0.5 },
  { name: 'the portico case, camera over the hall', at: [-1.5, -13.6], turned: 180, zoom: 0.5 },
  { name: 'the portico case, camera from the west', at: [-1.5, -13.6], turned: 270, zoom: 0.5 },
  // (from play, in the owner's own game (lab join): the side walls opened on the terrace past them he saw out of
  // their windows, "can see grass in top right corner", "there is also a white strip on the other side")
  { name: 'at the door, seeing in, as played', at: [-1.76, -14.24], turned: -18, zoom: 0.6 },
  { name: 'foot of the stair', at: [-1.5, -9.0], turned: 0, zoom: 0.5 },
  { name: 'before the hall, camera past its roof', at: [-0.6, -5.9], turned: 178, zoom: 0.5 },
  { name: 'behind the hall', at: [-1.5, -36], turned: 180, zoom: 0.71 },
  { name: 'just inside the door', at: [-1.5, -15.5], turned: 0, zoom: 0.5 },
  { name: 'inside the hall', at: [-1.5, -20], turned: 0, zoom: 0.5 },
  { name: 'inside the hall, camera from its far end', at: [-1.5, -20], turned: 180, zoom: 0.5 },
  // (from play, in the owner's own game (lab join): the portico's beam across the frame in pieces, "wth is this")
  { name: 'inside the hall by its door, as played', at: [-1.46, -16.87], turned: -51, zoom: 0.84 },
  // (the eye brought down under the roof and the walls' tops: from play, "also bug at this zoom level")
  { name: 'inside the hall, zoomed in', at: [-1.5, -22], turned: 0, zoom: 0.4 },
  { name: 'inside the hall, zoomed in from the east', at: [-1.5, -22], turned: 90, zoom: 0.4 },
  { name: 'beside a cottage', at: [-12.6, 13.2], turned: 0, zoom: 0.5 },
  { name: 'beside a cottage, camera over it', at: [-12.6, 13.2], turned: 180, zoom: 0.5 },
  { name: 'between two cottages', at: [-15.0, 10.8], turned: 90, zoom: 0.5 },
  // (from play, in the owner's own game (lab join), stood behind the House of Records at its wall: its roof opened
  // over its own floor too, "should not thin inside the house... when player is outside, we only thin outside parts")
  { name: 'behind a cottage, at its wall, as played', at: [-14.17, -0.59], turned: 171, zoom: 0.53 },
];

/** the kinds of see-through a house is built of (`kinds` in core/seeThrough.ts) */
const HOUSE_KINDS = ['built', 'roof', 'gable', 'hallFront', 'hallBack', 'hallBeam', 'hallEast', 'hallWest',
  'hallRoof'] as const;
/** the roof of the one building he can stand in (the hall of heroes) */
// (and the portico's beam, which the roof stands on and goes with: left to the walls' rule it stood in three
// pieces, one whole, one a ghost, one gone, from play "just odd geometry... we should not make player wondering
// what the geometry was before thinning")
const INSIDE_ROOFS = ['hallRoof', 'hallBeam'] as const;
/** the room that roof is over: the hall's, inside its walls (its least x and z, its most) */
const HALL_ROOM = [TERRACE.x - HALL.inHalf, HALL.wall, TERRACE.x + HALL.inHalf, HALL.inFront] as const;
/** the walls with the hall's door in them: opened whole while he stands before the door and sees in (from play,
 *  "he just needs to see whole wall behind it") */
const DOOR_WALLS = ['hallFront', 'hallBeam'] as const;
/** a block's side (pixels of the picture): grass in the wind and the frame's grain average out of it */
const BLOCK = 12;
/** how far apart a block's colour must be with the houses whole and with them hidden to count as covered (the three
 *  channels' sum, of 765) */
const COVERED = 45;
/** how far round a block's place on the ground his sight must agree for it to count as seen or as unseen (m) */
const CLEAR = 0.6;
/** the most of a house's cover left over ground he sees: on average, this much over the share left there on purpose
 *  (`rust.houseLeft`, so its shape still reads); at a block; and the share of blocks that may be over the block's
 *  most (edges, a column's foot) */
export const SEEN_COVER = { overLeft: 0.08, block: 0.6, blocksOver: 0.03 };
/** how much more than `rust.houseLeft` a cover's ghost keeps, but a wall's opened by its door or of his room
 *  (Bulwark's `COVER_FIRM`: from play, "lets thin a bit less here, almost can't see geometry") */
const COVER_FIRM = 1.3;
/** the most of a house's cover gone over ground he doesn't see, likewise */
export const UNSEEN_OPEN = { mean: 0.08, block: 0.5, blocksOver: 0.03 };
/** stood in a building, the exception (from play, "if the player is inside a building... we will thin whole roof no
 *  matter what"; and "in hall need to see full walls, like the player can see"): the least share of the blocks over
 *  ground he doesn't see that must stand (its walls, by the rule), and the most of its roof, pictured alone, that
 *  may be left over what `rust.houseLeft` leaves: on average, and the share of its blocks over `SEEN_COVER.block` */
// (its roof, pictured alone, is gone whole: "if inside building, we thin the roof 100%, so player cannot even
// see it": `roofLeft` the most of it read left, on average, and `roofBlocksOver` the share of its blocks
// over `SEEN_COVER.block`)
export const INSIDE = { stands: 0.1, roofLeft: 0.04, roofBlocksOver: 0.01 };
/** the fewest covered blocks a view must have of a kind (seen, unseen) for its number to count */
const BLOCKS_LEAST = 12;
/** the frames a view is given to settle its fades, and a switch before its picture */
const SETTLE_FRAMES = 90;
const SWITCH_FRAMES = 6;
/** the most frames a view waits for the rooms' own pipelines to be asked for and compiled */
const ROOMS_WAIT_FRAMES = 3000;

/** What a view measures: the covered blocks over seen and unseen ground, and the cover left over each. */
export interface RuleRead {
  view: string;
  /** the blocks that break a rule (their place among the blocks): ground he sees still covered, and ground he
   *  doesn't see opened */
  covered: number[];
  opened: number[];
  /** where on the ground the middle one of each lies (x, z), for finding it in the scene */
  coveredAt: string;
  openedAt: string;
  seen: { blocks: number; coverLeft: number; blocksOver: number };
  unseen: { blocks: number; opened: number; blocksOver: number };
  /** whether he stands in a building, whose whole roof opens then: ground he doesn't see is opened under it, and
   *  the share of those blocks that still stand (its walls) is read instead */
  inside: boolean;
  stands: number;
  /** inside: its roof pictured alone, the blocks it covers, the cover left there and the share of them still covered */
  roof?: { blocks: number; coverLeft: number; blocksOver: number };
  /** before the hall's door: its front wall pictured alone, read the same way */
  doorWall?: { blocks: number; coverLeft: number; blocksOver: number };
  /** the blocks over ground within a cottage's walls, he outside it, and how far the cover is opened there */
  within: { blocks: number; opened: number };
  /** seeing into the hall from outside it: its walls opened on ground past the room he sees through it */
  strips?: StripRead;
}

/** Each block's mean colour, row by row. */
function blockColours(picture: ImageData): Float32Array {
  const { data, width, height } = picture;
  const columns = Math.floor(width / BLOCK);
  const rows = Math.floor(height / BLOCK);
  const means = new Float32Array(columns * rows * 3);
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const sum = [0, 0, 0];
      for (let y = row * BLOCK; y < (row + 1) * BLOCK; y++) {
        for (let x = column * BLOCK; x < (column + 1) * BLOCK; x++) {
          const at = (y * width + x) * 4;
          sum[0] += data[at];
          sum[1] += data[at + 1];
          sum[2] += data[at + 2];
        }
      }
      means.set(sum.map((channel) => channel / (BLOCK * BLOCK)), (row * columns + column) * 3);
    }
  }
  return means;
}

/** how far apart the ground's height is read along a sight (m), how far the sight is followed, and the halvings that
 *  then find where it meets the ground */
const GROUND_STEP = 0.25;
const GROUND_FAR = 120;
const GROUND_HALVINGS = 6;

/** Where the sight through a point of the screen (-1 to 1 each way) ends on the ground, or null over the sky: on the
 *  ground as it lies there (the terrace's top, a dais, the meadow under them), the first place along the sight that
 *  lies under it. Found by guessing a height and reading the ground there, it leapt past a step in the floor. */
function groundThrough(x: number, y: number): THREE.Vector2 | null {
  const eye = G.camera.getWorldPosition(new THREE.Vector3());
  const toward = new THREE.Vector3(x, y, 0.5).unproject(G.camera).sub(eye).normalize();
  if (toward.y > -1e-4) return null;
  const over = (along: number): number => eye.y + toward.y * along - groundHeight(eye.x + toward.x * along, eye.z + toward.z * along);
  let far = GROUND_STEP;
  while (far < GROUND_FAR && over(far) > 0) far += GROUND_STEP;
  if (far >= GROUND_FAR) return null;
  let near = far - GROUND_STEP;
  for (let halving = 0; halving < GROUND_HALVINGS; halving++) {
    const middle = (near + far) / 2;
    if (over(middle) > 0) near = middle;
    else far = middle;
  }
  return new THREE.Vector2(eye.x + toward.x * far, eye.z + toward.z * far);
}

/** How he sees the ground at `place`: 1 seen and 0 unseen all round it, null on the edge of his sight. */
function seenClearly(place: THREE.Vector2): number | null {
  const shares = [[0, 0], [CLEAR, 0], [-CLEAR, 0], [0, CLEAR], [0, -CLEAR]]
    .map(([dx, dz]) => seenShareAt(place.x + dx, place.y + dz));
  if (shares.every((share) => share > 0.9)) return 1;
  if (shares.every((share) => share < 0.1)) return 0;
  return null;
}

/** how high over the ground a mesh must stand to be part of a house (m): a path's kerb is built of a wall's kind,
 *  lies on the ground, hides nothing and is never opened */
const STANDS_LEAST = 0.5;

/** Whether `mesh` stands over the ground, as a wall or a roof does. */
function stands(mesh: THREE.Mesh): boolean {
  const box = new THREE.Box3().setFromObject(mesh);
  const middle = box.getCenter(new THREE.Vector3());
  return box.max.y - groundHeight(middle.x, middle.z) > STANDS_LEAST;
}

/** The scene's meshes of some kinds of see-through shown or hidden (a material hidden hides every mesh of it). */
export function show(kinds: readonly Parameters<typeof seeValue>[0][], shown: boolean, standing: boolean): void {
  const wanted = new Set<SeeThrough>(kinds.map((kind) => seeValue(kind)));
  G.scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = [mesh.material].flat();
    const ofKind = materials.some((material) => {
      const see = (material as THREE.Material & { seeThrough?: SeeThrough }).seeThrough;
      return see !== undefined && wanted.has(see);
    });
    if (!ofKind || (standing && !stands(mesh))) return;
    mesh.userData.ruleShown ??= mesh.visible;
    mesh.visible = shown ? mesh.userData.ruleShown : false;
    if (shown) delete mesh.userData.ruleShown;
  });
}

/** The houses' parts shown or hidden: every mesh of a house's kind of see-through that stands over the ground. */
export function showHouses(shown: boolean): void {
  show(HOUSE_KINDS, shown, true);
}

/** The hall's columns shown or hidden: they thin by a rule of their own, over the houses' parts behind them. */
function showColumns(shown: boolean): void {
  show(['hallColumn'], shown, false);
}

/** A frame as the browser pictures it: the lab's picture of it, and its pixels. */
export interface Shot {
  pictured: Pictured;
  pixels: ImageData;
}

/** The frame pictured after a switch has had its frames. */
export async function shotAfter(lab: Lab, label: string): Promise<Shot> {
  await lab.step(SWITCH_FRAMES);
  const pictured = await lab.screen(label);
  const image = new Image();
  image.src = pictured.tiles[0].png;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d')!;
  context.drawImage(image, 0, 0);
  return { pictured, pixels: context.getImageData(0, 0, image.width, image.height) };
}

/** `shot` with the blocks that break a rule marked: red where ground he sees is still covered, blue where ground
 *  he doesn't see is opened. */
function marked(shot: Shot, read: RuleRead, columns: number): Pictured {
  const canvas = document.createElement('canvas');
  canvas.width = shot.pixels.width;
  canvas.height = shot.pixels.height;
  const context = canvas.getContext('2d')!;
  context.putImageData(shot.pixels, 0, 0);
  const mark = (blocks: number[], colour: string): void => {
    context.fillStyle = colour;
    for (const block of blocks) context.fillRect((block % columns) * BLOCK, Math.floor(block / columns) * BLOCK, BLOCK, BLOCK);
  };
  mark(read.covered, 'rgba(255, 30, 30, 0.6)');
  mark(read.opened, 'rgba(40, 90, 255, 0.6)');
  const tile = { ...shot.pictured.tiles[0], png: canvas.toDataURL('image/png') };
  const notes = ['red: ground he sees, still covered', 'blue: ground he does not see, opened'];
  return { label: `${read.view}: what breaks a rule`, tiles: [tile], notes };
}

/** How much of a cover is left at a block (the three colours from `at`), 0 to 1: null where nothing covers it. */
function coverLeftAt(played: Float32Array, whole: Float32Array, bare: Float32Array, at: number): number | null {
  let apart = 0;
  let along = 0;
  let span = 0;
  for (let channel = 0; channel < 3; channel++) {
    const cover = whole[at + channel] - bare[at + channel];
    apart += Math.abs(cover);
    along += (played[at + channel] - bare[at + channel]) * cover;
    span += cover * cover;
  }
  if (apart < COVERED) return null;
  return Math.min(1, Math.max(0, along / span));
}

/** A roof pictured alone, read: the blocks it covers, the cover left over them and the share still covered. */
function readRoof(played: Float32Array, whole: Float32Array, bare: Float32Array): NonNullable<RuleRead['roof']> {
  const roof = { blocks: 0, left: 0, over: 0 };
  for (let at = 0; at < played.length; at += 3) {
    const left = coverLeftAt(played, whole, bare, at);
    if (left === null) continue;
    roof.blocks++;
    roof.left += left;
    if (left > SEEN_COVER.block) roof.over++;
  }
  const blocks = Math.max(1, roof.blocks);
  return { blocks: roof.blocks, coverLeft: roof.left / blocks, blocksOver: roof.over / blocks };
}

/** Whether a view stands him before the hall's door, near enough for its front wall to open whole. */
function beforeDoor(view: RuleView): boolean {
  const away = Math.hypot(view.at[0] - TERRACE.x, view.at[1] - HALL.inFront);
  return !inHall(view.at[0], view.at[1]) && view.at[1] > HALL.door && away < DOOR_WHOLE.within;
}

/** how far in from a cottage's walls its floor is read as within them (m): past a block's own width on the ground */
const WITHIN_INSET = 0.5;
/** the most of a house's cover opened, on average, over ground within its walls, he outside it */
const WITHIN_OPEN = 0.08;

/** Whether a place on the ground lies within a cottage's walls, `WITHIN_INSET` in from them. */
function inCottage(place: THREE.Vector2): boolean {
  return COTTAGES.some((cottage) => {
    const dx = place.x - cottage.x;
    const dz = place.y - cottage.z;
    const cos = Math.cos(cottage.facing);
    const sin = Math.sin(cottage.facing);
    const alongW = dx * cos - dz * sin;
    const alongD = dx * sin + dz * cos;
    const halfW = (COTTAGE.w / 2) * cottage.size - WITHIN_INSET;
    const halfD = (COTTAGE.d / 2) * cottage.size - WITHIN_INSET;
    return Math.abs(alongW) < halfW && Math.abs(alongD) < halfD;
  });
}

/** A view's blocks read: of those a house covers, the cover left over ground he sees and gone over ground he doesn't. */
function readBlocks(view: RuleView, played: Float32Array, whole: Float32Array, bare: Float32Array, columns: number): RuleRead {
  const rows = played.length / 3 / columns;
  const seen = { blocks: 0, left: 0, over: 0 };
  const unseen = { blocks: 0, opened: 0, over: 0, stands: 0 };
  const within = { blocks: 0, opened: 0 };
  const covered: number[] = [];
  const opened: number[] = [];
  const places = new Map<number, THREE.Vector2>();
  const inside = inHall(view.at[0], view.at[1]);
  const placeOf = (blocks: number[]): string => {
    const place = places.get(blocks[Math.floor(blocks.length / 2)]);
    return place ? ` (as at ${place.x.toFixed(1)}, ${place.y.toFixed(1)})` : '';
  };
  for (let block = 0; block < played.length / 3; block++) {
    const left = coverLeftAt(played, whole, bare, block * 3);
    if (left === null) continue;
    const x = ((block % columns) + 0.5) / columns * 2 - 1;
    const y = 1 - (Math.floor(block / columns) + 0.5) / rows * 2;
    const place = groundThrough(x, y);
    // (a cottage is never walked into here: whatever he sees of its floor, past a wall's soft end or through a gap,
    // nothing of the house opens over it)
    if (place && inCottage(place)) {
      within.blocks++;
      within.opened += 1 - left;
      continue;
    }
    const sees = place && seenClearly(place);
    if (sees === null || sees === undefined) continue;
    places.set(block, place!.clone());
    // (stood in a building its walls open over its own room alone: what he sees out of its door stays behind them)
    if (sees === 1 && inside && !inHall(place!.x, place!.y)) continue;
    if (sees === 1) {
      seen.blocks++;
      seen.left += left;
      if (left > SEEN_COVER.block) {
        seen.over++;
        covered.push(block);
      }
    } else {
      unseen.blocks++;
      unseen.opened += 1 - left;
      if (left > SEEN_COVER.block) unseen.stands++;
      if (1 - left > UNSEEN_OPEN.block) {
        unseen.over++;
        opened.push(block);
      }
    }
  }
  return {
    view: view.name,
    covered,
    opened,
    coveredAt: placeOf(covered),
    openedAt: placeOf(opened),
    seen: { blocks: seen.blocks, coverLeft: seen.left / Math.max(1, seen.blocks), blocksOver: seen.over / Math.max(1, seen.blocks) },
    unseen: {
      blocks: unseen.blocks,
      opened: unseen.opened / Math.max(1, unseen.blocks),
      blocksOver: unseen.over / Math.max(1, unseen.blocks),
    },
    inside,
    stands: unseen.stands / Math.max(1, unseen.blocks),
    within: { blocks: within.blocks, opened: within.opened / Math.max(1, within.blocks) },
  };
}

/** `view` stood at and settled, its room's pipelines made, the game paused and drawn in plain colours: `done` puts
 *  the game back. */
export async function settledAt(lab: Lab, view: RuleView): Promise<{ done: () => Promise<void> }> {
  await standAt(lab, { biome: G.arena.biome, view: 'top', village: true, at: view.at, hour: 12, zoom: view.zoom });
  faceCamera((view.turned * Math.PI) / 180 - Math.PI);
  const drawing = lab.drawing;
  lab.drawing = true;
  // (a room's own pipelines are asked for behind the lobby and compile in the browser's own time: stood in the
  // room before they have, it's drawn as from outside it)
  for (let frame = 0; frame < ROOMS_WAIT_FRAMES && !ROOMS.ready; frame++) {
    await lab.step(1);
    await window.__labClock.realFrame();
  }
  if (!ROOMS.ready) throw new Error(`the rooms' pipelines never compiled in ${ROOMS_WAIT_FRAMES} frames`);
  await lab.step(SETTLE_FRAMES);
  const paused = G.paused;
  const debug = RUST.tune.debug;
  G.paused = true;
  // (a plain colour in the lit shading's place: no shadow of a hidden house missing from the ground)
  RUST.tune.debug = 3;
  const done = async (): Promise<void> => {
    RUST.tune.debug = debug;
    G.paused = paused;
    await lab.step(SWITCH_FRAMES);
    lab.drawing = drawing;
  };
  return { done };
}

/** A view stood at and read: pictured as played, with nothing thinned and with the houses hidden. */
export async function readView(lab: Lab, view: RuleView): Promise<[RuleRead, Pictured[]]> {
  const settled = await settledAt(lab, view);
  try {
    showColumns(false);
    const played = await shotAfter(lab, `${view.name}: as played`);
    // (stood in a building its roof is gone whole, and read alone below: the rest is held against the frame
    // without it, where a wall's ghost isn't read against the roof that covered it)
    // (so it is with the camera over the hall, he outside it: "if camera OR hero is inside the building, we
    // thin the whole roof")
    // (and with any of its room seen from outside it: "if player can see inside the home (anything), we will
    // thin whole roof 100%")
    const underRoof = inHall(view.at[0], view.at[1]) || inHall(G.camera.position.x, G.camera.position.z);
    const roofGone = underRoof || seesIntoRoom(HALL_ROOM);
    if (roofGone) show(INSIDE_ROOFS, false, true);
    // (so is the front wall before whose door he stands: opened whole, whatever he sees past it)
    const atDoor = beforeDoor(view);
    if (atDoor) show(DOOR_WALLS, false, true);
    // (and the rest is read from the frame as played without that wall: its ghost over a wall behind it read
    // as that wall a little opened)
    const rest = atDoor ? await shotAfter(lab, `${view.name}: as played, its front wall hidden`) : played;
    RUST.tune.housesWhole = 1;
    const whole = await shotAfter(lab, `${view.name}: nothing thinned`);
    RUST.tune.housesWhole = 0;
    showHouses(false);
    const bare = await shotAfter(lab, `${view.name}: the houses hidden`);
    const columns = Math.floor(played.pixels.width / BLOCK);
    const colours = [rest, whole, bare].map((shot) => blockColours(shot.pixels));
    const read = readBlocks(view, colours[0], colours[1], colours[2], columns);
    // (seen into from outside: no wall of the room opens on ground past it he sees through it, a strip too thin
    // for a block to hold)
    // (read from the frame as played, its front wall's ghost in it: a wall behind that ghost, itself a ghost, isn't
    // drawn at all, and with the front wall hidden the strip doesn't form)
    if (roofGone && !underRoof) {
      const frames = { played: played.pixels, whole: whole.pixels, bare: bare.pixels };
      read.strips = stripsPastRoom(frames, view.at, HALL_ROOM, groundThrough);
    }
    const pictures = [marked(played, read, columns), whole.pictured, bare.pictured];
    if (roofGone) {
      // (the roof of the building he stands in alone: all of it must be opened, whatever he sees under it)
      show(INSIDE_ROOFS, true, true);
      const roof = await shotAfter(lab, `${view.name}: its roof alone`);
      RUST.tune.housesWhole = 1;
      const roofWhole = await shotAfter(lab, `${view.name}: its roof alone, nothing thinned`);
      RUST.tune.housesWhole = 0;
      const roofRead = readRoof(blockColours(roof.pixels), blockColours(roofWhole.pixels), colours[2]);
      // (seen into from outside alone, its roof may be out of the frame: nothing of it to hold then)
      if (underRoof || roofRead.blocks >= BLOCKS_LEAST) read.roof = roofRead;
      pictures.push(roof.pictured);
    }
    if (atDoor) {
      show(DOOR_WALLS, true, true);
      const wall = await shotAfter(lab, `${view.name}: its front wall alone`);
      RUST.tune.housesWhole = 1;
      const wallWhole = await shotAfter(lab, `${view.name}: its front wall alone, nothing thinned`);
      RUST.tune.housesWhole = 0;
      read.doorWall = readRoof(blockColours(wall.pixels), blockColours(wallWhole.pixels), colours[2]);
      pictures.push(wall.pictured);
    }
    return [read, pictures];
  } finally {
    showHouses(true);
    showColumns(true);
    RUST.tune.housesWhole = 0;
    await settled.done();
  }
}

const percent = (share: number): string => `${Math.round(share * 100)}%`;

/** A view's read as a line, and what of the three rules it breaks. */
export function judged(read: RuleRead): Checked {
  const { seen, unseen } = read;
  const roof = read.roof;
  const stood = roof
    ? `, ${percent(read.stands)} standing; he or the camera is inside: of its roof alone ${percent(roof.coverLeft)} left `
      + `(${percent(roof.blocksOver)} of ${roof.blocks} blocks still covered)`
    : '';
  const wall = read.doorWall;
  const atDoor = wall
    ? `; he stands before its door: of its front wall alone ${percent(wall.coverLeft)} left `
      + `(${percent(wall.blocksOver)} of ${wall.blocks} blocks still covered)`
    : '';
  const line = `${read.view}: over ground he sees ${percent(seen.coverLeft)} of the cover left `
    + `(${percent(seen.blocksOver)} of ${seen.blocks} blocks still covered); over ground he doesn't `
    + `${percent(unseen.opened)} opened (${percent(unseen.blocksOver)} of ${unseen.blocks} blocks open${stood})${atDoor}`
    + (read.strips ? `; its walls opened on ground past the room: ${read.strips.pixels} pixels` : '')
    + (read.within.blocks ? `; over a cottage's own floor ${percent(read.within.opened)} opened (${read.within.blocks} blocks)` : '');
  const wrong: string[] = [];
  if (seen.blocks >= BLOCKS_LEAST && (seen.coverLeft > RUST.tune.houseLeft * COVER_FIRM + SEEN_COVER.overLeft || seen.blocksOver > SEEN_COVER.blocksOver)) {
    wrong.push(`ground he sees is still covered${read.coveredAt}`);
  }
  const enough = unseen.blocks >= BLOCKS_LEAST;
  if (enough && !read.inside && (unseen.opened > UNSEEN_OPEN.mean || unseen.blocksOver > UNSEEN_OPEN.blocksOver)) {
    wrong.push(`ground he does not see is opened${read.openedAt}`);
  }
  const roofLeft = INSIDE.roofLeft;
  if (roof && (roof.blocks < BLOCKS_LEAST || roof.coverLeft > roofLeft || roof.blocksOver > INSIDE.roofBlocksOver)) {
    wrong.push('he or the camera is inside and its roof is not opened whole');
  }
  const wallLeft = RUST.tune.houseLeft + SEEN_COVER.overLeft;
  if (wall && wall.blocks >= BLOCKS_LEAST && (wall.coverLeft > wallLeft || wall.blocksOver > SEEN_COVER.blocksOver)) {
    wrong.push('he stands before its door and its front wall is not opened whole');
  }
  if (enough && read.inside && read.stands < INSIDE.stands) wrong.push('he is inside and its walls do not stand');
  if (read.within.blocks >= BLOCKS_LEAST && read.within.opened > WITHIN_OPEN) {
    wrong.push('he is outside a cottage and it is opened over its own floor');
  }
  if (read.strips && read.strips.pixels > STRIP_MOST) {
    wrong.push(`its walls are opened on ground past the room he sees through it, ${read.strips.pixels} pixels${read.strips.at}`);
  }
  return wrong.length ? failed(`${line}: ${wrong.join(', ')}`) : passed(line);
}

/** Every view (or those whose name holds `only`) read and judged, and the pictures of those that break a rule. */
export async function houseRule(lab: Lab, only = ''): Promise<[Checked[], Pictured[]]> {
  const checks: Checked[] = [];
  const moments: Pictured[] = [];
  for (const view of RULE_VIEWS.filter((each) => each.name.includes(only))) {
    const [read, pictures] = await readView(lab, view);
    const check = judged(read);
    checks.push(check);
    if (check.problems.length) moments.push(...pictures);
  }
  // (and a column that stands over him, a ghost from foot to top: a measure of its own, `rustColumnOver.ts`)
  const { COLUMN_VIEW_NAME, columnOverHim } = await import('./rustColumnOver');
  if (COLUMN_VIEW_NAME.includes(only)) {
    const [check, pictures] = await columnOverHim(lab);
    checks.push(check);
    moments.push(...pictures);
  }
  return [checks, moments];
}

/** the view the strips were played at, and the canary's: its walls read by their terrace's floor (`rust.wallsSeenIn` 0) */
const STRIP_VIEW = 'at the door, seeing in, as played';

/** the views `lab rustcheck` holds the rule from (all of them: `lab houserule`), and the one its canary reads */
const CHECKED_VIEWS = ['the portico case, camera before the hall', 'the portico case, camera from the east',
  'the portico case, camera over the hall', 'the portico case, camera from the west', 'beside a cottage', STRIP_VIEW];
// (not one before the hall's door: there its roof and front wall are read alone, and nothing else covers ground he sees)
const CANARY_VIEW = 'terrace end, from the side';
/** the share the canary leaves of a house over ground he sees, and the least of the cover it must then read left */
const CANARY_LEFT = 0.85;
const CANARY_LEAST = 0.6;

/** `lab rustcheck`'s part: the portico case from four sides and a cottage held to the rules, and the canary, which must read ground he
 *  sees as covered (most of each house left there, as a share too small leaves it). */
export async function houseRuleHolds(lab: Lab): Promise<Checked> {
  const broken: string[] = [];
  for (const view of RULE_VIEWS.filter((each) => CHECKED_VIEWS.includes(each.name))) {
    const [read] = await readView(lab, view);
    broken.push(...judged(read).problems);
  }
  const left = RUST.tune.houseLeft;
  RUST.tune.houseLeft = CANARY_LEFT;
  try {
    const [read] = await readView(lab, RULE_VIEWS.find((each) => each.name === CANARY_VIEW)!);
    if (read.seen.coverLeft < CANARY_LEAST) {
      broken.push(`canary: with ${percent(CANARY_LEFT)} of a house left only ${percent(read.seen.coverLeft)} reads left over ground he sees`);
    }
  } finally {
    RUST.tune.houseLeft = left;
  }
  RUST.tune.wallsSeenIn = 0;
  try {
    const [read] = await readView(lab, RULE_VIEWS.find((each) => each.name === STRIP_VIEW)!);
    const pixels = read.strips?.pixels ?? 0;
    if (pixels <= STRIP_MOST) broken.push(`canary: a room's walls read by their terrace's floor, only ${pixels} pixels read opened past the room`);
  } finally {
    RUST.tune.wallsSeenIn = 1;
  }
  const { columnOverHim } = await import('./rustColumnOver');
  broken.push(...(await columnOverHim(lab))[0].problems);
  if (broken.length) return failed(`a house from above: ${broken.join('; ')}`);
  return passed(`a house from above opens over ground he sees alone: the portico case from four sides, and a cottage (lab houserule: all)`);
}
