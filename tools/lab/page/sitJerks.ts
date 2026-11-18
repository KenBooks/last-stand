// A sit's jerks (tools/lab `sit`): a hand, an elbow or what he holds changing its speed at once, as a move starts or
// stops dead or turns back in a frame. From play, of the warrior's sit by a fire: "campfire is jerky and lame, needs
// work", while his sit on a log or a stone was fine. The jump check (`sitCarried.ts`) reads a piece thrown 12 cm or
// turned 25 degrees in a frame, which none of these came near; this reads each point's change of move from one frame
// to the next (its acceleration over a frame squared), in the hero's own frame so his walk there and his turn to the
// seat don't count. Read only while a frame follows on from the one before: a gap (the sat idle left unread, a
// picture's set-up) starts each point afresh. What it found by the fire: his left hand went 37 cm onto the haft in a
// frame and off it again as he got up, flipped 13 to 26 cm a frame between two arm solves as he let go, and every
// seat's whole upper body rose 6 to 9 cm for a frame halfway down (the leg IK started afresh there). The sits as they
// are now jerk 4 to 5 cm at most; those faults were 15 to 74.

import * as THREE from 'three';
import type { Lab } from './lab';

/** a point's change of move from one frame to the next counted as a jerk past this (m: 0.6 cm a frame squared is
 *  22 m/s², a hand stopped from 1 m/s in under 0.05 s), listed but not a fault: the log and the stone, which play
 *  found smooth, have a hundred such frames */
export const JERK_FROM = 0.006;
/** and a fault past this (m): the log's and the stone's worst were 4.2 cm, the faults found 15 to 74 */
export const JERK_MOST = 0.06;
/** how many of the worst jerks are listed */
const LISTED = 12;
/** how many frames each side of the worst jerk its point's moves are traced */
const TRACED = 6;

/** The points followed: a hand, an elbow and what he holds. */
type PointName = 'right hand' | 'left hand' | 'right elbow' | 'left elbow' | 'weapon\'s grip' | 'weapon\'s far end';

/** A place a point was read at (the hero's frame), and whether it followed on from the one before it. */
interface Place {
  at: string;
  place: THREE.Vector3;
  followsOn: boolean;
}

/** A point's places in the hero's frame over the last three frames, all it was read at, its worst jerk and where. */
interface Followed {
  name: PointName;
  last: THREE.Vector3[];
  path: Place[];
  worst: number;
  worstAt: string;
  /** where in `path` its worst jerk was */
  worstIndex: number;
  /** the frames it jerked on past `JERK_FROM` */
  frames: number;
}

/** A frame a point jerked on: which, by how much (m), and where. */
interface Jerk {
  name: PointName;
  size: number;
  at: string;
}

/** The change of move into a frame from the places over the last three frames (oldest first; m). */
export function jerkOf(places: readonly THREE.Vector3[]): number {
  if (places.length < 3) return 0;
  const [first, second, third] = places;
  return third.clone().sub(second).sub(second.clone().sub(first)).length();
}

/** The canary: a hand moving steadily, or eased to a stop, isn't a fault; one stopped dead from 7 cm a frame is. */
export function jerkCanary(): boolean {
  const at = (x: number) => new THREE.Vector3(x, 0, 0);
  const steady = jerkOf([at(0), at(0.07), at(0.14)]);
  const eased = jerkOf([at(0), at(0.03), at(0.05)]);
  const stopped = jerkOf([at(0), at(0.07), at(0.07)]);
  return steady < JERK_MOST && eased < JERK_MOST && stopped >= JERK_MOST;
}

/** Each followed point's jerks over a sit. */
export class SitJerks {
  private readonly points: Followed[];
  private lastTime = -Infinity;
  /** every jerk past `JERK_FROM`, for the worst listed */
  private readonly jerks: Jerk[] = [];

  constructor() {
    const names: PointName[] = [
      'right hand', 'left hand', 'right elbow', 'left elbow', 'weapon\'s grip', 'weapon\'s far end',
    ];
    this.points = names.map((name) => ({ name, last: [], path: [], worst: 0, worstAt: '', worstIndex: 0, frames: 0 }));
  }

  /** Notes this frame's points, whatever part of the sit it's in (none while he walks there). */
  observe(lab: Lab, frame: string): void {
    const now = performance.now();
    const followsOn = now - this.lastTime < 1.5 * (1000 / 60);
    this.lastTime = now;
    const sitting = lab.player.sitting;
    if (!sitting.pose || sitting.walking) {
      for (const point of this.points) point.last = [];
      this.lastTime = -Infinity;
      return;
    }
    if (!followsOn) for (const point of this.points) point.last = [];
    lab.model.root.updateMatrixWorld(true);
    for (const point of this.points) this.follow(lab, point, frame);
  }

  /** One point's place this frame, and its jerk into it. */
  private follow(lab: Lab, point: Followed, frame: string): void {
    const place = placeOf(lab, point.name);
    if (!place) {
      point.last = [];
      return;
    }
    const root = lab.model.root;
    const local = root.worldToLocal(place).multiplyScalar(root.scale.x);
    point.path.push({ at: frame, place: local.clone(), followsOn: point.last.length > 0 });
    point.last.push(local);
    if (point.last.length > 3) point.last.shift();
    const jerk = jerkOf(point.last);
    if (jerk > point.worst) {
      point.worst = jerk;
      point.worstAt = frame;
      point.worstIndex = point.path.length - 1;
    }
    if (jerk < JERK_FROM) return;
    this.jerks.push({ name: point.name, size: jerk, at: frame });
    point.frames++;
  }

  /** Each point's worst jerk and how often it jerked, the worst jerks, and the worst point's moves round its worst. */
  summary(name: string): string {
    const said = this.points
      .filter((point) => point.worst > 0)
      .map((point) => `${point.name} ${(point.worst * 100).toFixed(1)} (${point.frames})`)
      .join(', ');
    const worst = [...this.jerks]
      .sort((a, b) => b.size - a.size)
      .slice(0, LISTED)
      .map((jerk) => `      his ${jerk.name} ${(jerk.size * 100).toFixed(1)} cm (${jerk.at})`);
    const head = `    by the ${name}, the worst change of move in a frame, cm (frames over ${JERK_FROM * 100}): ${said}`;
    return [head, ...worst, ...this.traceWorst()].join('\n');
  }

  /** The worst point's moves frame by frame round its worst jerk (cm, in his frame: x to his left, y up, z ahead),
   *  as a jerk is a step, a stop or a flip back and forth. */
  private traceWorst(): string[] {
    const worst = this.worstPoint();
    if (worst.worst < JERK_FROM) return [];
    const from = Math.max(1, worst.worstIndex - TRACED);
    const to = Math.min(worst.path.length - 1, worst.worstIndex + TRACED);
    const lines = [`      his ${worst.name}'s moves round its worst, cm (x left, y up, z ahead):`];
    for (let i = from; i <= to; i++) {
      const here = worst.path[i];
      if (!here.followsOn) continue;
      const move = here.place.clone().sub(worst.path[i - 1].place).multiplyScalar(100);
      const said = [move.x, move.y, move.z].map((value) => value.toFixed(1).padStart(6)).join(' ');
      lines.push(`        ${said}  (${here.at})`);
    }
    return lines;
  }

  /** The jerks past `JERK_MOST` as a fault, or none. */
  describe(name: string): string {
    const faults = this.jerks.filter((jerk) => jerk.size >= JERK_MOST);
    if (!faults.length) return '';
    const worst = this.worstPoint();
    return `sit: by the ${name}, a hand, an elbow or the weapon jerked over ${JERK_MOST * 100} cm a frame `
      + `${faults.length} times (from ${faults[0].at}; the worst, his ${worst.name}, `
      + `${(worst.worst * 100).toFixed(1)} cm, ${worst.worstAt})`;
  }

  /** The point that jerked the most. */
  private worstPoint(): Followed {
    return this.points.reduce((a, b) => (b.worst > a.worst ? b : a));
  }
}

/** A point's place in the world this frame, or none (no weapon held). */
function placeOf(lab: Lab, name: PointName): THREE.Vector3 | null {
  const j = lab.joints;
  const tip = lab.model.tip;
  const at = new THREE.Vector3();
  switch (name) {
    case 'right hand': return j.handR.getWorldPosition(at);
    case 'left hand': return j.handL.getWorldPosition(at);
    case 'right elbow': return j.elbowR.getWorldPosition(at);
    case 'left elbow': return j.elbowL.getWorldPosition(at);
    case 'weapon\'s grip': return tip?.parent ? tip.parent.getWorldPosition(at) : null;
    case 'weapon\'s far end': return tip ? tip.getWorldPosition(at) : null;
  }
}
