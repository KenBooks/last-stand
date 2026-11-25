// A room seen into from outside, read pixel by pixel for its walls opened on ground past it (`lab houserule`).
// From play, stood at the hall's door: "can see grass in top right corner", "left side too, small strip of grass",
// "there is also a white strip on the other side". The strips were a few pixels wide, the side walls opened on
// the terrace past them he saw out of their windows, and no block of the rules' read held enough of one to break.

import type * as THREE from 'three';

/** a room on the ground: its least x and z, its most */
export type Room = readonly [number, number, number, number];

/** how far apart the pixels read are, each way */
const STEP = 2;
/** the least a cover's colour differs from the ground's behind it, the channels' sum of 765, to be read at a pixel */
const COVERED = 60;
/** the most of a cover left at a pixel for it to read as opened */
const OPENED = 0.5;
/** the most pixels read that may be opened on ground past the room: a strip was hundreds */
export const STRIP_MOST = 40;

/** What a view reads of its room's walls opened on ground past the room. */
export interface StripRead {
  /** the pixels read (one in `STEP` each way) where a cover is opened on ground he sees through the room */
  pixels: number;
  /** where the middle one is on the screen (px) and its ground (x, z), for finding it */
  at: string;
}

/** Whether the straight way from `from` to `to` (x, z) passes through `room`. */
export function crossesRoom(from: readonly [number, number], to: readonly [number, number], room: Room): boolean {
  let near = 0;
  let far = 1;
  for (const axis of [0, 1] as const) {
    const along = to[axis] - from[axis];
    if (Math.abs(along) < 1e-9) {
      if (from[axis] < room[axis] || from[axis] > room[axis + 2]) return false;
      continue;
    }
    const first = (room[axis] - from[axis]) / along;
    const second = (room[axis + 2] - from[axis]) / along;
    near = Math.max(near, Math.min(first, second));
    far = Math.min(far, Math.max(first, second));
  }
  return far > near + 0.02;
}

/** How much of a cover is left at a pixel of three frames (as played, nothing thinned, the houses hidden): null
 *  where nothing covers the ground. */
function leftAt(played: Uint8ClampedArray, whole: Uint8ClampedArray, bare: Uint8ClampedArray, at: number): number | null {
  let apart = 0;
  let along = 0;
  let span = 0;
  for (let channel = 0; channel < 3; channel++) {
    const cover = whole[at + channel] - bare[at + channel];
    apart += Math.abs(cover);
    along += (played[at + channel] - bare[at + channel]) * cover;
    span += cover * cover;
  }
  if (apart < COVERED) return null;
  return Math.min(1, Math.max(0, along / span));
}

/** The pixels where a cover is opened on ground past `room` that he, stood at `from` outside it, sees through it.
 *  `groundThrough` says where the sight through a point of the screen (-1 to 1 each way) ends on the ground. */
export function stripsPastRoom(
  frames: { played: ImageData; whole: ImageData; bare: ImageData },
  from: readonly [number, number],
  room: Room,
  groundThrough: (x: number, y: number) => THREE.Vector2 | null,
): StripRead {
  const { width, height } = frames.played;
  const found: string[] = [];
  for (let y = 0; y < height; y += STEP) {
    for (let x = 0; x < width; x += STEP) {
      const left = leftAt(frames.played.data, frames.whole.data, frames.bare.data, (y * width + x) * 4);
      if (left === null || left > OPENED) continue;
      const place = groundThrough((x + 0.5) / width * 2 - 1, 1 - (y + 0.5) / height * 2);
      if (!place) continue;
      const inRoom = place.x > room[0] && place.x < room[2] && place.y > room[1] && place.y < room[3];
      if (inRoom || !crossesRoom(from, [place.x, place.y], room)) continue;
      found.push(` (as at ${x}, ${y} of the frame, the ground ${place.x.toFixed(1)}, ${place.y.toFixed(1)})`);
    }
  }
  return { pixels: found.length, at: found[Math.floor(found.length / 2)] ?? '' };
}
