// `lab village`'s camera kept out of him and his body drawn, over the shoulder in and round the hall of heroes' door
// (#601, from play: "at some angles in 3rd person view (in the hall's door, can see this, bug"): looking down and out
// at the square, the frame showed his shoulders and arms and no head, as a broken view through the eyes. The camera
// wasn't in him: pressed in by the wall behind, it came over his head within 0.8 m of his neck, and his head and body
// were hidden by nearness alone, as for the glide into the eyes (`viewArms` in src/entities/viewModel.ts).
// The camera is swept over a grid across the door's threshold and both sides of it, the terrace before it and its
// stair, him pressed against what's built where a spot is in it, 8 ways round, from looking up to looking at his
// feet: worked out as the game works it out each frame (`updateCamera`, run to where it settles, nothing drawn, so
// the sweep takes seconds) and read against his middle line, feet to crown; then walked through the door and turned
// round in it a frame at a time. The spots where it comes nearest his neck looking down are then played with the
// game's own frames, his head's meshes read for being hidden, and the nearest pictured as it was and as it is.
// The camera itself was brought back toward his chest by a wall behind him and stood in his hair, 0.3 m off his
// head's middle: it's lifted out over him now (`headClear` in src/core/renderer.ts). `canary` hides his body wherever
// the camera comes near his neck and lets the camera into his head, as they did.
import * as THREE from 'three';
import type { Lab } from './lab';
import type { Pictured } from './lab';
import { G } from '../../../src/state';
import { cameraClearsHead, faceCamera, lookBy, updateCamera, zoomBy } from '../../../src/core/renderer';
import { hideBodyNearCamera } from '../../../src/entities/viewModel';
import { HIDDEN_LAYER } from '../../../src/core/layers';
import { CAMERA } from '../../../src/data/balance';
import { HALL, TERRACE } from '../../../src/data/village';
import { groundHeight } from '../../../src/world/ground';
import { resolveWorld } from '../../../src/world/collision';
import { viewBy } from './villageHallCull';
import type { LightsChecked } from './villageLights';

/** the sweep's grid: across the door and its jambs, from inside the hall to the stair's foot (m) */
const ACROSS = 2.6;
const FROM_Z = HALL.inFront - 2.5;
const TO_Z = TERRACE.stairFoot + 0.6;
const STEP = 0.25;
/** the ways round, how far down he looks (rad under the horizon: up, the view's own, at the fountain from the door,
 *  at his feet) and the boom (its least: wheeled out, the walls bring it in to the same) */
const WAYS = 8;
const LOOKS = [CAMERA.third.minPitch, CAMERA.third.pitch, 0.6, 1];
const BOOM = CAMERA.third.minBoom;
/** the steps the camera is run to settle (s each: its springs of 3 to 18 a second come all but home in two) */
const SETTLES = 2;
/** how far from his middle line the camera may come (m), from his feet up: a head's half width and the near plane's
 *  0.12 (over his head at its least it stands 0.23 off, behind it, looking up) */
const BODY_REACH = 0.2;
const FEET = 0.2;
/** how near the middle of his head (a share of his height up) the camera may come (m): his hair's reach and the near
 *  plane's (brought in by a wall behind him, it stood in his hair, 0.3 m off) */
const HEAD_REACH = 0.4;
const HEAD_AT = 0.88;
/** the walks through the door: across it at these offsets from its middle (m), a frame's step at his running pace */
const WALK_ACROSS = [-0.8, 0, 0.8];
const PACE = 5.5;
const FRAME = 1 / 60;
/** the turns round in the doorway: how far either side of its middle and before and behind it, how far apart (m), and
 *  the frames a turn takes (one second, a brisk turn of the mouse) */
const TURN_ACROSS = 1.5;
const TURN_DEEP = 1;
const TURN_STEP = 0.5;
const TURN_FRAMES = 60;
/** the spots played with the game's frames: those where the camera came nearest his neck looking down, at least this
 *  far apart (m); the frames each settles over */
const PLAYED = 8;
const PLAYED_APART = 0.5;
const SETTLE_FRAMES = 60;

/** A stand of his and the view's, and how far the settled camera stood off his body and his neck (m). */
interface Spot { x: number; z: number; facing: number; down: number; off: number; head: number; neck: number }
/** What the frames of a walk or a turn came to. */
interface Frames { frames: number; inside: number; least: number; leastHead: number }

const _seg = new THREE.Vector3();
const _neck = new THREE.Vector3();

/** How far the camera stands from his middle line, from his feet to his crown (m). */
function offHim(): number {
  const { x, y, z } = G.player.obj.position;
  const cam = G.camera.position;
  const low = y + FEET;
  const high = y + G.player.model.height;
  _seg.set(x, THREE.MathUtils.clamp(cam.y, low, high), z);
  return cam.distanceTo(_seg);
}

/** How far the camera stands from the middle of his head (m). */
function offHead(): number {
  const { x, y, z } = G.player.obj.position;
  return G.camera.position.distanceTo(_seg.set(x, y + G.player.model.height * HEAD_AT, z));
}

/** Whether the camera stands in him: nearer his body's middle line or his head's middle than they reach. */
const inHim = (off: number, head: number): boolean => off < BODY_REACH || head < HEAD_REACH;

/** How far the camera stands from his neck (m). */
function offNeck(): number {
  return G.player.model.joints!.neck.getWorldPosition(_neck).distanceTo(G.camera.position);
}

/** Whether any of his head's meshes is on the layer no camera draws. */
function headHidden(): boolean {
  let hidden = false;
  G.player.model.joints!.neck.traverse((object) => {
    if ((object as THREE.Mesh).isMesh && object.layers.isEnabled(HIDDEN_LAYER)) hidden = true;
  });
  return hidden;
}

/** The view turned to look `down` rad under the horizon, as `villageCameraWall.ts` turns it. */
function lookDown(down: number): void {
  const { minPitch, maxPitch } = CAMERA.third;
  lookBy(0, -(maxPitch - minPitch) / CAMERA.lookSpeed);
  lookBy(0, (down - minPitch) / CAMERA.lookSpeed);
}

/** The boom wheeled to `length` m, as the mouse's wheel does. */
function boomTo(length: number): void {
  zoomBy(-1000);
  zoomBy(Math.log(length / CAMERA.third.minBoom) / Math.log(CAMERA.zoomStep));
}

/** The camera worked out as the game's frame does, for him where he stands. */
function cameraNow(dt: number): void {
  updateCamera(dt, G.player.pos, G.player.model.height, G.player.obj.position.y);
}

/** Where he stands nearest (x, z): pressed against what's built and the props, as walking there leaves him. */
function standable(x: number, z: number): { x: number; z: number } {
  const at = { x, z };
  resolveWorld(at, G.player.radius);
  return at;
}

/** Him stood at (x, z), turned and looking down, with the boom at its least. */
function standAt(spot: { x: number; z: number; facing: number; down: number }): void {
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(spot.x, 0, spot.z), spot.facing);
  faceCamera(spot.facing);
  lookDown(spot.down);
  boomTo(BOOM);
}

/** Him stood at `spot`, the camera run to where it settles; how far it stands off him. */
function settledAt(spot: { x: number; z: number; facing: number; down: number }): number {
  standAt(spot);
  for (let step = 0; step < SETTLES; step++) cameraNow(1);
  return offHim();
}

/** `spot` among the `PLAYED` nearest his neck, kept at least `PLAYED_APART` from each other. */
function keepNearest(nearest: Spot[], spot: Spot): void {
  const near = nearest.findIndex((kept) => Math.hypot(kept.x - spot.x, kept.z - spot.z) < PLAYED_APART);
  if (near >= 0) {
    if (nearest[near].neck > spot.neck) nearest[near] = spot;
  } else nearest.push(spot);
  nearest.sort((a, b) => a.neck - b.neck);
  nearest.length = Math.min(nearest.length, PLAYED);
}

/** Every spot of the grid read: how many, those with the camera inside him (worst first), the least it came off him,
 *  and the spots it came nearest his neck looking down. */
function sweep(): { spots: number; inside: Spot[]; least: number; leastHead: number; nearest: Spot[] } {
  const inside: Spot[] = [];
  const nearest: Spot[] = [];
  let spots = 0;
  let least = Infinity;
  let leastHead = Infinity;
  for (let x = TERRACE.x - ACROSS; x <= TERRACE.x + ACROSS + 1e-6; x += STEP) {
    for (let z = FROM_Z; z <= TO_Z + 1e-6; z += STEP) {
      const at = standable(x, z);
      for (let way = 0; way < WAYS; way++) {
        for (const down of LOOKS) {
          spots++;
          const facing = (way / WAYS) * Math.PI * 2;
          const off = settledAt({ ...at, facing, down });
          const spot = { ...at, facing, down, off, head: offHead(), neck: offNeck() };
          least = Math.min(least, off);
          leastHead = Math.min(leastHead, spot.head);
          if (inHim(off, spot.head)) inside.push(spot);
          if (down > 0) keepNearest(nearest, spot);
        }
      }
    }
  }
  inside.sort((a, b) => a.head - b.head);
  return { spots, inside, least, leastHead, nearest };
}

/** The camera read for a frame of a walk or a turn into `read`. */
function frameRead(read: Frames): void {
  cameraNow(FRAME);
  const off = offHim();
  const head = offHead();
  read.frames++;
  read.least = Math.min(read.least, off);
  read.leastHead = Math.min(read.leastHead, head);
  if (inHim(off, head)) read.inside++;
}

/** Him walked through the door and back at a frame's step, out and in, facing his way and turned across it, looking
 *  ahead and down. */
function walks(): Frames {
  const read = { frames: 0, inside: 0, least: Infinity, leastHead: Infinity };
  const ends = [HALL.inFront - 2, TERRACE.front + 0.5];
  for (const across of WALK_ACROSS) {
    for (const [from, to] of [ends, [...ends].reverse()]) {
      const way = Math.sign(to - from);
      const ahead = way > 0 ? 0 : Math.PI;
      for (const turn of [0, Math.PI / 2]) {
        for (const down of [CAMERA.third.pitch, 1]) {
          settledAt({ ...standable(TERRACE.x + across, from), facing: ahead + turn, down });
          for (let z = from; (to - z) * way > 0; z += way * PACE * FRAME) {
            const at = standable(TERRACE.x + across, z);
            G.player.pos.set(at.x, 0, at.z);
            G.player.obj.position.set(at.x, groundHeight(at.x, at.z), at.z);
            frameRead(read);
          }
        }
      }
    }
  }
  return read;
}

/** Him turned right round in and before the doorway at mouse look's pace, a frame at a time, looking ahead and down. */
function turns(): Frames {
  const read = { frames: 0, inside: 0, least: Infinity, leastHead: Infinity };
  for (let x = TERRACE.x - TURN_ACROSS; x <= TERRACE.x + TURN_ACROSS + 1e-6; x += TURN_STEP) {
    for (let z = HALL.inFront - TURN_DEEP; z <= HALL.door + TURN_DEEP + 1e-6; z += TURN_STEP) {
      for (const down of [CAMERA.third.pitch, 1]) {
        settledAt({ ...standable(x, z), facing: 0, down });
        for (let frame = 0; frame < TURN_FRAMES; frame++) {
          lookBy((Math.PI * 2) / TURN_FRAMES / CAMERA.lookSpeed, 0);
          frameRead(read);
        }
      }
    }
  }
  return read;
}

/** Him stood at `spot` with the game's own frames; whether his head was hidden at the end, and the camera off his
 *  body and neck (m). */
async function played(lab: Lab, spot: Spot): Promise<{ hidden: boolean; off: number; head: number; neck: number }> {
  standAt(spot);
  await lab.step(SETTLE_FRAMES);
  return { hidden: headHidden(), off: offHim(), head: offHead(), neck: offNeck() };
}

const told = (spot: { x: number; z: number; facing: number; down: number }): string =>
  `${spot.x.toFixed(2)},${spot.z.toFixed(2)} facing ${spot.facing.toFixed(2)}, down ${spot.down}`;

/** The spots nearest his neck played with the game's frames: the lines, how many hid his head, and the nearest
 *  pictured as it was (`before`: hidden by nearness in any view) and as it is. */
async function playNearest(lab: Lab, nearest: Spot[], pictures: boolean):
  Promise<{ lines: string[]; hidden: number; moments: Pictured[] }> {
  const lines: string[] = [];
  let hidden = 0;
  for (const spot of nearest) {
    const read = await played(lab, spot);
    if (read.hidden) hidden++;
    lines.push(`  ${told(spot)}: ${read.off.toFixed(2)} m off him, ${read.head.toFixed(2)} off his head's middle, `
      + `${read.neck.toFixed(2)} off his neck, his head ${read.hidden ? 'hidden' : 'drawn'}`);
  }
  const moments: Pictured[] = [];
  if (pictures && nearest.length) {
    const spot = nearest[0];
    for (const [name, asItWas] of [['as it was', true], ['now', false]] as const) {
      hideBodyNearCamera(asItWas);
      cameraClearsHead(!asItWas);
      const read = await played(lab, spot);
      const notes = [`${read.head.toFixed(2)} m off his head's middle`, `his head ${read.hidden ? 'hidden' : 'drawn'}`];
      moments.push(await lab.screen(`in the hall's door, ${told(spot)}, ${name}`, notes));
    }
    hideBodyNearCamera(false);
    cameraClearsHead(true);
  }
  return { lines, hidden, moments };
}

/** The camera stays out of him and his body is drawn wherever he stands in and round the hall's door. */
export async function cameraOutsideHim(lab: Lab, canary: boolean): Promise<LightsChecked> {
  await viewBy(lab, 'third');
  hideBodyNearCamera(canary);
  cameraClearsHead(!canary);
  try {
    const { spots, inside, least, leastHead, nearest } = sweep();
    const walked = walks();
    const turned = turns();
    if (!nearest.length || nearest[0].neck > 1) throw new Error('lab: village: the camera never came near his neck');
    const play = await playNearest(lab, nearest, !canary);
    const said = (what: string, read: Frames): string => `${what}: inside him ${read.inside} of ${read.frames} frames, `
      + `at least ${read.least.toFixed(2)} m off him and ${read.leastHead.toFixed(2)} off his head's middle`;
    const lines = [
      `over the shoulder in and round the hall's door (${G.player.cls.id}): the camera inside him at ${inside.length} `
        + `of ${spots} spots, at least ${least.toFixed(2)} m off him and ${leastHead.toFixed(2)} off his head's middle`,
      said('walked through the door', walked),
      said('turned round in the doorway', turned),
      `played where it came nearest his neck looking down: his head hidden at ${play.hidden} of ${nearest.length}`,
      ...play.lines,
      ...inside.slice(0, 4).map((spot) => `  inside him at ${told(spot)}: ${spot.off.toFixed(2)} m off him, `
        + `${spot.head.toFixed(2)} off his head's middle`),
    ];
    const problems = inside.length || walked.inside || turned.inside || play.hidden ? lines.slice(0, 4) : [];
    if (canary) return { lines, problems: [], caught: play.hidden > 0 && inside.length > 0, moments: [] };
    return { lines, problems, caught: null, moments: play.moments };
  } finally {
    hideBodyNearCamera(false);
    cameraClearsHead(true);
    boomTo(CAMERA.third.boom);
    await viewBy(lab, 'top');
  }
}
