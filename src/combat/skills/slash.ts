// Blade arcs for the warrior's skills that throw or spin one (Thunder Crescent, Steel Tempest, Bull Rush's wedge): a
// flat ring segment whose glowing head sweeps across it, leaving a fading trail, or that glows all along. A cut's mark
// is the trail its blade leaves (fx/swingTrail.ts): an arc of its own, laid flat at its tip's height, drew a second
// one, level across the view while the cut through the eyes ran down it.
import * as THREE from 'three';
import { nearGlow } from '../../core/materials';
import { portShader } from '../../core/shaderPorts';

function slashMaterial(color: THREE.ColorRepresentation): THREE.ShaderMaterial {
  return portShader(nearGlow(new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) }, uProg: { value: 0 }, uFade: { value: 1 }, uDir: { value: 1 },
      uStart: { value: 0 }, uLen: { value: 1 }, uInner: { value: 0.3 }, uEven: { value: 0 },
    },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      varying vec2 vP;
      void main(){ vP = vec2(position.x, -position.z); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      varying vec2 vP;
      uniform vec3 uColor; uniform float uProg, uFade, uDir, uStart, uLen, uInner, uEven;
      void main(){
        // vP is the ring's own plane (the geometry was laid flat): position along the arc (0..1, in
        // the sweep direction) and across it (inner 0 .. outer 1); the inner radius is > 0, so atan
        // never sees (0, 0), and arcs up to PI stay inside atan's range
        float a = clamp((atan(vP.y, vP.x) - uStart) / uLen, 0.0, 1.0);
        if (uDir < 0.0) a = 1.0 - a;
        float r = clamp((length(vP) - uInner) / (1.0 - uInner), 0.0, 1.0);
        float behind = uProg - a;
        if (behind < 0.0) discard;
        // a sweep fades behind its head; an even arc (a travelling crescent) glows all along
        float trail = mix(exp(-behind * 5.0), 1.0, uEven);
        float edge = pow(r, 3.0) * 1.4 + r * 0.25;
        float tips = smoothstep(0.0, 0.08, a) * (1.0 - smoothstep(0.92, 1.0, a));
        float i = trail * edge * tips * uFade;
        gl_FragColor = vec4(mix(uColor, vec3(1.0), trail * r * 0.3) * i * 1.3, i);
      }`,
  })), ({ wgslFn, positionGeometry, vec2, varying }, u) => ({
    fragment: wgslFn(`fn slashArc(p: vec2f, color: vec3f, prog: f32, fade: f32, dir: f32, start: f32, len: f32,
      inner: f32, even: f32) -> vec4f {
      var a = clamp((atan2(p.y, p.x) - start) / len, 0.0, 1.0);
      if (dir < 0.0) { a = 1.0 - a; }
      let r = clamp((length(p) - inner) / (1.0 - inner), 0.0, 1.0);
      let behind = prog - a;
      if (behind < 0.0) { discard; }
      let trail = mix(exp(-behind * 5.0), 1.0, even);
      let edge = pow(r, 3.0) * 1.4 + r * 0.25;
      let tips = smoothstep(0.0, 0.08, a) * (1.0 - smoothstep(0.92, 1.0, a));
      let i = trail * edge * tips * fade;
      return vec4f(mix(color, vec3f(1.0), trail * r * 0.3) * i * 1.3, i);
    }`)({
      p: varying(vec2(positionGeometry.x, positionGeometry.z.negate())), color: u.uColor, prog: u.uProg,
      fade: u.uFade, dir: u.uDir, start: u.uStart, len: u.uLen, inner: u.uInner, even: u.uEven,
    }),
  }));
}

/** Ring segment of `arc` radians centred on local +Z after laying it flat, outer radius 1. */
function arcGeometry(arc: number, inner: number): THREE.BufferGeometry {
  // flat on the ground: local (x, y) maps to world (x, -z), so +Z is at angle -PI/2
  return new THREE.RingGeometry(inner, 1, 40, 1, -Math.PI / 2 - arc / 2, arc).rotateX(-Math.PI / 2);
}

/** A persistent arc the caller drives (spins, moves) through the returned mesh and uniforms; its
 *  head is at the +heading end (see SlashOpts.dir), or it glows evenly when `even`. */
export function slashMesh(arc: number, inner: number, color: THREE.ColorRepresentation, even = false): { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; dispose(): void } {
  const geo = arcGeometry(arc, inner);
  const mat = slashMaterial(color);
  const u = mat.uniforms;
  u.uStart.value = -Math.PI / 2 - arc / 2; u.uLen.value = arc; u.uInner.value = inner; u.uProg.value = 1; u.uEven.value = even ? 1 : 0;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return { mesh, mat, dispose() { geo.dispose(); mat.dispose(); } };
}

/** Shortest angle between two headings. */
export const angleBetween = (a: number, b: number): number => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
