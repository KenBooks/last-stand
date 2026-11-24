// A skill cast as the player casts it, its effect seen frame by frame (tools/lab `cast`): the hero standing in a
// biome and one of the game's views with the biome's foes coming at him, the skill's key pressed (held for a held
// skill, drawn to full for a drawn shot, held through for a channel) over an aim ahead, and every frame from the press
// until the effect is over drawn as the game draws it and read back from the canvas (page/screenCells.ts). Each
// frame's light is held to the budget taken from the owner's screenshots, the flashes in it are counted as WCAG
// counts them (page/flashes.ts), and the shaders compiled after loading are counted: none may be. A cell that
// flashes is then shared out among what's in the scene (page/flashSources.ts): the cast is played again, and at
// each counted change the frame is drawn with each thing taken out in turn; a frame past the budget is taken apart
// so too (page/budgetSources.ts).
import { SKILL_IMPLS } from '../../../src/combat/skills/index';
import * as THREE from 'three';
import type { Frame, Lab, Pictured, Report } from './lab';
import type { HeldStyle, SkillDef, SkillKey } from '../../../src/types';
import type { Enemy } from '../../../src/entities/enemy';
import type { EnemyId } from '../../../src/data/enemies';
import type { ViewMode } from '../../../src/core/renderer';
import { G } from '../../../src/state';
import { input } from '../../../src/core/input';
import type { Denial } from '../../../src/core/audio';
import { clearEffects } from '../../../src/fx/effects';
import { BIOMES, type BiomeId } from '../../../src/data/biomes';
import { SKILL_KEYS } from '../../../src/loot/loadout';
import { lateCompiles, programsCompiledInGame } from '../../../src/core/shaders';
import { standIn } from './light';
import { cellName, FrameReader, type FrameCells } from './screenCells';
import { BRIGHTEST_SIXTEENTH, budgetJudged, lightLine, seconds, worstLine, worstOn, type Failed,
  type Judged } from './castBudget';
import { breakdownNow, sceneKeys } from './budgetSources';
import { breakdownLine, mostLowering, type Breakdown } from './budgetLines';
import { blinksIn, describeBlinks } from './blinks';
import { whatIsAt } from './whatIsAt';
import { changeSpans, worstFlashing, type FlashCount } from './flashes';
import { changeLine, frameNow, litNow, mostOf, type Lit } from './flashSources';
import { drawnWhole } from './gpuTurns';
import { TUNE } from '../../../src/engine/globals';

/** The faults `cast --canary` plants, a scenario each: either one alone, as each misleads the other's measure (the
 *  ball's light, read under the strobe, was given the strobe's change). */
export type CanaryPlant = 'strobe' | 'glare';

export interface CastOptions {
  /** the skill: its key (`3`), its behaviour (`maelstrom`) or its name */
  skill: string;
  biome: BiomeId;
  view: ViewMode;
  /** the way the hero faces, degrees (0 is +z) */
  facing: number;
  /** where he stands (x, z; the set-up's spot off the dais when not given) */
  at?: [number, number];
  /** how many of the biome's foes come at the hero */
  foes: number;
  /** s from the press: the moments pictured */
  times: number[];
  pictures: boolean;
  /** a moment (s from the press) and a point of the screen (% across and down from its top left): what is met there */
  what?: [number, number, number];
  /** the fault planted, which the checks must catch: a strobe of the exposure (the flashes, and what lit them), or a
   *  white ball before the camera (what lit the frame's brightest sixteenth); none for a cast measured */
  canary: CanaryPlant | null;
  /** the way the hero holds his weapons, and with it the weapon, by its base: when not given, the way the skill
   *  needs (`gearFor`), else as rolled */
  gear?: HeldStyle;
  weapon?: string;
  /** tunable values set for the cast, by their paths (`Fixture.tune`) */
  tune?: Record<string, number[]>;
  /** his Frenzy's stacks as the key is pressed (Wrath spends them, and with none casts nothing) */
  frenzy?: number;
}

/** how far ahead of the hero the aim is (m) */
const AIM_AHEAD = 8;
/** where the foes rise: this far ahead (m), spread over this arc across the aim (rad) */
const FOES_AHEAD = 13;
const FOES_ARC = 1.1;
/** the wave whose pool the foes are drawn from, and how many of its commonest kinds: the brutes' size and their slams'
 *  rings on the floor hid the effect */
const FOES_WAVE = 3;
const FOE_KINDS = 2;
/** a held skill's key held this long before it's let go, and a channel's (s) */
const AIM_HOLD = 0.4;
const CHANNEL_HOLD = 3;
/** the effect looked at past the skill's own time: its cast, its duration and its fading (s) */
const AFTER = 1;
const LEAST_SECONDS = 2;
const MOST_SECONDS = 10;
/** flashes in any one second of a cell that are a hazard */
const FLASHES_MOST = 3;
/** a cell with this many flashes in a second has them shared out among what's in the scene (a replay) */
const SOURCES_FROM = 2;
/** the replay's light may differ from the cast's by this much (a share of white) before it's said */
const REPLAY_OFF = 0.03;
/** the canary's strobe is the exposure's: no thing in the scene may be given more of a change than this */
const CANARY_SHARE = 0.5;
/** with --canary: the plant the budget's breakdown must name, a white ball before the camera (its name, its size and
 *  how far from the camera, m, and where on the screen, the middle of the second row's second sixteenth: at the aim,
 *  8 m ahead, it stood inside the crypt's wall; 3 m ahead of him his body hid it over the shoulder; at the screen's
 *  middle, where four sixteenths meet, it lit a quarter of each, and the effect's was brighter) */
const PLANT_NAME = 'lab canary: glare';
const PLANT_RADIUS = 0.5;
const PLANT_FROM_CAMERA = 2.5;
const PLANT_ON_SCREEN = new THREE.Vector2(-0.25, 0.25);
/** the replay's measure may differ from the cast's by this share of it before it's said */
const BUDGET_REPLAY_OFF = 0.05;
/** with --canary: the strobe's frames on and off, and how much it raises the exposure */
const STROBE_SPAN = 6;
const STROBE_GAIN = 6;

/** A skill of the hero's on its key. */
export interface BoundSkill {
  key: SkillKey;
  def: SkillDef;
}

/** The hero's skill that `wanted` names: its key, its behaviour or its name (any case). */
export function skillNamed(wanted: string): BoundSkill {
  const name = wanted.toLowerCase();
  const bound: BoundSkill[] = [];
  for (const key of SKILL_KEYS) {
    const def = G.player.skillAt(key)?.def;
    if (def) bound.push({ key, def });
  }
  const names = (skill: BoundSkill) => [skill.key, skill.def.impl, skill.def.name].map((each) => each.toLowerCase());
  const named = (skill: BoundSkill) => names(skill).includes(name);
  const found = bound.find(named);
  if (found) return found;
  const known = bound.map((skill) => `${skill.def.impl} (${skill.key})`).join(', ');
  throw new Error(`lab: cast: the ${G.player.cls.id} has no skill ${wanted}: ${known}`);
}

/** A skill the hero knows but hasn't on a key (one a saved loadout left off its key) put on its own key, as the player would bind it in the lobby. */
export function bindKnown(wanted: string): void {
  const hero = G.player;
  const name = wanted.toLowerCase();
  for (const [id, known] of hero.known) {
    const names = [known.def.impl, known.def.name].map((each) => each.toLowerCase());
    if (names.includes(name) && hero.usable(known.def)) hero.bind(known.def.key, id);
  }
}

/** The frame's input holding `key` over `aim` (nothing held when `held` is false). */
export function pressing(key: SkillKey, aim: THREE.Vector3, held: boolean): Frame {
  if (!held) return { aim };
  if (key === 'mouse0') return { m0: true, aim };
  if (key === 'mouse2') return { m2: true, aim };
  return { keys: [key], aim };
}

/** The frame's input holding every one of `keys` at once over `aim` (a channel's key held as another is pressed). */
export function holdingAll(keys: SkillKey[], aim: THREE.Vector3): Frame {
  const held = keys.map((key) => pressing(key, aim, true));
  return {
    keys: held.flatMap((frame) => frame.keys ?? []),
    m0: held.some((frame) => frame.m0),
    m2: held.some((frame) => frame.m2),
    aim,
  };
}

/**
 * How long the key is held: a channel through, a drawn shot to full and a held skill a moment; else a frame (s). A bow
 * draws once its arrow is taken from the quiver (`Player.nockTime`): held for the draw alone, a ranger's shot was
 * loosed a little short of full, and `tooltips` found Nockshot's one hit 427 under its stated 428.
 */
export function holdFor(def: SkillDef): number {
  if (def.channel) return CHANNEL_HOLD;
  if (def.draw) return (G.player.cls.quiver?.fetch ?? 0) + def.draw + AIM_HOLD;
  if (def.aimed) return AIM_HOLD;
  return 0;
}

/** How long the effect is looked at from the press (s). */
function lookFor(def: SkillDef): number {
  const own = holdFor(def) + (def.castTime ?? 0) + (def.duration ?? 0) + AFTER;
  return Math.min(MOST_SECONDS, Math.max(LEAST_SECONDS, own));
}

/** The kinds `count` foes are: the commonest of the biome's for its third wave, in turn. */
function foeKinds(biome: BiomeId, count: number): EnemyId[] {
  const pool = BIOMES[biome].pool(FOES_WAVE).slice().sort((a, b) => b[1] - a[1]).slice(0, FOE_KINDS);
  return Array.from({ length: count }, (_, i) => pool[i % pool.length][0]);
}

/** `count` of the biome's foes risen on an arc ahead of the hero, coming at him. */
export async function foesAhead(lab: Lab, biome: BiomeId, count: number): Promise<Enemy[]> {
  const hero = G.player;
  const foes = foeKinds(biome, count).map((kind, i) => {
    const across = count > 1 ? (i / (count - 1) - 0.5) * FOES_ARC : 0;
    const way = hero.facing + across;
    const at = hero.pos.clone().add(new THREE.Vector3(Math.sin(way), 0, Math.cos(way)).multiplyScalar(FOES_AHEAD));
    return lab.spawnFoe(kind, at);
  });
  await lab.until(() => foes.every((foe) => foe.spawning <= 0), 300, 'the foes never rose');
  return foes;
}

/** With the glare canary, a ball of plain white stood in the camera's sight (he stands still, and it with him), which
 *  the budget's breakdown must name as the thing that lit its brightest sixteenth most; its pipeline made before the
 *  press. One an earlier scenario planted is taken out first. */
async function planted(lab: Lab, canary: CanaryPlant | null): Promise<void> {
  G.scene.getObjectByName(PLANT_NAME)?.removeFromParent();
  if (canary !== 'glare') return;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(PLANT_RADIUS, 24, 12),
    new THREE.MeshBasicMaterial({ color: 0xffffff }));
  ball.name = PLANT_NAME;
  const camera = G.camera.getWorldPosition(new THREE.Vector3());
  const onScreen = new THREE.Vector3(PLANT_ON_SCREEN.x, PLANT_ON_SCREEN.y, 0.5).unproject(G.camera);
  const way = onScreen.sub(camera).normalize();
  ball.position.copy(camera).addScaledVector(way, PLANT_FROM_CAMERA);
  G.scene.add(ball);
  await drawnWhole(() => frameNow(lab));
}

/** With a canary, the exposure for frame `frame` of the effect: raised on every other `STROBE_SPAN` frames. */
function strobed(frame: number, exposure: number): number {
  return Math.floor(frame / STROBE_SPAN) % 2 ? exposure * STROBE_GAIN : exposure;
}

/** A cast's scene: the skill and its key, and the aim it's cast over (kept on `foe` where it needed one). */
interface CastScene {
  key: SkillKey;
  def: SkillDef;
  aim: THREE.Vector3;
  foe?: Enemy;
  view: ViewMode;
}

/** how high on a foe the crosshair of the close views is put, as a share of its height */
const SIGHT_UP = 0.6;

/** The scene's aim, on its foe where it was cast at one (it walks on as the key is pressed). */
function aimOf(scene: CastScene): THREE.Vector3 {
  if (scene.foe?.alive) scene.aim.set(scene.foe.pos.x, 0, scene.foe.pos.z);
  return scene.aim;
}

/** The frame's input holding `key` (while `held`) over the scene's aim, the close views' crosshair turned onto its
 *  foe: there the crosshair aims, not the mouse, and Pounce pressed with the crosshair ahead leapt at nothing. */
function pressingAt(scene: CastScene, held: boolean): Frame {
  return { ...pressing(scene.key, aimOf(scene), held), sight: sightOn(scene.foe, scene.view) };
}

/** Where the crosshair is turned in `view` to aim at `foe`: none from above, or with no foe. */
function sightOn(foe: Enemy | undefined, view: ViewMode): THREE.Vector3 | undefined {
  if (!foe?.alive || view === 'top') return undefined;
  return new THREE.Vector3(foe.pos.x, foe.pos.y + foe.height * SIGHT_UP, foe.pos.z);
}

/** The cast's scene set up afresh: the hero stood in the biome and view, the skill his to cast, the foes coming. */
async function castScene(lab: Lab, options: CastOptions): Promise<CastScene> {
  // (the props an earlier cast broke stand again: broken, they stay so until a run starts, and the next scenario in
  // the biome saw another scene), and what an earlier cast left is taken down (a Hedgeward's wall stood where the
  // next scenario's would rise, and it was never cast)
  G.arena.restoreProps();
  clearEffects();
  const { biome, view, facing, weapon, tune } = options;
  const gear = options.gear ?? gearFor(options.skill);
  const scenario = { biome, view, facing, gear, weapon, tune };
  await standIn(lab, { ...scenario, at: options.at });
  const hero = G.player;
  bindKnown(options.skill);
  const { key, def } = skillNamed(options.skill);
  hero.cooldowns.clear();
  hero.energy = hero.stats.maxEnergy;
  const aim = hero.pos.clone().add(new THREE.Vector3(Math.sin(hero.facing), 0, Math.cos(hero.facing))
    .multiplyScalar(AIM_AHEAD));
  if (options.foes) await foesAhead(lab, options.biome, options.foes);
  await planted(lab, options.canary);
  // (a skill with nothing to cast at isn't cast, `InstantSkill.canCast`: the foes are let come on until it can be.
  // Pounce leaps only onto a foe within its reach, and pressed as they rose 13 m off, nothing was cast)
  withFrenzy(options.frenzy);
  const impl = SKILL_IMPLS[def.impl];
  let foe: Enemy | undefined;
  if (options.foes && !impl.channel && impl.canCast) {
    // (judged at the game's own aim, as its press will be: the close views aim by the crosshair, not by the lab's
    // aim ahead, and Pounce, ready by that aim, was pressed with the crosshair on no foe)
    const ready = () => impl.canCast?.(hero, def, input.ground) ?? true;
    // (a frame first with the aim ahead, so the game's aim is the press's: judged on the aim the set-up left,
    // Hedgeward wasn't ready, and the wait for a foe raised it into the foes walking in)
    await lab.step(1, () => ({ aim }));
    // (ready at once, the foe the game's aim found is followed to the press as a waited-for one is, the crosshair
    // turned onto it and the skill judged again: Pounce, ready by a thornling walking past the crosshair's point,
    // was pressed with it gone, and nothing cast)
    foe = ready() ? foeAimedAt(input.ground) : undefined;
    if (foe) await lab.step(1, () => onFoe(foe, aim, view));
    if (!ready()) foe = await untilCastable(lab, ready, def, aim, view, input.ground.clone());
  }
  withFrenzy(options.frenzy);
  return { key, def, aim, foe, view };
}

/**
 * Frames run until `ready` (the skill has something to cast at), the aim on the nearest foe as a player puts it on
 * one (`aim` moved with it, the cast's own): a fixed aim ahead, Pounce's foes walked up to him and stood at 1 m, its
 * aim 7 m past them, and it never leapt. Failing, where every foe was as it ended.
 */
async function untilCastable(lab: Lab, ready: () => boolean, def: SkillDef, aim: THREE.Vector3, view: ViewMode,
  first: THREE.Vector3): Promise<Enemy | undefined> {
  const onNearest = (): Frame => onFoe(nearestFoe(), aim, view);
  try {
    await lab.until(ready, 900, `${def.name} never had a foe to cast at`, onNearest);
    return nearestFoe();
  } catch (error) {
    const hero = G.player;
    const at = (point: THREE.Vector3) => `${point.x.toFixed(1)}, ${point.z.toFixed(1)}`;
    const where = `him at ${at(hero.pos)} facing ${hero.facing.toFixed(2)}, the game's aim at ${at(input.ground)} `
      + `(${at(first)} at first)`;
    throw new Error(`${(error as Error).message}: ${where}; ${foesWhere()}`);
  }
}

/** His Frenzy set to `stacks` (none given: left as it is), as if his last blow had just landed, so they don't decay
 *  before the press: set before the wait for a foe (Wrath with none can't be cast) and again after it. */
function withFrenzy(stacks: number | undefined): void {
  if (stacks === undefined) return;
  G.player.frenzy = stacks;
  G.player.frenzyAt = G.time;
}

/** the foe a skill that needs one is aimed at: the nearest at least this far off (m). One stood against him, over
 *  the shoulder the crosshair turned onto it passed beside its body and Pounce had no target */
const FOE_LEAST = 3;

/** how near the game's aim a foe stands to be the one it's on, where it isn't on a body (m: Pounce's own) */
const AIMED_NEAR = 2.5;

/** The frame's input with the aim (`aim` moved with it) and the close views' crosshair on `foe`, where there's one. */
function onFoe(foe: Enemy | undefined, aim: THREE.Vector3, view: ViewMode): Frame {
  if (foe) aim.set(foe.pos.x, 0, foe.pos.z);
  return { aim, sight: sightOn(foe, view) };
}

/** The foe the game's aim at `point` is on (the one under the crosshair, else the nearest within `AIMED_NEAR`), if
 *  it's at least `FOE_LEAST` off: nearer, over the shoulder the crosshair turned onto it passes beside it. */
function foeAimedAt(point: THREE.Vector3): Enemy | undefined {
  const hero = G.player.pos;
  const fromHero = (foe: Enemy) => Math.hypot(foe.pos.x - hero.x, foe.pos.z - hero.z);
  const fromAim = (foe: Enemy) => Math.hypot(foe.pos.x - point.x, foe.pos.z - point.z) - foe.radius;
  const onBody = G.player.aimFoe;
  const aimed = (foe: Enemy) => foe === onBody || fromAim(foe) < AIMED_NEAR;
  const standing = G.enemies.filter((foe) => foe.alive && foe.spawning <= 0 && fromHero(foe) >= FOE_LEAST);
  return standing.filter(aimed).sort((a, b) => fromAim(a) - fromAim(b))[0];
}

/** The living, risen foe nearest the hero at least `FOE_LEAST` off, if any. */
function nearestFoe(): Enemy | undefined {
  const hero = G.player.pos;
  const off = (foe: Enemy) => Math.hypot(foe.pos.x - hero.x, foe.pos.z - hero.z);
  const standing = G.enemies.filter((foe) => foe.alive && foe.spawning <= 0 && off(foe) >= FOE_LEAST);
  return standing.sort((a, b) => off(a) - off(b))[0];
}

/**
 * The way of holding his weapons `skill` needs, from his class's data: its staff's school, or its `needs` (both
 * hands empty for the fists' skills, a shield, a two-hander, two blades); none for a skill any weapon casts.
 */
export function gearFor(skill: string): HeldStyle | undefined {
  const name = skill.toLowerCase();
  const named = (def: SkillDef) => [def.impl, def.name].some((each) => each.toLowerCase() === name);
  const def = G.player.cls.skills.find(named);
  if (!def) return undefined;
  if (def.school) return def.school;
  if (def.needs === 'bare' || def.needs === 'fist') return 'bare';
  if (def.needs === 'shield' || def.needs === 'twoHanded' || def.needs === 'dual') return def.needs;
  return undefined;
}

/** Every foe in the arena as words: its kind, how far from the hero, and whether alive and risen. */
function foesWhere(): string {
  const hero = G.player.pos;
  const words = G.enemies.map((foe) => {
    const off = Math.hypot(foe.pos.x - hero.x, foe.pos.z - hero.z);
    const state = !foe.alive ? ' dead' : foe.spawning > 0 ? ' rising' : '';
    return `${foe.type} ${off.toFixed(1)} m${state} (at ${foe.pos.x.toFixed(1)}, ${foe.pos.z.toFixed(1)})`;
  });
  return words.length ? words.join(', ') : 'no foes';
}

/** The game's refusal of a press as a line: why (`Player.refused`), and where its aim and the foes were then. */
function refusal(reason: Denial): string {
  const aim = input.ground;
  const hero = G.player.pos;
  return `refused for its ${reason}, him at ${hero.x.toFixed(1)}, ${hero.z.toFixed(1)}, the game's aim at `
    + `${aim.x.toFixed(1)}, ${aim.z.toFixed(1)}; ${foesWhere()}`;
}

/** What lit a flashing cell's counted changes, and the most of a change any one thing was given. */
interface Sources {
  lines: string[];
  mostShare: number;
}

/** The exposure each frame of the effect is drawn at: strobed with a canary, else `exposure`. */
function exposureFor(options: CastOptions, exposure: number): (frame: number) => number {
  return (frame) => (options.canary === 'strobe' ? strobed(frame, exposure) : exposure);
}

/** Called at each frame of a replay with the exposure each frame is drawn at (one may be read at another's). */
type OnFrame = (frame: number, exposureAt: (frame: number) => number) => void;

/**
 * The cast played again from its set-up to frame `last` (counted from the press, as `cast` counts them), each frame
 * at the exposure the cast drew it at, `onFrame` called after each and `onStart` at the frame before the press. The
 * engine's exposure and the lab's drawing are put back after.
 */
async function replayed(lab: Lab, options: CastOptions, frameTime: number, last: number, onFrame: OnFrame,
  onStart?: () => void): Promise<void> {
  const scene = await castScene(lab, options);
  const holdFrames = Math.max(1, Math.round(holdFor(scene.def) / frameTime));
  const exposure = TUNE.exposure;
  const exposureAt = exposureFor(options, exposure);
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    await lab.step(1, () => ({ aim: aimOf(scene) }));
    onStart?.();
    for (let frame = 0; frame <= last; frame++) {
      TUNE.exposure = exposureAt(frame);
      await lab.step(1, () => pressingAt(scene, frame < holdFrames));
      onFrame(frame, exposureAt);
    }
  } finally {
    TUNE.exposure = exposure;
    lab.drawing = drawing;
  }
}

/**
 * What lit the changes counted in `flashing`'s cell: the cast played again from its set-up, and at each change's
 * two frames the frame drawn with each thing in the scene taken out in turn (page/flashSources.ts). The replay's
 * light is held to the cast's: where the two differ, what it names lit another frame. A change's start is read at its
 * end's exposure too (the engine's, `TUNE.exposure`), so a change of the exposure alone (the canary's strobe) is left
 * to the rest: read each at its own, it scaled every thing's light, and the brightest was given most of it.
 */
async function flashSources(lab: Lab, options: CastOptions, frames: FrameCells[], flashing: FlashCount,
  frameTime: number): Promise<Sources> {
  const lights = frames.map((frame) => frame.cellLights[flashing.cell]);
  const spans = changeSpans(flashing.changes, lights);
  const wanted = new Set(spans.flatMap((span) => [span.from, span.to]));
  const last = Math.max(...wanted);
  /** each wanted frame's light by thing, at its own exposure and at the exposure of the frame its change ends on */
  const lit = new Map<number, Lit>();
  const litAtEnd = new Map<number, Lit>();
  const endOf = new Map(spans.map((span) => [span.from, span.to]));
  await replayed(lab, options, frameTime, last, (frame, exposureAt) => {
    if (!wanted.has(frame)) return;
    lit.set(frame, litNow(lab, flashing.cell));
    const end = endOf.get(frame);
    if (end === undefined) return;
    TUNE.exposure = exposureAt(end);
    litAtEnd.set(frame, litNow(lab, flashing.cell));
    TUNE.exposure = exposureAt(frame);
  });
  const time = (frame: number): string => seconds(frame * frameTime);
  const lines = ['    what lit them (the cast played again, each thing in the scene taken out of the frame in turn):'];
  let mostShare = 0;
  let off = 0;
  for (const span of spans) {
    const from = lit.get(span.from)!;
    const to = lit.get(span.to)!;
    const fromAtEnd = litAtEnd.get(span.from)!;
    lines.push(changeLine(span, from, to, time, fromAtEnd));
    mostShare = Math.max(mostShare, mostOf(fromAtEnd, to, from)?.share ?? 0);
    if (Math.abs(to.whole - lights[span.to]) > REPLAY_OFF) off++;
  }
  if (off) lines.push(`      (the replay's light was not the cast's at ${off} of ${spans.length} changes)`);
  return { lines, mostShare };
}

/** What took the frames past the budget, as lines, and each breakdown read (for the canary's). */
interface BudgetSources {
  lines: string[];
  breakdowns: Breakdown[];
}

/**
 * What took the frames past the budget on each of `failed`'s measures: the cast played again to the frame it was
 * worst on, and the measure read there (at that cell, for the brightest sixteenth) with each thing in the scene
 * taken out in turn, then without what the cast brought into the scene together (page/budgetSources.ts). The
 * replay's reading is held to the cast's.
 */
async function budgetSources(lab: Lab, options: CastOptions, failed: Failed[], frameTime: number,
  before: FrameCells): Promise<BudgetSources> {
  const head = '    what took it past (the cast played again, each thing in the scene taken out of the frame in turn):';
  const lines = [head];
  const breakdowns: Breakdown[] = [];
  const last = Math.max(...failed.map(({ worst }) => worst.index));
  let keysBefore = new Set<string>();
  await replayed(lab, options, frameTime, last, (frame) => {
    for (const { measure, worst } of failed.filter((failure) => failure.worst.index === frame)) {
      const read = measure.readAt?.(worst.frame) ?? measure.of;
      const breakdown = breakdownNow(lab, read, keysBefore);
      breakdowns.push(breakdown);
      lines.push(`     at ${seconds(worst.at)}:`, breakdownLine({ ...measure, read }, breakdown, read(before)));
      if (Math.abs(breakdown.whole - worst.value) <= BUDGET_REPLAY_OFF * worst.value) continue;
      const readings = `${measure.shown(breakdown.whole)} there, the cast ${measure.shown(worst.value)}`;
      lines.push(`      (the replay read ${readings})`);
    }
  }, () => {
    keysBefore = sceneKeys();
  });
  return { lines, breakdowns };
}

/** With the glare canary, the frame the budget's breakdown is read at, past the budget or not (the ball there
 *  before the press, the scene is past it, and isn't judged): the one brightest in a sixteenth. */
function plantFailed(frames: FrameCells[], frameTime: number): Failed {
  return { measure: BRIGHTEST_SIXTEENTH, worst: worstOn(BRIGHTEST_SIXTEENTH, frames, frameTime) };
}

/** `lab cast`, one biome and view: the skill cast, its frames measured; a problem for each check failed. */
export async function cast(lab: Lab, options: CastOptions): Promise<Report> {
  const scene = await castScene(lab, options);
  const { key, def } = scene;
  const hero = G.player;

  const frameTime = window.__labClock.frame / 1000;
  const holdFrames = Math.max(1, Math.round(holdFor(def) / frameTime));
  const lookFrames = Math.round(lookFor(def) / frameTime);
  const pictureFrames = new Map(options.times.map((time) => [Math.round(time / frameTime), time]));
  const compiledBefore = programsCompiledInGame();
  const lateBefore = lateCompiles.length;
  const exposure = TUNE.exposure;
  const drawing = lab.drawing;
  const reader = new FrameReader();
  const moments: Pictured[] = [];
  const met: string[] = [];
  const whatFrame = options.what ? Math.round(options.what[0] / frameTime) : -1;
  let cast = false;
  let refused = '';
  lab.drawing = true;
  try {
    await lab.step(1, () => ({ aim: aimOf(scene) }));
    reader.take();
    for (let frame = 0; frame < lookFrames; frame++) {
      if (options.canary === 'strobe') TUNE.exposure = strobed(frame, exposure);
      await lab.step(1, () => pressingAt(scene, frame < holdFrames));
      reader.take();
      if (frame === whatFrame && options.what) met.push(...metAt(options.what));
      cast ||= hero.cooldowns.has(def.impl) || Boolean(hero.casting) || Boolean(hero.channel);
      if (!cast && !refused && hero.refused) refused = refusal(hero.refused);
      const time = pictureFrames.get(frame);
      if (options.pictures && time !== undefined) {
        const label = `${options.biome} ${options.view}, ${def.name}, ${seconds(time)} after the press`;
        moments.push(await lab.screen(label));
      }
    }
  } finally {
    TUNE.exposure = exposure;
    lab.drawing = drawing;
  }
  const [before, ...frames] = reader.frames();
  const compiled = programsCompiledInGame() - compiledBefore;
  const late = lateCompiles.slice(lateBefore);
  const flashing = worstFlashing(frames.map((frame) => frame.cellLights), frameTime);
  const sources = flashing.most >= SOURCES_FROM
    ? await flashSources(lab, options, frames, flashing, frameTime)
    : null;
  const budget = budgetJudged(frames, frameTime, before);
  const takenApart = options.canary === 'glare' ? [plantFailed(frames, frameTime)] : budget.failed;
  const budgetTaken = takenApart.length ? await budgetSources(lab, options, takenApart, frameTime, before) : null;
  return judged(def, options, {
    before, frames, frameTime, cast, refused, moments, met, compiled, late, flashing, sources, budget, budgetTaken,
  });
}

/** the frame's mean is listed every this long through the cast (s) */
const TIMELINE_STEP = 0.1;

/** The frames' means (as stored, 0 to 255) every `TIMELINE_STEP` s from the press. */
function meanTimeline(frames: FrameCells[], frameTime: number): string {
  const step = Math.max(1, Math.round(TIMELINE_STEP / frameTime));
  const means: string[] = [];
  for (let f = 0; f < frames.length; f += step) means.push(frames[f].mean.toFixed(0));
  return `  its mean every ${TIMELINE_STEP} s: ${means.join(' ')}`;
}

/** The changes counted in the worst flashing cell's worst second: the light (a share of white) each reached, its
 *  way and when. (Its light every third frame was listed: a hand swung in and out of the cell in two frames showed as
 *  a steady fade, and what was counted could not be told.) */
function flashTrace(frames: FrameCells[], flashing: FlashCount, frameTime: number): string {
  const changes = flashing.changes.map(({ frame, rising }) => {
    const light = frames[frame].cellLights[flashing.cell].toFixed(2);
    return `${rising ? 'up' : 'down'} to ${light} at ${seconds(frame * frameTime)}`;
  });
  return `    its changes counted (a tenth of white or more each): ${changes.join(', ')}`;
}

/** What `--what` asks for, as lines: the moment and the point, what the eye's ray met there, and what the hero was
 *  doing then (a blade white after Power Strike might have been its fuller glowing as he cast again: he was doing
 *  nothing, and it was the sky in the steel). */
function metAt([time, across, down]: [number, number, number]): string[] {
  const met = whatIsAt(across / 100, down / 100);
  const doing = `  the hero then: ${heroDoing()}`;
  return [`  at ${seconds(time)}, ${across}% across and ${down}% down, met:`, ...met, doing];
}

/** What the hero is doing: his cast and how far through it, his channel, a dash, a stagger; or nothing. */
function heroDoing(): string {
  const hero = G.player;
  const doing: string[] = [];
  if (hero.casting) {
    const { skill, t, dur } = hero.casting;
    doing.push(`casting ${skill.def.name} (${Number.isFinite(dur) ? `${(t / dur).toFixed(2)} of it` : 'held'})`);
  }
  if (hero.channel) doing.push(`channelling ${hero.channel.skill.def.name}`);
  if (hero.dash) doing.push('dashing');
  if (hero.staggered) doing.push('staggered');
  if (!hero.alive) doing.push('fallen');
  const life = `, his life ${hero.life.toFixed(0)} of ${hero.stats.maxLife.toFixed(0)}`;
  return `${doing.length ? doing.join(', ') : 'nothing'}${life}`;
}

/** What a cast's frames came to. */
interface Seen {
  before: FrameCells;
  frames: FrameCells[];
  frameTime: number;
  cast: boolean;
  /** why the game refused the press, where nothing was cast: the reason, the game's aim and the foes as it was */
  refused: string;
  moments: Pictured[];
  /** what `--what` found */
  met: string[];
  /** the shaders compiled through the cast, and the late compiles' lines */
  compiled: number;
  late: string[];
  flashing: FlashCount;
  /** what lit the flashing cell's changes, where it flashed enough to ask */
  sources: Sources | null;
  /** the frames against the budget, and what took them past it where they went past (with a canary, the plant) */
  budget: Judged;
  budgetTaken: BudgetSources | null;
}

/** The cast's frames as lines, and a problem for each check they failed (with a canary, for one it missed). */
function judged(def: SkillDef, options: CastOptions, seen: Seen): Report {
  const name = `${options.biome} ${options.view}: ${def.name}`;
  const { flashing, compiled } = seen;
  const lines = [
    `${name}: ${seen.frames.length} frames from the press${seen.cast ? '' : ', nothing cast'}`,
    `  before it: ${lightLine(seen.before)}`,
    worstLine(seen.frames, seen.frameTime),
    meanTimeline(seen.frames, seen.frameTime),
    `  flashes: ${flashing.most} in a second at the most`
      + (flashing.most ? ` (${cellName(flashing.cell)}, from ${seconds(flashing.at)})` : ''),
    ...(flashing.most ? [flashTrace(seen.frames, flashing, seen.frameTime)] : []),
    ...(seen.sources?.lines ?? []),
    `  shaders compiled after loading: ${compiled}`,
    ...describeBlinks(blinksIn(seen.frames.map((frame) => frame.fineMeans)), seen.frameTime),
    ...seen.met,
  ];
  for (const late of seen.late) lines.push(`    ${late}`);
  const { budget } = seen;
  lines.push(...budget.notes, ...(seen.budgetTaken?.lines ?? []));
  const found: string[] = [];
  if (!seen.cast) found.push(`nothing was cast${seen.refused ? ` (${seen.refused})` : ''}`);
  found.push(...budget.problems);
  if (flashing.most >= FLASHES_MOST) found.push(`${flashing.most} flashes in a second (${cellName(flashing.cell)})`);
  if (compiled > 0) found.push(`${compiled} shaders compiled after loading`);
  const problems = found.map((problem) => `${name}: ${problem}`);
  if (!options.canary) return { text: lines.join('\n'), problems, moments: seen.moments };
  const missed = options.canary === 'strobe' ? strobeMissed(name, seen, lines) : glareMissed(name, seen, lines);
  return { text: lines.join('\n'), problems: missed, moments: seen.moments };
}

/** With the strobe canary, whether the flashes caught it and what lit them left it to the rest: a problem for each
 *  missed, and a line for each said in `lines`. */
function strobeMissed(name: string, seen: Seen, lines: string[]): string[] {
  const caught = seen.flashing.most >= FLASHES_MOST;
  lines.push(`  canary, a strobe of the exposure: ${caught ? 'caught' : 'missed'}`);
  const missed = caught ? [] : [`${name}: the canary's strobe went unseen`];
  // (the strobe is the exposure's: shared out among the scene's things, it must be left as the rest)
  const blamed = (seen.sources?.mostShare ?? 0) > CANARY_SHARE;
  if (caught) lines.push(`  canary, the strobe given to no thing in the scene: ${blamed ? 'missed' : 'caught'}`);
  if (blamed) missed.push(`${name}: the canary's strobe was given to a thing in the scene`);
  return missed;
}

/** With the glare canary, whether the budget's breakdown named the ball first (it's a thing of the scene, and the
 *  brightest): a problem if not, and a line said in `lines`. */
function glareMissed(name: string, seen: Seen, lines: string[]): string[] {
  const read = seen.budgetTaken?.breakdowns[0];
  const named = read ? mostLowering(read)[0]?.name === PLANT_NAME : false;
  lines.push(`  canary, a white ball before the camera named first of what lit the brightest sixteenth: `
    + `${named ? 'caught' : 'missed'}`);
  return named ? [] : [`${name}: the canary's white ball wasn't named first in the budget's breakdown`];
}
