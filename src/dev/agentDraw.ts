// The owner's drawing over the game while an agent is joined (from the owner, pointing at a fault a screenshot and a
// description didn't get across: "I think we need a feature for me to be able to draw on screen while agent is
// joined, draw and clear"). The badge's Draw (or F6) turns it on: the pointer then draws on a canvas over the page
// in place of working the game, and Clear wipes it. What's drawn stays up until cleared or the agent leaves, and is
// the agent's to read: laid over its pictures of his view, and each stroke in `look` with what of the scene is under it
// (agentSteps.ts).

/** a stroke as drawn: its points, each a share of the window across and down (0 to 1) */
export interface Stroke { points: [number, number][] }

/** the line drawn: its colour, the dark edge that keeps it readable over a bright frame, and their widths (CSS px) */
const LINE = { colour: '#ff3b30', edge: 'rgba(0, 0, 0, 0.75)', width: 3, edgeWidth: 6 };
/** the least a pointer moves, as a share of the window's width, for a stroke to take another point */
const STEP_LEAST = 0.0015;
/** the most strokes and points of one kept: a look's answer and a repaint stay small */
const STROKES_MOST = 64, POINTS_MOST = 600;

const strokes: Stroke[] = [];
let canvas: HTMLCanvasElement;
let on = false;
let current: Stroke | null = null;

/** Whether the pointer draws now, in place of working the game. */
export const drawingOn = (): boolean => on;

/** What's drawn now, oldest first. */
export const drawnStrokes = (): readonly Stroke[] => strokes;

/** The strokes painted into `context`, over a picture `width` by `height` of the whole window; `scale` its pixels a
 *  CSS pixel. */
export function paintStrokes(context: CanvasRenderingContext2D, width: number, height: number, scale: number): void {
  context.lineCap = 'round';
  context.lineJoin = 'round';
  for (const [colour, wide] of [[LINE.edge, LINE.edgeWidth], [LINE.colour, LINE.width]] as const) {
    context.strokeStyle = colour;
    context.lineWidth = Math.max(1, wide * scale);
    for (const stroke of strokes) {
      const [first, ...rest] = stroke.points;
      context.beginPath();
      context.moveTo(first[0] * width, first[1] * height);
      // (a tap alone is a dot: a line to where it stands, capped round)
      for (const point of rest.length ? rest : [first]) context.lineTo(point[0] * width, point[1] * height);
      context.stroke();
    }
  }
}

/** The canvas fitted to the window and painted as things stand. */
function repaint(): void {
  const ratio = Math.min(devicePixelRatio || 1, 2);
  const width = Math.round(innerWidth * ratio), height = Math.round(innerHeight * ratio);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const context = canvas.getContext('2d')!;
  context.clearRect(0, 0, width, height);
  paintStrokes(context, width, height, ratio);
  canvas.classList.toggle('hidden', !on && strokes.length === 0);
}

/** Drawing turned on or off: on, the canvas takes the pointer; what's drawn stays either way. */
export function setDrawing(want: boolean): void {
  on = want;
  current = null;
  canvas.classList.toggle('on', on);
  repaint();
}

/** Everything drawn wiped. */
export function clearDrawing(): void {
  strokes.length = 0;
  current = null;
  repaint();
}

/** The agent gone: drawing off and nothing left on screen. */
export function endDrawing(): void {
  setDrawing(false);
  clearDrawing();
}

const pointOf = (event: PointerEvent): [number, number] => [event.clientX / innerWidth, event.clientY / innerHeight];

function onDown(event: PointerEvent): void {
  if (!on) return;
  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  if (strokes.length >= STROKES_MOST) strokes.shift();
  current = { points: [pointOf(event)] };
  strokes.push(current);
  repaint();
}

function onMove(event: PointerEvent): void {
  if (!on || !current || current.points.length >= POINTS_MOST) return;
  const point = pointOf(event), last = current.points[current.points.length - 1];
  // (by the window's width both ways: a step is the same length on screen across and down)
  const moved = Math.hypot(point[0] - last[0], (point[1] - last[1]) * innerHeight / innerWidth);
  if (moved < STEP_LEAST) return;
  current.points.push(point);
  repaint();
}

function onUp(): void {
  current = null;
}

/** The canvas built, hidden until something is drawn. */
export function initDraw(): void {
  canvas = document.createElement('canvas');
  canvas.id = 'dev-agent-draw';
  canvas.className = 'hidden';
  document.body.append(canvas);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  addEventListener('resize', repaint);
}
