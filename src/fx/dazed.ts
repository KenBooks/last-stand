// A dazed foe's stars: three small stars floating round over its head, fading as it comes to. Plain stars, drawn as
// they are and not as lights: four glows each leaving a trail made a bright ring over every dazed foe (a crowd dazed
// at once was a field of them). Drawn each frame from where they are then, one draw for every dazed foe.
import * as THREE from 'three';
import { G } from '../state';
import { pointScale } from '../core/renderer';
import { WEBGPU } from '../core/webgpu';
import { starQuads, type StarQuads } from './particleNodes';

const VERT = /* glsl */`
  attribute float aSize;
  attribute float aAlpha;
  varying float vAlpha;
  uniform float uScale;
  void main(){
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // (gone near the lens, as every particle: in first person a foe's head is at the camera's height)
    vAlpha = aAlpha * smoothstep(0.5, 3.5, -mv.z);
    gl_PointSize = aSize * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;

const FRAG = /* glsl */`
  varying float vAlpha;
  uniform vec3 uFill;
  uniform vec3 uRim;
  // how far p is outside a five-pointed star of radius r, its inner points rf of the way in (inside: less than 0)
  float star(vec2 p, float r, float rf) {
    const vec2 k1 = vec2(0.809016994375, -0.587785252292);
    const vec2 k2 = vec2(-k1.x, k1.y);
    p.x = abs(p.x);
    p -= 2.0 * max(dot(k1, p), 0.0) * k1;
    p -= 2.0 * max(dot(k2, p), 0.0) * k2;
    p.x = abs(p.x);
    p.y -= r;
    vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
    float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
    return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
  }
  void main(){
    vec2 p = vec2(gl_PointCoord.x - 0.5, 0.5 - gl_PointCoord.y) * 2.0;
    float d = star(p, 0.95, 0.45);
    float a = 1.0 - smoothstep(-0.06, 0.06, d);
    if (a <= 0.0) discard;
    // (a darker rim, so a star reads on a pale floor too)
    vec3 c = mix(uRim, uFill, 1.0 - smoothstep(-0.3, -0.12, d));
    gl_FragColor = vec4(c, vAlpha * a);
  }`;

/** how fast they go round (rad/s), how far out from the head's middle (m), how far they rise and fall (m), the last
 *  seconds they fade over, how many, and how big each is (m: smaller, they were dots from the top-down camera) */
const SPIN = 1.8, ORBIT = 0.42, BOB = 0.06, FADE = 0.25, STARS = 3, SIZE = 0.26;
/** the most stars drawn in a frame: a crowd of dazed foes */
const MOST = STARS * 160;

const pos = new Float32Array(MOST * 3), size = new Float32Array(MOST), alpha = new Float32Array(MOST);
// (an instance's on WebGPU, a quad each: it draws points a pixel wide; a vertex's for WebGL's points)
const Attribute = WEBGPU ? THREE.InstancedBufferAttribute : THREE.BufferAttribute;
const attrs = [
  new Attribute(pos, 3).setUsage(THREE.DynamicDrawUsage),
  new Attribute(size, 1).setUsage(THREE.DynamicDrawUsage),
  new Attribute(alpha, 1).setUsage(THREE.DynamicDrawUsage),
];
const geo = new THREE.BufferGeometry();
geo.setAttribute('position', attrs[0]);
geo.setAttribute('aSize', attrs[1]);
geo.setAttribute('aAlpha', attrs[2]);
geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
const mat = new THREE.ShaderMaterial({
  vertexShader: VERT, fragmentShader: FRAG,
  uniforms: { uScale: { value: 400 }, uFill: { value: new THREE.Color(0xffe27a) }, uRim: { value: new THREE.Color(0xc07818) } },
  transparent: true, depthWrite: false,
});
let quads: StarQuads | null = null;
let points: THREE.Object3D = new THREE.Points(geo, mat);

/** the stars' mesh made for the renderer that draws it (WebGPU's quads are nodes, made once it's loaded) */
function madeForRenderer(): void {
  if (WEBGPU) {
    quads = starQuads(attrs as THREE.InstancedBufferAttribute[], mat.uniforms.uFill.value, mat.uniforms.uRim.value);
    points = quads.mesh;
  }
  points.name = 'dazed stars';
  points.frustumCulled = false;
  points.renderOrder = 10;
}
/** the stars set this frame */
let count = 0;

/** The stars over a head at `x`, `y`, `z` at time `t`, with `left` seconds of the daze to go. */
export function dazedStars(x: number, y: number, z: number, t: number, left: number): void {
  const k = Math.min(1, left / FADE);
  for (let i = 0; i < STARS && count < MOST; i++, count++) {
    const a = t * SPIN + i * Math.PI * 2 / STARS;
    pos[count * 3] = x + Math.cos(a) * ORBIT;
    pos[count * 3 + 1] = y + Math.sin(t * 2.2 + i * 2.1) * BOB;
    pos[count * 3 + 2] = z + Math.sin(a) * ORBIT;
    size[count] = SIZE * (0.6 + 0.4 * k);
    alpha[count] = k;
  }
}

/** The dazed foes' stars, drawn among the particles (`fx/particles.ts`): put in the scene, drawn as each frame set
 *  them, and none. */
export const dazedField = {
  init(scene: THREE.Scene): void {
    madeForRenderer();
    scene.add(points);
  },
  /** this frame's stars drawn, the next frame's set afresh */
  update(): void {
    geo.setDrawRange(0, count);
    if (quads) quads.geo.instanceCount = count;
    // (not drawn while there are none, a draw call of nothing; shown through the boot's warm-up, which runs no update)
    points.visible = count > 0;
    if (count) for (const a of attrs) { a.clearUpdateRanges(); a.addUpdateRange(0, count * a.itemSize); a.needsUpdate = true; }
    mat.uniforms.uScale.value = pointScale();
    if (quads) quads.scale.value = pointScale();
    count = 0;
  },
  clear(): void {
    count = 0;
    geo.setDrawRange(0, 0);
    if (quads) quads.geo.instanceCount = 0;
  },
};
