// `lab passes`: what each of the frame's renders takes of the GPU on WebGPU, by three's own timestamps (the renderer
// is made with `trackTimestamp`): every render call of a frame (the scene's pass, the shadow maps, each pass of the
// post chain, the canvas's) named by what it draws and the size of what it draws into, its time the mean over the
// frames. Its canary is a render of its own, the scene drawn once more into a target of the frame's size and samples,
// which must be found, once a frame, and read at least `CANARY_LEAST`: a render
// missed, named as another or read 0 fails it. (Not against the scene's pass: on Very low that call writes 1.5
// timestamps a frame, drawn once a frame by its calls, and the scene drawn alone after the frame read 5.7 ms against
// its 20 there, the canary's own warm caches.)
import * as THREE from 'three';
import type { Lab, Report } from './lab';
import type { BiomeId } from '../../../src/data/biomes';
import type { QualityLevel } from '../../../src/data/quality';
import type { ViewMode } from '../../../src/core/renderer';
import * as quality from '../../../src/core/quality';
import { G } from '../../../src/state';
import { WEBGPU, webgpuSceneTarget } from '../../../src/core/webgpu';
import { standIn } from './light';
import { featureCost, sceneFeatures } from './sceneFeatures';
import * as perfHud from '../../../src/ui/perfHud';

export interface PassesCommand {
  biome: BiomeId;
  view: ViewMode;
  at?: [number, number];
  level?: QualityLevel;
  frames?: number;
  /** each feature of the lit shading timed in the scene's pass too (`sceneFeatures`) */
  features?: boolean;
  canary: boolean;
}

/** the frames timed when the command doesn't say */
const FRAMES = 30;
/** the least the canary's render may read (ms): the scene at a phone's pixels read 5.7 ms here, at 1080p 0.6 */
const CANARY_LEAST = 0.1;
/** the canary's render, named as the list names it */
const CANARY_NAME = 'canary: the scene again';

/** three's timestamp pool for renders, as far as this reads it */
interface TimestampPool {
  timestamps: Map<string, number>;
  resolveQueriesAsync(): Promise<number | undefined>;
}

/** The renderer as this reads it: its render calls counted in the frame, and its timestamp pools. */
interface Timed {
  info: { frame: number; render: { frameCalls: number } };
  backend: { timestampQueryPool: { render: TimestampPool | null; compute: TimestampPool | null } };
  render(scene: THREE.Object3D, camera: THREE.Camera): void;
  getRenderTarget(): THREE.RenderTarget | null;
  setRenderTarget(target: THREE.RenderTarget | null): void;
  getDrawingBufferSize(target: THREE.Vector2): THREE.Vector2;
}

/** A render's name: what it draws (a full-screen pass by its material's name, else the scene's) and into what. */
function renderName(renderer: Timed, scene: THREE.Object3D, camera: THREE.Camera): string {
  const quad = scene as unknown as { isQuadMesh?: boolean; material?: THREE.Material };
  const target = renderer.getRenderTarget();
  const size = target ? `${target.width}x${target.height}` : 'the canvas';
  if (quad.isQuadMesh) return `a pass: ${quad.material?.name || quad.material?.type || 'unnamed'}, into ${size}`;
  // (the sun's shadow: three sets its map as the target inside the call, so the target here is the frame's; on Very
  // low, drawn every other frame, it read as the scene's pass drawn 1.5 times a frame)
  if ((camera as THREE.OrthographicCamera).isOrthographicCamera) return 'the sun\'s shadow map';
  const what = (scene as THREE.Scene).isScene ? 'the scene' : scene.type;
  return `${what}${scene.name ? ` (${scene.name})` : ''}, into ${size}`;
}

/** A render call's key as three's timestamp ids hold it: its order in its frame and the frame. */
const callKey = (call: number, frame: number): string => `${call}:${frame}`;

/** Each render call named by its key (`callKey`), and its scene (what `render` was given; nested passes too). */
function namingRenders(renderer: Timed): { names: Map<string, string>; undo: () => void } {
  const names = new Map<string, string>();
  const render = renderer.render;
  renderer.render = function (scene, camera) {
    const key = callKey(renderer.info.render.frameCalls + 1, renderer.info.frame);
    names.set(key, renderName(renderer, scene, camera));
    return render.call(this, scene, camera);
  };
  return { names, undo: () => void (renderer.render = render) };
}

/** A timestamp id's key (`r:<call>:<context>:f<frame>`, `callKey`), or none for a compute's. */
function keyOf(uid: string): string | null {
  const match = /^r:(\d+):\d+:f(\d+)$/.exec(uid);
  return match ? callKey(Number(match[1]), Number(match[2])) : null;
}

/** Each feature of the scene's shading as a line: the scene's pass with it and without, and its share. */
async function featureLines(renderer: Timed, size: THREE.Vector2): Promise<string[]> {
  const samples = webgpuSceneTarget().samples;
  const target = new THREE.RenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples });
  const lines = ['  the scene drawn alone, each feature taken off in turns (medians):'];
  try {
    for (const feature of sceneFeatures()) {
      const cost = await featureCost(renderer, target, feature);
      const takes = cost.on - cost.off;
      const share = cost.on > 0 ? Math.round((100 * takes) / cost.on) : 0;
      const sides = `${cost.on.toFixed(2)} with it, ${cost.off.toFixed(2)} without`;
      lines.push(`    ${cost.name}: ${takes.toFixed(2)} ms, ${share}% (${sides})`);
    }
  } finally {
    target.dispose();
  }
  return lines;
}

/** The perf overlay's reads of WebGPU's timestamps held (`holdWebGpuTimes`), where the game has the hold: a commit
 *  from before it runs this module in an A/B too, its overlay reading on (a named import would stop it loading). */
function holdTimes(held: boolean): void {
  (perfHud as { holdWebGpuTimes?: (held: boolean) => void }).holdWebGpuTimes?.(held);
}

export async function gpuPasses(lab: Lab, command: PassesCommand): Promise<Report> {
  if (command.level) quality.useQuality(command.level);
  await standIn(lab, { biome: command.biome, view: command.view, facing: 0, at: command.at, fresh: true });
  // (pictured as the browser shows it: an A/B's sides compared pixel by pixel, a cost cut keeping the look)
  const pictured = await lab.screen('the frame timed');
  // (on WebGL the frame alone, pictured: to set beside WebGPU's)
  if (!WEBGPU) {
    const text = 'WebGL: the frame pictured alone (its renders are timed on WebGPU, --renderer webgpu)';
    return { text, problems: [], moments: [pictured] };
  }
  const renderer = G.renderer as unknown as Timed;
  const pools = renderer.backend.timestampQueryPool;
  const drawing = lab.drawing;
  lab.drawing = true;
  const { names, undo } = namingRenders(renderer);
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  // (as the scene's pass draws it: its samples, which WebGPU chose once as the game started, 4 from the lab's High;
  // without them the scene drawn again read 5.6 ms against its pass's 25 at a phone's pixels)
  const samples = webgpuSceneTarget().samples;
  const canaryTarget = new THREE.RenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples });
  const sums = new Map<string, { ms: number; frames: number }>();
  let computeMs = 0;
  const featured: string[] = [];
  /** the scene's renders the frames made, counted by their calls (not their times) */
  let sceneCalls = 0;
  const frames = command.frames ?? FRAMES;
  holdTimes(true);
  try {
    // (the queries of the frames before are let go of first, and a read of the overlay's under way waited for)
    await pools.render?.resolveQueriesAsync();
    await pools.compute?.resolveQueriesAsync();
    for (let frame = 0; frame < frames; frame++) {
      const namedBefore = [...names.values()].length;
      await lab.step(1);
      sceneCalls += [...names.values()].slice(namedBefore).filter((name) => name.startsWith('the scene,')).length;
      if (command.canary) {
        const target = renderer.getRenderTarget();
        renderer.setRenderTarget(canaryTarget);
        renderer.render(G.scene, G.camera);
        names.set(callKey(renderer.info.render.frameCalls, renderer.info.frame), CANARY_NAME);
        renderer.setRenderTarget(target);
      }
      // (three makes its pools as the first timed render or compute comes)
      await pools.render?.resolveQueriesAsync();
      computeMs += (await pools.compute?.resolveQueriesAsync()) ?? 0;
      for (const [uid, ms] of pools.render?.timestamps ?? []) {
        const key = keyOf(uid);
        const name = (key !== null && names.get(key)) || 'a render not named (not through `render`)';
        const sum = sums.get(name) ?? { ms: 0, frames: 0 };
        sum.ms += ms;
        sum.frames += 1;
        sums.set(name, sum);
      }
    }
    if (command.features) featured.push(...await featureLines(renderer, size));
  } finally {
    holdTimes(false);
    undo();
    canaryTarget.dispose();
    lab.drawing = drawing;
  }
  const rows = [...sums].map(([name, sum]) => ({ name, ms: sum.ms / frames, calls: sum.frames / frames }));
  rows.sort((a, b) => b.ms - a.ms);
  const all = rows.reduce((total, row) => total + (row.name === CANARY_NAME ? 0 : row.ms), 0);
  const lines = [
    `${G.arena.biome} ${command.view}, ${quality.qualityLevel()}, ${size.x}x${size.y} drawn`,
    `  the frame's renders: ${all.toFixed(2)} ms of the GPU, over ${frames} frames; `
      + `compute ${(computeMs / frames).toFixed(2)} ms`,
    `  the scene's pass drawn ${sceneCalls} times in ${frames} frames, by its render calls`,
    ...rows.map((row) => {
      const share = row.name === CANARY_NAME ? '' : `, ${Math.round((100 * row.ms) / all)}%`;
      const calls = row.calls > 1.01 ? `, ${row.calls.toFixed(1)} a frame` : '';
      return `  ${row.name}: ${row.ms.toFixed(2)} ms${share}${calls}`;
    }),
  ];
  lines.push(...featured);
  const problems: string[] = [];
  if (!(all > 0)) problems.push('nothing was timed: the frame\'s renders read 0 ms');
  if (command.canary) {
    const canary = rows.find((row) => row.name === CANARY_NAME);
    if (!canary) problems.push('canary: the scene drawn again was never timed');
    else if (canary.ms < CANARY_LEAST || Math.abs(canary.calls - 1) > 0.01) {
      const read = `${canary.ms.toFixed(2)} ms, ${canary.calls.toFixed(1)} times a frame`;
      problems.push(`canary: the scene drawn again read ${read}`);
    }
  }
  return { text: lines.join('\n'), problems, moments: [pictured] };
}
