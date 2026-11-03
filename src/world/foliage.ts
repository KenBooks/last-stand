// Foliage for the Thornwood: canvas-painted leaf textures (a cluster of leaves, a fern frond, a single
// leaf) cut out with alpha test, and the geometry that carries them: canopies and bushes of leaf cards
// round a dark core, fern clumps, leaf litter, and shafts of sunlight slanting down through the canopy.
import * as THREE from 'three';
import { WEBGPU } from '../core/webgpu';
import { shaftsMaterial } from './forestNodes';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ctx2d, textureFromCanvas } from '../core/textures';
import { lumpy } from './props';
import { mulberry, TAU } from '../util';

const canvas = (w: number, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

/** one leaf: an almond blade from (0, 0) along +x, with a midrib */
function paintLeaf(g: CanvasRenderingContext2D, x: number, y: number, a: number, len: number, wid: number, fill: string, rib: string): void {
  g.save(); g.translate(x, y); g.rotate(a);
  g.fillStyle = fill;
  g.beginPath(); g.moveTo(0, 0);
  g.bezierCurveTo(len * 0.3, -wid, len * 0.75, -wid * 0.8, len, 0);
  g.bezierCurveTo(len * 0.75, wid * 0.8, len * 0.3, wid, 0, 0);
  g.fill();
  g.strokeStyle = rib; g.lineWidth = Math.max(1, wid * 0.12);
  g.beginPath(); g.moveTo(0, 0); g.lineTo(len * 0.9, 0); g.stroke();
  g.restore();
}

/**
 * A round cluster of leaves on transparent: the card for canopies and bushes. Painted light and near
 * neutral green, so each tree's instance colour sets its hue; darker leaves at the back of the pile.
 */
export function leafClusterTexture(seed = 7): THREE.CanvasTexture {
  const S = 512, c = canvas(S), g = ctx2d(c), r = mulberry(seed);
  const leaves: [number, number, number, number, number][] = [];
  for (let i = 0; i < 220; i++) {
    const a = r() * TAU, d = Math.sqrt(r()) * S * 0.37;
    leaves.push([S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, a + (r() - 0.5) * 1.4, S * (0.065 + r() * 0.045) * (1 - d / S * 0.7), r()]);
  }
  // paint back to front: the outer and darker leaves first
  leaves.sort((p, q) => p[4] - q[4]);
  for (const [x, y, a, len, k] of leaves) {
    const v = 0.45 + k * 0.55, warm = r() < 0.15 ? 30 : 0;
    const fill = `rgb(${Math.round((120 + warm) * v)},${Math.round(200 * v)},${Math.round(90 * v)})`;
    paintLeaf(g, x - Math.cos(a) * len * 0.5, y - Math.sin(a) * len * 0.5, a, len, len * 0.36, fill, `rgba(30,50,20,${0.35 * v})`);
  }
  const t = textureFromCanvas(c);
  t.anisotropy = 4;
  return t;
}

/** A fern frond, base at the bottom of the image and tip at the top: a stem with paired leaflets. */
export function fernTexture(seed = 3): THREE.CanvasTexture {
  const W = 64, H = 256, c = canvas(W, H), g = ctx2d(c), r = mulberry(seed);
  g.strokeStyle = 'rgb(70,110,40)'; g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(W / 2, H); g.lineTo(W / 2, 4); g.stroke();
  for (let i = 0; i < 22; i++) {
    const t = i / 22, y = H - 12 - t * (H - 20), len = (W / 2 - 3) * (1 - t * 0.8) * (0.9 + r() * 0.2);
    for (const s of [-1, 1]) {
      const v = 0.75 + r() * 0.25;
      paintLeaf(g, W / 2, y, s > 0 ? -0.5 : Math.PI + 0.5, len, len * 0.28, `rgb(${Math.round(110 * v)},${Math.round(190 * v)},${Math.round(80 * v)})`, 'rgba(40,70,25,0.4)');
    }
  }
  return textureFromCanvas(c);
}

/** A single leaf pointing up the image, pale (tinted per instance): leaf litter and ivy. */
export function leafTexture(): THREE.CanvasTexture {
  const S = 64, c = canvas(S), g = ctx2d(c);
  paintLeaf(g, S / 2, S - 3, -Math.PI / 2, S - 6, S * 0.3, 'rgb(225,225,215)', 'rgba(80,70,50,0.5)');
  g.strokeStyle = 'rgba(80,70,50,0.35)'; g.lineWidth = 1;
  for (let i = 1; i < 5; i++) for (const s of [-1, 1]) {
    const y = S - 3 - i * (S - 6) / 5.5;
    g.beginPath(); g.moveTo(S / 2, y); g.lineTo(S / 2 + s * S * 0.22 * (1 - i / 6), y - 6); g.stroke();
  }
  return textureFromCanvas(c);
}

/** how far into a crown's leaves a body walks up to it, as its core's size swollen about its middle: the cards stand
 *  0.62 to 0.92 of a blob's size out, each about as wide again */
const LEAF_REACH = 1.4;

/**
 * A canopy: leaf cards over overlapping blobs [x, y, z, radius], each card facing out from its blob,
 * plus a dark core that fills the gaps. The normals of both point out from the blob, not the card or the
 * core's facets, so the whole crown lights as one soft mass instead of a heap of flat planes.
 */
export function canopyGeo(rng: () => number, blobs: [number, number, number, number][], cardsPerBlob: number, card: number): { core: THREE.BufferGeometry; cards: THREE.BufferGeometry; lumps: THREE.BufferGeometry[]; leafLumps: THREE.BufferGeometry[] } {
  const cores: THREE.BufferGeometry[] = [], cards: THREE.BufferGeometry[] = [], leafLumps: THREE.BufferGeometry[] = [];
  const q = new THREE.Quaternion(), z = new THREE.Vector3(0, 0, 1), roll = new THREE.Quaternion(), n = new THREE.Vector3();
  // out from the blob, tipped up: the top of a crown catches the light
  const soft = (g: THREE.BufferGeometry, x: number, y: number, zz: number, s: number) => {
    const p = g.attributes.position, nr = g.attributes.normal;
    for (let k = 0; k < p.count; k++) { n.set(p.getX(k) - x, (p.getY(k) - y) * 1.3 + s * 0.3, p.getZ(k) - zz).normalize(); nr.setXYZ(k, n.x, n.y, n.z); }
  };
  blobs.forEach(([x, y, zz, s], bi) => {
    const core = lumpy(new THREE.IcosahedronGeometry(1, 1), 0.15, bi * 7 + rng()).scale(s * 0.62, s * 0.52, s * 0.62).translate(x, y, zz);
    soft(core, x, y, zz, s);
    cores.push(core);
    leafLumps.push(core.clone().translate(-x, -y, -zz).scale(LEAF_REACH, LEAF_REACH, LEAF_REACH).translate(x, y, zz));
    for (let i = 0; i < cardsPerBlob; i++) {
      // all round, a little more on top, where the light and the camera are: a crown has no flat underside
      const d = new THREE.Vector3(rng() * 2 - 1, rng() * 2 - 0.85, rng() * 2 - 1).normalize();
      const size = card * (0.8 + rng() * 0.45) * s;
      const g = new THREE.PlaneGeometry(size, size);
      q.setFromUnitVectors(z, d);
      roll.setFromAxisAngle(d, rng() * TAU);
      g.applyQuaternion(q.premultiply(roll));
      // tilt each card off the surface a little, so the edge of the crown is ragged
      g.rotateX((rng() - 0.5) * 0.9).rotateZ((rng() - 0.5) * 0.9);
      const at = d.clone().multiplyScalar(s * (0.62 + rng() * 0.3));
      g.translate(x + at.x, y + at.y, zz + at.z);
      soft(g, x, y, zz, s);
      cards.push(g);
    }
  });
  // (and each blob's core alone, and swollen into its leaves: the wall meets each by its own hull, world/wall.ts)
  return { core: mergeGeometries(cores.map((g) => g.index ? g.toNonIndexed() : g))!, cards: mergeGeometries(cards)!, lumps: cores, leafLumps };
}

/** A clump of arching fern fronds, rooted at the origin, about 1 across; normals up like the ground. */
export function fernClumpGeo(rng: () => number, fronds = 7): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const segs = 5;
  for (let f = 0; f < fronds; f++) {
    const a = (f / fronds) * TAU + rng() * 0.5, len = 0.55 + rng() * 0.35, w = 0.13 * len / 0.7, rise = 0.35 + rng() * 0.2;
    const dx = Math.cos(a), dz = Math.sin(a), sx = -dz, sz = dx;
    const base = pos.length / 3;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs, out = len * t, up = Math.sin(t * Math.PI * 0.75) * rise * len - t * t * 0.1;
      for (const s of [-1, 1]) {
        // the frond cups slightly: its edges droop below the stem
        pos.push(dx * out + sx * s * w, Math.max(0.01, up - Math.abs(s) * 0.02 * t), dz * out + sz * s * w);
        uv.push(s < 0 ? 0 : 1, t);
      }
    }
    for (let i = 0; i < segs; i++) { const k = base + i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  return g;
}

/** A fallen leaf lying on the ground (a small quad for the leaf texture), facing up. */
export const litterGeo = (): THREE.BufferGeometry => new THREE.PlaneGeometry(0.13, 0.19).rotateX(-Math.PI / 2).translate(0, 0.015, 0);

/**
 * Shafts of light: soft columns slanting down along `dir` (towards the sun) onto each spot, brightest along
 * their axis as seen from the camera (a volume, not a tube), fading in from the canopy and out at the ground,
 * with slow motes of dust drifting through. Additive and faint (`color`), and they never flash.
 */
export function lightShafts(spots: [number, number, number][], dir: THREE.Vector3, color: THREE.Color): { group: THREE.Group; update: (t: number) => void } {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: color } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vV; varying float vH; varying vec2 vUv;
      void main(){
        vUv = uv; vH = uv.y;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform vec3 uColor;
      varying vec3 vN; varying vec3 vV; varying float vH; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main(){
        float facing = abs(dot(normalize(vN), normalize(vV)));
        float core = pow(facing, 4.0);
        // fade in below the canopy, out where it meets the ground
        float along = smoothstep(0.0, 0.08, vH) * (1.0 - smoothstep(0.55, 1.0, vH));
        float dust = 0.65 + 0.35 * n(vec2(vUv.x * 6.0, vH * 14.0 - uTime * 0.15));
        float a = core * along * dust;
        gl_FragColor = vec4(uColor * a, 1.0);
      }`,
  });
  const drawnWith = WEBGPU ? shaftsMaterial(mat.uniforms.uTime, color) : mat;
  const group = new THREE.Group();
  const d = dir.clone().normalize(), up = new THREE.Vector3(0, 1, 0);
  const L = 26, at = new THREE.Object3D(), shafts: THREE.BufferGeometry[] = [];
  at.quaternion.setFromUnitVectors(up, d);
  for (const [x, z, rad] of spots) {
    // an open cone, its uv.y 0 at the ground end and 1 up in the canopy
    at.position.set(x, 0, z);
    at.updateMatrix();
    shafts.push(new THREE.CylinderGeometry(rad * 1.25, rad, L, 20, 1, true).translate(0, L / 2, 0).applyMatrix4(at.matrix));
  }
  // (all in one mesh: added light, so their order is nothing; a mesh a shaft, they were 9 draws a frame)
  const m = new THREE.Mesh(mergeGeometries(shafts), drawnWith);
  m.renderOrder = 5;
  m.frustumCulled = false;
  group.add(m);
  return { group, update: (t) => { mat.uniforms.uTime.value = t; } };
}
