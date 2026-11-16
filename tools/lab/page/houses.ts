// `lab houses`: the village's houses walked into and out of as a player does (`src/game/rooms.ts`, the rooms in
// `src/world/rooms.ts`): stood at each cottage's door, its name the object near and E taking him in; inside, the
// village hidden and the room shown, the yard's dummies gone from it, no program compiled, the walls the camera stands
// outside of cut away from above and none through the close views (the camera kept inside them), a walk at the back
// wall held in; the house of records' trophies shown for the bosses beaten alone, its great ledger's card opened by E with its
// pages fitting the window; the tavern's party table opening Play together; and the door inside by E putting him back
// before the cottage's door, the village shown again and the room hidden, the yard's dummies still on their spots. Each
// in another of the views.
import * as THREE from 'three';
import type { Lab, Pictured, Report } from './lab';
import { G } from '../../../src/state';
import { HOUSES, ROOM_IDS, insideOf, outsideOf, type RoomId } from '../../../src/data/houses';
import { objectNear, villageObject } from '../../../src/game/village';
import { chronicleOf } from '../../../src/game/chronicle';
import { faceCamera, settleCamera, viewMode, type ViewMode } from '../../../src/core/renderer';
import { groundHeight } from '../../../src/world/ground';
import { toVillage } from './village';
import { YARD_DUMMIES, type VillageObject } from '../../../src/data/village';
import { resolveWorld } from '../../../src/world/collision';
import type { Enemy } from '../../../src/entities/enemy';

/** `--canary`: a program compiled as the first room comes in, the yard's dummies kept in its walls as if they stood
 *  there, and the room left shown as he comes out. */
export interface HousesOptions {
  canary: boolean;
}

/** the frames a stand settles for, the most frames a door may take to open (a warm-up's bar), and a walk's frames */
const SETTLE = 15;
const DOOR_FRAMES = 600;
const WALK = 150;
/** how far a hero may come out from where he's put, coming in or going out (m) */
const PLACED_WITHIN = 0.3;
/** how far inside its walls' inner faces the hero walked into the back wall must still stand (m) */
const KEPT_IN = 0.1;
/** where across each room (x, m) a walk from the door to the back wall meets nothing standing in it */
const LANES: Record<RoomId, number> = { records: -1.6, tavern: 2.2 };
/** how far a yard dummy may stand from its spot after a visit (m): the lobby's foes stand in the village's frame, and
 *  kept in the room's walls as he stood inside, they were shoved into its corner by the fountain and left there */
const DUMMY_KEPT = 0.05;
/** each visit: the house and the view it's walked in */
const VISITS: readonly { id: RoomId; view: ViewMode }[] = [
  { id: 'records', view: 'top' },
  { id: 'tavern', view: 'third' },
  { id: 'records', view: 'first' },
  { id: 'tavern', view: 'top' },
];

/** What a visit found: its lines, its problems, and whether a canary planted in it was caught. */
interface Visit {
  lines: string[];
  problems: string[];
  caught?: boolean;
}

const programs = (): number => G.renderer.info.programs?.length ?? 0;
const yardDummies = (): Enemy[] => G.enemies.filter((e) => e.def.dummy);

/** How far each of the yard's dummies stands from its spot (`YARD_DUMMIES`, in the order they were stood). */
function dummiesOffSpots(): number[] {
  return yardDummies().map((dummy, i) => {
    const [x, z] = YARD_DUMMIES[i];
    return Math.hypot(dummy.pos.x - x, dummy.pos.z - z);
  });
}

/** The yard's dummies against their spots after a visit to `id`: its line and what's wrong. */
function dummyProblems(id: RoomId): { line: string; problems: string[] } {
  const off = dummiesOffSpots();
  const problems: string[] = [];
  if (off.length !== YARD_DUMMIES.length) problems.push(`${id}: ${off.length} yard dummies of ${YARD_DUMMIES.length}`);
  const moved = off.filter((d) => d > DUMMY_KEPT);
  if (moved.length) {
    const most = Math.max(...moved).toFixed(2);
    problems.push(`${id}: out of it, ${moved.length} yard dummies off their spots, by up to ${most} m`);
  }
  const line = `${id}: the yard's dummies off their spots by ${off.map((d) => d.toFixed(2)).join(', ')} m`;
  return { line, problems };
}

/** Where the square and the training yard are pictured from after the visits: south of the fountain, over the
 *  shoulder toward the yard (x, z, m), and the way he faces (rad about y). */
const YARD_SEEN_FROM: readonly [number, number] = [-1.5, -6.5];
const YARD_SEEN_FACING = Math.atan2(7, 19);

/** The square and the training yard over the shoulder, the yard's dummies where the visits left them. */
async function yardPicture(lab: Lab): Promise<Pictured> {
  await viewAs(lab, 'third');
  await stand(lab, YARD_SEEN_FROM, YARD_SEEN_FACING);
  faceCamera(YARD_SEEN_FACING);
  settleCamera(G.player.pos);
  await lab.step(SETTLE);
  return lab.screen('houses-yard-after');
}

/** The canary's fault: each yard dummy kept in the world's walls and off its props, the room's while he's in one. */
function keepDummiesInWorld(): void {
  for (const dummy of yardDummies()) resolveWorld(dummy.pos, dummy.radius);
}
const villageShown = (): boolean => G.arena.groupOf('village').visible;
const roomShown = (id: RoomId): boolean => G.arena.rooms![id].group.visible;

/** The hero put at (x, z), facing `facing`, and let settle. */
async function stand(lab: Lab, [x, z]: readonly [number, number], facing: number): Promise<void> {
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(x, groundHeight(x, z), z), facing);
  await lab.step(SETTLE);
}

/** The view switched by V, as the player switches it, until it's `view`. */
async function viewAs(lab: Lab, view: ViewMode): Promise<void> {
  for (let presses = 0; viewMode() !== view && presses < 3; presses++) {
    await lab.step(1, () => ({ keys: ['v'] }));
    await lab.step(2);
  }
  if (viewMode() !== view) throw new Error(`lab: the view never came to ${view}`);
  await lab.step(60);
}

/** `o` used by E where the hero stands: a problem if it isn't the object near him. */
async function useByE(lab: Lab, o: VillageObject, problems: string[]): Promise<void> {
  const near = objectNear();
  if (near !== o) problems.push(`at ${o.id}'s stand the object near is ${near?.id ?? 'none'}`);
  await lab.step(1, () => ({ keys: ['e'] }));
}

/** Whether the room's walls keep the camera and the hero inside (m to spare), in the room's frame. */
function inside(id: RoomId, at: THREE.Vector3, spare: number): boolean {
  const [hx, hz] = HOUSES[id].half;
  return Math.abs(at.x) < hx + spare && Math.abs(at.z) < hz + spare && at.y < HOUSES[id].high + spare;
}

/** Which of the room's walls and its ceiling are cut away now. */
const cutAway = (id: RoomId): string[] => G.arena.rooms![id].cutNow();

/** The room's cut away walls as the view should have them: from above the front and the ceiling, else none. */
function cutAwayProblems(id: RoomId, view: ViewMode): string[] {
  const cut = cutAway(id);
  if (view === 'top') {
    const missing = ['front', 'ceiling'].filter((name) => !cut.includes(name));
    const wrong = cut.filter((name) => name === 'back');
    const standing = missing.map((name) => `${id} from above: the ${name} stands`);
    return [...standing, ...wrong.map(() => `${id} from above: the back wall is cut away`)];
  }
  const problems = cut.map((name) => `${id} in ${view}: the ${name} is cut away`);
  if (!inside(id, G.camera.position, 0.05)) problems.push(`${id} in ${view}: the camera stands outside the room`);
  return problems;
}

/** The house of records' trophies against the bosses beaten (`beaten`): what's wrong. */
function trophyProblems(beaten: readonly string[]): { line: string; problems: string[] } {
  const shown = G.arena.rooms!.records.trophiesShown?.() ?? {};
  const problems = Object.entries(shown).flatMap(([boss, on]) => {
    const want = beaten.includes(boss);
    if (on === want) return [];
    const why = on ? 'hangs though its boss was never beaten' : 'is missing though its boss was beaten';
    return [`the ${boss} trophy ${why}`];
  });
  if (!Object.keys(shown).length) problems.push('the house of records hangs no trophy mounts');
  const each = Object.entries(shown).map(([boss, on]) => `${boss} ${on ? 'shown' : 'empty mount'}`);
  const line = `trophies: ${each.join(', ')}`;
  return { line, problems };
}

/** The great ledger's card opened by E: its pages, and the card within the window. */
async function ledgerProblems(lab: Lab, moments: Pictured[]): Promise<string[]> {
  const ledger = villageObject('ledger')!;
  await stand(lab, ledger.stand, Math.PI);
  const problems: string[] = [];
  await useByE(lab, ledger, problems);
  await lab.step(5);
  const card = document.getElementById('vcard')!;
  const opened = !card.classList.contains('hidden') && card.dataset.page === 'records';
  if (!opened) problems.push('the ledger opened no records card');
  const pages = card.querySelectorAll('.rec-book section').length;
  if (pages < 4) problems.push(`the ledger's card shows ${pages} pages of 4`);
  moments.push(await lab.screen('houses-ledger'));
  const box = card.getBoundingClientRect();
  if (box.left < 0 || box.top < 0 || box.right > innerWidth || box.bottom > innerHeight) {
    problems.push(`the ledger's card leaves the window: ${box.left},${box.top} to ${box.right},${box.bottom}`);
  }
  return problems;
}

/** The page's fetch of the co-op relay's health answered here, as down (Play together asks it as it opens: the lab
 *  has no business with production's relay, which refuses a page on localhost); returns the undoing. */
function relayAnswered(): () => void {
  const fetched = window.fetch;
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.endsWith('/health')) return Promise.resolve(new Response('{}', { status: 503 }));
    return fetched(input, init);
  };
  return () => {
    window.fetch = fetched;
  };
}

/** The tavern's party table opened by E: the Play together dialog up, then put away by E again. */
async function partyTableProblems(lab: Lab): Promise<string[]> {
  const table = villageObject('partyTable')!;
  await stand(lab, table.stand, Math.PI);
  const problems: string[] = [];
  const undo = relayAnswered();
  try {
    await useByE(lab, table, problems);
    await lab.step(5);
    const dialog = document.getElementById('coop')!;
    if (dialog.classList.contains('hidden')) problems.push('the party table opened no Play together dialog');
    await lab.step(1, () => ({ keys: ['e'] }));
    await lab.step(5);
    if (!dialog.classList.contains('hidden')) problems.push('E at the party table left Play together open');
  } finally {
    undo();
  }
  return problems;
}

/** One visit: in at the door, what the room shows, a walk at its back wall, out by its door. */
async function visit(lab: Lab, id: RoomId, view: ViewMode, canary: boolean, moments: Pictured[]): Promise<Visit> {
  const lines: string[] = [];
  const problems: string[] = [];
  await viewAs(lab, view);
  const door = villageObject(`${id}Door`)!;
  const out = outsideOf(id);
  await stand(lab, door.stand, out.facing + Math.PI);
  const before = programs();
  await useByE(lab, door, problems);
  await lab.until(() => G.arena.room === id, DOOR_FRAMES, `${id}'s door never took him in`);
  // (the canary's program: a material of its own, compiled as the room is first drawn)
  const planted = canary ? plantProgram(id) : null;
  await lab.step(SETTLE, () => {
    if (canary) keepDummiesInWorld();
    return {};
  });
  planted?.removeFromParent();
  const into = insideOf(id);
  const placed = Math.hypot(G.player.pos.x - into.x, G.player.pos.z - into.z);
  if (placed > PLACED_WITHIN) problems.push(`${id}: he came in ${placed.toFixed(2)} m from the door's inside`);
  if (villageShown()) problems.push(`${id}: the village is drawn inside the room`);
  if (!roomShown(id)) problems.push(`${id}: the room isn't shown`);
  const seenFoes = G.enemies.filter((e) => e.model.kit.u.uDissolve.value < 1).length;
  if (seenFoes) problems.push(`${id}: ${seenFoes} of the lobby's foes drawn in the room`);
  problems.push(...cutAwayProblems(id, view));
  const compiled = programs() - before;
  const caught = canary ? compiled > 0 : undefined;
  if (compiled && !canary) problems.push(`${id} in ${view}: ${compiled} programs compiled going in`);
  lines.push(`${id} in ${view}: in at ${G.player.pos.x.toFixed(2)},${G.player.pos.z.toFixed(2)}; cut away: `
    + `${cutAway(id).join(', ') || 'none'}; programs compiled ${compiled}`);
  moments.push(await lab.screen(`houses-${id}-${view}`));
  // (walked at the back wall down a lane clear of what stands in the room: held in by it)
  await stand(lab, [LANES[id], G.player.pos.z], Math.PI);
  const from = G.player.pos.z;
  await lab.step(WALK, () => ({ keys: ['w'] }));
  const [, hz] = HOUSES[id].half;
  const walked = from - G.player.pos.z;
  const reached = G.player.pos.z < -hz + G.player.radius + 0.5;
  if (!reached) problems.push(`${id}: walking at the back wall he stopped ${walked.toFixed(2)} m on, short of it`);
  if (G.player.pos.z < -hz + KEPT_IN) {
    problems.push(`${id}: walked through the back wall to z ${G.player.pos.z.toFixed(2)}`);
  }
  lines.push(`${id}: walked at the back wall to z ${G.player.pos.z.toFixed(2)} (its face at ${-hz})`);
  if (id === 'records') {
    const trophies = trophyProblems(['colossus']);
    lines.push(trophies.line);
    problems.push(...trophies.problems);
    if (view === 'top') problems.push(...await ledgerProblems(lab, moments));
  }
  if (id === 'tavern' && view === 'third') problems.push(...await partyTableProblems(lab));
  // (out by its door inside)
  const way = villageObject(`${id}Out`)!;
  await stand(lab, way.stand, 0);
  const leaving = programs();
  await useByE(lab, way, problems);
  await lab.until(() => G.arena.room === null, DOOR_FRAMES, `${id}'s door inside never let him out`);
  if (canary) G.arena.rooms![id].group.visible = true;
  await lab.step(SETTLE);
  const outAt = Math.hypot(G.player.pos.x - out.x, G.player.pos.z - out.z);
  if (outAt > PLACED_WITHIN) problems.push(`${id}: he came out ${outAt.toFixed(2)} m from before its door`);
  if (!villageShown()) problems.push(`${id}: out of it, the village isn't shown`);
  const leftShown = roomShown(id);
  if (leftShown && !canary) problems.push(`${id}: out of it, the room is still drawn`);
  if (programs() !== leaving) problems.push(`${id}: ${programs() - leaving} programs compiled going out`);
  if (canary) G.arena.rooms![id].group.visible = false;
  const dummies = dummyProblems(id);
  lines.push(dummies.line);
  const dummiesMoved = dummies.problems.length > 0;
  if (!canary) problems.push(...dummies.problems);
  return { lines, problems, caught: canary ? caught === true && leftShown && dummiesMoved : undefined };
}

/** The canary's program: a mesh in a material no other program has, added to room `id` for its next draw. */
function plantProgram(id: RoomId): THREE.Mesh {
  const material = new THREE.MeshStandardMaterial({ color: 0xff00ff });
  material.customProgramCacheKey = () => 'houses-canary';
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = `// houses canary\n${shader.fragmentShader}`;
  };
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), material);
  mesh.position.set(0, 1, 0);
  G.arena.rooms![id].group.add(mesh);
  mesh.updateMatrixWorld();
  return mesh;
}

/** `lab houses`. */
export async function houses(lab: Lab, options: HousesOptions): Promise<Report> {
  await toVillage(lab);
  if (!G.arena.rooms) return { text: 'no houses: the lobby is not the village', problems: ['no rooms built'] };
  // (the Hollow Colossus beaten, the Elder Thornheart not: one trophy hung, one mount empty)
  chronicleOf(G.profile).bosses = { colossus: 2 };
  // (every frame drawn: a program is compiled only as a frame draws what needs it, and the lab draws none unasked)
  lab.drawing = true;
  const moments: Pictured[] = [];
  const visits: Visit[] = [];
  for (const [i, { id, view }] of VISITS.entries()) {
    visits.push(await visit(lab, id, view, options.canary && i === 0, moments));
  }
  moments.push(await yardPicture(lab));
  const lines = [`houses: ${ROOM_IDS.join(', ')}`, ...visits.flatMap((v) => v.lines)];
  const problems = visits.flatMap((v) => v.problems);
  if (!options.canary) return { text: lines.join('\n'), problems, moments };
  const caught = visits[0].caught === true;
  lines.push(`canary: ${caught ? 'caught' : 'missed'} (a program compiled going in, the dummies kept in the room's walls, the room left drawn going out)`);
  return { text: lines.join('\n'), problems: caught ? [] : ['canary: a planted fault went unseen'], moments };
}
