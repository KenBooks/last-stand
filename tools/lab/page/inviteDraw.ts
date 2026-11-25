// `lab invite`'s side of a page for the owner's drawing (tools/lab/node/inviteDraw.mjs, src/dev/agentDraw.ts): the
// badge's Draw and Clear worked as he works them, a stroke drawn by the mouse held and moved, and how much of a
// picture an agent was sent is the drawing's red.
import type { Lab } from './lab';

/** What the page shows of the drawing. */
export interface DrawState {
  /** whether the pointer draws now (the canvas takes it), and whether the canvas is shown at all */
  on: boolean; shown: boolean;
  /** the badge's Draw button as it reads, and whether Clear is offered */
  button: string; clear: boolean;
  /** the window's size (css px) */
  screen: [number, number];
}

/** What the page shows now. */
export function drawState(): DrawState {
  const canvas = document.querySelector('#dev-agent-draw');
  const clear = document.querySelector('#dev-agent-badge [data-agent=clear]');
  return {
    on: Boolean(canvas?.classList.contains('on')),
    shown: Boolean(canvas && !canvas.classList.contains('hidden')),
    button: document.querySelector('#dev-agent-badge [data-agent=draw]')?.textContent ?? '',
    clear: Boolean(clear && !clear.classList.contains('hidden')),
    screen: [innerWidth, innerHeight],
  };
}

/** how many moves a stroke is drawn in */
const MOVES = 12;

/** A stroke drawn by the mouse: pressed at `from`, moved to `to` and let go (css px). */
export async function drawStroke(lab: Lab, { from, to }: { from: [number, number]; to: [number, number] }): Promise<void> {
  await lab.mouseDown({ x: from[0], y: from[1] });
  for (let move = 1; move <= MOVES; move++) {
    const along = move / MOVES;
    await lab.mouseTo({ x: from[0] + (to[0] - from[0]) * along, y: from[1] + (to[1] - from[1]) * along });
  }
  await lab.mouseUp({ x: to[0], y: to[1] });
}

/** A key pressed on the page, as the keyboard gives it. */
export function drawKey(_lab: Lab, { code }: { code: string }): void {
  dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true, cancelable: true }));
}

/** how red a pixel must be to be the drawing's: its red over this, its green and blue under that */
const RED = { least: 200, othersMost: 110 };

/** How many of a picture's pixels within `reach` px of the line from `from` to `to` (shares of the picture, 0 to 1)
 *  are the drawing's red. */
export async function redAlong(
  _lab: Lab,
  { type, data, from, to, reach }: { type: string; data: string; from: [number, number]; to: [number, number]; reach: number },
): Promise<number> {
  const image = await createImageBitmap(await (await fetch(`data:${type};base64,${data}`)).blob());
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d')!;
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const a = [from[0] * canvas.width, from[1] * canvas.height];
  const b = [to[0] * canvas.width, to[1] * canvas.height];
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  let red = 0;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const along = Math.min(1, Math.max(0, ((x - a[0]) * (b[0] - a[0]) + (y - a[1]) * (b[1] - a[1])) / (length * length)));
      const away = Math.hypot(x - (a[0] + (b[0] - a[0]) * along), y - (a[1] + (b[1] - a[1]) * along));
      if (away > reach) continue;
      const at = (y * canvas.width + x) * 4;
      if (pixels[at] >= RED.least && pixels[at + 1] <= RED.othersMost && pixels[at + 2] <= RED.othersMost) red++;
    }
  }
  return red;
}
