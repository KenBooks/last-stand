// `lab shadows`: the hero's shadow cast from fewer triangles (src/entities/models/shadowDetail.ts, the engine's
// `casterGeometry`: each of his pieces a record of its own for the shadow alone) against cast from every triangle, as
// the player sees it. In each way he holds his weapons, in all his armour and in none, and in each view, the frame is
// drawn both ways and compared pixel by pixel: its outline within a texel or two, no patch of his own body shaded
// otherwise. The pieces cast from fewer triangles are counted (the engine's `casters`), and his shadow taken away must
// change the frame, so a frame with none can't pass for a match. Through the eyes it needn't: his body is hidden
// there and casts nothing, by design since #270 (his pieces cast as one shrank it out of the shadow; the engine's walk
// passes its layer by, as three's shadow pass did), and his arms' shadow falls at his feet, below the view, but for
// the ranger's bow. `--canary` takes his shadow away: it must be seen. `--cost` times the frame on the engine's GPU
// clock in turns, each way and with him casting nothing. It compared his pieces cast as one (castAsOne.ts) against
// each alone, in three's shadow pass, which the engine never runs: under it the two drew the same, no piece was cast
// as one, and its timing read three's shadow map, never drawn.
import * as THREE from 'three';
import type { Lab, Report } from './lab';
import type { ViewMode } from '../../../src/core/renderer';
import type { WeaponStyle } from '../../../src/loot/loadout';
import { castingAsOne } from '../../../src/entities/models/castAsOne';
import { RUST } from '../../../src/engine';
import { drawFrame, type Canvas } from './light';
import { stylesOf } from './form';
import { costInTurns, sure, type TurnsCost } from './gpuTurns';

export interface ShadowsOptions {
  /** the views the frames are drawn in (top, third, first by default) */
  views?: ViewMode[];
  canary: boolean;
  /** time the frame on the engine's GPU clock both ways instead */
  cost: boolean;
}

const VIEWS: ViewMode[] = ['top', 'third', 'first'];
/** the way the hero faces (rad): his shadow falls clear of his body in every view */
const FACING = 0.6;
/** the armour worn: all of it, then none */
const WEARS = [['helm', 'chest', 'hands'], []] as const;
/** the most two pixels may differ (levels of 255): the same frame drawn twice differs by a level in a few */
const ROUNDING = 2;
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

/** the most pixels a shadow cast from fewer triangles may differ in from one cast from every triangle, and by how
 *  much (levels of 255): its outline within a texel or two, no patch of his own body shaded otherwise */
const COARSE_PIXELS = 4000;
const COARSE_LEVELS = 40;

/** Every triangle cast, or fewer as the game casts them (`models/shadowDetail.ts`; a commit from before it takes the
 *  property as nothing, an A/B's other side loading this module too). */
function holdWhole(whole: boolean): void {
  (castingAsOne as { whole?: boolean }).whole = whole;
}

/** The frame drawn with every triangle cast or fewer; and how many of his pieces cast from fewer. */
function drawnWith(lab: Lab, whole: boolean): { frame: Canvas; fewer: number } {
  holdWhole(whole);
  // (a frame first: the sun's map is drawn again as what casts into it changes, the frame after it steady)
  drawFrame(lab);
  const frame = drawFrame(lab);
  return { frame, fewer: RUST.bridge?.stats.casters ?? 0 };
}

/** What casts of the hero, each part's own say, while `run` runs with none of it casting. */
function castingNothing<T>(lab: Lab, run: () => T): T {
  const casting: THREE.Object3D[] = [];
  lab.player.obj.traverse((object) => {
    if (object.castShadow) casting.push(object);
  });
  for (const object of casting) object.castShadow = false;
  try {
    return run();
  } finally {
    for (const object of casting) object.castShadow = true;
  }
}

/** One case's line, and its problems. */
async function measureCase(lab: Lab, view: ViewMode, gear: WeaponStyle | undefined, wear: readonly string[],
  canary: boolean): Promise<{ line: string; problems: string[]; caught?: boolean }> {
  await lab.setup({ view, gear, facing: FACING, wear: [...wear] as ('helm' | 'chest' | 'hands')[] });
  const whole = drawnWith(lab, true);
  const fewer = drawnWith(lab, false);
  const again = drawnWith(lab, false);
  holdWhole(false);
  const coarse = differenceOf(fewer.frame, whole.frame);
  const steady = differenceOf(fewer.frame, again.frame);
  const gone = differenceOf(castingNothing(lab, () => drawnWith(lab, false).frame), fewer.frame);
  const name = `${gear ?? 'as rolled'}, ${wear.length ? 'armoured' : 'bare'}, ${view}`;
  const apart = `${coarse.pixels} pixels apart, by ${coarse.most} at most`;
  const line = `${name}: ${fewer.fewer} pieces cast from fewer triangles (${whole.fewer} held whole); ${apart} from `
    + `every triangle cast (drawn twice: ${steady.pixels}, ${steady.most}); his shadow taken away, ${gone.pixels} `
    + `pixels apart by ${gone.most}`;
  const problems: string[] = [];
  // (through the eyes his body casts nothing, and what his arms cast is mostly out of view: the warrior's arms, drawn
  // by their own camera, cast nothing)
  const seenFromOutside = view !== 'first';
  if (seenFromOutside && !gone.pixels) {
    problems.push(`${name}: his shadow isn't drawn (taken away, the frame is the same)`);
  } else if (seenFromOutside && !fewer.fewer) {
    problems.push(`${name}: no piece cast from fewer triangles`);
  }
  if (coarse.pixels > COARSE_PIXELS || coarse.most > COARSE_LEVELS) {
    problems.push(`${name}: cast from fewer triangles, ${apart}`);
  }
  if (!canary) return { line, problems };
  return { line, problems, caught: gone.pixels > COARSE_PIXELS || gone.most > COARSE_LEVELS };
}

/** A cost in turns said. */
function costWords(cost: TurnsCost | null): string {
  if (!cost) return 'not timed (the engine has no GPU clock here)';
  const told = sure(cost) ? '' : ', not told from nothing';
  return `${cost.takes.toFixed(3)} ms ± ${cost.error.toFixed(3)}${told}`;
}

/** The frame on the engine's GPU clock, in turns: his shadow from every triangle against fewer, and fewer against
 *  none at all (what his whole shadow costs), standing in the lobby's view. */
async function shadowCost(lab: Lab): Promise<Report> {
  await lab.setup({});
  const drawing = lab.drawing;
  lab.drawing = true;
  const casting: THREE.Object3D[] = [];
  lab.player.obj.traverse((object) => {
    if (object.castShadow) casting.push(object);
  });
  try {
    const wholeCost = await costInTurns((on) => holdWhole(on));
    const shadowItself = await costInTurns((on) => {
      for (const object of casting) object.castShadow = on;
    });
    return {
      text: [
        "the frame on the engine's GPU clock, in turns (the sun's map drawn every frame his shadow changes):",
        `  every triangle cast over fewer: ${costWords(wholeCost)}`,
        `  his shadow from fewer triangles over none: ${costWords(shadowItself)}`,
      ].join('\n'),
      problems: [],
    };
  } finally {
    holdWhole(false);
    for (const object of casting) object.castShadow = true;
    lab.drawing = drawing;
  }
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
        // (the canary in the first case seen from outside him: through the eyes his shadow is mostly out of view)
        const canary = options.canary && caught === undefined && view !== 'first';
        const measured = await measureCase(lab, view, gear, wear, canary);
        lines.push(measured.line);
        problems.push(...measured.problems);
        caught ??= measured.caught;
      }
    }
  }
  if (options.canary) {
    const seen = caught ? 'caught' : 'missed';
    lines.push(`canary, his shadow taken away in the first case seen from outside him: ${seen}`);
  }
  if (options.canary && !caught) problems.push('canary: his shadow taken away went unseen');
  return { text: lines.join('\n'), problems };
}
