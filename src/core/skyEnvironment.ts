// The scene's environment on WebGPU worked out where it's looked up, in place of three's prefiltered map: the map is
// made from a sky gradient and one soft panel (`envScene` in world/props.ts), and both are sums a pixel can do. From
// the owner's phone (Adreno 830): the environment's two lookups a lit pixel, its reflection and its light, took 42 of
// a 74 ms frame at Low (trace 5BKG-8B3K), where this PC at the phone's pixels reads 0.2, and WebGL's whole lit
// shading 0.8 there (EZJ6-YGPE). WebGPU's environment from now on; three's map in the lab with `--tune
// webgpuEnv.sky=0`, and in Profile this spot's part against it (`perf/shadingParts.ts`).
import * as THREE from 'three';
import type { Node } from 'three/webgpu';
import { gpu, tsl } from './webgpu';
import { tunable } from './tuning';
import type { EnvColours } from '../world/props';

/** whether the sky is worked out (1) or three's map looked up (0): the lab's `--tune` */
export const SKY_ENVIRONMENT = tunable('webgpuEnv', { sky: 1 });

/** the gradient's floor: `envScene`'s sky shader below the horizon */
const DARK = [0.02, 0.02, 0.03] as const;
/** where `envScene`'s panel stands, seen from the middle, its size (m) and how much brighter than its colour */
const PANEL_AT = [-5, 7, 3] as const;
const PANEL_SIZE = 4;
const PANEL_GAIN = 2;
/** the panel's solid angle from the middle (sr) and its half width (rad) */
const PANEL_DISTANCE = Math.hypot(...PANEL_AT);
const PANEL_SOLID = (PANEL_SIZE * PANEL_SIZE) / (PANEL_DISTANCE * PANEL_DISTANCE);
const PANEL_HALF = Math.atan(PANEL_SIZE / 2 / PANEL_DISTANCE);
/** how much a roughness of 1 widens the gradient's edges (in the direction's height) and the panel's lobe (rad):
 *  the prefiltered map's blur, matched by eye in the lab */
const GRADIENT_WIDENS = 1.2;
const LOBE_WIDENS = 1.5;
/** the gradient's edges for the light a surface takes from the whole sky (a cosine's spread over it) */
const IRRADIANCE_EDGES = [-1.0, 1.6] as const;

/** The sky worked out, its colours set per biome (`set`): `node` to give the scene as its environment node. */
export interface SkyEnvironment {
  node: Node;
  set(colours: EnvColours): void;
}

/** what three's environment gives the node it's handed, as far as this reads it (`EnvironmentNode`'s contexts) */
interface EnvironmentContext {
  getUV(): Node;
  getTextureLevel(): Node & { isConstNode?: boolean; value?: unknown };
}

/** a node as these sums compose it: TSL's types hold each node to one type of value, which a sum of them changes */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sum = any;

/** The sky worked out as an environment node: its colours uniforms, set per biome. */
export function skyEnvironment(): SkyEnvironment {
  const { vec3, float, uniform, smoothstep, mix, dot, exp, max, min, normalize } = tsl as Sum;
  // (each a vector its value: set as a biome is shown)
  const sky: Sum = uniform(new THREE.Vector3());
  const panel: Sum = uniform(new THREE.Vector3());
  const panelWay: Sum = vec3(...PANEL_AT.map((v) => v / PANEL_DISTANCE));
  const dark: Sum = vec3(...DARK);

  /** the light from the whole sky a surface facing `normal` takes, as an average of what it sees */
  const irradiance = (normal: Sum): Sum => {
    const gradient = mix(dark, sky, smoothstep(IRRADIANCE_EDGES[0], IRRADIANCE_EDGES[1], normal.y));
    const facing = max(dot(normal, panelWay), 0);
    return gradient.add(panel.mul(PANEL_GAIN * PANEL_SOLID / Math.PI).mul(facing));
  };

  /** the sky seen along `way` through a roughness of `rough`: the gradient's edges and the panel's lobe widened */
  const radiance = (way: Sum, rough: Sum): Sum => {
    const along = normalize(way);
    const spread = rough.mul(rough);
    const widen = spread.mul(GRADIENT_WIDENS);
    const gradient = mix(dark, sky, smoothstep(float(-0.2).sub(widen), float(1).add(widen), along.y));
    const width = spread.mul(LOBE_WIDENS).add(PANEL_HALF);
    const across = width.mul(width);
    const lobe = exp(dot(along, panelWay).sub(1).div(across.mul(0.5)));
    const peak = min(float(PANEL_SOLID / Math.PI).div(across), 1);
    return gradient.add(panel.mul(PANEL_GAIN).mul(peak).mul(lobe));
  };

  class SkyNode extends gpu.Node {
    constructor() {
      super('vec3');
    }

    // (three's environment builds this in its contexts: the radiance's, the irradiance's at a level of 1)
    override setup(builder: { context: unknown }): Node {
      const context = builder.context as EnvironmentContext;
      const way = context.getUV();
      const level = context.getTextureLevel();
      const whole = level.isConstNode === true && level.value === 1;
      return whole ? irradiance(way) : radiance(way, level);
    }
  }

  return {
    node: new SkyNode() as unknown as Node,
    set: (colours) => {
      sky.value.set(...colours.sky);
      panel.value.set(...colours.panel);
    },
  };
}
