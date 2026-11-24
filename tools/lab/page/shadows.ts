// `lab shadows`: the hero's shadow cast from fewer triangles (src/entities/models/shadowDetail.ts, the engine's
// `casterGeometry`: each of his pieces a record of its own for the shadow alone) against cast from every triangle, as
// the player sees it. In each way he holds his weapons, in all his armour and in none, and in each view, the frame is
// drawn both ways and compared pixel by pixel: its outline within a texel or two, no patch of his own body shaded
// otherwise. The pieces cast from fewer triangles are counted (the engine's `casters`), and his shadow taken away must
// change the frame, so a frame with none can't pass for a match. Through the eyes he looks down at the ground away
// from the sun, where his shadow falls (level, it falls below the view), and his body hidden there must cast too
// (`castsUnseen`, the engine's bridge): taken away, it changes the frame. From #270 to #893 it cast nothing there,
// his arms' shadow floating alone over the ground. `--canary` takes his shadow away, and through the eyes leaves his
// hidden body uncast, as it was: each must be seen. `--cost` times the frame on the engine's GPU
// clock in turns, each way and with him casting nothing. It compared his pieces cast as one (castAsOne.ts) against
// each alone, in three's shadow pass, which the engine never runs: under it the two drew the same, no piece was cast
// as one, and its timing read three's shadow map, never drawn.
import * as THREE from 'three';
import type { Lab, Report } from './lab';
import type { ViewMode } from '../../../src/core/renderer';
import type { WeaponStyle } from '../../../src/loot/loadout';
import { castingAsOne } from '../../../src/entities/models/castAsOne';
import { RUST } from '../../../src/engine';
import { G } from '../../../src/state';
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
/** through the eyes, looking down at his shadow close by, the most of its pixels (a share) the shadow cast from fewer
 *  triangles may differ in: its outline larger on the screen than any view's from outside him (the warrior's read
 *  0.5% to 3.5%) */
const COARSE_SHARE_EYES = 0.05;

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

/** What casts of the hero (of it, what `which` takes), each part's own say, while `run` runs with none of it
 *  casting. */
function castingNothing<T>(lab: Lab, run: () => T, which: (object: THREE.Object3D) => boolean = () => true): T {
  const casting: THREE.Object3D[] = [];
  lab.player.obj.traverse((object) => {
    if (object.castShadow && which(object)) casting.push(object);
  });
  for (const object of casting) object.castShadow = false;
  try {
    return run();
  } finally {
    for (const object of casting) object.castShadow = true;
  }
}

/** Whether `object` is his body hidden through the eyes, cast for its shadow alone (`entities/viewModel.ts`). */
function unseen(object: THREE.Object3D): boolean {
  return Boolean(object.userData.castsUnseen);
}

/** how far from his feet, away from the sun, he looks through the eyes (m): onto his shadow */
const SHADOW_AHEAD = 1.2;
/** frames the look is given to settle */
const LOOK_FRAMES = 5;

/** Through the eyes, the hero turned away from the sun and looking down onto the ground his shadow falls on. */
async function lookAtHisShadow(lab: Lab): Promise<void> {
  let sun: THREE.DirectionalLight | null = null;
  G.scene.traverse((object) => {
    const light = object as THREE.DirectionalLight;
    if (light.isDirectionalLight && light.castShadow && light.visible) sun = light;
  });
  if (!sun) throw new Error('lab: shadows: no light casting as the sun does');
  const light: THREE.DirectionalLight = sun;
  const away = light.target.position.clone().sub(light.position).setY(0).normalize();
  const spot = lab.player.obj.position.clone().addScaledVector(away, SHADOW_AHEAD);
  await lab.step(LOOK_FRAMES, () => ({ sight: spot }));
}

/** His hidden body left uncast through the eyes (the eyes' canary), as from #270 to #893, while `run` runs. */
function leftUncast<T>(lab: Lab, run: () => T): T {
  const body: THREE.Object3D[] = [];
  lab.player.obj.traverse((object) => {
    if (unseen(object)) body.push(object);
  });
  for (const object of body) object.userData.castsUnseen = false;
  try {
    return run();
  } finally {
    for (const object of body) object.userData.castsUnseen = true;
  }
}

/** How the frame differs with his hidden body's casting taken away. */
function hiddenBodyCast(lab: Lab): Difference {
  const casting = drawnWith(lab, false).frame;
  return differenceOf(castingNothing(lab, () => drawnWith(lab, false).frame, unseen), casting);
}

/** What a case's canaries caught (none when not asked for). */
interface Caught {
  /** his shadow taken away seen */
  shadow?: boolean;
  /** through the eyes, his hidden body left uncast seen */
  eyes?: boolean;
}

/** One case's line, and its problems. */
async function measureCase(lab: Lab, view: ViewMode, gear: WeaponStyle | undefined, wear: readonly string[],
  canary: { shadow: boolean; eyes: boolean }): Promise<{ line: string; problems: string[]; caught: Caught }> {
  await lab.setup({ view, gear, facing: FACING, wear: [...wear] as ('helm' | 'chest' | 'hands')[] });
  if (view === 'first') await lookAtHisShadow(lab);
  const whole = drawnWith(lab, true);
  const fewer = drawnWith(lab, false);
  const again = drawnWith(lab, false);
  holdWhole(false);
  const coarse = differenceOf(fewer.frame, whole.frame);
  const steady = differenceOf(fewer.frame, again.frame);
  const gone = differenceOf(castingNothing(lab, () => drawnWith(lab, false).frame), fewer.frame);
  const name = `${gear ?? 'as rolled'}, ${wear.length ? 'armoured' : 'bare'}, ${view}`;
  const apart = `${coarse.pixels} pixels apart, by ${coarse.most} at most`;
  let line = `${name}: ${fewer.fewer} pieces cast from fewer triangles (${whole.fewer} held whole); ${apart} from `
    + `every triangle cast (drawn twice: ${steady.pixels}, ${steady.most}); his shadow taken away, ${gone.pixels} `
    + `pixels apart by ${gone.most}`;
  const problems: string[] = [];
  if (!gone.pixels) problems.push(`${name}: his shadow isn't drawn (taken away, the frame is the same)`);
  else if (!fewer.fewer) problems.push(`${name}: no piece cast from fewer triangles`);
  const caught: Caught = {};
  if (canary.shadow) caught.shadow = gone.pixels > COARSE_PIXELS || gone.most > COARSE_LEVELS;
  if (view === 'first') {
    const body = hiddenBodyCast(lab);
    line += `; his hidden body's casting taken away, ${body.pixels} pixels apart by ${body.most}`;
    if (body.pixels <= COARSE_PIXELS) problems.push(`${name}: his body hidden through the eyes casts no shadow`);
    if (canary.eyes) caught.eyes = leftUncast(lab, () => hiddenBodyCast(lab)).pixels <= COARSE_PIXELS;
  }
  const coarseMost = view === 'first' ? Math.max(COARSE_PIXELS, gone.pixels * COARSE_SHARE_EYES) : COARSE_PIXELS;
  if (coarse.pixels > coarseMost || coarse.most > COARSE_LEVELS) {
    problems.push(`${name}: cast from fewer triangles, ${apart}`);
  }
  return { line, problems, caught };
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
  let caughtEyes: boolean | undefined;
  const styles: (WeaponStyle | undefined)[] = stylesOf(lab);
  if (!styles.length) styles.push(undefined);
  for (const gear of styles) {
    for (const wear of WEARS) {
      for (const view of options.views ?? VIEWS) {
        const canary = {
          shadow: options.canary && caught === undefined,
          eyes: options.canary && caughtEyes === undefined,
        };
        const measured = await measureCase(lab, view, gear, wear, canary);
        lines.push(measured.line);
        problems.push(...measured.problems);
        caught ??= measured.caught.shadow;
        caughtEyes ??= measured.caught.eyes;
      }
    }
  }
  if (options.canary) lines.push(`canary, his shadow taken away in the first case: ${caught ? 'caught' : 'missed'}`);
  if (options.canary && !caught) problems.push('canary: his shadow taken away went unseen');
  if (options.canary && caughtEyes !== undefined) {
    lines.push(`canary, his hidden body left uncast through the eyes: ${caughtEyes ? 'caught' : 'missed'}`);
    if (!caughtEyes) problems.push('canary: his hidden body left uncast through the eyes went unseen');
  }
  return { text: lines.join('\n'), problems };
}
