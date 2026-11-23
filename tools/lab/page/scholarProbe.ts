// tools/lab `live eval` helper for Brother Hollis (page/scholar.ts's set-up, by hand): the hero walked into the
// library, Hollis let go on a task, and his walk read frame by frame (where he goes, where his body and his head face,
// where he looks). For trying a change by hand; what's found is measured by `lab scholar`.
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { villageObject } from '../../../src/game/village';
import type { Task } from '../../../src/world/scholarRounds';
import { toVillage } from './village';
import { DOOR_FRAMES, stand, viewAs } from './houses';
import { holdThroughDoor } from './housesDoor';
import { faceCamera, settleCamera } from '../../../src/core/renderer';

/** Into the library, the hero by its door, Hollis held at his table. */
export async function intoLibrary(lab: Lab): Promise<string> {
  await toVillage(lab);
  await viewAs(lab, 'third');
  const door = villageObject('libraryDoor')!;
  await stand(lab, door.stand, 0);
  await holdThroughDoor(lab, door, [], null);
  await lab.until(() => G.arena.room === 'library', DOOR_FRAMES, "the library's door never took him in");
  await lab.step(15);
  return `in: ${G.arena.room}`;
}

/** `task` begun, followed `frames` frames, each `every`th read: his beat, his speed, and his head, body and travel's
 *  ways (deg, the room's), and where he looks. */
export async function walkRead(lab: Lab, task: Task, frames: number, every = 10): Promise<string[]> {
  const room = G.arena.rooms!.library!;
  const s = room.folk!()!, rounds = room.rounds!()!;
  rounds.hold = false;
  rounds.begin(task);
  const out: string[] = [];
  const was = s.root.getWorldPosition(new THREE.Vector3()), at = new THREE.Vector3();
  const deg = (v: THREE.Vector3) => THREE.MathUtils.radToDeg(Math.atan2(v.x, v.z)).toFixed(0);
  for (let f = 0; f < frames; f++) {
    s.root.getWorldPosition(was);
    await lab.step(1);
    if (f % every) continue;
    s.root.getWorldPosition(at);
    const way = at.clone().sub(was), head = new THREE.Vector3(0, 0, 1).transformDirection(s.root.getObjectByName('scholar head')!.matrixWorld);
    const body = new THREE.Vector3(0, 0, 1).transformDirection(s.root.matrixWorld);
    const look = s.act.look ? s.act.look.clone().sub(at) : null;
    out.push(`${f} ${rounds.doing} walk ${s.act.walk.toFixed(2)} speed ${(way.length() * 60).toFixed(2)} way ${deg(way)} body ${deg(body)} head ${deg(head)} look ${look ? deg(look) : '-'}`);
  }
  rounds.hold = true;
  return out;
}

/** `task` begun and followed `frames` frames: each frame a joint named `joint` turned more than `most` degrees, with
 *  his beat, his hands' reaches and grip, listed. */
export async function jumpsRead(lab: Lab, task: Task, frames: number, joint = 'scholar handR', most = 6): Promise<string[]> {
  const room = G.arena.rooms!.library!;
  const s = room.folk!()!, rounds = room.rounds!()!;
  const o = s.root.getObjectByName(joint)!;
  rounds.hold = false;
  rounds.begin(task);
  const out: string[] = [], was = new THREE.Quaternion();
  for (let f = 0; f < frames; f++) {
    was.copy(o.quaternion);
    await lab.step(1);
    const d = THREE.MathUtils.radToDeg(was.angleTo(o.quaternion));
    if (d > most) out.push(`${f} ${rounds.doing}: ${d.toFixed(1)} deg, reach ${s.act.reachL.toFixed(2)}/${s.act.reachR.toFixed(2)} grip ${s.act.grip.toFixed(2)} sit ${s.act.sit.toFixed(2)}`);
  }
  rounds.hold = true;
  return out;
}

/** `task` begun and followed `frames` frames: each frame any joint of him turned more than `most` degrees, every joint
 *  that did (deg), with his beat and his right hand's aim's reach. */
export async function allJumps(lab: Lab, task: Task, frames: number, most = 15): Promise<string[]> {
  const room = G.arena.rooms!.library!;
  const s = room.folk!()!, rounds = room.rounds!()!;
  const joints: THREE.Object3D[] = [];
  s.root.traverse((o) => { if (!(o as THREE.Mesh).isMesh) joints.push(o); });
  const before = joints.map((o) => o.quaternion.clone());
  rounds.hold = false;
  rounds.begin(task);
  const out: string[] = [];
  for (let f = 0; f < frames; f++) {
    joints.forEach((o, i) => before[i].copy(o.quaternion));
    await lab.step(1);
    const moved = joints.map((o, i) => [o.name || `(${o.parent?.name})`, THREE.MathUtils.radToDeg(before[i].angleTo(o.quaternion))] as const)
      .filter(([, d]) => d > most);
    if (moved.length) out.push(`${f} ${rounds.doing}: ${moved.map(([n, d]) => `${n} ${d.toFixed(0)}`).join(', ')}; reachR ${s.act.reachR.toFixed(2)}`);
  }
  rounds.hold = true;
  return out;
}

/** `task` begun and followed `frames` frames: each frame he walks straight (his body within `straight` degrees of the
 *  way he goes) with his head more than `most` degrees off it, listed with where he looks. */
export async function headRead(lab: Lab, task: Task, frames: number, most = 12, straight = 8): Promise<string[]> {
  const room = G.arena.rooms!.library!;
  const s = room.folk!()!, rounds = room.rounds!()!;
  rounds.hold = false;
  rounds.begin(task);
  const out: string[] = [], was = new THREE.Vector3(), at = new THREE.Vector3();
  const flat = (v: THREE.Vector3) => v.setY(0).normalize();
  for (let f = 0; f < frames; f++) {
    s.root.getWorldPosition(was);
    await lab.step(1);
    s.root.getWorldPosition(at);
    const way = flat(at.clone().sub(was));
    if (s.act.walk < 0.45) continue;
    const body = flat(new THREE.Vector3(0, 0, 1).transformDirection(s.root.matrixWorld));
    const head = flat(new THREE.Vector3(0, 0, 1).transformDirection(s.root.getObjectByName('scholar head')!.matrixWorld));
    const off = THREE.MathUtils.radToDeg(head.angleTo(way)), bodyOff = THREE.MathUtils.radToDeg(body.angleTo(way));
    const look = s.act.look ? flat(s.act.look.clone().sub(at)) : null;
    if (bodyOff < straight && off > most) out.push(`${f} ${rounds.doing}: head ${off.toFixed(0)} off, body ${bodyOff.toFixed(0)}, look ${look ? THREE.MathUtils.radToDeg(look.angleTo(way)).toFixed(0) : '-'} off, walk ${s.act.walk.toFixed(2)}`);
  }
  rounds.hold = true;
  return out;
}

/** `times` browses, each frame his right hand turned more than `most` degrees listed with his beat, its aim (where,
 *  its palm and fingers, his frame) and how far it reaches. */
export async function handJumps(lab: Lab, times: number, most = 12): Promise<string[]> {
  const room = G.arena.rooms!.library!;
  const s = room.folk!()!, rounds = room.rounds!()!, hand = s.root.getObjectByName('scholar handR')!;
  const out: string[] = [], was = new THREE.Quaternion();
  const v = (p: THREE.Vector3) => `${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}`;
  for (let n = 0; n < times; n++) {
    rounds.hold = false;
    rounds.begin('browse');
    for (let f = 0; f < 3000; f++) {
      was.copy(hand.quaternion);
      await lab.step(1);
      const d = THREE.MathUtils.radToDeg(was.angleTo(hand.quaternion)), a = s.act.handR;
      const inv = s.root.matrixWorld.clone().invert(), rot = new THREE.Matrix4().extractRotation(inv);
      if (d > most) out.push(`${n}/${f} ${rounds.doing}: ${d.toFixed(0)} deg; reach ${s.act.reachR.toFixed(2)}; aim ${a ? `${v(a.at.clone().applyMatrix4(inv))} palm ${v(a.palm.clone().applyMatrix4(rot))} fingers ${v(a.fingers.clone().applyMatrix4(rot))}` : '-'}`);
      if (f > 30 && rounds.doing === 'reading at his table' && s.act.sit >= 1) break;
    }
  }
  rounds.hold = true;
  return out;
}

/** `task` begun and followed till he's up: each frame a shoe is out through his robe, how far, where (the robe's
 *  frame) and at which of its rows, with how far he's sat. */
export async function shoeRead(lab: Lab, task: Task, frames: number): Promise<string[]> {
  const { shoeThroughRobe } = await import('./scholarRounds');
  const room = G.arena.rooms!.library!;
  const s = room.folk!()!, rounds = room.rounds!()!;
  rounds.hold = false;
  rounds.begin(task);
  const out: string[] = [], where = { at: new THREE.Vector3(), row: 0 };
  for (let f = 0; f < frames; f++) {
    await lab.step(1);
    if (s.act.sit >= 0.5) continue;
    const d = shoeThroughRobe(s, where);
    if (d > 0.004) out.push(`${f} ${rounds.doing} sit ${s.act.sit.toFixed(2)}: ${(d * 100).toFixed(1)} cm at ${where.at.x.toFixed(3)},${where.at.y.toFixed(3)},${where.at.z.toFixed(3)} row ${where.row}`);
  }
  rounds.hold = true;
  return out;
}

/** What his frame costs the page: his rounds' and his model's update timed by the browser's clock over `frames` frames
 *  of `task` (ms a frame: the mean, the 95th and the slowest), sat and on his feet apart. */
export async function costRead(lab: Lab, task: Task, frames: number): Promise<string> {
  const room = G.arena.rooms!.library!;
  const s = room.folk!()!, rounds = room.rounds!()!;
  const sat: number[] = [], up: number[] = [];
  const inner = rounds.update.bind(rounds);
  rounds.update = (...args: Parameters<typeof rounds.update>) => {
    const t = window.__labClock.realNow();
    inner(...args);
    (s.act.sit >= 1 ? sat : up).push(window.__labClock.realNow() - t);
  };
  rounds.hold = false;
  rounds.begin(task);
  for (let f = 0; f < frames; f++) await lab.step(1);
  rounds.update = inner;
  rounds.hold = true;
  const sum = (a: number[]) => {
    const o = [...a].sort((x, y) => x - y);
    return o.length ? `${(o.reduce((t, v) => t + v, 0) / o.length).toFixed(2)} mean, ${o[Math.floor(o.length * 0.95)].toFixed(2)} at the 95th, ${o[o.length - 1].toFixed(2)} slowest (${o.length} frames)` : 'none';
  };
  return `sat: ${sum(sat)}; on his feet: ${sum(up)}`;
}

/** `task` begun and followed to the beat `beat` (`after` frames into it, or to how far he's sat, `sit`, as he gets up),
 *  then left there (the live page draws no frame of its own): where his chest is (world) to frame a picture on, the
 *  hero turned as he faces (the lab's close views are the hero's) and stood back by the door. */
export async function toBeat(lab: Lab, task: Task | null, beat: string, after = 20, sit = -1): Promise<string> {
  const room = G.arena.rooms!.library!;
  const s = room.folk!()!, rounds = room.rounds!()!;
  if (task) { rounds.hold = false; rounds.begin(task); }
  let into = 0;
  for (let f = 0; f < 6000; f++) {
    await lab.step(1);
    if (rounds.doing !== beat) { into = 0; continue; }
    into++;
    if (sit >= 0 ? Math.abs(s.act.sit - sit) < 0.03 : into >= after) break;
  }
  const at = s.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 1.0, 0));
  const f = new THREE.Vector3(0, 0, 1).applyQuaternion(s.root.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize();
  G.player.place(new THREE.Vector3(1.6, 0, 2.5).applyMatrix4(room.group.matrixWorld), Math.atan2(f.x, f.z));
  return `${rounds.doing} (sit ${s.act.sit.toFixed(2)}): --on ${at.x.toFixed(2)},${at.y.toFixed(2)},${at.z.toFixed(2)}`;
}

/** what `studio` hid, to show again */
let hidden: THREE.Object3D[] = [];
/** The room around him hidden for a close picture (its cases and walls stood between the lab's close views and him),
 *  but for him, what he holds and the floor (a flat mesh as wide as the room); `studio(lab, false)` shows it again. */
export function studio(lab: Lab, on = true): string {
  void lab;
  if (!on) { for (const o of hidden) o.visible = true; const n = hidden.length; hidden = []; return `shown again: ${n}`; }
  const room = G.arena.rooms!.library!, s = room.folk!()!;
  const keep = new Set<THREE.Object3D>();
  s.root.traverse((o) => keep.add(o));
  for (let p: THREE.Object3D | null = s.root; p; p = p.parent) keep.add(p);
  for (const name of ['library held book', 'library open held book', 'library dusting cloth']) room.group.getObjectByName(name)?.traverse((o) => keep.add(o));
  const box = new THREE.Box3(), size = new THREE.Vector3();
  room.group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || keep.has(m) || !m.visible) return;
    box.setFromObject(m).getSize(size);
    if (size.y < 0.08 && size.x > 3 && size.z > 3) return;
    m.visible = false;
    hidden.push(m);
  });
  return `hidden: ${hidden.length}`;
}

/** The hero stood `ahead` m before him and `aside` m to his left (his frame), through the eyes, looking at his
 *  `high` m (for `live picture --views screen`: the game's own camera, the room's walls cut away as in play). */
export async function eyesOn(lab: Lab, ahead: number, aside: number, high = 1.0): Promise<string> {
  const room = G.arena.rooms!.library!, s = room.folk!()!;
  await viewAs(lab, 'first');
  const at = s.root.getWorldPosition(new THREE.Vector3());
  const q = s.root.getWorldQuaternion(new THREE.Quaternion());
  const f = new THREE.Vector3(0, 0, 1).applyQuaternion(q).setY(0).normalize(), l = new THREE.Vector3(f.z, 0, -f.x);
  const stood = at.clone().addScaledVector(f, ahead).addScaledVector(l, aside).setY(0);
  const facing = Math.atan2(at.x - stood.x, at.z - stood.z);
  G.player.place(stood, facing);
  faceCamera(facing);
  settleCamera(G.player.pos);
  const drawing = lab.drawing;
  lab.drawing = true;
  // (his own rounds held still meanwhile: the frames drawn here are the camera's)
  const rounds = room.rounds!()!, update = rounds.update;
  rounds.update = () => undefined;
  await lab.step(3);
  rounds.update = update;
  lab.drawing = drawing;
  void high;
  return `the hero at ${stood.x.toFixed(2)},${stood.z.toFixed(2)} facing him (${G.player.pos.distanceTo(at).toFixed(2)} m)`;
}
