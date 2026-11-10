// `lab passes --features`: what each of the lit shading's features takes of the scene's pass on WebGPU, by three's
// timestamps: the scene drawn alone into a target of the frame's size, each feature taken off and put back in turns
// within the page (the machine's load drifts, and two runs apart read the scene's pass 1.9 and 7.7 ms), each side's
// renders timed one by one and their medians compared. A feature taken off changes the scene's pipelines, so each
// side is drawn untimed first, its pipelines made then.
import * as THREE from 'three';
import { G } from '../../../src/state';
import { quantile } from './timing';

/** A feature of the scene's shading, put on or taken off. */
export interface Feature {
  name: string;
  change(on: boolean): void;
}

/** A feature's cost: the scene's pass with it and without (medians, ms). */
export interface FeatureCost {
  name: string;
  on: number;
  off: number;
}

/** The renders a side is timed over a round, the rounds, and the renders drawn untimed before them. */
const RENDERS = 4;
const ROUNDS = 6;
const WARM_RENDERS = 3;

/** three's timestamp pool for renders, as far as this reads it */
interface TimestampPool {
  timestamps: Map<string, number>;
  resolveQueriesAsync(): Promise<number | undefined>;
}

/** The renderer as this reads it. */
interface Timed {
  info: { frame: number; render: { frameCalls: number } };
  backend: { timestampQueryPool: { render: TimestampPool | null } };
  render(scene: THREE.Object3D, camera: THREE.Camera): void;
  getRenderTarget(): THREE.RenderTarget | null;
  setRenderTarget(target: THREE.RenderTarget | null): void;
}

/** The scene drawn `count` times into `target`; each render's time on the GPU (ms). */
async function sceneRenders(renderer: Timed, target: THREE.RenderTarget, count: number): Promise<number[]> {
  const before = renderer.getRenderTarget();
  const keys: string[] = [];
  renderer.setRenderTarget(target);
  for (let i = 0; i < count; i++) {
    renderer.render(G.scene, G.camera);
    keys.push(`r:${renderer.info.render.frameCalls}:`);
  }
  renderer.setRenderTarget(before);
  const pool = renderer.backend.timestampQueryPool.render;
  await pool?.resolveQueriesAsync();
  const frame = `:f${renderer.info.frame}`;
  const times: number[] = [];
  for (const [uid, ms] of pool?.timestamps ?? []) {
    if (uid.endsWith(frame) && keys.some((key) => uid.startsWith(key))) times.push(ms);
  }
  return times;
}

/** Every mesh shown that takes the shadows. */
function shadowTakers(): THREE.Object3D[] {
  const takers: THREE.Object3D[] = [];
  G.scene.traverseVisible((object) => {
    if (object.receiveShadow) takers.push(object);
  });
  return takers;
}

/** Every point light shown. */
function pointLights(): THREE.PointLight[] {
  const points: THREE.PointLight[] = [];
  G.scene.traverseVisible((object) => {
    if ((object as THREE.PointLight).isPointLight) points.push(object as THREE.PointLight);
  });
  return points;
}

/** The features of the scene's shading this times, each put back as it was found when put on. */
export function sceneFeatures(): Feature[] {
  const scene = G.scene as THREE.Scene & { environmentNode?: unknown };
  const environment = { map: scene.environment, node: scene.environmentNode };
  const fog = scene.fog;
  const takers = shadowTakers();
  const points = pointLights();
  const plain = new THREE.MeshBasicMaterial({ color: 0x808080 });
  return [
    {
      name: 'the lit shading, against a plain colour',
      change: (on) => {
        scene.overrideMaterial = on ? null : plain;
      },
    },
    {
      name: 'the environment\'s lookups',
      change: (on) => {
        scene.environment = on ? environment.map : null;
        scene.environmentNode = on ? environment.node : null;
      },
    },
    {
      // (taken, not cast: a light's castShadow off let go of its map on WebGPU, and put back drew with it destroyed)
      name: `the shadows taken (${takers.length} meshes)`,
      change: (on) => {
        for (const object of takers) object.receiveShadow = on;
      },
    },
    {
      name: `the point lights (${points.length})`,
      change: (on) => {
        for (const light of points) light.visible = on;
      },
    },
    {
      name: 'the fog',
      change: (on) => {
        scene.fog = on ? fog : null;
      },
    },
  ];
}

/** `feature`'s cost in the scene's pass: on and off in turns, each side's renders' median. */
export async function featureCost(renderer: Timed, target: THREE.RenderTarget, feature: Feature): Promise<FeatureCost> {
  const on: number[] = [];
  const off: number[] = [];
  try {
    for (const side of [false, true]) {
      feature.change(side);
      await sceneRenders(renderer, target, WARM_RENDERS);
    }
    for (let round = 0; round < ROUNDS; round++) {
      for (const side of [true, false]) {
        feature.change(side);
        (side ? on : off).push(...await sceneRenders(renderer, target, RENDERS));
      }
    }
  } finally {
    feature.change(true);
  }
  const median = (times: number[]): number => quantile([...times].sort((a, b) => a - b), 0.5);
  return { name: feature.name, on: median(on), off: median(off) };
}
