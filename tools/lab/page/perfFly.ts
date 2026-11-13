// `lab perf --village --fly`: the developer mode's free camera flown over the village (from the owner: "we support
// free camera via dev tools now, can you add a lab test that flies above the village? might catch some other
// performance issues this way"). The game's own views show a little of the village at a time; from the air all of it
// is in the frame at once, and what's drawn whatever the camera sees, or far more of than a walker ever meets, shows
// as a frame's draws, triangles and time. The flight is the dev tool's own camera (`src/dev/freeCam.ts`), put at each
// frame's place of a leg: round the village high up looking in, round it low looking along the way, and straight
// across it over the roofs. Each leg is a phase of `perf`, timed as its others are, with where its dearest frames were.
import * as THREE from 'three';
import { G } from '../../../src/state';
import { PALISADE_LINE } from '../../../src/data/village';
import { freeCamOn, placeFreeCam, setFreeCam } from '../../../src/dev/freeCam';

/** Where the free camera is in a frame: its place, and the way it looks (rad: about y, and up from level). */
export interface Flown {
  pos: THREE.Vector3;
  yaw: number;
  pitch: number;
}

/** A leg of the flight: its name, its frames, and the camera's place at each. */
export interface Leg {
  name: string;
  frames: number;
  at: (frame: number) => Flown;
}

/** the frames a leg takes */
const LEG_FRAMES = 240;
/** the high round: its share of the village's reach, how high it flies (m) */
const HIGH = { reach: 1.05, up: 32 };
/** the low round: its share of the village's reach, how high (m), how far down it looks (rad) */
const LOW = { reach: 0.6, up: 6, down: 0.2 };
/** the flight across: how high (m), how far down it looks (rad) */
const ACROSS = { up: 14, down: 0.45 };
/** how far the camera must be found from where a frame put it, at the most (m) */
const PLACED_WITHIN = 0.01;

/** The village's middle and reach on the ground, by its palisade's line. */
function villageRound(): { middle: THREE.Vector3; reach: number } {
  const box = new THREE.Box2();
  for (const [x, z] of PALISADE_LINE) box.expandByPoint(new THREE.Vector2(x, z));
  const centre = box.getCenter(new THREE.Vector2());
  const size = box.getSize(new THREE.Vector2());
  return { middle: new THREE.Vector3(centre.x, 0, centre.y), reach: Math.max(size.x, size.y) / 2 };
}

/** The camera at `pos` looking at `target` (the free camera looks along -z turned by its yaw, then pitched). */
function lookingAt(pos: THREE.Vector3, target: THREE.Vector3): Flown {
  const way = target.clone().sub(pos);
  const level = Math.hypot(way.x, way.z);
  return { pos, yaw: Math.atan2(-way.x, -way.z), pitch: Math.atan2(way.y, level) };
}

/** The flight's legs over the village. */
export function flightLegs(): Leg[] {
  const { middle, reach } = villageRound();
  const round = (share: number, up: number, turn: number): THREE.Vector3 => new THREE.Vector3(
    middle.x + Math.sin(turn) * reach * share,
    up,
    middle.z + Math.cos(turn) * reach * share,
  );
  const turnAt = (frame: number): number => (frame / LEG_FRAMES) * Math.PI * 2;
  return [
    {
      name: 'flying round it high, looking in',
      frames: LEG_FRAMES,
      at: (frame) => lookingAt(round(HIGH.reach, HIGH.up, turnAt(frame)), middle),
    },
    {
      name: 'flying round it low, looking ahead',
      frames: LEG_FRAMES,
      at: (frame) => {
        const pos = round(LOW.reach, LOW.up, turnAt(frame));
        const ahead = round(LOW.reach, LOW.up, turnAt(frame) + 0.3);
        return { ...lookingAt(pos, ahead), pitch: -LOW.down };
      },
    },
    {
      name: 'flying across it over the roofs',
      frames: LEG_FRAMES,
      at: (frame) => {
        const along = (frame / LEG_FRAMES) * 2 - 1;
        const pos = new THREE.Vector3(middle.x + along * reach, ACROSS.up, middle.z);
        return { pos, yaw: -Math.PI / 2, pitch: -ACROSS.down };
      },
    },
  ];
}

/** how many boxes the canary plants, how far apart (m) and how high over the village's middle (m) */
export const PLANTED = 200;
const PLANTED_APART = 0.6;
const PLANTED_UP = 9;

/** `PLANTED` boxes, a draw each, stood in a square over the village's middle; returns what takes them away. */
export function plantOverVillage(): () => void {
  const { middle } = villageRound();
  const geometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);
  const material = new THREE.MeshStandardMaterial({ color: 0xff00ff });
  const side = Math.ceil(Math.sqrt(PLANTED));
  const boxes = Array.from({ length: PLANTED }, (_, at) => {
    const box = new THREE.Mesh(geometry, material);
    box.name = 'canary box';
    const across = (at % side) - side / 2;
    const along = Math.floor(at / side) - side / 2;
    box.position.set(middle.x + across * PLANTED_APART, PLANTED_UP, middle.z + along * PLANTED_APART);
    G.scene.add(box);
    return box;
  });
  return () => {
    for (const box of boxes) G.scene.remove(box);
    geometry.dispose();
    material.dispose();
  };
}

/** The free camera taken, as the dev tool's F9 takes it; throws where the build has none. */
export function takeFlight(): void {
  setFreeCam(true);
  if (!freeCamOn()) throw new Error('lab: perf: the free camera never came on');
}

/** The free camera let go, the game's own back. */
export function endFlight(): void {
  setFreeCam(false);
}

/** The free camera put at `flown` for the frame about to run. */
export function flyTo(flown: Flown): void {
  placeFreeCam(flown.pos, flown.yaw, flown.pitch);
}

/** Whether the frame just run was drawn from `flown`: the game's camera is where the flight put it. */
export function flewFrom(flown: Flown): boolean {
  return G.camera.position.distanceTo(flown.pos) < PLACED_WITHIN;
}

/** `flown` as a line's words: where the camera was and which way it looked (degrees). */
export function whereFlown(flown: Flown): string {
  const { pos } = flown;
  const degrees = (rad: number): string => (rad * 180 / Math.PI).toFixed(0);
  return `${pos.x.toFixed(0)},${pos.y.toFixed(0)},${pos.z.toFixed(0)} looking ${degrees(flown.yaw)}° round, `
    + `${degrees(flown.pitch)}° up`;
}
