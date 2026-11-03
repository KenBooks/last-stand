// The crypt's hostile bolts, each a look of its own rather than a glowing ball:
// - void bolt (Rift Witch): a dark orb with a burning, churning rim, a streaming comet tail, motes
//   spiralling round it and dark wisps shed behind; it implodes and snaps back out on impact.
// - magma bolt (Hollow Colossus): a spinning chunk of rock split by glowing lava, trailing fire,
//   smoke and falling embers; it bursts into flame, debris and a scorch mark.
// The orbs are blended over the scene (they read as things, not glare); the tail and halo are added
// light and dim near the camera like every effect glow.
import * as THREE from 'three';
import { G } from '../state';
import { nearGlow } from '../core/materials';
import { portShader, wgslNoise, type Port, type Tsl } from '../core/shaderPorts';
import { particles, col, burst, smokePuff, debris } from './particles';
import { shockwave, decal } from './effects';
import { flashFree } from './lights';

const time = { value: 0 };
const NOISE = /* glsl */`
  float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z); }
  float fbm(vec3 p){ return noise(p) * 0.55 + noise(p * 2.1 + 3.1) * 0.3 + noise(p * 4.3 + 7.7) * 0.15; }`;
const VERT = /* glsl */`varying vec3 vP; varying vec3 vN; varying vec3 vV;
  void main(){ vP = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;

const sphere = new THREE.SphereGeometry(1, 24, 16);
// the tail: a cone from the orb (its wide end, at the origin) back along -Z
const tailGeo = new THREE.ConeGeometry(1, 1, 16, 6, true).translate(0, 0.5, 0).rotateX(-Math.PI / 2);
const rock = new THREE.IcosahedronGeometry(1, 1);

type Look = 'void' | 'magma';
const mats = new Map<string, THREE.Material>();
function mat(kind: 'orb' | 'halo' | 'tail', look: Look, color: number): THREE.Material {
  const key = `${kind}:${look}:${color}`;
  let m = mats.get(key);
  if (m) return m;
  const uniforms = { uColor: { value: new THREE.Color(color) }, uTime: time };
  if (kind === 'orb' && look === 'void') m = new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, transparent: true, depthWrite: false,
    fragmentShader: /* glsl */`uniform vec3 uColor; uniform float uTime; varying vec3 vP; varying vec3 vN; varying vec3 vV; ${NOISE}
      void main(){
        float f = max(dot(normalize(vN), normalize(vV)), 0.0), rim = 1.0 - f;
        // energy churning over the surface, drawn in towards the rim
        vec3 p = vP * 2.6;
        float n = fbm(p + vec3(fbm(p + uTime * 1.3), fbm(p - uTime * 1.1), 0.0) * 2.0 - uTime * 0.6);
        float band = pow(max(0.0, 1.0 - abs(n - 0.5) * 5.0), 2.0);
        vec3 c = uColor * 0.05 + uColor * (1.6 * pow(rim, 2.0) + 1.3 * band * rim) + vec3(1.0, 0.85, 1.0) * pow(rim, 5.0) * 1.2;
        gl_FragColor = vec4(c, 0.92);
      }`,
  });
  else if (kind === 'orb') m = new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, transparent: true, depthWrite: true,
    fragmentShader: /* glsl */`uniform vec3 uColor; uniform float uTime; varying vec3 vP; varying vec3 vN; varying vec3 vV; ${NOISE}
      void main(){
        // dark rock, split by cracks of lava (the valleys of a noise), hotter where they meet
        float n = fbm(vP * 2.3 + 1.7);
        float crack = pow(max(0.0, 1.0 - abs(n - 0.5) * 9.0), 1.5);
        float pulse = 0.8 + 0.2 * sin(uTime * 9.0 + vP.x * 6.0);
        float f = max(dot(normalize(vN), normalize(vV)), 0.0);
        vec3 rock = vec3(0.07, 0.05, 0.045) * (0.4 + 0.8 * f) + vec3(0.12, 0.06, 0.03) * noise(vP * 8.0);
        vec3 lava = mix(uColor, vec3(1.0, 0.85, 0.45), crack) * 2.6 * pulse;
        gl_FragColor = vec4(mix(rock, lava, crack) + uColor * pow(1.0 - f, 3.0) * 0.8, 1.0);
      }`,
  });
  else if (kind === 'halo') m = nearGlow(new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    fragmentShader: /* glsl */`uniform vec3 uColor; varying vec3 vN; varying vec3 vV;
      // a glow round the orb's edge: nothing over the orb itself (inside ~f 0.8), fading outwards
      void main(){ float f = max(dot(normalize(vN), normalize(vV)), 0.0);
        gl_FragColor = vec4(uColor * pow(f, 2.0) * (1.0 - smoothstep(0.7, 0.86, f)) * 1.2, 1.0); }`,
  }));
  else m = nearGlow(new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    fragmentShader: /* glsl */`uniform vec3 uColor; uniform float uTime; varying vec3 vP; varying vec3 vN; varying vec3 vV; ${NOISE}
      void main(){
        // streaks flowing back along the tail (z from 0 at the orb to -1), fading out behind
        float along = -vP.z, a = atan(vP.y, vP.x);
        float s = fbm(vec3(cos(a) * 1.6, sin(a) * 1.6, along * 3.0 + uTime * 7.0));
        float fade = pow(1.0 - along, 1.6) * smoothstep(0.0, 0.08, along);
        float edge = max(dot(normalize(vN), normalize(vV)), 0.0);
        gl_FragColor = vec4(uColor * (0.35 + 2.2 * smoothstep(0.45, 0.8, s)) * fade * sqrt(edge) * 2.0, 1.0);
      }`,
  }));
  portShader(m as THREE.ShaderMaterial, (t, u) => riftPort(t, u, kind, look));
  mats.set(key, m);
  return m;
}

/** Each bolt's material on WebGPU (core/shaderPorts.ts), its fragment shader above in WGSL */
function riftPort(t: Tsl, u: Tsl, kind: 'orb' | 'halo' | 'tail', look: Look): Port {
  const { wgslFn, positionGeometry, normalView, positionViewDirection, varying } = t;
  const { noise3, fbm3: fbm } = wgslNoise();
  const at = { pos: varying(positionGeometry), nrm: normalView, v: positionViewDirection, color: u.uColor, time: u.uTime };
  if (kind === 'orb' && look === 'void') return { fragment: wgslFn(`fn riftVoid(pos: vec3f, nrm: vec3f, v: vec3f,
    color: vec3f, time: f32) -> vec4f {
    let f = max(dot(normalize(nrm), normalize(v)), 0.0);
    let rim = 1.0 - f;
    let p = pos * 2.6;
    let n = fbm3(p + vec3f(fbm3(p + time * 1.3), fbm3(p - time * 1.1), 0.0) * 2.0 - time * 0.6);
    let band = pow(max(0.0, 1.0 - abs(n - 0.5) * 5.0), 2.0);
    let c = color * 0.05 + color * (1.6 * rim * rim + 1.3 * band * rim) + vec3f(1.0, 0.85, 1.0) * pow(rim, 5.0) * 1.2;
    return vec4f(c, 0.92);
  }`, [fbm])(at) };
  if (kind === 'orb') return { fragment: wgslFn(`fn riftMagma(pos: vec3f, nrm: vec3f, v: vec3f, color: vec3f,
    time: f32) -> vec4f {
    let n = fbm3(pos * 2.3 + 1.7);
    let crack = pow(max(0.0, 1.0 - abs(n - 0.5) * 9.0), 1.5);
    let pulse = 0.8 + 0.2 * sin(time * 9.0 + pos.x * 6.0);
    let f = max(dot(normalize(nrm), normalize(v)), 0.0);
    let rock = vec3f(0.07, 0.05, 0.045) * (0.4 + 0.8 * f) + vec3f(0.12, 0.06, 0.03) * noise3(pos * 8.0);
    let lava = mix(color, vec3f(1.0, 0.85, 0.45), crack) * 2.6 * pulse;
    return vec4f(mix(rock, lava, crack) + color * pow(1.0 - f, 3.0) * 0.8, 1.0);
  }`, [fbm, noise3])(at) };
  if (kind === 'halo') return { fragment: wgslFn(`fn riftHalo(nrm: vec3f, v: vec3f, color: vec3f) -> vec4f {
    let f = max(dot(normalize(nrm), normalize(v)), 0.0);
    return vec4f(color * f * f * (1.0 - smoothstep(0.7, 0.86, f)) * 1.2, 1.0);
  }`)({ nrm: at.nrm, v: at.v, color: at.color }) };
  return { fragment: wgslFn(`fn riftTail(pos: vec3f, nrm: vec3f, v: vec3f, color: vec3f, time: f32) -> vec4f {
    let along = -pos.z;
    var a = 0.0;
    if (length(pos.xy) > 1e-5) { a = atan2(pos.y, pos.x); }
    let s = fbm3(vec3f(cos(a) * 1.6, sin(a) * 1.6, along * 3.0 + time * 7.0));
    let fade = pow(max(1.0 - along, 0.0), 1.6) * smoothstep(0.0, 0.08, along);
    let edge = max(dot(normalize(nrm), normalize(v)), 0.0);
    return vec4f(color * (0.35 + 2.2 * smoothstep(0.45, 0.8, s)) * fade * sqrt(edge) * 2.0, 1.0);
  }`, [fbm])(at) };
}

/** The bolt's mesh, radius `size`: the orb, a soft halo round it and (void) a tail behind. */
export function riftBolt(look: Look, color: number, size: number): THREE.Mesh {
  const mesh = new THREE.Mesh(look === 'magma' ? rock : sphere, mat('orb', look, color));
  mesh.scale.setScalar(size);
  const halo = new THREE.Mesh(sphere, mat('halo', look, color));
  halo.scale.setScalar(look === 'magma' ? 1.9 : 1.7);
  mesh.add(halo);
  if (look === 'void') {
    const tail = new THREE.Mesh(tailGeo, mat('tail', look, color));
    tail.scale.set(0.95, 0.95, 7);
    mesh.add(tail);
  }
  return mesh;
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

/** Each frame of the flight: point along the path, spin, and shed the trail. */
export function riftBoltTick(look: Look, mesh: THREE.Mesh, pos: THREE.Vector3, vel: THREE.Vector3, color: number, trail: number, dt: number, acc: { t: number; a: number }): void {
  time.value = G.time;
  const r = mesh.scale.x;
  if (r <= 0) return;
  _a.copy(pos).add(vel);
  if (look === 'void') mesh.lookAt(_a);
  else { mesh.rotation.x += dt * 7; mesh.rotation.y += dt * 4; }
  const dir = _b.copy(vel).normalize(), side = _a.crossVectors(dir, _up).normalize();
  const gc = col(color, 1.6), dark = col(trail);
  acc.t += dt * (look === 'void' ? 70 : 55);
  while (acc.t >= 1) {
    acc.t -= 1;
    acc.a += 0.9;
    if (look === 'void') {
      // two motes spiralling round the path
      for (const s of [1, -1]) {
        const c = Math.cos(acc.a) * s * r * 1.3, h = Math.sin(acc.a) * s * r * 1.3;
        particles.glow.spawn({
          x: pos.x + side.x * c, y: pos.y + h, z: pos.z + side.z * c, vx: -dir.x * 1.5, vy: 0, vz: -dir.z * 1.5,
          life: 0.35, size: r * 0.55, sizeEnd: 0.01, color: gc, colorEnd: col(0x2a0050, 0.5), drag: 2,
        });
      }
      if (Math.random() < 0.35) particles.smoke.spawn({
        x: pos.x - dir.x * r, y: pos.y, z: pos.z - dir.z * r,
        vx: (Math.random() - 0.5) * 0.6, vy: 0.15 + Math.random() * 0.3, vz: (Math.random() - 0.5) * 0.6,
        life: 0.6, size: r * 1.3, sizeEnd: r * 3.5, color: dark, alpha: 0.45, drag: 2,
      });
    } else {
      const ox = (Math.random() - 0.5) * r, oy = (Math.random() - 0.5) * r, oz = (Math.random() - 0.5) * r;
      particles.glow.spawn({
        x: pos.x + ox, y: pos.y + oy, z: pos.z + oz, vx: -dir.x * 2 + ox * 2, vy: 0.8 + Math.random(), vz: -dir.z * 2 + oz * 2,
        life: 0.3 + Math.random() * 0.2, size: r * 1.1, sizeEnd: r * 0.25, color: col(0xffb040, 1.4), colorEnd: col(color, 0.5), drag: 2.5,
      });
      if (Math.random() < 0.25) particles.glow.spawn({
        x: pos.x, y: pos.y, z: pos.z, vx: (Math.random() - 0.5) * 3, vy: 1 + Math.random() * 2, vz: (Math.random() - 0.5) * 3,
        life: 0.7, size: 0.06, sizeEnd: 0.02, color: col(0xffd080, 2), colorEnd: col(color, 0.6), gravity: 9, drag: 0.5,
      });
      if (Math.random() < 0.4) particles.smoke.spawn({
        x: pos.x - dir.x * r, y: pos.y + r * 0.3, z: pos.z - dir.z * r,
        vx: (Math.random() - 0.5) * 0.4, vy: 0.5 + Math.random() * 0.5, vz: (Math.random() - 0.5) * 0.4,
        life: 0.9, size: r * 1.2, sizeEnd: r * 4, color: dark, alpha: 0.4, drag: 2,
      });
    }
  }
}

/** The shot leaving the caster: a flash and a ring of sparks at the orb or hand. */
export function riftBoltLaunch(look: Look, pos: THREE.Vector3, color: number, size: number): void {
  burst(pos, { count: 14, color: look === 'void' ? color : 0xffa040, colorEnd: color, speed: 3.5, up: 0.5, life: 0.3, size: size * 0.8, gravity: 0 });
  flashFree({ color, intensity: 8, distance: 5, life: 0.2, pos: { x: pos.x, y: pos.y, z: pos.z } });
}

/** A bolt that ran into a wall or out of range: it just breaks up. */
export function riftBoltFizzle(look: Look, pos: THREE.Vector3, color: number, trail: number, size: number): void {
  burst(pos, { count: 10, color: look === 'void' ? color : 0xffa040, colorEnd: color, speed: 3, up: 1, life: 0.35, size: size * 0.7, gravity: 4 });
  smokePuff(pos, { count: 3, color: trail, alpha: 0.4, size: 0.4, sizeEnd: 1.2, life: 0.7, rise: 0.4 });
}

/** The impact: the void bolt collapses in on itself and snaps out; the magma bolt bursts in fire. */
export function riftBoltImpact(look: Look, pos: THREE.Vector3, color: number, trail: number, size: number): void {
  const ground = { x: pos.x, z: pos.z };
  if (look === 'void') {
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, s = Math.sqrt(1 - u * u), d = 0.9 + Math.random() * 0.4;
      const ox = Math.cos(a) * s * d, oy = u * d, oz = Math.sin(a) * s * d;
      // spawned on a shell, rushing into the centre
      particles.glow.spawn({ x: pos.x + ox, y: pos.y + oy, z: pos.z + oz, vx: -ox * 4, vy: -oy * 4, vz: -oz * 4, life: 0.22, size: 0.14, sizeEnd: 0.03, color: col(color, 1.8), drag: 1 });
    }
    burst(pos, { count: 20, color, colorEnd: 0x200040, speed: 5, up: 1, life: 0.45, size: size * 0.8, gravity: 2 });
    shockwave(ground, { color, intensity: 1.6, from: 0.2, to: 1.8, life: 0.35 });
    smokePuff(pos, { count: 5, color: trail, alpha: 0.5, size: 0.5, sizeEnd: 1.6, life: 0.8, rise: 0.3 });
  } else {
    burst(pos, { count: 26, color: 0xffb040, colorEnd: color, speed: 6, up: 3, life: 0.5, size: size * 0.9, gravity: 8 });
    burst(pos, { count: 12, color: 0xffe0a0, speed: 8, up: 4, life: 0.8, size: 0.07, gravity: 14, drag: 0.5 });
    debris(pos, { count: 8, color: 0x1a1412, speed: 5, size: 0.12 });
    smokePuff(pos, { count: 6, color: trail, alpha: 0.45, size: 0.7, sizeEnd: 2.2, life: 1.1, rise: 0.8 });
    shockwave(ground, { color, intensity: 1.8, from: 0.2, to: 2.2, life: 0.4 });
    decal(ground, { type: 'scorch', size: 1.4, life: 5 });
  }
  flashFree({ color, intensity: 14, distance: 6, life: 0.25, pos: { x: pos.x, y: pos.y, z: pos.z } });
}

/** Samples for the load-time warm-up (every material kind; the colour is a uniform). */
export const riftBoltSamples = (): THREE.Mesh[] => [riftBolt('void', 0xc050ff, 0.3), riftBolt('magma', 0xff6a2a, 0.3)];
