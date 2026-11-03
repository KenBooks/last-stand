// A drawn shot's aim preview: a thin red line along the path the arrow would fly if it were loosed now, with a dot
// where it would strike. The line keeps the same few pixels' width at any distance (widened in the vertex shader in
// screen space), so it reads from the top-down camera and stays a hairline through the eyes; it fades out near the
// camera (through the eyes it starts at the bow, under the view) and eases in and out, never flashing. It isn't
// dimmed with distance (`nearGlow`): a fixed width in pixels never grows to fill the view up close.
import * as THREE from 'three';
import { G } from '../state';
import { addEffect } from './effects';
import { sceneRatio, sceneSize } from '../core/renderer';
import { portShader, type Tsl } from '../core/shaderPorts';

/** the line's and the dot's width (css px), how bright and opaque, how quickly it eases in and out (s) */
const WIDTH = 2, DOT = 7, GLOW = 1.6, ALPHA = 0.7, EASE_IN = 0.12, EASE_OUT = 0.18;
/** the line fades in over this range of distance from the camera (m) */
const NEAR0 = 0.8, NEAR1 = 3;
const COLOR = new THREE.Color(0xff2414);
/** at most this many lines (a fan's five), each of this many points */
export const LASER_LINES = 5, LASER_POINTS = 160;

const lineVert = /* glsl */`
  attribute vec3 next; attribute float side; attribute float along;
  uniform vec2 uRes; uniform float uWidth; uniform float uNear0; uniform float uNear1;
  varying float vFade; varying float vSide;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec4 a = projectionMatrix * mv, b = projectionMatrix * modelViewMatrix * vec4(next, 1.0);
    // across the line on screen, a fixed number of pixels
    vec2 d = (b.xy / max(b.w, 1e-4) - a.xy / max(a.w, 1e-4)) * uRes;
    float l = length(d);
    vec2 n = l > 1e-5 ? vec2(-d.y, d.x) / l : vec2(0.0, 1.0);
    a.xy += n * side * uWidth / uRes * a.w;
    gl_Position = a;
    vFade = smoothstep(uNear0, uNear1, -mv.z) * (1.0 - smoothstep(0.8, 1.0, along));
    vSide = side;
  }`;
const lineFrag = /* glsl */`
  uniform vec3 uColor; uniform float uAlpha;
  varying float vFade; varying float vSide;
  void main() {
    // soft across its width: brightest down the middle
    float k = 1.0 - vSide * vSide;
    gl_FragColor = vec4(uColor * (0.35 + 0.65 * k), uAlpha * clamp(vFade, 0.0, 1.0) * (0.4 + 0.6 * k));
  }`;
const dotVert = /* glsl */`
  attribute vec2 corner;
  uniform vec2 uRes; uniform float uWidth;
  varying vec2 vC;
  void main() {
    vec4 a = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    a.xy += corner * uWidth / uRes * a.w;
    gl_Position = a;
    vC = corner;
  }`;
const dotFrag = /* glsl */`
  uniform vec3 uColor; uniform float uAlpha;
  varying vec2 vC;
  void main() {
    float r = length(vC), core = 1.0 - smoothstep(0.25, 0.45, r), halo = 1.0 - smoothstep(0.3, 1.0, r);
    gl_FragColor = vec4(uColor * (0.5 + 1.2 * core), uAlpha * max(core, halo * 0.45));
  }`;

// The line and the dot on WebGPU (core/shaderPorts.ts), the shaders above in WGSL
function linePort(t: Tsl, u: Tsl) {
  const { wgslFn, attribute, positionGeometry, modelViewMatrix, cameraProjectionMatrix, varying } = t;
  const vertex = wgslFn(`fn laserLine(pos: vec3f, next: vec3f, side: f32, mv: mat4x4f, proj: mat4x4f, res: vec2f,
    width: f32) -> vec4f {
    let a = proj * mv * vec4f(pos, 1.0);
    let b = proj * mv * vec4f(next, 1.0);
    let d = (b.xy / max(b.w, 1e-4) - a.xy / max(a.w, 1e-4)) * res;
    let l = length(d);
    var n = vec2f(0.0, 1.0);
    if (l > 1e-5) { n = vec2f(-d.y, d.x) / l; }
    return vec4f(a.xy + n * side * width / res * a.w, a.zw);
  }`);
  const fade = wgslFn(`fn laserFade(pos: vec3f, along: f32, mv: mat4x4f, near0: f32, near1: f32) -> f32 {
    let z = -(mv * vec4f(pos, 1.0)).z;
    return smoothstep(near0, near1, z) * (1.0 - smoothstep(0.8, 1.0, along));
  }`);
  const colour = wgslFn(`fn laserLineColour(fade: f32, side: f32, color: vec3f, alpha: f32) -> vec4f {
    let k = 1.0 - side * side;
    return vec4f(color * (0.35 + 0.65 * k), alpha * clamp(fade, 0.0, 1.0) * (0.4 + 0.6 * k));
  }`);
  const side = attribute('side', 'float');
  return {
    vertex: vertex({
      pos: positionGeometry, next: attribute('next', 'vec3'), side, mv: modelViewMatrix, proj: cameraProjectionMatrix,
      res: u.uRes, width: u.uWidth,
    }),
    fragment: colour({
      fade: varying(fade({ pos: positionGeometry, along: attribute('along', 'float'), mv: modelViewMatrix,
        near0: u.uNear0, near1: u.uNear1 })),
      side: varying(side), color: u.uColor, alpha: u.uAlpha,
    }),
  };
}
function dotPort(t: Tsl, u: Tsl) {
  const { wgslFn, attribute, positionGeometry, modelViewMatrix, cameraProjectionMatrix, varying } = t;
  const vertex = wgslFn(`fn laserDot(pos: vec3f, corner: vec2f, mv: mat4x4f, proj: mat4x4f, res: vec2f,
    width: f32) -> vec4f {
    let a = proj * mv * vec4f(pos, 1.0);
    return vec4f(a.xy + corner * width / res * a.w, a.zw);
  }`);
  const colour = wgslFn(`fn laserDotColour(c: vec2f, color: vec3f, alpha: f32) -> vec4f {
    let r = length(c);
    let core = 1.0 - smoothstep(0.25, 0.45, r);
    let halo = 1.0 - smoothstep(0.3, 1.0, r);
    return vec4f(color * (0.5 + 1.2 * core), alpha * max(core, halo * 0.45));
  }`);
  const corner = attribute('corner', 'vec2');
  return {
    vertex: vertex({
      pos: positionGeometry, corner, mv: modelViewMatrix, proj: cameraProjectionMatrix, res: u.uRes, width: u.uWidth,
    }),
    fragment: colour({ c: varying(corner), color: u.uColor, alpha: u.uAlpha }),
  };
}

const uniforms = {
  uRes: { value: new THREE.Vector2(1, 1) }, uWidth: { value: WIDTH }, uNear0: { value: NEAR0 }, uNear1: { value: NEAR1 },
  uColor: { value: COLOR.clone().multiplyScalar(GLOW) }, uAlpha: { value: 0 },
};
// (the dot shares the line's uniforms but its width)
const dotUniforms = { ...uniforms, uWidth: { value: DOT } };
const shaderOpts = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide } as const;
const lineMat = portShader(new THREE.ShaderMaterial({ vertexShader: lineVert, fragmentShader: lineFrag, uniforms, ...shaderOpts }), linePort);
const dotMat = portShader(new THREE.ShaderMaterial({ vertexShader: dotVert, fragmentShader: dotFrag, uniforms: dotUniforms, ...shaderOpts }), dotPort);

function lineGeometry(): THREE.BufferGeometry {
  const n = LASER_LINES * LASER_POINTS * 2, g = new THREE.BufferGeometry();
  for (const [name, size] of [['position', 3], ['next', 3], ['side', 1], ['along', 1]] as const) {
    g.setAttribute(name, new THREE.BufferAttribute(new Float32Array(n * size), size).setUsage(THREE.DynamicDrawUsage));
  }
  const side = g.getAttribute('side') as THREE.BufferAttribute;
  for (let i = 0; i < n; i++) side.setX(i, i % 2 ? 1 : -1);
  const idx: number[] = [];
  for (let l = 0; l < LASER_LINES; l++) for (let i = 0; i < LASER_POINTS - 1; i++) {
    const v = (l * LASER_POINTS + i) * 2;
    idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
  }
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1).setUsage(THREE.DynamicDrawUsage));
  return g;
}

function dotGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry(), n = LASER_LINES * 4;
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
  const corner = new Float32Array(n * 2), idx: number[] = [];
  for (let i = 0; i < LASER_LINES; i++) {
    corner.set([-1, -1, 1, -1, 1, 1, -1, 1], i * 8);
    idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  }
  g.setAttribute('corner', new THREE.BufferAttribute(corner, 2));
  g.setIndex(idx);
  return g;
}

let line: THREE.Mesh | null = null, dots: THREE.Mesh | null = null;
/** what was asked for this frame: the paths and their ends (an end is null where the path just stops) */
let shownAt = -1;
const asked: { pts: THREE.Vector3[]; end: THREE.Vector3 | null }[] = [];
let lines = 0;

/** The aim preview's meshes, for warm-up (their programs compile at load). */
export function warmLaser(): THREE.Object3D[] {
  const l = new THREE.Mesh(lineGeometry(), lineMat), d = new THREE.Mesh(dotGeometry(), dotMat);
  l.frustumCulled = d.frustumCulled = false;
  return [l, d];
}

/**
 * Show the preview this frame along these paths (points from the bow on, at most LASER_POINTS each), each with its
 * end's dot (or none). Call every frame it should show; once a frame passes without a call it eases out.
 */
export function showLaser(paths: { pts: THREE.Vector3[]; end: THREE.Vector3 | null }[]): void {
  if (!line) start();
  shownAt = G.time;
  asked.length = 0;
  for (const p of paths.slice(0, LASER_LINES)) asked.push(p);
  write();
}

function start(): void {
  [line, dots] = warmLaser() as [THREE.Mesh, THREE.Mesh];
  line.renderOrder = dots.renderOrder = 5;
  G.scene.add(line, dots);
  uniforms.uAlpha.value = 0;
  addEffect({
    update(dt) {
      const on = G.time - shownAt < 0.05;
      const a = uniforms.uAlpha;
      a.value = on ? Math.min(ALPHA, a.value + dt * ALPHA / EASE_IN) : Math.max(0, a.value - dt * ALPHA / EASE_OUT);
      // (in the scene's pixels: it renders into the scene's target, at the quality's ratio)
      sceneSize(uniforms.uRes.value);
      uniforms.uWidth.value = WIDTH * sceneRatio();
      dotUniforms.uWidth.value = DOT * sceneRatio();
      return on || a.value > 0;
    },
    dispose() {
      G.scene.remove(line!, dots!);
      line!.geometry.dispose(); dots!.geometry.dispose();
      line = dots = null;
    },
  });
}

function write(): void {
  const g = line!.geometry, pos = g.getAttribute('position') as THREE.BufferAttribute, nxt = g.getAttribute('next') as THREE.BufferAttribute;
  const along = g.getAttribute('along') as THREE.BufferAttribute;
  const dp = dots!.geometry.getAttribute('position') as THREE.BufferAttribute;
  lines = asked.length;
  let tris = 0, nd = 0;
  asked.forEach((p, l) => {
    const pts = p.pts, n = Math.min(pts.length, LASER_POINTS);
    // (its length along the path, for the fade at its far end: only a path that just stops fades out there)
    let total = 0;
    for (let i = 1; i < n; i++) total += pts[i].distanceTo(pts[i - 1]);
    let s = 0;
    for (let i = 0; i < n; i++) {
      if (i) s += pts[i].distanceTo(pts[i - 1]);
      const a = pts[i], b = i < n - 1 ? pts[i + 1] : null, v = (l * LASER_POINTS + i) * 2;
      // (the last point looks on along the line from the one before it)
      const bx = b ? b.x : 2 * a.x - pts[i - 1].x, by = b ? b.y : 2 * a.y - pts[i - 1].y, bz = b ? b.z : 2 * a.z - pts[i - 1].z;
      const u = p.end ? 0 : s / Math.max(total, 1e-3);
      for (let k = 0; k < 2; k++) { pos.setXYZ(v + k, a.x, a.y, a.z); nxt.setXYZ(v + k, bx, by, bz); along.setX(v + k, u); }
    }
    // (the unused rest of this line's points sit on its last one: no triangles show there)
    const last = pts[n - 1];
    for (let i = n; i < LASER_POINTS; i++) for (let k = 0; k < 2; k++) {
      const v = (l * LASER_POINTS + i) * 2 + k;
      pos.setXYZ(v, last.x, last.y, last.z); nxt.setXYZ(v, last.x, last.y, last.z);
    }
    tris = (l * LASER_POINTS + n - 1) * 6;
    if (p.end) { for (let k = 0; k < 4; k++) dp.setXYZ(nd * 4 + k, p.end.x, p.end.y, p.end.z); nd++; }
  });
  g.setDrawRange(0, lines ? tris : 0);
  for (const a of [pos, nxt, along]) a.needsUpdate = true;
  dots!.geometry.setDrawRange(0, nd * 6);
  dp.needsUpdate = true;
}
