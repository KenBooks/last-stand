// The trail a swung weapon leaves: the band its striking part swept over the last tenth of a second, white, brightest
// along the path of its edge and fading behind it, so a strike's arc reads in every view. It follows the weapons a
// strike swings (`Model.swung`) in the hero's own frame (his model's root): through the eyes his arms are placed in the
// view and drawn by a camera of their own (`drawArms`), and the trail is drawn with them, on their layer, so it lies
// where the weapon is seen and a turn of the view carries it round with them. Only a weapon swung fast leaves one: a
// wind-up and a walk's swing of the arm leave none. Each frame's place of the weapon is a point of a curve through
// them (centripetal Catmull-Rom), cut into steps a few centimetres long, so a swing a frame crosses half a metre in
// stays round. Light adds up: added white, dimmed with distance (`nearGlow`), a thin edge over a faint band.
import * as THREE from 'three';
import { G } from '../state';
import { nearGlow } from '../core/materials';
import { portShader } from '../core/shaderPorts';
import { tunable } from '../core/tuning';
import { armsLayerOf } from '../entities/viewModel';
import type { Blade, Model } from '../types';

/** how long a point of the trail lasts (s); the speed of the striking part's edge (m/s) it begins to leave one at, and
 *  leaves it whole from; how bright the edge's path is, and the band behind it (a share of that) */
const TRAIL = tunable('swingTrail', { life: 0.1, slow: 4, fast: 10, glow: 1.6, band: 0.18 });
/** at most this many frames kept (a 240 Hz screen's tenth of a second) */
const SAMPLES = 32;
/** each gap between two frames' places cut into steps of about this length along the edge's path (m), at most this
 *  many */
const STEP = 0.05, STEPS_MOST = 12;
const COLUMNS = SAMPLES * STEPS_MOST + 1;
/** the least distance between two points of the curve counted (m): one frame's place twice */
const EPS = 1e-4;

const material = portShader(nearGlow(new THREE.ShaderMaterial({
  uniforms: { uGlow: { value: TRAIL.glow }, uBand: { value: TRAIL.band } },
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  vertexShader: /* glsl */`
    attribute vec3 trail;
    varying vec3 vT;
    void main(){ vT = trail; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform float uGlow, uBand;
    varying vec3 vT;
    void main(){
      // vT: how old (0 now .. 1 at the end of its life), how far out along the striking part (0 nearest the hand ..
      // 1 its edge), and how fast it was swung there (0 too slow to leave a trail .. 1)
      float fade = (1.0 - vT.x) * (1.0 - vT.x);
      float edge = pow(vT.y, 6.0);
      float i = vT.z * fade * (edge + uBand * vT.y) * uGlow;
      gl_FragColor = vec4(vec3(i), i);
    }`,
})), ({ wgslFn, attribute, varying }, u) => ({
  fragment: wgslFn(`fn swingTrail(t: vec3f, glow: f32, band: f32) -> vec4f {
    let fade = (1.0 - t.x) * (1.0 - t.x);
    let edge = pow(t.y, 6.0);
    let i = t.z * fade * (edge + band * t.y) * glow;
    return vec4f(vec3f(i), i);
  }`)({ t: varying(attribute('trail', 'vec3')), glow: u.uGlow, band: u.uBand }),
}));

/** A frame's place of the striking part (the model's root's space) and when, how fast its edge moved there (m/s), and
 *  how fast it was swung (0..1: `add`) */
interface Sample { from: THREE.Vector3; to: THREE.Vector3; t: number; v: number; w: number }

type V3 = THREE.Vector3;
const _a1 = new THREE.Vector3(), _a2 = new THREE.Vector3(), _a3 = new THREE.Vector3();
const _b1 = new THREE.Vector3(), _b2 = new THREE.Vector3(), _p = new THREE.Vector3();

/** `out` set to `a` and `b` weighed by how far `t` is from `ta` to `tb` (Barry and Goldman's step). */
function between(a: V3, b: V3, ta: number, tb: number, t: number, out: V3): V3 {
  return out.copy(a).multiplyScalar((tb - t) / (tb - ta)).addScaledVector(b, (t - ta) / (tb - ta));
}

/** The point `u` of the way from `p1` to `p2` on the centripetal Catmull-Rom curve through `p0` to `p3`, into `out`. */
function curveAt(p0: V3, p1: V3, p2: V3, p3: V3, u: number, out: V3): V3 {
  const t1 = Math.sqrt(Math.max(EPS, p0.distanceTo(p1)));
  const t2 = t1 + Math.sqrt(Math.max(EPS, p1.distanceTo(p2)));
  const t3 = t2 + Math.sqrt(Math.max(EPS, p2.distanceTo(p3)));
  const t = t1 + (t2 - t1) * u;
  between(p0, p1, 0, t1, t, _a1);
  between(p1, p2, t1, t2, t, _a2);
  between(p2, p3, t2, t3, t, _a3);
  between(_a1, _a2, 0, t2, t, _b1);
  between(_a2, _a3, t1, t3, t, _b2);
  return between(_b1, _b2, t1, t2, t, out);
}

const smooth = (a: number, b: number, x: number): number => {
  const k = Math.min(1, Math.max(0, (x - a) / Math.max(1e-6, b - a)));
  return k * k * (3 - 2 * k);
};

/** The geometry of a trail as long as it can be: a column of two points (nearest the hand, the edge) a step, the
 *  steps' quads indexed once. */
function trailGeometry(columns: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  for (const name of ['position', 'trail']) {
    g.setAttribute(name, new THREE.BufferAttribute(new Float32Array(columns * 6), 3).setUsage(THREE.DynamicDrawUsage));
  }
  const index: number[] = [];
  for (let c = 0; c + 1 < columns; c++) {
    const v = c * 2;
    index.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
  }
  g.setIndex(index);
  return g;
}

/** One weapon's trail. */
class Trail {
  readonly mesh = new THREE.Mesh(trailGeometry(COLUMNS), material);
  private readonly ring: Sample[] = Array.from({ length: SAMPLES }, () => ({
    from: new THREE.Vector3(), to: new THREE.Vector3(), t: 0, v: 0, w: 0,
  }));
  private first = 0;
  private count = 0;
  /** whether the last frame swung the weapon too: this frame's place carries on from it */
  private following = false;

  constructor() {
    this.mesh.name = 'swing trail';
    this.mesh.matrixAutoUpdate = false;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    G.scene.add(this.mesh);
  }

  private at(i: number): Sample { return this.ring[(this.first + i) % SAMPLES]; }

  /** The frame's place of `blade` added if a strike swings it (`swinging`), the old ones let go, and the trail drawn
   *  in `root`'s space on `layer`. */
  update(root: THREE.Object3D, blade: Blade, swinging: boolean, now: number, layer: number): void {
    while (this.count && now - this.at(0).t > TRAIL.life) { this.first = (this.first + 1) % SAMPLES; this.count--; }
    if (swinging) this.add(root, blade, now);
    else this.following = false;
    this.draw(root, now, layer);
  }

  private add(root: THREE.Object3D, blade: Blade, now: number): void {
    // (a strike begun again after a pause starts a trail of its own: joined to the last one's end, a band crossed
    // the gap between them)
    if (!this.following) this.count = 0;
    const last = this.count ? this.at(this.count - 1) : null;
    if (last && now <= last.t) return;
    if (this.count === SAMPLES) { this.first = (this.first + 1) % SAMPLES; this.count--; }
    const s = this.at(this.count);
    root.worldToLocal(blade.from.getWorldPosition(s.from));
    root.worldToLocal(blade.to.getWorldPosition(s.to));
    // (its speed as it is, however fast: taken for a jump past 80 m/s, Thunder Crescent's blow through the eyes, 93,
    // was cut out)
    const speed = last ? s.to.distanceTo(last.to) * root.scale.x / (now - last.t) : 0;
    s.t = now;
    s.v = speed;
    // a place is swung as fast as the slower of the moves into it and on from it, the newest's by the move before:
    // a weapon put elsewhere in a frame is no swing (by its own move, Steel Tempest's blade put back 53 cm in a frame
    // as it ended through the eyes left a slash across the top of the view)
    s.w = smooth(TRAIL.slow, TRAIL.fast, Math.min(speed, last?.v ?? 0));
    if (last) last.w = s.w;
    this.count++;
    this.following = true;
  }

  private draw(root: THREE.Object3D, now: number, layer: number): void {
    const mesh = this.mesh;
    let swept = 0;
    for (let i = 0; i < this.count; i++) swept = Math.max(swept, this.at(i).w);
    const columns = this.count >= 2 && swept > 0 ? this.fill(root.scale.x, now) : 0;
    mesh.visible = columns >= 2;
    if (!mesh.visible) return;
    const g = mesh.geometry;
    g.setDrawRange(0, (columns - 1) * 6);
    for (const name of ['position', 'trail']) {
      const attribute = g.getAttribute(name) as THREE.BufferAttribute;
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, columns * 6);
      attribute.needsUpdate = true;
    }
    mesh.matrix.copy(root.matrixWorld);
    mesh.matrixWorldNeedsUpdate = true;
    mesh.layers.set(layer);
    material.uniforms.uGlow.value = TRAIL.glow;
    material.uniforms.uBand.value = TRAIL.band;
  }

  /** The columns along the curve through the frames' places, oldest first; returns how many. */
  private fill(scale: number, now: number): number {
    const last = this.count - 1;
    let c = 0;
    for (let i = 0; i < last; i++) {
      const p0 = this.at(Math.max(0, i - 1)), p1 = this.at(i), p2 = this.at(i + 1), p3 = this.at(Math.min(last, i + 2));
      const steps = Math.min(STEPS_MOST, Math.max(1, Math.ceil(p1.to.distanceTo(p2.to) * scale / STEP)));
      for (let k = 0; k < steps; k++) c = this.column(c, p0, p1, p2, p3, k / steps, now);
    }
    const end = this.at(last);
    return this.column(c, end, end, end, end, 0, now);
  }

  /** Column `c`, `u` of the way from `p1` to `p2`; returns the next column's number. */
  private column(c: number, p0: Sample, p1: Sample, p2: Sample, p3: Sample, u: number, now: number): number {
    const g = this.mesh.geometry;
    const position = g.getAttribute('position') as THREE.BufferAttribute;
    const trail = g.getAttribute('trail') as THREE.BufferAttribute;
    const age = Math.min(1, (now - (p1.t + (p2.t - p1.t) * u)) / TRAIL.life), w = p1.w + (p2.w - p1.w) * u;
    curveAt(p0.from, p1.from, p2.from, p3.from, u, _p);
    position.setXYZ(c * 2, _p.x, _p.y, _p.z);
    curveAt(p0.to, p1.to, p2.to, p3.to, u, _p);
    position.setXYZ(c * 2 + 1, _p.x, _p.y, _p.z);
    trail.setXYZ(c * 2, age, 0, w);
    trail.setXYZ(c * 2 + 1, age, 1, w);
    return c + 1;
  }

  dispose(): void {
    G.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
  }
}

/** every hero's model followed, and each of its weapons' trails */
const followed = new Map<Model, Map<Blade, Trail>>();

/** Each hero's weapons' trails: the places a strike swings them to this frame added, the old ones let go. Call after
 *  the camera has moved and the eyes' view placed the arms (entities/viewModel.ts `viewArms`). */
export function updateSwingTrails(): void {
  const models = new Set(G.players.map((p) => p.model));
  for (const [model, trails] of followed) {
    if (models.has(model)) continue;
    for (const trail of trails.values()) trail.dispose();
    followed.delete(model);
  }
  for (const model of models) {
    const swung = model.swung;
    if (!swung) continue;
    let trails = followed.get(model);
    if (!trails) followed.set(model, trails = new Map());
    for (const blade of swung) if (!trails.has(blade)) trails.set(blade, new Trail());
    const layer = armsLayerOf(model);
    for (const [blade, trail] of trails) trail.update(model.root, blade, swung.includes(blade), G.time, layer);
  }
}

/** The meshes `model`'s trails draw, in the scene though they're his (through the eyes on his arms' layer). */
export function swingTrailsOf(model: Model): THREE.Object3D[] {
  return [...(followed.get(model)?.values() ?? [])].map((trail) => trail.mesh);
}

/** A trail's material on a quad, for the boot's warm-up (game/warmup.ts). */
export function swingTrailSamples(): THREE.Object3D[] {
  const g = trailGeometry(2);
  (g.getAttribute('position') as THREE.BufferAttribute).set([0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0]);
  (g.getAttribute('trail') as THREE.BufferAttribute).set([0, 0, 1, 0, 1, 1, 0, 0, 1, 0, 1, 1]);
  return [new THREE.Mesh(g, material)];
}
