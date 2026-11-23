// A floor's relief under the Rust engine (`core/parallax.ts`'s walk as WGSL for a look's hook): the floor's height,
// kept in its roughness map's red, read along the view ray, so the grout between the crypt's cobbles and the soil
// round the forest's pebbles lie sunk below their tops and shift against them as the view moves. A look puts
// `RELIEF` among its hooks, calls `relief_at` first in its `surface_hook` (the surface's maps are read again where
// the ray meets the relief) and writes `reliefNumbers` into four of its floats.
import { reliefStepsNow, type FloorRelief } from '../../core/parallax';

/** `relief_at(s, in, relief)`: the surface's colour, roughness, metalness and normal read where the view ray meets
 *  the relief; the place on the maps it's met at. `relief`: how deep, m; the maps' tiles a metre; how far from the
 *  eye it fades out, m; the most steps down the ray (0: none). */
export const RELIEF = /* wgsl */ `
// (walked down from the tops a layer at a time, then between the last two layers where it crossed: the height's
// map's red is 1 at the tops, 0 at the lowest. The gradients are the floor's own: inside a loop the GPU's are
// undefined, and the moved place jumps at each stone's edge)
fn relief_uv(uv: vec2f, dx: vec2f, dy: vec2f, world: vec3f, relief: vec4f) -> vec2f {
  var to_eye = g.cam_pos.xyz - world;
  let dist = length(to_eye);
  to_eye = to_eye / dist;
  let depth = relief.x * (1.0 - smoothstep(relief.z * 0.6, relief.z, dist));
  if (relief.w <= 0.0 || depth <= 0.0 || to_eye.y <= 0.0) { return uv; }
  // (a metre down the ray moves it this far over the floor, on the maps: away from the eye; v runs along -z)
  let slide = vec2f(-to_eye.x, to_eye.z) / max(to_eye.y, 0.25) * relief.y;
  let n = max(1.0, floor(mix(relief.w * 0.5, relief.w, 1.0 - to_eye.y)));
  let layer = 1.0 / n;
  let step_uv = slide * depth * layer;
  var at = uv;
  var ray = 0.0;
  var surface = 1.0 - textureSampleGrad(t_orm, samp, at, dx, dy).r;
  if (surface <= 0.0) { return uv; }
  for (var i = 0; i < 64; i++) {
    if (f32(i) >= n) { break; }
    let next = at + step_uv;
    let next_ray = ray + layer;
    let next_surface = 1.0 - textureSampleGrad(t_orm, samp, next, dx, dy).r;
    if (next_ray >= next_surface) {
      let above = surface - ray;
      let below = next_ray - next_surface;
      return at + step_uv * clamp(above / max(above + below, 1e-4), 0.0, 1.0);
    }
    at = next;
    ray = next_ray;
    surface = next_surface;
  }
  return at;
}

fn relief_at(s: ptr<function, Surface>, in: VertexOut, relief: vec4f) -> vec2f {
  let dx = dpdx(in.uv);
  let dy = dpdy(in.uv);
  // (the plain levels read no maps: no relief either)
  if (relief.w <= 0.0 || g.shelter_lit.z > 1.5) { return in.uv; }
  let at = relief_uv(in.uv, dx, dy, in.world, relief);
  (*s).base = m.base * in.color * textureSampleGrad(t_base, samp, at, dx, dy);
  let orm = textureSampleGrad(t_orm, samp, at, dx, dy);
  (*s).roughness = m.params.x * orm.g;
  (*s).metalness = m.params.y * orm.b;
  var up = normalize(in.normal);
  if (dot(up, g.cam_pos.xyz - in.world) < 0.0) { up = -up; }
  (*s).normal = mapped_normal(up, in.world, in.uv, textureSampleGrad(t_normal, samp, at, dx, dy).xyz);
  return at;
}
`;

/** A floor's relief written into a look's floats at `at`, the steps the quality asks for now. */
export function reliefNumbers(out: Float32Array, at: number, relief: FloorRelief): void {
  out[at] = relief.depth;
  out[at + 1] = relief.perMetre;
  out[at + 2] = relief.fade;
  out[at + 3] = reliefStepsNow();
}
