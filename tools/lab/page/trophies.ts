// `lab trophies`: the house of records' trophies as a player meets them (`src/world/houses/records.ts`, each boss's
// model in `src/world/trophies/`, its kind and place in its `data/foes/` file). Every boss a battleground brings has a
// trophy, a place and a model of its own. Walked in with no boss beaten: each place shows its empty shield or its empty
// stand (a ray at it meets the mount, never a trophy). Every boss beaten: each trophy is shown on its own place (a ray
// meets it, and it stands where its place is). No pipeline is made from going in to the end, every frame drawn. The
// room's draws and triangles counted from one stand, beaten and not. Pictured: the back wall and the cabinet over the
// shoulder and from above, each way, and each place close up from its front and three-quarters. On a tree without the
// places (main, under `--ab`), the counts and the pictures of the room alone. `--canary` shows a trophy whose boss is
// unbeaten and sets another 5 cm off its place, both of which must be caught.
import * as THREE from 'three';
import type { Lab, Pictured, Report } from './lab';
import { G } from '../../../src/state';
import { BIOME_IDS, bossesOf, rungBoss } from '../../../src/data/biomes';
import { TROPHIES } from '../../../src/data/houses';
import type { EnemyId } from '../../../src/data/enemies';
import { chronicleOf } from '../../../src/game/chronicle';
import { enterRoom, writeRecords } from '../../../src/game/rooms';
import { faceCamera, viewMode, type ViewMode } from '../../../src/core/renderer';
import { groundHeight } from '../../../src/world/ground';
import type { TrophyPlaceShown } from '../../../src/world/rooms';
import { PIPELINES } from '../../../src/engine/pipelinesAside';
import { countedFrame, viewBy } from './villageHallCull';
import { toVillage } from './village';

/** `--canary`: a trophy shown with its boss unbeaten, and another set off its place. */
export interface TrophiesOptions {
  canary: boolean;
}

/** the frames a stand settles for, and the most a door may take to open (the rooms' warm-up under its bar) */
const SETTLE = 15;
const DOOR_FRAMES = 600;
/** how far out from a wall place a ray at it starts, and the furthest it may go to meet its mount (m) */
const WALL_RAY = 0.9;
const WALL_REACH = 1.0;
/** how far over a cabinet stand a ray down at it starts, and the furthest it may go to meet the stand (m) */
const STAND_RAY = 0.45;
const STAND_REACH = 0.47;
/** how far a trophy may stand from its place's middle (m) */
const ON_PLACE = 0.005;
/** how far the canary sets a trophy off its place (m) */
const PLANT_OFF = 0.05;
/** the close-ups' distance from a wall trophy and a cabinet one, and the turn a three-quarters view is taken from */
const CLOSE: Record<TrophyPlaceShown['kind'], number> = { wall: 3.0, cabinet: 1.9 };
const THREE_QUARTERS = 0.65;
/** where the hero stands in the room (its frame: x across, z from the back wall to the door) to see each: the back
 *  wall and the cabinet, and the way he faces (rad: π the back wall, 2.09 the cabinet) */
const STANDS: Record<'wall' | 'cabinet', { at: [number, number]; facing: number }> = {
  wall: { at: [0.9, -0.4], facing: Math.PI },
  cabinet: { at: [1.0, -0.4], facing: 2.09 },
};

/** Every boss a battleground brings (its ladder's, and its special waves' under the boss they're counted by). */
function bossesOfMain(): EnemyId[] {
  const all = BIOME_IDS.flatMap((b) => bossesOf(b));
  return [...new Set(all.map((b) => rungBoss(b)))];
}

/** the trophies' own models, by their files' names (a boss with none is shown by its kind's plain one) */
const OWN_MODELS = Object.keys(import.meta.glob('../../../src/world/trophies/*.ts'))
  .map((path) => path.replace(/^.*\//, '').replace(/\.ts$/, ''));

/** The hero put at `at` in the room's frame, facing `facing`, in `view`, and let settle. */
async function standIn(lab: Lab, at: [number, number], facing: number, view: ViewMode): Promise<void> {
  if (viewMode() !== view) await viewBy(lab, view);
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(at[0], groundHeight(at[0], at[1]), at[1]), facing);
  // (the camera turned with him: the close views keep their own turn as he's placed)
  faceCamera(facing);
  await lab.step(SETTLE);
}

/** Whether `object` and all over it are shown. */
function shownAll(object: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = object; o; o = o.parent) if (!o.visible) return false;
  return true;
}

/** Whether `object` is `group` or within it. */
function within(object: THREE.Object3D, group: THREE.Object3D | undefined): boolean {
  for (let o: THREE.Object3D | null = object; o; o = o.parent) if (o === group) return true;
  return false;
}

/** What a ray at the place meets first, of what's shown: its mount or stand, its trophy, or nothing near enough; and
 *  the name of what it met and how far along (m). */
function metAt(place: TrophyPlaceShown): { met: 'trophy' | 'mount' | 'nothing'; what: string } {
  const room = G.arena.shownGroup();
  room.updateMatrixWorld(true);
  const wall = place.kind === 'wall';
  const from = wall
    ? place.at.clone().addScaledVector(place.out, WALL_RAY)
    : place.at.clone().add(new THREE.Vector3(0, STAND_RAY, 0));
  const way = wall ? place.out.clone().negate() : new THREE.Vector3(0, -1, 0);
  const ray = new THREE.Raycaster(from, way, 0, wall ? WALL_REACH : STAND_REACH);
  const hit = ray.intersectObject(room, true).find((h) => shownAll(h.object));
  if (!hit) return { met: 'nothing', what: 'nothing' };
  const what = `${hit.object.name || hit.object.parent?.name || 'a part'} at ${hit.distance.toFixed(2)} m`;
  return { met: within(hit.object, place.trophy) ? 'trophy' : 'mount', what };
}

/** Each place against the bosses beaten (`beaten`): what's wrong, and a line a place. */
function placesRead(places: TrophyPlaceShown[], beaten: boolean): { lines: string[]; problems: string[] } {
  const lines: string[] = [];
  const problems: string[] = [];
  for (const place of places) {
    const { met, what } = metAt(place);
    const off = place.trophy ? place.trophy.getWorldPosition(new THREE.Vector3()).distanceTo(place.at) : 0;
    lines.push(`${place.place} (${place.kind}): ${place.boss ?? 'no boss yet'}, ${place.shown ? 'shown' : 'hidden'}, `
      + `a ray meets its ${met} (${what})${place.trophy ? `, ${(off * 100).toFixed(1)} cm off its place` : ''}`);
    const want = beaten && place.boss ? 'trophy' : 'mount';
    if (met !== want) problems.push(`${place.place}: a ray meets ${met}, not its ${want}`);
    if (place.boss && place.shown !== beaten) {
      const why = place.shown ? 'shown though unbeaten' : 'hidden though beaten';
      problems.push(`${place.place}: ${place.boss}'s trophy ${why}`);
    }
    if (off > ON_PLACE) {
      problems.push(`${place.place}: ${place.boss}'s trophy stands ${(off * 100).toFixed(1)} cm off its place`);
    }
  }
  return { lines, problems };
}

/** A frame's draws and triangles. */
interface Counts { draws: number; triangles: number }

/** The room pictured as he stands at the back wall and at the cabinet, over the shoulder and from above. */
async function roomPictures(lab: Lab, moments: Pictured[], state: string): Promise<Counts> {
  let counted: Counts = { draws: 0, triangles: 0 };
  for (const view of ['third', 'top'] as const) {
    for (const [what, stand] of Object.entries(STANDS)) {
      await standIn(lab, stand.at, stand.facing, view);
      if (what === 'wall' && view === 'third') {
        const frame = countedFrame(lab);
        counted = { draws: frame.draws, triangles: frame.triangles };
      }
      moments.push(await lab.screen(`trophies-${what}-${view}-${state}`));
    }
  }
  return counted;
}

/** Each place close up, from its front and three-quarters. */
function closeUps(lab: Lab, places: TrophyPlaceShown[], moments: Pictured[], state: string): void {
  for (const place of places) {
    if (!place.boss && state === 'beaten') continue;
    const facing = Math.atan2(place.out.x, place.out.z);
    const at = place.kind === 'cabinet' ? place.at.clone().add(new THREE.Vector3(0, 0.15, 0)) : place.at;
    for (const [turn, label] of [[0, 'front'], [THREE_QUARTERS, 'three-quarters']] as const) {
      G.player.facing = facing + turn;
      const notes = [`${place.place}: ${place.boss ?? 'no boss yet'}, ${state}`];
      const shot = { at, distance: CLOSE[place.kind] };
      moments.push(lab.picture(`${place.place}-${label}-${state}`, ['front'], notes, shot));
    }
  }
}

/** `lab trophies`. */
export async function trophies(lab: Lab, options: TrophiesOptions): Promise<Report> {
  const lines: string[] = [];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  await toVillage(lab);
  lab.drawing = true;
  const chronicle = chronicleOf(G.profile);
  chronicle.bosses = {};
  const made = PIPELINES.made;
  enterRoom('records');
  await lab.until(() => G.arena.room === 'records', DOOR_FRAMES, 'the house of records never opened');
  writeRecords();
  await lab.step(SETTLE);
  const room = G.arena.rooms!.records;
  const read = (): TrophyPlaceShown[] | undefined => room.trophyPlaces?.();
  // (no boss beaten: an empty shield or stand at every place)
  if (read()) {
    for (const boss of bossesOfMain()) {
      const def = TROPHIES[boss];
      const placed = read()!.find((p) => p.boss === boss);
      const own = OWN_MODELS.includes(boss);
      const trophy = def ? `${def.kind} trophy "${def.name}" at ${placed?.place ?? 'no place'}` : 'no trophy';
      lines.push(`${boss}: ${trophy}, ${own ? 'a model of its own' : 'the plain one'}`);
      if (!def || !placed) problems.push(`${boss} has no trophy or no place`);
      if (!own) problems.push(`${boss}'s trophy has no model of its own (src/world/trophies/${boss}.ts)`);
    }
    if (options.canary) read()!.find((p) => p.boss === 'thornheart')!.trophy!.visible = true;
    const none = placesRead(read()!, false);
    lines.push('none beaten:', ...none.lines);
    problems.push(...none.problems);
  } else lines.push('no trophy places in this tree (main before the cabinet): the room counted and pictured alone');
  const unbeaten = await roomPictures(lab, moments, 'unbeaten');
  // (the cabinet's corner from straight above, where everything stands, and the cabinet whole from before it)
  const shelf = read()?.find((p) => p.kind === 'cabinet');
  if (shelf) {
    moments.push(lab.picture('trophies-cabinet-plan', ['plan'], [], { at: shelf.at, distance: 6 }));
    G.player.facing = Math.atan2(shelf.out.x, shelf.out.z);
    const middle = shelf.at.clone().addScaledVector(shelf.out, -0.1);
    const across = new THREE.Vector3(0, 1, 0).cross(shelf.out).normalize();
    middle.addScaledVector(across, 0.31).add(new THREE.Vector3(0, 0.25, 0));
    moments.push(lab.picture('trophies-cabinet-whole', ['front'], [], { at: middle, distance: 4.2 }));
  }
  if (read()) closeUps(lab, read()!, moments, 'unbeaten');
  // (every boss beaten)
  chronicle.bosses = Object.fromEntries(Object.keys(TROPHIES).map((boss, i) => [boss, i + 1]));
  writeRecords();
  await lab.step(SETTLE);
  if (read()) {
    if (options.canary) read()!.find((p) => p.boss === 'twinslab')!.trophy!.position.x += PLANT_OFF;
    const all = placesRead(read()!, true);
    lines.push('all beaten:', ...all.lines);
    problems.push(...all.problems);
  }
  const beaten = await roomPictures(lab, moments, 'beaten');
  if (read()) closeUps(lab, read()!, moments, 'beaten');
  const pipelines = PIPELINES.made - made;
  lines.push(`the room from the back wall, over the shoulder: ${unbeaten.draws} draws and ${unbeaten.triangles} `
    + `triangles none beaten, ${beaten.draws} and ${beaten.triangles} all beaten`);
  lines.push(`pipelines made from going in to the end: ${pipelines}`);
  if (pipelines) problems.push(`${pipelines} pipelines made in the house of records`);
  if (!options.canary) return { text: lines.join('\n'), problems, moments };
  const shown = problems.some((p) => p.includes('shown though unbeaten'));
  const moved = problems.some((p) => p.includes('off its place'));
  lines.push(`canary: ${shown && moved ? 'caught' : 'missed'} (a trophy shown unbeaten: ${shown ? 'found' : 'unseen'}; `
    + `one set ${PLANT_OFF * 100} cm off its place: ${moved ? 'found' : 'unseen'})`);
  return { text: lines.join('\n'), problems: shown && moved ? [] : ['canary: a planted fault went unseen'], moments };
}
