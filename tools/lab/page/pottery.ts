// `lab pottery`: the tavern's shelf pottery alone (#733), the hero put straight into the room (no door, no village):
// each thing on a shelf read against its board (standing on it, clear of the things beside it), what the pottery costs
// the room's frame (the frame drawn with it and without it, counted by the engine), and pictured close up and as the
// player sees it. `--canary` lifts one thing off its board and slides the next into it, both of which must be found.
import * as THREE from 'three';
import type { Lab, Pictured, Report } from './lab';
import { G } from '../../../src/state';
import { enterRoom } from '../../../src/game/rooms';
import { partBoxes, stand, viewAs } from './houses';
import { countedFrame } from './villageHallCull';
import { toVillage } from './village';
import { qualityLevel, useQuality } from '../../../src/core/quality';

export interface PotteryOptions {
  canary: boolean;
}

/** the most a thing's foot may stand over its board (m) */
const FLOATS = 0.004;
/** the most its lowest point may be below the board's top (m) */
const SUNK = 0.003;
/** the most two things' boxes may overlap along a shelf (m): a plate turned a little is boxed wider than it is */
const OVERLAP = 0.03;
/** the most a pair's front plate may reach behind the back one's front (m): leant alike, it rests on its rim */
const PLATES_CUT = 0.003;
/** the most the pottery may add to the room's frame: a draw for its clay, its pewter and its slipware */
const DRAWS_MOST = 3;
/** its triangles' budget, the room's frame from the stand */
const TRIANGLES_MOST = 20000;
/** the canary's plants (m): a thing lifted off its board, and the next slid along into it */
const LIFT = 0.03;
/** the frames a level's switch settles for */
const SETTLE_LEVEL = 30;
const SLIDE = 0.1;
/** the canary's third plant (m): a pair's front plate pushed back into the back one, as #987 first had it */
const PUSH = 0.03;
/** the names `world/potShelf.ts` gives the pottery's group and a shelf's boards: spelt here, not imported, so a commit
 *  before them (an A/B's main) still loads this and is pictured */
const POTTERY = 'pottery';
const PLATE_SHELF = 'plate shelf';
/** where the hero stands to see each side's shelves over the shoulder, and the way he faces (0 is +z) */
const STANDS: readonly { label: string; at: readonly [number, number]; facing: number }[] = [
  { label: 'pottery-in-the-room-left', at: [-2.0, -1.2], facing: -2.7 },
  { label: 'pottery-in-the-room-right', at: [1.4, -1.2], facing: 2.75 },
];

/** A shelf's board: its top and its extent along the wall and out from it. */
interface Board {
  top: number;
  box: THREE.Box3;
}

/** A thing on a shelf (a plate, a jug, bowls stacked, beakers), boxed as its parts stand. */
interface Thing {
  kind: string;
  box: THREE.Box3;
  /** each of its parts' boxes as the merge kept them (a pair of plates: two) */
  parts: THREE.Box3[];
}

/** The boards of each plate shelf in the room: a box 4 cm thick and over a metre long among each shelf's parts. */
function boardsIn(room: THREE.Object3D): Board[] {
  const boards: Board[] = [];
  room.traverse((object) => {
    if (object.name !== PLATE_SHELF) return;
    for (const box of partBoxes(object)) {
      const size = box.getSize(new THREE.Vector3());
      if (Math.abs(size.y - 0.04) < 0.002 && Math.max(size.x, size.z) > 1) boards.push({ top: box.max.y, box });
    }
  });
  return boards;
}

/** Each thing in the pottery, its parts' boxes joined. */
function thingsIn(pottery: THREE.Object3D): Thing[] {
  return pottery.children.filter((child) => child.name.startsWith('pot ')).map((child) => {
    const box = new THREE.Box3();
    const parts = partBoxes(child);
    for (const part of parts) box.union(part);
    return { kind: child.name.slice(4), box, parts };
  });
}

/** The board under a thing: the one whose top it's nearest over, with its middle over the board. */
function boardUnder(thing: Thing, boards: readonly Board[]): Board | undefined {
  const middle = thing.box.getCenter(new THREE.Vector3());
  const under = boards.filter((board) => middle.x >= board.box.min.x && middle.x <= board.box.max.x
    && middle.z >= board.box.min.z - 0.05 && middle.z <= board.box.max.z + 0.05);
  return under.sort((a, b) => Math.abs(thing.box.min.y - a.top) - Math.abs(thing.box.min.y - b.top))[0];
}

/** Every point of the pottery as drawn, in the world: its merged meshes' vertices. */
function pointsOf(pottery: THREE.Object3D): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  pottery.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const position = mesh.geometry.attributes.position;
    for (let k = 0; k < position.count; k++) {
      points.push(new THREE.Vector3().fromBufferAttribute(position, k).applyMatrix4(mesh.matrixWorld));
    }
  });
  return points;
}

/** A thing's foot: the lowest of the pottery's points within its box. Its box alone is loose round what's turned (a
 *  plate leant back reached 1.7 cm below where it stands), its points are where it's drawn. */
function footOf(thing: Thing, points: readonly THREE.Vector3[]): number {
  const within = thing.box.clone().expandByScalar(0.001);
  let foot = Infinity;
  for (const point of points) if (within.containsPoint(point)) foot = Math.min(foot, point.y);
  return foot;
}

/** Each pair of plates: the front one clear of the back one's front, as it rests on its rim (out from the wall is +z
 *  in the room's frame here, the back wall's shelves read alone). What cuts in, and the most found. */
function readPairs(things: readonly Thing[], lines: string[], problems: string[]): void {
  let most = -Infinity;
  for (const thing of things) {
    if (thing.kind !== 'plates') continue;
    if (thing.parts.length !== 2) throw new Error(`lab: pottery: a pair of plates of ${thing.parts.length} parts`);
    const [back, front] = [...thing.parts].sort((a, b) => a.min.z - b.min.z);
    const cut = back.max.z - front.min.z;
    most = Math.max(most, cut);
    if (cut > PLATES_CUT) problems.push(`a pair's plates cut ${(cut * 100).toFixed(1)} cm into each other`);
  }
  if (most === -Infinity) return;
  lines.push(`a pair's front plate reaches at most ${(most * 100).toFixed(1)} cm behind the back one's front`);
}

/** Each thing on its board and clear of the next along it: what's wrong, and the most found of each. */
function readShelves(things: readonly Thing[], boards: readonly Board[], points: readonly THREE.Vector3[],
  lines: string[], problems: string[]): void {
  let highest = -Infinity;
  let lowest = Infinity;
  let mostOverlap = -Infinity;
  for (const board of boards) {
    const on = things.filter((thing) => boardUnder(thing, boards) === board);
    on.sort((a, b) => a.box.min.x - b.box.min.x);
    lines.push(`a shelf at ${board.top.toFixed(2)} m: ${on.map((thing) => thing.kind).join(', ')}`);
    for (const [k, thing] of on.entries()) {
      const over = footOf(thing, points) - board.top;
      highest = Math.max(highest, over);
      lowest = Math.min(lowest, over);
      if (over > FLOATS) problems.push(`a ${thing.kind} stands ${(over * 100).toFixed(1)} cm over its shelf`);
      if (over < -SUNK) problems.push(`a ${thing.kind} is ${(-over * 100).toFixed(1)} cm into its shelf`);
      const next = on[k + 1];
      if (!next) continue;
      const overlap = thing.box.max.x - next.box.min.x;
      mostOverlap = Math.max(mostOverlap, overlap);
      if (overlap <= OVERLAP) continue;
      problems.push(`a ${thing.kind} and a ${next.kind} overlap by ${(overlap * 100).toFixed(1)} cm`);
    }
  }
  const unshelved = things.filter((thing) => !boardUnder(thing, boards));
  for (const thing of unshelved) problems.push(`a ${thing.kind} stands over no shelf`);
  lines.push(`their feet: from ${(lowest * 100).toFixed(1)} to ${(highest * 100).toFixed(1)} cm over their boards; `
    + `the most two overlap along a shelf ${(mostOverlap * 100).toFixed(1)} cm (boxed)`);
}

/** The room's frame with the pottery and without it: what it adds, against its budget. */
function costSaid(lab: Lab, pottery: THREE.Object3D, lines: string[], problems: string[]): void {
  const whole = countedFrame(lab);
  pottery.visible = false;
  try {
    const without = countedFrame(lab);
    const draws = whole.draws - without.draws;
    const triangles = whole.triangles - without.triangles;
    lines.push(`the room's frame: ${whole.draws} draws, ${whole.triangles} triangles; the pottery ${draws} draws and `
      + `${triangles} triangles of it`);
    if (draws <= 0 || triangles <= 0) problems.push('the frame drew none of the pottery');
    if (draws > DRAWS_MOST) problems.push(`the pottery is ${draws} draws, past its ${DRAWS_MOST}`);
    if (triangles > TRIANGLES_MOST) problems.push(`the pottery is ${triangles} triangles, past its ${TRIANGLES_MOST}`);
  } finally {
    pottery.visible = true;
  }
}

/** the widest of the slipware's map now (px): the designs' atlas, or Very low's plain few pixels */
function slipwareWidth(pottery: THREE.Object3D): number {
  let widest = 0;
  pottery.traverse((object) => {
    const material = (object as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    const image = material?.map?.image as { width?: number } | undefined;
    widest = Math.max(widest, image?.width ?? 0);
  });
  return widest;
}

/** The plates on Very low: their designs' map swapped for a plain one (`plainSlipware`), pictured, and back. */
async function plainOnVeryLow(lab: Lab, pottery: THREE.Object3D, lines: string[],
  problems: string[]): Promise<Pictured[]> {
  const booted = qualityLevel();
  const designs = slipwareWidth(pottery);
  try {
    useQuality('verylow');
    await lab.step(SETTLE_LEVEL);
    const plain = slipwareWidth(pottery);
    lines.push(`the slipware's map: ${designs} px wide at ${booted}, ${plain} at verylow`);
    if (designs < 256) problems.push(`the slipware's designs are ${designs} px wide at ${booted}`);
    if (plain > 16) problems.push(`the slipware keeps a map ${plain} px wide at verylow, not a plain one`);
    return [lab.picture('pottery-left-low-verylow', ['back'], [], {
      at: new THREE.Vector3(-4.3, 1.9, -3.85), distance: 1.7,
    })];
  } finally {
    useQuality(booted);
    await lab.step(SETTLE_LEVEL);
  }
}

/** Plant the canary's two faults in the boxes read: the first thing lifted, the second slid into it. */
function plant(things: Thing[]): void {
  if (things.length < 2) throw new Error('lab: pottery: under two things on the shelves to plant in');
  things[0].box.translate(new THREE.Vector3(0, LIFT, 0));
  things[1].box.translate(new THREE.Vector3(-SLIDE, 0, 0));
  const pair = things.find((thing) => thing.kind === 'plates');
  if (!pair) throw new Error('lab: pottery: no pair of plates to plant in');
  const front = [...pair.parts].sort((a, b) => b.min.z - a.min.z)[0];
  front.translate(new THREE.Vector3(0, 0, -PUSH));
}

/** The pottery pictured: each shelf close, the wall's shelves whole, and the room as the player stands in it. */
async function pictured(lab: Lab): Promise<Pictured[]> {
  // (the close-ups turn with the hero's facing: taken with him facing the wall square on)
  await stand(lab, [0, -1], Math.PI);
  const moments = [
    lab.picture('pottery-left', ['back'], [], { at: new THREE.Vector3(-4.3, 2.5, -3.85), distance: 1.7 }),
    lab.picture('pottery-left-low', ['back'], [], { at: new THREE.Vector3(-4.3, 1.9, -3.85), distance: 1.7 }),
    lab.picture('pottery-right', ['back'], [], { at: new THREE.Vector3(3.0, 2.1, -3.85), distance: 1.7 }),
    lab.picture('pottery-wall', ['back'], [], { at: new THREE.Vector3(-4.3, 2.05, -3.85), distance: 5 }),
  ];
  for (const { label, at, facing } of STANDS) {
    await stand(lab, at, facing);
    moments.push(await lab.screen(label));
  }
  return moments;
}

export async function pottery(lab: Lab, options: PotteryOptions): Promise<Report> {
  await toVillage(lab);
  lab.drawing = true;
  enterRoom('tavern');
  await lab.until(() => G.arena.room === 'tavern', 600, 'pottery: the tavern never opened');
  await viewAs(lab, 'third');
  const room = G.arena.rooms!.tavern.group;
  room.updateMatrixWorld(true);
  const moments = await pictured(lab);
  const pots = room.getObjectByName(POTTERY);
  // (a commit before the pottery was named, an A/B's main: pictured, nothing to read)
  if (!pots) return { text: 'pottery: none named in this commit: pictured alone', problems: [], moments };
  const boards = boardsIn(room);
  const things = thingsIn(pots);
  if (!boards.length || !things.length) throw new Error('lab: pottery: no shelves or no things on them to read');
  const lines = [`pottery: ${things.length} things on ${boards.length} shelves`];
  const problems: string[] = [];
  // (counted from the room's middle facing the shelves, as the close-ups are taken)
  await stand(lab, [0, -1], Math.PI);
  costSaid(lab, pots, lines, problems);
  if (!options.canary) {
    readShelves(things, boards, pointsOf(pots), lines, problems);
    readPairs(things, lines, problems);
    moments.push(...await plainOnVeryLow(lab, pots, lines, problems));
    return { text: lines.join('\n'), problems, moments };
  }
  plant(things);
  const planted: string[] = [];
  readShelves(things, boards, pointsOf(pots), lines, planted);
  readPairs(things, lines, planted);
  const lifted = planted.some((problem) => problem.includes('over its shelf'));
  const slid = planted.some((problem) => problem.includes('overlap by'));
  const cut = planted.some((problem) => problem.includes('cut'));
  lines.push(`canary: a thing lifted ${LIFT * 100} cm ${lifted ? 'found' : 'unseen'}; `
    + `the next slid ${SLIDE * 100} cm into it ${slid ? 'found' : 'unseen'}; `
    + `a pair's front plate pushed ${PUSH * 100} cm into the back one ${cut ? 'found' : 'unseen'}`);
  if (!lifted || !slid || !cut) problems.push('canary: a planted fault went unseen');
  return { text: lines.join('\n'), problems, moments };
}
