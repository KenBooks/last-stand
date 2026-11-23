// The village's meadow under the Rust engine: `world/meadowNodes.ts`'s nodes as WGSL for the engine's hooks, written
// line for line: the blades placed from their instance's cell (`BLADES`), and the ground's sward under them (`SWARD`).
// A blade is placed once a frame (`place_hook`: where it roots, whether it's shown, how tall, which way it leans),
// by a pass of the engine's ahead of the draw, and only those kept are drawn, each vertex shaping the blade from
// what was placed (`vertex_hook`). Placed at every vertex, a blade of nine was placed nine times in every pass
// that drew it, one dropped as often as one kept: on a phone over the shoulder at Very low the grass was 8.4 ms
// of a 16.8 ms frame, 1.7 of it its shading (J0RW-1EP5, SSB2-NWEB).
import type * as THREE from 'three';
import type { BladeNumbers, BladeUniforms } from '../../world/meadowNodes';
import type { RustLook, RustShader } from '../custom';
import { TUNE } from '../globals';
import { ONE_GRASS } from '../../world/meadowOne';
import { noiseTable, noiseWgsl } from './noiseTable';

/** The one grass's numbers as a ring is drawn (`world/meadowOne.ts`): the camera's height over the ground and
 *  how far from it all the grass is kept, and the least share of it kept however far. */
export interface OneNow { high: number; reach: number; least: number; tuft: number; pixel: number }

/** where a ring's numbers are in `m.c`, in floats */
const AT = { origin: 0, focus: 2, eye: 4, cell: 6, wider: 7, band: 8, combed: 12, side: 13, byStrand: 14, strandsBy: 15,
  time: 16, half: 17, widthInCells: 18, grows: 19, strandCut: 20, strandsRise: 21, cuts: 22, unshaded: 23, plain: 24,
  one: 25, reach: 26, fall: 27, high: 28, least: 29, pixel: 30, tuft: 31 };

/** a tuft's card as `world/meadow.ts` has it (its `TUFT_*`): the bins across it, two blades rooted in each, how far
 *  a half's blades fan out, a blade's half width at its root as a share of the card's, the card's width against a
 *  whole blade's, how much taller a tuft stands, and how its blades rise through a hand-over */
const TUFT = { bins: 14, fan: 0.3, blade: 0.2, card: 2.2, taller: 1.75, rise: 0.55, grows: 0.15 };
const TUFT_WGSL = `
const TUFT_BINS = ${TUFT.bins.toFixed(1)};
const TUFT_FAN = ${TUFT.fan};
const TUFT_BLADE = ${TUFT.blade};
const TUFT_CARD = ${TUFT.card};
const TUFT_TALLER = ${TUFT.taller};
const TUFT_RISE = ${TUFT.rise};
const TUFT_GROWS = ${TUFT.grows};
`;

const SHARED = /* wgsl */ `
fn blade_hash(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453); }
${noiseWgsl('ground_noise', 't_extra1')}
// (the value noises read from the table, noiseTable.ts: red the blades' hash, green the mask's)
fn blade_noise(p: vec2f) -> f32 { return ground_noise_r(p); }
fn meadow_noise(p: vec2f) -> f32 { return ground_noise_g(p); }
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
  hooks: SHARED + TUFT_WGSL + /* wgsl */ `
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

/// A blade placed: a (its root on the ground, its height, its width), b (the way it leans, two of its cell's
/// numbers), c (a third, how far into its ring's band it is, its tuft's number, its patch's).
fn place_hook(instance: u32, list: u32, p: ptr<function, Placed>) -> bool {
  let origin = m.c[0].xy;
  let focus = m.c[0].zw;
  // (one grass for every view, world/meadowOne.ts: a ring's cell is as many of the finest as its cells are wider,
  // and its blade that cell's own, as wide as the first ring's)
  let one = m.c[6].y > 0.5;
  let cells_wide = m.c[1].w;
  let cell = select(m.c[1].z, m.c[1].z / cells_wide, one);
  let wider = select(cells_wide, 1.0, one);
  let band = m.c[2];
  let combed_now = m.c[3].x;
  let side = max(u32(m.c[3].y), 1u);
  let span = m.c[4].y;
  let grows_over = m.c[4].w;

  let listed = instance / (side * side);
  // (its tile from the draw's list, eight tiles a row: RustLook.list)
  let pair = bones[list + listed / 8u][(listed % 8u) / 2u];
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
  // (a blade out of its ring's band is left out here, ahead of the mask's reads)
  if (in_band <= 0.0) { return false; }
  let grass = meadow_at(root, span);
  let mask_uv = root / (span * 2.0) + 0.5;
  let grows = mask_at(mask_uv);
  let patchy = blade_noise(root * 0.15) * 0.65 + blade_noise(root * 0.55 + 9.1) * 0.35;
  let chance = smoothstep(0.08, 0.6, grass) * smoothstep(0.3, 0.7, grows) * mix(0.75, 1.0, smoothstep(0.25, 0.7, patchy));
  // (a tuft's card, where the level draws them: thin blades cut from it as it's shaded, each its own way)
  let tufted = step(1.5, m.c[7].w);
  let by_strand = m.c[3].z * combed_now * max(step(1.5, wider), tufted);
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
  if (shown <= 0.0) { return false; }
  let height = shown * mix(1.0, TUFT_TALLER, tufted) * mix(0.2, 0.46, h.w) * mix(0.55, 1.0, grass) * mix(0.75, 1.25, tuft)
    * mix(0.8, 1.15, patchy);
  let width = shown * cell * wider * m.c[4].z * mix(0.8, 1.25, fract(h.z * 7.13)) * mix(1.0, TUFT_CARD, tufted);
  let turn = h.w * 6.2832 + h.x * 3.0;
  // (at the meadow's edge a blade leans away from it, into the grass)
  let aside = 0.35 / (span * 2.0);
  let inward = vec2f(mask_at(mask_uv + vec2f(aside, 0.0)) - mask_at(mask_uv - vec2f(aside, 0.0)),
    mask_at(mask_uv + vec2f(0.0, aside)) - mask_at(mask_uv - vec2f(0.0, aside)));
  let edge = clamp(length(inward) * 3.0, 0.0, 1.0);
  let lean2 = normalize(mix(vec2f(cos(turn), sin(turn)), normalize(inward + 1e-5), edge * 0.85));
  (*p).a = vec4f(root, height, width);
  (*p).b = vec4f(lean2, h.xy);
  (*p).c = vec4f(h.z, in_band, tuft, patchy);
  return true;
}

/// A blade's vertex, from the blade as placed: bent along its lean, turned a little to the camera, in the wind.
fn vertex_hook(v: ptr<function, Vertex>, instance: u32) {
  let placed = (*v).placed;
  let root = placed.a.xy;
  let height = placed.a.z;
  let width = placed.a.w;
  let lean2 = placed.b.xy;
  let h = vec3f(placed.b.zw, placed.c.x);
  let in_band = placed.c.y;
  let tuft = placed.c.z;
  let patchy = placed.c.w;
  let eye = m.c[1].xy;
  let wider = select(m.c[1].w, 1.0, m.c[6].y > 0.5);
  let combed_now = m.c[3].x;
  let time = m.c[4].x;
  let tufted = step(1.5, m.c[7].w);
  let by_strand = m.c[3].z * combed_now * max(step(1.5, wider), tufted);
  let shape = (*v).position;
  let lean = vec3f(lean2.x, 0.0, lean2.y);
  // seen edge on, a blade turns up to a third of the way to the camera
  let to_cam = normalize(eye - root + 1e-4);
  let across0 = vec2f(lean2.y, -lean2.x);
  let facing = vec2f(-to_cam.y, to_cam.x);
  let facing_by = sign(dot(facing, across0) + 1e-4);
  let turned = normalize(mix(across0, facing * facing_by, (1.0 - abs(dot(to_cam, lean2))) * 0.35 * (1.0 - tufted)));
  let across = vec3f(turned.x, 0.0, turned.y);
  let t = shape.x;
  let side_of = shape.y;
  // (a tuft's card stands nearly upright, its blades each arcing their own way within it)
  let tilt = (fract(h.x * 13.1) * 0.35 + 0.12) * mix(1.0, 0.4, tufted);
  let bend_by = (fract(h.y * 7.7) * 0.7 + 0.35) * mix(1.0, 0.45, tufted);
  let mid = tilt + bend_by * t * 0.5;
  let angle = tilt + bend_by * t;
  let strands = combed_now * wider * wider * m.c[3].w;
  let w = width * select(1.0 - pow(t, 2.5), 1.0, strands > 1.5 || tufted > 0.5);
  // (a tuft's card bent along its middle, by a share of its own, opening a little wider at its top)
  let folded = lean * ((1.0 - abs(side_of)) * w * (fract(h.z * 3.9) - 0.5) * 0.9 * tufted * (1.0 + 0.6 * t));
  let bent = across * (side_of * w * 0.5) + lean * (t * height * sin(mid)) + vec3f(0.0, t * height * cos(mid), 0.0)
    + folded;
  // the wind: gusts rolling across the meadow and a flutter a blade, bending by the square of t
  let roll = sin(time * 1.5 - root.x * 0.21 - root.y * 0.14) * 0.5 + 0.5;
  let flutter = sin(time * 5.1 + h.y * 6.2832) * 0.25;
  var wind = vec3f(0.83, 0.0, 0.55) * (t * t * height * (roll * 0.5 + flutter * 0.3 + 0.1));
  if (tufted > 0.5) {
    // (a tuft's: gusts, patches of moving air that travel downwind, the grass near upright between them; its
    // card barely flutters and sways mostly in its own plane: world/meadow.ts VERTEX_BLADE)
    let downwind = vec2f(0.83, 0.55);
    let veer = (blade_noise(root * 0.035 + time * 0.03) - 0.5) * 2.4;
    let wind_way = vec2f(downwind.x * cos(veer) - downwind.y * sin(veer), downwind.x * sin(veer) + downwind.y * cos(veer));
    let gust = blade_noise(root * 0.11 - downwind * time * 0.3) * 0.65 + blade_noise(root * 0.37 - downwind * time * 0.5) * 0.35;
    let blowing = smoothstep(0.42, 0.78, gust);
    let beat = sin(time * 1.7 + h.y * 6.2832) * (0.04 + 0.16 * blowing) * 0.25;
    let sway = turned * dot(wind_way, turned);
    wind = vec3f(sway.x, 0.0, sway.y) * (t * t * height * (blowing * 0.1 + beat * 0.5 + 0.015));
  }
  // its upper face along the arc, rounded across: lit as a surface, from both sides
  let up = vec3f(0.0, 1.0, 0.0);
  let face = up * sin(angle) - lean * cos(angle);
  // (a tuft's card is lit as the ground under it, nearly: by its own face a whole tuft stood pale and the next
  // near black)
  (*v).normal = normalize(mix(face, up, mix(0.55, 0.9, tufted)) + across * side_of * 0.45 * (1.0 - tufted));
  // spring greens, a tuft's own, some dry and gold
  let green = mix(vec3f(0.075, 0.2, 0.03), vec3f(0.17, 0.32, 0.045), fract(h.y * 3.7));
  let dry = smoothstep(0.72, 1.0, tuft) * 0.7 + smoothstep(0.75, 0.95, patchy) * 0.25;
  (*v).c0 = vec4f(mix(green, vec3f(0.36, 0.33, 0.1), dry), 0.0);
  if (tufted > 0.5) {
    // (a tuft's greens: lush to fresh, a tuft in ten dry)
    let lush = mix(vec3f(0.07, 0.127, 0.024), vec3f(0.108, 0.162, 0.03), fract(h.y * 3.7));
    let straw = smoothstep(0.86, 1.0, tuft) * 0.25 + smoothstep(0.8, 0.97, patchy) * 0.12;
    (*v).c0 = vec4f(mix(lush, vec3f(0.2, 0.18, 0.075), straw), 0.0);
  }
  (*v).c1 = vec4f(t, side_of, strands, h.x);
  // (a pixel's width across the card where the tuft is rooted, the same at its every corner: which of its
  // blades are left out far off goes by this)
  let pixel_wide = length(g.cam_pos.xyz - vec3f(root.x, 0.0, root.y)) * m.c[7].z;
  (*v).c2 = vec4f(in_band, by_strand, tufted, 0.75 * pixel_wide / max(width, 1e-4));
  (*v).position = vec3f(root.x, 0.0, root.y) + bent + wind;
  (*v).color = vec4f(1.0);
}

fn surface_hook(s: ptr<function, Surface>, in: VertexOut) -> bool {
  // (across the card, a pixel's width: asked before anything is left out)
  let pixel_across = fwidth(in.c1.y);
  // (a profile's: the blades placed and none shaded)
  if (m.c[5].w > 0.5) { return false; }
  let blade = in.c1.xy;
  let strands = in.c1.zw;
  let growing = in.c2.xy;
  var along = blade.x;
  var across = abs(blade.y);
  // a tuft's card: thin blades rooted all across it, two a bin, each near upright with a lean and a curve of its
  // own, those of each half fanning a little from its middle; only the bins a blade here could have come from are
  // tried (world/meadow.ts FRAGMENT_COLOUR, line for line)
  var fold = blade.y;
  var strand_shade = 0.5;
  let tufted = in.c2.z > 0.5;
  if (m.c[5].z > 0.5 && tufted) {
    let card_seed = floor(strands.y * 1024.0 + 0.5) / 1024.0;
    let u = blade.y * 0.5 + 0.5;
    // (no blade thinner than a pixel: thinner, far tufts broke into single pixels that came and went)
    let pixel = pixel_across * 0.5 * 0.75;
    let from_zone = (floor(u * 2.0) + 0.5) * 0.5;
    let came_from = from_zone + (u - from_zone) / (1.0 + TUFT_FAN * min(blade.x / 0.75, 1.0));
    let bin0 = floor(came_from * TUFT_BINS);
    var nearest = 2.0;
    var which = 0.0;
    for (var j = -2; j <= 2; j++) {
      let bin = bin0 + f32(j);
      if (bin < 0.0 || bin >= TUFT_BINS) { continue; }
      for (var i = 0; i < 2; i++) {
        let id = bin * 2.0 + f32(i);
        let r1 = fract(sin(id * 12.9898 + card_seed * 78.233) * 43758.5453);
        let r2 = fract(r1 * 7.31 + id * 0.618);
        let r3 = fract(r2 * 5.13 + id * 0.37);
        let tall = mix(0.4, 1.0, r1) * mix(1.0, smoothstep(r2 * TUFT_RISE, r2 * TUFT_RISE + TUFT_GROWS, growing.x), growing.y);
        let a = blade.x / max(tall, 0.01);
        if (a > 1.0) { continue; }
        let root_at = mix(0.08, 0.92, (bin + r3) / TUFT_BINS);
        let zone = (floor(root_at * 2.0) + 0.5) * 0.5;
        let middle = root_at + (root_at - zone) * TUFT_FAN * a + ((r2 - 0.5) * 1.7 * a + (r3 - 0.5) * 2.2 * a * a) / TUFT_BINS;
        // (as wide most of its length, then to a point)
        let thin = TUFT_BLADE / TUFT_BINS * (1.0 - pow(a, 3.0));
        // (a blade thinner than a pixel is drawn a pixel wide, and as many fewer of them)
        let drop_pixel = in.c2.w;
        if (thin < drop_pixel && fract(r3 * 9.71 + r1 * 3.3) > thin / drop_pixel) { continue; }
        let half_wide = max(thin, pixel);
        let off = (u - middle) / half_wide;
        if (abs(off) < abs(nearest)) {
          nearest = off;
          which = id;
          along = a;
        }
      }
    }
    if (abs(nearest) > 1.0) { return false; }
    across = abs(nearest);
    fold = nearest;
    strand_shade = fract(sin(which * 7.31 + card_seed * 41.7) * 9631.17);
    var colour = in.c0.rgb * mix(0.68, 1.1, smoothstep(0.0, 0.85, along)) * (1.0 - across * across * 0.3);
    // (a blade in six straw, among a tuft's green)
    colour = mix(colour, vec3f(0.19, 0.185, 0.07) * mix(0.68, 1.05, smoothstep(0.0, 0.85, along)), step(0.84, strand_shade) * 0.4);
    colour += vec3f(0.02, 0.03, 0.0) * (1.0 - smoothstep(0.04, 0.16, across)) * smoothstep(0.1, 0.4, along);
    colour = mix(colour, vec3f(0.3, 0.27, 0.11), smoothstep(0.85, 1.0, along) * 0.2);
    // (folded along its midrib: one half of the V faces the light more than the other; each blade its own shade)
    colour *= mix(0.9, 1.06, step(0.0, fold)) * mix(0.8, 1.12, strand_shade);
    (*s).base = vec4f(colour, 1.0);
    (*s).normal = normalize(in.normal);
    // (matte: a card's face is no blade's, and its shine lit a whole tuft pale)
    (*s).roughness = 1.0;
    (*s).specular = 0.0;
    return true;
  }
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
    maps: [u.uMeadow.value, noiseTable()],
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
      out[AT.pixel] = one?.pixel ?? 0; out[AT.tuft] = one && combed ? one.tuft : 1;
    },
    // (the tiles drawn, a pair of floats each: any number of them, where the numbers held 80, so the tiles were
    // 9 to 21 m wide and every blade of one that touched the view was sent to be dropped as it was placed)
    list: () => u.uTileMap.value.image.data as Float32Array,
  };
}

/** The ground under the meadow: `mask` in the engine's first extra map. */
export function swardLook(mask: THREE.Texture, half: number): RustLook {
  return { shader: SWARD, maps: [mask, noiseTable()], numbers(out) { out[0] = half; } };
}
