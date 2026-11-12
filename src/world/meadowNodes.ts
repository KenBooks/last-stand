// The village's meadow on WebGPU (core/webgpu.ts): meadow.ts's GLSL hooks as TSL nodes, set on its plain materials
// (three copies them onto the node material it makes of each), written line for line: the blades placed from their
// instance's cell (`bladeNodes`), and the ground's sward under them (`swardColorNode`). A ring's uniforms are set once
// a render (`renderGroup`, as `onBeforeRender` sets them just before its first draw): the grass stands still to three,
// and a still material's refresh sends nothing of the object's.
import type * as THREE from 'three';
import { stillNodes, tsl } from '../core/webgpu';

// (untyped: TSL's types don't follow its conversions across these calls yet)
/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

/** A ring's uniforms as `meadow.ts` sets them. */
export interface BladeUniforms {
  uOrigin: { value: THREE.Vector2 };
  uCell: { value: number };
  uWider: { value: number };
  uCombed: { value: number };
  uS: { value: number };
  uTiles: { value: THREE.Vector2[] };
  uFocus: { value: THREE.Vector2 };
  uEye: { value: THREE.Vector2 };
  uBand: { value: THREE.Vector4 };
  uByStrand: { value: number };
  uStrandsBy: { value: number };
  uTime: { value: number };
  uMeadow: { value: THREE.Texture };
  uMeadowHalf: { value: number };
}

/** `meadow.ts`'s numbers for a blade's width and how its strands rise. */
export interface BladeNumbers { widthInCells: number; grows: number; strandCut: number; strandsRise: number }

/** the shaders' small functions, made once */
let fns: Record<'hash' | 'noise' | 'maskHash' | 'maskNoise' | 'seed' | 'tileOf' | 'withinOf', N> | null = null;
function bladeFns(): NonNullable<typeof fns> {
  if (fns) return fns;
  const { wgslFn } = tsl as any;
  const valueNoise = (name: string, hashName: string): string => `fn ${name}(p: vec2f) -> f32 {
    let i = floor(p);
    var f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(${hashName}(i), ${hashName}(i + vec2f(1.0, 0.0)), f.x),
      mix(${hashName}(i + vec2f(0.0, 1.0)), ${hashName}(i + vec2f(1.0, 1.0)), f.x), f.y);
  }`;
  const hash = wgslFn('fn bladeHash(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453); }');
  const maskHash = wgslFn('fn meadowHash(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(269.5, 183.3))) * 43758.5453); }');
  const pcg = wgslFn(`fn bladePcg(start: vec2u) -> vec2u {
    var v = start * 1664525u + 1013904223u;
    v.x += v.y * 1664525u;
    v.y += v.x * 1664525u;
    v = v ^ (v >> vec2u(16u));
    v.x += v.y * 1664525u;
    v.y += v.x * 1664525u;
    v = v ^ (v >> vec2u(16u));
    return v;
  }`);
  fns = {
    hash,
    maskHash,
    noise: wgslFn(valueNoise('bladeNoise', 'bladeHash'), [hash]),
    maskNoise: wgslFn(valueNoise('meadowNoise', 'meadowHash'), [maskHash]),
    seed: wgslFn(`fn bladeSeed(cell: vec2f) -> vec4f {
      let a = bladePcg(vec2u(vec2i(cell) + vec2i(65536)));
      let b = bladePcg(a ^ vec2u(0x9e3779b9u, 0x85ebca6bu));
      return vec4f(vec4u(a, b)) / 4294967295.0;
    }`, [pcg]),
    tileOf: wgslFn('fn bladeTile(instance: u32, side: u32) -> i32 { return i32(instance / (side * side)); }'),
    withinOf: wgslFn(`fn bladeWithin(instance: u32, side: u32) -> vec2f {
      let within = instance % (side * side);
      return vec2f(f32(within % side), f32(within / side));
    }`),
  };
  return fns;
}

/** The mask's grass at `xz` (0 to 1), its edges made ragged, as `MEADOW_AT_GLSL`'s `meadowAt` reads it. */
function meadowAtNode(mask: THREE.Texture, half: number, xz: N): N {
  const { clamp, texture, vec2, abs } = tsl as any;
  const { maskNoise } = bladeFns();
  const noise = (p: N): N => maskNoise({ p });
  const slow = vec2(noise(xz.mul(0.45)), noise(xz.mul(0.45).add(17.3))).sub(0.5);
  const quick = vec2(noise(xz.mul(1.7).add(5.1)), noise(xz.mul(1.7).add(41.7))).sub(0.5).mul(0.4);
  const at = xz.add(slow.add(quick).mul(1.4)).div(half * 2).add(0.5);
  const read = texture(mask, at).level(0).r;
  const cut = noise(xz.mul(2.3).add(3.7)).mul(0.6).add(noise(xz.mul(6.1)).mul(0.4));
  const edge = abs(read.mul(2).sub(1)).oneMinus();
  return clamp(read.add(cut.sub(0.5).mul(0.5).mul(edge).mul(2)), 0, 1);
}

/** The strand of a far ring's sheet a fragment is on, its share along it and whether it's cut away, as `FRAGMENT_COLOUR`
 *  has it. */
function strandOf(vBlade: N, vStrands: N, vGrowing: N, { grows, strandCut, strandsRise }: BladeNumbers): {
  along: N; across: N; cut: N;
} {
  const { abs, floor, fract, max, mix, pow, select, sin, smoothstep } = tsl as any;
  const isSheet = vStrands.x.greaterThan(1.5);
  const strandAt = vBlade.y.mul(0.5).add(0.5).mul(vStrands.x);
  const strand = floor(strandAt);
  const tallBy = fract(sin(strand.mul(12.9898).add(vStrands.y.mul(78.233))).mul(43758.5453));
  const risesAt = fract(sin(strand.mul(39.346).add(vStrands.y.mul(11.135))).mul(24634.6345)).mul(strandsRise);
  const rising = mix(1, smoothstep(risesAt, risesAt.add(grows), vGrowing.x), vGrowing.y);
  const tall = tallBy.mul(strandCut).oneMinus().mul(rising);
  const along = vBlade.x.div(max(tall, 1e-3));
  const across = abs(fract(strandAt).mul(2).sub(1));
  const off = tall.lessThan(0.01).or(along.greaterThan(1)).or(across.greaterThan(pow(along, 2.5).oneMinus()));
  return {
    along: select(isSheet, along, vBlade.x),
    across: select(isSheet, across, abs(vBlade.y)),
    cut: isSheet.and(off),
  };
}

/** `m`, a ring's material, drawn as its blades: placed from each instance's cell (`VERTEX_BLADE`), coloured as grass
 *  (`FRAGMENT_COLOUR`), its normal the blade's from either side; `combed`, each far sheet cut into strands. */
export function bladeNodes(m: THREE.MeshStandardMaterial, u: BladeUniforms, combed: boolean, numbers: BladeNumbers): void {
  const {
    Fn, abs, attribute, cameraPosition, cameraViewMatrix, clamp, cos, dot, float, floor, fract, instanceIndex, length, mix,
    normalize, pow, renderGroup, select, sign, sin, smoothstep, step, texture, uniform, uniformArray, varyingProperty,
    vec2, vec3, vec4,
  } = tsl as any;
  const { hash, noise, seed, tileOf, withinOf } = bladeFns();
  const number = (of: { value: number }, type = 'float'): N =>
    uniform(of.value, type).setGroup(renderGroup).onRenderUpdate(() => of.value);
  const held = <T>(of: { value: T }): N => uniform(of.value).setGroup(renderGroup).onRenderUpdate(() => of.value);
  const origin = held(u.uOrigin);
  const focus = held(u.uFocus);
  const eye = held(u.uEye);
  const band = held(u.uBand);
  const cell = number(u.uCell);
  const wider = number(u.uWider);
  const combedNow = number(u.uCombed);
  const side = number(u.uS, 'uint');
  const byStrandNow = number(u.uByStrand);
  const strandsBy = number(u.uStrandsBy);
  const time = number(u.uTime);
  const tiles = uniformArray(u.uTiles.value, 'vec2').setGroup(renderGroup);
  const half = u.uMeadowHalf.value;
  const mask = u.uMeadow.value;
  const vColour = varyingProperty('vec3', 'vBladeColour');
  const vBlade = varyingProperty('vec2', 'vBlade');
  const vStrands = varyingProperty('vec2', 'vStrands');
  const vGrowing = varyingProperty('vec2', 'vGrowing');
  const vNormal = varyingProperty('vec3', 'vBladeNormal');
  const hashOf = (p: N): N => hash({ p });
  const noiseOf = (p: N): N => noise({ p });
  m.positionNode = Fn(() => {
    const instance = { instance: instanceIndex, side };
    const cellAt = origin.add(tiles.element(tileOf(instance))).add(withinOf(instance)).toVar();
    const h = seed({ cell: cellAt }).toVar();
    const first = cellAt.add(h.xy).mul(cell).toVar();
    // tufts: the blades pulled towards a centre on a coarse grid (`VERTEX_BLADE` says why it's warped)
    const warped = first.add(vec2(noiseOf(first.mul(0.31)), noiseOf(first.mul(0.31).add(17.9))).sub(0.5).mul(1.6)).toVar();
    const tuftCell = floor(warped.div(0.7)).toVar();
    const tuftAt = tuftCell.add(vec2(hashOf(tuftCell), hashOf(tuftCell.add(31.7)))).mul(0.7).sub(warped.sub(first));
    const tuft = hashOf(tuftCell.add(7.3)).toVar();
    const root = mix(first, tuftAt, mix(0.1, 0.45, hashOf(tuftCell.add(3.1)))).toVar();
    const away = length(root.sub(focus));
    const inBand = smoothstep(band.x, band.y, away).mul(smoothstep(band.z, band.w, away).oneMinus()).toVar();
    const grass = meadowAtNode(mask, half, root).toVar();
    const maskUv = root.div(half * 2).add(0.5).toVar();
    const grows = texture(mask, maskUv).level(0).r;
    const patchy = noiseOf(root.mul(0.15)).mul(0.65).add(noiseOf(root.mul(0.55).add(9.1)).mul(0.35)).toVar();
    const chance = smoothstep(0.08, 0.6, grass).mul(smoothstep(0.3, 0.7, grows)).mul(mix(0.75, 1, smoothstep(0.25, 0.7, patchy)));
    const byStrand = byStrandNow.mul(combedNow).mul(step(1.5, wider)).toVar();
    const share = fract(h.z.mul(3.17)).mul(1 - numbers.grows);
    const ringOn = mix(smoothstep(share, share.add(numbers.grows), inBand), step(0.001, inBand), byStrand);
    const on = smoothstep(h.z.mul(0.85), h.z.mul(0.85).add(0.15), chance).mul(ringOn).toVar();
    vGrowing.assign(vec2(inBand, byStrand));
    const height = on.mul(mix(0.2, 0.46, h.w)).mul(mix(0.55, 1, grass)).mul(mix(0.75, 1.25, tuft)).mul(mix(0.8, 1.15, patchy)).toVar();
    const width = on.mul(cell).mul(wider).mul(numbers.widthInCells).mul(mix(0.8, 1.25, fract(h.z.mul(7.13)))).toVar();
    const turn = h.w.mul(6.2832).add(h.x.mul(3));
    // (at the meadow's edge a blade leans away from it, into the grass)
    const stepAside = 0.35 / (half * 2);
    const readAt = (x: number, y: number): N => texture(mask, maskUv.add(vec2(x, y))).level(0).r;
    const inward = vec2(readAt(stepAside, 0).sub(readAt(-stepAside, 0)), readAt(0, stepAside).sub(readAt(0, -stepAside))).toVar();
    const edge = clamp(length(inward).mul(3), 0, 1);
    const lean2 = normalize(mix(vec2(cos(turn), sin(turn)), normalize(inward.add(1e-5)), edge.mul(0.85))).toVar();
    const lean = vec3(lean2.x, 0, lean2.y);
    // seen edge on, a blade turns up to a third of the way to the camera
    const toCam = normalize(eye.sub(root).add(1e-4)).toVar();
    const across0 = vec2(lean2.y, lean2.x.negate());
    const facing = vec2(toCam.y.negate(), toCam.x);
    const facingBy = sign(dot(facing, across0).add(1e-4));
    const turned = normalize(mix(across0, facing.mul(facingBy), abs(dot(toCam, lean2)).oneMinus().mul(0.35))).toVar();
    const across = vec3(turned.x, 0, turned.y);
    const shape = attribute('bv', 'vec2');
    const t = shape.x.toVar();
    const sideOf = shape.y.toVar();
    const tilt = fract(h.x.mul(13.1)).mul(0.35).add(0.12);
    const bendBy = fract(h.y.mul(7.7)).mul(0.7).add(0.35);
    const mid = tilt.add(bendBy.mul(t).mul(0.5)).toVar();
    const angle = tilt.add(bendBy.mul(t)).toVar();
    const strands = combedNow.mul(wider).mul(wider).mul(strandsBy).toVar();
    const w = width.mul(select(strands.greaterThan(1.5), float(1), pow(t, 2.5).oneMinus()));
    vStrands.assign(vec2(strands, h.x));
    const local = across.mul(sideOf.mul(w).mul(0.5))
      .add(lean.mul(t.mul(height).mul(sin(mid))))
      .add(vec3(0, t.mul(height).mul(cos(mid)), 0));
    // the wind: gusts rolling across the meadow and a flutter a blade, bending by the square of t
    const roll = sin(time.mul(1.5).sub(root.x.mul(0.21)).sub(root.y.mul(0.14))).mul(0.5).add(0.5);
    const flutter = sin(time.mul(5.1).add(h.y.mul(6.2832))).mul(0.25);
    const wind = vec3(0.83, 0, 0.55).mul(t.mul(t).mul(height).mul(roll.mul(0.5).add(flutter.mul(0.3)).add(0.1)));
    // its upper face along the arc, rounded across: lit as a surface, from both sides
    const up = vec3(0, 1, 0);
    const face = up.mul(sin(angle)).sub(lean.mul(cos(angle)));
    vNormal.assign(normalize(mix(face, up, 0.55).add(across.mul(sideOf).mul(0.45))));
    vBlade.assign(vec2(t, sideOf));
    // spring greens, a tuft's own, some dry and gold
    const green = mix(vec3(0.075, 0.2, 0.03), vec3(0.17, 0.32, 0.045), fract(h.y.mul(3.7)));
    const dry = smoothstep(0.72, 1, tuft).mul(0.7).add(smoothstep(0.75, 0.95, patchy).mul(0.25));
    vColour.assign(mix(green, vec3(0.36, 0.33, 0.1), dry));
    return vec3(root.x, 0, root.y).add(local).add(wind);
  })();
  // (the face bent up is the lit one from either side: flipped on the back, every blade's back was dark)
  m.normalNode = normalize(cameraViewMatrix.mul(vec4(vNormal, 0)).xyz);
  const cutInto = combed ? strandOf(vBlade, vStrands, vGrowing, numbers) : { along: vBlade.x, across: abs(vBlade.y), cut: null };
  const { along, across: acrossAt } = cutInto;
  const shaded = vColour.mul(mix(0.3, 1, smoothstep(0, 0.55, along))).mul(acrossAt.mul(acrossAt).mul(0.3).oneMinus());
  const midrib = vec3(0.02, 0.03, 0).mul(smoothstep(0.04, 0.16, acrossAt).oneMinus()).mul(smoothstep(0.1, 0.4, along));
  m.colorNode = vec4(mix(shaded.add(midrib), vec3(0.4, 0.36, 0.16), smoothstep(0.85, 1, along).mul(0.35)), 1);
  if (cutInto.cut) (m as N).maskNode = cutInto.cut.not();
  stillNodes.add(m);
}

/** The ground's colour under the meadow: a sward's dark green where the mask has grass, in broad patches. */
export function swardColorNode(mask: THREE.Texture, half: number): N {
  const { Fn, materialColor, mix, positionWorld, smoothstep, vec3, vec4 } = tsl as any;
  const { noise } = bladeFns();
  return Fn(() => {
    const xz = positionWorld.xz;
    const patches = noise({ p: xz.mul(0.15) }).mul(0.6).add(noise({ p: xz.mul(0.9).add(4) }).mul(0.4));
    const shade = materialColor.g.mul(0.6).add(0.8);
    const sward = mix(vec3(0.05, 0.11, 0.025), vec3(0.11, 0.17, 0.04), patches).mul(shade);
    return vec4(mix(materialColor.rgb, sward, smoothstep(0.1, 0.7, meadowAtNode(mask, half, xz))), materialColor.a);
  })();
}
