// `lab shadows`: the hero's shadow cast as one (src/entities/models/castAsOne.ts) against his pieces cast each on its
// own, as the player sees them. In each way he holds his weapons, in all his armour and in none (the gear's pieces
// shown and hidden, so the merged mesh made again), and in each view, the frame is drawn both ways and compared pixel
// by pixel. Cast as one, a piece's vertices pass through other matrices than its own (its bone's, in floats), which
// round otherwise: a shadow's edge moves by a texel here and there, and its soft edge differs by a few levels in up to
// some 250 pixels of the frame (the dual-wielder over the shoulder). More than that, or by more, is a fault: the
// merged mesh hidden for the frame it was made again lost 1.7k to 3.3k pixels of the shadow top-down by 56 to 133,
// and the body cast through the eyes 86k to 112k pixels by 38. The pieces cast as one are counted, so a frame with
// none cast that way can't pass for a match. `--canary` moves their shadow 30 cm: it must be seen. `--cost` times
// the shadow map's draw a frame by the browser's clock, the two ways in turns on the one page (the machine's load
// drifts from boot to boot), standing in the lobby's view.
import type * as THREE from 'three';
import type { Lab, Report } from './lab';
import type { ViewMode } from '../../../src/core/renderer';
import type { WeaponStyle } from '../../../src/loot/loadout';
import { castingAsOne } from '../../../src/entities/models/castAsOne';
import { G } from '../../../src/state';
import { drawFrame, type Canvas } from './light';
import { stylesOf } from './form';
import { quantile, timeCalls, type Timing } from './timing';

export interface ShadowsOptions {
  /** the views the frames are drawn in (top, third, first by default) */
  views?: ViewMode[];
  canary: boolean;
  /** time the shadow map's draw both ways instead */
  cost: boolean;
}

const VIEWS: ViewMode[] = ['top', 'third', 'first'];
/** the way the hero faces (rad): his shadow falls clear of his body in every view */
const FACING = 0.6;
/** the armour worn: all of it, then none */
const WEARS = [['helm', 'chest', 'hands'], []] as const;
/** the most two pixels may differ (levels of 255): the same frame drawn twice differs by a level in a few */
const ROUNDING = 2;
/** the most pixels may differ by more than `ROUNDING` (a shadow's edge moved by rounding), and by how much at most */
const EDGE_PIXELS = 600;
const EDGE_LEVELS = 24;
/** how far the canary moves the pieces' shadow (m) */
const CANARY_SHIFT = 0.3;
/** the cost's turns, each way, and the frames a turn: the timer ticks in 0.1 ms, so a turn's mean is over many */
const TURNS = 40;
const TURN_FRAMES = 10;

/** How two frames differ. */
interface Difference {
  /** pixels whose channel differs by more than `ROUNDING` */
  pixels: number;
  /** the most a channel differs (levels of 255) */
  most: number;
}

/** How `a` and `b` (the same size) differ. */
function differenceOf(a: Canvas, b: Canvas): Difference {
  let pixels = 0;
  let most = 0;
  for (let at = 0; at < a.pixels.length; at += 4) {
    let pixel = 0;
    for (let channel = 0; channel < 3; channel++) {
      pixel = Math.max(pixel, Math.abs(a.pixels[at + channel] - b.pixels[at + channel]) * 255);
    }
    most = Math.max(most, pixel);
    if (pixel > ROUNDING) pixels++;
  }
  return { pixels, most: Math.round(most) };
}

/** Whether `difference` is more than a shadow's edge moved by rounding. */
const isFault = (difference: Difference): boolean => difference.pixels > EDGE_PIXELS || difference.most > EDGE_LEVELS;

/** The frame drawn with the hero's pieces cast as one, or each on its own. */
function drawnWith(lab: Lab, asOne: boolean): Canvas {
  const was = castingAsOne.on;
  castingAsOne.on = asOne;
  try {
    return drawFrame(lab);
  } finally {
    castingAsOne.on = was;
  }
}

/** The frame cast as one with its pieces' shadow moved `CANARY_SHIFT` along their own x (by the mesh's bind matrix,
 *  which the pieces' vertices pass through before their bones). */
function drawnShifted(lab: Lab): Canvas {
  const mesh = lab.player.shadow.mesh;
  if (!mesh) throw new Error('lab: no shadow cast as one to move');
  const bind: THREE.Matrix4 = mesh.bindMatrix;
  bind.elements[12] += CANARY_SHIFT;
  try {
    return drawnWith(lab, true);
  } finally {
    bind.elements[12] -= CANARY_SHIFT;
  }
}

/** the most pixels a shadow cast from fewer triangles may differ in from one cast from every triangle, and by how
 *  much (levels of 255): its outline within a texel or two, no patch of his own body shaded otherwise */
const COARSE_PIXELS = 4000;
const COARSE_LEVELS = 40;

/** Every triangle cast, or fewer as the game casts them (`models/shadowDetail.ts`; a commit from before it takes the
 *  property as nothing, an A/B's other side loading this module too). */
function holdWhole(whole: boolean): void {
  (castingAsOne as { whole?: boolean }).whole = whole;
}

/** One case's line, and its problems. */
async function measureCase(lab: Lab, view: ViewMode, gear: WeaponStyle | undefined, wear: readonly string[],
  canary: boolean): Promise<{ line: string; problems: string[]; caught?: boolean }> {
  await lab.setup({ view, gear, facing: FACING, wear: [...wear] as ('helm' | 'chest' | 'hands')[] });
  // (every triangle cast for the match of as one against alone: cast from fewer, the two are simplified apart)
  holdWhole(true);
  // (each way drawn after one drawn the other way: a frame's look follows from the one before, its exposure adapting)
  const before = drawnWith(lab, false);
  const asOne = drawnWith(lab, true);
  const pieces = lab.player.shadow.pieces.length;
  const alone = drawnWith(lab, false);
  const difference = differenceOf(asOne, alone);
  const steady = differenceOf(before, alone);
  const name = `${gear ?? 'as rolled'}, ${wear.length ? 'armoured' : 'bare'}, ${view}`;
  const apart = `${difference.pixels} pixels apart, by ${difference.most} at most`;
  let line = `${name}: ${pieces} pieces cast as one; ${apart} (cast alone twice: ${steady.pixels}, ${steady.most})`;
  const problems: string[] = [];
  if (!pieces) problems.push(`${name}: no piece cast as one`);
  if (isFault(difference)) problems.push(`${name}: ${apart} from the pieces cast alone`);
  // (then from fewer triangles, as the game casts it, against every triangle)
  holdWhole(false);
  drawnWith(lab, true);
  const coarse = differenceOf(drawnWith(lab, true), asOne);
  line += `; cast from fewer triangles ${coarse.pixels} pixels apart, by ${coarse.most} at most`;
  if (coarse.pixels > COARSE_PIXELS || coarse.most > COARSE_LEVELS) {
    problems.push(`${name}: cast from fewer triangles, ${coarse.pixels} pixels apart by ${coarse.most} at most`);
  }
  if (!canary) return { line, problems };
  const shifted = differenceOf(drawnShifted(lab), alone);
  return { line: `${line}\ncanary: his pieces' shadow moved, ${shifted.pixels} pixels apart`, problems,
    caught: isFault(shifted) };
}

/** The median of `values` (a turn the machine's load slowed is passed over: their means swung by 1.8 ms). */
const medianOf = (values: number[]): number => quantile([...values].sort((a, b) => a - b), 0.5);

/**
 * What `timing`'s calls take a frame (ms) over `TURN_FRAMES` frames, the GPU let finish after each, untimed: the lab
 * runs its frames back to back, and with the GPU's queue full whichever call waited for it took the GPU's time (the
 * shadow map's draw read 0.8 ms or 2 ms by the turns before it).
 */
async function framesTimed(lab: Lab, timing: Timing): Promise<number> {
  const gl = G.renderer.getContext();
  let took = 0;
  for (let frame = 0; frame < TURN_FRAMES; frame++) {
    gl.finish();
    timing.lap();
    await lab.step(1);
    took += timing.lap();
  }
  return took / TURN_FRAMES;
}

/** The ways the hero casts in `shadowCost`'s turns: as one, each piece alone, and nothing at all (what his whole
 *  shadow costs). */
const WAYS = ['asOne', 'alone', 'none'] as const;
type Way = (typeof WAYS)[number];

/** The hero cast `way` until the returned function is called. */
function castBy(lab: Lab, way: Way): () => void {
  const was = castingAsOne.on;
  castingAsOne.on = way === 'asOne';
  const casting: THREE.Object3D[] = [];
  if (way === 'none') {
    lab.player.obj.traverse((object) => {
      if (object.castShadow) casting.push(object);
    });
  }
  for (const object of casting) object.castShadow = false;
  return () => {
    castingAsOne.on = was;
    for (const object of casting) object.castShadow = true;
  };
}

/** The shadow map's draw a frame (ms) each way the hero casts, in turns of `TURN_FRAMES` frames. */
async function shadowCost(lab: Lab): Promise<Report> {
  await lab.setup({});
  const drawing = lab.drawing;
  lab.drawing = true;
  const timing = timeCalls(G.renderer.shadowMap, 'render');
  const turns: Record<Way, number[]> = { asOne: [], alone: [], none: [] };
  const made = lab.player.shadow.made;
  try {
    for (let turn = 0; turn < TURNS * WAYS.length; turn++) {
      const way = WAYS[turn % WAYS.length];
      const undo = castBy(lab, way);
      try {
        // (a frame first to let the switch take, untimed)
        await lab.step(1);
        turns[way].push(await framesTimed(lab, timing));
      } finally {
        undo();
      }
    }
  } finally {
    timing.stop();
    lab.drawing = drawing;
  }
  const asOne = medianOf(turns.asOne);
  const alone = medianOf(turns.alone);
  const none = medianOf(turns.none);
  const saved = (alone - asOne).toFixed(3);
  const remade = lab.player.shadow.made - made;
  const lines = [
    `the shadow map's draw a frame, the median of ${TURNS} turns of ${TURN_FRAMES} frames each way:`,
    `  cast as one ${asOne.toFixed(3)} ms, each piece alone ${alone.toFixed(3)} ms (${saved} saved)`,
    `  the hero casting nothing ${none.toFixed(3)} ms: his shadow ${(asOne - none).toFixed(3)} ms cast as one, `
      + `${(alone - none).toFixed(3)} alone`,
    `  its mesh made again ${remade} times meanwhile`,
  ];
  return { text: lines.join('\n'), problems: [] };
}

export async function shadowsCheck(lab: Lab, options: ShadowsOptions): Promise<Report> {
  if (options.cost) return shadowCost(lab);
  const lines: string[] = [];
  const problems: string[] = [];
  let caught: boolean | undefined;
  const styles: (WeaponStyle | undefined)[] = stylesOf(lab);
  if (!styles.length) styles.push(undefined);
  for (const gear of styles) {
    for (const wear of WEARS) {
      for (const view of options.views ?? VIEWS) {
        const measured = await measureCase(lab, view, gear, wear, options.canary && caught === undefined);
        lines.push(measured.line);
        problems.push(...measured.problems);
        caught ??= measured.caught;
      }
    }
  }
  if (options.canary && !caught) problems.push('canary: his pieces\' shadow moved 30 cm went unseen');
  return { text: lines.join('\n'), problems };
}
