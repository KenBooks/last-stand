// Where a drawn hand can be seen through, read from a picture of it in the `faces` look (looks.ts: a face's front
// blue, its back red) against the studio's plain backdrop: its skin seen from inside (a back face showing, through a
// gap in the surface or past a finger pushed through another) and the backdrop seen through a hole the hand closes
// round (a ring of finger and thumb, a window under a curled finger). Both showed in pictures of the warrior's fist
// while every contact measure passed (from play: "there is visual defect here too", "and here (the white spot)").

/** What one picture shows through the hand, in pixels. */
export interface SeenThrough {
  /** pixels of the hand's back faces: its skin seen from inside */
  inside: number;
  /** pixels of backdrop the drawing closes round, not joined to the picture's edge by backdrop */
  holes: number;
  /** pixels drawn (not backdrop) */
  drawn: number;
}

/** the colour a hole's pixels are painted in a marked picture (`marked`) */
const HOLE = [255, 0, 255];

/** `pixels` (RGBA) with the backdrop's pixels the drawing closes round painted `HOLE`, as `seenThrough` found them. */
export function marked(pixels: Uint8Array, width: number, height: number, backdrop: readonly number[],
  slack: number): Uint8Array {
  const out = pixels.slice();
  const isBackdropAt = new Uint8Array(width * height);
  for (let index = 0; index < width * height; index++) {
    isBackdropAt[index] = isBackdrop(pixels, index * 4, backdrop, slack) ? 1 : 0;
  }
  const open = openBackdrop(isBackdropAt, width, height);
  for (let index = 0; index < width * height; index++) {
    if (isBackdropAt[index] && !open[index]) out.set(HOLE, index * 4);
  }
  return out;
}

/** A pixel of a back face in the `faces` look: red (`looks.ts`, drawn flat by its twin). */
function isBack(red: number, green: number, blue: number): boolean {
  return red > 60 && red > 2 * green && red > 2 * blue;
}

/** Whether a pixel is the backdrop, within `slack` of its colour on every channel. */
function isBackdrop(pixels: Uint8Array, k: number, backdrop: readonly number[], slack: number): boolean {
  const off = Math.max(
    Math.abs(pixels[k] - backdrop[0]),
    Math.abs(pixels[k + 1] - backdrop[1]),
    Math.abs(pixels[k + 2] - backdrop[2]),
  );
  return off <= slack;
}

/** The backdrop's pixels joined to the picture's edge through backdrop, by a flood from every edge pixel of it. */
function openBackdrop(backdrop: Uint8Array, width: number, height: number): Uint8Array {
  const open = new Uint8Array(width * height);
  const stack: number[] = [];
  const push = (index: number) => {
    if (backdrop[index] && !open[index]) {
      open[index] = 1;
      stack.push(index);
    }
  };
  for (let x = 0; x < width; x++) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    push(y * width);
    push(y * width + width - 1);
  }
  while (stack.length) {
    const index = stack.pop()!;
    const x = index % width;
    if (x > 0) push(index - 1);
    if (x < width - 1) push(index + 1);
    if (index >= width) push(index - width);
    if (index < width * (height - 1)) push(index + width);
  }
  return open;
}

/**
 * What `pixels` (RGBA, `width` by `height`) show through the hand: its back faces and the backdrop it closes round.
 * `backdrop` is the backdrop's colour as drawn (0-255), `slack` how far a pixel may be from it and still be it.
 */
export function seenThrough(pixels: Uint8Array, width: number, height: number, backdrop: readonly number[],
  slack: number): SeenThrough {
  const isBackdropAt = new Uint8Array(width * height);
  let inside = 0;
  let drawn = 0;
  for (let index = 0; index < width * height; index++) {
    const k = index * 4;
    if (isBackdrop(pixels, k, backdrop, slack)) {
      isBackdropAt[index] = 1;
      continue;
    }
    drawn++;
    if (isBack(pixels[k], pixels[k + 1], pixels[k + 2])) inside++;
  }
  const open = openBackdrop(isBackdropAt, width, height);
  let holes = 0;
  for (let index = 0; index < width * height; index++) if (isBackdropAt[index] && !open[index]) holes++;
  return { inside, holes, drawn };
}
