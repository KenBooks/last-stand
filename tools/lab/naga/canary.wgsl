// `lab naga`'s canary: the shape that kept the meadow blades from Firefox (report V1T3-G00X, #938), which naga 30
// refuses as it runs a pipeline's constants: a constant vector's `let` read a part at a time, in a module with an
// override. The checker must refuse it, or it checks nothing.
override LAYER_PART: f32 = 0.0;
@group(0) @binding(0) var<uniform> u: vec4f;
fn hook(p: ptr<function, vec3f>) {
  var wind = vec3f(0.0);
  if (u.x > 0.5) {
    let downwind = vec2f(0.83, 0.55);
    let veer = sin(u.y);
    let way = vec2f(downwind.x * cos(veer) - downwind.y * sin(veer), downwind.x * sin(veer));
    wind = vec3f(way.x, 0.0, way.y);
  }
  *p += wind;
}
@vertex fn vs_main(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  var p = vec3f(f32(i), LAYER_PART, 0.0);
  hook(&p);
  return vec4f(p, 1.0);
}
