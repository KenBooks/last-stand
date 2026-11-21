// `lab village`'s sweep: the village's frame read from stands laid out from its data (the square looking every way,
// before each cottage's door, at each way out, in the hall of heroes and before it, in each house's room), over the
// shoulder and from above, at midnight and noon, at the boot's level and at Very low (switched live, as a player
// switches it, the heroes' detail held at the boot's: what's made at boot for a level stays the boot's). Each reading's draws, triangles and the materials and programs it switched between are held
// to a budget (`villageBudgets.ts`), and its pixels with every cull registered (`world/culls.ts`) to those with none.
// From the owner, after the hall's culls each had a check of their own: "every future change to the village will need
// to rework everything, its not sustainable". A change that adds draws anywhere, or a cull that hides what's seen,
// fails here wherever it shows, without a check of its own. `canary` reads the budgets with every cull held off (the
// hall's inside and outside drawn whole) and the culled frames with the hall leaving out all it may, seen or not:
// both must fail.
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { holdHour } from '../../../src/game/clock';
import { groundHeight } from '../../../src/world/ground';
import { faceCamera, viewMode, type ViewMode } from '../../../src/core/renderer';
import { COTTAGES, ENTRANCES, HALL, TERRACE, exitPlace, portalPlace } from '../../../src/data/village';
import { setHallCull } from '../../../src/world/hallPortal';
import { cullNames, holdCullsOff } from '../../../src/world/culls';
import { qualityLevel, useQuality } from '../../../src/core/quality';
import { heroDetail, setHeroDetail } from '../../../src/entities/models/detail';
import { enterRoom, leaveRoom, roomHere } from '../../../src/game/rooms';
import { ROOM_IDS, insideOf, type RoomId } from '../../../src/data/houses';
import type { QualityLevel } from '../../../src/data/quality';
import { VILLAGE_SPOT } from './draws';
import { changedShare, countedFrame, viewBy, type Counted } from './villageHallCull';
import { materialSwitches } from './materialSwitches';
import { programSwitches } from './programSwitches';
import { BUDGETS, type Budget } from './villageBudgets';
import type { LightsChecked } from './villageLights';
import type { BiomeId } from '../../../src/data/biomes';

/** the hours read, and the frames given to settle after a move, a turn of the hour or the culls let run again (the
 *  heroes held still are merged a slice a frame) */
const HOURS = [0, 12];
const SETTLE = 20;
/** the levels read besides the boot's: the one most players with a slow device settle on */
const LOW_LEVEL: QualityLevel = 'verylow';
/** the most frames a room's door may take to open (its warm-up's bar) */
const DOOR_FRAMES = 600;
/** how many times a moment is read for one that stands still before the sweep gives up */
const STILL_TRIES = 5;
/** the square's headings, a turn split into this many */
const HEADINGS = 8;
/** how far before a cottage's door he stands (m, past its size), and how far in from the hall's door */
const BEFORE_DOOR = 5;
const IN_HALL = 7;
/** how far over its budget each count may read (draws, triangles, materials switched, programs switched): a share of
 *  it, and at least a few. The yard's foes and the wind move between boots, and a small count's 2% is under one (Very
 *  low's programs switched read 50 of 49 on a second boot); the switches move more with the night's lamps than the
 *  draws do (the square facing 0 at midnight read 55 to 58 programs switched from boot to boot) */
const OVER = [0.02, 0.02, 0.05, 0.05];
const OVER_LEAST = [2, 2, 4, 4];
/** how far under its budget a count reads before the line says to lower it (a share) */
const UNDER = 0.1;
/** the most of the frame's pixels the culls may change: one of the dais's heroes culled whole is 0.013% */
const MOST_CHANGED = 0.00002;

/** Where the hero stands for a reading: its name, the spot, the way he and the camera face (rad about y: 0 faces
 *  +z), whether it's read from above too (from above, the way he faces changes little), and the house whose room
 *  it's in (none: the village). */
interface Stand { name: string; at: readonly [number, number]; facing: number; above: boolean; room?: RoomId }

/** The way from (x, z) to (tx, tz), as a facing. */
const toward = (x: number, z: number, tx: number, tz: number): number => Math.atan2(tx - x, tz - z);

/** The stands, laid out from the village's data: a cottage or a way out added to it is read without a word here. */
export function stands(): Stand[] {
  const list: Stand[] = [];
  for (let k = 0; k < HEADINGS; k++) {
    const degrees = Math.round((360 / HEADINGS) * k);
    list.push({ name: `square facing ${degrees}`, at: VILLAGE_SPOT, facing: (k / HEADINGS) * Math.PI * 2, above: k === 0 });
  }
  COTTAGES.forEach((cottage, k) => {
    const out = BEFORE_DOOR + cottage.size * 3;
    const x = cottage.x + Math.sin(cottage.facing) * out;
    const z = cottage.z + Math.cos(cottage.facing) * out;
    list.push({ name: `before cottage ${k}`, at: [x, z], facing: toward(x, z, cottage.x, cottage.z), above: true });
  });
  for (const id of Object.keys(ENTRANCES) as BiomeId[]) {
    const exit = exitPlace(id);
    const portal = portalPlace(id);
    list.push({ name: `come back from the ${id}`, at: [exit.x, exit.z], facing: exit.facing, above: true });
    const out = toward(exit.x, exit.z, portal.x, portal.z);
    list.push({ name: `at the way out to the ${id}`, at: [exit.x, exit.z], facing: out, above: false });
  }
  const inHall: readonly [number, number] = [TERRACE.x, HALL.door - IN_HALL];
  list.push({ name: 'in the hall facing out', at: inHall, facing: 0, above: false });
  list.push({ name: 'in the hall facing the dais', at: inHall, facing: Math.PI, above: false });
  for (const room of ROOM_IDS) {
    const entry = insideOf(room);
    const at: readonly [number, number] = [entry.x, entry.z];
    list.push({ name: `in the ${room} facing in`, at, facing: entry.facing, above: true, room });
    list.push({ name: `in the ${room} facing its door`, at, facing: entry.facing + Math.PI, above: false, room });
  }
  return list;
}

/** One reading's counts, as its budget has them. */
const countsOf = (frame: Counted, materials: number, programs: number): Budget =>
  [frame.draws, frame.triangles, materials, programs];

/** The frame drawn now, counted: its draws and triangles, and the materials and programs switched in it. */
function readFrame(lab: Lab): { frame: Counted; counts: Budget } {
  const materialsBefore = materialSwitches();
  const programsBefore = programSwitches();
  const frame = countedFrame(lab);
  const counts = countsOf(frame, materialSwitches() - materialsBefore, programSwitches() - programsBefore);
  return { frame, counts };
}

/** The hero taken into `room` as the door's E takes him (out of the one he's in first), or out to the village. */
async function goInto(lab: Lab, room: RoomId | undefined): Promise<void> {
  if ((roomHere() ?? undefined) === room) return;
  if (roomHere()) leaveRoom();
  if (!room) return;
  enterRoom(room);
  for (let frame = 0; frame < DOOR_FRAMES && roomHere() !== room; frame++) await lab.step(1);
  if (roomHere() !== room) throw new Error(`lab: village: sweep: the ${room}'s door never opened`);
}

/** The hero put on `stand`, the camera behind him, let settle. */
async function standOn(lab: Lab, stand: Stand): Promise<void> {
  await goInto(lab, stand.room);
  const [x, z] = stand.at;
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(x, groundHeight(x, z), z), stand.facing);
  faceCamera(stand.facing);
  await lab.step(SETTLE);
}

/** the counts' names, in a budget's order */
const COUNTS = ['draws', 'triangles', 'materials switched', 'programs switched'];

/** What one reading found against its budget: the counts over it, and those well under it. */
function againstBudget(counts: Budget, budget: Budget | undefined): { over: string[]; under: string[] } {
  const over: string[] = [];
  const under: string[] = [];
  if (!budget) return { over, under };
  counts.forEach((count, k) => {
    if (count > budget[k] + Math.max(budget[k] * OVER[k], OVER_LEAST[k])) over.push(`${COUNTS[k]} ${count} of ${budget[k]}`);
    else if (count < budget[k] * (1 - UNDER)) under.push(`${COUNTS[k]} ${count} of ${budget[k]}`);
  });
  return { over, under };
}

/** One reading: the frame culled and drawn whole (or, the canary, the budget read whole and the cull leaving out
 *  all it may), counted against its budget. */
interface Read { key: string; counts: Budget; changed: number; over: string[]; under: string[] }

/** One moment's frames: culled twice, then drawn whole. The second culled frame is the one counted: a moment's first
 *  frame does what's owed of the moment before it as well (a shadow map drawn again, a light's uniforms set), which
 *  varies with what ran before (run after other checks in the suite, Very low's first stand read 60 programs switched
 *  where alone it read 45). */
interface Moment { culled: ReturnType<typeof readFrame>; whole: ReturnType<typeof readFrame>; still: boolean }

function readMoment(lab: Lab, canary: boolean): Moment {
  if (canary) setHallCull('all');
  const first = readFrame(lab);
  const culled = readFrame(lab);
  holdCullsOff(true);
  const whole = readFrame(lab);
  holdCullsOff(false);
  const still = changedShare(first.frame.canvas, culled.frame.canvas) <= MOST_CHANGED;
  return { culled, whole, still };
}

/** One hour's reading, once its moment is still: a frame drawn twice the same, culled both times (by night, a lamp's
 *  shadow handed on as he's put on a stand draws a face a frame and fades in, and the first stand at Very low read
 *  0.33% changed between its culled frame and the whole one after it, with no cull to blame). */
async function readHour(lab: Lab, key: string, canary: boolean): Promise<Read> {
  let moment = readMoment(lab, canary);
  for (let tries = 1; tries < STILL_TRIES && !moment.still; tries++) {
    await lab.step(SETTLE);
    moment = readMoment(lab, canary);
  }
  if (!moment.still) throw new Error(`lab: village: sweep: ${key} never stood still`);
  const counts = canary ? moment.whole.counts : moment.culled.counts;
  const changed = changedShare(moment.culled.frame.canvas, moment.whole.frame.canvas);
  return { key, counts, changed, ...againstBudget(counts, BUDGETS[key]) };
}

/** Every stand read in `view` at each hour, at the level drawn now. */
async function readView(lab: Lab, view: ViewMode, canary: boolean): Promise<Read[]> {
  const level = qualityLevel();
  await viewBy(lab, view);
  const reads: Read[] = [];
  for (const stand of stands()) {
    if (view === 'top' && !stand.above) continue;
    await standOn(lab, stand);
    for (const hour of HOURS) {
      holdHour(hour);
      await lab.step(SETTLE);
      reads.push(await readHour(lab, `${level} ${view} ${stand.name} ${hour}:00`, canary));
    }
  }
  return reads;
}

/** A reading's line, and its budget's entry as `villageBudgets.ts` has it. */
const lineOf = (read: Read): string => `${read.key}: ${read.counts.join(', ')} (draws, triangles, materials, programs)`
  + `, ${(read.changed * 100).toFixed(4)}% of pixels changed by the culls`
  + (read.under.length ? `; under budget, lower it: ${read.under.join(', ')}` : '');
const entryOf = (read: Read): string => `  '${read.key}': [${read.counts.join(', ')}],`;
/** Readings in the order `npm run check:sorted` holds the budgets to: by their keys, case aside. */
const byKey = (a: Read, b: Read): number => {
  const left = a.key.toLowerCase();
  const right = b.key.toLowerCase();
  return left < right ? -1 : left > right ? 1 : 0;
};

/** The village swept: every stand's counts held to its budget, and its culled frame to its frame drawn whole. */
export async function sweepWithinBudgets(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const view = viewMode();
  const booted = qualityLevel();
  const bootDetail = heroDetail();
  const levels = booted === LOW_LEVEL ? [booted] : [booted, LOW_LEVEL];
  const reads: Read[] = [];
  try {
    for (const level of levels) {
      useQuality(level);
      // (the heroes held at the boot's detail: switched, the hall's were built again on the lab's page, where the
      // game builds their pieces in its worker, and the next check's hero built whole in the suite took a frame of
      // 189 to 683 ms against 75; what the village draws is what's read here)
      setHeroDetail(bootDetail);
      for (const each of ['third', 'top'] as ViewMode[]) reads.push(...await readView(lab, each, canary));
    }
  } finally {
    await goInto(lab, undefined);
    useQuality(booted);
    holdCullsOff(false);
    setHallCull('door');
    holdHour(null);
    await viewBy(lab, view);
  }
  const lines = [`culls: ${cullNames().join(', ')}`, ...reads.map(lineOf)];
  const problems: string[] = [];
  const unbudgeted = reads.filter((read) => !BUDGETS[read.key]).map((read) => read.key);
  if (unbudgeted.length) problems.push(`sweep: ${unbudgeted.length} readings have no budget: ${unbudgeted[0]}...`);
  for (const read of reads) {
    if (read.over.length) problems.push(`sweep: ${read.key} over budget: ${read.over.join(', ')}`);
    if (read.changed > MOST_CHANGED) {
      problems.push(`sweep: ${read.key}: the culls changed ${(read.changed * 100).toFixed(4)}% of the frame`);
    }
  }
  // (what to write in `villageBudgets.ts`, sorted, wherever a budget is missing, over or well under)
  const off = reads.filter((read) => !BUDGETS[read.key] || read.over.length || read.under.length);
  if (!canary && off.length) {
    lines.push('budgets as read (villageBudgets.ts):', ...[...reads].sort(byKey).map(entryOf));
  }
  const caught = canary
    ? reads.some((read) => read.over.length > 0) && reads.some((read) => read.changed > MOST_CHANGED)
    : null;
  return { lines, problems, caught, moments: [] };
}
