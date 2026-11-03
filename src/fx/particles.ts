// CPU-simulated, GPU-rendered point particles. One additive pool (glows, sparks)
// and one alpha-blended pool (smoke, dust, debris).
import * as THREE from 'three';
import { G } from '../state';
import { nearGlow } from '../core/materials';
import { pointScale } from '../core/renderer';
import { dazedField } from './dazed';
import { WEBGPU } from '../core/webgpu';
import { particleQuads, type ParticleQuads } from './particleNodes';

const VERT = /* glsl */`
  attribute float aSize;
  attribute vec4 aColor;
  varying vec4 vColor;
  uniform float uScale;
  void main(){
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // fade out near the lens: in first person a burst around the player starts at the camera, a bolt's
    // trail stacks along the view as it flies at it, and each point there covers much of the screen
    vColor = vec4(aColor.rgb, aColor.a * smoothstep(0.5, 3.5, -mv.z));
    gl_PointSize = aSize * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;

const FRAG = /* glsl */`
  varying vec4 vColor;
  uniform float uSoft;
  void main(){
    vec2 p = gl_PointCoord - 0.5;
    float d = length(p) * 2.0;
    if (d > 1.0) discard;
    float a = pow(1.0 - d, uSoft);
    gl_FragColor = vec4(vColor.rgb, vColor.a * a);
  }`;

/** Options for spawning one particle. Colors are linear RGB and may exceed 1 (HDR). */
export interface ParticleSpawn {
  x: number; y: number; z: number;
  vx?: number; vy?: number; vz?: number;
  life?: number;
  size?: number; sizeEnd?: number;
  color: THREE.Color; colorEnd?: THREE.Color;
  alpha?: number;
  gravity?: number;
  drag?: number;
}

class Pool {
  readonly max: number;
  count = 0;
  readonly pos: Float32Array<ArrayBuffer>; readonly col: Float32Array<ArrayBuffer>; readonly size: Float32Array<ArrayBuffer>;
  // simulation state
  readonly vel: Float32Array; readonly life: Float32Array; readonly maxLife: Float32Array;
  readonly s0: Float32Array; readonly s1: Float32Array; readonly c0: Float32Array; readonly c1: Float32Array;
  readonly a0: Float32Array; readonly grav: Float32Array; readonly drag: Float32Array;
  readonly aPos: THREE.BufferAttribute; readonly aCol: THREE.BufferAttribute; readonly aSize: THREE.BufferAttribute;
  private readonly attrs: THREE.BufferAttribute[];
  readonly mat: THREE.ShaderMaterial;
  readonly points: THREE.Points | THREE.Mesh;
  /** on WebGPU, the pool as instanced quads (particleNodes.ts) */
  private readonly quads: ParticleQuads | null = null;

  constructor(max: number, blending: THREE.Blending, soft: number) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    // simulation state
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.c0 = new Float32Array(max * 3);
    this.c1 = new Float32Array(max * 3);
    this.a0 = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);

    const geo = new THREE.BufferGeometry();
    // (an instance's on WebGPU, a quad each; a vertex's for WebGL's points)
    const Attribute = WEBGPU ? THREE.InstancedBufferAttribute : THREE.BufferAttribute;
    this.aPos = new Attribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new Attribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new Attribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos);
    geo.setAttribute('aColor', this.aCol);
    geo.setAttribute('aSize', this.aSize);
    this.attrs = [this.aPos, this.aCol, this.aSize];
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: { uScale: { value: 400 }, uSoft: { value: soft } },
      transparent: true, depthWrite: false, blending,
    });
    // glowing (additive) particles dim with distance like every effect glow
    if (blending === THREE.AdditiveBlending) nearGlow(this.mat);
    if (WEBGPU) {
      const attrs = [this.aPos, this.aCol, this.aSize] as THREE.InstancedBufferAttribute[];
      this.quads = particleQuads(attrs[0], attrs[1], attrs[2], blending, soft);
    }
    this.points = this.quads?.mesh ?? new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = blending === THREE.AdditiveBlending ? 20 : 10;
  }

  spawn(o: ParticleSpawn): void {
    let i = this.count;
    if (i >= this.max) i = Math.floor(Math.random() * this.max); // overwrite a random one
    else this.count++;
    const i3 = i * 3;
    this.pos[i3] = o.x; this.pos[i3 + 1] = o.y; this.pos[i3 + 2] = o.z;
    this.vel[i3] = o.vx || 0; this.vel[i3 + 1] = o.vy || 0; this.vel[i3 + 2] = o.vz || 0;
    this.life[i] = this.maxLife[i] = o.life || 1;
    this.s0[i] = o.size ?? 0.3; this.s1[i] = o.sizeEnd ?? this.s0[i];
    const c = o.color, ce = o.colorEnd || c;
    this.c0[i3] = c.r; this.c0[i3 + 1] = c.g; this.c0[i3 + 2] = c.b;
    this.c1[i3] = ce.r; this.c1[i3 + 1] = ce.g; this.c1[i3 + 2] = ce.b;
    this.a0[i] = o.alpha ?? 1;
    this.grav[i] = o.gravity || 0;
    this.drag[i] = o.drag || 0;
  }

  update(dt: number): void {
    let i = 0;
    while (i < this.count) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.kill(i); continue; }
      const i3 = i * 3, i4 = i * 4;
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i3] *= d; this.vel[i3 + 1] = this.vel[i3 + 1] * d - this.grav[i] * dt; this.vel[i3 + 2] *= d;
      this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      if (this.pos[i3 + 1] < 0.02 && this.grav[i] > 0) { this.pos[i3 + 1] = 0.02; this.vel[i3 + 1] *= -0.3; this.vel[i3] *= 0.6; this.vel[i3 + 2] *= 0.6; }
      const t = 1 - this.life[i] / this.maxLife[i];
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      this.col[i4] = this.c0[i3] + (this.c1[i3] - this.c0[i3]) * t;
      this.col[i4 + 1] = this.c0[i3 + 1] + (this.c1[i3 + 1] - this.c0[i3 + 1]) * t;
      this.col[i4 + 2] = this.c0[i3 + 2] + (this.c1[i3 + 2] - this.c0[i3 + 2]) * t;
      // fade in quickly, fade out smoothly
      this.col[i4 + 3] = this.a0[i] * Math.min(1, t * 12) * (1 - t * t);
      i++;
    }
    if (this.quads) this.quads.mesh.geometry.instanceCount = this.count;
    else this.points.geometry.setDrawRange(0, this.count);
    // (not drawn while empty, a draw call of nothing; shown through the boot's warm-up, which runs no update)
    this.points.visible = this.count > 0;
    // upload only the live particles, not the whole pool (a zero-length range would upload all of it)
    if (this.count) for (const a of this.attrs) { a.clearUpdateRanges(); a.addUpdateRange(0, this.count * a.itemSize); a.needsUpdate = true; }
    this.mat.uniforms.uScale.value = pointScale();
    if (this.quads) this.quads.scale.value = pointScale();
  }

  kill(i: number): void {
    const j = --this.count;
    if (i === j) return;
    const cp3 = (a: Float32Array) => { a[i * 3] = a[j * 3]; a[i * 3 + 1] = a[j * 3 + 1]; a[i * 3 + 2] = a[j * 3 + 2]; };
    cp3(this.pos); cp3(this.vel); cp3(this.c0); cp3(this.c1);
    for (const a of [this.life, this.maxLife, this.s0, this.s1, this.a0, this.grav, this.drag]) a[i] = a[j];
  }
}

export const particles = {
  glow: null as unknown as Pool,
  smoke: null as unknown as Pool,
  init(scene: THREE.Scene): void {
    this.glow = new Pool(9000, THREE.AdditiveBlending, 1.6);
    this.smoke = new Pool(3000, THREE.NormalBlending, 1.2);
    this.glow.points.name = 'particles: glow';
    this.smoke.points.name = 'particles: smoke';
    scene.add(this.glow.points, this.smoke.points);
    dazedField.init(scene);
  },
  update(dt: number): void { this.glow.update(dt); this.smoke.update(dt); dazedField.update(); },
  clear(): void { this.glow.count = 0; this.smoke.count = 0; dazedField.clear(); },
};

/** Color helper: hex (or color) scaled into HDR range. */
export const col = (hex: THREE.ColorRepresentation, mul = 1): THREE.Color => new THREE.Color(hex).multiplyScalar(mul);

// Convenience emitters -------------------------------------------------------

type Vec3Like = { x: number; y: number; z: number };

export interface BurstOpts {
  count?: number; color?: THREE.ColorRepresentation; colorEnd?: THREE.ColorRepresentation | null; intensity?: number;
  speed?: number; up?: number; life?: number; size?: number; sizeEnd?: number; gravity?: number; drag?: number; spread?: number;
}

export function burst(pos: Vec3Like, { count = 20, color = 0xffffff, colorEnd = null, intensity = 3, speed = 5, up = 2, life = 0.6, size = 0.25, sizeEnd = 0.02, gravity = 6, drag = 2, spread = 0.2 }: BurstOpts = {}): void {
  const c = col(color, intensity), ce = colorEnd != null ? col(colorEnd, intensity * 0.5) : c.clone().multiplyScalar(0.3);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
    particles.glow.spawn({
      x: pos.x + (Math.random() - 0.5) * spread, y: pos.y + (Math.random() - 0.5) * spread, z: pos.z + (Math.random() - 0.5) * spread,
      vx: Math.cos(a) * s, vy: up * (0.3 + Math.random()), vz: Math.sin(a) * s,
      life: life * (0.5 + Math.random() * 0.7), size: size * (0.6 + Math.random() * 0.8), sizeEnd,
      color: c, colorEnd: ce, gravity, drag,
    });
  }
}

export interface SmokeOpts { count?: number; color?: THREE.ColorRepresentation; alpha?: number; size?: number; sizeEnd?: number; life?: number; speed?: number; rise?: number }

export function smokePuff(pos: Vec3Like, { count = 8, color = 0x111118, alpha = 0.55, size = 1.4, sizeEnd = 3, life = 1.4, speed = 1.2, rise = 0.8 }: SmokeOpts = {}): void {
  const c = col(color);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2, s = speed * Math.random();
    particles.smoke.spawn({
      x: pos.x + (Math.random() - 0.5) * 0.5, y: pos.y + Math.random() * 0.4, z: pos.z + (Math.random() - 0.5) * 0.5,
      vx: Math.cos(a) * s, vy: rise * (0.5 + Math.random()), vz: Math.sin(a) * s,
      life: life * (0.6 + Math.random() * 0.6), size, sizeEnd, color: c, alpha, drag: 1.5,
    });
  }
}

export interface DebrisOpts { count?: number; color?: THREE.ColorRepresentation; speed?: number; size?: number; life?: number }

export function debris(pos: Vec3Like, { count = 10, color = 0x2a2a30, speed = 6, size = 0.18, life = 1.1 }: DebrisOpts = {}): void {
  const c = col(color);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
    particles.smoke.spawn({
      x: pos.x, y: pos.y + 0.2, z: pos.z,
      vx: Math.cos(a) * s, vy: 3 + Math.random() * 5, vz: Math.sin(a) * s,
      life, size: size * (0.5 + Math.random()), sizeEnd: size * 0.6, color: c, alpha: 1, gravity: 20, drag: 0.5,
    });
  }
}