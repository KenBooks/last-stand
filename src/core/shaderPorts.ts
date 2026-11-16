// The game's own GLSL `ShaderMaterial`s on WebGPU (core/webgpu.ts, docs/research/webgpu.md): an effect gives its
// material a port (`portShader`), its shader as nodes (WGSL written line for line from the GLSL, `wgslFn`), and three
// takes the port in its place as it builds the material there (its library's `fromMaterial`, `takePorts`). The
// material stays the one the game holds and drives: the port reads its uniforms by reference (`uniformsOf`), and the
// draw takes its blending, sides and depth from it as they are. On WebGL nothing changes.
import { HALL, TERRACE } from '../data/village';
import * as THREE from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { NEAR_GLOW, itemGlowUniforms, type KitLooks } from './materials';
import {
  BLEND_GONE, HOLE_UNDER, MIDDLE_ATTRIBUTE, PALE, PLACED_BY_MIDDLE, SIGHT_CONE, overShaft, type SeeThrough,
} from './seeThrough';
import { DOOR_ROW, DOOR_SOFT, HIS_ROW, SIGHT } from './sight';
import { WEBGPU, gpu, stillMaterialsGo, stillNodes, tsl } from './webgpu';

// (untyped: TSL's types don't follow its conversions across these calls yet)
/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;
/** the node language as a port is given it (untyped as `N`: its types reject one `wgslFn` as another's include) */
export type Tsl = Record<string, N>;

/** A material's shader as nodes: its whole output (`gl_FragColor`), and where its vertex goes, in clip space
 *  (`vertex`, `gl_Position`) or in the object's own (`position`); three's own transform where neither is given. */
export interface Port { fragment: N; vertex?: N; position?: N }

/** Each material's port, as its effect gave it, and the node material made from it */
const ports = new WeakMap<THREE.Material, (t: Tsl, u: Record<string, N>) => Port>();
const made = new WeakMap<THREE.Material, THREE.Material>();

/** `material` drawn on WebGPU as `port` has it (given the node language and its uniforms as nodes). */
export function portShader<T extends THREE.ShaderMaterial>(material: T, port: (t: Tsl, u: Record<string, N>) => Port): T {
  if (WEBGPU) ports.set(material, port);
  return material;
}

/** The effects' shared noise in WGSL, made once: `hash2` and `noise2` (value noise on a plane, the GLSL's `h` and
 *  `n`), `hash3` and `noise3` (in space, the kit's `fxHash` and `fxNoise`) and `fbm3` (three octaves of it, the
 *  bolts' `fbm`); give a function the ones it calls. */
let noise: Record<'hash2' | 'noise2' | 'hash3' | 'noise3' | 'fbm3', N> | null = null;
export function wgslNoise(): Record<'hash2' | 'noise2' | 'hash3' | 'noise3' | 'fbm3', N> {
  if (noise) return noise;
  const { wgslFn } = tsl as any;
  const hash2 = wgslFn(`fn hash2(p: vec2f) -> f32 {
    return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
  }`);
  const noise2 = wgslFn(`fn noise2(p: vec2f) -> f32 {
    let i = floor(p);
    var f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash2(i), hash2(i + vec2f(1.0, 0.0)), f.x), mix(hash2(i + vec2f(0.0, 1.0)), hash2(i + vec2f(1.0, 1.0)), f.x), f.y);
  }`, [hash2]);
  const hash3 = wgslFn(`fn hash3(start: vec3f) -> f32 {
    var p = fract(start * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }`);
  const noise3 = wgslFn(`fn noise3(x: vec3f) -> f32 {
    let i = floor(x);
    var f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash3(i), hash3(i + vec3f(1.0, 0.0, 0.0)), f.x), mix(hash3(i + vec3f(0.0, 1.0, 0.0)), hash3(i + vec3f(1.0, 1.0, 0.0)), f.x), f.y),
      mix(mix(hash3(i + vec3f(0.0, 0.0, 1.0)), hash3(i + vec3f(1.0, 0.0, 1.0)), f.x), mix(hash3(i + vec3f(0.0, 1.0, 1.0)), hash3(i + vec3f(1.0, 1.0, 1.0)), f.x), f.y), f.z);
  }`, [hash3]);
  const fbm3 = wgslFn(`fn fbm3(p: vec3f) -> f32 {
    return noise3(p) * 0.55 + noise3(p * 2.1 + 3.1) * 0.3 + noise3(p * 4.3 + 7.7) * 0.15;
  }`, [noise3]);
  return noise = { hash2, noise2, hash3, noise3, fbm3 };
}

/** The node type of a uniform's value, as `reference` takes it */
function typeOf(value: unknown): string {
  if (typeof value === 'number') return 'float';
  if (value instanceof THREE.Color) return 'color';
  if (value instanceof THREE.Vector2) return 'vec2';
  if (value instanceof THREE.Vector3) return 'vec3';
  if (value instanceof THREE.Vector4) return 'vec4';
  if (value instanceof THREE.Matrix4) return 'mat4';
  if (value instanceof THREE.Texture) return 'texture';
  throw new Error(`shaderPorts: no node type for the uniform ${String(value)}`);
}

/** `material`'s uniforms as nodes by name, each read off the material being drawn as the frame draws it (but a
 *  texture not yet given, null: its port reads it itself). Read off this material's own uniforms, every material of
 *  a kind drew with the first's: three builds them once, by their shape (Maelstrom's walls drew with the warm-up's,
 *  faded out). */
export function uniformsOf(material: THREE.ShaderMaterial): Record<string, N> {
  const nodes: Record<string, N> = {};
  for (const [name, uniform] of Object.entries(material.uniforms)) {
    if (uniform.value === null) continue;
    nodes[name] = tsl.materialReference(`uniforms.${name}.value`, typeOf(uniform.value));
  }
  return nodes;
}

/** `colour` dimmed near the camera as `nearGlow` dims it on WebGL (core/materials.ts): full from the top-down
 *  camera's distance, down to a quarter up close */
function nearGlowed(colour: N): N {
  const { positionView, vec4, clamp, pow } = tsl as any;
  const glow = clamp(pow(positionView.z.negate().div(NEAR_GLOW.ref), NEAR_GLOW.pow), NEAR_GLOW.min, 1);
  return vec4(colour.rgb.mul(glow), colour.a);
}

/** The node material three draws `material` with, made once from its port */
function madeFrom(material: THREE.ShaderMaterial, port: (t: Tsl, u: Record<string, N>) => Port): THREE.Material {
  const { fragment, vertex, position } = port(tsl as unknown as Tsl, uniformsOf(material));
  const node = new gpu.MeshBasicNodeMaterial() as N;
  // (its uniforms are read off the material three draws: this one where it asks the build's)
  node.uniforms = material.uniforms;
  const nearGlow = material.customProgramCacheKey() === 'nearGlow';
  node.fragmentNode = nearGlow ? nearGlowed(fragment) : fragment;
  if (vertex) node.vertexNode = vertex;
  if (position) node.positionNode = position;
  return node;
}

/** what thins whole reaching all of it, for a kind that gives no reach */
const ALL_THE_WAY = new THREE.Vector2(1e5, 1e6);
/** no room to thin for, for a kind that gives none */
const EVERYWHERE = new THREE.Vector4(-1e5, -1e5, 1e5, 1e5);
/** no door to see through, for a kind that gives none */
const NO_DOOR = new THREE.Vector4();

/** A kind's see-through values as nodes. */
export interface SeeNodes { focus: N; k: N; minY: N; across: N; whole: N; ramp: N; reach: N; room: N; door: N; doorOn: N }

/** How much of a fragment at `world` to drop where it stands between the camera and the hero, as `seeFade()` has it
 *  (core/seeThrough.ts), by the hole and floor `see` reads (each a node of the `SeeThrough`'s values) */
export function seeFade(world: N, see: SeeNodes, mid: N = placeOf()): N {
  const { wgslFn, cameraPosition } = tsl as any;
  return wgslFn(`fn seeFade(wp: vec3f, mid: vec3f, eye: vec3f, focus: vec3f, k: vec4f, minY: f32, across: f32,
    whole: f32, ramp: f32, reach: vec2f, room: vec4f, door: vec4f, doorOn: f32) -> f32 {
    if (wp.y <= minY) { return 0.0; }
    var cone = 0.0;
    let down = eye.y - wp.y;
    if (doorOn != 0.0 && down > 0.01) {
      let shape = smoothstep(-0.02, 0.02, min(wp.x - room.x, room.z - wp.x));
      if (doorOn > 0.0) {
        cone = doorOn * shape;
      } else if (eye.z > door.y && wp.z < door.y) {
        let at = eye + (wp - eye) * (door.y - eye.z) / (wp.z - eye.z);
        let offMiddle = abs(at.x - ${TERRACE.x.toFixed(2)});
        let meetsWall = at.y < ${(TERRACE.high + HALL.wallHigh).toFixed(2)} && offMiddle < ${HALL.half.toFixed(2)};
        let inDoor = at.y < ${(TERRACE.high + HALL.doorHigh).toFixed(2)} && offMiddle < ${HALL.doorHalf.toFixed(2)};
        if (meetsWall && !inDoor) { cone = 1.0 - shape; }
      }
      if (doorOn < 0.0 && wp.z >= door.y && mid.z > door.y && eye.y - focus.y > 0.01) {
        let midHidden = eye.xz + (mid.xz - eye.xz) * (eye.y - (minY - 0.12)) / (eye.y - focus.y);
        let midInHall = min(min(midHidden.x - room.x, room.z - midHidden.x),
          min(midHidden.y - room.y, room.w - midHidden.y));
        cone = min(-doorOn * 1.5, 1.0) * smoothstep(0.0, 0.3, midInHall);
      }
    }
    if (k.z <= 0.0 && whole <= 0.0) { return cone; }
    let ca = focus - eye;
    let l = length(ca);
    let dir = ca / l;
    let cp = wp - eye;
    let along = dot(cp, dir);
    let flat = length(ca.xz);
    let on = select(wp.xz, mid.xz, reach.x < ${PLACED_BY_MIDDLE.toFixed(1)});
    let past = select(along - l, dot(wp.xz - focus.xz, ca.xz) / max(flat, 1e-6), flat > 0.01);
    if (along <= 0.0 || past >= -k.w) { return cone; }
    let off = cp - dir * along;
    let level = vec3f(-dir.z, 0.0, dir.x);
    let levelLength = length(level);
    let side = select(vec3f(1.0, 0.0, 0.0), level / max(levelLength, 1e-6), levelLength > 1e-3);
    let aside = dot(off, side);
    let r = length(off + side * aside * (across - 1.0)) / max(along / l, 0.05);
    let floorOff = select(r, abs(dot(on - focus.xz, vec2f(-ca.z, ca.x))) / max(flat, 1e-6), flat > 0.01);
    let thinned = whole * (1.0 - smoothstep(-k.w - ramp, -k.w, past)) * (1.0 - smoothstep(reach.x, reach.y, floorOff));
    let feetY = minY - ${SIGHT_CONE.floorClear.toFixed(2)};
    let toFeet = focus.xz - eye.xz;
    let feetFlat = dot(toFeet, toFeet);
    let onLine = select(along / l, dot(cp.xz, toFeet) / max(feetFlat, 1e-6), feetFlat > 1e-4);
    let lineY = eye.y + (feetY - eye.y) * onLine;
    let atHim = smoothstep(lineY - ${HOLE_UNDER.from.toFixed(2)}, lineY - ${HOLE_UNDER.to.toFixed(2)}, wp.y);
    return max(max((1.0 - smoothstep(k.x, k.y, r)) * k.z * atHim, thinned), cone);
  }`)({ wp: world, mid, eye: cameraPosition, ...see });
}

/** The drawn object's place in the world. */
function placeOf(): N {
  const { modelWorldMatrix, vec4 } = tsl as any;
  return modelWorldMatrix.mul(vec4(0, 0, 0, 1)).xyz;
}

/** The middle a fragment of `see`'s kind is placed by: its part's, kept as an attribute through a merge, where it thins
 *  by its middle (`thinsByMiddle` in seeThrough.ts), else its object's place. */
function middleOf(see: SeeThrough): N {
  return see.reach ? (tsl as any).attribute(MIDDLE_ATTRIBUTE, 'vec3') : placeOf();
}

/** The share of a raw shader's light kept as its prop dissolves (`seeThroughFade`'s `1.0 - seeFade()`), at the
 *  mesh's own place before any displacement, as its GLSL reads it; `see` its `uSee*` uniforms as nodes. */
export function seeKept(see: SeeNodes): N {
  const { modelWorldMatrix, positionGeometry, varying, vec4 } = tsl as any;
  return seeFade(varying(modelWorldMatrix.mul(vec4(positionGeometry, 1)).xyz), see).oneMinus();
}

/** `uniforms`' `seeThroughFade` values as nodes, each read off its object (one for every material of a kind) */
export function seeUniforms(uniforms: Record<string, { value: unknown }>): SeeNodes {
  const { reference } = tsl as any;
  return {
    focus: reference('value', 'vec3', uniforms.uSeeFocus),
    k: reference('value', 'vec4', uniforms.uSeeK),
    minY: reference('value', 'float', uniforms.uSeeMinY),
    across: reference('value', 'float', uniforms.uSeeAcross),
    whole: reference('value', 'float', uniforms.uSeeWhole),
    ramp: reference('value', 'float', uniforms.uSeeRamp),
    reach: reference('value', 'vec2', uniforms.uSeeReach),
    room: reference('value', 'vec4', uniforms.uSeeRoom),
    door: reference('value', 'vec4', uniforms.uSeeDoor),
    doorOn: reference('value', 'float', uniforms.uSeeDoorOn),
  };
}

/** A see-through material's mask on WebGPU (`seeThrough`'s screen door): a fragment kept unless a share of the
 *  pixels as large as its fade is dropped there, by the same dither. Its values read off the material drawn, as
 *  every material of the kind shares the build. */
function seeMask(of: SeeThrough): N {
  const { abs, floor, mod, positionWorld, screenCoordinate } = tsl as any;
  const bit = mod(floor(screenCoordinate.xy), 2);
  const two = mod(floor(screenCoordinate.xy.mul(0.5)), 2);
  const dither = abs(bit.x.sub(bit.y)).mul(8).add(bit.y.mul(4)).add(abs(two.x.sub(two.y)).mul(2)).add(two.y).add(0.5).div(16);
  return dither.greaterThanEqual(seeFade(positionWorld, seeOfKind(of), middleOf(of)));
}

/** `material`'s see-through mask given it as a property of its own, as the GPU-driven drawing makes its draws' materials
 *  from a material's own properties and never asks for it to be converted (the crypt's obelisks stood solid before the
 *  hero). */
function maskOwn(material: THREE.Material): void {
  const see = (material as { seeThrough?: SeeThrough }).seeThrough;
  if (see) thinBy(material as N, see);
}

/** How `material` thins, as its kind does: by a blend (`opacityNode`), which drops what's nearly gone, or a pattern. */
function thinBy(material: N, see: SeeThrough): void {
  if (material.maskNode) return;
  if (see.wholeOnly) {
    const still = see.stillWhole ?? 0.15;
    const stillNode = typeof still === 'number' ? still
      : (tsl as any).uniform(still.value).setGroup((tsl as any).renderGroup).onRenderUpdate(() => still.value);
    // (a column of the portico keeps all its depth, as `wholeDepthMaterial` has it)
    const porticoKept = see.reach ? middleOf(see).z.greaterThan(seeOfKind(see).door.y) : (tsl as any).bool(false);
    material.maskNode = thinned(see).lessThanEqual(stillNode).or(porticoKept);
    return;
  }
  if (!see.blended) {
    material.maskNode = seeMask(see);
    return;
  }
  const left = thinned(see).oneMinus();
  material.opacityNode = see.pale ? paleLess(material, left) : left;
  material.maskNode = left.greaterThanEqual(BLEND_GONE);
}

/** How far a fragment of `see`'s kind thins: before him (`seeFade`), and where it hides the floor he sees if its kind
 *  thins by that too (`seeSightCone`). */
function thinned(see: SeeThrough): N {
  const { max, positionWorld, select, vec3 } = tsl as any;
  const nodes = seeOfKind(see);
  const mid = middleOf(see);
  const before = seeFade(positionWorld, nodes, mid);
  if (!see.sight) return before;
  // (a column by the floor its middle hides at his height, as `seeSightCone` in seeThrough.ts has it)
  const by = select(nodes.reach.x.lessThan(PLACED_BY_MIDDLE), vec3(mid.x, nodes.focus.y, mid.z), positionWorld);
  return max(before, seeSightCone(by, see));
}

/** how far the hall's walls thin where they hide the floor he sees, and where he stands, as nodes (made once) */
let sightNodes: { on: N; from: N; door: N; doorOn: N } | undefined;

/**
 * How far a fragment at `world` thins where it hides the floor he sees, as `seeSightCone` in seeThrough.ts has it: the
 * floor it hides along the view, at his floor's height, and how far the fog's rays say he sees along it.
 */
function seeSightCone(world: N, see: SeeThrough): N {
  const { atan, cameraPosition, dot, length, max, mix, renderGroup, select, smoothstep, texture, uniform, vec2 } = tsl as any;
  sightNodes ??= {
    on: uniform(0).setGroup(renderGroup).onRenderUpdate(() => SIGHT_CONE.on.value),
    from: uniform(new THREE.Vector2()).setGroup(renderGroup).onRenderUpdate(() => SIGHT.uSightFrom.value),
    door: uniform(new THREE.Vector4()).setGroup(renderGroup).onRenderUpdate(() => SIGHT.uSightDoor.value),
    doorOn: uniform(0).setGroup(renderGroup).onRenderUpdate(() => SIGHT.uSightDoorOn.value),
  };
  // (a kind with a cone of its own, the walls aside of him that stay off with him in the hall)
  const kindOn = see.sightOn;
  const on = kindOn ? uniform(0).setGroup(renderGroup).onRenderUpdate(() => kindOn.value) : sightNodes.on;
  const share = on.abs().mul(see.sightShare ?? 1);
  // (under none, what stands out past the door's line alone: the portico's columns, not the room's)
  const outsideOnly = on.lessThan(0).and(world.z.lessThan(seeOfKind(see).door.y));
  const down = cameraPosition.y.sub(world.y);
  const floorDown = cameraPosition.y.sub(seeOfKind(see).minY.sub(SIGHT_CONE.floorClear));
  const hidden = cameraPosition.xz.add(world.xz.sub(cameraPosition.xz).mul(floorDown).div(down.max(0.01)));
  const { from, to: upTo } = SIGHT_CONE.short;
  // (how far a row's rays see a place `to` off their middle, by each ray's reach as cast, as `seeSeenFrom`)
  const seenFrom = (to: N, row: number): N => {
    const away = length(to);
    // (atan(0, 0) is undefined, and NaN smears over the frame in the bloom)
    const toSafe = select(away.lessThan(0.3), vec2(1, 0), to);
    const ray = texture(SIGHT.tSight.value, vec2(atan(toSafe.y, toSafe.x).div(Math.PI * 2).add(0.5), row));
    const seen = (reach: N): N => smoothstep(reach.sub(from), reach.sub(upTo), away).oneMinus();
    return select(away.lessThan(0.3), 1, seen(ray.a));
  };
  // (by his rays, or past the door he sees through by the door's, as `seeSeenAt`)
  const fromDoor = hidden.sub(sightNodes.door.xy);
  const pastDoor = smoothstep(0, DOOR_SOFT, dot(fromDoor, sightNodes.door.zw)).mul(sightNodes.doorOn);
  const seenHere = max(seenFrom(hidden.sub(sightNodes.from), HIS_ROW), seenFrom(fromDoor, DOOR_ROW).mul(pastDoor));
  const cone = share.mul(seenHere);
  return select(on.equal(0).or(outsideOnly).or(down.lessThanEqual(0.01)), 0, cone);
}

/** What's left of a pale surface as it thins (`PALE` in seeThrough.ts): less of it, by its albedo's luminance. */
function paleLess(material: N, left: N): N {
  const albedo = material.colorNode ?? (tsl as any).materialColor;
  const light = (tsl as any).luminance(albedo.rgb);
  const paleness = overShaft(material) ? 1 : (tsl as any).smoothstep(PALE.from, PALE.to, light);
  return left.mul(left.oneMinus().mul(PALE.most).mul(paleness).oneMinus());
}

/** each kind's see-through uniforms, by its values (one object a kind: `seeThrough`'s kinds share holes) */
const seeKinds = new WeakMap<object, SeeNodes>();

/**
 * A kind's see-through values as uniforms set once a render, shared by its every material (each kind a build of its
 * own, as a uniform node keys the build it's in). Read off each material drawn (`materialReference`), every prop's
 * uniforms were refreshed at every draw, still or not: on WebGPU, about 35 µs of the frame's JS a prop.
 */
function seeOfKind(of: SeeThrough): SeeNodes {
  const made = seeKinds.get(of);
  if (made) return made;
  const { uniform, renderGroup } = tsl as any;
  // (in the render's group: a still prop's refresh sends only what's shared, and in the object's these stayed at the
  // warm-up's, nothing dissolved)
  const nodes = {
    focus: uniform(new THREE.Vector3()).setGroup(renderGroup).onRenderUpdate(() => of.focus.value),
    k: uniform(new THREE.Vector4()).setGroup(renderGroup).onRenderUpdate(() => of.k.value),
    minY: uniform(0).setGroup(renderGroup).onRenderUpdate(() => of.minY.value),
    across: uniform(1).setGroup(renderGroup).onRenderUpdate(() => of.across.value),
    whole: uniform(0).setGroup(renderGroup).onRenderUpdate(() => of.whole.value),
    ramp: uniform(0).setGroup(renderGroup).onRenderUpdate(() => of.ramp.value),
    reach: uniform(new THREE.Vector2()).setGroup(renderGroup).onRenderUpdate(() => of.reach?.value ?? ALL_THE_WAY),
    room: uniform(new THREE.Vector4()).setGroup(renderGroup).onRenderUpdate(() => of.room?.value ?? EVERYWHERE),
    door: uniform(new THREE.Vector4()).setGroup(renderGroup).onRenderUpdate(() => of.door?.value ?? NO_DOOR),
    doorOn: uniform(0).setGroup(renderGroup).onRenderUpdate(() => of.doorOn?.value ?? 0),
  };
  seeKinds.set(of, nodes);
  return nodes;
}

/** A kit material's looks on WebGPU, set on its converted node material (`patch` in core/materials.ts, in TSL): the
 *  dissolve (its pixels dropped by the noise, an edge glowing round the hole), frost and char over its colour, its
 *  glow dimmed near the camera (`near`), a rim of light at glancing angles, the frost's, the char's embers and a hit's
 *  flash, the hood's shade over all its light (`hoodShaded`) and the shine's cap (`shineCapped`). Each read off the
 *  material drawn: every kit's material of a kind shares the build. */
function kitNodes(node: N): void {
  const {
    materialReference, materialColor, materialEmissive, positionGeometry, positionView, normalView,
    positionViewDirection, varying, mix, vec3, vec4, smoothstep, clamp, pow, dot, select,
  } = tsl as any;
  const read = (name: string, type: string): N => materialReference(`kitLooks.${name}.value`, type);
  const dissolve = read('u.uDissolve', 'float');
  const frozen = read('u.uFrozen', 'float');
  const char = read('u.uChar', 'float');
  const at = varying(positionGeometry);
  // (made only while the dissolve or the char reads it, as WebGL's patch does: a node's `select` makes both sides)
  const dn = kitNoise()({ x: at, on: dissolve.max(char) });
  const near = clamp(pow(positionView.z.negate().div(NEAR_GLOW.ref), NEAR_GLOW.pow), NEAR_GLOW.min, 1);
  const shown = vec4(materialColor);
  const frost = mix(shown.rgb, vec3(0.55, 0.8, 1.0), frozen.mul(0.75));
  // (its alpha the map's: three multiplies the opacity in after. Taken from the opacity alone, a cut-out drew whole:
  // the mage's ink, laid over his forearm, hid it, and that's what a copy given these looks showed)
  node.colorNode = vec4(mix(frost, vec3(0.045, 0.035, 0.03), char.mul(0.9)), shown.a);
  const kept = dissolve.lessThanEqual(0).or(dn.greaterThanEqual(dissolve));
  node.maskNode = node.maskNode ? node.maskNode.and(kept) : kept;
  const edge = select(dissolve.greaterThan(0), smoothstep(dissolve, dissolve.add(0.09), dn).oneMinus(), 0);
  const facing = clamp(dot(normalView, positionViewDirection), 0, 1);
  node.emissiveNode = materialEmissive.mul(mix(1, near, read('near', 'float')))
    .add(read('rim', 'color').mul(pow(facing.oneMinus(), 3)))
    .add(read('u.uEdge', 'color').mul(edge).mul(3))
    .add(vec3(0.25, 0.55, 0.9).mul(frozen).mul(0.35))
    .mul(char.mul(-0.7).add(1))
    .add(vec3(1.0, 0.32, 0.06).mul(char).mul(smoothstep(0.6, 0.78, dn)).mul(1.6).mul(near))
    .add(vec3(1.0, 0.9, 0.85).mul(read('u.uHit', 'float')).mul(0.45).mul(near))
    .add(itemAura(read('aura', 'color'), at));
  hoodShaded(node, read('shade', 'vec4'), at);
  shineCapped(node, read('u.uShine', 'float'));
}

let kitNoiseFn: N | null = null;

/** The kit's dissolve and char noise (`fxNoise` twice, core/materials.ts), 0 where `on` isn't above 0, made once. */
function kitNoise(): N {
  if (kitNoiseFn) return kitNoiseFn;
  const { wgslFn } = tsl as any;
  const { noise3 } = wgslNoise();
  return kitNoiseFn = wgslFn(`fn kitNoise(x: vec3f, on: f32) -> f32 {
    if (on <= 0.0) { return 0.0; }
    return noise3(x * 7.0) * 0.65 + noise3(x * 19.0) * 0.35;
  }`, [noise3]);
}

/** the glow's pattern (`AURA_GLSL` in core/materials.ts) in WGSL, line for line, made once */
let auraPattern: N | null = null;

/** `AURA_GLSL`'s `auraTendrils` as a WGSL function (GLSL's `mod` floors, as `wrap` does; WGSL's `%` truncates). */
function auraTendrils(): N {
  if (auraPattern) return auraPattern;
  const { wgslFn } = tsl as any;
  const { hash3 } = wgslNoise();
  const wrap = wgslFn(`fn auraWrap(x: f32, per: f32) -> f32 { return x - per * floor(x / per); }`);
  const hash = wgslFn(`fn auraHash(start: vec3f, per: f32) -> f32 {
    return hash3(vec3f(start.x, auraWrap(start.y, per), start.z));
  }`, [hash3, wrap]);
  const noise3 = wgslFn(`fn auraNoise3(x: vec3f, per: f32) -> f32 {
    let i = floor(x);
    var f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(auraHash(i, per), auraHash(i + vec3f(1.0, 0.0, 0.0), per), f.x),
        mix(auraHash(i + vec3f(0.0, 1.0, 0.0), per), auraHash(i + vec3f(1.0, 1.0, 0.0), per), f.x), f.y),
      mix(mix(auraHash(i + vec3f(0.0, 0.0, 1.0), per), auraHash(i + vec3f(1.0, 0.0, 1.0), per), f.x),
        mix(auraHash(i + vec3f(0.0, 1.0, 1.0), per), auraHash(i + vec3f(1.0, 1.0, 1.0), per), f.x), f.y), f.z);
  }`, [hash]);
  const noise = wgslFn(`fn auraNoise(p: vec3f, w: f32, per: vec2f) -> f32 {
    let s = floor(w);
    var f = fract(w);
    f = f * f * (3.0 - 2.0 * f);
    let s0 = auraWrap(s, per.y);
    let s1 = auraWrap(s + 1.0, per.y);
    let slice = vec3f(17.31, 7.0, 11.13);
    return mix(auraNoise3(p + slice * s0, per.x), auraNoise3(p + slice * s1, per.x), f);
  }`, [noise3, wrap]);
  const fbm = wgslFn(`fn auraFbm(p: vec3f, w: f32, per: vec2f) -> f32 {
    return auraNoise(p, w, per) * 0.5 + auraNoise(p * 2.0 + 3.7, w * 2.0, per * 2.0) * 0.3
      + auraNoise(p * 4.0 + 9.1, w * 4.0, per * 4.0) * 0.2;
  }`, [noise]);
  const warp = wgslFn(`fn auraWarp(p: vec3f, w: f32, per: vec2f) -> f32 {
    return auraNoise(p, w, per) * 0.62 + auraNoise(p * 2.0 + 3.7, w * 2.0, per * 2.0) * 0.38;
  }`, [noise]);
  auraPattern = wgslFn(`fn auraTendrils(at: vec3f, c: f32, shape: vec4f, looping: vec4f) -> f32 {
    let p = at * shape.xyx - vec3f(0.0, c * looping.x, 0.0);
    let w = c * looping.y;
    let per = looping.xy;
    let warped = vec2f(auraWarp(p * 0.5, w * 0.5, per * 0.5),
      auraWarp(p * 0.5 + vec3f(5.0, 1.0, 3.0), w * 0.5 + 1.0, per * 0.5));
    let tex = auraFbm(p + vec3f(warped.x, warped.y, warped.x) * 2.2, w, per);
    let strand = smoothstep(0.0, 1.0, 1.0 - abs(tex - shape.z) / shape.w);
    return looping.z + strand * mix(0.4, 1.0, smoothstep(0.3, 0.5, warped.x));
  }`, [fbm, warp]);
  return auraPattern;
}

/** the glow's shape, loop and clock (`itemGlowUniforms`), uniforms of the render's group every kit shares */
let auraNodes: { shape: N; loop: N; clock: N } | null = null;

/** The glow's uniforms, made once. */
function itemAuraNodes(): { shape: N; loop: N; clock: N } {
  const { uniform, renderGroup } = tsl as any;
  const read = (value: () => unknown, start: unknown): N =>
    uniform(start).setGroup(renderGroup).onRenderUpdate(value);
  auraNodes ??= {
    shape: read(() => itemGlowUniforms.shape.value, new THREE.Vector4()),
    loop: read(() => itemGlowUniforms.loop.value, new THREE.Vector4()),
    clock: read(() => itemGlowUniforms.clock.value, 0),
  };
  return auraNodes;
}

/** A worn item's glow in its rarity's colour, as the WebGL patch draws it (`ITEM_GLOW` in core/materials.ts):
 *  tendrils of light on its surface, drifting up on a loop. `aura` black: nothing. */
function itemAura(aura: N, at: N): N {
  const { shape, loop, clock } = itemAuraNodes();
  const tendrils = auraTendrils()({ at, c: clock, shape, looping: loop });
  return aura.mul(loop.w).mul(tendrils);
}

/** All of `node`'s light (lit, reflected and its own glow) dimmed in a hood's shade, as the WebGL patch dims it after
 *  its lights: `shade` x how deep, y where up the mesh (`at`) it's full, z where it's gone, w how much more aside.
 *  Before the fog, as there. */
function hoodShaded(node: N, shade: N, at: N): void {
  const { abs, clamp, select, smoothstep, vec4 } = tsl as any;
  const hood = shade.x.mul(clamp(smoothstep(shade.z, shade.y, at.y).add(shade.w.mul(abs(at.x))), 0, 1));
  const kept = select(shade.x.greaterThan(0), hood.oneMinus(), 1);
  const setupOutput = node.setupOutput.bind(node);
  node.setupOutput = (builder: N, output: N) => setupOutput(builder, vec4(output.rgb.mul(kept), output.a));
}

/** `node`'s direct highlights eased into `shine` from half of it, as the WebGL patch caps them (`SHINE`: a held blade
 *  through the eyes): three's lighting model has them apart as it finishes, and its sum is mended by the difference.
 *  A material with no lighting model (unlit) is left as it is. */
function shineCapped(node: N, shine: N): void {
  const { max, mix, step } = tsl as any;
  if (typeof node.setupLightingModel !== 'function') return;
  const setupLightingModel = node.setupLightingModel.bind(node);
  node.setupLightingModel = (builder: N) => {
    const model = setupLightingModel(builder);
    if (!model) return model;
    const finish = model.finish.bind(model);
    model.finish = (state: N) => {
      const { outgoingLight, reflectedLight } = state.context;
      const highlight = reflectedLight.directSpecular;
      const most = max(max(highlight.r, highlight.g), highlight.b);
      const knee = shine.mul(0.5);
      // (with no division by naught where there's no cap, and blended: as a select between the two, every kit's
      // material drew pale)
      const over = max(most.sub(knee), 0);
      const eased = highlight.mul(knee.add(over.div(over.div(max(shine.sub(knee), 1e-4)).add(1)))).div(max(most, 1e-6));
      const capped = mix(highlight, eased, step(1e-4, shine).mul(step(knee, most)));
      outgoingLight.assign(outgoingLight.sub(highlight).add(capped));
      finish(state);
    };
    return model;
  };
}

/** `material`'s uniforms refreshed at every draw. three looks for a node on the material it was given, not on the
 *  node material it built from it, and finding none, refreshes a mesh that stays still only as its own properties
 *  change: a port's or a look's uniforms stayed as they first drew (the outline's strength at the warm-up's 0). The
 *  node is an own, enumerable property, as three looks for one. */
function refreshedEachDraw(material: THREE.Material): void {
  if (!Object.prototype.hasOwnProperty.call(material, 'refreshNode')) {
    (material as N).refreshNode = (tsl as any).float(0);
  }
}

/** A lit material's own looks on WebGPU, where its GLSL patch (`onBeforeCompile`) is WebGL's alone: given the node
 *  material three converts it to, as it's converted (a fire's char and embers: world/fireNodes.ts `emberNodes`).
 *  Its uniforms are read off the material drawn (`materialReference`), as three shares the build. */
export interface OwnLooks { webgpuLooks: (converted: N) => void }

/** three's library made to take each ported material's node material in its place (its blending, sides and depth
 *  copied over every time three asks: the draw reads them off the game's material, the build off this one). */
export function takePorts(renderer: WebGPURenderer): void {
  stillMaterialsGo(maskOwn);
  const library = renderer.library as unknown as { fromMaterial(material: THREE.Material): THREE.Material | null };
  const fromMaterial = library.fromMaterial.bind(library);
  library.fromMaterial = (material) => {
    const port = ports.get(material);
    if (!port) {
      // (three logs only "ShaderMaterial is not compatible": which one, by its fragment shader's start)
      const fragment = (material as THREE.ShaderMaterial).isShaderMaterial && (material as THREE.ShaderMaterial).fragmentShader;
      if (fragment) console.error(`Not ported to WebGPU: ${material.name || fragment.trim().slice(0, 60).replace(/\s+/g, ' ')}`);
      const converted = fromMaterial(material);
      // (the props' and canopies' dissolve: their GLSL patch is WebGL's alone)
      const see = (material as { seeThrough?: SeeThrough }).seeThrough;
      const kit = (material as { kitLooks?: KitLooks }).kitLooks;
      const own = (material as Partial<OwnLooks>).webgpuLooks;
      // (a material three converts afresh each time: its own node materials, the crowds', are left as they are)
      if (converted && !(material as N).isNodeMaterial) {
        if (see) thinBy(converted as N, see);
        // (a hair card: `bothSidesOut` in models/head.ts, its normal the surface's, not turned over for a back face)
        if ((material as { litBothSides?: boolean }).litBothSides) (converted as N).normalNode = (tsl as any).normalViewGeometry;
        // (an effect's plain material: `nearGlow`'s GLSL patch is WebGL's alone. Its node reads nothing of the frame's
        // that three must refresh)
        if (material.customProgramCacheKey() === 'nearGlow') (converted as N).colorNode = nearGlowed((tsl as any).vec4((tsl as any).materialColor));
        if (kit) kitNodes(converted);
        if (own) own(converted);
        // (a see-through's own uniforms are set once a render: `seeOfKind`, and its node no reason for a refresh; a
        // kit's looks are refreshed as they change, `stillWhereStill` in core/webgpu.ts. Its node is given all the
        // same, for the meshlets' copy of it: their pipeline draws a copy of the material, which takes the node with
        // its other properties and isn't still; without one, the batches' draws stayed as they first drew, and once
        // the clusters' pool grew a few seconds in, the forest's standing stones and boulders were drawn nowhere)
        if (kit || see || own) refreshedEachDraw(material);
        if (!own && (kit || see)) stillNodes.add(material);
      }
      return converted;
    }
    let node = made.get(material);
    if (!node) made.set(material, node = madeFrom(material as THREE.ShaderMaterial, port));
    THREE.Material.prototype.copy.call(node, material);
    refreshedEachDraw(material);
    return node;
  };
}
