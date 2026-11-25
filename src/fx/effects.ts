// Transient visual effects (shockwaves, decals, telegraphs, lightning, ice).
// Each effect is { update(dt) -> boolean alive, dispose() }.
import * as THREE from 'three';
import { initRubble, updateRubble, clearRubble } from './rubble';
import { G } from '../state';
import { additive, nearGlow } from '../core/materials';
import { radialBand, radialDecal, runeCircle } from '../core/textures';
import { rand } from '../util';
import { groundHeight } from '../world/ground';
import { tunable } from '../core/tuning';
import type { Effect, XYZ } from '../types';

/** Positions accept any {x, z} with optional y (ground height). */
type Pos = { x: number; y?: number; z: number };

/** Where a ground effect sits: on the floor under it (the central dais is raised), or at `pos.y` if that is higher. */
const floor = (pos: Pos): number => Math.max(pos.y ?? 0, groundHeight(pos.x, pos.z));

const active: Effect[] = [];
const GEO = {} as Record<'ring' | 'disc' | 'plane' | 'spike' | 'pillar' | 'crystal', THREE.BufferGeometry>;
const TEX = {} as Record<'scorch' | 'frost' | 'soft' | 'band' | 'rune' | 'cracks', THREE.Texture>;

export function initEffects(): void {
  initRubble();
  GEO.ring = new THREE.RingGeometry(0.82, 1, 64, 1).rotateX(-Math.PI / 2);
  GEO.disc = new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2);
  GEO.plane = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  GEO.spike = new THREE.ConeGeometry(0.22, 1.6, 5, 1).translate(0, 0.8, 0);
  TEX.scorch = radialDecal('rgba(8,6,10,0.85)', 'rgba(8,6,10,0)', true, 5);
  TEX.frost = radialDecal('rgba(170,225,255,0.55)', 'rgba(170,225,255,0)', true, 9);
  TEX.soft = radialDecal('rgba(255,255,255,1)', 'rgba(255,255,255,0)', false);
  TEX.band = radialBand();
  TEX.rune = runeCircle(3, 512);
  TEX.cracks = crackTexture();
  GEO.pillar = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true).translate(0, 0.5, 0);
  GEO.crystal = new THREE.OctahedronGeometry(0.2, 0).scale(0.55, 2.6, 0.55).translate(0, 0.35, 0);
}

export function addEffect<E extends Effect>(e: E): E { active.push(e); return e; }

export function updateEffects(dt: number): void {
  updateRubble(dt);
  for (let i = active.length - 1; i >= 0; i--) {
    if (!active[i].update(dt)) { active[i].dispose?.(); active.splice(i, 1); }
  }
}

/** For a harness (tools/lab): how many effects are going now where they were cast (not one standing, `Effect.standing`). */
export const effectsGoing = (): number => active.filter((e) => !e.standing).length;

export function clearEffects(): void { for (const e of active) e.dispose?.(); active.length = 0; clearRubble(); }

function tracked(obj: THREE.Object3D, mats: THREE.Material[]): () => void {
  G.scene.add(obj);
  return () => { G.scene.remove(obj); for (const m of mats) m.dispose(); };
}

// Expanding ground shockwave ring.
export function shockwave(pos: Pos, { color = 0xffffff, intensity = 3, from = 0.3, to = 4, life = 0.45, y = floor(pos) + 0.08, thickness = 1 } = {}) {
  const mat = additive(color, intensity);
  const m = new THREE.Mesh(GEO.ring, mat);
  m.name = 'shockwave';
  m.position.set(pos.x, y, pos.z);
  m.scale.set(from, thickness, from);
  const dispose = tracked(m, [mat]);
  let t = 0;
  return addEffect({
    update(dt: number) {
      t += dt; const k = Math.min(1, t / life);
      const s = from + (to - from) * (1 - (1 - k) ** 3);
      m.scale.set(s, 1, s);
      mat.opacity = (1 - k) ** 1.5;
      return k < 1;
    }, dispose,
  });
}

/** The ground flash's look (#214): a band of light round a dark middle, a wave spreading out (`hollow` 1), or a lit
 *  disc (0, compared in the lab: `--tune groundFlash.hollow=0`). Over the shoulder the camera looks down on the floor
 *  at the hero's feet, and the disc lit it whole: Iron Bellow's brightest sixteenth was 150 (92 without the flash),
 *  Glacial Nova's 163; hollow, 114 and 149. Made smaller or spreading from its middle, the disc still lit that floor
 *  (163 at 0.6 of its size). Its strength is never tuned: effects stay at full strength (`src/core/AGENTS.md`). */
export const GROUND_FLASH = tunable('groundFlash', { hollow: 1 });

// Flat glow on the ground (a flash under a blow or a cast).
export function groundFlash(pos: Pos, { color = 0xffffff, intensity = 2, radius = 3, life = 0.35 } = {}) {
  const mat = additive(color, intensity);
  mat.map = GROUND_FLASH.hollow ? TEX.band : TEX.soft;
  const m = new THREE.Mesh(GEO.plane, mat);
  m.name = 'ground flash';
  m.position.set(pos.x, floor(pos) + 0.06, pos.z);
  m.scale.setScalar(radius);
  const dispose = tracked(m, [mat]);
  let t = 0;
  return addEffect({ update(dt: number) { t += dt; mat.opacity = Math.max(0, 1 - t / life); return t < life; }, dispose });
}

// Ground decal that fades out (scorch / frost).
export function decal(pos: Pos, { type = 'scorch' as 'scorch' | 'frost', size = 2.5, life = 6, opacity = 1 } = {}) {
  const mat = new THREE.MeshBasicMaterial({ map: TEX[type], transparent: true, depthWrite: false, opacity, polygonOffset: true, polygonOffsetFactor: -2 });
  if (type === 'frost') { mat.blending = THREE.AdditiveBlending; mat.color.setScalar(0.8); }
  const m = new THREE.Mesh(GEO.plane, mat);
  m.name = `${type} decal`;
  m.position.set(pos.x, floor(pos) + 0.03 + Math.random() * 0.01, pos.z);
  m.rotation.y = Math.random() * Math.PI * 2;
  m.scale.setScalar(size);
  m.renderOrder = 1;
  const dispose = tracked(m, [mat]);
  let t = 0;
  return addEffect({ update(dt: number) { t += dt; mat.opacity = opacity * Math.min(1, (life - t) / 1.5); return t < life; }, dispose });
}

// Enemy attack telegraph: outline ring + filling disc. Call cancel() to remove early.
export function telegraph(pos: Pos, radius: number, duration: number, color: THREE.ColorRepresentation = 0xff3020): Effect & { cancel(): void; group: THREE.Group } {
  const ringMat = additive(color, 1.6, 0.9);
  const fillMat = additive(color, 0.8, 0.35);
  const ring = new THREE.Mesh(GEO.ring, ringMat);
  const fill = new THREE.Mesh(GEO.disc, fillMat);
  const g = new THREE.Group();
  g.add(ring, fill);
  g.position.set(pos.x, floor(pos) + 0.07, pos.z);
  ring.scale.set(radius, 1, radius);
  const dispose = tracked(g, [ringMat, fillMat]);
  let t = 0, dead = false;
  const e = addEffect<Effect & { cancel(): void; group: THREE.Group }>({
    cancel() { dead = true; },
    group: new THREE.Group(),
    update(dt: number) {
      t += dt; const k = Math.min(1, t / duration);
      fill.scale.set(radius * k, 1, radius * k);
      // a slow pulse: a large ring flashing 3+ times a second is a photosensitivity hazard
      ringMat.opacity = 0.75 + 0.25 * Math.sin(t * 9);
      return !dead && k < 1;
    }, dispose,
  });
  e.group = g;
  return e;
}

// A pool of lava left where a chunk landed (the Cinder Brute's, entities/throws.ts): a glowing disc over a scorch,
// swelling in, churning slowly (well under a beat a second) and cooling out over its last second.
export function lavaPool(pos: Pos, radius: number, life: number, color: THREE.ColorRepresentation = 0xff5a14): Effect {
  const glowMat = additive(color, 1.6);
  glowMat.map = TEX.soft;
  const coreMat = additive(0xffc060, 1.1);
  coreMat.map = TEX.soft;
  const glow = new THREE.Mesh(GEO.plane, glowMat), core = new THREE.Mesh(GEO.plane, coreMat);
  const g = new THREE.Group();
  g.add(glow, core);
  g.position.set(pos.x, floor(pos) + 0.05, pos.z);
  core.position.y = 0.01;
  decal(pos, { size: radius * 1.5, life: life + 4 });
  const dispose = tracked(g, [glowMat, coreMat]);
  let t = 0;
  return addEffect({
    update(dt: number) {
      t += dt;
      const swell = Math.min(1, t / 0.25), cool = Math.min(1, Math.max(0, life - t));
      glow.scale.setScalar(radius * (0.6 + 0.4 * swell));
      core.scale.setScalar(radius * 0.6 * (0.9 + 0.1 * Math.sin(t * 4)));
      glowMat.opacity = cool * (0.85 + 0.15 * Math.sin(t * 3.1));
      coreMat.opacity = cool * cool * 0.8;
      return t < life;
    }, dispose,
  });
}

// Jagged lightning bolt rendered as a camera-facing ribbon.
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _side = new THREE.Vector3(), _view = new THREE.Vector3();
export function lightning(from: THREE.Vector3, to: THREE.Vector3, { color = 0x9fb2ff, intensity = 5, width = 0.09, life = 0.14, segments = 12, jag = 0.5, branches = 2 } = {}) {
  const build = (a: THREE.Vector3, b: THREE.Vector3, segs: number, w: number) => {
    const pts: THREE.Vector3[] = [];
    _d.subVectors(b, a);
    for (let i = 0; i <= segs; i++) {
      const p = a.clone().addScaledVector(_d, i / segs);
      if (i > 0 && i < segs) p.add(new THREE.Vector3(rand(-jag, jag), rand(-jag, jag) * 0.6, rand(-jag, jag)));
      pts.push(p);
    }
    const pos = new Float32Array(pts.length * 2 * 3);
    G.camera.getWorldDirection(_view);
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[Math.min(i + 1, pts.length - 1)], o = pts[Math.max(i - 1, 0)];
      _side.subVectors(q, o).cross(_view).normalize().multiplyScalar(w * (1 - (i / pts.length) * 0.5));
      pos.set([p.x + _side.x, p.y + _side.y, p.z + _side.z, p.x - _side.x, p.y - _side.y, p.z - _side.z], i * 6);
    }
    const idx: number[] = [];
    for (let i = 0; i < pts.length - 1; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(idx);
    return { geo, pts };
  };
  const mat = additive(color, intensity);
  const group = new THREE.Group();
  const geos: THREE.BufferGeometry[] = [];
  const main = build(from, to, segments, width);
  group.add(new THREE.Mesh(main.geo, mat)); geos.push(main.geo);
  for (let i = 0; i < branches; i++) {
    const start = main.pts[1 + Math.floor(Math.random() * (main.pts.length - 2))];
    _a.copy(start); _b.copy(start).add(new THREE.Vector3(rand(-1.5, 1.5), rand(-1, 0.3), rand(-1.5, 1.5)));
    const br = build(_a.clone(), _b.clone(), 5, width * 0.5);
    group.add(new THREE.Mesh(br.geo, mat)); geos.push(br.geo);
  }
  G.scene.add(group);
  let t = 0;
  return addEffect({
    update(dt: number) { t += dt; mat.opacity = Math.random() < 0.3 ? 0.3 : 1 - t / life; return t < life; },
    dispose() { G.scene.remove(group); mat.dispose(); for (const g of geos) g.dispose(); },
  });
}

// Ice spikes erupting from the ground in a radius.
export function iceSpikes(center: Pos, radius: number, count = 28, inner = 0): Effect {
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xbfe8ff, emissive: 0x3aa0ff, emissiveIntensity: 0.6, roughness: 0.15, metalness: 0,
    transparent: true, opacity: 0.9, clearcoat: 1, flatShading: true,
  });
  const inst = new THREE.InstancedMesh(GEO.spike, mat, count);
  inst.castShadow = true;
  const data: { x: number; z: number; s: number; delay: number; tilt: number; rot: number; tilt2: number }[] = [];
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(inner * inner + Math.random() * (radius * radius - inner * inner));
    data.push({ x: center.x + Math.cos(a) * r, z: center.z + Math.sin(a) * r, s: rand(0.5, 1.3), delay: (r / radius) * 0.25, tilt: rand(-0.5, 0.5), rot: rand(0, 6.28), tilt2: rand(-0.5, 0.5) });
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  G.scene.add(inst);
  let t = 0; const life = 2.2;
  return addEffect({
    update(dt: number) {
      t += dt;
      for (let i = 0; i < count; i++) {
        const d = data[i];
        const lt = t - d.delay;
        let k = lt <= 0 ? 0 : Math.min(1, lt / 0.12);
        if (t > life - 0.5) k *= Math.max(0, (life - t) / 0.5);
        e.set(d.tilt, d.rot, d.tilt2); q.setFromEuler(e);
        s.set(d.s * (0.6 + 0.4 * k), d.s * k + 0.001, d.s * (0.6 + 0.4 * k));
        p.set(d.x, groundHeight(d.x, d.z) - 0.1, d.z);
        m4.compose(p, q, s);
        inst.setMatrixAt(i, m4);
      }
      inst.instanceMatrix.needsUpdate = true;
      return t < life;
    },
    dispose() { G.scene.remove(inst); mat.dispose(); inst.dispose(); },
  });
}

export function effectCount(): number { return active.length; }

// Jagged radial cracks (white on transparent), tinted by the material.
function crackTexture(): THREE.CanvasTexture {
  const size = 512, c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.strokeStyle = '#fff'; g.lineCap = 'round';
  g.shadowColor = '#fff'; g.shadowBlur = 6;
  const branch = (x: number, y: number, a: number, len: number, w: number, depth: number): void => {
    g.lineWidth = w;
    g.beginPath(); g.moveTo(x, y);
    let px = x, py = y;
    const steps = 6;
    for (let i = 0; i < steps; i++) {
      a += rand(-0.45, 0.45);
      px += Math.cos(a) * len / steps; py += Math.sin(a) * len / steps;
      g.lineTo(px, py);
      if (depth > 0 && Math.random() < 0.3) { g.stroke(); branch(px, py, a + rand(-1, 1), len * 0.45, w * 0.6, depth - 1); g.lineWidth = w; g.beginPath(); g.moveTo(px, py); }
    }
    g.stroke();
  };
  for (let i = 0; i < 11; i++) branch(size / 2, size / 2, (i / 11) * Math.PI * 2 + rand(-0.2, 0.2), rand(150, 240), 5, 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Small rotating rune glyph marking a target spot. Returns an effect with cancel(). */
export function glyphMarker(pos: Pos, { radius = 1.2, color = 0xffffff, intensity = 1.2, life = 0.5 } = {}) {
  const mat = nearGlow(new THREE.MeshBasicMaterial({ map: TEX.rune, color: new THREE.Color(color).multiplyScalar(intensity), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
  const m = new THREE.Mesh(GEO.plane, mat);
  m.name = 'glyph marker';
  m.position.set(pos.x, floor(pos) + 0.05, pos.z);
  const dispose = tracked(m, [mat]);
  let t = 0, dead = false;
  const e = addEffect({
    cancel() { dead = true; },
    update(dt: number) {
      t += dt;
      const k = Math.min(1, t / life);
      m.scale.setScalar(radius * (1.3 - 0.3 * k));
      m.rotation.y += dt * 2.5;
      mat.opacity = Math.min(1, t * 6) * (0.75 + 0.25 * Math.sin(t * 9));
      return !dead && t < life + 0.1;
    }, dispose,
  });
  return e;
}

/** Brief vertical beam of light (impact from above). `sink`: the share of its height it loses as it fades (0: its
 *  top stays where it was, for pillars that come one after another, each lit till the next's comes). */
export function lightPillar(pos: Pos, { color = 0xffffff, intensity = 3, radius = 0.6, height = 9, life = 0.45, sink = 0.4 } = {}) {
  const mat = additive(color, intensity);
  mat.side = THREE.DoubleSide;
  const m = new THREE.Mesh(GEO.pillar, mat);
  m.name = 'light pillar';
  m.position.set(pos.x, floor(pos), pos.z);
  const dispose = tracked(m, [mat]);
  let t = 0;
  return addEffect({
    update(dt: number) {
      t += dt;
      const k = t / life;
      const w = radius * (1 - k) ** 0.5;
      m.scale.set(w, height * (1 - sink * k), w);
      mat.opacity = (1 - k) ** 2;
      return k < 1;
    }, dispose,
  });
}

/** Glowing cracks in the floor that cool down and fade. */
export function crackDecal(pos: Pos, { size = 3, color = 0xffffff, intensity = 2.5, life = 3 } = {}) {
  const mat = nearGlow(new THREE.MeshBasicMaterial({ map: TEX.cracks, color: new THREE.Color(color).multiplyScalar(intensity), transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }));
  const m = new THREE.Mesh(GEO.plane, mat);
  m.name = 'crack decal';
  m.position.set(pos.x, floor(pos) + 0.04, pos.z);
  m.rotation.y = Math.random() * Math.PI * 2;
  m.scale.setScalar(size);
  const dispose = tracked(m, [mat]);
  let t = 0;
  const base = mat.color.clone();
  return addEffect({
    update(dt: number) {
      t += dt;
      const k = t / life;
      // flash hot, then cool to a dim ember glow
      mat.color.copy(base).multiplyScalar(Math.max(0, 1.6 * Math.exp(-t * 3) + 0.35 * (1 - k)));
      return k < 1;
    }, dispose,
  });
}

/** Crystals jut out of the ground around a point, then shatter. `onShatter(pos)` per crystal. */
export function crystalBurst(center: Pos, { count = 8, radius = 1.6, color = 0x5dffa8, life = 1.1, scale = 1, onShatter = null as ((p: THREE.Vector3) => void) | null } = {}): Effect {
  const mat = new THREE.MeshStandardMaterial({
    color: 0x0c2a1e, emissive: new THREE.Color(color), emissiveIntensity: 2.2, roughness: 0.15, metalness: 0.1, flatShading: true,
    transparent: true,
  });
  const inst = new THREE.InstancedMesh(GEO.crystal, mat, count);
  inst.castShadow = true;
  const data: { x: number; z: number; a: number; tilt: number; s: number; spin: number; delay: number }[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rand(-0.3, 0.3), r = rand(0.3, 1) * radius;
    // tilt outwards, away from the impact
    data.push({ x: center.x + Math.cos(a) * r, z: center.z + Math.sin(a) * r, a, tilt: rand(0.35, 0.8), s: rand(0.7, 1.3) * scale, spin: rand(0, 6.28), delay: r / radius * 0.08 });
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  G.scene.add(inst);
  let t = 0, shattered = false;
  return addEffect({
    update(dt: number) {
      t += dt;
      for (let i = 0; i < count; i++) {
        const d = data[i];
        const lt = t - d.delay;
        const grow = lt <= 0 ? 0 : 1 - (1 - Math.min(1, lt / 0.09)) ** 3;
        // axis tilted away from the centre: rotate around the tangent
        e.set(Math.sin(d.a) * d.tilt, d.spin, -Math.cos(d.a) * d.tilt, 'YXZ'); q.setFromEuler(e);
        s.set(d.s, d.s * grow + 0.001, d.s);
        p.set(d.x, Math.max(center.y ?? 0, groundHeight(d.x, d.z)) - 0.15, d.z);
        inst.setMatrixAt(i, m4.compose(p, q, s));
      }
      inst.instanceMatrix.needsUpdate = true;
      mat.emissiveIntensity = 2.2 + Math.max(0, 1 - t * 3) * 4;
      if (!shattered && t > life) {
        shattered = true;
        if (onShatter) for (const d of data) onShatter(new THREE.Vector3(d.x, 0.5 * d.s, d.z));
        return false;
      }
      return true;
    },
    dispose() { G.scene.remove(inst); mat.dispose(); inst.dispose(); },
  });
}
