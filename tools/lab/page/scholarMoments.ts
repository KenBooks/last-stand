// tools/lab `scholar --moments`: Brother Hollis pictured close at each beat of each of his tasks, as a pose is judged:
// looked at first, measured after (src/entities/models/AGENTS.md). Each task begun from his table in turn (a browse, a
// keep, a restock, a dusting, a row squared, the globe turned); `AT` frames into each beat he's pictured by the game's
// own camera through the hero's eyes (its walls cut away as in play) from before him and to the room's side of him, and as he gets up and sits
// down, mid-way. (The lab's close views stood behind the room's walls and cases.) From play: "walking animation
// needs improvement... very robotic like movements... that's not how you grab a book".
import * as THREE from 'three';
import type { Lab, Pictured, Report } from './lab';
import { G } from '../../../src/state';
import { faceCamera, saveCamera, settleCamera } from '../../../src/core/renderer';
import { villageObject } from '../../../src/game/village';
import type { Rounds, Task } from '../../../src/world/scholarRounds';
import type { Scholar } from '../../../src/entities/models/scholar';
import { toVillage } from './village';
import { DOOR_FRAMES, stand, viewAs } from './houses';
import { holdThroughDoor } from './housesDoor';

/** the tasks pictured, in order */
const TASKS: Task[] = ['browse', 'keep', 'restock', 'dust', 'tidy', 'globe'];
/** how many frames into a beat he's pictured, and the most frames a task is followed for */
const AT = 30;
const TASK_MOST = 6000;
/** where the hero may stand to picture him (m along his facing, m out to the room's middle side of him), the first he
 *  can stand at taken: before him and aside; at a case, behind him and aside; then further behind */
const SPOTS: [number, number][] = [[0.9, 1.2], [-0.5, 1.4], [-1.3, 0.6], [0.2, -1.4], [-1.5, 0]];
/** how far the hero may be moved off a spot (m) by what stands there, and still stand there */
const SPOT_SLACK = 0.12;
/** how far aside of him the hero looks (rad): what the hero holds stood before him in the frame's middle */
const LOOK_ASIDE = 0.18;

/** Him pictured now as the player would see him: the hero stood at the first of `SPOTS` he can stand at, facing him,
 *  seen through the hero's eyes; the hero and the camera put back after. (Put before him as he faced a case, the hero
 *  was pushed out of it into his face.) */
async function pictureHim(lab: Lab, s: Scholar, label: string, note: string): Promise<Pictured> {
  const hero = G.player, was = hero.pos.clone(), wasFacing = hero.facing, restore = saveCamera();
  const at = s.root.getWorldPosition(new THREE.Vector3());
  const f = new THREE.Vector3(0, 0, 1).applyQuaternion(s.root.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize();
  const side = new THREE.Vector3(f.z, 0, -f.x);
  if (side.dot(new THREE.Vector3(-at.x, 0, -at.z)) < 0) side.negate();
  const drawing = lab.drawing;
  lab.drawing = true;
  for (const [ahead, aside] of SPOTS) {
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
  for (const task of TASKS) {
    rounds.hold = false;
    rounds.begin(task);
    const beats: string[] = [];
    let beat = '', into = 0, frames = 0, left = false, risen = -1, sitting = -1;
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
      if (left && doing === 'reading at his table') break;
    }
    lines.push(`${task}: ${beats.join(' > ')} (${frames} frames)`);
    if (frames >= TASK_MOST) problems.push(`moments: ${task} never ended in ${TASK_MOST} frames (last: ${beat})`);
  }
  rounds.hold = true;
  lab.drawing = true;
  return { text: lines.join('\n'), problems, moments };
}
