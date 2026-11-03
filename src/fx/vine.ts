// The Barkhide Hulk's vine (entities/throws.ts): three strands braided round each other, creeping out along the floor
// from its feet and through whatever stands in its way, its head reared off the ground, splayed and weaving as it
// comes, leaves unfurling and tendrils curling off it once it has passed; and the coils it throws round a hero it
// holds, three strands erupting from the floor under him and winding up his legs, crossing as they go. It is a thing
// lying on the floor, not light: drawn opaque, shaded by a light of its own from above (the same in every biome and
// quality, one program), the sap in its grooves its only glow.
// Every vertex knows how far along its piece it is (`aAlong`): a piece is grown to `grow` metres (`uGrow`), each part
// swelling from nothing as the growth passes it, and withers back (`uWither`).
import * as THREE from 'three';
import { portShader, type Port, type Tsl } from '../core/shaderPorts';
import { groundHeight } from '../world/ground';

/** the braid: its middle over the floor, each strand's radius and how far it winds from the middle (m), how fast it
 *  winds (rad a metre) */
const BRAID = { base: 0.17, strand: 0.075, out: 0.11, wind: 4.5 };
/** a ring of a tube every `step` m (a curl's every `fine`), of `sides` sides */
const TUBE = { step: 0.08, fine: 0.025, sides: 7 };
/** how far behind the growth a part swells to its full size (m) */
const TIP = 0.6;
/** the head: how far back from the growth it rears (m), how high, how far its strands splay (times their winding),
 *  how far it weaves aside (m), and how long it takes to settle once the piece is grown (s) */
const HEAD = { length: 1.3, rise: 0.4, splay: 1.4, weave: 0.14, settle: 0.35 };
/** leaves: one every `every` m along it, alternating sides, `length` by `width` (m), unfurling `lag` m behind the
 *  growth */
const LEAF = { every: 0.3, length: 0.32, width: 0.14, lag: 0.5 };
/** tendrils curling off it: one every `every` m, alternating sides, `length` m long, `turns` turns, `lag` m behind */
const CURL = { every: 1.1, length: 0.8, turns: 1.6, radius: 0.025, lag: 0.7 };

/** what a vertex is part of (`aKind`), each shaded its own way */
const KIND = { strand: 0, leaf: 1, curl: 2 };

const VERT = /* glsl */`attribute vec3 aOff; attribute vec3 aFan; attribute float aAlong; attribute float aKind;
  uniform float uGrow; uniform float uWither; uniform float uTime; uniform float uRise; uniform float uHead;
  uniform vec3 uSide;
  varying vec3 vN; varying float vAlong; varying float vKind; varying float vHead;
  void main(){
    float d = uGrow - aAlong;
    float k = clamp(d / ${TIP.toFixed(2)}, 0.0, 1.0) * (1.0 - uWither);
    float head = 1.0 - clamp(d / ${HEAD.length.toFixed(2)}, 0.0, 1.0);
    head *= head * uHead;
    vec3 p = position + aFan * (1.0 + ${HEAD.splay.toFixed(2)} * head) + aOff * sqrt(k);
    p.y += uRise * head * ${HEAD.rise.toFixed(2)};
    p += uSide * uRise * head * sin(uTime * 9.0 - aAlong * 5.0) * ${HEAD.weave.toFixed(2)};
    vN = normalize(mat3(modelMatrix) * normal);
    vAlong = aAlong;
    vKind = aKind;
    vHead = head;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;
const FRAG = /* glsl */`uniform vec3 uBark; uniform vec3 uSap; uniform float uTime;
  varying vec3 vN; varying float vAlong; varying float vKind; varying float vHead;
  void main(){
    vec3 n = normalize(vN);
    // lit from above, as the scene's moon or sun would mostly light a thing on the floor (a leaf from either side)
    float facing = dot(n, normalize(vec3(0.3, 0.9, 0.2)));
    float lit = 0.3 + 0.7 * (vKind > 0.5 && vKind < 1.5 ? abs(facing) : max(facing, 0.0));
    float pulse = 0.6 + 0.4 * sin(vAlong * 2.2 - uTime * 6.0);
    if (vKind > 0.5 && vKind < 1.5) {
      vec3 leaf = mix(vec3(0.025, 0.06, 0.012), vec3(0.07, 0.16, 0.03), lit);
      gl_FragColor = vec4(leaf * (0.5 + 0.5 * lit) + uSap * 0.04, 1.0);
      return;
    }
    float groove = 0.5 + 0.5 * sin(vAlong * 23.0 + n.x * 3.0 + n.z * 2.0);
    vec3 c = uBark * lit * (0.7 + 0.4 * groove) * (vKind > 1.5 ? 1.2 : 1.0);
    // the sap runs in the grooves, pulses out towards the head and glows in it
    float vein = pow(max(0.0, 1.0 - groove * 7.0), 2.0);
    gl_FragColor = vec4(c + uSap * (0.02 + vein * pulse * 0.8 + vHead * 0.45), 1.0);
  }`;

/** `VERT` and `FRAG` on WebGPU (core/shaderPorts.ts), in WGSL */
function vinePort({ wgslFn, attribute, positionGeometry, normalLocal, modelWorldMatrix, vec4, varying }: Tsl,
  u: Tsl): Port {
  const along = attribute('aAlong', 'float');
  const head = wgslFn(`fn vineHead(along: f32, grow: f32, headK: f32) -> f32 {
    let h = 1.0 - clamp((grow - along) / ${HEAD.length.toFixed(2)}, 0.0, 1.0);
    return h * h * headK;
  }`)({ along, grow: u.uGrow, headK: u.uHead });
  const position = wgslFn(`fn vinePosition(pos: vec3f, off: vec3f, fan: vec3f, along: f32, head: f32, grow: f32,
    wither: f32, time: f32, rise: f32, side: vec3f) -> vec3f {
    let k = clamp((grow - along) / ${TIP.toFixed(2)}, 0.0, 1.0) * (1.0 - wither);
    var p = pos + fan * (1.0 + ${HEAD.splay.toFixed(2)} * head) + off * sqrt(k);
    p.y += rise * head * ${HEAD.rise.toFixed(2)};
    p += side * rise * head * sin(time * 9.0 - along * 5.0) * ${HEAD.weave.toFixed(2)};
    return p;
  }`)({
    pos: positionGeometry, off: attribute('aOff', 'vec3'), fan: attribute('aFan', 'vec3'), along, head,
    grow: u.uGrow, wither: u.uWither, time: u.uTime, rise: u.uRise, side: u.uSide,
  });
  const colour = wgslFn(`fn vineColour(nIn: vec3f, along: f32, kind: f32, head: f32, bark: vec3f, sap: vec3f,
    time: f32) -> vec4f {
    let n = normalize(nIn);
    let facing = dot(n, normalize(vec3f(0.3, 0.9, 0.2)));
    let isLeaf = kind > 0.5 && kind < 1.5;
    let lit = 0.3 + 0.7 * select(max(facing, 0.0), abs(facing), isLeaf);
    let pulse = 0.6 + 0.4 * sin(along * 2.2 - time * 6.0);
    if (isLeaf) {
      let leaf = mix(vec3f(0.025, 0.06, 0.012), vec3f(0.07, 0.16, 0.03), lit);
      return vec4f(leaf * (0.5 + 0.5 * lit) + sap * 0.04, 1.0);
    }
    let groove = 0.5 + 0.5 * sin(along * 23.0 + n.x * 3.0 + n.z * 2.0);
    let c = bark * lit * (0.7 + 0.4 * groove) * select(1.0, 1.2, kind > 1.5);
    let vein = pow(max(0.0, 1.0 - groove * 7.0), 2.0);
    return vec4f(c + sap * (0.02 + vein * pulse * 0.8 + head * 0.45), 1.0);
  }`);
  return {
    position,
    fragment: colour({
      nIn: varying(modelWorldMatrix.mul(vec4(normalLocal, 0)).xyz), along: varying(along),
      kind: varying(attribute('aKind', 'float')), head: varying(head), bark: u.uBark, sap: u.uSap, time: u.uTime,
    }),
  };
}

/** One piece of vine: its mesh, grown to `grow` metres and withered by `wither` (0 to 1) each frame. */
export interface Vine {
  mesh: THREE.Mesh;
  grow: number;
  wither: number;
  /** its length grown in full (m) */
  length: number;
  update(time: number): void;
  dispose(): void;
}

/** A piece's vertices as they're built. */
class Parts {
  readonly pos: number[] = [];
  readonly normal: number[] = [];
  readonly off: number[] = [];
  readonly fan: number[] = [];
  readonly along: number[] = [];
  readonly kind: number[] = [];
  readonly index: number[] = [];

  get count(): number {
    return this.pos.length / 3;
  }

  /** A vertex at `at` (its growth's place), out by `fan` (the head splays it) and `off` (it swells to it). */
  vertex(at: THREE.Vector3, fan: THREE.Vector3, off: THREE.Vector3, normal: THREE.Vector3, along: number,
    kind: number): void {
    this.pos.push(at.x, at.y, at.z);
    this.fan.push(fan.x, fan.y, fan.z);
    this.off.push(off.x, off.y, off.z);
    this.normal.push(normal.x, normal.y, normal.z);
    this.along.push(along);
    this.kind.push(kind);
  }

  geometry(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.normal, 3));
    geo.setAttribute('aOff', new THREE.Float32BufferAttribute(this.off, 3));
    geo.setAttribute('aFan', new THREE.Float32BufferAttribute(this.fan, 3));
    geo.setAttribute('aAlong', new THREE.Float32BufferAttribute(this.along, 1));
    geo.setAttribute('aKind', new THREE.Float32BufferAttribute(this.kind, 1));
    geo.setIndex(this.index);
    geo.computeBoundingSphere();
    // (bound by its growth's places alone: out by its girth, its splay and its reared head)
    geo.boundingSphere!.radius += BRAID.out * (1 + HEAD.splay) + BRAID.strand + HEAD.rise + LEAF.length;
    return geo;
  }
}

/** A strand's place `along` m along its piece: where its growth is (`at`) and how far out of it it winds (`fan`). */
type Strand = (along: number, at: THREE.Vector3, fan: THREE.Vector3) => void;

const _a = new THREE.Vector3(), _f = new THREE.Vector3(), _a2 = new THREE.Vector3(), _f2 = new THREE.Vector3();
const _t = new THREE.Vector3(), _n = new THREE.Vector3(), _b = new THREE.Vector3(), _o = new THREE.Vector3();
const _p = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), SIDE = new THREE.Vector3(1, 0, 0);
const ZERO = new THREE.Vector3();

/** A tube round `strand` from `from` to `to` m along it, `radius` thick there, into `parts`; its growth placed `lag` m
 *  further along than the strand. */
function tube(parts: Parts, strand: Strand, from: number, to: number, radius: (u: number) => number, kind: number,
  lag = 0): void {
  const step = kind === KIND.curl ? TUBE.fine : TUBE.step;
  const rings = Math.max(2, Math.ceil((to - from) / step) + 1), first = parts.count;
  for (let i = 0; i < rings; i++) {
    const u = from + (i / (rings - 1)) * (to - from);
    const v = i < rings - 1 ? u + 0.01 : u - 0.01;
    strand(u, _a, _f);
    strand(v, _a2, _f2);
    _t.copy(_a2).add(_f2).sub(_a).sub(_f).multiplyScalar(v > u ? 1 : -1).normalize();
    _b.crossVectors(_t, Math.abs(_t.y) > 0.9 ? SIDE : UP).normalize();
    _n.crossVectors(_b, _t);
    const r = radius(u);
    for (let s = 0; s < TUBE.sides; s++) {
      const angle = (s / TUBE.sides) * Math.PI * 2;
      _o.copy(_n).multiplyScalar(Math.cos(angle)).addScaledVector(_b, Math.sin(angle));
      parts.vertex(_a, _f, _p.copy(_o).multiplyScalar(r), _o, u + lag, kind);
    }
  }
  for (let i = 0; i < rings - 1; i++) {
    for (let s = 0; s < TUBE.sides; s++) {
      const a = first + i * TUBE.sides + s, b = first + i * TUBE.sides + ((s + 1) % TUBE.sides);
      parts.index.push(a, a + TUBE.sides, b, b, a + TUBE.sides, b + TUBE.sides);
    }
  }
}

/** A leaf on `strand` at `u` m, pointing `out` (a unit way, tipped up a little): an oval drawn to a point, raised
 *  along its rib. */
function leaf(parts: Parts, strand: Strand, u: number, out: THREE.Vector3): void {
  strand(u, _a, _f);
  const across = _b.crossVectors(out, UP).normalize();
  const normal = _n.crossVectors(across, out).normalize();
  if (normal.y < 0) normal.negate();
  const first = parts.count, along = u + LEAF.lag;
  const point = (x: number, y: number, lift: number): void => {
    _o.copy(out).multiplyScalar(x * LEAF.length).addScaledVector(across, y * LEAF.width).addScaledVector(normal, lift);
    parts.vertex(_a, _f, _o, normal, along, KIND.leaf);
  };
  point(0.5, 0, 0.025);
  const rim: [number, number][] = [[0, 0], [0.25, -0.42], [0.62, -0.38], [1, 0], [0.62, 0.38], [0.25, 0.42]];
  for (const [x, y] of rim) point(x, y, -0.01 * Math.abs(y));
  for (let i = 0; i < rim.length; i++) parts.index.push(first, first + 1 + i, first + 1 + ((i + 1) % rim.length));
}

/** A material of the vine's for `bark` and `sap`, its head rearing by `rise` (0: none) and weaving along `side`. */
function material(bark: number, sap: number, rise: number, side: THREE.Vector3) {
  const uniforms = {
    uGrow: { value: 0 }, uWither: { value: 0 }, uTime: { value: 0 }, uRise: { value: rise }, uHead: { value: 1 },
    uSide: { value: side.clone() }, uBark: { value: new THREE.Color(bark) }, uSap: { value: new THREE.Color(sap) },
  };
  const mat = portShader(new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide }),
    vinePort);
  return { mat, uniforms };
}

function vineOf(parts: Parts, length: number, look: ReturnType<typeof material>, name: string): Vine {
  const geo = parts.geometry();
  const mesh = new THREE.Mesh(geo, look.mat);
  mesh.name = name;
  // (the head rears, splays and glows while the piece grows, and settles once it's grown)
  let growing = -Infinity;
  const vine: Vine = {
    mesh, grow: 0, wither: 0, length,
    update(time) {
      if (vine.grow < length) growing = time;
      look.uniforms.uHead.value = Math.max(0, 1 - (time - growing) / HEAD.settle);
      look.uniforms.uGrow.value = vine.grow;
      look.uniforms.uWither.value = vine.wither;
      look.uniforms.uTime.value = time;
    },
    dispose() {
      mesh.removeFromParent();
      geo.dispose();
      look.mat.dispose();
    },
  };
  return vine;
}

/** A vine lying along the floor from (x, z) along (dx, dz) (a unit way) for `length` metres, through anything in its
 *  way, wandering a little either side of its line: three strands braided round its middle, leaves and curling
 *  tendrils off it. In world space. */
export function groundVine(x: number, z: number, dx: number, dz: number, length: number, bark: number,
  sap: number): Vine {
  const side = new THREE.Vector3(-dz, 0, dx), ahead = new THREE.Vector3(dx, 0, dz);
  const wander = (u: number): number => Math.sin(u * 1.3) * 0.12 + Math.sin(u * 3.1 + 1) * 0.05;
  const middle = (u: number, out: THREE.Vector3): THREE.Vector3 => {
    const px = x + dx * u - dz * wander(u), pz = z + dz * u + dx * wander(u);
    return out.set(px, groundHeight(px, pz) + BRAID.base, pz);
  };
  const strand = (phase: number): Strand => (u, at, fan) => {
    middle(u, at);
    const angle = u * BRAID.wind + phase;
    fan.copy(side).multiplyScalar(Math.cos(angle) * BRAID.out).addScaledVector(UP, Math.sin(angle) * BRAID.out * 0.8);
  };
  const parts = new Parts();
  const strands = [0, 1, 2].map((i) => strand((i / 3) * Math.PI * 2));
  const girth = (i: number) => (u: number): number => BRAID.strand * (0.9 + 0.15 * Math.sin(u * 2.3 + i * 2));
  strands.forEach((s, i) => tube(parts, s, 0, length, girth(i), KIND.strand));
  for (let u = LEAF.every, i = 0; u < length - TIP; u += LEAF.every, i++) {
    const out = _p.copy(side).multiplyScalar(i % 2 ? 1 : -1).addScaledVector(ahead, 0.5).addScaledVector(UP, 0.35);
    out.normalize();
    leaf(parts, strands[i % 3], u, out.clone());
  }
  for (let u = CURL.every * 0.6, i = 0; u < length - TIP; u += CURL.every, i++) {
    tube(parts, curlOff(middle, side, ahead, u, i % 2 ? 1 : -1), 0, CURL.length,
      (s) => CURL.radius * (1 - 0.6 * s / CURL.length), KIND.curl, u + CURL.lag);
  }
  return vineOf(parts, length, material(bark, sap, 1, side), 'vine');
}

/** A tendril curling off the vine at `u` m to one side (`sign`), as a strand of its own: its growth runs from 0 at
 *  the vine out to its curled end, a spiral drawn in tighter as it goes and lifting off the floor. */
function curlOff(middle: (u: number, out: THREE.Vector3) => THREE.Vector3, side: THREE.Vector3, ahead: THREE.Vector3,
  u: number, sign: number): Strand {
  const base = middle(u, new THREE.Vector3());
  const reach = 0.24;
  const centre = base.clone().addScaledVector(side, sign * reach);
  return (s, at, fan) => {
    const k = s / CURL.length, angle = Math.PI + k * CURL.turns * Math.PI * 2, r = reach * (1 - 0.75 * k);
    at.copy(centre).addScaledVector(side, sign * Math.cos(angle) * r).addScaledVector(ahead, Math.sin(angle) * r);
    at.y += k * 0.18 - 0.04;
    fan.copy(ZERO);
  };
}

/** a coil's length along its turns (m), and how far under the floor it starts */
const COIL_LENGTH = 5;
const COIL_FROM = 0.3;

/** The coils a vine throws round a hero it holds: three strands erupting from the floor under him and winding up his
 *  legs to `high`, narrowing and crossing each other as they go, a few leaves on them. Placed by its mesh's position at
 *  his feet. */
export function coils(high: number, bark: number, sap: number): Vine {
  const turns = 2.6;
  const strand = (phase: number): Strand => (u, at, fan) => {
    const k = u / COIL_LENGTH, angle = k * turns * Math.PI * 2 + phase, r = 0.26 - 0.08 * k;
    at.set(Math.cos(angle) * r, -COIL_FROM + k * (high + COIL_FROM), Math.sin(angle) * r);
    // (each weaving in and out across the others: braided round his legs)
    const weave = Math.sin(u * 7 + phase * 3) * 0.04;
    fan.set(Math.cos(angle) * weave, Math.cos(u * 7 + phase * 3) * 0.04, Math.sin(angle) * weave);
  };
  const parts = new Parts();
  const strands = [0, 1, 2].map((i) => strand((i / 3) * Math.PI * 2));
  const girth = (i: number) => (u: number): number => (0.05 - 0.015 * u / COIL_LENGTH) * (1 - 0.1 * i);
  strands.forEach((s, i) => tube(parts, s, 0, COIL_LENGTH, girth(i), KIND.strand));
  for (let u = 1.2, i = 0; u < COIL_LENGTH - 0.4; u += 0.55, i++) {
    strands[i % 3](u, _a, _f);
    const out = _p.set(_a.x, 0, _a.z).normalize().addScaledVector(UP, 0.6).normalize();
    leaf(parts, strands[i % 3], u, out.clone());
  }
  return vineOf(parts, COIL_LENGTH, material(bark, sap, 0, ZERO), 'vine coils');
}

/** A short vine, for the warm-up to compile its program. */
export function vineSamples(): THREE.Mesh[] {
  const vine = groundVine(0, 0, 1, 0, 2, 0x2a3a18, 0x9cff3a);
  vine.grow = 2;
  vine.update(0);
  return [vine.mesh];
}
