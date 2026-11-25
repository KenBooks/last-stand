// tools/lab `scholar --moments`: Brother Hollis pictured close at each beat of each of his tasks, as a pose is judged:
// looked at first, measured after (src/entities/models/AGENTS.md). Each task begun from his table in turn (a browse, a
// keep, a restock, a dusting, a row squared, the globe turned); `AT` frames into each beat he's pictured by the game's
// own camera through the hero's eyes (its walls cut away as in play) from before him and to the room's side of him, and as he gets up and sits
// down, mid-way. And close up, lit, by the lab's own views turned as he faces: first his page turn at four moments; in
// the browse his walk from his side and before him (his head and his shoes), a strip of five as he gets up and as he sits
// down, a book taken by its spine, the book he holds and the one he reads, and what he wears from round him and at his
// belt. From play: "walking animation
// needs improvement... very robotic like movements... that's not how you grab a book".
import * as THREE from 'three';
import type { Lab, Pictured, Report, ViewName } from './lab';
import { G } from '../../../src/state';
import { faceCamera, saveCamera, settleCamera } from '../../../src/core/renderer';
import { villageObject } from '../../../src/game/village';
import type { Rounds, Task } from '../../../src/world/scholarRounds';
import type { Scholar } from '../../../src/entities/models/scholar';
import { toVillage } from './village';
import { DOOR_FRAMES, stand, viewAs } from './houses';
import { holdThroughDoor } from './housesDoor';
import { SCHOLAR_DOES } from '../../../src/data/houses/library';

/** the tasks pictured, in order */
// (dusting only while his data has it)
const TASKS: Task[] = (['browse', 'keep', 'restock', 'dust', 'tidy', 'globe'] as Task[]).filter((t) => t !== 'dust' || SCHOLAR_DOES.dust);
/** how many frames into a beat he's pictured, and the most frames a task is followed for */
const AT = 30;
const TASK_MOST = 6000;
/** where the hero may stand to picture him (m along his facing, m out to the room's middle side of him), the first he
 *  can stand at taken: before him and aside; at a case, behind him and aside; then further behind */
const SPOTS: [number, number][] = [[0.9, 1.2], [-0.5, 1.4], [-1.3, 0.6], [0.2, -1.4], [-1.5, 0]];
/** how far he's sat at each of the getting up and sitting down strip's five, and his page turn's moments pictured (s
 *  into his loop: `BEATS.turnA` in models/scholar.ts) */
const STRIP = [0.9, 0.7, 0.5, 0.3, 0.1];
const PAGE_TURN = [21, 21.6, 22.2, 22.8];
/** how far off what they're framed on the close-ups stand (m): his whole body, a book, his belt */
const FAR = { body: 4.6, book: 1.6, belt: 1.8 };
/** how far the hero may be moved off a spot (m) by what stands there, and still stand there */
const SPOT_SLACK = 0.12;
/** how far aside of him the hero looks (rad): what the hero holds stood before him in the frame's middle */
const LOOK_ASIDE = 0.18;

/** Him pictured now as the player would see him: the hero stood at the first of `SPOTS` he can stand at, facing him,
 *  seen through the hero's eyes; the hero and the camera put back after. (Put before him as he faced a case, the hero
 *  was pushed out of it into his face.) */
async function pictureHim(lab: Lab, s: Scholar, label: string, note: string, spots = SPOTS): Promise<Pictured> {
  const hero = G.player, was = hero.pos.clone(), wasFacing = hero.facing, restore = saveCamera();
  const at = s.root.getWorldPosition(new THREE.Vector3());
  const f = new THREE.Vector3(0, 0, 1).applyQuaternion(s.root.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize();
  const side = new THREE.Vector3(f.z, 0, -f.x);
  if (side.dot(new THREE.Vector3(-at.x, 0, -at.z)) < 0) side.negate();
  const drawing = lab.drawing;
  lab.drawing = true;
  for (const [ahead, aside] of spots) {
    const stood = at.clone().addScaledVector(f, ahead).addScaledVector(side, aside).setY(0);
    hero.place(stood, Math.atan2(at.x - stood.x, at.z - stood.z));
    await lab.step(3);
    if (hero.pos.clone().setY(0).distanceTo(stood) < SPOT_SLACK) break;
  }
  // (to him from where the hero came to stand; a little off him, clear of what the hero holds before him)
  const facing = Math.atan2(at.x - hero.pos.x, at.z - hero.pos.z);
  hero.place(hero.pos.clone(), facing);
  faceCamera(facing + LOOK_ASIDE);
  settleCamera(hero.pos);
  await lab.step(2);
  const shot = await lab.screen(label, [note]);
  lab.drawing = drawing;
  hero.place(was, wasFacing);
  restore();
  return shot;
}

/** Him close up, lit, by the lab's views (`views`, turned as he faces: `front` before him), framed on `at` (world)
 *  from `distance` m; the hero turned as he faces for it, and back after. */
function closeHim(lab: Lab, s: Scholar, label: string, note: string, views: ViewName[], at: THREE.Vector3, distance: number): Pictured {
  const hero = G.player, wasFacing = hero.facing;
  const f = new THREE.Vector3(0, 0, 1).applyQuaternion(s.root.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize();
  hero.place(hero.pos.clone(), Math.atan2(f.x, f.z));
  s.root.updateMatrixWorld(true);
  const shot = lab.picture(label, views, [note], { at, distance });
  hero.place(hero.pos.clone(), wasFacing);
  return shot;
}
/** `close` taken with the room's walls and furniture hidden for it (the floor, him and what he holds kept, and with
 *  `shelves` its shelved books): at a case or by a wall, the views behind him stood inside them, and their pictures were black */
function inTheOpen(s: Scholar, close: () => Pictured, shelves = false): Pictured {
  const room = G.arena.rooms!.library!, keep = new Set<THREE.Object3D>(), hidden: THREE.Object3D[] = [];
  s.root.traverse((o) => keep.add(o));
  for (const name of ['library held book', 'library open held book', 'library dusting cloth', 'library globe']) room.group.getObjectByName(name)?.traverse((o) => keep.add(o));
  const box = new THREE.Box3(), size = new THREE.Vector3();
  room.group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || keep.has(m) || !m.visible || (shelves && (m as THREE.InstancedMesh).isInstancedMesh)) return;
    box.setFromObject(m).getSize(size);
    if (size.y < 0.08 && size.x > 3 && size.z > 3) return;
    m.visible = false;
    hidden.push(m);
  });
  try { return close(); } finally { for (const m of hidden) m.visible = true; }
}
/** where in the world a point `up` m over his feet is, and an object of the room by name */
const overHim = (s: Scholar, up: number) => s.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, up, 0));
const placeOf = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());

export async function scholarMoments(lab: Lab): Promise<Report> {
  await toVillage(lab);
  const room = G.arena.rooms?.library;
  if (!room) return { text: 'no library: the lobby is not the village', problems: ['no rooms built'] };
  await viewAs(lab, 'third');
  const door = villageObject('libraryDoor')!;
  await stand(lab, door.stand, 0);
  const problems: string[] = [], moments: Pictured[] = [], lines: string[] = [];
  problems.push(...await holdThroughDoor(lab, door, moments, null));
  await lab.until(() => G.arena.room === 'library', DOOR_FRAMES, "the library's door never took him in");
  moments.length = 0;
  await lab.step(15);
  const s = room.folk?.(), rounds: Rounds | undefined = room.rounds?.();
  if (!s || !rounds) return { text: 'the library has no scholar seated', problems: ['no scholar seated'] };
  // (seen through the hero's eyes: over his shoulder, the hero stood between)
  await viewAs(lab, 'first');
  // (the hero by the door, out of his ways)
  G.player.place(new THREE.Vector3(1.6, 0, 2.5).applyMatrix4(room.group.matrixWorld), Math.PI);
  lab.drawing = false;
  // (sat at his book: his cowl from behind and above, as a player standing behind him sees it, and from before him; his
  // table's stack from its spines' side)
  rounds.hold = true;
  s.loopAt = 10;
  await lab.step(1);
  moments.push(closeHim(lab, s, 'cowl-sat', 'his cowl sat at his book: from behind, above and before him', ['back', 'above', 'front'], overHim(s, 1.05), FAR.belt));
  const stackAt = placeOf(room.group.getObjectByName('scholar desk books')!);
  moments.push(closeHim(lab, s, 'table-books', "the books on his table, from their spines' side", ['front', 'right'], stackAt, FAR.book * 0.75));
  // (his page turn, close: as he takes the page, lifts it, lets it go, and it falls over)
  for (const t of PAGE_TURN) {
    s.loopAt = t;
    await lab.step(1);
    moments.push(closeHim(lab, s, `page-turn-${t}`, `turning a page, ${t} s into his loop`, ['front', 'right'], s.root.localToWorld(s.book.spine.clone()), FAR.book * 1.3));
  }
  for (const task of TASKS) {
    rounds.hold = false;
    rounds.begin(task);
    const beats: string[] = [];
    let beat = '', into = 0, frames = 0, left = false, risen = -1, sitting = -1, up = 0, down = 0;
    const more = task === 'browse';
    for (; frames < TASK_MOST; frames++) {
      await lab.step(1);
      const doing = rounds.doing;
      if (doing !== beat) { beat = doing; into = 0; beats.push(doing); }
      into++;
      if (doing !== 'reading at his table') left = true;
      // (getting up and sitting down: mid-way, as his weight comes off the seat and onto it)
      if (risen < 0 && s.act.sit < 0.55 && s.act.sit > 0.05) { risen = frames; moments.push(await pictureHim(lab, s, `${task}-getting-up`, `${task}: getting up, sit ${s.act.sit.toFixed(2)}`)); }
      if (sitting < 0 && doing === 'going back to his table' && s.act.sit > 0.45 && s.act.sit < 0.95) { sitting = frames; moments.push(await pictureHim(lab, s, `${task}-sitting-down`, `${task}: sitting down, sit ${s.act.sit.toFixed(2)}`)); }
      if (into === AT && doing !== 'reading at his table' && !doing.startsWith('getting up')) {
        moments.push(await pictureHim(lab, s, `${task}-${doing.replace(/[^a-z]+/g, '-')}`, `${task}: ${doing}, ${AT} frames in`));
      }
      // (the browse's close-ups)
      if (more) {
        if (doing.startsWith('getting up') && up < STRIP.length && s.act.sit <= STRIP[up]) {
          moments.push(closeHim(lab, s, `strip-getting-up-${up + 1}`, `getting up, sit ${s.act.sit.toFixed(2)}`, ['left'], overHim(s, 0.8), FAR.body)); up++;
        }
        if (doing === 'going back to his table' && down < STRIP.length && s.act.sit > 0 && s.act.sit >= 1 - STRIP[down]) {
          moments.push(closeHim(lab, s, `strip-sitting-down-${down + 1}`, `sitting down, sit ${s.act.sit.toFixed(2)}`, ['left'], overHim(s, 0.8), FAR.body)); down++;
        }
        if (doing === 'going back to his table' && s.act.walk > 0.5 && (into === 50 || into === 65 || into === 80)) {
          moments.push(inTheOpen(s, () => closeHim(lab, s, `walk-${into}`, 'walking, from round him: his head ahead, his shoes', ['left', 'right', 'front', 'back'], overHim(s, 0.85), FAR.body)));
        }
        if (doing === 'taking a book from the shelf' && into === 75) {
          moments.push(inTheOpen(s, () => closeHim(lab, s, 'taking-close', 'taking a book by its spine (the case round it hidden)', ['left', 'right'], placeOf(s.root.getObjectByName('scholar handR')!), FAR.book * 1.3), true));
        }
        if (doing === 'looking a book over' && into === 40 && rounds.carried) {
          moments.push(inTheOpen(s, () => closeHim(lab, s, 'book-close', 'the book he holds: its boards, its spine and bands, its pages', ['above', 'left', 'right'], placeOf(rounds.carried!), FAR.book)));
        }
        if (doing === 'reading a book standing' && into === 40) {
          moments.push(inTheOpen(s, () => closeHim(lab, s, 'reading-close', 'the book he reads, open: its pages, its ribbon', ['above', 'right', 'left'], placeOf(G.scene.getObjectByName('library open held book')!), FAR.book)));
        }
        if (doing === 'opening a book' && into === 10) {
          moments.push(inTheOpen(s, () => closeHim(lab, s, 'outfit', 'what he wears, from round him', ['front', 'left', 'back', 'right'], overHim(s, 0.95), FAR.body * 0.95)));
          moments.push(inTheOpen(s, () => closeHim(lab, s, 'outfit-belt', 'at his belt: the girdle book, the beads and medallion, the keys', ['front', 'right', 'left'], overHim(s, 0.95), FAR.belt)));
        }
      }
      if (left && doing === 'reading at his table') break;
    }
    lines.push(`${task}: ${beats.join(' > ')} (${frames} frames)`);
    if (frames >= TASK_MOST) problems.push(`moments: ${task} never ended in ${TASK_MOST} frames (last: ${beat})`);
  }
  rounds.hold = true;
  lab.drawing = true;
  return { text: lines.join('\n'), problems, moments };
}
