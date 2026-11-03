// Void Lance: channeled piercing beam. The hand first draws a portal in the air (a spark tracing a
// circle that opens into turning rune rings); only once it is open does the lance pour out of it.
import * as THREE from 'three';
import { nearGlow } from '../../core/materials';
import { portShader, wgslNoise } from '../../core/shaderPorts';
import { G } from '../../state';
import { hitEnemy } from '../damage';
import { evades } from '../../entities/evade';
import type { Enemy } from '../../entities/enemy';
import { particles, col, burst } from '../../fx/particles';
import { flash, release } from '../../fx/lights';
import { sfx } from '../../core/audio';
import { viewMode } from '../../core/renderer';
import { rand } from '../../util';
import { hurtProp, PROP_DAMAGE } from '../../world/destructible';
import type { Obstacle } from '../../types';
import type { ChannelSkill, Needs } from './types';
import type { LightSlot } from '../../fx/lights';
import { addField } from '../../entities/corpse';
import { GRAVITY, type Field } from '../../entities/ragdoll';

type Def = Needs<'damage' | 'length' | 'width'>;

/** Per-channel state: beam and portal meshes, lights and the damage tick timer. */
interface LanceState {
  outer: THREE.Mesh; core: THREE.Mesh; portal: THREE.Mesh;
  outerMat: THREE.ShaderMaterial; coreMat: THREE.ShaderMaterial; portalMat: THREE.ShaderMaterial;
  lightA: LightSlot; lightB: LightSlot;
  tick: number; t: number;
  /** the beam is out (the portal finished opening) */
  firing: boolean;
  stopHum?: () => void;
  /** where the beam runs this frame, and what takes its pull on the fallen away */
  beam: Beam;
  calm: () => void;
  /** the foes that have seen it coming (each judged once a channel: entities/evade.ts) */
  judged: Set<Enemy>;
}

/** The beam as the fallen meet it: from (x, y, z) along (dx, dz), this long and wide (m), while it's out. */
interface Beam { on: boolean; x: number; y: number; z: number; dx: number; dz: number; len: number; w: number }

/** the fallen in the beam carried along it this fast (m/s), gripped this hard (/s), with this much of their weight
 *  borne, as far as this beyond its width and above it (m): they drift down it and drop off its end */
const CARRY = 5, CARRY_GRIP = 3, BEAR = 0.85, BEAM_REACH = 0.4, BEAM_ABOVE = 1.2;

/** The beam's pull on the fallen in it. */
function carry(beam: Beam): Field {
  return {
    accel(p, v, out) {
      if (!beam.on) return false;
      const ox = p.x - beam.x, oz = p.z - beam.z, along = ox * beam.dx + oz * beam.dz;
      if (along < 0 || along > beam.len || p.y > beam.y + BEAM_ABOVE) return false;
      if (Math.abs(ox * beam.dz - oz * beam.dx) > beam.w * 0.5 + BEAM_REACH) return false;
      const push = (CARRY - (v.x * beam.dx + v.z * beam.dz)) * CARRY_GRIP;
      out.x += beam.dx * push;
      out.z += beam.dz * push;
      out.y += GRAVITY * BEAR - v.y * CARRY_GRIP * 0.5;
      return true;
    },
  };
}

const COLOR = new THREE.Color(0x5dffa8);
const TICK = 0.12;
/** the portal's radius once open (m); it opens from a spark to this, and shrinks a little while the beam pours out */
const PORTAL_R = 0.72;
/** seen through the eyes, a hand's length from the camera: its share of the full size */
const EYES_R = 0.45;

const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true).translate(0, 0.5, 0);
/** the portal's quad spans -1..1; its rim sits at RIM of that */
const portalGeo = new THREE.PlaneGeometry(2, 2);
const RIM = 0.85;

function beamMaterial(core: boolean): THREE.ShaderMaterial {
  return portShader(nearGlow(new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uLen: { value: 10 }, uColor: { value: COLOR.clone() }, uCore: { value: core ? 1 : 0 }, uFade: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      varying vec2 vUv; varying float vFres;
      void main(){
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vec3 n = normalize(normalMatrix * normal);
        // how far across the tube this point is, seen from the camera: the view direction flattened onto
        // the tube's cross-section, so a beam seen along its length (the close views) keeps its bright
        // middle instead of reading as all edge and fading away
        vec3 axis = normalize(normalMatrix * vec3(0.0, 1.0, 0.0));
        vec3 v = normalize(-mv.xyz);
        vec3 across = v - axis * dot(v, axis);
        float l = length(across);
        vFres = l > 1e-3 ? abs(dot(n, across / l)) : 1.0;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv; varying float vFres;
      uniform float uTime, uLen, uCore, uFade; uniform vec3 uColor;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){
        float along = vUv.y * uLen;
        float flow = n(vec2(vUv.x * 10.0, along * 1.4 - uTime * 14.0)) * 0.6 + n(vec2(vUv.x * 22.0, along * 3.0 - uTime * 22.0)) * 0.4;
        float ends = smoothstep(0.0, 0.03, vUv.y) * (1.0 - smoothstep(0.9, 1.0, vUv.y));
        float body = pow(vFres, uCore > 0.5 ? 2.5 : 1.2);
        // not far over bloom's threshold: seen low along its length (the lobby) the beam covers much of the
        // screen, and a hotter one blooms into a green haze over the ground round it
        vec3 c = uCore > 0.5 ? mix(uColor, vec3(1.0), 0.7) * 1.6 : uColor * (0.35 + flow * 1.1);
        float a = body * ends * (uCore > 0.5 ? 1.0 : (0.35 + flow * 0.65)) * uFade;
        gl_FragColor = vec4(c * a, a);
      }`,
  })), ({ wgslFn, uv, varying, normalView, positionViewDirection, modelViewMatrix, vec4 }, u) => {
    const { noise2 } = wgslNoise();
    const fres = wgslFn(`fn lanceFres(n: vec3f, v: vec3f, axis: vec3f) -> f32 {
      let across = v - axis * dot(v, axis);
      let l = length(across);
      if (l > 1e-3) { return abs(dot(normalize(n), across / l)); }
      return 1.0;
    }`);
    const axis = modelViewMatrix.mul(vec4(0, 1, 0, 0)).xyz.normalize();
    return {
      fragment: wgslFn(`fn lanceBeam(uv: vec2f, fres: f32, time: f32, len: f32, color: vec3f, core: f32,
        fade: f32) -> vec4f {
        let along = uv.y * len;
        let flow = noise2(vec2f(uv.x * 10.0, along * 1.4 - time * 14.0)) * 0.6
          + noise2(vec2f(uv.x * 22.0, along * 3.0 - time * 22.0)) * 0.4;
        let ends = smoothstep(0.0, 0.03, uv.y) * (1.0 - smoothstep(0.9, 1.0, uv.y));
        let body = pow(fres, select(1.2, 2.5, core > 0.5));
        let c = select(color * (0.35 + flow * 1.1), mix(color, vec3f(1.0), 0.7) * 1.6, core > 0.5);
        let a = body * ends * select(0.35 + flow * 0.65, 1.0, core > 0.5) * fade;
        return vec4f(c * a, a);
      }`, [noise2])({
        uv: uv(), fres: varying(fres({ n: normalView, v: positionViewDirection, axis })), time: u.uTime,
        len: u.uLen, color: u.uColor, core: u.uCore, fade: u.uFade,
      }),
    };
  });
}

/**
 * The portal, in the quad's -1..1 space: a crackling rim of sparks that a bright head traces round
 * (uOpen 0..0.7), then two rune rings turning against each other, spokes and a slow swirl inside
 * fading in (0.4..1). Added light, no depth write.
 */
function portalMaterial(): THREE.ShaderMaterial {
  return portShader(nearGlow(new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOpen: { value: 0 }, uFade: { value: 1 }, uColor: { value: COLOR.clone() } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */`varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      varying vec2 vP; uniform float uTime, uOpen, uFade; uniform vec3 uColor;
      const float TAU = 6.2831853, R = ${RIM.toFixed(2)};
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){
        float r = length(vP);
        if (r > 1.0) discard;
        // angle from the top, running clockwise the way the head traces it (atan's (0, 0) is undefined)
        float a = r < 1e-4 ? 0.0 : atan(vP.x, vP.y);
        float u = fract(a / TAU + 1.0);
        float trace = clamp(uOpen / 0.7, 0.0, 1.0);
        // how far behind the tracing head this angle is (0 at the head)
        float behind = trace - u;
        float drawn = trace >= 1.0 ? 1.0 : step(0.0, behind);
        float head = trace >= 1.0 ? 0.0 : exp(-max(behind, 0.0) * 18.0) * drawn;
        // the rim: a thin crackling band of sparks turning round
        float crackle = n(vec2(u * 90.0 - uTime * 30.0, uTime * 9.0)) * 0.7 + n(vec2(u * 260.0 + uTime * 55.0, 3.0)) * 0.6;
        float band = exp(-pow((r - R) / (0.018 + 0.02 * crackle), 2.0));
        float halo = exp(-pow((r - R) / 0.09, 2.0)) * 0.25;
        float rim = (band * (0.6 + crackle) + halo) * drawn + head * (exp(-pow((r - R) / 0.06, 2.0)) * 3.0);
        // rune rings, turning against each other: broken bands of ticks
        float k2 = smoothstep(0.4, 1.0, uOpen);
        // (glyph ticks of uneven length: each cell's own height)
        float cell1 = floor(u * 48.0 + uTime * 0.8), len1 = 0.012 + 0.03 * h(vec2(cell1, 1.0));
        float ring1 = smoothstep(0.008, 0.0, abs(r - 0.72 * R) - len1);
        float ticks1 = step(0.72, fract(u * 48.0 + uTime * 0.8)) * step(0.15, fract(u * 6.0 + uTime * 0.13));
        float ring2 = smoothstep(0.008, 0.0, abs(r - 0.56 * R) - 0.014);
        float ticks2 = step(0.62, fract(u * 30.0 - uTime * 0.9));
        float lines = smoothstep(0.01, 0.0, abs(r - 0.8 * R) - 0.004) + smoothstep(0.01, 0.0, abs(r - 0.64 * R) - 0.003);
        // spokes, a squared-off star turning slowly between the rings
        float spokes = exp(-abs(sin((a + uTime * 0.25) * 4.0)) * 30.0) * step(0.3 * R, r) * step(r, 0.56 * R);
        float runes = (ring1 * ticks1 + ring2 * ticks2 * 0.8 + lines * 0.6 + spokes * 0.5) * k2;
        // the portal itself: a slow swirl, brightest at the middle once open
        float sw = n(vec2(u * 6.0 + r * 5.0 - uTime * 1.5, r * 7.0 - uTime * 2.0));
        // (faint: over the shoulder the view looks through it)
        float inner = (sw * sw * 0.08 + exp(-r * r * 60.0) * 0.45) * k2 * smoothstep(R, 0.3, r);
        vec3 spark = mix(uColor, vec3(1.0, 0.98, 0.85), 0.55);
        vec3 c = spark * rim * 2.2 + uColor * runes * 2.6 + uColor * inner * 1.4;
        gl_FragColor = vec4(c * uFade, 1.0);
      }`,
  })), ({ wgslFn, positionGeometry, varying }, u) => {
    const { hash2, noise2 } = wgslNoise();
    // (smoothstep's edges the right way round: falling ones as 1 - the rising, WGSL leaves them undefined)
    return {
      fragment: wgslFn(`fn lancePortal(p: vec2f, time: f32, open: f32, fade: f32, color: vec3f) -> vec4f {
        let TAU = 6.2831853;
        let R = ${RIM.toFixed(2)};
        let r = length(p);
        if (r > 1.0) { discard; }
        var a = 0.0;
        if (r >= 1e-4) { a = atan2(p.x, p.y); }
        let u = fract(a / TAU + 1.0);
        let trace = clamp(open / 0.7, 0.0, 1.0);
        let behind = trace - u;
        let drawn = select(step(0.0, behind), 1.0, trace >= 1.0);
        let head = select(exp(-max(behind, 0.0) * 18.0) * drawn, 0.0, trace >= 1.0);
        let crackle = noise2(vec2f(u * 90.0 - time * 30.0, time * 9.0)) * 0.7
          + noise2(vec2f(u * 260.0 + time * 55.0, 3.0)) * 0.6;
        let d1 = (r - R) / (0.018 + 0.02 * crackle);
        let d2 = (r - R) / 0.09;
        let d3 = (r - R) / 0.06;
        let band = exp(-d1 * d1);
        let halo = exp(-d2 * d2) * 0.25;
        let rim = (band * (0.6 + crackle) + halo) * drawn + head * (exp(-d3 * d3) * 3.0);
        let k2 = smoothstep(0.4, 1.0, open);
        let cell1 = floor(u * 48.0 + time * 0.8);
        let len1 = 0.012 + 0.03 * hash2(vec2f(cell1, 1.0));
        let ring1 = 1.0 - smoothstep(0.0, 0.008, abs(r - 0.72 * R) - len1);
        let ticks1 = step(0.72, fract(u * 48.0 + time * 0.8)) * step(0.15, fract(u * 6.0 + time * 0.13));
        let ring2 = 1.0 - smoothstep(0.0, 0.008, abs(r - 0.56 * R) - 0.014);
        let ticks2 = step(0.62, fract(u * 30.0 - time * 0.9));
        let lines = (1.0 - smoothstep(0.0, 0.01, abs(r - 0.8 * R) - 0.004))
          + (1.0 - smoothstep(0.0, 0.01, abs(r - 0.64 * R) - 0.003));
        let spokes = exp(-abs(sin((a + time * 0.25) * 4.0)) * 30.0) * step(0.3 * R, r) * step(r, 0.56 * R);
        let runes = (ring1 * ticks1 + ring2 * ticks2 * 0.8 + lines * 0.6 + spokes * 0.5) * k2;
        let sw = noise2(vec2f(u * 6.0 + r * 5.0 - time * 1.5, r * 7.0 - time * 2.0));
        let inner = (sw * sw * 0.08 + exp(-r * r * 60.0) * 0.45) * k2 * (1.0 - smoothstep(0.3, R, r));
        let spark = mix(color, vec3f(1.0, 0.98, 0.85), 0.55);
        let c = spark * rim * 2.2 + color * runes * 2.6 + color * inner * 1.4;
        return vec4f(c * fade, 1.0);
      }`, [hash2, noise2])({
        p: varying(positionGeometry.xy), time: u.uTime, open: u.uOpen, fade: u.uFade, color: u.uColor,
      }),
    };
  });
}

const _dir = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _end = new THREE.Vector3(), _c = new THREE.Vector3();
const _u = new THREE.Vector3(), _v = new THREE.Vector3(), _n = new THREE.Vector3(), _m = new THREE.Matrix4();
const easeOutBack = (k: number) => 1 + 2.2 * (k - 1) ** 3 + 1.2 * (k - 1) ** 2;

const skill: ChannelSkill<LanceState> = {
  anim: 'channel',
  hits: (def) => [{ per: 'tick', base: (def.damage ?? 0) * TICK, rate: 1 / TICK, type: 'arcane' }],
  channel: true,
  warm: () => [new THREE.Mesh(beamGeo, beamMaterial(false)), new THREE.Mesh(portalGeo, portalMaterial())],
  start(_player, rawDef) {
    const outerMat = beamMaterial(false), coreMat = beamMaterial(true), portalMat = portalMaterial();
    const outer = new THREE.Mesh(beamGeo, outerMat), core = new THREE.Mesh(beamGeo, coreMat), portal = new THREE.Mesh(portalGeo, portalMat);
    outer.frustumCulled = core.frustumCulled = portal.frustumCulled = false;
    outer.visible = core.visible = false;
    G.scene.add(outer, core, portal);
    const opens = rawDef.opening ?? 0;
    if (opens > 0) sfx.charge(opens);
    const beam: Beam = { on: false, x: 0, y: 0, z: 0, dx: 0, dz: 1, len: 0, w: 0 };
    return {
      outer, core, portal, outerMat, coreMat, portalMat, tick: 0, t: 0, firing: false, beam, calm: addField(carry(beam)), judged: new Set(),
      // a glow at the hand and a pool where it hits, a few metres across: green light washed over a wide
      // circle of ground reads as a haze round the whole cast
      lightA: flash({ color: 0x5dffa8, intensity: 2, distance: 4, life: 1, hold: 999 }),
      lightB: flash({ color: 0x5dffa8, intensity: 0, distance: 4.5, life: 1, hold: 999 }),
    };
  },

  tick(player, rawDef, dt, st) {
    const def = rawDef as Def;
    st.t += dt;
    const opens = def.opening ?? 0;
    const open = opens > 0 ? Math.min(1, st.t / opens) : 1;

    const hand = player.palmPoint;
    _dir.set(player.aim.x - player.pos.x, 0, player.aim.z - player.pos.z);
    if (_dir.lengthSq() < 1e-4) _dir.set(Math.sin(player.facing), 0, Math.cos(player.facing));
    _dir.normalize();
    // the portal hangs in front of the chest, where the free hand pushes into it; seen through the
    // eyes, a smaller one just ahead of the hand in view (full size, it would fill the view)
    const eyes = player.eyes;
    if (eyes) _c.copy(hand).addScaledVector(_dir, 0.45);
    else _c.set(player.pos.x + _dir.x * 0.85, 1.7, player.pos.z + _dir.z * 0.85);
    const origin = _c;

    // the portal stands upright across the beam
    _u.set(-_dir.z, 0, _dir.x);
    _n.copy(_dir).negate();
    _v.crossVectors(_n, _u);
    st.portal.quaternion.setFromRotationMatrix(_m.makeBasis(_u, _v, _n));
    st.portal.position.copy(origin);
    const radius = PORTAL_R * (eyes ? EYES_R : 1) * (0.2 + 0.8 * easeOutBack(open)) * (st.firing ? 0.9 + Math.sin(st.t * 9) * 0.03 : 1);
    st.portal.scale.setScalar(radius / RIM);
    st.portalMat.uniforms.uTime.value = G.time;
    st.portalMat.uniforms.uOpen.value = open;
    st.lightA.light.position.copy(origin);
    st.lightA.peak = 2 + 5 * open;

    if (!st.firing) {
      // sparks thrown off the tracing head, falling away
      const trace = Math.min(1, open / 0.7);
      const n = trace < 1 ? 5 : 2;
      for (let i = 0; i < n; i++) {
        const ang = (trace < 1 ? trace : Math.random()) * Math.PI * 2 + rand(-0.08, 0.02);
        const s = Math.sin(ang), c = Math.cos(ang), r = radius;
        particles.glow.spawn({
          x: origin.x + (_u.x * s + _v.x * c) * r, y: origin.y + _v.y * c * r, z: origin.z + (_u.z * s + _v.z * c) * r,
          // along the circle (clockwise from the top) and a little outwards
          vx: _u.x * (c * 3 + s * 1.2) + _v.x * (c * 1.2 - s * 3) + rand(-0.6, 0.6), vy: _v.y * (c * 1.2 - s * 3) + rand(0, 1.5),
          vz: _u.z * (c * 3 + s * 1.2) + _v.z * (c * 1.2 - s * 3) + rand(-0.6, 0.6),
          life: rand(0.25, 0.5), size: rand(0.05, 0.11), sizeEnd: 0, color: col(0xeaffd8, 3), colorEnd: col(0x5dffa8, 0.6), drag: 2, gravity: 7,
        });
      }
      if (open < 1) return;
      // open: the lance bursts out of the portal
      st.firing = true;
      st.outer.visible = st.core.visible = true;
      st.stopHum = sfx.lance();
      burst(origin, { count: 18, color: 0x5dffa8, speed: 5, life: 0.35, size: 0.22, gravity: 2 });
      st.lightB.peak = 10;
    }
    const ft = st.t - opens;

    // beam stops at obstacles that reach up to it (not enemies: it pierces)
    let len = def.length, blocker: Obstacle | null = null;
    for (const o of G.arena.obstacles) {
      if (o.h <= origin.y) continue;
      const ox = o.x - origin.x, oz = o.z - origin.z;
      const proj = ox * _dir.x + oz * _dir.z;
      if (proj <= 0 || proj > len) continue;
      const perp = Math.abs(ox * _dir.z - oz * _dir.x);
      if (perp < o.r) { const l = proj - Math.sqrt(o.r * o.r - perp * perp); if (l < len) { len = l; blocker = o; } }
    }
    // focused fire wears down what stops it
    if (blocker && st.firing) hurtProp(blocker, PROP_DAMAGE.beam * dt);
    const edge = G.arena.radius + 1;
    for (let k = 0; k < 20 && Math.hypot(origin.x + _dir.x * len, origin.z + _dir.z * len) > edge; k++) len *= 0.95;

    const fadeIn = Math.min(1, ft / 0.12);
    // it bursts out wide and settles
    const w = def.width * (0.9 + Math.sin(st.t * 30) * 0.08) * (1 + 0.5 * Math.max(0, 1 - ft / 0.25));
    // top-down the glow's radius is the width the lance hits (half of it): a wider soft tube reads as a haze
    // round it from above. Up close the beam is seen along its length, where that thin a glow is barely a line
    const glow = player.local && viewMode() !== 'top' ? 1 : 0.5;
    for (const [m, mat, scale] of [[st.outer, st.outerMat, w * glow], [st.core, st.coreMat, w * 0.36 * glow]] as const) {
      m.position.copy(origin);
      m.quaternion.setFromUnitVectors(_up, _dir);
      m.scale.set(scale, len, scale);
      mat.uniforms.uTime.value = G.time;
      mat.uniforms.uLen.value = len;
      mat.uniforms.uFade.value = fadeIn;
    }
    _end.copy(origin).addScaledVector(_dir, len);
    Object.assign(st.beam, { on: true, x: origin.x, y: origin.y, z: origin.z, dx: _dir.x, dz: _dir.z, len, w });
    st.lightB.light.position.copy(_end);

    // sparks streaming along the beam: few and small, since a dense stream of soft particles smears
    // into a haze round it
    for (let i = 0; i < 2; i++) {
      const d = Math.random() * len;
      const a = Math.random() * Math.PI * 2;
      particles.glow.spawn({
        // offset on the ring around the beam axis (perpendicular = (-dir.z, dir.x))
        x: origin.x + _dir.x * d - _dir.z * Math.cos(a) * w * 0.5, y: origin.y + Math.sin(a) * w * 0.5, z: origin.z + _dir.z * d + _dir.x * Math.cos(a) * w * 0.5,
        vx: _dir.x * 6 + rand(-1, 1), vy: rand(-0.5, 1), vz: _dir.z * 6 + rand(-1, 1),
        life: 0.3, size: rand(0.04, 0.09), sizeEnd: 0, color: col(0x5dffa8, 3), colorEnd: col(0x2050ff, 0.5), drag: 4,
      });
    }
    burst(_end, { count: 2, color: 0x5dffa8, speed: 3, life: 0.3, size: 0.3, gravity: 3 });

    // damage ticks
    st.tick += dt;
    if (st.tick >= TICK) {
      st.tick -= TICK;
      for (const e of G.enemies) {
        if (!e.alive) continue;
        const ex = e.pos.x - origin.x, ez = e.pos.z - origin.z;
        const proj = ex * _dir.x + ez * _dir.z;
        if (proj < 0 || proj > len + e.radius) continue;
        if (Math.abs(ex * _dir.z - ez * _dir.x) < w * 0.5 + e.radius) {
          // (over a ducked foe; and one that sees it coming may blink out of its way)
          if (origin.y > (e.duckedTop ?? Infinity)) continue;
          const threat = { kind: 'beam', x: origin.x, z: origin.z, way: _dir, half: w * 0.5 } as const;
          if (!st.judged.has(e) && st.judged.add(e) && evades(e, player, threat)) continue;
          // (the beam through it where it passes: off its middle, the body turns off the beam)
          const on = { x: origin.x + _dir.x * proj, z: origin.z + _dir.z * proj };
          const blow = { dir: { x: _dir.x, z: _dir.z }, lift: 0.15, on };
          hitEnemy(e, def.damage * TICK, { by: player, skill: def, tags: def.tags, type: 'arcane', knock: 0.6, from: origin, blow });
          burst(new THREE.Vector3(e.pos.x, 1.1, e.pos.z), { count: 4, color: 0x5dffa8, speed: 3, life: 0.3, size: 0.25 });
        }
      }
    }
  },

  stop(_player, _def, st) {
    st.calm();
    G.scene.remove(st.outer, st.core, st.portal);
    st.outerMat.dispose(); st.coreMat.dispose(); st.portalMat.dispose();
    release(st.lightA); release(st.lightB);
    st.stopHum?.();
  },
};

export default skill;
