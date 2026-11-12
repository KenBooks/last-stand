// `lab perf`: skills cast in turn as the player casts them, the biome's foes coming at the hero, and every frame timed
// as the game's performance report times it (ui/perfHud.ts, on the browser's clock here: the page's stands still
// within a frame). Each frame is timed whole by the browser's clock, the game drawn and waited out on the GPU. Its
// update is split by stage, its render timed on the CPU, and the GPU timed by pass where the browser times it
// (EXT_disjoint_timer_query_webgl2). Its draws, triangles and particles are counted. Each phase is summed apart:
// standing before the first press, then from each press to the next, the last one to the effects' end. Run it on a
// phone's screen, quality and CPU with `--screen 832x384@3.75 --quality low@518400 --throttle 4`. (The owner's report
// from a phone, #243: frames of 42 to 67 ms after Maelstrom and Glacial Nova, on a canvas of 3120x1440 with the scene
// drawn at 0.52 Mpx.) With `--village`, the lobby's village instead, at an hour (`--hour`): the hero standing on its
// square, then walking, no skill cast (the owner's report, 2026-10-30: 10 to 13 ms of GPU a frame on an RTX 4070 Ti,
// the shadows half of it, where the goal is a steady 144 frames a second).
import * as THREE from 'three';
import type { Frame, Lab, Report } from './lab';
import type { BiomeId } from '../../../src/data/biomes';
import type { QualityLevel } from '../../../src/data/quality';
import type { WeaponStyle } from '../../../src/loot/loadout';
import type { GpuFrame } from '../../../src/ui/perfHud';
import * as perfHud from '../../../src/ui/perfHud';
import * as quality from '../../../src/core/quality';
import * as renderer from '../../../src/core/renderer';
import { G } from '../../../src/state';
import { Player } from '../../../src/entities/player';
import { heroDetail } from '../../../src/entities/models/armor';
import { particles } from '../../../src/fx/particles';
import { programsCompiledInGame } from '../../../src/core/shaders';
import { bindKnown, foesAhead, holdFor, pressing, skillNamed } from './cast';
import { standIn } from './light';
import { toLobby } from './hallMoves';
import { quantile } from './timing';
import { particleFill } from './particleFill';
import { reportRead } from './perfReport';
import { WEBGPU, gpuDone } from '../../../src/core/webgpu';
import { inVillage, VILLAGE_SPOT } from './draws';
import { holdHour } from '../../../src/game/clock';
import { goTo, villageObject } from '../../../src/game/village';
import { HALL, TERRACE, inHall } from '../../../src/data/village';
import { groundHeight } from '../../../src/world/ground';
import { viewBy } from './villageHallCull';

export interface PerfOptions {
  biome: BiomeId;
  view: renderer.ViewMode;
  /** the way the hero faces and casts, degrees (0 is +z) */
  facing: number;
  /** where he stands (x, z; the set-up's spot off the dais when not given) */
  at?: [number, number];
  /** the way the hero holds his weapons (as rolled when not given) */
  gear?: WeaponStyle;
  /** the casts made in the lobby, the run abandoned for it: its camera is lower and nearer than a run's */
  lobby?: boolean;
  /** after the phases, the biggest draws timed on the GPU, drawn and hidden in turns (`perfParts.ts`) */
  parts?: boolean;
  /** the skills cast in turn: each one's key, behaviour or name */
  casts: string[];
  /** s from one press to the next, and from the last one to the end */
  apart: number;
  after: number;
  /** how many of the biome's commonest foes come at the hero */
  foes: number;
  /** the quality level, and the most pixels the scene renders (none: no budget; no quality: as the page has it) */
  quality?: { level: QualityLevel; pixels?: number };
  /** how many times slower the CPU runs (1: as it is) */
  throttle: number;
  /** list every frame */
  frames: boolean;
  /** plant a cost the measure must see */
  canary: boolean;
  /** in the lobby's village instead: standing and walking, no foes, no casts */
  village?: boolean;
  /** with `village`, the hour it's lit for (the page's own when not given) */
  hour?: number;
  /** with `village`, the view turned right round on the spot three times instead */
  spin?: boolean;
  /** the device played (lab/node/devices.mjs): its screen drawn here at `gpu` times its pixels */
  device?: Device;
}

/** A device played: its name, what it is, how many times this GPU's work it does a frame, its own screen, and the
 *  page's work a frame its reports read. */
interface Device {
  name: string;
  what: string;
  gpu: number;
  screen: { width: number; height: number; ratio: number };
  pageWork: string;
}

/** how far ahead of the hero the aim is (m): Maelstrom roams to it, into the foes coming */
const AIM_AHEAD = 8;
/** the frames timed before the first press, the foes coming, and the canary's frames each way */
const BEFORE_FRAMES = 60;
const CANARY_FRAMES = 60;
/** the canary's costs: the hero's update made this much slower a frame (ms), and the scene drawn twice */
const CANARY_MS = 2;
/** the canary is seen when the hero's stage rises by this share of its planted ms at least, and the scene's GPU part
 *  by this many times its own (drawn twice, it read 1.56 times on a desktop: a pass that waits on the page's commands
 *  grows by less than its draws) */
const CANARY_SEEN = 0.8;
const CANARY_GPU = 1.3;
/** the canary's particles this many times as wide, and the least their fill must rise by (4 times, less the points
 *  held at the GPU's largest and those come or gone between the rounds) */
const CANARY_WIDER = 2;
const CANARY_FILL = 2.5;
/** the update's stages listed for a phase, the slowest first */
const STAGES_LISTED = 5;
/** the village's frames timed standing, and walking (half of them ahead, half to the side) */
const VILLAGE_FRAMES = 120;
/** the frames the hero is given to walk from the square into the hall of heroes, to its dais (from play: "lag when
 *  entering hall of heroes", frames of 875 and 472 ms as he walked in) */
const HALL_FRAMES = 900;
/** the frames a turn right round takes, and the turns timed (from play: "initial spin around in 3rd person causes a
 *  drop to 100 fps or below": what the first turn does that the later ones don't) */
const SPIN_FRAMES = 240;
const SPIN_TURNS = 3;
/** the ways round each read on its own, and the frames the view is left to settle on one */
const SPIN_WAYS = 8;
const SPIN_SETTLE = 15;
const UPLOADERS_SAID = 6;
/** where the hero stands in the hall to look out of its door at the square, how far in from the door (m) (from play,
 *  a perf report "looking at plaza from hall": the render 15 ms of the CPU, 522 draws) */
const OUT_FROM = 7;
/** the slowest frames of a phase listed, each with what it spent */
const SLOWEST_LISTED = 4;

/** A frame timed: the frame by the browser's clock (the page's work and the GPU's in turn), the page's work, its
 *  update and render (ms), each update stage's, and what it drew and held. */
interface Timed {
  frame: number;
  cpu: number;
  update: number;
  render: number;
  stages: Record<string, number>;
  draws: number;
  triangles: number;
  particles: number;
  /** the pixels the particles cover, every layer, and the scene's pixels (`particleFill.ts`) */
  fill: number;
  pixels: number;
  foes: number;
}

/** A phase's frames, and the GPU's frames that came back over it. */
interface Phase {
  name: string;
  frames: Timed[];
  gpu: GpuFrame[];
}

/** A value's median, 90th percentile and most over frames. */
interface Spread {
  median: number;
  p90: number;
  most: number;
}

function spreadOf(values: number[]): Spread {
  const sorted = [...values].sort((a, b) => a - b);
  return { median: quantile(sorted, 0.5), p90: quantile(sorted, 0.9), most: sorted[sorted.length - 1] ?? 0 };
}

const ms = (value: number) => value.toFixed(1);
const spreadWords = (spread: Spread) => `${ms(spread.median)} (90th ${ms(spread.p90)}, most ${ms(spread.most)})`;
const megapixels = (size: THREE.Vector2) => ((size.x * size.y) / 1e6).toFixed(2);
const millions = (count: number) => (count >= 1e6 ? `${(count / 1e6).toFixed(2)}M` : `${Math.round(count / 1e3)}k`);

/** Whether this game's perf overlay can be timed by another clock and read frame by frame (a game older than it
 *  can't: an A/B against one says so). */
const timeable = () => ['perfClock', 'lastPerfFrame', 'takeGpuFrames'].every((name) => name in perfHud)
  && 'useQuality' in quality;

/** The browser's next task: a WebGL query's time comes back only once the task that ended it is over (the lab's
 *  frames run in one task, and the GPU read as untimed). */
const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** a pixel read back, which the GPU must have drawn first */
const readBack = new Uint8Array(4);

/**
 * Waits for the GPU to draw what the page sent it: what it draws runs behind the page, and the page's own time leaves
 * it out. A pixel is read back, as WebGL's `finish` returned at once under ANGLE's D3D11 (the frame read 7 ms with the
 * GPU's timer at 13 to 29). On WebGPU, its queue's work done (`gpuDone`): it has no pixel to read back that way.
 */
async function waitForGpu(): Promise<void> {
  if (WEBGPU) {
    await gpuDone(G.renderer);
    return;
  }
  // (the canvas bound through three, whose state keeps what's bound)
  const target = G.renderer.getRenderTarget();
  G.renderer.setRenderTarget(null);
  const gl = G.renderer.getContext();
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, readBack);
  G.renderer.setRenderTarget(target);
}

/** One frame run and timed by the browser's clock, waited out on the GPU, and what the perf overlay timed of it. */
async function timedFrame(lab: Lab, input: () => Frame): Promise<Timed> {
  const now = window.__labClock.realNow;
  const start = now();
  await lab.step(1, input);
  await waitForGpu();
  const frame = now() - start;
  await nextTask();
  const timed = perfHud.lastPerfFrame();
  const drawn = G.renderer.info.render;
  const { fill, pixels } = particleFill();
  return {
    frame,
    cpu: timed?.cpu ?? 0,
    update: timed?.upd ?? 0,
    render: timed?.rnd ?? 0,
    stages: { ...(timed?.stages ?? {}) },
    draws: drawn.calls,
    triangles: drawn.triangles,
    particles: particles.glow.count + particles.smoke.count,
    fill,
    pixels,
    foes: G.enemies.filter((foe) => foe.alive).length,
  };
}

/** `count` frames timed as a phase, each frame's input from `input`. */
async function timePhase(lab: Lab, name: string, count: number, input: (f: number) => Frame): Promise<Phase> {
  const phase: Phase = { name, frames: [], gpu: [] };
  for (let f = 0; f < count; f++) {
    phase.frames.push(await timedFrame(lab, () => input(f)));
    phase.gpu.push(...perfHud.takeGpuFrames());
  }
  return phase;
}

/** The GPU's frames timed whole (ms), and each part's median over the frames timed in parts, the most first. */
function gpuOf(phase: Phase): { whole: number[]; parts: [string, number][] } {
  const whole = phase.gpu.filter((frame) => !frame.parts).map((frame) => frame.ms);
  const byPart = new Map<string, number[]>();
  for (const frame of phase.gpu) {
    for (const [part, took] of Object.entries(frame.parts ?? {})) {
      if (!byPart.has(part)) byPart.set(part, []);
      byPart.get(part)!.push(took);
    }
  }
  const parts = [...byPart].map(([part, took]): [string, number] => [part, spreadOf(took).median]);
  return { whole, parts: parts.sort((a, b) => b[1] - a[1]) };
}

/** Each update stage's spread over the phase's frames, the slowest (by median) first. */
function stagesOf(phase: Phase): [string, Spread][] {
  const byStage = new Map<string, number[]>();
  for (const frame of phase.frames) {
    for (const [stage, took] of Object.entries(frame.stages)) {
      if (!byStage.has(stage)) byStage.set(stage, []);
      byStage.get(stage)!.push(took);
    }
  }
  const stages = [...byStage].map(([stage, took]): [string, Spread] => [stage, spreadOf(took)]);
  return stages.sort((a, b) => b[1].median - a[1].median || b[1].most - a[1].most);
}

/** A phase as lines: its frame, the page's work and the GPU's, what it drew, the GPU by pass and the update by
 *  stage. */
function phaseLines(phase: Phase, device?: Device): string[] {
  const of = (pick: (frame: Timed) => number) => spreadOf(phase.frames.map(pick));
  const most = (pick: (frame: Timed) => number) => Math.max(...phase.frames.map(pick));
  const gpu = gpuOf(phase);
  const gpuWords = gpu.whole.length ? `the GPU ${spreadWords(spreadOf(gpu.whole))}` : 'the GPU untimed';
  const lines = [
    `${phase.name}: ${phase.frames.length} frames, up to ${most((frame) => frame.foes)} foes and `
      + `${most((frame) => frame.particles)} particles`,
    `  the frame ${spreadWords(of((frame) => frame.frame))} ms, the page's work and the GPU's in turn`,
    `  the page's work ${spreadWords(of((frame) => frame.cpu))}: the update ${ms(of((frame) => frame.update).median)},`
      + ` the render ${ms(of((frame) => frame.render).median)}; ${gpuWords}`,
    ...(device ? [deviceLine(device, gpu.whole)] : []),
    `  draws ${Math.round(of((frame) => frame.draws).median)} (most ${most((frame) => frame.draws)}), triangles `
      + `${millions(of((frame) => frame.triangles).median)} (most ${millions(most((frame) => frame.triangles))})`,
  ];
  const fill = of((frame) => frame.fill);
  const pixels = phase.frames[0]?.pixels ?? 1;
  const times = (value: number) => (value / pixels).toFixed(1);
  lines.push(`  the particles' fill ${millions(fill.median)} pixels a frame (90th ${millions(fill.p90)}, most `
    + `${millions(fill.most)}): ${times(fill.median)} times the scene's (most ${times(fill.most)})`);
  if (gpu.parts.length) {
    const parts = gpu.parts.map(([part, took]) => `${part} ${took.toFixed(2)}`);
    lines.push(`  the GPU by part (median ms): ${parts.join(', ')}`);
  }
  const stages = stagesOf(phase).slice(0, STAGES_LISTED).map(([stage, spread]) => `${stage} ${spreadWords(spread)}`);
  lines.push(`  the update by stage: ${stages.join(', ')}`);
  lines.push(`  the slowest frames: ${slowestFrames(phase).join('; ')}`);
  return lines;
}

/** A phase's slowest frames by the browser's clock, each with its page's work and its slowest stages. */
function slowestFrames(phase: Phase): string[] {
  const indexed = phase.frames.map((frame, f) => ({ frame, f }));
  indexed.sort((a, b) => b.frame.frame - a.frame.frame);
  return indexed.slice(0, SLOWEST_LISTED).map(({ frame, f }) => {
    const stages = Object.entries(frame.stages).sort((a, b) => b[1] - a[1]).slice(0, 2);
    const top = stages.map(([stage, took]) => `${stage} ${ms(took)}`).join(', ');
    return `${f}: ${ms(frame.frame)} (the page's ${ms(frame.cpu)}: ${ms(frame.update)} + ${ms(frame.render)}, ${top})`;
  });
}

/**
 * The frame a device would take: the GPU's (`gpuWhole`, its frames timed here at the device's work), as its page's
 * work runs beside it there and its reports read it shorter (lab/node/devices.mjs).
 */
function deviceLine(device: Device, gpuWhole: number[]): string {
  if (!gpuWhole.length) return `  as the ${device.name}: unknown, the GPU untimed`;
  const gpu = spreadOf(gpuWhole);
  const fps = Math.round(1000 / gpu.median);
  return `  as the ${device.name}: the frame ${ms(gpu.median)} ms (90th ${ms(gpu.p90)}), ${fps} fps, its GPU's (the `
    + `page's work beside it, ${device.pageWork} in its reports)`;
}

/** The device a command plays, as a line. */
function deviceTitle(device: Device): string {
  const { width, height, ratio } = device.screen;
  return `played as the ${device.name}, ${device.what}: its screen ${width}x${height} at ${ratio}, drawn here at `
    + `${device.gpu} times its pixels as its GPU does ${device.gpu} times this one's work a frame`;
}

/** Every frame of a phase as a line. */
function frameLines(phase: Phase): string[] {
  return phase.frames.map((frame, f) => {
    const stages = Object.entries(frame.stages).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const top = stages.map(([stage, took]) => `${stage} ${ms(took)}`).join(', ');
    return `    ${phase.name} ${f}: ${ms(frame.frame)} ms, the page's ${ms(frame.cpu)} (${ms(frame.update)} + `
      + `${ms(frame.render)}: ${top}), ${frame.draws} draws, ${millions(frame.triangles)} triangles, `
      + `${frame.particles} particles`;
  });
}

/** What the screen and the quality draw: the canvas's pixels, the scene's, the level, its budget and the hero's
 *  detail. */
function screenLine(): string {
  const canvas = G.renderer.getDrawingBufferSize(new THREE.Vector2());
  const scene = renderer.sceneSize(new THREE.Vector2());
  const budget = Number.isFinite(quality.qualityBudget()) ? ` at most ${megapixels(new THREE.Vector2(
    quality.qualityBudget(), 1))} Mpx` : '';
  return `the canvas ${canvas.x}x${canvas.y} (${megapixels(canvas)} Mpx) at ${G.renderer.getPixelRatio()}, the scene `
    + `${scene.x}x${scene.y} (${megapixels(scene)} Mpx) at ${renderer.sceneRatio().toFixed(2)}; quality `
    + `${quality.qualityLevel()}${budget}, the hero built at ${heroDetail()} of his detail`;
}

/** Each hero's update made `CANARY_MS` slower, the scene drawn twice and the particles `CANARY_WIDER` times as wide;
 *  returns what puts them back. */
function plantCost(): () => void {
  const update = Player.prototype.update;
  const now = window.__labClock.realNow;
  Player.prototype.update = function slowed(this: Player, dt: number): void {
    const until = now() + CANARY_MS;
    while (now() < until) {
      // (the planted cost: the measure must see it)
    }
    update.call(this, dt);
  };
  const gl = G.renderer;
  const render = gl.render;
  gl.render = (scene, camera) => {
    if (scene === G.scene) render.call(gl, scene, camera);
    render.call(gl, scene, camera);
  };
  const pools = [particles.glow, particles.smoke];
  const updates = pools.map((pool) => pool.update);
  for (const pool of pools) {
    const own = pool.update.bind(pool);
    pool.update = (dt: number) => {
      own(dt);
      pool.mat.uniforms.uScale.value *= CANARY_WIDER;
    };
  }
  return () => {
    Player.prototype.update = update;
    gl.render = render;
    pools.forEach((pool, i) => {
      pool.update = updates[i];
    });
  };
}

/** The canary: frames as they are, then with the costs planted; its lines, and a problem for a cost unseen. */
async function canaryRound(lab: Lab, aim: THREE.Vector3): Promise<{ lines: string[]; problems: string[] }> {
  const plain = await timePhase(lab, 'the canary, as it is', CANARY_FRAMES, () => ({ aim }));
  const unplant = plantCost();
  let planted: Phase;
  try {
    planted = await timePhase(lab, 'the canary, planted', CANARY_FRAMES, () => ({ aim }));
  } finally {
    unplant();
  }
  const heroStage = (phase: Phase) => stagesOf(phase).find(([stage]) => stage === 'player')?.[1].median ?? 0;
  const scenePart = (phase: Phase) => gpuOf(phase).parts.find(([part]) => part === 'scene')?.[1] ?? 0;
  const rose = heroStage(planted) - heroStage(plain);
  const lines = [
    `the canary: the hero's update ${ms(CANARY_MS)} ms slower, the hero's stage up ${ms(rose)} ms`,
  ];
  const problems: string[] = [];
  if (rose < CANARY_MS * CANARY_SEEN) {
    problems.push(`the canary's ${ms(CANARY_MS)} ms in the hero's update read as ${ms(rose)}`);
  }
  const fillOf = (phase: Phase) => spreadOf(phase.frames.map((frame) => frame.fill)).median;
  const wider = fillOf(plain) > 0 ? fillOf(planted) / fillOf(plain) : 0;
  lines.push(`the canary: the particles ${CANARY_WIDER} times as wide, their fill ${wider.toFixed(2)} times its own`);
  if (wider < CANARY_FILL) {
    problems.push(`the canary's particles ${CANARY_WIDER} times as wide filled ${wider.toFixed(2)} times as much`);
  }
  if (scenePart(plain) > 0) {
    const times = scenePart(planted) / scenePart(plain);
    lines.push(`the canary: the scene drawn twice, its GPU part ${times.toFixed(2)} times its own`);
    if (times < CANARY_GPU) problems.push(`the canary's scene drawn twice read as ${times.toFixed(2)} times its own`);
  }
  return { lines, problems };
}

/** The casts in turn, each a phase from its press, after a phase standing; with whether each cast. */
async function castPhases(lab: Lab, options: PerfOptions, aim: THREE.Vector3): Promise<{ phases: Phase[];
  uncast: string[]; }> {
  const hero = G.player;
  const frameTime = window.__labClock.frame / 1000;
  const phases = [await timePhase(lab, 'standing', BEFORE_FRAMES, () => ({ aim }))];
  const uncast: string[] = [];
  for (const [i, wanted] of options.casts.entries()) {
    const { key, def } = skillNamed(wanted);
    const held = Math.max(1, Math.round(holdFor(def) / frameTime));
    const span = i === options.casts.length - 1 ? options.after : options.apart;
    hero.energy = hero.stats.maxEnergy;
    const at = (i * options.apart).toFixed(1);
    // (a channel leaves no cooldown: it was cast if it was ever channelled, as `cast` judges it; by the cooldown
    // alone, Void Lance held for its 3 s read "pressed and never cast")
    let cast = false;
    const phase = await timePhase(lab, `${def.name}, from its press at ${at} s`, Math.round(span / frameTime),
      (f) => {
        cast ||= Boolean(hero.channel) || Boolean(hero.casting);
        return pressing(key, aim, f < held);
      });
    if (!cast && !hero.cooldowns.has(def.impl)) uncast.push(def.name);
    phases.push(phase);
  }
  return { phases, uncast };
}

/** The hero standing in the village, then walking ahead and to his side, each a phase. */
async function villagePhases(lab: Lab): Promise<Phase[]> {
  const half = VILLAGE_FRAMES / 2;
  return [
    await timePhase(lab, 'standing', VILLAGE_FRAMES, () => ({})),
    await timePhase(lab, 'walking', VILLAGE_FRAMES, (f) => ({ keys: f < half ? ['w'] : ['a'] })),
    await intoTheHall(lab),
    // (stood at the dais, the other heroes before him: the hall's own frame, the walk's frames left out)
    await timePhase(lab, 'in the hall', VILLAGE_FRAMES, () => ({})),
    await lookingOut(lab),
  ];
}

/** Whether three has made a geometry's buffers: it listens for its disposal from then on (its `_listeners` are private,
 *  so this is checked to read something: a frame's drawn meshes must have them). */
function onTheGpu(geometry: THREE.BufferGeometry): boolean {
  return Boolean(listenersOf(geometry)?.dispose?.length);
}

/** Three's listeners on a geometry, as `EventDispatcher` keeps them. */
function listenersOf(geometry: THREE.BufferGeometry): Record<string, unknown[]> | undefined {
  return (geometry as unknown as { _listeners?: Record<string, unknown[]> })._listeners;
}

/** Each geometry in the scene three hasn't made buffers for, by the name of the nearest named thing over it. */
function notYetOnTheGpu(): Map<THREE.BufferGeometry, string> {
  const waiting = new Map<THREE.BufferGeometry, string>();
  G.scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || onTheGpu(mesh.geometry)) return;
    let named: THREE.Object3D | null = mesh;
    while (named && !named.name) named = named.parent;
    waiting.set(mesh.geometry, named?.name ?? mesh.type);
  });
  return waiting;
}

/** What of `waiting` a turn put on the GPU: how many, their vertices, and the names they came under. */
function cameOnTheGpu(waiting: Map<THREE.BufferGeometry, string>): string {
  const byName = new Map<string, number>();
  let vertices = 0;
  let count = 0;
  for (const [geometry, name] of waiting) {
    if (!onTheGpu(geometry)) continue;
    count++;
    vertices += geometry.attributes.position?.count ?? 0;
    byName.set(name, (byName.get(name) ?? 0) + 1);
  }
  const names = [...byName].sort((a, b) => b[1] - a[1]).map(([name, many]) => `${name} ${many}`).join(', ');
  return `${count} of the scene's, ${vertices} vertices: ${names || 'none'}`;
}

/** A phase's median on the GPU, whole frames only (ms). */
const gpuMedian = (phase: Phase): number => spreadOf(gpuOf(phase).whole).median;
/** A phase's median of what its frames drew. */
const drawnMedian = (phase: Phase, pick: (frame: Timed) => number): number => spreadOf(phase.frames.map(pick)).median;

/** What's sent to the GPU's buffers meanwhile: the bytes, by who sent them, the most first, while `run` runs. */
async function uploadsOver(run: () => Promise<unknown>): Promise<[string, number][]> {
  const gl = G.renderer.getContext() as WebGL2RenderingContext;
  const own = gl.bufferSubData;
  const byWho = new Map<string, number>();
  gl.bufferSubData = function counted(this: WebGL2RenderingContext, ...args: unknown[]): void {
    const data = args[2] as ArrayBufferView;
    const length = args[4] as number | undefined;
    const elements = data.byteLength / ((data as unknown as { BYTES_PER_ELEMENT?: number }).BYTES_PER_ELEMENT ?? 1);
    const bytes = length ? (length / elements) * data.byteLength : data.byteLength;
    const who = uploader();
    byWho.set(who, (byWho.get(who) ?? 0) + bytes);
    (own as (...sent: unknown[]) => void).apply(this, args);
  } as typeof gl.bufferSubData;
  await run();
  gl.bufferSubData = own;
  return [...byWho].sort((a, b) => b[1] - a[1]);
}

/** The game's function nearest this upload, from its stack, three's own left out. */
function uploader(): string {
  const stack = new Error().stack?.split('\n') ?? [];
  const game = stack.find((line) => line.includes('/src/') && !line.includes('three'));
  return game?.trim().replace(/\(?http[^ ]*\/src\//, '').replace(/[?:].*$/, '') ?? 'three alone';
}

const uploadWords = (sent: [string, number][], frames: number) => sent
  .slice(0, UPLOADERS_SAID)
  .map(([who, bytes]) => `${who} ${(bytes / frames / 1024).toFixed(0)} kB`)
  .join(', ') || 'none';

/** Each way round, the GPU's frame turning through it against held still on it: what the turning itself costs, and
 *  which way is the dear one (from play, "spin still drops": 7 ms one way, 12 to 13 turning through another). */
async function spinWays(lab: Lab, facing: number): Promise<string[]> {
  const lines = ['the GPU each way (degrees: turning through it, held still on it, ms; draws; triangles):'];
  const framesAWay = SPIN_FRAMES / SPIN_WAYS;
  for (let way = 0; way < SPIN_WAYS; way++) {
    const start = facing + (way / SPIN_WAYS) * Math.PI * 2;
    const step = (Math.PI * 2) / SPIN_FRAMES;
    const turning = await timePhase(lab, 'turning', framesAWay, (f) => {
      renderer.faceCamera(start + f * step);
      return {};
    });
    renderer.faceCamera(start + (framesAWay / 2) * step);
    await lab.step(SPIN_SETTLE);
    const held = await timePhase(lab, 'held', framesAWay, () => ({}));
    const degrees = ((way + 0.5) * 360) / SPIN_WAYS;
    const draws = drawnMedian(held, (frame) => frame.draws);
    const triangles = drawnMedian(held, (frame) => frame.triangles);
    lines.push(`  ${degrees.toFixed(0)}: ${ms(gpuMedian(turning))}, ${ms(gpuMedian(held))}; ${draws.toFixed(0)}; `
      + millions(triangles));
  }
  const quarter = SPIN_FRAMES / 4;
  const turned = await uploadsOver(() => lab.step(quarter, (f) => {
    renderer.faceCamera(facing + (f / SPIN_FRAMES) * Math.PI * 2);
    return {};
  }));
  const held = await uploadsOver(() => lab.step(quarter));
  lines.push(`sent to the GPU's buffers a frame, turning: ${uploadWords(turned, quarter)}`);
  lines.push(`sent to the GPU's buffers a frame, held still: ${uploadWords(held, quarter)}`);
  return lines;
}

/** The view turned right round where he stands, turn after turn, each a phase, with what each turn made for the GPU. */
async function spinPhases(lab: Lab, facing: number): Promise<{ phases: Phase[]; lines: string[] }> {
  const phases: Phase[] = [];
  const lines: string[] = [];
  for (let turn = 0; turn < SPIN_TURNS; turn++) {
    const before = { ...G.renderer.info.memory };
    const waiting = notYetOnTheGpu();
    const phase = await timePhase(lab, `turn ${turn + 1}`, SPIN_FRAMES, (f) => {
      renderer.faceCamera(facing + (f / SPIN_FRAMES) * Math.PI * 2);
      return {};
    });
    phases.push(phase);
    const { geometries, textures } = G.renderer.info.memory;
    lines.push(`turn ${turn + 1} made ${geometries - before.geometries} geometries and `
      + `${textures - before.textures} textures for the GPU; ${cameOnTheGpu(waiting)}`);
  }
  lines.push(...await spinWays(lab, facing));
  return { phases, lines };
}

/** The hero stood in the hall of heroes turned to its door, the square beyond it in view over his shoulder (from
 *  above its roof is cut away, and all of the village shows). */
async function lookingOut(lab: Lab): Promise<Phase> {
  const at = new THREE.Vector3(TERRACE.x, 0, HALL.door - OUT_FROM);
  at.y = groundHeight(at.x, at.z);
  G.player.walkTo = null;
  // (facing 0 is along +z, out of the door)
  G.player.place(at, 0);
  await viewBy(lab, 'third');
  renderer.faceCamera(0);
  await lab.step(15);
  if (!inHall(G.player.pos.x, G.player.pos.z)) throw new Error('lab: perf: the hero isn\'t inside the hall');
  return timePhase(lab, 'looking out of the hall', VILLAGE_FRAMES, () => ({}));
}

/** The hero walked of himself from the square into the hall of heroes, to its dais's stand. */
async function intoTheHall(lab: Lab): Promise<Phase> {
  const hall = villageObject('hall');
  if (!hall) throw new Error('lab: perf: the village has no hall of heroes');
  const square = new THREE.Vector3(VILLAGE_SPOT[0], 0, VILLAGE_SPOT[1]);
  G.player.place(square, G.player.facing);
  await lab.step(15);
  goTo(hall.stand[0], hall.stand[1]);
  const phase = await timePhase(lab, 'into the hall', HALL_FRAMES, () => ({}));
  G.player.walkTo = null;
  const left = Math.hypot(G.player.pos.x - hall.stand[0], G.player.pos.z - hall.stand[1]);
  if (left > 1.5) throw new Error(`lab: perf: the hero stopped ${left.toFixed(1)} m short of the hall's dais`);
  return phase;
}

/** The run the set-up starts left for the village, at the hour `options` asks for, the hero where it says. */
async function setUpVillage(lab: Lab, options: PerfOptions): Promise<void> {
  const facing = options.facing * Math.PI / 180;
  await lab.setup({ view: options.view, facing, gear: options.gear, fresh: Boolean(options.quality) });
  if (options.hour !== undefined) holdHour(options.hour);
  await inVillage(lab, options.at ?? VILLAGE_SPOT, facing);
}

/**
 * The quality `options` asks for put to use before the hero is set up, so he's built at its level's detail
 * (`heroDetail`) as a device whose Auto settled on it builds him at boot; returns what puts the page's level back,
 * the hero built again at its detail for the commands after.
 */
function atQuality(options: PerfOptions): (lab: Lab) => Promise<void> {
  const level = quality.qualityLevel();
  const budget = quality.qualityBudget();
  if (options.quality) quality.useQuality(options.quality.level, options.quality.pixels ?? Infinity);
  return async (lab) => {
    if (!options.quality) return;
    quality.useQuality(level, budget);
    await lab.setup({ fresh: true });
  };
}

/** Sets the page up as `options` asks for the measure; returns what puts it back. */
async function measuring(lab: Lab, options: PerfOptions): Promise<() => Promise<void>> {
  const clock = perfHud.perfClock.now;
  const wasOn = perfHud.perfHudEnabled();
  const drawing = lab.drawing;
  perfHud.perfClock.now = window.__labClock.realNow;
  perfHud.setPerfHud(true, false);
  lab.drawing = true;
  if (options.throttle !== 1) await lab.throttle(options.throttle);
  return async () => {
    if (options.throttle !== 1) await lab.throttle(1);
    lab.drawing = drawing;
    perfHud.setPerfHud(wasOn, false);
    perfHud.perfClock.now = clock;
  };
}

export async function perf(lab: Lab, options: PerfOptions): Promise<Report> {
  if (!timeable()) throw new Error('lab: perf: this game\'s perf overlay can\'t be timed by the browser\'s clock');
  const backToQuality = atQuality(options);
  try {
    return await perfAtQuality(lab, options);
  } finally {
    await backToQuality(lab);
  }
}

/** `perf` at the quality it asks for, put to use. */
async function perfAtQuality(lab: Lab, options: PerfOptions): Promise<Report> {
  G.arena.restoreProps();
  const scenario = { biome: options.biome, view: options.view, facing: options.facing, gear: options.gear };
  if (options.village) await setUpVillage(lab, options);
  else await standIn(lab, { ...scenario, at: options.at, fresh: Boolean(options.quality) });
  const hero = G.player;
  for (const wanted of options.casts) bindKnown(wanted);
  hero.cooldowns.clear();
  if (options.lobby) await toLobby(lab);
  // (from where he stands once there: the lobby puts him on its own spot)
  const way = THREE.MathUtils.degToRad(options.facing);
  const aim = hero.pos.clone().add(new THREE.Vector3(Math.sin(way), 0, Math.cos(way)).multiplyScalar(AIM_AHEAD));
  if (!options.lobby && !options.village && options.foes) await foesAhead(lab, options.biome, options.foes);
  const restore = await measuring(lab, options);
  const compiled = programsCompiledInGame();
  const lines: string[] = [];
  const problems: string[] = [];
  try {
    if (options.device) lines.push(deviceTitle(options.device));
    lines.push(screenLine());
    const cpu = options.throttle === 1 ? 'the CPU as it is' : `the CPU ${options.throttle} times slower`;
    const hour = options.hour === undefined ? '' : ` at ${options.hour}:00`;
    const where = options.village ? `the village${hour}` : options.biome;
    lines.push(`${where}, ${options.lobby ? 'the lobby' : `the ${options.view} view`}, ${cpu}`);
    const spun = options.village && options.spin
      ? await spinPhases(lab, options.facing * Math.PI / 180)
      : null;
    if (spun) lines.push(...spun.lines);
    const { phases, uncast } = options.parts ? { phases: [], uncast: [] }
      : spun ? { phases: spun.phases, uncast: [] }
      : options.village ? { phases: await villagePhases(lab), uncast: [] }
      : await castPhases(lab, options, aim);
    for (const phase of phases) {
      lines.push(...phaseLines(phase, options.device), ...(options.frames ? frameLines(phase) : []));
    }
    for (const name of uncast) problems.push(`${name} was pressed and never cast`);
    if (phases.length && phases.every((phase) => phase.frames.every((frame) => frame.cpu === 0))) {
      problems.push('the perf overlay timed nothing: its frames read 0 ms');
    }
    // (read before the parts: their renders back to back filled its window with long frames, and the task it plants
    // to find among them wasn't listed)
    const read = await reportRead(options.canary);
    lines.push(...read.lines);
    problems.push(...read.problems);
    if (options.parts) {
      const { partCosts } = await import('./perfParts');
      if (options.village) await inVillage(lab, options.at ?? VILLAGE_SPOT, options.facing * Math.PI / 180);
      const parts = await partCosts(lab, true);
      lines.push(...parts.lines);
      problems.push(...parts.problems);
    }
    if (options.canary) {
      const canary = await canaryRound(lab, aim);
      lines.push(...canary.lines);
      problems.push(...canary.problems);
    }
  } finally {
    await restore();
  }
  const late = programsCompiledInGame() - compiled;
  if (late > 0) problems.push(`${late} shaders compiled as it was timed`);
  return { text: lines.join('\n'), problems };
}
