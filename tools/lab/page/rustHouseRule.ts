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
import { standAt } from './draws';
import { faceCamera } from '../../../src/core/renderer';
import { seeValue, type SeeThrough } from '../../../src/core/seeThrough';
import { seenShareAt } from '../../../src/core/sight';
import { inHall } from '../../../src/data/village';
import { RUST } from '../../../src/engine';
import { ROOMS } from '../../../src/engine/ahead';
import { G } from '../../../src/state';
import { groundHeight } from '../../../src/world/ground';

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
  { name: 'foot of the stair', at: [-1.5, -9.0], turned: 0, zoom: 0.5 },
  { name: 'before the hall, camera past its roof', at: [-0.6, -5.9], turned: 178, zoom: 0.5 },
  { name: 'behind the hall', at: [-1.5, -36], turned: 180, zoom: 0.71 },
  { name: 'just inside the door', at: [-1.5, -15.5], turned: 0, zoom: 0.5 },
  { name: 'inside the hall', at: [-1.5, -20], turned: 0, zoom: 0.5 },
  { name: 'inside the hall, camera from its far end', at: [-1.5, -20], turned: 180, zoom: 0.5 },
  // (the eye brought down under the roof and the walls' tops: from play, "also bug at this zoom level")
  { name: 'inside the hall, zoomed in', at: [-1.5, -22], turned: 0, zoom: 0.4 },
  { name: 'inside the hall, zoomed in from the east', at: [-1.5, -22], turned: 90, zoom: 0.4 },
  { name: 'beside a cottage', at: [-12.6, 13.2], turned: 0, zoom: 0.5 },
  { name: 'beside a cottage, camera over it', at: [-12.6, 13.2], turned: 180, zoom: 0.5 },
  { name: 'between two cottages', at: [-15.0, 10.8], turned: 90, zoom: 0.5 },
];

/** the kinds of see-through a house is built of (`kinds` in core/seeThrough.ts) */
const HOUSE_KINDS = ['built', 'roof', 'gable', 'hallFront', 'hallBack', 'hallBeam', 'hallEast', 'hallWest',
  'hallRoof'] as const;
/** the roof of the one building he can stand in (the hall of heroes) */
const INSIDE_ROOFS = ['hallRoof'] as const;
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
function show(kinds: readonly Parameters<typeof seeValue>[0][], shown: boolean, standing: boolean): void {
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
function showHouses(shown: boolean): void {
  show(HOUSE_KINDS, shown, true);
}

/** The hall's columns shown or hidden: they thin by a rule of their own, over the houses' parts behind them. */
function showColumns(shown: boolean): void {
  show(['hallColumn'], shown, false);
}

/** A frame as the browser pictures it: the lab's picture of it, and its pixels. */
interface Shot {
  pictured: Pictured;
  pixels: ImageData;
}

/** The frame pictured after a switch has had its frames. */
async function shotAfter(lab: Lab, label: string): Promise<Shot> {
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

/** A view's blocks read: of those a house covers, the cover left over ground he sees and gone over ground he doesn't. */
function readBlocks(view: RuleView, played: Float32Array, whole: Float32Array, bare: Float32Array, columns: number): RuleRead {
  const rows = played.length / 3 / columns;
  const seen = { blocks: 0, left: 0, over: 0 };
  const unseen = { blocks: 0, opened: 0, over: 0, stands: 0 };
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
  };
}

/** A view stood at and read: pictured as played, with nothing thinned and with the houses hidden. */
export async function readView(lab: Lab, view: RuleView): Promise<[RuleRead, Pictured[]]> {
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
  const tune = { debug: RUST.tune.debug };
  G.paused = true;
  try {
    // (a plain colour in the lit shading's place: no shadow of a hidden house missing from the ground)
    RUST.tune.debug = 3;
    showColumns(false);
    const played = await shotAfter(lab, `${view.name}: as played`);
    // (stood in a building its roof is gone whole, and read alone below: the rest is held against the frame
    // without it, where a wall's ghost isn't read against the roof that covered it)
    if (inHall(view.at[0], view.at[1])) show(INSIDE_ROOFS, false, true);
    RUST.tune.housesWhole = 1;
    const whole = await shotAfter(lab, `${view.name}: nothing thinned`);
    RUST.tune.housesWhole = 0;
    showHouses(false);
    const bare = await shotAfter(lab, `${view.name}: the houses hidden`);
    const columns = Math.floor(played.pixels.width / BLOCK);
    const colours = [played, whole, bare].map((shot) => blockColours(shot.pixels));
    const read = readBlocks(view, colours[0], colours[1], colours[2], columns);
    const pictures = [marked(played, read, columns), whole.pictured, bare.pictured];
    if (read.inside) {
      // (the roof of the building he stands in alone: all of it must be opened, whatever he sees under it)
      show(INSIDE_ROOFS, true, true);
      const roof = await shotAfter(lab, `${view.name}: its roof alone`);
      RUST.tune.housesWhole = 1;
      const roofWhole = await shotAfter(lab, `${view.name}: its roof alone, nothing thinned`);
      RUST.tune.housesWhole = 0;
      read.roof = readRoof(blockColours(roof.pixels), blockColours(roofWhole.pixels), colours[2]);
      pictures.push(roof.pictured);
    }
    return [read, pictures];
  } finally {
    showHouses(true);
    showColumns(true);
    RUST.tune.debug = tune.debug;
    RUST.tune.housesWhole = 0;
    G.paused = paused;
    await lab.step(SWITCH_FRAMES);
    lab.drawing = drawing;
  }
}

const percent = (share: number): string => `${Math.round(share * 100)}%`;

/** A view's read as a line, and what of the three rules it breaks. */
export function judged(read: RuleRead): Checked {
  const { seen, unseen } = read;
  const roof = read.roof;
  const stood = roof
    ? `, ${percent(read.stands)} standing; he is inside: of its roof alone ${percent(roof.coverLeft)} left `
      + `(${percent(roof.blocksOver)} of ${roof.blocks} blocks still covered)`
    : '';
  const line = `${read.view}: over ground he sees ${percent(seen.coverLeft)} of the cover left `
    + `(${percent(seen.blocksOver)} of ${seen.blocks} blocks still covered); over ground he doesn't `
    + `${percent(unseen.opened)} opened (${percent(unseen.blocksOver)} of ${unseen.blocks} blocks open${stood})`;
  const wrong: string[] = [];
  if (seen.blocks >= BLOCKS_LEAST && (seen.coverLeft > RUST.tune.houseLeft + SEEN_COVER.overLeft || seen.blocksOver > SEEN_COVER.blocksOver)) {
    wrong.push(`ground he sees is still covered${read.coveredAt}`);
  }
  const enough = unseen.blocks >= BLOCKS_LEAST;
  if (enough && !read.inside && (unseen.opened > UNSEEN_OPEN.mean || unseen.blocksOver > UNSEEN_OPEN.blocksOver)) {
    wrong.push(`ground he does not see is opened${read.openedAt}`);
  }
  const roofLeft = INSIDE.roofLeft;
  if (roof && (roof.blocks < BLOCKS_LEAST || roof.coverLeft > roofLeft || roof.blocksOver > INSIDE.roofBlocksOver)) {
    wrong.push('he is inside and its roof is not opened whole');
  }
  if (enough && read.inside && read.stands < INSIDE.stands) wrong.push('he is inside and its walls do not stand');
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
  return [checks, moments];
}

/** the views `lab rustcheck` holds the rule from (all of them: `lab houserule`), and the one its canary reads */
const CHECKED_VIEWS = ['the portico case, camera before the hall', 'the portico case, camera from the east',
  'the portico case, camera over the hall', 'the portico case, camera from the west', 'beside a cottage'];
const CANARY_VIEW = 'the portico case, camera from the east';
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
  if (broken.length) return failed(`a house from above: ${broken.join('; ')}`);
  return passed(`a house from above opens over ground he sees alone: the portico case from four sides, and a cottage (lab houserule: all)`);
}
