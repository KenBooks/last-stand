// The lamps' list on WebGPU (core/webgpu.ts): core/lamps.ts's GLSL as TSL, the same list and the same light. Each lit
// node material loops over it after its lights (`lightAfterLights`), as three's looped point lights loop over theirs,
// and no lamp changes a shader. Its shadows are read from a plain texture (`lampAtlasTexture`), top row first: the
// lookups are WebGL's, each flipped to its row as it's read.
import * as THREE from 'three';
import { LAMPS_MOST, LAMP_SOFT, SHADOW_COLUMNS, SHADOW_TILE, lampAtlasTexture, lampList } from './lamps';
import { gpu, lightAfterLights, tsl } from './webgpu';

// (untyped: TSL's types don't follow its conversions across these calls yet)
/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

/** as `core/lamps.ts` has them: how far a point is moved out along its surface before its shadow is looked up, and how
 *  much nearer than what the map holds it must be to be lit (m) */
const SHADOW_OUT = 0.04;
const SHADOW_BIAS = 0.03;
/** the list's entry holding whether the shadows are drawn and how far off a surface its shelter's side is read */
const LAMPS_SHADOWS = 1 + LAMPS_MOST * 2;

/** How far `at` (the map's texels) on `far` off its lamp is lit, by four tests blended by where it falls between them. */
function litNear(map: THREE.Texture, at: N, far: N): N {
  const { floor, ivec2, mix, step, textureLoad } = tsl as any;
  const base = floor(at).toVar();
  const blend = at.sub(base).toVar();
  const lastRow = (map.image as { height: number }).height - 1;
  const test = (x: number, y: number): N =>
    step(far, textureLoad(map, ivec2(base.x.add(x), base.y.add(y).negate().add(lastRow))).r);
  return mix(mix(test(0, 0), test(1, 0), blend.x), mix(test(0, 1), test(1, 1), blend.x), blend.y);
}

/** Where lamp `lamp`'s map holds the way to a point `d` off it, as `lampShadowAt` in `core/lamps.ts` finds it: x and y
 *  in the map's texels, z how far off it the point is less the bias. */
function aimFn(): N {
  const { wgslFn } = tsl as any;
  const tile = `${SHADOW_TILE}.0`;
  return wgslFn(`fn lampShadowAim(lamp: i32, d: vec3f) -> vec3f {
    let a = abs(d);
    var face = 0;
    var axis = vec3f(0.0);
    if (a.x >= a.y && a.x >= a.z) {
      face = select(1, 0, d.x > 0.0);
      axis = vec3f(sign(d.x), 0.0, 0.0);
    } else if (a.y >= a.z) {
      face = select(3, 2, d.y > 0.0);
      axis = vec3f(0.0, sign(d.y), 0.0);
    } else {
      face = select(5, 4, d.z > 0.0);
      axis = vec3f(0.0, 0.0, sign(d.z));
    }
    let up = select(vec3f(0.0, 1.0, 0.0), vec3f(0.0, 0.0, 1.0), abs(axis.y) > 0.5);
    let across = normalize(cross(up, -axis));
    let upward = cross(-axis, across);
    let uv = vec2f(dot(d, across), dot(d, upward)) / dot(d, axis) * 0.5 + 0.5;
    let tile = lamp * 6 + face;
    let corner = vec2f(f32(tile % ${SHADOW_COLUMNS}), f32(tile / ${SHADOW_COLUMNS})) * ${tile};
    let at = corner + clamp(uv * ${tile}, vec2f(2.0), vec2f(${tile} - 3.0)) - 0.5;
    return vec3f(at, length(d) - ${SHADOW_BIAS.toFixed(3)});
  }`);
}

/** Every lit node material's lamps: the list as uniforms, set once a render, each lamp on this surface's side of the
 *  shelter lighting it through the lighting model as a point light would, shadowed by the map. */
function makeLampsNode(): N {
  const {
    Continue, If, Loop, float, normalWorld, positionView, positionWorld, renderGroup, select, uniformArray, vec2, vec3,
  } = tsl as any;
  const vectors = Array.from({ length: lampList.length / 4 }, () => new THREE.Vector4());
  const lamps = uniformArray(vectors, 'vec4').setGroup(renderGroup);
  const aim = aimFn();
  const map = lampAtlasTexture();
  class LampsNode extends (gpu.Node as N) {
    constructor() {
      super();
      this.updateType = gpu.NodeUpdateType.RENDER;
    }

    isCacheable(): boolean {
      return false;
    }

    update(): void {
      for (const [i, vector] of vectors.entries()) vector.fromArray(lampList, i * 4);
    }

    setup(builder: N): void {
      const { lightingModel, reflectedLight } = builder.context;
      const surface = builder.context.positionView || positionView;
      const shadows = lamps.element(LAMPS_SHADOWS);
      const shelter = lamps.element(0);
      const sideAt = positionWorld.xz.add(normalWorld.xz.mul(shadows.y)).toVar();
      const insideOf = sideAt.x.greaterThan(shelter.x).and(sideAt.y.greaterThan(shelter.y))
        .and(sideAt.x.lessThan(shelter.z)).and(sideAt.y.lessThan(shelter.w));
      const side = select(insideOf, float(1), float(-1)).toVar();
      const diffuse = vec3(0).toVar('lampsDiffuse');
      const specular = vec3(0).toVar('lampsSpecular');
      const seen = positionWorld.add(normalWorld.mul(SHADOW_OUT)).toVar();
      Loop(LAMPS_MOST, ({ i }: { i: N }) => {
        const light = lamps.element(i.mul(2).add(2)).toVar();
        If(light.w.notEqual(side), () => {
          Continue();
        });
        const place = lamps.element(i.mul(2).add(1)).toVar();
        const toLamp = (tsl as any).cameraViewMatrix.mul((tsl as any).vec4(place.xyz, 1)).xyz.sub(surface).toVar();
        const away = toLamp.length().toVar();
        If(away.greaterThanEqual(place.w), () => {
          Continue();
        });
        const held = float(1).toVar();
        If(shadows.x.greaterThan(0), () => {
          const found = aim({ lamp: i, d: seen.sub(place.xyz) }).toVar();
          const at = found.xy;
          const far = found.z;
          const near = (x: number, y: number): N => litNear(map, at.add(vec2(x, y)), far);
          held.assign(near(-0.75, -0.75).add(near(0.75, -0.75)).add(near(-0.75, 0.75)).add(near(0.75, 0.75)).mul(0.25));
        });
        If(held.lessThanEqual(0), () => {
          Continue();
        });
        const window = away.div(place.w).pow(4).oneMinus().clamp().pow(2);
        const falloff = away.mul(away).add(LAMP_SOFT).reciprocal().mul(window);
        lightingModel.direct({
          lightDirection: toLamp.div(away),
          lightColor: light.xyz.mul(falloff).mul(held),
          lightNode: { light: {}, shadowNode: null },
          reflectedLight: { directDiffuse: diffuse, directSpecular: specular },
        }, builder);
      });
      reflectedLight.directDiffuse.addAssign(diffuse);
      reflectedLight.directSpecular.addAssign(specular);
    }
  }
  return new LampsNode();
}

/**
 * A point light's falloff on WebGPU as `lightTheLamps` makes it on WebGL: by the square of its distance plus its softness,
 * carried in its decay past 2. three's takes a decay as an exponent, so a soft light (a decay of 6) burned everything
 * within a metre white and was gone a few metres off.
 */
function softPointLights(): void {
  const { float } = tsl as any;
  const prototype = gpu.PointLightNode.prototype as N;
  prototype.setupDirect = function (this: N, builder: N): N {
    const toLight = this.getLightVector(builder);
    const away = toLight.length();
    const softness = this.decayExponentNode.sub(2).max(0);
    const falloff = away.mul(away).add(softness).max(0.01).reciprocal();
    const cutoff = this.cutoffDistanceNode;
    const window = away.div(cutoff.max(float(0.0001))).pow(4).oneMinus().clamp().pow(2);
    const light = cutoff.greaterThan(0).select(falloff.mul(window), falloff);
    return { lightDirection: toLight.normalize(), lightColor: this.colorNode.mul(light) };
  };
}

/** The lamps lit in every lit node material; once, as the renderer starts, before anything compiles. */
export function lightTheLampsOnWebGPU(): void {
  softPointLights();
  lightAfterLights(makeLampsNode());
}

/** What a face of the lamps' map is drawn with on WebGPU: each texel the distance from the lamp (m) to what it meets
 *  nearest, `lampAt` set for each lamp. */
export function lampDistanceMaterial(lampAt: THREE.Vector3): THREE.Material {
  const { positionWorld, renderGroup, uniform, vec4 } = tsl as any;
  const material = new gpu.MeshBasicNodeMaterial({ side: THREE.DoubleSide }) as N;
  const at = uniform(lampAt).setGroup(renderGroup);
  material.fragmentNode = vec4(positionWorld.sub(at).length(), 0, 0, 1);
  return material;
}
