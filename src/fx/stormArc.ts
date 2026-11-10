// An arc of lightning that travels and stays (the lightning staff's, #402; from play: "we need lightning effect to
// be fancier and stay there longer so user can see it", "it also need to travel first, and then do damage"). Its
// head races from where it starts to where it strikes along a jagged path, the arc drawn behind it; arrived
// (`onArrive`: its damage lands then), it stays for `linger` s, crawling along its length and fading out: a white
// core in a wider glow of its colour, forks branching off it as the head passes them, sparks thrown off along it.
// Ribbons turned to the camera each frame, as fx/effects.ts's `lightning`; it eases out and never blinks (a thin
// thing, but one that stays is held to the root's Bright effects all the same).
import * as THREE from 'three';
import { G } from '../state';
import { additive } from '../core/materials';
import { addEffect } from './effects';
import { particles, col } from './particles';
import { rand } from '../util';
import type { Effect } from '../types';

export interface StormArcOpts {
  color: THREE.ColorRepresentation;
  /** its core's half width (m); the glow round it is `GLOW_WIDE` times that */
  width?: number;
  /** the head's speed (m/s), and the least and most it takes to arrive (s) */
  speed?: number;
  /** how long it stays once arrived (s) */
  linger?: number;
  /** how far its path wanders off the straight line (m) */
  jag?: number;
  /** forks off it */
  forks?: number;
  /** how bright (its materials' colour times this) */
  intensity?: number;
  /** run once, as its head arrives */
  onArrive?(): void;
}

/** the least and most an arc takes to arrive (s): slow enough to watch it run out to the foe (from play: "lightning
 *  should be little slower so people can enjoy it traveling to enemy"), never so slow the foe has walked off */
const ARRIVE = { least: 0.16, most: 0.55 };
// (a narrow glow: at 3.2 times the core and brighter, a full charge's arc was a white blob a third of a metre
// across from above, its jags lost in it, and a sixteenth of the screen went past the light budget, `lab cast`)
const GLOW_WIDE = 2.4;
/** a point of its path every this far (m), within these counts */
const STEP = 0.55, POINTS = { least: 8, most: 40 };
/** the arc is its full width from this far off the camera (m), and never thinner than this share of it */
const NEAR = { full: 7, least: 0.14 };
/** how far each point crawls about its place as the arc stays (a share of `jag`), and how fast (rad/s) */
const CRAWL = { by: 0.35, rate: 17 };

interface Strand {
  /** its points at rest, and each one's own phase for the crawl */
  rest: THREE.Vector3[];
  phase: number[];
  /** where along the main arc it leaves (0..1: the head must have passed it) and how soon it fades (a share of the linger) */
  from: number;
  fade: number;
  wide: number;
  core: THREE.Mesh;
  glow: THREE.Mesh;
}

const _view = new THREE.Vector3(), _side = new THREE.Vector3(), _p = new THREE.Vector3(), _q = new THREE.Vector3(), _r = new THREE.Vector3(), _o = new THREE.Vector3();

/** A jagged path from `a` to `b`, its ends in place. */
function path(a: THREE.Vector3, b: THREE.Vector3, wander: number): THREE.Vector3[] {
  // (a short arc wanders less: a few metres long, jags meant for a long one folded it back on itself)
  const jag = Math.min(wander, a.distanceTo(b) * 0.1);
  const n = Math.min(POINTS.most, Math.max(POINTS.least, Math.round(a.distanceTo(b) / STEP)));
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const k = i / n, p = a.clone().lerp(b, k);
    // (wandering most at its middle, a slow bend under the quick jags)
    const mid = Math.sin(k * Math.PI);
    if (i > 0 && i < n) p.add(new THREE.Vector3(rand(-jag, jag), rand(-jag, jag) * 0.6, rand(-jag, jag)).multiplyScalar(0.45 + 0.55 * mid));
    pts.push(p);
  }
  return pts;
}

/** A ribbon's geometry for `count` points, placed each frame by `lay`. */
function ribbon(count: number): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 2 * 3), 3));
  const index: number[] = [];
  for (let i = 0; i < count - 1; i++) { const k = i * 2; index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  geo.setIndex(index);
  return geo;
}

/** The strand's points this frame (crawled about their rest by `crawl`), laid as a ribbon `wide` across turned to the
 *  camera, drawn as far as `shown` of its length. */
function lay(strand: Strand, mesh: THREE.Mesh, wide: number, shown: number, t: number, crawl: number): void {
  const pos = mesh.geometry.attributes.position as THREE.BufferAttribute, pts = strand.rest, n = pts.length;
  const at = (i: number, out: THREE.Vector3): THREE.Vector3 => {
    const ph = strand.phase[i], ends = i === 0 || i === n - 1 ? 0 : 1;
    return out.copy(pts[i]).add(_o.set(Math.sin(t * CRAWL.rate + ph), Math.sin(t * CRAWL.rate * 0.8 + ph * 1.7) * 0.6, Math.cos(t * CRAWL.rate * 1.1 + ph * 0.6)).multiplyScalar(crawl * ends));
  };
  for (let i = 0; i < n; i++) {
    at(i, _p);
    _side.subVectors(at(Math.min(i + 1, n - 1), _q), at(Math.max(i - 1, 0), _r)).cross(_view);
    // (tapering to its far end; and thinner the nearer the eye, to `NEAR.least` of its width: a ribbon as wide in
    // the world at the staff's head as out at the foe was a slab across the view through the eyes, `lab cast`)
    const near = Math.min(1, Math.max(NEAR.least, _p.distanceTo(G.camera.position) / NEAR.full));
    _side.setLength(wide * near * (1 - 0.55 * (i / (n - 1))));
    pos.setXYZ(i * 2, _p.x + _side.x, _p.y + _side.y, _p.z + _side.z);
    pos.setXYZ(i * 2 + 1, _p.x - _side.x, _p.y - _side.y, _p.z - _side.z);
  }
  pos.needsUpdate = true;
  mesh.geometry.setDrawRange(0, Math.max(0, Math.floor(shown * (n - 1))) * 6);
}

/** An arc from `from` to `to`: travelling there, then staying. */
export function stormArc(from: THREE.Vector3, to: THREE.Vector3, opts: StormArcOpts): Effect {
  const { color, width = 0.05, speed = 30, linger = 0.6, jag = 0.4, forks = 2, intensity = 3 } = opts;
  const arrive = Math.min(ARRIVE.most, Math.max(ARRIVE.least, from.distanceTo(to) / speed));
  const coreMat = additive(0xffffff, intensity), glowMat = additive(color, intensity * 0.4, 0.5);
  coreMat.depthWrite = glowMat.depthWrite = false;
  const group = new THREE.Group();
  group.name = 'Storm arc';
  const strands: Strand[] = [];
  const strand = (a: THREE.Vector3, b: THREE.Vector3, bend: number, wide: number, leaves: number, fade: number): Strand => {
    const rest = path(a, b, bend);
    const core = new THREE.Mesh(ribbon(rest.length), coreMat), glow = new THREE.Mesh(ribbon(rest.length), glowMat);
    core.frustumCulled = glow.frustumCulled = false;
    group.add(glow, core);
    const made = { rest, phase: rest.map(() => rand(0, 6.28)), from: leaves, fade, wide, core, glow };
    strands.push(made);
    return made;
  };
  const main = strand(from, to, jag, width, 0, 1);
  for (let i = 0; i < forks; i++) {
    // (a fork leaves a point of the arc and runs on a way, bent off its line)
    const k = rand(0.2, 0.85), at = main.rest[Math.round(k * (main.rest.length - 1))];
    const on = _p.subVectors(to, from).normalize().multiplyScalar(rand(0.8, 1.8));
    const end = at.clone().add(on).add(new THREE.Vector3(rand(-1, 1), rand(-0.6, 0.5), rand(-1, 1)));
    strand(at.clone(), end, jag * 0.6, width * 0.5, k, rand(0.35, 0.6));
  }
  G.scene.add(group);
  const spark = col(0xffffff, 3), sparkEnd = col(color, 1.5);
  let t = 0, arrived = false;
  return addEffect({
    update(dt: number) {
      t += dt;
      const head = Math.min(1, t / arrive);
      if (head >= 1 && !arrived) { arrived = true; opts.onArrive?.(); }
      const stayed = Math.max(0, t - arrive) / linger;
      G.camera.getWorldDirection(_view);
      for (const s of strands) {
        // (a fork runs out once the head has passed where it leaves, in a third of the arc's own time)
        const shown = s === main ? head : Math.min(1, Math.max(0, (t / arrive - s.from) * 3));
        // (swelling a little as it lands, then thinning away as it fades)
        const left = Math.max(0, 1 - stayed / s.fade), wide = s.wide * (0.35 + 0.65 * left) * (arrived ? 1 + 0.5 * Math.exp(-(t - arrive) * 18) : 1);
        s.core.visible = s.glow.visible = left > 0 && shown > 0;
        if (!s.core.visible) continue;
        lay(s, s.core, wide, shown, t, jag * CRAWL.by);
        lay(s, s.glow, wide * GLOW_WIDE, shown, t, jag * CRAWL.by);
      }
      // (eased out, a slow shimmer over it: never a blink)
      const fade = 1 - stayed, lit = fade * fade * (0.88 + 0.12 * Math.sin(t * 9));
      coreMat.opacity = Math.max(0, lit);
      glowMat.opacity = Math.max(0, 0.5 * lit);
      // sparks thrown off along it while it stays
      const want = (arrived ? 26 * fade : 40) * dt, n = Math.floor(want) + (Math.random() < want % 1 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const p = main.rest[Math.floor(Math.random() * Math.max(1, Math.floor(head * (main.rest.length - 1)) + 1))];
        particles.glow.spawn({
          x: p.x, y: p.y, z: p.z, vx: rand(-1.5, 1.5), vy: rand(-0.5, 1.5), vz: rand(-1.5, 1.5),
          life: rand(0.15, 0.35), size: rand(0.04, 0.09), sizeEnd: 0.01, color: spark, colorEnd: sparkEnd, drag: 2, gravity: 4,
        });
      }
      return stayed < 1;
    },
    dispose() {
      G.scene.remove(group);
      coreMat.dispose(); glowMat.dispose();
      for (const s of strands) { s.core.geometry.dispose(); s.glow.geometry.dispose(); }
    },
  });
}
