// The village's meadow under the Rust engine: `world/meadowNodes.ts`'s nodes as WGSL for the engine's hooks, written
// line for line: the blades placed from their instance's cell (`BLADES`), and the ground's sward under them (`SWARD`).
import type * as THREE from 'three';
import type { BladeNumbers, BladeUniforms } from '../../world/meadowNodes';
import type { RustLook, RustShader } from '../custom';
import { TUNE } from '../globals';
import { ONE_GRASS } from '../../world/meadowOne';

/** The one grass's numbers as a ring is drawn (`world/meadowOne.ts`): the camera's height over the ground and
 *  how far from it all the grass is kept, and the least share of it kept however far. */
export interface OneNow { high: number; reach: number; least: number }

/** where a ring's numbers are in `m.c`, in floats */
const AT = { origin: 0, focus: 2, eye: 4, cell: 6, wider: 7, band: 8, combed: 12, side: 13, byStrand: 14, strandsBy: 15,
  time: 16, half: 17, widthInCells: 18, grows: 19, strandCut: 20, strandsRise: 21, cuts: 22, unshaded: 23, plain: 24,
  one: 25, reach: 26, fall: 27, high: 28, least: 29 };

const SHARED = /* wgsl */ `
fn blade_hash(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453); }
fn meadow_hash(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(269.5, 183.3))) * 43758.5453); }
fn blade_noise(p: vec2f) -> f32 {
  let i = floor(p);
  var f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(blade_hash(i), blade_hash(i + vec2f(1.0, 0.0)), f.x),
    mix(blade_hash(i + vec2f(0.0, 1.0)), blade_hash(i + vec2f(1.0, 1.0)), f.x), f.y);
}
fn meadow_noise(p: vec2f) -> f32 {
  let i = floor(p);
  var f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(meadow_hash(i), meadow_hash(i + vec2f(1.0, 0.0)), f.x),
    mix(meadow_hash(i + vec2f(0.0, 1.0)), meadow_hash(i + vec2f(1.0, 1.0)), f.x), f.y);
}
fn mask_at(uv: vec2f) -> f32 { return textureSampleLevel(t_extra0, samp, uv, 0.0).r; }
/// The mask's grass at xz (0 to 1), its edges made ragged.
fn meadow_at(xz: vec2f, span: f32) -> f32 {
  let slow = vec2f(meadow_noise(xz * 0.45), meadow_noise(xz * 0.45 + 17.3)) - 0.5;
  let quick = (vec2f(meadow_noise(xz * 1.7 + 5.1), meadow_noise(xz * 1.7 + 41.7)) - 0.5) * 0.4;
  let read = mask_at((xz + (slow + quick) * 1.4) / (span * 2.0) + 0.5);
  let cut = meadow_noise(xz * 2.3 + 3.7) * 0.6 + meadow_noise(xz * 6.1) * 0.4;
  let edge = 1.0 - abs(read * 2.0 - 1.0);
  return clamp(read + (cut - 0.5) * 0.5 * edge * 2.0, 0.0, 1.0);
}
`;

const BLADES: RustShader = {
  name: 'meadow-blades',
  hooks: SHARED + /* wgsl */ `
fn blade_pcg(start: vec2u) -> vec2u {
  var v = start * 1664525u + 1013904223u;
  v.x += v.y * 1664525u;
  v.y += v.x * 1664525u;
  v = v ^ (v >> vec2u(16u));
  v.x += v.y * 1664525u;
  v.y += v.x * 1664525u;
  v = v ^ (v >> vec2u(16u));
  return v;
}
fn blade_seed(cell: vec2f) -> vec4f {
  let a = blade_pcg(vec2u(vec2i(cell) + vec2i(65536)));
  let b = blade_pcg(a ^ vec2u(0x9e3779b9u, 0x85ebca6bu));
  return vec4f(vec4u(a, b)) / 4294967295.0;
}

fn vertex_hook(v: ptr<function, Vertex>, instance: u32) {
  let origin = m.c[0].xy;
  let focus = m.c[0].zw;
  let eye = m.c[1].xy;
  // (one grass for every view, world/meadowOne.ts: a ring's cell is as many of the finest as its cells are wider,
  // and its blade that cell's own, as wide as the first ring's)
  let one = m.c[6].y > 0.5;
  let cells_wide = m.c[1].w;
  let cell = select(m.c[1].z, m.c[1].z / cells_wide, one);
  let wider = select(cells_wide, 1.0, one);
  let band = m.c[2];
  let combed_now = m.c[3].x;
  let side = max(u32(m.c[3].y), 1u);
  let time = m.c[4].x;
  let span = m.c[4].y;
  let grows_over = m.c[4].w;
  let shape = (*v).position;

  let listed = instance / (side * side);
  // (its tile from the draw's list, eight tiles a row: RustLook.list)
  let pair = bones[(*v).list + listed / 8u][(listed % 8u) / 2u];
  let tile = select(pair.xy, pair.zw, listed % 2u == 1u);
  let within = instance % (side * side);
  let ring_cell = origin + tile + vec2f(f32(within % side), f32(within / side));
  let cell_at = select(ring_cell, ring_cell * cells_wide, one);
  let h = blade_seed(cell_at);
  let first = (cell_at + h.xy) * cell;
  // tufts: the blades pulled towards a centre on a coarse grid
  let warped = first + (vec2f(blade_noise(first * 0.31), blade_noise(first * 0.31 + 17.9)) - 0.5) * 1.6;
  let tuft_cell = floor(warped / 0.7);
  let tuft_at = (tuft_cell + vec2f(blade_hash(tuft_cell), blade_hash(tuft_cell + 31.7))) * 0.7 - (warped - first);
  let tuft = blade_hash(tuft_cell + 7.3);
  let root = mix(first, tuft_at, mix(0.1, 0.45, blade_hash(tuft_cell + 3.1)));
  let away = length(root - focus);
  var in_band = 0.0;
  if (one) {
    // (a ring's edge is no hand-over: the blades either side of it are the same)
    in_band = select(0.0, 1.0, away >= band.x && away < band.z);
  } else {
    in_band = smoothstep(band.x, band.y, away) * (1.0 - smoothstep(band.z, band.w, away));
  }
  // (a blade out of its ring's band is drawn as nothing at its root: left here, ahead of the mask's reads and its
  // shape, which every vertex of every blade of a listed tile paid for)
  (*v).color = vec4f(1.0);
  if (in_band <= 0.0) { (*v).position = vec3f(root.x, 0.0, root.y); return; }
  let grass = meadow_at(root, span);
  let mask_uv = root / (span * 2.0) + 0.5;
  let grows = mask_at(mask_uv);
  let patchy = blade_noise(root * 0.15) * 0.65 + blade_noise(root * 0.55 + 9.1) * 0.35;
  let chance = smoothstep(0.08, 0.6, grass) * smoothstep(0.3, 0.7, grows) * mix(0.75, 1.0, smoothstep(0.25, 0.7, patchy));
  let by_strand = m.c[3].z * combed_now * step(1.5, wider);
  let share = fract(h.z * 3.17) * (1.0 - grows_over);
  var ring_on = mix(smoothstep(share, share + grows_over, in_band), step(0.001, in_band), by_strand);
  if (one) {
    // (the share of the grass kept this far from the camera, and the blade's rank among it: one in four of a
    // grid's cells is the next grid's too, and theirs are the lowest ranks, so a ring of wider cells holds every
    // blade still kept where it draws. A blade grows as the share passes its rank.)
    let far = length(vec2f(away, m.c[7].x));
    let kept = max(min(pow(m.c[6].z / max(far, 0.01), m.c[6].w), 4.0), m.c[7].y);
    let at = vec2i(cell_at);
    let level = min(countTrailingZeros(bitcast<u32>(at.x) | bitcast<u32>(at.y)), 3u);
    let most = pow(0.25, f32(level));
    let least = select(most * 0.25, 0.0, level == 3u);
    let rank = mix(least, most, fract(h.z * 3.17));
    ring_on = smoothstep(rank, rank * 1.3, kept);
  }
  let shown = smoothstep(h.z * 0.85, h.z * 0.85 + 0.15, chance) * ring_on;
  // (and one the mask or its ring's hand-over drops: the same)
  if (shown <= 0.0) { (*v).position = vec3f(root.x, 0.0, root.y); return; }
  let height = shown * mix(0.2, 0.46, h.w) * mix(0.55, 1.0, grass) * mix(0.75, 1.25, tuft) * mix(0.8, 1.15, patchy);
  let width = shown * cell * wider * m.c[4].z * mix(0.8, 1.25, fract(h.z * 7.13));
  let turn = h.w * 6.2832 + h.x * 3.0;
  // (at the meadow's edge a blade leans away from it, into the grass)
  let aside = 0.35 / (span * 2.0);
  let inward = vec2f(mask_at(mask_uv + vec2f(aside, 0.0)) - mask_at(mask_uv - vec2f(aside, 0.0)),
    mask_at(mask_uv + vec2f(0.0, aside)) - mask_at(mask_uv - vec2f(0.0, aside)));
  let edge = clamp(length(inward) * 3.0, 0.0, 1.0);
  let lean2 = normalize(mix(vec2f(cos(turn), sin(turn)), normalize(inward + 1e-5), edge * 0.85));
  let lean = vec3f(lean2.x, 0.0, lean2.y);
  // seen edge on, a blade turns up to a third of the way to the camera
  let to_cam = normalize(eye - root + 1e-4);
  let across0 = vec2f(lean2.y, -lean2.x);
  let facing = vec2f(-to_cam.y, to_cam.x);
  let facing_by = sign(dot(facing, across0) + 1e-4);
  let turned = normalize(mix(across0, facing * facing_by, (1.0 - abs(dot(to_cam, lean2))) * 0.35));
  let across = vec3f(turned.x, 0.0, turned.y);
  let t = shape.x;
  let side_of = shape.y;
  let tilt = fract(h.x * 13.1) * 0.35 + 0.12;
  let bend_by = fract(h.y * 7.7) * 0.7 + 0.35;
  let mid = tilt + bend_by * t * 0.5;
  let angle = tilt + bend_by * t;
  let strands = combed_now * wider * wider * m.c[3].w;
  let w = width * select(1.0 - pow(t, 2.5), 1.0, strands > 1.5);
  let bent = across * (side_of * w * 0.5) + lean * (t * height * sin(mid)) + vec3f(0.0, t * height * cos(mid), 0.0);
  // the wind: gusts rolling across the meadow and a flutter a blade, bending by the square of t
  let roll = sin(time * 1.5 - root.x * 0.21 - root.y * 0.14) * 0.5 + 0.5;
  let flutter = sin(time * 5.1 + h.y * 6.2832) * 0.25;
  let wind = vec3f(0.83, 0.0, 0.55) * (t * t * height * (roll * 0.5 + flutter * 0.3 + 0.1));
  // its upper face along the arc, rounded across: lit as a surface, from both sides
  let up = vec3f(0.0, 1.0, 0.0);
  let face = up * sin(angle) - lean * cos(angle);
  (*v).normal = normalize(mix(face, up, 0.55) + across * side_of * 0.45);
  // spring greens, a tuft's own, some dry and gold
  let green = mix(vec3f(0.075, 0.2, 0.03), vec3f(0.17, 0.32, 0.045), fract(h.y * 3.7));
  let dry = smoothstep(0.72, 1.0, tuft) * 0.7 + smoothstep(0.75, 0.95, patchy) * 0.25;
  (*v).c0 = vec4f(mix(green, vec3f(0.36, 0.33, 0.1), dry), 0.0);
  (*v).c1 = vec4f(t, side_of, strands, h.x);
  (*v).c2 = vec4f(in_band, by_strand, 0.0, 0.0);
  (*v).position = vec3f(root.x, 0.0, root.y) + bent + wind;
  (*v).color = vec4f(1.0);
}

fn surface_hook(s: ptr<function, Surface>, in: VertexOut) -> bool {
  // (a profile's: the blades placed and none shaded)
  if (m.c[5].w > 0.5) { return false; }
  let blade = in.c1.xy;
  let strands = in.c1.zw;
  let growing = in.c2.xy;
  var along = blade.x;
  var across = abs(blade.y);
  // a far ring's sheet cut into strands
  if (m.c[5].z > 0.5 && strands.x > 1.5) {
    let strand_at = (blade.y * 0.5 + 0.5) * strands.x;
    let strand = floor(strand_at);
    let tall_by = fract(sin(strand * 12.9898 + strands.y * 78.233) * 43758.5453);
    let rises_at = fract(sin(strand * 39.346 + strands.y * 11.135) * 24634.6345) * m.c[5].y;
    let rising = mix(1.0, smoothstep(rises_at, rises_at + m.c[4].w, growing.x), growing.y);
    let tall = (1.0 - tall_by * m.c[5].x) * rising;
    along = blade.x / max(tall, 1e-3);
    across = abs(fract(strand_at) * 2.0 - 1.0);
    if (tall < 0.01 || along > 1.0 || across > 1.0 - pow(along, 2.5)) { return false; }
  }
  let shaded = in.c0.rgb * mix(0.3, 1.0, smoothstep(0.0, 0.55, along)) * (1.0 - across * across * 0.3);
  let midrib = vec3f(0.02, 0.03, 0.0) * (1.0 - smoothstep(0.04, 0.16, across)) * smoothstep(0.1, 0.4, along);
  (*s).base = vec4f(mix(shaded + midrib, vec3f(0.4, 0.36, 0.16), smoothstep(0.85, 1.0, along) * 0.35), 1.0);
  // (the face bent up is the lit one from either side: flipped on the back, every blade's back was dark)
  (*s).normal = normalize(in.normal);
  // (below the level that draws tufts: lit plainly, the engine's Surface.plain)
  (*s).plain = m.c[6].x;
  return true;
}
`,
};

const SWARD: RustShader = {
  name: 'meadow-sward',
  hooks: SHARED + /* wgsl */ `
fn vertex_hook(v: ptr<function, Vertex>, instance: u32) {}

fn surface_hook(s: ptr<function, Surface>, in: VertexOut) -> bool {
  let xz = in.world.xz;
  // (the material's colour less the vertices': those shade what's laid over it too)
  let tinted = max(in.color.rgb, vec3f(1e-4));
  let own = (*s).base.rgb / tinted;
  let patches = blade_noise(xz * 0.15) * 0.6 + blade_noise(xz * 0.9 + 4.0) * 0.4;
  let shade = own.g * 0.6 + 0.8;
  let sward = mix(vec3f(0.05, 0.11, 0.025), vec3f(0.11, 0.17, 0.04), patches) * shade;
  (*s).base = vec4f(mix(own, sward, smoothstep(0.1, 0.7, meadow_at(xz, m.c[0].x))) * tinted, (*s).base.a);
  return true;
}
`,
};

/** A ring's blades: its uniforms as `world/meadow.ts` sets them when its mesh is about to be drawn. */
export function bladeLook(u: BladeUniforms, combed: boolean, numbers: BladeNumbers, plain: () => boolean,
  one: OneNow | null): RustLook {
  return {
    shader: BLADES,
    maps: [u.uMeadow.value],
    position: 'bv',
    before: true,
    numbers(out) {
      out[AT.origin] = u.uOrigin.value.x; out[AT.origin + 1] = u.uOrigin.value.y;
      out[AT.focus] = u.uFocus.value.x; out[AT.focus + 1] = u.uFocus.value.y;
      out[AT.eye] = u.uEye.value.x; out[AT.eye + 1] = u.uEye.value.y;
      out[AT.cell] = u.uCell.value; out[AT.wider] = u.uWider.value;
      u.uBand.value.toArray(out, AT.band);
      out[AT.combed] = u.uCombed.value; out[AT.side] = u.uS.value;
      out[AT.byStrand] = u.uByStrand.value; out[AT.strandsBy] = u.uStrandsBy.value;
      out[AT.time] = u.uTime.value; out[AT.half] = u.uMeadowHalf.value;
      out[AT.widthInCells] = numbers.widthInCells; out[AT.grows] = numbers.grows;
      out[AT.strandCut] = numbers.strandCut; out[AT.strandsRise] = numbers.strandsRise;
      out[AT.cuts] = combed ? 1 : 0;
      out[AT.unshaded] = TUNE.grassShaded > 0 ? 0 : 1;
      out[AT.plain] = plain() && TUNE.grassPlain > 0 ? 1 : 0;
      out[AT.one] = one ? 1 : 0;
      out[AT.reach] = one?.reach ?? 0; out[AT.fall] = ONE_GRASS.fall; out[AT.high] = one?.high ?? 0;
      out[AT.least] = one?.least ?? 0;
    },
    // (the tiles drawn, a pair of floats each: any number of them, where the numbers held 80, so the tiles were
    // 9 to 21 m wide and every blade of one that touched the view was sent to be dropped as it was placed)
    list: () => u.uTileMap.value.image.data as Float32Array,
  };
}

/** The ground under the meadow: `mask` in the engine's first extra map. */
export function swardLook(mask: THREE.Texture, half: number): RustLook {
  return { shader: SWARD, maps: [mask], numbers(out) { out[0] = half; } };
}
