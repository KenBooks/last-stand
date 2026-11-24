// Every held skill's preview (tools/lab `held`; `SkillDef.aimed`, src/combat/skills/readiness.ts) for the hero's
// class: each skill aimed while its key is held, held over a training dummy ahead as the player holds it. Ready, its
// preview shows in its own look with no countdown, and let go it casts; then held through its cooldown and short of
// energy (page/heldCooldown.ts): red, its seconds counting down, until a release would cast. Quarry Mark's preview
// outlines the foe it would mark in red (src/ui/overlay/outline.ts): in each of the game's views the outline must be
// drawn round that foe, its pixels near it on the screen and none away from it. Starfall's ring must be where its
// crystals surely strike, and every mark a preview lays on the floor must lie on it across the dais's step
// (page/heldArea.ts). No shader may compile meanwhile: every program a preview draws with is compiled at load (the
// outline's, src/game/warmup.ts).
import * as THREE from 'three';
import type { Fixture, Lab, Pictured, Report } from './lab';
import type { Enemy } from '../../../src/entities/enemy';
import type { ViewMode } from '../../../src/core/renderer';
import { G } from '../../../src/state';
import { SKILL_KEYS } from '../../../src/loot/loadout';
import { readinessOf } from '../../../src/combat/skills/readiness';
import { outline, outlinedLook } from '../../../src/ui/overlay/outline';
import { lateCompiles } from '../../../src/core/shaders';
import { drawFrame, type Canvas } from './light';
import { foesAt } from './death';
import { acrossTheStep, starfallStrikes, type HeldSkill, type Shown } from './heldArea';
import { bossRounds } from './heldBoss';
import { cameraAhead } from './onScreen';
import {
  canaryCaught, describeHeld, heldProblems, holdingKey, holdThroughCooldown, meshReader, type PreviewReader,
} from './heldCooldown';

export interface HeldOptions {
  fixture: Fixture;
  /** each preview pictured as the player sees it, ready and on its cooldown */
  pictures: boolean;
  /** plant faults the checks must catch: each preview read as ready with no countdown on its cooldown, Quarry Mark's
   *  outline drawn round the hero instead of the foe, Starfall's ring read as round all its crystals may strike, the
   *  marks on the floor laid point by point across the step, and a shader compiled mid-game */
  canary: boolean;
}

/** how far ahead of the hero the dummy stands (m), and the frames the key is held before the preview is read */
const AHEAD = 7;
const HOLD_FRAMES = 12;
/** the most frames the dummy may take to rise, and a cast to end */
const RISE_FRAMES = 300;
const CAST_FRAMES = 120;
/** the life the foe Quarry Mark is held over has: the cast marks it, and strikes nothing */
const FOE_LIFE = 1000;
/** the views Quarry Mark's outline is checked in */
const OUTLINE_VIEWS: ViewMode[] = ['top', 'third', 'first'];
/** a pixel the outline lit: its red risen by this much over the frame drawn without it (of white) */
const LIT_RISE = 0.2;
/** how far round the foe's box on the screen the outline's pixels may reach (px of the canvas) */
const NEAR_PX = 24;
/** the fewest pixels the outline must light round the foe */
const FEWEST_LIT = 40;

/** the outline's strength under which it reads as dimmed (not ready): halfway from full to Quarry Mark's dimmed */
const DIMMED = 0.75;

/** Quarry Mark's preview as drawn: shown while it outlines something, red (not ready) while the outline is dimmed. */
const outlineReader: PreviewReader = () => {
  const look = outlinedLook();
  return { shown: !!look, red: !!look && look.strength < DIMMED };
};

/** each held skill's preview as it is drawn, by its `impl` */
const READERS: Record<string, PreviewReader> = {
  blink: meshReader('blink-preview'),
  starfall: meshReader('starfall-preview'),
  strawman: meshReader('strawman-preview-spot'),
  hedgeward: meshReader('hedgeward-preview'),
  quarryMark: outlineReader,
};

/** The hero's skills held to aim, in his bar's order. */
function heldSkills(): HeldSkill[] {
  const skills: HeldSkill[] = [];
  for (const key of SKILL_KEYS) {
    const def = G.player.skillAt(key)?.def;
    if (def?.aimed) skills.push({ key, impl: def.impl, name: def.name });
  }
  return skills;
}

/**
 * The run set up afresh in `view`, every cooldown over and the energy full, and a training dummy `AHEAD` m from the
 * hero the way the camera looks (through the eyes the hero faces where the camera looks, which keeps the top-down
 * view's turn), risen.
 */
async function setUpWithDummy(lab: Lab, fixture: Fixture, view: ViewMode): Promise<Enemy> {
  await lab.setup({ ...fixture, view });
  const hero = G.player;
  hero.cooldowns.clear();
  hero.energy = hero.stats.maxEnergy;
  const at = hero.pos.clone().addScaledVector(cameraAhead(), AHEAD).setY(0);
  const dummy = lab.spawnFoe('dummy', at);
  await lab.until(() => !dummy.spawning, RISE_FRAMES, 'the dummy never rose');
  return dummy;
}

/** Whether `hero` has set off the skill `impl`: its cast under way, or his blink. */
const castStarted = (impl: string): boolean => G.player.casting?.skill.def.impl === impl || !!G.player.dash;

/** The box `object` covers on the canvas (px from its bottom left, as the canvas is read), `room` round it. */
function boxOnCanvas(object: THREE.Object3D, canvas: Canvas, room: number): THREE.Box2 {
  const box = new THREE.Box3().setFromObject(object);
  const onScreen = new THREE.Box2();
  const corner = new THREE.Vector3();
  for (let i = 0; i < 8; i++) {
    corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
    corner.project(G.camera);
    onScreen.expandByPoint(new THREE.Vector2((corner.x + 1) / 2 * canvas.width, (corner.y + 1) / 2 * canvas.height));
  }
  return onScreen.expandByScalar(room);
}

/** The pixels the outline lit, near `foe`'s box on the screen and away from it. */
interface OutlinePixels {
  near: number;
  away: number;
}

/**
 * The outline's pixels this frame: the frame drawn as it is, and again with the outline taken off; a pixel it lit is
 * one whose red rose by `LIT_RISE`, counted near `foe` or away from it.
 */
function outlinePixels(lab: Lab, foe: Enemy): OutlinePixels {
  const look = outlinedLook();
  const lit = drawFrame(lab);
  outline(null);
  const bare = drawFrame(lab);
  if (look) outline(look.root, look.color, look.strength);
  const near = boxOnCanvas(foe.obj, lit, NEAR_PX);
  const counted: OutlinePixels = { near: 0, away: 0 };
  const point = new THREE.Vector2();
  for (let y = 0; y < lit.height; y++) {
    for (let x = 0; x < lit.width; x++) {
      const at = (y * lit.width + x) * 4;
      if (lit.pixels[at] - bare.pixels[at] < LIT_RISE) continue;
      if (near.containsPoint(point.set(x, y))) counted.near++;
      else counted.away++;
    }
  }
  return counted;
}

/** What one held skill showed, ready, in one view: its lines and problems, and its picture. */
/**
 * `skill` held over the dummy in `view` ready to cast, its preview read, and let go: it must show in its own look
 * with no countdown, and cast. Quarry Mark's outline must be round the dummy, its pixels near it and none away (with
 * `canary`, it's drawn round the hero instead, which must be caught).
 */
async function heldReady(lab: Lab, skill: HeldSkill, view: ViewMode, options: HeldOptions): Promise<Shown> {
  const dummy = await setUpWithDummy(lab, options.fixture, view);
  const aim = dummy.pos.clone();
  await lab.step(HOLD_FRAMES, () => holdingKey(skill.key, aim));
  const drawn = READERS[skill.impl]?.() ?? { shown: false, red: false };
  const countdown = readinessOf(skill.impl)?.second ?? 0;
  const lines = [`  held ready (${view}): ${describeLook(drawn.shown, drawn.red, countdown)}`];
  const problems: string[] = [];
  const say = (problem: string) => problems.push(`${skill.name}, held ready (${view}): ${problem}`);
  if (!drawn.shown) say('no preview');
  if (drawn.red) say('the preview showed it not ready');
  if (countdown) say(`a countdown showed (${countdown}) with no cooldown`);
  if (skill.impl === 'quarryMark') outlineChecks(lab, dummy, lines, say, false);
  const moments = options.pictures ? [await lab.screen(`${skill.name}: held ready (${view})`)] : [];
  if (skill.impl === 'quarryMark' && options.canary) outlineChecks(lab, dummy, lines, say, true);
  await lab.step(1, () => ({ aim }));
  const cast = castStarted(skill.impl);
  lines.push(`  let go: ${cast ? 'cast' : 'nothing cast'}`);
  if (!cast) say('let go, it didn\'t cast');
  await lab.until(() => !G.player.casting && !G.player.dash, CAST_FRAMES, 'the cast never ended');
  return { lines, problems, moments };
}

/**
 * Quarry Mark held over the biome's commonest foe, standing dazed, and let go: its outline must be round it as it is
 * round the dummy. (A creature is drawn in its kind's crowd, models/crowd.ts, its own meshes on a layer of their own,
 * which the outline draws; the dummy is drawn on its own.)
 */
async function heldOverFoe(lab: Lab, skill: HeldSkill, options: HeldOptions): Promise<Shown> {
  await lab.setup({ ...options.fixture, view: 'top' });
  const hero = G.player;
  hero.cooldowns.clear();
  hero.energy = hero.stats.maxEnergy;
  const [foe] = await foesAt(lab, [hero.pos.clone().addScaledVector(cameraAhead(), AHEAD).setY(0)], [FOE_LIFE]);
  const aim = foe.pos.clone();
  await lab.step(HOLD_FRAMES, () => holdingKey(skill.key, aim));
  const lines = [`  held over a ${foe.type} (top)`];
  const problems: string[] = [];
  const say = (problem: string) => problems.push(`${skill.name}, held over a ${foe.type}: ${problem}`);
  outlineChecks(lab, foe, lines, say, false);
  await lab.step(1, () => ({ aim }));
  await lab.until(() => !G.player.casting, CAST_FRAMES, 'the cast never ended');
  return { lines, problems, moments: [] };
}

/** The preview's look as words. */
function describeLook(shown: boolean, red: boolean, countdown: number): string {
  if (!shown) return 'no preview';
  return `shown ${red ? 'red' : 'ready'}, ${countdown ? `counting ${countdown}` : 'no countdown'}`;
}

/**
 * Quarry Mark's outline checked round `dummy`: what it's drawn round and its pixels, as lines and problems. With
 * `planted`, drawn round the hero instead (the canary): the checks must fail, or that's the problem. The programs the
 * canary's outline compiles (its mask over the hero's meshes, which the game never outlines) aren't counted late.
 */
function outlineChecks(
  lab: Lab, dummy: Enemy, lines: string[], say: (problem: string) => void, planted: boolean,
): void {
  const look = outlinedLook();
  const compiledBefore = lateCompiles.length;
  if (planted && look) outline(lab.model.root, look.color, look.strength);
  const round = outlinedLook()?.root;
  const pixels = outlinePixels(lab, dummy);
  if (planted && look) outline(look.root, look.color, look.strength);
  const canaryCompiled = planted ? lateCompiles.splice(compiledBefore).length : 0;
  if (canaryCompiled) lines.push(`  (the canary's outline round the hero compiled ${canaryCompiled}: not counted)`);
  const faults: string[] = [];
  if (round !== dummy.obj) faults.push('the outline isn\'t round the foe the cast would mark');
  if (pixels.near < FEWEST_LIT) faults.push(`the outline lit ${pixels.near} pixels round the foe`);
  if (pixels.away) faults.push(`the outline lit ${pixels.away} pixels away from the foe`);
  if (planted) {
    lines.push(`  canary, the outline drawn round the hero: ${faults.length ? 'caught' : 'missed'}`);
    if (!faults.length) say('the canary\'s outline round the hero went unseen');
    return;
  }
  lines.push(`  outline: round ${round === dummy.obj ? 'the foe' : 'something else'}, `
    + `${pixels.near} pixels lit round it, ${pixels.away} away from it`);
  for (const fault of faults) say(fault);
}

/** `skill` held through its cooldown and short of energy over the dummy, and with `canary` again with its preview
 *  read ready, which must be caught. */
async function heldOnCooldown(lab: Lab, skill: HeldSkill, options: HeldOptions): Promise<Shown> {
  const read = READERS[skill.impl];
  const dummy = await setUpWithDummy(lab, options.fixture, 'top');
  const aim = dummy.pos.clone();
  const hold = { pictures: options.pictures, canary: false, label: skill.name };
  const { held, moments } = await holdThroughCooldown(lab, skill.key, aim, read, hold);
  const lines = [describeHeld(held)];
  const problems = heldProblems(held).map((problem) => `${skill.name}: ${problem}`);
  if (options.canary) {
    await setUpWithDummy(lab, options.fixture, 'top');
    const planted = await holdThroughCooldown(lab, skill.key, aim, read, { ...hold, pictures: false, canary: true });
    const caught = canaryCaught(planted.held);
    lines.push(`  canary, the preview read ready with no countdown on its cooldown: ${caught ? 'caught' : 'missed'}`);
    if (!caught) problems.push(`${skill.name}: the canary's ready preview on cooldown went unseen`);
  }
  return { lines, problems, moments };
}

/** A program no one has drawn with yet: a mesh ahead of the camera drawn for a couple of frames (the canary's late
 *  compile), then taken away. */
async function compileOneLate(lab: Lab): Promise<void> {
  const material = new THREE.ShaderMaterial({
    vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0); } // lab held: a late compile',
    transparent: true,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.1), material);
  mesh.position.copy(G.camera.position).addScaledVector(G.camera.getWorldDirection(new THREE.Vector3()), 2);
  mesh.frustumCulled = false;
  G.scene.add(mesh);
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    await lab.step(2);
  } finally {
    lab.drawing = drawing;
    G.scene.remove(mesh);
    mesh.geometry.dispose();
    material.dispose();
  }
}

/** Starfall's strikes against its ring (and with `canary` against its ring as it was drawn), and every held skill's
 *  marks on the floor across the dais's step. */
async function areaRounds(lab: Lab, skill: HeldSkill, options: HeldOptions): Promise<Shown[]> {
  const rounds: Shown[] = [];
  if (skill.impl === 'starfall') {
    const setUp = (view: ViewMode) => setUpWithDummy(lab, options.fixture, view);
    rounds.push(await starfallStrikes(lab, skill, setUp, false));
    if (options.canary) rounds.push(await starfallStrikes(lab, skill, setUp, true));
  }
  rounds.push(await acrossTheStep(lab, options.fixture, skill, options.pictures, options.canary));
  return rounds;
}

/** Runs some of a skill's rounds. */
type RoundsRun = () => Promise<Shown[]>;

/** `run`'s rounds, the last of them saying how many shaders compiled while they ran, if any did (which rounds the
 *  late compiles counted at the end came in). */
async function countingCompiles(run: RoundsRun): Promise<Shown[]> {
  const before = lateCompiles.length;
  const rounds = await run();
  const compiled = lateCompiles.length - before;
  if (compiled && rounds.length) rounds[rounds.length - 1].lines.push(`  shaders compiled in these rounds: ${compiled}`);
  return rounds;
}

/** The shaders compiled since `before` of them were, as lines, and a problem if any were. */
function compilesSince(before: number, lines: string[], problems: string[]): void {
  const compiled = lateCompiles.slice(before);
  lines.push(`shaders compiled meanwhile: ${compiled.length}`, ...compiled.map((program) => `  ${program}`));
  if (compiled.length) problems.push(`${compiled.length} shaders compiled while the skills were held (not at load)`);
}

/**
 * `lab held`: each of the hero's held skills held ready (Quarry Mark's in every view) and through its cooldown; a
 * problem for each check failed and each canary missed.
 */
export async function held(lab: Lab, options: HeldOptions): Promise<Report> {
  const skills = heldSkills();
  if (!skills.length) throw new Error(`lab: held: the ${G.player.cls.id} has no skill held to aim`);
  if (skills.some((skill) => !READERS[skill.impl])) {
    const unread = skills.filter((skill) => !READERS[skill.impl]).map((skill) => skill.impl);
    throw new Error(`lab: held: no reader for the preview of ${unread.join(', ')} (page/held.ts READERS)`);
  }
  const lines: string[] = [];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  const compiledBefore = lateCompiles.length;
  for (const skill of skills) {
    lines.push(`${skill.name} (${skill.key})`);
    const views = skill.impl === 'quarryMark' ? OUTLINE_VIEWS : ['top' as ViewMode];
    const runs: RoundsRun[] = [
      ...views.map((view) => async () => [await heldReady(lab, skill, view, options)]),
      ...(skill.impl === 'quarryMark' ? [async () => [await heldOverFoe(lab, skill, options)]] : []),
      ...(skill.impl === 'quarryMark' ? bossRounds(lab, skill, views, options) : []),
      async () => [await heldOnCooldown(lab, skill, options)],
      () => areaRounds(lab, skill, options),
    ];
    for (const run of runs) {
      for (const round of await countingCompiles(run)) {
        lines.push(...round.lines);
        problems.push(...round.problems);
        moments.push(...round.moments);
      }
    }
  }
  compilesSince(compiledBefore, lines, problems);
  if (options.canary) {
    const plantedBefore = lateCompiles.length;
    await compileOneLate(lab);
    const caught = lateCompiles.length > plantedBefore;
    lines.push(`  canary, a shader compiled mid-game: ${caught ? 'caught' : 'missed'}`);
    if (!caught) problems.push('the canary\'s late compile went unseen');
  }
  return { text: lines.join('\n'), problems, moments };
}
